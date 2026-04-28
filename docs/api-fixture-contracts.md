# API Fixture Contract Checks

API fixture contract checks keep checked-in local fixture bundles aligned with
the routes, schemas, and replay tools that consume them. A fixture bundle is a
repository asset: it captures request and response examples that can be checked
without contacting a live service or writing durable records.

## Fixture Bundle Purpose

- Checked-in bundles document supported API request shapes with stable ids,
  methods, routes, expected statuses, request bodies, and response expectations.
- The same bundle should be usable by route tests, SDK fixture fetches, CLI
  replay, Web state helpers, and schema validators.
- Fixture data should stay small, deterministic, and repository-local so drift
  can be reviewed in code review instead of during live runs.

## Local Execution Expectations

- Contract checks must not make live network calls.
- Contract checks must not write durable application records.
- Fixture references must stay repository-relative or use approved local source
  schemes such as `fixture://`, `file://`, `stdin://`, `workspace://`, or
  `local://`.
- When a fixture has an `apiBase`, it must point to a loopback host only.
- Checks may read checked-in fixtures, generated schema files, docs, and
  OpenAPI files, then report pass/fail output.

## Route And OpenAPI Drift

- Every fixture route method and path must map to a documented route block in
  `docs/openapi.yaml`.
- Expected success statuses must appear in the matching OpenAPI response block;
  expected error statuses must appear explicitly or through a documented default.
- Path parameters are compared by route template, so a fixture path such as
  `/v1/example/items/item-123` can align with `/v1/example/items/{itemId}`.
- Response schema drift coverage starts with the OpenAPI response block and then
  checks each fixture expectation for status, content type, response
  `schemaVersion`, counts, ids, and stable error codes.
- Successful response checks also keep the OpenAPI component refs visible as
  `successResponseSchemaRefs` so response schema drift appears in the JSON
  report.
- Focused OpenAPI fixture helpers live in `scripts/openapi_fixture_contract.py`
  and are exercised by `tests/test_openapi_fixture_contract.py`.

## Schema Fixture Alignment

- Generated JSON schema fixtures in `packages/schemas/fixtures` are public
  compatibility artifacts and should not be hand-edited.
- Generated request bundle JSON schema fixtures validate the bundle envelope:
  `schemaVersion`, `generatedAt`, `apiBase`, `fixtureRefs`, `requests`, `route`,
  `request`, and `expect`.
- Generated response schema fixtures validate the complete response bodies for
  preview, record, list, comparison, and API error examples; fixture `expect`
  fields keep the matching response `schemaVersion` visible in replay bundles.
- Request body references in OpenAPI must point at the same component names used
  by the TypeScript validators that export the generated request schema fixtures.
- When a schema changes, update the TypeScript validator, regenerate schema
  fixtures, and update affected API fixture bundles in the same change.
- Alignment tests should cover route presence, request body references, response
  envelopes, local-only path rules, and redaction placeholders.

## Deterministic JSON Report

- `python scripts/fixture_drift.py --json` is the canonical JSON report for
  fixture drift checks.
- Successful reports use `kind`, `schemaVersion`, `totalFixtures`,
  `totalRequests`, `fixtures`, `routes`, `methods`, and `statuses`.
- Each fixture row uses `path`, `schemaVersion`, `apiBase`, `totalRequests`,
  `routes`, `methods`, and `statuses`; a fixture `kind` may appear when the
  bundle declares one.
- Each route row uses `method`, `path`, `totalRequests`, `fixtures`,
  `statuses`, and, for success responses, `successResponseSchemaRefs`.
- Error reports use `kind`, `schemaVersion`, `error.code`, and `error.message`.
- Report keys, route rows, fixture lists, method counters, and status counters
  are sorted so repeated local runs produce stable JSON.

## Command Entrypoints

Use the aggregate fixture drift entrypoints for routine checks:

```powershell
python scripts/fixture_drift.py --json
npm run fixtures:check
```

Use the CLI verifier when validating an API request bundle against OpenAPI:

```powershell
node packages\cli\src\index.ts ingest api verify --fixture examples\ingest-search\api-requests.json --openapi docs\openapi.yaml
```

## Review Checklist

- The fixture bundle is checked in, deterministic, and local-only.
- The bundle has no live network dependency and no durable write expectation.
- Fixture routes are represented in `docs/openapi.yaml`.
- Request and response bodies match the generated schema fixtures.
- Response expectations include status, content type, response schema version,
  counts, ids, and stable error code fields when those values are observable.
- Replay and verification commands are documented next to the affected surface.
