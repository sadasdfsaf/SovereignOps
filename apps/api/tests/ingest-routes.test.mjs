import assert from "node:assert/strict";
import test from "node:test";

import { createApiRouter } from "../src/router.ts";
import {
  createIngestRouteFixtureState,
  createIngestRoutes,
  createMemoryIngestRouteState,
  mountIngestRoutes,
} from "../src/ingestRoutes.ts";

test("mounts ingest routes and lists source summaries", async () => {
  const router = createApiRouter();
  mountIngestRoutes(router, createIngestRouteFixtureState());

  assert.deepEqual(
    router.listRoutes().map((route) => `${route.method} ${route.path}`),
    [
      "GET /v1/ingest/quarantine",
      "GET /v1/ingest/sources",
      "POST /v1/ingest/quarantine/:recordId/decision",
      "POST /v1/ingest/search",
    ],
  );

  const response = await router.dispatch({
    method: "GET",
    path: "/v1/ingest/sources",
  });

  assertJsonResponse(response, 200);
  assert.deepEqual(
    response.body.sources.map((source) => [
      source.sourceId,
      source.label,
      source.itemCount,
      source.quarantinedCount,
    ]),
    [
      ["src_design_notes", "Design Notes", 2, 1],
      ["src_research_clips", "Research Clips", 1, 0],
    ],
  );
});

test("searches the local index with stable scoring, filtering, and limits", async () => {
  const router = createApiRouter(createIngestRoutes(createIngestRouteFixtureState()));

  const all = await router.dispatch({
    method: "POST",
    path: "/v1/ingest/search",
    body: {
      query: "alpha",
      limit: 10,
    },
  });

  assertJsonResponse(all, 200);
  assert.equal(all.body.query, "alpha");
  assert.deepEqual(
    all.body.hits.map((hit) => [hit.id, hit.score]),
    [
      ["doc_alpha", 7],
      ["doc_beta", 1],
    ],
  );
  assert.match(all.body.hits[0].snippet, /Alpha/);
  assert.deepEqual(all.body.hits[0].metadata, { path: "notes/alpha.md" });

  const filtered = await router.dispatch({
    method: "POST",
    path: "/v1/ingest/search",
    body: {
      query: "alpha",
      sourceIds: ["src_research_clips"],
      limit: 1,
    },
  });

  assertJsonResponse(filtered, 200);
  assert.deepEqual(filtered.body.hits.map((hit) => hit.id), ["doc_beta"]);
  assert.equal(filtered.body.count, 1);
});

test("returns JSON validation errors for malformed search and decision requests", async () => {
  const router = createApiRouter(createIngestRoutes(createIngestRouteFixtureState()));

  const missingQuery = await router.dispatch({
    method: "POST",
    path: "/v1/ingest/search",
    body: { query: " " },
  });
  assertJsonError(missingQuery, 400, "validation_failed");
  assert.deepEqual(missingQuery.body.error.details, { path: "body.query" });

  const badSourceIds = await router.dispatch({
    method: "POST",
    path: "/v1/ingest/search",
    body: {
      query: "alpha",
      sourceIds: ["src_design_notes", ""],
    },
  });
  assertJsonError(badSourceIds, 400, "validation_failed");
  assert.deepEqual(badSourceIds.body.error.details, { path: "body.sourceIds.1" });

  const badLimit = await router.dispatch({
    method: "POST",
    path: "/v1/ingest/search",
    body: {
      query: "alpha",
      limit: 51,
    },
  });
  assertJsonError(badLimit, 400, "validation_failed");
  assert.deepEqual(badLimit.body.error.details, { path: "body.limit" });

  const badDecision = await router.dispatch({
    method: "POST",
    path: "/v1/ingest/quarantine/qrn_alpha/decision",
    body: {
      decision: "maybe",
    },
  });
  assertJsonError(badDecision, 400, "validation_failed");
  assert.deepEqual(badDecision.body.error.details, { path: "body.decision" });
});

test("lists quarantine records and applies a deterministic decision update", async () => {
  const state = createIngestRouteFixtureState();
  const router = createApiRouter(createIngestRoutes(state));

  const listed = await router.dispatch({
    method: "GET",
    path: "/v1/ingest/quarantine",
  });
  assertJsonResponse(listed, 200);
  assert.deepEqual(
    listed.body.records.map((record) => [record.id, record.status]),
    [
      ["qrn_alpha", "pending"],
      ["qrn_closed", "discarded"],
    ],
  );

  const decided = await router.dispatch({
    method: "POST",
    path: "/v1/ingest/quarantine/qrn_alpha/decision",
    actorId: "act_local",
    body: {
      decision: "release",
      reason: "Metadata added.",
    },
  });
  assertJsonResponse(decided, 200);
  assert.deepEqual(decided.body.record, {
    id: "qrn_alpha",
    sourceId: "src_design_notes",
    itemId: "raw_alpha",
    title: "Raw alpha note",
    reason: "Missing required metadata.",
    status: "released",
    createdAt: "2026-04-27T00:21:00.000Z",
    decidedAt: "2026-04-27T00:30:00.000Z",
    decidedBy: "act_local",
    decisionReason: "Metadata added.",
  });

  const relisted = await router.dispatch({
    method: "GET",
    path: "/v1/ingest/quarantine",
  });
  assertJsonResponse(relisted, 200);
  assert.deepEqual(
    relisted.body.records.map((record) => [record.id, record.status]),
    [
      ["qrn_alpha", "released"],
      ["qrn_closed", "discarded"],
    ],
  );
});

test("returns stable errors for missing or closed quarantine records", async () => {
  const router = createApiRouter(createIngestRoutes(createIngestRouteFixtureState()));

  const missing = await router.dispatch({
    method: "POST",
    path: "/v1/ingest/quarantine/qrn_missing/decision",
    body: {
      decision: "discard",
    },
  });
  assertJsonError(missing, 404, "quarantine_record_not_found");
  assert.deepEqual(missing.body.error.details, { path: "params.recordId" });

  const closed = await router.dispatch({
    method: "POST",
    path: "/v1/ingest/quarantine/qrn_closed/decision",
    body: {
      decision: "release",
    },
  });
  assertJsonError(closed, 409, "quarantine_record_closed");
  assert.deepEqual(closed.body.error.details, { recordId: "qrn_closed" });
});

test("memory state can be seeded without fixture data", async () => {
  const state = createMemoryIngestRouteState({
    now: () => "2026-04-27T01:00:00.000Z",
    sources: [
      {
        sourceId: "src_custom",
        label: "Custom Source",
        kind: "folder",
        itemCount: 1,
        quarantinedCount: 0,
        updatedAt: "2026-04-27T00:59:00.000Z",
      },
    ],
    documents: [
      {
        id: "doc_custom",
        sourceId: "src_custom",
        title: "Custom entry",
        text: "Needle text is searchable.",
        updatedAt: "2026-04-27T00:59:00.000Z",
      },
    ],
  });
  const router = createApiRouter(createIngestRoutes(state, { basePath: "/local/ingest/" }));

  const response = await router.dispatch({
    method: "POST",
    path: "/local/ingest/search",
    body: {
      query: "needle",
    },
  });

  assertJsonResponse(response, 200);
  assert.deepEqual(response.body.hits.map((hit) => hit.id), ["doc_custom"]);
});

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
