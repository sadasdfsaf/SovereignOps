import {
  LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_ERROR_CODES,
  LocalWorkspaceSessionSnapshotRetentionError,
  planSnapshotRetentionCleanupDryRun,
  type LocalWorkspaceSessionSnapshotRetentionCleanupInput,
  type LocalWorkspaceSessionSnapshotRetentionCleanupPlan,
} from "../../../packages/sdk-js/src/localWorkspaceSessionSnapshotRetention.ts";
import type {
  ApiResponse,
  ApiRoute,
  ApiRouter,
} from "./router.ts";
import { jsonError, jsonResponse } from "./router.ts";

export const DEFAULT_WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_ROUTE_BASE_PATH =
  "/v1/workspace-session/snapshot-retention-cleanup";

export interface WorkspaceSessionSnapshotRetentionCleanupRoutesOptions {
  readonly basePath?: string;
  readonly now?: () => Date | string;
}

type Parsed<TValue> = { ok: true; value: TValue } | { ok: false; error: ApiResponse };
type JsonRecord = Record<string, unknown>;

const PREVIEW_BODY_KEYS = [
  "entries",
  "files",
  "records",
  "maxCount",
  "maxAgeMs",
  "now",
] as const;
const MAX_CLEANUP_ENTRIES = 1000;
const REDACTED_TOKEN_PATTERN = /^\[redacted(?::[A-Za-z0-9_-]+)*\]$/;
const RAW_LOCK_TOKEN_PATTERN = /^lock_[A-Za-z0-9_-]{4,}$/;
const RAW_LOCAL_PATH_PATTERN =
  /(?:\b[A-Za-z]:[\\/][^\s"',;)}\]]+|\\\\[^\\\s"',;)}\]]+[\\][^\s"',;)}\]]+|\b(?:\/Users|\/home|\/var|\/tmp|\/private|\/mnt|\/Volumes)\/[^\s"',;)}\]]+)/;
const SECRET_VALUE_PATTERN =
  /\b(?:Bearer\s+[A-Za-z0-9._~+/=-]{8,}|(?:sk|rk|pk|tok|pat|npm|ghp|gho)_[A-Za-z0-9_-]{8,}|(?:sk|rk|pat|glpat|github_pat)-[A-Za-z0-9_-]{8,})\b/i;
const SECRET_ASSIGNMENT_PATTERN =
  /\b(?:api[-_]?key|apikey|authorization|credential|password|passphrase|secret|session[-_]?token|token)\s*[:=]\s*([^\s,;]+)/i;
const SENSITIVE_FIELD_PATTERN =
  /(?:authorization|api[-_]?key|apikey|auth|bearer|cookie|credential|jwt|password|passphrase|private[-_]?key|refresh[-_]?token|secret|session[-_]?token|signing[-_]?key|token)$/i;
const PATH_FIELD_PATTERN = /(?:^|_)(?:absolute_path|file_path|path|relative_path|storage_path)$/;

export function createWorkspaceSessionSnapshotRetentionCleanupPreview(
  input: LocalWorkspaceSessionSnapshotRetentionCleanupInput,
): Readonly<LocalWorkspaceSessionSnapshotRetentionCleanupPlan> {
  return planSnapshotRetentionCleanupDryRun(input);
}

export function createWorkspaceSessionSnapshotRetentionCleanupRoutes(
  options: WorkspaceSessionSnapshotRetentionCleanupRoutesOptions = {},
): readonly ApiRoute[] {
  const basePath = normalizeBasePath(
    options.basePath ?? DEFAULT_WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_ROUTE_BASE_PATH,
  );

  return Object.freeze([
    {
      method: "POST",
      path: joinPath(basePath, "/preview"),
      description: "Previews local workspace session snapshot retention cleanup without writing state.",
      handler: ({ request }) => {
        const parsed = parseRetentionCleanupPreviewRequest(request.body, options);
        if (!parsed.ok) {
          return parsed.error;
        }

        return retentionCleanupResponse(() =>
          jsonResponse(200, createWorkspaceSessionSnapshotRetentionCleanupPreview(parsed.value))
        );
      },
    },
  ]);
}

export function mountWorkspaceSessionSnapshotRetentionCleanupRoutes(
  router: ApiRouter,
  options: WorkspaceSessionSnapshotRetentionCleanupRoutesOptions = {},
): ApiRouter {
  for (const route of createWorkspaceSessionSnapshotRetentionCleanupRoutes(options)) {
    router.register(route);
  }

  return router;
}

function parseRetentionCleanupPreviewRequest(
  body: unknown,
  options: WorkspaceSessionSnapshotRetentionCleanupRoutesOptions,
): Parsed<LocalWorkspaceSessionSnapshotRetentionCleanupInput> {
  const parsedBody = parseRequiredRequestBody(body);
  if (!parsedBody.ok) {
    return parsedBody;
  }

  const keys = allowedKeys(parsedBody.value, PREVIEW_BODY_KEYS, "body");
  if (!keys.ok) {
    return keys;
  }

  const unsafe = validateNoUnsafeRetentionCleanupInput(parsedBody.value, "body");
  if (!unsafe.ok) {
    return unsafe;
  }

  const entries = parseOptionalArray(parsedBody.value.entries, "body.entries");
  if (!entries.ok) {
    return entries;
  }
  const files = parseOptionalArray(parsedBody.value.files, "body.files");
  if (!files.ok) {
    return files;
  }
  const records = parseOptionalArray(parsedBody.value.records, "body.records");
  if (!records.ok) {
    return records;
  }

  const presentEntryFields = [
    entries.value === undefined ? undefined : "entries",
    files.value === undefined ? undefined : "files",
    records.value === undefined ? undefined : "records",
  ].filter((field): field is string => field !== undefined);
  if (presentEntryFields.length !== 1) {
    return validationFailure("Request body must include exactly one entries, files, or records array.", {
      path: "body",
    });
  }

  const maxCount = parseOptionalIntegerInRange(parsedBody.value.maxCount, "body.maxCount", 0);
  if (!maxCount.ok) {
    return maxCount;
  }
  const maxAgeMs = parseOptionalIntegerInRange(parsedBody.value.maxAgeMs, "body.maxAgeMs", 0);
  if (!maxAgeMs.ok) {
    return maxAgeMs;
  }
  const now = parseOptionalTimestamp(parsedBody.value.now, "body.now");
  if (!now.ok) {
    return now;
  }
  const injectedNow = readInjectedNow(now.value, options.now);
  if (!injectedNow.ok) {
    return injectedNow;
  }

  return {
    ok: true,
    value: optionalFields({
      entries: entries.value,
      files: files.value,
      records: records.value,
      maxCount: maxCount.value,
      maxAgeMs: maxAgeMs.value,
      now: now.value ?? injectedNow.value,
    }) as LocalWorkspaceSessionSnapshotRetentionCleanupInput,
  };
}

function parseRequiredRequestBody(body: unknown): Parsed<JsonRecord> {
  const json = cloneJsonCompatibleValue(body, "body");
  if (!json.ok) {
    return json;
  }
  if (!isRecord(json.value)) {
    return validationFailure("Request body must be an object.", { path: "body" });
  }

  return { ok: true, value: json.value };
}

function parseOptionalArray(value: unknown, path: string): Parsed<readonly unknown[] | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (!Array.isArray(value)) {
    return validationFailure("Value must be an array.", { path });
  }
  if (value.length > MAX_CLEANUP_ENTRIES) {
    return validationFailure(`Value must include at most ${MAX_CLEANUP_ENTRIES} entries.`, {
      path,
    });
  }

  return { ok: true, value };
}

function parseOptionalTimestamp(value: unknown, path: string): Parsed<string | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (typeof value !== "string" || value.trim().length === 0 || Number.isNaN(Date.parse(value))) {
    return validationFailure("Value must be a valid timestamp.", { path });
  }

  return { ok: true, value: value.trim() };
}

function parseOptionalIntegerInRange(
  value: unknown,
  path: string,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): Parsed<number | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) {
    return validationFailure(`Value must be a safe integer between ${min} and ${max}.`, {
      path,
    });
  }

  return { ok: true, value: Number(value) };
}

function validateNoUnsafeRetentionCleanupInput(
  value: unknown,
  path: string,
  keyHint = "",
): Parsed<undefined> {
  if (typeof value === "string") {
    const reason = unsafeRetentionCleanupReason(value, keyHint);
    if (reason !== undefined) {
      return validationFailure(
        "Workspace session snapshot retention cleanup input must not include raw secrets, lock tokens, or local paths.",
        { path, reason },
      );
    }
    return { ok: true, value: undefined };
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const nested = validateNoUnsafeRetentionCleanupInput(item, `${path}.${index}`, keyHint);
      if (!nested.ok) {
        return nested;
      }
    }
    return { ok: true, value: undefined };
  }

  if (isRecord(value)) {
    for (const [key, nested] of Object.entries(value)) {
      const token = normalizeToken(key);
      if (isRawRetentionFlag(token, nested)) {
        return validationFailure(
          "Workspace session snapshot retention cleanup input must not include raw secrets, lock tokens, or local paths.",
          { path: `${path}.${key}`, reason: "raw_retention_flag" },
        );
      }

      const result = validateNoUnsafeRetentionCleanupInput(nested, `${path}.${key}`, key);
      if (!result.ok) {
        return result;
      }
    }
  }

  return { ok: true, value: undefined };
}

function unsafeRetentionCleanupReason(value: string, keyHint: string): string | undefined {
  if (isRedactedToken(value) || normalizeToken(keyHint).includes("fingerprint")) {
    return undefined;
  }

  const key = normalizeToken(keyHint);
  if (PATH_FIELD_PATTERN.test(key) && hasTraversalSegment(value)) {
    return "path_traversal";
  }
  if (RAW_LOCAL_PATH_PATTERN.test(value)) {
    return "raw_local_path";
  }
  if (RAW_LOCK_TOKEN_PATTERN.test(value) || key.includes("lock_token")) {
    return "raw_lock_token";
  }
  if (SENSITIVE_FIELD_PATTERN.test(keyHint)) {
    return "raw_secret";
  }

  const assignedSecret = SECRET_ASSIGNMENT_PATTERN.exec(value);
  if (assignedSecret !== null && !isRedactedToken(assignedSecret[1])) {
    return "raw_secret";
  }
  if (SECRET_VALUE_PATTERN.test(value)) {
    return "raw_secret";
  }

  return undefined;
}

function isRawRetentionFlag(key: string, value: unknown): boolean {
  if (value === true) {
    return (
      key === "raw_body_stored" ||
      key === "raw_body_retained" ||
      key === "raw_request_body_stored" ||
      key === "raw_response_body_stored" ||
      key === "raw_paths_stored" ||
      key === "raw_storage_paths_stored" ||
      key === "raw_lock_material_stored" ||
      key === "raw_secrets_stored" ||
      key === "stores_raw_body"
    );
  }

  return (
    value === false &&
    (key === "storage_path_redacted" ||
      key === "storage_paths_redacted" ||
      key === "lock_material_redacted" ||
      key === "body_redacted")
  );
}

function retentionCleanupResponse(callback: () => ApiResponse): ApiResponse {
  try {
    return callback();
  } catch (error) {
    return caughtRetentionCleanupRouteError(error);
  }
}

function caughtRetentionCleanupRouteError(error: unknown): ApiResponse {
  if (error instanceof LocalWorkspaceSessionSnapshotRetentionError) {
    return validationError(error.message, routeDetailsForRetentionCleanupError(error));
  }

  if (error instanceof TypeError) {
    return validationError(error.message, { path: "body" });
  }

  return jsonError(
    500,
    "workspace_session_snapshot_retention_cleanup_route_failed",
    "Workspace session snapshot retention cleanup route failed.",
  );
}

function routeDetailsForRetentionCleanupError(
  error: LocalWorkspaceSessionSnapshotRetentionError,
): Readonly<Record<string, unknown>> {
  const sdkPath = isRecord(error.details) && typeof error.details.path === "string"
    ? error.details.path
    : undefined;

  return {
    path: routePathForRetentionCleanupError(error.code, sdkPath),
    sdkCode: error.code,
  };
}

function routePathForRetentionCleanupError(
  code: string,
  sdkPath: string | undefined,
): string {
  if (
    code === LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_ERROR_CODES.INVALID_INPUT &&
    (sdkPath === undefined || sdkPath.length === 0)
  ) {
    return "body";
  }
  if (sdkPath !== undefined && sdkPath.length > 0) {
    return `body.${sdkPath}`;
  }

  return "body";
}

function allowedKeys(
  record: JsonRecord,
  keys: readonly string[],
  path: string,
): { ok: true } | { ok: false; error: ApiResponse } {
  const allowed = new Set(keys);
  const unknown = Object.keys(record).find((key) => !allowed.has(key));
  if (unknown) {
    return validationFailure("Request body contains an unknown field.", {
      path: `${path}.${unknown}`,
    });
  }

  return { ok: true };
}

function cloneJsonCompatibleValue(
  value: unknown,
  path: string,
  seen: WeakSet<object> = new WeakSet<object>(),
): Parsed<unknown> {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return { ok: true, value };
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return validationFailure("Request body must be JSON-compatible.", { path });
    }

    return { ok: true, value };
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return validationFailure("Request body must not contain circular references.", { path });
    }

    seen.add(value);
    const values: unknown[] = [];
    for (const [index, item] of value.entries()) {
      const parsed = cloneJsonCompatibleValue(item, `${path}.${index}`, seen);
      if (!parsed.ok) {
        return parsed;
      }
      values.push(parsed.value);
    }
    seen.delete(value);

    return { ok: true, value: Object.freeze(values) };
  }

  if (isRecord(value)) {
    if (seen.has(value)) {
      return validationFailure("Request body must not contain circular references.", { path });
    }

    seen.add(value);
    const output: JsonRecord = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      if (entryValue === undefined) {
        return validationFailure("Request body must be JSON-compatible.", {
          path: `${path}.${entryKey}`,
        });
      }

      const parsed = cloneJsonCompatibleValue(entryValue, `${path}.${entryKey}`, seen);
      if (!parsed.ok) {
        return parsed;
      }
      output[entryKey] = parsed.value;
    }
    seen.delete(value);

    return { ok: true, value: deepFreeze(output) };
  }

  return validationFailure("Request body must be JSON-compatible.", { path });
}

function validationFailure<TValue>(
  message: string,
  details: Readonly<Record<string, unknown>>,
): Parsed<TValue> {
  return { ok: false, error: validationError(message, details) };
}

function validationError(
  message: string,
  details: Readonly<Record<string, unknown>>,
): ApiResponse {
  return jsonError(400, "validation_failed", message, details);
}

function readInjectedNow(
  explicitNow: string | undefined,
  now: (() => Date | string) | undefined,
): Parsed<string | undefined> {
  if (explicitNow !== undefined || now === undefined) {
    return { ok: true, value: undefined };
  }

  try {
    return { ok: true, value: readNow(now) };
  } catch (error) {
    return { ok: false, error: caughtRetentionCleanupRouteError(error) };
  }
}

function readNow(now: () => Date | string): string {
  const value = now();
  const timestamp = value instanceof Date ? value.toISOString() : value;
  if (typeof timestamp !== "string" || Number.isNaN(Date.parse(timestamp))) {
    throw new TypeError("Workspace session snapshot retention cleanup timestamp source returned an invalid timestamp.");
  }

  return timestamp;
}

function optionalFields<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) =>
      value !== undefined &&
      (!Array.isArray(value) || value.length > 0),
    ),
  ) as T;
}

function normalizeBasePath(path: string): string {
  const trimmed = path.trim();
  if (trimmed.length === 0 || trimmed === "/") {
    return "";
  }

  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const collapsed = withSlash.replace(/\/+/g, "/");

  return collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed;
}

function joinPath(basePath: string, suffix: string): string {
  const normalizedSuffix = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `${basePath}${normalizedSuffix}`;
}

function normalizeToken(value: string | undefined): string {
  return value === undefined
    ? ""
    : value
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
  const trimmed = value.trim();
  return (
    trimmed === "[REDACTED]" ||
    REDACTED_TOKEN_PATTERN.test(trimmed) ||
    trimmed === "[redacted-path]" ||
    trimmed === "[redacted-secret]"
  );
}

function isRecord(value: unknown): value is JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze<T>(value: T): T {
  if (!isRecord(value) && !Array.isArray(value)) {
    return value;
  }

  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }

  return Object.freeze(value);
}
