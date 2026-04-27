# Ingest Audit Evidence

This guide describes the local-first evidence bundle for an ingest/search run.
The sample evidence lives in `examples/ingest-search/audit-evidence.json` and
ties source checksums, citations, quarantine decisions, API requests, and
client/session traces back to the checked-in ingest/search fixtures.

## Evidence Fixture

`examples/ingest-search/audit-evidence.json` is a compact audit evidence
fixture for the demo workspace. It references only files under
`examples/ingest-search`:

- `examples/ingest-search/repository.json`
- `examples/ingest-search/ingest-log.json`
- `examples/ingest-search/search-index.json`
- `examples/ingest-search/quarantine.json`
- `examples/ingest-search/api-requests.json`
- `examples/ingest-search/client-session.json`
- `examples/ingest-search/notes.md`
- `examples/ingest-search/records.csv`
- `examples/ingest-search/records.json`

The top-level record includes `workspaceId`, `sessionId`, `localOnly`, and an
`evidenceSummary` so tests can compare counts with the detailed arrays.

## Source Checksums

Each `sourceSnapshots` entry joins one source URI to:

- the repository path and media type from `repository.json`.
- the SHA-256 checksum recorded by the repository.
- ingest log entries that imported the source.
- derived search index document IDs.
- quarantine item IDs, when a source range is held outside the index.

Each `evidenceFiles` entry records the SHA-256 checksum of an existing fixture
file. These file checksums cover both source inputs and derived JSON fixtures,
so a local reviewer can detect fixture drift before comparing search results.

## Citations

`citationEvidence` records the source range used by each indexed result or held
item. Citation ranges keep the audit compact:

- Markdown ranges use `start_line` and `end_line`.
- CSV ranges use `row` and `column`.
- JSON ranges use a JSON path such as `$.items[1].summary`.

The citation carries `trusted: false` because fixture content remains
untrusted input until the local session explicitly accepts it.

## Quarantine Decisions

`quarantineDecisions` captures the reviewed item, request ID, actor, action,
reason, timestamp, and state change for the local decision sample. The fixture
links the decision to `api_quarantine_decision` in
`examples/ingest-search/api-requests.json` and to `qtn_csv_beta_status` in
`examples/ingest-search/quarantine.json`.

## Client And Session Traces

`apiRequestTrace` records the API request IDs, routes, response status values,
source URIs, and checksums used during the run. The request IDs resolve to
`examples/ingest-search/api-requests.json`.

`clientSessionTrace` connects the same run to the client fixture at
`examples/ingest-search/client-session.json`. Trace entries point to API
routes or CLI commands that already exist in the client session fixture, plus
related request IDs and affected source, index, or quarantine IDs.

## Validation

Run the focused validation from the repository root:

```powershell
python -m json.tool examples\ingest-search\audit-evidence.json
python -m unittest tests.test_ingest_audit_evidence_docs
```

The test checks that:

- fixture paths stay inside `examples/ingest-search`.
- file checksums match current fixture bytes.
- source URI checksums match `repository.json`.
- log, index, citation, and quarantine references resolve.
- API request IDs and client/session traces resolve to the existing fixtures.
- the doc and fixture avoid restricted public-content terms.
