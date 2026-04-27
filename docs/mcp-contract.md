# MCP Contract

This contract describes the local MCP gateway surface for clients and plugins. The surface is intentionally small: resources are read by exact URI, tools create proposal payloads, policy runs before handlers, approval decisions stop execution, and audit output is redacted before storage.

## Protocol Methods

| Method | Params | Result |
| --- | --- | --- |
| `initialize` | optional object | `protocolVersion`, `capabilities`, and `serverInfo`. |
| `resources/list` | optional object | Resource summaries allowed by policy. |
| `resources/read` | `{ "uri": "sovereignops://..." }` | One or more content entries for the exact URI. |
| `tools/list` | optional object | Tool metadata for `gateway.list_resources` and `gateway.read_resource`. |

Protocol constants are `MCP_PROTOCOL_JSONRPC_VERSION` set to `2.0` and `MCP_GATEWAY_PROTOCOL_VERSION` set to `2024-11-05`.

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

## Safe Local Tools

| Tool | Required input | Output kind |
| --- | --- | --- |
| `create_task_proposal` | `title` | `task_proposal` |
| `draft_document_patch` | `targetPath` | `document_patch` |
| `link_evidence` | `evidenceRef`, `targetRef` | `evidence_link_proposal` |
| `propose_automation_rule` | `name` | `automation_rule_proposal` |

Safe local tools run through policy first and default to `durableSideEffects: false`. Denied and approval-required calls return terminal status without invoking the handler.

## SDK Entry Points

Use these TypeScript exports for local wiring:

| SDK name | Contract |
| --- | --- |
| `createGatewayResourceRegistry` | Creates a URI resource registry. |
| `createDefaultGatewayResourceRegistry` | Creates the default local resource registry. |
| `createGatewayResourceAdapter` | Provides `listResources`, `readResource`, and `listTools`. |
| `createMcpProtocolAdapter` | Provides `handle` and `handleRequest` for JSON-RPC requests. |
| `handleMcpProtocolRequest` | Handles a JSON-RPC request with an adapter and context. |
| `createSafeLocalToolRegistry` | Creates the default safe local tool registry. |
| `createSafeLocalToolAdapter` | Provides `listTools` and `callTool` for safe local tools. |
| `createMcpSafeLocalToolAdapter` | Alias for `createSafeLocalToolAdapter`. |
| `createApprovalSessionStore` | Creates an in-memory approval session store. |
| `createMcpGatewayRuntime` | Composes resources, tools, approvals, policy, and audit capture for local API wiring. |
| `createAuditEmitter` | Emits resource and registry audit records. |
| `createToolAuditEmitter` | Emits tool audit records with redacted arguments. |
| `redactSensitiveArguments` | Redacts nested sensitive names and credential-shaped values. |

The JavaScript SDK client mirrors the OpenAPI operation ids with `listMcpResources`, `readMcpResource`, `listMcpTools`, `callMcpTool`, `listMcpApprovalSessions`, and `decideMcpApprovalSession`.

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

## Error Shape

JSON-RPC protocol errors return `error.code`, `error.message`, and `error.data`. Gateway data errors include `ok: false`, a stable `error.code`, and any audit intents collected before the stop.

Known gateway codes are `resource_not_found`, `policy_denied`, `approval_required`, and `handler_failed`. Protocol validation can return `invalid_request`, `invalid_params`, `method_not_found`, and `internal_error`.

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
