import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createIngestConnectorRoutes } from "../src/ingestConnectorRoutes.ts";
import { createApiRouter } from "../src/router.ts";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDirectory, "../../..");
const bundlePath = resolve(workspaceRoot, "examples/ingest-search/connector-api-requests.json");
const bundle = readJson(bundlePath);

test("ingest connector API request fixtures stay local and deterministic", () => {
  assert.equal(bundle.schemaVersion, "ingest-connector-api-requests.v1");
  assert.equal(bundle.localOnly, true);
  assert.equal(bundle.network.mode, "disabled");
  assert.equal(bundle.durableWrites, false);
  assert.deepEqual(bundle.auth, { mode: "none", required: false });
  assert.deepEqual(
    bundle.requests.map((fixture) => fixture.id),
    [
      "api_ingest_connectors_manifest",
      "api_ingest_connectors_bad_method",
      "api_ingest_connectors_bad_path",
    ],
  );

  for (const fixture of bundle.requests) {
    assert.equal(hasAuthHeaders(fixture.request.headers), false, fixture.id);
    assert.match(
      fixture.route.path,
      /^\/v1\/ingest\/connectors(?:\/local\.files\?preview=1)?$/,
      fixture.id,
    );
  }

  const manifest = findFixture("api_ingest_connectors_manifest").expect.body;
  assert.equal(manifest.localOnly, true);
  assert.deepEqual(
    manifest.connectors.map((connector) => connector.id),
    ["local.files", "local.manual", "local.workspace-index"],
  );
  assertLocalOnlyConnectors(manifest.connectors);
});

test("replays every ingest connector API fixture through the local router", async (t) => {
  const router = createApiRouter(createIngestConnectorRoutes());

  for (const fixture of bundle.requests) {
    await t.test(fixture.id, async () => {
      const response = await router.dispatch(createReplayRequest(fixture));
      const secondResponse = await router.dispatch(createReplayRequest(fixture));

      assert.deepEqual(response, secondResponse);
      assertResponseMatchesFixture(response, fixture.expect);
    });
  }
});

test("connector manifest replay exposes frozen clone boundaries", async () => {
  const router = createApiRouter(createIngestConnectorRoutes());
  const fixture = findFixture("api_ingest_connectors_manifest");

  const first = await router.dispatch(createReplayRequest(fixture));
  const second = await router.dispatch(createReplayRequest(fixture));

  assertResponseMatchesFixture(first, fixture.expect);
  assertResponseMatchesFixture(second, fixture.expect);
  assertFrozenManifest(first.body);
  assertFrozenManifest(second.body);
  assert.notEqual(second.body, first.body);
  assert.notEqual(second.body.connectors, first.body.connectors);
  assert.notEqual(second.body.connectors[0], first.body.connectors[0]);

  assert.throws(() => {
    first.body.connectors.push(first.body.connectors[0]);
  }, TypeError);
  assert.throws(() => {
    first.body.connectors[0].capabilities.push("search.query");
  }, TypeError);
  assert.throws(() => {
    first.body.connectors[0].safety.networkAccess = true;
  }, TypeError);
});

function createReplayRequest(fixture) {
  const request = {
    method: fixture.route.method,
    path: fixture.route.path,
    headers: fixture.request.headers,
  };

  if (Object.hasOwn(fixture.request, "body")) {
    request.body = structuredClone(fixture.request.body);
  }

  return request;
}

function assertResponseMatchesFixture(response, expected) {
  assert.equal(response.status, expected.status);
  assert.match(response.headers["content-type"], new RegExp(`^${escapeRegExp(expected.contentType)}`));

  if (expected.error) {
    assert.deepEqual(Object.keys(response.body), ["error"]);
    assert.deepEqual(response.body.error, expected.error);
    return;
  }

  assert.deepEqual(response.body, expected.body);
  assert.equal(response.body.localOnly, true);
  assertLocalOnlyConnectors(response.body.connectors);
}

function assertLocalOnlyConnectors(connectors) {
  assert.ok(connectors.length > 0);
  for (const connector of connectors) {
    assert.equal(connector.transport, "in-process", connector.id);
    assert.deepEqual(connector.auth, { mode: "none", required: false }, connector.id);
    assert.equal(connector.safety.localOnly, true, connector.id);
    assert.equal(connector.safety.networkAccess, false, connector.id);
    assert.equal(connector.safety.durableWrites, false, connector.id);
    assert.equal(connector.preview.dryRun, true, connector.id);
  }
}

function assertFrozenManifest(manifest) {
  assert.equal(Object.isFrozen(manifest), true);
  assert.equal(Object.isFrozen(manifest.connectors), true);

  for (const connector of manifest.connectors) {
    assert.equal(Object.isFrozen(connector), true, connector.id);
    assert.equal(Object.isFrozen(connector.capabilities), true, connector.id);
    assert.equal(Object.isFrozen(connector.mediaTypes), true, connector.id);
    assert.equal(Object.isFrozen(connector.auth), true, connector.id);
    assert.equal(Object.isFrozen(connector.preview), true, connector.id);
    assert.equal(Object.isFrozen(connector.safety), true, connector.id);
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
