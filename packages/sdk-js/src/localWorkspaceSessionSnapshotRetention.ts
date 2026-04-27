import { createHash } from "node:crypto";

import type { DeepReadonly } from "./workspace.ts";

export const LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_SCHEMA_VERSION =
  "local-workspace-session-snapshot-retention/v1";

export const LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_ERROR_CODES = Object.freeze({
  INVALID_INPUT: "LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_INVALID_INPUT",
  INVALID_RETENTION_POLICY:
    "LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_INVALID_RETENTION_POLICY",
});

export type LocalWorkspaceSessionSnapshotRetentionErrorCode =
  (typeof LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_ERROR_CODES)[keyof typeof LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_ERROR_CODES];

export type LocalWorkspaceSessionSnapshotRetentionCleanupActionKind =
  | "delete"
  | "keep"
  | "review";

export type LocalWorkspaceSessionSnapshotRetentionCleanupReason =
  | "duplicate-snapshot-id"
  | "exceeds-max-age"
  | "exceeds-max-count"
  | "invalid-metadata"
  | "missing-created-at"
  | "missing-snapshot-id"
  | "path-traversal"
  | "raw-lock-token"
  | "raw-secret"
  | "requires-review"
  | "unsafe-absolute-path"
  | "within-max-age"
  | "within-max-count"
  | "within-policy";

export type LocalWorkspaceSessionSnapshotRetentionCleanupIssueKind =
  | "duplicate-snapshot-id"
  | "invalid-created-at"
  | "invalid-metadata"
  | "invalid-snapshot-id"
  | "missing-created-at"
  | "missing-snapshot-id"
  | "path-traversal"
  | "raw-lock-token"
  | "raw-secret"
  | "unsafe-absolute-path";

export type LocalWorkspaceSessionSnapshotRetentionCleanupSourceKind =
  | "file-metadata"
  | "snapshot-record"
  | "snapshot-record-summary"
  | "unknown";

export interface LocalWorkspaceSessionSnapshotRetentionErrorOptions {
  readonly cause?: unknown;
  readonly details?: Readonly<Record<string, unknown>>;
}

export class LocalWorkspaceSessionSnapshotRetentionError extends TypeError {
  readonly code: LocalWorkspaceSessionSnapshotRetentionErrorCode;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    code: LocalWorkspaceSessionSnapshotRetentionErrorCode,
    message: string,
    options: LocalWorkspaceSessionSnapshotRetentionErrorOptions = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "LocalWorkspaceSessionSnapshotRetentionError";
    this.code = code;
    this.details =
      options.details === undefined ? undefined : deepFreezeClone(options.details);
  }
}

export interface LocalWorkspaceSessionSnapshotRetentionCleanupInput {
  readonly entries?: readonly unknown[];
  readonly files?: readonly unknown[];
  readonly records?: readonly unknown[];
  readonly maxCount?: number;
  readonly maxAgeMs?: number;
  readonly now?: string;
  readonly clock?: () => string;
}

export interface LocalWorkspaceSessionSnapshotRetentionCleanupThresholds {
  readonly maxCount?: number;
  readonly maxAgeMs?: number;
  readonly now?: string;
  readonly cutoffAt?: string;
}

export interface LocalWorkspaceSessionSnapshotRetentionCleanupIssue {
  readonly kind: "localWorkspaceSessionSnapshotRetentionCleanupIssue";
  readonly issueKind: LocalWorkspaceSessionSnapshotRetentionCleanupIssueKind;
  readonly path: string;
  readonly reason: LocalWorkspaceSessionSnapshotRetentionCleanupReason;
  readonly message: string;
}

export interface LocalWorkspaceSessionSnapshotRetentionCleanupSummary {
  readonly kind: "localWorkspaceSessionSnapshotRetentionCleanupSummary";
  readonly sourceKind: LocalWorkspaceSessionSnapshotRetentionCleanupSourceKind;
  readonly auditSafe: true;
  readonly redacted: true;
  readonly snapshotId?: string;
  readonly workspaceId?: string;
  readonly deviceId?: string;
  readonly sessionId?: string;
  readonly label?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly ageMs?: number;
  readonly fileRef?: string;
  readonly filePathKind?: "absolute" | "relative";
  readonly sizeBytes?: number;
  readonly fingerprint?: string;
  readonly snapshotFingerprint?: string;
  readonly operationCount?: number;
}

export interface LocalWorkspaceSessionSnapshotRetentionCleanupAction {
  readonly kind: "localWorkspaceSessionSnapshotRetentionCleanupAction";
  readonly action: LocalWorkspaceSessionSnapshotRetentionCleanupActionKind;
  readonly reasons: readonly LocalWorkspaceSessionSnapshotRetentionCleanupReason[];
  readonly sourceIndex: number;
  readonly rank?: number;
  readonly summary: LocalWorkspaceSessionSnapshotRetentionCleanupSummary;
  readonly issues: readonly LocalWorkspaceSessionSnapshotRetentionCleanupIssue[];
}

export interface LocalWorkspaceSessionSnapshotRetentionCleanupPlan {
  readonly kind: "localWorkspaceSessionSnapshotRetentionCleanupPlan";
  readonly schemaVersion: typeof LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly dryRun: true;
  readonly durableWrites: false;
  readonly thresholds: LocalWorkspaceSessionSnapshotRetentionCleanupThresholds;
  readonly entryCount: number;
  readonly keepCount: number;
  readonly deleteCount: number;
  readonly reviewCount: number;
  readonly actions: readonly LocalWorkspaceSessionSnapshotRetentionCleanupAction[];
  readonly keepActions: readonly LocalWorkspaceSessionSnapshotRetentionCleanupAction[];
  readonly deleteActions: readonly LocalWorkspaceSessionSnapshotRetentionCleanupAction[];
  readonly reviewActions: readonly LocalWorkspaceSessionSnapshotRetentionCleanupAction[];
}

interface CleanupDraft {
  readonly sourceIndex: number;
  readonly sourceKind: LocalWorkspaceSessionSnapshotRetentionCleanupSourceKind;
  readonly snapshotId?: string;
  readonly createdAt?: string;
  readonly createdAtMs?: number;
  readonly updatedAt?: string;
  readonly summary: Omit<LocalWorkspaceSessionSnapshotRetentionCleanupSummary, "kind">;
  readonly issues: LocalWorkspaceSessionSnapshotRetentionCleanupIssue[];
}

interface CleanupPolicy {
  readonly maxCount?: number;
  readonly maxAgeMs?: number;
  readonly now?: string;
  readonly nowMs?: number;
  readonly cutoffAt?: string;
  readonly cutoffMs?: number;
}

const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SNAPSHOT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,160}$/;
const SHA256_FINGERPRINT_PATTERN = /^sha256:[a-f0-9]{64}$/;
const REDACTED_VALUE_PATTERN = /^\[redacted:[A-Za-z0-9_-]+:[a-z0-9]+\]$/;
const REDACTED_PATH_PATTERN = /^\[redacted:path:[a-z0-9]+\]$/;
const REDACTED_LOCK_TOKEN_PATTERN = /^\[redacted:lockToken:[a-z0-9]+\]$/;
const RAW_LOCK_TOKEN_PATTERN = /^lock_[A-Za-z0-9_-]{4,}$/;
const RAW_SECRET_PATTERNS = Object.freeze([
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/i,
  /\b(?:sk-[A-Za-z0-9_-]{8,}|sk_[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,})\b/i,
  /\b(?:apiKey|api[_-]?key|token|password|secret)\s*[:=]\s*["']?[^"',;\s]+/i,
]);
const PATH_KEYS = Object.freeze([
  "absolutePath",
  "filePath",
  "path",
  "relativePath",
  "storagePath",
] as const);

export function planLocalWorkspaceSessionSnapshotRetentionCleanup(
  input: LocalWorkspaceSessionSnapshotRetentionCleanupInput,
): DeepReadonly<LocalWorkspaceSessionSnapshotRetentionCleanupPlan> {
  if (!isRecord(input)) {
    throw invalidInput("retention cleanup input must be an object", { path: "" });
  }

  const entries = readEntries(input);
  const policy = readPolicy(input);
  const drafts = entries.map((entry, index) => normalizeCleanupDraft(entry, index, policy));
  applyDuplicateSnapshotIssues(drafts);

  const reviewActions = drafts
    .filter((draft) => draft.issues.length > 0)
    .map((draft) => reviewAction(draft));
  const retentionActions = drafts
    .filter((draft) => draft.issues.length === 0)
    .sort(compareCleanupDrafts)
    .map((draft, index) => retentionAction(draft, index + 1, policy));
  const keepActions = retentionActions.filter((action) => action.action === "keep");
  const deleteActions = retentionActions.filter((action) => action.action === "delete");
  const actions = [...keepActions, ...deleteActions, ...reviewActions]
    .sort(compareCleanupActions);

  return deepFreezeClone({
    kind: "localWorkspaceSessionSnapshotRetentionCleanupPlan" as const,
    schemaVersion: LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_SCHEMA_VERSION,
    localOnly: true as const,
    dryRun: true as const,
    durableWrites: false as const,
    thresholds: optionalFields({
      maxCount: policy.maxCount,
      maxAgeMs: policy.maxAgeMs,
      now: policy.now,
      cutoffAt: policy.cutoffAt,
    }),
    entryCount: drafts.length,
    keepCount: keepActions.length,
    deleteCount: deleteActions.length,
    reviewCount: reviewActions.length,
    actions,
    keepActions,
    deleteActions,
    reviewActions,
  });
}

export function planFileBackedLocalWorkspaceSessionSnapshotRetentionCleanup(
  input: LocalWorkspaceSessionSnapshotRetentionCleanupInput,
): DeepReadonly<LocalWorkspaceSessionSnapshotRetentionCleanupPlan> {
  return planLocalWorkspaceSessionSnapshotRetentionCleanup(input);
}

export function planSnapshotRetentionCleanupDryRun(
  input: LocalWorkspaceSessionSnapshotRetentionCleanupInput,
): DeepReadonly<LocalWorkspaceSessionSnapshotRetentionCleanupPlan> {
  return planLocalWorkspaceSessionSnapshotRetentionCleanup(input);
}

function readEntries(
  input: LocalWorkspaceSessionSnapshotRetentionCleanupInput,
): readonly unknown[] {
  const entryFields = [
    ["entries", input.entries],
    ["files", input.files],
    ["records", input.records],
  ] as const;
  const present = entryFields.filter(([, value]) => value !== undefined);
  if (present.length !== 1) {
    throw invalidInput("input must include exactly one entries, files, or records array", {
      path: "",
    });
  }

  const [field, value] = present[0];
  if (!Array.isArray(value)) {
    throw invalidInput("retention cleanup entries must be an array", { path: field });
  }
  return value;
}

function readPolicy(input: LocalWorkspaceSessionSnapshotRetentionCleanupInput): CleanupPolicy {
  const maxCount = optionalNonNegativeInteger(input.maxCount, "maxCount");
  const maxAgeMs = optionalNonNegativeInteger(input.maxAgeMs, "maxAgeMs");
  const now = maxAgeMs === undefined
    ? undefined
    : requirePolicyIsoTimestamp(input.now ?? input.clock?.(), "now");
  const nowMs = now === undefined ? undefined : Date.parse(now);
  const cutoffMs = nowMs === undefined || maxAgeMs === undefined
    ? undefined
    : nowMs - maxAgeMs;
  const cutoffAt = cutoffMs === undefined ? undefined : new Date(cutoffMs).toISOString();

  return {
    maxCount,
    maxAgeMs,
    now,
    nowMs,
    cutoffAt,
    cutoffMs,
  };
}

function normalizeCleanupDraft(
  input: unknown,
  sourceIndex: number,
  policy: CleanupPolicy,
): CleanupDraft {
  const path = `entries.${sourceIndex}`;
  const issues: LocalWorkspaceSessionSnapshotRetentionCleanupIssue[] = [];
  if (!isRecord(input)) {
    issues.push(cleanupIssue(
      "invalid-metadata",
      path,
      "invalid-metadata",
      "cleanup entry must be an object",
    ));
    return {
      sourceIndex,
      sourceKind: "unknown",
      summary: summaryRecord({
        sourceKind: "unknown",
      }),
      issues,
    };
  }

  collectSafetyIssues(input, path, issues);

  const filePath = firstStringField(input, PATH_KEYS);
  const record = readRecordCandidate(input);
  const summarySource = record ?? input;
  const sourceKind = classifySourceKind(input, record);
  const snapshot = isRecord(summarySource.snapshot) ? summarySource.snapshot : undefined;
  const snapshotSummary = isRecord(snapshot?.summary) ? snapshot.summary : undefined;
  const directSummary = isRecord(summarySource.summary) ? summarySource.summary : undefined;
  const summary = snapshotSummary ?? directSummary;

  const snapshotId = readIdentifier(firstDefined(
    summarySource.snapshotId,
    input.snapshotId,
  ), "snapshotId", SNAPSHOT_ID_PATTERN);
  if (snapshotId === undefined) {
    issues.push(cleanupIssue(
      "missing-snapshot-id",
      joinPath(path, "snapshotId"),
      "missing-snapshot-id",
      "cleanup entry must include a safe snapshotId",
    ));
  } else if (snapshotId === null) {
    issues.push(cleanupIssue(
      "invalid-snapshot-id",
      joinPath(path, "snapshotId"),
      "invalid-metadata",
      "cleanup entry snapshotId is not safe for retention planning",
    ));
  }

  const createdAtValue = firstDefined(
    summarySource.createdAt,
    input.createdAt,
    input.birthtime,
    input.ctime,
    input.mtime,
    input.modifiedAt,
    input.lastModifiedAt,
    input.birthtimeMs,
    input.ctimeMs,
    input.mtimeMs,
    input.modifiedAtMs,
    input.lastModifiedMs,
  );
  const createdAt = readTimestamp(createdAtValue);
  if (createdAt === undefined) {
    issues.push(cleanupIssue(
      "missing-created-at",
      joinPath(path, "createdAt"),
      "missing-created-at",
      "cleanup entry must include a createdAt or file timestamp",
    ));
  } else if (createdAt === null) {
    issues.push(cleanupIssue(
      "invalid-created-at",
      joinPath(path, "createdAt"),
      "invalid-metadata",
      "cleanup entry timestamp must be an ISO timestamp or safe epoch milliseconds",
    ));
  }

  const updatedAt = readTimestamp(firstDefined(
    summarySource.updatedAt,
    input.updatedAt,
    input.mtime,
    input.modifiedAt,
    input.mtimeMs,
    input.modifiedAtMs,
  ));
  const createdAtMs = typeof createdAt === "string" ? Date.parse(createdAt) : undefined;
  const fileRef = typeof filePath === "string"
    ? redactReference("path", normalizePathForReference(filePath))
    : undefined;

  return {
    sourceIndex,
    sourceKind,
    snapshotId: typeof snapshotId === "string" ? snapshotId : undefined,
    createdAt: typeof createdAt === "string" ? createdAt : undefined,
    createdAtMs,
    updatedAt: typeof updatedAt === "string" ? updatedAt : undefined,
    summary: summaryRecord({
      sourceKind,
      snapshotId: typeof snapshotId === "string" ? snapshotId : undefined,
      workspaceId: readIdentifier(firstDefined(
        summary?.workspaceId,
        summarySource.workspaceId,
        input.workspaceId,
      ), "workspaceId", ID_PATTERN),
      deviceId: readIdentifier(firstDefined(
        summary?.deviceId,
        summarySource.deviceId,
        input.deviceId,
      ), "deviceId", ID_PATTERN),
      sessionId: readIdentifier(firstDefined(
        summary?.sessionId,
        summarySource.sessionId,
        input.sessionId,
      ), "sessionId", ID_PATTERN),
      label: readSafeString(firstDefined(summarySource.label, input.label)),
      createdAt: typeof createdAt === "string" ? createdAt : undefined,
      updatedAt: typeof updatedAt === "string" ? updatedAt : undefined,
      ageMs: policy.nowMs !== undefined && createdAtMs !== undefined
        ? policy.nowMs - createdAtMs
        : undefined,
      fileRef,
      filePathKind: typeof filePath === "string"
        ? isAbsolutePath(filePath) ? "absolute" as const : "relative" as const
        : undefined,
      sizeBytes: readNonNegativeInteger(firstDefined(
        input.sizeBytes,
        input.size,
        input.byteLength,
      )),
      fingerprint: readFingerprint(firstDefined(summarySource.fingerprint, input.fingerprint)),
      snapshotFingerprint: readFingerprint(firstDefined(
        summarySource.snapshotFingerprint,
        input.snapshotFingerprint,
      )),
      operationCount: readOperationCount(summarySource, summary),
    }),
    issues,
  };
}

function readRecordCandidate(input: Record<string, unknown>): Record<string, unknown> | undefined {
  if (
    input.kind === "workspace-session.snapshot-record" ||
    isSnapshotRecordSummary(input)
  ) {
    return input;
  }
  if (
    (input.kind === "workspace-session.snapshot-record.created" ||
      input.kind === "workspace-session.snapshot-record.read") &&
    isRecord(input.record)
  ) {
    return input.record;
  }
  if (isRecord(input.record)) {
    return input.record;
  }
  if (isRecord(input.snapshotRecord)) {
    return input.snapshotRecord;
  }
  return undefined;
}

function classifySourceKind(
  input: Record<string, unknown>,
  record: Record<string, unknown> | undefined,
): LocalWorkspaceSessionSnapshotRetentionCleanupSourceKind {
  if (firstStringField(input, PATH_KEYS) !== undefined || record !== undefined && record !== input) {
    return "file-metadata";
  }
  if (input.kind === "workspace-session.snapshot-record" || isRecord(input.snapshot)) {
    return "snapshot-record";
  }
  if (isSnapshotRecordSummary(input)) {
    return "snapshot-record-summary";
  }
  return "unknown";
}

function isSnapshotRecordSummary(input: Record<string, unknown>): boolean {
  return typeof input.snapshotId === "string" &&
    (typeof input.createdAt === "string" || typeof input.mtimeMs === "number") &&
    (Array.isArray(input.operations) || typeof input.eventCount === "number");
}

function collectSafetyIssues(
  value: unknown,
  path: string,
  issues: LocalWorkspaceSessionSnapshotRetentionCleanupIssue[],
  seen: WeakSet<object> = new WeakSet(),
  key?: string,
): void {
  if (typeof value === "string") {
    collectStringSafetyIssues(value, path, issues, key);
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  if (seen.has(value)) {
    issues.push(cleanupIssue(
      "invalid-metadata",
      path,
      "invalid-metadata",
      "cleanup entry must not contain circular references",
    ));
    return;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      collectSafetyIssues(entry, `${path}.${index}`, issues, seen)
    );
  } else if (isRecord(value)) {
    for (const [entryKey, entryValue] of Object.entries(value)) {
      collectSafetyIssues(entryValue, joinPath(path, entryKey), issues, seen, entryKey);
    }
  }

  seen.delete(value);
}

function collectStringSafetyIssues(
  value: string,
  path: string,
  issues: LocalWorkspaceSessionSnapshotRetentionCleanupIssue[],
  key: string | undefined,
): void {
  if (REDACTED_VALUE_PATTERN.test(value)) {
    return;
  }
  if (isPathKey(key)) {
    if (isAbsolutePath(value) && !REDACTED_PATH_PATTERN.test(value)) {
      issues.push(cleanupIssue(
        "unsafe-absolute-path",
        path,
        "unsafe-absolute-path",
        "cleanup entry contains an absolute path and requires review",
      ));
    }
    if (hasTraversalSegment(value)) {
      issues.push(cleanupIssue(
        "path-traversal",
        path,
        "path-traversal",
        "cleanup entry contains path traversal and requires review",
      ));
    }
  }
  if (isRawLockToken(value, key)) {
    issues.push(cleanupIssue(
      "raw-lock-token",
      path,
      "raw-lock-token",
      "cleanup entry contains raw lock-token-like material",
    ));
    return;
  }
  if (isRawSecret(value, key)) {
    issues.push(cleanupIssue(
      "raw-secret",
      path,
      "raw-secret",
      "cleanup entry contains raw secret-like material",
    ));
  }
}

function applyDuplicateSnapshotIssues(drafts: readonly CleanupDraft[]): void {
  const bySnapshotId = new Map<string, CleanupDraft[]>();
  for (const draft of drafts) {
    if (draft.snapshotId === undefined) {
      continue;
    }
    const matches = bySnapshotId.get(draft.snapshotId) ?? [];
    matches.push(draft);
    bySnapshotId.set(draft.snapshotId, matches);
  }

  for (const [snapshotId, matches] of bySnapshotId) {
    if (matches.length < 2) {
      continue;
    }
    for (const draft of matches) {
      draft.issues.push(cleanupIssue(
        "duplicate-snapshot-id",
        "snapshotId",
        "duplicate-snapshot-id",
        `snapshotId ${snapshotId} appears in more than one cleanup entry`,
      ));
    }
  }
}

function reviewAction(
  draft: CleanupDraft,
): LocalWorkspaceSessionSnapshotRetentionCleanupAction {
  return {
    kind: "localWorkspaceSessionSnapshotRetentionCleanupAction",
    action: "review",
    reasons: reviewReasons(draft.issues),
    sourceIndex: draft.sourceIndex,
    summary: actionSummary(draft),
    issues: draft.issues.slice().sort(compareCleanupIssues),
  };
}

function retentionAction(
  draft: CleanupDraft,
  rank: number,
  policy: CleanupPolicy,
): LocalWorkspaceSessionSnapshotRetentionCleanupAction {
  const deleteReasons: LocalWorkspaceSessionSnapshotRetentionCleanupReason[] = [];
  const keepReasons: LocalWorkspaceSessionSnapshotRetentionCleanupReason[] = [];

  if (policy.maxCount !== undefined) {
    if (rank > policy.maxCount) {
      deleteReasons.push("exceeds-max-count");
    } else {
      keepReasons.push("within-max-count");
    }
  }
  if (policy.cutoffMs !== undefined && draft.createdAtMs !== undefined) {
    if (draft.createdAtMs < policy.cutoffMs) {
      deleteReasons.push("exceeds-max-age");
    } else {
      keepReasons.push("within-max-age");
    }
  }

  const action = deleteReasons.length > 0 ? "delete" : "keep";
  const reasons = action === "delete"
    ? deleteReasons
    : keepReasons.length > 0
      ? keepReasons
      : ["within-policy" as const];

  return {
    kind: "localWorkspaceSessionSnapshotRetentionCleanupAction",
    action,
    reasons,
    sourceIndex: draft.sourceIndex,
    rank,
    summary: actionSummary(draft),
    issues: [],
  };
}

function actionSummary(
  draft: CleanupDraft,
): LocalWorkspaceSessionSnapshotRetentionCleanupSummary {
  return {
    kind: "localWorkspaceSessionSnapshotRetentionCleanupSummary",
    ...draft.summary,
  };
}

function summaryRecord(
  input: Omit<LocalWorkspaceSessionSnapshotRetentionCleanupSummary, "kind">,
): Omit<LocalWorkspaceSessionSnapshotRetentionCleanupSummary, "kind"> {
  return optionalFields({
    auditSafe: true as const,
    redacted: true as const,
    ...input,
  });
}

function reviewReasons(
  issues: readonly LocalWorkspaceSessionSnapshotRetentionCleanupIssue[],
): readonly LocalWorkspaceSessionSnapshotRetentionCleanupReason[] {
  return Array.from(new Set([
    "requires-review" as const,
    ...issues.map((issue) => issue.reason),
  ])).sort(compareReasonOrder);
}

function cleanupIssue(
  issueKind: LocalWorkspaceSessionSnapshotRetentionCleanupIssueKind,
  path: string,
  reason: LocalWorkspaceSessionSnapshotRetentionCleanupReason,
  message: string,
): LocalWorkspaceSessionSnapshotRetentionCleanupIssue {
  return {
    kind: "localWorkspaceSessionSnapshotRetentionCleanupIssue",
    issueKind,
    path,
    reason,
    message,
  };
}

function compareCleanupDrafts(left: CleanupDraft, right: CleanupDraft): number {
  return (right.createdAtMs ?? 0) - (left.createdAtMs ?? 0) ||
    compareStrings(left.snapshotId ?? "", right.snapshotId ?? "") ||
    left.sourceIndex - right.sourceIndex;
}

function compareCleanupActions(
  left: LocalWorkspaceSessionSnapshotRetentionCleanupAction,
  right: LocalWorkspaceSessionSnapshotRetentionCleanupAction,
): number {
  return actionRank(left.action) - actionRank(right.action) ||
    (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER) ||
    left.sourceIndex - right.sourceIndex;
}

function compareCleanupIssues(
  left: LocalWorkspaceSessionSnapshotRetentionCleanupIssue,
  right: LocalWorkspaceSessionSnapshotRetentionCleanupIssue,
): number {
  return compareStrings(left.path, right.path) ||
    compareStrings(left.issueKind, right.issueKind);
}

function actionRank(action: LocalWorkspaceSessionSnapshotRetentionCleanupActionKind): number {
  switch (action) {
    case "keep":
      return 0;
    case "delete":
      return 1;
    case "review":
      return 2;
  }
}

function compareReasonOrder(
  left: LocalWorkspaceSessionSnapshotRetentionCleanupReason,
  right: LocalWorkspaceSessionSnapshotRetentionCleanupReason,
): number {
  return reasonRank(left) - reasonRank(right) || compareStrings(left, right);
}

function reasonRank(reason: LocalWorkspaceSessionSnapshotRetentionCleanupReason): number {
  switch (reason) {
    case "requires-review":
      return 0;
    case "invalid-metadata":
    case "missing-created-at":
    case "missing-snapshot-id":
    case "duplicate-snapshot-id":
      return 1;
    case "unsafe-absolute-path":
    case "path-traversal":
    case "raw-lock-token":
    case "raw-secret":
      return 2;
    default:
      return 3;
  }
}

function readIdentifier(
  value: unknown,
  field: string,
  pattern: RegExp,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!pattern.test(trimmed) || isRawSecret(trimmed, field)) {
    return null;
  }
  return trimmed;
}

function readSafeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || isRawSecret(trimmed, "label")) {
    return undefined;
  }
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
}

function readFingerprint(value: unknown): string | undefined {
  return typeof value === "string" && SHA256_FINGERPRINT_PATTERN.test(value)
    ? value
    : undefined;
}

function readTimestamp(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return isIsoTimestamp(value) ? value : null;
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return isoTimestampFromDate(new Date(value));
  }
  if (value instanceof Date) {
    return isoTimestampFromDate(value);
  }
  return null;
}

function isoTimestampFromDate(value: Date): string | null {
  if (!Number.isFinite(value.getTime())) {
    return null;
  }
  try {
    const timestamp = value.toISOString();
    return isIsoTimestamp(timestamp) ? timestamp : null;
  } catch {
    return null;
  }
}

function readOperationCount(
  source: Record<string, unknown>,
  summary: Record<string, unknown> | undefined,
): number | undefined {
  const eventCount = readNonNegativeInteger(firstDefined(
    summary?.eventCount,
    source.eventCount,
  ));
  if (eventCount !== undefined) {
    return eventCount;
  }

  const operations = firstDefined(summary?.operations, source.operations);
  return Array.isArray(operations) ? operations.length : undefined;
}

function readNonNegativeInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? value as number
    : undefined;
}

function optionalNonNegativeInteger(value: unknown, path: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw invalidRetentionPolicy("value must be a non-negative safe integer", { path });
  }
  return value as number;
}

function requirePolicyIsoTimestamp(value: unknown, path: string): string {
  if (typeof value !== "string" || !isIsoTimestamp(value)) {
    throw invalidRetentionPolicy("value must be an ISO timestamp", { path });
  }
  return value;
}

function isIsoTimestamp(value: string): boolean {
  if (!ISO_TIMESTAMP_PATTERN.test(value)) {
    return false;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function firstStringField(
  record: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return undefined;
}

function firstDefined<T>(...values: readonly T[]): T | undefined {
  return values.find((value) => value !== undefined);
}

function isPathKey(key: string | undefined): boolean {
  return key !== undefined && /(?:^|\.|_|-)(?:absolute)?(?:file|storage)?path$/i.test(key);
}

function isAbsolutePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) ||
    /^\/(?!\/)/.test(value) ||
    /^\\\\/.test(value);
}

function hasTraversalSegment(value: string): boolean {
  return /(^|[\\/])\.\.([\\/]|$)/.test(value);
}

function normalizePathForReference(value: string): string {
  return value.replace(/\\/g, "/");
}

function isRawLockToken(value: string, key: string | undefined): boolean {
  if (REDACTED_LOCK_TOKEN_PATTERN.test(value)) {
    return false;
  }
  return RAW_LOCK_TOKEN_PATTERN.test(value) &&
    (key === undefined || /lock[_-]?token/i.test(key));
}

function isRawSecret(value: string, key: string | undefined): boolean {
  if (REDACTED_VALUE_PATTERN.test(value)) {
    return false;
  }
  if (key !== undefined && /authorization|credential|password|secret|api[._-]?key/i.test(key)) {
    return value.trim().length > 0;
  }
  if (key !== undefined && /token/i.test(key) && !/lock[_-]?token/i.test(key)) {
    return value.trim().length > 0;
  }
  return RAW_SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

function redactReference(kind: "path", value: string): string {
  return `[redacted:${kind}:${createHash("sha256").update(value).digest("hex").slice(0, 12)}]`;
}

function optionalFields<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined && value !== null),
  ) as T;
}

function joinPath(path: string, key: string): string {
  return path.length === 0 ? key : `${path}.${key}`;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalidInput(
  message: string,
  details: Readonly<Record<string, unknown>>,
): LocalWorkspaceSessionSnapshotRetentionError {
  return new LocalWorkspaceSessionSnapshotRetentionError(
    LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_ERROR_CODES.INVALID_INPUT,
    message,
    { details },
  );
}

function invalidRetentionPolicy(
  message: string,
  details: Readonly<Record<string, unknown>>,
): LocalWorkspaceSessionSnapshotRetentionError {
  return new LocalWorkspaceSessionSnapshotRetentionError(
    LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_ERROR_CODES.INVALID_RETENTION_POLICY,
    message,
    { details },
  );
}

function deepFreezeClone<T>(value: T): DeepReadonly<T> {
  return deepFreeze(structuredClone(value)) as DeepReadonly<T>;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }
  return value;
}
