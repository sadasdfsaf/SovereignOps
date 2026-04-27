# Local Event Catalog

The local event catalog is the shared contract for replayable workspace changes. It
keeps SDK, CLI, Web, API, and sync fixtures aligned around one canonical event
shape without exposing record bodies in durable examples.

## Contract

`packages/schemas/src/eventCatalog.ts` owns the canonical runtime checks. The
public fixture in `examples/local-events/catalog.json` uses the exported
`canonical-local-event-catalog/v1` shape:

- `schemaVersion` is `canonical-local-event-catalog/v1` for a catalog and
  `canonical-local-event/v1` for each event.
- `localOnly` is always `true`; catalog data is for local replay and sync
  staging, not a remote source of truth.
- `sequence` is one-based and contiguous within a catalog.
- `payloadDigest` is the sha256 digest of the canonical JSON payload.
- `previousDigest` links each event to the canonical digest of the prior event.
- `operation` is one of `append`, `update`, `delete`, `approval_requested`,
  `approval_approved`, or `approval_rejected`.
- `payload.schemaKind` uses the shared record families `docs`, `projects`,
  `incidents`, `comments`, `attachments`, or `approvals`.

The catalog fixture intentionally stores summaries, ids, digests, changed field
names, and redaction metadata. It does not store document text, comment bodies,
or approval reason text.

## Layer Handoff

| Layer | Contract use |
| --- | --- |
| SDK | `packages/sdk-js` keeps the local result shape stable with `ok`, `error.code`, and issue details while clients append and list events. |
| CLI | `packages/cli/src/commands.ts` accepts JSON through `ingest event --payload-json -`; the replay fixture records the argv shape and stdin reference. |
| Web | `apps/web/src/documents.ts` emits local document events, while `apps/web/src/auditTimeline.ts` renders safe timeline fields from canonical events. |
| API | `packages/schemas/src/apiError.ts` defines the `api-error/v1` envelope used when catalog or replay validation fails. |
| Sync | `services/sync/src/replay.ts` consumes accepted event envelopes with `cur_v1` cursors and emits redacted replay audit summaries. |

The handoff rule is simple: SDK, CLI, and Web may create local event envelopes,
but the catalog fixture is the compatibility source for canonical field names,
operation rules, redaction metadata, and replay cursor expectations.

## API Errors

Catalog validation errors use the shared API error envelope rather than a custom
fixture-only format. `examples/local-events/replay-session.json` includes an
`apiErrors[0].response` example with:

- `schemaVersion: "api-error/v1"`.
- `error.code: "validation_failed"` with status `422`.
- `requestId` using the `req_` prefix.
- Sorted `issues` entries with stable `code`, `path`, `message`, `expected`, and
  `received` fields.

Replay tools should preserve these machine-readable fields even when user-facing
messages change.

## Redaction Metadata

Every canonical event includes `redactionMetadata`:

- `redacted` is `true` only when at least one field path was removed.
- `redactedFieldCount` matches the length of `redactedPaths`.
- `redactedPaths` stores safe field paths such as `payload.after.body`, never the
  removed value.
- `retainedMetadataKeys` names safe metadata keys that remain useful for search,
  timeline grouping, and replay checks.

Redaction metadata travels through the sync replay fixture under
`sync.acceptedEvents[].payload.redactionMetadata` so replay code can audit what
was withheld without seeing withheld content.

## Replay Fixtures

`examples/local-events/replay-session.json` connects the catalog to local replay:

- `catalog.eventIds` lists the canonical events in order and must match
  `catalog.json`.
- `sdk.entrypoints` names the SDK calls that can create or read local event
  streams.
- `cli.argv` records the command shape that sends one canonical event over stdin.
- `web.timelineFields` lists the event fields safe for timeline rendering.
- `sync.acceptedEvents` wraps each canonical event id in a sync envelope with a
  `cur_v1` cursor.
- `sync.nextCursor` points at the final accepted event.
- `apiErrors` gives the error shape for failed validation before replay starts.

The sync payload carries catalog ids, operation names, payload digests, and
redaction metadata. It does not duplicate redacted record bodies.

## Change Checklist

When changing the local event catalog contract:

1. Update `packages/schemas/src/eventCatalog.ts` and the generated schema
   fixtures if the wire shape changes.
2. Refresh `examples/local-events/catalog.json` with deterministic digests and a
   valid `previousDigest` chain.
3. Refresh `examples/local-events/replay-session.json` so SDK, CLI, Web, API, and
   sync references still point at the same event ids.
4. Keep examples limited to synthetic ids, summaries, digests, sorted safe paths,
   and redaction metadata.
5. Run the focused Python validation before broader checks.

## Validation

Run the focused doc and fixture check from the repository root:

```powershell
python -m unittest tests.test_local_event_catalog_docs
```
