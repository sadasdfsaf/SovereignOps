import assert from "node:assert/strict";
import test from "node:test";

import {
  createWorkspaceSessionAuditPreview,
  createWorkspaceSessionRoutes,
  mountWorkspaceSessionRoutes,
  summarizeWorkspaceSessionApiInput,
} from "../src/workspaceSessionRoutes.ts";
import { createApiRouter } from "../src/router.ts";

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

test("mounts workspace session routes with stable paths", () => {
  const router = createApiRouter();

  mountWorkspaceSessionRoutes(router);

  assert.deepEqual(
    router.listRoutes().map((route) => `${route.method} ${route.path}`),
    [
      "POST /v1/workspace-session/audit-preview",
      "POST /v1/workspace-session/summary",
    ],
  );
});

test("serves local-only workspace session summaries and audit previews", async () => {
  const router = createApiRouter(createWorkspaceSessionRoutes());

  const summary = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/summary",
    body: {
      descriptor,
      sessionId,
      operations: ["open", "lock"],
    },
  });

  assertJsonResponse(summary, 200);
  assert.equal(summary.body.kind, "workspace-session.summary");
  assert.equal(summary.body.localOnly, true);
  assert.equal(summary.body.durableWrites, false);
  assert.equal(summary.body.workspaceId, "wsp_alpha");
  assert.equal(summary.body.gateway.host, "localhost");
  assert.equal(summary.body.storage.storagePathRedacted, true);
  assert.match(summary.body.storage.storagePath, /^\[redacted:path:[a-z0-9]+\]$/);
  assert.equal(JSON.stringify(summary.body).includes(descriptor.storagePath), false);

  const preview = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/audit-preview",
    body: {
      descriptor,
      sessionId,
      actor: "api-worker-a",
      createdAt: "2026-04-27T00:10:00.000Z",
      events: [
        {
          operation: "open",
          sequence: 1,
          createdAt: "2026-04-27T00:01:00.000Z",
          reason: "operator requested local session",
        },
        {
          operation: "lock",
          sequence: 2,
          createdAt: "2026-04-27T00:02:00.000Z",
          lockToken,
          reason: "local idle timeout",
        },
      ],
    },
  });

  assertJsonResponse(preview, 200);
  assert.equal(preview.body.kind, "workspace-session.audit-preview");
  assert.equal(preview.body.localOnly, true);
  assert.equal(preview.body.durableWrites, false);
  assert.equal(preview.body.audit.redacted, true);
  assert.equal(preview.body.audit.recordCount, 2);
  assert.deepEqual(
    preview.body.audit.records.map((record) => record.action),
    ["workspace.session.opened", "workspace.session.locked"],
  );
  assert.deepEqual(
    preview.body.events.map((event) => event.payload.operation),
    ["open", "lock"],
  );
  assert.equal(preview.body.audit.records[0].actor, "api-worker-a");
  assert.equal(preview.body.audit.records[0].createdAt, "2026-04-27T00:10:00.000Z");
  assert.equal(preview.body.audit.records[0].details.localOnly, true);
  assert.equal(preview.body.events[0].payload.storagePathRedacted, true);
  assert.match(preview.body.events[0].payload.storagePath, /^\[redacted:path:[a-z0-9]+\]$/);
  assert.match(preview.body.events[1].payload.lock.lockTokenRef, /^\[redacted:lockToken:[a-z0-9]+\]$/);
  assert.equal(JSON.stringify(preview.body).includes(descriptor.storagePath), false);
  assert.equal(JSON.stringify(preview.body).includes(lockToken), false);
});

test("returns JSON validation errors for unsafe storage paths and remote gateway hosts", async () => {
  const router = createApiRouter(createWorkspaceSessionRoutes());

  const unsafePath = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/summary",
    body: {
      descriptor: {
        ...descriptor,
        storagePath: "../session.json",
      },
    },
  });

  assertJsonError(unsafePath, 400, "validation_failed");
  assert.equal(
    unsafePath.body.error.details.sdkCode,
    "LOCAL_WORKSPACE_SESSION_INVALID_STORAGE_PATH",
  );

  const remoteHost = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/audit-preview",
    body: {
      descriptor: {
        ...descriptor,
        gateway: {
          host: "gateway.example.test",
          port: 48231,
        },
      },
      sessionId,
      events: [
        {
          operation: "open",
          sequence: 1,
          createdAt: "2026-04-27T00:01:00.000Z",
        },
      ],
    },
  });

  assertJsonError(remoteHost, 400, "validation_failed");
  assert.equal(
    remoteHost.body.error.details.sdkCode,
    "LOCAL_WORKSPACE_SESSION_INVALID_GATEWAY",
  );
});

test("keeps helper outputs immutable and independent of mutable inputs", () => {
  const mutableDescriptor = structuredClone(descriptor);
  const summary = summarizeWorkspaceSessionApiInput({
    descriptor: mutableDescriptor,
    sessionId,
    operations: ["open"],
  });

  mutableDescriptor.gateway.host = "127.0.0.1";
  mutableDescriptor.gateway.port = 10;
  mutableDescriptor.storagePath = "workspaces/wsp_alpha/changed.json";

  assert.equal(summary.gateway.host, "localhost");
  assert.equal(summary.gateway.port, 48231);
  assert.match(summary.storage.storagePath, /^\[redacted:path:[a-z0-9]+\]$/);
  assert.equal(Object.isFrozen(summary), true);
  assert.equal(Object.isFrozen(summary.gateway), true);
  assert.equal(Object.isFrozen(summary.storage), true);
  assert.throws(() => {
    summary.gateway.port = 1;
  }, TypeError);
});

test("redacts local-only audit preview paths and lock tokens across clone boundaries", () => {
  const previewInput = {
    descriptor: structuredClone(descriptor),
    sessionId,
    actor: "api-worker-a",
    events: [
      {
        operation: "lock",
        sequence: 1,
        createdAt: "2026-04-27T00:01:00.000Z",
        lockToken,
      },
      {
        operation: "unlock",
        sequence: 2,
        createdAt: "2026-04-27T00:02:00.000Z",
        lockToken,
      },
    ],
  };

  const preview = createWorkspaceSessionAuditPreview(previewInput);
  previewInput.descriptor.gateway.port = 1;
  previewInput.events[0].lockToken = "lock_alpha_laptop_changed";

  assert.equal(preview.audit.records.length, 2);
  assert.equal(preview.audit.records[0].details.localOnly, true);
  assert.equal(preview.audit.records[1].details.localOnly, true);
  assert.deepEqual(preview.audit.records[0].details.redaction.fields, [
    "storagePath",
    "lockToken",
  ]);
  assert.equal(preview.events[0].payload.gateway.port, 48231);
  assert.equal(JSON.stringify(preview).includes(descriptor.storagePath), false);
  assert.equal(JSON.stringify(preview).includes(lockToken), false);
  assert.equal(Object.isFrozen(preview.audit.records[0].details.gateway), true);
  assert.throws(() => {
    preview.audit.records[0].details.gateway.port = 2;
  }, TypeError);
});

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
