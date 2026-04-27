import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { runCli } from "../src/index.ts";
import {
  createWorkspaceSessionSnapshotRetentionCleanupApiDispatcher,
  isWorkspaceSessionSnapshotRetentionCleanupApiReplayCommand,
  runWorkspaceSessionSnapshotRetentionCleanupApiReplayCli,
} from "../src/workspaceSessionSnapshotRetentionCleanupApiReplay.ts";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const fixturePath = fileURLToPath(
  new URL(
    "../../../examples/workspace-session/snapshot-retention-cleanup-api-requests.json",
    import.meta.url,
  ),
);
const tempDir = fileURLToPath(
  new URL("../.tmp-workspace-session-snapshot-retention-cleanup-api-replay/", import.meta.url),
);
const previewRoute = "/v1/workspace-session/snapshot-retention-cleanup/preview";

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

test("replays retention cleanup API fixtures through the local dispatcher", async () => {
  const result = await runWorkspaceSessionSnapshotRetentionCleanupApiReplayCli([
    "workspace-session",
    "snapshot",
    "retention-cleanup",
    "api",
    "replay",
    "--fixture",
    fixturePath,
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.kind, "workspace-session-snapshot-retention-cleanup-api-fixture-replay");
  assert.equal(
    payload.schemaVersion,
    "workspace-session-snapshot-retention-cleanup-api-requests/v1",
  );
  assert.equal(
    payload.fixture.path,
    "examples/workspace-session/snapshot-retention-cleanup-api-requests.json",
  );
  assert.equal(payload.totalRequests, 2);
  assert.equal(payload.replayedRequests, 2);
  assert.equal(payload.passedRequests, 2);
  assert.equal(payload.failedRequests, 0);
  assert.deepEqual(payload.summary.methods, { POST: 2 });
  assert.deepEqual(payload.summary.routes, {
    [previewRoute]: 2,
  });
  assert.deepEqual(payload.summary.actualStatuses, { 200: 1, 400: 1 });
  assert.deepEqual(payload.summary.expectedStatuses, { 200: 1, 400: 1 });
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
        "api_workspace_session_snapshot_retention_cleanup_preview",
        previewRoute,
        200,
        true,
        true,
      ],
      [
        "api_workspace_session_snapshot_retention_cleanup_invalid_sections",
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
  assert.equal(payload.requests[0].request.body.records[0].path, "[redacted-path]");
  assert.equal(payload.requests[1].actual.body.error.code, "validation_failed");
  assertNoFixturePathLeak(result.stdout);
});

test("filters retention cleanup API replay by method, route, and id through the package entrypoint", async () => {
  const result = await runCli([
    "workspace-session-snapshot-retention-cleanup-api",
    "replay",
    "--fixture",
    fixturePath,
    "--method",
    "post",
    "--route",
    previewRoute,
    "--id",
    "api_workspace_session_snapshot_retention_cleanup_preview",
  ]);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(payload.filters, {
    id: "api_workspace_session_snapshot_retention_cleanup_preview",
    method: "POST",
    route: previewRoute,
  });
  assert.equal(payload.totalRequests, 2);
  assert.equal(payload.replayedRequests, 1);
  assert.equal(payload.passedRequests, 1);
  assert.deepEqual(payload.summary.methods, { POST: 1 });
  assert.deepEqual(payload.summary.routes, {
    [previewRoute]: 1,
  });
  assert.deepEqual(payload.requests.map((request) => request.id), [
    "api_workspace_session_snapshot_retention_cleanup_preview",
  ]);
});

test("detects retention cleanup API replay command aliases and help", async () => {
  assert.equal(
    isWorkspaceSessionSnapshotRetentionCleanupApiReplayCommand([
      "workspace",
      "session",
      "snapshot",
      "retention-cleanup",
      "api",
      "replay",
    ]),
    true,
  );
  assert.equal(
    isWorkspaceSessionSnapshotRetentionCleanupApiReplayCommand([
      "workspace-session",
      "snapshot",
      "retention",
      "cleanup",
      "api",
      "replay",
    ]),
    true,
  );
  assert.equal(
    isWorkspaceSessionSnapshotRetentionCleanupApiReplayCommand([
      "workspace-session-snapshot-retention-cleanup-api",
      "replay",
    ]),
    true,
  );
  assert.equal(
    isWorkspaceSessionSnapshotRetentionCleanupApiReplayCommand([
      "workspace-session",
      "snapshot",
      "retention-cleanup",
      "preview",
    ]),
    false,
  );

  const result = await runWorkspaceSessionSnapshotRetentionCleanupApiReplayCli([
    "workspace-session-snapshot-retention-cleanup-api",
    "replay",
    "--help",
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.kind, "workspace-session-snapshot-retention-cleanup-api-replay.help");
  assert.ok(payload.usage.includes(
    "sovereignops workspace-session snapshot retention-cleanup api replay --fixture <path> [--method <method>] [--route <path>] [--id <id>]",
  ));
});

test("supports an injected retention cleanup API dispatcher without network access", async () => {
  const fixture = await writeFixture("injected-retention-cleanup-api.json", {
    schemaVersion: "workspace-session-snapshot-retention-cleanup-api-requests/v1",
    generatedAt: "2026-04-28T04:30:00.000Z",
    requests: [
      {
        id: "api_retention_cleanup_injected_dispatcher",
        route: {
          method: "POST",
          path: previewRoute,
        },
        request: {
          body: {
            records: [],
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
  const result = await runWorkspaceSessionSnapshotRetentionCleanupApiReplayCli(
    [
      "workspace-session-snapshot-retention-cleanup-api",
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

test("rejects unsafe and private retention cleanup API fixture paths as JSON-only errors", async () => {
  const unsafeCases = [
    {
      fixture: path.resolve(workspaceRoot, "..", "outside-retention-cleanup-api.json"),
      message: /must stay inside/,
    },
    {
      fixture: path.join(
        workspaceRoot,
        ".codex-private",
        "snapshot-retention-cleanup-api-requests.json",
      ),
      message: /private workspace files/,
    },
    {
      fixture: path.resolve(
        workspaceRoot,
        "..",
        "sovereignops-codex-pack",
        "snapshot-retention-cleanup-api-requests.json",
      ),
      message: /private plan-pack paths/,
    },
  ];

  for (const unsafeCase of unsafeCases) {
    const result = await runWorkspaceSessionSnapshotRetentionCleanupApiReplayCli([
      "workspace-session",
      "snapshot",
      "retention-cleanup",
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

test("reports malformed retention cleanup API fixtures as JSON-only errors", async () => {
  const invalidPath = await writeFixture("invalid-retention-cleanup-api.json", {
    schemaVersion: "workspace-session-snapshot-retention-cleanup-api-requests/v1",
    generatedAt: "2026-04-28T04:35:00.000Z",
    requests: [{ id: "api_missing_route" }],
  });
  const result = await runWorkspaceSessionSnapshotRetentionCleanupApiReplayCli([
    "workspace-session-snapshot-retention-cleanup-api",
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

test("local dispatcher returns JSON route errors without raw local path echoes", async () => {
  const dispatcher = createWorkspaceSessionSnapshotRetentionCleanupApiDispatcher();
  const rawPath = "C:\\Users\\DELL\\snapshots\\snap-unsafe.json";
  const response = await dispatcher({
    method: "POST",
    path: previewRoute,
    body: {
      records: [
        {
          path: rawPath,
          snapshotId: "snap-unsafe",
          createdAt: "2026-04-28T03:00:00.000Z",
        },
      ],
      maxCount: 1,
    },
  });
  const serialized = JSON.stringify(response.body);

  assert.equal(response.status, 400);
  assert.equal(response.headers["content-type"].startsWith("application/json"), true);
  assert.equal(response.body.error.code, "validation_failed");
  assert.equal(response.body.error.details.reason, "raw_local_path");
  assert.equal(serialized.includes(rawPath), false);

  const missingRoute = await dispatcher({
    method: "POST",
    path: "/v1/workspace-session/snapshot-retention-cleanup/missing",
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
}

function assertNoUnsafeEcho(text) {
  assert.equal(text.includes("C:\\Users\\DELL"), false);
  assert.equal(text.includes(".codex-private"), false);
  assert.equal(text.includes("sovereignops-codex-pack"), false);
}
