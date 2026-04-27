import type { AuditRecord } from "./client.ts";
import type { WorkspaceDescriptor, WorkspaceEvent } from "./workspace.ts";

export const STORAGE_SCHEMA_VERSION = 1;

export const STORAGE_ERROR_CODES = Object.freeze({
  INVALID_ENVELOPE: "STORAGE_INVALID_ENVELOPE",
  INVALID_JSON: "STORAGE_INVALID_JSON",
  INVALID_PATH: "STORAGE_INVALID_PATH",
  INVALID_VALUE: "STORAGE_INVALID_VALUE",
  MIGRATION_REQUIRED: "STORAGE_MIGRATION_REQUIRED",
  MIGRATION_UNSUPPORTED: "STORAGE_MIGRATION_UNSUPPORTED",
  SERIALIZATION_INVALID: "STORAGE_SERIALIZATION_INVALID",
});

export type StorageErrorCode =
  (typeof STORAGE_ERROR_CODES)[keyof typeof STORAGE_ERROR_CODES];

export type JsonStorageEnvelopeKind =
  | "workspaceDescriptors"
  | "workspaceEvents"
  | "auditRecords"
  | "syncCursors";

export interface StorageAdapterErrorOptions {
  readonly cause?: unknown;
  readonly details?: Readonly<Record<string, unknown>>;
}

export class StorageAdapterError extends Error {
  readonly code: StorageErrorCode;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    code: StorageErrorCode,
    message: string,
    options: StorageAdapterErrorOptions = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "StorageAdapterError";
    this.code = code;
    this.details =
      options.details === undefined ? undefined : readOnlyClone(options.details);
  }
}

export interface WorkspaceDescriptorStorageAdapter {
  putWorkspaceDescriptor(descriptor: WorkspaceDescriptor): Promise<ReadonlyWorkspaceDescriptor>;
  getWorkspaceDescriptor(workspaceId: string): Promise<ReadonlyWorkspaceDescriptor | undefined>;
  listWorkspaceDescriptors(): Promise<ReadonlyArraySnapshot<WorkspaceDescriptor>>;
  deleteWorkspaceDescriptor(workspaceId: string): Promise<void>;
}

export interface WorkspaceEventStorageAdapter {
  appendWorkspaceEvent(event: WorkspaceEvent): Promise<ReadonlyWorkspaceEvent>;
  listWorkspaceEvents(
    workspaceId: string,
    query?: ListWorkspaceEventsStorageQuery,
  ): Promise<ReadonlyArraySnapshot<WorkspaceEvent>>;
}

export interface AuditRecordStorageAdapter {
  appendAuditRecord(record: AuditRecord): Promise<ReadonlyStoredAuditRecord>;
  listAuditRecords(query?: ListAuditRecordsStorageQuery): Promise<ReadonlyArraySnapshot<StoredAuditRecord>>;
}

export interface SyncCursorStorageAdapter {
  putSyncCursor(cursor: SyncCursorRecord): Promise<ReadonlySyncCursorRecord>;
  getSyncCursor(workspaceId: string, cursorKey: string): Promise<ReadonlySyncCursorRecord | undefined>;
  listSyncCursors(workspaceId: string): Promise<ReadonlyArraySnapshot<SyncCursorRecord>>;
  deleteSyncCursor(workspaceId: string, cursorKey: string): Promise<void>;
}

export interface LocalStorageAdapter
  extends WorkspaceDescriptorStorageAdapter,
    WorkspaceEventStorageAdapter,
    AuditRecordStorageAdapter,
    SyncCursorStorageAdapter {}

export interface ListWorkspaceEventsStorageQuery {
  readonly sinceCursor?: string;
  readonly afterSequence?: number;
  readonly type?: string;
  readonly limit?: number;
}

export interface ListAuditRecordsStorageQuery {
  readonly workspaceId?: string;
  readonly action?: string;
  readonly sinceCursor?: string;
  readonly limit?: number;
}

export interface StoredAuditRecord extends AuditRecord {
  readonly cursor: string;
  readonly sequence: number;
}

export interface SyncCursorRecord {
  readonly workspaceId: string;
  readonly cursorKey: string;
  readonly cursor: string;
  readonly updatedAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface JsonStorageEnvelope<RecordValue = unknown> {
  readonly schemaVersion: number;
  readonly kind: JsonStorageEnvelopeKind;
  readonly records: readonly RecordValue[];
}

export interface StorageEnvelopeMigration {
  (envelope: JsonStorageEnvelope<unknown>): JsonStorageEnvelope<unknown>;
}

export interface ParseStorageEnvelopeOptions<RecordValue = unknown> {
  readonly kind: JsonStorageEnvelopeKind;
  readonly migrations?: Readonly<Record<number, StorageEnvelopeMigration>>;
  readonly parseRecord?: (record: unknown, index: number) => RecordValue;
}

export interface JsonStorageFilePlanInput<RecordValue = unknown> {
  readonly path: string;
  readonly kind: JsonStorageEnvelopeKind;
  readonly records: readonly RecordValue[];
}

export interface JsonStorageFilePlanEntry {
  readonly path: string;
  readonly contents: string;
  readonly envelope: ReadonlyStorageEnvelope<unknown>;
}

type ReadonlyWorkspaceDescriptor = DeepReadonly<WorkspaceDescriptor>;
type ReadonlyWorkspaceEvent = DeepReadonly<WorkspaceEvent>;
type ReadonlyStoredAuditRecord = DeepReadonly<StoredAuditRecord>;
type ReadonlySyncCursorRecord = DeepReadonly<SyncCursorRecord>;
type ReadonlyStorageEnvelope<T> = DeepReadonly<JsonStorageEnvelope<T>>;
type ReadonlyArraySnapshot<T> = DeepReadonly<readonly T[]>;

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? Readonly<{ [K in keyof T]: DeepReadonly<T[K]> }>
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

export class InMemoryLocalStorageAdapter implements LocalStorageAdapter {
  readonly #workspaces = new Map<string, WorkspaceDescriptor>();
  readonly #events = new Map<string, WorkspaceEvent[]>();
  readonly #auditRecords: StoredAuditRecord[] = [];
  readonly #syncCursors = new Map<string, Map<string, SyncCursorRecord>>();
  #nextAuditSequence = 1;

  async putWorkspaceDescriptor(
    descriptor: WorkspaceDescriptor,
  ): Promise<ReadonlyWorkspaceDescriptor> {
    const workspaceId = requireRecordString(descriptor, "workspaceId", "descriptor.workspaceId");
    const stored = cloneStorageValue(descriptor);

    this.#workspaces.set(workspaceId, stored);
    return readOnlyClone(stored);
  }

  async getWorkspaceDescriptor(
    workspaceId: string,
  ): Promise<ReadonlyWorkspaceDescriptor | undefined> {
    const stored = this.#workspaces.get(requireNonEmptyString(workspaceId, "workspaceId"));
    return stored === undefined ? undefined : readOnlyClone(stored);
  }

  async listWorkspaceDescriptors(): Promise<ReadonlyArraySnapshot<WorkspaceDescriptor>> {
    return readOnlyClone(
      Array.from(this.#workspaces.values()).sort(compareByStringField("workspaceId")),
    );
  }

  async deleteWorkspaceDescriptor(workspaceId: string): Promise<void> {
    this.#workspaces.delete(requireNonEmptyString(workspaceId, "workspaceId"));
  }

  async appendWorkspaceEvent(event: WorkspaceEvent): Promise<ReadonlyWorkspaceEvent> {
    const workspaceId = requireRecordString(event, "workspaceId", "event.workspaceId");
    requirePositiveInteger(event.sequence, "event.sequence");
    requireRecordString(event, "cursor", "event.cursor");

    const stored = cloneStorageValue(event);
    const events = this.#events.get(workspaceId) ?? [];
    events.push(stored);
    this.#events.set(workspaceId, events);

    return readOnlyClone(stored);
  }

  async listWorkspaceEvents(
    workspaceId: string,
    query: ListWorkspaceEventsStorageQuery = {},
  ): Promise<ReadonlyArraySnapshot<WorkspaceEvent>> {
    const normalizedWorkspaceId = requireNonEmptyString(workspaceId, "workspaceId");
    const afterSequence = Math.max(
      parseOptionalCursor(query.sinceCursor, "query.sinceCursor"),
      parseOptionalSequence(query.afterSequence, "query.afterSequence"),
    );
    const limit = parseOptionalLimit(query.limit, "query.limit");

    if (
      query.type !== undefined &&
      (typeof query.type !== "string" || query.type.trim().length === 0)
    ) {
      throw invalidValue("query.type must be a non-empty string", { path: "query.type" });
    }

    const events = (this.#events.get(normalizedWorkspaceId) ?? [])
      .filter((event) => event.sequence > afterSequence)
      .filter((event) => query.type === undefined || event.type === query.type)
      .sort(compareEvents);

    return readOnlyClone(limit === undefined ? events : events.slice(0, limit));
  }

  async appendAuditRecord(record: AuditRecord): Promise<ReadonlyStoredAuditRecord> {
    const sequence = this.#nextAuditSequence;
    const stored: StoredAuditRecord = {
      ...cloneStorageValue(record),
      cursor: String(sequence),
      sequence,
    };

    this.#auditRecords.push(stored);
    this.#nextAuditSequence += 1;

    return readOnlyClone(stored);
  }

  async listAuditRecords(
    query: ListAuditRecordsStorageQuery = {},
  ): Promise<ReadonlyArraySnapshot<StoredAuditRecord>> {
    const afterSequence = parseOptionalCursor(query.sinceCursor, "query.sinceCursor");
    const limit = parseOptionalLimit(query.limit, "query.limit");

    if (
      query.workspaceId !== undefined &&
      (typeof query.workspaceId !== "string" || query.workspaceId.trim().length === 0)
    ) {
      throw invalidValue("query.workspaceId must be a non-empty string", {
        path: "query.workspaceId",
      });
    }

    if (
      query.action !== undefined &&
      (typeof query.action !== "string" || query.action.trim().length === 0)
    ) {
      throw invalidValue("query.action must be a non-empty string", { path: "query.action" });
    }

    const records = this.#auditRecords
      .filter((record) => record.sequence > afterSequence)
      .filter((record) => query.workspaceId === undefined || record.workspaceId === query.workspaceId)
      .filter((record) => query.action === undefined || record.action === query.action)
      .sort(compareAuditRecords);

    return readOnlyClone(limit === undefined ? records : records.slice(0, limit));
  }

  async putSyncCursor(cursor: SyncCursorRecord): Promise<ReadonlySyncCursorRecord> {
    const workspaceId = requireRecordString(cursor, "workspaceId", "cursor.workspaceId");
    const cursorKey = requireRecordString(cursor, "cursorKey", "cursor.cursorKey");
    requireRecordString(cursor, "cursor", "cursor.cursor");
    requireRecordString(cursor, "updatedAt", "cursor.updatedAt");

    const stored = cloneStorageValue(cursor);
    const workspaceCursors = this.#syncCursors.get(workspaceId) ?? new Map<string, SyncCursorRecord>();
    workspaceCursors.set(cursorKey, stored);
    this.#syncCursors.set(workspaceId, workspaceCursors);

    return readOnlyClone(stored);
  }

  async getSyncCursor(
    workspaceId: string,
    cursorKey: string,
  ): Promise<ReadonlySyncCursorRecord | undefined> {
    const normalizedWorkspaceId = requireNonEmptyString(workspaceId, "workspaceId");
    const normalizedCursorKey = requireNonEmptyString(cursorKey, "cursorKey");
    const stored = this.#syncCursors.get(normalizedWorkspaceId)?.get(normalizedCursorKey);

    return stored === undefined ? undefined : readOnlyClone(stored);
  }

  async listSyncCursors(workspaceId: string): Promise<ReadonlyArraySnapshot<SyncCursorRecord>> {
    const normalizedWorkspaceId = requireNonEmptyString(workspaceId, "workspaceId");
    const records = Array.from(this.#syncCursors.get(normalizedWorkspaceId)?.values() ?? [])
      .sort(compareByStringField("cursorKey"));

    return readOnlyClone(records);
  }

  async deleteSyncCursor(workspaceId: string, cursorKey: string): Promise<void> {
    const normalizedWorkspaceId = requireNonEmptyString(workspaceId, "workspaceId");
    const normalizedCursorKey = requireNonEmptyString(cursorKey, "cursorKey");
    const workspaceCursors = this.#syncCursors.get(normalizedWorkspaceId);

    workspaceCursors?.delete(normalizedCursorKey);
    if (workspaceCursors?.size === 0) {
      this.#syncCursors.delete(normalizedWorkspaceId);
    }
  }
}

export function createInMemoryLocalStorageAdapter(): InMemoryLocalStorageAdapter {
  return new InMemoryLocalStorageAdapter();
}

export function validateJsonStorageRelativePath(path: string): string {
  if (typeof path !== "string" || path.length === 0) {
    throw invalidPath("storage path must be a non-empty string", { path });
  }

  if (path !== path.trim()) {
    throw invalidPath("storage path must not contain leading or trailing whitespace", { path });
  }

  if (path.includes("\0")) {
    throw invalidPath("storage path must not contain null bytes", { path });
  }

  if (path.includes("\\")) {
    throw invalidPath("storage path must use forward slashes", { path });
  }

  if (
    path.startsWith("/") ||
    path.startsWith("//") ||
    /^[A-Za-z]:\//.test(path)
  ) {
    throw invalidPath("storage path must be relative", { path });
  }

  if (!path.endsWith(".json")) {
    throw invalidPath("storage path must target a JSON file", { path });
  }

  const segments = path.split("/");
  const invalidSegment = segments.find(
    (segment) => segment.length === 0 || segment === "." || segment === ".." || segment.includes(":"),
  );
  if (invalidSegment !== undefined) {
    throw invalidPath("storage path contains an unsafe segment", {
      path,
      segment: invalidSegment,
    });
  }

  return path;
}

export function createStorageEnvelope<RecordValue>(
  kind: JsonStorageEnvelopeKind,
  records: readonly RecordValue[],
): ReadonlyStorageEnvelope<RecordValue> {
  return readOnlyClone({
    kind,
    records,
    schemaVersion: STORAGE_SCHEMA_VERSION,
  });
}

export function serializeStorageEnvelope<RecordValue>(
  kind: JsonStorageEnvelopeKind,
  records: readonly RecordValue[],
): string {
  return `${serializeDeterministicJson(createStorageEnvelope(kind, records))}\n`;
}

export function parseStorageEnvelope<RecordValue = unknown>(
  source: string | unknown,
  options: ParseStorageEnvelopeOptions<RecordValue>,
): ReadonlyStorageEnvelope<RecordValue> {
  const raw = typeof source === "string" ? parseJsonSource(source) : source;
  let envelope = parseEnvelopeShape(raw);

  while (envelope.schemaVersion < STORAGE_SCHEMA_VERSION) {
    const migration = options.migrations?.[envelope.schemaVersion];
    if (migration === undefined) {
      throw new StorageAdapterError(
        STORAGE_ERROR_CODES.MIGRATION_REQUIRED,
        "storage envelope requires a migration that was not provided",
        {
          details: {
            fromVersion: envelope.schemaVersion,
            toVersion: STORAGE_SCHEMA_VERSION,
          },
        },
      );
    }

    const next = parseEnvelopeShape(migration(readOnlyClone(envelope)));
    if (next.schemaVersion <= envelope.schemaVersion) {
      throw new StorageAdapterError(
        STORAGE_ERROR_CODES.INVALID_ENVELOPE,
        "storage migration must advance the schema version",
        {
          details: {
            fromVersion: envelope.schemaVersion,
            nextVersion: next.schemaVersion,
          },
        },
      );
    }
    envelope = next;
  }

  if (envelope.schemaVersion > STORAGE_SCHEMA_VERSION) {
    throw new StorageAdapterError(
      STORAGE_ERROR_CODES.MIGRATION_UNSUPPORTED,
      "storage envelope was written by a newer schema version",
      {
        details: {
          schemaVersion: envelope.schemaVersion,
          supportedVersion: STORAGE_SCHEMA_VERSION,
        },
      },
    );
  }

  if (envelope.kind !== options.kind) {
    throw new StorageAdapterError(
      STORAGE_ERROR_CODES.INVALID_ENVELOPE,
      "storage envelope kind does not match the requested record kind",
      {
        details: {
          expected: options.kind,
          actual: envelope.kind,
        },
      },
    );
  }

  const records =
    options.parseRecord === undefined
      ? envelope.records
      : envelope.records.map((record, index) => options.parseRecord!(record, index));

  return createStorageEnvelope(options.kind, records as readonly RecordValue[]);
}

export function planJsonStorageWrites(
  files: readonly JsonStorageFilePlanInput[],
): DeepReadonly<readonly JsonStorageFilePlanEntry[]> {
  const paths = new Set<string>();
  const entries = files.map((file) => {
    const path = validateJsonStorageRelativePath(file.path);
    if (paths.has(path)) {
      throw invalidPath("storage plan contains duplicate paths", { path });
    }
    paths.add(path);

    const envelope = createStorageEnvelope(file.kind, file.records);
    return {
      path,
      contents: `${serializeDeterministicJson(envelope)}\n`,
      envelope,
    };
  });

  return readOnlyClone(entries.sort(compareByStringField("path")));
}

export function serializeDeterministicJson(value: unknown): string {
  return stringifyStable(value, "", new WeakSet<object>());
}

function parseJsonSource(source: string): unknown {
  try {
    return JSON.parse(source);
  } catch (cause) {
    throw new StorageAdapterError(
      STORAGE_ERROR_CODES.INVALID_JSON,
      "storage JSON could not be parsed",
      { cause },
    );
  }
}

function parseEnvelopeShape(source: unknown): JsonStorageEnvelope<unknown> {
  if (!isRecord(source)) {
    throw invalidEnvelope("storage envelope must be an object", { path: "" });
  }

  const schemaVersion = source.schemaVersion;
  if (!Number.isInteger(schemaVersion) || (schemaVersion as number) < 0) {
    throw invalidEnvelope("storage envelope schemaVersion must be a non-negative integer", {
      path: "schemaVersion",
    });
  }

  if (!isEnvelopeKind(source.kind)) {
    throw invalidEnvelope("storage envelope kind is not supported", { path: "kind" });
  }

  if (!Array.isArray(source.records)) {
    throw invalidEnvelope("storage envelope records must be an array", { path: "records" });
  }

  return {
    schemaVersion: schemaVersion as number,
    kind: source.kind as JsonStorageEnvelopeKind,
    records: source.records,
  };
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
    const serialized = `[${value.map((item, index) => stringifyStable(item, `${path}.${index}`, seen)).join(",")}]`;
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

function cloneStorageValue<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch (cause) {
    throw new StorageAdapterError(
      STORAGE_ERROR_CODES.INVALID_VALUE,
      "storage value must be structured-cloneable",
      { cause },
    );
  }
}

function readOnlyClone<T>(value: T): DeepReadonly<T> {
  return deepFreeze(cloneStorageValue(value)) as DeepReadonly<T>;
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

function invalidPath(message: string, details: Readonly<Record<string, unknown>>): StorageAdapterError {
  return new StorageAdapterError(STORAGE_ERROR_CODES.INVALID_PATH, message, { details });
}

function invalidEnvelope(
  message: string,
  details: Readonly<Record<string, unknown>>,
): StorageAdapterError {
  return new StorageAdapterError(STORAGE_ERROR_CODES.INVALID_ENVELOPE, message, { details });
}

function invalidValue(message: string, details: Readonly<Record<string, unknown>>): StorageAdapterError {
  return new StorageAdapterError(STORAGE_ERROR_CODES.INVALID_VALUE, message, { details });
}

function serializationError(message: string, path: string): StorageAdapterError {
  return new StorageAdapterError(STORAGE_ERROR_CODES.SERIALIZATION_INVALID, message, {
    details: { path },
  });
}

function requireRecordString(
  record: unknown,
  field: string,
  path: string,
): string {
  if (!isRecord(record)) {
    throw invalidValue(`${path} must be read from an object`, { path });
  }

  return requireNonEmptyString(record[field], path);
}

function requireNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw invalidValue(`${path} must be a non-empty string`, { path });
  }
  return value;
}

function requirePositiveInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw invalidValue(`${path} must be a positive integer`, { path });
  }
  return value as number;
}

function parseOptionalCursor(cursor: string | undefined, path: string): number {
  if (cursor === undefined) {
    return 0;
  }

  if (!/^[1-9][0-9]*$/.test(cursor)) {
    throw invalidValue(`${path} must be a positive cursor`, { path });
  }

  return Number(cursor);
}

function parseOptionalSequence(sequence: number | undefined, path: string): number {
  if (sequence === undefined) {
    return 0;
  }

  return requirePositiveInteger(sequence, path);
}

function parseOptionalLimit(limit: number | undefined, path: string): number | undefined {
  if (limit === undefined) {
    return undefined;
  }

  return requirePositiveInteger(limit, path);
}

function compareEvents(left: WorkspaceEvent, right: WorkspaceEvent): number {
  return left.sequence - right.sequence || compareStrings(left.eventId, right.eventId);
}

function compareAuditRecords(left: StoredAuditRecord, right: StoredAuditRecord): number {
  return left.sequence - right.sequence || compareStrings(left.auditId, right.auditId);
}

function compareByStringField<T>(
  field: keyof T,
): (left: T, right: T) => number {
  return (left, right) => compareStrings(String(left[field]), String(right[field]));
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

function isEnvelopeKind(value: unknown): value is JsonStorageEnvelopeKind {
  return (
    value === "workspaceDescriptors" ||
    value === "workspaceEvents" ||
    value === "auditRecords" ||
    value === "syncCursors"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlainRecord(value: Record<string, unknown>): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
