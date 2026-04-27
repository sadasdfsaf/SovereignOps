export type LocalEventAcceptancePhase = "loading" | "success" | "error";

export type LocalEventAcceptanceStatus =
  | "loading"
  | "empty"
  | "ready"
  | "attention"
  | "blocked"
  | "error";

export type LocalEventAcceptanceSourceKind =
  | "api_requests"
  | "sdk_session"
  | "replay_export"
  | "import_plan";

export type LocalEventAcceptanceCardKind =
  | "summary"
  | "api_request"
  | "sdk_step"
  | "sdk_fetch_call"
  | "replay_export_batch"
  | "import_preflight_check"
  | "import_batch";

export interface BuildLocalEventAcceptanceStateOptions {
  defaultTimestamp?: string;
  loading?: boolean;
  error?: unknown;
}

export interface LocalEventAcceptanceInput {
  apiRequests?: unknown;
  apiRequestFixture?: unknown;
  apiRequestSummary?: unknown;
  sdkSession?: unknown;
  sdkSessionResults?: unknown;
  replayExport?: unknown;
  replayExportManifest?: unknown;
  exportManifest?: unknown;
  exportSession?: unknown;
  importPlan?: unknown;
  importPlanSummary?: unknown;
}

export interface LocalEventAcceptanceState {
  id: "local_event_acceptance";
  phase: LocalEventAcceptancePhase;
  generatedAt: string;
  status: LocalEventAcceptanceStatus;
  statusLabel: string;
  sourceCount: number;
  localOnly: LocalEventAcceptanceLocalOnlyState;
  redactions: LocalEventAcceptanceRedactionState;
  replaySteps: LocalEventAcceptanceReplayStepState;
  exportFormats: LocalEventAcceptanceExportFormatState;
  importReadiness: LocalEventAcceptanceImportReadinessState;
  summaryCards: LocalEventAcceptanceCard[];
  panels: {
    apiRequests: LocalEventAcceptancePanel;
    sdkSession: LocalEventAcceptancePanel;
    replayExport: LocalEventAcceptancePanel;
    importPlan: LocalEventAcceptancePanel;
  };
  emptyStates: LocalEventAcceptanceEmptyStates;
  errorStates: LocalEventAcceptanceErrorState[];
}

export interface LocalEventAcceptanceLocalOnlyState {
  status: LocalEventAcceptanceStatus;
  statusLabel: string;
  localOnly: boolean;
  allSourcesLocalOnly: boolean;
  sourceCount: number;
  localOnlyCount: number;
  nonLocalSourceIds: LocalEventAcceptanceSourceKind[];
  unknownSourceIds: LocalEventAcceptanceSourceKind[];
  networkMode?: string;
  detailLabels: string[];
  ariaLabel: string;
}

export interface LocalEventAcceptanceRedactionState {
  status: LocalEventAcceptanceStatus;
  statusLabel: string;
  redactedEventCount: number;
  redactedFieldCount: number;
  importRedactedFieldCount: number;
  sources: LocalEventAcceptanceRedactionSource[];
  detailLabels: string[];
  ariaLabel: string;
}

export interface LocalEventAcceptanceRedactionSource {
  sourceId: LocalEventAcceptanceSourceKind;
  label: string;
  redactedEventCount?: number;
  redactedFieldCount?: number;
}

export interface LocalEventAcceptanceReplayStepState {
  status: LocalEventAcceptanceStatus;
  statusLabel: string;
  apiRequestCount: number;
  sdkStepCount: number;
  fixtureFetchCallCount: number;
  replayBatchCount: number;
  replayEventCount: number;
  preflightCheckCount: number;
  importBatchCount: number;
  detailLabels: string[];
  ariaLabel: string;
}

export interface LocalEventAcceptanceExportFormatState {
  status: LocalEventAcceptanceStatus;
  statusLabel: string;
  formats: string[];
  formatCount: number;
  stdoutOnly: boolean;
  writesOnlyWithOutputPath: boolean;
  packageKind?: string;
  manifestKind?: string;
  detailLabels: string[];
  ariaLabel: string;
}

export interface LocalEventAcceptanceImportReadinessState {
  status: LocalEventAcceptanceStatus;
  statusLabel: string;
  ready: boolean;
  label: string;
  dryRun: boolean;
  strategy?: string;
  integrityFailureMode?: string;
  duplicateEventHandling?: string;
  preflightCheckCount: number;
  requiredCheckCount: number;
  failedCheckCount: number;
  importBatchCount: number;
  readyBatchCount: number;
  detailLabels: string[];
  ariaLabel: string;
}

export interface LocalEventAcceptancePanel {
  id: string;
  sourceId: LocalEventAcceptanceSourceKind;
  title: string;
  status: LocalEventAcceptanceStatus;
  statusLabel: string;
  value: string;
  localOnly?: boolean;
  generatedAt?: string;
  detailLabels: string[];
  cards: LocalEventAcceptanceCard[];
  metadata: LocalEventAcceptanceMetadata;
  emptyState: LocalEventAcceptanceEmptyState;
  ariaLabel: string;
}

export interface LocalEventAcceptanceCard {
  id: string;
  kind: LocalEventAcceptanceCardKind;
  title: string;
  value: string;
  status: LocalEventAcceptanceStatus;
  statusLabel: string;
  badgeLabels: string[];
  detailLabels: string[];
  metadata: LocalEventAcceptanceMetadata;
  ariaLabel: string;
}

export interface LocalEventAcceptanceEmptyStates {
  apiRequests: LocalEventAcceptanceEmptyState;
  sdkSession: LocalEventAcceptanceEmptyState;
  replayExport: LocalEventAcceptanceEmptyState;
  importPlan: LocalEventAcceptanceEmptyState;
  errors: LocalEventAcceptanceEmptyState;
}

export interface LocalEventAcceptanceEmptyState {
  id: string;
  label: string;
  description: string;
  ariaLabel: string;
  actionLabel?: string;
}

export interface LocalEventAcceptanceErrorState {
  id: string;
  label: string;
  description: string;
  ariaLabel: string;
  retryLabel: string;
}

export type LocalEventAcceptanceMetadata = Record<
  string,
  string | number | boolean | string[] | number[] | undefined
>;

type AnyRecord = Record<string, unknown>;

interface NormalizedInputs {
  apiRequests?: AnyRecord;
  sdkSession?: AnyRecord;
  replayExport?: AnyRecord;
  importPlan?: AnyRecord;
}

interface SourceProbe {
  id: LocalEventAcceptanceSourceKind;
  label: string;
  source?: AnyRecord;
  generatedAt?: string;
  localOnly?: boolean;
  networkMode?: string;
}

interface ApiRequestRecord {
  id: string;
  index: number;
  method: string;
  path: string;
  statusCode?: number;
  eventCount: number;
  replayBatchCount: number;
  redactedEventCount?: number;
  redactedFieldCount?: number;
}

interface ReplayBatchRecord {
  id: string;
  index: number;
  eventCount: number;
  firstSequence?: number;
  lastSequence?: number;
  firstEventId?: string;
  lastEventId?: string;
  stage?: string;
}

interface RedactionMetric {
  sourceId: LocalEventAcceptanceSourceKind;
  label: string;
  redactedEventCount?: number;
  redactedFieldCount?: number;
}

const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const EXPECTED_SOURCE_COUNT = 4;

export function buildLocalEventAcceptanceState(
  input: unknown,
  options: BuildLocalEventAcceptanceStateOptions = {},
): LocalEventAcceptanceState {
  if (options.loading === true) {
    return buildLocalEventAcceptanceLoadingState(options);
  }

  const normalized = normalizeAcceptanceInputs(input);
  const generatedAt = latestTimestamp(
    [
      timestampField(normalized.apiRequests, "generatedAt", "generated_at"),
      timestampField(normalized.sdkSession, "generatedAt", "generated_at"),
      timestampField(normalized.replayExport, "generatedAt", "generated_at"),
      timestampField(normalized.importPlan, "generatedAt", "generated_at"),
    ],
    options.defaultTimestamp,
  );
  const panels = {
    apiRequests: buildApiPanel(normalized.apiRequests),
    sdkSession: buildSdkPanel(normalized.sdkSession),
    replayExport: buildReplayExportPanel(normalized.replayExport),
    importPlan: buildImportPlanPanel(normalized.importPlan),
  };
  const sourceProbes = buildSourceProbes(normalized);
  const localOnly = buildLocalOnlyState(sourceProbes);
  const redactions = buildRedactionState(normalized);
  const replaySteps = buildReplayStepState(normalized, panels);
  const exportFormats = buildExportFormatState(normalized.sdkSession, normalized.replayExport);
  const importReadiness = buildImportReadinessState(normalized.importPlan);
  const errors =
    options.error === undefined
      ? []
      : [buildLocalEventAcceptanceErrorState(options.error)];
  const status = resolveAcceptanceStatus({
    sourceCount: sourceProbes.length,
    localOnly,
    importReadiness,
    errors,
  });
  const phase: LocalEventAcceptancePhase = errors.length > 0 ? "error" : "success";

  return cloneAcceptanceState({
    id: "local_event_acceptance",
    phase,
    generatedAt,
    status,
    statusLabel: getLocalEventAcceptanceStatusLabel(status),
    sourceCount: sourceProbes.length,
    localOnly,
    redactions,
    replaySteps,
    exportFormats,
    importReadiness,
    summaryCards: buildSummaryCards({
      localOnly,
      redactions,
      replaySteps,
      exportFormats,
      importReadiness,
    }),
    panels,
    emptyStates: buildLocalEventAcceptanceEmptyStates(),
    errorStates: errors,
  });
}

export function buildLocalEventAcceptanceLoadingState(
  options: Pick<BuildLocalEventAcceptanceStateOptions, "defaultTimestamp"> = {},
): LocalEventAcceptanceState {
  const status: LocalEventAcceptanceStatus = "loading";
  const generatedAt = normalizeTimestamp(undefined, options.defaultTimestamp);
  const emptyStates = buildLocalEventAcceptanceEmptyStates();
  const loadingPanel = (sourceId: LocalEventAcceptanceSourceKind, title: string) =>
    clonePanel({
      id: `local_event_acceptance.${sourceId}`,
      sourceId,
      title,
      status,
      statusLabel: getLocalEventAcceptanceStatusLabel(status),
      value: "Loading",
      detailLabels: ["Waiting for local event acceptance fixture data."],
      cards: [],
      metadata: {},
      emptyState: buildEmptyState(sourceId),
      ariaLabel: `${title}, Loading`,
    });
  const localOnly: LocalEventAcceptanceLocalOnlyState = {
    status,
    statusLabel: getLocalEventAcceptanceStatusLabel(status),
    localOnly: false,
    allSourcesLocalOnly: false,
    sourceCount: 0,
    localOnlyCount: 0,
    nonLocalSourceIds: [],
    unknownSourceIds: [],
    detailLabels: ["Waiting for local-only source checks."],
    ariaLabel: "Local-only status loading",
  };
  const redactions: LocalEventAcceptanceRedactionState = {
    status,
    statusLabel: getLocalEventAcceptanceStatusLabel(status),
    redactedEventCount: 0,
    redactedFieldCount: 0,
    importRedactedFieldCount: 0,
    sources: [],
    detailLabels: ["Waiting for redaction counts."],
    ariaLabel: "Redaction counts loading",
  };
  const replaySteps: LocalEventAcceptanceReplayStepState = {
    status,
    statusLabel: getLocalEventAcceptanceStatusLabel(status),
    apiRequestCount: 0,
    sdkStepCount: 0,
    fixtureFetchCallCount: 0,
    replayBatchCount: 0,
    replayEventCount: 0,
    preflightCheckCount: 0,
    importBatchCount: 0,
    detailLabels: ["Waiting for replay step counts."],
    ariaLabel: "Replay step counts loading",
  };
  const exportFormats: LocalEventAcceptanceExportFormatState = {
    status,
    statusLabel: getLocalEventAcceptanceStatusLabel(status),
    formats: [],
    formatCount: 0,
    stdoutOnly: false,
    writesOnlyWithOutputPath: false,
    detailLabels: ["Waiting for export format data."],
    ariaLabel: "Export formats loading",
  };
  const importReadiness: LocalEventAcceptanceImportReadinessState = {
    status,
    statusLabel: getLocalEventAcceptanceStatusLabel(status),
    ready: false,
    label: "Loading",
    dryRun: false,
    preflightCheckCount: 0,
    requiredCheckCount: 0,
    failedCheckCount: 0,
    importBatchCount: 0,
    readyBatchCount: 0,
    detailLabels: ["Waiting for import readiness data."],
    ariaLabel: "Import readiness loading",
  };

  return cloneAcceptanceState({
    id: "local_event_acceptance",
    phase: "loading",
    generatedAt,
    status,
    statusLabel: getLocalEventAcceptanceStatusLabel(status),
    sourceCount: 0,
    localOnly,
    redactions,
    replaySteps,
    exportFormats,
    importReadiness,
    summaryCards: buildSummaryCards({
      localOnly,
      redactions,
      replaySteps,
      exportFormats,
      importReadiness,
    }),
    panels: {
      apiRequests: loadingPanel("api_requests", "API request fixtures"),
      sdkSession: loadingPanel("sdk_session", "SDK session"),
      replayExport: loadingPanel("replay_export", "Replay export manifest"),
      importPlan: loadingPanel("import_plan", "Import plan"),
    },
    emptyStates,
    errorStates: [],
  });
}

export function buildLocalEventAcceptanceSummaryCards(
  input: unknown,
  options: BuildLocalEventAcceptanceStateOptions = {},
): LocalEventAcceptanceCard[] {
  return buildLocalEventAcceptanceState(input, options).summaryCards.map(cloneCard);
}

export function buildLocalEventAcceptanceApiPanel(
  input: unknown,
): LocalEventAcceptancePanel {
  return buildApiPanel(isRecord(input) ? clonePlain(input) : undefined);
}

export function buildLocalEventAcceptanceSdkPanel(
  input: unknown,
): LocalEventAcceptancePanel {
  return buildSdkPanel(isRecord(input) ? clonePlain(input) : undefined);
}

export function buildLocalEventAcceptanceReplayExportPanel(
  input: unknown,
): LocalEventAcceptancePanel {
  return buildReplayExportPanel(isRecord(input) ? clonePlain(input) : undefined);
}

export function buildLocalEventAcceptanceImportPlanPanel(
  input: unknown,
): LocalEventAcceptancePanel {
  return buildImportPlanPanel(isRecord(input) ? clonePlain(input) : undefined);
}

export function buildLocalEventAcceptanceEmptyStates(): LocalEventAcceptanceEmptyStates {
  return {
    apiRequests: buildEmptyState("api_requests"),
    sdkSession: buildEmptyState("sdk_session"),
    replayExport: buildEmptyState("replay_export"),
    importPlan: buildEmptyState("import_plan"),
    errors: {
      id: "local_event_acceptance_errors_empty",
      label: "No acceptance errors",
      description: "Local event acceptance checks have not reported errors.",
      ariaLabel: "No local event acceptance errors are present",
    },
  };
}

export function buildLocalEventAcceptanceErrorState(
  error: unknown,
): LocalEventAcceptanceErrorState {
  return {
    id: "local_event_acceptance_error",
    label: "Acceptance state could not load",
    description: errorMessage(error) ?? "Refresh local event acceptance data and try again.",
    ariaLabel: "Local event acceptance state could not load",
    retryLabel: "Retry acceptance state",
  };
}

export function getLocalEventAcceptanceStatusLabel(
  status: LocalEventAcceptanceStatus,
): string {
  switch (status) {
    case "loading":
      return "Loading";
    case "empty":
      return "Empty";
    case "ready":
      return "Ready";
    case "attention":
      return "Attention";
    case "blocked":
      return "Blocked";
    case "error":
      return "Error";
  }
}

function normalizeAcceptanceInputs(input: unknown): NormalizedInputs {
  const root = isRecord(input) ? clonePlain(input) : undefined;

  if (root === undefined) {
    return {};
  }

  return {
    apiRequests:
      recordField(root, "apiRequests", "apiRequestFixture", "apiRequestSummary") ??
      (looksLikeApiRequests(root) ? root : undefined),
    sdkSession:
      recordField(root, "sdkSession", "sdkSessionResults") ??
      (looksLikeSdkSession(root) ? root : undefined),
    replayExport:
      recordField(root, "replayExport", "replayExportManifest", "exportManifest", "exportSession") ??
      (looksLikeReplayExport(root) ? root : undefined),
    importPlan:
      recordField(root, "importPlan", "importPlanSummary") ??
      (looksLikeImportPlan(root) ? root : undefined),
  };
}

function buildSourceProbes(input: NormalizedInputs): SourceProbe[] {
  return [
    buildSourceProbe("api_requests", "API request fixture", input.apiRequests),
    buildSourceProbe("sdk_session", "SDK session", input.sdkSession),
    buildSourceProbe("replay_export", "Replay export manifest", input.replayExport),
    buildSourceProbe("import_plan", "Import plan", input.importPlan),
  ].filter((source): source is SourceProbe & { source: AnyRecord } => source.source !== undefined);
}

function buildSourceProbe(
  id: LocalEventAcceptanceSourceKind,
  label: string,
  source: AnyRecord | undefined,
): SourceProbe {
  return {
    id,
    label,
    source,
    generatedAt: timestampField(source, "generatedAt", "generated_at"),
    localOnly: resolveLocalOnly(source),
    networkMode: stringField(recordField(source, "network"), "mode"),
  };
}

function buildLocalOnlyState(
  sources: readonly SourceProbe[],
): LocalEventAcceptanceLocalOnlyState {
  const localOnlySources = sources.filter((source) => source.localOnly === true);
  const nonLocalSourceIds = sources
    .filter((source) => source.localOnly === false)
    .map((source) => source.id);
  const unknownSourceIds = sources
    .filter((source) => source.localOnly === undefined)
    .map((source) => source.id);
  const allSourcesLocalOnly =
    sources.length > 0 &&
    localOnlySources.length === sources.length &&
    unknownSourceIds.length === 0;
  const networkMode = sources.find((source) => source.networkMode !== undefined)?.networkMode;
  const status: LocalEventAcceptanceStatus =
    sources.length === 0
      ? "empty"
      : nonLocalSourceIds.length > 0
        ? "blocked"
        : unknownSourceIds.length > 0
          ? "attention"
          : "ready";
  const detailLabels = [
    formatCount(localOnlySources.length, "local-only source"),
    formatCount(nonLocalSourceIds.length, "external source"),
  ];

  if (unknownSourceIds.length > 0) {
    detailLabels.push(formatCount(unknownSourceIds.length, "unknown source"));
  }
  if (networkMode !== undefined) {
    detailLabels.push(`Network ${networkMode}`);
  }

  return {
    status,
    statusLabel: getLocalEventAcceptanceStatusLabel(status),
    localOnly: allSourcesLocalOnly,
    allSourcesLocalOnly,
    sourceCount: sources.length,
    localOnlyCount: localOnlySources.length,
    nonLocalSourceIds,
    unknownSourceIds,
    networkMode,
    detailLabels,
    ariaLabel: [
      "Local-only status",
      allSourcesLocalOnly ? "local only" : "not fully local only",
      formatCount(sources.length, "source"),
      ...detailLabels,
    ].join(", "),
  };
}

function buildRedactionState(input: NormalizedInputs): LocalEventAcceptanceRedactionState {
  const sources = collectRedactionMetrics(input);
  const redactedEventCount = maxNumber(
    sources.map((source) => source.redactedEventCount),
  );
  const redactedFieldCount = maxNumber(
    sources.map((source) => source.redactedFieldCount),
  );
  const importRedactedFieldCount =
    arrayField(recordField(input.importPlan, "audit"), "redactedFields", "redacted_fields")
      .filter((value) => typeof value === "string")
      .length;
  const status: LocalEventAcceptanceStatus =
    redactedFieldCount > 0 || redactedEventCount > 0 || importRedactedFieldCount > 0
      ? "attention"
      : sources.length === 0
        ? "empty"
        : "ready";
  const detailLabels = [
    formatCount(redactedEventCount, "redacted event"),
    formatCount(redactedFieldCount, "redacted field"),
    formatCount(importRedactedFieldCount, "import redacted field"),
  ];

  return {
    status,
    statusLabel: getLocalEventAcceptanceStatusLabel(status),
    redactedEventCount,
    redactedFieldCount,
    importRedactedFieldCount,
    sources: sources.map(cloneRedactionSource),
    detailLabels,
    ariaLabel: ["Redaction counts", ...detailLabels].join(", "),
  };
}

function collectRedactionMetrics(input: NormalizedInputs): RedactionMetric[] {
  const metrics: RedactionMetric[] = [];
  const apiSummary = findApiSummaryBody(input.apiRequests);
  const apiRedactedEventCount = nonNegativeIntegerField(
    apiSummary,
    "redactedEventCount",
    "redacted_event_count",
  );
  const apiRedactedFieldCount = nonNegativeIntegerField(
    apiSummary,
    "redactedFieldCount",
    "redacted_field_count",
  );

  if (apiRedactedEventCount !== undefined || apiRedactedFieldCount !== undefined) {
    metrics.push({
      sourceId: "api_requests",
      label: "API summary",
      redactedEventCount: apiRedactedEventCount,
      redactedFieldCount: apiRedactedFieldCount,
    });
  }

  const sdkSummary = findSdkSummaryReturn(input.sdkSession);
  const sdkWebRedactions = recordField(
    recordField(recordField(input.sdkSession, "web"), "state"),
    "redactions",
  );
  const sdkRedactedEventCount = nonNegativeIntegerField(
    sdkSummary,
    "redactedEventCount",
    "redacted_event_count",
  );
  const sdkRedactedFieldCount =
    nonNegativeIntegerField(sdkSummary, "redactedFieldCount", "redacted_field_count") ??
    nonNegativeIntegerField(sdkWebRedactions, "total");

  if (sdkRedactedEventCount !== undefined || sdkRedactedFieldCount !== undefined) {
    metrics.push({
      sourceId: "sdk_session",
      label: "SDK summary",
      redactedEventCount: sdkRedactedEventCount,
      redactedFieldCount: sdkRedactedFieldCount,
    });
  }

  const auditSummary = recordField(input.replayExport, "auditSummary", "audit_summary");
  const exportRedactedEventCount = nonNegativeIntegerField(
    auditSummary,
    "redactedEventCount",
    "redacted_event_count",
  );
  const exportRedactedFieldCount = nonNegativeIntegerField(
    auditSummary,
    "redactedFieldCount",
    "redacted_field_count",
  );

  if (exportRedactedEventCount !== undefined || exportRedactedFieldCount !== undefined) {
    metrics.push({
      sourceId: "replay_export",
      label: "Replay export audit",
      redactedEventCount: exportRedactedEventCount,
      redactedFieldCount: exportRedactedFieldCount,
    });
  }

  const importRedactedFields = arrayField(
    recordField(input.importPlan, "audit"),
    "redactedFields",
    "redacted_fields",
  ).filter((value) => typeof value === "string").length;

  if (importRedactedFields > 0) {
    metrics.push({
      sourceId: "import_plan",
      label: "Import audit plan",
      redactedFieldCount: importRedactedFields,
    });
  }

  return metrics;
}

function buildReplayStepState(
  input: NormalizedInputs,
  panels: LocalEventAcceptanceState["panels"],
): LocalEventAcceptanceReplayStepState {
  const apiRequestCount = panels.apiRequests.cards.length;
  const sdkStepCount = arrayField(recordField(input.sdkSession, "sdk"), "flow").length;
  const fixtureFetchCallCount = arrayField(
    recordField(input.sdkSession, "sdk"),
    "fixtureFetchCalls",
    "fixture_fetch_calls",
  ).length;
  const replayBatchCount = maxNumber([
    ...panels.apiRequests.cards.map((card) => numberMetadata(card.metadata, "replayBatchCount")),
    arrayField(input.replayExport, "replayBatches", "replay_batches").length,
    arrayField(recordField(recordField(input.importPlan, "replayPlan"), "batches"), "items").length,
    arrayField(recordField(input.importPlan, "replayPlan"), "batches").length,
  ]);
  const replayEventCount = maxNumber([
    nonNegativeIntegerField(recordField(input.apiRequests, "catalog"), "eventCount", "event_count"),
    ...panels.apiRequests.cards.map((card) => numberMetadata(card.metadata, "eventCount")),
    nonNegativeIntegerField(recordField(input.replayExport, "auditSummary"), "eventCount", "event_count"),
    nonNegativeIntegerField(recordField(input.importPlan, "source"), "expectedEventCount", "expected_event_count"),
  ]);
  const preflightCheckCount = arrayField(input.importPlan, "preflightChecks", "preflight_checks").length;
  const importBatchCount = arrayField(recordField(input.importPlan, "replayPlan"), "batches").length;
  const status: LocalEventAcceptanceStatus =
    apiRequestCount === 0 &&
    sdkStepCount === 0 &&
    replayBatchCount === 0 &&
    preflightCheckCount === 0
      ? "empty"
      : "ready";
  const detailLabels = [
    formatCount(apiRequestCount, "API request"),
    formatCount(sdkStepCount, "SDK flow step"),
    formatCount(fixtureFetchCallCount, "fixture fetch call"),
    formatCount(replayBatchCount, "replay batch", "replay batches"),
    formatCount(replayEventCount, "replay event"),
    formatCount(preflightCheckCount, "preflight check"),
  ];

  return {
    status,
    statusLabel: getLocalEventAcceptanceStatusLabel(status),
    apiRequestCount,
    sdkStepCount,
    fixtureFetchCallCount,
    replayBatchCount,
    replayEventCount,
    preflightCheckCount,
    importBatchCount,
    detailLabels,
    ariaLabel: ["Replay step counts", ...detailLabels].join(", "),
  };
}

function buildExportFormatState(
  sdkSession: AnyRecord | undefined,
  replayExport: AnyRecord | undefined,
): LocalEventAcceptanceExportFormatState {
  const formats = uniqueStrings([
    ...stringArrayField(
      recordField(recordField(sdkSession, "cli"), "exportPlan", "export_plan"),
      "formats",
    ),
    ...stringArrayField(recordField(sdkSession, "auditExport", "audit_export"), "formats"),
  ]);
  const exportPlan = recordField(recordField(sdkSession, "cli"), "exportPlan", "export_plan");
  const auditExport = recordField(sdkSession, "auditExport", "audit_export");
  const packageKind =
    stringField(auditExport, "packageKind", "package_kind") ??
    stringField(recordField(replayExport, "encryption"), "envelopeKind", "envelope_kind");
  const manifestKind = stringField(auditExport, "manifestKind", "manifest_kind");
  const stdoutOnly = booleanField(exportPlan, "stdoutOnly", "stdout_only") === true;
  const writesOnlyWithOutputPath =
    booleanField(exportPlan, "writesOnlyWithOutputPath", "writes_only_with_output_path") === true;
  const status: LocalEventAcceptanceStatus = formats.length === 0 ? "empty" : "ready";
  const detailLabels = [
    formats.length === 0 ? "No export formats" : formats.join(", "),
  ];

  if (stdoutOnly) {
    detailLabels.push("stdout only");
  }
  if (writesOnlyWithOutputPath) {
    detailLabels.push("writes only with output path");
  }
  if (manifestKind !== undefined) {
    detailLabels.push(`Manifest ${manifestKind}`);
  }

  return {
    status,
    statusLabel: getLocalEventAcceptanceStatusLabel(status),
    formats,
    formatCount: formats.length,
    stdoutOnly,
    writesOnlyWithOutputPath,
    packageKind,
    manifestKind,
    detailLabels,
    ariaLabel: [
      "Export formats",
      formatCount(formats.length, "format"),
      ...detailLabels,
    ].join(", "),
  };
}

function buildImportReadinessState(
  importPlan: AnyRecord | undefined,
): LocalEventAcceptanceImportReadinessState {
  const replayPlan = recordField(importPlan, "replayPlan", "replay_plan");
  const preflightChecks = arrayField(importPlan, "preflightChecks", "preflight_checks").filter(isRecord);
  const batches = arrayField(replayPlan, "batches").filter(isRecord);
  const dryRun = booleanField(replayPlan, "dryRun", "dry_run") === true;
  const failedCheckCount = preflightChecks.filter((check) =>
    isFailureStatus(stringField(check, "status", "state")),
  ).length;
  const requiredCheckCount = preflightChecks.filter(
    (check) => stringField(check, "status", "state") === "required",
  ).length;
  const readyBatchCount = batches.filter((batch) =>
    isReadyStage(stringField(batch, "stage", "status")),
  ).length;
  const hasPlan = importPlan !== undefined;
  const ready =
    hasPlan &&
    failedCheckCount === 0 &&
    preflightChecks.length > 0 &&
    batches.length > 0 &&
    readyBatchCount === batches.length;
  const status: LocalEventAcceptanceStatus =
    !hasPlan
      ? "empty"
      : failedCheckCount > 0
        ? "blocked"
        : ready
          ? "ready"
          : "attention";
  const strategy = stringField(replayPlan, "strategy");
  const integrityFailureMode = stringField(replayPlan, "integrityFailureMode", "integrity_failure_mode");
  const duplicateEventHandling = stringField(
    replayPlan,
    "duplicateEventHandling",
    "duplicate_event_handling",
  );
  const label =
    status === "empty"
      ? "No import plan"
      : status === "blocked"
        ? "Import blocked"
        : dryRun
          ? "Ready for dry run"
          : ready
            ? "Ready to import"
            : "Needs review";
  const detailLabels = [
    formatCount(preflightChecks.length, "preflight check"),
    formatCount(requiredCheckCount, "required check"),
    formatCount(failedCheckCount, "failed check"),
    formatCount(readyBatchCount, "ready batch", "ready batches"),
  ];

  if (dryRun) {
    detailLabels.push("Dry run enabled");
  }
  if (strategy !== undefined) {
    detailLabels.push(`Strategy ${strategy}`);
  }
  if (integrityFailureMode !== undefined) {
    detailLabels.push(`Integrity failure mode ${integrityFailureMode}`);
  }

  return {
    status,
    statusLabel: getLocalEventAcceptanceStatusLabel(status),
    ready,
    label,
    dryRun,
    strategy,
    integrityFailureMode,
    duplicateEventHandling,
    preflightCheckCount: preflightChecks.length,
    requiredCheckCount,
    failedCheckCount,
    importBatchCount: batches.length,
    readyBatchCount,
    detailLabels,
    ariaLabel: ["Import readiness", label, ...detailLabels].join(", "),
  };
}

function buildSummaryCards(input: {
  localOnly: LocalEventAcceptanceLocalOnlyState;
  redactions: LocalEventAcceptanceRedactionState;
  replaySteps: LocalEventAcceptanceReplayStepState;
  exportFormats: LocalEventAcceptanceExportFormatState;
  importReadiness: LocalEventAcceptanceImportReadinessState;
}): LocalEventAcceptanceCard[] {
  return [
    buildCard({
      id: "local_event_acceptance.summary.local_only",
      kind: "summary",
      title: "Local-only status",
      value: input.localOnly.localOnly ? "Local only" : "Review sources",
      status: input.localOnly.status,
      badgeLabels: [input.localOnly.statusLabel],
      detailLabels: input.localOnly.detailLabels,
      metadata: {
        localOnly: input.localOnly.localOnly,
        sourceCount: input.localOnly.sourceCount,
        localOnlyCount: input.localOnly.localOnlyCount,
      },
    }),
    buildCard({
      id: "local_event_acceptance.summary.redactions",
      kind: "summary",
      title: "Redactions",
      value: formatCount(input.redactions.redactedFieldCount, "redacted field"),
      status: input.redactions.status,
      badgeLabels: [input.redactions.statusLabel],
      detailLabels: input.redactions.detailLabels,
      metadata: {
        redactedEventCount: input.redactions.redactedEventCount,
        redactedFieldCount: input.redactions.redactedFieldCount,
        importRedactedFieldCount: input.redactions.importRedactedFieldCount,
      },
    }),
    buildCard({
      id: "local_event_acceptance.summary.replay_steps",
      kind: "summary",
      title: "Replay steps",
      value: formatCount(
        input.replaySteps.replayBatchCount,
        "replay batch",
        "replay batches",
      ),
      status: input.replaySteps.status,
      badgeLabels: [input.replaySteps.statusLabel],
      detailLabels: input.replaySteps.detailLabels,
      metadata: {
        apiRequestCount: input.replaySteps.apiRequestCount,
        sdkStepCount: input.replaySteps.sdkStepCount,
        fixtureFetchCallCount: input.replaySteps.fixtureFetchCallCount,
        replayBatchCount: input.replaySteps.replayBatchCount,
        replayEventCount: input.replaySteps.replayEventCount,
        preflightCheckCount: input.replaySteps.preflightCheckCount,
      },
    }),
    buildCard({
      id: "local_event_acceptance.summary.export_formats",
      kind: "summary",
      title: "Export formats",
      value: formatCount(input.exportFormats.formatCount, "format"),
      status: input.exportFormats.status,
      badgeLabels: input.exportFormats.formats,
      detailLabels: input.exportFormats.detailLabels,
      metadata: {
        formats: input.exportFormats.formats,
        stdoutOnly: input.exportFormats.stdoutOnly,
        writesOnlyWithOutputPath: input.exportFormats.writesOnlyWithOutputPath,
      },
    }),
    buildCard({
      id: "local_event_acceptance.summary.import_readiness",
      kind: "summary",
      title: "Import readiness",
      value: input.importReadiness.label,
      status: input.importReadiness.status,
      badgeLabels: [input.importReadiness.statusLabel],
      detailLabels: input.importReadiness.detailLabels,
      metadata: {
        ready: input.importReadiness.ready,
        dryRun: input.importReadiness.dryRun,
        preflightCheckCount: input.importReadiness.preflightCheckCount,
        readyBatchCount: input.importReadiness.readyBatchCount,
      },
    }),
  ].map(cloneCard);
}

function buildApiPanel(apiRequests: AnyRecord | undefined): LocalEventAcceptancePanel {
  const requests = normalizeApiRequestRecords(apiRequests);
  const successfulRequestCount = requests.filter((request) =>
    request.statusCode === undefined ||
    (request.statusCode >= 200 && request.statusCode < 300),
  ).length;
  const eventCount = maxNumber([
    nonNegativeIntegerField(recordField(apiRequests, "catalog"), "eventCount", "event_count"),
    ...requests.map((request) => request.eventCount),
  ]);
  const replayBatchCount = maxNumber(requests.map((request) => request.replayBatchCount));
  const redactedEventCount = maxNumber(requests.map((request) => request.redactedEventCount));
  const redactedFieldCount = maxNumber(requests.map((request) => request.redactedFieldCount));
  const status: LocalEventAcceptanceStatus =
    apiRequests === undefined
      ? "empty"
      : requests.length === 0
        ? "attention"
        : successfulRequestCount === requests.length
          ? "ready"
          : "error";
  const value = apiRequests === undefined ? "No fixture" : formatCount(requests.length, "request");
  const detailLabels = [
    formatCount(successfulRequestCount, "successful request"),
    formatCount(eventCount, "event"),
    formatCount(replayBatchCount, "replay batch", "replay batches"),
    formatCount(redactedFieldCount, "redacted field"),
  ];

  return clonePanel({
    id: "local_event_acceptance.api_requests",
    sourceId: "api_requests",
    title: "API request fixtures",
    status,
    statusLabel: getLocalEventAcceptanceStatusLabel(status),
    value,
    localOnly: resolveLocalOnly(apiRequests),
    generatedAt: timestampField(apiRequests, "generatedAt", "generated_at"),
    detailLabels,
    cards: requests.map(buildApiRequestCard),
    metadata: {
      requestCount: requests.length,
      successfulRequestCount,
      eventCount,
      replayBatchCount,
      redactedEventCount,
      redactedFieldCount,
      localOnly: resolveLocalOnly(apiRequests),
    },
    emptyState: buildEmptyState("api_requests"),
    ariaLabel: ["API request fixtures", value, ...detailLabels].join(", "),
  });
}

function normalizeApiRequestRecords(apiRequests: AnyRecord | undefined): ApiRequestRecord[] {
  return arrayField(apiRequests, "requests")
    .filter(isRecord)
    .map((request, index) => {
      const route = recordField(request, "route");
      const response = recordField(request, "response");
      const body = recordField(response, "body") ?? recordField(request, "body");
      const batches = arrayField(body, "batches", "replayBatches", "replay_batches").filter(isRecord);
      const eventIds = stringArrayField(body, "eventIds", "event_ids");
      const directEventCount = nonNegativeIntegerField(body, "eventCount", "event_count");
      const batchEventCount = sum(
        batches,
        (batch) => nonNegativeIntegerField(batch, "eventCount", "event_count") ?? 0,
      );
      const eventCount =
        directEventCount ?? (eventIds.length > 0 ? eventIds.length : batchEventCount);
      const replayBatchCount =
        nonNegativeIntegerField(body, "batchCount", "batch_count") ?? batches.length;

      return {
        id: stringField(request, "id", "requestId", "request_id") ?? `api_request_${index + 1}`,
        index,
        method: stringField(route, "method")?.toUpperCase() ?? "GET",
        path: stringField(route, "path") ?? "/v1/local-events",
        statusCode: nonNegativeIntegerField(response, "status"),
        eventCount,
        replayBatchCount,
        redactedEventCount: nonNegativeIntegerField(
          body,
          "redactedEventCount",
          "redacted_event_count",
        ),
        redactedFieldCount: nonNegativeIntegerField(
          body,
          "redactedFieldCount",
          "redacted_field_count",
        ),
      };
    });
}

function buildApiRequestCard(request: ApiRequestRecord): LocalEventAcceptanceCard {
  const status: LocalEventAcceptanceStatus =
    request.statusCode === undefined ||
    (request.statusCode >= 200 && request.statusCode < 300)
      ? "ready"
      : "error";
  const value = request.statusCode === undefined ? "No HTTP status" : `HTTP ${request.statusCode}`;
  const detailLabels = [
    `${request.method} ${request.path}`,
    formatCount(request.eventCount, "event"),
  ];

  if (request.replayBatchCount > 0) {
    detailLabels.push(
      formatCount(request.replayBatchCount, "replay batch", "replay batches"),
    );
  }
  if (request.redactedFieldCount !== undefined) {
    detailLabels.push(formatCount(request.redactedFieldCount, "redacted field"));
  }

  return buildCard({
    id: `local_event_acceptance.api_request.${sanitizeIdentifier(request.id, "request")}`,
    kind: "api_request",
    title: `${request.method} ${request.path}`,
    value,
    status,
    badgeLabels: [getLocalEventAcceptanceStatusLabel(status)],
    detailLabels,
    metadata: {
      requestId: request.id,
      method: request.method,
      routePath: request.path,
      statusCode: request.statusCode,
      eventCount: request.eventCount,
      replayBatchCount: request.replayBatchCount,
      redactedEventCount: request.redactedEventCount,
      redactedFieldCount: request.redactedFieldCount,
    },
  });
}

function buildSdkPanel(sdkSession: AnyRecord | undefined): LocalEventAcceptancePanel {
  const sdk = recordField(sdkSession, "sdk");
  const flow = arrayField(sdk, "flow").filter(isRecord);
  const fetchCalls = arrayField(sdk, "fixtureFetchCalls", "fixture_fetch_calls").filter(isRecord);
  const exportFormats = buildExportFormatState(sdkSession, undefined);
  const importPlan = recordField(recordField(sdkSession, "cli"), "importPlan", "import_plan");
  const importCheckCount = stringArrayField(importPlan, "preflightCheckIds", "preflight_check_ids").length;
  const status: LocalEventAcceptanceStatus =
    sdkSession === undefined ? "empty" : flow.length === 0 ? "attention" : "ready";
  const value = sdkSession === undefined ? "No SDK session" : formatCount(flow.length, "SDK step");
  const detailLabels = [
    formatCount(fetchCalls.length, "fixture fetch call"),
    formatCount(exportFormats.formatCount, "export format"),
    formatCount(importCheckCount, "import preflight check"),
  ];
  const cards = [
    ...flow.map((step, index) => buildSdkFlowCard(step, index)),
    ...fetchCalls.map((call, index) => buildSdkFetchCard(call, index)),
  ];

  return clonePanel({
    id: "local_event_acceptance.sdk_session",
    sourceId: "sdk_session",
    title: "SDK session",
    status,
    statusLabel: getLocalEventAcceptanceStatusLabel(status),
    value,
    localOnly: resolveLocalOnly(sdkSession),
    generatedAt: timestampField(sdkSession, "generatedAt", "generated_at"),
    detailLabels,
    cards,
    metadata: {
      sdkStepCount: flow.length,
      fixtureFetchCallCount: fetchCalls.length,
      exportFormats: exportFormats.formats,
      importPreflightCheckCount: importCheckCount,
      localOnly: resolveLocalOnly(sdkSession),
    },
    emptyState: buildEmptyState("sdk_session"),
    ariaLabel: ["SDK session", value, ...detailLabels].join(", "),
  });
}

function buildSdkFlowCard(step: AnyRecord, index: number): LocalEventAcceptanceCard {
  const stepId = stringField(step, "step", "id") ?? `sdk_step_${index + 1}`;
  const call = stringField(step, "call") ?? "SDK call";
  const returns = recordField(step, "returns");
  const detailLabels = Object.entries(returns ?? {})
    .filter(([, value]) => isScalar(value))
    .map(([key, value]) => `${labelFromKey(key)} ${String(value)}`);

  return buildCard({
    id: `local_event_acceptance.sdk_step.${sanitizeIdentifier(stepId, "step")}`,
    kind: "sdk_step",
    title: labelFromKey(stepId),
    value: call,
    status: "ready",
    badgeLabels: ["SDK"],
    detailLabels,
    metadata: {
      step: stepId,
      call,
      sourcePath: stringField(step, "sourcePath", "source_path"),
      batchSize: nonNegativeIntegerField(recordField(step, "options"), "batchSize", "batch_size"),
    },
  });
}

function buildSdkFetchCard(call: AnyRecord, index: number): LocalEventAcceptanceCard {
  const method = stringField(call, "method")?.toUpperCase() ?? "GET";
  const path = stringField(call, "path") ?? "/v1/local-events";
  const statusCode = nonNegativeIntegerField(call, "status");
  const status: LocalEventAcceptanceStatus =
    statusCode === undefined || (statusCode >= 200 && statusCode < 300)
      ? "ready"
      : "error";

  return buildCard({
    id: `local_event_acceptance.sdk_fetch.${index + 1}`,
    kind: "sdk_fetch_call",
    title: `${method} ${path}`,
    value: statusCode === undefined ? "No HTTP status" : `HTTP ${statusCode}`,
    status,
    badgeLabels: [stringField(call, "route") ?? "fixture"],
    detailLabels: [`${method} ${path}`],
    metadata: {
      method,
      path,
      route: stringField(call, "route"),
      statusCode,
    },
  });
}

function buildReplayExportPanel(
  replayExport: AnyRecord | undefined,
): LocalEventAcceptancePanel {
  const batches = normalizeReplayBatches(replayExport);
  const auditSummary = recordField(replayExport, "auditSummary", "audit_summary");
  const encryption = recordField(replayExport, "encryption");
  const network = recordField(replayExport, "network");
  const eventCount = maxNumber([
    nonNegativeIntegerField(recordField(replayExport, "catalog"), "eventCount", "event_count"),
    nonNegativeIntegerField(auditSummary, "eventCount", "event_count"),
    ...batches.map((batch) => batch.eventCount),
  ]);
  const redactedFieldCount = nonNegativeIntegerField(
    auditSummary,
    "redactedFieldCount",
    "redacted_field_count",
  ) ?? 0;
  const networkMode = stringField(network, "mode");
  const status: LocalEventAcceptanceStatus =
    replayExport === undefined ? "empty" : batches.length === 0 ? "attention" : "ready";
  const value =
    replayExport === undefined
      ? "No export manifest"
      : formatCount(batches.length, "replay batch", "replay batches");
  const detailLabels = [
    formatCount(eventCount, "exported event"),
    formatCount(redactedFieldCount, "redacted field"),
  ];

  if (networkMode !== undefined) {
    detailLabels.push(`Network ${networkMode}`);
  }
  const envelopeKind = stringField(encryption, "envelopeKind", "envelope_kind");
  if (envelopeKind !== undefined) {
    detailLabels.push(`Envelope ${envelopeKind}`);
  }

  return clonePanel({
    id: "local_event_acceptance.replay_export",
    sourceId: "replay_export",
    title: "Replay export manifest",
    status,
    statusLabel: getLocalEventAcceptanceStatusLabel(status),
    value,
    localOnly: resolveLocalOnly(replayExport),
    generatedAt: timestampField(replayExport, "generatedAt", "generated_at"),
    detailLabels,
    cards: batches.map(buildReplayBatchCard),
    metadata: {
      sessionId: stringField(replayExport, "sessionId", "session_id"),
      eventCount,
      replayBatchCount: batches.length,
      redactedFieldCount,
      networkMode,
      envelopeKind,
      localOnly: resolveLocalOnly(replayExport),
    },
    emptyState: buildEmptyState("replay_export"),
    ariaLabel: ["Replay export manifest", value, ...detailLabels].join(", "),
  });
}

function normalizeReplayBatches(source: AnyRecord | undefined): ReplayBatchRecord[] {
  return arrayField(source, "replayBatches", "replay_batches", "batches")
    .filter(isRecord)
    .map((batch, index) => ({
      id:
        stringField(batch, "batchId", "batch_id", "id") ??
        `replay_batch_${index + 1}`,
      index: nonNegativeIntegerField(batch, "batchIndex", "batch_index") ?? index + 1,
      eventCount: nonNegativeIntegerField(batch, "eventCount", "event_count") ?? 0,
      firstSequence: nonNegativeIntegerField(batch, "firstSequence", "first_sequence"),
      lastSequence: nonNegativeIntegerField(batch, "lastSequence", "last_sequence"),
      firstEventId: stringField(batch, "firstEventId", "first_event_id"),
      lastEventId: stringField(batch, "lastEventId", "last_event_id"),
      stage: stringField(batch, "stage", "status"),
    }));
}

function buildReplayBatchCard(batch: ReplayBatchRecord): LocalEventAcceptanceCard {
  const detailLabels = [
    formatCount(batch.eventCount, "event"),
    sequenceRangeLabel(batch.firstSequence, batch.lastSequence),
  ].filter(isDefined);

  return buildCard({
    id: `local_event_acceptance.replay_export_batch.${sanitizeIdentifier(batch.id, "batch")}`,
    kind: "replay_export_batch",
    title: `Replay batch ${batch.index}`,
    value: formatCount(batch.eventCount, "event"),
    status: "ready",
    badgeLabels: ["export"],
    detailLabels,
    metadata: {
      batchId: batch.id,
      batchIndex: batch.index,
      eventCount: batch.eventCount,
      firstSequence: batch.firstSequence,
      lastSequence: batch.lastSequence,
      firstEventId: batch.firstEventId,
      lastEventId: batch.lastEventId,
    },
  });
}

function buildImportPlanPanel(importPlan: AnyRecord | undefined): LocalEventAcceptancePanel {
  const readiness = buildImportReadinessState(importPlan);
  const preflightChecks = arrayField(importPlan, "preflightChecks", "preflight_checks").filter(isRecord);
  const batches = normalizeReplayBatches(recordField(importPlan, "replayPlan", "replay_plan"));
  const cards = [
    ...preflightChecks.map((check, index) => buildImportPreflightCard(check, index)),
    ...batches.map(buildImportBatchCard),
  ];

  return clonePanel({
    id: "local_event_acceptance.import_plan",
    sourceId: "import_plan",
    title: "Import plan",
    status: readiness.status,
    statusLabel: readiness.statusLabel,
    value: readiness.label,
    localOnly: resolveLocalOnly(importPlan),
    generatedAt: timestampField(importPlan, "generatedAt", "generated_at"),
    detailLabels: readiness.detailLabels,
    cards,
    metadata: {
      planId: stringField(importPlan, "planId", "plan_id"),
      ready: readiness.ready,
      dryRun: readiness.dryRun,
      preflightCheckCount: readiness.preflightCheckCount,
      requiredCheckCount: readiness.requiredCheckCount,
      importBatchCount: readiness.importBatchCount,
      readyBatchCount: readiness.readyBatchCount,
      strategy: readiness.strategy,
      integrityFailureMode: readiness.integrityFailureMode,
      duplicateEventHandling: readiness.duplicateEventHandling,
      localOnly: resolveLocalOnly(importPlan),
    },
    emptyState: buildEmptyState("import_plan"),
    ariaLabel: ["Import plan", readiness.label, ...readiness.detailLabels].join(", "),
  });
}

function buildImportPreflightCard(check: AnyRecord, index: number): LocalEventAcceptanceCard {
  const checkId = stringField(check, "id") ?? `preflight_check_${index + 1}`;
  const statusText = stringField(check, "status", "state") ?? "required";
  const status: LocalEventAcceptanceStatus = isFailureStatus(statusText) ? "blocked" : "ready";
  const detailLabels = [
    stringField(check, "kind"),
    stringField(check, "inputPath", "input_path"),
    stringField(check, "expects"),
  ].filter(isDefined);

  return buildCard({
    id: `local_event_acceptance.import_preflight.${sanitizeIdentifier(checkId, "check")}`,
    kind: "import_preflight_check",
    title: labelFromKey(checkId),
    value: labelFromKey(statusText),
    status,
    badgeLabels: [stringField(check, "kind") ?? "check"],
    detailLabels,
    metadata: {
      checkId,
      checkKind: stringField(check, "kind"),
      checkStatus: statusText,
      inputPath: stringField(check, "inputPath", "input_path"),
    },
  });
}

function buildImportBatchCard(batch: ReplayBatchRecord): LocalEventAcceptanceCard {
  const status: LocalEventAcceptanceStatus = isReadyStage(batch.stage) ? "ready" : "attention";
  const detailLabels = [
    formatCount(batch.eventCount, "event"),
    batch.stage === undefined ? undefined : `Stage ${batch.stage}`,
  ].filter(isDefined);

  return buildCard({
    id: `local_event_acceptance.import_batch.${sanitizeIdentifier(batch.id, "batch")}`,
    kind: "import_batch",
    title: `Import batch ${batch.index}`,
    value: batch.stage === undefined ? "No stage" : labelFromKey(batch.stage),
    status,
    badgeLabels: [getLocalEventAcceptanceStatusLabel(status)],
    detailLabels,
    metadata: {
      batchId: batch.id,
      batchIndex: batch.index,
      eventCount: batch.eventCount,
      stage: batch.stage,
    },
  });
}

function buildCard(input: {
  id: string;
  kind: LocalEventAcceptanceCardKind;
  title: string;
  value: string;
  status: LocalEventAcceptanceStatus;
  badgeLabels?: readonly string[];
  detailLabels?: readonly string[];
  metadata?: LocalEventAcceptanceMetadata;
}): LocalEventAcceptanceCard {
  const statusLabel = getLocalEventAcceptanceStatusLabel(input.status);

  return cloneCard({
    id: input.id,
    kind: input.kind,
    title: input.title,
    value: input.value,
    status: input.status,
    statusLabel,
    badgeLabels: [...(input.badgeLabels ?? [])],
    detailLabels: [...(input.detailLabels ?? [])],
    metadata: cloneMetadata(input.metadata ?? {}),
    ariaLabel: [
      input.title,
      input.value,
      statusLabel,
      ...(input.detailLabels ?? []),
    ].join(", "),
  });
}

function resolveAcceptanceStatus(input: {
  sourceCount: number;
  localOnly: LocalEventAcceptanceLocalOnlyState;
  importReadiness: LocalEventAcceptanceImportReadinessState;
  errors: readonly LocalEventAcceptanceErrorState[];
}): LocalEventAcceptanceStatus {
  if (input.errors.length > 0) {
    return "error";
  }
  if (input.sourceCount === 0) {
    return "empty";
  }
  if (input.localOnly.status === "blocked" || input.importReadiness.status === "blocked") {
    return "blocked";
  }
  if (
    input.sourceCount < EXPECTED_SOURCE_COUNT ||
    input.localOnly.status === "attention" ||
    input.importReadiness.status === "attention"
  ) {
    return "attention";
  }
  return "ready";
}

function findApiSummaryBody(apiRequests: AnyRecord | undefined): AnyRecord | undefined {
  for (const request of arrayField(apiRequests, "requests")) {
    if (!isRecord(request)) {
      continue;
    }
    const route = recordField(request, "route");
    const body = recordField(recordField(request, "response"), "body");
    const path = stringField(route, "path") ?? "";

    if (
      path.includes("summary") ||
      nonNegativeIntegerField(body, "redactedEventCount", "redacted_event_count") !== undefined ||
      nonNegativeIntegerField(body, "redactedFieldCount", "redacted_field_count") !== undefined
    ) {
      return body;
    }
  }

  return undefined;
}

function findSdkSummaryReturn(sdkSession: AnyRecord | undefined): AnyRecord | undefined {
  for (const step of arrayField(recordField(sdkSession, "sdk"), "flow")) {
    if (!isRecord(step)) {
      continue;
    }
    const stepId = stringField(step, "step", "id") ?? "";
    const call = stringField(step, "call") ?? "";

    if (stepId.includes("summarize") || call.includes("summarize")) {
      return recordField(step, "returns");
    }
  }

  return undefined;
}

function buildEmptyState(
  sourceId: LocalEventAcceptanceSourceKind,
): LocalEventAcceptanceEmptyState {
  switch (sourceId) {
    case "api_requests":
      return {
        id: "local_event_acceptance_api_requests_empty",
        label: "No API request fixture",
        description: "API request summaries will appear after a local event fixture is loaded.",
        ariaLabel: "No local event API request fixture is available",
      };
    case "sdk_session":
      return {
        id: "local_event_acceptance_sdk_session_empty",
        label: "No SDK session",
        description: "SDK session steps will appear after a local event SDK result is loaded.",
        ariaLabel: "No local event SDK session is available",
      };
    case "replay_export":
      return {
        id: "local_event_acceptance_replay_export_empty",
        label: "No replay export manifest",
        description: "Replay export batches will appear after an export manifest is loaded.",
        ariaLabel: "No local event replay export manifest is available",
      };
    case "import_plan":
      return {
        id: "local_event_acceptance_import_plan_empty",
        label: "No import plan",
        description: "Import readiness will appear after an import plan is loaded.",
        ariaLabel: "No local event import plan is available",
      };
  }
}

function looksLikeApiRequests(value: AnyRecord): boolean {
  return (
    stringField(value, "schemaVersion", "schema_version")?.includes("api-requests") === true ||
    (Array.isArray(value.requests) && stringField(value, "apiBase", "api_base") !== undefined)
  );
}

function looksLikeSdkSession(value: AnyRecord): boolean {
  return (
    stringField(value, "schemaVersion", "schema_version")?.includes("sdk-session") === true ||
    (isRecord(value.sdk) && isRecord(value.apiClient))
  );
}

function looksLikeReplayExport(value: AnyRecord): boolean {
  return (
    stringField(value, "schemaVersion", "schema_version")?.includes("export-session") === true ||
    (Array.isArray(value.replayBatches) && isRecord(value.auditSummary))
  );
}

function looksLikeImportPlan(value: AnyRecord): boolean {
  return (
    stringField(value, "schemaVersion", "schema_version")?.includes("import-plan") === true ||
    (Array.isArray(value.preflightChecks) && isRecord(value.replayPlan))
  );
}

function resolveLocalOnly(source: AnyRecord | undefined): boolean | undefined {
  const direct = booleanField(source, "localOnly", "local_only");
  if (direct !== undefined) {
    return direct;
  }

  const networkMode = stringField(recordField(source, "network"), "mode");
  if (networkMode === "disabled") {
    return true;
  }

  return undefined;
}

function sequenceRangeLabel(
  firstSequence: number | undefined,
  lastSequence: number | undefined,
): string | undefined {
  if (firstSequence === undefined || lastSequence === undefined) {
    return undefined;
  }
  if (firstSequence === lastSequence) {
    return `Sequence ${firstSequence}`;
  }
  return `Sequences ${firstSequence}-${lastSequence}`;
}

function isReadyStage(value: string | undefined): boolean {
  return value === "ready" || value === "staged" || value === "complete";
}

function isFailureStatus(value: string | undefined): boolean {
  return value === "failed" || value === "error" || value === "blocked";
}

function normalizeTimestamp(
  value: string | undefined,
  fallback: string | undefined,
): string {
  if (value !== undefined) {
    return value;
  }
  if (fallback !== undefined) {
    return fallback;
  }
  return DEFAULT_TIMESTAMP;
}

function latestTimestamp(
  values: readonly (string | undefined)[],
  fallback: string | undefined,
): string {
  const timestamps = values.filter(isDefined);
  if (timestamps.length === 0) {
    return normalizeTimestamp(undefined, fallback);
  }

  return timestamps
    .slice()
    .sort((left, right) => Date.parse(left) - Date.parse(right) || left.localeCompare(right))
    .at(-1) ?? normalizeTimestamp(undefined, fallback);
}

function timestampField(
  record: AnyRecord | undefined,
  ...keys: string[]
): string | undefined {
  const value = stringField(record, ...keys);
  return value === undefined || value.trim() === "" ? undefined : value;
}

function stringField(
  record: AnyRecord | undefined,
  ...keys: string[]
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

function stringArrayField(
  record: AnyRecord | undefined,
  ...keys: string[]
): string[] {
  for (const value of arrayField(record, ...keys)) {
    if (typeof value === "string" && value.trim() !== "") {
      return arrayField(record, ...keys)
        .filter((item): item is string => typeof item === "string" && item.trim() !== "")
        .map((item) => item.trim());
    }
  }
  return [];
}

function booleanField(
  record: AnyRecord | undefined,
  ...keys: string[]
): boolean | undefined {
  if (record === undefined) {
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
  if (record === undefined) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
      return value;
    }
  }
  return undefined;
}

function recordField(
  record: AnyRecord | undefined,
  ...keys: string[]
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

function arrayField(
  record: AnyRecord | undefined,
  ...keys: string[]
): unknown[] {
  if (record === undefined) {
    return [];
  }
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return [...value];
    }
  }
  return [];
}

function numberMetadata(
  metadata: LocalEventAcceptanceMetadata,
  key: string,
): number | undefined {
  const value = metadata[key];
  return typeof value === "number" ? value : undefined;
}

function maxNumber(values: readonly (number | undefined)[]): number {
  const numbers = values.filter((value): value is number => typeof value === "number");
  return numbers.length === 0 ? 0 : Math.max(...numbers);
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (normalized !== "" && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }

  return result;
}

function labelFromKey(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function sanitizeIdentifier(value: string, fallback: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return sanitized === "" ? fallback : sanitized;
}

function formatCount(
  value: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function sum<TValue>(
  values: readonly TValue[],
  selector: (value: TValue) => number,
): number {
  return values.reduce((total, value) => total + selector(value), 0);
}

function errorMessage(error: unknown): string | undefined {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim() !== "") {
    return error.trim();
  }
  if (isRecord(error)) {
    return stringField(error, "message", "error", "description");
  }
  return undefined;
}

function isRecord(value: unknown): value is AnyRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isScalar(value: unknown): value is string | number | boolean {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function isDefined<TValue>(value: TValue | undefined): value is TValue {
  return value !== undefined;
}

function cloneAcceptanceState(
  state: LocalEventAcceptanceState,
): LocalEventAcceptanceState {
  return {
    ...state,
    localOnly: cloneLocalOnlyState(state.localOnly),
    redactions: cloneRedactionState(state.redactions),
    replaySteps: {
      ...state.replaySteps,
      detailLabels: [...state.replaySteps.detailLabels],
    },
    exportFormats: {
      ...state.exportFormats,
      formats: [...state.exportFormats.formats],
      detailLabels: [...state.exportFormats.detailLabels],
    },
    importReadiness: {
      ...state.importReadiness,
      detailLabels: [...state.importReadiness.detailLabels],
    },
    summaryCards: state.summaryCards.map(cloneCard),
    panels: {
      apiRequests: clonePanel(state.panels.apiRequests),
      sdkSession: clonePanel(state.panels.sdkSession),
      replayExport: clonePanel(state.panels.replayExport),
      importPlan: clonePanel(state.panels.importPlan),
    },
    emptyStates: cloneEmptyStates(state.emptyStates),
    errorStates: state.errorStates.map(cloneErrorState),
  };
}

function cloneLocalOnlyState(
  state: LocalEventAcceptanceLocalOnlyState,
): LocalEventAcceptanceLocalOnlyState {
  return {
    ...state,
    nonLocalSourceIds: [...state.nonLocalSourceIds],
    unknownSourceIds: [...state.unknownSourceIds],
    detailLabels: [...state.detailLabels],
  };
}

function cloneRedactionState(
  state: LocalEventAcceptanceRedactionState,
): LocalEventAcceptanceRedactionState {
  return {
    ...state,
    sources: state.sources.map(cloneRedactionSource),
    detailLabels: [...state.detailLabels],
  };
}

function cloneRedactionSource(
  source: LocalEventAcceptanceRedactionSource,
): LocalEventAcceptanceRedactionSource {
  return { ...source };
}

function clonePanel(panel: LocalEventAcceptancePanel): LocalEventAcceptancePanel {
  return {
    ...panel,
    detailLabels: [...panel.detailLabels],
    cards: panel.cards.map(cloneCard),
    metadata: cloneMetadata(panel.metadata),
    emptyState: { ...panel.emptyState },
  };
}

function cloneCard(card: LocalEventAcceptanceCard): LocalEventAcceptanceCard {
  return {
    ...card,
    badgeLabels: [...card.badgeLabels],
    detailLabels: [...card.detailLabels],
    metadata: cloneMetadata(card.metadata),
  };
}

function cloneMetadata(
  metadata: LocalEventAcceptanceMetadata,
): LocalEventAcceptanceMetadata {
  const clone: LocalEventAcceptanceMetadata = {};
  for (const [key, value] of Object.entries(metadata)) {
    clone[key] = Array.isArray(value) ? [...value] : value;
  }
  return clone;
}

function cloneEmptyStates(
  states: LocalEventAcceptanceEmptyStates,
): LocalEventAcceptanceEmptyStates {
  return {
    apiRequests: { ...states.apiRequests },
    sdkSession: { ...states.sdkSession },
    replayExport: { ...states.replayExport },
    importPlan: { ...states.importPlan },
    errors: { ...states.errors },
  };
}

function cloneErrorState(
  error: LocalEventAcceptanceErrorState,
): LocalEventAcceptanceErrorState {
  return { ...error };
}

function clonePlain<TValue>(value: TValue, seen = new WeakMap<object, unknown>()): TValue {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return seen.get(value) as TValue;
  }
  if (Array.isArray(value)) {
    const arrayClone: unknown[] = [];
    seen.set(value, arrayClone);
    for (const item of value) {
      arrayClone.push(clonePlain(item, seen));
    }
    return arrayClone as TValue;
  }

  const objectClone: Record<string, unknown> = {};
  seen.set(value, objectClone);
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    objectClone[key] = clonePlain(item, seen);
  }
  return objectClone as TValue;
}
