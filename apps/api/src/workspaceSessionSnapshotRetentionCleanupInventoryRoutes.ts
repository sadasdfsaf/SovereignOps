import {
  LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_ERROR_CODES,
  LocalWorkspaceSessionSnapshotRetentionError,
  planFileBackedLocalWorkspaceSessionSnapshotRetentionCleanup,
  type LocalWorkspaceSessionSnapshotRetentionCleanupInput,
  type LocalWorkspaceSessionSnapshotRetentionCleanupPlan,
} from "../../../packages/sdk-js/src/localWorkspaceSessionSnapshotRetention.ts";
import type {
  ApiResponse,
  ApiRoute,
  ApiRouter,
} from "./router.ts";
import { jsonError, jsonResponse } from "./router.ts";

export const DEFAULT_WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_INVENTORY_ROUTE_BASE_PATH =
  "/v1/workspace-session/snapshot-retention-cleanup/inventory";

export interface WorkspaceSessionSnapshotRetentionCleanupInventoryPolicy {
  readonly maxCount?: number;
  readonly maxAgeMs?: number;
  readonly now?: string;
}

export interface WorkspaceSessionSnapshotRetentionCleanupInventoryPreviewInput {
  readonly inventory: readonly unknown[];
  readonly policy?: WorkspaceSessionSnapshotRetentionCleanupInventoryPolicy;
}

export interface WorkspaceSessionSnapshotRetentionCleanupInventoryRoutesOptions {
  readonly basePath?: string;
  readonly now?: () => Date | string;
}

type Parsed<TValue> = { ok: true; value: TValue } | { ok: false; error: ApiResponse };
type JsonRecord = Record<string, unknown>;

interface ParsedInventoryPreviewRequest {
  readonly input: WorkspaceSessionSnapshotRetentionCleanupInventoryPreviewInput;
  readonly policyPath: string;
}

const BODY_KEYS = [
  "inventory",
  "entries",
  "files",
  "records",
  "policy",
  "maxCount",
  "maxAgeMs",
  "now",
] as const;
const INVENTORY_SECTION_KEYS = ["entries", "files", "records"] as const;
const POLICY_KEYS = ["maxCount", "maxAgeMs", "now"] as const;
const MAX_INVENTORY_RECORDS = 1000;
const SAFE_RELATIVE_PATH_PATTERN =
  /^(?!\/)(?![A-Za-z]:)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\/\/)[A-Za-z0-9._/-]{1,240}$/;
const REDACTED_TOKEN_PATTERN = /^\[redacted(?::[A-Za-z0-9_-]+)*\]$/;
const RAW_LOCK_TOKEN_PATTERN = /^lock_[A-Za-z0-9_-]{4,}$/;
const RAW_LOCAL_PATH_PATTERN =
  /(?:\b[A-Za-z]:[\\/][^\s"',;)}\]]+|\\\\[^\\\s"',;)}\]]+[\\][^\s"',;)}\]]+|file:\/\/[^\s"',;)}\]]+|(?:^|[\s"'(=])\/(?!\/)[^\s"',;)}\]]+)/i;
const SECRET_VALUE_PATTERN =
  /\b(?:Bearer\s+[A-Za-z0-9._~+/=-]{8,}|(?:sk|rk|pk|tok|pat|npm|ghp|gho)_[A-Za-z0-9_-]{8,}|(?:sk|rk|pat|glpat|github_pat)-[A-Za-z0-9_-]{8,})\b/i;
const SECRET_ASSIGNMENT_PATTERN =
  /\b(?:api[-_]?key|apikey|authorization|credential|password|passphrase|secret|session[-_]?token|token)\s*[:=]\s*([^\s,;]+)/i;
const SENSITIVE_FIELD_PATTERN =
  /(?:authorization|api[-_]?key|apikey|auth|bearer|cookie|credential|jwt|password|passphrase|private[-_]?key|refresh[-_]?token|secret|session[-_]?token|signing[-_]?key|token)$/i;
const PATH_FIELD_PATTERN =
  /(?:^|_)(?:absolute_path|file_path|path|relative_path|storage_path)$/;

export function createWorkspaceSessionSnapshotRetentionCleanupInventoryPreview(
  input: WorkspaceSessionSnapshotRetentionCleanupInventoryPreviewInput,
): Readonly<LocalWorkspaceSessionSnapshotRetentionCleanupPlan> {
  return planFileBackedLocalWorkspaceSessionSnapshotRetentionCleanup({
    files: input.inventory,
    ...optionalFields(input.policy ?? {}),
  } satisfies LocalWorkspaceSessionSnapshotRetentionCleanupInput);
}

export function createWorkspaceSessionSnapshotRetentionCleanupInventoryRoutes(
  options: WorkspaceSessionSnapshotRetentionCleanupInventoryRoutesOptions = {},
): readonly ApiRoute[] {
  const basePath = normalizeBasePath(
    options.basePath ??
      DEFAULT_WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_INVENTORY_ROUTE_BASE_PATH,
  );

  return Object.freeze([
    {
      method: "POST",
      path: joinPath(basePath, "/preview"),
      description:
        "Previews local workspace session snapshot retention cleanup inventory without writing state.",
      handler: ({ request }) => {
        const parsed = parseInventoryPreviewRequest(request.body, options);
        if (!parsed.ok) {
          return parsed.error;
        }

        return retentionCleanupInventoryResponse(
          () =>
            jsonResponse(
              200,
              createWorkspaceSessionSnapshotRetentionCleanupInventoryPreview(
                parsed.value.input,
              ),
            ),
          parsed.value.policyPath,
        );
      },
    },
  ]);
}

export function mountWorkspaceSessionSnapshotRetentionCleanupInventoryRoutes(
  router: ApiRouter,
  options: WorkspaceSessionSnapshotRetentionCleanupInventoryRoutesOptions = {},
): ApiRouter {
  for (const route of createWorkspaceSessionSnapshotRetentionCleanupInventoryRoutes(options)) {
    router.register(route);
  }

  return router;
}

function parseInventoryPreviewRequest(
  body: unknown,
  options: WorkspaceSessionSnapshotRetentionCleanupInventoryRoutesOptions,
): Parsed<ParsedInventoryPreviewRequest> {
  const parsedBody = parseRequiredRequestBody(body);
  if (!parsedBody.ok) {
    return parsedBody;
  }

  const keys = allowedKeys(parsedBody.value, BODY_KEYS, "body");
  if (!keys.ok) {
    return keys;
  }

  const inventory = parseInventorySource(parsedBody.value);
  if (!inventory.ok) {
    return inventory;
  }

  const policy = parseInventoryPolicy(parsedBody.value, options);
  if (!policy.ok) {
    return policy;
  }

  const unsafe = validateNoUnsafeInventoryInput(
    inventory.value.records,
    inventory.value.path,
  );
  if (!unsafe.ok) {
    return unsafe;
  }

  return {
    ok: true,
    value: {
      input: {
        inventory: inventory.value.records,
        policy: policy.value.policy,
      },
      policyPath: policy.value.path,
    },
  };
}

function parseInventorySource(
  body: JsonRecord,
): Parsed<{ readonly path: string; readonly records: readonly unknown[] }> {
  const sourceKeys = [
    body.inventory === undefined ? undefined : "inventory",
    body.entries === undefined ? undefined : "entries",
    body.files === undefined ? undefined : "files",
    body.records === undefined ? undefined : "records",
  ].filter((field): field is string => field !== undefined);

  if (sourceKeys.length === 0) {
    return validationFailure("Request body must include an inventory source.", {
      path: "body",
      reason: "missing_inventory",
    });
  }
  if (sourceKeys.length > 1) {
    return validationFailure("Request body must include only one inventory source.", {
      path: "body",
      reason: "ambiguous_sections",
    });
  }

  const [sourceKey] = sourceKeys;
  const value = body[sourceKey];
  if (sourceKey === "inventory") {
    return parseInventoryValue(value, "body.inventory");
  }

  const records = parseInventoryRecordArray(value, `body.${sourceKey}`);
  if (!records.ok) {
    return records;
  }

  return { ok: true, value: { path: `body.${sourceKey}`, records: records.value } };
}

function parseInventoryValue(
  value: unknown,
  path: string,
): Parsed<{ readonly path: string; readonly records: readonly unknown[] }> {
  if (Array.isArray(value)) {
    const records = parseInventoryRecordArray(value, path);
    if (!records.ok) {
      return records;
    }

    return { ok: true, value: { path, records: records.value } };
  }
  if (!isRecord(value)) {
    return validationFailure("Inventory must be an array or object.", { path });
  }

  const keys = allowedKeys(value, INVENTORY_SECTION_KEYS, path);
  if (!keys.ok) {
    return keys;
  }

  const sectionKeys = INVENTORY_SECTION_KEYS.filter((key) => value[key] !== undefined);
  if (sectionKeys.length === 0) {
    return validationFailure("Inventory must include records, files, or entries.", {
      path,
      reason: "missing_inventory",
    });
  }
  if (sectionKeys.length > 1) {
    return validationFailure("Inventory must include only one records, files, or entries section.", {
      path,
      reason: "ambiguous_sections",
    });
  }

  const [sectionKey] = sectionKeys;
  const records = parseInventoryRecordArray(value[sectionKey], `${path}.${sectionKey}`);
  if (!records.ok) {
    return records;
  }

  return { ok: true, value: { path: `${path}.${sectionKey}`, records: records.value } };
}

function parseInventoryRecordArray(
  value: unknown,
  path: string,
): Parsed<readonly unknown[]> {
  if (!Array.isArray(value)) {
    return validationFailure("Inventory records must be an array.", { path });
  }
  if (value.length > MAX_INVENTORY_RECORDS) {
    return validationFailure(`Inventory must include at most ${MAX_INVENTORY_RECORDS} records.`, {
      path,
    });
  }

  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) {
      return validationFailure("Inventory records must be objects.", {
        path: `${path}.${index}`,
      });
    }
  }

  return { ok: true, value };
}

function parseInventoryPolicy(
  body: JsonRecord,
  options: WorkspaceSessionSnapshotRetentionCleanupInventoryRoutesOptions,
): Parsed<{
  readonly path: string;
  readonly policy: WorkspaceSessionSnapshotRetentionCleanupInventoryPolicy;
}> {
  const topLevelPolicyFields = POLICY_KEYS.filter((key) => body[key] !== undefined);
  if (body.policy !== undefined && topLevelPolicyFields.length > 0) {
    return validationFailure("Request body must include only one retention policy section.", {
      path: "body",
      reason: "ambiguous_policy",
    });
  }

  const policyPath = body.policy === undefined ? "body" : "body.policy";
  const policyRecord = body.policy === undefined
    ? pickFields(body, POLICY_KEYS)
    : body.policy;
  if (!isRecord(policyRecord)) {
    return validationFailure("Retention policy must be an object.", { path: policyPath });
  }

  const policyKeys = allowedKeys(policyRecord, POLICY_KEYS, policyPath);
  if (!policyKeys.ok) {
    return policyKeys;
  }

  const maxCount = parseOptionalIntegerInRange(
    policyRecord.maxCount,
    `${policyPath}.maxCount`,
    0,
  );
  if (!maxCount.ok) {
    return maxCount;
  }
  const maxAgeMs = parseOptionalIntegerInRange(
    policyRecord.maxAgeMs,
    `${policyPath}.maxAgeMs`,
    0,
  );
  if (!maxAgeMs.ok) {
    return maxAgeMs;
  }
  const now = parseOptionalTimestamp(policyRecord.now, `${policyPath}.now`);
  if (!now.ok) {
    return now;
  }
  const injectedNow = readInjectedNow(now.value, options.now);
  if (!injectedNow.ok) {
    return injectedNow;
  }

  return {
    ok: true,
    value: {
      path: policyPath,
      policy: optionalFields({
        maxCount: maxCount.value,
        maxAgeMs: maxAgeMs.value,
        now: now.value ?? injectedNow.value,
      }),
    },
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

function validateNoUnsafeInventoryInput(
  value: unknown,
  path: string,
  keyHint = "",
): Parsed<undefined> {
  if (typeof value === "string") {
    const reason = unsafeInventoryReason(value, keyHint);
    if (reason !== undefined) {
      return validationFailure(
        "Workspace session snapshot retention cleanup inventory must not include raw secrets, lock tokens, or local paths.",
        { path, reason },
      );
    }
    return { ok: true, value: undefined };
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const nested = validateNoUnsafeInventoryInput(item, `${path}.${index}`, keyHint);
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
          "Workspace session snapshot retention cleanup inventory must not include raw secrets, lock tokens, or local paths.",
          { path: `${path}.${key}`, reason: "raw_retention_flag" },
        );
      }

      const result = validateNoUnsafeInventoryInput(nested, `${path}.${key}`, key);
      if (!result.ok) {
        return result;
      }
    }
  }

  return { ok: true, value: undefined };
}

function unsafeInventoryReason(value: string, keyHint: string): string | undefined {
  if (isRedactedToken(value) || normalizeToken(keyHint).includes("fingerprint")) {
    return undefined;
  }

  const key = normalizeToken(keyHint);
  if (PATH_FIELD_PATTERN.test(key)) {
    if (RAW_LOCAL_PATH_PATTERN.test(value)) {
      return "raw_local_path";
    }
    if (hasTraversalSegment(value)) {
      return "path_traversal";
    }
    if (!isSafeRelativeOrRedactedPath(value)) {
      return "unsafe_path";
    }
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

function isSafeRelativeOrRedactedPath(value: string): boolean {
  return isRedactedToken(value) || SAFE_RELATIVE_PATH_PATTERN.test(value);
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

function retentionCleanupInventoryResponse(
  callback: () => ApiResponse,
  policyPath: string,
): ApiResponse {
  try {
    return callback();
  } catch (error) {
    return caughtRetentionCleanupInventoryRouteError(error, policyPath);
  }
}

function caughtRetentionCleanupInventoryRouteError(
  error: unknown,
  policyPath: string,
): ApiResponse {
  if (error instanceof LocalWorkspaceSessionSnapshotRetentionError) {
    return validationError(
      error.message,
      routeDetailsForRetentionCleanupInventoryError(error, policyPath),
    );
  }

  if (error instanceof TypeError) {
    return validationError(error.message, { path: "body" });
  }

  return jsonError(
    500,
    "workspace_session_snapshot_retention_cleanup_inventory_route_failed",
    "Workspace session snapshot retention cleanup inventory route failed.",
  );
}

function routeDetailsForRetentionCleanupInventoryError(
  error: LocalWorkspaceSessionSnapshotRetentionError,
  policyPath: string,
): Readonly<Record<string, unknown>> {
  const sdkPath = isRecord(error.details) && typeof error.details.path === "string"
    ? error.details.path
    : undefined;

  return {
    path: routePathForRetentionCleanupInventoryError(error.code, sdkPath, policyPath),
    sdkCode: error.code,
  };
}

function routePathForRetentionCleanupInventoryError(
  code: string,
  sdkPath: string | undefined,
  policyPath: string,
): string {
  if (
    code === LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_ERROR_CODES.INVALID_RETENTION_POLICY &&
    sdkPath !== undefined &&
    sdkPath.length > 0
  ) {
    return `${policyPath}.${sdkPath}`;
  }
  if (
    code === LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_ERROR_CODES.INVALID_INPUT &&
    (sdkPath === undefined || sdkPath.length === 0)
  ) {
    return "body";
  }
  if (sdkPath !== undefined && sdkPath.length > 0) {
    return `body.inventory.${sdkPath}`;
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
    return { ok: false, error: caughtRetentionCleanupInventoryRouteError(error, "body.policy") };
  }
}

function readNow(now: () => Date | string): string {
  const value = now();
  const timestamp = value instanceof Date ? value.toISOString() : value;
  if (typeof timestamp !== "string" || Number.isNaN(Date.parse(timestamp))) {
    throw new TypeError(
      "Workspace session snapshot retention cleanup inventory timestamp source returned an invalid timestamp.",
    );
  }

  return timestamp;
}

function pickFields(
  record: JsonRecord,
  keys: readonly string[],
): JsonRecord {
  return Object.fromEntries(
    keys
      .filter((key) => record[key] !== undefined)
      .map((key) => [key, record[key]]),
  );
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
