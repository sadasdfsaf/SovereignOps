# Ingest Evidence Export

This guide describes the local export flow for ingest audit evidence. The
example session at `examples/ingest-search/evidence-export-session.json`
references `examples/ingest-search/audit-evidence.json` and maps that evidence
to the ingest evidence CLI, API routes, SDK helper, schema contract, and package
manifest.

## Evidence Input

The export session reads the checked-in evidence fixture:

- `examples/ingest-search/audit-evidence.json`
- `examples/ingest-search/evidence-export-session.json`

The session keeps the same `workspaceId`, `sessionId`, `localOnly` value, source
URIs, and summary counts as the evidence fixture. Source references use
`fixture://ingest-search/` URIs and repository-relative paths under
`examples/ingest-search`.

## Export Formats

The ingest evidence package supports deterministic outputs for the same
normalized evidence bundle:

- JSONL: `application/jsonl`, one `ingest-evidence.record` object per line.
- CSV: `text/csv`, one header row and one row per normalized evidence record.
- Package: `ingest-evidence.package`, containing `manifest`, `jsonl`, `csv`, and
  a package fingerprint.
- API preview: `ingest-evidence.export`, returning JSON, summary, or manifest
  content for a local POST body.

The package manifest uses `ingest-evidence.manifest` with version `1`. It
records the package id, creation timestamp, source schema version, workspace id,
redacted session id, normalized record count, record fingerprints, source
checksums, evidence file descriptors, JSONL descriptor, CSV descriptor, and
manifest fingerprint.

## CLI Flow

CLI callers run the local ingest evidence entrypoint through
`packages/cli/src/index.ts`:

```powershell
node packages\cli\src\index.ts ingest evidence summary --input examples\ingest-search\audit-evidence.json
node packages\cli\src\index.ts ingest evidence export --input examples\ingest-search\audit-evidence.json --format jsonl
node packages\cli\src\index.ts ingest evidence export --input examples\ingest-search\audit-evidence.json --format csv
node packages\cli\src\index.ts ingest evidence package --input examples\ingest-search\audit-evidence.json
```

The CLI accepts only workspace-local `.json` evidence files. It rejects remote
URLs, parent-directory traversal, private workspace paths, malformed JSON, stale
summary counts, and broken fixture references with JSON-only stderr.

## API Flow

Local API callers post the evidence object to the ingest evidence routes:

```powershell
$body = Get-Content examples\ingest-search\audit-evidence.json -Raw
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:7317/v1/ingest/evidence/export -Body "{`"evidence`":$body,`"format`":`"json`"}" -ContentType 'application/json'
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:7317/v1/ingest/evidence/export -Body "{`"evidence`":$body,`"format`":`"manifest`"}" -ContentType 'application/json'
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:7317/v1/ingest/evidence/package -Body "{`"evidence`":$body}" -ContentType 'application/json'
```

The API wrappers are implemented in `apps/api/src/ingestEvidenceRoutes.ts`.
They do not read files or call the network; callers provide the evidence object
in the request body. Responses include deterministic fingerprints and redacted
content descriptors.

## SDK Flow

SDK callers use `packages/sdk-js/src/localIngestEvidence.ts`:

- `loadLocalIngestEvidence` parses JSON text or normalizes an object.
- `summarizeLocalIngestEvidence` computes source, citation, decision, and trace
  summaries.
- `detectLocalIngestEvidenceDrift` reports stale counts and missing references.
- `buildLocalIngestEvidenceExportPreview` builds a redacted preview with a
  manifest fingerprint.

Lower-level package callers use `packages/ingest-evidence/src/index.ts`:

- `normalizeIngestEvidence` creates immutable canonical records.
- `renderIngestEvidenceJsonl` renders JSONL content.
- `renderIngestEvidenceCsv` renders CSV content.
- `createIngestEvidencePackage` builds the package manifest, JSONL, CSV, and
  package fingerprint.

## Local-Only And No-Network Behavior

The export session is local-only:

- Evidence inputs are repository-relative files.
- Source identifiers use `fixture://ingest-search/`.
- API examples use `http://127.0.0.1:7317`.
- CLI examples read workspace-local fixture paths.
- Package and SDK helpers are pure local functions.
- No remote URLs, global installs, or hosted services are required.

## Redaction

Ingest evidence export normalizes and redacts before rendering JSONL, CSV,
manifest metadata, or package fingerprints:

- Sensitive-shaped keys and credential-shaped values are replaced with
  `[REDACTED]`.
- Session ids are redacted in canonical package records and manifests.
- Redaction applies before deterministic fingerprints are calculated.
- Raw request objects are not echoed in validation errors.

## Validation

Run the focused checks from the repository root:

```powershell
python -m json.tool examples\ingest-search\evidence-export-session.json
python -m unittest tests.test_ingest_evidence_export_docs
npm.cmd --workspace @sovereignops/ingest-evidence run check
npm.cmd --workspace @sovereignops/cli run check
npm.cmd --workspace @sovereignops/sdk-js run check
```

The Python test validates session shape, referenced files, local-only URLs and
paths, required commands, guarded wording, and consistency with
`examples/ingest-search/audit-evidence.json`.
