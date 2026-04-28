# MCP Contract

This contract describes the local MCP gateway surface for clients and plugins. The surface is intentionally small: resources are read by exact URI, tools create proposal payloads, policy runs before handlers, approval decisions stop execution, and audit output is redacted before storage.

## Protocol Methods

| Method | Params | Result |
| --- | --- | --- |
| `initialize` | optional object | `protocolVersion`, `capabilities`, and `serverInfo`. |
| `resources/list` | optional object | Resource summaries allowed by policy. |
| `resources/read` | `{ "uri": "sovereignops://..." }` | One or more content entries for the exact URI. |
| `tools/list` | optional object | Tool metadata for `gateway.list_resources` and `gateway.read_resource`. |
| `tools/call` | `{ "name": "create_task_proposal", "arguments": { ... } }` | Safe local tool result with `content` and optional `structuredContent`. |

Protocol constants are `MCP_PROTOCOL_JSONRPC_VERSION` set to `2.0` and `MCP_GATEWAY_PROTOCOL_VERSION` set to `2024-11-05`.
Tool-call JSON-RPC responses include `auditRecords` when the adapter emits tool audit rows.

## Adapter Tool Names

| Tool name | Required input | Output |
| --- | --- | --- |
| `gateway.list_resources` | none | MCP resource summaries. |
| `gateway.read_resource` | `uri` | MCP resource contents. |

The adapter also sends policy operation markers `resources.list`, `resources.read`, and `tools.call` through metadata so callers can make stable policy decisions.

## Default Resources

| Resource URI | Capability | Notes |
| --- | --- | --- |
| `sovereignops://docs/operator-guide` | `read_object` | Local operator reference. |
| `sovereignops://tasks/sample-queue` | `read_object` | Sample task queue. |
| `sovereignops://incidents/sync-delay-drill` | `read_object` | Sample sync drill notes. |
| `sovereignops://search/workspace-index` | `read_object` | Sample local search metadata. |
| `sovereignops://audit/policy-trace` | `read_object` | Sample policy trace. |

Unknown URIs return `resource_not_found` before policy or handlers run. Traversal-like URI strings are not normalized into existing resources.

## Ingest Connector Resources

The MCP ingest connector parity surface is resource-first. `services/mcp-gateway/src/ingestConnectorResources.ts` registers connector resources, normalizes preview output, and attaches policy and audit metadata before clients see connector content.

| Resource URI | Capability | Notes |
| --- | --- | --- |
| `sovereignops://ingest/connectors/manifest` | `read_object` | Reads the normalized local connector manifest and readiness metadata. |
| `sovereignops://ingest/connectors/{profileId}` | `read_object` | Reads one connector profile, supported source schemes, preview limits, and safety flags. |

The preview surface is the safe local tool `ingest_connector.preview_manifest`, not a durable resource write. It returns manifest counts, readiness, and an optional connector profile with no side effects.

Preview surfaces share the same public contract:

- CLI: `packages/cli/src/ingestConnectorMcpPreview.ts` provides `node packages\cli\src\index.ts ingest connectors mcp preview --connector markdown-structured --format json`.
- API: `apps/api/src/ingestConnectorMcpRoutes.ts` documents `GET /v1/ingest/connectors/mcp/resources`, `GET /v1/ingest/connectors/mcp/resources/{connectorId}`, and `POST /v1/ingest/connectors/mcp/preview`.
- SDK: `packages/sdk-js/src/ingestConnectorMcpClient.ts` exposes `createIngestConnectorMcpClient`, `listResources`, `listConnectorResources`, `listMcpConnectorResources`, `readResource`, `readConnectorResource`, `readMcpConnectorResource`, `preview`, `previewOutput`, and `previewManifestResources`.
- Web: `apps/web/src/ingestConnectorMcpState.ts` turns the same local preview envelope into connector cards, preview rows, request cards, empty states, dry-run labels, safety status, and audit references.

The shared schema validator surface is `packages/schemas/src/ingestConnectorMcpApi.ts`.
It defines the public ingest connector MCP API schema names for
`IngestConnectorMcpResourceListResponse`,
`IngestConnectorMcpResourceResponse`, `IngestConnectorMcpPreviewRequest`, and
`IngestConnectorMcpPreviewResponse`. Its generated JSON schema fixtures include
`packages/schemas/fixtures/ingest-connector-mcp-resources.schema.json`,
`packages/schemas/fixtures/ingest-connector-mcp-resource.schema.json`,
`packages/schemas/fixtures/ingest-connector-mcp-preview.schema.json`, and
`packages/schemas/fixtures/ingest-connector-mcp-api-requests.schema.json`.

The preview path is local-only and dry-run by default. Fixture input must be a repository-local JSON file, and resource payloads may only describe `fixture://`, `file://`, `stdin://`, `workspace://`, or `local://` source URIs. The path must not open remote URLs, must not require remote credentials, and must report `localOnly: true`, `networkAccess: false`, `durableWrites: false`, and `dryRun: true` when preview status is present. Preview output is untrusted by default, so rendered content keeps the untrusted markers and callers must not convert preview rows into durable records without a separate approval step.

The route replay fixture for this surface is
`examples/ingest-search/connector-mcp-api-requests.json`. It uses
`ingest-connector-mcp-api-requests.v1` and captures local JSON requests for
`GET /v1/ingest/connectors/mcp/resources`,
`GET /v1/ingest/connectors/mcp/resources/{connectorId}`, and
`POST /v1/ingest/connectors/mcp/preview`. SDK fixture fetches, CLI replay,
Web fixture state, and E2E parity checks should consume that same fixture so
resource, preview, and validation-error envelopes stay aligned. The resource
list request id is `mcp_ingest_connector_resources`.

The local replay and fixture harnesses are public alignment surfaces:
`packages/cli/src/ingestConnectorMcpApiReplay.ts` exports
`runIngestConnectorMcpApiReplayCli`,
`isIngestConnectorMcpApiReplayCommand`, and
`createIngestConnectorMcpApiDispatcher`;
`packages/sdk-js/src/ingestConnectorMcpFixtureFetch.ts` exports
`DEFAULT_INGEST_CONNECTOR_MCP_FIXTURE_PATH`,
`loadIngestConnectorMcpFixtureBundle`,
`createIngestConnectorMcpFixtureFetch`,
`createIngestConnectorMcpFixtureClient`,
`createIngestConnectorMcpFixtureClientHarness`, and
`baseUrlFromIngestConnectorMcpFixtureBundle`; and
`apps/web/src/ingestConnectorMcpFixtureState.ts` exports
`buildIngestConnectorMcpFixtureState`,
`buildIngestConnectorMcpFixtureRequestCards`,
`buildIngestConnectorMcpFixtureSummaryCards`,
`buildIngestConnectorMcpFixtureSafetySummary`, and
`buildIngestConnectorMcpFixtureEmptyState`.

Resource reads and preview calls run through the policy gate with stable metadata such as `metadata.operation: "resources.read"` or `metadata.operation: "ingest.connector.preview"`, `metadata.registryKind: "resource"`, `metadata.connectorId`, `metadata.resourceUri`, and `metadata.dryRun: true`. `require_approval` and `deny` stop before connector execution. Audit rows must include the connector id, resource URI, redacted source URI when supplied, dry-run flag, local-only flag, no-network flag, and the terminal decision.

## Safe Local Tools

| Tool | Required input | Output kind |
| --- | --- | --- |
| `create_task_proposal` | `title` | `task_proposal` |
| `draft_document_patch` | `targetPath` | `document_patch` |
| `link_evidence` | `evidenceRef`, `targetRef` | `evidence_link_proposal` |
| `propose_automation_rule` | `name` | `automation_rule_proposal` |

Safe local tools run through policy first and default to `durableSideEffects: false`. Denied and approval-required calls return terminal status without invoking the handler.

## Untrusted Output Contract

Untrusted text that appears in tool arguments or returned content uses the same public marker vocabulary everywhere:

| Contract field | Required value |
| --- | --- |
| Begin marker | `<UNTRUSTED_CONTENT>` |
| End marker | `</UNTRUSTED_CONTENT>` |
| Trust metadata | `trust: "untrusted"` |
| Raw payload argument | `rawUntrustedContent` |

Markers only identify data boundaries. The policy gate still decides whether a tool can run, and `require_approval` or `deny` still stops execution before the handler. The public alignment fixture is `examples/mcp-gateway/safety-samples.json`.

## SDK Entry Points

Use these TypeScript exports for local wiring:

| SDK name | Contract |
| --- | --- |
| `createGatewayResourceRegistry` | Creates a URI resource registry. |
| `createDefaultGatewayResourceRegistry` | Creates the default local resource registry. |
| `createGatewayResourceAdapter` | Provides `listResources`, `readResource`, and `listTools`. |
| `createMcpProtocolAdapter` | Provides `handle` and `handleRequest` for JSON-RPC requests. |
| `handleMcpProtocolRequest` | Handles a JSON-RPC request with an adapter and context. |
| `createGatewayProtocolAdapter` | Alias for `createMcpProtocolAdapter`. |
| `handleGatewayProtocolRequest` | Alias for `handleMcpProtocolRequest`. |
| `createSafeLocalToolRegistry` | Creates the default safe local tool registry. |
| `createSafeLocalToolAdapter` | Provides `listTools` and `callTool` for safe local tools. |
| `createMcpSafeLocalToolAdapter` | Alias for `createSafeLocalToolAdapter`. |
| `createApprovalSessionStore` | Creates an in-memory approval session store. |
| `createMcpGatewayRuntime` | Composes resources, tools, approvals, policy, and audit capture for local API wiring. |
| `createLocalMcpRuntimeClient` | Creates the local JavaScript SDK helper around `createMcpGatewayRuntime`. |
| `createLocalMcpClient` | Alias for `createLocalMcpRuntimeClient`. |
| `createLocalMcpProtocolClient` | Creates a local JSON-RPC SDK helper for `tools/call` and resource methods. |
| `createLocalMcpJsonRpcClient` | Alias for `createLocalMcpProtocolClient`. |
| `createLocalMcpProtocolRuntimeClient` | Alias for `createLocalMcpProtocolClient`. |
| `createMcpRuntimeRouteDependencies` | Creates runtime-backed dependencies for `mountMcpRoutes`. |
| `previewRuntimeToolCall` | Runs route preview calls against a local runtime. |
| `createAuditEmitter` | Emits resource and registry audit records. |
| `createToolAuditEmitter` | Emits tool audit records with redacted arguments. |
| `redactSensitiveArguments` | Redacts nested sensitive names and credential-shaped values. |
| `createAuditReplayEntries` | Normalizes tool, resource, approval, and safety records into replay rows. |
| `normalizeAuditReplay` | Alias for `createAuditReplayEntries`. |
| `createMcpAuditReplayEntries` | Alias for `createAuditReplayEntries`. |
| `normalizeMcpAuditReplayEntries` | Alias for `createAuditReplayEntries`. |

The JavaScript SDK client mirrors the OpenAPI operation ids with `listMcpResources`, `readMcpResource`, `listMcpTools`, `callMcpTool`, `listMcpApprovalSessions`, and `decideMcpApprovalSession`.

`createMcpGatewayRuntime` is the local SDK entry point for one-object runtime use: it exposes resource reads, `callTool`, approval sessions, and `auditEntries` snapshots without remote credentials. `packages/sdk-js/src/localMcp.ts` wraps it with `listApprovalSessions`, `decideApprovalSession`, `resourceAuditEntries`, `toolAuditEntries`, and `auditEntries`. `packages/sdk-js/src/localMcpProtocol.ts` wraps the same runtime with `request`, `dispatch`, `initialize`, `listResources`, `readResource`, `listTools`, and `callTool` JSON-RPC helpers.

## Policy Gates

Every resource read and tool call is wrapped by a policy gate before user code runs.

| Gate input | Source |
| --- | --- |
| `path` | Resource URI or caller-registered path. |
| `capability` | One of `read_object`, `write_object`, or `propose_agent_action`. |
| `actor` | Optional caller metadata. |
| `metadata.operation` | `resources.list`, `resources.read`, or `tools.call` where applicable. |
| `metadata.registryKind` | `resource` or `tool` for registry-style paths. |

Policy decisions are `allow`, `require_approval`, and `deny`. `allow` executes the handler; `require_approval` and `deny` stop before handler execution.

## Approval Sessions

Approval sessions are local review records created with `createApprovalSessionStore`. Session ids default to the `approval_` prefix. States are `pending`, `approved`, `rejected`, and `expired`.

Session snapshots include `request`, optional `actor`, `reason`, `ruleId`, `metadata`, timestamps, and terminal decision fields such as `approvedAt`, `rejectedAt`, or `expiredAt`.

## Audit Outputs

| Event type | Required fields | Optional fields |
| --- | --- | --- |
| `policy_decision` | `id`, `timestamp`, `path`, `capability`, `decision` | `message`, `metadata.ruleId` |
| `operation_succeeded` | `id`, `timestamp`, `path`, `capability`, `decision` | `metadata.changedPaths` |
| `operation_failed` | `id`, `timestamp`, `path`, `capability`, `decision`, `message` | `metadata.errorCode` |
| `tool_call_requested` | `id`, `timestamp`, `toolName` | `arguments`, `actorId`, `metadata` |
| `tool_call_approved` | `id`, `timestamp`, `toolName`, `decision` | `reason`, `metadata.ruleId` |
| `tool_call_approval_required` | `id`, `timestamp`, `toolName`, `decision` | `reason`, `metadata.ruleId`, `metadata.approvalId` |
| `tool_call_denied` | `id`, `timestamp`, `toolName`, `decision` | `reason`, `metadata.ruleId` |
| `tool_call_executed` | `id`, `timestamp`, `toolName`, `decision` | `resultSummary` |
| `tool_call_failed` | `id`, `timestamp`, `toolName` | `reason`, `metadata.code` |

Audit ids use `audit_` for resource and registry records and `tool_audit_` for tool records. Tool arguments are redacted recursively for sensitive names and credential-shaped values. Redaction replaces matching values with `[REDACTED]` while preserving non-sensitive fields.

## Audit Replay Output

`services/mcp-gateway/src/auditReplay.ts` exports `createAuditReplayEntries`, `normalizeAuditReplay`, `createMcpAuditReplayEntries`, and `normalizeMcpAuditReplayEntries`. Replay output rows use the `AuditReplayEntry` shape: `id`, `timestamp`, `source`, `kind`, `status`, `title`, `subject`, and optional `actorId`, `decision`, `reason`, `arguments`, `request`, `metadata`, `resultSummary`, and `safety`.

Source kinds are `tool_audit`, `resource_audit`, `approval_session`, and `safety_annotation`. Replay kinds include `tool_requested`, `tool_approval_required`, `tool_executed`, `resource_read_succeeded`, `resource_read_denied`, `approval_session_pending`, `approval_session_approved`, and `safety_summary`.

## Error Shape

JSON-RPC protocol errors return `error.code`, `error.message`, and `error.data`. Gateway data errors include `ok: false`, a stable `error.code`, and any audit intents collected before the stop.

Known gateway codes are `resource_not_found`, `policy_denied`, `approval_required`, and `handler_failed`. Protocol validation can return `invalid_request`, `invalid_params`, `method_not_found`, and `internal_error`.

## Fixture Replay Contract

Fixture replay stays local and deterministic:

```powershell
python scripts\validate_mcp_gateway_fixtures.py
node packages\cli\src\index.ts mcp api replay --fixture examples\mcp-gateway\api-requests.json
node packages\cli\src\index.ts mcp api replay --fixture examples\mcp-gateway\api-requests.json --method POST --route /v1/mcp/tools/call
node packages\cli\src\index.ts ingest connectors mcp api replay --fixture examples\ingest-search\connector-mcp-api-requests.json
node packages\cli\src\index.ts ingest-connector-mcp-api replay --fixture examples\ingest-search\connector-mcp-api-requests.json --id mcp_ingest_connector_resources
node packages\cli\src\index.ts mcp demo tool --name create_task_proposal --args-json "{\"title\":\"Review untrusted partner note\",\"description\":\"Create a local review task from marked untrusted content.\"}"
node packages\cli\src\index.ts mcp demo tool --name draft_document_patch --args-json "{\"targetPath\":\"docs/public-note-summary.md\",\"summary\":\"Draft patch from marked untrusted content\",\"patch\":\"Record the requested note summary as a reviewed draft.\"}" --policy-mode require-approval
node --input-type=module -e "import { createMcpGatewayRuntime } from './services/mcp-gateway/src/index.ts'; const gateway = createMcpGatewayRuntime(); console.log(gateway.listTools().value.tools.map((tool) => tool.name));"
```

Replay output uses `kind: "mcp-api-fixture-replay"`, `schemaVersion: "mcp-gateway-fixtures.v1"`, `fixture.path`, optional `filters`, `totalRequests`, `replayedRequests`, and replayed `requests` entries with `id`, `method`, `path`, `body`, and `expectedStatus`.

## Runtime Router Fixtures

Runtime router examples mount with `createApiRouter`, `mountMcpRoutes`, `createMcpRuntimeRouteDependencies`, `basePath: "/v1/mcp"`, and `pathStyle: "openapi"`. Public fixture filenames are `resources.json`, `tools.json`, `approval-sessions.json`, `api-requests.json`, `runtime-router.json`, and `safety-samples.json`.

`runtime-router.json` uses schema `mcp-runtime-router-fixture.v1` and carries request ids `runtime_resource_list`, `runtime_resource_read`, `runtime_tool_call_safety`, `runtime_approval_create`, `runtime_approval_list_pending`, and `runtime_approval_decision`.

`api-requests.json` carries the route fixture ids `api_resource_list`, `api_resource_read`, `api_tool_list`, `api_tool_call`, `api_approval_list`, and `api_approval_decision`. Together these cover `GET /v1/mcp/resources`, `POST /v1/mcp/resources/read`, `GET /v1/mcp/tools`, `POST /v1/mcp/tools/call`, `POST /v1/mcp/tools/execute`, `GET /v1/mcp/approval-sessions`, and `POST /v1/mcp/approval-sessions/:sessionId/decision`.

## CLI Commands

Local CLI checks exercise the same contract:

```powershell
node packages\cli\src\index.ts mcp demo resources --policy-mode allow
node packages\cli\src\index.ts mcp demo read --uri sovereignops://docs/operator-guide
node packages\cli\src\index.ts mcp demo read --uri sovereignops://audit/policy-trace --policy-mode deny-resource-read --deny-uri sovereignops://audit/policy-trace
node packages\cli\src\index.ts mcp demo tool --name create_task_proposal --args-json "{\"title\":\"Prepare local note summary\"}"
node packages\cli\src\index.ts mcp demo tool --name create_task_proposal --args-json "{\"title\":\"Prepare local note summary\"}" --policy-mode require-approval
node packages\cli\src\index.ts mcp api resources --base-url http://127.0.0.1:3000
node packages\cli\src\index.ts mcp api read --base-url http://127.0.0.1:3000 --uri sovereignops://docs/operator-guide
node packages\cli\src\index.ts mcp api tools --base-url http://127.0.0.1:3000
node packages\cli\src\index.ts mcp api call --base-url http://127.0.0.1:3000 --tool-name create_task_proposal --args-json "{\"title\":\"Prepare local note summary\"}"
node packages\cli\src\index.ts mcp api approvals --base-url http://127.0.0.1:3000
node packages\cli\src\index.ts mcp api approval-decide --base-url http://127.0.0.1:3000 --session-id approval-route-1 --decision approve --reason checked
```
