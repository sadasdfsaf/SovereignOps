import assert from "node:assert/strict";
import test from "node:test";

import {
  LocalEventCatalogValidationError,
  createLocalEventCatalogFixtureFetch,
  createLocalEventReplayBatches,
  loadLocalEventCatalogFixture,
  loadLocalEventCatalogFixtureSet,
  loadLocalEventFixtureCatalog,
  summarizeLocalEventCatalog,
  validateLocalEventCatalogFixture,
} from "../src/index.ts";

test("loads and validates checked-in canonical local event fixtures", () => {
  const fixtureCatalog = loadLocalEventFixtureCatalog();
  const fixtureSet = loadLocalEventCatalogFixtureSet({ includeInvalid: true });
  const catalog = loadLocalEventCatalogFixture();

  assert.equal(fixtureCatalog.version, 1);
  assert.deepEqual(fixtureCatalog.fixtures.map((entry) => [entry.fixture, entry.valid]), [
    ["canonical-events.valid.json", true],
    ["canonical-events.invalid.json", false],
  ]);
  assert.deepEqual(fixtureSet.map((entry) => [entry.fixture, entry.expectedValid, entry.ok]), [
    ["canonical-events.valid.json", true, true],
    ["canonical-events.invalid.json", false, false],
  ]);
  assert.equal(fixtureSet[0].catalog.events.length, 6);
  assert.equal(fixtureSet[1].issues.length > 0, true);
  assert.equal(catalog.workspaceId, "wsp_local_fixtures");
  assert.equal(catalog.events.length, 6);
  assert.equal(Object.isFrozen(catalog), true);
  assert.equal(Object.isFrozen(catalog.events[0].payload), true);
  assert.throws(
    () => {
      catalog.events[0].id = "evt_mutated";
    },
    TypeError,
  );
});

test("surfaces schema validation issues through SDK helper errors", () => {
  assert.throws(
    () => validateLocalEventCatalogFixture({ schemaVersion: "wrong" }, "inline"),
    (error) => {
      assert.equal(error instanceof LocalEventCatalogValidationError, true);
      assert.equal(error.source, "inline");
      assert.ok(error.issues.some((issue) => issue.path === "schemaVersion"));
      assert.ok(error.issues.some((issue) => issue.path === "events"));
      return true;
    },
  );
});

test("summarizes canonical local events by operation and schema kind", () => {
  const summary = summarizeLocalEventCatalog(loadLocalEventCatalogFixture());

  assert.equal(summary.workspaceId, "wsp_local_fixtures");
  assert.equal(summary.generatedAt, "2026-04-27T10:30:00.000Z");
  assert.equal(summary.eventCount, 6);
  assert.equal(summary.firstSequence, 1);
  assert.equal(summary.lastSequence, 6);
  assert.equal(summary.redactedEventCount, 2);
  assert.equal(summary.redactedFieldCount, 2);
  assert.deepEqual(summary.operations, {
    append: 2,
    update: 1,
    delete: 1,
    approval_requested: 1,
    approval_approved: 1,
    approval_rejected: 0,
  });
  assert.deepEqual(summary.schemaKinds, {
    docs: 2,
    projects: 0,
    incidents: 0,
    comments: 1,
    attachments: 1,
    approvals: 2,
  });
  assert.deepEqual(
    summary.operationSchemaKinds.map((entry) => [entry.operation, entry.schemaKind, entry.count]),
    [
      ["append", "docs", 1],
      ["append", "comments", 1],
      ["update", "docs", 1],
      ["delete", "attachments", 1],
      ["approval_requested", "approvals", 1],
      ["approval_approved", "approvals", 1],
    ],
  );
  assert.deepEqual(summary.actorIds, ["act_local_author", "act_local_reviewer"]);
  assert.deepEqual(summary.recordIds, [
    "apv_release_notes",
    "att_temp_preview",
    "cmt_release_review",
    "doc_release_notes",
  ]);
});

test("creates deterministic replay batches with stable filters", () => {
  const catalog = loadLocalEventCatalogFixture();
  const batches = createLocalEventReplayBatches(catalog, { batchSize: 2 });
  const repeated = createLocalEventReplayBatches(catalog, { batchSize: 2 });
  const approvalBatches = createLocalEventReplayBatches(catalog, {
    batchSize: 1,
    schemaKinds: ["approvals"],
  });

  assert.deepEqual(batches.map((batch) => [batch.batchIndex, batch.eventCount, batch.firstSequence, batch.lastSequence]), [
    [1, 2, 1, 2],
    [2, 2, 3, 4],
    [3, 2, 5, 6],
  ]);
  assert.deepEqual(
    batches.map((batch) => batch.batchId),
    repeated.map((batch) => batch.batchId),
  );
  assert.match(batches[0].batchId, /^local_event_replay_001_1_2_[a-z0-9]+$/);
  assert.equal(batches[0].previousDigest, null);
  assert.equal(batches[0].operations.append, 1);
  assert.equal(batches[0].operations.update, 1);
  assert.deepEqual(approvalBatches.map((batch) => [batch.firstSequence, batch.lastSequence]), [
    [5, 5],
    [6, 6],
  ]);
  assert.throws(
    () => {
      batches[0].events[0].id = "evt_mutated";
    },
    TypeError,
  );
  assert.throws(
    () => createLocalEventReplayBatches(catalog, { batchSize: 0 }),
    /batchSize must be a positive integer/,
  );
  assert.throws(
    () => createLocalEventReplayBatches(catalog, { operations: ["missing"] }),
    /operations must only contain/,
  );
});

test("serves catalog, summary, and replay batches through a fixture fetch", async () => {
  const catalog = loadLocalEventCatalogFixture();
  const fetch = createLocalEventCatalogFixtureFetch(catalog);

  const catalogResponse = await fetch("http://127.0.0.1:7317/v1/local-events/catalog", {
    method: "GET",
  });
  const summaryResponse = await fetch("http://127.0.0.1:7317/v1/local-events/summary", {
    method: "get",
  });
  const replayResponse = await fetch("http://127.0.0.1:7317/v1/local-events/replay-batches?batchSize=2&schemaKind=approvals", {
    method: "GET",
  });

  assert.equal(catalogResponse.ok, true);
  assert.equal(catalogResponse.status, 200);
  assert.equal(catalogResponse.headers?.get("content-type"), "application/json");
  assert.equal((await catalogResponse.json()).events.length, 6);
  assert.equal((await summaryResponse.json()).operations.append, 2);
  assert.deepEqual(
    (await replayResponse.json()).batches.map((batch) => [batch.firstSequence, batch.lastSequence]),
    [[5, 6]],
  );
  assert.deepEqual(fetch.calls.map((call) => [call.method, call.route, call.status]), [
    ["GET", "catalog", 200],
    ["GET", "summary", 200],
    ["GET", "replayBatches", 200],
  ]);

  const methodMismatch = await fetch("http://127.0.0.1:7317/v1/local-events/catalog", {
    method: "POST",
  });
  const badQuery = await fetch("http://127.0.0.1:7317/v1/local-events/replay-batches?batchSize=0", {
    method: "GET",
  });

  assert.equal(methodMismatch.status, 405);
  assert.equal((await methodMismatch.json()).error.code, "local_event_fixture_method_mismatch");
  assert.equal(badQuery.status, 400);
  assert.equal((await badQuery.json()).error.code, "local_event_fixture_query_invalid");
});
