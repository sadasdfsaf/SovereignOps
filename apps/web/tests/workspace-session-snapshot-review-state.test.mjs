import assert from "node:assert/strict";

import {
  buildWorkspaceSessionSnapshotRetentionPreview,
  buildWorkspaceSessionSnapshotReviewChangedFields,
  buildWorkspaceSessionSnapshotReviewEmptyState,
  buildWorkspaceSessionSnapshotReviewErrorState,
  buildWorkspaceSessionSnapshotReviewState,
  buildWorkspaceSessionSnapshotReviewStatusBadges,
  buildWorkspaceSessionSnapshotReviewWarnings,
  redactWorkspaceSessionSnapshotReviewDisplayValue,
} from "../src/workspaceSessionSnapshotReviewState.ts";

const timestamps = {
  generated: "2026-04-28T05:00:00.000Z",
  older: "2026-04-28T04:00:00.000Z",
};

const rawPath = "C:\\Users\\DELL\\workspace-session\\raw-snapshot.json";
const rawSecret = "sk-local-review-secret-123456";

function buildCompareResponse(overrides = {}) {
  return {
    kind: "workspace-session.snapshot-compare",
    schemaVersion: "workspace-session-store/v1",
    generatedAt: timestamps.generated,
    localOnly: true,
    durableWrites: false,
    redacted: true,
    baselineSnapshotId: "snapshot_base",
    targetSnapshotId: "snapshot_next",
    redactionCount: 2,
    changedFields: [
      {
        path: "summary.operations",
        changeType: "modified",
        before: ["open"],
        after: ["open", "lock"],
      },
      {
        path: "audit.records[1].details.storagePath",
        changeType: "added",
        after: "[redacted:path:abc123]",
        redacted: true,
      },
    ],
    ...overrides,
  };
}

function buildRetentionPreview(overrides = {}) {
  return {
    kind: "workspace-session.snapshot-retention-preview",
    schemaVersion: "workspace-session-store/v1",
    generatedAt: timestamps.generated,
    localOnly: true,
    durableWrites: false,
    redacted: true,
    keepCount: 2,
    deleteCount: 1,
    reviewCount: 1,
    records: [
      {
        snapshotId: "snapshot_keep",
        label: "current",
        action: "keep",
        reason: "Newest snapshot for the local workspace.",
        createdAt: timestamps.generated,
      },
      {
        snapshotId: "snapshot_delete",
        label: "expired",
        action: "delete",
        reason: "Expired by local retention window.",
        createdAt: timestamps.older,
      },
      {
        snapshotId: "snapshot_review",
        label: "manual",
        action: "review",
      },
    ],
    ...overrides,
  };
}

function assertNoRawLeak(value, rawValues = [rawPath, rawSecret]) {
  const serialized = JSON.stringify(value);
  for (const raw of rawValues) {
    assert.equal(
      serialized.includes(raw),
      false,
      `review state leaked raw value: ${raw}`,
    );
    assert.equal(
      serialized.includes(raw.replaceAll("\\", "\\\\")),
      false,
      `review state leaked escaped raw value: ${raw}`,
    );
  }
  for (const key of [
    '"requestBody"',
    '"responseBody"',
    '"rawBody"',
    '"rawRequestBody"',
    '"rawResponseBody"',
  ]) {
    assert.equal(serialized.includes(key), false, `review state retained ${key}`);
  }
}

function testHealthyCompareBuildsUiState() {
  const payload = buildCompareResponse();
  const original = structuredClone(payload);
  const state = buildWorkspaceSessionSnapshotReviewState({ body: payload });

  assert.deepEqual(payload, original);
  assert.equal(state.id, "workspace_session_snapshot_review");
  assert.equal(state.kind, "compare");
  assert.equal(state.phase, "success");
  assert.equal(state.status, "ready");
  assert.equal(state.riskLevel, "low");
  assert.equal(state.generatedAt, timestamps.generated);
  assert.equal(state.baselineSnapshotId, "snapshot_base");
  assert.equal(state.targetSnapshotId, "snapshot_next");
  assert.deepEqual(state.snapshotIds, ["snapshot_base", "snapshot_next"]);
  assert.equal(state.changedFieldCount, 2);
  assert.equal(state.localOnly, true);
  assert.equal(state.persistenceReady, true);
  assert.equal(state.redacted, true);
  assert.equal(state.redactionCount, 2);
  assert.equal(state.rawRetentionRisk, false);

  assert.deepEqual(
    state.changedFields.map((field) => [
      field.path,
      field.changeType,
      field.status,
      field.redacted,
    ]),
    [
      ["audit.records[1].details.storagePath", "added", "ready", true],
      ["summary.operations", "modified", "ready", false],
    ],
  );
  assert.deepEqual(
    state.statusBadges.map((badge) => [badge.kind, badge.value, badge.status]),
    [
      ["status", "Ready", "ready"],
      ["risk", "Low risk", "ready"],
      ["compare", "2 fields", "ready"],
      ["retention", "0 keep / 0 delete", "empty"],
      ["readiness", "Ready", "ready"],
      ["redaction", "2 redactions", "ready"],
    ],
  );
  assertNoRawLeak(state);
}

function testRiskyCompareBuildsWarningsAndSanitizesDisplay() {
  const payload = buildCompareResponse({
    localOnly: false,
    durableWrites: true,
    redacted: false,
    changedFields: [
      {
        path: "metadata.requestBody",
        changeType: "modified",
        before: { token: rawSecret, path: rawPath },
        after: { token: rawSecret },
      },
    ],
    requestBody: {
      token: rawSecret,
      path: rawPath,
    },
    rawRequestBodyStored: true,
    storagePathRedacted: false,
    rawLockMaterialStored: true,
  });

  const state = buildWorkspaceSessionSnapshotReviewState(payload);

  assert.equal(state.status, "blocked");
  assert.equal(state.riskLevel, "high");
  assert.equal(state.localOnly, false);
  assert.equal(state.redacted, false);
  assert.equal(state.durableWrites, true);
  assert.equal(state.persistenceReady, false);
  assert.equal(state.rawBodyRetained, true);
  assert.equal(state.rawPathRetained, true);
  assert.equal(state.rawTokenRetained, true);
  assert.equal(state.rawRetentionRisk, true);
  assert.ok(state.rawRetentionRiskCount >= 3);
  assert.deepEqual(
    state.warnings.map((warning) => [warning.kind, warning.status]),
    [
      ["raw_body", "blocked"],
      ["raw_path", "attention"],
      ["raw_token", "blocked"],
      ["durable_writes", "attention"],
      ["not_local_only", "blocked"],
      ["not_redacted", "blocked"],
    ],
  );
  assert.equal(state.changedFields[0].beforeLabel, "[REDACTED]");
  assert.equal(state.changedFields[0].afterLabel, "[REDACTED]");
  assert.equal(
    redactWorkspaceSessionSnapshotReviewDisplayValue(rawSecret, "token"),
    "[REDACTED]",
  );
  assert.equal(
    redactWorkspaceSessionSnapshotReviewDisplayValue(rawPath, "path"),
    "[REDACTED]",
  );
  assertNoRawLeak(state);
}

function testRetentionPreviewCountsAndFocusedBuilders() {
  const state = buildWorkspaceSessionSnapshotReviewState({
    data: buildRetentionPreview(),
  });

  assert.equal(state.kind, "retention_preview");
  assert.equal(state.phase, "success");
  assert.equal(state.status, "attention");
  assert.equal(state.riskLevel, "medium");
  assert.equal(state.retentionPreview.keepCount, 2);
  assert.equal(state.retentionPreview.deleteCount, 1);
  assert.equal(state.retentionPreview.reviewCount, 1);
  assert.equal(state.retentionPreview.totalCount, 4);
  assert.equal(state.retentionKeepCount, 2);
  assert.equal(state.retentionDeleteCount, 1);
  assert.equal(state.retentionReviewCount, 1);
  assert.equal(state.retentionTotalCount, 4);
  assert.deepEqual(
    state.retentionPreview.rows.map((row) => [row.snapshotId, row.action, row.status]),
    [
      ["snapshot_delete", "delete", "attention"],
      ["snapshot_review", "review", "attention"],
      ["snapshot_keep", "keep", "ready"],
    ],
  );
  assert.deepEqual(
    buildWorkspaceSessionSnapshotRetentionPreview(buildRetentionPreview()).detailLabels,
    ["2 snapshots kept", "1 snapshot deleted", "1 snapshot needs review"],
  );
  assert.deepEqual(
    buildWorkspaceSessionSnapshotReviewChangedFields(buildCompareResponse()).map(
      (field) => field.path,
    ),
    ["audit.records[1].details.storagePath", "summary.operations"],
  );
  assert.deepEqual(
    buildWorkspaceSessionSnapshotReviewStatusBadges(buildCompareResponse()).map(
      (badge) => badge.kind,
    ),
    ["status", "risk", "compare", "retention", "readiness", "redaction"],
  );
  assert.deepEqual(buildWorkspaceSessionSnapshotReviewWarnings(buildRetentionPreview()), []);
}

function testMissingMalformedLoadingAndErrorStates() {
  const loading = buildWorkspaceSessionSnapshotReviewState(undefined, {
    loading: true,
    kind: "retention_preview",
    defaultTimestamp: timestamps.generated,
  });
  assert.equal(loading.phase, "loading");
  assert.equal(loading.status, "loading");
  assert.equal(loading.kind, "retention_preview");
  assert.equal(loading.generatedAt, timestamps.generated);

  const missing = buildWorkspaceSessionSnapshotReviewState(undefined, {
    defaultTimestamp: timestamps.generated,
  });
  assert.equal(missing.phase, "error");
  assert.equal(missing.status, "error");
  assert.equal(missing.riskLevel, "high");
  assert.equal(missing.errorStates[0].context, "review");
  assert.equal(missing.warnings[0].kind, "malformed");
  assertNoRawLeak(missing);

  const malformed = buildWorkspaceSessionSnapshotReviewState({
    kind: "workspace-session.snapshot-compare",
    generatedAt: "not-a-date",
  });
  assert.equal(malformed.phase, "error");
  assert.equal(malformed.generatedAt, "1970-01-01T00:00:00.000Z");
  assert.equal(malformed.errorStates[0].errorState.description.includes(rawPath), false);

  assert.deepEqual(buildWorkspaceSessionSnapshotReviewEmptyState("retention"), {
    id: "workspace_session_snapshot_review_retention_empty",
    label: "No retention preview",
    description:
      "Retention keep and delete counts will appear after a retention preview loads.",
    ariaLabel: "No workspace session snapshot retention preview is available",
    actionLabel: "Preview retention",
  });
  assert.deepEqual(
    buildWorkspaceSessionSnapshotReviewErrorState(
      "warnings",
      new Error(`Review failed at ${rawPath} token=${rawSecret}`),
    ).errorState,
    {
      id: "workspace_session_snapshot_review_warnings_error",
      label: "Workspace session snapshot warnings could not load",
      description: "Review failed at [REDACTED] token=[REDACTED]",
      ariaLabel: "Workspace session snapshot warnings could not load",
      retryLabel: "Retry warnings",
    },
  );
}

function testCloneBoundary() {
  const payload = buildRetentionPreview();
  const frozenPayload = deepFreeze(structuredClone(payload));
  const before = structuredClone(frozenPayload);
  const state = buildWorkspaceSessionSnapshotReviewState(frozenPayload);

  state.snapshotIds.push("mutated");
  state.retentionPreview.rows[0].detailLabels.push("mutated");
  state.retentionPreview.detailLabels.push("mutated");
  state.statusBadges[0].value = "mutated";
  state.summaryCards[0].detailLabels.push("mutated");
  state.emptyStates.retention.label = "mutated";

  assert.deepEqual(frozenPayload, before);

  const rebuilt = buildWorkspaceSessionSnapshotReviewState(frozenPayload);
  assert.equal(rebuilt.snapshotIds.includes("mutated"), false);
  assert.equal(
    rebuilt.retentionPreview.rows[0].detailLabels.includes("mutated"),
    false,
  );
  assert.equal(rebuilt.retentionPreview.detailLabels.includes("mutated"), false);
  assert.equal(rebuilt.statusBadges[0].value, "Needs review");
  assert.equal(rebuilt.summaryCards[0].detailLabels.includes("mutated"), false);
  assert.equal(rebuilt.emptyStates.retention.label, "No retention preview");
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

testHealthyCompareBuildsUiState();
testRiskyCompareBuildsWarningsAndSanitizesDisplay();
testRetentionPreviewCountsAndFocusedBuilders();
testMissingMalformedLoadingAndErrorStates();
testCloneBoundary();

console.log("workspace session snapshot review state tests passed");
