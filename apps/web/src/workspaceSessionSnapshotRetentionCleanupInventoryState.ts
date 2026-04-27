import {
  redactWorkspaceSessionText,
  type WorkspaceSessionSeverity,
} from "./workspaceSessionState.ts";

export type WorkspaceSessionSnapshotRetentionCleanupInventorySourceKind =
  | "sdk_dry_run_plan"
  | "cli_inventory_output"
  | "api_inventory_preview"
  | "unknown";

export type WorkspaceSessionSnapshotRetentionCleanupInventoryPhase =
  | "loading"
  | "success"
  | "empty"
  | "error";

export type WorkspaceSessionSnapshotRetentionCleanupInventoryStatus =
  | "loading"
  | "empty"
  | "ready"
  | "attention"
  | "blocked"
  | "error";

export type WorkspaceSessionSnapshotRetentionCleanupInventoryAction =
  | "keep"
  | "delete"
  | "review";

export type WorkspaceSessionSnapshotRetentionCleanupInventoryWarningKind =
  | "not_local_only"
  | "not_dry_run"
  | "durable_writes"
  | "not_redacted"
  | "raw_body"
  | "raw_path"
  | "raw_token"
  | "applied_actions"
  | "malformed";

export interface BuildWorkspaceSessionSnapshotRetentionCleanupInventoryStateOptions {
  readonly defaultTimestamp?: string;
  readonly error?: unknown;
  readonly loading?: boolean;
  readonly sourceKind?: WorkspaceSessionSnapshotRetentionCleanupInventorySourceKind;
}

export interface WorkspaceSessionSnapshotRetentionCleanupInventoryState {
  readonly id: "workspace_session_snapshot_retention_cleanup_inventory";
  readonly sourceKind: WorkspaceSessionSnapshotRetentionCleanupInventorySourceKind;
  readonly phase: WorkspaceSessionSnapshotRetentionCleanupInventoryPhase;
  readonly generatedAt: string;
  readonly status: WorkspaceSessionSnapshotRetentionCleanupInventoryStatus;
  readonly statusLabel: string;
  readonly severity: WorkspaceSessionSeverity;
  readonly severityLabel: string;
  readonly entryCount: number;
  readonly keepCount: number;
  readonly deleteCount: number;
  readonly reviewCount: number;
  readonly dryRun: boolean;
  readonly dryRunKnown: boolean;
  readonly localOnly: boolean;
  readonly localOnlyKnown: boolean;
  readonly durableWrites: boolean;
  readonly durableWritesKnown: boolean;
  readonly redacted: boolean;
  readonly redactionCount: number;
  readonly dryRunReady: boolean;
  readonly advisoryDeleteCount: number;
  readonly sourceLabels: readonly string[];
  readonly rows: readonly WorkspaceSessionSnapshotRetentionCleanupInventoryRow[];
  readonly warnings: readonly WorkspaceSessionSnapshotRetentionCleanupInventoryWarning[];
  readonly errors: readonly WorkspaceSessionSnapshotRetentionCleanupInventoryError[];
}

export interface WorkspaceSessionSnapshotRetentionCleanupInventoryRow {
  readonly id: string;
  readonly index: number;
  readonly sourceLabel: string;
  readonly snapshotId: string;
  readonly action: WorkspaceSessionSnapshotRetentionCleanupInventoryAction;
  readonly actionLabel: string;
  readonly advisory: boolean;
  readonly status: WorkspaceSessionSnapshotRetentionCleanupInventoryStatus;
  readonly statusLabel: string;
  readonly severity: WorkspaceSessionSeverity;
  readonly severityLabel: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly workspaceId?: string;
  readonly deviceId?: string;
  readonly sourceKind?: string;
  readonly filePathKind?: string;
  readonly fingerprint?: string;
  readonly reasons: readonly string[];
  readonly issues: readonly string[];
}

export interface WorkspaceSessionSnapshotRetentionCleanupInventoryWarning {
  readonly id: string;
  readonly kind: WorkspaceSessionSnapshotRetentionCleanupInventoryWarningKind;
  readonly label: string;
  readonly description: string;
  readonly count: number;
  readonly status: WorkspaceSessionSnapshotRetentionCleanupInventoryStatus;
  readonly statusLabel: string;
  readonly severity: WorkspaceSessionSeverity;
  readonly severityLabel: string;
}

export interface WorkspaceSessionSnapshotRetentionCleanupInventoryError {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly redacted: boolean;
  readonly redactionCount: number;
}

type AnyRecord = Record<string, unknown>;

interface NormalizedInventoryInput {
  readonly sourceKind: WorkspaceSessionSnapshotRetentionCleanupInventorySourceKind;
  readonly generatedAt: string;
  readonly recognized: boolean;
  readonly counts: InventoryCounts;
  readonly rows: readonly NormalizedInventoryRow[];
  readonly dryRun?: boolean;
  readonly localOnly?: boolean;
  readonly durableWrites?: boolean;
  readonly redacted: boolean;
  readonly redactionCount: number;
  readonly appliedCount: number;
  readonly risks: RetentionRiskCounts;
  readonly errors: readonly WorkspaceSessionSnapshotRetentionCleanupInventoryError[];
}

interface NormalizedInventoryRow {
  readonly index: number;
  readonly sourceLabel: string;
  readonly snapshotId: string;
  readonly action: WorkspaceSessionSnapshotRetentionCleanupInventoryAction;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly workspaceId?: string;
  readonly deviceId?: string;
  readonly sourceKind?: string;
  readonly filePathKind?: string;
  readonly fingerprint?: string;
  readonly reasons: readonly string[];
  readonly issues: readonly string[];
  readonly risks: RetentionRiskCounts;
  readonly applied: boolean;
}

interface InventoryCounts {
  readonly entryCount: number;
  readonly keepCount: number;
  readonly deleteCount: number;
  readonly reviewCount: number;
}

interface RetentionRiskCounts {
  readonly rawBody: number;
  readonly rawPath: number;
  readonly rawToken: number;
}

interface WarningCount {
  readonly kind: WorkspaceSessionSnapshotRetentionCleanupInventoryWarningKind;
  readonly count: number;
}

interface ResolvedPayload {
  readonly root?: unknown;
  readonly payload?: unknown;
  readonly sourceKind?: WorkspaceSessionSnapshotRetentionCleanupInventorySourceKind;
  readonly errors: readonly WorkspaceSessionSnapshotRetentionCleanupInventoryError[];
}

interface RedactedText {
  readonly text: string;
  readonly redactionCount: number;
}

const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const REDACTED = "[REDACTED]";
const FINGERPRINT_PATTERN = /^sha256:[a-f0-9]{64}$/;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,160}$/;
const SECRET_KEY_PATTERN =
  /(?:api[-_]?key|apikey|authorization|bearer|cookie|credential|credentials|jwt|password|passphrase|private[-_]?key|refresh[-_]?token|root[-_]?key(?:ref)?|secret|session[-_]?id|sessionid|session[-_]?token|signing[-_]?key|token)$/i;
const SECRET_VALUE_PATTERN =
  /(?:bearer\s+[a-z0-9._~+/=-]{8,}|basic\s+[a-z0-9._~+/=-]{8,}|(?:sk|rk|pk|tok|pat|npm|ghp|gho)_[a-z0-9_-]{8,}|(?:sk|rk|pat|glpat|github_pat)-[a-z0-9_-]{8,}|lock_[a-z0-9_-]{4,}|key_session_[a-z0-9_-]+)/i;
const LONG_SECRET_VALUE_PATTERN = /[a-z0-9_+/=-]{40,}/i;
const ABSOLUTE_PATH_PATTERN =
  /(?:\b[A-Za-z]:[\\/][^\s"',;)}\]]+|\\\\[^\\\s"',;)}\]]+[\\][^\s"',;)}\]]+|\b(?:\/Users|\/home|\/var|\/tmp|\/private|\/mnt|\/Volumes)\/[^\s"',;)}\]]+)/;

export function buildWorkspaceSessionSnapshotRetentionCleanupInventoryState(
  input: unknown = {},
  options: BuildWorkspaceSessionSnapshotRetentionCleanupInventoryStateOptions = {},
): WorkspaceSessionSnapshotRetentionCleanupInventoryState {
  if (options.loading === true) {
    return buildWorkspaceSessionSnapshotRetentionCleanupInventoryLoadingState(options);
  }

  const normalized = normalizeInventoryInput(input, options);
  const rows = normalized.rows
    .map(buildInventoryRow)
    .sort(compareRows);
  const counts = resolveCounts(normalized.counts, rows);
  const warningCounts = buildWarningCounts(normalized);
  const warnings = warningCounts
    .filter((warning) => warning.count > 0)
    .map(buildWarning);
  const errors = [
    ...normalized.errors,
    ...(normalized.recognized
      ? []
      : [
          buildError(
            "malformed",
            "Retention cleanup inventory must include dry-run inventory data.",
          ),
        ]),
    ...(options.error === undefined ? [] : [buildError("input", options.error)]),
  ];
  const dryRunKnown = normalized.dryRun !== undefined;
  const dryRun = normalized.dryRun === true;
  const localOnlyKnown = normalized.localOnly !== undefined;
  const localOnly = normalized.localOnly === true;
  const durableWritesKnown = normalized.durableWrites !== undefined;
  const durableWrites = normalized.durableWrites === true;
  const dryRunReady =
    normalized.recognized &&
    dryRun &&
    localOnly &&
    normalized.durableWrites === false &&
    normalized.redacted &&
    normalized.appliedCount === 0 &&
    normalized.risks.rawBody === 0 &&
    normalized.risks.rawPath === 0 &&
    normalized.risks.rawToken === 0 &&
    errors.length === 0;
  const phase = resolvePhase(normalized.recognized, counts, errors);
  const status = resolveStatus(phase, dryRunReady, counts, warnings, errors);
  const severity = severityForStatus(status);
  const state: WorkspaceSessionSnapshotRetentionCleanupInventoryState = {
    id: "workspace_session_snapshot_retention_cleanup_inventory",
    sourceKind: normalized.sourceKind,
    phase,
    generatedAt: normalized.generatedAt,
    status,
    statusLabel: statusLabel(status),
    severity,
    severityLabel: severityLabel(severity),
    entryCount: counts.entryCount,
    keepCount: counts.keepCount,
    deleteCount: counts.deleteCount,
    reviewCount: counts.reviewCount,
    dryRun,
    dryRunKnown,
    localOnly,
    localOnlyKnown,
    durableWrites,
    durableWritesKnown,
    redacted: normalized.redacted,
    redactionCount: normalized.redactionCount,
    dryRunReady,
    advisoryDeleteCount: counts.deleteCount,
    sourceLabels: uniqueSorted(rows.map((row) => row.sourceLabel)),
    rows,
    warnings,
    errors: dedupeErrors(errors),
  };

  return deepFreeze(state);
}

export function buildWorkspaceSessionSnapshotRetentionCleanupInventoryLoadingState(
  options: Pick<
    BuildWorkspaceSessionSnapshotRetentionCleanupInventoryStateOptions,
    "defaultTimestamp" | "sourceKind"
  > = {},
): WorkspaceSessionSnapshotRetentionCleanupInventoryState {
  const status: WorkspaceSessionSnapshotRetentionCleanupInventoryStatus = "loading";
  const severity = severityForStatus(status);
  return deepFreeze({
    id: "workspace_session_snapshot_retention_cleanup_inventory",
    sourceKind: options.sourceKind ?? "unknown",
    phase: "loading",
    generatedAt: normalizeTimestamp(undefined, options.defaultTimestamp),
    status,
    statusLabel: statusLabel(status),
    severity,
    severityLabel: severityLabel(severity),
    entryCount: 0,
    keepCount: 0,
    deleteCount: 0,
    reviewCount: 0,
    dryRun: false,
    dryRunKnown: false,
    localOnly: false,
    localOnlyKnown: false,
    durableWrites: false,
    durableWritesKnown: false,
    redacted: true,
    redactionCount: 0,
    dryRunReady: false,
    advisoryDeleteCount: 0,
    sourceLabels: [],
    rows: [],
    warnings: [],
    errors: [],
  });
}

export function buildWorkspaceSessionSnapshotRetentionCleanupInventoryRows(
  input: unknown,
  options: BuildWorkspaceSessionSnapshotRetentionCleanupInventoryStateOptions = {},
): readonly WorkspaceSessionSnapshotRetentionCleanupInventoryRow[] {
  return buildWorkspaceSessionSnapshotRetentionCleanupInventoryState(
    input,
    options,
  ).rows;
}

export function buildWorkspaceSessionSnapshotRetentionCleanupInventoryWarnings(
  input: unknown,
  options: BuildWorkspaceSessionSnapshotRetentionCleanupInventoryStateOptions = {},
): readonly WorkspaceSessionSnapshotRetentionCleanupInventoryWarning[] {
  return buildWorkspaceSessionSnapshotRetentionCleanupInventoryState(
    input,
    options,
  ).warnings;
}

export function redactWorkspaceSessionSnapshotRetentionCleanupInventoryValue(
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
  if (raw.length === 0) {
    return "Unavailable";
  }
  if (normalizedKey.includes("fingerprint") && FINGERPRINT_PATTERN.test(raw)) {
    return raw;
  }
  if (
    isSafeIdentifierKey(normalizedKey) &&
    SAFE_ID_PATTERN.test(raw) &&
    !SECRET_VALUE_PATTERN.test(raw)
  ) {
    return truncate(raw, 120);
  }

  const redacted = redactWorkspaceSessionText(raw)
    .replace(/\[redacted[^\]]*\]/gi, REDACTED)
    .trim();
  if (
    redacted !== raw ||
    SECRET_KEY_PATTERN.test(keyHint ?? "") ||
    SECRET_VALUE_PATTERN.test(raw) ||
    (SECRET_KEY_PATTERN.test(keyHint ?? "") && LONG_SECRET_VALUE_PATTERN.test(raw)) ||
    ABSOLUTE_PATH_PATTERN.test(raw) ||
    isRawBodyKey(normalizedKey)
  ) {
    return REDACTED;
  }
  return truncate(redacted.replace(/\s+/g, " "), 120);
}

function normalizeInventoryInput(
  input: unknown,
  options: BuildWorkspaceSessionSnapshotRetentionCleanupInventoryStateOptions,
): NormalizedInventoryInput {
  const resolved = resolvePayload(input);
  const root = clonePlain(resolved.root ?? resolved.payload);
  const payload = clonePlain(resolved.payload);
  const record = isRecord(payload) ? payload : undefined;
  const sourceKind =
    options.sourceKind ?? resolved.sourceKind ?? inferSourceKind(record, root);
  const rows = collectRows(record, sourceKind);
  const counts = normalizeCounts(record, rows);
  const dryRun = readDryRun(record, sourceKind);
  const localOnly = readLocalOnly(record, sourceKind);
  const durableWrites = readDurableWrites(record);
  const redacted = redactedFromValue(record) !== false;
  const redactionCount = Math.max(countRedactions(record), sum(rows, (row) =>
    row.reasons.filter((reason) => reason === REDACTED).length +
    row.issues.filter((issue) => issue === REDACTED).length
  ));
  const appliedCount = countApplied(record) + rows.filter((row) => row.applied).length;
  const risks = addRiskCounts(
    countRetentionRisks(record),
    rows.reduce(
      (total, row) => addRiskCounts(total, row.risks),
      zeroRisks(),
    ),
  );
  const recognized =
    record !== undefined &&
    (sourceKind !== "unknown" ||
      rows.length > 0 ||
      counts.entryCount > 0 ||
      hasCountFields(record) ||
      dryRun !== undefined ||
      localOnly !== undefined ||
      durableWrites !== undefined);

  return {
    sourceKind,
    generatedAt: normalizeTimestamp(
      timestampField(
        record,
        "generatedAt",
        "generated_at",
        "previewedAt",
        "previewed_at",
        "createdAt",
        "created_at",
        "updatedAt",
        "updated_at",
        "now",
      ) ??
        timestampField(
          recordField(record, "thresholds", "retention", "summary"),
          "now",
          "cutoffAt",
          "cutoff_at",
          "generatedAt",
          "generated_at",
        ),
      options.defaultTimestamp,
    ),
    recognized,
    counts,
    rows,
    dryRun,
    localOnly,
    durableWrites,
    redacted,
    redactionCount,
    appliedCount,
    risks,
    errors: resolved.errors,
  };
}

function resolvePayload(input: unknown): ResolvedPayload {
  if (typeof input === "string") {
    return parseJsonPayload(input, "cli_inventory_output");
  }
  if (!isRecord(input)) {
    return { payload: input, errors: [] };
  }

  if (typeof input.stdout === "string") {
    const parsed = parseJsonPayload(input.stdout, "cli_inventory_output");
    if (input.exitCode !== undefined && input.exitCode !== 0) {
      return {
        ...parsed,
        errors: [
          ...parsed.errors,
          buildError(
            "cli",
            stringField(input, "stderr") ?? "Retention cleanup inventory command failed.",
          ),
        ],
      };
    }
    return parsed;
  }

  if (isInventoryPayloadLike(input)) {
    return { root: input, payload: input, errors: [] };
  }

  const responseBody = recordField(recordField(input, "response"), "body");
  if (responseBody !== undefined && isInventoryPayloadLike(responseBody)) {
    return {
      root: input,
      payload: responseBody,
      sourceKind: "api_inventory_preview",
      errors: [],
    };
  }

  for (const key of ["body", "data", "value", "result", "preview"]) {
    const nested = recordField(input, key);
    if (nested !== undefined && isInventoryPayloadLike(nested)) {
      return {
        root: input,
        payload: nested,
        sourceKind: key === "body" ? "api_inventory_preview" : undefined,
        errors: [],
      };
    }
  }

  for (const key of [
    "inventory",
    "cleanupInventory",
    "cleanup_inventory",
    "retentionCleanupInventory",
    "retention_cleanup_inventory",
  ]) {
    const nested = recordField(input, key);
    if (nested !== undefined) {
      return { root: input, payload: nested, errors: [] };
    }
  }

  return { root: input, payload: input, errors: [] };
}

function parseJsonPayload(
  value: string,
  sourceKind: WorkspaceSessionSnapshotRetentionCleanupInventorySourceKind,
): ResolvedPayload {
  try {
    const parsed = JSON.parse(value) as unknown;
    return { root: parsed, payload: parsed, sourceKind, errors: [] };
  } catch {
    return {
      payload: undefined,
      sourceKind,
      errors: [buildError("parse", "Retention cleanup inventory JSON could not be parsed.")],
    };
  }
}

function collectRows(
  record: AnyRecord | undefined,
  sourceKind: WorkspaceSessionSnapshotRetentionCleanupInventorySourceKind,
): NormalizedInventoryRow[] {
  if (record === undefined) {
    return [];
  }

  if (sourceKind === "sdk_dry_run_plan") {
    const directActions = arrayField(record, "actions", "rows", "items");
    const inputs = directActions.length > 0
      ? directActions.map((entry) => ({ entry, action: undefined }))
      : [
          ...arrayField(record, "keepActions", "keep_actions").map((entry) => ({
            entry,
            action: "keep" as const,
          })),
          ...arrayField(record, "deleteActions", "delete_actions").map((entry) => ({
            entry,
            action: "delete" as const,
          })),
          ...arrayField(record, "reviewActions", "review_actions").map((entry) => ({
            entry,
            action: "review" as const,
          })),
        ];
    return inputs
      .map(({ entry, action }, index) => normalizeRow(entry, index, sourceKind, action))
      .filter(isDefined);
  }

  if (sourceKind === "cli_inventory_output") {
    const records = recordField(record, "records");
    const inventory = recordField(record, "inventory");
    const rows = [
      ...arrayField(records, "preview", "rows", "items", "records"),
      ...arrayField(inventory, "preview", "rows", "items", "records", "summaries"),
      ...arrayField(record, "preview", "rows", "items", "records", "summaries"),
    ];
    return rows
      .map((entry, index) => normalizeRow(entry, index, sourceKind))
      .filter(isDefined);
  }

  const inventory = recordField(record, "inventory", "summary");
  const rows = [
    ...arrayField(record, "actions", "rows", "items", "entries", "summaries", "snapshots"),
    ...arrayField(inventory, "actions", "rows", "items", "entries", "summaries", "snapshots"),
    ...arrayField(recordField(record, "records"), "preview", "rows", "items"),
  ];
  return rows
    .map((entry, index) => normalizeRow(entry, index, sourceKind))
    .filter(isDefined);
}

function normalizeRow(
  entry: unknown,
  index: number,
  sourceKind: WorkspaceSessionSnapshotRetentionCleanupInventorySourceKind,
  impliedAction?: WorkspaceSessionSnapshotRetentionCleanupInventoryAction,
): NormalizedInventoryRow | undefined {
  if (typeof entry === "string") {
    return {
      index,
      sourceLabel: sourceLabelForRow(undefined, sourceKind),
      snapshotId: safeText(entry, "snapshotId", `snapshot_${index + 1}`),
      action: impliedAction ?? "review",
      reasons: [],
      issues: [],
      risks: countRetentionRisks(entry, "snapshotId"),
      applied: false,
    };
  }
  if (!isRecord(entry)) {
    return undefined;
  }

  const summary = recordField(entry, "summary", "snapshot", "record", "candidate") ?? {};
  const action = impliedAction ??
    normalizeAction(
      stringField(
        entry,
        "action",
        "decision",
        "plannedAction",
        "planned_action",
        "retentionDecision",
        "retention_decision",
        "retention",
      ),
      booleanField(entry, "retain", "retained", "keep", "wouldRetain", "would_retain"),
    );
  const risks = countRetentionRisks(entry);
  const reasons = safeStringList([
    ...stringArrayField(entry, "reasons", "reasonCodes", "reason_codes"),
    ...stringArrayField(summary, "reasons", "reasonCodes", "reason_codes"),
    stringField(entry, "reason", "description", "detail"),
  ]);
  const issues = safeStringList([
    ...arrayField(entry, "issues")
      .map((issue) =>
        isRecord(issue)
          ? stringField(issue, "reason", "issueKind", "issue_kind", "message")
          : typeof issue === "string"
            ? issue
            : undefined
      )
      .filter(isDefined),
    ...stringArrayField(entry, "issueLabels", "issue_labels"),
  ]);

  return {
    index,
    sourceLabel: sourceLabelForRow(entry, sourceKind),
    snapshotId: safeText(
      stringField(summary, "snapshotId", "snapshot_id", "snapshotRef", "snapshot_ref", "id") ??
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
      "snapshotId",
      `snapshot_${index + 1}`,
    ),
    action,
    createdAt: safeTimestamp(
      stringField(summary, "createdAt", "created_at") ??
        stringField(entry, "createdAt", "created_at"),
    ),
    updatedAt: safeTimestamp(
      stringField(summary, "updatedAt", "updated_at") ??
        stringField(entry, "updatedAt", "updated_at"),
    ),
    workspaceId: safeOptional(
      stringField(summary, "workspaceId", "workspace_id") ??
        stringField(entry, "workspaceId", "workspace_id"),
      "workspaceId",
    ),
    deviceId: safeOptional(
      stringField(summary, "deviceId", "device_id") ??
        stringField(entry, "deviceId", "device_id"),
      "deviceId",
    ),
    sourceKind: safeOptional(
      stringField(summary, "sourceKind", "source_kind") ??
        stringField(entry, "sourceKind", "source_kind"),
      "sourceKind",
    ),
    filePathKind: safeOptional(
      stringField(summary, "filePathKind", "file_path_kind") ??
        stringField(entry, "filePathKind", "file_path_kind"),
      "filePathKind",
    ),
    fingerprint: safeFingerprint(
      stringField(summary, "snapshotFingerprint", "snapshot_fingerprint") ??
        stringField(summary, "fingerprint") ??
        stringField(entry, "snapshotFingerprint", "snapshot_fingerprint") ??
        stringField(entry, "fingerprint"),
    ),
    reasons,
    issues,
    risks,
    applied: booleanField(entry, "applied", "cleanupApplied", "cleanup_applied") === true,
  };
}

function buildInventoryRow(
  row: NormalizedInventoryRow,
): WorkspaceSessionSnapshotRetentionCleanupInventoryRow {
  const status = rowStatus(row);
  const severity = severityForStatus(status);
  return {
    id: `workspace_session_snapshot_retention_cleanup_inventory.row.${sanitizeIdentifier(
      `${row.action}_${row.snapshotId}_${row.index}`,
      `row_${row.index + 1}`,
    )}`,
    index: row.index,
    sourceLabel: row.sourceLabel,
    snapshotId: row.snapshotId,
    action: row.action,
    actionLabel: actionLabel(row.action),
    advisory: row.action === "delete",
    status,
    statusLabel: statusLabel(status),
    severity,
    severityLabel: severityLabel(severity),
    ...(row.createdAt === undefined ? {} : { createdAt: row.createdAt }),
    ...(row.updatedAt === undefined ? {} : { updatedAt: row.updatedAt }),
    ...(row.workspaceId === undefined ? {} : { workspaceId: row.workspaceId }),
    ...(row.deviceId === undefined ? {} : { deviceId: row.deviceId }),
    ...(row.sourceKind === undefined ? {} : { sourceKind: row.sourceKind }),
    ...(row.filePathKind === undefined ? {} : { filePathKind: row.filePathKind }),
    ...(row.fingerprint === undefined ? {} : { fingerprint: row.fingerprint }),
    reasons: [...row.reasons],
    issues: [...row.issues],
  };
}

function normalizeCounts(
  record: AnyRecord | undefined,
  rows: readonly NormalizedInventoryRow[],
): InventoryCounts {
  const records = recordField(record, "records");
  const summary = recordField(record, "summary", "counts", "inventory");
  const retentionDecisions = recordField(records, "retentionDecisions", "retention_decisions");
  return {
    entryCount:
      integerField(record, "entryCount", "entry_count", "totalCount", "total_count") ??
      integerField(summary, "entryCount", "entry_count", "totalCount", "total_count") ??
      integerField(summary, "totalSnapshotCount", "total_snapshot_count") ??
      integerField(records, "total") ??
      rows.length,
    keepCount:
      integerField(record, "keepCount", "keep_count", "retainedSnapshotCount") ??
      integerField(summary, "keepCount", "keep_count", "retainedSnapshotCount") ??
      integerField(retentionDecisions, "keep", "retain", "retained") ??
      rows.filter((row) => row.action === "keep").length,
    deleteCount:
      integerField(record, "deleteCount", "delete_count", "expiredSnapshotCount") ??
      integerField(summary, "deleteCount", "delete_count", "expiredSnapshotCount") ??
      integerField(retentionDecisions, "delete", "drop", "expired", "remove") ??
      rows.filter((row) => row.action === "delete").length,
    reviewCount:
      integerField(record, "reviewCount", "review_count", "manualReviewCount") ??
      integerField(summary, "reviewCount", "review_count", "manualReviewCount") ??
      integerField(retentionDecisions, "review", "manual_review") ??
      rows.filter((row) => row.action === "review").length,
  };
}

function resolveCounts(
  counts: InventoryCounts,
  rows: readonly WorkspaceSessionSnapshotRetentionCleanupInventoryRow[],
): InventoryCounts {
  const rowKeep = rows.filter((row) => row.action === "keep").length;
  const rowDelete = rows.filter((row) => row.action === "delete").length;
  const rowReview = rows.filter((row) => row.action === "review").length;
  return {
    entryCount: Math.max(counts.entryCount, rows.length),
    keepCount: Math.max(counts.keepCount, rowKeep),
    deleteCount: Math.max(counts.deleteCount, rowDelete),
    reviewCount: Math.max(counts.reviewCount, rowReview),
  };
}

function buildWarningCounts(
  normalized: NormalizedInventoryInput,
): readonly WarningCount[] {
  if (!normalized.recognized) {
    return [{ kind: "malformed", count: 1 }];
  }
  return [
    { kind: "not_local_only", count: normalized.localOnly === true ? 0 : 1 },
    { kind: "not_dry_run", count: normalized.dryRun === true ? 0 : 1 },
    { kind: "durable_writes", count: normalized.durableWrites === false ? 0 : 1 },
    { kind: "not_redacted", count: normalized.redacted ? 0 : 1 },
    { kind: "raw_body", count: normalized.risks.rawBody },
    { kind: "raw_path", count: normalized.risks.rawPath },
    { kind: "raw_token", count: normalized.risks.rawToken },
    { kind: "applied_actions", count: normalized.appliedCount },
  ];
}

function buildWarning(
  warning: WarningCount,
): WorkspaceSessionSnapshotRetentionCleanupInventoryWarning {
  const status = warningStatus(warning.kind);
  const severity = severityForStatus(status);
  return {
    id: `workspace_session_snapshot_retention_cleanup_inventory.warning.${warning.kind}`,
    kind: warning.kind,
    label: warningLabel(warning.kind),
    description: warningDescription(warning.kind),
    count: warning.count,
    status,
    statusLabel: statusLabel(status),
    severity,
    severityLabel: severityLabel(severity),
  };
}

function buildError(
  id: string,
  error: unknown,
): WorkspaceSessionSnapshotRetentionCleanupInventoryError {
  const redacted = redactError(error);
  return {
    id: `workspace_session_snapshot_retention_cleanup_inventory.error.${sanitizeIdentifier(
      id,
      "error",
    )}`,
    label: "Retention cleanup inventory could not load",
    description: redacted.text,
    redacted: redacted.redactionCount > 0,
    redactionCount: redacted.redactionCount,
  };
}

function inferSourceKind(
  record: AnyRecord | undefined,
  root: unknown,
): WorkspaceSessionSnapshotRetentionCleanupInventorySourceKind {
  const kind = normalizeToken(stringField(record, "kind", "type"));
  if (
    kind === "local_workspace_session_snapshot_retention_cleanup_plan" ||
    arrayField(record, "actions", "keepActions", "deleteActions", "reviewActions").length > 0
  ) {
    return "sdk_dry_run_plan";
  }
  if (
    kind.includes("cli") ||
    kind.includes("inventory_output") ||
    kind === "workspace_session_snapshot_review_retention_preview" ||
    recordField(record, "retention") !== undefined && recordField(record, "records") !== undefined
  ) {
    return "cli_inventory_output";
  }
  if (
    kind.includes("inventory_preview") ||
    kind.includes("retention_preview") ||
    arrayField(record, "snapshots").length > 0 ||
    isRecord(root) && (root.status !== undefined || root.response !== undefined)
  ) {
    return "api_inventory_preview";
  }
  return "unknown";
}

function isInventoryPayloadLike(value: unknown): value is AnyRecord {
  if (!isRecord(value)) {
    return false;
  }
  const kind = normalizeToken(stringField(value, "kind", "type"));
  return (
    kind.includes("retention_cleanup") ||
    kind.includes("retention_preview") ||
    kind.includes("cleanup_inventory") ||
    arrayField(value, "actions", "keepActions", "deleteActions", "reviewActions").length > 0 ||
    arrayField(value, "snapshots", "rows", "items", "summaries").length > 0 ||
    recordField(value, "inventory", "retention", "records") !== undefined ||
    hasCountFields(value)
  );
}

function readDryRun(
  record: AnyRecord | undefined,
  sourceKind: WorkspaceSessionSnapshotRetentionCleanupInventorySourceKind,
): boolean | undefined {
  const retention = recordField(record, "retention");
  const explicit =
    booleanField(record, "dryRun", "dry_run", "previewOnly", "preview_only", "dryRunOnly") ??
    booleanField(retention, "dryRun", "dry_run", "previewOnly", "preview_only");
  if (explicit !== undefined) {
    return explicit;
  }
  const mode = normalizeToken(stringField(record, "mode"));
  if (mode === "preview" || mode === "dry_run") {
    return true;
  }
  if (sourceKind === "sdk_dry_run_plan") {
    return true;
  }
  return undefined;
}

function readLocalOnly(
  record: AnyRecord | undefined,
  sourceKind: WorkspaceSessionSnapshotRetentionCleanupInventorySourceKind,
): boolean | undefined {
  const value = localOnlyFromValue(record);
  if (value !== undefined) {
    return value;
  }
  if (sourceKind === "cli_inventory_output") {
    return true;
  }
  return undefined;
}

function readDurableWrites(record: AnyRecord | undefined): boolean | undefined {
  const retention = recordField(record, "retention");
  const values = [
    booleanField(record, "durableWrites", "durable_writes"),
    booleanField(retention, "durableWrites", "durable_writes"),
    booleanField(retention, "writes"),
    booleanField(retention, "deletes"),
  ];
  if (values.some((value) => value === true)) {
    return true;
  }
  return values.some((value) => value === false) ? false : undefined;
}

function redactedFromValue(value: unknown): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    let foundTrue = false;
    for (const entry of value) {
      const nested = redactedFromValue(entry);
      if (nested === false) {
        return false;
      }
      foundTrue ||= nested === true;
    }
    return foundTrue ? true : undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const direct = booleanField(value, "redacted", "isRedacted", "is_redacted");
  if (direct !== undefined) {
    return direct;
  }

  let foundTrue = false;
  for (const entry of Object.values(value)) {
    const nested = redactedFromValue(entry);
    if (nested === false) {
      return false;
    }
    foundTrue ||= nested === true;
  }
  return foundTrue ? true : undefined;
}

function localOnlyFromValue(value: unknown): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    let foundTrue = false;
    for (const entry of value) {
      const nested = localOnlyFromValue(entry);
      if (nested === false) {
        return false;
      }
      foundTrue ||= nested === true;
    }
    return foundTrue ? true : undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const direct = booleanField(value, "localOnly", "local_only", "isLocalOnly");
  if (direct !== undefined) {
    return direct;
  }

  let foundTrue = false;
  for (const entry of Object.values(value)) {
    const nested = localOnlyFromValue(entry);
    if (nested === false) {
      return false;
    }
    foundTrue ||= nested === true;
  }
  return foundTrue ? true : undefined;
}

function countRetentionRisks(value: unknown, keyHint = ""): RetentionRiskCounts {
  if (value === undefined || value === null) {
    return zeroRisks();
  }
  if (typeof value === "string") {
    return {
      rawBody: 0,
      rawPath: isRawPath(value) ? 1 : 0,
      rawToken: isRawToken(value, keyHint) ? 1 : 0,
    };
  }
  if (Array.isArray(value)) {
    return value.reduce(
      (total, entry) => addRiskCounts(total, countRetentionRisks(entry, keyHint)),
      zeroRisks(),
    );
  }
  if (!isRecord(value)) {
    return zeroRisks();
  }

  let counts = zeroRisks();
  for (const [key, entry] of Object.entries(value)) {
    const token = normalizeToken(key);
    if (isRawBodyKey(token) || isRawBodyFlag(token, entry)) {
      counts = addRiskCounts(counts, { rawBody: 1, rawPath: 0, rawToken: 0 });
    }
    if (isRawPathFlag(token, entry)) {
      counts = addRiskCounts(counts, { rawBody: 0, rawPath: 1, rawToken: 0 });
    }
    if (
      isRawTokenFlag(token, entry) ||
      (SECRET_KEY_PATTERN.test(key) && !isSafeSensitiveFieldValue(entry))
    ) {
      counts = addRiskCounts(counts, { rawBody: 0, rawPath: 0, rawToken: 1 });
    }
    counts = addRiskCounts(counts, countRetentionRisks(entry, key));
  }
  return counts;
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
    if (token === "redactions" && Array.isArray(entry)) {
      count += entry.length;
      continue;
    }
    count += countRedactions(entry);
  }
  return count;
}

function sourceLabelForRow(
  entry: AnyRecord | undefined,
  sourceKind: WorkspaceSessionSnapshotRetentionCleanupInventorySourceKind,
): string {
  const summary = entry === undefined
    ? undefined
    : recordField(entry, "summary", "snapshot", "record", "candidate");
  const raw =
    stringField(summary, "sourceKind", "source_kind") ??
    stringField(entry, "sourceKind", "source_kind") ??
    sourceKindLabel(sourceKind);
  const pathKind =
    stringField(summary, "filePathKind", "file_path_kind") ??
    stringField(entry, "filePathKind", "file_path_kind");
  const label = safeText(raw, "sourceKind", sourceKindLabel(sourceKind));
  const safePathKind = safeOptional(pathKind, "filePathKind");
  return safePathKind === undefined ? label : `${label} ${safePathKind}`;
}

function safeText(value: unknown, keyHint: string, fallback: string): string {
  const redacted =
    value === undefined
      ? "Unavailable"
      : redactWorkspaceSessionSnapshotRetentionCleanupInventoryValue(value, keyHint);
  return redacted === "Unavailable" ? fallback : redacted;
}

function safeOptional(value: unknown, keyHint: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const redacted = redactWorkspaceSessionSnapshotRetentionCleanupInventoryValue(
    value,
    keyHint,
  );
  return redacted === "Unavailable" ? undefined : redacted;
}

function safeFingerprint(value: string | undefined): string | undefined {
  return value !== undefined && FINGERPRINT_PATTERN.test(value) ? value : undefined;
}

function safeTimestamp(value: string | undefined): string | undefined {
  return value !== undefined && !Number.isNaN(Date.parse(value)) ? value : undefined;
}

function safeStringList(values: readonly (string | undefined)[]): string[] {
  return uniqueSorted(
    values
      .filter(isDefined)
      .map((value) =>
        redactWorkspaceSessionSnapshotRetentionCleanupInventoryValue(value, "detail")
      )
      .filter((value) => value !== "Unavailable"),
  );
}

function redactError(error: unknown): RedactedText {
  const raw = errorMessage(error);
  if (raw === undefined || raw.trim().length === 0) {
    return {
      text: "Retention cleanup inventory could not load.",
      redactionCount: 0,
    };
  }
  const text = truncate(
    redactWorkspaceSessionText(raw)
      .replace(/\[redacted[^\]]*\]/gi, REDACTED)
      .replace(ABSOLUTE_PATH_PATTERN, REDACTED)
      .replace(SECRET_VALUE_PATTERN, REDACTED)
      .replace(/\s+/g, " ")
      .trim(),
    180,
  );
  return {
    text: text.length === 0 ? "Retention cleanup inventory could not load." : text,
    redactionCount: countRedactionMarkers(text),
  };
}

function redactSensitiveValue(
  value: unknown,
  key = "",
  seen = new WeakMap<object, unknown>(),
): unknown {
  if (value === null || typeof value !== "object") {
    return typeof value === "string"
      ? redactWorkspaceSessionSnapshotRetentionCleanupInventoryValue(value, key)
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

function resolvePhase(
  recognized: boolean,
  counts: InventoryCounts,
  errors: readonly WorkspaceSessionSnapshotRetentionCleanupInventoryError[],
): WorkspaceSessionSnapshotRetentionCleanupInventoryPhase {
  if (errors.length > 0 && !recognized) {
    return "error";
  }
  if (!recognized) {
    return "error";
  }
  if (
    counts.entryCount === 0 &&
    counts.keepCount === 0 &&
    counts.deleteCount === 0 &&
    counts.reviewCount === 0
  ) {
    return "empty";
  }
  return "success";
}

function resolveStatus(
  phase: WorkspaceSessionSnapshotRetentionCleanupInventoryPhase,
  dryRunReady: boolean,
  counts: InventoryCounts,
  warnings: readonly WorkspaceSessionSnapshotRetentionCleanupInventoryWarning[],
  errors: readonly WorkspaceSessionSnapshotRetentionCleanupInventoryError[],
): WorkspaceSessionSnapshotRetentionCleanupInventoryStatus {
  if (phase === "loading") {
    return "loading";
  }
  if (phase === "error" || errors.length > 0 && !dryRunReady) {
    return "error";
  }
  if (phase === "empty") {
    return warnings.length > 0 ? "blocked" : "empty";
  }
  if (warnings.some((warning) => warning.status === "blocked")) {
    return "blocked";
  }
  if (!dryRunReady || counts.deleteCount > 0 || counts.reviewCount > 0) {
    return "attention";
  }
  return "ready";
}

function rowStatus(
  row: NormalizedInventoryRow,
): WorkspaceSessionSnapshotRetentionCleanupInventoryStatus {
  if (
    row.applied ||
    row.risks.rawBody > 0 ||
    row.risks.rawPath > 0 ||
    row.risks.rawToken > 0
  ) {
    return "blocked";
  }
  if (row.action === "delete" || row.action === "review") {
    return "attention";
  }
  return "ready";
}

function warningStatus(
  kind: WorkspaceSessionSnapshotRetentionCleanupInventoryWarningKind,
): WorkspaceSessionSnapshotRetentionCleanupInventoryStatus {
  switch (kind) {
    case "malformed":
    case "not_local_only":
    case "not_dry_run":
    case "durable_writes":
    case "not_redacted":
    case "raw_body":
    case "raw_path":
    case "raw_token":
    case "applied_actions":
      return "blocked";
  }
}

function normalizeAction(
  value: string | undefined,
  retain?: boolean,
): WorkspaceSessionSnapshotRetentionCleanupInventoryAction {
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
    token === "within_policy"
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
    token === "drop" ||
    token === "dropped"
  ) {
    return "delete";
  }
  return "review";
}

function actionLabel(
  action: WorkspaceSessionSnapshotRetentionCleanupInventoryAction,
): string {
  switch (action) {
    case "keep":
      return "Keep";
    case "delete":
      return "Advisory delete";
    case "review":
      return "Review";
  }
}

function statusLabel(
  status: WorkspaceSessionSnapshotRetentionCleanupInventoryStatus,
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
  status: WorkspaceSessionSnapshotRetentionCleanupInventoryStatus,
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
  kind: WorkspaceSessionSnapshotRetentionCleanupInventoryWarningKind,
): string {
  switch (kind) {
    case "not_local_only":
      return "Not local only";
    case "not_dry_run":
      return "Not a dry run";
    case "durable_writes":
      return "Durable writes not ruled out";
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
      return "Malformed inventory payload";
  }
}

function warningDescription(
  kind: WorkspaceSessionSnapshotRetentionCleanupInventoryWarningKind,
): string {
  switch (kind) {
    case "not_local_only":
      return "Inventory cleanup must be marked local-only before it is ready.";
    case "not_dry_run":
      return "Inventory cleanup must be marked as a dry run before it is ready.";
    case "durable_writes":
      return "Inventory cleanup must explicitly report durableWrites false before it is ready.";
    case "not_redacted":
      return "Inventory cleanup must be redacted before it is ready.";
    case "raw_body":
      return "Inventory cleanup indicates raw request or response body retention.";
    case "raw_path":
      return "Inventory cleanup indicates raw path retention.";
    case "raw_token":
      return "Inventory cleanup indicates raw token or secret retention.";
    case "applied_actions":
      return "Inventory cleanup contains applied actions instead of preview-only entries.";
    case "malformed":
      return "Inventory cleanup did not include recognizable dry-run inventory data.";
  }
}

function sourceKindLabel(
  sourceKind: WorkspaceSessionSnapshotRetentionCleanupInventorySourceKind,
): string {
  switch (sourceKind) {
    case "sdk_dry_run_plan":
      return "SDK dry-run plan";
    case "cli_inventory_output":
      return "CLI inventory";
    case "api_inventory_preview":
      return "API inventory preview";
    case "unknown":
      return "Unknown inventory";
  }
}

function compareRows(
  left: WorkspaceSessionSnapshotRetentionCleanupInventoryRow,
  right: WorkspaceSessionSnapshotRetentionCleanupInventoryRow,
): number {
  return actionWeight(left.action) - actionWeight(right.action) ||
    left.index - right.index ||
    left.snapshotId.localeCompare(right.snapshotId);
}

function actionWeight(
  action: WorkspaceSessionSnapshotRetentionCleanupInventoryAction,
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

function hasCountFields(record: AnyRecord | undefined): boolean {
  return (
    integerField(record, "entryCount", "entry_count", "keepCount", "deleteCount", "reviewCount") !==
      undefined ||
    integerField(recordField(record, "summary", "counts", "records"), "total", "totalCount") !==
      undefined
  );
}

function isRawBodyFlag(key: string, value: unknown): boolean {
  return value === true &&
    (key === "raw_body_retained" ||
      key === "raw_body_stored" ||
      key === "raw_request_body_stored" ||
      key === "raw_response_body_stored" ||
      key === "stores_raw_body");
}

function isRawPathFlag(key: string, value: unknown): boolean {
  return (
    value === true &&
      (key === "raw_paths_output" ||
        key === "raw_paths_stored" ||
        key === "raw_storage_paths_stored") ||
    value === false &&
      (key === "storage_path_redacted" || key === "storage_paths_redacted")
  );
}

function isRawTokenFlag(key: string, value: unknown): boolean {
  return (
    value === true &&
      (key === "root_keys_output" ||
        key === "lock_tokens_output" ||
        key === "raw_lock_material_stored" ||
        key === "raw_secrets_stored") ||
    value === false &&
      (key === "lock_material_redacted" || key === "tokens_redacted")
  );
}

function isRawBodyKey(key: string): boolean {
  return (
    key === "raw_body" ||
    key === "request_body" ||
    key === "response_body" ||
    key === "raw_request_body" ||
    key === "raw_response_body"
  );
}

function isRawPath(value: string): boolean {
  return !isRedactedToken(value) && ABSOLUTE_PATH_PATTERN.test(value);
}

function isRawToken(value: string, keyHint = ""): boolean {
  if (isRedactedToken(value) || normalizeToken(keyHint).includes("fingerprint")) {
    return false;
  }
  return (
    SECRET_KEY_PATTERN.test(keyHint) ||
    SECRET_VALUE_PATTERN.test(value) ||
    (SECRET_KEY_PATTERN.test(keyHint) && LONG_SECRET_VALUE_PATTERN.test(value))
  );
}

function isSafeSensitiveFieldValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  return typeof value === "string" && isRedactedToken(value);
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

function isSafeIdentifierKey(key: string): boolean {
  return (
    key === "snapshot_id" ||
    key === "snapshot_ref" ||
    key === "record_id" ||
    key === "workspace_id" ||
    key === "device_id" ||
    key === "source_kind" ||
    key === "file_path_kind"
  );
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

function zeroRisks(): RetentionRiskCounts {
  return { rawBody: 0, rawPath: 0, rawToken: 0 };
}

function uniqueSorted(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function dedupeErrors(
  errors: readonly WorkspaceSessionSnapshotRetentionCleanupInventoryError[],
): WorkspaceSessionSnapshotRetentionCleanupInventoryError[] {
  const seen = new Set<string>();
  const deduped: WorkspaceSessionSnapshotRetentionCleanupInventoryError[] = [];
  for (const error of errors) {
    const key = `${error.label}:${error.description}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(error);
  }
  return deduped;
}

function valueField(record: AnyRecord | undefined, ...keys: readonly string[]): unknown {
  if (record === undefined) {
    return undefined;
  }
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return record[key];
    }
  }
  return undefined;
}

function stringField(
  record: AnyRecord | undefined,
  ...keys: readonly string[]
): string | undefined {
  for (const key of keys) {
    const value = valueField(record, key);
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function timestampField(
  record: AnyRecord | undefined,
  ...keys: readonly string[]
): string | undefined {
  const value = stringField(record, ...keys);
  return value !== undefined && !Number.isNaN(Date.parse(value)) ? value : undefined;
}

function booleanField(
  record: AnyRecord | undefined,
  ...keys: readonly string[]
): boolean | undefined {
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

function integerField(
  record: AnyRecord | undefined,
  ...keys: readonly string[]
): number | undefined {
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

function arrayField(record: AnyRecord | undefined, ...keys: readonly string[]): unknown[] {
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
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
}

function recordField(
  record: AnyRecord | undefined,
  ...keys: readonly string[]
): AnyRecord | undefined {
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
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim().length > 0) {
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
  return sanitized.length === 0 ? fallback : sanitized;
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}...`;
}

function countRedactionMarkers(value: string): number {
  const matches = value.match(/\[(?:redacted[^\]]*|REDACTED)\]/gi);
  return matches === null ? 0 : matches.length;
}

function sum<TValue>(
  values: readonly TValue[],
  getValue: (value: TValue) => number,
): number {
  return values.reduce((total, value) => total + getValue(value), 0);
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

function deepFreeze<TValue>(value: TValue): TValue {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }
  return value;
}
