# Plugin Review Artifact Records API

## Scope

This document covers the local-first API, SDK, CLI fixture, schema, plugin SDK,
and Web review surface for storing redacted plugin review artifact records. The
record surface turns a preview artifact into a stable local baseline that can be
listed, retrieved, and compared without sending workspace data to a remote
service.

## Public Files

- `docs/plugin-review-artifact-records-api.md`
- `tests/test_plugin_review_artifact_records_api_docs.py`
- `tests/test_plugin_review_artifact_records_api_alignment.py`
- `tests/test_validate_openapi_plugin_review_artifact_records_api_fixture.py`
- `tests/test_openapi_fixture_contract.py`
- `packages/plugin-sdk/src/reviewArtifactRecords.ts`
- `packages/plugin-sdk/tests/review-artifact-records.test.mjs`
- `apps/api/src/pluginReviewArtifactRecordRoutes.ts`
- `apps/api/tests/plugin-review-artifact-record-routes.test.mjs`
- `packages/sdk-js/src/pluginReviewArtifactRecordClient.ts`
- `packages/sdk-js/tests/client-plugin-review-artifact-record.test.mjs`
- `packages/cli/src/pluginReviewArtifactRecordsReplay.ts`
- `packages/cli/tests/plugin-review-artifact-records-replay.test.mjs`
- `examples/plugins/release-notes/review-artifact-records-requests.json`
- `packages/schemas/src/pluginReviewArtifactRecord.ts`
- `packages/schemas/tests/plugin-review-artifact-record.test.mjs`
- `packages/schemas/fixtures/plugin-review-artifact-record.valid.json`
- `packages/schemas/fixtures/plugin-review-artifact-record.invalid.json`
- `packages/schemas/fixtures/plugin-review-artifact-record.schema.json`
- `packages/schemas/fixtures/plugin-review-artifact-record-list.valid.json`
- `packages/schemas/fixtures/plugin-review-artifact-record-list.schema.json`
- `packages/schemas/fixtures/plugin-review-artifact-record-comparison.valid.json`
- `packages/schemas/fixtures/plugin-review-artifact-record-comparison.schema.json`
- `packages/schemas/fixtures/plugin-review-artifact-record-create-request.valid.json`
- `packages/schemas/fixtures/plugin-review-artifact-record-create-request.schema.json`
- `packages/schemas/fixtures/plugin-review-artifact-records-requests.valid.json`
- `packages/schemas/fixtures/plugin-review-artifact-records-requests.invalid.json`
- `packages/schemas/fixtures/plugin-review-artifact-records-requests.schema.json`
- `apps/web/src/pluginReviewArtifactRecordState.ts`
- `apps/web/tests/plugin-review-artifact-record-state.test.mjs`
- `docs/openapi.yaml`
- `scripts/openapi_fixture_contract.py`
- `scripts/release_check.py`
- `scripts/repo_health.py`

## API Routes

- `POST /v1/plugins/review-artifacts/records` stores a redacted local plugin review artifact record from preview input or artifact output.
- `GET /v1/plugins/review-artifacts/records` lists stored local records with summary counts and filters.
- `GET /v1/plugins/review-artifacts/records/{recordId}` retrieves one stored local record.
- `POST /v1/plugins/review-artifacts/records/{recordId}/compare` compares a fresh artifact against a stored baseline and reports drift.

The OpenAPI operation ids are `createPluginReviewArtifactRecord`,
`listPluginReviewArtifactRecords`, `getPluginReviewArtifactRecord`, and
`comparePluginReviewArtifactRecord`.

## SDK Records

`createPluginReviewArtifactRecord` creates immutable local records from redacted
artifact output. `createPluginReviewArtifactRecordStore` keeps records in memory.
`comparePluginReviewArtifactToRecord` reports fingerprint drift, decision drift,
capability evidence changes, host API evidence changes, approval gate changes,
and local evidence changes so a reviewer can decide whether a baseline still
represents the current plugin review output.

## SDK Client

`PluginReviewArtifactRecordClient` and
`createPluginReviewArtifactRecordClient` expose typed `create`, `list`, `get`,
and `compare` methods. The client uses the
`plugins/review-artifacts/records` endpoint family and keeps response validation
strict: records must be local-only, redacted, and fingerprinted.

## CLI Fixture

`runPluginReviewArtifactRecordsReplayCli` replays local fixture requests from
`examples/plugins/release-notes/review-artifact-records-requests.json`. The
fixture covers create, list, get, and compare calls using local request data
only, with `[REDACTED]` values for any sensitive-looking field.

## Schema Fixtures

`PLUGIN_REVIEW_ARTIFACT_RECORD_SCHEMA_VERSION`,
`pluginReviewArtifactRecordSchema`,
`pluginReviewArtifactRecordSchemaDefinitions`,
`validatePluginReviewArtifactRecord`, and
`assertPluginReviewArtifactRecord` define the persisted record contract. Valid
fixtures must include local-only status, redaction status, artifact fingerprint,
record fingerprint, created timestamp, and summary counts.

## Request Bundle Schema

`packages/schemas/src/pluginReviewArtifactRecord.ts` also exposes the shared
records request bundle contract for API, SDK, CLI, plugin SDK, and Web parity:

- `PLUGIN_REVIEW_ARTIFACT_RECORD_API_REQUESTS_SCHEMA_VERSION`
- `pluginReviewArtifactRecordApiRequestsSchema`
- `pluginReviewArtifactRecordSchemaDefinitions`
- `pluginReviewArtifactRecordValidators`
- `validatePluginReviewArtifactRecordObject`
- `assertPluginReviewArtifactRecordObject`
- `validatePluginReviewArtifactRecordApiRequestBundle`
- `assertPluginReviewArtifactRecordApiRequestBundle`

The public request bundle fixtures are:

- `packages/schemas/fixtures/plugin-review-artifact-records-requests.valid.json`
- `packages/schemas/fixtures/plugin-review-artifact-records-requests.invalid.json`
- `packages/schemas/fixtures/plugin-review-artifact-records-requests.schema.json`

The bundle schema validates the checked-in records replay fixture before create,
list, get, and compare requests are consumed by API route tests, SDK fake-fetch
tests, CLI replay, and Web state builders. It locks request ids, the
`/v1/plugins/review-artifacts/records` endpoint family, local `apiBase` values,
repo-relative fixture references, JSON-only request bodies, and expected
record/comparison response fields.

## Web Helper

`buildPluginReviewArtifactRecordState` converts create, list, get, and compare
API output into pure view state. It highlights empty record stores, stale
baselines, fingerprint drift, decision drift, redaction status, and next actions
without depending on browser APIs.

## OpenAPI Fixture Drift

`tests/test_validate_openapi_plugin_review_artifact_records_api_fixture.py`
uses `scripts/openapi_fixture_contract.py` and
`tests/test_openapi_fixture_contract.py` to check that
`examples/plugins/release-notes/review-artifact-records-requests.json` still
maps to the documented create, list, get, and compare OpenAPI blocks. The drift
check locks expected response statuses, `plugins` tags, `recordId` path
parameters, request body schema references, local `apiBase`, and fixture safety
rules before API route tests, SDK fake-fetch tests, CLI replay, plugin SDK
record checks, and Web state builders consume the fixture.

## Release Wiring

The release check includes `plugin-review-artifact-records-api-alignment` so API
routes, docs, schemas, shared request bundle validators, generated request
bundle JSON schema fixtures, OpenAPI fixture drift checks, SDK, CLI, Web
helpers, examples, and health checks stay linked. It runs
`tests.test_validate_openapi_plugin_review_artifact_records_api_fixture` and
`tests.test_openapi_fixture_contract` with the alignment check. The repository
health script tracks the public files listed above.

## Guardrails

- Records stay local-only and redacted.
- Request bundles keep `apiBase` on `local://` endpoints and fixture references
  repo-relative.
- Record ids and fingerprints are deterministic for the same normalized artifact payload.
- The store rejects duplicate ids unless the caller uses a comparison workflow.
- Missing redaction metadata is a validation error.
- Fixture paths stay inside the workspace and never reference private planning files.
- Store redacted values as `[REDACTED]`.
- Reject raw credentials, unredacted secret-shaped values, absolute paths, and
  live service URLs in request bundle fixtures.

## Validation

- `python -m unittest tests.test_plugin_review_artifact_records_api_docs`
- `python -m unittest tests.test_plugin_review_artifact_records_api_alignment`
- `python -m unittest tests.test_validate_openapi_plugin_review_artifact_records_api_fixture tests.test_openapi_fixture_contract`
- `python -m json.tool examples\plugins\release-notes\review-artifact-records-requests.json`
- `python -m json.tool packages\schemas\fixtures\plugin-review-artifact-record.valid.json`
- `python -m json.tool packages\schemas\fixtures\plugin-review-artifact-record.invalid.json`
- `python -m json.tool packages\schemas\fixtures\plugin-review-artifact-record.schema.json`
- `python -m json.tool packages\schemas\fixtures\plugin-review-artifact-records-requests.valid.json`
- `python -m json.tool packages\schemas\fixtures\plugin-review-artifact-records-requests.invalid.json`
- `python -m json.tool packages\schemas\fixtures\plugin-review-artifact-records-requests.schema.json`
