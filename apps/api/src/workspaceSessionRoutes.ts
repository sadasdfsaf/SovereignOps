import {
  LOCAL_WORKSPACE_SESSION_ERROR_CODES,
  LocalWorkspaceSessionError,
  createLocalWorkspaceSessionAuditPreviewRecords,
  normalizeLocalWorkspaceDescriptor,
  planLocalWorkspaceSessionLockEvent,
  planLocalWorkspaceSessionOpenEvent,
  planLocalWorkspaceSessionUnlockEvent,
  type LocalWorkspaceDescriptor,
  type LocalWorkspaceDescriptorInput,
  type LocalWorkspaceGatewayDescriptor,
  type LocalWorkspaceSessionEvent,
  type LocalWorkspaceSessionOperation,
} from "../../../packages/sdk-js/src/localWorkspaceSession.ts";
import type {
  AuditRecord,
  JsonObject,
  JsonValue,
} from "../../../packages/sdk-js/src/client.ts";
import type {
  ApiResponse,
  ApiRoute,
  ApiRouter,
} from "./router.ts";
import { jsonError, jsonResponse } from "./router.ts";

export const DEFAULT_WORKSPACE_SESSION_ROUTE_BASE_PATH = "/v1/workspace-session";
export const WORKSPACE_SESSION_API_SCHEMA_VERSION = "workspace-session-api/v1";

export interface WorkspaceSessionRoutesOptions {
  readonly basePath?: string;
  readonly descriptor?: LocalWorkspaceDescriptorInput;
  readonly sessionId?: string;
}

export interface WorkspaceSessionSummaryInput {
  readonly descriptor: LocalWorkspaceDescriptorInput;
  readonly sessionId?: string;
  readonly operations?: readonly LocalWorkspaceSessionOperation[];
}

export interface WorkspaceSessionSummary {
  readonly kind: "workspace-session.summary";
  readonly schemaVersion: typeof WORKSPACE_SESSION_API_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly durableWrites: false;
  readonly workspaceId: string;
  readonly deviceId: string;
  readonly storage: {
    readonly localOnly: true;
    readonly storagePath: string;
    readonly storagePathRedacted: true;
  };
  readonly gateway: LocalWorkspaceGatewayDescriptor;
  readonly session?: {
    readonly sessionId: string;
    readonly operations: readonly LocalWorkspaceSessionOperation[];
  };
}

export interface WorkspaceSessionEventPlanInput {
  readonly operation: LocalWorkspaceSessionOperation;
  readonly sequence?: number;
  readonly cursor?: string;
  readonly createdAt?: string;
  readonly reason?: string;
  readonly lockToken?: string;
}

export interface WorkspaceSessionAuditPreviewInput {
  readonly descriptor: LocalWorkspaceDescriptorInput;
  readonly sessionId: string;
  readonly events: readonly WorkspaceSessionEventPlanInput[];
  readonly actor?: string;
  readonly createdAt?: string;
}

export type WorkspaceSessionPreviewEvent = Omit<LocalWorkspaceSessionEvent, "payload"> & {
  readonly payload: Omit<NonNullable<LocalWorkspaceSessionEvent["payload"]>, "storagePath"> & {
    readonly storagePath: string;
    readonly storagePathRedacted: true;
  };
};

export interface WorkspaceSessionAuditPreviewResponse {
  readonly kind: "workspace-session.audit-preview";
  readonly schemaVersion: typeof WORKSPACE_SESSION_API_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly durableWrites: false;
  readonly summary: WorkspaceSessionSummary;
  readonly events: readonly WorkspaceSessionPreviewEvent[];
  readonly audit: {
    readonly kind: "workspace-session.audit-preview.records";
    readonly localOnly: true;
    readonly redacted: true;
    readonly recordCount: number;
    readonly records: readonly AuditRecord[];
  };
}

type Parsed<TValue> = { ok: true; value: TValue } | { ok: false; error: ApiResponse };
type JsonRecord = Record<string, unknown>;

const WORKSPACE_SESSION_OPERATIONS = Object.freeze(["open", "lock", "unlock"] as const);
const SUMMARY_BODY_KEYS = Object.freeze(["descriptor", "sessionId", "operations"]);
const AUDIT_PREVIEW_BODY_KEYS = Object.freeze([
  "descriptor",
  "sessionId",
  "events",
  "actor",
  "createdAt",
]);
const DESCRIPTOR_KEYS = Object.freeze([
  "workspaceId",
  "deviceId",
  "rootKeyRef",
  "createdAt",
  "updatedAt",
  "storagePath",
  "gateway",
]);
const GATEWAY_KEYS = Object.freeze(["transport", "host", "port"]);
const EVENT_PLAN_KEYS = Object.freeze([
  "operation",
  "sequence",
  "cursor",
  "createdAt",
  "reason",
  "lockToken",
]);

export function summarizeWorkspaceSessionApiInput(
  input: WorkspaceSessionSummaryInput,
): WorkspaceSessionSummary {
  const descriptor = normalizeLocalWorkspaceDescriptor(input.descriptor);
  const operations = input.operations === undefined
    ? []
    : [...input.operations];

  return deepFreeze(optionalFields({
    kind: "workspace-session.summary" as const,
    schemaVersion: WORKSPACE_SESSION_API_SCHEMA_VERSION,
    localOnly: true as const,
    durableWrites: false as const,
    workspaceId: descriptor.workspaceId,
    deviceId: descriptor.deviceId,
    storage: {
      localOnly: true as const,
      storagePath: redactWorkspaceStoragePath(descriptor.storagePath),
      storagePathRedacted: true as const,
    },
    gateway: cloneJsonValue(descriptor.gateway) as LocalWorkspaceGatewayDescriptor,
    session: input.sessionId === undefined
      ? undefined
      : {
        sessionId: input.sessionId,
        operations: Object.freeze(operations),
      },
  }) as WorkspaceSessionSummary);
}

export function createWorkspaceSessionAuditPreview(
  input: WorkspaceSessionAuditPreviewInput,
): WorkspaceSessionAuditPreviewResponse {
  const descriptor = normalizeLocalWorkspaceDescriptor(input.descriptor);
  const events = planWorkspaceSessionEvents(descriptor, input.sessionId, input.events);
  const records = createLocalWorkspaceSessionAuditPreviewRecords({
    events,
    actor: input.actor,
    createdAt: input.createdAt,
  });
  const orderedRecords = orderAuditRecordsByEvents(records, events);
  const summary = summarizeWorkspaceSessionApiInput({
    descriptor,
    sessionId: input.sessionId,
    operations: input.events.map((event) => event.operation),
  });

  return deepFreeze({
    kind: "workspace-session.audit-preview",
    schemaVersion: WORKSPACE_SESSION_API_SCHEMA_VERSION,
    localOnly: true,
    durableWrites: false,
    summary,
    events: events.map((event, index) =>
      redactWorkspaceSessionEvent(event, orderedRecords[index])
    ),
    audit: {
      kind: "workspace-session.audit-preview.records",
      localOnly: true,
      redacted: true,
      recordCount: orderedRecords.length,
      records: orderedRecords,
    },
  } satisfies WorkspaceSessionAuditPreviewResponse);
}

export function createWorkspaceSessionRoutes(
  options: WorkspaceSessionRoutesOptions = {},
): readonly ApiRoute[] {
  const basePath = normalizeBasePath(options.basePath ?? DEFAULT_WORKSPACE_SESSION_ROUTE_BASE_PATH);

  return Object.freeze([
    {
      method: "POST",
      path: joinPath(basePath, "/summary"),
      description: "Summarizes a local workspace session without writing local state.",
      handler: ({ request }) => {
        const parsed = parseWorkspaceSessionSummaryRequest(request.body, options);
        if (!parsed.ok) {
          return parsed.error;
        }

        return workspaceSessionResponse(() =>
          jsonResponse(200, summarizeWorkspaceSessionApiInput(parsed.value))
        );
      },
    },
    {
      method: "POST",
      path: joinPath(basePath, "/audit-preview"),
      description: "Builds a redacted local-only workspace session audit preview.",
      handler: ({ request }) => {
        const parsed = parseWorkspaceSessionAuditPreviewRequest(request.body, options);
        if (!parsed.ok) {
          return parsed.error;
        }

        return workspaceSessionResponse(() =>
          jsonResponse(200, createWorkspaceSessionAuditPreview(parsed.value))
        );
      },
    },
  ]);
}

export function mountWorkspaceSessionRoutes(
  router: ApiRouter,
  options: WorkspaceSessionRoutesOptions = {},
): ApiRouter {
  for (const route of createWorkspaceSessionRoutes(options)) {
    router.register(route);
  }

  return router;
}

function parseWorkspaceSessionSummaryRequest(
  body: unknown,
  options: WorkspaceSessionRoutesOptions,
): Parsed<WorkspaceSessionSummaryInput> {
  const parsedBody = parseOptionalRequestBody(body);
  if (!parsedBody.ok) {
    return parsedBody;
  }

  const keys = allowedKeys(parsedBody.value, SUMMARY_BODY_KEYS, "body");
  if (!keys.ok) {
    return keys;
  }

  const descriptor = parseDescriptorInput(
    parsedBody.value.descriptor ?? options.descriptor,
    "body.descriptor",
  );
  if (!descriptor.ok) {
    return descriptor;
  }

  const sessionId = parseOptionalString(
    parsedBody.value.sessionId ?? options.sessionId,
    "body.sessionId",
  );
  if (!sessionId.ok) {
    return sessionId;
  }

  const operations = parseOptionalOperationArray(
    parsedBody.value.operations,
    "body.operations",
  );
  if (!operations.ok) {
    return operations;
  }

  return {
    ok: true,
    value: optionalFields({
      descriptor: descriptor.value,
      sessionId: sessionId.value,
      operations: operations.value,
    }) as WorkspaceSessionSummaryInput,
  };
}

function parseWorkspaceSessionAuditPreviewRequest(
  body: unknown,
  options: WorkspaceSessionRoutesOptions,
): Parsed<WorkspaceSessionAuditPreviewInput> {
  const parsedBody = parseRequiredRequestBody(body);
  if (!parsedBody.ok) {
    return parsedBody;
  }

  const keys = allowedKeys(parsedBody.value, AUDIT_PREVIEW_BODY_KEYS, "body");
  if (!keys.ok) {
    return keys;
  }

  const descriptor = parseDescriptorInput(
    parsedBody.value.descriptor ?? options.descriptor,
    "body.descriptor",
  );
  if (!descriptor.ok) {
    return descriptor;
  }

  const sessionId = parseRequiredString(
    parsedBody.value.sessionId ?? options.sessionId,
    "body.sessionId",
  );
  if (!sessionId.ok) {
    return sessionId;
  }

  const events = parseRequiredEventPlanArray(parsedBody.value.events, "body.events");
  if (!events.ok) {
    return events;
  }

  const actor = parseOptionalString(parsedBody.value.actor, "body.actor");
  if (!actor.ok) {
    return actor;
  }

  const createdAt = parseOptionalString(parsedBody.value.createdAt, "body.createdAt");
  if (!createdAt.ok) {
    return createdAt;
  }

  return {
    ok: true,
    value: optionalFields({
      descriptor: descriptor.value,
      sessionId: sessionId.value,
      events: events.value,
      actor: actor.value,
      createdAt: createdAt.value,
    }) as WorkspaceSessionAuditPreviewInput,
  };
}

function parseOptionalRequestBody(body: unknown): Parsed<JsonRecord> {
  if (body === undefined) {
    return { ok: true, value: {} };
  }

  return parseRequiredRequestBody(body);
}

function parseRequiredRequestBody(body: unknown): Parsed<JsonRecord> {
  const json = cloneJsonCompatibleValue(body, "body");
  if (!json.ok) {
    return json;
  }
  if (!isRecord(json.value)) {
    return validationFailure("Request body must be an object.", { path: "body" });
  }

  return { ok: true, value: json.value };
}

function parseDescriptorInput(value: unknown, path: string): Parsed<LocalWorkspaceDescriptorInput> {
  if (!isRecord(value)) {
    return validationFailure("Local workspace descriptor must be an object.", { path });
  }

  const keys = allowedKeys(value, DESCRIPTOR_KEYS, path);
  if (!keys.ok) {
    return keys;
  }

  if (value.gateway !== undefined) {
    if (!isRecord(value.gateway)) {
      return validationFailure("Local workspace gateway must be an object.", {
        path: `${path}.gateway`,
      });
    }
    const gatewayKeys = allowedKeys(value.gateway, GATEWAY_KEYS, `${path}.gateway`);
    if (!gatewayKeys.ok) {
      return gatewayKeys;
    }
  }

  return { ok: true, value: value as unknown as LocalWorkspaceDescriptorInput };
}

function parseRequiredEventPlanArray(
  value: unknown,
  path: string,
): Parsed<readonly WorkspaceSessionEventPlanInput[]> {
  if (!Array.isArray(value) || value.length === 0) {
    return validationFailure("Events must be a non-empty array.", { path });
  }

  const events: WorkspaceSessionEventPlanInput[] = [];
  for (const [index, item] of value.entries()) {
    const itemPath = `${path}.${index}`;
    if (!isRecord(item)) {
      return validationFailure("Event plan must be an object.", { path: itemPath });
    }

    const keys = allowedKeys(item, EVENT_PLAN_KEYS, itemPath);
    if (!keys.ok) {
      return keys;
    }

    const operation = parseRequiredOperation(item.operation, `${itemPath}.operation`);
    if (!operation.ok) {
      return operation;
    }

    const sequence = parseOptionalPositiveInteger(item.sequence, `${itemPath}.sequence`);
    if (!sequence.ok) {
      return sequence;
    }

    const cursor = parseOptionalString(item.cursor, `${itemPath}.cursor`);
    if (!cursor.ok) {
      return cursor;
    }

    const createdAt = parseOptionalString(item.createdAt, `${itemPath}.createdAt`);
    if (!createdAt.ok) {
      return createdAt;
    }

    const reason = parseOptionalString(item.reason, `${itemPath}.reason`);
    if (!reason.ok) {
      return reason;
    }

    const lockToken = parseOptionalString(item.lockToken, `${itemPath}.lockToken`);
    if (!lockToken.ok) {
      return lockToken;
    }

    if (operation.value === "open" && lockToken.value !== undefined) {
      return validationFailure("Open events must not include lockToken.", {
        path: `${itemPath}.lockToken`,
      });
    }
    if (operation.value === "unlock" && lockToken.value === undefined) {
      return validationFailure("Unlock events require lockToken.", {
        path: `${itemPath}.lockToken`,
      });
    }

    events.push(optionalFields({
      operation: operation.value,
      sequence: sequence.value,
      cursor: cursor.value,
      createdAt: createdAt.value,
      reason: reason.value,
      lockToken: lockToken.value,
    }) as WorkspaceSessionEventPlanInput);
  }

  return { ok: true, value: Object.freeze(events) };
}

function parseOptionalOperationArray(
  value: unknown,
  path: string,
): Parsed<readonly LocalWorkspaceSessionOperation[] | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (!Array.isArray(value)) {
    return validationFailure("Operations must be an array.", { path });
  }

  const operations: LocalWorkspaceSessionOperation[] = [];
  for (const [index, item] of value.entries()) {
    const parsed = parseRequiredOperation(item, `${path}.${index}`);
    if (!parsed.ok) {
      return parsed;
    }
    operations.push(parsed.value);
  }

  return { ok: true, value: Object.freeze(operations) };
}

function parseRequiredOperation(
  value: unknown,
  path: string,
): Parsed<LocalWorkspaceSessionOperation> {
  if (WORKSPACE_SESSION_OPERATIONS.includes(value as LocalWorkspaceSessionOperation)) {
    return { ok: true, value: value as LocalWorkspaceSessionOperation };
  }

  return validationFailure("Operation must be open, lock, or unlock.", { path });
}

function parseRequiredString(value: unknown, path: string): Parsed<string> {
  const parsed = readTrimmedString(value);
  if (parsed === undefined) {
    return validationFailure("Value must be a non-empty string.", { path });
  }

  return { ok: true, value: parsed };
}

function parseOptionalString(value: unknown, path: string): Parsed<string | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  return parseRequiredString(value, path);
}

function parseOptionalPositiveInteger(value: unknown, path: string): Parsed<number | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    return validationFailure("Value must be a positive safe integer.", { path });
  }

  return { ok: true, value: Number(value) };
}

function planWorkspaceSessionEvents(
  descriptor: LocalWorkspaceDescriptor,
  sessionId: string,
  plans: readonly WorkspaceSessionEventPlanInput[],
): readonly LocalWorkspaceSessionEvent[] {
  return plans.map((plan, index) => {
    const sequence = plan.sequence ?? index + 1;
    const base = optionalFields({
      descriptor,
      sessionId,
      sequence,
      cursor: plan.cursor,
      createdAt: plan.createdAt,
      reason: plan.reason,
    });

    if (plan.operation === "open") {
      return planLocalWorkspaceSessionOpenEvent(base);
    }
    if (plan.operation === "lock") {
      return planLocalWorkspaceSessionLockEvent({
        ...base,
        lockToken: plan.lockToken,
      });
    }

    return planLocalWorkspaceSessionUnlockEvent({
      ...base,
      lockToken: plan.lockToken as string,
    });
  });
}

function redactWorkspaceSessionEvent(
  event: LocalWorkspaceSessionEvent,
  record: AuditRecord | undefined,
): WorkspaceSessionPreviewEvent {
  const payload = event.payload;
  const redactedPath = readAuditRecordStoragePath(record) ??
    redactWorkspaceStoragePath(payload.storagePath);

  return deepFreeze({
    ...cloneJsonValue(event),
    payload: {
      ...cloneJsonValue(payload),
      storagePath: redactedPath,
      storagePathRedacted: true,
    },
  } as WorkspaceSessionPreviewEvent);
}

function readAuditRecordStoragePath(record: AuditRecord | undefined): string | undefined {
  const details = record?.details;
  if (details === undefined) {
    return undefined;
  }

  const storagePath = details.storagePath;
  return typeof storagePath === "string" ? storagePath : undefined;
}

function orderAuditRecordsByEvents(
  records: readonly AuditRecord[],
  events: readonly LocalWorkspaceSessionEvent[],
): readonly AuditRecord[] {
  const recordsByEventId = new Map<string, AuditRecord>();
  for (const record of records) {
    const eventId = readAuditRecordEventId(record);
    if (eventId !== undefined) {
      recordsByEventId.set(eventId, record);
    }
  }

  const ordered = events
    .map((event) => recordsByEventId.get(event.eventId))
    .filter((record): record is AuditRecord => record !== undefined);

  return Object.freeze(ordered);
}

function readAuditRecordEventId(record: AuditRecord): string | undefined {
  const details = record.details;
  if (details === undefined) {
    return undefined;
  }

  const eventId = details.eventId;
  return typeof eventId === "string" ? eventId : undefined;
}

function workspaceSessionResponse(callback: () => ApiResponse): ApiResponse {
  try {
    return callback();
  } catch (error) {
    return caughtWorkspaceSessionRouteError(error);
  }
}

function caughtWorkspaceSessionRouteError(error: unknown): ApiResponse {
  if (error instanceof LocalWorkspaceSessionError) {
    return validationError(error.message, routeDetailsForSessionError(error));
  }

  if (error instanceof TypeError) {
    return validationError(error.message, { path: "body" });
  }

  return jsonError(
    500,
    "workspace_session_route_failed",
    "Workspace session route failed.",
  );
}

function routeDetailsForSessionError(
  error: LocalWorkspaceSessionError,
): Readonly<Record<string, unknown>> {
  const sdkPath = isRecord(error.details) && typeof error.details.path === "string"
    ? error.details.path
    : undefined;

  return {
    path: routePathForSessionError(error.code, sdkPath),
    sdkCode: error.code,
  };
}

function routePathForSessionError(
  code: string,
  sdkPath: string | undefined,
): string {
  if (code === LOCAL_WORKSPACE_SESSION_ERROR_CODES.INVALID_STORAGE_PATH) {
    return "body.descriptor.storagePath";
  }
  if (code === LOCAL_WORKSPACE_SESSION_ERROR_CODES.INVALID_GATEWAY) {
    return sdkPath === undefined || sdkPath.length === 0
      ? "body.descriptor.gateway"
      : `body.descriptor.${sdkPath}`;
  }
  if (code === LOCAL_WORKSPACE_SESSION_ERROR_CODES.INVALID_DESCRIPTOR) {
    return "body.descriptor";
  }
  if (sdkPath !== undefined && sdkPath.length > 0) {
    return `body.${sdkPath}`;
  }

  return "body";
}

function validationFailure<TValue>(
  message: string,
  details: Readonly<Record<string, unknown>>,
): Parsed<TValue> {
  return { ok: false, error: validationError(message, details) };
}

function validationError(
  message: string,
  details: Readonly<Record<string, unknown>>,
): ApiResponse {
  return jsonError(400, "validation_failed", message, details);
}

function cloneJsonCompatibleValue(
  value: unknown,
  path: string,
  seen: WeakSet<object> = new WeakSet<object>(),
): Parsed<unknown> {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return { ok: true, value };
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return validationFailure("Request body must be JSON-compatible.", { path });
    }

    return { ok: true, value };
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return validationFailure("Request body must not contain circular references.", { path });
    }
    seen.add(value);
    const values: unknown[] = [];
    for (const [index, item] of value.entries()) {
      const parsed = cloneJsonCompatibleValue(item, `${path}.${index}`, seen);
      if (!parsed.ok) {
        return parsed;
      }
      values.push(parsed.value);
    }
    seen.delete(value);
    return { ok: true, value: Object.freeze(values) };
  }

  if (isRecord(value)) {
    if (seen.has(value)) {
      return validationFailure("Request body must not contain circular references.", { path });
    }
    seen.add(value);
    const output: JsonRecord = {};
    for (const [key, nested] of Object.entries(value)) {
      if (nested === undefined) {
        return validationFailure("Request body must be JSON-compatible.", {
          path: `${path}.${key}`,
        });
      }
      const parsed = cloneJsonCompatibleValue(nested, `${path}.${key}`, seen);
      if (!parsed.ok) {
        return parsed;
      }
      output[key] = parsed.value;
    }
    seen.delete(value);
    return { ok: true, value: deepFreeze(output) };
  }

  return validationFailure("Request body must be JSON-compatible.", { path });
}

function allowedKeys(
  record: JsonRecord,
  keys: readonly string[],
  path: string,
): { ok: true } | { ok: false; error: ApiResponse } {
  const allowed = new Set(keys);
  const unknown = Object.keys(record).find((key) => !allowed.has(key));
  if (unknown) {
    return validationFailure("Request body contains an unknown field.", {
      path: `${path}.${unknown}`,
    });
  }

  return { ok: true };
}

function redactWorkspaceStoragePath(path: string): string {
  return `[redacted:path:${hashText(path)}]`;
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  return hash.toString(36).padStart(7, "0");
}

function normalizeBasePath(path: string): string {
  const trimmed = path.trim();
  if (trimmed.length === 0 || trimmed === "/") {
    return "";
  }

  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const collapsed = withSlash.replace(/\/+/g, "/");

  return collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed;
}

function joinPath(basePath: string, suffix: string): string {
  const normalizedSuffix = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `${basePath}${normalizedSuffix}`;
}

function readTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalFields<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T;
}

function cloneJsonValue<T>(value: T): T {
  return structuredClone(value);
}

function isRecord(value: unknown): value is JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, JsonValue | unknown>)) {
    deepFreeze(nested);
  }

  return value;
}
