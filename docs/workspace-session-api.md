# Workspace Session API

This guide documents the local workspace session API fixture used by SDK,
CLI, and Web checks. The fixture is
`examples/workspace-session/api-requests.json`.

## Local-Only Scope

- The routes are local dispatcher contracts for workspace session review.
- Callers provide JSON request bodies; the routes do not scan local folders or
  open remote hosts.
- Fixture references use repository-relative paths and `local://` identifiers.
- Durable examples must not contain raw machine paths, credential-shaped
  values, private planning files, or raw lock material.

## Routes

| Route id | Method | Path | Purpose |
| --- | --- | --- | --- |
| `workspace_session_summary` | `POST` | `/v1/workspace-session/summary` | Build a compact readiness summary from a supplied workspace session snapshot. |
| `workspace_session_audit_preview` | `POST` | `/v1/workspace-session/audit-preview` | Render redacted audit preview records from supplied local session events. |

The route base is `/v1/workspace-session`. The OpenAPI operation ids are
`summarizeWorkspaceSession` and `previewWorkspaceSessionAudit`.

`POST /v1/workspace-session/summary` is for UI and CLI review state. It
summarizes workspace open state, lock state, local gateway readiness, migration
readiness, and backup readiness without echoing raw storage details.

`POST /v1/workspace-session/audit-preview` is for deterministic audit review.
It accepts local session events and returns redacted audit records sorted by
sequence and timestamp.

## Validation Behavior

- Requests must be JSON objects.
- `localOnly` must be `true` when present.
- Workspace ids use the `wsp_` prefix, session ids use the `sess_` prefix, and
  device ids use the `dev_` prefix.
- Timestamps use ISO UTC format with millisecond precision.
- Summary inputs must provide a workspace snapshot and session snapshot.
- Audit preview inputs must provide an `events` array with supported event
  types: `workspace.session.opened`, `workspace.session.locked`, and
  `workspace.session.unlocked`.
- Storage paths must be normalized relative JSON paths or redacted display
  values; raw absolute paths are rejected by the fixture contract.
- Unsupported methods, unknown route paths, malformed ids, and unredacted lock
  material must return a JSON error envelope in route implementations.

## SDK Usage

SDK callers use `packages/sdk-js/src/localWorkspaceSession.ts`,
`packages/sdk-js/src/localWorkspaceSessionApiClient.ts`, and
`packages/sdk-js/src/index.ts`:

- `normalizeLocalWorkspaceDescriptor` validates the descriptor and local
  gateway.
- `planLocalWorkspaceSessionOpenEvent`,
  `planLocalWorkspaceSessionLockEvent`, and
  `planLocalWorkspaceSessionUnlockEvent` produce deterministic session events.
- `createLocalWorkspaceSessionAuditPreviewRecords` renders immutable redacted
  audit preview records.
- `LocalWorkspaceSessionApiClient` calls `workspace-session/summary` and
  `workspace-session/audit-preview` with injected fetch support.

The fixture mirrors those shapes so SDK tests can compare route input and
output without opening a socket.

## CLI Usage

CLI flows should treat `examples/workspace-session/api-requests.json` as a
checked-in replay bundle. A local replay command can select all routes or a
single route id, dispatch the JSON body in memory, and compare status plus
response body fields.

Expected CLI behavior:

- Run from the repository root.
- Read only the checked-in fixture path supplied by the user.
- Print JSON responses or JSON comparison summaries.
- Keep stderr free of raw session payloads.
- Exit nonzero for route mismatches, invalid JSON, unsafe path fields, or
  unredacted lock material.

## Web Usage

Web callers use `apps/web/src/workspaceSessionState.ts` and
`apps/web/src/workspaceSessionApiState.ts`:

- `buildWorkspaceSessionState` builds the full local review state.
- `buildWorkspaceSessionApiState` builds route replay state for the API view.
- `buildWorkspaceSessionApiSummaryCards` builds compact API summary cards.
- `buildWorkspaceSessionApiErrorStates` converts route errors into safe display
  cards.
- `redactWorkspaceSessionApiError` redacts route errors before display.
- `redactWorkspaceSessionText` removes machine paths and credential-shaped
  values from user-visible messages.

The summary route output is intentionally close to Web card state so the UI can
render readiness without retaining raw session input.

## Redaction Expectations

- Responses use `[REDACTED]`, `[redacted-path]`, or stable redacted references
  for sensitive display values.
- Audit preview records must not include raw storage paths or raw lock
  material.
- Redaction metadata must state which fields were redacted.
- Request bodies are not echoed in full.
- Output ordering is deterministic so snapshots remain stable.

## Fixture

`examples/workspace-session/api-requests.json` contains two requests:

- `workspace_session_summary` covers the summary route with a ready local
  session snapshot.
- `workspace_session_audit_preview` covers the audit preview route with open
  and lock session events.

The fixture is compact and deterministic. It uses `local://workspace-session-api`
as the API base, repository-relative validation commands, and static timestamps.

## Implementation Map

The API slice is guarded by `workspace-session-api-alignment`, documented here,
and covered by:

- `docs/workspace-session-api.md`
- `tests/test_workspace_session_api_alignment.py`
- `tests/security/workspace_session_api_threats.test.mjs`
- `apps/api/src/workspaceSessionRoutes.ts`
- `apps/api/tests/workspace-session-routes.test.mjs`
- `packages/sdk-js/src/localWorkspaceSessionApiClient.ts`
- `packages/sdk-js/tests/local-workspace-session-api-client.test.mjs`
- `packages/cli/src/workspaceSessionApiReplay.ts`
- `packages/cli/tests/workspace-session-api-replay.test.mjs`
- `apps/web/src/workspaceSessionApiState.ts`
- `apps/web/tests/workspace-session-api-state.test.mjs`
- `examples/workspace-session/api-requests.json`

## Validation Commands

Run the focused checks from the repository root:

```powershell
python -m json.tool examples\workspace-session\api-requests.json
python -m unittest tests.test_workspace_session_api_docs
```
