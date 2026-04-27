import assert from "node:assert/strict";

import {
  addBackupRestoreReview,
  addCompactionPlanReview,
  addLifecycleRedactionMarker,
  addMigrationPlanReview,
  addSyncReplayReview,
  buildBackupRestoreSummaryCards,
  buildBlockedRedactionQueue,
  buildCompactionReadinessCards,
  buildLifecycleDashboard,
  buildLifecycleDashboardCards,
  buildLifecycleDashboardQueues,
  buildLifecycleDashboardSections,
  buildMigrationSummaryCards,
  buildPendingApprovalQueue,
  buildRecentDecisionQueue,
  buildSyncReplayHealthCards,
  createLifecycleReviewState,
  decideLifecycleReview,
  resolveLifecycleRedactionMarker,
} from "../src/main.ts";

const timestamps = {
  backupCreated: "2026-04-27T01:00:00.000Z",
  rejectedMigrationCreated: "2026-04-27T01:05:00.000Z",
  pendingMigrationCreated: "2026-04-27T02:00:00.000Z",
  syncCreated: "2026-04-27T02:05:00.000Z",
  syncRedaction: "2026-04-27T02:06:00.000Z",
  restoreBlockedCreated: "2026-04-27T02:10:00.000Z",
  restoreBlockingRedaction: "2026-04-27T02:11:00.000Z",
  restoreWarningRedaction: "2026-04-27T02:12:00.000Z",
  restoreWarningResolved: "2026-04-27T02:13:00.000Z",
  restorePriorityCreated: "2026-04-27T02:14:00.000Z",
  restorePriorityFirstRedaction: "2026-04-27T02:15:00.000Z",
  restorePrioritySecondRedaction: "2026-04-27T02:16:00.000Z",
  compactionCreated: "2026-04-27T02:20:00.000Z",
  backupDecided: "2026-04-27T03:00:00.000Z",
  migrationDecided: "2026-04-27T03:10:00.000Z",
};

function testDashboardQueuesAndSorting() {
  const state = buildDashboardFixture();
  const dashboard = buildLifecycleDashboard(state, { recentDecisionLimit: 10 });
  const queues = buildLifecycleDashboardQueues(state, { recentDecisionLimit: 10 });

  assert.equal(dashboard.totalReviews, 7);
  assert.equal(dashboard.pendingReviewCount, 2);
  assert.equal(dashboard.blockedReviewCount, 3);
  assert.equal(dashboard.openRedactionCount, 4);
  assert.deepEqual(
    dashboard.sections.map((section) => section.id),
    [
      "pending_approvals",
      "blocked_redactions",
      "recent_decisions",
      "backup_restore_summary",
      "migration_summary",
      "compaction_readiness",
      "sync_replay_health",
    ],
  );
  assert.match(dashboard.ariaLabel, /2 pending approvals/);

  const pending = getQueue(queues, "pending_approvals");
  assert.equal(pending.count, 2);
  assert.deepEqual(
    pending.items.map((item) => item.reviewId),
    ["lcr_migration_pending", "lcr_sync_pending_warning"],
  );
  assert.deepEqual(
    pending.items.map((item) => item.status),
    ["pending", "pending"],
  );
  assert.equal(pending.items[1].redactions.open, 1);
  assert.equal(pending.items[1].redactions.openBlocking, 0);
  assert.match(pending.items[0].ariaLabel, /Pending approval/);

  const blocked = getQueue(queues, "blocked_redactions");
  assert.equal(blocked.count, 2);
  assert.deepEqual(
    blocked.items.map((item) => item.reviewId),
    ["lcr_restore_priority_blocked", "lcr_restore_redaction_blocked"],
  );
  assert.deepEqual(
    blocked.items.map((item) => item.status),
    ["needs_redaction", "needs_redaction"],
  );
  assert.equal(blocked.items[0].redactions.openBlocking, 2);
  assert.equal(blocked.items[1].redactions.total, 2);
  assert.equal(blocked.items[1].redactions.open, 1);
  assert.equal(blocked.items[1].redactions.resolved, 1);
  assert.deepEqual(blocked.items[1].redactions.bySeverity, {
    info: 0,
    warning: 1,
    blocking: 1,
  });
  assert.deepEqual(blocked.items[1].redactions.openBySeverity, {
    info: 0,
    warning: 0,
    blocking: 1,
  });
  assert.deepEqual(blocked.items[1].redactions.openBlockingMarkerIds, [
    "red_restore_blocking",
  ]);

  const recent = getQueue(queues, "recent_decisions");
  assert.deepEqual(
    recent.items.map((item) => item.reviewId),
    ["lcr_migration_rejected", "lcr_backup_complete"],
  );
  assert.deepEqual(
    recent.items.map((item) => item.decision.decision),
    ["rejected", "approved"],
  );
  assert.deepEqual(
    buildRecentDecisionQueue(state, { recentDecisionLimit: 1 }).items.map(
      (item) => item.reviewId,
    ),
    ["lcr_migration_rejected"],
  );
}

function testDashboardSectionsAndCards() {
  const state = buildDashboardFixture();
  const sections = buildLifecycleDashboardSections(state, {
    recentDecisionLimit: 10,
  });

  assert.equal(getSection(sections, "pending_approvals").status, "attention");
  assert.equal(getSection(sections, "blocked_redactions").status, "blocked");
  assert.equal(getSection(sections, "recent_decisions").count, 2);
  assert.equal(getSection(sections, "compaction_readiness").status, "blocked");
  assert.equal(getSection(sections, "sync_replay_health").status, "attention");

  const backupCards = cardMap(buildBackupRestoreSummaryCards(state));
  assert.equal(backupCards.get("backup_restore.total").value, 3);
  assert.equal(backupCards.get("backup_restore.backups").value, 1);
  assert.equal(backupCards.get("backup_restore.restores").value, 2);
  assert.equal(backupCards.get("backup_restore.blocked").value, 2);
  assert.equal(backupCards.get("backup_restore.payloads").value, 7);
  assert.equal(backupCards.get("backup_restore.bytes").value, 1664);
  assert.match(backupCards.get("backup_restore.bytes").ariaLabel, /1664 bytes/);

  const migrationCards = cardMap(buildMigrationSummaryCards(state));
  assert.equal(migrationCards.get("migration.total").value, 2);
  assert.equal(migrationCards.get("migration.pending").value, 1);
  assert.equal(migrationCards.get("migration.blocked").value, 0);
  assert.equal(migrationCards.get("migration.steps").value, 5);
  assert.equal(migrationCards.get("migration.rollback_notes").value, 1);

  const compactionCards = cardMap(buildCompactionReadinessCards(state));
  assert.equal(compactionCards.get("compaction.total").value, 1);
  assert.equal(compactionCards.get("compaction.ready").value, 0);
  assert.equal(compactionCards.get("compaction.not_ready").value, 1);
  assert.equal(compactionCards.get("compaction.source_events").value, 12);
  assert.equal(compactionCards.get("compaction.compacted_events").value, 7);
  assert.equal(compactionCards.get("compaction.retained_events").value, 5);

  const syncCards = cardMap(buildSyncReplayHealthCards(state));
  assert.equal(syncCards.get("sync_replay.total").value, 1);
  assert.equal(syncCards.get("sync_replay.ok").value, 0);
  assert.equal(syncCards.get("sync_replay.degraded").value, 1);
  assert.equal(syncCards.get("sync_replay.blocked").value, 0);
  assert.equal(syncCards.get("sync_replay.events").value, 4);
  assert.equal(syncCards.get("sync_replay.issues").value, 1);

  const allCards = cardMap(buildLifecycleDashboardCards(state));
  assert.equal(allCards.get("sync_replay.issues").status, "attention");
  assert.equal(allCards.get("backup_restore.blocked").status, "blocked");
}

function testEmptyStateOutput() {
  const state = createLifecycleReviewState();
  const dashboard = buildLifecycleDashboard(state);
  const queues = buildLifecycleDashboardQueues(state);
  const sections = buildLifecycleDashboardSections(state);

  assert.equal(dashboard.totalReviews, 0);
  assert.equal(dashboard.pendingReviewCount, 0);
  assert.equal(dashboard.blockedReviewCount, 0);
  assert.equal(dashboard.openRedactionCount, 0);

  for (const section of sections) {
    assert.equal(section.status, "empty");
    assert.equal(section.count, 0);
    assert.notEqual(section.emptyState.label.trim(), "");
    assert.notEqual(section.emptyState.ariaLabel.trim(), "");
    assert.notEqual(section.ariaLabel.trim(), "");
  }

  for (const queue of queues) {
    assert.equal(queue.count, 0);
    assert.deepEqual(queue.items, []);
    assert.notEqual(queue.emptyState.label.trim(), "");
    assert.notEqual(queue.emptyState.ariaLabel.trim(), "");
  }

  assert.equal(
    getSection(sections, "pending_approvals").emptyState.label,
    "No pending approvals",
  );
  assert.equal(
    getSection(sections, "blocked_redactions").emptyState.label,
    "No blocked redactions",
  );
  assert.equal(
    cardMap(buildBackupRestoreSummaryCards(state)).get("backup_restore.total")
      .value,
    0,
  );
  assert.equal(
    cardMap(buildSyncReplayHealthCards(state)).get("sync_replay.total").value,
    0,
  );
}

function testQueueBuilderOutputIsIndependent() {
  const state = buildDashboardFixture();
  const pending = buildPendingApprovalQueue(state);
  pending.items[0].detailLabels.push("mutated");
  pending.items[1].redactions.openMarkerIds.push("mutated");

  const pendingAgain = buildPendingApprovalQueue(state);
  assert.deepEqual(pendingAgain.items[0].detailLabels, [
    "Version change: 1 to 2",
    "3 migration steps",
    "0 rollback notes",
  ]);
  assert.deepEqual(pendingAgain.items[1].redactions.openMarkerIds, [
    "red_sync_warning",
  ]);

  const blocked = buildBlockedRedactionQueue(state);
  blocked.items[0].redactions.bySeverity.blocking = 0;
  assert.equal(
    buildBlockedRedactionQueue(state).items[0].redactions.bySeverity.blocking,
    2,
  );
}

function buildDashboardFixture() {
  let state = createLifecycleReviewState();

  state = addBackupRestoreReview(state, {
    id: "lcr_backup_complete",
    workspaceId: "wsp_alpha",
    title: "Review backup package",
    requestedBy: "act_mira",
    createdAt: timestamps.backupCreated,
    operation: "backup",
    backupId: "bkp_notes_complete",
    manifestFingerprint: "fp_backup_complete",
    payloadCount: 1,
    totalBytes: 128,
  });
  state = decideLifecycleReview(state, {
    id: "dec_backup_approved",
    reviewId: "lcr_backup_complete",
    decision: "approved",
    decidedBy: "act_reviewer",
    decidedAt: timestamps.backupDecided,
    reason: "Backup package checks passed.",
  });

  state = addMigrationPlanReview(state, {
    id: "lcr_migration_rejected",
    workspaceId: "wsp_alpha",
    title: "Review rejected migration",
    requestedBy: "act_sol",
    createdAt: timestamps.rejectedMigrationCreated,
    sourceVersion: 1,
    targetVersion: 3,
    stepIds: ["metadata.v2", "metadata.v3"],
    rollbackNotes: ["Return to the prior metadata snapshot."],
    planFingerprint: "fp_migration_rejected",
  });
  state = decideLifecycleReview(state, {
    id: "dec_migration_rejected",
    reviewId: "lcr_migration_rejected",
    decision: "rejected",
    decidedBy: "act_reviewer",
    decidedAt: timestamps.migrationDecided,
    reason: "Needs a smaller step set.",
  });

  state = addMigrationPlanReview(state, {
    id: "lcr_migration_pending",
    workspaceId: "wsp_alpha",
    title: "Review pending migration",
    requestedBy: "act_sol",
    createdAt: timestamps.pendingMigrationCreated,
    sourceVersion: 1,
    targetVersion: 2,
    stepIds: ["metadata.v2", "index.v2", "search.v2"],
    planFingerprint: "fp_migration_pending",
  });

  state = addSyncReplayReview(state, {
    id: "lcr_sync_pending_warning",
    workspaceId: "wsp_alpha",
    title: "Review sync replay warning",
    requestedBy: "act_rin",
    createdAt: timestamps.syncCreated,
    afterCursor: "cur:0000000000000001:evt_alpha",
    nextCursor: "cur:0000000000000005:evt_echo",
    eventCount: 4,
    issueCount: 1,
    replayStatus: "degraded",
    issueCodes: ["duplicate_event"],
  });
  state = addLifecycleRedactionMarker(state, {
    id: "red_sync_warning",
    reviewId: "lcr_sync_pending_warning",
    path: "$.details.message",
    reason: "Message detail should stay summarized.",
    marker: "[redacted:summary]",
    severity: "warning",
    createdBy: "act_reviewer",
    createdAt: timestamps.syncRedaction,
  });

  state = addBackupRestoreReview(state, {
    id: "lcr_restore_redaction_blocked",
    workspaceId: "wsp_alpha",
    title: "Review restore with redactions",
    requestedBy: "act_mira",
    createdAt: timestamps.restoreBlockedCreated,
    operation: "restore",
    backupId: "bkp_restore_blocked",
    manifestFingerprint: "fp_restore_blocked",
    payloadCount: 2,
    totalBytes: 512,
    restoreMode: "merge",
  });
  state = addLifecycleRedactionMarker(state, {
    id: "red_restore_blocking",
    reviewId: "lcr_restore_redaction_blocked",
    path: "$.payloads[0].path",
    reason: "Path should be masked before review.",
    marker: "[redacted:path]",
    severity: "blocking",
    createdBy: "act_reviewer",
    createdAt: timestamps.restoreBlockingRedaction,
  });
  state = addLifecycleRedactionMarker(state, {
    id: "red_restore_warning",
    reviewId: "lcr_restore_redaction_blocked",
    path: "$.payloads[1].note",
    reason: "Note should stay summarized.",
    marker: "[redacted:note]",
    severity: "warning",
    createdBy: "act_reviewer",
    createdAt: timestamps.restoreWarningRedaction,
  });
  state = resolveLifecycleRedactionMarker(
    state,
    "red_restore_warning",
    "act_reviewer",
    timestamps.restoreWarningResolved,
  );

  state = addBackupRestoreReview(state, {
    id: "lcr_restore_priority_blocked",
    workspaceId: "wsp_alpha",
    title: "Review restore with more redactions",
    requestedBy: "act_mira",
    createdAt: timestamps.restorePriorityCreated,
    operation: "restore",
    backupId: "bkp_restore_priority",
    manifestFingerprint: "fp_restore_priority",
    payloadCount: 4,
    totalBytes: 1024,
    restoreMode: "replace",
  });
  state = addLifecycleRedactionMarker(state, {
    id: "red_restore_priority_first",
    reviewId: "lcr_restore_priority_blocked",
    path: "$.payloads[0].path",
    reason: "Path should be masked before review.",
    marker: "[redacted:path]",
    severity: "blocking",
    createdBy: "act_reviewer",
    createdAt: timestamps.restorePriorityFirstRedaction,
  });
  state = addLifecycleRedactionMarker(state, {
    id: "red_restore_priority_second",
    reviewId: "lcr_restore_priority_blocked",
    path: "$.payloads[1].path",
    reason: "Path should be masked before review.",
    marker: "[redacted:path]",
    severity: "blocking",
    createdBy: "act_reviewer",
    createdAt: timestamps.restorePrioritySecondRedaction,
  });

  state = addCompactionPlanReview(state, {
    id: "lcr_compaction_blocked",
    workspaceId: "wsp_alpha",
    title: "Review compaction readiness",
    requestedBy: "act_ren",
    createdAt: timestamps.compactionCreated,
    streamId: "stream_notes",
    fromSequence: 1,
    toSequence: 12,
    sourceEventCount: 12,
    compactedEventCount: 7,
    retainedEventCount: 5,
    replayVerified: false,
    planFingerprint: "fp_compaction_blocked",
  });

  return state;
}

function getQueue(queues, queueId) {
  const queue = queues.find((item) => item.id === queueId);
  assert.ok(queue, `missing queue ${queueId}`);
  return queue;
}

function getSection(sections, sectionId) {
  const section = sections.find((item) => item.id === sectionId);
  assert.ok(section, `missing section ${sectionId}`);
  return section;
}

function cardMap(cards) {
  return new Map(cards.map((card) => [card.id, card]));
}

testDashboardQueuesAndSorting();
testDashboardSectionsAndCards();
testEmptyStateOutput();
testQueueBuilderOutputIsIndependent();

console.log("lifecycle dashboard tests passed");
