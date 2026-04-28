import {
  AUDIT_EXPORT_ERROR_CODES,
  AUDIT_EXPORT_FORMAT_VERSION,
  AuditExportError,
  type DeepReadonly,
  type JsonObject,
  type JsonValue,
  redactAuditValue,
  fingerprintAuditExport,
  serializeDeterministicJson,
} from "./index.ts";

export const LOCAL_EVENT_REPLAY_EXPORT_RECORD_KIND =
  "audit-export.local-event-replay.record";
export const LOCAL_EVENT_REPLAY_EXPORT_MANIFEST_KIND =
  "audit-export.local-event-replay.manifest";
export const LOCAL_EVENT_REPLAY_EXPORT_PACKAGE_KIND =
  "audit-export.local-event-replay.package";

export type LocalEventReplayExportRecordType =
  | "canonical_event"
  | "synced_event"
  | "replay_summary";

export interface LocalEventReplayExportRecord {
  readonly kind: typeof LOCAL_EVENT_REPLAY_EXPORT_RECORD_KIND;
  readonly version: number;
  readonly recordId: string;
  readonly recordType: LocalEventReplayExportRecordType;
  readonly workspaceId: string | null;
  readonly deviceId: string | null;
  readonly catalogDigest: string | null;
  readonly eventId: string | null;
  readonly sequence: number | null;
  readonly operation: string | null;
  readonly cursor: string | null;
  readonly timestamp: string | null;
  readonly eventCount: number | null;
  readonly integrityStatus: string | null;
  readonly hasMore: boolean | null;
  readonly metadata: JsonObject;
  readonly fingerprint: string;
}

export interface LocalEventReplayExportFilters {
  readonly workspaceId?: string | readonly string[];
  readonly workspaceIds?: string | readonly string[];
  readonly recordType?: LocalEventReplayExportRecordType | readonly LocalEventReplayExportRecordType[];
  readonly recordTypes?: LocalEventReplayExportRecordType | readonly LocalEventReplayExportRecordType[];
  readonly operation?: string | readonly string[];
  readonly operations?: string | readonly string[];
  readonly catalogDigest?: string | readonly string[];
  readonly catalogDigests?: string | readonly string[];
  readonly from?: string;
  readonly fromTimestamp?: string;
  readonly to?: string;
  readonly toTimestamp?: string;
}

export interface NormalizedLocalEventReplayExportFilters {
  readonly workspaceIds: readonly string[];
  readonly recordTypes: readonly LocalEventReplayExportRecordType[];
  readonly operations: readonly string[];
  readonly catalogDigests: readonly string[];
  readonly fromTimestamp: string | null;
  readonly toTimestamp: string | null;
}

export interface LocalEventReplayExportOptions {
  readonly createdAt?: string;
  readonly exportId?: string;
  readonly filters?: LocalEventReplayExportFilters;
}

export interface LocalEventReplayExportContentDescriptor {
  readonly fingerprint: string;
  readonly mediaType: string;
  readonly bytes: number;
  readonly rows?: number;
  readonly lines?: number;
  readonly columns?: readonly string[];
}

export interface LocalEventReplayExportManifest {
  readonly kind: typeof LOCAL_EVENT_REPLAY_EXPORT_MANIFEST_KIND;
  readonly version: number;
  readonly exportId: string;
  readonly createdAt: string;
  readonly recordCount: number;
  readonly recordTypes: readonly LocalEventReplayExportRecordType[];
  readonly workspaceIds: readonly string[];
  readonly catalogDigests: readonly string[];
  readonly firstTimestamp: string | null;
  readonly lastTimestamp: string | null;
  readonly filters: NormalizedLocalEventReplayExportFilters;
  readonly recordFingerprints: readonly string[];
  readonly jsonl: LocalEventReplayExportContentDescriptor;
  readonly csv: LocalEventReplayExportContentDescriptor;
  readonly fingerprint: string;
}

export interface LocalEventReplayExportPackage {
  readonly kind: typeof LOCAL_EVENT_REPLAY_EXPORT_PACKAGE_KIND;
  readonly version: number;
  readonly manifest: LocalEventReplayExportManifest;
  readonly jsonl: string;
  readonly csv: string;
  readonly fingerprint: string;
}

interface LocalEventReplayContext {
  readonly workspaceId?: string;
  readonly deviceId?: string;
  readonly catalogDigest?: string;
  readonly firstEventDigest?: string;
  readonly lastEventDigest?: string;
}

type LocalEventReplayRecordSeed = Omit<
  LocalEventReplayExportRecord,
  "kind" | "version" | "recordId" | "fingerprint"
>;

const DEFAULT_LOCAL_EVENT_REPLAY_EXPORT_CREATED_AT = "1970-01-01T00:00:00.000Z";
const LOCAL_EVENT_REPLAY_CSV_COLUMNS = Object.freeze([
  "recordId",
  "recordType",
  "workspaceId",
  "deviceId",
  "catalogDigest",
  "eventId",
  "sequence",
  "operation",
  "cursor",
  "timestamp",
  "eventCount",
  "integrityStatus",
  "hasMore",
  "metadata",
  "fingerprint",
]);
const LOCAL_EVENT_REPLAY_RECORD_TYPES = Object.freeze([
  "canonical_event",
  "synced_event",
  "replay_summary",
] satisfies readonly LocalEventReplayExportRecordType[]);
const CSV_FORMULA_PREFIX_PATTERN = /^[=+\-@\t\r]/;

export function normalizeLocalEventReplayExportRecords(
  input: unknown,
): readonly DeepReadonly<LocalEventReplayExportRecord>[] {
  const records = expandLocalEventReplayInput(input, {})
    .sort(compareLocalEventReplayRecords);
  const recordIds = new Set<string>();

  for (const record of records) {
    if (recordIds.has(record.recordId)) {
      throw localEventReplayError("local replay export record ids must be unique", {
        recordId: record.recordId,
      });
    }
    recordIds.add(record.recordId);
  }

  return readOnlyClone(records);
}

export function filterLocalEventReplayExportRecords(
  input: unknown,
  filters: LocalEventReplayExportFilters = {},
): readonly DeepReadonly<LocalEventReplayExportRecord>[] {
  const normalizedFilters = normalizeLocalEventReplayExportFilters(filters);

  return readOnlyClone(
    normalizeLocalEventReplayExportRecords(input).filter((record) => (
      localEventReplayRecordMatchesFilters(record, normalizedFilters)
    )),
  );
}

export function renderLocalEventReplayJsonl(
  input: unknown,
  filters: LocalEventReplayExportFilters = {},
): string {
  return filterLocalEventReplayExportRecords(input, filters)
    .map((record) => serializeDeterministicJson(record))
    .join("\n");
}

export function renderLocalEventReplayCsv(
  input: unknown,
  filters: LocalEventReplayExportFilters = {},
): string {
  const rows = filterLocalEventReplayExportRecords(input, filters).map((record) => (
    LOCAL_EVENT_REPLAY_CSV_COLUMNS.map((column) => (
      formatCsvCell(readLocalEventReplayCsvColumn(record, column))
    )).join(",")
  ));

  return [
    LOCAL_EVENT_REPLAY_CSV_COLUMNS.join(","),
    ...rows,
  ].join("\n");
}

export function createLocalEventReplayExportManifest(
  input: unknown,
  options: LocalEventReplayExportOptions = {},
): LocalEventReplayExportManifest {
  const createdAt = options.createdAt === undefined
    ? DEFAULT_LOCAL_EVENT_REPLAY_EXPORT_CREATED_AT
    : readTimestamp(options.createdAt, "options.createdAt", localEventReplayError);
  const filters = normalizeLocalEventReplayExportFilters(options.filters ?? {});
  const records = filterLocalEventReplayExportRecords(input, filters);
  const jsonl = renderLocalEventReplayJsonl(records);
  const csv = renderLocalEventReplayCsv(records);
  const timestamps = records
    .map((record) => record.timestamp)
    .filter((timestamp): timestamp is string => timestamp !== null)
    .sort(compareStrings);
  const summary = {
    catalogDigests: uniqueSortedNullable(records.map((record) => record.catalogDigest)),
    createdAt,
    firstTimestamp: timestamps[0] ?? null,
    lastTimestamp: timestamps.at(-1) ?? null,
    recordCount: records.length,
    recordFingerprints: records.map((record) => record.fingerprint),
    recordTypes: uniqueSorted(records.map((record) => record.recordType)),
    version: AUDIT_EXPORT_FORMAT_VERSION,
    workspaceIds: uniqueSortedNullable(records.map((record) => record.workspaceId)),
  };
  const exportId = options.exportId === undefined
    ? `local_replay_${fingerprintAuditExport(summary).slice("fnv1a64:".length)}`
    : requireCleanString(options.exportId, "options.exportId", localEventReplayError);
  const manifestWithoutFingerprint = {
    kind: LOCAL_EVENT_REPLAY_EXPORT_MANIFEST_KIND,
    version: AUDIT_EXPORT_FORMAT_VERSION,
    exportId,
    createdAt,
    recordCount: records.length,
    recordTypes: summary.recordTypes,
    workspaceIds: summary.workspaceIds,
    catalogDigests: summary.catalogDigests,
    firstTimestamp: summary.firstTimestamp,
    lastTimestamp: summary.lastTimestamp,
    filters,
    recordFingerprints: records.map((record) => record.fingerprint),
    jsonl: {
      fingerprint: fingerprintAuditExport(jsonl),
      mediaType: "application/jsonl",
      bytes: countUtf8Bytes(jsonl),
      lines: records.length,
    },
    csv: {
      fingerprint: fingerprintAuditExport(csv),
      mediaType: "text/csv",
      bytes: countUtf8Bytes(csv),
      rows: records.length,
      columns: LOCAL_EVENT_REPLAY_CSV_COLUMNS,
    },
  } satisfies Omit<LocalEventReplayExportManifest, "fingerprint">;
  const fingerprint = fingerprintAuditExport({
    kind: LOCAL_EVENT_REPLAY_EXPORT_MANIFEST_KIND,
    manifest: manifestWithoutFingerprint,
  });

  return readOnlyClone({
    ...manifestWithoutFingerprint,
    fingerprint,
  });
}

export function createLocalEventReplayExportPackage(
  input: unknown,
  options: LocalEventReplayExportOptions = {},
): LocalEventReplayExportPackage {
  const filters = options.filters ?? {};
  const jsonl = renderLocalEventReplayJsonl(input, filters);
  const csv = renderLocalEventReplayCsv(input, filters);
  const manifest = createLocalEventReplayExportManifest(input, options);
  const fingerprint = fingerprintAuditExport({
    kind: LOCAL_EVENT_REPLAY_EXPORT_PACKAGE_KIND,
    csvFingerprint: manifest.csv.fingerprint,
    jsonlFingerprint: manifest.jsonl.fingerprint,
    manifestFingerprint: manifest.fingerprint,
    version: AUDIT_EXPORT_FORMAT_VERSION,
  });

  return readOnlyClone({
    kind: LOCAL_EVENT_REPLAY_EXPORT_PACKAGE_KIND,
    version: AUDIT_EXPORT_FORMAT_VERSION,
    manifest,
    jsonl,
    csv,
    fingerprint,
  });
}

export function fingerprintLocalEventReplayExportRecord(input: unknown): string {
  const records = normalizeLocalEventReplayExportRecords(input);
  if (records.length !== 1) {
    throw localEventReplayError("input must normalize to exactly one local replay export record", {
      recordCount: records.length,
    });
  }
  return records[0].fingerprint;
}

function expandLocalEventReplayInput(
  input: unknown,
  context: LocalEventReplayContext,
): LocalEventReplayExportRecord[] {
  if (Array.isArray(input)) {
    return input.flatMap((item) => expandLocalEventReplayInput(item, context));
  }

  const record = requirePlainRecord(input, "localReplay");
  const nextContext = mergeContext(context, contextFromReplayRecord(record));
  const output: LocalEventReplayExportRecord[] = [];

  if (isLocalEventReplayExportRecord(record)) {
    return [createLocalEventReplayRecord({
      recordType: record.recordType as LocalEventReplayExportRecordType,
      workspaceId: readOptionalString(record.workspaceId, undefined, "localReplay.workspaceId"),
      deviceId: readOptionalString(record.deviceId, undefined, "localReplay.deviceId"),
      catalogDigest: readOptionalString(record.catalogDigest, undefined, "localReplay.catalogDigest"),
      eventId: readOptionalString(record.eventId, undefined, "localReplay.eventId"),
      sequence: readNullableSequence(record.sequence, "localReplay.sequence"),
      operation: readOptionalString(record.operation, undefined, "localReplay.operation"),
      cursor: readOptionalString(record.cursor, undefined, "localReplay.cursor"),
      timestamp: record.timestamp === null
        ? null
        : readTimestamp(record.timestamp, "localReplay.timestamp", localEventReplayError),
      eventCount: readNullableCount(record.eventCount, "localReplay.eventCount"),
      integrityStatus: readOptionalString(
        record.integrityStatus,
        undefined,
        "localReplay.integrityStatus",
      ),
      hasMore: typeof record.hasMore === "boolean" ? record.hasMore : null,
      metadata: redactMetadata(record.metadata),
    })];
  }

  if (isReplaySummaryRecord(record)) {
    output.push(createReplaySummaryRecord(record, nextContext));
    return output;
  }

  if (isCanonicalReplayEventRecord(record)) {
    output.push(createCanonicalReplayEventRecord(record, nextContext));
    return output;
  }

  if (isSyncedReplayEventRecord(record)) {
    output.push(createSyncedReplayEventRecord(record, nextContext));
    return output;
  }

  if (isPlainRecord(record.summary)) {
    output.push(createReplaySummaryRecord(record.summary, nextContext));
  }

  if (Array.isArray(record.events)) {
    for (const event of record.events) {
      output.push(...expandLocalEventReplayInput(event, nextContext));
    }
  }

  if (output.length > 0) {
    return output;
  }

  throw localEventReplayError("value is not a canonical local replay record, summary, or catalog", {
    keys: Object.keys(record).sort(compareStrings),
  });
}

function createCanonicalReplayEventRecord(
  event: Record<string, unknown>,
  context: LocalEventReplayContext,
): LocalEventReplayExportRecord {
  const eventId = requireCleanString(event.id, "localReplay.id", localEventReplayError);
  const sequence = readNullableSequence(event.sequence, "localReplay.sequence");
  const recordedAt = readTimestamp(event.recordedAt, "localReplay.recordedAt", localEventReplayError);
  const workspaceId = readOptionalString(event.workspaceId, context.workspaceId, "localReplay.workspaceId");
  const operation = requireCleanString(event.operation, "localReplay.operation", localEventReplayError);

  return createLocalEventReplayRecord({
    recordType: "canonical_event",
    workspaceId,
    deviceId: readOptionalString(undefined, context.deviceId, "localReplay.deviceId"),
    catalogDigest: readOptionalString(undefined, context.catalogDigest, "localReplay.catalogDigest"),
    eventId,
    sequence,
    operation,
    cursor: null,
    timestamp: recordedAt,
    eventCount: null,
    integrityStatus: null,
    hasMore: null,
    metadata: redactMetadata({
      actorId: event.actorId,
      localOnly: event.localOnly,
      occurredAt: event.occurredAt,
      payload: event.payload,
      payloadDigest: event.payloadDigest,
      previousDigest: event.previousDigest,
      redactionMetadata: event.redactionMetadata,
      schemaVersion: event.schemaVersion,
    }),
  });
}

function createSyncedReplayEventRecord(
  event: Record<string, unknown>,
  context: LocalEventReplayContext,
): LocalEventReplayExportRecord {
  const payload = requirePlainRecord(event.payload, "localReplay.payload");
  const eventId = requireCleanString(event.id, "localReplay.id", localEventReplayError);
  const type = requireCleanString(event.type, "localReplay.type", localEventReplayError);
  const operation = typeof payload.operation === "string"
    ? payload.operation
    : type.startsWith("canonical.")
      ? type.slice("canonical.".length)
      : type;

  return createLocalEventReplayRecord({
    recordType: "synced_event",
    workspaceId: readOptionalString(event.workspaceId, context.workspaceId, "localReplay.workspaceId"),
    deviceId: readOptionalString(event.deviceId, context.deviceId, "localReplay.deviceId"),
    catalogDigest: readOptionalString(undefined, context.catalogDigest, "localReplay.catalogDigest"),
    eventId,
    sequence: readNullableSequence(event.sequence, "localReplay.sequence"),
    operation,
    cursor: readOptionalString(event.cursor, undefined, "localReplay.cursor"),
    timestamp: readTimestamp(event.createdAt, "localReplay.createdAt", localEventReplayError),
    eventCount: null,
    integrityStatus: null,
    hasMore: null,
    metadata: redactMetadata({
      createdAt: event.createdAt,
      cursor: event.cursor,
      payload,
      type,
    }),
  });
}

function createReplaySummaryRecord(
  summary: Record<string, unknown>,
  context: LocalEventReplayContext,
): LocalEventReplayExportRecord {
  const integrity = isPlainRecord(summary.integrity) ? summary.integrity : undefined;
  const catalogDigest = readOptionalString(summary.digest, context.catalogDigest, "localReplay.digest");

  return createLocalEventReplayRecord({
    recordType: "replay_summary",
    workspaceId: readOptionalString(summary.workspaceId, context.workspaceId, "localReplay.workspaceId"),
    deviceId: readOptionalString(undefined, context.deviceId, "localReplay.deviceId"),
    catalogDigest,
    eventId: null,
    sequence: null,
    operation: null,
    cursor: readOptionalString(summary.nextCursor, undefined, "localReplay.nextCursor"),
    timestamp: null,
    eventCount: readNullableCount(summary.eventCount, "localReplay.eventCount"),
    integrityStatus: readOptionalString(integrity?.status, undefined, "localReplay.integrity.status"),
    hasMore: typeof summary.hasMore === "boolean" ? summary.hasMore : null,
    metadata: redactMetadata({
      afterCursor: summary.afterCursor,
      digest: catalogDigest,
      events: summary.events,
      firstEventDigest: summary.firstEventDigest ?? context.firstEventDigest,
      integrity: summary.integrity,
      issues: summary.issues,
      lastEventDigest: summary.lastEventDigest ?? context.lastEventDigest,
      nextCursor: summary.nextCursor,
      untilCursor: summary.untilCursor,
    }),
  });
}

function createLocalEventReplayRecord(
  seed: LocalEventReplayRecordSeed,
): LocalEventReplayExportRecord {
  const recordId = `lrer_${fingerprintAuditExport({
    kind: "audit-export.local-event-replay.record-id",
    record: seed,
  }).slice("fnv1a64:".length)}`;
  const recordWithoutFingerprint = {
    kind: LOCAL_EVENT_REPLAY_EXPORT_RECORD_KIND,
    version: AUDIT_EXPORT_FORMAT_VERSION,
    recordId,
    ...seed,
  } satisfies Omit<LocalEventReplayExportRecord, "fingerprint">;
  const fingerprint = fingerprintAuditExport({
    kind: LOCAL_EVENT_REPLAY_EXPORT_RECORD_KIND,
    record: recordWithoutFingerprint,
  });

  return {
    ...recordWithoutFingerprint,
    fingerprint,
  };
}

function contextFromReplayRecord(record: Record<string, unknown>): LocalEventReplayContext {
  return {
    workspaceId: readOptionalContextString(record.workspaceId),
    deviceId: readOptionalContextString(record.deviceId),
    catalogDigest: readOptionalContextString(record.digest),
    firstEventDigest: readOptionalContextString(record.firstEventDigest),
    lastEventDigest: readOptionalContextString(record.lastEventDigest),
  };
}

function mergeContext(
  left: LocalEventReplayContext,
  right: LocalEventReplayContext,
): LocalEventReplayContext {
  return {
    workspaceId: right.workspaceId ?? left.workspaceId,
    deviceId: right.deviceId ?? left.deviceId,
    catalogDigest: right.catalogDigest ?? left.catalogDigest,
    firstEventDigest: right.firstEventDigest ?? left.firstEventDigest,
    lastEventDigest: right.lastEventDigest ?? left.lastEventDigest,
  };
}

function normalizeLocalEventReplayExportFilters(
  filters: LocalEventReplayExportFilters,
): NormalizedLocalEventReplayExportFilters {
  if (!isPlainRecord(filters)) {
    throw localEventReplayFilterError("local replay filters must be a plain object", {
      path: "filters",
    });
  }

  const fromTimestamp = filters.fromTimestamp ?? filters.from;
  const toTimestamp = filters.toTimestamp ?? filters.to;
  const normalized = {
    workspaceIds: readFilterList(filters.workspaceId ?? filters.workspaceIds, "filters.workspaceId"),
    recordTypes: readRecordTypeFilterList(
      filters.recordType ?? filters.recordTypes,
      "filters.recordType",
    ),
    operations: readFilterList(filters.operation ?? filters.operations, "filters.operation"),
    catalogDigests: readFilterList(
      filters.catalogDigest ?? filters.catalogDigests,
      "filters.catalogDigest",
    ),
    fromTimestamp: fromTimestamp === undefined || fromTimestamp === null
      ? null
      : readTimestamp(fromTimestamp, "filters.fromTimestamp", localEventReplayFilterError),
    toTimestamp: toTimestamp === undefined || toTimestamp === null
      ? null
      : readTimestamp(toTimestamp, "filters.toTimestamp", localEventReplayFilterError),
  };

  if (
    normalized.fromTimestamp !== null &&
    normalized.toTimestamp !== null &&
    normalized.fromTimestamp > normalized.toTimestamp
  ) {
    throw localEventReplayFilterError("fromTimestamp must be before or equal to toTimestamp", {
      fromTimestamp: normalized.fromTimestamp,
      toTimestamp: normalized.toTimestamp,
    });
  }

  return readOnlyClone(normalized);
}

function localEventReplayRecordMatchesFilters(
  record: LocalEventReplayExportRecord,
  filters: NormalizedLocalEventReplayExportFilters,
): boolean {
  if (filters.workspaceIds.length > 0 && !filters.workspaceIds.includes(record.workspaceId ?? "")) {
    return false;
  }
  if (filters.recordTypes.length > 0 && !filters.recordTypes.includes(record.recordType)) {
    return false;
  }
  if (filters.operations.length > 0 && !filters.operations.includes(record.operation ?? "")) {
    return false;
  }
  if (filters.catalogDigests.length > 0 && !filters.catalogDigests.includes(record.catalogDigest ?? "")) {
    return false;
  }
  if (
    (filters.fromTimestamp !== null || filters.toTimestamp !== null) &&
    record.timestamp === null
  ) {
    return false;
  }
  if (filters.fromTimestamp !== null && record.timestamp !== null && record.timestamp < filters.fromTimestamp) {
    return false;
  }
  if (filters.toTimestamp !== null && record.timestamp !== null && record.timestamp > filters.toTimestamp) {
    return false;
  }
  return true;
}

function readFilterList(value: unknown, path: string): readonly string[] {
  if (value === undefined || value === null) {
    return [];
  }

  const values = Array.isArray(value) ? value : [value];
  return uniqueSorted(values.map((item, index) => (
    requireCleanString(item, `${path}.${index}`, localEventReplayFilterError)
  )));
}

function readRecordTypeFilterList(
  value: unknown,
  path: string,
): readonly LocalEventReplayExportRecordType[] {
  const values = readFilterList(value, path);
  for (const recordType of values) {
    if (!isLocalEventReplayRecordType(recordType)) {
      throw localEventReplayFilterError("recordType is not supported", {
        path,
        recordType,
      });
    }
  }
  return values as readonly LocalEventReplayExportRecordType[];
}

function readLocalEventReplayCsvColumn(
  record: LocalEventReplayExportRecord,
  column: string,
): string {
  switch (column) {
    case "recordId":
      return record.recordId;
    case "recordType":
      return record.recordType;
    case "workspaceId":
      return record.workspaceId ?? "";
    case "deviceId":
      return record.deviceId ?? "";
    case "catalogDigest":
      return record.catalogDigest ?? "";
    case "eventId":
      return record.eventId ?? "";
    case "sequence":
      return record.sequence === null ? "" : String(record.sequence);
    case "operation":
      return record.operation ?? "";
    case "cursor":
      return record.cursor ?? "";
    case "timestamp":
      return record.timestamp ?? "";
    case "eventCount":
      return record.eventCount === null ? "" : String(record.eventCount);
    case "integrityStatus":
      return record.integrityStatus ?? "";
    case "hasMore":
      return record.hasMore === null ? "" : String(record.hasMore);
    case "metadata":
      return serializeDeterministicJson(escapeCsvJsonFormulaValues(record.metadata));
    case "fingerprint":
      return record.fingerprint;
    default:
      throw serializationError("unknown local replay CSV column", column);
  }
}

function compareLocalEventReplayRecords(
  left: LocalEventReplayExportRecord,
  right: LocalEventReplayExportRecord,
): number {
  return (
    compareStrings(left.workspaceId ?? "", right.workspaceId ?? "") ||
    compareStrings(left.catalogDigest ?? "", right.catalogDigest ?? "") ||
    compareStrings(left.timestamp ?? "", right.timestamp ?? "") ||
    compareStrings(left.recordType, right.recordType) ||
    (left.sequence ?? 0) - (right.sequence ?? 0) ||
    compareStrings(left.eventId ?? "", right.eventId ?? "") ||
    compareStrings(left.recordId, right.recordId)
  );
}

function isReplaySummaryRecord(record: Record<string, unknown>): boolean {
  return (
    typeof record.workspaceId === "string" &&
    typeof record.afterCursor === "string" &&
    typeof record.nextCursor === "string" &&
    Number.isInteger(record.eventCount) &&
    typeof record.hasMore === "boolean" &&
    isPlainRecord(record.integrity) &&
    Array.isArray(record.events) &&
    Array.isArray(record.issues)
  );
}

function isCanonicalReplayEventRecord(record: Record<string, unknown>): boolean {
  return (
    typeof record.schemaVersion === "string" &&
    typeof record.id === "string" &&
    typeof record.workspaceId === "string" &&
    typeof record.actorId === "string" &&
    typeof record.sequence === "number" &&
    typeof record.recordedAt === "string" &&
    typeof record.operation === "string" &&
    Object.hasOwn(record, "payload") &&
    typeof record.payloadDigest === "string" &&
    Object.hasOwn(record, "previousDigest") &&
    isPlainRecord(record.redactionMetadata)
  );
}

function isSyncedReplayEventRecord(record: Record<string, unknown>): boolean {
  return (
    typeof record.id === "string" &&
    typeof record.workspaceId === "string" &&
    typeof record.deviceId === "string" &&
    typeof record.sequence === "number" &&
    typeof record.type === "string" &&
    typeof record.createdAt === "string" &&
    typeof record.cursor === "string" &&
    isPlainRecord(record.payload) &&
    typeof record.payload.schemaVersion === "string" &&
    typeof record.payload.operation === "string"
  );
}

function isLocalEventReplayExportRecord(record: Record<string, unknown>): boolean {
  return (
    record.kind === LOCAL_EVENT_REPLAY_EXPORT_RECORD_KIND &&
    record.version === AUDIT_EXPORT_FORMAT_VERSION &&
    typeof record.recordId === "string" &&
    typeof record.recordType === "string" &&
    isLocalEventReplayRecordType(record.recordType) &&
    (record.workspaceId === null || typeof record.workspaceId === "string") &&
    (record.deviceId === null || typeof record.deviceId === "string") &&
    (record.catalogDigest === null || typeof record.catalogDigest === "string") &&
    (record.eventId === null || typeof record.eventId === "string") &&
    (record.sequence === null || Number.isSafeInteger(record.sequence)) &&
    (record.operation === null || typeof record.operation === "string") &&
    (record.cursor === null || typeof record.cursor === "string") &&
    (record.timestamp === null || typeof record.timestamp === "string") &&
    (record.eventCount === null || Number.isSafeInteger(record.eventCount)) &&
    (record.integrityStatus === null || typeof record.integrityStatus === "string") &&
    (record.hasMore === null || typeof record.hasMore === "boolean") &&
    isPlainRecord(record.metadata) &&
    typeof record.fingerprint === "string"
  );
}

function redactMetadata(value: Record<string, unknown>): JsonObject {
  const redacted = redactAuditValue(value);
  if (!isPlainRecord(redacted)) {
    throw serializationError("redacted metadata must be a JSON object", "metadata");
  }
  return redacted as JsonObject;
}

function readOptionalString(
  value: unknown,
  fallback: string | undefined,
  path: string,
): string | null {
  if (value === undefined || value === null) {
    return fallback ?? null;
  }
  return requireCleanString(value, path, localEventReplayError);
}

function readOptionalContextString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 && value === value.trim()
    ? value
    : undefined;
}

function readNullableSequence(value: unknown, path: string): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw localEventReplayError("sequence must be a positive safe integer", { path, value });
  }
  return value as number;
}

function readNullableCount(value: unknown, path: string): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw localEventReplayError("eventCount must be a non-negative safe integer", { path, value });
  }
  return value as number;
}

function readTimestamp(
  value: unknown,
  path: string,
  createError: ErrorFactory,
): string {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) {
      throw createError("value must be an ISO-compatible timestamp", { path });
    }
    return value.toISOString();
  }

  const timestamp = requireCleanString(value, path, createError);
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    throw createError("value must be an ISO-compatible timestamp", { path, value });
  }
  return new Date(parsed).toISOString();
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

function requirePlainRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isPlainRecord(value)) {
    throw localEventReplayError("value must be a plain object", { path });
  }
  return value;
}

function formatCsvCell(value: string): string {
  const safeValue = escapeCsvFormulaValue(value);
  if (!/[",\r\n]/.test(safeValue)) {
    return safeValue;
  }
  return `"${safeValue.replaceAll("\"", "\"\"")}"`;
}

function escapeCsvFormulaValue(value: string): string {
  return CSV_FORMULA_PREFIX_PATTERN.test(value) ? `'${value}` : value;
}

function escapeCsvJsonFormulaValues(value: JsonValue): JsonValue {
  if (typeof value === "string") {
    return escapeCsvFormulaValue(value);
  }
  if (Array.isArray(value)) {
    return value.map(escapeCsvJsonFormulaValues);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, escapeCsvJsonFormulaValues(nested)]),
    );
  }
  return value;
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort(compareStrings);
}

function uniqueSortedNullable(values: readonly (string | null)[]): readonly string[] {
  return uniqueSorted(values.filter((value): value is string => value !== null));
}

function countUtf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isLocalEventReplayRecordType(
  value: string,
): value is LocalEventReplayExportRecordType {
  return LOCAL_EVENT_REPLAY_RECORD_TYPES.includes(value as LocalEventReplayExportRecordType);
}

function readOnlyClone<T>(value: T): DeepReadonly<T> {
  try {
    return deepFreeze(structuredClone(value)) as DeepReadonly<T>;
  } catch (cause) {
    if (cause instanceof AuditExportError) {
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

function serializationError(message: string, path: string, cause?: unknown): AuditExportError {
  return new AuditExportError(
    AUDIT_EXPORT_ERROR_CODES.SERIALIZATION_INVALID,
    message,
    { cause, details: { path } },
  );
}

type ErrorFactory = (
  message: string,
  details?: Readonly<Record<string, unknown>>,
) => AuditExportError;

function localEventReplayError(
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): AuditExportError {
  return new AuditExportError(AUDIT_EXPORT_ERROR_CODES.INVALID_EVENT, message, { details });
}

function localEventReplayFilterError(
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): AuditExportError {
  return new AuditExportError(AUDIT_EXPORT_ERROR_CODES.INVALID_FILTER, message, { details });
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
