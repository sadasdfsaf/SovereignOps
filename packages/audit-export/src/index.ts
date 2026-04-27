export const AUDIT_EXPORT_FORMAT_VERSION = 1;
export const AUDIT_EXPORT_REDACTION = "[REDACTED]";

export const AUDIT_EXPORT_ERROR_CODES = Object.freeze({
  INVALID_EVENT: "AUDIT_EXPORT_INVALID_EVENT",
  INVALID_FILTER: "AUDIT_EXPORT_INVALID_FILTER",
  SERIALIZATION_INVALID: "AUDIT_EXPORT_SERIALIZATION_INVALID",
});

export type AuditExportErrorCode =
  (typeof AUDIT_EXPORT_ERROR_CODES)[keyof typeof AUDIT_EXPORT_ERROR_CODES];

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

export interface AuditExportErrorOptions {
  readonly cause?: unknown;
  readonly details?: Readonly<Record<string, unknown>>;
}

export class AuditExportError extends Error {
  readonly code: AuditExportErrorCode;
  readonly details?: DeepReadonly<Record<string, unknown>>;

  constructor(
    code: AuditExportErrorCode,
    message: string,
    options: AuditExportErrorOptions = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AuditExportError";
    this.code = code;
    this.details = options.details === undefined ? undefined : readOnlyClone(options.details);
  }
}

export class AuditEventValidationError extends AuditExportError {
  constructor(message: string, options: AuditExportErrorOptions = {}) {
    super(AUDIT_EXPORT_ERROR_CODES.INVALID_EVENT, message, options);
    this.name = "AuditEventValidationError";
  }
}

export class AuditEventFilterError extends AuditExportError {
  constructor(message: string, options: AuditExportErrorOptions = {}) {
    super(AUDIT_EXPORT_ERROR_CODES.INVALID_FILTER, message, options);
    this.name = "AuditEventFilterError";
  }
}

export interface AuditEntityInput {
  readonly id?: unknown;
  readonly type?: unknown;
  readonly displayName?: unknown;
  readonly [key: string]: unknown;
}

export interface AuditEventInput {
  readonly eventId?: unknown;
  readonly timestamp?: unknown;
  readonly type?: unknown;
  readonly decision?: unknown;
  readonly actor?: unknown;
  readonly target?: unknown;
  readonly reason?: unknown;
  readonly attributes?: unknown;
  readonly context?: unknown;
}

export interface NormalizedAuditEvent {
  readonly kind: "audit-export.event";
  readonly version: number;
  readonly eventId: string;
  readonly timestamp: string;
  readonly type: string;
  readonly decision: string | null;
  readonly actor: JsonObject | null;
  readonly target: JsonObject | null;
  readonly reason: string | null;
  readonly attributes: JsonObject;
  readonly context: JsonObject;
  readonly fingerprint: string;
}

export interface AuditEventFilters {
  readonly decision?: string | readonly string[];
  readonly decisions?: string | readonly string[];
  readonly type?: string | readonly string[];
  readonly types?: string | readonly string[];
  readonly from?: string;
  readonly fromTimestamp?: string;
  readonly to?: string;
  readonly toTimestamp?: string;
}

export interface AuditExportOptions {
  readonly createdAt?: string;
  readonly exportId?: string;
  readonly filters?: AuditEventFilters;
}

export interface AuditExportContentDescriptor {
  readonly fingerprint: string;
  readonly mediaType: string;
  readonly bytes: number;
  readonly rows?: number;
  readonly lines?: number;
  readonly columns?: readonly string[];
}

export interface AuditExportManifest {
  readonly kind: "audit-export.manifest";
  readonly version: number;
  readonly exportId: string;
  readonly createdAt: string;
  readonly eventCount: number;
  readonly firstTimestamp: string | null;
  readonly lastTimestamp: string | null;
  readonly decisions: readonly string[];
  readonly types: readonly string[];
  readonly filters: NormalizedAuditEventFilters;
  readonly eventFingerprints: readonly string[];
  readonly jsonl: AuditExportContentDescriptor;
  readonly csv: AuditExportContentDescriptor;
  readonly fingerprint: string;
}

export interface AuditExportPackage {
  readonly kind: "audit-export.package";
  readonly version: number;
  readonly manifest: AuditExportManifest;
  readonly jsonl: string;
  readonly csv: string;
  readonly fingerprint: string;
}

export interface NormalizedAuditEventFilters {
  readonly decisions: readonly string[];
  readonly types: readonly string[];
  readonly fromTimestamp: string | null;
  readonly toTimestamp: string | null;
}

const DEFAULT_EXPORT_CREATED_AT = "1970-01-01T00:00:00.000Z";
const CSV_COLUMNS = Object.freeze([
  "eventId",
  "timestamp",
  "type",
  "decision",
  "actor",
  "target",
  "reason",
  "attributes",
  "context",
  "fingerprint",
]);

export function normalizeAuditEvent(value: unknown): DeepReadonly<NormalizedAuditEvent> {
  if (!isPlainRecord(value)) {
    throw new AuditEventValidationError("audit event must be a plain object", {
      details: { path: "event" },
    });
  }

  const timestamp = readTimestamp(value.timestamp, "event.timestamp", auditEventError);
  const type = requireCleanString(value.type, "event.type", auditEventError);
  const decision = value.decision === undefined || value.decision === null
    ? null
    : redactStringValue(requireCleanString(value.decision, "event.decision", auditEventError));
  const actor = value.actor === undefined || value.actor === null
    ? null
    : readAuditEntity(value.actor, "event.actor");
  const target = value.target === undefined || value.target === null
    ? null
    : readAuditEntity(value.target, "event.target");
  const reason = value.reason === undefined || value.reason === null
    ? null
    : redactStringValue(requireCleanString(value.reason, "event.reason", auditEventError));
  const attributes = value.attributes === undefined
    ? {}
    : readJsonObject(value.attributes, "event.attributes", auditEventError);
  const context = value.context === undefined
    ? {}
    : readJsonObject(value.context, "event.context", auditEventError);

  const eventWithoutFingerprint = {
    kind: "audit-export.event",
    version: AUDIT_EXPORT_FORMAT_VERSION,
    eventId: readEventId(value.eventId, {
      timestamp,
      type,
      decision,
      actor,
      target,
      reason,
      attributes,
      context,
    }),
    timestamp,
    type,
    decision,
    actor,
    target,
    reason,
    attributes,
    context,
  } satisfies Omit<NormalizedAuditEvent, "fingerprint">;
  const fingerprint = createFingerprint({
    kind: "audit-export.event",
    event: eventWithoutFingerprint,
  });

  return readOnlyClone({
    ...eventWithoutFingerprint,
    fingerprint,
  });
}

export function normalizeAuditEvents(values: readonly unknown[]): readonly DeepReadonly<NormalizedAuditEvent>[] {
  if (!Array.isArray(values)) {
    throw new AuditEventValidationError("audit events must be an array", {
      details: { path: "events" },
    });
  }

  const events = values.map(normalizeAuditEvent).sort(compareAuditEvents);
  const ids = new Set<string>();
  for (const event of events) {
    if (ids.has(event.eventId)) {
      throw new AuditEventValidationError("audit event ids must be unique", {
        details: { eventId: event.eventId },
      });
    }
    ids.add(event.eventId);
  }

  return readOnlyClone(events);
}

export function redactAuditValue(value: unknown): JsonValue {
  return redactJsonValue(value, "", false);
}

export function filterAuditEvents(
  values: readonly unknown[],
  filters: AuditEventFilters = {},
): readonly DeepReadonly<NormalizedAuditEvent>[] {
  const normalizedFilters = normalizeAuditEventFilters(filters);
  const events = normalizeAuditEvents(values).filter((event) => eventMatchesFilters(
    event,
    normalizedFilters,
  ));

  return readOnlyClone(events);
}

export function renderAuditJsonl(
  values: readonly unknown[],
  filters: AuditEventFilters = {},
): string {
  return filterAuditEvents(values, filters)
    .map((event) => serializeDeterministicJson(event))
    .join("\n");
}

export function renderAuditCsv(
  values: readonly unknown[],
  filters: AuditEventFilters = {},
): string {
  const rows = filterAuditEvents(values, filters).map((event) => CSV_COLUMNS.map((column) => (
    formatCsvCell(readCsvColumn(event, column))
  )).join(","));

  return [
    CSV_COLUMNS.join(","),
    ...rows,
  ].join("\n");
}

export function createAuditExportManifest(
  values: readonly unknown[],
  options: AuditExportOptions = {},
): AuditExportManifest {
  const createdAt = options.createdAt === undefined
    ? DEFAULT_EXPORT_CREATED_AT
    : readTimestamp(options.createdAt, "options.createdAt", auditEventError);
  const filters = normalizeAuditEventFilters(options.filters ?? {});
  const events = filterAuditEvents(values, filters);
  const jsonl = renderAuditJsonl(events);
  const csv = renderAuditCsv(events);
  const decisions = uniqueSorted(events
    .map((event) => event.decision)
    .filter((decision): decision is string => decision !== null));
  const types = uniqueSorted(events.map((event) => event.type));
  const summary = {
    createdAt,
    decisions,
    eventCount: events.length,
    eventFingerprints: events.map((event) => event.fingerprint),
    filters,
    firstTimestamp: events[0]?.timestamp ?? null,
    jsonlFingerprint: createFingerprint(jsonl),
    lastTimestamp: events.at(-1)?.timestamp ?? null,
    types,
    version: AUDIT_EXPORT_FORMAT_VERSION,
  };
  const exportId = options.exportId === undefined
    ? `audit_${createFingerprint(summary).slice("fnv1a64:".length)}`
    : requireCleanString(options.exportId, "options.exportId", auditEventError);
  const manifestWithoutFingerprint = {
    kind: "audit-export.manifest",
    version: AUDIT_EXPORT_FORMAT_VERSION,
    exportId,
    createdAt,
    eventCount: events.length,
    firstTimestamp: events[0]?.timestamp ?? null,
    lastTimestamp: events.at(-1)?.timestamp ?? null,
    decisions,
    types,
    filters,
    eventFingerprints: events.map((event) => event.fingerprint),
    jsonl: {
      fingerprint: createFingerprint(jsonl),
      mediaType: "application/jsonl",
      bytes: countUtf8Bytes(jsonl),
      lines: events.length,
    },
    csv: {
      fingerprint: createFingerprint(csv),
      mediaType: "text/csv",
      bytes: countUtf8Bytes(csv),
      rows: events.length,
      columns: CSV_COLUMNS,
    },
  } satisfies Omit<AuditExportManifest, "fingerprint">;
  const fingerprint = createFingerprint({
    kind: "audit-export.manifest",
    manifest: manifestWithoutFingerprint,
  });

  return readOnlyClone({
    ...manifestWithoutFingerprint,
    fingerprint,
  });
}

export function createAuditExportPackage(
  values: readonly unknown[],
  options: AuditExportOptions = {},
): AuditExportPackage {
  const filters = options.filters ?? {};
  const jsonl = renderAuditJsonl(values, filters);
  const csv = renderAuditCsv(values, filters);
  const manifest = createAuditExportManifest(values, options);
  const fingerprint = createFingerprint({
    kind: "audit-export.package",
    csvFingerprint: manifest.csv.fingerprint,
    jsonlFingerprint: manifest.jsonl.fingerprint,
    manifestFingerprint: manifest.fingerprint,
    version: AUDIT_EXPORT_FORMAT_VERSION,
  });

  return readOnlyClone({
    kind: "audit-export.package",
    version: AUDIT_EXPORT_FORMAT_VERSION,
    manifest,
    jsonl,
    csv,
    fingerprint,
  });
}

export function fingerprintAuditEvent(value: unknown): string {
  return normalizeAuditEvent(value).fingerprint;
}

export function fingerprintAuditExport(value: unknown): string {
  return createFingerprint(value);
}

export function serializeDeterministicJson(value: unknown): string {
  return stringifyStable(value, "", new WeakSet<object>());
}

function normalizeAuditEventFilters(filters: AuditEventFilters): NormalizedAuditEventFilters {
  if (!isPlainRecord(filters)) {
    throw new AuditEventFilterError("audit filters must be a plain object", {
      details: { path: "filters" },
    });
  }

  const decisions = readFilterList(
    filters.decision ?? filters.decisions,
    "filters.decision",
  );
  const types = readFilterList(filters.type ?? filters.types, "filters.type");
  const fromTimestamp = filters.fromTimestamp ?? filters.from;
  const toTimestamp = filters.toTimestamp ?? filters.to;
  const normalized = {
    decisions,
    types,
    fromTimestamp: fromTimestamp === undefined || fromTimestamp === null
      ? null
      : readTimestamp(fromTimestamp, "filters.fromTimestamp", auditFilterError),
    toTimestamp: toTimestamp === undefined || toTimestamp === null
      ? null
      : readTimestamp(toTimestamp, "filters.toTimestamp", auditFilterError),
  };

  if (
    normalized.fromTimestamp !== null &&
    normalized.toTimestamp !== null &&
    normalized.fromTimestamp > normalized.toTimestamp
  ) {
    throw new AuditEventFilterError("fromTimestamp must be before or equal to toTimestamp", {
      details: {
        fromTimestamp: normalized.fromTimestamp,
        toTimestamp: normalized.toTimestamp,
      },
    });
  }

  return readOnlyClone(normalized);
}

function eventMatchesFilters(
  event: NormalizedAuditEvent,
  filters: NormalizedAuditEventFilters,
): boolean {
  if (filters.decisions.length > 0 && !filters.decisions.includes(event.decision ?? "")) {
    return false;
  }
  if (filters.types.length > 0 && !filters.types.includes(event.type)) {
    return false;
  }
  if (filters.fromTimestamp !== null && event.timestamp < filters.fromTimestamp) {
    return false;
  }
  if (filters.toTimestamp !== null && event.timestamp > filters.toTimestamp) {
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
    requireCleanString(item, `${path}.${index}`, auditFilterError)
  )));
}

function readAuditEntity(value: unknown, path: string): JsonObject {
  if (typeof value === "string") {
    return readOnlyClone({
      id: redactStringValue(requireCleanString(value, path, auditEventError)),
    });
  }

  return readJsonObject(value, path, auditEventError);
}

function readJsonObject(
  value: unknown,
  path: string,
  createError: ErrorFactory,
): JsonObject {
  if (!isPlainRecord(value)) {
    throw createError("value must be a plain JSON object", { path });
  }

  try {
    return readOnlyClone(redactJsonValue(value, path, false)) as JsonObject;
  } catch (cause) {
    if (cause instanceof AuditExportError) {
      throw cause;
    }
    throw createError("value must be JSON-compatible", { cause, path });
  }
}

function redactJsonValue(value: unknown, path: string, redactBecauseKey: boolean): JsonValue {
  if (redactBecauseKey) {
    return AUDIT_EXPORT_REDACTION;
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
    return value.map((item, index) => (
      redactJsonValue(item, formatArrayPath(path, index), false)
    ));
  }

  if (isRecord(value)) {
    if (!isPlainRecord(value)) {
      throw serializationError("objects must be plain records", path);
    }

    const output: Record<string, JsonValue> = {};
    for (const [key, nested] of Object.entries(value).sort(([left], [right]) => compareStrings(left, right))) {
      if (nested === undefined) {
        continue;
      }
      const nestedPath = path.length === 0 ? key : `${path}.${key}`;
      output[key] = redactJsonValue(nested, nestedPath, isSensitiveKey(key));
    }
    return output;
  }

  throw serializationError("value must be JSON-compatible", path);
}

function redactStringValue(value: string): string {
  return isSecretShapedString(value) ? AUDIT_EXPORT_REDACTION : value;
}

function readEventId(
  value: unknown,
  seed: Omit<NormalizedAuditEvent, "kind" | "version" | "eventId" | "fingerprint">,
): string {
  if (value === undefined || value === null) {
    return `evt_${createFingerprint(seed).slice("fnv1a64:".length)}`;
  }

  const eventId = requireCleanString(value, "event.eventId", auditEventError);
  if (isSecretShapedString(eventId)) {
    return `evt_${createFingerprint(seed).slice("fnv1a64:".length)}`;
  }
  return eventId;
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

function readCsvColumn(event: NormalizedAuditEvent, column: string): string {
  switch (column) {
    case "eventId":
      return event.eventId;
    case "timestamp":
      return event.timestamp;
    case "type":
      return event.type;
    case "decision":
      return event.decision ?? "";
    case "actor":
      return event.actor === null ? "" : serializeDeterministicJson(event.actor);
    case "target":
      return event.target === null ? "" : serializeDeterministicJson(event.target);
    case "reason":
      return event.reason ?? "";
    case "attributes":
      return serializeDeterministicJson(event.attributes);
    case "context":
      return serializeDeterministicJson(event.context);
    case "fingerprint":
      return event.fingerprint;
    default:
      throw serializationError("unknown CSV column", column);
  }
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
  ].some((part) => normalized === part || normalized.endsWith(`_${part}`) || normalized.includes(`_${part}_`));
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

function compareAuditEvents(left: NormalizedAuditEvent, right: NormalizedAuditEvent): number {
  return (
    compareStrings(left.timestamp, right.timestamp) ||
    compareStrings(left.eventId, right.eventId) ||
    compareStrings(left.type, right.type)
  );
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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

function auditEventError(
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): AuditEventValidationError {
  return new AuditEventValidationError(message, { details });
}

function auditFilterError(
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): AuditEventFilterError {
  return new AuditEventFilterError(message, { details });
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
