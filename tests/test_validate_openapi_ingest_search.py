from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
OPENAPI_PATH = ROOT / "docs" / "openapi.yaml"
EXAMPLE_PATH = ROOT / "examples" / "ingest-search" / "api-requests.json"

INGEST_SEARCH_OPERATIONS = (
    {
        "path": "/v1/ingest/normalize",
        "method": "post",
        "tag": "ingest",
        "operation_id": "normalizeIngestContent",
        "request_ref": "IngestNormalizeRequest",
        "response_ref": "IngestNormalizeResponse",
    },
    {
        "path": "/v1/ingest/structured",
        "method": "post",
        "tag": "ingest",
        "operation_id": "ingestStructuredContent",
        "request_ref": "StructuredIngestRequest",
        "response_ref": "StructuredIngestResponse",
    },
    {
        "path": "/v1/ingest/repository/scan",
        "method": "post",
        "tag": "ingest",
        "operation_id": "scanIngestRepository",
        "request_ref": "RepositoryScanRequest",
        "response_ref": "RepositoryScanResponse",
    },
    {
        "path": "/v1/search/query",
        "method": "post",
        "tag": "search",
        "operation_id": "queryLocalSearch",
        "request_ref": "SearchQueryRequest",
        "response_ref": "SearchQueryResponse",
    },
    {
        "path": "/v1/quarantine/cases",
        "method": "post",
        "tag": "quarantine",
        "operation_id": "createQuarantineCases",
        "request_ref": "QuarantineCasesRequest",
        "response_ref": "QuarantineCasesResponse",
    },
    {
        "path": "/v1/quarantine/cases/{caseId}/decision",
        "method": "post",
        "tag": "quarantine",
        "operation_id": "decideQuarantineCase",
        "request_ref": "QuarantineDecisionRequest",
        "response_ref": "QuarantineDecisionResponse",
        "parameter_ref": "QuarantineCaseId",
    },
)

EXPECTED_SCHEMAS = {
    "IngestConnectorAuthProfile",
    "IngestConnectorCapability",
    "IngestConnectorManifest",
    "IngestConnectorPreviewProfile",
    "IngestConnectorProfile",
    "IngestConnectorSafetyProfile",
    "IngestNormalizeRequest",
    "IngestNormalizeResponse",
    "IngestOptions",
    "LocalActorId",
    "LocalPath",
    "LocalSourceUri",
    "IngestMediaType",
    "Sha256Checksum",
    "QuarantineCaseId",
    "QuarantineState",
    "QuarantineItem",
    "QuarantineItemsEnvelope",
    "SourceCitation",
    "SourceJsonPathRange",
    "SourceLineRange",
    "SourceRange",
    "SourceRowRange",
    "StructuredIngestRequest",
    "StructuredIngestSummary",
    "StructuredIngestResponse",
    "RepositoryScanRequest",
    "RepositorySourceRecord",
    "RepositoryScanResponse",
    "SearchFilters",
    "SearchQueryRequest",
    "SearchResult",
    "SearchQueryResponse",
    "QuarantineCaseInput",
    "QuarantineCasesRequest",
    "QuarantineSeverity",
    "QuarantineDecisionAction",
    "QuarantineCase",
    "QuarantineCasesResponse",
    "QuarantineDecisionRequest",
    "QuarantineDecisionRecord",
    "QuarantineDecisionCase",
    "QuarantineDecisionResponse",
    "IngestSearchErrorDetails",
    "IngestSearchErrorBody",
    "IngestSearchErrorResponse",
}

REQUIRED_FIELDS = {
    "IngestConnectorAuthProfile": ("mode", "required"),
    "IngestConnectorManifest": ("schemaVersion", "localOnly", "connectors"),
    "IngestConnectorPreviewProfile": ("dryRun", "maxItems", "maxTextBytes"),
    "IngestConnectorProfile": (
        "id",
        "label",
        "description",
        "transport",
        "capabilities",
        "mediaTypes",
        "auth",
        "preview",
        "safety",
    ),
    "IngestConnectorSafetyProfile": (
        "localOnly",
        "networkAccess",
        "durableWrites",
        "untrustedByDefault",
    ),
    "IngestNormalizeRequest": ("workspaceId", "sourceUri", "mediaType", "content"),
    "IngestNormalizeResponse": (
        "ok",
        "sourceUri",
        "mediaType",
        "checksum",
        "normalizedText",
        "untrusted",
    ),
    "StructuredIngestRequest": ("workspaceId", "sourceUri", "mediaType", "content"),
    "StructuredIngestSummary": (
        "documentCount",
        "indexedCount",
        "quarantineCount",
        "validationErrorCount",
    ),
    "StructuredIngestResponse": (
        "ok",
        "sourceUri",
        "mediaType",
        "summary",
        "documents",
        "quarantine",
    ),
    "RepositoryScanRequest": ("workspaceId", "localPath", "options"),
    "RepositorySourceRecord": (
        "sourceUri",
        "path",
        "mediaType",
        "checksum",
        "state",
        "untrusted",
    ),
    "RepositoryScanResponse": ("ok", "workspaceId", "sources"),
    "SearchQueryRequest": ("workspaceId", "query"),
    "SearchResult": (
        "id",
        "score",
        "sourceUri",
        "mediaType",
        "checksum",
        "title",
        "snippet",
        "citations",
        "untrusted",
        "quarantineState",
    ),
    "SearchQueryResponse": ("ok", "workspaceId", "query", "results"),
    "QuarantineCaseInput": (
        "id",
        "sourceUri",
        "checksum",
        "reasonCode",
        "content",
        "citation",
        "untrusted",
    ),
    "QuarantineCasesRequest": ("workspaceId", "items"),
    "QuarantineCase": (
        "id",
        "sourceUri",
        "state",
        "reasonCodes",
        "severity",
        "citationSnapshots",
        "previewText",
        "allowedActions",
    ),
    "QuarantineCasesResponse": ("ok", "cases"),
    "QuarantineDecisionRequest": (
        "workspaceId",
        "actorId",
        "decision",
        "reason",
        "decidedAt",
    ),
    "QuarantineDecisionRecord": ("action", "actorId", "timestamp", "reason", "override"),
    "QuarantineDecisionCase": ("id", "sourceUri", "fromState", "state", "decision"),
    "QuarantineDecisionResponse": ("ok", "case"),
    "IngestSearchErrorBody": ("code", "message", "details"),
    "IngestSearchErrorResponse": ("error",),
}


class ValidateOpenApiIngestSearchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.text = OPENAPI_PATH.read_text(encoding="utf-8")
        cls.lines = cls.text.splitlines()
        cls.examples = json.loads(EXAMPLE_PATH.read_text(encoding="utf-8"))

    def test_paths_match_fixture_contract(self) -> None:
        expected_routes = {
            (operation["method"].upper(), operation["path"])
            for operation in INGEST_SEARCH_OPERATIONS
        }
        fixture_routes = {
            (item["route"]["method"], _normalize_fixture_path(item["route"]["path"]))
            for item in self.examples["requests"]
        }
        self.assertEqual(expected_routes, fixture_routes)

        for operation in INGEST_SEARCH_OPERATIONS:
            with self.subTest(path=operation["path"]):
                path_block = _require_block(self, self.lines, operation["path"], 2)
                method_block = _require_block(self, path_block, operation["method"], 4)
                tag_block = _require_block(self, method_block, "tags", 6)
                request_block = _require_block(self, method_block, "requestBody", 6)
                responses_block = _require_block(self, method_block, "responses", 6)
                status_block = _require_block(self, responses_block, '"200"', 8)
                default_block = _require_block(self, responses_block, "default", 8)

                self.assertIn(f"- {operation['tag']}", _stripped_lines(tag_block))
                self.assertIn(
                    f"operationId: {operation['operation_id']}",
                    _stripped_lines(method_block),
                )
                self.assertTrue(_has_schema_ref(request_block, operation["request_ref"]))
                self.assertTrue(_has_schema_ref(status_block, operation["response_ref"]))
                self.assertIn(
                    '$ref: "#/components/responses/IngestSearchError"',
                    _stripped_lines(default_block),
                )

                parameter_ref = operation.get("parameter_ref")
                if parameter_ref is not None:
                    self.assertIn(
                        f'- $ref: "#/components/parameters/{parameter_ref}"',
                        _stripped_lines(method_block),
                    )

    def test_connector_manifest_route_shape(self) -> None:
        path_block = _require_block(self, self.lines, "/v1/ingest/connectors", 2)
        method_block = _require_block(self, path_block, "get", 4)
        tag_block = _require_block(self, method_block, "tags", 6)
        responses_block = _require_block(self, method_block, "responses", 6)
        status_block = _require_block(self, responses_block, '"200"', 8)
        default_block = _require_block(self, responses_block, "default", 8)

        self.assertIn("- ingest", _stripped_lines(tag_block))
        self.assertIn("operationId: listIngestConnectors", _stripped_lines(method_block))
        self.assertTrue(_has_schema_ref(status_block, "IngestConnectorManifest"))
        self.assertIn(
            '$ref: "#/components/responses/IngestSearchError"',
            _stripped_lines(default_block),
        )

        manifest_block = _require_block(self, self.lines, "IngestConnectorManifest", 4)
        self.assertIn("const: ingest-connector-manifest/v1", _stripped_lines(manifest_block))
        self.assertIn("const: true", _stripped_lines(manifest_block))
        self.assertTrue(_has_schema_ref(manifest_block, "IngestConnectorProfile"))

        profile_block = _require_block(self, self.lines, "IngestConnectorProfile", 4)
        for ref in (
            "IngestConnectorCapability",
            "IngestMediaType",
            "IngestConnectorAuthProfile",
            "IngestConnectorPreviewProfile",
            "IngestConnectorSafetyProfile",
        ):
            with self.subTest(ref=ref):
                self.assertTrue(_has_schema_ref(profile_block, ref))

        safety_block = _require_block(self, self.lines, "IngestConnectorSafetyProfile", 4)
        self.assertIn("networkAccess:", "\n".join(safety_block))
        self.assertIn("durableWrites:", "\n".join(safety_block))
        self.assertIn("const: false", _stripped_lines(safety_block))

    def test_required_schemas_are_declared(self) -> None:
        for schema_name in sorted(EXPECTED_SCHEMAS):
            with self.subTest(schema=schema_name):
                _require_block(self, self.lines, schema_name, 4)

    def test_local_first_request_and_response_shapes(self) -> None:
        source_uri_block = _require_block(self, self.lines, "LocalSourceUri", 4)
        source_uri_text = "\n".join(source_uri_block)
        for scheme in ("fixture", "file", "stdin", "workspace", "local"):
            with self.subTest(scheme=scheme):
                self.assertIn(scheme, source_uri_text)
        self.assertNotIn("http", source_uri_text)

        local_path_text = "\n".join(_require_block(self, self.lines, "LocalPath", 4))
        self.assertIn("(?![A-Za-z]:)", local_path_text)
        self.assertIn("(?!/)", local_path_text)
        self.assertIn(r"\.\.", local_path_text)

        media_type_block = _require_block(self, self.lines, "IngestMediaType", 4)
        for media_type in ("text/plain", "text/markdown", "text/csv", "application/json"):
            with self.subTest(media_type=media_type):
                self.assertIn(f"- {media_type}", _stripped_lines(media_type_block))

        options_block = _require_block(self, self.lines, "IngestOptions", 4)
        for field in ("trusted", "requiredColumns", "uniqueColumns", "includePaths", "maxTextBytes"):
            with self.subTest(option=field):
                self.assertTrue(_has_key(options_block, field, 8))

        filters_block = _require_block(self, self.lines, "SearchFilters", 4)
        for field in ("mediaTypes", "sourceUris", "tags"):
            with self.subTest(filter=field):
                self.assertTrue(_has_key(filters_block, field, 8))

        for schema_name, fields in REQUIRED_FIELDS.items():
            block = _require_block(self, self.lines, schema_name, 4)
            for field in fields:
                with self.subTest(schema=schema_name, field=field):
                    self.assertIn(f"- {field}", _stripped_lines(block))

    def test_citation_search_and_case_shapes(self) -> None:
        source_range_block = _require_block(self, self.lines, "SourceRange", 4)
        for range_schema in ("SourceLineRange", "SourceRowRange", "SourceJsonPathRange"):
            with self.subTest(range_schema=range_schema):
                self.assertTrue(_has_schema_ref(source_range_block, range_schema))

        source_citation_block = _require_block(self, self.lines, "SourceCitation", 4)
        for field in ("sourceUri", "range", "trusted"):
            with self.subTest(citation_field=field):
                self.assertIn(f"- {field}", _stripped_lines(source_citation_block))

        search_result_block = _require_block(self, self.lines, "SearchResult", 4)
        self.assertIn('$ref: "#/components/schemas/SourceCitation"', _stripped_lines(search_result_block))
        self.assertIn("const: clear", _stripped_lines(search_result_block))

        quarantine_item_block = _require_block(self, self.lines, "QuarantineItem", 4)
        self.assertIn("const: open", _stripped_lines(quarantine_item_block))

        action_block = _require_block(self, self.lines, "QuarantineDecisionAction", 4)
        self.assertIn("- release", _stripped_lines(action_block))
        self.assertIn("- reject", _stripped_lines(action_block))

        severity_block = _require_block(self, self.lines, "QuarantineSeverity", 4)
        for severity in ("low", "medium", "high"):
            with self.subTest(severity=severity):
                self.assertIn(f"- {severity}", _stripped_lines(severity_block))

    def test_json_error_envelope_shape(self) -> None:
        response_block = _require_block(self, self.lines, "IngestSearchError", 4)
        self.assertTrue(_has_schema_ref(response_block, "IngestSearchErrorResponse"))

        envelope_block = _require_block(self, self.lines, "IngestSearchErrorResponse", 4)
        self.assertIn("- error", _stripped_lines(envelope_block))
        self.assertTrue(_has_schema_ref(envelope_block, "IngestSearchErrorBody"))

        body_block = _require_block(self, self.lines, "IngestSearchErrorBody", 4)
        for field in ("code", "message", "details"):
            with self.subTest(field=field):
                self.assertIn(f"- {field}", _stripped_lines(body_block))

        details_block = _require_block(self, self.lines, "IngestSearchErrorDetails", 4)
        self.assertTrue(_has_key(details_block, "path", 8))

    def test_openapi_avoids_blocked_terms(self) -> None:
        text = self.text.lower()
        terms = sorted({"".join(parts) for parts in RESTRICTED_PUBLIC_TERM_PARTS})
        for term in terms:
            with self.subTest(term=term):
                if term.isascii():
                    escaped = re.escape(term).replace(r"\ ", r"\s+")
                    pattern = re.compile(rf"(?<![a-z0-9_]){escaped}(?![a-z0-9_])")
                    self.assertIsNone(pattern.search(text))
                else:
                    self.assertNotIn(term, text)


def _normalize_fixture_path(path: str) -> str:
    if re.fullmatch(r"/v1/quarantine/cases/[A-Za-z0-9_.-]+/decision", path):
        return "/v1/quarantine/cases/{caseId}/decision"
    return path


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
