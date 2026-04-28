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
    "## Ingest Connector Resources",
    "## Safe Local Tools",
    "## Untrusted Output Contract",
    "## SDK Entry Points",
    "## Policy Gates",
    "## Approval Sessions",
    "## Audit Outputs",
    "## Audit Replay Output",
    "## Error Shape",
    "## Fixture Replay Contract",
    "## Runtime Router Fixtures",
    "## CLI Commands",
)

EXPECTED_PROTOCOL_NAMES = (
    "`MCP_PROTOCOL_JSONRPC_VERSION`",
    "`MCP_GATEWAY_PROTOCOL_VERSION`",
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
)

EXPECTED_RESOURCES = (
    "`sovereignops://docs/operator-guide`",
    "`sovereignops://tasks/sample-queue`",
    "`sovereignops://incidents/sync-delay-drill`",
    "`sovereignops://search/workspace-index`",
    "`sovereignops://audit/policy-trace`",
    "`sovereignops://ingest/connectors/manifest`",
    "`sovereignops://ingest/connectors/{profileId}`",
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
    "`createGatewayProtocolAdapter`",
    "`handleGatewayProtocolRequest`",
    "`createSafeLocalToolRegistry`",
    "`createSafeLocalToolAdapter`",
    "`callTool`",
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
    "`listMcpResources`",
    "`readMcpResource`",
    "`listMcpTools`",
    "`callMcpTool`",
    "`listMcpApprovalSessions`",
    "`decideMcpApprovalSession`",
    "`createIngestConnectorMcpClient`",
    "`listConnectorResources`",
    "`listMcpConnectorResources`",
    "`readConnectorResource`",
    "`readMcpConnectorResource`",
    "`previewOutput`",
    "`previewManifestResources`",
    "`DEFAULT_INGEST_CONNECTOR_MCP_FIXTURE_PATH`",
    "`loadIngestConnectorMcpFixtureBundle`",
    "`createIngestConnectorMcpFixtureFetch`",
    "`createIngestConnectorMcpFixtureClient`",
    "`createIngestConnectorMcpFixtureClientHarness`",
    "`baseUrlFromIngestConnectorMcpFixtureBundle`",
)

EXPECTED_COMMANDS = (
    "node packages\\cli\\src\\index.ts mcp demo resources --policy-mode allow",
    "node packages\\cli\\src\\index.ts mcp demo read --uri sovereignops://docs/operator-guide",
    "node packages\\cli\\src\\index.ts mcp demo read --uri sovereignops://audit/policy-trace --policy-mode deny-resource-read --deny-uri sovereignops://audit/policy-trace",
    "node packages\\cli\\src\\index.ts mcp api replay --fixture examples\\mcp-gateway\\api-requests.json --method POST --route /v1/mcp/tools/call",
    "node packages\\cli\\src\\index.ts ingest connectors mcp api replay --fixture examples\\ingest-search\\connector-mcp-api-requests.json",
    "node packages\\cli\\src\\index.ts ingest-connector-mcp-api replay --fixture examples\\ingest-search\\connector-mcp-api-requests.json --id mcp_ingest_connector_resources",
    "node packages\\cli\\src\\index.ts mcp demo tool --name create_task_proposal",
    "node packages\\cli\\src\\index.ts mcp demo tool --name create_task_proposal --args-json \"{\\\"title\\\":\\\"Prepare local note summary\\\"}\" --policy-mode require-approval",
    "node packages\\cli\\src\\index.ts mcp api resources --base-url http://127.0.0.1:3000",
    "node packages\\cli\\src\\index.ts mcp api read --base-url http://127.0.0.1:3000 --uri sovereignops://docs/operator-guide",
    "node packages\\cli\\src\\index.ts mcp api tools --base-url http://127.0.0.1:3000",
    "node packages\\cli\\src\\index.ts mcp api call --base-url http://127.0.0.1:3000 --tool-name create_task_proposal",
    "node packages\\cli\\src\\index.ts mcp api approvals --base-url http://127.0.0.1:3000",
    "node packages\\cli\\src\\index.ts mcp api approval-decide --base-url http://127.0.0.1:3000 --session-id approval-route-1 --decision approve",
    "node packages\\cli\\src\\index.ts ingest connectors mcp preview --connector markdown-structured --format json",
)

EXPECTED_INGEST_MCP_PATHS = (
    "`services/mcp-gateway/src/ingestConnectorResources.ts`",
    "`apps/api/src/ingestConnectorMcpRoutes.ts`",
    "`packages/cli/src/ingestConnectorMcpApiReplay.ts`",
    "`packages/cli/src/ingestConnectorMcpPreview.ts`",
    "`packages/sdk-js/src/ingestConnectorMcpClient.ts`",
    "`packages/sdk-js/src/ingestConnectorMcpFixtureFetch.ts`",
    "`packages/schemas/src/ingestConnectorMcpApi.ts`",
    "`apps/web/src/ingestConnectorMcpFixtureState.ts`",
    "`apps/web/src/ingestConnectorMcpState.ts`",
    "`GET /v1/ingest/connectors/mcp/resources`",
    "`GET /v1/ingest/connectors/mcp/resources/{connectorId}`",
    "`POST /v1/ingest/connectors/mcp/preview`",
    "`ingest_connector.preview_manifest`",
    "`IngestConnectorMcpResourceListResponse`",
    "`IngestConnectorMcpResourceResponse`",
    "`IngestConnectorMcpPreviewRequest`",
    "`IngestConnectorMcpPreviewResponse`",
    "`packages/schemas/fixtures/ingest-connector-mcp-resources.schema.json`",
    "`packages/schemas/fixtures/ingest-connector-mcp-resource.schema.json`",
    "`packages/schemas/fixtures/ingest-connector-mcp-preview.schema.json`",
    "`packages/schemas/fixtures/ingest-connector-mcp-api-requests.schema.json`",
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
    "The preview path is local-only and dry-run by default.",
    "Preview output is untrusted by default",
    "`require_approval` and `deny` stop before connector execution.",
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
            + EXPECTED_INGEST_MCP_PATHS
        ):
            with self.subTest(value=value):
                self.assertIn(value, self.text)

    def test_documents_ingest_connector_mcp_resource_preview_contract(self) -> None:
        for value in (
            "`metadata.operation: \"ingest.connector.preview\"`",
            "`metadata.registryKind: \"resource\"`",
            "`metadata.connectorId`",
            "`metadata.resourceUri`",
            "`metadata.dryRun: true`",
            "`localOnly: true`",
            "`networkAccess: false`",
            "`durableWrites: false`",
            "`dryRun: true`",
            "must not open remote URLs",
            "must not require remote credentials",
            "approval step",
            "redacted source URI",
            "terminal decision",
            "`examples/ingest-search/connector-mcp-api-requests.json`",
            "`ingest-connector-mcp-api-requests.v1`",
            "`mcp_ingest_connector_resources`",
            "SDK fixture fetches, CLI replay",
            "Web fixture state, and E2E parity checks",
            "shared schema validator surface",
            "generated JSON schema fixtures",
            "`runIngestConnectorMcpApiReplayCli`",
            "`isIngestConnectorMcpApiReplayCommand`",
            "`createIngestConnectorMcpApiDispatcher`",
            "`buildIngestConnectorMcpFixtureState`",
            "`buildIngestConnectorMcpFixtureRequestCards`",
            "`buildIngestConnectorMcpFixtureSummaryCards`",
            "`buildIngestConnectorMcpFixtureSafetySummary`",
            "`buildIngestConnectorMcpFixtureEmptyState`",
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
            "`listApprovalSessions`",
            "`decideApprovalSession`",
            "`resourceAuditEntries`",
            "`toolAuditEntries`",
            "`request`",
            "`dispatch`",
            "`initialize`",
            "without remote credentials",
        ):
            with self.subTest(value=value):
                self.assertIn(value, self.text)

        for value in (
            '`kind: "mcp-api-fixture-replay"`',
            '`schemaVersion: "mcp-gateway-fixtures.v1"`',
            "`fixture.path`",
            "`filters`",
            "`totalRequests`",
            "`replayedRequests`",
            "`expectedStatus`",
        ):
            with self.subTest(value=value):
                self.assertIn(value, self.text)

    def test_documents_runtime_router_fixture_names(self) -> None:
        for value in (
            "`createApiRouter`",
            "`mountMcpRoutes`",
            "`basePath: \"/v1/mcp\"`",
            "`pathStyle: \"openapi\"`",
            "`resources.json`",
            "`tools.json`",
            "`approval-sessions.json`",
            "`api-requests.json`",
            "`runtime-router.json`",
            "`safety-samples.json`",
            "`mcp-runtime-router-fixture.v1`",
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
            "`GET /v1/mcp/resources`",
            "`POST /v1/mcp/resources/read`",
            "`GET /v1/mcp/tools`",
            "`POST /v1/mcp/tools/call`",
            "`POST /v1/mcp/tools/execute`",
            "`GET /v1/mcp/approval-sessions`",
            "`POST /v1/mcp/approval-sessions/:sessionId/decision`",
        ):
            with self.subTest(value=value):
                self.assertIn(value, self.text)

    def test_documents_audit_replay_output(self) -> None:
        for value in (
            "`services/mcp-gateway/src/auditReplay.ts`",
            "`AuditReplayEntry`",
            "`id`",
            "`timestamp`",
            "`source`",
            "`kind`",
            "`status`",
            "`title`",
            "`subject`",
            "`actorId`",
            "`decision`",
            "`reason`",
            "`arguments`",
            "`request`",
            "`metadata`",
            "`resultSummary`",
            "`safety`",
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
