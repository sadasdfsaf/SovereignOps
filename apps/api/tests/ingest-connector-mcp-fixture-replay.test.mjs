import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createIngestConnectorMcpRoutes } from "../src/ingestConnectorMcpRoutes.ts";
import { createIngestConnectorRoutes } from "../src/ingestConnectorRoutes.ts";
import { createApiRouter } from "../src/router.ts";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDirectory, "../../..");
const bundlePath = resolve(workspaceRoot, "examples/ingest-search/connector-mcp-api-requests.json");
const bundle = readJson(bundlePath);

test("ingest connector MCP API request fixtures stay local and redacted", () => {
  assert.equal(bundle.schemaVersion, "ingest-connector-mcp-api-requests.v1");
  assert.equal(bundle.apiBase, "local://ingest-connector-mcp-api");
  assert.equal(bundle.localOnly, true);
  assert.equal(bundle.network.mode, "disabled");
  assert.equal(bundle.durableWrites, false);
  assert.deepEqual(bundle.auth, { mode: "none", required: false });
  assert.deepEqual(
    bundle.requests.map((fixture) => fixture.id),
    [
      "mcp_ingest_connector_resources",
      "mcp_ingest_connector_local_files_resource",
      "mcp_ingest_connector_preview_local_files",
      "mcp_ingest_connector_preview_workspace_index_manifest_uri",
      "mcp_ingest_connector_missing_resource",
      "mcp_ingest_connector_bad_preview_body",
    ],
  );
  assertNoUnsafeText(bundle);

  for (const fixture of bundle.requests) {
    assert.match(fixture.id, /^mcp_ingest_connector_[a-z0-9_]+$/);
    assert.match(fixture.method, /^(GET|POST)$/);
    assert.match(
      fixture.path,
      /^\/v1\/ingest\/connectors\/mcp\/(?:resources(?:\/local\.[A-Za-z0-9_.-]+)?|preview)$/,
      fixture.id,
    );
    assert.equal(hasAuthHeaders(fixture.headers), false, fixture.id);
    assert.equal(typeof fixture.expectedStatus, "number", fixture.id);
    assert.equal(isRecord(fixture.expectedBody), true, fixture.id);
    assert.equal(isRecord(fixture.expectedChecks), true, fixture.id);
  }
});

test("replays every ingest connector MCP API fixture through the local router", async (t) => {
  const router = createFixtureRouter();

  for (const fixture of bundle.requests) {
    await t.test(fixture.id, async () => {
      const response = await router.dispatch(createReplayRequest(fixture));
      const secondResponse = await router.dispatch(createReplayRequest(fixture));

      assert.notEqual(response.body, secondResponse.body);
      assert.deepEqual(response, secondResponse);
      assertResponseMatchesFixture(response, fixture);
      assertResponseMatchesFixture(secondResponse, fixture);
      assertNoUnsafeText(response.body);
    });
  }
});

test("fixture replay keeps request and response clone boundaries frozen", async () => {
  const router = createFixtureRouter();
  const requestFixture = findFixture("mcp_ingest_connector_preview_local_files");
  const replayRequest = createReplayRequest(requestFixture);

  assert.notEqual(replayRequest.body, requestFixture.body);
  replayRequest.body.connectorId = "local.manual";
  assert.equal(requestFixture.body.connectorId, "local.files");

  const fixture = findFixture("mcp_ingest_connector_resources");
  const first = await router.dispatch(createReplayRequest(fixture));
  const second = await router.dispatch(createReplayRequest(fixture));

  assertResponseMatchesFixture(first, fixture);
  assertResponseMatchesFixture(second, fixture);
  assertDeepFrozen(first.body);
  assertDeepFrozen(second.body);
  assert.notEqual(first.body, second.body);
  assert.notEqual(first.body.metadata, second.body.metadata);
  assert.notEqual(first.body.resources, second.body.resources);
  assert.notEqual(first.body.resources[0], second.body.resources[0]);
  assert.notEqual(first.body.resources[0].connector, second.body.resources[0].connector);
  assert.notEqual(
    first.body.resources[0].connector.capabilities,
    second.body.resources[0].connector.capabilities,
  );

  assert.throws(() => {
    first.body.resources.push(first.body.resources[0]);
  }, TypeError);
  assert.throws(() => {
    first.body.resources[0].connector.capabilities.push("search.query");
  }, TypeError);
  assert.throws(() => {
    first.body.resources[0].connector.safety.networkAccess = true;
  }, TypeError);
});

function createFixtureRouter() {
  return createApiRouter([
    ...createIngestConnectorRoutes(),
    ...createIngestConnectorMcpRoutes(),
  ]);
}

function createReplayRequest(fixture) {
  const request = {
    method: fixture.method,
    path: fixture.path,
    headers: fixture.headers,
  };

  if (Object.hasOwn(fixture, "body")) {
    request.body = structuredClone(fixture.body);
  }

  return request;
}

function assertResponseMatchesFixture(response, fixture) {
  assert.equal(response.status, fixture.expectedStatus, fixture.id);
  assert.match(response.headers["content-type"], /^application\/json/, fixture.id);
  assert.deepEqual(response.body, fixture.expectedBody, fixture.id);
  assertExpectedChecks(response.body, fixture.expectedChecks, fixture.id);
}

function assertExpectedChecks(body, checks, fixtureId) {
  const supported = new Set([
    "schemaVersion",
    "localOnly",
    "resourceCount",
    "connectorIds",
    "connectorId",
    "contentIncluded",
    "errorCode",
  ]);
  for (const key of Object.keys(checks)) {
    assert.equal(supported.has(key), true, `${fixtureId}: unsupported expected check ${key}`);
  }

  if (Object.hasOwn(checks, "schemaVersion")) {
    assert.equal(body.schemaVersion, checks.schemaVersion, fixtureId);
  }
  if (Object.hasOwn(checks, "localOnly")) {
    assert.equal(body.localOnly, checks.localOnly, fixtureId);
  }
  if (Object.hasOwn(checks, "resourceCount")) {
    assert.equal(body.resources.length, checks.resourceCount, fixtureId);
  }
  if (Object.hasOwn(checks, "connectorIds")) {
    assert.deepEqual(
      body.resources.map((resource) => resource.connectorId),
      checks.connectorIds,
      fixtureId,
    );
  }
  if (Object.hasOwn(checks, "connectorId")) {
    assert.equal(responseConnectorId(body), checks.connectorId, fixtureId);
  }
  if (Object.hasOwn(checks, "contentIncluded")) {
    assert.equal(body.preview.contentIncluded, checks.contentIncluded, fixtureId);
  }
  if (Object.hasOwn(checks, "errorCode")) {
    assert.equal(body.error.code, checks.errorCode, fixtureId);
  }
}

function responseConnectorId(body) {
  if (typeof body.connectorId === "string") {
    return body.connectorId;
  }
  if (isRecord(body.resource) && typeof body.resource.connectorId === "string") {
    return body.resource.connectorId;
  }
  return undefined;
}

function assertDeepFrozen(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return;
  }

  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const nested of Object.values(value)) {
    assertDeepFrozen(nested, seen);
  }
}

function findFixture(id) {
  const fixture = bundle.requests.find((request) => request.id === id);
  assert.ok(fixture, `Missing API fixture ${id}`);
  return fixture;
}

function hasAuthHeaders(headers = {}) {
  return Object.keys(headers).some((name) => /^authorization$|api[-_]?key|token$/i.test(name));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assertNoUnsafeText(value) {
  const text = JSON.stringify(value);
  const lowerText = text.toLowerCase();
  const privateMarkers = [
    ".codex-private",
    ".codex-run",
    "sovereignops-codex-pack",
    ["plan", "pack"].join("-"),
    "private " + "plan " + "pack",
    "codex_start_here",
  ];
  for (const marker of privateMarkers) {
    assert.equal(lowerText.includes(marker), false, marker);
  }

  assert.equal(/(?<![A-Za-z0-9])[A-Za-z]:[\\/]/.test(text), false);
  assert.equal(/\\\\[^\\\s]+\\[^\\\s]+/.test(text), false);
  assert.equal(/(?<![A-Za-z0-9_])\/(?:Users|home|root|tmp|var|etc|opt|private|mnt|Volumes)(?:\/|\b)/.test(text), false);
  assert.equal(/\bsk-[A-Za-z0-9_-]{12,}\b/.test(text), false);
  assert.equal(/\bgh[pousr]_[A-Za-z0-9_]{12,}\b/.test(text), false);
  assert.equal(/\bAKIA[0-9A-Z]{16}\b/.test(text), false);
  assert.equal(/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text), false);
  assert.equal(/\bbearer\s+(?!\[REDACTED\])[A-Za-z0-9._~+/=-]{8,}/i.test(text), false);
  assert.equal(/\b(?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*(?!\[REDACTED\])\S{4,}/i.test(text), false);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
