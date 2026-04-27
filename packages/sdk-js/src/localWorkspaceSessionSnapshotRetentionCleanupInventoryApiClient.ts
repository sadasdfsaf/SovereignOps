import {
  ApiNetworkError,
  ApiRequestValidationError,
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
  LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_SCHEMA_VERSION,
  type LocalWorkspaceSessionSnapshotRetentionCleanupActionKind,
  type LocalWorkspaceSessionSnapshotRetentionCleanupIssueKind,
  type LocalWorkspaceSessionSnapshotRetentionCleanupPlan,
  type LocalWorkspaceSessionSnapshotRetentionCleanupReason,
  type LocalWorkspaceSessionSnapshotRetentionCleanupSourceKind,
} from "./localWorkspaceSessionSnapshotRetention.ts";

export type LocalWorkspaceSessionSnapshotRetentionCleanupInventoryApiClientOptions =
  SovereignOpsClientOptions;

export interface LocalWorkspaceSessionSnapshotRetentionCleanupInventoryPolicy {
  readonly maxCount?: number;
  readonly maxAgeMs?: number;
  readonly now?: string;
}

export interface LocalWorkspaceSessionSnapshotRetentionCleanupInventorySource {
  readonly entries?: readonly unknown[];
  readonly files?: readonly unknown[];
  readonly records?: readonly unknown[];
}

export interface LocalWorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest {
  readonly inventory?:
    | readonly unknown[]
    | LocalWorkspaceSessionSnapshotRetentionCleanupInventorySource;
  readonly entries?: readonly unknown[];
  readonly files?: readonly unknown[];
  readonly records?: readonly unknown[];
  readonly policy?: LocalWorkspaceSessionSnapshotRetentionCleanupInventoryPolicy;
  readonly maxCount?: number;
  readonly maxAgeMs?: number;
  readonly now?: string;
}

export type LocalWorkspaceSessionSnapshotRetentionCleanupInventoryPreviewResponse =
  LocalWorkspaceSessionSnapshotRetentionCleanupPlan;

type Validator<T> = (value: unknown) => T;

const RETENTION_CLEANUP_INVENTORY_ENDPOINT =
  "workspace-session/snapshot-retention-cleanup/inventory";
const MAX_INVENTORY_RECORDS = 1000;
const PREVIEW_REQUEST_KEYS = Object.freeze([
  "inventory",
  "entries",
  "files",
  "records",
  "policy",
  "maxCount",
  "maxAgeMs",
  "now",
] as const);
const INVENTORY_SECTION_KEYS = Object.freeze([
  "entries",
  "files",
  "records",
] as const);
const POLICY_KEYS = Object.freeze([
  "maxCount",
  "maxAgeMs",
  "now",
] as const);
const ACTION_KINDS = Object.freeze([
  "delete",
  "keep",
  "review",
] as const satisfies readonly LocalWorkspaceSessionSnapshotRetentionCleanupActionKind[]);
const CLEANUP_REASONS = Object.freeze([
  "duplicate-snapshot-id",
  "exceeds-max-age",
  "exceeds-max-count",
  "invalid-metadata",
  "missing-created-at",
  "missing-snapshot-id",
  "path-traversal",
  "raw-lock-token",
  "raw-secret",
  "requires-review",
  "unsafe-absolute-path",
  "within-max-age",
  "within-max-count",
  "within-policy",
] as const satisfies readonly LocalWorkspaceSessionSnapshotRetentionCleanupReason[]);
const CLEANUP_ISSUE_KINDS = Object.freeze([
  "duplicate-snapshot-id",
  "invalid-created-at",
  "invalid-metadata",
  "invalid-snapshot-id",
  "missing-created-at",
  "missing-snapshot-id",
  "path-traversal",
  "raw-lock-token",
  "raw-secret",
  "unsafe-absolute-path",
] as const satisfies readonly LocalWorkspaceSessionSnapshotRetentionCleanupIssueKind[]);
const SOURCE_KINDS = Object.freeze([
  "file-metadata",
  "snapshot-record",
  "snapshot-record-summary",
  "unknown",
] as const satisfies readonly LocalWorkspaceSessionSnapshotRetentionCleanupSourceKind[]);
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SNAPSHOT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,160}$/;
const SHA256_FINGERPRINT_PATTERN = /^sha256:[a-f0-9]{64}$/;
const REDACTED_TOKEN_PATTERN = /^\[redacted(?::[A-Za-z0-9_-]+)*\]$/;
const REDACTED_PATH_PATTERN = /^\[redacted:path:[a-z0-9]+\]$/;
const RAW_LOCK_TOKEN_PATTERN = /^lock_[A-Za-z0-9_-]{4,}$/;
const RAW_LOCAL_PATH_PATTERN =
  /(?:\b[A-Za-z]:[\\/][^\s"',;)}\]]+|\\\\[^\\\s"',;)}\]]+[\\][^\s"',;)}\]]+|file:\/\/[^\s"',;)}\]]+|(?:^|[\s"'(=])\/(?!\/)[^\s"',;)}\]]+)/i;
const SAFE_RELATIVE_PATH_PATTERN =
  /^(?!\/)(?![A-Za-z]:)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\/\/)[A-Za-z0-9._/-]{1,240}$/;
const SECRET_VALUE_PATTERN =
  /\b(?:Bearer\s+[A-Za-z0-9._~+/=-]{8,}|(?:sk|rk|pk|tok|pat|npm|ghp|gho)_[A-Za-z0-9_-]{8,}|(?:sk|rk|pat|glpat|github_pat)-[A-Za-z0-9_-]{8,})\b/i;
const SECRET_ASSIGNMENT_PATTERN =
  /\b(?:api[-_]?key|apikey|authorization|credential|password|passphrase|secret|session[-_]?token|token)\s*[:=]\s*([^\s,;]+)/i;
const SENSITIVE_FIELD_PATTERN =
  /(?:authorization|api[-_]?key|apikey|auth|bearer|cookie|credential|jwt|password|passphrase|private[-_]?key|refresh[-_]?token|secret|session[-_]?token|signing[-_]?key|token)$/i;
const PATH_FIELD_PATTERN =
  /(?:^|_)(?:absolute_path|file_path|path|relative_path|storage_path)$/;

export class LocalWorkspaceSessionSnapshotRetentionCleanupInventoryApiClient {
  readonly #baseUrl: string;
  readonly #fetch: FetchLike;
  readonly #apiKey?: string;
  readonly #headers: Readonly<Record<string, string>>;

  constructor(
    options: LocalWorkspaceSessionSnapshotRetentionCleanupInventoryApiClientOptions,
  ) {
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
    request: LocalWorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest,
  ): Promise<LocalWorkspaceSessionSnapshotRetentionCleanupInventoryPreviewResponse> {
    const body =
      normalizeLocalWorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest(
        request,
      );
    return this.#request(
      `${RETENTION_CLEANUP_INVENTORY_ENDPOINT}/preview`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      parseLocalWorkspaceSessionSnapshotRetentionCleanupInventoryPreviewResponse,
    );
  }

  async previewInventory(
    request: LocalWorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest,
  ): Promise<LocalWorkspaceSessionSnapshotRetentionCleanupInventoryPreviewResponse> {
    return this.preview(request);
  }

  async retentionCleanupInventoryPreview(
    request: LocalWorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest,
  ): Promise<LocalWorkspaceSessionSnapshotRetentionCleanupInventoryPreviewResponse> {
    return this.preview(request);
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

export function createLocalWorkspaceSessionSnapshotRetentionCleanupInventoryApiClient(
  options: LocalWorkspaceSessionSnapshotRetentionCleanupInventoryApiClientOptions,
): LocalWorkspaceSessionSnapshotRetentionCleanupInventoryApiClient {
  return new LocalWorkspaceSessionSnapshotRetentionCleanupInventoryApiClient(options);
}

export async function previewLocalWorkspaceSessionSnapshotRetentionCleanupInventoryViaApi(
  options: LocalWorkspaceSessionSnapshotRetentionCleanupInventoryApiClientOptions,
  request: LocalWorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest,
): Promise<LocalWorkspaceSessionSnapshotRetentionCleanupInventoryPreviewResponse> {
  return createLocalWorkspaceSessionSnapshotRetentionCleanupInventoryApiClient(
    options,
  ).preview(request);
}

export function normalizeLocalWorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest(
  request: LocalWorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest,
): JsonValue {
  const issues: ValidationIssue[] = [];
  if (!isRecord(request)) {
    throw new ApiRequestValidationError(
      "local workspace session snapshot retention cleanup inventory preview request is invalid",
      [{ path: "request", message: "request must be an object" }],
    );
  }

  collectAllowedKeys(request, "request", PREVIEW_REQUEST_KEYS, issues);
  collectJsonIssues(request, "request", issues);
  collectInventorySourceIssues(request, issues);
  collectInventoryPolicyIssues(request, issues);
  collectUnsafeRetentionCleanupInventoryIssues(request, "request", issues);

  if (issues.length > 0) {
    throw new ApiRequestValidationError(
      "local workspace session snapshot retention cleanup inventory preview request is invalid",
      issues,
    );
  }

  return deepFreezeClone(deepJsonClone(request)) as JsonValue;
}

function parseLocalWorkspaceSessionSnapshotRetentionCleanupInventoryPreviewResponse(
  value: unknown,
): LocalWorkspaceSessionSnapshotRetentionCleanupInventoryPreviewResponse {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw new ApiResponseValidationError([
      { path: "", message: "response must be an object" },
    ], value);
  }

  requireLiteral(
    value,
    "kind",
    "kind",
    "localWorkspaceSessionSnapshotRetentionCleanupPlan",
    issues,
  );
  requireLiteral(
    value,
    "schemaVersion",
    "schemaVersion",
    LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_SCHEMA_VERSION,
    issues,
  );
  requireTrue(value, "localOnly", "localOnly", issues);
  requireTrue(value, "dryRun", "dryRun", issues);
  requireFalse(value, "durableWrites", "durableWrites", issues);
  collectThresholdIssues(value.thresholds, "thresholds", issues);
  requireNonNegativeInteger(value, "entryCount", "entryCount", issues);
  requireNonNegativeInteger(value, "keepCount", "keepCount", issues);
  requireNonNegativeInteger(value, "deleteCount", "deleteCount", issues);
  requireNonNegativeInteger(value, "reviewCount", "reviewCount", issues);
  collectActionArrayIssues(value.actions, "actions", issues);
  collectActionArrayIssues(value.keepActions, "keepActions", issues, "keep");
  collectActionArrayIssues(value.deleteActions, "deleteActions", issues, "delete");
  collectActionArrayIssues(value.reviewActions, "reviewActions", issues, "review");
  collectPlanCountIssues(value, issues);
  throwResponseIssues(issues, value);

  return deepFreezeClone(
    value,
  ) as LocalWorkspaceSessionSnapshotRetentionCleanupInventoryPreviewResponse;
}

function collectInventorySourceIssues(
  request: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
): void {
  const present = [
    request.inventory === undefined ? undefined : "inventory",
    request.entries === undefined ? undefined : "entries",
    request.files === undefined ? undefined : "files",
    request.records === undefined ? undefined : "records",
  ].filter((field): field is string => field !== undefined);

  if (present.length !== 1) {
    issues.push({
      path: "request",
      message: "request must include exactly one inventory, entries, files, or records source",
    });
    return;
  }

  const [source] = present;
  if (source === "inventory") {
    collectInventoryValueIssues(request.inventory, "request.inventory", issues);
    return;
  }

  collectInventoryRecordArrayIssues(request[source], `request.${source}`, issues);
}

function collectInventoryValueIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (Array.isArray(value)) {
    collectInventoryRecordArrayIssues(value, path, issues);
    return;
  }
  if (!isRecord(value)) {
    issues.push({ path, message: "inventory must be an array or object" });
    return;
  }

  collectAllowedKeys(value, path, INVENTORY_SECTION_KEYS, issues);
  const present = INVENTORY_SECTION_KEYS.filter((key) => value[key] !== undefined);
  if (present.length !== 1) {
    issues.push({
      path,
      message: "inventory must include exactly one entries, files, or records section",
    });
    return;
  }

  const [section] = present;
  collectInventoryRecordArrayIssues(value[section], `${path}.${section}`, issues);
}

function collectInventoryRecordArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "inventory records must be an array" });
    return;
  }
  if (value.length > MAX_INVENTORY_RECORDS) {
    issues.push({
      path,
      message: `inventory must include at most ${MAX_INVENTORY_RECORDS} records`,
    });
  }

  value.forEach((record, index) => {
    if (!isRecord(record)) {
      issues.push({
        path: `${path}.${index}`,
        message: "inventory records must be objects",
      });
    }
  });
}

function collectInventoryPolicyIssues(
  request: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
): void {
  const topLevelPolicyFields = POLICY_KEYS.filter((key) => request[key] !== undefined);
  if (request.policy !== undefined && topLevelPolicyFields.length > 0) {
    issues.push({
      path: "request",
      message: "request must include only one policy section",
    });
  }

  const policyPath = request.policy === undefined ? "request" : "request.policy";
  const policy = request.policy === undefined
    ? pickFields(request, POLICY_KEYS)
    : request.policy;
  if (!isRecord(policy)) {
    issues.push({ path: policyPath, message: "policy must be an object" });
    return;
  }

  collectAllowedKeys(policy, policyPath, POLICY_KEYS, issues);
  requireOptionalNonNegativeInteger(policy.maxCount, `${policyPath}.maxCount`, issues);
  requireOptionalNonNegativeInteger(policy.maxAgeMs, `${policyPath}.maxAgeMs`, issues);
  requireOptionalIsoTimestamp(policy.now, `${policyPath}.now`, issues);
}

function collectThresholdIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "thresholds must be an object" });
    return;
  }

  requireOptionalNonNegativeInteger(value.maxCount, joinPath(path, "maxCount"), issues);
  requireOptionalNonNegativeInteger(value.maxAgeMs, joinPath(path, "maxAgeMs"), issues);
  requireOptionalIsoTimestamp(value.now, joinPath(path, "now"), issues);
  requireOptionalIsoTimestamp(value.cutoffAt, joinPath(path, "cutoffAt"), issues);
}

function collectPlanCountIssues(
  value: Readonly<Record<string, unknown>>,
  issues: ValidationIssue[],
): void {
  collectArrayCountIssue(
    value,
    "actions",
    "entryCount",
    "entryCount",
    issues,
  );
  collectArrayCountIssue(
    value,
    "keepActions",
    "keepCount",
    "keepCount",
    issues,
  );
  collectArrayCountIssue(
    value,
    "deleteActions",
    "deleteCount",
    "deleteCount",
    issues,
  );
  collectArrayCountIssue(
    value,
    "reviewActions",
    "reviewCount",
    "reviewCount",
    issues,
  );
}

function collectArrayCountIssue(
  value: Readonly<Record<string, unknown>>,
  arrayKey: string,
  countKey: string,
  path: string,
  issues: ValidationIssue[],
): void {
  const count = value[countKey];
  const array = value[arrayKey];
  if (
    Number.isSafeInteger(count) &&
    Array.isArray(array) &&
    (count as number) !== array.length
  ) {
    issues.push({
      path,
      message: `${countKey} must match ${arrayKey}.length`,
    });
  }
}

function collectActionArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  expectedAction?: LocalWorkspaceSessionSnapshotRetentionCleanupActionKind,
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "actions must be an array" });
    return;
  }

  value.forEach((action, index) =>
    collectActionIssues(action, `${path}.${index}`, issues, expectedAction)
  );
}

function collectActionIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  expectedAction?: LocalWorkspaceSessionSnapshotRetentionCleanupActionKind,
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "cleanup action must be an object" });
    return;
  }

  requireLiteral(
    value,
    "kind",
    joinPath(path, "kind"),
    "localWorkspaceSessionSnapshotRetentionCleanupAction",
    issues,
  );
  requireAllowedValue(value.action, joinPath(path, "action"), ACTION_KINDS, issues);
  if (expectedAction !== undefined && value.action !== expectedAction) {
    issues.push({
      path: joinPath(path, "action"),
      message: `action must be ${expectedAction}`,
    });
  }
  collectReasonArrayIssues(value.reasons, joinPath(path, "reasons"), issues);
  requireNonNegativeInteger(value, "sourceIndex", joinPath(path, "sourceIndex"), issues);
  if (value.rank === undefined) {
    if (value.action === "keep" || value.action === "delete") {
      issues.push({
        path: joinPath(path, "rank"),
        message: "rank must be present for keep and delete actions",
      });
    }
  } else {
    requirePositiveInteger(value, "rank", joinPath(path, "rank"), issues);
    if (value.action === "review") {
      issues.push({
        path: joinPath(path, "rank"),
        message: "rank must be omitted for review actions",
      });
    }
  }
  collectSummaryIssues(value.summary, joinPath(path, "summary"), issues);
  collectIssueArrayIssues(value.issues, joinPath(path, "issues"), issues);
}

function collectSummaryIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "cleanup summary must be an object" });
    return;
  }

  requireLiteral(
    value,
    "kind",
    joinPath(path, "kind"),
    "localWorkspaceSessionSnapshotRetentionCleanupSummary",
    issues,
  );
  requireAllowedValue(value.sourceKind, joinPath(path, "sourceKind"), SOURCE_KINDS, issues);
  requireTrue(value, "auditSafe", joinPath(path, "auditSafe"), issues);
  requireTrue(value, "redacted", joinPath(path, "redacted"), issues);
  requireOptionalPattern(
    value,
    "snapshotId",
    joinPath(path, "snapshotId"),
    SNAPSHOT_ID_PATTERN,
    issues,
  );
  requireOptionalPattern(value, "workspaceId", joinPath(path, "workspaceId"), ID_PATTERN, issues);
  requireOptionalPattern(value, "deviceId", joinPath(path, "deviceId"), ID_PATTERN, issues);
  requireOptionalPattern(value, "sessionId", joinPath(path, "sessionId"), ID_PATTERN, issues);
  requireOptionalNonEmptyString(value, "label", joinPath(path, "label"), issues);
  requireOptionalIsoTimestamp(value.createdAt, joinPath(path, "createdAt"), issues);
  requireOptionalIsoTimestamp(value.updatedAt, joinPath(path, "updatedAt"), issues);
  requireOptionalSafeInteger(value.ageMs, joinPath(path, "ageMs"), issues);
  requireOptionalPattern(value, "fileRef", joinPath(path, "fileRef"), REDACTED_PATH_PATTERN, issues);
  if (value.filePathKind !== undefined) {
    requireAllowedValue(
      value.filePathKind,
      joinPath(path, "filePathKind"),
      ["absolute", "relative"] as const,
      issues,
    );
  }
  requireOptionalNonNegativeInteger(value.sizeBytes, joinPath(path, "sizeBytes"), issues);
  requireOptionalPattern(
    value,
    "fingerprint",
    joinPath(path, "fingerprint"),
    SHA256_FINGERPRINT_PATTERN,
    issues,
  );
  requireOptionalPattern(
    value,
    "snapshotFingerprint",
    joinPath(path, "snapshotFingerprint"),
    SHA256_FINGERPRINT_PATTERN,
    issues,
  );
  requireOptionalNonNegativeInteger(
    value.operationCount,
    joinPath(path, "operationCount"),
    issues,
  );
}

function collectIssueArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "issues must be an array" });
    return;
  }

  value.forEach((issue, index) =>
    collectIssueIssues(issue, `${path}.${index}`, issues)
  );
}

function collectIssueIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "cleanup issue must be an object" });
    return;
  }

  requireLiteral(
    value,
    "kind",
    joinPath(path, "kind"),
    "localWorkspaceSessionSnapshotRetentionCleanupIssue",
    issues,
  );
  requireAllowedValue(
    value.issueKind,
    joinPath(path, "issueKind"),
    CLEANUP_ISSUE_KINDS,
    issues,
  );
  requireNonEmptyString(value, "path", joinPath(path, "path"), issues);
  requireAllowedValue(value.reason, joinPath(path, "reason"), CLEANUP_REASONS, issues);
  requireNonEmptyString(value, "message", joinPath(path, "message"), issues);
}

function collectReasonArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "reasons must be an array" });
    return;
  }
  if (value.length === 0) {
    issues.push({ path, message: "reasons must not be empty" });
  }

  value.forEach((reason, index) =>
    requireAllowedValue(reason, `${path}.${index}`, CLEANUP_REASONS, issues)
  );
}

function collectAllowedKeys(
  value: Readonly<Record<string, unknown>>,
  path: string,
  allowed: readonly string[],
  issues: ValidationIssue[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      issues.push({ path: joinPath(path, key), message: "unexpected field" });
    }
  }
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

function collectUnsafeRetentionCleanupInventoryIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  keyHint = "",
  seen: WeakSet<object> = new WeakSet<object>(),
): void {
  if (typeof value === "string") {
    const reason = unsafeRetentionCleanupInventoryReason(value, keyHint);
    if (reason !== undefined) {
      issues.push({
        path,
        message: "workspace session snapshot retention cleanup inventory input must not include raw secrets, lock tokens, or local paths",
      });
    }
    return;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
    value.forEach((item, index) =>
      collectUnsafeRetentionCleanupInventoryIssues(
        item,
        `${path}.${index}`,
        issues,
        keyHint,
        seen,
      )
    );
    seen.delete(value);
    return;
  }

  if (isRecord(value)) {
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
    for (const [key, nested] of Object.entries(value)) {
      if (unsafeRetentionCleanupInventoryReason(key, "") !== undefined) {
        issues.push({
          path: joinPath(path, key),
          message: "workspace session snapshot retention cleanup inventory input must not include raw secrets, lock tokens, or local paths",
        });
        continue;
      }

      const token = normalizeToken(key);
      if (isRawRetentionFlag(token, nested)) {
        issues.push({
          path: joinPath(path, key),
          message: "workspace session snapshot retention cleanup inventory input must not include raw secrets, lock tokens, or local paths",
        });
        continue;
      }

      collectUnsafeRetentionCleanupInventoryIssues(
        nested,
        joinPath(path, key),
        issues,
        key,
        seen,
      );
    }
    seen.delete(value);
  }
}

function unsafeRetentionCleanupInventoryReason(
  value: string,
  keyHint: string,
): string | undefined {
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
  if (typeof record[key] !== "string" || (record[key] as string).trim().length === 0) {
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
  if (value !== undefined && (typeof value !== "string" || value.trim().length === 0)) {
    issues.push({ path, message: `${key} must be a non-empty string when provided` });
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

function requirePositiveInteger(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): void {
  const value = record[key];
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    issues.push({ path, message: `${key} must be a positive safe integer` });
  }
}

function requireOptionalNonNegativeInteger(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || (value as number) < 0)) {
    issues.push({ path, message: "value must be a non-negative safe integer when provided" });
  }
}

function requireOptionalSafeInteger(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value !== undefined && !Number.isSafeInteger(value)) {
    issues.push({ path, message: "value must be a safe integer when provided" });
  }
}

function requireOptionalIsoTimestamp(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value !== undefined && (typeof value !== "string" || !isIsoTimestamp(value))) {
    issues.push({ path, message: "value must be an ISO timestamp when provided" });
  }
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

function throwResponseIssues(issues: readonly ValidationIssue[], body: unknown): void {
  if (issues.length > 0) {
    throw new ApiResponseValidationError(issues, body);
  }
}

function isIsoTimestamp(value: string): boolean {
  if (!ISO_TIMESTAMP_PATTERN.test(value)) {
    return false;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function hasTraversalSegment(value: string): boolean {
  return value
    .replace(/\\/g, "/")
    .split("/")
    .includes("..");
}

function isSafeRelativeOrRedactedPath(value: string): boolean {
  return isRedactedToken(value) || SAFE_RELATIVE_PATH_PATTERN.test(value);
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

function pickFields(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    keys
      .filter((key) => record[key] !== undefined)
      .map((key) => [key, record[key]]),
  );
}

function hasHeader(headers: Readonly<Record<string, string>>, name: string): boolean {
  const normalized = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === normalized);
}

function joinPath(parent: string, child: string): string {
  const safeChild = safePathSegment(child);
  if (parent.length === 0) {
    return safeChild;
  }
  if (safeChild.length === 0) {
    return parent;
  }
  return `${parent}.${safeChild}`;
}

function safePathSegment(segment: string): string {
  if (
    /^[A-Za-z0-9_$-]+$/.test(segment) &&
    unsafeRetentionCleanupInventoryReason(segment, "") === undefined
  ) {
    return segment;
  }

  return "[unsafe-field]";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
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
