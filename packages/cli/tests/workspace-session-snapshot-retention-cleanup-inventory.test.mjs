import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { runCli } from "../src/index.ts";
import {
  isWorkspaceSessionSnapshotRetentionCleanupInventoryCommand,
  loadWorkspaceSessionSnapshotRetentionCleanupInventoryInput,
  runWorkspaceSessionSnapshotRetentionCleanupInventoryCli,
} from "../src/workspaceSessionSnapshotRetentionCleanupInventory.ts";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const publicFixture = "examples/workspace-session/snapshot-retention-cleanup-inventory.json";
const tempDir = fileURLToPath(
  new URL(
    "../.tmp-workspace-session-snapshot-retention-cleanup-inventory/",
    import.meta.url,
  ),
);
const dayMs = 24 * 60 * 60 * 1000;

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

test("supports inventory help and command aliases", async () => {
  assert.equal(
    isWorkspaceSessionSnapshotRetentionCleanupInventoryCommand([
      "workspace-session",
      "snapshot",
      "retention-cleanup",
      "inventory",
    ]),
    true,
  );
  assert.equal(
    isWorkspaceSessionSnapshotRetentionCleanupInventoryCommand([
      "workspace",
      "session",
      "snapshot",
      "retention-cleanup",
      "inventory",
    ]),
    true,
  );
  assert.equal(
    isWorkspaceSessionSnapshotRetentionCleanupInventoryCommand([
      "workspace-session",
      "snapshot",
      "retention",
      "cleanup",
      "inventory",
    ]),
    true,
  );
  assert.equal(
    isWorkspaceSessionSnapshotRetentionCleanupInventoryCommand([
      "workspace-session-snapshot",
      "retention-cleanup",
      "inventory",
    ]),
    true,
  );
  assert.equal(
    isWorkspaceSessionSnapshotRetentionCleanupInventoryCommand([
      "workspace-session-snapshot-retention-cleanup",
      "inventory",
    ]),
    true,
  );
  assert.equal(
    isWorkspaceSessionSnapshotRetentionCleanupInventoryCommand([
      "workspace-session",
      "snapshot",
      "retention-cleanup",
      "preview",
    ]),
    false,
  );

  const result = await runWorkspaceSessionSnapshotRetentionCleanupInventoryCli([
    "workspace-session-snapshot-retention-cleanup",
    "inventory",
    "--help",
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.kind, "workspace-session-snapshot-retention-cleanup-inventory.help");
  assert.equal(
    payload.schemaVersion,
    "workspace-session-snapshot-retention-cleanup-inventory-cli/v1",
  );
  assert.ok(payload.usage.includes(
    "sovereignops workspace-session snapshot retention-cleanup inventory --fixture <path>",
  ));
});

test("inventories a workspace-local snapshot file metadata fixture", async () => {
  const loaded = await loadWorkspaceSessionSnapshotRetentionCleanupInventoryInput(
    publicFixture,
    { cwd: workspaceRoot },
  );
  assert.equal(loaded.files.length, 4);

  const result = await runCli([
    "workspace-session",
    "snapshot",
    "retention-cleanup",
    "inventory",
    "--fixture",
    publicFixture,
  ], {
    cwd: workspaceRoot,
  });
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.kind, "workspace-session-snapshot-retention-cleanup.inventory");
  assert.equal(
    payload.schemaVersion,
    "workspace-session-snapshot-retention-cleanup-inventory-cli/v1",
  );
  assert.equal(payload.fixture.path, publicFixture);
  assert.equal(payload.inventory.localOnly, true);
  assert.equal(payload.inventory.safeRelativeOrRedactedMetadataOnly, true);
  assert.equal(payload.inventory.sourcePath, "$.inventory");
  assert.deepEqual(payload.inventory.inspectedSections, ["files"]);
  assert.equal(payload.retention.previewOnly, true);
  assert.equal(payload.retention.writes, false);
  assert.equal(payload.retention.deletes, false);
  assert.equal(payload.retention.mutation, false);
  assert.equal(payload.retention.wouldKeepCount, 2);
  assert.equal(payload.retention.wouldDeleteCount, 1);
  assert.equal(payload.retention.reviewCount, 1);
  assert.equal(payload.plan.kind, "localWorkspaceSessionSnapshotRetentionCleanupPlan");
  assert.equal(payload.plan.localOnly, true);
  assert.equal(payload.plan.dryRun, true);
  assert.equal(payload.plan.durableWrites, false);
  assert.equal(payload.plan.entryCount, 4);
  assert.equal(payload.plan.keepCount, 2);
  assert.equal(payload.plan.deleteCount, 1);
  assert.equal(payload.plan.reviewCount, 1);
  assert.equal(payload.plan.thresholds.cutoffAt, "2026-04-27T04:00:00.000Z");
  assert.deepEqual(actionIds(payload.plan.keepActions), ["snap-current", "snap-previous"]);
  assert.deepEqual(actionIds(payload.plan.deleteActions), ["snap-stale"]);
  assert.deepEqual(actionIds(payload.plan.reviewActions), ["snap-review"]);
  assert.deepEqual(payload.plan.reviewActions[0].reasons, [
    "requires-review",
    "missing-created-at",
  ]);
  assertNoSuccessLeak(result.stdout);
});

test("accepts top-level inventory input fixtures", async () => {
  const fixture = await writeFixture("top-level-inventory.json", {
    files: [
      fileMetadata({
        snapshotId: "snap-current",
        createdAt: "2026-04-28T00:00:00.000Z",
      }),
    ],
    maxCount: 1,
  });
  const result = await runWorkspaceSessionSnapshotRetentionCleanupInventoryCli([
    "workspace-session-snapshot",
    "retention-cleanup",
    "inventory",
    "--fixture",
    fixture,
  ], {
    cwd: workspaceRoot,
  });
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(payload.inventory.sourcePath, "$");
  assert.equal(payload.plan.keepCount, 1);
  assert.equal(payload.plan.deleteCount, 0);
  assert.equal(payload.plan.reviewCount, 0);
});

test("rejects unsafe and private inventory fixture paths as JSON-only errors", async () => {
  const unsafeCases = [
    {
      fixture: path.resolve(workspaceRoot, "..", "outside-retention-cleanup-inventory.json"),
      message: /must stay inside/,
    },
    {
      fixture: path.join(workspaceRoot, ".codex-private", "retention-cleanup-inventory.json"),
      message: /private workspace files/,
    },
    {
      fixture: path.resolve(
        workspaceRoot,
        "..",
        "sovereignops-codex-pack",
        "retention-cleanup-inventory.json",
      ),
      message: /private plan-pack paths/,
    },
  ];

  for (const unsafeCase of unsafeCases) {
    const result = await runWorkspaceSessionSnapshotRetentionCleanupInventoryCli([
      "workspace-session",
      "snapshot",
      "retention-cleanup",
      "inventory",
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

test("rejects raw local paths, secrets, and lock material without echoing values", async () => {
  const absolutePath = "C:\\Users\\DELL\\snapshots\\snap-unsafe.json";
  const rawSecret = "sk-raw-secret-00000001";
  const rawLockToken = "lock_alpha_laptop_001";
  const fixture = await writeFixture("unsafe-material-inventory.json", {
    inventory: {
      files: [
        fileMetadata({
          path: absolutePath,
          snapshotId: "snap-unsafe",
          createdAt: "2026-04-20T00:00:00.000Z",
          apiToken: rawSecret,
          lockToken: rawLockToken,
        }),
      ],
      maxCount: 0,
    },
  });

  const result = await runWorkspaceSessionSnapshotRetentionCleanupInventoryCli([
    "workspace-session",
    "snapshot",
    "retention",
    "cleanup",
    "inventory",
    "--fixture",
    fixture,
  ], {
    cwd: workspaceRoot,
  });
  assert.ok(result);
  const payload = JSON.parse(result.stderr);

  assert.equal(result.exitCode, 2);
  assert.equal(result.stdout, "");
  assert.equal(payload.error.code, "unsafe_inventory_fixture_material");
  assert.equal(payload.error.details.issueCount, 3);
  assert.deepEqual(payload.error.details.issueKinds, [
    "raw-local-path",
    "raw-lock-token",
    "raw-secret",
  ]);
  assertNoUnsafeEcho(result.stderr);
  assert.equal(result.stderr.includes(absolutePath), false);
  assert.equal(result.stderr.includes(rawSecret), false);
  assert.equal(result.stderr.includes(rawLockToken), false);
});

test("reports malformed inventory fixtures and policies as JSON-only errors", async () => {
  const malformedFixture = await writeFixture("malformed-inventory.json", {
    inventory: {
      entries: [],
      records: [],
    },
  });
  const malformedResult = await runWorkspaceSessionSnapshotRetentionCleanupInventoryCli([
    "workspace-session-snapshot-retention-cleanup",
    "inventory",
    "--fixture",
    malformedFixture,
  ], {
    cwd: workspaceRoot,
  });
  assert.ok(malformedResult);
  const malformedPayload = JSON.parse(malformedResult.stderr);

  assert.equal(malformedResult.exitCode, 2);
  assert.equal(malformedResult.stdout, "");
  assert.equal(malformedPayload.error.code, "invalid_retention_cleanup_inventory_fixture");

  const invalidPolicyFixture = await writeFixture("invalid-policy-inventory.json", {
    inventory: {
      files: [
        fileMetadata({
          snapshotId: "snap-policy",
          createdAt: "2026-04-27T00:00:00.000Z",
        }),
      ],
      maxAgeMs: dayMs,
    },
  });
  const policyResult = await runWorkspaceSessionSnapshotRetentionCleanupInventoryCli([
    "workspace-session-snapshot-retention-cleanup",
    "inventory",
    "--fixture",
    invalidPolicyFixture,
  ], {
    cwd: workspaceRoot,
  });
  assert.ok(policyResult);
  const policyPayload = JSON.parse(policyResult.stderr);

  assert.equal(policyResult.exitCode, 2);
  assert.equal(policyResult.stdout, "");
  assert.equal(policyPayload.error.code, "invalid_retention_cleanup_inventory_policy");
});

async function writeFixture(name, value) {
  await mkdir(tempDir, { recursive: true });
  const outputPath = path.join(tempDir, name);
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`);
  return outputPath;
}

function fileMetadata(overrides = {}) {
  return {
    path: "snapshots/snap-alpha.json",
    snapshotId: "snap-alpha",
    workspaceId: "wsp_alpha",
    deviceId: "dev_laptop",
    label: "local-baseline",
    createdAt: "2026-04-27T00:00:00.000Z",
    updatedAt: "2026-04-27T00:00:00.000Z",
    sizeBytes: 512,
    eventCount: 1,
    ...overrides,
  };
}

function actionIds(actions) {
  return actions.map((action) => action.summary.snapshotId);
}

function assertNoSuccessLeak(text) {
  assert.equal(text.includes("snapshots/snap-current.json"), false);
  assert.equal(text.includes("snapshots/snap-previous.json"), false);
  assert.equal(text.includes("snapshots/snap-stale.json"), false);
  assert.equal(text.includes("snapshots/snap-review.json"), false);
  assertNoUnsafeEcho(text);
}

function assertNoUnsafeEcho(text) {
  assert.equal(text.includes("C:\\Users\\DELL"), false);
  assert.equal(text.includes("sk-raw-secret-00000001"), false);
  assert.equal(text.includes("lock_alpha_laptop_001"), false);
  assert.equal(text.includes(".codex-private"), false);
  assert.equal(text.includes("sovereignops-codex-pack"), false);
}
