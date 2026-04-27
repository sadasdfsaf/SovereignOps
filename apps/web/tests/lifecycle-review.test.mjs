import assert from "node:assert/strict";

import {
  addBackupRestoreReview,
  addCompactionPlanReview,
  addLifecycleRedactionMarker,
  addMigrationPlanReview,
  addSyncReplayReview,
  buildLifecycleReviewStatusSummaries,
  createLifecycleReviewState,
  decideLifecycleReview,
  isLifecycleApprovalDecisionStatus,
  isLifecycleRedactionSeverity,
  isLifecycleReviewKind,
  isLifecycleReviewStatus,
  lifecycleReviewReducer,
  listLifecycleReviews,
  resolveLifecycleRedactionMarker,
  summarizeLifecycleReviewState,
} from "../src/lifecycleReview.ts";

const timestamps = {
  first: "2026-04-27T02:00:00.000Z",
  second: "2026-04-27T02:05:00.000Z",
  third: "2026-04-27T02:10:00.000Z",
  fourth: "2026-04-27T02:15:00.000Z",
  fifth: "2026-04-27T02:20:00.000Z",
};

function testReviewReducersAndSummaries() {
  let state = createLifecycleReviewState();

  state = lifecycleReviewReducer(state, {
    type: "backup_restore.add",
    review: {
      id: "lcr_backup_notes",
      workspaceId: "wsp_alpha",
      title: "Review notes backup",
      requestedBy: "act_mira",
      createdAt: timestamps.first,
      operation: "backup",
      backupId: "bkp_notes_001",
      manifestFingerprint: "fp_manifest_notes_001",
      payloadCount: 3,
      totalBytes: 2048,
      reviewerRoles: ["workspace_owner", "workspace_owner"],
    },
  });
  state = lifecycleReviewReducer(state, {
    type: "migration_plan.add",
    review: {
      id: "lcr_migration_metadata",
      workspaceId: "wsp_alpha",
      title: "Review metadata migration",
      requestedBy: "act_mira",
      createdAt: timestamps.second,
      sourceVersion: 1,
      targetVersion: 3,
      stepIds: ["metadata.v2", "metadata.v3", "metadata.v2"],
      rollbackNotes: ["Restore the prior metadata snapshot."],
      planFingerprint: "fp_migration_metadata",
    },
  });
  state = lifecycleReviewReducer(state, {
    type: "sync_replay.add",
    review: {
      id: "lcr_sync_replay",
      workspaceId: "wsp_alpha",
      title: "Review sync replay",
      requestedBy: "act_rin",
      createdAt: timestamps.third,
      afterCursor: "cur:0000000000000001:evt_alpha",
      nextCursor: "cur:0000000000000005:evt_echo",
      eventCount: 4,
      issueCount: 2,
      replayStatus: "degraded",
      issueCodes: ["duplicate_event", "duplicate_event"],
    },
  });
  state = lifecycleReviewReducer(state, {
    type: "compaction_plan.add",
    review: {
      id: "lcr_compaction_notes",
      workspaceId: "wsp_alpha",
      title: "Review notes compaction",
      requestedBy: "act_sol",
      createdAt: timestamps.fourth,
      streamId: "stream_notes",
      fromSequence: 1,
      toSequence: 20,
      sourceEventCount: 20,
      compactedEventCount: 12,
      retainedEventCount: 8,
      checkpointCount: 1,
      replayVerified: false,
      planFingerprint: "fp_compaction_notes",
    },
  });

  assert.deepEqual(
    listLifecycleReviews(state).map((review) => review.id),
    [
      "lcr_backup_notes",
      "lcr_migration_metadata",
      "lcr_sync_replay",
      "lcr_compaction_notes",
    ],
  );
  assert.deepEqual(state.backupRestoreReviews[0].reviewerRoles, [
    "workspace_owner",
  ]);
  assert.deepEqual(state.migrationPlanReviews[0].stepIds, [
    "metadata.v2",
    "metadata.v3",
  ]);
  assert.deepEqual(state.syncReplayReviews[0].issueCodes, ["duplicate_event"]);
  assert.equal(state.syncReplayReviews[0].warningCount, 2);
  assert.equal(state.compactionPlanReviews[0].status, "blocked");

  const summary = summarizeLifecycleReviewState(state);
  assert.equal(summary.totalReviews, 4);
  assert.deepEqual(summary.byKind, {
    backup_restore: 1,
    migration_plan: 1,
    sync_replay: 1,
    compaction_plan: 1,
  });
  assert.deepEqual(summary.byStatus, {
    pending: 3,
    needs_redaction: 0,
    approved: 0,
    rejected: 0,
    blocked: 1,
  });
  assert.deepEqual(summary.blockedReviewIds, ["lcr_compaction_notes"]);
}

function testRedactionMarkersAndApprovalDecisions() {
  let state = addBackupRestoreReview(createLifecycleReviewState(), {
    id: "lcr_restore_notes",
    workspaceId: "wsp_alpha",
    title: "Review notes restore",
    requestedBy: "act_mira",
    createdAt: timestamps.first,
    operation: "restore",
    backupId: "bkp_notes_002",
    manifestFingerprint: "fp_manifest_notes_002",
    payloadCount: 2,
    restoreMode: "merge",
    targetWorkspaceId: "wsp_alpha",
  });

  const marked = addLifecycleRedactionMarker(state, {
    id: "red_manifest_path",
    reviewId: "lcr_restore_notes",
    path: "$.manifest.payloads[0].path",
    reason: "Path should be masked before review.",
    marker: "[redacted:path]",
    severity: "blocking",
    createdBy: "act_reviewer",
    createdAt: timestamps.second,
  });

  assert.equal(state.backupRestoreReviews[0].status, "pending");
  assert.equal(marked.backupRestoreReviews[0].status, "needs_redaction");
  assert.deepEqual(marked.backupRestoreReviews[0].redactionMarkerIds, [
    "red_manifest_path",
  ]);
  assert.throws(
    () =>
      decideLifecycleReview(marked, {
        id: "dec_restore_approve_blocked",
        reviewId: "lcr_restore_notes",
        decision: "approved",
        decidedBy: "act_reviewer",
        decidedAt: timestamps.third,
      }),
    /cannot be approved/,
  );

  const resolved = resolveLifecycleRedactionMarker(
    marked,
    "red_manifest_path",
    "act_reviewer",
    timestamps.third,
  );
  assert.equal(resolved.backupRestoreReviews[0].status, "pending");
  assert.equal(resolved.redactionMarkers[0].status, "resolved");
  assert.equal(resolved.redactionMarkers[0].resolvedAt, timestamps.third);

  const approved = lifecycleReviewReducer(resolved, {
    type: "review.decide",
    decision: {
      id: "dec_restore_approve",
      reviewId: "lcr_restore_notes",
      decision: "approved",
      decidedBy: "act_reviewer",
      decidedAt: timestamps.fourth,
      reason: "Restore plan checks passed.",
    },
  });

  assert.equal(approved.backupRestoreReviews[0].status, "approved");
  assert.equal(approved.backupRestoreReviews[0].decisionId, "dec_restore_approve");
  assert.equal(approved.approvalDecisions[0].decision, "approved");
  assert.throws(
    () =>
      addLifecycleRedactionMarker(approved, {
        id: "red_after_decision",
        reviewId: "lcr_restore_notes",
        path: "$.manifest.backupId",
        reason: "Cannot mark a decided review.",
        marker: "[redacted:id]",
        createdBy: "act_reviewer",
        createdAt: timestamps.fifth,
      }),
    /decided reviews/,
  );

  const summary = summarizeLifecycleReviewState(approved);
  assert.deepEqual(summary.approvedReviewIds, ["lcr_restore_notes"]);
  assert.equal(summary.decisions.total, 1);
  assert.deepEqual(summary.decisions.byDecision, {
    approved: 1,
    rejected: 0,
  });
  assert.deepEqual(summary.redactions.bySeverity, {
    info: 0,
    warning: 0,
    blocking: 1,
  });
  assert.equal(summary.redactions.resolved, 1);
}

function testBlockedPlansCanBeRejectedButNotApproved() {
  const state = addCompactionPlanReview(createLifecycleReviewState(), {
    id: "lcr_compaction_reject",
    workspaceId: "wsp_alpha",
    title: "Review blocked compaction",
    requestedBy: "act_sol",
    createdAt: timestamps.first,
    streamId: "stream_records",
    fromSequence: 2,
    toSequence: 12,
    sourceEventCount: 11,
    compactedEventCount: 9,
    retainedEventCount: 2,
    replayVerified: false,
    planFingerprint: "fp_compaction_reject",
  });

  assert.equal(state.compactionPlanReviews[0].status, "blocked");
  assert.throws(
    () =>
      decideLifecycleReview(state, {
        id: "dec_compaction_approve",
        reviewId: "lcr_compaction_reject",
        decision: "approved",
        decidedBy: "act_reviewer",
        decidedAt: timestamps.second,
      }),
    /cannot be approved/,
  );

  const rejected = decideLifecycleReview(state, {
    id: "dec_compaction_reject",
    reviewId: "lcr_compaction_reject",
    decision: "rejected",
    decidedBy: "act_reviewer",
    decidedAt: timestamps.third,
    reason: "Replay verification must pass first.",
  });

  assert.equal(rejected.compactionPlanReviews[0].status, "rejected");
  assert.deepEqual(summarizeLifecycleReviewState(rejected).rejectedReviewIds, [
    "lcr_compaction_reject",
  ]);
}

function testStatusSummariesAndImmutability() {
  let state = createLifecycleReviewState();
  state = addMigrationPlanReview(state, {
    id: "lcr_migration_clean",
    workspaceId: "wsp_alpha",
    title: "Review clean migration",
    requestedBy: "act_mira",
    createdAt: timestamps.first,
    sourceVersion: 1,
    targetVersion: 2,
    stepIds: ["metadata.v2"],
    planFingerprint: "fp_migration_clean",
  });
  state = addSyncReplayReview(state, {
    id: "lcr_sync_clean",
    workspaceId: "wsp_alpha",
    title: "Review clean sync replay",
    requestedBy: "act_rin",
    createdAt: timestamps.second,
    afterCursor: "cur:0000000000000000:origin",
    nextCursor: "cur:0000000000000003:evt_charlie",
    eventCount: 3,
  });
  state = addLifecycleRedactionMarker(state, {
    id: "red_sync_note",
    reviewId: "lcr_sync_clean",
    path: "$.audit.message",
    reason: "Message detail should stay summarized.",
    marker: "[redacted:summary]",
    severity: "warning",
    createdBy: "act_reviewer",
    createdAt: timestamps.third,
  });
  state = decideLifecycleReview(state, {
    id: "dec_migration_approve",
    reviewId: "lcr_migration_clean",
    decision: "approved",
    decidedBy: "act_reviewer",
    decidedAt: timestamps.fourth,
  });

  const summaries = buildLifecycleReviewStatusSummaries(state);
  assert.deepEqual(
    summaries.map((summary) => [
      summary.reviewId,
      summary.status,
      summary.openRedactionCount,
      summary.openBlockingRedactionCount,
      summary.decision,
    ]),
    [
      ["lcr_migration_clean", "approved", 0, 0, "approved"],
      ["lcr_sync_clean", "pending", 1, 0, undefined],
    ],
  );

  const listed = listLifecycleReviews(state, "sync_replay");
  listed[0].redactionMarkerIds.push("mutated");
  listed[0].issueCodes.push("mutated");
  assert.deepEqual(state.syncReplayReviews[0].redactionMarkerIds, [
    "red_sync_note",
  ]);
  assert.deepEqual(state.syncReplayReviews[0].issueCodes, []);

  assert.equal(isLifecycleReviewKind("backup_restore"), true);
  assert.equal(isLifecycleReviewKind("record_cleanup"), false);
  assert.equal(isLifecycleReviewStatus("needs_redaction"), true);
  assert.equal(isLifecycleReviewStatus("waiting"), false);
  assert.equal(isLifecycleApprovalDecisionStatus("approved"), true);
  assert.equal(isLifecycleApprovalDecisionStatus("deferred"), false);
  assert.equal(isLifecycleRedactionSeverity("blocking"), true);
  assert.equal(isLifecycleRedactionSeverity("urgent"), false);
}

testReviewReducersAndSummaries();
testRedactionMarkersAndApprovalDecisions();
testBlockedPlansCanBeRejectedButNotApproved();
testStatusSummariesAndImmutability();

console.log("lifecycle review tests passed");
