import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { createApiRouter } from "../../apps/api/src/router.ts";
import {
  createWorkspaceSessionSnapshotRetentionCleanupRoutes,
} from "../../apps/api/src/workspaceSessionSnapshotRetentionCleanupRoutes.ts";
import {
  buildWorkspaceSessionSnapshotRetentionCleanupState,
} from "../../apps/web/src/workspaceSessionSnapshotRetentionCleanupState.ts";
import {
  isWorkspaceSessionSnapshotRetentionCleanupCommand,
  loadWorkspaceSessionSnapshotRetentionCleanupInput,
  runWorkspaceSessionSnapshotRetentionCleanupCli,
} from "../../packages/cli/src/workspaceSessionSnapshotRetentionCleanup.ts";
import {
  planFileBackedLocalWorkspaceSessionSnapshotRetentionCleanup,
  planSnapshotRetentionCleanupDryRun,
} from "../../packages/sdk-js/src/localWorkspaceSessionSnapshotRetention.ts";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));
const publicFixturePath = path.join(
  workspaceRoot,
  "examples",
  "workspace-session",
  "snapshot-retention-cleanup.json",
);
const publicFixtureRelativePath = path.relative(workspaceRoot, publicFixturePath);

const dayMs = 24 * 60 * 60 * 1000;
const timestamp = "2026-04-28T07:00:00.000Z";
const rawWindowsPath = "C:\\Users\\DELL\\SovereignOps\\snapshot-cleanup\\retention.json";
const rawUnixPath = "/home/operator/sovereignops/snapshot-cleanup/retention.json";
const rawSecret = "sk-snapshot-cleanup-secret-123456";
const rawBearer = `Bearer ${rawSecret}`;
const rawLockToken = "lock_snapshot_cleanup_alpha_001";
const privatePackSegment = ["sovereignops", "-codex", "-pack"].join("");
const privatePlanPackPath = path.join(
  "E:\\",
  privatePackSegment,
  privatePackSegment,
  "snapshot-cleanup",
  "retention.json",
);

describe("workspace session snapshot retention cleanup dry-run threats", () => {
  it("plans SDK cleanup as dry-run only without mutating inputs or leaking raw material", async () => {
    const fixtureText = await readFile(publicFixturePath, "utf8");
    const cleanupEntries = [
      safeCleanupEntry({
        path: "snapshots/wssnap-cleanup-old.json",
        snapshotId: "wssnap_cleanup_old",
        createdAt: "2026-04-20T00:00:00.000Z",
      }),
      safeCleanupEntry({
        path: "snapshots/wssnap-cleanup-new.json",
        snapshotId: "wssnap_cleanup_new",
        createdAt: "2026-04-28T06:45:00.000Z",
      }),
      {
        path: rawWindowsPath,
        snapshotId: "wssnap_cleanup_requires_review",
        createdAt: "2026-04-20T00:00:00.000Z",
        metadata: {
          authorization: rawBearer,
          lockToken: rawLockToken,
          privatePlanPackPath,
          sourcePath: rawUnixPath,
        },
      },
    ];
    const beforeEntries = structuredClone(cleanupEntries);

    assertNoPrivatePlanPackReferences(fixtureText);

    const plan = planSnapshotRetentionCleanupDryRun({
      entries: cleanupEntries,
      maxCount: 1,
      maxAgeMs: dayMs,
      now: timestamp,
    });
    const filePlan = planFileBackedLocalWorkspaceSessionSnapshotRetentionCleanup({
      files: cleanupEntries,
      maxCount: 1,
      maxAgeMs: dayMs,
      now: timestamp,
    });

    assert.deepEqual(cleanupEntries, beforeEntries);
    assert.deepEqual(filePlan, plan);
    assert.equal(plan.kind, "localWorkspaceSessionSnapshotRetentionCleanupPlan");
    assert.equal(plan.localOnly, true);
    assert.equal(plan.dryRun, true);
    assert.equal(plan.durableWrites, false);
    assert.equal(plan.entryCount, 3);
    assert.equal(plan.keepCount, 1);
    assert.equal(plan.deleteCount, 1);
    assert.equal(plan.reviewCount, 1);
    assert.deepEqual(actionIds(plan.keepActions), ["wssnap_cleanup_new"]);
    assert.deepEqual(actionIds(plan.deleteActions), ["wssnap_cleanup_old"]);
    assert.deepEqual(plan.reviewActions[0].reasons, [
      "requires-review",
      "raw-lock-token",
      "raw-secret",
      "unsafe-absolute-path",
    ]);
    assert.equal(Object.isFrozen(plan), true);
    assert.equal(Object.isFrozen(plan.actions), true);
    assertNoMutationFields(plan);
    assertNoRawValues(plan, forbiddenRawValues());
    assertNoRawRequestBodies(JSON.stringify(plan));
  });

  it("keeps API and Web retention cleanup previews local-only with no request mutation", async () => {
    const router = createApiRouter(createWorkspaceSessionSnapshotRetentionCleanupRoutes());
    const input = {
      entries: [
        safeCleanupEntry({
          path: "snapshots/api-cleanup-old.json",
          snapshotId: "wssnap_cleanup_api_old",
          createdAt: "2026-04-20T00:00:00.000Z",
        }),
        safeCleanupEntry({
          path: "snapshots/api-cleanup-new.json",
          snapshotId: "wssnap_cleanup_api_new",
          createdAt: "2026-04-28T06:30:00.000Z",
        }),
      ],
      maxCount: 1,
      maxAgeMs: dayMs,
      now: timestamp,
    };
    const beforeInput = structuredClone(input);

    assert.deepEqual(
      router.listRoutes().map(routeKey),
      ["POST /v1/workspace-session/snapshot-retention-cleanup/preview"],
    );

    const response = await router.dispatch({
      method: "POST",
      path: "/v1/workspace-session/snapshot-retention-cleanup/preview",
      body: input,
    });
    const state = buildWorkspaceSessionSnapshotRetentionCleanupState({
      body: response.body,
    }, {
      defaultTimestamp: timestamp,
    });

    assert.deepEqual(input, beforeInput);
    assertJsonResponse(response, 200);
    assert.equal(response.body.kind, "localWorkspaceSessionSnapshotRetentionCleanupPlan");
    assert.equal(response.body.localOnly, true);
    assert.equal(response.body.dryRun, true);
    assert.equal(response.body.durableWrites, false);
    assert.equal(response.body.keepCount, 1);
    assert.equal(response.body.deleteCount, 1);
    assert.equal(response.body.reviewCount, 0);
    assert.equal(state.localOnly, true);
    assert.equal(state.dryRun, true);
    assert.equal(state.dryRunReady, true);
    assert.equal(state.durableWrites, false);
    assert.equal(state.rawBodyRetained, false);
    assert.equal(state.rawPathRetained, false);
    assert.equal(state.rawTokenRetained, false);
    assert.equal(state.keepCount, 1);
    assert.equal(state.deleteCount, 1);
    assert.equal(state.reviewCount, 0);
    assertNoMutationFields({ body: response.body, state });
    assertNoRawValues({ body: response.body, state }, forbiddenRawValues());
    assertNoRawRequestBodies(JSON.stringify({ body: response.body, state }));
  });

  it("keeps CLI retention cleanup preview JSON-only and rejects private-pack inputs without echoing them", async () => {
    const fixture = await loadWorkspaceSessionSnapshotRetentionCleanupInput(
      publicFixtureRelativePath,
      { cwd: workspaceRoot },
    );
    const result = await runWorkspaceSessionSnapshotRetentionCleanupCli(
      [
        "workspace-session",
        "snapshot",
        "retention-cleanup",
        "preview",
        "--fixture",
        publicFixtureRelativePath,
      ],
      { cwd: workspaceRoot },
    );

    assert.equal(
      isWorkspaceSessionSnapshotRetentionCleanupCommand([
        "workspace-session",
        "snapshot",
        "retention-cleanup",
        "preview",
      ]),
      true,
    );
    assert.equal(
      isWorkspaceSessionSnapshotRetentionCleanupCommand([
        "workspace-session",
        "snapshot",
        "retention-cleanup",
        "apply",
      ]),
      false,
    );
    assert.equal(fixture.records.length, 4);
    assert.ok(result);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.kind, "workspace-session-snapshot-retention-cleanup.preview");
    assert.equal(payload.retention.previewOnly, true);
    assert.equal(payload.retention.localOnly, true);
    assert.equal(payload.retention.dryRun, true);
    assert.equal(payload.retention.durableWrites, false);
    assert.equal(payload.retention.writes, false);
    assert.equal(payload.retention.deletes, false);
    assert.equal(payload.retention.mutation, false);
    assert.equal(payload.plan.kind, "localWorkspaceSessionSnapshotRetentionCleanupPlan");
    assertNoMutationFields(payload);
    assertNoRawValues(payload, forbiddenRawValues());
    assertNoRawRequestBodies(result.stdout);

    const privatePathFailure = await runWorkspaceSessionSnapshotRetentionCleanupCli(
      [
        "workspace-session",
        "snapshot",
        "retention-cleanup",
        "preview",
        "--fixture",
        privatePlanPackPath,
      ],
      { cwd: workspaceRoot },
    );

    assert.ok(privatePathFailure);
    assert.equal(privatePathFailure.exitCode, 2);
    assert.equal(privatePathFailure.stdout, "");
    const stderrPayload = JSON.parse(privatePathFailure.stderr);
    assert.deepEqual(Object.keys(stderrPayload), ["error"]);
    assert.equal(stderrPayload.error.code, "usage_error");
    assertNoRawValues(privatePathFailure.stderr, [
      privatePlanPackPath,
      privatePackSegment,
      rawWindowsPath,
      rawUnixPath,
      rawSecret,
      rawBearer,
      rawLockToken,
    ]);
    assertNoRawRequestBodies(privatePathFailure.stderr);
  });

  it("returns JSON-only API failures for unsafe cleanup metadata without leaking request material", async () => {
    const router = createApiRouter(createWorkspaceSessionSnapshotRetentionCleanupRoutes());
    const unsafeRecord = safeCleanupEntry({
      snapshotId: "wssnap_cleanup_api_unsafe",
      metadata: {
        authorization: rawBearer,
        lockToken: rawLockToken,
        privatePlanPackPath,
        rawPath: rawWindowsPath,
      },
    });

    const response = await router.dispatch({
      method: "POST",
      path: "/v1/workspace-session/snapshot-retention-cleanup/preview",
      body: {
        entries: [unsafeRecord],
        maxCount: 1,
        now: timestamp,
      },
    });

    assertJsonError(response, 400, "validation_failed");
    assert.equal(typeof response.body.error.details.path, "string");
    assert.match(response.body.error.details.path, /^body\.entries\.0\.metadata\./);
    assertNoRawValues(response.body, forbiddenRawValues());
    assertNoRawRequestBodies(JSON.stringify(response.body));
  });
});

function safeCleanupEntry(overrides = {}) {
  return {
    path: "snapshots/wssnap-cleanup-alpha.json",
    snapshotId: "wssnap_cleanup_alpha",
    workspaceId: "wsp_snapshot_cleanup_alpha",
    deviceId: "dev_snapshot_cleanup_laptop",
    sessionId: "[redacted:session:alpha]",
    createdAt: "2026-04-28T06:00:00.000Z",
    updatedAt: "2026-04-28T06:05:00.000Z",
    sizeBytes: 2048,
    eventCount: 2,
    fingerprint: `sha256:${"a".repeat(64)}`,
    snapshotFingerprint: `sha256:${"b".repeat(64)}`,
    ...overrides,
  };
}

function actionIds(actions) {
  return actions.map((action) => action.summary.snapshotId);
}

function routeKey(route) {
  return `${route.method} ${route.path}`;
}

function forbiddenRawValues() {
  return [
    rawWindowsPath,
    rawUnixPath,
    privatePlanPackPath,
    privatePackSegment,
    rawLockToken,
    rawSecret,
    rawBearer,
  ];
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

function assertNoRawValues(value, rawValues) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  for (const raw of rawValues) {
    assert.equal(serialized.includes(raw), false, `leaked raw value: ${raw}`);
    assert.equal(
      serialized.includes(raw.replaceAll("\\", "\\\\")),
      false,
      `leaked escaped raw value: ${raw}`,
    );
  }
}

function assertNoPrivatePlanPackReferences(value) {
  assertNoRawValues(value, [
    privatePackSegment,
    path.join("E:\\", privatePackSegment),
    ".codex-private",
  ]);
}

function assertNoRawRequestBodies(text) {
  for (const key of [
    '"requestBody":',
    '"rawBody":',
    '"rawRequestBody":',
    '"bodySnapshot":',
    '"metadata":{"authorization"',
  ]) {
    assert.equal(text.includes(key), false, `retained raw body field ${key}`);
  }
}

function assertNoMutationFields(value) {
  const serialized = JSON.stringify(value);
  for (const key of [
    '"applied":true',
    '"dryRun":false',
    '"durableWrites":true',
    '"writes":true',
    '"deletes":true',
    '"deletedSnapshotIds"',
    '"removedSnapshotIds"',
    '"unlinkedPaths"',
    '"mutated":true',
  ]) {
    assert.equal(serialized.includes(key), false, `retention cleanup exposed mutation field ${key}`);
  }
}
