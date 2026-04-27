import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import { join, parse, resolve } from "node:path";
import test from "node:test";

import { createApiRouter } from "../src/router.ts";
import {
  createWorkspaceSessionStoreRoutes,
} from "../src/workspaceSessionStoreRoutes.ts";
import {
  DEFAULT_WORKSPACE_SESSION_SNAPSHOT_FILE_STORE_LOCK_FILE,
  createWorkspaceSessionStoreFileAdapter,
} from "../src/workspaceSessionStoreFileAdapter.ts";

const fixedNow = "2026-04-27T00:00:00.000Z";
const secret = "sk_file_store_secret_123456";
const rawPath = "C:\\Users\\DELL\\session-secret.json";
const sessionId = "sess_file_store_001";
const lockToken = "lock_file_store_001";
const descriptor = {
  workspaceId: "wsp_file_store",
  deviceId: "dev_file_store",
  rootKeyRef: "key_file_store",
  createdAt: "2026-04-27T00:00:00.000Z",
  updatedAt: "2026-04-27T00:00:00.000Z",
  storagePath: "workspaces/wsp_file_store/session.json",
  gateway: {
    host: "localhost",
    port: 48231,
  },
};

test("persists one redacted snapshot record per JSON file and reloads clones deterministically", async () => {
  await withTempDir(async (rootDir) => {
    const store = createWorkspaceSessionStoreFileAdapter({ rootDir });
    const timestamps = [
      "2026-04-27T00:02:00.000Z",
      "2026-04-27T00:01:00.000Z",
    ];
    const router = createApiRouter(createWorkspaceSessionStoreRoutes({
      store,
      now: () => timestamps.shift() ?? fixedNow,
    }));
    const request = {
      snapshotId: "snapshot-z",
      label: "later",
      metadata: {
        token: secret,
        path: rawPath,
        visible: "kept",
      },
      payload: createSnapshotPayload(),
    };
    const before = structuredClone(request);

    const later = await router.dispatch({
      method: "POST",
      path: "/v1/workspace-session/snapshots",
      body: request,
    });
    const earlier = await router.dispatch({
      method: "POST",
      path: "/v1/workspace-session/snapshots",
      body: {
        snapshotId: "snapshot-a",
        label: "earlier",
        metadata: {
          visible: "kept",
        },
        payload: createSnapshotPayload(),
      },
    });

    assertJsonResponse(later, 201);
    assertJsonResponse(earlier, 201);
    assert.deepEqual(request, before);
    request.payload.events[0].reason = `mutated ${secret} after create`;

    const files = snapshotFiles(rootDir);
    assert.equal(files.length, 2);
    for (const file of files) {
      const text = readFileSync(join(rootDir, file), "utf8");
      const parsed = JSON.parse(text);
      assert.equal(parsed.kind, "workspace-session.snapshot-record");
      assert.equal(parsed.redacted, true);
      assert.equal(text.includes(secret), false);
      assert.equal(text.includes(rawPath), false);
      assert.equal(text.includes(lockToken), false);
      assert.equal(text.includes("mutated"), false);
    }

    const duplicate = await router.dispatch({
      method: "POST",
      path: "/v1/workspace-session/snapshots",
      body: {
        snapshotId: "snapshot-a",
        payload: createSnapshotPayload(),
      },
    });
    assertJsonError(duplicate, 409, "workspace_session_snapshot_duplicate");
    assert.equal(snapshotFiles(rootDir).length, 2);

    const reloaded = createWorkspaceSessionStoreFileAdapter({ rootDir });
    assert.deepEqual(
      reloaded.list().map((record) => record.snapshotId),
      ["snapshot-a", "snapshot-z"],
    );

    const record = reloaded.get("snapshot-z");
    assert.ok(record);
    assert.ok(Object.isFrozen(record));
    assert.ok(Object.isFrozen(record.metadata));
    assert.throws(() => {
      record.metadata.visible = "changed";
    }, TypeError);
    assert.equal(reloaded.get("snapshot-z").metadata.visible, "kept");
    assert.equal(JSON.stringify(reloaded.get("snapshot-z")).includes(secret), false);
  });
});

test("rejects unsafe roots and snapshot ids before writing outside the store root", async () => {
  await withTempDir(async (rootDir) => {
    assert.throws(
      () => createWorkspaceSessionStoreFileAdapter({ rootDir: "relative-store" }),
      /root must be absolute/,
    );
    assert.throws(
      () => createWorkspaceSessionStoreFileAdapter({ rootDir: parse(rootDir).root }),
      /filesystem root/,
    );
    assert.throws(
      () => createWorkspaceSessionStoreFileAdapter({ rootDir: `${rootDir}\\safe\\..\\escape` }),
      /traversal/,
    );

    const store = createWorkspaceSessionStoreFileAdapter({ rootDir });
    const record = await createRecord("snapshot-safe");
    const traversal = {
      ...record,
      snapshotId: "../escape",
    };
    const absolute = {
      ...record,
      snapshotId: `${parse(rootDir).root}escape`,
    };

    assert.throws(() => store.create(traversal), /safe snapshot id/);
    assert.throws(() => store.create(absolute), /safe snapshot id/);
    assert.equal(snapshotFiles(rootDir).length, 0);
    assert.equal(existsSync(resolve(rootDir, "..", "escape.json")), false);
  });
});

test("uses the optional lock file guard around snapshot writes", async () => {
  await withTempDir(async (rootDir) => {
    const record = await createRecord("snapshot-lock");
    const lockPath = join(rootDir, DEFAULT_WORKSPACE_SESSION_SNAPSHOT_FILE_STORE_LOCK_FILE);
    writeFileSync(lockPath, "held\n", "utf8");

    const store = createWorkspaceSessionStoreFileAdapter({
      rootDir,
      useLockFile: true,
    });
    assert.throws(() => store.create(record), /locked/);
    assert.equal(snapshotFiles(rootDir).length, 0);

    rmSync(lockPath, { force: true });
    const created = store.create(record);
    assert.equal(created.ok, true);
    assert.equal(existsSync(lockPath), false);
    assert.equal(snapshotFiles(rootDir).length, 1);

    const duplicate = store.create(record);
    assert.deepEqual(duplicate, { ok: false, reason: "duplicate" });
    assert.equal(existsSync(lockPath), false);
  });
});

async function createRecord(snapshotId) {
  const router = createApiRouter(createWorkspaceSessionStoreRoutes({
    now: () => fixedNow,
  }));
  const response = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshots",
    body: {
      snapshotId,
      payload: createSnapshotPayload(),
    },
  });
  assertJsonResponse(response, 201);
  return structuredClone(response.body.record);
}

function createSnapshotPayload() {
  return {
    descriptor,
    sessionId,
    actor: "api-worker-c",
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

function snapshotFiles(rootDir) {
  return readdirSync(rootDir)
    .filter((file) => file.startsWith("snapshot-") && file.endsWith(".json"))
    .sort();
}

async function withTempDir(callback) {
  const parent = resolve("apps/api/tests/.tmp-workspace-session-store-file-adapter");
  mkdirSync(parent, { recursive: true });
  const rootDir = mkdtempSync(join(parent, "case-"));
  try {
    await callback(rootDir);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
    try {
      rmdirSync(parent);
    } catch {
      // Another test may still be using the shared temporary parent.
    }
  }
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
