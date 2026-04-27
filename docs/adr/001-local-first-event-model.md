# ADR 001: Local-First Event Model

## Status

Accepted

## Context

SovereignOps needs offline-first edits, auditable agent actions, encrypted sync, and deterministic replay. A mutable server-owned record model would make offline operation and review harder because the source of truth would depend on network access and remote state.

## Decision

Workspace changes are represented as append-only events with validated identifiers, monotonic per-workspace sequence numbers, payload digests, and previous-event links. Local storage owns the first durable write. Optional sync transports opaque encrypted bundles and does not need plaintext access.

## Consequences

- Local users can continue working without a network connection.
- Agent and plugin actions can be previewed, approved, denied, and replayed from the same event stream.
- Conflict handling must be explicit because multiple devices can append concurrent histories.
- Storage and sync code must preserve event ordering metadata and never rewrite historical events in place.

## Validation

- `crates/sovereign_core` validates event sequence and previous digest links.
- Tests cover sequence gaps and end-to-end policy-to-event append behavior.
- Future sync tests should cover concurrent branches and merge classification.

