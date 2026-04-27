export const LOCAL_EVENT_OPERATION_KINDS = [
  "create",
  "update",
  "delete",
  "restore",
  "sync",
] as const;

export type LocalEventOperationKind =
  (typeof LOCAL_EVENT_OPERATION_KINDS)[number];

export const LOCAL_EVENT_SCHEMA_KINDS = [
  "workspace",
  "document",
  "task",
  "artifact",
  "setting",
  "connection",
] as const;

export type LocalEventSchemaKind = (typeof LOCAL_EVENT_SCHEMA_KINDS)[number];

export const LOCAL_EVENT_RISK_LEVELS = ["low", "medium", "high"] as const;

export type LocalEventRiskLevel = (typeof LOCAL_EVENT_RISK_LEVELS)[number];

export const LOCAL_EVENT_REDACTION_SEVERITIES = [
  "info",
  "warning",
  "blocking",
] as const;

export type LocalEventRedactionSeverity =
  (typeof LOCAL_EVENT_REDACTION_SEVERITIES)[number];

export const LOCAL_EVENT_REDACTION_STATUSES = ["open", "resolved"] as const;

export type LocalEventRedactionStatus =
  (typeof LOCAL_EVENT_REDACTION_STATUSES)[number];

export const LOCAL_EVENT_REPLAY_STATUSES = [
  "pending",
  "ready",
  "replayed",
  "failed",
] as const;

export type LocalEventReplayStatus =
  (typeof LOCAL_EVENT_REPLAY_STATUSES)[number];

export const LOCAL_EVENT_CATALOG_STATUSES = [
  "empty",
  "ready",
  "attention",
  "blocked",
  "complete",
] as const;

export type LocalEventCatalogStatus =
  (typeof LOCAL_EVENT_CATALOG_STATUSES)[number];

export type LocalEventOperationCounts = Record<LocalEventOperationKind, number>;
export type LocalEventSchemaCounts = Record<LocalEventSchemaKind, number>;
export type LocalEventRiskCounts = Record<LocalEventRiskLevel, number>;
export type LocalEventRedactionSeverityCounts = Record<
  LocalEventRedactionSeverity,
  number
>;
export type LocalEventReplayStatusCounts = Record<LocalEventCatalogStatus, number>;

export interface CanonicalLocalEvent {
  id: string;
  streamId: string;
  sequence: number;
  operationKind: LocalEventOperationKind;
  schemaKind: LocalEventSchemaKind;
  occurredAt: string;
  riskLevel?: LocalEventRiskLevel;
  title?: string;
  summary?: string;
  actorId?: string;
  payloadFingerprint?: string;
  redactionMarkers?: readonly LocalEventRedactionMarker[];
  replay?: LocalEventReplaySnapshot;
  metadata?: Record<string, unknown>;
}

export interface LocalEventRedactionMarker {
  id: string;
  path: string;
  reason: string;
  marker: string;
  severity?: LocalEventRedactionSeverity;
  status?: LocalEventRedactionStatus;
  createdAt?: string;
  resolvedAt?: string;
}

export interface NormalizedLocalEventRedactionMarker {
  id: string;
  path: string;
  reason: string;
  marker: string;
  severity: LocalEventRedactionSeverity;
  severityLabel: string;
  status: LocalEventRedactionStatus;
  statusLabel: string;
  createdAt?: string;
  resolvedAt?: string;
}

export interface LocalEventReplaySnapshot {
  status?: LocalEventReplayStatus;
  checkedAt?: string;
  replayedAt?: string;
  issueCount?: number;
  issueCodes?: readonly string[];
}

export interface LocalEventReplayReadiness {
  status: LocalEventCatalogStatus;
  label: string;
  reasonLabels: string[];
  checkedAt?: string;
  replayedAt?: string;
  issueCount: number;
  issueCodes: string[];
}

export interface LocalEventRedactionSummary {
  total: number;
  open: number;
  resolved: number;
  openBlocking: number;
  bySeverity: LocalEventRedactionSeverityCounts;
  openBySeverity: LocalEventRedactionSeverityCounts;
  markerIds: string[];
  openMarkerIds: string[];
  resolvedMarkerIds: string[];
  openBlockingMarkerIds: string[];
  markers: NormalizedLocalEventRedactionMarker[];
  label: string;
  ariaLabel: string;
}

export interface LocalEventSummary {
  id: string;
  eventId: string;
  streamId: string;
  sequence: number;
  sequenceLabel: string;
  operationKind: LocalEventOperationKind;
  operationLabel: string;
  schemaKind: LocalEventSchemaKind;
  schemaLabel: string;
  riskLevel: LocalEventRiskLevel;
  riskLabel: string;
  occurredAt: string;
  title: string;
  summary: string;
  actorId?: string;
  payloadFingerprint?: string;
  redactions: LocalEventRedactionSummary;
  replayReadiness: LocalEventReplayReadiness;
  detailLabels: string[];
  ariaLabel: string;
}

export interface LocalEventCatalogFilter {
  operationKind?: LocalEventOperationKind | readonly LocalEventOperationKind[] | "all";
  schemaKind?: LocalEventSchemaKind | readonly LocalEventSchemaKind[] | "all";
  riskLevel?: LocalEventRiskLevel | readonly LocalEventRiskLevel[] | "all";
  query?: string;
}

export interface LocalEventCatalogSummary {
  total: number;
  byOperationKind: LocalEventOperationCounts;
  bySchemaKind: LocalEventSchemaCounts;
  byRiskLevel: LocalEventRiskCounts;
  redactions: LocalEventRedactionSummary;
  replayReadiness: LocalEventReplayReadinessState;
}

export interface LocalEventReplayReadinessState {
  status: LocalEventCatalogStatus;
  label: string;
  totalCount: number;
  readyCount: number;
  attentionCount: number;
  blockedCount: number;
  completeCount: number;
  emptyCount: number;
  byStatus: LocalEventReplayStatusCounts;
  readyEventIds: string[];
  attentionEventIds: string[];
  blockedEventIds: string[];
  completeEventIds: string[];
}

export interface LocalEventCatalogState {
  id: "local_event_catalog";
  label: string;
  ariaLabel: string;
  status: LocalEventCatalogStatus;
  totalCount: number;
  visibleCount: number;
  summaries: LocalEventSummary[];
  summary: LocalEventCatalogSummary;
  visibleSummary: LocalEventCatalogSummary;
  emptyState: LocalEventCatalogEmptyState;
}

export interface LocalEventCatalogEmptyState {
  id: string;
  label: string;
  description: string;
  ariaLabel: string;
}

export function buildLocalEventCatalogState(
  events: readonly CanonicalLocalEvent[],
  filter: LocalEventCatalogFilter = {},
): LocalEventCatalogState {
  const summaries = buildLocalEventSummaries(events);
  const visibleSummaries = filterLocalEventSummaries(summaries, filter);
  const summary = summarizeLocalEventSummaries(summaries);
  const visibleSummary = summarizeLocalEventSummaries(visibleSummaries);
  const status = resolveCatalogStatus(summary);

  return {
    id: "local_event_catalog",
    label: "Local event catalog",
    ariaLabel: [
      "Local event catalog",
      formatCount(summary.total, "event"),
      formatCount(visibleSummary.total, "visible event"),
      `status ${status}`,
    ].join(", "),
    status,
    totalCount: summary.total,
    visibleCount: visibleSummary.total,
    summaries: visibleSummaries.map(cloneLocalEventSummary),
    summary: cloneCatalogSummary(summary),
    visibleSummary: cloneCatalogSummary(visibleSummary),
    emptyState: buildLocalEventCatalogEmptyState(summary.total, visibleSummary.total),
  };
}

export function buildLocalEventSummaries(
  events: readonly CanonicalLocalEvent[],
  filter: LocalEventCatalogFilter = {},
): LocalEventSummary[] {
  return filterLocalEventSummaries(
    events.map(normalizeLocalEventSummary).sort(compareLocalEventSummaries),
    filter,
  );
}

export function filterCanonicalLocalEvents(
  events: readonly CanonicalLocalEvent[],
  filter: LocalEventCatalogFilter = {},
): CanonicalLocalEvent[] {
  const matchingIds = new Set(
    buildLocalEventSummaries(events, filter).map((summary) => summary.eventId),
  );

  return events
    .filter((event) => matchingIds.has(event.id))
    .map(cloneCanonicalLocalEvent);
}

export function filterLocalEventSummaries(
  summaries: readonly LocalEventSummary[],
  filter: LocalEventCatalogFilter = {},
): LocalEventSummary[] {
  return summaries
    .filter((summary) => matchesLocalEventFilter(summary, filter))
    .map(cloneLocalEventSummary);
}

export function summarizeLocalEvents(
  events: readonly CanonicalLocalEvent[],
): LocalEventCatalogSummary {
  return summarizeLocalEventSummaries(buildLocalEventSummaries(events));
}

export function summarizeLocalEventSummaries(
  summaries: readonly LocalEventSummary[],
): LocalEventCatalogSummary {
  const byOperationKind = createOperationCounts();
  const bySchemaKind = createSchemaCounts();
  const byRiskLevel = createRiskCounts();

  for (const summary of summaries) {
    byOperationKind[summary.operationKind] += 1;
    bySchemaKind[summary.schemaKind] += 1;
    byRiskLevel[summary.riskLevel] += 1;
  }

  return {
    total: summaries.length,
    byOperationKind,
    bySchemaKind,
    byRiskLevel,
    redactions: summarizeRedactionSummaries(
      summaries.map((summary) => summary.redactions),
    ),
    replayReadiness: buildLocalEventReplayReadinessState(summaries),
  };
}

export function buildLocalEventReplayReadinessState(
  summaries: readonly LocalEventSummary[],
): LocalEventReplayReadinessState {
  const byStatus = createReplayStatusCounts();
  const readyEventIds: string[] = [];
  const attentionEventIds: string[] = [];
  const blockedEventIds: string[] = [];
  const completeEventIds: string[] = [];

  for (const summary of summaries) {
    const status = summary.replayReadiness.status;
    byStatus[status] += 1;

    if (status === "ready") {
      readyEventIds.push(summary.eventId);
    } else if (status === "attention") {
      attentionEventIds.push(summary.eventId);
    } else if (status === "blocked") {
      blockedEventIds.push(summary.eventId);
    } else if (status === "complete") {
      completeEventIds.push(summary.eventId);
    }
  }

  const stateStatus = resolveReplayStateStatus(byStatus, summaries.length);

  return {
    status: stateStatus,
    label: getCatalogStatusLabel(stateStatus),
    totalCount: summaries.length,
    readyCount: byStatus.ready,
    attentionCount: byStatus.attention,
    blockedCount: byStatus.blocked,
    completeCount: byStatus.complete,
    emptyCount: byStatus.empty,
    byStatus,
    readyEventIds,
    attentionEventIds,
    blockedEventIds,
    completeEventIds,
  };
}

export function getLocalEventOperationLabel(
  kind: LocalEventOperationKind,
): string {
  switch (kind) {
    case "create":
      return "Create";
    case "update":
      return "Update";
    case "delete":
      return "Delete";
    case "restore":
      return "Restore";
    case "sync":
      return "Sync";
  }
}

export function getLocalEventSchemaLabel(kind: LocalEventSchemaKind): string {
  switch (kind) {
    case "workspace":
      return "Workspace";
    case "document":
      return "Document";
    case "task":
      return "Task";
    case "artifact":
      return "Artifact";
    case "setting":
      return "Setting";
    case "connection":
      return "Connection";
  }
}

export function getLocalEventRiskLabel(risk: LocalEventRiskLevel): string {
  switch (risk) {
    case "low":
      return "Low risk";
    case "medium":
      return "Medium risk";
    case "high":
      return "High risk";
  }
}

export function getLocalEventRedactionSeverityLabel(
  severity: LocalEventRedactionSeverity,
): string {
  switch (severity) {
    case "info":
      return "Info";
    case "warning":
      return "Warning";
    case "blocking":
      return "Blocking";
  }
}

export function getLocalEventRedactionStatusLabel(
  status: LocalEventRedactionStatus,
): string {
  switch (status) {
    case "open":
      return "Open";
    case "resolved":
      return "Resolved";
  }
}

export function getCatalogStatusLabel(status: LocalEventCatalogStatus): string {
  switch (status) {
    case "empty":
      return "No events";
    case "ready":
      return "Ready for replay";
    case "attention":
      return "Needs attention";
    case "blocked":
      return "Blocked";
    case "complete":
      return "Replay complete";
  }
}

export function isLocalEventOperationKind(
  value: unknown,
): value is LocalEventOperationKind {
  return isOneOf(value, LOCAL_EVENT_OPERATION_KINDS);
}

export function isLocalEventSchemaKind(
  value: unknown,
): value is LocalEventSchemaKind {
  return isOneOf(value, LOCAL_EVENT_SCHEMA_KINDS);
}

export function isLocalEventRiskLevel(
  value: unknown,
): value is LocalEventRiskLevel {
  return isOneOf(value, LOCAL_EVENT_RISK_LEVELS);
}

export function isLocalEventRedactionSeverity(
  value: unknown,
): value is LocalEventRedactionSeverity {
  return isOneOf(value, LOCAL_EVENT_REDACTION_SEVERITIES);
}

export function isLocalEventRedactionStatus(
  value: unknown,
): value is LocalEventRedactionStatus {
  return isOneOf(value, LOCAL_EVENT_REDACTION_STATUSES);
}

export function isLocalEventReplayStatus(
  value: unknown,
): value is LocalEventReplayStatus {
  return isOneOf(value, LOCAL_EVENT_REPLAY_STATUSES);
}

function normalizeLocalEventSummary(
  event: CanonicalLocalEvent,
): LocalEventSummary {
  const eventId = normalizeRequiredText(event.id, "event id");
  const streamId = normalizeRequiredText(event.streamId, "stream id");
  const sequence = normalizePositiveInteger(event.sequence, "sequence");
  assertOperationKind(event.operationKind);
  assertSchemaKind(event.schemaKind);
  const riskLevel = event.riskLevel ?? deriveRiskLevel(event.operationKind);
  assertRiskLevel(riskLevel);
  const occurredAt = normalizeTimestamp(event.occurredAt, "occurredAt");
  const title = normalizeOptionalText(event.title) ?? buildEventTitle(event);
  const summary = normalizeOptionalText(event.summary) ?? "No summary provided.";
  const redactions = summarizeEventRedactionMarkers(event.redactionMarkers ?? []);
  const replayReadiness = deriveReplayReadiness(event.replay, redactions);
  const operationLabel = getLocalEventOperationLabel(event.operationKind);
  const schemaLabel = getLocalEventSchemaLabel(event.schemaKind);
  const riskLabel = getLocalEventRiskLabel(riskLevel);
  const detailLabels = [
    `${operationLabel} ${schemaLabel.toLocaleLowerCase()}`,
    riskLabel,
    `Sequence ${sequence}`,
    `Occurred at ${occurredAt}`,
    redactions.label,
    replayReadiness.label,
  ];

  if (event.actorId !== undefined && event.actorId.trim() !== "") {
    detailLabels.push(`Actor ${event.actorId.trim()}`);
  }

  if (
    event.payloadFingerprint !== undefined &&
    event.payloadFingerprint.trim() !== ""
  ) {
    detailLabels.push(`Payload ${event.payloadFingerprint.trim()}`);
  }

  const summaryRow: LocalEventSummary = {
    id: `local_event.${eventId}`,
    eventId,
    streamId,
    sequence,
    sequenceLabel: `#${sequence}`,
    operationKind: event.operationKind,
    operationLabel,
    schemaKind: event.schemaKind,
    schemaLabel,
    riskLevel,
    riskLabel,
    occurredAt,
    title,
    summary,
    redactions,
    replayReadiness,
    detailLabels,
    ariaLabel: [
      title,
      operationLabel,
      schemaLabel,
      riskLabel,
      `sequence ${sequence}`,
      replayReadiness.label,
    ].join(", "),
  };

  if (event.actorId !== undefined && event.actorId.trim() !== "") {
    summaryRow.actorId = event.actorId.trim();
  }

  if (
    event.payloadFingerprint !== undefined &&
    event.payloadFingerprint.trim() !== ""
  ) {
    summaryRow.payloadFingerprint = event.payloadFingerprint.trim();
  }

  return summaryRow;
}

function summarizeEventRedactionMarkers(
  markers: readonly LocalEventRedactionMarker[],
): LocalEventRedactionSummary {
  const normalized = markers
    .map(normalizeRedactionMarker)
    .sort(compareRedactionMarkers);
  const bySeverity = createRedactionSeverityCounts();
  const openBySeverity = createRedactionSeverityCounts();
  const markerIds: string[] = [];
  const openMarkerIds: string[] = [];
  const resolvedMarkerIds: string[] = [];
  const openBlockingMarkerIds: string[] = [];

  for (const marker of normalized) {
    markerIds.push(marker.id);
    bySeverity[marker.severity] += 1;

    if (marker.status === "open") {
      openMarkerIds.push(marker.id);
      openBySeverity[marker.severity] += 1;
      if (marker.severity === "blocking") {
        openBlockingMarkerIds.push(marker.id);
      }
    } else {
      resolvedMarkerIds.push(marker.id);
    }
  }

  return createRedactionSummary({
    markers: normalized,
    markerIds,
    openMarkerIds,
    resolvedMarkerIds,
    openBlockingMarkerIds,
    bySeverity,
    openBySeverity,
  });
}

function summarizeRedactionSummaries(
  summaries: readonly LocalEventRedactionSummary[],
): LocalEventRedactionSummary {
  const bySeverity = createRedactionSeverityCounts();
  const openBySeverity = createRedactionSeverityCounts();
  const markerIds: string[] = [];
  const openMarkerIds: string[] = [];
  const resolvedMarkerIds: string[] = [];
  const openBlockingMarkerIds: string[] = [];
  const markers: NormalizedLocalEventRedactionMarker[] = [];

  for (const summary of summaries) {
    addCounts(bySeverity, summary.bySeverity);
    addCounts(openBySeverity, summary.openBySeverity);
    markerIds.push(...summary.markerIds);
    openMarkerIds.push(...summary.openMarkerIds);
    resolvedMarkerIds.push(...summary.resolvedMarkerIds);
    openBlockingMarkerIds.push(...summary.openBlockingMarkerIds);
    markers.push(...summary.markers.map(cloneRedactionMarker));
  }

  return createRedactionSummary({
    markers: markers.sort(compareRedactionMarkers),
    markerIds,
    openMarkerIds,
    resolvedMarkerIds,
    openBlockingMarkerIds,
    bySeverity,
    openBySeverity,
  });
}

function createRedactionSummary(input: {
  markers: NormalizedLocalEventRedactionMarker[];
  markerIds: string[];
  openMarkerIds: string[];
  resolvedMarkerIds: string[];
  openBlockingMarkerIds: string[];
  bySeverity: LocalEventRedactionSeverityCounts;
  openBySeverity: LocalEventRedactionSeverityCounts;
}): LocalEventRedactionSummary {
  const total = input.markerIds.length;
  const open = input.openMarkerIds.length;
  const resolved = input.resolvedMarkerIds.length;
  const openBlocking = input.openBlockingMarkerIds.length;

  return {
    total,
    open,
    resolved,
    openBlocking,
    bySeverity: { ...input.bySeverity },
    openBySeverity: { ...input.openBySeverity },
    markerIds: [...input.markerIds],
    openMarkerIds: [...input.openMarkerIds],
    resolvedMarkerIds: [...input.resolvedMarkerIds],
    openBlockingMarkerIds: [...input.openBlockingMarkerIds],
    markers: input.markers.map(cloneRedactionMarker),
    label: formatCount(total, "redaction marker"),
    ariaLabel: [
      formatCount(total, "redaction marker"),
      formatCount(open, "open marker"),
      formatCount(resolved, "resolved marker"),
      formatCount(openBlocking, "open blocking marker"),
    ].join(", "),
  };
}

function normalizeRedactionMarker(
  marker: LocalEventRedactionMarker,
): NormalizedLocalEventRedactionMarker {
  const severity = marker.severity ?? "warning";
  const status = marker.status ?? "open";
  assertRedactionSeverity(severity);
  assertRedactionStatus(status);

  const normalized: NormalizedLocalEventRedactionMarker = {
    id: normalizeRequiredText(marker.id, "redaction marker id"),
    path: normalizeRequiredText(marker.path, "redaction path"),
    reason: normalizeRequiredText(marker.reason, "redaction reason"),
    marker: normalizeRequiredText(marker.marker, "redaction marker"),
    severity,
    severityLabel: getLocalEventRedactionSeverityLabel(severity),
    status,
    statusLabel: getLocalEventRedactionStatusLabel(status),
  };

  if (marker.createdAt !== undefined) {
    normalized.createdAt = normalizeTimestamp(marker.createdAt, "createdAt");
  }

  if (marker.resolvedAt !== undefined) {
    normalized.resolvedAt = normalizeTimestamp(marker.resolvedAt, "resolvedAt");
  }

  return normalized;
}

function deriveReplayReadiness(
  replay: LocalEventReplaySnapshot | undefined,
  redactions: LocalEventRedactionSummary,
): LocalEventReplayReadiness {
  const replayStatus = replay?.status ?? "ready";
  assertReplayStatus(replayStatus);
  const issueCount = normalizeNonNegativeInteger(
    replay?.issueCount ?? 0,
    "issueCount",
  );
  const issueCodes = normalizeStringList(replay?.issueCodes ?? [], "issue code");
  const reasonLabels: string[] = [];

  if (redactions.openBlocking > 0) {
    reasonLabels.push(formatCount(redactions.openBlocking, "open blocking marker"));
  }
  if (redactions.open > redactions.openBlocking) {
    reasonLabels.push(
      formatCount(redactions.open - redactions.openBlocking, "open marker"),
    );
  }
  if (issueCount > 0) {
    reasonLabels.push(formatCount(issueCount, "replay issue"));
  }

  const readiness = createReplayReadiness(
    replayStatus,
    redactions,
    issueCount,
    issueCodes,
    reasonLabels,
  );

  if (replay?.checkedAt !== undefined) {
    readiness.checkedAt = normalizeTimestamp(replay.checkedAt, "checkedAt");
  }
  if (replay?.replayedAt !== undefined) {
    readiness.replayedAt = normalizeTimestamp(replay.replayedAt, "replayedAt");
  }

  return readiness;
}

function createReplayReadiness(
  replayStatus: LocalEventReplayStatus,
  redactions: LocalEventRedactionSummary,
  issueCount: number,
  issueCodes: string[],
  reasonLabels: string[],
): LocalEventReplayReadiness {
  if (redactions.openBlocking > 0 || replayStatus === "failed") {
    return {
      status: "blocked",
      label: "Replay blocked",
      reasonLabels,
      issueCount,
      issueCodes,
    };
  }

  if (issueCount > 0 || redactions.open > 0 || replayStatus === "pending") {
    return {
      status: "attention",
      label: "Replay needs attention",
      reasonLabels,
      issueCount,
      issueCodes,
    };
  }

  if (replayStatus === "replayed") {
    return {
      status: "complete",
      label: "Replay complete",
      reasonLabels,
      issueCount,
      issueCodes,
    };
  }

  return {
    status: "ready",
    label: "Ready for replay",
    reasonLabels,
    issueCount,
    issueCodes,
  };
}

function matchesLocalEventFilter(
  summary: LocalEventSummary,
  filter: LocalEventCatalogFilter,
): boolean {
  return (
    matchesKindFilter(summary.operationKind, filter.operationKind) &&
    matchesKindFilter(summary.schemaKind, filter.schemaKind) &&
    matchesKindFilter(summary.riskLevel, filter.riskLevel) &&
    (filter.query === undefined || matchesQuery(summary, filter.query))
  );
}

function matchesKindFilter<TValue extends string>(
  value: TValue,
  filter: TValue | readonly TValue[] | "all" | undefined,
): boolean {
  if (filter === undefined || filter === "all") {
    return true;
  }
  if (Array.isArray(filter)) {
    return filter.includes(value);
  }
  return value === filter;
}

function matchesQuery(summary: LocalEventSummary, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  if (normalized === "") {
    return true;
  }

  return [
    summary.eventId,
    summary.streamId,
    summary.title,
    summary.summary,
    summary.actorId,
    summary.payloadFingerprint,
    summary.operationLabel,
    summary.schemaLabel,
    summary.riskLabel,
    ...summary.detailLabels,
    ...summary.redactions.markers.flatMap((marker) => [
      marker.path,
      marker.reason,
      marker.marker,
    ]),
  ]
    .filter(isDefined)
    .some((value) => value.toLocaleLowerCase().includes(normalized));
}

function buildLocalEventCatalogEmptyState(
  totalCount: number,
  visibleCount: number,
): LocalEventCatalogEmptyState {
  if (totalCount === 0) {
    return {
      id: "local_event_catalog_empty",
      label: "No local events",
      description: "Local events will appear after workspace activity is recorded.",
      ariaLabel: "No local events are available",
    };
  }

  if (visibleCount === 0) {
    return {
      id: "local_event_catalog_filter_empty",
      label: "No matching local events",
      description: "No local events match the selected filters.",
      ariaLabel: "No local events match the selected filters",
    };
  }

  return {
    id: "local_event_catalog_ready",
    label: "Local events ready",
    description: "Local event summaries are available.",
    ariaLabel: "Local event summaries are available",
  };
}

function resolveCatalogStatus(
  summary: LocalEventCatalogSummary,
): LocalEventCatalogStatus {
  if (summary.total === 0) {
    return "empty";
  }
  return summary.replayReadiness.status;
}

function resolveReplayStateStatus(
  byStatus: LocalEventReplayStatusCounts,
  totalCount: number,
): LocalEventCatalogStatus {
  if (totalCount === 0) {
    return "empty";
  }
  if (byStatus.blocked > 0) {
    return "blocked";
  }
  if (byStatus.attention > 0) {
    return "attention";
  }
  if (byStatus.ready > 0) {
    return "ready";
  }
  return "complete";
}

function compareLocalEventSummaries(
  left: LocalEventSummary,
  right: LocalEventSummary,
): number {
  return (
    left.streamId.localeCompare(right.streamId) ||
    left.sequence - right.sequence ||
    compareTimestamps(left.occurredAt, right.occurredAt) ||
    left.eventId.localeCompare(right.eventId)
  );
}

function compareRedactionMarkers(
  left: NormalizedLocalEventRedactionMarker,
  right: NormalizedLocalEventRedactionMarker,
): number {
  return (
    redactionSeverityWeight(left.severity) -
      redactionSeverityWeight(right.severity) ||
    compareOptionalTimestamps(left.createdAt, right.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

function redactionSeverityWeight(
  severity: LocalEventRedactionSeverity,
): number {
  switch (severity) {
    case "blocking":
      return 0;
    case "warning":
      return 1;
    case "info":
      return 2;
  }
}

function deriveRiskLevel(
  operationKind: LocalEventOperationKind,
): LocalEventRiskLevel {
  switch (operationKind) {
    case "delete":
    case "restore":
      return "high";
    case "update":
    case "sync":
      return "medium";
    case "create":
      return "low";
  }
}

function buildEventTitle(event: CanonicalLocalEvent): string {
  return `${getLocalEventOperationLabel(event.operationKind)} ${getLocalEventSchemaLabel(
    event.schemaKind,
  ).toLocaleLowerCase()}`;
}

function createOperationCounts(): LocalEventOperationCounts {
  return {
    create: 0,
    update: 0,
    delete: 0,
    restore: 0,
    sync: 0,
  };
}

function createSchemaCounts(): LocalEventSchemaCounts {
  return {
    workspace: 0,
    document: 0,
    task: 0,
    artifact: 0,
    setting: 0,
    connection: 0,
  };
}

function createRiskCounts(): LocalEventRiskCounts {
  return {
    low: 0,
    medium: 0,
    high: 0,
  };
}

function createRedactionSeverityCounts(): LocalEventRedactionSeverityCounts {
  return {
    info: 0,
    warning: 0,
    blocking: 0,
  };
}

function createReplayStatusCounts(): LocalEventReplayStatusCounts {
  return {
    empty: 0,
    ready: 0,
    attention: 0,
    blocked: 0,
    complete: 0,
  };
}

function addCounts(
  target: LocalEventRedactionSeverityCounts,
  source: LocalEventRedactionSeverityCounts,
): void {
  target.info += source.info;
  target.warning += source.warning;
  target.blocking += source.blocking;
}

function cloneCatalogSummary(
  summary: LocalEventCatalogSummary,
): LocalEventCatalogSummary {
  return {
    ...summary,
    byOperationKind: { ...summary.byOperationKind },
    bySchemaKind: { ...summary.bySchemaKind },
    byRiskLevel: { ...summary.byRiskLevel },
    redactions: cloneRedactionSummary(summary.redactions),
    replayReadiness: cloneReplayReadinessState(summary.replayReadiness),
  };
}

function cloneLocalEventSummary(summary: LocalEventSummary): LocalEventSummary {
  const copy: LocalEventSummary = {
    ...summary,
    redactions: cloneRedactionSummary(summary.redactions),
    replayReadiness: cloneReplayReadiness(summary.replayReadiness),
    detailLabels: [...summary.detailLabels],
  };

  if (summary.actorId !== undefined) {
    copy.actorId = summary.actorId;
  }
  if (summary.payloadFingerprint !== undefined) {
    copy.payloadFingerprint = summary.payloadFingerprint;
  }

  return copy;
}

function cloneRedactionSummary(
  summary: LocalEventRedactionSummary,
): LocalEventRedactionSummary {
  return {
    ...summary,
    bySeverity: { ...summary.bySeverity },
    openBySeverity: { ...summary.openBySeverity },
    markerIds: [...summary.markerIds],
    openMarkerIds: [...summary.openMarkerIds],
    resolvedMarkerIds: [...summary.resolvedMarkerIds],
    openBlockingMarkerIds: [...summary.openBlockingMarkerIds],
    markers: summary.markers.map(cloneRedactionMarker),
  };
}

function cloneRedactionMarker(
  marker: NormalizedLocalEventRedactionMarker,
): NormalizedLocalEventRedactionMarker {
  return { ...marker };
}

function cloneReplayReadiness(
  readiness: LocalEventReplayReadiness,
): LocalEventReplayReadiness {
  return {
    ...readiness,
    reasonLabels: [...readiness.reasonLabels],
    issueCodes: [...readiness.issueCodes],
  };
}

function cloneReplayReadinessState(
  state: LocalEventReplayReadinessState,
): LocalEventReplayReadinessState {
  return {
    ...state,
    byStatus: { ...state.byStatus },
    readyEventIds: [...state.readyEventIds],
    attentionEventIds: [...state.attentionEventIds],
    blockedEventIds: [...state.blockedEventIds],
    completeEventIds: [...state.completeEventIds],
  };
}

function cloneCanonicalLocalEvent(
  event: CanonicalLocalEvent,
): CanonicalLocalEvent {
  const copy: CanonicalLocalEvent = {
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
      event.metadata === undefined ? undefined : clonePlainRecord(event.metadata),
  };

  return copy;
}

function clonePlainRecord(
  value: Record<string, unknown>,
  seen = new WeakMap<object, unknown>(),
): Record<string, unknown> {
  const existing = seen.get(value);
  if (existing) {
    return existing as Record<string, unknown>;
  }

  const copy: Record<string, unknown> = {};
  seen.set(value, copy);

  for (const [key, item] of Object.entries(value)) {
    copy[key] = clonePlainValue(item, seen);
  }

  return copy;
}

function clonePlainValue(
  value: unknown,
  seen: WeakMap<object, unknown>,
): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
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
      copy.push(clonePlainValue(item, seen));
    }
    return copy;
  }

  return clonePlainRecord(value as Record<string, unknown>, seen);
}

function assertOperationKind(
  kind: LocalEventOperationKind,
): asserts kind is LocalEventOperationKind {
  if (!isLocalEventOperationKind(kind)) {
    throw new Error("local event operation kind is not supported");
  }
}

function assertSchemaKind(
  kind: LocalEventSchemaKind,
): asserts kind is LocalEventSchemaKind {
  if (!isLocalEventSchemaKind(kind)) {
    throw new Error("local event schema kind is not supported");
  }
}

function assertRiskLevel(
  riskLevel: LocalEventRiskLevel,
): asserts riskLevel is LocalEventRiskLevel {
  if (!isLocalEventRiskLevel(riskLevel)) {
    throw new Error("local event risk level is not supported");
  }
}

function assertRedactionSeverity(
  severity: LocalEventRedactionSeverity,
): asserts severity is LocalEventRedactionSeverity {
  if (!isLocalEventRedactionSeverity(severity)) {
    throw new Error("local event redaction severity is not supported");
  }
}

function assertRedactionStatus(
  status: LocalEventRedactionStatus,
): asserts status is LocalEventRedactionStatus {
  if (!isLocalEventRedactionStatus(status)) {
    throw new Error("local event redaction status is not supported");
  }
}

function assertReplayStatus(
  status: LocalEventReplayStatus,
): asserts status is LocalEventReplayStatus {
  if (!isLocalEventReplayStatus(status)) {
    throw new Error("local event replay status is not supported");
  }
}

function normalizeRequiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized === "") {
    throw new Error(`${field} is required`);
  }
  return normalized;
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized === "" ? undefined : normalized;
}

function normalizeStringList(values: readonly string[], field: string): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const item = normalizeRequiredText(value, field);
    if (!seen.has(item)) {
      seen.add(item);
      normalized.push(item);
    }
  }

  return normalized;
}

function normalizeTimestamp(value: string, field: string): string {
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be a valid timestamp`);
  }
  return value;
}

function normalizePositiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function normalizeNonNegativeInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return value;
}

function compareTimestamps(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
    throw new Error("timestamps must be valid");
  }

  return leftTime - rightTime || left.localeCompare(right);
}

function compareOptionalTimestamps(
  left: string | undefined,
  right: string | undefined,
): number {
  if (left === undefined && right === undefined) {
    return 0;
  }
  if (left === undefined) {
    return 1;
  }
  if (right === undefined) {
    return -1;
  }

  return compareTimestamps(left, right);
}

function formatCount(
  value: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function isOneOf<TValue extends string>(
  value: unknown,
  allowed: readonly TValue[],
): value is TValue {
  return typeof value === "string" && allowed.includes(value as TValue);
}

function isDefined<TValue>(value: TValue | undefined): value is TValue {
  return value !== undefined;
}
