import {
  ApiHttpError,
  ApiNetworkError,
  ApiRequestValidationError,
  ApiResponseParseError,
  ApiResponseValidationError,
  type FetchLike,
  type FetchRequestInit,
  type FetchResponseLike,
  type JsonValue,
  parseJsonApiResponse,
  type SovereignOpsClientOptions,
  type ValidationIssue,
} from "./client.ts";
import {
  LocalIngestConnectorManifestError,
  buildLocalIngestConnectorReadinessSummary,
  normalizeLocalIngestConnectorManifest,
  type LocalIngestConnectorManifest,
  type LocalIngestConnectorReadinessSummary,
} from "./localIngestConnectorManifest.ts";
import type { DeepReadonly } from "./workspace.ts";

export type IngestConnectorClientOptions =
  Omit<SovereignOpsClientOptions, "fetch"> & {
    readonly fetch: FetchLike;
  };

type Validator<T> = (value: unknown) => T;

const CONNECTOR_MANIFEST_ENDPOINT = "ingest/connectors";

const RAW_LOCAL_PATH_PATTERN =
  /(?:\b[A-Za-z]:[\\/][^\s"',;)}\]]+|\\\\[^\\\s"',;)}\]]+[\\][^\s"',;)}\]]+|\b(?:\/Users|\/home|\/var|\/tmp|\/private|\/mnt|\/Volumes)\/[^\s"',;)}\]]+)/g;
const PRIVATE_LOCATION_PATTERN =
  /(?:^|[\\/])\.codex-private(?:[\\/]|$)|\bprivate[-_\s]?plan(?:[-_\s]?pack)?\b/gi;
const SECRET_VALUE_PATTERN =
  /\b(?:Bearer\s+[A-Za-z0-9._~+/=-]{8,}|(?:sk|rk|pk|tok|pat|npm|ghp|gho)_[A-Za-z0-9_-]{8,}|(?:sk|rk|pat|glpat|github_pat)-[A-Za-z0-9_-]{8,})\b/gi;
const SECRET_ASSIGNMENT_PATTERN =
  /\b((?:api[-_]?key|apikey|authorization|credential|password|passphrase|secret|session[-_]?token|token)\s*[:=]\s*)([^\s,;]+)/gi;
const SENSITIVE_FIELD_PATTERN =
  /(?:authorization|api[-_]?key|apikey|auth|bearer|cookie|credential|jwt|password|passphrase|private[-_]?key|refresh[-_]?token|secret|session[-_]?token|signing[-_]?key|token)$/i;
const PATH_FIELD_PATTERN =
  /(?:^|_)(?:absolute_path|file_path|include_paths?|path|paths|relative_path|root_path|storage_path)$/i;
const REDACTED_TOKEN_PATTERN = /^\[redacted(?::[A-Za-z0-9_-]+)*\]$/i;

export class IngestConnectorClient {
  readonly #baseUrl: string;
  readonly #fetch: FetchLike;
  readonly #apiKey?: string;
  readonly #headers: Readonly<Record<string, string>>;

  constructor(options: IngestConnectorClientOptions) {
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

    if (typeof options.fetch !== "function") {
      issues.push({ path: "fetch", message: "fetch must be provided for local ingest connector calls" });
    }

    if (issues.length > 0 || parsedBaseUrl === undefined) {
      throw new ApiRequestValidationError("client options are invalid", issues);
    }

    this.#baseUrl = parsedBaseUrl.href.endsWith("/")
      ? parsedBaseUrl.href
      : `${parsedBaseUrl.href}/`;
    this.#fetch = options.fetch;
    this.#apiKey = options.apiKey;
    this.#headers = Object.freeze({ ...(options.headers ?? {}) });
  }

  async getManifest(): Promise<DeepReadonly<LocalIngestConnectorManifest>> {
    return this.#request(
      CONNECTOR_MANIFEST_ENDPOINT,
      { method: "GET" },
      parseIngestConnectorManifestResponse,
    );
  }

  async manifest(): Promise<DeepReadonly<LocalIngestConnectorManifest>> {
    return this.getManifest();
  }

  async getReadiness(): Promise<DeepReadonly<LocalIngestConnectorReadinessSummary>> {
    return this.#request(
      CONNECTOR_MANIFEST_ENDPOINT,
      { method: "GET" },
      parseIngestConnectorReadinessResponse,
    );
  }

  async readiness(): Promise<DeepReadonly<LocalIngestConnectorReadinessSummary>> {
    return this.getReadiness();
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
      throw new ApiNetworkError(
        "API request failed before a response was received",
        sanitizeNetworkCause(cause),
      );
    }

    try {
      return await parseJsonApiResponse(response, parse);
    } catch (error) {
      throw sanitizeApiError(error);
    }
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

export function createIngestConnectorClient(
  options: IngestConnectorClientOptions,
): IngestConnectorClient {
  return new IngestConnectorClient(options);
}

function parseIngestConnectorManifestResponse(
  value: unknown,
): DeepReadonly<LocalIngestConnectorManifest> {
  try {
    return normalizeLocalIngestConnectorManifest(value);
  } catch (error) {
    throw responseValidationErrorFromManifestError(error, value);
  }
}

function parseIngestConnectorReadinessResponse(
  value: unknown,
): DeepReadonly<LocalIngestConnectorReadinessSummary> {
  const manifest = parseIngestConnectorManifestResponse(value);
  return buildLocalIngestConnectorReadinessSummary(manifest);
}

function responseValidationErrorFromManifestError(
  error: unknown,
  body: unknown,
): ApiResponseValidationError {
  if (error instanceof LocalIngestConnectorManifestError) {
    return new ApiResponseValidationError(
      error.issues.length === 0
        ? [{ path: "", message: error.message }]
        : error.issues.map((issue) => ({
          path: normalizeIssuePath(issue.path),
          message: issue.reason === undefined
            ? issue.message
            : `${issue.message}: ${issue.reason}`,
        })),
      redactUnsafeValue(body),
    );
  }

  return new ApiResponseValidationError(
    [{ path: "", message: "ingest connector manifest response is invalid" }],
    redactUnsafeValue(body),
  );
}

function sanitizeApiError(error: unknown): unknown {
  if (error instanceof ApiHttpError) {
    return new ApiHttpError({
      status: error.status,
      statusText: redactUnsafeText(error.statusText),
      apiCode: error.apiCode === undefined ? undefined : redactUnsafeText(error.apiCode),
      apiMessage: error.apiMessage === undefined ? undefined : redactUnsafeText(error.apiMessage),
      details: error.details === undefined
        ? undefined
        : redactUnsafeValue(error.details) as JsonValue,
      body: error.body === undefined ? undefined : redactUnsafeValue(error.body),
    });
  }

  if (error instanceof ApiResponseParseError) {
    return new ApiResponseParseError({
      status: error.status,
      contentType: error.contentType,
      rawBody: redactUnsafeText(error.rawBody),
      cause: (error as Error & { readonly cause?: unknown }).cause,
    });
  }

  if (error instanceof ApiResponseValidationError) {
    return new ApiResponseValidationError(error.issues, redactUnsafeValue(error.body));
  }

  return error;
}

function sanitizeNetworkCause(cause: unknown): unknown {
  if (cause instanceof Error) {
    return Object.freeze({
      name: redactUnsafeText(cause.name),
      message: redactUnsafeText(cause.message),
    });
  }

  return redactUnsafeValue(cause);
}

function redactUnsafeValue(
  value: unknown,
  keyHint = "",
  seen: WeakSet<object> = new WeakSet<object>(),
): unknown {
  if (typeof value === "string") {
    return redactUnsafeText(value, keyHint);
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return "[redacted:circular]";
    }
    seen.add(value);
    const redacted = value.map((item) => redactUnsafeValue(item, keyHint, seen));
    seen.delete(value);
    return redacted;
  }

  if (isRecord(value)) {
    if (seen.has(value)) {
      return "[redacted:circular]";
    }
    seen.add(value);
    const redacted = Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        redactUnsafeValue(nested, key, seen),
      ]),
    );
    seen.delete(value);
    return redacted;
  }

  return value;
}

function redactUnsafeText(value: string, keyHint = ""): string {
  if (isRedactedToken(value)) {
    return value;
  }

  if (SENSITIVE_FIELD_PATTERN.test(keyHint) && value.trim().length > 0) {
    return "[redacted:secret]";
  }

  const key = normalizeToken(keyHint);
  if (PATH_FIELD_PATTERN.test(key) && hasTraversalSegment(value)) {
    return "[redacted:path]";
  }

  return value
    .replace(SECRET_ASSIGNMENT_PATTERN, (_match, prefix: string) => `${prefix}[redacted:secret]`)
    .replace(SECRET_VALUE_PATTERN, "[redacted:secret]")
    .replace(RAW_LOCAL_PATH_PATTERN, "[redacted:path]")
    .replace(PRIVATE_LOCATION_PATTERN, "[redacted:path]");
}

function hasHeader(headers: Readonly<Record<string, string>>, name: string): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === name.toLowerCase());
}

function normalizeIssuePath(path: string): string {
  if (path === "$") {
    return "";
  }

  return path.replace(/^\$\./, "");
}

function normalizeToken(value: string): string {
  return value
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function hasTraversalSegment(value: string): boolean {
  return value
    .replace(/\\/g, "/")
    .split("/")
    .includes("..");
}

function isRedactedToken(value: string): boolean {
  return (
    value === "[REDACTED]" ||
    value === "[redacted:path]" ||
    value === "[redacted:secret]" ||
    REDACTED_TOKEN_PATTERN.test(value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
