import assert from "node:assert/strict";
import test from "node:test";

import {
  AUDIT_EXPORT_ERROR_CODES,
  createLocalEventReplayExportManifest,
  createLocalEventReplayExportPackage,
  filterLocalEventReplayExportRecords,
  fingerprintLocalEventReplayExportRecord,
  normalizeLocalEventReplayExportRecords,
  renderLocalEventReplayCsv,
  renderLocalEventReplayJsonl,
} from "../src/index.ts";
import {
  CANONICAL_LOCAL_EVENT_SCHEMA_VERSION,
  calculateCanonicalLocalEventDigest,
  calculateCanonicalLocalEventPayloadDigest,
  calculateEventReplayCatalogDigest,
  createEventReplayCatalog,
} from "../../../services/sync/src/eventCatalog.ts";
import { INITIAL_CURSOR } from "../../../services/sync/src/cursors.ts";

const secretValue = "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJyZXBsYXkifQ.signaturepart";
const workspaceId = "wsp_localReplayAudit";
const deviceId = "dev_replay_export";
const actorId = "act_replay_user";
const canonicalEvents = createCanonicalEvents();
const catalogDigest = calculateEventReplayCatalogDigest({
  workspaceId,
  baseCursor: INITIAL_CURSOR,
  events: canonicalEvents,
});
const canonicalCatalog = Object.freeze({
  workspaceId,
  deviceId,
  baseCursor: INITIAL_CURSOR,
  digest: catalogDigest,
  events: canonicalEvents,
});
const replayCatalog = createEventReplayCatalog(canonicalCatalog);

test("normalizes canonical replay catalog events into deterministic export records", () => {
  const records = normalizeLocalEventReplayExportRecords(canonicalCatalog);

  assert.equal(records.length, 2);
  assert.deepEqual(
    records.map((record) => record.recordType),
    ["canonical_event", "canonical_event"],
  );
  assert.deepEqual(
    records.map((record) => record.eventId),
    ["evt_local_alpha", "evt_local_beta"],
  );
  assert.deepEqual(
    records.map((record) => record.operation),
    ["append", "update"],
  );
  assert.equal(records[0].workspaceId, workspaceId);
  assert.equal(records[0].deviceId, deviceId);
  assert.equal(records[0].catalogDigest, catalogDigest);
  assert.equal(records[0].metadata.payload.token, "[REDACTED]");
  assert.match(records[0].fingerprint, /^fnv1a64:[0-9a-f]{16}$/);
  assert.throws(() => {
    records[0].metadata.payload.title = "changed";
  }, TypeError);
});

test("normalizes event catalog summaries and synced replay rows", () => {
  const records = normalizeLocalEventReplayExportRecords(replayCatalog);
  const summary = records.find((record) => record.recordType === "replay_summary");
  const synced = records.filter((record) => record.recordType === "synced_event");

  assert.equal(records.length, 3);
  assert.equal(summary.eventCount, 2);
  assert.equal(summary.integrityStatus, "ok");
  assert.equal(summary.hasMore, false);
  assert.equal(summary.catalogDigest, catalogDigest);
  assert.equal(summary.metadata.digest, catalogDigest);
  assert.equal(synced.length, 2);
  assert.deepEqual(
    synced.map((record) => record.cursor),
    [
      "cur_v1:0000000000000001:evt_local_alpha",
      "cur_v1:0000000000000002:evt_local_beta",
    ],
  );
});

test("renders local replay JSONL and CSV without sensitive metadata", () => {
  const jsonl = renderLocalEventReplayJsonl(canonicalCatalog);
  const csv = renderLocalEventReplayCsv(canonicalCatalog);
  const jsonRows = jsonl.split("\n").map((line) => JSON.parse(line));

  assert.equal(jsonRows.length, 2);
  assert.equal(jsonRows[0].metadata.payload.token, "[REDACTED]");
  assert.equal(jsonl.includes(secretValue), false);
  assert.equal(csv.includes(secretValue), false);
  assert.equal(csv.split("\n")[0], [
    "recordId",
    "recordType",
    "workspaceId",
    "deviceId",
    "catalogDigest",
    "eventId",
    "sequence",
    "operation",
    "cursor",
    "timestamp",
    "eventCount",
    "integrityStatus",
    "hasMore",
    "metadata",
    "fingerprint",
  ].join(","));
  assert.equal(csv.includes("[REDACTED]"), true);
});

test("escapes spreadsheet formula prefixes in local replay CSV cells", () => {
  const formulaEvent = canonicalEvent({
    id: "evt_formula",
    sequence: 3,
    operation: "+replay",
    occurredAt: "2026-04-27T04:00:03.000Z",
    recordedAt: "2026-04-27T04:00:04.000Z",
    payload: {
      title: "Formula payload",
      formula: "=cmd",
      nested: {
        tabPrefix: "\tcmd",
      },
    },
    previousDigest: calculateCanonicalLocalEventDigest(canonicalEvents[1]),
  });
  const csv = renderLocalEventReplayCsv([formulaEvent]);
  const row = csv.split("\n")[1];

  assert.equal(row.includes(",'+replay,"), true);
  assert.equal(row.includes("\"\"formula\"\":\"\"'=cmd\"\""), true);
  assert.equal(row.includes("\"\"tabPrefix\"\":\"\"'\\tcmd\"\""), true);
  assert.equal(row.includes(",+replay,"), false);
});

test("creates deterministic local replay packages and manifests", () => {
  const first = createLocalEventReplayExportPackage([canonicalEvents[1], replayCatalog.summary, canonicalEvents[0]], {
    createdAt: "2026-04-27T05:00:00.000Z",
  });
  const second = createLocalEventReplayExportPackage([canonicalEvents[0], canonicalEvents[1], replayCatalog.summary], {
    createdAt: "2026-04-27T05:00:00.000Z",
  });
  const manifest = createLocalEventReplayExportManifest(canonicalCatalog, {
    createdAt: "2026-04-27T05:00:00.000Z",
  });

  assert.equal(first.manifest.exportId, second.manifest.exportId);
  assert.equal(first.manifest.fingerprint, second.manifest.fingerprint);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(first.manifest.recordCount, 3);
  assert.deepEqual(first.manifest.recordTypes, ["canonical_event", "replay_summary"]);
  assert.equal(manifest.recordCount, 2);
  assert.deepEqual(manifest.catalogDigests, [catalogDigest]);
  assert.equal(manifest.firstTimestamp, "2026-04-27T04:00:01.000Z");
  assert.equal(manifest.lastTimestamp, "2026-04-27T04:00:02.000Z");
  assert.equal(manifest.csv.columns.length, 15);
});

test("filters replay export records by operation, type, workspace, digest, and time", () => {
  const filtered = filterLocalEventReplayExportRecords(replayCatalog, {
    recordType: "synced_event",
    operation: "update",
    workspaceId,
    catalogDigest,
    from: "2026-04-27T04:00:02.000Z",
    to: "2026-04-27T04:00:02.000Z",
  });

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].eventId, "evt_local_beta");
  assert.equal(filtered[0].recordType, "synced_event");
  assert.throws(
    () => filterLocalEventReplayExportRecords(replayCatalog, {
      recordType: "other",
    }),
    (error) => {
      assert.equal(error.code, AUDIT_EXPORT_ERROR_CODES.INVALID_FILTER);
      return true;
    },
  );
});

test("fingerprints one normalized replay record and rejects ambiguous inputs", () => {
  const fingerprint = fingerprintLocalEventReplayExportRecord(canonicalEvents[0]);

  assert.match(fingerprint, /^fnv1a64:[0-9a-f]{16}$/);
  assert.throws(
    () => fingerprintLocalEventReplayExportRecord(canonicalCatalog),
    (error) => {
      assert.equal(error.code, AUDIT_EXPORT_ERROR_CODES.INVALID_EVENT);
      return true;
    },
  );
});

function createCanonicalEvents() {
  const first = canonicalEvent({
    id: "evt_local_alpha",
    sequence: 1,
    operation: "append",
    occurredAt: "2026-04-27T04:00:00.000Z",
    recordedAt: "2026-04-27T04:00:01.000Z",
    payload: {
      title: "Project notes",
      token: secretValue,
    },
    previousDigest: null,
  });
  const second = canonicalEvent({
    id: "evt_local_beta",
    sequence: 2,
    operation: "update",
    occurredAt: "2026-04-27T04:00:01.000Z",
    recordedAt: "2026-04-27T04:00:02.000Z",
    payload: {
      title: "Project notes",
      status: "ready",
    },
    previousDigest: calculateCanonicalLocalEventDigest(first),
  });

  return Object.freeze([first, second]);
}

function canonicalEvent({
  id,
  sequence,
  operation,
  occurredAt,
  recordedAt,
  payload,
  previousDigest,
}) {
  return Object.freeze({
    schemaVersion: CANONICAL_LOCAL_EVENT_SCHEMA_VERSION,
    id,
    workspaceId,
    actorId,
    sequence,
    occurredAt,
    recordedAt,
    localOnly: true,
    operation,
    payload,
    payloadDigest: calculateCanonicalLocalEventPayloadDigest(payload),
    previousDigest,
    redactionMetadata: {
      redacted: false,
      redactedFieldCount: 0,
      redactedPaths: [],
      retainedMetadataKeys: ["title"],
    },
  });
}
