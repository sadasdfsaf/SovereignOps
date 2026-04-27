import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_WORKSPACE_SESSION_SNAPSHOT_REVIEW_ERROR_CODES,
  LocalWorkspaceSessionSnapshotReviewError,
  compareLocalWorkspaceSessionSnapshots,
  previewLocalWorkspaceSessionSnapshotRetention,
} from "../src/localWorkspaceSessionSnapshotReview.ts";

test("compares identical redacted snapshots without issues", () => {
  const baseline = snapshotRecord();
  const summary = compareLocalWorkspaceSessionSnapshots({
    baseline,
    candidate: structuredClone(baseline),
  });

  assert.equal(summary.kind, "localWorkspaceSessionSnapshotCompareSummary");
  assert.equal(summary.changed, false);
  assert.equal(summary.issueCount, 0);
  assert.equal(summary.severity, "none");
  assert.equal(summary.risk, "none");
  assert.equal(summary.baseline.operationCount, 1);
  assert.equal(summary.baseline.state, "open");
  assert.equal(summary.baseline.cursor, "1");
  assert.equal(Object.isFrozen(summary), true);
  assert.equal(Object.isFrozen(summary.candidate.operations), true);
  assert.throws(() => {
    summary.issues.push("mutated");
  }, TypeError);
});

test("reports changed session state, cursor, and operation count", () => {
  const baseline = snapshotRecord();
  const candidate = snapshotRecord({
    snapshot: snapshotPreview({
      summary: snapshotSummary({
        operations: ["open", "lock"],
        eventCount: 2,
        eventIds: ["evt_wsp_alpha_open_00000001", "evt_wsp_alpha_lock_00000002"],
      }),
      auditPreview: auditPreview({
        events: [
          previewEvent({ cursor: "1", operation: "open", sequence: 1 }),
          previewEvent({ cursor: "2", operation: "lock", sequence: 2 }),
        ],
      }),
    }),
    snapshotFingerprint: snapshotFingerprint,
    updatedAt: "2026-04-27T00:06:00.000Z",
  });

  const summary = compareLocalWorkspaceSessionSnapshots({ baseline, candidate });

  assert.equal(summary.changed, true);
  assert.equal(summary.severity, "warning");
  assert.equal(summary.risk, "medium");
  assert.deepEqual(issueCategories(summary), ["operation-count", "state", "cursor"]);
  assert.equal(summary.candidate.operationCount, 2);
  assert.equal(summary.candidate.state, "locked");
  assert.equal(summary.candidate.cursor, "2");
});

test("reports redaction regressions without retaining raw secret values", () => {
  const baseline = localStoreBundle({
    snapshot: localStoreSnapshot({
      redaction: {
        rawSecretsStored: false,
        redactedFields: ["metadata.apiToken"],
      },
    }),
  });
  const candidate = localStoreBundle({
    snapshot: localStoreSnapshot({
      redaction: {
        rawSecretsStored: true,
        redactedFields: [],
      },
    }),
  });

  const summary = compareLocalWorkspaceSessionSnapshots({ baseline, candidate });

  assert.equal(summary.severity, "critical");
  assert.equal(summary.risk, "high");
  assert.deepEqual(issueCategories(summary), ["redaction", "redaction"]);
  assert.equal(summary.candidate.rawSecretsStored, true);
  assert.equal(JSON.stringify(summary).includes("raw-secret-value"), false);
});

test("reports raw path and token retention risk", () => {
  const candidate = snapshotRecord({
    snapshot: snapshotPreview({
      auditPreview: auditPreview({
        events: [
          previewEvent({
            storagePath: "C:\\Users\\DELL\\.sovereignops\\sessions\\alpha.json",
            lockTokenRef: "lock_raw_alpha_001",
            operation: "lock",
          }),
        ],
      }),
    }),
  });

  const summary = compareLocalWorkspaceSessionSnapshots({
    baseline: snapshotRecord(),
    candidate,
  });

  const secretIssue = summary.issues.find((issue) => issue.category === "secret-retention");
  assert.equal(secretIssue?.severity, "critical");
  assert.deepEqual(
    summary.candidate.secretRetentionRisks.map((risk) => risk.kind),
    ["raw-lock-token", "raw-path"],
  );
  assert.equal(JSON.stringify(summary).includes("C:\\Users\\DELL"), false);
  assert.equal(JSON.stringify(summary).includes("lock_raw_alpha_001"), false);
});

test("previews retention max-count and age decisions without deleting anything", () => {
  const preview = previewLocalWorkspaceSessionSnapshotRetention({
    records: [
      snapshotRecord({ snapshotId: "snap-old", createdAt: "2026-04-20T00:00:00.000Z" }),
      snapshotRecord({ snapshotId: "snap-mid", createdAt: "2026-04-26T00:00:00.000Z" }),
      snapshotRecord({ snapshotId: "snap-new", createdAt: "2026-04-27T00:00:00.000Z" }),
      snapshotRecord({ snapshotId: "snap-extra", createdAt: "2026-04-25T00:00:00.000Z" }),
    ],
    maxCount: 2,
    maxAgeMs: 3 * 24 * 60 * 60 * 1000,
    now: "2026-04-28T00:00:00.000Z",
  });

  assert.equal(preview.recordCount, 4);
  assert.equal(preview.keepCount, 2);
  assert.equal(preview.deleteCount, 2);
  assert.deepEqual(
    preview.keepCandidates.map((candidate) => candidate.snapshotId),
    ["snap-new", "snap-mid"],
  );
  assert.deepEqual(
    preview.deleteCandidates.map((candidate) => candidate.snapshotId),
    ["snap-extra", "snap-old"],
  );
  assert.deepEqual(preview.deleteCandidates[0].reasons, ["exceeds-max-count"]);
  assert.deepEqual(preview.deleteCandidates[1].reasons, [
    "exceeds-max-count",
    "exceeds-max-age",
  ]);
  assert.equal(Object.isFrozen(preview.deleteCandidates[0].reasons), true);
});

test("validates compare and retention inputs", () => {
  assertSnapshotReviewError(
    () => compareLocalWorkspaceSessionSnapshots(null),
    LOCAL_WORKSPACE_SESSION_SNAPSHOT_REVIEW_ERROR_CODES.INVALID_INPUT,
  );
  assertSnapshotReviewError(
    () => compareLocalWorkspaceSessionSnapshots({
      baseline: {},
      candidate: snapshotRecord(),
    }),
    LOCAL_WORKSPACE_SESSION_SNAPSHOT_REVIEW_ERROR_CODES.INVALID_SNAPSHOT,
  );
  assertSnapshotReviewError(
    () => previewLocalWorkspaceSessionSnapshotRetention({
      records: [snapshotRecord()],
      maxAgeMs: -1,
      now: "2026-04-28T00:00:00.000Z",
    }),
    LOCAL_WORKSPACE_SESSION_SNAPSHOT_REVIEW_ERROR_CODES.INVALID_RETENTION_POLICY,
  );
  assertSnapshotReviewError(
    () => previewLocalWorkspaceSessionSnapshotRetention({
      records: [snapshotRecord()],
      maxAgeMs: 1000,
    }),
    LOCAL_WORKSPACE_SESSION_SNAPSHOT_REVIEW_ERROR_CODES.INVALID_RETENTION_POLICY,
  );
});

test("preserves clone boundaries for mutable inputs and immutable outputs", () => {
  const baseline = snapshotRecord();
  const candidate = snapshotRecord({ snapshotId: "snap-alpha-002" });
  const comparison = compareLocalWorkspaceSessionSnapshots({ baseline, candidate });
  const retention = previewLocalWorkspaceSessionSnapshotRetention({
    records: [baseline, candidate],
    maxCount: 1,
  });

  candidate.snapshot.summary.operations.push("lock");
  candidate.snapshot.summary.eventCount = 2;
  baseline.createdAt = "2026-04-01T00:00:00.000Z";

  assert.deepEqual(comparison.candidate.operations, ["open"]);
  assert.equal(comparison.candidate.operationCount, 1);
  assert.equal(retention.keepCandidates[0].createdAt, "2026-04-27T00:05:00.000Z");
  assert.throws(() => {
    comparison.candidate.operations.push("lock");
  }, TypeError);
  assert.throws(() => {
    retention.keepCandidates[0].createdAt = "2026-04-01T00:00:00.000Z";
  }, TypeError);
});

const snapshotFingerprint = `sha256:${"a".repeat(64)}`;
const recordFingerprint = `sha256:${"b".repeat(64)}`;

function snapshotRecord(overrides = {}) {
  const snapshot = overrides.snapshot ?? snapshotPreview();
  return {
    kind: "workspace-session.snapshot-record",
    schemaVersion: "workspace-session-store/v1",
    localOnly: true,
    durableWrites: false,
    redacted: true,
    snapshotId: "snap-alpha-001",
    label: "local-baseline",
    metadata: {
      workflowId: "workspace-session",
    },
    createdAt: "2026-04-27T00:05:00.000Z",
    updatedAt: "2026-04-27T00:05:00.000Z",
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
    summary: snapshotSummary(),
    auditPreview: auditPreview(),
    ...overrides,
  };
}

function snapshotSummary(overrides = {}) {
  return {
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
    ...overrides,
  };
}

function auditPreview(overrides = {}) {
  return {
    kind: "workspace-session.audit-preview",
    schemaVersion: "workspace-session-api/v1",
    localOnly: true,
    durableWrites: false,
    summary: {
      kind: "workspace-session.summary",
      schemaVersion: "workspace-session-api/v1",
      localOnly: true,
      durableWrites: false,
      workspaceId: "wsp_alpha",
      deviceId: "dev_laptop",
      storage: {
        localOnly: true,
        storagePath: "[redacted:path:abc123]",
        storagePathRedacted: true,
      },
      gateway: {
        transport: "http",
        host: "localhost",
        port: 48231,
      },
      session: {
        sessionId: "sess_alpha_laptop_001",
        operations: ["open"],
      },
    },
    events: [previewEvent()],
    audit: {
      kind: "workspace-session.audit-preview.records",
      localOnly: true,
      redacted: true,
      recordCount: 1,
      records: [
        {
          auditId: "aud_wsp_alpha_open_00000001",
          action: "workspace.session.opened",
          createdAt: "2026-04-27T00:01:00.000Z",
          details: {
            storagePath: "[redacted:path:abc123]",
          },
        },
      ],
    },
    ...overrides,
  };
}

function previewEvent(overrides = {}) {
  const operation = overrides.operation ?? "open";
  const sequence = overrides.sequence ?? 1;
  return {
    eventId: `evt_wsp_alpha_${operation}_${String(sequence).padStart(8, "0")}`,
    workspaceId: "wsp_alpha",
    type: `workspace.session.${operation === "lock" ? "locked" : operation === "unlock" ? "unlocked" : "opened"}`,
    payload: {
      kind: "localWorkspaceSession",
      schemaVersion: "local-workspace-session/v1",
      operation,
      sessionId: "sess_alpha_laptop_001",
      localOnly: true,
      storagePath: overrides.storagePath ?? "[redacted:path:abc123]",
      storagePathRedacted: overrides.storagePathRedacted ?? true,
      gateway: {
        transport: "http",
        host: "localhost",
        port: 48231,
      },
      ...(operation === "lock"
        ? {
          lock: {
            lockTokenRef: overrides.lockTokenRef ?? "[redacted:lockToken:def456]",
          },
        }
        : {}),
    },
    cursor: overrides.cursor ?? String(sequence),
    sequence,
    deviceId: "dev_laptop",
    createdAt: `2026-04-27T00:0${sequence}:00.000Z`,
  };
}

function localStoreBundle(overrides = {}) {
  return {
    kind: "localWorkspaceSessionStore",
    schemaVersion: "local-workspace-session-store/v1",
    localOnly: true,
    snapshot: localStoreSnapshot(),
    events: [],
    ...overrides,
  };
}

function localStoreSnapshot(overrides = {}) {
  return {
    kind: "localWorkspaceSessionSnapshot",
    schemaVersion: "local-workspace-session-store/v1",
    snapshotId: "wssnap_alpha_laptop_001",
    sessionId: "sess_alpha_laptop_001",
    workspaceId: "wsp_alpha",
    deviceId: "dev_laptop",
    descriptor: {
      workspaceId: "wsp_alpha",
      deviceId: "dev_laptop",
      rootKeyRef: "key_alpha",
      createdAt: "2026-04-27T00:00:00.000Z",
      updatedAt: "2026-04-27T00:00:00.000Z",
      storagePath: "[redacted:path:abc123]",
      gateway: {
        transport: "http",
        host: "localhost",
        port: 48231,
      },
    },
    localOnly: true,
    eventCount: 1,
    operations: ["open"],
    firstSequence: 1,
    lastSequence: 1,
    cursor: "1",
    createdAt: "2026-04-27T00:00:00.000Z",
    updatedAt: "2026-04-27T00:01:00.000Z",
    metadata: {
      apiToken: "[redacted:secret:def456]",
    },
    redaction: {
      rawSecretsStored: false,
      redactedFields: ["metadata.apiToken"],
    },
    ...overrides,
  };
}

function issueCategories(summary) {
  return summary.issues.map((issue) => issue.category);
}

function assertSnapshotReviewError(fn, code) {
  assert.throws(
    fn,
    (error) => {
      assert.equal(error instanceof LocalWorkspaceSessionSnapshotReviewError, true);
      assert.equal(error.code, code);
      return true;
    },
  );
}
