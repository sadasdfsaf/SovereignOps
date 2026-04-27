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
- API fixture loader and route-state adapter:
  `apps/api/src/ingestFixtureServices.ts`.
- CLI API fixture replay and verification:
  `packages/cli/src/ingestApiReplay.ts` and
  `packages/cli/src/ingestApiVerify.ts`.
- CLI connector manifest API replay:
  `packages/cli/src/ingestConnectorApiReplay.ts`.
- SDK route client, API fixture fetch, pure helpers, and connector manifest
  helpers: `packages/sdk-js/src/ingestClient.ts`,
  `packages/sdk-js/src/ingestFixtureFetch.ts`,
  `packages/sdk-js/src/ingestConnectorClient.ts`,
  `packages/sdk-js/src/ingestConnectorFixtureFetch.ts`, and
  `packages/sdk-js/src/localIngest.ts`, plus
  `packages/sdk-js/src/localIngestConnectorManifest.ts`.
- Web state builders:
  `apps/web/src/ingestSearch.ts`, `apps/web/src/ingestConnectorState.ts`,
  `apps/web/src/ingestApiState.ts`, `apps/web/src/ingestConnectorApiState.ts`,
  `apps/web/src/ingestSessionReview.ts`, and
  `apps/web/src/ingestDashboardState.ts`.
- Schema manifest contract:
  `packages/schemas/src/ingestConnectorManifest.ts` and
  `packages/schemas/src/ingestConnectorApiManifest.ts`, plus
  `packages/schemas/src/ingestSearch.ts`.
- Cross-surface alignment checks:
  `tests/test_ingest_contract_alignment.py`,
  `tests/test_ingest_connector_api_e2e.py`,
  `tests/test_validate_openapi_ingest_search.py`,
  `tests/test_validate_openapi_ingest_connector_api_schema.py`,
  `tests/test_validate_openapi_schema_components.py`,
  `apps/api/tests/ingest-connector-schema-alignment.test.mjs`,
  `tests/test_schema_alignment_docs.py`, and `docs/schema-alignment.md`.

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

`apps/api/src/ingestFixtureServices.ts` keeps those fixtures joined before they
enter route tests:

- `DEFAULT_INGEST_SEARCH_FIXTURE_DIRECTORY`
- `resolveIngestSearchFixturePaths`
- `loadIngestSearchFixtureBundle`
- `createIngestRouteStateSeedFromFixtures`
- `createIngestRouteStateFromFixtures`
- `createIngestRouteStateFromIngestSearchFixtures`
- `validateIngestSearchFixtureBundle`
- `IngestFixtureValidationError`

`apps/api/src/ingestOpenApiRoutes.ts` then exposes fixture-backed OpenAPI route
state through `createIngestOpenApiRouteStateFromFixtures`,
`createMemoryIngestOpenApiRouteState`, `createIngestOpenApiRoutes`, and
`mountIngestOpenApiRoutes`.

`examples/ingest-search/connector-api-requests.json` is the connector manifest
API replay fixture. `apps/api/tests/ingest-connector-fixture-replay.test.mjs`
replays it through `createIngestConnectorRoutes` and checks local-only manifest
responses from `GET /v1/ingest/connectors`.

## SDK Path

The SDK API client in `packages/sdk-js/src/ingestClient.ts` drives the
OpenAPI-shaped preview routes through an injected fetch:

- `createIngestSearchClient`
- `IngestSearchClient.normalize`
- `IngestSearchClient.ingestStructured`
- `IngestSearchClient.scanRepository`
- `IngestSearchClient.search`
- `IngestSearchClient.createQuarantineCases`
- `IngestSearchClient.decideQuarantineCase`

`packages/sdk-js/src/ingestFixtureFetch.ts` builds a no-network harness around
`examples/ingest-search/api-requests.json`:

- `DEFAULT_INGEST_FIXTURE_PATH`
- `loadIngestFixtureBundle`
- `createIngestFixtureFetch`
- `createIngestFixtureClient`
- `createIngestFixtureClientHarness`
- `baseUrlFromIngestFixtureBundle`

Use this fixture client when SDK tests need the API client surface but should
not start an API process or open a socket. The harness records each local call,
matches method, route path, and JSON body, and reports typed fixture errors for
unmatched paths, method mismatches, and request-body drift.

`packages/sdk-js/src/ingestConnectorFixtureFetch.ts` builds the focused
connector manifest fixture fetch and client harness around
`examples/ingest-search/connector-api-requests.json`:

- `DEFAULT_INGEST_CONNECTOR_FIXTURE_PATH`
- `loadIngestConnectorFixtureBundle`
- `createIngestConnectorFixtureFetch`
- `createIngestConnectorFixtureClient`
- `createIngestConnectorFixtureClientHarness`
- `baseUrlFromIngestConnectorFixtureBundle`
- `IngestConnectorFixtureError`

Use it when SDK tests need `IngestConnectorClient` against the connector
fixture bundle without global fetch or a live API process. It validates the
successful manifest case, preserves local negative method/path/body cases, and
redacts unsafe errors.
Focused connector fixture harness coverage lives in
`packages/sdk-js/tests/ingest-connector-fixture-fetch.test.mjs`.

`packages/sdk-js/src/ingestConnectorClient.ts` is the focused connector manifest
API client. It exposes:

- `createIngestConnectorClient`
- `IngestConnectorClient.getManifest`
- `IngestConnectorClient.manifest`
- `IngestConnectorClient.getReadiness`
- `IngestConnectorClient.readiness`

The connector client requires an injected fetch, calls
`GET /v1/ingest/connectors`, and redacts raw local paths or secret-like values
from typed API errors before returning them to callers.
Focused connector client coverage lives in
`packages/sdk-js/tests/ingest-connector-client.test.mjs`.

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

The API fixture commands are also JSON-only and local-only:

```powershell
node packages\cli\src\index.ts ingest api replay --fixture examples\ingest-search\api-requests.json --route /v1/ingest/structured
node packages\cli\src\index.ts ingest api verify --fixture examples\ingest-search\api-requests.json --openapi docs\openapi.yaml
node packages\cli\src\index.ts ingest connectors api replay --fixture examples\ingest-search\connector-api-requests.json
node packages\cli\src\index.ts ingest-connector-api replay --fixture examples\ingest-search\connector-api-requests.json --id api_ingest_connectors_manifest
```

`ingest api replay` summarizes or filters recorded fixture requests without a
server. `ingest api verify` checks that fixture routes are present in
`docs/openapi.yaml`, rejects unsafe local path fields, and reports
`network.liveRequests: 0`.

`ingest connectors api replay` dispatches the connector manifest fixture through
the local connector route, redacts unsafe output, and does not read private
planning paths.
The connector replay module exposes `runIngestConnectorApiReplayCli`,
`isIngestConnectorApiReplayCommand`, and
`createIngestConnectorApiDispatcher`.
Focused replay coverage lives in
`packages/cli/tests/ingest-connector-api-replay.test.mjs`.
Together with `apps/api/tests/ingest-connector-fixture-replay.test.mjs`, this
keeps the connector API fixture parity path local across API router dispatch
and CLI replay output. Both surfaces replay the successful manifest response
and the local negative method/path cases from
`examples/ingest-search/connector-api-requests.json`.

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

`apps/web/src/ingestApiState.ts` turns API fixture bundles and route responses
into the same view models:

- `buildIngestApiState`
- `collectIngestApiSourceSummaries`
- `buildIngestApiSourceCards`
- `collectIngestApiSearchResults`
- `buildIngestApiSearchRows`
- `collectIngestApiQuarantineItems`
- `buildIngestApiQuarantineQueueState`
- `buildIngestApiErrorStates`

The Web API-state helper reads already captured API JSON and never initiates
remote fetches for these fixtures.

`apps/web/src/ingestConnectorApiState.ts` turns connector manifest API responses
and replay output into connector cards, rows, request cards, summaries, empty
states, and redacted errors:

- `buildIngestConnectorApiState`
- `buildIngestConnectorApiCards`
- `buildIngestConnectorApiRows`
- `buildIngestConnectorApiRequestCards`
- `buildIngestConnectorApiErrorStates`
- `buildIngestConnectorApiEmptyStates`
- `buildIngestConnectorApiEmptyState`
- `buildIngestConnectorApiErrorState`
- `redactIngestConnectorApiText`

The connector API-state helper uses captured JSON only and does not initiate
fetches.
Focused connector API-state coverage lives in
`apps/web/tests/ingest-connector-api-state.test.mjs`.

`apps/web/src/ingestSessionReview.ts` is the Web ingest dashboard state for
captured client sessions. It reads already captured session JSON and optional
ingest log evidence, then builds route timelines, SDK call rows, quarantine
decision summaries, checksum evidence, empty states, and redacted error states:

- `buildIngestSessionReview`
- `collectIngestSessionRouteTimeline`
- `collectIngestSessionSdkCalls`
- `buildIngestSessionQuarantineDecisionSummary`
- `collectIngestSessionChecksumEvidence`
- `buildIngestSessionReviewEmptyState`
- `buildIngestSessionReviewErrorState`

The dashboard state helper is local-only, does not fetch, and returns
defensive clones for UI tests. Focused coverage lives in
`apps/web/tests/ingest-session-review.test.mjs`.

`apps/web/src/ingestDashboardState.ts` composes ingest API fixture state and
connector API fixture state into the Web ingest dashboard:

- `buildIngestDashboardState`
- `buildIngestDashboardCards`
- `buildIngestDashboardSections`
- `INGEST_DASHBOARD_SECTION_IDS`

The dashboard state exposes local-only and no-network indicators, connector
readiness, source/search/quarantine cards, warnings, errors, redaction counts,
and frozen sections without fetching remote data.

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

The API fixture schema samples are
`packages/schemas/fixtures/ingest-search.valid.json` and
`packages/schemas/fixtures/ingest-search.invalid.json`.

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

`packages/schemas/src/ingestConnectorApiManifest.ts` defines the camelCase API
manifest schema and validators for:

- `ingestConnectorApiManifestSchema`
- `ingestConnectorApiProfileSchema`
- `ingestConnectorApiManifestSchemas`
- `getIngestConnectorApiManifestSchema`
- `validateIngestConnectorApiManifest`
- `validateIngestConnectorApiProfile`
- `assertIngestConnectorApiManifest`
- `assertIngestConnectorApiProfile`
- `isIngestConnectorApiCapability`
- `isIngestConnectorApiMediaType`
- `isIngestConnectorApiProfileId`

The connector API manifest fixtures are
`packages/schemas/fixtures/ingest-connector-api-manifest.valid.json`,
`packages/schemas/fixtures/ingest-connector-api-manifest.invalid.json`, and
`packages/schemas/fixtures/ingest-connector-api-manifest.schema.json`, with
behavior checked by
`packages/schemas/tests/ingest-connector-api-manifest.test.mjs`.

The OpenAPI and schema alignment gates are public and local-only:
`tests/test_validate_openapi_ingest_search.py` checks ingest/search route and
schema shape in `docs/openapi.yaml`,
`tests/test_validate_openapi_ingest_connector_api_schema.py` checks the
connector manifest API OpenAPI/schema shape,
`tests/test_ingest_contract_alignment.py` checks API fixture, client-session,
docs, and OpenAPI route parity, `tests/test_ingest_connector_api_e2e.py`
checks cross-surface connector API E2E parity,
`tests/test_validate_openapi_schema_components.py` checks shared OpenAPI schema
component wiring, `apps/api/tests/ingest-connector-schema-alignment.test.mjs`
checks API route schema fixture alignment, and
`tests/test_schema_alignment_docs.py` checks `docs/schema-alignment.md`.

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
- `examples/ingest-search/connector-api-requests.json` shows the connector
  manifest API replay envelope.
- `examples/ingest-search/client-session.json` ties API, SDK, CLI, Web state,
  schema kinds, and fixture files into one safe client session sample.

`examples/ingest-search/api-requests.json` is reused by the CLI replay and
verify commands, SDK fixture fetch, API route fixture tests, schema fixture
tests, and Web API-state tests. It remains local-only: `apiBase` points to
localhost, route bodies use checked-in fixture data, and no test command makes
live network requests.

`examples/ingest-search/connector-api-requests.json` is reused by the connector
CLI replay, API fixture replay test, SDK connector client test, schema API
manifest fixtures, and Web connector API-state tests. It centers on
`GET /v1/ingest/connectors` and includes local negative replay cases for
unsupported methods and paths.

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
python -m unittest tests.test_ingest_connector_api_e2e
python -m unittest tests.test_ingest_contract_alignment
python -m unittest tests.test_validate_openapi_ingest_connector_api_schema
python -m unittest tests.test_validate_openapi_schema_components
python -m unittest tests.test_schema_alignment_docs
python -m unittest discover -s services\ingest\tests -p test_connector_manifest.py
python -m unittest discover -s services\ingest\tests -p test_ingest_cli_connector_manifest.py
node apps\api\tests\ingest-connector-routes.test.mjs
node apps\api\tests\ingest-connector-fixture-replay.test.mjs
node apps\api\tests\ingest-connector-schema-alignment.test.mjs
node apps\api\tests\ingest-fixture-services.test.mjs
node apps\api\tests\ingest-openapi-routes.test.mjs
node packages\cli\tests\ingest-connector-api-replay.test.mjs
node packages\cli\tests\ingest-api-replay.test.mjs
node packages\cli\tests\ingest-api-verify.test.mjs
node packages\sdk-js\tests\client-ingest-search.test.mjs
node packages\sdk-js\tests\ingest-connector-client.test.mjs
node packages\sdk-js\tests\ingest-connector-fixture-fetch.test.mjs
node packages\sdk-js\tests\ingest-fixture-fetch.test.mjs
node packages\sdk-js\tests\local-ingest-connector-manifest.test.mjs
node apps\web\tests\ingest-api-state.test.mjs
node apps\web\tests\ingest-connector-api-state.test.mjs
node apps\web\tests\ingest-connector-state.test.mjs
node apps\web\tests\ingest-session-review.test.mjs
node packages\schemas\tests\ingest-connector-api-manifest.test.mjs
node packages\schemas\tests\ingest-connector-manifest.test.mjs
node packages\schemas\tests\ingest-search.test.mjs
npm.cmd --workspace @sovereignops/api run check
npm.cmd --workspace @sovereignops/sdk-js run check
npm.cmd --workspace @sovereignops/cli run check
npm.cmd --workspace @sovereignops/web run check
npm.cmd --workspace @sovereignops/schemas run check
```
