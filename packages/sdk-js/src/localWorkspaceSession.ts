import {
  redactPathForDisplay,
} from "../../path-security/src/index.ts";
import type {
  AuditRecord,
  JsonObject,
  JsonValue,
} from "./client.ts";
import {
  serializeDeterministicJson,
  validateJsonStorageRelativePath,
  type StorageAdapterError,
} from "./storage.ts";
import {
  validateWorkspaceDescriptor,
  type DeepReadonly,
  type WorkspaceDescriptor,
  type WorkspaceEvent,
} from "./workspace.ts";

export const LOCAL_WORKSPACE_SESSION_SCHEMA_VERSION =
  "local-workspace-session/v1";

export const LOCAL_WORKSPACE_SESSION_ERROR_CODES = Object.freeze({
  INVALID_DESCRIPTOR: "LOCAL_WORKSPACE_SESSION_INVALID_DESCRIPTOR",
  INVALID_EVENT: "LOCAL_WORKSPACE_SESSION_INVALID_EVENT",
  INVALID_GATEWAY: "LOCAL_WORKSPACE_SESSION_INVALID_GATEWAY",
  INVALID_SESSION: "LOCAL_WORKSPACE_SESSION_INVALID_SESSION",
  INVALID_STORAGE_PATH: "LOCAL_WORKSPACE_SESSION_INVALID_STORAGE_PATH",
});

export type LocalWorkspaceSessionErrorCode =
  (typeof LOCAL_WORKSPACE_SESSION_ERROR_CODES)[keyof typeof LOCAL_WORKSPACE_SESSION_ERROR_CODES];

export type LocalWorkspaceGatewayTransport = "http" | "stdio";
export type LocalWorkspaceGatewayHost = "127.0.0.1" | "localhost";
export type LocalWorkspaceSessionOperation = "open" | "lock" | "unlock";
export type LocalWorkspaceSessionEventType =
  | "workspace.session.opened"
  | "workspace.session.locked"
  | "workspace.session.unlocked";

export interface LocalWorkspaceSessionErrorOptions {
  readonly cause?: unknown;
  readonly details?: Readonly<Record<string, unknown>>;
}

export class LocalWorkspaceSessionError extends TypeError {
  readonly code: LocalWorkspaceSessionErrorCode;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    code: LocalWorkspaceSessionErrorCode,
    message: string,
    options: LocalWorkspaceSessionErrorOptions = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "LocalWorkspaceSessionError";
    this.code = code;
    this.details =
      options.details === undefined ? undefined : deepFreezeClone(options.details);
  }
}

export interface LocalWorkspaceGatewayInput {
  readonly transport?: LocalWorkspaceGatewayTransport;
  readonly host?: string;
  readonly port?: number;
}

export interface LocalWorkspaceGatewayDescriptor {
  readonly transport: LocalWorkspaceGatewayTransport;
  readonly host?: LocalWorkspaceGatewayHost;
  readonly port?: number;
}

export interface LocalWorkspaceDescriptorInput extends WorkspaceDescriptor {
  readonly storagePath?: string;
  readonly gateway?: LocalWorkspaceGatewayInput;
}

export interface LocalWorkspaceDescriptor extends WorkspaceDescriptor {
  readonly storagePath: string;
  readonly gateway: LocalWorkspaceGatewayDescriptor;
}

export interface LocalWorkspaceSessionPlanBaseInput {
  readonly descriptor: LocalWorkspaceDescriptorInput | LocalWorkspaceDescriptor;
  readonly sessionId: string;
  readonly sequence?: number;
  readonly cursor?: string;
  readonly createdAt?: string;
  readonly clock?: () => string;
}

export interface LocalWorkspaceSessionOpenInput
  extends LocalWorkspaceSessionPlanBaseInput {
  readonly reason?: string;
}

export interface LocalWorkspaceSessionLockInput
  extends LocalWorkspaceSessionPlanBaseInput {
  readonly lockToken?: string;
  readonly reason?: string;
}

export interface LocalWorkspaceSessionUnlockInput
  extends LocalWorkspaceSessionPlanBaseInput {
  readonly lockToken: string;
  readonly reason?: string;
}

export interface LocalWorkspaceSessionLockPayload {
  readonly lockTokenRef: string;
}

export interface LocalWorkspaceSessionEventPayload {
  readonly kind: "localWorkspaceSession";
  readonly schemaVersion: typeof LOCAL_WORKSPACE_SESSION_SCHEMA_VERSION;
  readonly operation: LocalWorkspaceSessionOperation;
  readonly sessionId: string;
  readonly localOnly: true;
  readonly storagePath: string;
  readonly storagePathDisplay: string;
  readonly gateway: LocalWorkspaceGatewayDescriptor;
  readonly lock?: LocalWorkspaceSessionLockPayload;
  readonly reason?: string;
}

export type LocalWorkspaceSessionEvent =
  WorkspaceEvent<LocalWorkspaceSessionEventPayload>;

export interface LocalWorkspaceSessionAuditPreviewOptions {
  readonly actor?: string;
  readonly createdAt?: string;
  readonly clock?: () => string;
}

export interface LocalWorkspaceSessionAuditPreviewInput
  extends LocalWorkspaceSessionAuditPreviewOptions {
  readonly events: readonly LocalWorkspaceSessionEvent[];
}

const DEFAULT_STORAGE_ROOT = ".sovereignops/sessions";
const DEFAULT_GATEWAY_HOST = "127.0.0.1";
const DEFAULT_GATEWAY_TRANSPORT = "http";
const DEFAULT_GATEWAY_PORT = 0;
const SESSION_ID_PATTERN = /^sess_[A-Za-z0-9_-]{1,88}$/;
const LOCK_TOKEN_PATTERN = /^lock_[A-Za-z0-9_-]{1,120}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const LOCAL_GATEWAY_HOSTS = new Set(["127.0.0.1", "localhost"]);

const EVENT_TYPE_BY_OPERATION = Object.freeze({
  open: "workspace.session.opened",
  lock: "workspace.session.locked",
  unlock: "workspace.session.unlocked",
} satisfies Record<LocalWorkspaceSessionOperation, LocalWorkspaceSessionEventType>);

export function validateLocalWorkspaceStoragePath(path: string): string {
  try {
    return validateJsonStorageRelativePath(path);
  } catch (cause) {
    throw new LocalWorkspaceSessionError(
      LOCAL_WORKSPACE_SESSION_ERROR_CODES.INVALID_STORAGE_PATH,
      "local workspace storage path is invalid",
      {
        cause,
        details: storagePathErrorDetails(path, cause),
      },
    );
  }
}

export function normalizeLocalWorkspaceGateway(
  input: LocalWorkspaceGatewayInput = {},
): DeepReadonly<LocalWorkspaceGatewayDescriptor> {
  if (!isRecord(input)) {
    throw invalidGateway("gateway must be an object", { path: "gateway" });
  }

  const transport = input.transport ?? DEFAULT_GATEWAY_TRANSPORT;
  if (transport !== "http" && transport !== "stdio") {
    throw invalidGateway("gateway.transport must be http or stdio", {
      path: "gateway.transport",
    });
  }

  if (input.host !== undefined && !LOCAL_GATEWAY_HOSTS.has(input.host)) {
    throw invalidGateway("gateway.host must be a local loopback host", {
      path: "gateway.host",
      host: input.host,
      allowedHosts: [...LOCAL_GATEWAY_HOSTS],
    });
  }

  if (input.port !== undefined && !isPort(input.port)) {
    throw invalidGateway("gateway.port must be an integer from 0 to 65535", {
      path: "gateway.port",
    });
  }

  if (transport === "stdio") {
    return deepFreezeClone({ transport });
  }

  return deepFreezeClone({
    transport,
    host: (input.host ?? DEFAULT_GATEWAY_HOST) as LocalWorkspaceGatewayHost,
    port: input.port ?? DEFAULT_GATEWAY_PORT,
  });
}

export function normalizeLocalWorkspaceDescriptor(
  input: LocalWorkspaceDescriptorInput | LocalWorkspaceDescriptor,
): DeepReadonly<LocalWorkspaceDescriptor> {
  if (!isRecord(input)) {
    throw invalidDescriptor("local workspace descriptor must be an object", {
      path: "",
    });
  }

  const workspace = validateWorkspaceDescriptor(input);
  if (!workspace.ok) {
    throw invalidDescriptor("local workspace descriptor is invalid", {
      issues: workspace.error.details?.issues ?? [],
    });
  }

  const storagePath = validateLocalWorkspaceStoragePath(
    input.storagePath ?? `${DEFAULT_STORAGE_ROOT}/${workspace.value.workspaceId}.json`,
  );
  const gateway = normalizeLocalWorkspaceGateway(input.gateway);

  return deepFreezeClone({
    ...workspace.value,
    storagePath,
    gateway,
  });
}

export function planLocalWorkspaceSessionOpenEvent(
  input: LocalWorkspaceSessionOpenInput,
): DeepReadonly<LocalWorkspaceSessionEvent> {
  return planLocalWorkspaceSessionEvent("open", input);
}

export function planLocalWorkspaceSessionLockEvent(
  input: LocalWorkspaceSessionLockInput,
): DeepReadonly<LocalWorkspaceSessionEvent> {
  const lockToken = input.lockToken ?? deriveLockToken(input);
  requireLockToken(lockToken, "lockToken");
  return planLocalWorkspaceSessionEvent("lock", input, {
    lock: {
      lockTokenRef: redactValue("lockToken", lockToken),
    },
  });
}

export function planLocalWorkspaceSessionUnlockEvent(
  input: LocalWorkspaceSessionUnlockInput,
): DeepReadonly<LocalWorkspaceSessionEvent> {
  requireLockToken(input.lockToken, "lockToken");
  return planLocalWorkspaceSessionEvent("unlock", input, {
    lock: {
      lockTokenRef: redactValue("lockToken", input.lockToken),
    },
  });
}

export function createLocalWorkspaceSessionAuditPreviewRecords(
  input: LocalWorkspaceSessionAuditPreviewInput,
): DeepReadonly<readonly AuditRecord[]> {
  if (!Array.isArray(input.events)) {
    throw invalidEvent("events must be an array", { path: "events" });
  }

  const createdAt = input.createdAt ?? input.clock?.();
  if (createdAt !== undefined) {
    requireIsoTimestamp(createdAt, "createdAt");
  }

  const records = input.events.map((event, index) =>
    auditPreviewRecordFor(event, index, {
      actor: input.actor,
      createdAt,
    })
  );

  return deepFreezeClone(records.sort(compareAuditRecords));
}

function planLocalWorkspaceSessionEvent(
  operation: LocalWorkspaceSessionOperation,
  input: LocalWorkspaceSessionPlanBaseInput & { readonly reason?: string },
  extras: Pick<LocalWorkspaceSessionEventPayload, "lock"> = {},
): DeepReadonly<LocalWorkspaceSessionEvent> {
  if (!isRecord(input)) {
    throw invalidEvent("session event input must be an object", { path: "" });
  }

  const descriptor = normalizeLocalWorkspaceDescriptor(input.descriptor);
  const sessionId = requireSessionId(input.sessionId, "sessionId");
  const sequence = optionalPositiveInteger(input.sequence, "sequence", 1);
  const cursor = input.cursor ?? String(sequence);
  requireCursor(cursor, sequence, "cursor");
  const createdAt = requireIsoTimestamp(
    input.createdAt ?? input.clock?.() ?? descriptor.updatedAt,
    "createdAt",
  );
  const reason = optionalNonEmptyString(input.reason, "reason");

  return deepFreezeClone({
    eventId: `evt_${descriptor.workspaceId}_${operation}_${String(sequence).padStart(8, "0")}`,
    workspaceId: descriptor.workspaceId,
    type: EVENT_TYPE_BY_OPERATION[operation],
    payload: optionalFields({
      kind: "localWorkspaceSession" as const,
      schemaVersion: LOCAL_WORKSPACE_SESSION_SCHEMA_VERSION,
      operation,
      sessionId,
      localOnly: true as const,
      storagePath: descriptor.storagePath,
      storagePathDisplay: redactPathForDisplay(descriptor.storagePath, {
        keepSegments: 1,
      }),
      gateway: descriptor.gateway,
      lock: extras.lock,
      reason,
    }),
    cursor,
    sequence,
    deviceId: descriptor.deviceId,
    createdAt,
  });
}

function auditPreviewRecordFor(
  event: LocalWorkspaceSessionEvent,
  index: number,
  options: Required<Pick<LocalWorkspaceSessionAuditPreviewOptions, never>> &
    LocalWorkspaceSessionAuditPreviewOptions,
): AuditRecord {
  const normalized = normalizeLocalWorkspaceSessionEvent(event, index);
  const payload = normalized.payload;
  const redactedFields = [
    "storagePath",
    ...(payload.lock === undefined ? [] : ["lockToken"]),
  ];
  const details = optionalFields({
    kind: "localWorkspaceSessionAuditPreview" as const,
    schemaVersion: LOCAL_WORKSPACE_SESSION_SCHEMA_VERSION,
    eventId: normalized.eventId,
    sequence: normalized.sequence,
    sessionId: payload.sessionId,
    operation: payload.operation,
    localOnly: true as const,
    storagePath: redactValue("path", payload.storagePath),
    storagePathDisplay: payload.storagePathDisplay,
    gateway: payload.gateway,
    lock: payload.lock,
    reason: payload.reason,
    redaction: {
      redacted: true,
      fields: redactedFields,
    },
  }) as JsonObject;

  return {
    auditId: `aud_${normalized.eventId.slice("evt_".length)}`,
    workspaceId: normalized.workspaceId,
    action: normalized.type,
    actor: options.actor ?? normalized.deviceId,
    createdAt: options.createdAt ?? normalized.createdAt,
    details,
  };
}

function normalizeLocalWorkspaceSessionEvent(
  event: LocalWorkspaceSessionEvent,
  index: number,
): LocalWorkspaceSessionEvent {
  if (!isRecord(event)) {
    throw invalidEvent("event must be an object", {
      path: `events.${index}`,
    });
  }

  const type = requireEventType(event.type, `events.${index}.type`);
  const payload = normalizeLocalWorkspaceSessionPayload(
    event.payload,
    `events.${index}.payload`,
  );
  const workspaceId = requireNonEmptyString(
    event.workspaceId,
    `events.${index}.workspaceId`,
  );
  const eventId = requireNonEmptyString(event.eventId, `events.${index}.eventId`);
  const sequence = requirePositiveInteger(
    event.sequence,
    `events.${index}.sequence`,
  );
  const cursor = requireCursor(event.cursor, sequence, `events.${index}.cursor`);
  const deviceId = requireNonEmptyString(event.deviceId, `events.${index}.deviceId`);
  const createdAt = requireIsoTimestamp(
    event.createdAt,
    `events.${index}.createdAt`,
  );

  return {
    eventId,
    workspaceId,
    type,
    payload,
    cursor,
    sequence,
    deviceId,
    createdAt,
  };
}

function normalizeLocalWorkspaceSessionPayload(
  payload: unknown,
  path: string,
): LocalWorkspaceSessionEventPayload {
  if (!isRecord(payload)) {
    throw invalidEvent("event payload must be an object", { path });
  }
  if (payload.kind !== "localWorkspaceSession") {
    throw invalidEvent("event payload kind is not supported", {
      path: `${path}.kind`,
    });
  }
  if (payload.schemaVersion !== LOCAL_WORKSPACE_SESSION_SCHEMA_VERSION) {
    throw invalidEvent("event payload schemaVersion is not supported", {
      path: `${path}.schemaVersion`,
    });
  }
  if (payload.localOnly !== true) {
    throw invalidEvent("event payload must be local-only", {
      path: `${path}.localOnly`,
    });
  }

  const operation = requireOperation(payload.operation, `${path}.operation`);
  const sessionId = requireSessionId(payload.sessionId, `${path}.sessionId`);
  const storagePath = validateLocalWorkspaceStoragePath(
    requireNonEmptyString(payload.storagePath, `${path}.storagePath`),
  );
  const storagePathDisplay = requireNonEmptyString(
    payload.storagePathDisplay,
    `${path}.storagePathDisplay`,
  );
  const gateway = normalizeLocalWorkspaceGateway(
    payload.gateway as LocalWorkspaceGatewayInput,
  );
  const lock = payload.lock === undefined
    ? undefined
    : normalizeLockPayload(payload.lock, `${path}.lock`);
  const reason = optionalNonEmptyString(payload.reason, `${path}.reason`);

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
): LocalWorkspaceSessionLockPayload {
  if (!isRecord(value)) {
    throw invalidEvent("event lock payload must be an object", { path });
  }
  const lockTokenRef = requireNonEmptyString(value.lockTokenRef, `${path}.lockTokenRef`);
  if (!lockTokenRef.startsWith("[redacted:lockToken:")) {
    throw invalidEvent("event lock token must be redacted", {
      path: `${path}.lockTokenRef`,
    });
  }
  return { lockTokenRef };
}

function storagePathErrorDetails(
  path: string,
  cause: unknown,
): Readonly<Record<string, unknown>> {
  const storageError = cause as StorageAdapterError;
  return {
    path,
    ...(isRecord(storageError.details) ? { storageDetails: storageError.details } : {}),
  };
}

function deriveLockToken(input: LocalWorkspaceSessionLockInput): string {
  const descriptor = normalizeLocalWorkspaceDescriptor(input.descriptor);
  const createdAt = requireIsoTimestamp(
    input.createdAt ?? input.clock?.() ?? descriptor.updatedAt,
    "createdAt",
  );
  const timestamp = createdAt.replace(/[^0-9]/g, "");
  return `lock_${descriptor.workspaceId.slice(4)}_${descriptor.deviceId.slice(4)}_${timestamp}`;
}

function requireOperation(
  value: unknown,
  path: string,
): LocalWorkspaceSessionOperation {
  if (value === "open" || value === "lock" || value === "unlock") {
    return value;
  }

  throw invalidEvent("operation must be open, lock, or unlock", { path });
}

function requireEventType(value: unknown, path: string): LocalWorkspaceSessionEventType {
  if (
    value === "workspace.session.opened" ||
    value === "workspace.session.locked" ||
    value === "workspace.session.unlocked"
  ) {
    return value;
  }

  throw invalidEvent("event type is not a local workspace session event", {
    path,
  });
}

function requireSessionId(value: unknown, path: string): string {
  if (typeof value !== "string" || !SESSION_ID_PATTERN.test(value.trim())) {
    throw invalidSession("sessionId must use the sess_ prefix", { path });
  }

  return value.trim();
}

function requireLockToken(value: unknown, path: string): string {
  if (typeof value !== "string" || !LOCK_TOKEN_PATTERN.test(value.trim())) {
    throw invalidSession("lockToken must use the lock_ prefix", { path });
  }

  return value.trim();
}

function requireIsoTimestamp(value: unknown, path: string): string {
  if (typeof value !== "string" || !isIsoTimestamp(value)) {
    throw invalidEvent(`${path} must be an ISO timestamp`, { path });
  }

  return value;
}

function requireCursor(value: unknown, sequence: number, path: string): string {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) {
    throw invalidEvent(`${path} must be a positive event cursor`, { path });
  }
  if (Number(value) !== sequence) {
    throw invalidEvent(`${path} must match sequence`, { path, sequence });
  }

  return value;
}

function requirePositiveInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw invalidEvent(`${path} must be a positive integer`, { path });
  }

  return value as number;
}

function optionalPositiveInteger(
  value: unknown,
  path: string,
  fallback: number,
): number {
  if (value === undefined) {
    return fallback;
  }

  return requirePositiveInteger(value, path);
}

function requireNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw invalidEvent(`${path} must be a non-empty string`, { path });
  }

  return value.trim();
}

function optionalNonEmptyString(value: unknown, path: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return requireNonEmptyString(value, path);
}

function isIsoTimestamp(value: string): boolean {
  if (!ISO_TIMESTAMP_PATTERN.test(value)) {
    return false;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function isPort(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 65535;
}

function invalidDescriptor(
  message: string,
  details: Readonly<Record<string, unknown>>,
): LocalWorkspaceSessionError {
  return new LocalWorkspaceSessionError(
    LOCAL_WORKSPACE_SESSION_ERROR_CODES.INVALID_DESCRIPTOR,
    message,
    { details },
  );
}

function invalidEvent(
  message: string,
  details: Readonly<Record<string, unknown>>,
): LocalWorkspaceSessionError {
  return new LocalWorkspaceSessionError(
    LOCAL_WORKSPACE_SESSION_ERROR_CODES.INVALID_EVENT,
    message,
    { details },
  );
}

function invalidGateway(
  message: string,
  details: Readonly<Record<string, unknown>>,
): LocalWorkspaceSessionError {
  return new LocalWorkspaceSessionError(
    LOCAL_WORKSPACE_SESSION_ERROR_CODES.INVALID_GATEWAY,
    message,
    { details },
  );
}

function invalidSession(
  message: string,
  details: Readonly<Record<string, unknown>>,
): LocalWorkspaceSessionError {
  return new LocalWorkspaceSessionError(
    LOCAL_WORKSPACE_SESSION_ERROR_CODES.INVALID_SESSION,
    message,
    { details },
  );
}

function optionalFields<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T;
}

function redactValue(kind: string, value: string): string {
  return `[redacted:${kind}:${hashText(value)}]`;
}

function hashText(value: string): string {
  const serialized = serializeDeterministicJson({ value });
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36).padStart(7, "0");
}

function compareAuditRecords(left: AuditRecord, right: AuditRecord): number {
  return compareStrings(left.createdAt, right.createdAt) ||
    compareStrings(left.auditId, right.auditId);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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
  if (value === null || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, JsonValue | unknown>)) {
    deepFreeze(nested);
  }

  return value;
}
