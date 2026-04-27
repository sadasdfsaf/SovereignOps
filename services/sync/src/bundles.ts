import { createHash } from "node:crypto";

import {
  INITIAL_CURSOR,
  compareCursors,
  isEventId,
  parseCursor,
} from "./cursors.ts";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult<TValue = unknown> {
  ok: boolean;
  issues: ValidationIssue[];
  value?: TValue;
}

export interface LocalFirstEventEnvelope {
  id: `evt_${string}`;
  workspaceId: `wsp_${string}`;
  deviceId: `dev_${string}`;
  sequence: number;
  type: string;
  payload: JsonValue;
  createdAt: string;
}

export interface SyncedEventEnvelope extends LocalFirstEventEnvelope {
  cursor: string;
}

export interface SyncUploadBatch {
  workspaceId: `wsp_${string}`;
  deviceId: `dev_${string}`;
  baseCursor: string;
  events: LocalFirstEventEnvelope[];
  checksum: string;
}

export interface CreateUploadBatchInput {
  workspaceId: string;
  deviceId: string;
  baseCursor?: string;
  events: readonly LocalFirstEventEnvelope[];
  maxEvents?: number;
}

export interface SyncDownloadRequest {
  workspaceId: `wsp_${string}`;
  deviceId: `dev_${string}`;
  afterCursor: string;
  limit: number;
}

export interface SyncDownloadWindow {
  workspaceId: `wsp_${string}`;
  afterCursor: string;
  nextCursor: string;
  events: SyncedEventEnvelope[];
  hasMore: boolean;
}

export const CONFLICT_CODES = [
  "base_cursor_mismatch",
  "checksum_mismatch",
  "duplicate_event",
  "event_rejected",
] as const;

export type ConflictCode = (typeof CONFLICT_CODES)[number];

export interface ConflictSummary {
  code: ConflictCode;
  message: string;
  eventId?: `evt_${string}`;
  baseCursor?: string;
  remoteCursor?: string;
}

const WORKSPACE_ID_PATTERN = /^wsp_[A-Za-z0-9_-]{1,88}$/;
const DEVICE_ID_PATTERN = /^dev_[A-Za-z0-9_-]{1,88}$/;
const CHECKSUM_PATTERN = /^sha256:[a-f0-9]{64}$/;
const MAX_DOWNLOAD_LIMIT = 500;

export function createUploadBatch(input: CreateUploadBatchInput): SyncUploadBatch {
  const issues: ValidationIssue[] = [];
  requireWorkspaceId(input.workspaceId, "workspaceId", issues);
  requireDeviceId(input.deviceId, "deviceId", issues);

  const baseCursor = input.baseCursor ?? INITIAL_CURSOR;
  requireCursor(baseCursor, "baseCursor", issues);

  if (!Number.isInteger(input.maxEvents ?? 1) || (input.maxEvents ?? 1) <= 0) {
    issues.push({ path: "maxEvents", message: "maxEvents must be a positive integer when provided" });
  }

  if (!Array.isArray(input.events) || input.events.length === 0) {
    issues.push({ path: "events", message: "events must be a non-empty array" });
  }

  if (issues.length > 0) {
    throw new Error(formatValidationIssues("upload batch input", issues));
  }

  const limit = input.maxEvents ?? input.events.length;
  const events = orderEvents(input.events)
    .slice(0, limit)
    .map((event, index) => normalizeEvent(event, input.workspaceId, input.deviceId, `events[${index}]`));

  const batchWithoutChecksum = {
    workspaceId: input.workspaceId as `wsp_${string}`,
    deviceId: input.deviceId as `dev_${string}`,
    baseCursor,
    events,
  };

  return {
    ...batchWithoutChecksum,
    checksum: calculateUploadChecksum(batchWithoutChecksum),
  };
}

export function calculateUploadChecksum(
  batch: Omit<SyncUploadBatch, "checksum">,
): string {
  return `sha256:${createHash("sha256").update(canonicalJson(batch)).digest("hex")}`;
}

export function validateUploadRequest(value: unknown): ValidationResult<SyncUploadBatch> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [{ path: "$", message: "upload request must be an object" }],
    };
  }

  requireOnlyKeys(value, ["workspaceId", "deviceId", "baseCursor", "events", "checksum"], "$", issues);
  requireWorkspaceId(value.workspaceId, "workspaceId", issues);
  requireDeviceId(value.deviceId, "deviceId", issues);
  requireCursor(value.baseCursor, "baseCursor", issues);

  if (typeof value.checksum !== "string" || !CHECKSUM_PATTERN.test(value.checksum)) {
    issues.push({ path: "checksum", message: "checksum must be a sha256 hex digest" });
  }

  const events = validateEventArray(value.events, value.workspaceId, value.deviceId, issues);
  if (events.length > 0 && !isDeterministicallyOrdered(events)) {
    issues.push({ path: "events", message: "events must be sorted by sequence and id" });
  }

  if (issues.length === 0) {
    const expectedChecksum = calculateUploadChecksum({
      workspaceId: value.workspaceId as `wsp_${string}`,
      deviceId: value.deviceId as `dev_${string}`,
      baseCursor: value.baseCursor as string,
      events,
    });

    if (value.checksum !== expectedChecksum) {
      issues.push({ path: "checksum", message: "checksum does not match the upload body" });
    }
  }

  return issues.length === 0
    ? {
        ok: true,
        issues,
        value: {
          workspaceId: value.workspaceId as `wsp_${string}`,
          deviceId: value.deviceId as `dev_${string}`,
          baseCursor: value.baseCursor as string,
          events,
          checksum: value.checksum as string,
        },
      }
    : { ok: false, issues };
}

export function validateDownloadRequest(value: unknown): ValidationResult<SyncDownloadRequest> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [{ path: "$", message: "download request must be an object" }],
    };
  }

  requireOnlyKeys(value, ["workspaceId", "deviceId", "afterCursor", "limit"], "$", issues);
  requireWorkspaceId(value.workspaceId, "workspaceId", issues);
  requireDeviceId(value.deviceId, "deviceId", issues);
  requireCursor(value.afterCursor, "afterCursor", issues);

  if (!Number.isInteger(value.limit) || value.limit < 1 || value.limit > MAX_DOWNLOAD_LIMIT) {
    issues.push({
      path: "limit",
      message: `limit must be an integer from 1 through ${MAX_DOWNLOAD_LIMIT}`,
    });
  }

  return issues.length === 0
    ? {
        ok: true,
        issues,
        value: {
          workspaceId: value.workspaceId as `wsp_${string}`,
          deviceId: value.deviceId as `dev_${string}`,
          afterCursor: value.afterCursor as string,
          limit: value.limit as number,
        },
      }
    : { ok: false, issues };
}

export function validateConflictSummary(value: unknown): ValidationResult<ConflictSummary> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [{ path: "$", message: "conflict summary must be an object" }],
    };
  }

  requireOnlyKeys(value, ["code", "message", "eventId", "baseCursor", "remoteCursor"], "$", issues);
  if (typeof value.code !== "string" || !CONFLICT_CODES.includes(value.code as ConflictCode)) {
    issues.push({ path: "code", message: `code must be one of ${CONFLICT_CODES.join(", ")}` });
  }

  if (typeof value.message !== "string" || value.message.trim().length === 0) {
    issues.push({ path: "message", message: "message must be a non-empty string" });
  }

  if (value.eventId !== undefined && !isEventId(value.eventId)) {
    issues.push({ path: "eventId", message: "eventId must use the evt_ id prefix" });
  }
  if (value.baseCursor !== undefined) {
    requireCursor(value.baseCursor, "baseCursor", issues);
  }
  if (value.remoteCursor !== undefined) {
    requireCursor(value.remoteCursor, "remoteCursor", issues);
  }

  return issues.length === 0
    ? { ok: true, issues, value: value as unknown as ConflictSummary }
    : { ok: false, issues };
}

export function selectDownloadWindow(
  events: readonly SyncedEventEnvelope[],
  request: unknown,
): SyncDownloadWindow {
  const validation = validateDownloadRequest(request);
  if (!validation.ok) {
    throw new Error(formatValidationIssues("download request", validation.issues));
  }

  const selectedRequest = validation.value;
  const orderedEvents = orderSyncedEvents(events).filter(
    (event) =>
      event.workspaceId === selectedRequest.workspaceId &&
      compareCursors(event.cursor, selectedRequest.afterCursor) > 0,
  );
  const selectedEvents = orderedEvents.slice(0, selectedRequest.limit).map(cloneSyncedEvent);
  const nextCursor =
    selectedEvents.length > 0
      ? selectedEvents[selectedEvents.length - 1].cursor
      : selectedRequest.afterCursor;

  return {
    workspaceId: selectedRequest.workspaceId,
    afterCursor: selectedRequest.afterCursor,
    nextCursor,
    events: selectedEvents,
    hasMore: orderedEvents.length > selectedEvents.length,
  };
}

function validateEventArray(
  value: unknown,
  workspaceId: unknown,
  deviceId: unknown,
  issues: ValidationIssue[],
): LocalFirstEventEnvelope[] {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push({ path: "events", message: "events must be a non-empty array" });
    return [];
  }

  const seenIds = new Set<string>();
  const events: LocalFirstEventEnvelope[] = [];

  value.forEach((event, index) => {
    const normalized = validateEvent(event, workspaceId, deviceId, `events[${index}]`, issues);
    if (!normalized) {
      return;
    }
    if (seenIds.has(normalized.id)) {
      issues.push({ path: `events[${index}].id`, message: "event id must be unique within the batch" });
      return;
    }
    seenIds.add(normalized.id);
    events.push(normalized);
  });

  return events;
}

function validateEvent(
  value: unknown,
  workspaceId: unknown,
  deviceId: unknown,
  path: string,
  issues: ValidationIssue[],
): LocalFirstEventEnvelope | undefined {
  if (!isRecord(value)) {
    issues.push({ path, message: "event must be an object" });
    return undefined;
  }

  requireOnlyKeys(value, ["id", "workspaceId", "deviceId", "sequence", "type", "payload", "createdAt"], path, issues);
  if (!isEventId(value.id)) {
    issues.push({ path: `${path}.id`, message: "id must use the evt_ id prefix" });
  }
  if (value.workspaceId !== workspaceId) {
    issues.push({ path: `${path}.workspaceId`, message: "workspaceId must match the upload request" });
  }
  if (value.deviceId !== deviceId) {
    issues.push({ path: `${path}.deviceId`, message: "deviceId must match the upload request" });
  }
  if (!Number.isSafeInteger(value.sequence) || value.sequence < 0) {
    issues.push({ path: `${path}.sequence`, message: "sequence must be a non-negative safe integer" });
  }
  if (typeof value.type !== "string" || value.type.trim().length === 0) {
    issues.push({ path: `${path}.type`, message: "type must be a non-empty string" });
  }
  validateJsonValue(value.payload, `${path}.payload`, issues);
  if (typeof value.createdAt !== "string" || value.createdAt.trim().length === 0) {
    issues.push({ path: `${path}.createdAt`, message: "createdAt must be a non-empty string" });
  }

  if (!isEventId(value.id) || typeof workspaceId !== "string" || typeof deviceId !== "string") {
    return undefined;
  }

  return {
    id: value.id,
    workspaceId: value.workspaceId as `wsp_${string}`,
    deviceId: value.deviceId as `dev_${string}`,
    sequence: value.sequence as number,
    type: value.type as string,
    payload: cloneJson(value.payload as JsonValue),
    createdAt: value.createdAt as string,
  };
}

function normalizeEvent(
  event: LocalFirstEventEnvelope,
  workspaceId: string,
  deviceId: string,
  path: string,
): LocalFirstEventEnvelope {
  const issues: ValidationIssue[] = [];
  const normalized = validateEvent(event, workspaceId, deviceId, path, issues);
  if (!normalized || issues.length > 0) {
    throw new Error(formatValidationIssues("event envelope", issues));
  }
  return normalized;
}

function orderEvents<TEvent extends LocalFirstEventEnvelope>(events: readonly TEvent[]): TEvent[] {
  return [...events].sort(compareEventOrder);
}

function compareEventOrder(left: LocalFirstEventEnvelope, right: LocalFirstEventEnvelope): number {
  if (left.sequence !== right.sequence) {
    return left.sequence < right.sequence ? -1 : 1;
  }
  return left.id.localeCompare(right.id);
}

function isDeterministicallyOrdered(events: readonly LocalFirstEventEnvelope[]): boolean {
  const ordered = orderEvents(events);
  return ordered.every((event, index) => event.id === events[index].id);
}

function orderSyncedEvents(events: readonly SyncedEventEnvelope[]): SyncedEventEnvelope[] {
  return [...events].sort((left, right) => compareCursors(left.cursor, right.cursor) || left.id.localeCompare(right.id));
}

function cloneSyncedEvent(event: SyncedEventEnvelope): SyncedEventEnvelope {
  return {
    ...event,
    payload: cloneJson(event.payload),
  };
}

function cloneJson<TValue extends JsonValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}

function canonicalJson(value: JsonValue | Omit<SyncUploadBatch, "checksum">): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("cannot checksum non-finite numbers");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key] as JsonValue)}`)
      .join(",")}}`;
  }

  throw new Error("cannot checksum unsupported value");
}

function validateJsonValue(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => validateJsonValue(item, `${path}[${index}]`, issues));
    return;
  }

  if (isRecord(value)) {
    for (const [key, nestedValue] of Object.entries(value)) {
      if (nestedValue === undefined) {
        issues.push({ path: `${path}.${key}`, message: "JSON values cannot be undefined" });
      } else {
        validateJsonValue(nestedValue, `${path}.${key}`, issues);
      }
    }
    return;
  }

  issues.push({ path, message: "value must be JSON-compatible" });
}

function requireOnlyKeys(
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  path: string,
  issues: ValidationIssue[],
): void {
  for (const key of Object.keys(record)) {
    if (!allowedKeys.includes(key)) {
      issues.push({ path: path === "$" ? key : `${path}.${key}`, message: "field is not supported" });
    }
  }
}

function requireWorkspaceId(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || !WORKSPACE_ID_PATTERN.test(value)) {
    issues.push({ path, message: "workspaceId must use the wsp_ id prefix" });
  }
}

function requireDeviceId(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || !DEVICE_ID_PATTERN.test(value)) {
    issues.push({ path, message: "deviceId must use the dev_ id prefix" });
  }
}

function requireCursor(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string") {
    issues.push({ path, message: "cursor must be a string" });
    return;
  }

  try {
    parseCursor(value);
  } catch (error) {
    issues.push({ path, message: error instanceof Error ? error.message : "cursor is invalid" });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatValidationIssues(scope: string, issues: readonly ValidationIssue[]): string {
  const details = issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
  return `${scope} validation failed: ${details}`;
}
