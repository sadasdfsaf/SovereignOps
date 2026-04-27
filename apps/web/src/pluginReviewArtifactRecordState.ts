import type {
  IngestSearchEmptyState,
  IngestSearchErrorState,
} from "./ingestSearch.ts";
import {
  buildPluginReviewArtifactState,
  type PluginReviewActionIntent,
} from "./pluginReviewArtifactState.ts";

export type PluginReviewArtifactRecordCall =
  | "create"
  | "list"
  | "get"
  | "compare";

export type PluginReviewArtifactRecordPhase =
  | "loading"
  | "success"
  | "empty"
  | "error";

export type PluginReviewArtifactRecordStatus =
  | "loading"
  | "empty"
  | "ready"
  | "attention"
  | "error"
  | "complete";

export type PluginReviewArtifactRecordContext =
  | "create"
  | "list"
  | "get"
  | "compare"
  | "records"
  | "comparison"
  | "redactions"
  | "locality"
  | "actions";

export type PluginReviewArtifactDecision =
  | "approved"
  | "approval_required"
  | "denied"
  | "unknown";

export type PluginReviewArtifactRecordComparisonKind =
  | "match"
  | "mismatch"
  | "missing_stored"
  | "missing_current"
  | "unavailable";

export interface BuildPluginReviewArtifactRecordStateOptions {
  call?: PluginReviewArtifactRecordCall;
  defaultTimestamp?: string;
  error?: unknown;
  loading?: boolean;
  expectedFingerprint?: string;
  currentFingerprint?: string;
  expectedRecord?: unknown;
  currentRecord?: unknown;
  baselineRecord?: unknown;
}

export interface PluginReviewArtifactRecordState {
  id: "plugin_review_artifact_record";
  call: PluginReviewArtifactRecordCall;
  phase: PluginReviewArtifactRecordPhase;
  generatedAt: string;
  status: PluginReviewArtifactRecordStatus;
  statusLabel: string;
  headline: string;
  isEmpty: boolean;
  selectedRecordId?: string;
  summaryCards: PluginReviewArtifactRecordSummaryCard[];
  recordCards: PluginReviewArtifactRecordCard[];
  comparisonStatus: PluginReviewArtifactRecordComparisonStatus;
  redactionIndicators: PluginReviewArtifactRecordRedactionIndicator[];
  localOnlyIndicators: PluginReviewArtifactRecordLocalOnlyIndicator[];
  actionButtons: PluginReviewArtifactRecordActionButton[];
  emptyStates: PluginReviewArtifactRecordEmptyStates;
  errorStates: PluginReviewArtifactRecordErrorState[];
}

export interface PluginReviewArtifactRecordSummaryCard {
  id: string;
  title: string;
  valueLabel: string;
  status: PluginReviewArtifactRecordStatus;
  statusLabel: string;
  detailLabels: string[];
  actionId?: string;
  ariaLabel: string;
}

export interface PluginReviewArtifactRecordCard {
  id: string;
  recordId: string;
  title: string;
  pluginId?: string;
  pluginName: string;
  pluginVersion?: string;
  pluginLabel: string;
  reviewId?: string;
  reviewLabel: string;
  generatedAt: string;
  decision: PluginReviewArtifactDecision;
  decisionLabel: string;
  status: PluginReviewArtifactRecordStatus;
  statusLabel: string;
  fingerprint?: string;
  artifactFingerprint?: string;
  redacted: boolean;
  redactedFieldCount: number;
  localOnly: boolean;
  externalCallCount: number;
  localReferenceCount: number;
  detailLabels: string[];
  actionId: string;
  ariaLabel: string;
}

export interface PluginReviewArtifactRecordComparisonStatus {
  id: "plugin_review_artifact_record_comparison";
  kind: PluginReviewArtifactRecordComparisonKind;
  kindLabel: string;
  status: PluginReviewArtifactRecordStatus;
  statusLabel: string;
  storedRecordId?: string;
  currentRecordId?: string;
  storedFingerprint?: string;
  currentFingerprint?: string;
  detailLabels: string[];
  emptyState: IngestSearchEmptyState;
  errorState?: IngestSearchErrorState;
  ariaLabel: string;
}

export interface PluginReviewArtifactRecordRedactionIndicator {
  id: string;
  recordId: string;
  label: string;
  status: PluginReviewArtifactRecordStatus;
  statusLabel: string;
  redacted: boolean;
  redactedFieldCount: number;
  redactedPaths: string[];
  detailLabels: string[];
  ariaLabel: string;
}

export interface PluginReviewArtifactRecordLocalOnlyIndicator {
  id: string;
  recordId: string;
  label: string;
  status: PluginReviewArtifactRecordStatus;
  statusLabel: string;
  localOnly: boolean;
  externalCallCount: number;
  localReferenceCount: number;
  detailLabels: string[];
  ariaLabel: string;
}

export interface PluginReviewArtifactRecordActionButton {
  id: string;
  label: string;
  intent: PluginReviewActionIntent;
  enabled: boolean;
  section?: PluginReviewArtifactRecordContext;
  targetId?: string;
  disabledReason?: string;
  ariaLabel: string;
}

export interface PluginReviewArtifactRecordEmptyStates {
  records: IngestSearchEmptyState;
  comparison: IngestSearchEmptyState;
  redactions: IngestSearchEmptyState;
  locality: IngestSearchEmptyState;
  actions: IngestSearchEmptyState;
}

export interface PluginReviewArtifactRecordErrorState {
  id: string;
  context: PluginReviewArtifactRecordContext;
  errorState: IngestSearchErrorState;
}

type AnyRecord = Record<string, unknown>;

interface NormalizedInput {
  call: PluginReviewArtifactRecordCall;
  generatedAt: string;
  records: NormalizedRecord[];
  compareLeft?: AnyRecord;
  compareRight?: AnyRecord;
  explicitStoredFingerprint?: string;
  explicitCurrentFingerprint?: string;
  explicitMatch?: boolean;
  errorStates: PluginReviewArtifactRecordErrorState[];
}

interface NormalizedRecord {
  root: AnyRecord;
  artifact?: AnyRecord;
  recordId: string;
  displayRecordId: string;
  reviewId?: string;
  pluginId?: string;
  pluginName: string;
  pluginVersion?: string;
  generatedAt: string;
  decision: PluginReviewArtifactDecision;
  fingerprint?: string;
  artifactFingerprint?: string;
  redacted: boolean;
  redactedFieldCount: number;
  redactedPaths: string[];
  localOnly: boolean;
  externalCallCount: number;
  localReferenceCount: number;
}

interface ComparisonDraft {
  storedRecordId?: string;
  currentRecordId?: string;
  storedFingerprint?: string;
  currentFingerprint?: string;
  explicitMatch?: boolean;
}

const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const REDACTED = "[REDACTED]";
const SECRET_KEY_PATTERN =
  /(?:api[-_]?key|authorization|bearer|credential|password|secret|session|token)/i;
const SECRET_VALUE_PATTERN =
  /(?:bearer\s+[a-z0-9._~+/=-]+|sk[-_][a-z0-9._-]+|rk[-_][a-z0-9._-]+|pat[-_][a-z0-9._-]+|glpat-[a-z0-9_-]+|[a-z0-9_+/=-]{40,})/i;

export function buildPluginReviewArtifactRecordState(
  input: unknown,
  options: BuildPluginReviewArtifactRecordStateOptions = {},
): PluginReviewArtifactRecordState {
  if (options.loading === true) {
    return buildPluginReviewArtifactRecordLoadingState(options);
  }

  const normalized = normalizeInput(input, options);
  const recordCards = buildCardsFromNormalizedRecords(normalized.records);
  const comparisonStatus = buildComparisonStatusFromNormalized(normalized, options);
  const redactionIndicators = buildRedactionIndicatorsFromRecords(normalized.records);
  const localOnlyIndicators = buildLocalOnlyIndicatorsFromRecords(normalized.records);
  const phase = resolvePhase(normalized);
  const status = resolveStateStatus({
    phase,
    recordCards,
    comparisonStatus,
    redactionIndicators,
    localOnlyIndicators,
  });
  const summaryCards = buildSummaryCards({
    recordCards,
    comparisonStatus,
    redactionIndicators,
    localOnlyIndicators,
  });
  const actionButtons = buildActionButtons({
    call: normalized.call,
    phase,
    status,
    recordCards,
    comparisonStatus,
    redactionIndicators,
    localOnlyIndicators,
    errors: normalized.errorStates,
  });

  return cloneState({
    id: "plugin_review_artifact_record",
    call: normalized.call,
    phase,
    generatedAt: normalized.generatedAt,
    status,
    statusLabel: statusLabel(status),
    headline: buildHeadline(normalized.call, status),
    isEmpty: phase === "empty",
    selectedRecordId:
      recordCards.length === 1 ? recordCards[0].recordId : undefined,
    summaryCards,
    recordCards,
    comparisonStatus,
    redactionIndicators,
    localOnlyIndicators,
    actionButtons,
    emptyStates: buildPluginReviewArtifactRecordEmptyStates(),
    errorStates: normalized.errorStates.map(cloneErrorState),
  });
}

export function buildPluginReviewArtifactRecordLoadingState(
  options: Pick<
    BuildPluginReviewArtifactRecordStateOptions,
    "call" | "defaultTimestamp"
  > = {},
): PluginReviewArtifactRecordState {
  const call = options.call ?? "list";
  const generatedAt = normalizeTimestamp(undefined, options.defaultTimestamp);
  const status: PluginReviewArtifactRecordStatus = "loading";
  const comparisonStatus = emptyComparisonStatus();

  return cloneState({
    id: "plugin_review_artifact_record",
    call,
    phase: "loading",
    generatedAt,
    status,
    statusLabel: statusLabel(status),
    headline: buildHeadline(call, status),
    isEmpty: false,
    summaryCards: [
      {
        id: "plugin_review_artifact_record_summary.loading",
        title: "Stored records",
        valueLabel: "Loading",
        status,
        statusLabel: statusLabel(status),
        detailLabels: ["Waiting for persisted plugin review artifact records."],
        actionId: "retry_records",
        ariaLabel: "Stored plugin review artifact records, Loading",
      },
    ],
    recordCards: [],
    comparisonStatus,
    redactionIndicators: [],
    localOnlyIndicators: [],
    actionButtons: [
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
    emptyStates: buildPluginReviewArtifactRecordEmptyStates(),
    errorStates: [],
  });
}

export function buildPluginReviewArtifactRecordCards(
  input: unknown,
  options: BuildPluginReviewArtifactRecordStateOptions = {},
): PluginReviewArtifactRecordCard[] {
  return buildCardsFromNormalizedRecords(
    normalizeInput(input, options).records,
  ).map(cloneRecordCard);
}

export function buildPluginReviewArtifactRecordSummaryCards(
  input: unknown,
  options: BuildPluginReviewArtifactRecordStateOptions = {},
): PluginReviewArtifactRecordSummaryCard[] {
  return buildPluginReviewArtifactRecordState(input, options).summaryCards.map(
    cloneSummaryCard,
  );
}

export function buildPluginReviewArtifactRecordComparisonStatus(
  input: unknown,
  options: BuildPluginReviewArtifactRecordStateOptions = {},
): PluginReviewArtifactRecordComparisonStatus {
  return cloneComparisonStatus(
    buildComparisonStatusFromNormalized(normalizeInput(input, options), options),
  );
}

export function buildPluginReviewArtifactRecordRedactionIndicators(
  input: unknown,
  options: BuildPluginReviewArtifactRecordStateOptions = {},
): PluginReviewArtifactRecordRedactionIndicator[] {
  return buildRedactionIndicatorsFromRecords(
    normalizeInput(input, options).records,
  ).map(cloneRedactionIndicator);
}

export function buildPluginReviewArtifactRecordLocalOnlyIndicators(
  input: unknown,
  options: BuildPluginReviewArtifactRecordStateOptions = {},
): PluginReviewArtifactRecordLocalOnlyIndicator[] {
  return buildLocalOnlyIndicatorsFromRecords(
    normalizeInput(input, options).records,
  ).map(cloneLocalOnlyIndicator);
}

export function buildPluginReviewArtifactRecordActionButtons(
  input: unknown,
  options: BuildPluginReviewArtifactRecordStateOptions = {},
): PluginReviewArtifactRecordActionButton[] {
  return buildPluginReviewArtifactRecordState(input, options).actionButtons.map(
    cloneActionButton,
  );
}

export function buildPluginReviewArtifactRecordEmptyStates(): PluginReviewArtifactRecordEmptyStates {
  return {
    records: buildPluginReviewArtifactRecordEmptyState("records"),
    comparison: buildPluginReviewArtifactRecordEmptyState("comparison"),
    redactions: buildPluginReviewArtifactRecordEmptyState("redactions"),
    locality: buildPluginReviewArtifactRecordEmptyState("locality"),
    actions: buildPluginReviewArtifactRecordEmptyState("actions"),
  };
}

export function buildPluginReviewArtifactRecordEmptyState(
  context: Exclude<
    PluginReviewArtifactRecordContext,
    "create" | "list" | "get" | "compare"
  >,
): IngestSearchEmptyState {
  switch (context) {
    case "records":
      return {
        id: "plugin_review_artifact_records_empty",
        label: "No stored records",
        description: "Persisted plugin review artifact records will appear after a create, list, or get call returns data.",
        ariaLabel: "No persisted plugin review artifact records are available",
        actionLabel: "Refresh records",
      };
    case "comparison":
      return {
        id: "plugin_review_artifact_record_comparison_empty",
        label: "No comparison",
        description: "Comparison status will appear when stored and current review artifact records are compared.",
        ariaLabel: "No plugin review artifact record comparison is available",
      };
    case "redactions":
      return {
        id: "plugin_review_artifact_record_redactions_empty",
        label: "No redaction indicators",
        description: "Redaction indicators will appear when records include redaction metadata.",
        ariaLabel: "No plugin review artifact redaction indicators are available",
      };
    case "locality":
      return {
        id: "plugin_review_artifact_record_locality_empty",
        label: "No local-only indicators",
        description: "Local-only indicators will appear when records include locality metadata.",
        ariaLabel: "No plugin review artifact local-only indicators are available",
      };
    case "actions":
      return {
        id: "plugin_review_artifact_record_actions_empty",
        label: "No record actions",
        description: "Record actions will appear after persisted records are loaded.",
        ariaLabel: "No plugin review artifact record actions are available",
      };
  }
}

export function buildPluginReviewArtifactRecordErrorStates(
  input: unknown,
  options: BuildPluginReviewArtifactRecordStateOptions = {},
): PluginReviewArtifactRecordErrorState[] {
  return normalizeInput(input, options).errorStates.map(cloneErrorState);
}

export function buildPluginReviewArtifactRecordErrorState(
  context: PluginReviewArtifactRecordContext,
  error: unknown,
): PluginReviewArtifactRecordErrorState {
  const description = errorMessage(error) ?? defaultErrorDescription(context);
  const id = `plugin_review_artifact_record_${context}_error`;

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

export function redactPluginReviewArtifactRecordDisplayValue(
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
  options: BuildPluginReviewArtifactRecordStateOptions,
): NormalizedInput {
  const root = clonePlain(input);
  const rootRecord = isRecord(root) ? root : undefined;
  const generatedAt = normalizeTimestamp(
    timestampField(rootRecord, "generatedAt", "generated_at", "createdAt", "created_at"),
    options.defaultTimestamp,
  );
  const call = options.call ?? inferCall(root);
  const errorStates = collectErrorStates(root, call);

  if (options.error !== undefined) {
    errorStates.push(buildPluginReviewArtifactRecordErrorState(call, options.error));
  }

  const records = collectRecordInputs(root)
    .map((record, index) => normalizeRecord(record, index, generatedAt))
    .filter(isDefined)
    .sort(compareRecords);
  const comparisonSource = recordField(rootRecord, "comparison", "compare", "diff");
  const compareLeft =
    recordField(rootRecord, "baselineRecord", "baseline_record", "baseline", "storedRecord", "stored_record", "stored", "expectedRecord", "expected_record", "expected", "left", "before", "original") ??
    recordField(comparisonSource, "baselineRecord", "baseline_record", "baseline", "storedRecord", "stored_record", "stored", "expectedRecord", "expected_record", "expected", "left", "before", "original") ??
    normalizeOptionRecord(options.baselineRecord ?? options.expectedRecord);
  const compareRight =
    recordField(rootRecord, "currentRecord", "current_record", "current", "candidateRecord", "candidate_record", "candidate", "actualRecord", "actual_record", "actual", "right", "after", "preview") ??
    recordField(comparisonSource, "currentRecord", "current_record", "current", "candidateRecord", "candidate_record", "candidate", "actualRecord", "actual_record", "actual", "right", "after", "preview") ??
    normalizeOptionRecord(options.currentRecord);
  const explicitStoredFingerprint =
    safeOptionalString(
      stringField(rootRecord, "storedFingerprint", "stored_fingerprint", "expectedFingerprint", "expected_fingerprint", "baselineFingerprint", "baseline_fingerprint") ??
        stringField(comparisonSource, "storedFingerprint", "stored_fingerprint", "expectedFingerprint", "expected_fingerprint", "baselineFingerprint", "baseline_fingerprint") ??
        options.expectedFingerprint,
      "fingerprint",
    );
  const explicitCurrentFingerprint =
    safeOptionalString(
      stringField(rootRecord, "currentFingerprint", "current_fingerprint", "actualFingerprint", "actual_fingerprint", "candidateFingerprint", "candidate_fingerprint") ??
        stringField(comparisonSource, "currentFingerprint", "current_fingerprint", "actualFingerprint", "actual_fingerprint", "candidateFingerprint", "candidate_fingerprint") ??
        options.currentFingerprint,
      "fingerprint",
    );

  return {
    call,
    generatedAt,
    records,
    compareLeft,
    compareRight,
    explicitStoredFingerprint,
    explicitCurrentFingerprint,
    explicitMatch:
      booleanField(rootRecord, "match", "matches", "equal", "equivalent") ??
      booleanField(comparisonSource, "match", "matches", "equal", "equivalent"),
    errorStates: dedupeErrors(errorStates),
  };
}

function inferCall(input: unknown): PluginReviewArtifactRecordCall {
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
  if (explicit === "compare" || explicit === "comparison" || explicit === "diff") {
    return "compare";
  }
  if (explicit === "list" || explicit === "search") {
    return "list";
  }
  if (
    recordField(input, "comparison", "compare", "diff") !== undefined ||
    recordField(input, "baseline", "current", "candidate", "actual", "expected") !== undefined
  ) {
    return "compare";
  }
  if (recordField(input, "createdRecord", "created_record") !== undefined) {
    return "create";
  }
  if (
    recordField(input, "record", "reviewArtifactRecord", "review_artifact_record", "artifactRecord", "artifact_record") !== undefined
  ) {
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
    arrayField(input, "records", "items", "reviewArtifactRecords", "review_artifact_records", "artifactRecords", "artifact_records", "pluginReviewArtifactRecords", "plugin_review_artifact_records"),
    arrayField(recordField(input, "response", "body", "result"), "records", "items", "reviewArtifactRecords", "review_artifact_records", "artifactRecords", "artifact_records", "pluginReviewArtifactRecords", "plugin_review_artifact_records"),
  ].flat();
  if (arrays.length > 0) {
    return arrays.filter(isRecord);
  }

  const direct =
    recordField(input, "createdRecord", "created_record", "record", "reviewArtifactRecord", "review_artifact_record", "artifactRecord", "artifact_record", "pluginReviewArtifactRecord", "plugin_review_artifact_record") ??
    recordField(recordField(input, "response", "body", "result"), "createdRecord", "created_record", "record", "reviewArtifactRecord", "review_artifact_record", "artifactRecord", "artifact_record", "pluginReviewArtifactRecord", "plugin_review_artifact_record");
  if (direct !== undefined) {
    return [direct];
  }

  return isPersistedRecordLike(input) ? [input] : [];
}

function normalizeRecord(
  input: AnyRecord,
  index: number,
  fallbackTimestamp: string,
): NormalizedRecord | undefined {
  if (!isPersistedRecordLike(input)) {
    return undefined;
  }

  const artifact = selectArtifact(input);
  const artifactState = artifact === undefined
    ? undefined
    : buildPluginReviewArtifactState(artifact, {
        defaultTimestamp: fallbackTimestamp,
      });
  const manifest =
    recordField(artifact, "manifest", "plugin") ??
    recordField(input, "manifest", "plugin");
  const recordId =
    stringField(input, "id", "recordId", "record_id", "reviewArtifactRecordId", "review_artifact_record_id", "artifactRecordId", "artifact_record_id") ??
    stringField(artifact, "recordId", "record_id") ??
    `plugin_review_artifact_record_${index + 1}`;
  const reviewId =
    safeOptionalString(
      stringField(input, "reviewId", "review_id", "artifactId", "artifact_id") ??
        stringField(artifact, "reviewId", "review_id", "artifactId", "artifact_id", "id"),
      "reviewId",
    );
  const pluginId =
    safeOptionalString(
      stringField(input, "pluginId", "plugin_id") ??
        artifactState?.pluginId ??
        stringField(manifest, "id"),
      "pluginId",
    );
  const pluginName =
    safeOptionalString(
      stringField(input, "pluginName", "plugin_name") ??
        artifactState?.pluginName ??
        stringField(manifest, "name") ??
        pluginId,
      "pluginName",
    ) ?? "Plugin review";
  const pluginVersion =
    safeOptionalString(
      stringField(input, "pluginVersion", "plugin_version") ??
        artifactState?.pluginVersion ??
        stringField(manifest, "version"),
      "pluginVersion",
    );
  const generatedAt = normalizeTimestamp(
    timestampField(input, "generatedAt", "generated_at", "createdAt", "created_at", "persistedAt", "persisted_at", "updatedAt", "updated_at") ??
      timestampField(artifact, "generatedAt", "generated_at", "createdAt", "created_at"),
    fallbackTimestamp,
  );
  const fingerprint =
    safeOptionalString(
      stringField(input, "fingerprint", "recordFingerprint", "record_fingerprint") ??
        stringField(artifact, "fingerprint"),
      "fingerprint",
    );
  const artifactFingerprint =
    safeOptionalString(
      stringField(input, "artifactFingerprint", "artifact_fingerprint") ??
        stringField(artifact, "fingerprint"),
      "fingerprint",
    );
  const redaction = readRedactionFacts(input, artifact);
  const locality = readLocalityFacts(input, artifact);

  return {
    root: input,
    artifact,
    recordId,
    displayRecordId: safeDisplayId(recordId, "record"),
    reviewId,
    pluginId,
    pluginName,
    pluginVersion,
    generatedAt,
    decision: normalizeDecision(
      stringField(input, "decision", "approvalDecision", "approval_decision", "reviewDecision", "review_decision") ??
        stringField(artifact, "decision"),
    ),
    fingerprint,
    artifactFingerprint,
    redacted: redaction.redacted,
    redactedFieldCount: redaction.redactedFieldCount,
    redactedPaths: redaction.redactedPaths,
    localOnly: locality.localOnly,
    externalCallCount: locality.externalCallCount,
    localReferenceCount: locality.localReferenceCount,
  };
}

function selectArtifact(record: AnyRecord): AnyRecord | undefined {
  const preview = recordField(record, "preview");
  const direct =
    recordField(record, "artifact", "reviewArtifact", "review_artifact", "pluginReviewArtifact", "plugin_review_artifact") ??
    recordField(preview, "artifact", "reviewArtifact", "review_artifact", "pluginReviewArtifact", "plugin_review_artifact");
  if (direct !== undefined) {
    return direct;
  }
  if (isArtifactLike(record)) {
    return record;
  }
  if (preview !== undefined && isArtifactLike(preview)) {
    return preview;
  }
  return undefined;
}

function isPersistedRecordLike(value: unknown): value is AnyRecord {
  if (!isRecord(value)) {
    return false;
  }

  return (
    stringField(value, "schemaVersion", "schema_version") === "plugin-review-artifact-record/v1" ||
    stringField(value, "kind") === "plugin-review-artifact.record" ||
    stringField(value, "id", "recordId", "record_id", "reviewArtifactRecordId", "review_artifact_record_id", "artifactRecordId", "artifact_record_id") !== undefined ||
    recordField(value, "artifact", "reviewArtifact", "review_artifact", "pluginReviewArtifact", "plugin_review_artifact", "preview") !== undefined ||
    isArtifactLike(value)
  );
}

function isArtifactLike(value: unknown): value is AnyRecord {
  if (!isRecord(value)) {
    return false;
  }
  return (
    stringField(value, "schemaVersion", "schema_version") === "plugin-review-artifact/v1" ||
    stringField(value, "kind") === "plugin-review-artifact.preview" ||
    stringField(value, "kind") === "plugin_review_artifact" ||
    stringField(value, "reviewId", "review_id", "artifactId", "artifact_id") !== undefined ||
    recordField(value, "manifest", "plugin") !== undefined
  );
}

function buildCardsFromNormalizedRecords(
  records: readonly NormalizedRecord[],
): PluginReviewArtifactRecordCard[] {
  return records.map(buildRecordCard).map(cloneRecordCard);
}

function buildRecordCard(
  record: NormalizedRecord,
): PluginReviewArtifactRecordCard {
  const status = recordStatus(record);
  const reviewLabel =
    record.reviewId === undefined ? "Review unavailable" : `Review ${record.reviewId}`;
  const pluginLabel =
    record.pluginId === undefined
      ? record.pluginName
      : `${record.pluginName} (${record.pluginId})`;
  const detailLabels = [
    record.pluginVersion ? `Version ${record.pluginVersion}` : "Version unavailable",
    reviewLabel,
    `Generated at ${record.generatedAt}`,
    `Decision ${decisionLabel(record.decision)}`,
    record.fingerprint ? `Fingerprint ${record.fingerprint}` : "Fingerprint unavailable",
    record.localOnly ? "Local-only record" : "Local-only flag missing",
    record.externalCallCount === 0
      ? "0 external calls"
      : formatCount(record.externalCallCount, "external call"),
    record.redacted
      ? `${formatCount(record.redactedFieldCount, "redacted field")}`
      : "Redaction flag missing",
  ];

  return {
    id: `plugin_review_artifact_record.${safeIdPart(record.recordId, "record")}`,
    recordId: record.displayRecordId,
    title: record.pluginName,
    pluginId: record.pluginId,
    pluginName: record.pluginName,
    pluginVersion: record.pluginVersion,
    pluginLabel,
    reviewId: record.reviewId,
    reviewLabel,
    generatedAt: record.generatedAt,
    decision: record.decision,
    decisionLabel: decisionLabel(record.decision),
    status,
    statusLabel: statusLabel(status),
    fingerprint: record.fingerprint,
    artifactFingerprint: record.artifactFingerprint,
    redacted: record.redacted,
    redactedFieldCount: record.redactedFieldCount,
    localOnly: record.localOnly,
    externalCallCount: record.externalCallCount,
    localReferenceCount: record.localReferenceCount,
    detailLabels,
    actionId: `open_record.${safeIdPart(record.recordId, "record")}`,
    ariaLabel: [
      "Plugin review artifact record",
      record.pluginName,
      record.displayRecordId,
      statusLabel(status),
    ].join(", "),
  };
}

function buildComparisonStatusFromNormalized(
  normalized: NormalizedInput,
  options: BuildPluginReviewArtifactRecordStateOptions,
): PluginReviewArtifactRecordComparisonStatus {
  const draft = buildComparisonDraft(normalized, options);
  if (
    draft.storedFingerprint === undefined &&
    draft.currentFingerprint === undefined &&
    draft.explicitMatch === undefined
  ) {
    return emptyComparisonStatus();
  }

  const kind = comparisonKind(draft);
  const status = comparisonStatus(kind);
  const detailLabels = [
    draft.storedRecordId ? `Stored record ${draft.storedRecordId}` : "Stored record unavailable",
    draft.currentRecordId ? `Current record ${draft.currentRecordId}` : "Current record unavailable",
    draft.storedFingerprint ? `Stored fingerprint ${draft.storedFingerprint}` : "Stored fingerprint unavailable",
    draft.currentFingerprint ? `Current fingerprint ${draft.currentFingerprint}` : "Current fingerprint unavailable",
  ];

  return {
    id: "plugin_review_artifact_record_comparison",
    kind,
    kindLabel: comparisonKindLabel(kind),
    status,
    statusLabel: statusLabel(status),
    storedRecordId: draft.storedRecordId,
    currentRecordId: draft.currentRecordId,
    storedFingerprint: draft.storedFingerprint,
    currentFingerprint: draft.currentFingerprint,
    detailLabels,
    emptyState: buildPluginReviewArtifactRecordEmptyState("comparison"),
    ariaLabel: [
      "Plugin review artifact record comparison",
      comparisonKindLabel(kind),
      statusLabel(status),
    ].join(", "),
  };
}

function buildComparisonDraft(
  normalized: NormalizedInput,
  options: BuildPluginReviewArtifactRecordStateOptions,
): ComparisonDraft {
  const leftRecord = normalized.compareLeft
    ? normalizeRecord(normalized.compareLeft, 0, normalized.generatedAt)
    : undefined;
  const rightRecord = normalized.compareRight
    ? normalizeRecord(normalized.compareRight, 1, normalized.generatedAt)
    : undefined;
  const fallbackLeft = normalized.call === "compare" ? normalized.records[0] : undefined;
  const fallbackRight = normalized.call === "compare" ? normalized.records[1] : undefined;
  const stored = leftRecord ?? fallbackLeft;
  const current = rightRecord ?? fallbackRight;

  return {
    storedRecordId: stored?.displayRecordId,
    currentRecordId: current?.displayRecordId,
    storedFingerprint:
      normalized.explicitStoredFingerprint ??
      stored?.fingerprint ??
      stored?.artifactFingerprint ??
      safeOptionalString(options.expectedFingerprint, "fingerprint"),
    currentFingerprint:
      normalized.explicitCurrentFingerprint ??
      current?.fingerprint ??
      current?.artifactFingerprint ??
      safeOptionalString(options.currentFingerprint, "fingerprint"),
    explicitMatch: normalized.explicitMatch,
  };
}

function buildRedactionIndicatorsFromRecords(
  records: readonly NormalizedRecord[],
): PluginReviewArtifactRecordRedactionIndicator[] {
  return records
    .map(buildRedactionIndicator)
    .sort(compareRedactionIndicators)
    .map(cloneRedactionIndicator);
}

function buildRedactionIndicator(
  record: NormalizedRecord,
): PluginReviewArtifactRecordRedactionIndicator {
  const status = redactionStatus(record);
  return {
    id: `plugin_review_artifact_record_redaction.${safeIdPart(record.recordId, "record")}`,
    recordId: record.displayRecordId,
    label: `${record.pluginName} redactions`,
    status,
    statusLabel: statusLabel(status),
    redacted: record.redacted,
    redactedFieldCount: record.redactedFieldCount,
    redactedPaths: [...record.redactedPaths],
    detailLabels: [
      record.redacted ? "Redacted values retained" : "Redaction flag missing",
      formatCount(record.redactedFieldCount, "redacted field"),
      formatCount(record.redactedPaths.length, "redacted path"),
    ],
    ariaLabel: [
      `${record.pluginName} redactions`,
      statusLabel(status),
      formatCount(record.redactedFieldCount, "redacted field"),
    ].join(", "),
  };
}

function buildLocalOnlyIndicatorsFromRecords(
  records: readonly NormalizedRecord[],
): PluginReviewArtifactRecordLocalOnlyIndicator[] {
  return records
    .map(buildLocalOnlyIndicator)
    .sort(compareLocalOnlyIndicators)
    .map(cloneLocalOnlyIndicator);
}

function buildLocalOnlyIndicator(
  record: NormalizedRecord,
): PluginReviewArtifactRecordLocalOnlyIndicator {
  const status = localOnlyStatus(record);
  return {
    id: `plugin_review_artifact_record_locality.${safeIdPart(record.recordId, "record")}`,
    recordId: record.displayRecordId,
    label: `${record.pluginName} locality`,
    status,
    statusLabel: statusLabel(status),
    localOnly: record.localOnly,
    externalCallCount: record.externalCallCount,
    localReferenceCount: record.localReferenceCount,
    detailLabels: [
      record.localOnly ? "Local-only record" : "Local-only flag missing",
      formatCount(record.externalCallCount, "external call"),
      formatCount(record.localReferenceCount, "local reference"),
    ],
    ariaLabel: [
      `${record.pluginName} locality`,
      statusLabel(status),
      record.localOnly ? "local-only" : "local-only flag missing",
    ].join(", "),
  };
}

function buildSummaryCards(input: {
  recordCards: readonly PluginReviewArtifactRecordCard[];
  comparisonStatus: PluginReviewArtifactRecordComparisonStatus;
  redactionIndicators: readonly PluginReviewArtifactRecordRedactionIndicator[];
  localOnlyIndicators: readonly PluginReviewArtifactRecordLocalOnlyIndicator[];
}): PluginReviewArtifactRecordSummaryCard[] {
  const approvedCount = input.recordCards.filter((card) => card.decision === "approved").length;
  const redactedCount = input.redactionIndicators.filter((indicator) => indicator.redacted).length;
  const localOnlyCount = input.localOnlyIndicators.filter((indicator) => indicator.localOnly).length;
  const privacyStatus = rowsSectionStatus([
    ...input.redactionIndicators,
    ...input.localOnlyIndicators,
  ]);

  return [
    {
      id: "plugin_review_artifact_record_summary.records",
      title: "Stored records",
      valueLabel: formatCount(input.recordCards.length, "record"),
      status: rowsSectionStatus(input.recordCards),
      statusLabel: statusLabel(rowsSectionStatus(input.recordCards)),
      detailLabels: [
        formatCount(approvedCount, "approved record"),
        formatCount(input.recordCards.length - approvedCount, "record needing review"),
      ],
      actionId: "open_records",
      ariaLabel: [
        "Stored plugin review artifact records",
        formatCount(input.recordCards.length, "record"),
      ].join(", "),
    },
    {
      id: "plugin_review_artifact_record_summary.comparison",
      title: "Comparison",
      valueLabel: input.comparisonStatus.kindLabel,
      status: input.comparisonStatus.status,
      statusLabel: input.comparisonStatus.statusLabel,
      detailLabels: [...input.comparisonStatus.detailLabels],
      actionId: "compare_records",
      ariaLabel: [
        "Plugin review artifact record comparison",
        input.comparisonStatus.kindLabel,
      ].join(", "),
    },
    {
      id: "plugin_review_artifact_record_summary.privacy",
      title: "Redaction and locality",
      valueLabel: `${redactedCount}/${input.recordCards.length} redacted`,
      status: privacyStatus,
      statusLabel: statusLabel(privacyStatus),
      detailLabels: [
        `${localOnlyCount}/${input.recordCards.length} local-only`,
        formatCount(totalRedactedFields(input.redactionIndicators), "redacted field"),
        formatCount(totalExternalCalls(input.localOnlyIndicators), "external call"),
      ],
      actionId: "review_record_indicators",
      ariaLabel: [
        "Redaction and locality",
        `${redactedCount}/${input.recordCards.length} redacted`,
        `${localOnlyCount}/${input.recordCards.length} local-only`,
      ].join(", "),
    },
  ].map(cloneSummaryCard);
}

function buildActionButtons(input: {
  call: PluginReviewArtifactRecordCall;
  phase: PluginReviewArtifactRecordPhase;
  status: PluginReviewArtifactRecordStatus;
  recordCards: readonly PluginReviewArtifactRecordCard[];
  comparisonStatus: PluginReviewArtifactRecordComparisonStatus;
  redactionIndicators: readonly PluginReviewArtifactRecordRedactionIndicator[];
  localOnlyIndicators: readonly PluginReviewArtifactRecordLocalOnlyIndicator[];
  errors: readonly PluginReviewArtifactRecordErrorState[];
}): PluginReviewArtifactRecordActionButton[] {
  const hasRecords = input.recordCards.length > 0;
  const hasErrors = input.errors.length > 0 || input.phase === "error";
  const hasComparison = input.comparisonStatus.kind !== "unavailable";
  const hasMismatch =
    input.comparisonStatus.kind === "mismatch" ||
    input.comparisonStatus.kind === "missing_stored" ||
    input.comparisonStatus.kind === "missing_current";
  const hasIndicatorIssue = [
    ...input.redactionIndicators,
    ...input.localOnlyIndicators,
  ].some((indicator) => indicator.status === "attention" || indicator.status === "error");

  if (input.phase === "loading") {
    return [
      action({
        id: "retry_records",
        label: retryLabel(input.call),
        intent: "secondary",
        enabled: false,
        section: input.call,
        disabledReason: "Records are still loading.",
      }),
    ];
  }

  const actions: PluginReviewArtifactRecordActionButton[] = [];
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
    id: "compare_records",
    label: hasMismatch ? "Review record mismatch" : "Compare records",
    intent: hasMismatch ? "danger" : "secondary",
    enabled: hasComparison,
    section: "comparison",
    disabledReason: hasComparison ? undefined : "No comparison is available.",
  }));
  actions.push(action({
    id: "review_record_indicators",
    label: hasIndicatorIssue ? "Review redaction or locality issues" : "Review record indicators",
    intent: hasIndicatorIssue ? "danger" : "secondary",
    enabled: input.redactionIndicators.length > 0 || input.localOnlyIndicators.length > 0,
    section: hasIndicatorIssue ? "redactions" : "locality",
  }));
  actions.push(action({
    id: "continue_with_record",
    label: "Continue with stored review",
    intent: "primary",
    enabled:
      hasRecords &&
      !hasErrors &&
      !hasMismatch &&
      !hasIndicatorIssue &&
      input.status === "complete",
    section: "actions",
    disabledReason:
      hasRecords &&
      !hasErrors &&
      !hasMismatch &&
      !hasIndicatorIssue &&
      input.status === "complete"
        ? undefined
        : "Stored review records need attention first.",
  }));

  return dedupeActions(actions).map(cloneActionButton);
}

function action(input: {
  id: string;
  label: string;
  intent: PluginReviewActionIntent;
  enabled: boolean;
  section?: PluginReviewArtifactRecordContext;
  targetId?: string;
  disabledReason?: string;
}): PluginReviewArtifactRecordActionButton {
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
  normalized: NormalizedInput,
): PluginReviewArtifactRecordPhase {
  if (normalized.errorStates.length > 0) {
    return "error";
  }
  if (normalized.records.length === 0) {
    const comparison = buildComparisonStatusFromNormalized(normalized, {});
    return comparison.kind === "unavailable" ? "empty" : "success";
  }
  return "success";
}

function resolveStateStatus(input: {
  phase: PluginReviewArtifactRecordPhase;
  recordCards: readonly PluginReviewArtifactRecordCard[];
  comparisonStatus: PluginReviewArtifactRecordComparisonStatus;
  redactionIndicators: readonly PluginReviewArtifactRecordRedactionIndicator[];
  localOnlyIndicators: readonly PluginReviewArtifactRecordLocalOnlyIndicator[];
}): PluginReviewArtifactRecordStatus {
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
    ...input.recordCards.map((card) => card.status),
    input.comparisonStatus.kind === "unavailable" ? "complete" : input.comparisonStatus.status,
    ...input.redactionIndicators.map((indicator) => indicator.status),
    ...input.localOnlyIndicators.map((indicator) => indicator.status),
  ];
  if (statuses.includes("error")) {
    return "error";
  }
  if (statuses.includes("attention")) {
    return "attention";
  }
  return "complete";
}

function recordStatus(record: NormalizedRecord): PluginReviewArtifactRecordStatus {
  if (record.externalCallCount > 0) {
    return "error";
  }
  if (record.decision === "denied") {
    return "error";
  }
  if (
    record.decision === "approval_required" ||
    record.decision === "unknown" ||
    record.fingerprint === undefined ||
    !record.localOnly ||
    redactionStatus(record) !== "complete"
  ) {
    return "attention";
  }
  return "complete";
}

function redactionStatus(
  record: NormalizedRecord,
): PluginReviewArtifactRecordStatus {
  if (record.redactedFieldCount > 0 && !record.redacted) {
    return "attention";
  }
  if (!record.redacted && record.redactedPaths.length > 0) {
    return "attention";
  }
  if (!record.redacted && record.redactedFieldCount === 0) {
    return "attention";
  }
  if (record.redactedFieldCount !== record.redactedPaths.length && record.redactedPaths.length > 0) {
    return "attention";
  }
  return "complete";
}

function localOnlyStatus(
  record: NormalizedRecord,
): PluginReviewArtifactRecordStatus {
  if (record.externalCallCount > 0) {
    return "error";
  }
  return record.localOnly ? "complete" : "attention";
}

function comparisonKind(
  draft: ComparisonDraft,
): PluginReviewArtifactRecordComparisonKind {
  if (draft.explicitMatch === true) {
    return "match";
  }
  if (draft.explicitMatch === false) {
    return "mismatch";
  }
  if (draft.storedFingerprint === undefined && draft.currentFingerprint === undefined) {
    return "unavailable";
  }
  if (draft.storedFingerprint === undefined) {
    return "missing_stored";
  }
  if (draft.currentFingerprint === undefined) {
    return "missing_current";
  }
  return draft.storedFingerprint === draft.currentFingerprint ? "match" : "mismatch";
}

function comparisonStatus(
  kind: PluginReviewArtifactRecordComparisonKind,
): PluginReviewArtifactRecordStatus {
  switch (kind) {
    case "match":
      return "complete";
    case "mismatch":
      return "attention";
    case "missing_stored":
    case "missing_current":
      return "error";
    case "unavailable":
      return "empty";
  }
}

function emptyComparisonStatus(): PluginReviewArtifactRecordComparisonStatus {
  const status: PluginReviewArtifactRecordStatus = "empty";
  return {
    id: "plugin_review_artifact_record_comparison",
    kind: "unavailable",
    kindLabel: comparisonKindLabel("unavailable"),
    status,
    statusLabel: statusLabel(status),
    detailLabels: ["Comparison unavailable"],
    emptyState: buildPluginReviewArtifactRecordEmptyState("comparison"),
    ariaLabel: "Plugin review artifact record comparison unavailable",
  };
}

function readRedactionFacts(
  record: AnyRecord,
  artifact: AnyRecord | undefined,
): {
  redacted: boolean;
  redactedFieldCount: number;
  redactedPaths: string[];
} {
  const summary =
    recordField(record, "redactionSummary", "redaction_summary", "redactionReport", "redaction_report") ??
    recordField(artifact, "redactionSummary", "redaction_summary", "redactionReport", "redaction_report");
  const explicitRedactions = [
    ...arrayField(record, "redactions"),
    ...arrayField(summary, "redactions", "items"),
    ...arrayField(artifact, "redactions"),
  ].filter(isRecord);
  const redactedPaths = uniqueStrings([
    ...stringArrayField(record, "redactedPaths", "redacted_paths"),
    ...stringArrayField(summary, "redactedPaths", "redacted_paths", "paths"),
    ...explicitRedactions
      .map((item) => stringField(item, "path", "field", "jsonPath", "json_path"))
      .filter(isDefined),
  ].map((path) => redactPluginReviewArtifactRecordDisplayValue(path, "path")));
  const redactedFieldCount =
    nonNegativeIntegerField(record, "redactedFieldCount", "redacted_field_count", "redactionCount", "redaction_count") ??
    nonNegativeIntegerField(summary, "redactedFieldCount", "redacted_field_count", "redactionCount", "redaction_count", "count") ??
    explicitRedactions.reduce(
      (total, item) => total + (nonNegativeIntegerField(item, "replacements", "count") ?? 1),
      0,
    ) ??
    redactedPaths.length;
  const redacted =
    booleanField(record, "redacted", "isRedacted", "is_redacted") ??
    booleanField(summary, "redacted", "isRedacted", "is_redacted") ??
    booleanField(artifact, "redacted") ??
    redactedFieldCount > 0;

  return {
    redacted,
    redactedFieldCount,
    redactedPaths,
  };
}

function readLocalityFacts(
  record: AnyRecord,
  artifact: AnyRecord | undefined,
): {
  localOnly: boolean;
  externalCallCount: number;
  localReferenceCount: number;
} {
  const scope = recordField(record, "scope") ?? recordField(artifact, "scope");
  const evidence = [
    ...arrayField(record, "evidence", "localEvidence", "local_evidence"),
    ...arrayField(artifact, "evidence", "localEvidence", "local_evidence"),
  ].filter(isRecord);
  const externalCallCount =
    nonNegativeIntegerField(record, "externalCalls", "external_calls", "externalCallCount", "external_call_count") ??
    nonNegativeIntegerField(scope, "externalCalls", "external_calls", "externalCallCount", "external_call_count") ??
    0;
  const localReferenceCount =
    nonNegativeIntegerField(record, "localReferenceCount", "local_reference_count") ??
    evidence.filter((item) =>
      booleanField(item, "localOnly", "local_only") === true ||
      optionalStringList(stringField(item, "path", "uri")).some(isLocalReference)
    ).length;
  const localOnly =
    booleanField(record, "localOnly", "local_only") ??
    booleanField(scope, "localOnly", "local_only") ??
    booleanField(artifact, "localOnly", "local_only") ??
    (externalCallCount === 0 && localReferenceCount > 0);

  return {
    localOnly,
    externalCallCount,
    localReferenceCount,
  };
}

function collectErrorStates(
  root: unknown,
  call: PluginReviewArtifactRecordCall,
): PluginReviewArtifactRecordErrorState[] {
  const errors: PluginReviewArtifactRecordErrorState[] = [];
  if (root !== undefined && !isRecord(root) && !Array.isArray(root)) {
    errors.push(
      buildPluginReviewArtifactRecordErrorState(
        call,
        "Plugin review artifact record response must be an object or array.",
      ),
    );
  }
  const rootRecord = isRecord(root) ? root : undefined;
  const rootError = errorMessage(rootRecord?.error);
  if (rootError !== undefined) {
    errors.push(buildPluginReviewArtifactRecordErrorState(call, rootError));
  }
  for (const error of arrayField(rootRecord, "errors")) {
    errors.push(buildPluginReviewArtifactRecordErrorState(call, error));
  }
  return errors;
}

function normalizeOptionRecord(value: unknown): AnyRecord | undefined {
  return isRecord(value) ? clonePlain(value) : undefined;
}

function normalizeDecision(
  value: string | undefined,
): PluginReviewArtifactDecision {
  const normalized = normalizeToken(value);
  if (normalized === "approved" || normalized === "approve" || normalized === "allow") {
    return "approved";
  }
  if (
    normalized === "approval_required" ||
    normalized === "requires_approval" ||
    normalized === "require_approval" ||
    normalized === "pending"
  ) {
    return "approval_required";
  }
  if (normalized === "denied" || normalized === "deny" || normalized === "rejected") {
    return "denied";
  }
  return "unknown";
}

function decisionLabel(decision: PluginReviewArtifactDecision): string {
  switch (decision) {
    case "approved":
      return "Approved";
    case "approval_required":
      return "Approval required";
    case "denied":
      return "Denied";
    case "unknown":
      return "Unknown";
  }
}

function statusLabel(status: PluginReviewArtifactRecordStatus): string {
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

function comparisonKindLabel(
  kind: PluginReviewArtifactRecordComparisonKind,
): string {
  switch (kind) {
    case "match":
      return "Records match";
    case "mismatch":
      return "Record drift";
    case "missing_stored":
      return "Stored fingerprint missing";
    case "missing_current":
      return "Current fingerprint missing";
    case "unavailable":
      return "Comparison unavailable";
  }
}

function buildHeadline(
  call: PluginReviewArtifactRecordCall,
  status: PluginReviewArtifactRecordStatus,
): string {
  const subject = {
    create: "Created plugin review artifact record",
    list: "Stored plugin review artifact records",
    get: "Stored plugin review artifact record",
    compare: "Plugin review artifact record comparison",
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

function errorLabel(context: PluginReviewArtifactRecordContext): string {
  switch (context) {
    case "create":
      return "Plugin review artifact record could not be created";
    case "list":
      return "Plugin review artifact records could not load";
    case "get":
      return "Plugin review artifact record could not load";
    case "compare":
      return "Plugin review artifact records could not be compared";
    case "records":
      return "Stored plugin review artifact records could not load";
    case "comparison":
      return "Plugin review artifact record comparison could not load";
    case "redactions":
      return "Plugin review artifact record redactions could not load";
    case "locality":
      return "Plugin review artifact record locality could not load";
    case "actions":
      return "Plugin review artifact record actions could not load";
  }
}

function retryLabel(context: PluginReviewArtifactRecordContext): string {
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
    case "comparison":
      return "Retry comparison";
    case "redactions":
      return "Retry redactions";
    case "locality":
      return "Retry locality";
    case "actions":
      return "Retry actions";
  }
}

function defaultErrorDescription(
  context: PluginReviewArtifactRecordContext,
): string {
  switch (context) {
    case "create":
      return "Create a persisted plugin review artifact record and try again.";
    case "list":
      return "Refresh persisted plugin review artifact records and try again.";
    case "get":
      return "Refresh the persisted plugin review artifact record and try again.";
    case "compare":
      return "Refresh the comparison inputs and try again.";
    case "records":
      return "Refresh stored records and try again.";
    case "comparison":
      return "Refresh comparison rows and try again.";
    case "redactions":
      return "Refresh redaction indicators and try again.";
    case "locality":
      return "Refresh local-only indicators and try again.";
    case "actions":
      return "Refresh record actions and try again.";
  }
}

function rowsSectionStatus(
  rows: readonly { status: PluginReviewArtifactRecordStatus }[],
): PluginReviewArtifactRecordStatus {
  if (rows.length === 0) {
    return "empty";
  }
  if (rows.some((row) => row.status === "error")) {
    return "error";
  }
  if (rows.some((row) => row.status === "attention")) {
    return "attention";
  }
  if (rows.some((row) => row.status === "loading")) {
    return "loading";
  }
  return "complete";
}

function statusRank(status: PluginReviewArtifactRecordStatus): number {
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

function compareRecords(left: NormalizedRecord, right: NormalizedRecord): number {
  return (
    right.generatedAt.localeCompare(left.generatedAt) ||
    left.pluginName.localeCompare(right.pluginName) ||
    left.displayRecordId.localeCompare(right.displayRecordId)
  );
}

function compareRedactionIndicators(
  left: PluginReviewArtifactRecordRedactionIndicator,
  right: PluginReviewArtifactRecordRedactionIndicator,
): number {
  return (
    statusRank(left.status) - statusRank(right.status) ||
    right.redactedFieldCount - left.redactedFieldCount ||
    left.label.localeCompare(right.label) ||
    left.recordId.localeCompare(right.recordId)
  );
}

function compareLocalOnlyIndicators(
  left: PluginReviewArtifactRecordLocalOnlyIndicator,
  right: PluginReviewArtifactRecordLocalOnlyIndicator,
): number {
  return (
    statusRank(left.status) - statusRank(right.status) ||
    right.externalCallCount - left.externalCallCount ||
    left.label.localeCompare(right.label) ||
    left.recordId.localeCompare(right.recordId)
  );
}

function dedupeActions(
  actions: readonly PluginReviewArtifactRecordActionButton[],
): PluginReviewArtifactRecordActionButton[] {
  const seen = new Set<string>();
  const deduped: PluginReviewArtifactRecordActionButton[] = [];
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
  errors: readonly PluginReviewArtifactRecordErrorState[],
): PluginReviewArtifactRecordErrorState[] {
  const seen = new Set<string>();
  const deduped: PluginReviewArtifactRecordErrorState[] = [];
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

function totalRedactedFields(
  indicators: readonly PluginReviewArtifactRecordRedactionIndicator[],
): number {
  return indicators.reduce((total, indicator) => total + indicator.redactedFieldCount, 0);
}

function totalExternalCalls(
  indicators: readonly PluginReviewArtifactRecordLocalOnlyIndicator[],
): number {
  return indicators.reduce((total, indicator) => total + indicator.externalCallCount, 0);
}

function safeOptionalString(
  value: string | undefined,
  keyHint?: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const redacted = redactPluginReviewArtifactRecordDisplayValue(value, keyHint);
  return redacted === "Unavailable" ? undefined : redacted;
}

function safeDisplayId(value: string, fallback: string): string {
  const redacted = redactPluginReviewArtifactRecordDisplayValue(value, "recordId");
  if (redacted === REDACTED || redacted === "Unavailable") {
    return fallback;
  }
  return redacted;
}

function safeIdPart(value: string, fallback: string): string {
  const redacted = redactPluginReviewArtifactRecordDisplayValue(value);
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

function optionalStringList(value: string | undefined): string[] {
  return value === undefined || value.trim() === "" ? [] : [value.trim()];
}

function isRecord(value: unknown): value is AnyRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
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

function formatCount(
  value: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value !== ""))];
}

function isLocalReference(value: string): boolean {
  if (
    value.startsWith("file://") ||
    value.startsWith("fixture://") ||
    value.startsWith("workspace://") ||
    value.startsWith("sovereignops://") ||
    value.startsWith("/") ||
    /^[a-zA-Z]:[\\/]/.test(value)
  ) {
    return true;
  }

  return !/^[a-z]+:\/\//i.test(value);
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

function cloneState(
  state: PluginReviewArtifactRecordState,
): PluginReviewArtifactRecordState {
  return {
    ...state,
    summaryCards: state.summaryCards.map(cloneSummaryCard),
    recordCards: state.recordCards.map(cloneRecordCard),
    comparisonStatus: cloneComparisonStatus(state.comparisonStatus),
    redactionIndicators: state.redactionIndicators.map(cloneRedactionIndicator),
    localOnlyIndicators: state.localOnlyIndicators.map(cloneLocalOnlyIndicator),
    actionButtons: state.actionButtons.map(cloneActionButton),
    emptyStates: {
      records: { ...state.emptyStates.records },
      comparison: { ...state.emptyStates.comparison },
      redactions: { ...state.emptyStates.redactions },
      locality: { ...state.emptyStates.locality },
      actions: { ...state.emptyStates.actions },
    },
    errorStates: state.errorStates.map(cloneErrorState),
  };
}

function cloneSummaryCard(
  card: PluginReviewArtifactRecordSummaryCard,
): PluginReviewArtifactRecordSummaryCard {
  return {
    ...card,
    detailLabels: [...card.detailLabels],
  };
}

function cloneRecordCard(
  card: PluginReviewArtifactRecordCard,
): PluginReviewArtifactRecordCard {
  return {
    ...card,
    detailLabels: [...card.detailLabels],
  };
}

function cloneComparisonStatus(
  status: PluginReviewArtifactRecordComparisonStatus,
): PluginReviewArtifactRecordComparisonStatus {
  return {
    ...status,
    detailLabels: [...status.detailLabels],
    emptyState: { ...status.emptyState },
    errorState: status.errorState === undefined ? undefined : { ...status.errorState },
  };
}

function cloneRedactionIndicator(
  indicator: PluginReviewArtifactRecordRedactionIndicator,
): PluginReviewArtifactRecordRedactionIndicator {
  return {
    ...indicator,
    redactedPaths: [...indicator.redactedPaths],
    detailLabels: [...indicator.detailLabels],
  };
}

function cloneLocalOnlyIndicator(
  indicator: PluginReviewArtifactRecordLocalOnlyIndicator,
): PluginReviewArtifactRecordLocalOnlyIndicator {
  return {
    ...indicator,
    detailLabels: [...indicator.detailLabels],
  };
}

function cloneActionButton(
  actionItem: PluginReviewArtifactRecordActionButton,
): PluginReviewArtifactRecordActionButton {
  return { ...actionItem };
}

function cloneErrorState(
  error: PluginReviewArtifactRecordErrorState,
): PluginReviewArtifactRecordErrorState {
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
