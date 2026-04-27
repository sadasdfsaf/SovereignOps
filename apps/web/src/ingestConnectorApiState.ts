import {
  buildIngestConnectorEmptyState,
  buildIngestConnectorState,
  getIngestConnectorReadinessStatusLabel,
  type IngestConnectorCard,
  type IngestConnectorEmptyState,
  type IngestConnectorReadinessStatus,
  type IngestConnectorRow,
  type IngestConnectorState,
} from "./ingestConnectorState.ts";

export type IngestConnectorApiRequestStatus = "empty" | "success" | "error";

export type IngestConnectorApiContext = "request" | "response" | "manifest" | "replay";

export interface BuildIngestConnectorApiStateOptions {
  defaultTimestamp?: string;
  error?: unknown;
  method?: string;
  routePath?: string;
  status?: number;
}

export interface IngestConnectorApiState {
  id: "ingest_connector_api_state";
  generatedAt: string;
  status: IngestConnectorReadinessStatus;
  statusLabel: string;
  requestCount: number;
  successfulRequestCount: number;
  failedRequestCount: number;
  connectorCount: number;
  warningCount: number;
  redacted: boolean;
  redactionCount: number;
  connectorState: IngestConnectorState;
  cards: IngestConnectorCard[];
  rows: IngestConnectorRow[];
  requestCards: IngestConnectorApiRequestCard[];
  summary: IngestConnectorApiSummary;
  emptyStates: IngestConnectorApiEmptyStates;
  errorStates: IngestConnectorApiErrorState[];
  ariaLabel: string;
}

export interface IngestConnectorApiRequestCard {
  id: string;
  requestId: string;
  title: string;
  method: string;
  routePath: string;
  status: IngestConnectorApiRequestStatus;
  statusLabel: string;
  statusCode?: number;
  valueLabel: string;
  detailLabels: string[];
  redacted: boolean;
  redactionCount: number;
  ariaLabel: string;
}

export interface IngestConnectorApiSummary {
  id: "ingest_connector_api_summary";
  generatedAt: string;
  requestCount: number;
  routeCount: number;
  statusCount: number;
  valueLabel: string;
  methodLabels: string[];
  routeLabels: string[];
  statusLabels: string[];
  detailLabels: string[];
  ariaLabel: string;
}

export interface IngestConnectorApiEmptyStates {
  requests: IngestConnectorApiEmptyState;
  connectors: IngestConnectorEmptyState;
  errors: IngestConnectorApiEmptyState;
}

export interface IngestConnectorApiEmptyState {
  id: string;
  label: string;
  description: string;
  ariaLabel: string;
}

export interface IngestConnectorApiErrorState {
  id: string;
  context: IngestConnectorApiContext;
  routeId?: string;
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

type AnyRecord = Record<string, unknown>;
type ApiResponseSource = "actual" | "response" | "body" | "expect" | "root";

interface ApiRecord {
  id: string;
  index: number;
  title?: string;
  method: string;
  routePath: string;
  status?: number;
  requestBody?: unknown;
  responseBody?: unknown;
  responseSource?: ApiResponseSource;
  generatedAt: string;
  matches?: AnyRecord;
  error?: unknown;
  malformed?: boolean;
}

interface NormalizedBridge {
  generatedAt: string;
  records: ApiRecord[];
  connectorInput: unknown;
  redactionCount: number;
  inputError?: unknown;
}

interface RedactedText {
  text: string;
  redactionCount: number;
}

const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const DEFAULT_CONNECTOR_ROUTE = "/v1/ingest/connectors";

export function buildIngestConnectorApiState(
  input: unknown = {},
  options: BuildIngestConnectorApiStateOptions = {},
): IngestConnectorApiState {
  const bridge = normalizeBridge(input, options);
  const connectorState = buildIngestConnectorState(bridge.connectorInput);
  const requestCards = buildRequestCardsFromRecords(bridge.records);
  const bridgeErrors = collectErrorStates(bridge.records, bridge.inputError);
  const errorStates =
    options.error === undefined
      ? bridgeErrors
      : [
          ...bridgeErrors,
          buildIngestConnectorApiErrorState("response", options.error),
        ];
  const redactionCount =
    bridge.redactionCount +
    sum(requestCards, (card) => card.redactionCount) +
    sum(errorStates, (error) => error.redactionCount);
  const status = resolveApiStatus(connectorState.status, errorStates);
  const summary = buildApiSummary(bridge.generatedAt, bridge.records);
  const state: IngestConnectorApiState = {
    id: "ingest_connector_api_state",
    generatedAt: bridge.generatedAt,
    status,
    statusLabel: getIngestConnectorReadinessStatusLabel(status),
    requestCount: requestCards.length,
    successfulRequestCount: requestCards.filter((card) => card.status === "success")
      .length,
    failedRequestCount: requestCards.filter((card) => card.status === "error")
      .length,
    connectorCount: connectorState.totalCount,
    warningCount: connectorState.warningCount,
    redacted: redactionCount > 0,
    redactionCount,
    connectorState,
    cards: connectorState.cards,
    rows: connectorState.rows,
    requestCards,
    summary,
    emptyStates: buildIngestConnectorApiEmptyStates(),
    errorStates: dedupeErrorStates(errorStates),
    ariaLabel: [
      "Ingest connector API state",
      formatCount(connectorState.totalCount, "connector"),
      formatCount(requestCards.length, "request"),
      getIngestConnectorReadinessStatusLabel(status),
    ].join(", "),
  };

  return deepFreeze(state);
}

export function buildIngestConnectorApiCards(
  input: unknown,
  options: BuildIngestConnectorApiStateOptions = {},
): IngestConnectorCard[] {
  return buildIngestConnectorApiState(input, options).cards;
}

export function buildIngestConnectorApiRows(
  input: unknown,
  options: BuildIngestConnectorApiStateOptions = {},
): IngestConnectorRow[] {
  return buildIngestConnectorApiState(input, options).rows;
}

export function buildIngestConnectorApiRequestCards(
  input: unknown,
  options: BuildIngestConnectorApiStateOptions = {},
): IngestConnectorApiRequestCard[] {
  return buildIngestConnectorApiState(input, options).requestCards;
}

export function buildIngestConnectorApiErrorStates(
  input: unknown,
  options: BuildIngestConnectorApiStateOptions = {},
): IngestConnectorApiErrorState[] {
  return buildIngestConnectorApiState(input, options).errorStates;
}

export function buildIngestConnectorApiEmptyStates(): IngestConnectorApiEmptyStates {
  return {
    requests: buildIngestConnectorApiEmptyState("request"),
    connectors: buildIngestConnectorEmptyState(),
    errors: buildIngestConnectorApiEmptyState("response"),
  };
}

export function buildIngestConnectorApiEmptyState(
  context: IngestConnectorApiContext,
): IngestConnectorApiEmptyState {
  switch (context) {
    case "request":
      return {
        id: "ingest_connector_api_requests_empty",
        label: "No connector API requests",
        description:
          "Connector API request metadata will appear after a response or replay is loaded.",
        ariaLabel: "No ingest connector API requests are available",
      };
    case "response":
      return {
        id: "ingest_connector_api_response_empty",
        label: "No connector API response",
        description:
          "Load a connector API response to build connector cards and rows.",
        ariaLabel: "No ingest connector API response is available",
      };
    case "manifest":
      return {
        id: "ingest_connector_api_manifest_empty",
        label: "No connector manifest",
        description:
          "Connector manifests will appear when an API response includes profiles.",
        ariaLabel: "No ingest connector API manifest is available",
      };
    case "replay":
      return {
        id: "ingest_connector_api_replay_empty",
        label: "No connector API replay",
        description:
          "Connector replay request summaries will appear when a replay is loaded.",
        ariaLabel: "No ingest connector API replay is available",
      };
  }
}

export function buildIngestConnectorApiErrorState(
  context: IngestConnectorApiContext,
  error: unknown,
  metadata: {
    routeId?: string;
    method?: string;
    routePath?: string;
    status?: number;
  } = {},
): IngestConnectorApiErrorState {
  const redacted = redactConnectorApiError(error);
  const routePart = metadata.routeId ?? metadata.routePath ?? context;
  const id = `ingest_connector_api_${context}_error.${sanitizeIdentifier(
    routePart,
    "response",
  )}`;

  return {
    id,
    context,
    routeId: safeOptionalText(metadata.routeId),
    method: normalizeMethod(metadata.method),
    routePath: safeRoutePath(metadata.routePath),
    status: metadata.status,
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

export function redactIngestConnectorApiText(value: unknown): string {
  return redactSensitiveText(value, "").text;
}

function normalizeBridge(
  input: unknown,
  options: BuildIngestConnectorApiStateOptions,
): NormalizedBridge {
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
  const records = normalizeApiRecords(root, generatedAt, options);
  const connectorInput = buildConnectorInput(records, rootRecord);
  const redactionCount =
    records.length === 0
      ? redactionCountFromValue(rootRecord)
      : sum(records, (record) =>
          redactionCountFromValue(record.requestBody) +
          redactionCountFromValue(record.responseBody)
        );
  const inputError =
    root === undefined || root === null || isRecord(root) || Array.isArray(root)
      ? undefined
      : "Connector API response must be an object.";

  return {
    generatedAt,
    records,
    connectorInput,
    redactionCount,
    inputError,
  };
}

function normalizeApiRecords(
  root: unknown,
  fallbackTimestamp: string,
  options: BuildIngestConnectorApiStateOptions,
): ApiRecord[] {
  if (isRecord(root) && Array.isArray(root.requests)) {
    return root.requests.map((entry, index) =>
      normalizeReplayRecord(entry, index, fallbackTimestamp, options),
    );
  }

  if (
    isRecord(root) &&
    (isRecord(root.response) ||
      isRecord(root.request) ||
      isRecord(root.route) ||
      isRecord(root.actual) ||
      isRecord(root.expect) ||
      isRecord(root.expected))
  ) {
    return [normalizeReplayRecord(root, 0, fallbackTimestamp, options)];
  }

  if (isRecord(root)) {
    const wrapped = wrappedResponseBody(root);
    if (wrapped !== undefined || hasConnectorPayload(root)) {
      const responseBody = wrapped ?? root;
      const routePath =
        safeRoutePath(stringField(root, "routePath", "route_path", "path")) ??
        options.routePath ??
        DEFAULT_CONNECTOR_ROUTE;
      const method = normalizeMethod(
        options.method ?? stringField(root, "method"),
      ) ?? "GET";
      return [
        {
          id: stringField(root, "id", "requestId", "request_id") ??
            "ingest_connector_api_response",
          index: 0,
          title: stringField(root, "title", "label"),
          method,
          routePath,
          status: options.status ?? integerField(root, "status", "statusCode"),
          requestBody: recordField(root, "requestBody", "request_body"),
          responseBody,
          responseSource: wrapped === undefined ? "root" : "body",
          generatedAt: fallbackTimestamp,
          error: apiErrorMessage(root),
        },
      ];
    }
  }

  return [];
}

function normalizeReplayRecord(
  entry: unknown,
  index: number,
  fallbackTimestamp: string,
  options: BuildIngestConnectorApiStateOptions,
): ApiRecord {
  if (!isRecord(entry)) {
    return {
      id: `ingest_connector_api_request_${index + 1}`,
      index,
      method: "GET",
      routePath: DEFAULT_CONNECTOR_ROUTE,
      generatedAt: fallbackTimestamp,
      malformed: true,
      error: "Connector API replay request must be an object.",
    };
  }

  const route = recordField(entry, "route");
  const request = recordField(entry, "request");
  const actual = recordField(entry, "actual");
  const response = recordField(entry, "response");
  const expected = recordField(entry, "expect", "expected");
  const responsePick = pickResponsePayload(entry, actual, response, expected);
  const routePath =
    safeRoutePath(
      stringField(route, "path") ??
        stringField(entry, "routePath", "route_path", "path") ??
        pathFromUrl(stringField(route, "url") ?? stringField(entry, "url")),
    ) ??
    options.routePath ??
    DEFAULT_CONNECTOR_ROUTE;

  return {
    id:
      stringField(entry, "id", "requestId", "request_id") ??
      `ingest_connector_api_request_${index + 1}`,
    index,
    title: stringField(entry, "title", "label"),
    method:
      normalizeMethod(
        stringField(route, "method") ??
          stringField(entry, "method") ??
          options.method,
      ) ?? "GET",
    routePath,
    status:
      integerField(actual, "status", "statusCode") ??
      integerField(response, "status", "statusCode") ??
      integerField(entry, "status", "statusCode") ??
      integerField(expected, "status", "statusCode") ??
      options.status,
    requestBody:
      recordField(request, "body") ??
      recordField(entry, "requestBody", "request_body"),
    responseBody: responsePick.body,
    responseSource: responsePick.source,
    generatedAt:
      timestampField(
        entry,
        "generatedAt",
        "generated_at",
        "createdAt",
        "created_at",
      ) ?? fallbackTimestamp,
    matches: recordField(entry, "matches"),
    error: replayMismatchMessage(entry) ?? apiErrorMessage(actual ?? response),
  };
}

function pickResponsePayload(
  record: AnyRecord,
  actual: AnyRecord | undefined,
  response: AnyRecord | undefined,
  expected: AnyRecord | undefined,
): { body: unknown; source?: ApiResponseSource } {
  if (actual !== undefined && Object.hasOwn(actual, "body")) {
    return { body: actual.body, source: "actual" };
  }
  if (response !== undefined && Object.hasOwn(response, "body")) {
    return { body: response.body, source: "response" };
  }
  if (Object.hasOwn(record, "body")) {
    return { body: record.body, source: "body" };
  }
  if (expected !== undefined && Object.hasOwn(expected, "body")) {
    return { body: expected.body, source: "expect" };
  }
  if (expected !== undefined && Object.hasOwn(expected, "error")) {
    return { body: { error: expected.error }, source: "expect" };
  }
  return { body: undefined, source: undefined };
}

function wrappedResponseBody(root: AnyRecord): unknown {
  for (const key of ["body", "data", "result", "value", "payload"]) {
    if (Object.hasOwn(root, key)) {
      return root[key];
    }
  }
  return undefined;
}

function buildConnectorInput(
  records: readonly ApiRecord[],
  root: AnyRecord | undefined,
): unknown {
  const payloads = records
    .map((record) => record.responseBody)
    .filter((payload) => payload === undefined || hasConnectorPayload(payload))
    .filter((payload) => payload !== undefined);

  if (
    payloads.length === 0 &&
    root !== undefined &&
    !Array.isArray(root.requests) &&
    hasConnectorPayload(root)
  ) {
    payloads.push(root);
  }

  if (payloads.length === 0) {
    return [];
  }

  if (payloads.length === 1) {
    return normalizePayloadForConnectorState(payloads[0]);
  }

  const connectors = payloads.flatMap(extractConnectorValues);
  return connectors.length > 0 ? { connectors } : [];
}

function normalizePayloadForConnectorState(payload: unknown): unknown {
  if (Array.isArray(payload)) {
    return payload.map(normalizeConnectorForState);
  }

  if (!isRecord(payload)) {
    return payload;
  }

  const copy = clonePlain(payload);
  if (Array.isArray(copy.connectors)) {
    copy.connectors = copy.connectors.map(normalizeConnectorForState);
  }
  if (Array.isArray(copy.profiles)) {
    copy.profiles = copy.profiles.map(normalizeConnectorForState);
  }
  if (Array.isArray(copy.connectorProfiles)) {
    copy.connectorProfiles = copy.connectorProfiles.map(normalizeConnectorForState);
  }
  if (Array.isArray(copy.connector_profiles)) {
    copy.connector_profiles = copy.connector_profiles.map(normalizeConnectorForState);
  }
  for (const key of ["manifest", "connectorManifest", "connector_manifest"]) {
    if (isRecord(copy[key])) {
      copy[key] = normalizePayloadForConnectorState(copy[key]);
    }
  }
  return copy;
}

function extractConnectorValues(payload: unknown): unknown[] {
  const normalized = normalizePayloadForConnectorState(payload);
  if (Array.isArray(normalized)) {
    return normalized;
  }
  if (!isRecord(normalized)) {
    return [normalized];
  }

  for (const key of [
    "connectors",
    "connectorManifests",
    "connector_manifests",
    "profiles",
    "connectorProfiles",
    "connector_profiles",
    "items",
  ]) {
    if (Array.isArray(normalized[key])) {
      return normalized[key] as unknown[];
    }
  }

  for (const key of ["manifest", "connectorManifest", "connector_manifest"]) {
    const nested = normalized[key];
    if (nested !== undefined) {
      return extractConnectorValues(nested);
    }
  }

  return [normalized];
}

function normalizeConnectorForState(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const copy = clonePlain(value);
  const safety = recordField(copy, "safety");
  if (safety !== undefined) {
    const localOnly = safety.localOnly ?? safety.local_only;
    const networkAccess = safety.networkAccess ?? safety.network_access;
    const durableWrites = safety.durableWrites ?? safety.durable_writes;
    const untrustedByDefault =
      safety.untrustedByDefault ??
      safety.untrusted_by_default ??
      safety.contentUntrustedByDefault ??
      safety.content_untrusted_by_default;
    copy.localOnly ??= localOnly;
    copy.networkAccess ??= networkAccess;
    copy.durableWrites ??= durableWrites;
    copy.untrustedByDefault ??=
      untrustedByDefault;
    copy.trustedByDefault ??= safety.trustedByDefault ?? safety.trusted_by_default;
    if (
      copy.safetyState === undefined &&
      localOnly === true &&
      networkAccess === false &&
      durableWrites === false &&
      untrustedByDefault === false
    ) {
      copy.safetyState = "safe";
    }
  }

  return copy;
}

function hasConnectorPayload(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  if (
    Object.hasOwn(value, "connectors") ||
    Object.hasOwn(value, "profiles") ||
    Object.hasOwn(value, "connectorProfiles") ||
    Object.hasOwn(value, "connector_profiles") ||
    Object.hasOwn(value, "connectorManifests") ||
    Object.hasOwn(value, "connector_manifests") ||
    Array.isArray(value.connectors) ||
    Array.isArray(value.profiles) ||
    Array.isArray(value.connectorProfiles) ||
    Array.isArray(value.connector_profiles) ||
    Array.isArray(value.connectorManifests) ||
    Array.isArray(value.connector_manifests)
  ) {
    return true;
  }

  const schemaVersion = stringField(value, "schemaVersion", "schema_version");
  const kind = stringField(value, "kind");
  const command = stringField(value, "command");
  if (
    hasConnectorManifestToken(schemaVersion) ||
    hasConnectorManifestToken(kind) ||
    hasConnectorManifestToken(command)
  ) {
    return true;
  }

  for (const key of ["manifest", "connectorManifest", "connector_manifest"]) {
    if (hasConnectorPayload(value[key])) {
      return true;
    }
  }

  return false;
}

function hasConnectorManifestToken(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  const token = value.toLocaleLowerCase();
  return (
    token.includes("connector-manifest") ||
    token.includes("connector_manifest") ||
    token.includes("connectors manifest") ||
    token.includes("connector manifest")
  );
}

function buildRequestCardsFromRecords(
  records: readonly ApiRecord[],
): IngestConnectorApiRequestCard[] {
  return records
    .slice()
    .sort((left, right) => left.index - right.index || left.id.localeCompare(right.id))
    .map(buildRequestCard);
}

function buildRequestCard(record: ApiRecord): IngestConnectorApiRequestCard {
  const status = requestStatus(record);
  const redactedTitle = redactSensitiveText(
    record.title ?? defaultRequestTitle(record),
    defaultRequestTitle(record),
  );
  const redactedRoute = redactSensitiveText(record.routePath, DEFAULT_CONNECTOR_ROUTE);
  const redactionCount =
    redactedTitle.redactionCount +
    redactedRoute.redactionCount +
    redactionCountFromValue(record.requestBody) +
    redactionCountFromValue(record.responseBody);
  const statusCodeLabel =
    record.status === undefined
      ? requestStatusLabel(status)
      : `${record.responseSource === "expect" ? "Expected " : ""}HTTP ${record.status}`;
  const detailLabels = [
    `${record.method} ${redactedRoute.text}`,
    statusCodeLabel,
    record.responseSource === "expect" ? "Fixture expectation" : undefined,
    redactionCount > 0 ? formatCount(redactionCount, "redaction") : undefined,
    record.generatedAt === "" ? undefined : `Captured at ${record.generatedAt}`,
  ].filter(isDefined);

  return {
    id: `ingest_connector_api_request.${sanitizeIdentifier(
      record.id,
      `request_${record.index + 1}`,
    )}`,
    requestId: safeText(record.id, `request_${record.index + 1}`),
    title: redactedTitle.text,
    method: record.method,
    routePath: redactedRoute.text,
    status,
    statusLabel: requestStatusLabel(status),
    statusCode: record.status,
    valueLabel: statusCodeLabel,
    detailLabels,
    redacted: redactionCount > 0,
    redactionCount,
    ariaLabel: [
      redactedTitle.text,
      record.method,
      redactedRoute.text,
      statusCodeLabel,
    ].join(", "),
  };
}

function buildApiSummary(
  generatedAt: string,
  records: readonly ApiRecord[],
): IngestConnectorApiSummary {
  const methods = countValues(records.map((record) => record.method));
  const routes = countValues(records.map((record) => record.routePath));
  const statuses = countValues(
    records
      .map((record) => record.status)
      .filter((status): status is number => status !== undefined)
      .map((status) => String(status)),
  );
  const methodLabels = formatCountLabels(methods);
  const routeLabels = formatCountLabels(routes);
  const statusLabels = formatCountLabels(statuses, "HTTP ");
  const valueLabel = formatCount(records.length, "request");

  return {
    id: "ingest_connector_api_summary",
    generatedAt,
    requestCount: records.length,
    routeCount: routes.size,
    statusCount: statuses.size,
    valueLabel,
    methodLabels,
    routeLabels,
    statusLabels,
    detailLabels: [
      valueLabel,
      ...methodLabels,
      ...routeLabels,
      ...statusLabels,
      `Generated at ${generatedAt}`,
    ],
    ariaLabel: ["Ingest connector API summary", valueLabel].join(", "),
  };
}

function collectErrorStates(
  records: readonly ApiRecord[],
  inputError: unknown,
): IngestConnectorApiErrorState[] {
  const errors: IngestConnectorApiErrorState[] = [];

  if (inputError !== undefined) {
    errors.push(buildIngestConnectorApiErrorState("response", inputError));
  }

  for (const record of records) {
    const error = record.error ?? responseStatusError(record);
    if (error === undefined) {
      continue;
    }
    errors.push(
      buildIngestConnectorApiErrorState(errorContext(record), error, {
        routeId: record.id,
        method: record.method,
        routePath: record.routePath,
        status: record.status,
      }),
    );
  }

  return dedupeErrorStates(errors);
}

function responseStatusError(record: ApiRecord): string | undefined {
  if (record.responseSource === "expect") {
    return undefined;
  }
  if (record.status !== undefined && record.status >= 400) {
    return `Request failed with status ${record.status}.`;
  }
  return undefined;
}

function replayMismatchMessage(record: AnyRecord): string | undefined {
  const matches = recordField(record, "matches");
  if (matches === undefined) {
    return undefined;
  }

  const failed = Object.entries(matches)
    .filter(([, value]) => value === false)
    .map(([key]) => key);

  return failed.length === 0
    ? undefined
    : `Replay mismatch: ${failed.sort().join(", ")}.`;
}

function apiErrorMessage(record: AnyRecord | undefined): string | undefined {
  if (record === undefined) {
    return undefined;
  }

  const body = recordField(record, "body") ?? record;
  const error = recordField(body, "error");
  const message =
    stringField(error, "message") ??
    stringField(error, "code") ??
    stringField(body, "message", "error", "description", "detail");
  const status = integerField(record, "status", "statusCode");

  if (message !== undefined) {
    return message;
  }
  if (status !== undefined && status >= 400) {
    return `Request failed with status ${status}.`;
  }
  if (body.ok === false) {
    return "Request failed.";
  }
  return undefined;
}

function errorMessage(error: unknown): string | undefined {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim() !== "") {
    return error.trim();
  }
  if (isRecord(error)) {
    const body = recordField(error, "body") ?? error;
    const nested = recordField(body, "error");
    return (
      stringField(nested, "message") ??
      stringField(nested, "code") ??
      stringField(body, "message", "error", "description", "detail")
    );
  }
  return undefined;
}

function redactConnectorApiError(error: unknown): RedactedText {
  const message = errorMessage(error);
  if (message !== undefined) {
    return redactSensitiveText(message, "Connector API response could not load.");
  }

  if (isRecord(error)) {
    return redactSensitiveText(
      JSON.stringify(redactSensitiveValue(error)),
      "Connector API response could not load.",
    );
  }

  return {
    text: "Connector API response could not load.",
    redactionCount: 0,
  };
}

function requestStatus(record: ApiRecord): IngestConnectorApiRequestStatus {
  if (record.malformed || record.error !== undefined) {
    return "error";
  }
  if (
    record.responseSource !== "expect" &&
    record.status !== undefined &&
    record.status >= 400
  ) {
    return "error";
  }
  if (
    record.responseBody !== undefined ||
    record.responseSource === "expect" ||
    (record.status !== undefined && record.status >= 200 && record.status < 400)
  ) {
    return "success";
  }
  return "empty";
}

function resolveApiStatus(
  connectorStatus: IngestConnectorReadinessStatus,
  errorStates: readonly IngestConnectorApiErrorState[],
): IngestConnectorReadinessStatus {
  if (errorStates.length > 0) {
    return "error";
  }
  return connectorStatus;
}

function errorContext(record: ApiRecord): IngestConnectorApiContext {
  if (record.malformed) {
    return "replay";
  }
  if (record.matches !== undefined) {
    return "replay";
  }
  if (record.responseBody !== undefined) {
    return "response";
  }
  return "request";
}

function defaultRequestTitle(record: ApiRecord): string {
  if (record.routePath === DEFAULT_CONNECTOR_ROUTE && record.method === "GET") {
    return "List ingest connectors";
  }
  return "Connector API request";
}

function requestStatusLabel(status: IngestConnectorApiRequestStatus): string {
  switch (status) {
    case "empty":
      return "No response";
    case "success":
      return "Loaded";
    case "error":
      return "Error";
  }
}

function errorLabel(context: IngestConnectorApiContext): string {
  switch (context) {
    case "request":
      return "Connector API request could not load";
    case "response":
      return "Connector API response could not load";
    case "manifest":
      return "Connector manifest could not load";
    case "replay":
      return "Connector API replay could not load";
  }
}

function retryLabel(context: IngestConnectorApiContext): string {
  switch (context) {
    case "request":
      return "Retry connector request";
    case "response":
      return "Retry connector response";
    case "manifest":
      return "Retry connector manifest";
    case "replay":
      return "Retry connector replay";
  }
}

function safeText(value: string | undefined, fallback: string): string {
  const redacted = redactSensitiveText(value ?? fallback, fallback);
  return redacted.text;
}

function safeOptionalText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const redacted = redactSensitiveText(value, "");
  return redacted.text === "" ? undefined : redacted.text;
}

function safeRoutePath(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const redacted = redactSensitiveText(value, DEFAULT_CONNECTOR_ROUTE);
  return redacted.text;
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

  replace(
    /([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|key)=)[^&\s]+/gi,
    (_match, prefix) => `${prefix}[redacted-secret]`,
  );
  replace(
    /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|authorization)\b\s*[:=]\s*("[^"]+"|'[^']+'|[^\s,;]+)/gi,
    (_match, key) => `${key}=[redacted-secret]`,
  );
  replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted-secret]");
  replace(/\b(?:sk|rk|pat|glpat|github_pat)-[A-Za-z0-9_-]{8,}\b/gi, "[redacted-secret]");
  replace(/\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]{8,}\b/gi, "[redacted-secret]");
  replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[redacted-secret]");
  replace(
    /(?:\b[A-Za-z]:[\\/][^\s"',;)}\]]+|\\\\[^\\\s"',;)}\]]+[\\][^\s"',;)}\]]+)/g,
    "[redacted-path]",
  );
  replace(/\bfile:\/\/\/?[^\s,;'"<>]+/gi, "[redacted-path]");
  replace(
    /\b(?:\/Users|\/home|\/var|\/tmp|\/private|\/mnt|\/Volumes|\/workspace|\/root|\/secrets?)(?:\/[^\s,;'"<>()[\]]*)+/g,
    "[redacted-path]",
  );
  replace(
    /(?:^|[\\/])\.codex-private(?:[\\/][^\s,;'"<>()[\]]*)?/gi,
    "[redacted-path]",
  );
  replace(/\bprivate[-_\s]?plan(?:[-_\s]?pack)?\b/gi, "[redacted-path]");

  text = text
    .replace(/(?:\[redacted-path\]){2,}/g, "[redacted-path]")
    .replace(/(?:\[redacted-secret\]){2,}/g, "[redacted-secret]")
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
    return typeof value === "string"
      ? redactSensitiveText(value, value).text
      : value;
  }
  if (isSecretKey(key)) {
    return "[redacted-secret]";
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

  const copy: AnyRecord = {};
  seen.set(objectValue, copy);
  for (const [entryKey, entryValue] of Object.entries(value as AnyRecord)) {
    copy[entryKey] = redactSensitiveValue(entryValue, entryKey, seen);
  }
  return copy;
}

function redactionCountFromValue(
  value: unknown,
  key = "",
  seen = new WeakSet<object>(),
): number {
  if (value === undefined || value === null) {
    return 0;
  }
  if (typeof value === "string") {
    return redactSensitiveText(value, value).redactionCount +
      (isSecretKey(key) ? 1 : 0);
  }
  if (typeof value !== "object") {
    return 0;
  }
  if (seen.has(value)) {
    return 0;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return sum(value, (item) => redactionCountFromValue(item, key, seen));
  }

  let count = 0;
  for (const [entryKey, entryValue] of Object.entries(value as AnyRecord)) {
    if (isSecretKey(entryKey) && entryValue !== undefined && entryValue !== null) {
      count += 1;
    }
    count += redactionCountFromValue(entryValue, entryKey, seen);
  }
  return count;
}

function isSecretKey(key: string): boolean {
  const token = normalizeToken(key);
  return (
    token.includes("token") ||
    token.includes("secret") ||
    token.includes("password") ||
    token.includes("authorization") ||
    token.includes("api_key") ||
    token === "key"
  );
}

function countValues(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return new Map([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function formatCountLabels(counts: ReadonlyMap<string, number>, prefix = ""): string[] {
  return [...counts.entries()].map(([key, value]) => `${prefix}${key}: ${value}`);
}

function dedupeErrorStates(
  errors: readonly IngestConnectorApiErrorState[],
): IngestConnectorApiErrorState[] {
  const seen = new Set<string>();
  const deduped: IngestConnectorApiErrorState[] = [];

  for (const error of errors) {
    const key = [
      error.context,
      error.routeId,
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

  return deduped.sort(compareErrorStates);
}

function compareErrorStates(
  left: IngestConnectorApiErrorState,
  right: IngestConnectorApiErrorState,
): number {
  return (
    left.context.localeCompare(right.context) ||
    (left.routePath ?? "").localeCompare(right.routePath ?? "") ||
    (left.routeId ?? "").localeCompare(right.routeId ?? "") ||
    (left.status ?? 0) - (right.status ?? 0) ||
    left.errorState.description.localeCompare(right.errorState.description)
  );
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
    if (Number.isInteger(value)) {
      return value as number;
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

function clonePlain<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (value === null || typeof value !== "object") {
    return value;
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
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
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
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`;
}
