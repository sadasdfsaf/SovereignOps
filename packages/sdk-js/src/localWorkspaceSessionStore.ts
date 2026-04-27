import type {
  JsonObject,
  JsonValue,
} from "./client.ts";
import {
  LOCAL_WORKSPACE_SESSION_SCHEMA_VERSION,
  normalizeLocalWorkspaceDescriptor,
  normalizeLocalWorkspaceGateway,
  type LocalWorkspaceDescriptor,
  type LocalWorkspaceDescriptorInput,
  type LocalWorkspaceGatewayDescriptor,
  type LocalWorkspaceSessionEvent,
  type LocalWorkspaceSessionEventPayload,
  type LocalWorkspaceSessionEventType,
  type LocalWorkspaceSessionOperation,
} from "./localWorkspaceSession.ts";
import { serializeDeterministicJson } from "./storage.ts";
import type { DeepReadonly } from "./workspace.ts";

export const LOCAL_WORKSPACE_SESSION_STORE_SCHEMA_VERSION =
  "local-workspace-session-store/v1";

export const LOCAL_WORKSPACE_SESSION_STORE_ERROR_CODES = Object.freeze({
  INVALID_BUNDLE: "LOCAL_WORKSPACE_SESSION_STORE_INVALID_BUNDLE",
  INVALID_EVENT: "LOCAL_WORKSPACE_SESSION_STORE_INVALID_EVENT",
  INVALID_ID: "LOCAL_WORKSPACE_SESSION_STORE_INVALID_ID",
  INVALID_JSON: "LOCAL_WORKSPACE_SESSION_STORE_INVALID_JSON",
  INVALID_METADATA: "LOCAL_WORKSPACE_SESSION_STORE_INVALID_METADATA",
  INVALID_SCHEMA: "LOCAL_WORKSPACE_SESSION_STORE_INVALID_SCHEMA",
  INVALID_SNAPSHOT: "LOCAL_WORKSPACE_SESSION_STORE_INVALID_SNAPSHOT",
});

export type LocalWorkspaceSessionStoreErrorCode =
  (typeof LOCAL_WORKSPACE_SESSION_STORE_ERROR_CODES)[keyof typeof LOCAL_WORKSPACE_SESSION_STORE_ERROR_CODES];

export interface LocalWorkspaceSessionStoreErrorOptions {
  readonly cause?: unknown;
  readonly details?: Readonly<Record<string, unknown>>;
}

export class LocalWorkspaceSessionStoreError extends TypeError {
  readonly code: LocalWorkspaceSessionStoreErrorCode;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    code: LocalWorkspaceSessionStoreErrorCode,
    message: string,
    options: LocalWorkspaceSessionStoreErrorOptions = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "LocalWorkspaceSessionStoreError";
    this.code = code;
    this.details =
      options.details === undefined ? undefined : deepFreezeClone(options.details);
  }
}

export interface LocalWorkspaceSessionStoreRedaction {
  readonly rawSecretsStored: false;
  readonly redactedFields: readonly string[];
}

export interface LocalWorkspaceSessionSnapshotInput {
  readonly descriptor: LocalWorkspaceDescriptorInput | LocalWorkspaceDescriptor;
  readonly sessionId?: string;
  readonly snapshotId?: string;
  readonly events?: readonly LocalWorkspaceSessionEvent[];
  readonly metadata?: JsonObject;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly seed?: string;
  readonly clock?: () => string;
}

export interface LocalWorkspaceSessionSnapshot {
  readonly kind: "localWorkspaceSessionSnapshot";
  readonly schemaVersion: typeof LOCAL_WORKSPACE_SESSION_STORE_SCHEMA_VERSION;
  readonly snapshotId: string;
  readonly sessionId: string;
  readonly workspaceId: string;
  readonly deviceId: string;
  readonly descriptor: LocalWorkspaceDescriptor;
  readonly localOnly: true;
  readonly eventCount: number;
  readonly operations: readonly LocalWorkspaceSessionOperation[];
  readonly firstSequence?: number;
  readonly lastSequence?: number;
  readonly cursor?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly metadata?: JsonObject;
  readonly redaction: LocalWorkspaceSessionStoreRedaction;
}

export interface LocalWorkspaceSessionStoreBundleInput {
  readonly snapshot: LocalWorkspaceSessionSnapshot | LocalWorkspaceSessionSnapshotInput;
  readonly events?: readonly LocalWorkspaceSessionEvent[];
}

export interface LocalWorkspaceSessionStoreBundle {
  readonly kind: "localWorkspaceSessionStore";
  readonly schemaVersion: typeof LOCAL_WORKSPACE_SESSION_STORE_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly snapshot: LocalWorkspaceSessionSnapshot;
  readonly events: readonly LocalWorkspaceSessionEvent[];
}

export interface LocalWorkspaceSessionIdInput {
  readonly descriptor: LocalWorkspaceDescriptorInput | LocalWorkspaceDescriptor;
  readonly seed?: string;
}

export interface LocalWorkspaceSessionSnapshotIdInput {
  readonly descriptor: LocalWorkspaceDescriptorInput | LocalWorkspaceDescriptor;
  readonly sessionId: string;
  readonly cursor?: string;
  readonly seed?: string;
}

export interface LocalWorkspaceSessionStoreEventQuery {
  readonly sinceCursor?: string;
  readonly afterSequence?: number;
  readonly operation?: LocalWorkspaceSessionOperation;
  readonly type?: LocalWorkspaceSessionEventType;
  readonly limit?: number;
}

export interface LocalWorkspaceSessionSnapshotQuery {
  readonly workspaceId?: string;
  readonly deviceId?: string;
  readonly limit?: number;
}

export interface InMemoryLocalWorkspaceSessionStoreInput {
  readonly snapshots?: readonly (LocalWorkspaceSessionSnapshot | LocalWorkspaceSessionSnapshotInput)[];
  readonly events?: readonly LocalWorkspaceSessionEvent[];
}

type EventNormalizationContext = {
  readonly sessionId?: string;
  readonly workspaceId?: string;
  readonly deviceId?: string;
  readonly redactedFields?: string[];
};

const SESSION_ID_PATTERN = /^sess_[A-Za-z0-9_-]{1,88}$/;
const SNAPSHOT_ID_PATTERN = /^wssnap_[A-Za-z0-9_-]{1,160}$/;
const WORKSPACE_ID_PATTERN = /^wsp_[A-Za-z0-9_-]{1,88}$/;
const DEVICE_ID_PATTERN = /^dev_[A-Za-z0-9_-]{1,88}$/;
const EVENT_ID_PATTERN = /^evt_[A-Za-z0-9_-]{1,200}$/;
const CURSOR_PATTERN = /^[1-9][0-9]*$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const REDACTED_LOCK_TOKEN_PATTERN = /^\[redacted:lockToken:[a-z0-9]+\]$/;
const SECRET_KEY_PATTERN =
  /authorization|cookie|credential|credentials|password|passphrase|secret|api[._-]?key|api[._-]?token|private[._-]?key|access[._-]?token|refresh[._-]?token|session[._-]?token|token/i;
const SECRET_TEXT_PATTERNS = Object.freeze([
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/g,
  /\b(?:sk-[A-Za-z0-9_-]{8,}|sk_[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,})\b/g,
  /\b((?:apiKey|api[_-]?key|token|password|secret)\s*[:=]\s*)["']?[^"',;\s]+["']?/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
]);
const OPERATIONS = Object.freeze(["open", "lock", "unlock"] as const);
const EVENT_TYPES = Object.freeze([
  "workspace.session.opened",
  "workspace.session.locked",
  "workspace.session.unlocked",
] as const);
const EVENT_TYPE_BY_OPERATION = Object.freeze({
  open: "workspace.session.opened",
  lock: "workspace.session.locked",
  unlock: "workspace.session.unlocked",
} satisfies Record<LocalWorkspaceSessionOperation, LocalWorkspaceSessionEventType>);

export function createLocalWorkspaceSessionId(
  input: LocalWorkspaceSessionIdInput,
): string {
  const descriptor = normalizeLocalWorkspaceDescriptor(input.descriptor);
  const workspace = idSegment(descriptor.workspaceId, 24);
  const device = idSegment(descriptor.deviceId, 24);
  const hash = hashJson({
    workspaceId: descriptor.workspaceId,
    deviceId: descriptor.deviceId,
    storagePath: descriptor.storagePath,
    seed: input.seed ?? "",
  });
  return `sess_${workspace}_${device}_${hash}`;
}

export function createLocalWorkspaceSessionSnapshotId(
  input: LocalWorkspaceSessionSnapshotIdInput,
): string {
  const descriptor = normalizeLocalWorkspaceDescriptor(input.descriptor);
  const sessionId = requireSessionId(input.sessionId, "sessionId");
  const workspace = idSegment(descriptor.workspaceId, 24);
  const session = idSegment(sessionId, 44);
  const hash = hashJson({
    workspaceId: descriptor.workspaceId,
    deviceId: descriptor.deviceId,
    sessionId,
    cursor: input.cursor ?? "",
    seed: input.seed ?? "",
  });
  return `wssnap_${workspace}_${session}_${hash}`;
}

export function createLocalWorkspaceSessionSnapshot(
  input: LocalWorkspaceSessionSnapshotInput,
): DeepReadonly<LocalWorkspaceSessionSnapshot> {
  if (!isRecord(input)) {
    throw invalidSnapshot("snapshot input must be an object", { path: "" });
  }

  const descriptor = normalizeLocalWorkspaceDescriptor(input.descriptor);
  const sessionId =
    input.sessionId === undefined
      ? createLocalWorkspaceSessionId({ descriptor, seed: input.seed })
      : requireSessionId(input.sessionId, "sessionId");
  const redactedFields: string[] = [];
  const events = normalizeLocalWorkspaceSessionStoreEvents(input.events ?? [], {
    sessionId,
    workspaceId: descriptor.workspaceId,
    deviceId: descriptor.deviceId,
    redactedFields,
  });
  const eventStats = summarizeEvents(events);
  const createdAt = requireIsoTimestamp(
    input.createdAt ?? input.clock?.() ?? descriptor.createdAt,
    "createdAt",
  );
  const eventUpdatedAt = latestTimestamp(
    events.map((event) => event.createdAt),
    descriptor.updatedAt,
  );
  const updatedAt = requireIsoTimestamp(input.updatedAt ?? eventUpdatedAt, "updatedAt");
  if (Date.parse(updatedAt) < Date.parse(createdAt)) {
    throw invalidSnapshot("updatedAt must be greater than or equal to createdAt", {
      path: "updatedAt",
    });
  }

  const snapshotId =
    input.snapshotId === undefined
      ? createLocalWorkspaceSessionSnapshotId({
        descriptor,
        sessionId,
        cursor: eventStats.cursor,
        seed: input.seed,
      })
      : requireSnapshotId(input.snapshotId, "snapshotId");
  const sanitizedMetadata = sanitizeOptionalMetadata(input.metadata, "metadata", redactedFields);

  return deepFreezeClone(optionalFields({
    kind: "localWorkspaceSessionSnapshot" as const,
    schemaVersion: LOCAL_WORKSPACE_SESSION_STORE_SCHEMA_VERSION,
    snapshotId,
    sessionId,
    workspaceId: descriptor.workspaceId,
    deviceId: descriptor.deviceId,
    descriptor,
    localOnly: true as const,
    eventCount: events.length,
    operations: eventStats.operations,
    firstSequence: eventStats.firstSequence,
    lastSequence: eventStats.lastSequence,
    cursor: eventStats.cursor,
    createdAt,
    updatedAt,
    metadata: sanitizedMetadata,
    redaction: {
      rawSecretsStored: false as const,
      redactedFields: sortedUnique(redactedFields),
    },
  }) as LocalWorkspaceSessionSnapshot);
}

export function normalizeLocalWorkspaceSessionSnapshot(
  value: unknown,
): DeepReadonly<LocalWorkspaceSessionSnapshot> {
  if (!isRecord(value)) {
    throw invalidSnapshot("snapshot must be an object", { path: "" });
  }
  requireLiteral(value.kind, "localWorkspaceSessionSnapshot", "kind");
  requireSchemaVersion(value.schemaVersion, "schemaVersion");

  const descriptor = normalizeLocalWorkspaceDescriptor(value.descriptor as LocalWorkspaceDescriptorInput);
  const sessionId = requireSessionId(value.sessionId, "sessionId");
  const snapshotId = requireSnapshotId(value.snapshotId, "snapshotId");
  const workspaceId = requireWorkspaceId(value.workspaceId, "workspaceId");
  const deviceId = requireDeviceId(value.deviceId, "deviceId");
  if (workspaceId !== descriptor.workspaceId) {
    throw invalidSnapshot("workspaceId must match descriptor.workspaceId", {
      path: "workspaceId",
    });
  }
  if (deviceId !== descriptor.deviceId) {
    throw invalidSnapshot("deviceId must match descriptor.deviceId", {
      path: "deviceId",
    });
  }
  if (value.localOnly !== true) {
    throw invalidSnapshot("snapshot must be local-only", { path: "localOnly" });
  }

  const eventCount = requireNonNegativeInteger(value.eventCount, "eventCount");
  const operations = readOperations(value.operations, "operations");
  const firstSequence = optionalPositiveInteger(value.firstSequence, "firstSequence");
  const lastSequence = optionalPositiveInteger(value.lastSequence, "lastSequence");
  const cursor = optionalCursor(value.cursor, "cursor");
  const createdAt = requireIsoTimestamp(value.createdAt, "createdAt");
  const updatedAt = requireIsoTimestamp(value.updatedAt, "updatedAt");
  if (Date.parse(updatedAt) < Date.parse(createdAt)) {
    throw invalidSnapshot("updatedAt must be greater than or equal to createdAt", {
      path: "updatedAt",
    });
  }
  if (eventCount === 0 && (firstSequence !== undefined || lastSequence !== undefined || cursor !== undefined)) {
    throw invalidSnapshot("empty snapshots must not include sequence cursors", {
      path: "eventCount",
    });
  }
  if (eventCount > 0 && (firstSequence === undefined || lastSequence === undefined || cursor === undefined)) {
    throw invalidSnapshot("non-empty snapshots require firstSequence, lastSequence, and cursor", {
      path: "eventCount",
    });
  }
  if (
    firstSequence !== undefined &&
    lastSequence !== undefined &&
    lastSequence < firstSequence
  ) {
    throw invalidSnapshot("lastSequence must be greater than or equal to firstSequence", {
      path: "lastSequence",
    });
  }

  const redactedFields: string[] = [];
  const metadata = sanitizeOptionalMetadata(value.metadata as JsonObject | undefined, "metadata", redactedFields);
  const redaction = normalizeRedaction(value.redaction, redactedFields);

  return deepFreezeClone(optionalFields({
    kind: "localWorkspaceSessionSnapshot" as const,
    schemaVersion: LOCAL_WORKSPACE_SESSION_STORE_SCHEMA_VERSION,
    snapshotId,
    sessionId,
    workspaceId,
    deviceId,
    descriptor,
    localOnly: true as const,
    eventCount,
    operations,
    firstSequence,
    lastSequence,
    cursor,
    createdAt,
    updatedAt,
    metadata,
    redaction,
  }) as LocalWorkspaceSessionSnapshot);
}

export function normalizeLocalWorkspaceSessionStoreEvent(
  event: unknown,
): DeepReadonly<LocalWorkspaceSessionEvent> {
  return normalizeStoreEvent(event, "event", {});
}

export function normalizeLocalWorkspaceSessionStoreEvents(
  events: readonly unknown[],
  context: EventNormalizationContext = {},
): DeepReadonly<readonly LocalWorkspaceSessionEvent[]> {
  if (!Array.isArray(events)) {
    throw invalidEvent("events must be an array", { path: "events" });
  }

  const normalized = events.map((event, index) =>
    normalizeStoreEvent(event, `events.${index}`, context)
  );
  assertUniqueEvents(normalized);
  return deepFreezeClone(normalized.sort(compareEvents));
}

export function createLocalWorkspaceSessionStoreBundle(
  input: LocalWorkspaceSessionStoreBundleInput,
): DeepReadonly<LocalWorkspaceSessionStoreBundle> {
  if (!isRecord(input)) {
    throw invalidBundle("bundle input must be an object", { path: "" });
  }

  const snapshot = isSnapshotLike(input.snapshot)
    ? normalizeLocalWorkspaceSessionSnapshot(input.snapshot)
    : createLocalWorkspaceSessionSnapshot({
      ...(input.snapshot as LocalWorkspaceSessionSnapshotInput),
      events: input.events ?? (input.snapshot as LocalWorkspaceSessionSnapshotInput).events,
    });
  const redactedFields = [...snapshot.redaction.redactedFields];
  const events = normalizeLocalWorkspaceSessionStoreEvents(input.events ?? [], {
    sessionId: snapshot.sessionId,
    workspaceId: snapshot.workspaceId,
    deviceId: snapshot.deviceId,
    redactedFields,
  });

  if (events.length !== snapshot.eventCount) {
    throw invalidBundle("bundle event count must match snapshot.eventCount", {
      path: "events",
      eventCount: events.length,
      snapshotEventCount: snapshot.eventCount,
    });
  }

  return deepFreezeClone({
    kind: "localWorkspaceSessionStore" as const,
    schemaVersion: LOCAL_WORKSPACE_SESSION_STORE_SCHEMA_VERSION,
    localOnly: true as const,
    snapshot: {
      ...snapshot,
      redaction: {
        rawSecretsStored: false as const,
        redactedFields: sortedUnique(redactedFields),
      },
    },
    events,
  });
}

export function normalizeLocalWorkspaceSessionStoreBundle(
  value: unknown,
): DeepReadonly<LocalWorkspaceSessionStoreBundle> {
  if (!isRecord(value)) {
    throw invalidBundle("bundle must be an object", { path: "" });
  }
  requireLiteral(value.kind, "localWorkspaceSessionStore", "kind");
  requireSchemaVersion(value.schemaVersion, "schemaVersion");
  if (value.localOnly !== true) {
    throw invalidBundle("bundle must be local-only", { path: "localOnly" });
  }
  return createLocalWorkspaceSessionStoreBundle({
    snapshot: value.snapshot as LocalWorkspaceSessionSnapshot,
    events: Array.isArray(value.events) ? value.events : invalidBundleValue("events must be an array", "events"),
  });
}

export function serializeLocalWorkspaceSessionStoreBundle(
  input: LocalWorkspaceSessionStoreBundleInput | LocalWorkspaceSessionStoreBundle,
): string {
  return `${serializeDeterministicJson(createLocalWorkspaceSessionStoreBundle(input))}\n`;
}

export function parseLocalWorkspaceSessionStoreBundle(
  source: string | unknown,
): DeepReadonly<LocalWorkspaceSessionStoreBundle> {
  const raw = typeof source === "string" ? parseJsonSource(source) : source;
  return normalizeLocalWorkspaceSessionStoreBundle(raw);
}

export class InMemoryLocalWorkspaceSessionStore {
  readonly #snapshots = new Map<string, LocalWorkspaceSessionSnapshot>();
  readonly #snapshotIds = new Map<string, string>();
  readonly #events = new Map<string, LocalWorkspaceSessionEvent[]>();

  constructor(input: InMemoryLocalWorkspaceSessionStoreInput = {}) {
    if (input.events !== undefined) {
      this.appendEvents(input.events);
    }
    if (input.snapshots !== undefined) {
      for (const snapshot of input.snapshots) {
        this.putSnapshot(snapshot);
      }
    }
  }

  putSnapshot(
    input: LocalWorkspaceSessionSnapshot | LocalWorkspaceSessionSnapshotInput,
  ): DeepReadonly<LocalWorkspaceSessionSnapshot> {
    const snapshot = isSnapshotLike(input)
      ? normalizeLocalWorkspaceSessionSnapshot(input)
      : createLocalWorkspaceSessionSnapshot(input);
    this.#snapshots.set(snapshot.sessionId, structuredClone(snapshot));
    this.#snapshotIds.set(snapshot.snapshotId, snapshot.sessionId);
    return deepFreezeClone(snapshot);
  }

  getSnapshot(
    sessionId: string,
  ): DeepReadonly<LocalWorkspaceSessionSnapshot> | undefined {
    const stored = this.#snapshots.get(requireSessionId(sessionId, "sessionId"));
    return stored === undefined ? undefined : deepFreezeClone(stored);
  }

  getSnapshotById(
    snapshotId: string,
  ): DeepReadonly<LocalWorkspaceSessionSnapshot> | undefined {
    const sessionId = this.#snapshotIds.get(requireSnapshotId(snapshotId, "snapshotId"));
    return sessionId === undefined ? undefined : this.getSnapshot(sessionId);
  }

  listSnapshots(
    query: LocalWorkspaceSessionSnapshotQuery = {},
  ): DeepReadonly<readonly LocalWorkspaceSessionSnapshot[]> {
    const limit = optionalLimit(query.limit, "query.limit");
    const workspaceId =
      query.workspaceId === undefined
        ? undefined
        : requireWorkspaceId(query.workspaceId, "query.workspaceId");
    const deviceId =
      query.deviceId === undefined
        ? undefined
        : requireDeviceId(query.deviceId, "query.deviceId");
    const snapshots = Array.from(this.#snapshots.values())
      .filter((snapshot) => workspaceId === undefined || snapshot.workspaceId === workspaceId)
      .filter((snapshot) => deviceId === undefined || snapshot.deviceId === deviceId)
      .sort(compareSnapshots);

    return deepFreezeClone(limit === undefined ? snapshots : snapshots.slice(0, limit));
  }

  deleteSnapshot(sessionId: string): void {
    const normalizedSessionId = requireSessionId(sessionId, "sessionId");
    const snapshot = this.#snapshots.get(normalizedSessionId);
    if (snapshot !== undefined) {
      this.#snapshotIds.delete(snapshot.snapshotId);
    }
    this.#snapshots.delete(normalizedSessionId);
  }

  appendEvent(event: LocalWorkspaceSessionEvent): DeepReadonly<LocalWorkspaceSessionEvent> {
    const normalized = normalizeStoreEvent(event, "event", {});
    const sessionId = normalized.payload?.sessionId;
    if (sessionId === undefined) {
      throw invalidEvent("event payload requires sessionId", { path: "event.payload.sessionId" });
    }

    const existing = this.#events.get(sessionId) ?? [];
    assertNoDuplicateEvent(existing, normalized);
    existing.push(structuredClone(normalized));
    this.#events.set(sessionId, existing);

    return deepFreezeClone(normalized);
  }

  appendEvents(
    events: readonly LocalWorkspaceSessionEvent[],
  ): DeepReadonly<readonly LocalWorkspaceSessionEvent[]> {
    if (!Array.isArray(events)) {
      throw invalidEvent("events must be an array", { path: "events" });
    }

    const normalized = normalizeLocalWorkspaceSessionStoreEvents(events);
    const grouped = new Map<string, LocalWorkspaceSessionEvent[]>();
    for (const event of normalized) {
      const sessionId = event.payload?.sessionId;
      if (sessionId === undefined) {
        throw invalidEvent("event payload requires sessionId", { path: "events.payload.sessionId" });
      }
      const group = grouped.get(sessionId) ?? [];
      group.push(event);
      grouped.set(sessionId, group);
    }

    for (const [sessionId, group] of grouped.entries()) {
      const existing = this.#events.get(sessionId) ?? [];
      for (const event of group) {
        assertNoDuplicateEvent(existing, event);
      }
    }

    for (const [sessionId, group] of grouped.entries()) {
      const existing = this.#events.get(sessionId) ?? [];
      existing.push(...group.map((event) => structuredClone(event)));
      this.#events.set(sessionId, existing);
    }

    return deepFreezeClone(normalized);
  }

  listEvents(
    sessionId: string,
    query: LocalWorkspaceSessionStoreEventQuery = {},
  ): DeepReadonly<readonly LocalWorkspaceSessionEvent[]> {
    const normalizedSessionId = requireSessionId(sessionId, "sessionId");
    const afterSequence = Math.max(
      parseOptionalCursor(query.sinceCursor, "query.sinceCursor"),
      optionalPositiveInteger(query.afterSequence, "query.afterSequence") ?? 0,
    );
    const limit = optionalLimit(query.limit, "query.limit");
    const operation = query.operation === undefined
      ? undefined
      : requireOperation(query.operation, "query.operation");
    const type = query.type === undefined ? undefined : requireEventType(query.type, "query.type");
    const events = (this.#events.get(normalizedSessionId) ?? [])
      .filter((event) => event.sequence > afterSequence)
      .filter((event) => operation === undefined || event.payload?.operation === operation)
      .filter((event) => type === undefined || event.type === type)
      .sort(compareEvents);

    return deepFreezeClone(limit === undefined ? events : events.slice(0, limit));
  }

  exportSession(
    sessionId: string,
  ): DeepReadonly<LocalWorkspaceSessionStoreBundle> | undefined {
    const snapshot = this.getSnapshot(sessionId);
    if (snapshot === undefined) {
      return undefined;
    }
    const events = this.listEvents(snapshot.sessionId);
    const refreshedSnapshot = createLocalWorkspaceSessionSnapshot({
      descriptor: snapshot.descriptor,
      sessionId: snapshot.sessionId,
      snapshotId: snapshot.snapshotId,
      events,
      metadata: snapshot.metadata,
      createdAt: snapshot.createdAt,
      updatedAt: latestTimestamp(
        events.map((event) => event.createdAt),
        snapshot.updatedAt,
      ),
    });
    return createLocalWorkspaceSessionStoreBundle({
      snapshot: refreshedSnapshot,
      events,
    });
  }

  importSession(bundle: LocalWorkspaceSessionStoreBundle): DeepReadonly<LocalWorkspaceSessionStoreBundle> {
    const normalized = normalizeLocalWorkspaceSessionStoreBundle(bundle);
    this.#events.set(
      normalized.snapshot.sessionId,
      normalized.events.map((event) => structuredClone(event)),
    );
    this.putSnapshot(normalized.snapshot);
    return normalized;
  }
}

export function createInMemoryLocalWorkspaceSessionStore(
  input: InMemoryLocalWorkspaceSessionStoreInput = {},
): InMemoryLocalWorkspaceSessionStore {
  return new InMemoryLocalWorkspaceSessionStore(input);
}

function normalizeStoreEvent(
  value: unknown,
  path: string,
  context: EventNormalizationContext,
): DeepReadonly<LocalWorkspaceSessionEvent> {
  if (!isRecord(value)) {
    throw invalidEvent("event must be an object", { path });
  }

  const eventId = requirePattern(value.eventId, EVENT_ID_PATTERN, `${path}.eventId`, "eventId");
  const workspaceId = requireWorkspaceId(value.workspaceId, `${path}.workspaceId`);
  const type = requireEventType(value.type, `${path}.type`);
  const sequence = requirePositiveInteger(value.sequence, `${path}.sequence`);
  const cursor = requireCursor(value.cursor, sequence, `${path}.cursor`);
  const deviceId = requireDeviceId(value.deviceId, `${path}.deviceId`);
  const createdAt = requireIsoTimestamp(value.createdAt, `${path}.createdAt`);
  const payload = normalizeStoreEventPayload(value.payload, `${path}.payload`, context);

  if (context.workspaceId !== undefined && workspaceId !== context.workspaceId) {
    throw invalidEvent("event workspaceId does not match the session snapshot", {
      path: `${path}.workspaceId`,
    });
  }
  if (context.deviceId !== undefined && deviceId !== context.deviceId) {
    throw invalidEvent("event deviceId does not match the session snapshot", {
      path: `${path}.deviceId`,
    });
  }
  if (type !== EVENT_TYPE_BY_OPERATION[payload.operation]) {
    throw invalidEvent("event type does not match payload operation", {
      path: `${path}.type`,
    });
  }

  return deepFreezeClone({
    eventId,
    workspaceId,
    type,
    payload,
    cursor,
    sequence,
    deviceId,
    createdAt,
  });
}

function normalizeStoreEventPayload(
  value: unknown,
  path: string,
  context: EventNormalizationContext,
): LocalWorkspaceSessionEventPayload {
  if (!isRecord(value)) {
    throw invalidEvent("event payload must be an object", { path });
  }
  requireLiteral(value.kind, "localWorkspaceSession", `${path}.kind`);
  if (value.schemaVersion !== LOCAL_WORKSPACE_SESSION_SCHEMA_VERSION) {
    throw invalidEvent("event payload schemaVersion is not supported", {
      path: `${path}.schemaVersion`,
      expected: LOCAL_WORKSPACE_SESSION_SCHEMA_VERSION,
      actual: value.schemaVersion,
    });
  }
  if (value.localOnly !== true) {
    throw invalidEvent("event payload must be local-only", { path: `${path}.localOnly` });
  }

  const operation = requireOperation(value.operation, `${path}.operation`);
  const sessionId = requireSessionId(value.sessionId, `${path}.sessionId`);
  if (context.sessionId !== undefined && sessionId !== context.sessionId) {
    throw invalidEvent("event sessionId does not match the session snapshot", {
      path: `${path}.sessionId`,
    });
  }
  const storagePath = requireNonEmptyString(value.storagePath, `${path}.storagePath`);
  const storagePathDisplay = requireNonEmptyString(
    value.storagePathDisplay,
    `${path}.storagePathDisplay`,
  );
  const gateway = normalizeLocalWorkspaceGateway(
    value.gateway as LocalWorkspaceGatewayDescriptor,
  ) as LocalWorkspaceGatewayDescriptor;
  const lock = value.lock === undefined
    ? undefined
    : normalizeLockPayload(value.lock, `${path}.lock`);
  if (operation === "open" && lock !== undefined) {
    throw invalidEvent("open events must not include lock material", {
      path: `${path}.lock`,
    });
  }
  const reason = sanitizeOptionalString(value.reason, `${path}.reason`, context.redactedFields);

  return optionalFields({
    kind: "localWorkspaceSession" as const,
    schemaVersion: LOCAL_WORKSPACE_SESSION_SCHEMA_VERSION,
    operation,
    sessionId,
    localOnly: true as const,
    storagePath,
    storagePathDisplay,
    gateway,
    lock,
    reason,
  });
}

function normalizeLockPayload(
  value: unknown,
  path: string,
): { readonly lockTokenRef: string } {
  if (!isRecord(value)) {
    throw invalidEvent("event lock payload must be an object", { path });
  }
  const lockTokenRef = requireNonEmptyString(value.lockTokenRef, `${path}.lockTokenRef`);
  if (!REDACTED_LOCK_TOKEN_PATTERN.test(lockTokenRef)) {
    throw invalidEvent("event lock token reference must be redacted", {
      path: `${path}.lockTokenRef`,
    });
  }

  return { lockTokenRef };
}

function summarizeEvents(events: readonly LocalWorkspaceSessionEvent[]): {
  readonly operations: readonly LocalWorkspaceSessionOperation[];
  readonly firstSequence?: number;
  readonly lastSequence?: number;
  readonly cursor?: string;
} {
  if (events.length === 0) {
    return { operations: [] };
  }

  const ordered = [...events].sort(compareEvents);
  return {
    operations: ordered.map((event) => event.payload?.operation as LocalWorkspaceSessionOperation),
    firstSequence: ordered[0].sequence,
    lastSequence: ordered.at(-1)?.sequence,
    cursor: ordered.at(-1)?.cursor,
  };
}

function assertUniqueEvents(events: readonly LocalWorkspaceSessionEvent[]): void {
  const eventIds = new Set<string>();
  const sequencesBySession = new Map<string, Set<number>>();
  const cursorsBySession = new Map<string, Set<string>>();

  for (const event of events) {
    if (eventIds.has(event.eventId)) {
      throw invalidEvent("events must not contain duplicate eventIds", {
        path: "events",
        eventId: event.eventId,
      });
    }
    eventIds.add(event.eventId);

    const sessionId = event.payload?.sessionId;
    if (sessionId === undefined) {
      continue;
    }

    const sequences = sequencesBySession.get(sessionId) ?? new Set<number>();
    if (sequences.has(event.sequence)) {
      throw invalidEvent("events must not contain duplicate sequences for a session", {
        path: "events",
        sessionId,
        sequence: event.sequence,
      });
    }
    sequences.add(event.sequence);
    sequencesBySession.set(sessionId, sequences);

    const cursors = cursorsBySession.get(sessionId) ?? new Set<string>();
    if (cursors.has(event.cursor)) {
      throw invalidEvent("events must not contain duplicate cursors for a session", {
        path: "events",
        sessionId,
        cursor: event.cursor,
      });
    }
    cursors.add(event.cursor);
    cursorsBySession.set(sessionId, cursors);
  }
}

function assertNoDuplicateEvent(
  existing: readonly LocalWorkspaceSessionEvent[],
  event: LocalWorkspaceSessionEvent,
): void {
  const duplicate = existing.find((candidate) =>
    candidate.eventId === event.eventId ||
    candidate.sequence === event.sequence ||
    candidate.cursor === event.cursor
  );
  if (duplicate === undefined) {
    return;
  }
  throw invalidEvent("event already exists in the session store", {
    path: "event",
    eventId: event.eventId,
    sequence: event.sequence,
    cursor: event.cursor,
  });
}

function sanitizeOptionalMetadata(
  value: JsonObject | undefined,
  path: string,
  redactedFields: string[],
): JsonObject | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw invalidMetadata("metadata must be an object when provided", { path });
  }

  return sanitizeJsonObject(value, path, redactedFields);
}

function sanitizeJsonObject(
  value: Record<string, unknown>,
  path: string,
  redactedFields: string[],
  seen: WeakSet<object> = new WeakSet(),
): JsonObject {
  if (seen.has(value)) {
    throw invalidMetadata("metadata must not contain circular references", { path });
  }
  seen.add(value);

  const output: Record<string, JsonValue> = {};
  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`;
    output[key] = SECRET_KEY_PATTERN.test(key)
      ? redactedSecret(nestedPath, nested, redactedFields)
      : sanitizeJsonValue(nested, nestedPath, redactedFields, seen);
  }

  seen.delete(value);
  return output;
}

function sanitizeJsonValue(
  value: unknown,
  path: string,
  redactedFields: string[],
  seen: WeakSet<object>,
): JsonValue {
  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw invalidMetadata("metadata numbers must be finite", { path });
    }
    return value;
  }
  if (typeof value === "string") {
    return sanitizeString(value, path, redactedFields);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw invalidMetadata("metadata must not contain circular references", { path });
    }
    seen.add(value);
    const output = value.map((entry, index) =>
      sanitizeJsonValue(entry, `${path}.${index}`, redactedFields, seen)
    );
    seen.delete(value);
    return output;
  }
  if (isRecord(value)) {
    return sanitizeJsonObject(value, path, redactedFields, seen);
  }

  throw invalidMetadata("metadata must be JSON-compatible", { path });
}

function sanitizeOptionalString(
  value: unknown,
  path: string,
  redactedFields: string[] | undefined,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const text = requireNonEmptyString(value, path);
  return sanitizeString(text, path, redactedFields ?? []);
}

function sanitizeString(value: string, path: string, redactedFields: string[]): string {
  let sanitized = value;
  for (const pattern of SECRET_TEXT_PATTERNS) {
    pattern.lastIndex = 0;
    if (!pattern.test(sanitized)) {
      pattern.lastIndex = 0;
      continue;
    }
    pattern.lastIndex = 0;
    sanitized = sanitized.replace(pattern, (match, prefix) =>
      typeof prefix === "string" ? `${prefix}[redacted-secret]` : "[redacted-secret]"
    );
    redactedFields.push(path);
    pattern.lastIndex = 0;
  }
  return sanitized;
}

function redactedSecret(
  path: string,
  value: unknown,
  redactedFields: string[],
): string {
  redactedFields.push(path);
  return `[redacted:secret:${hashText(String(value))}]`;
}

function normalizeRedaction(
  value: unknown,
  extraRedactedFields: readonly string[],
): LocalWorkspaceSessionStoreRedaction {
  if (!isRecord(value)) {
    throw invalidSnapshot("snapshot redaction must be an object", { path: "redaction" });
  }
  if (value.rawSecretsStored !== false) {
    throw invalidSnapshot("snapshot must not retain raw secrets", {
      path: "redaction.rawSecretsStored",
    });
  }
  if (!Array.isArray(value.redactedFields)) {
    throw invalidSnapshot("redactedFields must be an array", {
      path: "redaction.redactedFields",
    });
  }

  const redactedFields = value.redactedFields.map((field, index) => {
    if (typeof field !== "string" || field.trim().length === 0) {
      throw invalidSnapshot("redactedFields entries must be non-empty strings", {
        path: `redaction.redactedFields.${index}`,
      });
    }
    return field.trim();
  });

  return {
    rawSecretsStored: false,
    redactedFields: sortedUnique([...redactedFields, ...extraRedactedFields]),
  };
}

function readOperations(
  value: unknown,
  path: string,
): readonly LocalWorkspaceSessionOperation[] {
  if (!Array.isArray(value)) {
    throw invalidSnapshot("operations must be an array", { path });
  }
  return value.map((operation, index) =>
    requireOperation(operation, `${path}.${index}`)
  );
}

function parseJsonSource(source: string): unknown {
  try {
    return JSON.parse(source);
  } catch (cause) {
    throw new LocalWorkspaceSessionStoreError(
      LOCAL_WORKSPACE_SESSION_STORE_ERROR_CODES.INVALID_JSON,
      "local workspace session store JSON could not be parsed",
      { cause },
    );
  }
}

function invalidBundleValue(message: string, path: string): never {
  throw invalidBundle(message, { path });
}

function isSnapshotLike(value: unknown): value is LocalWorkspaceSessionSnapshot {
  return isRecord(value) && value.kind === "localWorkspaceSessionSnapshot";
}

function requireLiteral(value: unknown, expected: string, path: string): void {
  if (value !== expected) {
    throw invalidSchema(`${path} must be ${expected}`, { path, expected, actual: value });
  }
}

function requireSchemaVersion(value: unknown, path: string): void {
  if (value !== LOCAL_WORKSPACE_SESSION_STORE_SCHEMA_VERSION) {
    throw invalidSchema("schemaVersion is not supported", {
      path,
      expected: LOCAL_WORKSPACE_SESSION_STORE_SCHEMA_VERSION,
      actual: value,
    });
  }
}

function requireSessionId(value: unknown, path: string): string {
  return requirePattern(value, SESSION_ID_PATTERN, path, "sessionId");
}

function requireSnapshotId(value: unknown, path: string): string {
  return requirePattern(value, SNAPSHOT_ID_PATTERN, path, "snapshotId");
}

function requireWorkspaceId(value: unknown, path: string): string {
  return requirePattern(value, WORKSPACE_ID_PATTERN, path, "workspaceId");
}

function requireDeviceId(value: unknown, path: string): string {
  return requirePattern(value, DEVICE_ID_PATTERN, path, "deviceId");
}

function requirePattern(
  value: unknown,
  pattern: RegExp,
  path: string,
  label: string,
): string {
  if (typeof value !== "string" || !pattern.test(value.trim())) {
    throw invalidId(`${label} has an invalid format`, { path });
  }
  return value.trim();
}

function requireOperation(value: unknown, path: string): LocalWorkspaceSessionOperation {
  if (OPERATIONS.includes(value as LocalWorkspaceSessionOperation)) {
    return value as LocalWorkspaceSessionOperation;
  }
  throw invalidEvent("operation must be open, lock, or unlock", { path });
}

function requireEventType(value: unknown, path: string): LocalWorkspaceSessionEventType {
  if (EVENT_TYPES.includes(value as LocalWorkspaceSessionEventType)) {
    return value as LocalWorkspaceSessionEventType;
  }
  throw invalidEvent("event type is not supported", { path });
}

function requireCursor(value: unknown, sequence: number, path: string): string {
  const cursor = optionalCursor(value, path);
  if (cursor === undefined) {
    throw invalidEvent("cursor must be a positive event cursor", { path });
  }
  if (Number(cursor) !== sequence) {
    throw invalidEvent("cursor must match sequence", { path, sequence });
  }
  return cursor;
}

function optionalCursor(value: unknown, path: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !CURSOR_PATTERN.test(value)) {
    throw invalidEvent("cursor must be a positive event cursor", { path });
  }
  return value;
}

function parseOptionalCursor(value: string | undefined, path: string): number {
  if (value === undefined) {
    return 0;
  }
  return Number(optionalCursor(value, path));
}

function requirePositiveInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw invalidEvent("value must be a positive safe integer", { path });
  }
  return value as number;
}

function optionalPositiveInteger(value: unknown, path: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requirePositiveInteger(value, path);
}

function requireNonNegativeInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw invalidSnapshot("value must be a non-negative safe integer", { path });
  }
  return value as number;
}

function optionalLimit(value: unknown, path: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requirePositiveInteger(value, path);
}

function requireNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw invalidEvent("value must be a non-empty string", { path });
  }
  return value.trim();
}

function requireIsoTimestamp(value: unknown, path: string): string {
  if (typeof value !== "string" || !isIsoTimestamp(value)) {
    throw invalidSnapshot("value must be an ISO timestamp", { path });
  }
  return value;
}

function isIsoTimestamp(value: string): boolean {
  if (!ISO_TIMESTAMP_PATTERN.test(value)) {
    return false;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function latestTimestamp(values: readonly string[], fallback: string): string {
  return values.reduce((latest, value) =>
    Date.parse(value) > Date.parse(latest) ? value : latest, fallback);
}

function idSegment(value: string, maxLength: number): string {
  const withoutPrefix = value.replace(/^(?:wsp|dev|sess)_/, "");
  const sanitized = withoutPrefix.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return (sanitized || "local").slice(0, maxLength);
}

function hashJson(value: unknown): string {
  return hashText(serializeDeterministicJson(value));
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36).padStart(7, "0");
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return Object.freeze(Array.from(new Set(values)).sort(compareStrings));
}

function compareEvents(
  left: LocalWorkspaceSessionEvent,
  right: LocalWorkspaceSessionEvent,
): number {
  return left.sequence - right.sequence || compareStrings(left.eventId, right.eventId);
}

function compareSnapshots(
  left: LocalWorkspaceSessionSnapshot,
  right: LocalWorkspaceSessionSnapshot,
): number {
  return compareStrings(left.workspaceId, right.workspaceId) ||
    compareStrings(left.sessionId, right.sessionId) ||
    compareStrings(left.snapshotId, right.snapshotId);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function optionalFields<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T;
}

function invalidId(
  message: string,
  details: Readonly<Record<string, unknown>>,
): LocalWorkspaceSessionStoreError {
  return new LocalWorkspaceSessionStoreError(
    LOCAL_WORKSPACE_SESSION_STORE_ERROR_CODES.INVALID_ID,
    message,
    { details },
  );
}

function invalidSchema(
  message: string,
  details: Readonly<Record<string, unknown>>,
): LocalWorkspaceSessionStoreError {
  return new LocalWorkspaceSessionStoreError(
    LOCAL_WORKSPACE_SESSION_STORE_ERROR_CODES.INVALID_SCHEMA,
    message,
    { details },
  );
}

function invalidSnapshot(
  message: string,
  details: Readonly<Record<string, unknown>>,
): LocalWorkspaceSessionStoreError {
  return new LocalWorkspaceSessionStoreError(
    LOCAL_WORKSPACE_SESSION_STORE_ERROR_CODES.INVALID_SNAPSHOT,
    message,
    { details },
  );
}

function invalidEvent(
  message: string,
  details: Readonly<Record<string, unknown>>,
): LocalWorkspaceSessionStoreError {
  return new LocalWorkspaceSessionStoreError(
    LOCAL_WORKSPACE_SESSION_STORE_ERROR_CODES.INVALID_EVENT,
    message,
    { details },
  );
}

function invalidMetadata(
  message: string,
  details: Readonly<Record<string, unknown>>,
): LocalWorkspaceSessionStoreError {
  return new LocalWorkspaceSessionStoreError(
    LOCAL_WORKSPACE_SESSION_STORE_ERROR_CODES.INVALID_METADATA,
    message,
    { details },
  );
}

function invalidBundle(
  message: string,
  details: Readonly<Record<string, unknown>>,
): LocalWorkspaceSessionStoreError {
  return new LocalWorkspaceSessionStoreError(
    LOCAL_WORKSPACE_SESSION_STORE_ERROR_CODES.INVALID_BUNDLE,
    message,
    { details },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreezeClone<T>(value: T): DeepReadonly<T> {
  return deepFreeze(structuredClone(value)) as DeepReadonly<T>;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }
  return value;
}
