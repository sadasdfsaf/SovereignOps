# MCP Gateway

The MCP gateway is a local-only boundary for workspace assistants and plugins. It exposes registered resources and safe proposal tools, runs policy before handlers, and emits audit records without requiring hosted services.

## Local-Only Architecture

- `services/mcp-gateway/src/registry.ts` owns registry-style resource and tool paths.
- `services/mcp-gateway/src/adapter.ts` maps resource registries into MCP-shaped list/read calls.
- `services/mcp-gateway/src/protocol.ts` wraps adapter calls in JSON-RPC-style request and response envelopes.
- `services/mcp-gateway/src/resources.ts` defines the default local resource catalog.
- `services/mcp-gateway/src/tools.ts` defines proposal-only tools that return draft payloads.
- `services/mcp-gateway/src/toolAdapter.ts` maps proposal tools into MCP-style tool list/call results.
- `services/mcp-gateway/src/approvalSessions.ts` stores in-memory approval review state.
- `services/mcp-gateway/src/audit.ts` and `services/mcp-gateway/src/auditEmitter.ts` collect policy, operation, and tool audit records.

No gateway path needs remote credentials. Callers inject policy, actor metadata, resource handlers, tool handlers, and audit sinks in-process.

## Protocol Adapter

The resource adapter reports metadata as `sovereignops-mcp-gateway-adapter`, version `0.1.0`, protocol `mcp-resource-adapter`.

| Adapter route | Behavior |
| --- | --- |
| `gateway.list_resources` | Lists resource summaries after each resource passes policy. |
| `gateway.read_resource` | Reads one URI after policy allows the registered handler. |
| `resources.list` | Internal policy operation marker for resource enumeration. |
| `resources.read` | Internal policy operation marker for single-resource reads. |

Adapter errors use stable codes: `resource_not_found`, `policy_denied`, `approval_required`, and `handler_failed`.

## Resource Surface

Default resource URIs are intentionally small sample surfaces:

- `sovereignops://docs/operator-guide`
- `sovereignops://tasks/sample-queue`
- `sovereignops://incidents/sync-delay-drill`
- `sovereignops://search/workspace-index`
- `sovereignops://audit/policy-trace`

Resources default to `read_object`. Unknown URIs return `resource_not_found` before policy or handlers run. Traversal-like URI strings are not normalized into existing resources.

## Tool Surface

Safe local tool names are fixed:

- `create_task_proposal`
- `draft_document_patch`
- `link_evidence`
- `propose_automation_rule`

Tools run through policy before handler execution. Denied and approval-required calls return terminal status without invoking the handler. Allowed tools emit requested, approved, and executed audit records.

## Approval Sessions

Approval is modeled as a policy decision, not as hidden execution. A tool or registry path can return `require_approval` with a `ruleId`, `reason`, and optional `approvalId`. The gateway records the request and stops before durable side effects. A reviewed caller can repeat the same call with updated context; policy must return `allow` before the handler runs.

Registry-style write paths use forms such as `/tools/local-write`, `/tools/batch-update`, and `/tools/summarize`. Resource paths use forms such as `/records/catalog`. These paths are caller registered and keep their declared capability, usually `write_object` or `propose_agent_action`.

## CLI Demo Workflow

Run focused local checks first:

```powershell
python -m unittest tests.test_mcp_gateway_docs
npm.cmd --workspace @sovereignops/mcp-gateway run check
```

Then run a one-off adapter demo from the repository root:

```powershell
node packages\cli\src\index.ts mcp demo resources
node packages\cli\src\index.ts mcp demo read --uri sovereignops://docs/operator-guide
node packages\cli\src\index.ts mcp demo tool --name create_task_proposal --args-json "{\"title\":\"Prepare local note summary\"}"
node --input-type=module -e "import { createGatewayResourceAdapter, createDefaultGatewayResourceRegistry } from './services/mcp-gateway/src/index.ts'; const adapter = createGatewayResourceAdapter({ resources: createDefaultGatewayResourceRegistry(), policy: () => 'allow' }); console.log(await adapter.listResources()); console.log(await adapter.readResource('sovereignops://docs/operator-guide'));"
```

For the full local smoke pass:

```powershell
python scripts\smoke.py
python -m unittest discover -s tests
```

## Audit And Redaction

- Resource registry audit records include `policy_decision`, `operation_succeeded`, and `operation_failed`.
- Tool audit records include `tool_call_requested`, `tool_call_approved`, `tool_call_approval_required`, `tool_call_denied`, and `tool_call_executed`.
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
