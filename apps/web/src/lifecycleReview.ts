import type { WorkspaceId } from "./localStore.ts";

export const LIFECYCLE_REVIEW_KINDS = [
  "backup_restore",
  "migration_plan",
  "sync_replay",
  "compaction_plan",
] as const;

export type LifecycleReviewKind = (typeof LIFECYCLE_REVIEW_KINDS)[number];

export const LIFECYCLE_REVIEW_STATUSES = [
  "pending",
  "needs_redaction",
  "approved",
  "rejected",
  "blocked",
] as const;

export type LifecycleReviewStatus = (typeof LIFECYCLE_REVIEW_STATUSES)[number];

export const LIFECYCLE_APPROVAL_DECISIONS = ["approved", "rejected"] as const;

export type LifecycleApprovalDecisionStatus =
  (typeof LIFECYCLE_APPROVAL_DECISIONS)[number];

export const LIFECYCLE_REDACTION_SEVERITIES = [
  "info",
  "warning",
  "blocking",
] as const;

export type LifecycleRedactionSeverity =
  (typeof LIFECYCLE_REDACTION_SEVERITIES)[number];

export const LIFECYCLE_REDACTION_STATUSES = ["open", "resolved"] as const;

export type LifecycleRedactionStatus =
  (typeof LIFECYCLE_REDACTION_STATUSES)[number];

export type BackupRestoreOperation = "backup" | "restore";
export type RestoreReviewMode = "preview" | "merge" | "replace";

export interface LifecycleReviewBase {
  id: string;
  workspaceId: WorkspaceId;
  kind: LifecycleReviewKind;
  title: string;
  requestedBy: string;
  createdAt: string;
  updatedAt: string;
  status: LifecycleReviewStatus;
  blockerCount: number;
  warningCount: number;
  reviewerRoles: string[];
  redactionMarkerIds: string[];
  decisionId?: string;
}

export interface BackupRestoreReview extends LifecycleReviewBase {
  kind: "backup_restore";
  operation: BackupRestoreOperation;
  backupId: string;
  manifestFingerprint: string;
  payloadCount: number;
  totalBytes: number;
  restoreMode?: RestoreReviewMode;
  targetWorkspaceId?: WorkspaceId;
}

export interface MigrationPlanReview extends LifecycleReviewBase {
  kind: "migration_plan";
  sourceVersion: number;
  targetVersion: number;
  stepCount: number;
  stepIds: string[];
  rollbackNotes: string[];
  planFingerprint: string;
}

export interface SyncReplayReview extends LifecycleReviewBase {
  kind: "sync_replay";
  afterCursor: string;
  nextCursor: string;
  eventCount: number;
  issueCount: number;
  replayStatus: "ok" | "degraded" | "blocked";
  issueCodes: string[];
}

export interface CompactionPlanReview extends LifecycleReviewBase {
  kind: "compaction_plan";
  streamId: string;
  fromSequence: number;
  toSequence: number;
  sourceEventCount: number;
  compactedEventCount: number;
  retainedEventCount: number;
  checkpointCount: number;
  replayVerified: boolean;
  planFingerprint: string;
}

export type LifecycleReview =
  | BackupRestoreReview
  | MigrationPlanReview
  | SyncReplayReview
  | CompactionPlanReview;

export interface LifecycleReviewInputBase {
  id: string;
  workspaceId: WorkspaceId;
  title: string;
  requestedBy: string;
  createdAt?: string;
  updatedAt?: string;
  blockerCount?: number;
  warningCount?: number;
  reviewerRoles?: readonly string[];
}

export interface BackupRestoreReviewInput extends LifecycleReviewInputBase {
  operation: BackupRestoreOperation;
  backupId: string;
  manifestFingerprint: string;
  payloadCount: number;
  totalBytes?: number;
  restoreMode?: RestoreReviewMode;
  targetWorkspaceId?: WorkspaceId;
}

export interface MigrationPlanReviewInput extends LifecycleReviewInputBase {
  sourceVersion: number;
  targetVersion: number;
  stepIds: readonly string[];
  rollbackNotes?: readonly string[];
  planFingerprint: string;
}

export interface SyncReplayReviewInput extends LifecycleReviewInputBase {
  afterCursor: string;
  nextCursor: string;
  eventCount: number;
  issueCount?: number;
  replayStatus?: "ok" | "degraded" | "blocked";
  issueCodes?: readonly string[];
}

export interface CompactionPlanReviewInput extends LifecycleReviewInputBase {
  streamId: string;
  fromSequence: number;
  toSequence: number;
  sourceEventCount: number;
  compactedEventCount: number;
  retainedEventCount: number;
  checkpointCount?: number;
  replayVerified: boolean;
  planFingerprint: string;
}

export interface LifecycleApprovalDecisionInput {
  id: string;
  reviewId: string;
  decision: LifecycleApprovalDecisionStatus;
  decidedBy: string;
  decidedAt: string;
  reason?: string;
}

export interface LifecycleApprovalDecision extends LifecycleApprovalDecisionInput {}

export interface LifecycleRedactionMarkerInput {
  id: string;
  reviewId: string;
  path: string;
  reason: string;
  marker: string;
  severity?: LifecycleRedactionSeverity;
  createdBy: string;
  createdAt: string;
}

export interface LifecycleRedactionMarker
  extends LifecycleRedactionMarkerInput {
  severity: LifecycleRedactionSeverity;
  status: LifecycleRedactionStatus;
  resolvedBy?: string;
  resolvedAt?: string;
}

export interface LifecycleReviewState {
  backupRestoreReviews: BackupRestoreReview[];
  migrationPlanReviews: MigrationPlanReview[];
  syncReplayReviews: SyncReplayReview[];
  compactionPlanReviews: CompactionPlanReview[];
  approvalDecisions: LifecycleApprovalDecision[];
  redactionMarkers: LifecycleRedactionMarker[];
}

export interface CreateLifecycleReviewStateInput {
  backupRestoreReviews?: readonly BackupRestoreReview[];
  migrationPlanReviews?: readonly MigrationPlanReview[];
  syncReplayReviews?: readonly SyncReplayReview[];
  compactionPlanReviews?: readonly CompactionPlanReview[];
  approvalDecisions?: readonly LifecycleApprovalDecision[];
  redactionMarkers?: readonly LifecycleRedactionMarker[];
}

export type LifecycleReviewReducerAction =
  | { type: "backup_restore.add"; review: BackupRestoreReviewInput }
  | { type: "migration_plan.add"; review: MigrationPlanReviewInput }
  | { type: "sync_replay.add"; review: SyncReplayReviewInput }
  | { type: "compaction_plan.add"; review: CompactionPlanReviewInput }
  | { type: "review.decide"; decision: LifecycleApprovalDecisionInput }
  | { type: "redaction.add"; marker: LifecycleRedactionMarkerInput }
  | {
      type: "redaction.resolve";
      markerId: string;
      resolvedBy: string;
      resolvedAt: string;
    };

export type LifecycleKindCounts = Record<LifecycleReviewKind, number>;
export type LifecycleStatusCounts = Record<LifecycleReviewStatus, number>;
export type LifecycleDecisionCounts = Record<LifecycleApprovalDecisionStatus, number>;
export type LifecycleRedactionSeverityCounts = Record<
  LifecycleRedactionSeverity,
  number
>;

export interface LifecycleRedactionSummary {
  total: number;
  open: number;
  resolved: number;
  openBlocking: number;
  bySeverity: LifecycleRedactionSeverityCounts;
}

export interface LifecycleReviewSummary {
  totalReviews: number;
  byKind: LifecycleKindCounts;
  byStatus: LifecycleStatusCounts;
  pendingReviewIds: string[];
  blockedReviewIds: string[];
  approvedReviewIds: string[];
  rejectedReviewIds: string[];
  decisions: {
    total: number;
    byDecision: LifecycleDecisionCounts;
  };
  redactions: LifecycleRedactionSummary;
}

export interface LifecycleReviewStatusSummary {
  reviewId: string;
  kind: LifecycleReviewKind;
  status: LifecycleReviewStatus;
  blockerCount: number;
  warningCount: number;
  openRedactionCount: number;
  openBlockingRedactionCount: number;
  decision?: LifecycleApprovalDecisionStatus;
}

const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";

export function createLifecycleReviewState(
  input: CreateLifecycleReviewStateInput = {},
): LifecycleReviewState {
  return normalizeLifecycleReviewState({
    backupRestoreReviews: [...(input.backupRestoreReviews ?? [])],
    migrationPlanReviews: [...(input.migrationPlanReviews ?? [])],
    syncReplayReviews: [...(input.syncReplayReviews ?? [])],
    compactionPlanReviews: [...(input.compactionPlanReviews ?? [])],
    approvalDecisions: [...(input.approvalDecisions ?? [])],
    redactionMarkers: [...(input.redactionMarkers ?? [])],
  });
}

export function lifecycleReviewReducer(
  state: LifecycleReviewState,
  action: LifecycleReviewReducerAction,
): LifecycleReviewState {
  switch (action.type) {
    case "backup_restore.add":
      return addBackupRestoreReview(state, action.review);
    case "migration_plan.add":
      return addMigrationPlanReview(state, action.review);
    case "sync_replay.add":
      return addSyncReplayReview(state, action.review);
    case "compaction_plan.add":
      return addCompactionPlanReview(state, action.review);
    case "review.decide":
      return decideLifecycleReview(state, action.decision);
    case "redaction.add":
      return addLifecycleRedactionMarker(state, action.marker);
    case "redaction.resolve":
      return resolveLifecycleRedactionMarker(
        state,
        action.markerId,
        action.resolvedBy,
        action.resolvedAt,
      );
  }
}

export function addBackupRestoreReview(
  state: LifecycleReviewState,
  input: BackupRestoreReviewInput,
): LifecycleReviewState {
  assertUniqueReviewId(state, input.id);
  assertBackupRestoreOperation(input.operation);
  if (input.restoreMode !== undefined) {
    assertRestoreMode(input.restoreMode);
  }

  const review: BackupRestoreReview = {
    ...createBaseReview(input, "backup_restore"),
    kind: "backup_restore",
    operation: input.operation,
    backupId: normalizeRequiredText(input.backupId, "backup id"),
    manifestFingerprint: normalizeRequiredText(
      input.manifestFingerprint,
      "manifest fingerprint",
    ),
    payloadCount: normalizeNonNegativeInteger(input.payloadCount, "payloadCount"),
    totalBytes: normalizeNonNegativeInteger(input.totalBytes ?? 0, "totalBytes"),
  };

  if (input.restoreMode !== undefined) {
    review.restoreMode = input.restoreMode;
  }
  if (input.targetWorkspaceId !== undefined) {
    review.targetWorkspaceId = input.targetWorkspaceId;
  }

  const next = cloneLifecycleReviewState(state);
  next.backupRestoreReviews.push(review);
  return recalculateLifecycleReviewState(next);
}

export function addMigrationPlanReview(
  state: LifecycleReviewState,
  input: MigrationPlanReviewInput,
): LifecycleReviewState {
  assertUniqueReviewId(state, input.id);
  const stepIds = normalizeStringList(input.stepIds, "step id");

  const review: MigrationPlanReview = {
    ...createBaseReview(input, "migration_plan"),
    kind: "migration_plan",
    sourceVersion: normalizeNonNegativeInteger(
      input.sourceVersion,
      "sourceVersion",
    ),
    targetVersion: normalizeNonNegativeInteger(
      input.targetVersion,
      "targetVersion",
    ),
    stepCount: stepIds.length,
    stepIds,
    rollbackNotes: normalizeStringList(input.rollbackNotes ?? [], "rollback note"),
    planFingerprint: normalizeRequiredText(
      input.planFingerprint,
      "plan fingerprint",
    ),
  };

  if (review.targetVersion < review.sourceVersion) {
    throw new Error("targetVersion must be greater than or equal to sourceVersion");
  }

  const next = cloneLifecycleReviewState(state);
  next.migrationPlanReviews.push(review);
  return recalculateLifecycleReviewState(next);
}

export function addSyncReplayReview(
  state: LifecycleReviewState,
  input: SyncReplayReviewInput,
): LifecycleReviewState {
  assertUniqueReviewId(state, input.id);
  const replayStatus = input.replayStatus ?? "ok";
  assertSyncReplayStatus(replayStatus);
  const issueCount = normalizeNonNegativeInteger(
    input.issueCount ?? 0,
    "issueCount",
  );
  const blockerCount =
    input.blockerCount ?? (replayStatus === "blocked" ? Math.max(issueCount, 1) : 0);
  const warningCount =
    input.warningCount ??
    (replayStatus === "degraded" ? Math.max(issueCount, 1) : 0);

  const review: SyncReplayReview = {
    ...createBaseReview(
      {
        ...input,
        blockerCount,
        warningCount,
      },
      "sync_replay",
    ),
    kind: "sync_replay",
    afterCursor: normalizeRequiredText(input.afterCursor, "afterCursor"),
    nextCursor: normalizeRequiredText(input.nextCursor, "nextCursor"),
    eventCount: normalizeNonNegativeInteger(input.eventCount, "eventCount"),
    issueCount,
    replayStatus,
    issueCodes: normalizeStringList(input.issueCodes ?? [], "issue code"),
  };

  const next = cloneLifecycleReviewState(state);
  next.syncReplayReviews.push(review);
  return recalculateLifecycleReviewState(next);
}

export function addCompactionPlanReview(
  state: LifecycleReviewState,
  input: CompactionPlanReviewInput,
): LifecycleReviewState {
  assertUniqueReviewId(state, input.id);
  const blockerCount = input.blockerCount ?? (input.replayVerified ? 0 : 1);

  const review: CompactionPlanReview = {
    ...createBaseReview(
      {
        ...input,
        blockerCount,
      },
      "compaction_plan",
    ),
    kind: "compaction_plan",
    streamId: normalizeRequiredText(input.streamId, "stream id"),
    fromSequence: normalizePositiveInteger(input.fromSequence, "fromSequence"),
    toSequence: normalizePositiveInteger(input.toSequence, "toSequence"),
    sourceEventCount: normalizeNonNegativeInteger(
      input.sourceEventCount,
      "sourceEventCount",
    ),
    compactedEventCount: normalizeNonNegativeInteger(
      input.compactedEventCount,
      "compactedEventCount",
    ),
    retainedEventCount: normalizeNonNegativeInteger(
      input.retainedEventCount,
      "retainedEventCount",
    ),
    checkpointCount: normalizeNonNegativeInteger(
      input.checkpointCount ?? 0,
      "checkpointCount",
    ),
    replayVerified: input.replayVerified,
    planFingerprint: normalizeRequiredText(
      input.planFingerprint,
      "plan fingerprint",
    ),
  };

  if (review.toSequence < review.fromSequence) {
    throw new Error("toSequence must be greater than or equal to fromSequence");
  }

  const next = cloneLifecycleReviewState(state);
  next.compactionPlanReviews.push(review);
  return recalculateLifecycleReviewState(next);
}

export function decideLifecycleReview(
  state: LifecycleReviewState,
  input: LifecycleApprovalDecisionInput,
): LifecycleReviewState {
  const decision = normalizeDecision(input);
  const review = findLifecycleReview(state, decision.reviewId);
  if (!review) {
    throw new Error(`lifecycle review not found: ${decision.reviewId}`);
  }
  if (review.decisionId !== undefined || review.status === "approved") {
    throw new Error("lifecycle review has already been decided");
  }
  if (
    decision.decision === "approved" &&
    (review.blockerCount > 0 || hasOpenBlockingRedaction(state, review.id))
  ) {
    throw new Error("lifecycle review cannot be approved while blocked");
  }
  if (
    state.approvalDecisions.some((item) => item.id === decision.id) &&
    review.decisionId !== decision.id
  ) {
    throw new Error(`approval decision already exists: ${decision.id}`);
  }

  const next = cloneLifecycleReviewState(state);
  next.approvalDecisions.push(decision);
  return updateReviewInState(next, decision.reviewId, (current) => ({
    ...current,
    status: decision.decision,
    decisionId: decision.id,
    updatedAt: decision.decidedAt,
  }));
}

export function addLifecycleRedactionMarker(
  state: LifecycleReviewState,
  input: LifecycleRedactionMarkerInput,
): LifecycleReviewState {
  const review = findLifecycleReview(state, input.reviewId);
  if (!review) {
    throw new Error(`lifecycle review not found: ${input.reviewId}`);
  }
  if (review.status === "approved" || review.status === "rejected") {
    throw new Error("redaction markers cannot be added to decided reviews");
  }
  if (state.redactionMarkers.some((marker) => marker.id === input.id)) {
    throw new Error(`redaction marker already exists: ${input.id}`);
  }

  const severity = input.severity ?? "warning";
  assertRedactionSeverity(severity);
  const marker: LifecycleRedactionMarker = {
    id: normalizeRequiredText(input.id, "redaction marker id"),
    reviewId: normalizeRequiredText(input.reviewId, "review id"),
    path: normalizeRequiredText(input.path, "redaction path"),
    reason: normalizeRequiredText(input.reason, "redaction reason"),
    marker: normalizeRequiredText(input.marker, "redaction marker"),
    severity,
    createdBy: normalizeRequiredText(input.createdBy, "createdBy"),
    createdAt: normalizeTimestamp(input.createdAt, "createdAt"),
    status: "open",
  };

  const next = cloneLifecycleReviewState(state);
  next.redactionMarkers.push(marker);
  return recalculateLifecycleReviewState(
    updateReviewInState(next, marker.reviewId, (current) => ({
      ...current,
      updatedAt: marker.createdAt,
      redactionMarkerIds: mergeStringLists(current.redactionMarkerIds, [marker.id]),
    })),
  );
}

export function resolveLifecycleRedactionMarker(
  state: LifecycleReviewState,
  markerId: string,
  resolvedBy: string,
  resolvedAt: string,
): LifecycleReviewState {
  const id = normalizeRequiredText(markerId, "redaction marker id");
  const normalizedResolvedBy = normalizeRequiredText(resolvedBy, "resolvedBy");
  const normalizedResolvedAt = normalizeTimestamp(resolvedAt, "resolvedAt");
  let found = false;
  let updatedReviewId: string | undefined;

  const next = cloneLifecycleReviewState(state);
  next.redactionMarkers = next.redactionMarkers.map((marker) => {
    if (marker.id !== id) {
      return cloneRedactionMarker(marker);
    }

    found = true;
    if (marker.status === "resolved") {
      return cloneRedactionMarker(marker);
    }
    updatedReviewId = marker.reviewId;

    return {
      ...cloneRedactionMarker(marker),
      status: "resolved",
      resolvedBy: normalizedResolvedBy,
      resolvedAt: normalizedResolvedAt,
    };
  });

  if (!found) {
    throw new Error(`redaction marker not found: ${id}`);
  }

  const reviewUpdated =
    updatedReviewId === undefined
      ? next
      : updateReviewInState(next, updatedReviewId, (current) => ({
          ...current,
          updatedAt: normalizedResolvedAt,
        }));

  return recalculateLifecycleReviewState(reviewUpdated);
}

export function listLifecycleReviews(
  state: LifecycleReviewState,
  kind?: LifecycleReviewKind,
): LifecycleReview[] {
  if (kind !== undefined) {
    assertLifecycleReviewKind(kind);
  }

  return getAllReviews(state)
    .filter((review) => kind === undefined || review.kind === kind)
    .sort(compareReviewsChronologically)
    .map(cloneReview);
}

export function buildLifecycleReviewStatusSummaries(
  state: LifecycleReviewState,
): LifecycleReviewStatusSummary[] {
  return listLifecycleReviews(state).map((review) => {
    const openMarkers = state.redactionMarkers.filter(
      (marker) => marker.reviewId === review.id && marker.status === "open",
    );
    const decision =
      review.decisionId === undefined
        ? undefined
        : state.approvalDecisions.find((item) => item.id === review.decisionId)
            ?.decision;

    const summary: LifecycleReviewStatusSummary = {
      reviewId: review.id,
      kind: review.kind,
      status: review.status,
      blockerCount: review.blockerCount,
      warningCount: review.warningCount,
      openRedactionCount: openMarkers.length,
      openBlockingRedactionCount: openMarkers.filter(
        (marker) => marker.severity === "blocking",
      ).length,
    };

    if (decision !== undefined) {
      summary.decision = decision;
    }

    return summary;
  });
}

export function summarizeLifecycleReviewState(
  state: LifecycleReviewState,
): LifecycleReviewSummary {
  const reviews = listLifecycleReviews(state);
  const byKind = createKindCounts();
  const byStatus = createStatusCounts();
  const byDecision = createDecisionCounts();
  const bySeverity = createRedactionSeverityCounts();

  for (const review of reviews) {
    assertLifecycleReviewKind(review.kind);
    assertLifecycleReviewStatus(review.status);
    byKind[review.kind] += 1;
    byStatus[review.status] += 1;
  }

  for (const decision of state.approvalDecisions) {
    assertApprovalDecision(decision.decision);
    byDecision[decision.decision] += 1;
  }

  for (const marker of state.redactionMarkers) {
    assertRedactionSeverity(marker.severity);
    bySeverity[marker.severity] += 1;
  }

  return {
    totalReviews: reviews.length,
    byKind,
    byStatus,
    pendingReviewIds: reviews
      .filter((review) => review.status === "pending")
      .map((review) => review.id),
    blockedReviewIds: reviews
      .filter(
        (review) =>
          review.status === "blocked" || review.status === "needs_redaction",
      )
      .map((review) => review.id),
    approvedReviewIds: reviews
      .filter((review) => review.status === "approved")
      .map((review) => review.id),
    rejectedReviewIds: reviews
      .filter((review) => review.status === "rejected")
      .map((review) => review.id),
    decisions: {
      total: state.approvalDecisions.length,
      byDecision,
    },
    redactions: summarizeRedactions(state.redactionMarkers, bySeverity),
  };
}

export function isLifecycleReviewKind(
  value: unknown,
): value is LifecycleReviewKind {
  return isOneOf(value, LIFECYCLE_REVIEW_KINDS);
}

export function isLifecycleReviewStatus(
  value: unknown,
): value is LifecycleReviewStatus {
  return isOneOf(value, LIFECYCLE_REVIEW_STATUSES);
}

export function isLifecycleApprovalDecisionStatus(
  value: unknown,
): value is LifecycleApprovalDecisionStatus {
  return isOneOf(value, LIFECYCLE_APPROVAL_DECISIONS);
}

export function isLifecycleRedactionSeverity(
  value: unknown,
): value is LifecycleRedactionSeverity {
  return isOneOf(value, LIFECYCLE_REDACTION_SEVERITIES);
}

function createBaseReview(
  input: LifecycleReviewInputBase,
  kind: LifecycleReviewKind,
): LifecycleReviewBase {
  const createdAt = normalizeTimestamp(
    input.createdAt ?? DEFAULT_TIMESTAMP,
    "createdAt",
  );
  const updatedAt = normalizeTimestamp(input.updatedAt ?? createdAt, "updatedAt");

  return {
    id: normalizeRequiredText(input.id, "review id"),
    workspaceId: input.workspaceId,
    kind,
    title: normalizeRequiredText(input.title, "review title"),
    requestedBy: normalizeRequiredText(input.requestedBy, "requestedBy"),
    createdAt,
    updatedAt,
    status: "pending",
    blockerCount: normalizeNonNegativeInteger(
      input.blockerCount ?? 0,
      "blockerCount",
    ),
    warningCount: normalizeNonNegativeInteger(
      input.warningCount ?? 0,
      "warningCount",
    ),
    reviewerRoles: normalizeStringList(input.reviewerRoles ?? [], "reviewer role"),
    redactionMarkerIds: [],
  };
}

function normalizeLifecycleReviewState(
  state: LifecycleReviewState,
): LifecycleReviewState {
  const next = cloneLifecycleReviewState(state);
  const ids = new Set<string>();
  for (const review of getAllReviews(next)) {
    assertUniqueString(ids, review.id, "lifecycle review");
  }
  const decisionIds = new Set<string>();
  for (const decision of next.approvalDecisions) {
    assertUniqueString(decisionIds, decision.id, "approval decision");
    if (!findLifecycleReview(next, decision.reviewId)) {
      throw new Error(`lifecycle review not found: ${decision.reviewId}`);
    }
    assertApprovalDecision(decision.decision);
    normalizeTimestamp(decision.decidedAt, "decidedAt");
  }
  const markerIds = new Set<string>();
  for (const marker of next.redactionMarkers) {
    assertUniqueString(markerIds, marker.id, "redaction marker");
    if (!findLifecycleReview(next, marker.reviewId)) {
      throw new Error(`lifecycle review not found: ${marker.reviewId}`);
    }
    assertRedactionSeverity(marker.severity);
    assertRedactionStatus(marker.status);
    normalizeTimestamp(marker.createdAt, "createdAt");
    if (marker.resolvedAt !== undefined) {
      normalizeTimestamp(marker.resolvedAt, "resolvedAt");
    }
  }

  return recalculateLifecycleReviewState(next);
}

function recalculateLifecycleReviewState(
  state: LifecycleReviewState,
): LifecycleReviewState {
  let next = cloneLifecycleReviewState(state);
  for (const review of getAllReviews(next)) {
    next = updateReviewInState(next, review.id, (current) => ({
      ...current,
      status: resolveReviewStatus(next, current),
      redactionMarkerIds: next.redactionMarkers
        .filter((marker) => marker.reviewId === current.id)
        .map((marker) => marker.id),
    }));
  }
  return next;
}

function resolveReviewStatus(
  state: LifecycleReviewState,
  review: LifecycleReview,
): LifecycleReviewStatus {
  if (review.decisionId !== undefined) {
    const decision = state.approvalDecisions.find(
      (item) => item.id === review.decisionId,
    );
    if (!decision) {
      throw new Error(`approval decision not found: ${review.decisionId}`);
    }
    return decision.decision;
  }
  if (hasOpenBlockingRedaction(state, review.id)) {
    return "needs_redaction";
  }
  if (review.blockerCount > 0) {
    return "blocked";
  }
  return "pending";
}

function normalizeDecision(
  input: LifecycleApprovalDecisionInput,
): LifecycleApprovalDecision {
  assertApprovalDecision(input.decision);

  const decision: LifecycleApprovalDecision = {
    id: normalizeRequiredText(input.id, "approval decision id"),
    reviewId: normalizeRequiredText(input.reviewId, "review id"),
    decision: input.decision,
    decidedBy: normalizeRequiredText(input.decidedBy, "decidedBy"),
    decidedAt: normalizeTimestamp(input.decidedAt, "decidedAt"),
  };

  if (input.reason !== undefined) {
    decision.reason = input.reason.trim();
  }

  return decision;
}

function summarizeRedactions(
  markers: readonly LifecycleRedactionMarker[],
  bySeverity: LifecycleRedactionSeverityCounts,
): LifecycleRedactionSummary {
  return {
    total: markers.length,
    open: markers.filter((marker) => marker.status === "open").length,
    resolved: markers.filter((marker) => marker.status === "resolved").length,
    openBlocking: markers.filter(
      (marker) => marker.status === "open" && marker.severity === "blocking",
    ).length,
    bySeverity: { ...bySeverity },
  };
}

function getAllReviews(state: LifecycleReviewState): LifecycleReview[] {
  return [
    ...state.backupRestoreReviews,
    ...state.migrationPlanReviews,
    ...state.syncReplayReviews,
    ...state.compactionPlanReviews,
  ];
}

function findLifecycleReview(
  state: LifecycleReviewState,
  reviewId: string,
): LifecycleReview | undefined {
  const id = normalizeRequiredText(reviewId, "review id");
  return getAllReviews(state).find((review) => review.id === id);
}

function updateReviewInState(
  state: LifecycleReviewState,
  reviewId: string,
  update: (review: LifecycleReview) => LifecycleReview,
): LifecycleReviewState {
  const id = normalizeRequiredText(reviewId, "review id");
  let found = false;

  const next: LifecycleReviewState = {
    backupRestoreReviews: state.backupRestoreReviews.map((review) => {
      if (review.id !== id) {
        return cloneBackupRestoreReview(review);
      }
      found = true;
      return update(review) as BackupRestoreReview;
    }),
    migrationPlanReviews: state.migrationPlanReviews.map((review) => {
      if (review.id !== id) {
        return cloneMigrationPlanReview(review);
      }
      found = true;
      return update(review) as MigrationPlanReview;
    }),
    syncReplayReviews: state.syncReplayReviews.map((review) => {
      if (review.id !== id) {
        return cloneSyncReplayReview(review);
      }
      found = true;
      return update(review) as SyncReplayReview;
    }),
    compactionPlanReviews: state.compactionPlanReviews.map((review) => {
      if (review.id !== id) {
        return cloneCompactionPlanReview(review);
      }
      found = true;
      return update(review) as CompactionPlanReview;
    }),
    approvalDecisions: state.approvalDecisions.map(cloneDecision),
    redactionMarkers: state.redactionMarkers.map(cloneRedactionMarker),
  };

  if (!found) {
    throw new Error(`lifecycle review not found: ${id}`);
  }

  return next;
}

function hasOpenBlockingRedaction(
  state: LifecycleReviewState,
  reviewId: string,
): boolean {
  return state.redactionMarkers.some(
    (marker) =>
      marker.reviewId === reviewId &&
      marker.status === "open" &&
      marker.severity === "blocking",
  );
}

function cloneLifecycleReviewState(
  state: LifecycleReviewState,
): LifecycleReviewState {
  return {
    backupRestoreReviews: state.backupRestoreReviews.map(cloneBackupRestoreReview),
    migrationPlanReviews: state.migrationPlanReviews.map(cloneMigrationPlanReview),
    syncReplayReviews: state.syncReplayReviews.map(cloneSyncReplayReview),
    compactionPlanReviews: state.compactionPlanReviews.map(cloneCompactionPlanReview),
    approvalDecisions: state.approvalDecisions.map(cloneDecision),
    redactionMarkers: state.redactionMarkers.map(cloneRedactionMarker),
  };
}

function cloneReview(review: LifecycleReview): LifecycleReview {
  switch (review.kind) {
    case "backup_restore":
      return cloneBackupRestoreReview(review);
    case "migration_plan":
      return cloneMigrationPlanReview(review);
    case "sync_replay":
      return cloneSyncReplayReview(review);
    case "compaction_plan":
      return cloneCompactionPlanReview(review);
  }
}

function cloneBaseReview<TReview extends LifecycleReviewBase>(
  review: TReview,
): TReview {
  return {
    ...review,
    reviewerRoles: [...review.reviewerRoles],
    redactionMarkerIds: [...review.redactionMarkerIds],
  };
}

function cloneBackupRestoreReview(
  review: BackupRestoreReview,
): BackupRestoreReview {
  return cloneBaseReview(review);
}

function cloneMigrationPlanReview(
  review: MigrationPlanReview,
): MigrationPlanReview {
  return {
    ...cloneBaseReview(review),
    stepIds: [...review.stepIds],
    rollbackNotes: [...review.rollbackNotes],
  };
}

function cloneSyncReplayReview(review: SyncReplayReview): SyncReplayReview {
  return {
    ...cloneBaseReview(review),
    issueCodes: [...review.issueCodes],
  };
}

function cloneCompactionPlanReview(
  review: CompactionPlanReview,
): CompactionPlanReview {
  return cloneBaseReview(review);
}

function cloneDecision(
  decision: LifecycleApprovalDecision,
): LifecycleApprovalDecision {
  return { ...decision };
}

function cloneRedactionMarker(
  marker: LifecycleRedactionMarker,
): LifecycleRedactionMarker {
  return { ...marker };
}

function compareReviewsChronologically(
  left: LifecycleReview,
  right: LifecycleReview,
): number {
  return (
    compareTimestamps(left.createdAt, right.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

function createKindCounts(): LifecycleKindCounts {
  return {
    backup_restore: 0,
    migration_plan: 0,
    sync_replay: 0,
    compaction_plan: 0,
  };
}

function createStatusCounts(): LifecycleStatusCounts {
  return {
    pending: 0,
    needs_redaction: 0,
    approved: 0,
    rejected: 0,
    blocked: 0,
  };
}

function createDecisionCounts(): LifecycleDecisionCounts {
  return {
    approved: 0,
    rejected: 0,
  };
}

function createRedactionSeverityCounts(): LifecycleRedactionSeverityCounts {
  return {
    info: 0,
    warning: 0,
    blocking: 0,
  };
}

function assertUniqueReviewId(
  state: LifecycleReviewState,
  reviewId: string,
): void {
  const id = normalizeRequiredText(reviewId, "review id");
  if (getAllReviews(state).some((review) => review.id === id)) {
    throw new Error(`lifecycle review already exists: ${id}`);
  }
}

function assertLifecycleReviewKind(
  kind: LifecycleReviewKind,
): asserts kind is LifecycleReviewKind {
  if (!isLifecycleReviewKind(kind)) {
    throw new Error("lifecycle review kind is not supported");
  }
}

function assertLifecycleReviewStatus(
  status: LifecycleReviewStatus,
): asserts status is LifecycleReviewStatus {
  if (!isLifecycleReviewStatus(status)) {
    throw new Error("lifecycle review status is not supported");
  }
}

function assertApprovalDecision(
  decision: LifecycleApprovalDecisionStatus,
): asserts decision is LifecycleApprovalDecisionStatus {
  if (!isLifecycleApprovalDecisionStatus(decision)) {
    throw new Error("approval decision is not supported");
  }
}

function assertRedactionSeverity(
  severity: LifecycleRedactionSeverity,
): asserts severity is LifecycleRedactionSeverity {
  if (!isLifecycleRedactionSeverity(severity)) {
    throw new Error("redaction severity is not supported");
  }
}

function assertRedactionStatus(
  status: LifecycleRedactionStatus,
): asserts status is LifecycleRedactionStatus {
  if (!isOneOf(status, LIFECYCLE_REDACTION_STATUSES)) {
    throw new Error("redaction status is not supported");
  }
}

function assertBackupRestoreOperation(
  operation: BackupRestoreOperation,
): asserts operation is BackupRestoreOperation {
  if (operation !== "backup" && operation !== "restore") {
    throw new Error("backup restore operation is not supported");
  }
}

function assertRestoreMode(mode: RestoreReviewMode): asserts mode is RestoreReviewMode {
  if (mode !== "preview" && mode !== "merge" && mode !== "replace") {
    throw new Error("restore mode is not supported");
  }
}

function assertSyncReplayStatus(
  status: SyncReplayReview["replayStatus"],
): asserts status is SyncReplayReview["replayStatus"] {
  if (status !== "ok" && status !== "degraded" && status !== "blocked") {
    throw new Error("sync replay status is not supported");
  }
}

function assertUniqueString(
  seen: Set<string>,
  value: string,
  label: string,
): void {
  const id = normalizeRequiredText(value, `${label} id`);
  if (seen.has(id)) {
    throw new Error(`${label} already exists: ${id}`);
  }
  seen.add(id);
}

function normalizeStringList(values: readonly string[], name: string): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const item = normalizeRequiredText(value, name);
    if (!seen.has(item)) {
      seen.add(item);
      normalized.push(item);
    }
  }

  return normalized;
}

function mergeStringLists(
  existing: readonly string[],
  next: readonly string[],
): string[] {
  return normalizeStringList([...existing, ...next], "id");
}

function normalizeRequiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized === "") {
    throw new Error(`${field} is required`);
  }
  return normalized;
}

function normalizeTimestamp(value: string, field: string): string {
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be a valid timestamp`);
  }
  return value;
}

function normalizeNonNegativeInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return value;
}

function normalizePositiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function compareTimestamps(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
    throw new Error("timestamps must be valid");
  }

  return leftTime - rightTime || left.localeCompare(right);
}

function isOneOf<TValue extends string>(
  value: unknown,
  allowed: readonly TValue[],
): value is TValue {
  return typeof value === "string" && allowed.includes(value as TValue);
}
