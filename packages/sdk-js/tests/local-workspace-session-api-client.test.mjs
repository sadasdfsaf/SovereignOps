import assert from "node:assert/strict";
import test from "node:test";

import {
  ApiHttpError,
  ApiNetworkError,
  ApiRequestValidationError,
  ApiResponseParseError,
  ApiResponseValidationError,
  toApiResult,
} from "../src/client.ts";
import {
  LOCAL_WORKSPACE_SESSION_SCHEMA_VERSION,
  planLocalWorkspaceSessionOpenEvent,
} from "../src/localWorkspaceSession.ts";
import {
  WORKSPACE_SESSION_API_SCHEMA_VERSION,
  createLocalWorkspaceSessionApiClient,
} from "../src/localWorkspaceSessionApiClient.ts";

const descriptor = {
  workspaceId: "wsp_alpha",
  deviceId: "dev_laptop",
  rootKeyRef: "key_alpha",
  createdAt: "2026-04-27T00:00:00.000Z",
  updatedAt: "2026-04-27T00:00:00.000Z",
  storagePath: "workspaces/wsp_alpha/session.json",
  gateway: {
    host: "localhost",
    port: 48231,
  },
};
const normalizedDescriptor = {
  ...descriptor,
  gateway: {
    transport: "http",
    host: "localhost",
    port: 48231,
  },
};
const sessionId = "sess_alpha_laptop_001";
const lockToken = "lock_alpha_laptop_001";
const redactedStoragePath = "[redacted:path:abc1234]";

function summaryResponse(overrides = {}) {
  return {
    kind: "workspace-session.summary",
    schemaVersion: WORKSPACE_SESSION_API_SCHEMA_VERSION,
    localOnly: true,
    durableWrites: false,
    workspaceId: "wsp_alpha",
    deviceId: "dev_laptop",
    storage: {
      localOnly: true,
      storagePath: redactedStoragePath,
      storagePathRedacted: true,
    },
    gateway: structuredClone(normalizedDescriptor.gateway),
    session: {
      sessionId,
      operations: ["open", "lock"],
    },
    ...overrides,
  };
}

function openEventFixture() {
  return planLocalWorkspaceSessionOpenEvent({
    descriptor,
    sessionId,
    sequence: 1,
    createdAt: "2026-04-27T00:01:00.000Z",
  });
}

function previewEventFixture() {
  const event = structuredClone(openEventFixture());
  event.payload.storagePath = redactedStoragePath;
  event.payload.storagePathRedacted = true;
  return event;
}

function auditRecordFixture() {
  return {
    auditId: "aud_wsp_alpha_open_00000001",
    workspaceId: "wsp_alpha",
    action: "workspace.session.opened",
    actor: "sdk-worker-b",
    createdAt: "2026-04-27T00:03:00.000Z",
    details: {
      kind: "localWorkspaceSessionAuditPreview",
      schemaVersion: LOCAL_WORKSPACE_SESSION_SCHEMA_VERSION,
      eventId: "evt_wsp_alpha_open_00000001",
      sequence: 1,
      sessionId,
      operation: "open",
      localOnly: true,
      storagePath: redactedStoragePath,
      storagePathDisplay: ".../session.json",
      gateway: structuredClone(normalizedDescriptor.gateway),
      redaction: {
        redacted: true,
        fields: ["storagePath"],
      },
    },
  };
}

function auditPreviewResponse(overrides = {}) {
  return {
    kind: "workspace-session.audit-preview",
    schemaVersion: WORKSPACE_SESSION_API_SCHEMA_VERSION,
    localOnly: true,
    durableWrites: false,
    summary: summaryResponse({
      session: {
        sessionId,
        operations: ["open"],
      },
    }),
    events: [previewEventFixture()],
    audit: {
      kind: "workspace-session.audit-preview.records",
      localOnly: true,
      redacted: true,
      recordCount: 1,
      records: [auditRecordFixture()],
    },
    ...overrides,
  };
}

test("fetches workspace session summaries through injected fetch with stable request shape", async () => {
  const response = summaryResponse();
  const fetch = fakeFetch([
    jsonResponse(200, response),
  ]);
  const client = createLocalWorkspaceSessionApiClient({
    baseUrl: "https://api.example.test/v1/",
    apiKey: "local-key",
    headers: {
      "x-local-client": "sdk-test",
    },
    fetch,
  });

  const summary = await client.summary({
    descriptor,
    sessionId,
    operations: ["open", "lock"],
  });

  assert.deepEqual(summary, response);
  assert.equal(Object.isFrozen(summary), true);
  assert.equal(Object.isFrozen(summary.gateway), true);
  assert.equal(fetch.calls.length, 1);
  assert.equal(fetch.calls[0].url, "https://api.example.test/v1/workspace-session/summary");
  assert.equal(fetch.calls[0].init.method, "POST");
  assert.equal(fetch.calls[0].init.headers.accept, "application/json");
  assert.equal(fetch.calls[0].init.headers.authorization, "Bearer local-key");
  assert.equal(fetch.calls[0].init.headers["x-local-client"], "sdk-test");
  assert.equal(fetch.calls[0].init.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), {
    descriptor: normalizedDescriptor,
    sessionId,
    operations: ["open", "lock"],
  });
});

test("posts audit preview event plans and returns immutable nested audit records", async () => {
  const response = auditPreviewResponse();
  const fetch = fakeFetch([
    jsonResponse(200, response),
  ]);
  const client = createLocalWorkspaceSessionApiClient({
    baseUrl: "https://api.example.test/v1",
    fetch,
  });

  const preview = await client.auditPreview({
    descriptor,
    sessionId,
    events: [{
      operation: "open",
      sequence: 1,
      createdAt: "2026-04-27T00:01:00.000Z",
      reason: "local session request",
    }],
    actor: "sdk-worker-b",
    createdAt: "2026-04-27T00:03:00.000Z",
  });

  assert.equal(fetch.calls[0].url, "https://api.example.test/v1/workspace-session/audit-preview");
  assert.equal(fetch.calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), {
    descriptor: normalizedDescriptor,
    sessionId,
    events: [{
      operation: "open",
      sequence: 1,
      createdAt: "2026-04-27T00:01:00.000Z",
      reason: "local session request",
    }],
    actor: "sdk-worker-b",
    createdAt: "2026-04-27T00:03:00.000Z",
  });
  assert.deepEqual(preview, response);
  assert.equal(Object.isFrozen(preview.audit.records), true);
  assert.equal(Object.isFrozen(preview.audit.records[0].details), true);
  assert.throws(() => {
    preview.audit.records[0].details.gateway.port = 1;
  }, TypeError);
});

test("validates descriptor, session id, and operation arrays before fetch", async () => {
  const fetch = fakeFetch([]);
  const client = createLocalWorkspaceSessionApiClient({
    baseUrl: "https://api.example.test/v1",
    fetch,
  });

  await assert.rejects(
    client.getSummary({
      descriptor: {
        ...descriptor,
        workspaceId: "alpha",
      },
      sessionId: "bad-session",
      operations: ["open", "missing"],
    }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.equal(error.issues.some((issue) => issue.path.includes("descriptor")), true);
      assert.equal(error.issues.some((issue) => issue.path === "sessionId"), true);
      assert.equal(error.issues.some((issue) => issue.path === "operations.1"), true);
      return true;
    },
  );
  assert.equal(fetch.calls.length, 0);
});

test("validates audit preview descriptor, session id, and event plans before fetch", async () => {
  const fetch = fakeFetch([]);
  const client = createLocalWorkspaceSessionApiClient({
    baseUrl: "https://api.example.test/v1",
    fetch,
  });

  await assert.rejects(
    client.previewAudit({
      descriptor,
      sessionId: "bad-session",
      events: [{
        operation: "open",
        sequence: 0,
        createdAt: "not-a-timestamp",
        lockToken,
      }],
      actor: "",
      createdAt: "not-a-timestamp",
    }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.equal(error.issues.some((issue) => issue.path === "sessionId"), true);
      assert.equal(error.issues.some((issue) => issue.path === "events.0.sequence"), true);
      assert.equal(error.issues.some((issue) => issue.path === "events.0.createdAt"), true);
      assert.equal(error.issues.some((issue) => issue.path === "events.0.lockToken"), true);
      assert.equal(error.issues.some((issue) => issue.path === "actor"), true);
      assert.equal(error.issues.some((issue) => issue.path === "createdAt"), true);
      return true;
    },
  );
  assert.equal(fetch.calls.length, 0);
});

test("keeps malformed JSON, malformed success bodies, HTTP errors, and network errors typed", async () => {
  const client = createLocalWorkspaceSessionApiClient({
    baseUrl: "https://api.example.test/v1",
    fetch: fakeFetch([
      jsonResponse(200, summaryResponse({
        storage: {
          localOnly: true,
          storagePath: "workspaces/wsp_alpha/session.json",
          storagePathRedacted: true,
        },
      })),
      textResponse(200, "{", { "content-type": "application/json" }),
      jsonResponse(409, {
        error: {
          code: "workspace_session_conflict",
          message: "Workspace session is not available.",
          details: {
            sessionId,
          },
        },
      }),
    ]),
  });

  await assert.rejects(
    client.getSummary({
      descriptor,
      sessionId,
      operations: ["open"],
    }),
    (error) => {
      assert.equal(error instanceof ApiResponseValidationError, true);
      assert.equal(error.issues.some((issue) => issue.path === "storage.storagePath"), true);
      return true;
    },
  );

  await assert.rejects(
    client.previewAudit({
      descriptor,
      sessionId,
      events: [{
        operation: "open",
        sequence: 1,
        createdAt: "2026-04-27T00:01:00.000Z",
      }],
    }),
    (error) => {
      assert.equal(error instanceof ApiResponseParseError, true);
      assert.equal(error.rawBody, "{");
      return true;
    },
  );

  const httpResult = await toApiResult(client.previewAudit({
    descriptor,
    sessionId,
    events: [{
      operation: "open",
      sequence: 1,
      createdAt: "2026-04-27T00:01:00.000Z",
    }],
  }));
  assert.equal(httpResult.ok, false);
  assert.equal(httpResult.error instanceof ApiHttpError, true);
  assert.equal(httpResult.error.status, 409);
  assert.equal(httpResult.error.apiCode, "workspace_session_conflict");
  assert.deepEqual(httpResult.error.details, { sessionId });

  const networkClient = createLocalWorkspaceSessionApiClient({
    baseUrl: "https://api.example.test/v1",
    fetch: fakeFetch([new Error("offline")]),
  });
  const networkResult = await toApiResult(networkClient.getSummary({
    descriptor,
    sessionId,
    operations: ["open"],
  }));
  assert.equal(networkResult.ok, false);
  assert.equal(networkResult.error instanceof ApiNetworkError, true);
});

test("preserves clone boundaries for mutable requests and responses", async () => {
  const mutableDescriptor = structuredClone(descriptor);
  const mutableOperations = ["open"];
  const mutableResponse = summaryResponse({
    session: {
      sessionId,
      operations: ["open"],
    },
  });
  const fetch = fakeFetch([
    jsonResponse(200, mutableResponse),
  ]);
  const client = createLocalWorkspaceSessionApiClient({
    baseUrl: "https://api.example.test/v1",
    fetch,
  });

  const summary = await client.getSummary({
    descriptor: mutableDescriptor,
    sessionId,
    operations: mutableOperations,
  });
  mutableDescriptor.gateway.host = "127.0.0.1";
  mutableDescriptor.gateway.port = 10;
  mutableDescriptor.storagePath = "workspaces/wsp_alpha/changed.json";
  mutableOperations.push("lock");
  mutableResponse.gateway.port = 9;
  mutableResponse.session.operations.push("lock");

  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), {
    descriptor: normalizedDescriptor,
    sessionId,
    operations: ["open"],
  });
  assert.equal(summary.gateway.host, "localhost");
  assert.equal(summary.gateway.port, 48231);
  assert.deepEqual(summary.session.operations, ["open"]);
  assert.throws(() => {
    summary.gateway.port = 1;
  }, TypeError);
  assert.throws(() => {
    summary.session.operations.push("lock");
  }, TypeError);
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
  const text = JSON.stringify(body);
  return textResponse(status, text, {
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
  if (status === 409) {
    return "Conflict";
  }
  return "";
}
