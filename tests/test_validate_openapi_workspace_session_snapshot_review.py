from __future__ import annotations

import unittest
from pathlib import Path


OPENAPI_PATH = Path(__file__).resolve().parents[1] / "docs" / "openapi.yaml"

EXPECTED_OPERATIONS = (
    {
        "path": "/v1/workspace-session/snapshot-review/compare",
        "method": "post",
        "operation_id": "compareWorkspaceSessionSnapshotReview",
        "request_ref": "WorkspaceSessionSnapshotCompareRequest",
        "response_ref": "WorkspaceSessionSnapshotCompareResponse",
    },
    {
        "path": "/v1/workspace-session/snapshot-review/retention-preview",
        "method": "post",
        "operation_id": "previewWorkspaceSessionSnapshotRetention",
        "request_ref": "WorkspaceSessionSnapshotRetentionPreviewRequest",
        "response_ref": "WorkspaceSessionSnapshotRetentionPreviewResponse",
    },
)

EXPECTED_SCHEMAS = (
    "WorkspaceSessionSnapshotFingerprint",
    "WorkspaceSessionSnapshotId",
    "WorkspaceSessionSnapshotPreviewSummary",
    "WorkspaceSessionSnapshotPreviewResponse",
    "WorkspaceSessionSnapshotRecord",
    "WorkspaceSessionSnapshotBoundary",
    "WorkspaceSessionSnapshotCompareRequest",
    "WorkspaceSessionSnapshotReviewBoundarySummary",
    "WorkspaceSessionSnapshotCompareSummary",
    "WorkspaceSessionSnapshotComparableEvent",
    "WorkspaceSessionSnapshotComparableAuditRecord",
    "WorkspaceSessionSnapshotCompareDifferences",
    "WorkspaceSessionSnapshotCompareResponse",
    "WorkspaceSessionSnapshotRetentionPolicy",
    "WorkspaceSessionSnapshotRetentionPreviewRequest",
    "WorkspaceSessionSnapshotRetentionSummary",
    "WorkspaceSessionSnapshotRetentionDecision",
    "WorkspaceSessionSnapshotRetentionPreviewResponse",
)

FORBIDDEN_RAW_SCHEMA_MARKERS = (
    "rawBody",
    "requestBodyRetained",
    "lockToken:",
    "secret:",
    "storagePath:",
)


class ValidateOpenApiWorkspaceSessionSnapshotReviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.text = OPENAPI_PATH.read_text(encoding="utf-8")
        cls.lines = cls.text.splitlines()

    def test_snapshot_review_paths_have_stable_operations_and_error_responses(self) -> None:
        for operation in EXPECTED_OPERATIONS:
            with self.subTest(path=operation["path"]):
                path_block = _require_block(self, self.lines, operation["path"], 2)
                method_block = _require_block(self, path_block, operation["method"], 4)
                tag_block = _require_block(self, method_block, "tags", 6)
                request_block = _require_block(self, method_block, "requestBody", 6)
                responses_block = _require_block(self, method_block, "responses", 6)
                status_block = _require_block(self, responses_block, '"200"', 8)
                default_block = _require_block(self, responses_block, "default", 8)

                self.assertIn("- workspace-session", _stripped_lines(tag_block))
                self.assertIn(
                    f"operationId: {operation['operation_id']}",
                    _stripped_lines(method_block),
                )
                self.assertIn("required: true", _stripped_lines(request_block))
                self.assertTrue(_has_schema_ref(request_block, operation["request_ref"]))
                self.assertTrue(_has_schema_ref(status_block, operation["response_ref"]))
                self.assertIn(
                    '$ref: "#/components/responses/Error"',
                    _stripped_lines(default_block),
                )
                self.assertIn("durable writes", "\n".join(method_block))

    def test_snapshot_review_components_match_route_contracts(self) -> None:
        for schema_name in EXPECTED_SCHEMAS:
            with self.subTest(schema=schema_name):
                _require_block(self, self.lines, schema_name, 4)

        compare_request = _require_block(self, self.lines, "WorkspaceSessionSnapshotCompareRequest", 4)
        self.assertIn("- baseline", _stripped_lines(compare_request))
        self.assertIn("- candidate", _stripped_lines(compare_request))
        self.assertTrue(_has_schema_ref(compare_request, "WorkspaceSessionSnapshotBoundary"))

        compare_response = _require_block(self, self.lines, "WorkspaceSessionSnapshotCompareResponse", 4)
        for expected in (
            "const: workspace-session.snapshot-review.compare",
            "const: workspace-session-snapshot-review/v1",
            "const: workspace-session-store/v1",
            "const: workspace-session-api/v1",
            "const: true",
            "const: false",
        ):
            with self.subTest(compare_field=expected):
                self.assertIn(expected, _stripped_lines(compare_response))
        self.assertTrue(_has_schema_ref(compare_response, "WorkspaceSessionSnapshotCompareDifferences"))

        retention_request = _require_block(
            self,
            self.lines,
            "WorkspaceSessionSnapshotRetentionPreviewRequest",
            4,
        )
        self.assertIn("- snapshots", _stripped_lines(retention_request))
        self.assertTrue(_has_schema_ref(retention_request, "WorkspaceSessionSnapshotRecord"))
        self.assertTrue(_has_schema_ref(retention_request, "WorkspaceSessionSnapshotRetentionPolicy"))

        retention_response = _require_block(
            self,
            self.lines,
            "WorkspaceSessionSnapshotRetentionPreviewResponse",
            4,
        )
        self.assertIn(
            "const: workspace-session.snapshot-review.retention-preview",
            _stripped_lines(retention_response),
        )
        self.assertTrue(_has_schema_ref(retention_response, "WorkspaceSessionSnapshotRetentionSummary"))
        self.assertTrue(_has_schema_ref(retention_response, "WorkspaceSessionSnapshotRetentionDecision"))

    def test_snapshot_review_schema_avoids_raw_retention_fields(self) -> None:
        snapshot_review_text = "\n".join(
            "\n".join(_require_block(self, self.lines, schema_name, 4))
            for schema_name in EXPECTED_SCHEMAS
        )

        for marker in FORBIDDEN_RAW_SCHEMA_MARKERS:
            with self.subTest(marker=marker):
                self.assertNotIn(marker, snapshot_review_text)


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
    ref = f'$ref: "#/components/schemas/{schema_name}"'
    stripped = _stripped_lines(lines)
    return ref in stripped or f"- {ref}" in stripped


def _stripped_lines(lines: list[str]) -> set[str]:
    return {line.strip() for line in lines}


if __name__ == "__main__":
    unittest.main()
