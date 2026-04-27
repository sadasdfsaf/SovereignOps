# MCP Gateway

The MCP gateway is a local-only boundary for workspace assistants and plugins. It exposes registered resources, safe proposal tools, approval review state, policy gates, and redacted audit outputs without requiring hosted services.

## Local-Only Architecture

- `services/mcp-gateway/src/registry.ts` owns registry-style resource and tool paths.
- `services/mcp-gateway/src/adapter.ts` maps resource registries into MCP-shaped list/read calls.
- `services/mcp-gateway/src/protocol.ts` wraps adapter calls in JSON-RPC-style request and response envelopes.
- `services/mcp-gateway/src/resources.ts` defines the default local resource catalog.
- `services/mcp-gateway/src/tools.ts` defines proposal-only tools that return draft payloads.
- `services/mcp-gateway/src/toolAdapter.ts` maps proposal tools into MCP-style tool list/call results.
- `services/mcp-gateway/src/approvalSessions.ts` stores in-memory approval review state.
- `services/mcp-gateway/src/runtime.ts` composes resources, tools, approvals, policy, and audit sinks for local API wiring.
- `services/mcp-gateway/src/audit.ts` and `services/mcp-gateway/src/auditEmitter.ts` collect policy, operation, and tool audit records.

No gateway path needs remote credentials. Callers inject policy, actor metadata, resource handlers, tool handlers, approval stores, and audit sinks in-process.

## Protocol API

The resource adapter reports metadata as `sovereignops-mcp-gateway-adapter`, version `0.1.0`, protocol `mcp-resource-adapter`.

| JSON-RPC method | Behavior |
| --- | --- |
| `initialize` | Returns protocol version, server info, and resource/tool capabilities. |
| `resources/list` | Lists resource summaries after each resource passes policy. |
| `resources/read` | Reads one URI after policy allows the registered handler. |
| `tools/list` | Lists the adapter tool metadata advertised to MCP clients. |

| Adapter tool name | Behavior |
| --- | --- |
| `gateway.list_resources` | Lists resource summaries after each resource passes policy. |
| `gateway.read_resource` | Reads one URI after policy allows the registered handler. |

| Policy operation marker | Behavior |
| --- | --- |
| `resources.list` | Internal policy operation marker for resource enumeration. |
| `resources.read` | Internal policy operation marker for single-resource reads. |
| `tools.call` | Internal policy operation marker for safe local tool calls. |

Adapter errors use stable codes: `resource_not_found`, `policy_denied`, `approval_required`, and `handler_failed`. Protocol errors map those to JSON-RPC error codes such as `method_not_found`, `invalid_params`, `accessRejected`, and `notFound`.

## Resource Surface

Default resource URIs are intentionally small local sample surfaces:

- `sovereignops://docs/operator-guide`
- `sovereignops://tasks/sample-queue`
- `sovereignops://incidents/sync-delay-drill`
- `sovereignops://search/workspace-index`
- `sovereignops://audit/policy-trace`

Resources default to `read_object`. Unknown URIs return `resource_not_found` before policy or handlers run. Traversal-like URI strings are not normalized into existing resources.

## Safe Local Tools

Safe local tool names are fixed and proposal-only:

- `create_task_proposal`
- `draft_document_patch`
- `link_evidence`
- `propose_automation_rule`

Tools run through policy before handler execution. Denied and approval-required calls return terminal status without invoking the handler. Allowed tools emit requested, approved, and executed audit records. Default outputs set `durableSideEffects: false` and are intended for review before any separate write path runs.

## Untrusted Output Markers

Callers that pass external or generated text through the gateway keep that text marked as data:

- Begin marker: `<UNTRUSTED_CONTENT>`
- End marker: `</UNTRUSTED_CONTENT>`
- Trust metadata: `trust: "untrusted"`
- Raw payload argument: `rawUntrustedContent`

Markers do not grant tool permission. Tool selection still goes through policy, approval-required results still stop before handlers run, and proposal outputs still keep `durableSideEffects: false`. Public marker examples live in `examples/mcp-gateway/safety-samples.json`.

## SDK Workflow

Use the TypeScript exports directly from `services/mcp-gateway/src/index.ts` for local integration:

| SDK name | Use |
| --- | --- |
| `createDefaultGatewayResourceRegistry` | Build the default resource registry. |
| `createGatewayResourceAdapter` | Expose `listResources`, `readResource`, and `listTools`. |
| `createMcpProtocolAdapter` | Serve JSON-RPC methods through `handle` and `handleRequest`. |
| `handleMcpProtocolRequest` | Handle one JSON-RPC request without constructing an adapter object. |
| `createGatewayResourceRegistry` | Build a custom URI-based resource registry. |
| `createSafeLocalToolRegistry` | Build the default safe local proposal tool registry. |
| `createSafeLocalToolAdapter` | Expose safe local tools through `listTools` and `callTool`. |
| `createMcpSafeLocalToolAdapter` | Alias for the safe local tool adapter factory. |
| `createApprovalSessionStore` | Store approval sessions with `pending`, `approved`, `rejected`, and `expired` states. |
| `createMcpGatewayRuntime` | Compose the default local resource adapter, tool adapter, approval store, and audit capture. |
| `createAuditEmitter` | Emit resource and registry audit records. |
| `createToolAuditEmitter` | Emit tool audit records with argument redaction. |
| `redactSensitiveArguments` | Redact nested sensitive names and credential-shaped values. |

The JavaScript client exposes HTTP helpers with the same names as the OpenAPI operations: `listMcpResources`, `readMcpResource`, `listMcpTools`, `callMcpTool`, `listMcpApprovalSessions`, and `decideMcpApprovalSession`.

For local runtime wiring, `createMcpGatewayRuntime` exposes `listResources`, `readResource`, `listTools`, `callTool`, `resourceAuditEntries`, `toolAuditEntries`, and `auditEntries` in one in-process object.

## Approval Sessions

Approval is modeled as a policy decision, not as hidden execution. A tool or registry path can return `require_approval` with a `ruleId`, `reason`, and optional `approvalId`. The gateway records the request and stops before durable side effects. A reviewed caller can repeat the same call with updated context; policy must return `allow` before the handler runs.

Registry-style write paths use forms such as `/tools/local-write`, `/tools/batch-update`, and `/tools/summarize`. Resource paths use forms such as `/records/catalog`. These paths are caller registered and keep their declared capability, usually `write_object` or `propose_agent_action`.

## Policy Gates

Every resource read and tool call evaluates policy before user code runs. Policy input includes `path`, `capability`, optional `actor`, and metadata such as `operation` or `registryKind`. Decisions are `allow`, `require_approval`, and `deny`.

- `allow` executes the handler and records a successful operation when it completes.
- `require_approval` records the decision and returns an approval-required result without handler execution.
- `deny` records the decision and returns a denied result without handler execution.

## CLI Demo Workflow

Run focused local checks first:

```powershell
python -m unittest tests.test_mcp_gateway_docs
npm.cmd --workspace @sovereignops/mcp-gateway run check
```

Then run a one-off adapter demo from the repository root:

```powershell
node packages\cli\src\index.ts mcp demo resources --policy-mode allow
node packages\cli\src\index.ts mcp demo read --uri sovereignops://docs/operator-guide
node packages\cli\src\index.ts mcp demo read --uri sovereignops://audit/policy-trace --policy-mode deny-resource-read --deny-uri sovereignops://audit/policy-trace
node packages\cli\src\index.ts mcp demo tool --name create_task_proposal --args-json "{\"title\":\"Prepare local note summary\"}"
node packages\cli\src\index.ts mcp demo tool --name create_task_proposal --args-json "{\"title\":\"Prepare local note summary\"}" --policy-mode require-approval
node --input-type=module -e "import { createGatewayResourceAdapter, createDefaultGatewayResourceRegistry } from './services/mcp-gateway/src/index.ts'; const adapter = createGatewayResourceAdapter({ resources: createDefaultGatewayResourceRegistry(), policy: () => 'allow' }); console.log(await adapter.listResources()); console.log(await adapter.readResource('sovereignops://docs/operator-guide'));"
```

When a local API server mounts the OpenAPI-style MCP routes, the CLI can call the same surface without remote credentials:

```powershell
node packages\cli\src\index.ts mcp api resources --base-url http://127.0.0.1:3000
node packages\cli\src\index.ts mcp api read --base-url http://127.0.0.1:3000 --uri sovereignops://docs/operator-guide
node packages\cli\src\index.ts mcp api tools --base-url http://127.0.0.1:3000
node packages\cli\src\index.ts mcp api call --base-url http://127.0.0.1:3000 --tool-name create_task_proposal --args-json "{\"title\":\"Prepare local note summary\"}"
node packages\cli\src\index.ts mcp api approvals --base-url http://127.0.0.1:3000
node packages\cli\src\index.ts mcp api approval-decide --base-url http://127.0.0.1:3000 --session-id approval-route-1 --decision approve --reason checked
```

## Fixture Replay

The public gateway fixtures are deterministic local examples. Validate the fixture set, then replay representative safety samples through the CLI and runtime SDK:

```powershell
python scripts\validate_mcp_gateway_fixtures.py
node packages\cli\src\index.ts mcp api replay --fixture examples\mcp-gateway\api-requests.json
node packages\cli\src\index.ts mcp demo tool --name create_task_proposal --args-json "{\"title\":\"Review untrusted partner note\",\"description\":\"Create a local review task from marked untrusted content.\"}"
node packages\cli\src\index.ts mcp demo tool --name draft_document_patch --args-json "{\"targetPath\":\"docs/public-note-summary.md\",\"summary\":\"Draft patch from marked untrusted content\",\"patch\":\"Record the requested note summary as a reviewed draft.\"}" --policy-mode require-approval
node --input-type=module -e "import { createMcpGatewayRuntime } from './services/mcp-gateway/src/index.ts'; const gateway = createMcpGatewayRuntime(); console.log(gateway.listTools().value.tools.map((tool) => tool.name));"
```

For the full local smoke pass:

```powershell
python scripts\smoke.py
python -m unittest discover -s tests
```

## Audit And Redaction

- Resource registry audit records include `policy_decision`, `operation_succeeded`, and `operation_failed`.
- Tool audit records include `tool_call_requested`, `tool_call_approved`, `tool_call_approval_required`, `tool_call_denied`, `tool_call_executed`, and `tool_call_failed`.
- Tool arguments are redacted recursively for sensitive names and credential-shaped values.
- Redaction replaces matching values with `[REDACTED]` while preserving non-sensitive fields.
- Audit entries use deterministic prefixes such as `audit_` and `tool_audit_` plus ISO 8601 timestamps.

## Local Validation

Use these commands when changing the gateway docs or service:

```powershell
python -m unittest tests.test_mcp_gateway_docs
python scripts\validate_mcp_gateway_fixtures.py
npm.cmd --workspace @sovereignops/mcp-gateway run check
node packages\cli\src\index.ts mcp demo resources
python scripts\repo_health.py --json
python scripts\smoke.py
```
