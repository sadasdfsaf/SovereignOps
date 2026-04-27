export type IngestConnectorMcpStateStatus =
  | "empty"
  | "ready"
  | "attention"
  | "error";

export type IngestConnectorMcpPreviewStatus =
  | "empty"
  | "loaded"
  | "partial"
  | "error";

export type IngestConnectorMcpRequestStatus = "empty" | "success" | "error";

export type IngestConnectorMcpSafetyStatus =
  | "safe"
  | "attention"
  | "unsafe"
  | "unknown";

export type IngestConnectorMcpSectionKind =
  | "resources"
  | "safety"
  | "requests"
  | "errors";

export interface IngestConnectorMcpState {
  id: "ingest_connector_mcp_state";
  label: string;
  ariaLabel: string;
  status: IngestConnectorMcpStateStatus;
  statusLabel: string;
  generatedAt: string;
  resourceCount: number;
  connectorCount: number;
  previewCount: number;
  requestCount: number;
  successfulRequestCount: number;
  failedRequestCount: number;
  errorCount: number;
  redacted: boolean;
  redactionCount: number;
  safety: IngestConnectorMcpSafetySummary;
  cards: IngestConnectorMcpResourceCard[];
  rows: IngestConnectorMcpResourceRow[];
  sections: IngestConnectorMcpSection[];
  requestCards: IngestConnectorMcpRequestCard[];
  errorStates: IngestConnectorMcpErrorState[];
  emptyState: IngestConnectorMcpEmptyState;
}

export interface IngestConnectorMcpResourceCard {
  id: string;
  resourceId: string;
  connectorId: string;
  title: string;
  subtitle: string;
  uriLabel: string;
  mimeType: string;
  mimeTypeLabel: string;
  previewStatus: IngestConnectorMcpPreviewStatus;
  previewStatusLabel: string;
  requestStatus: IngestConnectorMcpRequestStatus;
  requestStatusLabel: string;
  safetyStatus: IngestConnectorMcpSafetyStatus;
  safetyStatusLabel: string;
  safetyFlags: IngestConnectorMcpSafetyFlags;
  redacted: boolean;
  redactionCount: number;
  valueLabel: string;
  detailLabels: string[];
  ariaLabel: string;
}

export interface IngestConnectorMcpResourceRow {
  id: string;
  resourceId: string;
  connectorId: string;
  title: string;
  uriLabel: string;
  mimeType: string;
  mimeTypeLabel: string;
  previewStatus: IngestConnectorMcpPreviewStatus;
  previewStatusLabel: string;
  requestStatus: IngestConnectorMcpRequestStatus;
  requestStatusLabel: string;
  safetyStatus: IngestConnectorMcpSafetyStatus;
  safetyStatusLabel: string;
  safetyFlags: IngestConnectorMcpSafetyFlags;
  redacted: boolean;
  redactionCount: number;
  updatedAt?: string;
  sizeLabel?: string;
  ariaLabel: string;
}

export interface IngestConnectorMcpSafetyFlags {
  localOnly?: boolean;
  noNetwork?: boolean;
  durableWrites?: boolean;
  localOnlyLabel: string;
  noNetworkLabel: string;
  durableWritesLabel: string;
  indicatorLabels: string[];
}

export interface IngestConnectorMcpSafetySummary {
  id: "ingest_connector_mcp_safety_summary";
  status: IngestConnectorMcpSafetyStatus;
  statusLabel: string;
  localOnly?: boolean;
  noNetwork?: boolean;
  durableWrites?: boolean;
  localOnlyCount: number;
  noNetworkCount: number;
  durableWriteCount: number;
  unknownCount: number;
  indicatorLabels: string[];
  detailLabels: string[];
  ariaLabel: string;
}

export interface IngestConnectorMcpSection {
  id: string;
  kind: IngestConnectorMcpSectionKind;
  title: string;
  status: IngestConnectorMcpStateStatus;
  statusLabel: string;
  valueLabel: string;
  detailLabels: string[];
  rowIds: string[];
  cardIds: string[];
  ariaLabel: string;
}

export interface IngestConnectorMcpRequestCard {
  id: string;
  requestId: string;
  title: string;
  method: string;
  routePath: string;
  operation: string;
  status: IngestConnectorMcpRequestStatus;
  statusLabel: string;
  statusCode?: number;
  resourceUri?: string;
  redacted: boolean;
  redactionCount: number;
  valueLabel: string;
  detailLabels: string[];
  ariaLabel: string;
}

export interface IngestConnectorMcpErrorState {
  id: string;
  context: "input" | "request" | "preview" | "resource";
  requestId?: string;
  resourceId?: string;
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

export interface IngestConnectorMcpEmptyState {
  id: "ingest_connector_mcp_empty";
  label: string;
  description: string;
  ariaLabel: string;
}

export interface BuildIngestConnectorMcpStateOptions {
  defaultTimestamp?: string;
}

type AnyRecord = Record<string, unknown>;

interface NormalizedBridge {
  generatedAt: string;
  resources: NormalizedResource[];
  requestCards: IngestConnectorMcpRequestCard[];
  errorStates: IngestConnectorMcpErrorState[];
  redactionCount: number;
}

interface ResourceCandidate {
  value: unknown;
  content?: unknown;
  path: string;
  request?: RequestContext;
  inheritedConnectorId?: string;
  inheritedSafety?: Partial<IngestConnectorMcpSafetyFlags>;
  previewStatus?: IngestConnectorMcpPreviewStatus;
}

interface RequestContext {
  id: string;
  index: number;
  title?: string;
  method: string;
  routePath: string;
  operation: string;
  status?: number;
  requestBody?: unknown;
  responseBody?: unknown;
  error?: unknown;
  malformed?: boolean;
}

interface NormalizedResource {
  resourceId: string;
  connectorId: string;
  title: string;
  description?: string;
  uriLabel: string;
  mimeType: string;
  mimeTypeLabel: string;
  previewStatus: IngestConnectorMcpPreviewStatus;
  requestStatus: IngestConnectorMcpRequestStatus;
  safetyStatus: IngestConnectorMcpSafetyStatus;
  safetyFlags: IngestConnectorMcpSafetyFlags;
  redacted: boolean;
  redactionCount: number;
  updatedAt?: string;
  sizeBytes?: number;
  previewBytes: number;
  sourceIndex: number;
}

interface RedactedText {
  text: string;
  redactionCount: number;
}

const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const DEFAULT_MCP_ROUTE = "/v1/mcp/resources";
const DEFAULT_MCP_READ_ROUTE = "/v1/mcp/resources/read";
const LOCAL_URI_SCHEMES = new Set(["fixture", "local", "sovereignops", "stdin", "workspace"]);

export function buildIngestConnectorMcpState(
  input: unknown = {},
  options: BuildIngestConnectorMcpStateOptions = {},
): IngestConnectorMcpState {
  const bridge = normalizeBridge(input, options);
  const rows = bridge.resources.map(buildResourceRow).sort(compareRows);
  const cards = bridge.resources.map(buildResourceCard).sort(compareCards);
  const safety = buildSafetySummary(rows);
  const errorStates = bridge.errorStates.sort(compareErrors);
  const requestCards = bridge.requestCards.sort(compareRequestCards);
  const status = resolveStateStatus(rows, requestCards, errorStates);
  const connectorCount = uniqueStrings(rows.map((row) => row.connectorId)).length;
  const previewCount = rows.filter((row) => row.previewStatus === "loaded").length;
  const successfulRequestCount = requestCards.filter((card) => card.status === "success")
    .length;
  const failedRequestCount = requestCards.filter((card) => card.status === "error")
    .length;
  const redactionCount = Math.max(
    bridge.redactionCount,
    sum(rows, (row) => row.redactionCount) +
      sum(requestCards, (card) => card.redactionCount) +
      sum(errorStates, (error) => error.redactionCount),
  );
  const state: IngestConnectorMcpState = {
    id: "ingest_connector_mcp_state",
    label: "MCP resource preview",
    ariaLabel: [
      "MCP resource preview",
      formatCount(rows.length, "resource"),
      formatCount(connectorCount, "connector"),
      getIngestConnectorMcpStatusLabel(status),
    ].join(", "),
    status,
    statusLabel: getIngestConnectorMcpStatusLabel(status),
    generatedAt: bridge.generatedAt,
    resourceCount: rows.length,
    connectorCount,
    previewCount,
    requestCount: requestCards.length,
    successfulRequestCount,
    failedRequestCount,
    errorCount: errorStates.length,
    redacted: redactionCount > 0,
    redactionCount,
    safety,
    cards,
    rows,
    sections: buildSections(rows, cards, requestCards, errorStates, safety, status),
    requestCards,
    errorStates,
    emptyState: buildIngestConnectorMcpEmptyState(),
  };

  return deepFreeze(state);
}

export function buildIngestConnectorMcpCards(
  input: unknown,
  options: BuildIngestConnectorMcpStateOptions = {},
): IngestConnectorMcpResourceCard[] {
  return buildIngestConnectorMcpState(input, options).cards;
}

export function buildIngestConnectorMcpRows(
  input: unknown,
  options: BuildIngestConnectorMcpStateOptions = {},
): IngestConnectorMcpResourceRow[] {
  return buildIngestConnectorMcpState(input, options).rows;
}

export function buildIngestConnectorMcpSections(
  input: unknown,
  options: BuildIngestConnectorMcpStateOptions = {},
): IngestConnectorMcpSection[] {
  return buildIngestConnectorMcpState(input, options).sections;
}

export function buildIngestConnectorMcpEmptyState(): IngestConnectorMcpEmptyState {
  return {
    id: "ingest_connector_mcp_empty",
    label: "No MCP resources",
    description: "Connector MCP resources will appear after a list or preview loads.",
    ariaLabel: "No connector MCP resources are available",
  };
}

export function getIngestConnectorMcpStatusLabel(
  status: IngestConnectorMcpStateStatus,
): string {
  switch (status) {
    case "empty":
      return "No resources";
    case "ready":
      return "Ready";
    case "attention":
      return "Needs review";
    case "error":
      return "Error";
  }
}

function normalizeBridge(
  input: unknown,
  options: BuildIngestConnectorMcpStateOptions,
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
  const records = collectRequestContexts(root, generatedAt);
  const requestCards = records.map(buildRequestCard);
  const resourceCandidates = records.length > 0
    ? records.flatMap((record) => collectResourceCandidates(record.responseBody, {
        path: `requests.${record.index}.response`,
        request: record,
      }))
    : collectResourceCandidates(root, { path: "input" });
  const resources = dedupeResources(
    resourceCandidates.map((candidate, index) => normalizeResource(candidate, index)),
  ).sort(compareResources);
  const errors = dedupeErrors([
    ...collectEnvelopeErrors(root, "input"),
    ...records.flatMap((record) => collectRequestErrors(record)),
  ]);
  const redactionCount = redactionCountFromValue(root);

  if (root !== undefined && root !== null && !Array.isArray(root) && !isRecord(root)) {
    errors.push(
      buildErrorState("input", "MCP resource preview input must be an object."),
    );
  }

  return {
    generatedAt,
    resources,
    requestCards,
    errorStates: dedupeErrors(errors),
    redactionCount,
  };
}

function collectRequestContexts(input: unknown, generatedAt: string): RequestContext[] {
  if (isRecord(input) && Array.isArray(input.requests)) {
    return input.requests.map((entry, index) =>
      normalizeRequestContext(entry, index, generatedAt),
    );
  }

  if (
    isRecord(input) &&
    (isRecord(input.request) ||
      isRecord(input.response) ||
      isRecord(input.actual) ||
      isRecord(input.expect) ||
      isRecord(input.expected) ||
      isRecord(input.route))
  ) {
    return [normalizeRequestContext(input, 0, generatedAt)];
  }

  if (isRecord(input) && (isRecord(input.body) || isRecord(input.data))) {
    const body = recordField(input, "body", "data");
    if (body !== undefined && looksLikeResourceEnvelope(body)) {
      return [
        {
          id: stringField(input, "id", "requestId", "request_id") ??
            "ingest_connector_mcp_response",
          index: 0,
          title: stringField(input, "title", "label"),
          method: normalizeMethod(stringField(input, "method")) ?? "GET",
          routePath:
            safeRoutePath(stringField(input, "routePath", "route_path", "path")) ??
            DEFAULT_MCP_ROUTE,
          operation: operationFromRoute(
            safeRoutePath(stringField(input, "routePath", "route_path", "path")) ??
              DEFAULT_MCP_ROUTE,
          ),
          status: integerField(input, "status", "statusCode"),
          responseBody: body,
          error: apiErrorMessage(input),
        },
      ];
    }
  }

  return [];
}

function normalizeRequestContext(
  entry: unknown,
  index: number,
  _generatedAt: string,
): RequestContext {
  if (!isRecord(entry)) {
    return {
      id: `ingest_connector_mcp_request_${index + 1}`,
      index,
      method: "GET",
      routePath: DEFAULT_MCP_ROUTE,
      operation: "list",
      malformed: true,
      error: "MCP resource preview request must be an object.",
    };
  }

  const route = recordField(entry, "route");
  const request = recordField(entry, "request");
  const actual = recordField(entry, "actual");
  const response = recordField(entry, "response");
  const expected = recordField(entry, "expect", "expected");
  const responseBody = pickResponseBody(entry, actual, response, expected);
  const routePath =
    safeRoutePath(
      stringField(route, "path") ??
        stringField(entry, "routePath", "route_path", "path") ??
        pathFromUrl(stringField(route, "url") ?? stringField(entry, "url")),
    ) ?? routePathFromBody(responseBody) ?? DEFAULT_MCP_ROUTE;
  const method =
    normalizeMethod(
      stringField(route, "method") ??
        stringField(entry, "method") ??
        methodFromOperation(operationFromRoute(routePath)),
    ) ?? "GET";

  return {
    id:
      stringField(entry, "id", "requestId", "request_id") ??
      `ingest_connector_mcp_request_${index + 1}`,
    index,
    title: stringField(entry, "title", "label"),
    method,
    routePath,
    operation: operationFromRoute(routePath),
    status:
      integerField(actual, "status", "statusCode") ??
      integerField(response, "status", "statusCode") ??
      integerField(entry, "status", "statusCode") ??
      integerField(expected, "status", "statusCode"),
    requestBody: recordField(request, "body") ?? recordField(entry, "requestBody", "request_body"),
    responseBody,
    error: replayMismatchMessage(entry) ?? apiErrorMessage(actual ?? response ?? entry),
  };
}

function collectResourceCandidates(
  value: unknown,
  context: {
    path: string;
    request?: RequestContext;
    inheritedConnectorId?: string;
    inheritedSafety?: Partial<IngestConnectorMcpSafetyFlags>;
    previewStatus?: IngestConnectorMcpPreviewStatus;
  },
): ResourceCandidate[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectResourceCandidates(item, {
        ...context,
        path: `${context.path}.${index}`,
      }),
    );
  }

  if (!isRecord(value)) {
    return [];
  }

  const connectorId = stringField(
    value,
    "connectorId",
    "connector_id",
    "connector",
    "serverId",
    "server_id",
    "provider",
  ) ?? context.inheritedConnectorId;
  const inheritedSafety = mergeSafety(context.inheritedSafety, safetyFromRecord(value));
  const previewStatus = previewStatusFromRecord(value) ?? context.previewStatus;
  const hasExplicitResource = isRecord(value.resource);
  const isDirectResource = looksLikeResourceRecord(value);
  const candidates: ResourceCandidate[] = [];

  for (const key of ["resources", "items"]) {
    if (Array.isArray(value[key])) {
      candidates.push(
        ...value[key].flatMap((item, index) =>
          collectResourceCandidates(item, {
            path: `${context.path}.${key}.${index}`,
            request: context.request,
            inheritedConnectorId: connectorId,
            inheritedSafety,
            previewStatus,
          }),
        ),
      );
    }
  }

  for (const key of ["resource"]) {
    if (isRecord(value[key])) {
      candidates.push({
        value: value[key],
        content: value.content ?? value.contents ?? value.preview,
        path: `${context.path}.${key}`,
        request: context.request,
        inheritedConnectorId: connectorId,
        inheritedSafety,
        previewStatus,
      });
    }
  }

  for (const key of ["content", "contents"]) {
    if (hasExplicitResource || isDirectResource) {
      continue;
    }
    const nested = value[key];
    if (Array.isArray(nested)) {
      candidates.push(
        ...nested.map((item, index) => ({
          value: item,
          content: item,
          path: `${context.path}.${key}.${index}`,
          request: context.request,
          inheritedConnectorId: connectorId,
          inheritedSafety,
          previewStatus: previewStatus ?? "loaded" as IngestConnectorMcpPreviewStatus,
        })),
      );
    } else if (isRecord(nested) && looksLikeResourceRecord(nested)) {
      candidates.push({
        value: nested,
        content: nested,
        path: `${context.path}.${key}`,
        request: context.request,
        inheritedConnectorId: connectorId,
        inheritedSafety,
        previewStatus: previewStatus ?? "loaded",
      });
    }
  }

  for (const key of ["preview", "result", "data", "body", "payload", "value"]) {
    const nested = value[key];
    if (nested !== undefined && nested !== value) {
      candidates.push(
        ...collectResourceCandidates(nested, {
          path: `${context.path}.${key}`,
          request: context.request,
          inheritedConnectorId: connectorId,
          inheritedSafety,
          previewStatus,
        }),
      );
    }
  }

  if (isDirectResource) {
    candidates.push({
      value,
      content: value.content ?? value.contents ?? value.preview,
      path: context.path,
      request: context.request,
      inheritedConnectorId: connectorId,
      inheritedSafety,
      previewStatus,
    });
  }

  return dedupeCandidates(candidates);
}

function normalizeResource(
  candidate: ResourceCandidate,
  index: number,
): NormalizedResource {
  const record = isRecord(candidate.value) ? candidate.value : {};
  const content = candidate.content;
  const contentRecord = isRecord(content) ? content : undefined;
  const rawUri =
    stringField(record, "uri", "resourceUri", "resource_uri", "url") ??
    stringField(contentRecord, "uri", "resourceUri", "resource_uri", "url");
  const rawId =
    stringField(record, "id", "resourceId", "resource_id", "name") ??
    rawUri ??
    `resource_${index + 1}`;
  const redactedUri = redactSensitiveText(rawUri ?? rawId, `resource://${index + 1}`);
  const redactedId = redactSensitiveText(rawId, `resource_${index + 1}`);
  const connectorId = normalizeConnectorId(
    stringField(
      record,
      "connectorId",
      "connector_id",
      "connector",
      "serverId",
      "server_id",
      "provider",
    ) ??
      candidate.inheritedConnectorId ??
      connectorIdFromUri(rawUri) ??
      "unknown_connector",
    index,
  );
  const title = safeText(
    stringField(record, "title", "name", "label") ??
      stringField(contentRecord, "title", "name", "label") ??
      titleFromUri(rawUri) ??
      redactedId.text,
    `Resource ${index + 1}`,
  );
  const description = optionalSafeText(stringField(record, "description", "summary"));
  const mimeType =
    normalizeMimeType(
      stringField(record, "mimeType", "mime_type", "contentType", "content_type") ??
        stringField(contentRecord, "mimeType", "mime_type", "contentType", "content_type"),
    ) ?? "application/octet-stream";
  const flags = finalizeSafetyFlags(
    mergeSafety(candidate.inheritedSafety, safetyFromRecord(record), safetyFromUri(rawUri)),
  );
  const previewStatus = resolvePreviewStatus(candidate, content);
  const requestStatus = candidate.request ? resolveRequestStatus(candidate.request) : "success";
  const safetyStatus = safetyStatusFromFlags(flags, rawUri, redactedUri.redactionCount);
  const updatedAt = normalizeOptionalTimestamp(
    timestampField(record, "updatedAt", "updated_at", "modifiedAt", "modified_at"),
  );
  const sizeBytes = integerField(record, "sizeBytes", "size_bytes", "bytes");
  const previewBytes = estimatePreviewBytes(content);
  const resourceRedactions =
    redactedId.redactionCount +
    redactedUri.redactionCount +
    redactionCountFromValue(record) +
    redactionCountFromValue(content);

  return {
    resourceId: sanitizeIdentifier(redactedId.text, `resource_${index + 1}`),
    connectorId,
    title,
    description,
    uriLabel: redactedUri.text,
    mimeType,
    mimeTypeLabel: mimeTypeLabel(mimeType),
    previewStatus,
    requestStatus,
    safetyStatus,
    safetyFlags: flags,
    redacted: resourceRedactions > 0,
    redactionCount: resourceRedactions,
    updatedAt,
    sizeBytes,
    previewBytes,
    sourceIndex: index,
  };
}

function buildResourceCard(
  resource: NormalizedResource,
): IngestConnectorMcpResourceCard {
  const previewStatusLabel = previewStatusLabelFor(resource.previewStatus);
  const requestStatusLabel = requestStatusLabelFor(resource.requestStatus);
  const safetyStatusLabel = safetyStatusLabelFor(resource.safetyStatus);
  const detailLabels = [
    `Connector: ${resource.connectorId}`,
    resource.uriLabel,
    resource.mimeTypeLabel,
    previewStatusLabel,
    requestStatusLabel,
    ...resource.safetyFlags.indicatorLabels,
    resource.description,
    resource.redacted ? formatCount(resource.redactionCount, "redaction") : undefined,
  ].filter(isDefined);

  return {
    id: `ingest_connector_mcp_card.${resource.resourceId}`,
    resourceId: resource.resourceId,
    connectorId: resource.connectorId,
    title: resource.title,
    subtitle: resource.uriLabel,
    uriLabel: resource.uriLabel,
    mimeType: resource.mimeType,
    mimeTypeLabel: resource.mimeTypeLabel,
    previewStatus: resource.previewStatus,
    previewStatusLabel,
    requestStatus: resource.requestStatus,
    requestStatusLabel,
    safetyStatus: resource.safetyStatus,
    safetyStatusLabel,
    safetyFlags: clonePlain(resource.safetyFlags),
    redacted: resource.redacted,
    redactionCount: resource.redactionCount,
    valueLabel: previewValueLabel(resource),
    detailLabels,
    ariaLabel: [
      resource.title,
      `connector ${resource.connectorId}`,
      previewStatusLabel,
      safetyStatusLabel,
    ].join(", "),
  };
}

function buildResourceRow(
  resource: NormalizedResource,
): IngestConnectorMcpResourceRow {
  const previewStatusLabel = previewStatusLabelFor(resource.previewStatus);
  const requestStatusLabel = requestStatusLabelFor(resource.requestStatus);
  const safetyStatusLabel = safetyStatusLabelFor(resource.safetyStatus);
  return {
    id: `ingest_connector_mcp_row.${resource.resourceId}`,
    resourceId: resource.resourceId,
    connectorId: resource.connectorId,
    title: resource.title,
    uriLabel: resource.uriLabel,
    mimeType: resource.mimeType,
    mimeTypeLabel: resource.mimeTypeLabel,
    previewStatus: resource.previewStatus,
    previewStatusLabel,
    requestStatus: resource.requestStatus,
    requestStatusLabel,
    safetyStatus: resource.safetyStatus,
    safetyStatusLabel,
    safetyFlags: clonePlain(resource.safetyFlags),
    redacted: resource.redacted,
    redactionCount: resource.redactionCount,
    updatedAt: resource.updatedAt,
    sizeLabel: resource.sizeBytes === undefined ? undefined : formatBytes(resource.sizeBytes),
    ariaLabel: [
      resource.title,
      resource.connectorId,
      resource.mimeTypeLabel,
      previewStatusLabel,
      safetyStatusLabel,
    ].join(", "),
  };
}

function buildRequestCard(record: RequestContext): IngestConnectorMcpRequestCard {
  const status = resolveRequestStatus(record);
  const title = safeText(record.title ?? defaultRequestTitle(record), defaultRequestTitle(record));
  const route = redactSensitiveText(record.routePath, DEFAULT_MCP_ROUTE);
  const resourceUri = optionalSafeText(
    stringField(
      isRecord(record.requestBody) ? record.requestBody : undefined,
      "resourceUri",
      "resource_uri",
      "uri",
    ),
  );
  const redactionCount =
    route.redactionCount +
    redactionCountFromValue(record.requestBody) +
    redactionCountFromValue(record.responseBody) +
    redactionCountFromValue(record.error);
  const statusCodeLabel =
    record.status === undefined ? requestStatusLabelFor(status) : `HTTP ${record.status}`;
  const detailLabels = [
    `${record.method} ${route.text}`,
    operationLabel(record.operation),
    statusCodeLabel,
    resourceUri === undefined ? undefined : `Resource: ${resourceUri}`,
    redactionCount > 0 ? formatCount(redactionCount, "redaction") : undefined,
  ].filter(isDefined);

  return {
    id: `ingest_connector_mcp_request.${sanitizeIdentifier(record.id, `request_${record.index + 1}`)}`,
    requestId: safeText(record.id, `request_${record.index + 1}`),
    title,
    method: record.method,
    routePath: route.text,
    operation: record.operation,
    status,
    statusLabel: requestStatusLabelFor(status),
    statusCode: record.status,
    resourceUri,
    redacted: redactionCount > 0,
    redactionCount,
    valueLabel: statusCodeLabel,
    detailLabels,
    ariaLabel: [title, record.method, route.text, statusCodeLabel].join(", "),
  };
}

function buildSafetySummary(
  rows: readonly IngestConnectorMcpResourceRow[],
): IngestConnectorMcpSafetySummary {
  const localOnlyCount = rows.filter((row) => row.safetyFlags.localOnly === true).length;
  const noNetworkCount = rows.filter((row) => row.safetyFlags.noNetwork === true).length;
  const durableWriteCount = rows.filter((row) => row.safetyFlags.durableWrites === true)
    .length;
  const unknownCount = rows.filter((row) => row.safetyStatus === "unknown").length;
  const localOnly = resolveAllFlag(rows, "localOnly", true);
  const noNetwork = resolveAllFlag(rows, "noNetwork", true);
  const durableWrites = rows.length === 0
    ? undefined
    : rows.some((row) => row.safetyFlags.durableWrites === true);
  const status = resolveSafetySummaryStatus(rows, localOnly, noNetwork, durableWrites);
  const indicatorLabels = [
    flagLabel("Local only", localOnly),
    flagLabel("No network", noNetwork),
    durableWrites === undefined
      ? "Durable writes not declared"
      : `Durable writes: ${durableWrites ? "yes" : "no"}`,
  ];

  return {
    id: "ingest_connector_mcp_safety_summary",
    status,
    statusLabel: safetyStatusLabelFor(status),
    localOnly,
    noNetwork,
    durableWrites,
    localOnlyCount,
    noNetworkCount,
    durableWriteCount,
    unknownCount,
    indicatorLabels,
    detailLabels: [
      ...indicatorLabels,
      formatCount(localOnlyCount, "local-only resource"),
      formatCount(noNetworkCount, "no-network resource"),
      formatCount(durableWriteCount, "durable-write resource"),
      formatCount(unknownCount, "resource with unknown safety", "resources with unknown safety"),
    ],
    ariaLabel: ["MCP safety summary", safetyStatusLabelFor(status), ...indicatorLabels].join(
      ", ",
    ),
  };
}

function buildSections(
  rows: readonly IngestConnectorMcpResourceRow[],
  cards: readonly IngestConnectorMcpResourceCard[],
  requestCards: readonly IngestConnectorMcpRequestCard[],
  errorStates: readonly IngestConnectorMcpErrorState[],
  safety: IngestConnectorMcpSafetySummary,
  stateStatus: IngestConnectorMcpStateStatus,
): IngestConnectorMcpSection[] {
  const rowIds = rows.map((row) => row.id);
  const cardIds = cards.map((card) => card.id);
  const previewCount = rows.filter((row) => row.previewStatus === "loaded").length;
  const connectorCount = uniqueStrings(rows.map((row) => row.connectorId)).length;
  const requestStatus = requestCards.some((card) => card.status === "error")
    ? "error"
    : requestCards.length === 0
      ? "empty"
      : "ready";
  const errorStatus = errorStates.length > 0 ? "error" : "ready";

  return [
    {
      id: "ingest_connector_mcp_section.resources",
      kind: "resources",
      title: "Resources",
      status: rows.length === 0 ? "empty" : stateStatus === "error" ? "attention" : stateStatus,
      statusLabel: getIngestConnectorMcpStatusLabel(
        rows.length === 0 ? "empty" : stateStatus === "error" ? "attention" : stateStatus,
      ),
      valueLabel: formatCount(rows.length, "resource"),
      detailLabels: [
        formatCount(connectorCount, "connector"),
        formatCount(previewCount, "loaded preview"),
      ],
      rowIds,
      cardIds,
      ariaLabel: `Resources, ${formatCount(rows.length, "resource")}`,
    },
    {
      id: "ingest_connector_mcp_section.safety",
      kind: "safety",
      title: "Safety",
      status: sectionStatusFromSafety(safety.status),
      statusLabel: safety.statusLabel,
      valueLabel: safety.statusLabel,
      detailLabels: safety.detailLabels,
      rowIds,
      cardIds: [],
      ariaLabel: safety.ariaLabel,
    },
    {
      id: "ingest_connector_mcp_section.requests",
      kind: "requests",
      title: "Requests",
      status: requestStatus,
      statusLabel: getIngestConnectorMcpStatusLabel(requestStatus),
      valueLabel: formatCount(requestCards.length, "request"),
      detailLabels: [
        formatCount(
          requestCards.filter((card) => card.status === "success").length,
          "successful request",
        ),
        formatCount(
          requestCards.filter((card) => card.status === "error").length,
          "failed request",
        ),
      ],
      rowIds: requestCards.map((card) => card.id),
      cardIds: requestCards.map((card) => card.id),
      ariaLabel: `Requests, ${formatCount(requestCards.length, "request")}`,
    },
    {
      id: "ingest_connector_mcp_section.errors",
      kind: "errors",
      title: "Errors",
      status: errorStatus,
      statusLabel: getIngestConnectorMcpStatusLabel(errorStatus),
      valueLabel: formatCount(errorStates.length, "error"),
      detailLabels: errorStates.map((error) => error.errorState.description),
      rowIds: errorStates.map((error) => error.id),
      cardIds: [],
      ariaLabel: `Errors, ${formatCount(errorStates.length, "error")}`,
    },
  ];
}

function collectEnvelopeErrors(
  value: unknown,
  context: IngestConnectorMcpErrorState["context"],
): IngestConnectorMcpErrorState[] {
  if (!isRecord(value)) {
    return [];
  }

  const errors: IngestConnectorMcpErrorState[] = [];
  if (value.ok === false || value.success === false) {
    errors.push(buildErrorState(context, apiErrorMessage(value) ?? "MCP resource preview failed."));
  }
  const error = recordField(value, "error");
  if (error !== undefined) {
    errors.push(buildErrorState(context, error));
  } else if (typeof value.error === "string") {
    errors.push(buildErrorState(context, value.error));
  }
  const status = integerField(value, "status", "statusCode");
  if (status !== undefined && status >= 400) {
    errors.push(
      buildErrorState(context, apiErrorMessage(value) ?? `MCP request failed with status ${status}.`, {
        status,
      }),
    );
  }

  return errors;
}

function collectRequestErrors(record: RequestContext): IngestConnectorMcpErrorState[] {
  const errors = collectEnvelopeErrors(record.responseBody, "request");
  if (record.malformed || record.error !== undefined) {
    errors.push(
      buildErrorState("request", record.error ?? "MCP resource preview request failed.", {
        requestId: record.id,
        status: record.status,
      }),
    );
  } else if (record.status !== undefined && record.status >= 400) {
    errors.push(
      buildErrorState("request", `MCP resource preview request failed with status ${record.status}.`, {
        requestId: record.id,
        status: record.status,
      }),
    );
  }
  return errors;
}

function buildErrorState(
  context: IngestConnectorMcpErrorState["context"],
  error: unknown,
  metadata: {
    requestId?: string;
    resourceId?: string;
    status?: number;
  } = {},
): IngestConnectorMcpErrorState {
  const redacted = redactSensitiveText(errorMessage(error), "MCP resource preview could not load.");
  const id = `ingest_connector_mcp_${context}_error.${sanitizeIdentifier(
    metadata.requestId ?? metadata.resourceId ?? redacted.text,
    "error",
  )}`;
  const label = errorLabel(context);

  return {
    id,
    context,
    requestId: metadata.requestId,
    resourceId: metadata.resourceId,
    status: metadata.status,
    redacted: redacted.redactionCount > 0,
    redactionCount: redacted.redactionCount,
    errorState: {
      id,
      label,
      description: redacted.text,
      ariaLabel: label,
      retryLabel: retryLabel(context),
    },
  };
}

function pickResponseBody(
  record: AnyRecord,
  actual: AnyRecord | undefined,
  response: AnyRecord | undefined,
  expected: AnyRecord | undefined,
): unknown {
  if (actual !== undefined && Object.hasOwn(actual, "body")) {
    return actual.body;
  }
  if (response !== undefined && Object.hasOwn(response, "body")) {
    return response.body;
  }
  if (Object.hasOwn(record, "body")) {
    return record.body;
  }
  if (expected !== undefined && Object.hasOwn(expected, "body")) {
    return expected.body;
  }
  if (expected !== undefined && Object.hasOwn(expected, "error")) {
    return { error: expected.error };
  }
  return undefined;
}

function looksLikeResourceEnvelope(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return (
    Object.hasOwn(value, "resources") ||
    Object.hasOwn(value, "resource") ||
    Object.hasOwn(value, "contents") ||
    Object.hasOwn(value, "content") ||
    looksLikeResourceRecord(value)
  );
}

function looksLikeResourceRecord(value: unknown): value is AnyRecord {
  if (!isRecord(value)) {
    return false;
  }
  return (
    stringField(value, "uri", "resourceUri", "resource_uri", "url") !== undefined ||
    stringField(value, "mimeType", "mime_type", "contentType", "content_type") !== undefined ||
    stringField(value, "id", "resourceId", "resource_id") !== undefined ||
    Object.hasOwn(value, "text") ||
    Object.hasOwn(value, "json") ||
    Object.hasOwn(value, "blob")
  );
}

function routePathFromBody(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (Object.hasOwn(value, "resource") || Object.hasOwn(value, "content") || Object.hasOwn(value, "contents")) {
    return DEFAULT_MCP_READ_ROUTE;
  }
  if (Object.hasOwn(value, "resources")) {
    return DEFAULT_MCP_ROUTE;
  }
  return undefined;
}

function operationFromRoute(routePath: string): string {
  const normalized = routePath.toLocaleLowerCase();
  if (normalized.includes("/resources/read")) {
    return "read";
  }
  if (normalized.includes("/resources/preview") || normalized.includes("preview")) {
    return "preview";
  }
  if (normalized.includes("/resources")) {
    return "list";
  }
  return "resource";
}

function operationLabel(operation: string): string {
  switch (operation) {
    case "list":
      return "List resources";
    case "read":
      return "Read resource";
    case "preview":
      return "Preview resource";
    default:
      return "Resource request";
  }
}

function methodFromOperation(operation: string): string {
  return operation === "read" || operation === "preview" ? "POST" : "GET";
}

function defaultRequestTitle(record: RequestContext): string {
  switch (record.operation) {
    case "list":
      return "List MCP resources";
    case "read":
      return "Read MCP resource";
    case "preview":
      return "Preview MCP resource";
    default:
      return "MCP resource request";
  }
}

function resolveRequestStatus(record: RequestContext): IngestConnectorMcpRequestStatus {
  if (record.malformed || record.error !== undefined) {
    return "error";
  }
  if (record.status !== undefined && record.status >= 400) {
    return "error";
  }
  if (
    record.responseBody !== undefined ||
    (record.status !== undefined && record.status >= 200 && record.status < 400)
  ) {
    return "success";
  }
  return "empty";
}

function resolvePreviewStatus(
  candidate: ResourceCandidate,
  content: unknown,
): IngestConnectorMcpPreviewStatus {
  const explicit = candidate.previewStatus;
  if (explicit !== undefined && explicit !== "empty") {
    return explicit;
  }
  if (candidate.request?.status !== undefined && candidate.request.status >= 400) {
    return "error";
  }
  if (content === undefined || content === null) {
    return explicit ??
      (candidate.request?.operation === "read" || candidate.request?.operation === "preview"
        ? "partial"
        : "empty");
  }
  if (Array.isArray(content)) {
    return content.length > 0 ? "loaded" : "empty";
  }
  return "loaded";
}

function previewStatusFromRecord(
  record: AnyRecord,
): IngestConnectorMcpPreviewStatus | undefined {
  const value = normalizeToken(stringField(record, "previewStatus", "preview_status", "status", "state"));
  if (value === "loaded" || value === "success" || value === "ready" || value === "ok") {
    return "loaded";
  }
  if (value === "partial" || value === "truncated") {
    return "partial";
  }
  if (value === "error" || value === "failed") {
    return "error";
  }
  if (value === "empty" || value === "none") {
    return "empty";
  }
  return undefined;
}

function safetyFromRecord(
  record: AnyRecord,
): Partial<IngestConnectorMcpSafetyFlags> {
  const safety = recordField(record, "safety", "policy", "metadata") ?? {};
  return {
    localOnly:
      booleanField(record, "localOnly", "local_only") ??
      booleanField(safety, "localOnly", "local_only"),
    noNetwork:
      booleanField(record, "noNetwork", "no_network") ??
      inverseBooleanField(record, "networkAccess", "network_access", "allowNetwork", "allow_network") ??
      booleanField(safety, "noNetwork", "no_network") ??
      inverseBooleanField(safety, "networkAccess", "network_access", "allowNetwork", "allow_network"),
    durableWrites:
      booleanField(record, "durableWrites", "durable_writes") ??
      booleanField(safety, "durableWrites", "durable_writes"),
  };
}

function safetyFromUri(uri: string | undefined): Partial<IngestConnectorMcpSafetyFlags> {
  if (uri === undefined) {
    return {};
  }
  const scheme = uriScheme(uri);
  if (scheme === undefined) {
    return {};
  }
  if (LOCAL_URI_SCHEMES.has(scheme)) {
    return {
      localOnly: true,
      noNetwork: true,
    };
  }
  if (scheme === "file") {
    return {
      localOnly: true,
      noNetwork: true,
    };
  }
  if (scheme === "http" || scheme === "https") {
    return {
      localOnly: false,
      noNetwork: false,
    };
  }
  return {};
}

function mergeSafety(
  ...items: Array<Partial<IngestConnectorMcpSafetyFlags> | undefined>
): Partial<IngestConnectorMcpSafetyFlags> {
  const merged: Partial<IngestConnectorMcpSafetyFlags> = {};
  for (const item of items) {
    if (!item) {
      continue;
    }
    if (item.localOnly !== undefined) {
      merged.localOnly = item.localOnly;
    }
    if (item.noNetwork !== undefined) {
      merged.noNetwork = item.noNetwork;
    }
    if (item.durableWrites !== undefined) {
      merged.durableWrites = item.durableWrites;
    }
  }
  return merged;
}

function finalizeSafetyFlags(
  flags: Partial<IngestConnectorMcpSafetyFlags>,
): IngestConnectorMcpSafetyFlags {
  return {
    localOnly: flags.localOnly,
    noNetwork: flags.noNetwork,
    durableWrites: flags.durableWrites,
    localOnlyLabel: flagLabel("Local only", flags.localOnly),
    noNetworkLabel: flagLabel("No network", flags.noNetwork),
    durableWritesLabel:
      flags.durableWrites === undefined
        ? "Durable writes not declared"
        : `Durable writes: ${flags.durableWrites ? "yes" : "no"}`,
    indicatorLabels: [
      flagLabel("Local only", flags.localOnly),
      flagLabel("No network", flags.noNetwork),
      flags.durableWrites === undefined
        ? "Durable writes not declared"
        : `Durable writes: ${flags.durableWrites ? "yes" : "no"}`,
    ],
  };
}

function safetyStatusFromFlags(
  flags: IngestConnectorMcpSafetyFlags,
  rawUri: string | undefined,
  uriRedactionCount: number,
): IngestConnectorMcpSafetyStatus {
  if (
    flags.localOnly === false ||
    flags.noNetwork === false ||
    flags.durableWrites === true ||
    (rawUri !== undefined && isUnsafeExternalReference(rawUri)) ||
    uriRedactionCount > 0
  ) {
    return "unsafe";
  }
  if (
    flags.localOnly === true &&
    flags.noNetwork === true &&
    flags.durableWrites === false
  ) {
    return "safe";
  }
  if (
    flags.localOnly !== undefined ||
    flags.noNetwork !== undefined ||
    flags.durableWrites !== undefined
  ) {
    return "attention";
  }
  return "unknown";
}

function resolveSafetySummaryStatus(
  rows: readonly IngestConnectorMcpResourceRow[],
  localOnly: boolean | undefined,
  noNetwork: boolean | undefined,
  durableWrites: boolean | undefined,
): IngestConnectorMcpSafetyStatus {
  if (rows.length === 0) {
    return "unknown";
  }
  if (
    rows.some((row) => row.safetyStatus === "unsafe") ||
    localOnly === false ||
    noNetwork === false ||
    durableWrites === true
  ) {
    return "unsafe";
  }
  if (rows.every((row) => row.safetyStatus === "safe")) {
    return "safe";
  }
  if (rows.some((row) => row.safetyStatus === "attention")) {
    return "attention";
  }
  return "unknown";
}

function resolveAllFlag(
  rows: readonly IngestConnectorMcpResourceRow[],
  key: "localOnly" | "noNetwork",
  expected: boolean,
): boolean | undefined {
  if (rows.length === 0) {
    return undefined;
  }
  if (rows.some((row) => row.safetyFlags[key] === !expected)) {
    return false;
  }
  if (rows.every((row) => row.safetyFlags[key] === expected)) {
    return true;
  }
  return undefined;
}

function resolveStateStatus(
  rows: readonly IngestConnectorMcpResourceRow[],
  requestCards: readonly IngestConnectorMcpRequestCard[],
  errors: readonly IngestConnectorMcpErrorState[],
): IngestConnectorMcpStateStatus {
  if (errors.length > 0 || requestCards.some((card) => card.status === "error")) {
    return "error";
  }
  if (rows.length === 0) {
    return "empty";
  }
  if (
    rows.some((row) =>
      row.previewStatus === "error" ||
      row.previewStatus === "partial" ||
      row.safetyStatus === "unsafe" ||
      row.safetyStatus === "attention" ||
      row.safetyStatus === "unknown"
    )
  ) {
    return "attention";
  }
  return "ready";
}

function sectionStatusFromSafety(
  status: IngestConnectorMcpSafetyStatus,
): IngestConnectorMcpStateStatus {
  switch (status) {
    case "safe":
      return "ready";
    case "unsafe":
      return "error";
    case "attention":
      return "attention";
    case "unknown":
      return "empty";
  }
}

function requestStatusLabelFor(status: IngestConnectorMcpRequestStatus): string {
  switch (status) {
    case "empty":
      return "No response";
    case "success":
      return "Loaded";
    case "error":
      return "Error";
  }
}

function previewStatusLabelFor(status: IngestConnectorMcpPreviewStatus): string {
  switch (status) {
    case "empty":
      return "No preview";
    case "loaded":
      return "Preview loaded";
    case "partial":
      return "Partial preview";
    case "error":
      return "Preview error";
  }
}

function safetyStatusLabelFor(status: IngestConnectorMcpSafetyStatus): string {
  switch (status) {
    case "safe":
      return "Local safe";
    case "attention":
      return "Safety needs review";
    case "unsafe":
      return "Unsafe input";
    case "unknown":
      return "Safety not declared";
  }
}

function flagLabel(label: string, value: boolean | undefined): string {
  if (value === undefined) {
    return `${label} not declared`;
  }
  return `${label}: ${value ? "yes" : "no"}`;
}

function errorLabel(context: IngestConnectorMcpErrorState["context"]): string {
  switch (context) {
    case "input":
      return "MCP resource preview input could not load";
    case "request":
      return "MCP resource request could not load";
    case "preview":
      return "MCP resource preview could not load";
    case "resource":
      return "MCP resource could not load";
  }
}

function retryLabel(context: IngestConnectorMcpErrorState["context"]): string {
  switch (context) {
    case "input":
      return "Reload MCP resource preview";
    case "request":
      return "Retry MCP resource request";
    case "preview":
      return "Retry MCP resource preview";
    case "resource":
      return "Retry MCP resource";
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
    const body = recordField(error, "body") ?? error;
    const nested = recordField(body, "error");
    return (
      stringField(nested, "message") ??
      stringField(nested, "code") ??
      stringField(body, "message", "error", "description", "detail") ??
      JSON.stringify(redactSensitiveValue(body))
    );
  }
  return "MCP resource preview could not load.";
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
    return `MCP request failed with status ${status}.`;
  }
  if (body.ok === false || body.success === false) {
    return "MCP resource preview failed.";
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
    .map(([key]) => key)
    .sort();
  return failed.length === 0 ? undefined : `Replay mismatch: ${failed.join(", ")}.`;
}

function previewValueLabel(resource: NormalizedResource): string {
  if (resource.previewStatus === "loaded") {
    return resource.previewBytes > 0
      ? `${formatBytes(resource.previewBytes)} preview`
      : "Preview loaded";
  }
  return previewStatusLabelFor(resource.previewStatus);
}

function estimatePreviewBytes(value: unknown): number {
  if (value === undefined || value === null) {
    return 0;
  }
  if (typeof value === "string") {
    return value.length;
  }
  if (isRecord(value)) {
    const text = stringField(value, "text", "blob");
    if (text !== undefined) {
      return text.length;
    }
    if (Object.hasOwn(value, "json")) {
      return JSON.stringify(value.json).length;
    }
  }
  return JSON.stringify(value).length;
}

function connectorIdFromUri(uri: string | undefined): string | undefined {
  if (uri === undefined) {
    return undefined;
  }
  const match = uri.match(/^([a-z][a-z0-9+.-]*):\/\/([^/\s]+)/i);
  if (!match) {
    return undefined;
  }
  const scheme = match[1].toLocaleLowerCase();
  const host = match[2].trim();
  if (LOCAL_URI_SCHEMES.has(scheme)) {
    return host === "" ? scheme : `${scheme}.${host}`;
  }
  return scheme;
}

function titleFromUri(uri: string | undefined): string | undefined {
  if (uri === undefined) {
    return undefined;
  }
  const cleaned = uri.replace(/[?#].*$/, "").replace(/\/+$/, "");
  const segment = cleaned.split(/[/:\\]/).filter(Boolean).at(-1);
  if (segment === undefined || segment.trim() === "") {
    return undefined;
  }
  return titleCaseToken(segment);
}

function normalizeConnectorId(value: string, index: number): string {
  const redacted = redactSensitiveText(value, `connector_${index + 1}`);
  if (redacted.redactionCount > 0) {
    return `connector_${index + 1}`;
  }
  return sanitizeIdentifier(redacted.text, `connector_${index + 1}`);
}

function normalizeMimeType(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim().toLocaleLowerCase();
  return /^[^\s/]+\/[^\s]+$/.test(normalized) ? normalized : undefined;
}

function mimeTypeLabel(mimeType: string): string {
  switch (mimeType) {
    case "application/json":
      return "JSON";
    case "application/jsonl":
    case "application/x-ndjson":
      return "JSONL";
    case "text/csv":
      return "CSV";
    case "text/html":
      return "HTML";
    case "text/markdown":
      return "Markdown";
    case "text/plain":
      return "Plain text";
    default:
      return mimeType;
  }
}

function safeText(value: string, fallback: string): string {
  return redactSensitiveText(value, fallback).text;
}

function optionalSafeText(value: string | undefined): string | undefined {
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
  return redactSensitiveText(value, DEFAULT_MCP_ROUTE).text;
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
  replace(/\bprivate[-_\s]?plan(?:[-_\s]?pack)?\b/gi, "[redacted-private]");

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

function isUnsafeExternalReference(value: string): boolean {
  const scheme = uriScheme(value);
  return scheme !== undefined && !LOCAL_URI_SCHEMES.has(scheme) && scheme !== "file";
}

function uriScheme(value: string): string | undefined {
  return value.match(/^([a-z][a-z0-9+.-]*):\/\//i)?.[1]?.toLocaleLowerCase();
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

function normalizeMethod(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const method = value.trim().toUpperCase();
  return /^[A-Z]+$/.test(method) ? method : undefined;
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

function normalizeOptionalTimestamp(timestamp: string | undefined): string | undefined {
  if (timestamp === undefined) {
    return undefined;
  }
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
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
    if (Number.isInteger(value)) {
      return value as number;
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

function inverseBooleanField(
  record: AnyRecord | undefined,
  ...keys: readonly string[]
): boolean | undefined {
  const value = booleanField(record, ...keys);
  return value === undefined ? undefined : !value;
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

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
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

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${Math.round(value / 102.4) / 10} KB`;
  }
  return `${Math.round(value / 104857.6) / 10} MB`;
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

function titleCaseToken(value: string): string {
  const words = value
    .replace(/[._:-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  if (words.length === 0) {
    return "Resource";
  }
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

function compareResources(
  left: NormalizedResource,
  right: NormalizedResource,
): number {
  return (
    safetyRank(left.safetyStatus) - safetyRank(right.safetyStatus) ||
    previewRank(left.previewStatus) - previewRank(right.previewStatus) ||
    left.connectorId.localeCompare(right.connectorId) ||
    left.title.localeCompare(right.title) ||
    left.resourceId.localeCompare(right.resourceId) ||
    left.sourceIndex - right.sourceIndex
  );
}

function compareRows(
  left: IngestConnectorMcpResourceRow,
  right: IngestConnectorMcpResourceRow,
): number {
  return (
    safetyRank(left.safetyStatus) - safetyRank(right.safetyStatus) ||
    previewRank(left.previewStatus) - previewRank(right.previewStatus) ||
    left.connectorId.localeCompare(right.connectorId) ||
    left.title.localeCompare(right.title) ||
    left.resourceId.localeCompare(right.resourceId)
  );
}

function compareCards(
  left: IngestConnectorMcpResourceCard,
  right: IngestConnectorMcpResourceCard,
): number {
  return (
    safetyRank(left.safetyStatus) - safetyRank(right.safetyStatus) ||
    previewRank(left.previewStatus) - previewRank(right.previewStatus) ||
    left.connectorId.localeCompare(right.connectorId) ||
    left.title.localeCompare(right.title) ||
    left.resourceId.localeCompare(right.resourceId)
  );
}

function compareRequestCards(
  left: IngestConnectorMcpRequestCard,
  right: IngestConnectorMcpRequestCard,
): number {
  return (
    requestRank(left.status) - requestRank(right.status) ||
    left.routePath.localeCompare(right.routePath) ||
    left.requestId.localeCompare(right.requestId)
  );
}

function compareErrors(
  left: IngestConnectorMcpErrorState,
  right: IngestConnectorMcpErrorState,
): number {
  return (
    left.context.localeCompare(right.context) ||
    (left.requestId ?? "").localeCompare(right.requestId ?? "") ||
    (left.resourceId ?? "").localeCompare(right.resourceId ?? "") ||
    (left.status ?? 0) - (right.status ?? 0) ||
    left.errorState.description.localeCompare(right.errorState.description)
  );
}

function safetyRank(status: IngestConnectorMcpSafetyStatus): number {
  switch (status) {
    case "unsafe":
      return 0;
    case "attention":
      return 1;
    case "unknown":
      return 2;
    case "safe":
      return 3;
  }
}

function previewRank(status: IngestConnectorMcpPreviewStatus): number {
  switch (status) {
    case "error":
      return 0;
    case "partial":
      return 1;
    case "empty":
      return 2;
    case "loaded":
      return 3;
  }
}

function requestRank(status: IngestConnectorMcpRequestStatus): number {
  switch (status) {
    case "error":
      return 0;
    case "empty":
      return 1;
    case "success":
      return 2;
  }
}

function dedupeCandidates(candidates: readonly ResourceCandidate[]): ResourceCandidate[] {
  const seen = new Set<string>();
  const deduped: ResourceCandidate[] = [];
  for (const candidate of candidates) {
    const record = isRecord(candidate.value) ? candidate.value : undefined;
    const key = [
      candidate.path,
      stringField(record, "uri", "resourceUri", "resource_uri", "id", "resourceId", "name"),
      candidate.request?.id,
    ].join(":");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(candidate);
  }
  return deduped;
}

function dedupeResources(resources: readonly NormalizedResource[]): NormalizedResource[] {
  const byKey = new Map<string, NormalizedResource>();
  for (const resource of resources) {
    const key = `${resource.connectorId}:${resource.uriLabel}`;
    const existing = byKey.get(key);
    if (
      existing === undefined ||
      previewQualityRank(resource.previewStatus) >
        previewQualityRank(existing.previewStatus) ||
      (previewQualityRank(resource.previewStatus) ===
        previewQualityRank(existing.previewStatus) &&
        resource.sourceIndex < existing.sourceIndex)
    ) {
      byKey.set(key, resource);
    }
  }
  return [...byKey.values()];
}

function dedupeErrors(
  errors: readonly IngestConnectorMcpErrorState[],
): IngestConnectorMcpErrorState[] {
  const seen = new Set<string>();
  const deduped: IngestConnectorMcpErrorState[] = [];
  for (const error of errors) {
    const key = [
      error.context,
      error.requestId,
      error.resourceId,
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

function previewQualityRank(status: IngestConnectorMcpPreviewStatus): number {
  switch (status) {
    case "loaded":
      return 3;
    case "partial":
      return 2;
    case "empty":
      return 1;
    case "error":
      return 0;
  }
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
