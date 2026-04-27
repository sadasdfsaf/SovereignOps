import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  isWorkspaceSessionSnapshotStoreCommand,
  loadWorkspaceSessionSnapshotStore,
  runWorkspaceSessionSnapshotStoreCli,
} from "../src/workspaceSessionSnapshotStore.ts";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const publicFixture = "examples/workspace-session/session-store.json";
const tempDir = fileURLToPath(
  new URL("../.tmp-workspace-session-snapshot-store/", import.meta.url),
);

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

test("inspects the public workspace session snapshot store without retaining raw bodies", async () => {
  const store = await loadWorkspaceSessionSnapshotStore(publicFixture, {
    cwd: workspaceRoot,
  });
  assert.equal(Object.hasOwn(store.routes.summary, "requestBody"), false);
  assert.equal(Object.hasOwn(store.routes.auditPreview, "requestBody"), false);

  const result = await runWorkspaceSessionSnapshotStoreCli(
    [
      "workspace-session",
      "snapshot",
      "inspect",
      "--fixture",
      publicFixture,
    ],
    {
      cwd: workspaceRoot,
    },
  );
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.kind, "workspace-session-snapshot-store.inspect");
  assert.equal(payload.schemaVersion, "workspace-session-persistence/v1");
  assert.equal(payload.fixture.path, publicFixture);
  assert.equal(payload.localOnly, true);
  assert.equal(payload.durable, true);
  assert.deepEqual(payload.network.allowedUriPrefixes, ["local://", "workspace://"]);
  assert.equal(payload.persistence.storage.format, "atomic-json");
  assert.match(payload.persistence.storage.path, /^\[redacted:path:[0-9a-f]{12}\]$/);
  assert.equal(payload.persistence.storage.rawPathsStored, false);
  assert.equal(payload.persistence.storage.rawLockMaterialStored, false);
  assert.equal(payload.persistence.descriptor.rootKeyRef, "[REDACTED]");
  assert.match(payload.persistence.session.sessionRef, /^\[redacted:sessionId:[0-9a-f]{12}\]$/);
  assert.equal(payload.persistence.session.lockTokenRef, "[REDACTED]");
  assert.equal(payload.persistence.session.snapshotVersion, 3);
  assert.deepEqual(payload.persistence.session.operations, ["open", "lock"]);
  assert.equal(payload.routes.summary.responseStatus, 200);
  assert.equal(payload.routes.summary.requestBodyPresent, true);
  assert.equal(payload.routes.summary.requestBodyRetained, false);
  assert.equal(payload.routes.summary.requestBodyOutput, false);
  assert.match(payload.routes.summary.session.sessionRef, /^\[redacted:sessionId:[0-9a-f]{12}\]$/);
  assert.equal(payload.routes.auditPreview.eventCount, 2);
  assert.equal(payload.routes.auditPreview.auditRecordCount, 2);
  assert.deepEqual(payload.routes.auditPreview.operations, { lock: 1, open: 1 });
  assert.deepEqual(payload.routes.auditPreview.actions, {
    "workspace.session.locked": 1,
    "workspace.session.opened": 1,
  });
  assert.equal(payload.routes.auditPreview.requestBodyPresent, true);
  assert.equal(payload.routes.auditPreview.requestBodyRetained, false);
  assert.equal(payload.routes.auditPreview.requestBodyOutput, false);
  assert.equal(payload.retention.writes, false);
  assert.equal(payload.retention.rawBodyRetained, false);
  assert.equal(payload.retention.rawRequestBodiesRetained, false);
  assert.equal(payload.retention.requestBodiesOutput, false);
  assert.deepEqual(
    payload.redactions.map((redaction) => redaction.path),
    [
      "$.persistence.descriptor.rootKeyRef",
      "$.persistence.session.lockTokenRef",
    ],
  );
  assertNoLeak(result.stdout);
});

test("supports snapshot store inspect command aliases", async () => {
  assert.equal(
    isWorkspaceSessionSnapshotStoreCommand([
      "workspace",
      "session",
      "snapshot",
      "inspect",
    ]),
    true,
  );
  assert.equal(
    isWorkspaceSessionSnapshotStoreCommand([
      "workspace-session",
      "snapshot-store",
      "inspect",
    ]),
    true,
  );
  assert.equal(
    isWorkspaceSessionSnapshotStoreCommand([
      "workspace-session-snapshot",
      "inspect",
    ]),
    true,
  );
  assert.equal(
    isWorkspaceSessionSnapshotStoreCommand([
      "workspace-session-snapshot-store",
      "inspect",
    ]),
    true,
  );
  assert.equal(isWorkspaceSessionSnapshotStoreCommand(["workspace", "list"]), false);

  const result = await runWorkspaceSessionSnapshotStoreCli(
    [
      "workspace-session-snapshot",
      "inspect",
      "--fixture",
      publicFixture,
    ],
    {
      cwd: workspaceRoot,
    },
  );
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(payload.fixture.path, publicFixture);
});

test("rejects private and plan-pack snapshot store fixture paths as JSON-only errors", async () => {
  const unsafeCases = [
    {
      fixture: path.join(workspaceRoot, ".codex-private", "session-store.json"),
      message: /private workspace files/,
    },
    {
      fixture: path.resolve(
        workspaceRoot,
        "..",
        "sovereignops-codex-pack",
        "session-store.json",
      ),
      message: /private plan-pack paths/,
    },
  ];

  for (const unsafeCase of unsafeCases) {
    const result = await runWorkspaceSessionSnapshotStoreCli([
      "workspace-session-snapshot",
      "inspect",
      "--fixture",
      unsafeCase.fixture,
    ], {
      cwd: workspaceRoot,
    });
    assert.ok(result);
    const payload = JSON.parse(result.stderr);

    assert.equal(result.exitCode, 2);
    assert.equal(result.stdout, "");
    assert.equal(payload.error.code, "usage_error");
    assert.match(payload.error.message, unsafeCase.message);
  }
});

test("reports malformed snapshot store fixtures as JSON-only errors", async () => {
  const invalidPath = await writeFixture("invalid-session-store.json", {
    schemaVersion: "workspace-session-persistence/v1",
    generatedAt: "2026-04-28T02:00:00.000Z",
    localOnly: true,
    durable: true,
    storage: {},
    descriptor: {},
    session: {},
    routes: {
      summary: {
        method: "POST",
        path: "/v1/workspace-session/summary",
        responseStatus: 200,
        responseBody: {},
      },
      auditPreview: {
        method: "POST",
        path: "v1/workspace-session/audit-preview",
        responseStatus: 200,
        responseBody: {},
      },
    },
  });
  const result = await runWorkspaceSessionSnapshotStoreCli([
    "workspace-session",
    "snapshot",
    "inspect",
    "--fixture",
    invalidPath,
  ], {
    cwd: workspaceRoot,
  });
  assert.ok(result);
  const payload = JSON.parse(result.stderr);

  assert.equal(result.exitCode, 2);
  assert.equal(result.stdout, "");
  assert.equal(payload.error.code, "invalid_fixture");
  assert.match(payload.error.message, /fixture\.routes\.auditPreview\.path/);
});

async function writeFixture(name, value) {
  await mkdir(tempDir, { recursive: true });
  const outputPath = path.join(tempDir, name);
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`);
  return outputPath;
}

function assertNoLeak(text) {
  assert.equal(text.includes('"requestBody":'), false);
  assert.equal(text.includes("workspaces/wsp_session_alpha/session-store.json"), false);
  assert.equal(text.includes("sess_alpha_laptop_001"), false);
  assert.equal(text.includes("key_session_alpha"), false);
  assert.equal(text.includes("141f13t"), false);
}
