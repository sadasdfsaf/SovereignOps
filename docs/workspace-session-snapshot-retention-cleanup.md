# Workspace Session Snapshot Retention Cleanup

This guide documents the redacted dry-run cleanup fixture for workspace session
snapshots. The fixture is
`examples/workspace-session/snapshot-retention-cleanup.json`.

## Scope

- Cleanup planning is local-only and advisory.
- Every cleanup row keeps `dryRun: true`, `advisoryOnly: true`, and
  `applied: false`.
- Plans must report `durableWrites: false`; this flow must not delete, prune,
  archive, or mutate snapshots.
- Raw request bodies, local paths, secrets, session ids, root keys, and lock
  tokens are not retained.
- Display values use redacted refs before they enter the fixture or docs.

## Dry-Run Contract

`planLocalWorkspaceSessionSnapshotRetentionCleanup` accepts exactly one of
`entries`, `files`, or `records`, plus optional `maxCount`, `maxAgeMs`, `now`,
or `clock` policy fields.

Expected cleanup behavior:

- Return a `localWorkspaceSessionSnapshotRetentionCleanupPlan`.
- Keep `localOnly: true`, `dryRun: true`, and `durableWrites: false`.
- Emit advisory `keep`, `delete`, or `review` actions.
- Treat `delete` as a dry-run label for a later cleanup step, not as an applied
  operation.
- Route missing timestamps, duplicate snapshot refs, unsafe path material, raw
  lock tokens, and secret-shaped values to `review`.
- Keep all summary values redacted and audit-safe.

## SDK And Command Names

These names are the public contract for snapshot retention cleanup planning:

- SDK module: `packages/sdk-js/src/localWorkspaceSessionSnapshotRetention.ts`
- SDK schema version: `local-workspace-session-snapshot-retention/v1`
- SDK schema constant:
  `LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_SCHEMA_VERSION`
- SDK error class: `LocalWorkspaceSessionSnapshotRetentionError`
- SDK input type: `LocalWorkspaceSessionSnapshotRetentionCleanupInput`
- SDK plan type: `LocalWorkspaceSessionSnapshotRetentionCleanupPlan`
- SDK action type: `LocalWorkspaceSessionSnapshotRetentionCleanupAction`
- SDK summary type: `LocalWorkspaceSessionSnapshotRetentionCleanupSummary`
- SDK issue type: `LocalWorkspaceSessionSnapshotRetentionCleanupIssue`
- SDK helpers:
  `planLocalWorkspaceSessionSnapshotRetentionCleanup`,
  `planFileBackedLocalWorkspaceSessionSnapshotRetentionCleanup`, and
  `planSnapshotRetentionCleanupDryRun`
- SDK helper call placeholders:
  `planLocalWorkspaceSessionSnapshotRetentionCleanup(<input>)`,
  `planFileBackedLocalWorkspaceSessionSnapshotRetentionCleanup(<input>)`, and
  `planSnapshotRetentionCleanupDryRun(<input>)`
- Plan row kinds:
  `localWorkspaceSessionSnapshotRetentionCleanupAction`,
  `localWorkspaceSessionSnapshotRetentionCleanupSummary`, and
  `localWorkspaceSessionSnapshotRetentionCleanupIssue`
- CLI preview commands:
  `sovereignops workspace-session snapshot retention-cleanup preview --fixture <path>`
  and
  `sovereignops workspace-session-snapshot-retention-cleanup preview --fixture <path>`
- API route:
  `POST /v1/workspace-session/snapshot-retention-cleanup/preview`
- Web state module:
  `apps/web/src/workspaceSessionSnapshotRetentionCleanupState.ts`

The cleanup fixture documents the SDK dry-run plan shape. CLI, API, and Web
integrations use the same local-only dry-run plan contract.

## Round 44 Release Handoff

The Round 44 release gate also tracks the parent SDK API client, schema
fixtures, and API replay artifacts that exercise this cleanup contract end to
end:

- SDK API client module:
  `packages/sdk-js/src/localWorkspaceSessionSnapshotRetentionCleanupApiClient.ts`
- SDK API client test:
  `packages/sdk-js/tests/local-workspace-session-snapshot-retention-cleanup-api-client.test.mjs`
- SDK API client security test:
  `tests/security/workspace_session_snapshot_retention_cleanup_api_client_threats.test.mjs`
- API replay fixture:
  `examples/workspace-session/snapshot-retention-cleanup-api-requests.json`
- API replay CLI module:
  `packages/cli/src/workspaceSessionSnapshotRetentionCleanupApiReplay.ts`
- API replay CLI test:
  `packages/cli/tests/workspace-session-snapshot-retention-cleanup-api-replay.test.mjs`
- Schema source:
  `packages/schemas/src/workspaceSessionSnapshotRetentionCleanup.ts`
- Schema test:
  `packages/schemas/tests/workspace-session-snapshot-retention-cleanup.test.mjs`
- Schema fixtures:
  `packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-request.valid.json`,
  `packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-request.invalid.json`,
  `packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-request.schema.json`,
  `packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-response.valid.json`,
  `packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-response.invalid.json`,
  and
  `packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-response.schema.json`
- E2E replay test:
  `tests/test_workspace_session_snapshot_retention_cleanup_e2e.py`

The SDK API client is expected to call
`POST /v1/workspace-session/snapshot-retention-cleanup/preview` and preserve the
same dry-run response shape as the fixture. The schema fixtures are expected to
describe the same cleanup plan contract without adding raw body, raw path, raw
token, session id, or root key retention. The API replay fixture is expected to
exercise the local preview route without network access. The E2E replay is
expected to use the checked-in cleanup fixture across SDK, API, CLI, and Web
state surfaces.

## Inventory Preview

The retention cleanup inventory preview is the Round 45 handoff for collecting
cleanup candidates before a dry-run cleanup plan is built. It is local-only and
preview-only:

- It returns inventory rows and advisory counts only.
- It must keep `localOnly: true`, `dryRun: true`, and `durableWrites: false`.
- It must not perform durable writes, deletes, archive steps, path unlinking, or
  snapshot mutation.
- It must not retain raw paths, secrets, tokens, session ids, root keys, lock
  tokens, or request bodies.
- It must return redacted refs such as `fileRef` and must not echo local file
  inventory values that were rejected during validation.
- It must route unsafe path material, secret-shaped values, token-shaped values,
  and request-body retention attempts to review issues without echoing the raw
  value.

The expected inventory preview names are:

- Inventory fixture:
  `examples/workspace-session/snapshot-retention-cleanup-inventory.json`
- SDK planner module:
  `packages/sdk-js/src/localWorkspaceSessionSnapshotRetention.ts`
- SDK planner helper:
  `planFileBackedLocalWorkspaceSessionSnapshotRetentionCleanup`
- API route:
  `POST /v1/workspace-session/snapshot-retention-cleanup/inventory/preview`
- API route module:
  `apps/api/src/workspaceSessionSnapshotRetentionCleanupInventoryRoutes.ts`
- API route test:
  `apps/api/tests/workspace-session-snapshot-retention-cleanup-inventory-routes.test.mjs`
- API route helpers:
  `createWorkspaceSessionSnapshotRetentionCleanupInventoryPreview` and
  `createWorkspaceSessionSnapshotRetentionCleanupInventoryRoutes`
- OpenAPI request schema:
  `WorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest`
- OpenAPI response schema:
  `WorkspaceSessionSnapshotRetentionCleanupPreviewResponse`
- CLI module:
  `packages/cli/src/workspaceSessionSnapshotRetentionCleanupInventory.ts`
- CLI test:
  `packages/cli/tests/workspace-session-snapshot-retention-cleanup-inventory.test.mjs`
- CLI helpers:
  `runWorkspaceSessionSnapshotRetentionCleanupInventoryCli`,
  `loadWorkspaceSessionSnapshotRetentionCleanupInventoryInput`, and
  `isWorkspaceSessionSnapshotRetentionCleanupInventoryCommand`
- CLI preview commands:
  `sovereignops workspace-session snapshot retention-cleanup inventory --fixture <path>`
  and
  `sovereignops workspace-session-snapshot-retention-cleanup inventory --fixture <path>`
- Web state module:
  `apps/web/src/workspaceSessionSnapshotRetentionCleanupInventoryState.ts`
- Web state test:
  `apps/web/tests/workspace-session-snapshot-retention-cleanup-inventory-state.test.mjs`
- Web state builder:
  `buildWorkspaceSessionSnapshotRetentionCleanupInventoryState`
- Security test:
  `tests/security/workspace_session_snapshot_retention_cleanup_inventory_threats.test.mjs`

The OpenAPI contract is body-only JSON. It has no path parameters, no query
parameters, JSON success content, and Error response refs for `400` and default
failures. Its schemas are cleanup-safe: they allow only bounded relative
inventory paths, forbid unknown fields, reuse the local dry-run cleanup plan
response, and omit raw secret, token, request-body, write, and delete fields.

## Fixture

`examples/workspace-session/snapshot-retention-cleanup.json` contains:

- `input.records`, a redacted set of snapshot summaries.
- `cleanupPlan`, a dry-run plan with advisory action rows.
- `commandContracts`, the SDK helper calls and CLI/API/Web integration names.
- `validationCommands`, the focused JSON and Python checks.

The fixture uses schema version `local-workspace-session-snapshot-retention/v1`
and kind `workspace-session.snapshot-retention-cleanup.dry-run`.

## Validation Commands

Run the focused checks from the repository root:

```powershell
python -m json.tool examples\workspace-session\snapshot-retention-cleanup.json
python -m unittest tests.test_workspace_session_snapshot_retention_cleanup_docs
python -m unittest tests.test_workspace_session_snapshot_retention_cleanup_alignment
python -m unittest tests.test_validate_openapi_workspace_session_snapshot_retention_cleanup
node --test tests/security/workspace_session_snapshot_retention_cleanup_inventory_threats.test.mjs
python scripts\validate_openapi.py docs\openapi.yaml
```
