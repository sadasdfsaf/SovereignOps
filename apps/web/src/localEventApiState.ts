import {
  buildLocalEventCatalogState,
  buildLocalEventSummaries,
  filterCanonicalLocalEvents,
  getCatalogStatusLabel,
  isLocalEventOperationKind,
  isLocalEventRedactionSeverity,
  isLocalEventRedactionStatus,
  isLocalEventReplayStatus,
  isLocalEventRiskLevel,
  isLocalEventSchemaKind,
  type CanonicalLocalEvent,
  type LocalEventCatalogFilter,
  type LocalEventCatalogState,
  type LocalEventCatalogStatus,
  type LocalEventOperationKind,
  type LocalEventRedactionMarker,
  type LocalEventRedactionSeverity,
  type LocalEventRedactionStatus,
  type LocalEventReplaySnapshot,
  type LocalEventReplayStatus,
  type LocalEventRiskLevel,
  type LocalEventSchemaKind,
  type LocalEventSummary,
} from "./localEventCatalog.ts";
import {
  buildLocalEventReplayState,
  type LocalEventReplayFilter,
  type LocalEventReplayState,
} from "./localEventReplayState.ts";

export type LocalEventApiPhase = "loading" | "success" | "error";

export type LocalEventApiStatus =
  | "loading"
  | "success"
  | "error"
  | LocalEventCatalogStatus;

export type LocalEventApiContext =
  | "requests"
  | "response"
  | "events"
  | "summary"
  | "replay"
  | "export";

export type LocalEventApiExportFormat = "json" | "jsonl" | "manifest";

export interface BuildLocalEventApiStateOptions {
  defaultTimestamp?: string;
  apiBase?: string;
  loading?: boolean;
  error?: unknown;
  filter?: LocalEventCatalogFilter;
  replayFilter?: LocalEventReplayFilter;
  exportFormat?: LocalEventApiExportFormat;
}

export interface LocalEventApiState {
  id: "local_event_api";
  phase: LocalEventApiPhase;
  generatedAt: string;
  status: LocalEventApiStatus;
  statusLabel: string;
  totalCount: number;
  visibleCount: number;
  requestCards: LocalEventApiRequestCard[];
  catalog: LocalEventCatalogState;
  replay: LocalEventReplayState;
  summaryCards: LocalEventApiSummaryCard[];
  exportView: LocalEventApiExportView;
  emptyStates: LocalEventApiEmptyStates;
  errorStates: LocalEventApiErrorState[];
}

export interface LocalEventApiRequestCard {
  id: string;
  requestId: string;
  title: string;
  method: string;
  routePath: string;
  url?: string;
  status: LocalEventApiStatus;
  statusLabel: string;
  statusCode?: number;
  eventCount: number;
  valueLabel: string;
  detailLabels: string[];
  ariaLabel: string;
}

export interface LocalEventApiSummaryCard {
  id: string;
  label: string;
  value: string;
  status: LocalEventApiStatus;
  statusLabel: string;
  detailLabels: string[];
  ariaLabel: string;
}

export interface LocalEventApiExportView {
  id: "local_event_api_export";
  format: LocalEventApiExportFormat;
  status: LocalEventApiStatus;
  statusLabel: string;
  fileName: string;
  mediaType: string;
  eventCount: number;
  redactionMarkerCount: number;
  replayIssueCount: number;
  byteCount: number;
  checksum: string;
  content: string;
  rows: LocalEventApiExportRow[];
  detailLabels: string[];
  emptyState: LocalEventApiEmptyState;
  ariaLabel: string;
}

export interface LocalEventApiExportRow {
  id: string;
  eventId: string;
  streamId: string;
  sequence: number;
  sequenceLabel: string;
  title: string;
  status: LocalEventCatalogStatus;
  statusLabel: string;
  operationKind: LocalEventOperationKind;
  operationLabel: string;
  schemaKind: LocalEventSchemaKind;
  schemaLabel: string;
  redactionMarkerCount: number;
  replayIssueCount: number;
  detailLabels: string[];
  ariaLabel: string;
}

export interface LocalEventApiEmptyStates {
  requests: LocalEventApiEmptyState;
  summary: LocalEventApiEmptyState;
  replay: LocalEventApiEmptyState;
  export: LocalEventApiEmptyState;
  errors: LocalEventApiEmptyState;
}

export interface LocalEventApiEmptyState {
  id: string;
  label: string;
  description: string;
  ariaLabel: string;
  actionLabel?: string;
}

export interface LocalEventApiErrorState {
  id: string;
  context: LocalEventApiContext;
  routeId?: string;
  routePath?: string;
  status?: number;
  errorState: {
    id: string;
    label: string;
    description: string;
    ariaLabel: string;
    retryLabel: string;
  };
}

type AnyRecord = Record<string, unknown>;

interface ApiRecord {
  id: string;
  index: number;
  title?: string;
  method: string;
  routePath: string;
  url?: string;
  status?: number;
  requestBody?: AnyRecord;
  responseBody?: AnyRecord;
  generatedAt: string;
  error?: unknown;
}

interface NormalizedBridge {
  generatedAt: string;
  records: ApiRecord[];
  events: CanonicalLocalEvent[];
  errorStates: LocalEventApiErrorState[];
}

const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const DEFAULT_EVENTS_ROUTE = "/v1/local-events";
const DEFAULT_REPLAY_ROUTE = "/v1/local-events/replay";
const DEFAULT_EXPORT_ROUTE = "/v1/local-events/export";

export function buildLocalEventApiState(
  input: unknown,
  options: BuildLocalEventApiStateOptions = {},
): LocalEventApiState {
  if (options.loading === true) {
    return buildLocalEventApiLoadingState(options);
  }

  const bridge = normalizeBridge(input, options);
  const errorDescriptions = bridge.errorStates.map(
    (error) => error.errorState.description,
  );
  const phase: LocalEventApiPhase =
    bridge.errorStates.length > 0 ? "error" : "success";
  const catalog = buildLocalEventCatalogState(bridge.events, options.filter);
  const replay = buildLocalEventReplayState(bridge.events, {
    filter: options.replayFilter ?? replayFilterFromCatalogFilter(options.filter),
    errors: errorDescriptions,
  });
  const status: LocalEventApiStatus =
    phase === "error" ? "error" : catalog.status;

  return cloneApiState({
    id: "local_event_api",
    phase,
    generatedAt: bridge.generatedAt,
    status,
    statusLabel: localEventApiStatusLabel(status),
    totalCount: catalog.totalCount,
    visibleCount: catalog.visibleCount,
    requestCards: buildRequestCardsFromRecords(bridge.records),
    catalog,
    replay,
    summaryCards: buildSummaryCards({
      status,
      records: bridge.records,
      catalog,
      errorStates: bridge.errorStates,
    }),
    exportView: buildExportViewFromEvents({
      events: bridge.events,
      generatedAt: bridge.generatedAt,
      status,
      filter: options.filter,
      format: options.exportFormat ?? "json",
    }),
    emptyStates: buildLocalEventApiEmptyStates(),
    errorStates: bridge.errorStates.map(cloneApiErrorState),
  });
}

export function buildLocalEventApiLoadingState(
  options: Pick<
    BuildLocalEventApiStateOptions,
    "defaultTimestamp" | "exportFormat"
  > = {},
): LocalEventApiState {
  const generatedAt = normalizeTimestamp(undefined, options.defaultTimestamp);
  const status: LocalEventApiStatus = "loading";
  const catalog = buildLocalEventCatalogState([]);
  const replay = buildLocalEventReplayState([]);
  const requestCards = [
    {
      id: "local_event_api.request.loading",
      requestId: "loading",
      title: "Loading local events",
      method: "GET",
      routePath: DEFAULT_EVENTS_ROUTE,
      status,
      statusLabel: localEventApiStatusLabel(status),
      eventCount: 0,
      valueLabel: "Loading",
      detailLabels: ["Waiting for local event API response."],
      ariaLabel: "Loading local events, Loading",
    },
  ];

  return cloneApiState({
    id: "local_event_api",
    phase: "loading",
    generatedAt,
    status,
    statusLabel: localEventApiStatusLabel(status),
    totalCount: 0,
    visibleCount: 0,
    requestCards,
    catalog,
    replay,
    summaryCards: [
      {
        id: "local_event_api.summary.loading",
        label: "Local events",
        value: "Loading",
        status,
        statusLabel: localEventApiStatusLabel(status),
        detailLabels: ["Waiting for local event API response."],
        ariaLabel: "Local events, Loading",
      },
    ],
    exportView: buildExportViewFromEvents({
      events: [],
      generatedAt,
      status,
      filter: undefined,
      format: options.exportFormat ?? "json",
    }),
    emptyStates: buildLocalEventApiEmptyStates(),
    errorStates: [],
  });
}

export function collectLocalEventApiEvents(
  input: unknown,
  options: BuildLocalEventApiStateOptions = {},
): CanonicalLocalEvent[] {
  return normalizeBridge(input, options).events.map(cloneCanonicalLocalEvent);
}

export function buildLocalEventApiRequestCards(
  input: unknown,
  options: BuildLocalEventApiStateOptions = {},
): LocalEventApiRequestCard[] {
  return buildRequestCardsFromRecords(
    normalizeBridge(input, options).records,
  ).map(cloneRequestCard);
}

export function buildLocalEventApiSummaryCards(
  input: unknown,
  options: BuildLocalEventApiStateOptions = {},
): LocalEventApiSummaryCard[] {
  return buildLocalEventApiState(input, options).summaryCards.map(
    cloneSummaryCard,
  );
}

export function buildLocalEventApiReplayState(
  input: unknown,
  options: BuildLocalEventApiStateOptions = {},
): LocalEventReplayState {
  return cloneReplayState(buildLocalEventApiState(input, options).replay);
}

export function buildLocalEventApiExportView(
  input: unknown,
  options: BuildLocalEventApiStateOptions = {},
): LocalEventApiExportView {
  return cloneExportView(buildLocalEventApiState(input, options).exportView);
}

export function buildLocalEventApiEmptyStates(): LocalEventApiEmptyStates {
  return {
    requests: buildLocalEventApiEmptyState("requests"),
    summary: buildLocalEventApiEmptyState("summary"),
    replay: buildLocalEventApiEmptyState("replay"),
    export: buildLocalEventApiEmptyState("export"),
    errors: buildLocalEventApiEmptyState("events"),
  };
}

export function buildLocalEventApiEmptyState(
  context: LocalEventApiContext,
): LocalEventApiEmptyState {
  switch (context) {
    case "requests":
      return {
        id: "local_event_api_requests_empty",
        label: "No API requests",
        description: "Captured local event requests will appear when a replay is loaded.",
        ariaLabel: "No local event API requests are available",
      };
    case "response":
      return {
        id: "local_event_api_response_empty",
        label: "No API response",
        description: "Load a local event API response to show request status.",
        ariaLabel: "No local event API response is available",
      };
    case "events":
      return {
        id: "local_event_api_events_empty",
        label: "No local events",
        description: "Local events will appear when a response includes event records.",
        ariaLabel: "No local event records are available",
      };
    case "summary":
      return {
        id: "local_event_api_summary_empty",
        label: "No event summary",
        description: "Summary counts will appear after local event data is loaded.",
        ariaLabel: "No local event summary is available",
      };
    case "replay":
      return {
        id: "local_event_api_replay_empty",
        label: "No replay rows",
        description: "Replay rows will appear after local event data is loaded.",
        ariaLabel: "No local event replay rows are available",
      };
    case "export":
      return {
        id: "local_event_api_export_empty",
        label: "No export content",
        description: "Export content will appear after local event data is loaded.",
        ariaLabel: "No local event export content is available",
      };
  }
}

export function buildLocalEventApiErrorStates(
  input: unknown,
  options: BuildLocalEventApiStateOptions = {},
): LocalEventApiErrorState[] {
  return normalizeBridge(input, options).errorStates.map(cloneApiErrorState);
}

export function buildLocalEventApiErrorState(
  context: LocalEventApiContext,
  error: unknown,
  metadata: {
    routeId?: string;
    routePath?: string;
    status?: number;
  } = {},
): LocalEventApiErrorState {
  const description =
    redactLocalEventApiError(error) ?? defaultErrorDescription(context);
  const id = `local_event_api_${context}_error`;

  return {
    id,
    context,
    routeId: metadata.routeId,
    routePath: metadata.routePath,
    status: metadata.status,
    errorState: {
      id,
      label: errorLabel(context),
      description,
      ariaLabel: errorLabel(context),
      retryLabel: retryLabel(context),
    },
  };
}

export function redactLocalEventApiError(error: unknown): string | undefined {
  const message = errorMessage(error);
  if (message !== undefined) {
    return redactErrorText(message);
  }

  if (isRecord(error)) {
    return truncateDescription(
      redactErrorText(JSON.stringify(redactErrorValue(error))),
    );
  }

  return undefined;
}

function normalizeBridge(
  input: unknown,
  options: BuildLocalEventApiStateOptions,
): NormalizedBridge {
  const root = clonePlain(input);
  const rootRecord = isRecord(root) ? root : undefined;
  const generatedAt = normalizeTimestamp(
    timestampField(rootRecord, "generatedAt", "generated_at", "createdAt", "created_at"),
    options.defaultTimestamp,
  );
  const records = normalizeApiRecords(root, generatedAt, options.apiBase);
  const events = collectEvents(records, rootRecord, generatedAt);
  const errorStates = collectErrorStates(records);

  if (options.error !== undefined) {
    errorStates.push(buildLocalEventApiErrorState("response", options.error));
  }

  return {
    generatedAt,
    records,
    events,
    errorStates: dedupeErrorStates(errorStates),
  };
}

function normalizeApiRecords(
  root: unknown,
  fallbackTimestamp: string,
  apiBase: string | undefined,
): ApiRecord[] {
  if (isRecord(root) && Array.isArray(root.requests)) {
    return root.requests.map((entry, index) =>
      normalizeReplayRecord(entry, index, fallbackTimestamp, apiBase),
    );
  }

  if (
    isRecord(root) &&
    (isRecord(root.response) ||
      isRecord(root.request) ||
      isRecord(root.route) ||
      isRecord(root.actual))
  ) {
    return [normalizeReplayRecord(root, 0, fallbackTimestamp, apiBase)];
  }

  if (isRecord(root) && isRecord(root.body)) {
    const routePath =
      stringField(root, "routePath", "route_path", "path") ??
      inferRoutePathFromPayload(root.body);
    return [
      {
        id: stringField(root, "id") ?? "local_event_api_response",
        index: 0,
        title: stringField(root, "title", "label"),
        method: stringField(root, "method")?.toUpperCase() ?? "GET",
        routePath,
        url: absoluteRouteUrl(routePath, apiBase),
        status: integerField(root, "status"),
        responseBody: root.body,
        generatedAt: fallbackTimestamp,
        error: apiErrorMessage(root),
      },
    ];
  }

  if (isRecord(root) && hasEventPayload(root)) {
    const routePath = inferRoutePathFromPayload(root);
    return [
      {
        id: "local_event_api_response",
        index: 0,
        title: "Local event response",
        method: "GET",
        routePath,
        url: absoluteRouteUrl(routePath, apiBase),
        responseBody: root,
        generatedAt: fallbackTimestamp,
        error: apiErrorMessage(root),
      },
    ];
  }

  return [];
}

function normalizeReplayRecord(
  entry: unknown,
  index: number,
  fallbackTimestamp: string,
  apiBase: string | undefined,
): ApiRecord {
  const record = isRecord(entry) ? entry : {};
  const route = recordField(record, "route");
  const request = recordField(record, "request");
  const actual = recordField(record, "actual");
  const response = recordField(record, "response") ?? actual;
  const expected = recordField(record, "expect", "expected");
  const responseBody =
    recordField(response, "body") ??
    recordField(record, "body") ??
    recordField(expected, "body");
  const routePath =
    stringField(route, "path") ??
    stringField(record, "routePath", "route_path", "path") ??
    inferRoutePathFromPayload(responseBody);

  return {
    id:
      stringField(record, "id", "requestId", "request_id") ??
      `local_event_api_request_${index + 1}`,
    index,
    title: stringField(record, "title", "label"),
    method:
      stringField(route, "method")?.toUpperCase() ??
      stringField(record, "method")?.toUpperCase() ??
      "GET",
    routePath,
    url: stringField(route, "url") ?? absoluteRouteUrl(routePath, apiBase),
    status:
      integerField(response, "status") ??
      integerField(record, "status") ??
      integerField(expected, "status"),
    requestBody:
      recordField(request, "body") ??
      recordField(record, "requestBody", "request_body"),
    responseBody,
    generatedAt:
      timestampField(record, "generatedAt", "generated_at", "createdAt", "created_at") ??
      fallbackTimestamp,
    error: replayMismatchMessage(record) ?? apiErrorMessage(response ?? record),
  };
}

function collectEvents(
  records: readonly ApiRecord[],
  root: AnyRecord | undefined,
  fallbackTimestamp: string,
): CanonicalLocalEvent[] {
  const events = new Map<string, CanonicalLocalEvent>();

  if (records.length === 0 && root !== undefined) {
    collectEventPayloadsFromValue(root).forEach((value, index) => {
      const event = normalizeCanonicalEvent(value, index, fallbackTimestamp);
      events.set(event.id, event);
    });
  }

  for (const record of records) {
    collectEventPayloadsFromValue(record.responseBody).forEach((value, index) => {
      const event = normalizeCanonicalEvent(value, index, record.generatedAt);
      events.set(event.id, event);
    });
  }

  return [...events.values()]
    .sort(compareCanonicalEvents)
    .map(cloneCanonicalLocalEvent);
}

function collectEventPayloadsFromValue(value: unknown): AnyRecord[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }
  if (!isRecord(value)) {
    return [];
  }
  if (isEventPayload(value)) {
    return [value];
  }

  const events: AnyRecord[] = [];
  for (const key of [
    "events",
    "localEvents",
    "local_events",
    "items",
    "records",
  ]) {
    events.push(...arrayField(value, key).filter(isRecord));
  }
  for (const key of ["event", "localEvent", "local_event"]) {
    const event = recordField(value, key);
    if (event !== undefined) {
      events.push(event);
    }
  }
  for (const key of ["data", "result", "catalog", "replay", "export"]) {
    events.push(...collectEventPayloadsFromValue(recordField(value, key)));
  }

  return events;
}

function normalizeCanonicalEvent(
  value: AnyRecord,
  index: number,
  fallbackTimestamp: string,
): CanonicalLocalEvent {
  const operationKind = requireOperationKind(value);
  const schemaKind = requireSchemaKind(value);
  const id =
    stringField(value, "id", "eventId", "event_id") ??
    stableId("evt", JSON.stringify(value));
  const streamId =
    stringField(value, "streamId", "stream_id", "stream") ??
    "local_event_stream";
  const sequence =
    positiveIntegerField(value, "sequence", "seq", "version") ?? index + 1;
  const occurredAt =
    timestampField(
      value,
      "occurredAt",
      "occurred_at",
      "timestamp",
      "createdAt",
      "created_at",
    ) ?? fallbackTimestamp;
  const riskLevel = normalizeRiskLevel(
    stringField(value, "riskLevel", "risk_level", "risk"),
  );
  const metadata = recordField(value, "metadata", "meta");
  const replay = normalizeReplaySnapshot(value);
  const event: CanonicalLocalEvent = {
    id,
    streamId,
    sequence,
    operationKind,
    schemaKind,
    occurredAt,
    title: stringField(value, "title", "label", "name"),
    summary: stringField(value, "summary", "description", "message"),
    actorId: stringField(value, "actorId", "actor_id", "actor"),
    payloadFingerprint: stringField(
      value,
      "payloadFingerprint",
      "payload_fingerprint",
      "fingerprint",
    ),
    redactionMarkers: normalizeRedactionMarkers(value),
    metadata: metadata === undefined ? undefined : clonePlain(metadata),
  };

  if (riskLevel !== undefined) {
    event.riskLevel = riskLevel;
  }
  if (replay !== undefined) {
    event.replay = replay;
  }

  return cloneCanonicalLocalEvent(event);
}

function normalizeRedactionMarkers(
  value: AnyRecord,
): LocalEventRedactionMarker[] | undefined {
  const markers = [
    ...arrayField(value, "redactionMarkers", "redaction_markers"),
    ...arrayField(value, "redactions"),
  ];

  if (markers.length === 0) {
    return undefined;
  }

  return markers
    .map((marker, index) => normalizeRedactionMarker(marker, index))
    .filter(isDefined);
}

function normalizeRedactionMarker(
  value: unknown,
  index: number,
): LocalEventRedactionMarker | undefined {
  if (typeof value === "string" && value.trim() !== "") {
    const path = value.trim();
    return {
      id: stableId("redaction", path),
      path,
      reason: "Value was redacted.",
      marker: "[redacted]",
      severity: "warning",
      status: "open",
    };
  }
  if (!isRecord(value)) {
    return undefined;
  }

  const path = stringField(value, "path", "pointer", "field");
  if (path === undefined) {
    return undefined;
  }

  return {
    id:
      stringField(value, "id", "markerId", "marker_id") ??
      stableId("redaction", `${path}:${index}`),
    path,
    reason:
      stringField(value, "reason", "message", "code") ?? "Value was redacted.",
    marker:
      stringField(value, "marker", "replacement", "placeholder") ?? "[redacted]",
    severity: normalizeRedactionSeverity(
      stringField(value, "severity", "level"),
    ),
    status: normalizeRedactionStatus(stringField(value, "status", "state")),
    createdAt: timestampField(value, "createdAt", "created_at"),
    resolvedAt: timestampField(value, "resolvedAt", "resolved_at"),
  };
}

function normalizeReplaySnapshot(
  value: AnyRecord,
): LocalEventReplaySnapshot | undefined {
  const replay = recordField(
    value,
    "replay",
    "replayState",
    "replay_state",
    "replayReadiness",
    "replay_readiness",
  );
  const source = replay ?? value;
  const status = normalizeReplayStatus(
    stringField(source, "status", "replayStatus", "replay_status", "state"),
  );
  const issueCodes = normalizeIssueCodes(source);
  const issueCount =
    nonNegativeIntegerField(source, "issueCount", "issue_count", "issues") ??
    issueCodes.length;
  const checkedAt = timestampField(source, "checkedAt", "checked_at");
  const replayedAt = timestampField(source, "replayedAt", "replayed_at");

  if (
    status === undefined &&
    issueCount === 0 &&
    checkedAt === undefined &&
    replayedAt === undefined
  ) {
    return undefined;
  }

  return {
    status: status ?? (issueCount > 0 ? "failed" : "ready"),
    checkedAt,
    replayedAt,
    issueCount,
    issueCodes,
  };
}

function normalizeIssueCodes(value: AnyRecord): string[] {
  const codes = new Set<string>();

  for (const item of arrayField(value, "issueCodes", "issue_codes")) {
    if (typeof item === "string" && item.trim() !== "") {
      codes.add(item.trim());
    }
  }
  for (const item of arrayField(value, "issues")) {
    if (typeof item === "string" && item.trim() !== "") {
      codes.add(item.trim());
    } else if (isRecord(item)) {
      const code = stringField(item, "code", "id", "kind");
      if (code !== undefined) {
        codes.add(code);
      }
    }
  }

  return [...codes].sort();
}

function buildRequestCardsFromRecords(
  records: readonly ApiRecord[],
): LocalEventApiRequestCard[] {
  return records
    .slice()
    .sort((left, right) => left.index - right.index || left.id.localeCompare(right.id))
    .map(buildRequestCard)
    .map(cloneRequestCard);
}

function buildRequestCard(record: ApiRecord): LocalEventApiRequestCard {
  const status = requestStatus(record);
  const statusLabel = localEventApiStatusLabel(status);
  const eventCount = collectEventPayloadsFromValue(record.responseBody).length;
  const valueLabel =
    record.status === undefined
      ? statusLabel
      : `HTTP ${record.status}`;
  const detailLabels = [
    `${record.method} ${record.routePath}`,
    valueLabel,
    formatCount(eventCount, "event"),
  ];

  if (record.generatedAt !== "") {
    detailLabels.push(`Captured at ${record.generatedAt}`);
  }

  return {
    id: `local_event_api.request.${sanitizeIdentifier(record.id, "request")}`,
    requestId: record.id,
    title: record.title ?? `${record.method} ${record.routePath}`,
    method: record.method,
    routePath: record.routePath,
    url: record.url,
    status,
    statusLabel,
    statusCode: record.status,
    eventCount,
    valueLabel,
    detailLabels,
    ariaLabel: [
      record.title ?? record.id,
      record.method,
      record.routePath,
      statusLabel,
      formatCount(eventCount, "event"),
    ].join(", "),
  };
}

function buildSummaryCards(input: {
  status: LocalEventApiStatus;
  records: readonly ApiRecord[];
  catalog: LocalEventCatalogState;
  errorStates: readonly LocalEventApiErrorState[];
}): LocalEventApiSummaryCard[] {
  const summary = input.catalog.summary;
  const requestErrorCount = input.errorStates.length;
  const requestSuccessCount = input.records.filter(
    (record) => requestStatus(record) === "success",
  ).length;

  return [
    buildSummaryCard({
      id: "events",
      label: "Local events",
      value: formatCount(input.catalog.totalCount, "event"),
      status: input.status,
      detailLabels: [
        formatCount(input.catalog.visibleCount, "visible event"),
        formatCount(summary.redactions.total, "redaction marker"),
      ],
    }),
    buildSummaryCard({
      id: "replay",
      label: "Replay readiness",
      value: summary.replayReadiness.label,
      status: summary.replayReadiness.status,
      detailLabels: [
        formatCount(summary.replayReadiness.readyCount, "ready event"),
        formatCount(summary.replayReadiness.attentionCount, "attention event"),
        formatCount(summary.replayReadiness.blockedCount, "blocked event"),
        formatCount(summary.replayReadiness.completeCount, "complete event"),
      ],
    }),
    buildSummaryCard({
      id: "redactions",
      label: "Redactions",
      value: summary.redactions.label,
      status:
        summary.redactions.openBlocking > 0
          ? "blocked"
          : summary.redactions.open > 0
            ? "attention"
            : summary.redactions.total > 0
              ? "complete"
              : "empty",
      detailLabels: [
        formatCount(summary.redactions.open, "open marker"),
        formatCount(summary.redactions.openBlocking, "open blocking marker"),
        formatCount(summary.redactions.resolved, "resolved marker"),
      ],
    }),
    buildSummaryCard({
      id: "requests",
      label: "API requests",
      value: formatCount(input.records.length, "request"),
      status:
        requestErrorCount > 0
          ? "error"
          : input.records.length === 0
            ? "empty"
            : "success",
      detailLabels: [
        formatCount(requestSuccessCount, "successful request"),
        formatCount(requestErrorCount, "request error"),
      ],
    }),
  ].map(cloneSummaryCard);
}

function buildSummaryCard(input: {
  id: string;
  label: string;
  value: string;
  status: LocalEventApiStatus;
  detailLabels: string[];
}): LocalEventApiSummaryCard {
  const statusLabel = localEventApiStatusLabel(input.status);
  return {
    id: `local_event_api.summary.${input.id}`,
    label: input.label,
    value: input.value,
    status: input.status,
    statusLabel,
    detailLabels: [...input.detailLabels],
    ariaLabel: [input.label, input.value, statusLabel].join(", "),
  };
}

function buildExportViewFromEvents(input: {
  events: readonly CanonicalLocalEvent[];
  generatedAt: string;
  status: LocalEventApiStatus;
  filter: LocalEventCatalogFilter | undefined;
  format: LocalEventApiExportFormat;
}): LocalEventApiExportView {
  const exportEvents = filterCanonicalLocalEvents(input.events, input.filter);
  const summaries = buildLocalEventSummaries(exportEvents);
  const content = exportContent(input.format, exportEvents, summaries, input.generatedAt);
  const status =
    input.status === "loading" || input.status === "error"
      ? input.status
      : exportEvents.length === 0
        ? "empty"
        : input.status;
  const redactionMarkerCount = summaries.reduce(
    (total, summary) => total + summary.redactions.total,
    0,
  );
  const replayIssueCount = summaries.reduce(
    (total, summary) => total + summary.replayReadiness.issueCount,
    0,
  );
  const mediaType =
    input.format === "jsonl" ? "application/x-ndjson" : "application/json";

  return {
    id: "local_event_api_export",
    format: input.format,
    status,
    statusLabel: localEventApiStatusLabel(status),
    fileName: exportFileName(input.format, input.generatedAt),
    mediaType,
    eventCount: exportEvents.length,
    redactionMarkerCount,
    replayIssueCount,
    byteCount: content.length,
    checksum: stableId("export", content),
    content,
    rows: summaries.map(buildExportRow),
    detailLabels: [
      formatCount(exportEvents.length, "event"),
      formatCount(redactionMarkerCount, "redaction marker"),
      formatCount(replayIssueCount, "replay issue"),
      mediaType,
    ],
    emptyState: buildExportEmptyState(status),
    ariaLabel: [
      "Local event export",
      localEventApiStatusLabel(status),
      formatCount(exportEvents.length, "event"),
      input.format.toUpperCase(),
    ].join(", "),
  };
}

function buildExportRow(summary: LocalEventSummary): LocalEventApiExportRow {
  const status = summary.replayReadiness.status;
  const statusLabel = getCatalogStatusLabel(status);

  return {
    id: `local_event_api.export.${summary.eventId}`,
    eventId: summary.eventId,
    streamId: summary.streamId,
    sequence: summary.sequence,
    sequenceLabel: summary.sequenceLabel,
    title: summary.title,
    status,
    statusLabel,
    operationKind: summary.operationKind,
    operationLabel: summary.operationLabel,
    schemaKind: summary.schemaKind,
    schemaLabel: summary.schemaLabel,
    redactionMarkerCount: summary.redactions.total,
    replayIssueCount: summary.replayReadiness.issueCount,
    detailLabels: [
      summary.operationLabel,
      summary.schemaLabel,
      statusLabel,
      formatCount(summary.redactions.total, "redaction marker"),
      formatCount(summary.replayReadiness.issueCount, "replay issue"),
    ],
    ariaLabel: [summary.title, statusLabel, summary.sequenceLabel].join(", "),
  };
}

function exportContent(
  format: LocalEventApiExportFormat,
  events: readonly CanonicalLocalEvent[],
  summaries: readonly LocalEventSummary[],
  generatedAt: string,
): string {
  if (format === "jsonl") {
    return events.map((event) => JSON.stringify(cloneCanonicalLocalEvent(event))).join("\n") +
      (events.length === 0 ? "" : "\n");
  }

  if (format === "manifest") {
    return JSON.stringify(
      {
        schemaVersion: "local-event-export-manifest.v1",
        generatedAt,
        eventCount: events.length,
        eventIds: summaries.map((summary) => summary.eventId),
        replayStatusCounts: summarizeReplayStatusCounts(summaries),
        redactionMarkerCount: summaries.reduce(
          (total, summary) => total + summary.redactions.total,
          0,
        ),
      },
      null,
      2,
    );
  }

  return JSON.stringify(
    {
      schemaVersion: "local-event-export.v1",
      generatedAt,
      eventCount: events.length,
      events: events.map(cloneCanonicalLocalEvent),
    },
    null,
    2,
  );
}

function summarizeReplayStatusCounts(
  summaries: readonly LocalEventSummary[],
): Record<LocalEventCatalogStatus, number> {
  const counts: Record<LocalEventCatalogStatus, number> = {
    empty: 0,
    ready: 0,
    attention: 0,
    blocked: 0,
    complete: 0,
  };

  for (const summary of summaries) {
    counts[summary.replayReadiness.status] += 1;
  }

  return counts;
}

function buildExportEmptyState(
  status: LocalEventApiStatus,
): LocalEventApiEmptyState {
  if (status === "loading") {
    return {
      id: "local_event_api_export_loading",
      label: "Export loading",
      description: "Export content will be prepared after local events load.",
      ariaLabel: "Local event export is loading",
    };
  }
  if (status === "error") {
    return {
      id: "local_event_api_export_error",
      label: "Export unavailable",
      description: "Fix the local event API error before exporting events.",
      ariaLabel: "Local event export is unavailable because loading failed",
      actionLabel: "Retry local events",
    };
  }
  if (status === "empty") {
    return buildLocalEventApiEmptyState("export");
  }
  return {
    id: "local_event_api_export_ready",
    label: "Export ready",
    description: "Local event export content is available.",
    ariaLabel: "Local event export content is available",
  };
}

function collectErrorStates(
  records: readonly ApiRecord[],
): LocalEventApiErrorState[] {
  const errors: LocalEventApiErrorState[] = [];

  for (const record of records) {
    const error = record.error ?? responseStatusError(record);
    if (error === undefined) {
      continue;
    }

    errors.push(
      buildLocalEventApiErrorState(errorContextFromRoute(record.routePath), error, {
        routeId: record.id,
        routePath: record.routePath,
        status: record.status,
      }),
    );
  }

  return errors;
}

function responseStatusError(record: ApiRecord): string | undefined {
  if (record.status !== undefined && record.status >= 400) {
    return `Request failed with status ${record.status}.`;
  }
  return undefined;
}

function replayMismatchMessage(record: AnyRecord): string | undefined {
  const matches = recordField(record, "matches");
  if (!matches) {
    return undefined;
  }

  const failed = Object.entries(matches)
    .filter(([, value]) => value === false)
    .map(([key]) => key);

  return failed.length === 0
    ? undefined
    : `Replay mismatch: ${failed.join(", ")}.`;
}

function apiErrorMessage(record: AnyRecord | undefined): string | undefined {
  if (!record) {
    return undefined;
  }

  const body = recordField(record, "body") ?? record;
  const error = recordField(body, "error");
  const message =
    stringField(error, "message") ??
    stringField(error, "code") ??
    stringField(body, "message");
  const status = integerField(record, "status");

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

function requestStatus(record: ApiRecord): LocalEventApiStatus {
  if (record.error !== undefined || (record.status !== undefined && record.status >= 400)) {
    return "error";
  }
  if (record.status !== undefined && record.status >= 200 && record.status < 300) {
    return "success";
  }
  if (record.responseBody !== undefined) {
    return "success";
  }
  return "empty";
}

function errorContextFromRoute(routePath: string): LocalEventApiContext {
  if (routePath.includes("/export")) {
    return "export";
  }
  if (routePath.includes("/replay")) {
    return "replay";
  }
  if (routePath.includes("/events")) {
    return "events";
  }
  return "response";
}

function hasEventPayload(value: AnyRecord): boolean {
  return (
    isEventPayload(value) ||
    ["events", "localEvents", "local_events", "items", "records"].some((key) =>
      Array.isArray(value[key]),
    ) ||
    recordField(value, "event", "localEvent", "local_event") !== undefined
  );
}

function isEventPayload(value: AnyRecord): boolean {
  return (
    stringField(value, "id", "eventId", "event_id") !== undefined &&
    normalizeOperationKind(
      stringField(value, "operationKind", "operation_kind", "operation", "action"),
    ) !== undefined &&
    normalizeSchemaKind(
      stringField(value, "schemaKind", "schema_kind", "schema", "entityKind", "entity_kind"),
    ) !== undefined
  );
}

function requireOperationKind(value: AnyRecord): LocalEventOperationKind {
  const kind = normalizeOperationKind(
    stringField(value, "operationKind", "operation_kind", "operation", "action"),
  );
  if (kind === undefined) {
    throw new Error("local event operation kind is required");
  }
  return kind;
}

function requireSchemaKind(value: AnyRecord): LocalEventSchemaKind {
  const kind = normalizeSchemaKind(
    stringField(value, "schemaKind", "schema_kind", "schema", "entityKind", "entity_kind"),
  );
  if (kind === undefined) {
    throw new Error("local event schema kind is required");
  }
  return kind;
}

function normalizeOperationKind(
  value: string | undefined,
): LocalEventOperationKind | undefined {
  if (isLocalEventOperationKind(value)) {
    return value;
  }
  const token = normalizeToken(value);
  if (token.includes("create") || token.includes("insert") || token.includes("add")) {
    return "create";
  }
  if (token.includes("update") || token.includes("edit") || token.includes("patch")) {
    return "update";
  }
  if (token.includes("delete") || token.includes("remove")) {
    return "delete";
  }
  if (token.includes("restore")) {
    return "restore";
  }
  if (token.includes("sync") || token.includes("replay")) {
    return "sync";
  }
  return undefined;
}

function normalizeSchemaKind(
  value: string | undefined,
): LocalEventSchemaKind | undefined {
  if (isLocalEventSchemaKind(value)) {
    return value;
  }
  const token = normalizeToken(value);
  if (token.includes("workspace")) {
    return "workspace";
  }
  if (token.includes("document") || token.includes("doc")) {
    return "document";
  }
  if (token.includes("task")) {
    return "task";
  }
  if (token.includes("artifact")) {
    return "artifact";
  }
  if (token.includes("setting")) {
    return "setting";
  }
  if (token.includes("connection") || token.includes("connector")) {
    return "connection";
  }
  return undefined;
}

function normalizeRiskLevel(
  value: string | undefined,
): LocalEventRiskLevel | undefined {
  if (isLocalEventRiskLevel(value)) {
    return value;
  }
  const token = normalizeToken(value);
  if (token === "low") {
    return "low";
  }
  if (token === "medium" || token === "med") {
    return "medium";
  }
  if (token === "high") {
    return "high";
  }
  return undefined;
}

function normalizeRedactionSeverity(
  value: string | undefined,
): LocalEventRedactionSeverity {
  if (isLocalEventRedactionSeverity(value)) {
    return value;
  }
  const token = normalizeToken(value);
  if (token.includes("block") || token.includes("deny") || token.includes("error")) {
    return "blocking";
  }
  if (token.includes("info") || token.includes("notice")) {
    return "info";
  }
  return "warning";
}

function normalizeRedactionStatus(
  value: string | undefined,
): LocalEventRedactionStatus {
  if (isLocalEventRedactionStatus(value)) {
    return value;
  }
  const token = normalizeToken(value);
  if (token.includes("resolve") || token.includes("closed")) {
    return "resolved";
  }
  return "open";
}

function normalizeReplayStatus(
  value: string | undefined,
): LocalEventReplayStatus | undefined {
  if (isLocalEventReplayStatus(value)) {
    return value;
  }
  const token = normalizeToken(value);
  if (token.includes("pending") || token.includes("waiting")) {
    return "pending";
  }
  if (token.includes("ready")) {
    return "ready";
  }
  if (token.includes("replayed") || token.includes("complete") || token.includes("done")) {
    return "replayed";
  }
  if (token.includes("fail") || token.includes("error") || token.includes("blocked")) {
    return "failed";
  }
  return undefined;
}

function inferRoutePathFromPayload(value: unknown): string {
  if (!isRecord(value)) {
    return DEFAULT_EVENTS_ROUTE;
  }
  const kind = normalizeToken(stringField(value, "kind", "type"));
  const format = stringField(value, "format");
  if (kind.includes("export") || format !== undefined) {
    return DEFAULT_EXPORT_ROUTE;
  }
  if (kind.includes("replay")) {
    return DEFAULT_REPLAY_ROUTE;
  }
  return DEFAULT_EVENTS_ROUTE;
}

function replayFilterFromCatalogFilter(
  filter: LocalEventCatalogFilter | undefined,
): LocalEventReplayFilter {
  if (filter === undefined) {
    return {};
  }

  const replayFilter: LocalEventReplayFilter = {};
  if (filter.operationKind !== undefined) {
    replayFilter.operationKind = cloneFilterValue(filter.operationKind);
  }
  if (filter.schemaKind !== undefined) {
    replayFilter.schemaKind = cloneFilterValue(filter.schemaKind);
  }
  if (filter.riskLevel !== undefined) {
    replayFilter.riskLevel = cloneFilterValue(filter.riskLevel);
  }
  if (filter.query !== undefined && filter.query.trim() !== "") {
    replayFilter.query = filter.query.trim();
  }
  return replayFilter;
}

function cloneFilterValue<TValue extends string>(
  value: TValue | readonly TValue[] | "all",
): TValue | readonly TValue[] | "all" {
  return Array.isArray(value) ? [...value] : value;
}

function compareCanonicalEvents(
  left: CanonicalLocalEvent,
  right: CanonicalLocalEvent,
): number {
  return (
    left.streamId.localeCompare(right.streamId) ||
    left.sequence - right.sequence ||
    compareTimestamps(left.occurredAt, right.occurredAt) ||
    left.id.localeCompare(right.id)
  );
}

function dedupeErrorStates(
  errors: readonly LocalEventApiErrorState[],
): LocalEventApiErrorState[] {
  const seen = new Set<string>();
  const deduped: LocalEventApiErrorState[] = [];

  for (const error of errors) {
    const key = [
      error.context,
      error.routeId,
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

  return deduped.sort(compareApiErrorStates);
}

function compareApiErrorStates(
  left: LocalEventApiErrorState,
  right: LocalEventApiErrorState,
): number {
  return (
    apiContextRank(left.context) - apiContextRank(right.context) ||
    (left.routePath ?? "").localeCompare(right.routePath ?? "") ||
    (left.routeId ?? "").localeCompare(right.routeId ?? "") ||
    left.errorState.description.localeCompare(right.errorState.description)
  );
}

function apiContextRank(context: LocalEventApiContext): number {
  switch (context) {
    case "requests":
      return 0;
    case "response":
      return 1;
    case "events":
      return 2;
    case "summary":
      return 3;
    case "replay":
      return 4;
    case "export":
      return 5;
  }
}

function localEventApiStatusLabel(status: LocalEventApiStatus): string {
  switch (status) {
    case "loading":
      return "Loading";
    case "success":
      return "Success";
    case "error":
      return "Error";
    default:
      return getCatalogStatusLabel(status);
  }
}

function errorLabel(context: LocalEventApiContext): string {
  switch (context) {
    case "requests":
      return "Local event requests could not load";
    case "response":
      return "Local event response could not load";
    case "events":
      return "Local events could not load";
    case "summary":
      return "Local event summary could not load";
    case "replay":
      return "Local event replay could not load";
    case "export":
      return "Local event export could not load";
  }
}

function retryLabel(context: LocalEventApiContext): string {
  switch (context) {
    case "requests":
      return "Retry requests";
    case "response":
      return "Retry response";
    case "events":
      return "Retry local events";
    case "summary":
      return "Retry summary";
    case "replay":
      return "Retry replay";
    case "export":
      return "Retry export";
  }
}

function defaultErrorDescription(context: LocalEventApiContext): string {
  switch (context) {
    case "requests":
      return "Load captured local event requests and try again.";
    case "response":
      return "Refresh the local event API response and try again.";
    case "events":
      return "Refresh local event records and try again.";
    case "summary":
      return "Refresh local event summary data and try again.";
    case "replay":
      return "Refresh local event replay data and try again.";
    case "export":
      return "Refresh local event export data and try again.";
  }
}

function absoluteRouteUrl(
  routePath: string,
  apiBase: string | undefined,
): string | undefined {
  if (apiBase === undefined) {
    return routePath;
  }

  try {
    return new URL(routePath.replace(/^\/+/, ""), ensureTrailingSlash(apiBase)).href;
  } catch {
    return routePath;
  }
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
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

function integerField(
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

function positiveIntegerField(
  record: AnyRecord,
  ...keys: string[]
): number | undefined {
  const value = integerField(record, ...keys);
  return value === undefined || value < 1 ? undefined : value;
}

function nonNegativeIntegerField(
  record: AnyRecord,
  ...keys: string[]
): number | undefined {
  const value = integerField(record, ...keys);
  return value === undefined ? undefined : Math.max(value, 0);
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

function isDefined<TValue>(value: TValue | undefined): value is TValue {
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

function compareTimestamps(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
    return left.localeCompare(right);
  }

  return leftTime - rightTime || left.localeCompare(right);
}

function exportFileName(
  format: LocalEventApiExportFormat,
  generatedAt: string,
): string {
  const extension = format === "jsonl" ? "jsonl" : "json";
  const timestamp = generatedAt
    .replace(/[^0-9TZ]/g, "")
    .replace(/Z$/, "")
    .slice(0, 15);
  return `local-events-${timestamp || "snapshot"}.${extension}`;
}

function stableId(prefix: string, value: string): string {
  return `${prefix}_${stableHash(value)}`;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function formatCount(
  value: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function errorMessage(error: unknown): string | undefined {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
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
      stringField(body, "message")
    );
  }
  return undefined;
}

function redactErrorValue(
  value: unknown,
  key = "",
  seen = new WeakMap<object, unknown>(),
): unknown {
  if (value === null || typeof value !== "object") {
    return typeof value === "string" ? redactErrorText(value) : value;
  }

  if (isSecretKey(key)) {
    return "[redacted]";
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
      copy.push(redactErrorValue(item, key, seen));
    }
    return copy;
  }

  const copy: Record<string, unknown> = {};
  seen.set(objectValue, copy);
  for (const [entryKey, entryValue] of Object.entries(value as AnyRecord)) {
    copy[entryKey] = redactErrorValue(entryValue, entryKey, seen);
  }
  return copy;
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

function redactErrorText(value: string): string {
  return truncateDescription(
    value
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
      .replace(
        /(["']?)(api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|authorization)\1\s*:\s*(["'])(?:\\.|(?!\3).)*\3/gi,
        "\"$2\":\"[redacted]\"",
      )
      .replace(
        /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|authorization)\b\s*=\s*([^\s,;]+)/gi,
        "$1=[redacted]",
      )
      .replace(
        /([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|authorization)=)[^&#\s]+/gi,
        "$1[redacted]",
      )
      .replace(/file:\/\/\/?[^\s,;)"']+/gi, "[local path]")
      .replace(/[A-Za-z]:\\(?:[^\\\s,:;]+\\)*[^\\\s,:;]*/g, "[local path]")
      .replace(/\/(?:Users|home)\/[^\s,;)"']+/g, "[local path]")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function truncateDescription(value: string): string {
  return value.length <= 240 ? value : `${value.slice(0, 237)}...`;
}

function cloneApiState(state: LocalEventApiState): LocalEventApiState {
  return {
    ...state,
    requestCards: state.requestCards.map(cloneRequestCard),
    catalog: cloneCatalogState(state.catalog),
    replay: cloneReplayState(state.replay),
    summaryCards: state.summaryCards.map(cloneSummaryCard),
    exportView: cloneExportView(state.exportView),
    emptyStates: {
      requests: { ...state.emptyStates.requests },
      summary: { ...state.emptyStates.summary },
      replay: { ...state.emptyStates.replay },
      export: { ...state.emptyStates.export },
      errors: { ...state.emptyStates.errors },
    },
    errorStates: state.errorStates.map(cloneApiErrorState),
  };
}

function cloneRequestCard(
  card: LocalEventApiRequestCard,
): LocalEventApiRequestCard {
  return {
    ...card,
    detailLabels: [...card.detailLabels],
  };
}

function cloneSummaryCard(card: LocalEventApiSummaryCard): LocalEventApiSummaryCard {
  return {
    ...card,
    detailLabels: [...card.detailLabels],
  };
}

function cloneExportView(view: LocalEventApiExportView): LocalEventApiExportView {
  return {
    ...view,
    rows: view.rows.map(cloneExportRow),
    detailLabels: [...view.detailLabels],
    emptyState: { ...view.emptyState },
  };
}

function cloneExportRow(row: LocalEventApiExportRow): LocalEventApiExportRow {
  return {
    ...row,
    detailLabels: [...row.detailLabels],
  };
}

function cloneApiErrorState(error: LocalEventApiErrorState): LocalEventApiErrorState {
  return {
    ...error,
    errorState: { ...error.errorState },
  };
}

function cloneCatalogState(state: LocalEventCatalogState): LocalEventCatalogState {
  return {
    ...state,
    summaries: state.summaries.map(cloneLocalEventSummary),
    summary: cloneCatalogSummary(state.summary),
    visibleSummary: cloneCatalogSummary(state.visibleSummary),
    emptyState: { ...state.emptyState },
  };
}

function cloneReplayState(state: LocalEventReplayState): LocalEventReplayState {
  return {
    ...state,
    summary: cloneCatalogSummary(state.summary),
    visibleSummary: cloneCatalogSummary(state.visibleSummary),
    filters: {
      ...state.filters,
      filter: clonePlain(state.filters.filter),
      activeFilters: state.filters.activeFilters.map((filter) => ({ ...filter })),
      operationKindOptions: state.filters.operationKindOptions.map((option) => ({
        ...option,
      })),
      schemaKindOptions: state.filters.schemaKindOptions.map((option) => ({
        ...option,
      })),
      riskLevelOptions: state.filters.riskLevelOptions.map((option) => ({
        ...option,
      })),
      replayStatusOptions: state.filters.replayStatusOptions.map((option) => ({
        ...option,
      })),
      redactionStatusOptions: state.filters.redactionStatusOptions.map(
        (option) => ({ ...option }),
      ),
    },
    timelineRows: state.timelineRows.map((row) => ({
      ...row,
      issueCodes: [...row.issueCodes],
      badgeLabels: [...row.badgeLabels],
      detailLabels: [...row.detailLabels],
    })),
    approvalCards: state.approvalCards.map((card) => ({
      ...card,
      eventIds: [...card.eventIds],
      detailLabels: [...card.detailLabels],
    })),
    documentCards: state.documentCards.map((card) => ({
      ...card,
      eventIds: [...card.eventIds],
      detailLabels: [...card.detailLabels],
    })),
    emptyState: { ...state.emptyState },
    errorStates: state.errorStates.map((error) => ({ ...error })),
  };
}

function cloneCatalogSummary(
  summary: LocalEventCatalogState["summary"],
): LocalEventCatalogState["summary"] {
  return {
    ...summary,
    byOperationKind: { ...summary.byOperationKind },
    bySchemaKind: { ...summary.bySchemaKind },
    byRiskLevel: { ...summary.byRiskLevel },
    redactions: {
      ...summary.redactions,
      bySeverity: { ...summary.redactions.bySeverity },
      openBySeverity: { ...summary.redactions.openBySeverity },
      markerIds: [...summary.redactions.markerIds],
      openMarkerIds: [...summary.redactions.openMarkerIds],
      resolvedMarkerIds: [...summary.redactions.resolvedMarkerIds],
      openBlockingMarkerIds: [...summary.redactions.openBlockingMarkerIds],
      markers: summary.redactions.markers.map((marker) => ({ ...marker })),
    },
    replayReadiness: {
      ...summary.replayReadiness,
      byStatus: { ...summary.replayReadiness.byStatus },
      readyEventIds: [...summary.replayReadiness.readyEventIds],
      attentionEventIds: [...summary.replayReadiness.attentionEventIds],
      blockedEventIds: [...summary.replayReadiness.blockedEventIds],
      completeEventIds: [...summary.replayReadiness.completeEventIds],
    },
  };
}

function cloneLocalEventSummary(summary: LocalEventSummary): LocalEventSummary {
  return {
    ...summary,
    redactions: {
      ...summary.redactions,
      bySeverity: { ...summary.redactions.bySeverity },
      openBySeverity: { ...summary.redactions.openBySeverity },
      markerIds: [...summary.redactions.markerIds],
      openMarkerIds: [...summary.redactions.openMarkerIds],
      resolvedMarkerIds: [...summary.redactions.resolvedMarkerIds],
      openBlockingMarkerIds: [...summary.redactions.openBlockingMarkerIds],
      markers: summary.redactions.markers.map((marker) => ({ ...marker })),
    },
    replayReadiness: {
      ...summary.replayReadiness,
      reasonLabels: [...summary.replayReadiness.reasonLabels],
      issueCodes: [...summary.replayReadiness.issueCodes],
    },
    detailLabels: [...summary.detailLabels],
  };
}

function cloneCanonicalLocalEvent(
  event: CanonicalLocalEvent,
): CanonicalLocalEvent {
  return {
    ...event,
    redactionMarkers: event.redactionMarkers?.map((marker) => ({ ...marker })),
    replay:
      event.replay === undefined
        ? undefined
        : {
            ...event.replay,
            issueCodes:
              event.replay.issueCodes === undefined
                ? undefined
                : [...event.replay.issueCodes],
          },
    metadata:
      event.metadata === undefined ? undefined : clonePlain(event.metadata),
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
