import assert from "node:assert/strict";
import test from "node:test";

import {
  ApiHttpError,
  toApiResult,
} from "../src/client.ts";
import {
  IngestConnectorClient,
} from "../src/ingestConnectorClient.ts";
import {
  DEFAULT_INGEST_CONNECTOR_FIXTURE_PATH,
  IngestConnectorFixtureError,
  baseUrlFromIngestConnectorFixtureBundle,
  createIngestConnectorFixtureClient,
  createIngestConnectorFixtureClientHarness,
  createIngestConnectorFixtureFetch,
  loadIngestConnectorFixtureBundle,
} from "../src/ingestConnectorFixtureFetch.ts";

const realFixtureUrl = new URL("../../../examples/ingest-search/connector-api-requests.json", import.meta.url);
const rawSecret = "sk-testsecret123";
const rawPath = "C:\\tmp\\connector-fixture\\secret.txt";

test("loads the checked-in connector fixture bundle and derives the client base URL", () => {
  assert.equal(DEFAULT_INGEST_CONNECTOR_FIXTURE_PATH.href, realFixtureUrl.href);

  const bundle = loadIngestConnectorFixtureBundle();

  assert.equal(bundle.schemaVersion, "ingest-connector-api-requests.v1");
  assert.equal(bundle.localOnly, true);
  assert.equal(bundle.requests.length, 3);
  assert.equal(baseUrlFromIngestConnectorFixtureBundle(bundle), "local://ingest-connector-api/v1/");
});

test("serves matching connector fixture responses for recorded requests", async () => {
  const bundle = loadIngestConnectorFixtureBundle();
  const fetch = createIngestConnectorFixtureFetch(bundle);

  for (const entry of bundle.requests) {
    const response = await fetch(urlFor(bundle, entry), {
      method: entry.route.method.toLowerCase(),
      body: entry.request.body === undefined ? undefined : JSON.stringify(entry.request.body),
    });

    const status = expectedStatus(entry);
    assert.equal(response.ok, status >= 200 && status < 300);
    assert.equal(response.status, status);
    assert.equal(response.statusText, expectedStatusText(status));
    assert.equal(response.headers?.get("content-type"), "application/json");
    assert.deepEqual(await response.json(), expectedResponseBody(entry));
    assert.deepEqual(await response.clone().json(), expectedResponseBody(entry));
    assert.equal(await response.text(), JSON.stringify(expectedResponseBody(entry)));
  }

  assert.deepEqual(
    fetch.calls.map((call) => [call.method, call.path, call.matchedRequestId, call.status]),
    bundle.requests.map((entry) => [
      entry.route.method,
      entry.route.path,
      entry.id,
      expectedStatus(entry),
    ]),
  );
});

test("drives IngestConnectorClient manifest and readiness calls through the fixture harness", async () => {
  const bundle = loadIngestConnectorFixtureBundle();
  const harness = createIngestConnectorFixtureClientHarness(bundle);
  const client = createIngestConnectorFixtureClient(bundle);

  assert.equal(harness.client instanceof IngestConnectorClient, true);
  assert.equal(client instanceof IngestConnectorClient, true);
  assert.equal(harness.baseUrl, "local://ingest-connector-api/v1/");

  const manifest = await harness.client.getManifest();
  const readiness = await harness.client.getReadiness();
  const repeatedManifest = await client.manifest();

  assert.equal(manifest.kind, "ingest.connector_manifest");
  assert.equal(manifest.schemaVersion, "ingest-connector-manifest/v1");
  assert.equal(manifest.localOnly, true);
  assert.equal(manifest.profileCount, 3);
  assert.deepEqual(
    manifest.profiles.map((profile) => [profile.profileId, profile.connector]),
    [
      ["local.manual", "markdown"],
      ["local.files", "repository"],
      ["local.workspace-index", "repository"],
    ],
  );
  assert.equal(readiness.kind, "ingest.connector_readiness");
  assert.equal(readiness.readyCount, 2);
  assert.equal(readiness.blockedCount, 1);
  assert.deepEqual(harness.fetch.calls.map((call) => call.matchedRequestId), [
    "api_ingest_connectors_manifest",
    "api_ingest_connectors_manifest",
  ]);
  assert.deepEqual(
    repeatedManifest.profiles.map((profile) => profile.profileId),
    manifest.profiles.map((profile) => profile.profileId),
  );
});

test("returns typed redacted fixture errors for route mismatch, method mismatch, and body drift", async () => {
  const bundle = loadIngestConnectorFixtureBundle();
  const fetch = createIngestConnectorFixtureFetch(bundle);

  const missingPath = await fetch("local://ingest-connector-api/v1/ingest/connectors/not-recorded", {
    method: "GET",
  });
  const missingPathBody = await missingPath.json();

  assert.equal(missingPath.status, 404);
  assert.equal(missingPathBody.error.code, "ingest_connector_fixture_request_not_found");
  assert.equal(missingPathBody.error.details.path, "/v1/ingest/connectors/not-recorded");

  const methodMismatch = await fetch("local://ingest-connector-api/v1/ingest/connectors", {
    method: "PUT",
  });
  const methodMismatchBody = await methodMismatch.json();

  assert.equal(methodMismatch.status, 405);
  assert.equal(methodMismatchBody.error.code, "ingest_connector_fixture_method_mismatch");
  assert.deepEqual(methodMismatchBody.error.details.allowedMethods, ["GET", "POST"]);

  const bodyDrift = await fetch(urlFor(bundle, fixtureRequest(bundle, "api_ingest_connectors_manifest")), {
    method: "GET",
    body: JSON.stringify({
      apiKey: rawSecret,
      rootPath: rawPath,
    }),
  });
  const bodyDriftBody = await bodyDrift.json();

  assert.equal(bodyDrift.status, 422);
  assert.equal(bodyDriftBody.error.code, "ingest_connector_fixture_body_mismatch");
  assert.deepEqual(bodyDriftBody.error.details.candidateRequestIds, ["api_ingest_connectors_manifest"]);
  assertNoSensitiveText(bodyDriftBody);
  assertNoSensitiveText(fetch.calls.at(-1));
});

test("keeps fixture, response, clone, and call boundaries isolated", async () => {
  const sourceBundle = loadIngestConnectorFixtureBundle();
  const mutableBundle = structuredClone(sourceBundle);
  const mutableEntry = fixtureRequest(mutableBundle, "api_ingest_connectors_manifest");
  const fetch = createIngestConnectorFixtureFetch(mutableBundle);

  mutableEntry.expect.body.connectors[0].label = "Mutated after fetch creation";

  const response = await fetch(urlFor(sourceBundle, fixtureRequest(sourceBundle, "api_ingest_connectors_manifest")), {
    method: "GET",
  });
  const firstJson = await response.json();
  firstJson.connectors[0].label = "Mutated response body";
  const secondJson = await response.json();
  const clonedJson = await response.clone().json();
  clonedJson.connectors[0].label = "Mutated clone body";

  assert.equal(
    secondJson.connectors[0].label,
    fixtureRequest(sourceBundle, "api_ingest_connectors_manifest").expect.body.connectors[0].label,
  );
  assert.equal(
    (await response.json()).connectors[0].label,
    fixtureRequest(sourceBundle, "api_ingest_connectors_manifest").expect.body.connectors[0].label,
  );
  assert.throws(
    () => {
      fetch.calls[0].status = 500;
    },
    TypeError,
  );
  assert.throws(
    () => {
      fetch.bundle.requests[0].id = "mutated";
    },
    TypeError,
  );
});

test("validates connector fixture schema, uniqueness, local-only base, and route/body matching", () => {
  const bundle = loadIngestConnectorFixtureBundle();

  const invalidSchema = structuredClone(bundle);
  invalidSchema.schemaVersion = "wrong";
  assertInvalidFixture(
    () => createIngestConnectorFixtureFetch(invalidSchema),
    ["schemaVersion"],
  );

  const duplicateId = structuredClone(bundle);
  duplicateId.requests[1].id = duplicateId.requests[0].id;
  assertInvalidFixture(
    () => createIngestConnectorFixtureFetch(duplicateId),
    ["requests.1.id"],
  );

  const remoteBase = structuredClone(bundle);
  remoteBase.apiBase = "https://example.com";
  assertInvalidFixture(
    () => createIngestConnectorFixtureFetch(remoteBase),
    ["apiBase"],
  );

  const routeDrift = structuredClone(bundle);
  fixtureRequest(routeDrift, "api_ingest_connectors_manifest").route.path = "/v1/ingest/connectors/local.files";
  assertInvalidFixture(
    () => createIngestConnectorFixtureFetch(routeDrift),
    ["requests.0.route.path"],
  );

  const bodyDrift = structuredClone(bundle);
  fixtureRequest(bodyDrift, "api_ingest_connectors_manifest").request.body = {};
  assertInvalidFixture(
    () => createIngestConnectorFixtureFetch(bodyDrift),
    ["requests.0.request.body"],
  );
});

test("surfaces connector fixture route drift as a client HTTP error", async () => {
  const bundle = loadIngestConnectorFixtureBundle();
  const harness = createIngestConnectorFixtureClientHarness({
    bundle,
    baseUrl: "local://ingest-connector-api/v1/drifted",
  });

  const result = await toApiResult(harness.client.getManifest());

  assert.equal(result.ok, false);
  assert.equal(result.error instanceof ApiHttpError, true);
  assert.equal(result.error.status, 404);
  assert.equal(result.error.apiCode, "ingest_connector_fixture_request_not_found");
});

function assertInvalidFixture(action, expectedPaths) {
  assert.throws(
    action,
    (error) => {
      assert.equal(error instanceof IngestConnectorFixtureError, true);
      assert.equal(error.code, "ingest_connector_fixture_invalid");
      assert.deepEqual(
        expectedPaths.every((path) => error.issues.some((issue) => issue.path === path)),
        true,
      );
      assertNoSensitiveText(error);
      return true;
    },
  );
}

function fixtureRequest(bundle, id) {
  const entry = bundle.requests.find((request) => request.id === id);
  assert.notEqual(entry, undefined);
  return entry;
}

function expectedStatus(entry) {
  return entry.response?.status ?? entry.expect.status;
}

function expectedResponseBody(entry) {
  return structuredClone(entry.response?.body ?? entry.expect.body);
}

function urlFor(bundle, entry) {
  return new URL(entry.route.path, bundle.apiBase ?? "http://127.0.0.1:7317").href;
}

function expectedStatusText(status) {
  if (status === 200) {
    return "OK";
  }
  if (status === 400) {
    return "Bad Request";
  }
  if (status === 404) {
    return "Not Found";
  }
  if (status === 405) {
    return "Method Not Allowed";
  }
  if (status === 422) {
    return "Unprocessable Entity";
  }
  return "";
}

function assertNoSensitiveText(value) {
  const serialized = JSON.stringify(value) ?? String(value);
  assert.equal(serialized.includes(rawSecret), false);
  assert.equal(serialized.includes("C:"), false);
  assert.equal(serialized.includes("\\tmp\\"), false);
  assert.equal(serialized.includes(".codex-private"), false);
}
