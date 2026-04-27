export const INGEST_EVIDENCE_FORMAT_VERSION = 1;
export const INGEST_EVIDENCE_SCHEMA_VERSION = "ingest-search-audit-evidence.v1";
export const INGEST_EVIDENCE_REDACTION = "[REDACTED]";

export const INGEST_EVIDENCE_ERROR_CODES = Object.freeze({
  INVALID_EVIDENCE: "INGEST_EVIDENCE_INVALID_EVIDENCE",
  SERIALIZATION_INVALID: "INGEST_EVIDENCE_SERIALIZATION_INVALID",
});

export type IngestEvidenceErrorCode =
  (typeof INGEST_EVIDENCE_ERROR_CODES)[keyof typeof INGEST_EVIDENCE_ERROR_CODES];

export type JsonPrimitive = string | number | boolean | null;
export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? Readonly<{ [K in keyof T]: DeepReadonly<T[K]> }>
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

export interface IngestEvidenceErrorOptions {
  readonly cause?: unknown;
  readonly details?: Readonly<Record<string, unknown>>;
}

export class IngestEvidenceError extends Error {
  readonly code: IngestEvidenceErrorCode;
  readonly details?: DeepReadonly<Record<string, unknown>>;

  constructor(
    code: IngestEvidenceErrorCode,
    message: string,
    options: IngestEvidenceErrorOptions = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "IngestEvidenceError";
    this.code = code;
    this.details = options.details === undefined ? undefined : readOnlyClone(options.details);
  }
}

export class IngestEvidenceValidationError extends IngestEvidenceError {
  constructor(message: string, options: IngestEvidenceErrorOptions = {}) {
    super(INGEST_EVIDENCE_ERROR_CODES.INVALID_EVIDENCE, message, options);
    this.name = "IngestEvidenceValidationError";
  }
}

export type IngestEvidenceRecordType =
  | "evidenceSummary"
  | "evidenceFile"
  | "sourceSnapshot"
  | "citationEvidence"
  | "quarantineDecision"
  | "apiRequestTrace"
  | "clientSessionTrace";

export interface NormalizedIngestEvidenceRecord {
  readonly kind: "ingest-evidence.record";
  readonly version: number;
  readonly recordType: IngestEvidenceRecordType;
  readonly recordId: string;
  readonly sourceUri: string | null;
  readonly fixturePath: string | null;
  readonly checksum: string | null;
  readonly payload: JsonObject;
  readonly fingerprint: string;
}

export interface NormalizedIngestEvidence {
  readonly kind: "ingest-evidence.audit-evidence";
  readonly version: number;
  readonly schemaVersion: string;
  readonly generatedAt: string;
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly localOnly: true;
  readonly evidenceSummary: JsonObject;
  readonly sourceChecksums: readonly string[];
  readonly records: readonly NormalizedIngestEvidenceRecord[];
  readonly fingerprint: string;
}

export interface IngestEvidencePackageOptions {
  readonly createdAt?: string;
  readonly packageId?: string;
}

export interface IngestEvidenceContentDescriptor {
  readonly fingerprint: string;
  readonly mediaType: string;
  readonly bytes: number;
  readonly rows?: number;
  readonly lines?: number;
  readonly columns?: readonly string[];
}

export interface IngestEvidenceFileDescriptor {
  readonly id: string;
  readonly fixturePath: string;
  readonly sha256: string;
  readonly schemaVersion: string | null;
  readonly fingerprint: string;
}

export interface IngestEvidenceManifest {
  readonly kind: "ingest-evidence.manifest";
  readonly version: number;
  readonly packageId: string;
  readonly createdAt: string;
  readonly evidence: {
    readonly schemaVersion: string;
    readonly generatedAt: string;
    readonly workspaceId: string;
    readonly sessionId: string;
    readonly localOnly: true;
    readonly fingerprint: string;
  };
  readonly recordCount: number;
  readonly recordTypes: readonly IngestEvidenceRecordType[];
  readonly sourceChecksums: readonly string[];
  readonly recordFingerprints: readonly string[];
  readonly evidenceFiles: readonly IngestEvidenceFileDescriptor[];
  readonly jsonl: IngestEvidenceContentDescriptor;
  readonly csv: IngestEvidenceContentDescriptor;
  readonly fingerprint: string;
}

export interface IngestEvidencePackage {
  readonly kind: "ingest-evidence.package";
  readonly version: number;
  readonly manifest: IngestEvidenceManifest;
  readonly jsonl: string;
  readonly csv: string;
  readonly fingerprint: string;
}

const DEFAULT_PACKAGE_CREATED_AT = "1970-01-01T00:00:00.000Z";
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const CSV_COLUMNS = Object.freeze([
  "recordType",
  "recordId",
  "sourceUri",
  "fixturePath",
  "checksum",
  "payload",
  "fingerprint",
]);

const RECORD_TYPE_ORDER = Object.freeze([
  "evidenceSummary",
  "evidenceFile",
  "sourceSnapshot",
  "citationEvidence",
  "quarantineDecision",
  "apiRequestTrace",
  "clientSessionTrace",
] as const);

const RECORD_TYPE_INDEX = new Map<IngestEvidenceRecordType, number>(
  RECORD_TYPE_ORDER.map((recordType, index) => [recordType, index]),
);

const SORTED_STRING_ARRAY_KEYS = new Set([
  "checksums",
  "documentIds",
  "indexDocumentIds",
  "logEntryIds",
  "quarantineItemIds",
  "relatedRequestIds",
  "sourceUris",
]);

export function normalizeIngestEvidence(value: unknown): DeepReadonly<NormalizedIngestEvidence> {
  if (!isPlainRecord(value)) {
    throw evidenceError("audit evidence must be a plain object", { path: "evidence" });
  }

  const schemaVersion = requireCleanString(
    value.schemaVersion,
    "evidence.schemaVersion",
    evidenceError,
  );
  if (schemaVersion !== INGEST_EVIDENCE_SCHEMA_VERSION) {
    throw evidenceError("unsupported audit evidence schema version", {
      path: "evidence.schemaVersion",
      value: schemaVersion,
    });
  }

  const generatedAt = readTimestamp(value.generatedAt, "evidence.generatedAt");
  const workspaceId = requireCleanString(value.workspaceId, "evidence.workspaceId", evidenceError);
  const sessionId = redactFieldValue(
    "sessionId",
    requireCleanString(value.sessionId, "evidence.sessionId", evidenceError),
  ) as string;
  const localOnly = readLocalOnly(value.localOnly);
  const evidenceSummary = readEvidenceSummary(value.evidenceSummary);

  const evidenceFileRecords = readRequiredArray(value.evidenceFiles, "evidence.evidenceFiles")
    .map((item, index) => readEvidenceFileRecord(item, index));
  const sourceSnapshotRecords = readRequiredArray(value.sourceSnapshots, "evidence.sourceSnapshots")
    .map((item, index) => readSourceSnapshotRecord(item, index));
  const citationEvidenceRecords = readRequiredArray(value.citationEvidence, "evidence.citationEvidence")
    .map((item, index) => readCitationEvidenceRecord(item, index));
  const quarantineDecisionRecords = readRequiredArray(
    value.quarantineDecisions,
    "evidence.quarantineDecisions",
  ).map((item, index) => readQuarantineDecisionRecord(item, index));
  const apiRequestTraceRecords = readRequiredArray(value.apiRequestTrace, "evidence.apiRequestTrace")
    .map((item, index) => readApiRequestTraceRecord(item, index));
  const clientSessionTraceRecords = readRequiredArray(
    value.clientSessionTrace,
    "evidence.clientSessionTrace",
  ).map((item, index) => readClientSessionTraceRecord(item, index));

  assertSummaryCount(evidenceSummary, "sourceCount", sourceSnapshotRecords.length);
  assertSummaryCount(evidenceSummary, "evidenceFileCount", evidenceFileRecords.length);
  assertSummaryCount(evidenceSummary, "citationCount", citationEvidenceRecords.length);
  assertSummaryCount(evidenceSummary, "quarantineDecisionCount", quarantineDecisionRecords.length);
  assertSummaryCount(evidenceSummary, "apiRequestTraceCount", apiRequestTraceRecords.length);
  assertSummaryCount(evidenceSummary, "clientSessionTraceCount", clientSessionTraceRecords.length);

  const records = [
    createRecord("evidenceSummary", "evidenceSummary", null, null, null, evidenceSummary),
    ...evidenceFileRecords,
    ...sourceSnapshotRecords,
    ...citationEvidenceRecords,
    ...quarantineDecisionRecords,
    ...apiRequestTraceRecords,
    ...clientSessionTraceRecords,
  ].sort(compareRecords);
  assertUniqueRecords(records);

  const sourceChecksums = uniqueSorted(records
    .map((record) => record.checksum)
    .filter((checksum): checksum is string => checksum !== null));

  const evidenceWithoutFingerprint = {
    kind: "ingest-evidence.audit-evidence",
    version: INGEST_EVIDENCE_FORMAT_VERSION,
    schemaVersion,
    generatedAt,
    workspaceId,
    sessionId,
    localOnly,
    evidenceSummary,
    sourceChecksums,
    records,
  } satisfies Omit<NormalizedIngestEvidence, "fingerprint">;
  const fingerprint = createFingerprint({
    kind: "ingest-evidence.audit-evidence",
    evidence: evidenceWithoutFingerprint,
  });

  return readOnlyClone({
    ...evidenceWithoutFingerprint,
    fingerprint,
  });
}

export function normalizeIngestEvidenceRecords(
  value: unknown,
): readonly DeepReadonly<NormalizedIngestEvidenceRecord>[] {
  return normalizeIngestEvidence(value).records;
}

export function redactIngestEvidenceValue(value: unknown): JsonValue {
  return redactJsonValue(value, "", "", false);
}

export function renderIngestEvidenceJsonl(value: unknown): string {
  const evidence = normalizeIngestEvidence(value);
  return renderJsonlFromRecords(evidence.records);
}

export function renderIngestEvidenceCsv(value: unknown): string {
  const evidence = normalizeIngestEvidence(value);
  return renderCsvFromRecords(evidence.records);
}

export function createIngestEvidenceManifest(
  value: unknown,
  options: IngestEvidencePackageOptions = {},
): IngestEvidenceManifest {
  return createManifestFromNormalized(normalizeIngestEvidence(value), options);
}

export function createIngestEvidencePackage(
  value: unknown,
  options: IngestEvidencePackageOptions = {},
): IngestEvidencePackage {
  const evidence = normalizeIngestEvidence(value);
  const jsonl = renderJsonlFromRecords(evidence.records);
  const csv = renderCsvFromRecords(evidence.records);
  const manifest = createManifestFromNormalized(evidence, options);
  const fingerprint = createFingerprint({
    kind: "ingest-evidence.package",
    csvFingerprint: manifest.csv.fingerprint,
    jsonlFingerprint: manifest.jsonl.fingerprint,
    manifestFingerprint: manifest.fingerprint,
    version: INGEST_EVIDENCE_FORMAT_VERSION,
  });

  return readOnlyClone({
    kind: "ingest-evidence.package",
    version: INGEST_EVIDENCE_FORMAT_VERSION,
    manifest,
    jsonl,
    csv,
    fingerprint,
  });
}

export function fingerprintIngestEvidence(value: unknown): string {
  return normalizeIngestEvidence(value).fingerprint;
}

export function fingerprintIngestEvidenceValue(value: unknown): string {
  return createFingerprint(value);
}

export function serializeDeterministicJson(value: unknown): string {
  return stringifyStable(value, "", new WeakSet<object>());
}

function createManifestFromNormalized(
  evidence: NormalizedIngestEvidence,
  options: IngestEvidencePackageOptions,
): IngestEvidenceManifest {
  const createdAt = options.createdAt === undefined
    ? DEFAULT_PACKAGE_CREATED_AT
    : readTimestamp(options.createdAt, "options.createdAt");
  const jsonl = renderJsonlFromRecords(evidence.records);
  const csv = renderCsvFromRecords(evidence.records);
  const recordTypes = RECORD_TYPE_ORDER.filter((recordType) => (
    evidence.records.some((record) => record.recordType === recordType)
  ));
  const packageSummary = {
    createdAt,
    csvFingerprint: createFingerprint(csv),
    evidenceFingerprint: evidence.fingerprint,
    jsonlFingerprint: createFingerprint(jsonl),
    recordCount: evidence.records.length,
    recordTypes,
    version: INGEST_EVIDENCE_FORMAT_VERSION,
  };
  const packageId = options.packageId === undefined
    ? `ingevid_${createFingerprint(packageSummary).slice("fnv1a64:".length)}`
    : requireCleanString(options.packageId, "options.packageId", evidenceError);
  const manifestWithoutFingerprint = {
    kind: "ingest-evidence.manifest",
    version: INGEST_EVIDENCE_FORMAT_VERSION,
    packageId,
    createdAt,
    evidence: {
      schemaVersion: evidence.schemaVersion,
      generatedAt: evidence.generatedAt,
      workspaceId: evidence.workspaceId,
      sessionId: evidence.sessionId,
      localOnly: evidence.localOnly,
      fingerprint: evidence.fingerprint,
    },
    recordCount: evidence.records.length,
    recordTypes,
    sourceChecksums: evidence.sourceChecksums,
    recordFingerprints: evidence.records.map((record) => record.fingerprint),
    evidenceFiles: evidence.records
      .filter((record) => record.recordType === "evidenceFile")
      .map((record) => ({
        id: record.recordId,
        fixturePath: record.fixturePath ?? "",
        sha256: record.checksum ?? "",
        schemaVersion: typeof record.payload.schemaVersion === "string"
          ? record.payload.schemaVersion
          : null,
        fingerprint: record.fingerprint,
      })),
    jsonl: {
      fingerprint: createFingerprint(jsonl),
      mediaType: "application/jsonl",
      bytes: countUtf8Bytes(jsonl),
      lines: evidence.records.length,
    },
    csv: {
      fingerprint: createFingerprint(csv),
      mediaType: "text/csv",
      bytes: countUtf8Bytes(csv),
      rows: evidence.records.length,
      columns: CSV_COLUMNS,
    },
  } satisfies Omit<IngestEvidenceManifest, "fingerprint">;
  const fingerprint = createFingerprint({
    kind: "ingest-evidence.manifest",
    manifest: manifestWithoutFingerprint,
  });

  return readOnlyClone({
    ...manifestWithoutFingerprint,
    fingerprint,
  });
}

function readEvidenceFileRecord(value: unknown, index: number): NormalizedIngestEvidenceRecord {
  const path = `evidence.evidenceFiles.${index}`;
  const record = requirePlainRecord(value, path);
  const id = requireCleanString(record.id, `${path}.id`, evidenceError);
  const fixturePath = readLocalFixturePath(record.fixturePath, `${path}.fixturePath`);
  const checksum = readSha256(record.sha256, `${path}.sha256`);
  if (record.schemaVersion !== undefined) {
    requireCleanString(record.schemaVersion, `${path}.schemaVersion`, evidenceError);
  }

  return createRecord(
    "evidenceFile",
    id,
    null,
    fixturePath,
    checksum,
    readJsonObject(record, path),
  );
}

function readSourceSnapshotRecord(value: unknown, index: number): NormalizedIngestEvidenceRecord {
  const path = `evidence.sourceSnapshots.${index}`;
  const record = requirePlainRecord(value, path);
  const sourceUri = readFixtureUri(record.sourceUri, `${path}.sourceUri`);
  const fixturePath = readLocalFixturePath(record.path, `${path}.path`);
  const checksum = readSha256(record.checksum, `${path}.checksum`);

  requireCleanString(record.mediaType, `${path}.mediaType`, evidenceError);
  requireCleanString(record.repositoryState, `${path}.repositoryState`, evidenceError);
  validateStringArray(record.logEntryIds, `${path}.logEntryIds`, requireCleanStringOnly);
  validateStringArray(record.indexDocumentIds, `${path}.indexDocumentIds`, requireCleanStringOnly);
  validateStringArray(record.quarantineItemIds, `${path}.quarantineItemIds`, requireCleanStringOnly);

  return createRecord(
    "sourceSnapshot",
    sourceUri,
    sourceUri,
    fixturePath,
    checksum,
    readJsonObject(record, path),
  );
}

function readCitationEvidenceRecord(value: unknown, index: number): NormalizedIngestEvidenceRecord {
  const path = `evidence.citationEvidence.${index}`;
  const record = requirePlainRecord(value, path);
  const id = requireCleanString(record.id, `${path}.id`, evidenceError);
  const sourceUri = readFixtureUri(record.sourceUri, `${path}.sourceUri`);
  const checksum = readSha256(record.checksum, `${path}.checksum`);

  requireCleanString(record.kind, `${path}.kind`, evidenceError);
  requirePlainRecord(record.range, `${path}.range`);
  readBoolean(record.trusted, `${path}.trusted`);
  if (record.documentId !== undefined) {
    requireCleanString(record.documentId, `${path}.documentId`, evidenceError);
  }
  if (record.quarantineItemId !== undefined) {
    requireCleanString(record.quarantineItemId, `${path}.quarantineItemId`, evidenceError);
  }

  return createRecord(
    "citationEvidence",
    id,
    sourceUri,
    null,
    checksum,
    readJsonObject(record, path),
  );
}

function readQuarantineDecisionRecord(value: unknown, index: number): NormalizedIngestEvidenceRecord {
  const path = `evidence.quarantineDecisions.${index}`;
  const record = requirePlainRecord(value, path);
  const id = requireCleanString(record.decisionId, `${path}.decisionId`, evidenceError);
  const sourceUri = readFixtureUri(record.sourceUri, `${path}.sourceUri`);
  const checksum = readSha256(record.checksum, `${path}.checksum`);

  requireCleanString(record.requestId, `${path}.requestId`, evidenceError);
  requireCleanString(record.itemId, `${path}.itemId`, evidenceError);
  requireCleanString(record.fromState, `${path}.fromState`, evidenceError);
  requireCleanString(record.toState, `${path}.toState`, evidenceError);
  requireCleanString(record.actorId, `${path}.actorId`, evidenceError);
  requireCleanString(record.action, `${path}.action`, evidenceError);
  requireCleanString(record.reason, `${path}.reason`, evidenceError);
  readTimestamp(record.decidedAt, `${path}.decidedAt`);
  readBoolean(record.override, `${path}.override`);

  return createRecord(
    "quarantineDecision",
    id,
    sourceUri,
    null,
    checksum,
    readJsonObject(record, path),
  );
}

function readApiRequestTraceRecord(value: unknown, index: number): NormalizedIngestEvidenceRecord {
  const path = `evidence.apiRequestTrace.${index}`;
  const record = requirePlainRecord(value, path);
  const id = requireCleanString(record.requestId, `${path}.requestId`, evidenceError);

  requireCleanString(record.fixtureFileId, `${path}.fixtureFileId`, evidenceError);
  requireCleanString(record.method, `${path}.method`, evidenceError);
  requireCleanString(record.path, `${path}.path`, evidenceError);
  readHttpStatus(record.responseStatus, `${path}.responseStatus`);
  validateStringArray(record.sourceUris, `${path}.sourceUris`, readFixtureUri);
  validateStringArray(record.checksums, `${path}.checksums`, readSha256);
  validateOptionalStringArray(record.documentIds, `${path}.documentIds`);
  validateOptionalStringArray(record.quarantineItemIds, `${path}.quarantineItemIds`);

  const sourceUris = readStringArray(record.sourceUris, `${path}.sourceUris`, readFixtureUri);
  const checksums = readStringArray(record.checksums, `${path}.checksums`, readSha256);

  return createRecord(
    "apiRequestTrace",
    id,
    sourceUris[0] ?? null,
    null,
    checksums[0] ?? null,
    readJsonObject(record, path),
  );
}

function readClientSessionTraceRecord(value: unknown, index: number): NormalizedIngestEvidenceRecord {
  const path = `evidence.clientSessionTrace.${index}`;
  const record = requirePlainRecord(value, path);
  const id = requireCleanString(record.traceId, `${path}.traceId`, evidenceError);

  requireCleanString(record.fixtureFileId, `${path}.fixtureFileId`, evidenceError);
  requireCleanString(record.kind, `${path}.kind`, evidenceError);
  if (record.method !== undefined) {
    requireCleanString(record.method, `${path}.method`, evidenceError);
  }
  if (record.routePath !== undefined) {
    requireCleanString(record.routePath, `${path}.routePath`, evidenceError);
  }
  if (record.command !== undefined) {
    requireCleanString(record.command, `${path}.command`, evidenceError);
  }
  validateStringArray(record.relatedRequestIds, `${path}.relatedRequestIds`, requireCleanStringOnly);
  validateStringArray(record.sourceUris, `${path}.sourceUris`, readFixtureUri);
  validateOptionalStringArray(record.documentIds, `${path}.documentIds`);
  validateOptionalStringArray(record.quarantineItemIds, `${path}.quarantineItemIds`);

  const sourceUris = readStringArray(record.sourceUris, `${path}.sourceUris`, readFixtureUri);

  return createRecord(
    "clientSessionTrace",
    id,
    sourceUris[0] ?? null,
    null,
    null,
    readJsonObject(record, path),
  );
}

function createRecord(
  recordType: IngestEvidenceRecordType,
  recordId: string,
  sourceUri: string | null,
  fixturePath: string | null,
  checksum: string | null,
  payload: JsonObject,
): NormalizedIngestEvidenceRecord {
  const recordWithoutFingerprint = {
    kind: "ingest-evidence.record",
    version: INGEST_EVIDENCE_FORMAT_VERSION,
    recordType,
    recordId,
    sourceUri,
    fixturePath,
    checksum,
    payload,
  } satisfies Omit<NormalizedIngestEvidenceRecord, "fingerprint">;
  const fingerprint = createFingerprint({
    kind: "ingest-evidence.record",
    record: recordWithoutFingerprint,
  });

  return {
    ...recordWithoutFingerprint,
    fingerprint,
  };
}

function renderJsonlFromRecords(records: readonly NormalizedIngestEvidenceRecord[]): string {
  return [...records]
    .sort(compareRecords)
    .map((record) => serializeDeterministicJson(record))
    .join("\n");
}

function renderCsvFromRecords(records: readonly NormalizedIngestEvidenceRecord[]): string {
  const rows = [...records].sort(compareRecords).map((record) => (
    CSV_COLUMNS.map((column) => formatCsvCell(readCsvColumn(record, column))).join(",")
  ));

  return [
    CSV_COLUMNS.join(","),
    ...rows,
  ].join("\n");
}

function readCsvColumn(record: NormalizedIngestEvidenceRecord, column: string): string {
  switch (column) {
    case "recordType":
      return record.recordType;
    case "recordId":
      return record.recordId;
    case "sourceUri":
      return record.sourceUri ?? "";
    case "fixturePath":
      return record.fixturePath ?? "";
    case "checksum":
      return record.checksum ?? "";
    case "payload":
      return serializeDeterministicJson(record.payload);
    case "fingerprint":
      return record.fingerprint;
    default:
      throw serializationError("unknown CSV column", column);
  }
}

function readEvidenceSummary(value: unknown): JsonObject {
  const record = requirePlainRecord(value, "evidence.evidenceSummary");
  const output: Record<string, JsonValue> = {};

  for (const [key, nested] of Object.entries(record).sort(([left], [right]) => compareStrings(left, right))) {
    output[key] = readNonnegativeInteger(nested, `evidence.evidenceSummary.${key}`);
  }

  return readOnlyClone(output) as JsonObject;
}

function assertSummaryCount(summary: JsonObject, key: string, expected: number): void {
  if (summary[key] !== expected) {
    throw evidenceError("evidence summary count does not match evidence records", {
      expected,
      path: `evidence.evidenceSummary.${key}`,
      value: summary[key],
    });
  }
}

function assertUniqueRecords(records: readonly NormalizedIngestEvidenceRecord[]): void {
  const seen = new Set<string>();
  for (const record of records) {
    const key = `${record.recordType}:${record.recordId}`;
    if (seen.has(key)) {
      throw evidenceError("audit evidence records must be unique by type and id", {
        recordId: record.recordId,
        recordType: record.recordType,
      });
    }
    seen.add(key);
  }
}

function readJsonObject(value: unknown, path: string): JsonObject {
  if (!isPlainRecord(value)) {
    throw evidenceError("value must be a plain JSON object", { path });
  }

  try {
    return readOnlyClone(redactJsonValue(value, path, "", false)) as JsonObject;
  } catch (cause) {
    if (cause instanceof IngestEvidenceError) {
      throw cause;
    }
    throw evidenceError("value must be JSON-compatible", { cause, path });
  }
}

function redactJsonValue(
  value: unknown,
  path: string,
  key: string,
  redactBecauseKey: boolean,
): JsonValue {
  if (redactBecauseKey) {
    return INGEST_EVIDENCE_REDACTION;
  }

  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    return redactStringValue(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw serializationError("numbers must be finite", path);
    }
    return value;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    const values = value.map((item, index) => (
      redactJsonValue(item, formatArrayPath(path, index), key, false)
    ));
    if (SORTED_STRING_ARRAY_KEYS.has(key) && values.every((item) => typeof item === "string")) {
      return [...values].sort(compareStrings);
    }
    return values;
  }

  if (isRecord(value)) {
    if (!isPlainRecord(value)) {
      throw serializationError("objects must be plain records", path);
    }

    const output: Record<string, JsonValue> = {};
    for (const [nestedKey, nested] of Object.entries(value).sort(([left], [right]) => compareStrings(left, right))) {
      if (nested === undefined) {
        continue;
      }
      const nestedPath = path.length === 0 ? nestedKey : `${path}.${nestedKey}`;
      output[nestedKey] = redactJsonValue(
        nested,
        nestedPath,
        nestedKey,
        isSensitiveKey(nestedKey),
      );
    }
    return output;
  }

  throw serializationError("value must be JSON-compatible", path);
}

function redactFieldValue(key: string, value: JsonValue): JsonValue {
  return isSensitiveKey(key) ? INGEST_EVIDENCE_REDACTION : value;
}

function redactStringValue(value: string): string {
  return isSecretShapedString(value) ? INGEST_EVIDENCE_REDACTION : value;
}

function validateStringArray(
  value: unknown,
  path: string,
  readItem: (value: unknown, path: string) => string,
): void {
  readStringArray(value, path, readItem);
}

function validateOptionalStringArray(value: unknown, path: string): void {
  if (value === undefined) {
    return;
  }
  validateStringArray(value, path, requireCleanStringOnly);
}

function readStringArray(
  value: unknown,
  path: string,
  readItem: (value: unknown, path: string) => string,
): readonly string[] {
  const items = readRequiredArray(value, path).map((item, index) => readItem(item, `${path}.${index}`));
  return uniqueSorted(items);
}

function readRequiredArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw evidenceError("value must be an array", { path });
  }
  return value;
}

function requirePlainRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isPlainRecord(value)) {
    throw evidenceError("value must be a plain object", { path });
  }
  return value;
}

function readLocalOnly(value: unknown): true {
  if (value !== true) {
    throw evidenceError("audit evidence must be explicitly local-only", {
      path: "evidence.localOnly",
      value,
    });
  }
  return true;
}

function readFixtureUri(value: unknown, path: string): string {
  const uri = requireCleanString(value, path, evidenceError);
  if (!/^fixture:\/\/[A-Za-z0-9._~/-]+$/.test(uri) || uri.includes("..")) {
    throw evidenceError("sourceUri must use a local fixture URI", { path, value: uri });
  }
  return uri;
}

function readLocalFixturePath(value: unknown, path: string): string {
  const rawPath = requireCleanString(value, path, evidenceError);
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(rawPath) || /^[A-Za-z]:[\\/]/.test(rawPath)) {
    throw evidenceError("fixture path must be a relative local path", { path, value: rawPath });
  }
  const normalized = rawPath.replaceAll("\\", "/");
  if (normalized.startsWith("/") || normalized.startsWith("//")) {
    throw evidenceError("fixture path must be a relative local path", { path, value: rawPath });
  }
  const segments = normalized.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw evidenceError("fixture path must not contain empty or traversal segments", {
      path,
      value: rawPath,
    });
  }
  return normalized;
}

function readSha256(value: unknown, path: string): string {
  const checksum = requireCleanString(value, path, evidenceError).toLowerCase();
  if (!SHA256_PATTERN.test(checksum)) {
    throw evidenceError("checksum must be a lowercase sha256 hex digest", {
      path,
      value,
    });
  }
  return checksum;
}

function readHttpStatus(value: unknown, path: string): number {
  const status = readNonnegativeInteger(value, path);
  if (status < 100 || status > 599) {
    throw evidenceError("response status must be an HTTP status code", { path, value });
  }
  return status;
}

function readNonnegativeInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw evidenceError("value must be a non-negative integer", { path, value });
  }
  return value;
}

function readBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw evidenceError("value must be a boolean", { path, value });
  }
  return value;
}

function readTimestamp(value: unknown, path: string): string {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) {
      throw evidenceError("value must be an ISO-compatible timestamp", { path });
    }
    return value.toISOString();
  }

  const timestamp = requireCleanString(value, path, evidenceError);
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    throw evidenceError("value must be an ISO-compatible timestamp", { path, value });
  }
  return new Date(parsed).toISOString();
}

function requireCleanStringOnly(value: unknown, path: string): string {
  return requireCleanString(value, path, evidenceError);
}

function requireCleanString(
  value: unknown,
  path: string,
  createError: ErrorFactory,
): string {
  if (typeof value !== "string" || value.trim().length === 0 || value !== value.trim()) {
    throw createError(
      "value must be a non-empty string without surrounding whitespace",
      { path, value },
    );
  }
  return value;
}

function formatCsvCell(value: string): string {
  if (!/[",\r\n]/.test(value)) {
    return value;
  }
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function createFingerprint(value: unknown): string {
  const serialized = serializeDeterministicJson(value);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;

  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= BigInt(serialized.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }

  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

function stringifyStable(value: unknown, path: string, seen: WeakSet<object>): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw serializationError("numbers must be finite", path);
    }
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw serializationError("values must not contain circular references", path);
    }
    seen.add(value);
    const serialized = `[${value
      .map((item, index) => stringifyStable(item, formatArrayPath(path, index), seen))
      .join(",")}]`;
    seen.delete(value);
    return serialized;
  }

  if (isRecord(value)) {
    if (!isPlainRecord(value)) {
      throw serializationError("objects must be plain records", path);
    }

    if (seen.has(value)) {
      throw serializationError("values must not contain circular references", path);
    }
    seen.add(value);

    const entries = Object.entries(value)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => compareStrings(left, right))
      .map(([key, nested]) => {
        const nestedPath = path.length === 0 ? key : `${path}.${key}`;
        return `${JSON.stringify(key)}:${stringifyStable(nested, nestedPath, seen)}`;
      });

    seen.delete(value);
    return `{${entries.join(",")}}`;
  }

  throw serializationError("value must be JSON-compatible", path);
}

function isSensitiveKey(key: string): boolean {
  const normalized = key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toLowerCase();

  return [
    "api_key",
    "access_key",
    "auth",
    "authorization",
    "bearer",
    "client_secret",
    "cookie",
    "credential",
    "jwt",
    "passphrase",
    "password",
    "private_key",
    "refresh_token",
    "secret",
    "session",
    "signing_key",
    "token",
  ].some((part) => (
    normalized === part ||
    normalized.startsWith(`${part}_`) ||
    normalized.endsWith(`_${part}`) ||
    normalized.includes(`_${part}_`)
  ));
}

function isSecretShapedString(value: string): boolean {
  const trimmed = value.trim();
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(trimmed)) {
    return true;
  }
  if (/^Bearer\s+[A-Za-z0-9._~+/=-]{8,}$/i.test(trimmed)) {
    return true;
  }
  if (/^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/.test(trimmed)) {
    return true;
  }
  if (/^(?:sk|rk|pat|npm)_[A-Za-z0-9_-]{12,}$/.test(trimmed)) {
    return true;
  }
  if (/^(?:sk|rk|pat|glpat|github_pat)-[A-Za-z0-9_-]{12,}$/.test(trimmed)) {
    return true;
  }
  if (/(?:api[_-]?key|authorization|password|secret|token)=\S{8,}/i.test(trimmed)) {
    return true;
  }
  return (
    trimmed.length >= 40 &&
    /^[A-Za-z0-9+/=_-]+$/.test(trimmed) &&
    /[a-z]/.test(trimmed) &&
    /[A-Z]/.test(trimmed) &&
    /[0-9]/.test(trimmed)
  );
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort(compareStrings);
}

function countUtf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

function compareRecords(
  left: NormalizedIngestEvidenceRecord,
  right: NormalizedIngestEvidenceRecord,
): number {
  return (
    ((RECORD_TYPE_INDEX.get(left.recordType) ?? Number.MAX_SAFE_INTEGER)
      - (RECORD_TYPE_INDEX.get(right.recordType) ?? Number.MAX_SAFE_INTEGER)) ||
    compareStrings(left.recordId, right.recordId) ||
    compareStrings(left.fingerprint, right.fingerprint)
  );
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function readOnlyClone<T>(value: T): DeepReadonly<T> {
  try {
    return deepFreeze(structuredClone(value)) as DeepReadonly<T>;
  } catch (cause) {
    if (cause instanceof IngestEvidenceError) {
      throw cause;
    }
    throw serializationError("value must be structured-cloneable", "", cause);
  }
}

function deepFreeze<T>(value: T): T {
  if (!isRecord(value) && !Array.isArray(value)) {
    return value;
  }

  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }

  return Object.freeze(value);
}

function serializationError(message: string, path: string, cause?: unknown): IngestEvidenceError {
  return new IngestEvidenceError(
    INGEST_EVIDENCE_ERROR_CODES.SERIALIZATION_INVALID,
    message,
    { cause, details: { path } },
  );
}

type ErrorFactory = (
  message: string,
  details?: Readonly<Record<string, unknown>>,
) => IngestEvidenceValidationError;

function evidenceError(
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): IngestEvidenceValidationError {
  return new IngestEvidenceValidationError(message, { details });
}

function formatArrayPath(path: string, index: number): string {
  return path.length === 0 ? String(index) : `${path}.${index}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
