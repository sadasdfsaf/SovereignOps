# Workspace Session Persistence

This guide documents the checked-in local session-store fixture used to keep a
workspace session snapshot replayable across API, SDK, CLI, and Web reviews.
The fixture is `examples/workspace-session/session-store.json`.

## Scope

- The session store is local-first and belongs to one workspace id and one
  device id.
- The persisted snapshot keeps descriptor data, the current session id,
  ordered operations, the last cursor, and redacted display references.
- API routes summarize or preview the supplied snapshot. They do not write the
  snapshot back to disk, so route responses keep `durableWrites: false`.
- Durable examples must not contain absolute machine paths, raw lock material,
  credential-shaped values, request headers, or remote hosts.

## Snapshot Store

The fixture uses schema version `workspace-session-persistence/v1` and kind
`workspace-session.session-store`.

Stored fields are intentionally small:

- `descriptor` is the same descriptor accepted by the API routes.
- `session` stores `sessionId`, `state`, `operations`, `lastCursor`, and a
  redacted `lockTokenRef`.
- `storage.path` is a normalized relative JSON path.
- `routes.summary` and `routes.auditPreview` hold request and response samples
  that can be compared without opening a network socket.

## Route Alignment

`POST /v1/workspace-session/summary` accepts `descriptor`, optional
`sessionId`, and optional `operations`. The response returns
`workspace-session-api/v1`, `localOnly: true`, `durableWrites: false`,
redacted storage, gateway data, and optional session operations.

`POST /v1/workspace-session/audit-preview` accepts `descriptor`, `sessionId`,
and ordered event plans. Event plans use `open`, `lock`, or `unlock`
operations with positive `sequence` and matching cursor values. The response
returns redacted preview events plus audit preview records.

## SDK, CLI, And Web Usage

- `packages/sdk-js/src/localWorkspaceSessionApiClient.ts` posts descriptor
  snapshots to the summary and audit preview routes.
- `packages/cli/src/workspaceSessionApiReplay.ts` replays local JSON fixtures
  and redacts unsafe output before display.
- `apps/web/src/workspaceSessionApiState.ts` renders route replay state and
  carries redaction counts into user-visible cards.
- `apps/api/src/workspaceSessionRoutes.ts` is the route source used by
  `docs/openapi.yaml`.

## Local Boundaries

- Gateway values are `stdio` or loopback HTTP only.
- Persisted paths are relative JSON paths or redacted display values.
- Lock references are redacted and raw lock strings are not stored.
- Route examples are deterministic and keep timestamps fixed.
- The example does not include request headers or environment-specific paths.

## Validation Commands

Run the focused checks from the repository root:

```powershell
python -m json.tool examples\workspace-session\session-store.json
python scripts\validate_openapi.py
python -m unittest tests.test_workspace_session_persistence_docs
```
