import assert from "node:assert/strict";

import {
  buildWorkspaceSessionSnapshotRetentionCleanupActionRows,
  buildWorkspaceSessionSnapshotRetentionCleanupEmptyState,
  buildWorkspaceSessionSnapshotRetentionCleanupErrorState,
  buildWorkspaceSessionSnapshotRetentionCleanupLoadingState,
  buildWorkspaceSessionSnapshotRetentionCleanupReadinessIndicators,
  buildWorkspaceSessionSnapshotRetentionCleanupState,
  buildWorkspaceSessionSnapshotRetentionCleanupSummaryCards,
  buildWorkspaceSessionSnapshotRetentionCleanupWarnings,
  redactWorkspaceSessionSnapshotRetentionCleanupDisplayValue,
} from "../src/workspaceSessionSnapshotRetentionCleanupState.ts";

const timestamps = {
  generated: "2026-04-28T07:00:00.000Z",
  cutoff: "2026-04-25T00:00:00.000Z",
  old: "2026-04-20T00:00:00.000Z",
  mid: "2026-04-26T00:00:00.000Z",
  newer: "2026-04-27T00:00:00.000Z",
};

const fingerprint = `sha256:${"a".repeat(64)}`;
const snapshotFingerprint = `sha256:${"b".repeat(64)}`;
const rawPath = "C:\\Users\\DELL\\workspace-session\\snapshots\\unsafe.json";
const rawSecret = "sk-local-cleanup-secret-123456";

function buildSdkCleanupPlan(overrides = {}) {
  const keep = cleanupAction({
    action: "keep",
    snapshotId: "snap-new",
    sourceIndex: 2,
    rank: 1,
    reasons: ["within-max-count", "within-max-age"],
    createdAt: timestamps.newer,
  });
  const deleteAction = cleanupAction({
    action: "delete",
    snapshotId: "snap-old",
    sourceIndex: 0,
    rank: 3,
    reasons: ["exceeds-max-count", "exceeds-max-age"],
    createdAt: timestamps.old,
  });
  const review = cleanupAction({
    action: "review",
    snapshotId: "snap-duplicate",
    sourceIndex: 1,
    reasons: ["requires-review", "duplicate-snapshot-id"],
    createdAt: timestamps.mid,
    issues: [
      {
        kind: "localWorkspaceSessionSnapshotRetentionCleanupIssue",
        issueKind: "duplicate-snapshot-id",
        path: "entries.1.snapshotId",
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
    thresholds: {
      maxCount: 2,
      maxAgeMs: 259200000,
      now: timestamps.generated,
      cutoffAt: timestamps.cutoff,
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
  const snapshotId = overrides.snapshotId ?? "snap-alpha";
  return {
    kind: "localWorkspaceSessionSnapshotRetentionCleanupAction",
    action: overrides.action ?? "keep",
    reasons: overrides.reasons ?? ["within-policy"],
    sourceIndex: overrides.sourceIndex ?? 0,
    rank: overrides.rank,
    summary: {
      kind: "localWorkspaceSessionSnapshotRetentionCleanupSummary",
      sourceKind: "file-metadata",
      auditSafe: true,
      redacted: true,
      snapshotId,
      workspaceId: "wsp_alpha",
      deviceId: "dev_laptop",
      sessionId: "[redacted:session:alpha]",
      label: overrides.label ?? "local baseline",
      createdAt: overrides.createdAt ?? timestamps.newer,
      updatedAt: overrides.updatedAt ?? timestamps.newer,
      fileRef: "[redacted:path:abc123]",
      filePathKind: "relative",
      sizeBytes: 512,
      fingerprint,
      snapshotFingerprint,
      operationCount: 1,
      ...overrides.summary,
    },
    issues: overrides.issues ?? [],
    ...overrides,
  };
}

function buildApiRetentionPreview() {
  return {
    kind: "workspace-session.snapshot-review.retention-preview",
    schemaVersion: "workspace-session-snapshot-review/v1",
    storeSchemaVersion: "workspace-session-store/v1",
    localOnly: true,
    durableWrites: false,
    redacted: true,
    fingerprint,
    policy: {
      retainNewest: 1,
      retainSnapshotIds: [],
    },
    summary: {
      totalSnapshotCount: 2,
      retainedSnapshotCount: 1,
      expiredSnapshotCount: 1,
      pinnedSnapshotCount: 0,
    },
    snapshots: [
      retentionDecision({ snapshotId: "snap-api-new", plannedAction: "retain", retain: true, newestRank: 1 }),
      retentionDecision({ snapshotId: "snap-api-old", plannedAction: "expire", retain: false, newestRank: 2 }),
    ],
  };
}

function retentionDecision(overrides = {}) {
  return {
    snapshotId: "snap-api",
    fingerprint,
    snapshotFingerprint,
    createdAt: timestamps.newer,
    updatedAt: timestamps.newer,
    workspaceId: "wsp_alpha",
    deviceId: "dev_laptop",
    sessionId: "[redacted:session:alpha]",
    eventCount: 1,
    auditRecordCount: 1,
    newestRank: 1,
    retain: true,
    plannedAction: "retain",
    reasonCodes: ["within-retention-policy"],
    ...overrides,
  };
}

function buildCliRetentionPreview() {
  return {
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
          id: "evt_open",
          action: "workspace.session.opened",
          operation: "open",
          createdAt: timestamps.newer,
          decision: "retain",
          storagePath: "[redacted-path]",
          sessionRef: "[redacted:session:alpha]",
        },
        {
          id: "evt_lock",
          action: "workspace.session.locked",
          operation: "lock",
          createdAt: timestamps.old,
          decision: "drop",
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
      sessionIdsOutput: false,
    },
    redactions: [
      {
        path: "records.0.storagePath",
        reason: "local path",
      },
    ],
  };
}

function assertNoRawLeak(value, rawValues = [rawPath, rawSecret]) {
  const serialized = JSON.stringify(value);
  for (const raw of rawValues) {
    assert.equal(
      serialized.includes(raw),
      false,
      `retention cleanup state leaked raw value: ${raw}`,
    );
    assert.equal(
      serialized.includes(raw.replaceAll("\\", "\\\\")),
      false,
      `retention cleanup state leaked escaped raw value: ${raw}`,
    );
  }
  for (const key of [
    '"requestBody"',
    '"responseBody"',
    '"rawBody"',
    '"rawRequestBody"',
    '"rawResponseBody"',
  ]) {
    assert.equal(serialized.includes(key), false, `retention cleanup state retained ${key}`);
  }
}

function testSdkCleanupPlanBuildsDerivedState() {
  const plan = buildSdkCleanupPlan();
  const original = structuredClone(plan);
  const state = buildWorkspaceSessionSnapshotRetentionCleanupState({ body: plan });

  assert.deepEqual(plan, original);
  assert.equal(state.id, "workspace_session_snapshot_retention_cleanup");
  assert.equal(state.sourceKind, "sdk_cleanup_plan");
  assert.equal(state.phase, "success");
  assert.equal(state.status, "attention");
  assert.equal(state.generatedAt, timestamps.generated);
  assert.equal(state.entryCount, 3);
  assert.equal(state.keepCount, 1);
  assert.equal(state.deleteCount, 1);
  assert.equal(state.reviewCount, 1);
  assert.equal(state.dryRun, true);
  assert.equal(state.dryRunReady, true);
  assert.equal(state.localOnly, true);
  assert.equal(state.redacted, true);
  assert.equal(state.durableWrites, false);
  assert.equal(state.applied, false);
  assert.equal(state.rawRetentionRisk, false);
  assert.deepEqual(state.warnings, []);

  assert.deepEqual(
    state.actionRows.map((row) => [
      row.snapshotId,
      row.action,
      row.status,
      row.sourceKind,
      row.dryRun,
      row.applied,
    ]),
    [
      ["snap-old", "delete", "attention", "file-metadata", true, false],
      ["snap-duplicate", "review", "attention", "file-metadata", true, false],
      ["snap-new", "keep", "ready", "file-metadata", true, false],
    ],
  );
  assert.deepEqual(
    state.readinessIndicators.map((indicator) => [
      indicator.kind,
      indicator.ready,
      indicator.status,
    ]),
    [
      ["dry_run", true, "ready"],
      ["local_only", true, "ready"],
      ["redacted", true, "ready"],
      ["durable_writes", true, "ready"],
      ["not_applied", true, "ready"],
      ["raw_retention", true, "ready"],
    ],
  );
  assert.deepEqual(
    state.summaryCards.map((card) => [card.label, card.value, card.status]),
    [
      ["Cleanup actions", "1 keep / 1 delete / 1 review", "attention"],
      ["Dry-run readiness", "Ready", "ready"],
      ["Redactions", `${state.redactionCount} redactions`, "ready"],
      ["Raw retention", "Not retained", "ready"],
      ["Cleanup warnings", "0 warnings", "ready"],
    ],
  );
  assert.equal(state.thresholdLabels.includes("Max count 2"), true);
  assert.equal(state.thresholdLabels.includes(`Cutoff ${timestamps.cutoff}`), true);
  assertNoRawLeak(state, []);
}

function testApiAndCliPreviewShapesAreNormalized() {
  const apiState = buildWorkspaceSessionSnapshotRetentionCleanupState({
    response: {
      body: buildApiRetentionPreview(),
    },
  });

  assert.equal(apiState.sourceKind, "api_retention_preview");
  assert.equal(apiState.phase, "success");
  assert.equal(apiState.status, "attention");
  assert.equal(apiState.dryRun, true);
  assert.equal(apiState.dryRunReady, true);
  assert.equal(apiState.keepCount, 1);
  assert.equal(apiState.deleteCount, 1);
  assert.equal(apiState.reviewCount, 0);
  assert.deepEqual(
    apiState.actionRows.map((row) => [row.snapshotId, row.action]),
    [
      ["snap-api-old", "delete"],
      ["snap-api-new", "keep"],
    ],
  );
  assertNoRawLeak(apiState, []);

  const cliState = buildWorkspaceSessionSnapshotRetentionCleanupState(
    buildCliRetentionPreview(),
  );
  assert.equal(cliState.sourceKind, "cli_retention_preview");
  assert.equal(cliState.phase, "success");
  assert.equal(cliState.status, "attention");
  assert.equal(cliState.dryRun, true);
  assert.equal(cliState.localOnly, true);
  assert.equal(cliState.dryRunReady, true);
  assert.equal(cliState.keepCount, 1);
  assert.equal(cliState.deleteCount, 1);
  assert.equal(cliState.reviewCount, 0);
  assert.deepEqual(
    cliState.actionRows.map((row) => [row.snapshotId, row.action, row.status]),
    [
      ["evt_lock", "delete", "attention"],
      ["evt_open", "keep", "ready"],
    ],
  );
  assertNoRawLeak(cliState, []);
}

function testUnsafePayloadBuildsWarningsAndRedactsDisplayValues() {
  const payload = buildSdkCleanupPlan({
    localOnly: false,
    dryRun: false,
    durableWrites: true,
    redacted: false,
    rawRequestBodyRetained: true,
    storagePathRedacted: false,
    rawLockMaterialStored: true,
    requestBody: {
      token: rawSecret,
      path: rawPath,
    },
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
        snapshotId: `snap-${rawSecret}`,
        label: `unsafe ${rawPath}`,
        applied: true,
        reasons: [`path ${rawPath}`, `token ${rawSecret}`],
        summary: {
          snapshotId: `snap-${rawSecret}`,
          label: `unsafe ${rawPath}`,
          fileRef: rawPath,
        },
        issues: [
          {
            issueKind: "raw-secret",
            path: "entries.0.apiToken",
            reason: "raw-secret",
            message: `token ${rawSecret}`,
          },
          {
            issueKind: "unsafe-absolute-path",
            path: "entries.0.path",
            reason: "unsafe-absolute-path",
            message: rawPath,
          },
        ],
      }),
    ],
  });
  const state = buildWorkspaceSessionSnapshotRetentionCleanupState(payload);

  assert.equal(state.phase, "success");
  assert.equal(state.status, "blocked");
  assert.equal(state.dryRun, false);
  assert.equal(state.dryRunReady, false);
  assert.equal(state.localOnly, false);
  assert.equal(state.redacted, false);
  assert.equal(state.durableWrites, true);
  assert.equal(state.applied, true);
  assert.equal(state.rawBodyRetained, true);
  assert.equal(state.rawPathRetained, true);
  assert.equal(state.rawTokenRetained, true);
  assert.equal(state.rawRetentionRisk, true);
  assert.ok(state.rawRetentionRiskCount >= 3);
  assert.deepEqual(
    state.warnings.map((warning) => warning.kind),
    [
      "not_dry_run",
      "durable_writes",
      "not_local_only",
      "not_redacted",
      "raw_body",
      "raw_path",
      "raw_token",
      "applied_actions",
    ],
  );
  assert.equal(state.actionRows[0].snapshotId, "[REDACTED]");
  assert.equal(state.actionRows[0].label, "[REDACTED]");
  assert.equal(state.actionRows[0].fileRef, "[REDACTED]");
  assert.equal(state.actionRows[0].status, "blocked");
  assert.equal(state.actionRows[0].reasonLabels.every((label) => label === "[REDACTED]"), true);
  assert.equal(
    redactWorkspaceSessionSnapshotRetentionCleanupDisplayValue(rawSecret, "token"),
    "[REDACTED]",
  );
  assert.equal(
    redactWorkspaceSessionSnapshotRetentionCleanupDisplayValue(rawPath, "path"),
    "[REDACTED]",
  );
  assertNoRawLeak(state);
}

function testFocusedBuildersLoadingEmptyAndErrors() {
  const plan = buildSdkCleanupPlan();

  assert.deepEqual(
    buildWorkspaceSessionSnapshotRetentionCleanupActionRows(plan).map((row) => [
      row.snapshotId,
      row.action,
    ]),
    [
      ["snap-old", "delete"],
      ["snap-duplicate", "review"],
      ["snap-new", "keep"],
    ],
  );
  assert.deepEqual(
    buildWorkspaceSessionSnapshotRetentionCleanupReadinessIndicators(plan).map(
      (indicator) => [indicator.kind, indicator.ready],
    ),
    [
      ["dry_run", true],
      ["local_only", true],
      ["redacted", true],
      ["durable_writes", true],
      ["not_applied", true],
      ["raw_retention", true],
    ],
  );
  assert.deepEqual(
    buildWorkspaceSessionSnapshotRetentionCleanupSummaryCards(plan).map((card) => [
      card.id,
      card.value,
    ]),
    [
      ["workspace_session_snapshot_retention_cleanup.summary.actions", "1 keep / 1 delete / 1 review"],
      ["workspace_session_snapshot_retention_cleanup.summary.readiness", "Ready"],
      ["workspace_session_snapshot_retention_cleanup.summary.redactions", "12 redactions"],
      ["workspace_session_snapshot_retention_cleanup.summary.retention", "Not retained"],
      ["workspace_session_snapshot_retention_cleanup.summary.warnings", "0 warnings"],
    ],
  );
  assert.deepEqual(buildWorkspaceSessionSnapshotRetentionCleanupWarnings(plan), []);

  const loading = buildWorkspaceSessionSnapshotRetentionCleanupLoadingState({
    sourceKind: "sdk_cleanup_plan",
    defaultTimestamp: timestamps.generated,
  });
  assert.equal(loading.phase, "loading");
  assert.equal(loading.status, "loading");
  assert.equal(loading.sourceKind, "sdk_cleanup_plan");
  assert.equal(loading.generatedAt, timestamps.generated);

  const missing = buildWorkspaceSessionSnapshotRetentionCleanupState(undefined, {
    defaultTimestamp: timestamps.generated,
  });
  assert.equal(missing.phase, "error");
  assert.equal(missing.status, "error");
  assert.equal(missing.warnings[0].kind, "malformed");
  assert.equal(missing.errorStates[0].context, "cleanup");

  assert.deepEqual(buildWorkspaceSessionSnapshotRetentionCleanupEmptyState("actions"), {
    id: "workspace_session_snapshot_retention_cleanup_actions_empty",
    label: "No cleanup actions",
    description:
      "Retention cleanup action rows appear after a dry-run plan payload loads.",
    ariaLabel: "No workspace session snapshot retention cleanup actions are available",
  });
  assert.deepEqual(
    buildWorkspaceSessionSnapshotRetentionCleanupErrorState(
      "warnings",
      new Error(`Cleanup failed at ${rawPath} token=${rawSecret}`),
    ).errorState,
    {
      id: "workspace_session_snapshot_retention_cleanup_warnings_error",
      label: "Workspace session snapshot retention cleanup warnings could not load",
      description: "Cleanup failed at [REDACTED] token=[REDACTED]",
      ariaLabel: "Workspace session snapshot retention cleanup warnings could not load",
      retryLabel: "Retry cleanup warnings",
    },
  );
}

function testCloneBoundary() {
  const payload = buildSdkCleanupPlan();
  const frozenPayload = deepFreeze(structuredClone(payload));
  const before = structuredClone(frozenPayload);
  const state = buildWorkspaceSessionSnapshotRetentionCleanupState(frozenPayload);

  state.thresholdLabels.push("mutated");
  state.actionRows[0].reasonLabels.push("mutated");
  state.actionRows[0].issueLabels.push("mutated");
  state.actionRows[0].detailLabels.push("mutated");
  state.readinessIndicators[0].detailLabels.push("mutated");
  state.summaryCards[0].detailLabels.push("mutated");
  state.emptyStates.actions.label = "mutated";

  assert.deepEqual(frozenPayload, before);

  const rebuilt = buildWorkspaceSessionSnapshotRetentionCleanupState(frozenPayload);
  assert.equal(rebuilt.thresholdLabels.includes("mutated"), false);
  assert.equal(rebuilt.actionRows[0].reasonLabels.includes("mutated"), false);
  assert.equal(rebuilt.actionRows[0].issueLabels.includes("mutated"), false);
  assert.equal(rebuilt.actionRows[0].detailLabels.includes("mutated"), false);
  assert.equal(rebuilt.readinessIndicators[0].detailLabels.includes("mutated"), false);
  assert.equal(rebuilt.summaryCards[0].detailLabels.includes("mutated"), false);
  assert.equal(rebuilt.emptyStates.actions.label, "No cleanup actions");
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}

testSdkCleanupPlanBuildsDerivedState();
testApiAndCliPreviewShapesAreNormalized();
testUnsafePayloadBuildsWarningsAndRedactsDisplayValues();
testFocusedBuildersLoadingEmptyAndErrors();
testCloneBoundary();

console.log("workspace session snapshot retention cleanup state tests passed");
