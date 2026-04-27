# Local Event Acceptance

This public acceptance guide ties the local event API, SDK fake-fetch client,
CLI export and import plan, Web state, and sync catalog readiness into one
local-first check. It is a guide for replaying checked-in fixtures from the
repository root without remote URLs, hosted services, or durable record bodies.

## Scope

- `examples/local-events/acceptance-session.json` is the compact acceptance
  ledger for the local event path.
- `examples/local-events/api-requests.json` supplies route request and response
  excerpts for fixture replay.
- `examples/local-events/sdk-session.json` supplies the fake-fetch SDK flow and
  cross-layer handoff fields.
- `examples/local-events/export-session.json` and
  `examples/local-events/import-plan.json` supply export and import planning
  evidence.
- `examples/local-events/catalog.json` remains the canonical catalog source.
- Acceptance output uses ids, cursors, digests, counts, redaction metadata, and
  repository-relative paths. It does not store record bodies.

## Acceptance Session

`docs/local-event-acceptance.md` and
`examples/local-events/acceptance-session.json` record a single pass over the
local event stack:

- `schemaVersion: "local-event-acceptance-session/v1"`.
- `localOnly: true` and `network.mode: "disabled"`.
- `catalog.eventIds` mirrors the canonical catalog order.
- `gates` lists the acceptance checks in the order they should be reviewed.
- `validationCommands` names the focused JSON and Python checks for this guide.

## API Fixture Replay

API acceptance replays `examples/local-events/api-requests.json` against the
loopback fixture contract documented in `docs/local-event-api.md`:

- The only API base is `http://127.0.0.1:7317`.
- Routes stay limited to `GET /v1/local-events/catalog`,
  `GET /v1/local-events/summary`, and
  `GET /v1/local-events/replay-batches`.
- Every route returns status `200` for the checked-in catalog fixture.
- Replay batches preserve event order, `payloadDigest`, `previousDigest`,
  `finalDigest`, and `cur_v1` cursor readiness.

## SDK Fake-Fetch Replay

SDK acceptance uses `packages/sdk-js/src/localEvents.ts` and the session fixture
in `examples/local-events/sdk-session.json`:

- `loadLocalEventCatalogFixture` loads the repository-relative catalog path.
- `summarizeLocalEventCatalog` reports event, redaction, operation, and schema
  kind counts.
- `createLocalEventReplayBatches` produces deterministic batches with the same
  event ids as the API replay fixture.
- `createLocalEventCatalogFixtureFetch` handles the local fake-fetch calls and
  records `200` responses for catalog, summary, and replay batch routes.

## CLI Export And Import Planning

CLI acceptance stays plan-oriented and local:

- `packages/cli/src/localEventExports.ts` supports `jsonl`, `csv`, and
  `package` export shapes.
- `packages/cli/src/localEvents.ts` reads the same canonical catalog replay
  output used by the SDK and API fixtures.
- `examples/local-events/export-session.json` keeps sealed export metadata and
  `ciphertext-only` payload handling.
- `examples/local-events/import-plan.json` stages batches with `dryRun: true`,
  verifies catalog links, verifies digest chains, verifies cursor windows, and
  blocks apply when an integrity check fails.

## Web Acceptance State

Web acceptance verifies that `apps/web/src/localEventCatalog.ts` can render the
same catalog summary without exposing record bodies:

- `buildLocalEventCatalogState` produces the state object.
- `filterCanonicalLocalEvents` keeps route and view filters aligned.
- `summarizeLocalEvents` keeps operation, schema kind, redaction, and replay
  readiness counts stable.
- The acceptance state records `totalCount: 5`, `visibleCount: 2`, visible event
  ids `evt_catalog_002` and `evt_catalog_004`, and three open redactions.

## Sync Catalog Readiness

Sync acceptance uses `services/sync/src/replay.ts` readiness fields:

- `replayAcceptedEvents` returns a cursor window from
  `cur_v1:0000000000000000:origin` to
  `cur_v1:0000000000000005:evt_catalog_005`.
- `detectReplayIntegrityIssues` must report status `ok` with zero blocking and
  warning issues for the checked-in catalog.
- `createReplayAuditSummary` keeps event count, cursor shape, issue codes, and
  event references while redacting identifiers.
- Accepted event ids must match the catalog event ids exactly.

## Local-First Checks

Acceptance is complete when:

- All referenced paths are repository-relative and point to checked-in files.
- HTTP values use loopback only.
- Network access stays disabled for export and import planning.
- Payload handling stays `ciphertext-only` whenever export bytes would otherwise
  be durable.
- Record bodies and removed values are not copied into durable examples.

## Validation Commands

Run the focused checks from the repository root:

```powershell
python -m json.tool examples\local-events\acceptance-session.json
python -m unittest tests.test_local_event_acceptance_docs
```
