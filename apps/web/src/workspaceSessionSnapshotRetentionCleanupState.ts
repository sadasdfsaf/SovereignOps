import {
  redactWorkspaceSessionText,
  type WorkspaceSessionSeverity,
} from "./workspaceSessionState.ts";

export type WorkspaceSessionSnapshotRetentionCleanupSourceKind =
  | "sdk_cleanup_plan"
  | "sdk_retention_preview"
  | "api_retention_preview"
  | "cli_retention_preview"
  | "unknown";

export type WorkspaceSessionSnapshotRetentionCleanupAction =
  | "keep"
  | "delete"
  | "review";

export type WorkspaceSessionSnapshotRetentionCleanupPhase =
  | "loading"
  | "success"
  | "empty"
  | "error";

export type WorkspaceSessionSnapshotRetentionCleanupStatus =
  | "loading"
  | "empty"
  | "ready"
  | "attention"
  | "blocked"
  | "error";

export type WorkspaceSessionSnapshotRetentionCleanupReadinessKind =
  | "dry_run"
  | "local_only"
  | "redacted"
  | "durable_writes"
  | "not_applied"
  | "raw_retention";

export type WorkspaceSessionSnapshotRetentionCleanupWarningKind =
  | "not_dry_run"
  | "durable_writes"
  | "not_local_only"
  | "not_redacted"
  | "raw_body"
  | "raw_path"
  | "raw_token"
  | "applied_actions"
  | "malformed";

export type WorkspaceSessionSnapshotRetentionCleanupContext =
  | "cleanup"
  | "actions"
  | "readiness"
  | "warnings"
  | "redactions"
  | "retention";

export interface BuildWorkspaceSessionSnapshotRetentionCleanupStateOptions {
  defaultTimestamp?: string;
  error?: unknown;
  loading?: boolean;
  sourceKind?: WorkspaceSessionSnapshotRetentionCleanupSourceKind;
}

export interface WorkspaceSessionSnapshotRetentionCleanupState {
  id: "workspace_session_snapshot_retention_cleanup";
  sourceKind: WorkspaceSessionSnapshotRetentionCleanupSourceKind;
  phase: WorkspaceSessionSnapshotRetentionCleanupPhase;
  generatedAt: string;
  status: WorkspaceSessionSnapshotRetentionCleanupStatus;
  statusLabel: string;
  severity: WorkspaceSessionSeverity;
  severityLabel: string;
  headline: string;
  isEmpty: boolean;
  entryCount: number;
  actionCount: number;
  keepCount: number;
  deleteCount: number;
  reviewCount: number;
  dryRun: boolean;
  dryRunKnown: boolean;
  dryRunReady: boolean;
  localOnly: boolean;
  localOnlyKnown: boolean;
  redacted: boolean;
  redactionCount: number;
  durableWrites: boolean;
  durableWriteCount: number;
  applied: boolean;
  appliedCount: number;
  rawBodyRetained: boolean;
  rawPathRetained: boolean;
  rawTokenRetained: boolean;
  rawRetentionRisk: boolean;
  rawRetentionRiskCount: number;
  thresholdLabels: string[];
  actionRows: WorkspaceSessionSnapshotRetentionCleanupActionRow[];
  readinessIndicators: WorkspaceSessionSnapshotRetentionCleanupReadinessIndicator[];
  summaryCards: WorkspaceSessionSnapshotRetentionCleanupSummaryCard[];
  warnings: WorkspaceSessionSnapshotRetentionCleanupWarning[];
  emptyStates: WorkspaceSessionSnapshotRetentionCleanupEmptyStates;
  errorStates: WorkspaceSessionSnapshotRetentionCleanupErrorState[];
  ariaLabel: string;
}

export interface WorkspaceSessionSnapshotRetentionCleanupActionRow {
  id: string;
  snapshotId: string;
  label: string;
  action: WorkspaceSessionSnapshotRetentionCleanupAction;
  actionLabel: string;
  status: WorkspaceSessionSnapshotRetentionCleanupStatus;
  statusLabel: string;
  severity: WorkspaceSessionSeverity;
  severityLabel: string;
  sourceKind?: string;
  sourceIndex?: number;
  rank?: number;
  createdAt?: string;
  updatedAt?: string;
  workspaceId?: string;
  deviceId?: string;
  sessionId?: string;
  fileRef?: string;
  filePathKind?: string;
  fingerprint?: string;
  snapshotFingerprint?: string;
  dryRun: boolean;
  dryRunKnown: boolean;
  applied: boolean;
  redacted: boolean;
  redactionCount: number;
  rawBodyRetained: boolean;
  rawPathRetained: boolean;
  rawTokenRetained: boolean;
  rawRetentionRisk: boolean;
  rawRetentionRiskCount: number;
  reasonLabels: string[];
  issueLabels: string[];
  detailLabels: string[];
  ariaLabel: string;
}

export interface WorkspaceSessionSnapshotRetentionCleanupReadinessIndicator {
  id: string;
  kind: WorkspaceSessionSnapshotRetentionCleanupReadinessKind;
  label: string;
  value: string;
  ready: boolean;
  status: WorkspaceSessionSnapshotRetentionCleanupStatus;
  statusLabel: string;
  severity: WorkspaceSessionSeverity;
  severityLabel: string;
  count: number;
  detailLabels: string[];
  ariaLabel: string;
}

export interface WorkspaceSessionSnapshotRetentionCleanupSummaryCard {
  id: string;
  label: string;
  value: string;
  status: WorkspaceSessionSnapshotRetentionCleanupStatus;
  statusLabel: string;
  severity: WorkspaceSessionSeverity;
  severityLabel: string;
  detailLabels: string[];
  ariaLabel: string;
}

export interface WorkspaceSessionSnapshotRetentionCleanupWarning {
  id: string;
  kind: WorkspaceSessionSnapshotRetentionCleanupWarningKind;
  label: string;
  description: string;
  count: number;
  status: WorkspaceSessionSnapshotRetentionCleanupStatus;
  statusLabel: string;
  severity: WorkspaceSessionSeverity;
  severityLabel: string;
  ariaLabel: string;
}

export interface WorkspaceSessionSnapshotRetentionCleanupEmptyStates {
  actions: WorkspaceSessionSnapshotRetentionCleanupEmptyState;
  readiness: WorkspaceSessionSnapshotRetentionCleanupEmptyState;
  warnings: WorkspaceSessionSnapshotRetentionCleanupEmptyState;
}

export interface WorkspaceSessionSnapshotRetentionCleanupEmptyState {
  id: string;
  label: string;
  description: string;
  ariaLabel: string;
}

export interface WorkspaceSessionSnapshotRetentionCleanupErrorState {
  id: string;
  context: WorkspaceSessionSnapshotRetentionCleanupContext;
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

interface NormalizedInput {
  sourceKind: WorkspaceSessionSnapshotRetentionCleanupSourceKind;
  generatedAt: string;
  hasRecognizedPayload: boolean;
  counts: ActionCounts;
  rows: NormalizedActionRow[];
  thresholdLabels: string[];
  dryRun?: boolean;
  localOnly?: boolean;
  redacted: boolean;
  redactionCount: number;
  durableWriteCount: number;
  appliedCount: number;
  riskCounts: RetentionRiskCounts;
  warningCounts: WarningCounts;
  errorStates: WorkspaceSessionSnapshotRetentionCleanupErrorState[];
}

interface NormalizedActionRow {
  snapshotId: string;
  label?: string;
  action: WorkspaceSessionSnapshotRetentionCleanupAction;
  sourceKind?: string;
  sourceIndex?: number;
  rank?: number;
  createdAt?: string;
  updatedAt?: string;
  workspaceId?: string;
  deviceId?: string;
  sessionId?: string;
  fileRef?: string;
  filePathKind?: string;
  fingerprint?: string;
  snapshotFingerprint?: string;
  dryRun?: boolean;
  applied: boolean;
  redacted: boolean;
  redactionCount: number;
  riskCounts: RetentionRiskCounts;
  reasonLabels: string[];
  issueLabels: string[];
}

interface ActionCounts {
  keepCount: number;
  deleteCount: number;
  reviewCount: number;
  entryCount: number;
}

interface RetentionRiskCounts {
  rawBody: number;
  rawPath: number;
  rawToken: number;
}

interface WarningCounts {
  notDryRun: number;
  durableWrites: number;
  notLocalOnly: number;
  notRedacted: number;
  rawBody: number;
  rawPath: number;
  rawToken: number;
  appliedActions: number;
  malformed: number;
}

interface RedactedText {
  text: string;
  redactionCount: number;
}

const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const REDACTED = "[REDACTED]";
const FINGERPRINT_PATTERN = /^sha256:[a-f0-9]{64}$/;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,160}$/;
const SECRET_KEY_PATTERN =
  /(?:api[-_]?key|apikey|authorization|bearer|cookie|credential|credentials|jwt|password|passphrase|private[-_]?key|refresh[-_]?token|root[-_]?key(?:ref)?|secret|session[-_]?id|sessionid|session[-_]?token|signing[-_]?key|token)$/i;
const SECRET_VALUE_PATTERN =
  /(?:bearer\s+[a-z0-9._~+/=-]{8,}|basic\s+[a-z0-9._~+/=-]{8,}|(?:sk|rk|pk|tok|pat|npm|ghp|gho)_[a-z0-9_-]{8,}|(?:sk|rk|pat|glpat|github_pat)-[a-z0-9_-]{8,}|lock_[a-z0-9_-]{4,}|[a-z0-9_+/=-]{40,})/i;
const OBVIOUS_SECRET_VALUE_PATTERN =
  /(?:bearer\s+[a-z0-9._~+/=-]{8,}|basic\s+[a-z0-9._~+/=-]{8,}|(?:sk|rk|pk|tok|pat|npm|ghp|gho)_[a-z0-9_-]{8,}|(?:sk|rk|pat|glpat|github_pat)-[a-z0-9_-]{8,}|lock_[a-z0-9_-]{4,}|key_session_[a-z0-9_-]+)/i;
const ABSOLUTE_PATH_PATTERN =
  /(?:\b[A-Za-z]:[\\/][^\s"',;)}\]]+|\\\\[^\\\s"',;)}\]]+[\\][^\s"',;)}\]]+|\b(?:\/Users|\/home|\/var|\/tmp|\/private|\/mnt|\/Volumes)\/[^\s"',;)}\]]+)/;

export function buildWorkspaceSessionSnapshotRetentionCleanupState(
  input: unknown = {},
  options: BuildWorkspaceSessionSnapshotRetentionCleanupStateOptions = {},
): WorkspaceSessionSnapshotRetentionCleanupState {
  if (options.loading === true) {
    return buildWorkspaceSessionSnapshotRetentionCleanupLoadingState(options);
  }

  const normalized = normalizeInput(input, options);
  const actionRows = normalized.rows
    .map((row, index) => buildActionRow(row, index, normalized.dryRun))
    .sort(compareActionRows);
  const counts = resolveCounts(normalized.counts, actionRows);
  const rawRetentionRiskCount =
    normalized.riskCounts.rawBody +
    normalized.riskCounts.rawPath +
    normalized.riskCounts.rawToken;
  const dryRunKnown = normalized.dryRun !== undefined;
  const dryRun = normalized.dryRun === true;
  const localOnlyKnown = normalized.localOnly !== undefined;
  const localOnly = normalized.localOnly === true;
  const durableWrites = normalized.durableWriteCount > 0;
  const applied = normalized.appliedCount > 0;
  const dryRunReady =
    normalized.hasRecognizedPayload &&
    dryRun &&
    localOnly &&
    normalized.redacted &&
    !durableWrites &&
    !applied &&
    rawRetentionRiskCount === 0;
  const warnings = buildWarnings(normalized.warningCounts);
  const phase = resolvePhase(normalized, counts, warnings);
  const status = resolveStatus(phase, dryRunReady, counts, warnings);
  const severity = severityForStatus(status);
  const readinessIndicators = buildReadinessIndicators({
    dryRun,
    dryRunKnown,
    localOnly,
    localOnlyKnown,
    redacted: normalized.redacted,
    redactionCount: normalized.redactionCount,
    durableWriteCount: normalized.durableWriteCount,
    appliedCount: normalized.appliedCount,
    rawRetentionRiskCount,
  });
  const state: WorkspaceSessionSnapshotRetentionCleanupState = {
    id: "workspace_session_snapshot_retention_cleanup",
    sourceKind: normalized.sourceKind,
    phase,
    generatedAt: normalized.generatedAt,
    status,
    statusLabel: statusLabel(status),
    severity,
    severityLabel: severityLabel(severity),
    headline: buildHeadline(normalized.sourceKind, status),
    isEmpty: phase === "empty",
    entryCount: counts.entryCount,
    actionCount: actionRows.length,
    keepCount: counts.keepCount,
    deleteCount: counts.deleteCount,
    reviewCount: counts.reviewCount,
    dryRun,
    dryRunKnown,
    dryRunReady,
    localOnly,
    localOnlyKnown,
    redacted: normalized.redacted,
    redactionCount: normalized.redactionCount,
    durableWrites,
    durableWriteCount: normalized.durableWriteCount,
    applied,
    appliedCount: normalized.appliedCount,
    rawBodyRetained: normalized.riskCounts.rawBody > 0,
    rawPathRetained: normalized.riskCounts.rawPath > 0,
    rawTokenRetained: normalized.riskCounts.rawToken > 0,
    rawRetentionRisk: rawRetentionRiskCount > 0,
    rawRetentionRiskCount,
    thresholdLabels: [...normalized.thresholdLabels],
    actionRows,
    readinessIndicators,
    summaryCards: [],
    warnings,
    emptyStates: buildWorkspaceSessionSnapshotRetentionCleanupEmptyStates(),
    errorStates: normalized.errorStates.map(cloneErrorState),
    ariaLabel: "",
  };

  state.summaryCards = buildSummaryCards(state);
  state.ariaLabel = [
    "Workspace session snapshot retention cleanup",
    statusLabel(status),
    formatCount(counts.keepCount, "keep action"),
    formatCount(counts.deleteCount, "delete action"),
    formatCount(counts.reviewCount, "review action"),
    dryRunReady ? "Dry run ready" : "Dry run blocked",
    formatCount(rawRetentionRiskCount, "raw retention flag"),
  ].join(", ");

  return cloneState(state);
}

export function buildWorkspaceSessionSnapshotRetentionCleanupLoadingState(
  options: Pick<
    BuildWorkspaceSessionSnapshotRetentionCleanupStateOptions,
    "defaultTimestamp" | "sourceKind"
  > = {},
): WorkspaceSessionSnapshotRetentionCleanupState {
  const sourceKind = options.sourceKind ?? "unknown";
  const generatedAt = normalizeTimestamp(undefined, options.defaultTimestamp);
  const status: WorkspaceSessionSnapshotRetentionCleanupStatus = "loading";
  const severity = severityForStatus(status);
  const readinessIndicators = buildReadinessIndicators({
    dryRun: false,
    dryRunKnown: false,
    localOnly: false,
    localOnlyKnown: false,
    redacted: true,
    redactionCount: 0,
    durableWriteCount: 0,
    appliedCount: 0,
    rawRetentionRiskCount: 0,
  });
  const state: WorkspaceSessionSnapshotRetentionCleanupState = {
    id: "workspace_session_snapshot_retention_cleanup",
    sourceKind,
    phase: "loading",
    generatedAt,
    status,
    statusLabel: statusLabel(status),
    severity,
    severityLabel: severityLabel(severity),
    headline: buildHeadline(sourceKind, status),
    isEmpty: false,
    entryCount: 0,
    actionCount: 0,
    keepCount: 0,
    deleteCount: 0,
    reviewCount: 0,
    dryRun: false,
    dryRunKnown: false,
    dryRunReady: false,
    localOnly: false,
    localOnlyKnown: false,
    redacted: true,
    redactionCount: 0,
    durableWrites: false,
    durableWriteCount: 0,
    applied: false,
    appliedCount: 0,
    rawBodyRetained: false,
    rawPathRetained: false,
    rawTokenRetained: false,
    rawRetentionRisk: false,
    rawRetentionRiskCount: 0,
    thresholdLabels: [],
    actionRows: [],
    readinessIndicators,
    summaryCards: [
      buildSummaryCard({
        id: "workspace_session_snapshot_retention_cleanup.summary.loading",
        label: "Retention cleanup",
        value: "Loading",
        status,
        detailLabels: ["Waiting for retention cleanup dry-run payload."],
      }),
    ],
    warnings: [],
    emptyStates: buildWorkspaceSessionSnapshotRetentionCleanupEmptyStates(),
    errorStates: [],
    ariaLabel: "Workspace session snapshot retention cleanup, Loading, Info",
  };

  return cloneState(state);
}

export function buildWorkspaceSessionSnapshotRetentionCleanupActionRows(
  input: unknown,
  options: BuildWorkspaceSessionSnapshotRetentionCleanupStateOptions = {},
): WorkspaceSessionSnapshotRetentionCleanupActionRow[] {
  return buildWorkspaceSessionSnapshotRetentionCleanupState(input, options).actionRows.map(
    cloneActionRow,
  );
}

export function buildWorkspaceSessionSnapshotRetentionCleanupReadinessIndicators(
  input: unknown,
  options: BuildWorkspaceSessionSnapshotRetentionCleanupStateOptions = {},
): WorkspaceSessionSnapshotRetentionCleanupReadinessIndicator[] {
  return buildWorkspaceSessionSnapshotRetentionCleanupState(
    input,
    options,
  ).readinessIndicators.map(cloneReadinessIndicator);
}

export function buildWorkspaceSessionSnapshotRetentionCleanupSummaryCards(
  input: unknown,
  options: BuildWorkspaceSessionSnapshotRetentionCleanupStateOptions = {},
): WorkspaceSessionSnapshotRetentionCleanupSummaryCard[] {
  return buildWorkspaceSessionSnapshotRetentionCleanupState(input, options).summaryCards.map(
    cloneSummaryCard,
  );
}

export function buildWorkspaceSessionSnapshotRetentionCleanupWarnings(
  input: unknown,
  options: BuildWorkspaceSessionSnapshotRetentionCleanupStateOptions = {},
): WorkspaceSessionSnapshotRetentionCleanupWarning[] {
  return buildWorkspaceSessionSnapshotRetentionCleanupState(input, options).warnings.map(
    cloneWarning,
  );
}

export function buildWorkspaceSessionSnapshotRetentionCleanupEmptyStates(): WorkspaceSessionSnapshotRetentionCleanupEmptyStates {
  return {
    actions: buildWorkspaceSessionSnapshotRetentionCleanupEmptyState("actions"),
    readiness: buildWorkspaceSessionSnapshotRetentionCleanupEmptyState("readiness"),
    warnings: buildWorkspaceSessionSnapshotRetentionCleanupEmptyState("warnings"),
  };
}

export function buildWorkspaceSessionSnapshotRetentionCleanupEmptyState(
  context: "actions" | "readiness" | "warnings",
): WorkspaceSessionSnapshotRetentionCleanupEmptyState {
  switch (context) {
    case "actions":
      return {
        id: "workspace_session_snapshot_retention_cleanup_actions_empty",
        label: "No cleanup actions",
        description:
          "Retention cleanup action rows appear after a dry-run plan payload loads.",
        ariaLabel: "No workspace session snapshot retention cleanup actions are available",
      };
    case "readiness":
      return {
        id: "workspace_session_snapshot_retention_cleanup_readiness_empty",
        label: "No cleanup readiness",
        description:
          "Dry-run readiness indicators appear after a retention cleanup payload loads.",
        ariaLabel: "No workspace session snapshot retention cleanup readiness is available",
      };
    case "warnings":
      return {
        id: "workspace_session_snapshot_retention_cleanup_warnings_empty",
        label: "No cleanup warnings",
        description:
          "Retention cleanup warnings appear when dry-run safety signals are present.",
        ariaLabel: "No workspace session snapshot retention cleanup warnings are available",
      };
  }
}

export function buildWorkspaceSessionSnapshotRetentionCleanupErrorStates(
  input: unknown,
  options: BuildWorkspaceSessionSnapshotRetentionCleanupStateOptions = {},
): WorkspaceSessionSnapshotRetentionCleanupErrorState[] {
  return normalizeInput(input, options).errorStates.map(cloneErrorState);
}

export function buildWorkspaceSessionSnapshotRetentionCleanupErrorState(
  context: WorkspaceSessionSnapshotRetentionCleanupContext,
  error: unknown,
): WorkspaceSessionSnapshotRetentionCleanupErrorState {
  const redacted = redactWorkspaceSessionSnapshotRetentionCleanupError(error);
  const id = `workspace_session_snapshot_retention_cleanup_${context}_error`;
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

export function redactWorkspaceSessionSnapshotRetentionCleanupDisplayValue(
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

  const normalizedKey = normalizeToken(keyHint);
  const raw =
    typeof value === "string"
      ? value.trim()
      : JSON.stringify(redactSensitiveValue(value, keyHint)) ?? String(value);
  if (raw === "") {
    return "Unavailable";
  }
  if (normalizedKey.includes("fingerprint") && FINGERPRINT_PATTERN.test(raw)) {
    return raw;
  }
  if (
    (normalizedKey === "snapshot_id" ||
      normalizedKey === "record_id" ||
      normalizedKey === "workspace_id" ||
      normalizedKey === "device_id") &&
    SAFE_ID_PATTERN.test(raw) &&
    !OBVIOUS_SECRET_VALUE_PATTERN.test(raw)
  ) {
    return truncate(raw, 120);
  }

  const redacted = redactWorkspaceSessionText(raw).trim();
  if (
    redacted !== raw ||
    SECRET_KEY_PATTERN.test(keyHint ?? "") ||
    SECRET_VALUE_PATTERN.test(raw) ||
    ABSOLUTE_PATH_PATTERN.test(raw) ||
    isRawBodyKey(normalizedKey)
  ) {
    return REDACTED;
  }
  return truncate(redacted.replace(/\s+/g, " "), 120);
}

export function redactWorkspaceSessionSnapshotRetentionCleanupError(
  error: unknown,
): RedactedText {
  const message = errorMessage(error);
  const raw =
    message ??
    (isRecord(error) ? JSON.stringify(redactSensitiveValue(error)) : undefined);
  if (raw === undefined || raw.trim() === "") {
    return {
      text: "Workspace session snapshot retention cleanup could not load.",
      redactionCount: 0,
    };
  }

  const sanitized = redactWorkspaceSessionText(raw)
    .replace(/\[redacted[^\]]*\]/gi, REDACTED)
    .replace(/\s+/g, " ")
    .trim();
  const text =
    sanitized === ""
      ? "Workspace session snapshot retention cleanup could not load."
      : sanitized;
  return {
    text: truncate(text, 180),
    redactionCount: countRedactionMarkers(text),
  };
}

function normalizeInput(
  input: unknown,
  options: BuildWorkspaceSessionSnapshotRetentionCleanupStateOptions,
): NormalizedInput {
  const root = clonePlain(unwrapResponseBody(input));
  const rootRecord = isRecord(root) ? root : undefined;
  const cleanupRecord = findCleanupRecord(rootRecord) ?? rootRecord;
  const sourceKind =
    options.sourceKind ?? inferSourceKind(cleanupRecord);
  const rows = collectActionRows(cleanupRecord, sourceKind);
  const counts = normalizeActionCounts(cleanupRecord, rows);
  const generatedAt = normalizeTimestamp(
    timestampField(
      cleanupRecord,
      "generatedAt",
      "generated_at",
      "previewedAt",
      "previewed_at",
      "createdAt",
      "created_at",
      "updatedAt",
      "updated_at",
      "now",
    ) ?? timestampField(recordField(cleanupRecord, "thresholds", "policy"), "now", "cutoffAt", "cutoff_at"),
    options.defaultTimestamp,
  );
  const explicitDryRun = readDryRun(cleanupRecord, sourceKind);
  const dryRun =
    explicitDryRun ??
    (sourceKind === "sdk_cleanup_plan" ||
    sourceKind === "sdk_retention_preview" ||
    sourceKind === "api_retention_preview" ||
    sourceKind === "cli_retention_preview"
      ? true
      : undefined);
  const localOnly = readLocalOnly(cleanupRecord, sourceKind);
  const redactedValue = redactedFromValue(cleanupRecord);
  const redactionCount = Math.max(
    explicitCount(cleanupRecord, [
      "redactionCount",
      "redaction_count",
      "redactionsApplied",
      "redactions_applied",
    ]),
    countRedactions(cleanupRecord),
    sum(rows, (row) => row.redactionCount),
  );
  const durableWriteCount = countDurableWrites(cleanupRecord);
  const appliedCount = countApplied(cleanupRecord);
  const rowRiskCounts = rows.reduce(
    (total, row) => addRiskCounts(total, row.riskCounts),
    { rawBody: 0, rawPath: 0, rawToken: 0 },
  );
  const riskCounts = addRiskCounts(countRetentionRisks(cleanupRecord), rowRiskCounts);
  const hasCountFields = hasAnyCountField(cleanupRecord, [
    "entryCount",
    "entry_count",
    "recordCount",
    "record_count",
    "keepCount",
    "keep_count",
    "deleteCount",
    "delete_count",
    "reviewCount",
    "review_count",
    "retainedSnapshotCount",
    "retained_snapshot_count",
    "expiredSnapshotCount",
    "expired_snapshot_count",
    "wouldRetain",
    "wouldPrune",
  ]);
  const hasRecognizedPayload =
    cleanupRecord !== undefined &&
    (sourceKind !== "unknown" ||
      rows.length > 0 ||
      counts.entryCount > 0 ||
      hasCountFields ||
      dryRun !== undefined ||
      localOnly !== undefined ||
      durableWriteCount > 0 ||
      appliedCount > 0 ||
      riskCounts.rawBody > 0 ||
      riskCounts.rawPath > 0 ||
      riskCounts.rawToken > 0);
  const warningCounts: WarningCounts = {
    notDryRun: dryRun === false ? 1 : 0,
    durableWrites: durableWriteCount,
    notLocalOnly: localOnly === false ? 1 : 0,
    notRedacted: redactedValue === false ? 1 : 0,
    rawBody: riskCounts.rawBody,
    rawPath: riskCounts.rawPath,
    rawToken: riskCounts.rawToken,
    appliedActions: appliedCount,
    malformed: hasRecognizedPayload ? 0 : 1,
  };
  const errorStates: WorkspaceSessionSnapshotRetentionCleanupErrorState[] = [];
  if (!hasRecognizedPayload) {
    errorStates.push(
      buildWorkspaceSessionSnapshotRetentionCleanupErrorState(
        "cleanup",
        cleanupRecord === undefined
          ? "Retention cleanup payload must be an object."
          : "Retention cleanup payload must include dry-run plan data.",
      ),
    );
  }
  if (options.error !== undefined) {
    errorStates.push(
      buildWorkspaceSessionSnapshotRetentionCleanupErrorState(
        "cleanup",
        options.error,
      ),
    );
  }

  return {
    sourceKind,
    generatedAt,
    hasRecognizedPayload,
    counts,
    rows,
    thresholdLabels: buildThresholdLabels(cleanupRecord),
    dryRun,
    localOnly,
    redacted: redactedValue !== false,
    redactionCount,
    durableWriteCount,
    appliedCount,
    riskCounts,
    warningCounts,
    errorStates: dedupeErrorStates(errorStates),
  };
}

function unwrapResponseBody(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  if (isCleanupPayloadLike(value)) {
    return value;
  }

  const response = recordField(value, "response");
  const responseBody = recordField(response, "body");
  if (responseBody !== undefined && isCleanupPayloadLike(responseBody)) {
    return responseBody;
  }

  for (const key of ["body", "data", "result"]) {
    const nested = recordField(value, key);
    if (nested !== undefined && isCleanupPayloadLike(nested)) {
      return nested;
    }
  }
  return value;
}

function findCleanupRecord(root: AnyRecord | undefined): AnyRecord | undefined {
  if (root === undefined) {
    return undefined;
  }
  const direct = recordField(
    root,
    "retentionCleanup",
    "retention_cleanup",
    "cleanupPlan",
    "cleanup_plan",
    "retentionPlan",
    "retention_plan",
    "plan",
  );
  if (direct !== undefined) {
    return direct;
  }

  const preview = recordField(root, "retentionPreview", "retention_preview");
  const previewResponse = recordField(preview, "response", "body", "data", "result");
  if (previewResponse !== undefined) {
    return previewResponse;
  }
  if (preview !== undefined && isCleanupPayloadLike(preview)) {
    return preview;
  }
  return isCleanupPayloadLike(root) ? root : undefined;
}

function inferSourceKind(
  record: AnyRecord | undefined,
): WorkspaceSessionSnapshotRetentionCleanupSourceKind {
  const rawKind = stringField(record, "kind");
  if (rawKind === "workspace-session-snapshot-review.retention-preview") {
    return "cli_retention_preview";
  }
  if (rawKind === "workspace-session.snapshot-review.retention-preview") {
    return "api_retention_preview";
  }
  const kind = normalizeToken(stringField(record, "kind"));
  if (kind === "local_workspace_session_snapshot_retention_cleanup_plan") {
    return "sdk_cleanup_plan";
  }
  if (kind === "local_workspace_session_snapshot_retention_preview") {
    return "sdk_retention_preview";
  }
  if (
    arrayField(record, "actions", "keepActions", "deleteActions", "reviewActions").length >
      0 ||
    nonNegativeIntegerField(record, "entryCount", "entry_count") !== undefined
  ) {
    return "sdk_cleanup_plan";
  }
  if (
    arrayField(record, "keepCandidates", "keep_candidates", "deleteCandidates", "delete_candidates").length >
      0
  ) {
    return "sdk_retention_preview";
  }
  if (arrayField(record, "snapshots").length > 0 || recordField(record, "policy") !== undefined) {
    return "api_retention_preview";
  }
  if (recordField(record, "retention") !== undefined || recordField(record, "records") !== undefined) {
    return "cli_retention_preview";
  }
  return "unknown";
}

function collectActionRows(
  record: AnyRecord | undefined,
  sourceKind: WorkspaceSessionSnapshotRetentionCleanupSourceKind,
): NormalizedActionRow[] {
  if (record === undefined) {
    return [];
  }

  if (sourceKind === "sdk_cleanup_plan") {
    const direct = arrayField(record, "actions", "items");
    const actionInputs = direct.length > 0
      ? direct.map((entry) => ({ entry, impliedAction: undefined }))
      : [
          ...arrayField(record, "keepActions", "keep_actions").map((entry) => ({
            entry,
            impliedAction: "keep" as const,
          })),
          ...arrayField(record, "deleteActions", "delete_actions").map((entry) => ({
            entry,
            impliedAction: "delete" as const,
          })),
          ...arrayField(record, "reviewActions", "review_actions").map((entry) => ({
            entry,
            impliedAction: "review" as const,
          })),
        ];
    return actionInputs
      .map((input, index) =>
        normalizeActionRow(input.entry, index, sourceKind, input.impliedAction)
      )
      .filter(isDefined);
  }

  if (sourceKind === "sdk_retention_preview") {
    const actionInputs = [
      ...arrayField(record, "keepCandidates", "keep_candidates").map((entry) => ({
        entry,
        impliedAction: "keep" as const,
      })),
      ...arrayField(record, "deleteCandidates", "delete_candidates").map((entry) => ({
        entry,
        impliedAction: "delete" as const,
      })),
    ];
    return actionInputs
      .map((input, index) =>
        normalizeActionRow(input.entry, index, sourceKind, input.impliedAction)
      )
      .filter(isDefined);
  }

  if (sourceKind === "cli_retention_preview") {
    const records = recordField(record, "records");
    const previewRows = arrayField(records, "preview", "items", "records");
    const rows = previewRows.length > 0
      ? previewRows
      : arrayField(record, "preview", "records", "items");
    return rows
      .map((entry, index) => normalizeActionRow(entry, index, sourceKind))
      .filter(isDefined);
  }

  const rows = arrayField(
    record,
    "actions",
    "records",
    "snapshots",
    "items",
    "decisions",
    "retentionRows",
    "retention_rows",
  );
  return rows
    .map((entry, index) => normalizeActionRow(entry, index, sourceKind))
    .filter(isDefined);
}

function normalizeActionRow(
  entry: unknown,
  index: number,
  sourceKind: WorkspaceSessionSnapshotRetentionCleanupSourceKind,
  impliedAction?: WorkspaceSessionSnapshotRetentionCleanupAction,
): NormalizedActionRow | undefined {
  if (typeof entry === "string") {
    return {
      snapshotId: safeIdentifier(entry, `snapshot_${index + 1}`),
      action: impliedAction ?? "review",
      sourceIndex: index,
      applied: false,
      redacted: !isUnsafeTokenValue(entry, "snapshotId") && !isUnsafePathValue(entry),
      redactionCount: countRedactionMarkers(entry),
      riskCounts: countRetentionRisks(entry, "snapshotId"),
      reasonLabels: [],
      issueLabels: [],
    };
  }
  if (!isRecord(entry)) {
    return undefined;
  }

  const summary = recordField(entry, "summary", "snapshot", "record", "candidate") ?? {};
  const actionText = sourceKind === "cli_retention_preview"
    ? stringField(
        entry,
        "decision",
        "retentionDecision",
        "retention_decision",
        "plannedAction",
        "planned_action",
        "retention",
        "action",
      )
    : stringField(
        entry,
        "action",
        "decision",
        "plannedAction",
        "planned_action",
        "retentionAction",
        "retention_action",
        "cleanupAction",
        "cleanup_action",
      );
  const action = impliedAction ??
    normalizeCleanupAction(
      actionText,
      booleanField(entry, "retain", "retained", "keep", "wouldRetain", "would_retain"),
    );
  const snapshotId = safeIdentifier(
    stringField(
      summary,
      "snapshotId",
      "snapshot_id",
      "snapshotRef",
      "snapshot_ref",
      "id",
    ) ??
      stringField(
        entry,
        "snapshotId",
        "snapshot_id",
        "snapshotRef",
        "snapshot_ref",
        "recordId",
        "record_id",
        "id",
      ),
    `action_${index + 1}`,
  );
  const label = safeOptionalString(
    stringField(summary, "label", "name", "title") ??
      stringField(entry, "label", "name", "title"),
    "label",
  );
  const reasons = [
    ...stringArrayField(entry, "reasons", "reasonCodes", "reason_codes"),
    ...stringArrayField(summary, "reasons", "reasonCodes", "reason_codes"),
    stringField(entry, "reason", "description", "detail"),
  ].filter(isDefined);
  const issues = normalizeIssueLabels(entry);
  const rowRiskCounts = addRiskCounts(
    countRetentionRisks(entry),
    issueRiskCounts(entry),
  );
  const redactionCount = countRedactions(entry);
  const redacted = redactedFromValue(entry) !== false &&
    rowRiskCounts.rawBody === 0 &&
    rowRiskCounts.rawPath === 0 &&
    rowRiskCounts.rawToken === 0;

  return {
    snapshotId,
    ...(label === undefined ? {} : { label }),
    action,
    ...(safeOptionalString(
      stringField(summary, "sourceKind", "source_kind") ??
        stringField(entry, "sourceKind", "source_kind"),
      "sourceKind",
    ) === undefined
      ? {}
      : {
          sourceKind: safeOptionalString(
            stringField(summary, "sourceKind", "source_kind") ??
              stringField(entry, "sourceKind", "source_kind"),
            "sourceKind",
          ),
        }),
    sourceIndex: nonNegativeIntegerField(entry, "sourceIndex", "source_index") ?? index,
    ...(nonNegativeIntegerField(entry, "rank", "newestRank", "newest_rank") === undefined
      ? {}
      : {
          rank: nonNegativeIntegerField(entry, "rank", "newestRank", "newest_rank"),
        }),
    ...(timestampField(summary, "createdAt", "created_at") ??
      timestampField(entry, "createdAt", "created_at", "observedAt", "observed_at") ===
    undefined
      ? {}
      : {
          createdAt: timestampField(summary, "createdAt", "created_at") ??
            timestampField(entry, "createdAt", "created_at", "observedAt", "observed_at"),
        }),
    ...(timestampField(summary, "updatedAt", "updated_at") ??
      timestampField(entry, "updatedAt", "updated_at") ===
    undefined
      ? {}
      : {
          updatedAt: timestampField(summary, "updatedAt", "updated_at") ??
            timestampField(entry, "updatedAt", "updated_at"),
        }),
    ...optionalDisplayField("workspaceId", summary, entry, "workspaceId", "workspace_id"),
    ...optionalDisplayField("deviceId", summary, entry, "deviceId", "device_id"),
    ...optionalDisplayField("sessionId", summary, entry, "sessionId", "session_id", "sessionRef", "session_ref"),
    ...optionalDisplayField("fileRef", summary, entry, "fileRef", "file_ref", "filePath", "file_path", "path"),
    ...optionalDisplayField("filePathKind", summary, entry, "filePathKind", "file_path_kind"),
    ...optionalDisplayField("fingerprint", summary, entry, "fingerprint"),
    ...optionalDisplayField(
      "snapshotFingerprint",
      summary,
      entry,
      "snapshotFingerprint",
      "snapshot_fingerprint",
    ),
    dryRun: booleanField(entry, "dryRun", "dry_run"),
    applied: booleanField(entry, "applied", "cleanupApplied", "cleanup_applied") === true,
    redacted,
    redactionCount,
    riskCounts: rowRiskCounts,
    reasonLabels: reasons.map((reason) =>
      redactWorkspaceSessionSnapshotRetentionCleanupDisplayValue(reason, "reason")
    ),
    issueLabels: issues,
  };
}

function optionalDisplayField(
  outputKey: string,
  summary: AnyRecord,
  entry: AnyRecord,
  ...keys: readonly string[]
): Record<string, string> {
  const value = safeOptionalString(
    stringField(summary, ...keys) ?? stringField(entry, ...keys),
    outputKey,
  );
  return value === undefined ? {} : { [outputKey]: value };
}

function normalizeIssueLabels(entry: AnyRecord): string[] {
  const issues = arrayField(entry, "issues", "warnings", "problems");
  return issues
    .map((issue, index) => {
      if (typeof issue === "string") {
        return redactWorkspaceSessionSnapshotRetentionCleanupDisplayValue(
          issue,
          "issue",
        );
      }
      if (!isRecord(issue)) {
        return undefined;
      }
      const issueKind = safeOptionalString(
        stringField(issue, "issueKind", "issue_kind", "kind", "reason"),
        "issueKind",
      );
      const path = safeOptionalString(stringField(issue, "path"), "path");
      const message = safeOptionalString(
        stringField(issue, "message", "description", "detail"),
        "message",
      );
      return [
        issueKind ?? `issue_${index + 1}`,
        ...(path === undefined ? [] : [path]),
        ...(message === undefined ? [] : [message]),
      ].join(": ");
    })
    .filter(isDefined);
}

function issueRiskCounts(value: unknown): RetentionRiskCounts {
  if (value === undefined || value === null) {
    return { rawBody: 0, rawPath: 0, rawToken: 0 };
  }
  if (Array.isArray(value)) {
    return value.reduce(
      (total, item) => addRiskCounts(total, issueRiskCounts(item)),
      { rawBody: 0, rawPath: 0, rawToken: 0 },
    );
  }
  if (!isRecord(value)) {
    return { rawBody: 0, rawPath: 0, rawToken: 0 };
  }

  let counts: RetentionRiskCounts = { rawBody: 0, rawPath: 0, rawToken: 0 };
  const issueKind = normalizeToken(
    stringField(value, "issueKind", "issue_kind", "reason", "kind"),
  );
  if (issueKind === "raw_body" || issueKind === "raw_request_body") {
    counts.rawBody += 1;
  }
  if (
    issueKind === "unsafe_absolute_path" ||
    issueKind === "path_traversal" ||
    issueKind === "raw_path"
  ) {
    counts.rawPath += 1;
  }
  if (
    issueKind === "raw_secret" ||
    issueKind === "raw_lock_token" ||
    issueKind === "raw_token"
  ) {
    counts.rawToken += 1;
  }

  for (const entry of Object.values(value)) {
    counts = addRiskCounts(counts, issueRiskCounts(entry));
  }
  return counts;
}

function normalizeActionCounts(
  record: AnyRecord | undefined,
  rows: readonly NormalizedActionRow[],
): ActionCounts {
  const counts = recordField(record, "counts", "summary", "retentionCounts", "retention_counts");
  const records = recordField(record, "records");
  const retentionDecisions = recordField(records, "retentionDecisions", "retention_decisions");
  const keepCount =
    nonNegativeIntegerField(record, "keepCount", "keep_count", "keptCount", "kept_count") ??
    nonNegativeIntegerField(counts, "keep", "keepCount", "keep_count", "wouldRetain", "would_retain", "retainedSnapshotCount", "retained_snapshot_count") ??
    nonNegativeIntegerField(retentionDecisions, "retain", "retained", "keep") ??
    rows.filter((row) => row.action === "keep").length;
  const deleteCount =
    nonNegativeIntegerField(record, "deleteCount", "delete_count", "deletedCount", "deleted_count") ??
    nonNegativeIntegerField(
      counts,
      "delete",
      "deleteCount",
      "delete_count",
      "wouldDelete",
      "would_delete",
      "wouldPrune",
      "would_prune",
      "expiredSnapshotCount",
      "expired_snapshot_count",
    ) ??
    nonNegativeIntegerField(retentionDecisions, "drop", "delete", "expire", "prune") ??
    rows.filter((row) => row.action === "delete").length;
  const reviewCount =
    nonNegativeIntegerField(record, "reviewCount", "review_count") ??
    nonNegativeIntegerField(counts, "review", "reviewCount", "review_count") ??
    rows.filter((row) => row.action === "review").length;
  const entryCount =
    nonNegativeIntegerField(record, "entryCount", "entry_count", "recordCount", "record_count") ??
    nonNegativeIntegerField(counts, "recordCount", "record_count", "totalSnapshotCount", "total_snapshot_count", "total") ??
    nonNegativeIntegerField(records, "total", "recordCount", "record_count") ??
    rows.length;
  return {
    keepCount,
    deleteCount,
    reviewCount,
    entryCount,
  };
}

function resolveCounts(
  counts: ActionCounts,
  rows: readonly WorkspaceSessionSnapshotRetentionCleanupActionRow[],
): ActionCounts {
  const keepCount = Math.max(
    counts.keepCount,
    rows.filter((row) => row.action === "keep").length,
  );
  const deleteCount = Math.max(
    counts.deleteCount,
    rows.filter((row) => row.action === "delete").length,
  );
  const reviewCount = Math.max(
    counts.reviewCount,
    rows.filter((row) => row.action === "review").length,
  );
  const entryCount = Math.max(
    counts.entryCount,
    rows.length,
    keepCount + deleteCount + reviewCount,
  );
  return { keepCount, deleteCount, reviewCount, entryCount };
}

function buildActionRow(
  row: NormalizedActionRow,
  index: number,
  rootDryRun: boolean | undefined,
): WorkspaceSessionSnapshotRetentionCleanupActionRow {
  const dryRun = row.dryRun ?? rootDryRun;
  const dryRunKnown = dryRun !== undefined;
  const riskCount =
    row.riskCounts.rawBody + row.riskCounts.rawPath + row.riskCounts.rawToken;
  const status = statusForActionRow(row, dryRun, riskCount);
  const severity = severityForStatus(status);
  const label = row.label ?? row.snapshotId;
  const detailLabels = [
    actionLabel(row.action),
    ...(dryRun === true ? ["Dry run"] : dryRun === false ? ["Not dry run"] : []),
    ...(row.applied ? ["Applied"] : []),
    ...(row.sourceKind === undefined ? [] : [`Source ${row.sourceKind}`]),
    ...(row.rank === undefined ? [] : [`Rank ${row.rank}`]),
    ...row.reasonLabels,
    ...row.issueLabels,
  ];

  return {
    id: `workspace_session_snapshot_retention_cleanup.action.${sanitizeIdentifier(
      row.snapshotId,
      `action_${index + 1}`,
    )}`,
    snapshotId: row.snapshotId,
    label,
    action: row.action,
    actionLabel: actionLabel(row.action),
    status,
    statusLabel: statusLabel(status),
    severity,
    severityLabel: severityLabel(severity),
    ...(row.sourceKind === undefined ? {} : { sourceKind: row.sourceKind }),
    ...(row.sourceIndex === undefined ? {} : { sourceIndex: row.sourceIndex }),
    ...(row.rank === undefined ? {} : { rank: row.rank }),
    ...(row.createdAt === undefined ? {} : { createdAt: row.createdAt }),
    ...(row.updatedAt === undefined ? {} : { updatedAt: row.updatedAt }),
    ...(row.workspaceId === undefined ? {} : { workspaceId: row.workspaceId }),
    ...(row.deviceId === undefined ? {} : { deviceId: row.deviceId }),
    ...(row.sessionId === undefined ? {} : { sessionId: row.sessionId }),
    ...(row.fileRef === undefined ? {} : { fileRef: row.fileRef }),
    ...(row.filePathKind === undefined ? {} : { filePathKind: row.filePathKind }),
    ...(row.fingerprint === undefined ? {} : { fingerprint: row.fingerprint }),
    ...(row.snapshotFingerprint === undefined
      ? {}
      : { snapshotFingerprint: row.snapshotFingerprint }),
    dryRun: dryRun === true,
    dryRunKnown,
    applied: row.applied,
    redacted: row.redacted,
    redactionCount: row.redactionCount,
    rawBodyRetained: row.riskCounts.rawBody > 0,
    rawPathRetained: row.riskCounts.rawPath > 0,
    rawTokenRetained: row.riskCounts.rawToken > 0,
    rawRetentionRisk: riskCount > 0,
    rawRetentionRiskCount: riskCount,
    reasonLabels: [...row.reasonLabels],
    issueLabels: [...row.issueLabels],
    detailLabels,
    ariaLabel: [
      label,
      actionLabel(row.action),
      statusLabel(status),
      formatCount(riskCount, "raw retention flag"),
    ].join(", "),
  };
}

function buildReadinessIndicators(input: {
  dryRun: boolean;
  dryRunKnown: boolean;
  localOnly: boolean;
  localOnlyKnown: boolean;
  redacted: boolean;
  redactionCount: number;
  durableWriteCount: number;
  appliedCount: number;
  rawRetentionRiskCount: number;
}): WorkspaceSessionSnapshotRetentionCleanupReadinessIndicator[] {
  return [
    buildReadinessIndicator({
      kind: "dry_run",
      label: "Dry run",
      value: input.dryRun ? "Dry run" : input.dryRunKnown ? "Not dry run" : "Unknown",
      ready: input.dryRun,
      count: input.dryRun ? 1 : 0,
      detailLabels: input.dryRunKnown
        ? [input.dryRun ? "Dry run enabled" : "Dry run disabled"]
        : ["Dry run flag unavailable"],
    }),
    buildReadinessIndicator({
      kind: "local_only",
      label: "Local only",
      value: input.localOnly ? "Local only" : input.localOnlyKnown ? "Not local only" : "Unknown",
      ready: input.localOnly,
      count: input.localOnly ? 1 : 0,
      detailLabels: input.localOnlyKnown
        ? [input.localOnly ? "Local-only payload" : "Non-local payload"]
        : ["Local-only flag unavailable"],
    }),
    buildReadinessIndicator({
      kind: "redacted",
      label: "Redactions",
      value: input.redacted ? "Redacted" : "Not redacted",
      ready: input.redacted,
      count: input.redactionCount,
      detailLabels: [formatCount(input.redactionCount, "redaction")],
    }),
    buildReadinessIndicator({
      kind: "durable_writes",
      label: "Durable writes",
      value: formatCount(input.durableWriteCount, "durable write"),
      ready: input.durableWriteCount === 0,
      count: input.durableWriteCount,
      detailLabels: [
        input.durableWriteCount === 0
          ? "No durable writes"
          : formatCount(input.durableWriteCount, "durable write"),
      ],
    }),
    buildReadinessIndicator({
      kind: "not_applied",
      label: "Applied actions",
      value: formatCount(input.appliedCount, "applied action"),
      ready: input.appliedCount === 0,
      count: input.appliedCount,
      detailLabels: [
        input.appliedCount === 0
          ? "No applied actions"
          : formatCount(input.appliedCount, "applied action"),
      ],
    }),
    buildReadinessIndicator({
      kind: "raw_retention",
      label: "Raw retention",
      value:
        input.rawRetentionRiskCount === 0
          ? "Not retained"
          : formatCount(input.rawRetentionRiskCount, "raw retention flag"),
      ready: input.rawRetentionRiskCount === 0,
      count: input.rawRetentionRiskCount,
      detailLabels: [
        input.rawRetentionRiskCount === 0
          ? "No raw retention"
          : formatCount(input.rawRetentionRiskCount, "raw retention flag"),
      ],
    }),
  ];
}

function buildReadinessIndicator(input: {
  kind: WorkspaceSessionSnapshotRetentionCleanupReadinessKind;
  label: string;
  value: string;
  ready: boolean;
  count: number;
  detailLabels: string[];
}): WorkspaceSessionSnapshotRetentionCleanupReadinessIndicator {
  const status: WorkspaceSessionSnapshotRetentionCleanupStatus = input.ready
    ? "ready"
    : "blocked";
  const severity = severityForStatus(status);
  return {
    id: `workspace_session_snapshot_retention_cleanup.readiness.${input.kind}`,
    kind: input.kind,
    label: input.label,
    value: input.value,
    ready: input.ready,
    status,
    statusLabel: statusLabel(status),
    severity,
    severityLabel: severityLabel(severity),
    count: input.count,
    detailLabels: [...input.detailLabels],
    ariaLabel: [
      input.label,
      input.value,
      input.ready ? "Ready" : "Blocked",
      ...input.detailLabels,
    ].join(", "),
  };
}

function buildSummaryCards(
  state: WorkspaceSessionSnapshotRetentionCleanupState,
): WorkspaceSessionSnapshotRetentionCleanupSummaryCard[] {
  return [
    buildSummaryCard({
      id: "workspace_session_snapshot_retention_cleanup.summary.actions",
      label: "Cleanup actions",
      value: `${state.keepCount} keep / ${state.deleteCount} delete / ${state.reviewCount} review`,
      status: state.entryCount === 0
        ? "empty"
        : state.reviewCount > 0 || state.deleteCount > 0
          ? "attention"
          : "ready",
      detailLabels: [
        formatCount(state.entryCount, "entry", "entries"),
        formatCount(state.actionCount, "action"),
        ...state.thresholdLabels,
      ],
    }),
    buildSummaryCard({
      id: "workspace_session_snapshot_retention_cleanup.summary.readiness",
      label: "Dry-run readiness",
      value: state.dryRunReady ? "Ready" : "Blocked",
      status: state.dryRunReady ? "ready" : "blocked",
      detailLabels: [
        state.dryRun ? "Dry run" : "Not dry run",
        state.localOnly ? "Local only" : "Not local only",
        state.durableWrites
          ? formatCount(state.durableWriteCount, "durable write")
          : "No durable writes",
        state.applied ? formatCount(state.appliedCount, "applied action") : "No applied actions",
      ],
    }),
    buildSummaryCard({
      id: "workspace_session_snapshot_retention_cleanup.summary.redactions",
      label: "Redactions",
      value: formatCount(state.redactionCount, "redaction"),
      status: state.redacted ? "ready" : "blocked",
      detailLabels: [
        state.redacted ? "Redacted" : "Not redacted",
        formatCount(state.redactionCount, "redaction"),
      ],
    }),
    buildSummaryCard({
      id: "workspace_session_snapshot_retention_cleanup.summary.retention",
      label: "Raw retention",
      value: state.rawRetentionRisk
        ? formatCount(state.rawRetentionRiskCount, "raw retention flag")
        : "Not retained",
      status: state.rawRetentionRisk ? "blocked" : "ready",
      detailLabels: [
        formatCount(state.rawRetentionRiskCount, "raw retention flag"),
        state.rawBodyRetained ? "Raw body retained" : "No raw body retention",
        state.rawPathRetained ? "Raw path retained" : "No raw path retention",
        state.rawTokenRetained ? "Raw token retained" : "No raw token retention",
      ],
    }),
    buildSummaryCard({
      id: "workspace_session_snapshot_retention_cleanup.summary.warnings",
      label: "Cleanup warnings",
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
  status: WorkspaceSessionSnapshotRetentionCleanupStatus;
  detailLabels: string[];
}): WorkspaceSessionSnapshotRetentionCleanupSummaryCard {
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

function buildWarnings(
  counts: WarningCounts,
): WorkspaceSessionSnapshotRetentionCleanupWarning[] {
  const warningInputs: Array<{
    kind: WorkspaceSessionSnapshotRetentionCleanupWarningKind;
    count: number;
  }> = [
    { kind: "not_dry_run", count: counts.notDryRun },
    { kind: "durable_writes", count: counts.durableWrites },
    { kind: "not_local_only", count: counts.notLocalOnly },
    { kind: "not_redacted", count: counts.notRedacted },
    { kind: "raw_body", count: counts.rawBody },
    { kind: "raw_path", count: counts.rawPath },
    { kind: "raw_token", count: counts.rawToken },
    { kind: "applied_actions", count: counts.appliedActions },
    { kind: "malformed", count: counts.malformed },
  ];

  return warningInputs
    .filter((entry) => entry.count > 0)
    .map((entry) => {
      const status = statusForWarning(entry.kind);
      const severity = severityForStatus(status);
      return {
        id: `workspace_session_snapshot_retention_cleanup.warning.${entry.kind}`,
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

function buildThresholdLabels(record: AnyRecord | undefined): string[] {
  const thresholds = recordField(record, "thresholds", "policy") ?? record;
  if (thresholds === undefined) {
    return [];
  }
  return [
    nonNegativeIntegerField(thresholds, "maxCount", "max_count", "retainNewest", "retain_newest") === undefined
      ? undefined
      : `Max count ${nonNegativeIntegerField(thresholds, "maxCount", "max_count", "retainNewest", "retain_newest")}`,
    nonNegativeIntegerField(thresholds, "maxAgeMs", "max_age_ms") === undefined
      ? undefined
      : `Max age ${nonNegativeIntegerField(thresholds, "maxAgeMs", "max_age_ms")} ms`,
    safeOptionalString(stringField(thresholds, "now"), "now") === undefined
      ? undefined
      : `Now ${safeOptionalString(stringField(thresholds, "now"), "now")}`,
    safeOptionalString(
      stringField(thresholds, "cutoffAt", "cutoff_at", "deleteBefore", "delete_before", "retentionCutoff", "retention_cutoff"),
      "cutoffAt",
    ) === undefined
      ? undefined
      : `Cutoff ${safeOptionalString(
          stringField(thresholds, "cutoffAt", "cutoff_at", "deleteBefore", "delete_before", "retentionCutoff", "retention_cutoff"),
          "cutoffAt",
        )}`,
    safeOptionalString(stringField(thresholds, "policyName", "policy_name"), "policyName") === undefined
      ? undefined
      : `Policy ${safeOptionalString(stringField(thresholds, "policyName", "policy_name"), "policyName")}`,
  ].filter(isDefined);
}

function resolvePhase(
  input: NormalizedInput,
  counts: ActionCounts,
  warnings: readonly WorkspaceSessionSnapshotRetentionCleanupWarning[],
): WorkspaceSessionSnapshotRetentionCleanupPhase {
  if (input.errorStates.length > 0) {
    return "error";
  }
  if (
    counts.entryCount === 0 &&
    input.rows.length === 0 &&
    warnings.length === 0
  ) {
    return "empty";
  }
  return "success";
}

function resolveStatus(
  phase: WorkspaceSessionSnapshotRetentionCleanupPhase,
  dryRunReady: boolean,
  counts: ActionCounts,
  warnings: readonly WorkspaceSessionSnapshotRetentionCleanupWarning[],
): WorkspaceSessionSnapshotRetentionCleanupStatus {
  if (phase === "loading") {
    return "loading";
  }
  if (phase === "error") {
    return "error";
  }
  if (phase === "empty") {
    return "empty";
  }
  if (warnings.some((warning) => warning.status === "blocked") || !dryRunReady) {
    return "blocked";
  }
  if (
    warnings.some((warning) => warning.status === "attention") ||
    counts.deleteCount > 0 ||
    counts.reviewCount > 0
  ) {
    return "attention";
  }
  return "ready";
}

function statusForActionRow(
  row: NormalizedActionRow,
  dryRun: boolean | undefined,
  riskCount: number,
): WorkspaceSessionSnapshotRetentionCleanupStatus {
  if (
    dryRun === false ||
    row.applied ||
    row.riskCounts.rawBody > 0 ||
    row.riskCounts.rawToken > 0 ||
    !row.redacted
  ) {
    return "blocked";
  }
  if (riskCount > 0 || row.action === "delete" || row.action === "review") {
    return "attention";
  }
  return "ready";
}

function statusForWarning(
  kind: WorkspaceSessionSnapshotRetentionCleanupWarningKind,
): WorkspaceSessionSnapshotRetentionCleanupStatus {
  switch (kind) {
    case "not_dry_run":
    case "not_local_only":
    case "not_redacted":
    case "raw_body":
    case "raw_token":
    case "applied_actions":
    case "malformed":
      return "blocked";
    case "durable_writes":
    case "raw_path":
      return "attention";
  }
}

function normalizeCleanupAction(
  value: string | undefined,
  retain?: boolean,
): WorkspaceSessionSnapshotRetentionCleanupAction {
  if (retain === true) {
    return "keep";
  }
  if (retain === false) {
    return "delete";
  }
  const token = normalizeToken(value);
  if (
    token === "keep" ||
    token === "kept" ||
    token === "retain" ||
    token === "retained" ||
    token === "within_policy" ||
    token === "within_retention_policy"
  ) {
    return "keep";
  }
  if (
    token === "delete" ||
    token === "deleted" ||
    token === "remove" ||
    token === "removed" ||
    token === "purge" ||
    token === "expire" ||
    token === "expired" ||
    token === "prune" ||
    token === "pruned" ||
    token === "drop" ||
    token === "dropped"
  ) {
    return "delete";
  }
  return "review";
}

function readDryRun(
  record: AnyRecord | undefined,
  sourceKind: WorkspaceSessionSnapshotRetentionCleanupSourceKind,
): boolean | undefined {
  const retention = recordField(record, "retention");
  const explicit =
    booleanField(
      record,
      "dryRun",
      "dry_run",
      "previewOnly",
      "preview_only",
      "dryRunOnly",
      "dry_run_only",
    ) ??
    booleanField(retention, "dryRun", "dry_run", "previewOnly", "preview_only");
  if (explicit !== undefined) {
    return explicit;
  }
  const mode = normalizeToken(stringField(record, "mode"));
  if (mode === "dry_run" || mode === "preview") {
    return true;
  }
  if (sourceKind === "api_retention_preview" || sourceKind === "cli_retention_preview") {
    return true;
  }
  return undefined;
}

function readLocalOnly(
  record: AnyRecord | undefined,
  sourceKind: WorkspaceSessionSnapshotRetentionCleanupSourceKind,
): boolean | undefined {
  const value = localOnlyFromValue(record);
  if (value !== undefined) {
    return value;
  }
  if (sourceKind === "cli_retention_preview") {
    return true;
  }
  return undefined;
}

function isCleanupPayloadLike(value: unknown): value is AnyRecord {
  if (!isRecord(value)) {
    return false;
  }
  const kind = stringField(value, "kind");
  return (
    kind === "localWorkspaceSessionSnapshotRetentionCleanupPlan" ||
    kind === "localWorkspaceSessionSnapshotRetentionPreview" ||
    kind === "workspace-session.snapshot-review.retention-preview" ||
    kind === "workspace-session-snapshot-review.retention-preview" ||
    arrayField(value, "actions", "keepActions", "deleteActions", "reviewActions", "snapshots").length > 0 ||
    recordField(value, "retentionPreview", "retention_preview", "retention", "records") !== undefined
  );
}

function countRetentionRisks(value: unknown, keyHint = ""): RetentionRiskCounts {
  if (value === undefined || value === null) {
    return { rawBody: 0, rawPath: 0, rawToken: 0 };
  }
  if (typeof value === "string") {
    return {
      rawBody: 0,
      rawPath: isUnsafePathValue(value) ? 1 : 0,
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
      key === "raw_request_body_retained" ||
      key === "raw_request_body_stored" ||
      key === "raw_response_body_stored" ||
      key === "request_body_retained" ||
      key === "stores_raw_body");
}

function isRawPathRetentionFlag(key: string, value: unknown): boolean {
  return (
    value === true &&
      (key === "raw_path_retained" ||
        key === "raw_paths_retained" ||
        key === "raw_paths_stored" ||
        key === "raw_storage_paths_stored" ||
        key === "raw_paths_output" ||
        key === "storage_paths_retained") ||
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
        key === "raw_tokens_stored" ||
        key === "raw_secrets_stored" ||
        key === "raw_lock_material_stored" ||
        key === "root_keys_output" ||
        key === "lock_tokens_output" ||
        key === "session_ids_output") ||
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

function isUnsafePathValue(value: string): boolean {
  return !isRedactedToken(value) && ABSOLUTE_PATH_PATTERN.test(value);
}

function isUnsafeTokenValue(value: string, keyHint: string): boolean {
  if (isRedactedToken(value)) {
    return false;
  }
  const token = normalizeToken(keyHint);
  if (
    token.includes("fingerprint") ||
    token === "kind" ||
    token.endsWith("_kind") ||
    token === "schema_version" ||
    token === "source_kind" ||
    token === "action" ||
    token === "decision" ||
    token === "planned_action" ||
    token === "reason" ||
    token === "reasons"
  ) {
    return false;
  }
  return SECRET_KEY_PATTERN.test(keyHint) || OBVIOUS_SECRET_VALUE_PATTERN.test(value);
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
    if (
      ((token === "durable_writes" || token === "durable_write" || token === "writes") &&
        entry === true) ||
      ((token === "durable_writes" || token === "durable_write") && entry === "true")
    ) {
      count += 1;
      continue;
    }
    count += countDurableWrites(entry);
  }
  return count;
}

function countApplied(value: unknown): number {
  if (value === undefined || value === null) {
    return 0;
  }
  if (Array.isArray(value)) {
    return sum(value, countApplied);
  }
  if (!isRecord(value)) {
    return 0;
  }

  let count = 0;
  for (const [key, entry] of Object.entries(value)) {
    const token = normalizeToken(key);
    if ((token === "applied" || token === "cleanup_applied") && entry === true) {
      count += 1;
      continue;
    }
    if (
      token === "applied" &&
      typeof entry === "number" &&
      Number.isFinite(entry) &&
      entry > 0
    ) {
      count += Math.trunc(entry);
      continue;
    }
    count += countApplied(entry);
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
  for (const entry of Object.values(value)) {
    const nested = localOnlyFromValue(entry);
    if (nested === false) {
      return false;
    }
    if (nested === true) {
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
  for (const entry of Object.values(value)) {
    const nested = redactedFromValue(entry);
    if (nested === false) {
      return false;
    }
    if (nested === true) {
      foundTrue = true;
    }
  }
  return foundTrue ? true : undefined;
}

function actionLabel(
  action: WorkspaceSessionSnapshotRetentionCleanupAction,
): string {
  switch (action) {
    case "keep":
      return "Keep";
    case "delete":
      return "Delete";
    case "review":
      return "Review";
  }
}

function statusLabel(
  status: WorkspaceSessionSnapshotRetentionCleanupStatus,
): string {
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
  status: WorkspaceSessionSnapshotRetentionCleanupStatus,
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

function warningLabel(
  kind: WorkspaceSessionSnapshotRetentionCleanupWarningKind,
): string {
  switch (kind) {
    case "not_dry_run":
      return "Not a dry run";
    case "durable_writes":
      return "Durable writes detected";
    case "not_local_only":
      return "Not local only";
    case "not_redacted":
      return "Payload not redacted";
    case "raw_body":
      return "Raw body retained";
    case "raw_path":
      return "Raw path retained";
    case "raw_token":
      return "Raw token retained";
    case "applied_actions":
      return "Actions already applied";
    case "malformed":
      return "Malformed cleanup payload";
  }
}

function warningDescription(
  kind: WorkspaceSessionSnapshotRetentionCleanupWarningKind,
): string {
  switch (kind) {
    case "not_dry_run":
      return "The payload is not marked as a dry-run retention cleanup plan.";
    case "durable_writes":
      return "The payload reports durable writes.";
    case "not_local_only":
      return "The payload is not marked local-only.";
    case "not_redacted":
      return "The payload is not marked redacted.";
    case "raw_body":
      return "The payload indicates raw request or response body retention.";
    case "raw_path":
      return "The payload indicates raw storage or filesystem path retention.";
    case "raw_token":
      return "The payload indicates raw token, secret, or lock material retention.";
    case "applied_actions":
      return "The payload contains applied cleanup actions instead of preview-only actions.";
    case "malformed":
      return "The payload did not include recognizable retention cleanup dry-run data.";
  }
}

function buildHeadline(
  sourceKind: WorkspaceSessionSnapshotRetentionCleanupSourceKind,
  status: WorkspaceSessionSnapshotRetentionCleanupStatus,
): string {
  const subject = {
    sdk_cleanup_plan: "Retention cleanup dry-run plan",
    sdk_retention_preview: "Retention cleanup SDK preview",
    api_retention_preview: "Retention cleanup API preview",
    cli_retention_preview: "Retention cleanup CLI preview",
    unknown: "Retention cleanup",
  }[sourceKind];
  if (status === "loading") {
    return `${subject} loading`;
  }
  if (status === "empty") {
    return `${subject} empty`;
  }
  if (status === "error") {
    return `${subject} has errors`;
  }
  if (status === "blocked") {
    return `${subject} blocked`;
  }
  if (status === "attention") {
    return `${subject} needs review`;
  }
  return `${subject} ready`;
}

function errorLabel(
  context: WorkspaceSessionSnapshotRetentionCleanupContext,
): string {
  switch (context) {
    case "cleanup":
      return "Workspace session snapshot retention cleanup could not load";
    case "actions":
      return "Workspace session snapshot retention cleanup actions could not load";
    case "readiness":
      return "Workspace session snapshot retention cleanup readiness could not load";
    case "warnings":
      return "Workspace session snapshot retention cleanup warnings could not load";
    case "redactions":
      return "Workspace session snapshot retention cleanup redactions could not load";
    case "retention":
      return "Workspace session snapshot retention cleanup plan could not load";
  }
}

function retryLabel(
  context: WorkspaceSessionSnapshotRetentionCleanupContext,
): string {
  switch (context) {
    case "cleanup":
      return "Retry cleanup";
    case "actions":
      return "Retry cleanup actions";
    case "readiness":
      return "Retry cleanup readiness";
    case "warnings":
      return "Retry cleanup warnings";
    case "redactions":
      return "Retry cleanup redactions";
    case "retention":
      return "Retry retention cleanup";
  }
}

function compareActionRows(
  left: WorkspaceSessionSnapshotRetentionCleanupActionRow,
  right: WorkspaceSessionSnapshotRetentionCleanupActionRow,
): number {
  return actionSortWeight(left.action) - actionSortWeight(right.action) ||
    (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER) ||
    left.snapshotId.localeCompare(right.snapshotId);
}

function actionSortWeight(
  action: WorkspaceSessionSnapshotRetentionCleanupAction,
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

function safeIdentifier(
  value: string | undefined,
  fallback: string,
): string {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const redacted = redactWorkspaceSessionSnapshotRetentionCleanupDisplayValue(
    value,
    "snapshotId",
  );
  return redacted === "Unavailable" ? fallback : redacted;
}

function safeOptionalString(
  value: string | undefined,
  keyHint?: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const redacted = redactWorkspaceSessionSnapshotRetentionCleanupDisplayValue(
    value,
    keyHint,
  );
  return redacted === "Unavailable" ? undefined : redacted;
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
    const value = valueField(record, key);
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
    const value = valueField(record, key);
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
    const value = valueField(record, key);
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return Math.trunc(value);
    }
    if (typeof value === "string" && /^\d+$/.test(value)) {
      return Number(value);
    }
  }
  return undefined;
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
      recordField(record, "counts", "summary", "records"),
      ...keys,
    ) !== undefined;
}

function arrayField(
  record: AnyRecord | undefined,
  ...keys: readonly string[]
): unknown[] {
  if (record === undefined) {
    return [];
  }
  for (const key of keys) {
    const value = valueField(record, key);
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
    const value = valueField(record, key);
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
      ? redactWorkspaceSessionSnapshotRetentionCleanupDisplayValue(value, key)
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
  errors: readonly WorkspaceSessionSnapshotRetentionCleanupErrorState[],
): WorkspaceSessionSnapshotRetentionCleanupErrorState[] {
  const seen = new Set<string>();
  const deduped: WorkspaceSessionSnapshotRetentionCleanupErrorState[] = [];
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
  state: WorkspaceSessionSnapshotRetentionCleanupState,
): WorkspaceSessionSnapshotRetentionCleanupState {
  return {
    ...state,
    thresholdLabels: [...state.thresholdLabels],
    actionRows: state.actionRows.map(cloneActionRow),
    readinessIndicators: state.readinessIndicators.map(cloneReadinessIndicator),
    summaryCards: state.summaryCards.map(cloneSummaryCard),
    warnings: state.warnings.map(cloneWarning),
    emptyStates: {
      actions: { ...state.emptyStates.actions },
      readiness: { ...state.emptyStates.readiness },
      warnings: { ...state.emptyStates.warnings },
    },
    errorStates: state.errorStates.map(cloneErrorState),
  };
}

function cloneActionRow(
  row: WorkspaceSessionSnapshotRetentionCleanupActionRow,
): WorkspaceSessionSnapshotRetentionCleanupActionRow {
  return {
    ...row,
    reasonLabels: [...row.reasonLabels],
    issueLabels: [...row.issueLabels],
    detailLabels: [...row.detailLabels],
  };
}

function cloneReadinessIndicator(
  indicator: WorkspaceSessionSnapshotRetentionCleanupReadinessIndicator,
): WorkspaceSessionSnapshotRetentionCleanupReadinessIndicator {
  return {
    ...indicator,
    detailLabels: [...indicator.detailLabels],
  };
}

function cloneSummaryCard(
  card: WorkspaceSessionSnapshotRetentionCleanupSummaryCard,
): WorkspaceSessionSnapshotRetentionCleanupSummaryCard {
  return {
    ...card,
    detailLabels: [...card.detailLabels],
  };
}

function cloneWarning(
  warning: WorkspaceSessionSnapshotRetentionCleanupWarning,
): WorkspaceSessionSnapshotRetentionCleanupWarning {
  return { ...warning };
}

function cloneErrorState(
  error: WorkspaceSessionSnapshotRetentionCleanupErrorState,
): WorkspaceSessionSnapshotRetentionCleanupErrorState {
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
