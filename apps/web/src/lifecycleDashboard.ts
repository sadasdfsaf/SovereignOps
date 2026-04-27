import {
  listLifecycleReviews,
  summarizeLifecycleReviewState,
  type BackupRestoreReview,
  type CompactionPlanReview,
  type LifecycleRedactionMarker,
  type LifecycleRedactionSeverityCounts,
  type LifecycleReview,
  type LifecycleReviewKind,
  type LifecycleReviewState,
  type LifecycleReviewStatus,
  type MigrationPlanReview,
  type SyncReplayReview,
} from "./lifecycleReview.ts";

export const LIFECYCLE_DASHBOARD_SECTION_IDS = [
  "pending_approvals",
  "blocked_redactions",
  "recent_decisions",
  "backup_restore_summary",
  "migration_summary",
  "compaction_readiness",
  "sync_replay_health",
] as const;

export type LifecycleDashboardSectionId =
  (typeof LIFECYCLE_DASHBOARD_SECTION_IDS)[number];

export type LifecycleDashboardQueueId =
  | "pending_approvals"
  | "blocked_redactions"
  | "recent_decisions";

export type LifecycleDashboardStatus =
  | "empty"
  | "ready"
  | "attention"
  | "blocked"
  | "complete";

export interface BuildLifecycleDashboardOptions {
  recentDecisionLimit?: number;
}

export interface LifecycleDashboardViewModel {
  id: "lifecycle_dashboard";
  label: string;
  ariaLabel: string;
  totalReviews: number;
  pendingReviewCount: number;
  blockedReviewCount: number;
  openRedactionCount: number;
  sections: LifecycleDashboardSection[];
}

export interface LifecycleDashboardSection {
  id: LifecycleDashboardSectionId;
  label: string;
  title: string;
  description: string;
  ariaLabel: string;
  status: LifecycleDashboardStatus;
  count: number;
  emptyState: LifecycleDashboardEmptyState;
  cards: LifecycleDashboardCard[];
  queues: LifecycleDashboardQueue[];
}

export interface LifecycleDashboardEmptyState {
  label: string;
  description: string;
  ariaLabel: string;
}

export interface LifecycleDashboardCard {
  id: string;
  label: string;
  value: number;
  valueLabel: string;
  status: LifecycleDashboardStatus;
  helperText: string;
  ariaLabel: string;
}

export interface LifecycleDashboardQueue {
  id: LifecycleDashboardQueueId;
  label: string;
  description: string;
  ariaLabel: string;
  count: number;
  emptyState: LifecycleDashboardEmptyState;
  items: LifecycleDashboardQueueItem[];
}

export interface LifecycleDashboardQueueItem {
  id: string;
  reviewId: string;
  kind: LifecycleReviewKind;
  title: string;
  status: LifecycleReviewStatus;
  label: string;
  ariaLabel: string;
  requestedBy: string;
  createdAt: string;
  updatedAt: string;
  blockerCount: number;
  warningCount: number;
  redactions: LifecycleDashboardRedactionSummary;
  detailLabels: string[];
  decision?: LifecycleDashboardDecisionSummary;
}

export interface LifecycleDashboardDecisionSummary {
  decisionId: string;
  decision: "approved" | "rejected";
  decidedBy: string;
  decidedAt: string;
  label: string;
  ariaLabel: string;
  reason?: string;
}

export interface LifecycleDashboardRedactionSummary {
  total: number;
  open: number;
  resolved: number;
  openBlocking: number;
  bySeverity: LifecycleRedactionSeverityCounts;
  openBySeverity: LifecycleRedactionSeverityCounts;
  markerIds: string[];
  openMarkerIds: string[];
  resolvedMarkerIds: string[];
  openBlockingMarkerIds: string[];
  label: string;
  ariaLabel: string;
}

export function buildLifecycleDashboard(
  state: LifecycleReviewState,
  options: BuildLifecycleDashboardOptions = {},
): LifecycleDashboardViewModel {
  const summary = summarizeLifecycleReviewState(state);
  const sections = buildLifecycleDashboardSections(state, options);

  return {
    id: "lifecycle_dashboard",
    label: "Lifecycle dashboard",
    ariaLabel: [
      "Lifecycle dashboard",
      formatCount(summary.totalReviews, "review"),
      formatCount(summary.pendingReviewIds.length, "pending approval"),
      formatCount(summary.blockedReviewIds.length, "blocked review"),
      formatCount(summary.redactions.open, "open redaction"),
    ].join(", "),
    totalReviews: summary.totalReviews,
    pendingReviewCount: summary.pendingReviewIds.length,
    blockedReviewCount: summary.blockedReviewIds.length,
    openRedactionCount: summary.redactions.open,
    sections,
  };
}

export function buildLifecycleDashboardSections(
  state: LifecycleReviewState,
  options: BuildLifecycleDashboardOptions = {},
): LifecycleDashboardSection[] {
  return [
    buildPendingApprovalsSection(state),
    buildBlockedRedactionsSection(state),
    buildRecentDecisionsSection(state, options),
    buildBackupRestoreSummarySection(state),
    buildMigrationSummarySection(state),
    buildCompactionReadinessSection(state),
    buildSyncReplayHealthSection(state),
  ];
}

export function buildLifecycleDashboardQueues(
  state: LifecycleReviewState,
  options: BuildLifecycleDashboardOptions = {},
): LifecycleDashboardQueue[] {
  return [
    buildPendingApprovalQueue(state),
    buildBlockedRedactionQueue(state),
    buildRecentDecisionQueue(state, options),
  ];
}

export function buildLifecycleDashboardCards(
  state: LifecycleReviewState,
): LifecycleDashboardCard[] {
  return [
    ...buildBackupRestoreSummaryCards(state),
    ...buildMigrationSummaryCards(state),
    ...buildCompactionReadinessCards(state),
    ...buildSyncReplayHealthCards(state),
  ];
}

export function buildPendingApprovalsSection(
  state: LifecycleReviewState,
): LifecycleDashboardSection {
  const queue = buildPendingApprovalQueue(state);
  const card = createCard(
    "pending_approvals.total",
    "Pending approval reviews",
    queue.count,
    queue.count > 0 ? "attention" : "empty",
    "review",
    "Reviews waiting for an approve or reject decision.",
  );

  return createSection({
    id: "pending_approvals",
    label: "Pending approvals",
    title: "Pending approvals",
    description: "Reviews that are not blocked and are ready for a decision.",
    count: queue.count,
    status: queue.count > 0 ? "attention" : "empty",
    emptyState: {
      label: "No pending approvals",
      description: "No lifecycle reviews are currently waiting for a decision.",
      ariaLabel: "No pending lifecycle approvals are waiting for review",
    },
    cards: [card],
    queues: [queue],
  });
}

export function buildBlockedRedactionsSection(
  state: LifecycleReviewState,
): LifecycleDashboardSection {
  const queue = buildBlockedRedactionQueue(state);
  const totalOpen = queue.items.reduce(
    (count, item) => count + item.redactions.open,
    0,
  );
  const totalBlocking = queue.items.reduce(
    (count, item) => count + item.redactions.openBlocking,
    0,
  );

  return createSection({
    id: "blocked_redactions",
    label: "Blocked redactions",
    title: "Blocked redactions",
    description: "Reviews held by open blocking redaction markers.",
    count: queue.count,
    status: queue.count > 0 ? "blocked" : "empty",
    emptyState: {
      label: "No blocked redactions",
      description: "No lifecycle reviews are held by blocking redaction markers.",
      ariaLabel: "No lifecycle reviews are blocked by redaction markers",
    },
    cards: [
      createCard(
        "blocked_redactions.reviews",
        "Reviews blocked by redactions",
        queue.count,
        queue.count > 0 ? "blocked" : "empty",
        "review",
        "Reviews with at least one open blocking redaction marker.",
      ),
      createCard(
        "blocked_redactions.open_markers",
        "Open redaction markers",
        totalOpen,
        totalOpen > 0 ? "attention" : "empty",
        "marker",
        "Open redaction markers attached to redaction-blocked reviews.",
      ),
      createCard(
        "blocked_redactions.blocking_markers",
        "Blocking redaction markers",
        totalBlocking,
        totalBlocking > 0 ? "blocked" : "empty",
        "marker",
        "Open redaction markers that prevent approval.",
      ),
    ],
    queues: [queue],
  });
}

export function buildRecentDecisionsSection(
  state: LifecycleReviewState,
  options: BuildLifecycleDashboardOptions = {},
): LifecycleDashboardSection {
  const queue = buildRecentDecisionQueue(state, options);

  return createSection({
    id: "recent_decisions",
    label: "Recent decisions",
    title: "Recent decisions",
    description: "Most recent approval or rejection decisions.",
    count: queue.count,
    status: queue.count > 0 ? "complete" : "empty",
    emptyState: {
      label: "No recent decisions",
      description: "No lifecycle approval decisions have been recorded.",
      ariaLabel: "No lifecycle approval decisions are available",
    },
    cards: [
      createCard(
        "recent_decisions.total",
        "Recent decisions",
        queue.count,
        queue.count > 0 ? "complete" : "empty",
        "decision",
        "Recorded lifecycle decisions in the recent decision queue.",
      ),
    ],
    queues: [queue],
  });
}

export function buildBackupRestoreSummarySection(
  state: LifecycleReviewState,
): LifecycleDashboardSection {
  const reviews = getBackupRestoreReviews(state);
  const blocked = countBlockedReviews(reviews);
  const pending = countReviewsByStatus(reviews, "pending");

  return createSection({
    id: "backup_restore_summary",
    label: "Backup and restore summary",
    title: "Backup and restore summary",
    description: "Counts backup and restore reviews, payloads, and bytes.",
    count: reviews.length,
    status: getSummaryStatus(reviews.length, blocked, pending),
    emptyState: {
      label: "No backup or restore reviews",
      description: "No backup or restore lifecycle reviews are available.",
      ariaLabel: "No backup or restore lifecycle reviews are available",
    },
    cards: buildBackupRestoreSummaryCards(state),
    queues: [],
  });
}

export function buildMigrationSummarySection(
  state: LifecycleReviewState,
): LifecycleDashboardSection {
  const reviews = getMigrationPlanReviews(state);
  const blocked = countBlockedReviews(reviews);
  const pending = countReviewsByStatus(reviews, "pending");

  return createSection({
    id: "migration_summary",
    label: "Migration summary",
    title: "Migration summary",
    description: "Counts migration reviews, steps, and rollback notes.",
    count: reviews.length,
    status: getSummaryStatus(reviews.length, blocked, pending),
    emptyState: {
      label: "No migration reviews",
      description: "No migration lifecycle reviews are available.",
      ariaLabel: "No migration lifecycle reviews are available",
    },
    cards: buildMigrationSummaryCards(state),
    queues: [],
  });
}

export function buildCompactionReadinessSection(
  state: LifecycleReviewState,
): LifecycleDashboardSection {
  const reviews = getCompactionPlanReviews(state);
  const notReady = reviews.filter((review) => !isCompactionReady(review)).length;
  const ready = reviews.length - notReady;

  return createSection({
    id: "compaction_readiness",
    label: "Compaction readiness",
    title: "Compaction readiness",
    description: "Summarizes compaction plans that are ready or still blocked.",
    count: reviews.length,
    status:
      reviews.length === 0 ? "empty" : notReady > 0 ? "blocked" : "ready",
    emptyState: {
      label: "No compaction reviews",
      description: "No compaction lifecycle reviews are available.",
      ariaLabel: "No compaction lifecycle reviews are available",
    },
    cards: buildCompactionReadinessCards(state, ready, notReady),
    queues: [],
  });
}

export function buildSyncReplayHealthSection(
  state: LifecycleReviewState,
): LifecycleDashboardSection {
  const reviews = getSyncReplayReviews(state);
  const blocked = reviews.filter(
    (review) => review.replayStatus === "blocked" || isBlockedReview(review),
  ).length;
  const degraded = reviews.filter((review) => review.replayStatus === "degraded")
    .length;

  return createSection({
    id: "sync_replay_health",
    label: "Sync replay health",
    title: "Sync replay health",
    description: "Summarizes replay status, event counts, and issue counts.",
    count: reviews.length,
    status:
      reviews.length === 0
        ? "empty"
        : blocked > 0
          ? "blocked"
          : degraded > 0
            ? "attention"
            : "ready",
    emptyState: {
      label: "No sync replay reviews",
      description: "No sync replay lifecycle reviews are available.",
      ariaLabel: "No sync replay lifecycle reviews are available",
    },
    cards: buildSyncReplayHealthCards(state),
    queues: [],
  });
}

export function buildPendingApprovalQueue(
  state: LifecycleReviewState,
): LifecycleDashboardQueue {
  const items = listLifecycleReviews(state)
    .filter((review) => review.status === "pending")
    .sort(compareReviewsByCreatedAt)
    .map((review) => buildReviewQueueItem("pending_approvals", review, state));

  return createQueue({
    id: "pending_approvals",
    label: "Pending approvals",
    description: "Lifecycle reviews ready for approval or rejection.",
    emptyState: {
      label: "No pending approvals",
      description: "No lifecycle reviews are currently ready for a decision.",
      ariaLabel: "No pending lifecycle approvals are available",
    },
    items,
  });
}

export function buildBlockedRedactionQueue(
  state: LifecycleReviewState,
): LifecycleDashboardQueue {
  const items = listLifecycleReviews(state)
    .map((review) => buildReviewQueueItem("blocked_redactions", review, state))
    .filter((item) => item.redactions.openBlocking > 0)
    .sort(compareBlockedRedactionItems);

  return createQueue({
    id: "blocked_redactions",
    label: "Blocked redactions",
    description: "Lifecycle reviews blocked by open blocking redaction markers.",
    emptyState: {
      label: "No blocked redactions",
      description: "No lifecycle reviews are blocked by redaction markers.",
      ariaLabel: "No blocked lifecycle redactions are available",
    },
    items,
  });
}

export function buildRecentDecisionQueue(
  state: LifecycleReviewState,
  options: BuildLifecycleDashboardOptions = {},
): LifecycleDashboardQueue {
  const limit = normalizeLimit(options.recentDecisionLimit, 5);
  const reviewsById = new Map(
    listLifecycleReviews(state).map((review) => [review.id, review]),
  );
  const items = state.approvalDecisions
    .map((decision) => {
      const review = reviewsById.get(decision.reviewId);
      if (!review) {
        return undefined;
      }

      const item = buildReviewQueueItem("recent_decisions", review, state);
      const decisionSummary: LifecycleDashboardDecisionSummary = {
        decisionId: decision.id,
        decision: decision.decision,
        decidedBy: decision.decidedBy,
        decidedAt: decision.decidedAt,
        label: getDecisionStatusLabel(decision.decision),
        ariaLabel: [
          getDecisionStatusLabel(decision.decision),
          `for ${review.title}`,
          `decided at ${decision.decidedAt}`,
        ].join(", "),
      };

      if (decision.reason !== undefined && decision.reason.trim() !== "") {
        decisionSummary.reason = decision.reason;
      }

      item.decision = decisionSummary;
      return item;
    })
    .filter(isDefined)
    .sort(compareDecisionItems)
    .slice(0, limit);

  return createQueue({
    id: "recent_decisions",
    label: "Recent decisions",
    description: "Most recent lifecycle approval decisions.",
    emptyState: {
      label: "No recent decisions",
      description: "No lifecycle approval decisions have been recorded.",
      ariaLabel: "No lifecycle approval decisions are available",
    },
    items,
  });
}

export function buildBackupRestoreSummaryCards(
  state: LifecycleReviewState,
): LifecycleDashboardCard[] {
  const reviews = getBackupRestoreReviews(state);
  const backupCount = reviews.filter((review) => review.operation === "backup")
    .length;
  const restoreCount = reviews.filter((review) => review.operation === "restore")
    .length;
  const payloadCount = reviews.reduce(
    (count, review) => count + review.payloadCount,
    0,
  );
  const totalBytes = reviews.reduce((count, review) => count + review.totalBytes, 0);
  const blocked = countBlockedReviews(reviews);

  return [
    createCard(
      "backup_restore.total",
      "Backup and restore reviews",
      reviews.length,
      reviews.length > 0 ? "complete" : "empty",
      "review",
      "Total backup and restore lifecycle reviews.",
    ),
    createCard(
      "backup_restore.backups",
      "Backup reviews",
      backupCount,
      backupCount > 0 ? "complete" : "empty",
      "review",
      "Lifecycle reviews for backup operations.",
    ),
    createCard(
      "backup_restore.restores",
      "Restore reviews",
      restoreCount,
      restoreCount > 0 ? "complete" : "empty",
      "review",
      "Lifecycle reviews for restore operations.",
    ),
    createCard(
      "backup_restore.blocked",
      "Blocked backup or restore reviews",
      blocked,
      blocked > 0 ? "blocked" : "ready",
      "review",
      "Backup or restore reviews that are blocked or need redaction.",
    ),
    createCard(
      "backup_restore.payloads",
      "Payloads covered",
      payloadCount,
      payloadCount > 0 ? "complete" : "empty",
      "payload",
      "Payload count covered by backup and restore reviews.",
    ),
    createCard(
      "backup_restore.bytes",
      "Bytes covered",
      totalBytes,
      totalBytes > 0 ? "complete" : "empty",
      "byte",
      "Total bytes covered by backup and restore reviews.",
    ),
  ];
}

export function buildMigrationSummaryCards(
  state: LifecycleReviewState,
): LifecycleDashboardCard[] {
  const reviews = getMigrationPlanReviews(state);
  const totalSteps = reviews.reduce((count, review) => count + review.stepCount, 0);
  const rollbackNotes = reviews.reduce(
    (count, review) => count + review.rollbackNotes.length,
    0,
  );
  const pending = countReviewsByStatus(reviews, "pending");
  const blocked = countBlockedReviews(reviews);

  return [
    createCard(
      "migration.total",
      "Migration reviews",
      reviews.length,
      reviews.length > 0 ? "complete" : "empty",
      "review",
      "Total migration lifecycle reviews.",
    ),
    createCard(
      "migration.pending",
      "Pending migration reviews",
      pending,
      pending > 0 ? "attention" : "empty",
      "review",
      "Migration reviews waiting for a decision.",
    ),
    createCard(
      "migration.blocked",
      "Blocked migration reviews",
      blocked,
      blocked > 0 ? "blocked" : "ready",
      "review",
      "Migration reviews that are blocked or need redaction.",
    ),
    createCard(
      "migration.steps",
      "Migration steps",
      totalSteps,
      totalSteps > 0 ? "complete" : "empty",
      "step",
      "Step count covered by migration reviews.",
    ),
    createCard(
      "migration.rollback_notes",
      "Rollback notes",
      rollbackNotes,
      rollbackNotes > 0 ? "complete" : "empty",
      "note",
      "Rollback notes attached to migration reviews.",
    ),
  ];
}

export function buildCompactionReadinessCards(
  state: LifecycleReviewState,
  readyOverride?: number,
  notReadyOverride?: number,
): LifecycleDashboardCard[] {
  const reviews = getCompactionPlanReviews(state);
  const ready =
    readyOverride ?? reviews.filter((review) => isCompactionReady(review)).length;
  const notReady =
    notReadyOverride ?? reviews.filter((review) => !isCompactionReady(review)).length;
  const sourceEvents = reviews.reduce(
    (count, review) => count + review.sourceEventCount,
    0,
  );
  const compactedEvents = reviews.reduce(
    (count, review) => count + review.compactedEventCount,
    0,
  );
  const retainedEvents = reviews.reduce(
    (count, review) => count + review.retainedEventCount,
    0,
  );

  return [
    createCard(
      "compaction.total",
      "Compaction reviews",
      reviews.length,
      reviews.length > 0 ? "complete" : "empty",
      "review",
      "Total compaction lifecycle reviews.",
    ),
    createCard(
      "compaction.ready",
      "Ready compaction reviews",
      ready,
      ready > 0 ? "ready" : "empty",
      "review",
      "Compaction reviews with verified replay and no blocking status.",
    ),
    createCard(
      "compaction.not_ready",
      "Not ready compaction reviews",
      notReady,
      notReady > 0 ? "blocked" : "ready",
      "review",
      "Compaction reviews that still have blockers or unverified replay.",
    ),
    createCard(
      "compaction.source_events",
      "Source events",
      sourceEvents,
      sourceEvents > 0 ? "complete" : "empty",
      "event",
      "Source events covered by compaction reviews.",
    ),
    createCard(
      "compaction.compacted_events",
      "Compacted events",
      compactedEvents,
      compactedEvents > 0 ? "complete" : "empty",
      "event",
      "Events represented after compaction.",
    ),
    createCard(
      "compaction.retained_events",
      "Retained events",
      retainedEvents,
      retainedEvents > 0 ? "complete" : "empty",
      "event",
      "Events retained after compaction.",
    ),
  ];
}

export function buildSyncReplayHealthCards(
  state: LifecycleReviewState,
): LifecycleDashboardCard[] {
  const reviews = getSyncReplayReviews(state);
  const ok = reviews.filter((review) => review.replayStatus === "ok").length;
  const degraded = reviews.filter((review) => review.replayStatus === "degraded")
    .length;
  const blocked = reviews.filter(
    (review) => review.replayStatus === "blocked" || isBlockedReview(review),
  ).length;
  const events = reviews.reduce((count, review) => count + review.eventCount, 0);
  const issues = reviews.reduce((count, review) => count + review.issueCount, 0);

  return [
    createCard(
      "sync_replay.total",
      "Sync replay reviews",
      reviews.length,
      reviews.length > 0 ? "complete" : "empty",
      "review",
      "Total sync replay lifecycle reviews.",
    ),
    createCard(
      "sync_replay.ok",
      "Healthy sync replays",
      ok,
      ok > 0 ? "ready" : "empty",
      "review",
      "Sync replay reviews with healthy replay status.",
    ),
    createCard(
      "sync_replay.degraded",
      "Degraded sync replays",
      degraded,
      degraded > 0 ? "attention" : "empty",
      "review",
      "Sync replay reviews with degraded replay status.",
    ),
    createCard(
      "sync_replay.blocked",
      "Blocked sync replays",
      blocked,
      blocked > 0 ? "blocked" : "ready",
      "review",
      "Sync replay reviews that are blocked or need redaction.",
    ),
    createCard(
      "sync_replay.events",
      "Replayed events",
      events,
      events > 0 ? "complete" : "empty",
      "event",
      "Events covered by sync replay reviews.",
    ),
    createCard(
      "sync_replay.issues",
      "Replay issues",
      issues,
      issues > 0 ? "attention" : "empty",
      "issue",
      "Issues found by sync replay reviews.",
    ),
  ];
}

function buildReviewQueueItem(
  queueId: LifecycleDashboardQueueId,
  review: LifecycleReview,
  state: LifecycleReviewState,
): LifecycleDashboardQueueItem {
  const redactions = summarizeReviewRedactions(state, review.id);
  const statusLabel = getReviewStatusLabel(review.status);
  const kindLabel = getReviewKindLabel(review.kind);

  return {
    id: `${queueId}.${review.id}`,
    reviewId: review.id,
    kind: review.kind,
    title: review.title,
    status: review.status,
    label: `${review.title} (${kindLabel})`,
    ariaLabel: [
      review.title,
      kindLabel,
      statusLabel,
      formatCount(redactions.open, "open redaction"),
      formatCount(review.blockerCount, "blocker"),
      formatCount(review.warningCount, "warning"),
    ].join(", "),
    requestedBy: review.requestedBy,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
    blockerCount: review.blockerCount,
    warningCount: review.warningCount,
    redactions,
    detailLabels: buildReviewDetailLabels(review),
  };
}

function summarizeReviewRedactions(
  state: LifecycleReviewState,
  reviewId: string,
): LifecycleDashboardRedactionSummary {
  const markers = state.redactionMarkers
    .filter((marker) => marker.reviewId === reviewId)
    .slice()
    .sort(compareMarkersByCreatedAt);
  const bySeverity = createSeverityCounts();
  const openBySeverity = createSeverityCounts();
  const markerIds: string[] = [];
  const openMarkerIds: string[] = [];
  const resolvedMarkerIds: string[] = [];
  const openBlockingMarkerIds: string[] = [];

  for (const marker of markers) {
    bySeverity[marker.severity] += 1;
    markerIds.push(marker.id);

    if (marker.status === "open") {
      openBySeverity[marker.severity] += 1;
      openMarkerIds.push(marker.id);
      if (marker.severity === "blocking") {
        openBlockingMarkerIds.push(marker.id);
      }
    } else {
      resolvedMarkerIds.push(marker.id);
    }
  }

  const total = markerIds.length;
  const open = openMarkerIds.length;
  const resolved = resolvedMarkerIds.length;
  const openBlocking = openBlockingMarkerIds.length;

  return {
    total,
    open,
    resolved,
    openBlocking,
    bySeverity,
    openBySeverity,
    markerIds,
    openMarkerIds,
    resolvedMarkerIds,
    openBlockingMarkerIds,
    label: formatCount(total, "redaction marker"),
    ariaLabel: [
      formatCount(total, "redaction marker"),
      formatCount(open, "open marker"),
      formatCount(resolved, "resolved marker"),
      formatCount(openBlocking, "open blocking marker"),
    ].join(", "),
  };
}

function buildReviewDetailLabels(review: LifecycleReview): string[] {
  switch (review.kind) {
    case "backup_restore":
      return buildBackupRestoreDetailLabels(review);
    case "migration_plan":
      return [
        `Version change: ${review.sourceVersion} to ${review.targetVersion}`,
        formatCount(review.stepCount, "migration step"),
        formatCount(review.rollbackNotes.length, "rollback note"),
      ];
    case "sync_replay":
      return [
        `Replay health: ${review.replayStatus}`,
        formatCount(review.eventCount, "replayed event"),
        formatCount(review.issueCount, "replay issue"),
      ];
    case "compaction_plan":
      return [
        `Sequence range: ${review.fromSequence} to ${review.toSequence}`,
        `Replay verified: ${review.replayVerified ? "yes" : "no"}`,
        formatCount(review.sourceEventCount, "source event"),
        formatCount(review.compactedEventCount, "compacted event"),
        formatCount(review.retainedEventCount, "retained event"),
      ];
  }
}

function buildBackupRestoreDetailLabels(review: BackupRestoreReview): string[] {
  const labels = [
    `Operation: ${review.operation}`,
    formatCount(review.payloadCount, "payload"),
    formatCount(review.totalBytes, "byte"),
  ];

  if (review.restoreMode !== undefined) {
    labels.push(`Restore mode: ${review.restoreMode}`);
  }

  return labels;
}

function createSection(input: {
  id: LifecycleDashboardSectionId;
  label: string;
  title: string;
  description: string;
  status: LifecycleDashboardStatus;
  count: number;
  emptyState: LifecycleDashboardEmptyState;
  cards: LifecycleDashboardCard[];
  queues: LifecycleDashboardQueue[];
}): LifecycleDashboardSection {
  return {
    ...input,
    ariaLabel: [
      input.label,
      formatCount(input.count, "item"),
      `status ${input.status}`,
    ].join(", "),
    cards: input.cards.map(cloneCard),
    queues: input.queues.map(cloneQueue),
  };
}

function createQueue(input: {
  id: LifecycleDashboardQueueId;
  label: string;
  description: string;
  emptyState: LifecycleDashboardEmptyState;
  items: LifecycleDashboardQueueItem[];
}): LifecycleDashboardQueue {
  return {
    ...input,
    ariaLabel: `${input.label}: ${formatCount(input.items.length, "item")}`,
    count: input.items.length,
    items: input.items.map(cloneQueueItem),
  };
}

function createCard(
  id: string,
  label: string,
  value: number,
  status: LifecycleDashboardStatus,
  unitSingular: string,
  helperText: string,
  unitPlural?: string,
): LifecycleDashboardCard {
  const valueLabel = formatCount(value, unitSingular, unitPlural);

  return {
    id,
    label,
    value,
    valueLabel,
    status,
    helperText,
    ariaLabel: `${label}: ${valueLabel}. ${helperText}`,
  };
}

function getBackupRestoreReviews(
  state: LifecycleReviewState,
): BackupRestoreReview[] {
  return listLifecycleReviews(state).filter(
    (review): review is BackupRestoreReview => review.kind === "backup_restore",
  );
}

function getMigrationPlanReviews(
  state: LifecycleReviewState,
): MigrationPlanReview[] {
  return listLifecycleReviews(state).filter(
    (review): review is MigrationPlanReview => review.kind === "migration_plan",
  );
}

function getCompactionPlanReviews(
  state: LifecycleReviewState,
): CompactionPlanReview[] {
  return listLifecycleReviews(state).filter(
    (review): review is CompactionPlanReview => review.kind === "compaction_plan",
  );
}

function getSyncReplayReviews(state: LifecycleReviewState): SyncReplayReview[] {
  return listLifecycleReviews(state).filter(
    (review): review is SyncReplayReview => review.kind === "sync_replay",
  );
}

function getSummaryStatus(
  total: number,
  blocked: number,
  pending: number,
): LifecycleDashboardStatus {
  if (total === 0) {
    return "empty";
  }
  if (blocked > 0) {
    return "blocked";
  }
  if (pending > 0) {
    return "attention";
  }
  return "complete";
}

function isCompactionReady(review: CompactionPlanReview): boolean {
  return review.replayVerified && !isBlockedReview(review);
}

function isBlockedReview(review: LifecycleReview): boolean {
  return review.status === "blocked" || review.status === "needs_redaction";
}

function countBlockedReviews(reviews: readonly LifecycleReview[]): number {
  return reviews.filter(isBlockedReview).length;
}

function countReviewsByStatus(
  reviews: readonly LifecycleReview[],
  status: LifecycleReviewStatus,
): number {
  return reviews.filter((review) => review.status === status).length;
}

function compareReviewsByCreatedAt(
  left: LifecycleReview,
  right: LifecycleReview,
): number {
  return (
    compareTimestamps(left.createdAt, right.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

function compareBlockedRedactionItems(
  left: LifecycleDashboardQueueItem,
  right: LifecycleDashboardQueueItem,
): number {
  return (
    right.redactions.openBlocking - left.redactions.openBlocking ||
    compareTimestamps(left.updatedAt, right.updatedAt) ||
    left.reviewId.localeCompare(right.reviewId)
  );
}

function compareDecisionItems(
  left: LifecycleDashboardQueueItem,
  right: LifecycleDashboardQueueItem,
): number {
  const leftDecisionAt = left.decision?.decidedAt ?? left.updatedAt;
  const rightDecisionAt = right.decision?.decidedAt ?? right.updatedAt;

  return (
    compareTimestamps(rightDecisionAt, leftDecisionAt) ||
    left.reviewId.localeCompare(right.reviewId)
  );
}

function compareMarkersByCreatedAt(
  left: LifecycleRedactionMarker,
  right: LifecycleRedactionMarker,
): number {
  return (
    compareTimestamps(left.createdAt, right.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

function compareTimestamps(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
    throw new Error("timestamps must be valid");
  }

  return leftTime - rightTime || left.localeCompare(right);
}

function getReviewKindLabel(kind: LifecycleReviewKind): string {
  switch (kind) {
    case "backup_restore":
      return "Backup and restore";
    case "migration_plan":
      return "Migration plan";
    case "sync_replay":
      return "Sync replay";
    case "compaction_plan":
      return "Compaction plan";
  }
}

function getReviewStatusLabel(status: LifecycleReviewStatus): string {
  switch (status) {
    case "pending":
      return "Pending approval";
    case "needs_redaction":
      return "Blocked by redaction";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "blocked":
      return "Blocked";
  }
}

function getDecisionStatusLabel(decision: "approved" | "rejected"): string {
  switch (decision) {
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
  }
}

function createSeverityCounts(): LifecycleRedactionSeverityCounts {
  return {
    info: 0,
    warning: 0,
    blocking: 0,
  };
}

function normalizeLimit(value: number | undefined, defaultValue: number): number {
  if (value === undefined) {
    return defaultValue;
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("recentDecisionLimit must be a non-negative integer");
  }
  return value;
}

function formatCount(
  value: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function cloneCard(card: LifecycleDashboardCard): LifecycleDashboardCard {
  return { ...card };
}

function cloneQueue(queue: LifecycleDashboardQueue): LifecycleDashboardQueue {
  return {
    ...queue,
    emptyState: { ...queue.emptyState },
    items: queue.items.map(cloneQueueItem),
  };
}

function cloneQueueItem(
  item: LifecycleDashboardQueueItem,
): LifecycleDashboardQueueItem {
  const copy: LifecycleDashboardQueueItem = {
    ...item,
    redactions: cloneRedactionSummary(item.redactions),
    detailLabels: [...item.detailLabels],
  };

  if (item.decision !== undefined) {
    copy.decision = { ...item.decision };
  }

  return copy;
}

function cloneRedactionSummary(
  summary: LifecycleDashboardRedactionSummary,
): LifecycleDashboardRedactionSummary {
  return {
    ...summary,
    bySeverity: { ...summary.bySeverity },
    openBySeverity: { ...summary.openBySeverity },
    markerIds: [...summary.markerIds],
    openMarkerIds: [...summary.openMarkerIds],
    resolvedMarkerIds: [...summary.resolvedMarkerIds],
    openBlockingMarkerIds: [...summary.openBlockingMarkerIds],
  };
}

function isDefined<TValue>(value: TValue | undefined): value is TValue {
  return value !== undefined;
}
