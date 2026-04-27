from __future__ import annotations

import re
import unittest
from pathlib import Path

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
DOC_PATH = ROOT / "docs" / "mcp-gateway.md"

EXPECTED_SECTIONS = (
    "# MCP Gateway",
    "## Local-Only Architecture",
    "## Protocol Adapter",
    "## Resource Surface",
    "## Tool Surface",
    "## Approval Sessions",
    "## CLI Demo Workflow",
    "## Audit And Redaction",
    "## Local Validation",
)

EXPECTED_FILES = (
    "services/mcp-gateway/src/registry.ts",
    "services/mcp-gateway/src/adapter.ts",
    "services/mcp-gateway/src/protocol.ts",
    "services/mcp-gateway/src/resources.ts",
    "services/mcp-gateway/src/tools.ts",
    "services/mcp-gateway/src/toolAdapter.ts",
    "services/mcp-gateway/src/approvalSessions.ts",
    "services/mcp-gateway/src/audit.ts",
    "services/mcp-gateway/src/auditEmitter.ts",
)

EXPECTED_ROUTES = (
    "`gateway.list_resources`",
    "`gateway.read_resource`",
    "`resources.list`",
    "`resources.read`",
    "`/tools/local-write`",
    "`/tools/batch-update`",
    "`/tools/summarize`",
    "`/records/catalog`",
)

EXPECTED_RESOURCE_URIS = (
    "`sovereignops://docs/operator-guide`",
    "`sovereignops://tasks/sample-queue`",
    "`sovereignops://incidents/sync-delay-drill`",
    "`sovereignops://search/workspace-index`",
    "`sovereignops://audit/policy-trace`",
)

EXPECTED_TOOLS = (
    "`create_task_proposal`",
    "`draft_document_patch`",
    "`link_evidence`",
    "`propose_automation_rule`",
)

EXPECTED_COMMANDS = (
    "python -m unittest tests.test_mcp_gateway_docs",
    "npm.cmd --workspace @sovereignops/mcp-gateway run check",
    "python scripts\\validate_mcp_gateway_fixtures.py",
    "node packages\\cli\\src\\index.ts mcp demo resources",
    "node packages\\cli\\src\\index.ts mcp demo read --uri sovereignops://docs/operator-guide",
    "node packages\\cli\\src\\index.ts mcp demo tool --name create_task_proposal",
    "node --input-type=module -e",
    "python scripts\\smoke.py",
    "python -m unittest discover -s tests",
    "python scripts\\repo_health.py --json",
)

EXPECTED_GUARANTEES = (
    "No gateway path needs remote credentials.",
    "Unknown URIs return `resource_not_found` before policy or handlers run.",
    "Traversal-like URI strings are not normalized into existing resources.",
    "Denied and approval-required calls return terminal status without invoking the handler.",
    "A reviewed caller can repeat the same call with updated context; policy must return `allow` before the handler runs.",
    "Tool arguments are redacted recursively for sensitive names and credential-shaped values.",
    "Redaction replaces matching values with `[REDACTED]` while preserving non-sensitive fields.",
)


class McpGatewayDocsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.text = DOC_PATH.read_text(encoding="utf-8")
        cls.lower_text = cls.text.lower()

    def test_documents_required_sections(self) -> None:
        self.assertTrue(DOC_PATH.exists())
        for section in EXPECTED_SECTIONS:
            with self.subTest(section=section):
                self.assertIn(section, self.text)

    def test_documents_files_routes_resources_and_tools(self) -> None:
        for relative_path in EXPECTED_FILES:
            with self.subTest(path=relative_path):
                self.assertTrue((ROOT / relative_path).exists(), relative_path)
                self.assertIn(f"`{relative_path}`", self.text)

        for value in EXPECTED_ROUTES + EXPECTED_RESOURCE_URIS + EXPECTED_TOOLS:
            with self.subTest(value=value):
                self.assertIn(value, self.text)

    def test_documents_commands_and_local_demo(self) -> None:
        for command in EXPECTED_COMMANDS:
            with self.subTest(command=command):
                self.assertIn(command, self.text)

        self.assertIn("createGatewayResourceAdapter", self.text)
        self.assertIn("createDefaultGatewayResourceRegistry", self.text)
        self.assertIn("policy: () => 'allow'", self.text)
        self.assertNotIn("curl ", self.lower_text)
        self.assertNotIn("https://", self.lower_text)
        self.assertNotIn("npm install -g", self.lower_text)
        self.assertNotIn("npx ", self.lower_text)

    def test_documents_approval_audit_and_redaction_guarantees(self) -> None:
        for guarantee in EXPECTED_GUARANTEES:
            with self.subTest(guarantee=guarantee):
                self.assertIn(guarantee, self.text)

        for event_type in (
            "`policy_decision`",
            "`operation_succeeded`",
            "`operation_failed`",
            "`tool_call_requested`",
            "`tool_call_approved`",
            "`tool_call_approval_required`",
            "`tool_call_denied`",
            "`tool_call_executed`",
        ):
            with self.subTest(event_type=event_type):
                self.assertIn(event_type, self.text)

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
