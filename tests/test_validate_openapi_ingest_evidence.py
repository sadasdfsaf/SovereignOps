from __future__ import annotations

import re
import unittest
from pathlib import Path


OPENAPI_PATH = Path(__file__).resolve().parents[1] / "docs" / "openapi.yaml"

INGEST_EVIDENCE_OPERATIONS = (
    {
        "path": "/v1/ingest/evidence/export",
        "operation_id": "exportIngestEvidence",
        "response_ref": "IngestEvidenceExportResponse",
    },
    {
        "path": "/v1/ingest/evidence/package",
        "operation_id": "packageIngestEvidence",
        "response_ref": "IngestEvidencePackageResponse",
    },
)

EXPECTED_SCHEMAS = {
    "IngestEvidenceContentDescriptor",
    "IngestEvidenceErrorBody",
    "IngestEvidenceErrorDetails",
    "IngestEvidenceErrorResponse",
    "IngestEvidenceExportFormat",
    "IngestEvidenceExportRequest",
    "IngestEvidenceExportResponse",
    "IngestEvidenceFilters",
    "IngestEvidenceInput",
    "IngestEvidenceJsonValue",
    "IngestEvidenceManifest",
    "IngestEvidenceNormalizedFilters",
    "IngestEvidencePackageFile",
    "IngestEvidencePackageResponse",
    "IngestEvidenceRequestOptions",
    "IngestEvidenceSection",
    "IngestEvidenceSectionDescriptor",
    "IngestEvidenceStringList",
    "IngestEvidenceSummary",
}

REQUEST_FIELDS = ("evidence", "format", "filters", "createdAt", "exportId", "options")
FILTER_FIELDS = ("sections", "evidenceFileIds", "sourceUris", "citationKinds")
MANIFEST_FIELDS = (
    "kind",
    "version",
    "exportId",
    "createdAt",
    "schemaVersion",
    "workspaceId",
    "sessionId",
    "localOnly",
    "filters",
    "evidenceSummary",
    "sections",
    "content",
    "fingerprint",
)


class ValidateOpenApiIngestEvidenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.text = OPENAPI_PATH.read_text(encoding="utf-8")
        cls.lines = cls.text.splitlines()

    def test_paths_share_request_schema_and_error_envelope(self) -> None:
        for operation in INGEST_EVIDENCE_OPERATIONS:
            with self.subTest(path=operation["path"]):
                path_block = _require_block(self, self.lines, operation["path"], 2)
                method_block = _require_block(self, path_block, "post", 4)
                tag_block = _require_block(self, method_block, "tags", 6)
                request_block = _require_block(self, method_block, "requestBody", 6)
                responses_block = _require_block(self, method_block, "responses", 6)
                status_block = _require_block(self, responses_block, '"200"', 8)
                validation_block = _require_block(self, responses_block, '"400"', 8)
                default_block = _require_block(self, responses_block, "default", 8)

                self.assertIn("- ingest", _stripped_lines(tag_block))
                self.assertIn(
                    f"operationId: {operation['operation_id']}",
                    _stripped_lines(method_block),
                )
                self.assertTrue(_has_schema_ref(request_block, "IngestEvidenceExportRequest"))
                self.assertTrue(_has_schema_ref(status_block, operation["response_ref"]))
                self.assertIn(
                    '$ref: "#/components/responses/IngestEvidenceError"',
                    _stripped_lines(validation_block),
                )
                self.assertIn(
                    '$ref: "#/components/responses/IngestEvidenceError"',
                    _stripped_lines(default_block),
                )

    def test_required_components_are_declared(self) -> None:
        for schema_name in sorted(EXPECTED_SCHEMAS):
            with self.subTest(schema=schema_name):
                _require_block(self, self.lines, schema_name, 4)
        _require_block(self, self.lines, "IngestEvidenceError", 4)

    def test_request_schema_matches_route_inputs(self) -> None:
        request_block = _require_block(self, self.lines, "IngestEvidenceExportRequest", 4)
        self.assertIn("- evidence", _stripped_lines(request_block))
        for field in REQUEST_FIELDS:
            with self.subTest(field=field):
                self.assertTrue(_has_key(request_block, field, 8))
        self.assertTrue(_has_schema_ref(request_block, "IngestEvidenceInput"))
        self.assertTrue(_has_schema_ref(request_block, "IngestEvidenceExportFormat"))
        self.assertTrue(_has_schema_ref(request_block, "IngestEvidenceFilters"))
        self.assertTrue(_has_schema_ref(request_block, "IngestEvidenceRequestOptions"))

        options_block = _require_block(self, self.lines, "IngestEvidenceRequestOptions", 4)
        for field in ("format", "filters", "createdAt", "exportId"):
            with self.subTest(option=field):
                self.assertTrue(_has_key(options_block, field, 8))

        filters_block = _require_block(self, self.lines, "IngestEvidenceFilters", 4)
        normalized_block = _require_block(self, self.lines, "IngestEvidenceNormalizedFilters", 4)
        for field in FILTER_FIELDS:
            with self.subTest(filter=field):
                self.assertTrue(_has_key(filters_block, field, 8))
                self.assertIn(f"- {field}", _stripped_lines(normalized_block))

        format_block = _require_block(self, self.lines, "IngestEvidenceExportFormat", 4)
        for value in ("json", "summary", "manifest"):
            with self.subTest(format=value):
                self.assertIn(f"- {value}", _stripped_lines(format_block))

    def test_response_schemas_match_export_and_package_envelopes(self) -> None:
        export_block = _require_block(self, self.lines, "IngestEvidenceExportResponse", 4)
        for field in (
            "kind",
            "version",
            "format",
            "mediaType",
            "content",
            "fingerprint",
            "exportId",
            "createdAt",
            "manifest",
        ):
            with self.subTest(export_field=field):
                self.assertIn(f"- {field}", _stripped_lines(export_block))
        self.assertIn("const: ingest-evidence.export", _stripped_lines(export_block))
        self.assertIn("const: application/json", _stripped_lines(export_block))
        self.assertTrue(_has_schema_ref(export_block, "IngestEvidenceManifest"))

        package_block = _require_block(self, self.lines, "IngestEvidencePackageResponse", 4)
        for field in ("kind", "version", "manifest", "files", "fingerprint"):
            with self.subTest(package_field=field):
                self.assertIn(f"- {field}", _stripped_lines(package_block))
        self.assertIn("const: ingest-evidence.package", _stripped_lines(package_block))
        self.assertTrue(_has_schema_ref(package_block, "IngestEvidenceManifest"))
        self.assertTrue(_has_schema_ref(package_block, "IngestEvidencePackageFile"))

        package_file_block = _require_block(self, self.lines, "IngestEvidencePackageFile", 4)
        for path in ("manifest.json", "evidence.json"):
            with self.subTest(package_path=path):
                self.assertIn(f"- {path}", _stripped_lines(package_file_block))

        manifest_block = _require_block(self, self.lines, "IngestEvidenceManifest", 4)
        for field in MANIFEST_FIELDS:
            with self.subTest(manifest_field=field):
                self.assertIn(f"- {field}", _stripped_lines(manifest_block))
        self.assertIn("const: ingest-evidence.manifest", _stripped_lines(manifest_block))
        self.assertTrue(_has_schema_ref(manifest_block, "IngestEvidenceNormalizedFilters"))
        self.assertTrue(_has_schema_ref(manifest_block, "IngestEvidenceSummary"))
        self.assertTrue(_has_schema_ref(manifest_block, "IngestEvidenceContentDescriptor"))

    def test_validation_error_shape_matches_json_error(self) -> None:
        response_block = _require_block(self, self.lines, "IngestEvidenceError", 4)
        self.assertTrue(_has_schema_ref(response_block, "IngestEvidenceErrorResponse"))

        envelope_block = _require_block(self, self.lines, "IngestEvidenceErrorResponse", 4)
        self.assertIn("- error", _stripped_lines(envelope_block))
        self.assertTrue(_has_schema_ref(envelope_block, "IngestEvidenceErrorBody"))

        body_block = _require_block(self, self.lines, "IngestEvidenceErrorBody", 4)
        for field in ("code", "message"):
            with self.subTest(error_field=field):
                self.assertIn(f"- {field}", _stripped_lines(body_block))
        self.assertTrue(_has_key(body_block, "details", 8))

        details_block = _require_block(self, self.lines, "IngestEvidenceErrorDetails", 4)
        self.assertTrue(_has_key(details_block, "path", 8))
        self.assertTrue(_has_key(details_block, "value", 8))

    def test_local_only_semantics_are_documented_without_external_urls(self) -> None:
        local_markers = []
        checked_blocks = []

        for operation in INGEST_EVIDENCE_OPERATIONS:
            path_block = _require_block(self, self.lines, operation["path"], 2)
            method_block = _require_block(self, path_block, "post", 4)
            method_text = "\n".join(method_block)
            checked_blocks.append(method_text)
            local_markers.append("Local preview only;" in method_text)
            local_markers.append("does not read files or call network services" in method_text)

        for schema_name in EXPECTED_SCHEMAS:
            block_text = "\n".join(_require_block(self, self.lines, schema_name, 4))
            checked_blocks.append(block_text)

        input_text = "\n".join(_require_block(self, self.lines, "IngestEvidenceInput", 4))
        filters_text = "\n".join(_require_block(self, self.lines, "IngestEvidenceFilters", 4))
        local_markers.append("Local evidence JSON" in input_text)
        local_markers.append("local evidence sections" in filters_text)

        self.assertTrue(all(local_markers))
        for block_text in checked_blocks:
            self.assertIsNone(re.search(r"https?://", block_text))


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
