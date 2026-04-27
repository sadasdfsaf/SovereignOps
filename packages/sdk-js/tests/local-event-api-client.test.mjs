import assert from "node:assert/strict";
import test from "node:test";

import {
  ApiHttpError,
  ApiNetworkError,
  ApiRequestValidationError,
  ApiResponseValidationError,
  toApiResult,
} from "../src/client.ts";
import {
  createLocalEventApiClient,
} from "../src/localEventApiClient.ts";
import {
  createLocalEventCatalogFixtureFetch,
  loadLocalEventCatalogFixture,
} from "../src/localEvents.ts";

test("fetches local event catalog routes through injected fixture fetch", async () => {
  const sourceCatalog = loadLocalEventCatalogFixture();
  const fetch = createLocalEventCatalogFixtureFetch(sourceCatalog);
  const client = createLocalEventApiClient({
    baseUrl: "http://127.0.0.1:7317/v1",
    apiKey: "test-key",
    fetch,
  });

  const catalog = await client.getCatalog();
  const summary = await client.summary();
  const replay = await client.replayBatches({
    batchSize: 2,
    schemaKinds: ["approvals"],
  });

  assert.equal(catalog.workspaceId, "wsp_local_fixtures");
  assert.equal(catalog.events.length, 6);
  assert.equal(Object.isFrozen(catalog.events[0].payload), true);
  assert.equal(summary.eventCount, 6);
  assert.equal(summary.operations.append, 2);
  assert.deepEqual(
    replay.batches.map((batch) => [batch.firstSequence, batch.lastSequence]),
    [[5, 6]],
  );
  assert.deepEqual(fetch.calls.map((call) => [call.method, call.route, call.status]), [
    ["GET", "catalog", 200],
    ["GET", "summary", 200],
    ["GET", "replayBatches", 200],
  ]);
  assert.equal(
    fetch.calls[2].path,
    "/v1/local-events/replay-batches?batchSize=2&schemaKind=approvals",
  );
});

test("exports local event replay packages through the API client", async () => {
  const fetch = fakeFetch([
    jsonResponse(200, {
      kind: "audit-export.local-event-replay.content",
      format: "jsonl",
      mediaType: "application/jsonl",
      content: "{\"recordId\":\"evt_local_01\"}",
      fingerprint: "fnv1a64:1111111111111111",
      exportId: "local_replay_export",
      createdAt: "2026-04-27T02:00:00.000Z",
      manifest: {
        kind: "local-events.catalog-replay-export.manifest",
      },
    }),
  ]);
  const client = createLocalEventApiClient({
    baseUrl: "https://api.example.test/v1",
    fetch,
  });

  const exported = await client.exportReplay({
    format: "jsonl",
    catalogPath: "examples/local-events/catalog.json",
    filters: {
      recordType: "canonical_event",
    },
  });

  assert.equal(exported.kind, "audit-export.local-event-replay.content");
  assert.equal(exported.format, "jsonl");
  assert.equal(Object.isFrozen(exported.manifest), true);
  assert.equal(fetch.calls[0].url, "https://api.example.test/v1/local-events/replay-export");
  assert.equal(fetch.calls[0].init.method, "POST");
  assert.equal(fetch.calls[0].init.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), {
    catalogPath: "examples/local-events/catalog.json",
    filters: {
      recordType: "canonical_event",
    },
    format: "jsonl",
  });
});

test("uses stable URLs and JSON headers without touching global fetch", async () => {
  const response = {
    eventCount: 0,
    redactedEventCount: 0,
    redactedFieldCount: 0,
    operations: {
      append: 0,
      update: 0,
      delete: 0,
      approval_requested: 0,
      approval_approved: 0,
      approval_rejected: 0,
    },
    schemaKinds: {
      docs: 0,
      projects: 0,
      incidents: 0,
      comments: 0,
      attachments: 0,
      approvals: 0,
    },
    operationSchemaKinds: [],
    actorIds: [],
    recordIds: [],
  };
  const fetch = fakeFetch([
    jsonResponse(200, response),
  ]);
  const client = createLocalEventApiClient({
    baseUrl: "https://api.example.test/v1/",
    apiKey: "local-key",
    headers: {
      "x-local-client": "sdk-test",
    },
    fetch,
  });

  const summary = await client.getSummary();

  assert.deepEqual(summary, response);
  assert.equal(fetch.calls.length, 1);
  assert.equal(fetch.calls[0].url, "https://api.example.test/v1/local-events/summary");
  assert.equal(fetch.calls[0].init.method, "GET");
  assert.equal(fetch.calls[0].init.headers.accept, "application/json");
  assert.equal(fetch.calls[0].init.headers.authorization, "Bearer local-key");
  assert.equal(fetch.calls[0].init.headers["x-local-client"], "sdk-test");
  assert.equal(fetch.calls[0].init.headers["content-type"], undefined);
  assert.equal(fetch.calls[0].init.body, undefined);
});

test("validates replay batch queries before fetch is called", async () => {
  const fetch = fakeFetch([]);
  const client = createLocalEventApiClient({
    baseUrl: "https://api.example.test/v1",
    fetch,
  });

  await assert.rejects(
    client.getReplayBatches({
      batchSize: 0,
      operations: ["missing"],
      startSequence: 5,
      endSequence: 4,
    }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(
        error.issues.map((issue) => issue.path),
        ["batchSize", "operations.0", "endSequence"],
      );
      return true;
    },
  );
  assert.equal(fetch.calls.length, 0);

  await assert.rejects(
    client.exportReplay({
      format: "xml",
      filters: [],
    }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(
        error.issues.map((issue) => issue.path),
        ["format", "filters"],
      );
      return true;
    },
  );
  assert.equal(fetch.calls.length, 0);
});

test("rejects malformed responses and keeps HTTP and network errors typed", async () => {
  const fetch = fakeFetch([
    jsonResponse(200, {
      eventCount: "6",
      redactedEventCount: 0,
      redactedFieldCount: 0,
      operations: {},
      schemaKinds: {},
      operationSchemaKinds: [],
      actorIds: [],
      recordIds: [],
    }),
    jsonResponse(404, {
      error: {
        code: "local_event_fixture_route_not_found",
        message: "No local event route matched the path.",
        details: {
          path: "/v1/local-events/catalog",
        },
      },
    }),
  ]);
  const client = createLocalEventApiClient({
    baseUrl: "https://api.example.test/v1",
    fetch,
  });

  await assert.rejects(
    client.getSummary(),
    (error) => {
      assert.equal(error instanceof ApiResponseValidationError, true);
      assert.equal(error.issues.some((issue) => issue.path === "eventCount"), true);
      assert.equal(error.issues.some((issue) => issue.path === "operations.append"), true);
      return true;
    },
  );

  const httpResult = await toApiResult(client.getCatalog());
  assert.equal(httpResult.ok, false);
  assert.equal(httpResult.error instanceof ApiHttpError, true);
  assert.equal(httpResult.error.status, 404);
  assert.equal(httpResult.error.apiCode, "local_event_fixture_route_not_found");
  assert.deepEqual(httpResult.error.details, { path: "/v1/local-events/catalog" });

  const networkClient = createLocalEventApiClient({
    baseUrl: "https://api.example.test/v1",
    fetch: fakeFetch([new Error("offline")]),
  });
  const networkResult = await toApiResult(networkClient.getCatalog());
  assert.equal(networkResult.ok, false);
  assert.equal(networkResult.error instanceof ApiNetworkError, true);
});

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
  if (status === 404) {
    return "Not Found";
  }
  return "";
}
