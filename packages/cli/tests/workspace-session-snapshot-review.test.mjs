import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  isWorkspaceSessionSnapshotReviewCommand,
  runWorkspaceSessionSnapshotReviewCli,
} from "../src/workspaceSessionSnapshotReview.ts";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const tempDir = fileURLToPath(
  new URL("../.tmp-workspace-session-snapshot-review/", import.meta.url),
);

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

test("supports snapshot review help and command aliases", async () => {
  assert.equal(
    isWorkspaceSessionSnapshotReviewCommand([
      "workspace",
      "session",
      "snapshot",
      "compare",
    ]),
    true,
  );
  assert.equal(
    isWorkspaceSessionSnapshotReviewCommand([
      "workspace-session",
      "snapshot-review",
      "compare",
    ]),
    true,
  );
  assert.equal(
    isWorkspaceSessionSnapshotReviewCommand([
      "workspace-session-snapshot-review",
      "retention-preview",
    ]),
    true,
  );
  assert.equal(
    isWorkspaceSessionSnapshotReviewCommand([
      "workspace-session",
      "snapshot",
      "retention-preview",
    ]),
    true,
  );
  assert.equal(
    isWorkspaceSessionSnapshotReviewCommand([
      "workspace-session-snapshot",
      "compare",
    ]),
    true,
  );
  assert.equal(
    isWorkspaceSessionSnapshotReviewCommand([
      "workspace-session",
      "snapshot",
      "inspect",
    ]),
    false,
  );

  const result = await runWorkspaceSessionSnapshotReviewCli([
    "workspace-session-snapshot",
    "retention-preview",
    "--help",
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.kind, "workspace-session-snapshot-review.help");
  assert.equal(payload.command, "retention-preview");
  assert.ok(payload.usage.includes(
    "sovereignops workspace-session snapshot compare --fixture <path>",
  ));
});

test("compares baseline and candidate snapshots with JSON-only output", async () => {
  const fixture = await writeFixture("snapshot-review.json", validFixture());
  const result = await runWorkspaceSessionSnapshotReviewCli([
    "workspace-session",
    "snapshot",
    "compare",
    "--fixture",
    fixture,
  ], {
    cwd: workspaceRoot,
  });
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.kind, "workspace-session-snapshot-review.compare");
  assert.equal(payload.schemaVersion, "workspace-session-snapshot-review/v1");
  assert.equal(
    payload.fixture.path,
    "packages/cli/.tmp-workspace-session-snapshot-review/snapshot-review.json",
  );
  assert.equal(payload.summary.changed, true);
  assert.equal(payload.summary.addedCount, 1);
  assert.equal(payload.summary.changedCount, 3);
  assert.equal(payload.summary.differenceCount, 4);
  assert.deepEqual(payload.records.actions, {
    "workspace.session.locked": 1,
    "workspace.session.opened": 1,
  });
  assert.deepEqual(payload.records.operations, {
    lock: 1,
    open: 1,
  });
  assert.deepEqual(
    payload.differences.map((difference) => [
      difference.path,
      difference.status,
    ]),
    [
      ["$.session.lockTokenRef", "changed"],
      ["$.session.operations[1]", "added"],
      ["$.session.sessionId", "changed"],
      ["$.session.state", "changed"],
    ],
  );
  assert.equal(payload.differences[0].baseline, "[REDACTED]");
  assert.equal(payload.differences[0].candidate, "[REDACTED]");
  assert.equal(payload.differences[2].baseline, "[REDACTED]");
  assert.equal(payload.differences[2].candidate, "[REDACTED]");
  assert.equal(payload.retention.writes, false);
  assert.equal(payload.retention.deletes, false);
  assert.equal(payload.retention.rawPathsOutput, false);
  assertNoLeak(result.stdout);
});

test("previews snapshot retention without retaining raw sensitive values", async () => {
  const fixture = await writeFixture("snapshot-retention-review.json", validFixture());
  const result = await runWorkspaceSessionSnapshotReviewCli([
    "workspace",
    "session",
    "snapshot",
    "retention-preview",
    "--fixture",
    fixture,
  ], {
    cwd: workspaceRoot,
  });
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.kind, "workspace-session-snapshot-review.retention-preview");
  assert.equal(payload.records.total, 2);
  assert.deepEqual(payload.records.retentionDecisions, {
    drop: 1,
    retain: 1,
  });
  assert.deepEqual(
    payload.records.preview.map((record) => [
      record.action,
      record.operation,
      record.decision,
    ]),
    [
      ["workspace.session.opened", "open", "retain"],
      ["workspace.session.locked", "lock", "drop"],
    ],
  );
  assert.equal(payload.records.preview[0].storagePath, "[redacted-path]");
  assert.equal(payload.records.preview[1].lockTokenRef, "[REDACTED]");
  assert.equal(payload.retention.previewOnly, true);
  assert.equal(payload.retention.lockTokensOutput, false);
  assert.equal(payload.retention.rootKeysOutput, false);
  assert.equal(payload.retention.sessionIdsOutput, false);
  assertNoLeak(result.stdout);
});

test("rejects unsafe and private snapshot review fixture paths as JSON-only errors", async () => {
  const unsafeCases = [
    {
      fixture: path.resolve(workspaceRoot, "..", "outside-snapshot-review.json"),
      message: /must stay inside/,
    },
    {
      fixture: path.join(workspaceRoot, ".codex-private", "snapshot-review.json"),
      message: /private workspace files/,
    },
    {
      fixture: path.resolve(
        workspaceRoot,
        "..",
        "sovereignops-codex-pack",
        "snapshot-review.json",
      ),
      message: /private plan-pack paths/,
    },
  ];

  for (const unsafeCase of unsafeCases) {
    const result = await runWorkspaceSessionSnapshotReviewCli([
      "workspace-session",
      "snapshot",
      "compare",
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

test("reports malformed snapshot review fixtures as JSON-only errors", async () => {
  const invalidPath = await writeFixture("invalid-snapshot-review.json", {
    schemaVersion: "workspace-session-snapshot-review/v1",
    generatedAt: "2026-04-28T03:15:00.000Z",
    baseline: {},
    candidate: {},
    records: {},
  });
  const result = await runWorkspaceSessionSnapshotReviewCli([
    "workspace-session-snapshot",
    "retention-preview",
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
  assert.match(payload.error.message, /fixture\.records must be an array/);
});

test("redacts paths, root keys, lock tokens, and session ids from review output", async () => {
  const fixture = await writeFixture("redaction-snapshot-review.json", validFixture({
    includeRawSecretsInRecords: true,
  }));
  const compareResult = await runWorkspaceSessionSnapshotReviewCli([
    "workspace-session-snapshot",
    "compare",
    "--fixture",
    fixture,
  ], {
    cwd: workspaceRoot,
  });
  const retentionResult = await runWorkspaceSessionSnapshotReviewCli([
    "workspace-session-snapshot",
    "retention-preview",
    "--fixture",
    fixture,
  ], {
    cwd: workspaceRoot,
  });
  assert.ok(compareResult);
  assert.ok(retentionResult);

  assertNoLeak(compareResult.stdout);
  assertNoLeak(retentionResult.stdout);
  assert.ok(JSON.parse(compareResult.stdout).redactions.length > 0);
  assert.ok(JSON.parse(retentionResult.stdout).redactions.length > 0);
});

async function writeFixture(name, value) {
  await mkdir(tempDir, { recursive: true });
  const outputPath = path.join(tempDir, name);
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`);
  return outputPath;
}

function validFixture(options = {}) {
  return {
    schemaVersion: "workspace-session-snapshot-review/v1",
    kind: "workspace-session.snapshot-review",
    generatedAt: "2026-04-28T03:00:00.000Z",
    baseline: {
      descriptor: {
        workspaceId: "wsp_checkout_alpha",
        deviceId: "dev_checkout_laptop",
        rootKeyRef: "key_session_alpha",
        storagePath: "workspaces/wsp_checkout_alpha/session-store.json",
      },
      session: {
        sessionId: "sess_checkout_001",
        state: "open",
        operations: [
          "open",
        ],
        lockTokenRef: "lock-token-baseline-secret",
      },
    },
    candidate: {
      descriptor: {
        workspaceId: "wsp_checkout_alpha",
        deviceId: "dev_checkout_laptop",
        rootKeyRef: "key_session_alpha",
        storagePath: "workspaces/wsp_checkout_alpha/session-store.json",
      },
      session: {
        sessionId: "sess_checkout_002",
        state: "locked",
        operations: [
          "open",
          "lock",
        ],
        lockTokenRef: "lock-token-candidate-secret",
      },
    },
    records: [
      {
        id: "rec_checkout_open",
        action: "workspace.session.opened",
        retained: true,
        details: {
          operation: "open",
          sessionId: "sess_checkout_001",
          storagePath: "C:/Users/DELL/AppData/Local/SovereignOps/session-store.json",
          rootKeyRef: "key_session_alpha",
          reason: options.includeRawSecretsInRecords
            ? "sessionId=sess_checkout_001 rootKeyRef=key_session_alpha"
            : "restored local checkout workspace",
        },
      },
      {
        id: "rec_checkout_lock",
        action: "workspace.session.locked",
        retained: false,
        details: {
          operation: "lock",
          sessionId: "sess_checkout_002",
          reason: options.includeRawSecretsInRecords
            ? "lockTokenRef=[redacted:lockToken:141f13t] session sess_checkout_002"
            : "sealed local checkout workspace",
          lock: {
            lockTokenRef: "[redacted:lockToken:141f13t]",
          },
        },
      },
    ],
  };
}

function assertNoLeak(text) {
  assert.equal(text.includes("C:/Users/DELL"), false);
  assert.equal(text.includes("workspaces/wsp_checkout_alpha/session-store.json"), false);
  assert.equal(text.includes("key_session_alpha"), false);
  assert.equal(text.includes("lock-token-baseline-secret"), false);
  assert.equal(text.includes("lock-token-candidate-secret"), false);
  assert.equal(text.includes("141f13t"), false);
  assert.equal(text.includes("sess_checkout_001"), false);
  assert.equal(text.includes("sess_checkout_002"), false);
}
