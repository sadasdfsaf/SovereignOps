# Admin Guide

This guide is for workspace owners who maintain local team workspaces, approve
plugin access, review audit trails, and keep backup and sync routines healthy.

## Admin Responsibilities

An admin keeps the workspace usable and recoverable without weakening local
boundaries. The core responsibilities are:

- Choose the workspace folder and keep it on trusted storage.
- Control who can open, unlock, back up, restore, and sync the workspace.
- Review approval queues for high-impact actions.
- Review audit history for unexpected activity.
- Keep plugin manifests narrow and understandable.
- Test backup and restore plans before a real recovery is needed.
- Keep local health checks passing before sharing builds with the team.

## Setup Checklist

From `E:\SovereignOps`, run:

```powershell
python scripts\repo_health.py --json
python scripts\smoke.py
python scripts\env_guard.py
```

Optional toolchains are reported by the health check. Missing optional commands
should be recorded, but local documentation and Python checks can still run.

Before creating a workspace folder:

- Pick an absolute local path.
- Avoid shared temp folders.
- Confirm the storage location is included in the team's backup routine.
- Keep `.env` files out of commits.
- Keep secrets in runtime configuration, not in examples or docs.

## Workspace Lifecycle

Use the lifecycle model in `docs/local-data-lifecycle.md` as the admin checklist.

Creation:

- Record the workspace id, display name, schema version, and creator device id.
- Record key metadata without exposing secret material.
- Append the first audit event.

Opening:

- Validate the manifest before loading content.
- Check layout version and pending migrations.
- Reject unsupported storage capabilities.
- Lock the workspace when plaintext handles should be discarded.

Migration:

- Run a dry-run plan first.
- Review ordered steps and rollback notes.
- Record started, completed, and failed states in audit.

Compaction:

- Compact only after replay verification succeeds.
- Keep the covered event range and checkpoint fingerprint.
- Keep the original segment until rollback is no longer needed.

## Approval Management

Admins should treat approval records as durable review decisions, not chat
messages. A useful approval record includes the actor, target, action summary,
risk label, expiry, reviewer, final decision, and decision time.

Recommended review flow:

1. Sort pending approvals by risk and age.
2. Read the target record snapshot.
3. Confirm the action matches the user's intent.
4. Approve, reject, or let stale requests expire.
5. Review the resulting audit record.

Avoid approving broad actions that hide multiple durable changes. Ask the agent
or plugin to split them into smaller proposals.

## Audit Operations

Audit records should be complete enough to reconstruct a decision path. They
should also stay redacted by default.

Review audit streams for:

- Denied actions that repeat often.
- Plugin capability changes.
- Backup, restore, and sync attempts.
- Workspace lock and unlock transitions.
- Redaction paths that look too broad or too narrow.

When exporting audit summaries, include counts, ids, timestamps, decisions, and
redaction notes. Do not include credentials, secret values, or raw payloads.

## Plugin Administration

Every plugin should have a reviewed manifest. The manifest is the contract that
declares the plugin's entrypoint, capabilities, permissions, tools, resources,
prompts, and input schemas.

Before enabling or updating a plugin:

- Validate the manifest with the plugin SDK.
- Review added, removed, and changed capabilities.
- Confirm permissions map to specific capabilities.
- Run sandbox tests for allowed and denied paths.
- Check that important plugin actions emit audit events.
- Confirm durable writes still require host validation.

Disable a plugin if it requests broad capability names, depends on denied host
APIs, writes unclear audit detail, or cannot explain changed permissions.

## Backup Administration

Backups should be routine, encrypted, and restore-tested. Store the backup
manifest separately from the encrypted payload only when that separation helps
operations; the manifest must not expose content.

Recommended routine:

- Back up after large imports, migration, compaction, and sync repair.
- Keep at least one recent backup outside the active workspace folder.
- Record retention labels and expiration notes.
- Test restore planning on a trusted local device.
- Verify payload fingerprints before marking a backup usable.

Restore should start with a plan. The plan should classify the restore as a new
workspace import, replacement, or merge that needs conflict checks.

## Sync Administration

Sync should move encrypted bundles and routing metadata only. The local event log
is still the source of truth.

Admin checks:

- Review enrolled devices and remove devices no longer used by the team.
- Watch for stale cursors and duplicate event ids.
- Treat checksum mismatch as a hard stop.
- Do not advance a cursor after a failed conflict check.
- Keep rate-limit decisions visible in local diagnostics.

If a device falls behind, fetch missing bundles and review conflicts before
accepting new uploads from that device.

## Troubleshooting Playbook

Repository health fails:

- Read the JSON output from `scripts\repo_health.py`.
- Fix missing required paths before looking at optional commands.
- Review any content warning before committing.

Workspace cannot open:

- Confirm the path is absolute and points to the expected folder.
- Check the layout version in `.sovereignops`.
- Run the migration planner if the layout is old.

Approval queue grows:

- Check whether a plugin or agent is batching unrelated actions.
- Expire stale requests.
- Split broad proposals into smaller reviewable actions.

Audit history is noisy:

- Group by actor, action, and target.
- Check for repeated denied actions.
- Reduce plugin audit detail that repeats unchanged metadata.

Sync conflicts repeat:

- Compare cursors.
- Validate bundle checksums.
- Restore from a known-good backup only after restore planning passes.
