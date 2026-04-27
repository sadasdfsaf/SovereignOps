import {
  normalizePluginManifest,
  type JsonObject,
  type JsonValue,
  type NormalizedPluginCapability,
  type NormalizedPluginManifest,
  type PluginManifest,
  type PluginPermission,
} from "./manifest.ts";
import {
  summarizePluginSandboxRun,
  type PluginSandboxReviewInput,
  type PluginSandboxReviewSummary,
} from "./sandboxReview.ts";

export type PluginReviewArtifactSchemaVersion = "plugin-review-artifact/v1";
export type PluginReviewArtifactDecision = "approved" | "approval_required" | "denied";
export type PluginReviewApprovalGateState = "approved" | "denied" | "pending";
export type PluginReviewCapabilityEvidenceDecision = "granted" | "missing" | "not_requested";
export type PluginReviewHostApiEvidenceDecision = "blocked" | "denied";

export interface PluginReviewArtifactInput<TValue = unknown> {
  readonly manifest: PluginManifest;
  readonly sandboxReview: PluginSandboxReviewInput<TValue>;
  readonly automationReferences?: readonly PluginReviewReferenceInput[];
  readonly auditReferences?: readonly PluginReviewReferenceInput[];
  readonly approvalGates?: readonly PluginReviewApprovalGateInput[];
  readonly evidence?: readonly PluginReviewEvidenceInput[];
}

export interface PluginReviewManifestMetadata {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly entrypoint: string;
  readonly minimumHostVersion: string;
  readonly permissions: readonly PluginPermission[];
  readonly capabilities: readonly PluginReviewManifestComponentMetadata[];
  readonly tools: readonly PluginReviewManifestComponentMetadata[];
  readonly resources: readonly PluginReviewManifestComponentMetadata[];
  readonly prompts: readonly PluginReviewManifestComponentMetadata[];
}

export interface PluginReviewManifestComponentMetadata {
  readonly id: string;
  readonly name?: string;
  readonly capability?: string;
  readonly permission?: PluginPermission;
}

export interface PluginReviewReferenceInput {
  readonly id: string;
  readonly kind: string;
  readonly label?: string;
  readonly uri?: string;
}

export interface PluginReviewReference {
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

export interface PluginReviewApprovalGate {
  readonly id: string;
  readonly name: string;
  readonly required: boolean;
  readonly state: PluginReviewApprovalGateState;
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

export interface PluginReviewEvidence {
  readonly id: string;
  readonly kind: string;
  readonly summary?: string;
  readonly localOnly: boolean;
  readonly redacted: boolean;
  readonly fingerprint: string;
}

export interface PluginReviewCapabilityEvidence {
  readonly capability: string;
  readonly declared: boolean;
  readonly permission?: PluginPermission;
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

export function createPluginReviewArtifact<TValue>(
  input: PluginReviewArtifactInput<TValue>,
): PluginReviewArtifact {
  const manifest = normalizePluginManifest(input.manifest);
  const sandboxReview = summarizePluginSandboxRun({
    ...input.sandboxReview,
    pluginId: input.sandboxReview.pluginId ?? manifest.id,
  });
  const manifestMetadata = summarizeManifestMetadata(manifest);
  const capabilityEvidence = summarizeCapabilityEvidence(manifest, sandboxReview);
  const hostApiEvidence = summarizeHostApiEvidence(sandboxReview);
  const automationReferences = normalizeReferences(
    input.automationReferences ?? [],
    "automationReferences",
  );
  const auditReferences = normalizeReferences(input.auditReferences ?? [], "auditReferences");
  const approvalGates = normalizeApprovalGates(input.approvalGates ?? []);
  const evidence = normalizeEvidence(input.evidence ?? []);
  const decision = decideReviewArtifact({
    sandboxReview,
    approvalGates,
  });

  const basis = deepFreeze({
    schemaVersion: "plugin-review-artifact/v1" as const,
    decision,
    manifest: manifestMetadata,
    sandboxReview,
    capabilityEvidence,
    hostApiEvidence,
    automationReferences,
    auditReferences,
    approvalGates,
    evidence,
  });
  const fingerprint = fingerprintValue("plugin-review-artifact", basis);

  return deepFreeze({
    reviewId: `plugin-review-${manifest.id}-${fingerprint.slice(0, 16)}`,
    fingerprint,
    ...basis,
  });
}

function summarizeManifestMetadata(manifest: NormalizedPluginManifest): PluginReviewManifestMetadata {
  return deepFreeze({
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    entrypoint: manifest.entrypoint,
    minimumHostVersion: manifest.minimumHostVersion,
    permissions: [...manifest.permissions],
    capabilities: manifest.capabilities.map((capability) => deepFreeze({
      id: capability.id,
      permission: capability.permission,
    })),
    tools: manifest.tools.map((tool) => optionalFields({
      id: tool.id,
      name: tool.name,
      capability: tool.capability,
    })),
    resources: manifest.resources.map((resource) => optionalFields({
      id: resource.id,
      name: resource.name,
      capability: resource.capability,
    })),
    prompts: manifest.prompts.map((prompt) => optionalFields({
      id: prompt.id,
      name: prompt.name,
      capability: prompt.capability,
    })),
  });
}

function summarizeCapabilityEvidence(
  manifest: NormalizedPluginManifest,
  sandboxReview: PluginSandboxReviewSummary,
): readonly PluginReviewCapabilityEvidence[] {
  const manifestCapabilities = new Map<string, NormalizedPluginCapability>(
    manifest.capabilities.map((capability) => [capability.id, capability]),
  );
  const capabilities = normalizeStringSet([
    ...manifest.capabilities.map((capability) => capability.id),
    ...sandboxReview.capabilities.required,
    ...sandboxReview.capabilities.observed,
    ...sandboxReview.capabilities.granted,
    ...sandboxReview.capabilities.missing,
  ]);

  return deepFreeze(capabilities.map((capability) => {
    const declaredCapability = manifestCapabilities.get(capability);
    const granted = sandboxReview.capabilities.granted.includes(capability);
    const missing = sandboxReview.capabilities.missing.includes(capability);
    const required = sandboxReview.capabilities.required.includes(capability);
    const observed = sandboxReview.capabilities.observed.includes(capability);

    return optionalFields({
      capability,
      declared: declaredCapability !== undefined,
      permission: declaredCapability?.permission,
      required,
      observed,
      granted,
      missing,
      decision: missing ? "missing" as const : granted ? "granted" as const : "not_requested" as const,
    });
  }));
}

function summarizeHostApiEvidence(
  sandboxReview: PluginSandboxReviewSummary,
): readonly PluginReviewHostApiEvidence[] {
  const apis = normalizeStringSet([
    ...sandboxReview.hostApis.denied,
    ...sandboxReview.hostApis.deniedObserved,
  ]);

  return deepFreeze(apis.map((api) => {
    const observedDenied = sandboxReview.hostApis.deniedObserved.includes(api);

    return {
      api,
      configuredDenied: sandboxReview.hostApis.denied.includes(api),
      observedDenied,
      decision: observedDenied ? "denied" : "blocked",
    };
  }));
}

function normalizeReferences(
  references: readonly PluginReviewReferenceInput[],
  label: string,
): readonly PluginReviewReference[] {
  const seen = new Set<string>();

  return deepFreeze(references.map((reference, index) => {
    const id = normalizeRequiredString(reference.id, `${label}[${index}].id`);
    if (seen.has(id)) {
      throw new TypeError(`${label}[${index}].id duplicates reference id ${id}.`);
    }
    seen.add(id);

    return optionalFields({
      id,
      kind: normalizeRequiredString(reference.kind, `${label}[${index}].kind`),
      label: normalizeOptionalString(reference.label, `${label}[${index}].label`),
      uri: normalizeOptionalString(reference.uri, `${label}[${index}].uri`),
    });
  }).sort(compareReference));
}

function normalizeApprovalGates(
  gates: readonly PluginReviewApprovalGateInput[],
): readonly PluginReviewApprovalGate[] {
  const seen = new Set<string>();

  return deepFreeze(gates.map((gate, index) => {
    const id = normalizeRequiredString(gate.id, `approvalGates[${index}].id`);
    if (seen.has(id)) {
      throw new TypeError(`approvalGates[${index}].id duplicates approval gate id ${id}.`);
    }
    seen.add(id);

    const required = gate.required ?? true;
    const state = normalizeApprovalGateState(
      gate.state ?? (required ? "pending" : "approved"),
      `approvalGates[${index}].state`,
    );

    return optionalFields({
      id,
      name: normalizeRequiredString(gate.name, `approvalGates[${index}].name`),
      required,
      state,
      reason: normalizeOptionalString(gate.reason, `approvalGates[${index}].reason`),
    });
  }).sort(compareById));
}

function normalizeEvidence(
  evidence: readonly PluginReviewEvidenceInput[],
): readonly PluginReviewEvidence[] {
  const seen = new Set<string>();

  return deepFreeze(evidence.map((item, index) => {
    const id = normalizeRequiredString(item.id, `evidence[${index}].id`);
    if (seen.has(id)) {
      throw new TypeError(`evidence[${index}].id duplicates evidence id ${id}.`);
    }
    seen.add(id);

    const localOnly = item.localOnly ?? true;
    const basis = optionalFields({
      id,
      kind: normalizeRequiredString(item.kind, `evidence[${index}].kind`),
      summary: normalizeOptionalString(item.summary, `evidence[${index}].summary`),
      localOnly,
      path: normalizeOptionalString(item.path, `evidence[${index}].path`),
      content: normalizeOptionalString(item.content, `evidence[${index}].content`),
      metadata: item.metadata === undefined
        ? undefined
        : normalizeJsonObject(item.metadata, `evidence[${index}].metadata`),
    });

    return optionalFields({
      id: basis.id,
      kind: basis.kind,
      summary: basis.summary === undefined
        ? undefined
        : localOnly
          ? redactLocalText(basis.summary)
          : basis.summary,
      localOnly,
      redacted: localOnly,
      fingerprint: fingerprintValue("plugin-review-evidence", basis),
    });
  }).sort(compareById));
}

function decideReviewArtifact(input: {
  readonly sandboxReview: PluginSandboxReviewSummary;
  readonly approvalGates: readonly PluginReviewApprovalGate[];
}): PluginReviewArtifactDecision {
  if (
    !input.sandboxReview.ok ||
    input.sandboxReview.capabilities.missing.length > 0 ||
    input.sandboxReview.hostApis.deniedObserved.length > 0 ||
    input.approvalGates.some((gate) => gate.state === "denied")
  ) {
    return "denied";
  }

  if (input.approvalGates.some((gate) => gate.required && gate.state !== "approved")) {
    return "approval_required";
  }

  return "approved";
}

function normalizeApprovalGateState(
  state: unknown,
  label: string,
): PluginReviewApprovalGateState {
  if (state === "approved" || state === "denied" || state === "pending") {
    return state;
  }

  throw new TypeError(`${label} must be approved, denied, or pending.`);
}

function normalizeReferencesValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return deepFreeze(value.map((item) => normalizeReferencesValue(item)));
  }

  if (isRecord(value)) {
    return deepFreeze(Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalizeReferencesValue(value[key] as JsonValue)]),
    ));
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TypeError("JSON values must use finite numbers.");
  }

  return value;
}

function normalizeJsonObject(value: unknown, label: string): JsonObject {
  if (!isJsonObject(value)) {
    throw new TypeError(`${label} must be a JSON object.`);
  }

  return normalizeReferencesValue(value) as JsonObject;
}

function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return typeof value !== "number" || Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  return isJsonObject(value);
}

function redactLocalText(value: string): string {
  return value
    .replace(/\b(?:[A-Za-z]:\\|\\\\)[^\s"'<>]+/g, "[local-path]")
    .replace(/\bfile:\/\/[^\s"'<>]+/g, "[local-path]")
    .replace(/\b(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s"'<>]+/gi, "$1=[redacted]");
}

function fingerprintValue(namespace: string, value: unknown): string {
  const canonical = canonicalJson(value);
  return `${fnv1a64(canonical)}${fnv1a64(`${namespace}:${canonical}`)}`;
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * prime) & mask;
  }

  return hash.toString(16).padStart(16, "0");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function normalizeStringSet(values: readonly string[]): readonly string[] {
  return deepFreeze([...new Set(values.map((value) => normalizeRequiredString(value, "Review value")))].sort(compareStrings));
}

function compareReference(left: PluginReviewReference, right: PluginReviewReference): number {
  return compareStrings(`${left.kind}:${left.id}`, `${right.kind}:${right.id}`);
}

function compareById<T extends { id: string }>(left: T, right: T): number {
  return compareStrings(left.id, right.id);
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function normalizeOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return normalizeRequiredString(value, label);
}

function normalizeRequiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function optionalFields<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (!isFreezable(value) || Object.isFrozen(value)) {
    return value;
  }

  for (const key of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key]);
  }

  return Object.freeze(value);
}

function isFreezable(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}
