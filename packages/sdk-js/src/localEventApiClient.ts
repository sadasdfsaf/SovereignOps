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
import {
  canonicalLocalEventOperations,
  canonicalSharedSchemaKinds,
  validateCanonicalLocalEvent,
  validateCanonicalLocalEventCatalog,
  type CanonicalLocalEvent,
  type CanonicalLocalEventCatalog,
} from "../../schemas/src/eventCatalog.ts";
import type {
  LocalEventCatalogSummary,
  LocalEventReplayBatch,
  LocalEventReplayBatchOptions,
} from "./localEvents.ts";

export type LocalEventApiClientOptions = SovereignOpsClientOptions;

export interface LocalEventReplayBatchesResponse {
  readonly batches: readonly LocalEventReplayBatch[];
}

export type LocalEventReplayExportFormat = "jsonl" | "csv" | "package";

export interface LocalEventReplayExportRequest {
  readonly format?: LocalEventReplayExportFormat;
  readonly catalog?: unknown;
  readonly catalogPath?: string;
  readonly filters?: Readonly<Record<string, unknown>>;
  readonly createdAt?: string;
  readonly exportId?: string;
}

export type LocalEventReplayExportResponse = Readonly<Record<string, unknown>>;

type Validator<T> = (value: unknown) => T;

const CATALOG_ENDPOINT = "local-events/catalog";
const SUMMARY_ENDPOINT = "local-events/summary";
const REPLAY_BATCHES_ENDPOINT = "local-events/replay-batches";
const REPLAY_EXPORT_ENDPOINT = "local-events/replay-export";
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const EVENT_ID_PATTERN = /^evt_[A-Za-z0-9_-]{1,88}$/;
const ACTOR_ID_PATTERN = /^act_[A-Za-z0-9_-]{1,88}$/;

export class LocalEventApiClient {
  readonly #baseUrl: string;
  readonly #fetch: FetchLike;
  readonly #apiKey?: string;
  readonly #headers: Readonly<Record<string, string>>;

  constructor(options: LocalEventApiClientOptions) {
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

  async getCatalog(): Promise<CanonicalLocalEventCatalog> {
    return this.#request(CATALOG_ENDPOINT, { method: "GET" }, parseLocalEventCatalogResponse);
  }

  async catalog(): Promise<CanonicalLocalEventCatalog> {
    return this.getCatalog();
  }

  async getSummary(): Promise<LocalEventCatalogSummary> {
    return this.#request(SUMMARY_ENDPOINT, { method: "GET" }, parseLocalEventCatalogSummaryResponse);
  }

  async summary(): Promise<LocalEventCatalogSummary> {
    return this.getSummary();
  }

  async getReplayBatches(
    query: LocalEventReplayBatchOptions = {},
  ): Promise<LocalEventReplayBatchesResponse> {
    validateReplayBatchQuery(query);
    const url = this.#url(REPLAY_BATCHES_ENDPOINT, replayBatchQueryParams(query));
    return this.#requestUrl(url, { method: "GET" }, parseLocalEventReplayBatchesResponse);
  }

  async replayBatches(
    query: LocalEventReplayBatchOptions = {},
  ): Promise<LocalEventReplayBatchesResponse> {
    return this.getReplayBatches(query);
  }

  async exportReplay(
    request: LocalEventReplayExportRequest = {},
  ): Promise<LocalEventReplayExportResponse> {
    validateReplayExportRequest(request);
    return this.#request(
      REPLAY_EXPORT_ENDPOINT,
      {
        method: "POST",
        body: JSON.stringify(request),
      },
      parseLocalEventReplayExportResponse,
    );
  }

  async replayExport(
    request: LocalEventReplayExportRequest = {},
  ): Promise<LocalEventReplayExportResponse> {
    return this.exportReplay(request);
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

  #url(
    path: string,
    query: Readonly<Record<string, string | number | undefined>> = {},
  ): string {
    const url = new URL(path.replace(/^\/+/, ""), this.#baseUrl);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
    return url.href;
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

export function createLocalEventApiClient(
  options: LocalEventApiClientOptions,
): LocalEventApiClient {
  return new LocalEventApiClient(options);
}

function parseLocalEventCatalogResponse(value: unknown): CanonicalLocalEventCatalog {
  const result = validateCanonicalLocalEventCatalog(value);
  if (!result.ok || result.value === undefined) {
    throw new ApiResponseValidationError(result.issues, value);
  }

  return result.value;
}

function parseLocalEventCatalogSummaryResponse(value: unknown): LocalEventCatalogSummary {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw new ApiResponseValidationError([{ path: "", message: "response must be an object" }], value);
  }

  requireOptionalPattern(value, "workspaceId", "workspaceId", /^wsp_[A-Za-z0-9_-]{1,88}$/, issues);
  requireOptionalString(value, "generatedAt", "generatedAt", issues);
  requireNonNegativeInteger(value, "eventCount", "eventCount", issues);
  requireOptionalPositiveInteger(value, "firstSequence", "firstSequence", issues);
  requireOptionalPositiveInteger(value, "lastSequence", "lastSequence", issues);
  requireOptionalString(value, "firstRecordedAt", "firstRecordedAt", issues);
  requireOptionalString(value, "lastRecordedAt", "lastRecordedAt", issues);
  requireNonNegativeInteger(value, "redactedEventCount", "redactedEventCount", issues);
  requireNonNegativeInteger(value, "redactedFieldCount", "redactedFieldCount", issues);
  collectCountRecordIssues(value.operations, "operations", canonicalLocalEventOperations, issues);
  collectCountRecordIssues(value.schemaKinds, "schemaKinds", canonicalSharedSchemaKinds, issues);
  collectOperationSchemaKindSummaryIssues(value.operationSchemaKinds, "operationSchemaKinds", issues);
  collectStringArrayIssues(value.actorIds, "actorIds", ACTOR_ID_PATTERN, issues);
  collectStringArrayIssues(value.recordIds, "recordIds", undefined, issues);

  if (issues.length > 0) {
    throw new ApiResponseValidationError(issues, value);
  }

  return deepFreezeClone(value) as LocalEventCatalogSummary;
}

function parseLocalEventReplayBatchesResponse(value: unknown): LocalEventReplayBatchesResponse {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw new ApiResponseValidationError([{ path: "", message: "response must be an object" }], value);
  }
  if (!Array.isArray(value.batches)) {
    issues.push({ path: "batches", message: "batches must be an array" });
  } else {
    value.batches.forEach((batch, index) =>
      collectReplayBatchIssues(batch, `batches.${index}`, issues)
    );
  }

  if (issues.length > 0) {
    throw new ApiResponseValidationError(issues, value);
  }

  return deepFreezeClone(value) as LocalEventReplayBatchesResponse;
}

function parseLocalEventReplayExportResponse(value: unknown): LocalEventReplayExportResponse {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw new ApiResponseValidationError([{ path: "", message: "response must be an object" }], value);
  }

  if (
    value.kind !== "audit-export.local-event-replay.content" &&
    value.kind !== "audit-export.local-event-replay.package"
  ) {
    issues.push({
      path: "kind",
      message: "kind must identify a local event replay export response",
    });
  }
  if (!isRecord(value.manifest)) {
    issues.push({ path: "manifest", message: "manifest must be an object" });
  }
  if (value.kind === "audit-export.local-event-replay.content") {
    requireAllowedValue(value.format, "format", ["jsonl", "csv"], issues);
    requireNonEmptyString(value, "content", "content", issues);
    requireNonEmptyString(value, "fingerprint", "fingerprint", issues);
  }
  if (value.kind === "audit-export.local-event-replay.package") {
    requireNonEmptyString(value, "jsonl", "jsonl", issues);
    requireNonEmptyString(value, "csv", "csv", issues);
    requireNonEmptyString(value, "fingerprint", "fingerprint", issues);
  }

  if (issues.length > 0) {
    throw new ApiResponseValidationError(issues, value);
  }
  return deepFreezeClone(value);
}

function validateReplayBatchQuery(query: LocalEventReplayBatchOptions): void {
  const issues: ValidationIssue[] = [];
  if (!isRecord(query)) {
    throw new ApiRequestValidationError("local event replay batch query is invalid", [
      { path: "query", message: "query must be an object" },
    ]);
  }

  requireOptionalPositiveInteger(query, "batchSize", "batchSize", issues);
  requireOptionalPositiveInteger(query, "startSequence", "startSequence", issues);
  requireOptionalPositiveInteger(query, "endSequence", "endSequence", issues);
  collectOptionalAllowedValuesIssues(
    query.operations,
    "operations",
    canonicalLocalEventOperations,
    issues,
  );
  collectOptionalAllowedValuesIssues(
    query.schemaKinds,
    "schemaKinds",
    canonicalSharedSchemaKinds,
    issues,
  );

  if (
    typeof query.startSequence === "number" &&
    typeof query.endSequence === "number" &&
    query.endSequence < query.startSequence
  ) {
    issues.push({
      path: "endSequence",
      message: "endSequence must be greater than or equal to startSequence",
    });
  }

  if (issues.length > 0) {
    throw new ApiRequestValidationError("local event replay batch query is invalid", issues);
  }
}

function validateReplayExportRequest(request: LocalEventReplayExportRequest): void {
  const issues: ValidationIssue[] = [];
  if (!isRecord(request)) {
    throw new ApiRequestValidationError("local event replay export request is invalid", [
      { path: "request", message: "request must be an object" },
    ]);
  }
  if (request.format !== undefined) {
    requireAllowedValue(request.format, "format", ["jsonl", "csv", "package"], issues);
  }
  if (request.catalogPath !== undefined && typeof request.catalogPath !== "string") {
    issues.push({ path: "catalogPath", message: "catalogPath must be a string" });
  }
  if (request.filters !== undefined && !isRecord(request.filters)) {
    issues.push({ path: "filters", message: "filters must be an object" });
  }
  if (request.createdAt !== undefined && typeof request.createdAt !== "string") {
    issues.push({ path: "createdAt", message: "createdAt must be a string" });
  }
  if (request.exportId !== undefined && typeof request.exportId !== "string") {
    issues.push({ path: "exportId", message: "exportId must be a string" });
  }

  if (issues.length > 0) {
    throw new ApiRequestValidationError("local event replay export request is invalid", issues);
  }
}

function replayBatchQueryParams(
  query: LocalEventReplayBatchOptions,
): Readonly<Record<string, string | number | undefined>> {
  return {
    batchSize: query.batchSize,
    startSequence: query.startSequence,
    endSequence: query.endSequence,
    operation: query.operations?.join(","),
    schemaKind: query.schemaKinds?.join(","),
  };
}

function collectReplayBatchIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "batch must be an object" });
    return;
  }

  requireNonEmptyString(value, "batchId", joinPath(path, "batchId"), issues);
  requirePositiveInteger(value, "batchIndex", joinPath(path, "batchIndex"), issues);
  requirePositiveInteger(value, "eventCount", joinPath(path, "eventCount"), issues);
  requirePositiveInteger(value, "firstSequence", joinPath(path, "firstSequence"), issues);
  requirePositiveInteger(value, "lastSequence", joinPath(path, "lastSequence"), issues);
  requirePattern(value, "firstEventId", joinPath(path, "firstEventId"), EVENT_ID_PATTERN, issues);
  requirePattern(value, "lastEventId", joinPath(path, "lastEventId"), EVENT_ID_PATTERN, issues);
  requireNullableDigest(value, "previousDigest", joinPath(path, "previousDigest"), issues);
  requirePattern(value, "finalDigest", joinPath(path, "finalDigest"), DIGEST_PATTERN, issues);
  collectCountRecordIssues(value.operations, joinPath(path, "operations"), canonicalLocalEventOperations, issues);
  collectCountRecordIssues(value.schemaKinds, joinPath(path, "schemaKinds"), canonicalSharedSchemaKinds, issues);

  if (!Array.isArray(value.events)) {
    issues.push({ path: joinPath(path, "events"), message: "events must be an array" });
  } else {
    value.events.forEach((event, index) =>
      collectCanonicalEventIssues(event, `${joinPath(path, "events")}.${index}`, issues)
    );
  }
}

function collectCanonicalEventIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  const result = validateCanonicalLocalEvent(value);
  if (!result.ok) {
    issues.push(...result.issues.map((issue) => ({
      path: issue.path === "$" ? path : `${path}${issue.path.replace(/^\$/, "")}`,
      message: issue.message,
    })));
  }
}

function collectOperationSchemaKindSummaryIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "operationSchemaKinds must be an array" });
    return;
  }

  value.forEach((entry, index) => {
    const entryPath = `${path}.${index}`;
    if (!isRecord(entry)) {
      issues.push({ path: entryPath, message: "operationSchemaKinds entry must be an object" });
      return;
    }
    requireAllowedValue(
      entry.operation,
      joinPath(entryPath, "operation"),
      canonicalLocalEventOperations,
      issues,
    );
    requireAllowedValue(
      entry.schemaKind,
      joinPath(entryPath, "schemaKind"),
      canonicalSharedSchemaKinds,
      issues,
    );
    requireNonNegativeInteger(entry, "count", joinPath(entryPath, "count"), issues);
  });
}

function collectCountRecordIssues<TValue extends string>(
  value: unknown,
  path: string,
  keys: readonly TValue[],
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: `${lastPathPart(path)} must be an object` });
    return;
  }

  for (const key of keys) {
    requireNonNegativeInteger(value, key, joinPath(path, key), issues);
  }
}

function collectStringArrayIssues(
  value: unknown,
  path: string,
  pattern: RegExp | undefined,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: `${lastPathPart(path)} must be an array` });
    return;
  }

  value.forEach((entry, index) => {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      issues.push({ path: `${path}.${index}`, message: "value must be a non-empty string" });
      return;
    }
    if (pattern !== undefined && !pattern.test(entry)) {
      issues.push({ path: `${path}.${index}`, message: "value has an invalid format" });
    }
  });
}

function collectOptionalAllowedValuesIssues<TValue extends string>(
  value: unknown,
  path: string,
  allowed: readonly TValue[],
  issues: ValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    issues.push({ path, message: `${path} must be an array` });
    return;
  }

  value.forEach((entry, index) =>
    requireAllowedValue(entry, `${path}.${index}`, allowed, issues)
  );
}

function requireAllowedValue<TValue extends string>(
  value: unknown,
  path: string,
  allowed: readonly TValue[],
  issues: ValidationIssue[],
): void {
  if (typeof value !== "string" || !allowed.includes(value as TValue)) {
    issues.push({ path, message: `value must be one of ${allowed.join(", ")}` });
  }
}

function requireNonEmptyString(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): void {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push({ path, message: `${key} must be a non-empty string` });
  }
}

function requireOptionalString(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): void {
  const value = record[key];
  if (value !== undefined && typeof value !== "string") {
    issues.push({ path, message: `${key} must be a string when provided` });
  }
}

function requirePattern(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  pattern: RegExp,
  issues: ValidationIssue[],
): void {
  const value = record[key];
  if (typeof value !== "string" || !pattern.test(value)) {
    issues.push({ path, message: `${key} has an invalid format` });
  }
}

function requireOptionalPattern(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  pattern: RegExp,
  issues: ValidationIssue[],
): void {
  const value = record[key];
  if (value !== undefined && (typeof value !== "string" || !pattern.test(value))) {
    issues.push({ path, message: `${key} has an invalid format when provided` });
  }
}

function requireNullableDigest(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): void {
  const value = record[key];
  if (value !== null && (typeof value !== "string" || !DIGEST_PATTERN.test(value))) {
    issues.push({ path, message: `${key} must be a digest or null` });
  }
}

function requirePositiveInteger(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): void {
  const value = record[key];
  if (!Number.isInteger(value) || (value as number) <= 0) {
    issues.push({ path, message: `${key} must be a positive integer` });
  }
}

function requireOptionalPositiveInteger(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): void {
  const value = record[key];
  if (value !== undefined && (!Number.isInteger(value) || (value as number) <= 0)) {
    issues.push({ path, message: `${key} must be a positive integer when provided` });
  }
}

function requireNonNegativeInteger(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): void {
  const value = record[key];
  if (!Number.isInteger(value) || (value as number) < 0) {
    issues.push({ path, message: `${key} must be a non-negative integer` });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function joinPath(parent: string, child: string): string {
  return parent.length === 0 ? child : `${parent}.${child}`;
}

function lastPathPart(path: string): string {
  return path.split(".").at(-1) ?? path;
}

function hasHeader(headers: Readonly<Record<string, string>>, name: string): boolean {
  const normalized = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === normalized);
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
