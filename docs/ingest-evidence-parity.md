# Ingest Evidence Parity

This guide defines how local ingest evidence export surfaces stay aligned across
the schema validator, package helper, API routes, SDK helper, CLI commands, and
Web review model. The shared fixture is
`examples/ingest-search/audit-evidence.json`; the export walkthrough is
`docs/ingest-evidence-export.md` and its sample session is
`examples/ingest-search/evidence-export-session.json`.

## Parity Contract

All surfaces use the same evidence shape and local guardrails:

- Schema version `ingest-search-audit-evidence.v1`.
- `localOnly: true` on evidence input and output descriptors.
- Source identifiers under `fixture://ingest-search/`.
- Fixture paths under `examples/ingest-search/`.
- Deterministic summaries, fingerprints, package descriptors, and review
  counts.
- Redaction before previews, manifests, packages, or review snapshots are
  shared outside the current process.

If one surface adds or renames an evidence section, update the matching schema,
package, API, SDK, CLI, Web, fixture, and tests in the same change.

## Schema Validator

`packages/schemas/src/ingestEvidence.ts` is the contract gate. It owns the
accepted evidence schema, summary counts, local fixture path rules, source URI
rules, checksum shape, and cross-reference checks. Its focused test is
`packages/schemas/tests/ingest-evidence.test.mjs`.

Keep downstream surfaces aligned with these validator details:

- `validateIngestEvidence` accepts only the current schema version.
- Evidence must be local-only.
- `sourceSnapshots.path` must match the fixture path derived from
  `sourceSnapshots.sourceUri`.
- Summary counts must match the corresponding evidence arrays.
- Citation, decision, API trace, and client trace references must resolve to
  existing source, file, and request records.

## Package Helper

`packages/ingest-evidence/src/index.ts` is the deterministic rendering layer for
local export artifacts. Its focused test is
`packages/ingest-evidence/tests/ingest-evidence.test.mjs`.

Keep these helper outputs stable:

- `normalizeIngestEvidence` creates canonical `ingest-evidence.record` entries.
- `renderIngestEvidenceJsonl` emits one canonical record per line.
- `renderIngestEvidenceCsv` emits the canonical CSV columns.
- `createIngestEvidenceManifest` emits `ingest-evidence.manifest`.
- `createIngestEvidencePackage` emits `ingest-evidence.package`.
- `redactIngestEvidenceValue` removes sensitive-shaped keys and values before
  deterministic fingerprints are calculated.

## API Routes

`apps/api/src/ingestEvidenceRoutes.ts` owns the in-process route handlers for
`POST /v1/ingest/evidence/export` and `POST /v1/ingest/evidence/package`. Its
focused test is `apps/api/tests/ingest-evidence-routes.test.mjs`.

Keep API behavior aligned with the package helper:

- Request bodies carry an evidence object, format, filters, and optional
  metadata.
- Route handlers do not read files and do not require a live server.
- Export responses use `ingest-evidence.export` with `json`, `summary`, or
  `manifest` content.
- Package responses use `ingest-evidence.package` and content descriptors.
- Errors return JSON with a stable code, message, and path details without
  echoing raw input.

## SDK Client And Local Helper

`packages/sdk-js/src/localIngestEvidence.ts` is the SDK local helper surface and
`packages/sdk-js/src/index.ts` re-exports it. The focused test is
`packages/sdk-js/tests/local-ingest-evidence.test.mjs`.

Keep SDK behavior aligned with schema, API, and package behavior:

- `loadLocalIngestEvidence` parses JSON text or normalizes a local object.
- `summarizeLocalIngestEvidence` uses the same section counts and source
  identifiers.
- `detectLocalIngestEvidenceDrift` reports stale counts, missing references,
  duplicate ids, and checksum mismatches.
- `buildLocalIngestEvidenceExportPreview` emits
  `ingest-evidence.export-preview` with deterministic manifest fingerprints.
- Redaction options cover actors, checksums, commands, paths, reasons, and
  source URIs before previews leave the helper.

Any future SDK client wrapper around the API routes should call the same route
paths and parse the same response kinds documented here.

## CLI Commands

`packages/cli/src/ingestEvidence.ts` owns the CLI behavior and
`packages/cli/src/index.ts` exposes the entrypoint. Its focused test is
`packages/cli/tests/ingest-evidence.test.mjs`.

The local CLI parity commands are:

```powershell
node packages\cli\src\index.ts ingest evidence summary --input examples\ingest-search\audit-evidence.json
node packages\cli\src\index.ts ingest evidence export --input examples\ingest-search\audit-evidence.json --format jsonl
node packages\cli\src\index.ts ingest evidence export --input examples\ingest-search\audit-evidence.json --format csv
node packages\cli\src\index.ts ingest evidence package --input examples\ingest-search\audit-evidence.json
```

The CLI accepts workspace-local `.json` evidence files only. It rejects network
locations, parent-directory traversal, private workspace paths, malformed JSON,
stale summary counts, and unresolved fixture references with JSON-only stderr.

## Web Review Model

`apps/web/src/ingestSessionReview.ts` builds the local review view model. Its
focused test is `apps/web/tests/ingest-session-review.test.mjs`.

Keep the Web review model aligned with the same evidence facts:

- `buildIngestSessionReview` carries `schemaVersion`, `workspaceId`,
  `generatedAt`, and `localOnly`.
- Route timeline entries reflect captured API routes from the client session.
- SDK call rows reflect helper entry points and source URI counts.
- Decision summaries use the same item ids, actions, actors, reasons, and
  timestamps as the evidence bundle.
- Checksum evidence uses the same source URIs, checksum values, indexed counts,
  and held-item counts.
- The view model reads supplied local objects and does not fetch evidence.

## Redaction And Local-Only Guardrails

These guardrails apply to every surface:

- Evidence inputs stay inside `examples/ingest-search/`.
- Source identifiers stay under `fixture://ingest-search/`.
- API route tests run handlers in process; no live server is required.
- Validation commands use repository scripts and workspace packages only.
- Sensitive-shaped keys and credential-shaped values are redacted before
  export content, manifest content, package fingerprints, preview payloads, or
  review snapshots are compared.
- Validation errors describe paths and stable codes without including raw
  secret-shaped values.

## Validation Commands

Run the focused validation from the repository root:

```powershell
python -m unittest tests.test_ingest_evidence_parity_docs
python -m json.tool examples\ingest-search\audit-evidence.json
python -m json.tool examples\ingest-search\evidence-export-session.json
npm.cmd --workspace @sovereignops/schemas run check
npm.cmd --workspace @sovereignops/ingest-evidence run check
npm.cmd --workspace @sovereignops/api run check
npm.cmd --workspace @sovereignops/sdk-js run check
npm.cmd --workspace @sovereignops/cli run check
npm.cmd --workspace @sovereignops/web run check
```

These commands require only checked-in files and local workspace scripts.
