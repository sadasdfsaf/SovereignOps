const DEFAULT_LOCAL_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const DEFAULT_SEARCH_LIMIT = 10;
const DEFAULT_MAX_BODY_CHARS = 4096;
const DEFAULT_MAX_SUMMARY_CHARS = 512;
const DEFAULT_SNIPPET_RADIUS = 56;
const DEFAULT_MAX_SNIPPETS = 2;

export interface LocalSourceDocumentInput {
  readonly [key: string]: unknown;
  readonly id?: string;
  readonly documentId?: string;
  readonly uri?: string;
  readonly path?: string;
  readonly title?: string;
  readonly name?: string;
  readonly summary?: string;
  readonly description?: string;
  readonly body?: string;
  readonly text?: string;
  readonly content?: string | readonly string[];
  readonly tags?: readonly string[];
  readonly updatedAt?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface LocalSourceSummaryInput {
  readonly [key: string]: unknown;
  readonly sourceId?: string;
  readonly id?: string;
  readonly name?: string;
  readonly title?: string;
  readonly label?: string;
  readonly summary?: string;
  readonly description?: string;
  readonly body?: string;
  readonly text?: string;
  readonly content?: string | readonly string[];
  readonly documents?: readonly LocalSourceDocumentInput[];
  readonly items?: readonly LocalSourceDocumentInput[];
  readonly records?: readonly LocalSourceDocumentInput[];
  readonly tags?: readonly string[];
  readonly updatedAt?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface LocalNormalizedDocument {
  readonly id: string;
  readonly sourceId: string;
  readonly sourceTitle: string;
  readonly title: string;
  readonly summary: string;
  readonly body: string;
  readonly tags: readonly string[];
  readonly updatedAt?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface LocalSearchViewOptions {
  readonly maxBodyChars?: number;
  readonly maxSummaryChars?: number;
}

export interface LocalSearchViewDocument {
  readonly id: string;
  readonly sourceId: string;
  readonly sourceTitle: string;
  readonly title: string;
  readonly summary: string;
  readonly body: string;
  readonly tags: readonly string[];
  readonly updatedAt?: string;
  readonly searchText: string;
  readonly tokens: readonly string[];
}

export interface LocalSearchView {
  readonly documents: readonly LocalSearchViewDocument[];
  readonly tokens: readonly string[];
}

export interface LocalTextSearchOptions {
  readonly limit?: number;
  readonly maxSnippets?: number;
  readonly snippetRadius?: number;
}

export interface LocalTextSearchResult {
  readonly id: string;
  readonly sourceId: string;
  readonly title: string;
  readonly summary: string;
  readonly score: number;
  readonly matchedTerms: readonly string[];
  readonly snippets: readonly string[];
  readonly tags: readonly string[];
  readonly updatedAt?: string;
}

export type LocalQuarantineGroupBy = "source" | "reason" | "status";
export type LocalQuarantineDecision = "release" | "discard";

export interface LocalQuarantineRecordInput {
  readonly [key: string]: unknown;
  readonly id: string;
  readonly sourceId?: string;
  readonly sourceTitle?: string;
  readonly documentId?: string;
  readonly title?: string;
  readonly reason?: string;
  readonly status?: string;
  readonly createdAt?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface LocalQuarantineRecord {
  readonly id: string;
  readonly sourceId: string;
  readonly sourceTitle?: string;
  readonly documentId?: string;
  readonly title?: string;
  readonly reason: string;
  readonly status: string;
  readonly createdAt?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface LocalQuarantineGroupOptions {
  readonly groupBy?: LocalQuarantineGroupBy;
}

export interface LocalQuarantineGroup {
  readonly key: string;
  readonly label: string;
  readonly count: number;
  readonly recordIds: readonly string[];
  readonly sourceIds: readonly string[];
  readonly reasons: readonly string[];
  readonly statuses: readonly string[];
  readonly records: readonly LocalQuarantineRecord[];
}

export interface LocalQuarantineDecisionRequest {
  readonly records: readonly LocalQuarantineRecordInput[];
  readonly recordIds?: readonly string[];
  readonly decision: LocalQuarantineDecision;
  readonly decidedAt?: string;
  readonly decidedBy?: string;
  readonly reason?: string;
  readonly metadata?: Record<string, unknown>;
  readonly clock?: () => string;
}

export interface LocalQuarantineDecisionPayload {
  readonly decisionId: string;
  readonly decision: LocalQuarantineDecision;
  readonly decidedAt: string;
  readonly decidedBy?: string;
  readonly reason?: string;
  readonly recordIds: readonly string[];
  readonly records: readonly LocalQuarantineDecisionRecord[];
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface LocalQuarantineDecisionRecord {
  readonly id: string;
  readonly sourceId: string;
  readonly documentId?: string;
  readonly title?: string;
  readonly reason: string;
  readonly status: string;
}

export function normalizeLocalSourceSummaries(
  summaries: readonly LocalSourceSummaryInput[],
): LocalNormalizedDocument[] {
  if (!Array.isArray(summaries)) {
    throw new TypeError("source summaries must be an array");
  }

  return summaries.flatMap((summary, summaryIndex) => {
    if (!isRecord(summary)) {
      throw new TypeError(`source summary at index ${summaryIndex} must be an object`);
    }

    const sourceId = firstNonEmptyString(
      summary.sourceId,
      summary.id,
      summary.name,
    ) ?? `source_${summaryIndex + 1}`;
    const sourceTitle = firstNonEmptyString(
      summary.title,
      summary.label,
      summary.name,
      sourceId,
    ) as string;
    const documents = sourceDocuments(summary);

    return documents.map((document, documentIndex) =>
      normalizeDocument(summary, document, {
        documentIndex,
        sourceId,
        sourceTitle,
      }),
    );
  }).sort(compareNormalizedDocuments);
}

export function buildLocalSearchView(
  documents: readonly LocalNormalizedDocument[],
  options: LocalSearchViewOptions = {},
): LocalSearchView {
  if (!Array.isArray(documents)) {
    throw new TypeError("documents must be an array");
  }

  const maxBodyChars = positiveIntegerOption(
    options.maxBodyChars,
    DEFAULT_MAX_BODY_CHARS,
    "maxBodyChars",
  );
  const maxSummaryChars = positiveIntegerOption(
    options.maxSummaryChars,
    DEFAULT_MAX_SUMMARY_CHARS,
    "maxSummaryChars",
  );
  const byId = new Map<string, LocalSearchViewDocument>();

  for (const document of documents) {
    if (!isRecord(document)) {
      throw new TypeError("document entries must be objects");
    }

    const summary = compactText(document.summary, maxSummaryChars);
    const body = compactText(document.body, maxBodyChars);
    const tags = normalizeTags(document.tags);
    const searchText = compactWhitespace([
      document.title,
      summary,
      body,
      tags.join(" "),
    ].join(" "));
    const tokens = sortedUnique(tokenize(searchText));
    const viewDocument = optionalFields({
      id: requireNonEmptyString(document.id, "document.id"),
      sourceId: requireNonEmptyString(document.sourceId, "document.sourceId"),
      sourceTitle: requireNonEmptyString(document.sourceTitle, "document.sourceTitle"),
      title: requireNonEmptyString(document.title, "document.title"),
      summary,
      body,
      tags,
      updatedAt: optionalString(document.updatedAt),
      searchText,
      tokens,
    });

    byId.set(viewDocument.id, viewDocument);
  }

  const viewDocuments = Array.from(byId.values()).sort(compareSearchDocuments);
  return {
    documents: viewDocuments,
    tokens: sortedUnique(viewDocuments.flatMap((document) => document.tokens)),
  };
}

export function searchLocalText(
  view: LocalSearchView,
  query: string,
  options: LocalTextSearchOptions = {},
): LocalTextSearchResult[] {
  if (!isRecord(view) || !Array.isArray(view.documents)) {
    throw new TypeError("search view must contain documents");
  }

  const queryText = compactWhitespace(query);
  const terms = uniqueInOrder(tokenize(queryText));
  if (terms.length === 0) {
    return [];
  }

  const limit = positiveIntegerOption(options.limit, DEFAULT_SEARCH_LIMIT, "limit");
  const maxSnippets = nonNegativeIntegerOption(
    options.maxSnippets,
    DEFAULT_MAX_SNIPPETS,
    "maxSnippets",
  );
  const snippetRadius = positiveIntegerOption(
    options.snippetRadius,
    DEFAULT_SNIPPET_RADIUS,
    "snippetRadius",
  );
  const normalizedPhrase = normalizeForSearch(queryText);

  return view.documents
    .map((document) =>
      scoreDocument(document, terms, normalizedPhrase, {
        maxSnippets,
        snippetRadius,
      }),
    )
    .filter((result): result is LocalTextSearchResult => result !== undefined)
    .sort(compareSearchResults)
    .slice(0, limit);
}

export function groupLocalQuarantineRecords(
  records: readonly LocalQuarantineRecordInput[],
  options: LocalQuarantineGroupOptions = {},
): LocalQuarantineGroup[] {
  const groupBy = options.groupBy ?? "reason";
  if (!["source", "reason", "status"].includes(groupBy)) {
    throw new TypeError("groupBy must be source, reason, or status");
  }

  const normalizedRecords = normalizeQuarantineRecords(records);
  const groups = new Map<string, LocalQuarantineRecord[]>();

  for (const record of normalizedRecords) {
    const key = quarantineGroupKey(record, groupBy);
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }

  return Array.from(groups.entries())
    .map(([key, groupRecords]) => {
      const sortedRecords = groupRecords.slice().sort(compareQuarantineRecords);
      return {
        key,
        label: quarantineGroupLabel(sortedRecords[0], groupBy),
        count: sortedRecords.length,
        recordIds: sortedRecords.map((record) => record.id),
        sourceIds: sortedUnique(sortedRecords.map((record) => record.sourceId)),
        reasons: sortedUnique(sortedRecords.map((record) => record.reason)),
        statuses: sortedUnique(sortedRecords.map((record) => record.status)),
        records: sortedRecords,
      };
    })
    .sort((left, right) => compareText(left.key, right.key));
}

export function prepareLocalQuarantineDecisionPayload(
  request: LocalQuarantineDecisionRequest,
): LocalQuarantineDecisionPayload {
  if (!isRecord(request)) {
    throw new TypeError("decision request must be an object");
  }
  if (!["release", "discard"].includes(request.decision)) {
    throw new TypeError("decision must be release or discard");
  }

  const allRecords = normalizeQuarantineRecords(request.records);
  const selectedIds = request.recordIds === undefined
    ? allRecords.map((record) => record.id)
    : normalizeRecordIds(request.recordIds);
  const selectedIdSet = new Set(selectedIds);
  const missingIds = selectedIds.filter(
    (recordId) => !allRecords.some((record) => record.id === recordId),
  );
  if (missingIds.length > 0) {
    throw new TypeError(`recordIds contains unknown ids: ${missingIds.join(", ")}`);
  }

  const selectedRecords = allRecords
    .filter((record) => selectedIdSet.has(record.id))
    .sort(compareQuarantineRecords);
  if (selectedRecords.length === 0) {
    throw new TypeError("decision payload requires at least one record");
  }

  const decidedAt = compactWhitespace(
    request.decidedAt ?? request.clock?.() ?? DEFAULT_LOCAL_TIMESTAMP,
  );
  if (decidedAt.length === 0) {
    throw new TypeError("decidedAt must be a non-empty string");
  }

  const reason = optionalString(request.reason);
  const decidedBy = optionalString(request.decidedBy);
  const recordIds = selectedRecords.map((record) => record.id);
  const records = selectedRecords.map((record) =>
    optionalFields({
      id: record.id,
      sourceId: record.sourceId,
      documentId: record.documentId,
      title: record.title,
      reason: record.reason,
      status: record.status,
    }),
  );
  const metadata = cloneMetadata(request.metadata);
  const decisionFingerprint = stableHash(stableStringify({
    decidedAt,
    decidedBy,
    decision: request.decision,
    reason,
    recordIds,
  }));

  return optionalFields({
    decisionId: `qdec_${decisionFingerprint}`,
    decision: request.decision,
    decidedAt,
    decidedBy,
    reason,
    recordIds,
    records,
    metadata,
  });
}

function normalizeDocument(
  source: LocalSourceSummaryInput,
  document: LocalSourceDocumentInput,
  context: {
    readonly documentIndex: number;
    readonly sourceId: string;
    readonly sourceTitle: string;
  },
): LocalNormalizedDocument {
  const rawDocumentId = firstNonEmptyString(
    document.documentId,
    document.id,
    document.uri,
    document.path,
  ) ?? String(context.documentIndex + 1);
  const id = `${context.sourceId}:${rawDocumentId}`;
  const title = firstNonEmptyString(
    document.title,
    document.name,
    document.path,
    document.uri,
    source.title,
    source.label,
    context.sourceTitle,
  ) as string;
  const summary = firstNonEmptyString(
    document.summary,
    document.description,
    source.summary,
    source.description,
  ) ?? "";
  const body = firstNonEmptyString(
    document.body,
    document.text,
    textContent(document.content),
    source.body,
    source.text,
    textContent(source.content),
  ) ?? "";
  const updatedAt = optionalString(document.updatedAt) ?? optionalString(source.updatedAt);

  return optionalFields({
    id,
    sourceId: context.sourceId,
    sourceTitle: context.sourceTitle,
    title,
    summary,
    body,
    tags: normalizeTags([
      ...tagsFrom(source.tags),
      ...tagsFrom(document.tags),
    ]),
    updatedAt,
    metadata: cloneMetadata({
      ...metadataRecord(source.metadata),
      ...metadataRecord(document.metadata),
    }),
  });
}

function sourceDocuments(
  source: LocalSourceSummaryInput,
): LocalSourceDocumentInput[] {
  const nestedDocuments = firstArray(source.documents, source.items, source.records);
  if (nestedDocuments !== undefined) {
    return nestedDocuments.map((document, index) => {
      if (!isRecord(document)) {
        throw new TypeError(`source document at index ${index} must be an object`);
      }
      return document as LocalSourceDocumentInput;
    });
  }

  if (hasDocumentContent(source)) {
    return [source as LocalSourceDocumentInput];
  }

  return [];
}

function scoreDocument(
  document: LocalSearchViewDocument,
  terms: readonly string[],
  normalizedPhrase: string,
  options: {
    readonly maxSnippets: number;
    readonly snippetRadius: number;
  },
): LocalTextSearchResult | undefined {
  const titleTokens = tokenize(document.title);
  const summaryTokens = tokenize(document.summary);
  const bodyTokens = tokenize(document.body);
  const tagTokens = tokenize(document.tags.join(" "));
  const matchedTerms: string[] = [];
  let score = 0;

  for (const term of terms) {
    const titleCount = countToken(titleTokens, term);
    const summaryCount = countToken(summaryTokens, term);
    const bodyCount = countToken(bodyTokens, term);
    const tagCount = countToken(tagTokens, term);
    const termScore = titleCount * 8 + summaryCount * 4 + bodyCount + tagCount * 6;

    if (termScore > 0) {
      matchedTerms.push(term);
      score += termScore;
    }
  }

  if (matchedTerms.length === 0) {
    return undefined;
  }

  if (matchedTerms.length === terms.length) {
    score += 10;
  }
  if (
    normalizedPhrase.length > 0 &&
    normalizeForSearch(document.searchText).includes(normalizedPhrase)
  ) {
    score += 20;
  }

  return optionalFields({
    id: document.id,
    sourceId: document.sourceId,
    title: document.title,
    summary: document.summary,
    score,
    matchedTerms,
    snippets: snippetsFor(document.searchText, terms, normalizedPhrase, options),
    tags: document.tags,
    updatedAt: document.updatedAt,
  });
}

function snippetsFor(
  text: string,
  terms: readonly string[],
  normalizedPhrase: string,
  options: {
    readonly maxSnippets: number;
    readonly snippetRadius: number;
  },
): string[] {
  if (options.maxSnippets === 0) {
    return [];
  }

  const normalizedText = normalizeForSearch(text);
  const matchIndexes = [
    ...(normalizedPhrase.length > 0
      ? indexesOf(normalizedText, normalizedPhrase)
      : []),
    ...terms.flatMap((term) => indexesOf(normalizedText, term)),
  ];
  const snippets: string[] = [];
  const seen = new Set<string>();

  for (const index of sortedUniqueNumbers(matchIndexes)) {
    const snippet = clipSnippet(
      text,
      index,
      normalizedPhrase.length > 0 ? normalizedPhrase.length : terms[0]?.length ?? 1,
      options.snippetRadius,
    );
    if (!seen.has(snippet)) {
      snippets.push(snippet);
      seen.add(snippet);
    }
    if (snippets.length >= options.maxSnippets) {
      break;
    }
  }

  return snippets;
}

function normalizeQuarantineRecords(
  records: readonly LocalQuarantineRecordInput[],
): LocalQuarantineRecord[] {
  if (!Array.isArray(records)) {
    throw new TypeError("quarantine records must be an array");
  }

  return records.map((record, index) => {
    if (!isRecord(record)) {
      throw new TypeError(`quarantine record at index ${index} must be an object`);
    }

    return optionalFields({
      id: requireNonEmptyString(record.id, `records[${index}].id`),
      sourceId: optionalString(record.sourceId) ?? "unknown",
      sourceTitle: optionalString(record.sourceTitle),
      documentId: optionalString(record.documentId),
      title: optionalString(record.title),
      reason: optionalString(record.reason) ?? "unspecified",
      status: optionalString(record.status) ?? "pending",
      createdAt: optionalString(record.createdAt),
      metadata: cloneMetadata(record.metadata),
    });
  }).sort(compareQuarantineRecords);
}

function quarantineGroupKey(
  record: LocalQuarantineRecord,
  groupBy: LocalQuarantineGroupBy,
): string {
  if (groupBy === "source") {
    return record.sourceId;
  }
  if (groupBy === "status") {
    return record.status;
  }
  return record.reason;
}

function quarantineGroupLabel(
  record: LocalQuarantineRecord,
  groupBy: LocalQuarantineGroupBy,
): string {
  if (groupBy === "source") {
    return record.sourceTitle ?? record.sourceId;
  }
  return quarantineGroupKey(record, groupBy);
}

function normalizeRecordIds(recordIds: readonly string[]): string[] {
  if (!Array.isArray(recordIds)) {
    throw new TypeError("recordIds must be an array");
  }

  const normalized = uniqueInOrder(recordIds.map((recordId, index) => {
    if (typeof recordId !== "string") {
      throw new TypeError(`recordIds[${index}] must be a string`);
    }
    return compactWhitespace(recordId);
  }).filter((recordId) => recordId.length > 0));

  if (normalized.length === 0) {
    throw new TypeError("recordIds must contain at least one id");
  }

  return normalized;
}

function compareNormalizedDocuments(
  left: LocalNormalizedDocument,
  right: LocalNormalizedDocument,
): number {
  return compareText(left.sourceId, right.sourceId) || compareText(left.id, right.id);
}

function compareSearchDocuments(
  left: LocalSearchViewDocument,
  right: LocalSearchViewDocument,
): number {
  return compareText(left.sourceId, right.sourceId) || compareText(left.id, right.id);
}

function compareSearchResults(
  left: LocalTextSearchResult,
  right: LocalTextSearchResult,
): number {
  return right.score - left.score ||
    compareText(left.title, right.title) ||
    compareText(left.id, right.id);
}

function compareQuarantineRecords(
  left: LocalQuarantineRecord,
  right: LocalQuarantineRecord,
): number {
  return compareText(left.sourceId, right.sourceId) ||
    compareText(left.reason, right.reason) ||
    compareText(left.status, right.status) ||
    compareText(left.id, right.id);
}

function compareText(left: string, right: string): number {
  return normalizeForSearch(left) < normalizeForSearch(right)
    ? -1
    : normalizeForSearch(left) > normalizeForSearch(right)
      ? 1
      : 0;
}

function firstArray<T>(...values: readonly unknown[]): T[] | undefined {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value as T[];
    }
  }
  return undefined;
}

function firstNonEmptyString(...values: readonly unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = compactWhitespace(value);
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return undefined;
}

function requireNonEmptyString(value: unknown, path: string): string {
  const trimmed = firstNonEmptyString(value);
  if (trimmed === undefined) {
    throw new TypeError(`${path} must be a non-empty string`);
  }
  return trimmed;
}

function optionalString(value: unknown): string | undefined {
  return firstNonEmptyString(value);
}

function textContent(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string").join(" ");
  }
  return undefined;
}

function hasDocumentContent(source: LocalSourceSummaryInput): boolean {
  return [
    source.title,
    source.label,
    source.summary,
    source.description,
    source.body,
    source.text,
    textContent(source.content),
  ].some((value) => typeof value === "string" && compactWhitespace(value).length > 0);
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return sortedUnique(value
    .filter((tag): tag is string => typeof tag === "string")
    .map(compactWhitespace)
    .filter((tag) => tag.length > 0));
}

function tagsFrom(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((tag): tag is string => typeof tag === "string")
    : [];
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function cloneMetadata(value: unknown): Readonly<Record<string, unknown>> {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    throw new TypeError("metadata must be an object");
  }
  return structuredClone(value) as Readonly<Record<string, unknown>>;
}

function compactText(value: unknown, maxChars: number): string {
  const text = compactWhitespace(typeof value === "string" ? value : "");
  return text.length > maxChars ? text.slice(0, maxChars).trimEnd() : text;
}

function compactWhitespace(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function tokenize(value: string): string[] {
  const normalized = normalizeForSearch(value);
  return normalized.match(/[a-z0-9]+/g) ?? [];
}

function normalizeForSearch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function countToken(tokens: readonly string[], term: string): number {
  return tokens.filter((token) => token === term).length;
}

function indexesOf(text: string, needle: string): number[] {
  if (needle.length === 0) {
    return [];
  }

  const indexes: number[] = [];
  let cursor = text.indexOf(needle);
  while (cursor >= 0) {
    indexes.push(cursor);
    cursor = text.indexOf(needle, cursor + needle.length);
  }
  return indexes;
}

function clipSnippet(
  text: string,
  matchStart: number,
  matchLength: number,
  radius: number,
): string {
  const start = Math.max(0, matchStart - radius);
  const end = Math.min(text.length, matchStart + matchLength + radius);
  return `${start > 0 ? "..." : ""}${text.slice(start, end).trim()}${end < text.length ? "..." : ""}`;
}

function positiveIntegerOption(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return value;
}

function nonNegativeIntegerOption(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative integer`);
  }
  return value;
}

function sortedUnique(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort(compareText);
}

function uniqueInOrder<T>(values: readonly T[]): T[] {
  const seen = new Set<T>();
  const unique: T[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      unique.push(value);
    }
  }
  return unique;
}

function sortedUniqueNumbers(values: readonly number[]): number[] {
  return Array.from(new Set(values)).sort((left, right) => left - right);
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36).padStart(7, "0");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function optionalFields<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
