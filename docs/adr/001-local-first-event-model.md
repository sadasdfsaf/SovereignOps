# ADR 001: Local-First Event Model

## Status

Accepted

## Context

SovereignOps stores workspace activity as local-first records and append-only
events. The event model has to support offline edits, auditable agent and plugin
actions, encrypted sync, deterministic replay, and rebuildable derived views.

A mutable remote-owned record model would make offline operation and review
harder because the source of truth would depend on network access and remote
state. It would also make conflict analysis and replay less predictable because
historical state could be overwritten instead of preserved as an ordered fact.

## Decision

Workspace changes are represented as append-only events. Each accepted event
must include:

- Valid workspace, actor, device, and object identifiers.
- A monotonic per-workspace sequence number.
- A non-empty operation name.
- A payload digest for the submitted change.
- A previous-event link, except for the first event in a workspace chain.

Local storage owns the first durable write. Reducers build current records,
search indexes, summaries, and audit views from the event stream. Optional sync
transports opaque encrypted bundles and should not need plaintext access to user
content.

## Consequences

- Local users can continue working without a network connection.
- Agent and plugin actions can be previewed, approved, denied, and replayed
  from the same event stream.
- Conflict handling must be explicit because multiple devices can append
  concurrent histories.
- Storage and sync code must preserve event ordering metadata and never rewrite
  historical events in place.
- Derived views must be treated as rebuildable caches, not durable sources of
  truth.
- Compaction can reduce storage size only when it produces a verifiable
  checkpoint for the covered event range.

## Privacy and Security Rationale

The event log keeps the authoritative write path on the local device. Plaintext
workspace content remains inside local storage and local reducers unless the
user explicitly exports or syncs an encrypted bundle.

Digest links make tampering and accidental gaps visible during validation.
Append-only history also gives approval flows, plugin actions, and agent-driven
changes a replayable record without requiring broad read access to every
derived view.

Sync relays receive encrypted bundles, cursors, and routing metadata. They do
not need raw payloads to store, order, or transfer workspace updates.

## Validation

- `crates/sovereign_core` validates event sequences and previous digest links.
- Core tests cover sequence gaps, identifier validation, digest metadata, and
  deterministic replay inputs.
- Sync bundle tests should verify encrypted bundle checksums, cursor
  advancement, and concurrent branch classification.
- ADR tests verify that this decision keeps the required ADR sections and
  avoids restricted references.
