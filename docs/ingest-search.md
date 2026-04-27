# Ingest And Search

This guide describes the local-first ingest and search fixture workflow. The
current implementation is dependency-free Python in
`services/ingest/src/sovereignops_ingest`, with sample records in
`examples/ingest-search`.

## Local-Only Operation

Ingest/search work is a local-only operation. The examples use files under
`examples/ingest-search`, `fixture://` source URIs, and deterministic checks
that do not need remote services, remote accounts, or network access.

The workflow keeps imported content as data. Untrusted input handling is the
default: connector output carries `trusted: false`, search index records keep
`untrusted: true`, and quarantine records hold rows outside the index until a
local review accepts them.

## Repository Store

`examples/ingest-search/repository.json` is the fixture repository for sources.
Each source record has:

- `sourceUri`: stable local URI used by citations and index records.
- `path`: repository-relative file path.
- `mediaType`: one of `text/markdown`, `text/csv`, or `application/json`.
- `checksum`: SHA-256 digest of the source file bytes.
- `state`: import state such as `indexed` or `partly_quarantined`.

The repository file is intentionally small so tests can recompute checksums
with the Python standard library and compare them to checked-in fixture values.

## Log Workflow

`examples/ingest-search/ingest-log.json` models the durable ingest log. Each
entry records the source URI, action, timestamp, checksum, indexed count, and
quarantine count. A real store can append these records after a local import
run, while tests can replay the fixture log to verify that every indexed or
held source is accounted for.

The log should never contain raw credentials, local machine paths, or private
workspace text that is not already present in the selected source fixture.

## Markdown, JSON, And CSV Sources

The structured connectors preserve source shape:

- Markdown: `import_markdown` emits sections with heading metadata and line
  citations.
- JSON: `import_json` emits deterministic leaf documents with JSON path
  citations.
- CSV: `import_csv` emits row documents with column metadata, required-value
  checks, duplicate checks, and row or cell citations.

The safe sample inputs are:

- `examples/ingest-search/notes.md`
- `examples/ingest-search/records.json`
- `examples/ingest-search/records.csv`

## Search Index

`examples/ingest-search/search-index.json` is the derived index fixture. It
stores one record per searchable chunk:

- `id`: stable index document identifier.
- `sourceUri`: source fixture URI.
- `mediaType`: original input type.
- `checksum`: source checksum copied from the repository record.
- `title` and `body`: normalized searchable text.
- `citations`: citation list for traceability.
- `untrusted`: true until a caller explicitly marks the source as trusted.
- `quarantineState`: `clear` for searchable documents.

Index documents must stay reproducible from source content. If a source changes,
update the checksum and any affected citation ranges in the same review.

## Citations

Citations are the join between search results and source data. The Python
models in `citation.py` support:

- Markdown line ranges such as `start_line: 1` and `end_line: 4`.
- JSON paths such as `$.items[1].summary`.
- CSV rows and cells such as `row: 2` with `column: "title"`.

Search answers should cite these ranges instead of copying extra source text
into logs or metadata. This keeps results compact and auditable.

## Quarantine

`examples/ingest-search/quarantine.json` holds source ranges that should not be
made searchable yet. A quarantine item includes the source URI, checksum,
reason code, citation, and `untrusted: true`.

Quarantine is for local follow-up only. The held row remains available for a
local reviewer, but the derived search index excludes it until the source range
is accepted or corrected.

## CLI Workflows

The local ingest CLI reads files or stdin and emits JSON only. These examples
run from the repository root:

```powershell
python -m services.ingest.src.sovereignops_ingest.cli parse-markdown examples\ingest-search\notes.md --source-uri fixture://ingest-search/notes.md
python -m services.ingest.src.sovereignops_ingest.cli parse-csv examples\ingest-search\records.csv --source-uri fixture://ingest-search/records.csv --require-column id --require-column title
python -m services.ingest.src.sovereignops_ingest.cli checksum examples\ingest-search\records.json --source-uri fixture://ingest-search/records.json
```

Use the Python checks for fixture and connector validation:

```powershell
python -m unittest tests.test_ingest_search_docs
python -m unittest discover -s services\ingest\tests
python scripts\repo_health.py --json
```

## Validation Rules

The docs and fixture tests assert that:

- local-first and local-only operation are documented.
- untrusted input handling is documented.
- citations and checksums are documented and present in fixtures.
- quarantine behavior is documented and present in fixtures.
- repository source checksums match fixture file bytes.
- index and quarantine citations point to existing source ranges.
