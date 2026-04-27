import assert from "node:assert/strict";

import {
  buildWorkspaceSessionSnapshotRetentionCleanupInventoryRows,
  buildWorkspaceSessionSnapshotRetentionCleanupInventoryState,
  buildWorkspaceSessionSnapshotRetentionCleanupInventoryWarnings,
  redactWorkspaceSessionSnapshotRetentionCleanupInventoryValue,
} from "../src/workspaceSessionSnapshotRetentionCleanupInventoryState.ts";

const timestamps = {
  generated: "2026-04-28T08:00:00.000Z",
  old: "2026-04-20T00:00:00.000Z",
  mid: "2026-04-26T00:00:00.000Z",
  newer: "2026-04-27T00:00:00.000Z",
};

const fingerprint = `sha256:${"a".repeat(64)}`;
const snapshotFingerprint = `sha256:${"b".repeat(64)}`;
const rawPath = "C:\\Users\\DELL\\snapshots\\unsafe.json";
const rawSecret = "sk_inventory_cleanup_secret_123456";
const apiInventoryPreviewRoute =
  "/v1/workspace-session/snapshot-retention-cleanup/inventory/preview";

function buildSdkDryRunPlan(overrides = {}) {
  const keep = cleanupAction({
    action: "keep",
    sourceIndex: 1,
    rank: 1,
    summary: cleanupSummary({
      snapshotId: "snap-new",
      createdAt: timestamps.newer,
      updatedAt: timestamps.newer,
      sourceKind: "snapshot-record-summary",
    }),
  });
  const deleteAction = cleanupAction({
    action: "delete",
    sourceIndex: 0,
    rank: 2,
    reasons: ["exceeds-max-count"],
    summary: cleanupSummary({
      snapshotId: "snap-old",
      createdAt: timestamps.old,
      updatedAt: timestamps.old,
      sourceKind: "file-metadata",
      filePathKind: "relative",
    }),
  });
  const review = cleanupAction({
    action: "review",
    sourceIndex: 2,
    reasons: ["requires-review"],
    summary: cleanupSummary({
      snapshotId: "snap-review",
      createdAt: timestamps.mid,
      updatedAt: timestamps.mid,
    }),
    issues: [
      {
        kind: "localWorkspaceSessionSnapshotRetentionCleanupIssue",
        issueKind: "duplicate-snapshot-id",
        path: "entries.2.snapshotId",
        reason: "duplicate-snapshot-id",
        message: "duplicate snapshot id requires review",
      },
    ],
  });

  return {
    kind: "localWorkspaceSessionSnapshotRetentionCleanupPlan",
    schemaVersion: "local-workspace-session-snapshot-retention/v1",
    localOnly: true,
    dryRun: true,
    durableWrites: false,
    redacted: true,
    thresholds: {
      maxCount: 1,
      now: timestamps.generated,
    },
    entryCount: 3,
    keepCount: 1,
    deleteCount: 1,
    reviewCount: 1,
    actions: [keep, deleteAction, review],
    keepActions: [keep],
    deleteActions: [deleteAction],
    reviewActions: [review],
    ...overrides,
  };
}

function cleanupAction(overrides = {}) {
  return {
    kind: "localWorkspaceSessionSnapshotRetentionCleanupAction",
    action: "keep",
    reasons: ["within-policy"],
    sourceIndex: 0,
    rank: 1,
    summary: cleanupSummary(),
    issues: [],
    ...overrides,
  };
}

function cleanupSummary(overrides = {}) {
  return {
    kind: "localWorkspaceSessionSnapshotRetentionCleanupSummary",
    sourceKind: "file-metadata",
    auditSafe: true,
    redacted: true,
    snapshotId: "snap-alpha",
    workspaceId: "wsp_alpha",
    deviceId: "dev_laptop",
    sessionId: "[redacted:session:alpha]",
    createdAt: timestamps.newer,
    updatedAt: timestamps.newer,
    fileRef: "[redacted:path:abc123]",
    filePathKind: "relative",
    fingerprint,
    snapshotFingerprint,
    operationCount: 1,
    ...overrides,
  };
}

function buildCliInventoryEnvelope() {
  return {
    exitCode: 0,
    stdout: `${JSON.stringify({
      kind: "workspace-session-snapshot-review.retention-preview",
      schemaVersion: "workspace-session-snapshot-review/v1",
      generatedAt: timestamps.generated,
      records: {
        total: 2,
        retentionDecisions: {
          drop: 1,
          retain: 1,
        },
        preview: [
          {
            id: "evt-open",
            decision: "retain",
            createdAt: timestamps.newer,
            storagePath: "[redacted-path]",
            sessionRef: "[redacted:session:alpha]",
          },
          {
            id: "evt-lock",
            decision: "drop",
            createdAt: timestamps.old,
            lockTokenRef: "[REDACTED]",
            sessionRef: "[redacted:session:alpha]",
          },
        ],
      },
      retention: {
        previewOnly: true,
        writes: false,
        deletes: false,
        rawPathsOutput: false,
        rootKeysOutput: false,
        lockTokensOutput: false,
      },
    })}\n`,
    stderr: "",
  };
}

function buildApiInventoryEnvelope() {
  return {
    status: 200,
    response: {
      body: {
        kind: "workspace-session.snapshot-retention-cleanup.inventory-preview",
        generatedAt: timestamps.generated,
        localOnly: true,
        dryRun: true,
        durableWrites: false,
        redacted: true,
        summary: {
          totalCount: 2,
          keepCount: 1,
          deleteCount: 1,
          reviewCount: 0,
        },
        rows: [
          {
            snapshotId: "snap-api-new",
            plannedAction: "retain",
            createdAt: timestamps.newer,
            sourceKind: "snapshot-record-summary",
          },
          {
            snapshotId: "snap-api-old",
            plannedAction: "expire",
            createdAt: timestamps.old,
            sourceKind: "snapshot-record-summary",
          },
        ],
      },
    },
  };
}

function buildApiReplaySuccessEnvelope() {
  return {
    kind: "workspace-session-snapshot-retention-cleanup-inventory-api-fixture-replay",
    schemaVersion: "workspace-session-snapshot-retention-cleanup-inventory-api-requests/v1",
    generatedAt: timestamps.generated,
    totalRequests: 1,
    replayedRequests: 1,
    passedRequests: 1,
    failedRequests: 0,
    summary: {
      methods: { POST: 1 },
      routes: {
        [apiInventoryPreviewRoute]: 1,
      },
      actualStatuses: { 200: 1 },
      expectedStatuses: { 200: 1 },
      mismatches: {},
    },
    requests: [
      {
        id: "api_workspace_session_snapshot_retention_cleanup_inventory_preview",
        method: "POST",
        path: apiInventoryPreviewRoute,
        request: {
          headers: {
            authorization: "[REDACTED]",
          },
          body: {
            inventory: {
              records: [
                {
                  snapshotId: "snap-api-request",
                  path: rawPath,
                  metadata: {
                    token: rawSecret,
                  },
                },
              ],
            },
          },
        },
        actual: {
          status: 200,
          body: buildApiInventoryPlan(),
        },
        matches: {
          status: true,
          expectation: true,
        },
      },
    ],
  };
}

function buildApiInventoryPlan(overrides = {}) {
  const keep = cleanupAction({
    action: "keep",
    reasons: ["within-max-count"],
    sourceIndex: 1,
    rank: 1,
    summary: cleanupSummary({
      snapshotId: "snap-api-keep",
      createdAt: timestamps.newer,
      updatedAt: timestamps.newer,
      sourceKind: "snapshot-record-summary",
    }),
  });
  const deleteAction = cleanupAction({
    action: "delete",
    reasons: ["exceeds-max-count"],
    sourceIndex: 0,
    rank: 2,
    summary: cleanupSummary({
      snapshotId: "snap-api-delete",
      createdAt: timestamps.old,
      updatedAt: timestamps.old,
      sourceKind: "file-metadata",
      filePathKind: "relative",
    }),
  });

  return buildSdkDryRunPlan({
    entryCount: 2,
    keepCount: 1,
    deleteCount: 1,
    reviewCount: 0,
    actions: [keep, deleteAction],
    keepActions: [keep],
    deleteActions: [deleteAction],
    reviewActions: [],
    ...overrides,
  });
}

function assertNoRawLeak(value, rawValues = [rawPath, rawSecret]) {
  const serialized = JSON.stringify(value);
  for (const raw of rawValues) {
    assert.equal(serialized.includes(raw), false, `inventory state leaked ${raw}`);
    assert.equal(
      serialized.includes(raw.replaceAll("\\", "\\\\")),
      false,
      `inventory state leaked escaped ${raw}`,
    );
  }
  for (const key of [
    '"requestBody"',
    '"responseBody"',
    '"rawBody"',
    '"rawRequestBody"',
    '"rawResponseBody"',
  ]) {
    assert.equal(serialized.includes(key), false, `inventory state retained ${key}`);
  }
}

function testSdkDryRunPlanBuildsFrozenInventoryState() {
  const plan = buildSdkDryRunPlan();
  const before = structuredClone(plan);
  const state = buildWorkspaceSessionSnapshotRetentionCleanupInventoryState(plan);

  assert.deepEqual(plan, before);
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.rows), true);
  assert.equal(Object.isFrozen(state.rows[0].reasons), true);
  assert.equal(state.id, "workspace_session_snapshot_retention_cleanup_inventory");
  assert.equal(state.sourceKind, "sdk_dry_run_plan");
  assert.equal(state.phase, "success");
  assert.equal(state.status, "attention");
  assert.equal(state.generatedAt, timestamps.generated);
  assert.equal(state.entryCount, 3);
  assert.equal(state.keepCount, 1);
  assert.equal(state.deleteCount, 1);
  assert.equal(state.reviewCount, 1);
  assert.equal(state.dryRunReady, true);
  assert.equal(state.advisoryDeleteCount, 1);
  assert.deepEqual(state.warnings, []);
  assert.deepEqual(
    state.rows.map((row) => [row.snapshotId, row.action, row.actionLabel, row.advisory]),
    [
      ["snap-old", "delete", "Advisory delete", true],
      ["snap-review", "review", "Review", false],
      ["snap-new", "keep", "Keep", false],
    ],
  );
  assert.deepEqual(state.sourceLabels, [
    "file-metadata relative",
    "snapshot-record-summary relative",
  ]);
  assert.throws(() => {
    state.rows.push(state.rows[0]);
  }, TypeError);
  assertNoRawLeak(state, []);
}

function testCliAndApiInventoryEnvelopesNormalizeCounts() {
  const cliState = buildWorkspaceSessionSnapshotRetentionCleanupInventoryState(
    buildCliInventoryEnvelope(),
  );
  assert.equal(cliState.sourceKind, "cli_inventory_output");
  assert.equal(cliState.phase, "success");
  assert.equal(cliState.status, "attention");
  assert.equal(cliState.entryCount, 2);
  assert.equal(cliState.keepCount, 1);
  assert.equal(cliState.deleteCount, 1);
  assert.equal(cliState.reviewCount, 0);
  assert.equal(cliState.localOnly, true);
  assert.equal(cliState.dryRun, true);
  assert.equal(cliState.durableWrites, false);
  assert.equal(cliState.dryRunReady, true);
  assert.deepEqual(
    cliState.rows.map((row) => [row.snapshotId, row.action, row.sourceLabel]),
    [
      ["evt-lock", "delete", "CLI inventory"],
      ["evt-open", "keep", "CLI inventory"],
    ],
  );
  assertNoRawLeak(cliState, []);

  const apiState = buildWorkspaceSessionSnapshotRetentionCleanupInventoryState(
    buildApiInventoryEnvelope(),
  );
  assert.equal(apiState.sourceKind, "api_inventory_preview");
  assert.equal(apiState.phase, "success");
  assert.equal(apiState.dryRunReady, true);
  assert.equal(apiState.entryCount, 2);
  assert.equal(apiState.keepCount, 1);
  assert.equal(apiState.deleteCount, 1);
  assert.deepEqual(
    apiState.rows.map((row) => [row.snapshotId, row.action]),
    [
      ["snap-api-old", "delete"],
      ["snap-api-new", "keep"],
    ],
  );
}

function testApiReplaySuccessSummaryNormalizesActualPreviewBody() {
  const envelope = buildApiReplaySuccessEnvelope();
  const before = structuredClone(envelope);
  const state = buildWorkspaceSessionSnapshotRetentionCleanupInventoryState(envelope);

  assert.deepEqual(envelope, before);
  assert.equal(state.sourceKind, "api_inventory_preview");
  assert.equal(state.phase, "success");
  assert.equal(state.status, "attention");
  assert.equal(state.generatedAt, timestamps.generated);
  assert.equal(state.entryCount, 2);
  assert.equal(state.keepCount, 1);
  assert.equal(state.deleteCount, 1);
  assert.equal(state.reviewCount, 0);
  assert.equal(state.localOnly, true);
  assert.equal(state.dryRun, true);
  assert.equal(state.durableWrites, false);
  assert.equal(state.dryRunReady, true);
  assert.deepEqual(
    state.rows.map((row) => [row.snapshotId, row.action, row.sourceLabel]),
    [
      ["snap-api-delete", "delete", "file-metadata relative"],
      ["snap-api-keep", "keep", "snapshot-record-summary relative"],
    ],
  );
  assert.deepEqual(state.errors, []);
  assertNoRawLeak(state);
}

function testFailedApiReplayStderrIsRedacted() {
  const state = buildWorkspaceSessionSnapshotRetentionCleanupInventoryState({
    exitCode: 2,
    stdout: "",
    stderr: JSON.stringify({
      error: {
        code: "invalid_fixture",
        message: `replay failed for ${rawPath} with token ${rawSecret}`,
      },
    }),
  });

  assert.equal(state.phase, "error");
  assert.equal(state.status, "error");
  assert.equal(state.errors.some((error) => error.redacted), true);
  assert.equal(
    state.errors.some((error) => error.description.includes("[REDACTED]")),
    true,
  );
  assertNoRawLeak(state);
}

function testSdkClientResponseBodyWrappersNormalizeAsApiPreview() {
  const plan = buildApiInventoryPlan();
  const wrappers = [
    { ok: true, value: plan },
    { status: 200, body: { payload: plan } },
    { response: { status: 200, data: plan } },
    { result: { response: { status: 200, body: plan } } },
  ];

  for (const wrapper of wrappers) {
    const before = structuredClone(wrapper);
    const state = buildWorkspaceSessionSnapshotRetentionCleanupInventoryState(wrapper);

    assert.deepEqual(wrapper, before);
    assert.equal(state.sourceKind, "api_inventory_preview");
    assert.equal(state.phase, "success");
    assert.equal(state.entryCount, 2);
    assert.equal(state.keepCount, 1);
    assert.equal(state.deleteCount, 1);
    assert.equal(state.dryRunReady, true);
    assert.deepEqual(
      state.rows.map((row) => [row.snapshotId, row.action]),
      [
        ["snap-api-delete", "delete"],
        ["snap-api-keep", "keep"],
      ],
    );
    assertNoRawLeak(state, []);
  }
}

function testMalformedApiReplayItemsBecomeSafeErrorState() {
  const state = buildWorkspaceSessionSnapshotRetentionCleanupInventoryState({
    kind: "workspace-session-snapshot-retention-cleanup-inventory-api-fixture-replay",
    schemaVersion: "workspace-session-snapshot-retention-cleanup-inventory-api-requests/v1",
    generatedAt: timestamps.generated,
    totalRequests: 2,
    replayedRequests: 2,
    passedRequests: 0,
    failedRequests: 1,
    requests: [
      "not-a-replay-item",
      {
        id: "api_inventory_preview_malformed",
        path: apiInventoryPreviewRoute,
        request: {
          body: {
            path: rawPath,
            token: rawSecret,
          },
        },
        actual: {
          status: 200,
          body: {
            requestBody: {
              token: rawSecret,
            },
          },
        },
        matches: {
          status: false,
        },
      },
    ],
  });

  assert.equal(state.sourceKind, "api_inventory_preview");
  assert.equal(state.phase, "error");
  assert.equal(state.status, "error");
  assert.equal(state.dryRunReady, false);
  assert.equal(state.entryCount, 0);
  assert.deepEqual(state.warnings.map((warning) => warning.kind), ["malformed"]);
  assert.equal(state.errors.length > 0, true);
  assertNoRawLeak(state);
}

function testUnsafePayloadIsBlockedAndRedactionSafe() {
  const payload = buildSdkDryRunPlan({
    localOnly: false,
    dryRun: false,
    durableWrites: true,
    redacted: false,
    requestBody: {
      token: rawSecret,
      path: rawPath,
    },
    rawRequestBodyStored: true,
    storagePathRedacted: false,
    rawLockMaterialStored: true,
    entryCount: 1,
    keepCount: 0,
    deleteCount: 1,
    reviewCount: 0,
    keepActions: [],
    reviewActions: [],
    deleteActions: [],
    actions: [
      cleanupAction({
        action: "delete",
        applied: true,
        reasons: [`path ${rawPath}`, `token ${rawSecret}`],
        summary: cleanupSummary({
          snapshotId: `snap-${rawSecret}`,
          fileRef: rawPath,
        }),
        issues: [
          {
            issueKind: "raw-secret",
            reason: `token ${rawSecret}`,
            message: rawSecret,
          },
        ],
      }),
    ],
  });
  const state = buildWorkspaceSessionSnapshotRetentionCleanupInventoryState(payload);

  assert.equal(state.status, "blocked");
  assert.equal(state.dryRunReady, false);
  assert.equal(state.localOnly, false);
  assert.equal(state.dryRun, false);
  assert.equal(state.durableWrites, true);
  assert.equal(state.redacted, false);
  assert.deepEqual(
    state.warnings.map((warning) => warning.kind),
    [
      "not_local_only",
      "not_dry_run",
      "durable_writes",
      "not_redacted",
      "raw_body",
      "raw_path",
      "raw_token",
      "applied_actions",
    ],
  );
  assert.equal(state.rows[0].snapshotId, "[REDACTED]");
  assert.equal(state.rows[0].status, "blocked");
  assert.equal(state.rows[0].reasons.every((reason) => reason === "[REDACTED]"), true);
  assert.equal(
    redactWorkspaceSessionSnapshotRetentionCleanupInventoryValue(rawPath, "path"),
    "[REDACTED]",
  );
  assert.equal(
    redactWorkspaceSessionSnapshotRetentionCleanupInventoryValue(rawSecret, "token"),
    "[REDACTED]",
  );
  assertNoRawLeak(state);
}

function testFocusedBuildersLoadingAndMalformedStates() {
  assert.deepEqual(
    buildWorkspaceSessionSnapshotRetentionCleanupInventoryRows(buildSdkDryRunPlan()).map(
      (row) => [row.snapshotId, row.action],
    ),
    [
      ["snap-old", "delete"],
      ["snap-review", "review"],
      ["snap-new", "keep"],
    ],
  );
  assert.deepEqual(
    buildWorkspaceSessionSnapshotRetentionCleanupInventoryWarnings(
      buildSdkDryRunPlan(),
    ),
    [],
  );

  const loading = buildWorkspaceSessionSnapshotRetentionCleanupInventoryState(undefined, {
    loading: true,
    defaultTimestamp: timestamps.generated,
    sourceKind: "api_inventory_preview",
  });
  assert.equal(loading.phase, "loading");
  assert.equal(loading.status, "loading");
  assert.equal(loading.generatedAt, timestamps.generated);
  assert.equal(Object.isFrozen(loading), true);

  const malformed = buildWorkspaceSessionSnapshotRetentionCleanupInventoryState(
    undefined,
    { defaultTimestamp: timestamps.generated },
  );
  assert.equal(malformed.phase, "error");
  assert.equal(malformed.status, "error");
  assert.equal(malformed.warnings[0].kind, "malformed");
  assert.equal(malformed.errors[0].description.includes(rawPath), false);

  const failedCli = buildWorkspaceSessionSnapshotRetentionCleanupInventoryState({
    exitCode: 1,
    stdout: "",
    stderr: `failed at ${rawPath} token=${rawSecret}`,
  });
  assert.equal(failedCli.status, "error");
  assertNoRawLeak(failedCli);
}

testSdkDryRunPlanBuildsFrozenInventoryState();
testCliAndApiInventoryEnvelopesNormalizeCounts();
testApiReplaySuccessSummaryNormalizesActualPreviewBody();
testFailedApiReplayStderrIsRedacted();
testSdkClientResponseBodyWrappersNormalizeAsApiPreview();
testMalformedApiReplayItemsBecomeSafeErrorState();
testUnsafePayloadIsBlockedAndRedactionSafe();
testFocusedBuildersLoadingAndMalformedStates();

console.log("workspace session snapshot retention cleanup inventory state tests passed");
