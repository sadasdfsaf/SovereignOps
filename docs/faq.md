# FAQ

## What is SovereignOps?

SovereignOps is a local-first workspace platform for safe AI agent operations
over sensitive team data. It focuses on user-controlled data, encrypted storage
and sync, approval gates, audit trails, plugin isolation, and SDK-first
integration.

## Where does workspace data live?

Workspace data lives in a local folder selected by the workspace owner. Metadata
and durable records are organized under `.sovereignops`.

## Is the local event log important?

Yes. The event log is the durable source of truth. Search indexes, timelines,
dashboards, and summaries should be derived from events and checkpoints.

## What should require approval?

Use approval for durable changes that affect workspace content, destructive
actions, restore operations, conflict resolution, plugin capability changes, and
exports from the workspace.

## What belongs in audit records?

Audit records should include actor id, target id, action, decision, timestamp,
short summary, and redaction notes. They should not contain credentials, secret
values, raw payload bytes, private key material, or full document bodies.

## How are plugins controlled?

Plugins declare their surface in a manifest and run against a host-provided
context. The host grants capabilities, captures audit detail, denies broad host
APIs in the sandbox harness, and routes durable writes through approval and
reducers.

## Can a plugin write directly to the workspace?

Plugin results should be proposals or structured outputs. The host should apply
durable changes only after validation, approval when needed, and audit emission.

## How should backups work?

Backups should be encrypted bundles or snapshots with inspectable metadata. The
manifest should describe ids, schema version, key slot reference, payload counts,
byte counts, integrity fingerprints, and retention notes without exposing
content.

## What should happen before restore?

Run restore planning first. The planner should check workspace id, schema
version, payload presence, fingerprints, target state, and whether the restore is
an import, replacement, or merge.

## How does sync work?

Sync exchanges encrypted event bundles, cursors, device records, and conflict
summaries. The relay stores opaque bundles. Local devices validate checksums,
workspace ids, cursors, and conflicts before accepting events.

## What if sync reports a stale cursor?

Fetch missing bundles, compare the latest accepted event id, and review any
conflicts. Do not force cursor advancement after failed validation.

## What if the workspace will not open?

Check that the path is absolute and local. The desktop contract rejects URI
schemes, relative paths, control characters, `.` segments, and `..` segments.
Then check layout version and pending migration plans.

## What if an approval request is unclear?

Reject or expire it, then ask the agent or plugin to create a smaller proposal
with target ids, expected changes, risk label, and expiry.

## What if an audit record contains too much detail?

Treat that as a redaction bug. Update the emitting code so the record keeps ids,
decisions, and summaries while removing secrets and large content bodies.

## What if a plugin fails in the sandbox?

Check the result code. Common causes are missing capabilities, denied host APIs,
work budget exhaustion, invalid manifest fields, or too many audit events.

## Which commands are useful for local checks?

From the repository root:

```powershell
python scripts\repo_health.py --json
python scripts\smoke.py
python scripts\env_guard.py
```

Run package checks that match the files you changed. Record any command that
cannot run on the current machine.
