# Workspace Session Snapshot Review

This guide documents the local snapshot review fixture used to compare two
workspace session snapshots and preview retention decisions. The fixture is
`examples/workspace-session/snapshot-review.json`.

## Scope

- Snapshot review is local-only and compares caller-supplied redacted snapshot
  summaries in memory.
- The compare workflow reports baseline-to-candidate drift without opening a
  network socket, replaying event bodies, or writing review output to storage.
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

Route payloads use `baseline` and `candidate` keys. The fixture keeps the same
pair under `snapshots.baseline` and `snapshots.candidate` so replay and docs
checks can reference stable example inputs without retaining the original
request body.

Expected compare behavior:

- Validate the two snapshot summaries in memory.
- Reject raw local paths, raw token material, raw session ids, and raw root
  keys.
- Compare deterministic metadata such as snapshot version, operation count,
  cursor reference, event counts, audit counts, fingerprints, and redaction
  flags.
- Return a compact drift summary with `localOnly: true`, `redacted: true`, and
  `durableWrites: false`.
- Report changed event and audit-record summaries only; replay payload bodies
  remain outside the response.
- Drop the raw request object after the response is built.

## Retention Preview Workflow

`POST /v1/workspace-session/snapshot-review/retention-preview` accepts redacted
snapshot summaries plus a retention policy. The route returns records that
describe what would be retained or expired.

Route payloads use `snapshots` and `policy` keys. Supported policy fields are
`retainNewest`, `retainSnapshotIds`, and `deleteBefore`. The fixture uses a
named keep-latest policy for stable dry-run examples.

Expected retention behavior:

- Keep `dryRun` set to `true` for every preview response and record.
- Keep `durableWrites` set to `false`.
- Keep `applied` set to `false`; preview records must not perform cleanup.
- Treat `retain`, `expire`, `delete`, and `prune` labels as advisory preview
  labels until a separate retention operation applies them.
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
- SDK API client module:
  `packages/sdk-js/src/localWorkspaceSessionSnapshotReviewApiClient.ts`
- SDK retention dry-run module:
  `packages/sdk-js/src/localWorkspaceSessionSnapshotRetention.ts`
- SDK helpers: `compareSnapshots` and `previewSnapshotRetention`
- SDK core helpers: `compareLocalWorkspaceSessionSnapshots` and
  `previewLocalWorkspaceSessionSnapshotRetention`
- SDK API client factory: `createLocalWorkspaceSessionSnapshotReviewApiClient`
- SDK API client helpers: `compareLocalWorkspaceSessionSnapshotsViaApi` and
  `previewLocalWorkspaceSessionSnapshotRetentionViaApi`
- SDK retention dry-run helpers:
  `planLocalWorkspaceSessionSnapshotRetentionCleanup`,
  `planFileBackedLocalWorkspaceSessionSnapshotRetentionCleanup`, and
  `planSnapshotRetentionCleanupDryRun`
- CLI module: `packages/cli/src/workspaceSessionSnapshotReview.ts`
- CLI runner: `runWorkspaceSessionSnapshotReviewCli`
- CLI loader: `loadWorkspaceSessionSnapshotReviewFixture`
- CLI detector: `isWorkspaceSessionSnapshotReviewCommand`
- CLI commands: `workspace-session snapshot-review compare` and
  `workspace-session snapshot-review retention-preview`
- Web module: `apps/web/src/workspaceSessionSnapshotReviewState.ts`
- Web state builder: `buildWorkspaceSessionSnapshotReviewState`
- Web helper surfaces: `buildWorkspaceSessionSnapshotReviewChangedFields`,
  `buildWorkspaceSessionSnapshotRetentionPreview`,
  `buildWorkspaceSessionSnapshotReviewStatusBadges`,
  `buildWorkspaceSessionSnapshotReviewSummaryCards`,
  `buildWorkspaceSessionSnapshotReviewWarnings`,
  `buildWorkspaceSessionSnapshotReviewEmptyStates`, and
  `redactWorkspaceSessionSnapshotReviewDisplayValue`

## Client Integration

The SDK helpers are pure local functions. `compareSnapshots` and
`compareLocalWorkspaceSessionSnapshots` accept `{ baseline, candidate }` and
return a `localWorkspaceSessionSnapshotCompareSummary` with severity, risk,
changed status, issue count, and redacted baseline/candidate summaries.

`previewSnapshotRetention` and
`previewLocalWorkspaceSessionSnapshotRetention` accept `records` plus optional
`maxCount`, `maxAgeMs`, and deterministic clock fields. They return
`localWorkspaceSessionSnapshotRetentionPreview` with keep and delete candidate
lists, counts, `localOnly: true`, and `durableWrites: false`.

`createLocalWorkspaceSessionSnapshotReviewApiClient` calls the API routes with
preflight request validation and frozen JSON responses. `compareLocalWorkspaceSessionSnapshotsViaApi`
and `previewLocalWorkspaceSessionSnapshotRetentionViaApi` are thin one-shot
helpers for callers that do not need to hold a client instance.

`planLocalWorkspaceSessionSnapshotRetentionCleanup` and
`planFileBackedLocalWorkspaceSessionSnapshotRetentionCleanup` build dry-run
cleanup plans from file metadata or snapshot records. Their output uses
`keep`, `delete`, and `review` actions, but `dryRun` stays `true` and
`durableWrites` stays `false`; unsafe paths, duplicate ids, raw lock tokens,
and raw secret-shaped values are routed to `review` instead of cleanup.

CLI integrations should load a local fixture and print redacted JSON only:

```powershell
node packages\cli\src\index.ts workspace-session snapshot-review compare --fixture examples\workspace-session\snapshot-review.json
node packages\cli\src\index.ts workspace-session snapshot-review retention-preview --fixture examples\workspace-session\snapshot-review.json
```

## Web State

`buildWorkspaceSessionSnapshotReviewState` turns compare and retention preview
payloads into view state. The state exposes `localOnly`, `durableWrites`,
`persistenceReady`, `rawBodyRetained`, `rawPathRetained`, `rawTokenRetained`,
`rawRetentionRisk`, retention counts, status badges, summary cards, warnings,
and redacted error states.

`persistenceReady` is true only when the payload is local-only, reports no
durable writes, and has no raw retention risk. Display helpers must use
`redactWorkspaceSessionSnapshotReviewDisplayValue` before showing snapshot ids,
paths, tokens, session ids, root keys, or error details.

## Replay Handoff

Snapshot review is a replay-adjacent summary step, not a replay executor.
Replay workers can pass redacted snapshot previews or stored snapshot records
into compare and retention preview flows, then use the returned counts, cursor
refs, fingerprints, changed paths, and retention rows as advisory state.

Review output must not contain event bodies, request bodies, raw storage paths,
lock tokens, session ids, or root keys. Downstream replay or retention workers
must re-validate their own inputs before applying any state change.

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
