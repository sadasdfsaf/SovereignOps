import assert from "node:assert/strict";
import test from "node:test";

import { INITIAL_CURSOR, formatCursor } from "../src/cursors.ts";
import {
  CANONICAL_LOCAL_EVENT_SCHEMA_VERSION,
  calculateCanonicalLocalEventDigest,
  calculateCanonicalLocalEventPayloadDigest,
  calculateEventReplayCatalogDigest,
  createEventReplayCatalog,
  validateEventReplayCatalog,
} from "../src/eventCatalog.ts";

const workspaceId = "wsp_alpha";
const deviceId = "dev_catalog";
const actorId = "act_writer";

test("creates replay summaries from canonical local event catalogs", () => {
  const events = canonicalEvents([
    { id: "evt_alpha_001", operation: "append", summary: "Create draft" },
    { id: "evt_alpha_002", operation: "update", summary: "Update title" },
  ]);
  const digest = calculateEventReplayCatalogDigest({
    workspaceId,
    baseCursor: INITIAL_CURSOR,
    events,
  });

  const catalog = createEventReplayCatalog({
    workspaceId,
    deviceId,
    baseCursor: INITIAL_CURSOR,
    digest,
    events,
  });

  assert.equal(catalog.digest, digest);
  assert.equal(catalog.nextCursor, formatCursor({ position: 2, eventId: "evt_alpha_002" }));
  assert.deepEqual(
    catalog.events.map((event) => [event.id, event.cursor, event.type]),
    [
      ["evt_alpha_001", formatCursor({ position: 1, eventId: "evt_alpha_001" }), "canonical.append"],
      ["evt_alpha_002", formatCursor({ position: 2, eventId: "evt_alpha_002" }), "canonical.update"],
    ],
  );
  assert.deepEqual(catalog.replay.integrity, {
    status: "ok",
    issueCount: 0,
    blockingCount: 0,
    warningCount: 0,
    codes: [],
  });
  assert.equal(catalog.summary.digest, digest);
  assert.equal(catalog.summary.eventCount, 2);
  assert.equal(catalog.summary.nextCursor, "cur_v1:0000000000000002:evt_..._002");
  assert.equal(catalog.summary.events[0].type, "canonical.append");
  assert.equal(catalog.summary.lastEventDigest, calculateCanonicalLocalEventDigest(events[1]));

  const serializedSummary = JSON.stringify(catalog.summary);
  assert.equal(serializedSummary.includes("Create draft"), false);
  assert.equal(serializedSummary.includes("act_writer"), false);

  catalog.events[0].payload.payload.summary = "Mutated outside";
  assert.equal(events[0].payload.summary, "Create draft");
});

test("validates payload digest, event order, and workspace boundaries", () => {
  const events = canonicalEvents([
    { id: "evt_alpha_001", operation: "append", summary: "Create draft" },
    { id: "evt_alpha_002", operation: "update", summary: "Update title" },
  ]);
  const invalidEvents = cloneJson(events);
  invalidEvents[0].previousDigest = "0".repeat(64);
  invalidEvents[1].workspaceId = "wsp_beta";
  invalidEvents[1].sequence = 3;
  invalidEvents[1].payload.summary = "Tampered title";

  const result = validateEventReplayCatalog({
    workspaceId,
    deviceId,
    baseCursor: INITIAL_CURSOR,
    events: invalidEvents,
  });

  assert.equal(result.ok, false);
  assert.deepEqual(issuePaths(result.issues), [
    "events[0].previousDigest",
    "events[1].workspaceId",
    "events[1].sequence",
    "events[1].payloadDigest",
    "events[1].previousDigest",
  ]);
});

test("rejects catalog digest mismatches before replaying events", () => {
  const events = canonicalEvents([
    { id: "evt_alpha_001", operation: "append", summary: "Create draft" },
  ]);
  const digest = `sha256:${"0".repeat(64)}`;
  const result = validateEventReplayCatalog({
    workspaceId,
    deviceId,
    baseCursor: INITIAL_CURSOR,
    digest,
    events,
  });

  assert.equal(result.ok, false);
  assert.deepEqual(issuePaths(result.issues), ["digest"]);
  assert.throws(
    () =>
      createEventReplayCatalog({
        workspaceId,
        deviceId,
        baseCursor: INITIAL_CURSOR,
        digest,
        events,
      }),
    /digest does not match/,
  );
});

test("calculates deterministic canonical payload and catalog digests", () => {
  assert.equal(
    calculateCanonicalLocalEventPayloadDigest({ b: 2, a: 1 }),
    calculateCanonicalLocalEventPayloadDigest({ a: 1, b: 2 }),
  );

  const events = canonicalEvents([
    { id: "evt_alpha_001", operation: "append", summary: "Create draft" },
    { id: "evt_alpha_002", operation: "update", summary: "Update title" },
  ]);
  const reorderedPayloadEvents = canonicalEvents([
    { id: "evt_alpha_001", operation: "append", summary: "Create draft", extraFirst: true },
    { id: "evt_alpha_002", operation: "update", summary: "Update title", extraFirst: true },
  ]);

  assert.equal(
    calculateEventReplayCatalogDigest({ workspaceId, events }),
    calculateEventReplayCatalogDigest({ workspaceId, events: reorderedPayloadEvents }),
  );
});

function canonicalEvents(definitions) {
  let previousDigest = null;

  return definitions.map((definition, index) => {
    const payload = definition.extraFirst
      ? {
          extra: { b: 2, a: 1 },
          summary: definition.summary,
          recordId: `doc_${String(index + 1).padStart(3, "0")}`,
          schemaKind: "docs",
        }
      : {
          schemaKind: "docs",
          recordId: `doc_${String(index + 1).padStart(3, "0")}`,
          summary: definition.summary,
          extra: { a: 1, b: 2 },
        };
    const event = {
      schemaVersion: CANONICAL_LOCAL_EVENT_SCHEMA_VERSION,
      id: definition.id,
      workspaceId,
      actorId,
      sequence: index + 1,
      occurredAt: `2026-04-27T00:0${index}:00.000Z`,
      recordedAt: `2026-04-27T00:0${index}:01.000Z`,
      localOnly: true,
      operation: definition.operation,
      payload,
      payloadDigest: calculateCanonicalLocalEventPayloadDigest(payload),
      previousDigest,
      redactionMetadata: {
        redacted: false,
        redactedFieldCount: 0,
        redactedPaths: [],
        retainedMetadataKeys: ["client"],
      },
    };

    previousDigest = calculateCanonicalLocalEventDigest(event);
    return event;
  });
}

function issuePaths(issues) {
  return issues.map((issue) => issue.path);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
