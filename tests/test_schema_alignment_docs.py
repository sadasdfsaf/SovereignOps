from __future__ import annotations

import re
import unittest
from pathlib import Path

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
DOC_PATH = ROOT / "docs" / "schema-alignment.md"

EXPECTED_SECTIONS = (
    "# Schema Alignment",
    "## Canonical Vocabulary",
    "## Record Schema Rules",
    "## Rust Alignment",
    "## TypeScript Alignment",
    "## Python Alignment",
    "## OpenAPI Alignment",
    "## MCP Alignment",
    "## API Errors",
    "## Event Fixtures",
    "## Redaction",
    "## JSON Schema Export",
    "## Compatibility Testing",
    "## Change Checklist",
)

EXPECTED_SCHEMA_VALUES = (
    "`docs`",
    "`projects`",
    "`incidents`",
    "`comments`",
    "`attachments`",
    "`approvals`",
    "`doc_`",
    "`prj_`",
    "`inc_`",
    "`cmt_`",
    "`att_`",
    "`apv_`",
    "`wsp_`",
    "`act_`",
    "`dev_`",
    "`evt_`",
    "`low`",
    "`medium`",
    "`high`",
    "`allow`",
    "`require_approval`",
    "`deny`",
    "`read_object`",
    "`write_object`",
    "`propose_agent_action`",
    "`manage_plugin`",
    "`sync_bundle`",
)

EXPECTED_ALIGNMENT_REFERENCES = (
    "`crates/sovereign_core`",
    "`packages/schemas/src/index.ts`",
    "`packages/schemas/src/jsonSchema.ts`",
    "`packages/schemas/src/ingestConnectorMcpApi.ts`",
    "`packages/schemas/src/pluginReviewArtifact.ts`",
    "`packages/schemas/src/pluginReviewArtifactRecord.ts`",
    "`packages/schemas/src/mcpApprovalEvidence.ts`",
    "`packages/schemas/src/mcpApprovalEvidenceRecord.ts`",
    "`docs/openapi.yaml`",
    "`docs/mcp-contract.md`",
    "`ValidationIssue`",
    "`ErrorResponse`",
    "`AuditReplayEntry`",
    "`schemaDefinitions`",
    "`validateSovereignRecord`",
    "`jsonSchemaCatalog`",
    "`schema-catalog.json`",
    "`mcp-gateway-fixtures.v1`",
    "`IngestConnectorMcpResourceListResponse`",
    "`IngestConnectorMcpResourceResponse`",
    "`IngestConnectorMcpPreviewRequest`",
    "`IngestConnectorMcpPreviewResponse`",
    "`packages/schemas/fixtures/ingest-connector-mcp-resources.schema.json`",
    "`packages/schemas/fixtures/ingest-connector-mcp-resource.schema.json`",
    "`packages/schemas/fixtures/ingest-connector-mcp-preview.schema.json`",
    "`packages/schemas/fixtures/ingest-connector-mcp-api-requests.schema.json`",
    "`packages/schemas/fixtures/plugin-review-artifact-api-requests.schema.json`",
    "`packages/schemas/fixtures/plugin-review-artifact-records-requests.schema.json`",
    "`packages/schemas/fixtures/mcp-approval-evidence-preview-requests.schema.json`",
    "`packages/schemas/fixtures/mcp-approval-evidence-records-requests.schema.json`",
    "`tests/test_validate_openapi_ingest_connector_mcp.py`",
    "`tests/test_validate_openapi_ingest_connector_mcp_fixture.py`",
    "`tests/test_ingest_connector_mcp_api_e2e.py`",
    "`tests/test_plugin_review_artifact_api_docs.py`",
    "`tests/test_plugin_review_artifact_records_api_docs.py`",
    "`tests/test_mcp_approval_evidence_api_docs.py`",
    "`tests/test_mcp_approval_evidence_records_api_docs.py`",
    "`[REDACTED]`",
    "`[redacted]`",
)

EXPECTED_COMMANDS = (
    "python scripts\\validate_openapi.py",
    "node packages\\schemas\\scripts\\export-json-schema.mjs --check",
    "node packages\\schemas\\scripts\\export-json-schema.mjs",
    "python scripts\\validate_lifecycle_fixtures.py",
    "python scripts\\validate_mcp_gateway_fixtures.py",
    "python -m unittest discover -s tests",
)


class SchemaAlignmentDocsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.text = DOC_PATH.read_text(encoding="utf-8")
        cls.lower_text = cls.text.lower()

    def test_documents_required_alignment_sections(self) -> None:
        self.assertTrue(DOC_PATH.is_file())
        for section in EXPECTED_SECTIONS:
            with self.subTest(section=section):
                self.assertIn(section, self.text)

    def test_documents_schema_vocabulary_and_cross_layer_references(self) -> None:
        for value in EXPECTED_SCHEMA_VALUES + EXPECTED_ALIGNMENT_REFERENCES:
            with self.subTest(value=value):
                self.assertIn(value, self.text)

        for value in ("Rust", "TypeScript", "Python", "OpenAPI", "MCP"):
            with self.subTest(value=value):
                self.assertIn(value, self.text)

    def test_documents_errors_fixtures_redaction_and_export_rules(self) -> None:
        for phrase in (
            "All transports use a stable error envelope",
            "Event fixtures are compatibility assets",
            "Redaction rules must produce the same observable behavior",
            "JSON Schema exports are generated",
            "Compatibility tests should compare contracts across layers",
            "Do not hand-edit exported fixture schemas.",
            "Shared ingest connector MCP schema validators",
            "Shared MCP approval evidence request bundle validators",
            "request bundle validators",
            "public fixture paths",
            "local-only expectations",
            "redaction expectations",
            "generated schemas, route contracts, or fixture replay",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.text)

        for command in EXPECTED_COMMANDS:
            with self.subTest(command=command):
                self.assertIn(f"`{command}`", self.text)

    def test_document_avoids_restricted_public_content_terms(self) -> None:
        restricted_terms = sorted({"".join(parts) for parts in RESTRICTED_PUBLIC_TERM_PARTS})
        for term in restricted_terms:
            with self.subTest(term=term):
                if term.isascii():
                    escaped = re.escape(term).replace(r"\ ", r"\s+")
                    pattern = re.compile(rf"(?<![a-z0-9_]){escaped}(?![a-z0-9_])")
                    self.assertIsNone(pattern.search(self.lower_text))
                else:
                    self.assertNotIn(term, self.lower_text)


if __name__ == "__main__":
    unittest.main()
