import {
  ApiNetworkError,
  ApiRequestValidationError,
  ApiResponseValidationError,
  type AuditRecord,
  type FetchLike,
  type FetchRequestInit,
  type FetchResponseLike,
  parseJsonApiResponse,
  type SovereignOpsClientOptions,
  type ValidationIssue,
} from "./client.ts";
import {
  LOCAL_WORKSPACE_SESSION_SCHEMA_VERSION,
  LocalWorkspaceSessionError,
  normalizeLocalWorkspaceDescriptor,
  normalizeLocalWorkspaceGateway,
  planLocalWorkspaceSessionLockEvent,
  planLocalWorkspaceSessionOpenEvent,
  planLocalWorkspaceSessionUnlockEvent,
  type LocalWorkspaceDescriptor,
  type LocalWorkspaceDescriptorInput,
  type LocalWorkspaceGatewayDescriptor,
  type LocalWorkspaceSessionEvent,
  type LocalWorkspaceSessionOperation,
} from "./localWorkspaceSession.ts";

export type LocalWorkspaceSessionApiClientOptions = SovereignOpsClientOptions;

export const WORKSPACE_SESSION_API_SCHEMA_VERSION = "workspace-session-api/v1";

export interface LocalWorkspaceSessionSummaryRequest {
  readonly descriptor: LocalWorkspaceDescriptorInput | LocalWorkspaceDescriptor;
  readonly sessionId?: string;
  readonly operations?: readonly LocalWorkspaceSessionOperation[];
}

export interface LocalWorkspaceSessionSummaryStorage {
  readonly localOnly: true;
  readonly storagePath: string;
  readonly storagePathRedacted: true;
}

export interface LocalWorkspaceSessionSummarySession {
  readonly sessionId: string;
  readonly operations: readonly LocalWorkspaceSessionOperation[];
}

export interface LocalWorkspaceSessionSummaryResponse {
  readonly kind: "workspace-session.summary";
  readonly schemaVersion: typeof WORKSPACE_SESSION_API_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly durableWrites: false;
  readonly workspaceId: string;
  readonly deviceId: string;
  readonly storage: LocalWorkspaceSessionSummaryStorage;
  readonly gateway: LocalWorkspaceGatewayDescriptor;
  readonly session?: LocalWorkspaceSessionSummarySession;
}

export interface LocalWorkspaceSessionEventPlanInput {
  readonly operation: LocalWorkspaceSessionOperation;
  readonly sequence?: number;
  readonly cursor?: string;
  readonly createdAt?: string;
  readonly reason?: string;
  readonly lockToken?: string;
}

export interface LocalWorkspaceSessionAuditPreviewRequest {
  readonly descriptor: LocalWorkspaceDescriptorInput | LocalWorkspaceDescriptor;
  readonly sessionId: string;
  readonly events: readonly LocalWorkspaceSessionEventPlanInput[];
  readonly actor?: string;
  readonly createdAt?: string;
}

export type LocalWorkspaceSessionPreviewEvent =
  Omit<LocalWorkspaceSessionEvent, "payload"> & {
    readonly payload:
      Omit<NonNullable<LocalWorkspaceSessionEvent["payload"]>, "storagePath"> & {
        readonly storagePath: string;
        readonly storagePathRedacted: true;
      };
  };

export interface LocalWorkspaceSessionAuditPreviewRecords {
  readonly kind: "workspace-session.audit-preview.records";
  readonly localOnly: true;
  readonly redacted: true;
  readonly recordCount: number;
  readonly records: readonly AuditRecord[];
}

export interface LocalWorkspaceSessionAuditPreviewResponse {
  readonly kind: "workspace-session.audit-preview";
  readonly schemaVersion: typeof WORKSPACE_SESSION_API_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly durableWrites: false;
  readonly summary: LocalWorkspaceSessionSummaryResponse;
  readonly events: readonly LocalWorkspaceSessionPreviewEvent[];
  readonly audit: LocalWorkspaceSessionAuditPreviewRecords;
}

type Validator<T> = (value: unknown) => T;

const SUMMARY_ENDPOINT = "workspace-session/summary";
const AUDIT_PREVIEW_ENDPOINT = "workspace-session/audit-preview";
const SESSION_ID_PATTERN = /^sess_[A-Za-z0-9_-]{1,88}$/;
const WORKSPACE_ID_PATTERN = /^wsp_[A-Za-z0-9_-]{1,88}$/;
const DEVICE_ID_PATTERN = /^dev_[A-Za-z0-9_-]{1,88}$/;
const EVENT_ID_PATTERN = /^evt_[A-Za-z0-9_-]{1,160}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const REDACTED_VALUE_PATTERN = /^\[redacted:[A-Za-z0-9_-]+:[a-z0-9]+\]$/;
const LOCAL_GATEWAY_TRANSPORTS = Object.freeze(["http", "stdio"] as const);
const LOCAL_GATEWAY_HOSTS = Object.freeze(["127.0.0.1", "localhost"] as const);
const LOCAL_WORKSPACE_SESSION_OPERATIONS = Object.freeze([
  "open",
  "lock",
  "unlock",
] satisfies readonly LocalWorkspaceSessionOperation[]);
const LOCAL_WORKSPACE_SESSION_EVENT_TYPES = Object.freeze([
  "workspace.session.opened",
  "workspace.session.locked",
  "workspace.session.unlocked",
] as const);

export class LocalWorkspaceSessionApiClient {
  readonly #baseUrl: string;
  readonly #fetch: FetchLike;
  readonly #apiKey?: string;
  readonly #headers: Readonly<Record<string, string>>;

  constructor(options: LocalWorkspaceSessionApiClientOptions) {
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

  async getSummary(
    request: LocalWorkspaceSessionSummaryRequest,
  ): Promise<LocalWorkspaceSessionSummaryResponse> {
    const body = normalizeSummaryRequest(request);
    return this.#request(
      SUMMARY_ENDPOINT,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      parseLocalWorkspaceSessionSummaryResponse,
    );
  }

  async summary(
    request: LocalWorkspaceSessionSummaryRequest,
  ): Promise<LocalWorkspaceSessionSummaryResponse> {
    return this.getSummary(request);
  }

  async previewAudit(
    request: LocalWorkspaceSessionAuditPreviewRequest,
  ): Promise<LocalWorkspaceSessionAuditPreviewResponse> {
    const body = normalizeAuditPreviewRequest(request);
    return this.#request(
      AUDIT_PREVIEW_ENDPOINT,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      parseLocalWorkspaceSessionAuditPreviewResponse,
    );
  }

  async auditPreview(
    request: LocalWorkspaceSessionAuditPreviewRequest,
  ): Promise<LocalWorkspaceSessionAuditPreviewResponse> {
    return this.previewAudit(request);
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

export function createLocalWorkspaceSessionApiClient(
  options: LocalWorkspaceSessionApiClientOptions,
): LocalWorkspaceSessionApiClient {
  return new LocalWorkspaceSessionApiClient(options);
}

function normalizeSummaryRequest(
  request: LocalWorkspaceSessionSummaryRequest,
): LocalWorkspaceSessionSummaryRequest {
  const issues: ValidationIssue[] = [];
  if (!isRecord(request)) {
    throw new ApiRequestValidationError("local workspace session summary request is invalid", [
      { path: "request", message: "request must be an object" },
    ]);
  }

  const descriptor = normalizeDescriptorForRequest(request.descriptor, "descriptor", issues);
  const sessionId = request.sessionId === undefined
    ? undefined
    : readSessionId(request.sessionId, "sessionId", issues);
  const operations = request.operations === undefined
    ? undefined
    : readOperations(request.operations, "operations", issues);

  if (issues.length > 0 || descriptor === undefined) {
    throw new ApiRequestValidationError(
      "local workspace session summary request is invalid",
      issues,
    );
  }

  return deepFreezeClone({
    descriptor,
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(operations === undefined ? {} : { operations }),
  });
}

function normalizeAuditPreviewRequest(
  request: LocalWorkspaceSessionAuditPreviewRequest,
): LocalWorkspaceSessionAuditPreviewRequest {
  const issues: ValidationIssue[] = [];
  if (!isRecord(request)) {
    throw new ApiRequestValidationError("local workspace session audit preview request is invalid", [
      { path: "request", message: "request must be an object" },
    ]);
  }

  const descriptor = normalizeDescriptorForRequest(request.descriptor, "descriptor", issues);
  const sessionId = readSessionId(request.sessionId, "sessionId", issues);
  const events = readEventPlans(
    request.events,
    "events",
    descriptor,
    sessionId,
    issues,
  );

  if (request.actor !== undefined && !isNonEmptyString(request.actor)) {
    issues.push({ path: "actor", message: "actor must be a non-empty string when provided" });
  }
  if (request.createdAt !== undefined && !isIsoTimestamp(request.createdAt)) {
    issues.push({ path: "createdAt", message: "createdAt must be an ISO timestamp when provided" });
  }

  if (
    issues.length > 0 ||
    descriptor === undefined ||
    sessionId === undefined ||
    events === undefined
  ) {
    throw new ApiRequestValidationError(
      "local workspace session audit preview request is invalid",
      issues,
    );
  }

  return deepFreezeClone({
    descriptor,
    sessionId,
    events,
    ...(request.actor === undefined ? {} : { actor: request.actor }),
    ...(request.createdAt === undefined ? {} : { createdAt: request.createdAt }),
  });
}

function parseLocalWorkspaceSessionSummaryResponse(
  value: unknown,
): LocalWorkspaceSessionSummaryResponse {
  const issues: ValidationIssue[] = [];
  collectSummaryResponseIssues(value, "", issues);
  if (issues.length > 0) {
    throw new ApiResponseValidationError(issues, value);
  }

  return deepFreezeClone(value) as LocalWorkspaceSessionSummaryResponse;
}

function parseLocalWorkspaceSessionAuditPreviewResponse(
  value: unknown,
): LocalWorkspaceSessionAuditPreviewResponse {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw new ApiResponseValidationError([
      { path: "", message: "response must be an object" },
    ], value);
  }

  requireLiteral(value, "kind", "kind", "workspace-session.audit-preview", issues);
  requireLiteral(value, "schemaVersion", "schemaVersion", WORKSPACE_SESSION_API_SCHEMA_VERSION, issues);
  requireTrue(value, "localOnly", "localOnly", issues);
  requireFalse(value, "durableWrites", "durableWrites", issues);
  collectSummaryResponseIssues(value.summary, "summary", issues);
  if (!Array.isArray(value.events)) {
    issues.push({ path: "events", message: "events must be an array" });
  } else {
    value.events.forEach((event, index) =>
      collectPreviewEventIssues(event, `events.${index}`, issues)
    );
  }
  collectAuditPreviewRecordsIssues(value.audit, "audit", issues);

  if (issues.length > 0) {
    throw new ApiResponseValidationError(issues, value);
  }

  return deepFreezeClone(value) as LocalWorkspaceSessionAuditPreviewResponse;
}

function collectSummaryResponseIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: `${path || "response"} must be an object` });
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
  collectSummaryStorageIssues(value.storage, joinPath(path, "storage"), issues);
  collectGatewayIssues(value.gateway, joinPath(path, "gateway"), issues);
  if (value.session !== undefined) {
    collectSummarySessionIssues(value.session, joinPath(path, "session"), issues);
  }
}

function collectSummaryStorageIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "storage must be an object" });
    return;
  }

  requireTrue(value, "localOnly", joinPath(path, "localOnly"), issues);
  requireNonEmptyString(value, "storagePath", joinPath(path, "storagePath"), issues);
  requireTrue(value, "storagePathRedacted", joinPath(path, "storagePathRedacted"), issues);
  if (typeof value.storagePath === "string" && !REDACTED_VALUE_PATTERN.test(value.storagePath)) {
    issues.push({ path: joinPath(path, "storagePath"), message: "storagePath must be redacted" });
  }
}

function collectSummarySessionIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "session must be an object" });
    return;
  }

  readSessionId(value.sessionId, joinPath(path, "sessionId"), issues);
  readOperations(value.operations, joinPath(path, "operations"), issues);
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
  } else {
    collectAuditRecordsIssues(value.records, joinPath(path, "records"), issues);
    if (
      Number.isInteger(value.recordCount) &&
      value.records.length !== value.recordCount
    ) {
      issues.push({
        path: joinPath(path, "recordCount"),
        message: "recordCount must match records length",
      });
    }
  }
}

function collectPreviewEventIssues(
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
  requireAllowedString(
    value.type,
    joinPath(path, "type"),
    LOCAL_WORKSPACE_SESSION_EVENT_TYPES,
    issues,
  );
  requireNonEmptyString(value, "cursor", joinPath(path, "cursor"), issues);
  requirePositiveInteger(value, "sequence", joinPath(path, "sequence"), issues);
  requirePattern(value, "deviceId", joinPath(path, "deviceId"), DEVICE_ID_PATTERN, issues);
  requireIsoTimestamp(value, "createdAt", joinPath(path, "createdAt"), issues);
  collectPreviewEventPayloadIssues(value.payload, joinPath(path, "payload"), issues);
}

function collectPreviewEventPayloadIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "payload must be an object" });
    return;
  }

  requireLiteral(value, "kind", joinPath(path, "kind"), "localWorkspaceSession", issues);
  requireLiteral(
    value,
    "schemaVersion",
    joinPath(path, "schemaVersion"),
    LOCAL_WORKSPACE_SESSION_SCHEMA_VERSION,
    issues,
  );
  requireAllowedString(
    value.operation,
    joinPath(path, "operation"),
    LOCAL_WORKSPACE_SESSION_OPERATIONS,
    issues,
  );
  readSessionId(value.sessionId, joinPath(path, "sessionId"), issues);
  requireTrue(value, "localOnly", joinPath(path, "localOnly"), issues);
  requireNonEmptyString(value, "storagePath", joinPath(path, "storagePath"), issues);
  requireTrue(value, "storagePathRedacted", joinPath(path, "storagePathRedacted"), issues);
  if (typeof value.storagePath === "string" && !REDACTED_VALUE_PATTERN.test(value.storagePath)) {
    issues.push({ path: joinPath(path, "storagePath"), message: "storagePath must be redacted" });
  }
  requireNonEmptyString(value, "storagePathDisplay", joinPath(path, "storagePathDisplay"), issues);
  collectGatewayIssues(value.gateway, joinPath(path, "gateway"), issues);
  if (value.lock !== undefined) {
    collectLockPayloadIssues(value.lock, joinPath(path, "lock"), issues);
  }
  requireOptionalNonEmptyString(value, "reason", joinPath(path, "reason"), issues);
}

function collectLockPayloadIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "lock must be an object" });
    return;
  }

  requireNonEmptyString(value, "lockTokenRef", joinPath(path, "lockTokenRef"), issues);
  if (
    typeof value.lockTokenRef === "string" &&
    !/^\[redacted:lockToken:[a-z0-9]+\]$/.test(value.lockTokenRef)
  ) {
    issues.push({ path: joinPath(path, "lockTokenRef"), message: "lockTokenRef must be redacted" });
  }
}

function collectGatewayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "gateway must be an object" });
    return;
  }

  requireAllowedString(
    value.transport,
    joinPath(path, "transport"),
    LOCAL_GATEWAY_TRANSPORTS,
    issues,
  );
  if (value.transport === "http") {
    requireAllowedString(value.host, joinPath(path, "host"), LOCAL_GATEWAY_HOSTS, issues);
    requirePort(value, "port", joinPath(path, "port"), issues);
  }
  if (value.transport === "stdio") {
    if (value.host !== undefined) {
      issues.push({ path: joinPath(path, "host"), message: "stdio gateway must not include host" });
    }
    if (value.port !== undefined) {
      issues.push({ path: joinPath(path, "port"), message: "stdio gateway must not include port" });
    }
  }

  try {
    normalizeLocalWorkspaceGateway(value as LocalWorkspaceGatewayDescriptor);
  } catch (error) {
    issues.push(...issuesFromLocalWorkspaceSessionError(error, path));
  }
}

function normalizeDescriptorForRequest(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): LocalWorkspaceDescriptor | undefined {
  try {
    return normalizeLocalWorkspaceDescriptor(
      value as LocalWorkspaceDescriptorInput | LocalWorkspaceDescriptor,
    ) as LocalWorkspaceDescriptor;
  } catch (error) {
    issues.push(...issuesFromLocalWorkspaceSessionError(error, path));
    return undefined;
  }
}

function readSessionId(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): string | undefined {
  if (typeof value !== "string" || !SESSION_ID_PATTERN.test(value.trim())) {
    issues.push({ path, message: "sessionId must use the sess_ prefix" });
    return undefined;
  }

  return value.trim();
}

function readOperations(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): readonly LocalWorkspaceSessionOperation[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "operations must be an array" });
    return undefined;
  }

  const operations: LocalWorkspaceSessionOperation[] = [];
  value.forEach((operation, index) => {
    if (!isLocalWorkspaceSessionOperation(operation)) {
      issues.push({
        path: `${path}.${index}`,
        message: "operation must be open, lock, or unlock",
      });
      return;
    }
    operations.push(operation);
  });

  return operations;
}

function readEventPlans(
  value: unknown,
  path: string,
  descriptor: LocalWorkspaceDescriptor | undefined,
  sessionId: string | undefined,
  issues: ValidationIssue[],
): readonly LocalWorkspaceSessionEventPlanInput[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push({ path, message: "events must be a non-empty array" });
    return undefined;
  }

  const events: LocalWorkspaceSessionEventPlanInput[] = [];
  value.forEach((event, index) => {
    const itemPath = `${path}.${index}`;
    if (!isRecord(event)) {
      issues.push({ path: itemPath, message: "event plan must be an object" });
      return;
    }

    const operation = readOperation(event.operation, joinPath(itemPath, "operation"), issues);
    requireOptionalPositiveInteger(event, "sequence", joinPath(itemPath, "sequence"), issues);
    requireOptionalNonEmptyString(event, "cursor", joinPath(itemPath, "cursor"), issues);
    if (event.createdAt !== undefined && !isIsoTimestamp(event.createdAt)) {
      issues.push({
        path: joinPath(itemPath, "createdAt"),
        message: "createdAt must be an ISO timestamp when provided",
      });
    }
    requireOptionalNonEmptyString(event, "reason", joinPath(itemPath, "reason"), issues);
    requireOptionalNonEmptyString(event, "lockToken", joinPath(itemPath, "lockToken"), issues);
    if (operation === "open" && event.lockToken !== undefined) {
      issues.push({ path: joinPath(itemPath, "lockToken"), message: "open events must not include lockToken" });
    }
    if (operation === "unlock" && event.lockToken === undefined) {
      issues.push({ path: joinPath(itemPath, "lockToken"), message: "unlock events require lockToken" });
    }

    if (operation === undefined) {
      return;
    }

    const planned = optionalFields({
      operation,
      sequence: event.sequence,
      cursor: event.cursor,
      createdAt: event.createdAt,
      reason: event.reason,
      lockToken: event.lockToken,
    }) as LocalWorkspaceSessionEventPlanInput;

    if (descriptor !== undefined && sessionId !== undefined) {
      collectPlannedEventIssues(descriptor, sessionId, planned, itemPath, issues);
    }

    events.push(planned);
  });

  return events;
}

function collectPlannedEventIssues(
  descriptor: LocalWorkspaceDescriptor,
  sessionId: string,
  event: LocalWorkspaceSessionEventPlanInput,
  path: string,
  issues: ValidationIssue[],
): void {
  try {
    const base = {
      descriptor,
      sessionId,
      sequence: event.sequence,
      cursor: event.cursor,
      createdAt: event.createdAt,
      reason: event.reason,
    };
    if (event.operation === "open") {
      planLocalWorkspaceSessionOpenEvent(base);
      return;
    }
    if (event.operation === "lock") {
      planLocalWorkspaceSessionLockEvent({
        ...base,
        lockToken: event.lockToken,
      });
      return;
    }
    planLocalWorkspaceSessionUnlockEvent({
      ...base,
      lockToken: event.lockToken as string,
    });
  } catch (error) {
    issues.push(...issuesFromLocalWorkspaceSessionError(error, path));
  }
}

function readOperation(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): LocalWorkspaceSessionOperation | undefined {
  if (!isLocalWorkspaceSessionOperation(value)) {
    issues.push({ path, message: "operation must be open, lock, or unlock" });
    return undefined;
  }

  return value;
}

function collectAuditRecordsIssues(
  value: readonly unknown[],
  path: string,
  issues: ValidationIssue[],
): void {
  value.forEach((record, index) => {
    const recordPath = `${path}.${index}`;
    if (!isRecord(record)) {
      issues.push({ path: recordPath, message: "audit record must be an object" });
      return;
    }
    requireNonEmptyString(record, "auditId", joinPath(recordPath, "auditId"), issues);
    requireNonEmptyString(record, "action", joinPath(recordPath, "action"), issues);
    requireIsoTimestamp(record, "createdAt", joinPath(recordPath, "createdAt"), issues);
    requireOptionalNonEmptyString(record, "workspaceId", joinPath(recordPath, "workspaceId"), issues);
    requireOptionalNonEmptyString(record, "actor", joinPath(recordPath, "actor"), issues);
    if (record.details !== undefined) {
      collectJsonObjectIssues(record.details, joinPath(recordPath, "details"), issues);
    }
  });
}

function collectJsonObjectIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "details must be an object when provided" });
    return;
  }
  collectJsonIssues(value, path, issues);
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

function issuesFromLocalWorkspaceSessionError(
  error: unknown,
  fallbackPath: string,
): ValidationIssue[] {
  if (!(error instanceof LocalWorkspaceSessionError)) {
    return [{ path: fallbackPath, message: "value is invalid" }];
  }

  const details = error.details;
  if (Array.isArray(details?.issues)) {
    return details.issues.map((issue, index) => {
      if (!isRecord(issue)) {
        return { path: fallbackPath, message: error.message };
      }
      return {
        path: joinPath(fallbackPath, typeof issue.path === "string" ? issue.path : String(index)),
        message: typeof issue.message === "string" ? issue.message : error.message,
      };
    });
  }

  return [{
    path: typeof details?.path === "string" ? joinPath(fallbackPath, details.path) : fallbackPath,
    message: error.message,
  }];
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

function requireAllowedString<TValue extends string>(
  value: unknown,
  path: string,
  allowed: readonly TValue[],
  issues: ValidationIssue[],
): void {
  if (typeof value !== "string" || !allowed.includes(value as TValue)) {
    issues.push({ path, message: `value must be one of ${allowed.join(", ")}` });
  }
}

function requireIsoTimestamp(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (typeof record[key] !== "string" || !isIsoTimestamp(record[key])) {
    issues.push({ path, message: `${key} must be an ISO timestamp` });
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
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): void {
  const value = record[key];
  if (value !== undefined && (!Number.isSafeInteger(value) || (value as number) <= 0)) {
    issues.push({ path, message: `${key} must be a positive safe integer when provided` });
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

function requirePort(
  record: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
  issues: ValidationIssue[],
): void {
  const value = record[key];
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 65535) {
    issues.push({ path, message: `${key} must be an integer from 0 to 65535` });
  }
}

function isLocalWorkspaceSessionOperation(
  value: unknown,
): value is LocalWorkspaceSessionOperation {
  return (
    typeof value === "string" &&
    LOCAL_WORKSPACE_SESSION_OPERATIONS.includes(value as LocalWorkspaceSessionOperation)
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_TIMESTAMP_PATTERN.test(value)) {
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

function joinPath(parent: string, child: string): string {
  if (parent.length === 0) {
    return child;
  }
  if (child.length === 0) {
    return parent;
  }
  return `${parent}.${child}`;
}

function optionalFields<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T;
}

function hasHeader(headers: Readonly<Record<string, string>>, name: string): boolean {
  const normalized = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === normalized);
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
