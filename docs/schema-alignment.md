# Schema Alignment

SovereignOps keeps Rust, TypeScript, Python, OpenAPI, and MCP contracts aligned around the same wire records. JSON payloads use camelCase field names, stable id prefixes, explicit risk levels, policy decisions, and redacted audit fields.

## Canonical Families

| Family | Values |
| --- | --- |
| Workspace id | `wsp_` prefix |
| Actor id | `act_` prefix |
| Record ids | `doc_`, `prj_`, `inc_`, `cmt_`, `att_`, `apv_`, `obj_` prefixes |
| Record kinds | `docs`, `projects`, `incidents`, `comments`, `attachments`, `approvals` |
| Risk levels | `low`, `medium`, `high` |
| Policy decisions | `allow`, `require_approval`, `deny` |
| Gateway capabilities | `read_object`, `write_object`, `propose_agent_action`, `manage_plugin`, `sync_bundle` |

## Rust

`crates/sovereign_core` owns the strict invariants:

- Identifier parsers reject empty values, wrong prefixes, path-like characters, and overlong ids.
- Event envelopes keep one-based sequences, previous digest links, operation names, and payload digests.
- Reducers enforce record lifecycle rules for documents, projects, incidents, comments, attachments, and approvals.
- Policy primitives define `RiskLevel`, `Capability`, `PolicyRequest`, `PolicyRule`, and `Decision`.
- Audit helpers redact sensitive field names and credential-shaped values before serialization.

Rust enum variants use PascalCase in code and map to snake_case strings on the wire.

## TypeScript

`packages/schemas` is the SDK-facing JSON contract:

- `schemaDefinitions` lists record kinds, id prefixes, and status sets.
- `validateSovereignRecord` validates required ids, status, risk, timestamps, and kind-specific fields.
- `AgentActionPreview` and `AuditEntry` mirror the OpenAPI component names and field casing.
- TypeScript callers should emit the same camelCase JSON consumed by Python and described by OpenAPI.

The MCP gateway uses the same capability and decision strings for resource and tool policy checks.

## Python

Python services should treat the TypeScript/OpenAPI JSON shape as the interchange format:

- Ingest connectors normalize source content into supported record kinds without changing id prefixes.
- Checksum and citation helpers attach provenance metadata outside credential-bearing fields.
- Validation utilities should return `ValidationIssue` objects with `path` and `message`.
- Error handlers should return `ErrorResponse` with `code`, `message`, `requestId`, and optional `issues`.

Python contract checks must use the standard library unless a service already owns a runtime dependency.

## OpenAPI And MCP

`docs/openapi.yaml` describes HTTP transport for records, previews, and audit reads. `docs/mcp-contract.md` describes resource and tool names for MCP clients. Both contracts share:

- The same id prefix patterns.
- The same record kind and status vocabulary.
- The same `RiskLevel`, `PolicyDecision`, and `GatewayCapability` strings.
- The same `ErrorResponse` and `ValidationIssue` shapes.
- Audit outputs that store redacted paths instead of sensitive values.

## Change Checklist

When a schema value changes:

1. Update Rust invariants and reducer tests first.
2. Update TypeScript constants, types, validators, and schema tests.
3. Update Python normalization or validation fixtures that emit the value.
4. Update OpenAPI components and MCP tables.
5. Run `python scripts/validate_openapi.py`, `python -m unittest discover -s tests`, and the relevant Rust or Node tests when available.
