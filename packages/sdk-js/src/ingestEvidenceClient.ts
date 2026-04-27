import {
  ApiNetworkError,
  ApiRequestValidationError,
  ApiResponseValidationError,
  type FetchLike,
  type FetchRequestInit,
  type FetchResponseLike,
  parseJsonApiResponse,
  type SovereignOpsClientOptions,
  type ValidationIssue,
} from "./client.ts";

export type IngestEvidenceClientOptions = SovereignOpsClientOptions;

export type IngestEvidenceExportFormat = "json" | "summary" | "manifest";
export type IngestEvidenceSection =
  | "evidenceFiles"
  | "sourceSnapshots"
  | "citationEvidence"
  | "quarantineDecisions"
  | "apiRequestTrace"
  | "clientSessionTrace";

export interface IngestEvidenceFilters {
  readonly sections?: readonly IngestEvidenceSection[];
  readonly evidenceFileIds?: readonly string[];
  readonly sourceUris?: readonly string[];
  readonly citationKinds?: readonly string[];
}

export interface IngestEvidenceExportRequest<TEvidence extends object = Record<string, unknown>> {
  readonly evidence: TEvidence;
  readonly format?: IngestEvidenceExportFormat;
  readonly filters?: IngestEvidenceFilters;
  readonly createdAt?: string;
  readonly exportId?: string;
}

export interface IngestEvidencePackageRequest<TEvidence extends object = Record<string, unknown>> {
  readonly evidence: TEvidence;
  readonly filters?: IngestEvidenceFilters;
  readonly createdAt?: string;
  readonly exportId?: string;
}

export interface IngestEvidenceContentDescriptor {
  readonly mediaType: "application/json";
  readonly bytes: number;
  readonly fingerprint: string;
}

export interface IngestEvidenceSectionDescriptor extends IngestEvidenceContentDescriptor {
  readonly section: IngestEvidenceSection;
  readonly itemCount: number;
}

export interface IngestEvidenceSummary {
  readonly sourceCount: number;
  readonly evidenceFileCount: number;
  readonly citationCount: number;
  readonly quarantineDecisionCount: number;
  readonly apiRequestTraceCount: number;
  readonly clientSessionTraceCount: number;
}

export interface NormalizedIngestEvidenceFilters {
  readonly sections: readonly IngestEvidenceSection[];
  readonly evidenceFileIds: readonly string[];
  readonly sourceUris: readonly string[];
  readonly citationKinds: readonly string[];
}

export interface IngestEvidenceManifest {
  readonly kind: "ingest-evidence.manifest";
  readonly version: number;
  readonly exportId: string;
  readonly createdAt: string;
  readonly schemaVersion: string | null;
  readonly workspaceId: string | null;
  readonly sessionId: string | null;
  readonly localOnly: boolean;
  readonly filters: NormalizedIngestEvidenceFilters;
  readonly evidenceSummary: IngestEvidenceSummary;
  readonly sections: readonly IngestEvidenceSectionDescriptor[];
  readonly content: IngestEvidenceContentDescriptor;
  readonly fingerprint: string;
}

export interface IngestEvidenceExportResponse {
  readonly kind: "ingest-evidence.export";
  readonly version: number;
  readonly format: IngestEvidenceExportFormat;
  readonly mediaType: "application/json";
  readonly content: string;
  readonly fingerprint: string;
  readonly exportId: string;
  readonly createdAt: string;
  readonly manifest: IngestEvidenceManifest;
}

export interface IngestEvidencePackageFile extends IngestEvidenceContentDescriptor {
  readonly path: "manifest.json" | "evidence.json";
  readonly content: string;
}

export interface IngestEvidencePackageResponse {
  readonly kind: "ingest-evidence.package";
  readonly version: number;
  readonly manifest: IngestEvidenceManifest;
  readonly files: readonly IngestEvidencePackageFile[];
  readonly fingerprint: string;
}

type Validator<T> = (value: unknown) => T;

const SECTION_ORDER: readonly IngestEvidenceSection[] = Object.freeze([
  "evidenceFiles",
  "sourceSnapshots",
  "citationEvidence",
  "quarantineDecisions",
  "apiRequestTrace",
  "clientSessionTrace",
]);
const SECTION_SET = new Set<string>(SECTION_ORDER);
const EXPORT_FORMATS = ["json", "summary", "manifest"] as const;
const PACKAGE_FILE_PATHS = ["manifest.json", "evidence.json"] as const;
const SHA256_FINGERPRINT_PATTERN = /^sha256:[0-9a-f]{64}$/;

export class IngestEvidenceClient {
  readonly #baseUrl: string;
  readonly #fetch: FetchLike;
  readonly #apiKey?: string;
  readonly #headers: Readonly<Record<string, string>>;

  constructor(options: IngestEvidenceClientOptions) {
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

  async exportEvidence<TEvidence extends object>(
    input: IngestEvidenceExportRequest<TEvidence>,
  ): Promise<IngestEvidenceExportResponse> {
    validateIngestEvidenceExportRequest(input);
    const expectedFormat = input.format ?? "json";
    return this.#request(
      "ingest/evidence/export",
      {
        method: "POST",
        body: JSON.stringify(buildIngestEvidenceExportBody(input)),
      },
      (value) => parseIngestEvidenceExportResponse(value, expectedFormat),
    );
  }

  async exportIngestEvidence<TEvidence extends object>(
    input: IngestEvidenceExportRequest<TEvidence>,
  ): Promise<IngestEvidenceExportResponse> {
    return this.exportEvidence(input);
  }

  async packageEvidence<TEvidence extends object>(
    input: IngestEvidencePackageRequest<TEvidence>,
  ): Promise<IngestEvidencePackageResponse> {
    validateIngestEvidencePackageRequest(input);
    return this.#request(
      "ingest/evidence/package",
      {
        method: "POST",
        body: JSON.stringify(buildIngestEvidencePackageBody(input)),
      },
      parseIngestEvidencePackageResponse,
    );
  }

  async packageIngestEvidence<TEvidence extends object>(
    input: IngestEvidencePackageRequest<TEvidence>,
  ): Promise<IngestEvidencePackageResponse> {
    return this.packageEvidence(input);
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

export function createIngestEvidenceClient(
  options: IngestEvidenceClientOptions,
): IngestEvidenceClient {
  return new IngestEvidenceClient(options);
}

function buildIngestEvidenceExportBody<TEvidence extends object>(
  input: IngestEvidenceExportRequest<TEvidence>,
): Record<string, unknown> {
  return {
    evidence: deepJsonClone(input.evidence),
    ...(input.format === undefined ? {} : { format: input.format }),
    ...optionalObject("filters", buildFilters(input.filters)),
    ...(input.createdAt === undefined ? {} : { createdAt: input.createdAt }),
    ...(input.exportId === undefined ? {} : { exportId: input.exportId }),
  };
}

function buildIngestEvidencePackageBody<TEvidence extends object>(
  input: IngestEvidencePackageRequest<TEvidence>,
): Record<string, unknown> {
  return {
    evidence: deepJsonClone(input.evidence),
    ...optionalObject("filters", buildFilters(input.filters)),
    ...(input.createdAt === undefined ? {} : { createdAt: input.createdAt }),
    ...(input.exportId === undefined ? {} : { exportId: input.exportId }),
  };
}

function buildFilters(
  filters: IngestEvidenceFilters | undefined,
): Record<string, unknown> | undefined {
  if (filters === undefined) {
    return undefined;
  }

  return {
    ...(filters.sections === undefined ? {} : { sections: [...filters.sections] }),
    ...(filters.evidenceFileIds === undefined ? {} : { evidenceFileIds: [...filters.evidenceFileIds] }),
    ...(filters.sourceUris === undefined ? {} : { sourceUris: [...filters.sourceUris] }),
    ...(filters.citationKinds === undefined ? {} : { citationKinds: [...filters.citationKinds] }),
  };
}

function optionalObject(
  key: string,
  value: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (value === undefined || Object.keys(value).length === 0) {
    return {};
  }

  return { [key]: value };
}

function validateIngestEvidenceExportRequest(input: unknown): void {
  const issues = collectBaseRequestIssues(input);
  if (isRecord(input)) {
    if (input.format !== undefined) {
      requireOneOf(input, "format", "format", EXPORT_FORMATS, issues);
    }
    collectFiltersIssues(input.filters, "filters", issues);
    requireOptionalIsoTimestamp(input, "createdAt", "createdAt", issues);
    requireOptionalCleanString(input, "exportId", "exportId", issues);
  }
  throwRequestIssues("ingest evidence export request is invalid", issues);
}

function validateIngestEvidencePackageRequest(input: unknown): void {
  const issues = collectBaseRequestIssues(input);
  if (isRecord(input)) {
    collectFiltersIssues(input.filters, "filters", issues);
    requireOptionalIsoTimestamp(input, "createdAt", "createdAt", issues);
    requireOptionalCleanString(input, "exportId", "exportId", issues);
  }
  throwRequestIssues("ingest evidence package request is invalid", issues);
}

function collectBaseRequestIssues(input: unknown): ValidationIssue[] {
  if (!isRecord(input)) {
    return [{ path: "", message: "request must be an object" }];
  }

  const issues: ValidationIssue[] = [];
  if (!isRecord(input.evidence)) {
    issues.push({ path: "evidence", message: "evidence must be an object" });
  } else {
    collectJsonIssues(input.evidence, "evidence", issues);
  }
  return issues;
}

function parseIngestEvidenceExportResponse(
  value: unknown,
  expectedFormat: IngestEvidenceExportFormat,
): IngestEvidenceExportResponse {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw new ApiResponseValidationError([
      { path: "", message: "response must be an object" },
    ], value);
  }

  requireLiteralString(value, "kind", "kind", "ingest-evidence.export", issues);
  requirePositiveInteger(value, "version", "version", issues);
  requireLiteralString(value, "format", "format", expectedFormat, issues);
  requireLiteralString(value, "mediaType", "mediaType", "application/json", issues);
  requireString(value, "content", "content", issues);
  requireSha256Fingerprint(value, "fingerprint", "fingerprint", issues);
  requireNonEmptyString(value, "exportId", "exportId", issues);
  requireIsoTimestamp(value, "createdAt", "createdAt", issues);
  collectManifestIssues(value.manifest, "manifest", issues);
  throwResponseIssues(issues, value);

  return deepFreezeClone(value) as IngestEvidenceExportResponse;
}

function parseIngestEvidencePackageResponse(value: unknown): IngestEvidencePackageResponse {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw new ApiResponseValidationError([
      { path: "", message: "response must be an object" },
    ], value);
  }

  requireLiteralString(value, "kind", "kind", "ingest-evidence.package", issues);
  requirePositiveInteger(value, "version", "version", issues);
  collectManifestIssues(value.manifest, "manifest", issues);
  collectPackageFilesIssues(value.files, "files", issues);
  requireSha256Fingerprint(value, "fingerprint", "fingerprint", issues);
  throwResponseIssues(issues, value);

  return deepFreezeClone(value) as IngestEvidencePackageResponse;
}

function collectManifestIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "manifest must be an object" });
    return;
  }

  requireLiteralString(value, "kind", joinPath(path, "kind"), "ingest-evidence.manifest", issues);
  requirePositiveInteger(value, "version", joinPath(path, "version"), issues);
  requireNonEmptyString(value, "exportId", joinPath(path, "exportId"), issues);
  requireIsoTimestamp(value, "createdAt", joinPath(path, "createdAt"), issues);
  requireNullableNonEmptyString(value, "schemaVersion", joinPath(path, "schemaVersion"), issues);
  requireNullableNonEmptyString(value, "workspaceId", joinPath(path, "workspaceId"), issues);
  requireNullableNonEmptyString(value, "sessionId", joinPath(path, "sessionId"), issues);
  requireBoolean(value, "localOnly", joinPath(path, "localOnly"), issues);
  collectNormalizedFiltersIssues(value.filters, joinPath(path, "filters"), issues);
  collectSummaryIssues(value.evidenceSummary, joinPath(path, "evidenceSummary"), issues);
  collectSectionDescriptorsIssues(value.sections, joinPath(path, "sections"), issues);
  collectContentDescriptorIssues(value.content, joinPath(path, "content"), issues);
  requireSha256Fingerprint(value, "fingerprint", joinPath(path, "fingerprint"), issues);
}

function collectPackageFilesIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "files must be an array" });
    return;
  }
  if (value.length !== 2) {
    issues.push({ path, message: "files must include manifest.json and evidence.json" });
  }

  value.forEach((file, index) => {
    const filePath = `${path}.${index}`;
    if (!isRecord(file)) {
      issues.push({ path: filePath, message: "package file must be an object" });
      return;
    }
    requireOneOf(file, "path", joinPath(filePath, "path"), PACKAGE_FILE_PATHS, issues);
    collectContentDescriptorIssues(file, filePath, issues);
    requireString(file, "content", joinPath(filePath, "content"), issues);
  });
}

function collectSectionDescriptorsIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "sections must be an array" });
    return;
  }

  value.forEach((section, index) => {
    const sectionPath = `${path}.${index}`;
    if (!isRecord(section)) {
      issues.push({ path: sectionPath, message: "section descriptor must be an object" });
      return;
    }
    requireOneOf(section, "section", joinPath(sectionPath, "section"), SECTION_ORDER, issues);
    requireNonNegativeInteger(section, "itemCount", joinPath(sectionPath, "itemCount"), issues);
    collectContentDescriptorIssues(section, sectionPath, issues);
  });
}

function collectContentDescriptorIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "content descriptor must be an object" });
    return;
  }

  requireLiteralString(value, "mediaType", joinPath(path, "mediaType"), "application/json", issues);
  requireNonNegativeInteger(value, "bytes", joinPath(path, "bytes"), issues);
  requireSha256Fingerprint(value, "fingerprint", joinPath(path, "fingerprint"), issues);
}

function collectSummaryIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "evidence summary must be an object" });
    return;
  }

  for (const field of [
    "sourceCount",
    "evidenceFileCount",
    "citationCount",
    "quarantineDecisionCount",
    "apiRequestTraceCount",
    "clientSessionTraceCount",
  ]) {
    requireNonNegativeInteger(value, field, joinPath(path, field), issues);
  }
}

function collectFiltersIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    issues.push({ path, message: "filters must be an object" });
    return;
  }

  collectOptionalSectionArrayIssues(value, "sections", joinPath(path, "sections"), issues);
  collectOptionalStringArrayIssues(value, "evidenceFileIds", joinPath(path, "evidenceFileIds"), issues);
  collectOptionalStringArrayIssues(value, "sourceUris", joinPath(path, "sourceUris"), issues);
  collectOptionalStringArrayIssues(value, "citationKinds", joinPath(path, "citationKinds"), issues);
}

function collectNormalizedFiltersIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "filters must be an object" });
    return;
  }

  collectSectionArrayIssues(value.sections, joinPath(path, "sections"), issues);
  collectStringArrayIssues(value.evidenceFileIds, joinPath(path, "evidenceFileIds"), issues);
  collectStringArrayIssues(value.sourceUris, joinPath(path, "sourceUris"), issues);
  collectStringArrayIssues(value.citationKinds, joinPath(path, "citationKinds"), issues);
}

function collectOptionalSectionArrayIssues(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value[field] === undefined) {
    return;
  }
  collectSectionArrayIssues(value[field], path, issues);
}

function collectSectionArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "sections must be an array" });
    return;
  }

  value.forEach((item, index) => {
    if (typeof item !== "string" || !SECTION_SET.has(item)) {
      issues.push({ path: `${path}.${index}`, message: "section is unsupported" });
    }
  });
}

function collectOptionalStringArrayIssues(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value[field] === undefined) {
    return;
  }
  collectStringArrayIssues(value[field], path, issues);
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

function requireNullableNonEmptyString(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value[field] !== null) {
    requireNonEmptyString(value, field, path, issues);
  }
}

function requireOptionalCleanString(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  const fieldValue = value[field];
  if (fieldValue === undefined) {
    return;
  }
  if (
    typeof fieldValue !== "string" ||
    fieldValue.trim().length === 0 ||
    fieldValue.trim() !== fieldValue
  ) {
    issues.push({ path, message: `${field} must be a non-empty string without surrounding whitespace` });
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

function requireOptionalIsoTimestamp(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value[field] !== undefined) {
    requireIsoTimestamp(value, field, path, issues);
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

function requireSha256Fingerprint(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (typeof value[field] !== "string" || !SHA256_FINGERPRINT_PATTERN.test(value[field] as string)) {
    issues.push({ path, message: `${field} must be a SHA-256 fingerprint` });
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
