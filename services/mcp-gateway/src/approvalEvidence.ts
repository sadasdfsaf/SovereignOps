import type {
  ApprovalSessionActor,
  ApprovalSessionSnapshot,
  ApprovalSessionStatus,
} from "./approvalSessions.ts";
import type { AuditRecord } from "./audit.ts";
import type { ToolAuditRecord } from "./auditEmitter.ts";

export type ApprovalEvidenceAuditRecord = AuditRecord | ToolAuditRecord;

export type ApprovalEvidenceResult =
  | "pending"
  | "approved"
  | "denied"
  | "expired";

export type ApprovalEvidenceExpiryState =
  | "not_configured"
  | "active"
  | "expired"
  | "terminal_before_expiry"
  | "terminal_after_expiry";

export type ApprovalEvidenceAuditCoverage = "present" | "missing";

export interface BuildApprovalEvidenceInput {
  session: ApprovalSessionSnapshot;
  auditRecords?: readonly ApprovalEvidenceAuditRecord[];
  now?: Date | string;
}

export interface ApprovalEvidenceExpiry {
  state: ApprovalEvidenceExpiryState;
  expired: boolean;
  evaluatedAt: string;
  expiresAt?: string;
}

export interface ApprovalEvidenceRequestSummary {
  action: string;
  toolName?: string;
  resource?: string;
  path?: string;
  capability?: string;
  details: Record<string, unknown>;
}

export interface ApprovalEvidenceActorRef {
  id: string;
  roles: string[];
}

export interface ApprovalEvidenceRefs {
  actorIds: string[];
  deviceIds: string[];
  workspaceIds: string[];
}

export interface ApprovalEvidencePolicySummary {
  result: ApprovalEvidenceResult;
  decision?: string;
  decisions: string[];
  ruleIds: string[];
  reasons: string[];
  approvalIds: string[];
}

export interface ApprovalEvidenceAuditEventRef {
  id: string;
  type: string;
  timestamp: string;
  actorId?: string;
  toolName?: string;
  path?: string;
  resource?: string;
  capability?: string;
  decision?: string;
  reason?: string;
  ruleId?: string;
  approvalId?: string;
  metadata?: Record<string, unknown>;
}

export interface ApprovalEvidenceMetadataSummary {
  session?: Record<string, unknown>;
  request?: Record<string, unknown>;
  requesterActor?: Record<string, unknown>;
  decision?: Record<string, unknown>;
  decisionActor?: Record<string, unknown>;
  audit?: { id: string; type: string; metadata: Record<string, unknown> }[];
}

export interface ApprovalEvidenceSummary {
  schemaVersion: 1;
  kind: "mcp_gateway_approval_evidence";
  session: {
    id: string;
    status: ApprovalSessionStatus;
    result: ApprovalEvidenceResult;
    createdAt: string;
    updatedAt: string;
    expiresAt?: string;
    reason?: string;
    ruleId?: string;
    expiry: ApprovalEvidenceExpiry;
  };
  request: ApprovalEvidenceRequestSummary;
  actors: {
    requester?: ApprovalEvidenceActorRef;
    decision?: ApprovalEvidenceActorRef;
  };
  refs: ApprovalEvidenceRefs;
  policy: ApprovalEvidencePolicySummary;
  audit: {
    coverage: ApprovalEvidenceAuditCoverage;
    eventRefs: ApprovalEvidenceAuditEventRef[];
  };
  metadata: ApprovalEvidenceMetadataSummary;
}

export const APPROVAL_EVIDENCE_REDACTED = "[REDACTED]";

const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const SECRET_NAME_PATTERN = /key|token|secret|password|bearer|auth/i;
const SECRET_VALUE_PATTERNS = [
  /\bBearer\s+\S+/i,
  /\b(?:api[-_ ]?key|access[-_ ]?key|token|secret|password|bearer|auth|authorization)\b\s*[:=]\s*\S+/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

const POLICY_DECISION_PRIORITY: readonly string[] = [
  "deny",
  "require_approval",
  "allow",
];

export function buildApprovalEvidenceSummary(
  input: BuildApprovalEvidenceInput,
): ApprovalEvidenceSummary {
  assertApprovalEvidenceInput(input);

  const session = input.session;
  const auditEventRefs = normalizeApprovalEvidenceAuditRecords(input.auditRecords ?? []);
  const result = approvalResult(session.status);
  const expiry = classifyApprovalEvidenceExpiry(session, input.now);
  const request = summarizeApprovalEvidenceRequest(session.request);
  const metadata = summarizeApprovalEvidenceMetadata(session, auditEventRefs);
  const refs = collectApprovalEvidenceRefs(session, auditEventRefs);

  return pruneUndefined({
    schemaVersion: 1,
    kind: "mcp_gateway_approval_evidence" as const,
    session: pruneUndefined({
      id: sanitizeString(session.id),
      status: session.status,
      result,
      createdAt: requireTimestamp(session.createdAt, "session.createdAt"),
      updatedAt: requireTimestamp(session.updatedAt, "session.updatedAt"),
      expiresAt: session.expiresAt
        ? normalizeTimestamp(session.expiresAt, "session.expiresAt")
        : undefined,
      reason: readString(session.reason),
      ruleId: readString(session.ruleId),
      expiry,
    }),
    request,
    actors: pruneUndefined({
      requester: actorRef(session.actor),
      decision: actorRef(decisionActor(session)),
    }),
    refs,
    policy: summarizePolicyEvidence(session, auditEventRefs, result),
    audit: {
      coverage: auditEventRefs.length > 0 ? "present" : "missing",
      eventRefs: auditEventRefs,
    },
    metadata,
  });
}

export const createApprovalEvidenceSummary = buildApprovalEvidenceSummary;
export const buildMcpApprovalEvidence = buildApprovalEvidenceSummary;
export const createMcpApprovalEvidenceSummary = buildApprovalEvidenceSummary;

export function assertApprovalEvidenceInput(
  input: BuildApprovalEvidenceInput,
): asserts input is BuildApprovalEvidenceInput {
  if (!isPlainRecord(input)) {
    throw new TypeError("Approval evidence input must be an object.");
  }

  assertApprovalEvidenceSession(input.session);

  if (
    input.auditRecords !== undefined &&
    !Array.isArray(input.auditRecords)
  ) {
    throw new TypeError("Approval evidence auditRecords must be an array when provided.");
  }

  for (const record of input.auditRecords ?? []) {
    assertApprovalEvidenceAuditRecord(record);
  }

  if (input.now !== undefined) {
    normalizeTimestamp(input.now, "approval evidence now");
  }
}

export function assertApprovalEvidenceSession(
  session: ApprovalSessionSnapshot,
): asserts session is ApprovalSessionSnapshot {
  if (!isPlainRecord(session)) {
    throw new TypeError("Approval evidence session must be an object.");
  }

  assertNonEmptyString(session.id, "Approval evidence session id");
  if (!isApprovalSessionStatus(session.status)) {
    throw new TypeError(`Unsupported approval session status: ${String(session.status)}.`);
  }
  requireTimestamp(session.createdAt, "session.createdAt");
  requireTimestamp(session.updatedAt, "session.updatedAt");
  if (session.expiresAt !== undefined) {
    normalizeTimestamp(session.expiresAt, "session.expiresAt");
  }
  if (!isPlainRecord(session.request)) {
    throw new TypeError("Approval evidence session request must be an object.");
  }
}

export function assertApprovalEvidenceAuditRecord(
  record: ApprovalEvidenceAuditRecord,
): asserts record is ApprovalEvidenceAuditRecord {
  if (!isPlainRecord(record)) {
    throw new TypeError("Approval evidence audit record must be an object.");
  }

  assertNonEmptyString(record.type, "Approval evidence audit record type");
  if (record.id !== undefined) {
    assertNonEmptyString(record.id, "Approval evidence audit record id");
  }
  if (record.timestamp !== undefined) {
    normalizeTimestamp(record.timestamp, "audit record timestamp");
  }
  if (record.metadata !== undefined && !isPlainRecord(record.metadata)) {
    throw new TypeError("Approval evidence audit record metadata must be an object.");
  }
}

export function normalizeApprovalEvidenceAuditRecords(
  records: readonly ApprovalEvidenceAuditRecord[],
): ApprovalEvidenceAuditEventRef[] {
  records.forEach(assertApprovalEvidenceAuditRecord);
  return sortApprovalEvidenceAuditEventRefs(
    records.map((record, index) => createAuditEventRef(record, index)),
  );
}

export function sortApprovalEvidenceAuditEventRefs(
  refs: readonly ApprovalEvidenceAuditEventRef[],
): ApprovalEvidenceAuditEventRef[] {
  return refs.map(cloneStable).sort(compareApprovalEvidenceAuditEventRefs);
}

export function compareApprovalEvidenceAuditEventRefs(
  left: ApprovalEvidenceAuditEventRef,
  right: ApprovalEvidenceAuditEventRef,
): number {
  const timeComparison =
    timestampSortValue(left.timestamp) - timestampSortValue(right.timestamp);
  if (timeComparison !== 0) {
    return timeComparison;
  }

  const idComparison = left.id.localeCompare(right.id);
  if (idComparison !== 0) {
    return idComparison;
  }

  return left.type.localeCompare(right.type);
}

export function classifyApprovalEvidenceExpiry(
  session: ApprovalSessionSnapshot,
  now?: Date | string,
): ApprovalEvidenceExpiry {
  assertApprovalEvidenceSession(session);

  const evaluatedAt = normalizeTimestamp(
    now ?? session.updatedAt ?? session.createdAt,
    "approval evidence evaluatedAt",
  );

  if (!session.expiresAt) {
    return {
      state: "not_configured",
      expired: false,
      evaluatedAt,
    };
  }

  const expiresAt = normalizeTimestamp(session.expiresAt, "session.expiresAt");

  if (session.status === "expired") {
    return {
      state: "expired",
      expired: true,
      evaluatedAt,
      expiresAt,
    };
  }

  const terminalAt = terminalDecisionTimestamp(session);
  if (terminalAt) {
    const terminalTimestamp = normalizeTimestamp(terminalAt, "terminal approval timestamp");
    const terminalAfterExpiry =
      timestampSortValue(terminalTimestamp) > timestampSortValue(expiresAt);

    return {
      state: terminalAfterExpiry
        ? "terminal_after_expiry"
        : "terminal_before_expiry",
      expired: terminalAfterExpiry,
      evaluatedAt,
      expiresAt,
    };
  }

  const isExpired = timestampSortValue(evaluatedAt) >= timestampSortValue(expiresAt);
  return {
    state: isExpired ? "expired" : "active",
    expired: isExpired,
    evaluatedAt,
    expiresAt,
  };
}

export function redactApprovalEvidenceMetadata<T>(value: T): T {
  return redactStable(value, new WeakMap<object, unknown>(), undefined) as T;
}

export const redactMcpApprovalEvidenceMetadata = redactApprovalEvidenceMetadata;

function summarizeApprovalEvidenceRequest(
  request: Record<string, unknown>,
): ApprovalEvidenceRequestSummary {
  const details = redactApprovalEvidenceMetadata(request);

  return pruneUndefined({
    action: requestAction(request),
    toolName: readString(request.toolName),
    resource: firstString(
      request.resource,
      request.resourceRef,
      request.uri,
      request.path,
      request.targetPath,
      request.targetRef,
    ),
    path: firstString(request.path, request.uri, request.targetPath),
    capability: readString(request.capability),
    details,
  });
}

function summarizePolicyEvidence(
  session: ApprovalSessionSnapshot,
  auditEventRefs: readonly ApprovalEvidenceAuditEventRef[],
  result: ApprovalEvidenceResult,
): ApprovalEvidencePolicySummary {
  const decisions = sortUniqueStrings(
    auditEventRefs.map((ref) => ref.decision).filter(isNonEmptyString),
  );
  const ruleIds = sortUniqueStrings([
    session.ruleId,
    ...auditEventRefs.map((ref) => ref.ruleId),
  ].filter(isNonEmptyString));
  const reasons = sortUniqueStrings([
    session.reason,
    session.decision?.reason,
    ...auditEventRefs.map((ref) => ref.reason),
  ].filter(isNonEmptyString));
  const approvalIds = sortUniqueStrings([
    session.id,
    ...auditEventRefs.map((ref) => ref.approvalId),
  ].filter(isNonEmptyString));

  return pruneUndefined({
    result,
    decision: choosePolicyDecision(decisions),
    decisions,
    ruleIds,
    reasons,
    approvalIds,
  });
}

function summarizeApprovalEvidenceMetadata(
  session: ApprovalSessionSnapshot,
  auditEventRefs: readonly ApprovalEvidenceAuditEventRef[],
): ApprovalEvidenceMetadataSummary {
  const auditMetadata = auditEventRefs
    .filter((ref) => ref.metadata && Object.keys(ref.metadata).length > 0)
    .map((ref) => ({
      id: ref.id,
      type: ref.type,
      metadata: ref.metadata as Record<string, unknown>,
    }));

  return pruneUndefined({
    session: session.metadata
      ? redactApprovalEvidenceMetadata(session.metadata)
      : undefined,
    request: requestMetadata(session.request),
    requesterActor: session.actor?.metadata
      ? redactApprovalEvidenceMetadata(session.actor.metadata)
      : undefined,
    decision: session.decision?.metadata
      ? redactApprovalEvidenceMetadata(session.decision.metadata)
      : undefined,
    decisionActor: decisionActor(session)?.metadata
      ? redactApprovalEvidenceMetadata(decisionActor(session)?.metadata)
      : undefined,
    audit: auditMetadata.length > 0 ? auditMetadata : undefined,
  });
}

function requestMetadata(
  request: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!isPlainRecord(request.metadata)) {
    return undefined;
  }

  return redactApprovalEvidenceMetadata(request.metadata);
}

function collectApprovalEvidenceRefs(
  session: ApprovalSessionSnapshot,
  auditEventRefs: readonly ApprovalEvidenceAuditEventRef[],
): ApprovalEvidenceRefs {
  const actorIds = new Set<string>();
  const deviceIds = new Set<string>();
  const workspaceIds = new Set<string>();

  addString(actorIds, session.actor?.id);
  addString(actorIds, session.decision?.actor?.id);
  addString(actorIds, session.approvedBy?.id);
  addString(actorIds, session.rejectedBy?.id);
  addString(actorIds, session.expiredBy?.id);

  for (const ref of auditEventRefs) {
    addString(actorIds, ref.actorId);
    collectRefsFromValue(ref, actorIds, deviceIds, workspaceIds);
  }

  collectRefsFromValue(session.request, actorIds, deviceIds, workspaceIds);
  collectRefsFromValue(session.metadata, actorIds, deviceIds, workspaceIds);
  collectRefsFromValue(session.actor?.metadata, actorIds, deviceIds, workspaceIds);
  collectRefsFromValue(session.decision?.metadata, actorIds, deviceIds, workspaceIds);
  collectRefsFromValue(decisionActor(session)?.metadata, actorIds, deviceIds, workspaceIds);

  return {
    actorIds: sortSet(actorIds),
    deviceIds: sortSet(deviceIds),
    workspaceIds: sortSet(workspaceIds),
  };
}

function createAuditEventRef(
  record: ApprovalEvidenceAuditRecord,
  index: number,
): ApprovalEvidenceAuditEventRef {
  const metadata = record.metadata
    ? redactApprovalEvidenceMetadata(record.metadata)
    : undefined;
  const type = sanitizeString(record.type);

  return pruneUndefined({
    id: readString(record.id) ?? `audit_${index + 1}_${type}`,
    type,
    timestamp: normalizeTimestamp(record.timestamp, "audit record timestamp"),
    actorId: readString((record as ToolAuditRecord).actorId),
    toolName: readString((record as ToolAuditRecord).toolName),
    path: firstString(
      (record as AuditRecord).path,
      readMetadataString(metadata, "path"),
    ),
    resource: firstString(
      readMetadataString(metadata, "resource"),
      readMetadataString(metadata, "resourceRef"),
      readMetadataString(metadata, "uri"),
      (record as AuditRecord).path,
    ),
    capability: readString((record as AuditRecord).capability),
    decision: readString(record.decision),
    reason: firstString(
      (record as ToolAuditRecord).reason,
      (record as AuditRecord).message,
    ),
    ruleId: readMetadataString(metadata, "ruleId"),
    approvalId: readMetadataString(metadata, "approvalId"),
    metadata,
  });
}

function requestAction(request: Record<string, unknown>): string {
  const operation = readString(request.operation);
  if (operation) {
    return operation;
  }

  if (
    isPlainRecord(request.operation) &&
    typeof request.operation.type === "string" &&
    request.operation.type.length > 0
  ) {
    return sanitizeString(request.operation.type);
  }

  const action = readString(request.action);
  if (action) {
    return action;
  }

  const type = readString(request.type);
  if (type) {
    return type;
  }

  if (typeof request.toolName === "string" && request.toolName.length > 0) {
    return "tools.call";
  }

  if (
    typeof request.path === "string" ||
    typeof request.uri === "string" ||
    typeof request.resource === "string"
  ) {
    return "resources.read";
  }

  return "approval.request";
}

function choosePolicyDecision(decisions: readonly string[]): string | undefined {
  if (decisions.length === 0) {
    return undefined;
  }

  for (const decision of POLICY_DECISION_PRIORITY) {
    if (decisions.includes(decision)) {
      return decision;
    }
  }

  return decisions[0];
}

function approvalResult(status: ApprovalSessionStatus): ApprovalEvidenceResult {
  if (status === "rejected") {
    return "denied";
  }

  return status;
}

function actorRef(actor: ApprovalSessionActor | undefined): ApprovalEvidenceActorRef | undefined {
  if (!actor) {
    return undefined;
  }

  return {
    id: sanitizeString(actor.id),
    roles: actor.roles ? [...actor.roles].map(sanitizeString).sort() : [],
  };
}

function decisionActor(
  session: ApprovalSessionSnapshot,
): ApprovalSessionActor | undefined {
  return (
    session.decision?.actor ??
    session.approvedBy ??
    session.rejectedBy ??
    session.expiredBy
  );
}

function terminalDecisionTimestamp(session: ApprovalSessionSnapshot): Date | string | undefined {
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

function collectRefsFromValue(
  value: unknown,
  actorIds: Set<string>,
  deviceIds: Set<string>,
  workspaceIds: Set<string>,
  seen = new WeakSet<object>(),
  key?: string,
): void {
  if (value === null || value === undefined) {
    return;
  }

  if (typeof value === "string" || typeof value === "number") {
    const ref = String(value);
    const normalizedKey = normalizeRefKey(key);
    if (normalizedKey && isRefKey(normalizedKey, "actor")) {
      addString(actorIds, ref);
    } else if (normalizedKey && isRefKey(normalizedKey, "device")) {
      addString(deviceIds, ref);
    } else if (normalizedKey && isRefKey(normalizedKey, "workspace")) {
      addString(workspaceIds, ref);
    }
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  if (seen.has(value)) {
    return;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectRefsFromValue(entry, actorIds, deviceIds, workspaceIds, seen, key);
    }
    return;
  }

  for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
    collectRefsFromValue(entryValue, actorIds, deviceIds, workspaceIds, seen, entryKey);
  }
}

function normalizeRefKey(key: string | undefined): string | undefined {
  return key?.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isRefKey(
  key: string,
  kind: "actor" | "device" | "workspace",
): boolean {
  if (kind === "actor") {
    return key === "actorid" || key === "userid" || key === "requesterid" || key === "reviewerid";
  }

  if (kind === "device") {
    return key === "deviceid" || key === "deviceref" || key === "device";
  }

  return key === "workspaceid" || key === "workspaceref" || key === "workspace";
}

function redactStable<T>(
  value: T,
  seen: WeakMap<object, unknown>,
  key: string | undefined,
): unknown {
  if (key && SECRET_NAME_PATTERN.test(key)) {
    return APPROVAL_EVIDENCE_REDACTED;
  }

  if (typeof value === "string") {
    return SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))
      ? APPROVAL_EVIDENCE_REDACTED
      : value;
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const existing = seen.get(value as object);
  if (existing) {
    return "[Circular]";
  }

  if (Array.isArray(value)) {
    const cloned: unknown[] = [];
    seen.set(value, cloned);
    for (const entry of value) {
      cloned.push(redactStable(entry, seen, undefined));
    }
    return cloned;
  }

  const cloned: Record<string, unknown> = {};
  seen.set(value as object, cloned);
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right),
  );

  for (const [entryKey, entryValue] of entries) {
    cloned[entryKey] = redactStable(entryValue, seen, entryKey);
  }

  return cloned;
}

function cloneStable<T>(value: T): T {
  return redactStable(value, new WeakMap<object, unknown>(), undefined) as T;
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

function normalizeTimestamp(value: Date | string | undefined, name: string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value === undefined) {
    return DEFAULT_TIMESTAMP;
  }

  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${name} must be a valid timestamp.`);
  }

  return value;
}

function requireTimestamp(value: Date | string | undefined, name: string): string {
  if (value === undefined) {
    throw new TypeError(`${name} must be a valid timestamp.`);
  }

  return normalizeTimestamp(value, name);
}

function timestampSortValue(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function readString(value: unknown): string | undefined {
  return isNonEmptyString(value) ? sanitizeString(value) : undefined;
}

function readMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  return metadata ? readString(metadata[key]) : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  const value = values.find(isNonEmptyString);
  return value ? sanitizeString(value) : undefined;
}

function sortUniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map(sanitizeString))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function sortSet(values: Set<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function addString(values: Set<string>, value: unknown): void {
  if (isNonEmptyString(value)) {
    values.add(sanitizeString(value));
  }
}

function assertNonEmptyString(value: unknown, name: string): asserts value is string {
  if (!isNonEmptyString(value)) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function sanitizeString(value: string): string {
  return redactStable(value, new WeakMap<object, unknown>(), undefined) as string;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isApprovalSessionStatus(value: unknown): value is ApprovalSessionStatus {
  return (
    value === "pending" ||
    value === "approved" ||
    value === "rejected" ||
    value === "expired"
  );
}
