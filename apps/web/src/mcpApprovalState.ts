import {
  buildMcpApprovalQueueItems,
  buildMcpSafeReview,
  summarizeMcpApprovalSessions,
  type McpApprovalQueueItem,
  type McpApprovalSessionActor,
  type McpApprovalSessionDecision,
  type McpApprovalSessionFilter,
  type McpApprovalSessionSnapshot,
  type McpApprovalSessionSummary,
} from "./mcpReview.ts";

export type McpApprovalOptimisticDecisionStatus = "approved" | "rejected";

export type McpApprovalAuditAction =
  | McpApprovalOptimisticDecisionStatus
  | "expired"
  | "refused"
  | "rolled_back";

export type McpApprovalRefusalReason =
  | "not_found"
  | "not_optimistic"
  | "stale_session"
  | "terminal_session";

export interface McpApprovalInboxState {
  sessions: McpApprovalSessionSnapshot[];
  queueItems: McpApprovalQueueItem[];
  summary: McpApprovalSessionSummary;
  filter: McpApprovalSessionFilter;
  optimistic: McpApprovalOptimisticMutation[];
  auditNotes: McpApprovalAuditNote[];
}

export interface McpApprovalInboxOptions {
  filter?: McpApprovalSessionFilter;
  optimistic?: readonly McpApprovalOptimisticMutation[];
  auditNotes?: readonly McpApprovalAuditNote[];
}

export interface McpApprovalDecisionInput {
  sessionId: string;
  decidedAt: string;
  actor?: McpApprovalSessionActor;
  reason?: string;
  mutationId?: string;
}

export interface McpApprovalRollbackInput {
  mutationId: string;
  failedAt: string;
  actor?: McpApprovalSessionActor;
  reason?: string;
}

export interface McpApprovalExpireStaleInput {
  staleAt: string;
  actor?: McpApprovalSessionActor;
  reason?: string;
}

export interface McpApprovalOptimisticMutation {
  id: string;
  sessionId: string;
  status: McpApprovalOptimisticDecisionStatus;
  requestedAt: string;
  actor?: McpApprovalSessionActor;
  reason?: string;
  previousSession: McpApprovalSessionSnapshot;
}

export interface McpApprovalAuditRouteHint {
  routeId: "audit";
  path: "/audit";
  label: string;
  query: Record<string, string>;
}

export interface McpApprovalAuditNote {
  id: string;
  sessionId: string;
  action: McpApprovalAuditAction;
  createdAt: string;
  actorId?: string;
  title: string;
  summary: string;
  reason?: string;
  optimistic: boolean;
  route: McpApprovalAuditRouteHint;
}

export interface McpApprovalTransitionRefusal {
  sessionId: string;
  reason: McpApprovalRefusalReason;
  message: string;
  auditNote?: McpApprovalAuditNote;
}

export interface McpApprovalTransitionResult {
  state: McpApprovalInboxState;
  mutation?: McpApprovalOptimisticMutation;
  auditNote?: McpApprovalAuditNote;
  refusal?: McpApprovalTransitionRefusal;
}

export interface McpApprovalExpireStaleResult {
  state: McpApprovalInboxState;
  expiredSessionIds: string[];
  auditNotes: McpApprovalAuditNote[];
}

export function createMcpApprovalInboxState(
  sessions: readonly McpApprovalSessionSnapshot[],
  options: McpApprovalInboxOptions = {},
): McpApprovalInboxState {
  return rebuildMcpApprovalInboxState(
    sessions.map(cloneMcpApprovalSession),
    options.filter ?? {},
    options.optimistic ?? [],
    options.auditNotes ?? [],
  );
}

export function optimisticallyApproveMcpApprovalSession(
  state: McpApprovalInboxState,
  input: McpApprovalDecisionInput,
): McpApprovalTransitionResult {
  return optimisticallyDecideMcpApprovalSession(state, {
    ...input,
    status: "approved",
  });
}

export function optimisticallyRejectMcpApprovalSession(
  state: McpApprovalInboxState,
  input: McpApprovalDecisionInput,
): McpApprovalTransitionResult {
  return optimisticallyDecideMcpApprovalSession(state, {
    ...input,
    status: "rejected",
  });
}

export function rollbackOptimisticMcpApprovalDecision(
  state: McpApprovalInboxState,
  input: McpApprovalRollbackInput,
): McpApprovalTransitionResult {
  assertTimestamp(input.failedAt, "failedAt");
  assertNonEmpty(input.mutationId, "mutationId");

  const mutation = state.optimistic.find((entry) => entry.id === input.mutationId);
  if (!mutation) {
    return refusedTransition(state, {
      sessionId: input.mutationId,
      reason: "not_optimistic",
      message: `optimistic MCP approval mutation was not found: ${input.mutationId}`,
    });
  }

  const sessions = state.sessions.map(cloneMcpApprovalSession);
  const index = sessions.findIndex((session) => session.id === mutation.sessionId);
  const restored = cloneMcpApprovalSession(mutation.previousSession);

  if (index === -1) {
    sessions.push(restored);
  } else {
    sessions[index] = restored;
  }

  const auditNote = buildMcpApprovalAuditNote(restored, {
    action: "rolled_back",
    at: input.failedAt,
    actor: input.actor,
    reason: input.reason ?? mutation.reason,
    optimistic: false,
  });

  const optimistic = state.optimistic
    .filter((entry) => entry.id !== mutation.id)
    .map(cloneOptimisticMutation);

  return {
    state: rebuildMcpApprovalInboxState(sessions, state.filter, optimistic, [
      ...state.auditNotes,
      auditNote,
    ]),
    auditNote,
    mutation: cloneOptimisticMutation(mutation),
  };
}

export function expireStaleMcpApprovalSessions(
  state: McpApprovalInboxState,
  input: McpApprovalExpireStaleInput,
): McpApprovalExpireStaleResult {
  assertTimestamp(input.staleAt, "staleAt");

  const expiredSessionIds: string[] = [];
  const auditNotes: McpApprovalAuditNote[] = [];

  const sessions = state.sessions.map((session) => {
    const copy = cloneMcpApprovalSession(session);
    if (
      copy.status !== "pending" ||
      copy.expiresAt === undefined ||
      compareTimestamps(copy.expiresAt, input.staleAt) > 0
    ) {
      return copy;
    }

    const expired = expireMcpApprovalSession(copy, input);
    expiredSessionIds.push(expired.id);
    auditNotes.push(
      buildMcpApprovalAuditNote(expired, {
        action: "expired",
        at: input.staleAt,
        actor: input.actor,
        reason: input.reason,
        optimistic: false,
      }),
    );
    return expired;
  });

  return {
    state: rebuildMcpApprovalInboxState(sessions, state.filter, state.optimistic, [
      ...state.auditNotes,
      ...auditNotes,
    ]),
    expiredSessionIds,
    auditNotes,
  };
}

export function buildMcpApprovalAuditNote(
  session: McpApprovalSessionSnapshot,
  input: {
    action: McpApprovalAuditAction;
    at: string;
    actor?: McpApprovalSessionActor;
    reason?: string;
    optimistic?: boolean;
  },
): McpApprovalAuditNote {
  assertTimestamp(input.at, "at");
  const review = buildMcpSafeReview(session);
  const actorId = input.actor?.id;
  const actionLabel = auditActionLabel(input.action);
  const id = `mcp_approval_audit.${session.id}.${input.action}.${input.at}`;
  const actorSuffix = actorId ? ` by ${actorId}` : "";
  const optimistic = input.optimistic ?? false;

  return {
    id,
    sessionId: session.id,
    action: input.action,
    createdAt: input.at,
    actorId,
    title: `${actionLabel} MCP approval`,
    summary: `${actionLabel} ${review.actionLabel} on ${review.scopeLabel}${actorSuffix}.`,
    reason: input.reason,
    optimistic,
    route: {
      routeId: "audit",
      path: "/audit",
      label: "Open audit trail",
      query: {
        mcpApprovalSessionId: session.id,
        auditNoteId: id,
      },
    },
  };
}

function optimisticallyDecideMcpApprovalSession(
  state: McpApprovalInboxState,
  input: McpApprovalDecisionInput & {
    status: McpApprovalOptimisticDecisionStatus;
  },
): McpApprovalTransitionResult {
  assertTimestamp(input.decidedAt, "decidedAt");
  assertNonEmpty(input.sessionId, "sessionId");

  const sessions = state.sessions.map(cloneMcpApprovalSession);
  const index = sessions.findIndex((session) => session.id === input.sessionId);
  if (index === -1) {
    return refusedTransition(state, {
      sessionId: input.sessionId,
      reason: "not_found",
      message: `MCP approval session was not found: ${input.sessionId}`,
    });
  }

  const current = sessions[index];
  if (current.status !== "pending") {
    return refusedTransition(state, {
      sessionId: current.id,
      reason: "terminal_session",
      message: `MCP approval session is already ${current.status}.`,
      session: current,
      at: input.decidedAt,
      actor: input.actor,
      noteReason: input.reason,
    });
  }

  if (isStaleMcpApprovalSession(current, input.decidedAt)) {
    return refusedTransition(state, {
      sessionId: current.id,
      reason: "stale_session",
      message: `MCP approval session expired at ${current.expiresAt}.`,
      session: current,
      at: input.decidedAt,
      actor: input.actor,
      noteReason: input.reason,
    });
  }

  const mutation: McpApprovalOptimisticMutation = {
    id:
      input.mutationId ??
      `mcp_approval_optimistic.${current.id}.${input.status}.${input.decidedAt}`,
    sessionId: current.id,
    status: input.status,
    requestedAt: input.decidedAt,
    actor: cloneOptional(input.actor),
    reason: input.reason,
    previousSession: cloneMcpApprovalSession(current),
  };
  const updated = decideMcpApprovalSession(current, {
    status: input.status,
    at: input.decidedAt,
    actor: input.actor,
    reason: input.reason,
    mutationId: mutation.id,
  });
  const auditNote = buildMcpApprovalAuditNote(updated, {
    action: input.status,
    at: input.decidedAt,
    actor: input.actor,
    reason: input.reason,
    optimistic: true,
  });

  sessions[index] = updated;

  return {
    state: rebuildMcpApprovalInboxState(
      sessions,
      state.filter,
      [...state.optimistic, mutation],
      [...state.auditNotes, auditNote],
    ),
    mutation: cloneOptimisticMutation(mutation),
    auditNote,
  };
}

function decideMcpApprovalSession(
  session: McpApprovalSessionSnapshot,
  input: {
    status: McpApprovalOptimisticDecisionStatus;
    at: string;
    actor?: McpApprovalSessionActor;
    reason?: string;
    mutationId: string;
  },
): McpApprovalSessionSnapshot {
  const decision: McpApprovalSessionDecision = {
    status: input.status,
    at: input.at,
    metadata: {
      optimistic: true,
      mutationId: input.mutationId,
    },
  };

  if (input.actor) {
    decision.actor = cloneMcpApprovalActor(input.actor);
  }
  if (input.reason !== undefined) {
    decision.reason = input.reason;
  }

  const decided: McpApprovalSessionSnapshot = {
    ...cloneMcpApprovalSession(session),
    status: input.status,
    updatedAt: input.at,
    decision,
  };

  if (input.status === "approved") {
    decided.approvedAt = input.at;
    if (input.actor) {
      decided.approvedBy = cloneMcpApprovalActor(input.actor);
    } else {
      delete decided.approvedBy;
    }
    delete decided.rejectedAt;
    delete decided.rejectedBy;
  } else {
    decided.rejectedAt = input.at;
    if (input.actor) {
      decided.rejectedBy = cloneMcpApprovalActor(input.actor);
    } else {
      delete decided.rejectedBy;
    }
    delete decided.approvedAt;
    delete decided.approvedBy;
  }

  delete decided.expiredAt;
  delete decided.expiredBy;
  return decided;
}

function expireMcpApprovalSession(
  session: McpApprovalSessionSnapshot,
  input: McpApprovalExpireStaleInput,
): McpApprovalSessionSnapshot {
  const expired: McpApprovalSessionSnapshot = {
    ...cloneMcpApprovalSession(session),
    status: "expired",
    updatedAt: input.staleAt,
    expiredAt: input.staleAt,
    decision: {
      status: "expired",
      at: input.staleAt,
    },
  };

  if (input.actor) {
    expired.expiredBy = cloneMcpApprovalActor(input.actor);
    expired.decision = {
      ...expired.decision,
      actor: cloneMcpApprovalActor(input.actor),
    };
  } else {
    delete expired.expiredBy;
  }

  if (input.reason !== undefined) {
    expired.decision = {
      ...expired.decision,
      reason: input.reason,
    };
  }

  delete expired.approvedAt;
  delete expired.approvedBy;
  delete expired.rejectedAt;
  delete expired.rejectedBy;
  return expired;
}

function isStaleMcpApprovalSession(
  session: McpApprovalSessionSnapshot,
  at: string,
): boolean {
  if (session.expiresAt === undefined) {
    return false;
  }

  return compareTimestamps(session.expiresAt, at) <= 0;
}

function refusedTransition(
  state: McpApprovalInboxState,
  input: {
    sessionId: string;
    reason: McpApprovalRefusalReason;
    message: string;
    session?: McpApprovalSessionSnapshot;
    at?: string;
    actor?: McpApprovalSessionActor;
    noteReason?: string;
  },
): McpApprovalTransitionResult {
  const auditNote =
    input.session && input.at
      ? buildMcpApprovalAuditNote(input.session, {
          action: "refused",
          at: input.at,
          actor: input.actor,
          reason: input.noteReason ?? input.message,
          optimistic: false,
        })
      : undefined;

  return {
    state: auditNote
      ? rebuildMcpApprovalInboxState(
          state.sessions,
          state.filter,
          state.optimistic,
          [...state.auditNotes, auditNote],
        )
      : cloneMcpApprovalInboxState(state),
    auditNote,
    refusal: {
      sessionId: input.sessionId,
      reason: input.reason,
      message: input.message,
      auditNote,
    },
  };
}

function rebuildMcpApprovalInboxState(
  sessions: readonly McpApprovalSessionSnapshot[],
  filter: McpApprovalSessionFilter,
  optimistic: readonly McpApprovalOptimisticMutation[],
  auditNotes: readonly McpApprovalAuditNote[],
): McpApprovalInboxState {
  const clonedSessions = sessions.map(cloneMcpApprovalSession);
  const clonedFilter = clonePlain(filter);

  return {
    sessions: clonedSessions,
    queueItems: buildMcpApprovalQueueItems(clonedSessions, clonedFilter),
    summary: summarizeMcpApprovalSessions(clonedSessions),
    filter: clonedFilter,
    optimistic: optimistic.map(cloneOptimisticMutation),
    auditNotes: auditNotes.map(cloneAuditNote),
  };
}

function cloneMcpApprovalInboxState(
  state: McpApprovalInboxState,
): McpApprovalInboxState {
  return rebuildMcpApprovalInboxState(
    state.sessions,
    state.filter,
    state.optimistic,
    state.auditNotes,
  );
}

function cloneOptimisticMutation(
  mutation: McpApprovalOptimisticMutation,
): McpApprovalOptimisticMutation {
  return {
    ...mutation,
    actor: cloneOptional(mutation.actor),
    previousSession: cloneMcpApprovalSession(mutation.previousSession),
  };
}

function cloneAuditNote(note: McpApprovalAuditNote): McpApprovalAuditNote {
  return clonePlain(note);
}

function cloneMcpApprovalSession(
  session: McpApprovalSessionSnapshot,
): McpApprovalSessionSnapshot {
  return clonePlain(session);
}

function cloneMcpApprovalActor(
  actor: McpApprovalSessionActor,
): McpApprovalSessionActor {
  return clonePlain(actor);
}

function cloneOptional<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : clonePlain(value);
}

function auditActionLabel(action: McpApprovalAuditAction): string {
  return {
    approved: "Approved",
    rejected: "Rejected",
    expired: "Expired",
    refused: "Refused",
    rolled_back: "Rolled back",
  }[action];
}

function assertNonEmpty(value: string, name: string): void {
  if (value.trim() === "") {
    throw new Error(`${name} is required`);
  }
}

function assertTimestamp(value: string, name: string): void {
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${name} must be a valid timestamp`);
  }
}

function compareTimestamps(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
    throw new Error("timestamps must be valid");
  }

  return leftTime - rightTime || left.localeCompare(right);
}

function clonePlain<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString() as T;
  }

  const objectValue = value as object;
  const existing = seen.get(objectValue);
  if (existing) {
    return existing as T;
  }

  if (Array.isArray(value)) {
    const cloned: unknown[] = [];
    seen.set(objectValue, cloned);
    for (const item of value) {
      cloned.push(clonePlain(item, seen));
    }

    return cloned as T;
  }

  const cloned: Record<string, unknown> = {};
  seen.set(objectValue, cloned);
  for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
    cloned[key] = clonePlain(entryValue, seen);
  }

  return cloned as T;
}
