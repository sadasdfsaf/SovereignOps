import {
  redactWorkspaceSessionText,
  type WorkspaceSessionSeverity,
} from "./workspaceSessionState.ts";

export type WorkspaceSessionSnapshotCall =
  | "preview"
  | "create"
  | "list"
  | "get";

export type WorkspaceSessionSnapshotPhase =
  | "loading"
  | "success"
  | "empty"
  | "error";

export type WorkspaceSessionSnapshotStatus =
  | "loading"
  | "empty"
  | "ready"
  | "attention"
  | "blocked"
  | "error";

export type WorkspaceSessionSnapshotContext =
  | WorkspaceSessionSnapshotCall
  | "records"
  | "readiness"
  | "redactions"
  | "retention";

export type WorkspaceSessionSnapshotRowSource =
  | "preview"
  | "record"
  | "summary";

export type WorkspaceSessionSnapshotReadinessKind =
  | "local_only"
  | "redacted"
  | "durable_writes"
  | "raw_retention";

export interface BuildWorkspaceSessionSnapshotStateOptions {
  call?: WorkspaceSessionSnapshotCall;
  defaultTimestamp?: string;
  loading?: boolean;
  error?: unknown;
}

export interface WorkspaceSessionSnapshotState {
  id: "workspace_session_snapshot";
  call: WorkspaceSessionSnapshotCall;
  phase: WorkspaceSessionSnapshotPhase;
  generatedAt: string;
  status: WorkspaceSessionSnapshotStatus;
  statusLabel: string;
  severity: WorkspaceSessionSeverity;
  severityLabel: string;
  headline: string;
  isEmpty: boolean;
  selectedSnapshotId?: string;
  snapshotCount: number;
  localOnly: boolean;
  redacted: boolean;
  redactionCount: number;
  durableWrites: boolean;
  durableWriteCount: number;
  rawBodyRetained: false;
  rawRetentionRisk: boolean;
  rawRetentionRiskCount: number;
  summaryCards: WorkspaceSessionSnapshotSummaryCard[];
  recordRows: WorkspaceSessionSnapshotRecordRow[];
  readinessIndicators: WorkspaceSessionSnapshotReadinessIndicator[];
  pagination?: WorkspaceSessionSnapshotPagination;
  emptyStates: WorkspaceSessionSnapshotEmptyStates;
  errorStates: WorkspaceSessionSnapshotErrorState[];
  ariaLabel: string;
}

export interface WorkspaceSessionSnapshotSummaryCard {
  id: string;
  label: string;
  value: string;
  status: WorkspaceSessionSnapshotStatus;
  statusLabel: string;
  severity: WorkspaceSessionSeverity;
  severityLabel: string;
  detailLabels: string[];
  ariaLabel: string;
}

export interface WorkspaceSessionSnapshotRecordRow {
  id: string;
  source: WorkspaceSessionSnapshotRowSource;
  snapshotId: string;
  title: string;
  label: string;
  createdAt: string;
  updatedAt: string;
  workspaceId?: string;
  deviceId?: string;
  sessionId?: string;
  fingerprint?: string;
  snapshotFingerprint?: string;
  operationLabels: string[];
  eventCount: number;
  auditRecordCount: number;
  localOnly: boolean;
  localOnlyKnown: boolean;
  redacted: boolean;
  redactedKnown: boolean;
  redactionCount: number;
  durableWrites: boolean;
  rawBodyRetained: false;
  rawRetentionRisk: boolean;
  rawRetentionRiskCount: number;
  status: WorkspaceSessionSnapshotStatus;
  statusLabel: string;
  severity: WorkspaceSessionSeverity;
  severityLabel: string;
  detailLabels: string[];
  ariaLabel: string;
}

export interface WorkspaceSessionSnapshotReadinessIndicator {
  id: string;
  kind: WorkspaceSessionSnapshotReadinessKind;
  label: string;
  value: string;
  ready: boolean;
  status: WorkspaceSessionSnapshotStatus;
  statusLabel: string;
  severity: WorkspaceSessionSeverity;
  severityLabel: string;
  count: number;
  detailLabels: string[];
  ariaLabel: string;
}

export interface WorkspaceSessionSnapshotPagination {
  offset: number;
  limit: number;
  totalRecordCount: number;
  matchedRecordCount: number;
  returnedRecordCount: number;
  hasMore: boolean;
  label: string;
  ariaLabel: string;
}

export interface WorkspaceSessionSnapshotEmptyStates {
  records: WorkspaceSessionSnapshotEmptyState;
  readiness: WorkspaceSessionSnapshotEmptyState;
  errors: WorkspaceSessionSnapshotEmptyState;
}

export interface WorkspaceSessionSnapshotEmptyState {
  id: string;
  label: string;
  description: string;
  ariaLabel: string;
  actionLabel?: string;
}

export interface WorkspaceSessionSnapshotErrorState {
  id: string;
  context: WorkspaceSessionSnapshotContext;
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
  call: WorkspaceSessionSnapshotCall;
  generatedAt: string;
  rows: NormalizedSnapshotRow[];
  pagination?: WorkspaceSessionSnapshotPagination;
  errorStates: WorkspaceSessionSnapshotErrorState[];
}

interface NormalizedSnapshotRow {
  source: WorkspaceSessionSnapshotRowSource;
  snapshotId: string;
  title?: string;
  label?: string;
  createdAt?: string;
  updatedAt?: string;
  workspaceId?: string;
  deviceId?: string;
  sessionId?: string;
  fingerprint?: string;
  snapshotFingerprint?: string;
  operations: string[];
  eventCount: number;
  auditRecordCount: number;
  localOnly?: boolean;
  redacted?: boolean;
  redactionCount: number;
  durableWrites: boolean;
  rawRetentionRiskCount: number;
}

interface SafetyFacts {
  localOnly?: boolean;
  redacted?: boolean;
  durableWrites: boolean;
  redactionCount: number;
  rawRetentionRiskCount: number;
}

interface RedactedText {
  text: string;
  redactionCount: number;
}

const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const REDACTED = "[REDACTED]";
const SNAPSHOT_STORE_SCHEMA_VERSION = "workspace-session-store/v1";
const RAW_BODY_RETAINED = false as const;
const FINGERPRINT_PATTERN = /^sha256:[a-f0-9]{64}$/;
const SECRET_KEY_PATTERN =
  /(?:api[-_]?key|apikey|authorization|bearer|cookie|credential|jwt|password|passphrase|private[-_]?key|refresh[-_]?token|secret|session[-_]?token|signing[-_]?key|token)$/i;
const SECRET_VALUE_PATTERN =
  /(?:bearer\s+[a-z0-9._~+/=-]{8,}|(?:sk|rk|pk|tok|pat|npm|ghp|gho)_[a-z0-9_-]{8,}|(?:sk|rk|pat|glpat|github_pat)-[a-z0-9_-]{8,}|[a-z0-9_+/=-]{40,})/i;
const ABSOLUTE_PATH_PATTERN =
  /(?:\b[A-Za-z]:[\\/][^\s"',;)}\]]+|\\\\[^\\\s"',;)}\]]+[\\][^\s"',;)}\]]+|\b(?:\/Users|\/home|\/var|\/tmp|\/private|\/mnt|\/Volumes)\/[^\s"',;)}\]]+)/;

export function buildWorkspaceSessionSnapshotState(
  input: unknown = {},
  options: BuildWorkspaceSessionSnapshotStateOptions = {},
): WorkspaceSessionSnapshotState {
  if (options.loading === true) {
    return buildWorkspaceSessionSnapshotLoadingState(options);
  }

  const normalized = normalizeInput(input, options);
  const recordRows = normalized.rows.map((row) =>
    buildRecordRow(row, normalized.generatedAt)
  );
  const phase = resolvePhase(recordRows, normalized.errorStates);
  const readinessIndicators = buildReadinessIndicators(recordRows);
  const status = resolveStatus({
    phase,
    rows: recordRows,
    readinessIndicators,
  });
  const severity = severityForStatus(status);
  const localOnly =
    recordRows.length > 0 &&
    recordRows.every((row) => row.localOnly && row.localOnlyKnown);
  const redacted =
    recordRows.length > 0 &&
    recordRows.every((row) => row.redacted && row.redactedKnown);
  const redactionCount = sum(recordRows, (row) => row.redactionCount);
  const durableWriteCount = recordRows.filter((row) => row.durableWrites).length;
  const rawRetentionRiskCount = sum(
    recordRows,
    (row) => row.rawRetentionRiskCount,
  );
  const summaryCards = buildSummaryCards({
    rows: recordRows,
    readinessIndicators,
    pagination: normalized.pagination,
    redactionCount,
    rawRetentionRiskCount,
  });

  return cloneState({
    id: "workspace_session_snapshot",
    call: normalized.call,
    phase,
    generatedAt: normalized.generatedAt,
    status,
    statusLabel: statusLabel(status),
    severity,
    severityLabel: severityLabel(severity),
    headline: buildHeadline(normalized.call, status),
    isEmpty: phase === "empty",
    selectedSnapshotId:
      recordRows.length === 1 ? recordRows[0].snapshotId : undefined,
    snapshotCount: recordRows.length,
    localOnly,
    redacted,
    redactionCount,
    durableWrites: durableWriteCount > 0,
    durableWriteCount,
    rawBodyRetained: RAW_BODY_RETAINED,
    rawRetentionRisk: rawRetentionRiskCount > 0,
    rawRetentionRiskCount,
    summaryCards,
    recordRows,
    readinessIndicators,
    ...(normalized.pagination === undefined
      ? {}
      : { pagination: clonePagination(normalized.pagination) }),
    emptyStates: buildWorkspaceSessionSnapshotEmptyStates(),
    errorStates: normalized.errorStates.map(cloneErrorState),
    ariaLabel: [
      "Workspace session snapshots",
      statusLabel(status),
      severityLabel(severity),
      formatCount(recordRows.length, "snapshot"),
      formatCount(rawRetentionRiskCount, "raw retention flag"),
    ].join(", "),
  });
}

export function buildWorkspaceSessionSnapshotLoadingState(
  options: Pick<
    BuildWorkspaceSessionSnapshotStateOptions,
    "call" | "defaultTimestamp"
  > = {},
): WorkspaceSessionSnapshotState {
  const call = options.call ?? "list";
  const generatedAt = normalizeTimestamp(undefined, options.defaultTimestamp);
  const status: WorkspaceSessionSnapshotStatus = "loading";
  const severity = severityForStatus(status);

  return cloneState({
    id: "workspace_session_snapshot",
    call,
    phase: "loading",
    generatedAt,
    status,
    statusLabel: statusLabel(status),
    severity,
    severityLabel: severityLabel(severity),
    headline: buildHeadline(call, status),
    isEmpty: false,
    snapshotCount: 0,
    localOnly: true,
    redacted: true,
    redactionCount: 0,
    durableWrites: false,
    durableWriteCount: 0,
    rawBodyRetained: RAW_BODY_RETAINED,
    rawRetentionRisk: false,
    rawRetentionRiskCount: 0,
    summaryCards: [
      buildSummaryCard({
        id: "loading",
        label: "Snapshot records",
        value: "Loading",
        status,
        detailLabels: ["Waiting for workspace session snapshot records."],
      }),
    ],
    recordRows: [],
    readinessIndicators: buildReadinessIndicators([]),
    emptyStates: buildWorkspaceSessionSnapshotEmptyStates(),
    errorStates: [],
    ariaLabel: "Workspace session snapshots, Loading, Info",
  });
}

export function buildWorkspaceSessionSnapshotRecordRows(
  input: unknown,
  options: BuildWorkspaceSessionSnapshotStateOptions = {},
): WorkspaceSessionSnapshotRecordRow[] {
  return buildWorkspaceSessionSnapshotState(input, options).recordRows.map(
    cloneRecordRow,
  );
}

export function buildWorkspaceSessionSnapshotSummaryCards(
  input: unknown,
  options: BuildWorkspaceSessionSnapshotStateOptions = {},
): WorkspaceSessionSnapshotSummaryCard[] {
  return buildWorkspaceSessionSnapshotState(input, options).summaryCards.map(
    cloneSummaryCard,
  );
}

export function buildWorkspaceSessionSnapshotReadinessIndicators(
  input: unknown,
  options: BuildWorkspaceSessionSnapshotStateOptions = {},
): WorkspaceSessionSnapshotReadinessIndicator[] {
  return buildWorkspaceSessionSnapshotState(input, options).readinessIndicators.map(
    cloneReadinessIndicator,
  );
}

export function buildWorkspaceSessionSnapshotEmptyStates(): WorkspaceSessionSnapshotEmptyStates {
  return {
    records: buildWorkspaceSessionSnapshotEmptyState("records"),
    readiness: buildWorkspaceSessionSnapshotEmptyState("readiness"),
    errors: buildWorkspaceSessionSnapshotEmptyState("errors"),
  };
}

export function buildWorkspaceSessionSnapshotEmptyState(
  context: "records" | "readiness" | "errors",
): WorkspaceSessionSnapshotEmptyState {
  switch (context) {
    case "records":
      return {
        id: "workspace_session_snapshot_records_empty",
        label: "No snapshot records",
        description:
          "Stored workspace session snapshots will appear after a create, get, list, or preview response loads.",
        ariaLabel: "No workspace session snapshot records are available",
        actionLabel: "Refresh snapshots",
      };
    case "readiness":
      return {
        id: "workspace_session_snapshot_readiness_empty",
        label: "No snapshot readiness",
        description:
          "Snapshot readiness indicators will appear after snapshot records load.",
        ariaLabel: "No workspace session snapshot readiness indicators are available",
      };
    case "errors":
      return {
        id: "workspace_session_snapshot_errors_empty",
        label: "No snapshot errors",
        description: "Snapshot response errors will appear here when loading fails.",
        ariaLabel: "No workspace session snapshot errors are available",
      };
  }
}

export function buildWorkspaceSessionSnapshotErrorStates(
  input: unknown,
  options: BuildWorkspaceSessionSnapshotStateOptions = {},
): WorkspaceSessionSnapshotErrorState[] {
  return normalizeInput(input, options).errorStates.map(cloneErrorState);
}

export function buildWorkspaceSessionSnapshotErrorState(
  context: WorkspaceSessionSnapshotContext,
  error: unknown,
): WorkspaceSessionSnapshotErrorState {
  const redacted = redactWorkspaceSessionSnapshotError(error);
  const id = `workspace_session_snapshot_${context}_error`;

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

export function redactWorkspaceSessionSnapshotDisplayValue(
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
      : JSON.stringify(value) ?? String(value);
  if (raw === "") {
    return "Unavailable";
  }
  if (keyHint === "fingerprint" && FINGERPRINT_PATTERN.test(raw)) {
    return raw;
  }

  const redacted = redactWorkspaceSessionText(raw).trim();
  if (
    redacted !== raw ||
    (keyHint !== undefined && SECRET_KEY_PATTERN.test(keyHint)) ||
    SECRET_VALUE_PATTERN.test(raw) ||
    ABSOLUTE_PATH_PATTERN.test(raw)
  ) {
    return REDACTED;
  }
  return truncate(redacted.replace(/\s+/g, " "), 96);
}

export function redactWorkspaceSessionSnapshotError(
  error: unknown,
): RedactedText {
  const message = errorMessage(error);
  const raw =
    message ??
    (isRecord(error) ? JSON.stringify(redactSensitiveValue(error)) : undefined);
  if (raw === undefined || raw.trim() === "") {
    return {
      text: "Workspace session snapshots could not load.",
      redactionCount: 0,
    };
  }

  const sanitized = redactWorkspaceSessionText(raw).replace(/\s+/g, " ").trim();
  const text =
    sanitized === "" ? "Workspace session snapshots could not load." : sanitized;
  return {
    text: truncate(text, 180),
    redactionCount: countRedactionMarkers(text),
  };
}

function normalizeInput(
  input: unknown,
  options: BuildWorkspaceSessionSnapshotStateOptions,
): NormalizedInput {
  const root = clonePlain(unwrapResponseBody(input));
  const rootRecord = isRecord(root) ? root : undefined;
  const call = options.call ?? inferCall(root);
  const errorStates = collectErrorStates(root, call);

  if (options.error !== undefined) {
    errorStates.push(buildWorkspaceSessionSnapshotErrorState(call, options.error));
  }

  const rowInputs = collectSnapshotInputs(root);
  const rootFacts = readEnvelopeSafetyFacts(rootRecord);
  const rows = rowInputs.map((entry, index) =>
    normalizeSnapshotRow(entry, index, {
      call,
      rootFacts,
      generatedAt: normalizeTimestamp(
        timestampField(
          rootRecord,
          "generatedAt",
          "generated_at",
          "createdAt",
          "created_at",
          "updatedAt",
          "updated_at",
        ),
        options.defaultTimestamp,
      ),
    })
  );
  const generatedAt = normalizeTimestamp(
    timestampField(
      rootRecord,
      "generatedAt",
      "generated_at",
      "createdAt",
      "created_at",
      "updatedAt",
      "updated_at",
    ) ?? rows[0]?.updatedAt ?? rows[0]?.createdAt,
    options.defaultTimestamp,
  );

  return {
    call,
    generatedAt,
    rows: rows.sort(compareNormalizedRows),
    pagination: normalizePagination(recordField(rootRecord, "pagination")),
    errorStates: dedupeErrorStates(errorStates),
  };
}

function unwrapResponseBody(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  if (isSnapshotResponseLike(value)) {
    return value;
  }

  const response = recordField(value, "response");
  const responseBody = recordField(response, "body");
  if (responseBody !== undefined && isSnapshotResponseLike(responseBody)) {
    return responseBody;
  }

  for (const key of ["body", "data", "result"]) {
    const nested = recordField(value, key);
    if (nested !== undefined && isSnapshotResponseLike(nested)) {
      return nested;
    }
  }
  return value;
}

function inferCall(input: unknown): WorkspaceSessionSnapshotCall {
  if (Array.isArray(input)) {
    return "list";
  }
  if (!isRecord(input)) {
    return "list";
  }

  const explicit = normalizeToken(stringField(input, "call", "operation", "action"));
  if (explicit === "preview") {
    return "preview";
  }
  if (explicit === "create" || explicit === "created") {
    return "create";
  }
  if (explicit === "get" || explicit === "read") {
    return "get";
  }
  if (explicit === "list" || explicit === "search") {
    return "list";
  }

  const kind = normalizeToken(stringField(input, "kind"));
  if (kind === "workspace_session_snapshot_preview") {
    return "preview";
  }
  if (kind === "workspace_session_snapshot_record_created") {
    return "create";
  }
  if (kind === "workspace_session_snapshot_record_read") {
    return "get";
  }
  if (kind === "workspace_session_snapshot_record_list") {
    return "list";
  }
  if (recordField(input, "record", "snapshotRecord", "snapshot_record") !== undefined) {
    return "get";
  }
  if (
    !isSnapshotRecordLike(input) &&
    isSnapshotPreviewLike(
      recordField(input, "preview", "snapshotPreview", "snapshot_preview", "snapshot"),
    )
  ) {
    return "preview";
  }
  if (Array.isArray(input.records)) {
    return "list";
  }
  if (isSnapshotPreviewLike(input)) {
    return "preview";
  }
  if (isSnapshotRecordLike(input)) {
    return "get";
  }
  return "list";
}

function collectSnapshotInputs(input: unknown): AnyRecord[] {
  if (Array.isArray(input)) {
    return input.filter(isRecord);
  }
  if (!isRecord(input)) {
    return [];
  }

  const records = arrayField(input, "records", "items", "snapshots");
  if (records.length > 0) {
    return records.filter(isRecord);
  }

  const direct =
    recordField(
      input,
      "record",
      "createdRecord",
      "created_record",
      "snapshotRecord",
      "snapshot_record",
    ) ?? (isSnapshotRecordLike(input) || isSnapshotPreviewLike(input) ? input : undefined);
  if (direct !== undefined) {
    return [direct];
  }

  const preview = recordField(
    input,
    "preview",
    "snapshotPreview",
    "snapshot_preview",
    "snapshot",
  );
  if (isSnapshotPreviewLike(preview)) {
    return [preview];
  }
  return [];
}

function normalizeSnapshotRow(
  input: AnyRecord,
  index: number,
  context: {
    call: WorkspaceSessionSnapshotCall;
    rootFacts: SafetyFacts;
    generatedAt: string;
  },
): NormalizedSnapshotRow {
  const preview = isSnapshotPreviewLike(input)
    ? input
    : recordField(input, "snapshot", "preview", "snapshotPreview", "snapshot_preview");
  const source = isSnapshotPreviewLike(input)
    ? "preview"
    : isFullSnapshotRecord(input)
      ? "record"
      : "summary";
  const summary = readSummary(input, preview, source);
  const safety = mergeSafetyFacts(context.rootFacts, readSafetyFacts(input));
  const localOnly =
    safety.localOnly ?? (source === "summary" && context.call === "list" ? true : undefined);
  const redacted =
    safety.redacted ?? (source === "summary" && context.call === "list" ? true : undefined);
  const fingerprint =
    safeOptionalString(stringField(input, "fingerprint"), "fingerprint") ??
    safeOptionalString(stringField(summary, "fingerprint"), "fingerprint");
  const snapshotFingerprint =
    safeOptionalString(
      stringField(input, "snapshotFingerprint", "snapshot_fingerprint"),
      "fingerprint",
    ) ??
    safeOptionalString(stringField(preview, "fingerprint"), "fingerprint");
  const previewFingerprint =
    safeOptionalString(stringField(preview, "fingerprint"), "fingerprint") ??
    snapshotFingerprint ??
    fingerprint;
  const snapshotId =
    safeOptionalString(stringField(input, "snapshotId", "snapshot_id", "id")) ??
    (source === "preview"
      ? `preview_${shortFingerprint(previewFingerprint, index + 1)}`
      : `snapshot_${index + 1}`);
  const label = safeOptionalString(stringField(input, "label", "title", "name"));
  const operations = stringArrayField(summary, "operations", "operationLabels")
    .map((operation) => safeOptionalString(operation))
    .filter(isDefined);
  const eventCount =
    nonNegativeIntegerField(summary, "eventCount", "event_count") ??
    arrayField(summary, "eventIds", "event_ids").length ??
    0;
  const auditRecordCount =
    nonNegativeIntegerField(summary, "auditRecordCount", "audit_record_count") ??
    arrayField(summary, "auditIds", "audit_ids", "auditActions", "audit_actions")
      .length ??
    0;

  return {
    source,
    snapshotId,
    title: label ?? titleFromSnapshotId(snapshotId, source),
    label: label ?? snapshotId,
    createdAt:
      timestampField(input, "createdAt", "created_at", "generatedAt", "generated_at") ??
      context.generatedAt,
    updatedAt:
      timestampField(input, "updatedAt", "updated_at", "createdAt", "created_at") ??
      context.generatedAt,
    workspaceId: safeOptionalString(
      stringField(summary, "workspaceId", "workspace_id"),
    ),
    deviceId: safeOptionalString(stringField(summary, "deviceId", "device_id")),
    sessionId: safeOptionalString(stringField(summary, "sessionId", "session_id")),
    fingerprint,
    snapshotFingerprint,
    operations,
    eventCount,
    auditRecordCount,
    localOnly,
    redacted,
    redactionCount: safety.redactionCount,
    durableWrites: safety.durableWrites,
    rawRetentionRiskCount: safety.rawRetentionRiskCount,
  };
}

function readSummary(
  record: AnyRecord,
  preview: AnyRecord | undefined,
  source: WorkspaceSessionSnapshotRowSource,
): AnyRecord | undefined {
  if (source === "summary") {
    return record;
  }

  return (
    recordField(record, "summary") ??
    recordField(preview, "summary") ??
    recordField(recordField(record, "snapshot"), "summary")
  );
}

function readSafetyFacts(value: AnyRecord | undefined): SafetyFacts {
  if (value === undefined) {
    return {
      durableWrites: false,
      redactionCount: 0,
      rawRetentionRiskCount: 0,
    };
  }

  return {
    localOnly: localOnlyFromValue(value),
    redacted: redactedFromValue(value),
    durableWrites: hasDurableWrites(value),
    redactionCount: countRedactions(value),
    rawRetentionRiskCount: countRawRetentionRisks(value),
  };
}

function readEnvelopeSafetyFacts(value: AnyRecord | undefined): SafetyFacts {
  if (value === undefined) {
    return {
      durableWrites: false,
      redactionCount: 0,
      rawRetentionRiskCount: 0,
    };
  }

  let rawRetentionRiskCount = 0;
  for (const [key, entry] of Object.entries(value)) {
    const token = normalizeToken(key);
    if (
      token === "record" ||
      token === "records" ||
      token === "items" ||
      token === "snapshot" ||
      token === "preview" ||
      token === "audit_preview" ||
      token === "summary" ||
      token === "filters" ||
      token === "pagination"
    ) {
      continue;
    }
    if (isRawRetentionFlag(token, entry)) {
      rawRetentionRiskCount += 1;
    }
  }

  return {
    localOnly: booleanField(
      value,
      "localOnly",
      "local_only",
      "isLocalOnly",
      "is_local_only",
    ),
    redacted: booleanField(
      value,
      "redacted",
      "isRedacted",
      "is_redacted",
      "hasRedactions",
      "has_redactions",
    ),
    durableWrites:
      booleanField(value, "durableWrites", "durable_writes") === true,
    redactionCount: countDirectRedactions(value),
    rawRetentionRiskCount,
  };
}

function countDirectRedactions(value: AnyRecord): number {
  let count = 0;
  for (const key of [
    "redactions",
    "redactionMarkers",
    "redaction_markers",
    "redactedPaths",
    "redacted_paths",
    "markers",
  ]) {
    const entry = value[key];
    count += Array.isArray(entry) ? entry.length : countRedactions(entry);
  }
  return count;
}

function mergeSafetyFacts(...facts: readonly SafetyFacts[]): SafetyFacts {
  let localOnly: boolean | undefined;
  let redacted: boolean | undefined;
  let durableWrites = false;
  let redactionCount = 0;
  let rawRetentionRiskCount = 0;

  for (const fact of facts) {
    if (fact.localOnly === false) {
      localOnly = false;
    } else if (fact.localOnly === true && localOnly !== false) {
      localOnly = true;
    }

    if (fact.redacted === false) {
      redacted = false;
    } else if (fact.redacted === true && redacted !== false) {
      redacted = true;
    }

    durableWrites ||= fact.durableWrites;
    redactionCount += fact.redactionCount;
    rawRetentionRiskCount += fact.rawRetentionRiskCount;
  }

  return {
    localOnly,
    redacted,
    durableWrites,
    redactionCount,
    rawRetentionRiskCount,
  };
}

function buildRecordRow(
  row: NormalizedSnapshotRow,
  fallbackTimestamp: string,
): WorkspaceSessionSnapshotRecordRow {
  const localOnlyKnown = row.localOnly !== undefined;
  const localOnly = row.localOnly === true;
  const redactedKnown = row.redacted !== undefined;
  const redacted = row.redacted === true;
  const rawRetentionRisk = row.rawRetentionRiskCount > 0;
  const status = rowStatus({
    localOnly,
    localOnlyKnown,
    redacted,
    redactedKnown,
    durableWrites: row.durableWrites,
    rawRetentionRisk,
  });
  const severity = severityForStatus(status);
  const createdAt = row.createdAt ?? fallbackTimestamp;
  const updatedAt = row.updatedAt ?? createdAt;
  const title = row.title ?? titleFromSnapshotId(row.snapshotId, row.source);
  const detailLabels = [
    row.source === "preview" ? "Preview only" : "Stored record",
    localOnlyKnown ? (localOnly ? "Local only" : "External source") : "Local-only unknown",
    redactedKnown ? (redacted ? "Redacted" : "Not redacted") : "Redaction unknown",
    row.durableWrites ? "Durable writes enabled" : "0 durable writes",
    "0 raw bodies retained",
    rawRetentionRisk
      ? formatCount(row.rawRetentionRiskCount, "raw retention flag")
      : "0 raw retention flags",
    formatCount(row.redactionCount, "redaction"),
    formatCount(row.eventCount, "event"),
    formatCount(row.auditRecordCount, "audit record"),
    row.workspaceId === undefined ? undefined : `Workspace ${row.workspaceId}`,
    row.sessionId === undefined ? undefined : `Session ${row.sessionId}`,
    row.snapshotFingerprint === undefined
      ? undefined
      : `Snapshot ${formatFingerprint(row.snapshotFingerprint)}`,
  ].filter(isDefined);

  return {
    id: `workspace_session_snapshot.row.${sanitizeIdentifier(
      row.snapshotId,
      "snapshot",
    )}`,
    source: row.source,
    snapshotId: row.snapshotId,
    title,
    label: row.label ?? row.snapshotId,
    createdAt,
    updatedAt,
    ...(row.workspaceId === undefined ? {} : { workspaceId: row.workspaceId }),
    ...(row.deviceId === undefined ? {} : { deviceId: row.deviceId }),
    ...(row.sessionId === undefined ? {} : { sessionId: row.sessionId }),
    ...(row.fingerprint === undefined ? {} : { fingerprint: row.fingerprint }),
    ...(row.snapshotFingerprint === undefined
      ? {}
      : { snapshotFingerprint: row.snapshotFingerprint }),
    operationLabels: [...row.operations],
    eventCount: row.eventCount,
    auditRecordCount: row.auditRecordCount,
    localOnly,
    localOnlyKnown,
    redacted,
    redactedKnown,
    redactionCount: row.redactionCount,
    durableWrites: row.durableWrites,
    rawBodyRetained: RAW_BODY_RETAINED,
    rawRetentionRisk,
    rawRetentionRiskCount: row.rawRetentionRiskCount,
    status,
    statusLabel: statusLabel(status),
    severity,
    severityLabel: severityLabel(severity),
    detailLabels,
    ariaLabel: [title, statusLabel(status), ...detailLabels].join(", "),
  };
}

function buildReadinessIndicators(
  rows: readonly WorkspaceSessionSnapshotRecordRow[],
): WorkspaceSessionSnapshotReadinessIndicator[] {
  const unknownLocalOnlyCount = rows.filter((row) => !row.localOnlyKnown).length;
  const externalCount = rows.filter(
    (row) => row.localOnlyKnown && !row.localOnly,
  ).length;
  const unknownRedactionCount = rows.filter((row) => !row.redactedKnown).length;
  const unredactedCount = rows.filter(
    (row) => row.redactedKnown && !row.redacted,
  ).length;
  const durableWriteCount = rows.filter((row) => row.durableWrites).length;
  const rawRetentionRiskCount = sum(
    rows,
    (row) => row.rawRetentionRiskCount,
  );

  return [
    buildReadinessIndicator({
      kind: "local_only",
      label: "Local-only snapshots",
      ready: rows.length > 0 && externalCount === 0 && unknownLocalOnlyCount === 0,
      status:
        rows.length === 0
          ? "empty"
          : externalCount > 0
            ? "blocked"
            : unknownLocalOnlyCount > 0
              ? "attention"
              : "ready",
      count: externalCount + unknownLocalOnlyCount,
      value:
        rows.length === 0
          ? "No snapshots"
          : externalCount === 0 && unknownLocalOnlyCount === 0
            ? "Local only"
            : "Review locality",
      detailLabels: [
        formatCount(rows.length, "snapshot"),
        formatCount(externalCount, "external snapshot"),
        formatCount(unknownLocalOnlyCount, "unknown local-only snapshot"),
      ],
    }),
    buildReadinessIndicator({
      kind: "redacted",
      label: "Redaction coverage",
      ready: rows.length > 0 && unredactedCount === 0 && unknownRedactionCount === 0,
      status:
        rows.length === 0
          ? "empty"
          : unredactedCount > 0
            ? "blocked"
            : unknownRedactionCount > 0
              ? "attention"
              : "ready",
      count: unredactedCount + unknownRedactionCount,
      value:
        rows.length === 0
          ? "No snapshots"
          : unredactedCount === 0 && unknownRedactionCount === 0
            ? "Redacted"
            : "Review redactions",
      detailLabels: [
        formatCount(rows.filter((row) => row.redacted).length, "redacted snapshot"),
        formatCount(unredactedCount, "unredacted snapshot"),
        formatCount(unknownRedactionCount, "unknown redaction snapshot"),
      ],
    }),
    buildReadinessIndicator({
      kind: "durable_writes",
      label: "Durable writes",
      ready: durableWriteCount === 0,
      status:
        rows.length === 0 ? "empty" : durableWriteCount > 0 ? "blocked" : "ready",
      count: durableWriteCount,
      value: durableWriteCount > 0 ? "Writes detected" : "0 durable writes",
      detailLabels: [
        formatCount(durableWriteCount, "durable write"),
        "Snapshot UI state is derived only",
      ],
    }),
    buildReadinessIndicator({
      kind: "raw_retention",
      label: "Raw body retention",
      ready: rawRetentionRiskCount === 0,
      status:
        rows.length === 0
          ? "empty"
          : rawRetentionRiskCount > 0
            ? "blocked"
            : "ready",
      count: rawRetentionRiskCount,
      value:
        rawRetentionRiskCount > 0
          ? formatCount(rawRetentionRiskCount, "risk")
          : "Not retained",
      detailLabels: [
        "0 raw bodies retained",
        formatCount(rawRetentionRiskCount, "raw retention flag"),
      ],
    }),
  ];
}

function buildReadinessIndicator(input: {
  kind: WorkspaceSessionSnapshotReadinessKind;
  label: string;
  value: string;
  ready: boolean;
  status: WorkspaceSessionSnapshotStatus;
  count: number;
  detailLabels: string[];
}): WorkspaceSessionSnapshotReadinessIndicator {
  const severity = severityForStatus(input.status);
  return {
    id: `workspace_session_snapshot.readiness.${input.kind}`,
    kind: input.kind,
    label: input.label,
    value: input.value,
    ready: input.ready,
    status: input.status,
    statusLabel: statusLabel(input.status),
    severity,
    severityLabel: severityLabel(severity),
    count: input.count,
    detailLabels: [...input.detailLabels],
    ariaLabel: [
      input.label,
      input.value,
      statusLabel(input.status),
      ...input.detailLabels,
    ].join(", "),
  };
}

function buildSummaryCards(input: {
  rows: readonly WorkspaceSessionSnapshotRecordRow[];
  readinessIndicators: readonly WorkspaceSessionSnapshotReadinessIndicator[];
  pagination?: WorkspaceSessionSnapshotPagination;
  redactionCount: number;
  rawRetentionRiskCount: number;
}): WorkspaceSessionSnapshotSummaryCard[] {
  const recordsStatus = rowsStatus(input.rows);
  const readinessStatus = rowsStatus(input.readinessIndicators);
  return [
    buildSummaryCard({
      id: "records",
      label: "Snapshot records",
      value: formatCount(input.rows.length, "snapshot"),
      status: recordsStatus,
      detailLabels: [
        formatCount(input.rows.length, "snapshot"),
        input.pagination === undefined ? undefined : input.pagination.label,
      ].filter(isDefined),
    }),
    buildSummaryCard({
      id: "readiness",
      label: "Persistence readiness",
      value:
        readinessStatus === "ready"
          ? "Ready"
          : readinessStatus === "empty"
            ? "No snapshots"
            : "Review needed",
      status: readinessStatus,
      detailLabels: input.readinessIndicators.map(
        (indicator) => `${indicator.label}: ${indicator.value}`,
      ),
    }),
    buildSummaryCard({
      id: "redactions",
      label: "Redactions",
      value:
        input.rows.length === 0
          ? "No snapshots"
          : formatCount(input.redactionCount, "redaction"),
      status: input.rows.some((row) => !row.redacted)
        ? "blocked"
        : input.rows.length === 0
          ? "empty"
          : input.redactionCount > 0
            ? "attention"
            : "ready",
      detailLabels: [
        formatCount(input.rows.filter((row) => row.redacted).length, "redacted snapshot"),
        formatCount(input.redactionCount, "redaction"),
      ],
    }),
    buildSummaryCard({
      id: "retention",
      label: "Raw body retention",
      value:
        input.rawRetentionRiskCount > 0
          ? formatCount(input.rawRetentionRiskCount, "risk")
          : "Not retained",
      status: input.rawRetentionRiskCount > 0 ? "blocked" : "ready",
      detailLabels: [
        "0 raw bodies retained",
        formatCount(input.rawRetentionRiskCount, "raw retention flag"),
      ],
    }),
  ];
}

function buildSummaryCard(input: {
  id: string;
  label: string;
  value: string;
  status: WorkspaceSessionSnapshotStatus;
  detailLabels: string[];
}): WorkspaceSessionSnapshotSummaryCard {
  const severity = severityForStatus(input.status);
  return {
    id: `workspace_session_snapshot.summary.${input.id}`,
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

function normalizePagination(
  pagination: AnyRecord | undefined,
): WorkspaceSessionSnapshotPagination | undefined {
  if (pagination === undefined) {
    return undefined;
  }

  const offset = nonNegativeIntegerField(pagination, "offset") ?? 0;
  const limit = nonNegativeIntegerField(pagination, "limit") ?? 0;
  const totalRecordCount =
    nonNegativeIntegerField(pagination, "totalRecordCount", "total_record_count") ??
    0;
  const matchedRecordCount =
    nonNegativeIntegerField(
      pagination,
      "matchedRecordCount",
      "matched_record_count",
    ) ?? totalRecordCount;
  const returnedRecordCount =
    nonNegativeIntegerField(
      pagination,
      "returnedRecordCount",
      "returned_record_count",
    ) ?? 0;
  const hasMore = booleanField(pagination, "hasMore", "has_more") ?? false;
  const label = `${formatCount(returnedRecordCount, "returned snapshot")} of ${formatCount(
    matchedRecordCount,
    "matched snapshot",
  )}`;

  return {
    offset,
    limit,
    totalRecordCount,
    matchedRecordCount,
    returnedRecordCount,
    hasMore,
    label,
    ariaLabel: [
      "Snapshot pagination",
      label,
      `Offset ${offset}`,
      `Limit ${limit}`,
      hasMore ? "More snapshots available" : "No more snapshots",
    ].join(", "),
  };
}

function resolvePhase(
  rows: readonly WorkspaceSessionSnapshotRecordRow[],
  errors: readonly WorkspaceSessionSnapshotErrorState[],
): WorkspaceSessionSnapshotPhase {
  if (errors.length > 0) {
    return "error";
  }
  if (rows.length === 0) {
    return "empty";
  }
  return "success";
}

function resolveStatus(input: {
  phase: WorkspaceSessionSnapshotPhase;
  rows: readonly WorkspaceSessionSnapshotRecordRow[];
  readinessIndicators: readonly WorkspaceSessionSnapshotReadinessIndicator[];
}): WorkspaceSessionSnapshotStatus {
  if (input.phase === "loading") {
    return "loading";
  }
  if (input.phase === "error" || input.rows.some((row) => row.status === "error")) {
    return "error";
  }
  if (input.phase === "empty") {
    return "empty";
  }
  if (
    input.rows.some((row) => row.status === "blocked") ||
    input.readinessIndicators.some((indicator) => indicator.status === "blocked")
  ) {
    return "blocked";
  }
  if (
    input.rows.some((row) => row.status === "attention") ||
    input.readinessIndicators.some((indicator) => indicator.status === "attention")
  ) {
    return "attention";
  }
  return "ready";
}

function rowStatus(input: {
  localOnly: boolean;
  localOnlyKnown: boolean;
  redacted: boolean;
  redactedKnown: boolean;
  durableWrites: boolean;
  rawRetentionRisk: boolean;
}): WorkspaceSessionSnapshotStatus {
  if (
    input.localOnlyKnown &&
    !input.localOnly ||
    input.redactedKnown &&
    !input.redacted ||
    input.durableWrites ||
    input.rawRetentionRisk
  ) {
    return "blocked";
  }
  if (!input.localOnlyKnown || !input.redactedKnown) {
    return "attention";
  }
  return "ready";
}

function rowsStatus(
  rows: readonly { status: WorkspaceSessionSnapshotStatus }[],
): WorkspaceSessionSnapshotStatus {
  if (rows.length === 0) {
    return "empty";
  }
  if (rows.some((row) => row.status === "error")) {
    return "error";
  }
  if (rows.some((row) => row.status === "blocked")) {
    return "blocked";
  }
  if (rows.some((row) => row.status === "attention")) {
    return "attention";
  }
  if (rows.some((row) => row.status === "loading")) {
    return "loading";
  }
  return "ready";
}

function collectErrorStates(
  root: unknown,
  call: WorkspaceSessionSnapshotCall,
): WorkspaceSessionSnapshotErrorState[] {
  const errors: WorkspaceSessionSnapshotErrorState[] = [];

  if (root !== undefined && !isRecord(root) && !Array.isArray(root)) {
    errors.push(
      buildWorkspaceSessionSnapshotErrorState(
        call,
        "Workspace session snapshot response must be an object or array.",
      ),
    );
  }

  const rootRecord = isRecord(root) ? root : undefined;
  const rootError = errorMessage(rootRecord?.error);
  if (rootError !== undefined) {
    errors.push(buildWorkspaceSessionSnapshotErrorState(call, rootError));
  }
  for (const error of arrayField(rootRecord, "errors")) {
    errors.push(buildWorkspaceSessionSnapshotErrorState(call, error));
  }
  return errors;
}

function isSnapshotResponseLike(value: AnyRecord): boolean {
  return (
    isSnapshotPreviewLike(value) ||
    isSnapshotRecordLike(value) ||
    Array.isArray(value.records) ||
    recordField(value, "record") !== undefined
  );
}

function isSnapshotPreviewLike(value: unknown): value is AnyRecord {
  if (!isRecord(value)) {
    return false;
  }
  const kind = stringField(value, "kind");
  return (
    kind === "workspace-session.snapshot-preview" ||
    stringField(value, "schemaVersion", "schema_version") ===
      SNAPSHOT_STORE_SCHEMA_VERSION &&
      recordField(value, "summary") !== undefined &&
      recordField(value, "auditPreview", "audit_preview") !== undefined
  );
}

function isSnapshotRecordLike(value: unknown): value is AnyRecord {
  if (!isRecord(value)) {
    return false;
  }
  const kind = stringField(value, "kind");
  return (
    kind === "workspace-session.snapshot-record" ||
    stringField(value, "snapshotId", "snapshot_id") !== undefined &&
      (stringField(value, "snapshotFingerprint", "snapshot_fingerprint") !==
        undefined ||
        recordField(value, "snapshot") !== undefined ||
        stringField(value, "workspaceId", "workspace_id") !== undefined)
  );
}

function isFullSnapshotRecord(value: unknown): value is AnyRecord {
  if (!isRecord(value)) {
    return false;
  }
  return (
    stringField(value, "kind") === "workspace-session.snapshot-record" ||
    recordField(value, "snapshot", "preview", "snapshotPreview", "snapshot_preview") !==
      undefined
  );
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

function hasDurableWrites(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(hasDurableWrites);
  }
  if (!isRecord(value)) {
    return false;
  }
  const direct = booleanField(value, "durableWrites", "durable_writes");
  if (direct === true) {
    return true;
  }
  return Object.entries(value).some(([key, entry]) => {
    const token = normalizeToken(key);
    return token === "durable_writes" ? false : hasDurableWrites(entry);
  });
}

function countRedactions(value: unknown): number {
  if (value === undefined || value === null) {
    return 0;
  }
  if (typeof value === "string") {
    return countRedactionMarkers(value);
  }
  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + countRedactions(item), 0);
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

function countRawRetentionRisks(value: unknown, keyHint = ""): number {
  if (value === undefined || value === null) {
    return 0;
  }
  if (typeof value === "string") {
    return isUnsafeRawValue(value, keyHint) ? 1 : 0;
  }
  if (Array.isArray(value)) {
    return value.reduce(
      (total, item) => total + countRawRetentionRisks(item, keyHint),
      0,
    );
  }
  if (!isRecord(value)) {
    return 0;
  }

  let count = 0;
  for (const [key, entry] of Object.entries(value)) {
    const token = normalizeToken(key);
    if (isRawRetentionFlag(token, entry)) {
      count += 1;
      continue;
    }
    if (
      token === "request_body" ||
      token === "response_body" ||
      token === "raw_body" ||
      token === "raw_request_body" ||
      token === "raw_response_body"
    ) {
      count += 1;
      continue;
    }
    count += countRawRetentionRisks(entry, key);
  }
  return count;
}

function isRawRetentionFlag(key: string, value: unknown): boolean {
  if (value === true) {
    return (
      key === "raw_body_stored" ||
      key === "raw_body_retained" ||
      key === "raw_request_body_stored" ||
      key === "raw_response_body_stored" ||
      key === "raw_paths_stored" ||
      key === "raw_storage_paths_stored" ||
      key === "raw_lock_material_stored" ||
      key === "raw_secrets_stored" ||
      key === "stores_raw_body"
    );
  }

  return (
    value === false &&
    (key === "storage_path_redacted" ||
      key === "storage_paths_redacted" ||
      key === "lock_material_redacted" ||
      key === "body_redacted")
  );
}

function isUnsafeRawValue(value: string, keyHint: string): boolean {
  if (isRedactedToken(value)) {
    return false;
  }
  if (normalizeToken(keyHint).includes("fingerprint")) {
    return false;
  }
  return (
    SECRET_KEY_PATTERN.test(keyHint) ||
    SECRET_VALUE_PATTERN.test(value) ||
    ABSOLUTE_PATH_PATTERN.test(value)
  );
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

function countRedactionMarkers(value: string): number {
  const matches = value.match(/\[(?:redacted[^\]]*|REDACTED)\]/gi);
  return matches === null ? 0 : matches.length;
}

function redactSensitiveValue(
  value: unknown,
  key = "",
  seen = new WeakMap<object, unknown>(),
): unknown {
  if (value === null || typeof value !== "object") {
    return typeof value === "string"
      ? redactWorkspaceSessionSnapshotDisplayValue(value, key)
      : value;
  }
  if (SECRET_KEY_PATTERN.test(key)) {
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

function statusLabel(status: WorkspaceSessionSnapshotStatus): string {
  switch (status) {
    case "loading":
      return "Loading";
    case "empty":
      return "No snapshots";
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
  status: WorkspaceSessionSnapshotStatus,
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

function buildHeadline(
  call: WorkspaceSessionSnapshotCall,
  status: WorkspaceSessionSnapshotStatus,
): string {
  const subject = {
    preview: "Workspace session snapshot preview",
    create: "Created workspace session snapshot",
    list: "Workspace session snapshots",
    get: "Workspace session snapshot",
  }[call];

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

function errorLabel(context: WorkspaceSessionSnapshotContext): string {
  switch (context) {
    case "preview":
      return "Workspace session snapshot preview could not load";
    case "create":
      return "Workspace session snapshot could not be created";
    case "list":
      return "Workspace session snapshots could not load";
    case "get":
      return "Workspace session snapshot could not load";
    case "records":
      return "Workspace session snapshot records could not load";
    case "readiness":
      return "Workspace session snapshot readiness could not load";
    case "redactions":
      return "Workspace session snapshot redactions could not load";
    case "retention":
      return "Workspace session snapshot retention could not load";
  }
}

function retryLabel(context: WorkspaceSessionSnapshotContext): string {
  switch (context) {
    case "preview":
      return "Retry preview";
    case "create":
      return "Retry create";
    case "list":
      return "Retry snapshots";
    case "get":
      return "Retry snapshot";
    case "records":
      return "Retry records";
    case "readiness":
      return "Retry readiness";
    case "redactions":
      return "Retry redactions";
    case "retention":
      return "Retry retention";
  }
}

function titleFromSnapshotId(
  snapshotId: string,
  source: WorkspaceSessionSnapshotRowSource,
): string {
  if (source === "preview") {
    return "Snapshot preview";
  }
  return `Snapshot ${snapshotId}`;
}

function formatFingerprint(value: string): string {
  return value.startsWith("sha256:") && value.length > 19
    ? `${value.slice(0, 14)}...${value.slice(-6)}`
    : value;
}

function shortFingerprint(value: string | undefined, fallback: number): string {
  if (value === undefined) {
    return `snapshot_${fallback}`;
  }
  const suffix = value.replace(/^sha256:/, "").slice(0, 12);
  return sanitizeIdentifier(suffix, `snapshot_${fallback}`);
}

function compareNormalizedRows(
  left: NormalizedSnapshotRow,
  right: NormalizedSnapshotRow,
): number {
  return (
    (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "") ||
    (right.createdAt ?? "").localeCompare(left.createdAt ?? "") ||
    left.snapshotId.localeCompare(right.snapshotId)
  );
}

function dedupeErrorStates(
  errors: readonly WorkspaceSessionSnapshotErrorState[],
): WorkspaceSessionSnapshotErrorState[] {
  const seen = new Set<string>();
  const deduped: WorkspaceSessionSnapshotErrorState[] = [];
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

function safeOptionalString(
  value: string | undefined,
  keyHint?: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const redacted = redactWorkspaceSessionSnapshotDisplayValue(value, keyHint);
  return redacted === "Unavailable" ? undefined : redacted;
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

function cloneState(
  state: WorkspaceSessionSnapshotState,
): WorkspaceSessionSnapshotState {
  return {
    ...state,
    summaryCards: state.summaryCards.map(cloneSummaryCard),
    recordRows: state.recordRows.map(cloneRecordRow),
    readinessIndicators: state.readinessIndicators.map(cloneReadinessIndicator),
    ...(state.pagination === undefined
      ? {}
      : { pagination: clonePagination(state.pagination) }),
    emptyStates: {
      records: { ...state.emptyStates.records },
      readiness: { ...state.emptyStates.readiness },
      errors: { ...state.emptyStates.errors },
    },
    errorStates: state.errorStates.map(cloneErrorState),
  };
}

function cloneSummaryCard(
  card: WorkspaceSessionSnapshotSummaryCard,
): WorkspaceSessionSnapshotSummaryCard {
  return {
    ...card,
    detailLabels: [...card.detailLabels],
  };
}

function cloneRecordRow(
  row: WorkspaceSessionSnapshotRecordRow,
): WorkspaceSessionSnapshotRecordRow {
  return {
    ...row,
    operationLabels: [...row.operationLabels],
    detailLabels: [...row.detailLabels],
  };
}

function cloneReadinessIndicator(
  indicator: WorkspaceSessionSnapshotReadinessIndicator,
): WorkspaceSessionSnapshotReadinessIndicator {
  return {
    ...indicator,
    detailLabels: [...indicator.detailLabels],
  };
}

function clonePagination(
  pagination: WorkspaceSessionSnapshotPagination,
): WorkspaceSessionSnapshotPagination {
  return { ...pagination };
}

function cloneErrorState(
  error: WorkspaceSessionSnapshotErrorState,
): WorkspaceSessionSnapshotErrorState {
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
