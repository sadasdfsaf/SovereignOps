from __future__ import annotations

import unittest
from pathlib import Path


OPENAPI_PATH = Path(__file__).resolve().parents[1] / "docs" / "openapi.yaml"

EXPECTED_ROUTE_PATH = "/v1/workspace-session/snapshot-retention-cleanup/preview"
EXPECTED_METHOD = "post"
EXPECTED_OPERATION_ID = "previewWorkspaceSessionSnapshotRetentionCleanup"
EXPECTED_REQUEST_SCHEMA = "WorkspaceSessionSnapshotRetentionCleanupPreviewRequest"
EXPECTED_RESPONSE_SCHEMA = "WorkspaceSessionSnapshotRetentionCleanupPreviewResponse"

EXPECTED_DECLARED_SCHEMAS = (
    "WorkspaceSessionSnapshotRetentionCleanupInputEntry",
    "WorkspaceSessionSnapshotRetentionCleanupPreviewRequest",
    "WorkspaceSessionSnapshotRetentionCleanupPreviewResponse",
    "WorkspaceSessionSnapshotRetentionCleanupThresholds",
    "WorkspaceSessionSnapshotRetentionCleanupSummary",
    "WorkspaceSessionSnapshotRetentionCleanupAction",
    "WorkspaceSessionSnapshotRetentionCleanupIssue",
)

FORBIDDEN_RAW_RETENTION_MARKERS = (
    "rawBody",
    "requestBodyRetained",
    "absolutePath:",
    "filePath:",
    "rawLockToken:",
    "rawToken:",
    "rawPath:",
    "rawSecret:",
    "apiKey:",
    "authorization:",
    "bearerToken:",
    "password:",
    "secret:",
    "storagePath:",
    "token:",
    "lockToken:",
)


class ValidateOpenApiWorkspaceSessionSnapshotRetentionCleanupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.text = OPENAPI_PATH.read_text(encoding="utf-8")
        cls.lines = cls.text.splitlines()

    def test_retention_cleanup_preview_path_has_stable_operation(self) -> None:
        path_block = _require_cleanup_route_or_skip(self, self.lines)
        method_block = _require_block(self, path_block, EXPECTED_METHOD, 4)
        tag_block = _require_block(self, method_block, "tags", 6)
        request_block = _require_block(self, method_block, "requestBody", 6)
        responses_block = _require_block(self, method_block, "responses", 6)
        status_block = _require_block(self, responses_block, '"200"', 8)
        bad_request_block = _require_block(self, responses_block, '"400"', 8)
        default_block = _require_block(self, responses_block, "default", 8)

        self.assertIn("- workspace-session", _stripped_lines(tag_block))
        self.assertIn(f"operationId: {EXPECTED_OPERATION_ID}", _stripped_lines(method_block))
        self.assertIn("required: true", _stripped_lines(request_block))
        self.assertTrue(_has_schema_ref(request_block, EXPECTED_REQUEST_SCHEMA))
        self.assertTrue(_has_schema_ref(status_block, EXPECTED_RESPONSE_SCHEMA))
        self.assertIn('$ref: "#/components/responses/Error"', _stripped_lines(bad_request_block))
        self.assertIn('$ref: "#/components/responses/Error"', _stripped_lines(default_block))
        self.assertIn("dry-run", "\n".join(method_block).lower())

    def test_retention_cleanup_preview_route_is_body_only_json_contract(self) -> None:
        path_block = _require_cleanup_route_or_skip(self, self.lines)
        method_block = _require_block(self, path_block, EXPECTED_METHOD, 4)
        request_block = _require_block(self, method_block, "requestBody", 6)
        status_block = _require_block(
            self,
            _require_block(self, method_block, "responses", 6),
            '"200"',
            8,
        )
        error_response_block = _require_block(self, self.lines, "Error", 4)

        self.assertNotIn("parameters:", _stripped_lines(method_block))
        self.assertEqual(_media_types(request_block), ["application/json"])
        self.assertEqual(_media_types(status_block), ["application/json"])
        self.assertEqual(_media_types(error_response_block), ["application/json"])

    def test_retention_cleanup_preview_response_is_local_dry_run_only(self) -> None:
        _require_cleanup_route_or_skip(self, self.lines)
        response_block = _require_block(self, self.lines, EXPECTED_RESPONSE_SCHEMA, 4)

        for field, expected_const in (
            ("localOnly", "const: true"),
            ("dryRun", "const: true"),
            ("durableWrites", "const: false"),
        ):
            with self.subTest(field=field):
                field_block = _require_nested_block(self, response_block, field)
                self.assertIn("type: boolean", _stripped_lines(field_block))
                self.assertIn(expected_const, _stripped_lines(field_block))

    def test_retention_cleanup_preview_components_are_declared(self) -> None:
        _require_cleanup_route_or_skip(self, self.lines)
        request_block = _require_block(self, self.lines, EXPECTED_REQUEST_SCHEMA, 4)
        self.assertIn("additionalProperties: false", _stripped_lines(request_block))

        for field in ("entries", "files", "records"):
            with self.subTest(request_field=field):
                field_block = _require_nested_block(self, request_block, field)
                self.assertTrue(_has_schema_ref(
                    field_block,
                    "WorkspaceSessionSnapshotRetentionCleanupInputEntry",
                ))
                self.assertFalse(_has_schema_ref(field_block, "WorkspaceSessionSnapshotRecord"))

        for schema_name in EXPECTED_DECLARED_SCHEMAS:
            with self.subTest(schema=schema_name):
                _require_block(self, self.lines, schema_name, 4)

    def test_retention_cleanup_preview_schema_omits_raw_retention_fields(self) -> None:
        _require_cleanup_route_or_skip(self, self.lines)
        cleanup_schema_text = "\n".join(
            "\n".join(_require_block(self, self.lines, schema_name, 4))
            for schema_name in EXPECTED_DECLARED_SCHEMAS
        )

        for marker in FORBIDDEN_RAW_RETENTION_MARKERS:
            with self.subTest(marker=marker):
                self.assertNotIn(marker, cleanup_schema_text)


def _require_cleanup_route_or_skip(
    test_case: unittest.TestCase,
    lines: list[str],
) -> list[str]:
    block = _find_block(lines, EXPECTED_ROUTE_PATH, 2)
    if block is not None:
        return block

    matching_paths = [
        line.strip()[:-1]
        for line in lines
        if line.startswith("  /")
        and "snapshot" in line
        and "retention" in line
        and "cleanup" in line
    ]
    if matching_paths:
        test_case.fail(
            "retention cleanup OpenAPI route exists under an unexpected path: "
            + ", ".join(sorted(matching_paths))
        )

    test_case.skipTest("retention cleanup preview OpenAPI route is not present yet")


def _require_block(
    test_case: unittest.TestCase,
    lines: list[str],
    key: str,
    indent: int,
) -> list[str]:
    block = _find_block(lines, key, indent)
    test_case.assertIsNotNone(block, f"missing block {key!r} at indent {indent}")
    return block if block is not None else []


def _require_nested_block(
    test_case: unittest.TestCase,
    lines: list[str],
    key: str,
) -> list[str]:
    for index, line in enumerate(lines):
        if line.strip() != f"{key}:":
            continue
        indent = len(line) - len(line.lstrip(" "))
        return _collect_block(lines, index, indent)

    test_case.fail(f"missing nested block {key!r}")
    return []


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
    ref = f'$ref: "#/components/schemas/{schema_name}"'
    stripped = _stripped_lines(lines)
    return ref in stripped or f"- {ref}" in stripped


def _media_types(lines: list[str]) -> list[str]:
    content_index = next(
        (index for index, line in enumerate(lines) if line.strip() == "content:"),
        None,
    )
    if content_index is None:
        return []

    content_indent = len(lines[content_index]) - len(lines[content_index].lstrip(" "))
    media_indent = content_indent + 2
    media_types: list[str] = []
    for line in lines[content_index + 1 :]:
        if not line.strip():
            continue
        indent = len(line) - len(line.lstrip(" "))
        if indent <= content_indent:
            break
        if indent == media_indent and line.strip().endswith(":"):
            media_types.append(line.strip()[:-1])
    return media_types


def _stripped_lines(lines: list[str]) -> set[str]:
    return {line.strip() for line in lines}


if __name__ == "__main__":
    unittest.main()
