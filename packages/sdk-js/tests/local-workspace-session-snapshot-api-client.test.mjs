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
  WORKSPACE_SESSION_API_SCHEMA_VERSION,
} from "../src/localWorkspaceSessionApiClient.ts";
import {
  WORKSPACE_SESSION_SNAPSHOT_API_SCHEMA_VERSION,
  createLocalWorkspaceSessionSnapshotApiClient,
} from "../src/localWorkspaceSessionSnapshotApiClient.ts";

const descriptor = {
  workspaceId: "wsp_alpha",
  deviceId: "dev_laptop",
  rootKeyRef: "key_alpha",
  createdAt: "2026-04-27T00:00:00.000Z",
  updatedAt: "2026-04-27T00:00:00.000Z",
  storagePath: "workspaces/wsp_alpha/session.json",
  gateway: {
    transport: "http",
    host: "localhost",
    port: 48231,
  },
};
const sessionId = "sess_alpha_laptop_001";
const snapshotId = "snap:alpha_001";
const redactedStoragePath = "[redacted:path:abc1234]";
const snapshotFingerprint = `sha256:${"a".repeat(64)}`;
const recordFingerprint = `sha256:${"b".repeat(64)}`;

function auditPreviewRequest() {
  return {
    descriptor: structuredClone(descriptor),
    sessionId,
    events: [{
      operation: "open",
      sequence: 1,
      createdAt: "2026-04-27T00:01:00.000Z",
      reason: "local session request",
    }],
    actor: "sdk-worker-b",
    createdAt: "2026-04-27T00:03:00.000Z",
  };
}

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
    gateway: structuredClone(descriptor.gateway),
    session: {
      sessionId,
      operations: ["open"],
    },
    ...overrides,
  };
}

function previewEventFixture(overrides = {}) {
  return {
    eventId: "evt_wsp_alpha_open_00000001",
    workspaceId: "wsp_alpha",
    type: "workspace.session.opened",
    cursor: "1",
    sequence: 1,
    deviceId: "dev_laptop",
    createdAt: "2026-04-27T00:01:00.000Z",
    payload: {
      kind: "localWorkspaceSession",
      schemaVersion: "local-workspace-session/v1",
      operation: "open",
      sessionId,
      localOnly: true,
      storagePath: redactedStoragePath,
      storagePathRedacted: true,
      storagePathDisplay: ".../session.json",
      gateway: structuredClone(descriptor.gateway),
      reason: "local session request",
    },
    ...overrides,
  };
}

function auditRecordFixture(overrides = {}) {
  return {
    auditId: "aud_wsp_alpha_open_00000001",
    workspaceId: "wsp_alpha",
    action: "workspace.session.opened",
    actor: "sdk-worker-b",
    createdAt: "2026-04-27T00:03:00.000Z",
    details: {
      eventId: "evt_wsp_alpha_open_00000001",
      sessionId,
      operation: "open",
      localOnly: true,
      storagePath: redactedStoragePath,
      storagePathDisplay: ".../session.json",
      redaction: {
        redacted: true,
        fields: ["storagePath"],
      },
    },
    ...overrides,
  };
}

function auditPreviewResponse(overrides = {}) {
  return {
    kind: "workspace-session.audit-preview",
    schemaVersion: WORKSPACE_SESSION_API_SCHEMA_VERSION,
    localOnly: true,
    durableWrites: false,
    summary: summaryResponse(),
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

function snapshotPreviewResponse(overrides = {}) {
  return {
    kind: "workspace-session.snapshot-preview",
    schemaVersion: WORKSPACE_SESSION_SNAPSHOT_API_SCHEMA_VERSION,
    apiSchemaVersion: WORKSPACE_SESSION_API_SCHEMA_VERSION,
    localOnly: true,
    durableWrites: false,
    redacted: true,
    fingerprint: snapshotFingerprint,
    summary: {
      kind: "workspace-session.snapshot-summary",
      localOnly: true,
      redacted: true,
      workspaceId: "wsp_alpha",
      deviceId: "dev_laptop",
      sessionId,
      operations: ["open"],
      eventCount: 1,
      eventIds: ["evt_wsp_alpha_open_00000001"],
      auditRecordCount: 1,
      auditIds: ["aud_wsp_alpha_open_00000001"],
      auditActions: ["workspace.session.opened"],
    },
    auditPreview: auditPreviewResponse(),
    ...overrides,
  };
}

function snapshotRecord(overrides = {}) {
  const snapshot = snapshotPreviewResponse();
  return {
    kind: "workspace-session.snapshot-record",
    schemaVersion: WORKSPACE_SESSION_SNAPSHOT_API_SCHEMA_VERSION,
    localOnly: true,
    durableWrites: false,
    redacted: true,
    snapshotId,
    label: "local-baseline",
    metadata: {
      workflowId: "workspace-session",
      nested: {
        channel: "local",
      },
    },
    createdAt: "2026-04-27T00:05:00.000Z",
    updatedAt: "2026-04-27T00:05:00.000Z",
    fingerprint: recordFingerprint,
    snapshotFingerprint: snapshot.fingerprint,
    snapshot,
    ...overrides,
  };
}

function snapshotRecordSummary(overrides = {}) {
  return {
    snapshotId,
    label: "local-baseline",
    metadata: {
      workflowId: "workspace-session",
    },
    createdAt: "2026-04-27T00:05:00.000Z",
    updatedAt: "2026-04-27T00:05:00.000Z",
    fingerprint: recordFingerprint,
    snapshotFingerprint,
    workspaceId: "wsp_alpha",
    deviceId: "dev_laptop",
    sessionId,
    operations: ["open"],
    eventCount: 1,
    auditRecordCount: 1,
    ...overrides,
  };
}

test("previews workspace session snapshots through injected fetch", async () => {
  const response = snapshotPreviewResponse();
  const request = auditPreviewRequest();
  const fetch = fakeFetch([
    jsonResponse(200, response),
  ]);
  const client = createLocalWorkspaceSessionSnapshotApiClient({
    baseUrl: "https://api.example.test/v1/",
    apiKey: "local-key",
    headers: {
      "x-local-client": "snapshot-test",
    },
    fetch,
  });

  const preview = await client.preview(request);

  assert.deepEqual(preview, response);
  assert.equal(Object.isFrozen(preview), true);
  assert.equal(Object.isFrozen(preview.auditPreview.audit.records), true);
  assert.equal(fetch.calls.length, 1);
  assert.equal(fetch.calls[0].url, "https://api.example.test/v1/workspace-session/snapshots/preview");
  assert.equal(fetch.calls[0].init.method, "POST");
  assert.equal(fetch.calls[0].init.headers.accept, "application/json");
  assert.equal(fetch.calls[0].init.headers.authorization, "Bearer local-key");
  assert.equal(fetch.calls[0].init.headers["x-local-client"], "snapshot-test");
  assert.equal(fetch.calls[0].init.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), request);
});

test("creates, lists, and gets immutable snapshot records", async () => {
  const record = snapshotRecord();
  const created = {
    kind: "workspace-session.snapshot-record.created",
    schemaVersion: WORKSPACE_SESSION_SNAPSHOT_API_SCHEMA_VERSION,
    localOnly: true,
    durableWrites: false,
    record,
  };
  const listed = {
    kind: "workspace-session.snapshot-record.list",
    schemaVersion: WORKSPACE_SESSION_SNAPSHOT_API_SCHEMA_VERSION,
    localOnly: true,
    durableWrites: false,
    filters: {
      snapshotIds: [snapshotId],
      createdAfter: "2026-04-27T00:00:00.000Z",
    },
    pagination: {
      offset: 0,
      limit: 10,
      totalRecordCount: 1,
      matchedRecordCount: 1,
      returnedRecordCount: 1,
      hasMore: false,
    },
    records: [snapshotRecordSummary()],
  };
  const fetched = {
    kind: "workspace-session.snapshot-record.read",
    schemaVersion: WORKSPACE_SESSION_SNAPSHOT_API_SCHEMA_VERSION,
    localOnly: true,
    durableWrites: false,
    record,
  };
  const fetch = fakeFetch([
    jsonResponse(201, created),
    jsonResponse(201, created),
    jsonResponse(200, listed),
    jsonResponse(200, fetched),
  ]);
  const client = createLocalWorkspaceSessionSnapshotApiClient({
    baseUrl: "local://api/v1",
    fetch,
  });

  const createRequest = {
    snapshotId,
    label: "local-baseline",
    metadata: {
      workflowId: "workspace-session",
    },
    auditPreview: auditPreviewResponse(),
  };
  assert.deepEqual(await client.create(createRequest), created);
  assert.deepEqual(await client.create(auditPreviewResponse()), created);
  assert.deepEqual(
    await client.list({
      filters: {
        snapshotIds: [snapshotId],
        createdAfter: "2026-04-27T00:00:00.000Z",
      },
      offset: 0,
      limit: 10,
    }),
    listed,
  );
  const getResult = await client.get(snapshotId);
  assert.deepEqual(getResult, fetched);

  assert.equal(fetch.calls[0].url, "local://api/v1/workspace-session/snapshots");
  assert.equal(fetch.calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), createRequest);
  assert.equal(fetch.calls[1].url, "local://api/v1/workspace-session/snapshots");
  assert.equal(fetch.calls[1].init.method, "POST");
  assert.equal(JSON.parse(fetch.calls[1].init.body).kind, "workspace-session.audit-preview");
  assert.equal(fetch.calls[2].url, "local://api/v1/workspace-session/snapshots");
  assert.equal(fetch.calls[2].init.method, "GET");
  assert.equal(fetch.calls[2].init.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(fetch.calls[2].init.body), {
    filters: {
      snapshotIds: [snapshotId],
      createdAfter: "2026-04-27T00:00:00.000Z",
    },
    offset: 0,
    limit: 10,
  });
  assert.equal(fetch.calls[3].url, "local://api/v1/workspace-session/snapshots/snap%3Aalpha_001");
  assert.equal(fetch.calls[3].init.method, "GET");
  assert.equal(Object.hasOwn(fetch.calls[3].init.headers, "content-type"), false);
  assert.equal(Object.isFrozen(getResult.record.snapshot.auditPreview.events[0].payload), true);
  assert.throws(() => {
    getResult.record.snapshot.auditPreview.events[0].payload.storagePath = "raw";
  }, TypeError);
});

test("validates snapshot requests before fetch is called", async () => {
  const fetch = fakeFetch([]);
  const client = createLocalWorkspaceSessionSnapshotApiClient({
    baseUrl: "local://api/v1",
    fetch,
  });
  const circular = {};
  circular.self = circular;

  await assert.rejects(
    client.preview(circular),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(error.issues.map((issue) => issue.path), ["request.self"]);
      return true;
    },
  );

  await assert.rejects(
    client.create({
      snapshotId: "/bad",
      label: "",
      metadata: [],
      payload: auditPreviewRequest(),
      preview: snapshotPreviewResponse(),
    }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.equal(error.issues.some((issue) => issue.path === "request"), true);
      assert.equal(error.issues.some((issue) => issue.path === "request.snapshotId"), true);
      assert.equal(error.issues.some((issue) => issue.path === "request.label"), true);
      assert.equal(error.issues.some((issue) => issue.path === "request.metadata"), true);
      return true;
    },
  );

  await assert.rejects(
    client.list({
      filters: {
        snapshotIds: ["bad/id"],
        fingerprints: ["abc"],
        createdAfter: "2026-04-28T00:00:00.000Z",
        createdBefore: "2026-04-27T00:00:00.000Z",
      },
      offset: -1,
      limit: 101,
    }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.equal(error.issues.some((issue) => issue.path === "request.filters.snapshotIds.0"), true);
      assert.equal(error.issues.some((issue) => issue.path === "request.filters.fingerprints.0"), true);
      assert.equal(error.issues.some((issue) => issue.path === "request.filters.createdAfter"), true);
      assert.equal(error.issues.some((issue) => issue.path === "request.offset"), true);
      assert.equal(error.issues.some((issue) => issue.path === "request.limit"), true);
      return true;
    },
  );

  await assert.rejects(
    client.get(""),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(error.issues.map((issue) => issue.path), ["snapshotId"]);
      return true;
    },
  );

  assert.equal(fetch.calls.length, 0);
});

test("keeps response validation, parse, HTTP, and network errors typed", async () => {
  const fetch = fakeFetch([
    jsonResponse(200, snapshotPreviewResponse({
      auditPreview: auditPreviewResponse({
        events: [previewEventFixture({
          payload: {
            ...previewEventFixture().payload,
            storagePath: "workspaces/wsp_alpha/session.json",
          },
        })],
      }),
    })),
    textResponse(200, "{", { "content-type": "application/json" }),
    jsonResponse(404, {
      error: {
        code: "workspace_session_snapshot_not_found",
        message: "Workspace session snapshot was not found.",
        details: {
          snapshotId: "missing",
        },
      },
    }),
  ]);
  const client = createLocalWorkspaceSessionSnapshotApiClient({
    baseUrl: "local://api/v1",
    fetch,
  });

  await assert.rejects(
    client.preview(auditPreviewRequest()),
    (error) => {
      assert.equal(error instanceof ApiResponseValidationError, true);
      assert.equal(
        error.issues.some((issue) =>
          issue.path === "auditPreview.events.0.payload.storagePath"
        ),
        true,
      );
      return true;
    },
  );

  await assert.rejects(
    client.create({
      auditPreview: auditPreviewResponse(),
    }),
    (error) => {
      assert.equal(error instanceof ApiResponseParseError, true);
      assert.equal(error.rawBody, "{");
      return true;
    },
  );

  const missing = await toApiResult(client.get("missing"));
  assert.equal(missing.ok, false);
  assert.equal(missing.error instanceof ApiHttpError, true);
  assert.equal(missing.error.status, 404);
  assert.equal(missing.error.apiCode, "workspace_session_snapshot_not_found");
  assert.deepEqual(missing.error.details, { snapshotId: "missing" });

  const networkClient = createLocalWorkspaceSessionSnapshotApiClient({
    baseUrl: "local://api/v1",
    fetch: fakeFetch([new Error("offline")]),
  });
  const networkResult = await toApiResult(networkClient.list());
  assert.equal(networkResult.ok, false);
  assert.equal(networkResult.error instanceof ApiNetworkError, true);
});

test("preserves clone boundaries for mutable snapshot requests and responses", async () => {
  const mutablePreview = snapshotPreviewResponse();
  const mutableRequest = {
    snapshotId,
    metadata: {
      nested: {
        channel: "local",
      },
    },
    preview: mutablePreview,
  };
  const record = snapshotRecord({
    metadata: mutableRequest.metadata,
    snapshot: mutablePreview,
    snapshotFingerprint: mutablePreview.fingerprint,
  });
  const created = {
    kind: "workspace-session.snapshot-record.created",
    schemaVersion: WORKSPACE_SESSION_SNAPSHOT_API_SCHEMA_VERSION,
    localOnly: true,
    durableWrites: false,
    record,
  };
  const fetch = fakeFetch([
    jsonResponse(201, created),
  ]);
  const client = createLocalWorkspaceSessionSnapshotApiClient({
    baseUrl: "local://api/v1",
    fetch,
  });

  const response = await client.create(mutableRequest);
  mutableRequest.metadata.nested.channel = "changed";
  mutablePreview.summary.operations.push("lock");
  created.record.metadata.nested.channel = "changed-again";

  assert.deepEqual(JSON.parse(fetch.calls[0].init.body).metadata, {
    nested: {
      channel: "local",
    },
  });
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body).preview.summary.operations, ["open"]);
  assert.equal(response.record.metadata.nested.channel, "local");
  assert.deepEqual(response.record.snapshot.summary.operations, ["open"]);
  assert.throws(() => {
    response.record.metadata.nested.channel = "mutated";
  }, TypeError);
  assert.throws(() => {
    response.record.snapshot.summary.operations.push("lock");
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
  if (status === 201) {
    return "Created";
  }
  if (status === 404) {
    return "Not Found";
  }
  return "";
}
