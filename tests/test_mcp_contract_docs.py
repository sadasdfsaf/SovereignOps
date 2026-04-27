from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
DOC_PATH = ROOT / "docs" / "mcp-contract.md"
SAFETY_SAMPLES_PATH = ROOT / "examples" / "mcp-gateway" / "safety-samples.json"

EXPECTED_SECTIONS = (
    "# MCP Contract",
    "## Protocol Methods",
    "## Adapter Tool Names",
    "## Default Resources",
    "## Safe Local Tools",
    "## Untrusted Output Contract",
    "## SDK Entry Points",
    "## Policy Gates",
    "## Approval Sessions",
    "## Audit Outputs",
    "## Error Shape",
    "## Fixture Replay Contract",
    "## CLI Commands",
)

EXPECTED_PROTOCOL_NAMES = (
    "`MCP_PROTOCOL_JSONRPC_VERSION`",
    "`MCP_GATEWAY_PROTOCOL_VERSION`",
    "`initialize`",
    "`resources/list`",
    "`resources/read`",
    "`tools/list`",
    "`gateway.list_resources`",
    "`gateway.read_resource`",
    "`resources.list`",
    "`resources.read`",
    "`tools.call`",
)

EXPECTED_RESOURCES = (
    "`sovereignops://docs/operator-guide`",
    "`sovereignops://tasks/sample-queue`",
    "`sovereignops://incidents/sync-delay-drill`",
    "`sovereignops://search/workspace-index`",
    "`sovereignops://audit/policy-trace`",
)

EXPECTED_SAFE_TOOLS = (
    "`create_task_proposal`",
    "`draft_document_patch`",
    "`link_evidence`",
    "`propose_automation_rule`",
)

EXPECTED_SDK_NAMES = (
    "`createGatewayResourceRegistry`",
    "`createDefaultGatewayResourceRegistry`",
    "`createGatewayResourceAdapter`",
    "`listResources`",
    "`readResource`",
    "`listTools`",
    "`createMcpProtocolAdapter`",
    "`handle`",
    "`handleRequest`",
    "`handleMcpProtocolRequest`",
    "`createSafeLocalToolRegistry`",
    "`createSafeLocalToolAdapter`",
    "`callTool`",
    "`createMcpSafeLocalToolAdapter`",
    "`createApprovalSessionStore`",
    "`createMcpGatewayRuntime`",
    "`createAuditEmitter`",
    "`createToolAuditEmitter`",
    "`redactSensitiveArguments`",
    "`listMcpResources`",
    "`readMcpResource`",
    "`listMcpTools`",
    "`callMcpTool`",
    "`listMcpApprovalSessions`",
    "`decideMcpApprovalSession`",
)

EXPECTED_COMMANDS = (
    "node packages\\cli\\src\\index.ts mcp demo resources --policy-mode allow",
    "node packages\\cli\\src\\index.ts mcp demo read --uri sovereignops://docs/operator-guide",
    "node packages\\cli\\src\\index.ts mcp demo read --uri sovereignops://audit/policy-trace --policy-mode deny-resource-read --deny-uri sovereignops://audit/policy-trace",
    "node packages\\cli\\src\\index.ts mcp demo tool --name create_task_proposal",
    "node packages\\cli\\src\\index.ts mcp demo tool --name create_task_proposal --args-json \"{\\\"title\\\":\\\"Prepare local note summary\\\"}\" --policy-mode require-approval",
    "node packages\\cli\\src\\index.ts mcp api resources --base-url http://127.0.0.1:3000",
    "node packages\\cli\\src\\index.ts mcp api read --base-url http://127.0.0.1:3000 --uri sovereignops://docs/operator-guide",
    "node packages\\cli\\src\\index.ts mcp api tools --base-url http://127.0.0.1:3000",
    "node packages\\cli\\src\\index.ts mcp api call --base-url http://127.0.0.1:3000 --tool-name create_task_proposal",
    "node packages\\cli\\src\\index.ts mcp api approvals --base-url http://127.0.0.1:3000",
    "node packages\\cli\\src\\index.ts mcp api approval-decide --base-url http://127.0.0.1:3000 --session-id approval-route-1 --decision approve",
)

EXPECTED_SECURITY_GUARANTEES = (
    "Unknown URIs return `resource_not_found` before policy or handlers run.",
    "Traversal-like URI strings are not normalized into existing resources.",
    "Denied and approval-required calls return terminal status without invoking the handler.",
    "Every resource read and tool call is wrapped by a policy gate before user code runs.",
    "`require_approval` and `deny` stop before handler execution.",
    "Markers only identify data boundaries.",
    "Tool arguments are redacted recursively for sensitive names and credential-shaped values.",
    "Redaction replaces matching values with `[REDACTED]` while preserving non-sensitive fields.",
)


class McpContractDocsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.text = DOC_PATH.read_text(encoding="utf-8")
        cls.lower_text = cls.text.lower()

    def test_documents_required_sections(self) -> None:
        self.assertTrue(DOC_PATH.exists())
        for section in EXPECTED_SECTIONS:
            with self.subTest(section=section):
                self.assertIn(section, self.text)

    def test_documents_protocol_resources_tools_and_sdk_names(self) -> None:
        for value in (
            EXPECTED_PROTOCOL_NAMES
            + EXPECTED_RESOURCES
            + EXPECTED_SAFE_TOOLS
            + EXPECTED_SDK_NAMES
        ):
            with self.subTest(value=value):
                self.assertIn(value, self.text)

    def test_documents_commands_and_policy_modes(self) -> None:
        for command in EXPECTED_COMMANDS:
            with self.subTest(command=command):
                self.assertIn(command, self.text)

        for mode in ("`allow`", "`require_approval`", "`deny`", "`pending`", "`approved`", "`rejected`", "`expired`"):
            with self.subTest(mode=mode):
                self.assertIn(mode, self.text)

    def test_documents_safety_marker_contract_and_replay(self) -> None:
        safety_samples = json.loads(SAFETY_SAMPLES_PATH.read_text(encoding="utf-8"))
        markers = safety_samples["markers"]

        self.assertIn("`examples/mcp-gateway/safety-samples.json`", self.text)
        self.assertIn(f"`{markers['begin']}`", self.text)
        self.assertIn(f"`{markers['end']}`", self.text)
        self.assertIn(f"`trust: \"{markers['trust']}\"`", self.text)
        self.assertIn(f"`{markers['rawContentArgument']}`", self.text)

        for command in safety_samples["replay"]["commands"]:
            with self.subTest(command=command):
                self.assertIn(command, self.text)

        for value in (
            "`createMcpGatewayRuntime`",
            "`callTool`",
            "`auditEntries`",
            "without remote credentials",
        ):
            with self.subTest(value=value):
                self.assertIn(value, self.text)

    def test_documents_audit_errors_and_security_guarantees(self) -> None:
        for guarantee in EXPECTED_SECURITY_GUARANTEES:
            with self.subTest(guarantee=guarantee):
                self.assertIn(guarantee, self.text)

        for value in (
            "`policy_decision`",
            "`operation_succeeded`",
            "`operation_failed`",
            "`tool_call_requested`",
            "`tool_call_approved`",
            "`tool_call_approval_required`",
            "`tool_call_denied`",
            "`tool_call_executed`",
            "`tool_call_failed`",
            "`resource_not_found`",
            "`policy_denied`",
            "`approval_required`",
            "`handler_failed`",
            "`invalid_request`",
            "`invalid_params`",
            "`method_not_found`",
            "`internal_error`",
        ):
            with self.subTest(value=value):
                self.assertIn(value, self.text)

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
