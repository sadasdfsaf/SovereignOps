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

Replay the checked-in API fixture without opening a live network connection:

```powershell
node packages\cli\src\index.ts ingest api replay --fixture examples\ingest-search\api-requests.json --route /v1/ingest/structured
node packages\cli\src\index.ts ingest api verify --fixture examples\ingest-search\api-requests.json --openapi docs\openapi.yaml
```

The route state accepts local source URIs, relative repository paths, and
request JSON. It returns checksums, citations, quarantine items, and
`untrusted: true` unless `options.trusted` is explicitly true.

## SDK Helper

Use `packages/sdk-js/src/ingestClient.ts` when a caller wants the route-shaped
API preview through an injected `fetch` implementation:

- `createIngestSearchClient`
- `IngestSearchClient.ingestStructured`
- `IngestSearchClient.scanRepository`
- `IngestSearchClient.search`
- `IngestSearchClient.createQuarantineCases`
- `IngestSearchClient.decideQuarantineCase`

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

```powershell
node packages\sdk-js\tests\client-ingest-search.test.mjs
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

Focused Web check:

```powershell
node apps\web\tests\ingest-search.test.mjs
node apps\web\tests\ingest-connector-state.test.mjs
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

Focused schema check:

```powershell
node packages\schemas\tests\ingest-connector-manifest.test.mjs
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
- `examples/ingest-search/client-session.json`

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
node packages\sdk-js\tests\local-ingest-connector-manifest.test.mjs
node apps\web\tests\ingest-connector-state.test.mjs
node packages\schemas\tests\ingest-connector-manifest.test.mjs
python -m unittest tests.test_validate_openapi_ingest_search
python scripts\release_check.py --dry-run
```
