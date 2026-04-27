export const BACKUP_MANIFEST_VERSION = "1.0.0";
export const DEFAULT_ENCRYPTION_ALGORITHM = "metadata-only-encryption-v1";

export type RestoreMode = "preview" | "merge" | "replace";
export type BackupPayloadKind = "workspace_state" | "record" | "asset" | "settings";
export type RestoreActionType = "restore" | "skip" | "conflict" | "blocked";
export type BackupAuditOperation = "backup_created" | "restore_planned" | "restore_completed" | "restore_blocked";
export type BackupAuditOutcome = "success" | "warning" | "blocked";

export interface BackupEncryptionMetadata {
  algorithm: string;
  keyId: string;
  keyFingerprint: string;
}

export interface BackupPayloadEncryptionMetadata {
  algorithm: string;
  keyId: string;
  nonceFingerprint: string;
  encryptedPayloadFingerprint: string;
}

export interface BackupPayloadIntegrity {
  plaintextFingerprint: string;
  encryptedPayloadFingerprint: string;
  descriptorFingerprint: string;
}

export interface BackupPayloadDescriptor {
  id: string;
  kind: BackupPayloadKind;
  path: string;
  plaintextByteSize: number;
  encryptedByteSize: number;
  contentType?: string;
  createdAt: string;
  encryption: BackupPayloadEncryptionMetadata;
  integrity: BackupPayloadIntegrity;
}

export interface BackupManifest {
  manifestVersion: string;
  backupId: string;
  workspaceId: string;
  createdAt: string;
  createdByActorId: string;
  encryption: BackupEncryptionMetadata;
  payloads: readonly BackupPayloadDescriptor[];
  manifestFingerprint: string;
}

export interface BackupPayloadDescriptorInput {
  id: string;
  kind: BackupPayloadKind;
  path: string;
  plaintextByteSize: number;
  encryptedByteSize?: number;
  contentType?: string;
  createdAt: string;
  encryptionKeyId: string;
  encryptionAlgorithm?: string;
  plaintextFingerprint?: string;
}

export interface BackupManifestInput {
  backupId: string;
  workspaceId: string;
  createdAt: string;
  createdByActorId: string;
  encryptionKeyId: string;
  encryptionAlgorithm?: string;
  payloads: readonly BackupPayloadDescriptor[];
}

export interface BackupValidationIssue {
  path: string;
  message: string;
}

export interface BackupValidationSuccess {
  ok: true;
  issues: readonly [];
  value: BackupManifest;
}

export interface BackupValidationFailure {
  ok: false;
  issues: readonly BackupValidationIssue[];
}

export type BackupValidationResult = BackupValidationSuccess | BackupValidationFailure;

export interface RestoreSafetyOptions {
  targetWorkspaceId: string;
  mode?: RestoreMode;
  allowSourceWorkspaceOverwrite?: boolean;
  allowDestructiveRestore?: boolean;
  trustedManifestFingerprints?: readonly string[];
  availablePayloadIds?: readonly string[];
  maxManifestAgeDays?: number;
  now?: string;
}

export interface RestoreSafetyResult {
  safe: boolean;
  blockers: readonly string[];
  warnings: readonly string[];
}

export interface RestorePlanOptions extends RestoreSafetyOptions {
  includePayloadIds?: readonly string[];
  excludePayloadIds?: readonly string[];
  existingPayloadFingerprints?: Readonly<Record<string, string>>;
}

export interface RestorePlanAction {
  type: RestoreActionType;
  payloadId: string;
  kind: BackupPayloadKind;
  path: string;
  reason: string;
  sourceFingerprint: string;
  targetFingerprint?: string;
}

export interface RestorePlan {
  backupId: string;
  workspaceId: string;
  targetWorkspaceId: string;
  mode: RestoreMode;
  canRun: boolean;
  safety: RestoreSafetyResult;
  actions: readonly RestorePlanAction[];
  summary: {
    restore: number;
    skip: number;
    conflict: number;
    blocked: number;
  };
}

export interface BackupRetentionPolicy {
  keepLatest?: number;
  deleteAfterDays?: number;
  minimumBackups?: number;
  protectBackupIds?: readonly string[];
}

export interface BackupRetentionDecision {
  backupId: string;
  createdAt: string;
  action: "keep" | "delete";
  reason: string;
}

export interface BackupRetentionEvaluation {
  keep: readonly BackupRetentionDecision[];
  delete: readonly BackupRetentionDecision[];
  decisions: readonly BackupRetentionDecision[];
}

export interface BackupAuditEventInput {
  operation: BackupAuditOperation;
  outcome: BackupAuditOutcome;
  backupId: string;
  workspaceId: string;
  actorId: string;
  timestamp: string;
  payloads?: readonly BackupPayloadDescriptor[];
  restoreMode?: RestoreMode;
  message?: string;
}

export interface RedactedBackupAuditEvent {
  operation: BackupAuditOperation;
  outcome: BackupAuditOutcome;
  timestamp: string;
  backupRef: string;
  workspaceRef: string;
  actorRef: string;
  payloadCount: number;
  payloadKinds: readonly BackupPayloadKind[];
  restoreMode?: RestoreMode;
  message?: string;
}

export class BackupManifestValidationError extends TypeError {
  readonly issues: readonly BackupValidationIssue[];

  constructor(issues: readonly BackupValidationIssue[]) {
    super(`Invalid backup manifest: ${issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`);
    this.name = "BackupManifestValidationError";
    this.issues = issues;
  }
}

export function createBackupPayloadDescriptor(input: BackupPayloadDescriptorInput): BackupPayloadDescriptor {
  const path = normalizeBackupPath(input.path);
  const algorithm = normalizeString(input.encryptionAlgorithm ?? DEFAULT_ENCRYPTION_ALGORITHM);
  const keyId = normalizeString(input.encryptionKeyId);
  const id = normalizeString(input.id);
  const kind = input.kind;
  const plaintextByteSize = input.plaintextByteSize;
  const encryptedByteSize = input.encryptedByteSize ?? plaintextByteSize + 32;
  const contentType = input.contentType === undefined ? undefined : normalizeString(input.contentType);
  const createdAt = normalizeTimestamp(input.createdAt);
  const plaintextFingerprint = input.plaintextFingerprint ?? stableFingerprint({
    id,
    kind,
    path,
    plaintextByteSize,
    contentType,
  });
  const encryptedPayloadFingerprint = stableFingerprint({
    algorithm,
    keyId,
    plaintextFingerprint,
    encryptedByteSize,
  });
  const encryption = {
    algorithm,
    keyId,
    nonceFingerprint: stableFingerprint(["nonce", id, path, createdAt, plaintextFingerprint]),
    encryptedPayloadFingerprint,
  };
  const descriptorWithoutIntegrity = optionalFields({
    id,
    kind,
    path,
    plaintextByteSize,
    encryptedByteSize,
    contentType,
    createdAt,
    encryption,
  });

  return {
    ...descriptorWithoutIntegrity,
    integrity: {
      plaintextFingerprint,
      encryptedPayloadFingerprint,
      descriptorFingerprint: stableFingerprint(descriptorWithoutIntegrity),
    },
  };
}

export function createBackupManifest(input: BackupManifestInput): BackupManifest {
  const encryption = {
    algorithm: normalizeString(input.encryptionAlgorithm ?? DEFAULT_ENCRYPTION_ALGORITHM),
    keyId: normalizeString(input.encryptionKeyId),
    keyFingerprint: stableFingerprint(["key", input.encryptionKeyId]),
  };
  const manifestWithoutFingerprint = {
    manifestVersion: BACKUP_MANIFEST_VERSION,
    backupId: normalizeString(input.backupId),
    workspaceId: normalizeString(input.workspaceId),
    createdAt: normalizeTimestamp(input.createdAt),
    createdByActorId: normalizeString(input.createdByActorId),
    encryption,
    payloads: normalizePayloads(input.payloads),
  };
  const manifest = {
    ...manifestWithoutFingerprint,
    manifestFingerprint: stableFingerprint(manifestWithoutFingerprint),
  };

  return assertBackupManifest(manifest);
}

export function validateBackupManifest(value: unknown): BackupValidationResult {
  const issues: BackupValidationIssue[] = [];

  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: "$", message: "must be an object" }] };
  }

  rejectUnknownFields(value, MANIFEST_FIELDS, "$", issues);
  validateExactString(value, "manifestVersion", "$.manifestVersion", BACKUP_MANIFEST_VERSION, issues);
  validateRequiredString(value, "backupId", "$.backupId", issues, isBackupId, "must use bkp_<slug> format");
  validateRequiredString(value, "workspaceId", "$.workspaceId", issues, isWorkspaceId, "must use wsp_<slug> format");
  validateTimestampField(value, "createdAt", "$.createdAt", issues);
  validateRequiredString(value, "createdByActorId", "$.createdByActorId", issues, isActorId, "must use act_<slug> format");
  validateEncryptionMetadata(value.encryption, "$.encryption", issues);
  validatePayloadDescriptors(value.payloads, "$.payloads", issues);

  if (Object.hasOwn(value, "manifestFingerprint") && !isFingerprint(value.manifestFingerprint)) {
    issues.push({ path: "$.manifestFingerprint", message: "must be a deterministic fingerprint" });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const normalized = normalizeManifestUnchecked(value as unknown as BackupManifest);
  if (value.manifestFingerprint !== normalized.manifestFingerprint) {
    return {
      ok: false,
      issues: [{ path: "$.manifestFingerprint", message: "does not match manifest contents" }],
    };
  }

  return { ok: true, issues: [], value: normalized };
}

export function assertBackupManifest(value: unknown): BackupManifest {
  const result = validateBackupManifest(value);
  if (!result.ok) {
    throw new BackupManifestValidationError(result.issues);
  }

  return result.value;
}

export function normalizeBackupManifest(value: BackupManifest): BackupManifest {
  return assertBackupManifest(value);
}

export function planWorkspaceRestore(manifestValue: unknown, options: RestorePlanOptions): RestorePlan {
  const manifest = assertBackupManifest(manifestValue);
  const mode = options.mode ?? "preview";
  const safety = checkRestoreSafety(manifest, { ...options, mode });
  const include = options.includePayloadIds ? new Set(options.includePayloadIds.map(normalizeString)) : undefined;
  const exclude = new Set((options.excludePayloadIds ?? []).map(normalizeString));
  const existing = options.existingPayloadFingerprints ?? {};
  const selectedPayloads = manifest.payloads.filter((payload) => {
    if (include && !include.has(payload.id)) {
      return false;
    }

    return !exclude.has(payload.id);
  });

  const actions = selectedPayloads.map((payload): RestorePlanAction => {
    if (!safety.safe) {
      return restoreAction("blocked", payload, "restore is blocked by safety checks");
    }

    const targetFingerprint = existing[payload.path];
    if (targetFingerprint === payload.integrity.descriptorFingerprint) {
      return restoreAction("skip", payload, "target already has this payload descriptor", targetFingerprint);
    }

    if (targetFingerprint && mode === "merge") {
      return restoreAction("conflict", payload, "target has a different payload at this path", targetFingerprint);
    }

    return restoreAction("restore", payload, targetFingerprint ? "target payload will be replaced" : "payload will be restored", targetFingerprint);
  });
  const summary = summarizeRestoreActions(actions);

  return {
    backupId: manifest.backupId,
    workspaceId: manifest.workspaceId,
    targetWorkspaceId: normalizeString(options.targetWorkspaceId),
    mode,
    canRun: safety.safe && summary.conflict === 0 && summary.blocked === 0,
    safety,
    actions,
    summary,
  };
}

export function checkRestoreSafety(manifestValue: unknown, options: RestoreSafetyOptions): RestoreSafetyResult {
  const validation = validateBackupManifest(manifestValue);
  if (!validation.ok) {
    return {
      safe: false,
      blockers: validation.issues.map((issue) => `${issue.path} ${issue.message}`),
      warnings: [],
    };
  }

  const manifest = validation.value;
  const mode = options.mode ?? "preview";
  const targetWorkspaceId = normalizeString(options.targetWorkspaceId);
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!isWorkspaceId(targetWorkspaceId)) {
    blockers.push("targetWorkspaceId must use wsp_<slug> format");
  }

  if (targetWorkspaceId === manifest.workspaceId && !options.allowSourceWorkspaceOverwrite) {
    blockers.push("restore targets the source workspace without explicit overwrite approval");
  }

  if (mode === "replace" && !options.allowDestructiveRestore) {
    blockers.push("replace mode requires explicit destructive restore approval");
  }

  if (
    options.trustedManifestFingerprints &&
    !options.trustedManifestFingerprints.includes(manifest.manifestFingerprint)
  ) {
    blockers.push("manifest fingerprint is not trusted");
  }

  if (options.availablePayloadIds) {
    const availablePayloadIds = new Set(options.availablePayloadIds.map(normalizeString));
    const missing = manifest.payloads.filter((payload) => !availablePayloadIds.has(payload.id));
    if (missing.length > 0) {
      blockers.push(`missing payload descriptors: ${missing.map((payload) => payload.id).join(", ")}`);
    }
  }

  if (options.maxManifestAgeDays !== undefined) {
    const now = Date.parse(normalizeTimestamp(options.now ?? new Date().toISOString()));
    const created = Date.parse(manifest.createdAt);
    const maxAgeMs = options.maxManifestAgeDays * 24 * 60 * 60 * 1000;
    if (Number.isFinite(maxAgeMs) && now - created > maxAgeMs) {
      warnings.push(`manifest is older than ${options.maxManifestAgeDays} days`);
    }
  }

  return {
    safe: blockers.length === 0,
    blockers,
    warnings,
  };
}

export function evaluateRetentionPolicy(
  manifestsValue: readonly BackupManifest[],
  policy: BackupRetentionPolicy,
  now = new Date().toISOString(),
): BackupRetentionEvaluation {
  const manifests = manifestsValue.map(assertBackupManifest).sort(compareManifestByCreatedAtDescending);
  const keepLatest = nonNegativeInteger(policy.keepLatest ?? 1, "keepLatest");
  const minimumBackups = nonNegativeInteger(policy.minimumBackups ?? 1, "minimumBackups");
  const deleteAfterDays = policy.deleteAfterDays === undefined
    ? undefined
    : nonNegativeInteger(policy.deleteAfterDays, "deleteAfterDays");
  const protectedIds = new Set((policy.protectBackupIds ?? []).map(normalizeString));
  const keepIds = new Set<string>();
  const decisions: BackupRetentionDecision[] = [];

  manifests.slice(0, keepLatest).forEach((manifest) => keepIds.add(manifest.backupId));
  for (const manifest of manifests) {
    if (protectedIds.has(manifest.backupId)) {
      keepIds.add(manifest.backupId);
    }
  }

  const nowMs = Date.parse(normalizeTimestamp(now));
  const deleteCandidates = manifests.filter((manifest) => {
    if (keepIds.has(manifest.backupId) || deleteAfterDays === undefined) {
      return false;
    }

    const ageMs = nowMs - Date.parse(manifest.createdAt);
    return ageMs > deleteAfterDays * 24 * 60 * 60 * 1000;
  });
  const deleteBudget = Math.max(0, manifests.length - Math.max(minimumBackups, keepIds.size));
  const deleteIds = new Set(
    (deleteBudget === 0 ? [] : deleteCandidates.slice(-deleteBudget))
      .map((manifest) => manifest.backupId),
  );

  for (const [index, manifest] of manifests.entries()) {
    const isProtected = protectedIds.has(manifest.backupId);
    const isLatest = index < keepLatest;
    if (deleteIds.has(manifest.backupId)) {
      decisions.push({
        backupId: manifest.backupId,
        createdAt: manifest.createdAt,
        action: "delete",
        reason: `older than ${deleteAfterDays} days`,
      });
      continue;
    }

    decisions.push({
      backupId: manifest.backupId,
      createdAt: manifest.createdAt,
      action: "keep",
      reason: isProtected
        ? "protected backup"
        : isLatest
          ? "latest backup"
          : "retained to satisfy minimum backup count or age window",
    });
  }

  return {
    keep: decisions.filter((decision) => decision.action === "keep"),
    delete: decisions.filter((decision) => decision.action === "delete"),
    decisions,
  };
}

export function createRedactedBackupAuditEvent(input: BackupAuditEventInput): RedactedBackupAuditEvent {
  const payloads = input.payloads ?? [];
  const payloadKinds = [...new Set(payloads.map((payload) => payload.kind))].sort();
  const event = optionalFields({
    operation: input.operation,
    outcome: input.outcome,
    timestamp: normalizeTimestamp(input.timestamp),
    backupRef: redactedRef("backup", input.backupId),
    workspaceRef: redactedRef("workspace", input.workspaceId),
    actorRef: redactedRef("actor", input.actorId),
    payloadCount: payloads.length,
    payloadKinds,
    restoreMode: input.restoreMode,
    message: input.message === undefined ? undefined : sanitizeAuditMessage(input.message),
  });

  return event;
}

export function stableFingerprint(value: unknown): string {
  const serialized = stableStringify(value);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;

  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= BigInt(serialized.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }

  return `fp_${hash.toString(16).padStart(16, "0")}`;
}

export function isBackupId(value: unknown): value is string {
  return typeof value === "string" && /^bkp_[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(value.trim());
}

export function isWorkspaceId(value: unknown): value is string {
  return typeof value === "string" && /^wsp_[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(value.trim());
}

export function isActorId(value: unknown): value is string {
  return typeof value === "string" && /^act_[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(value.trim());
}

const MANIFEST_FIELDS = new Set([
  "manifestVersion",
  "backupId",
  "workspaceId",
  "createdAt",
  "createdByActorId",
  "encryption",
  "payloads",
  "manifestFingerprint",
]);
const ENCRYPTION_FIELDS = new Set(["algorithm", "keyId", "keyFingerprint"]);
const PAYLOAD_FIELDS = new Set([
  "id",
  "kind",
  "path",
  "plaintextByteSize",
  "encryptedByteSize",
  "contentType",
  "createdAt",
  "encryption",
  "integrity",
]);
const PAYLOAD_ENCRYPTION_FIELDS = new Set([
  "algorithm",
  "keyId",
  "nonceFingerprint",
  "encryptedPayloadFingerprint",
]);
const PAYLOAD_INTEGRITY_FIELDS = new Set([
  "plaintextFingerprint",
  "encryptedPayloadFingerprint",
  "descriptorFingerprint",
]);
const PAYLOAD_KINDS = new Set(["workspace_state", "record", "asset", "settings"]);

function validatePayloadDescriptors(
  value: unknown,
  path: string,
  issues: BackupValidationIssue[],
): void {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push({ path, message: "must be a non-empty array" });
    return;
  }

  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();
  value.forEach((payload, index) => {
    const payloadPath = `${path}[${index}]`;
    if (!isRecord(payload)) {
      issues.push({ path: payloadPath, message: "must be an object" });
      return;
    }

    rejectUnknownFields(payload, PAYLOAD_FIELDS, payloadPath, issues);
    const id = validateRequiredString(payload, "id", `${payloadPath}.id`, issues, isPayloadId, "must use pay_<slug> format");
    validatePayloadKind(payload.kind, `${payloadPath}.kind`, issues);
    const normalizedPath = validateRequiredString(payload, "path", `${payloadPath}.path`, issues, isSafeBackupPath, "must be a relative backup path");
    validateTimestampField(payload, "createdAt", `${payloadPath}.createdAt`, issues);
    validateByteSize(payload.plaintextByteSize, `${payloadPath}.plaintextByteSize`, issues);
    validateByteSize(payload.encryptedByteSize, `${payloadPath}.encryptedByteSize`, issues);
    if (
      Number.isInteger(payload.plaintextByteSize) &&
      Number.isInteger(payload.encryptedByteSize) &&
      payload.encryptedByteSize < payload.plaintextByteSize
    ) {
      issues.push({ path: `${payloadPath}.encryptedByteSize`, message: "must be greater than or equal to plaintextByteSize" });
    }
    if (Object.hasOwn(payload, "contentType") && !isNonEmptyString(payload.contentType)) {
      issues.push({ path: `${payloadPath}.contentType`, message: "must be a non-empty string" });
    }
    validatePayloadEncryption(payload.encryption, `${payloadPath}.encryption`, issues);
    validatePayloadIntegrity(payload.integrity, `${payloadPath}.integrity`, issues);
    validatePayloadFingerprintConsistency(payload, payloadPath, issues);

    if (id) {
      if (seenIds.has(id)) {
        issues.push({ path: `${payloadPath}.id`, message: `duplicates payload id ${id}` });
      }
      seenIds.add(id);
    }
    if (normalizedPath) {
      const normalized = normalizeBackupPath(normalizedPath);
      if (seenPaths.has(normalized)) {
        issues.push({ path: `${payloadPath}.path`, message: `duplicates payload path ${normalized}` });
      }
      seenPaths.add(normalized);
    }
  });
}

function validateEncryptionMetadata(
  value: unknown,
  path: string,
  issues: BackupValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "must be an object" });
    return;
  }

  rejectUnknownFields(value, ENCRYPTION_FIELDS, path, issues);
  validateRequiredString(value, "algorithm", `${path}.algorithm`, issues);
  validateRequiredString(value, "keyId", `${path}.keyId`, issues);
  validateRequiredString(value, "keyFingerprint", `${path}.keyFingerprint`, issues, isFingerprint, "must be a deterministic fingerprint");
}

function validatePayloadEncryption(
  value: unknown,
  path: string,
  issues: BackupValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "must be an object" });
    return;
  }

  rejectUnknownFields(value, PAYLOAD_ENCRYPTION_FIELDS, path, issues);
  validateRequiredString(value, "algorithm", `${path}.algorithm`, issues);
  validateRequiredString(value, "keyId", `${path}.keyId`, issues);
  validateRequiredString(value, "nonceFingerprint", `${path}.nonceFingerprint`, issues, isFingerprint, "must be a deterministic fingerprint");
  validateRequiredString(value, "encryptedPayloadFingerprint", `${path}.encryptedPayloadFingerprint`, issues, isFingerprint, "must be a deterministic fingerprint");
}

function validatePayloadIntegrity(
  value: unknown,
  path: string,
  issues: BackupValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "must be an object" });
    return;
  }

  rejectUnknownFields(value, PAYLOAD_INTEGRITY_FIELDS, path, issues);
  validateRequiredString(value, "plaintextFingerprint", `${path}.plaintextFingerprint`, issues, isFingerprint, "must be a deterministic fingerprint");
  validateRequiredString(value, "encryptedPayloadFingerprint", `${path}.encryptedPayloadFingerprint`, issues, isFingerprint, "must be a deterministic fingerprint");
  validateRequiredString(value, "descriptorFingerprint", `${path}.descriptorFingerprint`, issues, isFingerprint, "must be a deterministic fingerprint");
}

function validatePayloadFingerprintConsistency(
  payload: Record<string, unknown>,
  path: string,
  issues: BackupValidationIssue[],
): void {
  if (!isRecord(payload.encryption) || !isRecord(payload.integrity)) {
    return;
  }

  if (
    isFingerprint(payload.encryption.encryptedPayloadFingerprint) &&
    isFingerprint(payload.integrity.encryptedPayloadFingerprint) &&
    payload.encryption.encryptedPayloadFingerprint.trim() !== payload.integrity.encryptedPayloadFingerprint.trim()
  ) {
    issues.push({
      path: `${path}.integrity.encryptedPayloadFingerprint`,
      message: "must match encryption.encryptedPayloadFingerprint",
    });
  }

  const expectedDescriptorFingerprint = expectedPayloadDescriptorFingerprint(payload);
  if (
    expectedDescriptorFingerprint &&
    isFingerprint(payload.integrity.descriptorFingerprint) &&
    payload.integrity.descriptorFingerprint.trim() !== expectedDescriptorFingerprint
  ) {
    issues.push({
      path: `${path}.integrity.descriptorFingerprint`,
      message: "does not match payload descriptor",
    });
  }
}

function validatePayloadKind(
  value: unknown,
  path: string,
  issues: BackupValidationIssue[],
): void {
  if (typeof value !== "string" || !PAYLOAD_KINDS.has(value)) {
    issues.push({ path, message: "must be a supported payload kind" });
  }
}

function validateExactString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  expected: string,
  issues: BackupValidationIssue[],
): void {
  if (record[key] !== expected) {
    issues.push({ path, message: `must be ${expected}` });
  }
}

function validateTimestampField(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: BackupValidationIssue[],
): void {
  validateRequiredString(record, key, path, issues, isIsoTimestamp, "must be an ISO timestamp");
}

function validateRequiredString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: BackupValidationIssue[],
  predicate?: (value: unknown) => boolean,
  predicateMessage?: string,
): string | undefined {
  if (!Object.hasOwn(record, key)) {
    issues.push({ path, message: "is required" });
    return undefined;
  }

  const value = record[key];
  if (!isNonEmptyString(value)) {
    issues.push({ path, message: "must be a non-empty string" });
    return undefined;
  }

  const normalized = value.trim();
  if (predicate && !predicate(normalized)) {
    issues.push({ path, message: predicateMessage ?? "is invalid" });
    return undefined;
  }

  return normalized;
}

function validateByteSize(value: unknown, path: string, issues: BackupValidationIssue[]): void {
  if (!Number.isInteger(value) || value < 0) {
    issues.push({ path, message: "must be a non-negative integer" });
  }
}

function rejectUnknownFields(
  record: Record<string, unknown>,
  allowedFields: ReadonlySet<string>,
  path: string,
  issues: BackupValidationIssue[],
): void {
  for (const key of Object.keys(record)) {
    if (!allowedFields.has(key)) {
      issues.push({ path: `${path}.${key}`, message: "is not allowed" });
    }
  }
}

function normalizeManifestUnchecked(manifest: BackupManifest): BackupManifest {
  const manifestWithoutFingerprint = {
    manifestVersion: BACKUP_MANIFEST_VERSION,
    backupId: manifest.backupId.trim(),
    workspaceId: manifest.workspaceId.trim(),
    createdAt: normalizeTimestamp(manifest.createdAt),
    createdByActorId: manifest.createdByActorId.trim(),
    encryption: {
      algorithm: manifest.encryption.algorithm.trim(),
      keyId: manifest.encryption.keyId.trim(),
      keyFingerprint: manifest.encryption.keyFingerprint.trim(),
    },
    payloads: normalizePayloads(manifest.payloads),
  };

  return {
    ...manifestWithoutFingerprint,
    manifestFingerprint: stableFingerprint(manifestWithoutFingerprint),
  };
}

function normalizePayloads(payloads: readonly BackupPayloadDescriptor[]): readonly BackupPayloadDescriptor[] {
  return payloads.map(normalizePayloadDescriptor).sort(comparePayloadById);
}

function normalizePayloadDescriptor(payload: BackupPayloadDescriptor): BackupPayloadDescriptor {
  const descriptorWithoutIntegrity = optionalFields({
    id: payload.id.trim(),
    kind: payload.kind,
    path: normalizeBackupPath(payload.path),
    plaintextByteSize: payload.plaintextByteSize,
    encryptedByteSize: payload.encryptedByteSize,
    contentType: payload.contentType?.trim(),
    createdAt: normalizeTimestamp(payload.createdAt),
    encryption: {
      algorithm: payload.encryption.algorithm.trim(),
      keyId: payload.encryption.keyId.trim(),
      nonceFingerprint: payload.encryption.nonceFingerprint.trim(),
      encryptedPayloadFingerprint: payload.encryption.encryptedPayloadFingerprint.trim(),
    },
  });

  return {
    ...descriptorWithoutIntegrity,
    integrity: {
      plaintextFingerprint: payload.integrity.plaintextFingerprint.trim(),
      encryptedPayloadFingerprint: payload.integrity.encryptedPayloadFingerprint.trim(),
      descriptorFingerprint: stableFingerprint(descriptorWithoutIntegrity),
    },
  };
}

function expectedPayloadDescriptorFingerprint(payload: Record<string, unknown>): string | undefined {
  if (
    !isPayloadId(payload.id) ||
    typeof payload.kind !== "string" ||
    !PAYLOAD_KINDS.has(payload.kind) ||
    !isSafeBackupPath(payload.path) ||
    !Number.isInteger(payload.plaintextByteSize) ||
    payload.plaintextByteSize < 0 ||
    !Number.isInteger(payload.encryptedByteSize) ||
    payload.encryptedByteSize < payload.plaintextByteSize ||
    !isIsoTimestamp(payload.createdAt) ||
    !isRecord(payload.encryption) ||
    !isNonEmptyString(payload.encryption.algorithm) ||
    !isNonEmptyString(payload.encryption.keyId) ||
    !isFingerprint(payload.encryption.nonceFingerprint) ||
    !isFingerprint(payload.encryption.encryptedPayloadFingerprint)
  ) {
    return undefined;
  }

  if (Object.hasOwn(payload, "contentType") && !isNonEmptyString(payload.contentType)) {
    return undefined;
  }

  return stableFingerprint(optionalFields({
    id: payload.id.trim(),
    kind: payload.kind,
    path: normalizeBackupPath(payload.path),
    plaintextByteSize: payload.plaintextByteSize,
    encryptedByteSize: payload.encryptedByteSize,
    contentType: payload.contentType?.trim(),
    createdAt: normalizeTimestamp(payload.createdAt),
    encryption: {
      algorithm: payload.encryption.algorithm.trim(),
      keyId: payload.encryption.keyId.trim(),
      nonceFingerprint: payload.encryption.nonceFingerprint.trim(),
      encryptedPayloadFingerprint: payload.encryption.encryptedPayloadFingerprint.trim(),
    },
  }));
}

function restoreAction(
  type: RestoreActionType,
  payload: BackupPayloadDescriptor,
  reason: string,
  targetFingerprint?: string,
): RestorePlanAction {
  return optionalFields({
    type,
    payloadId: payload.id,
    kind: payload.kind,
    path: payload.path,
    reason,
    sourceFingerprint: payload.integrity.descriptorFingerprint,
    targetFingerprint,
  });
}

function summarizeRestoreActions(actions: readonly RestorePlanAction[]): RestorePlan["summary"] {
  const summary = { restore: 0, skip: 0, conflict: 0, blocked: 0 };
  for (const action of actions) {
    summary[action.type] += 1;
  }

  return summary;
}

function normalizeBackupPath(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".")
    .join("/");
}

function isSafeBackupPath(value: unknown): value is string {
  if (!isNonEmptyString(value)) {
    return false;
  }

  const normalized = value.trim().replace(/\\/g, "/");
  if (
    normalized.includes("\0") ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized)
  ) {
    return false;
  }

  const segments = normalized.split("/").filter((segment) => segment.length > 0 && segment !== ".");
  return segments.length > 0 && !segments.includes("..");
}

function normalizeTimestamp(value: string): string {
  const trimmed = normalizeString(value);
  const timestamp = Date.parse(trimmed);
  if (!Number.isFinite(timestamp)) {
    throw new TypeError(`Invalid ISO timestamp: ${value}`);
  }

  return new Date(timestamp).toISOString();
}

function normalizeString(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new TypeError("Expected a non-empty string");
  }

  return normalized;
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative integer`);
  }

  return value;
}

function sanitizeAuditMessage(value: string): string {
  return value.trim().replace(/[A-Za-z]:[\\/][^\s]+|(?:\.{0,2}[\\/])?[^\s/\\]+(?:[\\/][^\s/\\]+)+/g, "[redacted-path]");
}

function redactedRef(kind: string, value: string): string {
  return `${kind}:${stableFingerprint(value).slice(3, 15)}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (isRecord(value)) {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(null);
}

function comparePayloadById(left: BackupPayloadDescriptor, right: BackupPayloadDescriptor): number {
  return left.id.localeCompare(right.id);
}

function compareManifestByCreatedAtDescending(left: BackupManifest, right: BackupManifest): number {
  return right.createdAt.localeCompare(left.createdAt) || right.backupId.localeCompare(left.backupId);
}

function isPayloadId(value: unknown): value is string {
  return typeof value === "string" && /^pay_[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(value.trim());
}

function isFingerprint(value: unknown): value is string {
  return typeof value === "string" && /^fp_[0-9a-f]{16}$/.test(value.trim());
}

function isIsoTimestamp(value: unknown): value is string {
  if (!isNonEmptyString(value)) {
    return false;
  }

  const timestamp = Date.parse(value.trim());
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalFields<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T;
}
