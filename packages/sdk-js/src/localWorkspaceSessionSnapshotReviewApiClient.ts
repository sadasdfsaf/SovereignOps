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
import { WORKSPACE_SESSION_API_SCHEMA_VERSION } from "./localWorkspaceSessionApiClient.ts";
import {
  WORKSPACE_SESSION_SNAPSHOT_API_SCHEMA_VERSION,
  type LocalWorkspaceSessionSnapshotCreateResponse,
  type LocalWorkspaceSessionSnapshotGetResponse,
  type LocalWorkspaceSessionSnapshotPreviewResponse,
  type LocalWorkspaceSessionSnapshotRecord,
} from "./localWorkspaceSessionSnapshotApiClient.ts";

export type LocalWorkspaceSessionSnapshotReviewApiClientOptions =
  SovereignOpsClientOptions;

export const WORKSPACE_SESSION_SNAPSHOT_REVIEW_API_SCHEMA_VERSION =
  "workspace-session-snapshot-review/v1";

export interface LocalWorkspaceSessionSnapshotReviewBoundaryEnvelope {
  readonly record?: JsonValue | LocalWorkspaceSessionSnapshotRecord;
  readonly preview?: JsonValue | LocalWorkspaceSessionSnapshotPreviewResponse;
  readonly snapshot?: JsonValue | LocalWorkspaceSessionSnapshotPreviewResponse;
}

export type LocalWorkspaceSessionSnapshotReviewBoundary =
  | LocalWorkspaceSessionSnapshotPreviewResponse
  | LocalWorkspaceSessionSnapshotRecord
  | LocalWorkspaceSessionSnapshotCreateResponse
  | LocalWorkspaceSessionSnapshotGetResponse
  | (JsonObject & LocalWorkspaceSessionSnapshotReviewBoundaryEnvelope);

export interface LocalWorkspaceSessionSnapshotReviewCompareRequest {
  readonly baseline: LocalWorkspaceSessionSnapshotReviewBoundary;
  readonly candidate: LocalWorkspaceSessionSnapshotReviewBoundary;
}

export interface LocalWorkspaceSessionSnapshotReviewBoundarySummary {
  readonly fingerprint: string;
  readonly snapshotId?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly workspaceId: string;
  readonly deviceId: string;
  readonly sessionId: string;
  readonly operations: readonly string[];
  readonly auditActions: readonly string[];
  readonly eventCount: number;
  readonly auditRecordCount: number;
}

export interface LocalWorkspaceSessionSnapshotReviewComparableEvent {
  readonly key: string;
  readonly eventId: string;
  readonly operation: string;
  readonly sequence?: number;
  readonly createdAt?: string;
  readonly fingerprint: string;
}

export interface LocalWorkspaceSessionSnapshotReviewComparableAuditRecord {
  readonly key: string;
  readonly auditId: string;
  readonly action: string;
  readonly createdAt?: string;
  readonly fingerprint: string;
}

export interface LocalWorkspaceSessionSnapshotReviewChangedItem<TItem> {
  readonly key: string;
  readonly baseline: TItem;
  readonly candidate: TItem;
}

export interface LocalWorkspaceSessionSnapshotReviewCompareResponse {
  readonly kind: "workspace-session.snapshot-review.compare";
  readonly schemaVersion: typeof WORKSPACE_SESSION_SNAPSHOT_REVIEW_API_SCHEMA_VERSION;
  readonly storeSchemaVersion: typeof WORKSPACE_SESSION_SNAPSHOT_API_SCHEMA_VERSION;
  readonly apiSchemaVersion: typeof WORKSPACE_SESSION_API_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly durableWrites: false;
  readonly redacted: true;
  readonly fingerprint: string;
  readonly equivalent: boolean;
  readonly baseline: LocalWorkspaceSessionSnapshotReviewBoundarySummary;
  readonly candidate: LocalWorkspaceSessionSnapshotReviewBoundarySummary;
  readonly summary: {
    readonly fingerprintMatch: boolean;
    readonly workspaceMatch: boolean;
    readonly deviceMatch: boolean;
    readonly sessionMatch: boolean;
    readonly baselineEventCount: number;
    readonly candidateEventCount: number;
    readonly unchangedEventCount: number;
    readonly addedEventCount: number;
    readonly removedEventCount: number;
    readonly changedEventCount: number;
    readonly baselineAuditRecordCount: number;
    readonly candidateAuditRecordCount: number;
    readonly unchangedAuditRecordCount: number;
    readonly addedAuditRecordCount: number;
    readonly removedAuditRecordCount: number;
    readonly changedAuditRecordCount: number;
  };
  readonly differences: {
    readonly events: {
      readonly added: readonly LocalWorkspaceSessionSnapshotReviewComparableEvent[];
      readonly removed: readonly LocalWorkspaceSessionSnapshotReviewComparableEvent[];
      readonly changed: readonly LocalWorkspaceSessionSnapshotReviewChangedItem<
        LocalWorkspaceSessionSnapshotReviewComparableEvent
      >[];
    };
    readonly auditRecords: {
      readonly added: readonly LocalWorkspaceSessionSnapshotReviewComparableAuditRecord[];
      readonly removed: readonly LocalWorkspaceSessionSnapshotReviewComparableAuditRecord[];
      readonly changed: readonly LocalWorkspaceSessionSnapshotReviewChangedItem<
        LocalWorkspaceSessionSnapshotReviewComparableAuditRecord
      >[];
    };
  };
}

export interface LocalWorkspaceSessionSnapshotReviewRetentionPolicy {
  readonly retainNewest?: number;
  readonly retainSnapshotIds?: readonly string[];
  readonly deleteBefore?: string;
}

export interface LocalWorkspaceSessionSnapshotReviewRetentionPreviewRequest {
  readonly snapshots: readonly LocalWorkspaceSessionSnapshotRecord[];
  readonly policy?: LocalWorkspaceSessionSnapshotReviewRetentionPolicy;
}

export interface LocalWorkspaceSessionSnapshotReviewRetentionDecision {
  readonly snapshotId: string;
  readonly fingerprint: string;
  readonly snapshotFingerprint: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly workspaceId: string;
  readonly deviceId: string;
  readonly sessionId: string;
  readonly eventCount: number;
  readonly auditRecordCount: number;
  readonly newestRank: number;
  readonly retain: boolean;
  readonly plannedAction: "retain" | "expire";
  readonly reasonCodes: readonly string[];
}

export interface LocalWorkspaceSessionSnapshotReviewRetentionPreviewResponse {
  readonly kind: "workspace-session.snapshot-review.retention-preview";
  readonly schemaVersion: typeof WORKSPACE_SESSION_SNAPSHOT_REVIEW_API_SCHEMA_VERSION;
  readonly storeSchemaVersion: typeof WORKSPACE_SESSION_SNAPSHOT_API_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly durableWrites: false;
  readonly redacted: true;
  readonly fingerprint: string;
  readonly policy: {
    readonly retainNewest?: number;
    readonly retainSnapshotIds: readonly string[];
    readonly deleteBefore?: string;
  };
  readonly summary: {
    readonly totalSnapshotCount: number;
    readonly retainedSnapshotCount: number;
    readonly expiredSnapshotCount: number;
    readonly pinnedSnapshotCount: number;
  };
  readonly snapshots: readonly LocalWorkspaceSessionSnapshotReviewRetentionDecision[];
}

type Validator<T> = (value: unknown) => T;

const REVIEW_ENDPOINT = "workspace-session/snapshot-review";
const MAX_RETENTION_SNAPSHOTS = 500;
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
const COMPARE_REQUEST_KEYS = Object.freeze(["baseline", "candidate"] as const);
const RETENTION_PREVIEW_REQUEST_KEYS = Object.freeze(["snapshots", "policy"] as const);
const RETENTION_POLICY_KEYS = Object.freeze([
  "retainNewest",
  "retainSnapshotIds",
  "deleteBefore",
] as const);
const SENSITIVE_FIELD_PATTERN =
  /(?:authorization|api[-_]?key|apikey|auth|bearer|cookie|credential|jwt|password|passphrase|private[-_]?key|refresh[-_]?token|secret|session[-_]?token|signing[-_]?key|token)$/i;
const SECRET_VALUE_PATTERN =
  /\b(?:Bearer\s+[A-Za-z0-9._~+/=-]{8,}|(?:sk|rk|pk|tok|pat|npm|ghp|gho)_[A-Za-z0-9_-]{8,}|(?:sk|rk|pat|glpat|github_pat)-[A-Za-z0-9_-]{8,})\b/i;
const SECRET_ASSIGNMENT_PATTERN =
  /\b(?:api[-_]?key|apikey|authorization|credential|password|passphrase|secret|session[-_]?token|token)\s*[:=]\s*([^\s,;]+)/i;
const RAW_LOCAL_PATH_PATTERN =
  /(?:\b[A-Za-z]:[\\/][^\s"',;)}\]]+|\\\\[^\\\s"',;)}\]]+[\\][^\s"',;)}\]]+|\b(?:\/Users|\/home|\/var|\/tmp|\/private|\/mnt|\/Volumes)\/[^\s"',;)}\]]+)/;

export class LocalWorkspaceSessionSnapshotReviewApiClient {
  readonly #baseUrl: string;
  readonly #fetch: FetchLike;
  readonly #apiKey?: string;
  readonly #headers: Readonly<Record<string, string>>;

  constructor(options: LocalWorkspaceSessionSnapshotReviewApiClientOptions) {
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

  async compare(
    request: LocalWorkspaceSessionSnapshotReviewCompareRequest,
  ): Promise<LocalWorkspaceSessionSnapshotReviewCompareResponse> {
    const body = normalizeLocalWorkspaceSessionSnapshotReviewCompareRequest(request);
    return this.#request(
      `${REVIEW_ENDPOINT}/compare`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      parseLocalWorkspaceSessionSnapshotReviewCompareResponse,
    );
  }

  async compareSnapshots(
    request: LocalWorkspaceSessionSnapshotReviewCompareRequest,
  ): Promise<LocalWorkspaceSessionSnapshotReviewCompareResponse> {
    return this.compare(request);
  }

  async retentionPreview(
    request: LocalWorkspaceSessionSnapshotReviewRetentionPreviewRequest,
  ): Promise<LocalWorkspaceSessionSnapshotReviewRetentionPreviewResponse> {
    const body = normalizeLocalWorkspaceSessionSnapshotReviewRetentionPreviewRequest(
      request,
    );
    return this.#request(
      `${REVIEW_ENDPOINT}/retention-preview`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      parseLocalWorkspaceSessionSnapshotReviewRetentionPreviewResponse,
    );
  }

  async previewRetention(
    request: LocalWorkspaceSessionSnapshotReviewRetentionPreviewRequest,
  ): Promise<LocalWorkspaceSessionSnapshotReviewRetentionPreviewResponse> {
    return this.retentionPreview(request);
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

export function createLocalWorkspaceSessionSnapshotReviewApiClient(
  options: LocalWorkspaceSessionSnapshotReviewApiClientOptions,
): LocalWorkspaceSessionSnapshotReviewApiClient {
  return new LocalWorkspaceSessionSnapshotReviewApiClient(options);
}

export async function compareLocalWorkspaceSessionSnapshotsViaApi(
  options: LocalWorkspaceSessionSnapshotReviewApiClientOptions,
  request: LocalWorkspaceSessionSnapshotReviewCompareRequest,
): Promise<LocalWorkspaceSessionSnapshotReviewCompareResponse> {
  return createLocalWorkspaceSessionSnapshotReviewApiClient(options).compare(request);
}

export async function previewLocalWorkspaceSessionSnapshotRetentionViaApi(
  options: LocalWorkspaceSessionSnapshotReviewApiClientOptions,
  request: LocalWorkspaceSessionSnapshotReviewRetentionPreviewRequest,
): Promise<LocalWorkspaceSessionSnapshotReviewRetentionPreviewResponse> {
  return createLocalWorkspaceSessionSnapshotReviewApiClient(options).retentionPreview(request);
}

export function normalizeLocalWorkspaceSessionSnapshotReviewCompareRequest(
  request: LocalWorkspaceSessionSnapshotReviewCompareRequest,
): JsonValue {
  const issues: ValidationIssue[] = [];
  if (!isRecord(request)) {
    throw new ApiRequestValidationError(
      "local workspace session snapshot review compare request is invalid",
      [{ path: "request", message: "request must be an object" }],
    );
  }

  collectAllowedKeys(request, "request", COMPARE_REQUEST_KEYS, issues);
  collectJsonIssues(request, "request", issues);
  collectUnsafeRetentionIssues(request, "request", issues);
  collectSnapshotBoundaryIssues(request.baseline, "request.baseline", issues);
  collectSnapshotBoundaryIssues(request.candidate, "request.candidate", issues);

  if (issues.length > 0) {
    throw new ApiRequestValidationError(
      "local workspace session snapshot review compare request is invalid",
      issues,
    );
  }

  return deepFreezeClone(deepJsonClone(request)) as JsonValue;
}

export function normalizeLocalWorkspaceSessionSnapshotReviewRetentionPreviewRequest(
  request: LocalWorkspaceSessionSnapshotReviewRetentionPreviewRequest,
): JsonValue {
  const issues: ValidationIssue[] = [];
  if (!isRecord(request)) {
    throw new ApiRequestValidationError(
      "local workspace session snapshot review retention-preview request is invalid",
      [{ path: "request", message: "request must be an object" }],
    );
  }

  collectAllowedKeys(request, "request", RETENTION_PREVIEW_REQUEST_KEYS, issues);
  collectJsonIssues(request, "request", issues);
  collectUnsafeRetentionIssues(request, "request", issues);
  if (!Array.isArray(request.snapshots)) {
    issues.push({ path: "request.snapshots", message: "snapshots must be an array" });
  } else {
    if (request.snapshots.length > MAX_RETENTION_SNAPSHOTS) {
      issues.push({
        path: "request.snapshots",
        message: `snapshots must include at most ${MAX_RETENTION_SNAPSHOTS} records`,
      });
    }
    const seen = new Set<string>();
    request.snapshots.forEach((snapshot, index) => {
      const path = `request.snapshots.${index}`;
      collectSnapshotRecordIssues(snapshot, path, issues);
      if (isRecord(snapshot) && typeof snapshot.snapshotId === "string") {
        if (seen.has(snapshot.snapshotId)) {
          issues.push({
            path: `${path}.snapshotId`,
            message: "snapshots must not include duplicate snapshotIds",
          });
        }
        seen.add(snapshot.snapshotId);
      }
    });
  }
  if (request.policy !== undefined) {
    collectRetentionPolicyIssues(request.policy, "request.policy", issues);
  }

  if (issues.length > 0) {
    throw new ApiRequestValidationError(
      "local workspace session snapshot review retention-preview request is invalid",
      issues,
    );
  }

  return deepFreezeClone(deepJsonClone(request)) as JsonValue;
}

function parseLocalWorkspaceSessionSnapshotReviewCompareResponse(
  value: unknown,
): LocalWorkspaceSessionSnapshotReviewCompareResponse {
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
    "workspace-session.snapshot-review.compare",
    issues,
  );
  requireLiteral(
    value,
    "schemaVersion",
    "schemaVersion",
    WORKSPACE_SESSION_SNAPSHOT_REVIEW_API_SCHEMA_VERSION,
    issues,
  );
  requireLiteral(
    value,
    "storeSchemaVersion",
    "storeSchemaVersion",
    WORKSPACE_SESSION_SNAPSHOT_API_SCHEMA_VERSION,
    issues,
  );
  requireLiteral(
    value,
    "apiSchemaVersion",
    "apiSchemaVersion",
    WORKSPACE_SESSION_API_SCHEMA_VERSION,
    issues,
  );
  requireTrue(value, "localOnly", "localOnly", issues);
  requireFalse(value, "durableWrites", "durableWrites", issues);
  requireTrue(value, "redacted", "redacted", issues);
  requirePattern(value, "fingerprint", "fingerprint", SHA256_FINGERPRINT_PATTERN, issues);
  if (typeof value.equivalent !== "boolean") {
    issues.push({ path: "equivalent", message: "equivalent must be a boolean" });
  }
  collectReviewBoundarySummaryIssues(value.baseline, "baseline", issues);
  collectReviewBoundarySummaryIssues(value.candidate, "candidate", issues);
  collectCompareSummaryIssues(value.summary, "summary", issues);
  collectCompareDifferencesIssues(value.differences, "differences", issues);
  throwResponseIssues(issues, value);

  return deepFreezeClone(value) as LocalWorkspaceSessionSnapshotReviewCompareResponse;
}

function parseLocalWorkspaceSessionSnapshotReviewRetentionPreviewResponse(
  value: unknown,
): LocalWorkspaceSessionSnapshotReviewRetentionPreviewResponse {
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
    "workspace-session.snapshot-review.retention-preview",
    issues,
  );
  requireLiteral(
    value,
    "schemaVersion",
    "schemaVersion",
    WORKSPACE_SESSION_SNAPSHOT_REVIEW_API_SCHEMA_VERSION,
    issues,
  );
  requireLiteral(
    value,
    "storeSchemaVersion",
    "storeSchemaVersion",
    WORKSPACE_SESSION_SNAPSHOT_API_SCHEMA_VERSION,
    issues,
  );
  requireTrue(value, "localOnly", "localOnly", issues);
  requireFalse(value, "durableWrites", "durableWrites", issues);
  requireTrue(value, "redacted", "redacted", issues);
  requirePattern(value, "fingerprint", "fingerprint", SHA256_FINGERPRINT_PATTERN, issues);
  collectRetentionPolicyResponseIssues(value.policy, "policy", issues);
  collectRetentionSummaryIssues(value.summary, "summary", issues);
  if (!Array.isArray(value.snapshots)) {
    issues.push({ path: "snapshots", message: "snapshots must be an array" });
  } else {
    value.snapshots.forEach((snapshot, index) =>
      collectRetentionDecisionIssues(snapshot, `snapshots.${index}`, issues)
    );
    if (
      isRecord(value.summary) &&
      Number.isSafeInteger(value.summary.totalSnapshotCount) &&
      value.summary.totalSnapshotCount !== value.snapshots.length
    ) {
      issues.push({
        path: "summary.totalSnapshotCount",
        message: "totalSnapshotCount must match snapshots length",
      });
    }
  }
  throwResponseIssues(issues, value);

  return deepFreezeClone(value) as LocalWorkspaceSessionSnapshotReviewRetentionPreviewResponse;
}

function collectSnapshotBoundaryIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "snapshot boundary must be an object" });
    return;
  }

  if (value.kind === "workspace-session.snapshot-record") {
    collectSnapshotRecordIssues(value, path, issues);
    return;
  }

  if (value.kind === "workspace-session.snapshot-preview") {
    collectSnapshotPreviewIssues(value, path, issues);
    return;
  }

  if (value.record !== undefined) {
    collectSnapshotBoundaryIssues(value.record, joinPath(path, "record"), issues);
    return;
  }
  if (value.preview !== undefined) {
    collectSnapshotBoundaryIssues(value.preview, joinPath(path, "preview"), issues);
    return;
  }
  if (value.snapshot !== undefined) {
    collectSnapshotBoundaryIssues(value.snapshot, joinPath(path, "snapshot"), issues);
    return;
  }

  issues.push({
    path,
    message: "snapshot boundary must be a workspace session snapshot preview or record",
  });
}

function collectSnapshotRecordIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "snapshot record must be an object" });
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
  requirePattern(value, "snapshotId", joinPath(path, "snapshotId"), SNAPSHOT_ID_PATTERN, issues);
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
    isIsoTimestamp(value.createdAt) &&
    isIsoTimestamp(value.updatedAt) &&
    Date.parse(value.updatedAt) < Date.parse(value.createdAt)
  ) {
    issues.push({
      path: joinPath(path, "updatedAt"),
      message: "updatedAt must be after or equal to createdAt",
    });
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

function collectSnapshotPreviewIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "snapshot preview must be an object" });
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
    issues.push({ path, message: "snapshot summary must be an object" });
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
  if (
    Array.isArray(value.operations) &&
    Number.isSafeInteger(value.eventCount) &&
    value.operations.length !== value.eventCount
  ) {
    issues.push({
      path: joinPath(path, "eventCount"),
      message: "eventCount must match operations length",
    });
  }
  if (
    Array.isArray(value.eventIds) &&
    Number.isSafeInteger(value.eventCount) &&
    value.eventIds.length !== value.eventCount
  ) {
    issues.push({
      path: joinPath(path, "eventCount"),
      message: "eventCount must match eventIds length",
    });
  }
  if (
    Array.isArray(value.auditIds) &&
    Number.isSafeInteger(value.auditRecordCount) &&
    value.auditIds.length !== value.auditRecordCount
  ) {
    issues.push({
      path: joinPath(path, "auditRecordCount"),
      message: "auditRecordCount must match auditIds length",
    });
  }
  if (
    Array.isArray(value.auditActions) &&
    Number.isSafeInteger(value.auditRecordCount) &&
    value.auditActions.length !== value.auditRecordCount
  ) {
    issues.push({
      path: joinPath(path, "auditRecordCount"),
      message: "auditRecordCount must match auditActions length",
    });
  }
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
  if (!isRecord(value.storage)) {
    issues.push({ path: joinPath(path, "storage"), message: "storage must be an object" });
    return;
  }
  requireTrue(value.storage, "localOnly", joinPath(path, "storage.localOnly"), issues);
  requireTrue(
    value.storage,
    "storagePathRedacted",
    joinPath(path, "storage.storagePathRedacted"),
    issues,
  );
  requirePattern(
    value.storage,
    "storagePath",
    joinPath(path, "storage.storagePath"),
    REDACTED_STORAGE_PATTERN,
    issues,
  );
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

  value.forEach((event, index) =>
    collectAuditPreviewEventIssues(event, `${path}.${index}`, issues)
  );
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

function collectRetentionPolicyIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "policy must be an object" });
    return;
  }

  collectAllowedKeys(value, path, RETENTION_POLICY_KEYS, issues);
  requireOptionalIntegerInRange(
    value.retainNewest,
    joinPath(path, "retainNewest"),
    0,
    MAX_RETENTION_SNAPSHOTS,
    issues,
  );
  collectOptionalSnapshotIdArrayIssues(
    value.retainSnapshotIds,
    joinPath(path, "retainSnapshotIds"),
    issues,
  );
  requireOptionalTimestamp(value.deleteBefore, joinPath(path, "deleteBefore"), issues);
}

function collectReviewBoundarySummaryIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "boundary summary must be an object" });
    return;
  }

  requirePattern(value, "fingerprint", joinPath(path, "fingerprint"), SHA256_FINGERPRINT_PATTERN, issues);
  requireOptionalPattern(value, "snapshotId", joinPath(path, "snapshotId"), SNAPSHOT_ID_PATTERN, issues);
  requireOptionalTimestamp(value.createdAt, joinPath(path, "createdAt"), issues);
  requireOptionalTimestamp(value.updatedAt, joinPath(path, "updatedAt"), issues);
  requirePattern(value, "workspaceId", joinPath(path, "workspaceId"), WORKSPACE_ID_PATTERN, issues);
  requirePattern(value, "deviceId", joinPath(path, "deviceId"), DEVICE_ID_PATTERN, issues);
  requirePattern(value, "sessionId", joinPath(path, "sessionId"), SESSION_ID_PATTERN, issues);
  collectStringArrayIssues(value.operations, joinPath(path, "operations"), issues);
  collectStringArrayIssues(value.auditActions, joinPath(path, "auditActions"), issues);
  requireNonNegativeInteger(value, "eventCount", joinPath(path, "eventCount"), issues);
  requireNonNegativeInteger(value, "auditRecordCount", joinPath(path, "auditRecordCount"), issues);
}

function collectCompareSummaryIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "summary must be an object" });
    return;
  }

  for (const key of [
    "fingerprintMatch",
    "workspaceMatch",
    "deviceMatch",
    "sessionMatch",
  ] as const) {
    if (typeof value[key] !== "boolean") {
      issues.push({ path: joinPath(path, key), message: `${key} must be a boolean` });
    }
  }
  for (const key of [
    "baselineEventCount",
    "candidateEventCount",
    "unchangedEventCount",
    "addedEventCount",
    "removedEventCount",
    "changedEventCount",
    "baselineAuditRecordCount",
    "candidateAuditRecordCount",
    "unchangedAuditRecordCount",
    "addedAuditRecordCount",
    "removedAuditRecordCount",
    "changedAuditRecordCount",
  ] as const) {
    requireNonNegativeInteger(value, key, joinPath(path, key), issues);
  }
}

function collectCompareDifferencesIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "differences must be an object" });
    return;
  }

  collectComparableEventBucketIssues(value.events, joinPath(path, "events"), issues);
  collectComparableAuditRecordBucketIssues(
    value.auditRecords,
    joinPath(path, "auditRecords"),
    issues,
  );
}

function collectComparableEventBucketIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "event differences must be an object" });
    return;
  }

  collectArrayIssues(value.added, joinPath(path, "added"), issues, collectComparableEventIssues);
  collectArrayIssues(value.removed, joinPath(path, "removed"), issues, collectComparableEventIssues);
  collectChangedItemArrayIssues(
    value.changed,
    joinPath(path, "changed"),
    issues,
    collectComparableEventIssues,
  );
}

function collectComparableAuditRecordBucketIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "audit record differences must be an object" });
    return;
  }

  collectArrayIssues(
    value.added,
    joinPath(path, "added"),
    issues,
    collectComparableAuditRecordIssues,
  );
  collectArrayIssues(
    value.removed,
    joinPath(path, "removed"),
    issues,
    collectComparableAuditRecordIssues,
  );
  collectChangedItemArrayIssues(
    value.changed,
    joinPath(path, "changed"),
    issues,
    collectComparableAuditRecordIssues,
  );
}

function collectComparableEventIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "event difference item must be an object" });
    return;
  }

  requireNonEmptyString(value, "key", joinPath(path, "key"), issues);
  requirePattern(value, "eventId", joinPath(path, "eventId"), EVENT_ID_PATTERN, issues);
  requireNonEmptyString(value, "operation", joinPath(path, "operation"), issues);
  requireOptionalPositiveInteger(value.sequence, joinPath(path, "sequence"), issues);
  requireOptionalTimestamp(value.createdAt, joinPath(path, "createdAt"), issues);
  requirePattern(value, "fingerprint", joinPath(path, "fingerprint"), SHA256_FINGERPRINT_PATTERN, issues);
}

function collectComparableAuditRecordIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "audit record difference item must be an object" });
    return;
  }

  requireNonEmptyString(value, "key", joinPath(path, "key"), issues);
  requireNonEmptyString(value, "auditId", joinPath(path, "auditId"), issues);
  requireNonEmptyString(value, "action", joinPath(path, "action"), issues);
  requireOptionalTimestamp(value.createdAt, joinPath(path, "createdAt"), issues);
  requirePattern(value, "fingerprint", joinPath(path, "fingerprint"), SHA256_FINGERPRINT_PATTERN, issues);
}

function collectChangedItemArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  collectItemIssues: (value: unknown, path: string, issues: ValidationIssue[]) => void,
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "changed items must be an array" });
    return;
  }

  value.forEach((item, index) => {
    const itemPath = `${path}.${index}`;
    if (!isRecord(item)) {
      issues.push({ path: itemPath, message: "changed item must be an object" });
      return;
    }
    requireNonEmptyString(item, "key", joinPath(itemPath, "key"), issues);
    collectItemIssues(item.baseline, joinPath(itemPath, "baseline"), issues);
    collectItemIssues(item.candidate, joinPath(itemPath, "candidate"), issues);
  });
}

function collectRetentionPolicyResponseIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "policy must be an object" });
    return;
  }

  collectRetentionPolicyIssues(value, path, issues);
  if (!Array.isArray(value.retainSnapshotIds)) {
    issues.push({
      path: joinPath(path, "retainSnapshotIds"),
      message: "retainSnapshotIds must be an array",
    });
  }
}

function collectRetentionSummaryIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "summary must be an object" });
    return;
  }

  for (const key of [
    "totalSnapshotCount",
    "retainedSnapshotCount",
    "expiredSnapshotCount",
    "pinnedSnapshotCount",
  ] as const) {
    requireNonNegativeInteger(value, key, joinPath(path, key), issues);
  }
  if (
    Number.isSafeInteger(value.retainedSnapshotCount) &&
    Number.isSafeInteger(value.expiredSnapshotCount) &&
    Number.isSafeInteger(value.totalSnapshotCount) &&
    value.retainedSnapshotCount + value.expiredSnapshotCount !== value.totalSnapshotCount
  ) {
    issues.push({
      path: joinPath(path, "totalSnapshotCount"),
      message: "totalSnapshotCount must equal retainedSnapshotCount plus expiredSnapshotCount",
    });
  }
}

function collectRetentionDecisionIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "retention decision must be an object" });
    return;
  }

  requirePattern(value, "snapshotId", joinPath(path, "snapshotId"), SNAPSHOT_ID_PATTERN, issues);
  requirePattern(value, "fingerprint", joinPath(path, "fingerprint"), SHA256_FINGERPRINT_PATTERN, issues);
  requirePattern(
    value,
    "snapshotFingerprint",
    joinPath(path, "snapshotFingerprint"),
    SHA256_FINGERPRINT_PATTERN,
    issues,
  );
  requireIsoTimestamp(value, "createdAt", joinPath(path, "createdAt"), issues);
  requireIsoTimestamp(value, "updatedAt", joinPath(path, "updatedAt"), issues);
  requirePattern(value, "workspaceId", joinPath(path, "workspaceId"), WORKSPACE_ID_PATTERN, issues);
  requirePattern(value, "deviceId", joinPath(path, "deviceId"), DEVICE_ID_PATTERN, issues);
  requirePattern(value, "sessionId", joinPath(path, "sessionId"), SESSION_ID_PATTERN, issues);
  requireNonNegativeInteger(value, "eventCount", joinPath(path, "eventCount"), issues);
  requireNonNegativeInteger(value, "auditRecordCount", joinPath(path, "auditRecordCount"), issues);
  requirePositiveInteger(value, "newestRank", joinPath(path, "newestRank"), issues);
  if (typeof value.retain !== "boolean") {
    issues.push({ path: joinPath(path, "retain"), message: "retain must be a boolean" });
  }
  requireAllowedValue(
    value.plannedAction,
    joinPath(path, "plannedAction"),
    ["retain", "expire"],
    issues,
  );
  collectStringArrayIssues(value.reasonCodes, joinPath(path, "reasonCodes"), issues);
  if (
    typeof value.retain === "boolean" &&
    typeof value.plannedAction === "string" &&
    ((value.retain && value.plannedAction !== "retain") ||
      (!value.retain && value.plannedAction !== "expire"))
  ) {
    issues.push({
      path: joinPath(path, "plannedAction"),
      message: "plannedAction must match retain",
    });
  }
}

function collectArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  collectItemIssues: (value: unknown, path: string, issues: ValidationIssue[]) => void,
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "value must be an array" });
    return;
  }

  value.forEach((item, index) => collectItemIssues(item, `${path}.${index}`, issues));
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

function collectUnsafeRetentionIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  keyHint = "",
  seen: WeakSet<object> = new WeakSet<object>(),
): void {
  if (typeof value === "string") {
    const reason = unsafeRetentionReason(value, keyHint);
    if (reason !== undefined) {
      issues.push({
        path,
        message: "workspace session snapshot review input must not retain raw secrets or raw local paths",
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
      collectUnsafeRetentionIssues(item, `${path}.${index}`, issues, keyHint, seen)
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
      const token = normalizeToken(key);
      if (isRawRetentionFlag(token, nested)) {
        issues.push({
          path: joinPath(path, key),
          message: "workspace session snapshot review input must not retain raw secrets or raw local paths",
        });
        continue;
      }

      collectUnsafeRetentionIssues(nested, joinPath(path, key), issues, key, seen);
    }
    seen.delete(value);
  }
}

function unsafeRetentionReason(value: string, keyHint: string): string | undefined {
  if (isRedactedToken(value) || normalizeToken(keyHint).includes("fingerprint")) {
    return undefined;
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
  if (RAW_LOCAL_PATH_PATTERN.test(value)) {
    return "raw_local_path";
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

function isRedactedToken(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed === "[REDACTED]" ||
    /^\[redacted(?::[A-Za-z0-9_-]+)*\]$/.test(trimmed) ||
    trimmed === "[redacted-path]" ||
    trimmed === "[redacted-secret]"
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
      issues.push({ path: joinPath(path, key), message: `unexpected field ${key}` });
    }
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

function collectOptionalSnapshotIdArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    issues.push({ path, message: "value must be an array of snapshot ids" });
    return;
  }

  value.forEach((item, index) => {
    if (typeof item !== "string" || !SNAPSHOT_ID_PATTERN.test(item)) {
      issues.push({ path: `${path}.${index}`, message: "snapshot id has an invalid format" });
    }
  });
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

function requireIsoTimestamp(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): void {
  const value = record[key];
  if (typeof value !== "string" || !isIsoTimestamp(value)) {
    issues.push({ path, message: `${key} must be an ISO timestamp` });
  }
}

function requireOptionalTimestamp(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value !== undefined && (typeof value !== "string" || !isIsoTimestamp(value))) {
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

function requireOptionalPositiveInteger(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || (value as number) <= 0)) {
    issues.push({ path, message: "value must be a positive safe integer when provided" });
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoTimestamp(value: string): boolean {
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

function hasHeader(headers: Readonly<Record<string, string>>, name: string): boolean {
  const normalized = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === normalized);
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
