# Core Model

SovereignOps stores workspace activity as local-first records and append-only events. The core model is intentionally small enough to audit and broad enough to support agents, plugins, sync, search, and SDK clients.

## Identifiers

Rust core identifiers use explicit prefixes:

- `wsp_` for workspaces.
- `act_` for actors.
- `dev_` for devices.
- `obj_` for canonical object IDs.
- `key_` for key references.

Identifiers reject empty values, wrong prefixes, missing bodies, long values, and path-like characters.

## Events

`EventEnvelope` uses deterministic canonical serialization for field ordering. Event logs validate:

- one-based sequence numbers;
- previous-event digest links;
- non-empty operation names;
- non-empty payload digests.

The current event digest is a stable local chain digest. Cryptographic payload signing belongs in the future key-management layer.

## Objects

Object operations cover projects, tasks, documents, incidents, comments, and attachments. Reducers are deterministic and reject mutations before creation, duplicate creation, blank required fields, and object mismatches.

Documents support title, body, tags, archive markers, and deletion markers. Tasks support status, assignee, project link, and archive markers. Incidents support severity, status, and evidence links.

## Sync

`VectorClock` tracks device or replica counters and classifies causal ordering as equal, before, after, or concurrent. Sync conflict classification identifies:

- concurrent edits;
- delete-update races;
- permission changes;
- schema mismatches.

## Audit

Audit helpers redact sensitive field names and credential-shaped values before serialization. Redaction metadata records which path was changed and why.

