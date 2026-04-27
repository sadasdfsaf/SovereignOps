# Local Event API

This guide documents the local-only API client path for canonical local events.
It connects API route usage, SDK fixture fetching, CLI export and import
planning, Web state, sync reconciliation, and audit export without storing
record bodies in durable examples.

## Scope

- API examples use `http://127.0.0.1` or repository-relative paths only.
- `examples/local-events/api-requests.json` records public-safe request and
  response excerpts for the local catalog routes.
- `examples/local-events/sdk-session.json` records the SDK client flow and the
  cross-layer handoff points.
- Catalog content stays in `examples/local-events/catalog.json`; API and SDK
  fixtures reference ids, digests, counts, cursors, and redaction metadata.
- Export and import examples stay local and ciphertext-oriented where payload
  bytes would otherwise be durable.

## Routes

| Route | Purpose |
| --- | --- |
| `GET /v1/local-events/catalog` | Return a canonical local event catalog from a workspace-local JSON path or injected catalog. |
| `GET /v1/local-events/summary` | Return operation, schema kind, actor, record, and redaction counts for the catalog. |
| `GET /v1/local-events/replay-batches` | Build deterministic replay batches with optional sequence, operation, and schema kind filters. |

The route implementation lives in `apps/api/src/localEventCatalogRoutes.ts`.
Errors use stable JSON envelopes with machine-readable `error.code` values and
issue details when validation fails.

## Local-Only API Usage

Callers should treat the local API as a fixture-backed client boundary:

- Use `http://127.0.0.1:7317` or another loopback base URL.
- Send `catalogPath` as a repository-relative JSON path such as
  `examples/local-events/catalog.json`.
- Keep route bodies as JSON objects, even for `GET`, when a caller needs to pass
  a catalog path or replay filters.
- Reject remote source URIs, absolute paths outside the workspace, and private
  workspace folders before route dispatch.
- Preserve `payloadDigest`, `previousDigest`, `redactionMetadata`, and `cur_v1`
  cursors in responses.

## SDK Flow

The SDK client flow is fixture-first and runs through
`packages/sdk-js/src/localEvents.ts`:

1. Load or validate a catalog with `loadLocalEventCatalogFixture` or
   `validateLocalEventCatalogFixture`.
2. Summarize event counts with `summarizeLocalEventCatalog`.
3. Create batches with `createLocalEventReplayBatches`.
4. Build a fetch-compatible local client with
   `createLocalEventCatalogFixtureFetch`.
5. Call `/v1/local-events/catalog`, `/v1/local-events/summary`, and
   `/v1/local-events/replay-batches` through the fixture fetch during local
   tests.

The SDK session fixture keeps the request order, expected status codes, and
result fields in `examples/local-events/sdk-session.json`.

## CLI Export And Import Plan

CLI export uses `packages/cli/src/localEventExports.ts` and reads the same
catalog replay output as `packages/cli/src/localEvents.ts`.

Supported local export shapes:

- `jsonl`: one replay row per line.
- `csv`: one replay row per CSV record with deterministic column order.
- `package`: JSON package with `local-events.catalog-replay-export.manifest`,
  JSONL content, CSV content, and fingerprints.

The import side is represented by `examples/local-events/import-plan.json`.
Import planning should load `examples/local-events/export-session.json`, verify
the catalog link, verify the digest chain, verify the cursor window, require
ciphertext-only payload handling, stage batches, and block apply on integrity
failures.

## Web State

Web state uses `apps/web/src/localEventCatalog.ts` for catalog summaries:

- `buildLocalEventCatalogState` produces the page state used by the local event
  view.
- `filterCanonicalLocalEvents` keeps route and UI filters aligned.
- `summarizeLocalEvents` keeps operation, schema kind, risk, redaction, and
  replay-readiness counts stable.

The Web state excerpt in `examples/local-events/sdk-session.json` includes the
visible event ids and redaction counts that can be rendered without exposing
record bodies.

## Sync Reconciliation

Sync replay uses `services/sync/src/replay.ts`.

- `replayAcceptedEvents` returns a cursor window with `afterCursor`,
  `nextCursor`, `hasMore`, integrity status, selected events, and audit data.
- `detectReplayIntegrityIssues` flags invalid cursors, duplicate cursors,
  duplicate event ids, stale cursors, and cursor gaps.
- `createReplayAuditSummary` redacts identifiers while retaining event count,
  cursor shape, issue codes, and event references.

Reconciliation should compare the accepted event ids with the catalog event ids,
then verify cursor order and payload digests before marking a local replay
window complete.

## Audit Export

Audit export for local event replay uses the export helper in
`packages/cli/src/localEventExports.ts`.

- Export rows keep sequence, event id, operation, schema kind, record id,
  digests, redaction status, and summary.
- Manifests keep total event count, replayed event count, record count,
  operation counts, schema kind counts, redacted event count, terminal digest,
  content descriptors, and fingerprints.
- JSONL, CSV, and package outputs are deterministic so the same local catalog
  and filters produce the same exported content.

## Validation Commands

Run the focused checks from the repository root:

```powershell
python -m json.tool examples\local-events\api-requests.json
python -m json.tool examples\local-events\sdk-session.json
python -m unittest tests.test_local_event_api_docs
```
