import {
  redactWorkspaceSessionText,
  type WorkspaceSessionSeverity,
} from "./workspaceSessionState.ts";

export type WorkspaceSessionSnapshotReviewKind =
  | "compare"
  | "retention_preview"
  | "mixed";

export type WorkspaceSessionSnapshotReviewPhase =
  | "loading"
  | "success"
  | "empty"
  | "error";

export type WorkspaceSessionSnapshotReviewStatus =
  | "loading"
  | "empty"
  | "ready"
  | "attention"
  | "blocked"
  | "error";

export type WorkspaceSessionSnapshotReviewRiskLevel =
  | "none"
  | "low"
  | "medium"
  | "high";

export type WorkspaceSessionSnapshotChangedFieldType =
  | "added"
  | "removed"
  | "modified"
  | "unchanged"
  | "unknown";

export type WorkspaceSessionSnapshotRetentionAction =
  | "keep"
  | "delete"
  | "review";

export type WorkspaceSessionSnapshotReviewWarningKind =
  | "raw_body"
  | "raw_path"
  | "raw_token"
  | "durable_writes"
  | "not_local_only"
  | "not_redacted"
  | "malformed";

export type WorkspaceSessionSnapshotReviewContext =
  | "review"
  | "compare"
  | "retention"
  | "readiness"
  | "warnings";

export type WorkspaceSessionSnapshotReviewBadgeKind =
  | "status"
  | "risk"
  | "compare"
  | "retention"
  | "readiness"
  | "redaction";

export interface BuildWorkspaceSessionSnapshotReviewStateOptions {
  defaultTimestamp?: string;
  error?: unknown;
  kind?: WorkspaceSessionSnapshotReviewKind;
  loading?: boolean;
}

export interface WorkspaceSessionSnapshotReviewState {
  id: "workspace_session_snapshot_review";
  kind: WorkspaceSessionSnapshotReviewKind;
  phase: WorkspaceSessionSnapshotReviewPhase;
  generatedAt: string;
  status: WorkspaceSessionSnapshotReviewStatus;
  statusLabel: string;
  severity: WorkspaceSessionSeverity;
  severityLabel: string;
  riskLevel: WorkspaceSessionSnapshotReviewRiskLevel;
  riskLabel: string;
  headline: string;
  isEmpty: boolean;
  baselineSnapshotId?: string;
  targetSnapshotId?: string;
  snapshotIds: string[];
  changedFieldCount: number;
  changedFields: WorkspaceSessionSnapshotChangedField[];
  redacted: boolean;
  redactionCount: number;
  localOnly: boolean;
  localOnlyKnown: boolean;
  durableWrites: boolean;
  durableWriteCount: number;
  persistenceReady: boolean;
  rawBodyRetained: boolean;
  rawPathRetained: boolean;
  rawTokenRetained: boolean;
  rawRetentionRisk: boolean;
  rawRetentionRiskCount: number;
  retentionKeepCount: number;
  retentionDeleteCount: number;
  retentionReviewCount: number;
  retentionTotalCount: number;
  retentionPreview: WorkspaceSessionSnapshotRetentionPreview;
  statusBadges: WorkspaceSessionSnapshotReviewBadge[];
  summaryCards: WorkspaceSessionSnapshotReviewSummaryCard[];
  warnings: WorkspaceSessionSnapshotReviewWarning[];
  emptyStates: WorkspaceSessionSnapshotReviewEmptyStates;
  errorStates: WorkspaceSessionSnapshotReviewErrorState[];
  ariaLabel: string;
}

export interface WorkspaceSessionSnapshotChangedField {
  id: string;
  path: string;
  label: string;
  changeType: WorkspaceSessionSnapshotChangedFieldType;
  changeTypeLabel: string;
  status: WorkspaceSessionSnapshotReviewStatus;
  statusLabel: string;
  severity: WorkspaceSessionSeverity;
  severityLabel: string;
  beforeLabel?: string;
  afterLabel?: string;
  redacted: boolean;
  redactionCount: number;
  detailLabels: string[];
  ariaLabel: string;
}

export interface WorkspaceSessionSnapshotRetentionPreview {
  id: "workspace_session_snapshot_retention_preview";
  status: WorkspaceSessionSnapshotReviewStatus;
  statusLabel: string;
  severity: WorkspaceSessionSeverity;
  severityLabel: string;
  keepCount: number;
  deleteCount: number;
  reviewCount: number;
  totalCount: number;
  rows: WorkspaceSessionSnapshotRetentionRow[];
  label: string;
  detailLabels: string[];
  ariaLabel: string;
}

export interface WorkspaceSessionSnapshotRetentionRow {
  id: string;
  snapshotId: string;
  label: string;
  action: WorkspaceSessionSnapshotRetentionAction;
  actionLabel: string;
  status: WorkspaceSessionSnapshotReviewStatus;
  statusLabel: string;
  severity: WorkspaceSessionSeverity;
  severityLabel: string;
  reason?: string;
  detailLabels: string[];
  ariaLabel: string;
}

export interface WorkspaceSessionSnapshotReviewBadge {
  id: string;
  kind: WorkspaceSessionSnapshotReviewBadgeKind;
  label: string;
  value: string;
  status: WorkspaceSessionSnapshotReviewStatus;
  statusLabel: string;
  severity: WorkspaceSessionSeverity;
  severityLabel: string;
  ariaLabel: string;
}

export interface WorkspaceSessionSnapshotReviewSummaryCard {
  id: string;
  label: string;
  value: string;
  status: WorkspaceSessionSnapshotReviewStatus;
  statusLabel: string;
  severity: WorkspaceSessionSeverity;
  severityLabel: string;
  detailLabels: string[];
  ariaLabel: string;
}

export interface WorkspaceSessionSnapshotReviewWarning {
  id: string;
  kind: WorkspaceSessionSnapshotReviewWarningKind;
  label: string;
  description: string;
  count: number;
  status: WorkspaceSessionSnapshotReviewStatus;
  statusLabel: string;
  severity: WorkspaceSessionSeverity;
  severityLabel: string;
  ariaLabel: string;
}

export interface WorkspaceSessionSnapshotReviewEmptyStates {
  compare: WorkspaceSessionSnapshotReviewEmptyState;
  retention: WorkspaceSessionSnapshotReviewEmptyState;
  warnings: WorkspaceSessionSnapshotReviewEmptyState;
}

export interface WorkspaceSessionSnapshotReviewEmptyState {
  id: string;
  label: string;
  description: string;
  ariaLabel: string;
  actionLabel?: string;
}

export interface WorkspaceSessionSnapshotReviewErrorState {
  id: string;
  context: WorkspaceSessionSnapshotReviewContext;
  redacted: boolean;
  redactionCount: number;
  errorState: {
    id: string;
    label: string;
    description: string;
    ariaLabel: string;
    retryLabel: string;
  };
}

type AnyRecord = Record<string, unknown>;

interface NormalizedReviewInput {
  kind: WorkspaceSessionSnapshotReviewKind;
  generatedAt: string;
  baselineSnapshotId?: string;
  targetSnapshotId?: string;
  snapshotIds: string[];
  changedFields: NormalizedChangedField[];
  retentionRows: NormalizedRetentionRow[];
  retentionCounts: RetentionCounts;
  redacted: boolean;
  redactionCount: number;
  localOnly?: boolean;
  durableWriteCount: number;
  rawBodyRetentionCount: number;
  rawPathRetentionCount: number;
  rawTokenRetentionCount: number;
  warningCounts: WarningCounts;
  hasRecognizedPayload: boolean;
  errorStates: WorkspaceSessionSnapshotReviewErrorState[];
}

interface NormalizedChangedField {
  path: string;
  changeType: WorkspaceSessionSnapshotChangedFieldType;
  before?: unknown;
  after?: unknown;
  redacted?: boolean;
  redactionCount: number;
}

interface NormalizedRetentionRow {
  snapshotId: string;
  label?: string;
  action: WorkspaceSessionSnapshotRetentionAction;
  reason?: string;
  createdAt?: string;
}

interface RetentionCounts {
  keepCount: number;
  deleteCount: number;
  reviewCount: number;
}

interface WarningCounts {
  rawBody: number;
  rawPath: number;
  rawToken: number;
  durableWrites: number;
  notLocalOnly: number;
  notRedacted: number;
  malformed: number;
}

interface RetentionRiskCounts {
  rawBody: number;
  rawPath: number;
  rawToken: number;
}

interface RedactedText {
  text: string;
  redactionCount: number;
}

const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const REDACTED = "[REDACTED]";
const SECRET_KEY_PATTERN =
  /(?:api[-_]?key|apikey|authorization|bearer|cookie|credential|jwt|password|passphrase|private[-_]?key|refresh[-_]?token|secret|session[-_]?token|signing[-_]?key|token)$/i;
const SECRET_VALUE_PATTERN =
  /(?:bearer\s+[a-z0-9._~+/=-]{8,}|(?:sk|rk|pk|tok|pat|npm|ghp|gho)_[a-z0-9_-]{8,}|(?:sk|rk|pat|glpat|github_pat)-[a-z0-9_-]{8,}|[a-z0-9_+/=-]{40,})/i;
const ABSOLUTE_PATH_PATTERN =
  /(?:\b[A-Za-z]:[\\/][^\s"',;)}\]]+|\\\\[^\\\s"',;)}\]]+[\\][^\s"',;)}\]]+|\b(?:\/Users|\/home|\/var|\/tmp|\/private|\/mnt|\/Volumes)\/[^\s"',;)}\]]+)/;

export function buildWorkspaceSessionSnapshotReviewState(
  input: unknown = {},
  options: BuildWorkspaceSessionSnapshotReviewStateOptions = {},
): WorkspaceSessionSnapshotReviewState {
  if (options.loading === true) {
    return buildWorkspaceSessionSnapshotReviewLoadingState(options);
  }

  const normalized = normalizeReviewInput(input, options);
  const changedFields = normalized.changedFields
    .map(buildChangedField)
    .sort(compareChangedFields);
  const retentionRows = normalized.retentionRows
    .map(buildRetentionRow)
    .sort(compareRetentionRows);
  const retentionPreview = buildRetentionPreview(
    retentionRows,
    normalized.retentionCounts,
  );
  const warnings = buildWarnings(normalized);
  const phase = resolvePhase(normalized, changedFields, retentionPreview, warnings);
  const riskLevel = resolveRiskLevel(normalized, retentionPreview, warnings);
  const status = resolveStatus(phase, riskLevel);
  const severity = severityForStatus(status);
  const rawRetentionRiskCount =
    normalized.rawBodyRetentionCount +
    normalized.rawPathRetentionCount +
    normalized.rawTokenRetentionCount;
  const localOnlyKnown = normalized.localOnly !== undefined;
  const localOnly = normalized.localOnly === true;
  const durableWrites = normalized.durableWriteCount > 0;
  const persistenceReady = localOnly && !durableWrites && rawRetentionRiskCount === 0;
  const redacted = normalized.redacted && normalized.warningCounts.notRedacted === 0;
  const state: WorkspaceSessionSnapshotReviewState = {
    id: "workspace_session_snapshot_review",
    kind: normalized.kind,
    phase,
    generatedAt: normalized.generatedAt,
    status,
    statusLabel: statusLabel(status),
    severity,
    severityLabel: severityLabel(severity),
    riskLevel,
    riskLabel: riskLabel(riskLevel),
    headline: buildHeadline(normalized.kind, status),
    isEmpty: phase === "empty",
    ...(normalized.baselineSnapshotId === undefined
      ? {}
      : { baselineSnapshotId: normalized.baselineSnapshotId }),
    ...(normalized.targetSnapshotId === undefined
      ? {}
      : { targetSnapshotId: normalized.targetSnapshotId }),
    snapshotIds: [...normalized.snapshotIds],
    changedFieldCount: changedFields.length,
    changedFields,
    redacted,
    redactionCount: normalized.redactionCount,
    localOnly,
    localOnlyKnown,
    durableWrites,
    durableWriteCount: normalized.durableWriteCount,
    persistenceReady,
    rawBodyRetained: normalized.rawBodyRetentionCount > 0,
    rawPathRetained: normalized.rawPathRetentionCount > 0,
    rawTokenRetained: normalized.rawTokenRetentionCount > 0,
    rawRetentionRisk: rawRetentionRiskCount > 0,
    rawRetentionRiskCount,
    retentionKeepCount: retentionPreview.keepCount,
    retentionDeleteCount: retentionPreview.deleteCount,
    retentionReviewCount: retentionPreview.reviewCount,
    retentionTotalCount: retentionPreview.totalCount,
    retentionPreview,
    statusBadges: [],
    summaryCards: [],
    warnings,
    emptyStates: buildWorkspaceSessionSnapshotReviewEmptyStates(),
    errorStates: normalized.errorStates.map(cloneErrorState),
    ariaLabel: "",
  };

  state.statusBadges = buildStatusBadges(state);
  state.summaryCards = buildSummaryCards(state);
  state.ariaLabel = [
    "Workspace session snapshot review",
    statusLabel(status),
    riskLabel(riskLevel),
    formatCount(changedFields.length, "changed field"),
    `${retentionPreview.keepCount} keep and ${retentionPreview.deleteCount} delete`,
    formatCount(rawRetentionRiskCount, "raw retention warning"),
  ].join(", ");

  return cloneState(state);
}

export function buildWorkspaceSessionSnapshotReviewLoadingState(
  options: Pick<
    BuildWorkspaceSessionSnapshotReviewStateOptions,
    "defaultTimestamp" | "kind"
  > = {},
): WorkspaceSessionSnapshotReviewState {
  const kind = options.kind ?? "mixed";
  const generatedAt = normalizeTimestamp(undefined, options.defaultTimestamp);
  const status: WorkspaceSessionSnapshotReviewStatus = "loading";
  const severity = severityForStatus(status);
  const riskLevel: WorkspaceSessionSnapshotReviewRiskLevel = "none";
  const retentionPreview = buildRetentionPreview([], {
    keepCount: 0,
    deleteCount: 0,
    reviewCount: 0,
  });
  const state: WorkspaceSessionSnapshotReviewState = {
    id: "workspace_session_snapshot_review",
    kind,
    phase: "loading",
    generatedAt,
    status,
    statusLabel: statusLabel(status),
    severity,
    severityLabel: severityLabel(severity),
    riskLevel,
    riskLabel: riskLabel(riskLevel),
    headline: buildHeadline(kind, status),
    isEmpty: false,
    snapshotIds: [],
    changedFieldCount: 0,
    changedFields: [],
    redacted: true,
    redactionCount: 0,
    localOnly: true,
    localOnlyKnown: true,
    durableWrites: false,
    durableWriteCount: 0,
    persistenceReady: true,
    rawBodyRetained: false,
    rawPathRetained: false,
    rawTokenRetained: false,
    rawRetentionRisk: false,
    rawRetentionRiskCount: 0,
    retentionKeepCount: 0,
    retentionDeleteCount: 0,
    retentionReviewCount: 0,
    retentionTotalCount: 0,
    retentionPreview,
    statusBadges: [],
    summaryCards: [
      buildSummaryCard({
        id: "workspace_session_snapshot_review.summary.loading",
        label: "Snapshot review",
        value: "Loading",
        status,
        detailLabels: ["Waiting for workspace session snapshot review payload."],
      }),
    ],
    warnings: [],
    emptyStates: buildWorkspaceSessionSnapshotReviewEmptyStates(),
    errorStates: [],
    ariaLabel: "Workspace session snapshot review, Loading, No risk",
  };

  state.statusBadges = buildStatusBadges(state);
  return cloneState(state);
}

export function buildWorkspaceSessionSnapshotReviewChangedFields(
  input: unknown,
  options: BuildWorkspaceSessionSnapshotReviewStateOptions = {},
): WorkspaceSessionSnapshotChangedField[] {
  return buildWorkspaceSessionSnapshotReviewState(input, options).changedFields.map(
    cloneChangedField,
  );
}

export function buildWorkspaceSessionSnapshotRetentionPreview(
  input: unknown,
  options: BuildWorkspaceSessionSnapshotReviewStateOptions = {},
): WorkspaceSessionSnapshotRetentionPreview {
  return cloneRetentionPreview(
    buildWorkspaceSessionSnapshotReviewState(input, options).retentionPreview,
  );
}

export function buildWorkspaceSessionSnapshotReviewStatusBadges(
  input: unknown,
  options: BuildWorkspaceSessionSnapshotReviewStateOptions = {},
): WorkspaceSessionSnapshotReviewBadge[] {
  return buildWorkspaceSessionSnapshotReviewState(input, options).statusBadges.map(
    cloneBadge,
  );
}

export function buildWorkspaceSessionSnapshotReviewSummaryCards(
  input: unknown,
  options: BuildWorkspaceSessionSnapshotReviewStateOptions = {},
): WorkspaceSessionSnapshotReviewSummaryCard[] {
  return buildWorkspaceSessionSnapshotReviewState(input, options).summaryCards.map(
    cloneSummaryCard,
  );
}

export function buildWorkspaceSessionSnapshotReviewWarnings(
  input: unknown,
  options: BuildWorkspaceSessionSnapshotReviewStateOptions = {},
): WorkspaceSessionSnapshotReviewWarning[] {
  return buildWorkspaceSessionSnapshotReviewState(input, options).warnings.map(
    cloneWarning,
  );
}

export function buildWorkspaceSessionSnapshotReviewEmptyStates(): WorkspaceSessionSnapshotReviewEmptyStates {
  return {
    compare: buildWorkspaceSessionSnapshotReviewEmptyState("compare"),
    retention: buildWorkspaceSessionSnapshotReviewEmptyState("retention"),
    warnings: buildWorkspaceSessionSnapshotReviewEmptyState("warnings"),
  };
}

export function buildWorkspaceSessionSnapshotReviewEmptyState(
  context: "compare" | "retention" | "warnings",
): WorkspaceSessionSnapshotReviewEmptyState {
  switch (context) {
    case "compare":
      return {
        id: "workspace_session_snapshot_review_compare_empty",
        label: "No changed fields",
        description:
          "Changed snapshot fields will appear after a compare response loads.",
        ariaLabel: "No workspace session snapshot changed fields are available",
        actionLabel: "Run compare",
      };
    case "retention":
      return {
        id: "workspace_session_snapshot_review_retention_empty",
        label: "No retention preview",
        description:
          "Retention keep and delete counts will appear after a retention preview loads.",
        ariaLabel: "No workspace session snapshot retention preview is available",
        actionLabel: "Preview retention",
      };
    case "warnings":
      return {
        id: "workspace_session_snapshot_review_warnings_empty",
        label: "No retention warnings",
        description:
          "Raw body, path, and token retention warnings will appear here.",
        ariaLabel: "No workspace session snapshot retention warnings are available",
      };
  }
}

export function buildWorkspaceSessionSnapshotReviewErrorStates(
  input: unknown,
  options: BuildWorkspaceSessionSnapshotReviewStateOptions = {},
): WorkspaceSessionSnapshotReviewErrorState[] {
  return normalizeReviewInput(input, options).errorStates.map(cloneErrorState);
}

export function buildWorkspaceSessionSnapshotReviewErrorState(
  context: WorkspaceSessionSnapshotReviewContext,
  error: unknown,
): WorkspaceSessionSnapshotReviewErrorState {
  const redacted = redactWorkspaceSessionSnapshotReviewError(error);
  const id = `workspace_session_snapshot_review_${context}_error`;
  return {
    id,
    context,
    redacted: redacted.redactionCount > 0,
    redactionCount: redacted.redactionCount,
    errorState: {
      id,
      label: errorLabel(context),
      description: redacted.text,
      ariaLabel: errorLabel(context),
      retryLabel: retryLabel(context),
    },
  };
}

export function redactWorkspaceSessionSnapshotReviewDisplayValue(
  value: unknown,
  keyHint?: string,
): string {
  if (value === undefined) {
    return "Unavailable";
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  const raw =
    typeof value === "string"
      ? value.trim()
      : JSON.stringify(redactSensitiveValue(value, keyHint)) ?? String(value);
  if (raw === "") {
    return "Unavailable";
  }
  const normalizedKey = normalizeToken(keyHint);
  const redacted = redactWorkspaceSessionText(raw).trim();
  if (
    redacted !== raw ||
    SECRET_KEY_PATTERN.test(keyHint ?? "") ||
    SECRET_VALUE_PATTERN.test(raw) ||
    ABSOLUTE_PATH_PATTERN.test(raw) ||
    normalizedKey.includes("raw_body") ||
    normalizedKey.includes("request_body") ||
    normalizedKey.includes("response_body")
  ) {
    return REDACTED;
  }
  return truncate(redacted.replace(/\s+/g, " "), 120);
}

export function redactWorkspaceSessionSnapshotReviewError(
  error: unknown,
): RedactedText {
  const message = errorMessage(error);
  const raw =
    message ??
    (isRecord(error) ? JSON.stringify(redactSensitiveValue(error)) : undefined);
  if (raw === undefined || raw.trim() === "") {
    return {
      text: "Workspace session snapshot review could not load.",
      redactionCount: 0,
    };
  }
  const sanitized = redactWorkspaceSessionText(raw)
    .replace(/\[redacted[^\]]*\]/gi, REDACTED)
    .replace(/\s+/g, " ")
    .trim();
  const text =
    sanitized === "" ? "Workspace session snapshot review could not load." : sanitized;
  return {
    text: truncate(text, 180),
    redactionCount: countRedactionMarkers(text),
  };
}

function normalizeReviewInput(
  input: unknown,
  options: BuildWorkspaceSessionSnapshotReviewStateOptions,
): NormalizedReviewInput {
  const root = clonePlain(unwrapResponseBody(input));
  const rootRecord = isRecord(root) ? root : undefined;
  const compareRecord = findCompareRecord(rootRecord);
  const retentionRecord = findRetentionRecord(rootRecord);
  const kind = options.kind ?? inferReviewKind(rootRecord, compareRecord, retentionRecord);
  const generatedAt = normalizeTimestamp(
    timestampField(
      rootRecord,
      "generatedAt",
      "generated_at",
      "createdAt",
      "created_at",
      "updatedAt",
      "updated_at",
      "previewedAt",
      "previewed_at",
    ),
    options.defaultTimestamp,
  );
  const changedFields = normalizeChangedFields(compareRecord ?? rootRecord);
  const retentionRows = normalizeRetentionRows(retentionRecord ?? rootRecord);
  const retentionCounts = normalizeRetentionCounts(
    retentionRecord ?? rootRecord,
    retentionRows,
  );
  const hasRetentionCountFields = hasAnyCountField(retentionRecord ?? rootRecord, [
    "keepCount",
    "keep_count",
    "keptCount",
    "kept_count",
    "deleteCount",
    "delete_count",
    "deletedCount",
    "deleted_count",
    "wouldDeleteCount",
    "would_delete_count",
    "reviewCount",
    "review_count",
  ]);
  const snapshotIds = collectSnapshotIds(rootRecord, compareRecord, retentionRows);
  const explicitRedactionCount = explicitCount(rootRecord, [
    "redactionCount",
    "redaction_count",
    "redactionsApplied",
    "redactions_applied",
  ]);
  const redactionCount = Math.max(
    explicitRedactionCount,
    countRedactions(rootRecord),
    sum(changedFields, (field) => field.redactionCount),
  );
  const localOnly = localOnlyFromValue(rootRecord);
  const durableWriteCount = countDurableWrites(rootRecord);
  const riskCounts = countRetentionRisks(rootRecord);
  const redacted = redactedFromValue(rootRecord) !== false;
  const hasSnapshotBoundary =
    stringField(
      compareRecord ?? rootRecord,
      "baselineSnapshotId",
      "baseline_snapshot_id",
      "fromSnapshotId",
      "from_snapshot_id",
      "leftSnapshotId",
      "left_snapshot_id",
    ) !== undefined ||
    stringField(
      compareRecord ?? rootRecord,
      "targetSnapshotId",
      "target_snapshot_id",
      "toSnapshotId",
      "to_snapshot_id",
      "rightSnapshotId",
      "right_snapshot_id",
    ) !== undefined;
  const hasRecognizedPayload =
    rootRecord !== undefined &&
    (changedFields.length > 0 ||
      retentionRows.length > 0 ||
      retentionCounts.keepCount > 0 ||
      retentionCounts.deleteCount > 0 ||
      retentionCounts.reviewCount > 0 ||
      hasRetentionCountFields ||
      hasSnapshotBoundary ||
      localOnly !== undefined ||
      durableWriteCount > 0 ||
      riskCounts.rawBody > 0 ||
      riskCounts.rawPath > 0 ||
      riskCounts.rawToken > 0);
  const warningCounts: WarningCounts = {
    rawBody: riskCounts.rawBody,
    rawPath: riskCounts.rawPath,
    rawToken: riskCounts.rawToken,
    durableWrites: durableWriteCount,
    notLocalOnly: localOnly === false ? 1 : 0,
    notRedacted: redacted ? 0 : 1,
    malformed: hasRecognizedPayload ? 0 : 1,
  };
  const errorStates: WorkspaceSessionSnapshotReviewErrorState[] = [];
  if (!hasRecognizedPayload) {
    errorStates.push(
      buildWorkspaceSessionSnapshotReviewErrorState(
        "review",
        rootRecord === undefined
          ? "Snapshot review payload must be an object."
          : "Snapshot review payload must include compare or retention preview data.",
      ),
    );
  }
  if (options.error !== undefined) {
    errorStates.push(buildWorkspaceSessionSnapshotReviewErrorState("review", options.error));
  }
  const baselineSnapshotId = safeOptionalString(
    stringField(
      compareRecord ?? rootRecord,
      "baselineSnapshotId",
      "baseline_snapshot_id",
      "fromSnapshotId",
      "from_snapshot_id",
      "leftSnapshotId",
      "left_snapshot_id",
    ),
    "baselineSnapshotId",
  );
  const targetSnapshotId = safeOptionalString(
    stringField(
      compareRecord ?? rootRecord,
      "targetSnapshotId",
      "target_snapshot_id",
      "toSnapshotId",
      "to_snapshot_id",
      "rightSnapshotId",
      "right_snapshot_id",
    ),
    "targetSnapshotId",
  );

  return {
    kind,
    generatedAt,
    ...(baselineSnapshotId === undefined ? {} : { baselineSnapshotId }),
    ...(targetSnapshotId === undefined ? {} : { targetSnapshotId }),
    snapshotIds,
    changedFields,
    retentionRows,
    retentionCounts,
    redacted,
    redactionCount,
    localOnly,
    durableWriteCount,
    rawBodyRetentionCount: riskCounts.rawBody,
    rawPathRetentionCount: riskCounts.rawPath,
    rawTokenRetentionCount: riskCounts.rawToken,
    warningCounts,
    hasRecognizedPayload,
    errorStates: dedupeErrorStates(errorStates),
  };
}

function unwrapResponseBody(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  if (isComparePayloadLike(value) || isRetentionPayloadLike(value)) {
    return value;
  }

  const response = recordField(value, "response");
  const responseBody = recordField(response, "body");
  if (responseBody !== undefined) {
    return responseBody;
  }

  for (const key of ["body", "data", "result", "payload"]) {
    const nested = recordField(value, key);
    if (nested !== undefined) {
      return nested;
    }
  }
  return value;
}

function inferReviewKind(
  root: AnyRecord | undefined,
  compareRecord: AnyRecord | undefined,
  retentionRecord: AnyRecord | undefined,
): WorkspaceSessionSnapshotReviewKind {
  const explicit = normalizeToken(
    stringField(root, "kind", "type", "reviewKind", "review_kind"),
  );
  if (explicit.includes("retention")) {
    return compareRecord === undefined ? "retention_preview" : "mixed";
  }
  if (explicit.includes("compare") || explicit.includes("diff")) {
    return retentionRecord === undefined ? "compare" : "mixed";
  }
  if (compareRecord !== undefined && retentionRecord !== undefined) {
    return "mixed";
  }
  if (retentionRecord !== undefined || isRetentionPayloadLike(root)) {
    return "retention_preview";
  }
  return "compare";
}

function findCompareRecord(root: AnyRecord | undefined): AnyRecord | undefined {
  return recordField(
    root,
    "compare",
    "comparison",
    "snapshotCompare",
    "snapshot_compare",
    "diff",
  );
}

function findRetentionRecord(root: AnyRecord | undefined): AnyRecord | undefined {
  return recordField(
    root,
    "retention",
    "retentionPreview",
    "retention_preview",
    "retentionPlan",
    "retention_plan",
  );
}

function normalizeChangedFields(
  record: AnyRecord | undefined,
): NormalizedChangedField[] {
  const rawFields = arrayField(
    record,
    "changedFields",
    "changed_fields",
    "fieldChanges",
    "field_changes",
    "changes",
    "diffs",
  );

  return rawFields
    .map((entry, index) => normalizeChangedField(entry, index))
    .filter(isDefined);
}

function normalizeChangedField(
  entry: unknown,
  index: number,
): NormalizedChangedField | undefined {
  if (typeof entry === "string") {
    const path = normalizePath(entry, index);
    return {
      path,
      changeType: "modified",
      redactionCount: countRedactions(entry),
    };
  }
  if (!isRecord(entry)) {
    return undefined;
  }

  const path = normalizePath(
    stringField(entry, "path", "field", "fieldPath", "field_path", "name", "key"),
    index,
  );
  const before = valueField(entry, "before", "previous", "oldValue", "old_value", "from");
  const after = valueField(entry, "after", "current", "newValue", "new_value", "to");
  const redacted = booleanField(entry, "redacted", "isRedacted", "is_redacted");
  return {
    path,
    changeType: normalizeChangeType(
      stringField(entry, "changeType", "change_type", "type", "op", "operation", "status"),
    ),
    before,
    after,
    redacted,
    redactionCount: countRedactions(entry),
  };
}

function normalizeRetentionRows(
  record: AnyRecord | undefined,
): NormalizedRetentionRow[] {
  const rawRows = arrayField(
    record,
    "records",
    "items",
    "snapshots",
    "retentionRows",
    "retention_rows",
    "decisions",
  );

  return rawRows
    .map((entry, index) => normalizeRetentionRow(entry, index))
    .filter(isDefined);
}

function normalizeRetentionRow(
  entry: unknown,
  index: number,
): NormalizedRetentionRow | undefined {
  if (typeof entry === "string") {
    return {
      snapshotId: safeIdentifier(entry, `snapshot_${index + 1}`),
      action: "review",
    };
  }
  if (!isRecord(entry)) {
    return undefined;
  }

  const snapshotId = safeIdentifier(
    stringField(entry, "snapshotId", "snapshot_id", "id"),
    `snapshot_${index + 1}`,
  );
  const label = safeOptionalString(
    stringField(entry, "label", "name", "title"),
    "label",
  );
  const reason = safeOptionalString(
    stringField(entry, "reason", "description", "detail"),
    "reason",
  );
  return {
    snapshotId,
    ...(label === undefined ? {} : { label }),
    action: normalizeRetentionAction(
      stringField(entry, "action", "decision", "retentionAction", "retention_action"),
    ),
    ...(reason === undefined ? {} : { reason }),
    ...(timestampField(entry, "createdAt", "created_at", "updatedAt", "updated_at") ===
    undefined
      ? {}
      : {
          createdAt: timestampField(
            entry,
            "createdAt",
            "created_at",
            "updatedAt",
            "updated_at",
          ),
        }),
  };
}

function normalizeRetentionCounts(
  record: AnyRecord | undefined,
  rows: readonly NormalizedRetentionRow[],
): RetentionCounts {
  const counts = recordField(record, "counts", "summary", "retentionCounts", "retention_counts");
  const keepCount =
    nonNegativeIntegerField(record, "keepCount", "keep_count", "keptCount", "kept_count") ??
    nonNegativeIntegerField(counts, "keep", "keepCount", "keep_count", "kept") ??
    rows.filter((row) => row.action === "keep").length;
  const deleteCount =
    nonNegativeIntegerField(
      record,
      "deleteCount",
      "delete_count",
      "deletedCount",
      "deleted_count",
      "wouldDeleteCount",
      "would_delete_count",
    ) ??
    nonNegativeIntegerField(counts, "delete", "deleteCount", "delete_count", "deleted") ??
    rows.filter((row) => row.action === "delete").length;
  const reviewCount =
    nonNegativeIntegerField(record, "reviewCount", "review_count") ??
    nonNegativeIntegerField(counts, "review", "reviewCount", "review_count") ??
    rows.filter((row) => row.action === "review").length;
  return { keepCount, deleteCount, reviewCount };
}

function buildChangedField(
  field: NormalizedChangedField,
  index: number,
): WorkspaceSessionSnapshotChangedField {
  const changeType = field.changeType;
  const status = statusForChangedField(changeType);
  const severity = severityForStatus(status);
  const beforeLabel =
    field.before === undefined
      ? undefined
      : redactWorkspaceSessionSnapshotReviewDisplayValue(field.before, field.path);
  const afterLabel =
    field.after === undefined
      ? undefined
      : redactWorkspaceSessionSnapshotReviewDisplayValue(field.after, field.path);
  const redactionCount =
    field.redactionCount +
    countRedactionMarkers(beforeLabel ?? "") +
    countRedactionMarkers(afterLabel ?? "");
  const redacted =
    field.redacted === true ||
    redactionCount > 0 ||
    beforeLabel === REDACTED ||
    afterLabel === REDACTED;
  const detailLabels = [
    changeTypeLabel(changeType),
    ...(beforeLabel === undefined ? [] : [`Before: ${beforeLabel}`]),
    ...(afterLabel === undefined ? [] : [`After: ${afterLabel}`]),
  ];

  return {
    id: `workspace_session_snapshot_review.changed_field.${sanitizeIdentifier(
      field.path,
      `field_${index + 1}`,
    )}`,
    path: field.path,
    label: field.path,
    changeType,
    changeTypeLabel: changeTypeLabel(changeType),
    status,
    statusLabel: statusLabel(status),
    severity,
    severityLabel: severityLabel(severity),
    ...(beforeLabel === undefined ? {} : { beforeLabel }),
    ...(afterLabel === undefined ? {} : { afterLabel }),
    redacted,
    redactionCount,
    detailLabels,
    ariaLabel: [
      field.path,
      changeTypeLabel(changeType),
      statusLabel(status),
    ].join(", "),
  };
}

function buildRetentionRow(
  row: NormalizedRetentionRow,
  index: number,
): WorkspaceSessionSnapshotRetentionRow {
  const status = statusForRetentionAction(row.action);
  const severity = severityForStatus(status);
  const label = row.label ?? row.snapshotId;
  const detailLabels = [
    actionLabel(row.action),
    ...(row.reason === undefined ? [] : [row.reason]),
    ...(row.createdAt === undefined ? [] : [`Created ${row.createdAt}`]),
  ];
  return {
    id: `workspace_session_snapshot_review.retention.${sanitizeIdentifier(
      row.snapshotId,
      `snapshot_${index + 1}`,
    )}`,
    snapshotId: row.snapshotId,
    label,
    action: row.action,
    actionLabel: actionLabel(row.action),
    status,
    statusLabel: statusLabel(status),
    severity,
    severityLabel: severityLabel(severity),
    ...(row.reason === undefined ? {} : { reason: row.reason }),
    detailLabels,
    ariaLabel: [label, actionLabel(row.action), statusLabel(status)].join(", "),
  };
}

function buildRetentionPreview(
  rows: readonly WorkspaceSessionSnapshotRetentionRow[],
  counts: RetentionCounts,
): WorkspaceSessionSnapshotRetentionPreview {
  const keepCount = Math.max(counts.keepCount, rows.filter((row) => row.action === "keep").length);
  const deleteCount = Math.max(
    counts.deleteCount,
    rows.filter((row) => row.action === "delete").length,
  );
  const reviewCount = Math.max(
    counts.reviewCount,
    rows.filter((row) => row.action === "review").length,
  );
  const totalCount = Math.max(rows.length, keepCount + deleteCount + reviewCount);
  const status: WorkspaceSessionSnapshotReviewStatus =
    totalCount === 0 ? "empty" : deleteCount > 0 || reviewCount > 0 ? "attention" : "ready";
  const severity = severityForStatus(status);
  const detailLabels = [
    formatCount(keepCount, "snapshot") + " kept",
    formatCount(deleteCount, "snapshot") + " deleted",
    formatCount(reviewCount, "snapshot") + " needs review",
  ];
  return {
    id: "workspace_session_snapshot_retention_preview",
    status,
    statusLabel: statusLabel(status),
    severity,
    severityLabel: severityLabel(severity),
    keepCount,
    deleteCount,
    reviewCount,
    totalCount,
    rows: rows.map(cloneRetentionRow),
    label:
      totalCount === 0
        ? "No retention actions"
        : `${keepCount} keep / ${deleteCount} delete`,
    detailLabels,
    ariaLabel: [
      "Workspace session snapshot retention preview",
      formatCount(keepCount, "keep action"),
      formatCount(deleteCount, "delete action"),
      formatCount(reviewCount, "review action"),
    ].join(", "),
  };
}

function buildWarnings(
  input: NormalizedReviewInput,
): WorkspaceSessionSnapshotReviewWarning[] {
  const warningInputs: Array<{
    kind: WorkspaceSessionSnapshotReviewWarningKind;
    count: number;
  }> = [
    { kind: "raw_body", count: input.warningCounts.rawBody },
    { kind: "raw_path", count: input.warningCounts.rawPath },
    { kind: "raw_token", count: input.warningCounts.rawToken },
    { kind: "durable_writes", count: input.warningCounts.durableWrites },
    { kind: "not_local_only", count: input.warningCounts.notLocalOnly },
    { kind: "not_redacted", count: input.warningCounts.notRedacted },
    { kind: "malformed", count: input.warningCounts.malformed },
  ];

  return warningInputs
    .filter((entry) => entry.count > 0)
    .map((entry) => {
      const status = statusForWarning(entry.kind);
      const severity = severityForStatus(status);
      return {
        id: `workspace_session_snapshot_review.warning.${entry.kind}`,
        kind: entry.kind,
        label: warningLabel(entry.kind),
        description: warningDescription(entry.kind),
        count: entry.count,
        status,
        statusLabel: statusLabel(status),
        severity,
        severityLabel: severityLabel(severity),
        ariaLabel: [
          warningLabel(entry.kind),
          formatCount(entry.count, "signal"),
          statusLabel(status),
        ].join(", "),
      };
    });
}

function buildStatusBadges(
  state: WorkspaceSessionSnapshotReviewState,
): WorkspaceSessionSnapshotReviewBadge[] {
  return [
    buildBadge({
      id: "workspace_session_snapshot_review.badge.status",
      kind: "status",
      label: "Review status",
      value: state.statusLabel,
      status: state.status,
    }),
    buildBadge({
      id: "workspace_session_snapshot_review.badge.risk",
      kind: "risk",
      label: "Risk",
      value: state.riskLabel,
      status: statusForRiskLevel(state.riskLevel),
    }),
    buildBadge({
      id: "workspace_session_snapshot_review.badge.compare",
      kind: "compare",
      label: "Changed fields",
      value: formatCount(state.changedFieldCount, "field"),
      status: state.changedFieldCount > 0 ? "ready" : "empty",
    }),
    buildBadge({
      id: "workspace_session_snapshot_review.badge.retention",
      kind: "retention",
      label: "Retention",
      value: `${state.retentionPreview.keepCount} keep / ${state.retentionPreview.deleteCount} delete`,
      status: state.retentionPreview.status,
    }),
    buildBadge({
      id: "workspace_session_snapshot_review.badge.readiness",
      kind: "readiness",
      label: "Persistence",
      value: state.persistenceReady ? "Ready" : "Blocked",
      status: state.persistenceReady ? "ready" : "blocked",
    }),
    buildBadge({
      id: "workspace_session_snapshot_review.badge.redactions",
      kind: "redaction",
      label: "Redactions",
      value: formatCount(state.redactionCount, "redaction"),
      status: state.redacted ? "ready" : "blocked",
    }),
  ];
}

function buildBadge(input: {
  id: string;
  kind: WorkspaceSessionSnapshotReviewBadgeKind;
  label: string;
  value: string;
  status: WorkspaceSessionSnapshotReviewStatus;
}): WorkspaceSessionSnapshotReviewBadge {
  const severity = severityForStatus(input.status);
  return {
    id: input.id,
    kind: input.kind,
    label: input.label,
    value: input.value,
    status: input.status,
    statusLabel: statusLabel(input.status),
    severity,
    severityLabel: severityLabel(severity),
    ariaLabel: [input.label, input.value, statusLabel(input.status)].join(", "),
  };
}

function buildSummaryCards(
  state: WorkspaceSessionSnapshotReviewState,
): WorkspaceSessionSnapshotReviewSummaryCard[] {
  return [
    buildSummaryCard({
      id: "workspace_session_snapshot_review.summary.compare",
      label: "Snapshot compare",
      value: formatCount(state.changedFieldCount, "changed field"),
      status: state.changedFieldCount > 0 ? "ready" : "empty",
      detailLabels: [
        ...(state.baselineSnapshotId === undefined
          ? []
          : [`Baseline ${state.baselineSnapshotId}`]),
        ...(state.targetSnapshotId === undefined
          ? []
          : [`Target ${state.targetSnapshotId}`]),
      ],
    }),
    buildSummaryCard({
      id: "workspace_session_snapshot_review.summary.readiness",
      label: "Persistence readiness",
      value: state.persistenceReady ? "Ready" : "Blocked",
      status: state.persistenceReady ? "ready" : "blocked",
      detailLabels: [
        state.localOnly ? "Local only" : "Not local only",
        state.durableWrites
          ? formatCount(state.durableWriteCount, "durable write")
          : "No durable writes",
        state.rawRetentionRisk ? "Raw retention warning" : "No raw retention",
      ],
    }),
    buildSummaryCard({
      id: "workspace_session_snapshot_review.summary.retention",
      label: "Retention preview",
      value: state.retentionPreview.label,
      status: state.retentionPreview.status,
      detailLabels: state.retentionPreview.detailLabels,
    }),
    buildSummaryCard({
      id: "workspace_session_snapshot_review.summary.warnings",
      label: "Retention warnings",
      value: formatCount(state.warnings.length, "warning"),
      status: state.warnings.length > 0 ? state.status : "ready",
      detailLabels: state.warnings.map((warning) => warning.label),
    }),
  ];
}

function buildSummaryCard(input: {
  id: string;
  label: string;
  value: string;
  status: WorkspaceSessionSnapshotReviewStatus;
  detailLabels: string[];
}): WorkspaceSessionSnapshotReviewSummaryCard {
  const severity = severityForStatus(input.status);
  return {
    id: input.id,
    label: input.label,
    value: input.value,
    status: input.status,
    statusLabel: statusLabel(input.status),
    severity,
    severityLabel: severityLabel(severity),
    detailLabels: [...input.detailLabels],
    ariaLabel: [
      input.label,
      input.value,
      statusLabel(input.status),
      ...input.detailLabels,
    ].join(", "),
  };
}

function resolvePhase(
  input: NormalizedReviewInput,
  changedFields: readonly WorkspaceSessionSnapshotChangedField[],
  retentionPreview: WorkspaceSessionSnapshotRetentionPreview,
  warnings: readonly WorkspaceSessionSnapshotReviewWarning[],
): WorkspaceSessionSnapshotReviewPhase {
  if (input.errorStates.length > 0 && !input.hasRecognizedPayload) {
    return "error";
  }
  if (
    changedFields.length === 0 &&
    retentionPreview.totalCount === 0 &&
    warnings.length === 0
  ) {
    return "empty";
  }
  return "success";
}

function resolveStatus(
  phase: WorkspaceSessionSnapshotReviewPhase,
  riskLevel: WorkspaceSessionSnapshotReviewRiskLevel,
): WorkspaceSessionSnapshotReviewStatus {
  if (phase === "loading") {
    return "loading";
  }
  if (phase === "error") {
    return "error";
  }
  if (phase === "empty") {
    return "empty";
  }
  if (riskLevel === "high") {
    return "blocked";
  }
  if (riskLevel === "medium") {
    return "attention";
  }
  return "ready";
}

function resolveRiskLevel(
  input: NormalizedReviewInput,
  retentionPreview: WorkspaceSessionSnapshotRetentionPreview,
  warnings: readonly WorkspaceSessionSnapshotReviewWarning[],
): WorkspaceSessionSnapshotReviewRiskLevel {
  if (
    input.warningCounts.rawBody > 0 ||
    input.warningCounts.rawToken > 0 ||
    input.warningCounts.notLocalOnly > 0 ||
    input.warningCounts.notRedacted > 0 ||
    input.warningCounts.malformed > 0
  ) {
    return "high";
  }
  if (
    input.warningCounts.rawPath > 0 ||
    input.warningCounts.durableWrites > 0 ||
    retentionPreview.deleteCount > 0 ||
    retentionPreview.reviewCount > 0
  ) {
    return "medium";
  }
  if (input.changedFields.length > 0 || input.redactionCount > 0 || warnings.length > 0) {
    return "low";
  }
  return "none";
}

function collectSnapshotIds(
  root: AnyRecord | undefined,
  compareRecord: AnyRecord | undefined,
  rows: readonly NormalizedRetentionRow[],
): string[] {
  const direct = stringArrayField(
    root,
    "snapshotIds",
    "snapshot_ids",
    "affectedSnapshotIds",
    "affected_snapshot_ids",
  );
  const compareIds = [
    stringField(
      compareRecord ?? root,
      "baselineSnapshotId",
      "baseline_snapshot_id",
      "fromSnapshotId",
      "from_snapshot_id",
      "leftSnapshotId",
      "left_snapshot_id",
    ),
    stringField(
      compareRecord ?? root,
      "targetSnapshotId",
      "target_snapshot_id",
      "toSnapshotId",
      "to_snapshot_id",
      "rightSnapshotId",
      "right_snapshot_id",
    ),
  ].filter(isDefined);
  return sortedUnique([
    ...direct,
    ...compareIds,
    ...rows.map((row) => row.snapshotId),
  ].map((value) => safeIdentifier(value, "snapshot")));
}

function countRetentionRisks(value: unknown, keyHint = ""): RetentionRiskCounts {
  if (value === undefined || value === null) {
    return { rawBody: 0, rawPath: 0, rawToken: 0 };
  }
  if (typeof value === "string") {
    return {
      rawBody: 0,
      rawPath: isUnsafePathValue(value, keyHint) ? 1 : 0,
      rawToken: isUnsafeTokenValue(value, keyHint) ? 1 : 0,
    };
  }
  if (Array.isArray(value)) {
    return value.reduce(
      (total, item) => addRiskCounts(total, countRetentionRisks(item, keyHint)),
      { rawBody: 0, rawPath: 0, rawToken: 0 },
    );
  }
  if (!isRecord(value)) {
    return { rawBody: 0, rawPath: 0, rawToken: 0 };
  }

  let counts: RetentionRiskCounts = { rawBody: 0, rawPath: 0, rawToken: 0 };
  for (const [key, entry] of Object.entries(value)) {
    const token = normalizeToken(key);
    if (isRawBodyRetentionFlag(token, entry)) {
      counts.rawBody += 1;
      continue;
    }
    if (isRawPathRetentionFlag(token, entry)) {
      counts.rawPath += 1;
      continue;
    }
    if (isRawTokenRetentionFlag(token, entry)) {
      counts.rawToken += 1;
      continue;
    }
    if (isRawBodyKey(token)) {
      counts.rawBody += 1;
      counts = addRiskCounts(counts, countRetentionRisks(entry, key));
      continue;
    }
    counts = addRiskCounts(counts, countRetentionRisks(entry, key));
  }
  return counts;
}

function addRiskCounts(
  left: RetentionRiskCounts,
  right: RetentionRiskCounts,
): RetentionRiskCounts {
  return {
    rawBody: left.rawBody + right.rawBody,
    rawPath: left.rawPath + right.rawPath,
    rawToken: left.rawToken + right.rawToken,
  };
}

function isRawBodyRetentionFlag(key: string, value: unknown): boolean {
  return value === true &&
    (key === "raw_body_retained" ||
      key === "raw_body_stored" ||
      key === "raw_request_body_stored" ||
      key === "raw_response_body_stored" ||
      key === "stores_raw_body");
}

function isRawPathRetentionFlag(key: string, value: unknown): boolean {
  return (
    value === true &&
      (key === "raw_path_retained" ||
        key === "raw_paths_retained" ||
        key === "raw_paths_stored" ||
        key === "raw_storage_paths_stored") ||
    value === false &&
      (key === "storage_path_redacted" ||
        key === "storage_paths_redacted" ||
        key === "path_redacted" ||
        key === "paths_redacted")
  );
}

function isRawTokenRetentionFlag(key: string, value: unknown): boolean {
  return (
    value === true &&
      (key === "raw_token_retained" ||
        key === "raw_tokens_retained" ||
        key === "raw_secrets_stored" ||
        key === "raw_lock_material_stored") ||
    value === false &&
      (key === "token_redacted" ||
        key === "tokens_redacted" ||
        key === "lock_material_redacted")
  );
}

function isRawBodyKey(key: string): boolean {
  return (
    key === "request_body" ||
    key === "response_body" ||
    key === "raw_body" ||
    key === "raw_request_body" ||
    key === "raw_response_body"
  );
}

function isUnsafePathValue(value: string, keyHint: string): boolean {
  void keyHint;
  return !isRedactedToken(value) && ABSOLUTE_PATH_PATTERN.test(value);
}

function isUnsafeTokenValue(value: string, keyHint: string): boolean {
  return !isRedactedToken(value) &&
    (SECRET_KEY_PATTERN.test(keyHint) || SECRET_VALUE_PATTERN.test(value));
}

function countDurableWrites(value: unknown): number {
  if (value === undefined || value === null) {
    return 0;
  }
  if (Array.isArray(value)) {
    return sum(value, countDurableWrites);
  }
  if (!isRecord(value)) {
    return 0;
  }

  let count = 0;
  for (const [key, entry] of Object.entries(value)) {
    const token = normalizeToken(key);
    if ((token === "durable_writes" || token === "durable_write") && entry === true) {
      count += 1;
      continue;
    }
    count += countDurableWrites(entry);
  }
  return count;
}

function countRedactions(value: unknown): number {
  if (value === undefined || value === null) {
    return 0;
  }
  if (typeof value === "string") {
    return countRedactionMarkers(value);
  }
  if (Array.isArray(value)) {
    return sum(value, countRedactions);
  }
  if (!isRecord(value)) {
    return 0;
  }

  let count = 0;
  for (const [key, entry] of Object.entries(value)) {
    const token = normalizeToken(key);
    if (
      token === "redactions" ||
      token === "redaction_markers" ||
      token === "redacted_paths" ||
      token === "markers"
    ) {
      count += Array.isArray(entry) ? entry.length : countRedactions(entry);
      continue;
    }
    if (token === "fields" && Array.isArray(entry)) {
      count += entry.filter((item) => typeof item === "string").length;
      continue;
    }
    count += countRedactions(entry);
  }
  return count;
}

function localOnlyFromValue(value: unknown): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    let foundTrue = false;
    for (const item of value) {
      const nested = localOnlyFromValue(item);
      if (nested === false) {
        return false;
      }
      if (nested === true) {
        foundTrue = true;
      }
    }
    return foundTrue ? true : undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }

  const direct = booleanField(
    value,
    "localOnly",
    "local_only",
    "isLocalOnly",
    "is_local_only",
  );
  if (direct !== undefined) {
    return direct;
  }

  let foundTrue = false;
  for (const nested of Object.values(value)) {
    const nestedLocalOnly = localOnlyFromValue(nested);
    if (nestedLocalOnly === false) {
      return false;
    }
    if (nestedLocalOnly === true) {
      foundTrue = true;
    }
  }
  return foundTrue ? true : undefined;
}

function redactedFromValue(value: unknown): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    let foundTrue = false;
    for (const item of value) {
      const nested = redactedFromValue(item);
      if (nested === false) {
        return false;
      }
      if (nested === true) {
        foundTrue = true;
      }
    }
    return foundTrue ? true : undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }

  const direct = booleanField(
    value,
    "redacted",
    "isRedacted",
    "is_redacted",
    "hasRedactions",
    "has_redactions",
  );
  if (direct !== undefined) {
    return direct;
  }

  let foundTrue = false;
  for (const nested of Object.values(value)) {
    const nestedRedacted = redactedFromValue(nested);
    if (nestedRedacted === false) {
      return false;
    }
    if (nestedRedacted === true) {
      foundTrue = true;
    }
  }
  return foundTrue ? true : undefined;
}

function isComparePayloadLike(value: unknown): value is AnyRecord {
  if (!isRecord(value)) {
    return false;
  }
  const kind = normalizeToken(stringField(value, "kind", "type"));
  return (
    kind.includes("compare") ||
    kind.includes("diff") ||
    arrayField(
      value,
      "changedFields",
      "changed_fields",
      "fieldChanges",
      "field_changes",
      "changes",
      "diffs",
    ).length > 0
  );
}

function isRetentionPayloadLike(value: unknown): value is AnyRecord {
  if (!isRecord(value)) {
    return false;
  }
  const kind = normalizeToken(stringField(value, "kind", "type"));
  return (
    kind.includes("retention") ||
    nonNegativeIntegerField(
      value,
      "keepCount",
      "keep_count",
      "deleteCount",
      "delete_count",
      "reviewCount",
      "review_count",
    ) !== undefined ||
    recordField(value, "retention", "retentionPreview", "retention_preview") !== undefined
  );
}

function explicitCount(
  record: AnyRecord | undefined,
  keys: readonly string[],
): number {
  return nonNegativeIntegerField(record, ...keys) ?? 0;
}

function hasAnyCountField(
  record: AnyRecord | undefined,
  keys: readonly string[],
): boolean {
  return nonNegativeIntegerField(record, ...keys) !== undefined ||
    nonNegativeIntegerField(
      recordField(record, "counts", "summary", "retentionCounts", "retention_counts"),
      ...keys,
    ) !== undefined;
}

function normalizePath(value: string | undefined, index: number): string {
  if (value === undefined || value.trim() === "") {
    return `field_${index + 1}`;
  }
  return redactWorkspaceSessionSnapshotReviewDisplayValue(value, "path");
}

function normalizeChangeType(
  value: string | undefined,
): WorkspaceSessionSnapshotChangedFieldType {
  const token = normalizeToken(value);
  if (token === "add" || token === "added" || token === "created" || token === "create") {
    return "added";
  }
  if (token === "remove" || token === "removed" || token === "delete" || token === "deleted") {
    return "removed";
  }
  if (token === "modify" || token === "modified" || token === "change" || token === "changed" || token === "update" || token === "updated") {
    return "modified";
  }
  if (token === "same" || token === "unchanged" || token === "equal") {
    return "unchanged";
  }
  return "unknown";
}

function normalizeRetentionAction(
  value: string | undefined,
): WorkspaceSessionSnapshotRetentionAction {
  const token = normalizeToken(value);
  if (
    token === "keep" ||
    token === "kept" ||
    token === "retain" ||
    token === "retained"
  ) {
    return "keep";
  }
  if (
    token === "delete" ||
    token === "deleted" ||
    token === "remove" ||
    token === "removed" ||
    token === "purge" ||
    token === "expire"
  ) {
    return "delete";
  }
  return "review";
}

function statusForChangedField(
  changeType: WorkspaceSessionSnapshotChangedFieldType,
): WorkspaceSessionSnapshotReviewStatus {
  switch (changeType) {
    case "added":
    case "modified":
      return "ready";
    case "removed":
    case "unknown":
      return "attention";
    case "unchanged":
      return "empty";
  }
}

function statusForRetentionAction(
  action: WorkspaceSessionSnapshotRetentionAction,
): WorkspaceSessionSnapshotReviewStatus {
  switch (action) {
    case "keep":
      return "ready";
    case "delete":
    case "review":
      return "attention";
  }
}

function statusForWarning(
  kind: WorkspaceSessionSnapshotReviewWarningKind,
): WorkspaceSessionSnapshotReviewStatus {
  switch (kind) {
    case "raw_body":
    case "raw_token":
    case "not_local_only":
    case "not_redacted":
    case "malformed":
      return "blocked";
    case "raw_path":
    case "durable_writes":
      return "attention";
  }
}

function statusForRiskLevel(
  riskLevel: WorkspaceSessionSnapshotReviewRiskLevel,
): WorkspaceSessionSnapshotReviewStatus {
  switch (riskLevel) {
    case "none":
    case "low":
      return "ready";
    case "medium":
      return "attention";
    case "high":
      return "blocked";
  }
}

function changeTypeLabel(
  changeType: WorkspaceSessionSnapshotChangedFieldType,
): string {
  switch (changeType) {
    case "added":
      return "Added";
    case "removed":
      return "Removed";
    case "modified":
      return "Modified";
    case "unchanged":
      return "Unchanged";
    case "unknown":
      return "Unknown change";
  }
}

function actionLabel(action: WorkspaceSessionSnapshotRetentionAction): string {
  switch (action) {
    case "keep":
      return "Keep";
    case "delete":
      return "Delete";
    case "review":
      return "Review";
  }
}

function warningLabel(kind: WorkspaceSessionSnapshotReviewWarningKind): string {
  switch (kind) {
    case "raw_body":
      return "Raw body retained";
    case "raw_path":
      return "Raw path retained";
    case "raw_token":
      return "Raw token retained";
    case "durable_writes":
      return "Durable writes detected";
    case "not_local_only":
      return "Not local only";
    case "not_redacted":
      return "Payload not redacted";
    case "malformed":
      return "Malformed review payload";
  }
}

function warningDescription(
  kind: WorkspaceSessionSnapshotReviewWarningKind,
): string {
  switch (kind) {
    case "raw_body":
      return "A response indicates raw request or response body content may be retained.";
    case "raw_path":
      return "A response indicates raw storage or filesystem path content may be retained.";
    case "raw_token":
      return "A response indicates token, secret, or lock material may be retained.";
    case "durable_writes":
      return "The review payload reports durable writes instead of preview-only state.";
    case "not_local_only":
      return "The review payload is not marked local-only.";
    case "not_redacted":
      return "The review payload is not marked redacted.";
    case "malformed":
      return "The review payload did not include compare or retention preview data.";
  }
}

function statusLabel(status: WorkspaceSessionSnapshotReviewStatus): string {
  switch (status) {
    case "loading":
      return "Loading";
    case "empty":
      return "Empty";
    case "ready":
      return "Ready";
    case "attention":
      return "Needs review";
    case "blocked":
      return "Blocked";
    case "error":
      return "Error";
  }
}

function severityForStatus(
  status: WorkspaceSessionSnapshotReviewStatus,
): WorkspaceSessionSeverity {
  switch (status) {
    case "ready":
      return "success";
    case "attention":
      return "warning";
    case "blocked":
    case "error":
      return "critical";
    case "loading":
      return "info";
    case "empty":
      return "neutral";
  }
}

function severityLabel(severity: WorkspaceSessionSeverity): string {
  switch (severity) {
    case "neutral":
      return "Neutral";
    case "info":
      return "Info";
    case "success":
      return "Success";
    case "warning":
      return "Warning";
    case "critical":
      return "Critical";
  }
}

function riskLabel(riskLevel: WorkspaceSessionSnapshotReviewRiskLevel): string {
  switch (riskLevel) {
    case "none":
      return "No risk";
    case "low":
      return "Low risk";
    case "medium":
      return "Medium risk";
    case "high":
      return "High risk";
  }
}

function buildHeadline(
  kind: WorkspaceSessionSnapshotReviewKind,
  status: WorkspaceSessionSnapshotReviewStatus,
): string {
  const subject = {
    compare: "Workspace session snapshot compare",
    retention_preview: "Workspace session snapshot retention preview",
    mixed: "Workspace session snapshot review",
  }[kind];
  if (status === "loading") {
    return `${subject} loading`;
  }
  if (status === "empty") {
    return `${subject} empty`;
  }
  if (status === "error") {
    return `${subject} has errors`;
  }
  if (status === "attention") {
    return `${subject} needs review`;
  }
  if (status === "blocked") {
    return `${subject} blocked`;
  }
  return `${subject} ready`;
}

function errorLabel(context: WorkspaceSessionSnapshotReviewContext): string {
  switch (context) {
    case "review":
      return "Workspace session snapshot review could not load";
    case "compare":
      return "Workspace session snapshot compare could not load";
    case "retention":
      return "Workspace session snapshot retention preview could not load";
    case "readiness":
      return "Workspace session snapshot readiness could not load";
    case "warnings":
      return "Workspace session snapshot warnings could not load";
  }
}

function retryLabel(context: WorkspaceSessionSnapshotReviewContext): string {
  switch (context) {
    case "review":
      return "Retry review";
    case "compare":
      return "Retry compare";
    case "retention":
      return "Retry retention preview";
    case "readiness":
      return "Retry readiness";
    case "warnings":
      return "Retry warnings";
  }
}

function compareChangedFields(
  left: WorkspaceSessionSnapshotChangedField,
  right: WorkspaceSessionSnapshotChangedField,
): number {
  return left.path.localeCompare(right.path) ||
    left.changeType.localeCompare(right.changeType);
}

function compareRetentionRows(
  left: WorkspaceSessionSnapshotRetentionRow,
  right: WorkspaceSessionSnapshotRetentionRow,
): number {
  return retentionActionSortWeight(left.action) - retentionActionSortWeight(right.action) ||
    left.snapshotId.localeCompare(right.snapshotId);
}

function retentionActionSortWeight(
  action: WorkspaceSessionSnapshotRetentionAction,
): number {
  switch (action) {
    case "delete":
      return 0;
    case "review":
      return 1;
    case "keep":
      return 2;
  }
}

function valueField(record: AnyRecord, ...keys: readonly string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return record[key];
    }
  }
  return undefined;
}

function timestampField(
  record: AnyRecord | undefined,
  ...keys: readonly string[]
): string | undefined {
  const value = stringField(record, ...keys);
  return value !== undefined && !Number.isNaN(Date.parse(value))
    ? value
    : undefined;
}

function stringField(
  record: AnyRecord | undefined,
  ...keys: readonly string[]
): string | undefined {
  if (record === undefined) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return undefined;
}

function booleanField(
  record: AnyRecord | undefined,
  ...keys: readonly string[]
): boolean | undefined {
  if (record === undefined) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "string") {
      const token = normalizeToken(value);
      if (token === "true" || token === "yes") {
        return true;
      }
      if (token === "false" || token === "no") {
        return false;
      }
    }
  }
  return undefined;
}

function nonNegativeIntegerField(
  record: AnyRecord | undefined,
  ...keys: readonly string[]
): number | undefined {
  if (record === undefined) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return Math.trunc(value);
    }
    if (typeof value === "string" && /^\d+$/.test(value)) {
      return Number(value);
    }
  }
  return undefined;
}

function arrayField(
  record: AnyRecord | undefined,
  ...keys: readonly string[]
): unknown[] {
  if (record === undefined) {
    return [];
  }
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function stringArrayField(
  record: AnyRecord | undefined,
  ...keys: readonly string[]
): string[] {
  return arrayField(record, ...keys).filter(
    (value): value is string => typeof value === "string" && value.trim() !== "",
  );
}

function recordField(
  record: AnyRecord | undefined,
  ...keys: readonly string[]
): AnyRecord | undefined {
  if (record === undefined) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (isRecord(value)) {
      return value;
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is AnyRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDefined<TValue>(value: TValue | undefined): value is TValue {
  return value !== undefined;
}

function errorMessage(error: unknown): string | undefined {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim() !== "") {
    return error.trim();
  }
  if (isRecord(error)) {
    const nested = recordField(error, "error");
    return (
      stringField(error, "message", "description", "detail", "code") ??
      stringField(nested, "message", "description", "detail", "code")
    );
  }
  return undefined;
}

function normalizeTimestamp(
  value: string | undefined,
  fallback: string | undefined,
): string {
  if (value !== undefined && !Number.isNaN(Date.parse(value))) {
    return value;
  }
  if (fallback !== undefined && !Number.isNaN(Date.parse(fallback))) {
    return fallback;
  }
  return DEFAULT_TIMESTAMP;
}

function normalizeToken(value: string | undefined): string {
  return value === undefined
    ? ""
    : value
        .trim()
        .replace(/([a-z])([A-Z])/g, "$1_$2")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

function sanitizeIdentifier(value: string, fallback: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96);
  return sanitized === "" ? fallback : sanitized;
}

function safeIdentifier(
  value: string | undefined,
  fallback: string,
): string {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const redacted = redactWorkspaceSessionSnapshotReviewDisplayValue(value, "snapshotId");
  return redacted === "Unavailable" ? fallback : redacted;
}

function safeOptionalString(
  value: string | undefined,
  keyHint?: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const redacted = redactWorkspaceSessionSnapshotReviewDisplayValue(value, keyHint);
  return redacted === "Unavailable" ? undefined : redacted;
}

function sortedUnique(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function formatCount(
  value: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 1)}...`;
}

function sum<TValue>(
  values: readonly TValue[],
  getValue: (value: TValue) => number,
): number {
  return values.reduce((total, value) => total + getValue(value), 0);
}

function countRedactionMarkers(value: string): number {
  const matches = value.match(/\[(?:redacted[^\]]*|REDACTED)\]/gi);
  return matches === null ? 0 : matches.length;
}

function isRedactedToken(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed === REDACTED ||
    /^\[redacted(?::[a-zA-Z0-9_-]+)*\]$/.test(trimmed) ||
    trimmed === "[redacted-path]" ||
    trimmed === "[redacted-secret]"
  );
}

function redactSensitiveValue(
  value: unknown,
  key = "",
  seen = new WeakMap<object, unknown>(),
): unknown {
  if (value === null || typeof value !== "object") {
    return typeof value === "string"
      ? redactWorkspaceSessionSnapshotReviewDisplayValue(value, key)
      : value;
  }
  if (SECRET_KEY_PATTERN.test(key) || isRawBodyKey(normalizeToken(key))) {
    return REDACTED;
  }

  const objectValue = value as object;
  const existing = seen.get(objectValue);
  if (existing) {
    return existing;
  }
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(objectValue, copy);
    for (const item of value) {
      copy.push(redactSensitiveValue(item, key, seen));
    }
    return copy;
  }

  const copy: Record<string, unknown> = {};
  seen.set(objectValue, copy);
  for (const [entryKey, entryValue] of Object.entries(value as AnyRecord)) {
    copy[entryKey] = redactSensitiveValue(entryValue, entryKey, seen);
  }
  return copy;
}

function dedupeErrorStates(
  errors: readonly WorkspaceSessionSnapshotReviewErrorState[],
): WorkspaceSessionSnapshotReviewErrorState[] {
  const seen = new Set<string>();
  const deduped: WorkspaceSessionSnapshotReviewErrorState[] = [];
  for (const error of errors) {
    const key = [
      error.context,
      error.errorState.label,
      error.errorState.description,
    ].join(":");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(error);
  }
  return deduped;
}

function cloneState(
  state: WorkspaceSessionSnapshotReviewState,
): WorkspaceSessionSnapshotReviewState {
  return {
    ...state,
    snapshotIds: [...state.snapshotIds],
    changedFields: state.changedFields.map(cloneChangedField),
    retentionPreview: cloneRetentionPreview(state.retentionPreview),
    statusBadges: state.statusBadges.map(cloneBadge),
    summaryCards: state.summaryCards.map(cloneSummaryCard),
    warnings: state.warnings.map(cloneWarning),
    emptyStates: {
      compare: { ...state.emptyStates.compare },
      retention: { ...state.emptyStates.retention },
      warnings: { ...state.emptyStates.warnings },
    },
    errorStates: state.errorStates.map(cloneErrorState),
  };
}

function cloneChangedField(
  field: WorkspaceSessionSnapshotChangedField,
): WorkspaceSessionSnapshotChangedField {
  return {
    ...field,
    detailLabels: [...field.detailLabels],
  };
}

function cloneRetentionPreview(
  preview: WorkspaceSessionSnapshotRetentionPreview,
): WorkspaceSessionSnapshotRetentionPreview {
  return {
    ...preview,
    rows: preview.rows.map(cloneRetentionRow),
    detailLabels: [...preview.detailLabels],
  };
}

function cloneRetentionRow(
  row: WorkspaceSessionSnapshotRetentionRow,
): WorkspaceSessionSnapshotRetentionRow {
  return {
    ...row,
    detailLabels: [...row.detailLabels],
  };
}

function cloneBadge(
  badge: WorkspaceSessionSnapshotReviewBadge,
): WorkspaceSessionSnapshotReviewBadge {
  return { ...badge };
}

function cloneSummaryCard(
  card: WorkspaceSessionSnapshotReviewSummaryCard,
): WorkspaceSessionSnapshotReviewSummaryCard {
  return {
    ...card,
    detailLabels: [...card.detailLabels],
  };
}

function cloneWarning(
  warning: WorkspaceSessionSnapshotReviewWarning,
): WorkspaceSessionSnapshotReviewWarning {
  return { ...warning };
}

function cloneErrorState(
  error: WorkspaceSessionSnapshotReviewErrorState,
): WorkspaceSessionSnapshotReviewErrorState {
  return {
    ...error,
    errorState: { ...error.errorState },
  };
}

function clonePlain<TValue>(
  value: TValue,
  seen = new WeakMap<object, unknown>(),
): TValue {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString() as TValue;
  }

  const objectValue = value as object;
  const existing = seen.get(objectValue);
  if (existing) {
    return existing as TValue;
  }
  if (Array.isArray(value)) {
    const cloned: unknown[] = [];
    seen.set(objectValue, cloned);
    for (const item of value) {
      cloned.push(clonePlain(item, seen));
    }
    return cloned as TValue;
  }

  const cloned: Record<string, unknown> = {};
  seen.set(objectValue, cloned);
  for (const [key, entry] of Object.entries(value as AnyRecord)) {
    cloned[key] = clonePlain(entry, seen);
  }
  return cloned as TValue;
}
