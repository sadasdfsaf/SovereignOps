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

export type PluginReviewArtifactClientOptions = SovereignOpsClientOptions;

export type PluginReviewArtifactSchemaVersion = "plugin-review-artifact/v1";
export type PluginReviewArtifactDecision = "approved" | "approval_required" | "denied";
export type PluginReviewApprovalGateState = "approved" | "denied" | "pending";
export type PluginReviewCapabilityEvidenceDecision = "granted" | "missing" | "not_requested";
export type PluginReviewHostApiEvidenceDecision = "blocked" | "denied";
export type PluginSandboxFailureCategory =
  | "async"
  | "audit"
  | "capability"
  | "host_api"
  | "invalid"
  | "plugin"
  | "resource"
  | "success";

export interface PluginManifestCapabilityInput {
  readonly id: string;
  readonly permission: string;
  readonly description: string;
}

export interface PluginManifestToolInput {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly capability?: string;
  readonly inputSchema?: JsonObject;
}

export interface PluginManifestResourceInput {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly uri: string;
  readonly capability?: string;
}

export interface PluginManifestPromptArgumentInput {
  readonly id: string;
  readonly description: string;
  readonly required?: boolean;
}

export interface PluginManifestPromptInput {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly capability?: string;
  readonly arguments?: readonly PluginManifestPromptArgumentInput[];
}

export interface PluginReviewManifestInput {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly entrypoint: string;
  readonly permissions?: readonly string[];
  readonly capabilities?: readonly PluginManifestCapabilityInput[];
  readonly tools?: readonly PluginManifestToolInput[];
  readonly resources?: readonly PluginManifestResourceInput[];
  readonly prompts?: readonly PluginManifestPromptInput[];
  readonly minimumHostVersion: string;
}

export interface PluginSandboxBoundaryInput {
  readonly capabilities?: readonly string[];
  readonly deniedHostApis?: readonly string[];
  readonly limits?: {
    readonly maxAuditEvents?: number;
    readonly maxTicks?: number;
  };
}

export interface PluginSandboxAuditEventInput {
  readonly sequence: number;
  readonly tick: number;
  readonly type: string;
  readonly detail: JsonObject;
}

export interface PluginSandboxSuccessResultInput<TValue extends JsonValue = JsonValue> {
  readonly ok: true;
  readonly value?: TValue;
  readonly audit: readonly PluginSandboxAuditEventInput[];
  readonly ticks: number;
}

export interface PluginSandboxFailureInput {
  readonly code: string;
  readonly message: string;
}

export interface PluginSandboxFailureResultInput {
  readonly ok: false;
  readonly error: PluginSandboxFailureInput;
  readonly audit: readonly PluginSandboxAuditEventInput[];
  readonly ticks: number;
}

export type PluginSandboxRunResultInput<TValue extends JsonValue = JsonValue> =
  | PluginSandboxSuccessResultInput<TValue>
  | PluginSandboxFailureResultInput;

export interface PluginSandboxReviewInput<TValue extends JsonValue = JsonValue> {
  readonly pluginId?: string;
  readonly runLabel?: string;
  readonly boundary: PluginSandboxBoundaryInput;
  readonly requiredCapabilities?: readonly string[];
  readonly result: PluginSandboxRunResultInput<TValue>;
}

export interface PluginReviewReferenceInput {
  readonly id: string;
  readonly kind: string;
  readonly label?: string;
  readonly uri?: string;
}

export interface PluginReviewApprovalGateInput {
  readonly id: string;
  readonly name: string;
  readonly required?: boolean;
  readonly state?: PluginReviewApprovalGateState;
  readonly reason?: string;
}

export interface PluginReviewEvidenceInput {
  readonly id: string;
  readonly kind: string;
  readonly summary?: string;
  readonly localOnly?: boolean;
  readonly path?: string;
  readonly content?: string;
  readonly metadata?: JsonObject;
}

export interface PluginReviewArtifactPreviewRequest<TValue extends JsonValue = JsonValue> {
  readonly manifest: PluginReviewManifestInput;
  readonly sandboxReview: PluginSandboxReviewInput<TValue>;
  readonly automationReferences?: readonly PluginReviewReferenceInput[];
  readonly auditReferences?: readonly PluginReviewReferenceInput[];
  readonly approvalGates?: readonly PluginReviewApprovalGateInput[];
  readonly evidence?: readonly PluginReviewEvidenceInput[];
}

export interface PluginReviewManifestComponentMetadata {
  readonly id: string;
  readonly name?: string;
  readonly capability?: string;
  readonly permission?: string;
}

export interface PluginReviewManifestMetadata {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly entrypoint: string;
  readonly minimumHostVersion: string;
  readonly permissions: readonly string[];
  readonly capabilities: readonly PluginReviewManifestComponentMetadata[];
  readonly tools: readonly PluginReviewManifestComponentMetadata[];
  readonly resources: readonly PluginReviewManifestComponentMetadata[];
  readonly prompts: readonly PluginReviewManifestComponentMetadata[];
}

export interface PluginSandboxCapabilityReview {
  readonly granted: readonly string[];
  readonly required: readonly string[];
  readonly observed: readonly string[];
  readonly missing: readonly string[];
}

export interface PluginSandboxHostApiReview {
  readonly denied: readonly string[];
  readonly deniedObserved: readonly string[];
}

export interface PluginSandboxLimitReview {
  readonly maxAuditEvents: number;
  readonly maxTicks: number;
  readonly ticksUsed: number;
  readonly ticksRemaining: number;
  readonly tickBudgetExhausted: boolean;
}

export interface PluginSandboxAuditTypeCount {
  readonly type: string;
  readonly count: number;
}

export interface PluginSandboxAuditReview {
  readonly total: number;
  readonly remaining: number;
  readonly overflow: boolean;
  readonly byType: readonly PluginSandboxAuditTypeCount[];
}

export interface PluginSandboxFailureReview {
  readonly code: string;
  readonly category: PluginSandboxFailureCategory;
}

export interface PluginSandboxReviewSummary {
  readonly reviewId: string;
  readonly fingerprint: string;
  readonly pluginId?: string;
  readonly runLabel?: string;
  readonly ok: boolean;
  readonly capabilities: PluginSandboxCapabilityReview;
  readonly hostApis: PluginSandboxHostApiReview;
  readonly limits: PluginSandboxLimitReview;
  readonly audit: PluginSandboxAuditReview;
  readonly failureCategories: readonly PluginSandboxFailureCategory[];
  readonly failure?: PluginSandboxFailureReview;
}

export interface PluginReviewCapabilityEvidence {
  readonly capability: string;
  readonly declared: boolean;
  readonly permission?: string;
  readonly required: boolean;
  readonly observed: boolean;
  readonly granted: boolean;
  readonly missing: boolean;
  readonly decision: PluginReviewCapabilityEvidenceDecision;
}

export interface PluginReviewHostApiEvidence {
  readonly api: string;
  readonly configuredDenied: boolean;
  readonly observedDenied: boolean;
  readonly decision: PluginReviewHostApiEvidenceDecision;
}

export interface PluginReviewReference {
  readonly id: string;
  readonly kind: string;
  readonly label?: string;
  readonly uri?: string;
}

export interface PluginReviewApprovalGate {
  readonly id: string;
  readonly name: string;
  readonly required: boolean;
  readonly state: PluginReviewApprovalGateState;
  readonly reason?: string;
}

export interface PluginReviewEvidence {
  readonly id: string;
  readonly kind: string;
  readonly summary?: string;
  readonly localOnly: boolean;
  readonly redacted: boolean;
  readonly fingerprint: string;
}

export interface PluginReviewArtifact {
  readonly schemaVersion: PluginReviewArtifactSchemaVersion;
  readonly reviewId: string;
  readonly fingerprint: string;
  readonly decision: PluginReviewArtifactDecision;
  readonly manifest: PluginReviewManifestMetadata;
  readonly sandboxReview: PluginSandboxReviewSummary;
  readonly capabilityEvidence: readonly PluginReviewCapabilityEvidence[];
  readonly hostApiEvidence: readonly PluginReviewHostApiEvidence[];
  readonly automationReferences: readonly PluginReviewReference[];
  readonly auditReferences: readonly PluginReviewReference[];
  readonly approvalGates: readonly PluginReviewApprovalGate[];
  readonly evidence: readonly PluginReviewEvidence[];
}

export interface PluginReviewArtifactPreviewResponse {
  readonly kind: "plugin-review-artifact.preview";
  readonly localOnly: true;
  readonly redacted: true;
  readonly schemaVersion: PluginReviewArtifactSchemaVersion;
  readonly reviewId: string;
  readonly fingerprint: string;
  readonly decision: PluginReviewArtifactDecision;
  readonly artifact: PluginReviewArtifact;
}

type Validator<T> = (value: unknown) => T;

const PREVIEW_ENDPOINT = "plugins/review-artifacts/preview";
const REVIEW_ARTIFACT_SCHEMA_VERSION = "plugin-review-artifact/v1" as const;
const FINGERPRINT_PATTERN = /^[a-f0-9]{32}$/;
const DECISIONS = ["approved", "approval_required", "denied"] as const;
const APPROVAL_GATE_STATES = ["approved", "denied", "pending"] as const;
const CAPABILITY_DECISIONS = ["granted", "missing", "not_requested"] as const;
const HOST_API_DECISIONS = ["blocked", "denied"] as const;
const FAILURE_CATEGORIES = [
  "async",
  "audit",
  "capability",
  "host_api",
  "invalid",
  "plugin",
  "resource",
  "success",
] as const;

export class PluginReviewArtifactClient {
  readonly #baseUrl: string;
  readonly #fetch: FetchLike;
  readonly #apiKey?: string;
  readonly #headers: Readonly<Record<string, string>>;

  constructor(options: PluginReviewArtifactClientOptions) {
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

  async preview<TValue extends JsonValue>(
    input: PluginReviewArtifactPreviewRequest<TValue>,
  ): Promise<PluginReviewArtifactPreviewResponse> {
    validatePluginReviewArtifactPreviewRequest(input);
    return this.#request(
      PREVIEW_ENDPOINT,
      {
        method: "POST",
        body: JSON.stringify(buildPluginReviewArtifactPreviewBody(input)),
      },
      parsePluginReviewArtifactPreviewResponse,
    );
  }

  async previewArtifact<TValue extends JsonValue>(
    input: PluginReviewArtifactPreviewRequest<TValue>,
  ): Promise<PluginReviewArtifactPreviewResponse> {
    return this.preview(input);
  }

  async previewReviewArtifact<TValue extends JsonValue>(
    input: PluginReviewArtifactPreviewRequest<TValue>,
  ): Promise<PluginReviewArtifactPreviewResponse> {
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

export function createPluginReviewArtifactClient(
  options: PluginReviewArtifactClientOptions,
): PluginReviewArtifactClient {
  return new PluginReviewArtifactClient(options);
}

function buildPluginReviewArtifactPreviewBody<TValue extends JsonValue>(
  input: PluginReviewArtifactPreviewRequest<TValue>,
): Record<string, unknown> {
  return {
    manifest: deepJsonClone(input.manifest),
    sandboxReview: deepJsonClone(input.sandboxReview),
    ...(input.automationReferences === undefined
      ? {}
      : { automationReferences: deepJsonClone(input.automationReferences) }),
    ...(input.auditReferences === undefined ? {} : { auditReferences: deepJsonClone(input.auditReferences) }),
    ...(input.approvalGates === undefined ? {} : { approvalGates: deepJsonClone(input.approvalGates) }),
    ...(input.evidence === undefined ? {} : { evidence: deepJsonClone(input.evidence) }),
  };
}

function validatePluginReviewArtifactPreviewRequest(input: unknown): void {
  if (!isRecord(input)) {
    throw new ApiRequestValidationError("plugin review artifact preview request is invalid", [
      { path: "", message: "request must be an object" },
    ]);
  }

  const issues: ValidationIssue[] = [];
  collectAllowedKeys(input, "", [
    "manifest",
    "sandboxReview",
    "automationReferences",
    "auditReferences",
    "approvalGates",
    "evidence",
  ], issues);
  collectManifestInputIssues(input.manifest, "manifest", issues);
  collectSandboxReviewInputIssues(input.sandboxReview, "sandboxReview", issues);
  collectOptionalReferenceArrayIssues(input.automationReferences, "automationReferences", issues);
  collectOptionalReferenceArrayIssues(input.auditReferences, "auditReferences", issues);
  collectOptionalApprovalGateArrayIssues(input.approvalGates, "approvalGates", issues);
  collectOptionalEvidenceArrayIssues(input.evidence, "evidence", issues);
  throwRequestIssues("plugin review artifact preview request is invalid", issues);
}

function parsePluginReviewArtifactPreviewResponse(
  value: unknown,
): PluginReviewArtifactPreviewResponse {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    throw new ApiResponseValidationError([
      { path: "", message: "response must be an object" },
    ], value);
  }

  requireLiteralString(value, "kind", "kind", "plugin-review-artifact.preview", issues);
  requireTrue(value, "localOnly", "localOnly", issues);
  requireTrue(value, "redacted", "redacted", issues);
  requireLiteralString(value, "schemaVersion", "schemaVersion", REVIEW_ARTIFACT_SCHEMA_VERSION, issues);
  requireNonEmptyString(value, "reviewId", "reviewId", issues);
  requireFingerprint(value, "fingerprint", "fingerprint", issues);
  requireOneOf(value, "decision", "decision", DECISIONS, issues);
  collectArtifactIssues(value.artifact, "artifact", issues);
  throwResponseIssues(issues, value);

  return deepFreezeClone(value) as PluginReviewArtifactPreviewResponse;
}

function collectManifestInputIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "manifest must be an object" });
    return;
  }

  collectAllowedKeys(value, path, [
    "id",
    "name",
    "version",
    "description",
    "entrypoint",
    "permissions",
    "capabilities",
    "tools",
    "resources",
    "prompts",
    "minimumHostVersion",
  ], issues);
  collectJsonIssues(value, path, issues);
  for (const field of ["id", "name", "version", "description", "entrypoint", "minimumHostVersion"]) {
    requireNonEmptyString(value, field, joinPath(path, field), issues);
  }
  collectOptionalStringArrayIssues(value.permissions, joinPath(path, "permissions"), issues);
  collectOptionalManifestCapabilityArrayIssues(value.capabilities, joinPath(path, "capabilities"), issues);
  collectOptionalManifestComponentArrayIssues(
    value.tools,
    joinPath(path, "tools"),
    ["id", "name", "description", "capability", "inputSchema"],
    issues,
  );
  collectOptionalManifestComponentArrayIssues(
    value.resources,
    joinPath(path, "resources"),
    ["id", "name", "description", "uri", "capability"],
    issues,
  );
  collectOptionalManifestPromptArrayIssues(value.prompts, joinPath(path, "prompts"), issues);
}

function collectOptionalManifestCapabilityArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    issues.push({ path, message: "capabilities must be an array" });
    return;
  }
  value.forEach((capability, index) => {
    const capabilityPath = `${path}.${index}`;
    if (!isRecord(capability)) {
      issues.push({ path: capabilityPath, message: "capability must be an object" });
      return;
    }
    collectAllowedKeys(capability, capabilityPath, ["id", "permission", "description"], issues);
    requireNonEmptyString(capability, "id", joinPath(capabilityPath, "id"), issues);
    requireNonEmptyString(capability, "permission", joinPath(capabilityPath, "permission"), issues);
    requireNonEmptyString(capability, "description", joinPath(capabilityPath, "description"), issues);
  });
}

function collectOptionalManifestComponentArrayIssues(
  value: unknown,
  path: string,
  allowedKeys: readonly string[],
  issues: ValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    issues.push({ path, message: "components must be an array" });
    return;
  }
  value.forEach((component, index) => {
    const componentPath = `${path}.${index}`;
    if (!isRecord(component)) {
      issues.push({ path: componentPath, message: "component must be an object" });
      return;
    }
    collectAllowedKeys(component, componentPath, allowedKeys, issues);
    for (const field of ["id", "name", "description"]) {
      requireNonEmptyString(component, field, joinPath(componentPath, field), issues);
    }
    requireOptionalNonEmptyString(component, "capability", joinPath(componentPath, "capability"), issues);
    requireOptionalNonEmptyString(component, "uri", joinPath(componentPath, "uri"), issues);
    if (component.inputSchema !== undefined && !isRecord(component.inputSchema)) {
      issues.push({ path: joinPath(componentPath, "inputSchema"), message: "inputSchema must be an object" });
    }
  });
}

function collectOptionalManifestPromptArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }
  collectOptionalManifestComponentArrayIssues(
    value,
    path,
    ["id", "name", "description", "capability", "arguments"],
    issues,
  );
  if (!Array.isArray(value)) {
    return;
  }
  value.forEach((prompt, index) => {
    if (isRecord(prompt) && prompt.arguments !== undefined) {
      collectPromptArgumentArrayIssues(prompt.arguments, `${path}.${index}.arguments`, issues);
    }
  });
}

function collectPromptArgumentArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "arguments must be an array" });
    return;
  }
  value.forEach((argument, index) => {
    const argumentPath = `${path}.${index}`;
    if (!isRecord(argument)) {
      issues.push({ path: argumentPath, message: "argument must be an object" });
      return;
    }
    collectAllowedKeys(argument, argumentPath, ["id", "description", "required"], issues);
    requireNonEmptyString(argument, "id", joinPath(argumentPath, "id"), issues);
    requireNonEmptyString(argument, "description", joinPath(argumentPath, "description"), issues);
    if (argument.required !== undefined) {
      requireBoolean(argument, "required", joinPath(argumentPath, "required"), issues);
    }
  });
}

function collectSandboxReviewInputIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "sandboxReview must be an object" });
    return;
  }
  collectAllowedKeys(value, path, ["pluginId", "runLabel", "boundary", "requiredCapabilities", "result"], issues);
  requireOptionalNonEmptyString(value, "pluginId", joinPath(path, "pluginId"), issues);
  requireOptionalNonEmptyString(value, "runLabel", joinPath(path, "runLabel"), issues);
  collectSandboxBoundaryIssues(value.boundary, joinPath(path, "boundary"), issues);
  collectOptionalStringArrayIssues(value.requiredCapabilities, joinPath(path, "requiredCapabilities"), issues);
  collectSandboxResultIssues(value.result, joinPath(path, "result"), issues);
}

function collectSandboxBoundaryIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "boundary must be an object" });
    return;
  }
  collectAllowedKeys(value, path, ["capabilities", "deniedHostApis", "limits"], issues);
  collectOptionalStringArrayIssues(value.capabilities, joinPath(path, "capabilities"), issues);
  collectOptionalStringArrayIssues(value.deniedHostApis, joinPath(path, "deniedHostApis"), issues);
  if (value.limits !== undefined) {
    if (!isRecord(value.limits)) {
      issues.push({ path: joinPath(path, "limits"), message: "limits must be an object" });
    } else {
      collectAllowedKeys(value.limits, joinPath(path, "limits"), ["maxAuditEvents", "maxTicks"], issues);
      requireOptionalPositiveInteger(value.limits, "maxAuditEvents", joinPath(path, "limits.maxAuditEvents"), issues);
      requireOptionalPositiveInteger(value.limits, "maxTicks", joinPath(path, "limits.maxTicks"), issues);
    }
  }
}

function collectSandboxResultIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "result must be an object" });
    return;
  }
  collectAllowedKeys(value, path, ["ok", "value", "error", "audit", "ticks"], issues);
  requireBoolean(value, "ok", joinPath(path, "ok"), issues);
  collectSandboxAuditEventArrayIssues(value.audit, joinPath(path, "audit"), issues);
  requireNonNegativeInteger(value, "ticks", joinPath(path, "ticks"), issues);

  if (value.ok === true) {
    if (value.error !== undefined) {
      issues.push({ path: joinPath(path, "error"), message: "successful results must not include error" });
    }
    if (value.value !== undefined) {
      collectJsonIssues(value.value, joinPath(path, "value"), issues);
    }
    return;
  }

  if (value.ok === false) {
    if (value.value !== undefined) {
      issues.push({ path: joinPath(path, "value"), message: "failed results must not include value" });
    }
    collectSandboxFailureIssues(value.error, joinPath(path, "error"), issues);
  }
}

function collectSandboxFailureIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "error must be an object" });
    return;
  }
  collectAllowedKeys(value, path, ["code", "message"], issues);
  requireNonEmptyString(value, "code", joinPath(path, "code"), issues);
  requireNonEmptyString(value, "message", joinPath(path, "message"), issues);
}

function collectSandboxAuditEventArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "audit must be an array" });
    return;
  }
  value.forEach((event, index) => {
    const eventPath = `${path}.${index}`;
    if (!isRecord(event)) {
      issues.push({ path: eventPath, message: "audit event must be an object" });
      return;
    }
    collectAllowedKeys(event, eventPath, ["sequence", "tick", "type", "detail"], issues);
    requirePositiveInteger(event, "sequence", joinPath(eventPath, "sequence"), issues);
    requireNonNegativeInteger(event, "tick", joinPath(eventPath, "tick"), issues);
    requireNonEmptyString(event, "type", joinPath(eventPath, "type"), issues);
    if (!isRecord(event.detail)) {
      issues.push({ path: joinPath(eventPath, "detail"), message: "detail must be an object" });
    } else {
      collectJsonIssues(event.detail, joinPath(eventPath, "detail"), issues);
    }
  });
}

function collectOptionalReferenceArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    issues.push({ path, message: "references must be an array" });
    return;
  }
  value.forEach((reference, index) => {
    const referencePath = `${path}.${index}`;
    if (!isRecord(reference)) {
      issues.push({ path: referencePath, message: "reference must be an object" });
      return;
    }
    collectAllowedKeys(reference, referencePath, ["id", "kind", "label", "uri"], issues);
    requireNonEmptyString(reference, "id", joinPath(referencePath, "id"), issues);
    requireNonEmptyString(reference, "kind", joinPath(referencePath, "kind"), issues);
    requireOptionalNonEmptyString(reference, "label", joinPath(referencePath, "label"), issues);
    requireOptionalNonEmptyString(reference, "uri", joinPath(referencePath, "uri"), issues);
  });
}

function collectOptionalApprovalGateArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    issues.push({ path, message: "approvalGates must be an array" });
    return;
  }
  value.forEach((gate, index) => {
    const gatePath = `${path}.${index}`;
    if (!isRecord(gate)) {
      issues.push({ path: gatePath, message: "approval gate must be an object" });
      return;
    }
    collectAllowedKeys(gate, gatePath, ["id", "name", "required", "state", "reason"], issues);
    requireNonEmptyString(gate, "id", joinPath(gatePath, "id"), issues);
    requireNonEmptyString(gate, "name", joinPath(gatePath, "name"), issues);
    if (gate.required !== undefined) {
      requireBoolean(gate, "required", joinPath(gatePath, "required"), issues);
    }
    if (gate.state !== undefined) {
      requireOneOf(gate, "state", joinPath(gatePath, "state"), APPROVAL_GATE_STATES, issues);
    }
    requireOptionalNonEmptyString(gate, "reason", joinPath(gatePath, "reason"), issues);
  });
}

function collectOptionalEvidenceArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    issues.push({ path, message: "evidence must be an array" });
    return;
  }
  value.forEach((item, index) => {
    const itemPath = `${path}.${index}`;
    if (!isRecord(item)) {
      issues.push({ path: itemPath, message: "evidence must be an object" });
      return;
    }
    collectAllowedKeys(item, itemPath, ["id", "kind", "summary", "localOnly", "path", "content", "metadata"], issues);
    requireNonEmptyString(item, "id", joinPath(itemPath, "id"), issues);
    requireNonEmptyString(item, "kind", joinPath(itemPath, "kind"), issues);
    requireOptionalNonEmptyString(item, "summary", joinPath(itemPath, "summary"), issues);
    if (item.localOnly !== undefined) {
      requireBoolean(item, "localOnly", joinPath(itemPath, "localOnly"), issues);
    }
    requireOptionalNonEmptyString(item, "path", joinPath(itemPath, "path"), issues);
    requireOptionalString(item, "content", joinPath(itemPath, "content"), issues);
    if (item.metadata !== undefined) {
      if (!isRecord(item.metadata)) {
        issues.push({ path: joinPath(itemPath, "metadata"), message: "metadata must be an object" });
      } else {
        collectJsonIssues(item.metadata, joinPath(itemPath, "metadata"), issues);
      }
    }
  });
}

function collectArtifactIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "artifact must be an object" });
    return;
  }
  requireLiteralString(value, "schemaVersion", joinPath(path, "schemaVersion"), REVIEW_ARTIFACT_SCHEMA_VERSION, issues);
  requireNonEmptyString(value, "reviewId", joinPath(path, "reviewId"), issues);
  requireFingerprint(value, "fingerprint", joinPath(path, "fingerprint"), issues);
  requireOneOf(value, "decision", joinPath(path, "decision"), DECISIONS, issues);
  collectManifestMetadataIssues(value.manifest, joinPath(path, "manifest"), issues);
  collectSandboxReviewSummaryIssues(value.sandboxReview, joinPath(path, "sandboxReview"), issues);
  collectCapabilityEvidenceArrayIssues(value.capabilityEvidence, joinPath(path, "capabilityEvidence"), issues);
  collectHostApiEvidenceArrayIssues(value.hostApiEvidence, joinPath(path, "hostApiEvidence"), issues);
  collectReferenceArrayIssues(value.automationReferences, joinPath(path, "automationReferences"), issues);
  collectReferenceArrayIssues(value.auditReferences, joinPath(path, "auditReferences"), issues);
  collectApprovalGateArrayIssues(value.approvalGates, joinPath(path, "approvalGates"), issues);
  collectEvidenceArrayIssues(value.evidence, joinPath(path, "evidence"), issues);
}

function collectManifestMetadataIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "manifest must be an object" });
    return;
  }
  for (const field of ["id", "name", "version", "description", "entrypoint", "minimumHostVersion"]) {
    requireNonEmptyString(value, field, joinPath(path, field), issues);
  }
  collectStringArrayIssues(value.permissions, joinPath(path, "permissions"), issues);
  collectManifestMetadataComponentArrayIssues(value.capabilities, joinPath(path, "capabilities"), issues);
  collectManifestMetadataComponentArrayIssues(value.tools, joinPath(path, "tools"), issues);
  collectManifestMetadataComponentArrayIssues(value.resources, joinPath(path, "resources"), issues);
  collectManifestMetadataComponentArrayIssues(value.prompts, joinPath(path, "prompts"), issues);
}

function collectManifestMetadataComponentArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "components must be an array" });
    return;
  }
  value.forEach((component, index) => {
    const componentPath = `${path}.${index}`;
    if (!isRecord(component)) {
      issues.push({ path: componentPath, message: "component must be an object" });
      return;
    }
    requireNonEmptyString(component, "id", joinPath(componentPath, "id"), issues);
    requireOptionalNonEmptyString(component, "name", joinPath(componentPath, "name"), issues);
    requireOptionalNonEmptyString(component, "capability", joinPath(componentPath, "capability"), issues);
    requireOptionalNonEmptyString(component, "permission", joinPath(componentPath, "permission"), issues);
  });
}

function collectSandboxReviewSummaryIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "sandboxReview must be an object" });
    return;
  }
  requireNonEmptyString(value, "reviewId", joinPath(path, "reviewId"), issues);
  requireFingerprint(value, "fingerprint", joinPath(path, "fingerprint"), issues);
  requireOptionalNonEmptyString(value, "pluginId", joinPath(path, "pluginId"), issues);
  requireOptionalNonEmptyString(value, "runLabel", joinPath(path, "runLabel"), issues);
  requireBoolean(value, "ok", joinPath(path, "ok"), issues);
  collectCapabilityReviewIssues(value.capabilities, joinPath(path, "capabilities"), issues);
  collectHostApiReviewIssues(value.hostApis, joinPath(path, "hostApis"), issues);
  collectLimitReviewIssues(value.limits, joinPath(path, "limits"), issues);
  collectAuditReviewIssues(value.audit, joinPath(path, "audit"), issues);
  collectOneOfArrayIssues(value.failureCategories, joinPath(path, "failureCategories"), FAILURE_CATEGORIES, issues);
  if (value.failure !== undefined) {
    collectFailureReviewIssues(value.failure, joinPath(path, "failure"), issues);
  }
}

function collectCapabilityReviewIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "capabilities must be an object" });
    return;
  }
  collectStringArrayIssues(value.granted, joinPath(path, "granted"), issues);
  collectStringArrayIssues(value.required, joinPath(path, "required"), issues);
  collectStringArrayIssues(value.observed, joinPath(path, "observed"), issues);
  collectStringArrayIssues(value.missing, joinPath(path, "missing"), issues);
}

function collectHostApiReviewIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "hostApis must be an object" });
    return;
  }
  collectStringArrayIssues(value.denied, joinPath(path, "denied"), issues);
  collectStringArrayIssues(value.deniedObserved, joinPath(path, "deniedObserved"), issues);
}

function collectLimitReviewIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "limits must be an object" });
    return;
  }
  requireNonNegativeInteger(value, "maxAuditEvents", joinPath(path, "maxAuditEvents"), issues);
  requireNonNegativeInteger(value, "maxTicks", joinPath(path, "maxTicks"), issues);
  requireNonNegativeInteger(value, "ticksUsed", joinPath(path, "ticksUsed"), issues);
  requireNonNegativeInteger(value, "ticksRemaining", joinPath(path, "ticksRemaining"), issues);
  requireBoolean(value, "tickBudgetExhausted", joinPath(path, "tickBudgetExhausted"), issues);
}

function collectAuditReviewIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "audit must be an object" });
    return;
  }
  requireNonNegativeInteger(value, "total", joinPath(path, "total"), issues);
  requireNonNegativeInteger(value, "remaining", joinPath(path, "remaining"), issues);
  requireBoolean(value, "overflow", joinPath(path, "overflow"), issues);
  collectAuditTypeCountArrayIssues(value.byType, joinPath(path, "byType"), issues);
}

function collectAuditTypeCountArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "byType must be an array" });
    return;
  }
  value.forEach((count, index) => {
    const countPath = `${path}.${index}`;
    if (!isRecord(count)) {
      issues.push({ path: countPath, message: "audit type count must be an object" });
      return;
    }
    requireNonEmptyString(count, "type", joinPath(countPath, "type"), issues);
    requireNonNegativeInteger(count, "count", joinPath(countPath, "count"), issues);
  });
}

function collectFailureReviewIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "failure must be an object" });
    return;
  }
  requireNonEmptyString(value, "code", joinPath(path, "code"), issues);
  requireOneOf(value, "category", joinPath(path, "category"), FAILURE_CATEGORIES, issues);
}

function collectCapabilityEvidenceArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "capabilityEvidence must be an array" });
    return;
  }
  value.forEach((item, index) => {
    const itemPath = `${path}.${index}`;
    if (!isRecord(item)) {
      issues.push({ path: itemPath, message: "capability evidence must be an object" });
      return;
    }
    requireNonEmptyString(item, "capability", joinPath(itemPath, "capability"), issues);
    requireBoolean(item, "declared", joinPath(itemPath, "declared"), issues);
    requireOptionalNonEmptyString(item, "permission", joinPath(itemPath, "permission"), issues);
    requireBoolean(item, "required", joinPath(itemPath, "required"), issues);
    requireBoolean(item, "observed", joinPath(itemPath, "observed"), issues);
    requireBoolean(item, "granted", joinPath(itemPath, "granted"), issues);
    requireBoolean(item, "missing", joinPath(itemPath, "missing"), issues);
    requireOneOf(item, "decision", joinPath(itemPath, "decision"), CAPABILITY_DECISIONS, issues);
  });
}

function collectHostApiEvidenceArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "hostApiEvidence must be an array" });
    return;
  }
  value.forEach((item, index) => {
    const itemPath = `${path}.${index}`;
    if (!isRecord(item)) {
      issues.push({ path: itemPath, message: "host API evidence must be an object" });
      return;
    }
    requireNonEmptyString(item, "api", joinPath(itemPath, "api"), issues);
    requireBoolean(item, "configuredDenied", joinPath(itemPath, "configuredDenied"), issues);
    requireBoolean(item, "observedDenied", joinPath(itemPath, "observedDenied"), issues);
    requireOneOf(item, "decision", joinPath(itemPath, "decision"), HOST_API_DECISIONS, issues);
  });
}

function collectReferenceArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "references must be an array" });
    return;
  }
  value.forEach((reference, index) => {
    const referencePath = `${path}.${index}`;
    if (!isRecord(reference)) {
      issues.push({ path: referencePath, message: "reference must be an object" });
      return;
    }
    requireNonEmptyString(reference, "id", joinPath(referencePath, "id"), issues);
    requireNonEmptyString(reference, "kind", joinPath(referencePath, "kind"), issues);
    requireOptionalNonEmptyString(reference, "label", joinPath(referencePath, "label"), issues);
    requireOptionalNonEmptyString(reference, "uri", joinPath(referencePath, "uri"), issues);
  });
}

function collectApprovalGateArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "approvalGates must be an array" });
    return;
  }
  value.forEach((gate, index) => {
    const gatePath = `${path}.${index}`;
    if (!isRecord(gate)) {
      issues.push({ path: gatePath, message: "approval gate must be an object" });
      return;
    }
    requireNonEmptyString(gate, "id", joinPath(gatePath, "id"), issues);
    requireNonEmptyString(gate, "name", joinPath(gatePath, "name"), issues);
    requireBoolean(gate, "required", joinPath(gatePath, "required"), issues);
    requireOneOf(gate, "state", joinPath(gatePath, "state"), APPROVAL_GATE_STATES, issues);
    requireOptionalNonEmptyString(gate, "reason", joinPath(gatePath, "reason"), issues);
  });
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
    const itemPath = `${path}.${index}`;
    if (!isRecord(item)) {
      issues.push({ path: itemPath, message: "evidence must be an object" });
      return;
    }
    requireNonEmptyString(item, "id", joinPath(itemPath, "id"), issues);
    requireNonEmptyString(item, "kind", joinPath(itemPath, "kind"), issues);
    requireOptionalNonEmptyString(item, "summary", joinPath(itemPath, "summary"), issues);
    requireBoolean(item, "localOnly", joinPath(itemPath, "localOnly"), issues);
    requireBoolean(item, "redacted", joinPath(itemPath, "redacted"), issues);
    requireFingerprint(item, "fingerprint", joinPath(itemPath, "fingerprint"), issues);
  });
}

function collectAllowedKeys(
  value: Record<string, unknown>,
  path: string,
  allowedKeys: readonly string[],
  issues: ValidationIssue[],
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      issues.push({ path: joinPath(path, key), message: `${key} is not allowed` });
    }
  }
}

function collectOptionalStringArrayIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value !== undefined) {
    collectStringArrayIssues(value, path, issues);
  }
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

function collectOneOfArrayIssues<T extends string>(
  value: unknown,
  path: string,
  allowed: readonly T[],
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "value must be an array" });
    return;
  }
  value.forEach((item, index) => {
    if (typeof item !== "string" || !allowed.includes(item as T)) {
      issues.push({ path: `${path}.${index}`, message: `value must be one of ${allowed.join(", ")}` });
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

function requireOptionalPositiveInteger(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value[field] !== undefined) {
    requirePositiveInteger(value, field, path, issues);
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

function requireFingerprint(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (typeof value[field] !== "string" || !FINGERPRINT_PATTERN.test(value[field] as string)) {
    issues.push({ path, message: `${field} must be a 32-character lowercase hex fingerprint` });
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
