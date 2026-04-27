import assert from "node:assert/strict";
import test from "node:test";

import { createApiRouter } from "../src/router.ts";
import { createWorkspaceSessionAuditPreview } from "../src/workspaceSessionRoutes.ts";
import {
  WORKSPACE_SESSION_STORE_SCHEMA_VERSION,
  createInMemoryWorkspaceSessionSnapshotStore,
  createWorkspaceSessionStoreRoutes,
  mountWorkspaceSessionStoreRoutes,
} from "../src/workspaceSessionStoreRoutes.ts";

const fixedNow = "2026-04-27T00:00:00.000Z";
const secret = "sk_local_snapshot_secret_123456";
const rawPath = "C:\\Users\\DELL\\session-secret.json";
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
const sessionId = "sess_alpha_laptop_001";
const lockToken = "lock_alpha_laptop_001";

test("mounts workspace session snapshot store routes", () => {
  const router = createApiRouter();

  mountWorkspaceSessionStoreRoutes(router);

  assert.deepEqual(
    router.listRoutes().map(routeKey),
    [
      "GET /v1/workspace-session/snapshots",
      "GET /v1/workspace-session/snapshots/:snapshotId",
      "POST /v1/workspace-session/snapshots",
      "POST /v1/workspace-session/snapshots/preview",
    ],
  );
});

test("index exports workspace session snapshot store helpers", async () => {
  const api = await import("../src/index.ts");

  assert.equal(typeof api.createWorkspaceSessionStoreRoutes, "function");
  assert.equal(typeof api.mountWorkspaceSessionStoreRoutes, "function");
  assert.equal(typeof api.createInMemoryWorkspaceSessionSnapshotStore, "function");
});

test("previews redacted local-only workspace session snapshots without retaining raw inputs", async () => {
  const router = createApiRouter(createWorkspaceSessionStoreRoutes({
    now: () => fixedNow,
  }));
  const body = createSnapshotPayload();
  const before = structuredClone(body);

  const first = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshots/preview",
    body,
  });
  const second = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshots/preview",
    body: structuredClone(body),
  });

  assertJsonResponse(first, 200);
  assert.deepEqual(body, before);
  assert.deepEqual(second.body, first.body);
  assert.equal(first.body.kind, "workspace-session.snapshot-preview");
  assert.equal(first.body.schemaVersion, WORKSPACE_SESSION_STORE_SCHEMA_VERSION);
  assert.equal(first.body.localOnly, true);
  assert.equal(first.body.durableWrites, false);
  assert.equal(first.body.redacted, true);
  assert.match(first.body.fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(first.body.summary.operations, ["open", "lock"]);
  assert.equal(first.body.summary.eventCount, 2);
  assert.equal(first.body.summary.auditRecordCount, 2);
  assert.equal(first.body.auditPreview.audit.records[0].details.localOnly, true);
  assert.match(
    first.body.auditPreview.events[0].payload.storagePath,
    /^\[redacted:path:[a-z0-9]+\]$/,
  );
  assert.match(
    first.body.auditPreview.events[1].payload.lock.lockTokenRef,
    /^\[redacted:lockToken:[a-z0-9]+\]$/,
  );
  assert.equal(JSON.stringify(first.body).includes(descriptor.storagePath), false);
  assert.equal(JSON.stringify(first.body).includes(lockToken), false);
  assert.equal(JSON.stringify(first.body).includes(secret), false);
  assert.equal(JSON.stringify(first.body).includes(rawPath), false);
});

test("stores workspace session snapshots with an injected in-memory store", async () => {
  const store = createInMemoryWorkspaceSessionSnapshotStore();
  const router = createApiRouter(createWorkspaceSessionStoreRoutes({
    store,
    now: () => fixedNow,
  }));
  const body = {
    snapshotId: "snapshot-local-1",
    label: "local-baseline",
    metadata: {
      token: secret,
      path: rawPath,
      visible: "kept",
    },
    payload: createSnapshotPayload(),
  };
  const before = structuredClone(body);

  const createResponse = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshots",
    body,
  });

  assertJsonResponse(createResponse, 201);
  assert.deepEqual(body, before);
  assert.equal(createResponse.body.kind, "workspace-session.snapshot-record.created");
  assert.equal(createResponse.body.schemaVersion, WORKSPACE_SESSION_STORE_SCHEMA_VERSION);
  assert.equal(createResponse.body.localOnly, true);
  assert.equal(createResponse.body.durableWrites, false);
  assert.equal(createResponse.body.record.kind, "workspace-session.snapshot-record");
  assert.equal(createResponse.body.record.snapshotId, "snapshot-local-1");
  assert.equal(createResponse.body.record.createdAt, fixedNow);
  assert.equal(createResponse.body.record.updatedAt, fixedNow);
  assert.equal(createResponse.body.record.label, "local-baseline");
  assert.equal(createResponse.body.record.metadata.token, "[REDACTED]");
  assert.equal(createResponse.body.record.metadata.path, "[redacted:path]");
  assert.equal(createResponse.body.record.metadata.visible, "kept");
  assert.equal(
    createResponse.body.record.snapshotFingerprint,
    createResponse.body.record.snapshot.fingerprint,
  );
  assert.match(createResponse.body.record.fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(createResponse.body).includes(secret), false);
  assert.equal(JSON.stringify(createResponse.body).includes(rawPath), false);

  const listResponse = await router.dispatch({
    method: "GET",
    path: "/v1/workspace-session/snapshots",
    body: {
      filters: {
        labels: ["local-baseline"],
        workspaceIds: ["wsp_alpha"],
        sessionIds: [sessionId],
      },
      offset: 0,
      limit: 1,
    },
  });
  assertJsonResponse(listResponse, 200);
  assert.deepEqual(listResponse.body.pagination, {
    offset: 0,
    limit: 1,
    totalRecordCount: 1,
    matchedRecordCount: 1,
    returnedRecordCount: 1,
    hasMore: false,
  });
  assert.deepEqual(
    listResponse.body.records.map((record) => ({
      snapshotId: record.snapshotId,
      label: record.label,
      workspaceId: record.workspaceId,
      sessionId: record.sessionId,
      eventCount: record.eventCount,
      auditRecordCount: record.auditRecordCount,
    })),
    [
      {
        snapshotId: "snapshot-local-1",
        label: "local-baseline",
        workspaceId: "wsp_alpha",
        sessionId,
        eventCount: 2,
        auditRecordCount: 2,
      },
    ],
  );

  const getResponse = await router.dispatch({
    method: "GET",
    path: "/v1/workspace-session/snapshots/snapshot-local-1",
  });
  assertJsonResponse(getResponse, 200);
  assert.deepEqual(getResponse.body.record, createResponse.body.record);
});

test("accepts stored snapshot preview responses and generates deterministic ids", async () => {
  const router = createApiRouter(createWorkspaceSessionStoreRoutes({
    now: () => fixedNow,
  }));
  const previewResponse = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshots/preview",
    body: createSnapshotPayload(),
  });
  assertJsonResponse(previewResponse, 200);

  const createResponse = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshots",
    body: {
      preview: previewResponse.body,
    },
  });
  assertJsonResponse(createResponse, 201);
  assert.match(createResponse.body.record.snapshotId, /^wssnap_[a-f0-9]{24}$/);
  assert.deepEqual(createResponse.body.record.snapshot, previewResponse.body);

  const duplicate = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshots",
    body: {
      preview: previewResponse.body,
    },
  });
  assertJsonError(duplicate, 409, "workspace_session_snapshot_duplicate");
  assert.deepEqual(duplicate.body.error.details, {
    snapshotId: createResponse.body.record.snapshotId,
  });
});

test("returns standard JSON errors for invalid, duplicate, missing, and unsafe snapshots", async () => {
  const router = createApiRouter(createWorkspaceSessionStoreRoutes({
    now: () => fixedNow,
  }));

  const badBody = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshots",
    body: ["not-an-object"],
  });
  assertJsonError(badBody, 400, "validation_failed");
  assert.deepEqual(badBody.body.error.details, { path: "body" });

  const badSnapshotId = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshots",
    body: {
      snapshotId: "bad/id",
      payload: createSnapshotPayload(),
    },
  });
  assertJsonError(badSnapshotId, 400, "validation_failed");
  assert.deepEqual(badSnapshotId.body.error.details, { path: "body.snapshotId" });

  const malformedPayload = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshots",
    body: {
      snapshotId: "snapshot-malformed",
      payload: {
        ...createSnapshotPayload(),
        unexpected: true,
      },
    },
  });
  assertJsonError(malformedPayload, 400, "validation_failed");
  assert.deepEqual(malformedPayload.body.error.details, { path: "body.unexpected" });

  const created = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshots",
    body: {
      snapshotId: "snapshot-duplicate",
      payload: createSnapshotPayload(),
    },
  });
  assertJsonResponse(created, 201);

  const duplicate = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshots",
    body: {
      snapshotId: "snapshot-duplicate",
      payload: createSnapshotPayload(),
    },
  });
  assertJsonError(duplicate, 409, "workspace_session_snapshot_duplicate");
  assert.deepEqual(duplicate.body.error.details, { snapshotId: "snapshot-duplicate" });

  const missing = await router.dispatch({
    method: "GET",
    path: "/v1/workspace-session/snapshots/missing-snapshot",
  });
  assertJsonError(missing, 404, "workspace_session_snapshot_not_found");
  assert.deepEqual(missing.body.error.details, { snapshotId: "missing-snapshot" });

  const badList = await router.dispatch({
    method: "GET",
    path: "/v1/workspace-session/snapshots",
    body: {
      limit: 101,
    },
  });
  assertJsonError(badList, 400, "validation_failed");
  assert.deepEqual(badList.body.error.details, { path: "body.limit" });

  const unsafePreview = structuredClone(createWorkspaceSessionAuditPreview(createSnapshotPayload()));
  unsafePreview.events[0].payload.storagePath = "workspaces/wsp_alpha/session.json";
  const unsafe = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshots/preview",
    body: {
      auditPreview: unsafePreview,
    },
  });
  assertJsonError(unsafe, 400, "validation_failed");
  assert.deepEqual(unsafe.body.error.details, {
    path: "body.events.0.payload.storagePath",
  });
});

function createSnapshotPayload() {
  return {
    descriptor,
    sessionId,
    actor: "api-worker-b",
    createdAt: "2026-04-27T00:10:00.000Z",
    events: [
      {
        operation: "open",
        sequence: 1,
        createdAt: "2026-04-27T00:01:00.000Z",
        reason: `loaded ${rawPath} with token=${secret}`,
      },
      {
        operation: "lock",
        sequence: 2,
        createdAt: "2026-04-27T00:02:00.000Z",
        lockToken,
        reason: "local idle timeout",
      },
    ],
  };
}

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
