export type IngestConnectorMcpFixtureStatus =
  | "empty"
  | "ready"
  | "attention"
  | "error";

export type IngestConnectorMcpFixtureRequestStatus =
  | "empty"
  | "success"
  | "mismatch"
  | "error";

export type IngestConnectorMcpFixtureSafetyStatus =
  | "safe"
  | "attention"
  | "unsafe"
  | "unknown";

export type IngestConnectorMcpFixtureWarningCode =
  | "secret_input"
  | "raw_path_input"
  | "private_marker_input"
  | "malformed_request";

export type IngestConnectorMcpFixtureErrorContext =
  | "input"
  | "request"
  | "replay";

export interface BuildIngestConnectorMcpFixtureStateOptions {
  defaultTimestamp?: string;
  expectedRequestCount?: number;
}

export interface IngestConnectorMcpFixtureState {
  id: "ingest_connector_mcp_fixture_state";
  label: string;
  generatedAt: string;
  schemaVersion?: string;
  status: IngestConnectorMcpFixtureStatus;
  statusLabel: string;
  requestCount: number;
  successfulRequestCount: number;
  failedRequestCount: number;
  resourceCount: number;
  resourceSuccessCount: number;
  previewSuccessCount: number;
  connectorCount: number;
  connectorIds: string[];
  mismatchCount: number;
  warningCount: number;
  localOnly: boolean;
  noNetwork: boolean;
  durableWrites: boolean;
  redacted: boolean;
  redactionCount: number;
  rawBodyRetained: false;
  summary: IngestConnectorMcpFixtureSummary;
  safety: IngestConnectorMcpFixtureSafetySummary;
  methodCounts: IngestConnectorMcpFixtureCount[];
  statusCounts: IngestConnectorMcpFixtureCount[];
  routeCounts: IngestConnectorMcpFixtureCount[];
  requestCards: IngestConnectorMcpFixtureRequestCard[];
  summaryCards: IngestConnectorMcpFixtureSummaryCard[];
  mismatchIndicators: IngestConnectorMcpFixtureMismatchIndicator[];
  warnings: IngestConnectorMcpFixtureWarning[];
  errorStates: IngestConnectorMcpFixtureErrorState[];
  emptyState: IngestConnectorMcpFixtureEmptyState;
  ariaLabel: string;
}

export interface IngestConnectorMcpFixtureSummary {
  id: "ingest_connector_mcp_fixture_summary";
  generatedAt: string;
  requestCount: number;
  successfulRequestCount: number;
  failedRequestCount: number;
  routeCount: number;
  methodCount: number;
  statusCount: number;
  resourceCount: number;
  resourceSuccessCount: number;
  previewSuccessCount: number;
  connectorCount: number;
  mismatchCount: number;
  warningCount: number;
  redactionCount: number;
  localOnly: boolean;
  noNetwork: boolean;
  durableWrites: boolean;
  valueLabel: string;
  detailLabels: string[];
  ariaLabel: string;
}

export interface IngestConnectorMcpFixtureSafetySummary {
  id: "ingest_connector_mcp_fixture_safety";
  status: IngestConnectorMcpFixtureSafetyStatus;
  statusLabel: string;
  localOnly: boolean;
  noNetwork: boolean;
  durableWrites: boolean;
  localOnlyCount: number;
  noNetworkCount: number;
  durableWriteCount: number;
  unknownCount: number;
  detailLabels: string[];
  ariaLabel: string;
}

export interface IngestConnectorMcpFixtureCount {
  id: string;
  key: string;
  count: number;
  label: string;
  ariaLabel: string;
}

export interface IngestConnectorMcpFixtureRequestCard {
  id: string;
  requestId: string;
  index: number;
  title: string;
  method: string;
  routePath: string;
  status: IngestConnectorMcpFixtureRequestStatus;
  statusLabel: string;
  statusCode?: number;
  expectedStatus?: number;
  matched?: boolean;
  resourceSuccess: boolean;
  previewSuccess: boolean;
  connectorIds: string[];
  redacted: boolean;
  redactionCount: number;
  valueLabel: string;
  detailLabels: string[];
  ariaLabel: string;
}

export interface IngestConnectorMcpFixtureSummaryCard {
  id: string;
  label: string;
  value: string;
  status: IngestConnectorMcpFixtureStatus;
  statusLabel: string;
  detailLabels: string[];
  redactionCount: number;
  ariaLabel: string;
}

export interface IngestConnectorMcpFixtureMismatchIndicator {
  id: string;
  requestId: string;
  method: string;
  routePath: string;
  fields: string[];
  statusCode?: number;
  expectedStatus?: number;
  label: string;
  detailLabels: string[];
  ariaLabel: string;
}

export interface IngestConnectorMcpFixtureWarning {
  id: string;
  code: IngestConnectorMcpFixtureWarningCode;
  severity: "warning";
  title: string;
  description: string;
  count: number;
  requestId?: string;
  ariaLabel: string;
}

export interface IngestConnectorMcpFixtureErrorState {
  id: string;
  context: IngestConnectorMcpFixtureErrorContext;
  requestId?: string;
  method?: string;
  routePath?: string;
  status?: number;
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

export interface IngestConnectorMcpFixtureEmptyState {
  id: "ingest_connector_mcp_fixture_empty";
  label: string;
  description: string;
  ariaLabel: string;
}

type AnyRecord = Record<string, unknown>;
type ResponseSource = "actual" | "response" | "body" | "expected" | "none";

interface NormalizedFixture {
  generatedAt: string;
  schemaVersion?: string;
  records: FixtureRecord[];
  connectorIds: string[];
  resourceKeys: string[];
  safetyEvidence: SafetyEvidence;
  redactionReport: RedactionReport;
  inputError?: string;
}

interface FixtureRecord {
  id: string;
  index: number;
  title?: string;
  method: string;
  routePath: string;
  statusCode?: number;
  expectedStatus?: number;
  responseSource: ResponseSource;
  malformed: boolean;
  matches: Readonly<Record<string, boolean>>;
  mismatchFields: string[];
  error?: string;
  connectorIds: string[];
  resourceKeys: string[];
  resourceSuccess: boolean;
  previewSuccess: boolean;
  localOnly?: boolean;
  noNetwork?: boolean;
  durableWrites: boolean;
  redactionCount: number;
}

interface ResponsePick {
  body?: unknown;
  source: ResponseSource;
}

interface SafetyEvidence {
  localOnlyTrueCount: number;
  localOnlyFalseCount: number;
  noNetworkTrueCount: number;
  noNetworkFalseCount: number;
  durableWriteTrueCount: number;
  durableWriteFalseCount: number;
  externalNetworkCount: number;
}

interface RedactionReport {
  secretCount: number;
  pathCount: number;
  privateMarkerCount: number;
}

interface RedactedText {
  text: string;
  redactionCount: number;
}

const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const DEFAULT_RESOURCE_ROUTE = "/v1/ingest/connectors/mcp/resources";
const DEFAULT_PREVIEW_ROUTE = "/v1/ingest/connectors/mcp/preview";
const LOCAL_URI_SCHEMES = new Set([
  "file",
  "fixture",
  "local",
  "sovereignops",
  "stdin",
  "workspace",
]);

export function buildIngestConnectorMcpFixtureState(
  input: unknown = {},
  options: BuildIngestConnectorMcpFixtureStateOptions = {},
): IngestConnectorMcpFixtureState {
  const normalized = normalizeFixture(input, options);
  const requestCards = normalized.records.map(buildRequestCard);
  const methodCounts = buildCounts(
    "method",
    normalized.records.map((record) => record.method),
  );
  const statusCounts = buildCounts(
    "status",
    normalized.records
      .map((record) => record.statusCode)
      .filter((status): status is number => status !== undefined)
      .map((status) => String(status)),
    "HTTP ",
  );
  const routeCounts = buildCounts(
    "route",
    normalized.records.map((record) => record.routePath),
  );
  const mismatchIndicators = normalized.records
    .filter((record) => record.mismatchFields.length > 0)
    .map(buildMismatchIndicator);
  const malformedWarnings = normalized.records
    .filter((record) => record.malformed)
    .map((record) =>
      buildWarning("malformed_request", 1, {
        requestId: record.id,
      }),
    );
  const warnings = dedupeWarnings([
    ...warningsFromRedactionReport(normalized.redactionReport),
    ...malformedWarnings,
  ]);
  const errorStates = buildErrorStates(normalized);
  const redactionCount = Math.max(
    redactionReportCount(normalized.redactionReport),
    sum(requestCards, (card) => card.redactionCount) +
      sum(errorStates, (error) => error.redactionCount),
  );
  const safety = buildSafetySummary(normalized.records, normalized.safetyEvidence);
  const successfulRequestCount = requestCards.filter(
    (card) => card.status === "success",
  ).length;
  const failedRequestCount = requestCards.filter(
    (card) => card.status === "error" || card.status === "mismatch",
  ).length;
  const resourceSuccessCount = requestCards.filter((card) => card.resourceSuccess)
    .length;
  const previewSuccessCount = requestCards.filter((card) => card.previewSuccess)
    .length;
  const connectorIds = normalized.connectorIds;
  const summary = buildSummary({
    generatedAt: normalized.generatedAt,
    requestCount: requestCards.length,
    successfulRequestCount,
    failedRequestCount,
    routeCount: routeCounts.length,
    methodCount: methodCounts.length,
    statusCount: statusCounts.length,
    resourceCount: normalized.resourceKeys.length,
    resourceSuccessCount,
    previewSuccessCount,
    connectorCount: connectorIds.length,
    mismatchCount: mismatchIndicators.length,
    warningCount: warnings.length,
    redactionCount,
    localOnly: safety.localOnly,
    noNetwork: safety.noNetwork,
    durableWrites: safety.durableWrites,
  });
  const status = resolveStateStatus({
    requestCount: requestCards.length,
    failedRequestCount,
    mismatchCount: mismatchIndicators.length,
    errorCount: errorStates.length,
    warningCount: warnings.length,
    safety,
  });
  const state: IngestConnectorMcpFixtureState = {
    id: "ingest_connector_mcp_fixture_state",
    label: "Ingest connector MCP fixture",
    generatedAt: normalized.generatedAt,
    ...(normalized.schemaVersion === undefined
      ? {}
      : { schemaVersion: normalized.schemaVersion }),
    status,
    statusLabel: statusLabel(status),
    requestCount: requestCards.length,
    successfulRequestCount,
    failedRequestCount,
    resourceCount: normalized.resourceKeys.length,
    resourceSuccessCount,
    previewSuccessCount,
    connectorCount: connectorIds.length,
    connectorIds,
    mismatchCount: mismatchIndicators.length,
    warningCount: warnings.length,
    localOnly: safety.localOnly,
    noNetwork: safety.noNetwork,
    durableWrites: safety.durableWrites,
    redacted: redactionCount > 0,
    redactionCount,
    rawBodyRetained: false,
    summary: {
      ...summary,
      ariaLabel: buildSummaryAriaLabel(summary, status),
    },
    safety,
    methodCounts,
    statusCounts,
    routeCounts,
    requestCards,
    summaryCards: buildSummaryCards({
      requestCount: requestCards.length,
      successfulRequestCount,
      failedRequestCount,
      resourceCount: normalized.resourceKeys.length,
      resourceSuccessCount,
      previewSuccessCount,
      connectorCount: connectorIds.length,
      mismatchCount: mismatchIndicators.length,
      warningCount: warnings.length,
      redactionCount,
      safety,
    }),
    mismatchIndicators,
    warnings,
    errorStates,
    emptyState: buildIngestConnectorMcpFixtureEmptyState(),
    ariaLabel: [
      "Ingest connector MCP fixture",
      statusLabel(status),
      formatCount(requestCards.length, "request"),
      formatCount(connectorIds.length, "connector"),
      formatCount(mismatchIndicators.length, "mismatch", "mismatches"),
      formatCount(warnings.length, "warning"),
    ].join(", "),
  };

  return deepFreeze(clonePlain(state));
}

export function buildIngestConnectorMcpFixtureRequestCards(
  input: unknown,
  options: BuildIngestConnectorMcpFixtureStateOptions = {},
): IngestConnectorMcpFixtureRequestCard[] {
  return buildIngestConnectorMcpFixtureState(input, options).requestCards;
}

export function buildIngestConnectorMcpFixtureSummaryCards(
  input: unknown,
  options: BuildIngestConnectorMcpFixtureStateOptions = {},
): IngestConnectorMcpFixtureSummaryCard[] {
  return buildIngestConnectorMcpFixtureState(input, options).summaryCards;
}

export function buildIngestConnectorMcpFixtureSafetySummary(
  input: unknown,
  options: BuildIngestConnectorMcpFixtureStateOptions = {},
): IngestConnectorMcpFixtureSafetySummary {
  return buildIngestConnectorMcpFixtureState(input, options).safety;
}

export function buildIngestConnectorMcpFixtureEmptyState(): IngestConnectorMcpFixtureEmptyState {
  return {
    id: "ingest_connector_mcp_fixture_empty",
    label: "No MCP fixture requests",
    description:
      "Connector MCP fixture requests will appear after a request bundle loads.",
    ariaLabel: "No ingest connector MCP fixture requests are available",
  };
}

function normalizeFixture(
  input: unknown,
  options: BuildIngestConnectorMcpFixtureStateOptions,
): NormalizedFixture {
  const root = clonePlain(input);
  const rootRecord = isRecord(root) ? root : undefined;
  const generatedAt = normalizeTimestamp(
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
  );
  const schemaVersion = stringField(rootRecord, "schemaVersion", "schema_version");
  const rootSafety = collectSafetyEvidence(rootRecord);
  const records = normalizeRequestRecords(root, generatedAt, rootSafety);
  const connectorIds = uniqueStrings([
    ...records.flatMap((record) => record.connectorIds),
    ...collectConnectorIds(rootRecord),
  ]);
  const resourceKeys = uniqueStrings(records.flatMap((record) => record.resourceKeys));
  const inputError =
    root === undefined ||
    root === null ||
    Array.isArray(root) ||
    isRecord(root)
      ? undefined
      : "Ingest connector MCP fixture input must be an object.";

  return {
    generatedAt,
    ...(schemaVersion === undefined ? {} : { schemaVersion }),
    records,
    connectorIds,
    resourceKeys,
    safetyEvidence: rootSafety,
    redactionReport: analyzeRedactions(root),
    ...(inputError === undefined ? {} : { inputError }),
  };
}

function normalizeRequestRecords(
  input: unknown,
  generatedAt: string,
  rootSafety: SafetyEvidence,
): FixtureRecord[] {
  if (isRecord(input) && Array.isArray(input.requests)) {
    return input.requests.map((entry, index) =>
      normalizeRequestRecord(entry, index, generatedAt, rootSafety),
    );
  }

  if (isRecord(input) && looksLikeRequestRecord(input)) {
    return [normalizeRequestRecord(input, 0, generatedAt, rootSafety)];
  }

  if (looksLikeMcpBody(input)) {
    return [
      normalizeRequestRecord(
        {
          id: "ingest_connector_mcp_fixture_response",
          method: methodFromInferredRoute(input),
          path: inferRoutePath(input),
          expectedStatus: 200,
          expectedBody: input,
        },
        0,
        generatedAt,
        rootSafety,
      ),
    ];
  }

  return [];
}

function normalizeRequestRecord(
  input: unknown,
  index: number,
  _generatedAt: string,
  rootSafety: SafetyEvidence,
): FixtureRecord {
  if (!isRecord(input)) {
    return {
      id: `ingest_connector_mcp_fixture_request_${index + 1}`,
      index,
      method: "GET",
      routePath: DEFAULT_RESOURCE_ROUTE,
      responseSource: "none",
      malformed: true,
      matches: {},
      mismatchFields: [],
      error: "MCP fixture request must be an object.",
      connectorIds: [],
      resourceKeys: [],
      resourceSuccess: false,
      previewSuccess: false,
      durableWrites: false,
      redactionCount: 0,
    };
  }

  const route = recordField(input, "route");
  const request = recordField(input, "request");
  const expected = recordField(input, "expected", "expect");
  const actual = recordField(input, "actual");
  const response = recordField(input, "response");
  const responsePick = pickResponseBody(input, actual, response, expected);
  const routePath =
    safeRoutePath(
      stringField(route, "path") ??
        stringField(input, "path", "routePath", "route_path") ??
        pathFromUrl(stringField(route, "url") ?? stringField(input, "url")),
    ) ?? inferRoutePath(responsePick.body);
  const method =
    normalizeMethod(
      stringField(route, "method") ??
        stringField(input, "method") ??
        methodFromInferredRoute(responsePick.body),
    ) ?? "GET";
  const expectedStatus =
    integerField(input, "expectedStatus", "expected_status") ??
    integerField(expected, "status", "statusCode", "status_code");
  const statusCode =
    integerField(actual, "status", "statusCode", "status_code") ??
    integerField(response, "status", "statusCode", "status_code") ??
    integerField(input, "status", "statusCode", "status_code") ??
    expectedStatus;
  const matches = normalizeMatches(recordField(input, "matches"));
  const mismatchFields = collectMismatchFields({
    matches,
    statusCode,
    expectedStatus,
    actualBody: actual?.body,
    expectedBody: input.expectedBody ?? expected?.body,
  });
  const bodySafety = mergeSafetyEvidence(
    rootSafety,
    collectSafetyEvidence(input),
    collectSafetyEvidence(responsePick.body),
  );
  const connectorIds = uniqueStrings([
    ...collectConnectorIds(input.expectedChecks),
    ...collectConnectorIds(input.requestChecks),
    ...collectConnectorIds(responsePick.body),
    ...collectConnectorIds(request?.body),
    ...collectConnectorIds(input.body),
  ]);
  const resourceKeys = uniqueStrings(collectResourceKeys(responsePick.body));
  const statusIsExpected =
    expectedStatus !== undefined &&
    statusCode !== undefined &&
    expectedStatus === statusCode;
  const successStatus =
    statusCode !== undefined && statusCode >= 200 && statusCode < 300;
  const successfulResponse =
    mismatchFields.length === 0 &&
    (successStatus || statusIsExpected || responsePick.body !== undefined);
  const resourceSuccess =
    successfulResponse && successStatus && isResourceRoute(routePath);
  const previewSuccess =
    successfulResponse &&
    successStatus &&
    isPreviewRoute(routePath) &&
    previewAccepted(responsePick.body);
  const error =
    mismatchFields.length > 0
      ? `Replay mismatch: ${mismatchFields.sort().join(", ")}.`
      : requestErrorMessage(input, actual, response, responsePick, statusCode, expectedStatus);

  return {
    id:
      safeIdentifier(
        stringField(input, "id", "requestId", "request_id"),
        `request_${index + 1}`,
      ) ?? `request_${index + 1}`,
    index,
    title: safeOptionalText(stringField(input, "title", "label")),
    method,
    routePath,
    ...(statusCode === undefined ? {} : { statusCode }),
    ...(expectedStatus === undefined ? {} : { expectedStatus }),
    responseSource: responsePick.source,
    malformed: false,
    matches,
    mismatchFields,
    ...(error === undefined ? {} : { error }),
    connectorIds,
    resourceKeys,
    resourceSuccess,
    previewSuccess,
    localOnly: safetyLocalOnly(bodySafety),
    noNetwork: safetyNoNetwork(bodySafety),
    durableWrites: bodySafety.durableWriteTrueCount > 0,
    redactionCount: redactionReportCount(analyzeRedactions(input)),
  };
}

function buildRequestCard(
  record: FixtureRecord,
): IngestConnectorMcpFixtureRequestCard {
  const status = requestStatus(record);
  const matched = requestMatched(record);
  const title =
    record.title ?? titleFromRoute(record.method, record.routePath, record.index);
  const statusLabelValue = requestStatusLabel(status);
  const valueLabel = responseStatusLabel(record);
  const detailLabels = [
    `${record.method} ${record.routePath}`,
    valueLabel,
    record.expectedStatus === undefined
      ? undefined
      : `Expected HTTP ${record.expectedStatus}`,
    matched === undefined ? undefined : matched ? "Replay matched" : "Replay mismatch",
    record.resourceSuccess ? "Resource request succeeded" : undefined,
    record.previewSuccess ? "Preview request succeeded" : undefined,
    record.connectorIds.length > 0
      ? `Connectors: ${record.connectorIds.join(", ")}`
      : undefined,
    record.localOnly === undefined
      ? "Local-only unknown"
      : record.localOnly
        ? "Local only"
        : "Local-only disabled",
    record.noNetwork === undefined
      ? "Network safety unknown"
      : record.noNetwork
        ? "No network"
        : "Network access present",
    record.durableWrites ? "Durable writes present" : "0 durable writes",
    record.redactionCount > 0
      ? formatCount(record.redactionCount, "redaction")
      : undefined,
  ].filter(isDefined);

  return {
    id: `ingest_connector_mcp_fixture.request.${sanitizeIdentifier(
      record.id,
      `request_${record.index + 1}`,
    )}`,
    requestId: safeText(record.id, `request_${record.index + 1}`),
    index: record.index,
    title,
    method: record.method,
    routePath: record.routePath,
    status,
    statusLabel: statusLabelValue,
    ...(record.statusCode === undefined ? {} : { statusCode: record.statusCode }),
    ...(record.expectedStatus === undefined
      ? {}
      : { expectedStatus: record.expectedStatus }),
    ...(matched === undefined ? {} : { matched }),
    resourceSuccess: record.resourceSuccess,
    previewSuccess: record.previewSuccess,
    connectorIds: record.connectorIds,
    redacted: record.redactionCount > 0,
    redactionCount: record.redactionCount,
    valueLabel,
    detailLabels,
    ariaLabel: [title, record.method, record.routePath, statusLabelValue].join(", "),
  };
}

function buildSummary(input: {
  generatedAt: string;
  requestCount: number;
  successfulRequestCount: number;
  failedRequestCount: number;
  routeCount: number;
  methodCount: number;
  statusCount: number;
  resourceCount: number;
  resourceSuccessCount: number;
  previewSuccessCount: number;
  connectorCount: number;
  mismatchCount: number;
  warningCount: number;
  redactionCount: number;
  localOnly: boolean;
  noNetwork: boolean;
  durableWrites: boolean;
}): IngestConnectorMcpFixtureSummary {
  const valueLabel = [
    formatCount(input.requestCount, "request"),
    formatCount(input.connectorCount, "connector"),
  ].join(", ");

  return {
    id: "ingest_connector_mcp_fixture_summary",
    ...input,
    valueLabel,
    detailLabels: [
      formatCount(input.successfulRequestCount, "successful request"),
      formatCount(input.failedRequestCount, "failed request"),
      formatCount(input.routeCount, "route"),
      formatCount(input.methodCount, "method"),
      formatCount(input.statusCount, "HTTP status"),
      formatCount(input.resourceCount, "MCP resource"),
      formatCount(
        input.resourceSuccessCount,
        "resource request success",
        "resource request successes",
      ),
      formatCount(
        input.previewSuccessCount,
        "preview request success",
        "preview request successes",
      ),
      formatCount(input.mismatchCount, "mismatch", "mismatches"),
      formatCount(input.warningCount, "warning"),
      formatCount(input.redactionCount, "redaction"),
      `Local only: ${input.localOnly ? "yes" : "no"}`,
      `No network: ${input.noNetwork ? "yes" : "no"}`,
      `Durable writes: ${input.durableWrites ? "yes" : "no"}`,
      `Generated at ${input.generatedAt}`,
    ],
    ariaLabel: "",
  };
}

function buildSummaryAriaLabel(
  summary: IngestConnectorMcpFixtureSummary,
  status: IngestConnectorMcpFixtureStatus,
): string {
  return [
    "Ingest connector MCP fixture summary",
    summary.valueLabel,
    formatCount(summary.mismatchCount, "mismatch", "mismatches"),
    formatCount(summary.warningCount, "warning"),
    `status ${status}`,
  ].join(", ");
}

function buildSafetySummary(
  records: readonly FixtureRecord[],
  safetyEvidence: SafetyEvidence,
): IngestConnectorMcpFixtureSafetySummary {
  const localOnly = safetyLocalOnly(safetyEvidence) === true;
  const noNetwork = safetyNoNetwork(safetyEvidence) === true;
  const durableWrites = safetyEvidence.durableWriteTrueCount > 0;
  const unknownCount = records.filter(
    (record) => record.localOnly === undefined || record.noNetwork === undefined,
  ).length;
  const status: IngestConnectorMcpFixtureSafetyStatus = durableWrites ||
    !localOnly ||
    !noNetwork
    ? "unsafe"
    : unknownCount > 0
      ? "attention"
      : records.length === 0
        ? "unknown"
        : "safe";
  const detailLabels = [
    `Local only: ${localOnly ? "yes" : "no"}`,
    `No network: ${noNetwork ? "yes" : "no"}`,
    `Durable writes: ${durableWrites ? "yes" : "no"}`,
    formatCount(safetyEvidence.localOnlyTrueCount, "local-only marker"),
    formatCount(safetyEvidence.noNetworkTrueCount, "no-network marker"),
    formatCount(safetyEvidence.durableWriteTrueCount, "durable-write marker"),
    formatCount(unknownCount, "unknown safety request"),
  ];

  return {
    id: "ingest_connector_mcp_fixture_safety",
    status,
    statusLabel: safetyStatusLabel(status),
    localOnly,
    noNetwork,
    durableWrites,
    localOnlyCount: safetyEvidence.localOnlyTrueCount,
    noNetworkCount: safetyEvidence.noNetworkTrueCount,
    durableWriteCount: safetyEvidence.durableWriteTrueCount,
    unknownCount,
    detailLabels,
    ariaLabel: ["MCP fixture safety", safetyStatusLabel(status), ...detailLabels].join(", "),
  };
}

function buildSummaryCards(input: {
  requestCount: number;
  successfulRequestCount: number;
  failedRequestCount: number;
  resourceCount: number;
  resourceSuccessCount: number;
  previewSuccessCount: number;
  connectorCount: number;
  mismatchCount: number;
  warningCount: number;
  redactionCount: number;
  safety: IngestConnectorMcpFixtureSafetySummary;
}): IngestConnectorMcpFixtureSummaryCard[] {
  return [
    buildSummaryCard({
      id: "requests",
      label: "Requests",
      value: formatCount(input.requestCount, "request"),
      status: input.failedRequestCount > 0 ? "error" : input.requestCount > 0 ? "ready" : "empty",
      detailLabels: [
        formatCount(input.successfulRequestCount, "successful request"),
        formatCount(input.failedRequestCount, "failed request"),
      ],
    }),
    buildSummaryCard({
      id: "resources",
      label: "Resources",
      value: formatCount(input.resourceCount, "resource"),
      status: input.resourceCount > 0 ? "ready" : "empty",
      detailLabels: [
        formatCount(
          input.resourceSuccessCount,
          "resource request success",
          "resource request successes",
        ),
        formatCount(input.connectorCount, "connector"),
      ],
    }),
    buildSummaryCard({
      id: "previews",
      label: "Previews",
      value: formatCount(
        input.previewSuccessCount,
        "preview success",
        "preview successes",
      ),
      status: input.previewSuccessCount > 0 ? "ready" : "empty",
      detailLabels: [
        formatCount(
          input.previewSuccessCount,
          "preview request success",
          "preview request successes",
        ),
      ],
    }),
    buildSummaryCard({
      id: "safety",
      label: "Safety",
      value: input.safety.statusLabel,
      status: dashboardStatusFromSafety(input.safety.status),
      detailLabels: input.safety.detailLabels,
    }),
    buildSummaryCard({
      id: "mismatches",
      label: "Mismatches",
      value: formatCount(input.mismatchCount, "mismatch", "mismatches"),
      status: input.mismatchCount > 0 ? "error" : "ready",
      detailLabels: [formatCount(input.mismatchCount, "mismatch", "mismatches")],
    }),
    buildSummaryCard({
      id: "redactions",
      label: "Redactions",
      value: formatCount(input.redactionCount, "redaction"),
      status: input.redactionCount > 0 ? "attention" : "ready",
      detailLabels: [
        formatCount(input.redactionCount, "redaction"),
        formatCount(input.warningCount, "warning"),
      ],
      redactionCount: input.redactionCount,
    }),
  ];
}

function buildSummaryCard(input: {
  id: string;
  label: string;
  value: string;
  status: IngestConnectorMcpFixtureStatus;
  detailLabels: readonly string[];
  redactionCount?: number;
}): IngestConnectorMcpFixtureSummaryCard {
  return {
    id: `ingest_connector_mcp_fixture.summary.${input.id}`,
    label: input.label,
    value: input.value,
    status: input.status,
    statusLabel: statusLabel(input.status),
    detailLabels: [...input.detailLabels],
    redactionCount: input.redactionCount ?? 0,
    ariaLabel: [
      input.label,
      input.value,
      statusLabel(input.status),
      ...input.detailLabels,
    ].join(", "),
  };
}

function buildMismatchIndicator(
  record: FixtureRecord,
): IngestConnectorMcpFixtureMismatchIndicator {
  const fields = uniqueStrings(record.mismatchFields);
  const label = `Replay mismatch in ${record.id}`;
  const detailLabels = [
    `${record.method} ${record.routePath}`,
    record.statusCode === undefined ? undefined : `Actual HTTP ${record.statusCode}`,
    record.expectedStatus === undefined
      ? undefined
      : `Expected HTTP ${record.expectedStatus}`,
    `Fields: ${fields.join(", ")}`,
  ].filter(isDefined);

  return {
    id: `ingest_connector_mcp_fixture.mismatch.${sanitizeIdentifier(
      record.id,
      `request_${record.index + 1}`,
    )}`,
    requestId: record.id,
    method: record.method,
    routePath: record.routePath,
    fields,
    ...(record.statusCode === undefined ? {} : { statusCode: record.statusCode }),
    ...(record.expectedStatus === undefined
      ? {}
      : { expectedStatus: record.expectedStatus }),
    label,
    detailLabels,
    ariaLabel: [label, ...detailLabels].join(", "),
  };
}

function buildErrorStates(
  fixture: NormalizedFixture,
): IngestConnectorMcpFixtureErrorState[] {
  const errors: IngestConnectorMcpFixtureErrorState[] = [];

  if (fixture.inputError !== undefined) {
    errors.push(buildErrorState("input", fixture.inputError));
  }

  for (const record of fixture.records) {
    if (record.error === undefined) {
      continue;
    }
    errors.push(
      buildErrorState(
        record.mismatchFields.length > 0 ? "replay" : "request",
        record.error,
        {
          requestId: record.id,
          method: record.method,
          routePath: record.routePath,
          status: record.statusCode,
        },
      ),
    );
  }

  return dedupeErrors(errors).sort(compareErrors);
}

function buildErrorState(
  context: IngestConnectorMcpFixtureErrorContext,
  error: unknown,
  metadata: {
    requestId?: string;
    method?: string;
    routePath?: string;
    status?: number;
  } = {},
): IngestConnectorMcpFixtureErrorState {
  const redacted = redactSensitiveText(errorMessage(error), "MCP fixture could not load.");
  const requestId = safeOptionalText(metadata.requestId);
  const method = normalizeMethod(metadata.method);
  const routePath = safeRoutePath(metadata.routePath);
  const routePart = requestId ?? routePath ?? context;
  const id = `ingest_connector_mcp_fixture.error.${sanitizeIdentifier(
    `${context}.${routePart}`,
    context,
  )}`;

  return {
    id,
    context,
    ...(requestId === undefined ? {} : { requestId }),
    ...(method === undefined ? {} : { method }),
    ...(routePath === undefined ? {} : { routePath }),
    ...(metadata.status === undefined ? {} : { status: metadata.status }),
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

function buildWarning(
  code: IngestConnectorMcpFixtureWarningCode,
  count: number,
  metadata: { requestId?: string } = {},
): IngestConnectorMcpFixtureWarning {
  const idPart = metadata.requestId ?? code;
  const title = warningTitle(code);
  return {
    id: `ingest_connector_mcp_fixture.warning.${sanitizeIdentifier(
      `${code}.${idPart}`,
      code,
    )}`,
    code,
    severity: "warning",
    title,
    description: warningDescription(code, count),
    count,
    ...(metadata.requestId === undefined
      ? {}
      : { requestId: safeText(metadata.requestId, "request") }),
    ariaLabel: `${title}: ${warningDescription(code, count)}`,
  };
}

function warningsFromRedactionReport(
  report: RedactionReport,
): IngestConnectorMcpFixtureWarning[] {
  return [
    report.secretCount > 0
      ? buildWarning("secret_input", report.secretCount)
      : undefined,
    report.pathCount > 0
      ? buildWarning("raw_path_input", report.pathCount)
      : undefined,
    report.privateMarkerCount > 0
      ? buildWarning("private_marker_input", report.privateMarkerCount)
      : undefined,
  ].filter(isDefined);
}

function requestStatus(
  record: FixtureRecord,
): IngestConnectorMcpFixtureRequestStatus {
  if (record.malformed) {
    return "error";
  }
  if (record.mismatchFields.length > 0) {
    return "mismatch";
  }
  if (record.error !== undefined) {
    return "error";
  }
  if (
    record.responseSource === "none" &&
    record.statusCode === undefined &&
    record.expectedStatus === undefined
  ) {
    return "empty";
  }
  return "success";
}

function requestMatched(record: FixtureRecord): boolean | undefined {
  if (record.mismatchFields.length > 0) {
    return false;
  }
  const matchValues = Object.values(record.matches);
  if (matchValues.some((value) => value === true)) {
    return true;
  }
  if (
    record.statusCode !== undefined &&
    record.expectedStatus !== undefined &&
    record.statusCode === record.expectedStatus
  ) {
    return true;
  }
  return undefined;
}

function resolveStateStatus(input: {
  requestCount: number;
  failedRequestCount: number;
  mismatchCount: number;
  errorCount: number;
  warningCount: number;
  safety: IngestConnectorMcpFixtureSafetySummary;
}): IngestConnectorMcpFixtureStatus {
  if (
    input.failedRequestCount > 0 ||
    input.mismatchCount > 0 ||
    input.errorCount > 0 ||
    input.safety.status === "unsafe"
  ) {
    return "error";
  }
  if (input.warningCount > 0 || input.safety.status === "attention") {
    return "attention";
  }
  if (input.requestCount > 0) {
    return "ready";
  }
  return "empty";
}

function pickResponseBody(
  record: AnyRecord,
  actual: AnyRecord | undefined,
  response: AnyRecord | undefined,
  expected: AnyRecord | undefined,
): ResponsePick {
  if (actual !== undefined && Object.hasOwn(actual, "body")) {
    return { body: actual.body, source: "actual" };
  }
  if (response !== undefined && Object.hasOwn(response, "body")) {
    return { body: response.body, source: "response" };
  }
  if (Object.hasOwn(record, "expectedBody")) {
    return { body: record.expectedBody, source: "expected" };
  }
  if (Object.hasOwn(record, "expected_body")) {
    return { body: record.expected_body, source: "expected" };
  }
  if (expected !== undefined && Object.hasOwn(expected, "body")) {
    return { body: expected.body, source: "expected" };
  }
  if (expected !== undefined && Object.hasOwn(expected, "error")) {
    return { body: { error: expected.error }, source: "expected" };
  }
  if (Object.hasOwn(record, "body") && !isRecord(record.request)) {
    return { body: record.body, source: "body" };
  }
  return { source: "none" };
}

function collectMismatchFields(input: {
  matches: Readonly<Record<string, boolean>>;
  statusCode?: number;
  expectedStatus?: number;
  actualBody?: unknown;
  expectedBody?: unknown;
}): string[] {
  const fields = Object.entries(input.matches)
    .filter(([, value]) => value === false)
    .map(([key]) => safeText(key, "field"));

  if (
    input.statusCode !== undefined &&
    input.expectedStatus !== undefined &&
    input.statusCode !== input.expectedStatus
  ) {
    fields.push("status");
  }

  if (
    input.actualBody !== undefined &&
    input.expectedBody !== undefined &&
    !jsonEquivalent(input.actualBody, input.expectedBody)
  ) {
    fields.push("body");
  }

  return uniqueStrings(fields);
}

function requestErrorMessage(
  record: AnyRecord,
  actual: AnyRecord | undefined,
  response: AnyRecord | undefined,
  responsePick: ResponsePick,
  statusCode: number | undefined,
  expectedStatus: number | undefined,
): string | undefined {
  const explicit = apiErrorMessage(actual) ?? apiErrorMessage(response);
  if (explicit !== undefined && responsePick.source !== "expected") {
    return explicit;
  }
  if (
    responsePick.source !== "expected" &&
    statusCode !== undefined &&
    statusCode >= 400 &&
    (expectedStatus === undefined || expectedStatus !== statusCode)
  ) {
    return `MCP fixture request failed with status ${statusCode}.`;
  }
  if (record.ok === false || record.success === false) {
    return "MCP fixture request failed.";
  }
  return undefined;
}

function apiErrorMessage(record: AnyRecord | undefined): string | undefined {
  if (record === undefined) {
    return undefined;
  }
  const body = recordField(record, "body") ?? record;
  const error = recordField(body, "error");
  return (
    stringField(error, "message") ??
    stringField(error, "code") ??
    stringField(body, "message", "error", "description", "detail")
  );
}

function collectConnectorIds(value: unknown, underError = false): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectConnectorIds(item, underError));
  }
  if (!isRecord(value)) {
    return [];
  }

  const ids: string[] = [];
  if (!underError) {
    const direct = stringField(value, "connectorId", "connector_id");
    if (direct !== undefined) {
      ids.push(direct);
    }
    for (const key of ["connectorIds", "connector_ids"]) {
      const list = value[key];
      if (Array.isArray(list)) {
        ids.push(...list.filter((item): item is string => typeof item === "string"));
      }
    }
    const connector = recordField(value, "connector");
    const connectorId = stringField(connector, "id", "connectorId", "connector_id");
    if (connectorId !== undefined) {
      ids.push(connectorId);
    }
    const uriConnector = connectorIdFromUri(
      stringField(value, "resourceUri", "resource_uri"),
    );
    if (uriConnector !== undefined) {
      ids.push(uriConnector);
    }
  }

  for (const [key, entry] of Object.entries(value)) {
    ids.push(...collectConnectorIds(entry, underError || key === "error"));
  }

  return uniqueStrings(ids.map(normalizeConnectorId).filter(isDefined));
}

function collectResourceKeys(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectResourceKeys);
  }
  if (!isRecord(value)) {
    return [];
  }

  const keys: string[] = [];
  if (looksLikeResourceRecord(value)) {
    keys.push(resourceKey(value));
  }
  for (const nested of Object.values(value)) {
    keys.push(...collectResourceKeys(nested));
  }
  return uniqueStrings(keys);
}

function looksLikeResourceRecord(value: AnyRecord): boolean {
  if (Array.isArray(value.resources)) {
    return false;
  }
  if (stringField(value, "connectorId", "connector_id") !== undefined) {
    return isRecord(value.resource) || isRecord(value.connector) || isRecord(value.content);
  }
  if (isRecord(value.resource) && isRecord(value.connector)) {
    return true;
  }
  const schemaVersion = stringField(value, "schemaVersion", "schema_version");
  return schemaVersion?.includes("ingest-connector-mcp-resource/") === true;
}

function resourceKey(value: AnyRecord): string {
  const nestedResource = recordField(value, "resource");
  if (
    stringField(value, "connectorId", "connector_id") === undefined &&
    nestedResource !== undefined &&
    looksLikeResourceRecord(nestedResource)
  ) {
    return resourceKey(nestedResource);
  }

  const connectorId =
    stringField(value, "connectorId", "connector_id") ??
    stringField(recordField(value, "connector"), "id");
  const resource = recordField(value, "resource");
  const uri = stringField(resource, "uri", "resourceUri", "resource_uri") ??
    stringField(value, "uri", "resourceUri", "resource_uri");
  return safeText(connectorId ?? uri ?? JSON.stringify(redactSensitiveValue(value)), "resource");
}

function collectSafetyEvidence(
  value: unknown,
  key = "",
  seen = new WeakSet<object>(),
): SafetyEvidence {
  const evidence = emptySafetyEvidence();

  if (value === undefined || value === null) {
    return evidence;
  }
  if (typeof value === "boolean") {
    observeBooleanSafety(evidence, key, value);
    return evidence;
  }
  if (typeof value === "string") {
    observeStringSafety(evidence, key, value);
    return evidence;
  }
  if (typeof value !== "object") {
    return evidence;
  }
  if (seen.has(value)) {
    return evidence;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      mergeSafetyEvidenceInto(evidence, collectSafetyEvidence(item, key, seen));
    }
    return evidence;
  }

  for (const [entryKey, entryValue] of Object.entries(value as AnyRecord)) {
    mergeSafetyEvidenceInto(
      evidence,
      collectSafetyEvidence(entryValue, entryKey, seen),
    );
  }
  return evidence;
}

function observeBooleanSafety(
  evidence: SafetyEvidence,
  key: string,
  value: boolean,
): void {
  const token = normalizeToken(key);
  if (token === "local_only" || token === "local") {
    if (value) {
      evidence.localOnlyTrueCount += 1;
    } else {
      evidence.localOnlyFalseCount += 1;
    }
  }
  if (token === "no_network") {
    if (value) {
      evidence.noNetworkTrueCount += 1;
    } else {
      evidence.noNetworkFalseCount += 1;
    }
  }
  if (token === "network_access" || token === "allow_network") {
    if (value) {
      evidence.noNetworkFalseCount += 1;
    } else {
      evidence.noNetworkTrueCount += 1;
    }
  }
  if (token === "durable_writes") {
    if (value) {
      evidence.durableWriteTrueCount += 1;
    } else {
      evidence.durableWriteFalseCount += 1;
    }
  }
}

function observeStringSafety(
  evidence: SafetyEvidence,
  key: string,
  value: string,
): void {
  const token = normalizeToken(key);
  if (token === "mode" && isDisabledNetworkMode(value)) {
    evidence.noNetworkTrueCount += 1;
  }
  if (isUrlLikeKey(token) || looksLikeUrl(value)) {
    if (isExternalUrl(value)) {
      evidence.externalNetworkCount += 1;
      evidence.noNetworkFalseCount += 1;
    } else if (isLocalUrl(value)) {
      evidence.noNetworkTrueCount += 1;
    }
  }
}

function mergeSafetyEvidence(
  ...values: readonly SafetyEvidence[]
): SafetyEvidence {
  const merged = emptySafetyEvidence();
  for (const value of values) {
    mergeSafetyEvidenceInto(merged, value);
  }
  return merged;
}

function mergeSafetyEvidenceInto(
  target: SafetyEvidence,
  source: SafetyEvidence,
): void {
  target.localOnlyTrueCount += source.localOnlyTrueCount;
  target.localOnlyFalseCount += source.localOnlyFalseCount;
  target.noNetworkTrueCount += source.noNetworkTrueCount;
  target.noNetworkFalseCount += source.noNetworkFalseCount;
  target.durableWriteTrueCount += source.durableWriteTrueCount;
  target.durableWriteFalseCount += source.durableWriteFalseCount;
  target.externalNetworkCount += source.externalNetworkCount;
}

function emptySafetyEvidence(): SafetyEvidence {
  return {
    localOnlyTrueCount: 0,
    localOnlyFalseCount: 0,
    noNetworkTrueCount: 0,
    noNetworkFalseCount: 0,
    durableWriteTrueCount: 0,
    durableWriteFalseCount: 0,
    externalNetworkCount: 0,
  };
}

function safetyLocalOnly(value: SafetyEvidence): boolean | undefined {
  if (value.localOnlyFalseCount > 0 || value.externalNetworkCount > 0) {
    return false;
  }
  return value.localOnlyTrueCount > 0 ? true : undefined;
}

function safetyNoNetwork(value: SafetyEvidence): boolean | undefined {
  if (value.noNetworkFalseCount > 0 || value.externalNetworkCount > 0) {
    return false;
  }
  return value.noNetworkTrueCount > 0 ? true : undefined;
}

function analyzeRedactions(
  value: unknown,
  key = "",
  seen = new WeakSet<object>(),
): RedactionReport {
  const report = emptyRedactionReport();

  if (value === undefined || value === null) {
    return report;
  }
  if (typeof value === "string") {
    mergeRedactionReportInto(report, analyzeStringRedactions(value));
    if (isSecretKey(key)) {
      report.secretCount += 1;
    }
    return report;
  }
  if (typeof value !== "object") {
    return report;
  }
  if (isSecretKey(key)) {
    report.secretCount += 1;
  }
  if (seen.has(value)) {
    return report;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      mergeRedactionReportInto(report, analyzeRedactions(item, key, seen));
    }
    return report;
  }

  for (const [entryKey, entryValue] of Object.entries(value as AnyRecord)) {
    mergeRedactionReportInto(
      report,
      analyzeRedactions(entryValue, entryKey, seen),
    );
  }
  return report;
}

function analyzeStringRedactions(value: string): RedactionReport {
  const report = emptyRedactionReport();
  report.secretCount += matchCount(value, secretPattern());
  report.pathCount += matchCount(value, pathPattern());
  report.privateMarkerCount += matchCount(value, privateMarkerPattern());
  return report;
}

function mergeRedactionReportInto(
  target: RedactionReport,
  source: RedactionReport,
): void {
  target.secretCount += source.secretCount;
  target.pathCount += source.pathCount;
  target.privateMarkerCount += source.privateMarkerCount;
}

function emptyRedactionReport(): RedactionReport {
  return {
    secretCount: 0,
    pathCount: 0,
    privateMarkerCount: 0,
  };
}

function redactionReportCount(report: RedactionReport): number {
  return report.secretCount + report.pathCount + report.privateMarkerCount;
}

function redactSensitiveText(value: unknown, fallback: string): RedactedText {
  let text = value === undefined || value === null ? "" : String(value);
  if (text.trim() === "") {
    return {
      text: fallback,
      redactionCount: 0,
    };
  }

  let redactionCount = 0;
  const replace = (
    pattern: RegExp,
    replacement: string | ((match: string, ...args: string[]) => string),
  ) => {
    text = text.replace(pattern, (...args) => {
      redactionCount += 1;
      if (typeof replacement === "function") {
        return replacement(args[0], ...(args.slice(1, -2) as string[]));
      }
      return replacement;
    });
  };

  replace(secretQueryPattern(), (_match, prefix) => `${prefix}[redacted-secret]`);
  replace(secretAssignmentPattern(), (_match, keyText) => `${keyText}=[redacted-secret]`);
  replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted-secret]");
  replace(/\b(?:sk|rk|pat|glpat|github_pat)-[A-Za-z0-9_-]{8,}\b/gi, "[redacted-secret]");
  replace(/\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]{8,}\b/gi, "[redacted-secret]");
  replace(
    /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    "[redacted-secret]",
  );
  replace(pathPattern(), "[redacted-path]");
  replace(privateMarkerPattern(), "[redacted-private]");

  text = text
    .replace(/(?:\[redacted-path\]){2,}/g, "[redacted-path]")
    .replace(/(?:\[redacted-secret\]){2,}/g, "[redacted-secret]")
    .replace(/(?:\[redacted-private\]){2,}/g, "[redacted-private]")
    .replace(/\s+/g, " ")
    .trim();

  return {
    text: text === "" ? fallback : truncate(text, 220),
    redactionCount,
  };
}

function redactSensitiveValue(
  value: unknown,
  key = "",
  seen = new WeakMap<object, unknown>(),
): unknown {
  if (value === null || typeof value !== "object") {
    if (typeof value !== "string") {
      return value;
    }
    return isSecretKey(key) ? "[redacted-secret]" : redactSensitiveText(value, value).text;
  }
  if (isSecretKey(key)) {
    return "[redacted-secret]";
  }

  const objectValue = value as object;
  const existing = seen.get(objectValue);
  if (existing !== undefined) {
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

  const copy: AnyRecord = {};
  seen.set(objectValue, copy);
  for (const [entryKey, entryValue] of Object.entries(value as AnyRecord)) {
    copy[entryKey] = redactSensitiveValue(entryValue, entryKey, seen);
  }
  return copy;
}

function buildCounts(
  kind: "method" | "status" | "route",
  values: readonly string[],
  prefix = "",
): IngestConnectorMcpFixtureCount[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) =>
      kind === "status"
        ? Number(left) - Number(right) || left.localeCompare(right)
        : left.localeCompare(right),
    )
    .map(([key, count]) => ({
      id: `ingest_connector_mcp_fixture.count.${kind}.${sanitizeIdentifier(key, kind)}`,
      key,
      count,
      label: `${prefix}${key}: ${count}`,
      ariaLabel: `${kind} ${prefix}${key}: ${count}`,
    }));
}

function normalizeMatches(
  value: AnyRecord | undefined,
): Readonly<Record<string, boolean>> {
  if (value === undefined) {
    return {};
  }

  const matches: Record<string, boolean> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "boolean") {
      matches[safeText(key, "field")] = entry;
    }
  }
  return matches;
}

function previewAccepted(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const preview = recordField(value, "preview");
  return (
    booleanField(preview, "accepted") === true ||
    booleanField(value, "accepted") === true ||
    stringField(value, "schemaVersion", "schema_version")?.includes("mcp-preview") === true
  );
}

function isResourceRoute(routePath: string): boolean {
  return routePath.includes("/resources");
}

function isPreviewRoute(routePath: string): boolean {
  return routePath.includes("/preview");
}

function inferRoutePath(value: unknown): string {
  if (isRecord(value)) {
    const schemaVersion = stringField(value, "schemaVersion", "schema_version") ?? "";
    if (
      schemaVersion.includes("preview") ||
      Object.hasOwn(value, "preview") ||
      Object.hasOwn(value, "connectorId") && Object.hasOwn(value, "dryRun")
    ) {
      return DEFAULT_PREVIEW_ROUTE;
    }
  }
  return DEFAULT_RESOURCE_ROUTE;
}

function methodFromInferredRoute(value: unknown): string {
  return inferRoutePath(value) === DEFAULT_PREVIEW_ROUTE ? "POST" : "GET";
}

function looksLikeRequestRecord(value: AnyRecord): boolean {
  return (
    isRecord(value.route) ||
    isRecord(value.request) ||
    isRecord(value.response) ||
    isRecord(value.actual) ||
    isRecord(value.expected) ||
    isRecord(value.expect) ||
    Object.hasOwn(value, "expectedBody") ||
    Object.hasOwn(value, "expectedStatus") ||
    stringField(value, "method") !== undefined ||
    stringField(value, "path", "routePath", "route_path") !== undefined
  );
}

function looksLikeMcpBody(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  if (
    Array.isArray(value.resources) ||
    isRecord(value.resource) ||
    isRecord(value.preview) ||
    stringField(value, "connectorId", "connector_id") !== undefined
  ) {
    return true;
  }
  const schemaVersion = stringField(value, "schemaVersion", "schema_version");
  return schemaVersion?.includes("ingest-connector-mcp") === true;
}

function titleFromRoute(method: string, routePath: string, index: number): string {
  if (isPreviewRoute(routePath)) {
    return `${method} MCP preview`;
  }
  if (isResourceRoute(routePath)) {
    return `${method} MCP resources`;
  }
  return `${method} MCP request ${index + 1}`;
}

function responseStatusLabel(record: FixtureRecord): string {
  if (record.statusCode !== undefined) {
    return `HTTP ${record.statusCode}`;
  }
  if (record.expectedStatus !== undefined) {
    return `Expected HTTP ${record.expectedStatus}`;
  }
  return "HTTP status unknown";
}

function statusLabel(status: IngestConnectorMcpFixtureStatus): string {
  switch (status) {
    case "empty":
      return "No fixture requests";
    case "ready":
      return "Ready";
    case "attention":
      return "Needs review";
    case "error":
      return "Error";
  }
}

function requestStatusLabel(
  status: IngestConnectorMcpFixtureRequestStatus,
): string {
  switch (status) {
    case "empty":
      return "No response";
    case "success":
      return "Loaded";
    case "mismatch":
      return "Replay mismatch";
    case "error":
      return "Error";
  }
}

function safetyStatusLabel(
  status: IngestConnectorMcpFixtureSafetyStatus,
): string {
  switch (status) {
    case "safe":
      return "Safe";
    case "attention":
      return "Needs review";
    case "unsafe":
      return "Unsafe";
    case "unknown":
      return "Unknown";
  }
}

function dashboardStatusFromSafety(
  status: IngestConnectorMcpFixtureSafetyStatus,
): IngestConnectorMcpFixtureStatus {
  switch (status) {
    case "safe":
      return "ready";
    case "attention":
    case "unknown":
      return "attention";
    case "unsafe":
      return "error";
  }
}

function errorLabel(context: IngestConnectorMcpFixtureErrorContext): string {
  switch (context) {
    case "input":
      return "MCP fixture input could not load";
    case "request":
      return "MCP fixture request could not load";
    case "replay":
      return "MCP fixture replay mismatch";
  }
}

function retryLabel(context: IngestConnectorMcpFixtureErrorContext): string {
  switch (context) {
    case "input":
      return "Reload MCP fixture";
    case "request":
      return "Retry MCP fixture request";
    case "replay":
      return "Replay MCP fixture";
  }
}

function warningTitle(code: IngestConnectorMcpFixtureWarningCode): string {
  switch (code) {
    case "secret_input":
      return "Secret redacted";
    case "raw_path_input":
      return "Local path redacted";
    case "private_marker_input":
      return "Private marker redacted";
    case "malformed_request":
      return "Malformed request";
  }
}

function warningDescription(
  code: IngestConnectorMcpFixtureWarningCode,
  count: number,
): string {
  switch (code) {
    case "secret_input":
      return `${formatCount(count, "secret marker")} omitted from MCP fixture state.`;
    case "raw_path_input":
      return `${formatCount(count, "local path")} omitted from MCP fixture state.`;
    case "private_marker_input":
      return `${formatCount(count, "private marker")} omitted from MCP fixture state.`;
    case "malformed_request":
      return `${formatCount(count, "request")} could not be normalized.`;
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim() !== "") {
    return error.trim();
  }
  if (isRecord(error)) {
    const nested = recordField(error, "error");
    return (
      stringField(nested, "message", "code") ??
      stringField(error, "message", "code", "error", "description") ??
      JSON.stringify(redactSensitiveValue(error))
    );
  }
  return "MCP fixture could not load.";
}

function safeIdentifier(
  value: string | undefined,
  fallback: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const redacted = redactSensitiveText(value, fallback);
  if (redacted.redactionCount > 0) {
    return fallback;
  }
  return sanitizeIdentifier(redacted.text, fallback);
}

function safeText(value: string | undefined, fallback: string): string {
  return redactSensitiveText(value ?? fallback, fallback).text;
}

function safeOptionalText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const text = redactSensitiveText(value, "").text;
  return text === "" ? undefined : text;
}

function safeRoutePath(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const path = pathFromUrl(value) ?? value;
  return redactSensitiveText(path, DEFAULT_RESOURCE_ROUTE).text;
}

function normalizeConnectorId(value: string): string | undefined {
  const redacted = redactSensitiveText(value, "");
  if (redacted.text === "" || redacted.redactionCount > 0) {
    return undefined;
  }
  return sanitizeIdentifier(redacted.text, "connector");
}

function connectorIdFromUri(uri: string | undefined): string | undefined {
  if (uri === undefined) {
    return undefined;
  }
  const connectorPathMatch = uri.match(/\/connectors\/([^/?#]+)/i);
  if (connectorPathMatch !== null) {
    return connectorPathMatch[1];
  }
  return undefined;
}

function normalizeTimestamp(
  timestamp: string | undefined,
  fallback: string | undefined,
): string {
  const candidate = timestamp ?? fallback;
  if (candidate === undefined) {
    return DEFAULT_TIMESTAMP;
  }
  const parsed = Date.parse(candidate);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : DEFAULT_TIMESTAMP;
}

function timestampField(
  record: AnyRecord | undefined,
  ...keys: readonly string[]
): string | undefined {
  const value = stringField(record, ...keys);
  if (value === undefined) {
    return undefined;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
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

function integerField(
  record: AnyRecord | undefined,
  ...keys: readonly string[]
): number | undefined {
  if (record === undefined) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.trunc(value);
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
  }
  return undefined;
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

function normalizeMethod(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const method = value.trim().toUpperCase();
  return /^[A-Z]+$/.test(method) ? method : undefined;
}

function pathFromUrl(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}`;
  } catch {
    return value.startsWith("/") ? value : undefined;
  }
}

function isDisabledNetworkMode(value: string): boolean {
  return ["disabled", "none", "off", "local", "no_network"].includes(
    normalizeToken(value),
  );
}

function isUrlLikeKey(key: string): boolean {
  return [
    "api_base",
    "base_url",
    "url",
    "uri",
    "resource_uri",
    "endpoint",
    "href",
  ].includes(key);
}

function looksLikeUrl(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

function isExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }
    return !isLoopbackHost(url.hostname);
  } catch {
    return false;
  }
}

function isLocalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const scheme = url.protocol.replace(/:$/, "").toLocaleLowerCase();
    if (LOCAL_URI_SCHEMES.has(scheme)) {
      return true;
    }
    if (url.protocol === "http:" || url.protocol === "https:") {
      return isLoopbackHost(url.hostname);
    }
    return false;
  } catch {
    return false;
  }
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLocaleLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function isSecretKey(key: string): boolean {
  const token = normalizeToken(key);
  return (
    token.includes("token") ||
    token.includes("secret") ||
    token.includes("password") ||
    token.includes("authorization") ||
    token.includes("credential") ||
    token.includes("api_key") ||
    token === "key"
  );
}

function secretPattern(): RegExp {
  return new RegExp(
    `${secretQueryPattern().source}|${secretAssignmentPattern().source}|\\bBearer\\s+[A-Za-z0-9._~+/=-]{8,}|\\b(?:sk|rk|pat|glpat|github_pat)-[A-Za-z0-9_-]{8,}\\b|\\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]{8,}\\b|\\b[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\b`,
    "gi",
  );
}

function secretQueryPattern(): RegExp {
  return /([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|key)=)[^&\s]+/gi;
}

function secretAssignmentPattern(): RegExp {
  return /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|authorization)\b\s*[:=]\s*("[^"]+"|'[^']+'|[^\s,;]+)/gi;
}

function pathPattern(): RegExp {
  return /(?:\b[A-Za-z]:[\\/][^\s"',;)}\]]+|\\\\[^\\\s"',;)}\]]+[\\][^\s"',;)}\]]+|\bfile:\/\/\/?[^\s,;'"<>]+|\b(?:\/Users|\/home|\/var|\/tmp|\/private|\/mnt|\/Volumes|\/workspace|\/root|\/secrets?)(?:\/[^\s,;'"<>()[\]]*)+)/gi;
}

function privateMarkerPattern(): RegExp {
  return /(?:^|[\\/])\.?codex[-_ ]?private(?:[\\/][^\s,;'"<>()[\]]*)?|\bcodex[-_ ]?private\b|\bprivate[-_\s]?plan(?:[-_\s]?pack)?\b/gi;
}

function matchCount(value: string, pattern: RegExp): number {
  return value.match(pattern)?.length ?? 0;
}

function jsonEquivalent(left: unknown, right: unknown): boolean {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function dedupeWarnings(
  warnings: readonly IngestConnectorMcpFixtureWarning[],
): IngestConnectorMcpFixtureWarning[] {
  const byKey = new Map<string, IngestConnectorMcpFixtureWarning>();
  for (const warning of warnings) {
    const key = `${warning.code}:${warning.requestId ?? ""}`;
    const previous = byKey.get(key);
    if (previous === undefined) {
      byKey.set(key, warning);
      continue;
    }
    byKey.set(key, {
      ...previous,
      count: previous.count + warning.count,
      description: warningDescription(warning.code, previous.count + warning.count),
    });
  }
  return [...byKey.values()].sort(compareWarnings);
}

function dedupeErrors(
  errors: readonly IngestConnectorMcpFixtureErrorState[],
): IngestConnectorMcpFixtureErrorState[] {
  const seen = new Set<string>();
  const deduped: IngestConnectorMcpFixtureErrorState[] = [];
  for (const error of errors) {
    const key = [
      error.context,
      error.requestId,
      error.method,
      error.routePath,
      error.status,
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

function compareWarnings(
  left: IngestConnectorMcpFixtureWarning,
  right: IngestConnectorMcpFixtureWarning,
): number {
  return (
    left.code.localeCompare(right.code) ||
    (left.requestId ?? "").localeCompare(right.requestId ?? "") ||
    left.id.localeCompare(right.id)
  );
}

function compareErrors(
  left: IngestConnectorMcpFixtureErrorState,
  right: IngestConnectorMcpFixtureErrorState,
): number {
  return (
    left.context.localeCompare(right.context) ||
    (left.routePath ?? "").localeCompare(right.routePath ?? "") ||
    (left.requestId ?? "").localeCompare(right.requestId ?? "") ||
    (left.status ?? 0) - (right.status ?? 0) ||
    left.id.localeCompare(right.id)
  );
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function isRecord(value: unknown): value is AnyRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function sum<T>(items: readonly T[], selector: (item: T) => number): number {
  return items.reduce((total, item) => total + selector(item), 0);
}

function formatCount(
  value: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function sanitizeIdentifier(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96);

  return normalized === "" ? fallback : normalized;
}

function normalizeToken(value: string | undefined): string {
  return value === undefined
    ? ""
    : value
        .trim()
        .replace(/([a-z])([A-Z])/g, "$1_$2")
        .toLocaleLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

function clonePlain<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  const objectValue = value as object;
  const existing = seen.get(objectValue);
  if (existing !== undefined) {
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

  const cloned: AnyRecord = {};
  seen.set(objectValue, cloned);
  for (const [entryKey, entryValue] of Object.entries(value as AnyRecord)) {
    cloned[entryKey] = clonePlain(entryValue, seen);
  }
  return cloned as T;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  const objectValue = value as object;
  if (seen.has(objectValue)) {
    return value;
  }
  seen.add(objectValue);

  for (const nested of Object.values(value as AnyRecord)) {
    deepFreeze(nested, seen);
  }

  return Object.freeze(value);
}
