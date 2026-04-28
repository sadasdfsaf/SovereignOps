# MCP Approval Evidence Records API

## Scope

This document covers the local-first API, SDK, CLI fixture, schema, gateway, and Web review surface for storing redacted MCP approval evidence records. The record surface turns a preview response into a stable local baseline that can be listed, retrieved, and compared without sending workspace data to a remote service.

## Public Files

- `docs/mcp-approval-evidence-records-api.md`
- `tests/test_mcp_approval_evidence_records_api_docs.py`
- `tests/test_mcp_approval_evidence_records_api_alignment.py`
- `services/mcp-gateway/src/approvalEvidenceRecords.ts`
- `services/mcp-gateway/tests/approval-evidence-records.test.mjs`
- `apps/api/src/mcpApprovalEvidenceRecordRoutes.ts`
- `apps/api/tests/mcp-approval-evidence-record-routes.test.mjs`
- `packages/sdk-js/src/mcpApprovalEvidenceRecordClient.ts`
- `packages/sdk-js/tests/client-mcp-approval-evidence-record.test.mjs`
- `packages/cli/src/mcpApprovalEvidenceRecordsReplay.ts`
- `packages/cli/tests/mcp-approval-evidence-records-replay.test.mjs`
- `examples/mcp/approval-evidence-records-requests.json`
- `packages/schemas/src/mcpApprovalEvidenceRecord.ts`
- `packages/schemas/tests/mcp-approval-evidence-record.test.mjs`
- `packages/schemas/fixtures/mcp-approval-evidence-record.valid.json`
- `packages/schemas/fixtures/mcp-approval-evidence-record.invalid.json`
- `packages/schemas/fixtures/mcp-approval-evidence-record.schema.json`
- `packages/schemas/fixtures/mcp-approval-evidence-record-list.valid.json`
- `packages/schemas/fixtures/mcp-approval-evidence-record-list.schema.json`
- `packages/schemas/fixtures/mcp-approval-evidence-record-comparison.valid.json`
- `packages/schemas/fixtures/mcp-approval-evidence-record-comparison.schema.json`
- `packages/schemas/fixtures/mcp-approval-evidence-record-create-request.valid.json`
- `packages/schemas/fixtures/mcp-approval-evidence-record-create-request.schema.json`
- `packages/schemas/fixtures/mcp-approval-evidence-records-requests.valid.json`
- `packages/schemas/fixtures/mcp-approval-evidence-records-requests.invalid.json`
- `packages/schemas/fixtures/mcp-approval-evidence-records-requests.schema.json`
- `apps/web/src/mcpApprovalEvidenceRecordState.ts`
- `apps/web/tests/mcp-approval-evidence-record-state.test.mjs`
- `docs/openapi.yaml`
- `scripts/release_check.py`
- `scripts/repo_health.py`

## API Routes

- `POST /v1/mcp/approval-evidence/records` stores a redacted local approval evidence record from preview output.
- `GET /v1/mcp/approval-evidence/records` lists stored local records with summary counts and filters.
- `GET /v1/mcp/approval-evidence/records/{recordId}` retrieves one stored local record.
- `POST /v1/mcp/approval-evidence/records/{recordId}/compare` compares fresh preview evidence against a stored baseline and reports drift.

The OpenAPI operation ids are `createMcpApprovalEvidenceRecord`, `listMcpApprovalEvidenceRecords`, `getMcpApprovalEvidenceRecord`, and `compareMcpApprovalEvidenceRecord`.

## Gateway Records

`createApprovalEvidenceRecord` creates immutable local records from redacted preview data. `createApprovalEvidenceRecordStore` keeps gateway records in memory. `compareApprovalEvidencePreviewToRecord` reports changed fingerprints, missing evidence, new evidence, and status drift so a reviewer can decide whether a baseline still represents the current approval trail. API route tests use `createInMemoryMcpApprovalEvidenceRecordStore` to exercise route state without filesystem or network storage.

## SDK Client

`McpApprovalEvidenceRecordClient` and `createMcpApprovalEvidenceRecordClient` expose typed `create`, `list`, `get`, and `compare` methods. The client uses the `mcp/approval-evidence/records` endpoint family and keeps response validation strict: records must be local-only, redacted, and fingerprinted.

## CLI Fixture

`runMcpApprovalEvidenceRecordsReplayCli` replays local fixture requests from `examples/mcp/approval-evidence-records-requests.json`. The fixture covers create, list, get, and compare calls using local request data only, with `[REDACTED]` values for any sensitive-looking field.

## Schema Fixtures

`MCP_APPROVAL_EVIDENCE_RECORD_SCHEMA_VERSION`, `mcpApprovalEvidenceRecordSchema`, `mcpApprovalEvidenceRecordSchemaDefinitions`, `validateMcpApprovalEvidenceRecord`, and `assertMcpApprovalEvidenceRecord` define the persisted record contract. Valid fixtures must include local-only status, redaction status, source preview fingerprint, record fingerprint, created timestamp, and evidence references.

## Request Bundle Schema

`packages/schemas/src/mcpApprovalEvidenceRecord.ts` also exposes the shared
records request bundle contract for API, SDK, CLI, gateway, and Web parity:

- `MCP_APPROVAL_EVIDENCE_RECORD_API_REQUESTS_SCHEMA_VERSION`
- `mcpApprovalEvidenceRecordApiRequestsSchema`
- `mcpApprovalEvidenceRecordSchemaDefinitions`
- `mcpApprovalEvidenceRecordValidators`
- `validateMcpApprovalEvidenceRecordObject`
- `assertMcpApprovalEvidenceRecordObject`
- `validateMcpApprovalEvidenceRecordApiRequestBundle`
- `assertMcpApprovalEvidenceRecordApiRequestBundle`

The public request bundle fixtures are:

- `packages/schemas/fixtures/mcp-approval-evidence-records-requests.valid.json`
- `packages/schemas/fixtures/mcp-approval-evidence-records-requests.invalid.json`
- `packages/schemas/fixtures/mcp-approval-evidence-records-requests.schema.json`

The bundle schema validates the checked-in records replay fixture before create,
list, get, and compare requests are consumed by API route tests, SDK fake-fetch
tests, CLI replay, gateway record checks, and Web state builders. It locks
request ids, the `/v1/mcp/approval-evidence/records` endpoint family, local
`apiBase` values, repo-relative fixture references, JSON-only request bodies,
and expected redacted record/comparison response fields.

## Web Helper

`buildMcpApprovalEvidenceRecordState` converts create, list, get, and compare API output into pure view state. It highlights empty record stores, stale baselines, fingerprint drift, missing evidence references, redaction status, and next actions without depending on browser APIs.

## Release Wiring

The release check includes `mcp-approval-evidence-records-api-alignment` so API
routes, docs, schemas, shared request bundle validators, generated request
bundle JSON schema fixtures, SDK, CLI, Web helpers, examples, and health checks
stay linked. The repository health script tracks the public files listed above.

## Guardrails

- Records stay local-only and redacted.
- Request bundles keep `apiBase` on `local://` endpoints and fixture references
  repo-relative.
- Record ids and fingerprints are deterministic for the same normalized evidence payload.
- The store rejects duplicate ids unless the caller explicitly uses a comparison workflow.
- Missing redaction metadata is a validation error.
- Fixture paths stay inside the workspace and never reference private planning files.
- Store redacted values as `[REDACTED]`.
- Reject raw credentials, unredacted secret-shaped values, absolute paths, and
  live service URLs in request bundle fixtures.

## Validation

- `python -m unittest tests.test_mcp_approval_evidence_records_api_docs`
- `python -m unittest tests.test_mcp_approval_evidence_records_api_alignment`
- `python -m json.tool examples\mcp\approval-evidence-records-requests.json`
- `python -m json.tool packages\schemas\fixtures\mcp-approval-evidence-record.valid.json`
- `python -m json.tool packages\schemas\fixtures\mcp-approval-evidence-record.invalid.json`
- `python -m json.tool packages\schemas\fixtures\mcp-approval-evidence-record.schema.json`
- `python -m json.tool packages\schemas\fixtures\mcp-approval-evidence-records-requests.valid.json`
- `python -m json.tool packages\schemas\fixtures\mcp-approval-evidence-records-requests.invalid.json`
- `python -m json.tool packages\schemas\fixtures\mcp-approval-evidence-records-requests.schema.json`
