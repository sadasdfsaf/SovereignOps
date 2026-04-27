import {
  compareCursors,
  parseCursor,
} from "./cursors.ts";
import {
  type JsonValue,
  type SyncDownloadRequest,
  type SyncDownloadWindow,
  type SyncUploadBatch,
  type ValidationIssue,
  type ValidationResult,
  validateDownloadRequest,
  validateUploadRequest,
} from "./bundles.ts";
import type {
  RateLimitDecision,
  RateLimiter,
} from "./rateLimit.ts";

export const SYNC_API_ERROR_CODES = [
  "malformed_cursor",
  "stale_cursor",
  "invalid_upload",
  "not_found",
  "rate_limited",
] as const;

export type SyncApiErrorCode = (typeof SYNC_API_ERROR_CODES)[number];

export interface SyncApiErrorBody {
  error: {
    code: SyncApiErrorCode;
    message: string;
    details?: unknown;
  };
}

export interface SyncHttpRequest<TBody = unknown> {
  body?: TBody;
  headers?: Record<string, string | undefined>;
  params?: Record<string, string | undefined>;
  query?: Record<string, string | number | undefined>;
}

export interface SyncHttpResponse<TBody = unknown> {
  status: number;
  headers: Record<string, string>;
  body: TBody;
}

export interface BundleUploadResult {
  workspaceId: `wsp_${string}`;
  deviceId: `dev_${string}`;
  cursor: string;
  acceptedEventIds: `evt_${string}`[];
}

export interface CursorStatusRequest {
  workspaceId: `wsp_${string}`;
  deviceId: `dev_${string}`;
  cursor: string;
}

export interface CursorStatusResult {
  workspaceId: `wsp_${string}`;
  deviceId: `dev_${string}`;
  cursor: string;
  currentCursor: string;
  stale: boolean;
}

export interface SyncRouteRepository {
  health?: () => MaybePromise<Record<string, JsonValue> | undefined>;
  uploadBundle: (batch: SyncUploadBatch) => MaybePromise<BundleUploadResult>;
  downloadBundle: (request: SyncDownloadRequest) => MaybePromise<SyncDownloadWindow | undefined>;
  getCursorStatus: (request: CursorStatusRequest) => MaybePromise<CursorStatusResult | undefined>;
}

export interface SyncHttpDependencies {
  repository: SyncRouteRepository;
  now?: () => number;
  rateLimiter?: RateLimiter;
  serviceName?: string;
}

export interface SyncHttpHandlers {
  health: (request?: SyncHttpRequest) => Promise<SyncHttpResponse>;
  uploadBundle: (request: SyncHttpRequest) => Promise<SyncHttpResponse>;
  downloadBundle: (request: SyncHttpRequest) => Promise<SyncHttpResponse>;
  cursorStatus: (request: SyncHttpRequest) => Promise<SyncHttpResponse>;
}

type MaybePromise<TValue> = TValue | Promise<TValue>;

const JSON_HEADERS = {
  "content-type": "application/json",
} as const;

const WORKSPACE_ID_PATTERN = /^wsp_[A-Za-z0-9_-]{1,88}$/;
const DEVICE_ID_PATTERN = /^dev_[A-Za-z0-9_-]{1,88}$/;

const ERROR_STATUS: Record<SyncApiErrorCode, number> = {
  malformed_cursor: 400,
  stale_cursor: 409,
  invalid_upload: 400,
  not_found: 404,
  rate_limited: 429,
};

export class SyncApiError extends Error {
  readonly code: SyncApiErrorCode;
  readonly details: unknown;
  readonly status: number;

  constructor(code: SyncApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "SyncApiError";
    this.code = code;
    this.details = details;
    this.status = ERROR_STATUS[code];
  }
}

export function createSyncHttpHandlers(dependencies: SyncHttpDependencies): SyncHttpHandlers {
  return {
    health: (request = {}) => handleHealth(request, dependencies),
    uploadBundle: (request) => handleBundleUpload(request, dependencies),
    downloadBundle: (request) => handleBundleDownload(request, dependencies),
    cursorStatus: (request) => handleCursorStatus(request, dependencies),
  };
}

export async function handleHealth(
  _request: SyncHttpRequest,
  dependencies: SyncHttpDependencies,
): Promise<SyncHttpResponse> {
  const repository = await dependencies.repository.health?.();

  return jsonResponse(200, {
    ok: true,
    service: dependencies.serviceName ?? "sync",
    checkedAt: new Date(clockNow(dependencies)).toISOString(),
    repository: repository ?? {},
  });
}

export async function handleBundleUpload(
  request: SyncHttpRequest,
  dependencies: SyncHttpDependencies,
): Promise<SyncHttpResponse> {
  const validation = validateUploadRequest(request.body);
  if (!validation.ok) {
    const code = hasProvidedCursorIssue(request.body, "baseCursor", validation.issues)
      ? "malformed_cursor"
      : "invalid_upload";
    const message = code === "malformed_cursor" ? "Upload cursor is malformed." : "Upload request is invalid.";
    return createApiErrorResponse(code, message, validationDetails(validation.issues));
  }

  const limited = enforceRateLimit(dependencies, validation.value);
  if (limited) {
    return limited;
  }

  try {
    const result = await dependencies.repository.uploadBundle(validation.value);
    return jsonResponse(201, result);
  } catch (error) {
    return caughtApiErrorResponse(error);
  }
}

export async function handleBundleDownload(
  request: SyncHttpRequest,
  dependencies: SyncHttpDependencies,
): Promise<SyncHttpResponse> {
  const validation = validateDownloadRequest(request.body);
  if (!validation.ok) {
    const code = hasProvidedCursorIssue(request.body, "afterCursor", validation.issues)
      ? "malformed_cursor"
      : "invalid_upload";
    return createApiErrorResponse(code, "Download request is invalid.", validationDetails(validation.issues));
  }

  const limited = enforceRateLimit(dependencies, validation.value);
  if (limited) {
    return limited;
  }

  try {
    const result = await dependencies.repository.downloadBundle(validation.value);
    if (!result) {
      return notFoundResponse("Bundle window was not found.");
    }

    return jsonResponse(200, result);
  } catch (error) {
    return caughtApiErrorResponse(error);
  }
}

export async function handleCursorStatus(
  request: SyncHttpRequest,
  dependencies: SyncHttpDependencies,
): Promise<SyncHttpResponse> {
  const validation = validateCursorStatusRequest(request.body);
  if (!validation.ok) {
    const code = hasProvidedCursorIssue(request.body, "cursor", validation.issues)
      ? "malformed_cursor"
      : "invalid_upload";
    return createApiErrorResponse(code, "Cursor status request is invalid.", validationDetails(validation.issues));
  }

  const limited = enforceRateLimit(dependencies, validation.value);
  if (limited) {
    return limited;
  }

  try {
    const result = await dependencies.repository.getCursorStatus(validation.value);
    if (!result) {
      return notFoundResponse("Cursor status was not found.");
    }

    return jsonResponse(200, result);
  } catch (error) {
    return caughtApiErrorResponse(error);
  }
}

export function createApiErrorBody(
  code: SyncApiErrorCode,
  message: string,
  details?: unknown,
): SyncApiErrorBody {
  return {
    error: details === undefined
      ? { code, message }
      : { code, message, details },
  };
}

export function createApiErrorResponse(
  code: SyncApiErrorCode,
  message: string,
  details?: unknown,
  headers: Record<string, string> = {},
): SyncHttpResponse<SyncApiErrorBody> {
  return jsonResponse(ERROR_STATUS[code], createApiErrorBody(code, message, details), headers);
}

export function malformedCursorError(message: string, details?: unknown): SyncApiError {
  return new SyncApiError("malformed_cursor", message, details);
}

export function staleCursorError(message: string, details?: unknown): SyncApiError {
  return new SyncApiError("stale_cursor", message, details);
}

export function invalidUploadError(message: string, details?: unknown): SyncApiError {
  return new SyncApiError("invalid_upload", message, details);
}

export function notFoundError(message: string, details?: unknown): SyncApiError {
  return new SyncApiError("not_found", message, details);
}

export function validateCursorStatusRequest(value: unknown): ValidationResult<CursorStatusRequest> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [{ path: "$", message: "cursor status request must be an object" }],
    };
  }

  requireOnlyKeys(value, ["workspaceId", "deviceId", "cursor"], "$", issues);
  requireWorkspaceId(value.workspaceId, "workspaceId", issues);
  requireDeviceId(value.deviceId, "deviceId", issues);
  requireCursor(value.cursor, "cursor", issues);

  return issues.length === 0
    ? {
        ok: true,
        issues,
        value: {
          workspaceId: value.workspaceId as `wsp_${string}`,
          deviceId: value.deviceId as `dev_${string}`,
          cursor: value.cursor as string,
        },
      }
    : { ok: false, issues };
}

export function defaultCursorStatus(
  request: CursorStatusRequest,
  currentCursor: string,
): CursorStatusResult {
  return {
    ...request,
    currentCursor,
    stale: compareCursors(request.cursor, currentCursor) < 0,
  };
}

function enforceRateLimit(
  dependencies: SyncHttpDependencies,
  subject: { workspaceId: string; deviceId: string },
): SyncHttpResponse<SyncApiErrorBody> | undefined {
  const decision = dependencies.rateLimiter?.take({
    workspaceId: subject.workspaceId,
    deviceId: subject.deviceId,
    nowMs: clockNow(dependencies),
  });

  if (!decision || decision.allowed) {
    return undefined;
  }

  return rateLimitedResponse(decision);
}

function rateLimitedResponse(decision: RateLimitDecision): SyncHttpResponse<SyncApiErrorBody> {
  const retryAfterSeconds = Math.max(1, Math.ceil(decision.retryAfterMs / 1000));

  return createApiErrorResponse(
    "rate_limited",
    "Too many sync requests for this workspace and device.",
    {
      workspaceId: decision.workspaceId,
      deviceId: decision.deviceId,
      limit: decision.limit,
      remaining: decision.remaining,
      resetAt: new Date(decision.resetAtMs).toISOString(),
      retryAfterMs: decision.retryAfterMs,
    },
    {
      "retry-after": String(retryAfterSeconds),
      "x-ratelimit-limit": String(decision.limit),
      "x-ratelimit-remaining": String(decision.remaining),
      "x-ratelimit-reset": String(decision.resetAtMs),
    },
  );
}

function caughtApiErrorResponse(error: unknown): SyncHttpResponse<SyncApiErrorBody> {
  if (error instanceof SyncApiError) {
    return createApiErrorResponse(error.code, error.message, error.details);
  }

  throw error;
}

function notFoundResponse(message: string): SyncHttpResponse<SyncApiErrorBody> {
  return createApiErrorResponse("not_found", message);
}

function jsonResponse<TBody>(
  status: number,
  body: TBody,
  headers: Record<string, string> = {},
): SyncHttpResponse<TBody> {
  return {
    status,
    headers: {
      ...JSON_HEADERS,
      ...headers,
    },
    body,
  };
}

function validationDetails(issues: readonly ValidationIssue[]): { issues: ValidationIssue[] } {
  return {
    issues: issues.map((issue) => ({ ...issue })),
  };
}

function hasProvidedCursorIssue(
  body: unknown,
  path: string,
  issues: readonly ValidationIssue[],
): boolean {
  return isRecord(body) && typeof body[path] === "string" && issues.some((issue) => issue.path === path);
}

function clockNow(dependencies: SyncHttpDependencies): number {
  return dependencies.now?.() ?? Date.now();
}

function requireOnlyKeys(
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  path: string,
  issues: ValidationIssue[],
): void {
  for (const key of Object.keys(record)) {
    if (!allowedKeys.includes(key)) {
      issues.push({ path: path === "$" ? key : `${path}.${key}`, message: "field is not supported" });
    }
  }
}

function requireWorkspaceId(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || !WORKSPACE_ID_PATTERN.test(value)) {
    issues.push({ path, message: "workspaceId must use the wsp_ id prefix" });
  }
}

function requireDeviceId(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || !DEVICE_ID_PATTERN.test(value)) {
    issues.push({ path, message: "deviceId must use the dev_ id prefix" });
  }
}

function requireCursor(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string") {
    issues.push({ path, message: "cursor must be a string" });
    return;
  }

  try {
    parseCursor(value);
  } catch (error) {
    issues.push({ path, message: error instanceof Error ? error.message : "cursor is invalid" });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
