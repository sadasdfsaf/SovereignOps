import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createLocalEventCatalogRoutes,
  inspectLocalEventCatalog,
  loadWorkspaceLocalEventCatalog,
  mountLocalEventCatalogRoutes,
  replayLocalEventCatalog,
} from "../src/localEventCatalogRoutes.ts";
import { createApiRouter } from "../src/router.ts";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDirectory, "../../..");
const catalogPath = "packages/schemas/fixtures/canonical-events.valid.json";
const invalidCatalogPath = "packages/schemas/fixtures/canonical-events.invalid.json";

test("mounts local event catalog routes with stable paths", () => {
  const router = createApiRouter();

  mountLocalEventCatalogRoutes(router, { workspaceRoot, catalogPath });

  assert.deepEqual(
    router.listRoutes().map((route) => `${route.method} ${route.path}`),
    [
      "GET /v1/local-events/catalog",
      "GET /v1/local-events/replay-batches",
      "GET /v1/local-events/summary",
    ],
  );
});

test("serves canonical local event catalogs and summaries from workspace JSON", async () => {
  const router = createApiRouter(createLocalEventCatalogRoutes({ workspaceRoot, catalogPath }));

  const catalogResponse = await router.dispatch({
    method: "GET",
    path: "/v1/local-events/catalog",
  });
  assertJsonResponse(catalogResponse, 200);
  assert.equal(catalogResponse.body.workspaceId, "wsp_local_fixtures");
  assert.equal(catalogResponse.body.events.length, 6);

  const summaryResponse = await router.dispatch({
    method: "GET",
    path: "/v1/local-events/summary",
    body: {
      catalogPath,
    },
  });
  assertJsonResponse(summaryResponse, 200);
  assert.equal(summaryResponse.body.eventCount, 6);
  assert.equal(summaryResponse.body.operations.append, 2);
  assert.equal(summaryResponse.body.schemaKinds.approvals, 2);
  assert.deepEqual(summaryResponse.body.actorIds, ["act_local_author", "act_local_reviewer"]);
});

test("builds deterministic replay batches with body filters", async () => {
  const router = createApiRouter(createLocalEventCatalogRoutes({ workspaceRoot, catalogPath }));

  const response = await router.dispatch({
    method: "GET",
    path: "/v1/local-events/replay-batches",
    body: {
      batchSize: 2,
      schemaKinds: ["approvals"],
    },
  });

  assertJsonResponse(response, 200);
  assert.deepEqual(
    response.body.batches.map((batch) => [batch.batchIndex, batch.firstSequence, batch.lastSequence]),
    [[1, 5, 6]],
  );
  assert.match(response.body.batches[0].batchId, /^local_event_replay_001_5_6_[a-z0-9]+$/);
  assert.equal(response.body.batches[0].operations.approval_requested, 1);
  assert.equal(response.body.batches[0].operations.approval_approved, 1);
});

test("exposes pure helpers for local inspection, replay, and safe loading", () => {
  const catalog = readFixtureCatalog();
  const loaded = loadWorkspaceLocalEventCatalog({ workspaceRoot, catalogPath });
  const inspection = inspectLocalEventCatalog(catalog);
  const replay = replayLocalEventCatalog(catalog, { batchSize: 3 });

  assert.equal(loaded.workspaceId, "wsp_local_fixtures");
  assert.equal(inspection.kind, "local-event-catalog.inspection");
  assert.equal(inspection.summary.eventCount, 6);
  assert.deepEqual(
    replay.batches.map((batch) => [batch.eventCount, batch.firstSequence, batch.lastSequence]),
    [
      [3, 1, 3],
      [3, 4, 6],
    ],
  );
  assert.throws(() => {
    inspection.catalog.events[0].id = "evt_mutated";
  }, TypeError);
});

test("returns stable JSON errors for invalid bodies, replay options, and paths", async () => {
  const router = createApiRouter(createLocalEventCatalogRoutes({ workspaceRoot, catalogPath }));

  const badBody = await router.dispatch({
    method: "GET",
    path: "/v1/local-events/summary",
    body: [],
  });
  assertJsonError(badBody, 400, "validation_failed");
  assert.deepEqual(badBody.body.error.details, { path: "body" });

  const badReplay = await router.dispatch({
    method: "GET",
    path: "/v1/local-events/replay-batches",
    body: {
      batchSize: 0,
    },
  });
  assertJsonError(badReplay, 400, "validation_failed");
  assert.deepEqual(badReplay.body.error.details, { path: "body.batchSize" });

  const badPath = await router.dispatch({
    method: "GET",
    path: "/v1/local-events/catalog",
    body: {
      catalogPath: "../outside/catalog.json",
    },
  });
  assertJsonError(badPath, 400, "validation_failed");
  assert.deepEqual(badPath.body.error.details, { path: "body.catalogPath" });
});

test("wraps invalid catalog fixtures with validation issue details", async () => {
  const router = createApiRouter(createLocalEventCatalogRoutes({ workspaceRoot }));

  const response = await router.dispatch({
    method: "GET",
    path: "/v1/local-events/catalog",
    body: {
      catalogPath: invalidCatalogPath,
    },
  });

  assertJsonError(response, 400, "local_event_catalog_validation_failed");
  assert.equal(response.body.error.details.source, invalidCatalogPath);
  assert.ok(response.body.error.details.issues.some((issue) => issue.path === "schemaVersion"));
});

test("index exports local event catalog route helpers", async () => {
  const api = await import("../src/index.ts");

  assert.equal(typeof api.createLocalEventCatalogRoutes, "function");
  assert.equal(typeof api.mountLocalEventCatalogRoutes, "function");
  assert.equal(typeof api.inspectLocalEventCatalog, "function");
  assert.equal(typeof api.replayLocalEventCatalog, "function");
});

function readFixtureCatalog() {
  return JSON.parse(readFileSync(resolve(workspaceRoot, catalogPath), "utf8"));
}

function assertJsonResponse(response, status) {
  assert.equal(response.status, status);
  assert.match(response.headers["content-type"], /^application\/json/);
}

function assertJsonError(response, status, code) {
  assertJsonResponse(response, status);
  assert.deepEqual(Object.keys(response.body), ["error"]);
  assert.equal(response.body.error.code, code);
  assert.equal(typeof response.body.error.message, "string");
  assert.ok(response.body.error.message.length > 0);
}
