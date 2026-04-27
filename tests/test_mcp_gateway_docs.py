from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
DOC_PATH = ROOT / "docs" / "mcp-gateway.md"
SAFETY_SAMPLES_PATH = ROOT / "examples" / "mcp-gateway" / "safety-samples.json"

EXPECTED_SECTIONS = (
    "# MCP Gateway",
    "## Local-Only Architecture",
    "## Protocol API",
    "## Resource Surface",
    "## Safe Local Tools",
    "## Untrusted Output Markers",
    "## SDK Workflow",
    "## Approval Sessions",
    "## Policy Gates",
    "## CLI Demo Workflow",
    "## Fixture Replay",
    "## Audit Replay Output",
    "## Runtime Router Examples",
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
    "services/mcp-gateway/src/runtime.ts",
    "services/mcp-gateway/src/audit.ts",
    "services/mcp-gateway/src/auditEmitter.ts",
    "services/mcp-gateway/src/auditReplay.ts",
)

EXPECTED_ROUTES = (
    "`initialize`",
    "`resources/list`",
    "`resources/read`",
    "`tools/list`",
    "`tools/call`",
    "`gateway.list_resources`",
    "`gateway.read_resource`",
    "`resources.list`",
    "`resources.read`",
    "`tools.call`",
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

EXPECTED_SDK_NAMES = (
    "`createDefaultGatewayResourceRegistry`",
    "`createGatewayResourceAdapter`",
    "`createMcpProtocolAdapter`",
    "`handleMcpProtocolRequest`",
    "`createGatewayProtocolAdapter`",
    "`handleGatewayProtocolRequest`",
    "`createGatewayResourceRegistry`",
    "`createSafeLocalToolRegistry`",
    "`createSafeLocalToolAdapter`",
    "`createMcpSafeLocalToolAdapter`",
    "`createApprovalSessionStore`",
    "`createMcpGatewayRuntime`",
    "`createLocalMcpRuntimeClient`",
    "`createLocalMcpClient`",
    "`createLocalMcpProtocolClient`",
    "`createLocalMcpJsonRpcClient`",
    "`createLocalMcpProtocolRuntimeClient`",
    "`createMcpRuntimeRouteDependencies`",
    "`previewRuntimeToolCall`",
    "`createAuditEmitter`",
    "`createToolAuditEmitter`",
    "`redactSensitiveArguments`",
    "`createAuditReplayEntries`",
    "`normalizeAuditReplay`",
    "`createMcpAuditReplayEntries`",
    "`normalizeMcpAuditReplayEntries`",
)

EXPECTED_COMMANDS = (
    "python -m unittest tests.test_mcp_gateway_docs",
    "npm.cmd --workspace @sovereignops/mcp-gateway run check",
    "python scripts\\validate_mcp_gateway_fixtures.py",
    "node packages\\cli\\src\\index.ts mcp demo resources",
    "node packages\\cli\\src\\index.ts mcp demo resources --policy-mode allow",
    "node packages\\cli\\src\\index.ts mcp api replay --fixture examples\\mcp-gateway\\api-requests.json --method POST --route /v1/mcp/tools/call",
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
    "Default outputs set `durableSideEffects: false`",
    "Every resource read and tool call evaluates policy before user code runs.",
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

    def test_documents_sdk_entry_points(self) -> None:
        for name in EXPECTED_SDK_NAMES:
            with self.subTest(name=name):
                self.assertIn(name, self.text)

        for method in (
            "`listResources`",
            "`readResource`",
            "`listTools`",
            "`callTool`",
            "`handle`",
            "`handleRequest`",
            "`listMcpResources`",
            "`readMcpResource`",
            "`listMcpTools`",
            "`callMcpTool`",
            "`listMcpApprovalSessions`",
            "`decideMcpApprovalSession`",
            "`resourceAuditEntries`",
            "`toolAuditEntries`",
            "`auditEntries`",
            "`listApprovalSessions`",
            "`decideApprovalSession`",
            "`request`",
            "`dispatch`",
            "`initialize`",
            "`createApiRouter`",
            "`mountMcpRoutes`",
        ):
            with self.subTest(method=method):
                self.assertIn(method, self.text)

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

    def test_documents_safety_markers_fixture_replay_and_runtime_sdk(self) -> None:
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

        self.assertIn("`createMcpGatewayRuntime`", self.text)
        self.assertIn("one in-process object", self.text)
        self.assertIn('`kind: "mcp-api-fixture-replay"`', self.text)
        self.assertIn('`schemaVersion: "mcp-gateway-fixtures.v1"`', self.text)
        for field in (
            "`fixture.path`",
            "`filters`",
            "`totalRequests`",
            "`replayedRequests`",
            "`expectedStatus`",
        ):
            with self.subTest(field=field):
                self.assertIn(field, self.text)

    def test_documents_runtime_router_fixture_names(self) -> None:
        for fixture_name in (
            "`resources.json`",
            "`tools.json`",
            "`approval-sessions.json`",
            "`api-requests.json`",
            "`runtime-router.json`",
            "`safety-samples.json`",
        ):
            with self.subTest(fixture_name=fixture_name):
                self.assertIn(fixture_name, self.text)

        for request_id in (
            "`runtime_resource_list`",
            "`runtime_resource_read`",
            "`runtime_tool_call_safety`",
            "`runtime_approval_create`",
            "`runtime_approval_list_pending`",
            "`runtime_approval_decision`",
            "`api_resource_list`",
            "`api_resource_read`",
            "`api_tool_list`",
            "`api_tool_call`",
            "`api_approval_list`",
            "`api_approval_decision`",
        ):
            with self.subTest(request_id=request_id):
                self.assertIn(request_id, self.text)

        for route in (
            "`GET /v1/mcp/resources`",
            "`POST /v1/mcp/resources/read`",
            "`GET /v1/mcp/tools`",
            "`POST /v1/mcp/tools/call`",
            "`POST /v1/mcp/tools/execute`",
            "`GET /v1/mcp/approval-sessions`",
            "`POST /v1/mcp/approval-sessions/:sessionId/decision`",
        ):
            with self.subTest(route=route):
                self.assertIn(route, self.text)

        self.assertIn("`mcp-runtime-router-fixture.v1`", self.text)

    def test_documents_audit_replay_output(self) -> None:
        for value in (
            "`AuditReplayEntry`",
            "`id`",
            "`timestamp`",
            "`source`",
            "`kind`",
            "`status`",
            "`title`",
            "`subject`",
            "`tool_audit`",
            "`resource_audit`",
            "`approval_session`",
            "`safety_annotation`",
            "`tool_requested`",
            "`tool_approval_required`",
            "`tool_executed`",
            "`resource_read_succeeded`",
            "`resource_read_denied`",
            "`approval_session_pending`",
            "`approval_session_approved`",
            "`safety_summary`",
        ):
            with self.subTest(value=value):
                self.assertIn(value, self.text)

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
            "`tool_call_failed`",
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
