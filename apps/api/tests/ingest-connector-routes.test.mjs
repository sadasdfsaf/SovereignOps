import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultIngestConnectorManifest,
  createIngestConnectorManifest,
  createIngestConnectorRoutes,
  createMemoryIngestConnectorRouteState,
  mountIngestConnectorRoutes,
} from "../src/ingestConnectorRoutes.ts";
import { createApiRouter } from "../src/router.ts";

test("mounts local ingest connector manifest route", async () => {
  const router = createApiRouter();
  mountIngestConnectorRoutes(router);

  assert.deepEqual(
    router.listRoutes().map(routeKey),
    ["GET /v1/ingest/connectors"],
  );

  const response = await router.dispatch({
    method: "GET",
    path: "/v1/ingest/connectors",
  });

  assertJsonResponse(response, 200);
  assert.equal(response.body.schemaVersion, "ingest-connector-manifest/v1");
  assert.equal(response.body.localOnly, true);
  assert.deepEqual(
    response.body.connectors.map((connector) => connector.id),
    ["local.files", "local.manual", "local.workspace-index"],
  );
  assert.ok(
    response.body.connectors.every((connector) =>
      connector.transport === "in-process" &&
      connector.auth.mode === "none" &&
      connector.auth.required === false &&
      connector.safety.localOnly === true &&
      connector.safety.networkAccess === false &&
      connector.safety.durableWrites === false
    ),
  );
});

test("returns deterministic connector profiles without sharing mutable boundaries", async () => {
  const router = createApiRouter(createIngestConnectorRoutes());

  const first = await router.dispatch({
    method: "GET",
    path: "/v1/ingest/connectors",
  });
  assertJsonResponse(first, 200);

  assert.throws(() => {
    first.body.connectors[0].capabilities.push("search.query");
  }, TypeError);
  assert.throws(() => {
    first.body.connectors[0].safety.networkAccess = true;
  }, TypeError);

  const second = await router.dispatch({
    method: "GET",
    path: "/v1/ingest/connectors",
  });
  assertJsonResponse(second, 200);
  assert.deepEqual(second.body, createDefaultIngestConnectorManifest());
  assert.notEqual(second.body.connectors, first.body.connectors);
  assert.notEqual(second.body.connectors[0], first.body.connectors[0]);
});

test("supports seeded connector profiles with stable sorting and clone boundaries", () => {
  const state = createMemoryIngestConnectorRouteState({
    connectors: [
      {
        id: "local.zeta",
        label: "Zeta",
        description: "Zeta connector.",
        transport: "in-process",
        capabilities: ["search.query"],
        mediaTypes: ["text/plain"],
        auth: {
          mode: "none",
          required: false,
        },
        preview: {
          dryRun: true,
          maxItems: 1,
          maxTextBytes: 1024,
        },
        safety: {
          localOnly: true,
          networkAccess: false,
          durableWrites: false,
          untrustedByDefault: true,
        },
      },
      {
        id: "local.alpha",
        label: "Alpha",
        description: "Alpha connector.",
        transport: "in-process",
        capabilities: ["ingest.normalize"],
        mediaTypes: ["text/markdown"],
        auth: {
          mode: "none",
          required: false,
        },
        preview: {
          dryRun: true,
          maxItems: 2,
          maxTextBytes: 2048,
        },
        safety: {
          localOnly: true,
          networkAccess: false,
          durableWrites: false,
          untrustedByDefault: true,
        },
      },
    ],
  });

  const first = createIngestConnectorManifest(state);
  const second = createIngestConnectorManifest(state);

  assert.deepEqual(
    first.connectors.map((connector) => connector.id),
    ["local.alpha", "local.zeta"],
  );
  assert.deepEqual(first, second);
  assert.notEqual(first.connectors, second.connectors);
  assert.notEqual(first.connectors[0], second.connectors[0]);
});

test("returns JSON errors for invalid connector routes", async () => {
  const router = createApiRouter(createIngestConnectorRoutes());

  const badMethod = await router.dispatch({
    method: "POST",
    path: "/v1/ingest/connectors",
    body: {},
  });
  assertJsonError(badMethod, 404, "API_ROUTE_NOT_FOUND");
  assert.equal(
    badMethod.body.error.message,
    "No API route found for POST /v1/ingest/connectors",
  );

  const badPath = await router.dispatch({
    method: "GET",
    path: "/v1/ingest/connectors/local.files?preview=1",
  });
  assertJsonError(badPath, 404, "API_ROUTE_NOT_FOUND");
  assert.equal(
    badPath.body.error.message,
    "No API route found for GET /v1/ingest/connectors/local.files",
  );
});

test("index exports ingest connector route helpers", async () => {
  const api = await import("../src/index.ts");

  assert.equal(typeof api.createIngestConnectorRoutes, "function");
  assert.equal(typeof api.mountIngestConnectorRoutes, "function");
  assert.equal(typeof api.createMemoryIngestConnectorRouteState, "function");
  assert.equal(typeof api.createDefaultIngestConnectorManifest, "function");
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

function routeKey(route) {
  return `${route.method} ${route.path}`;
}
