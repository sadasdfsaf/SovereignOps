import type {
  McpApprovalEvidenceActionIntent,
} from "./mcpApprovalEvidenceApiState.ts";

export type McpApprovalEvidenceRecordCall =
  | "create"
  | "list"
  | "get"
  | "compare";

export type McpApprovalEvidenceRecordPhase =
  | "loading"
  | "success"
  | "empty"
  | "error";

export type McpApprovalEvidenceRecordStatus =
  | "loading"
  | "empty"
  | "ready"
  | "attention"
  | "error"
  | "complete";

export type McpApprovalEvidenceRecordContext =
  | "create"
  | "list"
  | "get"
  | "compare"
  | "records"
  | "fingerprints"
  | "evidence"
  | "redactions"
  | "actions";

export type McpApprovalEvidencePolicyDecision =
  | "allow"
  | "require_approval"
  | "deny"
  | "unknown";

export type McpApprovalEvidencePersistedStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "unknown";

export type McpApprovalEvidenceDriftKind =
  | "matched"
  | "drifted"
  | "missing_stored"
  | "missing_current";

export type McpApprovalEvidenceHealthKind =
  | "stored_record"
  | "session_refs"
  | "audit_event_refs"
  | "staleness"
  | "redaction_summary";

export interface BuildMcpApprovalEvidenceRecordStateOptions {
  call?: McpApprovalEvidenceRecordCall;
  defaultTimestamp?: string;
  error?: unknown;
  loading?: boolean;
  now?: string;
  staleAfterMs?: number;
  expectedFingerprint?: string;
  expectedRecord?: unknown;
  currentRecord?: unknown;
  baselineRecord?: unknown;
}

export interface McpApprovalEvidenceRecordState {
  id: "mcp_approval_evidence_record";
  call: McpApprovalEvidenceRecordCall;
  phase: McpApprovalEvidenceRecordPhase;
  generatedAt: string;
  status: McpApprovalEvidenceRecordStatus;
  statusLabel: string;
  headline: string;
  isEmpty: boolean;
  selectedRecordId?: string;
  summaryCards: McpApprovalEvidenceRecordSummaryCard[];
  recordRows: McpApprovalEvidenceStoredRecordRow[];
  fingerprintDriftRows: McpApprovalEvidenceFingerprintDriftRow[];
  evidenceHealthRows: McpApprovalEvidenceHealthRow[];
  redactionStatusRows: McpApprovalEvidenceRedactionStatusRow[];
  recommendedActions: McpApprovalEvidenceRecordRecommendedAction[];
  emptyStates: McpApprovalEvidenceRecordEmptyStates;
  errorStates: McpApprovalEvidenceRecordErrorState[];
}

export interface McpApprovalEvidenceRecordSummaryCard {
  id: string;
  title: string;
  valueLabel: string;
  status: McpApprovalEvidenceRecordStatus;
  statusLabel: string;
  detailLabels: string[];
  actionId?: string;
  ariaLabel: string;
}

export interface McpApprovalEvidenceStoredRecordRow {
  id: string;
  recordId: string;
  workspaceId?: string;
  generatedAt: string;
  policyDecision: McpApprovalEvidencePolicyDecision;
  policyDecisionLabel: string;
  approvalStatus: McpApprovalEvidencePersistedStatus;
  approvalStatusLabel: string;
  status: McpApprovalEvidenceRecordStatus;
  statusLabel: string;
  fingerprint?: string;
  sessionCount: number;
  auditEventCount: number;
  redactedFieldCount?: number;
  retainedMetadataKeys: string[];
  metadataLabels: string[];
  detailLabels: string[];
  ariaLabel: string;
}

export interface McpApprovalEvidenceFingerprintDriftRow {
  id: string;
  driftId: string;
  label: string;
  kind: McpApprovalEvidenceDriftKind;
  status: McpApprovalEvidenceRecordStatus;
  statusLabel: string;
  storedRecordId?: string;
  currentRecordId?: string;
  storedFingerprint?: string;
  currentFingerprint?: string;
  detailLabels: string[];
  ariaLabel: string;
}

export interface McpApprovalEvidenceHealthRow {
  id: string;
  healthId: string;
  recordId?: string;
  kind: McpApprovalEvidenceHealthKind;
  label: string;
  value: string;
  status: McpApprovalEvidenceRecordStatus;
  statusLabel: string;
  detailLabels: string[];
  ariaLabel: string;
}

export interface McpApprovalEvidenceRedactionStatusRow {
  id: string;
  recordId: string;
  label: string;
  status: McpApprovalEvidenceRecordStatus;
  statusLabel: string;
  redacted: boolean;
  redactedFieldCount: number;
  redactedPaths: string[];
  retainedMetadataKeys: string[];
  unsafeMetadataKeys: string[];
  detailLabels: string[];
  ariaLabel: string;
}

export interface McpApprovalEvidenceRecordRecommendedAction {
  id: string;
  label: string;
  intent: McpApprovalEvidenceActionIntent;
  enabled: boolean;
  section?: McpApprovalEvidenceRecordContext;
  targetId?: string;
  disabledReason?: string;
  ariaLabel: string;
}

export interface McpApprovalEvidenceRecordEmptyStates {
  records: McpApprovalEvidenceRecordEmptyState;
  fingerprints: McpApprovalEvidenceRecordEmptyState;
  evidence: McpApprovalEvidenceRecordEmptyState;
  redactions: McpApprovalEvidenceRecordEmptyState;
  actions: McpApprovalEvidenceRecordEmptyState;
}

export interface McpApprovalEvidenceRecordEmptyState {
  id: string;
  label: string;
  description: string;
  ariaLabel: string;
  actionLabel?: string;
}

export interface McpApprovalEvidenceRecordErrorState {
  id: string;
  context: McpApprovalEvidenceRecordContext;
  errorState: {
    id: string;
    label: string;
    description: string;
    ariaLabel: string;
    retryLabel: string;
  };
}

type AnyRecord = Record<string, unknown>;

interface NormalizedRecord {
  root: AnyRecord;
  recordId: string;
  displayRecordId: string;
  workspaceId?: string;
  generatedAt: string;
  policyDecision: McpApprovalEvidencePolicyDecision;
  approvalStatus: McpApprovalEvidencePersistedStatus;
  fingerprint?: string;
  sessionRefs: AnyRecord[];
  auditEventRefs: AnyRecord[];
  redactionSummary?: AnyRecord;
  metadata?: AnyRecord;
}

interface NormalizedInput {
  call: McpApprovalEvidenceRecordCall;
  generatedAt: string;
  records: NormalizedRecord[];
  compareLeft?: AnyRecord;
  compareRight?: AnyRecord;
  errorStates: McpApprovalEvidenceRecordErrorState[];
}

interface FingerprintFact {
  key: string;
  label: string;
  fingerprint?: string;
  recordId?: string;
}

interface FingerprintPair {
  key: string;
  label: string;
  storedRecordId?: string;
  currentRecordId?: string;
  storedFingerprint?: string;
  currentFingerprint?: string;
}

const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const DEFAULT_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const REDACTED = "[REDACTED]";
const SECRET_KEY_PATTERN =
  /(?:api[-_]?key|authorization|bearer|credential|password|secret|token)/i;
const SECRET_VALUE_PATTERN =
  /(?:bearer\s+[a-z0-9._-]+|sk_[a-z0-9._-]+|ghp_[a-z0-9]+|glpat-[a-z0-9_-]+|xox[baprs]-[a-z0-9-]+|[a-z0-9_=-]{24,})/i;

export function buildMcpApprovalEvidenceRecordState(
  input: unknown,
  options: BuildMcpApprovalEvidenceRecordStateOptions = {},
): McpApprovalEvidenceRecordState {
  if (options.loading === true) {
    return buildMcpApprovalEvidenceRecordLoadingState(options);
  }

  const normalized = normalizeInput(input, options);
  const recordRows = buildRowsFromNormalizedRecords(normalized.records);
  const fingerprintDriftRows = buildFingerprintRowsFromInput(
    normalized,
    options,
  );
  const evidenceHealthRows = buildHealthRowsFromRecords(
    normalized.records,
    options,
  );
  const redactionStatusRows = buildRedactionRowsFromRecords(normalized.records);
  const phase = resolvePhase(normalized.records, normalized.errorStates);
  const status = resolveStateStatus({
    phase,
    recordRows,
    fingerprintDriftRows,
    evidenceHealthRows,
    redactionStatusRows,
  });
  const summaryCards = buildSummaryCards({
    status,
    records: recordRows,
    driftRows: fingerprintDriftRows,
    healthRows: evidenceHealthRows,
    redactionRows: redactionStatusRows,
  });
  const recommendedActions = buildRecommendedActions({
    call: normalized.call,
    phase,
    status,
    records: recordRows,
    driftRows: fingerprintDriftRows,
    healthRows: evidenceHealthRows,
    redactionRows: redactionStatusRows,
    errors: normalized.errorStates,
  });

  return cloneState({
    id: "mcp_approval_evidence_record",
    call: normalized.call,
    phase,
    generatedAt: normalized.generatedAt,
    status,
    statusLabel: statusLabel(status),
    headline: buildHeadline(normalized.call, status),
    isEmpty: phase === "empty",
    selectedRecordId: recordRows.length === 1 ? recordRows[0].recordId : undefined,
    summaryCards,
    recordRows,
    fingerprintDriftRows,
    evidenceHealthRows,
    redactionStatusRows,
    recommendedActions,
    emptyStates: buildMcpApprovalEvidenceRecordEmptyStates(),
    errorStates: normalized.errorStates.map(cloneErrorState),
  });
}

export function buildMcpApprovalEvidenceRecordLoadingState(
  options: Pick<
    BuildMcpApprovalEvidenceRecordStateOptions,
    "call" | "defaultTimestamp"
  > = {},
): McpApprovalEvidenceRecordState {
  const call = options.call ?? "list";
  const generatedAt = normalizeTimestamp(undefined, options.defaultTimestamp);
  const status: McpApprovalEvidenceRecordStatus = "loading";

  return cloneState({
    id: "mcp_approval_evidence_record",
    call,
    phase: "loading",
    generatedAt,
    status,
    statusLabel: statusLabel(status),
    headline: buildHeadline(call, status),
    isEmpty: false,
    summaryCards: [
      {
        id: "mcp_approval_evidence_record_summary.loading",
        title: "Stored records",
        valueLabel: "Loading",
        status,
        statusLabel: statusLabel(status),
        detailLabels: ["Waiting for persisted approval evidence records."],
        actionId: "retry_records",
        ariaLabel: "Stored records, Loading",
      },
    ],
    recordRows: [],
    fingerprintDriftRows: [],
    evidenceHealthRows: [],
    redactionStatusRows: [],
    recommendedActions: [
      {
        id: "retry_records",
        label: retryLabel(call),
        intent: "secondary",
        enabled: false,
        section: call,
        disabledReason: "Records are still loading.",
        ariaLabel: `${retryLabel(call)}, disabled`,
      },
    ],
    emptyStates: buildMcpApprovalEvidenceRecordEmptyStates(),
    errorStates: [],
  });
}

export function buildMcpApprovalEvidenceStoredRecordRows(
  input: unknown,
  options: BuildMcpApprovalEvidenceRecordStateOptions = {},
): McpApprovalEvidenceStoredRecordRow[] {
  return buildRowsFromNormalizedRecords(
    normalizeInput(input, options).records,
  ).map(cloneRecordRow);
}

export function buildMcpApprovalEvidenceRecordSummaryCards(
  input: unknown,
  options: BuildMcpApprovalEvidenceRecordStateOptions = {},
): McpApprovalEvidenceRecordSummaryCard[] {
  return buildMcpApprovalEvidenceRecordState(input, options).summaryCards.map(
    cloneSummaryCard,
  );
}

export function buildMcpApprovalEvidenceFingerprintDriftRows(
  input: unknown,
  options: BuildMcpApprovalEvidenceRecordStateOptions = {},
): McpApprovalEvidenceFingerprintDriftRow[] {
  const normalized = normalizeInput(input, options);
  return buildFingerprintRowsFromInput(normalized, options).map(
    cloneFingerprintRow,
  );
}

export function buildMcpApprovalEvidenceHealthRows(
  input: unknown,
  options: BuildMcpApprovalEvidenceRecordStateOptions = {},
): McpApprovalEvidenceHealthRow[] {
  return buildHealthRowsFromRecords(
    normalizeInput(input, options).records,
    options,
  ).map(cloneHealthRow);
}

export function buildMcpApprovalEvidenceRedactionStatusRows(
  input: unknown,
  options: BuildMcpApprovalEvidenceRecordStateOptions = {},
): McpApprovalEvidenceRedactionStatusRow[] {
  return buildRedactionRowsFromRecords(
    normalizeInput(input, options).records,
  ).map(cloneRedactionRow);
}

export function buildMcpApprovalEvidenceRecordRecommendedActions(
  input: unknown,
  options: BuildMcpApprovalEvidenceRecordStateOptions = {},
): McpApprovalEvidenceRecordRecommendedAction[] {
  return buildMcpApprovalEvidenceRecordState(input, options)
    .recommendedActions.map(cloneAction);
}

export function buildMcpApprovalEvidenceRecordEmptyStates(): McpApprovalEvidenceRecordEmptyStates {
  return {
    records: buildMcpApprovalEvidenceRecordEmptyState("records"),
    fingerprints: buildMcpApprovalEvidenceRecordEmptyState("fingerprints"),
    evidence: buildMcpApprovalEvidenceRecordEmptyState("evidence"),
    redactions: buildMcpApprovalEvidenceRecordEmptyState("redactions"),
    actions: buildMcpApprovalEvidenceRecordEmptyState("actions"),
  };
}

export function buildMcpApprovalEvidenceRecordEmptyState(
  context: Exclude<
    McpApprovalEvidenceRecordContext,
    "create" | "list" | "get" | "compare"
  >,
): McpApprovalEvidenceRecordEmptyState {
  switch (context) {
    case "records":
      return {
        id: "mcp_approval_evidence_records_empty",
        label: "No stored records",
        description: "Persisted approval evidence records will appear after a create, list, or get call returns data.",
        ariaLabel: "No persisted MCP approval evidence records are available",
        actionLabel: "Refresh records",
      };
    case "fingerprints":
      return {
        id: "mcp_approval_evidence_fingerprints_empty",
        label: "No fingerprint drift",
        description: "Fingerprint comparison rows will appear when stored and current evidence are compared.",
        ariaLabel: "No MCP approval evidence fingerprint drift rows are available",
      };
    case "evidence":
      return {
        id: "mcp_approval_evidence_record_health_empty",
        label: "No evidence health issues",
        description: "Missing or stale evidence rows will appear when records need attention.",
        ariaLabel: "No MCP approval evidence health issues are available",
      };
    case "redactions":
      return {
        id: "mcp_approval_evidence_record_redactions_empty",
        label: "No redaction status",
        description: "Redaction status rows will appear when stored records include redaction summaries.",
        ariaLabel: "No MCP approval evidence redaction status rows are available",
      };
    case "actions":
      return {
        id: "mcp_approval_evidence_record_actions_empty",
        label: "No recommended actions",
        description: "Recommended record actions will appear after persisted evidence records are loaded.",
        ariaLabel: "No MCP approval evidence record actions are available",
      };
  }
}

export function buildMcpApprovalEvidenceRecordErrorStates(
  input: unknown,
  options: BuildMcpApprovalEvidenceRecordStateOptions = {},
): McpApprovalEvidenceRecordErrorState[] {
  return normalizeInput(input, options).errorStates.map(cloneErrorState);
}

export function buildMcpApprovalEvidenceRecordErrorState(
  context: McpApprovalEvidenceRecordContext,
  error: unknown,
): McpApprovalEvidenceRecordErrorState {
  const description = errorMessage(error) ?? defaultErrorDescription(context);
  const id = `mcp_approval_evidence_record_${context}_error`;

  return {
    id,
    context,
    errorState: {
      id,
      label: errorLabel(context),
      description,
      ariaLabel: errorLabel(context),
      retryLabel: retryLabel(context),
    },
  };
}

export function redactMcpApprovalEvidenceRecordDisplayValue(
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

  const text =
    typeof value === "string"
      ? value.trim()
      : JSON.stringify(value) ?? String(value);
  if (text === "") {
    return "Unavailable";
  }
  if (text === REDACTED) {
    return REDACTED;
  }
  if (keyHint === "fingerprint") {
    return text;
  }
  if (
    (keyHint !== undefined && SECRET_KEY_PATTERN.test(keyHint)) ||
    ((keyHint === "metadataKey" || keyHint === "path") &&
      SECRET_KEY_PATTERN.test(text)) ||
    SECRET_VALUE_PATTERN.test(text)
  ) {
    return REDACTED;
  }
  return text;
}

function normalizeInput(
  input: unknown,
  options: BuildMcpApprovalEvidenceRecordStateOptions,
): NormalizedInput {
  const root = clonePlain(input);
  const rootRecord = isRecord(root) ? root : undefined;
  const generatedAt = normalizeTimestamp(
    timestampField(rootRecord, "generatedAt", "generated_at", "createdAt", "created_at"),
    options.defaultTimestamp,
  );
  const call = options.call ?? inferCall(root);
  const errorStates = collectErrorStates(rootRecord, call);

  if (options.error !== undefined) {
    errorStates.push(buildMcpApprovalEvidenceRecordErrorState(call, options.error));
  }

  const records = collectRecordInputs(root)
    .map((record, index) => normalizeRecord(record, index, generatedAt))
    .filter(isDefined)
    .sort(compareRecords);
  const comparisonSource = recordField(rootRecord, "comparison", "compare");
  const compareLeft =
    recordField(rootRecord, "baselineRecord", "baseline_record", "baseline", "storedRecord", "stored_record", "stored", "expectedRecord", "expected_record", "expected", "left", "before", "original") ??
    recordField(comparisonSource, "baselineRecord", "baseline_record", "baseline", "storedRecord", "stored_record", "stored", "expectedRecord", "expected_record", "expected", "left", "before", "original") ??
    normalizeOptionRecord(options.baselineRecord ?? options.expectedRecord);
  const compareRight =
    recordField(rootRecord, "currentRecord", "current_record", "current", "candidateRecord", "candidate_record", "candidate", "actualRecord", "actual_record", "actual", "right", "after", "preview") ??
    recordField(comparisonSource, "currentRecord", "current_record", "current", "candidateRecord", "candidate_record", "candidate", "actualRecord", "actual_record", "actual", "right", "after", "preview") ??
    normalizeOptionRecord(options.currentRecord);

  return {
    call,
    generatedAt,
    records,
    compareLeft,
    compareRight,
    errorStates: dedupeErrors(errorStates),
  };
}

function inferCall(input: unknown): McpApprovalEvidenceRecordCall {
  if (Array.isArray(input)) {
    return "list";
  }
  if (!isRecord(input)) {
    return "list";
  }

  const explicit = normalizeToken(stringField(input, "call", "operation", "action", "type"));
  if (explicit === "create" || explicit === "created") {
    return "create";
  }
  if (explicit === "get" || explicit === "read" || explicit === "retrieve") {
    return "get";
  }
  if (explicit === "compare" || explicit === "comparison") {
    return "compare";
  }
  if (explicit === "list" || explicit === "search") {
    return "list";
  }
  if (
    recordField(input, "comparison", "compare") !== undefined ||
    recordField(input, "baseline", "current", "candidate", "actual", "expected") !== undefined
  ) {
    return "compare";
  }
  if (recordField(input, "createdRecord", "created_record") !== undefined) {
    return "create";
  }
  if (recordField(input, "record", "evidenceRecord", "evidence_record") !== undefined) {
    return "get";
  }
  return isPersistedRecordLike(input) ? "get" : "list";
}

function collectRecordInputs(input: unknown): AnyRecord[] {
  if (Array.isArray(input)) {
    return input.filter(isRecord);
  }
  if (!isRecord(input)) {
    return [];
  }

  const arrays = [
    arrayField(input, "records", "evidenceRecords", "evidence_records", "items"),
    arrayField(recordField(input, "response", "body", "result"), "records", "evidenceRecords", "evidence_records", "items"),
  ].flat();
  if (arrays.length > 0) {
    return arrays.filter(isRecord);
  }

  const direct =
    recordField(input, "createdRecord", "created_record", "record", "evidenceRecord", "evidence_record", "storedRecord", "stored_record") ??
    recordField(recordField(input, "response", "body", "result"), "record", "createdRecord", "created_record", "evidenceRecord", "evidence_record");
  if (direct !== undefined) {
    return [direct];
  }

  if (isPersistedRecordLike(input)) {
    return [input];
  }
  return [];
}

function normalizeRecord(
  input: AnyRecord,
  index: number,
  fallbackTimestamp: string,
): NormalizedRecord | undefined {
  if (!isPersistedRecordLike(input)) {
    return undefined;
  }

  const recordId =
    stringField(input, "id", "recordId", "record_id", "evidenceId", "evidence_id") ??
    `mcpae_record_${index + 1}`;
  const metadata = recordField(input, "metadata");
  const redactionSummary = recordField(input, "redactionSummary", "redaction_summary", "redactions");

  return {
    root: input,
    recordId,
    displayRecordId: redactMcpApprovalEvidenceRecordDisplayValue(recordId),
    workspaceId: safeOptionalString(
      stringField(input, "workspaceId", "workspace_id"),
      "workspaceId",
    ),
    generatedAt: normalizeTimestamp(
      timestampField(input, "generatedAt", "generated_at", "createdAt", "created_at"),
      fallbackTimestamp,
    ),
    policyDecision: normalizePolicyDecision(
      stringField(input, "policyDecision", "policy_decision", "decision"),
    ),
    approvalStatus: normalizeApprovalStatus(
      stringField(input, "approvalStatus", "approval_status", "status"),
    ),
    fingerprint:
      safeOptionalString(
        stringField(input, "fingerprint", "evidenceFingerprint", "evidence_fingerprint", "recordFingerprint", "record_fingerprint") ??
          stringField(metadata, "fingerprint", "evidenceFingerprint", "recordFingerprint"),
        "fingerprint",
      ),
    sessionRefs: arrayField(input, "sessionRefs", "session_refs", "approvalSessions", "approval_sessions")
      .filter(isRecord),
    auditEventRefs: arrayField(input, "auditEventRefs", "audit_event_refs", "auditEvents", "audit_events")
      .filter(isRecord),
    redactionSummary,
    metadata,
  };
}

function buildRowsFromNormalizedRecords(
  records: readonly NormalizedRecord[],
): McpApprovalEvidenceStoredRecordRow[] {
  return records.map(buildRecordRow).map(cloneRecordRow);
}

function buildRecordRow(
  record: NormalizedRecord,
): McpApprovalEvidenceStoredRecordRow {
  const redactedFieldCount = nonNegativeIntegerField(
    record.redactionSummary,
    "redactedFieldCount",
    "redacted_field_count",
    "count",
  );
  const retainedMetadataKeys = stringArrayField(
    record.redactionSummary,
    "retainedMetadataKeys",
    "retained_metadata_keys",
  ).map((key) => redactMcpApprovalEvidenceRecordDisplayValue(key, "metadataKey"));
  const metadataLabels = buildMetadataLabels(record.metadata);
  const status = recordRowStatus(record);
  const detailLabels = [
    `Generated at ${record.generatedAt}`,
    record.workspaceId ? `Workspace ${record.workspaceId}` : "Workspace unavailable",
    `${formatCount(record.sessionRefs.length, "session ref")}`,
    `${formatCount(record.auditEventRefs.length, "audit event ref")}`,
    redactedFieldCount === undefined
      ? "Redaction count unavailable"
      : `${formatCount(redactedFieldCount, "redacted field")}`,
  ];

  if (record.fingerprint !== undefined) {
    detailLabels.push(`Fingerprint ${record.fingerprint}`);
  }

  return {
    id: `mcp_approval_evidence_record.${safeIdPart(record.recordId, "record")}`,
    recordId: record.displayRecordId,
    workspaceId: record.workspaceId,
    generatedAt: record.generatedAt,
    policyDecision: record.policyDecision,
    policyDecisionLabel: policyDecisionLabel(record.policyDecision),
    approvalStatus: record.approvalStatus,
    approvalStatusLabel: approvalStatusLabel(record.approvalStatus),
    status,
    statusLabel: statusLabel(status),
    fingerprint: record.fingerprint,
    sessionCount: record.sessionRefs.length,
    auditEventCount: record.auditEventRefs.length,
    redactedFieldCount,
    retainedMetadataKeys,
    metadataLabels,
    detailLabels,
    ariaLabel: [
      "Stored approval evidence record",
      record.displayRecordId,
      statusLabel(status),
    ].join(", "),
  };
}

function buildFingerprintRowsFromInput(
  normalized: NormalizedInput,
  options: BuildMcpApprovalEvidenceRecordStateOptions,
): McpApprovalEvidenceFingerprintDriftRow[] {
  const explicitPairs = collectExplicitFingerprintPairs(normalized);
  const optionPairs = collectOptionFingerprintPairs(normalized.records, options);
  const comparePairs = collectRecordComparisonPairs(normalized);

  return dedupeFingerprintPairs([
    ...explicitPairs,
    ...optionPairs,
    ...comparePairs,
  ])
    .map(buildFingerprintRow)
    .sort(compareFingerprintRows)
    .map(cloneFingerprintRow);
}

function collectExplicitFingerprintPairs(
  normalized: NormalizedInput,
): FingerprintPair[] {
  const source = normalized.compareLeft ?? normalized.compareRight;
  const root = source;
  if (!root) {
    return [];
  }

  return arrayField(root, "fingerprintDrift", "fingerprint_drift", "drift", "diffs", "differences")
    .filter(isRecord)
    .map((entry, index) => ({
      key: stringField(entry, "id", "key", "driftId", "drift_id") ?? `drift_${index + 1}`,
      label: safeOptionalString(stringField(entry, "label", "title"), "label") ?? `Fingerprint ${index + 1}`,
      storedRecordId: safeOptionalString(
        stringField(entry, "storedRecordId", "stored_record_id", "recordId", "record_id"),
        "recordId",
      ),
      currentRecordId: safeOptionalString(
        stringField(entry, "currentRecordId", "current_record_id"),
        "recordId",
      ),
      storedFingerprint: safeOptionalString(
        stringField(entry, "storedFingerprint", "stored_fingerprint", "expectedFingerprint", "expected_fingerprint", "baselineFingerprint", "baseline_fingerprint"),
        "fingerprint",
      ),
      currentFingerprint: safeOptionalString(
        stringField(entry, "currentFingerprint", "current_fingerprint", "actualFingerprint", "actual_fingerprint", "candidateFingerprint", "candidate_fingerprint"),
        "fingerprint",
      ),
    }));
}

function collectOptionFingerprintPairs(
  records: readonly NormalizedRecord[],
  options: BuildMcpApprovalEvidenceRecordStateOptions,
): FingerprintPair[] {
  const expected = safeOptionalString(options.expectedFingerprint, "fingerprint");
  if (expected === undefined || records.length === 0) {
    return [];
  }

  return records.map((record) => ({
    key: `${record.recordId}:record`,
    label: "Record fingerprint",
    storedRecordId: record.displayRecordId,
    currentRecordId: record.displayRecordId,
    storedFingerprint: record.fingerprint,
    currentFingerprint: expected,
  }));
}

function collectRecordComparisonPairs(
  normalized: NormalizedInput,
): FingerprintPair[] {
  const left = normalized.compareLeft;
  const right = normalized.compareRight;

  if (left !== undefined && right !== undefined) {
    return compareFingerprintFacts(
      collectFingerprintFacts(left, "stored"),
      collectFingerprintFacts(right, "current"),
    );
  }

  if (normalized.call === "compare" && normalized.records.length >= 2) {
    return compareFingerprintFacts(
      collectFingerprintFacts(normalized.records[0].root, "stored"),
      collectFingerprintFacts(normalized.records[1].root, "current"),
    );
  }

  return [];
}

function collectFingerprintFacts(
  input: AnyRecord,
  side: "stored" | "current",
): FingerprintFact[] {
  const normalized = normalizeRecord(input, 0, DEFAULT_TIMESTAMP);
  const recordId =
    normalized?.displayRecordId ??
    safeOptionalString(stringField(input, "id", "recordId", "record_id"), "recordId");
  const facts: FingerprintFact[] = [];
  const rootFingerprint = safeOptionalString(
    stringField(input, "fingerprint", "evidenceFingerprint", "evidence_fingerprint", "recordFingerprint", "record_fingerprint") ??
      stringField(recordField(input, "metadata"), "fingerprint", "evidenceFingerprint", "recordFingerprint"),
    "fingerprint",
  );

  if (rootFingerprint !== undefined) {
    facts.push({
      key: "record",
      label: "Record fingerprint",
      fingerprint: rootFingerprint,
      recordId,
    });
  }

  for (const entry of [
    ...arrayField(input, "evidence", "items", "evidenceItems", "evidence_items"),
    ...arrayField(input, "auditEventRefs", "audit_event_refs", "auditEvents", "audit_events"),
    ...arrayField(input, "sessionRefs", "session_refs"),
  ]) {
    if (!isRecord(entry)) {
      continue;
    }
    const entryId =
      stringField(entry, "id", "eventId", "event_id", "sessionId", "session_id") ??
      `${side}_${facts.length + 1}`;
    const fingerprint = safeOptionalString(
      stringField(entry, "fingerprint", "sha256", "checksum"),
      "fingerprint",
    );
    if (fingerprint !== undefined) {
      facts.push({
        key: entryId,
        label:
          safeOptionalString(stringField(entry, "label", "title"), "label") ??
          titleCaseToken(entryId),
        fingerprint,
        recordId,
      });
    }
  }

  return facts;
}

function compareFingerprintFacts(
  storedFacts: readonly FingerprintFact[],
  currentFacts: readonly FingerprintFact[],
): FingerprintPair[] {
  const stored = new Map(storedFacts.map((fact) => [fact.key, fact]));
  const current = new Map(currentFacts.map((fact) => [fact.key, fact]));
  const keys = [...new Set([...stored.keys(), ...current.keys()])].sort();

  return keys.map((key) => {
    const left = stored.get(key);
    const right = current.get(key);
    return {
      key,
      label: left?.label ?? right?.label ?? titleCaseToken(key),
      storedRecordId: left?.recordId,
      currentRecordId: right?.recordId,
      storedFingerprint: left?.fingerprint,
      currentFingerprint: right?.fingerprint,
    };
  });
}

function buildFingerprintRow(
  pair: FingerprintPair,
): McpApprovalEvidenceFingerprintDriftRow {
  const kind = driftKind(pair);
  const status = driftStatus(kind);
  const detailLabels = [
    pair.storedFingerprint
      ? `Stored ${pair.storedFingerprint}`
      : "Stored fingerprint missing",
    pair.currentFingerprint
      ? `Current ${pair.currentFingerprint}`
      : "Current fingerprint missing",
  ];

  if (pair.storedRecordId !== undefined) {
    detailLabels.push(`Stored record ${pair.storedRecordId}`);
  }
  if (pair.currentRecordId !== undefined) {
    detailLabels.push(`Current record ${pair.currentRecordId}`);
  }

  return {
    id: `mcp_approval_evidence_fingerprint.${safeIdPart(pair.key, "fingerprint")}`,
    driftId: safeOptionalString(pair.key, "driftId") ?? "fingerprint",
    label: pair.label,
    kind,
    status,
    statusLabel: statusLabel(status),
    storedRecordId: pair.storedRecordId,
    currentRecordId: pair.currentRecordId,
    storedFingerprint: pair.storedFingerprint,
    currentFingerprint: pair.currentFingerprint,
    detailLabels,
    ariaLabel: [pair.label, driftKindLabel(kind)].join(", "),
  };
}

function buildHealthRowsFromRecords(
  records: readonly NormalizedRecord[],
  options: Pick<BuildMcpApprovalEvidenceRecordStateOptions, "now" | "staleAfterMs">,
): McpApprovalEvidenceHealthRow[] {
  return records
    .flatMap((record) => buildHealthRowsForRecord(record, options))
    .sort(compareHealthRows)
    .map(cloneHealthRow);
}

function buildHealthRowsForRecord(
  record: NormalizedRecord,
  options: Pick<BuildMcpApprovalEvidenceRecordStateOptions, "now" | "staleAfterMs">,
): McpApprovalEvidenceHealthRow[] {
  const rows: McpApprovalEvidenceHealthRow[] = [];

  if (record.sessionRefs.length === 0) {
    rows.push(buildHealthRow({
      record,
      kind: "session_refs",
      label: "Missing session refs",
      value: "0 session refs",
      status: "error",
      detailLabels: ["Stored records should retain at least one approval session reference."],
    }));
  }
  if (record.auditEventRefs.length === 0) {
    rows.push(buildHealthRow({
      record,
      kind: "audit_event_refs",
      label: "Missing audit event refs",
      value: "0 audit event refs",
      status: "error",
      detailLabels: ["Stored records should retain at least one audit event reference."],
    }));
  }
  if (record.redactionSummary === undefined) {
    rows.push(buildHealthRow({
      record,
      kind: "redaction_summary",
      label: "Missing redaction summary",
      value: "Unavailable",
      status: "attention",
      detailLabels: ["Stored records should include redaction status for safe display."],
    }));
  }

  const stale = staleStatus(record.generatedAt, options);
  if (stale !== undefined) {
    rows.push(buildHealthRow({
      record,
      kind: "staleness",
      label: "Stale evidence",
      value: stale,
      status: "attention",
      detailLabels: [`Generated at ${record.generatedAt}`, `Checked at ${options.now}`],
    }));
  }

  if (rows.length === 0) {
    rows.push(buildHealthRow({
      record,
      kind: "stored_record",
      label: "Stored record health",
      value: "Evidence references present",
      status: "complete",
      detailLabels: [
        `${formatCount(record.sessionRefs.length, "session ref")}`,
        `${formatCount(record.auditEventRefs.length, "audit event ref")}`,
      ],
    }));
  }

  return rows;
}

function buildHealthRow(input: {
  record: NormalizedRecord;
  kind: McpApprovalEvidenceHealthKind;
  label: string;
  value: string;
  status: McpApprovalEvidenceRecordStatus;
  detailLabels: string[];
}): McpApprovalEvidenceHealthRow {
  const healthId = `${input.record.recordId}.${input.kind}`;
  return {
    id: `mcp_approval_evidence_health.${safeIdPart(healthId, "health")}`,
    healthId: safeOptionalString(healthId, "healthId") ?? "health",
    recordId: input.record.displayRecordId,
    kind: input.kind,
    label: input.label,
    value: input.value,
    status: input.status,
    statusLabel: statusLabel(input.status),
    detailLabels: input.detailLabels,
    ariaLabel: [input.label, input.value, statusLabel(input.status)].join(", "),
  };
}

function buildRedactionRowsFromRecords(
  records: readonly NormalizedRecord[],
): McpApprovalEvidenceRedactionStatusRow[] {
  return records
    .map(buildRedactionRow)
    .sort(compareRedactionRows)
    .map(cloneRedactionRow);
}

function buildRedactionRow(
  record: NormalizedRecord,
): McpApprovalEvidenceRedactionStatusRow {
  const summary = record.redactionSummary;
  const redacted = booleanField(summary, "redacted") ?? false;
  const redactedFieldCount =
    nonNegativeIntegerField(summary, "redactedFieldCount", "redacted_field_count", "count") ??
    0;
  const redactedPaths = stringArrayField(
    summary,
    "redactedPaths",
    "redacted_paths",
    "paths",
  ).map((path) => redactMcpApprovalEvidenceRecordDisplayValue(path, "path"));
  const retainedMetadataKeys = stringArrayField(
    summary,
    "retainedMetadataKeys",
    "retained_metadata_keys",
  ).map((key) => redactMcpApprovalEvidenceRecordDisplayValue(key, "metadataKey"));
  const unsafeMetadataKeys = unsafeMetadataEntries(record.metadata).map((key) =>
    redactMcpApprovalEvidenceRecordDisplayValue(key, "metadataKey"),
  );
  const status = redactionStatus({
    summary,
    redacted,
    redactedFieldCount,
    redactedPaths,
    unsafeMetadataKeys,
  });
  const detailLabels = [
    redacted ? "Redactions applied" : "No redactions reported",
    `${formatCount(redactedFieldCount, "redacted field")}`,
    `${formatCount(retainedMetadataKeys.length, "retained metadata key")}`,
  ];

  if (unsafeMetadataKeys.length > 0) {
    detailLabels.push(`${formatCount(unsafeMetadataKeys.length, "unsafe metadata key")}`);
  }

  return {
    id: `mcp_approval_evidence_redaction.${safeIdPart(record.recordId, "record")}`,
    recordId: record.displayRecordId,
    label: `Redaction status for ${record.displayRecordId}`,
    status,
    statusLabel: statusLabel(status),
    redacted,
    redactedFieldCount,
    redactedPaths,
    retainedMetadataKeys,
    unsafeMetadataKeys,
    detailLabels,
    ariaLabel: [
      "Redaction status",
      record.displayRecordId,
      statusLabel(status),
    ].join(", "),
  };
}

function buildSummaryCards(input: {
  status: McpApprovalEvidenceRecordStatus;
  records: readonly McpApprovalEvidenceStoredRecordRow[];
  driftRows: readonly McpApprovalEvidenceFingerprintDriftRow[];
  healthRows: readonly McpApprovalEvidenceHealthRow[];
  redactionRows: readonly McpApprovalEvidenceRedactionStatusRow[];
}): McpApprovalEvidenceRecordSummaryCard[] {
  const driftAttention = input.driftRows.filter((row) =>
    row.status === "attention" || row.status === "error"
  ).length;
  const healthAttention = input.healthRows.filter((row) =>
    row.status === "attention" || row.status === "error"
  ).length;
  const redactionAttention = input.redactionRows.filter((row) =>
    row.status === "attention" || row.status === "error"
  ).length;
  const redactedCount = input.redactionRows.filter((row) => row.redacted).length;

  return [
    {
      id: "mcp_approval_evidence_record_summary.records",
      title: "Stored records",
      valueLabel: formatCount(input.records.length, "record"),
      status: input.records.length === 0 ? "empty" : input.status,
      statusLabel: statusLabel(input.records.length === 0 ? "empty" : input.status),
      detailLabels: [
        formatCount(input.records.filter((row) => row.status === "complete").length, "complete record"),
        formatCount(input.records.filter((row) => row.status === "attention").length, "record needing review"),
      ],
      actionId: "open_records",
      ariaLabel: ["Stored records", formatCount(input.records.length, "record")].join(", "),
    },
    {
      id: "mcp_approval_evidence_record_summary.fingerprints",
      title: "Fingerprint drift",
      valueLabel: formatCount(driftAttention, "drift"),
      status: driftSectionStatus(input.driftRows),
      statusLabel: statusLabel(driftSectionStatus(input.driftRows)),
      detailLabels: [
        formatCount(input.driftRows.length, "comparison row"),
        formatCount(driftAttention, "row needing review"),
      ],
      actionId: "compare_fingerprints",
      ariaLabel: ["Fingerprint drift", formatCount(driftAttention, "drift")].join(", "),
    },
    {
      id: "mcp_approval_evidence_record_summary.evidence",
      title: "Evidence health",
      valueLabel: formatCount(healthAttention, "issue"),
      status: rowsSectionStatus(input.healthRows),
      statusLabel: statusLabel(rowsSectionStatus(input.healthRows)),
      detailLabels: [
        formatCount(input.healthRows.length, "health row"),
        formatCount(healthAttention, "health issue"),
      ],
      actionId: "review_evidence_health",
      ariaLabel: ["Evidence health", formatCount(healthAttention, "issue")].join(", "),
    },
    {
      id: "mcp_approval_evidence_record_summary.redactions",
      title: "Redaction status",
      valueLabel: formatCount(redactedCount, "redacted record"),
      status: rowsSectionStatus(input.redactionRows),
      statusLabel: statusLabel(rowsSectionStatus(input.redactionRows)),
      detailLabels: [
        formatCount(input.redactionRows.length, "redaction row"),
        formatCount(redactionAttention, "redaction issue"),
      ],
      actionId: "review_redactions",
      ariaLabel: ["Redaction status", formatCount(redactionAttention, "issue")].join(", "),
    },
  ].map(cloneSummaryCard);
}

function buildRecommendedActions(input: {
  call: McpApprovalEvidenceRecordCall;
  phase: McpApprovalEvidenceRecordPhase;
  status: McpApprovalEvidenceRecordStatus;
  records: readonly McpApprovalEvidenceStoredRecordRow[];
  driftRows: readonly McpApprovalEvidenceFingerprintDriftRow[];
  healthRows: readonly McpApprovalEvidenceHealthRow[];
  redactionRows: readonly McpApprovalEvidenceRedactionStatusRow[];
  errors: readonly McpApprovalEvidenceRecordErrorState[];
}): McpApprovalEvidenceRecordRecommendedAction[] {
  const actions: McpApprovalEvidenceRecordRecommendedAction[] = [];
  const hasRecords = input.records.length > 0;
  const hasDrift = input.driftRows.some((row) => row.status === "attention" || row.status === "error");
  const hasHealthIssue = input.healthRows.some((row) => row.status === "attention" || row.status === "error");
  const hasRedactionIssue = input.redactionRows.some((row) => row.status === "attention" || row.status === "error");
  const hasErrors = input.errors.length > 0 || input.phase === "error";

  if (input.phase === "loading") {
    actions.push(action({
      id: "retry_records",
      label: retryLabel(input.call),
      intent: "secondary",
      enabled: false,
      section: input.call,
      disabledReason: "Records are still loading.",
    }));
    return actions.map(cloneAction);
  }

  if (hasErrors) {
    actions.push(action({
      id: "retry_records",
      label: retryLabel(input.call),
      intent: "primary",
      enabled: true,
      section: input.call,
    }));
  }

  actions.push(action({
    id: "open_records",
    label: "Open stored records",
    intent: hasRecords ? "primary" : "secondary",
    enabled: hasRecords,
    section: "records",
    disabledReason: hasRecords ? undefined : "No stored records are available.",
  }));

  actions.push(action({
    id: "compare_fingerprints",
    label: hasDrift ? "Review fingerprint drift" : "Compare fingerprints",
    intent: hasDrift ? "danger" : "secondary",
    enabled: input.driftRows.length > 0,
    section: "fingerprints",
    disabledReason: input.driftRows.length > 0
      ? undefined
      : "No comparison rows are available.",
  }));

  actions.push(action({
    id: "review_evidence_health",
    label: hasHealthIssue ? "Review stale or missing evidence" : "Review evidence health",
    intent: hasHealthIssue ? "danger" : "secondary",
    enabled: input.healthRows.length > 0,
    section: "evidence",
  }));

  actions.push(action({
    id: "review_redactions",
    label: hasRedactionIssue ? "Review redaction issues" : "Review redaction status",
    intent: hasRedactionIssue ? "danger" : "secondary",
    enabled: input.redactionRows.length > 0,
    section: "redactions",
  }));

  actions.push(action({
    id: "continue_with_record",
    label: "Continue with stored evidence",
    intent: "primary",
    enabled:
      hasRecords &&
      !hasErrors &&
      !hasDrift &&
      !hasHealthIssue &&
      !hasRedactionIssue &&
      input.status === "complete",
    section: "actions",
    disabledReason:
      hasRecords &&
      !hasErrors &&
      !hasDrift &&
      !hasHealthIssue &&
      !hasRedactionIssue &&
      input.status === "complete"
        ? undefined
        : "Stored evidence needs review first.",
  }));

  return dedupeActions(actions).map(cloneAction);
}

function action(input: {
  id: string;
  label: string;
  intent: McpApprovalEvidenceActionIntent;
  enabled: boolean;
  section?: McpApprovalEvidenceRecordContext;
  targetId?: string;
  disabledReason?: string;
}): McpApprovalEvidenceRecordRecommendedAction {
  return {
    id: input.id,
    label: input.label,
    intent: input.intent,
    enabled: input.enabled,
    section: input.section,
    targetId: input.targetId,
    disabledReason: input.disabledReason,
    ariaLabel: [
      input.label,
      input.enabled ? "enabled" : "disabled",
      input.disabledReason,
    ].filter(isDefined).join(", "),
  };
}

function resolvePhase(
  records: readonly NormalizedRecord[],
  errors: readonly McpApprovalEvidenceRecordErrorState[],
): McpApprovalEvidenceRecordPhase {
  if (errors.length > 0) {
    return "error";
  }
  if (records.length === 0) {
    return "empty";
  }
  return "success";
}

function resolveStateStatus(input: {
  phase: McpApprovalEvidenceRecordPhase;
  recordRows: readonly McpApprovalEvidenceStoredRecordRow[];
  fingerprintDriftRows: readonly McpApprovalEvidenceFingerprintDriftRow[];
  evidenceHealthRows: readonly McpApprovalEvidenceHealthRow[];
  redactionStatusRows: readonly McpApprovalEvidenceRedactionStatusRow[];
}): McpApprovalEvidenceRecordStatus {
  if (input.phase === "loading") {
    return "loading";
  }
  if (input.phase === "error") {
    return "error";
  }
  if (input.phase === "empty") {
    return "empty";
  }

  const statuses = [
    ...input.recordRows.map((row) => row.status),
    ...input.fingerprintDriftRows.map((row) => row.status),
    ...input.evidenceHealthRows.map((row) => row.status),
    ...input.redactionStatusRows.map((row) => row.status),
  ];
  if (statuses.includes("error")) {
    return "error";
  }
  if (statuses.includes("attention")) {
    return "attention";
  }
  return "complete";
}

function recordRowStatus(record: NormalizedRecord): McpApprovalEvidenceRecordStatus {
  if (record.approvalStatus === "unknown" || record.policyDecision === "unknown") {
    return "attention";
  }
  if (record.approvalStatus === "pending" || record.approvalStatus === "expired") {
    return "attention";
  }
  if (record.sessionRefs.length === 0 || record.auditEventRefs.length === 0) {
    return "error";
  }
  return "complete";
}

function redactionStatus(input: {
  summary: AnyRecord | undefined;
  redacted: boolean;
  redactedFieldCount: number;
  redactedPaths: readonly string[];
  unsafeMetadataKeys: readonly string[];
}): McpApprovalEvidenceRecordStatus {
  if (input.unsafeMetadataKeys.length > 0) {
    return "error";
  }
  if (input.summary === undefined) {
    return "attention";
  }
  if (input.redacted !== (input.redactedFieldCount > 0)) {
    return "attention";
  }
  if (input.redactedFieldCount !== input.redactedPaths.length) {
    return "attention";
  }
  return "complete";
}

function driftKind(pair: FingerprintPair): McpApprovalEvidenceDriftKind {
  if (pair.storedFingerprint === undefined) {
    return "missing_stored";
  }
  if (pair.currentFingerprint === undefined) {
    return "missing_current";
  }
  return pair.storedFingerprint === pair.currentFingerprint ? "matched" : "drifted";
}

function driftStatus(
  kind: McpApprovalEvidenceDriftKind,
): McpApprovalEvidenceRecordStatus {
  switch (kind) {
    case "matched":
      return "complete";
    case "drifted":
      return "attention";
    case "missing_stored":
    case "missing_current":
      return "error";
  }
}

function driftSectionStatus(
  rows: readonly McpApprovalEvidenceFingerprintDriftRow[],
): McpApprovalEvidenceRecordStatus {
  if (rows.length === 0) {
    return "empty";
  }
  return rowsSectionStatus(rows);
}

function rowsSectionStatus(
  rows: readonly { status: McpApprovalEvidenceRecordStatus }[],
): McpApprovalEvidenceRecordStatus {
  if (rows.length === 0) {
    return "empty";
  }
  if (rows.some((row) => row.status === "error")) {
    return "error";
  }
  if (rows.some((row) => row.status === "attention")) {
    return "attention";
  }
  return "complete";
}

function staleStatus(
  generatedAt: string,
  options: Pick<BuildMcpApprovalEvidenceRecordStateOptions, "now" | "staleAfterMs">,
): string | undefined {
  const now = normalizeTimestamp(options.now, undefined);
  if (options.now === undefined || now === DEFAULT_TIMESTAMP) {
    return undefined;
  }

  const generatedTime = Date.parse(generatedAt);
  const nowTime = Date.parse(now);
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  if (
    !Number.isNaN(generatedTime) &&
    !Number.isNaN(nowTime) &&
    nowTime - generatedTime > staleAfterMs
  ) {
    return `Older than ${formatDuration(staleAfterMs)}`;
  }
  return undefined;
}

function collectErrorStates(
  root: AnyRecord | undefined,
  call: McpApprovalEvidenceRecordCall,
): McpApprovalEvidenceRecordErrorState[] {
  const errors: McpApprovalEvidenceRecordErrorState[] = [];
  const rootError =
    root === undefined && root !== undefined
      ? "Record response must be an object."
      : errorMessage(root?.error);

  if (rootError !== undefined) {
    errors.push(buildMcpApprovalEvidenceRecordErrorState(call, rootError));
  }
  for (const error of arrayField(root, "errors")) {
    errors.push(buildMcpApprovalEvidenceRecordErrorState(call, error));
  }
  return errors;
}

function isPersistedRecordLike(value: unknown): value is AnyRecord {
  if (!isRecord(value)) {
    return false;
  }

  return (
    stringField(value, "schemaVersion", "schema_version") === "mcp-approval-evidence/v1" ||
    stringField(value, "id", "recordId", "record_id", "evidenceId", "evidence_id")?.startsWith("mcpae_") === true ||
    stringField(value, "policyDecision", "policy_decision", "approvalStatus", "approval_status") !== undefined ||
    Array.isArray(value.sessionRefs) ||
    Array.isArray(value.auditEventRefs) ||
    isRecord(value.redactionSummary)
  );
}

function normalizeOptionRecord(value: unknown): AnyRecord | undefined {
  return isRecord(value) ? clonePlain(value) : undefined;
}

function normalizePolicyDecision(
  value: string | undefined,
): McpApprovalEvidencePolicyDecision {
  const normalized = normalizeToken(value);
  if (normalized === "allowed" || normalized === "allow") {
    return "allow";
  }
  if (
    normalized === "approval_required" ||
    normalized === "require_approval" ||
    normalized === "requires_approval"
  ) {
    return "require_approval";
  }
  if (normalized === "denied" || normalized === "deny" || normalized === "rejected") {
    return "deny";
  }
  return "unknown";
}

function normalizeApprovalStatus(
  value: string | undefined,
): McpApprovalEvidencePersistedStatus {
  const normalized = normalizeToken(value);
  if (normalized === "approved" || normalized === "approve") {
    return "approved";
  }
  if (normalized === "rejected" || normalized === "reject" || normalized === "denied") {
    return "rejected";
  }
  if (normalized === "expired" || normalized === "expire") {
    return "expired";
  }
  if (normalized === "pending" || normalized === "approval_required") {
    return "pending";
  }
  return "unknown";
}

function policyDecisionLabel(
  decision: McpApprovalEvidencePolicyDecision,
): string {
  switch (decision) {
    case "allow":
      return "Allowed";
    case "require_approval":
      return "Approval required";
    case "deny":
      return "Denied";
    case "unknown":
      return "Unknown";
  }
}

function approvalStatusLabel(
  status: McpApprovalEvidencePersistedStatus,
): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "expired":
      return "Expired";
    case "unknown":
      return "Unknown";
  }
}

function statusLabel(status: McpApprovalEvidenceRecordStatus): string {
  switch (status) {
    case "loading":
      return "Loading";
    case "empty":
      return "Empty";
    case "ready":
      return "Ready";
    case "attention":
      return "Needs review";
    case "error":
      return "Error";
    case "complete":
      return "Complete";
  }
}

function driftKindLabel(kind: McpApprovalEvidenceDriftKind): string {
  switch (kind) {
    case "matched":
      return "Fingerprints match";
    case "drifted":
      return "Fingerprint drift";
    case "missing_stored":
      return "Stored fingerprint missing";
    case "missing_current":
      return "Current fingerprint missing";
  }
}

function buildHeadline(
  call: McpApprovalEvidenceRecordCall,
  status: McpApprovalEvidenceRecordStatus,
): string {
  const subject = {
    create: "Created approval evidence record",
    list: "Stored approval evidence records",
    get: "Stored approval evidence record",
    compare: "Approval evidence comparison",
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
  return `${subject} ready`;
}

function errorLabel(context: McpApprovalEvidenceRecordContext): string {
  switch (context) {
    case "create":
      return "Approval evidence record could not be created";
    case "list":
      return "Approval evidence records could not load";
    case "get":
      return "Approval evidence record could not load";
    case "compare":
      return "Approval evidence records could not be compared";
    case "records":
      return "Stored approval evidence records could not load";
    case "fingerprints":
      return "Approval evidence fingerprints could not load";
    case "evidence":
      return "Approval evidence health could not load";
    case "redactions":
      return "Approval evidence redaction status could not load";
    case "actions":
      return "Approval evidence record actions could not load";
  }
}

function retryLabel(context: McpApprovalEvidenceRecordContext): string {
  switch (context) {
    case "create":
      return "Retry create";
    case "list":
      return "Retry records";
    case "get":
      return "Retry record";
    case "compare":
      return "Retry comparison";
    case "records":
      return "Retry records";
    case "fingerprints":
      return "Retry fingerprints";
    case "evidence":
      return "Retry evidence health";
    case "redactions":
      return "Retry redactions";
    case "actions":
      return "Retry actions";
  }
}

function defaultErrorDescription(
  context: McpApprovalEvidenceRecordContext,
): string {
  switch (context) {
    case "create":
      return "Create a persisted approval evidence record and try again.";
    case "list":
      return "Refresh persisted approval evidence records and try again.";
    case "get":
      return "Refresh the persisted approval evidence record and try again.";
    case "compare":
      return "Refresh the comparison inputs and try again.";
    case "records":
      return "Refresh stored records and try again.";
    case "fingerprints":
      return "Refresh fingerprint comparison rows and try again.";
    case "evidence":
      return "Refresh evidence health rows and try again.";
    case "redactions":
      return "Refresh redaction status rows and try again.";
    case "actions":
      return "Refresh recommended actions and try again.";
  }
}

function buildMetadataLabels(metadata: AnyRecord | undefined): string[] {
  if (!metadata) {
    return [];
  }

  return Object.entries(metadata)
    .map(([key, value]) => {
      const safeKey = redactMcpApprovalEvidenceRecordDisplayValue(key, "metadataKey");
      const safeValue = redactMcpApprovalEvidenceRecordDisplayValue(value, key);
      return safeKey === REDACTED
        ? `Metadata ${REDACTED}`
        : `${safeKey}: ${safeValue}`;
    })
    .sort();
}

function unsafeMetadataEntries(metadata: AnyRecord | undefined): string[] {
  if (!metadata) {
    return [];
  }

  return Object.entries(metadata)
    .filter(([key, value]) =>
      SECRET_KEY_PATTERN.test(key) ||
      isUnsafeDisplayValue(value, key)
    )
    .map(([key]) => key)
    .sort();
}

function isUnsafeDisplayValue(value: unknown, keyHint: string): boolean {
  if (typeof value === "string" && value.trim() === REDACTED) {
    return false;
  }
  return redactMcpApprovalEvidenceRecordDisplayValue(value, keyHint) === REDACTED;
}

function safeOptionalString(
  value: string | undefined,
  keyHint?: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const redacted = redactMcpApprovalEvidenceRecordDisplayValue(value, keyHint);
  return redacted === "Unavailable" ? undefined : redacted;
}

function safeIdPart(value: string, fallback: string): string {
  const redacted = redactMcpApprovalEvidenceRecordDisplayValue(value);
  if (redacted === REDACTED || redacted === "Unavailable") {
    return fallback;
  }
  return sanitizeIdentifier(redacted, fallback);
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
  ...keys: string[]
): string | undefined {
  const value = stringField(record, ...keys);
  return value !== undefined && !Number.isNaN(Date.parse(value))
    ? value
    : undefined;
}

function stringField(
  record: AnyRecord | undefined,
  ...keys: string[]
): string | undefined {
  if (!record) {
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
  ...keys: string[]
): boolean | undefined {
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return undefined;
}

function nonNegativeIntegerField(
  record: AnyRecord | undefined,
  ...keys: string[]
): number | undefined {
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return Math.trunc(value);
    }
  }
  return undefined;
}

function arrayField(record: AnyRecord | undefined, ...keys: string[]): unknown[] {
  if (!record) {
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
  ...keys: string[]
): string[] {
  return arrayField(record, ...keys)
    .filter((value): value is string => typeof value === "string" && value.trim() !== "")
    .map((value) => value.trim());
}

function recordField(
  record: AnyRecord | undefined,
  ...keys: string[]
): AnyRecord | undefined {
  if (!record) {
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

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function errorMessage(error: unknown): string | undefined {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }
  if (typeof error === "string" && error.trim() !== "") {
    return error.trim();
  }
  if (isRecord(error)) {
    return stringField(error, "message", "description", "code");
  }
  return undefined;
}

function normalizeToken(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "_") ?? "";
}

function sanitizeIdentifier(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96);

  return normalized === "" ? fallback : normalized;
}

function titleCaseToken(value: string): string {
  const words = value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);

  if (words.length === 0) {
    return "Approval evidence";
  }

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function formatCount(
  value: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function formatDuration(milliseconds: number): string {
  const days = Math.floor(milliseconds / (24 * 60 * 60 * 1000));
  if (days > 0) {
    return formatCount(days, "day");
  }
  const hours = Math.floor(milliseconds / (60 * 60 * 1000));
  if (hours > 0) {
    return formatCount(hours, "hour");
  }
  const minutes = Math.floor(milliseconds / (60 * 1000));
  return formatCount(Math.max(1, minutes), "minute");
}

function compareRecords(left: NormalizedRecord, right: NormalizedRecord): number {
  return (
    right.generatedAt.localeCompare(left.generatedAt) ||
    left.displayRecordId.localeCompare(right.displayRecordId)
  );
}

function compareFingerprintRows(
  left: McpApprovalEvidenceFingerprintDriftRow,
  right: McpApprovalEvidenceFingerprintDriftRow,
): number {
  return (
    statusRank(left.status) - statusRank(right.status) ||
    driftRank(left.kind) - driftRank(right.kind) ||
    left.label.localeCompare(right.label) ||
    left.driftId.localeCompare(right.driftId)
  );
}

function compareHealthRows(
  left: McpApprovalEvidenceHealthRow,
  right: McpApprovalEvidenceHealthRow,
): number {
  return (
    statusRank(left.status) - statusRank(right.status) ||
    left.label.localeCompare(right.label) ||
    left.healthId.localeCompare(right.healthId)
  );
}

function compareRedactionRows(
  left: McpApprovalEvidenceRedactionStatusRow,
  right: McpApprovalEvidenceRedactionStatusRow,
): number {
  return (
    statusRank(left.status) - statusRank(right.status) ||
    right.redactedFieldCount - left.redactedFieldCount ||
    left.recordId.localeCompare(right.recordId)
  );
}

function statusRank(status: McpApprovalEvidenceRecordStatus): number {
  switch (status) {
    case "error":
      return 0;
    case "attention":
      return 1;
    case "loading":
      return 2;
    case "ready":
      return 3;
    case "complete":
      return 4;
    case "empty":
      return 5;
  }
}

function driftRank(kind: McpApprovalEvidenceDriftKind): number {
  switch (kind) {
    case "missing_stored":
      return 0;
    case "missing_current":
      return 1;
    case "drifted":
      return 2;
    case "matched":
      return 3;
  }
}

function dedupeFingerprintPairs(
  pairs: readonly FingerprintPair[],
): FingerprintPair[] {
  const seen = new Set<string>();
  const deduped: FingerprintPair[] = [];
  for (const pair of pairs) {
    const key = [
      pair.key,
      pair.storedRecordId,
      pair.currentRecordId,
      pair.storedFingerprint,
      pair.currentFingerprint,
    ].join(":");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(pair);
  }
  return deduped;
}

function dedupeActions(
  actions: readonly McpApprovalEvidenceRecordRecommendedAction[],
): McpApprovalEvidenceRecordRecommendedAction[] {
  const seen = new Set<string>();
  const deduped: McpApprovalEvidenceRecordRecommendedAction[] = [];
  for (const actionItem of actions) {
    if (seen.has(actionItem.id)) {
      continue;
    }
    seen.add(actionItem.id);
    deduped.push(actionItem);
  }
  return deduped;
}

function dedupeErrors(
  errors: readonly McpApprovalEvidenceRecordErrorState[],
): McpApprovalEvidenceRecordErrorState[] {
  const seen = new Set<string>();
  const deduped: McpApprovalEvidenceRecordErrorState[] = [];
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
  state: McpApprovalEvidenceRecordState,
): McpApprovalEvidenceRecordState {
  return {
    ...state,
    summaryCards: state.summaryCards.map(cloneSummaryCard),
    recordRows: state.recordRows.map(cloneRecordRow),
    fingerprintDriftRows: state.fingerprintDriftRows.map(cloneFingerprintRow),
    evidenceHealthRows: state.evidenceHealthRows.map(cloneHealthRow),
    redactionStatusRows: state.redactionStatusRows.map(cloneRedactionRow),
    recommendedActions: state.recommendedActions.map(cloneAction),
    emptyStates: {
      records: { ...state.emptyStates.records },
      fingerprints: { ...state.emptyStates.fingerprints },
      evidence: { ...state.emptyStates.evidence },
      redactions: { ...state.emptyStates.redactions },
      actions: { ...state.emptyStates.actions },
    },
    errorStates: state.errorStates.map(cloneErrorState),
  };
}

function cloneSummaryCard(
  card: McpApprovalEvidenceRecordSummaryCard,
): McpApprovalEvidenceRecordSummaryCard {
  return {
    ...card,
    detailLabels: [...card.detailLabels],
  };
}

function cloneRecordRow(
  row: McpApprovalEvidenceStoredRecordRow,
): McpApprovalEvidenceStoredRecordRow {
  return {
    ...row,
    retainedMetadataKeys: [...row.retainedMetadataKeys],
    metadataLabels: [...row.metadataLabels],
    detailLabels: [...row.detailLabels],
  };
}

function cloneFingerprintRow(
  row: McpApprovalEvidenceFingerprintDriftRow,
): McpApprovalEvidenceFingerprintDriftRow {
  return {
    ...row,
    detailLabels: [...row.detailLabels],
  };
}

function cloneHealthRow(
  row: McpApprovalEvidenceHealthRow,
): McpApprovalEvidenceHealthRow {
  return {
    ...row,
    detailLabels: [...row.detailLabels],
  };
}

function cloneRedactionRow(
  row: McpApprovalEvidenceRedactionStatusRow,
): McpApprovalEvidenceRedactionStatusRow {
  return {
    ...row,
    redactedPaths: [...row.redactedPaths],
    retainedMetadataKeys: [...row.retainedMetadataKeys],
    unsafeMetadataKeys: [...row.unsafeMetadataKeys],
    detailLabels: [...row.detailLabels],
  };
}

function cloneAction(
  actionItem: McpApprovalEvidenceRecordRecommendedAction,
): McpApprovalEvidenceRecordRecommendedAction {
  return { ...actionItem };
}

function cloneErrorState(
  error: McpApprovalEvidenceRecordErrorState,
): McpApprovalEvidenceRecordErrorState {
  return {
    ...error,
    errorState: { ...error.errorState },
  };
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
