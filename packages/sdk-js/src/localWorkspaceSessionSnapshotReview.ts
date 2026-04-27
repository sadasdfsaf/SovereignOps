import type { JsonValue } from "./client.ts";
import type { DeepReadonly } from "./workspace.ts";

export const LOCAL_WORKSPACE_SESSION_SNAPSHOT_REVIEW_SCHEMA_VERSION =
  "local-workspace-session-snapshot-review/v1";

export const LOCAL_WORKSPACE_SESSION_SNAPSHOT_REVIEW_ERROR_CODES = Object.freeze({
  INVALID_INPUT: "LOCAL_WORKSPACE_SESSION_SNAPSHOT_REVIEW_INVALID_INPUT",
  INVALID_RETENTION_POLICY:
    "LOCAL_WORKSPACE_SESSION_SNAPSHOT_REVIEW_INVALID_RETENTION_POLICY",
  INVALID_SNAPSHOT: "LOCAL_WORKSPACE_SESSION_SNAPSHOT_REVIEW_INVALID_SNAPSHOT",
});

export type LocalWorkspaceSessionSnapshotReviewErrorCode =
  (typeof LOCAL_WORKSPACE_SESSION_SNAPSHOT_REVIEW_ERROR_CODES)[keyof typeof LOCAL_WORKSPACE_SESSION_SNAPSHOT_REVIEW_ERROR_CODES];

export type LocalWorkspaceSessionSnapshotReviewSeverity =
  | "none"
  | "info"
  | "warning"
  | "critical";

export type LocalWorkspaceSessionSnapshotReviewRisk =
  | "none"
  | "low"
  | "medium"
  | "high";

export type LocalWorkspaceSessionSnapshotSourceKind =
  | "local-store-bundle"
  | "local-store-snapshot"
  | "snapshot-preview"
  | "snapshot-record"
  | "snapshot-record-summary";

export type LocalWorkspaceSessionSnapshotReviewIssueCategory =
  | "schema-version"
  | "local-only"
  | "redaction"
  | "secret-retention"
  | "operation-count"
  | "state"
  | "cursor";

export type LocalWorkspaceSessionSnapshotSecretRetentionRiskKind =
  | "raw-lock-token"
  | "raw-path"
  | "raw-token";

export type LocalWorkspaceSessionSnapshotState =
  | "empty"
  | "locked"
  | "open"
  | "unknown"
  | "unlocked";

export type LocalWorkspaceSessionSnapshotRetentionDecision = "keep" | "delete";

export type LocalWorkspaceSessionSnapshotRetentionReason =
  | "exceeds-max-age"
  | "exceeds-max-count"
  | "within-max-age"
  | "within-max-count"
  | "within-policy";

export interface LocalWorkspaceSessionSnapshotReviewErrorOptions {
  readonly cause?: unknown;
  readonly details?: Readonly<Record<string, unknown>>;
}

export class LocalWorkspaceSessionSnapshotReviewError extends TypeError {
  readonly code: LocalWorkspaceSessionSnapshotReviewErrorCode;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    code: LocalWorkspaceSessionSnapshotReviewErrorCode,
    message: string,
    options: LocalWorkspaceSessionSnapshotReviewErrorOptions = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "LocalWorkspaceSessionSnapshotReviewError";
    this.code = code;
    this.details =
      options.details === undefined ? undefined : deepFreezeClone(options.details);
  }
}

export interface LocalWorkspaceSessionSnapshotCompareInput {
  readonly baseline: unknown;
  readonly candidate: unknown;
}

export interface LocalWorkspaceSessionSnapshotSecretRetentionRisk {
  readonly kind: LocalWorkspaceSessionSnapshotSecretRetentionRiskKind;
  readonly path: string;
  readonly message: string;
}

export interface LocalWorkspaceSessionSnapshotComparableSummary {
  readonly kind: "localWorkspaceSessionSnapshotComparableSummary";
  readonly sourceKind: LocalWorkspaceSessionSnapshotSourceKind;
  readonly snapshotId?: string;
  readonly workspaceId?: string;
  readonly deviceId?: string;
  readonly sessionId?: string;
  readonly label?: string;
  readonly schemaVersion?: string;
  readonly schemaVersions: readonly string[];
  readonly localOnly?: boolean;
  readonly redacted?: boolean;
  readonly rawSecretsStored?: boolean;
  readonly storagePathRedacted?: boolean;
  readonly eventCount?: number;
  readonly operationCount: number;
  readonly operations: readonly string[];
  readonly state: LocalWorkspaceSessionSnapshotState;
  readonly cursor?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly redactedFields: readonly string[];
  readonly localOnlyIssuePaths: readonly string[];
  readonly redactionIssuePaths: readonly string[];
  readonly secretRetentionRisks: readonly LocalWorkspaceSessionSnapshotSecretRetentionRisk[];
}

export interface LocalWorkspaceSessionSnapshotReviewIssue {
  readonly kind: "localWorkspaceSessionSnapshotReviewIssue";
  readonly category: LocalWorkspaceSessionSnapshotReviewIssueCategory;
  readonly severity: LocalWorkspaceSessionSnapshotReviewSeverity;
  readonly risk: LocalWorkspaceSessionSnapshotReviewRisk;
  readonly path: string;
  readonly message: string;
  readonly baseline?: JsonValue;
  readonly candidate?: JsonValue;
}

export interface LocalWorkspaceSessionSnapshotCompareSummary {
  readonly kind: "localWorkspaceSessionSnapshotCompareSummary";
  readonly schemaVersion: typeof LOCAL_WORKSPACE_SESSION_SNAPSHOT_REVIEW_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly durableWrites: false;
  readonly severity: LocalWorkspaceSessionSnapshotReviewSeverity;
  readonly risk: LocalWorkspaceSessionSnapshotReviewRisk;
  readonly changed: boolean;
  readonly issueCount: number;
  readonly baseline: LocalWorkspaceSessionSnapshotComparableSummary;
  readonly candidate: LocalWorkspaceSessionSnapshotComparableSummary;
  readonly issues: readonly LocalWorkspaceSessionSnapshotReviewIssue[];
}

export interface LocalWorkspaceSessionSnapshotRetentionPreviewInput {
  readonly records: readonly unknown[];
  readonly maxCount?: number;
  readonly maxAgeMs?: number;
  readonly now?: string;
  readonly clock?: () => string;
}

export interface LocalWorkspaceSessionSnapshotRetentionCandidate {
  readonly snapshotId: string;
  readonly sourceKind: LocalWorkspaceSessionSnapshotSourceKind;
  readonly decision: LocalWorkspaceSessionSnapshotRetentionDecision;
  readonly reasons: readonly LocalWorkspaceSessionSnapshotRetentionReason[];
  readonly rank: number;
  readonly createdAt: string;
  readonly updatedAt?: string;
  readonly ageMs?: number;
  readonly workspaceId?: string;
  readonly deviceId?: string;
  readonly sessionId?: string;
}

export interface LocalWorkspaceSessionSnapshotRetentionPreview {
  readonly kind: "localWorkspaceSessionSnapshotRetentionPreview";
  readonly schemaVersion: typeof LOCAL_WORKSPACE_SESSION_SNAPSHOT_REVIEW_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly durableWrites: false;
  readonly now?: string;
  readonly maxCount?: number;
  readonly maxAgeMs?: number;
  readonly recordCount: number;
  readonly keepCount: number;
  readonly deleteCount: number;
  readonly keepCandidates: readonly LocalWorkspaceSessionSnapshotRetentionCandidate[];
  readonly deleteCandidates: readonly LocalWorkspaceSessionSnapshotRetentionCandidate[];
}

interface SnapshotSource {
  readonly kind: LocalWorkspaceSessionSnapshotSourceKind;
  readonly root: Record<string, unknown>;
  readonly rootPath: string;
  readonly snapshot?: Record<string, unknown>;
  readonly summary?: Record<string, unknown>;
  readonly auditPreview?: Record<string, unknown>;
  readonly record?: Record<string, unknown>;
  readonly recordSummary?: Record<string, unknown>;
}

interface FlagScan {
  readonly present: number;
  readonly invalidPaths: readonly string[];
}

interface RetentionRecord {
  readonly summary: LocalWorkspaceSessionSnapshotComparableSummary;
  readonly snapshotId: string;
  readonly createdAt: string;
  readonly createdAtMs: number;
  readonly updatedAt?: string;
}

const REDACTED_VALUE_PATTERN = /^\[redacted:[A-Za-z0-9_-]+:[a-z0-9]+\]$/;
const REDACTED_PATH_PATTERN = /^\[redacted:path:[a-z0-9]+\]$/;
const REDACTED_LOCK_TOKEN_PATTERN = /^\[redacted:lockToken:[a-z0-9]+\]$/;
const RAW_LOCK_TOKEN_PATTERN = /^lock_[A-Za-z0-9_-]{4,}$/;
const RAW_TOKEN_PATTERNS = Object.freeze([
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/i,
  /\b(?:sk-[A-Za-z0-9_-]{8,}|sk_[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,})\b/i,
  /\b(?:apiKey|api[_-]?key|token|password|secret)\s*[:=]\s*["']?[^"',;\s]+/i,
]);
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CURSOR_PATTERN = /^[1-9][0-9]*$/;
const SEVERITY_RANK = Object.freeze({
  none: 0,
  info: 1,
  warning: 2,
  critical: 3,
} satisfies Record<LocalWorkspaceSessionSnapshotReviewSeverity, number>);
const RISK_RANK = Object.freeze({
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
} satisfies Record<LocalWorkspaceSessionSnapshotReviewRisk, number>);
const OPERATION_STATE = Object.freeze({
  lock: "locked",
  open: "open",
  unlock: "unlocked",
} satisfies Record<string, LocalWorkspaceSessionSnapshotState>);

export function compareLocalWorkspaceSessionSnapshots(
  input: LocalWorkspaceSessionSnapshotCompareInput,
): DeepReadonly<LocalWorkspaceSessionSnapshotCompareSummary> {
  if (!isRecord(input)) {
    throw invalidInput("snapshot comparison input must be an object", { path: "" });
  }

  const baseline = extractComparableSummary(input.baseline, "baseline");
  const candidate = extractComparableSummary(input.candidate, "candidate");
  const issues = [
    ...schemaVersionIssues(baseline, candidate),
    ...localOnlyIssues(baseline, candidate),
    ...redactionIssues(baseline, candidate),
    ...secretRetentionIssues(candidate),
    ...operationCountIssues(baseline, candidate),
    ...stateIssues(baseline, candidate),
    ...cursorIssues(baseline, candidate),
  ];

  return deepFreezeClone({
    kind: "localWorkspaceSessionSnapshotCompareSummary" as const,
    schemaVersion: LOCAL_WORKSPACE_SESSION_SNAPSHOT_REVIEW_SCHEMA_VERSION,
    localOnly: true as const,
    durableWrites: false as const,
    severity: highestSeverity(issues),
    risk: highestRisk(issues),
    changed: issues.length > 0,
    issueCount: issues.length,
    baseline,
    candidate,
    issues,
  });
}

export function previewLocalWorkspaceSessionSnapshotRetention(
  input: LocalWorkspaceSessionSnapshotRetentionPreviewInput,
): DeepReadonly<LocalWorkspaceSessionSnapshotRetentionPreview> {
  if (!isRecord(input)) {
    throw invalidInput("snapshot retention preview input must be an object", { path: "" });
  }
  if (!Array.isArray(input.records)) {
    throw invalidInput("records must be an array", { path: "records" });
  }

  const maxCount = optionalNonNegativeInteger(input.maxCount, "maxCount");
  const maxAgeMs = optionalNonNegativeInteger(input.maxAgeMs, "maxAgeMs");
  const now = maxAgeMs === undefined
    ? undefined
    : requireRetentionPolicyIsoTimestamp(input.now ?? input.clock?.(), "now");
  const nowMs = now === undefined ? undefined : Date.parse(now);
  const cutoffMs = nowMs === undefined || maxAgeMs === undefined
    ? undefined
    : nowMs - maxAgeMs;

  const records = input.records.map((record, index) =>
    extractRetentionRecord(record, `records.${index}`)
  );
  assertUniqueSnapshotIds(records);

  const candidates = records
    .slice()
    .sort(compareRetentionRecords)
    .map((record, index) => retentionCandidate(record, index + 1, {
      cutoffMs,
      maxAgeMs,
      maxCount,
      nowMs,
    }));
  const keepCandidates = candidates.filter((candidate) => candidate.decision === "keep");
  const deleteCandidates = candidates.filter((candidate) => candidate.decision === "delete");

  return deepFreezeClone(optionalFields({
    kind: "localWorkspaceSessionSnapshotRetentionPreview" as const,
    schemaVersion: LOCAL_WORKSPACE_SESSION_SNAPSHOT_REVIEW_SCHEMA_VERSION,
    localOnly: true as const,
    durableWrites: false as const,
    now,
    maxCount,
    maxAgeMs,
    recordCount: candidates.length,
    keepCount: keepCandidates.length,
    deleteCount: deleteCandidates.length,
    keepCandidates,
    deleteCandidates,
  }));
}

export function compareSnapshots(
  input: LocalWorkspaceSessionSnapshotCompareInput,
): DeepReadonly<LocalWorkspaceSessionSnapshotCompareSummary> {
  return compareLocalWorkspaceSessionSnapshots(input);
}

export function previewSnapshotRetention(
  input: LocalWorkspaceSessionSnapshotRetentionPreviewInput,
): DeepReadonly<LocalWorkspaceSessionSnapshotRetentionPreview> {
  return previewLocalWorkspaceSessionSnapshotRetention(input);
}

function extractComparableSummary(
  input: unknown,
  path: string,
): LocalWorkspaceSessionSnapshotComparableSummary {
  const source = unwrapSnapshotSource(input, path);
  const operations = readOperations(source);
  const eventCount = readOptionalNonNegativeInteger(firstDefined(
    source.snapshot?.eventCount,
    source.summary?.eventCount,
    source.recordSummary?.eventCount,
    eventCountFromEvents(source),
  ), `${path}.eventCount`);
  const operationCount = eventCount ?? operations.length;
  if (operationCount === undefined || operationCount < 0) {
    throw invalidSnapshot("snapshot must include an operation count", { path });
  }

  const cursor = readOptionalString(firstDefined(
    source.snapshot?.cursor,
    cursorFromEvents(source),
  ), `${path}.cursor`);
  const schemaVersions = collectSchemaVersions(source.root, source.rootPath);
  const schemaVersion = readOptionalString(firstDefined(
    source.record?.schemaVersion,
    source.snapshot?.schemaVersion,
    source.root.schemaVersion,
    source.summary?.schemaVersion,
    source.auditPreview?.schemaVersion,
    schemaVersions[0],
  ), `${path}.schemaVersion`);
  const localOnly = collectExpectedFlag(source.root, source.rootPath, "localOnly", true);
  const redacted = collectExpectedFlag(source.root, source.rootPath, "redacted", true);
  const rawSecretsStored = collectExpectedFlag(
    source.root,
    source.rootPath,
    "rawSecretsStored",
    false,
  );
  const storagePathRedacted = collectExpectedFlag(
    source.root,
    source.rootPath,
    "storagePathRedacted",
    true,
  );
  const redactedFields = collectRedactedFields(source.root, source.rootPath);
  const secretRetentionRisks = collectSecretRetentionRisks(source.root, source.rootPath);
  const redactionIssuePaths = sortedUnique([
    ...redacted.invalidPaths,
    ...rawSecretsStored.invalidPaths,
    ...storagePathRedacted.invalidPaths,
  ]);

  return optionalFields({
    kind: "localWorkspaceSessionSnapshotComparableSummary" as const,
    sourceKind: source.kind,
    snapshotId: readOptionalString(firstDefined(
      source.snapshot?.snapshotId,
      source.record?.snapshotId,
      source.recordSummary?.snapshotId,
    ), `${path}.snapshotId`),
    workspaceId: readOptionalString(firstDefined(
      source.snapshot?.workspaceId,
      source.summary?.workspaceId,
      source.recordSummary?.workspaceId,
    ), `${path}.workspaceId`),
    deviceId: readOptionalString(firstDefined(
      source.snapshot?.deviceId,
      source.summary?.deviceId,
      source.recordSummary?.deviceId,
    ), `${path}.deviceId`),
    sessionId: readOptionalString(firstDefined(
      source.snapshot?.sessionId,
      source.summary?.sessionId,
      source.recordSummary?.sessionId,
      sessionIdFromAuditPreview(source.auditPreview),
    ), `${path}.sessionId`),
    label: readOptionalString(firstDefined(
      source.record?.label,
      source.recordSummary?.label,
    ), `${path}.label`),
    schemaVersion,
    schemaVersions,
    localOnly: flagValue(localOnly),
    redacted: redactionFlagValue(redacted, rawSecretsStored, storagePathRedacted),
    rawSecretsStored: rawSecretsStored.present === 0
      ? undefined
      : rawSecretsStored.invalidPaths.length > 0,
    storagePathRedacted: storagePathRedacted.present === 0
      ? undefined
      : storagePathRedacted.invalidPaths.length === 0,
    eventCount,
    operationCount,
    operations,
    state: stateFromOperations(operations),
    cursor,
    createdAt: readOptionalString(firstDefined(
      source.snapshot?.createdAt,
      source.record?.createdAt,
      source.recordSummary?.createdAt,
      createdAtFromEvents(source),
    ), `${path}.createdAt`),
    updatedAt: readOptionalString(firstDefined(
      source.snapshot?.updatedAt,
      source.record?.updatedAt,
      source.recordSummary?.updatedAt,
    ), `${path}.updatedAt`),
    redactedFields,
    localOnlyIssuePaths: localOnly.invalidPaths,
    redactionIssuePaths,
    secretRetentionRisks,
  });
}

function unwrapSnapshotSource(input: unknown, path: string): SnapshotSource {
  if (!isRecord(input)) {
    throw invalidSnapshot("snapshot source must be an object", { path });
  }

  if (
    input.kind === "workspace-session.snapshot-record.created" ||
    input.kind === "workspace-session.snapshot-record.read"
  ) {
    if (!isRecord(input.record)) {
      throw invalidSnapshot("snapshot record response must include a record object", {
        path: joinPath(path, "record"),
      });
    }
    return unwrapSnapshotSource(input.record, joinPath(path, "record"));
  }

  if (input.kind === "localWorkspaceSessionStore") {
    if (!isRecord(input.snapshot)) {
      throw invalidSnapshot("snapshot bundle must include a snapshot object", {
        path: joinPath(path, "snapshot"),
      });
    }
    return {
      kind: "local-store-bundle",
      root: input,
      rootPath: path,
      snapshot: input.snapshot,
    };
  }

  if (input.kind === "localWorkspaceSessionSnapshot") {
    return {
      kind: "local-store-snapshot",
      root: input,
      rootPath: path,
      snapshot: input,
    };
  }

  if (input.kind === "workspace-session.snapshot-record") {
    const preview = optionalRecord(input.snapshot, joinPath(path, "snapshot"));
    return {
      kind: "snapshot-record",
      root: input,
      rootPath: path,
      record: input,
      snapshot: preview,
      summary: optionalRecord(preview?.summary, joinPath(path, "snapshot.summary")),
      auditPreview: optionalRecord(preview?.auditPreview, joinPath(path, "snapshot.auditPreview")),
    };
  }

  if (input.kind === "workspace-session.snapshot-preview") {
    return {
      kind: "snapshot-preview",
      root: input,
      rootPath: path,
      snapshot: input,
      summary: optionalRecord(input.summary, joinPath(path, "summary")),
      auditPreview: optionalRecord(input.auditPreview, joinPath(path, "auditPreview")),
    };
  }

  if (isRecord(input.snapshot) && isRecord(input.snapshot.summary)) {
    return {
      kind: "snapshot-record",
      root: input,
      rootPath: path,
      record: input,
      snapshot: input.snapshot,
      summary: input.snapshot.summary,
      auditPreview: optionalRecord(input.snapshot.auditPreview, joinPath(path, "snapshot.auditPreview")),
    };
  }

  if (Array.isArray(input.operations) || typeof input.eventCount === "number") {
    return {
      kind: "snapshot-record-summary",
      root: input,
      rootPath: path,
      recordSummary: input,
    };
  }

  if (isRecord(input.snapshot) && (Array.isArray(input.snapshot.operations) || typeof input.snapshot.eventCount === "number")) {
    return {
      kind: "local-store-bundle",
      root: input,
      rootPath: path,
      snapshot: input.snapshot,
    };
  }

  throw invalidSnapshot("snapshot source shape is not supported", { path });
}

function readOperations(source: SnapshotSource): readonly string[] {
  const operations = firstDefined(
    source.snapshot?.operations,
    source.summary?.operations,
    source.recordSummary?.operations,
    operationsFromEvents(source),
  );

  if (operations === undefined) {
    return Object.freeze([]);
  }
  if (!Array.isArray(operations)) {
    throw invalidSnapshot("operations must be an array", {
      path: joinPath(source.rootPath, "operations"),
    });
  }

  return Object.freeze(operations.map((operation, index) => {
    if (typeof operation !== "string" || operation.trim().length === 0) {
      throw invalidSnapshot("operations entries must be non-empty strings", {
        path: `${joinPath(source.rootPath, "operations")}.${index}`,
      });
    }
    return operation.trim();
  }));
}

function operationsFromEvents(source: SnapshotSource): readonly string[] | undefined {
  const events = eventArray(source);
  if (events === undefined) {
    return undefined;
  }

  return events
    .slice()
    .sort(compareEvents)
    .flatMap((event) => {
      if (!isRecord(event.payload)) {
        return [];
      }
      const operation = event.payload.operation;
      return typeof operation === "string" && operation.trim().length > 0
        ? [operation.trim()]
        : [];
    });
}

function eventCountFromEvents(source: SnapshotSource): number | undefined {
  return eventArray(source)?.length;
}

function eventArray(source: SnapshotSource): Record<string, unknown>[] | undefined {
  const events = firstDefined(
    source.root.events,
    source.auditPreview?.events,
  );
  if (events === undefined) {
    return undefined;
  }
  if (!Array.isArray(events)) {
    throw invalidSnapshot("events must be an array", {
      path: joinPath(source.rootPath, "events"),
    });
  }
  return events.flatMap((event) => isRecord(event) ? [event] : []);
}

function cursorFromEvents(source: SnapshotSource): string | undefined {
  const events = eventArray(source);
  if (events === undefined || events.length === 0) {
    return undefined;
  }

  const cursors = events
    .map((event) => typeof event.cursor === "string" && CURSOR_PATTERN.test(event.cursor)
      ? Number(event.cursor)
      : undefined)
    .filter((cursor): cursor is number => cursor !== undefined)
    .sort((left, right) => left - right);
  const latest = cursors.at(-1);
  return latest === undefined ? undefined : String(latest);
}

function createdAtFromEvents(source: SnapshotSource): string | undefined {
  const events = eventArray(source);
  if (events === undefined || events.length === 0) {
    return undefined;
  }
  const createdAtValues = events
    .map((event) => event.createdAt)
    .filter((value): value is string => typeof value === "string" && isIsoTimestamp(value))
    .sort(compareStrings);
  return createdAtValues[0];
}

function sessionIdFromAuditPreview(auditPreview: Record<string, unknown> | undefined): string | undefined {
  const events = auditPreview?.events;
  if (!Array.isArray(events)) {
    return undefined;
  }
  for (const event of events) {
    if (!isRecord(event) || !isRecord(event.payload)) {
      continue;
    }
    if (typeof event.payload.sessionId === "string") {
      return event.payload.sessionId;
    }
  }
  return undefined;
}

function schemaVersionIssues(
  baseline: LocalWorkspaceSessionSnapshotComparableSummary,
  candidate: LocalWorkspaceSessionSnapshotComparableSummary,
): readonly LocalWorkspaceSessionSnapshotReviewIssue[] {
  if (sameStringArray(baseline.schemaVersions, candidate.schemaVersions)) {
    return [];
  }
  return [issue({
    category: "schema-version",
    severity: "warning",
    risk: "medium",
    path: "candidate.schemaVersions",
    message: "candidate snapshot schema versions changed from baseline",
    baseline: baseline.schemaVersions,
    candidate: candidate.schemaVersions,
  })];
}

function localOnlyIssues(
  baseline: LocalWorkspaceSessionSnapshotComparableSummary,
  candidate: LocalWorkspaceSessionSnapshotComparableSummary,
): readonly LocalWorkspaceSessionSnapshotReviewIssue[] {
  if (
    candidate.localOnly !== false &&
    !(baseline.localOnly === true && candidate.localOnly === undefined && baseline.sourceKind === candidate.sourceKind)
  ) {
    return [];
  }

  return [issue({
    category: "local-only",
    severity: "critical",
    risk: "high",
    path: "candidate.localOnly",
    message: candidate.localOnlyIssuePaths.length > 0
      ? "candidate snapshot contains localOnly flags that are not true"
      : "candidate snapshot no longer carries localOnly flags",
    baseline: baseline.localOnly,
    candidate: candidate.localOnly,
  })];
}

function redactionIssues(
  baseline: LocalWorkspaceSessionSnapshotComparableSummary,
  candidate: LocalWorkspaceSessionSnapshotComparableSummary,
): readonly LocalWorkspaceSessionSnapshotReviewIssue[] {
  const issues: LocalWorkspaceSessionSnapshotReviewIssue[] = [];
  if (
    candidate.redacted === false ||
    (baseline.redacted === true && candidate.redacted === undefined && baseline.sourceKind === candidate.sourceKind)
  ) {
    issues.push(issue({
      category: "redaction",
      severity: "critical",
      risk: "high",
      path: "candidate.redacted",
      message: candidate.redactionIssuePaths.length > 0
        ? "candidate snapshot contains redaction flags that no longer indicate redacted data"
        : "candidate snapshot no longer carries redaction flags",
      baseline: baseline.redacted,
      candidate: candidate.redacted,
    }));
  }

  const candidateFields = new Set(candidate.redactedFields);
  const missingRedactedFields = baseline.redactedFields.filter((field) =>
    !candidateFields.has(field)
  );
  if (missingRedactedFields.length > 0) {
    issues.push(issue({
      category: "redaction",
      severity: "critical",
      risk: "high",
      path: "candidate.redactedFields",
      message: "candidate snapshot removed redacted field markers from baseline",
      baseline: baseline.redactedFields,
      candidate: sortedUnique(candidate.redactedFields),
    }));
  }

  return issues;
}

function secretRetentionIssues(
  candidate: LocalWorkspaceSessionSnapshotComparableSummary,
): readonly LocalWorkspaceSessionSnapshotReviewIssue[] {
  if (candidate.secretRetentionRisks.length === 0) {
    return [];
  }

  return [issue({
    category: "secret-retention",
    severity: "critical",
    risk: "high",
    path: "candidate.secretRetentionRisks",
    message: "candidate snapshot retains raw path or token material",
    candidate: candidate.secretRetentionRisks.map((risk) => ({
      kind: risk.kind,
      path: risk.path,
    })),
  })];
}

function operationCountIssues(
  baseline: LocalWorkspaceSessionSnapshotComparableSummary,
  candidate: LocalWorkspaceSessionSnapshotComparableSummary,
): readonly LocalWorkspaceSessionSnapshotReviewIssue[] {
  if (baseline.operationCount === candidate.operationCount) {
    return [];
  }

  const candidateDroppedOperations = candidate.operationCount < baseline.operationCount;
  return [issue({
    category: "operation-count",
    severity: candidateDroppedOperations ? "warning" : "info",
    risk: candidateDroppedOperations ? "medium" : "low",
    path: "candidate.operationCount",
    message: candidateDroppedOperations
      ? "candidate snapshot has fewer operations than baseline"
      : "candidate snapshot operation count changed from baseline",
    baseline: baseline.operationCount,
    candidate: candidate.operationCount,
  })];
}

function stateIssues(
  baseline: LocalWorkspaceSessionSnapshotComparableSummary,
  candidate: LocalWorkspaceSessionSnapshotComparableSummary,
): readonly LocalWorkspaceSessionSnapshotReviewIssue[] {
  if (baseline.state === candidate.state) {
    return [];
  }

  return [issue({
    category: "state",
    severity: "warning",
    risk: "medium",
    path: "candidate.state",
    message: "candidate snapshot terminal session state changed from baseline",
    baseline: baseline.state,
    candidate: candidate.state,
  })];
}

function cursorIssues(
  baseline: LocalWorkspaceSessionSnapshotComparableSummary,
  candidate: LocalWorkspaceSessionSnapshotComparableSummary,
): readonly LocalWorkspaceSessionSnapshotReviewIssue[] {
  if (baseline.cursor === candidate.cursor) {
    return [];
  }

  const baselineCursor = parseCursor(baseline.cursor);
  const candidateCursor = parseCursor(candidate.cursor);
  const regressed = baselineCursor !== undefined &&
    (candidateCursor === undefined || candidateCursor < baselineCursor);
  return [issue({
    category: "cursor",
    severity: regressed ? "warning" : "info",
    risk: regressed ? "medium" : "low",
    path: "candidate.cursor",
    message: regressed
      ? "candidate snapshot cursor regressed from baseline"
      : "candidate snapshot cursor changed from baseline",
    baseline: baseline.cursor,
    candidate: candidate.cursor,
  })];
}

function extractRetentionRecord(input: unknown, path: string): RetentionRecord {
  const summary = extractComparableSummary(input, path);
  if (summary.snapshotId === undefined) {
    throw invalidSnapshot("retention records must include snapshotId", {
      path: joinPath(path, "snapshotId"),
    });
  }
  const createdAt = requireIsoTimestamp(summary.createdAt, joinPath(path, "createdAt"));

  return {
    summary,
    snapshotId: summary.snapshotId,
    createdAt,
    createdAtMs: Date.parse(createdAt),
    updatedAt: summary.updatedAt,
  };
}

function retentionCandidate(
  record: RetentionRecord,
  rank: number,
  policy: {
    readonly cutoffMs?: number;
    readonly maxAgeMs?: number;
    readonly maxCount?: number;
    readonly nowMs?: number;
  },
): LocalWorkspaceSessionSnapshotRetentionCandidate {
  const deleteReasons: LocalWorkspaceSessionSnapshotRetentionReason[] = [];
  const keepReasons: LocalWorkspaceSessionSnapshotRetentionReason[] = [];

  if (policy.maxCount !== undefined) {
    if (rank > policy.maxCount) {
      deleteReasons.push("exceeds-max-count");
    } else {
      keepReasons.push("within-max-count");
    }
  }
  if (policy.cutoffMs !== undefined) {
    if (record.createdAtMs < policy.cutoffMs) {
      deleteReasons.push("exceeds-max-age");
    } else {
      keepReasons.push("within-max-age");
    }
  }

  const decision: LocalWorkspaceSessionSnapshotRetentionDecision =
    deleteReasons.length > 0 ? "delete" : "keep";
  const reasons = decision === "delete"
    ? deleteReasons
    : keepReasons.length > 0
      ? keepReasons
      : ["within-policy" as const];

  return optionalFields({
    snapshotId: record.snapshotId,
    sourceKind: record.summary.sourceKind,
    decision,
    reasons: Object.freeze(reasons.slice()),
    rank,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ageMs: policy.nowMs === undefined ? undefined : policy.nowMs - record.createdAtMs,
    workspaceId: record.summary.workspaceId,
    deviceId: record.summary.deviceId,
    sessionId: record.summary.sessionId,
  });
}

function compareRetentionRecords(left: RetentionRecord, right: RetentionRecord): number {
  return right.createdAtMs - left.createdAtMs ||
    compareStrings(left.snapshotId, right.snapshotId);
}

function assertUniqueSnapshotIds(records: readonly RetentionRecord[]): void {
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.snapshotId)) {
      throw invalidInput("records must not contain duplicate snapshotIds", {
        path: "records",
        snapshotId: record.snapshotId,
      });
    }
    seen.add(record.snapshotId);
  }
}

function collectSchemaVersions(root: Record<string, unknown>, path: string): readonly string[] {
  const values: string[] = [];
  visit(root, path, (value, valuePath, key) => {
    if (key !== "schemaVersion" && key !== "apiSchemaVersion") {
      return;
    }
    if (typeof value !== "string" || value.trim().length === 0) {
      throw invalidSnapshot("schemaVersion fields must be non-empty strings", {
        path: valuePath,
      });
    }
    values.push(value.trim());
  });
  return sortedUnique(values);
}

function collectExpectedFlag(
  root: Record<string, unknown>,
  path: string,
  key: string,
  expected: boolean,
): FlagScan {
  const invalidPaths: string[] = [];
  let present = 0;
  visit(root, path, (value, valuePath, valueKey) => {
    if (valueKey !== key) {
      return;
    }
    present += 1;
    if (value !== expected) {
      invalidPaths.push(valuePath);
    }
  });
  return {
    present,
    invalidPaths: sortedUnique(invalidPaths),
  };
}

function collectRedactedFields(root: Record<string, unknown>, path: string): readonly string[] {
  const fields: string[] = [];
  visit(root, path, (value, valuePath, key) => {
    if (key !== "redactedFields") {
      return;
    }
    if (!Array.isArray(value)) {
      throw invalidSnapshot("redactedFields must be an array", { path: valuePath });
    }
    value.forEach((field, index) => {
      if (typeof field !== "string" || field.trim().length === 0) {
        throw invalidSnapshot("redactedFields entries must be non-empty strings", {
          path: `${valuePath}.${index}`,
        });
      }
      fields.push(field.trim());
    });
  });
  return sortedUnique(fields);
}

function collectSecretRetentionRisks(
  root: Record<string, unknown>,
  path: string,
): readonly LocalWorkspaceSessionSnapshotSecretRetentionRisk[] {
  const risks: LocalWorkspaceSessionSnapshotSecretRetentionRisk[] = [];
  visit(root, path, (value, valuePath, key) => {
    if (typeof value !== "string" || REDACTED_VALUE_PATTERN.test(value)) {
      return;
    }
    if (isRawPath(value, key)) {
      risks.push({
        kind: "raw-path",
        path: valuePath,
        message: "raw path-like value should be redacted before snapshot review",
      });
    }
    if (isRawLockToken(value, key)) {
      risks.push({
        kind: "raw-lock-token",
        path: valuePath,
        message: "raw lock token should be redacted before snapshot review",
      });
      return;
    }
    if (isRawToken(value, key)) {
      risks.push({
        kind: "raw-token",
        path: valuePath,
        message: "raw token-like value should be redacted before snapshot review",
      });
    }
  });
  return Object.freeze(risks.sort(compareSecretRetentionRisks));
}

function isRawPath(value: string, key: string | undefined): boolean {
  if (REDACTED_PATH_PATTERN.test(value)) {
    return false;
  }
  if (/^[A-Za-z]:[\\/]/.test(value) || /^\/(?:Users|home|var|tmp|etc|mnt|workspace|workspaces)\//.test(value)) {
    return true;
  }
  return key?.toLowerCase().includes("path") === true && /[\\/]/.test(value);
}

function isRawLockToken(value: string, key: string | undefined): boolean {
  if (REDACTED_LOCK_TOKEN_PATTERN.test(value)) {
    return false;
  }
  return RAW_LOCK_TOKEN_PATTERN.test(value) &&
    (key === undefined || key.toLowerCase().includes("token"));
}

function isRawToken(value: string, key: string | undefined): boolean {
  if (REDACTED_VALUE_PATTERN.test(value)) {
    return false;
  }
  if (key !== undefined && /authorization|credential|password|secret|token|api[._-]?key/i.test(key)) {
    return value.trim().length > 0;
  }
  return RAW_TOKEN_PATTERNS.some((pattern) => pattern.test(value));
}

function compareSecretRetentionRisks(
  left: LocalWorkspaceSessionSnapshotSecretRetentionRisk,
  right: LocalWorkspaceSessionSnapshotSecretRetentionRisk,
): number {
  return compareStrings(left.path, right.path) ||
    compareStrings(left.kind, right.kind);
}

function flagValue(scan: FlagScan): boolean | undefined {
  if (scan.present === 0) {
    return undefined;
  }
  return scan.invalidPaths.length === 0;
}

function redactionFlagValue(
  redacted: FlagScan,
  rawSecretsStored: FlagScan,
  storagePathRedacted: FlagScan,
): boolean | undefined {
  const present = redacted.present + rawSecretsStored.present + storagePathRedacted.present;
  if (present === 0) {
    return undefined;
  }
  return redacted.invalidPaths.length === 0 &&
    rawSecretsStored.invalidPaths.length === 0 &&
    storagePathRedacted.invalidPaths.length === 0;
}

function stateFromOperations(operations: readonly string[]): LocalWorkspaceSessionSnapshotState {
  if (operations.length === 0) {
    return "empty";
  }
  const lastOperation = operations.at(-1);
  return lastOperation === undefined
    ? "unknown"
    : OPERATION_STATE[lastOperation] ?? "unknown";
}

function issue(
  input: Omit<LocalWorkspaceSessionSnapshotReviewIssue, "kind">,
): LocalWorkspaceSessionSnapshotReviewIssue {
  return optionalFields({
    kind: "localWorkspaceSessionSnapshotReviewIssue" as const,
    ...input,
  });
}

function highestSeverity(
  issues: readonly LocalWorkspaceSessionSnapshotReviewIssue[],
): LocalWorkspaceSessionSnapshotReviewSeverity {
  return issues.reduce<LocalWorkspaceSessionSnapshotReviewSeverity>(
    (highest, candidate) =>
      SEVERITY_RANK[candidate.severity] > SEVERITY_RANK[highest]
        ? candidate.severity
        : highest,
    "none",
  );
}

function highestRisk(
  issues: readonly LocalWorkspaceSessionSnapshotReviewIssue[],
): LocalWorkspaceSessionSnapshotReviewRisk {
  return issues.reduce<LocalWorkspaceSessionSnapshotReviewRisk>(
    (highest, candidate) =>
      RISK_RANK[candidate.risk] > RISK_RANK[highest]
        ? candidate.risk
        : highest,
    "none",
  );
}

function optionalRecord(value: unknown, path: string): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw invalidSnapshot("value must be an object", { path });
  }
  return value;
}

function readOptionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw invalidSnapshot("value must be a string", { path });
  }
  return value;
}

function readOptionalNonNegativeInteger(value: unknown, path: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw invalidSnapshot("value must be a non-negative safe integer", { path });
  }
  return value as number;
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

function requireRetentionPolicyIsoTimestamp(value: unknown, path: string): string {
  if (typeof value !== "string" || !isIsoTimestamp(value)) {
    throw invalidRetentionPolicy("value must be an ISO timestamp", { path });
  }
  return value;
}

function requireIsoTimestamp(value: unknown, path: string): string {
  if (typeof value !== "string" || !isIsoTimestamp(value)) {
    throw invalidSnapshot("value must be an ISO timestamp", { path });
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

function parseCursor(value: string | undefined): number | undefined {
  if (value === undefined || !CURSOR_PATTERN.test(value)) {
    return undefined;
  }
  return Number(value);
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return Object.freeze(Array.from(new Set(values)).sort(compareStrings));
}

function compareEvents(left: Record<string, unknown>, right: Record<string, unknown>): number {
  const leftSequence = Number.isSafeInteger(left.sequence) ? left.sequence as number : 0;
  const rightSequence = Number.isSafeInteger(right.sequence) ? right.sequence as number : 0;
  return leftSequence - rightSequence ||
    compareStrings(String(left.cursor ?? ""), String(right.cursor ?? "")) ||
    compareStrings(String(left.eventId ?? ""), String(right.eventId ?? ""));
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function firstDefined<T>(...values: readonly T[]): T | undefined {
  return values.find((value) => value !== undefined);
}

function optionalFields<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T;
}

function visit(
  value: unknown,
  path: string,
  fn: (value: unknown, path: string, key?: string) => void,
  seen: WeakSet<object> = new WeakSet(),
  key?: string,
): void {
  fn(value, path, key);
  if (value === null || typeof value !== "object") {
    return;
  }
  if (seen.has(value)) {
    throw invalidSnapshot("snapshot source must not contain circular references", { path });
  }
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((entry, index) => visit(entry, `${path}.${index}`, fn, seen));
  } else {
    for (const [entryKey, entryValue] of Object.entries(value)) {
      visit(entryValue, joinPath(path, entryKey), fn, seen, entryKey);
    }
  }

  seen.delete(value);
}

function joinPath(path: string, key: string): string {
  return path.length === 0 ? key : `${path}.${key}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalidInput(
  message: string,
  details: Readonly<Record<string, unknown>>,
): LocalWorkspaceSessionSnapshotReviewError {
  return new LocalWorkspaceSessionSnapshotReviewError(
    LOCAL_WORKSPACE_SESSION_SNAPSHOT_REVIEW_ERROR_CODES.INVALID_INPUT,
    message,
    { details },
  );
}

function invalidRetentionPolicy(
  message: string,
  details: Readonly<Record<string, unknown>>,
): LocalWorkspaceSessionSnapshotReviewError {
  return new LocalWorkspaceSessionSnapshotReviewError(
    LOCAL_WORKSPACE_SESSION_SNAPSHOT_REVIEW_ERROR_CODES.INVALID_RETENTION_POLICY,
    message,
    { details },
  );
}

function invalidSnapshot(
  message: string,
  details: Readonly<Record<string, unknown>>,
): LocalWorkspaceSessionSnapshotReviewError {
  return new LocalWorkspaceSessionSnapshotReviewError(
    LOCAL_WORKSPACE_SESSION_SNAPSHOT_REVIEW_ERROR_CODES.INVALID_SNAPSHOT,
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
