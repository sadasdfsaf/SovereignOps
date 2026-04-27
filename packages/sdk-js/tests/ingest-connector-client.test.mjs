import assert from "node:assert/strict";
import test from "node:test";

import { createApiRouter } from "../../../apps/api/src/router.ts";
import { createIngestConnectorRoutes } from "../../../apps/api/src/ingestConnectorRoutes.ts";
import {
  ApiHttpError,
  ApiNetworkError,
  ApiRequestValidationError,
  ApiResponseParseError,
  ApiResponseValidationError,
  createIngestConnectorClient,
  toApiResult,
} from "../src/index.ts";

const privatePath = "E:\\SovereignOps\\.codex-private\\round48\\plan.md";
const rawSecret = "sk-testsecret123";

test("loads and normalizes local ingest connector manifest via injected fetch", async () => {
  const fetch = apiRouterFetch();
  const client = createIngestConnectorClient({
    baseUrl: "local://api/v1",
    apiKey: "test-key",
    fetch,
  });

  const manifest = await client.getManifest();

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
  assert.equal(manifest.profiles[0].safety.networkAccess, false);
  assert.equal(fetch.calls.length, 1);
  assert.equal(fetch.calls[0].url, "local://api/v1/ingest/connectors");
  assert.equal(fetch.calls[0].init.method, "GET");
  assert.equal(fetch.calls[0].init.headers.accept, "application/json");
  assert.equal(fetch.calls[0].init.headers.authorization, "Bearer test-key");
  assert.equal(fetch.calls[0].init.headers["content-type"], undefined);
  assert.equal(fetch.calls[0].init.body, undefined);
  assert.throws(() => {
    manifest.profiles[0].capabilities.push("mutated");
  }, TypeError);

  const repeated = await client.manifest();
  assert.notEqual(repeated, manifest);
  assert.deepEqual(repeated.profiles[1].capabilities, manifest.profiles[1].capabilities);
});

test("builds frozen connector readiness from the fetched manifest", async () => {
  const fetch = apiRouterFetch();
  const client = createIngestConnectorClient({
    baseUrl: "local://api/v1/",
    fetch,
  });

  const readiness = await client.getReadiness();

  assert.equal(readiness.kind, "ingest.connector_readiness");
  assert.equal(readiness.schemaVersion, "ingest-connector-manifest/v1");
  assert.equal(readiness.profileCount, 3);
  assert.equal(readiness.readyCount, 2);
  assert.equal(readiness.attentionCount, 0);
  assert.equal(readiness.blockedCount, 1);
  assert.deepEqual(readiness.byStatus, {
    ready: 2,
    attention: 0,
    blocked: 1,
  });
  assert.deepEqual(
    readiness.profiles.map((profile) => [profile.profileId, profile.status, profile.issueCodes]),
    [
      ["local.manual", "ready", []],
      ["local.files", "ready", []],
      ["local.workspace-index", "blocked", ["trusted-by-default"]],
    ],
  );
  assert.equal(fetch.calls.length, 1);
  assert.throws(() => {
    readiness.profiles[2].issueCodes.push("mutated");
  }, TypeError);
});

test("requires injected fetch instead of falling back to global fetch", () => {
  assert.throws(
    () => createIngestConnectorClient({ baseUrl: "local://api/v1" }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(error.issues.map((issue) => issue.path), ["fetch"]);
      return true;
    },
  );
});

test("keeps manifest response errors typed and redacted", async () => {
  const shapeClient = createIngestConnectorClient({
    baseUrl: "local://api/v1",
    fetch: fakeFetch([
      jsonResponse(200, {
        connectors: [
          {
            id: "json",
            connector: "json",
            default_options: {
              api_key: rawSecret,
            },
          },
        ],
      }),
    ]),
  });

  await assert.rejects(
    shapeClient.getManifest(),
    (error) => {
      assert.equal(error instanceof ApiResponseValidationError, true);
      assert.equal(error.issues.some((issue) => issue.message.includes("raw_secret")), true);
      assertNoSensitiveText(error);
      return true;
    },
  );

  const invalidJsonClient = createIngestConnectorClient({
    baseUrl: "local://api/v1",
    fetch: fakeFetch([
      textResponse(200, `{"path":"${privatePath}","token":"${rawSecret}"`, {
        "content-type": "application/json",
      }),
    ]),
  });

  await assert.rejects(
    invalidJsonClient.getManifest(),
    (error) => {
      assert.equal(error instanceof ApiResponseParseError, true);
      assert.equal(error.status, 200);
      assertNoSensitiveText(error);
      assertNoSensitiveText(error.rawBody);
      return true;
    },
  );

  const httpClient = createIngestConnectorClient({
    baseUrl: "local://api/v1",
    fetch: fakeFetch([
      jsonResponse(500, {
        error: {
          code: "connector_manifest_failed",
          message: `Connector manifest failed at ${privatePath} with ${rawSecret}`,
          details: {
            path: privatePath,
            token: rawSecret,
          },
        },
      }),
    ]),
  });

  const httpResult = await toApiResult(httpClient.getManifest());
  assert.equal(httpResult.ok, false);
  assert.equal(httpResult.error instanceof ApiHttpError, true);
  assert.equal(httpResult.error.status, 500);
  assert.equal(httpResult.error.apiCode, "connector_manifest_failed");
  assertNoSensitiveText(httpResult.error);

  const networkClient = createIngestConnectorClient({
    baseUrl: "local://api/v1",
    fetch: fakeFetch([
      new Error(`offline at ${privatePath} with ${rawSecret}`),
    ]),
  });

  const networkResult = await toApiResult(networkClient.getReadiness());
  assert.equal(networkResult.ok, false);
  assert.equal(networkResult.error instanceof ApiNetworkError, true);
  assert.equal(networkResult.error.code, "SO_API_NETWORK_ERROR");
  assertNoSensitiveText(networkResult.error);
  assertNoSensitiveText(networkResult.error.cause);
});

function apiRouterFetch() {
  const router = createApiRouter(createIngestConnectorRoutes());
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const response = await router.dispatch({
      method: init.method,
      path: new URL(url).pathname,
      body: init.body === undefined ? undefined : JSON.parse(init.body),
    });
    return textResponse(response.status, JSON.stringify(response.body), response.headers);
  };
  fetch.calls = calls;
  return fetch;
}

function fakeFetch(items) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const next = items.shift();
    if (next instanceof Error) {
      throw next;
    }
    if (next === undefined) {
      throw new Error("fake fetch response queue is empty");
    }
    return next;
  };
  fetch.calls = calls;
  return fetch;
}

function jsonResponse(status, body, headers = {}) {
  return textResponse(status, JSON.stringify(body), {
    "content-type": "application/json",
    ...headers,
  });
}

function textResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: statusTextFor(status),
    headers: headersLike(headers),
    async text() {
      return body;
    },
  };
}

function headersLike(headers) {
  const normalized = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    get(name) {
      return normalized.get(name.toLowerCase()) ?? null;
    },
  };
}

function statusTextFor(status) {
  if (status === 200) {
    return "OK";
  }
  if (status === 500) {
    return "Internal Server Error";
  }
  return "";
}

function assertNoSensitiveText(value) {
  const serialized = JSON.stringify(value) ?? String(value);
  assert.equal(serialized.includes(rawSecret), false);
  assert.equal(serialized.includes(".codex-private"), false);
  assert.equal(serialized.includes("SovereignOps"), false);
}
