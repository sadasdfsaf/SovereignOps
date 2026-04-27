# Workspace Session File Store

This guide documents the checked-in file-store adapter fixture for root-scoped
workspace session snapshots. The fixture is
`examples/workspace-session/file-store-adapter.json`.

## Scope

- The file store is local-only and writes under one workspace root reference.
- Store paths are normalized relative paths; callers never provide machine
  roots, home directories, or parent traversal.
- Snapshot API routes preview, create, list, and read redacted snapshot records.
- SDK, CLI, and Web surfaces use derived state and redacted display values.
- The fixture records names and contracts only; it does not contain raw lock
  material, raw request bodies, credentials, headers, or host-specific paths.

## Root-Scoped Store

`apps/api/src/workspaceSessionStoreFileAdapter.ts` owns the API route adapter
for redacted snapshot records. It provides
`createWorkspaceSessionStoreFileAdapter`,
`createFileBackedWorkspaceSessionSnapshotStore`,
`createWorkspaceSessionSnapshotFileStore`, and
`DEFAULT_WORKSPACE_SESSION_SNAPSHOT_FILE_STORE_LOCK_FILE`.

`packages/sdk-js/src/localWorkspaceSessionFileStore.ts` owns the SDK bundle
file adapter. It provides `LocalWorkspaceSessionFileStore`,
`createLocalWorkspaceSessionFileStore`,
`FileBackedLocalWorkspaceSessionStore`,
`createFileBackedLocalWorkspaceSessionStore`,
`resolveLocalWorkspaceSessionFileStorePath`,
`readLocalWorkspaceSessionStoreBundleFile`, and
`writeLocalWorkspaceSessionStoreBundleFile`.

The adapter accepts a workspace root reference such as
`workspace://wsp_session_alpha`, then resolves session bundles under a relative
base directory such as `workspaces/wsp_session_alpha/sessions`. Resolved bundle
targets must stay inside that base directory and must use the `.json` extension.

## Atomic Writes

File writes use the `write-temp-fsync-rename` strategy:

- Serialize deterministic JSON with a trailing newline.
- Write to a same-directory temporary path.
- Flush the temporary file before commit.
- Rename the temporary file over the target path.
- Flush the containing directory after rename when the platform supports it.
- On recovery, ignore temporary files and read the last committed JSON file.

The adapter reports `atomicWrite: true`, `partialWritesVisible: false`, and
`rawBodyRetained: false` in its fixture metadata.

## Lock Guard

The `useLockFile` option wraps file-store reads and writes with an advisory lock
file inside the same root scope. The guard records only a redacted
`lockTokenRef`, a device id, an owner session id, and a stale timeout. It does
not store raw lock strings or raw process paths.

## API, SDK, CLI, And Web Names

- `apps/api/src/workspaceSessionStoreRoutes.ts` provides
  `createWorkspaceSessionStoreRoutes`, `mountWorkspaceSessionStoreRoutes`, and
  `DEFAULT_WORKSPACE_SESSION_STORE_ROUTE_BASE_PATH`.
- `apps/api/src/workspaceSessionStoreFileAdapter.ts` provides
  `createWorkspaceSessionStoreFileAdapter`,
  `createFileBackedWorkspaceSessionSnapshotStore`, and
  `createWorkspaceSessionSnapshotFileStore`.
- `POST /v1/workspace-session/snapshots/preview` previews a redacted snapshot.
- `POST /v1/workspace-session/snapshots` creates a redacted snapshot record.
- `GET /v1/workspace-session/snapshots` lists snapshot record summaries.
- `GET /v1/workspace-session/snapshots/:snapshotId` reads one snapshot record.
- `packages/sdk-js/src/localWorkspaceSessionSnapshotApiClient.ts` provides
  `LocalWorkspaceSessionSnapshotApiClient` and
  `createLocalWorkspaceSessionSnapshotApiClient`.
- `packages/cli/src/workspaceSessionSnapshotStore.ts` provides
  `runWorkspaceSessionSnapshotStoreCli`,
  `loadWorkspaceSessionSnapshotStore`, and
  `isWorkspaceSessionSnapshotStoreCommand`.
- `apps/web/src/workspaceSessionSnapshotState.ts` provides
  `buildWorkspaceSessionSnapshotState`,
  `buildWorkspaceSessionSnapshotSummaryCards`, and
  `redactWorkspaceSessionSnapshotDisplayValue`.

## Example Fixture

`examples/workspace-session/file-store-adapter.json` uses schema version
`workspace-session-file-store-adapter/v1` and kind
`workspace-session.file-store-adapter`. It contains the root-scoped path rules,
atomic write plan, lock guard metadata, route names, SDK client names, CLI
inspect names, Web state names, and a redacted sample snapshot record.

The fixture keeps response paths redacted and sample storage paths relative. It
also keeps `durableWrites: true` only at the adapter capability level; route
samples continue to report `durableWrites: false` unless a route has committed a
stored snapshot record.

## Validation Commands

Run the focused checks from the repository root:

```powershell
python -m json.tool examples\workspace-session\file-store-adapter.json
python -m unittest tests.test_workspace_session_file_store_docs tests.test_workspace_session_file_store_alignment
node --test tests/security/workspace_session_file_store_threats.test.mjs
```
