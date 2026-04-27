import {
  ApiNetworkError,
  ApiRequestValidationError,
  ApiResponseValidationError,
  type FetchLike,
  type FetchRequestInit,
  type FetchResponseLike,
  parseJsonApiResponse,
  type SovereignOpsClientOptions,
  type ValidationIssue,
} from "./client.ts";

export type IngestSearchClientOptions = SovereignOpsClientOptions;

export type IngestQuarantineDecisionAction = "release" | "reject";
export type IngestQuarantineState = "open" | "released" | "rejected";
export type IngestQuarantineSeverity =
  | "notice"
  | "low"
  | "medium"
  | "high"
  | "critical";

export interface IngestNormalizeOptions {
  readonly trusted?: boolean;
}

export interface IngestNormalizeRequest {
  readonly workspaceId: string;
  readonly sourceUri: string;
  readonly mediaType: string;
  readonly content: string;
  readonly options?: IngestNormalizeOptions;
}

export interface IngestNormalizeResponse {
  readonly ok: true;
  readonly sourceUri: string;
  readonly mediaType: string;
  readonly checksum: string;
  readonly normalizedText: string;
  readonly untrusted: boolean;
}

export interface StructuredIngestOptions extends IngestNormalizeOptions {
  readonly requiredColumns?: readonly string[];
  readonly uniqueColumns?: readonly string[];
}

export interface StructuredIngestRequest extends IngestNormalizeRequest {
  readonly options?: StructuredIngestOptions;
}

export interface IngestCitationRange {
  readonly startLine?: number;
  readonly endLine?: number;
  readonly path?: string;
  readonly row?: number;
  readonly column?: number | string;
}

export interface IngestCitation {
  readonly sourceUri: string;
  readonly range: IngestCitationRange;
  readonly trusted: boolean;
}

export interface StructuredIngestDocument {
  readonly id: string;
  readonly sourceUri: string;
  readonly mediaType: string;
  readonly checksum: string;
  readonly title: string;
  readonly untrusted: boolean;
  readonly quarantineState: string;
  readonly citations: readonly IngestCitation[];
}

export interface StructuredIngestQuarantineItem {
  readonly id: string;
  readonly sourceUri: string;
  readonly checksum: string;
  readonly reasonCode: string;
  readonly citation: IngestCitation;
  readonly untrusted: boolean;
  readonly quarantineState: string;
}

export interface StructuredIngestSummary {
  readonly documentCount: number;
  readonly indexedCount: number;
  readonly quarantineCount: number;
  readonly validationErrorCount: number;
}

export interface StructuredIngestValidationError {
  readonly path: string;
  readonly message: string;
}

export interface StructuredIngestResponse {
  readonly ok: true;
  readonly sourceUri: string;
  readonly mediaType: string;
  readonly summary: StructuredIngestSummary;
  readonly documents: readonly StructuredIngestDocument[];
  readonly quarantine: {
    readonly items: readonly StructuredIngestQuarantineItem[];
  };
  readonly validationErrors?: readonly StructuredIngestValidationError[];
}

export interface RepositoryScanOptions extends IngestNormalizeOptions {
  readonly includePaths?: readonly string[];
  readonly maxTextBytes?: number;
}

export interface RepositoryScanRequest {
  readonly workspaceId: string;
  readonly localPath: string;
  readonly options?: RepositoryScanOptions;
}

export interface RepositoryScanSource {
  readonly sourceUri: string;
  readonly path: string;
  readonly mediaType: string;
  readonly checksum: string;
  readonly state: string;
  readonly untrusted: boolean;
}

export interface RepositoryScanResponse {
  readonly ok: true;
  readonly workspaceId: string;
  readonly sources: readonly RepositoryScanSource[];
}

export interface SearchQueryFilters {
  readonly mediaTypes?: readonly string[];
  readonly sourceUris?: readonly string[];
  readonly tags?: readonly string[];
}

export interface SearchQueryRequest {
  readonly workspaceId: string;
  readonly query: string;
  readonly filters?: SearchQueryFilters;
  readonly limit?: number;
}

export interface SearchQueryResult {
  readonly id: string;
  readonly score: number;
  readonly matchedTerms: readonly string[];
  readonly sourceUri: string;
  readonly mediaType: string;
  readonly checksum: string;
  readonly title: string;
  readonly snippet: string;
  readonly citations: readonly IngestCitation[];
  readonly untrusted: boolean;
  readonly quarantineState: string;
}

export interface SearchQueryResponse {
  readonly ok: true;
  readonly workspaceId: string;
  readonly query: string;
  readonly results: readonly SearchQueryResult[];
}

export interface QuarantineCaseItemInput {
  readonly id: string;
  readonly sourceUri: string;
  readonly checksum: string;
  readonly reasonCode: string;
  readonly content: string;
  readonly citation: IngestCitation;
  readonly untrusted?: boolean;
}

export interface QuarantineCasesRequest {
  readonly workspaceId: string;
  readonly items: readonly QuarantineCaseItemInput[];
}

export interface QuarantineCase {
  readonly id: string;
  readonly sourceUri: string;
  readonly state: IngestQuarantineState;
  readonly reasonCodes: readonly string[];
  readonly severity: IngestQuarantineSeverity;
  readonly citationSnapshots: readonly IngestCitation[];
  readonly previewText: string;
  readonly allowedActions: readonly IngestQuarantineDecisionAction[];
}

export interface QuarantineCasesResponse {
  readonly ok: true;
  readonly cases: readonly QuarantineCase[];
}

export interface QuarantineDecisionRequest {
  readonly caseId: string;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly decision: IngestQuarantineDecisionAction;
  readonly reason: string;
  readonly override?: boolean;
  readonly decidedAt: string;
}

export interface QuarantineDecisionResult {
  readonly action: IngestQuarantineDecisionAction;
  readonly actorId: string;
  readonly timestamp: string;
  readonly reason: string;
  readonly override: boolean;
}

export interface QuarantineDecisionCase {
  readonly id: string;
  readonly sourceUri: string;
  readonly fromState: IngestQuarantineState;
  readonly state: IngestQuarantineState;
  readonly decision: QuarantineDecisionResult;
}

export interface QuarantineDecisionResponse {
  readonly ok: true;
  readonly case: QuarantineDecisionCase;
}

type Validator<T> = (value: unknown) => T;

const LOCAL_SOURCE_URI_PATTERN = /^(fixture|file|stdin|workspace|local):\/\/\S+$/;
const MEDIA_TYPE_PATTERN = /^[^\s/]+\/[^\s]+$/;
const CHECKSUM_PATTERN = /^[a-f0-9]{64}$/;
const QUARANTINE_STATES = ["open", "released", "rejected"] as const;
const QUARANTINE_SEVERITIES = ["notice", "low", "medium", "high", "critical"] as const;
const QUARANTINE_ACTIONS = ["release", "reject"] as const;

export class IngestSearchClient {
  readonly #baseUrl: string;
  readonly #fetch: FetchLike;
  readonly #apiKey?: string;
  readonly #headers: Readonly<Record<string, string>>;

  constructor(options: SovereignOpsClientOptions) {
    const issues: ValidationIssue[] = [];

    if (typeof options.baseUrl !== "string" || options.baseUrl.trim().length === 0) {
      issues.push({ path: "baseUrl", message: "baseUrl must be a non-empty string" });
    }

    let parsedBaseUrl: URL | undefined;
    if (issues.length === 0) {
      try {
        parsedBaseUrl = new URL(options.baseUrl);
      } catch {
        issues.push({ path: "baseUrl", message: "baseUrl must be an absolute URL" });
      }
    }

    if (
      options.apiKey !== undefined &&
      (typeof options.apiKey !== "string" || options.apiKey.trim().length === 0)
    ) {
      issues.push({ path: "apiKey", message: "apiKey must be a non-empty string" });
    }

    if (issues.length > 0 || parsedBaseUrl === undefined) {
      throw new ApiRequestValidationError("client options are invalid", issues);
    }

    const fetchImpl = options.fetch ?? (globalThis as { fetch?: FetchLike }).fetch;
    if (typeof fetchImpl !== "function") {
      throw new ApiRequestValidationError("client options are invalid", [
        { path: "fetch", message: "fetch must be provided when global fetch is unavailable" },
      ]);
    }

    this.#baseUrl = parsedBaseUrl.href.endsWith("/")
      ? parsedBaseUrl.href
      : `${parsedBaseUrl.href}/`;
    this.#fetch = fetchImpl;
    this.#apiKey = options.apiKey;
    this.#headers = Object.freeze({ ...(options.headers ?? {}) });
  }

  async normalize(input: IngestNormalizeRequest): Promise<IngestNormalizeResponse> {
    validateNormalizeRequest(input);
    return this.#request(
      "ingest/normalize",
      {
        method: "POST",
        body: JSON.stringify(buildNormalizeBody(input)),
      },
      parseNormalizeResponse,
    );
  }

  async ingestStructured(input: StructuredIngestRequest): Promise<StructuredIngestResponse> {
    validateStructuredIngestRequest(input);
    return this.#request(
      "ingest/structured",
      {
        method: "POST",
        body: JSON.stringify(buildStructuredIngestBody(input)),
      },
      parseStructuredIngestResponse,
    );
  }

  async structuredIngest(input: StructuredIngestRequest): Promise<StructuredIngestResponse> {
    return this.ingestStructured(input);
  }

  async scanRepository(input: RepositoryScanRequest): Promise<RepositoryScanResponse> {
    validateRepositoryScanRequest(input);
    return this.#request(
      "ingest/repository/scan",
      {
        method: "POST",
        body: JSON.stringify(buildRepositoryScanBody(input)),
      },
      parseRepositoryScanResponse,
    );
  }

  async repositoryScan(input: RepositoryScanRequest): Promise<RepositoryScanResponse> {
    return this.scanRepository(input);
  }

  async search(input: SearchQueryRequest): Promise<SearchQueryResponse> {
    validateSearchQueryRequest(input);
    return this.#request(
      "search/query",
      {
        method: "POST",
        body: JSON.stringify(buildSearchQueryBody(input)),
      },
      parseSearchQueryResponse,
    );
  }

  async searchQuery(input: SearchQueryRequest): Promise<SearchQueryResponse> {
    return this.search(input);
  }

  async createQuarantineCases(
    input: QuarantineCasesRequest,
  ): Promise<QuarantineCasesResponse> {
    validateQuarantineCasesRequest(input);
    return this.#request(
      "quarantine/cases",
      {
        method: "POST",
        body: JSON.stringify(buildQuarantineCasesBody(input)),
      },
      parseQuarantineCasesResponse,
    );
  }

  async buildQuarantineCases(
    input: QuarantineCasesRequest,
  ): Promise<QuarantineCasesResponse> {
    return this.createQuarantineCases(input);
  }

  async decideQuarantineCase(
    input: QuarantineDecisionRequest,
  ): Promise<QuarantineDecisionResponse> {
    validateQuarantineDecisionRequest(input);
    return this.#request(
      `quarantine/cases/${encodePathPart(input.caseId)}/decision`,
      {
        method: "POST",
        body: JSON.stringify(buildQuarantineDecisionBody(input)),
      },
      parseQuarantineDecisionResponse,
    );
  }

  #request<T>(
    path: string,
    init: FetchRequestInit,
    parse: Validator<T>,
  ): Promise<T> {
    return this.#requestUrl(this.#url(path), init, parse);
  }

  async #requestUrl<T>(
    url: string,
    init: FetchRequestInit,
    parse: Validator<T>,
  ): Promise<T> {
    let response: FetchResponseLike;
    const requestInit = {
      method: init.method,
      headers: this.#requestHeaders(init.body !== undefined),
      ...(init.body === undefined ? {} : { body: init.body }),
    };

    try {
      response = await this.#fetch(url, requestInit);
    } catch (cause) {
      throw new ApiNetworkError("API request failed before a response was received", cause);
    }

    return parseJsonApiResponse(response, parse);
  }

  #url(path: string): string {
    return new URL(path.replace(/^\/+/, ""), this.#baseUrl).href;
  }

  #requestHeaders(hasBody: boolean): Readonly<Record<string, string>> {
    const headers: Record<string, string> = {
      accept: "application/json",
      ...this.#headers,
    };

    if (this.#apiKey !== undefined && !hasHeader(headers, "authorization")) {
      headers.authorization = `Bearer ${this.#apiKey}`;
    }

    if (hasBody && !hasHeader(headers, "content-type")) {
      headers["content-type"] = "application/json";
    }

    return Object.freeze(headers);
  }
}

export function createIngestSearchClient(
  options: SovereignOpsClientOptions,
): IngestSearchClient {
  return new IngestSearchClient(options);
}

function buildNormalizeBody(input: IngestNormalizeRequest): Record<string, unknown> {
  return {
    workspaceId: input.workspaceId,
    sourceUri: input.sourceUri,
    mediaType: input.mediaType,
    content: input.content,
    ...optionalObject("options", buildNormalizeOptions(input.options)),
  };
}

function buildStructuredIngestBody(input: StructuredIngestRequest): Record<string, unknown> {
  return {
    workspaceId: input.workspaceId,
    sourceUri: input.sourceUri,
    mediaType: input.mediaType,
    content: input.content,
    ...optionalObject("options", buildStructuredIngestOptions(input.options)),
  };
}

function buildRepositoryScanBody(input: RepositoryScanRequest): Record<string, unknown> {
  return {
    workspaceId: input.workspaceId,
    localPath: input.localPath,
    ...optionalObject("options", buildRepositoryScanOptions(input.options)),
  };
}

function buildSearchQueryBody(input: SearchQueryRequest): Record<string, unknown> {
  return {
    workspaceId: input.workspaceId,
    query: input.query.trim(),
    ...optionalObject("filters", buildSearchFilters(input.filters)),
    ...(input.limit === undefined ? {} : { limit: input.limit }),
  };
}

function buildQuarantineCasesBody(input: QuarantineCasesRequest): Record<string, unknown> {
  return {
    workspaceId: input.workspaceId,
    items: input.items.map((item) => ({
      id: item.id,
      sourceUri: item.sourceUri,
      checksum: item.checksum,
      reasonCode: item.reasonCode,
      content: item.content,
      citation: buildCitation(item.citation),
      ...(item.untrusted === undefined ? {} : { untrusted: item.untrusted }),
    })),
  };
}

function buildQuarantineDecisionBody(input: QuarantineDecisionRequest): Record<string, unknown> {
  return {
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    decision: input.decision,
    reason: input.reason,
    ...(input.override === undefined ? {} : { override: input.override }),
    decidedAt: input.decidedAt,
  };
}

function buildNormalizeOptions(
  options: IngestNormalizeOptions | undefined,
): Record<string, unknown> | undefined {
  if (options === undefined) {
    return undefined;
  }

  return {
    ...(options.trusted === undefined ? {} : { trusted: options.trusted }),
  };
}

function buildStructuredIngestOptions(
  options: StructuredIngestOptions | undefined,
): Record<string, unknown> | undefined {
  if (options === undefined) {
    return undefined;
  }

  return {
    ...(options.requiredColumns === undefined ? {} : { requiredColumns: [...options.requiredColumns] }),
    ...(options.uniqueColumns === undefined ? {} : { uniqueColumns: [...options.uniqueColumns] }),
    ...(options.trusted === undefined ? {} : { trusted: options.trusted }),
  };
}

function buildRepositoryScanOptions(
  options: RepositoryScanOptions | undefined,
): Record<string, unknown> | undefined {
  if (options === undefined) {
    return undefined;
  }

  return {
    ...(options.includePaths === undefined ? {} : { includePaths: [...options.includePaths] }),
    ...(options.maxTextBytes === undefined ? {} : { maxTextBytes: options.maxTextBytes }),
    ...(options.trusted === undefined ? {} : { trusted: options.trusted }),
  };
}

function buildSearchFilters(
  filters: SearchQueryFilters | undefined,
): Record<string, unknown> | undefined {
  if (filters === undefined) {
    return undefined;
  }

  return {
    ...(filters.mediaTypes === undefined ? {} : { mediaTypes: [...filters.mediaTypes] }),
    ...(filters.sourceUris === undefined ? {} : { sourceUris: [...filters.sourceUris] }),
    ...(filters.tags === undefined ? {} : { tags: [...filters.tags] }),
  };
}

function buildCitation(citation: IngestCitation): Record<string, unknown> {
  return {
    sourceUri: citation.sourceUri,
    range: buildCitationRange(citation.range),
    trusted: citation.trusted,
  };
}

function buildCitationRange(range: IngestCitationRange): Record<string, unknown> {
  return {
    ...(range.startLine === undefined ? {} : { startLine: range.startLine }),
    ...(range.endLine === undefined ? {} : { endLine: range.endLine }),
    ...(range.path === undefined ? {} : { path: range.path }),
    ...(range.row === undefined ? {} : { row: range.row }),
    ...(range.column === undefined ? {} : { column: range.column }),
  };
}

function optionalObject(
  key: string,
  value: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (value === undefined || Object.keys(value).length === 0) {
    return {};
  }

  return { [key]: value };
}

function validateNormalizeRequest(input: IngestNormalizeRequest): void {
  const issues = collectTextIngestRequestIssues(input, "normalize request");
  collectNormalizeOptionsIssues(isRecord(input) ? input.options : undefined, "options", issues);
  throwRequestIssues("ingest normalize request is invalid", issues);
}

function validateStructuredIngestRequest(input: StructuredIngestRequest): void {
  const issues = collectTextIngestRequestIssues(input, "structured ingest request");
  collectStructuredOptionsIssues(isRecord(input) ? input.options : undefined, "options", issues);
  throwRequestIssues("structured ingest request is invalid", issues);
}

function validateRepositoryScanRequest(input: RepositoryScanRequest): void {
  if (!isRecord(input)) {
    throw new ApiRequestValidationError("repository scan request is invalid", [
      { path: "", message: "request must be an object" },
    ]);
  }

  const issues: ValidationIssue[] = [];
  requireWorkspaceId(input, "workspaceId", issues);
  requireRelativePath(input, "localPath", "localPath", issues);
  collectRepositoryScanOptionsIssues(input.options, "options", issues);
  throwRequestIssues("repository scan request is invalid", issues);
}

function validateSearchQueryRequest(input: SearchQueryRequest): void {
  if (!isRecord(input)) {
    throw new ApiRequestValidationError("search query request is invalid", [
      { path: "", message: "request must be an object" },
    ]);
  }

  const issues: ValidationIssue[] = [];
  requireWorkspaceId(input, "workspaceId", issues);
  requireNonEmptyString(input, "query", "query", issues);
  collectSearchFiltersIssues(input.filters, "filters", issues);
  if (input.limit !== undefined) {
    requireBoundedInteger(input, "limit", "limit", 1, 50, issues);
  }
  throwRequestIssues("search query request is invalid", issues);
}

function validateQuarantineCasesRequest(input: QuarantineCasesRequest): void {
  if (!isRecord(input)) {
    throw new ApiRequestValidationError("quarantine cases request is invalid", [
      { path: "", message: "request must be an object" },
    ]);
  }

  const issues: ValidationIssue[] = [];
  requireWorkspaceId(input, "workspaceId", issues);
  if (!Array.isArray(input.items) || input.items.length === 0) {
    issues.push({ path: "items", message: "items must be a non-empty array" });
  } else {
    input.items.forEach((item, index) => collectQuarantineCaseItemIssues(item, `items.${index}`, issues));
  }
  throwRequestIssues("quarantine cases request is invalid", issues);
}

function validateQuarantineDecisionRequest(input: QuarantineDecisionRequest): void {
  if (!isRecord(input)) {
    throw new ApiRequestValidationError("quarantine decision request is invalid", [
      { path: "", message: "request must be an object" },
    ]);
  }

  const issues: ValidationIssue[] = [];
  requireNonEmptyString(input, "caseId", "caseId", issues);
  requireWorkspaceId(input, "workspaceId", issues);
  requireNonEmptyString(input, "actorId", "actorId", issues);
  requireOneOf(input, "decision", "decision", QUARANTINE_ACTIONS, issues);
  requireNonEmptyString(input, "reason", "reason", issues);
  requireIsoTimestamp(input, "decidedAt", "decidedAt", issues);
  if (input.override !== undefined) {
    requireBoolean(input, "override", "override", issues);
  }
  throwRequestIssues("quarantine decision request is invalid", issues);
}

function collectTextIngestRequestIssues(input: unknown, label: string): ValidationIssue[] {
  if (!isRecord(input)) {
    return [{ path: "", message: `${label} must be an object` }];
  }

  const issues: ValidationIssue[] = [];
  requireWorkspaceId(input, "workspaceId", issues);
  requireLocalSourceUri(input, "sourceUri", "sourceUri", issues);
  requireMediaType(input, "mediaType", "mediaType", issues);
  requireString(input, "content", "content", issues);
  return issues;
}

function collectNormalizeOptionsIssues(
  options: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (options === undefined) {
    return;
  }
  if (!isRecord(options)) {
    issues.push({ path, message: "options must be an object" });
    return;
  }
  if (options.trusted !== undefined) {
    requireBoolean(options, "trusted", joinPath(path, "trusted"), issues);
  }
}

function collectStructuredOptionsIssues(
  options: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  collectNormalizeOptionsIssues(options, path, issues);
  if (!isRecord(options)) {
    return;
  }
  collectOptionalStringArrayIssues(options, "requiredColumns", joinPath(path, "requiredColumns"), issues);
  collectOptionalStringArrayIssues(options, "uniqueColumns", joinPath(path, "uniqueColumns"), issues);
}

function collectRepositoryScanOptionsIssues(
  options: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  collectNormalizeOptionsIssues(options, path, issues);
  if (!isRecord(options)) {
    return;
  }
  if (options.includePaths !== undefined) {
    if (!Array.isArray(options.includePaths)) {
      issues.push({ path: joinPath(path, "includePaths"), message: "includePaths must be an array" });
    } else {
      options.includePaths.forEach((item, index) => {
        requireRelativePath(
          { value: item },
          "value",
          `${joinPath(path, "includePaths")}.${index}`,
          issues,
        );
      });
    }
  }
  if (options.maxTextBytes !== undefined) {
    requirePositiveInteger(options, "maxTextBytes", joinPath(path, "maxTextBytes"), issues);
  }
}

function collectSearchFiltersIssues(
  filters: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (filters === undefined) {
    return;
  }
  if (!isRecord(filters)) {
    issues.push({ path, message: "filters must be an object" });
    return;
  }
  collectOptionalMediaTypeArrayIssues(filters, "mediaTypes", joinPath(path, "mediaTypes"), issues);
  collectOptionalLocalSourceUriArrayIssues(filters, "sourceUris", joinPath(path, "sourceUris"), issues);
  collectOptionalStringArrayIssues(filters, "tags", joinPath(path, "tags"), issues);
}

function collectQuarantineCaseItemIssues(
  item: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(item)) {
    issues.push({ path, message: "item must be an object" });
    return;
  }

  requireNonEmptyString(item, "id", joinPath(path, "id"), issues);
  requireLocalSourceUri(item, "sourceUri", joinPath(path, "sourceUri"), issues);
  requireChecksum(item, "checksum", joinPath(path, "checksum"), issues);
  requireNonEmptyString(item, "reasonCode", joinPath(path, "reasonCode"), issues);
  requireString(item, "content", joinPath(path, "content"), issues);
  collectCitationIssues(item.citation, joinPath(path, "citation"), issues);
  if (item.untrusted !== undefined) {
    requireBoolean(item, "untrusted", joinPath(path, "untrusted"), issues);
  }
}

function parseNormalizeResponse(value: unknown): IngestNormalizeResponse {
  const issues: ValidationIssue[] = [];
  collectNormalizeResponseIssues(value, "", issues);
  throwResponseIssues(issues, value);

  return deepFreezeClone(value) as IngestNormalizeResponse;
}

function parseStructuredIngestResponse(value: unknown): StructuredIngestResponse {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw new ApiResponseValidationError([{ path: "", message: "response must be an object" }], value);
  }

  requireTrue(value, "ok", "ok", issues);
  requireLocalSourceUri(value, "sourceUri", "sourceUri", issues);
  requireMediaType(value, "mediaType", "mediaType", issues);
  collectStructuredSummaryIssues(value.summary, "summary", issues);
  collectStructuredDocumentArrayIssues(value.documents, "documents", issues);
  collectStructuredQuarantineIssues(value.quarantine, "quarantine", issues);
  collectOptionalValidationErrorsIssues(value.validationErrors, "validationErrors", issues);
  throwResponseIssues(issues, value);

  return deepFreezeClone(value) as StructuredIngestResponse;
}

function parseRepositoryScanResponse(value: unknown): RepositoryScanResponse {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw new ApiResponseValidationError([{ path: "", message: "response must be an object" }], value);
  }

  requireTrue(value, "ok", "ok", issues);
  requireWorkspaceId(value, "workspaceId", issues);
  if (!Array.isArray(value.sources)) {
    issues.push({ path: "sources", message: "sources must be an array" });
  } else {
    value.sources.forEach((source, index) => collectRepositoryScanSourceIssues(source, `sources.${index}`, issues));
  }
  throwResponseIssues(issues, value);

  return deepFreezeClone(value) as RepositoryScanResponse;
}

function parseSearchQueryResponse(value: unknown): SearchQueryResponse {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw new ApiResponseValidationError([{ path: "", message: "response must be an object" }], value);
  }

  requireTrue(value, "ok", "ok", issues);
  requireWorkspaceId(value, "workspaceId", issues);
  requireNonEmptyString(value, "query", "query", issues);
  if (!Array.isArray(value.results)) {
    issues.push({ path: "results", message: "results must be an array" });
  } else {
    value.results.forEach((result, index) => collectSearchQueryResultIssues(result, `results.${index}`, issues));
  }
  throwResponseIssues(issues, value);

  return deepFreezeClone(value) as SearchQueryResponse;
}

function parseQuarantineCasesResponse(value: unknown): QuarantineCasesResponse {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw new ApiResponseValidationError([{ path: "", message: "response must be an object" }], value);
  }

  requireTrue(value, "ok", "ok", issues);
  if (!Array.isArray(value.cases)) {
    issues.push({ path: "cases", message: "cases must be an array" });
  } else {
    value.cases.forEach((record, index) => collectQuarantineCaseIssues(record, `cases.${index}`, issues));
  }
  throwResponseIssues(issues, value);

  return deepFreezeClone(value) as QuarantineCasesResponse;
}

function parseQuarantineDecisionResponse(value: unknown): QuarantineDecisionResponse {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw new ApiResponseValidationError([{ path: "", message: "response must be an object" }], value);
  }

  requireTrue(value, "ok", "ok", issues);
  collectQuarantineDecisionCaseIssues(value.case, "case", issues);
  throwResponseIssues(issues, value);

  return deepFreezeClone(value) as QuarantineDecisionResponse;
}

function collectNormalizeResponseIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "response must be an object" });
    return;
  }

  requireTrue(value, "ok", joinPath(path, "ok"), issues);
  requireLocalSourceUri(value, "sourceUri", joinPath(path, "sourceUri"), issues);
  requireMediaType(value, "mediaType", joinPath(path, "mediaType"), issues);
  requireChecksum(value, "checksum", joinPath(path, "checksum"), issues);
  requireString(value, "normalizedText", joinPath(path, "normalizedText"), issues);
  requireBoolean(value, "untrusted", joinPath(path, "untrusted"), issues);
}

function collectStructuredSummaryIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "summary must be an object" });
    return;
  }

  requireNonNegativeInteger(value, "documentCount", joinPath(path, "documentCount"), issues);
  requireNonNegativeInteger(value, "indexedCount", joinPath(path, "indexedCount"), issues);
  requireNonNegativeInteger(value, "quarantineCount", joinPath(path, "quarantineCount"), issues);
  requireNonNegativeInteger(value, "validationErrorCount", joinPath(path, "validationErrorCount"), issues);
}

function collectStructuredDocumentArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "documents must be an array" });
    return;
  }

  value.forEach((document, index) => collectStructuredDocumentIssues(document, `${path}.${index}`, issues));
}

function collectStructuredDocumentIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "document must be an object" });
    return;
  }

  requireNonEmptyString(value, "id", joinPath(path, "id"), issues);
  requireLocalSourceUri(value, "sourceUri", joinPath(path, "sourceUri"), issues);
  requireMediaType(value, "mediaType", joinPath(path, "mediaType"), issues);
  requireChecksum(value, "checksum", joinPath(path, "checksum"), issues);
  requireNonEmptyString(value, "title", joinPath(path, "title"), issues);
  requireBoolean(value, "untrusted", joinPath(path, "untrusted"), issues);
  requireNonEmptyString(value, "quarantineState", joinPath(path, "quarantineState"), issues);
  collectCitationArrayIssues(value.citations, joinPath(path, "citations"), issues);
}

function collectStructuredQuarantineIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "quarantine must be an object" });
    return;
  }

  if (!Array.isArray(value.items)) {
    issues.push({ path: joinPath(path, "items"), message: "items must be an array" });
    return;
  }

  value.items.forEach((item, index) => {
    collectStructuredQuarantineItemIssues(item, `${joinPath(path, "items")}.${index}`, issues);
  });
}

function collectStructuredQuarantineItemIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "quarantine item must be an object" });
    return;
  }

  requireNonEmptyString(value, "id", joinPath(path, "id"), issues);
  requireLocalSourceUri(value, "sourceUri", joinPath(path, "sourceUri"), issues);
  requireChecksum(value, "checksum", joinPath(path, "checksum"), issues);
  requireNonEmptyString(value, "reasonCode", joinPath(path, "reasonCode"), issues);
  collectCitationIssues(value.citation, joinPath(path, "citation"), issues);
  requireBoolean(value, "untrusted", joinPath(path, "untrusted"), issues);
  requireNonEmptyString(value, "quarantineState", joinPath(path, "quarantineState"), issues);
}

function collectOptionalValidationErrorsIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    issues.push({ path, message: "validationErrors must be an array" });
    return;
  }
  value.forEach((error, index) => {
    const errorPath = `${path}.${index}`;
    if (!isRecord(error)) {
      issues.push({ path: errorPath, message: "validation error must be an object" });
      return;
    }
    requireNonEmptyString(error, "path", joinPath(errorPath, "path"), issues);
    requireNonEmptyString(error, "message", joinPath(errorPath, "message"), issues);
  });
}

function collectRepositoryScanSourceIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "source must be an object" });
    return;
  }

  requireLocalSourceUri(value, "sourceUri", joinPath(path, "sourceUri"), issues);
  requireRelativePath(value, "path", joinPath(path, "path"), issues);
  requireMediaType(value, "mediaType", joinPath(path, "mediaType"), issues);
  requireChecksum(value, "checksum", joinPath(path, "checksum"), issues);
  requireNonEmptyString(value, "state", joinPath(path, "state"), issues);
  requireBoolean(value, "untrusted", joinPath(path, "untrusted"), issues);
}

function collectSearchQueryResultIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "result must be an object" });
    return;
  }

  requireNonEmptyString(value, "id", joinPath(path, "id"), issues);
  requireNonNegativeNumber(value, "score", joinPath(path, "score"), issues);
  collectStringArrayIssues(value.matchedTerms, joinPath(path, "matchedTerms"), issues);
  requireLocalSourceUri(value, "sourceUri", joinPath(path, "sourceUri"), issues);
  requireMediaType(value, "mediaType", joinPath(path, "mediaType"), issues);
  requireChecksum(value, "checksum", joinPath(path, "checksum"), issues);
  requireNonEmptyString(value, "title", joinPath(path, "title"), issues);
  requireString(value, "snippet", joinPath(path, "snippet"), issues);
  collectCitationArrayIssues(value.citations, joinPath(path, "citations"), issues);
  requireBoolean(value, "untrusted", joinPath(path, "untrusted"), issues);
  requireNonEmptyString(value, "quarantineState", joinPath(path, "quarantineState"), issues);
}

function collectQuarantineCaseIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "case must be an object" });
    return;
  }

  requireNonEmptyString(value, "id", joinPath(path, "id"), issues);
  requireLocalSourceUri(value, "sourceUri", joinPath(path, "sourceUri"), issues);
  requireOneOf(value, "state", joinPath(path, "state"), QUARANTINE_STATES, issues);
  collectStringArrayIssues(value.reasonCodes, joinPath(path, "reasonCodes"), issues);
  requireOneOf(value, "severity", joinPath(path, "severity"), QUARANTINE_SEVERITIES, issues);
  collectCitationArrayIssues(value.citationSnapshots, joinPath(path, "citationSnapshots"), issues);
  requireString(value, "previewText", joinPath(path, "previewText"), issues);
  collectOneOfArrayIssues(value.allowedActions, joinPath(path, "allowedActions"), QUARANTINE_ACTIONS, issues);
}

function collectQuarantineDecisionCaseIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "case must be an object" });
    return;
  }

  requireNonEmptyString(value, "id", joinPath(path, "id"), issues);
  requireLocalSourceUri(value, "sourceUri", joinPath(path, "sourceUri"), issues);
  requireOneOf(value, "fromState", joinPath(path, "fromState"), QUARANTINE_STATES, issues);
  requireOneOf(value, "state", joinPath(path, "state"), QUARANTINE_STATES, issues);
  collectDecisionResultIssues(value.decision, joinPath(path, "decision"), issues);
}

function collectDecisionResultIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "decision must be an object" });
    return;
  }

  requireOneOf(value, "action", joinPath(path, "action"), QUARANTINE_ACTIONS, issues);
  requireNonEmptyString(value, "actorId", joinPath(path, "actorId"), issues);
  requireIsoTimestamp(value, "timestamp", joinPath(path, "timestamp"), issues);
  requireNonEmptyString(value, "reason", joinPath(path, "reason"), issues);
  requireBoolean(value, "override", joinPath(path, "override"), issues);
}

function collectCitationArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "citations must be an array" });
    return;
  }
  if (value.length === 0) {
    issues.push({ path, message: "citations must not be empty" });
    return;
  }
  value.forEach((citation, index) => collectCitationIssues(citation, `${path}.${index}`, issues));
}

function collectCitationIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "citation must be an object" });
    return;
  }

  requireLocalSourceUri(value, "sourceUri", joinPath(path, "sourceUri"), issues);
  collectCitationRangeIssues(value.range, joinPath(path, "range"), issues);
  requireBoolean(value, "trusted", joinPath(path, "trusted"), issues);
}

function collectCitationRangeIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "range must be an object" });
    return;
  }

  const keys = ["startLine", "endLine", "path", "row", "column"].filter((key) =>
    Object.hasOwn(value, key),
  );
  if (keys.length === 0) {
    issues.push({ path, message: "range must include at least one locator" });
  }
  if (value.startLine !== undefined) {
    requirePositiveInteger(value, "startLine", joinPath(path, "startLine"), issues);
  }
  if (value.endLine !== undefined) {
    requirePositiveInteger(value, "endLine", joinPath(path, "endLine"), issues);
  }
  if (value.path !== undefined) {
    requireNonEmptyString(value, "path", joinPath(path, "path"), issues);
  }
  if (value.row !== undefined) {
    requirePositiveInteger(value, "row", joinPath(path, "row"), issues);
  }
  if (
    value.column !== undefined &&
    !(
      (Number.isInteger(value.column) && (value.column as number) > 0) ||
      (typeof value.column === "string" && value.column.trim().length > 0)
    )
  ) {
    issues.push({ path: joinPath(path, "column"), message: "column must be a positive integer or non-empty string" });
  }
  if (
    Number.isInteger(value.startLine) &&
    Number.isInteger(value.endLine) &&
    (value.endLine as number) < (value.startLine as number)
  ) {
    issues.push({ path: joinPath(path, "endLine"), message: "endLine must be greater than or equal to startLine" });
  }
}

function collectOptionalStringArrayIssues(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value[field] === undefined) {
    return;
  }
  collectStringArrayIssues(value[field], path, issues);
}

function collectOptionalMediaTypeArrayIssues(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value[field] === undefined) {
    return;
  }
  if (!Array.isArray(value[field]) || (value[field] as unknown[]).length === 0) {
    issues.push({ path, message: `${field} must be a non-empty array` });
    return;
  }
  (value[field] as unknown[]).forEach((item, index) => {
    if (typeof item !== "string" || !MEDIA_TYPE_PATTERN.test(item)) {
      issues.push({ path: `${path}.${index}`, message: "media type must be valid" });
    }
  });
}

function collectOptionalLocalSourceUriArrayIssues(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value[field] === undefined) {
    return;
  }
  if (!Array.isArray(value[field]) || (value[field] as unknown[]).length === 0) {
    issues.push({ path, message: `${field} must be a non-empty array` });
    return;
  }
  (value[field] as unknown[]).forEach((item, index) => {
    requireLocalSourceUri({ value: item }, "value", `${path}.${index}`, issues);
  });
}

function collectStringArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push({ path, message: "value must be a non-empty array" });
    return;
  }
  value.forEach((item, index) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      issues.push({ path: `${path}.${index}`, message: "value must be a non-empty string" });
    }
  });
}

function collectOneOfArrayIssues<T extends string>(
  value: unknown,
  path: string,
  allowed: readonly T[],
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push({ path, message: "value must be a non-empty array" });
    return;
  }
  value.forEach((item, index) => {
    if (!allowed.includes(item as T)) {
      issues.push({ path: `${path}.${index}`, message: `value must be one of ${allowed.join(", ")}` });
    }
  });
}

function requireWorkspaceId(
  value: Record<string, unknown>,
  field: string,
  issues: ValidationIssue[],
): void {
  if (typeof value[field] !== "string" || (value[field] as string).trim().length === 0) {
    issues.push({ path: field, message: `${field} must be a non-empty string` });
    return;
  }
  if (!(value[field] as string).startsWith("wsp_")) {
    issues.push({ path: field, message: `${field} must use the wsp_ prefix` });
  }
}

function requireLocalSourceUri(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (typeof value[field] !== "string" || !LOCAL_SOURCE_URI_PATTERN.test(value[field] as string)) {
    issues.push({ path, message: `${field} must be a local source URI` });
  }
}

function requireMediaType(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (typeof value[field] !== "string" || !MEDIA_TYPE_PATTERN.test(value[field] as string)) {
    issues.push({ path, message: `${field} must be a media type` });
  }
}

function requireChecksum(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (typeof value[field] !== "string" || !CHECKSUM_PATTERN.test(value[field] as string)) {
    issues.push({ path, message: `${field} must be a lowercase SHA-256 checksum` });
  }
}

function requireRelativePath(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (typeof value[field] !== "string" || (value[field] as string).trim().length === 0) {
    issues.push({ path, message: `${field} must be a non-empty relative path` });
    return;
  }

  const raw = value[field] as string;
  const normalized = raw.replace(/\\/g, "/");
  if (
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.split("/").includes("..")
  ) {
    issues.push({ path, message: `${field} must stay within the workspace root` });
  }
}

function requireString(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (typeof value[field] !== "string") {
    issues.push({ path, message: `${field} must be a string` });
  }
}

function requireNonEmptyString(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (typeof value[field] !== "string" || (value[field] as string).trim().length === 0) {
    issues.push({ path, message: `${field} must be a non-empty string` });
  }
}

function requireBoolean(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (typeof value[field] !== "boolean") {
    issues.push({ path, message: `${field} must be a boolean` });
  }
}

function requireTrue(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value[field] !== true) {
    issues.push({ path, message: `${field} must be true` });
  }
}

function requireIsoTimestamp(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (typeof value[field] !== "string" || !isIsoTimestamp(value[field] as string)) {
    issues.push({ path, message: `${field} must be an ISO timestamp` });
  }
}

function requirePositiveInteger(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Number.isInteger(value[field]) || (value[field] as number) <= 0) {
    issues.push({ path, message: `${field} must be a positive integer` });
  }
}

function requireNonNegativeInteger(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Number.isInteger(value[field]) || (value[field] as number) < 0) {
    issues.push({ path, message: `${field} must be a non-negative integer` });
  }
}

function requireNonNegativeNumber(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (typeof value[field] !== "number" || !Number.isFinite(value[field]) || (value[field] as number) < 0) {
    issues.push({ path, message: `${field} must be a non-negative number` });
  }
}

function requireBoundedInteger(
  value: Record<string, unknown>,
  field: string,
  path: string,
  min: number,
  max: number,
  issues: ValidationIssue[],
): void {
  if (!Number.isInteger(value[field]) || (value[field] as number) < min || (value[field] as number) > max) {
    issues.push({ path, message: `${field} must be an integer from ${min} to ${max}` });
  }
}

function requireOneOf<T extends string>(
  value: Record<string, unknown>,
  field: string,
  path: string,
  allowed: readonly T[],
  issues: ValidationIssue[],
): void {
  if (!allowed.includes(value[field] as T)) {
    issues.push({ path, message: `${field} must be one of ${allowed.join(", ")}` });
  }
}

function throwRequestIssues(message: string, issues: readonly ValidationIssue[]): void {
  if (issues.length > 0) {
    throw new ApiRequestValidationError(message, issues);
  }
}

function throwResponseIssues(issues: readonly ValidationIssue[], body: unknown): void {
  if (issues.length > 0) {
    throw new ApiResponseValidationError(issues, body);
  }
}

function isIsoTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasHeader(headers: Readonly<Record<string, string>>, name: string): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === name.toLowerCase());
}

function encodePathPart(value: string): string {
  return encodeURIComponent(value);
}

function joinPath(prefix: string, field: string): string {
  return prefix.length === 0 ? field : `${prefix}.${field}`;
}

function deepFreezeClone<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }
  return value;
}
