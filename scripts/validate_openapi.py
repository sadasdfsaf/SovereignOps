#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from pathlib import Path

REQUIRED_TOP_LEVEL_KEYS = ("openapi", "info", "paths", "components")
REQUIRED_PATH_OPERATIONS = {
    "/health": ("getHealth",),
    "/v1/workspaces/{workspaceId}/records": ("listRecords", "createRecord"),
    "/v1/workspaces/{workspaceId}/records/{recordId}": ("getRecord", "updateRecord"),
    "/v1/workspaces/{workspaceId}/agent-actions/preview": ("previewAgentAction",),
    "/v1/workspaces/{workspaceId}/audit": ("listAuditEntries",),
    "/v1/audit/export/jsonl": ("exportAuditJsonl",),
    "/v1/audit/export/csv": ("exportAuditCsv",),
    "/v1/audit/export/package": ("exportAuditPackage",),
    "/v1/ingest/evidence/export": ("exportIngestEvidence",),
    "/v1/ingest/evidence/package": ("packageIngestEvidence",),
    "/v1/workspace-session/summary": ("summarizeWorkspaceSession",),
    "/v1/workspace-session/audit-preview": ("previewWorkspaceSessionAudit",),
    "/v1/plugins/review-artifacts/preview": ("previewPluginReviewArtifact",),
    "/v1/plugins/review-artifacts/records": (
        "listPluginReviewArtifactRecords",
        "createPluginReviewArtifactRecord",
    ),
    "/v1/plugins/review-artifacts/records/{recordId}": (
        "getPluginReviewArtifactRecord",
    ),
    "/v1/plugins/review-artifacts/records/{recordId}/compare": (
        "comparePluginReviewArtifactRecord",
    ),
    "/v1/mcp/approval-evidence/preview": ("previewMcpApprovalEvidence",),
    "/v1/mcp/approval-evidence/records": (
        "listMcpApprovalEvidenceRecords",
        "createMcpApprovalEvidenceRecord",
    ),
    "/v1/mcp/approval-evidence/records/{recordId}": (
        "getMcpApprovalEvidenceRecord",
    ),
    "/v1/mcp/approval-evidence/records/{recordId}/compare": (
        "compareMcpApprovalEvidenceRecord",
    ),
}
REQUIRED_ERROR_FIELDS = ("code", "message", "requestId")
REQUIRED_VALIDATION_ISSUE_FIELDS = ("path", "message")
REQUIRED_SCHEMA_COMPONENTS = (
    "RecordKind",
    "RecordBase",
    "DocRecord",
    "ProjectRecord",
    "IncidentRecord",
    "CommentRecord",
    "AttachmentRecord",
    "ApprovalRecord",
    "SovereignRecord",
    "RecordListResponse",
    "RecordResponse",
    "CreateRecordRequest",
    "UpdateRecordRequest",
    "AuditEntry",
    "AuditEntryListResponse",
    "ValidationIssue",
    "ErrorResponse",
)
REQUIRED_RECORD_KIND_VALUES = (
    "docs",
    "projects",
    "incidents",
    "comments",
    "attachments",
    "approvals",
)
REQUIRED_RECORD_BASE_FIELDS = (
    "id",
    "workspaceId",
    "status",
    "risk",
    "createdAt",
    "updatedAt",
)
RECORD_SCHEMA_REQUIREMENTS = {
    "DocRecord": {
        "required": ("title", "ownerActorId"),
        "properties": ("id", "status", "title", "body", "projectId", "ownerActorId"),
        "id_pattern": "^doc_[A-Za-z0-9_-]{1,88}$",
        "statuses": ("draft", "review", "active", "archived"),
    },
    "ProjectRecord": {
        "required": ("name", "ownerActorId"),
        "properties": ("id", "status", "name", "ownerActorId"),
        "id_pattern": "^prj_[A-Za-z0-9_-]{1,88}$",
        "statuses": ("planned", "active", "paused", "completed", "archived"),
    },
    "IncidentRecord": {
        "required": ("title", "reportedByActorId"),
        "properties": ("id", "status", "title", "summary", "projectId", "reportedByActorId"),
        "id_pattern": "^inc_[A-Za-z0-9_-]{1,88}$",
        "statuses": ("open", "triaged", "resolved", "closed"),
    },
    "CommentRecord": {
        "required": ("targetId", "body", "authorActorId"),
        "properties": ("id", "status", "targetId", "body", "authorActorId"),
        "id_pattern": "^cmt_[A-Za-z0-9_-]{1,88}$",
        "statuses": ("open", "resolved", "deleted"),
    },
    "AttachmentRecord": {
        "required": ("targetId", "filename", "contentType", "byteSize", "uploadedByActorId"),
        "properties": (
            "id",
            "status",
            "targetId",
            "filename",
            "contentType",
            "byteSize",
            "uploadedByActorId",
        ),
        "id_pattern": "^att_[A-Za-z0-9_-]{1,88}$",
        "statuses": ("pending", "ready", "failed", "deleted"),
    },
    "ApprovalRecord": {
        "required": ("targetId", "summary", "requestedByActorId"),
        "properties": (
            "id",
            "status",
            "targetId",
            "summary",
            "requestedByActorId",
            "approverActorId",
        ),
        "id_pattern": "^apv_[A-Za-z0-9_-]{1,88}$",
        "statuses": ("requested", "approved", "rejected", "cancelled"),
    },
}
RECORD_RESPONSE_REQUIREMENTS = {
    "RecordListResponse": {
        "required": ("records",),
        "properties": ("records",),
        "refs": ("SovereignRecord",),
    },
    "RecordResponse": {
        "required": ("record",),
        "properties": ("record",),
        "refs": ("SovereignRecord",),
    },
    "CreateRecordRequest": {
        "required": ("kind", "record"),
        "properties": ("kind", "record"),
        "refs": ("RecordKind", "SovereignRecord"),
    },
    "UpdateRecordRequest": {
        "required": ("changes",),
        "properties": ("changes",),
        "refs": (),
    },
    "AuditEntry": {
        "required": ("workspaceId", "actorId", "action", "decision", "redactedPaths", "recordedAt"),
        "properties": (
            "workspaceId",
            "actorId",
            "action",
            "decision",
            "redactedPaths",
            "recordedAt",
        ),
        "refs": ("WorkspaceId", "ActorId"),
    },
    "AuditEntryListResponse": {
        "required": ("entries",),
        "properties": ("entries",),
        "refs": ("AuditEntry",),
    },
}


@dataclass(frozen=True)
class ValidationReport:
    path: Path
    issues: list[str]

    @property
    def ok(self) -> bool:
        return not self.issues


def validate_openapi(path: Path) -> ValidationReport:
    issues: list[str] = []
    if not path.exists():
        return ValidationReport(path=path, issues=[f"missing file: {path}"])
    if not path.is_file():
        return ValidationReport(path=path, issues=[f"not a file: {path}"])

    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()

    for key in REQUIRED_TOP_LEVEL_KEYS:
        if not _has_key(lines, key, 0):
            issues.append(f"missing top-level section: {key}")

    if not _has_key(lines, "schemas", 2):
        issues.append("missing components.schemas section")

    schema_names = _schema_names(lines)
    for schema_name in REQUIRED_SCHEMA_COMPONENTS:
        if schema_name not in schema_names:
            issues.append(f"missing schema component: {schema_name}")

    operation_ids = _operation_ids(lines)
    if not operation_ids:
        issues.append("missing operationId entries")
    duplicate_ids = sorted({item for item in operation_ids if operation_ids.count(item) > 1})
    for operation_id in duplicate_ids:
        issues.append(f"duplicate operationId: {operation_id}")

    for openapi_path, expected_operation_ids in REQUIRED_PATH_OPERATIONS.items():
        block = _find_block(lines, openapi_path, 2)
        if block is None:
            issues.append(f"missing path: {openapi_path}")
            continue
        for operation_id in expected_operation_ids:
            if not _block_has_operation_id(block, operation_id):
                issues.append(f"missing operationId {operation_id} for path {openapi_path}")

    _validate_record_components(lines, issues)
    _validate_standard_error_components(lines, text, issues)

    return ValidationReport(path=path, issues=issues)


def _has_key(lines: list[str], key: str, indent: int) -> bool:
    prefix = " " * indent + key + ":"
    return any(line.startswith(prefix) for line in lines)


def _find_block(lines: list[str], key: str, indent: int) -> list[str] | None:
    prefix = " " * indent + key + ":"
    for index, line in enumerate(lines):
        if not line.startswith(prefix):
            continue

        block: list[str] = []
        for child in lines[index + 1 :]:
            if not child.strip() or child.lstrip().startswith("#"):
                block.append(child)
                continue
            child_indent = len(child) - len(child.lstrip(" "))
            if child_indent <= indent:
                break
            block.append(child)
        return block
    return None


def _operation_ids(lines: list[str]) -> list[str]:
    pattern = re.compile(r"^\s+operationId:\s*([A-Za-z][A-Za-z0-9_]*)\s*$")
    ids: list[str] = []
    for line in lines:
        match = pattern.match(line)
        if match:
            ids.append(match.group(1))
    return ids


def _schema_names(lines: list[str]) -> set[str]:
    schemas_block = _find_block(lines, "schemas", 2)
    if schemas_block is None:
        return set()

    pattern = re.compile(r"^    ([A-Za-z][A-Za-z0-9_]*):\s*$")
    names: set[str] = set()
    for line in schemas_block:
        match = pattern.match(line)
        if match:
            names.add(match.group(1))
    return names


def _block_has_operation_id(block: list[str], operation_id: str) -> bool:
    return any(line.strip() == f"operationId: {operation_id}" for line in block)


def _list_contains(lines: list[str], value: str) -> bool:
    return any(line.strip() == f"- {value}" for line in lines)


def _validate_record_components(lines: list[str], issues: list[str]) -> None:
    record_kind_block = _find_block(lines, "RecordKind", 4)
    if record_kind_block is not None:
        for value in REQUIRED_RECORD_KIND_VALUES:
            if not _list_contains(record_kind_block, value):
                issues.append(f"RecordKind missing enum value: {value}")

    record_base_block = _find_block(lines, "RecordBase", 4)
    if record_base_block is not None:
        _require_required_fields(
            "RecordBase",
            record_base_block,
            REQUIRED_RECORD_BASE_FIELDS,
            issues,
        )
        _require_properties("RecordBase", record_base_block, REQUIRED_RECORD_BASE_FIELDS, issues)
        for ref in ("SovereignRecordId", "WorkspaceId", "RiskLevel"):
            _require_schema_ref("RecordBase", record_base_block, ref, issues)

    for schema_name, requirements in RECORD_SCHEMA_REQUIREMENTS.items():
        block = _find_block(lines, schema_name, 4)
        if block is None:
            continue

        _require_schema_ref(schema_name, block, "RecordBase", issues)
        _require_required_fields(schema_name, block, requirements["required"], issues)
        _require_properties(schema_name, block, requirements["properties"], issues)
        for status in requirements["statuses"]:
            if not _list_contains(block, status):
                issues.append(f"{schema_name} missing status value: {status}")
        if requirements["id_pattern"] not in "\n".join(block):
            issues.append(f"{schema_name} missing id pattern: {requirements['id_pattern']}")

    sovereign_record_block = _find_block(lines, "SovereignRecord", 4)
    if sovereign_record_block is not None:
        for schema_name in RECORD_SCHEMA_REQUIREMENTS:
            _require_schema_ref("SovereignRecord", sovereign_record_block, schema_name, issues)

    for schema_name, requirements in RECORD_RESPONSE_REQUIREMENTS.items():
        block = _find_block(lines, schema_name, 4)
        if block is None:
            continue

        _require_required_fields(schema_name, block, requirements["required"], issues)
        _require_properties(schema_name, block, requirements["properties"], issues)
        for ref in requirements["refs"]:
            _require_schema_ref(schema_name, block, ref, issues)


def _validate_standard_error_components(lines: list[str], text: str, issues: list[str]) -> None:
    validation_issue_block = _find_block(lines, "ValidationIssue", 4)
    if validation_issue_block is not None:
        _require_required_fields(
            "ValidationIssue",
            validation_issue_block,
            REQUIRED_VALIDATION_ISSUE_FIELDS,
            issues,
        )
        for field in REQUIRED_VALIDATION_ISSUE_FIELDS:
            _require_string_field("ValidationIssue", validation_issue_block, field, issues)
        _require_additional_properties_false("ValidationIssue", validation_issue_block, issues)

    error_block = _find_block(lines, "ErrorResponse", 4)
    if error_block is None:
        issues.append("missing ErrorResponse schema")
    else:
        _require_required_fields("ErrorResponse", error_block, REQUIRED_ERROR_FIELDS, issues)
        for field in REQUIRED_ERROR_FIELDS:
            _require_string_field("ErrorResponse", error_block, field, issues)
        _require_property("ErrorResponse", error_block, "issues", issues)
        issues_block = _find_nested_block(error_block, "issues")
        if issues_block is None:
            issues.append("ErrorResponse issues must reference ValidationIssue")
        else:
            if "type: array" not in _stripped_lines(issues_block):
                issues.append("ErrorResponse issues must be an array")
            _require_schema_ref("ErrorResponse issues", issues_block, "ValidationIssue", issues)
        _require_additional_properties_false("ErrorResponse", error_block, issues)

    if "#/components/schemas/ErrorResponse" not in text:
        issues.append("ErrorResponse schema is not referenced by responses")


def _require_required_fields(
    schema_name: str,
    block: list[str],
    fields: tuple[str, ...],
    issues: list[str],
) -> None:
    for field in fields:
        if not _list_contains(block, field):
            issues.append(f"{schema_name} missing field: {field}")


def _require_properties(
    schema_name: str,
    block: list[str],
    fields: tuple[str, ...],
    issues: list[str],
) -> None:
    for field in fields:
        _require_property(schema_name, block, field, issues)


def _require_property(
    schema_name: str,
    block: list[str],
    field: str,
    issues: list[str],
) -> None:
    if not _find_nested_block(block, field):
        issues.append(f"{schema_name} missing property: {field}")


def _require_schema_ref(
    schema_name: str,
    block: list[str],
    ref_name: str,
    issues: list[str],
) -> None:
    if not _has_schema_ref(block, ref_name):
        issues.append(f"{schema_name} missing schema ref: {ref_name}")


def _require_string_field(
    schema_name: str,
    block: list[str],
    field: str,
    issues: list[str],
) -> None:
    field_block = _find_nested_block(block, field)
    if field_block is None:
        issues.append(f"{schema_name} missing property: {field}")
        return

    stripped = _stripped_lines(field_block)
    if "type: string" not in stripped:
        issues.append(f"{schema_name}.{field} must be a string")
    if "minLength: 1" not in stripped:
        issues.append(f"{schema_name}.{field} must set minLength: 1")


def _require_additional_properties_false(
    schema_name: str,
    block: list[str],
    issues: list[str],
) -> None:
    if "additionalProperties: false" not in _stripped_lines(block):
        issues.append(f"{schema_name} must set additionalProperties: false")


def _find_nested_block(lines: list[str], key: str) -> list[str] | None:
    for index, line in enumerate(lines):
        if line.strip() != f"{key}:":
            continue
        indent = len(line) - len(line.lstrip(" "))
        return _collect_block(lines, index, indent)
    return None


def _collect_block(lines: list[str], index: int, indent: int) -> list[str]:
    block: list[str] = []
    for child in lines[index + 1 :]:
        if not child.strip() or child.lstrip().startswith("#"):
            block.append(child)
            continue
        child_indent = len(child) - len(child.lstrip(" "))
        if child_indent <= indent:
            break
        block.append(child)
    return block


def _has_schema_ref(lines: list[str], schema_name: str) -> bool:
    ref = f'$ref: "#/components/schemas/{schema_name}"'
    stripped = _stripped_lines(lines)
    return ref in stripped or f"- {ref}" in stripped


def _stripped_lines(lines: list[str]) -> set[str]:
    return {line.strip() for line in lines}


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate the SovereignOps OpenAPI contract.")
    parser.add_argument(
        "path",
        nargs="?",
        default="docs/openapi.yaml",
        help="Path to the OpenAPI YAML file.",
    )
    args = parser.parse_args()

    report = validate_openapi(Path(args.path))
    if report.ok:
        print(f"OpenAPI contract OK: {report.path}")
        return 0

    print(f"OpenAPI contract invalid: {report.path}")
    for issue in report.issues:
        print(f"- {issue}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
