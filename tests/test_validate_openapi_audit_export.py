from __future__ import annotations

import unittest
from pathlib import Path


OPENAPI_PATH = Path(__file__).resolve().parents[1] / "docs" / "openapi.yaml"

AUDIT_EXPORT_OPERATIONS = (
    {
        "path": "/v1/audit/export/jsonl",
        "operation_id": "exportAuditJsonl",
        "response_ref": "AuditExportContentResponse",
    },
    {
        "path": "/v1/audit/export/csv",
        "operation_id": "exportAuditCsv",
        "response_ref": "AuditExportContentResponse",
    },
    {
        "path": "/v1/audit/export/package",
        "operation_id": "exportAuditPackage",
        "response_ref": "AuditExportPackage",
    },
)

EXPECTED_SCHEMAS = {
    "AuditExportContentDescriptor",
    "AuditExportContentResponse",
    "AuditExportEntity",
    "AuditExportEvent",
    "AuditExportFilters",
    "AuditExportManifest",
    "AuditExportNormalizedFilters",
    "AuditExportPackage",
    "AuditExportRequest",
    "AuditExportStringOrList",
}


class ValidateOpenApiAuditExportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.text = OPENAPI_PATH.read_text(encoding="utf-8")
        cls.lines = cls.text.splitlines()

    def test_audit_export_paths_share_request_schema(self) -> None:
        for operation in AUDIT_EXPORT_OPERATIONS:
            with self.subTest(path=operation["path"]):
                path_block = _require_block(self, self.lines, operation["path"], 2)
                method_block = _require_block(self, path_block, "post", 4)
                request_block = _require_block(self, method_block, "requestBody", 6)
                responses_block = _require_block(self, method_block, "responses", 6)
                status_block = _require_block(self, responses_block, '"200"', 8)

                self.assertIn(
                    f"operationId: {operation['operation_id']}",
                    _stripped_lines(method_block),
                )
                self.assertTrue(_has_schema_ref(request_block, "AuditExportRequest"))
                self.assertTrue(_has_schema_ref(status_block, operation["response_ref"]))
                self.assertIn(
                    '$ref: "#/components/responses/Error"',
                    _stripped_lines(responses_block),
                )

    def test_audit_export_schemas_are_declared(self) -> None:
        for schema_name in sorted(EXPECTED_SCHEMAS):
            with self.subTest(schema=schema_name):
                _require_block(self, self.lines, schema_name, 4)

    def test_content_wrapper_matches_api_route_contract(self) -> None:
        content_block = _require_block(self, self.lines, "AuditExportContentResponse", 4)
        for field in ("kind", "format", "mediaType", "content", "fingerprint", "manifest"):
            with self.subTest(field=field):
                self.assertIn(f"- {field}", _stripped_lines(content_block))
        self.assertIn("const: audit-export.content", _stripped_lines(content_block))
        self.assertIn("- jsonl", _stripped_lines(content_block))
        self.assertIn("- csv", _stripped_lines(content_block))


def _require_block(
    test_case: unittest.TestCase,
    lines: list[str],
    key: str,
    indent: int,
) -> list[str]:
    block = _find_block(lines, key, indent)
    test_case.assertIsNotNone(block, f"missing block {key!r} at indent {indent}")
    return block if block is not None else []


def _find_block(lines: list[str], key: str, indent: int) -> list[str] | None:
    prefix = " " * indent + key + ":"
    for index, line in enumerate(lines):
        if line.startswith(prefix):
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
    return f'$ref: "#/components/schemas/{schema_name}"' in _stripped_lines(lines)


def _stripped_lines(lines: list[str]) -> set[str]:
    return {line.strip() for line in lines}


if __name__ == "__main__":
    unittest.main()
