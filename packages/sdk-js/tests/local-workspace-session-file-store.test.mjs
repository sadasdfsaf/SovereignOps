import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  LOCAL_WORKSPACE_SESSION_FILE_STORE_ERROR_CODES,
  LocalWorkspaceSessionFileStoreError,
  createLocalWorkspaceSessionFileStore,
  readLocalWorkspaceSessionStoreBundleFile,
  resolveLocalWorkspaceSessionFileStorePath,
  writeLocalWorkspaceSessionStoreBundleFile,
} from "../src/localWorkspaceSessionFileStore.ts";
import {
  LOCAL_WORKSPACE_SESSION_STORE_ERROR_CODES,
  LocalWorkspaceSessionStoreError,
  createLocalWorkspaceSessionStoreBundle,
  serializeLocalWorkspaceSessionStoreBundle,
} from "../src/localWorkspaceSessionStore.ts";
import {
  planLocalWorkspaceSessionLockEvent,
  planLocalWorkspaceSessionOpenEvent,
} from "../src/localWorkspaceSession.ts";
import {
  STORAGE_ERROR_CODES,
  StorageAdapterError,
} from "../src/storage.ts";

const descriptor = {
  workspaceId: "wsp_alpha",
  deviceId: "dev_laptop",
  rootKeyRef: "key_alpha",
  createdAt: "2026-04-27T00:00:00.000Z",
  updatedAt: "2026-04-27T00:00:00.000Z",
  storagePath: "sessions/wsp_alpha/session.json",
  gateway: {
    host: "localhost",
    port: 48231,
  },
};
const sessionId = "sess_alpha_laptop_001";
const lockToken = "lock_alpha_laptop_001";
const rawSecret = "sk-file-store-secret-001";
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

test("writes and reads deterministic redacted session bundles under a root", async () => {
  await usingTempDir(async (rootDir) => {
    const store = createLocalWorkspaceSessionFileStore({
      rootDir,
      path: "sessions/wsp_alpha/session.json",
    });
    const open = openEvent(1);
    const lock = lockEvent(2);
    const bundleInput = {
      snapshot: {
        descriptor,
        sessionId,
        snapshotId: "wssnap_alpha_laptop_file_001",
        events: [open, lock],
        metadata: {
          apiToken: rawSecret,
          nested: {
            safe: "value",
          },
        },
      },
      events: [open, lock],
    };

    const saved = await store.writeBundle(bundleInput);
    const expected = serializeLocalWorkspaceSessionStoreBundle(bundleInput);
    const raw = await readFile(store.absolutePath, "utf8");
    const loaded = await store.readBundle();

    assert.equal(store.rootDir, resolve(rootDir));
    assert.equal(store.path, "sessions/wsp_alpha/session.json");
    assert.equal(raw, expected);
    assert.equal(raw.includes(rawSecret), false);
    assert.equal(raw.includes(lockToken), false);
    assert.deepEqual(loaded, saved);
    assert.deepEqual(
      loaded.snapshot.redaction.redactedFields,
      ["metadata.apiToken"],
    );
    assert.equal(Object.isFrozen(loaded), true);
    assert.equal(Object.isFrozen(loaded.snapshot.metadata.nested), true);
    assert.throws(() => {
      loaded.events.push(open);
    }, TypeError);
    assert.throws(() => {
      loaded.snapshot.metadata.nested.safe = "changed";
    }, TypeError);
    assert.deepEqual(await readdir(join(rootDir, "sessions", "wsp_alpha")), ["session.json"]);
  });
});

test("returns undefined for missing bundles and preserves parser errors for invalid JSON", async () => {
  await usingTempDir(async (rootDir) => {
    const store = createLocalWorkspaceSessionFileStore({
      rootDir,
      path: "sessions/wsp_alpha/session.json",
    });

    assert.equal(await store.loadBundle(), undefined);
    await mkdir(dirname(store.absolutePath), { recursive: true });
    await writeFile(store.absolutePath, "{", "utf8");

    await assert.rejects(
      store.readBundle(),
      (error) => {
        assert.equal(error instanceof LocalWorkspaceSessionStoreError, true);
        assert.equal(error.code, LOCAL_WORKSPACE_SESSION_STORE_ERROR_CODES.INVALID_JSON);
        return true;
      },
    );
  });
});

test("rejects unsafe relative paths and non-absolute roots", async () => {
  await usingTempDir(async (rootDir) => {
    for (const path of [
      "../session.json",
      "/tmp/session.json",
      "C:/tmp/session.json",
      "sessions\\wsp_alpha\\session.json",
      "sessions/wsp_alpha/session.txt",
      "secrets/session.json",
    ]) {
      assert.throws(
        () => resolveLocalWorkspaceSessionFileStorePath({ rootDir, path }),
        (error) => {
          assert.equal(error instanceof StorageAdapterError, true);
          assert.equal(error.code, STORAGE_ERROR_CODES.INVALID_PATH);
          return true;
        },
      );
    }

    assert.throws(
      () => createLocalWorkspaceSessionFileStore({
        rootDir: "relative-root",
        path: "sessions/wsp_alpha/session.json",
      }),
      (error) => {
        assert.equal(error instanceof LocalWorkspaceSessionFileStoreError, true);
        assert.equal(error.code, LOCAL_WORKSPACE_SESSION_FILE_STORE_ERROR_CODES.INVALID_ROOT);
        return true;
      },
    );
  });
});

test("guards writes with optional lock files and leaves existing content intact", async () => {
  await usingTempDir(async (rootDir) => {
    const store = createLocalWorkspaceSessionFileStore({
      rootDir,
      path: "sessions/wsp_alpha/session.json",
      useLockFile: true,
    });
    const initial = bundle("wssnap_alpha_laptop_file_001", [openEvent(1)]);
    const replacement = bundle("wssnap_alpha_laptop_file_002", [openEvent(1), lockEvent(2)]);

    await store.writeBundle(initial);
    await writeFile(store.lockPath, "held\n", "utf8");

    await assert.rejects(
      store.writeBundle(replacement),
      (error) => {
        assert.equal(error instanceof LocalWorkspaceSessionFileStoreError, true);
        assert.equal(error.code, LOCAL_WORKSPACE_SESSION_FILE_STORE_ERROR_CODES.LOCKED);
        return true;
      },
    );

    const loaded = await store.readBundle();
    assert.equal(loaded.snapshot.snapshotId, "wssnap_alpha_laptop_file_001");
    await rm(store.lockPath, { force: true });

    const saved = await store.writeBundle(replacement);
    assert.equal(saved.snapshot.snapshotId, "wssnap_alpha_laptop_file_002");
    await assert.rejects(readFile(store.lockPath, "utf8"), { code: "ENOENT" });
  });
});

test("function primitives share the same path validation and clone boundaries", async () => {
  await usingTempDir(async (rootDir) => {
    const path = "sessions/wsp_alpha/session.json";
    const written = await writeLocalWorkspaceSessionStoreBundleFile(
      { rootDir, path, useLockFile: true },
      bundle("wssnap_alpha_laptop_file_003", [openEvent(1)]),
    );
    const loaded = await readLocalWorkspaceSessionStoreBundleFile({ rootDir, path });

    assert.deepEqual(loaded, written);
    assert.equal(Object.isFrozen(loaded.snapshot.descriptor.gateway), true);
    assert.throws(() => {
      loaded.snapshot.descriptor.gateway.port = 1;
    }, TypeError);
  });
});

function bundle(snapshotId, events) {
  return createLocalWorkspaceSessionStoreBundle({
    snapshot: {
      descriptor,
      sessionId,
      snapshotId,
      events,
    },
    events,
  });
}

function openEvent(sequence) {
  return structuredClone(planLocalWorkspaceSessionOpenEvent({
    descriptor,
    sessionId,
    sequence,
    createdAt: `2026-04-27T00:0${sequence}:00.000Z`,
  }));
}

function lockEvent(sequence) {
  return structuredClone(planLocalWorkspaceSessionLockEvent({
    descriptor,
    sessionId,
    sequence,
    createdAt: `2026-04-27T00:0${sequence}:00.000Z`,
    lockToken,
  }));
}

async function usingTempDir(fn) {
  const rootDir = await mkdtemp(join(repoRoot, ".tmp-sdk-js-session-file-store-"));
  try {
    await fn(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}
