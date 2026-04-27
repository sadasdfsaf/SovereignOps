import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createLocalEventReplayExportRoutes,
  exportLocalEventReplayCatalog,
  mountLocalEventReplayExportRoutes,
} from "../src/localEventReplayExportRoutes.ts";
import { createApiRouter } from "../src/router.ts";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDirectory, "../../..");
const catalogPath = "packages/schemas/fixtures/canonical-events.valid.json";
const invalidCatalogPath = "packages/schemas/fixtures/canonical-events.invalid.json";
const createdAt = "2026-04-27T02:00:00.000Z";
const exportId = "local_replay_route_export";

test("mounts local event replay export routes with stable paths", () => {
  const router = createApiRouter();

  mountLocalEventReplayExportRoutes(router, { workspaceRoot, catalogPath });

  assert.deepEqual(
    router.listRoutes().map((route) => `${route.method} ${route.path}`),
    [
      "POST /v1/local-events/replay-export",
      "POST /v1/local-events/replay-export/csv",
      "POST /v1/local-events/replay-export/jsonl",
      "POST /v1/local-events/replay-export/package",
    ],
  );
});

test("exports through the OpenAPI base route using body format", async () => {
  const router = createApiRouter(createLocalEventReplayExportRoutes({ workspaceRoot }));

  const response = await router.dispatch({
    method: "POST",
    path: "/v1/local-events/replay-export",
    body: {
      catalogPath,
      format: "jsonl",
      filters: {
        recordType: "canonical_event",
      },
      createdAt,
      exportId,
    },
  });

  assertJsonResponse(response, 200);
  assert.equal(response.body.kind, "audit-export.local-event-replay.content");
  assert.equal(response.body.format, "jsonl");
  assert.equal(response.body.exportId, exportId);
  assert.match(response.body.content, /evt_local_01/);
});

test("exports deterministic local event replay packages from workspace JSON", async () => {
  const router = createApiRouter(createLocalEventReplayExportRoutes({ workspaceRoot, catalogPath }));
  const request = {
    method: "POST",
    path: "/v1/local-events/replay-export/package",
    body: {
      createdAt,
      exportId,
    },
  };

  const first = await router.dispatch(request);
  const second = await router.dispatch(structuredClone(request));

  assertJsonResponse(first, 200);
  assert.deepEqual(first.body, second.body);
  assert.equal(first.body.kind, "audit-export.local-event-replay.package");
  assert.equal(first.body.manifest.exportId, exportId);
  assert.equal(first.body.manifest.createdAt, createdAt);
  assert.equal(first.body.manifest.recordCount, 6);
  assert.deepEqual(first.body.manifest.recordTypes, ["canonical_event"]);
  assert.deepEqual(first.body.manifest.workspaceIds, ["wsp_local_fixtures"]);
  assert.match(first.body.manifest.fingerprint, /^fnv1a64:[0-9a-f]{16}$/);
  assert.match(first.body.jsonl, /evt_local_01/);
  assert.match(first.body.csv, /evt_local_06/);
});

test("wraps JSONL and CSV content in JSON responses", async () => {
  const router = createApiRouter(createLocalEventReplayExportRoutes({ workspaceRoot }));

  const jsonl = await router.dispatch({
    method: "POST",
    path: "/v1/local-events/replay-export/jsonl",
    body: {
      catalogPath,
      filters: {
        operation: "append",
      },
      createdAt,
    },
  });
  assertJsonResponse(jsonl, 200);
  assert.equal(jsonl.body.kind, "audit-export.local-event-replay.content");
  assert.equal(jsonl.body.format, "jsonl");
  assert.equal(jsonl.body.mediaType, "application/jsonl");
  assert.equal(jsonl.body.fingerprint, jsonl.body.manifest.jsonl.fingerprint);
  assert.equal(jsonl.body.manifest.recordCount, 2);
  assert.equal(jsonl.body.content.split("\n").length, 2);
  assert.match(jsonl.body.content, /evt_local_01/);
  assert.match(jsonl.body.content, /evt_local_03/);
  assert.doesNotMatch(jsonl.body.content, /evt_local_02/);

  const csv = await router.dispatch({
    method: "POST",
    path: "/v1/local-events/replay-export/csv",
    body: {
      catalogPath,
      filters: {
        operation: "approval_requested",
      },
      createdAt,
    },
  });
  assertJsonResponse(csv, 200);
  assert.equal(csv.body.kind, "audit-export.local-event-replay.content");
  assert.equal(csv.body.format, "csv");
  assert.equal(csv.body.mediaType, "text/csv");
  assert.equal(csv.body.fingerprint, csv.body.manifest.csv.fingerprint);
  assert.equal(csv.body.manifest.recordCount, 1);
  assert.match(csv.body.content, /^recordId,recordType,workspaceId,/);
  assert.match(csv.body.content, /evt_local_05/);
  assert.doesNotMatch(csv.body.content, /evt_local_06/);
});

test("exposes a pure helper for local event replay export packages", () => {
  const catalog = readFixtureCatalog();
  const exported = exportLocalEventReplayCatalog(catalog, { createdAt, exportId });

  assert.equal(exported.manifest.exportId, exportId);
  assert.equal(exported.manifest.recordCount, 6);
  assert.deepEqual(exported.manifest.catalogDigests, []);
  assert.throws(() => {
    exported.manifest.recordFingerprints.push("mutated");
  }, TypeError);
});

test("returns stable JSON errors for invalid bodies, filters, and paths", async () => {
  const router = createApiRouter(createLocalEventReplayExportRoutes({ workspaceRoot, catalogPath }));

  const badBody = await router.dispatch({
    method: "POST",
    path: "/v1/local-events/replay-export/package",
    body: [],
  });
  assertJsonError(badBody, 400, "validation_failed");
  assert.deepEqual(badBody.body.error.details, { path: "body" });

  const badFilters = await router.dispatch({
    method: "POST",
    path: "/v1/local-events/replay-export/jsonl",
    body: {
      filters: [],
    },
  });
  assertJsonError(badFilters, 400, "validation_failed");
  assert.deepEqual(badFilters.body.error.details, { path: "body.filters" });

  const badPath = await router.dispatch({
    method: "POST",
    path: "/v1/local-events/replay-export/csv",
    body: {
      catalogPath: "../outside/catalog.json",
    },
  });
  assertJsonError(badPath, 400, "validation_failed");
  assert.deepEqual(badPath.body.error.details, { path: "body.catalogPath" });
});

test("wraps catalog and replay export validation failures", async () => {
  const router = createApiRouter(createLocalEventReplayExportRoutes({ workspaceRoot }));

  const invalidCatalog = await router.dispatch({
    method: "POST",
    path: "/v1/local-events/replay-export/package",
    body: {
      catalogPath: invalidCatalogPath,
    },
  });
  assertJsonError(invalidCatalog, 400, "local_event_catalog_validation_failed");
  assert.equal(invalidCatalog.body.error.details.source, invalidCatalogPath);

  const invalidFilter = await router.dispatch({
    method: "POST",
    path: "/v1/local-events/replay-export/package",
    body: {
      catalogPath,
      filters: {
        recordType: "unsupported",
      },
    },
  });
  assertJsonError(invalidFilter, 400, "AUDIT_EXPORT_INVALID_FILTER");
  assert.equal(invalidFilter.body.error.details.recordType, "unsupported");
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
