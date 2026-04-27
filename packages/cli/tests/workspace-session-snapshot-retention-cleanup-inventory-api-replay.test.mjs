import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { runCli } from "../src/index.ts";
import {
  createWorkspaceSessionSnapshotRetentionCleanupInventoryApiDispatcher,
  isWorkspaceSessionSnapshotRetentionCleanupInventoryApiReplayCommand,
  runWorkspaceSessionSnapshotRetentionCleanupInventoryApiReplayCli,
} from "../src/workspaceSessionSnapshotRetentionCleanupInventoryApiReplay.ts";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const fixturePath = fileURLToPath(
  new URL(
    "../../../examples/workspace-session/snapshot-retention-cleanup-inventory-api-requests.json",
    import.meta.url,
  ),
);
const tempDir = fileURLToPath(
  new URL(
    "../.tmp-workspace-session-snapshot-retention-cleanup-inventory-api-replay/",
    import.meta.url,
  ),
);
const previewRoute = "/v1/workspace-session/snapshot-retention-cleanup/inventory/preview";

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

test("replays retention cleanup inventory API fixtures through the local dispatcher", async () => {
  const result = await runWorkspaceSessionSnapshotRetentionCleanupInventoryApiReplayCli([
    "workspace-session",
    "snapshot",
    "retention-cleanup",
    "inventory",
    "api",
    "replay",
    "--fixture",
    fixturePath,
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(
    payload.kind,
    "workspace-session-snapshot-retention-cleanup-inventory-api-fixture-replay",
  );
  assert.equal(
    payload.schemaVersion,
    "workspace-session-snapshot-retention-cleanup-inventory-api-requests/v1",
  );
  assert.equal(
    payload.fixture.path,
    "examples/workspace-session/snapshot-retention-cleanup-inventory-api-requests.json",
  );
  assert.equal(payload.totalRequests, 5);
  assert.equal(payload.replayedRequests, 5);
  assert.equal(payload.passedRequests, 5);
  assert.equal(payload.failedRequests, 0);
  assert.deepEqual(payload.summary.methods, { POST: 5 });
  assert.deepEqual(payload.summary.routes, {
    [previewRoute]: 5,
  });
  assert.deepEqual(payload.summary.actualStatuses, { 200: 1, 400: 4 });
  assert.deepEqual(payload.summary.expectedStatuses, { 200: 1, 400: 4 });
  assert.deepEqual(payload.summary.mismatches, {});
  assert.deepEqual(
    payload.requests.map((request) => [
      request.id,
      request.path,
      request.actual.status,
      request.matches.status,
      request.matches.expectation,
    ]),
    [
      [
        "api_workspace_session_snapshot_retention_cleanup_inventory_preview",
        previewRoute,
        200,
        true,
        true,
      ],
      [
        "api_workspace_session_snapshot_retention_cleanup_inventory_reject_raw_path_secret",
        previewRoute,
        400,
        true,
        true,
      ],
      [
        "api_workspace_session_snapshot_retention_cleanup_inventory_reject_lock_token",
        previewRoute,
        400,
        true,
        true,
      ],
      [
        "api_workspace_session_snapshot_retention_cleanup_inventory_invalid_sections",
        previewRoute,
        400,
        true,
        true,
      ],
      [
        "api_workspace_session_snapshot_retention_cleanup_inventory_invalid_policy",
        previewRoute,
        400,
        true,
        true,
      ],
    ],
  );
  assert.equal(
    payload.requests[0].actual.body.kind,
    "localWorkspaceSessionSnapshotRetentionCleanupPlan",
  );
  assert.equal(payload.requests[0].actual.body.keepCount, 2);
  assert.equal(payload.requests[0].actual.body.deleteCount, 1);
  assert.equal(payload.requests[0].actual.body.reviewCount, 0);
  assert.equal(payload.requests[0].request.headers.authorization, "[REDACTED]");
  assert.equal(
    payload.requests[0].request.body.inventory.files[0].path,
    "[redacted-path]",
  );
  assert.equal(
    payload.requests[1].request.body.inventory[0].path,
    "[redacted-path]",
  );
  assert.equal(payload.requests[1].request.body.inventory[0].apiToken, "[REDACTED]");
  assert.equal(payload.requests[1].actual.body.error.details.reason, "raw_local_path");
  assert.equal(payload.requests[2].request.body.inventory[0].lockToken, "[REDACTED]");
  assert.equal(payload.requests[2].actual.body.error.details.reason, "raw_lock_token");
  assert.equal(payload.requests[3].actual.body.error.code, "validation_failed");
  assert.equal(payload.requests[4].actual.body.error.code, "validation_failed");
  assertNoFixturePathLeak(result.stdout);
  assertNoUnsafeEcho(result.stdout);
});

test("filters retention cleanup inventory API replay by method, route, and id through the package entrypoint", async () => {
  const result = await runCli([
    "workspace-session-snapshot-retention-cleanup-inventory-api",
    "replay",
    "--fixture",
    fixturePath,
    "--method",
    "post",
    "--route",
    previewRoute,
    "--id",
    "api_workspace_session_snapshot_retention_cleanup_inventory_preview",
  ]);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(payload.filters, {
    id: "api_workspace_session_snapshot_retention_cleanup_inventory_preview",
    method: "POST",
    route: previewRoute,
  });
  assert.equal(payload.totalRequests, 5);
  assert.equal(payload.replayedRequests, 1);
  assert.equal(payload.passedRequests, 1);
  assert.deepEqual(payload.summary.methods, { POST: 1 });
  assert.deepEqual(payload.summary.routes, {
    [previewRoute]: 1,
  });
  assert.deepEqual(payload.requests.map((request) => request.id), [
    "api_workspace_session_snapshot_retention_cleanup_inventory_preview",
  ]);
});

test("detects retention cleanup inventory API replay command aliases and help", async () => {
  assert.equal(
    isWorkspaceSessionSnapshotRetentionCleanupInventoryApiReplayCommand([
      "workspace",
      "session",
      "snapshot",
      "retention-cleanup",
      "inventory",
      "api",
      "replay",
    ]),
    true,
  );
  assert.equal(
    isWorkspaceSessionSnapshotRetentionCleanupInventoryApiReplayCommand([
      "workspace-session",
      "snapshot",
      "retention",
      "cleanup",
      "inventory",
      "api",
      "replay",
    ]),
    true,
  );
  assert.equal(
    isWorkspaceSessionSnapshotRetentionCleanupInventoryApiReplayCommand([
      "workspace-session-snapshot-retention-cleanup-inventory-api",
      "replay",
    ]),
    true,
  );
  assert.equal(
    isWorkspaceSessionSnapshotRetentionCleanupInventoryApiReplayCommand([
      "workspace-session",
      "snapshot",
      "retention-cleanup",
      "inventory",
    ]),
    false,
  );

  const result = await runWorkspaceSessionSnapshotRetentionCleanupInventoryApiReplayCli([
    "workspace-session-snapshot-retention-cleanup-inventory-api",
    "replay",
    "--help",
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(
    payload.kind,
    "workspace-session-snapshot-retention-cleanup-inventory-api-replay.help",
  );
  assert.ok(payload.usage.includes(
    "sovereignops workspace-session snapshot retention-cleanup inventory api replay --fixture <path> [--method <method>] [--route <path>] [--id <id>]",
  ));
});

test("supports an injected retention cleanup inventory API dispatcher without network access", async () => {
  const fixture = await writeFixture("injected-retention-cleanup-inventory-api.json", {
    schemaVersion: "workspace-session-snapshot-retention-cleanup-inventory-api-requests/v1",
    generatedAt: "2026-04-28T05:20:00.000Z",
    requests: [
      {
        id: "api_retention_cleanup_inventory_injected_dispatcher",
        route: {
          method: "POST",
          path: previewRoute,
        },
        request: {
          body: {
            inventory: [],
          },
        },
        expect: {
          status: 202,
          contentType: "application/json",
          kind: "fixture.injected",
        },
      },
    ],
  });
  const result = await runWorkspaceSessionSnapshotRetentionCleanupInventoryApiReplayCli(
    [
      "workspace-session-snapshot-retention-cleanup-inventory-api",
      "replay",
      "--fixture",
      fixture,
    ],
    {
      dispatch: async (request) => ({
        status: 202,
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
        body: {
          kind: "fixture.injected",
          route: request.path,
        },
      }),
    },
  );
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.passedRequests, 1);
  assert.equal(payload.requests[0].actual.status, 202);
  assert.equal(payload.requests[0].actual.body.kind, "fixture.injected");
});

test("rejects unsafe and private retention cleanup inventory API fixture paths as JSON-only errors", async () => {
  const unsafeCases = [
    {
      fixture: path.resolve(workspaceRoot, "..", "outside-retention-cleanup-inventory-api.json"),
      message: /must stay inside/,
    },
    {
      fixture: path.join(
        workspaceRoot,
        ".codex-private",
        "snapshot-retention-cleanup-inventory-api-requests.json",
      ),
      message: /private workspace files/,
    },
    {
      fixture: path.resolve(
        workspaceRoot,
        "..",
        "sovereignops-codex-pack",
        "snapshot-retention-cleanup-inventory-api-requests.json",
      ),
      message: /private plan-pack paths/,
    },
  ];

  for (const unsafeCase of unsafeCases) {
    const result = await runWorkspaceSessionSnapshotRetentionCleanupInventoryApiReplayCli([
      "workspace-session",
      "snapshot",
      "retention-cleanup",
      "inventory",
      "api",
      "replay",
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
    assertNoUnsafeEcho(result.stderr);
  }
});

test("reports malformed retention cleanup inventory API fixtures as JSON-only errors", async () => {
  const invalidPath = await writeFixture("invalid-retention-cleanup-inventory-api.json", {
    schemaVersion: "workspace-session-snapshot-retention-cleanup-inventory-api-requests/v1",
    generatedAt: "2026-04-28T05:25:00.000Z",
    requests: [{ id: "api_missing_route" }],
  });
  const result = await runWorkspaceSessionSnapshotRetentionCleanupInventoryApiReplayCli([
    "workspace-session-snapshot-retention-cleanup-inventory-api",
    "replay",
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
  assert.match(payload.error.message, /fixture\.requests\[0\]\.route/);
});

test("local inventory dispatcher returns JSON route errors without raw local path, secret, or lock token echoes", async () => {
  const dispatcher = createWorkspaceSessionSnapshotRetentionCleanupInventoryApiDispatcher();
  const rawPath = "C:\\Users\\DELL\\snapshots\\snap-unsafe.json";
  const rawSecret = "sk-raw-secret-00000001";
  const rawLockToken = "lock_alpha_laptop_001";

  const rawPathResponse = await dispatcher({
    method: "POST",
    path: previewRoute,
    body: {
      inventory: [
        {
          path: rawPath,
          snapshotId: "snap-unsafe",
          createdAt: "2026-04-28T03:00:00.000Z",
          apiToken: rawSecret,
        },
      ],
      policy: {
        maxCount: 1,
      },
    },
  });
  assert.equal(rawPathResponse.status, 400);
  assert.equal(rawPathResponse.headers["content-type"].startsWith("application/json"), true);
  assert.equal(rawPathResponse.body.error.code, "validation_failed");
  assert.equal(rawPathResponse.body.error.details.reason, "raw_local_path");
  assertNoRawValues(JSON.stringify(rawPathResponse.body), [rawPath, rawSecret]);

  const secretResponse = await dispatcher({
    method: "POST",
    path: previewRoute,
    body: {
      inventory: [
        {
          path: "snapshots/snap-secret.json",
          snapshotId: "snap-secret",
          createdAt: "2026-04-28T03:00:00.000Z",
          apiToken: rawSecret,
        },
      ],
      policy: {
        maxCount: 1,
      },
    },
  });
  assert.equal(secretResponse.status, 400);
  assert.equal(secretResponse.body.error.details.reason, "raw_secret");
  assertNoRawValues(JSON.stringify(secretResponse.body), [rawSecret]);

  const lockTokenResponse = await dispatcher({
    method: "POST",
    path: previewRoute,
    body: {
      inventory: [
        {
          path: "snapshots/snap-lock.json",
          snapshotId: "snap-lock",
          createdAt: "2026-04-28T03:00:00.000Z",
          lockToken: rawLockToken,
        },
      ],
      policy: {
        maxCount: 1,
      },
    },
  });
  assert.equal(lockTokenResponse.status, 400);
  assert.equal(lockTokenResponse.body.error.details.reason, "raw_lock_token");
  assertNoRawValues(JSON.stringify(lockTokenResponse.body), [rawLockToken]);

  const missingRoute = await dispatcher({
    method: "POST",
    path: "/v1/workspace-session/snapshot-retention-cleanup/inventory/missing",
    body: {},
  });
  assert.equal(missingRoute.status, 404);
  assert.equal(missingRoute.body.error.code, "API_ROUTE_NOT_FOUND");
});

async function writeFixture(name, value) {
  await mkdir(tempDir, { recursive: true });
  const outputPath = path.join(tempDir, name);
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`);
  return outputPath;
}

function assertNoFixturePathLeak(text) {
  assert.equal(text.includes("snapshots/snap-current.json"), false);
  assert.equal(text.includes("snapshots/snap-previous.json"), false);
  assert.equal(text.includes("snapshots/snap-stale.json"), false);
  assert.equal(text.includes("snapshots/snap-policy.json"), false);
  assert.equal(text.includes("snapshots/snap-lock.json"), false);
}

function assertNoUnsafeEcho(text) {
  assert.equal(text.includes("C:\\Users\\DELL"), false);
  assert.equal(text.includes("sk-raw-secret-00000001"), false);
  assert.equal(text.includes("lock_alpha_laptop_001"), false);
  assert.equal(text.includes(".codex-private"), false);
  assert.equal(text.includes("sovereignops-codex-pack"), false);
}

function assertNoRawValues(text, values) {
  for (const value of values) {
    assert.equal(text.includes(value), false);
  }
}
