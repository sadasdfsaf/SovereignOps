from __future__ import annotations

import json
from collections import Counter
from typing import Any, Dict, Mapping

from .harness import register_benchmark, stable_digest


WORKSPACE_ID = "wsp_studio_labs"

EVENT_STREAM = (
    {
        "actorId": "act_avery",
        "eventId": "evt_0001",
        "kind": "document.saved",
        "objectId": "doc_product_brief",
        "objectKind": "document",
        "payload": {
            "labels": ["internal", "draft"],
            "title": "Product brief",
            "version": 3,
        },
        "workspaceId": WORKSPACE_ID,
    },
    {
        "actorId": "act_blair",
        "eventId": "evt_0002",
        "kind": "task.completed",
        "objectId": "task_review_copy",
        "objectKind": "task",
        "payload": {
            "durationMinutes": 18,
            "queue": "launch",
            "result": "accepted",
        },
        "workspaceId": WORKSPACE_ID,
    },
    {
        "actorId": "act_casey",
        "eventId": "evt_0003",
        "kind": "automation.previewed",
        "objectId": "auto_daily_digest",
        "objectKind": "automation",
        "payload": {
            "changedFields": ["summaryWindow", "recipients"],
            "mode": "sandbox",
            "recipients": ["team-design"],
        },
        "workspaceId": WORKSPACE_ID,
    },
)

PREVIEW_REQUESTS = (
    {
        "action": "read",
        "actorId": "act_avery",
        "labels": ["internal"],
        "resourceId": "doc_product_brief",
        "resourceKind": "document",
        "sandboxed": True,
        "team": "design",
        "trustLevel": 3,
    },
    {
        "action": "export",
        "actorId": "act_blair",
        "labels": ["confidential"],
        "resourceId": "doc_partner_notes",
        "resourceKind": "document",
        "sandboxed": True,
        "team": "growth",
        "trustLevel": 1,
    },
    {
        "action": "delete",
        "actorId": "act_casey",
        "labels": ["internal"],
        "ownerActorId": "act_avery",
        "resourceId": "task_review_copy",
        "resourceKind": "task",
        "sandboxed": True,
        "team": "design",
        "trustLevel": 2,
    },
    {
        "action": "run",
        "actorId": "act_devon",
        "labels": ["internal"],
        "resourceId": "auto_daily_digest",
        "resourceKind": "automation",
        "sandboxed": True,
        "team": "ops",
        "trustLevel": 3,
    },
)


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, separators=(",", ":"), sort_keys=True)


@register_benchmark(
    "event_serialization",
    description="Serialize and parse fictional workspace event records.",
)
def event_serialization() -> Mapping[str, Any]:
    encoded = [_canonical_json(event) for event in EVENT_STREAM]
    decoded = [json.loads(record) for record in encoded]

    return {
        "checksum": stable_digest(decoded),
        "metadata": {
            "events": len(EVENT_STREAM),
            "jsonBytes": sum(len(record.encode("utf-8")) for record in encoded),
            "workspaceId": WORKSPACE_ID,
        },
        "operations": len(EVENT_STREAM) * 2,
    }


def preview_decision(request: Mapping[str, Any]) -> Dict[str, Any]:
    action = str(request["action"])
    labels = set(request.get("labels", []))
    actor_id = str(request["actorId"])
    owner_actor_id = str(request.get("ownerActorId", actor_id))

    if action == "delete" and owner_actor_id != actor_id:
        outcome = "blocked"
        reason = "owner-required"
    elif action == "export" and "confidential" in labels and int(request["trustLevel"]) < 3:
        outcome = "review"
        reason = "sensitive-export"
    elif action == "run" and not bool(request.get("sandboxed", False)):
        outcome = "review"
        reason = "sandbox-required"
    else:
        outcome = "allowed"
        reason = "rule-match"

    return {
        "action": action,
        "actorId": actor_id,
        "outcome": outcome,
        "reason": reason,
        "resourceId": request["resourceId"],
    }


@register_benchmark(
    "policy_preview_decisions",
    description="Evaluate policy-preview-like decisions over fictional workspace requests.",
)
def policy_preview_decisions() -> Mapping[str, Any]:
    decisions = [preview_decision(request) for request in PREVIEW_REQUESTS]
    counts = Counter(str(decision["outcome"]) for decision in decisions)

    return {
        "checksum": stable_digest(decisions),
        "metadata": {
            "allowed": counts["allowed"],
            "blocked": counts["blocked"],
            "requests": len(PREVIEW_REQUESTS),
            "review": counts["review"],
            "workspaceId": WORKSPACE_ID,
        },
        "operations": len(PREVIEW_REQUESTS),
    }
