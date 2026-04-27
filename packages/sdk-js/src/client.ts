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

export type AuditExportEntityInput = string | JsonObject;

export interface AuditExportEventInput {
  readonly eventId?: string;
  readonly timestamp: string;
  readonly type: string;
  readonly decision?: string | null;
  readonly actor?: AuditExportEntityInput | null;
  readonly target?: AuditExportEntityInput | null;
  readonly reason?: string | null;
  readonly attributes?: JsonObject;
  readonly context?: JsonObject;
}

export interface AuditExportFilters {
  readonly decision?: string | readonly string[] | null;
  readonly decisions?: string | readonly string[] | null;
  readonly type?: string | readonly string[] | null;
  readonly types?: string | readonly string[] | null;
  readonly from?: string | null;
  readonly fromTimestamp?: string | null;
  readonly to?: string | null;
  readonly toTimestamp?: string | null;
}

export interface AuditExportOptions {
  readonly createdAt?: string;
  readonly exportId?: string;
  readonly filters?: AuditExportFilters;
}

export interface AuditExportRequest extends AuditExportOptions {
  readonly events: readonly AuditExportEventInput[];
}

export interface NormalizedAuditExportFilters {
  readonly decisions: readonly string[];
  readonly types: readonly string[];
  readonly fromTimestamp: string | null;
  readonly toTimestamp: string | null;
}

export interface AuditExportContentDescriptor {
  readonly fingerprint: string;
  readonly mediaType: string;
  readonly bytes: number;
  readonly rows?: number;
  readonly lines?: number;
  readonly columns?: readonly string[];
}

export interface AuditExportManifest {
  readonly kind: "audit-export.manifest";
  readonly version: number;
  readonly exportId: string;
  readonly createdAt: string;
  readonly eventCount: number;
  readonly firstTimestamp: string | null;
  readonly lastTimestamp: string | null;
  readonly decisions: readonly string[];
  readonly types: readonly string[];
  readonly filters: NormalizedAuditExportFilters;
  readonly eventFingerprints: readonly string[];
  readonly jsonl: AuditExportContentDescriptor;
  readonly csv: AuditExportContentDescriptor;
  readonly fingerprint: string;
}

export interface AuditExportJsonlResponse {
  readonly jsonl: string;
  readonly manifest: AuditExportManifest;
}

export interface AuditExportCsvResponse {
  readonly csv: string;
  readonly manifest: AuditExportManifest;
}

export interface AuditExportPackage {
  readonly kind: "audit-export.package";
  readonly version: number;
  readonly manifest: AuditExportManifest;
  readonly jsonl: string;
  readonly csv: string;
  readonly fingerprint: string;
}

export interface MigrationPlanRequest {
  readonly workspaceId: string;
  readonly metadata: JsonObject;
  readonly targetVersion?: number;
}

export interface MigrationRunRequest extends MigrationPlanRequest {
  readonly dryRun?: boolean;
}

export interface MigrationStepDescriptor {
  readonly id: string;
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly summary: string;
  readonly rollbackNote: string;
}

export interface MigrationPlanStep extends MigrationStepDescriptor {
  readonly fingerprint: string;
}

export interface MigrationPlanSummary {
  readonly sourceVersion: number;
  readonly targetVersion: number;
  readonly stepCount: number;
  readonly stepIds: readonly string[];
  readonly alreadyCurrent: boolean;
  readonly dryRun: true;
  readonly sourceFingerprint: string;
  readonly fingerprint: string;
}

export interface MigrationPlanResponse {
  readonly sourceVersion: number;
  readonly targetVersion: number;
  readonly steps: readonly MigrationPlanStep[];
  readonly rollbackNotes: readonly string[];
  readonly alreadyCurrent: boolean;
  readonly dryRun: true;
  readonly summary: MigrationPlanSummary;
  readonly fingerprint: string;
}

export type MigrationAppliedStepStatus = "applied" | "skipped";

export interface MigrationAppliedStep extends MigrationStepDescriptor {
  readonly status: MigrationAppliedStepStatus;
  readonly fingerprintBefore: string;
  readonly fingerprintAfter: string;
}

export interface MigrationRunSummary {
  readonly sourceVersion: number;
  readonly targetVersion: number;
  readonly plannedStepCount: number;
  readonly appliedStepCount: number;
  readonly skippedStepCount: number;
  readonly dryRun: boolean;
  readonly sourceFingerprint: string;
  readonly targetFingerprint: string;
  readonly fingerprint: string;
}

export interface MigrationRunResponse {
  readonly metadata: JsonObject;
  readonly plan: MigrationPlanResponse;
  readonly appliedSteps: readonly MigrationAppliedStep[];
  readonly rollbackNotes: readonly string[];
  readonly summary: MigrationRunSummary;
  readonly fingerprint: string;
}

export type BackupPayloadKind = "workspace_state" | "record" | "asset" | "settings";
export type RestoreMode = "preview" | "merge" | "replace";
export type RestoreActionType = "restore" | "skip" | "conflict" | "blocked";

export interface BackupEncryptionMetadata {
  readonly algorithm: string;
  readonly keyId: string;
  readonly keyFingerprint: string;
}

export interface BackupPayloadEncryptionMetadata {
  readonly algorithm: string;
  readonly keyId: string;
  readonly nonceFingerprint: string;
  readonly encryptedPayloadFingerprint: string;
}

export interface BackupPayloadIntegrity {
  readonly plaintextFingerprint: string;
  readonly encryptedPayloadFingerprint: string;
  readonly descriptorFingerprint: string;
}

export interface BackupPayloadDescriptor {
  readonly id: string;
  readonly kind: BackupPayloadKind;
  readonly path: string;
  readonly plaintextByteSize: number;
  readonly encryptedByteSize: number;
  readonly contentType?: string;
  readonly createdAt: string;
  readonly encryption: BackupPayloadEncryptionMetadata;
  readonly integrity: BackupPayloadIntegrity;
}

export interface BackupManifest {
  readonly manifestVersion: string;
  readonly backupId: string;
  readonly workspaceId: string;
  readonly createdAt: string;
  readonly createdByActorId: string;
  readonly encryption: BackupEncryptionMetadata;
  readonly payloads: readonly BackupPayloadDescriptor[];
  readonly manifestFingerprint: string;
}

export interface BackupManifestSubmitRequest {
  readonly workspaceId: string;
  readonly manifest: BackupManifest;
}

export interface RestoreSafetyResult {
  readonly safe: boolean;
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
}

export interface RestorePlanRequest {
  readonly targetWorkspaceId: string;
  readonly manifest: BackupManifest;
  readonly mode?: RestoreMode;
  readonly allowSourceWorkspaceOverwrite?: boolean;
  readonly allowDestructiveRestore?: boolean;
  readonly trustedManifestFingerprints?: readonly string[];
  readonly availablePayloadIds?: readonly string[];
  readonly maxManifestAgeDays?: number;
  readonly now?: string;
  readonly includePayloadIds?: readonly string[];
  readonly excludePayloadIds?: readonly string[];
  readonly existingPayloadFingerprints?: Readonly<Record<string, string>>;
}

export interface RestorePlanAction {
  readonly type: RestoreActionType;
  readonly payloadId: string;
  readonly kind: BackupPayloadKind;
  readonly path: string;
  readonly reason: string;
  readonly sourceFingerprint: string;
  readonly targetFingerprint?: string;
}

export interface RestorePlanSummary {
  readonly restore: number;
  readonly skip: number;
  readonly conflict: number;
  readonly blocked: number;
}

export interface RestorePlanResponse {
  readonly backupId: string;
  readonly workspaceId: string;
  readonly targetWorkspaceId: string;
  readonly mode: RestoreMode;
  readonly canRun: boolean;
  readonly safety: RestoreSafetyResult;
  readonly actions: readonly RestorePlanAction[];
  readonly summary: RestorePlanSummary;
}

export type ObservationLevel = "debug" | "info" | "warn" | "error";
export type ObservabilityMetricKind = "counter" | "gauge" | "histogram";

export interface ObservabilityResourceDescriptor {
  readonly serviceName: string;
  readonly serviceVersion?: string;
  readonly instanceId?: string;
  readonly workspaceId?: string;
  readonly attributes?: JsonObject;
}

export interface ObservabilityEventSubmitRequest {
  readonly name: string;
  readonly level?: ObservationLevel;
  readonly timestamp?: string;
  readonly message?: string;
  readonly resource?: ObservabilityResourceDescriptor;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly attributes?: JsonObject;
}

export interface ObservabilityEvent {
  readonly kind: "event";
  readonly sequence: number;
  readonly name: string;
  readonly level: ObservationLevel;
  readonly timestamp: string;
  readonly message?: string;
  readonly resource?: ObservabilityResourceDescriptor;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly attributes: JsonObject;
  readonly redactedPaths: readonly string[];
}

export interface ObservabilityMetricBase {
  readonly kind: ObservabilityMetricKind;
  readonly name: string;
  readonly unit?: string;
  readonly description?: string;
  readonly attributes: JsonObject;
  readonly updatedAt: string;
  readonly redactedPaths: readonly string[];
}

export interface CounterMetric extends ObservabilityMetricBase {
  readonly kind: "counter";
  readonly value: number;
}

export interface GaugeMetric extends ObservabilityMetricBase {
  readonly kind: "gauge";
  readonly value: number;
}

export interface HistogramBucket {
  readonly le: number;
  readonly count: number;
}

export interface HistogramMetric extends ObservabilityMetricBase {
  readonly kind: "histogram";
  readonly count: number;
  readonly sum: number;
  readonly min: number | null;
  readonly max: number | null;
  readonly buckets: readonly HistogramBucket[];
  readonly overflow: number;
}

export type ObservabilityMetric =
  | CounterMetric
  | GaugeMetric
  | HistogramMetric;

export interface CompactionPlanRequest {
  readonly workspaceId: string;
  readonly fromSequence: number;
  readonly toSequence: number;
  readonly reducerVersion: string;
  readonly sourceEventCount: number;
  readonly sourceByteCount?: number;
  readonly targetByteLimit?: number;
  readonly checkpointFingerprint?: string;
}

export interface CompactionPlanResponse {
  readonly workspaceId: string;
  readonly fromSequence: number;
  readonly toSequence: number;
  readonly reducerVersion: string;
  readonly checkpointFingerprint: string;
  readonly sourceEventCount: number;
  readonly compactedByteCount: number;
  readonly dryRun: true;
  readonly rollbackNote: string;
  readonly fingerprint: string;
}

export interface McpActor {
  readonly id: string;
  readonly roles?: readonly string[];
  readonly metadata?: JsonObject;
}

export type McpActorInput = string | McpActor;

export interface McpRequestContext {
  readonly actor?: McpActorInput;
  readonly metadata?: JsonObject;
}

export interface McpResourceSummary {
  readonly uri: string;
  readonly name: string;
  readonly description?: string;
  readonly mimeType?: string;
}

export interface McpListResourcesResponse {
  readonly resources: readonly McpResourceSummary[];
}

export interface McpReadResourceRequest extends McpRequestContext {
  readonly uri: string;
}

export interface McpResourceContent {
  readonly uri: string;
  readonly mimeType?: string;
  readonly text?: string;
  readonly blob?: string;
}

export interface McpReadResourceResponse {
  readonly contents: readonly McpResourceContent[];
}

export interface McpToolInputSchema {
  readonly type: "object";
  readonly properties?: JsonObject;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
}

export interface McpToolDescriptor {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: McpToolInputSchema;
}

export interface McpListToolsResponse {
  readonly tools: readonly McpToolDescriptor[];
}

export interface McpCallToolRequest extends McpRequestContext {
  readonly name: string;
  readonly toolName?: string;
  readonly arguments?: JsonObject;
}

export interface McpContentItem {
  readonly type: string;
  readonly [key: string]: JsonValue;
}

export interface McpCallToolResponse {
  readonly content: readonly McpContentItem[];
  readonly structuredContent?: JsonValue;
  readonly isError?: boolean;
}

export type McpApprovalSessionStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired";
export type McpApprovalSessionDecisionStatus =
  Exclude<McpApprovalSessionStatus, "pending">;
export type McpApprovalSessionDecisionAction = "approve" | "reject";

export interface McpApprovalSessionDecision {
  readonly status: McpApprovalSessionDecisionStatus;
  readonly at: string;
  readonly actor?: McpActor;
  readonly reason?: string;
  readonly metadata?: JsonObject;
}

export interface McpApprovalSession {
  readonly id: string;
  readonly status: McpApprovalSessionStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly expiresAt?: string;
  readonly request: JsonObject;
  readonly actor?: McpActor;
  readonly reason?: string;
  readonly ruleId?: string;
  readonly metadata?: JsonObject;
  readonly decision?: McpApprovalSessionDecision;
  readonly approvedAt?: string;
  readonly approvedBy?: McpActor;
  readonly rejectedAt?: string;
  readonly rejectedBy?: McpActor;
  readonly expiredAt?: string;
  readonly expiredBy?: McpActor;
}

export interface ListMcpApprovalSessionsQuery {
  readonly status?: McpApprovalSessionStatus;
  readonly actorId?: string;
}

export interface ListMcpApprovalSessionsResponse {
  readonly sessions: readonly McpApprovalSession[];
}

export interface DecideMcpApprovalSessionRequest {
  readonly sessionId: string;
  readonly decision: McpApprovalSessionDecisionAction;
  readonly actor?: McpActor;
  readonly reason?: string;
  readonly metadata?: JsonObject;
}

export interface DecideMcpApprovalSessionResponse {
  readonly session: McpApprovalSession;
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

  async exportAuditJsonl(
    input: AuditExportRequest,
  ): Promise<AuditExportJsonlResponse> {
    validateAuditExportRequest(input);
    return this.#request(
      "audit/export/jsonl",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      parseAuditExportJsonlResponse,
    );
  }

  async exportAuditCsv(
    input: AuditExportRequest,
  ): Promise<AuditExportCsvResponse> {
    validateAuditExportRequest(input);
    return this.#request(
      "audit/export/csv",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      parseAuditExportCsvResponse,
    );
  }

  async exportAuditPackage(
    input: AuditExportRequest,
  ): Promise<AuditExportPackage> {
    validateAuditExportRequest(input);
    return this.#request(
      "audit/export/package",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      parseAuditExportPackage,
    );
  }

  async planMigration(input: MigrationPlanRequest): Promise<MigrationPlanResponse> {
    validateMigrationPlanRequest(input);
    const { workspaceId, metadata, targetVersion } = input;
    return this.#request(
      `workspaces/${encodePathPart(workspaceId)}/migrations/plan`,
      {
        method: "POST",
        body: JSON.stringify({
          metadata,
          ...(targetVersion === undefined ? {} : { targetVersion }),
        }),
      },
      parseMigrationPlanResponse,
    );
  }

  async runMigration(input: MigrationRunRequest): Promise<MigrationRunResponse> {
    validateMigrationRunRequest(input);
    const { workspaceId, metadata, targetVersion, dryRun } = input;
    return this.#request(
      `workspaces/${encodePathPart(workspaceId)}/migrations/run`,
      {
        method: "POST",
        body: JSON.stringify({
          metadata,
          ...(targetVersion === undefined ? {} : { targetVersion }),
          ...(dryRun === undefined ? {} : { dryRun }),
        }),
      },
      parseMigrationRunResponse,
    );
  }

  async submitBackupManifest(
    input: BackupManifestSubmitRequest,
  ): Promise<BackupManifest> {
    validateBackupManifestSubmitRequest(input);
    const { workspaceId, manifest } = input;
    return this.#request(
      `workspaces/${encodePathPart(workspaceId)}/backups/manifests`,
      {
        method: "POST",
        body: JSON.stringify({ manifest }),
      },
      parseBackupManifest,
    );
  }

  async planRestore(input: RestorePlanRequest): Promise<RestorePlanResponse> {
    validateRestorePlanRequest(input);
    const { targetWorkspaceId, ...body } = input;
    return this.#request(
      `workspaces/${encodePathPart(targetWorkspaceId)}/restores/plan`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      parseRestorePlanResponse,
    );
  }

  async submitObservabilityEvent(
    input: ObservabilityEventSubmitRequest,
  ): Promise<ObservabilityEvent> {
    validateObservabilityEventSubmitRequest(input);
    return this.#request(
      "observability/events",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      parseObservabilityEvent,
    );
  }

  async submitObservabilityMetric(
    input: ObservabilityMetric,
  ): Promise<ObservabilityMetric> {
    validateObservabilityMetric(input, "metric", "observability metric is invalid");
    return this.#request(
      "observability/metrics",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      parseObservabilityMetric,
    );
  }

  async planCompaction(
    input: CompactionPlanRequest,
  ): Promise<CompactionPlanResponse> {
    validateCompactionPlanRequest(input);
    const { workspaceId, ...body } = input;
    return this.#request(
      `workspaces/${encodePathPart(workspaceId)}/compactions/plan`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      parseCompactionPlanResponse,
    );
  }

  async listMcpResources(): Promise<McpListResourcesResponse> {
    return this.#request(
      "mcp/resources",
      { method: "GET" },
      parseMcpListResourcesResponse,
    );
  }

  async readMcpResource(
    input: McpReadResourceRequest,
  ): Promise<McpReadResourceResponse> {
    validateMcpReadResourceRequest(input);
    const { uri, actor, metadata } = input;
    return this.#request(
      "mcp/resources/read",
      {
        method: "POST",
        body: JSON.stringify({
          uri,
          ...(actor === undefined ? {} : { actor }),
          ...(metadata === undefined ? {} : { metadata }),
        }),
      },
      parseMcpReadResourceResponse,
    );
  }

  async listMcpTools(): Promise<McpListToolsResponse> {
    return this.#request(
      "mcp/tools",
      { method: "GET" },
      parseMcpListToolsResponse,
    );
  }

  async callMcpTool(input: McpCallToolRequest): Promise<McpCallToolResponse> {
    validateMcpCallToolRequest(input);
    const { arguments: args, actor, metadata } = input;
    const name = input.name ?? input.toolName;
    return this.#request(
      "mcp/tools/call",
      {
        method: "POST",
        body: JSON.stringify({
          name,
          ...(args === undefined ? {} : { arguments: args }),
          ...(actor === undefined ? {} : { actor }),
          ...(metadata === undefined ? {} : { metadata }),
        }),
      },
      parseMcpCallToolResponse,
    );
  }

  async listMcpApprovalSessions(
    query: ListMcpApprovalSessionsQuery = {},
  ): Promise<ListMcpApprovalSessionsResponse> {
    validateListMcpApprovalSessionsQuery(query);
    const url = this.#url("mcp/approval-sessions", query);
    return this.#requestUrl(url, { method: "GET" }, parseListMcpApprovalSessionsResponse);
  }

  async decideMcpApprovalSession(
    input: DecideMcpApprovalSessionRequest,
  ): Promise<DecideMcpApprovalSessionResponse> {
    validateDecideMcpApprovalSessionRequest(input);
    const { sessionId, decision, actor, reason, metadata } = input;
    return this.#request(
      `mcp/approval-sessions/${encodePathPart(sessionId)}/decision`,
      {
        method: "POST",
        body: JSON.stringify({
          decision,
          ...(actor === undefined ? {} : { actor }),
          ...(reason === undefined ? {} : { reason }),
          ...(metadata === undefined ? {} : { metadata }),
        }),
      },
      parseDecideMcpApprovalSessionResponse,
    );
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

function validateAuditExportRequest(input: AuditExportRequest): void {
  if (!isRecord(input)) {
    throw new ApiRequestValidationError("audit export request is invalid", [
      { path: "", message: "request must be an object" },
    ]);
  }

  const issues: ValidationIssue[] = [];
  if (!Array.isArray(input.events)) {
    issues.push({ path: "events", message: "events must be an array" });
  } else {
    input.events.forEach((event, index) => {
      collectAuditExportEventIssues(event, `events.${index}`, issues);
    });
  }

  if (input.filters !== undefined) {
    collectAuditExportFiltersIssues(input.filters, "filters", issues);
  }
  if (input.createdAt !== undefined) {
    requireIsoTimestamp(input, "createdAt", "createdAt", issues);
  }
  requireOptionalNonEmptyString(input, "exportId", "exportId", issues);

  if (issues.length > 0) {
    throw new ApiRequestValidationError("audit export request is invalid", issues);
  }
}

function parseAuditExportJsonlResponse(value: unknown): AuditExportJsonlResponse {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw new ApiResponseValidationError([
      { path: "", message: "response must be an object" },
    ], value);
  }

  collectAuditExportContentResponseIssues(value, "jsonl", issues);
  collectAuditExportManifestIssues(value.manifest, "manifest", issues);

  if (issues.length > 0) {
    throw new ApiResponseValidationError(issues, value);
  }

  return deepFreezeClone({
    jsonl: value.content,
    manifest: value.manifest,
  }) as AuditExportJsonlResponse;
}

function parseAuditExportCsvResponse(value: unknown): AuditExportCsvResponse {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw new ApiResponseValidationError([
      { path: "", message: "response must be an object" },
    ], value);
  }

  collectAuditExportContentResponseIssues(value, "csv", issues);
  collectAuditExportManifestIssues(value.manifest, "manifest", issues);

  if (issues.length > 0) {
    throw new ApiResponseValidationError(issues, value);
  }

  return deepFreezeClone({
    csv: value.content,
    manifest: value.manifest,
  }) as AuditExportCsvResponse;
}

function parseAuditExportPackage(value: unknown): AuditExportPackage {
  const issues: ValidationIssue[] = [];
  collectAuditExportPackageIssues(value, "", issues);
  if (issues.length > 0) {
    throw new ApiResponseValidationError(issues, value);
  }

  return deepFreezeClone(value) as AuditExportPackage;
}

function validateMigrationPlanRequest(input: MigrationPlanRequest): void {
  const issues = collectMigrationRequestIssues(input, false);
  if (issues.length > 0) {
    throw new ApiRequestValidationError("migration plan request is invalid", issues);
  }
}

function validateMigrationRunRequest(input: MigrationRunRequest): void {
  const issues = collectMigrationRequestIssues(input, true);
  if (issues.length > 0) {
    throw new ApiRequestValidationError("migration run request is invalid", issues);
  }
}

function collectMigrationRequestIssues(
  input: MigrationPlanRequest | MigrationRunRequest,
  allowDryRun: boolean,
): ValidationIssue[] {
  if (!isRecord(input)) {
    return [{ path: "", message: "request must be an object" }];
  }

  const issues: ValidationIssue[] = [];
  requireNonEmptyString(input, "workspaceId", "workspaceId", issues);
  collectWorkspaceMetadataIssues(input.metadata, "metadata", issues);

  if (input.targetVersion !== undefined) {
    requireNonNegativeInteger(input, "targetVersion", "targetVersion", issues);
  }

  if (allowDryRun && "dryRun" in input && input.dryRun !== undefined) {
    requireBoolean(input, "dryRun", "dryRun", issues);
  }

  return issues;
}

function parseMigrationPlanResponse(value: unknown): MigrationPlanResponse {
  const issues = collectMigrationPlanIssues(value, "");
  if (issues.length > 0) {
    throw new ApiResponseValidationError(issues, value);
  }

  return deepFreezeClone(value) as MigrationPlanResponse;
}

function parseMigrationRunResponse(value: unknown): MigrationRunResponse {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw new ApiResponseValidationError([
      { path: "", message: "response must be an object" },
    ], value);
  }

  collectWorkspaceMetadataIssues(value.metadata, "metadata", issues);
  collectMigrationPlanIssues(value.plan, "plan", issues);
  if (!Array.isArray(value.appliedSteps)) {
    issues.push({ path: "appliedSteps", message: "appliedSteps must be an array" });
  } else {
    value.appliedSteps.forEach((step, index) => {
      collectMigrationAppliedStepIssues(step, `appliedSteps.${index}`, issues);
    });
  }
  collectStringArrayIssues(value.rollbackNotes, "rollbackNotes", issues);
  collectMigrationRunSummaryIssues(value.summary, "summary", issues);
  requireNonEmptyString(value, "fingerprint", "fingerprint", issues);

  if (issues.length > 0) {
    throw new ApiResponseValidationError(issues, value);
  }

  return deepFreezeClone(value) as MigrationRunResponse;
}

function validateBackupManifestSubmitRequest(input: BackupManifestSubmitRequest): void {
  if (!isRecord(input)) {
    throw new ApiRequestValidationError("backup manifest request is invalid", [
      { path: "", message: "request must be an object" },
    ]);
  }

  const issues: ValidationIssue[] = [];
  requireNonEmptyString(input, "workspaceId", "workspaceId", issues);
  collectBackupManifestIssues(input.manifest, "manifest", issues);

  if (
    typeof input.workspaceId === "string" &&
    isRecord(input.manifest) &&
    typeof input.manifest.workspaceId === "string" &&
    input.workspaceId !== input.manifest.workspaceId
  ) {
    issues.push({
      path: "manifest.workspaceId",
      message: "manifest.workspaceId must match workspaceId",
    });
  }

  if (issues.length > 0) {
    throw new ApiRequestValidationError("backup manifest request is invalid", issues);
  }
}

function parseBackupManifest(value: unknown): BackupManifest {
  const issues = collectBackupManifestIssues(value, "");
  if (issues.length > 0) {
    throw new ApiResponseValidationError(issues, value);
  }

  return deepFreezeClone(value) as BackupManifest;
}

function validateRestorePlanRequest(input: RestorePlanRequest): void {
  if (!isRecord(input)) {
    throw new ApiRequestValidationError("restore plan request is invalid", [
      { path: "", message: "request must be an object" },
    ]);
  }

  const issues: ValidationIssue[] = [];
  requireNonEmptyString(input, "targetWorkspaceId", "targetWorkspaceId", issues);
  collectBackupManifestIssues(input.manifest, "manifest", issues);
  requireOptionalOneOf(input, "mode", "mode", RESTORE_MODES, issues);
  requireOptionalBoolean(input, "allowSourceWorkspaceOverwrite", "allowSourceWorkspaceOverwrite", issues);
  requireOptionalBoolean(input, "allowDestructiveRestore", "allowDestructiveRestore", issues);
  collectOptionalStringArrayIssues(input, "trustedManifestFingerprints", "trustedManifestFingerprints", issues);
  collectOptionalStringArrayIssues(input, "availablePayloadIds", "availablePayloadIds", issues);
  if (input.maxManifestAgeDays !== undefined) {
    requireNonNegativeInteger(input, "maxManifestAgeDays", "maxManifestAgeDays", issues);
  }
  if (input.now !== undefined) {
    requireIsoTimestamp(input, "now", "now", issues);
  }
  collectOptionalStringArrayIssues(input, "includePayloadIds", "includePayloadIds", issues);
  collectOptionalStringArrayIssues(input, "excludePayloadIds", "excludePayloadIds", issues);
  collectOptionalStringRecordIssues(input, "existingPayloadFingerprints", "existingPayloadFingerprints", issues);

  if (issues.length > 0) {
    throw new ApiRequestValidationError("restore plan request is invalid", issues);
  }
}

function parseRestorePlanResponse(value: unknown): RestorePlanResponse {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw new ApiResponseValidationError([
      { path: "", message: "response must be an object" },
    ], value);
  }

  requireNonEmptyString(value, "backupId", "backupId", issues);
  requireNonEmptyString(value, "workspaceId", "workspaceId", issues);
  requireNonEmptyString(value, "targetWorkspaceId", "targetWorkspaceId", issues);
  requireOneOf(value, "mode", "mode", RESTORE_MODES, issues);
  requireBoolean(value, "canRun", "canRun", issues);
  collectRestoreSafetyIssues(value.safety, "safety", issues);

  if (!Array.isArray(value.actions)) {
    issues.push({ path: "actions", message: "actions must be an array" });
  } else {
    value.actions.forEach((action, index) => {
      collectRestorePlanActionIssues(action, `actions.${index}`, issues);
    });
  }

  collectRestorePlanSummaryIssues(value.summary, "summary", issues);

  if (issues.length > 0) {
    throw new ApiResponseValidationError(issues, value);
  }

  return deepFreezeClone(value) as RestorePlanResponse;
}

function validateObservabilityEventSubmitRequest(
  input: ObservabilityEventSubmitRequest,
): void {
  if (!isRecord(input)) {
    throw new ApiRequestValidationError("observability event request is invalid", [
      { path: "", message: "request must be an object" },
    ]);
  }

  const issues: ValidationIssue[] = [];
  requireNonEmptyString(input, "name", "name", issues);
  requireOptionalOneOf(input, "level", "level", OBSERVATION_LEVELS, issues);
  if (input.timestamp !== undefined) {
    requireIsoTimestamp(input, "timestamp", "timestamp", issues);
  }
  requireOptionalNonEmptyString(input, "message", "message", issues);
  requireOptionalNonEmptyString(input, "traceId", "traceId", issues);
  requireOptionalNonEmptyString(input, "spanId", "spanId", issues);

  if (input.resource !== undefined) {
    collectObservabilityResourceIssues(input.resource, "resource", issues);
  }

  if (input.attributes !== undefined) {
    collectJsonObjectIssues(input.attributes, "attributes", issues);
  }

  if (issues.length > 0) {
    throw new ApiRequestValidationError("observability event request is invalid", issues);
  }
}

function parseObservabilityEvent(value: unknown): ObservabilityEvent {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw new ApiResponseValidationError([
      { path: "", message: "response must be an object" },
    ], value);
  }

  if (value.kind !== "event") {
    issues.push({ path: "kind", message: "kind must be event" });
  }
  requirePositiveInteger(value, "sequence", "sequence", issues);
  requireNonEmptyString(value, "name", "name", issues);
  requireOneOf(value, "level", "level", OBSERVATION_LEVELS, issues);
  requireIsoTimestamp(value, "timestamp", "timestamp", issues);
  requireOptionalNonEmptyString(value, "message", "message", issues);
  requireOptionalNonEmptyString(value, "traceId", "traceId", issues);
  requireOptionalNonEmptyString(value, "spanId", "spanId", issues);
  if (value.resource !== undefined) {
    collectObservabilityResourceIssues(value.resource, "resource", issues);
  }
  collectJsonObjectIssues(value.attributes, "attributes", issues);
  collectStringArrayIssues(value.redactedPaths, "redactedPaths", issues);

  if (issues.length > 0) {
    throw new ApiResponseValidationError(issues, value);
  }

  return deepFreezeClone(value) as ObservabilityEvent;
}

function validateObservabilityMetric(
  value: unknown,
  path: string,
  message: string,
): void {
  const issues: ValidationIssue[] = [];
  collectObservabilityMetricIssues(value, path, issues);
  if (issues.length > 0) {
    throw new ApiRequestValidationError(message, issues);
  }
}

function parseObservabilityMetric(value: unknown): ObservabilityMetric {
  const issues: ValidationIssue[] = [];
  collectObservabilityMetricIssues(value, "", issues);
  if (issues.length > 0) {
    throw new ApiResponseValidationError(issues, value);
  }

  return deepFreezeClone(value) as ObservabilityMetric;
}

function validateCompactionPlanRequest(input: CompactionPlanRequest): void {
  if (!isRecord(input)) {
    throw new ApiRequestValidationError("compaction plan request is invalid", [
      { path: "", message: "request must be an object" },
    ]);
  }

  const issues: ValidationIssue[] = [];
  requireNonEmptyString(input, "workspaceId", "workspaceId", issues);
  requireNonNegativeInteger(input, "fromSequence", "fromSequence", issues);
  requireNonNegativeInteger(input, "toSequence", "toSequence", issues);
  requireNonEmptyString(input, "reducerVersion", "reducerVersion", issues);
  requireNonNegativeInteger(input, "sourceEventCount", "sourceEventCount", issues);
  if (input.sourceByteCount !== undefined) {
    requireNonNegativeInteger(input, "sourceByteCount", "sourceByteCount", issues);
  }
  if (input.targetByteLimit !== undefined) {
    requireNonNegativeInteger(input, "targetByteLimit", "targetByteLimit", issues);
  }
  requireOptionalNonEmptyString(input, "checkpointFingerprint", "checkpointFingerprint", issues);
  collectSequenceRangeIssues(input, "fromSequence", "toSequence", issues);

  if (issues.length > 0) {
    throw new ApiRequestValidationError("compaction plan request is invalid", issues);
  }
}

function parseCompactionPlanResponse(value: unknown): CompactionPlanResponse {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw new ApiResponseValidationError([
      { path: "", message: "response must be an object" },
    ], value);
  }

  requireNonEmptyString(value, "workspaceId", "workspaceId", issues);
  requireNonNegativeInteger(value, "fromSequence", "fromSequence", issues);
  requireNonNegativeInteger(value, "toSequence", "toSequence", issues);
  requireNonEmptyString(value, "reducerVersion", "reducerVersion", issues);
  requireNonEmptyString(value, "checkpointFingerprint", "checkpointFingerprint", issues);
  requireNonNegativeInteger(value, "sourceEventCount", "sourceEventCount", issues);
  requireNonNegativeInteger(value, "compactedByteCount", "compactedByteCount", issues);
  requireTrue(value, "dryRun", "dryRun", issues);
  requireNonEmptyString(value, "rollbackNote", "rollbackNote", issues);
  requireNonEmptyString(value, "fingerprint", "fingerprint", issues);
  collectSequenceRangeIssues(value, "fromSequence", "toSequence", issues);

  if (issues.length > 0) {
    throw new ApiResponseValidationError(issues, value);
  }

  return deepFreezeClone(value) as CompactionPlanResponse;
}

function validateMcpReadResourceRequest(input: McpReadResourceRequest): void {
  if (!isRecord(input)) {
    throw new ApiRequestValidationError("MCP resource read request is invalid", [
      { path: "", message: "request must be an object" },
    ]);
  }

  const issues: ValidationIssue[] = [];
  requireNonEmptyString(input, "uri", "uri", issues);
  collectMcpRequestContextIssues(input, issues);

  if (issues.length > 0) {
    throw new ApiRequestValidationError("MCP resource read request is invalid", issues);
  }
}

function parseMcpListResourcesResponse(value: unknown): McpListResourcesResponse {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw new ApiResponseValidationError([
      { path: "", message: "response must be an object" },
    ], value);
  }

  if (!Array.isArray(value.resources)) {
    issues.push({ path: "resources", message: "resources must be an array" });
  } else {
    value.resources.forEach((resource, index) => {
      collectMcpResourceSummaryIssues(resource, `resources.${index}`, issues);
    });
  }

  if (issues.length > 0) {
    throw new ApiResponseValidationError(issues, value);
  }

  return deepFreezeClone(value) as McpListResourcesResponse;
}

function parseMcpReadResourceResponse(value: unknown): McpReadResourceResponse {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw new ApiResponseValidationError([
      { path: "", message: "response must be an object" },
    ], value);
  }

  if (!Array.isArray(value.contents)) {
    issues.push({ path: "contents", message: "contents must be an array" });
  } else {
    value.contents.forEach((content, index) => {
      collectMcpResourceContentIssues(content, `contents.${index}`, issues);
    });
  }

  if (issues.length > 0) {
    throw new ApiResponseValidationError(issues, value);
  }

  return deepFreezeClone(value) as McpReadResourceResponse;
}

function validateMcpCallToolRequest(input: McpCallToolRequest): void {
  if (!isRecord(input)) {
    throw new ApiRequestValidationError("MCP tool call request is invalid", [
      { path: "", message: "request must be an object" },
    ]);
  }

  const issues: ValidationIssue[] = [];
  const name = input.name;
  const toolName = input.toolName;
  if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
    issues.push({ path: "name", message: "name must be a non-empty string" });
  }
  if (
    toolName !== undefined &&
    (typeof toolName !== "string" || toolName.trim().length === 0)
  ) {
    issues.push({ path: "toolName", message: "toolName must be a non-empty string" });
  }
  if (name === undefined && toolName === undefined) {
    issues.push({ path: "name", message: "name must be a non-empty string" });
  }
  if (
    typeof name === "string" &&
    typeof toolName === "string" &&
    name !== toolName
  ) {
    issues.push({ path: "toolName", message: "toolName must match name when both are provided" });
  }
  if (input.arguments !== undefined) {
    collectJsonObjectIssues(input.arguments, "arguments", issues);
  }
  collectMcpRequestContextIssues(input, issues);

  if (issues.length > 0) {
    throw new ApiRequestValidationError("MCP tool call request is invalid", issues);
  }
}

function parseMcpListToolsResponse(value: unknown): McpListToolsResponse {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw new ApiResponseValidationError([
      { path: "", message: "response must be an object" },
    ], value);
  }

  if (!Array.isArray(value.tools)) {
    issues.push({ path: "tools", message: "tools must be an array" });
  } else {
    value.tools.forEach((tool, index) => {
      collectMcpToolDescriptorIssues(tool, `tools.${index}`, issues);
    });
  }

  if (issues.length > 0) {
    throw new ApiResponseValidationError(issues, value);
  }

  return deepFreezeClone(value) as McpListToolsResponse;
}

function parseMcpCallToolResponse(value: unknown): McpCallToolResponse {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw new ApiResponseValidationError([
      { path: "", message: "response must be an object" },
    ], value);
  }

  if (!Array.isArray(value.content)) {
    issues.push({ path: "content", message: "content must be an array" });
  } else {
    value.content.forEach((content, index) => {
      collectMcpContentItemIssues(content, `content.${index}`, issues);
    });
  }

  if (value.structuredContent !== undefined) {
    collectJsonIssues(value.structuredContent, "structuredContent", issues);
  }
  if (value.isError !== undefined) {
    requireBoolean(value, "isError", "isError", issues);
  }

  if (issues.length > 0) {
    throw new ApiResponseValidationError(issues, value);
  }

  return deepFreezeClone(value) as McpCallToolResponse;
}

function validateListMcpApprovalSessionsQuery(
  query: ListMcpApprovalSessionsQuery,
): void {
  if (!isRecord(query)) {
    throw new ApiRequestValidationError("MCP approval session query is invalid", [
      { path: "query", message: "query must be an object" },
    ]);
  }

  const issues: ValidationIssue[] = [];
  requireOptionalOneOf(
    query,
    "status",
    "query.status",
    MCP_APPROVAL_SESSION_STATUSES,
    issues,
  );
  requireOptionalNonEmptyString(query, "actorId", "query.actorId", issues);

  if (issues.length > 0) {
    throw new ApiRequestValidationError("MCP approval session query is invalid", issues);
  }
}

function parseListMcpApprovalSessionsResponse(
  value: unknown,
): ListMcpApprovalSessionsResponse {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw new ApiResponseValidationError([
      { path: "", message: "response must be an object" },
    ], value);
  }

  if (!Array.isArray(value.sessions)) {
    issues.push({ path: "sessions", message: "sessions must be an array" });
  } else {
    value.sessions.forEach((session, index) => {
      collectMcpApprovalSessionIssues(session, `sessions.${index}`, issues);
    });
  }

  if (issues.length > 0) {
    throw new ApiResponseValidationError(issues, value);
  }

  return deepFreezeClone(value) as ListMcpApprovalSessionsResponse;
}

function validateDecideMcpApprovalSessionRequest(
  input: DecideMcpApprovalSessionRequest,
): void {
  if (!isRecord(input)) {
    throw new ApiRequestValidationError("MCP approval session decision is invalid", [
      { path: "", message: "request must be an object" },
    ]);
  }

  const issues: ValidationIssue[] = [];
  requireNonEmptyString(input, "sessionId", "sessionId", issues);
  requireOneOf(input, "decision", "decision", MCP_APPROVAL_SESSION_DECISION_ACTIONS, issues);
  if (input.actor !== undefined) {
    collectMcpActorIssues(input.actor, "actor", issues);
  }
  if (input.reason !== undefined) {
    requireString(input, "reason", "reason", issues);
  }
  if (input.metadata !== undefined) {
    collectJsonObjectIssues(input.metadata, "metadata", issues);
  }

  if (issues.length > 0) {
    throw new ApiRequestValidationError("MCP approval session decision is invalid", issues);
  }
}

function parseMcpApprovalSession(value: unknown): McpApprovalSession {
  const issues: ValidationIssue[] = [];
  collectMcpApprovalSessionIssues(value, "", issues);
  if (issues.length > 0) {
    throw new ApiResponseValidationError(issues, value);
  }

  return deepFreezeClone(value) as McpApprovalSession;
}

function parseDecideMcpApprovalSessionResponse(
  value: unknown,
): DecideMcpApprovalSessionResponse {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw new ApiResponseValidationError([
      { path: "", message: "response must be an object" },
    ], value);
  }

  collectMcpApprovalSessionIssues(value.session, "session", issues);
  if (issues.length > 0) {
    throw new ApiResponseValidationError(issues, value);
  }

  return deepFreezeClone(value) as DecideMcpApprovalSessionResponse;
}

const MIGRATION_APPLIED_STEP_STATUSES = ["applied", "skipped"] as const;
const BACKUP_PAYLOAD_KINDS = ["workspace_state", "record", "asset", "settings"] as const;
const RESTORE_MODES = ["preview", "merge", "replace"] as const;
const RESTORE_ACTION_TYPES = ["restore", "skip", "conflict", "blocked"] as const;
const OBSERVATION_LEVELS = ["debug", "info", "warn", "error"] as const;
const OBSERVABILITY_METRIC_KINDS = ["counter", "gauge", "histogram"] as const;
const MCP_APPROVAL_SESSION_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "expired",
] as const;
const MCP_APPROVAL_SESSION_DECISION_STATUSES = [
  "approved",
  "rejected",
  "expired",
] as const;
const MCP_APPROVAL_SESSION_DECISION_ACTIONS = [
  "approve",
  "reject",
] as const;
const AUDIT_EXPORT_MANIFEST_KIND = "audit-export.manifest";
const AUDIT_EXPORT_PACKAGE_KIND = "audit-export.package";
const AUDIT_EXPORT_CONTENT_KIND = "audit-export.content";

function collectMcpRequestContextIssues(
  value: Record<string, unknown>,
  issues: ValidationIssue[],
): void {
  if (value.actor !== undefined) {
    collectMcpActorInputIssues(value.actor, "actor", issues);
  }
  if (value.metadata !== undefined) {
    collectJsonObjectIssues(value.metadata, "metadata", issues);
  }
}

function collectMcpActorInputIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (typeof value === "string") {
    if (value.trim().length === 0) {
      issues.push({ path, message: "actor must be a non-empty string or object" });
    }
    return;
  }

  collectMcpActorIssues(value, path, issues);
}

function collectMcpActorIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "actor must be an object" });
    return;
  }

  requireNonEmptyString(value, "id", joinPath(path, "id"), issues);
  collectOptionalStringArrayIssues(value, "roles", joinPath(path, "roles"), issues);
  if (value.metadata !== undefined) {
    collectJsonObjectIssues(value.metadata, joinPath(path, "metadata"), issues);
  }
}

function collectMcpResourceSummaryIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "resource must be an object" });
    return;
  }

  requireNonEmptyString(value, "uri", joinPath(path, "uri"), issues);
  requireNonEmptyString(value, "name", joinPath(path, "name"), issues);
  requireOptionalNonEmptyString(value, "description", joinPath(path, "description"), issues);
  requireOptionalNonEmptyString(value, "mimeType", joinPath(path, "mimeType"), issues);
}

function collectMcpResourceContentIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "resource content must be an object" });
    return;
  }

  requireNonEmptyString(value, "uri", joinPath(path, "uri"), issues);
  requireOptionalNonEmptyString(value, "mimeType", joinPath(path, "mimeType"), issues);
  if (value.text !== undefined) {
    requireString(value, "text", joinPath(path, "text"), issues);
  }
  if (value.blob !== undefined) {
    requireString(value, "blob", joinPath(path, "blob"), issues);
  }
}

function collectMcpToolDescriptorIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "tool must be an object" });
    return;
  }

  requireNonEmptyString(value, "name", joinPath(path, "name"), issues);
  requireNonEmptyString(value, "description", joinPath(path, "description"), issues);
  collectMcpToolInputSchemaIssues(value.inputSchema, joinPath(path, "inputSchema"), issues);
}

function collectMcpToolInputSchemaIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "inputSchema must be an object" });
    return;
  }

  requireLiteralString(value, "type", joinPath(path, "type"), "object", issues);
  if (value.properties !== undefined) {
    collectJsonObjectIssues(value.properties, joinPath(path, "properties"), issues);
  }
  if (value.required !== undefined) {
    collectStringArrayIssues(value.required, joinPath(path, "required"), issues);
  }
  if (value.additionalProperties !== undefined) {
    requireBoolean(
      value,
      "additionalProperties",
      joinPath(path, "additionalProperties"),
      issues,
    );
  }
}

function collectMcpContentItemIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "content item must be an object" });
    return;
  }

  requireNonEmptyString(value, "type", joinPath(path, "type"), issues);
  collectJsonObjectIssues(value, path, issues);
}

function collectMcpApprovalSessionIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "approval session must be an object" });
    return;
  }

  requireNonEmptyString(value, "id", joinPath(path, "id"), issues);
  requireOneOf(value, "status", joinPath(path, "status"), MCP_APPROVAL_SESSION_STATUSES, issues);
  requireIsoTimestamp(value, "createdAt", joinPath(path, "createdAt"), issues);
  requireIsoTimestamp(value, "updatedAt", joinPath(path, "updatedAt"), issues);
  if (value.expiresAt !== undefined) {
    requireIsoTimestamp(value, "expiresAt", joinPath(path, "expiresAt"), issues);
  }
  collectJsonObjectIssues(value.request, joinPath(path, "request"), issues);
  if (value.actor !== undefined) {
    collectMcpActorIssues(value.actor, joinPath(path, "actor"), issues);
  }
  if (value.reason !== undefined) {
    requireString(value, "reason", joinPath(path, "reason"), issues);
  }
  if (value.ruleId !== undefined) {
    requireString(value, "ruleId", joinPath(path, "ruleId"), issues);
  }
  if (value.metadata !== undefined) {
    collectJsonObjectIssues(value.metadata, joinPath(path, "metadata"), issues);
  }
  if (value.decision !== undefined) {
    collectMcpApprovalSessionDecisionIssues(
      value.decision,
      joinPath(path, "decision"),
      issues,
    );
  }
  collectOptionalMcpTerminalTransitionIssues(value, "approved", path, issues);
  collectOptionalMcpTerminalTransitionIssues(value, "rejected", path, issues);
  collectOptionalMcpTerminalTransitionIssues(value, "expired", path, issues);
}

function collectMcpApprovalSessionDecisionIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "approval session decision must be an object" });
    return;
  }

  requireOneOf(
    value,
    "status",
    joinPath(path, "status"),
    MCP_APPROVAL_SESSION_DECISION_STATUSES,
    issues,
  );
  requireIsoTimestamp(value, "at", joinPath(path, "at"), issues);
  if (value.actor !== undefined) {
    collectMcpActorIssues(value.actor, joinPath(path, "actor"), issues);
  }
  if (value.reason !== undefined) {
    requireString(value, "reason", joinPath(path, "reason"), issues);
  }
  if (value.metadata !== undefined) {
    collectJsonObjectIssues(value.metadata, joinPath(path, "metadata"), issues);
  }
}

function collectOptionalMcpTerminalTransitionIssues(
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
    collectMcpActorIssues(value[byField], joinPath(path, byField), issues);
  }
}

function collectWorkspaceMetadataIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "metadata must be an object" });
    return;
  }

  requireNonNegativeInteger(value, "schemaVersion", joinPath(path, "schemaVersion"), issues);
  collectJsonIssues(value, path, issues);
}

function collectMigrationPlanIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[] = [],
): ValidationIssue[] {
  if (!isRecord(value)) {
    issues.push({ path, message: "migration plan must be an object" });
    return issues;
  }

  requireNonNegativeInteger(value, "sourceVersion", joinPath(path, "sourceVersion"), issues);
  requireNonNegativeInteger(value, "targetVersion", joinPath(path, "targetVersion"), issues);

  if (!Array.isArray(value.steps)) {
    issues.push({ path: joinPath(path, "steps"), message: "steps must be an array" });
  } else {
    value.steps.forEach((step, index) => {
      collectMigrationPlanStepIssues(step, `${joinPath(path, "steps")}.${index}`, issues);
    });
  }

  collectStringArrayIssues(value.rollbackNotes, joinPath(path, "rollbackNotes"), issues);
  requireBoolean(value, "alreadyCurrent", joinPath(path, "alreadyCurrent"), issues);
  requireTrue(value, "dryRun", joinPath(path, "dryRun"), issues);
  collectMigrationPlanSummaryIssues(value.summary, joinPath(path, "summary"), issues);
  requireNonEmptyString(value, "fingerprint", joinPath(path, "fingerprint"), issues);

  return issues;
}

function collectMigrationPlanStepIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  collectMigrationStepDescriptorIssues(value, path, issues);
  if (isRecord(value)) {
    requireNonEmptyString(value, "fingerprint", joinPath(path, "fingerprint"), issues);
  }
}

function collectMigrationAppliedStepIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  collectMigrationStepDescriptorIssues(value, path, issues);
  if (!isRecord(value)) {
    return;
  }

  requireOneOf(value, "status", joinPath(path, "status"), MIGRATION_APPLIED_STEP_STATUSES, issues);
  requireNonEmptyString(value, "fingerprintBefore", joinPath(path, "fingerprintBefore"), issues);
  requireNonEmptyString(value, "fingerprintAfter", joinPath(path, "fingerprintAfter"), issues);
}

function collectMigrationStepDescriptorIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "migration step must be an object" });
    return;
  }

  requireNonEmptyString(value, "id", joinPath(path, "id"), issues);
  requireNonNegativeInteger(value, "fromVersion", joinPath(path, "fromVersion"), issues);
  requireNonNegativeInteger(value, "toVersion", joinPath(path, "toVersion"), issues);
  requireNonEmptyString(value, "summary", joinPath(path, "summary"), issues);
  requireNonEmptyString(value, "rollbackNote", joinPath(path, "rollbackNote"), issues);

  if (
    Number.isInteger(value.fromVersion) &&
    Number.isInteger(value.toVersion) &&
    (value.toVersion as number) <= (value.fromVersion as number)
  ) {
    issues.push({
      path: joinPath(path, "toVersion"),
      message: "toVersion must be greater than fromVersion",
    });
  }
}

function collectMigrationPlanSummaryIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "summary must be an object" });
    return;
  }

  requireNonNegativeInteger(value, "sourceVersion", joinPath(path, "sourceVersion"), issues);
  requireNonNegativeInteger(value, "targetVersion", joinPath(path, "targetVersion"), issues);
  requireNonNegativeInteger(value, "stepCount", joinPath(path, "stepCount"), issues);
  collectStringArrayIssues(value.stepIds, joinPath(path, "stepIds"), issues);
  requireBoolean(value, "alreadyCurrent", joinPath(path, "alreadyCurrent"), issues);
  requireTrue(value, "dryRun", joinPath(path, "dryRun"), issues);
  requireNonEmptyString(value, "sourceFingerprint", joinPath(path, "sourceFingerprint"), issues);
  requireNonEmptyString(value, "fingerprint", joinPath(path, "fingerprint"), issues);
}

function collectMigrationRunSummaryIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "summary must be an object" });
    return;
  }

  requireNonNegativeInteger(value, "sourceVersion", joinPath(path, "sourceVersion"), issues);
  requireNonNegativeInteger(value, "targetVersion", joinPath(path, "targetVersion"), issues);
  requireNonNegativeInteger(value, "plannedStepCount", joinPath(path, "plannedStepCount"), issues);
  requireNonNegativeInteger(value, "appliedStepCount", joinPath(path, "appliedStepCount"), issues);
  requireNonNegativeInteger(value, "skippedStepCount", joinPath(path, "skippedStepCount"), issues);
  requireBoolean(value, "dryRun", joinPath(path, "dryRun"), issues);
  requireNonEmptyString(value, "sourceFingerprint", joinPath(path, "sourceFingerprint"), issues);
  requireNonEmptyString(value, "targetFingerprint", joinPath(path, "targetFingerprint"), issues);
  requireNonEmptyString(value, "fingerprint", joinPath(path, "fingerprint"), issues);
}

function collectBackupManifestIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[] = [],
): ValidationIssue[] {
  if (!isRecord(value)) {
    issues.push({ path, message: "backup manifest must be an object" });
    return issues;
  }

  requireNonEmptyString(value, "manifestVersion", joinPath(path, "manifestVersion"), issues);
  requireNonEmptyString(value, "backupId", joinPath(path, "backupId"), issues);
  requireNonEmptyString(value, "workspaceId", joinPath(path, "workspaceId"), issues);
  requireIsoTimestamp(value, "createdAt", joinPath(path, "createdAt"), issues);
  requireNonEmptyString(value, "createdByActorId", joinPath(path, "createdByActorId"), issues);
  collectBackupEncryptionIssues(value.encryption, joinPath(path, "encryption"), issues);

  if (!Array.isArray(value.payloads) || value.payloads.length === 0) {
    issues.push({ path: joinPath(path, "payloads"), message: "payloads must be a non-empty array" });
  } else {
    value.payloads.forEach((payload, index) => {
      collectBackupPayloadIssues(payload, `${joinPath(path, "payloads")}.${index}`, issues);
    });
  }

  requireNonEmptyString(value, "manifestFingerprint", joinPath(path, "manifestFingerprint"), issues);
  return issues;
}

function collectBackupEncryptionIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "encryption must be an object" });
    return;
  }

  requireNonEmptyString(value, "algorithm", joinPath(path, "algorithm"), issues);
  requireNonEmptyString(value, "keyId", joinPath(path, "keyId"), issues);
  requireNonEmptyString(value, "keyFingerprint", joinPath(path, "keyFingerprint"), issues);
}

function collectBackupPayloadIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "payload must be an object" });
    return;
  }

  requireNonEmptyString(value, "id", joinPath(path, "id"), issues);
  requireOneOf(value, "kind", joinPath(path, "kind"), BACKUP_PAYLOAD_KINDS, issues);
  requireNonEmptyString(value, "path", joinPath(path, "path"), issues);
  requireNonNegativeInteger(value, "plaintextByteSize", joinPath(path, "plaintextByteSize"), issues);
  requireNonNegativeInteger(value, "encryptedByteSize", joinPath(path, "encryptedByteSize"), issues);
  requireOptionalNonEmptyString(value, "contentType", joinPath(path, "contentType"), issues);
  requireIsoTimestamp(value, "createdAt", joinPath(path, "createdAt"), issues);
  collectBackupPayloadEncryptionIssues(value.encryption, joinPath(path, "encryption"), issues);
  collectBackupPayloadIntegrityIssues(value.integrity, joinPath(path, "integrity"), issues);

  if (
    Number.isInteger(value.plaintextByteSize) &&
    Number.isInteger(value.encryptedByteSize) &&
    (value.encryptedByteSize as number) < (value.plaintextByteSize as number)
  ) {
    issues.push({
      path: joinPath(path, "encryptedByteSize"),
      message: "encryptedByteSize must be greater than or equal to plaintextByteSize",
    });
  }
}

function collectBackupPayloadEncryptionIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "encryption must be an object" });
    return;
  }

  requireNonEmptyString(value, "algorithm", joinPath(path, "algorithm"), issues);
  requireNonEmptyString(value, "keyId", joinPath(path, "keyId"), issues);
  requireNonEmptyString(value, "nonceFingerprint", joinPath(path, "nonceFingerprint"), issues);
  requireNonEmptyString(value, "encryptedPayloadFingerprint", joinPath(path, "encryptedPayloadFingerprint"), issues);
}

function collectBackupPayloadIntegrityIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "integrity must be an object" });
    return;
  }

  requireNonEmptyString(value, "plaintextFingerprint", joinPath(path, "plaintextFingerprint"), issues);
  requireNonEmptyString(value, "encryptedPayloadFingerprint", joinPath(path, "encryptedPayloadFingerprint"), issues);
  requireNonEmptyString(value, "descriptorFingerprint", joinPath(path, "descriptorFingerprint"), issues);
}

function collectRestoreSafetyIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "safety must be an object" });
    return;
  }

  requireBoolean(value, "safe", joinPath(path, "safe"), issues);
  collectStringArrayIssues(value.blockers, joinPath(path, "blockers"), issues);
  collectStringArrayIssues(value.warnings, joinPath(path, "warnings"), issues);
}

function collectRestorePlanActionIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "restore action must be an object" });
    return;
  }

  requireOneOf(value, "type", joinPath(path, "type"), RESTORE_ACTION_TYPES, issues);
  requireNonEmptyString(value, "payloadId", joinPath(path, "payloadId"), issues);
  requireOneOf(value, "kind", joinPath(path, "kind"), BACKUP_PAYLOAD_KINDS, issues);
  requireNonEmptyString(value, "path", joinPath(path, "path"), issues);
  requireNonEmptyString(value, "reason", joinPath(path, "reason"), issues);
  requireNonEmptyString(value, "sourceFingerprint", joinPath(path, "sourceFingerprint"), issues);
  requireOptionalNonEmptyString(value, "targetFingerprint", joinPath(path, "targetFingerprint"), issues);
}

function collectRestorePlanSummaryIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "summary must be an object" });
    return;
  }

  requireNonNegativeInteger(value, "restore", joinPath(path, "restore"), issues);
  requireNonNegativeInteger(value, "skip", joinPath(path, "skip"), issues);
  requireNonNegativeInteger(value, "conflict", joinPath(path, "conflict"), issues);
  requireNonNegativeInteger(value, "blocked", joinPath(path, "blocked"), issues);
}

function collectObservabilityResourceIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "resource must be an object" });
    return;
  }

  requireNonEmptyString(value, "serviceName", joinPath(path, "serviceName"), issues);
  requireOptionalNonEmptyString(value, "serviceVersion", joinPath(path, "serviceVersion"), issues);
  requireOptionalNonEmptyString(value, "instanceId", joinPath(path, "instanceId"), issues);
  requireOptionalNonEmptyString(value, "workspaceId", joinPath(path, "workspaceId"), issues);
  if (value.attributes !== undefined) {
    collectJsonObjectIssues(value.attributes, joinPath(path, "attributes"), issues);
  }
}

function collectObservabilityMetricIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "metric must be an object" });
    return;
  }

  const kindPath = joinPath(path, "kind");
  requireOneOf(value, "kind", kindPath, OBSERVABILITY_METRIC_KINDS, issues);
  requireNonEmptyString(value, "name", joinPath(path, "name"), issues);
  requireOptionalNonEmptyString(value, "unit", joinPath(path, "unit"), issues);
  requireOptionalNonEmptyString(value, "description", joinPath(path, "description"), issues);
  collectJsonObjectIssues(value.attributes, joinPath(path, "attributes"), issues);
  requireIsoTimestamp(value, "updatedAt", joinPath(path, "updatedAt"), issues);
  collectStringArrayIssues(value.redactedPaths, joinPath(path, "redactedPaths"), issues);

  if (value.kind === "counter" || value.kind === "gauge") {
    requireFiniteNumber(value, "value", joinPath(path, "value"), issues);
    return;
  }

  if (value.kind !== "histogram") {
    return;
  }

  requireNonNegativeInteger(value, "count", joinPath(path, "count"), issues);
  requireFiniteNumber(value, "sum", joinPath(path, "sum"), issues);
  requireNullableFiniteNumber(value, "min", joinPath(path, "min"), issues);
  requireNullableFiniteNumber(value, "max", joinPath(path, "max"), issues);
  requireNonNegativeInteger(value, "overflow", joinPath(path, "overflow"), issues);
  if (!Array.isArray(value.buckets)) {
    issues.push({ path: joinPath(path, "buckets"), message: "buckets must be an array" });
  } else {
    value.buckets.forEach((bucket, index) => {
      collectHistogramBucketIssues(bucket, `${joinPath(path, "buckets")}.${index}`, issues);
    });
  }
}

function collectHistogramBucketIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "bucket must be an object" });
    return;
  }

  requireFiniteNumber(value, "le", joinPath(path, "le"), issues);
  requireNonNegativeInteger(value, "count", joinPath(path, "count"), issues);
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

function collectStringArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "value must be an array" });
    return;
  }

  value.forEach((item, index) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      issues.push({ path: `${path}.${index}`, message: "value must be a non-empty string" });
    }
  });
}

function collectOptionalStringArrayIssues(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value[field] !== undefined) {
    collectStringArrayIssues(value[field], path, issues);
  }
}

function collectOptionalStringRecordIssues(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  const record = value[field];
  if (record === undefined) {
    return;
  }

  if (!isRecord(record)) {
    issues.push({ path, message: "value must be an object" });
    return;
  }

  for (const [key, nested] of Object.entries(record)) {
    if (key.trim().length === 0 || typeof nested !== "string" || nested.trim().length === 0) {
      issues.push({ path: joinPath(path, key), message: "value must be a non-empty string" });
    }
  }
}

function requireOptionalNonEmptyString(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value[field] !== undefined) {
    requireNonEmptyString(value, field, path, issues);
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

function requireOptionalBoolean(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value[field] !== undefined) {
    requireBoolean(value, field, path, issues);
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

function requirePositiveInteger(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Number.isInteger(value[field]) || (value[field] as number) <= 0) {
    issues.push({ path, message: `${field} must be a positive integer` });
  }
}

function requireFiniteNumber(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (typeof value[field] !== "number" || !Number.isFinite(value[field])) {
    issues.push({ path, message: `${field} must be a finite number` });
  }
}

function requireNullableFiniteNumber(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value[field] !== null) {
    requireFiniteNumber(value, field, path, issues);
  }
}

function requireFingerprint(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (
    typeof value[field] !== "string" ||
    !/^fnv1a64:[0-9a-f]{16}$/.test(value[field] as string)
  ) {
    issues.push({ path, message: `${field} must be an audit export fingerprint` });
  }
}

function requireOneOf<TValue extends string>(
  value: Record<string, unknown>,
  field: string,
  path: string,
  allowed: readonly TValue[],
  issues: ValidationIssue[],
): void {
  if (typeof value[field] !== "string" || !allowed.includes(value[field] as TValue)) {
    issues.push({ path, message: `${field} must be one of ${allowed.join(", ")}` });
  }
}

function requireOptionalOneOf<TValue extends string>(
  value: Record<string, unknown>,
  field: string,
  path: string,
  allowed: readonly TValue[],
  issues: ValidationIssue[],
): void {
  if (value[field] !== undefined) {
    requireOneOf(value, field, path, allowed, issues);
  }
}

function collectSequenceRangeIssues(
  value: Record<string, unknown>,
  fromField: string,
  toField: string,
  issues: ValidationIssue[],
): void {
  if (
    Number.isInteger(value[fromField]) &&
    Number.isInteger(value[toField]) &&
    (value[toField] as number) < (value[fromField] as number)
  ) {
    issues.push({ path: toField, message: `${toField} must be greater than or equal to ${fromField}` });
  }
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

function collectAuditExportEventIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "audit export event must be an object" });
    return;
  }

  requireOptionalNonEmptyString(value, "eventId", joinPath(path, "eventId"), issues);
  requireIsoTimestamp(value, "timestamp", joinPath(path, "timestamp"), issues);
  requireNonEmptyString(value, "type", joinPath(path, "type"), issues);
  requireOptionalNullableNonEmptyString(value, "decision", joinPath(path, "decision"), issues);
  collectOptionalAuditExportEntityIssues(value, "actor", joinPath(path, "actor"), issues);
  collectOptionalAuditExportEntityIssues(value, "target", joinPath(path, "target"), issues);
  requireOptionalNullableNonEmptyString(value, "reason", joinPath(path, "reason"), issues);
  if (value.attributes !== undefined) {
    collectJsonObjectIssues(value.attributes, joinPath(path, "attributes"), issues);
  }
  if (value.context !== undefined) {
    collectJsonObjectIssues(value.context, joinPath(path, "context"), issues);
  }
}

function collectOptionalAuditExportEntityIssues(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  const entity = value[field];
  if (entity === undefined || entity === null) {
    return;
  }

  if (typeof entity === "string") {
    if (entity.trim().length === 0) {
      issues.push({ path, message: `${field} must be a non-empty string or object` });
    }
    return;
  }

  collectJsonObjectIssues(entity, path, issues);
}

function collectAuditExportFiltersIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "filters must be an object" });
    return;
  }

  collectOptionalFilterListIssues(value, "decision", joinPath(path, "decision"), issues);
  collectOptionalFilterListIssues(value, "decisions", joinPath(path, "decisions"), issues);
  collectOptionalFilterListIssues(value, "type", joinPath(path, "type"), issues);
  collectOptionalFilterListIssues(value, "types", joinPath(path, "types"), issues);
  requireOptionalNullableIsoTimestamp(value, "from", joinPath(path, "from"), issues);
  requireOptionalNullableIsoTimestamp(value, "fromTimestamp", joinPath(path, "fromTimestamp"), issues);
  requireOptionalNullableIsoTimestamp(value, "to", joinPath(path, "to"), issues);
  requireOptionalNullableIsoTimestamp(value, "toTimestamp", joinPath(path, "toTimestamp"), issues);

  const from = readEffectiveNullableString(value.fromTimestamp, value.from);
  const to = readEffectiveNullableString(value.toTimestamp, value.to);
  if (
    typeof from === "string" &&
    typeof to === "string" &&
    isIsoTimestamp(from) &&
    isIsoTimestamp(to) &&
    from > to
  ) {
    issues.push({
      path: joinPath(path, "toTimestamp"),
      message: "toTimestamp must be greater than or equal to fromTimestamp",
    });
  }
}

function collectOptionalFilterListIssues(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  const fieldValue = value[field];
  if (fieldValue === undefined || fieldValue === null) {
    return;
  }

  if (typeof fieldValue === "string") {
    if (fieldValue.trim().length === 0) {
      issues.push({ path, message: `${field} must be a non-empty string or array` });
    }
    return;
  }

  if (!Array.isArray(fieldValue)) {
    issues.push({ path, message: `${field} must be a non-empty string or array` });
    return;
  }

  fieldValue.forEach((item, index) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      issues.push({ path: `${path}.${index}`, message: "value must be a non-empty string" });
    }
  });
}

function collectAuditExportPackageIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "audit export package must be an object" });
    return;
  }

  requireLiteralString(value, "kind", joinPath(path, "kind"), AUDIT_EXPORT_PACKAGE_KIND, issues);
  requirePositiveInteger(value, "version", joinPath(path, "version"), issues);
  collectAuditExportManifestIssues(value.manifest, joinPath(path, "manifest"), issues);
  requireString(value, "jsonl", joinPath(path, "jsonl"), issues);
  requireString(value, "csv", joinPath(path, "csv"), issues);
  requireFingerprint(value, "fingerprint", joinPath(path, "fingerprint"), issues);
}

function collectAuditExportContentResponseIssues(
  value: Record<string, unknown>,
  expectedFormat: "jsonl" | "csv",
  issues: ValidationIssue[],
): void {
  requireLiteralString(value, "kind", "kind", AUDIT_EXPORT_CONTENT_KIND, issues);
  requireLiteralString(value, "format", "format", expectedFormat, issues);
  requireNonEmptyString(value, "mediaType", "mediaType", issues);
  requireString(value, "content", "content", issues);
  requireFingerprint(value, "fingerprint", "fingerprint", issues);
  requireNonEmptyString(value, "exportId", "exportId", issues);
  requireIsoTimestamp(value, "createdAt", "createdAt", issues);
}

function collectAuditExportManifestIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "audit export manifest must be an object" });
    return;
  }

  requireLiteralString(value, "kind", joinPath(path, "kind"), AUDIT_EXPORT_MANIFEST_KIND, issues);
  requirePositiveInteger(value, "version", joinPath(path, "version"), issues);
  requireNonEmptyString(value, "exportId", joinPath(path, "exportId"), issues);
  requireIsoTimestamp(value, "createdAt", joinPath(path, "createdAt"), issues);
  requireNonNegativeInteger(value, "eventCount", joinPath(path, "eventCount"), issues);
  requireNullableIsoTimestamp(value, "firstTimestamp", joinPath(path, "firstTimestamp"), issues);
  requireNullableIsoTimestamp(value, "lastTimestamp", joinPath(path, "lastTimestamp"), issues);
  collectStringArrayIssues(value.decisions, joinPath(path, "decisions"), issues);
  collectStringArrayIssues(value.types, joinPath(path, "types"), issues);
  collectNormalizedAuditExportFiltersIssues(value.filters, joinPath(path, "filters"), issues);
  collectStringArrayIssues(value.eventFingerprints, joinPath(path, "eventFingerprints"), issues);
  collectAuditExportContentDescriptorIssues(value.jsonl, joinPath(path, "jsonl"), issues);
  collectAuditExportContentDescriptorIssues(value.csv, joinPath(path, "csv"), issues);
  requireFingerprint(value, "fingerprint", joinPath(path, "fingerprint"), issues);

  if (
    Number.isInteger(value.eventCount) &&
    Array.isArray(value.eventFingerprints) &&
    value.eventFingerprints.length !== value.eventCount
  ) {
    issues.push({
      path: joinPath(path, "eventFingerprints"),
      message: "eventFingerprints length must match eventCount",
    });
  }
}

function collectNormalizedAuditExportFiltersIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "filters must be an object" });
    return;
  }

  collectStringArrayIssues(value.decisions, joinPath(path, "decisions"), issues);
  collectStringArrayIssues(value.types, joinPath(path, "types"), issues);
  requireNullableIsoTimestamp(value, "fromTimestamp", joinPath(path, "fromTimestamp"), issues);
  requireNullableIsoTimestamp(value, "toTimestamp", joinPath(path, "toTimestamp"), issues);

  if (
    typeof value.fromTimestamp === "string" &&
    typeof value.toTimestamp === "string" &&
    isIsoTimestamp(value.fromTimestamp) &&
    isIsoTimestamp(value.toTimestamp) &&
    value.fromTimestamp > value.toTimestamp
  ) {
    issues.push({
      path: joinPath(path, "toTimestamp"),
      message: "toTimestamp must be greater than or equal to fromTimestamp",
    });
  }
}

function collectAuditExportContentDescriptorIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "content descriptor must be an object" });
    return;
  }

  requireFingerprint(value, "fingerprint", joinPath(path, "fingerprint"), issues);
  requireNonEmptyString(value, "mediaType", joinPath(path, "mediaType"), issues);
  requireNonNegativeInteger(value, "bytes", joinPath(path, "bytes"), issues);
  if (value.rows !== undefined) {
    requireNonNegativeInteger(value, "rows", joinPath(path, "rows"), issues);
  }
  if (value.lines !== undefined) {
    requireNonNegativeInteger(value, "lines", joinPath(path, "lines"), issues);
  }
  if (value.columns !== undefined) {
    collectStringArrayIssues(value.columns, joinPath(path, "columns"), issues);
  }
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

function requireString(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (typeof value[field] !== "string") {
    issues.push({ path, message: `${field} must be a string` });
  }
}

function requireOptionalNullableNonEmptyString(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value[field] !== undefined && value[field] !== null) {
    requireNonEmptyString(value, field, path, issues);
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

function requireNullableIsoTimestamp(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value[field] !== null) {
    requireIsoTimestamp(value, field, path, issues);
  }
}

function requireOptionalNullableIsoTimestamp(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value[field] !== undefined) {
    requireNullableIsoTimestamp(value, field, path, issues);
  }
}

function isIsoTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function readEffectiveNullableString(
  primary: unknown,
  fallback: unknown,
): string | null | undefined {
  if (primary !== undefined) {
    return primary === null || typeof primary === "string" ? primary : undefined;
  }

  return fallback === null || typeof fallback === "string" ? fallback : undefined;
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
