# Ingest/Search API

This contract describes the local JSON API shape for ingest and search callers.
The examples are generated fixtures only, use local source URIs, and contain no
private plan content.

## Scope

- The API is local-first: callers send text, local fixture references, or paths
  under an allowed workspace root.
- Ingest input remains data. New documents default to `trusted: false` and
  response records keep `untrusted: true` until a caller marks a source as
  trusted.
- Search responses cite local source ranges instead of copying extra source
  text into logs or metadata.
- Source URIs for ingest content must be local metadata such as `fixture://`,
  `file://`, `stdin://`, `workspace://`, or `local://`; `http://` and
  `https://` source URIs are rejected.

## Routes

| Route | Purpose |
| --- | --- |
| `POST /v1/ingest/normalize` | Normalize caller-supplied text and return its checksum. |
| `POST /v1/ingest/structured` | Parse Markdown, JSON, or CSV into cited documents and validation results. |
| `POST /v1/ingest/repository/scan` | Scan allowed local paths and return source records with checksums. |
| `POST /v1/search/query` | Search the local index with optional media, source, and tag filters. |
| `POST /v1/quarantine/cases` | Build review cases from held ingest findings. |
| `POST /v1/quarantine/cases/:caseId/decision` | Record a terminal review decision for one case. |

## Request Envelope

Route bodies are JSON objects. Common fields are:

- `workspaceId`: local workspace identifier.
- `sourceUri`: stable source identifier used by citations and index records.
- `mediaType`: input type such as `text/markdown`, `text/csv`, or
  `application/json`.
- `content`: caller-supplied UTF-8 text for direct ingest.
- `localPath`: workspace-relative path for repository scans.
- `options`: route-specific controls such as `trusted`, `requiredColumns`,
  `uniqueColumns`, `includePaths`, and `maxTextBytes`.

Validation errors use the same envelope as other local routes:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "sourceUri must be local metadata",
    "details": {
      "path": "body.sourceUri"
    }
  }
}
```

## Response Envelope

Successful responses include `ok: true` and route-specific data. Search and
ingest responses preserve:

- `checksum`: SHA-256 checksum for the source or normalized content.
- `citations`: source ranges with `trusted: false` unless explicitly trusted.
- `untrusted`: true for data imported from local input.
- `quarantineState`: `clear` for searchable documents and `open` for held
  items.

## Allowed Local-First Workflows

- Normalize text from stdin or an in-memory editor buffer before indexing.
- Parse Markdown, JSON, and CSV supplied in the request body.
- Scan only explicitly allowed local paths under the selected workspace root.
- Query a local index built from checked source records.
- Hold questionable rows or findings outside the search index until local
  review accepts or rejects them.

## Request And Response Examples

Full examples live in `examples/ingest-search/api-requests.json`.

```json
{
  "route": {
    "method": "POST",
    "path": "/v1/search/query"
  },
  "request": {
    "body": {
      "workspaceId": "wsp_ingest_demo",
      "query": "checksum",
      "filters": {
        "mediaTypes": ["application/json"],
        "sourceUris": ["fixture://ingest-search/records.json"]
      },
      "limit": 5
    }
  },
  "response": {
    "status": 200,
    "body": {
      "ok": true,
      "results": [
        {
          "id": "idx_json_beta",
          "score": 1,
          "sourceUri": "fixture://ingest-search/records.json",
          "title": "Checksum recap",
          "snippet": "Checksums detect repeated source content before indexing.",
          "quarantineState": "clear"
        }
      ]
    }
  }
}
```

## Quarantine Review

Quarantine cases are local review records. An open case is not searchable. The
case carries reason codes, citation snapshots, redacted preview text, and the
allowed actions for the current state.

Review decisions are terminal:

- `release` moves a case to `released` and allows the cited source range to be
  re-indexed by the caller.
- `reject` moves a case to `rejected` and keeps the cited source range out of
  the index.
- High-severity release requires an explicit `override: true`.
- Each decision records `actorId`, `reason`, `timestamp`, `fromState`, and
  `toState`.

## Validation Commands

Run these from the repository root:

```powershell
python -m json.tool examples\ingest-search\api-requests.json
python -m unittest tests.test_ingest_api_docs
python -m unittest tests.test_ingest_search_docs
python -m unittest discover -s services\ingest\tests
```
