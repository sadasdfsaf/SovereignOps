import assert from "node:assert/strict";
import test from "node:test";

import {
  ApiHttpError,
  IngestConnectorMcpClient,
  IngestConnectorMcpFixtureError,
  DEFAULT_INGEST_CONNECTOR_MCP_FIXTURE_PATH,
  baseUrlFromIngestConnectorMcpFixtureBundle,
  createIngestConnectorMcpFixtureClient,
  createIngestConnectorMcpFixtureClientHarness,
  createIngestConnectorMcpFixtureFetch,
  loadIngestConnectorMcpFixtureBundle,
  toApiResult,
} from "../src/index.ts";

const realFixtureUrl = new URL("../../../examples/ingest-search/connector-mcp-api-requests.json", import.meta.url);
const rawSecret = "sk-testsecret123";
const rawPath = "C:\\tmp\\connector-mcp-fixture\\secret.txt";

test("loads the checked-in MCP fixture bundle and derives the client base URL", () => {
  assert.equal(DEFAULT_INGEST_CONNECTOR_MCP_FIXTURE_PATH.href, realFixtureUrl.href);

  const bundle = loadIngestConnectorMcpFixtureBundle();

  assert.equal(bundle.schemaVersion, "ingest-connector-mcp-api-requests.v1");
  assert.equal(bundle.localOnly, true);
  assert.equal(bundle.network.mode, "disabled");
  assert.equal(bundle.durableWrites, false);
  assert.equal(bundle.auth.mode, "none");
  assert.equal(bundle.requests.length, 6);
  assert.equal(baseUrlFromIngestConnectorMcpFixtureBundle(bundle), "local://ingest-connector-mcp-api/v1/");
});

test("serves matching MCP fixture responses for recorded requests", async () => {
  const bundle = loadIngestConnectorMcpFixtureBundle();
  const fetch = createIngestConnectorMcpFixtureFetch(bundle);

  for (const entry of bundle.requests) {
    const response = await fetch(urlFor(bundle, entry), {
      method: entry.method.toLowerCase(),
      body: entry.body === undefined ? undefined : JSON.stringify(entry.body),
    });

    assert.equal(response.ok, entry.expectedStatus >= 200 && entry.expectedStatus < 300);
    assert.equal(response.status, entry.expectedStatus);
    assert.equal(response.statusText, expectedStatusText(entry.expectedStatus));
    assert.equal(response.headers?.get("content-type"), "application/json");
    assert.deepEqual(await response.json(), expectedResponseBody(entry));
    assert.deepEqual(await response.clone().json(), expectedResponseBody(entry));
    assert.equal(await response.text(), JSON.stringify(expectedResponseBody(entry)));
  }

  assert.deepEqual(
    fetch.calls.map((call) => [call.method, call.path, call.matchedRequestId, call.status]),
    bundle.requests.map((entry) => [
      entry.method,
      entry.path,
      entry.id,
      entry.expectedStatus,
    ]),
  );
});

test("drives IngestConnectorMcpClient list, read, and preview calls through the fixture harness", async () => {
  const bundle = loadIngestConnectorMcpFixtureBundle();
  const harness = createIngestConnectorMcpFixtureClientHarness(bundle);
  const client = createIngestConnectorMcpFixtureClient(bundle);

  assert.equal(harness.client instanceof IngestConnectorMcpClient, true);
  assert.equal(client instanceof IngestConnectorMcpClient, true);
  assert.equal(harness.baseUrl, "local://ingest-connector-mcp-api/v1/");

  const listed = await harness.client.listResources();
  const read = await harness.client.readResource("local.files");
  const previewByUri = await harness.client.preview({
    resourceUri: "sovereignops://ingest/connectors/local.workspace-index/manifest",
    includeContent: true,
  });
  const repeatedPreviewByUri = await client.preview({
    resourceUri: "sovereignops://ingest/connectors/local.workspace-index/manifest",
    includeContent: true,
  });

  assert.equal(listed.schemaVersion, "ingest-connector-mcp-resources/v1");
  assert.equal(listed.localOnly, true);
  assert.equal(listed.resources.length, 3);
  assert.deepEqual(
    listed.resources.map((resource) => resource.connectorId),
    ["local.files", "local.manual", "local.workspace-index"],
  );
  assert.equal(read.schemaVersion, "ingest-connector-mcp-resource/v1");
  assert.equal(read.resource.connectorId, "local.files");
  assert.equal(previewByUri.connectorId, "local.workspace-index");
  assert.equal(previewByUri.preview.contentIncluded, true);
  assert.equal(previewByUri.preview.contentBytes, new TextEncoder().encode(previewByUri.resource.content.text).length);
  assert.deepEqual(repeatedPreviewByUri.preview, previewByUri.preview);
  assert.deepEqual(harness.fetch.calls.map((call) => call.matchedRequestId), [
    "mcp_ingest_connector_resources",
    "mcp_ingest_connector_local_files_resource",
    "mcp_ingest_connector_preview_workspace_index_manifest_uri",
  ]);
});

test("returns typed redacted fixture errors for remote URLs, route drift, method drift, and body drift", async () => {
  const bundle = loadIngestConnectorMcpFixtureBundle();
  const fetch = createIngestConnectorMcpFixtureFetch(bundle);

  const remoteUrl = await fetch("https://example.com/v1/ingest/connectors/mcp/resources", {
    method: "GET",
  });
  const remoteUrlBody = await remoteUrl.json();

  assert.equal(remoteUrl.status, 400);
  assert.equal(remoteUrlBody.error.code, "ingest_connector_mcp_fixture_url_invalid");

  const missingPath = await fetch("local://ingest-connector-mcp-api/v1/ingest/connectors/mcp/not-recorded", {
    method: "GET",
  });
  const missingPathBody = await missingPath.json();

  assert.equal(missingPath.status, 404);
  assert.equal(missingPathBody.error.code, "ingest_connector_mcp_fixture_request_not_found");
  assert.equal(missingPathBody.error.details.path, "/v1/ingest/connectors/mcp/not-recorded");

  const methodMismatch = await fetch("local://ingest-connector-mcp-api/v1/ingest/connectors/mcp/resources", {
    method: "PUT",
  });
  const methodMismatchBody = await methodMismatch.json();

  assert.equal(methodMismatch.status, 405);
  assert.equal(methodMismatchBody.error.code, "ingest_connector_mcp_fixture_method_mismatch");
  assert.deepEqual(methodMismatchBody.error.details.allowedMethods, ["GET"]);

  const bodyDrift = await fetch(urlFor(bundle, fixtureRequest(bundle, "mcp_ingest_connector_preview_local_files")), {
    method: "POST",
    body: JSON.stringify({
      connectorId: "local.files",
      includeContent: true,
      apiKey: rawSecret,
      rootPath: rawPath,
    }),
  });
  const bodyDriftBody = await bodyDrift.json();

  assert.equal(bodyDrift.status, 422);
  assert.equal(bodyDriftBody.error.code, "ingest_connector_mcp_fixture_body_mismatch");
  assert.deepEqual(
    bodyDriftBody.error.details.candidateRequestIds.includes("mcp_ingest_connector_preview_local_files"),
    true,
  );
  assertNoSensitiveText(bodyDriftBody);
  assertNoSensitiveText(fetch.calls.at(-1));
});

test("keeps fixture, response, clone, and call boundaries isolated", async () => {
  const sourceBundle = loadIngestConnectorMcpFixtureBundle();
  const mutableBundle = structuredClone(sourceBundle);
  const mutableEntry = fixtureRequest(mutableBundle, "mcp_ingest_connector_resources");
  const fetch = createIngestConnectorMcpFixtureFetch(mutableBundle);

  mutableEntry.expectedBody.resources[0].connector.label = "Mutated after fetch creation";

  const response = await fetch(urlFor(sourceBundle, fixtureRequest(sourceBundle, "mcp_ingest_connector_resources")), {
    method: "GET",
  });
  const firstJson = await response.json();
  firstJson.resources[0].connector.label = "Mutated response body";
  const secondJson = await response.json();
  const clonedJson = await response.clone().json();
  clonedJson.resources[0].connector.label = "Mutated clone body";

  assert.equal(
    secondJson.resources[0].connector.label,
    fixtureRequest(sourceBundle, "mcp_ingest_connector_resources").expectedBody.resources[0].connector.label,
  );
  assert.equal(
    (await response.json()).resources[0].connector.label,
    fixtureRequest(sourceBundle, "mcp_ingest_connector_resources").expectedBody.resources[0].connector.label,
  );
  assert.throws(
    () => {
      fetch.calls[0].status = 500;
    },
    TypeError,
  );
  assert.throws(
    () => {
      fetch.calls.push({
        url: "local://ingest-connector-mcp-api/v1/ingest/connectors/mcp/resources",
        method: "GET",
        path: "/v1/ingest/connectors/mcp/resources",
        status: 200,
      });
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

test("validates MCP fixture schema, uniqueness, local-only base, routes, methods, and checks", () => {
  const bundle = loadIngestConnectorMcpFixtureBundle();

  const invalidSchema = structuredClone(bundle);
  invalidSchema.schemaVersion = "wrong";
  assertInvalidFixture(
    () => createIngestConnectorMcpFixtureFetch(invalidSchema),
    ["schemaVersion"],
  );

  const duplicateId = structuredClone(bundle);
  duplicateId.requests[1].id = duplicateId.requests[0].id;
  assertInvalidFixture(
    () => createIngestConnectorMcpFixtureFetch(duplicateId),
    ["requests.1.id"],
  );

  const remoteBase = structuredClone(bundle);
  remoteBase.apiBase = "https://example.com";
  assertInvalidFixture(
    () => createIngestConnectorMcpFixtureFetch(remoteBase),
    ["apiBase"],
  );

  const routeDrift = structuredClone(bundle);
  fixtureRequest(routeDrift, "mcp_ingest_connector_resources").path = "/v1/ingest/connectors";
  assertInvalidFixture(
    () => createIngestConnectorMcpFixtureFetch(routeDrift),
    ["requests.0.path"],
  );

  const methodDrift = structuredClone(bundle);
  fixtureRequest(methodDrift, "mcp_ingest_connector_resources").method = "POST";
  assertInvalidFixture(
    () => createIngestConnectorMcpFixtureFetch(methodDrift),
    ["requests.0.method"],
  );

  const bodyDrift = structuredClone(bundle);
  fixtureRequest(bodyDrift, "mcp_ingest_connector_resources").body = {};
  assertInvalidFixture(
    () => createIngestConnectorMcpFixtureFetch(bodyDrift),
    ["requests.0.body"],
  );

  const checkDrift = structuredClone(bundle);
  fixtureRequest(checkDrift, "mcp_ingest_connector_resources").expectedChecks.connectorIds = ["local.files"];
  assertInvalidFixture(
    () => createIngestConnectorMcpFixtureFetch(checkDrift),
    ["requests.0.expectedChecks.connectorIds"],
  );

  const sharedSchemaDrift = structuredClone(bundle);
  fixtureRequest(
    sharedSchemaDrift,
    "mcp_ingest_connector_local_files_resource",
  ).expectedBody.resource.resource.description = "Password reset content";
  assertInvalidFixture(
    () => createIngestConnectorMcpFixtureFetch(sharedSchemaDrift),
    ["requests.1.expectedBody.resource.resource.description"],
    { sharedSchema: true },
  );

  const remoteHarnessBase = structuredClone(bundle);
  assertInvalidFixture(
    () => createIngestConnectorMcpFixtureClientHarness({
      bundle: remoteHarnessBase,
      baseUrl: "https://example.com/v1/",
    }),
    ["baseUrl"],
  );
});

test("surfaces MCP fixture route drift as a client HTTP error", async () => {
  const bundle = loadIngestConnectorMcpFixtureBundle();
  const harness = createIngestConnectorMcpFixtureClientHarness({
    bundle,
    baseUrl: "local://ingest-connector-mcp-api/v1/drifted",
  });

  const result = await toApiResult(harness.client.listResources());

  assert.equal(result.ok, false);
  assert.equal(result.error instanceof ApiHttpError, true);
  assert.equal(result.error.status, 404);
  assert.equal(result.error.apiCode, "ingest_connector_mcp_fixture_request_not_found");
});

function assertInvalidFixture(action, expectedPaths, options = {}) {
  assert.throws(
    action,
    (error) => {
      assert.equal(error instanceof IngestConnectorMcpFixtureError, true);
      assert.equal(error.code, "ingest_connector_mcp_fixture_invalid");
      assert.deepEqual(
        expectedPaths.every((path) => error.issues.some((issue) => issue.path === path)),
        true,
      );
      if (options.sharedSchema === true) {
        assert.equal(
          error.issues.some((issue) => issue.message.startsWith("shared schema:")),
          true,
        );
      }
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

function expectedResponseBody(entry) {
  return structuredClone(entry.expectedBody);
}

function urlFor(bundle, entry) {
  return new URL(entry.path, bundle.apiBase ?? "local://ingest-connector-mcp-api").href;
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
  assert.equal(serialized.includes("sovereignops-codex-pack"), false);
}
