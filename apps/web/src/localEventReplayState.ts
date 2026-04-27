import {
  LOCAL_EVENT_CATALOG_STATUSES,
  LOCAL_EVENT_OPERATION_KINDS,
  LOCAL_EVENT_RISK_LEVELS,
  LOCAL_EVENT_SCHEMA_KINDS,
  buildLocalEventSummaries,
  filterLocalEventSummaries,
  getCatalogStatusLabel,
  getLocalEventOperationLabel,
  getLocalEventRiskLabel,
  getLocalEventSchemaLabel,
  summarizeLocalEventSummaries,
  type CanonicalLocalEvent,
  type LocalEventCatalogFilter,
  type LocalEventCatalogStatus,
  type LocalEventCatalogSummary,
  type LocalEventOperationKind,
  type LocalEventRiskLevel,
  type LocalEventSchemaKind,
  type LocalEventSummary,
} from "./localEventCatalog.ts";

export const LOCAL_EVENT_REPLAY_REDACTION_FILTERS = [
  "none",
  "open",
  "blocking",
  "resolved",
] as const;

export type LocalEventReplayRedactionFilter =
  (typeof LOCAL_EVENT_REPLAY_REDACTION_FILTERS)[number];

export type LocalEventReplayViewStatus = LocalEventCatalogStatus | "error";

export type LocalEventReplayFilterKind =
  | "operation"
  | "schema"
  | "risk"
  | "replay"
  | "redaction"
  | "query";

export interface LocalEventReplayFilter extends LocalEventCatalogFilter {
  replayStatus?:
    | LocalEventCatalogStatus
    | readonly LocalEventCatalogStatus[]
    | "all";
  redactionStatus?:
    | LocalEventReplayRedactionFilter
    | readonly LocalEventReplayRedactionFilter[]
    | "all";
}

export interface BuildLocalEventReplayStateOptions {
  filter?: LocalEventReplayFilter;
  error?: unknown;
  errors?: readonly unknown[];
}

export interface LocalEventReplayState {
  id: "local_event_replay";
  label: string;
  ariaLabel: string;
  status: LocalEventReplayViewStatus;
  totalCount: number;
  visibleCount: number;
  summary: LocalEventCatalogSummary;
  visibleSummary: LocalEventCatalogSummary;
  filters: LocalEventReplayFilterState;
  timelineRows: LocalEventReplayTimelineRow[];
  approvalCards: LocalEventReplayApprovalSummaryCard[];
  documentCards: LocalEventReplayDocumentSummaryCard[];
  emptyState: LocalEventReplayEmptyState;
  errorStates: LocalEventReplayErrorState[];
}

export interface LocalEventReplayTimelineRow {
  id: string;
  eventId: string;
  streamId: string;
  sequence: number;
  sequenceLabel: string;
  occurredAt: string;
  title: string;
  summary: string;
  subtitle: string;
  status: LocalEventCatalogStatus;
  statusLabel: string;
  operationKind: LocalEventOperationKind;
  operationLabel: string;
  schemaKind: LocalEventSchemaKind;
  schemaLabel: string;
  riskLevel: LocalEventRiskLevel;
  riskLabel: string;
  markerCount: number;
  openMarkerCount: number;
  openBlockingMarkerCount: number;
  issueCount: number;
  issueCodes: string[];
  checkedAt?: string;
  replayedAt?: string;
  badgeLabels: string[];
  detailLabels: string[];
  ariaLabel: string;
}

export interface LocalEventReplayFilterState {
  filter: LocalEventReplayFilter;
  activeFilters: LocalEventReplayActiveFilter[];
  operationKindOptions: LocalEventReplayFilterOption[];
  schemaKindOptions: LocalEventReplayFilterOption[];
  riskLevelOptions: LocalEventReplayFilterOption[];
  replayStatusOptions: LocalEventReplayFilterOption[];
  redactionStatusOptions: LocalEventReplayFilterOption[];
  query?: string;
  ariaLabel: string;
}

export interface LocalEventReplayFilterOption {
  id: string;
  kind: Exclude<LocalEventReplayFilterKind, "query">;
  value: string;
  label: string;
  count: number;
  active: boolean;
  disabled: boolean;
  ariaLabel: string;
}

export interface LocalEventReplayActiveFilter {
  id: string;
  kind: LocalEventReplayFilterKind;
  label: string;
  value: string;
}

export interface LocalEventReplayApprovalSummaryCard {
  id: string;
  targetStatus: Exclude<LocalEventCatalogStatus, "empty">;
  title: string;
  status: LocalEventCatalogStatus;
  statusLabel: string;
  value: number;
  valueLabel: string;
  eventIds: string[];
  openMarkerCount: number;
  openBlockingMarkerCount: number;
  issueCount: number;
  actionLabel: string;
  detailLabels: string[];
  ariaLabel: string;
}

export interface LocalEventReplayDocumentSummaryCard {
  id: string;
  targetStatus: LocalEventCatalogStatus | "all";
  title: string;
  status: LocalEventCatalogStatus;
  statusLabel: string;
  value: number;
  valueLabel: string;
  eventIds: string[];
  openMarkerCount: number;
  openBlockingMarkerCount: number;
  issueCount: number;
  detailLabels: string[];
  ariaLabel: string;
}

export interface LocalEventReplayEmptyState {
  id: string;
  label: string;
  description: string;
  ariaLabel: string;
  actionLabel?: string;
}

export interface LocalEventReplayErrorState {
  id: string;
  label: string;
  description: string;
  ariaLabel: string;
  retryLabel: string;
}

const REPLAY_CARD_STATUSES = [
  "blocked",
  "attention",
  "ready",
  "complete",
] as const;

export function buildLocalEventReplayState(
  events: readonly CanonicalLocalEvent[],
  options: BuildLocalEventReplayStateOptions = {},
): LocalEventReplayState {
  const filter = options.filter ?? {};
  const summaries = buildLocalEventSummaries(events);
  const visibleSummaries = filterLocalEventReplaySummaries(summaries, filter);
  const summary = summarizeLocalEventSummaries(summaries);
  const visibleSummary = summarizeLocalEventSummaries(visibleSummaries);
  const errorStates = buildLocalEventReplayErrorStates(options);
  const status = resolveReplayViewStatus(visibleSummary, errorStates);

  return {
    id: "local_event_replay",
    label: "Local event replay",
    ariaLabel: [
      "Local event replay",
      formatCount(summary.total, "event"),
      formatCount(visibleSummary.total, "visible event"),
      `status ${status}`,
    ].join(", "),
    status,
    totalCount: summary.total,
    visibleCount: visibleSummary.total,
    summary: cloneCatalogSummary(summary),
    visibleSummary: cloneCatalogSummary(visibleSummary),
    filters: buildLocalEventReplayFilterState(summaries, filter),
    timelineRows: buildTimelineRowsFromSummaries(visibleSummaries),
    approvalCards: buildApprovalCardsFromSummaries(visibleSummaries),
    documentCards: buildDocumentCardsFromSummaries(visibleSummaries),
    emptyState: buildLocalEventReplayEmptyState(
      summary.total,
      visibleSummary.total,
      errorStates.length > 0,
    ),
    errorStates,
  };
}

export function buildLocalEventReplayTimelineRows(
  events: readonly CanonicalLocalEvent[],
  filter: LocalEventReplayFilter = {},
): LocalEventReplayTimelineRow[] {
  return buildTimelineRowsFromSummaries(
    filterLocalEventReplaySummaries(buildLocalEventSummaries(events), filter),
  );
}

export function buildLocalEventReplayApprovalCards(
  events: readonly CanonicalLocalEvent[],
  filter: LocalEventReplayFilter = {},
): LocalEventReplayApprovalSummaryCard[] {
  return buildApprovalCardsFromSummaries(
    filterLocalEventReplaySummaries(buildLocalEventSummaries(events), filter),
  );
}

export function buildLocalEventReplayDocumentCards(
  events: readonly CanonicalLocalEvent[],
  filter: LocalEventReplayFilter = {},
): LocalEventReplayDocumentSummaryCard[] {
  return buildDocumentCardsFromSummaries(
    filterLocalEventReplaySummaries(buildLocalEventSummaries(events), filter),
  );
}

export function buildLocalEventReplayFilterState(
  summaries: readonly LocalEventSummary[],
  filter: LocalEventReplayFilter = {},
): LocalEventReplayFilterState {
  const summary = summarizeLocalEventSummaries(summaries);
  const normalizedFilter = cloneReplayFilter(filter);
  const query = normalizeOptionalText(filter.query);
  const activeFilters = buildActiveFilters(filter);

  const state: LocalEventReplayFilterState = {
    filter: normalizedFilter,
    activeFilters,
    operationKindOptions: [
      buildFilterOption({
        kind: "operation",
        value: "all",
        label: "All operations",
        count: summaries.length,
        active: isAllFilter(filter.operationKind),
      }),
      ...LOCAL_EVENT_OPERATION_KINDS.map((kind) =>
        buildFilterOption({
          kind: "operation",
          value: kind,
          label: getLocalEventOperationLabel(kind),
          count: summary.byOperationKind[kind],
          active: includesFilterValue(filter.operationKind, kind),
        }),
      ),
    ],
    schemaKindOptions: [
      buildFilterOption({
        kind: "schema",
        value: "all",
        label: "All schemas",
        count: summaries.length,
        active: isAllFilter(filter.schemaKind),
      }),
      ...LOCAL_EVENT_SCHEMA_KINDS.map((kind) =>
        buildFilterOption({
          kind: "schema",
          value: kind,
          label: getLocalEventSchemaLabel(kind),
          count: summary.bySchemaKind[kind],
          active: includesFilterValue(filter.schemaKind, kind),
        }),
      ),
    ],
    riskLevelOptions: [
      buildFilterOption({
        kind: "risk",
        value: "all",
        label: "All risk levels",
        count: summaries.length,
        active: isAllFilter(filter.riskLevel),
      }),
      ...LOCAL_EVENT_RISK_LEVELS.map((risk) =>
        buildFilterOption({
          kind: "risk",
          value: risk,
          label: getLocalEventRiskLabel(risk),
          count: summary.byRiskLevel[risk],
          active: includesFilterValue(filter.riskLevel, risk),
        }),
      ),
    ],
    replayStatusOptions: [
      buildFilterOption({
        kind: "replay",
        value: "all",
        label: "All replay statuses",
        count: summaries.length,
        active: isAllFilter(filter.replayStatus),
      }),
      ...LOCAL_EVENT_CATALOG_STATUSES.map((status) =>
        buildFilterOption({
          kind: "replay",
          value: status,
          label: getCatalogStatusLabel(status),
          count: summary.replayReadiness.byStatus[status],
          active: includesFilterValue(filter.replayStatus, status),
        }),
      ),
    ],
    redactionStatusOptions: [
      buildFilterOption({
        kind: "redaction",
        value: "all",
        label: "All redaction states",
        count: summaries.length,
        active: isAllFilter(filter.redactionStatus),
      }),
      ...LOCAL_EVENT_REPLAY_REDACTION_FILTERS.map((redactionStatus) =>
        buildFilterOption({
          kind: "redaction",
          value: redactionStatus,
          label: getRedactionFilterLabel(redactionStatus),
          count: countRedactionMatches(summaries, redactionStatus),
          active: includesFilterValue(filter.redactionStatus, redactionStatus),
        }),
      ),
    ],
    ariaLabel: [
      "Local event replay filters",
      formatCount(activeFilters.length, "active filter"),
    ].join(", "),
  };

  if (query !== undefined) {
    state.query = query;
  }

  return cloneFilterState(state);
}

export function buildLocalEventReplayEmptyState(
  totalCount: number,
  visibleCount: number,
  hasError = false,
): LocalEventReplayEmptyState {
  if (hasError) {
    return {
      id: "local_event_replay_error_empty",
      label: "Replay events could not load",
      description: "Fix the load error before reviewing local event replay.",
      ariaLabel: "Local event replay cannot show events because loading failed",
      actionLabel: "Retry replay events",
    };
  }

  if (totalCount === 0) {
    return {
      id: "local_event_replay_empty",
      label: "No local events",
      description: "Local events will appear after workspace activity is recorded.",
      ariaLabel: "No local events are available for replay",
    };
  }

  if (visibleCount === 0) {
    return {
      id: "local_event_replay_filter_empty",
      label: "No matching replay events",
      description: "No local replay events match the selected filters.",
      ariaLabel: "No local replay events match the selected filters",
      actionLabel: "Clear filters",
    };
  }

  return {
    id: "local_event_replay_ready",
    label: "Replay events ready",
    description: "Local replay event rows are available.",
    ariaLabel: "Local replay event rows are available",
  };
}

export function buildLocalEventReplayErrorState(
  error: unknown,
): LocalEventReplayErrorState {
  return {
    id: "local_event_replay_error",
    label: "Replay events could not load",
    description: errorMessage(error) ?? "Refresh local event replay and try again.",
    ariaLabel: "Local event replay could not load",
    retryLabel: "Retry replay events",
  };
}

function filterLocalEventReplaySummaries(
  summaries: readonly LocalEventSummary[],
  filter: LocalEventReplayFilter,
): LocalEventSummary[] {
  const catalogFilter = toCatalogFilter(filter);
  const catalogFiltered = filterLocalEventSummaries(summaries, catalogFilter);

  return catalogFiltered
    .filter((summary) => matchesReplayStatusFilter(summary, filter.replayStatus))
    .filter((summary) =>
      matchesRedactionStatusFilter(summary, filter.redactionStatus),
    );
}

function buildTimelineRowsFromSummaries(
  summaries: readonly LocalEventSummary[],
): LocalEventReplayTimelineRow[] {
  return summaries
    .map(buildTimelineRow)
    .sort(compareTimelineRows)
    .map(cloneTimelineRow);
}

function buildTimelineRow(summary: LocalEventSummary): LocalEventReplayTimelineRow {
  const status = summary.replayReadiness.status;
  const statusLabel = getCatalogStatusLabel(status);
  const issueCodes = [...summary.replayReadiness.issueCodes];
  const badgeLabels = [
    summary.operationLabel,
    summary.schemaLabel,
    summary.riskLabel,
    statusLabel,
  ];

  if (summary.redactions.open > 0) {
    badgeLabels.push(formatCount(summary.redactions.open, "open marker"));
  }
  if (summary.replayReadiness.issueCount > 0) {
    badgeLabels.push(formatCount(summary.replayReadiness.issueCount, "replay issue"));
  }

  const detailLabels = [
    `${summary.operationLabel} ${summary.schemaLabel.toLocaleLowerCase()}`,
    summary.riskLabel,
    `Sequence ${summary.sequence}`,
    `Occurred at ${summary.occurredAt}`,
    statusLabel,
    formatCount(summary.redactions.total, "redaction marker"),
    formatCount(summary.replayReadiness.issueCount, "replay issue"),
    ...summary.replayReadiness.reasonLabels,
  ];

  const row: LocalEventReplayTimelineRow = {
    id: `local_event_replay.timeline.${summary.eventId}`,
    eventId: summary.eventId,
    streamId: summary.streamId,
    sequence: summary.sequence,
    sequenceLabel: summary.sequenceLabel,
    occurredAt: summary.occurredAt,
    title: summary.title,
    summary: summary.summary,
    subtitle: `${summary.operationLabel} ${summary.schemaLabel.toLocaleLowerCase()}`,
    status,
    statusLabel,
    operationKind: summary.operationKind,
    operationLabel: summary.operationLabel,
    schemaKind: summary.schemaKind,
    schemaLabel: summary.schemaLabel,
    riskLevel: summary.riskLevel,
    riskLabel: summary.riskLabel,
    markerCount: summary.redactions.total,
    openMarkerCount: summary.redactions.open,
    openBlockingMarkerCount: summary.redactions.openBlocking,
    issueCount: summary.replayReadiness.issueCount,
    issueCodes,
    badgeLabels,
    detailLabels,
    ariaLabel: [
      summary.title,
      statusLabel,
      summary.operationLabel,
      summary.schemaLabel,
      `sequence ${summary.sequence}`,
      formatCount(summary.redactions.open, "open marker"),
      formatCount(summary.replayReadiness.issueCount, "replay issue"),
    ].join(", "),
  };

  if (summary.replayReadiness.checkedAt !== undefined) {
    row.checkedAt = summary.replayReadiness.checkedAt;
  }
  if (summary.replayReadiness.replayedAt !== undefined) {
    row.replayedAt = summary.replayReadiness.replayedAt;
  }

  return row;
}

function buildApprovalCardsFromSummaries(
  summaries: readonly LocalEventSummary[],
): LocalEventReplayApprovalSummaryCard[] {
  const timelineRows = buildTimelineRowsFromSummaries(summaries);

  return REPLAY_CARD_STATUSES.map((status) => {
    const rows = timelineRows.filter((row) => row.status === status);
    const openMarkerCount = sum(rows, (row) => row.openMarkerCount);
    const openBlockingMarkerCount = sum(rows, (row) => row.openBlockingMarkerCount);
    const issueCount = sum(rows, (row) => row.issueCount);
    const title = approvalCardTitle(status);
    const valueLabel = formatCount(rows.length, "event");
    const cardStatus = rows.length === 0 ? "empty" : status;

    return {
      id: `local_event_replay.approval.${status}`,
      targetStatus: status,
      title,
      status: cardStatus,
      statusLabel: getCatalogStatusLabel(cardStatus),
      value: rows.length,
      valueLabel,
      eventIds: rows.map((row) => row.eventId),
      openMarkerCount,
      openBlockingMarkerCount,
      issueCount,
      actionLabel: approvalCardActionLabel(status),
      detailLabels: [
        valueLabel,
        formatCount(openMarkerCount, "open marker"),
        formatCount(openBlockingMarkerCount, "open blocking marker"),
        formatCount(issueCount, "replay issue"),
      ],
      ariaLabel: [
        title,
        valueLabel,
        formatCount(openMarkerCount, "open marker"),
        formatCount(issueCount, "replay issue"),
      ].join(", "),
    };
  }).map(cloneApprovalCard);
}

function buildDocumentCardsFromSummaries(
  summaries: readonly LocalEventSummary[],
): LocalEventReplayDocumentSummaryCard[] {
  const rows = buildTimelineRowsFromSummaries(
    summaries.filter((summary) => summary.schemaKind === "document"),
  );
  const cards: LocalEventReplayDocumentSummaryCard[] = [
    buildDocumentCard("all", "Document replay events", rows),
    ...REPLAY_CARD_STATUSES.map((status) =>
      buildDocumentCard(
        status,
        documentCardTitle(status),
        rows.filter((row) => row.status === status),
      ),
    ),
  ];

  return cards.map(cloneDocumentCard);
}

function buildDocumentCard(
  targetStatus: LocalEventCatalogStatus | "all",
  title: string,
  rows: readonly LocalEventReplayTimelineRow[],
): LocalEventReplayDocumentSummaryCard {
  const status =
    targetStatus === "all"
      ? resolveRowsStatus(rows)
      : rows.length === 0
        ? "empty"
        : targetStatus;
  const openMarkerCount = sum(rows, (row) => row.openMarkerCount);
  const openBlockingMarkerCount = sum(rows, (row) => row.openBlockingMarkerCount);
  const issueCount = sum(rows, (row) => row.issueCount);
  const valueLabel = formatCount(rows.length, "document event");

  return {
    id: `local_event_replay.documents.${targetStatus}`,
    targetStatus,
    title,
    status,
    statusLabel: getCatalogStatusLabel(status),
    value: rows.length,
    valueLabel,
    eventIds: rows.map((row) => row.eventId),
    openMarkerCount,
    openBlockingMarkerCount,
    issueCount,
    detailLabels: [
      valueLabel,
      formatCount(openMarkerCount, "open marker"),
      formatCount(openBlockingMarkerCount, "open blocking marker"),
      formatCount(issueCount, "replay issue"),
    ],
    ariaLabel: [
      title,
      valueLabel,
      getCatalogStatusLabel(status),
      formatCount(openMarkerCount, "open marker"),
      formatCount(issueCount, "replay issue"),
    ].join(", "),
  };
}

function buildLocalEventReplayErrorStates(
  options: BuildLocalEventReplayStateOptions,
): LocalEventReplayErrorState[] {
  return [options.error, ...(options.errors ?? [])]
    .filter((error) => error !== undefined)
    .map(buildLocalEventReplayErrorState);
}

function buildActiveFilters(
  filter: LocalEventReplayFilter,
): LocalEventReplayActiveFilter[] {
  const active: LocalEventReplayActiveFilter[] = [];

  addActiveKindFilters(
    active,
    "operation",
    filter.operationKind,
    LOCAL_EVENT_OPERATION_KINDS,
    getLocalEventOperationLabel,
  );
  addActiveKindFilters(
    active,
    "schema",
    filter.schemaKind,
    LOCAL_EVENT_SCHEMA_KINDS,
    getLocalEventSchemaLabel,
  );
  addActiveKindFilters(
    active,
    "risk",
    filter.riskLevel,
    LOCAL_EVENT_RISK_LEVELS,
    getLocalEventRiskLabel,
  );
  addActiveKindFilters(
    active,
    "replay",
    filter.replayStatus,
    LOCAL_EVENT_CATALOG_STATUSES,
    getCatalogStatusLabel,
  );
  addActiveKindFilters(
    active,
    "redaction",
    filter.redactionStatus,
    LOCAL_EVENT_REPLAY_REDACTION_FILTERS,
    getRedactionFilterLabel,
  );

  const query = normalizeOptionalText(filter.query);
  if (query !== undefined) {
    active.push({
      id: "local_event_replay.filter.query",
      kind: "query",
      label: `Search: ${query}`,
      value: query,
    });
  }

  return active;
}

function addActiveKindFilters<TValue extends string>(
  active: LocalEventReplayActiveFilter[],
  kind: Exclude<LocalEventReplayFilterKind, "query">,
  filterValue: TValue | readonly TValue[] | "all" | undefined,
  values: readonly TValue[],
  label: (value: TValue) => string,
): void {
  if (filterValue === undefined || filterValue === "all") {
    return;
  }

  for (const value of values) {
    if (!includesFilterValue(filterValue, value)) {
      continue;
    }
    active.push({
      id: `local_event_replay.filter.${kind}.${value}`,
      kind,
      label: label(value),
      value,
    });
  }
}

function buildFilterOption(input: {
  kind: Exclude<LocalEventReplayFilterKind, "query">;
  value: string;
  label: string;
  count: number;
  active: boolean;
}): LocalEventReplayFilterOption {
  return {
    ...input,
    id: `local_event_replay.filter.${input.kind}.${input.value}`,
    disabled: input.count === 0 && !input.active,
    ariaLabel: [
      input.label,
      formatCount(input.count, "event"),
      input.active ? "selected" : "not selected",
    ].join(", "),
  };
}

function toCatalogFilter(filter: LocalEventReplayFilter): LocalEventCatalogFilter {
  const catalogFilter: LocalEventCatalogFilter = {};

  if (filter.operationKind !== undefined) {
    catalogFilter.operationKind = filter.operationKind;
  }
  if (filter.schemaKind !== undefined) {
    catalogFilter.schemaKind = filter.schemaKind;
  }
  if (filter.riskLevel !== undefined) {
    catalogFilter.riskLevel = filter.riskLevel;
  }
  if (filter.query !== undefined) {
    const query = normalizeOptionalText(filter.query);
    if (query !== undefined) {
      catalogFilter.query = query;
    }
  }

  return catalogFilter;
}

function matchesReplayStatusFilter(
  summary: LocalEventSummary,
  filter:
    | LocalEventCatalogStatus
    | readonly LocalEventCatalogStatus[]
    | "all"
    | undefined,
): boolean {
  return matchesKindFilter(summary.replayReadiness.status, filter);
}

function matchesRedactionStatusFilter(
  summary: LocalEventSummary,
  filter:
    | LocalEventReplayRedactionFilter
    | readonly LocalEventReplayRedactionFilter[]
    | "all"
    | undefined,
): boolean {
  if (filter === undefined || filter === "all") {
    return true;
  }
  if (Array.isArray(filter)) {
    return filter.some((value) => matchesRedactionStatus(summary, value));
  }
  return matchesRedactionStatus(summary, filter);
}

function matchesRedactionStatus(
  summary: LocalEventSummary,
  filter: LocalEventReplayRedactionFilter,
): boolean {
  switch (filter) {
    case "none":
      return summary.redactions.total === 0;
    case "open":
      return summary.redactions.open > 0;
    case "blocking":
      return summary.redactions.openBlocking > 0;
    case "resolved":
      return summary.redactions.resolved > 0;
  }
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

function includesFilterValue<TValue extends string>(
  filter: TValue | readonly TValue[] | "all" | undefined,
  value: TValue,
): boolean {
  if (filter === undefined || filter === "all") {
    return false;
  }
  if (Array.isArray(filter)) {
    return filter.includes(value);
  }
  return filter === value;
}

function isAllFilter<TValue extends string>(
  filter: TValue | readonly TValue[] | "all" | undefined,
): boolean {
  return filter === undefined || filter === "all";
}

function countRedactionMatches(
  summaries: readonly LocalEventSummary[],
  redactionStatus: LocalEventReplayRedactionFilter,
): number {
  return summaries.filter((summary) =>
    matchesRedactionStatus(summary, redactionStatus),
  ).length;
}

function getRedactionFilterLabel(
  redactionStatus: LocalEventReplayRedactionFilter,
): string {
  switch (redactionStatus) {
    case "none":
      return "No redactions";
    case "open":
      return "Open redactions";
    case "blocking":
      return "Blocking redactions";
    case "resolved":
      return "Resolved redactions";
  }
}

function approvalCardTitle(
  status: Exclude<LocalEventCatalogStatus, "empty">,
): string {
  switch (status) {
    case "blocked":
      return "Blocked replay events";
    case "attention":
      return "Events needing attention";
    case "ready":
      return "Events ready for replay";
    case "complete":
      return "Completed replay events";
  }
}

function approvalCardActionLabel(
  status: Exclude<LocalEventCatalogStatus, "empty">,
): string {
  switch (status) {
    case "blocked":
      return "Resolve blockers";
    case "attention":
      return "Review events";
    case "ready":
      return "Start replay";
    case "complete":
      return "View completed";
  }
}

function documentCardTitle(status: Exclude<LocalEventCatalogStatus, "empty">): string {
  switch (status) {
    case "blocked":
      return "Blocked document events";
    case "attention":
      return "Document events needing attention";
    case "ready":
      return "Document events ready for replay";
    case "complete":
      return "Completed document events";
  }
}

function resolveReplayViewStatus(
  visibleSummary: LocalEventCatalogSummary,
  errorStates: readonly LocalEventReplayErrorState[],
): LocalEventReplayViewStatus {
  if (errorStates.length > 0) {
    return "error";
  }
  if (visibleSummary.total === 0) {
    return "empty";
  }
  return visibleSummary.replayReadiness.status;
}

function resolveRowsStatus(
  rows: readonly LocalEventReplayTimelineRow[],
): LocalEventCatalogStatus {
  if (rows.length === 0) {
    return "empty";
  }
  if (rows.some((row) => row.status === "blocked")) {
    return "blocked";
  }
  if (rows.some((row) => row.status === "attention")) {
    return "attention";
  }
  if (rows.some((row) => row.status === "ready")) {
    return "ready";
  }
  return "complete";
}

function compareTimelineRows(
  left: LocalEventReplayTimelineRow,
  right: LocalEventReplayTimelineRow,
): number {
  return (
    compareTimestamps(left.occurredAt, right.occurredAt) ||
    left.streamId.localeCompare(right.streamId) ||
    left.sequence - right.sequence ||
    left.eventId.localeCompare(right.eventId)
  );
}

function compareTimestamps(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
    throw new Error("timestamps must be valid");
  }

  return leftTime - rightTime || left.localeCompare(right);
}

function cloneReplayFilter(
  filter: LocalEventReplayFilter,
): LocalEventReplayFilter {
  const copy: LocalEventReplayFilter = {};

  if (filter.operationKind !== undefined) {
    copy.operationKind = cloneFilterValue(filter.operationKind);
  }
  if (filter.schemaKind !== undefined) {
    copy.schemaKind = cloneFilterValue(filter.schemaKind);
  }
  if (filter.riskLevel !== undefined) {
    copy.riskLevel = cloneFilterValue(filter.riskLevel);
  }
  if (filter.replayStatus !== undefined) {
    copy.replayStatus = cloneFilterValue(filter.replayStatus);
  }
  if (filter.redactionStatus !== undefined) {
    copy.redactionStatus = cloneFilterValue(filter.redactionStatus);
  }
  const query = normalizeOptionalText(filter.query);
  if (query !== undefined) {
    copy.query = query;
  }

  return copy;
}

function cloneFilterValue<TValue extends string>(
  value: TValue | readonly TValue[] | "all",
): TValue | readonly TValue[] | "all" {
  return Array.isArray(value) ? [...value] : value;
}

function cloneCatalogSummary(
  summary: LocalEventCatalogSummary,
): LocalEventCatalogSummary {
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

function cloneFilterState(
  state: LocalEventReplayFilterState,
): LocalEventReplayFilterState {
  const copy: LocalEventReplayFilterState = {
    ...state,
    filter: cloneReplayFilter(state.filter),
    activeFilters: state.activeFilters.map((filter) => ({ ...filter })),
    operationKindOptions: state.operationKindOptions.map((option) => ({ ...option })),
    schemaKindOptions: state.schemaKindOptions.map((option) => ({ ...option })),
    riskLevelOptions: state.riskLevelOptions.map((option) => ({ ...option })),
    replayStatusOptions: state.replayStatusOptions.map((option) => ({ ...option })),
    redactionStatusOptions: state.redactionStatusOptions.map((option) => ({
      ...option,
    })),
  };

  if (state.query !== undefined) {
    copy.query = state.query;
  }

  return copy;
}

function cloneTimelineRow(
  row: LocalEventReplayTimelineRow,
): LocalEventReplayTimelineRow {
  const copy: LocalEventReplayTimelineRow = {
    ...row,
    issueCodes: [...row.issueCodes],
    badgeLabels: [...row.badgeLabels],
    detailLabels: [...row.detailLabels],
  };

  if (row.checkedAt !== undefined) {
    copy.checkedAt = row.checkedAt;
  }
  if (row.replayedAt !== undefined) {
    copy.replayedAt = row.replayedAt;
  }

  return copy;
}

function cloneApprovalCard(
  card: LocalEventReplayApprovalSummaryCard,
): LocalEventReplayApprovalSummaryCard {
  return {
    ...card,
    eventIds: [...card.eventIds],
    detailLabels: [...card.detailLabels],
  };
}

function cloneDocumentCard(
  card: LocalEventReplayDocumentSummaryCard,
): LocalEventReplayDocumentSummaryCard {
  return {
    ...card,
    eventIds: [...card.eventIds],
    detailLabels: [...card.detailLabels],
  };
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim();
  return normalized === "" ? undefined : normalized;
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

function sum<TValue>(
  values: readonly TValue[],
  getValue: (value: TValue) => number,
): number {
  return values.reduce((total, value) => total + getValue(value), 0);
}

function formatCount(
  value: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${value} ${value === 1 ? singular : plural}`;
}
