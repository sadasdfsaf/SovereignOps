import { redactSensitiveArguments } from "./auditEmitter.ts";
import type { SafetyFindingSeverity, SafetyTrustLevel } from "./safety.ts";

export type AuditReplaySource =
  | ToolAuditRecordLike
  | ResourceAuditRecordLike
  | ApprovalSessionSnapshotLike
  | SafetyAnnotationLike;

export interface AuditReplayInput {
  toolAuditRecords?: readonly ToolAuditRecordLike[];
  toolRecords?: readonly ToolAuditRecordLike[];
  resourceAuditRecords?: readonly ResourceAuditRecordLike[];
  resourceAuditIntents?: readonly ResourceAuditRecordLike[];
  auditIntents?: readonly ResourceAuditRecordLike[];
  approvalSessions?: readonly ApprovalSessionSnapshotLike[];
  safetyAnnotations?: readonly SafetyAnnotationLike[];
}

export interface ToolAuditRecordLike {
  id?: string;
  timestamp?: string | Date;
  type: string;
  toolName: string;
  arguments?: Record<string, unknown>;
  actorId?: string;
  decision?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  resultSummary?: string;
}

export interface ResourceAuditRecordLike {
  id?: string;
  timestamp?: string | Date;
  type: string;
  uri?: string;
  path?: string;
  capability?: string;
  decision?: string;
  message?: string;
  metadata?: Record<string, unknown>;
}

export type ApprovalSessionStatusLike =
  | "pending"
  | "approved"
  | "rejected"
  | "expired";

export interface ApprovalActorLike {
  id: string;
  roles?: readonly string[];
  metadata?: Record<string, unknown>;
}

export interface ApprovalDecisionLike {
  status: Exclude<ApprovalSessionStatusLike, "pending">;
  at: string | Date;
  actor?: ApprovalActorLike;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface ApprovalSessionSnapshotLike {
  id: string;
  status: ApprovalSessionStatusLike;
  createdAt: string | Date;
  updatedAt: string | Date;
  expiresAt?: string | Date;
  request: Record<string, unknown>;
  actor?: ApprovalActorLike;
  reason?: string;
  ruleId?: string;
  metadata?: Record<string, unknown>;
  decision?: ApprovalDecisionLike;
  approvedAt?: string | Date;
  approvedBy?: ApprovalActorLike;
  rejectedAt?: string | Date;
  rejectedBy?: ApprovalActorLike;
  expiredAt?: string | Date;
  expiredBy?: ApprovalActorLike;
}

export interface SafetyFindingLike {
  id: string;
  severity: SafetyFindingSeverity | string;
  path: string;
  reason: string;
  excerpt: string;
}

export interface SafetyAnnotationLike {
  id?: string;
  timestamp?: string | Date;
  schemaVersion: number;
  scope: string;
  trustLevel: SafetyTrustLevel | string;
  action: string;
  reasons: readonly string[];
  findings: readonly SafetyFindingLike[];
}

export type AuditReplaySourceKind =
  | "tool_audit"
  | "resource_audit"
  | "approval_session"
  | "safety_annotation";

export type AuditReplayEntryKind =
  | "tool_requested"
  | "tool_approval_required"
  | "tool_approved"
  | "tool_executed"
  | "tool_failed"
  | "tool_denied"
  | "resource_policy_decision"
  | "resource_read_succeeded"
  | "resource_read_failed"
  | "resource_read_denied"
  | "resource_read_approval_required"
  | "approval_session_pending"
  | "approval_session_approved"
  | "approval_session_rejected"
  | "approval_session_expired"
  | "safety_summary";

export type AuditReplayStatus =
  | "requested"
  | "approval_required"
  | "approved"
  | "executed"
  | "failed"
  | "denied"
  | "succeeded"
  | "rejected"
  | "expired"
  | "trusted"
  | "review"
  | "untrusted";

export interface AuditReplaySubject {
  type: "tool" | "resource" | "approval_session" | "safety";
  id?: string;
  name?: string;
  uri?: string;
  capability?: string;
}

export interface SafetyFindingReasonSummary {
  trustLevel: SafetyTrustLevel;
  reason: string;
  annotationCount: number;
  findingCount: number;
  severityCounts: Partial<Record<SafetyFindingSeverity | string, number>>;
  findingIds: string[];
  paths: string[];
}

export interface SafetyReplaySummary {
  trustLevel: SafetyTrustLevel;
  annotationCount: number;
  findingCount: number;
  reasonSummaries: SafetyFindingReasonSummary[];
  findings: SafetyFindingLike[];
}

export interface AuditReplayEntry {
  id: string;
  timestamp: string;
  source: AuditReplaySourceKind;
  kind: AuditReplayEntryKind;
  status: AuditReplayStatus;
  title: string;
  subject: AuditReplaySubject;
  actorId?: string;
  decision?: string;
  reason?: string;
  arguments?: Record<string, unknown>;
  request?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  resultSummary?: string;
  safety?: SafetyReplaySummary;
}

const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";

const TOOL_EVENT_MAP: Record<
  string,
  { kind: AuditReplayEntryKind; status: AuditReplayStatus; title: string }
> = {
  tool_call_requested: {
    kind: "tool_requested",
    status: "requested",
    title: "Tool call requested",
  },
  tool_call_approval_required: {
    kind: "tool_approval_required",
    status: "approval_required",
    title: "Tool call requires approval",
  },
  tool_call_approved: {
    kind: "tool_approved",
    status: "approved",
    title: "Tool call approved",
  },
  tool_call_executed: {
    kind: "tool_executed",
    status: "executed",
    title: "Tool call executed",
  },
  tool_call_failed: {
    kind: "tool_failed",
    status: "failed",
    title: "Tool call failed",
  },
  tool_call_denied: {
    kind: "tool_denied",
    status: "denied",
    title: "Tool call denied",
  },
};

const APPROVAL_SESSION_KIND_BY_STATUS: Record<
  ApprovalSessionStatusLike,
  AuditReplayEntryKind
> = {
  pending: "approval_session_pending",
  approved: "approval_session_approved",
  rejected: "approval_session_rejected",
  expired: "approval_session_expired",
};

const APPROVAL_REPLAY_STATUS_BY_STATUS: Record<
  ApprovalSessionStatusLike,
  AuditReplayStatus
> = {
  pending: "approval_required",
  approved: "approved",
  rejected: "rejected",
  expired: "expired",
};

const TRUST_ORDER: Record<SafetyTrustLevel, number> = {
  untrusted: 0,
  review: 1,
  trusted: 2,
};

export function createAuditReplayEntries(
  input: AuditReplayInput | readonly AuditReplaySource[] | AuditReplaySource,
): AuditReplayEntry[] {
  const entries: AuditReplayEntry[] = [];

  if (Array.isArray(input)) {
    input.forEach((source, index) => {
      const entry = normalizeAuditReplaySource(source, index);
      if (entry) {
        entries.push(entry);
      }
    });

    return sortAuditReplayEntries(entries);
  }

  const singleEntry = normalizeAuditReplaySource(input as AuditReplaySource);
  if (singleEntry) {
    return [singleEntry];
  }

  for (const [index, record] of [
    ...(input.toolAuditRecords ?? []),
    ...(input.toolRecords ?? []),
  ].entries()) {
    entries.push(createToolAuditReplayEntry(record, index));
  }

  for (const [index, record] of [
    ...(input.resourceAuditRecords ?? []),
    ...(input.resourceAuditIntents ?? []),
    ...(input.auditIntents ?? []),
  ].entries()) {
    entries.push(createResourceAuditReplayEntry(record, index));
  }

  for (const [index, session] of (input.approvalSessions ?? []).entries()) {
    entries.push(createApprovalSessionReplayEntry(session, index));
  }

  for (const [index, annotation] of (input.safetyAnnotations ?? []).entries()) {
    entries.push(createSafetyReplayEntry(annotation, index));
  }

  return sortAuditReplayEntries(entries);
}

export const normalizeAuditReplay = createAuditReplayEntries;
export const createMcpAuditReplayEntries = createAuditReplayEntries;
export const normalizeMcpAuditReplayEntries = createAuditReplayEntries;

export function normalizeAuditReplaySource(
  source: AuditReplaySource,
  index = 0,
): AuditReplayEntry | undefined {
  if (isToolAuditRecordLike(source)) {
    return createToolAuditReplayEntry(source, index);
  }

  if (isResourceAuditRecordLike(source)) {
    return createResourceAuditReplayEntry(source, index);
  }

  if (isApprovalSessionSnapshotLike(source)) {
    return createApprovalSessionReplayEntry(source, index);
  }

  if (isSafetyAnnotationLike(source)) {
    return createSafetyReplayEntry(source, index);
  }

  return undefined;
}

export function createToolAuditReplayEntry(
  record: ToolAuditRecordLike,
  index = 0,
): AuditReplayEntry {
  const event = TOOL_EVENT_MAP[record.type] ?? {
    kind: "tool_failed" as const,
    status: "failed" as const,
    title: "Tool audit event",
  };
  const toolName = record.toolName;

  return pruneUndefined({
    id: normalizeId(record.id, `tool_audit_${index + 1}_${record.type}_${toolName}`),
    timestamp: normalizeTimestamp(record.timestamp),
    source: "tool_audit",
    kind: event.kind,
    status: event.status,
    title: `${event.title}: ${toolName}`,
    subject: pruneUndefined({
      type: "tool",
      id: toolName,
      name: toolName,
    }),
    actorId: record.actorId,
    decision: record.decision,
    reason: record.reason,
    arguments: record.arguments ? redactReplayArguments(record.arguments) : undefined,
    metadata: cloneRedactingArgumentFields(record.metadata),
    resultSummary: record.resultSummary,
  });
}

export function createResourceAuditReplayEntry(
  record: ResourceAuditRecordLike,
  index = 0,
): AuditReplayEntry {
  const uri = normalizeResourceUri(record);
  const operation = readOperation(record.metadata);
  const outcome = resourceOutcome(record);

  return pruneUndefined({
    id: normalizeId(record.id, `resource_audit_${index + 1}_${record.type}_${uri}`),
    timestamp: normalizeTimestamp(record.timestamp),
    source: "resource_audit",
    kind: outcome.kind,
    status: outcome.status,
    title: `${outcome.title}: ${uri}`,
    subject: pruneUndefined({
      type: "resource",
      id: uri,
      uri,
      capability: record.capability,
    }),
    decision: record.decision,
    reason: record.message,
    metadata: pruneUndefined({
      ...cloneRedactingArgumentFields(record.metadata),
      operation,
    }),
  });
}

export function createApprovalSessionReplayEntry(
  session: ApprovalSessionSnapshotLike,
  index = 0,
): AuditReplayEntry {
  const timestamp = terminalApprovalTimestamp(session) ?? session.updatedAt ?? session.createdAt;
  const requestName = summarizeApprovalRequest(session.request);
  const decision = session.decision?.status ?? session.status;
  const actorId = session.decision?.actor?.id ?? terminalApprovalActor(session)?.id ?? session.actor?.id;

  return pruneUndefined({
    id: normalizeId(session.id, `approval_session_${index + 1}`),
    timestamp: normalizeTimestamp(timestamp),
    source: "approval_session",
    kind: APPROVAL_SESSION_KIND_BY_STATUS[session.status],
    status: APPROVAL_REPLAY_STATUS_BY_STATUS[session.status],
    title: `Approval ${session.status}: ${requestName}`,
    subject: pruneUndefined({
      type: "approval_session",
      id: session.id,
      name: requestName,
    }),
    actorId,
    decision,
    reason: session.decision?.reason ?? session.reason,
    request: cloneRedactingArgumentFields(session.request),
    metadata: pruneUndefined({
      ...cloneRedactingArgumentFields(session.metadata),
      ruleId: session.ruleId,
      approvalStatus: session.status,
      createdAt: normalizeTimestamp(session.createdAt),
      updatedAt: normalizeTimestamp(session.updatedAt),
      expiresAt: session.expiresAt ? normalizeTimestamp(session.expiresAt) : undefined,
      decision: session.decision ? cloneRedactingArgumentFields(session.decision) : undefined,
    }),
  });
}

export function createSafetyReplayEntry(
  annotation: SafetyAnnotationLike,
  index = 0,
): AuditReplayEntry {
  const trustLevel = normalizeTrustLevel(annotation.trustLevel);
  const summary = createSafetyReplaySummary(annotation);

  return pruneUndefined({
    id: normalizeId(annotation.id, `safety_annotation_${index + 1}`),
    timestamp: normalizeTimestamp(annotation.timestamp),
    source: "safety_annotation",
    kind: "safety_summary",
    status: trustLevel,
    title: `Safety ${trustLevel}: ${summary.findingCount} finding${summary.findingCount === 1 ? "" : "s"}`,
    subject: pruneUndefined({
      type: "safety",
      id: normalizeId(annotation.id, `safety_annotation_${index + 1}`),
      name: annotation.scope,
    }),
    reason: annotation.reasons.join("; "),
    metadata: {
      schemaVersion: annotation.schemaVersion,
      scope: annotation.scope,
      action: annotation.action,
    },
    safety: summary,
  });
}

export function summarizeSafetyFindings(
  annotations: readonly SafetyAnnotationLike[],
): SafetyFindingReasonSummary[] {
  const groups = new Map<string, InternalSafetyFindingReasonSummary>();

  for (const annotation of annotations) {
    const trustLevel = normalizeTrustLevel(annotation.trustLevel);
    const findings = Array.isArray(annotation.findings) ? annotation.findings : [];

    if (findings.length === 0) {
      const reasons = annotation.reasons.length > 0 ? annotation.reasons : ["No safety findings."];
      for (const reason of reasons) {
        getSafetySummaryGroup(groups, trustLevel, reason).annotationCount += 1;
      }
      continue;
    }

    const seenReasons = new Set<string>();
    for (const finding of findings) {
      const reason = normalizeReason(finding.reason);
      const group = getSafetySummaryGroup(groups, trustLevel, reason);
      group.findingCount += 1;
      group.findingIds.add(finding.id);
      group.paths.add(finding.path);
      group.severityCounts[finding.severity] =
        (group.severityCounts[finding.severity] ?? 0) + 1;
      seenReasons.add(reason);
    }

    for (const reason of seenReasons) {
      getSafetySummaryGroup(groups, trustLevel, reason).annotationCount += 1;
    }
  }

  return [...groups.values()]
    .map((group) => ({
      trustLevel: group.trustLevel,
      reason: group.reason,
      annotationCount: group.annotationCount,
      findingCount: group.findingCount,
      severityCounts: { ...group.severityCounts },
      findingIds: [...group.findingIds].sort(),
      paths: [...group.paths].sort(),
    }))
    .sort(compareSafetyReasonSummaries);
}

export function redactReplayArguments(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return redactSensitiveArguments(value);
}

export function sortAuditReplayEntries(
  entries: readonly AuditReplayEntry[],
): AuditReplayEntry[] {
  return entries.map(cloneJsonLike).sort(compareAuditReplayEntries);
}

function createSafetyReplaySummary(annotation: SafetyAnnotationLike): SafetyReplaySummary {
  const trustLevel = normalizeTrustLevel(annotation.trustLevel);
  const findings = annotation.findings.map((finding) => cloneJsonLike(finding));

  return {
    trustLevel,
    annotationCount: 1,
    findingCount: findings.length,
    reasonSummaries: summarizeSafetyFindings([annotation]),
    findings,
  };
}

interface InternalSafetyFindingReasonSummary {
  trustLevel: SafetyTrustLevel;
  reason: string;
  annotationCount: number;
  findingCount: number;
  severityCounts: Partial<Record<SafetyFindingSeverity | string, number>>;
  findingIds: Set<string>;
  paths: Set<string>;
}

function getSafetySummaryGroup(
  groups: Map<string, InternalSafetyFindingReasonSummary>,
  trustLevel: SafetyTrustLevel,
  reason: string,
): InternalSafetyFindingReasonSummary {
  const key = `${trustLevel}\u0000${reason}`;
  const existing = groups.get(key);
  if (existing) {
    return existing;
  }

  const group: InternalSafetyFindingReasonSummary = {
    trustLevel,
    reason,
    annotationCount: 0,
    findingCount: 0,
    severityCounts: {},
    findingIds: new Set(),
    paths: new Set(),
  };
  groups.set(key, group);
  return group;
}

function resourceOutcome(
  record: ResourceAuditRecordLike,
): { kind: AuditReplayEntryKind; status: AuditReplayStatus; title: string } {
  if (record.type === "operation_succeeded") {
    return {
      kind: "resource_read_succeeded",
      status: "succeeded",
      title: "Resource read succeeded",
    };
  }

  if (record.type === "operation_failed") {
    return {
      kind: "resource_read_failed",
      status: "failed",
      title: "Resource read failed",
    };
  }

  if (record.decision === "deny") {
    return {
      kind: "resource_read_denied",
      status: "denied",
      title: "Resource read denied",
    };
  }

  if (record.decision === "require_approval") {
    return {
      kind: "resource_read_approval_required",
      status: "approval_required",
      title: "Resource read requires approval",
    };
  }

  return {
    kind: "resource_policy_decision",
    status: record.decision === "allow" ? "approved" : "requested",
    title: "Resource policy decision",
  };
}

function terminalApprovalTimestamp(
  session: ApprovalSessionSnapshotLike,
): string | Date | undefined {
  if (session.status === "approved") {
    return session.approvedAt ?? session.decision?.at;
  }

  if (session.status === "rejected") {
    return session.rejectedAt ?? session.decision?.at;
  }

  if (session.status === "expired") {
    return session.expiredAt ?? session.decision?.at;
  }

  return undefined;
}

function terminalApprovalActor(
  session: ApprovalSessionSnapshotLike,
): ApprovalActorLike | undefined {
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

function summarizeApprovalRequest(request: Record<string, unknown>): string {
  if (typeof request.toolName === "string" && request.toolName.length > 0) {
    return request.toolName;
  }

  if (typeof request.path === "string" && request.path.length > 0) {
    return request.path;
  }

  if (typeof request.uri === "string" && request.uri.length > 0) {
    return request.uri;
  }

  if (isPlainRecord(request.operation) && typeof request.operation.type === "string") {
    return request.operation.type;
  }

  if (typeof request.type === "string" && request.type.length > 0) {
    return request.type;
  }

  return "request";
}

function readOperation(metadata: Record<string, unknown> | undefined): string | undefined {
  return typeof metadata?.operation === "string" ? metadata.operation : undefined;
}

function normalizeResourceUri(record: ResourceAuditRecordLike): string {
  if (typeof record.uri === "string" && record.uri.length > 0) {
    return record.uri;
  }

  if (typeof record.path === "string" && record.path.length > 0) {
    return record.path;
  }

  return "resource";
}

function compareAuditReplayEntries(
  left: AuditReplayEntry,
  right: AuditReplayEntry,
): number {
  const timeComparison = timestampSortValue(left.timestamp) - timestampSortValue(right.timestamp);
  if (timeComparison !== 0) {
    return timeComparison;
  }

  return left.id.localeCompare(right.id);
}

function compareSafetyReasonSummaries(
  left: SafetyFindingReasonSummary,
  right: SafetyFindingReasonSummary,
): number {
  const trustComparison =
    TRUST_ORDER[left.trustLevel] - TRUST_ORDER[right.trustLevel];
  if (trustComparison !== 0) {
    return trustComparison;
  }

  return left.reason.localeCompare(right.reason);
}

function timestampSortValue(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeTimestamp(value: string | Date | undefined): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return value;
  }

  return DEFAULT_TIMESTAMP;
}

function normalizeId(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function normalizeTrustLevel(value: unknown): SafetyTrustLevel {
  if (value === "trusted" || value === "review" || value === "untrusted") {
    return value;
  }

  return "review";
}

function normalizeReason(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : "Unspecified safety finding.";
}

function cloneRedactingArgumentFields<T>(value: T): T {
  return cloneRedactingArgumentFieldsInner(value, new WeakMap<object, unknown>());
}

function cloneRedactingArgumentFieldsInner<T>(
  value: T,
  seen: WeakMap<object, unknown>,
  key?: string,
): T {
  if (key === "arguments" && isPlainRecord(value)) {
    return redactReplayArguments(value) as T;
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString() as T;
  }

  const existing = seen.get(value as object);
  if (existing) {
    return existing as T;
  }

  if (Array.isArray(value)) {
    const cloned: unknown[] = [];
    seen.set(value, cloned);
    for (const entry of value) {
      cloned.push(cloneRedactingArgumentFieldsInner(entry, seen));
    }

    return cloned as T;
  }

  const cloned: Record<string, unknown> = {};
  seen.set(value as object, cloned);
  for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
    cloned[entryKey] = cloneRedactingArgumentFieldsInner(entryValue, seen, entryKey);
  }

  return cloned as T;
}

function cloneJsonLike<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString() as T;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => cloneJsonLike(entry)) as T;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
      key,
      cloneJsonLike(entryValue),
    ]),
  ) as T;
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

function isToolAuditRecordLike(value: unknown): value is ToolAuditRecordLike {
  return (
    isPlainRecord(value) &&
    typeof value.type === "string" &&
    value.type.startsWith("tool_call_") &&
    typeof value.toolName === "string"
  );
}

function isResourceAuditRecordLike(value: unknown): value is ResourceAuditRecordLike {
  return (
    isPlainRecord(value) &&
    typeof value.type === "string" &&
    (value.type === "policy_decision" ||
      value.type === "operation_succeeded" ||
      value.type === "operation_failed") &&
    (typeof value.uri === "string" || typeof value.path === "string")
  );
}

function isApprovalSessionSnapshotLike(value: unknown): value is ApprovalSessionSnapshotLike {
  return (
    isPlainRecord(value) &&
    typeof value.id === "string" &&
    typeof value.status === "string" &&
    isPlainRecord(value.request) &&
    (value.status === "pending" ||
      value.status === "approved" ||
      value.status === "rejected" ||
      value.status === "expired")
  );
}

function isSafetyAnnotationLike(value: unknown): value is SafetyAnnotationLike {
  return (
    isPlainRecord(value) &&
    typeof value.schemaVersion === "number" &&
    typeof value.trustLevel === "string" &&
    Array.isArray(value.reasons) &&
    Array.isArray(value.findings)
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
