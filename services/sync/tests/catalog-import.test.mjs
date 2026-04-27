import assert from "node:assert/strict";
import test from "node:test";

import {
  createCatalogImportPlan,
  importEventReplayCatalog,
  reconcileEventReplayCatalog,
} from "../src/catalogImport.ts";
import { INITIAL_CURSOR, formatCursor } from "../src/cursors.ts";
import {
  CANONICAL_LOCAL_EVENT_SCHEMA_VERSION,
  calculateCanonicalLocalEventDigest,
  calculateCanonicalLocalEventPayloadDigest,
  calculateEventReplayCatalogDigest,
  createEventReplayCatalog,
} from "../src/eventCatalog.ts";
import { createInMemorySyncRepository } from "../src/repository.ts";

const workspaceId = "wsp_alpha";
const deviceId = "dev_catalog";
const actorId = "act_writer";

test("builds deterministic catalog import plans and imports accepted events", () => {
  const repository = createInMemorySyncRepository();
  const firstCatalog = catalog([
    { id: "evt_alpha_001", operation: "append", title: "Notebook alpha", privateText: "Hidden notebook text" },
    { id: "evt_alpha_002", operation: "update", title: "Notebook beta", privateText: "Hidden beta text" },
  ]);
  const reorderedCatalog = catalog([
    {
      id: "evt_alpha_001",
      operation: "append",
      title: "Notebook alpha",
      privateText: "Hidden notebook text",
      extraFirst: true,
    },
    {
      id: "evt_alpha_002",
      operation: "update",
      title: "Notebook beta",
      privateText: "Hidden beta text",
      extraFirst: true,
    },
  ]);

  const firstPlan = assertOk(createCatalogImportPlan(repository, firstCatalog));
  const reorderedPlan = assertOk(createCatalogImportPlan(repository, reorderedCatalog));

  assert.equal(firstPlan.catalog.digest, reorderedPlan.catalog.digest);
  assert.equal(firstPlan.uploadBatch.checksum, reorderedPlan.uploadBatch.checksum);
  assert.deepEqual(firstPlan.summary, reorderedPlan.summary);
  assert.equal(firstPlan.summary.eventCount, 2);
  assert.equal(firstPlan.summary.events[0].eventId, "evt_..._001");
  assert.equal(firstPlan.summary.events[0].redacted, true);
  assert.equal(firstPlan.summary.events[0].redactedFieldCount, 1);

  const imported = assertOk(importEventReplayCatalog(repository, firstCatalog));
  assert.equal(imported.receipt.nextCursor, formatCursor({ position: 2, eventId: "evt_alpha_002" }));
  assert.deepEqual(
    repository.snapshot().events.map((event) => [event.id, event.cursor, event.type]),
    [
      ["evt_alpha_001", formatCursor({ position: 1, eventId: "evt_alpha_001" }), "canonical.append"],
      ["evt_alpha_002", formatCursor({ position: 2, eventId: "evt_alpha_002" }), "canonical.update"],
    ],
  );

  const serializedSummary = JSON.stringify(imported.summary);
  assert.equal(serializedSummary.includes("Hidden notebook text"), false);
  assert.equal(serializedSummary.includes("Hidden beta text"), false);
  assert.equal(serializedSummary.includes(actorId), false);
  assert.equal(serializedSummary.includes("evt_alpha_001"), false);
});

test("rejects stale catalog base cursors before upload", () => {
  const repository = createInMemorySyncRepository();
  const firstImport = assertOk(
    importEventReplayCatalog(
      repository,
      catalog([{ id: "evt_alpha_001", operation: "append", title: "Notebook alpha" }]),
    ),
  );

  const result = createCatalogImportPlan(
    repository,
    catalog([{ id: "evt_alpha_002", operation: "update", title: "Notebook beta", privateText: "Stale body" }]),
  );

  const error = assertError(result, "stale_cursor");
  assert.equal(error.baseCursor, INITIAL_CURSOR);
  assert.equal(error.remoteCursor, firstImport.receipt.nextCursor);
  assert.equal(error.reconciliation.latestCursor, "cur_v1:0000000000000001:evt_..._001");
  assert.equal(JSON.stringify(error.reconciliation).includes("Stale body"), false);
  assert.equal(repository.snapshot().events.length, 1);
});

test("reconciliation blocks duplicate catalog events already accepted in a workspace", () => {
  const repository = createInMemorySyncRepository();
  const firstImport = assertOk(
    importEventReplayCatalog(
      repository,
      catalog([{ id: "evt_alpha_001", operation: "append", title: "Notebook alpha" }]),
    ),
  );
  const duplicateCatalogInput = catalog(
    [{ id: "evt_alpha_001", operation: "update", title: "Notebook duplicate" }],
    { baseCursor: firstImport.receipt.nextCursor },
  );
  const duplicateCatalog = createEventReplayCatalog(duplicateCatalogInput);

  const reconciliation = reconcileEventReplayCatalog(repository, duplicateCatalog);
  assert.equal(reconciliation.status, "blocked");
  assert.deepEqual(reconciliation.duplicateEventIds, ["evt_alpha_001"]);
  assert.deepEqual(
    reconciliation.summary.issues.map((issue) => [issue.code, issue.eventId, issue.remoteCursor]),
    [["duplicate_event", "evt_..._001", "cur_v1:0000000000000001:evt_..._001"]],
  );

  const error = assertError(createCatalogImportPlan(repository, duplicateCatalogInput), "duplicate_event");
  assert.equal(error.eventId, "evt_alpha_001");
  assert.equal(repository.snapshot().events.length, 1);
});

test("rejects invalid canonical catalogs without mutating the repository", () => {
  const repository = createInMemorySyncRepository();
  const invalidCatalog = catalog([
    { id: "evt_alpha_001", operation: "append", title: "Notebook alpha", privateText: "Tampered body" },
  ]);
  invalidCatalog.events[0].payload.privateText = "Changed after digest";

  const error = assertError(createCatalogImportPlan(repository, invalidCatalog), "validation_failed");
  assert.equal(error.validationIssues.some((issue) => issue.path === "events[0].payloadDigest"), true);
  assert.equal(JSON.stringify(error).includes("Changed after digest"), false);
  assert.equal(repository.snapshot().events.length, 0);
});

function catalog(definitions, options = {}) {
  const selectedWorkspaceId = options.workspaceId ?? workspaceId;
  const baseCursor = options.baseCursor ?? INITIAL_CURSOR;
  const events = canonicalEvents(definitions, { workspaceId: selectedWorkspaceId });

  return {
    workspaceId: selectedWorkspaceId,
    deviceId: options.deviceId ?? deviceId,
    baseCursor,
    digest: calculateEventReplayCatalogDigest({
      workspaceId: selectedWorkspaceId,
      baseCursor,
      events,
    }),
    events,
  };
}

function canonicalEvents(definitions, options = {}) {
  let previousDigest = null;
  const selectedWorkspaceId = options.workspaceId ?? workspaceId;

  return definitions.map((definition, index) => {
    const payload = definition.extraFirst
      ? {
          extra: { b: 2, a: 1 },
          privateText: definition.privateText ?? `Private note ${index + 1}`,
          title: definition.title,
          noteId: `note_${String(index + 1).padStart(3, "0")}`,
        }
      : {
          noteId: `note_${String(index + 1).padStart(3, "0")}`,
          title: definition.title,
          privateText: definition.privateText ?? `Private note ${index + 1}`,
          extra: { a: 1, b: 2 },
        };
    const event = {
      schemaVersion: CANONICAL_LOCAL_EVENT_SCHEMA_VERSION,
      id: definition.id,
      workspaceId: selectedWorkspaceId,
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
        redacted: true,
        redactedFieldCount: 1,
        redactedPaths: ["privateText"],
        retainedMetadataKeys: ["client"],
      },
    };

    previousDigest = calculateCanonicalLocalEventDigest(event);
    return event;
  });
}

function assertOk(result) {
  if (!result.ok) {
    assert.fail(JSON.stringify(result.error));
  }
  return result.value;
}

function assertError(result, code) {
  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail(`expected ${code} but received success`);
  }
  assert.equal(result.error.code, code);
  return result.error;
}
