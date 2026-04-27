# Workspace Session Isolation

This guide describes the local acceptance shape for workspace and session
isolation. It keeps examples small, file-backed, and replayable from the
repository root without remote hosts, private paths, raw payload bodies, or
ambient machine state.

## Scope

- `docs/workspace-session-isolation.md` is this guide.
- `examples/workspace-session/acceptance-session.json` is the compact
  acceptance ledger for this guide.
- `apps/desktop/src/commands.ts` is the desktop command contract source.
- `packages/sdk-js/src/workspace.ts`, `packages/sdk-js/src/storage.ts`, and
  `packages/path-security/src/index.ts` define the SDK helper expectations.
- `packages/cli/src/commands.ts` supplies the CLI command names used for
  acceptance checks.
- `apps/web/src/localStore.ts` supplies the browser-side state boundary used by
  Web state cards.
- `services/sync/src/bundles.ts` and `packages/workspace-backup/src/index.ts`
  define sync and backup readiness fields.
- `packages/observability/src/index.ts` supplies audit redaction behavior.

## Desktop Command Contract

Desktop acceptance covers four command ids from
`apps/desktop/src/commands.ts`:

- `workspace.open` maps to `workspace_open` and must validate a safe local
  workspace path before reading layout files.
- `workspace.lock` maps to `workspace_lock` and moves the current session into
  a locked state with a matching workspace id and device id.
- `workspace.unlock` maps to `workspace_unlock` and requires the lock token
  from the current session state.
- `workspace.plan_file_layout_migration` maps to
  `workspace_plan_file_layout_migration` and returns ordered file-layout steps
  without applying them.

The acceptance ledger records expected host effects, lock transitions, and the
layout version. It does not record absolute paths or raw lock tokens.

## SDK Helper Expectations

SDK acceptance expects helper calls to stay deterministic and local:

- `createInMemoryWorkspaceClient` creates an isolated in-memory client for the
  acceptance run.
- `validateWorkspaceDescriptor` checks `wsp_`, `dev_`, and `key_` prefixes plus
  ISO timestamps before a workspace is created.
- `appendEvent`, `listEvents`, and `snapshot` must return readonly clones so one
  session cannot mutate another session view.
- `validateJsonStorageRelativePath` accepts normalized `.json` paths and blocks
  traversal, drive prefixes, home shortcuts, remote schemes, and unsafe
  separators.
- `validateLocalRelativePath` keeps reusable path checks shared between storage,
  backup, and desktop flows.

## CLI Acceptance Checks

CLI checks are local-first and use existing command names only:

- `sovereignops workspace create --workspace-id wsp_notes_lab --name NotesLab`
  creates a workspace descriptor in the isolated fixture.
- `sovereignops workspace list` lists the isolated fixture workspace ids.
- `sovereignops ingest event --workspace-id wsp_notes_lab --type note.created`
  appends a local event with a structured-cloneable payload.
- `sovereignops audit preview --workspace-id wsp_notes_lab --limit 5` previews
  redacted audit entries for the selected workspace.
- `sovereignops export bundle --workspace-id wsp_notes_lab` exports a bundle
  that keeps workspace ids, cursors, and event ids but omits raw record bodies.

Acceptance commands must be run from the repository root and must not read
outside the workspace tree.

## Web State Cards

Web acceptance renders state cards from local data only:

- `session_lock` shows whether the current session is locked or unlocked.
- `storage_scope` shows descriptor, event, audit, and cursor record counts.
- `path_guard` shows whether every display path is repository-relative or
  workspace-relative.
- `backup_ready` shows whether encrypted backup descriptors can be planned.
- `audit_redaction` shows how many audit fields were replaced with
  `[REDACTED]` or redacted references.

Cards may show counts, statuses, ids, and redacted display paths. They must not
show raw payload bodies, absolute filesystem roots, key material, or unredacted
operator details.

## Sync And Backup Readiness

Sync readiness uses `services/sync/src/bundles.ts`:

- Upload batches must include one workspace id, one device id, a base cursor,
  deterministic event ordering, and a `sha256:` checksum.
- Download windows must include `afterCursor`, `nextCursor`, `hasMore`, and
  the selected event ids.
- Conflict summaries must remain code-based and must not include raw payload
  bodies.

Backup readiness uses `packages/workspace-backup/src/index.ts`:

- Backup manifests use `bkp_`, `wsp_`, `act_`, and `pay_` id prefixes.
- Payload paths are normalized local relative paths such as
  `records/snapshots/workspace.json.enc`.
- Restore planning starts in `preview` mode and blocks unsafe overwrite or
  replace requests until an explicit local approval is present.
- Audit output uses redacted refs for backup, workspace, and actor ids.

## Audit Redaction

Audit acceptance requires redaction at every boundary:

- Sensitive keys such as `authorization`, `apiKey`, `accessToken`, `password`,
  `secret`, `token`, `email`, and `phone` must resolve to `[REDACTED]`.
- File paths in audit messages must become `[redacted-path]` or a stable
  redacted display value.
- Backup audit events must use `backupRef`, `workspaceRef`, and `actorRef`
  instead of raw ids.
- The acceptance fixture records redacted path names and field counts, not raw
  values.

## Threat-Model Gates

The fixture gates are meant to catch local isolation failures before a workflow
is treated as accepted:

- `desktop_command_contract` verifies command ids, host effects, layout version,
  and lock-state transitions.
- `sdk_session_helpers` verifies in-memory session separation, readonly return
  values, and safe path validation.
- `cli_acceptance_checks` verifies repository-root execution and local command
  coverage.
- `web_state_cards` verifies card ids, counts, statuses, and redacted display
  paths.
- `sync_backup_readiness` verifies checksums, cursor windows, backup manifest
  prefixes, restore preview mode, and blocked unsafe restore cases.
- `audit_redaction` verifies replacement markers, redacted refs, and absence of
  raw payload bodies.
- `path_escape_gate` rejects traversal, drive-prefixed paths, UNC paths, home
  shortcuts, remote schemes, cache paths, key material paths, and private-pack
  paths.

## Local-First Checks

Acceptance is complete when:

- All referenced files are repository-relative and checked in.
- Workspace fixture paths are normalized forward-slash relative paths.
- Any joined path must remain inside the workspace root.
- Loopback values are allowed only when explicitly listed; this fixture needs no
  HTTP endpoint.
- Network mode stays `disabled`.
- The private plan pack is read-only and is never copied into examples.
- Raw payload bodies, raw lock tokens, absolute paths, and secret-shaped values
  are absent from durable examples.

## Validation Commands

Run the focused checks from the repository root:

```powershell
python -m json.tool examples\workspace-session\acceptance-session.json
python -m unittest tests.test_workspace_session_isolation_docs
```
