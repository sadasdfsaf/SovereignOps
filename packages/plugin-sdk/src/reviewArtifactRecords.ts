import {
  createPluginReviewArtifact,
  type PluginReviewApprovalGateState,
  type PluginReviewArtifact,
  type PluginReviewArtifactDecision,
  type PluginReviewArtifactInput,
  type PluginReviewArtifactSchemaVersion,
  type PluginReviewCapabilityEvidenceDecision,
  type PluginReviewEvidence,
  type PluginReviewHostApiEvidenceDecision,
  type PluginReviewManifestMetadata,
  type PluginReviewReference,
} from "./reviewArtifact.ts";
import {
  PLUGIN_PERMISSION_ALLOWLIST,
  type PluginPermission,
} from "./manifest.ts";
import type {
  PluginSandboxFailureCode,
} from "./sandbox.ts";
import type {
  PluginSandboxFailureCategory,
  PluginSandboxFailureReview,
  PluginSandboxReviewSummary,
} from "./sandboxReview.ts";

export const PLUGIN_REVIEW_ARTIFACT_RECORD_SCHEMA_VERSION =
  "plugin-review-artifact-record/v1" as const;

export type PluginReviewArtifactRecordSchemaVersion =
  typeof PLUGIN_REVIEW_ARTIFACT_RECORD_SCHEMA_VERSION;

export interface PluginReviewArtifactRecordSummary {
  readonly schemaVersion: PluginReviewArtifactRecordSchemaVersion;
  readonly recordId: string;
  readonly fingerprint: string;
  readonly reviewId: string;
  readonly artifactFingerprint: string;
  readonly artifactSchemaVersion: PluginReviewArtifactSchemaVersion;
  readonly pluginId: string;
  readonly pluginName: string;
  readonly pluginVersion: string;
  readonly decision: PluginReviewArtifactDecision;
  readonly sandboxOk: boolean;
  readonly sandboxFingerprint: string;
  readonly grantedCapabilities: readonly string[];
  readonly missingCapabilities: readonly string[];
  readonly deniedHostApisObserved: readonly string[];
  readonly approvalGateStates: readonly PluginReviewArtifactRecordApprovalGateSummary[];
  readonly evidence: readonly PluginReviewArtifactRecordEvidenceSummary[];
}

export interface PluginReviewArtifactRecordApprovalGateSummary {
  readonly id: string;
  readonly name: string;
  readonly required: boolean;
  readonly state: PluginReviewApprovalGateState;
}

export interface PluginReviewArtifactRecordEvidenceSummary {
  readonly id: string;
  readonly kind: string;
  readonly localOnly: boolean;
  readonly redacted: boolean;
  readonly fingerprint: string;
}

export interface PluginReviewArtifactRecord {
  readonly schemaVersion: PluginReviewArtifactRecordSchemaVersion;
  readonly recordId: string;
  readonly fingerprint: string;
  readonly artifact: PluginReviewArtifact;
  readonly summary: PluginReviewArtifactRecordSummary;
}

export type PluginReviewArtifactRecordSource<TValue = unknown> =
  | PluginReviewArtifactInput<TValue>
  | PluginReviewArtifact
  | PluginReviewArtifactRecord;

export interface PluginReviewArtifactComparisonDifference {
  readonly field: string;
  readonly left: string;
  readonly right: string;
}

export interface PluginReviewArtifactComparison {
  readonly match: boolean;
  readonly artifactFingerprintMatch: boolean;
  readonly reviewIdMatch: boolean;
  readonly decisionMatch: boolean;
  readonly pluginIdMatch: boolean;
  readonly recordIdMatch?: boolean;
  readonly recordFingerprintMatch?: boolean;
  readonly differences: readonly PluginReviewArtifactComparisonDifference[];
}

export interface PluginReviewArtifactRecordStore {
  append<TValue>(source: PluginReviewArtifactRecordSource<TValue>): PluginReviewArtifactRecord;
  get(recordId: string): PluginReviewArtifactRecord | undefined;
  list(): readonly PluginReviewArtifactRecord[];
  listSummaries(): readonly PluginReviewArtifactRecordSummary[];
}

export function createPluginReviewArtifactRecord<TValue>(
  source: PluginReviewArtifactRecordSource<TValue>,
): PluginReviewArtifactRecord {
  const artifact = materializeArtifact(source);
  const basis = deepFreeze({
    schemaVersion: PLUGIN_REVIEW_ARTIFACT_RECORD_SCHEMA_VERSION,
    artifact,
  });
  const fingerprint = createPluginReviewArtifactRecordFingerprint(basis);
  const recordId = `plugin-review-record-${artifact.manifest.id}-${fingerprint.slice(0, 16)}`;
  const summary = summarizePluginReviewArtifactRecordBasis({
    recordId,
    fingerprint,
    artifact,
  });

  return deepFreeze({
    ...basis,
    recordId,
    fingerprint,
    summary,
  });
}

export function createPluginReviewArtifactRecordFingerprint(value: unknown): string {
  return fingerprintValue("plugin-review-artifact-record", value);
}

export function summarizePluginReviewArtifactRecord(
  record: PluginReviewArtifactRecord,
): PluginReviewArtifactRecordSummary {
  return createPluginReviewArtifactRecord(record).summary;
}

export function comparePluginReviewArtifacts(
  left: PluginReviewArtifact | PluginReviewArtifactRecord,
  right: PluginReviewArtifact | PluginReviewArtifactRecord,
): PluginReviewArtifactComparison {
  const leftRecord = isPluginReviewArtifactRecord(left) ? createPluginReviewArtifactRecord(left) : undefined;
  const rightRecord = isPluginReviewArtifactRecord(right) ? createPluginReviewArtifactRecord(right) : undefined;
  const leftArtifact = leftRecord?.artifact ?? clonePluginReviewArtifact(left as PluginReviewArtifact);
  const rightArtifact = rightRecord?.artifact ?? clonePluginReviewArtifact(right as PluginReviewArtifact);
  const differences = [
    compareField("artifact.reviewId", leftArtifact.reviewId, rightArtifact.reviewId),
    compareField("artifact.fingerprint", leftArtifact.fingerprint, rightArtifact.fingerprint),
    compareField("artifact.decision", leftArtifact.decision, rightArtifact.decision),
    compareField("artifact.manifest.id", leftArtifact.manifest.id, rightArtifact.manifest.id),
    compareField("artifact.manifest.version", leftArtifact.manifest.version, rightArtifact.manifest.version),
    compareField(
      "artifact.sandboxReview.fingerprint",
      leftArtifact.sandboxReview.fingerprint,
      rightArtifact.sandboxReview.fingerprint,
    ),
  ];

  if (leftRecord !== undefined && rightRecord !== undefined) {
    differences.push(
      compareField("record.recordId", leftRecord.recordId, rightRecord.recordId),
      compareField("record.fingerprint", leftRecord.fingerprint, rightRecord.fingerprint),
    );
  }

  const normalizedDifferences = deepFreeze(
    differences.filter((difference): difference is PluginReviewArtifactComparisonDifference => difference !== undefined),
  );

  return deepFreeze(optionalFields({
    match: normalizedDifferences.length === 0,
    artifactFingerprintMatch: leftArtifact.fingerprint === rightArtifact.fingerprint,
    reviewIdMatch: leftArtifact.reviewId === rightArtifact.reviewId,
    decisionMatch: leftArtifact.decision === rightArtifact.decision,
    pluginIdMatch: leftArtifact.manifest.id === rightArtifact.manifest.id,
    recordIdMatch: leftRecord !== undefined && rightRecord !== undefined
      ? leftRecord.recordId === rightRecord.recordId
      : undefined,
    recordFingerprintMatch: leftRecord !== undefined && rightRecord !== undefined
      ? leftRecord.fingerprint === rightRecord.fingerprint
      : undefined,
    differences: normalizedDifferences,
  }));
}

export function comparePluginReviewArtifactToRecord<TValue>(
  record: PluginReviewArtifactRecord,
  candidate: PluginReviewArtifactRecordSource<TValue>,
): PluginReviewArtifactComparison {
  return comparePluginReviewArtifacts(record, createPluginReviewArtifactRecord(candidate));
}

export function createInMemoryPluginReviewArtifactRecordStore(
  initialRecords: readonly PluginReviewArtifactRecordSource[] = [],
): PluginReviewArtifactRecordStore {
  const records: PluginReviewArtifactRecord[] = [];
  const recordIds = new Set<string>();

  const appendRecord = <TValue>(
    source: PluginReviewArtifactRecordSource<TValue>,
  ): PluginReviewArtifactRecord => {
    const record = createPluginReviewArtifactRecord(source);
    if (recordIds.has(record.recordId)) {
      throw new TypeError(`Plugin review artifact record already exists: ${record.recordId}.`);
    }

    records.push(record);
    recordIds.add(record.recordId);
    return record;
  };

  const store = Object.freeze({
    append: appendRecord,
    get(recordId: string): PluginReviewArtifactRecord | undefined {
      const normalizedRecordId = normalizeRequiredString(recordId, "recordId");
      return records.find((record) => record.recordId === normalizedRecordId);
    },
    list(): readonly PluginReviewArtifactRecord[] {
      return deepFreeze([...records]);
    },
    listSummaries(): readonly PluginReviewArtifactRecordSummary[] {
      return deepFreeze(records.map((record) => record.summary));
    },
  });

  for (const record of initialRecords) {
    appendRecord(record);
  }

  return store;
}

export const createPluginReviewArtifactRecordStore =
  createInMemoryPluginReviewArtifactRecordStore;

function materializeArtifact<TValue>(
  source: PluginReviewArtifactRecordSource<TValue>,
): PluginReviewArtifact {
  if (isPluginReviewArtifactRecord(source)) {
    return clonePluginReviewArtifact(source.artifact);
  }
  if (isPluginReviewArtifact(source)) {
    return clonePluginReviewArtifact(source);
  }

  return createPluginReviewArtifact(source);
}

function summarizePluginReviewArtifactRecordBasis(input: {
  readonly recordId: string;
  readonly fingerprint: string;
  readonly artifact: PluginReviewArtifact;
}): PluginReviewArtifactRecordSummary {
  return deepFreeze({
    schemaVersion: PLUGIN_REVIEW_ARTIFACT_RECORD_SCHEMA_VERSION,
    recordId: input.recordId,
    fingerprint: input.fingerprint,
    reviewId: input.artifact.reviewId,
    artifactFingerprint: input.artifact.fingerprint,
    artifactSchemaVersion: input.artifact.schemaVersion,
    pluginId: input.artifact.manifest.id,
    pluginName: input.artifact.manifest.name,
    pluginVersion: input.artifact.manifest.version,
    decision: input.artifact.decision,
    sandboxOk: input.artifact.sandboxReview.ok,
    sandboxFingerprint: input.artifact.sandboxReview.fingerprint,
    grantedCapabilities: input.artifact.capabilityEvidence
      .filter((item) => item.granted)
      .map((item) => item.capability),
    missingCapabilities: input.artifact.capabilityEvidence
      .filter((item) => item.missing)
      .map((item) => item.capability),
    deniedHostApisObserved: input.artifact.hostApiEvidence
      .filter((item) => item.observedDenied)
      .map((item) => item.api),
    approvalGateStates: input.artifact.approvalGates.map((gate) => deepFreeze({
      id: gate.id,
      name: gate.name,
      required: gate.required,
      state: gate.state,
    })),
    evidence: input.artifact.evidence.map((item) => summarizeEvidence(item)),
  });
}

function summarizeEvidence(item: PluginReviewEvidence): PluginReviewArtifactRecordEvidenceSummary {
  return deepFreeze({
    id: item.id,
    kind: item.kind,
    localOnly: item.localOnly,
    redacted: item.redacted,
    fingerprint: item.fingerprint,
  });
}

function clonePluginReviewArtifact(artifact: PluginReviewArtifact): PluginReviewArtifact {
  if (!isPluginReviewArtifact(artifact)) {
    throw new TypeError("Plugin review artifact record source must be a plugin review artifact.");
  }

  return deepFreeze({
    schemaVersion: "plugin-review-artifact/v1" as const,
    reviewId: normalizeRequiredString(artifact.reviewId, "artifact.reviewId"),
    fingerprint: normalizeFingerprint(artifact.fingerprint, "artifact.fingerprint"),
    decision: normalizeArtifactDecision(artifact.decision, "artifact.decision"),
    manifest: cloneManifestMetadata(artifact.manifest),
    sandboxReview: cloneSandboxReview(artifact.sandboxReview),
    capabilityEvidence: artifact.capabilityEvidence.map((item, index) => optionalFields({
      capability: normalizeRequiredString(item.capability, `artifact.capabilityEvidence[${index}].capability`),
      declared: normalizeBoolean(item.declared, `artifact.capabilityEvidence[${index}].declared`),
      permission: normalizeOptionalPermission(item.permission, `artifact.capabilityEvidence[${index}].permission`),
      required: normalizeBoolean(item.required, `artifact.capabilityEvidence[${index}].required`),
      observed: normalizeBoolean(item.observed, `artifact.capabilityEvidence[${index}].observed`),
      granted: normalizeBoolean(item.granted, `artifact.capabilityEvidence[${index}].granted`),
      missing: normalizeBoolean(item.missing, `artifact.capabilityEvidence[${index}].missing`),
      decision: normalizeCapabilityEvidenceDecision(
        item.decision,
        `artifact.capabilityEvidence[${index}].decision`,
      ),
    })),
    hostApiEvidence: artifact.hostApiEvidence.map((item, index) => ({
      api: normalizeRequiredString(item.api, `artifact.hostApiEvidence[${index}].api`),
      configuredDenied: normalizeBoolean(item.configuredDenied, `artifact.hostApiEvidence[${index}].configuredDenied`),
      observedDenied: normalizeBoolean(item.observedDenied, `artifact.hostApiEvidence[${index}].observedDenied`),
      decision: normalizeHostApiEvidenceDecision(item.decision, `artifact.hostApiEvidence[${index}].decision`),
    })),
    automationReferences: artifact.automationReferences.map((reference, index) => cloneReference(
      reference,
      `artifact.automationReferences[${index}]`,
    )),
    auditReferences: artifact.auditReferences.map((reference, index) => cloneReference(
      reference,
      `artifact.auditReferences[${index}]`,
    )),
    approvalGates: artifact.approvalGates.map((gate, index) => optionalFields({
      id: normalizeRequiredString(gate.id, `artifact.approvalGates[${index}].id`),
      name: normalizeRequiredString(gate.name, `artifact.approvalGates[${index}].name`),
      required: normalizeBoolean(gate.required, `artifact.approvalGates[${index}].required`),
      state: normalizeApprovalGateState(gate.state, `artifact.approvalGates[${index}].state`),
      reason: normalizeOptionalString(gate.reason, `artifact.approvalGates[${index}].reason`),
    })),
    evidence: artifact.evidence.map((item, index) => optionalFields({
      id: normalizeRequiredString(item.id, `artifact.evidence[${index}].id`),
      kind: normalizeRequiredString(item.kind, `artifact.evidence[${index}].kind`),
      summary: normalizeOptionalString(item.summary, `artifact.evidence[${index}].summary`),
      localOnly: normalizeBoolean(item.localOnly, `artifact.evidence[${index}].localOnly`),
      redacted: normalizeBoolean(item.redacted, `artifact.evidence[${index}].redacted`),
      fingerprint: normalizeFingerprint(item.fingerprint, `artifact.evidence[${index}].fingerprint`),
    })),
  });
}

function cloneManifestMetadata(manifest: PluginReviewManifestMetadata): PluginReviewManifestMetadata {
  return deepFreeze({
    id: normalizeRequiredString(manifest.id, "artifact.manifest.id"),
    name: normalizeRequiredString(manifest.name, "artifact.manifest.name"),
    version: normalizeRequiredString(manifest.version, "artifact.manifest.version"),
    description: normalizeRequiredString(manifest.description, "artifact.manifest.description"),
    entrypoint: normalizeRequiredString(manifest.entrypoint, "artifact.manifest.entrypoint"),
    minimumHostVersion: normalizeRequiredString(
      manifest.minimumHostVersion,
      "artifact.manifest.minimumHostVersion",
    ),
    permissions: manifest.permissions.map((permission, index) => normalizePermission(
      permission,
      `artifact.manifest.permissions[${index}]`,
    )),
    capabilities: manifest.capabilities.map((component, index) => optionalFields({
      id: normalizeRequiredString(component.id, `artifact.manifest.capabilities[${index}].id`),
      name: normalizeOptionalString(component.name, `artifact.manifest.capabilities[${index}].name`),
      capability: normalizeOptionalString(
        component.capability,
        `artifact.manifest.capabilities[${index}].capability`,
      ),
      permission: normalizeOptionalPermission(
        component.permission,
        `artifact.manifest.capabilities[${index}].permission`,
      ),
    })),
    tools: manifest.tools.map((component, index) => optionalFields({
      id: normalizeRequiredString(component.id, `artifact.manifest.tools[${index}].id`),
      name: normalizeOptionalString(component.name, `artifact.manifest.tools[${index}].name`),
      capability: normalizeOptionalString(component.capability, `artifact.manifest.tools[${index}].capability`),
      permission: normalizeOptionalPermission(component.permission, `artifact.manifest.tools[${index}].permission`),
    })),
    resources: manifest.resources.map((component, index) => optionalFields({
      id: normalizeRequiredString(component.id, `artifact.manifest.resources[${index}].id`),
      name: normalizeOptionalString(component.name, `artifact.manifest.resources[${index}].name`),
      capability: normalizeOptionalString(
        component.capability,
        `artifact.manifest.resources[${index}].capability`,
      ),
      permission: normalizeOptionalPermission(component.permission, `artifact.manifest.resources[${index}].permission`),
    })),
    prompts: manifest.prompts.map((component, index) => optionalFields({
      id: normalizeRequiredString(component.id, `artifact.manifest.prompts[${index}].id`),
      name: normalizeOptionalString(component.name, `artifact.manifest.prompts[${index}].name`),
      capability: normalizeOptionalString(component.capability, `artifact.manifest.prompts[${index}].capability`),
      permission: normalizeOptionalPermission(component.permission, `artifact.manifest.prompts[${index}].permission`),
    })),
  });
}

function cloneSandboxReview(summary: PluginSandboxReviewSummary): PluginSandboxReviewSummary {
  return deepFreeze(optionalFields({
    reviewId: normalizeRequiredString(summary.reviewId, "artifact.sandboxReview.reviewId"),
    fingerprint: normalizeFingerprint(summary.fingerprint, "artifact.sandboxReview.fingerprint"),
    pluginId: normalizeOptionalString(summary.pluginId, "artifact.sandboxReview.pluginId"),
    runLabel: normalizeOptionalString(summary.runLabel, "artifact.sandboxReview.runLabel"),
    ok: normalizeBoolean(summary.ok, "artifact.sandboxReview.ok"),
    capabilities: {
      granted: cloneStringList(summary.capabilities.granted, "artifact.sandboxReview.capabilities.granted"),
      required: cloneStringList(summary.capabilities.required, "artifact.sandboxReview.capabilities.required"),
      observed: cloneStringList(summary.capabilities.observed, "artifact.sandboxReview.capabilities.observed"),
      missing: cloneStringList(summary.capabilities.missing, "artifact.sandboxReview.capabilities.missing"),
    },
    hostApis: {
      denied: cloneStringList(summary.hostApis.denied, "artifact.sandboxReview.hostApis.denied"),
      deniedObserved: cloneStringList(
        summary.hostApis.deniedObserved,
        "artifact.sandboxReview.hostApis.deniedObserved",
      ),
    },
    limits: {
      maxAuditEvents: normalizeNonNegativeInteger(
        summary.limits.maxAuditEvents,
        "artifact.sandboxReview.limits.maxAuditEvents",
      ),
      maxTicks: normalizeNonNegativeInteger(summary.limits.maxTicks, "artifact.sandboxReview.limits.maxTicks"),
      ticksUsed: normalizeNonNegativeInteger(summary.limits.ticksUsed, "artifact.sandboxReview.limits.ticksUsed"),
      ticksRemaining: normalizeNonNegativeInteger(
        summary.limits.ticksRemaining,
        "artifact.sandboxReview.limits.ticksRemaining",
      ),
      tickBudgetExhausted: normalizeBoolean(
        summary.limits.tickBudgetExhausted,
        "artifact.sandboxReview.limits.tickBudgetExhausted",
      ),
    },
    audit: {
      total: normalizeNonNegativeInteger(summary.audit.total, "artifact.sandboxReview.audit.total"),
      remaining: normalizeNonNegativeInteger(summary.audit.remaining, "artifact.sandboxReview.audit.remaining"),
      overflow: normalizeBoolean(summary.audit.overflow, "artifact.sandboxReview.audit.overflow"),
      byType: summary.audit.byType.map((item, index) => ({
        type: normalizeRequiredString(item.type, `artifact.sandboxReview.audit.byType[${index}].type`),
        count: normalizeNonNegativeInteger(item.count, `artifact.sandboxReview.audit.byType[${index}].count`),
      })),
    },
    failureCategories: summary.failureCategories.map((category, index) => normalizeFailureCategory(
      category,
      `artifact.sandboxReview.failureCategories[${index}]`,
    )),
    failure: summary.failure === undefined
      ? undefined
      : cloneFailure(summary.failure),
  }));
}

function cloneFailure(failure: PluginSandboxFailureReview): PluginSandboxFailureReview {
  return deepFreeze({
    code: normalizeFailureCode(failure.code, "artifact.sandboxReview.failure.code"),
    category: normalizeFailureCategory(failure.category, "artifact.sandboxReview.failure.category"),
  });
}

function cloneReference(reference: PluginReviewReference, label: string): PluginReviewReference {
  return deepFreeze(optionalFields({
    id: normalizeRequiredString(reference.id, `${label}.id`),
    kind: normalizeRequiredString(reference.kind, `${label}.kind`),
    label: normalizeOptionalString(reference.label, `${label}.label`),
    uri: normalizeOptionalString(reference.uri, `${label}.uri`),
  }));
}

function compareField(
  field: string,
  left: unknown,
  right: unknown,
): PluginReviewArtifactComparisonDifference | undefined {
  if (canonicalJson(left) === canonicalJson(right)) {
    return undefined;
  }

  return deepFreeze({
    field,
    left: formatComparisonValue(left),
    right: formatComparisonValue(right),
  });
}

function formatComparisonValue(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }

  return canonicalJson(value);
}

function isPluginReviewArtifactRecord(value: unknown): value is PluginReviewArtifactRecord {
  return isRecord(value) && value.schemaVersion === "plugin-review-artifact-record/v1" && isRecord(value.artifact);
}

function isPluginReviewArtifact(value: unknown): value is PluginReviewArtifact {
  return isRecord(value) && value.schemaVersion === "plugin-review-artifact/v1";
}

function normalizeArtifactDecision(value: unknown, label: string): PluginReviewArtifactDecision {
  if (value === "approved" || value === "approval_required" || value === "denied") {
    return value;
  }

  throw new TypeError(`${label} must be approved, approval_required, or denied.`);
}

function normalizeApprovalGateState(value: unknown, label: string): PluginReviewApprovalGateState {
  if (value === "approved" || value === "denied" || value === "pending") {
    return value;
  }

  throw new TypeError(`${label} must be approved, denied, or pending.`);
}

function normalizeCapabilityEvidenceDecision(
  value: unknown,
  label: string,
): PluginReviewCapabilityEvidenceDecision {
  if (value === "granted" || value === "missing" || value === "not_requested") {
    return value;
  }

  throw new TypeError(`${label} must be granted, missing, or not_requested.`);
}

function normalizeHostApiEvidenceDecision(
  value: unknown,
  label: string,
): PluginReviewHostApiEvidenceDecision {
  if (value === "blocked" || value === "denied") {
    return value;
  }

  throw new TypeError(`${label} must be blocked or denied.`);
}

function normalizeFailureCategory(value: unknown, label: string): PluginSandboxFailureCategory {
  if (
    value === "async" ||
    value === "audit" ||
    value === "capability" ||
    value === "host_api" ||
    value === "invalid" ||
    value === "plugin" ||
    value === "resource" ||
    value === "success"
  ) {
    return value;
  }

  throw new TypeError(`${label} must be a sandbox failure category.`);
}

function normalizeOptionalPermission(value: unknown, label: string): PluginPermission | undefined {
  if (value === undefined) {
    return undefined;
  }

  return normalizePermission(value, label);
}

function normalizePermission(value: unknown, label: string): PluginPermission {
  if (typeof value === "string" && PLUGIN_PERMISSION_ALLOWLIST.includes(value as PluginPermission)) {
    return value as PluginPermission;
  }

  throw new TypeError(`${label} must be a plugin permission.`);
}

function normalizeFailureCode(value: unknown, label: string): PluginSandboxFailureCode {
  if (
    value === "SANDBOX_ASYNC_DENIED" ||
    value === "SANDBOX_AUDIT_LIMIT" ||
    value === "SANDBOX_CAPABILITY_DENIED" ||
    value === "SANDBOX_HOST_API_DENIED" ||
    value === "SANDBOX_INVALID_AUDIT" ||
    value === "SANDBOX_INVALID_TICK" ||
    value === "SANDBOX_RESOURCE_LIMIT" ||
    value === "PLUGIN_ERROR"
  ) {
    return value;
  }

  throw new TypeError(`${label} must be a sandbox failure code.`);
}

function cloneStringList(values: readonly string[], label: string): readonly string[] {
  return deepFreeze(values.map((value, index) => normalizeRequiredString(value, `${label}[${index}]`)));
}

function normalizeFingerprint(value: unknown, label: string): string {
  const normalized = normalizeRequiredString(value, label);
  if (!/^[a-f0-9]{32}$/.test(normalized)) {
    throw new TypeError(`${label} must be a 32 character lowercase hexadecimal fingerprint.`);
  }

  return normalized;
}

function normalizeBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(`${label} must be a boolean.`);
  }

  return value;
}

function normalizeNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer.`);
  }

  return Number(value);
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
