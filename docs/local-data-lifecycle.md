# Local Data Lifecycle

SovereignOps treats a workspace as a private, local-first data set that can be
opened, migrated, backed up, inspected, and synchronized without handing raw
content to a remote control plane. This document describes the lifecycle
contracts that implementation packages must preserve as storage features grow.

## Lifecycle Stages

### 1. Workspace Creation

A new workspace starts with a manifest, an event log checkpoint, and an
encryption metadata envelope. The creation path should be deterministic enough
for tests while still allowing production callers to provide strong randomness
through the crypto provider boundary.

Creation code must record:

- Workspace identifier and human label.
- Schema version and minimum compatible reader version.
- Device identifier that created the workspace.
- Initial key metadata without exposing secret key material.
- First audit event showing who created the workspace and which local client
  version produced it.

### 2. Opening And Locking

Opening a workspace should validate the manifest before loading user content.
Locking should discard plaintext handles and leave only encrypted metadata,
sync cursors, and non-sensitive health summaries in memory.

The open path must check:

- Manifest schema compatibility.
- Storage adapter capability flags.
- Integrity fingerprints for critical metadata.
- Pending migrations that must run before writes are allowed.
- Local policy settings that constrain agent-visible actions.

### 3. Migration

Migrations move metadata and event shapes from one schema version to another.
They should be small, named, ordered, and testable in isolation. A migration
planner should be able to produce a dry-run summary before mutating anything.

Migration records should include:

- Source version and target version.
- Step identifiers in execution order.
- Deterministic preflight summary.
- Rollback note for each step, even when rollback is manual.
- Audit event for planned, started, completed, or failed migration state.

### 4. Backup

Backups are encrypted snapshots or bundles that can be restored on a trusted
local device. Backup metadata should be inspectable without revealing document
contents, task text, plugin secrets, or raw event payloads.

Backup manifests should include:

- Backup identifier, workspace identifier, and creation timestamp.
- Encryption algorithm label and key slot reference.
- Encrypted payload count and total byte count.
- Integrity fingerprint for each payload segment.
- Redacted audit summary for the backup operation.
- Retention class and expiration guidance.

### 5. Restore

Restore planning should happen before payload import. The planner compares the
incoming backup manifest against the target workspace and reports whether the
restore is a new workspace import, a point-in-time replacement, or a merge that
requires conflict checks.

Restore safety checks should cover:

- Workspace identifier mismatch.
- Unsupported schema version.
- Missing encrypted payload segments.
- Integrity fingerprint mismatch.
- Restore target that already has newer local events.
- Attempted overwrite without explicit approval.

### 6. Sync

Sync exchanges encrypted event bundles, cursors, device records, and conflict
metadata. The local event log remains the source of truth. A sync service can
store encrypted bundles and routing metadata, but it should not need plaintext
workspace content.

Sync metadata should be auditable through:

- Device enrollment events.
- Bundle upload and fetch records.
- Cursor advancement decisions.
- Conflict classification summaries.
- Rate-limit decisions and retry guidance.

### 7. Observability

Observability is local and privacy-preserving by default. Metrics and traces
should describe system behavior without leaking user content. Exporters, if
added later, must be explicit opt-in adapters.

Useful signals include:

- Migration duration and result counts.
- Backup and restore plan outcomes.
- Sync bundle sizes and retry counts.
- MCP tool decisions by outcome.
- Ingest connector document counts and checksum failures.
- Policy evaluation decisions and approval wait time.

### 8. Compaction

Compaction reduces storage size while preserving replayable state. It should
produce a checkpoint event or snapshot that can be verified against the original
event range.

Compaction metadata should include:

- Covered event sequence range.
- Checkpoint fingerprint.
- Reducer version.
- Source event count and compacted byte count.
- Replay verification result.
- Rollback note for restoring the uncompacted segment.

## Invariants

- Raw secrets are never written to logs, audit records, metrics, or public test
  fixtures.
- Every write path that changes durable workspace state has a matching audit
  event.
- Dry-run planning exists for migrations, restores, compaction, and destructive
  cleanup.
- Local callers can inspect plans before agent-driven actions run.
- Tests cover version boundaries, denied operations, redaction, and deterministic
  summaries.
- Missing optional toolchains should degrade checks, not block local development.

## Package Boundaries

The planned implementation packages are intentionally separate:

- `packages/workspace-store` owns migration planning and local metadata shape
  transitions.
- `packages/workspace-backup` owns backup manifests, retention decisions, and
  restore planning.
- `packages/observability` owns local metrics, traces, health probes, and
  redaction helpers.
- `benchmarks` owns repeatable performance probes that do not enforce flaky
  timing thresholds.

These boundaries keep storage operations testable without requiring a live
database, external service, or desktop shell.
