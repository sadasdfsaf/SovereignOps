# Ingest/Search Integration Path

This guide ties the local ingest/search path together across API routes, SDK
helpers, CLI commands, Web state builders, schema contracts, and fixture files.
It is a local-only path: examples use repository-relative paths, localhost API
bases, and `fixture://` source URIs.

## Local Boundary

- Source data starts in `examples/ingest-search/notes.md`,
  `examples/ingest-search/records.csv`, and
  `examples/ingest-search/records.json`.
- Fixture paths stay relative to the repository root and must not include
  absolute roots or `..` traversal.
- Source identifiers stay local: `fixture://`, `file://`, `stdin://`,
  `workspace://`, and `local://` are accepted shapes for local metadata.
- Imported text remains untrusted until a caller explicitly marks a source as
  trusted. Citations and checksums move through each layer with the record.

## Connector Manifest Path

`docs/ingest-connectors.md` is the public connector manifest and local preview
guide. It maps Python connector capabilities to the route-shaped API preview,
SDK helpers, and Web state builders:

- Python CLI entry point:
  `services/ingest/src/sovereignops_ingest/cli.py`.
- Python connector modules:
  `services/ingest/src/sovereignops_ingest/connector_manifest.py`,
  `services/ingest/src/sovereignops_ingest/structured.py`,
  `services/ingest/src/sovereignops_ingest/repository.py`, and
  `services/ingest/src/sovereignops_ingest/logs.py`.
- API connector manifest and preview route state:
  `apps/api/src/ingestConnectorRoutes.ts` and
  `apps/api/src/ingestOpenApiRoutes.ts`.
- SDK route client, pure helpers, and connector manifest helpers:
  `packages/sdk-js/src/ingestClient.ts` and
  `packages/sdk-js/src/localIngest.ts`, plus
  `packages/sdk-js/src/localIngestConnectorManifest.ts`.
- Web state builders:
  `apps/web/src/ingestSearch.ts` and
  `apps/web/src/ingestConnectorState.ts`.
- Schema manifest contract:
  `packages/schemas/src/ingestConnectorManifest.ts`.

The manifest path stays local-only, requires no network access, and keeps
connector output default untrusted unless the caller explicitly passes a trusted
option after source verification.

## API Path

`apps/api/src/ingestRoutes.ts` provides the in-process route state used by API
tests and local callers:

- `GET /v1/ingest/sources` lists source summaries.
- `POST /v1/ingest/search` searches the in-memory local index with `query`,
  optional `sourceIds`, and optional `limit`.
- `GET /v1/ingest/quarantine` lists held items.
- `POST /v1/ingest/quarantine/:recordId/decision` records a `release` or
  `discard` decision for a pending item.
- `GET /v1/ingest/connectors` lists connector manifest profiles for local
  preview.

`examples/ingest-search/api-requests.json` keeps the wider ingest/search
contract examples for normalize, structured parse, repository scan, search, and
case decision flows. The shared expectation is the same: route bodies are JSON,
errors use JSON envelopes, and successful records keep source IDs, checksums,
citations, and local hold state.

## SDK Path

The SDK exports local ingest helpers from `packages/sdk-js/src/localIngest.ts`
through `packages/sdk-js/src/index.ts`:

- `normalizeLocalSourceSummaries` converts source summaries into stable local
  documents.
- `buildLocalSearchView` creates compact searchable views.
- `searchLocalText` ranks local text results and returns snippets.
- `groupLocalQuarantineRecords` groups held records by reason, source, or
  status.
- `prepareLocalQuarantineDecisionPayload` builds deterministic decision JSON.

Use these helpers when a caller already has local JSON and does not need to
cross an API boundary.

The SDK also exports connector manifest helpers from
`packages/sdk-js/src/localIngestConnectorManifest.ts` through
`packages/sdk-js/src/index.ts`:

- `listLocalIngestConnectorProfiles` returns frozen default profiles.
- `getLocalIngestConnectorProfile` resolves profile ids or connector aliases.
- `normalizeLocalIngestConnectorManifest` converts Python/API JSON to the SDK
  camel-case shape and rejects raw secrets or unsafe local paths.
- `buildLocalIngestConnectorReadinessSummary` reports ready, attention, and
  blocked profile counts.

## CLI Path

The CLI implementation is `packages/cli/src/ingestSearch.ts`, reached through
`packages/cli/src/index.ts`. These commands run from the repository root:

```powershell
node packages\cli\src\index.ts ingest search source summary --input-path examples\ingest-search\repository.json
node packages\cli\src\index.ts ingest search index search --index-path examples\ingest-search\search-index.json --query checksum --media-type application/json --limit 5
node packages\cli\src\index.ts ingest search quarantine list --quarantine-path examples\ingest-search\quarantine.json --source-uri fixture://ingest-search/records.csv
node packages\cli\src\index.ts ingest search quarantine decide --quarantine-path examples\ingest-search\quarantine.json --item-id qtn_csv_beta_status --decision release --actor-id local_reviewer --reason "Status accepted for local indexing." --timestamp 2026-04-27T08:05:00.000Z
```

CLI output is JSON. Inputs come from `--input-path`, `--index-path`,
`--quarantine-path`, `--input-json`, or `--stdin`.

## Web State Path

`apps/web/src/ingestSearch.ts` turns local ingest/search records into view-ready
state:

- `buildIngestSourceSummaryCards` orders source cards and exposes counts.
- `buildSearchResultRows` produces score labels and highlighted snippets.
- `buildIngestQuarantineQueueState` separates pending and decided queue items.
- `buildIngestSearchEmptyState` and `buildIngestSearchErrorState` provide
  deterministic empty and error states.

The Web layer consumes prepared data. It does not fetch remote data in these
fixtures, and it should keep any link or source reference local for this path.

`apps/web/src/ingestConnectorState.ts` turns Python CLI, API, and SDK connector
manifest shapes into local capability cards and rows:

- `buildIngestConnectorState`
- `buildIngestConnectorCards`
- `buildIngestConnectorRows`
- `getIngestConnectorReadinessStatusLabel`
- `getIngestConnectorSafetyStateLabel`

Unsafe manifest inputs become blocked rows with redacted warnings rather than
raw paths or secret-like values.

## Schema Contracts

`packages/schemas/src/ingestSearch.ts` defines runtime validators and JSON
schema metadata for:

- `repositorySourceSnapshot`
- `logSourceSnapshot`
- `normalizedDocument`
- `searchQuery`
- `searchResult`
- `quarantineRecord`
- `quarantineDecision`

The same contracts are exported to `packages/schemas/fixtures` and checked by
`packages/schemas/tests/ingest-search.test.mjs`.

`packages/schemas/src/ingestConnectorManifest.ts` defines the connector
manifest schema and validators for:

- `ingestConnectorManifestSchema`
- `ingestConnectorProfileSchema`
- `validateIngestConnectorManifest`
- `validateIngestConnectorProfile`
- `assertIngestConnectorManifest`

The manifest fixtures are
`packages/schemas/fixtures/ingest-connector-manifest.valid.json`,
`packages/schemas/fixtures/ingest-connector-manifest.invalid.json`,
`packages/schemas/fixtures/ingest-connector-manifest.schema.json`, and
`packages/schemas/fixtures/ingest-connector-profile.schema.json`, with behavior
checked by `packages/schemas/tests/ingest-connector-manifest.test.mjs`.

## Fixtures

The fixture set is intentionally small and deterministic:

- `examples/ingest-search/repository.json` lists source URI, relative path,
  media type, checksum, and index state.
- `examples/ingest-search/ingest-log.json` records ingest actions and counts.
- `examples/ingest-search/search-index.json` stores searchable chunks with
  checksums, citations, and `untrusted: true`.
- `examples/ingest-search/quarantine.json` keeps held source ranges out of the
  index.
- `examples/ingest-search/api-requests.json` shows route envelopes.
- `examples/ingest-search/client-session.json` ties API, SDK, CLI, Web state,
  schema kinds, and fixture files into one safe client session sample.

## Client Session Fixture

`examples/ingest-search/client-session.json` is a compact integration map. It
contains:

- `baseUrl: "http://127.0.0.1:7317"` for localhost-only API examples.
- API route entries for source listing, search, quarantine listing, and a
  local decision.
- SDK entry point names that mirror the exported helper functions.
- CLI commands that read only checked-in fixture paths.
- Web state samples for source cards, result rows, and the quarantine queue.
- Schema kind names from `packages/schemas/src/ingestSearch.ts`.

## Validation Commands

Run these from the repository root:

```powershell
python -m json.tool examples\ingest-search\client-session.json
python -m unittest tests.test_ingest_connectors_docs
python -m unittest tests.test_ingest_integration_docs
python -m unittest tests.test_sdk_js_docs
python -m unittest discover -s services\ingest\tests -p test_connector_manifest.py
python -m unittest discover -s services\ingest\tests -p test_ingest_cli_connector_manifest.py
node apps\api\tests\ingest-connector-routes.test.mjs
node packages\sdk-js\tests\local-ingest-connector-manifest.test.mjs
node apps\web\tests\ingest-connector-state.test.mjs
node packages\schemas\tests\ingest-connector-manifest.test.mjs
npm.cmd --workspace @sovereignops/api run check
npm.cmd --workspace @sovereignops/sdk-js run check
npm.cmd --workspace @sovereignops/cli run check
npm.cmd --workspace @sovereignops/web run check
npm.cmd --workspace @sovereignops/schemas run check
```
