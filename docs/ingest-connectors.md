# Ingest Connector Manifest And Local Preview

This guide documents the public connector capability manifest and the local
preview path that carries connector output through the Python CLI, API route
state, SDK helpers, and Web state builders.

## Safety Boundary

The connector path is local-only. Examples read checked-in fixtures, localhost
API previews, or injected in-memory data.
They require no network access, no remote account, and no durable write.

Connector output is default untrusted. Python connectors receive
`trusted: false` unless the caller passes `--trusted`; API and SDK requests
leave `options.trusted` unset unless a caller has already verified the source;
Web state should render the prepared state without upgrading trust. Manifest
records keep `local_only: true`, `network_access: false`,
`content_untrusted_by_default: true`, `localOnly: true`,
`networkAccess: false`, `durableWrites: false`, or `untrustedByDefault`
depending on the layer shape.

Source identifiers and paths stay local. Use `fixture://`, `file://`,
`stdin://`, `workspace://`, or `local://` source URIs, and repository-relative
paths such as `examples/ingest-search/records.csv`.

## Connector Manifest

The public connector manifest is a capability list, not a private runtime file.
Keep it aligned with these code paths:

| Capability | Python surface | Media type | Preview output |
| --- | --- | --- | --- |
| Markdown sections | `MarkdownStructuredConnector` in `services/ingest/src/sovereignops_ingest/structured.py` | `text/markdown` | `StructuredImportResult` documents with line citations |
| JSON leaves | `JSONStructuredConnector` in `services/ingest/src/sovereignops_ingest/structured.py` | `application/json` | JSON path citations and deterministic canonical values |
| CSV rows | `CSVStructuredConnector` in `services/ingest/src/sovereignops_ingest/structured.py` | `text/csv` | row documents, column metadata, validation errors, and quarantine-ready findings |
| Repository scan | `RepositoryConnector` in `services/ingest/src/sovereignops_ingest/repository.py` | detected from suffix | relative paths, checksums, media types, and optional text content |
| JSONL logs | `JSONLLogConnector` in `services/ingest/src/sovereignops_ingest/logs.py` | `application/jsonl` | event documents with line citations |
| Plain text logs | `PlainTextLogConnector` in `services/ingest/src/sovereignops_ingest/logs.py` | `text/plain` | line-based event documents |

The older parser classes in
`services/ingest/src/sovereignops_ingest/connectors.py` remain available for
basic chunk parsing. Prefer the structured connectors when building local
preview, search, or quarantine state because they carry validation errors and
local data safety findings.

`services/ingest/src/sovereignops_ingest/connector_manifest.py` builds the
Python manifest with `connector_manifest`, `build_public_connector_manifest`,
`build_connector_manifest`, `list_connector_manifests`, and
`get_connector_manifest`. The public payload uses
`sovereignops.ingest.connector-manifest`, exposes connector ids such as
`csv-structured`, `json-structured`, `jsonl-log`, `markdown-structured`,
`plain-text-log`, `repository`, and `search-index`, and carries
`citation_capabilities`, `validation_modes`, `safety_findings`, and
`content_untrusted_by_default`.

## Python CLI

The CLI entry point is `services/ingest/src/sovereignops_ingest/cli.py`. It
reads local files or stdin and emits JSON.

```powershell
python -m services.ingest.src.sovereignops_ingest.cli parse-markdown examples\ingest-search\notes.md --source-uri fixture://ingest-search/notes.md
python -m services.ingest.src.sovereignops_ingest.cli parse-json examples\ingest-search\records.json --source-uri fixture://ingest-search/records.json
python -m services.ingest.src.sovereignops_ingest.cli parse-csv examples\ingest-search\records.csv --source-uri fixture://ingest-search/records.csv --require-column id --require-column title
python -m services.ingest.src.sovereignops_ingest.cli normalize examples\ingest-search\notes.md --source-uri fixture://ingest-search/notes.md --media-type text/markdown
python -m services.ingest.src.sovereignops_ingest.cli connectors manifest
python -m services.ingest.src.sovereignops_ingest.cli connector-manifest
```

Default CLI output keeps citations untrusted. Only pass `--trusted` when the
source has already been verified outside the connector path.

## API Route

`apps/api/src/ingestConnectorRoutes.ts` exposes the connector capability
manifest for local preview:

- `GET /v1/ingest/connectors`
- `createDefaultIngestConnectorManifest`
- `createIngestConnectorManifest`
- `createMemoryIngestConnectorRouteState`
- `createIngestConnectorRoutes`
- `mountIngestConnectorRoutes`

The API manifest uses in-process transports, local source profiles, and preview
limits. It reports `localOnly: true`, `networkAccess: false`,
`durableWrites: false`, and `untrustedByDefault` for connector safety state.

`apps/api/src/ingestOpenApiRoutes.ts` exposes local preview route state for the
OpenAPI ingest/search contract:

- `POST /v1/ingest/normalize`
- `POST /v1/ingest/structured`
- `POST /v1/ingest/repository/scan`
- `POST /v1/search/query`
- `POST /v1/quarantine/cases`
- `POST /v1/quarantine/cases/{caseId}/decision`
- `createIngestOpenApiRouteStateFromFixtures`
- `createMemoryIngestOpenApiRouteState`
- `createIngestOpenApiRoutes`
- `mountIngestOpenApiRoutes`

`apps/api/src/ingestFixtureServices.ts` adapts the public ingest/search fixture
set into deterministic in-memory route state:

- `DEFAULT_INGEST_SEARCH_FIXTURE_DIRECTORY`
- `resolveIngestSearchFixturePaths`
- `loadIngestSearchFixtureBundle`
- `createIngestRouteStateSeedFromFixtures`
- `createIngestRouteStateFromFixtures`
- `createIngestRouteStateFromIngestSearchFixtures`
- `validateIngestSearchFixtureBundle`
- `IngestFixtureValidationError`

The API fixture services join `repository.json`, `search-index.json`,
`quarantine.json`, and `api-requests.json`; reject fixture paths that escape the
workspace root; and replay the OpenAPI-shaped route responses without a live
server.

Replay the checked-in API fixture without opening a live network connection:

```powershell
node packages\cli\src\index.ts ingest api replay --fixture examples\ingest-search\api-requests.json --route /v1/ingest/structured
node packages\cli\src\index.ts ingest api verify --fixture examples\ingest-search\api-requests.json --openapi docs\openapi.yaml
```

The CLI replay and verification code lives in
`packages/cli/src/ingestApiReplay.ts` and
`packages/cli/src/ingestApiVerify.ts`. It accepts local JSON and OpenAPI files,
rejects URL fixtures and private paths, reports JSON-only errors, and records
`network.liveRequests: 0` for verification.

The connector manifest API has its own local replay fixture:
`examples/ingest-search/connector-api-requests.json`. Replay it through the
connector route without opening a network connection:

```powershell
node packages\cli\src\index.ts ingest connectors api replay --fixture examples\ingest-search\connector-api-requests.json
node packages\cli\src\index.ts ingest-connector-api replay --fixture examples\ingest-search\connector-api-requests.json --id api_ingest_connectors_manifest
```

`packages/cli/src/ingestConnectorApiReplay.ts` dispatches those fixture
requests directly through `createIngestConnectorRoutes`, rejects private or
unsafe local paths, redacts raw local paths and secret-like values in output, and
returns JSON-only success or error envelopes.
The connector-specific replay surface is `runIngestConnectorApiReplayCli`,
`isIngestConnectorApiReplayCommand`, and
`createIngestConnectorApiDispatcher`.
The replay fixture is also a cross-surface parity input: API route tests and
CLI replay tests both consume `examples/ingest-search/connector-api-requests.json`
so the success envelope, unsupported method case, unsupported path case, and
redacted JSON-only errors stay aligned.

The route state accepts local source URIs, relative repository paths, and
request JSON. It returns checksums, citations, quarantine items, and
`untrusted: true` unless `options.trusted` is explicitly true.

## MCP Resource Preview

The MCP ingest connector preview workflow reuses the connector manifest but
presents it as read-only MCP resources and dry-run preview envelopes.
`services/mcp-gateway/src/ingestConnectorResources.ts` owns the gateway
resource definitions and preview tool descriptor.

| Surface | Public path or command | Contract |
| --- | --- | --- |
| MCP manifest resource | `sovereignops://ingest/connectors/manifest` | Reads the normalized local connector manifest and readiness metadata. |
| MCP profile resource | `sovereignops://ingest/connectors/{profileId}` | Reads one connector profile without executing a connector. |
| MCP preview tool | `ingest_connector.preview_manifest` | Returns manifest counts, readiness, and an optional connector profile with no side effects. |
| API routes | `apps/api/src/ingestConnectorMcpRoutes.ts` | Lists resources, reads one resource, and runs dry-run previews. |
| CLI preview | `packages/cli/src/ingestConnectorMcpPreview.ts` | Runs the local preview command and prints a JSON envelope. |
| SDK client | `packages/sdk-js/src/ingestConnectorMcpClient.ts` | Uses an injected local transport or fetch; it must not fall back to global fetch. |
| Web state | `apps/web/src/ingestConnectorMcpState.ts` | Builds connector cards, preview rows, approval labels, dry-run labels, and audit references from captured local JSON. |

The CLI preview commands stay local. Preview output reports dry-run safety
state without needing a write flag:

```powershell
node packages\cli\src\index.ts ingest connectors mcp preview --connector markdown-structured --format json
node packages\cli\src\index.ts ingest-connector-mcp preview --connector json-structured --fixture packages\schemas\fixtures\ingest-connector-api-manifest.valid.json --format json
```

API route docs describe `GET /v1/ingest/connectors/mcp/resources`,
`GET /v1/ingest/connectors/mcp/resources/{connectorId}`, and
`POST /v1/ingest/connectors/mcp/preview`. The route contract returns the same
safety fields as the connector manifest: `localOnly: true`,
`networkAccess: false`, `durableWrites: false`, `dryRun: true`, and
untrusted-by-default preview content.

`examples/ingest-search/connector-mcp-api-requests.json` is the public MCP API
fixture for route replay and parity checks. It uses
`ingest-connector-mcp-api-requests.v1`, keeps `apiBase` local, disables
network mode, and covers the resource list, single resource read, dry-run
preview, missing resource, and bad preview body cases. Replay should dispatch
through `createApiRouter([...createIngestConnectorRoutes(),
...createIngestConnectorMcpRoutes()])` in memory so no server or socket is
required.

Focused MCP API replay commands:

```powershell
node packages\cli\src\index.ts ingest connectors mcp api replay --fixture examples\ingest-search\connector-mcp-api-requests.json
node packages\cli\src\index.ts ingest-connector-mcp-api replay --fixture examples\ingest-search\connector-mcp-api-requests.json --id mcp_ingest_connector_resources
```

The SDK parity surface is `createIngestConnectorMcpClient` with an injected
fixture fetch built from `examples/ingest-search/connector-mcp-api-requests.json`.
The fixture fetch must match method, path, and JSON body, record local calls,
reject drift as JSON-only errors, and never fall back to global fetch. The Web
parity surface is `buildIngestConnectorMcpState`; it consumes the same fixture,
CLI replay output, SDK responses, or route responses as captured JSON and
builds frozen request cards, resource rows, dry-run labels, safety indicators,
and redacted error states.

`packages/sdk-js/src/ingestConnectorMcpClient.ts` should expose
`createIngestConnectorMcpClient`, `listResources`,
`listConnectorResources`, `listMcpConnectorResources`, `readResource`,
`readConnectorResource`, `readMcpConnectorResource`, `preview`,
`previewOutput`, and `previewManifestResources`. The SDK client requires an
injected fetch for localhost tests, rejects remote URLs, never opens a socket by
default, and redacts raw local paths and secret-shaped values in errors.

`apps/web/src/ingestConnectorMcpState.ts` should expose
`buildIngestConnectorMcpState`, `buildIngestConnectorMcpCards`,
`buildIngestConnectorMcpRows`, `buildIngestConnectorMcpSections`,
`buildIngestConnectorMcpEmptyState`, and
`getIngestConnectorMcpStatusLabel`. Web state consumes captured local JSON
only, labels every preview as dry-run, carries no-network indicators, and
treats connector output as default untrusted.

Every MCP connector resource read and preview request runs through the MCP
policy gate before connector execution. `deny` and `require_approval` stop
before handlers run. A preview may create an approval request for a later
durable import, but the preview itself must not write durable state. Audit
records should include the connector id, resource URI, redacted source URI or
fixture path, decision, `dryRun: true`, `localOnly: true`,
`networkAccess: false`, and `durableWrites: false`.

Focused MCP connector parity checks:

```powershell
python -m unittest tests.test_mcp_contract_docs tests.test_ingest_connectors_docs tests.test_agent_guide_docs
python -m unittest tests.test_validate_openapi_ingest_connector_mcp
node services\mcp-gateway\tests\ingest-connector-resources.test.mjs
node apps\api\tests\ingest-connector-mcp-routes.test.mjs
node packages\cli\tests\ingest-connector-mcp-preview.test.mjs
node packages\sdk-js\tests\ingest-connector-mcp-client.test.mjs
node apps\web\tests\ingest-connector-mcp-state.test.mjs
node packages\cli\src\index.ts ingest connectors mcp api replay --fixture examples\ingest-search\connector-mcp-api-requests.json
python scripts\release_check.py --dry-run
```

Focused API and CLI fixture checks:

These commands cover `apps/api/tests/ingest-fixture-services.test.mjs`,
`apps/api/tests/ingest-openapi-routes.test.mjs`,
`packages/cli/tests/ingest-api-replay.test.mjs`, and
`packages/cli/tests/ingest-api-verify.test.mjs`. Connector manifest API replay
is covered by `apps/api/tests/ingest-connector-fixture-replay.test.mjs` and
`packages/cli/tests/ingest-connector-api-replay.test.mjs`.

```powershell
node apps\api\tests\ingest-fixture-services.test.mjs
node apps\api\tests\ingest-openapi-routes.test.mjs
node apps\api\tests\ingest-connector-fixture-replay.test.mjs
node packages\cli\tests\ingest-api-replay.test.mjs
node packages\cli\tests\ingest-api-verify.test.mjs
node packages\cli\tests\ingest-connector-api-replay.test.mjs
```

## SDK Helper

Use `packages/sdk-js/src/ingestClient.ts` when a caller wants the route-shaped
API preview through an injected `fetch` implementation:

- `createIngestSearchClient`
- `IngestSearchClient.normalize`
- `IngestSearchClient.ingestStructured`
- `IngestSearchClient.structuredIngest`
- `IngestSearchClient.scanRepository`
- `IngestSearchClient.repositoryScan`
- `IngestSearchClient.search`
- `IngestSearchClient.searchQuery`
- `IngestSearchClient.createQuarantineCases`
- `IngestSearchClient.decideQuarantineCase`

Use `packages/sdk-js/src/ingestFixtureFetch.ts` when SDK tests or examples
should drive the API client from the checked-in fixture bundle:

- `DEFAULT_INGEST_FIXTURE_PATH`
- `loadIngestFixtureBundle`
- `createIngestFixtureFetch`
- `createIngestFixtureClient`
- `createIngestFixtureClientHarness`
- `baseUrlFromIngestFixtureBundle`

The fixture fetch matches method, path, and JSON body against
`examples/ingest-search/api-requests.json`, returns typed fixture errors for
drift, and records calls in memory. It does not open a socket or require a
running API process.
This is the SDK fixture fetch and client harness for route-shaped ingest
connector previews. Use it for local parity checks that need an
`IngestSearchClient` boundary but must replay checked-in JSON rather than
calling a live API.

Use `packages/sdk-js/src/ingestConnectorFixtureFetch.ts` when tests need the
focused connector manifest client against
`examples/ingest-search/connector-api-requests.json`:

- `DEFAULT_INGEST_CONNECTOR_FIXTURE_PATH`
- `loadIngestConnectorFixtureBundle`
- `createIngestConnectorFixtureFetch`
- `createIngestConnectorFixtureClient`
- `createIngestConnectorFixtureClientHarness`
- `baseUrlFromIngestConnectorFixtureBundle`
- `IngestConnectorFixtureError`
- `IngestConnectorFixtureFetch`
- `IngestConnectorFixtureClientHarness`

The connector fixture harness uses an injected fetch, never falls back to
global fetch, derives a local base URL, redacts unsafe fixture errors, validates
the successful manifest response, and preserves negative replay cases for
unsupported method, unsupported path, and request-body drift.

Use `packages/sdk-js/src/ingestConnectorClient.ts` when a caller wants only the
connector manifest API route through an injected `fetch`:

- `createIngestConnectorClient`
- `IngestConnectorClient.getManifest`
- `IngestConnectorClient.manifest`
- `IngestConnectorClient.getReadiness`
- `IngestConnectorClient.readiness`

The connector API client requires an injected fetch, calls
`GET /v1/ingest/connectors`, normalizes the API manifest through
`normalizeLocalIngestConnectorManifest`, builds readiness with
`buildLocalIngestConnectorReadinessSummary`, and redacts raw local paths or
secret-like values from typed API errors.

Use pure helpers from `packages/sdk-js/src/localIngest.ts` when the caller
already has local JSON and does not need an API boundary:

- `normalizeLocalSourceSummaries`
- `buildLocalSearchView`
- `searchLocalText`
- `groupLocalQuarantineRecords`
- `prepareLocalQuarantineDecisionPayload`

Use `packages/sdk-js/src/localIngestConnectorManifest.ts` for manifest
normalization and readiness without an API boundary:

- `LOCAL_INGEST_CONNECTOR_MANIFEST_KIND`
- `LOCAL_INGEST_CONNECTOR_MANIFEST_SCHEMA_VERSION`
- `listLocalIngestConnectorProfiles`
- `getLocalIngestConnectorProfile`
- `normalizeLocalIngestConnectorManifest`
- `buildLocalIngestConnectorReadinessSummary`
- `LocalIngestConnectorManifestError`

The SDK normalizer accepts Python/API manifest JSON, rejects private paths and
raw secrets, freezes returned objects, and keeps profiles local-only and
trusted-by-default false.

Focused SDK checks:

These commands cover `packages/sdk-js/tests/client-ingest-search.test.mjs`,
`packages/sdk-js/tests/ingest-fixture-fetch.test.mjs`,
`packages/sdk-js/tests/local-ingest.test.mjs`, and
`packages/sdk-js/tests/local-ingest-connector-manifest.test.mjs`. The connector
API client is covered by `packages/sdk-js/tests/ingest-connector-client.test.mjs`,
and the connector fixture harness is covered by
`packages/sdk-js/tests/ingest-connector-fixture-fetch.test.mjs`.

```powershell
node packages\sdk-js\tests\client-ingest-search.test.mjs
node packages\sdk-js\tests\ingest-connector-client.test.mjs
node packages\sdk-js\tests\ingest-fixture-fetch.test.mjs
node packages\sdk-js\tests\local-ingest.test.mjs
node packages\sdk-js\tests\local-ingest-connector-manifest.test.mjs
```

## Web State

`apps/web/src/ingestSearch.ts` turns prepared local connector state into view
models:

- `buildIngestSourceSummaryCards`
- `buildSearchResultRows`
- `buildIngestQuarantineQueueState`
- `buildIngestSearchEmptyState`
- `buildIngestSearchErrorState`

The Web layer should not fetch remote connector data for these fixtures. It
receives source summaries, search rows, and quarantine items that were already
prepared by the CLI, API route, or SDK helper.

`apps/web/src/ingestConnectorState.ts` turns connector manifests into safe view
state:

- `buildIngestConnectorState`
- `buildIngestConnectorCards`
- `buildIngestConnectorRows`
- `getIngestConnectorReadinessStatusLabel`
- `getIngestConnectorSafetyStateLabel`

The Web connector state accepts Python CLI, API, and SDK manifest shapes. It
redacts raw local paths and secret-like fields, marks malformed or unsafe input
as blocked, and renders "Untrusted by default" without retaining unsafe values.

`apps/web/src/ingestApiState.ts` turns API fixture bundles, single fixture
entries, or route response bodies into the same UI-ready source, result,
quarantine, and error states:

- `buildIngestApiState`
- `collectIngestApiSourceSummaries`
- `buildIngestApiSourceCards`
- `collectIngestApiSearchResults`
- `buildIngestApiSearchRows`
- `collectIngestApiQuarantineItems`
- `buildIngestApiQuarantineQueueState`
- `buildIngestApiErrorStates`

The Web API-state helper consumes already captured API JSON. It does not fetch
remote data and defensively clones returned state so fixture tests cannot mutate
shared inputs.

`apps/web/src/ingestConnectorApiState.ts` turns connector manifest API
responses, replay fixtures, and replay output into connector cards, rows,
request cards, summaries, empty states, and redacted error states:

- `buildIngestConnectorApiState`
- `buildIngestConnectorApiCards`
- `buildIngestConnectorApiRows`
- `buildIngestConnectorApiRequestCards`
- `buildIngestConnectorApiErrorStates`
- `buildIngestConnectorApiEmptyStates`
- `buildIngestConnectorApiEmptyState`
- `buildIngestConnectorApiErrorState`
- `redactIngestConnectorApiText`

The connector API-state helper uses already captured local JSON, redacts raw
paths and secret-like strings before they reach labels, and does not fetch.

`apps/web/src/ingestSessionReview.ts` is the Web ingest dashboard state for a
captured local ingest session. It turns `examples/ingest-search/client-session.json`
and optional ingest log evidence into route timelines, SDK call rows,
quarantine decision summaries, checksum evidence, empty states, and redacted
error states:

- `buildIngestSessionReview`
- `collectIngestSessionRouteTimeline`
- `collectIngestSessionSdkCalls`
- `buildIngestSessionQuarantineDecisionSummary`
- `collectIngestSessionChecksumEvidence`
- `buildIngestSessionReviewEmptyState`
- `buildIngestSessionReviewErrorState`

The dashboard helper consumes captured local JSON only. It does not initiate
remote fetches, and it defensively clones returned state before Web tests render
or mutate the view models.

`apps/web/src/ingestDashboardState.ts` composes captured ingest API fixture
state and connector API fixture state into the Web ingest dashboard:

- `buildIngestDashboardState`
- `buildIngestDashboardCards`
- `buildIngestDashboardSections`
- `INGEST_DASHBOARD_SECTION_IDS`

The dashboard state keeps `localOnly` and no-network indicators, connector
readiness, source/search/quarantine cards, warnings, errors, and redaction
counts in one frozen view model. It consumes captured local JSON only and does
not fetch.

Focused Web check:

These commands cover `apps/web/tests/ingest-search.test.mjs`,
`apps/web/tests/ingest-connector-state.test.mjs`,
`apps/web/tests/ingest-api-state.test.mjs`, and
`apps/web/tests/ingest-session-review.test.mjs`. Connector manifest API state
is covered by `apps/web/tests/ingest-connector-api-state.test.mjs`.

```powershell
node apps\web\tests\ingest-search.test.mjs
node apps\web\tests\ingest-connector-api-state.test.mjs
node apps\web\tests\ingest-connector-state.test.mjs
node apps\web\tests\ingest-api-state.test.mjs
node apps\web\tests\ingest-session-review.test.mjs
```

## Schema Contracts

`packages/schemas/src/ingestConnectorManifest.ts` defines the shared connector
manifest contract. It exports `INGEST_CONNECTOR_MANIFEST_SCHEMA_VERSION`,
`ingestConnectorManifestSchema`, `ingestConnectorProfileSchema`,
`ingestConnectorManifestSchemas`, `getIngestConnectorManifestSchema`,
`validateIngestConnectorManifest`, `validateIngestConnectorProfile`,
`assertIngestConnectorManifest`, and `isIngestConnectorId`.

The exported fixtures are:

- `packages/schemas/fixtures/ingest-connector-manifest.valid.json`
- `packages/schemas/fixtures/ingest-connector-manifest.invalid.json`
- `packages/schemas/fixtures/ingest-connector-manifest.schema.json`
- `packages/schemas/fixtures/ingest-connector-profile.schema.json`

`packages/schemas/src/ingestSearch.ts` defines the API fixture record contract
used by the OpenAPI-shaped route examples. It exports
`INGEST_SEARCH_SCHEMA_VERSION`, `ingestSearchKinds`, `ingestSearchSchemas`,
`ingestSearchSchemaDefinitions`, `ingestSearchValidators`,
`getIngestSearchSchema`, `validateIngestSearchObject`,
`assertIngestSearchObject`, and `isIngestSearchKind`.

The API fixture schema samples are:

- `packages/schemas/fixtures/ingest-search.valid.json`
- `packages/schemas/fixtures/ingest-search.invalid.json`

`packages/schemas/src/ingestConnectorApiManifest.ts` defines the camelCase
connector manifest API contract returned by `GET /v1/ingest/connectors`. It
exports `INGEST_CONNECTOR_API_MANIFEST_SCHEMA_VERSION`,
`ingestConnectorApiManifestSchema`, `ingestConnectorApiProfileSchema`,
`ingestConnectorApiManifestSchemas`, `getIngestConnectorApiManifestSchema`,
`validateIngestConnectorApiManifest`, `validateIngestConnectorApiProfile`,
`assertIngestConnectorApiManifest`, `assertIngestConnectorApiProfile`,
`isIngestConnectorApiCapability`, `isIngestConnectorApiMediaType`, and
`isIngestConnectorApiProfileId`.

The connector API manifest schema fixtures are:

- `packages/schemas/fixtures/ingest-connector-api-manifest.valid.json`
- `packages/schemas/fixtures/ingest-connector-api-manifest.invalid.json`
- `packages/schemas/fixtures/ingest-connector-api-manifest.schema.json`

OpenAPI and schema alignment stay in the public repo. Use
`tests/test_validate_openapi_ingest_search.py` for the ingest/search OpenAPI
route and schema shape,
`tests/test_validate_openapi_ingest_connector_api_schema.py` for the connector
manifest API OpenAPI/schema shape, `tests/test_ingest_contract_alignment.py`
for API fixture, client-session, docs, and OpenAPI route parity,
`tests/test_ingest_connector_api_e2e.py` for the cross-surface connector API E2E parity
check, `tests/test_validate_openapi_schema_components.py` for shared OpenAPI
schema component wiring, `apps/api/tests/ingest-connector-schema-alignment.test.mjs`
for API route schema fixture alignment, and `tests/test_schema_alignment_docs.py`
with `docs/schema-alignment.md` for the release-facing schema alignment
inventory.

Focused schema check:

These commands cover `packages/schemas/tests/ingest-connector-manifest.test.mjs`
and `packages/schemas/tests/ingest-search.test.mjs`. Connector API manifest
schemas are covered by
`packages/schemas/tests/ingest-connector-api-manifest.test.mjs`.

```powershell
node packages\schemas\tests\ingest-connector-api-manifest.test.mjs
node packages\schemas\tests\ingest-connector-manifest.test.mjs
node packages\schemas\tests\ingest-search.test.mjs
```

## Fixtures

The local preview fixtures live under `examples/ingest-search`:

- `examples/ingest-search/notes.md`
- `examples/ingest-search/records.json`
- `examples/ingest-search/records.csv`
- `examples/ingest-search/repository.json`
- `examples/ingest-search/search-index.json`
- `examples/ingest-search/quarantine.json`
- `examples/ingest-search/api-requests.json`
- `examples/ingest-search/connector-api-requests.json`
- `examples/ingest-search/connector-mcp-api-requests.json`
- `examples/ingest-search/client-session.json`

`examples/ingest-search/api-requests.json` is the canonical local API replay
fixture for the SDK fixture fetch, CLI replay and verify commands, API fixture
services, schema checks, and Web API-state helper. Keep route bodies JSON-only,
source URIs local, response bodies deterministic, and `apiBase` limited to
localhost.

`examples/ingest-search/connector-api-requests.json` is the connector manifest
API replay fixture for the CLI connector replay, API connector fixture replay
test, SDK connector API client, schema API manifest fixtures, and Web connector
API-state helper. It stays local-only, replays the successful
`GET /v1/ingest/connectors` manifest case, and carries local negative replay
cases for unsupported methods and paths.
It is also the input for the SDK connector fixture harness in
`packages/sdk-js/src/ingestConnectorFixtureFetch.ts` and the cross-surface
connector API parity test in `tests/test_ingest_connector_api_e2e.py`.

`examples/ingest-search/connector-mcp-api-requests.json` is the connector MCP
API replay fixture for route replay, CLI replay, SDK injected fixture fetch,
Web fixture state, and E2E parity. It stays local-only, replays
`GET /v1/ingest/connectors/mcp/resources`,
`GET /v1/ingest/connectors/mcp/resources/{connectorId}`, and
`POST /v1/ingest/connectors/mcp/preview`, and keeps negative cases for missing
resources and preview body validation.

Do not add private planning paths, machine-specific absolute paths, or remote
URLs to connector docs or fixtures.

## Release Checks

Run focused connector docs and preview checks from the repository root:

```powershell
python -m unittest tests.test_ingest_connectors_docs
python -m unittest tests.test_ingest_integration_docs tests.test_sdk_js_docs
python -m unittest discover -s services\ingest\tests
python -m unittest discover -s services\ingest\tests -p test_connector_manifest.py
python -m unittest discover -s services\ingest\tests -p test_ingest_cli_connector_manifest.py
node apps\api\tests\ingest-connector-routes.test.mjs
node apps\api\tests\ingest-connector-fixture-replay.test.mjs
node apps\api\tests\ingest-connector-mcp-routes.test.mjs
node packages\cli\src\index.ts ingest connectors mcp api replay --fixture examples\ingest-search\connector-mcp-api-requests.json
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
node apps\api\tests\ingest-connector-schema-alignment.test.mjs
python -m unittest tests.test_ingest_connector_api_e2e
python -m unittest tests.test_ingest_contract_alignment
python -m unittest tests.test_validate_openapi_ingest_connector_api_schema
python -m unittest tests.test_validate_openapi_schema_components
python -m unittest tests.test_schema_alignment_docs
python -m unittest tests.test_validate_openapi_ingest_search
python scripts\release_check.py --dry-run
```
