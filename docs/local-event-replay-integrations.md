# Local Event Replay Integrations

This guide connects local event replay across SDK, CLI, Web, and sync layers.
The examples stay local-first: checked-in fixtures use repository-relative
paths, deterministic cursors, redaction metadata, and end-to-end encrypted
export payloads.

## Scope

- `examples/local-events/catalog.json` remains the canonical event source.
- `examples/local-events/export-session.json` describes a sealed replay export.
- `examples/local-events/import-plan.json` describes a dry-run import plan for
  the same event stream.
- Replay examples carry ids, cursors, digests, summaries, and redaction
  metadata. They do not carry record bodies or free-form review text.

## Export Session

`examples/local-events/export-session.json` records a replay export without
copying the catalog body into the export:

- `schemaVersion: "local-event-replay-export-session/v1"`.
- `catalog.eventIds` and `catalog.lastEventDigest` pin the source catalog.
- `encryption.mode: "end-to-end"` and `payloadStorage: "ciphertext-only"`
  require sealed payload handling outside durable examples.
- `replayBatches` group catalog event refs with `previousDigest`,
  `payloadDigests`, `finalDigest`, operation counts, and schema kind counts.
- `auditSummary` records the replay cursor window and redaction totals.

## Import Plan

`examples/local-events/import-plan.json` is a local dry run for consuming the
sealed export:

- `source.exportPath` points at the export session.
- `encryption.acceptedEnvelopeKind` must match the export envelope kind.
- `preflightChecks` validate JSON shape, catalog links, digest chains, cursor
  order, and ciphertext-only payload handling before replay.
- `replayPlan.batches` imports the export batches in sequence order.
- `audit.records` names the safe audit markers emitted by the import worker.

## Layer Handoff

| Layer | Integration point |
| --- | --- |
| SDK | `packages/sdk-js/src/localEvents.ts` exposes `loadLocalEventCatalogFixture`, `summarizeLocalEventCatalog`, `createLocalEventReplayBatches`, and `createLocalEventCatalogFixtureFetch`. |
| CLI | `packages/cli/src/localEvents.ts` provides `local-events catalog inspect` and `local-events catalog replay` for local JSON catalogs. |
| Web | `apps/web/src/localEventCatalog.ts` builds view state with `buildLocalEventCatalogState`, `filterCanonicalLocalEvents`, and `summarizeLocalEvents`. |
| Sync | `services/sync/src/replay.ts` provides `replayAcceptedEvents`, `detectReplayIntegrityIssues`, and `createReplayAuditSummary`. |

Run local catalog replay from the repository root:

```powershell
node packages\cli\src\index.ts local-events catalog inspect --input-path examples\local-events\catalog.json
node packages\cli\src\index.ts local-events catalog replay --input-path examples\local-events\catalog.json --from-sequence 1 --limit 5
```

## Encryption And Local Boundary

- Export payload bytes are represented as ciphertext-only metadata.
- Cleartext metadata is limited to ids, cursors, digests, schema versions,
  counts, and redaction metadata.
- Imports stage and verify batches locally before applying replay state.
- Examples use `fixture://local-events/`, `local://`, `workspace://`, and
  repository-relative paths only.
- No remote URLs, hosted services, credentials, or global installs are required.

## Audit And Replay Checks

Replay integrations should block import when any required check fails:

- Catalog schema validation must pass before batch staging.
- `previousDigest` and `finalDigest` must match the canonical digest chain.
- Cursor windows must move forward from `cur_v1:0000000000000000:origin`.
- Duplicate event ids are accepted only when the digest already matches.
- Audit output should include redaction counts and safe field paths, not removed
  values.

## Validation

Run the focused docs and fixture checks from the repository root:

```powershell
python -m json.tool examples\local-events\export-session.json
python -m json.tool examples\local-events\import-plan.json
python -m unittest tests.test_local_event_replay_integrations_docs
```
