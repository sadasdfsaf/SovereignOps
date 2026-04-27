import {
  ApiNetworkError,
  ApiRequestValidationError,
  ApiResponseValidationError,
  type FetchLike,
  type FetchRequestInit,
  type FetchResponseLike,
  type JsonObject,
  type JsonValue,
  type McpActor,
  parseJsonApiResponse,
  type SovereignOpsClientOptions,
  type ValidationIssue,
} from "./client.ts";

export type McpApprovalEvidenceClientOptions = SovereignOpsClientOptions;

export type McpApprovalEvidenceSchemaVersion = "mcp-approval-evidence-preview/v1";
export type McpApprovalEvidenceSourceKind =
  | "tool_audit"
  | "resource_audit"
  | "approval_session"
  | "safety_annotation";
export type McpApprovalEvidenceFilterSource = Exclude<
  McpApprovalEvidenceSourceKind,
  "safety_annotation"
>;
export type McpApprovalEvidenceStatus =
  | "requested"
  | "approval_required"
  | "approved"
  | "executed"
  | "failed"
  | "denied"
  | "succeeded"
  | "rejected"
  | "expired"
  | "trusted"
  | "review"
  | "untrusted";
export type McpApprovalEvidenceSubjectType =
  | "tool"
  | "resource"
  | "approval_session"
  | "safety";
export type McpApprovalEvidenceApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired";
export type McpApprovalEvidenceToolAuditType =
  | "tool_call_requested"
  | "tool_call_approved"
  | "tool_call_approval_required"
  | "tool_call_denied"
  | "tool_call_executed"
  | "tool_call_failed";
export type McpApprovalEvidenceResourceAuditType =
  | "policy_decision"
  | "operation_succeeded"
  | "operation_failed";

export interface McpApprovalEvidenceApprovalDecision {
  readonly status: Exclude<McpApprovalEvidenceApprovalStatus, "pending">;
  readonly at: string;
  readonly actor?: McpActor;
  readonly reason?: string;
  readonly metadata?: JsonObject;
}

export interface McpApprovalEvidenceApprovalSession {
  readonly id: string;
  readonly status: McpApprovalEvidenceApprovalStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly expiresAt?: string;
  readonly request: JsonObject;
  readonly actor?: McpActor;
  readonly reason?: string;
  readonly ruleId?: string;
  readonly metadata?: JsonObject;
  readonly decision?: McpApprovalEvidenceApprovalDecision;
  readonly approvedAt?: string;
  readonly approvedBy?: McpActor;
  readonly rejectedAt?: string;
  readonly rejectedBy?: McpActor;
  readonly expiredAt?: string;
  readonly expiredBy?: McpActor;
}

export interface McpApprovalEvidenceToolAuditRecord {
  readonly id?: string;
  readonly timestamp?: string;
  readonly type: McpApprovalEvidenceToolAuditType;
  readonly toolName: string;
  readonly arguments?: JsonObject;
  readonly actorId?: string;
  readonly decision?: string;
  readonly reason?: string;
  readonly metadata?: JsonObject;
  readonly resultSummary?: string;
}

export interface McpApprovalEvidenceResourceAuditRecord {
  readonly id?: string;
  readonly timestamp?: string;
  readonly type: McpApprovalEvidenceResourceAuditType;
  readonly uri?: string;
  readonly path?: string;
  readonly capability?: string;
  readonly decision?: string;
  readonly message?: string;
  readonly metadata?: JsonObject;
}

export interface McpApprovalEvidenceSnapshot {
  readonly approvalSessions?: readonly McpApprovalEvidenceApprovalSession[];
  readonly toolAuditRecords?: readonly McpApprovalEvidenceToolAuditRecord[];
  readonly toolRecords?: readonly McpApprovalEvidenceToolAuditRecord[];
  readonly resourceAuditRecords?: readonly McpApprovalEvidenceResourceAuditRecord[];
  readonly resourceAuditIntents?: readonly McpApprovalEvidenceResourceAuditRecord[];
  readonly auditIntents?: readonly McpApprovalEvidenceResourceAuditRecord[];
}

export interface McpApprovalEvidenceFilters {
  readonly sources?: readonly McpApprovalEvidenceFilterSource[];
  readonly statuses?: readonly Exclude<
    McpApprovalEvidenceStatus,
    "trusted" | "review" | "untrusted"
  >[];
  readonly subjectTypes?: readonly Exclude<McpApprovalEvidenceSubjectType, "safety">[];
  readonly actorIds?: readonly string[];
  readonly limit?: number;
}

export interface McpApprovalEvidencePreviewRequest extends McpApprovalEvidenceSnapshot {
  readonly snapshot?: McpApprovalEvidenceSnapshot;
  readonly filters?: McpApprovalEvidenceFilters;
}

export interface McpApprovalEvidencePreviewSummary {
  readonly inputRecordCount: number;
  readonly totalEvidenceCount: number;
  readonly returnedEvidenceCount: number;
  readonly filteredEvidenceCount: number;
  readonly approvalSessionCount: number;
  readonly auditRecordCount: number;
  readonly approvalRequiredCount: number;
  readonly terminalDecisionCount: number;
  readonly sources: Readonly<Record<string, number>>;
  readonly statuses: Readonly<Record<string, number>>;
}

export interface McpApprovalEvidenceSubject {
  readonly type: McpApprovalEvidenceSubjectType;
  readonly id?: string;
  readonly name?: string;
  readonly uri?: string;
  readonly capability?: string;
}

export interface McpApprovalEvidenceItem {
  readonly id: string;
  readonly timestamp: string;
  readonly source: McpApprovalEvidenceSourceKind;
  readonly kind: string;
  readonly status: McpApprovalEvidenceStatus;
  readonly title: string;
  readonly subject: McpApprovalEvidenceSubject;
  readonly fingerprint: string;
  readonly actorId?: string;
  readonly decision?: string;
  readonly reason?: string;
  readonly arguments?: JsonObject;
  readonly request?: JsonObject;
  readonly metadata?: JsonObject;
  readonly resultSummary?: string;
  readonly safety?: JsonObject;
}

export interface McpApprovalEvidencePreviewResponse {
  readonly kind: "mcp-approval-evidence.preview";
  readonly schemaVersion: McpApprovalEvidenceSchemaVersion;
  readonly localOnly: true;
  readonly redacted: true;
  readonly fingerprint: string;
  readonly filters: McpApprovalEvidenceFilters;
  readonly summary: McpApprovalEvidencePreviewSummary;
  readonly evidence: readonly McpApprovalEvidenceItem[];
}

type Validator<T> = (value: unknown) => T;

const PREVIEW_ENDPOINT = "mcp/approval-evidence/preview";
const RESPONSE_KIND = "mcp-approval-evidence.preview";
const SCHEMA_VERSION: McpApprovalEvidenceSchemaVersion =
  "mcp-approval-evidence-preview/v1";
const SOURCE_KEYS = [
  "approvalSessions",
  "toolAuditRecords",
  "toolRecords",
  "resourceAuditRecords",
  "resourceAuditIntents",
  "auditIntents",
] as const;
const TOP_LEVEL_KEYS = ["snapshot", "filters", ...SOURCE_KEYS] as const;
const FILTER_KEYS = ["sources", "statuses", "subjectTypes", "actorIds", "limit"] as const;
const APPROVAL_SESSION_KEYS = [
  "id",
  "status",
  "createdAt",
  "updatedAt",
  "expiresAt",
  "request",
  "actor",
  "reason",
  "ruleId",
  "metadata",
  "decision",
  "approvedAt",
  "approvedBy",
  "rejectedAt",
  "rejectedBy",
  "expiredAt",
  "expiredBy",
] as const;
const APPROVAL_ACTOR_KEYS = ["id", "roles", "metadata"] as const;
const APPROVAL_DECISION_KEYS = ["status", "at", "actor", "reason", "metadata"] as const;
const TOOL_AUDIT_KEYS = [
  "id",
  "timestamp",
  "type",
  "toolName",
  "arguments",
  "actorId",
  "decision",
  "reason",
  "metadata",
  "resultSummary",
] as const;
const RESOURCE_AUDIT_KEYS = [
  "id",
  "timestamp",
  "type",
  "uri",
  "path",
  "capability",
  "decision",
  "message",
  "metadata",
] as const;
const EVIDENCE_SUBJECT_KEYS = ["type", "id", "name", "uri", "capability"] as const;
const APPROVAL_STATUSES = ["pending", "approved", "rejected", "expired"] as const;
const TERMINAL_APPROVAL_STATUSES = ["approved", "rejected", "expired"] as const;
const TOOL_AUDIT_TYPES = [
  "tool_call_requested",
  "tool_call_approved",
  "tool_call_approval_required",
  "tool_call_denied",
  "tool_call_executed",
  "tool_call_failed",
] as const;
const RESOURCE_AUDIT_TYPES = [
  "policy_decision",
  "operation_succeeded",
  "operation_failed",
] as const;
const FILTER_SOURCES = ["tool_audit", "resource_audit", "approval_session"] as const;
const SOURCE_KINDS = [...FILTER_SOURCES, "safety_annotation"] as const;
const FILTER_STATUSES = [
  "requested",
  "approval_required",
  "approved",
  "executed",
  "failed",
  "denied",
  "succeeded",
  "rejected",
  "expired",
] as const;
const EVIDENCE_STATUSES = [...FILTER_STATUSES, "trusted", "review", "untrusted"] as const;
const FILTER_SUBJECT_TYPES = ["tool", "resource", "approval_session"] as const;
const EVIDENCE_SUBJECT_TYPES = [...FILTER_SUBJECT_TYPES, "safety"] as const;
const SHA256_FINGERPRINT_PATTERN = /^sha256:[0-9a-f]{64}$/;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export class McpApprovalEvidenceClient {
  readonly #baseUrl: string;
  readonly #fetch: FetchLike;
  readonly #apiKey?: string;
  readonly #headers: Readonly<Record<string, string>>;

  constructor(options: McpApprovalEvidenceClientOptions) {
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
    input: McpApprovalEvidencePreviewRequest,
  ): Promise<McpApprovalEvidencePreviewResponse> {
    validateMcpApprovalEvidencePreviewRequest(input);
    return this.#request(
      PREVIEW_ENDPOINT,
      {
        method: "POST",
        body: JSON.stringify(buildMcpApprovalEvidencePreviewBody(input)),
      },
      parseMcpApprovalEvidencePreviewResponse,
    );
  }

  async previewEvidence(
    input: McpApprovalEvidencePreviewRequest,
  ): Promise<McpApprovalEvidencePreviewResponse> {
    return this.preview(input);
  }

  async previewApprovalEvidence(
    input: McpApprovalEvidencePreviewRequest,
  ): Promise<McpApprovalEvidencePreviewResponse> {
    return this.preview(input);
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

export function createMcpApprovalEvidenceClient(
  options: McpApprovalEvidenceClientOptions,
): McpApprovalEvidenceClient {
  return new McpApprovalEvidenceClient(options);
}

function buildMcpApprovalEvidencePreviewBody(
  input: McpApprovalEvidencePreviewRequest,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  if (input.snapshot !== undefined) {
    body.snapshot = deepJsonClone(input.snapshot);
  } else {
    for (const key of SOURCE_KEYS) {
      if (input[key] !== undefined) {
        body[key] = deepJsonClone(input[key]);
      }
    }
  }

  if (input.filters !== undefined) {
    body.filters = deepJsonClone(input.filters);
  }

  return body;
}

function validateMcpApprovalEvidencePreviewRequest(input: unknown): void {
  if (!isRecord(input)) {
    throw new ApiRequestValidationError("MCP approval evidence preview request is invalid", [
      { path: "", message: "request must be an object" },
    ]);
  }

  const issues: ValidationIssue[] = [];
  collectAllowedKeys(input, "", TOP_LEVEL_KEYS, issues);
  collectOptionalFiltersIssues(input.filters, "filters", issues);

  if (input.snapshot !== undefined) {
    const mixedKey = SOURCE_KEYS.find((key) => input[key] !== undefined);
    if (mixedKey !== undefined) {
      issues.push({
        path: mixedKey,
        message: "snapshot must not be mixed with top-level evidence arrays",
      });
    }
    collectSnapshotIssues(input.snapshot, "snapshot", issues);
  } else {
    collectSnapshotIssues(input, "", issues);
  }

  throwRequestIssues("MCP approval evidence preview request is invalid", issues);
}

function parseMcpApprovalEvidencePreviewResponse(
  value: unknown,
): McpApprovalEvidencePreviewResponse {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw new ApiResponseValidationError([
      { path: "", message: "response must be an object" },
    ], value);
  }

  requireLiteralString(value, "kind", "kind", RESPONSE_KIND, issues);
  requireLiteralString(value, "schemaVersion", "schemaVersion", SCHEMA_VERSION, issues);
  requireTrue(value, "localOnly", "localOnly", issues);
  requireTrue(value, "redacted", "redacted", issues);
  requireSha256Fingerprint(value, "fingerprint", "fingerprint", issues);
  collectFiltersIssues(value.filters, "filters", issues);
  collectSummaryIssues(value.summary, "summary", issues);
  collectEvidenceArrayIssues(value.evidence, "evidence", issues);
  collectPreviewConsistencyIssues(value, issues);
  throwResponseIssues(issues, value);

  return deepFreezeClone(value) as McpApprovalEvidencePreviewResponse;
}

function collectSnapshotIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "snapshot must be an object" });
    return;
  }

  if (path.length > 0) {
    collectAllowedKeys(value, path, SOURCE_KEYS, issues);
  }
  collectOptionalApprovalSessionArrayIssues(
    value.approvalSessions,
    joinPath(path, "approvalSessions"),
    issues,
  );
  collectOptionalToolAuditRecordArrayIssues(
    value.toolAuditRecords,
    joinPath(path, "toolAuditRecords"),
    issues,
  );
  collectOptionalToolAuditRecordArrayIssues(
    value.toolRecords,
    joinPath(path, "toolRecords"),
    issues,
  );
  collectOptionalResourceAuditRecordArrayIssues(
    value.resourceAuditRecords,
    joinPath(path, "resourceAuditRecords"),
    issues,
  );
  collectOptionalResourceAuditRecordArrayIssues(
    value.resourceAuditIntents,
    joinPath(path, "resourceAuditIntents"),
    issues,
  );
  collectOptionalResourceAuditRecordArrayIssues(
    value.auditIntents,
    joinPath(path, "auditIntents"),
    issues,
  );

  const totalSourceRecords = SOURCE_KEYS.reduce((count, key) => {
    const source = value[key];
    return count + (Array.isArray(source) ? source.length : 0);
  }, 0);
  if (totalSourceRecords === 0) {
    issues.push({ path, message: "at least one approval session or audit record is required" });
  }
}

function collectOptionalApprovalSessionArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    issues.push({ path, message: "approvalSessions must be an array" });
    return;
  }

  value.forEach((item, index) => {
    collectApprovalSessionIssues(item, `${path}.${index}`, issues);
  });
}

function collectApprovalSessionIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "approval session must be an object" });
    return;
  }

  collectAllowedKeys(value, path, APPROVAL_SESSION_KEYS, issues);
  requireNonEmptyString(value, "id", joinPath(path, "id"), issues);
  requireOneOf(value, "status", joinPath(path, "status"), APPROVAL_STATUSES, issues);
  requireIsoTimestamp(value, "createdAt", joinPath(path, "createdAt"), issues);
  requireIsoTimestamp(value, "updatedAt", joinPath(path, "updatedAt"), issues);
  if (value.expiresAt !== undefined) {
    requireIsoTimestamp(value, "expiresAt", joinPath(path, "expiresAt"), issues);
  }
  collectJsonObjectIssues(value.request, joinPath(path, "request"), issues, true);
  if (value.actor !== undefined) {
    collectActorIssues(value.actor, joinPath(path, "actor"), issues);
  }
  requireOptionalString(value, "reason", joinPath(path, "reason"), issues);
  requireOptionalString(value, "ruleId", joinPath(path, "ruleId"), issues);
  if (value.metadata !== undefined) {
    collectJsonObjectIssues(value.metadata, joinPath(path, "metadata"), issues);
  }
  if (value.decision !== undefined) {
    collectApprovalDecisionIssues(value.decision, joinPath(path, "decision"), issues);
  }
  collectOptionalTerminalTransitionIssues(value, "approved", path, issues);
  collectOptionalTerminalTransitionIssues(value, "rejected", path, issues);
  collectOptionalTerminalTransitionIssues(value, "expired", path, issues);
}

function collectApprovalDecisionIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "approval decision must be an object" });
    return;
  }

  collectAllowedKeys(value, path, APPROVAL_DECISION_KEYS, issues);
  requireOneOf(value, "status", joinPath(path, "status"), TERMINAL_APPROVAL_STATUSES, issues);
  requireIsoTimestamp(value, "at", joinPath(path, "at"), issues);
  if (value.actor !== undefined) {
    collectActorIssues(value.actor, joinPath(path, "actor"), issues);
  }
  requireOptionalString(value, "reason", joinPath(path, "reason"), issues);
  if (value.metadata !== undefined) {
    collectJsonObjectIssues(value.metadata, joinPath(path, "metadata"), issues);
  }
}

function collectActorIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "actor must be an object" });
    return;
  }

  collectAllowedKeys(value, path, APPROVAL_ACTOR_KEYS, issues);
  requireNonEmptyString(value, "id", joinPath(path, "id"), issues);
  if (value.roles !== undefined) {
    collectStringArrayIssues(value.roles, joinPath(path, "roles"), issues);
  }
  if (value.metadata !== undefined) {
    collectJsonObjectIssues(value.metadata, joinPath(path, "metadata"), issues);
  }
}

function collectOptionalTerminalTransitionIssues(
  value: Record<string, unknown>,
  prefix: "approved" | "rejected" | "expired",
  path: string,
  issues: ValidationIssue[],
): void {
  const atField = `${prefix}At`;
  const byField = `${prefix}By`;

  if (value[atField] !== undefined) {
    requireIsoTimestamp(value, atField, joinPath(path, atField), issues);
  }
  if (value[byField] !== undefined) {
    collectActorIssues(value[byField], joinPath(path, byField), issues);
  }
}

function collectOptionalToolAuditRecordArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    issues.push({ path, message: "tool audit records must be an array" });
    return;
  }

  value.forEach((item, index) => {
    collectToolAuditRecordIssues(item, `${path}.${index}`, issues);
  });
}

function collectToolAuditRecordIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "tool audit record must be an object" });
    return;
  }

  collectAllowedKeys(value, path, TOOL_AUDIT_KEYS, issues);
  requireOneOf(value, "type", joinPath(path, "type"), TOOL_AUDIT_TYPES, issues);
  requireNonEmptyString(value, "toolName", joinPath(path, "toolName"), issues);
  requireOptionalString(value, "id", joinPath(path, "id"), issues);
  if (value.timestamp !== undefined) {
    requireIsoTimestamp(value, "timestamp", joinPath(path, "timestamp"), issues);
  }
  if (value.arguments !== undefined) {
    collectJsonObjectIssues(value.arguments, joinPath(path, "arguments"), issues);
  }
  requireOptionalString(value, "actorId", joinPath(path, "actorId"), issues);
  requireOptionalString(value, "decision", joinPath(path, "decision"), issues);
  requireOptionalString(value, "reason", joinPath(path, "reason"), issues);
  if (value.metadata !== undefined) {
    collectJsonObjectIssues(value.metadata, joinPath(path, "metadata"), issues);
  }
  requireOptionalString(value, "resultSummary", joinPath(path, "resultSummary"), issues);
}

function collectOptionalResourceAuditRecordArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    issues.push({ path, message: "resource audit records must be an array" });
    return;
  }

  value.forEach((item, index) => {
    collectResourceAuditRecordIssues(item, `${path}.${index}`, issues);
  });
}

function collectResourceAuditRecordIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "resource audit record must be an object" });
    return;
  }

  collectAllowedKeys(value, path, RESOURCE_AUDIT_KEYS, issues);
  requireOneOf(value, "type", joinPath(path, "type"), RESOURCE_AUDIT_TYPES, issues);
  requireOptionalString(value, "id", joinPath(path, "id"), issues);
  if (value.timestamp !== undefined) {
    requireIsoTimestamp(value, "timestamp", joinPath(path, "timestamp"), issues);
  }
  requireOptionalString(value, "uri", joinPath(path, "uri"), issues);
  requireOptionalString(value, "path", joinPath(path, "path"), issues);
  if (value.uri === undefined && value.path === undefined) {
    issues.push({ path, message: "resource audit record requires uri or path" });
  }
  requireOptionalString(value, "capability", joinPath(path, "capability"), issues);
  requireOptionalString(value, "decision", joinPath(path, "decision"), issues);
  requireOptionalString(value, "message", joinPath(path, "message"), issues);
  if (value.metadata !== undefined) {
    collectJsonObjectIssues(value.metadata, joinPath(path, "metadata"), issues);
  }
}

function collectOptionalFiltersIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }

  collectFiltersIssues(value, path, issues);
}

function collectFiltersIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "filters must be an object" });
    return;
  }

  collectAllowedKeys(value, path, FILTER_KEYS, issues);
  collectOptionalEnumArrayIssues(value.sources, joinPath(path, "sources"), FILTER_SOURCES, issues);
  collectOptionalEnumArrayIssues(
    value.statuses,
    joinPath(path, "statuses"),
    FILTER_STATUSES,
    issues,
  );
  collectOptionalEnumArrayIssues(
    value.subjectTypes,
    joinPath(path, "subjectTypes"),
    FILTER_SUBJECT_TYPES,
    issues,
  );
  if (value.actorIds !== undefined) {
    collectStringArrayIssues(value.actorIds, joinPath(path, "actorIds"), issues);
  }
  if (value.limit !== undefined) {
    requireNonNegativeInteger(value, "limit", joinPath(path, "limit"), issues);
  }
}

function collectSummaryIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "summary must be an object" });
    return;
  }

  for (const field of [
    "inputRecordCount",
    "totalEvidenceCount",
    "returnedEvidenceCount",
    "filteredEvidenceCount",
    "approvalSessionCount",
    "auditRecordCount",
    "approvalRequiredCount",
    "terminalDecisionCount",
  ]) {
    requireNonNegativeInteger(value, field, joinPath(path, field), issues);
  }
  collectCountRecordIssues(value.sources, joinPath(path, "sources"), issues);
  collectCountRecordIssues(value.statuses, joinPath(path, "statuses"), issues);
}

function collectEvidenceArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "evidence must be an array" });
    return;
  }

  value.forEach((item, index) => {
    collectEvidenceItemIssues(item, `${path}.${index}`, issues);
  });
}

function collectEvidenceItemIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "evidence item must be an object" });
    return;
  }

  requireNonEmptyString(value, "id", joinPath(path, "id"), issues);
  requireIsoTimestamp(value, "timestamp", joinPath(path, "timestamp"), issues);
  requireOneOf(value, "source", joinPath(path, "source"), SOURCE_KINDS, issues);
  requireNonEmptyString(value, "kind", joinPath(path, "kind"), issues);
  requireOneOf(value, "status", joinPath(path, "status"), EVIDENCE_STATUSES, issues);
  requireNonEmptyString(value, "title", joinPath(path, "title"), issues);
  collectEvidenceSubjectIssues(value.subject, joinPath(path, "subject"), issues);
  requireSha256Fingerprint(value, "fingerprint", joinPath(path, "fingerprint"), issues);
  requireOptionalString(value, "actorId", joinPath(path, "actorId"), issues);
  requireOptionalString(value, "decision", joinPath(path, "decision"), issues);
  requireOptionalString(value, "reason", joinPath(path, "reason"), issues);
  if (value.arguments !== undefined) {
    collectJsonObjectIssues(value.arguments, joinPath(path, "arguments"), issues);
  }
  if (value.request !== undefined) {
    collectJsonObjectIssues(value.request, joinPath(path, "request"), issues);
  }
  if (value.metadata !== undefined) {
    collectJsonObjectIssues(value.metadata, joinPath(path, "metadata"), issues);
  }
  requireOptionalString(value, "resultSummary", joinPath(path, "resultSummary"), issues);
  if (value.safety !== undefined) {
    collectJsonObjectIssues(value.safety, joinPath(path, "safety"), issues);
  }
}

function collectEvidenceSubjectIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "subject must be an object" });
    return;
  }

  collectAllowedKeys(value, path, EVIDENCE_SUBJECT_KEYS, issues);
  requireOneOf(value, "type", joinPath(path, "type"), EVIDENCE_SUBJECT_TYPES, issues);
  requireOptionalString(value, "id", joinPath(path, "id"), issues);
  requireOptionalString(value, "name", joinPath(path, "name"), issues);
  requireOptionalString(value, "uri", joinPath(path, "uri"), issues);
  requireOptionalString(value, "capability", joinPath(path, "capability"), issues);
}

function collectPreviewConsistencyIssues(
  value: Record<string, unknown>,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value.summary) || !Array.isArray(value.evidence)) {
    return;
  }

  if (
    Number.isInteger(value.summary.returnedEvidenceCount) &&
    value.summary.returnedEvidenceCount !== value.evidence.length
  ) {
    issues.push({
      path: "summary.returnedEvidenceCount",
      message: "returnedEvidenceCount must match evidence length",
    });
  }
}

function collectCountRecordIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "value must be an object of counts" });
    return;
  }

  for (const [key, count] of Object.entries(value)) {
    if (typeof key !== "string" || key.trim().length === 0) {
      issues.push({ path, message: "count keys must be non-empty strings" });
    }
    if (!Number.isInteger(count) || (count as number) < 0) {
      issues.push({ path: joinPath(path, key), message: "count must be a non-negative integer" });
    }
  }
}

function collectJsonObjectIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  requireNonEmpty = false,
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "value must be a JSON object" });
    return;
  }
  if (requireNonEmpty && Object.keys(value).length === 0) {
    issues.push({ path, message: "value must not be empty" });
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
      collectJsonIssues(nested, joinPath(path, key), issues, seen);
    }
    seen.delete(value);
    return;
  }

  issues.push({ path, message: "value must be JSON-compatible" });
}

function collectStringArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
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

function collectOptionalEnumArrayIssues<T extends string>(
  value: unknown,
  path: string,
  allowed: readonly T[],
  issues: ValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    issues.push({ path, message: `value must be an array of ${allowed.join(", ")}` });
    return;
  }

  value.forEach((item, index) => {
    if (typeof item !== "string" || !allowed.includes(item as T)) {
      issues.push({ path: `${path}.${index}`, message: `value must be one of ${allowed.join(", ")}` });
    }
  });
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
  if (typeof value[field] !== "string" || !allowed.includes(value[field] as T)) {
    issues.push({ path, message: `${field} must be one of ${allowed.join(", ")}` });
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

function requireSha256Fingerprint(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (
    typeof value[field] !== "string" ||
    !SHA256_FINGERPRINT_PATTERN.test(value[field] as string)
  ) {
    issues.push({ path, message: `${field} must be a sha256 fingerprint` });
  }
}

function throwRequestIssues(message: string, issues: readonly ValidationIssue[]): void {
  if (issues.length > 0) {
    throw new ApiRequestValidationError(message, issues);
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
