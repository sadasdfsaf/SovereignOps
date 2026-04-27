# Ingest Evidence API Fixtures

This guide documents the local-only replay path for ingest evidence API
fixtures across API, SDK, CLI, and Web surfaces. The fixture bundle is
`examples/ingest-search/evidence-api-requests.json`; the release artifact
example is `examples/ingest-search/evidence-release-artifact.json`. This guide
lives at `docs/ingest-evidence-api-fixtures.md`.

## Scope

- Replay uses checked-in JSON fixtures and in-memory route dispatch.
- Evidence and package metadata stay under `examples/ingest-search/`.
- Source identifiers stay under `fixture://ingest-search/`.
- The API fixture bundle is compared with `docs/openapi.yaml` before release
  packaging.
- Release metadata stores counts, hashes, fingerprints, and redacted session
  fields only.

## Fixture Inputs

The replay flow joins the ingest search fixtures with evidence and package
metadata:

- `examples/ingest-search/evidence-api-requests.json`
- `examples/ingest-search/audit-evidence.json`
- `examples/ingest-search/evidence-export-session.json`
- `examples/ingest-search/evidence-parity-session.json`
- `examples/ingest-search/evidence-release-artifact.json`
- `docs/openapi.yaml`

The fixture paths are repository-relative. They must not include absolute drive
paths, parent-directory traversal, private workspace folders, or files outside
the checked-in ingest search fixture set.

## API Replay

The API replay path is implemented by
`apps/api/src/ingestEvidenceRoutes.ts` and
`apps/api/tests/ingest-evidence-fixture-replay.test.mjs`.

The API surface loads the evidence fixture referenced by
`examples/ingest-search/evidence-api-requests.json`, materializes `$fixtureRef`
entries, and dispatches `createIngestEvidenceRoutes` in memory. The replay
keeps these route facts aligned:

- Export previews stay on `/v1/ingest/evidence/export`.
- Package previews stay on `/v1/ingest/evidence/package`.
- Request bodies reference `examples/ingest-search/audit-evidence.json`.
- Response expectations pin status, content type, kind, format, summary,
  package file descriptors, and fingerprints.
- Error fixtures keep the same JSON error envelope as the route implementation.

## SDK Replay

The SDK replay path is implemented by
`packages/sdk-js/src/ingestEvidenceFixtureFetch.ts` and
`packages/sdk-js/src/ingestEvidenceClient.ts`. The focused test is
`packages/sdk-js/tests/ingest-evidence-fixture-fetch.test.mjs`.

SDK callers use these helpers:

- `loadIngestEvidenceFixtureBundle` reads the checked-in request bundle.
- `createIngestEvidenceFixtureFetch` matches method, path, and JSON body values.
- `createIngestEvidenceFixtureClientHarness` wires the fixture resolver into
  `createIngestEvidenceClient`.
- `createIngestEvidenceFixtureClient` exposes the same typed evidence export
  and package methods with fixture responses.

The SDK harness records matched request ids and returns JSON-compatible error
payloads for route, method, or body drift.

## CLI Replay

The CLI replay path is implemented by
`packages/cli/src/ingestEvidenceApiReplay.ts` and
`packages/cli/src/index.ts`. The focused test is
`packages/cli/tests/ingest-evidence-api-replay.test.mjs`.

Run these commands from the repository root:

```powershell
node packages\cli\src\index.ts ingest evidence api replay --fixture examples\ingest-search\evidence-api-requests.json
node packages\cli\src\index.ts ingest evidence api replay --fixture examples\ingest-search\evidence-api-requests.json --method POST --route /v1/ingest/evidence/export
```

`ingest evidence api replay` summarizes all recorded requests or filters by
method, route, and id. It replays the evidence API fixture through the local
route handlers and rejects unsafe local path fields with JSON-only stderr. The
release artifact records `runIngestEvidenceApiReplayCli` as the CLI replay
entrypoint.

## Web Review

The Web replay review path is implemented by
`apps/web/src/ingestEvidenceApiState.ts` and
`apps/web/src/ingestEvidenceReview.ts`. The focused tests are
`apps/web/tests/ingest-evidence-api-state.test.mjs` and
`apps/web/tests/ingest-evidence-review.test.mjs`.

Web review builders consume supplied local objects:

- `buildIngestEvidenceApiState` turns evidence export/package API responses
  into format cards, command rows, route rows, package descriptors, and route
  error states.
- `buildIngestEvidenceReview` passes through checked-in export sessions for
  comparison with API replay output.
- Web builders do not open sockets. They transform fixture JSON into review
  state for local inspection.

## Release Artifact

`examples/ingest-search/evidence-release-artifact.json` is a small release
artifact example for this replay path. It references only local checked-in
metadata and does not embed source file contents.

The artifact records:

- Input metadata paths and SHA-256 hashes.
- API, SDK, CLI, and Web replay surfaces.
- CLI replay commands.
- Package manifest counts and fingerprints from
  `examples/ingest-search/evidence-export-session.json`.
- Audit evidence counts and source URIs from
  `examples/ingest-search/audit-evidence.json`.
- Redaction marker and render targets.

## Guardrails

- Keep fixture references repository-relative.
- Keep source URIs under `fixture://ingest-search/`.
- Keep release metadata limited to counts, hashes, fingerprints, paths, route
  ids, and redacted fields.
- Use `[REDACTED]` for session identifiers in release metadata.
- Do not add credential-shaped values, private plan paths, or private workspace
  folders to docs or examples.
- Replay and review read checked-in files or in-memory objects only.

## Validation Commands

Run the focused validation from the repository root:

```powershell
python -m json.tool examples\ingest-search\evidence-api-requests.json
python -m json.tool examples\ingest-search\evidence-release-artifact.json
python -m unittest tests.test_ingest_evidence_api_fixtures_docs
```

The Python test validates required sections, commands, referenced local files,
guarded wording, endpoint-free wording, release artifact hashes, and JSON
shape.
