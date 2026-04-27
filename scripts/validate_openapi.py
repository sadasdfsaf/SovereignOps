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
    "/v1/plugins/review-artifacts/preview": ("previewPluginReviewArtifact",),
    "/v1/mcp/approval-evidence/preview": ("previewMcpApprovalEvidence",),
}
REQUIRED_ERROR_FIELDS = ("code", "message", "requestId")


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

    error_block = _find_block(lines, "ErrorResponse", 4)
    if error_block is None:
        issues.append("missing ErrorResponse schema")
    else:
        for field in REQUIRED_ERROR_FIELDS:
            if not _has_key(error_block, field, 8) or not _list_contains(error_block, field):
                issues.append(f"ErrorResponse missing field: {field}")

    if "#/components/schemas/ErrorResponse" not in text:
        issues.append("ErrorResponse schema is not referenced by responses")

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


def _block_has_operation_id(block: list[str], operation_id: str) -> bool:
    return any(line.strip() == f"operationId: {operation_id}" for line in block)


def _list_contains(lines: list[str], value: str) -> bool:
    return any(line.strip() == f"- {value}" for line in lines)


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
