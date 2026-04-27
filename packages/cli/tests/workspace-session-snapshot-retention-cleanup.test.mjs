import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  isWorkspaceSessionSnapshotRetentionCleanupCommand,
  loadWorkspaceSessionSnapshotRetentionCleanupInput,
  runWorkspaceSessionSnapshotRetentionCleanupCli,
} from "../src/workspaceSessionSnapshotRetentionCleanup.ts";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const tempDir = fileURLToPath(
  new URL("../.tmp-workspace-session-snapshot-retention-cleanup/", import.meta.url),
);
const dayMs = 24 * 60 * 60 * 1000;

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

test("supports retention cleanup preview help and command aliases", async () => {
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
      "workspace",
      "session",
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
      "retention",
      "cleanup",
      "preview",
    ]),
    true,
  );
  assert.equal(
    isWorkspaceSessionSnapshotRetentionCleanupCommand([
      "workspace-session-snapshot-retention-cleanup",
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

  const result = await runWorkspaceSessionSnapshotRetentionCleanupCli([
    "workspace-session-snapshot-retention-cleanup",
    "preview",
    "--help",
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.kind, "workspace-session-snapshot-retention-cleanup.help");
  assert.equal(
    payload.schemaVersion,
    "workspace-session-snapshot-retention-cleanup-cli/v1",
  );
  assert.ok(payload.usage.includes(
    "sovereignops workspace-session snapshot retention-cleanup preview --fixture <path>",
  ));
});

test("previews retention cleanup plans from a public fixture path", async () => {
  const fixture = await writeFixture("retention-cleanup.json", validFixture());
  const loaded = await loadWorkspaceSessionSnapshotRetentionCleanupInput(fixture, {
    cwd: workspaceRoot,
  });
  assert.equal(loaded.entries.length, 4);

  const result = await runWorkspaceSessionSnapshotRetentionCleanupCli([
    "workspace-session",
    "snapshot",
    "retention-cleanup",
    "preview",
    "--fixture",
    fixture,
  ], {
    cwd: workspaceRoot,
  });
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.kind, "workspace-session-snapshot-retention-cleanup.preview");
  assert.equal(
    payload.fixture.path,
    "packages/cli/.tmp-workspace-session-snapshot-retention-cleanup/retention-cleanup.json",
  );
  assert.equal(payload.retention.previewOnly, true);
  assert.equal(payload.retention.writes, false);
  assert.equal(payload.retention.deletes, false);
  assert.equal(payload.retention.mutation, false);
  assert.equal(payload.retention.wouldDeleteCount, 2);
  assert.deepEqual(payload.retention.inspectedSections, ["entries"]);
  assert.equal(payload.plan.kind, "localWorkspaceSessionSnapshotRetentionCleanupPlan");
  assert.equal(payload.plan.dryRun, true);
  assert.equal(payload.plan.durableWrites, false);
  assert.equal(payload.plan.entryCount, 4);
  assert.equal(payload.plan.keepCount, 2);
  assert.equal(payload.plan.deleteCount, 2);
  assert.equal(payload.plan.reviewCount, 0);
  assert.equal(payload.plan.thresholds.cutoffAt, "2026-04-25T00:00:00.000Z");
  assert.deepEqual(actionIds(payload.plan.keepActions), ["snap-new", "snap-mid"]);
  assert.deepEqual(actionIds(payload.plan.deleteActions), ["snap-extra", "snap-old"]);
  assert.deepEqual(payload.plan.deleteActions[1].reasons, [
    "exceeds-max-count",
    "exceeds-max-age",
  ]);
  assertNoSuccessLeak(result.stdout);
});

test("accepts top-level SDK cleanup input fixtures", async () => {
  const fixture = await writeFixture("top-level-retention-cleanup.json", {
    entries: [
      fileMetadata({
        snapshotId: "snap-current",
        createdAt: "2026-04-28T00:00:00.000Z",
      }),
    ],
    maxCount: 1,
  });
  const result = await runWorkspaceSessionSnapshotRetentionCleanupCli([
    "workspace-session-snapshot",
    "retention-cleanup",
    "preview",
    "--fixture",
    fixture,
  ], {
    cwd: workspaceRoot,
  });
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(payload.plan.keepCount, 1);
  assert.equal(payload.plan.deleteCount, 0);
  assert.equal(payload.plan.reviewCount, 0);
});

test("rejects unsafe and private retention cleanup fixture paths as JSON-only errors", async () => {
  const unsafeCases = [
    {
      fixture: path.resolve(workspaceRoot, "..", "outside-retention-cleanup.json"),
      message: /must stay inside/,
    },
    {
      fixture: path.join(workspaceRoot, ".codex-private", "retention-cleanup.json"),
      message: /private workspace files/,
    },
    {
      fixture: path.resolve(
        workspaceRoot,
        "..",
        "sovereignops-codex-pack",
        "retention-cleanup.json",
      ),
      message: /private plan-pack paths/,
    },
  ];

  for (const unsafeCase of unsafeCases) {
    const result = await runWorkspaceSessionSnapshotRetentionCleanupCli([
      "workspace-session",
      "snapshot",
      "retention-cleanup",
      "preview",
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

test("rejects raw path, secret, and lock material without echoing values", async () => {
  const absolutePath = "C:\\Users\\DELL\\snapshots\\snap-unsafe.json";
  const rawSecret = "sk-raw-secret-00000001";
  const rawLockToken = "lock_alpha_laptop_001";
  const fixture = await writeFixture("unsafe-material-retention-cleanup.json", {
    input: {
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

  const result = await runWorkspaceSessionSnapshotRetentionCleanupCli([
    "workspace-session",
    "snapshot",
    "retention",
    "cleanup",
    "preview",
    "--fixture",
    fixture,
  ], {
    cwd: workspaceRoot,
  });
  assert.ok(result);
  const payload = JSON.parse(result.stderr);

  assert.equal(result.exitCode, 2);
  assert.equal(result.stdout, "");
  assert.equal(payload.error.code, "unsafe_fixture_material");
  assert.equal(payload.error.details.issueCount, 3);
  assert.deepEqual(payload.error.details.issueKinds, [
    "raw-lock-token",
    "raw-secret",
    "unsafe-absolute-path",
  ]);
  assertNoUnsafeEcho(result.stderr);
  assert.equal(result.stderr.includes(absolutePath), false);
  assert.equal(result.stderr.includes(rawSecret), false);
  assert.equal(result.stderr.includes(rawLockToken), false);
});

test("reports malformed cleanup fixtures and policies as JSON-only errors", async () => {
  const malformedFixture = await writeFixture("malformed-retention-cleanup.json", {
    input: {
      entries: [],
      records: [],
    },
  });
  const malformedResult = await runWorkspaceSessionSnapshotRetentionCleanupCli([
    "workspace-session-snapshot-retention-cleanup",
    "preview",
    "--fixture",
    malformedFixture,
  ], {
    cwd: workspaceRoot,
  });
  assert.ok(malformedResult);
  const malformedPayload = JSON.parse(malformedResult.stderr);

  assert.equal(malformedResult.exitCode, 2);
  assert.equal(malformedResult.stdout, "");
  assert.equal(malformedPayload.error.code, "invalid_retention_cleanup_fixture");

  const invalidPolicyFixture = await writeFixture("invalid-policy-retention-cleanup.json", {
    input: {
      records: [
        {
          snapshotId: "snap-policy",
          createdAt: "2026-04-27T00:00:00.000Z",
        },
      ],
      maxAgeMs: dayMs,
    },
  });
  const policyResult = await runWorkspaceSessionSnapshotRetentionCleanupCli([
    "workspace-session-snapshot-retention-cleanup",
    "preview",
    "--fixture",
    invalidPolicyFixture,
  ], {
    cwd: workspaceRoot,
  });
  assert.ok(policyResult);
  const policyPayload = JSON.parse(policyResult.stderr);

  assert.equal(policyResult.exitCode, 2);
  assert.equal(policyResult.stdout, "");
  assert.equal(policyPayload.error.code, "invalid_retention_cleanup_policy");
});

async function writeFixture(name, value) {
  await mkdir(tempDir, { recursive: true });
  const outputPath = path.join(tempDir, name);
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`);
  return outputPath;
}

function validFixture() {
  return {
    schemaVersion: "workspace-session-snapshot-retention-cleanup-fixture/v1",
    kind: "workspace-session.snapshot-retention-cleanup-fixture",
    generatedAt: "2026-04-28T04:00:00.000Z",
    input: {
      entries: [
        fileMetadata({
          path: "snapshots/snap-old.json",
          snapshotId: "snap-old",
          createdAt: "2026-04-20T00:00:00.000Z",
        }),
        fileMetadata({
          path: "snapshots/snap-mid.json",
          snapshotId: "snap-mid",
          createdAt: "2026-04-26T00:00:00.000Z",
        }),
        fileMetadata({
          path: "snapshots/snap-new.json",
          snapshotId: "snap-new",
          createdAt: "2026-04-27T00:00:00.000Z",
        }),
        fileMetadata({
          path: "snapshots/snap-extra.json",
          snapshotId: "snap-extra",
          createdAt: "2026-04-25T00:00:00.000Z",
        }),
      ],
      maxCount: 2,
      maxAgeMs: 3 * dayMs,
      now: "2026-04-28T00:00:00.000Z",
    },
  };
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
  assert.equal(text.includes("snapshots/snap-old.json"), false);
  assert.equal(text.includes("snapshots/snap-mid.json"), false);
  assert.equal(text.includes("snapshots/snap-new.json"), false);
  assert.equal(text.includes("snapshots/snap-extra.json"), false);
  assertNoUnsafeEcho(text);
}

function assertNoUnsafeEcho(text) {
  assert.equal(text.includes("C:\\Users\\DELL"), false);
  assert.equal(text.includes("sk-raw-secret-00000001"), false);
  assert.equal(text.includes("lock_alpha_laptop_001"), false);
  assert.equal(text.includes("sovereignops-codex-pack\\retention-cleanup.json"), false);
}
