import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ApiHttpError,
  ApiNetworkError,
  ApiRequestValidationError,
  ApiResponseValidationError,
  toApiResult,
} from "../src/client.ts";
import {
  LocalEventApiClient,
  createLocalEventApiClient,
} from "../src/localEventApiClient.ts";
import {
  createLocalEventCatalogFixtureFetch,
} from "../src/localEvents.ts";
import {
  createLocalEventReplayExportPackage,
} from "../../../packages/audit-export/src/localEventReplayExport.ts";

const sdkSessionUrl = new URL("../../../examples/local-events/sdk-session.json", import.meta.url);

test("reproduces the documented local event SDK session through fake fetch", async () => {
  const session = readJson(sdkSessionUrl);
  const apiRequests = readJson(new URL(`../../../${session.apiClient.requestFixture}`, import.meta.url));
  const catalogSource = readJson(new URL(`../../../${session.catalog.path}`, import.meta.url));
  const fixtureFetch = createLocalEventCatalogFixtureFetch({
    catalog: catalogSource,
    basePath: "/v1/local-events",
  });
  const exportRequest = {
    format: "package",
    catalogPath: session.catalog.path,
    createdAt: session.generatedAt,
    exportId: "local_event_sdk_session_package",
    filters: {
      recordType: "canonical_event",
    },
  };
  const exportPackage = createLocalEventReplayExportPackage(catalogSource, {
    createdAt: exportRequest.createdAt,
    exportId: exportRequest.exportId,
    filters: exportRequest.filters,
  });
  const fetch = fakeSessionFetch({
    fixtureFetch,
    exportPackage,
  });
  const client = new LocalEventApiClient({
    baseUrl: `${session.apiClient.apiBase}/v1`,
    apiKey: "sdk-session-key",
    headers: {
      "x-sdk-session": session.schemaVersion,
    },
    fetch,
  });

  const catalog = await client.catalog();
  const summary = await client.getSummary();
  const replay = await client.replayBatches({ batchSize: replayBatchSizeFromSession(session) });
  const exported = await client.replayExport(exportRequest);

  assert.equal(catalog.workspaceId, session.workspaceId);
  assert.equal(catalog.localOnly, true);
  assert.equal(catalog.events.length, session.catalog.eventCount);
  assert.deepEqual(catalog.events.map((event) => event.id), session.catalog.eventIds);
  assert.equal(Object.isFrozen(catalog), true);
  assert.equal(Object.isFrozen(catalog.events[0].payload), true);

  const documentedSummary = apiRequest(apiRequests, "local_event_summary_get").response.body;
  assert.equal(summary.workspaceId, documentedSummary.workspaceId);
  assert.equal(summary.eventCount, session.sdk.flow[1].returns.eventCount);
  assert.equal(summary.redactedEventCount, session.sdk.flow[1].returns.redactedEventCount);
  assert.equal(summary.redactedFieldCount, session.sdk.flow[1].returns.redactedFieldCount);
  assert.deepEqual(summary.operations, documentedSummary.operations);
  assert.deepEqual(summary.schemaKinds, documentedSummary.schemaKinds);
  assert.deepEqual(summary.actorIds, documentedSummary.actorIds);
  assert.deepEqual(summary.recordIds, documentedSummary.recordIds);
  assert.equal(Object.isFrozen(summary.operations), true);

  const documentedReplay = apiRequest(apiRequests, "local_event_replay_batches_get").response.body;
  assert.equal(replay.batches.length, documentedReplay.batchCount);
  assert.deepEqual(replay.batches.map(documentedBatchShape), documentedReplay.batches);
  assert.equal(replay.batches.at(-1).finalDigest, session.catalog.lastEventDigest);
  assert.match(replay.batches[0].batchId, /^local_event_replay_001_1_3_[a-z0-9]+$/);
  assert.equal(Object.isFrozen(replay.batches[0].events[0].payload), true);

  assert.equal(exported.kind, "audit-export.local-event-replay.package");
  assert.equal(exported.manifest.exportId, exportRequest.exportId);
  assert.equal(exported.manifest.createdAt, exportRequest.createdAt);
  assert.equal(exported.manifest.recordCount, session.catalog.eventCount);
  assert.deepEqual(exported.manifest.recordTypes, ["canonical_event"]);
  assert.equal(session.auditExport.formats.includes("package"), true);
  assert.match(exported.jsonl, /evt_catalog_001/);
  assert.match(exported.csv, /evt_catalog_005/);
  assert.equal(Object.isFrozen(exported), true);
  assert.equal(Object.isFrozen(exported.manifest.recordFingerprints), true);

  assert.deepEqual(
    fixtureFetch.calls.map((call) => ({
      method: call.method,
      path: call.path,
      route: call.route,
      status: call.status,
    })),
    session.sdk.fixtureFetchCalls,
  );
  assert.deepEqual(
    fetch.calls.map((call) => `${call.method} ${call.path}`),
    [
      ...session.sdk.fixtureFetchCalls.map((call) => `${call.method} ${call.path}`),
      "POST /v1/local-events/replay-export",
    ],
  );
  assert.equal(fetch.calls[0].url, `${session.apiClient.apiBase}/v1/local-events/catalog`);
  assert.equal(fetch.calls[0].init.headers.accept, "application/json");
  assert.equal(fetch.calls[0].init.headers.authorization, "Bearer sdk-session-key");
  assert.equal(fetch.calls[0].init.headers["x-sdk-session"], session.schemaVersion);
  assert.equal(fetch.calls[0].init.headers["content-type"], undefined);
  assert.equal(fetch.calls[3].url, `${session.apiClient.apiBase}/v1/local-events/replay-export`);
  assert.equal(fetch.calls[3].init.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(fetch.calls[3].init.body), exportRequest);

  assert.throws(() => {
    exported.manifest.recordFingerprints.push("mutated");
  }, TypeError);
});

test("keeps documented fixture response clone and call boundaries isolated", async () => {
  const session = readJson(sdkSessionUrl);
  const mutableCatalog = readJson(new URL(`../../../${session.catalog.path}`, import.meta.url));
  const fixtureFetch = createLocalEventCatalogFixtureFetch({
    catalog: mutableCatalog,
    basePath: "/v1/local-events",
  });
  mutableCatalog.events[0].id = "evt_mutated_after_fetch_creation";

  const response = await fixtureFetch(
    `${session.apiClient.apiBase}${session.sdk.fixtureFetchCalls[1].path}`,
    { method: "GET" },
  );
  const clonedJson = await response.clone().json();
  clonedJson.operations.append = 99;

  assert.equal((await response.json()).operations.append, 2);
  assert.equal((await response.json()).eventCount, session.catalog.eventCount);
  assert.throws(() => {
    fixtureFetch.calls[0].status = 500;
  }, TypeError);
});

test("keeps local event API client errors typed before and after fetch", async () => {
  const session = readJson(sdkSessionUrl);
  const fetch = queueFetch([
    jsonResponse(200, {
      eventCount: "5",
      redactedEventCount: 3,
      redactedFieldCount: 3,
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
    baseUrl: `${session.apiClient.apiBase}/v1/`,
    fetch,
  });

  await assert.rejects(
    client.replayBatches({
      batchSize: 0,
      startSequence: 5,
      endSequence: 4,
      operations: ["missing"],
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
    client.summary(),
    (error) => {
      assert.equal(error instanceof ApiResponseValidationError, true);
      assert.equal(error.issues.some((issue) => issue.path === "eventCount"), true);
      assert.equal(error.issues.some((issue) => issue.path === "operations.append"), true);
      assert.equal(Object.isFrozen(error.issues), true);
      return true;
    },
  );

  const httpResult = await toApiResult(client.catalog());
  assert.equal(httpResult.ok, false);
  assert.equal(httpResult.error instanceof ApiHttpError, true);
  assert.equal(httpResult.error.status, 404);
  assert.equal(httpResult.error.apiCode, "local_event_fixture_route_not_found");
  assert.deepEqual(httpResult.error.details, { path: "/v1/local-events/catalog" });

  const networkClient = createLocalEventApiClient({
    baseUrl: `${session.apiClient.apiBase}/v1`,
    fetch: queueFetch([new Error("offline")]),
  });
  const networkResult = await toApiResult(networkClient.getCatalog());
  assert.equal(networkResult.ok, false);
  assert.equal(networkResult.error instanceof ApiNetworkError, true);
});

function fakeSessionFetch({ fixtureFetch, exportPackage }) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const parsedUrl = new URL(url);
    const method = (init.method ?? "GET").toUpperCase();
    const path = `${parsedUrl.pathname}${parsedUrl.search}`;

    if (method === "POST" && path === "/v1/local-events/replay-export") {
      const response = jsonResponse(200, exportPackage);
      calls.push(freezeClone({
        url,
        init,
        method,
        path,
        status: response.status,
      }));
      return response;
    }

    const response = await fixtureFetch(url, init);
    calls.push(freezeClone({
      url,
      init,
      method,
      path,
      status: response.status,
    }));
    return response;
  };
  fetch.calls = calls;
  return fetch;
}

function queueFetch(items) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push(freezeClone({ url, init }));
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
  return new JsonResponse(status, body, {
    "content-type": "application/json",
    ...headers,
  });
}

class JsonResponse {
  constructor(status, body, headers) {
    this.ok = status >= 200 && status < 300;
    this.status = status;
    this.statusText = statusTextFor(status);
    this.headers = headersLike(headers);
    this.body = freezeClone(body);
    this.rawBody = JSON.stringify(this.body);
    Object.freeze(this);
  }

  async text() {
    return this.rawBody;
  }

  async json() {
    return structuredClone(this.body);
  }

  clone() {
    return new JsonResponse(this.status, this.body, { "content-type": "application/json" });
  }
}

function headersLike(headers) {
  const normalized = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return Object.freeze({
    get(name) {
      return normalized.get(name.toLowerCase()) ?? null;
    },
  });
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

function readJson(url) {
  return JSON.parse(readFileSync(url, "utf8"));
}

function apiRequest(apiRequests, id) {
  const request = apiRequests.requests.find((entry) => entry.id === id);
  assert.ok(request, `missing documented API request ${id}`);
  return request;
}

function replayBatchSizeFromSession(session) {
  const replayCall = session.sdk.fixtureFetchCalls.find((call) => call.route === "replayBatches");
  assert.ok(replayCall, "missing documented replay batch fixture call");
  return Number(new URL(`http://local.test${replayCall.path}`).searchParams.get("batchSize"));
}

function documentedBatchShape(batch) {
  return {
    batchIndex: batch.batchIndex,
    eventCount: batch.eventCount,
    firstSequence: batch.firstSequence,
    lastSequence: batch.lastSequence,
    firstEventId: batch.firstEventId,
    lastEventId: batch.lastEventId,
    previousDigest: batch.previousDigest,
    finalDigest: batch.finalDigest,
    eventRefs: batch.events.map((event) => `catalog.events[${event.sequence - 1}]`),
    payloadDigests: batch.events.map((event) => event.payloadDigest),
  };
}

function freezeClone(value) {
  return deepFreeze(structuredClone(value));
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return value;
}
