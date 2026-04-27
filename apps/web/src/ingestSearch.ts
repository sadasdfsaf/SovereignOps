export const INGEST_SOURCE_STATUSES = [
  "ready",
  "indexing",
  "paused",
  "attention",
  "error",
] as const;

export type IngestSourceStatus = (typeof INGEST_SOURCE_STATUSES)[number];

export const INGEST_QUARANTINE_DECISIONS = [
  "pending",
  "release",
  "retry",
  "discard",
] as const;

export type IngestQuarantineDecision =
  (typeof INGEST_QUARANTINE_DECISIONS)[number];

export const INGEST_QUARANTINE_REASONS = [
  "parse_error",
  "unsupported_type",
  "duplicate",
  "failed_validation",
  "source_unavailable",
] as const;

export type IngestQuarantineReason =
  (typeof INGEST_QUARANTINE_REASONS)[number];

export type IngestSearchViewStatus =
  | "empty"
  | "ready"
  | "indexing"
  | "attention"
  | "error"
  | "complete";

export type IngestSearchStateContext = "sources" | "search" | "quarantine";

export interface IngestSourceSummary {
  id: string;
  label: string;
  kind: string;
  status: IngestSourceStatus;
  indexedCount: number;
  queuedCount?: number;
  quarantinedCount?: number;
  lastIndexedAt?: string;
  lastError?: string;
}

export interface IngestSourceSummaryCard {
  id: string;
  sourceId: string;
  title: string;
  subtitle: string;
  status: IngestSearchViewStatus;
  statusLabel: string;
  indexedCount: number;
  queuedCount: number;
  quarantinedCount: number;
  valueLabel: string;
  detailLabels: string[];
  ariaLabel: string;
}

export interface IngestSearchResult {
  id: string;
  sourceId: string;
  sourceLabel: string;
  title: string;
  kind: string;
  text: string;
  score?: number;
  url?: string;
  updatedAt?: string;
}

export interface IngestSearchResultRow {
  id: string;
  resultId: string;
  sourceId: string;
  title: string;
  kindLabel: string;
  sourceLabel: string;
  score: number;
  scoreLabel: string;
  url?: string;
  updatedAt?: string;
  snippet: IngestHighlightedSnippet;
  ariaLabel: string;
}

export interface IngestHighlightedSnippet {
  plainText: string;
  segments: IngestSnippetSegment[];
  matchCount: number;
  isTruncated: boolean;
}

export interface IngestSnippetSegment {
  text: string;
  highlighted: boolean;
}

export interface BuildIngestSearchResultRowsOptions {
  query?: string;
  snippetLength?: number;
}

export interface IngestQuarantineItem {
  id: string;
  sourceId: string;
  sourceLabel: string;
  title: string;
  reason: IngestQuarantineReason;
  quarantinedAt: string;
  detail?: string;
  contentType?: string;
  retryCount?: number;
  decision?: IngestQuarantineDecision;
  decidedAt?: string;
  decidedBy?: string;
}

export interface IngestQuarantineQueueState {
  id: "ingest_quarantine_queue";
  label: string;
  ariaLabel: string;
  status: IngestSearchViewStatus;
  totalCount: number;
  pendingCount: number;
  decidedCount: number;
  items: IngestQuarantineQueueItem[];
  emptyState: IngestSearchEmptyState;
  errorState?: IngestSearchErrorState;
}

export interface IngestQuarantineQueueItem {
  id: string;
  itemId: string;
  sourceId: string;
  title: string;
  sourceLabel: string;
  reason: IngestQuarantineReason;
  reasonLabel: string;
  decision: IngestQuarantineDecision;
  decisionLabel: IngestDecisionLabel;
  status: IngestSearchViewStatus;
  quarantinedAt: string;
  decidedAt?: string;
  decidedBy?: string;
  detailLabels: string[];
  ariaLabel: string;
}

export interface BuildIngestQuarantineQueueStateOptions {
  decisionFilter?: IngestQuarantineDecision | "all";
  error?: unknown;
}

export interface IngestDecisionLabel {
  decision: IngestQuarantineDecision;
  label: string;
  description: string;
  status: IngestSearchViewStatus;
}

export interface IngestSearchEmptyState {
  id: string;
  label: string;
  description: string;
  ariaLabel: string;
  actionLabel?: string;
}

export interface IngestSearchErrorState {
  id: string;
  label: string;
  description: string;
  ariaLabel: string;
  retryLabel: string;
}

export interface BuildIngestSearchEmptyStateOptions {
  query?: string;
  actionLabel?: string;
}

export function buildIngestSourceSummaryCards(
  sources: readonly IngestSourceSummary[],
): IngestSourceSummaryCard[] {
  return sources
    .map(buildIngestSourceSummaryCard)
    .sort(compareSourceSummaryCards)
    .map(cloneSourceSummaryCard);
}

export function buildSearchResultRows(
  results: readonly IngestSearchResult[],
  options: BuildIngestSearchResultRowsOptions = {},
): IngestSearchResultRow[] {
  const query = options.query ?? "";
  const snippetLength = normalizeSnippetLength(options.snippetLength);

  return results
    .map((result) => buildSearchResultRow(result, query, snippetLength))
    .sort(compareSearchResultRows)
    .map(cloneSearchResultRow);
}

export function buildHighlightedSnippet(
  text: string,
  query = "",
  snippetLength?: number,
): IngestHighlightedSnippet {
  const maxLength = normalizeSnippetLength(snippetLength);
  const normalizedText = normalizeText(text);

  if (normalizedText === "") {
    return createPlainSnippet("No preview text available.", false);
  }

  const terms = tokenizeSearchQuery(query);
  if (terms.length === 0) {
    return createExcerptSnippet(normalizedText, 0, maxLength, []);
  }

  const firstMatch = findFirstTermMatch(normalizedText, terms);
  if (!firstMatch) {
    return createExcerptSnippet(normalizedText, 0, maxLength, []);
  }

  const contextLength = Math.max(maxLength - firstMatch.length, 0);
  const start = clamp(
    firstMatch.index - Math.floor(contextLength / 2),
    0,
    Math.max(normalizedText.length - maxLength, 0),
  );

  return createExcerptSnippet(normalizedText, start, maxLength, terms);
}

export function buildIngestQuarantineQueueState(
  items: readonly IngestQuarantineItem[],
  options: BuildIngestQuarantineQueueStateOptions = {},
): IngestQuarantineQueueState {
  const decisionFilter = options.decisionFilter ?? "pending";
  const queueItems = items.map(buildQuarantineQueueItem);
  const visibleItems = queueItems
    .filter(
      (item) => decisionFilter === "all" || item.decision === decisionFilter,
    )
    .sort(compareQuarantineQueueItems)
    .map(cloneQuarantineQueueItem);
  const pendingCount = queueItems.filter((item) => item.decision === "pending")
    .length;
  const errorState =
    options.error === undefined
      ? undefined
      : buildIngestSearchErrorState("quarantine", options.error);
  const status: IngestSearchViewStatus = errorState
    ? "error"
    : pendingCount > 0
      ? "attention"
      : items.length > 0
        ? "complete"
        : "empty";

  const state: IngestQuarantineQueueState = {
    id: "ingest_quarantine_queue",
    label: "Quarantine queue",
    ariaLabel: [
      "Quarantine queue",
      formatCount(items.length, "item"),
      formatCount(pendingCount, "pending item"),
    ].join(", "),
    status,
    totalCount: items.length,
    pendingCount,
    decidedCount: items.length - pendingCount,
    items: visibleItems,
    emptyState:
      visibleItems.length === 0
        ? buildQueueEmptyState(decisionFilter, items.length)
        : buildIngestSearchEmptyState("quarantine"),
  };

  if (errorState !== undefined) {
    state.errorState = errorState;
  }

  return state;
}

export function getIngestQuarantineDecisionLabel(
  decision: IngestQuarantineDecision,
): IngestDecisionLabel {
  switch (decision) {
    case "pending":
      return {
        decision,
        label: "Needs review",
        description: "The item is waiting for a queue decision.",
        status: "attention",
      };
    case "release":
      return {
        decision,
        label: "Release to index",
        description: "The item can be added back to searchable content.",
        status: "ready",
      };
    case "retry":
      return {
        decision,
        label: "Retry ingest",
        description: "The item should run through ingest again.",
        status: "indexing",
      };
    case "discard":
      return {
        decision,
        label: "Discard item",
        description: "The item should stay out of searchable content.",
        status: "complete",
      };
  }
}

export function getIngestSourceStatusLabel(status: IngestSourceStatus): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "indexing":
      return "Indexing";
    case "paused":
      return "Paused";
    case "attention":
      return "Needs attention";
    case "error":
      return "Error";
  }
}

export function getIngestQuarantineReasonLabel(
  reason: IngestQuarantineReason,
): string {
  switch (reason) {
    case "parse_error":
      return "Parsing failed";
    case "unsupported_type":
      return "Unsupported type";
    case "duplicate":
      return "Possible duplicate";
    case "failed_validation":
      return "Validation failed";
    case "source_unavailable":
      return "Source unavailable";
  }
}

export function buildIngestSearchEmptyState(
  context: IngestSearchStateContext,
  options: BuildIngestSearchEmptyStateOptions = {},
): IngestSearchEmptyState {
  const state = createEmptyState(context, options.query);
  return options.actionLabel === undefined
    ? state
    : { ...state, actionLabel: options.actionLabel };
}

export function buildIngestSearchErrorState(
  context: IngestSearchStateContext,
  error: unknown,
): IngestSearchErrorState {
  const message = getErrorMessage(error);

  switch (context) {
    case "sources":
      return {
        id: "ingest_sources_error",
        label: "Sources could not load",
        description: message ?? "Refresh the source list and try again.",
        ariaLabel: "Sources could not load",
        retryLabel: "Retry sources",
      };
    case "search":
      return {
        id: "ingest_search_error",
        label: "Search could not run",
        description: message ?? "Check the query and try again.",
        ariaLabel: "Search could not run",
        retryLabel: "Retry search",
      };
    case "quarantine":
      return {
        id: "ingest_quarantine_error",
        label: "Quarantine queue could not load",
        description: message ?? "Refresh the queue and try again.",
        ariaLabel: "Quarantine queue could not load",
        retryLabel: "Retry queue",
      };
  }
}

function buildIngestSourceSummaryCard(
  source: IngestSourceSummary,
): IngestSourceSummaryCard {
  assertNonEmpty(source.id, "source id");
  assertNonEmpty(source.label, "source label");
  assertNonNegativeInteger(source.indexedCount, "indexedCount");

  const queuedCount = source.queuedCount ?? 0;
  const quarantinedCount = source.quarantinedCount ?? 0;
  assertNonNegativeInteger(queuedCount, "queuedCount");
  assertNonNegativeInteger(quarantinedCount, "quarantinedCount");

  const statusLabel = getIngestSourceStatusLabel(source.status);
  const detailLabels = [
    `${statusLabel} source`,
    formatCount(queuedCount, "queued item"),
    formatCount(quarantinedCount, "quarantined item"),
  ];

  if (source.lastIndexedAt !== undefined) {
    assertTimestamp(source.lastIndexedAt, "lastIndexedAt");
    detailLabels.push(`Last indexed at ${source.lastIndexedAt}`);
  }

  if (source.lastError !== undefined && source.lastError.trim() !== "") {
    detailLabels.push(`Last error: ${source.lastError.trim()}`);
  }

  return {
    id: `ingest_source.${source.id}`,
    sourceId: source.id,
    title: source.label,
    subtitle: source.kind,
    status: getSourceViewStatus(source),
    statusLabel,
    indexedCount: source.indexedCount,
    queuedCount,
    quarantinedCount,
    valueLabel: formatCount(source.indexedCount, "indexed item"),
    detailLabels,
    ariaLabel: [
      source.label,
      source.kind,
      statusLabel,
      formatCount(source.indexedCount, "indexed item"),
      formatCount(queuedCount, "queued item"),
      formatCount(quarantinedCount, "quarantined item"),
    ].join(", "),
  };
}

function buildSearchResultRow(
  result: IngestSearchResult,
  query: string,
  snippetLength: number,
): IngestSearchResultRow {
  assertNonEmpty(result.id, "result id");
  assertNonEmpty(result.sourceId, "source id");
  assertNonEmpty(result.title, "title");

  if (result.updatedAt !== undefined) {
    assertTimestamp(result.updatedAt, "updatedAt");
  }

  const score = result.score ?? 0;
  if (!Number.isFinite(score)) {
    throw new Error("score must be finite");
  }

  const row: IngestSearchResultRow = {
    id: `search_result.${result.id}`,
    resultId: result.id,
    sourceId: result.sourceId,
    title: result.title,
    kindLabel: result.kind,
    sourceLabel: result.sourceLabel,
    score,
    scoreLabel: formatScore(score),
    snippet: buildHighlightedSnippet(result.text, query, snippetLength),
    ariaLabel: [
      result.title,
      result.kind,
      `from ${result.sourceLabel}`,
      formatScore(score),
    ].join(", "),
  };

  if (result.url !== undefined) {
    row.url = result.url;
  }

  if (result.updatedAt !== undefined) {
    row.updatedAt = result.updatedAt;
  }

  return row;
}

function buildQuarantineQueueItem(
  item: IngestQuarantineItem,
): IngestQuarantineQueueItem {
  assertNonEmpty(item.id, "item id");
  assertNonEmpty(item.sourceId, "source id");
  assertNonEmpty(item.title, "title");
  assertTimestamp(item.quarantinedAt, "quarantinedAt");

  if (item.decidedAt !== undefined) {
    assertTimestamp(item.decidedAt, "decidedAt");
  }

  const retryCount = item.retryCount ?? 0;
  assertNonNegativeInteger(retryCount, "retryCount");

  const decision = item.decision ?? "pending";
  const decisionLabel = getIngestQuarantineDecisionLabel(decision);
  const reasonLabel = getIngestQuarantineReasonLabel(item.reason);
  const detailLabels = [
    reasonLabel,
    `Quarantined at ${item.quarantinedAt}`,
    formatCount(retryCount, "retry"),
  ];

  if (item.contentType !== undefined && item.contentType.trim() !== "") {
    detailLabels.push(`Type: ${item.contentType.trim()}`);
  }

  if (item.detail !== undefined && item.detail.trim() !== "") {
    detailLabels.push(item.detail.trim());
  }

  const queueItem: IngestQuarantineQueueItem = {
    id: `quarantine_item.${item.id}`,
    itemId: item.id,
    sourceId: item.sourceId,
    title: item.title,
    sourceLabel: item.sourceLabel,
    reason: item.reason,
    reasonLabel,
    decision,
    decisionLabel,
    status: decisionLabel.status,
    quarantinedAt: item.quarantinedAt,
    detailLabels,
    ariaLabel: [
      item.title,
      `from ${item.sourceLabel}`,
      reasonLabel,
      decisionLabel.label,
    ].join(", "),
  };

  if (item.decidedAt !== undefined) {
    queueItem.decidedAt = item.decidedAt;
  }

  if (item.decidedBy !== undefined) {
    queueItem.decidedBy = item.decidedBy;
  }

  return queueItem;
}

function buildQueueEmptyState(
  decisionFilter: IngestQuarantineDecision | "all",
  totalCount: number,
): IngestSearchEmptyState {
  if (totalCount === 0 || decisionFilter === "all") {
    return buildIngestSearchEmptyState("quarantine");
  }

  const decision = getIngestQuarantineDecisionLabel(decisionFilter);
  return {
    id: `ingest_quarantine_empty.${decisionFilter}`,
    label: `No ${decision.label.toLocaleLowerCase()} items`,
    description: "No queue items match the selected decision.",
    ariaLabel: `No quarantine items match ${decision.label}`,
  };
}

function createEmptyState(
  context: IngestSearchStateContext,
  query: string | undefined,
): IngestSearchEmptyState {
  switch (context) {
    case "sources":
      return {
        id: "ingest_sources_empty",
        label: "No sources connected",
        description: "Connect a source before running ingest or search.",
        ariaLabel: "No ingest sources are connected",
      };
    case "search": {
      const normalizedQuery = query?.trim();
      return normalizedQuery
        ? {
            id: "ingest_search_empty",
            label: `No results for "${normalizedQuery}"`,
            description: "Try another query or check source coverage.",
            ariaLabel: `No search results for ${normalizedQuery}`,
          }
        : {
            id: "ingest_search_empty",
            label: "Search is ready",
            description: "Enter a query to find indexed content.",
            ariaLabel: "Search is ready for a query",
          };
    }
    case "quarantine":
      return {
        id: "ingest_quarantine_empty",
        label: "No quarantined items",
        description: "Items that need review will appear here.",
        ariaLabel: "No quarantined ingest items are available",
      };
  }
}

function createPlainSnippet(
  plainText: string,
  isTruncated: boolean,
): IngestHighlightedSnippet {
  return {
    plainText,
    segments: [{ text: plainText, highlighted: false }],
    matchCount: 0,
    isTruncated,
  };
}

function createExcerptSnippet(
  text: string,
  start: number,
  length: number,
  terms: readonly string[],
): IngestHighlightedSnippet {
  const end = Math.min(start + length, text.length);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";
  const excerpt = text.slice(start, end);
  const highlights = findHighlightRanges(excerpt, terms);
  const segments = buildSnippetSegments(excerpt, highlights);

  if (prefix !== "") {
    segments.unshift({ text: prefix, highlighted: false });
  }
  if (suffix !== "") {
    segments.push({ text: suffix, highlighted: false });
  }

  return {
    plainText: segments.map((segment) => segment.text).join(""),
    segments,
    matchCount: highlights.length,
    isTruncated: prefix !== "" || suffix !== "",
  };
}

function buildSnippetSegments(
  excerpt: string,
  highlights: readonly HighlightRange[],
): IngestSnippetSegment[] {
  if (highlights.length === 0) {
    return [{ text: excerpt, highlighted: false }];
  }

  const segments: IngestSnippetSegment[] = [];
  let cursor = 0;

  for (const highlight of highlights) {
    if (highlight.start > cursor) {
      segments.push({
        text: excerpt.slice(cursor, highlight.start),
        highlighted: false,
      });
    }

    segments.push({
      text: excerpt.slice(highlight.start, highlight.end),
      highlighted: true,
    });
    cursor = highlight.end;
  }

  if (cursor < excerpt.length) {
    segments.push({ text: excerpt.slice(cursor), highlighted: false });
  }

  return segments;
}

interface HighlightRange {
  start: number;
  end: number;
}

function findHighlightRanges(
  excerpt: string,
  terms: readonly string[],
): HighlightRange[] {
  if (terms.length === 0) {
    return [];
  }

  const lowerExcerpt = excerpt.toLocaleLowerCase();
  const ranges: HighlightRange[] = [];

  for (const term of terms) {
    let fromIndex = 0;
    while (fromIndex < lowerExcerpt.length) {
      const start = lowerExcerpt.indexOf(term, fromIndex);
      if (start === -1) {
        break;
      }

      ranges.push({ start, end: start + term.length });
      fromIndex = start + Math.max(term.length, 1);
    }
  }

  return mergeHighlightRanges(ranges);
}

function mergeHighlightRanges(ranges: readonly HighlightRange[]): HighlightRange[] {
  return ranges
    .slice()
    .sort((left, right) => left.start - right.start || right.end - left.end)
    .reduce<HighlightRange[]>((merged, range) => {
      const previous = merged.at(-1);
      if (!previous || range.start > previous.end) {
        merged.push({ ...range });
      } else if (range.end > previous.end) {
        previous.end = range.end;
      }

      return merged;
    }, []);
}

function findFirstTermMatch(
  text: string,
  terms: readonly string[],
): { index: number; length: number } | undefined {
  const lowerText = text.toLocaleLowerCase();
  let first: { index: number; length: number } | undefined;

  for (const term of terms) {
    const index = lowerText.indexOf(term);
    if (index === -1) {
      continue;
    }
    if (!first || index < first.index) {
      first = { index, length: term.length };
    }
  }

  return first;
}

function tokenizeSearchQuery(query: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];

  for (const token of normalizeText(query).toLocaleLowerCase().split(" ")) {
    if (token !== "" && !seen.has(token)) {
      seen.add(token);
      terms.push(token);
    }
  }

  return terms.sort((left, right) => right.length - left.length);
}

function compareSourceSummaryCards(
  left: IngestSourceSummaryCard,
  right: IngestSourceSummaryCard,
): number {
  return (
    sourceStatusRank(left.status) - sourceStatusRank(right.status) ||
    left.title.localeCompare(right.title) ||
    left.sourceId.localeCompare(right.sourceId)
  );
}

function compareSearchResultRows(
  left: IngestSearchResultRow,
  right: IngestSearchResultRow,
): number {
  return (
    right.score - left.score ||
    compareOptionalTimestampsDescending(left.updatedAt, right.updatedAt) ||
    left.title.localeCompare(right.title) ||
    left.resultId.localeCompare(right.resultId)
  );
}

function compareQuarantineQueueItems(
  left: IngestQuarantineQueueItem,
  right: IngestQuarantineQueueItem,
): number {
  return (
    decisionRank(left.decision) - decisionRank(right.decision) ||
    compareTimestamps(left.quarantinedAt, right.quarantinedAt) ||
    left.itemId.localeCompare(right.itemId)
  );
}

function getSourceViewStatus(source: IngestSourceSummary): IngestSearchViewStatus {
  if (source.status === "error") {
    return "error";
  }
  if (source.status === "attention" || (source.quarantinedCount ?? 0) > 0) {
    return "attention";
  }
  if (source.status === "indexing") {
    return "indexing";
  }
  if (source.status === "paused") {
    return "complete";
  }
  return source.indexedCount > 0 ? "ready" : "empty";
}

function sourceStatusRank(status: IngestSearchViewStatus): number {
  switch (status) {
    case "error":
      return 0;
    case "attention":
      return 1;
    case "indexing":
      return 2;
    case "ready":
      return 3;
    case "complete":
      return 4;
    case "empty":
      return 5;
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

function compareOptionalTimestampsDescending(
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
  return compareTimestamps(right, left);
}

function normalizeSnippetLength(value: number | undefined): number {
  if (value === undefined) {
    return 160;
  }
  if (!Number.isInteger(value) || value < 24) {
    throw new Error("snippetLength must be an integer of at least 24");
  }
  return value;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function formatCount(
  value: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function formatScore(score: number): string {
  return `${Math.round(score * 100)}% match`;
}

function getErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }
  if (typeof error === "string" && error.trim() !== "") {
    return error.trim();
  }
  return undefined;
}

function assertNonEmpty(value: string, name: string): void {
  if (value.trim() === "") {
    throw new Error(`${name} is required`);
  }
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
}

function assertTimestamp(value: string, name: string): void {
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${name} must be a valid timestamp`);
  }
}

function compareTimestamps(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
    throw new Error("timestamps must be valid");
  }

  return leftTime - rightTime || left.localeCompare(right);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function cloneSourceSummaryCard(
  card: IngestSourceSummaryCard,
): IngestSourceSummaryCard {
  return {
    ...card,
    detailLabels: [...card.detailLabels],
  };
}

function cloneSearchResultRow(
  row: IngestSearchResultRow,
): IngestSearchResultRow {
  return {
    ...row,
    snippet: cloneHighlightedSnippet(row.snippet),
  };
}

function cloneHighlightedSnippet(
  snippet: IngestHighlightedSnippet,
): IngestHighlightedSnippet {
  return {
    ...snippet,
    segments: snippet.segments.map((segment) => ({ ...segment })),
  };
}

function cloneQuarantineQueueItem(
  item: IngestQuarantineQueueItem,
): IngestQuarantineQueueItem {
  return {
    ...item,
    decisionLabel: { ...item.decisionLabel },
    detailLabels: [...item.detailLabels],
  };
}
