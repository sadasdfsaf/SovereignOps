export type JsonPrimitive = string | number | boolean | null;
export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonValue =
  | JsonPrimitive
  | JsonObject
  | readonly JsonValue[];

export interface FetchRequestInit {
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
}

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText?: string;
  readonly headers?: HeadersLike;
  text(): Promise<string>;
}

export type HeadersLike =
  | { get(name: string): string | null }
  | Readonly<Record<string, string>>;

export type FetchLike = (
  input: string,
  init: FetchRequestInit,
) => Promise<FetchResponseLike>;

export interface SovereignOpsClientOptions {
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly fetch?: FetchLike;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface WorkspaceDescriptor {
  readonly workspaceId: string;
  readonly deviceId: string;
  readonly rootKeyRef: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ListWorkspacesQuery {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface ListWorkspacesResponse {
  readonly workspaces: readonly WorkspaceDescriptor[];
  readonly nextCursor?: string;
}

export interface UploadBundleRequest {
  readonly workspaceId: string;
  readonly bundleId: string;
  readonly bundle: JsonValue;
  readonly contentType?: string;
  readonly checksum?: string;
}

export interface UploadBundleResponse {
  readonly workspaceId: string;
  readonly bundleId: string;
  readonly status: string;
  readonly uploadedAt: string;
  readonly checksum?: string;
}

export interface ListAuditQuery {
  readonly workspaceId?: string;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface AuditRecord {
  readonly auditId: string;
  readonly action: string;
  readonly createdAt: string;
  readonly workspaceId?: string;
  readonly actor?: string;
  readonly details?: JsonObject;
}

export interface ListAuditResponse {
  readonly events: readonly AuditRecord[];
  readonly nextCursor?: string;
}

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

export interface ApiOk<T> {
  readonly ok: true;
  readonly value: T;
}

export interface ApiErr {
  readonly ok: false;
  readonly error: SovereignOpsApiError;
}

export type ApiResult<T> = ApiOk<T> | ApiErr;

export class SovereignOpsApiError extends Error {
  readonly code: string;

  constructor(message: string, options: { readonly code: string; readonly cause?: unknown }) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "SovereignOpsApiError";
    this.code = options.code;
  }
}

export class ApiRequestValidationError extends SovereignOpsApiError {
  readonly issues: readonly ValidationIssue[];

  constructor(message: string, issues: readonly ValidationIssue[]) {
    super(message, { code: "SO_API_REQUEST_INVALID" });
    this.name = "ApiRequestValidationError";
    this.issues = deepFreezeClone(issues);
  }
}

export class ApiNetworkError extends SovereignOpsApiError {
  constructor(message: string, cause: unknown) {
    super(message, { code: "SO_API_NETWORK_ERROR", cause });
    this.name = "ApiNetworkError";
  }
}

export class ApiHttpError extends SovereignOpsApiError {
  readonly status: number;
  readonly statusText: string;
  readonly apiCode?: string;
  readonly apiMessage?: string;
  readonly details?: JsonValue;
  readonly body?: unknown;

  constructor(options: {
    readonly status: number;
    readonly statusText?: string;
    readonly apiCode?: string;
    readonly apiMessage?: string;
    readonly details?: JsonValue;
    readonly body?: unknown;
  }) {
    const message =
      options.apiMessage ??
      `API request failed with status ${options.status}`;
    super(message, { code: "SO_API_HTTP_ERROR" });
    this.name = "ApiHttpError";
    this.status = options.status;
    this.statusText = options.statusText ?? "";
    this.apiCode = options.apiCode;
    this.apiMessage = options.apiMessage;
    this.details =
      options.details === undefined ? undefined : deepFreezeClone(options.details);
    this.body = options.body;
  }
}

export class ApiResponseParseError extends SovereignOpsApiError {
  readonly status: number;
  readonly contentType: string;
  readonly rawBody: string;

  constructor(options: {
    readonly status: number;
    readonly contentType: string;
    readonly rawBody: string;
    readonly cause?: unknown;
  }) {
    super("API response body was not valid JSON", {
      code: "SO_API_RESPONSE_PARSE_ERROR",
      cause: options.cause,
    });
    this.name = "ApiResponseParseError";
    this.status = options.status;
    this.contentType = options.contentType;
    this.rawBody = options.rawBody;
  }
}

export class ApiResponseValidationError extends SovereignOpsApiError {
  readonly issues: readonly ValidationIssue[];
  readonly body: unknown;

  constructor(issues: readonly ValidationIssue[], body: unknown) {
    super("API response shape was invalid", {
      code: "SO_API_RESPONSE_INVALID",
    });
    this.name = "ApiResponseValidationError";
    this.issues = deepFreezeClone(issues);
    this.body = body;
  }
}

type Validator<T> = (value: unknown) => T;

export class SovereignOpsClient {
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

  async createWorkspace(descriptor: WorkspaceDescriptor): Promise<WorkspaceDescriptor> {
    validateWorkspaceDescriptor(descriptor, "workspace");
    return this.#request(
      "workspaces",
      {
        method: "POST",
        body: JSON.stringify(descriptor),
      },
      parseWorkspaceDescriptor,
    );
  }

  async listWorkspaces(
    query: ListWorkspacesQuery = {},
  ): Promise<ListWorkspacesResponse> {
    validateListQuery(query, "query");
    const url = this.#url("workspaces", query);
    return this.#requestUrl(url, { method: "GET" }, parseListWorkspacesResponse);
  }

  async listWorkspace(
    query: ListWorkspacesQuery = {},
  ): Promise<ListWorkspacesResponse> {
    return this.listWorkspaces(query);
  }

  async uploadBundle(input: UploadBundleRequest): Promise<UploadBundleResponse> {
    validateUploadBundleRequest(input);
    const { workspaceId, bundleId, bundle, contentType, checksum } = input;
    const body = {
      bundleId,
      bundle,
      ...(contentType === undefined ? {} : { contentType }),
      ...(checksum === undefined ? {} : { checksum }),
    };

    return this.#request(
      `workspaces/${encodePathPart(workspaceId)}/bundles`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      parseUploadBundleResponse,
    );
  }

  async listAudit(query: ListAuditQuery = {}): Promise<ListAuditResponse> {
    validateListAuditQuery(query);
    const path =
      query.workspaceId === undefined
        ? "audit"
        : `workspaces/${encodePathPart(query.workspaceId)}/audit`;
    const { workspaceId: _workspaceId, ...search } = query;
    const url = this.#url(path, search);
    return this.#requestUrl(url, { method: "GET" }, parseListAuditResponse);
  }

  async listAuditEvents(query: ListAuditQuery = {}): Promise<ListAuditResponse> {
    return this.listAudit(query);
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

  #url(path: string, query: Readonly<Record<string, string | number | undefined>> = {}): string {
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

export function createSovereignOpsClient(
  options: SovereignOpsClientOptions,
): SovereignOpsClient {
  return new SovereignOpsClient(options);
}

export async function parseJsonApiResponse<T>(
  response: FetchResponseLike,
  parse: Validator<T>,
): Promise<T> {
  const rawBody = await response.text();
  const contentType = readHeader(response.headers, "content-type");
  const parsedBody = parseJsonBody(response, rawBody, contentType);

  if (!response.ok) {
    throw httpErrorFromResponse(response, parsedBody);
  }

  try {
    return parse(parsedBody);
  } catch (error) {
    if (error instanceof ApiResponseValidationError) {
      throw error;
    }
    throw error;
  }
}

export async function toApiResult<T>(
  operation: Promise<T> | (() => Promise<T>),
): Promise<ApiResult<T>> {
  try {
    const value = typeof operation === "function" ? await operation() : await operation;
    return Object.freeze({ ok: true, value });
  } catch (error) {
    if (error instanceof SovereignOpsApiError) {
      return Object.freeze({ ok: false, error });
    }

    return Object.freeze({
      ok: false,
      error: new SovereignOpsApiError("unexpected API client failure", {
        code: "SO_API_ERROR",
        cause: error,
      }),
    });
  }
}

function parseJsonBody(
  response: FetchResponseLike,
  rawBody: string,
  contentType: string,
): unknown {
  if (!isJsonContentType(contentType)) {
    if (!response.ok) {
      return rawBody;
    }

    throw new ApiResponseParseError({
      status: response.status,
      contentType,
      rawBody,
    });
  }

  try {
    return JSON.parse(rawBody);
  } catch (cause) {
    throw new ApiResponseParseError({
      status: response.status,
      contentType,
      rawBody,
      cause,
    });
  }
}

function httpErrorFromResponse(
  response: FetchResponseLike,
  body: unknown,
): ApiHttpError {
  if (isRecord(body)) {
    const error = body.error;
    if (isRecord(error)) {
      return new ApiHttpError({
        status: response.status,
        statusText: response.statusText,
        apiCode: typeof error.code === "string" ? error.code : undefined,
        apiMessage: typeof error.message === "string" ? error.message : undefined,
        details: isJsonValue(error.details) ? error.details : undefined,
        body,
      });
    }
  }

  return new ApiHttpError({
    status: response.status,
    statusText: response.statusText,
    body,
  });
}

function validateWorkspaceDescriptor(value: unknown, path: string): asserts value is WorkspaceDescriptor {
  const issues = collectWorkspaceDescriptorIssues(value, path);
  if (issues.length > 0) {
    throw new ApiRequestValidationError("workspace descriptor is invalid", issues);
  }
}

function parseWorkspaceDescriptor(value: unknown): WorkspaceDescriptor {
  const issues = collectWorkspaceDescriptorIssues(value, "");
  if (issues.length > 0) {
    throw new ApiResponseValidationError(issues, value);
  }

  const descriptor = value as Record<string, unknown>;
  return deepFreezeClone({
    workspaceId: descriptor.workspaceId,
    deviceId: descriptor.deviceId,
    rootKeyRef: descriptor.rootKeyRef,
    createdAt: descriptor.createdAt,
    updatedAt: descriptor.updatedAt,
  }) as WorkspaceDescriptor;
}

function parseListWorkspacesResponse(value: unknown): ListWorkspacesResponse {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw new ApiResponseValidationError([
      { path: "", message: "response must be an object" },
    ], value);
  }

  if (!Array.isArray(value.workspaces)) {
    issues.push({ path: "workspaces", message: "workspaces must be an array" });
  } else {
    value.workspaces.forEach((workspace, index) => {
      issues.push(...collectWorkspaceDescriptorIssues(workspace, `workspaces.${index}`));
    });
  }

  if (
    value.nextCursor !== undefined &&
    (typeof value.nextCursor !== "string" || value.nextCursor.trim().length === 0)
  ) {
    issues.push({ path: "nextCursor", message: "nextCursor must be a non-empty string" });
  }

  if (issues.length > 0) {
    throw new ApiResponseValidationError(issues, value);
  }

  return deepFreezeClone({
    workspaces: (value.workspaces as readonly unknown[]).map(parseWorkspaceDescriptor),
    ...(value.nextCursor === undefined ? {} : { nextCursor: value.nextCursor }),
  }) as ListWorkspacesResponse;
}

function validateUploadBundleRequest(input: UploadBundleRequest): void {
  const issues: ValidationIssue[] = [];
  if (!isRecord(input)) {
    throw new ApiRequestValidationError("bundle upload request is invalid", [
      { path: "", message: "request must be an object" },
    ]);
  }

  requireNonEmptyString(input, "workspaceId", "workspaceId", issues);
  requireNonEmptyString(input, "bundleId", "bundleId", issues);
  if (!Object.hasOwn(input, "bundle")) {
    issues.push({ path: "bundle", message: "bundle is required" });
  } else {
    collectJsonIssues(input.bundle, "bundle", issues);
  }

  if (input.contentType !== undefined) {
    requireNonEmptyString(input, "contentType", "contentType", issues);
  }

  if (input.checksum !== undefined) {
    requireNonEmptyString(input, "checksum", "checksum", issues);
  }

  if (issues.length > 0) {
    throw new ApiRequestValidationError("bundle upload request is invalid", issues);
  }
}

function parseUploadBundleResponse(value: unknown): UploadBundleResponse {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw new ApiResponseValidationError([
      { path: "", message: "response must be an object" },
    ], value);
  }

  requireNonEmptyString(value, "workspaceId", "workspaceId", issues);
  requireNonEmptyString(value, "bundleId", "bundleId", issues);
  requireNonEmptyString(value, "status", "status", issues);
  requireIsoTimestamp(value, "uploadedAt", "uploadedAt", issues);

  if (value.checksum !== undefined) {
    requireNonEmptyString(value, "checksum", "checksum", issues);
  }

  if (issues.length > 0) {
    throw new ApiResponseValidationError(issues, value);
  }

  return deepFreezeClone({
    workspaceId: value.workspaceId,
    bundleId: value.bundleId,
    status: value.status,
    uploadedAt: value.uploadedAt,
    ...(value.checksum === undefined ? {} : { checksum: value.checksum }),
  }) as UploadBundleResponse;
}

function validateListAuditQuery(query: ListAuditQuery): void {
  if (!isRecord(query)) {
    throw new ApiRequestValidationError("audit query is invalid", [
      { path: "query", message: "query must be an object" },
    ]);
  }

  const issues: ValidationIssue[] = [];
  if (query.workspaceId !== undefined) {
    requireNonEmptyString(query, "workspaceId", "workspaceId", issues);
  }
  validateListQuery(query, "query", issues);

  if (issues.length > 0) {
    throw new ApiRequestValidationError("audit query is invalid", issues);
  }
}

function parseListAuditResponse(value: unknown): ListAuditResponse {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw new ApiResponseValidationError([
      { path: "", message: "response must be an object" },
    ], value);
  }

  if (!Array.isArray(value.events)) {
    issues.push({ path: "events", message: "events must be an array" });
  } else {
    value.events.forEach((event, index) => {
      issues.push(...collectAuditRecordIssues(event, `events.${index}`));
    });
  }

  if (
    value.nextCursor !== undefined &&
    (typeof value.nextCursor !== "string" || value.nextCursor.trim().length === 0)
  ) {
    issues.push({ path: "nextCursor", message: "nextCursor must be a non-empty string" });
  }

  if (issues.length > 0) {
    throw new ApiResponseValidationError(issues, value);
  }

  return deepFreezeClone({
    events: (value.events as readonly unknown[]).map(parseAuditRecord),
    ...(value.nextCursor === undefined ? {} : { nextCursor: value.nextCursor }),
  }) as ListAuditResponse;
}

function parseAuditRecord(value: unknown): AuditRecord {
  const issues = collectAuditRecordIssues(value, "");
  if (issues.length > 0) {
    throw new ApiResponseValidationError(issues, value);
  }

  const event = value as Record<string, unknown>;
  return deepFreezeClone({
    auditId: event.auditId,
    action: event.action,
    createdAt: event.createdAt,
    ...(event.workspaceId === undefined ? {} : { workspaceId: event.workspaceId }),
    ...(event.actor === undefined ? {} : { actor: event.actor }),
    ...(event.details === undefined ? {} : { details: event.details }),
  }) as AuditRecord;
}

function collectWorkspaceDescriptorIssues(
  value: unknown,
  path: string,
): ValidationIssue[] {
  if (!isRecord(value)) {
    return [{ path, message: "workspace descriptor must be an object" }];
  }

  const issues: ValidationIssue[] = [];
  requirePrefixedString(value, "workspaceId", "wsp_", joinPath(path, "workspaceId"), issues);
  requirePrefixedString(value, "deviceId", "dev_", joinPath(path, "deviceId"), issues);
  requirePrefixedString(value, "rootKeyRef", "key_", joinPath(path, "rootKeyRef"), issues);
  requireIsoTimestamp(value, "createdAt", joinPath(path, "createdAt"), issues);
  requireIsoTimestamp(value, "updatedAt", joinPath(path, "updatedAt"), issues);

  if (
    issues.length === 0 &&
    Date.parse(value.updatedAt as string) < Date.parse(value.createdAt as string)
  ) {
    issues.push({
      path: joinPath(path, "updatedAt"),
      message: "updatedAt must be greater than or equal to createdAt",
    });
  }

  return issues;
}

function collectAuditRecordIssues(value: unknown, path: string): ValidationIssue[] {
  if (!isRecord(value)) {
    return [{ path, message: "audit event must be an object" }];
  }

  const issues: ValidationIssue[] = [];
  requireNonEmptyString(value, "auditId", joinPath(path, "auditId"), issues);
  requireNonEmptyString(value, "action", joinPath(path, "action"), issues);
  requireIsoTimestamp(value, "createdAt", joinPath(path, "createdAt"), issues);

  if (value.workspaceId !== undefined) {
    requireNonEmptyString(value, "workspaceId", joinPath(path, "workspaceId"), issues);
  }

  if (value.actor !== undefined) {
    requireNonEmptyString(value, "actor", joinPath(path, "actor"), issues);
  }

  if (value.details !== undefined) {
    if (!isRecord(value.details)) {
      issues.push({ path: joinPath(path, "details"), message: "details must be an object" });
    } else {
      collectJsonIssues(value.details, joinPath(path, "details"), issues);
    }
  }

  return issues;
}

function validateListQuery(
  query: unknown,
  path: string,
  existingIssues?: ValidationIssue[],
): void {
  const issues = existingIssues ?? [];
  if (!isRecord(query)) {
    issues.push({ path, message: "query must be an object" });
    if (existingIssues === undefined) {
      throw new ApiRequestValidationError("list query is invalid", issues);
    }
    return;
  }

  if (query.cursor !== undefined) {
    requireNonEmptyString(query, "cursor", joinPath(path, "cursor"), issues);
  }

  if (
    query.limit !== undefined &&
    (!Number.isInteger(query.limit) || (query.limit as number) <= 0)
  ) {
    issues.push({ path: joinPath(path, "limit"), message: "limit must be a positive integer" });
  }

  if (issues.length > 0 && existingIssues === undefined) {
    throw new ApiRequestValidationError("list query is invalid", issues);
  }
}

function collectJsonIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  seen: WeakSet<object> = new WeakSet(),
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

function isJsonValue(value: unknown): value is JsonValue {
  const issues: ValidationIssue[] = [];
  collectJsonIssues(value, "", issues);
  return issues.length === 0;
}

function requirePrefixedString(
  value: Record<string, unknown>,
  field: string,
  prefix: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (typeof value[field] !== "string" || (value[field] as string).trim().length === 0) {
    issues.push({ path, message: `${field} must be a non-empty string` });
    return;
  }

  if (!(value[field] as string).startsWith(prefix)) {
    issues.push({ path, message: `${field} must use the ${prefix} prefix` });
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

function readHeader(headers: HeadersLike | undefined, name: string): string {
  if (headers === undefined) {
    return "";
  }

  if ("get" in headers && typeof headers.get === "function") {
    return headers.get(name) ?? "";
  }

  const entry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  );
  return entry?.[1] ?? "";
}

function hasHeader(headers: Readonly<Record<string, string>>, name: string): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === name.toLowerCase());
}

function isJsonContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase();
  return normalized.includes("application/json") || normalized.includes("+json");
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
