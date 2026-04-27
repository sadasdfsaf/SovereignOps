# Workspace Session Snapshot Review

This guide documents the local snapshot review fixture used to compare two
workspace session snapshots and preview retention decisions. The fixture is
`examples/workspace-session/snapshot-review.json`.

## Scope

- Snapshot review is local-only and compares caller-supplied redacted snapshot
  summaries in memory.
- The compare workflow reports baseline-to-candidate drift without opening a
  network socket or writing review output to storage.
- The retention workflow returns preview records only. It is a dry-run flow and
  must not delete, prune, archive, or mutate snapshots.
- No raw request body retention: raw request bodies are not retained.
  Implementations should keep only
  normalized comparison fields, redaction metadata, and retention preview
  summaries.
- Paths, tokens, session ids, and root keys are redacted before any comparison
  result or retention preview record is displayed or stored.

## Local Compare Workflow

`POST /v1/workspace-session/snapshot-review/compare` accepts a baseline
snapshot summary and a candidate snapshot summary. Both inputs must already be
redacted and local-only.

Expected compare behavior:

- Validate the two snapshot summaries in memory.
- Reject raw local paths, raw token material, raw session ids, and raw root
  keys.
- Compare deterministic metadata such as snapshot version, operation count,
  cursor reference, and redaction flags.
- Return a compact drift summary with `durableWrites: false`.
- Drop the raw request object after the response is built.

## Retention Preview Workflow

`POST /v1/workspace-session/snapshot-review/retention-preview` accepts redacted
snapshot summaries plus a retention policy name. The route returns records that
describe what would be retained or pruned.

Expected retention behavior:

- Keep `dryRun` set to `true` for every preview response and record.
- Keep `durableWrites` set to `false`.
- Keep `applied` set to `false`; preview records must not perform cleanup.
- Return deterministic timestamps and reason codes so fixture comparisons stay
  stable.
- Store no raw request body, raw path, token, session id, or root key material.

## API, SDK, And CLI Names

These names are the public contract for the local snapshot review slice:

- API module: `apps/api/src/workspaceSessionSnapshotReviewRoutes.ts`
- API factory: `createWorkspaceSessionSnapshotReviewRoutes`
- API mount: `mountWorkspaceSessionSnapshotReviewRoutes`
- API default base: `DEFAULT_WORKSPACE_SESSION_SNAPSHOT_REVIEW_ROUTE_BASE_PATH`
- SDK module: `packages/sdk-js/src/localWorkspaceSessionSnapshotReview.ts`
- SDK helpers: `compareSnapshots` and `previewSnapshotRetention`
- SDK core helpers: `compareLocalWorkspaceSessionSnapshots` and
  `previewLocalWorkspaceSessionSnapshotRetention`
- CLI module: `packages/cli/src/workspaceSessionSnapshotReview.ts`
- CLI runner: `runWorkspaceSessionSnapshotReviewCli`
- CLI loader: `loadWorkspaceSessionSnapshotReviewFixture`
- CLI detector: `isWorkspaceSessionSnapshotReviewCommand`
- CLI commands: `workspace-session snapshot-review compare` and
  `workspace-session snapshot-review retention-preview`

## Fixture

`examples/workspace-session/snapshot-review.json` contains:

- `snapshots.baseline` and `snapshots.candidate`, both redacted.
- `compare.response`, a local-only drift summary with no durable writes.
- `retentionPreview.response.records`, dry-run preview records for retain and
  prune decisions.
- `validationCommands`, the focused commands for JSON formatting and Python
  contract checks.

The fixture uses schema version `workspace-session-snapshot-review/v1` and kind
`workspace-session.snapshot-review`.

## Validation Commands

Run the focused checks from the repository root:

```powershell
python -m json.tool examples\workspace-session\snapshot-review.json
python -m unittest tests.test_workspace_session_snapshot_review_docs
python -m unittest tests.test_workspace_session_snapshot_review_alignment
```
