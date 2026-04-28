# MCP Approval Evidence API

## Scope

This page documents the local-first API, SDK, CLI fixture, schema, gateway, and Web review surface for MCP approval evidence previews. The preview turns an approval session snapshot, policy result, and audit event references into a redacted evidence object that can be reviewed before any agent action is executed.

The route is intentionally local-only and side-effect free. It accepts caller-provided snapshots, does not read files, does not call a network service, and does not persist the preview.

## Public Files

- `docs/mcp-approval-evidence-api.md`
- `tests/test_mcp_approval_evidence_api_docs.py`
- `tests/test_mcp_approval_evidence_api_alignment.py`
- `tests/test_validate_openapi_mcp_approval_evidence_api_fixture.py`
- `tests/test_openapi_fixture_contract.py`
- `services/mcp-gateway/src/approvalEvidence.ts`
- `services/mcp-gateway/tests/approval-evidence.test.mjs`
- `apps/api/src/mcpApprovalEvidenceRoutes.ts`
- `apps/api/tests/mcp-approval-evidence-routes.test.mjs`
- `packages/sdk-js/src/mcpApprovalEvidenceClient.ts`
- `packages/sdk-js/tests/client-mcp-approval-evidence.test.mjs`
- `packages/cli/src/mcpApprovalEvidenceReplay.ts`
- `packages/cli/tests/mcp-approval-evidence-replay.test.mjs`
- `examples/mcp/approval-evidence-preview-requests.json`
- `packages/schemas/src/mcpApprovalEvidence.ts`
- `packages/schemas/tests/mcp-approval-evidence.test.mjs`
- `packages/schemas/fixtures/mcp-approval-evidence.valid.json`
- `packages/schemas/fixtures/mcp-approval-evidence.invalid.json`
- `packages/schemas/fixtures/mcp-approval-evidence.schema.json`
- `packages/schemas/fixtures/mcp-approval-evidence-preview-requests.valid.json`
- `packages/schemas/fixtures/mcp-approval-evidence-preview-requests.invalid.json`
- `packages/schemas/fixtures/mcp-approval-evidence-preview-requests.schema.json`
- `apps/web/src/mcpApprovalEvidenceApiState.ts`
- `apps/web/tests/mcp-approval-evidence-api-state.test.mjs`
- `docs/openapi.yaml`
- `scripts/openapi_fixture_contract.py`
- `scripts/release_check.py`
- `scripts/repo_health.py`

## API Route

`POST /v1/mcp/approval-evidence/preview` accepts a JSON body with:

- `session`: approval session id, status, requested action, target resource, actor refs, expiry, and metadata.
- `policy`: decision, reason, matched rule ids, and any approval requirement details.
- `auditEvents`: redacted references to gateway audit records that explain request, approval, denial, expiry, or execution state.
- `generatedAt`: optional caller timestamp for deterministic tests.

The API operation id is `previewMcpApprovalEvidence`. The implementation exposes `createMcpApprovalEvidenceRoutes` and `mountMcpApprovalEvidenceRoutes`.

## Gateway Builder

`buildMcpApprovalEvidence` produces a deterministic evidence record from local snapshots. It sorts audit refs and rule refs, classifies expiry, and records whether the action is `approved`, `approval_required`, `denied`, or `expired`.

`redactMcpApprovalEvidenceMetadata` preserves object shape while replacing secret-shaped values with `[REDACTED]`. Redaction applies to keys such as `token`, `secret`, `password`, `apiKey`, `authorization`, `credential`, and nested metadata values.

## SDK Client

`McpApprovalEvidenceClient` and `createMcpApprovalEvidenceClient` target the endpoint `mcp/approval-evidence/preview`. The client supports fake-fetch tests, typed success parsing, API error payloads, invalid JSON, invalid response shape, and fetch failures.

## CLI Fixture

`runMcpApprovalEvidenceReplayCli` replays local fixture requests from `examples/mcp/approval-evidence-preview-requests.json`. Fixtures stay repo-relative and JSON-only so they can run in release checks without starting a server.

The replay command rejects directories, missing files, malformed JSON, private workspace paths, plan-pack paths, and wrong endpoint paths before dispatching.

## Schema Fixtures

`MCP_APPROVAL_EVIDENCE_SCHEMA_VERSION` identifies the shared schema. The schema module exports `mcpApprovalEvidenceSchema`, `mcpApprovalEvidenceSchemaDefinition`, `validateMcpApprovalEvidence`, and `assertMcpApprovalEvidence`.

The valid fixture encodes a redacted local approval preview. The invalid fixture intentionally includes malformed status and unsafe metadata fields so tests verify rejection.

## Request Bundle Schema

`packages/schemas/src/mcpApprovalEvidence.ts` also exposes the shared preview
request bundle contract for API, SDK, CLI, gateway, and Web parity:

- `MCP_APPROVAL_EVIDENCE_PREVIEW_REQUESTS_SCHEMA_VERSION`
- `mcpApprovalEvidencePreviewRequestsSchema`
- `mcpApprovalEvidenceSchemaDefinitions`
- `mcpApprovalEvidenceValidators`
- `validateMcpApprovalEvidenceObject`
- `assertMcpApprovalEvidenceObject`
- `validateMcpApprovalEvidencePreviewRequestBundle`
- `assertMcpApprovalEvidencePreviewRequestBundle`

The public request bundle fixtures are:

- `packages/schemas/fixtures/mcp-approval-evidence-preview-requests.valid.json`
- `packages/schemas/fixtures/mcp-approval-evidence-preview-requests.invalid.json`
- `packages/schemas/fixtures/mcp-approval-evidence-preview-requests.schema.json`

The bundle schema validates the checked-in preview replay fixture before API
route tests, SDK fake-fetch tests, CLI replay, gateway preview checks, and Web
state builders consume it. It locks request ids,
`POST /v1/mcp/approval-evidence/preview`, local `apiBase` values,
repo-relative fixture references, JSON-only request bodies, and expected
redacted preview response fields.

## Web Helper

`buildMcpApprovalEvidenceApiState` converts preview responses into deterministic review state: summary cards, status rows, audit reference rows, redaction warning rows, and action buttons. It handles loading, success, error, empty audit refs, approval-required, denied, approved, and expired states.

## OpenAPI Fixture Drift

`tests/test_validate_openapi_mcp_approval_evidence_api_fixture.py` uses
`scripts/openapi_fixture_contract.py` and
`tests/test_openapi_fixture_contract.py` to check that
`examples/mcp/approval-evidence-preview-requests.json` still maps to the
documented `POST /v1/mcp/approval-evidence/preview` OpenAPI block. The drift
check locks the expected response status, `mcp` tag, request body schema
reference, local `apiBase`, and fixture safety rules before API route tests, SDK
fake-fetch tests, CLI replay, gateway preview checks, and Web state builders
consume the fixture.

## Release Wiring

The release check includes `mcp-approval-evidence-api-alignment` so the API
route, OpenAPI contract, SDK client, CLI replay fixture, schema fixtures, shared
request bundle validators, generated request bundle JSON schema fixtures,
OpenAPI fixture drift checks, Web state helper, docs, and focused tests stay
connected. It runs
`tests.test_validate_openapi_mcp_approval_evidence_api_fixture` and
`tests.test_openapi_fixture_contract` with the alignment check.

## Guardrails

- Keep all evidence local-only and proposal-only until a separate approval path executes an action.
- Keep preview request bundle `apiBase` values on `local://` endpoints and
  fixture references repo-relative.
- Keep audit references as ids, labels, and deterministic fingerprints; do not embed raw audit payloads unless already redacted.
- Keep route handlers pure: no file reads, no network calls, no background execution.
- Keep fixture paths repo-relative and avoid absolute user paths.
- Preserve `[REDACTED]` placeholders instead of deleting sensitive fields, so reviewers can see what was removed.
- Reject raw credentials, unredacted secret-shaped values, private paths, and
  live service URLs in request bundle fixtures.

## Validation

Run focused checks:

```powershell
python -m unittest tests.test_mcp_approval_evidence_api_docs
python -m unittest tests.test_mcp_approval_evidence_api_alignment
python -m unittest tests.test_validate_openapi_mcp_approval_evidence_api_fixture tests.test_openapi_fixture_contract
python -m json.tool examples\mcp\approval-evidence-preview-requests.json
python -m json.tool packages\schemas\fixtures\mcp-approval-evidence.valid.json
python -m json.tool packages\schemas\fixtures\mcp-approval-evidence.invalid.json
python -m json.tool packages\schemas\fixtures\mcp-approval-evidence.schema.json
python -m json.tool packages\schemas\fixtures\mcp-approval-evidence-preview-requests.valid.json
python -m json.tool packages\schemas\fixtures\mcp-approval-evidence-preview-requests.invalid.json
python -m json.tool packages\schemas\fixtures\mcp-approval-evidence-preview-requests.schema.json
```
