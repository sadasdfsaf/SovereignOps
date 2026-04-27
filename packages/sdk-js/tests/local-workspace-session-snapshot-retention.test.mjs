import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_ERROR_CODES,
  LocalWorkspaceSessionSnapshotRetentionError,
  planFileBackedLocalWorkspaceSessionSnapshotRetentionCleanup,
  planLocalWorkspaceSessionSnapshotRetentionCleanup,
  planSnapshotRetentionCleanupDryRun,
} from "../src/localWorkspaceSessionSnapshotRetention.ts";

const dayMs = 24 * 60 * 60 * 1000;
const snapshotFingerprint = `sha256:${"a".repeat(64)}`;
const recordFingerprint = `sha256:${"b".repeat(64)}`;

test("plans deterministic dry-run cleanup from file metadata and snapshot records", () => {
  const oldFile = fileMetadata({
    path: "snapshots/snap-old.json",
    snapshotId: "snap-old",
    createdAt: "2026-04-20T00:00:00.000Z",
  });
  const extraFile = fileMetadata({
    path: "snapshots/snap-extra.json",
    snapshotId: "snap-extra",
    createdAt: "2026-04-25T00:00:00.000Z",
  });
  const newFile = fileMetadata({
    path: "snapshots/snap-new.json",
    snapshotId: "snap-new",
    createdAt: "2026-04-27T00:00:00.000Z",
  });
  const midRecord = snapshotRecord({
    snapshotId: "snap-mid",
    createdAt: "2026-04-26T00:00:00.000Z",
    updatedAt: "2026-04-26T00:00:00.000Z",
  });

  const plan = planLocalWorkspaceSessionSnapshotRetentionCleanup({
    entries: [oldFile, midRecord, newFile, extraFile],
    maxCount: 2,
    maxAgeMs: 3 * dayMs,
    now: "2026-04-28T00:00:00.000Z",
  });

  assert.equal(plan.kind, "localWorkspaceSessionSnapshotRetentionCleanupPlan");
  assert.equal(plan.dryRun, true);
  assert.equal(plan.durableWrites, false);
  assert.equal(plan.thresholds.cutoffAt, "2026-04-25T00:00:00.000Z");
  assert.equal(plan.entryCount, 4);
  assert.equal(plan.keepCount, 2);
  assert.equal(plan.deleteCount, 2);
  assert.equal(plan.reviewCount, 0);
  assert.deepEqual(actionIds(plan.keepActions), ["snap-new", "snap-mid"]);
  assert.deepEqual(actionIds(plan.deleteActions), ["snap-extra", "snap-old"]);
  assert.deepEqual(plan.deleteActions[0].reasons, ["exceeds-max-count"]);
  assert.deepEqual(plan.deleteActions[1].reasons, [
    "exceeds-max-count",
    "exceeds-max-age",
  ]);
  assert.equal(plan.keepActions[0].summary.sourceKind, "file-metadata");
  assert.equal(plan.keepActions[1].summary.sourceKind, "snapshot-record");
  assert.equal(plan.keepActions[0].summary.filePathKind, "relative");
  assert.match(plan.keepActions[0].summary.fileRef, /^\[redacted:path:[a-f0-9]{12}\]$/);
  assert.equal(JSON.stringify(plan).includes("snapshots/snap-old.json"), false);
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.deleteActions[0].reasons), true);
  assert.throws(() => {
    plan.actions.push(plan.keepActions[0]);
  }, TypeError);

  oldFile.createdAt = "2026-04-27T00:00:00.000Z";
  assert.equal(plan.deleteActions[1].summary.createdAt, "2026-04-20T00:00:00.000Z");
});

test("routes unsafe paths and raw token material to review without leaking values", () => {
  const rawSecret = "sk-raw-secret-00000001";
  const rawLockToken = "lock_alpha_laptop_001";
  const absolutePath = "C:\\Users\\DELL\\snapshots\\snap-unsafe.json";
  const traversalPath = "snapshots/../snap-traversal.json";

  const plan = planFileBackedLocalWorkspaceSessionSnapshotRetentionCleanup({
    files: [
      fileMetadata({
        path: absolutePath,
        snapshotId: "snap-unsafe",
        createdAt: "2026-04-20T00:00:00.000Z",
        apiToken: rawSecret,
        lockToken: rawLockToken,
      }),
      fileMetadata({
        path: traversalPath,
        snapshotId: "snap-traversal",
        createdAt: "2026-04-19T00:00:00.000Z",
      }),
    ],
    maxCount: 0,
  });

  assert.equal(plan.deleteCount, 0);
  assert.equal(plan.keepCount, 0);
  assert.equal(plan.reviewCount, 2);
  assert.deepEqual(plan.reviewActions[0].reasons, [
    "requires-review",
    "raw-lock-token",
    "raw-secret",
    "unsafe-absolute-path",
  ]);
  assert.deepEqual(
    plan.reviewActions[0].issues.map((issue) => issue.issueKind),
    ["raw-secret", "raw-lock-token", "unsafe-absolute-path"],
  );
  assert.deepEqual(plan.reviewActions[1].reasons, [
    "requires-review",
    "path-traversal",
  ]);
  assert.equal(plan.reviewActions[0].summary.filePathKind, "absolute");

  const json = JSON.stringify(plan);
  assert.equal(json.includes(absolutePath), false);
  assert.equal(json.includes("C:\\Users\\DELL"), false);
  assert.equal(json.includes(traversalPath), false);
  assert.equal(json.includes(rawSecret), false);
  assert.equal(json.includes(rawLockToken), false);
});

test("marks duplicate snapshot ids for review instead of cleanup", () => {
  const plan = planSnapshotRetentionCleanupDryRun({
    records: [
      snapshotRecord({ snapshotId: "snap-duplicate", createdAt: "2026-04-26T00:00:00.000Z" }),
      snapshotRecord({ snapshotId: "snap-duplicate", createdAt: "2026-04-27T00:00:00.000Z" }),
      snapshotRecord({ snapshotId: "snap-unique", createdAt: "2026-04-28T00:00:00.000Z" }),
    ],
    maxCount: 1,
  });

  assert.equal(plan.keepCount, 1);
  assert.equal(plan.deleteCount, 0);
  assert.equal(plan.reviewCount, 2);
  assert.deepEqual(actionIds(plan.keepActions), ["snap-unique"]);
  assert.deepEqual(
    plan.reviewActions.map((action) => action.reasons),
    [
      ["requires-review", "duplicate-snapshot-id"],
      ["requires-review", "duplicate-snapshot-id"],
    ],
  );
});

test("accepts snapshot record summaries and file timestamps", () => {
  const plan = planLocalWorkspaceSessionSnapshotRetentionCleanup({
    entries: [
      recordSummary({
        snapshotId: "snap-summary-old",
        createdAt: "2026-04-20T00:00:00.000Z",
      }),
      fileMetadata({
        path: "snapshots/snap-file-time.json",
        snapshotId: "snap-file-time",
        mtimeMs: Date.parse("2026-04-27T00:00:00.000Z"),
      }),
    ],
    maxAgeMs: 3 * dayMs,
    now: "2026-04-28T00:00:00.000Z",
  });

  assert.deepEqual(actionIds(plan.keepActions), ["snap-file-time"]);
  assert.deepEqual(actionIds(plan.deleteActions), ["snap-summary-old"]);
  assert.equal(plan.keepActions[0].summary.createdAt, "2026-04-27T00:00:00.000Z");
  assert.equal(plan.deleteActions[0].summary.sourceKind, "snapshot-record-summary");
  assert.equal(plan.deleteActions[0].summary.operationCount, 1);
});

test("validates top-level input and retention policy", () => {
  assertRetentionError(
    () => planLocalWorkspaceSessionSnapshotRetentionCleanup(null),
    LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_ERROR_CODES.INVALID_INPUT,
  );
  assertRetentionError(
    () => planLocalWorkspaceSessionSnapshotRetentionCleanup({
      entries: [],
      records: [],
    }),
    LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_ERROR_CODES.INVALID_INPUT,
  );
  assertRetentionError(
    () => planLocalWorkspaceSessionSnapshotRetentionCleanup({
      records: [snapshotRecord()],
      maxCount: -1,
    }),
    LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_ERROR_CODES.INVALID_RETENTION_POLICY,
  );
  assertRetentionError(
    () => planLocalWorkspaceSessionSnapshotRetentionCleanup({
      records: [snapshotRecord()],
      maxAgeMs: dayMs,
    }),
    LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_ERROR_CODES.INVALID_RETENTION_POLICY,
  );
});

test("non-object and incomplete entries become review actions", () => {
  const plan = planLocalWorkspaceSessionSnapshotRetentionCleanup({
    entries: [
      "not metadata",
      { snapshotId: "snap-missing-created-at" },
      { createdAt: "2026-04-27T00:00:00.000Z" },
      { snapshotId: "Bearer raw-token-value", createdAt: "2026-04-27T00:00:00.000Z" },
      { snapshotId: "snap-invalid-time", createdAt: "yesterday" },
      { snapshotId: "snap-invalid-ms", mtimeMs: Number.MAX_SAFE_INTEGER },
    ],
  });

  assert.equal(plan.keepCount, 0);
  assert.equal(plan.deleteCount, 0);
  assert.equal(plan.reviewCount, 6);
  assert.deepEqual(
    plan.reviewActions.map((action) => action.reasons.at(-1)),
    [
      "invalid-metadata",
      "missing-created-at",
      "missing-snapshot-id",
      "raw-secret",
      "invalid-metadata",
      "invalid-metadata",
    ],
  );
  assert.equal(JSON.stringify(plan).includes("Bearer raw-token-value"), false);
});

function actionIds(actions) {
  return actions.map((action) => action.summary.snapshotId);
}

function fileMetadata(overrides = {}) {
  return {
    path: "snapshots/snap-alpha.json",
    snapshotId: "snap-alpha",
    workspaceId: "wsp_alpha",
    deviceId: "dev_laptop",
    sessionId: "sess_alpha_laptop_001",
    label: "local-baseline",
    createdAt: "2026-04-27T00:00:00.000Z",
    updatedAt: "2026-04-27T00:00:00.000Z",
    sizeBytes: 512,
    fingerprint: recordFingerprint,
    snapshotFingerprint,
    eventCount: 1,
    ...overrides,
  };
}

function snapshotRecord(overrides = {}) {
  const snapshot = snapshotPreview();
  return {
    kind: "workspace-session.snapshot-record",
    schemaVersion: "workspace-session-store/v1",
    localOnly: true,
    durableWrites: false,
    redacted: true,
    snapshotId: "snap-alpha",
    label: "local-baseline",
    metadata: {
      workflowId: "workspace-session",
    },
    createdAt: "2026-04-27T00:00:00.000Z",
    updatedAt: "2026-04-27T00:00:00.000Z",
    fingerprint: recordFingerprint,
    snapshotFingerprint: snapshot.fingerprint,
    snapshot,
    ...overrides,
  };
}

function snapshotPreview(overrides = {}) {
  return {
    kind: "workspace-session.snapshot-preview",
    schemaVersion: "workspace-session-store/v1",
    apiSchemaVersion: "workspace-session-api/v1",
    localOnly: true,
    durableWrites: false,
    redacted: true,
    fingerprint: snapshotFingerprint,
    summary: {
      kind: "workspace-session.snapshot-summary",
      localOnly: true,
      redacted: true,
      workspaceId: "wsp_alpha",
      deviceId: "dev_laptop",
      sessionId: "sess_alpha_laptop_001",
      operations: ["open"],
      eventCount: 1,
      eventIds: ["evt_wsp_alpha_open_00000001"],
      auditRecordCount: 1,
      auditIds: ["aud_wsp_alpha_open_00000001"],
      auditActions: ["workspace.session.opened"],
    },
    auditPreview: {
      kind: "workspace-session.audit-preview",
      schemaVersion: "workspace-session-api/v1",
      localOnly: true,
      durableWrites: false,
      summary: {
        kind: "workspace-session.summary",
        localOnly: true,
        durableWrites: false,
        workspaceId: "wsp_alpha",
        deviceId: "dev_laptop",
      },
      events: [],
      audit: {
        kind: "workspace-session.audit-preview.records",
        localOnly: true,
        redacted: true,
        recordCount: 0,
        records: [],
      },
    },
    ...overrides,
  };
}

function recordSummary(overrides = {}) {
  return {
    snapshotId: "snap-summary",
    label: "local-baseline",
    metadata: {
      workflowId: "workspace-session",
    },
    createdAt: "2026-04-27T00:00:00.000Z",
    updatedAt: "2026-04-27T00:00:00.000Z",
    fingerprint: recordFingerprint,
    snapshotFingerprint,
    workspaceId: "wsp_alpha",
    deviceId: "dev_laptop",
    sessionId: "sess_alpha_laptop_001",
    operations: ["open"],
    eventCount: 1,
    auditRecordCount: 1,
    ...overrides,
  };
}

function assertRetentionError(fn, code) {
  assert.throws(
    fn,
    (error) => {
      assert.equal(error instanceof LocalWorkspaceSessionSnapshotRetentionError, true);
      assert.equal(error.code, code);
      return true;
    },
  );
}
