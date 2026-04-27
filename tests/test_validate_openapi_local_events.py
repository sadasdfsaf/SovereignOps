from __future__ import annotations

import unittest
from pathlib import Path


OPENAPI_PATH = Path(__file__).resolve().parents[1] / "docs" / "openapi.yaml"

LOCAL_EVENT_OPERATIONS = (
    {
        "path": "/v1/local-events/catalog",
        "method": "get",
        "operation_id": "getLocalEventCatalog",
        "request_ref": "LocalEventCatalogRequest",
        "response_ref": "CanonicalLocalEventCatalog",
        "required": "false",
        "planned": False,
    },
    {
        "path": "/v1/local-events/summary",
        "method": "get",
        "operation_id": "summarizeLocalEventCatalog",
        "request_ref": "LocalEventCatalogRequest",
        "response_ref": "LocalEventCatalogSummary",
        "required": "false",
        "planned": False,
    },
    {
        "path": "/v1/local-events/replay-batches",
        "method": "get",
        "operation_id": "getLocalEventReplayBatches",
        "request_ref": "LocalEventReplayBatchesRequest",
        "response_ref": "LocalEventReplayBatchesResponse",
        "required": "false",
        "planned": False,
    },
    {
        "path": "/v1/local-events/replay-export",
        "method": "post",
        "operation_id": "exportLocalEventReplay",
        "request_ref": "LocalEventReplayExportRequest",
        "response_ref": "LocalEventReplayExportResponse",
        "required": "true",
        "planned": False,
    },
)

EXPECTED_LOCAL_EVENT_SCHEMAS = (
    "LocalEventOperation",
    "LocalEventSchemaKind",
    "LocalEventApprovalStatus",
    "LocalEventApprovalDecision",
    "LocalEventSha256Digest",
    "LocalEventNullableSha256Digest",
    "LocalEventSharedRecordId",
    "LocalEventPathRef",
    "LocalEventOperationSelector",
    "LocalEventSchemaKindSelector",
    "CanonicalLocalEventPayload",
    "CanonicalLocalEventRedactionMetadata",
    "CanonicalLocalEvent",
    "CanonicalLocalEventCatalog",
    "LocalEventCatalogInput",
    "LocalEventCatalogRequest",
    "LocalEventReplayOptions",
    "LocalEventReplayBatchesRequest",
    "LocalEventOperationCounts",
    "LocalEventSchemaKindCounts",
    "LocalEventOperationSchemaKindSummary",
    "LocalEventCatalogSummary",
    "LocalEventReplayBatch",
    "LocalEventReplayBatchesResponse",
    "LocalEventReplayExportFormat",
    "LocalEventReplayExportFilters",
    "LocalEventReplayExportRequest",
    "LocalEventReplayExportContentDescriptor",
    "LocalEventReplayExportManifest",
    "LocalEventReplayExportResponse",
)

EXPECTED_API_ERROR_SCHEMAS = (
    "ApiErrorCode",
    "ApiErrorStatus",
    "ApiErrorValidationIssueCode",
    "ApiErrorValidationIssueExpectation",
    "ApiErrorValidationIssueReceivedType",
    "ApiErrorValidationIssue",
    "ApiErrorBody",
    "ApiErrorResponse",
)


class ValidateOpenApiLocalEventsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.text = OPENAPI_PATH.read_text(encoding="utf-8")
        cls.lines = cls.text.splitlines()

    def test_local_event_paths_have_stable_operations_examples_and_errors(self) -> None:
        for operation in LOCAL_EVENT_OPERATIONS:
            with self.subTest(path=operation["path"]):
                path_block = _require_block(self, self.lines, operation["path"], 2)
                method_block = _require_block(self, path_block, operation["method"], 4)
                tag_block = _require_block(self, method_block, "tags", 6)
                request_block = _require_block(self, method_block, "requestBody", 6)
                responses_block = _require_block(self, method_block, "responses", 6)
                status_block = _require_block(self, responses_block, '"200"', 8)
                validation_block = _require_block(self, responses_block, '"400"', 8)
                default_block = _require_block(self, responses_block, "default", 8)

                self.assertIn("- local-events", _stripped_lines(tag_block))
                self.assertIn(
                    f"operationId: {operation['operation_id']}",
                    _stripped_lines(method_block),
                )
                self.assertIn(
                    f"required: {operation['required']}",
                    _stripped_lines(request_block),
                )
                self.assertTrue(_has_schema_ref(request_block, operation["request_ref"]))
                self.assertTrue(_has_schema_ref(status_block, operation["response_ref"]))
                self.assertIn("examples:", _stripped_lines(request_block))
                self.assertIn("examples:", _stripped_lines(status_block))
                self.assertIn(
                    '$ref: "#/components/responses/ApiError"',
                    _stripped_lines(validation_block),
                )
                self.assertIn(
                    '$ref: "#/components/responses/ApiError"',
                    _stripped_lines(default_block),
                )
                if operation["planned"]:
                    self.assertIn("x-status: planned", _stripped_lines(method_block))
                else:
                    self.assertNotIn("x-status: planned", _stripped_lines(method_block))

    def test_examples_cover_catalog_summary_replay_and_export_shapes(self) -> None:
        catalog_text = _operation_text(self, self.lines, "/v1/local-events/catalog", "get")
        self.assertIn("catalogPath: packages/schemas/fixtures/canonical-events.valid.json", catalog_text)
        self.assertIn("schemaVersion: canonical-local-event-catalog/v1", catalog_text)
        self.assertIn("payloadDigest: 52cadbd6440da90efd2e528ac78ab86dc071b86df9be93df23ed9fa9c5d8bf0a", catalog_text)

        summary_text = _operation_text(self, self.lines, "/v1/local-events/summary", "get")
        self.assertIn("eventCount: 5", summary_text)
        self.assertIn("operationSchemaKinds:", summary_text)
        self.assertIn("redactedFieldCount: 3", summary_text)

        replay_text = _operation_text(self, self.lines, "/v1/local-events/replay-batches", "get")
        self.assertIn("batchSize: 2", replay_text)
        self.assertIn("schemaKinds:", replay_text)
        self.assertIn("batches:", replay_text)
        self.assertIn("local_event_replay_001_4_5_00abc12", replay_text)

        export_text = _operation_text(self, self.lines, "/v1/local-events/replay-export", "post")
        self.assertIn("format: package", export_text)
        self.assertIn("catalogPath: examples/local-events/catalog.json", export_text)
        self.assertIn("local-events.catalog-replay-export.manifest", export_text)
        self.assertIn("local_replay_descriptor_digest_001", export_text)

    def test_local_event_components_match_route_inputs_and_outputs(self) -> None:
        for schema_name in EXPECTED_LOCAL_EVENT_SCHEMAS:
            with self.subTest(schema=schema_name):
                _require_block(self, self.lines, schema_name, 4)

        catalog_block = _require_block(self, self.lines, "CanonicalLocalEventCatalog", 4)
        self.assertIn("const: canonical-local-event-catalog/v1", _stripped_lines(catalog_block))
        self.assertIn("- events", _stripped_lines(catalog_block))
        self.assertTrue(_has_schema_ref(catalog_block, "CanonicalLocalEvent"))

        event_block = _require_block(self, self.lines, "CanonicalLocalEvent", 4)
        for field in ("schemaVersion", "id", "workspaceId", "operation", "payloadDigest"):
            with self.subTest(event_field=field):
                self.assertIn(f"- {field}", _stripped_lines(event_block))
        self.assertTrue(_has_schema_ref(event_block, "CanonicalLocalEventPayload"))
        self.assertTrue(_has_schema_ref(event_block, "CanonicalLocalEventRedactionMetadata"))

        replay_request_block = _require_block(self, self.lines, "LocalEventReplayBatchesRequest", 4)
        for field in ("catalog", "catalogPath", "replay", "batchSize", "schemaKinds"):
            with self.subTest(replay_request_field=field):
                self.assertTrue(_has_key(replay_request_block, field, 8))
        self.assertTrue(_has_schema_ref(replay_request_block, "LocalEventReplayOptions"))

        export_request_block = _require_block(self, self.lines, "LocalEventReplayExportRequest", 4)
        self.assertIn("- format", _stripped_lines(export_request_block))
        self.assertTrue(_has_schema_ref(export_request_block, "LocalEventReplayExportFormat"))
        self.assertTrue(_has_schema_ref(export_request_block, "LocalEventReplayOptions"))

        export_response_block = _require_block(self, self.lines, "LocalEventReplayExportResponse", 4)
        self.assertIn("- descriptor", _stripped_lines(export_response_block))
        self.assertIn("- manifest", _stripped_lines(export_response_block))
        self.assertTrue(_has_schema_ref(export_response_block, "LocalEventReplayExportManifest"))

    def test_standard_api_error_response_is_referenced(self) -> None:
        response_block = _require_block(self, self.lines, "ApiError", 4)
        self.assertTrue(_has_schema_ref(response_block, "ApiErrorResponse"))
        self.assertIn("schemaVersion: api-error/v1", "\n".join(response_block))
        self.assertIn("requestId: req_local_events_00000001", "\n".join(response_block))

        for schema_name in EXPECTED_API_ERROR_SCHEMAS:
            with self.subTest(schema=schema_name):
                _require_block(self, self.lines, schema_name, 4)

        api_error_block = _require_block(self, self.lines, "ApiErrorResponse", 4)
        self.assertIn("- schemaVersion", _stripped_lines(api_error_block))
        self.assertIn("- error", _stripped_lines(api_error_block))
        self.assertIn("const: api-error/v1", _stripped_lines(api_error_block))
        self.assertTrue(_has_schema_ref(api_error_block, "ApiErrorBody"))

        body_block = _require_block(self, self.lines, "ApiErrorBody", 4)
        for field in ("code", "status", "message", "requestId"):
            with self.subTest(api_error_field=field):
                self.assertIn(f"- {field}", _stripped_lines(body_block))
        self.assertTrue(_has_schema_ref(body_block, "ApiErrorValidationIssue"))


def _operation_text(
    test_case: unittest.TestCase,
    lines: list[str],
    path: str,
    method: str,
) -> str:
    path_block = _require_block(test_case, lines, path, 2)
    return "\n".join(_require_block(test_case, path_block, method, 4))


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


def _has_key(lines: list[str], key: str, indent: int) -> bool:
    prefix = " " * indent + key + ":"
    return any(line.startswith(prefix) for line in lines)


def _has_schema_ref(lines: list[str], schema_name: str) -> bool:
    ref = f'$ref: "#/components/schemas/{schema_name}"'
    stripped = _stripped_lines(lines)
    return ref in stripped or f"- {ref}" in stripped


def _stripped_lines(lines: list[str]) -> set[str]:
    return {line.strip() for line in lines}


if __name__ == "__main__":
    unittest.main()
