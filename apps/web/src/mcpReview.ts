export const MCP_APPROVAL_SESSION_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "expired",
] as const;

export type McpApprovalSessionStatus =
  (typeof MCP_APPROVAL_SESSION_STATUSES)[number];

export type McpApprovalDecisionStatus = Exclude<
  McpApprovalSessionStatus,
  "pending"
>;

export const MCP_REVIEW_RISK_LEVELS = ["low", "medium", "high"] as const;

export type McpReviewRiskLevel = (typeof MCP_REVIEW_RISK_LEVELS)[number];

export const MCP_REVIEW_KINDS = ["tool", "resource", "operation"] as const;

export type McpReviewKind = (typeof MCP_REVIEW_KINDS)[number];

export interface McpApprovalSessionActor {
  id: string;
  roles?: readonly string[];
  metadata?: Record<string, unknown>;
}

export interface McpApprovalSessionDecision {
  status: McpApprovalDecisionStatus;
  at: string;
  actor?: McpApprovalSessionActor;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface McpApprovalSessionSnapshot {
  id: string;
  status: McpApprovalSessionStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  request: Record<string, unknown>;
  actor?: McpApprovalSessionActor;
  reason?: string;
  ruleId?: string;
  metadata?: Record<string, unknown>;
  decision?: McpApprovalSessionDecision;
  approvedAt?: string;
  approvedBy?: McpApprovalSessionActor;
  rejectedAt?: string;
  rejectedBy?: McpApprovalSessionActor;
  expiredAt?: string;
  expiredBy?: McpApprovalSessionActor;
}

export interface McpApprovalSessionFilter {
  status?: McpApprovalSessionStatus | readonly McpApprovalSessionStatus[] | "decided" | "all";
  actorId?: string;
  ruleId?: string;
  reviewKind?: McpReviewKind;
  riskLevel?: McpReviewRiskLevel;
  query?: string;
}

export type McpApprovalStatusCounts = Record<McpApprovalSessionStatus, number>;
export type McpReviewRiskCounts = Record<McpReviewRiskLevel, number>;
export type McpReviewKindCounts = Record<McpReviewKind, number>;

export interface McpApprovalSessionSummary {
  total: number;
  pending: number;
  decided: number;
  byStatus: McpApprovalStatusCounts;
  byRiskLevel: McpReviewRiskCounts;
  byReviewKind: McpReviewKindCounts;
}

export interface McpSafeReviewViewModel {
  kind: McpReviewKind;
  title: string;
  subjectLabel: string;
  actionLabel: string;
  scopeLabel: string;
  riskLevel: McpReviewRiskLevel;
  riskLabel: string;
  detailLabels: string[];
  request: Record<string, unknown>;
}

export type McpReviewActionId =
  | "approve"
  | "reject"
  | "preview_tool"
  | "open_resource"
  | "inspect_payload"
  | "view_decision";

export type McpReviewActionIntent = "primary" | "secondary" | "danger";

export interface McpReviewAction {
  id: McpReviewActionId;
  label: string;
  intent: McpReviewActionIntent;
  enabled: boolean;
  disabledReason?: string;
}

export interface McpReviewAffordances {
  canApprove: boolean;
  canReject: boolean;
  canPreviewTool: boolean;
  canOpenResource: boolean;
  canInspectPayload: boolean;
  canViewDecision: boolean;
  isTerminal: boolean;
  actions: McpReviewAction[];
}

export interface McpApprovalQueueItem {
  id: string;
  sessionId: string;
  status: McpApprovalSessionStatus;
  statusLabel: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  requestedBy?: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionReason?: string;
  ruleId?: string;
  reason?: string;
  review: McpSafeReviewViewModel;
  riskLevel: McpReviewRiskLevel;
  riskLabel: string;
  actionLabel: string;
  scopeLabel: string;
  affordances: McpReviewAffordances;
  ariaLabel: string;
}

export function buildMcpApprovalQueueItems(
  sessions: readonly McpApprovalSessionSnapshot[],
  filter: McpApprovalSessionFilter = {},
): McpApprovalQueueItem[] {
  return filterMcpApprovalSessions(sessions, filter)
    .map(toMcpApprovalQueueItem)
    .sort(compareMcpApprovalQueueItems);
}

export function filterMcpApprovalSessions(
  sessions: readonly McpApprovalSessionSnapshot[],
  filter: McpApprovalSessionFilter = {},
): McpApprovalSessionSnapshot[] {
  return sessions
    .filter((session) => matchesMcpApprovalSessionFilter(session, filter))
    .map(cloneMcpApprovalSession);
}

export function filterPendingMcpApprovalSessions(
  sessions: readonly McpApprovalSessionSnapshot[],
  filter: Omit<McpApprovalSessionFilter, "status"> = {},
): McpApprovalSessionSnapshot[] {
  return filterMcpApprovalSessions(sessions, {
    ...filter,
    status: "pending",
  });
}

export function filterDecidedMcpApprovalSessions(
  sessions: readonly McpApprovalSessionSnapshot[],
  filter: Omit<McpApprovalSessionFilter, "status"> = {},
): McpApprovalSessionSnapshot[] {
  return filterMcpApprovalSessions(sessions, {
    ...filter,
    status: "decided",
  });
}

export function summarizeMcpApprovalSessions(
  sessions: readonly McpApprovalSessionSnapshot[],
): McpApprovalSessionSummary {
  const byStatus = createStatusCounts();
  const byRiskLevel = createRiskCounts();
  const byReviewKind = createKindCounts();

  for (const session of sessions) {
    assertMcpApprovalSessionStatus(session.status);
    const review = buildMcpSafeReview(session);

    byStatus[session.status] += 1;
    byRiskLevel[review.riskLevel] += 1;
    byReviewKind[review.kind] += 1;
  }

  return {
    total: sessions.length,
    pending: byStatus.pending,
    decided: byStatus.approved + byStatus.rejected + byStatus.expired,
    byStatus,
    byRiskLevel,
    byReviewKind,
  };
}

export function buildMcpSafeReview(
  session: McpApprovalSessionSnapshot,
): McpSafeReviewViewModel {
  const request = cloneRecord(session.request);
  const kind = deriveMcpReviewKind(request);
  const actionLabel = deriveMcpActionLabel(request, kind);
  const scopeLabel = deriveMcpScopeLabel(session, request, kind);
  const riskLevel = deriveMcpRiskLevel(session, request, kind);
  const subjectLabel = reviewKindLabel(kind);

  return {
    kind,
    title: `${actionLabel} on ${scopeLabel}`,
    subjectLabel,
    actionLabel,
    scopeLabel,
    riskLevel,
    riskLabel: riskLevelLabel(riskLevel),
    detailLabels: deriveMcpDetailLabels(session, request),
    request,
  };
}

export function deriveMcpReviewAffordances(
  session: McpApprovalSessionSnapshot,
): McpReviewAffordances {
  const review = buildMcpSafeReview(session);
  const isTerminal = session.status !== "pending";
  const terminalReason = isTerminal
    ? `Session is already ${statusLabel(session.status).toLowerCase()}.`
    : undefined;

  const canApprove = !isTerminal;
  const canReject = !isTerminal;
  const canPreviewTool = review.kind === "tool";
  const canOpenResource = review.kind === "resource";
  const canInspectPayload = true;
  const canViewDecision = isTerminal;

  return {
    canApprove,
    canReject,
    canPreviewTool,
    canOpenResource,
    canInspectPayload,
    canViewDecision,
    isTerminal,
    actions: [
      {
        id: "approve",
        label: "Approve",
        intent: "primary",
        enabled: canApprove,
        disabledReason: terminalReason,
      },
      {
        id: "reject",
        label: "Reject",
        intent: "danger",
        enabled: canReject,
        disabledReason: terminalReason,
      },
      {
        id: "preview_tool",
        label: "Preview tool",
        intent: "secondary",
        enabled: canPreviewTool,
        disabledReason: canPreviewTool ? undefined : "Review is not a tool call.",
      },
      {
        id: "open_resource",
        label: "Open resource",
        intent: "secondary",
        enabled: canOpenResource,
        disabledReason: canOpenResource ? undefined : "Review is not a resource access.",
      },
      {
        id: "inspect_payload",
        label: "Inspect payload",
        intent: "secondary",
        enabled: canInspectPayload,
      },
      {
        id: "view_decision",
        label: "View decision",
        intent: "secondary",
        enabled: canViewDecision,
        disabledReason: canViewDecision ? undefined : "Session has not been decided.",
      },
    ],
  };
}

export function isMcpApprovalSessionStatus(
  value: unknown,
): value is McpApprovalSessionStatus {
  return isOneOf(value, MCP_APPROVAL_SESSION_STATUSES);
}

export function isMcpReviewRiskLevel(
  value: unknown,
): value is McpReviewRiskLevel {
  return isOneOf(value, MCP_REVIEW_RISK_LEVELS);
}

export function isMcpReviewKind(value: unknown): value is McpReviewKind {
  return isOneOf(value, MCP_REVIEW_KINDS);
}

function toMcpApprovalQueueItem(
  session: McpApprovalSessionSnapshot,
): McpApprovalQueueItem {
  const review = buildMcpSafeReview(session);
  const affordances = deriveMcpReviewAffordances(session);
  const decision = terminalDecision(session);
  const decidedBy = decision?.actor?.id ?? terminalActor(session)?.id;
  const decidedAt = decision?.at ?? terminalTimestamp(session);

  return {
    id: `mcp_approval_queue.${session.id}`,
    sessionId: session.id,
    status: session.status,
    statusLabel: statusLabel(session.status),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    expiresAt: session.expiresAt,
    requestedBy: session.actor?.id,
    decidedBy,
    decidedAt,
    decisionReason: decision?.reason,
    ruleId: session.ruleId,
    reason: session.reason,
    review,
    riskLevel: review.riskLevel,
    riskLabel: review.riskLabel,
    actionLabel: review.actionLabel,
    scopeLabel: review.scopeLabel,
    affordances,
    ariaLabel: [
      statusLabel(session.status),
      review.riskLabel,
      review.subjectLabel,
      review.actionLabel,
      review.scopeLabel,
      session.actor?.id ? `requested by ${session.actor.id}` : undefined,
    ]
      .filter(isDefined)
      .join(", "),
  };
}

function matchesMcpApprovalSessionFilter(
  session: McpApprovalSessionSnapshot,
  filter: McpApprovalSessionFilter,
): boolean {
  const review = buildMcpSafeReview(session);

  return (
    matchesStatusFilter(session.status, filter.status) &&
    (filter.actorId === undefined || session.actor?.id === filter.actorId) &&
    (filter.ruleId === undefined || session.ruleId === filter.ruleId) &&
    (filter.reviewKind === undefined || review.kind === filter.reviewKind) &&
    (filter.riskLevel === undefined || review.riskLevel === filter.riskLevel) &&
    (filter.query === undefined || matchesQuery(session, review, filter.query))
  );
}

function matchesStatusFilter(
  status: McpApprovalSessionStatus,
  filter: McpApprovalSessionFilter["status"],
): boolean {
  if (filter === undefined || filter === "all") {
    return true;
  }

  if (filter === "decided") {
    return status !== "pending";
  }

  if (Array.isArray(filter)) {
    return filter.includes(status);
  }

  return status === filter;
}

function matchesQuery(
  session: McpApprovalSessionSnapshot,
  review: McpSafeReviewViewModel,
  query: string,
): boolean {
  const normalized = query.trim().toLowerCase();
  if (normalized === "") {
    return true;
  }

  return [
    session.id,
    session.actor?.id,
    session.ruleId,
    session.reason,
    review.actionLabel,
    review.scopeLabel,
    review.riskLabel,
    review.subjectLabel,
    ...review.detailLabels,
  ]
    .filter(isDefined)
    .some((value) => value.toLowerCase().includes(normalized));
}

function deriveMcpReviewKind(request: Record<string, unknown>): McpReviewKind {
  if (typeof request.toolName === "string") {
    return "tool";
  }

  if (
    hasString(request, "uri") ||
    hasString(request, "path") ||
    hasString(request, "resourceUri") ||
    hasString(request, "resource") ||
    hasString(nestedRecord(request, "arguments"), "uri")
  ) {
    return "resource";
  }

  return "operation";
}

function deriveMcpActionLabel(
  request: Record<string, unknown>,
  kind: McpReviewKind,
): string {
  if (typeof request.toolName === "string") {
    return toolNameLabel(request.toolName);
  }

  const operation = nestedRecord(request, "operation");
  const operationType = stringValue(operation, "type") ?? stringValue(request, "type");
  if (operationType) {
    return titleCaseToken(operationType);
  }

  const capability = stringValue(request, "capability");
  if (capability === "read_object") {
    return "Read resource";
  }
  if (capability === "write_object") {
    return "Write resource";
  }
  if (capability === "propose_agent_action") {
    return "Propose action";
  }

  if (kind === "resource") {
    return "Review resource access";
  }

  return "Review MCP action";
}

function deriveMcpScopeLabel(
  session: McpApprovalSessionSnapshot,
  request: Record<string, unknown>,
  kind: McpReviewKind,
): string {
  const args = nestedRecord(request, "arguments");
  const operation = nestedRecord(request, "operation");
  const scope =
    stringValue(request, "uri") ??
    stringValue(request, "path") ??
    stringValue(request, "resourceUri") ??
    stringValue(request, "resource") ??
    stringValue(args, "uri") ??
    stringValue(args, "targetPath") ??
    stringValue(args, "targetRef") ??
    stringValue(args, "target") ??
    stringValue(args, "evidenceRef") ??
    stringValue(args, "name") ??
    stringValue(args, "title") ??
    stringValue(operation, "target") ??
    stringValue(operation, "path") ??
    stringValue(operation, "uri") ??
    stringValue(request, "target") ??
    stringValue(request, "name") ??
    stringValue(request, "title");

  if (scope) {
    return scope;
  }

  if (kind === "tool" && typeof request.toolName === "string") {
    return request.toolName;
  }

  return session.id;
}

function deriveMcpRiskLevel(
  session: McpApprovalSessionSnapshot,
  request: Record<string, unknown>,
  kind: McpReviewKind,
): McpReviewRiskLevel {
  const explicitRisk =
    stringValue(session.metadata, "riskLevel") ??
    stringValue(session.metadata, "risk") ??
    stringValue(request, "riskLevel") ??
    stringValue(request, "risk");
  if (isMcpReviewRiskLevel(explicitRisk)) {
    return explicitRisk;
  }

  const toolName = stringValue(request, "toolName");
  if (toolName === "propose_automation_rule") {
    return "high";
  }

  if (toolName === "create_task_proposal" || toolName === "link_evidence") {
    return "low";
  }

  const capability = stringValue(request, "capability");
  if (capability === "write_object") {
    return "high";
  }

  if (
    toolName === "draft_document_patch" ||
    capability === "propose_agent_action"
  ) {
    return "medium";
  }

  const actionText = [
    toolName,
    stringValue(request, "type"),
    stringValue(nestedRecord(request, "operation"), "type"),
  ]
    .filter(isDefined)
    .join(" ")
    .toLowerCase();
  if (/\b(delete|replace|write|publish|enable|disable)\b/.test(actionText)) {
    return "high";
  }
  if (/\b(update|patch|change|sync|link|create|propose)\b/.test(actionText)) {
    return "medium";
  }

  return kind === "resource" ? "low" : "medium";
}

function deriveMcpDetailLabels(
  session: McpApprovalSessionSnapshot,
  request: Record<string, unknown>,
): string[] {
  const details = [
    session.ruleId ? `Rule ${session.ruleId}` : undefined,
    session.reason,
    session.expiresAt ? `Expires ${session.expiresAt}` : undefined,
    requestSummary(request),
  ].filter(isDefined);

  return [...new Set(details)];
}

function requestSummary(request: Record<string, unknown>): string | undefined {
  const args = nestedRecord(request, "arguments");
  if (args && Object.keys(args).length > 0) {
    return `${Object.keys(args).length} argument${Object.keys(args).length === 1 ? "" : "s"}`;
  }

  if (Object.keys(request).length > 0) {
    return `${Object.keys(request).length} request field${
      Object.keys(request).length === 1 ? "" : "s"
    }`;
  }

  return undefined;
}

function compareMcpApprovalQueueItems(
  left: McpApprovalQueueItem,
  right: McpApprovalQueueItem,
): number {
  return (
    statusSortWeight(left.status) - statusSortWeight(right.status) ||
    riskSortWeight(left.riskLevel) - riskSortWeight(right.riskLevel) ||
    compareOptionalTimestamps(left.expiresAt, right.expiresAt) ||
    compareTimestamps(left.createdAt, right.createdAt) ||
    left.sessionId.localeCompare(right.sessionId)
  );
}

function statusSortWeight(status: McpApprovalSessionStatus): number {
  return {
    pending: 0,
    rejected: 1,
    approved: 2,
    expired: 3,
  }[status];
}

function riskSortWeight(riskLevel: McpReviewRiskLevel): number {
  return {
    high: 0,
    medium: 1,
    low: 2,
  }[riskLevel];
}

function terminalDecision(
  session: McpApprovalSessionSnapshot,
): McpApprovalSessionDecision | undefined {
  return session.decision;
}

function terminalActor(
  session: McpApprovalSessionSnapshot,
): McpApprovalSessionActor | undefined {
  if (session.status === "approved") {
    return session.approvedBy;
  }
  if (session.status === "rejected") {
    return session.rejectedBy;
  }
  if (session.status === "expired") {
    return session.expiredBy;
  }

  return undefined;
}

function terminalTimestamp(
  session: McpApprovalSessionSnapshot,
): string | undefined {
  if (session.status === "approved") {
    return session.approvedAt;
  }
  if (session.status === "rejected") {
    return session.rejectedAt;
  }
  if (session.status === "expired") {
    return session.expiredAt;
  }

  return undefined;
}

function createStatusCounts(): McpApprovalStatusCounts {
  return {
    pending: 0,
    approved: 0,
    rejected: 0,
    expired: 0,
  };
}

function createRiskCounts(): McpReviewRiskCounts {
  return {
    low: 0,
    medium: 0,
    high: 0,
  };
}

function createKindCounts(): McpReviewKindCounts {
  return {
    tool: 0,
    resource: 0,
    operation: 0,
  };
}

function cloneMcpApprovalSession(
  session: McpApprovalSessionSnapshot,
): McpApprovalSessionSnapshot {
  return clonePlain(session);
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return clonePlain(value);
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

function assertMcpApprovalSessionStatus(
  status: McpApprovalSessionStatus,
): asserts status is McpApprovalSessionStatus {
  if (!isMcpApprovalSessionStatus(status)) {
    throw new Error("MCP approval session status is not supported");
  }
}

function statusLabel(status: McpApprovalSessionStatus): string {
  return {
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
    expired: "Expired",
  }[status];
}

function riskLevelLabel(riskLevel: McpReviewRiskLevel): string {
  return {
    low: "Low risk",
    medium: "Medium risk",
    high: "High risk",
  }[riskLevel];
}

function reviewKindLabel(kind: McpReviewKind): string {
  return {
    tool: "Safe tool",
    resource: "Resource",
    operation: "Operation",
  }[kind];
}

function toolNameLabel(toolName: string): string {
  const known: Record<string, string> = {
    create_task_proposal: "Create task proposal",
    draft_document_patch: "Draft document patch",
    link_evidence: "Link evidence",
    propose_automation_rule: "Propose automation rule",
    "gateway.list_resources": "List MCP resources",
    "gateway.read_resource": "Read MCP resource",
  };

  return known[toolName] ?? titleCaseToken(toolName);
}

function titleCaseToken(value: string): string {
  const words = value
    .replace(/[._-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);

  if (words.length === 0) {
    return "MCP action";
  }

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function nestedRecord(
  record: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  if (!record) {
    return undefined;
  }

  const value = record[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(
  record: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  if (!record) {
    return undefined;
  }

  const value = record[key];
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function hasString(
  record: Record<string, unknown> | undefined,
  key: string,
): boolean {
  return stringValue(record, key) !== undefined;
}

function compareOptionalTimestamps(
  left: string | undefined,
  right: string | undefined,
): number {
  if (left === undefined && right === undefined) {
    return 0;
  }
  if (left === undefined) {
    return 1;
  }
  if (right === undefined) {
    return -1;
  }

  return compareTimestamps(left, right);
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

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
