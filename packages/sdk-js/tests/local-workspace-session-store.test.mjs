import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_WORKSPACE_SESSION_STORE_ERROR_CODES,
  LocalWorkspaceSessionStoreError,
  createInMemoryLocalWorkspaceSessionStore,
  createLocalWorkspaceSessionId,
  createLocalWorkspaceSessionSnapshot,
  createLocalWorkspaceSessionStoreBundle,
  normalizeLocalWorkspaceSessionStoreEvent,
  parseLocalWorkspaceSessionStoreBundle,
  planLocalWorkspaceSessionLockEvent,
  planLocalWorkspaceSessionOpenEvent,
  serializeLocalWorkspaceSessionStoreBundle,
} from "../src/index.ts";

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
const rawSecret = "sk-round39secret0001";

test("creates deterministic or caller-provided session snapshots without retaining raw secrets", () => {
  const deterministicSessionId = createLocalWorkspaceSessionId({
    descriptor,
    seed: "round-39",
  });
  assert.equal(
    deterministicSessionId,
    createLocalWorkspaceSessionId({ descriptor, seed: "round-39" }),
  );
  assert.match(deterministicSessionId, /^sess_alpha_laptop_[a-z0-9]+$/);

  const metadata = {
    apiToken: rawSecret,
    nested: {
      password: "never-store-this",
      safeLabel: "local workspace",
    },
  };
  const open = openEvent({
    sessionId: deterministicSessionId,
    sequence: 1,
    reason: `Bearer ${rawSecret}`,
  });
  const snapshot = createLocalWorkspaceSessionSnapshot({
    descriptor,
    sessionId: deterministicSessionId,
    snapshotId: "wssnap_alpha_laptop_caller_001",
    events: [open],
    metadata,
    createdAt: "2026-04-27T00:01:00.000Z",
  });
  metadata.nested.password = "changed";

  assert.equal(snapshot.snapshotId, "wssnap_alpha_laptop_caller_001");
  assert.equal(snapshot.sessionId, deterministicSessionId);
  assert.equal(snapshot.localOnly, true);
  assert.equal(snapshot.redaction.rawSecretsStored, false);
  assert.deepEqual(snapshot.operations, ["open"]);
  assert.deepEqual(snapshot.redaction.redactedFields, [
    "events.0.payload.reason",
    "metadata.apiToken",
    "metadata.nested.password",
  ]);
  assert.match(snapshot.metadata.apiToken, /^\[redacted:secret:[a-z0-9]+\]$/);
  assert.match(snapshot.metadata.nested.password, /^\[redacted:secret:[a-z0-9]+\]$/);
  assert.equal(snapshot.metadata.nested.safeLabel, "local workspace");
  assert.equal(JSON.stringify(snapshot).includes(rawSecret), false);
  assert.equal(JSON.stringify(snapshot).includes("never-store-this"), false);
  assert.deepEqual(snapshot.descriptor, normalizedDescriptor);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.metadata.nested), true);
  assert.throws(() => {
    snapshot.metadata.nested.safeLabel = "mutated";
  }, TypeError);
});

test("stores immutable redacted session events and lists by session query", () => {
  const store = createInMemoryLocalWorkspaceSessionStore();
  const open = openEvent({ sequence: 1 });
  const lock = lockEvent({
    sequence: 2,
    reason: `Bearer ${rawSecret}`,
  });

  store.appendEvents([lock, open]);
  lock.payload.gateway.port = 9;
  lock.payload.reason = "changed";

  const listed = store.listEvents(sessionId);
  assert.deepEqual(
    listed.map((event) => event.eventId),
    ["evt_wsp_alpha_open_00000001", "evt_wsp_alpha_lock_00000002"],
  );
  assert.equal(listed[1].payload.gateway.port, 48231);
  assert.equal(listed[1].payload.reason, "[redacted-secret]");
  assert.equal(JSON.stringify(listed).includes(rawSecret), false);
  assert.throws(() => {
    listed[1].payload.gateway.port = 1;
  }, TypeError);

  const lockOnly = store.listEvents(sessionId, {
    operation: "lock",
    sinceCursor: "1",
  });
  assert.deepEqual(
    lockOnly.map((event) => event.payload.operation),
    ["lock"],
  );

  assertLocalWorkspaceSessionStoreError(
    () => store.appendEvent(open),
    LOCAL_WORKSPACE_SESSION_STORE_ERROR_CODES.INVALID_EVENT,
  );
});

test("exports and parses schema-versioned session bundles with clone boundaries", () => {
  const open = openEvent({ sequence: 1 });
  const lock = lockEvent({ sequence: 2 });
  const bundle = createLocalWorkspaceSessionStoreBundle({
    snapshot: {
      descriptor,
      sessionId,
      snapshotId: "wssnap_alpha_laptop_export_001",
      events: [open, lock],
      metadata: {
        safe: "value",
      },
    },
    events: [open, lock],
  });
  const serialized = serializeLocalWorkspaceSessionStoreBundle(bundle);
  const parsed = parseLocalWorkspaceSessionStoreBundle(serialized);

  assert.equal(serialized.endsWith("\n"), true);
  assert.equal(parsed.kind, "localWorkspaceSessionStore");
  assert.equal(parsed.schemaVersion, "local-workspace-session-store/v1");
  assert.equal(parsed.snapshot.eventCount, 2);
  assert.deepEqual(
    parsed.events.map((event) => event.cursor),
    ["1", "2"],
  );
  assert.equal(Object.isFrozen(parsed.events[0].payload.gateway), true);
  assert.throws(() => {
    parsed.events.push(open);
  }, TypeError);

  const raw = JSON.parse(serialized);
  raw.schemaVersion = "local-workspace-session-store/v999";
  assertLocalWorkspaceSessionStoreError(
    () => parseLocalWorkspaceSessionStoreBundle(raw),
    LOCAL_WORKSPACE_SESSION_STORE_ERROR_CODES.INVALID_SCHEMA,
  );
});

test("validates event payload schema and rejects raw lock material", () => {
  const open = structuredClone(openEvent({ sequence: 1 }));
  open.payload.schemaVersion = "local-workspace-session/v999";
  assertLocalWorkspaceSessionStoreError(
    () => normalizeLocalWorkspaceSessionStoreEvent(open),
    LOCAL_WORKSPACE_SESSION_STORE_ERROR_CODES.INVALID_EVENT,
  );

  const lock = structuredClone(lockEvent({ sequence: 2 }));
  lock.payload.lock.lockTokenRef = lockToken;
  assertLocalWorkspaceSessionStoreError(
    () => normalizeLocalWorkspaceSessionStoreEvent(lock),
    LOCAL_WORKSPACE_SESSION_STORE_ERROR_CODES.INVALID_EVENT,
  );

  const mismatched = structuredClone(openEvent({ sequence: 1 }));
  mismatched.payload.sessionId = "sess_other_laptop_001";
  assertLocalWorkspaceSessionStoreError(
    () => createLocalWorkspaceSessionSnapshot({
      descriptor,
      sessionId,
      events: [mismatched],
    }),
    LOCAL_WORKSPACE_SESSION_STORE_ERROR_CODES.INVALID_EVENT,
  );
});

test("exports refreshed snapshots from the in-memory store", () => {
  const store = createInMemoryLocalWorkspaceSessionStore();
  const open = openEvent({ sequence: 1 });
  const lock = lockEvent({ sequence: 2 });

  store.appendEvents([open, lock]);
  store.putSnapshot({
    descriptor,
    sessionId,
    snapshotId: "wssnap_alpha_laptop_runtime_001",
    metadata: {
      apiToken: rawSecret,
    },
  });

  const exported = store.exportSession(sessionId);
  assert.equal(exported.snapshot.eventCount, 2);
  assert.equal(exported.snapshot.cursor, "2");
  assert.deepEqual(exported.snapshot.operations, ["open", "lock"]);
  assert.equal(JSON.stringify(exported).includes(rawSecret), false);
});

function openEvent({ sessionId: id = sessionId, sequence, reason }) {
  return structuredClone(planLocalWorkspaceSessionOpenEvent({
    descriptor,
    sessionId: id,
    sequence,
    createdAt: `2026-04-27T00:0${sequence}:00.000Z`,
    ...(reason === undefined ? {} : { reason }),
  }));
}

function lockEvent({ sequence, reason }) {
  return structuredClone(planLocalWorkspaceSessionLockEvent({
    descriptor,
    sessionId,
    sequence,
    createdAt: `2026-04-27T00:0${sequence}:00.000Z`,
    lockToken,
    ...(reason === undefined ? {} : { reason }),
  }));
}

function assertLocalWorkspaceSessionStoreError(fn, code) {
  assert.throws(
    fn,
    (error) => {
      assert.equal(error instanceof LocalWorkspaceSessionStoreError, true);
      assert.equal(error.code, code);
      return true;
    },
  );
}
