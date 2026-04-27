# Plugin Review Artifact API

This guide defines the local-first API, SDK, CLI fixture, schema, and Web review
surface for plugin review artifact previews. It complements
`docs/plugin-review-artifacts.md`, which describes the artifact record itself.

The API slice is a preview path only. It accepts local artifact inputs, returns a
deterministic preview response, and keeps all replay data in checked-in fixtures.

## Scope

- Keep preview generation local and deterministic.
- Use in-memory route dispatch in tests.
- Keep request fixtures under `examples/plugins/release-notes/`.
- Keep JSON schema fixtures under `packages/schemas/fixtures/`.
- Keep Web helpers as pure object builders.
- Keep CLI replay commands pointed at checked-in fixtures.
- Keep release checks wired through Python unittest modules.

## Public Files

The Round 27 API and SDK slice is expected to use these repo-relative files:

- `docs/plugin-review-artifact-api.md`
- `tests/test_plugin_review_artifact_api_docs.py`
- `tests/test_plugin_review_artifact_api_alignment.py`
- `apps/api/src/pluginReviewArtifactRoutes.ts`
- `apps/api/tests/plugin-review-artifact-routes.test.mjs`
- `packages/sdk-js/src/pluginReviewArtifactClient.ts`
- `packages/sdk-js/tests/client-plugin-review-artifact.test.mjs`
- `packages/cli/src/pluginReviewArtifactApiReplay.ts`
- `packages/cli/tests/plugin-review-artifact-api-replay.test.mjs`
- `examples/plugins/release-notes/review-artifact-api-requests.json`
- `packages/schemas/src/pluginReviewArtifact.ts`
- `packages/schemas/tests/plugin-review-artifact.test.mjs`
- `packages/schemas/fixtures/plugin-review-artifact-preview.valid.json`
- `packages/schemas/fixtures/plugin-review-artifact-preview.invalid.json`
- `packages/schemas/fixtures/plugin-review-artifact-preview.schema.json`
- `apps/web/src/pluginReviewArtifactApiState.ts`
- `apps/web/tests/plugin-review-artifact-api-state.test.mjs`
- `docs/openapi.yaml`
- `scripts/release_check.py`
- `scripts/repo_health.py`

## API Route

The route path is `POST /v1/plugins/review-artifacts/preview`.

`apps/api/src/pluginReviewArtifactRoutes.ts` should export
`createPluginReviewArtifactRoutes` and `mountPluginReviewArtifactRoutes`. The
route should return `plugin-review-artifact.preview` responses and JSON error
envelopes through the shared router helpers.

`docs/openapi.yaml` should define operation id `previewPluginReviewArtifact` for
`/v1/plugins/review-artifacts/preview`, with request and response schemas that
match the schema package fixtures.

## SDK Client

`packages/sdk-js/src/pluginReviewArtifactClient.ts` should export
`PluginReviewArtifactClient` and `createPluginReviewArtifactClient`.

The client should expose a preview method and may expose aliases such as
`previewArtifact` or `previewReviewArtifact`. Each method should send `POST`
requests to the SDK endpoint path `plugins/review-artifacts/preview`. It should
validate the request before sending, validate the JSON response, and freeze
cloned response objects before returning them to callers.

## CLI Fixture

`examples/plugins/release-notes/review-artifact-api-requests.json` should record
the local request fixture for the release-notes plugin example. Each request
should include:

- a stable request id;
- `POST /v1/plugins/review-artifacts/preview`;
- repo-relative input paths such as
  `examples/plugins/release-notes/review-artifact.json`;
- expected response kind `plugin-review-artifact.preview`;
- status and fingerprint expectations.

`packages/cli/src/pluginReviewArtifactApiReplay.ts` should expose
`runPluginReviewArtifactApiReplayCli` for replaying the fixture through local
route dispatch.

## Schema Fixtures

`packages/schemas/src/pluginReviewArtifact.ts` should expose the runtime
validator and JSON schema metadata for plugin review artifact previews:

- `PLUGIN_REVIEW_ARTIFACT_PREVIEW_SCHEMA_VERSION`
- `pluginReviewArtifactPreviewSchema`
- `pluginReviewArtifactPreviewSchemaDefinition`
- `validatePluginReviewArtifactPreview`
- `assertPluginReviewArtifactPreview`

The valid and invalid fixtures should stay in `packages/schemas/fixtures/` and
the exported schema should stay at
`packages/schemas/fixtures/plugin-review-artifact-preview.schema.json`.

## Web Helper

`apps/web/src/pluginReviewArtifactApiState.ts` should expose
`buildPluginReviewArtifactApiState`. The helper should accept supplied fixture
objects, route summaries, and preview responses, then return review state for
local inspection without opening sockets.

## Release Wiring

Once the parent API and SDK files are integrated:

- `apps/api/package.json` should run
  `tests/plugin-review-artifact-routes.test.mjs`.
- `packages/sdk-js/package.json` should run
  `tests/client-plugin-review-artifact.test.mjs`.
- `packages/cli/package.json` should run
  `tests/plugin-review-artifact-api-replay.test.mjs`.
- `packages/schemas/package.json` should run
  `tests/plugin-review-artifact.test.mjs`.
- `apps/web/package.json` should run
  `tests/plugin-review-artifact-api-state.test.mjs`.
- `scripts/release_check.py` should include
  `plugin-review-artifact-api-alignment`.
- `scripts/repo_health.py` should include the API docs, tests, fixtures, and
  implementation files.

## Guardrails

- Use repo-relative paths only.
- Keep fixture input and output JSON local-only.
- Keep `externalCalls: 0` on artifact-derived records.
- Store redacted values as `[REDACTED]`.
- Do not place host-specific paths, private planning folders, raw credentials,
  package cache paths, or live service URLs in docs or fixtures.

## Validation

Run the focused checks from the repository root:

```powershell
python -m unittest tests.test_plugin_review_artifact_api_docs
python -m unittest tests.test_plugin_review_artifact_api_alignment
python -m json.tool examples\plugins\release-notes\review-artifact-api-requests.json
python -m json.tool packages\schemas\fixtures\plugin-review-artifact-preview.valid.json
python -m json.tool packages\schemas\fixtures\plugin-review-artifact-preview.invalid.json
python -m json.tool packages\schemas\fixtures\plugin-review-artifact-preview.schema.json
```
