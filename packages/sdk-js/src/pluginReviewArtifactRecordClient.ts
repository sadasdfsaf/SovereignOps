import {
  ApiNetworkError,
  ApiRequestValidationError,
  ApiResponseValidationError,
  type FetchLike,
  type FetchRequestInit,
  type FetchResponseLike,
  type JsonObject,
  type JsonValue,
  parseJsonApiResponse,
  type SovereignOpsClientOptions,
  type ValidationIssue,
} from "./client.ts";
import type {
  PluginReviewArtifact,
  PluginReviewArtifactDecision,
  PluginReviewArtifactPreviewRequest,
  PluginReviewArtifactPreviewResponse,
} from "./pluginReviewArtifactClient.ts";

export type PluginReviewArtifactRecordClientOptions = SovereignOpsClientOptions;

export type PluginReviewArtifactRecordSchemaVersion = "plugin-review-artifact-record/v1";

export interface PluginReviewArtifactRecordSummary {
  readonly localOnly: true;
  readonly redacted?: true;
  readonly recordId: string;
  readonly reviewId?: string;
  readonly pluginId?: string;
  readonly pluginName?: string;
  readonly pluginVersion?: string;
  readonly decision?: PluginReviewArtifactDecision;
  readonly label?: string;
  readonly metadata?: JsonObject;
  readonly createdAt: string;
  readonly updatedAt?: string;
  readonly fingerprint?: string;
  readonly baselineFingerprint?: string;
}

export interface PluginReviewArtifactRecord extends PluginReviewArtifactRecordSummary {
  readonly kind: "plugin-review-artifact.record";
  readonly schemaVersion: PluginReviewArtifactRecordSchemaVersion;
  readonly artifact?: PluginReviewArtifact;
  readonly preview?: PluginReviewArtifactPreviewResponse;
  readonly baseline?: PluginReviewArtifact | PluginReviewArtifactPreviewResponse;
  readonly [key: string]: unknown;
}

export interface PluginReviewArtifactRecordCreateRequestEnvelope {
  readonly recordId?: string;
  readonly id?: string;
  readonly label?: string;
  readonly metadata?: JsonObject;
  readonly payload?: JsonValue;
  readonly artifact?: PluginReviewArtifact | JsonValue;
  readonly preview?: PluginReviewArtifactPreviewResponse | JsonValue;
  readonly baseline?: PluginReviewArtifact | PluginReviewArtifactPreviewResponse | JsonValue;
  readonly candidate?: JsonValue;
  readonly record?: JsonValue;
}

export type PluginReviewArtifactRecordCreateRequest<TValue extends JsonValue = JsonValue> =
  | PluginReviewArtifactRecord
  | PluginReviewArtifact
  | PluginReviewArtifactPreviewRequest<TValue>
  | PluginReviewArtifactPreviewResponse
  | (JsonObject & PluginReviewArtifactRecordCreateRequestEnvelope);

export type PluginReviewArtifactRecordCreateResponse =
  | PluginReviewArtifactRecord
  | PluginReviewArtifactRecordResponseEnvelope;

export interface PluginReviewArtifactRecordListRequest {
  readonly workspaceId?: string;
  readonly reviewId?: string;
  readonly pluginId?: string;
  readonly pluginVersion?: string;
  readonly decision?: PluginReviewArtifactDecision;
  readonly filters?: JsonObject;
  readonly recordIds?: readonly string[];
  readonly reviewIds?: readonly string[];
  readonly fingerprints?: readonly string[];
  readonly labels?: readonly string[];
  readonly createdAfter?: string;
  readonly createdBefore?: string;
  readonly offset?: number;
  readonly limit?: number;
  readonly cursor?: string;
}

export type PluginReviewArtifactRecordListQuery = PluginReviewArtifactRecordListRequest;

export interface PluginReviewArtifactRecordListResponse {
  readonly localOnly?: true;
  readonly records: readonly unknown[];
  readonly summaries?: readonly PluginReviewArtifactRecordSummary[];
  readonly nextCursor?: string;
  readonly [key: string]: unknown;
}

export interface PluginReviewArtifactRecordGetRequest {
  readonly recordId: string;
}

export type PluginReviewArtifactRecordGetResponse = PluginReviewArtifactRecordCreateResponse;

export interface PluginReviewArtifactRecordCompareRequest {
  readonly recordId?: string;
  readonly leftRecordId?: string;
  readonly rightRecordId?: string;
  readonly payload?: JsonValue;
  readonly preview?: JsonValue;
  readonly artifact?: JsonValue;
  readonly baseline?: JsonValue;
  readonly candidate?: JsonValue;
  readonly leftRecord?: JsonValue;
  readonly rightRecord?: JsonValue;
}

export interface PluginReviewArtifactRecordCompareSummary {
  readonly equal?: boolean;
  readonly equivalent?: boolean;
  readonly addedArtifactCount?: number;
  readonly removedArtifactCount?: number;
  readonly changedArtifactCount?: number;
  readonly unchangedArtifactCount?: number;
  readonly [key: string]: unknown;
}

export interface PluginReviewArtifactRecordCompareResponse {
  readonly localOnly: true;
  readonly summary?: PluginReviewArtifactRecordCompareSummary;
  readonly [key: string]: unknown;
}

export interface PluginReviewArtifactRecordResponseEnvelope {
  readonly localOnly?: true;
  readonly record?: unknown;
  readonly summary?: PluginReviewArtifactRecordSummary;
  readonly [key: string]: unknown;
}

type Validator<T> = (value: unknown) => T;

const RECORDS_ENDPOINT = "plugins/review-artifacts/records";
const RECORD_SCHEMA_VERSION: PluginReviewArtifactRecordSchemaVersion =
  "plugin-review-artifact-record/v1";
const REVIEW_ARTIFACT_SCHEMA_VERSION = "plugin-review-artifact/v1";
const DECISIONS = ["approved", "approval_required", "denied"] as const;
const RECORD_KEYS = [
  "kind",
  "schemaVersion",
  "localOnly",
  "redacted",
  "recordId",
  "reviewId",
  "pluginId",
  "pluginName",
  "pluginVersion",
  "decision",
  "label",
  "metadata",
  "createdAt",
  "updatedAt",
  "fingerprint",
  "baselineFingerprint",
  "artifact",
  "preview",
  "baseline",
] as const;
const LIST_QUERY_KEYS = [
  "workspaceId",
  "reviewId",
  "pluginId",
  "pluginVersion",
  "decision",
  "filters",
  "recordIds",
  "reviewIds",
  "fingerprints",
  "labels",
  "createdAfter",
  "createdBefore",
  "offset",
  "limit",
  "cursor",
] as const;
const COMPARE_REQUEST_KEYS = [
  "recordId",
  "leftRecordId",
  "rightRecordId",
  "payload",
  "preview",
  "artifact",
  "baseline",
  "candidate",
  "leftRecord",
  "rightRecord",
] as const;
const FINGERPRINT_PATTERN = /^(?:[a-f0-9]{32}|[a-f0-9]{64}|sha256:[a-f0-9]{64})$/;

export class PluginReviewArtifactRecordClient {
  readonly #baseUrl: string;
  readonly #fetch: FetchLike;
  readonly #apiKey?: string;
  readonly #headers: Readonly<Record<string, string>>;

  constructor(options: PluginReviewArtifactRecordClientOptions) {
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

  async create<TValue extends JsonValue>(
    record: PluginReviewArtifactRecordCreateRequest<TValue>,
  ): Promise<PluginReviewArtifactRecordCreateResponse> {
    validatePluginReviewArtifactRecordCreateRequest(record);
    return this.#request(
      RECORDS_ENDPOINT,
      {
        method: "POST",
        body: JSON.stringify(deepJsonClone(record)),
      },
      parsePluginReviewArtifactRecordOperationResponse,
    );
  }

  async createRecord<TValue extends JsonValue>(
    record: PluginReviewArtifactRecordCreateRequest<TValue>,
  ): Promise<PluginReviewArtifactRecordCreateResponse> {
    return this.create(record);
  }

  async list(
    query: PluginReviewArtifactRecordListRequest = {},
  ): Promise<PluginReviewArtifactRecordListResponse> {
    validatePluginReviewArtifactRecordListRequest(query);
    if (shouldSendListBody(query)) {
      return this.#request(
        RECORDS_ENDPOINT,
        {
          method: "GET",
          body: JSON.stringify(deepJsonClone(query)),
        },
        parsePluginReviewArtifactRecordListResponse,
      );
    }

    const url = this.#url(RECORDS_ENDPOINT, query);
    return this.#requestUrl(url, { method: "GET" }, parsePluginReviewArtifactRecordListResponse);
  }

  async listRecords(
    query: PluginReviewArtifactRecordListRequest = {},
  ): Promise<PluginReviewArtifactRecordListResponse> {
    return this.list(query);
  }

  async get(
    input: string | PluginReviewArtifactRecordGetRequest,
  ): Promise<PluginReviewArtifactRecordGetResponse> {
    const recordId = normalizePluginReviewArtifactRecordGetRequest(input);
    validateRecordIdPathInput(recordId, "recordId");
    return this.#request(
      `${RECORDS_ENDPOINT}/${encodePathPart(recordId)}`,
      { method: "GET" },
      parsePluginReviewArtifactRecordOperationResponse,
    );
  }

  async getRecord(
    input: string | PluginReviewArtifactRecordGetRequest,
  ): Promise<PluginReviewArtifactRecordGetResponse> {
    return this.get(input);
  }

  async compare(
    input: PluginReviewArtifactRecordCompareRequest | string,
    payload?: JsonValue,
  ): Promise<PluginReviewArtifactRecordCompareResponse> {
    const request = normalizePluginReviewArtifactRecordCompareRequest(input, payload);
    validatePluginReviewArtifactRecordCompareRequest(request);
    const { recordId, ...body } = request;
    const path = recordId === undefined
      ? `${RECORDS_ENDPOINT}/compare`
      : `${RECORDS_ENDPOINT}/${encodePathPart(recordId)}/compare`;

    return this.#request(
      path,
      {
        method: "POST",
        body: JSON.stringify(deepJsonClone(body)),
      },
      parsePluginReviewArtifactRecordCompareResponse,
    );
  }

  async compareRecords(
    input: PluginReviewArtifactRecordCompareRequest | string,
    payload?: JsonValue,
  ): Promise<PluginReviewArtifactRecordCompareResponse> {
    return this.compare(input, payload);
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

export function createPluginReviewArtifactRecordClient(
  options: PluginReviewArtifactRecordClientOptions,
): PluginReviewArtifactRecordClient {
  return new PluginReviewArtifactRecordClient(options);
}

function shouldSendListBody(query: PluginReviewArtifactRecordListRequest): boolean {
  return (
    query.filters !== undefined ||
    query.recordIds !== undefined ||
    query.reviewIds !== undefined ||
    query.fingerprints !== undefined ||
    query.labels !== undefined ||
    query.createdAfter !== undefined ||
    query.createdBefore !== undefined ||
    query.offset !== undefined
  );
}

function normalizePluginReviewArtifactRecordGetRequest(
  input: string | PluginReviewArtifactRecordGetRequest,
): string {
  if (typeof input === "string") {
    return input;
  }

  if (!isRecord(input)) {
    throw new ApiRequestValidationError("plugin review artifact record get request is invalid", [
      { path: "recordId", message: "record id must be a non-empty string" },
    ]);
  }

  return input.recordId;
}

function normalizePluginReviewArtifactRecordCompareRequest(
  input: PluginReviewArtifactRecordCompareRequest | string,
  payload: JsonValue | undefined,
): PluginReviewArtifactRecordCompareRequest {
  if (typeof input === "string") {
    return payload === undefined
      ? { recordId: input }
      : { recordId: input, payload };
  }

  return input;
}

function parsePluginReviewArtifactRecordOperationResponse(
  value: unknown,
): PluginReviewArtifactRecordCreateResponse {
  const issues: ValidationIssue[] = [];

  if (!isRecord(value)) {
    throw new ApiResponseValidationError([
      { path: "", message: "response must be an object" },
    ], value);
  }

  collectResponseLocalOnlyIssues(value, "", issues);
  collectJsonIssues(value, "", issues);
  throwResponseIssues(issues, value);

  return deepFreezeClone(value) as PluginReviewArtifactRecordCreateResponse;
}

function parsePluginReviewArtifactRecordListResponse(
  value: unknown,
): PluginReviewArtifactRecordListResponse {
  const issues: ValidationIssue[] = [];

  if (Array.isArray(value)) {
    value.forEach((record, index) => {
      collectJsonIssues(record, `records.${index}`, issues);
      collectLocalOnlyValueIssues(record, `records.${index}`, issues);
    });
    throwResponseIssues(issues, value);
    return deepFreezeClone({ records: value }) as PluginReviewArtifactRecordListResponse;
  }

  if (!isRecord(value)) {
    throw new ApiResponseValidationError([
      { path: "", message: "response must be an object" },
    ], value);
  }

  collectResponseLocalOnlyIssues(value, "", issues);
  if (!Array.isArray(value.records)) {
    issues.push({ path: "records", message: "records must be an array" });
  } else {
    value.records.forEach((record, index) => {
      collectJsonIssues(record, `records.${index}`, issues);
    });
  }
  if (value.summaries !== undefined) {
    if (!Array.isArray(value.summaries)) {
      issues.push({ path: "summaries", message: "summaries must be an array" });
    } else {
      value.summaries.forEach((summary, index) => {
        collectPluginReviewArtifactRecordSummaryIssues(summary, `summaries.${index}`, issues);
      });
    }
  }
  if (value.nextCursor !== undefined) {
    requireNonEmptyString(value, "nextCursor", "nextCursor", issues);
  }

  throwResponseIssues(issues, value);

  return deepFreezeClone(value) as PluginReviewArtifactRecordListResponse;
}

function parsePluginReviewArtifactRecordCompareResponse(
  value: unknown,
): PluginReviewArtifactRecordCompareResponse {
  const issues: ValidationIssue[] = [];

  if (!isRecord(value)) {
    throw new ApiResponseValidationError([
      { path: "", message: "response must be an object" },
    ], value);
  }

  collectResponseLocalOnlyIssues(value, "", issues);
  collectJsonIssues(value, "", issues);

  throwResponseIssues(issues, value);

  return deepFreezeClone(value) as PluginReviewArtifactRecordCompareResponse;
}

function validatePluginReviewArtifactRecordCreateRequest(
  value: unknown,
): void {
  const issues: ValidationIssue[] = [];

  if (!isRecord(value)) {
    throw new ApiRequestValidationError("plugin review artifact record create request is invalid", [
      { path: "", message: "request must be an object" },
    ]);
  }

  if (value.schemaVersion === RECORD_SCHEMA_VERSION) {
    collectPluginReviewArtifactRecordIssues(value, "", issues);
  } else if (value.schemaVersion === REVIEW_ARTIFACT_SCHEMA_VERSION) {
    collectPluginReviewArtifactValueIssues(value, "", issues);
  } else {
    collectJsonIssues(value, "", issues);
    collectLocalOnlyValueIssues(value, "", issues);
  }

  if (issues.length > 0) {
    throw new ApiRequestValidationError(
      "plugin review artifact record create request is invalid",
      issues,
    );
  }
}

function validatePluginReviewArtifactRecordListRequest(
  query: PluginReviewArtifactRecordListRequest,
): void {
  const issues: ValidationIssue[] = [];

  if (!isRecord(query)) {
    throw new ApiRequestValidationError("plugin review artifact record query is invalid", [
      { path: "query", message: "query must be an object" },
    ]);
  }

  collectAllowedKeys(query, "query", LIST_QUERY_KEYS, issues);
  requireOptionalNonEmptyString(query, "workspaceId", "query.workspaceId", issues);
  requireOptionalNonEmptyString(query, "reviewId", "query.reviewId", issues);
  requireOptionalNonEmptyString(query, "pluginId", "query.pluginId", issues);
  requireOptionalNonEmptyString(query, "pluginVersion", "query.pluginVersion", issues);
  requireOptionalOneOf(query, "decision", "query.decision", DECISIONS, issues);
  if (query.limit !== undefined) {
    requireNonNegativeInteger(query, "limit", "query.limit", issues);
  }
  if (query.offset !== undefined) {
    requireNonNegativeInteger(query, "offset", "query.offset", issues);
  }
  if (query.filters !== undefined) {
    collectJsonIssues(query.filters, "query.filters", issues);
  }
  collectOptionalStringArrayIssues(query.recordIds, "query.recordIds", issues);
  collectOptionalStringArrayIssues(query.reviewIds, "query.reviewIds", issues);
  collectOptionalStringArrayIssues(query.fingerprints, "query.fingerprints", issues);
  collectOptionalStringArrayIssues(query.labels, "query.labels", issues);
  requireOptionalString(query, "createdAfter", "query.createdAfter", issues);
  requireOptionalString(query, "createdBefore", "query.createdBefore", issues);
  requireOptionalString(query, "cursor", "query.cursor", issues);

  if (issues.length > 0) {
    throw new ApiRequestValidationError("plugin review artifact record query is invalid", issues);
  }
}

function validatePluginReviewArtifactRecordCompareRequest(
  input: PluginReviewArtifactRecordCompareRequest,
): void {
  const issues: ValidationIssue[] = [];

  if (!isRecord(input)) {
    throw new ApiRequestValidationError("plugin review artifact record compare request is invalid", [
      { path: "", message: "request must be an object" },
    ]);
  }

  collectAllowedKeys(input, "", COMPARE_REQUEST_KEYS, issues);
  collectJsonIssues(input, "", issues);
  requireOptionalNonEmptyString(input, "recordId", "recordId", issues);
  requireOptionalNonEmptyString(input, "leftRecordId", "leftRecordId", issues);
  requireOptionalNonEmptyString(input, "rightRecordId", "rightRecordId", issues);
  if (
    input.recordId === undefined &&
    input.leftRecordId === undefined &&
    input.leftRecord === undefined
  ) {
    issues.push({
      path: "",
      message: "compare request must include a recordId or left record",
    });
  }

  if (issues.length > 0) {
    throw new ApiRequestValidationError(
      "plugin review artifact record compare request is invalid",
      issues,
    );
  }
}

function validateRecordIdPathInput(value: unknown, path: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiRequestValidationError("plugin review artifact record id is invalid", [
      { path, message: "record id must be a non-empty string" },
    ]);
  }
}

function collectPluginReviewArtifactRecordIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "record must be an object" });
    return;
  }

  collectAllowedKeys(value, path, RECORD_KEYS, issues);
  requireLiteralString(value, "kind", joinPath(path, "kind"), "plugin-review-artifact.record", issues);
  requireLiteralString(value, "schemaVersion", joinPath(path, "schemaVersion"), RECORD_SCHEMA_VERSION, issues);
  collectPluginReviewArtifactRecordSummaryIssues(value, path, issues);
  if (value.artifact !== undefined) {
    collectPluginReviewArtifactValueIssues(value.artifact, joinPath(path, "artifact"), issues);
  }
  if (value.preview !== undefined) {
    collectPluginReviewArtifactPreviewResponseIssues(value.preview, joinPath(path, "preview"), issues);
  }
  if (value.baseline !== undefined) {
    if (isRecord(value.baseline) && value.baseline.kind === "plugin-review-artifact.preview") {
      collectPluginReviewArtifactPreviewResponseIssues(value.baseline, joinPath(path, "baseline"), issues);
    } else {
      collectPluginReviewArtifactValueIssues(value.baseline, joinPath(path, "baseline"), issues);
    }
  }
}

function collectPluginReviewArtifactRecordSummaryIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "summary must be an object" });
    return;
  }

  requireTrue(value, "localOnly", joinPath(path, "localOnly"), issues);
  requireOptionalTrue(value, "redacted", joinPath(path, "redacted"), issues);
  requireNonEmptyString(value, "recordId", joinPath(path, "recordId"), issues);
  requireOptionalNonEmptyString(value, "reviewId", joinPath(path, "reviewId"), issues);
  requireOptionalNonEmptyString(value, "pluginId", joinPath(path, "pluginId"), issues);
  requireOptionalNonEmptyString(value, "pluginName", joinPath(path, "pluginName"), issues);
  requireOptionalNonEmptyString(value, "pluginVersion", joinPath(path, "pluginVersion"), issues);
  requireOptionalOneOf(value, "decision", joinPath(path, "decision"), DECISIONS, issues);
  requireOptionalNonEmptyString(value, "label", joinPath(path, "label"), issues);
  requireNonEmptyString(value, "createdAt", joinPath(path, "createdAt"), issues);
  requireOptionalString(value, "updatedAt", joinPath(path, "updatedAt"), issues);
  requireOptionalFingerprint(value, "fingerprint", joinPath(path, "fingerprint"), issues);
  requireOptionalFingerprint(value, "baselineFingerprint", joinPath(path, "baselineFingerprint"), issues);
  if (value.metadata !== undefined) {
    if (!isRecord(value.metadata)) {
      issues.push({ path: joinPath(path, "metadata"), message: "metadata must be an object" });
    } else {
      collectJsonIssues(value.metadata, joinPath(path, "metadata"), issues);
    }
  }
}

function collectPluginReviewArtifactPreviewResponseIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "preview must be an object" });
    return;
  }

  requireLiteralString(value, "kind", joinPath(path, "kind"), "plugin-review-artifact.preview", issues);
  requireTrue(value, "localOnly", joinPath(path, "localOnly"), issues);
  requireTrue(value, "redacted", joinPath(path, "redacted"), issues);
  requireLiteralString(
    value,
    "schemaVersion",
    joinPath(path, "schemaVersion"),
    REVIEW_ARTIFACT_SCHEMA_VERSION,
    issues,
  );
  requireNonEmptyString(value, "reviewId", joinPath(path, "reviewId"), issues);
  requireOptionalFingerprint(value, "fingerprint", joinPath(path, "fingerprint"), issues);
  requireOneOf(value, "decision", joinPath(path, "decision"), DECISIONS, issues);
  collectPluginReviewArtifactValueIssues(value.artifact, joinPath(path, "artifact"), issues);
}

function collectPluginReviewArtifactValueIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "artifact must be an object" });
    return;
  }

  requireLiteralString(value, "schemaVersion", joinPath(path, "schemaVersion"), REVIEW_ARTIFACT_SCHEMA_VERSION, issues);
  requireNonEmptyString(value, "reviewId", joinPath(path, "reviewId"), issues);
  requireOptionalFingerprint(value, "fingerprint", joinPath(path, "fingerprint"), issues);
  requireOneOf(value, "decision", joinPath(path, "decision"), DECISIONS, issues);
  collectJsonIssues(value, path, issues);
}

function collectResponseLocalOnlyIssues(
  value: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value.localOnly !== undefined) {
    requireTrue(value, "localOnly", joinPath(path, "localOnly"), issues);
  } else if (!hasTrueLocalOnly(value)) {
    issues.push({ path: joinPath(path, "localOnly"), message: "localOnly must be true" });
  }
  for (const [key, nested] of Object.entries(value)) {
    if (key !== "localOnly") {
      collectLocalOnlyValueIssues(nested, joinPath(path, key), issues);
    }
  }
}

function collectLocalOnlyValueIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  seen: WeakSet<object> = new WeakSet<object>(),
): void {
  if (value === null || typeof value !== "object") {
    return;
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectLocalOnlyValueIssues(item, `${path}.${index}`, issues, seen);
    });
    seen.delete(value);
    return;
  }

  if (isRecord(value)) {
    if (value.localOnly !== undefined && value.localOnly !== true) {
      issues.push({
        path: joinPath(path, "localOnly"),
        message: "localOnly must be true",
      });
    }
    for (const [key, nested] of Object.entries(value)) {
      collectLocalOnlyValueIssues(nested, joinPath(path, key), issues, seen);
    }
  }

  seen.delete(value);
}

function hasTrueLocalOnly(
  value: unknown,
  seen: WeakSet<object> = new WeakSet<object>(),
): boolean {
  if (value === null || typeof value !== "object") {
    return false;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    const found = value.some((item) => hasTrueLocalOnly(item, seen));
    seen.delete(value);
    return found;
  }

  if (isRecord(value)) {
    if (value.localOnly === true) {
      seen.delete(value);
      return true;
    }
    const found = Object.values(value).some((nested) => hasTrueLocalOnly(nested, seen));
    seen.delete(value);
    return found;
  }

  seen.delete(value);
  return false;
}

function collectJsonIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  seen: WeakSet<object> = new WeakSet<object>(),
): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      issues.push({ path, message: "number must be finite" });
    }
    return;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      issues.push({ path, message: "value must not contain circular references" });
      return;
    }
    seen.add(value);
    value.forEach((item, index) => collectJsonIssues(item, `${path}.${index}`, issues, seen));
    seen.delete(value);
    return;
  }

  if (isRecord(value)) {
    if (seen.has(value)) {
      issues.push({ path, message: "value must not contain circular references" });
      return;
    }
    seen.add(value);
    for (const [key, nested] of Object.entries(value)) {
      collectJsonIssues(nested, joinPath(path, key), issues, seen);
    }
    seen.delete(value);
    return;
  }

  issues.push({ path, message: "value must be JSON-compatible" });
}

function collectAllowedKeys(
  value: Record<string, unknown>,
  path: string,
  allowed: readonly string[],
  issues: ValidationIssue[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      issues.push({
        path: joinPath(path, key),
        message: `unexpected field ${key}`,
      });
    }
  }
}

function collectOptionalStringArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    issues.push({ path, message: "value must be an array of strings" });
    return;
  }

  value.forEach((item, index) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      issues.push({ path: `${path}.${index}`, message: "value must be a non-empty string" });
    }
  });
}

function requireLiteralString(
  value: Record<string, unknown>,
  field: string,
  path: string,
  expected: string,
  issues: ValidationIssue[],
): void {
  if (value[field] !== expected) {
    issues.push({ path, message: `${field} must be ${expected}` });
  }
}

function requireOneOf<T extends string>(
  value: Record<string, unknown>,
  field: string,
  path: string,
  allowed: readonly T[],
  issues: ValidationIssue[],
): void {
  if (!isOneOf(value[field], allowed)) {
    issues.push({ path, message: `${field} must be one of ${allowed.join(", ")}` });
  }
}

function requireOptionalOneOf<T extends string>(
  value: Record<string, unknown>,
  field: string,
  path: string,
  allowed: readonly T[],
  issues: ValidationIssue[],
): void {
  if (value[field] !== undefined) {
    requireOneOf(value, field, path, allowed, issues);
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

function requireOptionalTrue(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value[field] !== undefined) {
    requireTrue(value, field, path, issues);
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

function requireOptionalNonEmptyString(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value[field] !== undefined) {
    requireNonEmptyString(value, field, path, issues);
  }
}

function requireOptionalString(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value[field] !== undefined && typeof value[field] !== "string") {
    issues.push({ path, message: `${field} must be a string` });
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

function requireOptionalFingerprint(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value[field] !== undefined) {
    requireFingerprint(value, field, path, issues);
  }
}

function requireFingerprint(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (typeof value[field] !== "string" || !FINGERPRINT_PATTERN.test(value[field] as string)) {
    issues.push({ path, message: `${field} must be a lowercase fingerprint` });
  }
}

function throwResponseIssues(issues: readonly ValidationIssue[], body: unknown): void {
  if (issues.length > 0) {
    throw new ApiResponseValidationError(issues, body);
  }
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && allowed.includes(value as T);
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

function deepJsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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
