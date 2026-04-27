# Schema Alignment

SovereignOps keeps Rust, TypeScript, Python, OpenAPI, and MCP contracts aligned around the same wire records. JSON payloads use camelCase field names, stable id prefixes, explicit risk levels, policy decisions, and redacted audit fields.

## Canonical Vocabulary

| Family | Values |
| --- | --- |
| Workspace id | `wsp_` prefix |
| Actor id | `act_` prefix |
| Device id | `dev_` prefix |
| Event id | `evt_` prefix |
| Record ids | `doc_`, `prj_`, `inc_`, `cmt_`, `att_`, `apv_`, `obj_` prefixes |
| Record kinds | `docs`, `projects`, `incidents`, `comments`, `attachments`, `approvals` |
| Risk levels | `low`, `medium`, `high` |
| Policy decisions | `allow`, `require_approval`, `deny` |
| Gateway capabilities | `read_object`, `write_object`, `propose_agent_action`, `manage_plugin`, `sync_bundle` |
| Validation issues | `path` and `message` |
| API error shape | `code`, `message`, `requestId`, and optional `issues` |

The canonical wire shape is JSON with camelCase field names. Rust may use snake_case field names internally, but anything crossing a TypeScript, Python, OpenAPI, fixture, or MCP boundary must use the canonical JSON spelling.

## Record Schema Rules

Record schemas are aligned by kind, id prefix, status vocabulary, risk vocabulary, timestamp fields, and reference fields.

| Kind | Id prefix | Required domain fields | Status values |
| --- | --- | --- | --- |
| `docs` | `doc_` | `title`, `ownerActorId` | `draft`, `review`, `active`, `archived` |
| `projects` | `prj_` | `name`, `ownerActorId` | `planned`, `active`, `paused`, `completed`, `archived` |
| `incidents` | `inc_` | `title`, `reportedByActorId` | `open`, `triaged`, `resolved`, `closed` |
| `comments` | `cmt_` | `targetId`, `body`, `authorActorId` | `open`, `resolved`, `deleted` |
| `attachments` | `att_` | `targetId`, `filename`, `contentType`, `byteSize`, `uploadedByActorId` | `pending`, `ready`, `failed`, `deleted` |
| `approvals` | `apv_` | `targetId`, `summary`, `requestedByActorId` | `requested`, `approved`, `rejected`, `cancelled` |

Every record kind includes `id`, `workspaceId`, `status`, `risk`, `createdAt`, and `updatedAt`. Optional references keep their own prefixes: `projectId` uses `prj_`, actor fields use `act_`, and `targetId` can reference `doc_`, `prj_`, `inc_`, `cmt_`, `att_`, `apv_`, or `obj_`.

When adding or changing a record field:

1. Add the invariant in Rust first when it affects id parsing, event payloads, policy primitives, or reducer behavior.
2. Update `packages/schemas/src/index.ts` so TypeScript types, `schemaDefinitions`, validators, and fixtures agree.
3. Update Python normalization or validation fixtures that emit the record shape.
4. Update `docs/openapi.yaml` components and `docs/mcp-contract.md` tables when HTTP or MCP clients observe the value.
5. Refresh JSON Schema exports and compatibility tests before changing examples.

## Rust Alignment

`crates/sovereign_core` owns strict local invariants:

- `ids.rs` rejects empty values, wrong prefixes, path-like characters, and overlong ids.
- `event_log.rs` keeps one-based `sequence`, `previousDigest` lineage on the wire, operation names, and payload digests.
- `objects.rs` and reducer tests enforce lifecycle rules for documents, projects, incidents, comments, attachments, and approvals.
- `policy.rs` defines `RiskLevel`, `Capability`, `PolicyRequest`, `PolicyRule`, and `Decision`.
- `audit.rs` records redacted field paths and reasons before audit serialization.

Rust enum variants use PascalCase in code and map to snake_case strings on the wire. Any new Rust-only state that leaves the crate needs an explicit TypeScript/OpenAPI/MCP mapping before release.

## TypeScript Alignment

`packages/schemas` is the SDK-facing JSON contract:

- `schemaDefinitions` lists record kinds, id prefixes, and status sets.
- `validateSovereignRecord` validates required ids, status, risk, timestamps, and kind-specific fields.
- `ValidationIssue` uses `path` and `message`; callers should not invent alternate issue keys.
- `AgentActionPreview` and `AuditEntry` mirror OpenAPI component names and field casing.
- `packages/schemas/src/jsonSchema.ts` exports JSON Schema definitions derived from the same metadata.

TypeScript callers should emit the same camelCase JSON consumed by Python and described by OpenAPI. The MCP gateway uses the same capability and decision strings for resource and tool checks.

JavaScript SDK usage notes, including the workspace session snapshot retention cleanup API preview client, live in `docs/sdk-js.md`.

## Python Alignment

Python services treat the TypeScript/OpenAPI JSON shape as the interchange format:

- Ingest connectors normalize source content into supported record kinds without changing id prefixes.
- Checksum and citation helpers attach provenance metadata outside credential-bearing fields.
- Validation utilities return `ValidationIssue` objects with `path` and `message`.
- Error handlers return `ErrorResponse` with `code`, `message`, `requestId`, and optional `issues`.
- Fixture validators reject unknown fields for compatibility-sensitive example payloads.

Python contract checks must use the standard library unless a service already owns a runtime dependency.

## OpenAPI Alignment

`docs/openapi.yaml` describes HTTP transport for records, previews, audit reads, fixture replay, and evidence-style APIs. OpenAPI must stay aligned with the TypeScript schema layer:

- Component names use the exported TypeScript names when the shapes are shared.
- `ErrorResponse` always requires `code`, `message`, and `requestId`.
- Validation responses put field-level failures in `issues`, and each issue uses `path` plus `message`.
- Operation ids remain stable so SDK clients and CLI replay commands can target the same route names.
- Enum values are copied from TypeScript constants, not reworded in route docs.

Run `python scripts\validate_openapi.py` after OpenAPI edits. Add focused validator tests when a route family introduces a new component, response status, or replay fixture.

## MCP Alignment

`docs/mcp-contract.md` describes resource and tool names for MCP clients. MCP-facing schema rules are:

- Resource and tool inputs use the same id prefixes, capability strings, and policy decision strings as the core schema.
- JSON-RPC protocol errors return `error.code`, `error.message`, and `error.data`.
- Gateway data errors include `ok: false`, a stable `error.code`, and any audit intents collected before execution stops.
- Known gateway error codes stay aligned with `resource_not_found`, `policy_denied`, `approval_required`, and `handler_failed`.
- Audit replay rows preserve the documented `AuditReplayEntry` fields before any client-specific rendering.

When a value is visible in both OpenAPI and MCP, update the OpenAPI component, MCP contract table, SDK helper, CLI replay fixture, and tests in the same change.

## API Errors

All transports use a stable error envelope instead of transport-specific ad hoc fields:

```json
{
  "code": "invalid_request",
  "message": "Request body failed validation.",
  "requestId": "req_local_001",
  "issues": [
    {
      "path": "$.records[0].status",
      "message": "status must be one of draft, review, active, archived"
    }
  ]
}
```

Use `ErrorResponse` for HTTP APIs and the JSON-RPC `error` object for protocol-level MCP failures. Preserve machine-readable `code` values across Rust, TypeScript, Python, OpenAPI, and MCP tests; user-facing text can change only when tests assert the stable code and issue paths.

## Event Fixtures

Event fixtures are compatibility assets, not sample prose. They must be deterministic and free of local machine details.

- Lifecycle fixtures live under `examples/lifecycle-fixtures`.
- MCP gateway fixtures live under `examples/mcp-gateway`.
- Event ids use `evt_`, workspace ids use `wsp_`, actor ids use `act_`, and device ids use `dev_`.
- Event sequences are sorted and either one-based or cursor-ordered, depending on fixture family.
- Event payload objects use camelCase keys and reject unknown fields when the validator owns a closed shape.
- `schemaVersion` values are integers or documented version strings, and changes require fixture validator updates.
- Fixture replay outputs include schema markers such as `mcp-gateway-fixtures.v1` when consumers depend on them.

Run `python scripts\validate_lifecycle_fixtures.py` for lifecycle fixtures and `python scripts\validate_mcp_gateway_fixtures.py` for MCP gateway fixtures.

## Redaction

Redaction rules must produce the same observable behavior across audit helpers, routes, SDK fixtures, and replay output:

- Sensitive field names and credential-shaped values are removed or replaced before durable audit output.
- Redaction records store paths and reasons, not sensitive values.
- TypeScript MCP redaction replaces nested sensitive argument values with `[REDACTED]`.
- Rust audit helpers replace redacted flat values with `[redacted]` and record the redacted field path.
- OpenAPI and docs should describe `redactedPaths`, `redactions`, or replay `arguments` without embedding sensitive examples.
- Fixture validators should fail credential-bearing values in durable example payloads.

Do not add examples that include real local paths, credential names with usable values, or private workspace identifiers.

## JSON Schema Export

JSON Schema exports are generated from `packages/schemas/src/jsonSchema.ts`. Do not hand-edit exported fixture schemas.

- `schemaKinds` is derived from `schemaDefinitions`.
- `jsonSchemas` uses the same id prefix patterns, enum values, required fields, and `additionalProperties: false` constraints as the runtime validators.
- `jsonSchemaCatalog` writes `schema-catalog.json` with the draft URL and exported schema file names.
- Exported files live in `packages/schemas/fixtures/*.schema.json`.
- Valid record fixtures live beside their schemas and must pass both runtime validation and JSON Schema validation.

Run `node packages\schemas\scripts\export-json-schema.mjs --check` before release. If it reports stale files, run `node packages\schemas\scripts\export-json-schema.mjs`, review the generated diff, and then run the schema tests.

## Compatibility Testing

Compatibility tests should compare contracts across layers instead of checking only one implementation:

- Rust tests cover id parsing, event chain validation, reducer behavior, policy decisions, and redaction helpers.
- `packages/schemas/tests/schemas.test.mjs` checks TypeScript runtime validators and shared metadata.
- `packages/schemas/tests/json-schema.test.mjs` checks JSON Schema exports, catalogs, and valid fixtures.
- `tests/test_validate_openapi.py` and route-family OpenAPI tests check operation ids, components, errors, and fixture paths.
- `tests/test_mcp_contract_docs.py` locks MCP protocol sections, tools, error codes, audit output, replay fixtures, and CLI commands.
- Focused doc tests lock any public alignment process that would break consumers if silently removed.

Before merging a schema change, run the narrow layer checks plus `python -m unittest discover -s tests`. Broaden to Rust and Node workspace checks when a change touches shared values, generated schemas, route contracts, or fixture replay.

## Change Checklist

When a schema value changes:

1. Update Rust invariants and reducer tests first when local behavior changes.
2. Update TypeScript constants, types, validators, JSON Schema exports, and schema tests.
3. Update Python normalization, fixture validators, and API error handling that emit the value.
4. Update OpenAPI components and MCP tables when clients observe the value.
5. Update event fixtures and replay fixtures with deterministic, redacted data.
6. Run `python scripts\validate_openapi.py`, `node packages\schemas\scripts\export-json-schema.mjs --check`, `python scripts\validate_lifecycle_fixtures.py`, `python scripts\validate_mcp_gateway_fixtures.py`, and the focused compatibility tests for the touched layer.
