import {
  buildIngestQuarantineQueueState,
  buildIngestSearchErrorState,
  buildIngestSourceSummaryCards,
  buildSearchResultRows,
  type IngestQuarantineDecision,
  type IngestQuarantineItem,
  type IngestQuarantineQueueState,
  type IngestQuarantineReason,
  type IngestSearchErrorState,
  type IngestSearchResult,
  type IngestSearchResultRow,
  type IngestSearchStateContext,
  type IngestSourceStatus,
  type IngestSourceSummary,
  type IngestSourceSummaryCard,
} from "./ingestSearch.ts";

export interface BuildIngestApiStateOptions {
  query?: string;
  snippetLength?: number;
  decisionFilter?: IngestQuarantineDecision | "all";
  defaultTimestamp?: string;
}

export interface IngestApiState {
  sources: IngestSourceSummary[];
  sourceCards: IngestSourceSummaryCard[];
  searchResults: IngestSearchResult[];
  searchRows: IngestSearchResultRow[];
  quarantineItems: IngestQuarantineItem[];
  quarantineQueue: IngestQuarantineQueueState;
  errorStates: IngestApiContextErrorState[];
}

export interface IngestApiContextErrorState {
  id: string;
  context: IngestSearchStateContext;
  routeId?: string;
  routePath?: string;
  status?: number;
  errorState: IngestSearchErrorState;
}

type AnyRecord = Record<string, unknown>;

interface IngestApiRecord {
  id: string;
  index: number;
  title?: string;
  routePath?: string;
  status?: number;
  requestBody?: AnyRecord;
  responseBody?: AnyRecord;
  generatedAt: string;
}

interface SourcePatch {
  sourceUri: string;
  label?: string;
  kind?: string;
  status?: IngestSourceStatus;
  indexedCount?: number;
  queuedCount?: number;
  quarantinedCount?: number;
  lastIndexedAt?: string;
  lastError?: string;
}

interface MutableSourceSummary extends IngestSourceSummary {
  sourceUri: string;
}

const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";

export function buildIngestApiState(
  input: unknown,
  options: BuildIngestApiStateOptions = {},
): IngestApiState {
  const records = normalizeIngestApiRecords(input, options);
  const sources = collectSourceSummariesFromRecords(records);
  const searchResults = collectSearchResultsFromRecords(records);
  const quarantineItems = collectQuarantineItemsFromRecords(records);
  const errorStates = collectErrorStatesFromRecords(records);
  const searchOptions = {
    query: options.query ?? inferSearchQuery(records),
    snippetLength: options.snippetLength,
  };
  const quarantineOptions: {
    decisionFilter?: IngestQuarantineDecision | "all";
    error?: unknown;
  } = {
    decisionFilter: options.decisionFilter,
  };
  const quarantineError = errorStates.find(
    (error) => error.context === "quarantine",
  );

  if (quarantineError !== undefined) {
    quarantineOptions.error = quarantineError.errorState.description;
  }

  return {
    sources: sources.map((source) => clonePlain(source)),
    sourceCards: buildIngestSourceSummaryCards(sources),
    searchResults: searchResults.map((result) => clonePlain(result)),
    searchRows: buildSearchResultRows(searchResults, searchOptions),
    quarantineItems: quarantineItems.map((item) => clonePlain(item)),
    quarantineQueue: buildIngestQuarantineQueueState(
      quarantineItems,
      quarantineOptions,
    ),
    errorStates: errorStates.map((error) => clonePlain(error)),
  };
}

export function collectIngestApiSourceSummaries(
  input: unknown,
  options: BuildIngestApiStateOptions = {},
): IngestSourceSummary[] {
  return collectSourceSummariesFromRecords(
    normalizeIngestApiRecords(input, options),
  ).map((source) => clonePlain(source));
}

export function buildIngestApiSourceCards(
  input: unknown,
  options: BuildIngestApiStateOptions = {},
): IngestSourceSummaryCard[] {
  return buildIngestSourceSummaryCards(
    collectSourceSummariesFromRecords(normalizeIngestApiRecords(input, options)),
  );
}

export function collectIngestApiSearchResults(
  input: unknown,
  options: BuildIngestApiStateOptions = {},
): IngestSearchResult[] {
  return collectSearchResultsFromRecords(
    normalizeIngestApiRecords(input, options),
  ).map((result) => clonePlain(result));
}

export function buildIngestApiSearchRows(
  input: unknown,
  options: BuildIngestApiStateOptions = {},
): IngestSearchResultRow[] {
  const records = normalizeIngestApiRecords(input, options);
  return buildSearchResultRows(collectSearchResultsFromRecords(records), {
    query: options.query ?? inferSearchQuery(records),
    snippetLength: options.snippetLength,
  });
}

export function collectIngestApiQuarantineItems(
  input: unknown,
  options: BuildIngestApiStateOptions = {},
): IngestQuarantineItem[] {
  return collectQuarantineItemsFromRecords(
    normalizeIngestApiRecords(input, options),
  ).map((item) => clonePlain(item));
}

export function buildIngestApiQuarantineQueueState(
  input: unknown,
  options: BuildIngestApiStateOptions = {},
): IngestQuarantineQueueState {
  const records = normalizeIngestApiRecords(input, options);
  const errorState = collectErrorStatesFromRecords(records).find(
    (error) => error.context === "quarantine",
  );
  return buildIngestQuarantineQueueState(
    collectQuarantineItemsFromRecords(records),
    {
      decisionFilter: options.decisionFilter,
      error: errorState?.errorState.description,
    },
  );
}

export function buildIngestApiErrorStates(
  input: unknown,
  options: BuildIngestApiStateOptions = {},
): IngestApiContextErrorState[] {
  return collectErrorStatesFromRecords(
    normalizeIngestApiRecords(input, options),
  ).map((error) => clonePlain(error));
}

function normalizeIngestApiRecords(
  input: unknown,
  options: BuildIngestApiStateOptions,
): IngestApiRecord[] {
  const root = clonePlain(input);
  const rootTimestamp = isRecord(root)
    ? timestampField(root, "generatedAt", "generated_at")
    : undefined;
  const fallbackTimestamp = normalizeDefaultTimestamp(
    options.defaultTimestamp ?? rootTimestamp,
  );

  if (isRecord(root) && Array.isArray(root.requests)) {
    return root.requests.map((entry, index) =>
      normalizeFixtureRecord(entry, index, fallbackTimestamp),
    );
  }

  if (
    isRecord(root) &&
    (isRecord(root.response) || isRecord(root.request) || isRecord(root.route))
  ) {
    return [normalizeFixtureRecord(root, 0, fallbackTimestamp)];
  }

  if (isRecord(root) && isRecord(root.body)) {
    return [
      {
        id: stringField(root, "id") ?? "api_response",
        index: 0,
        status: integerField(root, "status"),
        responseBody: root.body,
        generatedAt: fallbackTimestamp,
      },
    ];
  }

  return [
    {
      id: "api_response",
      index: 0,
      responseBody: isRecord(root) ? root : undefined,
      generatedAt: fallbackTimestamp,
    },
  ];
}

function normalizeFixtureRecord(
  entry: unknown,
  index: number,
  fallbackTimestamp: string,
): IngestApiRecord {
  const record = isRecord(entry) ? entry : {};
  const route = recordField(record, "route");
  const request = recordField(record, "request");
  const response = recordField(record, "response");
  const generatedAt =
    timestampField(record, "generatedAt", "generated_at") ?? fallbackTimestamp;
  const normalized: IngestApiRecord = {
    id: stringField(record, "id") ?? `api_request_${index + 1}`,
    index,
    title: stringField(record, "title"),
    routePath: stringField(route, "path"),
    status: integerField(response, "status"),
    requestBody: recordField(request, "body"),
    responseBody: recordField(response, "body"),
    generatedAt,
  };

  return normalized;
}

function collectSourceSummariesFromRecords(
  records: readonly IngestApiRecord[],
): IngestSourceSummary[] {
  const sources = new Map<string, MutableSourceSummary>();

  for (const record of records) {
    observeRequestSource(sources, record);
    observeResponseSources(sources, record);
    observeErrorSource(sources, record);
  }

  return [...sources.values()]
    .map(({ sourceUri: _sourceUri, ...source }) => source)
    .sort(compareSourceSummaries)
    .map((source) => clonePlain(source));
}

function observeRequestSource(
  sources: Map<string, MutableSourceSummary>,
  record: IngestApiRecord,
): void {
  const body = record.requestBody;
  if (!body) {
    return;
  }

  const sourceUri = explicitSourceUriFromRecord(body);
  if (sourceUri) {
    upsertSource(sources, {
      sourceUri,
      label: sourceLabel(body, sourceUri),
      kind: mediaTypeFromRecord(body),
      status: "ready",
      indexedCount: 0,
    });
  }
}

function observeResponseSources(
  sources: Map<string, MutableSourceSummary>,
  record: IngestApiRecord,
): void {
  const body = record.responseBody;
  if (!body) {
    return;
  }

  const requestSourceUri = record.requestBody
    ? sourceUriFromRecord(record.requestBody)
    : undefined;
  const summary = recordField(body, "summary");

  if (requestSourceUri && summary) {
    const indexedCount = countField(summary, "indexedCount", "indexed_count");
    const quarantinedCount = countField(
      summary,
      "quarantineCount",
      "quarantine_count",
      "quarantinedCount",
      "quarantined_count",
    );
    const documentCount = countField(
      summary,
      "documentCount",
      "document_count",
    );
    const queuedCount = Math.max(
      documentCount - indexedCount - quarantinedCount,
      0,
    );

    upsertSource(sources, {
      sourceUri: requestSourceUri,
      label: sourceLabel(record.requestBody ?? {}, requestSourceUri),
      kind: mediaTypeFromRecord(record.requestBody ?? {}),
      status: quarantinedCount > 0 ? "attention" : "ready",
      indexedCount,
      queuedCount,
      quarantinedCount,
      lastIndexedAt: record.generatedAt,
    });
  }

  for (const source of arrayField(body, "sources")) {
    if (!isRecord(source)) {
      continue;
    }

    const sourceUri = sourceUriFromRecord(source);
    if (!sourceUri) {
      continue;
    }

    const state = stringField(source, "state", "status");
    const status = sourceStatusFromApiState(state);
    const quarantinedCount = stateHasQuarantine(state) ? 1 : 0;
    const indexedCount = stateHasIndexedContent(state) ? 1 : 0;

    upsertSource(sources, {
      sourceUri,
      label: sourceLabel(source, sourceUri),
      kind: mediaTypeFromRecord(source),
      status,
      indexedCount,
      quarantinedCount,
      lastIndexedAt: indexedCount > 0 ? record.generatedAt : undefined,
    });
  }

  const documentCounts = countDocumentsBySource(arrayField(body, "documents"));
  for (const [sourceUri, count] of documentCounts) {
    upsertSource(sources, {
      sourceUri,
      label: labelFromSourceUri(sourceUri),
      status: "ready",
      indexedCount: count,
      lastIndexedAt: record.generatedAt,
    });
  }

  const results = arrayField(body, "results");
  for (const sourceUri of uniqueSourceUris(results)) {
    upsertSource(sources, {
      sourceUri,
      label: labelFromSourceUri(sourceUri),
      status: "ready",
      indexedCount: 1,
    });
  }

  for (const item of quarantineRawItems(record)) {
    if (!isRecord(item)) {
      continue;
    }
    const sourceUri = sourceUriFromRecord(item);
    if (!sourceUri || !isPendingQuarantineRecord(item)) {
      continue;
    }

    upsertSource(sources, {
      sourceUri,
      label: sourceLabel(item, sourceUri),
      kind: mediaTypeFromRecord(item),
      status: "attention",
      quarantinedCount: 1,
    });
  }

  const sourceUri = sourceUriFromRecord(body);
  if (sourceUri) {
    upsertSource(sources, {
      sourceUri,
      label: sourceLabel(body, sourceUri),
      kind: mediaTypeFromRecord(body),
      status: "ready",
      indexedCount: stringField(body, "normalizedText", "normalized_text")
        ? 0
        : undefined,
    });
  }
}

function observeErrorSource(
  sources: Map<string, MutableSourceSummary>,
  record: IngestApiRecord,
): void {
  const message = apiErrorMessage(record);
  const sourceUri = record.requestBody
    ? explicitSourceUriFromRecord(record.requestBody)
    : undefined;

  if (!message || !sourceUri) {
    return;
  }

  upsertSource(sources, {
    sourceUri,
    label: sourceLabel(record.requestBody ?? {}, sourceUri),
    kind: mediaTypeFromRecord(record.requestBody ?? {}),
    status: "error",
    lastError: message,
  });
}

function collectSearchResultsFromRecords(
  records: readonly IngestApiRecord[],
): IngestSearchResult[] {
  const results = new Map<string, IngestSearchResult>();

  for (const record of records) {
    const body = record.responseBody;
    if (!body) {
      continue;
    }

    for (const rawResult of searchRawResults(body)) {
      const result = mapSearchResult(rawResult, results.size);
      if (!result) {
        continue;
      }

      const previous = results.get(result.id);
      if (!previous || compareSearchInputs(result, previous) < 0) {
        results.set(result.id, result);
      }
    }
  }

  return [...results.values()]
    .sort(compareSearchInputs)
    .map((result) => clonePlain(result));
}

function searchRawResults(body: AnyRecord): unknown[] {
  const raw = [...arrayField(body, "results")];
  const searchResult = body.searchResult ?? body.search_result;

  if (searchResult !== undefined) {
    raw.push(searchResult);
  }

  return raw;
}

function mapSearchResult(
  rawResult: unknown,
  index: number,
): IngestSearchResult | undefined {
  if (!isRecord(rawResult)) {
    return undefined;
  }

  const document = recordField(rawResult, "document") ?? {};
  const sourceUri = sourceUriFromRecord(rawResult) ?? sourceUriFromRecord(document);
  if (!sourceUri) {
    return undefined;
  }

  const title =
    stringField(rawResult, "title") ??
    stringField(document, "title") ??
    stringField(recordField(document, "metadata") ?? {}, "file_name", "fileName") ??
    labelFromSourceUri(sourceUri);
  const text =
    stringField(rawResult, "snippet") ??
    stringField(rawResult, "text") ??
    stringField(rawResult, "content") ??
    stringField(document, "content") ??
    "";
  const id =
    stringField(rawResult, "id") ??
    stringField(document, "id") ??
    stringField(rawResult, "checksum") ??
    stringField(document, "checksum") ??
    stableId("result", `${sourceUri}:${title}:${index}`);
  const result: IngestSearchResult = {
    id,
    sourceId: sourceIdFromUri(sourceUri),
    sourceLabel: labelFromSourceUri(sourceUri),
    title,
    kind:
      mediaTypeFromRecord(rawResult) ??
      mediaTypeFromRecord(document) ??
      "document",
    text,
    score: normalizeScore(numberField(rawResult, "score")),
  };
  const url = stringField(rawResult, "url");
  const updatedAt =
    timestampField(rawResult, "updatedAt", "updated_at") ??
    timestampField(document, "updatedAt", "updated_at");

  if (url !== undefined) {
    result.url = url;
  }
  if (updatedAt !== undefined) {
    result.updatedAt = updatedAt;
  }

  return result;
}

function collectQuarantineItemsFromRecords(
  records: readonly IngestApiRecord[],
): IngestQuarantineItem[] {
  const items = new Map<string, IngestQuarantineItem>();

  for (const record of records) {
    for (const rawItem of quarantineRawItems(record)) {
      const item = mapQuarantineItem(rawItem, record);
      if (!item) {
        continue;
      }

      const previous = items.get(item.id);
      items.set(item.id, previous ? mergeQuarantineItems(previous, item) : item);
    }
  }

  return [...items.values()]
    .sort(compareQuarantineInputs)
    .map((item) => clonePlain(item));
}

function quarantineRawItems(record: IngestApiRecord): unknown[] {
  const raw: unknown[] = [];
  const requestBody = record.requestBody;
  const body = record.responseBody;

  if (requestBody && routeIsQuarantine(record.routePath)) {
    raw.push(...arrayField(requestBody, "items"));
  }

  if (!body) {
    return raw;
  }

  raw.push(...arrayField(recordField(body, "quarantine") ?? {}, "items"));
  raw.push(...arrayField(body, "cases"));

  const singleCase = body.case ?? body.quarantineRecord ?? body.quarantine_record;
  if (singleCase !== undefined) {
    raw.push(singleCase);
  }

  return raw;
}

function mapQuarantineItem(
  rawItem: unknown,
  record: IngestApiRecord,
): IngestQuarantineItem | undefined {
  if (!isRecord(rawItem)) {
    return undefined;
  }

  const id =
    stringField(rawItem, "id", "caseId", "case_id") ??
    stableId("quarantine", JSON.stringify(rawItem));
  const sourceUri = sourceUriFromRecord(rawItem);
  if (!sourceUri) {
    return undefined;
  }

  const latestDecision = latestQuarantineDecision(rawItem);
  const reasonCode =
    firstString(arrayField(rawItem, "reasonCodes", "reason_codes")) ??
    stringField(rawItem, "reasonCode", "reason_code");
  const reason = mapQuarantineReason(reasonCode);
  const preview =
    stringField(rawItem, "title") ??
    stringField(rawItem, "previewText", "preview_text") ??
    stringField(rawItem, "content") ??
    `${labelFromSourceUri(sourceUri)} item`;
  const item: IngestQuarantineItem = {
    id,
    sourceId: sourceIdFromUri(sourceUri),
    sourceLabel: labelFromSourceUri(sourceUri),
    title: truncateLabel(preview),
    reason,
    quarantinedAt:
      timestampField(rawItem, "quarantinedAt", "quarantined_at", "createdAt", "created_at") ??
      record.generatedAt,
    detail: quarantineDetail(rawItem, reasonCode),
    contentType: mediaTypeFromRecord(rawItem),
    retryCount: countField(rawItem, "retryCount", "retry_count"),
    decision:
      decisionFromApiState(stringField(rawItem, "state")) ??
      decisionFromApiAction(stringField(latestDecision ?? {}, "action")) ??
      "pending",
  };
  const decidedAt =
    timestampField(latestDecision ?? {}, "timestamp", "decidedAt", "decided_at") ??
    timestampField(recordField(rawItem, "decision") ?? {}, "timestamp");
  const decidedBy =
    stringField(latestDecision ?? {}, "actorId", "actor_id", "decidedBy", "decided_by") ??
    stringField(recordField(rawItem, "decision") ?? {}, "actorId", "actor_id");

  if (decidedAt !== undefined) {
    item.decidedAt = decidedAt;
  }
  if (decidedBy !== undefined) {
    item.decidedBy = decidedBy;
  }

  return item;
}

function collectErrorStatesFromRecords(
  records: readonly IngestApiRecord[],
): IngestApiContextErrorState[] {
  const states = new Map<string, IngestApiContextErrorState>();

  for (const record of records) {
    const message = apiErrorMessage(record);
    if (!message) {
      continue;
    }

    const context = inferErrorContext(record);
    const key = `${context}:${record.id}:${record.index}`;
    states.set(key, {
      id: `ingest_api_error.${sanitizeIdentifier(key, "error")}`,
      context,
      routeId: record.id,
      routePath: record.routePath,
      status: record.status,
      errorState: buildIngestSearchErrorState(context, message),
    });
  }

  return [...states.values()]
    .sort(compareErrorStates)
    .map((error) => clonePlain(error));
}

function upsertSource(
  sources: Map<string, MutableSourceSummary>,
  patch: SourcePatch,
): void {
  const existing = sources.get(patch.sourceUri);
  const next: MutableSourceSummary = existing ?? {
    id: sourceIdFromUri(patch.sourceUri),
    sourceUri: patch.sourceUri,
    label: labelFromSourceUri(patch.sourceUri),
    kind: "unknown",
    status: "ready",
    indexedCount: 0,
    queuedCount: 0,
    quarantinedCount: 0,
  };

  next.label = bestLabel(next.label, patch.label, patch.sourceUri);
  next.kind = patch.kind ?? next.kind;
  next.status = strongerSourceStatus(next.status, patch.status ?? "ready");
  next.indexedCount = Math.max(next.indexedCount, patch.indexedCount ?? 0);
  next.queuedCount = Math.max(next.queuedCount ?? 0, patch.queuedCount ?? 0);
  next.quarantinedCount = Math.max(
    next.quarantinedCount ?? 0,
    patch.quarantinedCount ?? 0,
  );

  if (patch.lastIndexedAt !== undefined) {
    next.lastIndexedAt = laterTimestamp(next.lastIndexedAt, patch.lastIndexedAt);
  }
  if (patch.lastError !== undefined) {
    next.lastError = patch.lastError;
  }

  sources.set(patch.sourceUri, next);
}

function countDocumentsBySource(documents: readonly unknown[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const document of documents) {
    if (!isRecord(document)) {
      continue;
    }

    const sourceUri = sourceUriFromRecord(document);
    if (!sourceUri) {
      continue;
    }

    counts.set(sourceUri, (counts.get(sourceUri) ?? 0) + 1);
  }

  return counts;
}

function uniqueSourceUris(items: readonly unknown[]): string[] {
  const uris = new Set<string>();

  for (const item of items) {
    if (!isRecord(item)) {
      continue;
    }

    const sourceUri = sourceUriFromRecord(item) ?? sourceUriFromRecord(recordField(item, "document") ?? {});
    if (sourceUri) {
      uris.add(sourceUri);
    }
  }

  return [...uris].sort();
}

function inferSearchQuery(records: readonly IngestApiRecord[]): string {
  for (const record of records) {
    const responseQuery = record.responseBody
      ? stringField(record.responseBody, "query", "text")
      : undefined;
    if (responseQuery !== undefined) {
      return responseQuery;
    }

    const requestQuery = record.requestBody
      ? stringField(record.requestBody, "query", "text")
      : undefined;
    if (requestQuery !== undefined) {
      return requestQuery;
    }
  }

  return "";
}

function inferErrorContext(record: IngestApiRecord): IngestSearchStateContext {
  const routePath = record.routePath ?? "";
  if (routePath.includes("/search")) {
    return "search";
  }
  if (routePath.includes("/quarantine")) {
    return "quarantine";
  }

  const body = record.responseBody;
  if (body) {
    if (Array.isArray(body.results)) {
      return "search";
    }
    if (body.quarantine !== undefined || body.cases !== undefined || body.case !== undefined) {
      return "quarantine";
    }
  }

  return "sources";
}

function apiErrorMessage(record: IngestApiRecord): string | undefined {
  const body = record.responseBody;
  const error = body ? recordField(body, "error") : undefined;
  const message =
    (error ? stringField(error, "message") : undefined) ??
    (error ? stringField(error, "code") : undefined) ??
    (body ? stringField(body, "message") : undefined);

  if (message !== undefined) {
    return message;
  }
  if (record.status !== undefined && record.status >= 400) {
    return `Request failed with status ${record.status}.`;
  }
  if (body && body.ok === false) {
    return "Request failed.";
  }

  return undefined;
}

function sourceUriFromRecord(record: AnyRecord): string | undefined {
  const citation = recordField(record, "citation");
  const citationSourceUri = citation
    ? stringField(citation, "sourceUri", "source_uri")
    : undefined;

  return (
    stringField(record, "sourceUri", "source_uri") ??
    citationSourceUri ??
    stringField(record, "localPath", "local_path", "path")
  );
}

function explicitSourceUriFromRecord(record: AnyRecord): string | undefined {
  return stringField(record, "sourceUri", "source_uri");
}

function sourceLabel(record: AnyRecord, sourceUri: string): string {
  const label = stringField(record, "label", "title");
  if (label !== undefined) {
    return label;
  }

  const path = stringField(record, "relativePath", "relative_path", "path", "localPath");
  return path === undefined ? labelFromSourceUri(sourceUri) : labelFromSourceUri(path);
}

function labelFromSourceUri(sourceUri: string): string {
  const normalized = sourceUri.trim();
  const withoutQuery = normalized.split(/[?#]/, 1)[0];
  const slashIndex = withoutQuery.lastIndexOf("/");
  const tail = slashIndex === -1 ? withoutQuery : withoutQuery.slice(slashIndex + 1);
  return tail === "" ? normalized : tail;
}

function mediaTypeFromRecord(record: AnyRecord): string | undefined {
  return stringField(record, "mediaType", "media_type", "contentType", "content_type", "kind");
}

function sourceIdFromUri(sourceUri: string): string {
  return sanitizeIdentifier(sourceUri, "source");
}

function sourceStatusFromApiState(
  state: string | undefined,
): IngestSourceStatus {
  const normalized = normalizeToken(state);
  if (normalized.includes("error") || normalized.includes("failed")) {
    return "error";
  }
  if (normalized.includes("quarant") || normalized.includes("review")) {
    return "attention";
  }
  if (
    normalized.includes("indexing") ||
    normalized.includes("queued") ||
    normalized.includes("pending") ||
    normalized.includes("processing")
  ) {
    return "indexing";
  }
  if (normalized.includes("paused")) {
    return "paused";
  }
  return "ready";
}

function stateHasQuarantine(state: string | undefined): boolean {
  const normalized = normalizeToken(state);
  return normalized.includes("quarant") || normalized.includes("review");
}

function stateHasIndexedContent(state: string | undefined): boolean {
  const normalized = normalizeToken(state);
  return (
    normalized === "" ||
    normalized.includes("indexed") ||
    normalized.includes("partly") ||
    normalized.includes("clear") ||
    normalized.includes("ready")
  );
}

function isPendingQuarantineRecord(record: AnyRecord): boolean {
  const decision = decisionFromApiState(stringField(record, "state"));
  return decision === undefined || decision === "pending";
}

function mapQuarantineReason(
  reasonCode: string | undefined,
): IngestQuarantineReason {
  const normalized = normalizeToken(reasonCode);
  if (normalized.includes("duplicate")) {
    return "duplicate";
  }
  if (normalized.includes("unsupported")) {
    return "unsupported_type";
  }
  if (normalized.includes("parse")) {
    return "parse_error";
  }
  if (normalized.includes("unavailable") || normalized.includes("missing_source")) {
    return "source_unavailable";
  }
  return "failed_validation";
}

function decisionFromApiState(
  state: string | undefined,
): IngestQuarantineDecision | undefined {
  const normalized = normalizeToken(state);
  if (normalized === "" || normalized === "open" || normalized === "pending") {
    return "pending";
  }
  if (normalized.includes("release")) {
    return "release";
  }
  if (normalized.includes("retry")) {
    return "retry";
  }
  if (normalized.includes("reject") || normalized.includes("discard")) {
    return "discard";
  }
  return undefined;
}

function decisionFromApiAction(
  action: string | undefined,
): IngestQuarantineDecision | undefined {
  const normalized = normalizeToken(action);
  if (normalized === "release") {
    return "release";
  }
  if (normalized === "retry") {
    return "retry";
  }
  if (normalized === "reject" || normalized === "discard") {
    return "discard";
  }
  return undefined;
}

function latestQuarantineDecision(item: AnyRecord): AnyRecord | undefined {
  const explicit = recordField(item, "decision");
  if (explicit) {
    return explicit;
  }

  const decisions = arrayField(item, "decisions").filter(isRecord);
  return decisions
    .slice()
    .sort((left, right) =>
      compareOptionalTimestampsDescending(
        timestampField(left, "timestamp"),
        timestampField(right, "timestamp"),
      ),
    )[0];
}

function quarantineDetail(
  item: AnyRecord,
  reasonCode: string | undefined,
): string | undefined {
  const severity = stringField(item, "severity");
  const preview =
    stringField(item, "detail") ??
    stringField(item, "previewText", "preview_text") ??
    stringField(item, "content");
  const parts = [reasonCode, severity ? `severity: ${severity}` : undefined, preview]
    .filter((part): part is string => part !== undefined && part.trim() !== "")
    .map((part) => part.trim());

  return parts.length === 0 ? undefined : parts.join(" | ");
}

function mergeQuarantineItems(
  previous: IngestQuarantineItem,
  next: IngestQuarantineItem,
): IngestQuarantineItem {
  return {
    ...previous,
    ...next,
    title: moreUsefulText(previous.title, next.title),
    detail: moreUsefulText(previous.detail, next.detail),
    contentType: next.contentType ?? previous.contentType,
    retryCount: Math.max(previous.retryCount ?? 0, next.retryCount ?? 0),
    quarantinedAt: earlierTimestamp(previous.quarantinedAt, next.quarantinedAt),
    decision:
      previous.decision === "pending" || next.decision !== "pending"
        ? next.decision
        : previous.decision,
    decidedAt: next.decidedAt ?? previous.decidedAt,
    decidedBy: next.decidedBy ?? previous.decidedBy,
  };
}

function routeIsQuarantine(routePath: string | undefined): boolean {
  return routePath?.includes("/quarantine") ?? false;
}

function compareSourceSummaries(
  left: IngestSourceSummary,
  right: IngestSourceSummary,
): number {
  return (
    sourceStatusRank(left.status) - sourceStatusRank(right.status) ||
    left.label.localeCompare(right.label) ||
    left.id.localeCompare(right.id)
  );
}

function compareSearchInputs(
  left: IngestSearchResult,
  right: IngestSearchResult,
): number {
  return (
    (right.score ?? 0) - (left.score ?? 0) ||
    compareOptionalTimestampsDescending(left.updatedAt, right.updatedAt) ||
    left.title.localeCompare(right.title) ||
    left.id.localeCompare(right.id)
  );
}

function compareQuarantineInputs(
  left: IngestQuarantineItem,
  right: IngestQuarantineItem,
): number {
  return (
    decisionRank(left.decision ?? "pending") -
      decisionRank(right.decision ?? "pending") ||
    compareTimestamps(left.quarantinedAt, right.quarantinedAt) ||
    left.id.localeCompare(right.id)
  );
}

function compareErrorStates(
  left: IngestApiContextErrorState,
  right: IngestApiContextErrorState,
): number {
  return (
    contextRank(left.context) - contextRank(right.context) ||
    (left.routePath ?? "").localeCompare(right.routePath ?? "") ||
    (left.routeId ?? "").localeCompare(right.routeId ?? "") ||
    left.id.localeCompare(right.id)
  );
}

function sourceStatusRank(status: IngestSourceStatus): number {
  switch (status) {
    case "error":
      return 0;
    case "attention":
      return 1;
    case "indexing":
      return 2;
    case "paused":
      return 3;
    case "ready":
      return 4;
  }
}

function strongerSourceStatus(
  left: IngestSourceStatus,
  right: IngestSourceStatus,
): IngestSourceStatus {
  return sourceStatusRank(right) < sourceStatusRank(left) ? right : left;
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

function contextRank(context: IngestSearchStateContext): number {
  switch (context) {
    case "sources":
      return 0;
    case "search":
      return 1;
    case "quarantine":
      return 2;
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

function compareTimestamps(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
    return left.localeCompare(right);
  }

  return leftTime - rightTime || left.localeCompare(right);
}

function earlierTimestamp(left: string, right: string): string {
  return compareTimestamps(left, right) <= 0 ? left : right;
}

function laterTimestamp(
  left: string | undefined,
  right: string,
): string {
  if (left === undefined) {
    return right;
  }
  return compareTimestamps(left, right) >= 0 ? left : right;
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

function normalizeDefaultTimestamp(value: string | undefined): string {
  return value !== undefined && !Number.isNaN(Date.parse(value))
    ? value
    : DEFAULT_TIMESTAMP;
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

function numberField(
  record: AnyRecord,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
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

  const value = numberField(record, ...keys);
  return value === undefined ? undefined : Math.trunc(value);
}

function countField(record: AnyRecord, ...keys: string[]): number {
  const value = integerField(record, ...keys) ?? 0;
  return Math.max(value, 0);
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

function recordField(
  record: AnyRecord | undefined,
  key: string,
): AnyRecord | undefined {
  const value = record?.[key];
  return isRecord(value) ? value : undefined;
}

function firstString(values: readonly unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is AnyRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeScore(value: number | undefined): number {
  if (value === undefined) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 1);
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

function truncateLabel(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= 80 ? normalized : `${normalized.slice(0, 77)}...`;
}

function bestLabel(
  current: string,
  candidate: string | undefined,
  sourceUri: string,
): string {
  if (candidate === undefined) {
    return current;
  }
  if (current === sourceUri || candidate.length < current.length) {
    return candidate;
  }
  return current;
}

function moreUsefulText(
  left: string | undefined,
  right: string | undefined,
): string | undefined {
  if (left === undefined || left.trim() === "") {
    return right;
  }
  if (right === undefined || right.trim() === "") {
    return left;
  }
  return right.length >= left.length ? right : left;
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
