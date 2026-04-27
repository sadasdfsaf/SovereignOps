# MCP Contract

This contract describes the local MCP gateway surface for SovereignOps clients and plugins. It uses stable path names, explicit capabilities, policy gates, and redacted audit outputs.

## Resources

| Resource URI | Capability | Returns |
| --- | --- | --- |
| `sovereignops://workspaces/{workspaceId}/records` | `read_object` | Record list filtered by optional `kind` and `limit` arguments. |
| `sovereignops://workspaces/{workspaceId}/records/{recordId}` | `read_object` | One record matching a supported `doc_`, `prj_`, `inc_`, `cmt_`, `att_`, `apv_`, or `obj_` id. |
| `sovereignops://workspaces/{workspaceId}/audit` | `read_object` | Redacted audit entries for the workspace. |
| `sovereignops://workspaces/{workspaceId}/schemas` | `read_object` | Supported record kinds, id prefixes, statuses, and risk levels. |
| `sovereignops://workspaces/{workspaceId}/sync/state` | `read_object` | Local sync cursor, vector clock, and pending bundle metadata. |

## Tools

| Tool | Capability | Output |
| --- | --- | --- |
| `records.create` | `write_object` | Created record plus policy decision metadata. |
| `records.update` | `write_object` | Updated record plus changed field paths. |
| `records.archive` | `write_object` | Archived record id, previous status, and new status. |
| `agent_actions.preview` | `propose_agent_action` | Action preview, assigned risk, and current policy decision. |
| `approvals.request` | `propose_agent_action` | Approval record when policy returns `require_approval`. |
| `sync.prepare_bundle` | `sync_bundle` | Encrypted bundle descriptor and digest metadata. |

## Arguments

| Name | Type | Required | Notes |
| --- | --- | --- | --- |
| `workspaceId` | string | yes | Must match `^wsp_[A-Za-z0-9_-]{1,88}$`. |
| `actorId` | string | yes for tools | Must match `^act_[A-Za-z0-9_-]{1,88}$`. |
| `recordId` | string | resource dependent | Must use a supported record id prefix. |
| `kind` | enum | list/create dependent | One of `docs`, `projects`, `incidents`, `comments`, `attachments`, or `approvals`. |
| `capability` | enum | yes for previews | One of `read_object`, `write_object`, `propose_agent_action`, `manage_plugin`, or `sync_bundle`. |
| `risk` | enum | yes for writes and previews | One of `low`, `medium`, or `high`. |
| `changes` | object | update only | Field patch object validated against the selected record kind before execution. |
| `summary` | string | preview/request tools | Human-readable action summary with credential-like values removed before audit storage. |
| `limit` | integer | no | Bounded to `1..200`; default is `50`. |

## Policy Gates

Every resource read and tool call is wrapped by a policy gate before user code runs.

| Gate input | Source |
| --- | --- |
| `path` | Normalized resource URI or tool path. |
| `capability` | Registered capability, defaulting to `read_object` for resources and `propose_agent_action` for tools. |
| `actor` | Optional `actorId` and role metadata supplied by the caller. |
| `metadata.registryKind` | `resource` or `tool`. |
| `risk` | Caller-assigned risk when the operation mutates data or prepares an action. |

Policy decisions are `allow`, `require_approval`, or `deny`.

- `allow` executes the handler and records the policy decision.
- `require_approval` stops execution and returns an approval-required error shape.
- `deny` stops execution and returns a denied error shape.

## Audit Outputs

The gateway emits audit records for policy and operation outcomes. Sensitive field names and credential-shaped values must be replaced before durable storage.

| Event type | Required fields | Optional fields |
| --- | --- | --- |
| `policy_decision` | `id`, `timestamp`, `path`, `capability`, `decision` | `message`, `metadata.ruleId` |
| `operation_succeeded` | `id`, `timestamp`, `path`, `capability`, `decision` | `metadata.changedPaths` |
| `operation_failed` | `id`, `timestamp`, `path`, `capability`, `decision`, `message` | `metadata.errorCode` |

Audit ids use the configured prefix, defaulting to `audit_`. Timestamps are ISO 8601 strings. Audit metadata must contain only redacted or non-sensitive values.

## Error Shape

MCP errors should map to the OpenAPI `ErrorResponse` model:

```json
{
  "code": "policy_denied",
  "message": "Policy denied write_object for /tools/records.update",
  "requestId": "req_01HYEXAMPLE",
  "issues": []
}
```

Known codes are `not_found`, `validation_failed`, `policy_denied`, `approval_required`, and `operation_failed`.
