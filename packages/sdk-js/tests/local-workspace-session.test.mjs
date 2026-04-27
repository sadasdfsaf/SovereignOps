import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_WORKSPACE_SESSION_ERROR_CODES,
  LocalWorkspaceSessionError,
  createLocalWorkspaceSessionAuditPreviewRecords,
  normalizeLocalWorkspaceDescriptor,
  normalizeLocalWorkspaceGateway,
  planLocalWorkspaceSessionLockEvent,
  planLocalWorkspaceSessionOpenEvent,
  planLocalWorkspaceSessionUnlockEvent,
  validateLocalWorkspaceStoragePath,
} from "../src/index.ts";

const descriptor = {
  workspaceId: "wsp_alpha",
  deviceId: "dev_laptop",
  rootKeyRef: "key_alpha",
  createdAt: "2026-04-27T00:00:00.000Z",
  updatedAt: "2026-04-27T00:00:00.000Z",
};

const storagePath = "workspaces/wsp_alpha/session.json";
const sessionId = "sess_alpha_laptop_001";
const lockToken = "lock_alpha_laptop_001";

test("normalizes local workspace descriptors with safe storage and local gateway defaults", () => {
  const normalized = normalizeLocalWorkspaceDescriptor(descriptor);

  assert.deepEqual(normalized, {
    ...descriptor,
    storagePath: ".sovereignops/sessions/wsp_alpha.json",
    gateway: {
      transport: "http",
      host: "127.0.0.1",
      port: 0,
    },
  });

  assert.equal(Object.isFrozen(normalized), true);
  assert.equal(Object.isFrozen(normalized.gateway), true);
  assert.throws(() => {
    normalized.gateway.host = "localhost";
  }, TypeError);

  const custom = normalizeLocalWorkspaceDescriptor({
    ...descriptor,
    storagePath,
    gateway: {
      host: "localhost",
      port: 48231,
    },
  });
  assert.equal(custom.storagePath, storagePath);
  assert.deepEqual(custom.gateway, {
    transport: "http",
    host: "localhost",
    port: 48231,
  });
});

test("rejects unsafe storage paths and remote gateway hosts", () => {
  assert.equal(validateLocalWorkspaceStoragePath(storagePath), storagePath);
  assert.deepEqual(normalizeLocalWorkspaceGateway({ transport: "stdio" }), {
    transport: "stdio",
  });

  for (const unsafePath of [
    "../session.json",
    "C:/tmp/session.json",
    "workspaces\\wsp_alpha\\session.json",
    "secrets/session.json",
    "workspaces/wsp_alpha/session.txt",
  ]) {
    assertLocalWorkspaceSessionError(
      () => normalizeLocalWorkspaceDescriptor({
        ...descriptor,
        storagePath: unsafePath,
      }),
      LOCAL_WORKSPACE_SESSION_ERROR_CODES.INVALID_STORAGE_PATH,
    );
  }

  for (const host of ["0.0.0.0", "192.168.1.10", "gateway.example.test"]) {
    assertLocalWorkspaceSessionError(
      () => normalizeLocalWorkspaceDescriptor({
        ...descriptor,
        storagePath,
        gateway: { host, port: 48231 },
      }),
      LOCAL_WORKSPACE_SESSION_ERROR_CODES.INVALID_GATEWAY,
    );
  }
});

test("plans deterministic open, lock, and unlock session events", () => {
  const open = planLocalWorkspaceSessionOpenEvent({
    descriptor: {
      ...descriptor,
      storagePath,
      gateway: { host: "localhost", port: 48231 },
    },
    sessionId,
    sequence: 1,
    createdAt: "2026-04-27T00:01:00.000Z",
    reason: "manual open",
  });
  const lock = planLocalWorkspaceSessionLockEvent({
    descriptor: {
      ...descriptor,
      storagePath,
      gateway: { host: "localhost", port: 48231 },
    },
    sessionId,
    sequence: 2,
    createdAt: "2026-04-27T00:02:00.000Z",
    lockToken,
  });
  const unlock = planLocalWorkspaceSessionUnlockEvent({
    descriptor: {
      ...descriptor,
      storagePath,
      gateway: { host: "localhost", port: 48231 },
    },
    sessionId,
    sequence: 3,
    createdAt: "2026-04-27T00:03:00.000Z",
    lockToken,
  });

  assert.deepEqual(
    [open.eventId, lock.eventId, unlock.eventId],
    [
      "evt_wsp_alpha_open_00000001",
      "evt_wsp_alpha_lock_00000002",
      "evt_wsp_alpha_unlock_00000003",
    ],
  );
  assert.deepEqual(
    [open.type, lock.type, unlock.type],
    [
      "workspace.session.opened",
      "workspace.session.locked",
      "workspace.session.unlocked",
    ],
  );
  assert.deepEqual([open.cursor, lock.cursor, unlock.cursor], ["1", "2", "3"]);
  assert.deepEqual(
    [open.payload.operation, lock.payload.operation, unlock.payload.operation],
    ["open", "lock", "unlock"],
  );
  assert.equal(open.payload.localOnly, true);
  assert.equal(open.payload.storagePath, storagePath);
  assert.equal(open.payload.storagePathDisplay.includes(storagePath), false);
  assert.match(lock.payload.lock.lockTokenRef, /^\[redacted:lockToken:[a-z0-9]+\]$/);
  assert.equal(JSON.stringify(lock).includes(lockToken), false);
  assert.equal(Object.isFrozen(lock.payload.gateway), true);
});

test("keeps clone and freeze boundaries for mutable descriptor inputs", () => {
  const mutableDescriptor = {
    ...descriptor,
    storagePath,
    gateway: {
      host: "localhost",
      port: 48231,
    },
  };

  const event = planLocalWorkspaceSessionOpenEvent({
    descriptor: mutableDescriptor,
    sessionId,
    sequence: 4,
    createdAt: "2026-04-27T00:04:00.000Z",
  });
  mutableDescriptor.gateway.host = "127.0.0.1";
  mutableDescriptor.gateway.port = 10;
  mutableDescriptor.storagePath = "workspaces/wsp_alpha/changed.json";

  assert.equal(event.payload.gateway.host, "localhost");
  assert.equal(event.payload.gateway.port, 48231);
  assert.equal(event.payload.storagePath, storagePath);
  assert.throws(() => {
    event.payload.gateway.port = 1;
  }, TypeError);
});

test("creates redacted immutable audit preview records from session events", () => {
  const open = planLocalWorkspaceSessionOpenEvent({
    descriptor: {
      ...descriptor,
      storagePath,
      gateway: { host: "localhost", port: 48231 },
    },
    sessionId,
    sequence: 1,
    createdAt: "2026-04-27T00:01:00.000Z",
  });
  const lock = structuredClone(planLocalWorkspaceSessionLockEvent({
    descriptor: {
      ...descriptor,
      storagePath,
      gateway: { host: "localhost", port: 48231 },
    },
    sessionId,
    sequence: 2,
    createdAt: "2026-04-27T00:02:00.000Z",
    lockToken,
    reason: "idle timeout",
  }));

  const preview = createLocalWorkspaceSessionAuditPreviewRecords({
    events: [lock, open],
    actor: "sdk-worker-b",
  });
  lock.payload.gateway.port = 1;
  lock.payload.reason = "changed";

  assert.deepEqual(
    preview.map((record) => record.auditId),
    ["aud_wsp_alpha_open_00000001", "aud_wsp_alpha_lock_00000002"],
  );
  assert.deepEqual(
    preview.map((record) => record.action),
    ["workspace.session.opened", "workspace.session.locked"],
  );
  assert.equal(preview[0].actor, "sdk-worker-b");
  assert.equal(preview[1].details.gateway.port, 48231);
  assert.equal(preview[1].details.reason, "idle timeout");
  assert.match(preview[0].details.storagePath, /^\[redacted:path:[a-z0-9]+\]$/);
  assert.equal(JSON.stringify(preview).includes(storagePath), false);
  assert.equal(JSON.stringify(preview).includes(lockToken), false);
  assert.deepEqual(preview[1].details.redaction.fields, [
    "storagePath",
    "lockToken",
  ]);
  assert.equal(Object.isFrozen(preview), true);
  assert.equal(Object.isFrozen(preview[0].details.gateway), true);
  assert.throws(() => {
    preview[0].details.gateway.port = 2;
  }, TypeError);
});

function assertLocalWorkspaceSessionError(fn, code) {
  assert.throws(
    fn,
    (error) => {
      assert.equal(error instanceof LocalWorkspaceSessionError, true);
      assert.equal(error.code, code);
      return true;
    },
  );
}
