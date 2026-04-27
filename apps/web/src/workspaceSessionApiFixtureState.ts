import {
  buildWorkspaceSessionApiLoadingState,
  buildWorkspaceSessionApiState,
  type BuildWorkspaceSessionApiStateOptions,
  type WorkspaceSessionApiErrorState,
  type WorkspaceSessionApiPhase,
  type WorkspaceSessionApiState,
  type WorkspaceSessionApiStatus,
} from "./workspaceSessionApiState.ts";
import {
  redactWorkspaceSessionText,
  type WorkspaceSessionSeverity,
} from "./workspaceSessionState.ts";

export interface BuildWorkspaceSessionApiFixtureStateOptions
  extends BuildWorkspaceSessionApiStateOptions {
  expectedRouteCount?: number;
}

export interface WorkspaceSessionApiFixtureState {
  id: "workspace_session_api_fixture";
  phase: WorkspaceSessionApiPhase;
  generatedAt: string;
  schemaVersion?: string;
  status: WorkspaceSessionApiStatus;
  statusLabel: string;
  severity: WorkspaceSessionSeverity;
  severityLabel: string;
  routeCount: number;
  successfulRouteCount: number;
  failedRouteCount: number;
  localOnly: boolean;
  redacted: boolean;
  redactionCount: number;
  rawBodyRetained: false;
  routeStatuses: WorkspaceSessionApiFixtureRouteStatus[];
  persistenceReadiness: WorkspaceSessionApiFixturePersistenceReadiness;
  summaryCards: WorkspaceSessionApiFixtureSummaryCard[];
  apiState: WorkspaceSessionApiState;
  errorStates: WorkspaceSessionApiErrorState[];
  ariaLabel: string;
}

export interface WorkspaceSessionApiFixtureRouteStatus {
  id: string;
  routeId: string;
  index: number;
  label: string;
  title: string;
  method: string;
  routePath: string;
  status: WorkspaceSessionApiStatus;
  statusLabel: string;
  severity: WorkspaceSessionSeverity;
  severityLabel: string;
  statusCode?: number;
  expectedStatus?: number;
  matched?: boolean;
  localOnly: boolean;
  localOnlyKnown: boolean;
  redacted: boolean;
  redactionCount: number;
  durableWrites: boolean;
  rawRetentionRisk: boolean;
  rawRetentionRiskCount: number;
  detailLabels: string[];
  ariaLabel: string;
}

export interface WorkspaceSessionApiFixturePersistenceReadiness {
  id: "workspace_session_api_fixture.persistence_readiness";
  status: WorkspaceSessionApiStatus;
  statusLabel: string;
  severity: WorkspaceSessionSeverity;
  severityLabel: string;
  ready: boolean;
  label: string;
  routeCount: number;
  successfulRouteCount: number;
  failedRouteCount: number;
  localOnly: boolean;
  unknownLocalOnlyCount: number;
  durableWriteCount: number;
  rawRetentionRiskCount: number;
  rawBodyRetained: false;
  redactionCount: number;
  detailLabels: string[];
  ariaLabel: string;
}

export interface WorkspaceSessionApiFixtureSummaryCard {
  id: string;
  label: string;
  value: string;
  status: WorkspaceSessionApiStatus;
  statusLabel: string;
  severity: WorkspaceSessionSeverity;
  severityLabel: string;
  detailLabels: string[];
  redactionCount: number;
  ariaLabel: string;
}

type AnyRecord = Record<string, unknown>;

interface NormalizedFixture {
  generatedAt: string;
  schemaVersion?: string;
  apiBase?: string;
  records: FixtureRouteRecord[];
}

interface FixtureRouteRecord {
  id: string;
  index: number;
  title?: string;
  method: string;
  routePath: string;
  statusCode?: number;
  expectedStatus?: number;
  matches: Readonly<Record<string, boolean>>;
  responseBody?: AnyRecord;
  redactionCount: number;
  localOnly?: boolean;
  durableWrites: boolean;
  rawRetentionRiskCount: number;
}

const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const DEFAULT_SUMMARY_ROUTE = "/v1/workspace-session/summary";
const DEFAULT_AUDIT_ROUTE = "/v1/workspace-session/audit-preview";

export function buildWorkspaceSessionApiFixtureState(
  input: unknown = {},
  options: BuildWorkspaceSessionApiFixtureStateOptions = {},
): WorkspaceSessionApiFixtureState {
  if (options.loading === true) {
    return buildWorkspaceSessionApiFixtureLoadingState(options);
  }

  const normalized = normalizeFixture(input, options);
  const apiState = buildWorkspaceSessionApiState(input, {
    ...options,
    apiBase: options.apiBase ?? normalized.apiBase,
    defaultTimestamp: normalized.generatedAt,
  });
  const routeStatuses = normalized.records.map(buildRouteStatus);
  const routeRedactionCount = sum(routeStatuses, (route) => route.redactionCount);
  const redactionCount = Math.max(apiState.redactionCount, routeRedactionCount);
  const persistenceReadiness = buildPersistenceReadinessFromRoutes(routeStatuses, {
    redactionCount,
    expectedRouteCount: options.expectedRouteCount,
  });
  const failedRouteCount = routeStatuses.filter((route) => isFailedRoute(route)).length;
  const successfulRouteCount = routeStatuses.filter(
    (route) => route.status === "success",
  ).length;
  const errorStates = apiState.errorStates.map(cloneErrorState);
  const phase: WorkspaceSessionApiPhase =
    errorStates.length > 0 || options.error !== undefined ? "error" : apiState.phase;
  const status = resolveFixtureStatus({
    phase,
    routeStatuses,
    persistenceReadiness,
    apiState,
  });
  const severity = severityForStatus(status);
  const localOnly =
    routeStatuses.length > 0 &&
    routeStatuses.every((route) => route.localOnly && route.localOnlyKnown);

  return cloneFixtureState({
    id: "workspace_session_api_fixture",
    phase,
    generatedAt: normalized.generatedAt,
    ...(normalized.schemaVersion === undefined
      ? {}
      : { schemaVersion: normalized.schemaVersion }),
    status,
    statusLabel: statusLabel(status),
    severity,
    severityLabel: severityLabel(severity),
    routeCount: routeStatuses.length,
    successfulRouteCount,
    failedRouteCount,
    localOnly,
    redacted: redactionCount > 0,
    redactionCount,
    rawBodyRetained: false,
    routeStatuses,
    persistenceReadiness,
    summaryCards: buildSummaryCards({
      routeStatuses,
      persistenceReadiness,
      redactionCount,
    }),
    apiState,
    errorStates,
    ariaLabel: [
      "Workspace session API fixture",
      statusLabel(status),
      severityLabel(severity),
      formatCount(routeStatuses.length, "route"),
      formatCount(redactionCount, "redaction"),
      persistenceReadiness.label,
    ].join(", "),
  });
}

export function buildWorkspaceSessionApiFixtureLoadingState(
  options: Pick<BuildWorkspaceSessionApiFixtureStateOptions, "defaultTimestamp"> = {},
): WorkspaceSessionApiFixtureState {
  const generatedAt = normalizeTimestamp(undefined, options.defaultTimestamp);
  const status: WorkspaceSessionApiStatus = "loading";
  const severity = severityForStatus(status);
  const routeStatuses: WorkspaceSessionApiFixtureRouteStatus[] = [
    {
      id: "workspace_session_api_fixture.route.loading",
      routeId: "loading",
      index: 0,
      label: `POST ${DEFAULT_SUMMARY_ROUTE}`,
      title: "Workspace session summary",
      method: "POST",
      routePath: DEFAULT_SUMMARY_ROUTE,
      status,
      statusLabel: statusLabel(status),
      severity,
      severityLabel: severityLabel(severity),
      localOnly: true,
      localOnlyKnown: true,
      redacted: false,
      redactionCount: 0,
      durableWrites: false,
      rawRetentionRisk: false,
      rawRetentionRiskCount: 0,
      detailLabels: ["Waiting for workspace session fixture replay."],
      ariaLabel: "Workspace session summary, Loading",
    },
  ];
  const persistenceReadiness = buildPersistenceReadinessFromRoutes([], {
    status,
    redactionCount: 0,
  });

  return cloneFixtureState({
    id: "workspace_session_api_fixture",
    phase: "loading",
    generatedAt,
    status,
    statusLabel: statusLabel(status),
    severity,
    severityLabel: severityLabel(severity),
    routeCount: 0,
    successfulRouteCount: 0,
    failedRouteCount: 0,
    localOnly: true,
    redacted: false,
    redactionCount: 0,
    rawBodyRetained: false,
    routeStatuses,
    persistenceReadiness,
    summaryCards: buildSummaryCards({
      routeStatuses: [],
      persistenceReadiness,
      redactionCount: 0,
    }),
    apiState: buildWorkspaceSessionApiLoadingState({
      defaultTimestamp: generatedAt,
    }),
    errorStates: [],
    ariaLabel: "Workspace session API fixture, Loading, Info",
  });
}

export function buildWorkspaceSessionApiFixtureRouteStatuses(
  input: unknown,
  options: BuildWorkspaceSessionApiFixtureStateOptions = {},
): WorkspaceSessionApiFixtureRouteStatus[] {
  return buildWorkspaceSessionApiFixtureState(input, options).routeStatuses.map(
    cloneRouteStatus,
  );
}

export function buildWorkspaceSessionApiFixturePersistenceReadiness(
  input: unknown,
  options: BuildWorkspaceSessionApiFixtureStateOptions = {},
): WorkspaceSessionApiFixturePersistenceReadiness {
  return clonePersistenceReadiness(
    buildWorkspaceSessionApiFixtureState(input, options).persistenceReadiness,
  );
}

export function buildWorkspaceSessionApiFixtureSummaryCards(
  input: unknown,
  options: BuildWorkspaceSessionApiFixtureStateOptions = {},
): WorkspaceSessionApiFixtureSummaryCard[] {
  return buildWorkspaceSessionApiFixtureState(input, options).summaryCards.map(
    cloneSummaryCard,
  );
}

function normalizeFixture(
  input: unknown,
  options: BuildWorkspaceSessionApiFixtureStateOptions,
): NormalizedFixture {
  const root = isRecord(input) ? input : undefined;
  const generatedAt = normalizeTimestamp(
    timestampField(root, "generatedAt", "generated_at", "createdAt", "created_at"),
    options.defaultTimestamp,
  );
  const apiBase = stringField(root, "apiBase", "api_base") ?? options.apiBase;
  const schemaVersion = stringField(root, "schemaVersion", "schema_version");

  return {
    generatedAt,
    ...(schemaVersion === undefined ? {} : { schemaVersion }),
    ...(apiBase === undefined ? {} : { apiBase }),
    records: normalizeRouteRecords(input, generatedAt),
  };
}

function normalizeRouteRecords(
  input: unknown,
  generatedAt: string,
): FixtureRouteRecord[] {
  if (isRecord(input) && Array.isArray(input.requests)) {
    return input.requests.map((entry, index) =>
      normalizeRouteRecord(entry, index, generatedAt),
    );
  }

  if (
    isRecord(input) &&
    (isRecord(input.route) ||
      isRecord(input.request) ||
      isRecord(input.response) ||
      isRecord(input.actual) ||
      stringField(input, "method") !== undefined ||
      stringField(input, "path", "routePath", "route_path") !== undefined)
  ) {
    return [normalizeRouteRecord(input, 0, generatedAt)];
  }

  if (isRecord(input) && isRecord(input.body)) {
    return [normalizeRouteResponseRecord(input, 0, generatedAt)];
  }

  if (isWorkspaceSessionRouteBody(input)) {
    return [
      normalizeRouteRecord(
        {
          id: "workspace_session_route_response",
          method: "POST",
          path: inferRoutePath(input),
          response: {
            body: input,
          },
        },
        0,
        generatedAt,
      ),
    ];
  }

  return [];
}

function normalizeRouteResponseRecord(
  input: AnyRecord,
  index: number,
  generatedAt: string,
): FixtureRouteRecord {
  const body = recordField(input, "body");
  return normalizeRouteRecord(
    {
      id: stringField(input, "id") ?? "workspace_session_route_response",
      method: stringField(input, "method") ?? "POST",
      path: stringField(input, "path", "routePath", "route_path") ??
        inferRoutePath(body),
      response: {
        status: integerField(input, "status", "statusCode", "status_code"),
        body,
      },
    },
    index,
    generatedAt,
  );
}

function normalizeRouteRecord(
  input: unknown,
  index: number,
  generatedAt: string,
): FixtureRouteRecord {
  const record = isRecord(input) ? input : {};
  const route = recordField(record, "route");
  const response = recordField(record, "response");
  const actual = recordField(record, "actual") ?? response;
  const expected = recordField(record, "expected", "expect");
  const responseBody =
    recordField(actual, "body") ??
    recordField(response, "body") ??
    recordField(record, "body");
  const matches = normalizeMatches(recordField(record, "matches"));
  const method =
    stringField(record, "method") ??
    stringField(route, "method") ??
    "POST";
  const routePath =
    stringField(record, "path", "routePath", "route_path") ??
    stringField(route, "path") ??
    inferRoutePath(responseBody);
  const statusCode =
    integerField(actual, "status", "statusCode", "status_code") ??
    integerField(response, "status", "statusCode", "status_code") ??
    integerField(record, "status", "statusCode", "status_code");
  const expectedStatus =
    integerField(expected, "status", "statusCode", "status_code") ??
    integerField(record, "expectedStatus", "expected_status");
  const redactionCount = countRecordRedactionFields(record) +
    countRedactions(responseBody);
  const rawRetentionRiskCount = countRawRetentionRisks(responseBody);

  return {
    id:
      stringField(record, "id", "requestId", "request_id") ??
      `workspace_session_api_route_${index + 1}`,
    index,
    ...(stringField(record, "title", "label") === undefined
      ? {}
      : { title: safeLabel(stringField(record, "title", "label")) }),
    method: method.toUpperCase(),
    routePath,
    ...(statusCode === undefined ? {} : { statusCode }),
    ...(expectedStatus === undefined ? {} : { expectedStatus }),
    matches,
    ...(responseBody === undefined ? {} : { responseBody }),
    redactionCount,
    localOnly: localOnlyFromValue(responseBody) ?? localOnlyFromValue(record),
    durableWrites: hasDurableWrites(responseBody),
    rawRetentionRiskCount,
  };
}

function buildRouteStatus(
  record: FixtureRouteRecord,
): WorkspaceSessionApiFixtureRouteStatus {
  const status = routeStatus(record);
  const severity = severityForStatus(status);
  const matched = routeMatched(record);
  const title = record.title ?? titleFromRoute(record.method, record.routePath);
  const localOnlyKnown = record.localOnly !== undefined;
  const localOnly = record.localOnly === true;
  const rawRetentionRisk = record.rawRetentionRiskCount > 0;
  const detailLabels = [
    record.statusCode === undefined ? "HTTP status unknown" : `HTTP ${record.statusCode}`,
    record.expectedStatus === undefined
      ? undefined
      : `Expected HTTP ${record.expectedStatus}`,
    matched === undefined ? undefined : matched ? "Matched fixture" : "Fixture mismatch",
    localOnlyKnown ? (localOnly ? "Local only" : "External source") : "Local-only unknown",
    record.durableWrites ? "Durable writes enabled" : "0 durable writes",
    rawRetentionRisk
      ? formatCount(record.rawRetentionRiskCount, "raw retention flag")
      : "0 raw retention flags",
    "Raw bodies not retained",
    formatCount(record.redactionCount, "redaction"),
  ].filter(isDefined);

  return {
    id: `workspace_session_api_fixture.route.${sanitizeIdentifier(
      record.id,
      `route_${record.index + 1}`,
    )}`,
    routeId: record.id,
    index: record.index,
    label: `${record.method} ${record.routePath}`,
    title,
    method: record.method,
    routePath: record.routePath,
    status,
    statusLabel: statusLabel(status),
    severity,
    severityLabel: severityLabel(severity),
    ...(record.statusCode === undefined ? {} : { statusCode: record.statusCode }),
    ...(record.expectedStatus === undefined
      ? {}
      : { expectedStatus: record.expectedStatus }),
    ...(matched === undefined ? {} : { matched }),
    localOnly,
    localOnlyKnown,
    redacted: record.redactionCount > 0,
    redactionCount: record.redactionCount,
    durableWrites: record.durableWrites,
    rawRetentionRisk,
    rawRetentionRiskCount: record.rawRetentionRiskCount,
    detailLabels,
    ariaLabel: [
      title,
      `${record.method} ${record.routePath}`,
      statusLabel(status),
      ...detailLabels,
    ].join(", "),
  };
}

function buildPersistenceReadinessFromRoutes(
  routes: readonly WorkspaceSessionApiFixtureRouteStatus[],
  options: {
    status?: WorkspaceSessionApiStatus;
    redactionCount: number;
    expectedRouteCount?: number;
  },
): WorkspaceSessionApiFixturePersistenceReadiness {
  const routeCount = routes.length;
  const failedRouteCount = routes.filter(isFailedRoute).length;
  const successfulRouteCount = routes.filter(
    (route) => route.status === "success",
  ).length;
  const unknownLocalOnlyCount = routes.filter(
    (route) => !route.localOnlyKnown,
  ).length;
  const durableWriteCount = routes.filter((route) => route.durableWrites).length;
  const rawRetentionRiskCount = sum(routes, (route) => route.rawRetentionRiskCount);
  const localOnly =
    routeCount > 0 && routes.every((route) => route.localOnly && route.localOnlyKnown);
  const missingExpectedRoutes =
    options.expectedRouteCount === undefined
      ? 0
      : Math.max(options.expectedRouteCount - routeCount, 0);
  const status =
    options.status ??
    persistenceStatus({
      routeCount,
      failedRouteCount,
      localOnly,
      unknownLocalOnlyCount,
      durableWriteCount,
      rawRetentionRiskCount,
      missingExpectedRoutes,
    });
  const severity = severityForStatus(status);
  const label = persistenceLabel(status);
  const detailLabels = [
    formatCount(routeCount, "route"),
    formatCount(successfulRouteCount, "successful route"),
    formatCount(failedRouteCount, "failed route"),
    localOnly ? "Local only" : "Local-only review needed",
    formatCount(unknownLocalOnlyCount, "unknown local-only route"),
    formatCount(durableWriteCount, "durable write"),
    formatCount(rawRetentionRiskCount, "raw retention flag"),
    "0 raw bodies retained",
    formatCount(options.redactionCount, "redaction"),
  ];

  if (missingExpectedRoutes > 0) {
    detailLabels.push(formatCount(missingExpectedRoutes, "missing route"));
  }

  return {
    id: "workspace_session_api_fixture.persistence_readiness",
    status,
    statusLabel: statusLabel(status),
    severity,
    severityLabel: severityLabel(severity),
    ready: status === "ready",
    label,
    routeCount,
    successfulRouteCount,
    failedRouteCount,
    localOnly,
    unknownLocalOnlyCount,
    durableWriteCount,
    rawRetentionRiskCount,
    rawBodyRetained: false,
    redactionCount: options.redactionCount,
    detailLabels,
    ariaLabel: ["Local snapshot persistence", label, ...detailLabels].join(", "),
  };
}

function buildSummaryCards(input: {
  routeStatuses: readonly WorkspaceSessionApiFixtureRouteStatus[];
  persistenceReadiness: WorkspaceSessionApiFixturePersistenceReadiness;
  redactionCount: number;
}): WorkspaceSessionApiFixtureSummaryCard[] {
  const routeStatus = aggregateRouteStatus(input.routeStatuses);
  return [
    buildSummaryCard({
      id: "routes",
      label: "Route status",
      value: formatCount(input.routeStatuses.length, "route"),
      status: routeStatus,
      detailLabels: input.routeStatuses.map(
        (route) => `${route.label} ${route.statusLabel}`,
      ),
      redactionCount: sum(input.routeStatuses, (route) => route.redactionCount),
    }),
    buildSummaryCard({
      id: "persistence",
      label: "Persistence readiness",
      value: input.persistenceReadiness.label,
      status: input.persistenceReadiness.status,
      detailLabels: input.persistenceReadiness.detailLabels,
      redactionCount: input.persistenceReadiness.redactionCount,
    }),
    buildSummaryCard({
      id: "redactions",
      label: "Redactions",
      value: formatCount(input.redactionCount, "redaction"),
      status: input.redactionCount > 0 ? "attention" : "ready",
      detailLabels: [formatCount(input.redactionCount, "redaction")],
      redactionCount: input.redactionCount,
    }),
    buildSummaryCard({
      id: "body_retention",
      label: "Raw body retention",
      value: "Not retained",
      status: "ready",
      detailLabels: ["0 raw bodies retained", "UI state stores derived labels and counts"],
      redactionCount: 0,
    }),
  ];
}

function buildSummaryCard(input: {
  id: string;
  label: string;
  value: string;
  status: WorkspaceSessionApiStatus;
  detailLabels: readonly string[];
  redactionCount: number;
}): WorkspaceSessionApiFixtureSummaryCard {
  const severity = severityForStatus(input.status);
  return {
    id: `workspace_session_api_fixture.summary.${input.id}`,
    label: input.label,
    value: input.value,
    status: input.status,
    statusLabel: statusLabel(input.status),
    severity,
    severityLabel: severityLabel(severity),
    detailLabels: [...input.detailLabels],
    redactionCount: input.redactionCount,
    ariaLabel: [
      input.label,
      input.value,
      statusLabel(input.status),
      ...input.detailLabels,
    ].join(", "),
  };
}

function resolveFixtureStatus(input: {
  phase: WorkspaceSessionApiPhase;
  routeStatuses: readonly WorkspaceSessionApiFixtureRouteStatus[];
  persistenceReadiness: WorkspaceSessionApiFixturePersistenceReadiness;
  apiState: WorkspaceSessionApiState;
}): WorkspaceSessionApiStatus {
  if (input.phase === "loading") {
    return "loading";
  }
  if (
    input.phase === "error" ||
    input.routeStatuses.some((route) => route.status === "error")
  ) {
    return "error";
  }
  if (input.routeStatuses.length === 0) {
    return "empty";
  }
  if (input.persistenceReadiness.status === "blocked") {
    return "blocked";
  }
  if (input.persistenceReadiness.status === "attention") {
    return "attention";
  }
  if (
    input.apiState.status === "blocked" ||
    input.apiState.status === "attention"
  ) {
    return input.apiState.status;
  }
  return input.persistenceReadiness.status;
}

function aggregateRouteStatus(
  routes: readonly WorkspaceSessionApiFixtureRouteStatus[],
): WorkspaceSessionApiStatus {
  if (routes.length === 0) {
    return "empty";
  }
  if (routes.some((route) => route.status === "error")) {
    return "error";
  }
  if (routes.some((route) => route.status === "attention")) {
    return "attention";
  }
  return "success";
}

function routeStatus(record: FixtureRouteRecord): WorkspaceSessionApiStatus {
  const matched = routeMatched(record);
  if (
    matched === false ||
    (record.statusCode !== undefined && record.statusCode >= 400)
  ) {
    return "error";
  }
  if (
    record.statusCode !== undefined &&
    record.statusCode >= 200 &&
    record.statusCode < 300
  ) {
    return "success";
  }
  if (record.responseBody !== undefined) {
    return "success";
  }
  return "empty";
}

function routeMatched(record: FixtureRouteRecord): boolean | undefined {
  const matches = Object.values(record.matches);
  const statusMatches =
    record.statusCode === undefined || record.expectedStatus === undefined
      ? undefined
      : record.statusCode === record.expectedStatus;
  if (matches.some((value) => value === false) || statusMatches === false) {
    return false;
  }
  if (matches.some((value) => value === true) || statusMatches === true) {
    return true;
  }
  return undefined;
}

function isFailedRoute(route: WorkspaceSessionApiFixtureRouteStatus): boolean {
  return route.status === "error" || route.matched === false;
}

function persistenceStatus(input: {
  routeCount: number;
  failedRouteCount: number;
  localOnly: boolean;
  unknownLocalOnlyCount: number;
  durableWriteCount: number;
  rawRetentionRiskCount: number;
  missingExpectedRoutes: number;
}): WorkspaceSessionApiStatus {
  if (input.routeCount === 0) {
    return "empty";
  }
  if (
    input.failedRouteCount > 0 ||
    input.durableWriteCount > 0 ||
    input.rawRetentionRiskCount > 0 ||
    (!input.localOnly && input.unknownLocalOnlyCount === 0)
  ) {
    return "blocked";
  }
  if (input.unknownLocalOnlyCount > 0 || input.missingExpectedRoutes > 0) {
    return "attention";
  }
  return "ready";
}

function persistenceLabel(status: WorkspaceSessionApiStatus): string {
  switch (status) {
    case "loading":
      return "Loading";
    case "empty":
      return "No snapshot routes";
    case "ready":
      return "Ready for local snapshot";
    case "attention":
      return "Review snapshot readiness";
    case "blocked":
      return "Snapshot blocked";
    case "error":
      return "Snapshot error";
    case "success":
      return "Ready for local snapshot";
  }
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
      matches[key] = entry;
    }
  }
  return matches;
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
      token === "markers"
    ) {
      count += Array.isArray(entry) ? entry.length : countRedactions(entry);
      continue;
    }
    if (token === "fields" && Array.isArray(entry)) {
      count += entry.filter((item) => typeof item === "string").length;
      continue;
    }
    if (token === "replacement") {
      continue;
    }
    count += countRedactions(entry);
  }

  return count;
}

function countRecordRedactionFields(record: AnyRecord): number {
  return (
    countRedactions(record.redactions) +
    countRedactions(record.redactionMarkers) +
    countRedactions(record.redaction_markers) +
    countRedactions(record.markers)
  );
}

function countRedactionMarkers(value: string): number {
  const matches = value.match(/\[(?:redacted[^\]]*|REDACTED)\]/g);
  return matches === null ? 0 : matches.length;
}

function countRawRetentionRisks(value: unknown): number {
  if (value === undefined || value === null) {
    return 0;
  }
  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + countRawRetentionRisks(item), 0);
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
    count += countRawRetentionRisks(entry);
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
  if (value.durableWrites === true || value.durable_writes === true) {
    return true;
  }
  return Object.entries(value).some(([key, entry]) => {
    const token = normalizeToken(key);
    return token === "durable_writes" ? false : hasDurableWrites(entry);
  });
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

  const direct = booleanField(value, "localOnly", "local_only", "local");
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

function isWorkspaceSessionRouteBody(value: unknown): value is AnyRecord {
  if (!isRecord(value)) {
    return false;
  }
  const kind = stringField(value, "kind");
  return kind?.startsWith("workspace-session.") === true;
}

function inferRoutePath(value: unknown): string {
  if (isRecord(value)) {
    const kind = stringField(value, "kind");
    if (
      kind?.includes("audit-preview") === true ||
      isRecord(value.audit) ||
      Array.isArray(value.records) ||
      Array.isArray(value.events)
    ) {
      return DEFAULT_AUDIT_ROUTE;
    }
  }
  return DEFAULT_SUMMARY_ROUTE;
}

function titleFromRoute(method: string, routePath: string): string {
  const suffix = routePath
    .replace(/^\/+v\d+\//, "")
    .replace(/^workspace-session\/?/, "")
    .replace(/^\/+|\/+$/g, "");
  const label = suffix === "" ? "workspace session" : `workspace session ${suffix}`;
  return `${method} ${labelFromKey(label)}`;
}

function safeLabel(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const redacted = redactWorkspaceSessionText(value).replace(/\s+/g, " ").trim();
  return redacted === "" ? undefined : truncate(redacted, 96);
}

function statusLabel(status: WorkspaceSessionApiStatus): string {
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

function severityForStatus(
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

function booleanField(
  record: AnyRecord,
  ...keys: readonly string[]
): boolean | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
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

function sanitizeIdentifier(value: string, fallback: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return sanitized === "" ? fallback : sanitized;
}

function normalizeToken(value: string): string {
  return value
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function labelFromKey(value: string): string {
  return value
    .replace(/[_/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
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

function cloneFixtureState(
  state: WorkspaceSessionApiFixtureState,
): WorkspaceSessionApiFixtureState {
  return {
    ...state,
    routeStatuses: state.routeStatuses.map(cloneRouteStatus),
    persistenceReadiness: clonePersistenceReadiness(state.persistenceReadiness),
    summaryCards: state.summaryCards.map(cloneSummaryCard),
    apiState: clonePlain(state.apiState),
    errorStates: state.errorStates.map(cloneErrorState),
  };
}

function cloneRouteStatus(
  route: WorkspaceSessionApiFixtureRouteStatus,
): WorkspaceSessionApiFixtureRouteStatus {
  return {
    ...route,
    detailLabels: [...route.detailLabels],
  };
}

function clonePersistenceReadiness(
  readiness: WorkspaceSessionApiFixturePersistenceReadiness,
): WorkspaceSessionApiFixturePersistenceReadiness {
  return {
    ...readiness,
    detailLabels: [...readiness.detailLabels],
  };
}

function cloneSummaryCard(
  card: WorkspaceSessionApiFixtureSummaryCard,
): WorkspaceSessionApiFixtureSummaryCard {
  return {
    ...card,
    detailLabels: [...card.detailLabels],
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
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    cloned[key] = clonePlain(entry, seen);
  }
  return cloned as T;
}
