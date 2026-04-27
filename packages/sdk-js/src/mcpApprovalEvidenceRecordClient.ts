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
  McpApprovalEvidencePreviewRequest,
  McpApprovalEvidencePreviewResponse,
} from "./mcpApprovalEvidenceClient.ts";

export type McpApprovalEvidenceRecordClientOptions = SovereignOpsClientOptions;

export type McpApprovalEvidenceRecordSchemaVersion = "mcp-approval-evidence/v1";
export type McpApprovalEvidenceRecordPolicyDecision =
  | "allow"
  | "require_approval"
  | "deny";
export type McpApprovalEvidenceRecordApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired";
export type McpApprovalEvidenceRecordSessionRefRole = "subject" | "related";
export type McpApprovalEvidenceRecordAuditEventType =
  | "policy_decision"
  | "operation_succeeded"
  | "operation_failed";
export type McpApprovalEvidenceRecordMetadataValue =
  | string
  | number
  | boolean
  | null;
export type McpApprovalEvidenceRecordMetadata = Readonly<
  Record<string, McpApprovalEvidenceRecordMetadataValue>
>;

export interface McpApprovalEvidenceRecordSessionRef {
  readonly sessionId: `approval_${string}`;
  readonly role: McpApprovalEvidenceRecordSessionRefRole;
  readonly status: McpApprovalEvidenceRecordApprovalStatus;
}

export interface McpApprovalEvidenceRecordAuditEventRef {
  readonly eventId: `audit_${string}`;
  readonly type: McpApprovalEvidenceRecordAuditEventType;
  readonly occurredAt: string;
}

export interface McpApprovalEvidenceRecordRedactionSummary {
  readonly redacted: boolean;
  readonly redactedFieldCount: number;
  readonly redactedPaths: readonly string[];
  readonly retainedMetadataKeys: readonly string[];
}

export interface McpApprovalEvidenceRecord {
  readonly schemaVersion: McpApprovalEvidenceRecordSchemaVersion;
  readonly id: `mcpae_${string}`;
  readonly generatedAt: string;
  readonly workspaceId: `wsp_${string}`;
  readonly localOnly: true;
  readonly policyDecision: McpApprovalEvidenceRecordPolicyDecision;
  readonly approvalStatus: McpApprovalEvidenceRecordApprovalStatus;
  readonly sessionRefs: readonly McpApprovalEvidenceRecordSessionRef[];
  readonly auditEventRefs: readonly McpApprovalEvidenceRecordAuditEventRef[];
  readonly redactionSummary: McpApprovalEvidenceRecordRedactionSummary;
  readonly metadata?: McpApprovalEvidenceRecordMetadata;
}

export interface McpApprovalEvidenceRecordListQuery {
  readonly workspaceId?: string;
  readonly approvalStatus?: McpApprovalEvidenceRecordApprovalStatus;
  readonly policyDecision?: McpApprovalEvidenceRecordPolicyDecision;
  readonly filters?: JsonObject;
  readonly recordIds?: readonly string[];
  readonly fingerprints?: readonly string[];
  readonly labels?: readonly string[];
  readonly createdAfter?: string;
  readonly createdBefore?: string;
  readonly offset?: number;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface McpApprovalEvidencePersistedRecord {
  readonly kind: "mcp-approval-evidence.record";
  readonly schemaVersion: "mcp-approval-evidence-record/v1";
  readonly localOnly: true;
  readonly redacted?: true;
  readonly recordId: string;
  readonly label?: string;
  readonly metadata?: JsonObject;
  readonly createdAt: string;
  readonly updatedAt?: string;
  readonly fingerprint?: string;
  readonly baselineFingerprint?: string;
  readonly baseline?: McpApprovalEvidencePreviewResponse;
  readonly [key: string]: unknown;
}

export type McpApprovalEvidenceRecordResource =
  | McpApprovalEvidenceRecord
  | McpApprovalEvidencePersistedRecord
  | (JsonObject & { readonly localOnly: true });

export type McpApprovalEvidenceRecordCreateRequest =
  | McpApprovalEvidenceRecord
  | McpApprovalEvidencePreviewRequest
  | (JsonObject & {
      readonly recordId?: string;
      readonly id?: string;
      readonly label?: string;
      readonly metadata?: JsonObject;
      readonly payload?: JsonValue;
      readonly preview?: JsonValue;
      readonly baseline?: JsonValue;
      readonly evidencePayload?: JsonValue;
      readonly record?: JsonValue;
    });

export interface McpApprovalEvidenceRecordEnvelope {
  readonly localOnly?: true;
  readonly record?: unknown;
  readonly [key: string]: unknown;
}

export type McpApprovalEvidenceRecordCreateResponse =
  | McpApprovalEvidenceRecordResource
  | McpApprovalEvidenceRecordEnvelope;

export interface McpApprovalEvidenceRecordListResponse {
  readonly localOnly?: true;
  readonly records: readonly unknown[];
  readonly nextCursor?: string;
  readonly [key: string]: unknown;
}

export interface McpApprovalEvidenceRecordCompareRequest {
  readonly recordId?: string;
  readonly leftRecordId?: string;
  readonly rightRecordId?: string;
  readonly payload?: JsonValue;
  readonly preview?: JsonValue;
  readonly baseline?: JsonValue;
  readonly evidencePayload?: JsonValue;
  readonly leftRecord?: JsonValue;
  readonly rightRecord?: JsonValue;
}

export interface McpApprovalEvidenceRecordCompareResponse {
  readonly localOnly: true;
  readonly [key: string]: unknown;
}

type Validator<T> = (value: unknown) => T;

const RECORDS_ENDPOINT = "mcp/approval-evidence/records";
const RECORD_SCHEMA_VERSION: McpApprovalEvidenceRecordSchemaVersion =
  "mcp-approval-evidence/v1";
const POLICY_DECISIONS = ["allow", "require_approval", "deny"] as const;
const APPROVAL_STATUSES = ["pending", "approved", "rejected", "expired"] as const;
const SESSION_REF_ROLES = ["subject", "related"] as const;
const AUDIT_EVENT_TYPES = [
  "policy_decision",
  "operation_succeeded",
  "operation_failed",
] as const;
const RECORD_KEYS = [
  "schemaVersion",
  "id",
  "generatedAt",
  "workspaceId",
  "localOnly",
  "policyDecision",
  "approvalStatus",
  "sessionRefs",
  "auditEventRefs",
  "redactionSummary",
  "metadata",
] as const;
const SESSION_REF_KEYS = ["sessionId", "role", "status"] as const;
const AUDIT_EVENT_REF_KEYS = ["eventId", "type", "occurredAt"] as const;
const REDACTION_SUMMARY_KEYS = [
  "redacted",
  "redactedFieldCount",
  "redactedPaths",
  "retainedMetadataKeys",
] as const;
const LIST_QUERY_KEYS = [
  "workspaceId",
  "approvalStatus",
  "policyDecision",
  "filters",
  "recordIds",
  "fingerprints",
  "labels",
  "createdAfter",
  "createdBefore",
  "offset",
  "limit",
  "cursor",
] as const;
const ID_BODY_PATTERN = "[A-Za-z0-9_-]{1,88}";
const EVIDENCE_ID_PATTERN = new RegExp(`^mcpae_${ID_BODY_PATTERN}$`);
const WORKSPACE_ID_PATTERN = new RegExp(`^wsp_${ID_BODY_PATTERN}$`);
const SESSION_ID_PATTERN = new RegExp(`^approval_${ID_BODY_PATTERN}$`);
const AUDIT_EVENT_ID_PATTERN = new RegExp(`^audit_${ID_BODY_PATTERN}$`);
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const PATH_REF_PATTERN = /^[A-Za-z][A-Za-z0-9_.[\]-]{0,191}$/;
const METADATA_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const SECRET_LIKE_METADATA_KEY_PATTERN =
  /(?:api[_-]?key|authorization|bearer|credential|password|secret|token)/i;

export class McpApprovalEvidenceRecordClient {
  readonly #baseUrl: string;
  readonly #fetch: FetchLike;
  readonly #apiKey?: string;
  readonly #headers: Readonly<Record<string, string>>;

  constructor(options: McpApprovalEvidenceRecordClientOptions) {
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

  async create(
    record: McpApprovalEvidenceRecordCreateRequest,
  ): Promise<McpApprovalEvidenceRecordCreateResponse> {
    validateMcpApprovalEvidenceRecordCreateRequest(record);
    return this.#request(
      RECORDS_ENDPOINT,
      {
        method: "POST",
        body: JSON.stringify(deepJsonClone(record)),
      },
      parseMcpApprovalEvidenceRecordOperationResponse,
    );
  }

  async createRecord(
    record: McpApprovalEvidenceRecordCreateRequest,
  ): Promise<McpApprovalEvidenceRecordCreateResponse> {
    return this.create(record);
  }

  async list(
    query: McpApprovalEvidenceRecordListQuery = {},
  ): Promise<McpApprovalEvidenceRecordListResponse> {
    validateListMcpApprovalEvidenceRecordQuery(query);
    if (shouldSendListBody(query)) {
      return this.#request(
        RECORDS_ENDPOINT,
        {
          method: "GET",
          body: JSON.stringify(deepJsonClone(query)),
        },
        parseMcpApprovalEvidenceRecordListResponse,
      );
    }

    const url = this.#url(RECORDS_ENDPOINT, query);
    return this.#requestUrl(url, { method: "GET" }, parseMcpApprovalEvidenceRecordListResponse);
  }

  async listRecords(
    query: McpApprovalEvidenceRecordListQuery = {},
  ): Promise<McpApprovalEvidenceRecordListResponse> {
    return this.list(query);
  }

  async get(recordId: string): Promise<McpApprovalEvidenceRecordCreateResponse> {
    validateRecordIdPathInput(recordId, "recordId");
    return this.#request(
      `${RECORDS_ENDPOINT}/${encodePathPart(recordId)}`,
      { method: "GET" },
      parseMcpApprovalEvidenceRecordOperationResponse,
    );
  }

  async getRecord(recordId: string): Promise<McpApprovalEvidenceRecordCreateResponse> {
    return this.get(recordId);
  }

  async compare(
    input: McpApprovalEvidenceRecordCompareRequest | string,
    payload?: JsonValue,
  ): Promise<McpApprovalEvidenceRecordCompareResponse> {
    const request = normalizeMcpApprovalEvidenceRecordCompareRequest(input, payload);
    validateMcpApprovalEvidenceRecordCompareRequest(request);
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
      parseMcpApprovalEvidenceRecordCompareResponse,
    );
  }

  async compareRecords(
    input: McpApprovalEvidenceRecordCompareRequest | string,
    payload?: JsonValue,
  ): Promise<McpApprovalEvidenceRecordCompareResponse> {
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

export function createMcpApprovalEvidenceRecordClient(
  options: McpApprovalEvidenceRecordClientOptions,
): McpApprovalEvidenceRecordClient {
  return new McpApprovalEvidenceRecordClient(options);
}

function shouldSendListBody(query: McpApprovalEvidenceRecordListQuery): boolean {
  return (
    query.filters !== undefined ||
    query.recordIds !== undefined ||
    query.fingerprints !== undefined ||
    query.labels !== undefined ||
    query.createdAfter !== undefined ||
    query.createdBefore !== undefined ||
    query.offset !== undefined
  );
}

function normalizeMcpApprovalEvidenceRecordCompareRequest(
  input: McpApprovalEvidenceRecordCompareRequest | string,
  payload: JsonValue | undefined,
): McpApprovalEvidenceRecordCompareRequest {
  if (typeof input === "string") {
    return payload === undefined
      ? { recordId: input }
      : { recordId: input, payload };
  }

  return input;
}

function parseMcpApprovalEvidenceRecordOperationResponse(
  value: unknown,
): McpApprovalEvidenceRecordCreateResponse {
  const issues: ValidationIssue[] = [];

  if (!isRecord(value)) {
    throw new ApiResponseValidationError([
      { path: "", message: "response must be an object" },
    ], value);
  }

  collectResponseLocalOnlyIssues(value, "", issues);
  collectJsonIssues(value, "", issues);
  throwResponseIssues(issues, value);

  return deepFreezeClone(value) as McpApprovalEvidenceRecordCreateResponse;
}

function parseMcpApprovalEvidenceRecordListResponse(
  value: unknown,
): McpApprovalEvidenceRecordListResponse {
  const issues: ValidationIssue[] = [];

  if (Array.isArray(value)) {
    value.forEach((record, index) => {
      collectJsonIssues(record, `records.${index}`, issues);
      if (isRecord(record)) {
        collectLocalOnlyValueIssues(record, `records.${index}`, issues);
      }
    });
    throwResponseIssues(issues, value);
    return deepFreezeClone({ records: value }) as McpApprovalEvidenceRecordListResponse;
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
  if (value.nextCursor !== undefined) {
    requireNonEmptyString(value, "nextCursor", "nextCursor", issues);
  }

  throwResponseIssues(issues, value);

  return deepFreezeClone(value) as McpApprovalEvidenceRecordListResponse;
}

function parseMcpApprovalEvidenceRecordCompareResponse(
  value: unknown,
): McpApprovalEvidenceRecordCompareResponse {
  const issues: ValidationIssue[] = [];

  if (!isRecord(value)) {
    throw new ApiResponseValidationError([
      { path: "", message: "response must be an object" },
    ], value);
  }

  collectResponseLocalOnlyIssues(value, "", issues);
  collectJsonIssues(value, "", issues);

  throwResponseIssues(issues, value);

  return deepFreezeClone(value) as McpApprovalEvidenceRecordCompareResponse;
}

function validateMcpApprovalEvidenceRecordCreateRequest(
  value: unknown,
): void {
  const issues: ValidationIssue[] = [];

  if (!isRecord(value)) {
    throw new ApiRequestValidationError("MCP approval evidence record create request is invalid", [
      { path: "", message: "request must be an object" },
    ]);
  }

  if (value.schemaVersion === RECORD_SCHEMA_VERSION) {
    collectMcpApprovalEvidenceRecordIssues(value, "", issues);
  } else {
    collectJsonIssues(value, "", issues);
    collectLocalOnlyValueIssues(value, "", issues);
  }
  if (issues.length > 0) {
    throw new ApiRequestValidationError(
      "MCP approval evidence record create request is invalid",
      issues,
    );
  }
}

function validateListMcpApprovalEvidenceRecordQuery(
  query: McpApprovalEvidenceRecordListQuery,
): void {
  const issues: ValidationIssue[] = [];

  if (!isRecord(query)) {
    throw new ApiRequestValidationError("MCP approval evidence record query is invalid", [
      { path: "query", message: "query must be an object" },
    ]);
  }

  collectAllowedKeys(query, "query", LIST_QUERY_KEYS, issues);
  if (query.workspaceId !== undefined) {
    requireOptionalPattern(
      query,
      "workspaceId",
      "query.workspaceId",
      WORKSPACE_ID_PATTERN,
      "workspaceId must use the wsp_ id prefix",
      issues,
    );
  }
  requireOptionalOneOf(
    query,
    "approvalStatus",
    "query.approvalStatus",
    APPROVAL_STATUSES,
    issues,
  );
  requireOptionalOneOf(
    query,
    "policyDecision",
    "query.policyDecision",
    POLICY_DECISIONS,
    issues,
  );
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
  collectOptionalStringArrayIssues(query.fingerprints, "query.fingerprints", issues);
  collectOptionalStringArrayIssues(query.labels, "query.labels", issues);
  requireOptionalString(query, "createdAfter", "query.createdAfter", issues);
  requireOptionalString(query, "createdBefore", "query.createdBefore", issues);
  requireOptionalString(query, "cursor", "query.cursor", issues);

  if (issues.length > 0) {
    throw new ApiRequestValidationError("MCP approval evidence record query is invalid", issues);
  }
}

function validateMcpApprovalEvidenceRecordCompareRequest(
  input: McpApprovalEvidenceRecordCompareRequest,
): void {
  const issues: ValidationIssue[] = [];

  if (!isRecord(input)) {
    throw new ApiRequestValidationError("MCP approval evidence record compare request is invalid", [
      { path: "", message: "request must be an object" },
    ]);
  }

  collectJsonIssues(input, "", issues);
  if (input.recordId !== undefined) {
    requireNonEmptyString(input, "recordId", "recordId", issues);
  }
  if (input.leftRecordId !== undefined) {
    requireNonEmptyString(input, "leftRecordId", "leftRecordId", issues);
  }
  if (input.rightRecordId !== undefined) {
    requireNonEmptyString(input, "rightRecordId", "rightRecordId", issues);
  }
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
      "MCP approval evidence record compare request is invalid",
      issues,
    );
  }
}

function validateRecordIdPathInput(value: unknown, path: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiRequestValidationError("MCP approval evidence record id is invalid", [
      { path, message: "record id must be a non-empty string" },
    ]);
  }
}

function collectMcpApprovalEvidenceRecordIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "record must be an object" });
    return;
  }

  collectAllowedKeys(value, path, RECORD_KEYS, issues);
  requireLiteralString(value, "schemaVersion", joinPath(path, "schemaVersion"), RECORD_SCHEMA_VERSION, issues);
  requirePattern(value, "id", joinPath(path, "id"), EVIDENCE_ID_PATTERN, "id must use the mcpae_ id prefix", issues);
  requireIsoTimestamp(value, "generatedAt", joinPath(path, "generatedAt"), issues);
  requirePattern(
    value,
    "workspaceId",
    joinPath(path, "workspaceId"),
    WORKSPACE_ID_PATTERN,
    "workspaceId must use the wsp_ id prefix",
    issues,
  );
  requireTrue(value, "localOnly", joinPath(path, "localOnly"), issues);
  requireOneOf(value, "policyDecision", joinPath(path, "policyDecision"), POLICY_DECISIONS, issues);
  requireOneOf(value, "approvalStatus", joinPath(path, "approvalStatus"), APPROVAL_STATUSES, issues);
  collectSessionRefsIssues(value.sessionRefs, joinPath(path, "sessionRefs"), value.approvalStatus, issues);
  collectAuditEventRefsIssues(value.auditEventRefs, joinPath(path, "auditEventRefs"), issues);
  collectRedactionSummaryIssues(value.redactionSummary, joinPath(path, "redactionSummary"), issues);
  if (value.metadata !== undefined) {
    collectMetadataIssues(value.metadata, joinPath(path, "metadata"), issues);
  }
}

function collectSessionRefsIssues(
  value: unknown,
  path: string,
  approvalStatus: unknown,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "sessionRefs must be an array" });
    return;
  }
  if (value.length === 0) {
    issues.push({ path, message: "sessionRefs must contain at least one item" });
  }

  let previous: string | undefined;
  const subjectIndexes: number[] = [];
  value.forEach((item, index) => {
    const itemPath = `${path}.${index}`;
    if (!isRecord(item)) {
      issues.push({ path: itemPath, message: "session ref must be an object" });
      return;
    }

    collectAllowedKeys(item, itemPath, SESSION_REF_KEYS, issues);
    requirePattern(
      item,
      "sessionId",
      joinPath(itemPath, "sessionId"),
      SESSION_ID_PATTERN,
      "sessionId must use the approval_ id prefix",
      issues,
    );
    requireOneOf(item, "role", joinPath(itemPath, "role"), SESSION_REF_ROLES, issues);
    requireOneOf(item, "status", joinPath(itemPath, "status"), APPROVAL_STATUSES, issues);
    if (item.role === "subject") {
      subjectIndexes.push(index);
      if (isOneOf(approvalStatus, APPROVAL_STATUSES) && item.status !== approvalStatus) {
        issues.push({
          path: joinPath(itemPath, "status"),
          message: "subject session status must match approvalStatus",
        });
      }
    }

    if (typeof item.sessionId === "string") {
      if (previous !== undefined && previous >= item.sessionId) {
        issues.push({
          path: joinPath(itemPath, "sessionId"),
          message: "sessionRefs must be sorted by sessionId with no duplicates",
        });
      }
      previous = item.sessionId;
    }
  });

  if (subjectIndexes.length !== 1) {
    issues.push({ path, message: "sessionRefs must contain exactly one subject ref" });
  }
}

function collectAuditEventRefsIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "auditEventRefs must be an array" });
    return;
  }
  if (value.length === 0) {
    issues.push({ path, message: "auditEventRefs must contain at least one item" });
  }

  let previous: string | undefined;
  value.forEach((item, index) => {
    const itemPath = `${path}.${index}`;
    if (!isRecord(item)) {
      issues.push({ path: itemPath, message: "audit event ref must be an object" });
      return;
    }

    collectAllowedKeys(item, itemPath, AUDIT_EVENT_REF_KEYS, issues);
    requirePattern(
      item,
      "eventId",
      joinPath(itemPath, "eventId"),
      AUDIT_EVENT_ID_PATTERN,
      "eventId must use the audit_ id prefix",
      issues,
    );
    requireOneOf(item, "type", joinPath(itemPath, "type"), AUDIT_EVENT_TYPES, issues);
    requireIsoTimestamp(item, "occurredAt", joinPath(itemPath, "occurredAt"), issues);

    if (typeof item.eventId === "string") {
      if (previous !== undefined && previous >= item.eventId) {
        issues.push({
          path: joinPath(itemPath, "eventId"),
          message: "auditEventRefs must be sorted by eventId with no duplicates",
        });
      }
      previous = item.eventId;
    }
  });
}

function collectRedactionSummaryIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "redactionSummary must be an object" });
    return;
  }

  collectAllowedKeys(value, path, REDACTION_SUMMARY_KEYS, issues);
  requireBoolean(value, "redacted", joinPath(path, "redacted"), issues);
  requireNonNegativeInteger(value, "redactedFieldCount", joinPath(path, "redactedFieldCount"), issues);
  collectPathRefArrayIssues(value.redactedPaths, joinPath(path, "redactedPaths"), issues);
  collectSafeMetadataKeyArrayIssues(
    value.retainedMetadataKeys,
    joinPath(path, "retainedMetadataKeys"),
    issues,
  );

  if (
    Number.isInteger(value.redactedFieldCount) &&
    Array.isArray(value.redactedPaths) &&
    value.redactedFieldCount !== value.redactedPaths.length
  ) {
    issues.push({
      path: joinPath(path, "redactedFieldCount"),
      message: "redactedFieldCount must match redactedPaths length",
    });
  }
  if (
    typeof value.redacted === "boolean" &&
    Number.isInteger(value.redactedFieldCount) &&
    value.redacted !== value.redactedFieldCount > 0
  ) {
    issues.push({
      path: joinPath(path, "redacted"),
      message: "redacted must indicate whether any fields were redacted",
    });
  }
}

function collectPathRefArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "value must be an array of safe path references" });
    return;
  }

  value.forEach((item, index) => {
    if (typeof item !== "string" || !PATH_REF_PATTERN.test(item)) {
      issues.push({ path: `${path}.${index}`, message: "value must be a safe path reference" });
    }
  });
}

function collectSafeMetadataKeyArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "value must be an array of safe metadata keys" });
    return;
  }

  value.forEach((item, index) => {
    if (typeof item !== "string" || !isSafeMetadataKey(item)) {
      issues.push({ path: `${path}.${index}`, message: "value must be a safe metadata key" });
    }
  });
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

function collectMetadataIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "metadata must be an object" });
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = joinPath(path, key);
    if (!isSafeMetadataKey(key)) {
      issues.push({ path: nestedPath, message: "metadata keys must be non-sensitive labels" });
    }
    if (
      nested !== null &&
      typeof nested !== "string" &&
      typeof nested !== "number" &&
      typeof nested !== "boolean"
    ) {
      issues.push({ path: nestedPath, message: "metadata values must be primitive values" });
    }
    if (typeof nested === "number" && !Number.isFinite(nested)) {
      issues.push({ path: nestedPath, message: "metadata numbers must be finite" });
    }
  }
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

function requirePattern(
  value: Record<string, unknown>,
  field: string,
  path: string,
  pattern: RegExp,
  message: string,
  issues: ValidationIssue[],
): void {
  if (typeof value[field] !== "string" || !pattern.test(value[field] as string)) {
    issues.push({ path, message });
  }
}

function requireOptionalPattern(
  value: Record<string, unknown>,
  field: string,
  path: string,
  pattern: RegExp,
  message: string,
  issues: ValidationIssue[],
): void {
  if (value[field] !== undefined) {
    requirePattern(value, field, path, pattern, message, issues);
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

function requireBoolean(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (typeof value[field] !== "boolean") {
    issues.push({ path, message: `${field} must be a boolean` });
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

function throwResponseIssues(issues: readonly ValidationIssue[], body: unknown): void {
  if (issues.length > 0) {
    throw new ApiResponseValidationError(issues, body);
  }
}

function isIsoTimestamp(value: string): boolean {
  return ISO_TIMESTAMP_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}

function isSafeMetadataKey(value: string): boolean {
  return METADATA_KEY_PATTERN.test(value) && !SECRET_LIKE_METADATA_KEY_PATTERN.test(value);
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
