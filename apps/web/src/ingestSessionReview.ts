import {
  getIngestQuarantineDecisionLabel,
  type IngestDecisionLabel,
  type IngestQuarantineDecision,
  type IngestSearchEmptyState,
  type IngestSearchErrorState,
  type IngestSearchViewStatus,
} from "./ingestSearch.ts";

export type IngestSessionReviewContext =
  | "session"
  | "routes"
  | "sdk"
  | "quarantine"
  | "checksum";

export type IngestSessionRouteKind =
  | "sources"
  | "search"
  | "quarantine"
  | "decision"
  | "ingest"
  | "api";

export type IngestSessionSdkCallKind =
  | "source"
  | "search"
  | "quarantine"
  | "decision"
  | "sdk";

export interface BuildIngestSessionReviewOptions {
  auditEvidence?: unknown;
  defaultTimestamp?: string;
}

export interface IngestSessionReviewState {
  id: "ingest_session_review";
  schemaVersion?: string;
  workspaceId?: string;
  generatedAt: string;
  baseUrl?: string;
  localOnly: boolean;
  routeTimeline: IngestSessionRouteTimelineItem[];
  sdkCalls: IngestSessionSdkCallViewModel[];
  quarantineDecisionSummary: IngestSessionQuarantineDecisionSummary;
  checksumEvidence: IngestSessionChecksumEvidenceItem[];
  emptyStates: IngestSessionReviewEmptyStates;
  errorStates: IngestSessionReviewErrorState[];
}

export interface IngestSessionRouteTimelineItem {
  id: string;
  routeId: string;
  sequence: number;
  method: string;
  routePath: string;
  title: string;
  kind: IngestSessionRouteKind;
  kindLabel: string;
  status: IngestSearchViewStatus;
  statusLabel: string;
  timestamp: string;
  requestSummary: string;
  detailLabels: string[];
  ariaLabel: string;
}

export interface IngestSessionSdkCallViewModel {
  id: string;
  callId: string;
  entryPoint: string;
  label: string;
  kind: IngestSessionSdkCallKind;
  kindLabel: string;
  status: IngestSearchViewStatus;
  statusLabel: string;
  sourceCount: number;
  sourceLabels: string[];
  detailLabels: string[];
  ariaLabel: string;
}

export interface IngestSessionQuarantineDecisionSummary {
  id: "ingest_session_quarantine_decisions";
  label: string;
  status: IngestSearchViewStatus;
  statusLabel: string;
  totalCount: number;
  pendingCount: number;
  releaseCount: number;
  retryCount: number;
  discardCount: number;
  items: IngestSessionQuarantineDecisionItem[];
  emptyState: IngestSearchEmptyState;
  ariaLabel: string;
}

export interface IngestSessionQuarantineDecisionItem {
  id: string;
  itemId: string;
  sourceUri?: string;
  sourceLabel?: string;
  decision: IngestQuarantineDecision;
  decisionLabel: IngestDecisionLabel;
  status: IngestSearchViewStatus;
  routePath?: string;
  actorId?: string;
  reason?: string;
  decidedAt: string;
  detailLabels: string[];
  ariaLabel: string;
}

export interface IngestSessionChecksumEvidenceItem {
  id: string;
  evidenceId: string;
  sourceUri: string;
  sourceLabel: string;
  action: string;
  actionLabel: string;
  checksum?: string;
  checksumLabel: string;
  algorithm?: string;
  status: IngestSearchViewStatus;
  statusLabel: string;
  observedAt: string;
  documentsIndexed: number;
  quarantinedItems: number;
  detailLabels: string[];
  ariaLabel: string;
}

export interface IngestSessionReviewEmptyStates {
  routeTimeline: IngestSearchEmptyState;
  sdkCalls: IngestSearchEmptyState;
  quarantineDecisions: IngestSearchEmptyState;
  checksumEvidence: IngestSearchEmptyState;
}

export interface IngestSessionReviewErrorState {
  id: string;
  context: IngestSessionReviewContext;
  errorState: IngestSearchErrorState;
}

type AnyRecord = Record<string, unknown>;

interface NormalizedSession {
  root?: AnyRecord;
  schemaVersion?: string;
  workspaceId?: string;
  generatedAt: string;
  baseUrl?: string;
  localOnly: boolean;
  error?: string;
}

interface NormalizedRoute {
  id: string;
  sequence: number;
  method: string;
  routePath: string;
  timestamp: string;
  request?: AnyRecord;
}

interface NormalizedSdkCall {
  id: string;
  index: number;
  entryPoint: string;
  sourceUris: string[];
}

interface NormalizedDecision {
  itemId: string;
  sourceUri?: string;
  decision: IngestQuarantineDecision;
  routePath?: string;
  actorId?: string;
  reason?: string;
  decidedAt: string;
}

interface NormalizedChecksumEvidence {
  id: string;
  sourceUri: string;
  action: string;
  checksum?: string;
  algorithm?: string;
  observedAt: string;
  documentsIndexed: number;
  quarantinedItems: number;
}

const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";

export function buildIngestSessionReview(
  input: unknown,
  options: BuildIngestSessionReviewOptions = {},
): IngestSessionReviewState {
  const session = normalizeSession(input, options.defaultTimestamp);
  const routeTimeline = session.root
    ? collectIngestSessionRouteTimeline(session.root, {
        defaultTimestamp: session.generatedAt,
      })
    : [];
  const sdkCalls = session.root ? collectIngestSessionSdkCalls(session.root) : [];
  const quarantineDecisionSummary = session.root
    ? buildIngestSessionQuarantineDecisionSummary(session.root, {
        defaultTimestamp: session.generatedAt,
        auditEvidence: options.auditEvidence,
      })
    : buildIngestSessionQuarantineDecisionSummary(undefined, {
        defaultTimestamp: session.generatedAt,
      });
  const checksumEvidence = collectIngestSessionChecksumEvidence(
    options.auditEvidence,
    {
      defaultTimestamp: session.generatedAt,
    },
  );
  const errorStates: IngestSessionReviewErrorState[] = [];

  if (session.error !== undefined) {
    errorStates.push(buildIngestSessionReviewErrorState("session", session.error));
  }
  if (options.auditEvidence !== undefined && !isAuditEvidenceLike(options.auditEvidence)) {
    errorStates.push(
      buildIngestSessionReviewErrorState(
        "checksum",
        "Checksum evidence must be an object or an array.",
      ),
    );
  }

  const state: IngestSessionReviewState = {
    id: "ingest_session_review",
    generatedAt: session.generatedAt,
    localOnly: session.localOnly,
    routeTimeline,
    sdkCalls,
    quarantineDecisionSummary,
    checksumEvidence,
    emptyStates: {
      routeTimeline: buildIngestSessionReviewEmptyState("routes"),
      sdkCalls: buildIngestSessionReviewEmptyState("sdk"),
      quarantineDecisions: buildIngestSessionReviewEmptyState("quarantine"),
      checksumEvidence: buildIngestSessionReviewEmptyState("checksum"),
    },
    errorStates: errorStates.map((error) => clonePlain(error)),
  };

  if (session.schemaVersion !== undefined) {
    state.schemaVersion = session.schemaVersion;
  }
  if (session.workspaceId !== undefined) {
    state.workspaceId = session.workspaceId;
  }
  if (session.baseUrl !== undefined) {
    state.baseUrl = session.baseUrl;
  }

  return cloneSessionReviewState(state);
}

export function collectIngestSessionRouteTimeline(
  input: unknown,
  options: Pick<BuildIngestSessionReviewOptions, "defaultTimestamp"> = {},
): IngestSessionRouteTimelineItem[] {
  const root = clonePlain(input);
  if (!isRecord(root)) {
    return [];
  }

  const fallbackTimestamp = normalizeDefaultTimestamp(
    options.defaultTimestamp ??
      timestampField(root, "generatedAt", "generated_at"),
  );

  return normalizeRoutes(root, fallbackTimestamp)
    .map(buildRouteTimelineItem)
    .sort(compareRouteTimelineItems)
    .map(cloneRouteTimelineItem);
}

export function collectIngestSessionSdkCalls(
  input: unknown,
): IngestSessionSdkCallViewModel[] {
  const root = clonePlain(input);
  if (!isRecord(root)) {
    return [];
  }

  return normalizeSdkCalls(root)
    .map(buildSdkCallViewModel)
    .sort(compareSdkCalls)
    .map(cloneSdkCall);
}

export function buildIngestSessionQuarantineDecisionSummary(
  input: unknown,
  options: BuildIngestSessionReviewOptions = {},
): IngestSessionQuarantineDecisionSummary {
  const root = clonePlain(input);
  const fallbackTimestamp = normalizeDefaultTimestamp(
    options.defaultTimestamp ??
      (isRecord(root)
        ? timestampField(root, "generatedAt", "generated_at")
        : undefined),
  );
  const items = isRecord(root)
    ? collectQuarantineDecisionItems(root, fallbackTimestamp, options.auditEvidence)
    : [];
  const pendingCount = items.filter((item) => item.decision === "pending").length;
  const releaseCount = items.filter((item) => item.decision === "release").length;
  const retryCount = items.filter((item) => item.decision === "retry").length;
  const discardCount = items.filter((item) => item.decision === "discard").length;
  const status: IngestSearchViewStatus =
    pendingCount > 0 ? "attention" : items.length > 0 ? "complete" : "empty";

  return {
    id: "ingest_session_quarantine_decisions",
    label: "Quarantine decisions",
    status,
    statusLabel: statusLabel(status),
    totalCount: items.length,
    pendingCount,
    releaseCount,
    retryCount,
    discardCount,
    items: items.map(cloneDecisionItem),
    emptyState: buildIngestSessionReviewEmptyState("quarantine"),
    ariaLabel: [
      "Quarantine decisions",
      formatCount(items.length, "item"),
      formatCount(pendingCount, "pending item"),
      formatCount(releaseCount, "release decision"),
      formatCount(retryCount, "retry decision"),
      formatCount(discardCount, "discard decision"),
    ].join(", "),
  };
}

export function collectIngestSessionChecksumEvidence(
  input: unknown,
  options: Pick<BuildIngestSessionReviewOptions, "defaultTimestamp"> = {},
): IngestSessionChecksumEvidenceItem[] {
  const fallbackTimestamp = normalizeDefaultTimestamp(options.defaultTimestamp);

  return normalizeChecksumEvidence(input, fallbackTimestamp)
    .map(buildChecksumEvidenceItem)
    .sort(compareChecksumEvidence)
    .map(cloneChecksumEvidenceItem);
}

export function buildIngestSessionReviewEmptyState(
  context: Exclude<IngestSessionReviewContext, "session">,
): IngestSearchEmptyState {
  switch (context) {
    case "routes":
      return {
        id: "ingest_session_routes_empty",
        label: "No client routes captured",
        description: "Client route calls will appear after a session is captured.",
        ariaLabel: "No ingest client routes are available",
      };
    case "sdk":
      return {
        id: "ingest_session_sdk_empty",
        label: "No SDK calls captured",
        description: "SDK helper calls will appear after a session is captured.",
        ariaLabel: "No ingest SDK calls are available",
      };
    case "quarantine":
      return {
        id: "ingest_session_quarantine_empty",
        label: "No quarantine decisions",
        description: "Decision payloads will appear here when queue items are reviewed.",
        ariaLabel: "No ingest quarantine decisions are available",
      };
    case "checksum":
      return {
        id: "ingest_session_checksum_empty",
        label: "No checksum evidence",
        description: "Checksum records will appear when audit evidence is attached.",
        ariaLabel: "No ingest checksum evidence is available",
      };
  }
}

export function buildIngestSessionReviewErrorState(
  context: IngestSessionReviewContext,
  error: unknown,
): IngestSessionReviewErrorState {
  const description = errorMessage(error) ?? defaultErrorDescription(context);

  return {
    id: `ingest_session_${context}_error`,
    context,
    errorState: {
      id: `ingest_session_${context}_error`,
      label: errorLabel(context),
      description,
      ariaLabel: errorLabel(context),
      retryLabel: retryLabel(context),
    },
  };
}

function normalizeSession(
  input: unknown,
  defaultTimestamp: string | undefined,
): NormalizedSession {
  const root = clonePlain(input);
  const fallbackTimestamp = normalizeDefaultTimestamp(defaultTimestamp);

  if (!isRecord(root)) {
    return {
      generatedAt: fallbackTimestamp,
      localOnly: false,
      error: "Session data must be an object.",
    };
  }

  const generatedAt = normalizeDefaultTimestamp(
    timestampField(root, "generatedAt", "generated_at") ?? fallbackTimestamp,
  );

  return {
    root,
    schemaVersion: stringField(root, "schemaVersion", "schema_version"),
    workspaceId: stringField(root, "workspaceId", "workspace_id"),
    generatedAt,
    baseUrl: stringField(root, "baseUrl", "base_url"),
    localOnly: booleanField(root, "localOnly", "local_only") ?? false,
  };
}

function normalizeRoutes(
  root: AnyRecord,
  fallbackTimestamp: string,
): NormalizedRoute[] {
  const api = recordField(root, "api");
  const routeValues = [
    ...arrayField(api ?? {}, "routes"),
    ...arrayField(root, "routes"),
  ];

  return routeValues
    .map((value, index) => normalizeRoute(value, index, fallbackTimestamp))
    .filter(isDefined);
}

function normalizeRoute(
  value: unknown,
  index: number,
  fallbackTimestamp: string,
): NormalizedRoute | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const route = recordField(value, "route");
  const method =
    stringField(value, "method") ?? stringField(route ?? {}, "method") ?? "GET";
  const routePath =
    stringField(value, "routePath", "route_path", "path") ??
    stringField(route ?? {}, "routePath", "route_path", "path") ??
    "/";
  const request = normalizeRequest(value);
  const id =
    stringField(value, "id") ??
    stableId("route", `${index}:${method}:${routePath}:${JSON.stringify(request ?? {})}`);

  return {
    id,
    sequence: integerField(value, "sequence", "index", "order") ?? index + 1,
    method: method.toUpperCase(),
    routePath,
    timestamp:
      timestampField(value, "timestamp", "at", "createdAt", "created_at") ??
      fallbackTimestamp,
    request,
  };
}

function normalizeRequest(route: AnyRecord): AnyRecord | undefined {
  const request = route.request;
  if (isRecord(request)) {
    const body = recordField(request, "body");
    return body ?? request;
  }

  const requestBody = recordField(route, "requestBody") ?? recordField(route, "body");
  return requestBody;
}

function buildRouteTimelineItem(
  route: NormalizedRoute,
): IngestSessionRouteTimelineItem {
  const kind = deriveRouteKind(route);
  const status = routeStatus(kind, route.method);
  const requestSummary = summarizeRequest(route.request);
  const detailLabels = [
    routeKindLabel(kind),
    requestSummary,
    `Captured at ${route.timestamp}`,
  ];

  return {
    id: `ingest_session_route.${route.id}`,
    routeId: route.id,
    sequence: route.sequence,
    method: route.method,
    routePath: route.routePath,
    title: `${route.method} ${route.routePath}`,
    kind,
    kindLabel: routeKindLabel(kind),
    status,
    statusLabel: statusLabel(status),
    timestamp: route.timestamp,
    requestSummary,
    detailLabels,
    ariaLabel: [
      `${route.method} ${route.routePath}`,
      routeKindLabel(kind),
      statusLabel(status),
      requestSummary,
    ].join(", "),
  };
}

function normalizeSdkCalls(root: AnyRecord): NormalizedSdkCall[] {
  const sdk = recordField(root, "sdk");
  const sourceUris = uniqueStrings([
    ...stringArrayField(sdk ?? {}, "sourceUris", "source_uris"),
    ...stringArrayField(root, "sourceUris", "source_uris"),
  ]);
  const entryPoints = [
    ...arrayField(sdk ?? {}, "entryPoints", "entry_points"),
    ...arrayField(root, "entryPoints", "entry_points"),
  ];

  return entryPoints
    .map((value, index) => normalizeSdkCall(value, index, sourceUris))
    .filter(isDefined);
}

function normalizeSdkCall(
  value: unknown,
  index: number,
  fallbackSourceUris: readonly string[],
): NormalizedSdkCall | undefined {
  if (typeof value === "string" && value.trim() !== "") {
    const entryPoint = value.trim();
    return {
      id: sanitizeIdentifier(entryPoint, `sdk_call_${index + 1}`),
      index,
      entryPoint,
      sourceUris: [...fallbackSourceUris],
    };
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const entryPoint =
    stringField(value, "entryPoint", "entry_point", "name", "functionName") ??
    stringField(value, "call");
  if (entryPoint === undefined) {
    return undefined;
  }

  const sourceUris = uniqueStrings([
    ...stringArrayField(value, "sourceUris", "source_uris"),
    ...fallbackSourceUris,
  ]);

  return {
    id:
      stringField(value, "id") ??
      sanitizeIdentifier(entryPoint, `sdk_call_${index + 1}`),
    index,
    entryPoint,
    sourceUris,
  };
}

function buildSdkCallViewModel(
  call: NormalizedSdkCall,
): IngestSessionSdkCallViewModel {
  const kind = deriveSdkCallKind(call.entryPoint);
  const status = sdkCallStatus(kind);
  const sourceLabels = call.sourceUris.map(labelFromSourceUri).sort();
  const detailLabels = [
    sdkCallKindLabel(kind),
    formatCount(call.sourceUris.length, "source URI"),
  ];

  if (sourceLabels.length > 0) {
    detailLabels.push(`Sources: ${sourceLabels.join(", ")}`);
  }

  return {
    id: `ingest_session_sdk.${call.id}`,
    callId: call.id,
    entryPoint: call.entryPoint,
    label: titleCaseToken(call.entryPoint),
    kind,
    kindLabel: sdkCallKindLabel(kind),
    status,
    statusLabel: statusLabel(status),
    sourceCount: call.sourceUris.length,
    sourceLabels,
    detailLabels,
    ariaLabel: [
      titleCaseToken(call.entryPoint),
      sdkCallKindLabel(kind),
      statusLabel(status),
      formatCount(call.sourceUris.length, "source URI"),
    ].join(", "),
  };
}

function collectQuarantineDecisionItems(
  root: AnyRecord,
  fallbackTimestamp: string,
  auditEvidence: unknown,
): IngestSessionQuarantineDecisionItem[] {
  const decisions = new Map<string, IngestSessionQuarantineDecisionItem>();
  const rawDecisions = [
    ...normalizeWebQueueDecisions(root, fallbackTimestamp),
    ...normalizeRouteDecisions(root, fallbackTimestamp),
    ...normalizeAuditDecisions(auditEvidence, fallbackTimestamp),
  ];

  for (const decision of rawDecisions) {
    const item = buildDecisionItem(decision);
    const existing = decisions.get(item.itemId);
    decisions.set(
      item.itemId,
      existing === undefined ? item : mergeDecisionItems(existing, item),
    );
  }

  return [...decisions.values()]
    .sort(compareDecisionItems)
    .map(cloneDecisionItem);
}

function normalizeWebQueueDecisions(
  root: AnyRecord,
  fallbackTimestamp: string,
): NormalizedDecision[] {
  const web = recordField(root, "web");
  const queue = recordField(web, "quarantineQueue") ??
    recordField(web, "quarantine_queue") ??
    recordField(root, "quarantineQueue") ??
    recordField(root, "quarantine_queue");

  return arrayField(queue ?? {}, "items")
    .map((value, index) => {
      if (!isRecord(value)) {
        return undefined;
      }

      const itemId =
        stringField(value, "itemId", "item_id", "id") ??
        stableId("quarantine_item", JSON.stringify(value));
      return {
        itemId,
        sourceUri: sourceUriFromRecord(value),
        decision:
          normalizeDecisionValue(stringField(value, "decision", "state")) ??
          "pending",
        actorId: stringField(value, "actorId", "actor_id", "decidedBy", "decided_by"),
        reason: stringField(value, "reason", "decisionReason", "decision_reason"),
        decidedAt:
          timestampField(value, "decidedAt", "decided_at", "timestamp", "at") ??
          offsetTimestamp(fallbackTimestamp, index),
      };
    })
    .filter(isDefined);
}

function normalizeRouteDecisions(
  root: AnyRecord,
  fallbackTimestamp: string,
): NormalizedDecision[] {
  return normalizeRoutes(root, fallbackTimestamp)
    .map((route, index) => {
      const routeItemId = quarantineItemIdFromDecisionRoute(route.routePath);
      const requestDecision = route.request
        ? normalizeDecisionValue(stringField(route.request, "decision", "action"))
        : undefined;

      if (routeItemId === undefined && requestDecision === undefined) {
        return undefined;
      }

      const itemId =
        routeItemId ??
        stringField(route.request ?? {}, "itemId", "item_id", "id") ??
        stableId("quarantine_item", `${route.routePath}:${index}`);

      return {
        itemId,
        sourceUri: route.request ? sourceUriFromRecord(route.request) : undefined,
        decision: requestDecision ?? "pending",
        routePath: route.routePath,
        actorId: stringField(route.request ?? {}, "actorId", "actor_id", "decidedBy"),
        reason: stringField(route.request ?? {}, "reason", "decisionReason"),
        decidedAt: route.timestamp,
      };
    })
    .filter(isDefined);
}

function normalizeAuditDecisions(
  input: unknown,
  fallbackTimestamp: string,
): NormalizedDecision[] {
  if (!isAuditEvidenceLike(input)) {
    return [];
  }

  const root = clonePlain(input);
  const rawValues = Array.isArray(root)
    ? root
    : isRecord(root)
      ? [
          ...arrayField(root, "quarantineDecisions", "quarantine_decisions"),
          ...arrayField(root, "decisions"),
        ]
      : [];

  return rawValues
    .map((value, index) => {
      if (!isRecord(value)) {
        return undefined;
      }

      const decision = normalizeDecisionValue(
        stringField(value, "decision", "action", "state"),
      );
      const itemId =
        stringField(value, "itemId", "item_id", "id", "caseId", "case_id") ??
        stableId("quarantine_item", JSON.stringify(value));

      if (decision === undefined) {
        return undefined;
      }

      return {
        itemId,
        sourceUri: sourceUriFromRecord(value),
        decision,
        actorId: stringField(value, "actorId", "actor_id", "decidedBy", "decided_by"),
        reason: stringField(value, "reason", "decisionReason", "decision_reason"),
        decidedAt:
          timestampField(value, "decidedAt", "decided_at", "timestamp", "at") ??
          offsetTimestamp(fallbackTimestamp, index),
      };
    })
    .filter(isDefined);
}

function buildDecisionItem(
  decision: NormalizedDecision,
): IngestSessionQuarantineDecisionItem {
  const decisionLabel = getIngestQuarantineDecisionLabel(decision.decision);
  const detailLabels = [
    decisionLabel.label,
    `Decided at ${decision.decidedAt}`,
    decision.routePath ? `Route ${decision.routePath}` : undefined,
    decision.actorId ? `Actor ${decision.actorId}` : undefined,
    decision.reason,
  ].filter(isDefined);
  const item: IngestSessionQuarantineDecisionItem = {
    id: `ingest_session_quarantine.${sanitizeIdentifier(decision.itemId, "item")}`,
    itemId: decision.itemId,
    decision: decision.decision,
    decisionLabel,
    status: decisionLabel.status,
    decidedAt: decision.decidedAt,
    detailLabels,
    ariaLabel: [
      decision.itemId,
      decisionLabel.label,
      decision.sourceUri ? `from ${labelFromSourceUri(decision.sourceUri)}` : undefined,
    ]
      .filter(isDefined)
      .join(", "),
  };

  if (decision.sourceUri !== undefined) {
    item.sourceUri = decision.sourceUri;
    item.sourceLabel = labelFromSourceUri(decision.sourceUri);
  }
  if (decision.routePath !== undefined) {
    item.routePath = decision.routePath;
  }
  if (decision.actorId !== undefined) {
    item.actorId = decision.actorId;
  }
  if (decision.reason !== undefined) {
    item.reason = decision.reason;
  }

  return item;
}

function normalizeChecksumEvidence(
  input: unknown,
  fallbackTimestamp: string,
): NormalizedChecksumEvidence[] {
  if (!isAuditEvidenceLike(input)) {
    return [];
  }

  const root = clonePlain(input);
  const rawValues = Array.isArray(root)
    ? root
    : isRecord(root)
      ? [
          ...arrayField(root, "entries"),
          ...arrayField(root, "checksumEvidence", "checksum_evidence"),
          ...arrayField(root, "checksums"),
          ...arrayField(root, "auditEvidence", "audit_evidence"),
          ...(hasChecksumShape(root) ? [root] : []),
        ]
      : [];

  return rawValues
    .map((value, index) => normalizeChecksumEvidenceItem(value, index, fallbackTimestamp))
    .filter(isDefined);
}

function normalizeChecksumEvidenceItem(
  value: unknown,
  index: number,
  fallbackTimestamp: string,
): NormalizedChecksumEvidence | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const sourceUri = sourceUriFromRecord(value);
  if (sourceUri === undefined) {
    return undefined;
  }

  const checksum = stringField(value, "checksum", "digest", "hash");
  return {
    id:
      stringField(value, "id", "evidenceId", "evidence_id") ??
      stableId("checksum", `${sourceUri}:${checksum ?? "missing"}:${index}`),
    sourceUri,
    action: stringField(value, "action", "event", "kind") ?? "recorded",
    checksum,
    algorithm: stringField(
      value,
      "algorithm",
      "checksumAlgorithm",
      "checksum_algorithm",
      "hashAlgorithm",
      "hash_algorithm",
    ),
    observedAt:
      timestampField(value, "at", "timestamp", "observedAt", "observed_at", "createdAt", "created_at") ??
      offsetTimestamp(fallbackTimestamp, index),
    documentsIndexed: countField(value, "documentsIndexed", "documents_indexed", "indexedCount", "indexed_count"),
    quarantinedItems: countField(value, "quarantinedItems", "quarantined_items", "quarantineCount", "quarantine_count"),
  };
}

function buildChecksumEvidenceItem(
  evidence: NormalizedChecksumEvidence,
): IngestSessionChecksumEvidenceItem {
  const status = checksumStatus(evidence);
  const algorithm = evidence.algorithm ?? inferChecksumAlgorithm(evidence.checksum);
  const detailLabels = [
    `Action ${titleCaseToken(evidence.action)}`,
    `Observed at ${evidence.observedAt}`,
    formatCount(evidence.documentsIndexed, "indexed document"),
    formatCount(evidence.quarantinedItems, "quarantined item"),
  ];

  if (algorithm !== undefined) {
    detailLabels.unshift(algorithm.toUpperCase());
  }

  const item: IngestSessionChecksumEvidenceItem = {
    id: `ingest_session_checksum.${sanitizeIdentifier(evidence.id, "checksum")}`,
    evidenceId: evidence.id,
    sourceUri: evidence.sourceUri,
    sourceLabel: labelFromSourceUri(evidence.sourceUri),
    action: evidence.action,
    actionLabel: titleCaseToken(evidence.action),
    checksum: evidence.checksum,
    checksumLabel: checksumLabel(evidence.checksum),
    algorithm,
    status,
    statusLabel: checksumStatusLabel(status, evidence.checksum),
    observedAt: evidence.observedAt,
    documentsIndexed: evidence.documentsIndexed,
    quarantinedItems: evidence.quarantinedItems,
    detailLabels,
    ariaLabel: [
      labelFromSourceUri(evidence.sourceUri),
      checksumStatusLabel(status, evidence.checksum),
      checksumLabel(evidence.checksum),
      formatCount(evidence.documentsIndexed, "indexed document"),
      formatCount(evidence.quarantinedItems, "quarantined item"),
    ].join(", "),
  };

  return item;
}

function deriveRouteKind(route: NormalizedRoute): IngestSessionRouteKind {
  const path = route.routePath.toLowerCase();
  if (path.includes("/quarantine/") && path.endsWith("/decision")) {
    return "decision";
  }
  if (path.includes("/quarantine")) {
    return "quarantine";
  }
  if (path.includes("/search")) {
    return "search";
  }
  if (path.includes("/sources")) {
    return "sources";
  }
  if (path.includes("/ingest")) {
    return "ingest";
  }
  return "api";
}

function routeStatus(
  kind: IngestSessionRouteKind,
  method: string,
): IngestSearchViewStatus {
  if (kind === "decision") {
    return "complete";
  }
  if (kind === "quarantine") {
    return "attention";
  }
  if (kind === "ingest" && method !== "GET") {
    return "indexing";
  }
  return "ready";
}

function deriveSdkCallKind(entryPoint: string): IngestSessionSdkCallKind {
  const normalized = normalizeToken(entryPoint);
  if (normalized.includes("decision")) {
    return "decision";
  }
  if (normalized.includes("quarantine")) {
    return "quarantine";
  }
  if (normalized.includes("search")) {
    return "search";
  }
  if (normalized.includes("source") || normalized.includes("normalize")) {
    return "source";
  }
  return "sdk";
}

function sdkCallStatus(kind: IngestSessionSdkCallKind): IngestSearchViewStatus {
  switch (kind) {
    case "decision":
      return "complete";
    case "quarantine":
      return "attention";
    case "source":
    case "search":
    case "sdk":
      return "ready";
  }
}

function normalizeDecisionValue(
  value: string | undefined,
): IngestQuarantineDecision | undefined {
  const normalized = normalizeToken(value);
  if (normalized === "" || normalized === "open" || normalized === "pending") {
    return normalized === "" ? undefined : "pending";
  }
  if (normalized.includes("release") || normalized.includes("approve")) {
    return "release";
  }
  if (normalized.includes("retry")) {
    return "retry";
  }
  if (
    normalized.includes("discard") ||
    normalized.includes("reject") ||
    normalized.includes("rejected")
  ) {
    return "discard";
  }
  return undefined;
}

function quarantineItemIdFromDecisionRoute(routePath: string): string | undefined {
  const match = routePath.match(/\/quarantine\/([^/]+)\/decision(?:\/)?$/i);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function checksumStatus(
  evidence: NormalizedChecksumEvidence,
): IngestSearchViewStatus {
  if (evidence.checksum === undefined) {
    return "error";
  }
  if (evidence.quarantinedItems > 0) {
    return "attention";
  }
  return "ready";
}

function mergeDecisionItems(
  existing: IngestSessionQuarantineDecisionItem,
  next: IngestSessionQuarantineDecisionItem,
): IngestSessionQuarantineDecisionItem {
  if (existing.decision === "pending" && next.decision !== "pending") {
    return cloneDecisionItem({
      ...existing,
      ...next,
      sourceUri: next.sourceUri ?? existing.sourceUri,
      sourceLabel: next.sourceLabel ?? existing.sourceLabel,
      detailLabels: uniqueStrings([...existing.detailLabels, ...next.detailLabels]),
    });
  }

  return cloneDecisionItem({
    ...next,
    ...existing,
    sourceUri: existing.sourceUri ?? next.sourceUri,
    sourceLabel: existing.sourceLabel ?? next.sourceLabel,
    detailLabels: uniqueStrings([...existing.detailLabels, ...next.detailLabels]),
  });
}

function compareRouteTimelineItems(
  left: IngestSessionRouteTimelineItem,
  right: IngestSessionRouteTimelineItem,
): number {
  return (
    left.sequence - right.sequence ||
    compareTimestamps(left.timestamp, right.timestamp) ||
    left.method.localeCompare(right.method) ||
    left.routePath.localeCompare(right.routePath) ||
    left.routeId.localeCompare(right.routeId)
  );
}

function compareSdkCalls(
  left: IngestSessionSdkCallViewModel,
  right: IngestSessionSdkCallViewModel,
): number {
  return (
    sdkKindRank(left.kind) - sdkKindRank(right.kind) ||
    left.label.localeCompare(right.label) ||
    left.entryPoint.localeCompare(right.entryPoint) ||
    left.callId.localeCompare(right.callId)
  );
}

function compareDecisionItems(
  left: IngestSessionQuarantineDecisionItem,
  right: IngestSessionQuarantineDecisionItem,
): number {
  return (
    decisionRank(left.decision) - decisionRank(right.decision) ||
    compareTimestamps(left.decidedAt, right.decidedAt) ||
    left.itemId.localeCompare(right.itemId)
  );
}

function compareChecksumEvidence(
  left: IngestSessionChecksumEvidenceItem,
  right: IngestSessionChecksumEvidenceItem,
): number {
  return (
    checksumStatusRank(left.status) - checksumStatusRank(right.status) ||
    compareTimestamps(left.observedAt, right.observedAt) ||
    left.sourceLabel.localeCompare(right.sourceLabel) ||
    left.evidenceId.localeCompare(right.evidenceId)
  );
}

function sdkKindRank(kind: IngestSessionSdkCallKind): number {
  switch (kind) {
    case "source":
      return 0;
    case "search":
      return 1;
    case "quarantine":
      return 2;
    case "decision":
      return 3;
    case "sdk":
      return 4;
  }
}

function decisionRank(decision: IngestQuarantineDecision): number {
  switch (decision) {
    case "pending":
      return 0;
    case "retry":
      return 1;
    case "release":
      return 2;
    case "discard":
      return 3;
  }
}

function checksumStatusRank(status: IngestSearchViewStatus): number {
  switch (status) {
    case "error":
      return 0;
    case "attention":
      return 1;
    case "ready":
      return 2;
    case "complete":
      return 3;
    case "indexing":
      return 4;
    case "empty":
      return 5;
  }
}

function routeKindLabel(kind: IngestSessionRouteKind): string {
  switch (kind) {
    case "sources":
      return "Sources route";
    case "search":
      return "Search route";
    case "quarantine":
      return "Quarantine route";
    case "decision":
      return "Decision route";
    case "ingest":
      return "Ingest route";
    case "api":
      return "API route";
  }
}

function sdkCallKindLabel(kind: IngestSessionSdkCallKind): string {
  switch (kind) {
    case "source":
      return "Source helper";
    case "search":
      return "Search helper";
    case "quarantine":
      return "Quarantine helper";
    case "decision":
      return "Decision helper";
    case "sdk":
      return "SDK helper";
  }
}

function statusLabel(status: IngestSearchViewStatus): string {
  switch (status) {
    case "empty":
      return "Empty";
    case "ready":
      return "Ready";
    case "indexing":
      return "Indexing";
    case "attention":
      return "Needs attention";
    case "error":
      return "Error";
    case "complete":
      return "Complete";
  }
}

function checksumStatusLabel(
  status: IngestSearchViewStatus,
  checksum: string | undefined,
): string {
  if (checksum === undefined) {
    return "Checksum missing";
  }
  if (status === "attention") {
    return "Checksum recorded with quarantined items";
  }
  return "Checksum recorded";
}

function summarizeRequest(request: AnyRecord | undefined): string {
  if (request === undefined || Object.keys(request).length === 0) {
    return "No request payload";
  }

  const decision = stringField(request, "decision", "action");
  if (decision !== undefined) {
    return `Decision ${titleCaseToken(decision)}`;
  }

  const query = stringField(request, "query");
  if (query !== undefined) {
    const sourceCount = arrayField(request, "sourceIds", "source_ids").length;
    const limit = integerField(request, "limit");
    return [
      `Query "${query}"`,
      sourceCount > 0 ? formatCount(sourceCount, "source filter") : undefined,
      limit !== undefined ? `limit ${limit}` : undefined,
    ]
      .filter(isDefined)
      .join(", ");
  }

  return formatCount(Object.keys(request).length, "request field");
}

function sourceUriFromRecord(record: AnyRecord): string | undefined {
  const citation = recordField(record, "citation");
  return (
    stringField(record, "sourceUri", "source_uri", "uri", "path") ??
    (citation ? stringField(citation, "sourceUri", "source_uri") : undefined)
  );
}

function labelFromSourceUri(sourceUri: string): string {
  const normalized = sourceUri.trim();
  const withoutQuery = normalized.split(/[?#]/, 1)[0];
  const slashIndex = withoutQuery.lastIndexOf("/");
  const tail = slashIndex === -1 ? withoutQuery : withoutQuery.slice(slashIndex + 1);
  return tail === "" ? normalized : tail;
}

function hasChecksumShape(record: AnyRecord): boolean {
  return (
    sourceUriFromRecord(record) !== undefined &&
    (stringField(record, "checksum", "digest", "hash") !== undefined ||
      stringField(record, "action", "event", "kind") !== undefined)
  );
}

function isAuditEvidenceLike(input: unknown): boolean {
  return input === undefined || Array.isArray(input) || isRecord(input);
}

function inferChecksumAlgorithm(checksum: string | undefined): string | undefined {
  if (checksum === undefined) {
    return undefined;
  }
  if (/^[a-f0-9]{64}$/i.test(checksum)) {
    return "sha256";
  }
  return undefined;
}

function checksumLabel(checksum: string | undefined): string {
  if (checksum === undefined) {
    return "Missing checksum";
  }

  const normalized = checksum.trim();
  return normalized.length <= 24
    ? normalized
    : `${normalized.slice(0, 12)}...${normalized.slice(-8)}`;
}

function errorLabel(context: IngestSessionReviewContext): string {
  switch (context) {
    case "session":
      return "Session could not load";
    case "routes":
      return "Route timeline could not load";
    case "sdk":
      return "SDK calls could not load";
    case "quarantine":
      return "Quarantine decisions could not load";
    case "checksum":
      return "Checksum evidence could not load";
  }
}

function retryLabel(context: IngestSessionReviewContext): string {
  switch (context) {
    case "session":
      return "Retry session";
    case "routes":
      return "Retry routes";
    case "sdk":
      return "Retry SDK calls";
    case "quarantine":
      return "Retry decisions";
    case "checksum":
      return "Retry checksum evidence";
  }
}

function defaultErrorDescription(context: IngestSessionReviewContext): string {
  switch (context) {
    case "session":
      return "Load a client session JSON file and try again.";
    case "routes":
      return "Refresh the route timeline and try again.";
    case "sdk":
      return "Refresh the SDK call list and try again.";
    case "quarantine":
      return "Refresh quarantine decisions and try again.";
    case "checksum":
      return "Attach audit evidence and try again.";
  }
}

function errorMessage(error: unknown): string | undefined {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }
  if (typeof error === "string" && error.trim() !== "") {
    return error.trim();
  }
  return undefined;
}

function titleCaseToken(value: string): string {
  const words = value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);

  if (words.length === 0) {
    return "Ingest item";
  }

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function stringField(
  record: AnyRecord,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return undefined;
}

function booleanField(
  record: AnyRecord,
  ...keys: string[]
): boolean | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
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
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.trunc(value);
    }
  }
  return undefined;
}

function countField(record: AnyRecord, ...keys: string[]): number {
  return Math.max(integerField(record, ...keys) ?? 0, 0);
}

function timestampField(
  record: AnyRecord,
  ...keys: string[]
): string | undefined {
  const value = stringField(record, ...keys);
  return value !== undefined && !Number.isNaN(Date.parse(value))
    ? value
    : undefined;
}

function arrayField(record: AnyRecord, ...keys: string[]): unknown[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function stringArrayField(record: AnyRecord, ...keys: string[]): string[] {
  return arrayField(record, ...keys).filter(
    (value): value is string => typeof value === "string" && value.trim() !== "",
  ).map((value) => value.trim());
}

function recordField(
  record: AnyRecord | undefined,
  key: string,
): AnyRecord | undefined {
  const value = record?.[key];
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is AnyRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function normalizeDefaultTimestamp(value: string | undefined): string {
  return value !== undefined && !Number.isNaN(Date.parse(value))
    ? value
    : DEFAULT_TIMESTAMP;
}

function offsetTimestamp(timestamp: string, offset: number): string {
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    return timestamp;
  }
  return new Date(parsed + offset).toISOString();
}

function compareTimestamps(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
    return left.localeCompare(right);
  }

  return leftTime - rightTime || left.localeCompare(right);
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

function normalizeToken(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "_") ?? "";
}

function sanitizeIdentifier(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);

  return normalized === "" ? fallback : normalized;
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

function cloneSessionReviewState(
  state: IngestSessionReviewState,
): IngestSessionReviewState {
  return {
    ...state,
    routeTimeline: state.routeTimeline.map(cloneRouteTimelineItem),
    sdkCalls: state.sdkCalls.map(cloneSdkCall),
    quarantineDecisionSummary: cloneDecisionSummary(
      state.quarantineDecisionSummary,
    ),
    checksumEvidence: state.checksumEvidence.map(cloneChecksumEvidenceItem),
    emptyStates: {
      routeTimeline: { ...state.emptyStates.routeTimeline },
      sdkCalls: { ...state.emptyStates.sdkCalls },
      quarantineDecisions: { ...state.emptyStates.quarantineDecisions },
      checksumEvidence: { ...state.emptyStates.checksumEvidence },
    },
    errorStates: state.errorStates.map((error) => ({
      ...error,
      errorState: { ...error.errorState },
    })),
  };
}

function cloneRouteTimelineItem(
  item: IngestSessionRouteTimelineItem,
): IngestSessionRouteTimelineItem {
  return {
    ...item,
    detailLabels: [...item.detailLabels],
  };
}

function cloneSdkCall(call: IngestSessionSdkCallViewModel): IngestSessionSdkCallViewModel {
  return {
    ...call,
    sourceLabels: [...call.sourceLabels],
    detailLabels: [...call.detailLabels],
  };
}

function cloneDecisionSummary(
  summary: IngestSessionQuarantineDecisionSummary,
): IngestSessionQuarantineDecisionSummary {
  return {
    ...summary,
    items: summary.items.map(cloneDecisionItem),
    emptyState: { ...summary.emptyState },
  };
}

function cloneDecisionItem(
  item: IngestSessionQuarantineDecisionItem,
): IngestSessionQuarantineDecisionItem {
  return {
    ...item,
    decisionLabel: { ...item.decisionLabel },
    detailLabels: [...item.detailLabels],
  };
}

function cloneChecksumEvidenceItem(
  item: IngestSessionChecksumEvidenceItem,
): IngestSessionChecksumEvidenceItem {
  return {
    ...item,
    detailLabels: [...item.detailLabels],
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
