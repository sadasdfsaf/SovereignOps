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
import type { DeepReadonly } from "./workspace.ts";
import {
  INGEST_CONNECTOR_MCP_PREVIEW_SCHEMA_VERSION as SHARED_PREVIEW_SCHEMA_VERSION,
  INGEST_CONNECTOR_MCP_RESOURCES_SCHEMA_VERSION as SHARED_RESOURCES_SCHEMA_VERSION,
  INGEST_CONNECTOR_MCP_RESOURCE_SCHEMA_VERSION as SHARED_RESOURCE_SCHEMA_VERSION,
  validateIngestConnectorMcpPreview,
  validateIngestConnectorMcpResource,
  validateIngestConnectorMcpResources,
  type IngestConnectorMcpApiValidationIssue,
} from "../../schemas/src/ingestConnectorMcpApi.ts";

export type IngestConnectorMcpClientOptions =
  Omit<SovereignOpsClientOptions, "fetch"> & {
    readonly fetch: FetchLike;
  };

export type IngestConnectorMcpResourceListSchemaVersion =
  "ingest-connector-mcp-resources/v1";
export type IngestConnectorMcpResourceSchemaVersion =
  "ingest-connector-mcp-resource/v1";
export type IngestConnectorMcpResourceContentSchemaVersion =
  "ingest-connector-mcp-resource-content/v1";
export type IngestConnectorMcpPreviewSchemaVersion =
  "ingest-connector-mcp-preview/v1";

export interface IngestConnectorMcpMetadata {
  readonly localOnly: true;
  readonly noNetwork: true;
  readonly durableWrites: false;
}

export interface IngestConnectorMcpResourceDescriptor {
  readonly uri: string;
  readonly name: string;
  readonly description: string;
  readonly mimeType: "application/json";
}

export interface IngestConnectorMcpResourceContent {
  readonly uri: string;
  readonly mimeType: "application/json";
  readonly text: string;
}

export interface IngestConnectorMcpConnectorProfile {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly transport: "in-process";
  readonly capabilities: readonly string[];
  readonly mediaTypes: readonly string[];
  readonly auth: {
    readonly mode: "none";
    readonly required: false;
  };
  readonly preview: {
    readonly dryRun: true;
    readonly maxItems: number;
    readonly maxTextBytes: number;
  };
  readonly safety: {
    readonly localOnly: true;
    readonly networkAccess: false;
    readonly durableWrites: false;
    readonly untrustedByDefault: boolean;
  };
}

export interface IngestConnectorMcpResourceManifest {
  readonly schemaVersion: IngestConnectorMcpResourceSchemaVersion;
  readonly localOnly: true;
  readonly noNetwork: true;
  readonly durableWrites: false;
  readonly metadata: IngestConnectorMcpMetadata;
  readonly connectorId: string;
  readonly resource: IngestConnectorMcpResourceDescriptor;
  readonly connector: IngestConnectorMcpConnectorProfile;
  readonly content: IngestConnectorMcpResourceContent;
}

export interface IngestConnectorMcpResourceListResponse {
  readonly schemaVersion: IngestConnectorMcpResourceListSchemaVersion;
  readonly localOnly: true;
  readonly noNetwork: true;
  readonly durableWrites: false;
  readonly metadata: IngestConnectorMcpMetadata;
  readonly resources: readonly IngestConnectorMcpResourceManifest[];
}

export interface IngestConnectorMcpResourceResponse {
  readonly schemaVersion: IngestConnectorMcpResourceSchemaVersion;
  readonly localOnly: true;
  readonly noNetwork: true;
  readonly durableWrites: false;
  readonly metadata: IngestConnectorMcpMetadata;
  readonly resource: IngestConnectorMcpResourceManifest;
}

export interface IngestConnectorMcpPreviewRequest {
  readonly connectorId?: string;
  readonly resourceUri?: string;
  readonly includeContent?: boolean;
}

export interface IngestConnectorMcpPreviewResponse {
  readonly schemaVersion: IngestConnectorMcpPreviewSchemaVersion;
  readonly localOnly: true;
  readonly noNetwork: true;
  readonly durableWrites: false;
  readonly dryRun: true;
  readonly metadata: IngestConnectorMcpMetadata;
  readonly connectorId: string;
  readonly resource: IngestConnectorMcpResourceManifest;
  readonly preview: {
    readonly accepted: true;
    readonly sideEffects: false;
    readonly durableWrites: false;
    readonly contentIncluded: boolean;
    readonly contentBytes: number;
  };
}

type Validator<T> = (value: unknown) => T;

const ENDPOINT = "ingest/connectors/mcp";
const RESOURCE_LIST_SCHEMA_VERSION: IngestConnectorMcpResourceListSchemaVersion =
  "ingest-connector-mcp-resources/v1";
const RESOURCE_SCHEMA_VERSION: IngestConnectorMcpResourceSchemaVersion =
  "ingest-connector-mcp-resource/v1";
const RESOURCE_CONTENT_SCHEMA_VERSION: IngestConnectorMcpResourceContentSchemaVersion =
  "ingest-connector-mcp-resource-content/v1";
const PREVIEW_SCHEMA_VERSION: IngestConnectorMcpPreviewSchemaVersion =
  "ingest-connector-mcp-preview/v1";
const SHARED_VALIDATION_GENERATED_AT = "1970-01-01T00:00:00.000Z";
const SHARED_EXCLUDED_CONTENT_TEXT = "[content excluded]";
const CONNECTOR_ID_PATTERN = /^local\.[A-Za-z0-9_.-]{1,96}$/;
const PREVIEW_REQUEST_KEYS = ["connectorId", "resourceUri", "includeContent"] as const;

const RAW_LOCAL_PATH_PATTERN =
  /(?:\b[A-Za-z]:[\\/][^\s"',;)}\]]+|\\\\[^\\\s"',;)}\]]+[\\][^\s"',;)}\]]+|\b(?:\/Users|\/home|\/root|\/tmp|\/var|\/etc|\/opt|\/private|\/mnt|\/Volumes)\/[^\s"',;)}\]]+)/g;
const PRIVATE_LOCATION_PATTERN =
  /(?:^|[\\/])\.codex-private(?:[\\/]|$)|(?:^|[\\/])\.codex-run(?:[\\/]|$)|\bsovereignops-codex-pack\b|\bplan-pack\b|\bprivate[-_\s]?plan(?:[-_\s]?pack)?\b|\bcodex_start_here\b/gi;
const SECRET_VALUE_PATTERN =
  /\b(?:Bearer\s+[A-Za-z0-9._~+/=-]{8,}|(?:sk|rk|pk|tok|pat|npm|ghp|gho)_[A-Za-z0-9_-]{8,}|(?:sk|rk|pat|glpat|github_pat)-[A-Za-z0-9_-]{8,}|AKIA[0-9A-Z]{16})\b|-----BEGIN [A-Z ]*PRIVATE KEY-----/gi;
const SECRET_ASSIGNMENT_PATTERN =
  /\b((?:api[-_]?key|apikey|authorization|credential|password|passwd|passphrase|secret|session[-_]?token|token)\s*[:=]\s*)([^\s,;]+)/gi;
const SENSITIVE_FIELD_PATTERN =
  /(?:authorization|api[-_]?key|apikey|auth|bearer|cookie|credential|jwt|password|passwd|passphrase|private[-_]?key|refresh[-_]?token|secret|session[-_]?token|signing[-_]?key|token)$/i;
const PATH_FIELD_PATTERN =
  /(?:^|_)(?:absolute_path|file_path|include_paths?|path|paths|relative_path|root_path|storage_path)$/i;
const REDACTED_TOKEN_PATTERN = /^\[redacted(?::[A-Za-z0-9_-]+)*\]$/i;

export class IngestConnectorMcpClient {
  readonly #baseUrl: string;
  readonly #fetch: FetchLike;
  readonly #apiKey?: string;
  readonly #headers: Readonly<Record<string, string>>;

  constructor(options: IngestConnectorMcpClientOptions) {
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
      issues.push({ path: "fetch", message: "fetch must be provided for ingest connector MCP calls" });
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

  async listResources(): Promise<DeepReadonly<IngestConnectorMcpResourceListResponse>> {
    return this.#request(
      `${ENDPOINT}/resources`,
      { method: "GET" },
      parseResourceListResponse,
    );
  }

  async listConnectorResources(): Promise<DeepReadonly<IngestConnectorMcpResourceListResponse>> {
    return this.listResources();
  }

  async listMcpConnectorResources(): Promise<DeepReadonly<IngestConnectorMcpResourceListResponse>> {
    return this.listResources();
  }

  async readResource(
    connectorId: string,
  ): Promise<DeepReadonly<IngestConnectorMcpResourceResponse>> {
    validateConnectorIdInput(connectorId, "connectorId");
    return this.#request(
      `${ENDPOINT}/resources/${encodePathPart(connectorId)}`,
      { method: "GET" },
      parseResourceResponse,
    );
  }

  async readConnectorResource(
    connectorId: string,
  ): Promise<DeepReadonly<IngestConnectorMcpResourceResponse>> {
    return this.readResource(connectorId);
  }

  async readMcpConnectorResource(
    connectorId: string,
  ): Promise<DeepReadonly<IngestConnectorMcpResourceResponse>> {
    return this.readResource(connectorId);
  }

  async preview(
    input: IngestConnectorMcpPreviewRequest,
  ): Promise<DeepReadonly<IngestConnectorMcpPreviewResponse>> {
    validatePreviewRequest(input);
    return this.#request(
      `${ENDPOINT}/preview`,
      {
        method: "POST",
        body: JSON.stringify(buildPreviewBody(input)),
      },
      parsePreviewResponse,
    );
  }

  async previewOutput(
    input: IngestConnectorMcpPreviewRequest,
  ): Promise<DeepReadonly<IngestConnectorMcpPreviewResponse>> {
    return this.preview(input);
  }

  async previewManifestResources(
    input: IngestConnectorMcpPreviewRequest,
  ): Promise<DeepReadonly<IngestConnectorMcpPreviewResponse>> {
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

export function createIngestConnectorMcpClient(
  options: IngestConnectorMcpClientOptions,
): IngestConnectorMcpClient {
  return new IngestConnectorMcpClient(options);
}

function buildPreviewBody(input: IngestConnectorMcpPreviewRequest): Record<string, unknown> {
  return pruneUndefined({
    connectorId: input.connectorId,
    resourceUri: input.resourceUri,
    includeContent: input.includeContent,
  });
}

function validatePreviewRequest(input: unknown): void {
  if (!isRecord(input)) {
    throw new ApiRequestValidationError("ingest connector MCP preview request is invalid", [
      { path: "", message: "request must be an object" },
    ]);
  }

  const issues: ValidationIssue[] = [];
  collectAllowedKeys(input, "", PREVIEW_REQUEST_KEYS, issues);
  if (input.connectorId !== undefined) {
    collectConnectorIdIssues(input.connectorId, "connectorId", issues);
  }
  if (input.resourceUri !== undefined) {
    requireSafeStringValue(input.resourceUri, "resourceUri", "resourceUri", issues);
  }
  if (input.connectorId === undefined && input.resourceUri === undefined) {
    issues.push({ path: "connectorId", message: "preview requires connectorId or resourceUri" });
  }
  requireOptionalBoolean(input, "includeContent", "includeContent", issues);

  if (issues.length > 0) {
    throw new ApiRequestValidationError(
      "ingest connector MCP preview request is invalid",
      issues,
    );
  }
}

function parseResourceListResponse(
  value: unknown,
): DeepReadonly<IngestConnectorMcpResourceListResponse> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw responseIssues([{ path: "", message: "response must be an object" }], value);
  }

  requireLiteralString(value, "schemaVersion", "schemaVersion", RESOURCE_LIST_SCHEMA_VERSION, issues);
  collectLocalEnvelopeIssues(value, issues);
  collectMetadataIssues(value.metadata, "metadata", issues);
  collectResourceManifestArrayIssues(value.resources, "resources", issues);
  throwResponseIssues(issues, value);
  throwResponseIssues(collectSharedResourceListResponseIssues(value), value);

  return deepFreezeClone(value) as DeepReadonly<IngestConnectorMcpResourceListResponse>;
}

function parseResourceResponse(
  value: unknown,
): DeepReadonly<IngestConnectorMcpResourceResponse> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw responseIssues([{ path: "", message: "response must be an object" }], value);
  }

  requireLiteralString(value, "schemaVersion", "schemaVersion", RESOURCE_SCHEMA_VERSION, issues);
  collectLocalEnvelopeIssues(value, issues);
  collectMetadataIssues(value.metadata, "metadata", issues);
  collectResourceManifestIssues(value.resource, "resource", issues);
  throwResponseIssues(issues, value);
  throwResponseIssues(collectSharedResourceResponseIssues(value), value);

  return deepFreezeClone(value) as DeepReadonly<IngestConnectorMcpResourceResponse>;
}

function parsePreviewResponse(
  value: unknown,
): DeepReadonly<IngestConnectorMcpPreviewResponse> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw responseIssues([{ path: "", message: "response must be an object" }], value);
  }

  requireLiteralString(value, "schemaVersion", "schemaVersion", PREVIEW_SCHEMA_VERSION, issues);
  collectLocalEnvelopeIssues(value, issues);
  requireTrue(value, "dryRun", "dryRun", issues);
  collectMetadataIssues(value.metadata, "metadata", issues);
  requireConnectorId(value, "connectorId", "connectorId", issues);
  collectResourceManifestIssues(value.resource, "resource", issues);
  collectPreviewSummaryIssues(value.preview, "preview", issues);
  collectPreviewConsistencyIssues(value, issues);
  throwResponseIssues(issues, value);
  throwResponseIssues(collectSharedPreviewResponseIssues(value), value);

  return deepFreezeClone(value) as DeepReadonly<IngestConnectorMcpPreviewResponse>;
}

function collectSharedResourceListResponseIssues(
  value: Record<string, unknown>,
): ValidationIssue[] {
  if (!Array.isArray(value.resources)) {
    return [];
  }

  const generatedAt = sharedGeneratedAt(value);
  return value.resources.flatMap((resource, index) => {
    const resourcePath = `resources.${index}`;
    const result = validateIngestConnectorMcpResources(
      buildSharedResourcesEnvelope(resource, generatedAt),
    );
    return sharedValidationIssues(result, (path) =>
      mapSharedResourcesIssuePath(path, resourcePath)
    );
  });
}

function collectSharedResourceResponseIssues(
  value: Record<string, unknown>,
): ValidationIssue[] {
  const result = validateIngestConnectorMcpResource(
    buildSharedResourceEnvelope(value.resource, sharedGeneratedAt(value)),
  );
  return sharedValidationIssues(result, (path) =>
    mapSharedResourceEnvelopeIssuePath(path, "resource")
  );
}

function collectSharedPreviewResponseIssues(
  value: Record<string, unknown>,
): ValidationIssue[] {
  const result = validateIngestConnectorMcpPreview(buildSharedPreviewEnvelope(value));
  return sharedValidationIssues(result, mapSharedPreviewIssuePath);
}

function buildSharedResourcesEnvelope(resource: unknown, generatedAt: unknown): unknown {
  const sharedResource = buildSharedResourceEnvelope(resource, generatedAt);
  return {
    schemaVersion: SHARED_RESOURCES_SCHEMA_VERSION,
    generatedAt,
    connectorId: isRecord(sharedResource) ? sharedResource.connectorId : undefined,
    localOnly: isRecord(resource) && Object.hasOwn(resource, "localOnly")
      ? resource.localOnly
      : true,
    resources: isRecord(sharedResource) ? [sharedResource.resource] : [],
  };
}

function buildSharedResourceEnvelope(resource: unknown, generatedAt: unknown): unknown {
  const record = isRecord(resource) ? resource : {};
  const descriptor = isRecord(record.resource) ? record.resource : {};
  const content = isRecord(record.content) ? record.content : {};
  const connectorId = stringValue(record.connectorId);
  const text = sharedContentText(stringValue(content.text));

  return {
    schemaVersion: SHARED_RESOURCE_SCHEMA_VERSION,
    generatedAt,
    connectorId,
    localOnly: Object.hasOwn(record, "localOnly") ? record.localOnly : true,
    resource: {
      id: connectorId,
      uri: sharedResourceUri(descriptor.uri, connectorId),
      name: stringValue(descriptor.name),
      description: stringValue(descriptor.description),
      mimeType: stringValue(descriptor.mimeType),
      textBytes: text.length,
    },
    content: {
      type: "text",
      text,
      truncated: false,
    },
  };
}

function buildSharedPreviewEnvelope(value: Record<string, unknown>): unknown {
  const resource = isRecord(value.resource) ? value.resource : {};
  const sharedResource = buildSharedResourceEnvelope(resource, sharedGeneratedAt(value));
  const sharedTextBytes =
    isRecord(sharedResource) &&
    isRecord(sharedResource.resource) &&
    typeof sharedResource.resource.textBytes === "number"
      ? sharedResource.resource.textBytes
      : 0;

  return {
    schemaVersion: SHARED_PREVIEW_SCHEMA_VERSION,
    generatedAt: sharedGeneratedAt(value),
    connectorId: value.connectorId,
    localOnly: Object.hasOwn(value, "localOnly") ? value.localOnly : true,
    dryRun: value.dryRun,
    request: {
      maxItems: sharedPreviewLimit(resource, "maxItems"),
      maxTextBytes: sharedPreviewLimit(resource, "maxTextBytes"),
    },
    resources: [sharedResource],
    summary: {
      resourceCount: 1,
      totalTextBytes: sharedTextBytes,
      truncated: false,
    },
  };
}

function sharedValidationIssues(
  result: { readonly ok: boolean; readonly issues: readonly IngestConnectorMcpApiValidationIssue[] },
  mapPath: (path: string) => string,
): ValidationIssue[] {
  if (result.ok) {
    return [];
  }

  return result.issues.map((issue) => ({
    path: redactUnsafeText(mapPath(issue.path)),
    message: `shared schema: ${redactUnsafeText(issue.message)}`,
  }));
}

function mapSharedResourcesIssuePath(path: string, resourcePath: string): string {
  const clean = normalizeSharedIssuePath(path);
  if (clean === "" || clean === "resources" || clean === "resources.0") {
    return resourcePath;
  }
  if (clean === "connectorId") {
    return joinPath(resourcePath, "connectorId");
  }
  if (clean === "localOnly") {
    return joinPath(resourcePath, "localOnly");
  }
  if (clean === "generatedAt") {
    return "generatedAt";
  }
  if (clean.startsWith("resources.0.")) {
    return mapSharedResourceSummaryIssuePath(
      clean.slice("resources.0.".length),
      resourcePath,
    );
  }
  return joinPath("shared", clean);
}

function mapSharedResourceEnvelopeIssuePath(path: string, resourcePath: string): string {
  return mapSharedResourceEnvelopeCleanPath(normalizeSharedIssuePath(path), resourcePath);
}

function mapSharedPreviewIssuePath(path: string): string {
  const clean = normalizeSharedIssuePath(path);
  if (clean === "" || clean === "resources" || clean === "resources.0") {
    return "resource";
  }
  if (clean === "connectorId" || clean === "localOnly" || clean === "dryRun") {
    return clean;
  }
  if (clean === "generatedAt") {
    return "generatedAt";
  }
  if (clean === "request.maxItems") {
    return "resource.connector.preview.maxItems";
  }
  if (clean === "request.maxTextBytes") {
    return "resource.connector.preview.maxTextBytes";
  }
  if (clean.startsWith("resources.0.")) {
    return mapSharedResourceEnvelopeCleanPath(
      clean.slice("resources.0.".length),
      "resource",
    );
  }
  if (clean.startsWith("summary.")) {
    return joinPath("preview", clean.slice("summary.".length));
  }
  return joinPath("shared", clean);
}

function mapSharedResourceEnvelopeCleanPath(clean: string, resourcePath: string): string {
  if (clean === "") {
    return resourcePath;
  }
  if (clean === "connectorId") {
    return joinPath(resourcePath, "connectorId");
  }
  if (clean === "localOnly" || clean === "schemaVersion") {
    return joinPath(resourcePath, clean);
  }
  if (clean === "generatedAt") {
    return "generatedAt";
  }
  if (clean === "resource") {
    return joinPath(resourcePath, "resource");
  }
  if (clean.startsWith("resource.")) {
    return mapSharedResourceSummaryIssuePath(
      clean.slice("resource.".length),
      resourcePath,
    );
  }
  if (clean === "content") {
    return joinPath(resourcePath, "content");
  }
  if (clean === "content.text") {
    return joinPath(resourcePath, "content.text");
  }
  if (clean === "content.type" || clean === "content.truncated") {
    return joinPath(resourcePath, "content");
  }
  if (clean.startsWith("content.")) {
    return joinPath(resourcePath, clean);
  }
  return joinPath("shared", clean);
}

function mapSharedResourceSummaryIssuePath(clean: string, resourcePath: string): string {
  switch (clean) {
    case "id":
      return joinPath(resourcePath, "connectorId");
    case "uri":
      return joinPath(resourcePath, "resource.uri");
    case "name":
      return joinPath(resourcePath, "resource.name");
    case "description":
      return joinPath(resourcePath, "resource.description");
    case "mimeType":
      return joinPath(resourcePath, "resource.mimeType");
    case "textBytes":
      return joinPath(resourcePath, "content.text");
    default:
      return joinPath(resourcePath, `resource.${clean}`);
  }
}

function normalizeSharedIssuePath(path: string): string {
  const clean = path.trim();
  const withoutRoot = clean === "$"
    ? ""
    : clean.startsWith("$.")
      ? clean.slice(2)
      : clean.startsWith("$")
        ? clean.slice(1)
        : clean;
  return withoutRoot
    .replace(/\[(\d+)\]/g, ".$1")
    .replace(/^\./, "");
}

function sharedGeneratedAt(value: Record<string, unknown>): unknown {
  return Object.hasOwn(value, "generatedAt")
    ? value.generatedAt
    : SHARED_VALIDATION_GENERATED_AT;
}

function sharedPreviewLimit(
  resource: Record<string, unknown>,
  field: "maxItems" | "maxTextBytes",
): unknown {
  const connector = isRecord(resource.connector) ? resource.connector : {};
  const preview = isRecord(connector.preview) ? connector.preview : {};
  return Object.hasOwn(preview, field) ? preview[field] : 1;
}

function sharedResourceUri(value: unknown, connectorId: string): string {
  if (typeof value === "string" && value.startsWith("ingest://")) {
    return value;
  }
  return `ingest://${connectorId}/manifest`;
}

function sharedContentText(value: string): string {
  return value.length === 0 ? SHARED_EXCLUDED_CONTENT_TEXT : value;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function collectLocalEnvelopeIssues(
  value: Record<string, unknown>,
  issues: ValidationIssue[],
): void {
  requireTrue(value, "localOnly", "localOnly", issues);
  requireTrue(value, "noNetwork", "noNetwork", issues);
  requireFalse(value, "durableWrites", "durableWrites", issues);
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

  requireTrue(value, "localOnly", joinPath(path, "localOnly"), issues);
  requireTrue(value, "noNetwork", joinPath(path, "noNetwork"), issues);
  requireFalse(value, "durableWrites", joinPath(path, "durableWrites"), issues);
}

function collectResourceManifestArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "resources must be an array" });
    return;
  }

  const seen = new Set<string>();
  for (const [index, item] of value.entries()) {
    const itemPath = `${path}.${index}`;
    collectResourceManifestIssues(item, itemPath, issues);
    if (isRecord(item) && typeof item.connectorId === "string") {
      if (seen.has(item.connectorId)) {
        issues.push({
          path: joinPath(itemPath, "connectorId"),
          message: "connectorId values must be unique",
        });
      }
      seen.add(item.connectorId);
    }
  }
}

function collectResourceManifestIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "resource manifest must be an object" });
    return;
  }

  requireLiteralString(value, "schemaVersion", joinPath(path, "schemaVersion"), RESOURCE_SCHEMA_VERSION, issues);
  collectLocalEnvelopeIssuesAtPath(value, path, issues);
  collectMetadataIssues(value.metadata, joinPath(path, "metadata"), issues);
  requireConnectorId(value, "connectorId", joinPath(path, "connectorId"), issues);
  collectResourceDescriptorIssues(value.resource, joinPath(path, "resource"), issues);
  collectConnectorProfileIssues(value.connector, joinPath(path, "connector"), issues);
  collectResourceContentIssues(value.content, joinPath(path, "content"), issues);
  collectResourceManifestConsistencyIssues(value, path, issues);
}

function collectLocalEnvelopeIssuesAtPath(
  value: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
): void {
  requireTrue(value, "localOnly", joinPath(path, "localOnly"), issues);
  requireTrue(value, "noNetwork", joinPath(path, "noNetwork"), issues);
  requireFalse(value, "durableWrites", joinPath(path, "durableWrites"), issues);
}

function collectResourceDescriptorIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "resource descriptor must be an object" });
    return;
  }

  requireSafeString(value, "uri", joinPath(path, "uri"), issues);
  requireSafeString(value, "name", joinPath(path, "name"), issues);
  requireSafeString(value, "description", joinPath(path, "description"), issues);
  requireLiteralString(value, "mimeType", joinPath(path, "mimeType"), "application/json", issues);
}

function collectResourceContentIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "resource content must be an object" });
    return;
  }

  requireSafeString(value, "uri", joinPath(path, "uri"), issues);
  requireLiteralString(value, "mimeType", joinPath(path, "mimeType"), "application/json", issues);
  requireSafeString(value, "text", joinPath(path, "text"), issues);
  collectContentTextIssues(value.text, joinPath(path, "text"), issues);
}

function collectContentTextIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    issues.push({ path, message: "text must contain JSON" });
    return;
  }
  if (!isRecord(parsed)) {
    issues.push({ path, message: "text JSON must be an object" });
    return;
  }
  if (parsed.schemaVersion !== undefined) {
    requireLiteralString(
      parsed,
      "schemaVersion",
      `${path}.schemaVersion`,
      RESOURCE_CONTENT_SCHEMA_VERSION,
      issues,
    );
  }
  if (parsed.localOnly !== undefined) {
    requireTrue(parsed, "localOnly", `${path}.localOnly`, issues);
  }
}

function collectConnectorProfileIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "connector must be an object" });
    return;
  }

  requireConnectorId(value, "id", joinPath(path, "id"), issues);
  requireSafeString(value, "label", joinPath(path, "label"), issues);
  requireSafeString(value, "description", joinPath(path, "description"), issues);
  requireLiteralString(value, "transport", joinPath(path, "transport"), "in-process", issues);
  collectStringArrayIssues(value.capabilities, joinPath(path, "capabilities"), issues);
  collectStringArrayIssues(value.mediaTypes, joinPath(path, "mediaTypes"), issues);
  collectAuthIssues(value.auth, joinPath(path, "auth"), issues);
  collectConnectorPreviewIssues(value.preview, joinPath(path, "preview"), issues);
  collectConnectorSafetyIssues(value.safety, joinPath(path, "safety"), issues);
}

function collectAuthIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "auth must be an object" });
    return;
  }

  requireLiteralString(value, "mode", joinPath(path, "mode"), "none", issues);
  requireFalse(value, "required", joinPath(path, "required"), issues);
}

function collectConnectorPreviewIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "preview must be an object" });
    return;
  }

  requireTrue(value, "dryRun", joinPath(path, "dryRun"), issues);
  requirePositiveInteger(value, "maxItems", joinPath(path, "maxItems"), issues);
  requirePositiveInteger(value, "maxTextBytes", joinPath(path, "maxTextBytes"), issues);
}

function collectConnectorSafetyIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "safety must be an object" });
    return;
  }

  requireTrue(value, "localOnly", joinPath(path, "localOnly"), issues);
  requireFalse(value, "networkAccess", joinPath(path, "networkAccess"), issues);
  requireFalse(value, "durableWrites", joinPath(path, "durableWrites"), issues);
  requireBoolean(value, "untrustedByDefault", joinPath(path, "untrustedByDefault"), issues);
}

function collectPreviewSummaryIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "preview must be an object" });
    return;
  }

  requireTrue(value, "accepted", joinPath(path, "accepted"), issues);
  requireFalse(value, "sideEffects", joinPath(path, "sideEffects"), issues);
  requireFalse(value, "durableWrites", joinPath(path, "durableWrites"), issues);
  requireBoolean(value, "contentIncluded", joinPath(path, "contentIncluded"), issues);
  requireNonNegativeInteger(value, "contentBytes", joinPath(path, "contentBytes"), issues);
}

function collectResourceManifestConsistencyIssues(
  value: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
): void {
  if (
    typeof value.connectorId === "string" &&
    isRecord(value.connector) &&
    typeof value.connector.id === "string" &&
    value.connectorId !== value.connector.id
  ) {
    issues.push({
      path: joinPath(path, "connector.id"),
      message: "connector.id must match connectorId",
    });
  }
  if (
    isRecord(value.resource) &&
    isRecord(value.content) &&
    typeof value.resource.uri === "string" &&
    typeof value.content.uri === "string" &&
    value.resource.uri !== value.content.uri
  ) {
    issues.push({
      path: joinPath(path, "content.uri"),
      message: "content uri must match resource uri",
    });
  }
}

function collectPreviewConsistencyIssues(
  value: Record<string, unknown>,
  issues: ValidationIssue[],
): void {
  if (
    typeof value.connectorId === "string" &&
    isRecord(value.resource) &&
    typeof value.resource.connectorId === "string" &&
    value.connectorId !== value.resource.connectorId
  ) {
    issues.push({
      path: "resource.connectorId",
      message: "resource connectorId must match response connectorId",
    });
  }
  if (!isRecord(value.preview) || !isRecord(value.resource) || !isRecord(value.resource.content)) {
    return;
  }

  const text = value.resource.content.text;
  if (
    value.preview.contentIncluded === false &&
    typeof text === "string" &&
    text.length > 0
  ) {
    issues.push({ path: "resource.content.text", message: "content text must be empty when content is excluded" });
  }
  if (
    value.preview.contentIncluded === true &&
    Number.isInteger(value.preview.contentBytes) &&
    typeof text === "string" &&
    value.preview.contentBytes !== new TextEncoder().encode(text).length
  ) {
    issues.push({ path: "preview.contentBytes", message: "contentBytes must match content text bytes" });
  }
}

function validateConnectorIdInput(value: unknown, path: string): void {
  const issues: ValidationIssue[] = [];
  collectConnectorIdIssues(value, path, issues);
  if (issues.length > 0) {
    throw new ApiRequestValidationError("ingest connector MCP connector id is invalid", issues);
  }
}

function collectConnectorIdIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (typeof value !== "string" || !CONNECTOR_ID_PATTERN.test(value)) {
    issues.push({ path, message: "connector id must be a safe local connector id" });
    return;
  }
  if (unsafeStringReason(value, path) !== undefined) {
    issues.push({ path, message: "connector id must not include private paths or raw secrets" });
  }
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
  if (value.length === 0) {
    issues.push({ path, message: "value must not be empty" });
  }
  value.forEach((item, index) => {
    requireSafeStringValue(item, "value", `${path}.${index}`, issues);
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

function requireConnectorId(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  collectConnectorIdIssues(value[field], path, issues);
}

function requireSafeString(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  requireSafeStringValue(value[field], field, path, issues);
}

function requireSafeStringValue(
  value: unknown,
  label: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push({ path, message: `${label} must be a non-empty string` });
    return;
  }
  if (unsafeStringReason(value, label) !== undefined) {
    issues.push({ path, message: `${label} must not include private paths or raw secrets` });
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

function requireFalse(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value[field] !== false) {
    issues.push({ path, message: `${field} must be false` });
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
  if (value[field] !== undefined && typeof value[field] !== "boolean") {
    issues.push({ path, message: `${field} must be a boolean` });
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

function responseIssues(
  issues: readonly ValidationIssue[],
  body: unknown,
): ApiResponseValidationError {
  return new ApiResponseValidationError(issues, redactUnsafeValue(body));
}

function throwResponseIssues(
  issues: readonly ValidationIssue[],
  body: unknown,
): void {
  if (issues.length > 0) {
    throw responseIssues(issues, body);
  }
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

function unsafeStringReason(value: string, keyHint: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0 || isRedactedToken(trimmed)) {
    return undefined;
  }

  const key = normalizeToken(keyHint);
  if (matches(PRIVATE_LOCATION_PATTERN, trimmed)) {
    return "private_path";
  }
  if (PATH_FIELD_PATTERN.test(key) && hasTraversalSegment(trimmed)) {
    return "path_traversal";
  }
  if (matches(RAW_LOCAL_PATH_PATTERN, trimmed)) {
    return "raw_local_path";
  }
  if (SENSITIVE_FIELD_PATTERN.test(keyHint)) {
    return "raw_secret";
  }
  if (matches(SECRET_ASSIGNMENT_PATTERN, trimmed) || matches(SECRET_VALUE_PATTERN, trimmed)) {
    return "raw_secret";
  }
  return undefined;
}

function matches(pattern: RegExp, value: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(value);
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

function hasHeader(headers: Readonly<Record<string, string>>, name: string): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === name.toLowerCase());
}

function encodePathPart(value: string): string {
  return encodeURIComponent(value);
}

function joinPath(prefix: string, field: string): string {
  return prefix.length === 0 ? field : `${prefix}.${field}`;
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

function deepFreezeClone<T>(value: T): DeepReadonly<T> {
  return deepFreeze(structuredClone(value)) as DeepReadonly<T>;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
