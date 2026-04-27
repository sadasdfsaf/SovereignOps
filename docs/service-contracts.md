# Service Contracts

This document summarizes the dependency-free service contracts currently implemented in the repository. The modules are designed as pure logic first, so server adapters and durable stores can be added without changing the policy, audit, or validation boundaries.

## API Router

`apps/api/src/router.ts` provides a small handler registry for local service routes. It supports:

- `GET`, `POST`, `PUT`, `PATCH`, and `DELETE` methods.
- path parameters such as `/workspaces/:workspaceId/events/:eventId`;
- normalized paths that ignore query strings, fragments, duplicate slashes, and trailing slashes;
- stable JSON response and error shapes;
- route metadata listing for local diagnostics.

No listener is started by this module. Future HTTP servers should adapt incoming requests into `ApiRequest` and return `ApiResponse` unchanged.

## Sync Service

`services/sync` now includes the pure service pieces needed before a network adapter is introduced:

- `cursors.ts`: parse, format, compare, and advance `cur_v1` cursors.
- `bundles.ts`: validate local event envelopes and create deterministic upload checksums.
- `repository.ts`: in-memory bundle repository with stale cursor, checksum, duplicate event, and workspace isolation checks.
- `devices.ts`: device enrollment, active-device listing, status transitions, and in-memory device repository.
- `invites.ts`: invite creation, token hashing/redaction, expiry checks, acceptance, and single-use enforcement.
- `rateLimit.ts`: per-workspace/device rate limiter interface and in-memory implementation.
- `http.ts`: pure health, upload, download, and cursor-status handlers with standard error bodies.

The sync relay treats payload bytes as opaque data. Content inspection belongs on the local client before encryption.

## MCP Gateway

`services/mcp-gateway` separates policy, registry, adapter, tools, and audit concerns:

- `adapter.ts`: SDK-free resource adapter with list/read operations and metadata for a future MCP SDK wrapper.
- `resources.ts`: resource registry for docs, tasks, incidents, search, and audit surfaces with policy filtering.
- `tools.ts`: safe local tool registry that returns proposals or patches instead of applying durable side effects directly.
- `auditEmitter.ts`: tool audit emitter with recursive redaction for sensitive argument names and sensitive-looking values.
- `policy.ts`, `registry.ts`, and `audit.ts`: existing policy middleware, generic registry, and audit sink primitives.

Every resource read and tool execution helper evaluates injected policy before returning data or invoking a handler.

## Structured Ingest

`services/ingest/src/sovereignops_ingest/structured.py` adds structured connectors for:

- Markdown sections with heading hierarchy and line citations.
- JSON leaves with deterministic key traversal and JSON path citations.
- CSV rows with column metadata, required-value checks, unique-value checks, duplicate row detection, and row/cell citations.

Findings are recorded as local data safety metadata attached to citations. The connector layer does not call external services and does not trust imported content by default.

## Verification

Run focused checks from the repository root:

```powershell
npm.cmd --workspace @sovereignops/api run check
npm.cmd --workspace @sovereignops/sync run check
npm.cmd --workspace @sovereignops/mcp-gateway run check
python -m unittest discover -s services\ingest\tests
```
