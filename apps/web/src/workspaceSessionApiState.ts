import {
  buildWorkspaceSessionLoadingState,
  buildWorkspaceSessionState,
  redactWorkspaceSessionText,
  type WorkspaceSessionSeverity,
  type WorkspaceSessionState,
  type WorkspaceSessionStatus,
} from "./workspaceSessionState.ts";

export type WorkspaceSessionApiPhase = "loading" | "success" | "error";

export type WorkspaceSessionApiStatus = WorkspaceSessionStatus | "success";

export type WorkspaceSessionApiContext =
  | "requests"
  | "response"
  | "session"
  | "audit"
  | "summary";

export interface BuildWorkspaceSessionApiStateOptions {
  apiBase?: string;
  defaultTimestamp?: string;
  loading?: boolean;
  error?: unknown;
}

export interface WorkspaceSessionApiState {
  id: "workspace_session_api";
  phase: WorkspaceSessionApiPhase;
  generatedAt: string;
  status: WorkspaceSessionApiStatus;
  statusLabel: string;
  severity: WorkspaceSessionSeverity;
  severityLabel: string;
  requestCount: number;
  sourceCount: number;
  localOnly: boolean;
  redacted: boolean;
  redactionCount: number;
  requestCards: WorkspaceSessionApiRequestCard[];
  workspaceSession: WorkspaceSessionState;
  summaryCards: WorkspaceSessionApiSummaryCard[];
  auditPreview: WorkspaceSessionApiAuditPreviewCard;
  emptyStates: WorkspaceSessionApiEmptyStates;
  errorStates: WorkspaceSessionApiErrorState[];
  ariaLabel: string;
}

export interface WorkspaceSessionApiRequestCard {
  id: string;
  requestId: string;
  title: string;
  method: string;
  routePath: string;
  url?: string;
  status: WorkspaceSessionApiStatus;
  statusLabel: string;
  severity: WorkspaceSessionSeverity;
  severityLabel: string;
  statusCode?: number;
  valueLabel: string;
  detailLabels: string[];
  localOnly: boolean;
  redacted: boolean;
  redactionCount: number;
  ariaLabel: string;
}

export interface WorkspaceSessionApiSummaryCard {
  id: string;
  label: string;
  value: string;
  status: WorkspaceSessionApiStatus;
  statusLabel: string;
  severity: WorkspaceSessionSeverity;
  severityLabel: string;
  detailLabels: string[];
  localOnly: boolean;
  redacted: boolean;
  redactionCount: number;
  ariaLabel: string;
}

export interface WorkspaceSessionApiAuditPreviewCard {
  id: "workspace_session_api_audit_preview";
  title: "Audit preview";
  valueLabel: string;
  status: WorkspaceSessionApiStatus;
  statusLabel: string;
  severity: WorkspaceSessionSeverity;
  severityLabel: string;
  rowCount: number;
  localOnly: boolean;
  redacted: boolean;
  redactionCount: number;
  detailLabels: string[];
  rows: WorkspaceSessionApiAuditPreviewRow[];
  emptyState: WorkspaceSessionApiEmptyState;
  ariaLabel: string;
}

export interface WorkspaceSessionApiAuditPreviewRow {
  id: string;
  auditId: string;
  sequence: number;
  sequenceLabel: string;
  title: string;
  timestamp: string;
  status: WorkspaceSessionApiStatus;
  statusLabel: string;
  severity: WorkspaceSessionSeverity;
  severityLabel: string;
  actorLabel?: string;
  detailLabels: string[];
  localOnly: boolean;
  redacted: boolean;
  redactionCount: number;
  ariaLabel: string;
}

export interface WorkspaceSessionApiEmptyStates {
  requests: WorkspaceSessionApiEmptyState;
  response: WorkspaceSessionApiEmptyState;
  session: WorkspaceSessionApiEmptyState;
  audit: WorkspaceSessionApiEmptyState;
  errors: WorkspaceSessionApiEmptyState;
}

export interface WorkspaceSessionApiEmptyState {
  id: string;
  label: string;
  description: string;
  ariaLabel: string;
  actionLabel?: string;
}

export interface WorkspaceSessionApiErrorState {
  id: string;
  context: WorkspaceSessionApiContext;
  routeId?: string;
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
  sessionPayload: AnyRecord;
  auditRows: WorkspaceSessionApiAuditPreviewRow[];
  localOnly: boolean;
  redactionCount: number;
  errorStates: WorkspaceSessionApiErrorState[];
}

interface RedactedText {
  text: string;
  redactionCount: number;
}

const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const DEFAULT_STATUS_ROUTE = "/v1/workspace-session/summary";
const DEFAULT_AUDIT_ROUTE = "/v1/workspace-session/audit-preview";

export function buildWorkspaceSessionApiState(
  input: unknown = {},
  options: BuildWorkspaceSessionApiStateOptions = {},
): WorkspaceSessionApiState {
  if (options.loading === true) {
    return buildWorkspaceSessionApiLoadingState(options);
  }

  const bridge = normalizeBridge(input, options);
  const workspaceSession = buildWorkspaceSessionState(bridge.sessionPayload, {
    defaultTimestamp: bridge.generatedAt,
    error: options.error,
  });
  const errorStates =
    options.error === undefined
      ? bridge.errorStates
      : [
          ...bridge.errorStates,
          buildWorkspaceSessionApiErrorState("response", options.error),
        ];
  const phase: WorkspaceSessionApiPhase =
    errorStates.length > 0 || workspaceSession.phase === "error"
      ? "error"
      : "success";
  const requestCards = buildRequestCardsFromRecords(bridge.records);
  const requestRedactionCount = requestCards.reduce(
    (total, card) => total + card.redactionCount,
    0,
  );
  const errorRedactionCount = errorStates.reduce(
    (total, error) => total + error.redactionCount,
    0,
  );
  const auditRedactionCount = bridge.auditRows.reduce(
    (total, row) => total + row.redactionCount,
    0,
  );
  const redactionCount =
    bridge.redactionCount +
    requestRedactionCount +
    errorRedactionCount +
    auditRedactionCount;
  const status = resolveApiStatus({
    phase,
    requestCards,
    workspaceSession,
    auditRows: bridge.auditRows,
  });
  const severity = severityForApiStatus(status);
  const localOnly =
    bridge.localOnly ||
    requestCards.some((card) => card.localOnly) ||
    bridge.auditRows.some((row) => row.localOnly);
  const redacted = redactionCount > 0;

  return cloneApiState({
    id: "workspace_session_api",
    phase,
    generatedAt: bridge.generatedAt,
    status,
    statusLabel: apiStatusLabel(status),
    severity,
    severityLabel: severityLabel(severity),
    requestCount: bridge.records.length,
    sourceCount: workspaceSession.sourceCount,
    localOnly,
    redacted,
    redactionCount,
    requestCards,
    workspaceSession,
    summaryCards: buildSummaryCards({
      status,
      severity,
      records: bridge.records,
      requestCards,
      workspaceSession,
      auditRows: bridge.auditRows,
      errorStates,
      localOnly,
      redactionCount,
    }),
    auditPreview: buildAuditPreviewCard(bridge.auditRows, {
      generatedAt: bridge.generatedAt,
      status,
      localOnly,
    }),
    emptyStates: buildWorkspaceSessionApiEmptyStates(),
    errorStates: errorStates.map(cloneErrorState),
    ariaLabel: [
      "Workspace session API",
      apiStatusLabel(status),
      severityLabel(severity),
      formatCount(bridge.records.length, "request"),
      formatCount(bridge.auditRows.length, "audit row"),
    ].join(", "),
  });
}

export function buildWorkspaceSessionApiLoadingState(
  options: Pick<BuildWorkspaceSessionApiStateOptions, "defaultTimestamp"> = {},
): WorkspaceSessionApiState {
  const generatedAt = normalizeTimestamp(undefined, options.defaultTimestamp);
  const status: WorkspaceSessionApiStatus = "loading";
  const severity = severityForApiStatus(status);
  const requestCards: WorkspaceSessionApiRequestCard[] = [
    {
      id: "workspace_session_api.request.loading",
      requestId: "loading",
      title: "Loading workspace session API",
      method: "POST",
      routePath: DEFAULT_STATUS_ROUTE,
      status,
      statusLabel: apiStatusLabel(status),
      severity,
      severityLabel: severityLabel(severity),
      valueLabel: "Loading",
      detailLabels: ["Waiting for workspace session API response."],
      localOnly: true,
      redacted: false,
      redactionCount: 0,
      ariaLabel: "Loading workspace session API, Loading",
    },
  ];

  return cloneApiState({
    id: "workspace_session_api",
    phase: "loading",
    generatedAt,
    status,
    statusLabel: apiStatusLabel(status),
    severity,
    severityLabel: severityLabel(severity),
    requestCount: 0,
    sourceCount: 0,
    localOnly: true,
    redacted: false,
    redactionCount: 0,
    requestCards,
    workspaceSession: buildWorkspaceSessionLoadingState({
      defaultTimestamp: generatedAt,
    }),
    summaryCards: [
      buildSummaryCard({
        id: "status",
        label: "Workspace session",
        value: "Loading",
        status,
        detailLabels: ["Waiting for workspace session API response."],
        localOnly: true,
        redactionCount: 0,
      }),
    ],
    auditPreview: buildAuditPreviewCard([], {
      generatedAt,
      status,
      localOnly: true,
    }),
    emptyStates: buildWorkspaceSessionApiEmptyStates(),
    errorStates: [],
    ariaLabel: "Workspace session API, Loading, Info",
  });
}

export function buildWorkspaceSessionApiRequestCards(
  input: unknown,
  options: BuildWorkspaceSessionApiStateOptions = {},
): WorkspaceSessionApiRequestCard[] {
  return buildRequestCardsFromRecords(
    normalizeBridge(input, options).records,
  ).map(cloneRequestCard);
}

export function buildWorkspaceSessionApiSummaryCards(
  input: unknown,
  options: BuildWorkspaceSessionApiStateOptions = {},
): WorkspaceSessionApiSummaryCard[] {
  return buildWorkspaceSessionApiState(input, options).summaryCards.map(
    cloneSummaryCard,
  );
}

export function buildWorkspaceSessionApiAuditPreview(
  input: unknown,
  options: BuildWorkspaceSessionApiStateOptions = {},
): WorkspaceSessionApiAuditPreviewCard {
  return cloneAuditPreview(
    buildWorkspaceSessionApiState(input, options).auditPreview,
  );
}

export function buildWorkspaceSessionApiErrorStates(
  input: unknown,
  options: BuildWorkspaceSessionApiStateOptions = {},
): WorkspaceSessionApiErrorState[] {
  return normalizeBridge(input, options).errorStates.map(cloneErrorState);
}

export function buildWorkspaceSessionApiEmptyStates(): WorkspaceSessionApiEmptyStates {
  return {
    requests: buildWorkspaceSessionApiEmptyState("requests"),
    response: buildWorkspaceSessionApiEmptyState("response"),
    session: buildWorkspaceSessionApiEmptyState("session"),
    audit: buildWorkspaceSessionApiEmptyState("audit"),
    errors: buildWorkspaceSessionApiEmptyState("response"),
  };
}

export function buildWorkspaceSessionApiEmptyState(
  context: WorkspaceSessionApiContext,
): WorkspaceSessionApiEmptyState {
  switch (context) {
    case "requests":
      return {
        id: "workspace_session_api_requests_empty",
        label: "No API requests",
        description:
          "Captured workspace session requests will appear when a replay is loaded.",
        ariaLabel: "No workspace session API requests are available",
      };
    case "response":
      return {
        id: "workspace_session_api_response_empty",
        label: "No API response",
        description:
          "Load a workspace session API response to show isolation status.",
        ariaLabel: "No workspace session API response is available",
      };
    case "session":
      return {
        id: "workspace_session_api_session_empty",
        label: "No session status",
        description:
          "Workspace/session isolation status will appear after a response is loaded.",
        ariaLabel: "No workspace session isolation status is available",
      };
    case "audit":
      return {
        id: "workspace_session_api_audit_empty",
        label: "No audit preview",
        description:
          "Audit preview rows will appear when a response includes audit entries.",
        ariaLabel: "No workspace session audit preview rows are available",
      };
    case "summary":
      return {
        id: "workspace_session_api_summary_empty",
        label: "No API summary",
        description:
          "Workspace session API summary counts will appear after data is loaded.",
        ariaLabel: "No workspace session API summary is available",
      };
  }
}

export function buildWorkspaceSessionApiErrorState(
  context: WorkspaceSessionApiContext,
  error: unknown,
  metadata: {
    routeId?: string;
    routePath?: string;
    status?: number;
  } = {},
): WorkspaceSessionApiErrorState {
  const redacted = redactWorkspaceSessionApiError(error);
  const id = `workspace_session_api_${context}_error`;

  return {
    id,
    context,
    routeId: metadata.routeId,
    routePath: metadata.routePath,
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

export function redactWorkspaceSessionApiError(error: unknown): RedactedText {
  const message = errorMessage(error);
  if (message !== undefined) {
    return redactSensitiveText(message, "Workspace session API response could not load.");
  }

  if (isRecord(error)) {
    return redactSensitiveText(
      JSON.stringify(redactSensitiveValue(error)),
      "Workspace session API response could not load.",
    );
  }

  return {
    text: "Workspace session API response could not load.",
    redactionCount: 0,
  };
}

function normalizeBridge(
  input: unknown,
  options: BuildWorkspaceSessionApiStateOptions,
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
  const records = normalizeApiRecords(root, generatedAt, options.apiBase);
  const sessionPayload = collectWorkspaceSessionPayload(records, rootRecord);
  const auditRows = collectAuditRows(records, rootRecord, generatedAt);
  const errorStates = collectErrorStates(records);
  const localOnly =
    hasLocalOnlyMarker(rootRecord) ||
    records.some((record) => hasLocalOnlyMarker(record.responseBody));
  const redactionCount =
    records.length === 0
      ? redactionCountFromValue(rootRecord)
      : records.reduce(
          (total, record) =>
            total +
            redactionCountFromValue(record.requestBody) +
            redactionCountFromValue(record.responseBody),
          0,
        );

  return {
    generatedAt,
    records,
    sessionPayload,
    auditRows,
    localOnly,
    redactionCount,
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
        id: stringField(root, "id") ?? "workspace_session_api_response",
        index: 0,
        title: stringField(root, "title", "label"),
        method: stringField(root, "method")?.toUpperCase() ?? "POST",
        routePath,
        url: absoluteRouteUrl(routePath, apiBase),
        status: integerField(root, "status"),
        responseBody: root.body,
        generatedAt: fallbackTimestamp,
        error: apiErrorMessage(root),
      },
    ];
  }

  if (isRecord(root) && hasWorkspaceSessionPayload(root)) {
    const routePath = inferRoutePathFromPayload(root);
    return [
      {
        id: "workspace_session_api_response",
        index: 0,
        title: "Workspace session response",
        method: "POST",
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
      `workspace_session_api_request_${index + 1}`,
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
      timestampField(
        record,
        "generatedAt",
        "generated_at",
        "createdAt",
        "created_at",
      ) ?? fallbackTimestamp,
    error: replayMismatchMessage(record) ?? apiErrorMessage(response ?? record),
  };
}

function collectWorkspaceSessionPayload(
  records: readonly ApiRecord[],
  root: AnyRecord | undefined,
): AnyRecord {
  const collected: AnyRecord = {};

  if (root !== undefined) {
    mergeWorkspaceSessionPayload(collected, root);
  }

  for (const record of records) {
    mergeWorkspaceSessionPayload(collected, record.responseBody);
  }

  return collected;
}

function mergeWorkspaceSessionPayload(target: AnyRecord, value: unknown): void {
  if (!isRecord(value)) {
    return;
  }

  const payload = unwrapWorkspaceSessionPayload(value);
  for (const key of [
    "workspace",
    "workspaceOpen",
    "session",
    "sessionState",
    "lock",
    "lockState",
    "approval",
    "approvals",
    "gateway",
    "approvalGateway",
    "migration",
    "migrationReadiness",
    "backup",
    "backupReadiness",
  ]) {
    if (payload[key] !== undefined) {
      target[key] = clonePlain(payload[key]);
    }
  }
  const generatedAt = timestampField(
    payload,
    "generatedAt",
    "generated_at",
    "updatedAt",
    "updated_at",
  );
  if (generatedAt !== undefined) {
    target.generatedAt = generatedAt;
  }

  const errors = arrayField(payload, "errors");
  if (errors.length > 0) {
    target.errors = [...arrayField(target, "errors"), ...clonePlain(errors)];
  }
}

function unwrapWorkspaceSessionPayload(value: AnyRecord): AnyRecord {
  let current = value;
  for (const key of ["body", "data", "result", "state", "workspaceSession"]) {
    const nested = recordField(current, key);
    if (nested !== undefined && hasWorkspaceSessionPayload(nested)) {
      current = nested;
    }
  }
  return current;
}

function collectAuditRows(
  records: readonly ApiRecord[],
  root: AnyRecord | undefined,
  fallbackTimestamp: string,
): WorkspaceSessionApiAuditPreviewRow[] {
  const rows = new Map<string, WorkspaceSessionApiAuditPreviewRow>();

  if (root !== undefined) {
    collectAuditPayloadsFromValue(root).forEach((entry, index) => {
      const row = normalizeAuditRow(entry, index, fallbackTimestamp);
      rows.set(row.id, row);
    });
  }

  for (const record of records) {
    collectAuditPayloadsFromValue(record.responseBody).forEach((entry, index) => {
      const row = normalizeAuditRow(entry, index, record.generatedAt);
      rows.set(row.id, row);
    });
  }

  return [...rows.values()].sort(compareAuditRows).map(cloneAuditRow);
}

function collectAuditPayloadsFromValue(value: unknown): AnyRecord[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }
  if (!isRecord(value)) {
    return [];
  }

  const payload = unwrapAuditPayload(value);
  const rows: AnyRecord[] = [];
  for (const key of [
    "audit",
    "auditRows",
    "audit_rows",
    "auditPreview",
    "audit_preview",
    "entries",
    "events",
    "rows",
  ]) {
    rows.push(...arrayField(payload, key).filter(isRecord));
  }
  const entry = recordField(payload, "entry", "event", "row");
  if (entry !== undefined) {
    rows.push(entry);
  }
  for (const key of ["data", "result", "state"]) {
    const nested = recordField(payload, key);
    if (nested !== undefined && nested !== payload) {
      rows.push(...collectAuditPayloadsFromValue(nested));
    }
  }

  return rows.filter(isAuditPayload);
}

function unwrapAuditPayload(value: AnyRecord): AnyRecord {
  let current = value;
  for (const key of ["body", "data", "result", "auditPreview", "audit_preview"]) {
    const nested = recordField(current, key);
    if (nested !== undefined) {
      current = nested;
    }
  }
  return current;
}

function normalizeAuditRow(
  value: AnyRecord,
  index: number,
  fallbackTimestamp: string,
): WorkspaceSessionApiAuditPreviewRow {
  const redactedTitle = redactSensitiveText(
    stringField(value, "title", "label", "action", "operation") ??
      "Workspace session audit entry",
    "Workspace session audit entry",
  );
  const redactedSummary = redactSensitiveText(
    stringField(value, "summary", "description", "message", "detail") ?? "",
    "",
  );
  const auditId =
    stringField(value, "id", "auditId", "audit_id", "eventId", "event_id") ??
    `audit_${index + 1}`;
  const sequence =
    positiveIntegerField(value, "sequence", "seq", "index") ?? index + 1;
  const timestamp =
    timestampField(
      value,
      "timestamp",
      "createdAt",
      "created_at",
      "occurredAt",
      "occurred_at",
    ) ?? fallbackTimestamp;
  const status =
    normalizeApiStatus(stringField(value, "status", "state")) ?? "success";
  const severity =
    normalizeSeverity(stringField(value, "severity", "level")) ??
    severityForApiStatus(status);
  const actorLabel = stringField(value, "actor", "actorId", "actor_id");
  const localOnly = hasLocalOnlyMarker(value);
  const redactionCount =
    redactedTitle.redactionCount +
    redactedSummary.redactionCount +
    redactionCountFromValue(value);
  const detailLabels = [
    redactedSummary.text === "" ? undefined : redactedSummary.text,
    actorLabel === undefined ? undefined : `Actor ${actorLabel}`,
    localOnly ? "Local-only" : undefined,
    redactionCount > 0 ? formatCount(redactionCount, "redaction") : undefined,
  ].filter(isDefined);

  return {
    id: `workspace_session_api.audit.${sanitizeIdentifier(auditId, "audit")}`,
    auditId,
    sequence,
    sequenceLabel: `#${sequence}`,
    title: redactedTitle.text,
    timestamp,
    status,
    statusLabel: apiStatusLabel(status),
    severity,
    severityLabel: severityLabel(severity),
    actorLabel,
    detailLabels,
    localOnly,
    redacted: redactionCount > 0,
    redactionCount,
    ariaLabel: [
      redactedTitle.text,
      apiStatusLabel(status),
      severityLabel(severity),
      `Sequence ${sequence}`,
    ].join(", "),
  };
}

function buildRequestCardsFromRecords(
  records: readonly ApiRecord[],
): WorkspaceSessionApiRequestCard[] {
  return records
    .slice()
    .sort((left, right) => left.index - right.index || left.id.localeCompare(right.id))
    .map(buildRequestCard)
    .map(cloneRequestCard);
}

function buildRequestCard(record: ApiRecord): WorkspaceSessionApiRequestCard {
  const status = requestStatus(record);
  const severity = severityForApiStatus(status);
  const redacted = redactSensitiveText(
    record.error === undefined ? "" : errorMessage(record.error) ?? "",
    "",
  );
  const markerRedactionCount =
    redactionCountFromValue(record.requestBody) +
    redactionCountFromValue(record.responseBody);
  const redactionCount = redacted.redactionCount + markerRedactionCount;
  const localOnly =
    hasLocalOnlyMarker(record.requestBody) || hasLocalOnlyMarker(record.responseBody);
  const valueLabel =
    record.status === undefined ? apiStatusLabel(status) : `HTTP ${record.status}`;
  const detailLabels = [
    `${record.method} ${record.routePath}`,
    valueLabel,
    localOnly ? "Local-only" : undefined,
    redactionCount > 0 ? formatCount(redactionCount, "redaction") : undefined,
    record.generatedAt === "" ? undefined : `Captured at ${record.generatedAt}`,
  ].filter(isDefined);

  return {
    id: `workspace_session_api.request.${sanitizeIdentifier(record.id, "request")}`,
    requestId: record.id,
    title: record.title ?? `${record.method} ${record.routePath}`,
    method: record.method,
    routePath: record.routePath,
    url: record.url,
    status,
    statusLabel: apiStatusLabel(status),
    severity,
    severityLabel: severityLabel(severity),
    statusCode: record.status,
    valueLabel,
    detailLabels,
    localOnly,
    redacted: redactionCount > 0,
    redactionCount,
    ariaLabel: [
      record.title ?? record.id,
      record.method,
      record.routePath,
      apiStatusLabel(status),
      valueLabel,
    ].join(", "),
  };
}

function buildSummaryCards(input: {
  status: WorkspaceSessionApiStatus;
  severity: WorkspaceSessionSeverity;
  records: readonly ApiRecord[];
  requestCards: readonly WorkspaceSessionApiRequestCard[];
  workspaceSession: WorkspaceSessionState;
  auditRows: readonly WorkspaceSessionApiAuditPreviewRow[];
  errorStates: readonly WorkspaceSessionApiErrorState[];
  localOnly: boolean;
  redactionCount: number;
}): WorkspaceSessionApiSummaryCard[] {
  const successfulRequestCount = input.requestCards.filter(
    (card) => card.status === "success",
  ).length;
  const errorCount = input.errorStates.length;
  const auditStatus = auditStatusFromRows(input.auditRows);

  return [
    buildSummaryCard({
      id: "status",
      label: "Workspace session",
      value: input.workspaceSession.statusLabel,
      status: input.workspaceSession.status,
      detailLabels: [
        input.workspaceSession.severityLabel,
        formatCount(input.workspaceSession.sourceCount, "source section"),
      ],
      localOnly: input.localOnly,
      redactionCount: input.redactionCount,
    }),
    buildSummaryCard({
      id: "requests",
      label: "API requests",
      value: formatCount(input.records.length, "request"),
      status:
        errorCount > 0
          ? "error"
          : input.records.length === 0
            ? "empty"
            : "success",
      detailLabels: [
        formatCount(successfulRequestCount, "successful request"),
        formatCount(errorCount, "request error"),
      ],
      localOnly: input.requestCards.some((card) => card.localOnly),
      redactionCount: input.requestCards.reduce(
        (total, card) => total + card.redactionCount,
        0,
      ),
    }),
    buildSummaryCard({
      id: "audit",
      label: "Audit preview",
      value: formatCount(input.auditRows.length, "row"),
      status: auditStatus,
      detailLabels: [
        formatCount(
          input.auditRows.filter((row) => row.localOnly).length,
          "local-only row",
        ),
        formatCount(
          input.auditRows.filter((row) => row.redacted).length,
          "redacted row",
        ),
      ],
      localOnly: input.auditRows.some((row) => row.localOnly),
      redactionCount: input.auditRows.reduce(
        (total, row) => total + row.redactionCount,
        0,
      ),
    }),
    buildSummaryCard({
      id: "redactions",
      label: "Redactions",
      value:
        input.redactionCount === 0
          ? "No redactions"
          : formatCount(input.redactionCount, "redaction"),
      status: input.redactionCount === 0 ? "ready" : "attention",
      detailLabels: [
        input.localOnly ? "Local-only data present" : "No local-only marker",
        formatCount(input.errorStates.length, "error state"),
      ],
      localOnly: input.localOnly,
      redactionCount: input.redactionCount,
    }),
  ].map(cloneSummaryCard);
}

function buildSummaryCard(input: {
  id: string;
  label: string;
  value: string;
  status: WorkspaceSessionApiStatus;
  detailLabels: string[];
  localOnly: boolean;
  redactionCount: number;
}): WorkspaceSessionApiSummaryCard {
  const severity = severityForApiStatus(input.status);
  return {
    id: `workspace_session_api.summary.${input.id}`,
    label: input.label,
    value: input.value,
    status: input.status,
    statusLabel: apiStatusLabel(input.status),
    severity,
    severityLabel: severityLabel(severity),
    detailLabels: [...input.detailLabels],
    localOnly: input.localOnly,
    redacted: input.redactionCount > 0,
    redactionCount: input.redactionCount,
    ariaLabel: [input.label, input.value, apiStatusLabel(input.status)].join(", "),
  };
}

function buildAuditPreviewCard(
  rows: readonly WorkspaceSessionApiAuditPreviewRow[],
  input: {
    generatedAt: string;
    status: WorkspaceSessionApiStatus;
    localOnly: boolean;
  },
): WorkspaceSessionApiAuditPreviewCard {
  const status =
    input.status === "loading" || input.status === "error"
      ? input.status
      : auditStatusFromRows(rows);
  const severity = severityForApiStatus(status);
  const redactionCount = rows.reduce(
    (total, row) => total + row.redactionCount,
    0,
  );
  const localOnly = input.localOnly || rows.some((row) => row.localOnly);
  const valueLabel =
    rows.length === 0 ? "No audit rows" : formatCount(rows.length, "audit row");

  return {
    id: "workspace_session_api_audit_preview",
    title: "Audit preview",
    valueLabel,
    status,
    statusLabel: apiStatusLabel(status),
    severity,
    severityLabel: severityLabel(severity),
    rowCount: rows.length,
    localOnly,
    redacted: redactionCount > 0,
    redactionCount,
    detailLabels: [
      formatCount(rows.length, "row"),
      formatCount(rows.filter((row) => row.localOnly).length, "local-only row"),
      formatCount(rows.filter((row) => row.redacted).length, "redacted row"),
      `Generated at ${input.generatedAt}`,
    ],
    rows: rows.map(cloneAuditRow),
    emptyState: buildWorkspaceSessionApiEmptyState("audit"),
    ariaLabel: ["Audit preview", valueLabel, apiStatusLabel(status)].join(", "),
  };
}

function collectErrorStates(
  records: readonly ApiRecord[],
): WorkspaceSessionApiErrorState[] {
  const errors: WorkspaceSessionApiErrorState[] = [];

  for (const record of records) {
    const error = record.error ?? responseStatusError(record);
    if (error === undefined) {
      continue;
    }
    errors.push(
      buildWorkspaceSessionApiErrorState(errorContextFromRoute(record.routePath), error, {
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
  if (matches === undefined) {
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
  if (record === undefined) {
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

function requestStatus(record: ApiRecord): WorkspaceSessionApiStatus {
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

function resolveApiStatus(input: {
  phase: WorkspaceSessionApiPhase;
  requestCards: readonly WorkspaceSessionApiRequestCard[];
  workspaceSession: WorkspaceSessionState;
  auditRows: readonly WorkspaceSessionApiAuditPreviewRow[];
}): WorkspaceSessionApiStatus {
  if (input.phase === "error") {
    return "error";
  }
  if (input.requestCards.length === 0 && input.workspaceSession.sourceCount === 0) {
    return "empty";
  }
  if (input.workspaceSession.status === "blocked") {
    return "blocked";
  }
  if (
    input.workspaceSession.status === "attention" ||
    input.auditRows.some((row) => row.status === "attention")
  ) {
    return "attention";
  }
  if (input.workspaceSession.status === "ready") {
    return "ready";
  }
  return input.workspaceSession.status;
}

function auditStatusFromRows(
  rows: readonly WorkspaceSessionApiAuditPreviewRow[],
): WorkspaceSessionApiStatus {
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
  return "success";
}

function errorContextFromRoute(routePath: string): WorkspaceSessionApiContext {
  const token = normalizeToken(routePath);
  if (token.includes("audit")) {
    return "audit";
  }
  if (token.includes("session")) {
    return "session";
  }
  return "response";
}

function hasWorkspaceSessionPayload(value: unknown): value is AnyRecord {
  if (!isRecord(value)) {
    return false;
  }
  if (
    [
      "workspace",
      "workspaceOpen",
      "session",
      "sessionState",
      "lock",
      "lockState",
      "approval",
      "approvals",
      "gateway",
      "approvalGateway",
      "migration",
      "migrationReadiness",
      "backup",
      "backupReadiness",
    ].some((key) => value[key] !== undefined)
  ) {
    return true;
  }
  for (const key of ["body", "data", "result", "state", "workspaceSession"]) {
    const nested = recordField(value, key);
    if (nested !== undefined && nested !== value && hasWorkspaceSessionPayload(nested)) {
      return true;
    }
  }
  return false;
}

function isAuditPayload(value: AnyRecord): boolean {
  return (
    stringField(
      value,
      "id",
      "auditId",
      "audit_id",
      "eventId",
      "event_id",
      "title",
      "message",
      "summary",
      "action",
    ) !== undefined ||
    timestampField(
      value,
      "timestamp",
      "createdAt",
      "created_at",
      "occurredAt",
      "occurred_at",
    ) !== undefined
  );
}

function inferRoutePathFromPayload(value: unknown): string {
  if (!isRecord(value)) {
    return DEFAULT_STATUS_ROUTE;
  }
  if (
    arrayField(value, "audit", "auditRows", "audit_rows", "entries").length > 0 ||
    recordField(value, "auditPreview", "audit_preview") !== undefined
  ) {
    return DEFAULT_AUDIT_ROUTE;
  }
  return DEFAULT_STATUS_ROUTE;
}

function hasLocalOnlyMarker(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const direct =
    booleanField(
      value,
      "localOnly",
      "local_only",
      "isLocalOnly",
      "is_local_only",
      "local",
    ) ?? false;
  if (direct) {
    return true;
  }
  const scope = normalizeToken(
    stringField(value, "scope", "visibility", "storageMode", "storage_mode"),
  );
  if (
    scope === "local_only" ||
    scope === "local" ||
    scope === "workspace_local" ||
    scope.includes("local_only")
  ) {
    return true;
  }
  for (const key of ["metadata", "meta", "flags"]) {
    if (hasLocalOnlyMarker(recordField(value, key))) {
      return true;
    }
  }
  return false;
}

function redactionCountFromValue(value: unknown): number {
  if (value === undefined || value === null) {
    return 0;
  }
  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + redactionCountFromValue(item), 0);
  }
  if (!isRecord(value)) {
    return 0;
  }
  let count = 0;
  const redactions = arrayField(
    value,
    "redactions",
    "redactionMarkers",
    "redaction_markers",
    "markers",
  );
  count += redactions.length;
  if (
    booleanField(value, "redacted", "hasRedactions", "has_redactions") === true
  ) {
    count += 1;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (
      key === "redactions" ||
      key === "redactionMarkers" ||
      key === "redaction_markers" ||
      key === "markers"
    ) {
      continue;
    }
    count += redactionCountFromValue(entry);
  }
  return count;
}

function redactSensitiveText(value: unknown, fallback: string): RedactedText {
  const before = value === undefined || value === null ? "" : String(value);
  if (before.trim() === "") {
    return {
      text: fallback,
      redactionCount: 0,
    };
  }
  const after = redactWorkspaceSessionText(before);
  const text = after === "" ? fallback : after;
  return {
    text: text === "" ? fallback : text,
    redactionCount: before === after ? 0 : countRedactionMarkers(after),
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

  const copy: Record<string, unknown> = {};
  seen.set(objectValue, copy);
  for (const [entryKey, entryValue] of Object.entries(value as AnyRecord)) {
    copy[entryKey] = redactSensitiveValue(entryValue, entryKey, seen);
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

function countRedactionMarkers(value: string): number {
  const matches = value.match(/\[redacted-(?:path|secret)\]/g);
  return matches === null ? 0 : matches.length;
}

function dedupeErrorStates(
  errors: readonly WorkspaceSessionApiErrorState[],
): WorkspaceSessionApiErrorState[] {
  const seen = new Set<string>();
  const deduped: WorkspaceSessionApiErrorState[] = [];

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

  return deduped.sort(compareErrorStates);
}

function compareErrorStates(
  left: WorkspaceSessionApiErrorState,
  right: WorkspaceSessionApiErrorState,
): number {
  return (
    left.context.localeCompare(right.context) ||
    (left.routeId ?? "").localeCompare(right.routeId ?? "") ||
    (left.routePath ?? "").localeCompare(right.routePath ?? "") ||
    (left.status ?? 0) - (right.status ?? 0) ||
    left.errorState.description.localeCompare(right.errorState.description)
  );
}

function compareAuditRows(
  left: WorkspaceSessionApiAuditPreviewRow,
  right: WorkspaceSessionApiAuditPreviewRow,
): number {
  return (
    left.sequence - right.sequence ||
    compareTimestamps(left.timestamp, right.timestamp) ||
    left.auditId.localeCompare(right.auditId)
  );
}

function compareTimestamps(left: string, right: string): number {
  const leftValue = Date.parse(left);
  const rightValue = Date.parse(right);
  if (Number.isNaN(leftValue) || Number.isNaN(rightValue)) {
    return left.localeCompare(right);
  }
  return leftValue - rightValue;
}

function apiStatusLabel(status: WorkspaceSessionApiStatus): string {
  switch (status) {
    case "loading":
      return "Loading";
    case "success":
      return "Success";
    case "empty":
      return "Not configured";
    case "ready":
      return "Ready";
    case "attention":
      return "Needs attention";
    case "blocked":
      return "Blocked";
    case "error":
      return "Error";
  }
}

function severityForApiStatus(
  status: WorkspaceSessionApiStatus,
): WorkspaceSessionSeverity {
  switch (status) {
    case "success":
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

function normalizeApiStatus(
  value: string | undefined,
): WorkspaceSessionApiStatus | undefined {
  if (value === undefined) {
    return undefined;
  }
  const token = normalizeToken(value);
  if (
    token === "loading" ||
    token === "empty" ||
    token === "ready" ||
    token === "attention" ||
    token === "blocked" ||
    token === "error" ||
    token === "success"
  ) {
    return token;
  }
  if (token === "ok" || token === "complete" || token === "completed") {
    return "success";
  }
  if (token === "pending" || token === "warning" || token === "warn") {
    return "attention";
  }
  if (token === "failed" || token === "failure") {
    return "error";
  }
  return undefined;
}

function normalizeSeverity(
  value: string | undefined,
): WorkspaceSessionSeverity | undefined {
  const token = normalizeToken(value);
  if (
    token === "neutral" ||
    token === "info" ||
    token === "success" ||
    token === "warning" ||
    token === "critical"
  ) {
    return token;
  }
  if (token === "error" || token === "fatal") {
    return "critical";
  }
  return undefined;
}

function errorLabel(context: WorkspaceSessionApiContext): string {
  switch (context) {
    case "requests":
      return "Workspace session requests could not load";
    case "response":
      return "Workspace session response could not load";
    case "session":
      return "Workspace session status could not load";
    case "audit":
      return "Workspace session audit could not load";
    case "summary":
      return "Workspace session summary could not load";
  }
}

function retryLabel(context: WorkspaceSessionApiContext): string {
  switch (context) {
    case "requests":
      return "Retry requests";
    case "response":
      return "Retry response";
    case "session":
      return "Retry session status";
    case "audit":
      return "Retry audit preview";
    case "summary":
      return "Retry summary";
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
  ...keys: readonly string[]
): string | undefined {
  const value = stringField(record, ...keys);
  return value !== undefined && !Number.isNaN(Date.parse(value))
    ? value
    : undefined;
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

function arrayField(
  record: AnyRecord | unknown,
  ...keys: readonly string[]
): unknown[] {
  if (!isRecord(record)) {
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
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return Math.trunc(value);
    }
  }
  return undefined;
}

function positiveIntegerField(
  record: AnyRecord,
  ...keys: readonly string[]
): number | undefined {
  const value = integerField(record, ...keys);
  return value === undefined || value < 1 ? undefined : value;
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
      if (token === "true" || token === "yes" || token === "local_only") {
        return true;
      }
      if (token === "false" || token === "no") {
        return false;
      }
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

function sanitizeIdentifier(value: string, fallback: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return sanitized === "" ? fallback : sanitized;
}

function normalizeToken(value: string | undefined): string {
  return value === undefined
    ? ""
    : value
        .trim()
        .toLowerCase()
        .replace(/([a-z])([A-Z])/g, "$1_$2")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

function formatCount(
  value: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function cloneApiState(state: WorkspaceSessionApiState): WorkspaceSessionApiState {
  return {
    ...state,
    requestCards: state.requestCards.map(cloneRequestCard),
    workspaceSession: clonePlain(state.workspaceSession),
    summaryCards: state.summaryCards.map(cloneSummaryCard),
    auditPreview: cloneAuditPreview(state.auditPreview),
    emptyStates: {
      requests: { ...state.emptyStates.requests },
      response: { ...state.emptyStates.response },
      session: { ...state.emptyStates.session },
      audit: { ...state.emptyStates.audit },
      errors: { ...state.emptyStates.errors },
    },
    errorStates: state.errorStates.map(cloneErrorState),
  };
}

function cloneRequestCard(
  card: WorkspaceSessionApiRequestCard,
): WorkspaceSessionApiRequestCard {
  return {
    ...card,
    detailLabels: [...card.detailLabels],
  };
}

function cloneSummaryCard(
  card: WorkspaceSessionApiSummaryCard,
): WorkspaceSessionApiSummaryCard {
  return {
    ...card,
    detailLabels: [...card.detailLabels],
  };
}

function cloneAuditPreview(
  card: WorkspaceSessionApiAuditPreviewCard,
): WorkspaceSessionApiAuditPreviewCard {
  return {
    ...card,
    detailLabels: [...card.detailLabels],
    rows: card.rows.map(cloneAuditRow),
    emptyState: { ...card.emptyState },
  };
}

function cloneAuditRow(
  row: WorkspaceSessionApiAuditPreviewRow,
): WorkspaceSessionApiAuditPreviewRow {
  return {
    ...row,
    detailLabels: [...row.detailLabels],
  };
}

function cloneErrorState(
  error: WorkspaceSessionApiErrorState,
): WorkspaceSessionApiErrorState {
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
