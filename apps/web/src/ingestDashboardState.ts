import {
  buildIngestApiState,
  type BuildIngestApiStateOptions,
  type IngestApiContextErrorState,
  type IngestApiState,
} from "./ingestApiState.ts";
import {
  buildIngestConnectorApiState,
  type BuildIngestConnectorApiStateOptions,
  type IngestConnectorApiErrorState,
  type IngestConnectorApiState,
} from "./ingestConnectorApiState.ts";
import type {
  IngestConnectorReadinessStatus,
  IngestConnectorWarning,
} from "./ingestConnectorState.ts";
import type { IngestSearchViewStatus } from "./ingestSearch.ts";

export const INGEST_DASHBOARD_SECTION_IDS = [
  "overview",
  "connectors",
  "sources",
  "search",
  "quarantine",
  "warnings",
  "errors",
] as const;

export type IngestDashboardSectionId =
  (typeof INGEST_DASHBOARD_SECTION_IDS)[number];

export type IngestDashboardStatus =
  | "empty"
  | "ready"
  | "attention"
  | "error";

export type IngestDashboardItemKind =
  | "indicator"
  | "connector"
  | "source"
  | "search_result"
  | "quarantine_item"
  | "warning"
  | "error";

export type IngestDashboardErrorSource = "ingest" | "connector";

export interface BuildIngestDashboardStateOptions {
  ingestApi?: BuildIngestApiStateOptions;
  connectorApi?: BuildIngestConnectorApiStateOptions;
}

export interface IngestDashboardState {
  id: "ingest_dashboard_state";
  label: string;
  ariaLabel: string;
  generatedAt: string;
  status: IngestDashboardStatus;
  localOnly: boolean;
  noNetwork: boolean;
  redacted: boolean;
  redactionCount: number;
  summary: IngestDashboardSummary;
  connectorReadiness: IngestDashboardConnectorReadiness;
  indicators: IngestDashboardIndicator[];
  cards: IngestDashboardCard[];
  sections: IngestDashboardSection[];
  warnings: IngestDashboardWarning[];
  errors: IngestDashboardError[];
  ingestApiState: IngestApiState;
  connectorApiState: IngestConnectorApiState;
}

export interface IngestDashboardSummary {
  id: "ingest_dashboard_summary";
  generatedAt: string;
  status: IngestDashboardStatus;
  localOnly: boolean;
  noNetwork: boolean;
  connectorRequestCount: number;
  successfulConnectorRequestCount: number;
  failedConnectorRequestCount: number;
  connectorCount: number;
  readyConnectorCount: number;
  attentionConnectorCount: number;
  errorConnectorCount: number;
  ingestSourceCount: number;
  readySourceCount: number;
  attentionSourceCount: number;
  errorSourceCount: number;
  indexedItemCount: number;
  queuedItemCount: number;
  quarantinedSourceItemCount: number;
  searchResultCount: number;
  quarantineTotalCount: number;
  quarantinePendingCount: number;
  quarantineDecidedCount: number;
  warningCount: number;
  errorCount: number;
  redactionCount: number;
  valueLabel: string;
  detailLabels: string[];
  ariaLabel: string;
}

export interface IngestDashboardConnectorReadiness {
  id: "ingest_dashboard_connector_readiness";
  status: IngestConnectorReadinessStatus;
  statusLabel: string;
  connectorCount: number;
  readyCount: number;
  attentionCount: number;
  errorCount: number;
  warningCount: number;
  requestCount: number;
  successfulRequestCount: number;
  failedRequestCount: number;
  ariaLabel: string;
}

export interface IngestDashboardIndicator {
  id: string;
  label: string;
  enabled: boolean;
  status: IngestDashboardStatus;
  description: string;
  ariaLabel: string;
}

export interface IngestDashboardCard {
  id: string;
  label: string;
  value: number;
  valueLabel: string;
  status: IngestDashboardStatus;
  helperText: string;
  detailLabels: string[];
  ariaLabel: string;
}

export interface IngestDashboardSection {
  id: IngestDashboardSectionId;
  label: string;
  title: string;
  description: string;
  status: IngestDashboardStatus;
  count: number;
  cards: IngestDashboardCard[];
  items: IngestDashboardSectionItem[];
  emptyState: IngestDashboardEmptyState;
  ariaLabel: string;
}

export interface IngestDashboardSectionItem {
  id: string;
  kind: IngestDashboardItemKind;
  title: string;
  status: IngestDashboardStatus;
  valueLabel: string;
  detailLabels: string[];
  ariaLabel: string;
}

export interface IngestDashboardEmptyState {
  label: string;
  description: string;
  ariaLabel: string;
}

export interface IngestDashboardWarning {
  id: string;
  source: "connector";
  connectorId: string;
  code: string;
  severity: string;
  title: string;
  description: string;
  fieldPath?: string;
  ariaLabel: string;
}

export interface IngestDashboardError {
  id: string;
  source: IngestDashboardErrorSource;
  context: string;
  title: string;
  description: string;
  retryLabel: string;
  redacted: boolean;
  redactionCount: number;
  routeId?: string;
  method?: string;
  routePath?: string;
  status?: number;
  ariaLabel: string;
}

type AnyRecord = Record<string, unknown>;

interface SanitizedValue<T> {
  value: T;
  redactionCount: number;
}

interface RedactedText {
  text: string;
  redactionCount: number;
}

interface NetworkEvidence {
  localOnlySeen: boolean;
  localOnlyFalseSeen: boolean;
  networkDisabledSeen: boolean;
  networkAccessSeen: boolean;
  externalNetworkSeen: boolean;
}

const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";

export function buildIngestDashboardState(
  ingestApiFixture: unknown,
  connectorApiFixture: unknown,
  options: BuildIngestDashboardStateOptions = {},
): IngestDashboardState {
  const ingestApiState = buildIngestApiState(ingestApiFixture, {
    decisionFilter: "all",
    ...options.ingestApi,
  });
  const connectorApiState = buildIngestConnectorApiState(
    connectorApiFixture,
    options.connectorApi,
  );
  const sanitizedIngest = sanitizeValue(clonePlain(ingestApiState));
  const sanitizedConnector = sanitizeValue(clonePlain(connectorApiState));
  const indicators = buildIndicators(ingestApiFixture, connectorApiFixture);
  const redactionCount =
    connectorApiState.redactionCount +
    sanitizedIngest.redactionCount +
    sanitizedConnector.redactionCount;
  const warnings = buildDashboardWarnings(sanitizedConnector.value);
  const errors = buildDashboardErrors(
    sanitizedIngest.value,
    sanitizedConnector.value,
  );
  const generatedAt = latestTimestamp([
    timestampFromInput(ingestApiFixture),
    timestampFromInput(connectorApiFixture),
    sanitizedConnector.value.generatedAt,
  ]);
  const summary = buildSummary({
    generatedAt,
    status: "empty",
    localOnly: indicators.localOnly.enabled,
    noNetwork: indicators.noNetwork.enabled,
    redactionCount,
    ingestApiState: sanitizedIngest.value,
    connectorApiState: sanitizedConnector.value,
    warnings,
    errors,
  });
  const connectorReadiness = buildConnectorReadiness(
    sanitizedConnector.value,
  );
  const status = resolveDashboardStatus(summary, connectorReadiness);
  const finalSummary = {
    ...summary,
    status,
    ariaLabel: buildSummaryAriaLabel(summary, status),
  };
  const indicatorList = [indicators.localOnly, indicators.noNetwork];
  const cards = buildDashboardCards(finalSummary);
  const sections = buildDashboardSections({
    summary: finalSummary,
    indicators: indicatorList,
    cards,
    warnings,
    errors,
    ingestApiState: sanitizedIngest.value,
    connectorApiState: sanitizedConnector.value,
  });
  const state: IngestDashboardState = {
    id: "ingest_dashboard_state",
    label: "Ingest dashboard",
    ariaLabel: [
      "Ingest dashboard",
      formatCount(finalSummary.connectorCount, "connector"),
      formatCount(finalSummary.ingestSourceCount, "source"),
      formatCount(finalSummary.searchResultCount, "search result"),
      formatCount(finalSummary.quarantineTotalCount, "quarantine item"),
      formatCount(finalSummary.warningCount, "warning"),
      formatCount(finalSummary.errorCount, "error"),
    ].join(", "),
    generatedAt,
    status,
    localOnly: finalSummary.localOnly,
    noNetwork: finalSummary.noNetwork,
    redacted: redactionCount > 0,
    redactionCount,
    summary: finalSummary,
    connectorReadiness,
    indicators: indicatorList,
    cards,
    sections,
    warnings,
    errors,
    ingestApiState: sanitizedIngest.value,
    connectorApiState: sanitizedConnector.value,
  };

  return deepFreeze(clonePlain(state));
}

export function buildIngestDashboardCards(
  ingestApiFixture: unknown,
  connectorApiFixture: unknown,
  options: BuildIngestDashboardStateOptions = {},
): IngestDashboardCard[] {
  return buildIngestDashboardState(
    ingestApiFixture,
    connectorApiFixture,
    options,
  ).cards;
}

export function buildIngestDashboardSections(
  ingestApiFixture: unknown,
  connectorApiFixture: unknown,
  options: BuildIngestDashboardStateOptions = {},
): IngestDashboardSection[] {
  return buildIngestDashboardState(
    ingestApiFixture,
    connectorApiFixture,
    options,
  ).sections;
}

function buildSummary(input: {
  generatedAt: string;
  status: IngestDashboardStatus;
  localOnly: boolean;
  noNetwork: boolean;
  redactionCount: number;
  ingestApiState: IngestApiState;
  connectorApiState: IngestConnectorApiState;
  warnings: readonly IngestDashboardWarning[];
  errors: readonly IngestDashboardError[];
}): IngestDashboardSummary {
  const sourceStatusCounts = countSourceStatuses(input.ingestApiState);
  const indexedItemCount = sum(
    input.ingestApiState.sources,
    (source) => source.indexedCount,
  );
  const queuedItemCount = sum(
    input.ingestApiState.sources,
    (source) => source.queuedCount ?? 0,
  );
  const quarantinedSourceItemCount = sum(
    input.ingestApiState.sources,
    (source) => source.quarantinedCount ?? 0,
  );
  const summary: IngestDashboardSummary = {
    id: "ingest_dashboard_summary",
    generatedAt: input.generatedAt,
    status: input.status,
    localOnly: input.localOnly,
    noNetwork: input.noNetwork,
    connectorRequestCount: input.connectorApiState.requestCount,
    successfulConnectorRequestCount:
      input.connectorApiState.successfulRequestCount,
    failedConnectorRequestCount: input.connectorApiState.failedRequestCount,
    connectorCount: input.connectorApiState.connectorCount,
    readyConnectorCount: input.connectorApiState.connectorState.readyCount,
    attentionConnectorCount:
      input.connectorApiState.connectorState.attentionCount,
    errorConnectorCount: input.connectorApiState.connectorState.errorCount,
    ingestSourceCount: input.ingestApiState.sources.length,
    readySourceCount: sourceStatusCounts.ready,
    attentionSourceCount: sourceStatusCounts.attention,
    errorSourceCount: sourceStatusCounts.error,
    indexedItemCount,
    queuedItemCount,
    quarantinedSourceItemCount,
    searchResultCount: input.ingestApiState.searchRows.length,
    quarantineTotalCount: input.ingestApiState.quarantineQueue.totalCount,
    quarantinePendingCount: input.ingestApiState.quarantineQueue.pendingCount,
    quarantineDecidedCount: input.ingestApiState.quarantineQueue.decidedCount,
    warningCount: input.warnings.length,
    errorCount: input.errors.length,
    redactionCount: input.redactionCount,
    valueLabel: [
      formatCount(input.connectorApiState.connectorCount, "connector"),
      formatCount(input.ingestApiState.sources.length, "source"),
    ].join(", "),
    detailLabels: [
      formatCount(input.connectorApiState.requestCount, "connector request"),
      formatCount(indexedItemCount, "indexed item"),
      formatCount(input.ingestApiState.searchRows.length, "search result"),
      formatCount(input.ingestApiState.quarantineQueue.pendingCount, "pending quarantine item"),
      formatCount(input.warnings.length, "warning"),
      formatCount(input.errors.length, "error"),
      formatCount(input.redactionCount, "redaction"),
      `Local only: ${input.localOnly ? "yes" : "no"}`,
      `No network: ${input.noNetwork ? "yes" : "no"}`,
      `Generated at ${input.generatedAt}`,
    ],
    ariaLabel: "",
  };

  return {
    ...summary,
    ariaLabel: buildSummaryAriaLabel(summary, summary.status),
  };
}

function buildSummaryAriaLabel(
  summary: IngestDashboardSummary,
  status: IngestDashboardStatus,
): string {
  return [
    "Ingest dashboard summary",
    formatCount(summary.connectorCount, "connector"),
    formatCount(summary.ingestSourceCount, "source"),
    formatCount(summary.searchResultCount, "search result"),
    formatCount(summary.quarantinePendingCount, "pending quarantine item"),
    formatCount(summary.warningCount, "warning"),
    formatCount(summary.errorCount, "error"),
    `status ${status}`,
  ].join(", ");
}

function buildConnectorReadiness(
  connectorApiState: IngestConnectorApiState,
): IngestDashboardConnectorReadiness {
  return {
    id: "ingest_dashboard_connector_readiness",
    status: connectorApiState.status,
    statusLabel: connectorApiState.statusLabel,
    connectorCount: connectorApiState.connectorCount,
    readyCount: connectorApiState.connectorState.readyCount,
    attentionCount: connectorApiState.connectorState.attentionCount,
    errorCount: connectorApiState.connectorState.errorCount,
    warningCount: connectorApiState.warningCount,
    requestCount: connectorApiState.requestCount,
    successfulRequestCount: connectorApiState.successfulRequestCount,
    failedRequestCount: connectorApiState.failedRequestCount,
    ariaLabel: [
      "Connector readiness",
      connectorApiState.statusLabel,
      formatCount(connectorApiState.connectorCount, "connector"),
      formatCount(connectorApiState.warningCount, "warning"),
    ].join(", "),
  };
}

function buildDashboardCards(
  summary: IngestDashboardSummary,
): IngestDashboardCard[] {
  return [
    createCard(
      "ingest_dashboard_card.connectors",
      "Connectors",
      summary.connectorCount,
      connectorCountStatus(summary),
      "connector",
      "Connector manifests available for local ingest workflows.",
      [
        formatCount(summary.readyConnectorCount, "ready connector"),
        formatCount(summary.attentionConnectorCount, "connector needing review"),
        formatCount(summary.errorConnectorCount, "blocked connector"),
      ],
    ),
    createCard(
      "ingest_dashboard_card.sources",
      "Sources",
      summary.ingestSourceCount,
      sourceCountStatus(summary),
      "source",
      "Ingest sources captured from local API fixtures.",
      [
        formatCount(summary.readySourceCount, "ready source"),
        formatCount(summary.attentionSourceCount, "source needing review"),
        formatCount(summary.errorSourceCount, "source with errors"),
      ],
    ),
    createCard(
      "ingest_dashboard_card.indexed_items",
      "Indexed items",
      summary.indexedItemCount,
      summary.indexedItemCount > 0 ? "ready" : "empty",
      "indexed item",
      "Items already represented in search source summaries.",
      [formatCount(summary.queuedItemCount, "queued item")],
    ),
    createCard(
      "ingest_dashboard_card.search_results",
      "Search results",
      summary.searchResultCount,
      summary.searchResultCount > 0 ? "ready" : "empty",
      "search result",
      "Search rows prepared for the dashboard.",
    ),
    createCard(
      "ingest_dashboard_card.quarantine_pending",
      "Pending quarantine",
      summary.quarantinePendingCount,
      summary.quarantinePendingCount > 0 ? "attention" : "ready",
      "pending item",
      "Quarantine items still waiting for a decision.",
      [
        formatCount(summary.quarantineTotalCount, "total quarantine item"),
        formatCount(summary.quarantineDecidedCount, "decided quarantine item"),
      ],
    ),
    createCard(
      "ingest_dashboard_card.warnings",
      "Warnings",
      summary.warningCount,
      summary.warningCount > 0 ? "attention" : "ready",
      "warning",
      "Connector warnings aggregated for review.",
    ),
    createCard(
      "ingest_dashboard_card.errors",
      "Errors",
      summary.errorCount,
      summary.errorCount > 0 ? "error" : "ready",
      "error",
      "Ingest and connector API errors aggregated for review.",
    ),
    createCard(
      "ingest_dashboard_card.redactions",
      "Redactions",
      summary.redactionCount,
      summary.redactionCount > 0 ? "attention" : "ready",
      "redaction",
      "Sensitive values omitted from dashboard output.",
    ),
  ];
}

function buildDashboardSections(input: {
  summary: IngestDashboardSummary;
  indicators: readonly IngestDashboardIndicator[];
  cards: readonly IngestDashboardCard[];
  warnings: readonly IngestDashboardWarning[];
  errors: readonly IngestDashboardError[];
  ingestApiState: IngestApiState;
  connectorApiState: IngestConnectorApiState;
}): IngestDashboardSection[] {
  const overviewCards = input.cards.slice();

  return [
    createSection({
      id: "overview",
      label: "Overview",
      title: "Overview",
      description: "High-level ingest dashboard health and safety indicators.",
      status: input.summary.status,
      cards: overviewCards,
      items: input.indicators.map(indicatorToItem),
      emptyState: {
        label: "No dashboard data",
        description: "Load captured ingest and connector API fixtures.",
        ariaLabel: "No ingest dashboard data is available",
      },
    }),
    createSection({
      id: "connectors",
      label: "Connectors",
      title: "Connectors",
      description: "Connector readiness cards composed from connector API state.",
      status: connectorCountStatus(input.summary),
      cards: [cardById(input.cards, "ingest_dashboard_card.connectors")],
      items: input.connectorApiState.cards.map(connectorCardToItem),
      emptyState: {
        label: "No connectors",
        description: "Connector cards will appear after a manifest loads.",
        ariaLabel: "No ingest connectors are available",
      },
    }),
    createSection({
      id: "sources",
      label: "Sources",
      title: "Sources",
      description: "Source cards composed from ingest API state.",
      status: sourceCountStatus(input.summary),
      cards: [
        cardById(input.cards, "ingest_dashboard_card.sources"),
        cardById(input.cards, "ingest_dashboard_card.indexed_items"),
      ],
      items: input.ingestApiState.sourceCards.map(sourceCardToItem),
      emptyState: {
        label: "No sources",
        description: "Ingest source cards will appear after source fixtures load.",
        ariaLabel: "No ingest sources are available",
      },
    }),
    createSection({
      id: "search",
      label: "Search",
      title: "Search",
      description: "Search result rows composed from ingest API state.",
      status: input.summary.searchResultCount > 0 ? "ready" : "empty",
      cards: [cardById(input.cards, "ingest_dashboard_card.search_results")],
      items: input.ingestApiState.searchRows.map(searchRowToItem),
      emptyState: {
        label: "No search results",
        description: "Search rows will appear after a search response loads.",
        ariaLabel: "No ingest search results are available",
      },
    }),
    createSection({
      id: "quarantine",
      label: "Quarantine",
      title: "Quarantine",
      description: "Quarantine queue items composed from ingest API state.",
      status:
        input.summary.quarantinePendingCount > 0
          ? "attention"
          : input.summary.quarantineTotalCount > 0
            ? "ready"
            : "empty",
      cards: [cardById(input.cards, "ingest_dashboard_card.quarantine_pending")],
      items: input.ingestApiState.quarantineQueue.items.map(quarantineItemToItem),
      emptyState: {
        label: "No quarantine items",
        description: "Quarantine items will appear when review cases are captured.",
        ariaLabel: "No ingest quarantine items are available",
      },
    }),
    createSection({
      id: "warnings",
      label: "Warnings",
      title: "Warnings",
      description: "Connector warnings aggregated across the dashboard.",
      status: input.warnings.length > 0 ? "attention" : "ready",
      cards: [cardById(input.cards, "ingest_dashboard_card.warnings")],
      items: input.warnings.map(warningToItem),
      emptyState: {
        label: "No warnings",
        description: "No connector warnings are present in the loaded fixtures.",
        ariaLabel: "No ingest dashboard warnings are available",
      },
    }),
    createSection({
      id: "errors",
      label: "Errors",
      title: "Errors",
      description: "Ingest and connector API errors aggregated across the dashboard.",
      status: input.errors.length > 0 ? "error" : "ready",
      cards: [
        cardById(input.cards, "ingest_dashboard_card.errors"),
        cardById(input.cards, "ingest_dashboard_card.redactions"),
      ],
      items: input.errors.map(errorToItem),
      emptyState: {
        label: "No errors",
        description: "No ingest or connector API errors are present.",
        ariaLabel: "No ingest dashboard errors are available",
      },
    }),
  ];
}

function buildDashboardWarnings(
  connectorApiState: IngestConnectorApiState,
): IngestDashboardWarning[] {
  return connectorApiState.connectorState.warnings
    .map((warning) => dashboardWarningFromConnectorWarning(warning))
    .sort(compareWarnings);
}

function dashboardWarningFromConnectorWarning(
  warning: IngestConnectorWarning,
): IngestDashboardWarning {
  const dashboardWarning: IngestDashboardWarning = {
    id: `ingest_dashboard_warning.${warning.id}`,
    source: "connector",
    connectorId: warning.connectorId,
    code: warning.code,
    severity: warning.severity,
    title: warning.label,
    description: warning.description,
    ariaLabel: [
      warning.label,
      warning.connectorId,
      warning.severity,
      warning.description,
    ].join(", "),
  };

  if (warning.fieldPath !== undefined) {
    dashboardWarning.fieldPath = warning.fieldPath;
  }

  return dashboardWarning;
}

function buildDashboardErrors(
  ingestApiState: IngestApiState,
  connectorApiState: IngestConnectorApiState,
): IngestDashboardError[] {
  return [
    ...ingestApiState.errorStates.map(dashboardErrorFromIngestError),
    ...connectorApiState.errorStates.map(dashboardErrorFromConnectorError),
  ].sort(compareErrors);
}

function dashboardErrorFromIngestError(
  error: IngestApiContextErrorState,
): IngestDashboardError {
  const dashboardError: IngestDashboardError = {
    id: `ingest_dashboard_error.ingest.${error.id}`,
    source: "ingest",
    context: error.context,
    title: error.errorState.label,
    description: error.errorState.description,
    retryLabel: error.errorState.retryLabel,
    redacted: containsRedactionMarker(error.errorState.description),
    redactionCount: 0,
    ariaLabel: [
      error.errorState.label,
      error.context,
      error.errorState.description,
    ].join(", "),
  };

  if (error.routeId !== undefined) {
    dashboardError.routeId = error.routeId;
  }
  if (error.routePath !== undefined) {
    dashboardError.routePath = error.routePath;
  }
  if (error.status !== undefined) {
    dashboardError.status = error.status;
  }

  return dashboardError;
}

function dashboardErrorFromConnectorError(
  error: IngestConnectorApiErrorState,
): IngestDashboardError {
  const dashboardError: IngestDashboardError = {
    id: `ingest_dashboard_error.connector.${error.id}`,
    source: "connector",
    context: error.context,
    title: error.errorState.label,
    description: error.errorState.description,
    retryLabel: error.errorState.retryLabel,
    redacted: error.redacted || containsRedactionMarker(error.errorState.description),
    redactionCount: error.redactionCount,
    ariaLabel: [
      error.errorState.label,
      error.context,
      error.errorState.description,
    ].join(", "),
  };

  if (error.routeId !== undefined) {
    dashboardError.routeId = error.routeId;
  }
  if (error.method !== undefined) {
    dashboardError.method = error.method;
  }
  if (error.routePath !== undefined) {
    dashboardError.routePath = error.routePath;
  }
  if (error.status !== undefined) {
    dashboardError.status = error.status;
  }

  return dashboardError;
}

function buildIndicators(
  ingestApiFixture: unknown,
  connectorApiFixture: unknown,
): { localOnly: IngestDashboardIndicator; noNetwork: IngestDashboardIndicator } {
  const evidence = mergeNetworkEvidence(
    collectNetworkEvidence(ingestApiFixture),
    collectNetworkEvidence(connectorApiFixture),
  );
  const localOnly = evidence.localOnlySeen && !evidence.localOnlyFalseSeen;
  const noNetwork =
    !evidence.externalNetworkSeen &&
    !evidence.networkAccessSeen &&
    (evidence.networkDisabledSeen || localOnly);

  return {
    localOnly: {
      id: "ingest_dashboard_indicator.local_only",
      label: "Local only",
      enabled: localOnly,
      status: localOnly ? "ready" : "attention",
      description: localOnly
        ? "Loaded fixtures declare local-only ingest handling."
        : "Loaded fixtures do not fully declare local-only ingest handling.",
      ariaLabel: `Local only indicator ${localOnly ? "enabled" : "not enabled"}`,
    },
    noNetwork: {
      id: "ingest_dashboard_indicator.no_network",
      label: "No network",
      enabled: noNetwork,
      status: noNetwork ? "ready" : "attention",
      description: noNetwork
        ? "Loaded fixtures do not require external network access."
        : "Loaded fixtures include or imply external network access.",
      ariaLabel: `No network indicator ${noNetwork ? "enabled" : "not enabled"}`,
    },
  };
}

function indicatorToItem(
  indicator: IngestDashboardIndicator,
): IngestDashboardSectionItem {
  return {
    id: `ingest_dashboard_item.${indicator.id}`,
    kind: "indicator",
    title: indicator.label,
    status: indicator.status,
    valueLabel: indicator.enabled ? "Enabled" : "Not enabled",
    detailLabels: [indicator.description],
    ariaLabel: indicator.ariaLabel,
  };
}

function connectorCardToItem(card: IngestConnectorApiState["cards"][number]): IngestDashboardSectionItem {
  return {
    id: `ingest_dashboard_item.${card.id}`,
    kind: "connector",
    title: card.title,
    status: connectorStatusToDashboardStatus(card.status),
    valueLabel: card.valueLabel,
    detailLabels: card.detailLabels,
    ariaLabel: card.ariaLabel,
  };
}

function sourceCardToItem(card: IngestApiState["sourceCards"][number]): IngestDashboardSectionItem {
  return {
    id: `ingest_dashboard_item.${card.id}`,
    kind: "source",
    title: card.title,
    status: viewStatusToDashboardStatus(card.status),
    valueLabel: card.valueLabel,
    detailLabels: card.detailLabels,
    ariaLabel: card.ariaLabel,
  };
}

function searchRowToItem(row: IngestApiState["searchRows"][number]): IngestDashboardSectionItem {
  return {
    id: `ingest_dashboard_item.${row.id}`,
    kind: "search_result",
    title: row.title,
    status: "ready",
    valueLabel: row.scoreLabel,
    detailLabels: [
      row.kindLabel,
      `Source: ${row.sourceLabel}`,
      formatCount(row.snippet.matchCount, "query match"),
    ],
    ariaLabel: row.ariaLabel,
  };
}

function quarantineItemToItem(
  item: IngestApiState["quarantineQueue"]["items"][number],
): IngestDashboardSectionItem {
  return {
    id: `ingest_dashboard_item.${item.id}`,
    kind: "quarantine_item",
    title: item.title,
    status: viewStatusToDashboardStatus(item.status),
    valueLabel: item.decisionLabel.label,
    detailLabels: item.detailLabels,
    ariaLabel: item.ariaLabel,
  };
}

function warningToItem(warning: IngestDashboardWarning): IngestDashboardSectionItem {
  return {
    id: `ingest_dashboard_item.${warning.id}`,
    kind: "warning",
    title: warning.title,
    status: warning.severity === "blocking" ? "error" : "attention",
    valueLabel: warning.severity,
    detailLabels: [
      `Connector: ${warning.connectorId}`,
      `Code: ${warning.code}`,
      warning.fieldPath === undefined ? undefined : `Field: ${warning.fieldPath}`,
      warning.description,
    ].filter(isDefined),
    ariaLabel: warning.ariaLabel,
  };
}

function errorToItem(error: IngestDashboardError): IngestDashboardSectionItem {
  return {
    id: `ingest_dashboard_item.${error.id}`,
    kind: "error",
    title: error.title,
    status: "error",
    valueLabel:
      error.status === undefined
        ? error.source
        : `${error.source} HTTP ${error.status}`,
    detailLabels: [
      `Context: ${error.context}`,
      error.routePath === undefined ? undefined : `Route: ${error.routePath}`,
      error.description,
      error.redacted ? formatCount(error.redactionCount, "redaction") : undefined,
    ].filter(isDefined),
    ariaLabel: error.ariaLabel,
  };
}

function createSection(input: {
  id: IngestDashboardSectionId;
  label: string;
  title: string;
  description: string;
  status: IngestDashboardStatus;
  cards: readonly IngestDashboardCard[];
  items: readonly IngestDashboardSectionItem[];
  emptyState: IngestDashboardEmptyState;
}): IngestDashboardSection {
  return {
    ...input,
    count: input.items.length,
    cards: input.cards.map((card) => clonePlain(card)),
    items: input.items.map((item) => clonePlain(item)),
    emptyState: clonePlain(input.emptyState),
    ariaLabel: [
      input.label,
      formatCount(input.items.length, "item"),
      `status ${input.status}`,
    ].join(", "),
  };
}

function createCard(
  id: string,
  label: string,
  value: number,
  status: IngestDashboardStatus,
  singular: string,
  helperText: string,
  detailLabels: readonly string[] = [],
): IngestDashboardCard {
  const valueLabel = formatCount(value, singular);
  return {
    id,
    label,
    value,
    valueLabel,
    status,
    helperText,
    detailLabels: [...detailLabels],
    ariaLabel: `${label}: ${valueLabel}. ${helperText}`,
  };
}

function cardById(
  cards: readonly IngestDashboardCard[],
  id: string,
): IngestDashboardCard {
  const card = cards.find((item) => item.id === id);
  if (card === undefined) {
    throw new Error(`Missing ingest dashboard card ${id}`);
  }
  return card;
}

function resolveDashboardStatus(
  summary: IngestDashboardSummary,
  connectorReadiness: IngestDashboardConnectorReadiness,
): IngestDashboardStatus {
  if (
    summary.errorCount > 0 ||
    summary.errorConnectorCount > 0 ||
    connectorReadiness.status === "error"
  ) {
    return "error";
  }
  if (
    summary.warningCount > 0 ||
    summary.quarantinePendingCount > 0 ||
    summary.attentionSourceCount > 0 ||
    summary.attentionConnectorCount > 0 ||
    connectorReadiness.status === "attention" ||
    !summary.localOnly ||
    !summary.noNetwork
  ) {
    return "attention";
  }
  if (
    summary.connectorCount > 0 ||
    summary.ingestSourceCount > 0 ||
    summary.searchResultCount > 0 ||
    summary.quarantineTotalCount > 0
  ) {
    return "ready";
  }
  return "empty";
}

function connectorCountStatus(
  summary: IngestDashboardSummary,
): IngestDashboardStatus {
  if (summary.errorConnectorCount > 0) {
    return "error";
  }
  if (summary.attentionConnectorCount > 0) {
    return "attention";
  }
  return summary.connectorCount > 0 ? "ready" : "empty";
}

function sourceCountStatus(
  summary: IngestDashboardSummary,
): IngestDashboardStatus {
  if (summary.errorSourceCount > 0) {
    return "error";
  }
  if (summary.attentionSourceCount > 0) {
    return "attention";
  }
  return summary.ingestSourceCount > 0 ? "ready" : "empty";
}

function connectorStatusToDashboardStatus(
  status: IngestConnectorReadinessStatus,
): IngestDashboardStatus {
  switch (status) {
    case "empty":
      return "empty";
    case "ready":
      return "ready";
    case "attention":
      return "attention";
    case "error":
      return "error";
  }
}

function viewStatusToDashboardStatus(
  status: IngestSearchViewStatus,
): IngestDashboardStatus {
  switch (status) {
    case "empty":
      return "empty";
    case "ready":
    case "complete":
    case "indexing":
      return "ready";
    case "attention":
      return "attention";
    case "error":
      return "error";
  }
}

function countSourceStatuses(state: IngestApiState): {
  ready: number;
  attention: number;
  error: number;
} {
  return {
    ready: state.sources.filter((source) => source.status === "ready").length,
    attention: state.sources.filter((source) => source.status === "attention")
      .length,
    error: state.sources.filter((source) => source.status === "error").length,
  };
}

function collectNetworkEvidence(
  value: unknown,
  key = "",
  seen = new WeakSet<object>(),
): NetworkEvidence {
  const evidence = emptyNetworkEvidence();

  if (value === null || value === undefined) {
    return evidence;
  }

  if (typeof value === "boolean") {
    if (isLocalOnlyKey(key)) {
      if (value) {
        evidence.localOnlySeen = true;
      } else {
        evidence.localOnlyFalseSeen = true;
      }
    }
    if (isNetworkAccessKey(key)) {
      if (value) {
        evidence.networkAccessSeen = true;
      } else {
        evidence.networkDisabledSeen = true;
      }
    }
    return evidence;
  }

  if (typeof value === "string") {
    if (isNetworkModeKey(key) && isDisabledNetworkMode(value)) {
      evidence.networkDisabledSeen = true;
    }
    if (isUrlKey(key)) {
      if (isExternalUrl(value)) {
        evidence.externalNetworkSeen = true;
      } else if (isLocalUrl(value)) {
        evidence.networkDisabledSeen = true;
      }
    }
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
      mergeNetworkEvidenceInto(evidence, collectNetworkEvidence(item, key, seen));
    }
    return evidence;
  }

  for (const [entryKey, entryValue] of Object.entries(value as AnyRecord)) {
    mergeNetworkEvidenceInto(
      evidence,
      collectNetworkEvidence(entryValue, entryKey, seen),
    );
  }

  return evidence;
}

function mergeNetworkEvidence(
  left: NetworkEvidence,
  right: NetworkEvidence,
): NetworkEvidence {
  const merged = emptyNetworkEvidence();
  mergeNetworkEvidenceInto(merged, left);
  mergeNetworkEvidenceInto(merged, right);
  return merged;
}

function mergeNetworkEvidenceInto(
  target: NetworkEvidence,
  source: NetworkEvidence,
): void {
  target.localOnlySeen ||= source.localOnlySeen;
  target.localOnlyFalseSeen ||= source.localOnlyFalseSeen;
  target.networkDisabledSeen ||= source.networkDisabledSeen;
  target.networkAccessSeen ||= source.networkAccessSeen;
  target.externalNetworkSeen ||= source.externalNetworkSeen;
}

function emptyNetworkEvidence(): NetworkEvidence {
  return {
    localOnlySeen: false,
    localOnlyFalseSeen: false,
    networkDisabledSeen: false,
    networkAccessSeen: false,
    externalNetworkSeen: false,
  };
}

function isLocalOnlyKey(key: string): boolean {
  return normalizeToken(key) === "local_only";
}

function isNetworkAccessKey(key: string): boolean {
  const token = normalizeToken(key);
  return token === "network_access" || token === "allow_network";
}

function isNetworkModeKey(key: string): boolean {
  return normalizeToken(key) === "mode";
}

function isDisabledNetworkMode(value: string): boolean {
  return ["disabled", "none", "off", "local", "no_network"].includes(
    normalizeToken(value),
  );
}

function isUrlKey(key: string): boolean {
  const token = normalizeToken(key);
  return [
    "api_base",
    "base_url",
    "url",
    "endpoint",
    "href",
  ].includes(token);
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
    if (url.protocol === "local:" || url.protocol === "file:") {
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

function sanitizeValue<T>(
  value: T,
  key = "",
  seen = new WeakMap<object, unknown>(),
): SanitizedValue<T> {
  if (typeof value === "string") {
    const redacted = redactSensitiveText(value);
    return {
      value: redacted.text as T,
      redactionCount: redacted.redactionCount,
    };
  }

  if (
    value === undefined ||
    value === null ||
    typeof value !== "object"
  ) {
    return {
      value,
      redactionCount: 0,
    };
  }

  if (isSensitiveKey(key) && !isRedactionMarker(value)) {
    return {
      value: "[redacted-secret]" as T,
      redactionCount: 1,
    };
  }

  const objectValue = value as object;
  const existing = seen.get(objectValue);
  if (existing !== undefined) {
    return {
      value: existing as T,
      redactionCount: 0,
    };
  }

  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    let redactionCount = 0;
    seen.set(objectValue, copy);

    for (const item of value) {
      const sanitized = sanitizeValue(item, key, seen);
      copy.push(sanitized.value);
      redactionCount += sanitized.redactionCount;
    }

    return {
      value: copy as T,
      redactionCount,
    };
  }

  const copy: AnyRecord = {};
  let redactionCount = 0;
  seen.set(objectValue, copy);

  for (const [entryKey, entryValue] of Object.entries(value as AnyRecord)) {
    const sanitized = sanitizeValue(entryValue, entryKey, seen);
    copy[entryKey] = sanitized.value;
    redactionCount += sanitized.redactionCount;
  }

  return {
    value: copy as T,
    redactionCount,
  };
}

function redactSensitiveText(value: string): RedactedText {
  let text = value;
  let redactionCount = 0;
  const replace = (
    pattern: RegExp,
    replacement: string | ((match: string, ...args: string[]) => string),
  ) => {
    text = text.replace(pattern, (...args) => {
      const match = args[0];
      if (containsRedactionMarker(match)) {
        return match;
      }
      redactionCount += 1;
      if (typeof replacement === "function") {
        return replacement(match, ...(args.slice(1, -2) as string[]));
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
    (_match, keyText) => `${keyText}=[redacted-secret]`,
  );
  replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{6,}/gi, "Bearer [redacted-secret]");
  replace(/\b(?:sk|rk|pat|glpat|github_pat)-[A-Za-z0-9_-]{8,}\b/gi, "[redacted-secret]");
  replace(/\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]{8,}\b/gi, "[redacted-secret]");
  replace(
    /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    "[redacted-secret]",
  );
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
    /(?:^|[\\/])\.?codex[-_ ]?private(?:[\\/][^\s,;'"<>()[\]]*)?/gi,
    "[redacted-path]",
  );
  replace(/\bcodex[-_ ]?private\b/gi, "[redacted-path]");
  replace(/\bprivate[-_\s]?plan(?:[-_\s]?pack)?\b/gi, "[redacted-path]");
  replace(/\b(?:file_)?[a-z]_users_[a-z0-9_]+/gi, "[redacted-path]");

  text = text
    .replace(/(?:\[redacted-path\]){2,}/g, "[redacted-path]")
    .replace(/(?:\[redacted-secret\]){2,}/g, "[redacted-secret]")
    .replace(/\s+/g, " ")
    .trim();

  return {
    text,
    redactionCount,
  };
}

function isSensitiveKey(key: string): boolean {
  if (/(checksum|fingerprint|sha256|hash|digest)/i.test(key)) {
    return false;
  }
  return /(api.?key|token|secret|password|credential|authorization|private.?key)/i.test(
    key,
  );
}

function isRedactionMarker(value: unknown): boolean {
  return typeof value === "string" && containsRedactionMarker(value);
}

function containsRedactionMarker(value: string): boolean {
  return /\[redacted-(?:secret|path)\]/i.test(value);
}

function compareWarnings(
  left: IngestDashboardWarning,
  right: IngestDashboardWarning,
): number {
  return (
    warningSeverityRank(left.severity) - warningSeverityRank(right.severity) ||
    left.connectorId.localeCompare(right.connectorId) ||
    left.code.localeCompare(right.code) ||
    (left.fieldPath ?? "").localeCompare(right.fieldPath ?? "") ||
    left.id.localeCompare(right.id)
  );
}

function compareErrors(
  left: IngestDashboardError,
  right: IngestDashboardError,
): number {
  return (
    errorSourceRank(left.source) - errorSourceRank(right.source) ||
    left.context.localeCompare(right.context) ||
    (left.routePath ?? "").localeCompare(right.routePath ?? "") ||
    (left.routeId ?? "").localeCompare(right.routeId ?? "") ||
    left.id.localeCompare(right.id)
  );
}

function warningSeverityRank(severity: string): number {
  switch (severity) {
    case "blocking":
      return 0;
    case "warning":
      return 1;
    case "info":
      return 2;
    default:
      return 3;
  }
}

function errorSourceRank(source: IngestDashboardErrorSource): number {
  switch (source) {
    case "ingest":
      return 0;
    case "connector":
      return 1;
  }
}

function timestampFromInput(input: unknown): string | undefined {
  if (!isRecord(input)) {
    return undefined;
  }
  return timestampField(input, "generatedAt", "generated_at", "createdAt", "created_at");
}

function latestTimestamp(values: readonly (string | undefined)[]): string {
  const timestamps = values
    .filter((value): value is string => value !== undefined)
    .map((value) => normalizeTimestamp(value))
    .filter((value): value is string => value !== undefined)
    .sort(compareTimestamps);

  return timestamps.at(-1) ?? DEFAULT_TIMESTAMP;
}

function timestampField(
  record: AnyRecord,
  ...keys: readonly string[]
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      return normalizeTimestamp(value);
    }
  }
  return undefined;
}

function normalizeTimestamp(value: string): string | undefined {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function compareTimestamps(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
    return left.localeCompare(right);
  }

  return leftTime - rightTime || left.localeCompare(right);
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

function clonePlain<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString() as T;
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
  for (const [key, entryValue] of Object.entries(value as AnyRecord)) {
    cloned[key] = clonePlain(entryValue, seen);
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
