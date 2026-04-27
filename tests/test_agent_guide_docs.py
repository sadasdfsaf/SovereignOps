from __future__ import annotations

import re
import unittest
from pathlib import Path

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
DOC_PATH = ROOT / "docs" / "agent-guide.md"

EXPECTED_SECTIONS = (
    "# Agent Guide",
    "## Operating Principles",
    "## Local-First Data Flow",
    "## Approval Rules",
    "## Audit Detail",
    "## Plugin Boundary",
    "## Tool Proposals",
    "## MCP Ingest Connector Preview",
    "## Backup And Restore Behavior",
    "## Sync Behavior",
    "## Failure Handling",
)

EXPECTED_MCP_CONNECTOR_VALUES = (
    "`services/mcp-gateway/src/ingestConnectorResources.ts`",
    "`sovereignops://ingest/connectors/manifest`",
    "`sovereignops://ingest/connectors/{profileId}`",
    "`apps/api/src/ingestConnectorMcpRoutes.ts`",
    "`packages/cli/src/ingestConnectorMcpPreview.ts`",
    "`packages/sdk-js/src/ingestConnectorMcpClient.ts`",
    "`apps/web/src/ingestConnectorMcpState.ts`",
    "`GET /v1/ingest/connectors/mcp/resources`",
    "`GET /v1/ingest/connectors/mcp/resources/{connectorId}`",
    "`POST /v1/ingest/connectors/mcp/preview`",
    "`ingest_connector.preview_manifest`",
    "`createIngestConnectorMcpClient`",
    "`listResources`",
    "`listConnectorResources`",
    "`listMcpConnectorResources`",
    "`readResource`",
    "`readConnectorResource`",
    "`readMcpConnectorResource`",
    "`preview`",
    "`previewOutput`",
    "`previewManifestResources`",
    "`buildIngestConnectorMcpState`",
    "`buildIngestConnectorMcpCards`",
    "`buildIngestConnectorMcpRows`",
    "`buildIngestConnectorMcpSections`",
    "`buildIngestConnectorMcpEmptyState`",
    "`getIngestConnectorMcpStatusLabel`",
    "`localOnly: true`",
    "`networkAccess: false`",
    "`durableWrites: false`",
    "`dryRun: true`",
)

EXPECTED_COMMANDS = (
    "node packages\\cli\\src\\index.ts ingest connectors mcp preview --connector markdown-structured --format json",
)


class AgentGuideDocsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.text = DOC_PATH.read_text(encoding="utf-8")
        cls.lower_text = cls.text.lower()
        cls.normalized_lower_text = re.sub(r"\s+", " ", cls.lower_text)

    def test_documents_required_sections(self) -> None:
        self.assertTrue(DOC_PATH.is_file())
        for section in EXPECTED_SECTIONS:
            with self.subTest(section=section):
                self.assertIn(section, self.text)

    def test_documents_mcp_ingest_connector_preview_contract(self) -> None:
        for value in EXPECTED_MCP_CONNECTOR_VALUES + EXPECTED_COMMANDS:
            with self.subTest(value=value):
                self.assertIn(value, self.text)

        for phrase in (
            "exact resource uris",
            "dry-run preview surfaces",
            "local-only",
            "no-network",
            "dry-run",
            "source uris",
            "untrusted by default",
            "preserve untrusted markers",
            "stop before connector execution",
            "ask for approval before turning a preview into a durable import",
            "emit audit detail",
            "redacted source uri",
            "no-network flag",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.normalized_lower_text)

        for scheme in ("fixture://", "file://", "stdin://", "workspace://", "local://"):
            with self.subTest(scheme=scheme):
                self.assertIn(scheme, self.text)

    def test_avoids_restricted_terms(self) -> None:
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
