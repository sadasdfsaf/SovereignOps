import { createHash } from "node:crypto";

import {
  APPROVAL_EVIDENCE_REDACTED,
  redactApprovalEvidenceMetadata,
  type ApprovalEvidenceAuditCoverage,
  type ApprovalEvidenceResult,
  type ApprovalEvidenceSummary,
} from "./approvalEvidence.ts";
import type { ApprovalSessionStatus } from "./approvalSessions.ts";

export const APPROVAL_EVIDENCE_RECORD_SCHEMA_VERSION = 1;
export const APPROVAL_EVIDENCE_RECORD_KIND = "mcp_gateway_approval_evidence_record";
export const APPROVAL_EVIDENCE_RECORD_ID_PREFIX = "mcp_approval_evidence_";

export type ApprovalEvidenceRecordSchemaVersion =
  typeof APPROVAL_EVIDENCE_RECORD_SCHEMA_VERSION;
export type ApprovalEvidenceRecordKind = typeof APPROVAL_EVIDENCE_RECORD_KIND;
export type ApprovalEvidenceRecordScope = "local";

export interface ApprovalEvidenceRecordDescriptorEvidence {
  schemaVersion: ApprovalEvidenceSummary["schemaVersion"];
  kind: ApprovalEvidenceSummary["kind"];
  sessionId: string;
  sessionStatus: ApprovalSessionStatus;
  result: ApprovalEvidenceResult;
  requestAction: string;
  toolName?: string;
  resource?: string;
  path?: string;
  capability?: string;
  auditCoverage: ApprovalEvidenceAuditCoverage;
  auditEventCount: number;
}

export interface ApprovalEvidenceRecordDescriptor {
  schemaVersion: ApprovalEvidenceRecordSchemaVersion;
  kind: ApprovalEvidenceRecordKind;
  id: string;
  fingerprint: string;
  evidenceFingerprint: string;
  metadataFingerprint: string;
  createdAt: string;
  scope: ApprovalEvidenceRecordScope;
  evidence: ApprovalEvidenceRecordDescriptorEvidence;
  metadataKeys: string[];
}

export interface ApprovalEvidenceRecord {
  descriptor: ApprovalEvidenceRecordDescriptor;
  evidence: ApprovalEvidenceSummary;
  metadata: Record<string, unknown>;
}

export interface PutApprovalEvidenceRecordInput {
  evidence: ApprovalEvidenceSummary;
  metadata?: Record<string, unknown>;
  createdAt?: Date | string;
  scope?: ApprovalEvidenceRecordScope;
}

export interface ApprovalEvidenceRecordStoreOptions {
  now?: () => Date | string;
}

export interface ListApprovalEvidenceRecordsFilter {
  sessionId?: string;
  result?: ApprovalEvidenceResult;
  toolName?: string;
}

export interface ApprovalEvidenceRecordComparison {
  matches: boolean;
  recordId: string;
  storedFingerprint: string;
  previewFingerprint: string;
  storedEvidenceFingerprint: string;
  previewEvidenceFingerprint: string;
  storedMetadataFingerprint: string;
  previewMetadataFingerprint: string;
  evidenceChanged: boolean;
  metadataChanged: boolean;
  changedPaths: string[];
}

interface NormalizedRecordInput {
  evidence: ApprovalEvidenceSummary;
  metadata: Record<string, unknown>;
  createdAt: string;
  scope: ApprovalEvidenceRecordScope;
}

const SECRET_NAME_PATTERN = /key|token|secret|password|bearer|auth/i;
const SECRET_VALUE_PATTERNS = [
  /\bBearer\s+\S+/i,
  /\b(?:api[-_ ]?key|access[-_ ]?key|token|secret|password|bearer|auth|authorization)\b\s*[:=]\s*\S+/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

export class ApprovalEvidenceRecordDuplicateError extends Error {
  readonly recordId: string;

  constructor(recordId: string) {
    super(`Approval evidence record already exists: ${recordId}`);
    this.name = "ApprovalEvidenceRecordDuplicateError";
    this.recordId = recordId;
  }
}

export class ApprovalEvidenceRecordNotFoundError extends Error {
  readonly recordId: string;

  constructor(recordId: string) {
    super(`Approval evidence record not found: ${recordId}`);
    this.name = "ApprovalEvidenceRecordNotFoundError";
    this.recordId = recordId;
  }
}

export class ApprovalEvidenceRecordStore {
  readonly #records = new Map<string, ApprovalEvidenceRecord>();
  readonly #now: () => Date | string;

  constructor(options: ApprovalEvidenceRecordStoreOptions = {}) {
    this.#now = options.now ?? (() => new Date());
  }

  put(input: PutApprovalEvidenceRecordInput | ApprovalEvidenceSummary): ApprovalEvidenceRecord {
    const normalized = normalizeRecordInput(input, this.#now);
    const descriptor = createApprovalEvidenceRecordDescriptor(normalized);

    if (this.#records.has(descriptor.id)) {
      throw new ApprovalEvidenceRecordDuplicateError(descriptor.id);
    }

    const record = freezeRecord({
      descriptor,
      evidence: normalized.evidence,
      metadata: normalized.metadata,
    });
    this.#records.set(descriptor.id, record);

    return cloneRecord(record);
  }

  list(filter: ListApprovalEvidenceRecordsFilter = {}): ApprovalEvidenceRecordDescriptor[] {
    return [...this.#records.values()]
      .map((record) => record.descriptor)
      .filter((descriptor) =>
        filter.sessionId === undefined || descriptor.evidence.sessionId === filter.sessionId,
      )
      .filter((descriptor) =>
        filter.result === undefined || descriptor.evidence.result === filter.result,
      )
      .filter((descriptor) =>
        filter.toolName === undefined || descriptor.evidence.toolName === filter.toolName,
      )
      .sort(compareApprovalEvidenceRecordDescriptors)
      .map(cloneDescriptor);
  }

  get(id: string): ApprovalEvidenceRecord | undefined {
    const record = this.#records.get(assertRecordId(id));
    return record ? cloneRecord(record) : undefined;
  }

  compare(
    id: string,
    preview: ApprovalEvidenceSummary,
    metadata?: Record<string, unknown>,
  ): ApprovalEvidenceRecordComparison {
    const record = this.#records.get(assertRecordId(id));
    if (!record) {
      throw new ApprovalEvidenceRecordNotFoundError(id);
    }

    return compareApprovalEvidencePreviewToRecord(preview, record, metadata);
  }

  delete(id: string): boolean {
    return this.#records.delete(assertRecordId(id));
  }
}

export function createApprovalEvidenceRecordStore(
  options: ApprovalEvidenceRecordStoreOptions = {},
): ApprovalEvidenceRecordStore {
  return new ApprovalEvidenceRecordStore(options);
}

export function createApprovalEvidenceRecord(
  input: PutApprovalEvidenceRecordInput | ApprovalEvidenceSummary,
  now: () => Date | string = () => new Date(),
): ApprovalEvidenceRecord {
  const normalized = normalizeRecordInput(input, now);
  return freezeRecord({
    descriptor: createApprovalEvidenceRecordDescriptor(normalized),
    evidence: normalized.evidence,
    metadata: normalized.metadata,
  });
}

export function createApprovalEvidenceRecordDescriptor(
  input: PutApprovalEvidenceRecordInput | ApprovalEvidenceSummary | NormalizedRecordInput,
): ApprovalEvidenceRecordDescriptor {
  const normalized = isNormalizedRecordInput(input)
    ? input
    : normalizeRecordInput(input, () => new Date());
  const evidenceFingerprint = createApprovalEvidenceRecordFingerprint(
    normalized.evidence,
  );
  const metadataFingerprint = createApprovalEvidenceRecordFingerprint(
    normalized.metadata,
  );
  const fingerprint = createApprovalEvidenceRecordFingerprint({
    evidenceFingerprint,
    metadataFingerprint,
  });
  const descriptor: ApprovalEvidenceRecordDescriptor = {
    schemaVersion: APPROVAL_EVIDENCE_RECORD_SCHEMA_VERSION,
    kind: APPROVAL_EVIDENCE_RECORD_KIND,
    id: `${APPROVAL_EVIDENCE_RECORD_ID_PREFIX}${fingerprint.slice(0, 32)}`,
    fingerprint,
    evidenceFingerprint,
    metadataFingerprint,
    createdAt: normalized.createdAt,
    scope: normalized.scope,
    evidence: describeEvidence(normalized.evidence),
    metadataKeys: Object.keys(normalized.metadata).sort((left, right) =>
      left.localeCompare(right),
    ),
  };

  assertApprovalEvidenceRecordDescriptor(descriptor);
  return deepFreeze(cloneJsonLike(descriptor));
}

export function createApprovalEvidenceRecordFingerprint(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function compareApprovalEvidencePreviewToRecord(
  preview: ApprovalEvidenceSummary,
  record: ApprovalEvidenceRecord,
  metadata: Record<string, unknown> = record.metadata,
): ApprovalEvidenceRecordComparison {
  assertApprovalEvidenceRecord(record);
  const normalizedPreview = normalizeApprovalEvidenceSummary(preview);
  const normalizedMetadata = normalizeRecordMetadata(metadata);
  const previewEvidenceFingerprint = createApprovalEvidenceRecordFingerprint(
    normalizedPreview,
  );
  const previewMetadataFingerprint = createApprovalEvidenceRecordFingerprint(
    normalizedMetadata,
  );
  const previewFingerprint = createApprovalEvidenceRecordFingerprint({
    evidenceFingerprint: previewEvidenceFingerprint,
    metadataFingerprint: previewMetadataFingerprint,
  });
  const changedPaths = compareCanonicalValues(record.evidence, normalizedPreview);
  const metadataPaths = compareCanonicalValues(record.metadata, normalizedMetadata).map((path) =>
    `$.metadata${path.slice(1)}`,
  );
  const allChangedPaths = [...changedPaths, ...metadataPaths].sort((left, right) =>
    left.localeCompare(right),
  );

  return {
    matches:
      record.descriptor.fingerprint === previewFingerprint &&
      allChangedPaths.length === 0,
    recordId: record.descriptor.id,
    storedFingerprint: record.descriptor.fingerprint,
    previewFingerprint,
    storedEvidenceFingerprint: record.descriptor.evidenceFingerprint,
    previewEvidenceFingerprint,
    storedMetadataFingerprint: record.descriptor.metadataFingerprint,
    previewMetadataFingerprint,
    evidenceChanged: changedPaths.length > 0,
    metadataChanged: metadataPaths.length > 0,
    changedPaths: allChangedPaths,
  };
}

export const compareApprovalEvidenceRecordBaseline =
  compareApprovalEvidencePreviewToRecord;

export function assertApprovalEvidenceRecord(
  record: ApprovalEvidenceRecord,
): asserts record is ApprovalEvidenceRecord {
  assertPlainRecord(record, "Approval evidence record");
  assertApprovalEvidenceRecordDescriptor(record.descriptor);
  normalizeApprovalEvidenceSummary(record.evidence);
  normalizeRecordMetadata(record.metadata);

  const evidenceFingerprint = createApprovalEvidenceRecordFingerprint(record.evidence);
  const metadataFingerprint = createApprovalEvidenceRecordFingerprint(record.metadata);
  const fingerprint = createApprovalEvidenceRecordFingerprint({
    evidenceFingerprint,
    metadataFingerprint,
  });

  if (record.descriptor.evidenceFingerprint !== evidenceFingerprint) {
    throw new TypeError("Approval evidence record evidence fingerprint is invalid.");
  }
  if (record.descriptor.metadataFingerprint !== metadataFingerprint) {
    throw new TypeError("Approval evidence record metadata fingerprint is invalid.");
  }
  if (record.descriptor.fingerprint !== fingerprint) {
    throw new TypeError("Approval evidence record fingerprint is invalid.");
  }
  if (record.descriptor.id !== `${APPROVAL_EVIDENCE_RECORD_ID_PREFIX}${fingerprint.slice(0, 32)}`) {
    throw new TypeError("Approval evidence record id is invalid.");
  }
}

export function assertApprovalEvidenceRecordDescriptor(
  descriptor: ApprovalEvidenceRecordDescriptor,
): asserts descriptor is ApprovalEvidenceRecordDescriptor {
  assertPlainRecord(descriptor, "Approval evidence record descriptor");
  if (descriptor.schemaVersion !== APPROVAL_EVIDENCE_RECORD_SCHEMA_VERSION) {
    throw new TypeError("Approval evidence record schemaVersion is unsupported.");
  }
  if (descriptor.kind !== APPROVAL_EVIDENCE_RECORD_KIND) {
    throw new TypeError("Approval evidence record kind is unsupported.");
  }
  assertRecordId(descriptor.id);
  assertFingerprint(descriptor.fingerprint, "Approval evidence record fingerprint");
  assertFingerprint(
    descriptor.evidenceFingerprint,
    "Approval evidence record evidence fingerprint",
  );
  assertFingerprint(
    descriptor.metadataFingerprint,
    "Approval evidence record metadata fingerprint",
  );
  normalizeCreatedAt(descriptor.createdAt);
  assertLocalScope(descriptor.scope);
  assertPlainRecord(descriptor.evidence, "Approval evidence record descriptor evidence");
  if (!Array.isArray(descriptor.metadataKeys)) {
    throw new TypeError("Approval evidence record metadataKeys must be an array.");
  }
  for (const key of descriptor.metadataKeys) {
    if (typeof key !== "string") {
      throw new TypeError("Approval evidence record metadataKeys must contain strings.");
    }
  }
}

export function assertApprovalEvidenceRecordRedacted(
  evidence: ApprovalEvidenceSummary,
): asserts evidence is ApprovalEvidenceSummary {
  assertRedactedValue(evidence, "$");
}

function normalizeRecordInput(
  input: PutApprovalEvidenceRecordInput | ApprovalEvidenceSummary,
  now: () => Date | string,
): NormalizedRecordInput {
  const candidate = isApprovalEvidenceSummaryLike(input)
    ? { evidence: input }
    : input;
  assertPlainRecord(candidate, "Approval evidence record input");
  assertLocalScope(candidate.scope ?? "local");

  return {
    evidence: normalizeApprovalEvidenceSummary(candidate.evidence),
    metadata: normalizeRecordMetadata(candidate.metadata ?? {}),
    createdAt: normalizeCreatedAt(candidate.createdAt ?? now()),
    scope: "local",
  };
}

function normalizeApprovalEvidenceSummary(
  evidence: ApprovalEvidenceSummary,
): ApprovalEvidenceSummary {
  const normalized = cloneJsonLike(evidence);
  assertApprovalEvidenceSummary(normalized);
  assertApprovalEvidenceRecordRedacted(normalized);

  return normalized;
}

function normalizeRecordMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  assertPlainRecord(metadata, "Approval evidence record metadata");
  const redacted = redactApprovalEvidenceMetadata(metadata);
  return cloneJsonLike(redacted);
}

function assertApprovalEvidenceSummary(
  evidence: ApprovalEvidenceSummary,
): asserts evidence is ApprovalEvidenceSummary {
  assertPlainRecord(evidence, "Approval evidence summary");
  if (evidence.schemaVersion !== 1) {
    throw new TypeError("Approval evidence summary schemaVersion is unsupported.");
  }
  if (evidence.kind !== "mcp_gateway_approval_evidence") {
    throw new TypeError("Approval evidence summary kind is unsupported.");
  }
  assertPlainRecord(evidence.session, "Approval evidence summary session");
  assertNonEmptyString(evidence.session.id, "Approval evidence summary session id");
  assertApprovalSessionStatus(evidence.session.status);
  assertApprovalEvidenceResult(evidence.session.result);
  normalizeCreatedAt(evidence.session.createdAt);
  normalizeCreatedAt(evidence.session.updatedAt);
  if (evidence.session.expiresAt !== undefined) {
    normalizeCreatedAt(evidence.session.expiresAt);
  }
  assertPlainRecord(evidence.session.expiry, "Approval evidence summary expiry");
  normalizeCreatedAt(evidence.session.expiry.evaluatedAt);
  if (evidence.session.expiry.expiresAt !== undefined) {
    normalizeCreatedAt(evidence.session.expiry.expiresAt);
  }
  assertPlainRecord(evidence.request, "Approval evidence summary request");
  assertNonEmptyString(evidence.request.action, "Approval evidence summary request action");
  assertPlainRecord(evidence.actors, "Approval evidence summary actors");
  assertPlainRecord(evidence.refs, "Approval evidence summary refs");
  assertPlainRecord(evidence.policy, "Approval evidence summary policy");
  assertPlainRecord(evidence.audit, "Approval evidence summary audit");
  if (evidence.audit.coverage !== "present" && evidence.audit.coverage !== "missing") {
    throw new TypeError("Approval evidence summary audit coverage is unsupported.");
  }
  if (!Array.isArray(evidence.audit.eventRefs)) {
    throw new TypeError("Approval evidence summary audit eventRefs must be an array.");
  }
}

function describeEvidence(
  evidence: ApprovalEvidenceSummary,
): ApprovalEvidenceRecordDescriptorEvidence {
  return pruneUndefined({
    schemaVersion: evidence.schemaVersion,
    kind: evidence.kind,
    sessionId: evidence.session.id,
    sessionStatus: evidence.session.status,
    result: evidence.session.result,
    requestAction: evidence.request.action,
    toolName: evidence.request.toolName,
    resource: evidence.request.resource,
    path: evidence.request.path,
    capability: evidence.request.capability,
    auditCoverage: evidence.audit.coverage,
    auditEventCount: evidence.audit.eventRefs.length,
  });
}

function compareApprovalEvidenceRecordDescriptors(
  left: ApprovalEvidenceRecordDescriptor,
  right: ApprovalEvidenceRecordDescriptor,
): number {
  const timeComparison =
    Date.parse(left.createdAt) - Date.parse(right.createdAt);
  if (timeComparison !== 0) {
    return timeComparison;
  }

  return left.id.localeCompare(right.id);
}

function compareCanonicalValues(left: unknown, right: unknown): string[] {
  return compareValues(canonicalValue(left), canonicalValue(right), "$");
}

function compareValues(left: unknown, right: unknown, path: string): string[] {
  if (Object.is(left, right)) {
    return [];
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return [path];
    }

    const changes: string[] = [];
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      changes.push(...compareValues(left[index], right[index], `${path}[${index}]`));
    }
    return changes;
  }

  if (isPlainRecord(left) || isPlainRecord(right)) {
    if (!isPlainRecord(left) || !isPlainRecord(right)) {
      return [path];
    }

    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    const changes: string[] = [];
    for (const key of [...keys].sort((a, b) => a.localeCompare(b))) {
      changes.push(
        ...compareValues(
          (left as Record<string, unknown>)[key],
          (right as Record<string, unknown>)[key],
          `${path}.${key}`,
        ),
      );
    }
    return changes;
  }

  return [path];
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(
  value: unknown,
  seen = new WeakSet<object>(),
): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Approval evidence record values must be finite numbers.");
    }
    return value;
  }

  if (value === undefined) {
    return undefined;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value !== "object") {
    throw new TypeError("Approval evidence record values must be JSON-compatible.");
  }

  if (seen.has(value)) {
    throw new TypeError("Approval evidence record values must not contain circular references.");
  }
  seen.add(value);

  if (Array.isArray(value)) {
    const normalizedArray = value.map((entry) =>
      entry === undefined ? null : canonicalValue(entry, seen),
    );
    seen.delete(value);
    return normalizedArray;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  const normalized: Record<string, unknown> = {};
  for (const [key, entryValue] of entries) {
    normalized[key] = canonicalValue(entryValue, seen);
  }
  seen.delete(value);

  return normalized;
}

function cloneJsonLike<T>(value: T): T {
  return canonicalValue(value) as T;
}

function cloneDescriptor(
  descriptor: ApprovalEvidenceRecordDescriptor,
): ApprovalEvidenceRecordDescriptor {
  return deepFreeze(cloneJsonLike(descriptor));
}

function cloneRecord(record: ApprovalEvidenceRecord): ApprovalEvidenceRecord {
  return freezeRecord({
    descriptor: cloneJsonLike(record.descriptor),
    evidence: cloneJsonLike(record.evidence),
    metadata: cloneJsonLike(record.metadata),
  });
}

function freezeRecord(record: ApprovalEvidenceRecord): ApprovalEvidenceRecord {
  return deepFreeze(record);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return value;
  }
  seen.add(value);

  for (const entryValue of Object.values(value as Record<string, unknown>)) {
    deepFreeze(entryValue, seen);
  }

  return Object.freeze(value);
}

function normalizeCreatedAt(value: Date | string): string {
  const timestamp = value instanceof Date ? value.toISOString() : value;
  if (typeof timestamp !== "string" || Number.isNaN(Date.parse(timestamp))) {
    throw new TypeError("Approval evidence record createdAt must be a valid timestamp.");
  }

  return timestamp;
}

function assertLocalScope(scope: unknown): asserts scope is ApprovalEvidenceRecordScope {
  if (scope !== "local") {
    throw new TypeError("Approval evidence records must use local scope.");
  }
}

function assertRecordId(id: unknown): string {
  if (typeof id !== "string" || !id.startsWith(APPROVAL_EVIDENCE_RECORD_ID_PREFIX)) {
    throw new TypeError("Approval evidence record id must use the MCP approval evidence prefix.");
  }

  return id;
}

function assertFingerprint(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new TypeError(`${name} must be a sha256 hex string.`);
  }
}

function assertNonEmptyString(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
}

function assertPlainRecord(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (!isPlainRecord(value)) {
    throw new TypeError(`${name} must be an object.`);
  }
}

function assertApprovalSessionStatus(
  value: unknown,
): asserts value is ApprovalSessionStatus {
  if (
    value !== "pending" &&
    value !== "approved" &&
    value !== "rejected" &&
    value !== "expired"
  ) {
    throw new TypeError("Approval evidence summary session status is unsupported.");
  }
}

function assertApprovalEvidenceResult(
  value: unknown,
): asserts value is ApprovalEvidenceResult {
  if (
    value !== "pending" &&
    value !== "approved" &&
    value !== "denied" &&
    value !== "expired"
  ) {
    throw new TypeError("Approval evidence summary result is unsupported.");
  }
}

function assertRedactedValue(value: unknown, path: string, key?: string): void {
  if (key && SECRET_NAME_PATTERN.test(key)) {
    if (value !== APPROVAL_EVIDENCE_REDACTED) {
      throw new TypeError(`Approval evidence contains unredacted secret at ${path}.`);
    }
    return;
  }

  if (typeof value === "string") {
    if (
      value !== APPROVAL_EVIDENCE_REDACTED &&
      SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))
    ) {
      throw new TypeError(`Approval evidence contains unredacted secret at ${path}.`);
    }
    return;
  }

  if (value === null || value === undefined || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertRedactedValue(entry, `${path}[${index}]`));
    return;
  }

  for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
    assertRedactedValue(entryValue, `${path}.${entryKey}`, entryKey);
  }
}

function isNormalizedRecordInput(value: unknown): value is NormalizedRecordInput {
  return (
    isPlainRecord(value) &&
    isApprovalEvidenceSummaryLike(value.evidence) &&
    isPlainRecord(value.metadata) &&
    typeof value.createdAt === "string" &&
    value.scope === "local"
  );
}

function isApprovalEvidenceSummaryLike(value: unknown): value is ApprovalEvidenceSummary {
  return (
    isPlainRecord(value) &&
    value.schemaVersion === 1 &&
    value.kind === "mcp_gateway_approval_evidence"
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}
