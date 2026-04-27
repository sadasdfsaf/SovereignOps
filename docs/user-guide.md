# User Guide

This guide is for private teams using SovereignOps as a local-first workspace for
documents, tasks, approvals, audit history, plugins, backups, and encrypted sync.
It assumes the workspace owner controls the local folder, keys, and review rules.

## Quick Start

From the repository root, run the baseline health check:

```powershell
python scripts\repo_health.py --json
```

For a deterministic sample bundle, preview an example workspace:

```powershell
python scripts\generate_example_workspace.py --workspace-id wsp_demo --preset small
```

The preview command prints sample content only. It does not write the output path
unless a caller imports the Python helper and calls `write_bundle()` explicitly.

## Workspace Basics

A workspace is a local folder plus metadata under `.sovereignops`. The current
layout is described in `docs/desktop-architecture.md` and includes:

- `workspace.json` for workspace metadata.
- `events` for ordered local event records.
- `objects` for encrypted or content-addressed payloads.
- `index` for derived search and navigation state.
- `locks` for open, lock, and unlock coordination.
- `migrations` for layout and schema transition records.

Open the workspace before editing content. Lock it when the device is idle or
when another process should not read plaintext handles. Unlocking requires the
matching local token; a mismatched token leaves the workspace locked.

## Daily Flow

Use the workspace as the source of truth:

1. Create or import a document, task, or issue record.
2. Let local reducers validate the change and append an event.
3. Review any generated proposal before it becomes durable.
4. Check the approval inbox for pending actions.
5. Review the audit timeline when a change needs explanation.
6. Create a backup or run sync after important batches of work.

Returned records are immutable snapshots in the current TypeScript modules, so
callers should request a new snapshot after each write instead of mutating an
old object.

## Approvals

Approvals are for actions that need a human decision before durable state
changes. A request should include:

- A clear summary of the proposed change.
- The target record id.
- The requesting actor id.
- A risk label that helps reviewers sort the queue.
- An expiry time when the request should no longer be actionable.

Approved actions can continue through the write path. Rejected or expired
requests should remain visible in history so later reviewers can understand why
the action did not run.

## Audit Timeline

Audit records explain what happened, who or what requested it, which rule was
applied, and what redaction occurred. Audit records should be useful without
exposing secrets or large content bodies.

Use the audit timeline to answer:

- Which actor requested an action?
- Which target record changed?
- Was the action allowed, denied, or sent for approval?
- Which sensitive fields were redacted?
- Which sync, plugin, or backup step created the record?

Audit records are not a place for tokens, credentials, raw sync payloads, or full
document text.

## Plugins

Plugins extend a workspace through a manifest and a sandboxed context. A plugin
should ask only for the capabilities it needs and should emit audit records for
important actions.

Before enabling a plugin, review:

- The plugin id, version, entrypoint, and minimum host version.
- Requested permissions and capability names.
- Tool, resource, and prompt ids.
- Input schemas for plugin tools.
- The manifest diff from the previously approved version.

Plugins should return proposals or small structured results. Durable writes
should still pass through approval, validation, and audit paths.

## Backups

Backups are encrypted workspace snapshots or bundles. Keep backup metadata
inspectable while leaving content encrypted. A useful backup note includes:

- Workspace id and backup id.
- Creation time and device id.
- Schema version and key slot reference.
- Encrypted payload count and byte count.
- Integrity fingerprints for payload segments.
- Retention label and expected expiration date.

Test restore planning before relying on a backup. The planner should detect
missing payloads, schema mismatches, integrity mismatches, and attempts to
overwrite newer local events without explicit approval.

## Sync

Sync exchanges encrypted event bundles, cursors, and device metadata. The local
event log remains the source of truth. A relay service should not need plaintext
workspace content.

Good sync habits:

- Enroll only trusted devices.
- Confirm the active device list before sharing a workspace.
- Treat stale cursors as a sign to fetch and review remote bundles.
- Resolve conflicts locally before advancing the cursor.
- Run a backup before large sync or restore operations.

## Troubleshooting

If the repository baseline looks wrong, run:

```powershell
python scripts\repo_health.py --json
```

If workspace open fails, check the path first. The desktop contract accepts
absolute local paths only and rejects URI schemes, relative roots, `.` segments,
and `..` segments.

If a plugin fails, review the manifest and the sandbox result. Common causes are
missing capabilities, denied host APIs, or a work budget limit.

If sync stalls, compare the local cursor with the latest accepted event id. A
stale cursor should trigger a fetch or a conflict review rather than forcing a
cursor advance.

If backup restore is blocked, read the restore plan. Do not overwrite a workspace
until the plan explains the target mode and all integrity checks pass.
