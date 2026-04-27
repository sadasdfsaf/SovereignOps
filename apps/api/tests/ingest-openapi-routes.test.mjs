import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadIngestSearchFixtureBundle } from "../src/ingestFixtureServices.ts";
import {
  createIngestOpenApiRouteStateFromFixtures,
  createIngestOpenApiRoutes,
  createMemoryIngestOpenApiRouteState,
  mountIngestOpenApiRoutes,
} from "../src/ingestOpenApiRoutes.ts";
import { createApiRouter } from "../src/router.ts";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDirectory, "../../..");

test("mounts OpenAPI-shaped ingest, search, and quarantine routes", () => {
  const router = createApiRouter();
  const fixtures = loadIngestSearchFixtureBundle({ workspaceRoot });

  mountIngestOpenApiRoutes(router, createIngestOpenApiRouteStateFromFixtures(fixtures));

  assert.deepEqual(
    router.listRoutes().map((route) => `${route.method} ${route.path}`),
    [
      "POST /v1/ingest/normalize",
      "POST /v1/ingest/repository/scan",
      "POST /v1/ingest/structured",
      "POST /v1/quarantine/cases",
      "POST /v1/quarantine/cases/:caseId/decision",
      "POST /v1/search/query",
    ],
  );
});

test("replays representative OpenAPI fixture requests through deterministic routes", async () => {
  const fixtures = loadIngestSearchFixtureBundle({ workspaceRoot });
  const router = createApiRouter(
    createIngestOpenApiRoutes(createIngestOpenApiRouteStateFromFixtures(fixtures)),
  );

  for (const id of [
    "api_ingest_normalize",
    "api_ingest_structured_csv",
    "api_ingest_repository_scan",
    "api_search_query",
    "api_quarantine_cases",
    "api_quarantine_decision",
  ]) {
    const fixture = findApiRequest(fixtures, id);
    const response = await router.dispatch({
      method: fixture.route.method,
      path: fixture.route.path,
      body: fixture.request.body,
    });

    assertJsonResponse(response, fixture.response.status, id);
    assert.deepEqual(response.body, fixture.response.body, id);
  }
});

test("validates malformed OpenAPI ingest and search requests with stable envelopes", async () => {
  const fixtures = loadIngestSearchFixtureBundle({ workspaceRoot });
  const router = createApiRouter(
    createIngestOpenApiRoutes(createIngestOpenApiRouteStateFromFixtures(fixtures)),
  );

  const badNormalize = await router.dispatch({
    method: "POST",
    path: "/v1/ingest/normalize",
    body: {
      workspaceId: "wsp_ingest_demo",
      sourceUri: "fixture://ingest-search/notes.md",
      mediaType: "text/markdown",
    },
  });
  assertJsonError(badNormalize, 400, "validation_failed");
  assert.deepEqual(badNormalize.body.error.details, { path: "body.content" });

  const badScanPath = await router.dispatch({
    method: "POST",
    path: "/v1/ingest/repository/scan",
    body: {
      workspaceId: "wsp_ingest_demo",
      localPath: "../outside",
      options: {
        includePaths: ["notes.md"],
      },
    },
  });
  assertJsonError(badScanPath, 400, "validation_failed");
  assert.deepEqual(badScanPath.body.error.details, { path: "body.localPath" });

  const badSearchLimit = await router.dispatch({
    method: "POST",
    path: "/v1/search/query",
    body: {
      workspaceId: "wsp_ingest_demo",
      query: "checksum",
      limit: 101,
    },
  });
  assertJsonError(badSearchLimit, 400, "validation_failed");
  assert.deepEqual(badSearchLimit.body.error.details, { path: "body.limit" });

  const badCaseItem = await router.dispatch({
    method: "POST",
    path: "/v1/quarantine/cases",
    body: {
      workspaceId: "wsp_ingest_demo",
      items: [],
    },
  });
  assertJsonError(badCaseItem, 400, "validation_failed");
  assert.deepEqual(badCaseItem.body.error.details, { path: "body.items" });

  const badCaseId = await router.dispatch({
    method: "POST",
    path: "/v1/quarantine/cases/not_a_case/decision",
    body: findApiRequest(fixtures, "api_quarantine_decision").request.body,
  });
  assertJsonError(badCaseId, 400, "validation_failed");
  assert.deepEqual(badCaseId.body.error.details, { path: "params.caseId" });
});

test("returns stable errors for missing and closed OpenAPI quarantine cases", async () => {
  const fixtures = loadIngestSearchFixtureBundle({ workspaceRoot });
  const state = createIngestOpenApiRouteStateFromFixtures(fixtures);
  const router = createApiRouter(createIngestOpenApiRoutes(state));
  const decisionBody = findApiRequest(fixtures, "api_quarantine_decision").request.body;

  const missing = await router.dispatch({
    method: "POST",
    path: "/v1/quarantine/cases/qtn_missing/decision",
    body: decisionBody,
  });
  assertJsonError(missing, 404, "quarantine_case_not_found");
  assert.deepEqual(missing.body.error.details, { path: "params.caseId" });

  const decided = await router.dispatch({
    method: "POST",
    path: "/v1/quarantine/cases/qtn_csv_beta_status/decision",
    body: decisionBody,
  });
  assertJsonResponse(decided, 200);

  const closed = await router.dispatch({
    method: "POST",
    path: "/v1/quarantine/cases/qtn_csv_beta_status/decision",
    body: decisionBody,
  });
  assertJsonError(closed, 409, "quarantine_case_closed");
  assert.deepEqual(closed.body.error.details, { caseId: "qtn_csv_beta_status" });
});

test("memory state normalizes ad hoc local content without fixture data", async () => {
  const router = createApiRouter(createIngestOpenApiRoutes(createMemoryIngestOpenApiRouteState()));
  const response = await router.dispatch({
    method: "POST",
    path: "/v1/ingest/normalize",
    body: {
      workspaceId: "wsp_local",
      sourceUri: "local://notes/ad-hoc.txt",
      mediaType: "text/plain",
      content: "  local note\r\n",
      options: {
        trusted: true,
      },
    },
  });

  assertJsonResponse(response, 200);
  assert.deepEqual(response.body, {
    ok: true,
    sourceUri: "local://notes/ad-hoc.txt",
    mediaType: "text/plain",
    checksum: "fbc30d979df569e1beb2dcf4e4948e4f172f55588c4a7298c9ac0ed6ad516eb2",
    normalizedText: "  local note",
    untrusted: false,
  });
});

function findApiRequest(fixtures, id) {
  const fixture = fixtures.apiRequests.requests.find((request) => request.id === id);
  assert.ok(fixture, `Missing API fixture ${id}`);
  return fixture;
}

function assertJsonResponse(response, status, label = "") {
  assert.equal(response.status, status, label);
  assert.match(response.headers["content-type"], /^application\/json/);
}

function assertJsonError(response, status, code) {
  assertJsonResponse(response, status);
  assert.deepEqual(Object.keys(response.body), ["error"]);
  assert.equal(response.body.error.code, code);
  assert.equal(typeof response.body.error.message, "string");
  assert.ok(response.body.error.message.length > 0);
}
