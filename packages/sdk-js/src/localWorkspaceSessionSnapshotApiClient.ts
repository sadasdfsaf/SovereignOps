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
  LocalWorkspaceSessionAuditPreviewRequest,
  LocalWorkspaceSessionAuditPreviewResponse,
} from "./localWorkspaceSessionApiClient.ts";
import { WORKSPACE_SESSION_API_SCHEMA_VERSION } from "./localWorkspaceSessionApiClient.ts";

export type LocalWorkspaceSessionSnapshotApiClientOptions = SovereignOpsClientOptions;

export const WORKSPACE_SESSION_SNAPSHOT_API_SCHEMA_VERSION =
  "workspace-session-store/v1";

export interface LocalWorkspaceSessionSnapshotPreviewSummary {
  readonly kind: "workspace-session.snapshot-summary";
  readonly localOnly: true;
  readonly redacted: true;
  readonly workspaceId: string;
  readonly deviceId: string;
  readonly sessionId: string;
  readonly operations: readonly string[];
  readonly eventCount: number;
  readonly eventIds: readonly string[];
  readonly auditRecordCount: number;
  readonly auditIds: readonly string[];
  readonly auditActions: readonly string[];
}

export interface LocalWorkspaceSessionSnapshotPreviewResponse {
  readonly kind: "workspace-session.snapshot-preview";
  readonly schemaVersion: typeof WORKSPACE_SESSION_SNAPSHOT_API_SCHEMA_VERSION;
  readonly apiSchemaVersion: typeof WORKSPACE_SESSION_API_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly durableWrites: false;
  readonly redacted: true;
  readonly fingerprint: string;
  readonly summary: LocalWorkspaceSessionSnapshotPreviewSummary;
  readonly auditPreview: LocalWorkspaceSessionAuditPreviewResponse;
}

export interface LocalWorkspaceSessionSnapshotRecord {
  readonly kind: "workspace-session.snapshot-record";
  readonly schemaVersion: typeof WORKSPACE_SESSION_SNAPSHOT_API_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly durableWrites: false;
  readonly redacted: true;
  readonly snapshotId: string;
  readonly label?: string;
  readonly metadata?: JsonObject;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly fingerprint: string;
  readonly snapshotFingerprint: string;
  readonly snapshot: LocalWorkspaceSessionSnapshotPreviewResponse;
}

export interface LocalWorkspaceSessionSnapshotRecordSummary {
  readonly snapshotId: string;
  readonly label?: string;
  readonly metadata?: JsonObject;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly fingerprint: string;
  readonly snapshotFingerprint: string;
  readonly workspaceId: string;
  readonly deviceId: string;
  readonly sessionId: string;
  readonly operations: readonly string[];
  readonly eventCount: number;
  readonly auditRecordCount: number;
}

export interface LocalWorkspaceSessionSnapshotCreateResponse {
  readonly kind: "workspace-session.snapshot-record.created";
  readonly schemaVersion: typeof WORKSPACE_SESSION_SNAPSHOT_API_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly durableWrites: false;
  readonly record: LocalWorkspaceSessionSnapshotRecord;
}

export interface LocalWorkspaceSessionSnapshotListFilters {
  readonly snapshotIds?: readonly string[];
  readonly fingerprints?: readonly string[];
  readonly workspaceIds?: readonly string[];
  readonly sessionIds?: readonly string[];
  readonly labels?: readonly string[];
  readonly createdAfter?: string;
  readonly createdBefore?: string;
}

export interface LocalWorkspaceSessionSnapshotListRequest
  extends LocalWorkspaceSessionSnapshotListFilters {
  readonly filters?: LocalWorkspaceSessionSnapshotListFilters;
  readonly offset?: number;
  readonly limit?: number;
}

export interface LocalWorkspaceSessionSnapshotListResponse {
  readonly kind: "workspace-session.snapshot-record.list";
  readonly schemaVersion: typeof WORKSPACE_SESSION_SNAPSHOT_API_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly durableWrites: false;
  readonly filters: LocalWorkspaceSessionSnapshotListFilters;
  readonly pagination: {
    readonly offset: number;
    readonly limit: number;
    readonly totalRecordCount: number;
    readonly matchedRecordCount: number;
    readonly returnedRecordCount: number;
    readonly hasMore: boolean;
  };
  readonly records: readonly LocalWorkspaceSessionSnapshotRecordSummary[];
}

export interface LocalWorkspaceSessionSnapshotGetRequest {
  readonly snapshotId: string;
}

export interface LocalWorkspaceSessionSnapshotGetResponse {
  readonly kind: "workspace-session.snapshot-record.read";
  readonly schemaVersion: typeof WORKSPACE_SESSION_SNAPSHOT_API_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly durableWrites: false;
  readonly record: LocalWorkspaceSessionSnapshotRecord;
}

export interface LocalWorkspaceSessionSnapshotPayloadEnvelope {
  readonly payload?: JsonValue | LocalWorkspaceSessionAuditPreviewRequest;
  readonly preview?: JsonValue | LocalWorkspaceSessionSnapshotPreviewResponse;
  readonly baseline?: JsonValue | LocalWorkspaceSessionSnapshotPreviewResponse;
  readonly snapshot?: JsonValue | LocalWorkspaceSessionSnapshotPreviewResponse;
  readonly auditPreview?: JsonValue | LocalWorkspaceSessionAuditPreviewResponse;
}

export type LocalWorkspaceSessionSnapshotPreviewRequest =
  | LocalWorkspaceSessionAuditPreviewRequest
  | LocalWorkspaceSessionAuditPreviewResponse
  | LocalWorkspaceSessionSnapshotPreviewResponse
  | (JsonObject & LocalWorkspaceSessionSnapshotPayloadEnvelope);

export interface LocalWorkspaceSessionSnapshotCreateRequestEnvelope
  extends LocalWorkspaceSessionSnapshotPayloadEnvelope {
  readonly snapshotId?: string;
  readonly id?: string;
  readonly label?: string;
  readonly metadata?: JsonObject;
}

export type LocalWorkspaceSessionSnapshotCreateRequest =
  | LocalWorkspaceSessionSnapshotPreviewRequest
  | (JsonObject & LocalWorkspaceSessionSnapshotCreateRequestEnvelope);

type Validator<T> = (value: unknown) => T;

const SNAPSHOTS_ENDPOINT = "workspace-session/snapshots";
const SNAPSHOT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ID_BODY_PATTERN = "[A-Za-z0-9_-]{1,160}";
const WORKSPACE_ID_PATTERN = new RegExp(`^wsp_${ID_BODY_PATTERN}$`);
const DEVICE_ID_PATTERN = new RegExp(`^dev_${ID_BODY_PATTERN}$`);
const SESSION_ID_PATTERN = new RegExp(`^sess_${ID_BODY_PATTERN}$`);
const EVENT_ID_PATTERN = new RegExp(`^evt_${ID_BODY_PATTERN}$`);
const SHA256_FINGERPRINT_PATTERN = /^sha256:[a-f0-9]{64}$/;
const REDACTED_STORAGE_PATTERN = /^\[redacted:path:[a-z0-9]+\]$/;
const REDACTED_LOCK_TOKEN_PATTERN = /^\[redacted:lockToken:[a-z0-9]+\]$/;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CREATE_WRAPPER_KEYS = Object.freeze([
  "snapshotId",
  "id",
  "label",
  "metadata",
  "payload",
  "preview",
  "baseline",
  "snapshot",
  "auditPreview",
] as const);
const PREVIEW_WRAPPER_KEYS = Object.freeze([
  "payload",
  "preview",
  "baseline",
  "snapshot",
  "auditPreview",
] as const);
const LIST_TOP_LEVEL_KEYS = Object.freeze([
  "filters",
  "snapshotIds",
  "fingerprints",
  "workspaceIds",
  "sessionIds",
  "labels",
  "createdAfter",
  "createdBefore",
  "offset",
  "limit",
] as const);
const LIST_FILTER_KEYS = Object.freeze([
  "snapshotIds",
  "fingerprints",
  "workspaceIds",
  "sessionIds",
  "labels",
  "createdAfter",
  "createdBefore",
] as const);
const AUDIT_PREVIEW_KINDS = Object.freeze([
  "workspace-session.audit-preview",
  "workspace-session.snapshot-preview",
] as const);

export class LocalWorkspaceSessionSnapshotApiClient {
  readonly #baseUrl: string;
  readonly #fetch: FetchLike;
  readonly #apiKey?: string;
  readonly #headers: Readonly<Record<string, string>>;

  constructor(options: LocalWorkspaceSessionSnapshotApiClientOptions) {
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

  async preview(
    request: LocalWorkspaceSessionSnapshotPreviewRequest,
  ): Promise<LocalWorkspaceSessionSnapshotPreviewResponse> {
    const body = normalizePreviewRequest(request);
    return this.#request(
      `${SNAPSHOTS_ENDPOINT}/preview`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      parseLocalWorkspaceSessionSnapshotPreviewResponse,
    );
  }

  async previewSnapshot(
    request: LocalWorkspaceSessionSnapshotPreviewRequest,
  ): Promise<LocalWorkspaceSessionSnapshotPreviewResponse> {
    return this.preview(request);
  }

  async create(
    request: LocalWorkspaceSessionSnapshotCreateRequest,
  ): Promise<LocalWorkspaceSessionSnapshotCreateResponse> {
    const body = normalizeCreateRequest(request);
    return this.#request(
      SNAPSHOTS_ENDPOINT,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      parseLocalWorkspaceSessionSnapshotCreateResponse,
    );
  }

  async createSnapshot(
    request: LocalWorkspaceSessionSnapshotCreateRequest,
  ): Promise<LocalWorkspaceSessionSnapshotCreateResponse> {
    return this.create(request);
  }

  async list(
    request: LocalWorkspaceSessionSnapshotListRequest = {},
  ): Promise<LocalWorkspaceSessionSnapshotListResponse> {
    const body = normalizeListRequest(request);
    return this.#request(
      SNAPSHOTS_ENDPOINT,
      {
        method: "GET",
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
      parseLocalWorkspaceSessionSnapshotListResponse,
    );
  }

  async listSnapshots(
    request: LocalWorkspaceSessionSnapshotListRequest = {},
  ): Promise<LocalWorkspaceSessionSnapshotListResponse> {
    return this.list(request);
  }

  async get(
    input: string | LocalWorkspaceSessionSnapshotGetRequest,
  ): Promise<LocalWorkspaceSessionSnapshotGetResponse> {
    const snapshotId = normalizeGetRequest(input);
    return this.#request(
      `${SNAPSHOTS_ENDPOINT}/${encodePathPart(snapshotId)}`,
      { method: "GET" },
      parseLocalWorkspaceSessionSnapshotGetResponse,
    );
  }

  async getSnapshot(
    input: string | LocalWorkspaceSessionSnapshotGetRequest,
  ): Promise<LocalWorkspaceSessionSnapshotGetResponse> {
    return this.get(input);
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

export function createLocalWorkspaceSessionSnapshotApiClient(
  options: LocalWorkspaceSessionSnapshotApiClientOptions,
): LocalWorkspaceSessionSnapshotApiClient {
  return new LocalWorkspaceSessionSnapshotApiClient(options);
}

function normalizePreviewRequest(
  request: LocalWorkspaceSessionSnapshotPreviewRequest,
): JsonValue {
  const issues: ValidationIssue[] = [];
  if (!isRecord(request)) {
    throw new ApiRequestValidationError(
      "local workspace session snapshot preview request is invalid",
      [{ path: "request", message: "request must be an object" }],
    );
  }

  collectJsonIssues(request, "request", issues);
  collectPayloadWrapperIssues(request, "request", PREVIEW_WRAPPER_KEYS, issues);

  if (issues.length > 0) {
    throw new ApiRequestValidationError(
      "local workspace session snapshot preview request is invalid",
      issues,
    );
  }

  return deepJsonClone(request) as JsonValue;
}

function normalizeCreateRequest(
  request: LocalWorkspaceSessionSnapshotCreateRequest,
): JsonValue {
  const issues: ValidationIssue[] = [];
  if (!isRecord(request)) {
    throw new ApiRequestValidationError(
      "local workspace session snapshot create request is invalid",
      [{ path: "request", message: "request must be an object" }],
    );
  }

  collectJsonIssues(request, "request", issues);
  collectPayloadWrapperIssues(request, "request", CREATE_WRAPPER_KEYS, issues);
  const snapshotId = request.snapshotId ?? request.id;
  if (snapshotId !== undefined) {
    collectSnapshotIdIssues(snapshotId, request.snapshotId === undefined ? "request.id" : "request.snapshotId", issues);
  }
  if (request.label !== undefined && !isNonEmptyString(request.label)) {
    issues.push({ path: "request.label", message: "label must be a non-empty string when provided" });
  }
  if (request.metadata !== undefined && !isRecord(request.metadata)) {
    issues.push({ path: "request.metadata", message: "metadata must be an object when provided" });
  }
  if (
    PREVIEW_WRAPPER_KEYS.every((key) => request[key] === undefined) &&
    Object.keys(request).every((key) => ["snapshotId", "id", "label", "metadata"].includes(key))
  ) {
    issues.push({
      path: "request",
      message: "create request must include a workspace session snapshot payload",
    });
  }

  if (issues.length > 0) {
    throw new ApiRequestValidationError(
      "local workspace session snapshot create request is invalid",
      issues,
    );
  }

  return deepJsonClone(request) as JsonValue;
}

function normalizeListRequest(
  request: LocalWorkspaceSessionSnapshotListRequest,
): JsonValue | undefined {
  const issues: ValidationIssue[] = [];
  if (!isRecord(request)) {
    throw new ApiRequestValidationError("local workspace session snapshot list request is invalid", [
      { path: "request", message: "request must be an object" },
    ]);
  }

  collectAllowedKeys(request, "request", LIST_TOP_LEVEL_KEYS, issues);
  if (request.filters !== undefined && !isRecord(request.filters)) {
    issues.push({ path: "request.filters", message: "filters must be an object when provided" });
  }
  if (request.filters !== undefined) {
    collectAllowedKeys(request.filters, "request.filters", LIST_FILTER_KEYS, issues);
    collectListFiltersIssues(request.filters, "request.filters", issues);
  }
  collectListFiltersIssues(request, "request", issues);
  requireOptionalIntegerInRange(request.offset, "request.offset", 0, Number.MAX_SAFE_INTEGER, issues);
  requireOptionalIntegerInRange(request.limit, "request.limit", 0, 100, issues);

  const filters = isRecord(request.filters) ? request.filters : request;
  if (
    typeof filters.createdAfter === "string" &&
    typeof filters.createdBefore === "string" &&
    isTimestamp(filters.createdAfter) &&
    isTimestamp(filters.createdBefore) &&
    Date.parse(filters.createdAfter) > Date.parse(filters.createdBefore)
  ) {
    issues.push({
      path: request.filters === undefined ? "request.createdAfter" : "request.filters.createdAfter",
      message: "createdAfter must be before or equal to createdBefore",
    });
  }

  if (issues.length > 0) {
    throw new ApiRequestValidationError(
      "local workspace session snapshot list request is invalid",
      issues,
    );
  }

  if (Object.keys(request).length === 0) {
    return undefined;
  }
  return deepJsonClone(request) as JsonValue;
}

function normalizeGetRequest(input: string | LocalWorkspaceSessionSnapshotGetRequest): string {
  const snapshotId = typeof input === "string" ? input : isRecord(input) ? input.snapshotId : undefined;
  const issues: ValidationIssue[] = [];
  collectSnapshotIdIssues(snapshotId, "snapshotId", issues);
  if (issues.length > 0 || snapshotId === undefined) {
    throw new ApiRequestValidationError(
      "local workspace session snapshot id is invalid",
      issues,
    );
  }

  return snapshotId.trim();
}

function parseLocalWorkspaceSessionSnapshotPreviewResponse(
  value: unknown,
): LocalWorkspaceSessionSnapshotPreviewResponse {
  const issues: ValidationIssue[] = [];
  collectSnapshotPreviewIssues(value, "", issues);
  throwResponseIssues(issues, value);

  return deepFreezeClone(value) as LocalWorkspaceSessionSnapshotPreviewResponse;
}

function parseLocalWorkspaceSessionSnapshotCreateResponse(
  value: unknown,
): LocalWorkspaceSessionSnapshotCreateResponse {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw new ApiResponseValidationError([{ path: "", message: "response must be an object" }], value);
  }

  requireLiteral(value, "kind", "kind", "workspace-session.snapshot-record.created", issues);
  requireLiteral(
    value,
    "schemaVersion",
    "schemaVersion",
    WORKSPACE_SESSION_SNAPSHOT_API_SCHEMA_VERSION,
    issues,
  );
  requireTrue(value, "localOnly", "localOnly", issues);
  requireFalse(value, "durableWrites", "durableWrites", issues);
  collectSnapshotRecordIssues(value.record, "record", issues);
  throwResponseIssues(issues, value);

  return deepFreezeClone(value) as LocalWorkspaceSessionSnapshotCreateResponse;
}

function parseLocalWorkspaceSessionSnapshotListResponse(
  value: unknown,
): LocalWorkspaceSessionSnapshotListResponse {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw new ApiResponseValidationError([{ path: "", message: "response must be an object" }], value);
  }

  requireLiteral(value, "kind", "kind", "workspace-session.snapshot-record.list", issues);
  requireLiteral(
    value,
    "schemaVersion",
    "schemaVersion",
    WORKSPACE_SESSION_SNAPSHOT_API_SCHEMA_VERSION,
    issues,
  );
  requireTrue(value, "localOnly", "localOnly", issues);
  requireFalse(value, "durableWrites", "durableWrites", issues);
  collectListFiltersResponseIssues(value.filters, "filters", issues);
  collectPaginationIssues(value.pagination, "pagination", issues);
  if (!Array.isArray(value.records)) {
    issues.push({ path: "records", message: "records must be an array" });
  } else {
    value.records.forEach((record, index) =>
      collectSnapshotRecordSummaryIssues(record, `records.${index}`, issues)
    );
    if (
      isRecord(value.pagination) &&
      Number.isSafeInteger(value.pagination.returnedRecordCount) &&
      value.pagination.returnedRecordCount !== value.records.length
    ) {
      issues.push({
        path: "pagination.returnedRecordCount",
        message: "returnedRecordCount must match records length",
      });
    }
  }
  throwResponseIssues(issues, value);

  return deepFreezeClone(value) as LocalWorkspaceSessionSnapshotListResponse;
}

function parseLocalWorkspaceSessionSnapshotGetResponse(
  value: unknown,
): LocalWorkspaceSessionSnapshotGetResponse {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw new ApiResponseValidationError([{ path: "", message: "response must be an object" }], value);
  }

  requireLiteral(value, "kind", "kind", "workspace-session.snapshot-record.read", issues);
  requireLiteral(
    value,
    "schemaVersion",
    "schemaVersion",
    WORKSPACE_SESSION_SNAPSHOT_API_SCHEMA_VERSION,
    issues,
  );
  requireTrue(value, "localOnly", "localOnly", issues);
  requireFalse(value, "durableWrites", "durableWrites", issues);
  collectSnapshotRecordIssues(value.record, "record", issues);
  throwResponseIssues(issues, value);

  return deepFreezeClone(value) as LocalWorkspaceSessionSnapshotGetResponse;
}

function collectSnapshotPreviewIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: `${path || "response"} must be an object` });
    return;
  }

  requireLiteral(value, "kind", joinPath(path, "kind"), "workspace-session.snapshot-preview", issues);
  requireLiteral(
    value,
    "schemaVersion",
    joinPath(path, "schemaVersion"),
    WORKSPACE_SESSION_SNAPSHOT_API_SCHEMA_VERSION,
    issues,
  );
  requireLiteral(
    value,
    "apiSchemaVersion",
    joinPath(path, "apiSchemaVersion"),
    WORKSPACE_SESSION_API_SCHEMA_VERSION,
    issues,
  );
  requireTrue(value, "localOnly", joinPath(path, "localOnly"), issues);
  requireFalse(value, "durableWrites", joinPath(path, "durableWrites"), issues);
  requireTrue(value, "redacted", joinPath(path, "redacted"), issues);
  requirePattern(value, "fingerprint", joinPath(path, "fingerprint"), SHA256_FINGERPRINT_PATTERN, issues);
  collectSnapshotPreviewSummaryIssues(value.summary, joinPath(path, "summary"), issues);
  collectAuditPreviewIssues(value.auditPreview, joinPath(path, "auditPreview"), issues);
}

function collectSnapshotPreviewSummaryIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "summary must be an object" });
    return;
  }

  requireLiteral(value, "kind", joinPath(path, "kind"), "workspace-session.snapshot-summary", issues);
  requireTrue(value, "localOnly", joinPath(path, "localOnly"), issues);
  requireTrue(value, "redacted", joinPath(path, "redacted"), issues);
  requirePattern(value, "workspaceId", joinPath(path, "workspaceId"), WORKSPACE_ID_PATTERN, issues);
  requirePattern(value, "deviceId", joinPath(path, "deviceId"), DEVICE_ID_PATTERN, issues);
  requirePattern(value, "sessionId", joinPath(path, "sessionId"), SESSION_ID_PATTERN, issues);
  collectStringArrayIssues(value.operations, joinPath(path, "operations"), issues);
  requireNonNegativeInteger(value, "eventCount", joinPath(path, "eventCount"), issues);
  collectStringArrayIssues(value.eventIds, joinPath(path, "eventIds"), issues, EVENT_ID_PATTERN);
  requireNonNegativeInteger(value, "auditRecordCount", joinPath(path, "auditRecordCount"), issues);
  collectStringArrayIssues(value.auditIds, joinPath(path, "auditIds"), issues);
  collectStringArrayIssues(value.auditActions, joinPath(path, "auditActions"), issues);
  if (Array.isArray(value.operations) && Number.isSafeInteger(value.eventCount) && value.operations.length !== value.eventCount) {
    issues.push({ path: joinPath(path, "eventCount"), message: "eventCount must match operations length" });
  }
  if (Array.isArray(value.eventIds) && Number.isSafeInteger(value.eventCount) && value.eventIds.length !== value.eventCount) {
    issues.push({ path: joinPath(path, "eventCount"), message: "eventCount must match eventIds length" });
  }
  if (Array.isArray(value.auditIds) && Number.isSafeInteger(value.auditRecordCount) && value.auditIds.length !== value.auditRecordCount) {
    issues.push({ path: joinPath(path, "auditRecordCount"), message: "auditRecordCount must match auditIds length" });
  }
  if (Array.isArray(value.auditActions) && Number.isSafeInteger(value.auditRecordCount) && value.auditActions.length !== value.auditRecordCount) {
    issues.push({ path: joinPath(path, "auditRecordCount"), message: "auditRecordCount must match auditActions length" });
  }
}

function collectSnapshotRecordIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "record must be an object" });
    return;
  }

  requireLiteral(value, "kind", joinPath(path, "kind"), "workspace-session.snapshot-record", issues);
  requireLiteral(
    value,
    "schemaVersion",
    joinPath(path, "schemaVersion"),
    WORKSPACE_SESSION_SNAPSHOT_API_SCHEMA_VERSION,
    issues,
  );
  requireTrue(value, "localOnly", joinPath(path, "localOnly"), issues);
  requireFalse(value, "durableWrites", joinPath(path, "durableWrites"), issues);
  requireTrue(value, "redacted", joinPath(path, "redacted"), issues);
  requireSnapshotId(value, "snapshotId", joinPath(path, "snapshotId"), issues);
  requireOptionalNonEmptyString(value, "label", joinPath(path, "label"), issues);
  if (value.metadata !== undefined) {
    collectJsonObjectIssues(value.metadata, joinPath(path, "metadata"), issues);
  }
  requireIsoTimestamp(value, "createdAt", joinPath(path, "createdAt"), issues);
  requireIsoTimestamp(value, "updatedAt", joinPath(path, "updatedAt"), issues);
  requirePattern(value, "fingerprint", joinPath(path, "fingerprint"), SHA256_FINGERPRINT_PATTERN, issues);
  requirePattern(
    value,
    "snapshotFingerprint",
    joinPath(path, "snapshotFingerprint"),
    SHA256_FINGERPRINT_PATTERN,
    issues,
  );
  collectSnapshotPreviewIssues(value.snapshot, joinPath(path, "snapshot"), issues);
  if (
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt) &&
    Date.parse(value.updatedAt) < Date.parse(value.createdAt)
  ) {
    issues.push({ path: joinPath(path, "updatedAt"), message: "updatedAt must be after createdAt" });
  }
  if (
    isRecord(value.snapshot) &&
    typeof value.snapshot.fingerprint === "string" &&
    typeof value.snapshotFingerprint === "string" &&
    value.snapshot.fingerprint !== value.snapshotFingerprint
  ) {
    issues.push({
      path: joinPath(path, "snapshotFingerprint"),
      message: "snapshotFingerprint must match snapshot fingerprint",
    });
  }
}

function collectSnapshotRecordSummaryIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "record summary must be an object" });
    return;
  }

  requireSnapshotId(value, "snapshotId", joinPath(path, "snapshotId"), issues);
  requireOptionalNonEmptyString(value, "label", joinPath(path, "label"), issues);
  if (value.metadata !== undefined) {
    collectJsonObjectIssues(value.metadata, joinPath(path, "metadata"), issues);
  }
  requireIsoTimestamp(value, "createdAt", joinPath(path, "createdAt"), issues);
  requireIsoTimestamp(value, "updatedAt", joinPath(path, "updatedAt"), issues);
  requirePattern(value, "fingerprint", joinPath(path, "fingerprint"), SHA256_FINGERPRINT_PATTERN, issues);
  requirePattern(
    value,
    "snapshotFingerprint",
    joinPath(path, "snapshotFingerprint"),
    SHA256_FINGERPRINT_PATTERN,
    issues,
  );
  requirePattern(value, "workspaceId", joinPath(path, "workspaceId"), WORKSPACE_ID_PATTERN, issues);
  requirePattern(value, "deviceId", joinPath(path, "deviceId"), DEVICE_ID_PATTERN, issues);
  requirePattern(value, "sessionId", joinPath(path, "sessionId"), SESSION_ID_PATTERN, issues);
  collectStringArrayIssues(value.operations, joinPath(path, "operations"), issues);
  requireNonNegativeInteger(value, "eventCount", joinPath(path, "eventCount"), issues);
  requireNonNegativeInteger(value, "auditRecordCount", joinPath(path, "auditRecordCount"), issues);
}

function collectAuditPreviewIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "auditPreview must be an object" });
    return;
  }

  requireLiteral(value, "kind", joinPath(path, "kind"), "workspace-session.audit-preview", issues);
  requireLiteral(
    value,
    "schemaVersion",
    joinPath(path, "schemaVersion"),
    WORKSPACE_SESSION_API_SCHEMA_VERSION,
    issues,
  );
  requireTrue(value, "localOnly", joinPath(path, "localOnly"), issues);
  requireFalse(value, "durableWrites", joinPath(path, "durableWrites"), issues);
  collectAuditPreviewSummaryIssues(value.summary, joinPath(path, "summary"), issues);
  collectAuditPreviewEventArrayIssues(value.events, joinPath(path, "events"), issues);
  collectAuditPreviewRecordsIssues(value.audit, joinPath(path, "audit"), issues);
}

function collectAuditPreviewSummaryIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "summary must be an object" });
    return;
  }

  requireLiteral(value, "kind", joinPath(path, "kind"), "workspace-session.summary", issues);
  requireLiteral(
    value,
    "schemaVersion",
    joinPath(path, "schemaVersion"),
    WORKSPACE_SESSION_API_SCHEMA_VERSION,
    issues,
  );
  requireTrue(value, "localOnly", joinPath(path, "localOnly"), issues);
  requireFalse(value, "durableWrites", joinPath(path, "durableWrites"), issues);
  requirePattern(value, "workspaceId", joinPath(path, "workspaceId"), WORKSPACE_ID_PATTERN, issues);
  requirePattern(value, "deviceId", joinPath(path, "deviceId"), DEVICE_ID_PATTERN, issues);
  collectAuditPreviewStorageIssues(value.storage, joinPath(path, "storage"), issues);
}

function collectAuditPreviewStorageIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "storage must be an object" });
    return;
  }

  requireTrue(value, "localOnly", joinPath(path, "localOnly"), issues);
  requireTrue(value, "storagePathRedacted", joinPath(path, "storagePathRedacted"), issues);
  requirePattern(value, "storagePath", joinPath(path, "storagePath"), REDACTED_STORAGE_PATTERN, issues);
}

function collectAuditPreviewEventArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "events must be an array" });
    return;
  }

  value.forEach((event, index) => collectAuditPreviewEventIssues(event, `${path}.${index}`, issues));
}

function collectAuditPreviewEventIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "event must be an object" });
    return;
  }

  requirePattern(value, "eventId", joinPath(path, "eventId"), EVENT_ID_PATTERN, issues);
  requirePattern(value, "workspaceId", joinPath(path, "workspaceId"), WORKSPACE_ID_PATTERN, issues);
  requirePattern(value, "deviceId", joinPath(path, "deviceId"), DEVICE_ID_PATTERN, issues);
  requireIsoTimestamp(value, "createdAt", joinPath(path, "createdAt"), issues);
  if (!isRecord(value.payload)) {
    issues.push({ path: joinPath(path, "payload"), message: "payload must be an object" });
    return;
  }

  requireTrue(value.payload, "localOnly", joinPath(path, "payload.localOnly"), issues);
  requirePattern(value.payload, "sessionId", joinPath(path, "payload.sessionId"), SESSION_ID_PATTERN, issues);
  requireTrue(
    value.payload,
    "storagePathRedacted",
    joinPath(path, "payload.storagePathRedacted"),
    issues,
  );
  requirePattern(
    value.payload,
    "storagePath",
    joinPath(path, "payload.storagePath"),
    REDACTED_STORAGE_PATTERN,
    issues,
  );
  if (value.payload.lock !== undefined) {
    if (!isRecord(value.payload.lock)) {
      issues.push({ path: joinPath(path, "payload.lock"), message: "lock must be an object" });
    } else {
      requirePattern(
        value.payload.lock,
        "lockTokenRef",
        joinPath(path, "payload.lock.lockTokenRef"),
        REDACTED_LOCK_TOKEN_PATTERN,
        issues,
      );
    }
  }
}

function collectAuditPreviewRecordsIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "audit must be an object" });
    return;
  }

  requireLiteral(
    value,
    "kind",
    joinPath(path, "kind"),
    "workspace-session.audit-preview.records",
    issues,
  );
  requireTrue(value, "localOnly", joinPath(path, "localOnly"), issues);
  requireTrue(value, "redacted", joinPath(path, "redacted"), issues);
  requireNonNegativeInteger(value, "recordCount", joinPath(path, "recordCount"), issues);
  if (!Array.isArray(value.records)) {
    issues.push({ path: joinPath(path, "records"), message: "records must be an array" });
    return;
  }

  value.records.forEach((record, index) =>
    collectAuditRecordIssues(record, `${joinPath(path, "records")}.${index}`, issues)
  );
  if (Number.isSafeInteger(value.recordCount) && value.recordCount !== value.records.length) {
    issues.push({
      path: joinPath(path, "recordCount"),
      message: "recordCount must match records length",
    });
  }
}

function collectAuditRecordIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "audit record must be an object" });
    return;
  }

  requireNonEmptyString(value, "auditId", joinPath(path, "auditId"), issues);
  requireNonEmptyString(value, "action", joinPath(path, "action"), issues);
  requireIsoTimestamp(value, "createdAt", joinPath(path, "createdAt"), issues);
  if (value.details !== undefined) {
    collectJsonObjectIssues(value.details, joinPath(path, "details"), issues);
    if (isRecord(value.details)) {
      if (value.details.storagePath !== undefined) {
        requirePattern(
          value.details,
          "storagePath",
          joinPath(path, "details.storagePath"),
          REDACTED_STORAGE_PATTERN,
          issues,
        );
      }
      if (isRecord(value.details.lock)) {
        requirePattern(
          value.details.lock,
          "lockTokenRef",
          joinPath(path, "details.lock.lockTokenRef"),
          REDACTED_LOCK_TOKEN_PATTERN,
          issues,
        );
      }
    }
  }
}

function collectListFiltersIssues(
  value: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
): void {
  collectOptionalStringArrayIssues(value.snapshotIds, joinPath(path, "snapshotIds"), issues, SNAPSHOT_ID_PATTERN);
  collectOptionalStringArrayIssues(value.fingerprints, joinPath(path, "fingerprints"), issues, SHA256_FINGERPRINT_PATTERN);
  collectOptionalStringArrayIssues(value.workspaceIds, joinPath(path, "workspaceIds"), issues, WORKSPACE_ID_PATTERN);
  collectOptionalStringArrayIssues(value.sessionIds, joinPath(path, "sessionIds"), issues, SESSION_ID_PATTERN);
  collectOptionalStringArrayIssues(value.labels, joinPath(path, "labels"), issues);
  requireOptionalTimestamp(value.createdAfter, joinPath(path, "createdAfter"), issues);
  requireOptionalTimestamp(value.createdBefore, joinPath(path, "createdBefore"), issues);
}

function collectListFiltersResponseIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "filters must be an object" });
    return;
  }

  collectAllowedKeys(value, path, LIST_FILTER_KEYS, issues);
  collectListFiltersIssues(value, path, issues);
}

function collectPaginationIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "pagination must be an object" });
    return;
  }

  requireNonNegativeInteger(value, "offset", joinPath(path, "offset"), issues);
  requireNonNegativeInteger(value, "limit", joinPath(path, "limit"), issues);
  requireNonNegativeInteger(value, "totalRecordCount", joinPath(path, "totalRecordCount"), issues);
  requireNonNegativeInteger(value, "matchedRecordCount", joinPath(path, "matchedRecordCount"), issues);
  requireNonNegativeInteger(value, "returnedRecordCount", joinPath(path, "returnedRecordCount"), issues);
  if (typeof value.hasMore !== "boolean") {
    issues.push({ path: joinPath(path, "hasMore"), message: "hasMore must be a boolean" });
  }
}

function collectPayloadWrapperIssues(
  request: Record<string, unknown>,
  path: string,
  allowedKeys: readonly string[],
  issues: ValidationIssue[],
): void {
  const wrapperKeys = PREVIEW_WRAPPER_KEYS.filter((key) => request[key] !== undefined);
  if (wrapperKeys.length > 1) {
    issues.push({
      path,
      message: "request must include only one workspace session snapshot payload field",
    });
  }
  if (wrapperKeys.length > 0) {
    collectAllowedKeys(request, path, allowedKeys, issues);
  }
  for (const key of wrapperKeys) {
    const nested = request[key];
    if (isRecord(nested) && AUDIT_PREVIEW_KINDS.includes(nested.kind as typeof AUDIT_PREVIEW_KINDS[number])) {
      if (nested.kind === "workspace-session.snapshot-preview") {
        collectSnapshotPreviewIssues(nested, joinPath(path, key), issues);
      } else {
        collectAuditPreviewIssues(nested, joinPath(path, key), issues);
      }
    }
  }
}

function collectJsonObjectIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "value must be an object" });
    return;
  }
  collectJsonIssues(value, path, issues);
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
      if (nested === undefined) {
        issues.push({ path: joinPath(path, key), message: "value must be JSON-compatible" });
        continue;
      }
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
      issues.push({ path: joinPath(path, key), message: `unexpected field ${key}` });
    }
  }
}

function collectSnapshotIdIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (typeof value !== "string" || !SNAPSHOT_ID_PATTERN.test(value.trim())) {
    issues.push({
      path,
      message: "snapshotId must start with a letter or number and contain only letters, numbers, dot, underscore, colon, or hyphen",
    });
  }
}

function collectStringArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  pattern?: RegExp,
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "value must be an array of strings" });
    return;
  }

  value.forEach((item, index) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      issues.push({ path: `${path}.${index}`, message: "value must be a non-empty string" });
      return;
    }
    if (pattern !== undefined && !pattern.test(item)) {
      issues.push({ path: `${path}.${index}`, message: "value has an invalid format" });
    }
  });
}

function collectOptionalStringArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  pattern?: RegExp,
): void {
  if (value === undefined) {
    return;
  }
  collectStringArrayIssues(value, path, issues, pattern);
}

function requireLiteral(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  expected: string,
  issues: ValidationIssue[],
): void {
  if (record[key] !== expected) {
    issues.push({ path, message: `${key} must be ${expected}` });
  }
}

function requireTrue(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (record[key] !== true) {
    issues.push({ path, message: `${key} must be true` });
  }
}

function requireFalse(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (record[key] !== false) {
    issues.push({ path, message: `${key} must be false` });
  }
}

function requireNonEmptyString(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isNonEmptyString(record[key])) {
    issues.push({ path, message: `${key} must be a non-empty string` });
  }
}

function requireOptionalNonEmptyString(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): void {
  const value = record[key];
  if (value !== undefined && !isNonEmptyString(value)) {
    issues.push({ path, message: `${key} must be a non-empty string when provided` });
  }
}

function requireSnapshotId(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): void {
  collectSnapshotIdIssues(record[key], path, issues);
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

function requireIsoTimestamp(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): void {
  const value = record[key];
  if (typeof value !== "string" || !isTimestamp(value)) {
    issues.push({ path, message: `${key} must be an ISO timestamp` });
  }
}

function requireOptionalTimestamp(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value !== undefined && (typeof value !== "string" || !isTimestamp(value))) {
    issues.push({ path, message: "value must be an ISO timestamp when provided" });
  }
}

function requireNonNegativeInteger(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): void {
  const value = record[key];
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    issues.push({ path, message: `${key} must be a non-negative safe integer` });
  }
}

function requireOptionalIntegerInRange(
  value: unknown,
  path: string,
  min: number,
  max: number,
  issues: ValidationIssue[],
): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max)) {
    issues.push({ path, message: `value must be a safe integer between ${min} and ${max}` });
  }
}

function throwResponseIssues(issues: readonly ValidationIssue[], body: unknown): void {
  if (issues.length > 0) {
    throw new ApiResponseValidationError(issues, body);
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isTimestamp(value: string): boolean {
  if (!ISO_TIMESTAMP_PATTERN.test(value)) {
    return false;
  }

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
  const normalized = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === normalized);
}

function encodePathPart(value: string): string {
  return encodeURIComponent(value);
}

function joinPath(parent: string, child: string): string {
  if (parent.length === 0) {
    return child;
  }
  if (child.length === 0) {
    return parent;
  }
  return `${parent}.${child}`;
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
