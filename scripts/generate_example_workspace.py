#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Mapping, Optional, Sequence, Union

DEFAULT_WORKSPACE_ID = "wsp_example"
DEFAULT_PRESET = "small"
SCHEMA_VERSION = "example-workspace.v1"
BASE_TIME = datetime(2026, 4, 27, 9, 0, tzinfo=timezone.utc)

WORKSPACE_ID_RE = re.compile(r"^wsp_[A-Za-z0-9_-]{1,88}$")
RECORD_ID_RE = re.compile(r"^[A-Za-z]+_[A-Za-z0-9_-]{1,88}$")
TARGET_ID_RE = re.compile(r"^(doc|prj|inc|cmt|att|apv|obj|task)_[A-Za-z0-9_-]{1,88}$")

ACTORS = {
    "owner": "act_owner",
    "reviewer": "act_reviewer",
    "agent": "act_local_agent",
}

DOC_TEMPLATES = (
    {
        "title": "Cedar Mug Launch Notes",
        "body": (
            "Packaging notes for a ceramic mug run.\n"
            "- Confirm label copy for the matte finish.\n"
            "- Keep source files in the local workspace.\n"
            "- Review carton dimensions before the next sample order."
        ),
        "status": "active",
        "risk": "low",
    },
    {
        "title": "Lumen Desk Lamp Care Sheet",
        "body": (
            "Draft care steps for the desk lamp insert.\n"
            "- Use dry-cloth cleaning guidance.\n"
            "- Include bulb replacement notes.\n"
            "- Link the care image set after review."
        ),
        "status": "review",
        "risk": "medium",
    },
    {
        "title": "Harbor Tote Batch Summary",
        "body": (
            "Summary for canvas tote sample tracking.\n"
            "- Record fabric color names from the approved swatch list.\n"
            "- Check handle measurements against the product card.\n"
            "- Keep batch notes short enough for the printed insert."
        ),
        "status": "draft",
        "risk": "low",
    },
    {
        "title": "Maple Shelf Assembly Card",
        "body": (
            "Assembly card draft for a small maple shelf kit.\n"
            "- Verify screw count in each packed kit.\n"
            "- Add a single-page diagram reference.\n"
            "- Mark the card ready after photo review."
        ),
        "status": "review",
        "risk": "medium",
    },
)

TASK_TEMPLATES = (
    {
        "title": "Check ceramic mug label copy",
        "notes": "Compare label copy against the latest launch notes.",
        "status": "todo",
        "tags": ("copy", "packaging"),
    },
    {
        "title": "Attach lamp care photo set",
        "notes": "Add the reviewed care photos to the product folder.",
        "status": "in_progress",
        "tags": ("media", "care"),
    },
    {
        "title": "Recount tote sample stock",
        "notes": "Confirm the tote count after the local import.",
        "status": "done",
        "tags": ("inventory", "samples"),
    },
    {
        "title": "Archive old shelf diagram",
        "notes": "Move the earlier shelf diagram out of the active draft set.",
        "status": "archived",
        "tags": ("assembly", "cleanup"),
    },
)

INCIDENT_TEMPLATES = (
    {
        "title": "Label draft mismatch",
        "summary": "The ceramic mug label draft used an older finish name.",
        "status": "triaged",
        "risk": "medium",
    },
    {
        "title": "Photo export missing alt text",
        "summary": "A lamp care image export lacked an accessibility note.",
        "status": "open",
        "risk": "low",
    },
    {
        "title": "Inventory count drift",
        "summary": "The tote sample count differed by two units after a local import.",
        "status": "resolved",
        "risk": "medium",
    },
)

APPROVAL_TEMPLATES = (
    {
        "summary": "Approve mug launch notes for the product team.",
        "status": "requested",
        "risk": "medium",
    },
    {
        "summary": "Approve lamp care sheet before team sharing.",
        "status": "approved",
        "risk": "low",
    },
    {
        "summary": "Cancel shelf card review until the diagram is updated.",
        "status": "cancelled",
        "risk": "low",
    },
)

AUDIT_TEMPLATES = (
    {
        "action": "doc.created",
        "decision": "allow",
        "actorId": ACTORS["owner"],
        "summary": "Created product notes in the local workspace.",
        "redactedPaths": (),
    },
    {
        "action": "task.updated",
        "decision": "allow",
        "actorId": ACTORS["agent"],
        "summary": "Updated task status after a checklist pass.",
        "redactedPaths": (),
    },
    {
        "action": "approval.requested",
        "decision": "require_approval",
        "actorId": ACTORS["agent"],
        "summary": "Queued a review step for product content.",
        "redactedPaths": ("records.approvals.notes",),
    },
    {
        "action": "incident.triaged",
        "decision": "allow",
        "actorId": ACTORS["reviewer"],
        "summary": "Marked a product issue ready for follow-up.",
        "redactedPaths": (),
    },
)


@dataclass(frozen=True)
class RecordCounts:
    docs: int
    tasks: int
    incidents: int
    approvals: int
    audit: int

    def as_dict(self) -> dict[str, int]:
        return {
            "docs": self.docs,
            "tasks": self.tasks,
            "incidents": self.incidents,
            "approvals": self.approvals,
            "audit": self.audit,
        }

    @property
    def total(self) -> int:
        return self.docs + self.tasks + self.incidents + self.approvals + self.audit


PRESET_COUNTS = {
    "tiny": RecordCounts(docs=1, tasks=1, incidents=1, approvals=1, audit=2),
    "small": RecordCounts(docs=3, tasks=4, incidents=2, approvals=2, audit=6),
    "standard": RecordCounts(docs=5, tasks=7, incidents=3, approvals=4, audit=10),
}


def resolve_record_counts(preset: str) -> RecordCounts:
    try:
        return PRESET_COUNTS[preset]
    except KeyError as exc:
        choices = ", ".join(sorted(PRESET_COUNTS))
        raise ValueError(f"unknown preset {preset!r}; choose one of: {choices}") from exc


def generate_workspace(workspace_id: str) -> dict[str, Any]:
    validate_workspace_id(workspace_id)
    return {
        "id": workspace_id,
        "displayName": "Cedar Studio Example",
        "description": "Fictional local-product workspace for sample content and review flows.",
        "projectId": project_id_for_workspace(workspace_id),
        "actors": [
            {"id": ACTORS["owner"], "name": "Ari Chen", "role": "workspace owner"},
            {"id": ACTORS["reviewer"], "name": "Mina Patel", "role": "content reviewer"},
            {"id": ACTORS["agent"], "name": "Local Assist", "role": "scoped assistant"},
        ],
    }


def generate_docs(workspace_id: str, count: int) -> list[dict[str, Any]]:
    validate_workspace_id(workspace_id)
    validate_count(count, "docs")
    project_id = project_id_for_workspace(workspace_id)
    docs: list[dict[str, Any]] = []
    for index in range(1, count + 1):
        template = cycle_template(DOC_TEMPLATES, index)
        created_at = timestamp_for(index, minutes_step=11)
        docs.append(
            {
                "id": record_id("doc", workspace_id, index),
                "workspaceId": workspace_id,
                "projectId": project_id,
                "title": numbered_text(template["title"], index, DOC_TEMPLATES),
                "body": template["body"],
                "status": template["status"],
                "risk": template["risk"],
                "ownerActorId": ACTORS["owner"],
                "createdAt": created_at,
                "updatedAt": timestamp_for(index, minutes_step=11, offset_minutes=4),
            }
        )
    return docs


def generate_tasks(workspace_id: str, count: int) -> list[dict[str, Any]]:
    validate_workspace_id(workspace_id)
    validate_count(count, "tasks")
    tasks: list[dict[str, Any]] = []
    for index in range(1, count + 1):
        template = cycle_template(TASK_TEMPLATES, index)
        created_at = timestamp_for(index, minutes_step=7, offset_minutes=2)
        status = str(template["status"])
        completed_at = (
            timestamp_for(index, minutes_step=7, offset_minutes=6) if status == "done" else None
        )
        archived_at = (
            timestamp_for(index, minutes_step=7, offset_minutes=6) if status == "archived" else None
        )
        tasks.append(
            {
                "kind": "task",
                "id": record_id("task", workspace_id, index),
                "workspaceId": workspace_id,
                "title": numbered_text(template["title"], index, TASK_TEMPLATES),
                "notes": template["notes"],
                "status": status,
                "tags": list(template["tags"]),
                "ownerActorId": ACTORS["owner"],
                "createdAt": created_at,
                "updatedAt": timestamp_for(index, minutes_step=7, offset_minutes=5),
                "completedAt": completed_at,
                "archivedAt": archived_at,
            }
        )
    return tasks


def generate_incidents(workspace_id: str, count: int) -> list[dict[str, Any]]:
    validate_workspace_id(workspace_id)
    validate_count(count, "incidents")
    project_id = project_id_for_workspace(workspace_id)
    incidents: list[dict[str, Any]] = []
    for index in range(1, count + 1):
        template = cycle_template(INCIDENT_TEMPLATES, index)
        incidents.append(
            {
                "id": record_id("inc", workspace_id, index),
                "workspaceId": workspace_id,
                "projectId": project_id,
                "title": numbered_text(template["title"], index, INCIDENT_TEMPLATES),
                "summary": template["summary"],
                "status": template["status"],
                "risk": template["risk"],
                "reportedByActorId": ACTORS["reviewer"],
                "createdAt": timestamp_for(index, minutes_step=13, offset_minutes=3),
                "updatedAt": timestamp_for(index, minutes_step=13, offset_minutes=9),
            }
        )
    return incidents


def generate_approvals(
    workspace_id: str,
    count: int,
    target_ids: Sequence[str],
) -> list[dict[str, Any]]:
    validate_workspace_id(workspace_id)
    validate_count(count, "approvals")
    if count > 0 and not target_ids:
        raise ValueError("approvals require at least one target id")
    for target_id in target_ids:
        validate_target_id(target_id)

    approvals: list[dict[str, Any]] = []
    for index in range(1, count + 1):
        template = cycle_template(APPROVAL_TEMPLATES, index)
        status = str(template["status"])
        approval: dict[str, Any] = {
            "id": record_id("apv", workspace_id, index),
            "workspaceId": workspace_id,
            "targetId": target_ids[(index - 1) % len(target_ids)],
            "summary": template["summary"],
            "status": status,
            "risk": template["risk"],
            "requestedByActorId": ACTORS["agent"],
            "createdAt": timestamp_for(index, minutes_step=17, offset_minutes=5),
            "updatedAt": timestamp_for(index, minutes_step=17, offset_minutes=8),
        }
        if status in {"approved", "rejected"}:
            approval["approverActorId"] = ACTORS["reviewer"]
        approvals.append(approval)
    return approvals


def generate_audit_records(
    workspace_id: str,
    count: int,
    target_ids: Sequence[str],
) -> list[dict[str, Any]]:
    validate_workspace_id(workspace_id)
    validate_count(count, "audit")
    if count > 0 and not target_ids:
        raise ValueError("audit records require at least one target id")
    for target_id in target_ids:
        validate_target_id(target_id)

    audit: list[dict[str, Any]] = []
    for index in range(1, count + 1):
        template = cycle_template(AUDIT_TEMPLATES, index)
        audit.append(
            {
                "id": record_id("aud", workspace_id, index),
                "workspaceId": workspace_id,
                "targetId": target_ids[(index - 1) % len(target_ids)],
                "actorId": template["actorId"],
                "action": template["action"],
                "decision": template["decision"],
                "summary": template["summary"],
                "redactedPaths": list(template["redactedPaths"]),
                "recordedAt": timestamp_for(index, minutes_step=5, offset_minutes=1),
            }
        )
    return audit


def generate_bundle_metadata(
    workspace_id: str,
    preset: str,
    records: Mapping[str, Sequence[Mapping[str, Any]]],
    output_path_preview: Optional[str] = None,
) -> dict[str, Any]:
    validate_workspace_id(workspace_id)
    counts = {
        kind: len(records.get(kind, ()))
        for kind in ("docs", "tasks", "incidents", "approvals", "audit")
    }
    metadata: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "workspaceId": workspace_id,
        "generatedAt": BASE_TIME.isoformat().replace("+00:00", "Z"),
        "preset": preset,
        "counts": counts,
        "recordTotal": sum(counts.values()),
        "generator": "scripts/generate_example_workspace.py",
        "writeFiles": False,
    }
    if output_path_preview:
        metadata["outputPathPreview"] = output_path_preview
    return metadata


def generate_example_workspace(
    workspace_id: str = DEFAULT_WORKSPACE_ID,
    preset: str = DEFAULT_PRESET,
    output_path_preview: Optional[Union[str, Path]] = None,
) -> dict[str, Any]:
    counts = resolve_record_counts(preset)
    return generate_example_workspace_with_counts(
        workspace_id=workspace_id,
        counts=counts,
        preset=preset,
        output_path_preview=output_path_preview,
    )


def generate_example_workspace_with_counts(
    workspace_id: str,
    counts: RecordCounts,
    preset: str = "custom",
    output_path_preview: Optional[Union[str, Path]] = None,
) -> dict[str, Any]:
    validate_workspace_id(workspace_id)
    validate_counts(counts)

    docs = generate_docs(workspace_id, counts.docs)
    tasks = generate_tasks(workspace_id, counts.tasks)
    incidents = generate_incidents(workspace_id, counts.incidents)
    target_ids = [record["id"] for record in docs] + [record["id"] for record in tasks] + [
        record["id"] for record in incidents
    ]
    approvals = generate_approvals(workspace_id, counts.approvals, target_ids)
    audit_targets = target_ids + [record["id"] for record in approvals]
    audit = generate_audit_records(workspace_id, counts.audit, audit_targets)

    records = {
        "docs": docs,
        "tasks": tasks,
        "incidents": incidents,
        "approvals": approvals,
        "audit": audit,
    }
    output_preview = str(output_path_preview) if output_path_preview else None
    return {
        "metadata": generate_bundle_metadata(workspace_id, preset, records, output_preview),
        "workspace": generate_workspace(workspace_id),
        "records": records,
    }


def write_bundle(bundle: Mapping[str, Any], output_path: Union[str, Path]) -> Path:
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(bundle, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


def render_preview(bundle: Mapping[str, Any]) -> str:
    metadata = bundle["metadata"]
    counts = metadata["counts"]
    lines = [
        "Example workspace preview",
        f"workspace_id: {metadata['workspaceId']}",
        f"preset: {metadata['preset']}",
        f"schema_version: {metadata['schemaVersion']}",
        f"output_path_preview: {metadata.get('outputPathPreview', '(none)')}",
        "record_counts:",
    ]
    lines.extend(
        f"  {kind}: {counts[kind]}"
        for kind in ("docs", "tasks", "incidents", "approvals", "audit")
    )
    lines.extend(
        [
            f"record_total: {metadata['recordTotal']}",
            "write_files: false",
            "No files were written.",
        ]
    )
    return "\n".join(lines) + "\n"


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Generate a deterministic example workspace preview."
    )
    parser.add_argument(
        "--workspace-id",
        default=DEFAULT_WORKSPACE_ID,
        help="Workspace id such as wsp_example.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Preview an output path in the bundle metadata; the CLI does not write it.",
    )
    parser.add_argument(
        "--preset",
        default=DEFAULT_PRESET,
        choices=sorted(PRESET_COUNTS),
        help="Record count preset.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print the generated bundle as JSON to stdout.",
    )
    args = parser.parse_args(argv)

    try:
        bundle = generate_example_workspace(
            workspace_id=args.workspace_id,
            preset=args.preset,
            output_path_preview=args.output,
        )
    except ValueError as exc:
        raise SystemExit(f"example workspace error: {exc}") from exc

    if args.json:
        print(json.dumps(bundle, indent=2, sort_keys=True))
    else:
        print(render_preview(bundle), end="")
    return 0


def validate_workspace_id(workspace_id: str) -> None:
    if not WORKSPACE_ID_RE.match(workspace_id):
        raise ValueError("workspace id must match wsp_[A-Za-z0-9_-]{1,88}")


def validate_target_id(target_id: str) -> None:
    if not TARGET_ID_RE.match(target_id):
        raise ValueError(f"target id is not supported: {target_id}")


def validate_count(count: int, name: str) -> None:
    if not isinstance(count, int) or count < 0:
        raise ValueError(f"{name} count must be a non-negative integer")


def validate_counts(counts: RecordCounts) -> None:
    for name, count in counts.as_dict().items():
        validate_count(count, name)
    if counts.approvals > 0 and counts.docs + counts.tasks + counts.incidents == 0:
        raise ValueError("approval records require docs, tasks, or incidents")
    if counts.audit > 0 and counts.total - counts.audit == 0:
        raise ValueError("audit records require at least one non-audit record")


def project_id_for_workspace(workspace_id: str) -> str:
    return f"prj_{stable_digest(workspace_id, 'project')}"


def record_id(prefix: str, workspace_id: str, index: int) -> str:
    return f"{prefix}_{index:03d}_{stable_digest(workspace_id, prefix, index)}"


def stable_digest(*parts: object) -> str:
    source = ":".join(str(part) for part in parts)
    return hashlib.sha256(source.encode("utf-8")).hexdigest()[:12]


def timestamp_for(index: int, minutes_step: int, offset_minutes: int = 0) -> str:
    timestamp = BASE_TIME + timedelta(minutes=(index - 1) * minutes_step + offset_minutes)
    return timestamp.isoformat().replace("+00:00", "Z")


def cycle_template(templates: Sequence[Mapping[str, Any]], index: int) -> Mapping[str, Any]:
    return templates[(index - 1) % len(templates)]


def numbered_text(value: object, index: int, templates: Sequence[Mapping[str, Any]]) -> str:
    text = str(value)
    if index <= len(templates):
        return text
    return f"{text} {index}"


if __name__ == "__main__":
    raise SystemExit(main())
