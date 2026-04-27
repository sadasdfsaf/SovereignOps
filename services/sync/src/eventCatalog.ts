import { createHash } from "node:crypto";

import {
  INITIAL_CURSOR,
  advanceCursor,
  parseCursor,
} from "./cursors.ts";
import { replayAcceptedEvents, type ReplayAuditSummary, type ReplayWindow } from "./replay.ts";
import type {
  JsonValue,
  SyncedEventEnvelope,
  ValidationIssue,
  ValidationResult,
} from "./bundles.ts";

export const CANONICAL_LOCAL_EVENT_SCHEMA_VERSION = "canonical-local-event/v1";
export const EVENT_REPLAY_CATALOG_DIGEST_ALGORITHM = "sha256";

export type CanonicalLocalReplayOperation =
  | "append"
  | "update"
  | "delete"
  | "approval_requested"
  | "approval_approved"
  | "approval_rejected";

export interface CanonicalLocalReplayRedactionMetadata {
  redacted: boolean;
  redactedFieldCount: number;
  redactedPaths: readonly string[];
  retainedMetadataKeys: readonly string[];
}

export interface CanonicalLocalReplayEvent {
  schemaVersion: typeof CANONICAL_LOCAL_EVENT_SCHEMA_VERSION;
  id: `evt_${string}`;
  workspaceId: `wsp_${string}`;
  actorId: `act_${string}`;
  sequence: number;
  occurredAt: string;
  recordedAt: string;
  localOnly: true;
  operation: CanonicalLocalReplayOperation;
  payload: JsonValue;
  payloadDigest: string;
  previousDigest: string | null;
  redactionMetadata: CanonicalLocalReplayRedactionMetadata;
}

export interface EventReplayCatalogInput {
  workspaceId: string;
  deviceId: string;
  baseCursor?: string;
  digest?: string;
  events: readonly CanonicalLocalReplayEvent[];
}

export interface ValidatedEventReplayCatalogInput {
  workspaceId: `wsp_${string}`;
  deviceId: `dev_${string}`;
  baseCursor: string;
  digest?: `sha256:${string}`;
  events: CanonicalLocalReplayEvent[];
}

export interface EventReplayCatalogDigestInput {
  workspaceId: `wsp_${string}`;
  baseCursor?: string;
  events: readonly CanonicalLocalReplayEvent[];
}

export interface EventReplayCatalogSummary extends ReplayAuditSummary {
  digest: `sha256:${string}`;
  firstEventDigest?: string;
  lastEventDigest?: string;
}

export interface EventReplayCatalog {
  workspaceId: `wsp_${string}`;
  deviceId: `dev_${string}`;
  baseCursor: string;
  nextCursor: string;
  digest: `sha256:${string}`;
  firstEventDigest?: string;
  lastEventDigest?: string;
  events: SyncedEventEnvelope[];
  replay: ReplayWindow;
  summary: EventReplayCatalogSummary;
}

const WORKSPACE_ID_PATTERN = /^wsp_[A-Za-z0-9_-]{1,88}$/;
const DEVICE_ID_PATTERN = /^dev_[A-Za-z0-9_-]{1,88}$/;
const ACTOR_ID_PATTERN = /^act_[A-Za-z0-9_-]{1,88}$/;
const EVENT_ID_PATTERN = /^evt_[A-Za-z0-9_-]{1,88}$/;
const HEX_SHA256_PATTERN = /^[a-f0-9]{64}$/;
const CATALOG_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const CANONICAL_LOCAL_REPLAY_OPERATIONS = [
  "append",
  "update",
  "delete",
  "approval_requested",
  "approval_approved",
  "approval_rejected",
] as const satisfies readonly CanonicalLocalReplayOperation[];

export function calculateCanonicalLocalEventPayloadDigest(payload: JsonValue): string {
  return sha256(canonicalJson(payload));
}

export function calculateCanonicalLocalEventDigest(event: CanonicalLocalReplayEvent): string {
  return sha256(canonicalJson(canonicalEventDigestBody(event)));
}

export function calculateEventReplayCatalogDigest(
  input: EventReplayCatalogDigestInput,
): `sha256:${string}` {
  const baseCursor = input.baseCursor ?? INITIAL_CURSOR;
  parseCursor(baseCursor);

  return `sha256:${sha256(
    canonicalJson({
      workspaceId: input.workspaceId,
      baseCursor,
      events: input.events.map(canonicalEventDigestBody),
    }),
  )}`;
}

export function validateEventReplayCatalog(
  value: unknown,
): ValidationResult<ValidatedEventReplayCatalogInput> {
  const issues: ValidationIssue[] = [];
  const record = requireRecordAtPath(value, "$", issues);
  if (!record) {
    return { ok: false, issues };
  }

  requireOnlyKeys(record, ["workspaceId", "deviceId", "baseCursor", "digest", "events"], "$", issues);
  requireWorkspaceId(record.workspaceId, "workspaceId", issues);
  requireDeviceId(record.deviceId, "deviceId", issues);

  const baseCursor = record.baseCursor ?? INITIAL_CURSOR;
  requireCursor(baseCursor, "baseCursor", issues);

  if (record.digest !== undefined && !isCatalogDigest(record.digest)) {
    issues.push({ path: "digest", message: "digest must be a sha256 hex digest" });
  }

  const workspaceId = typeof record.workspaceId === "string" ? record.workspaceId : undefined;
  const events = validateCanonicalReplayEvents(record.events, workspaceId, issues);

  if (
    issues.length === 0 &&
    record.digest !== undefined &&
    record.digest !== calculateEventReplayCatalogDigest({
      workspaceId: record.workspaceId as `wsp_${string}`,
      baseCursor: baseCursor as string,
      events,
    })
  ) {
    issues.push({ path: "digest", message: "digest does not match the canonical replay catalog" });
  }

  return issues.length === 0
    ? {
        ok: true,
        issues,
        value: {
          workspaceId: record.workspaceId as `wsp_${string}`,
          deviceId: record.deviceId as `dev_${string}`,
          baseCursor: baseCursor as string,
          digest: record.digest as `sha256:${string}` | undefined,
          events: events.map(cloneCanonicalReplayEvent),
        },
      }
    : { ok: false, issues };
}

export function createEventReplayCatalog(input: unknown): EventReplayCatalog {
  const validation = validateEventReplayCatalog(input);
  if (!validation.ok || validation.value === undefined) {
    throw new Error(formatValidationIssues("event replay catalog", validation.issues));
  }

  const request = validation.value;
  const events = toSyncedReplayEvents(request);
  const replay = replayAcceptedEvents(events, {
    workspaceId: request.workspaceId,
    afterCursor: request.baseCursor,
    limit: Math.max(1, events.length),
  });
  const digest =
    request.digest ??
    calculateEventReplayCatalogDigest({
      workspaceId: request.workspaceId,
      baseCursor: request.baseCursor,
      events: request.events,
    });
  const eventDigests = request.events.map(calculateCanonicalLocalEventDigest);
  const lastEvent = events[events.length - 1];
  const nextCursor = lastEvent ? lastEvent.cursor : request.baseCursor;

  return {
    workspaceId: request.workspaceId,
    deviceId: request.deviceId,
    baseCursor: request.baseCursor,
    nextCursor,
    digest,
    firstEventDigest: eventDigests[0],
    lastEventDigest: eventDigests[eventDigests.length - 1],
    events,
    replay,
    summary: createEventReplayCatalogSummary({
      digest,
      firstEventDigest: eventDigests[0],
      lastEventDigest: eventDigests[eventDigests.length - 1],
      replayAudit: replay.audit,
    }),
  };
}

export function createEventReplayCatalogSummary(input: {
  digest: `sha256:${string}`;
  firstEventDigest?: string;
  lastEventDigest?: string;
  replayAudit: ReplayAuditSummary;
}): EventReplayCatalogSummary {
  return {
    ...input.replayAudit,
    digest: input.digest,
    firstEventDigest: input.firstEventDigest,
    lastEventDigest: input.lastEventDigest,
  };
}

function validateCanonicalReplayEvents(
  value: unknown,
  workspaceId: string | undefined,
  issues: ValidationIssue[],
): CanonicalLocalReplayEvent[] {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push({ path: "events", message: "events must be a non-empty array" });
    return [];
  }

  const events: CanonicalLocalReplayEvent[] = [];
  const seenIds = new Set<string>();
  let previousDigest: string | null = null;
  let previousRecordedAt: number | undefined;

  value.forEach((candidate, index) => {
    const path = `events[${index}]`;
    const event = validateCanonicalReplayEvent(candidate, path, issues);
    if (!event) {
      return;
    }

    if (seenIds.has(event.id)) {
      issues.push({ path: `${path}.id`, message: "event ids must be unique" });
    }
    seenIds.add(event.id);

    if (workspaceId !== undefined && event.workspaceId !== workspaceId) {
      issues.push({
        path: `${path}.workspaceId`,
        message: "event workspaceId must match catalog workspaceId",
      });
    }

    if (event.sequence !== index + 1) {
      issues.push({
        path: `${path}.sequence`,
        message: "event sequence must be contiguous and start at 1",
      });
    }

    const recordedAtMs = Date.parse(event.recordedAt);
    if (!Number.isNaN(recordedAtMs)) {
      if (previousRecordedAt !== undefined && recordedAtMs < previousRecordedAt) {
        issues.push({
          path: `${path}.recordedAt`,
          message: "recordedAt must not move backward within a catalog",
        });
      }
      previousRecordedAt = recordedAtMs;
    }

    const expectedPayloadDigest = calculateCanonicalLocalEventPayloadDigest(event.payload);
    if (event.payloadDigest !== expectedPayloadDigest) {
      issues.push({
        path: `${path}.payloadDigest`,
        message: "payloadDigest must match the canonical payload digest",
      });
    }

    if (event.previousDigest !== previousDigest) {
      issues.push({
        path: `${path}.previousDigest`,
        message:
          index === 0
            ? "first event previousDigest must be null"
            : "previousDigest must match the prior event digest",
      });
    }

    previousDigest = calculateCanonicalLocalEventDigest(event);
    events.push(cloneCanonicalReplayEvent(event));
  });

  return events;
}

function validateCanonicalReplayEvent(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): CanonicalLocalReplayEvent | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, canonicalReplayEventKeys, path, issues);
  requireExactString(record.schemaVersion, CANONICAL_LOCAL_EVENT_SCHEMA_VERSION, `${path}.schemaVersion`, issues);
  requireEventId(record.id, `${path}.id`, issues);
  requireWorkspaceId(record.workspaceId, `${path}.workspaceId`, issues);
  requireActorId(record.actorId, `${path}.actorId`, issues);
  requirePositiveSafeInteger(record.sequence, `${path}.sequence`, issues);
  requireTimestamp(record.occurredAt, `${path}.occurredAt`, issues);
  requireTimestamp(record.recordedAt, `${path}.recordedAt`, issues);
  requireRecordedAtAfterOccurredAt(record, path, issues);
  requireTrue(record.localOnly, `${path}.localOnly`, issues);
  requireOperation(record.operation, `${path}.operation`, issues);
  validateJsonValue(record.payload, `${path}.payload`, issues);
  requireHexDigest(record.payloadDigest, `${path}.payloadDigest`, issues);
  requireNullableHexDigest(record.previousDigest, `${path}.previousDigest`, issues);
  validateRedactionMetadata(record.redactionMetadata, `${path}.redactionMetadata`, issues);

  if (
    !isEventId(record.id) ||
    !isWorkspaceId(record.workspaceId) ||
    !isActorId(record.actorId) ||
    !isOperation(record.operation) ||
    !isJsonValue(record.payload) ||
    !isRedactionMetadata(record.redactionMetadata) ||
    !isHexDigest(record.payloadDigest) ||
    !(record.previousDigest === null || isHexDigest(record.previousDigest)) ||
    typeof record.occurredAt !== "string" ||
    typeof record.recordedAt !== "string" ||
    record.localOnly !== true ||
    !Number.isSafeInteger(record.sequence)
  ) {
    return undefined;
  }

  return cloneCanonicalReplayEvent(record as unknown as CanonicalLocalReplayEvent);
}

function toSyncedReplayEvents(input: ValidatedEventReplayCatalogInput): SyncedEventEnvelope[] {
  let cursor = input.baseCursor;

  return input.events.map((event) => {
    cursor = advanceCursor(cursor, [event.id]);
    return {
      id: event.id,
      workspaceId: input.workspaceId,
      deviceId: input.deviceId,
      sequence: event.sequence,
      type: `canonical.${event.operation}`,
      payload: cloneJson({
        schemaVersion: event.schemaVersion,
        actorId: event.actorId,
        occurredAt: event.occurredAt,
        operation: event.operation,
        payload: event.payload,
        payloadDigest: event.payloadDigest,
        previousDigest: event.previousDigest,
        redactionMetadata: event.redactionMetadata,
      }) as JsonValue,
      createdAt: event.recordedAt,
      cursor,
    };
  });
}

function canonicalEventDigestBody(event: CanonicalLocalReplayEvent): Record<string, unknown> {
  return {
    schemaVersion: event.schemaVersion,
    id: event.id,
    workspaceId: event.workspaceId,
    actorId: event.actorId,
    sequence: event.sequence,
    occurredAt: event.occurredAt,
    recordedAt: event.recordedAt,
    localOnly: event.localOnly,
    operation: event.operation,
    payload: event.payload,
    payloadDigest: event.payloadDigest,
    previousDigest: event.previousDigest,
    redactionMetadata: event.redactionMetadata,
  };
}

function validateRedactionMetadata(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return;
  }

  requireOnlyKeys(record, redactionMetadataKeys, path, issues);
  if (typeof record.redacted !== "boolean") {
    issues.push({ path: `${path}.redacted`, message: "redacted must be a boolean" });
  }
  if (!Number.isInteger(record.redactedFieldCount) || (record.redactedFieldCount as number) < 0) {
    issues.push({
      path: `${path}.redactedFieldCount`,
      message: "redactedFieldCount must be a non-negative integer",
    });
  }
  requireStringArray(record.redactedPaths, `${path}.redactedPaths`, issues);
  requireStringArray(record.retainedMetadataKeys, `${path}.retainedMetadataKeys`, issues);

  if (
    Number.isInteger(record.redactedFieldCount) &&
    Array.isArray(record.redactedPaths) &&
    record.redactedFieldCount !== record.redactedPaths.length
  ) {
    issues.push({
      path: `${path}.redactedFieldCount`,
      message: "redactedFieldCount must match redactedPaths length",
    });
  }
}

function validateJsonValue(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      issues.push({ path, message: "number must be finite" });
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => validateJsonValue(item, `${path}[${index}]`, issues));
    return;
  }

  if (isRecord(value)) {
    for (const [key, nested] of Object.entries(value)) {
      if (nested === undefined) {
        issues.push({ path: `${path}.${key}`, message: "JSON values cannot be undefined" });
      } else {
        validateJsonValue(nested, `${path}.${key}`, issues);
      }
    }
    return;
  }

  issues.push({ path, message: "value must be JSON-compatible" });
}

function requireRecordAtPath(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    issues.push({ path, message: "record must be an object" });
    return undefined;
  }
  return value;
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
  if (!isWorkspaceId(value)) {
    issues.push({ path, message: "workspaceId must use the wsp_ id prefix" });
  }
}

function requireDeviceId(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || !DEVICE_ID_PATTERN.test(value)) {
    issues.push({ path, message: "deviceId must use the dev_ id prefix" });
  }
}

function requireActorId(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isActorId(value)) {
    issues.push({ path, message: "actorId must use the act_ id prefix" });
  }
}

function requireEventId(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isEventId(value)) {
    issues.push({ path, message: "id must use the evt_ id prefix" });
  }
}

function requireOperation(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isOperation(value)) {
    issues.push({
      path,
      message: `operation must be one of ${CANONICAL_LOCAL_REPLAY_OPERATIONS.join(", ")}`,
    });
  }
}

function requirePositiveSafeInteger(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    issues.push({ path, message: "sequence must be a positive safe integer" });
  }
}

function requireExactString(
  value: unknown,
  expected: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value !== expected) {
    issues.push({ path, message: `value must be ${expected}` });
  }
}

function requireTrue(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value !== true) {
    issues.push({ path, message: "value must be true" });
  }
}

function requireTimestamp(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || !ISO_TIMESTAMP_PATTERN.test(value)) {
    issues.push({ path, message: "timestamp must be an ISO UTC timestamp" });
    return;
  }
  if (Number.isNaN(Date.parse(value))) {
    issues.push({ path, message: "timestamp must be valid" });
  }
}

function requireRecordedAtAfterOccurredAt(
  record: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
): void {
  if (typeof record.occurredAt !== "string" || typeof record.recordedAt !== "string") {
    return;
  }

  const occurredAt = Date.parse(record.occurredAt);
  const recordedAt = Date.parse(record.recordedAt);
  if (!Number.isNaN(occurredAt) && !Number.isNaN(recordedAt) && recordedAt < occurredAt) {
    issues.push({ path: `${path}.recordedAt`, message: "recordedAt must be at or after occurredAt" });
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

function requireHexDigest(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isHexDigest(value)) {
    issues.push({ path, message: "digest must be lowercase sha256 hex" });
  }
}

function requireNullableHexDigest(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value !== null && !isHexDigest(value)) {
    issues.push({ path, message: "digest must be null or lowercase sha256 hex" });
  }
}

function requireStringArray(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "value must be an array" });
    return;
  }

  value.forEach((item, index) => {
    if (typeof item !== "string") {
      issues.push({ path: `${path}[${index}]`, message: "value must be a string" });
    }
  });
}

function isCatalogDigest(value: unknown): value is `sha256:${string}` {
  return typeof value === "string" && CATALOG_DIGEST_PATTERN.test(value);
}

function isHexDigest(value: unknown): value is string {
  return typeof value === "string" && HEX_SHA256_PATTERN.test(value);
}

function isWorkspaceId(value: unknown): value is `wsp_${string}` {
  return typeof value === "string" && WORKSPACE_ID_PATTERN.test(value);
}

function isActorId(value: unknown): value is `act_${string}` {
  return typeof value === "string" && ACTOR_ID_PATTERN.test(value);
}

function isEventId(value: unknown): value is `evt_${string}` {
  return typeof value === "string" && EVENT_ID_PATTERN.test(value);
}

function isOperation(value: unknown): value is CanonicalLocalReplayOperation {
  return (
    typeof value === "string" &&
    CANONICAL_LOCAL_REPLAY_OPERATIONS.includes(value as CanonicalLocalReplayOperation)
  );
}

function isRedactionMetadata(value: unknown): value is CanonicalLocalReplayRedactionMetadata {
  return (
    isRecord(value) &&
    typeof value.redacted === "boolean" &&
    Number.isInteger(value.redactedFieldCount) &&
    value.redactedFieldCount >= 0 &&
    Array.isArray(value.redactedPaths) &&
    value.redactedPaths.every((item) => typeof item === "string") &&
    Array.isArray(value.retainedMetadataKeys) &&
    value.retainedMetadataKeys.every((item) => typeof item === "string")
  );
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (isRecord(value)) {
    return Object.values(value).every((nested) => nested !== undefined && isJsonValue(nested));
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneCanonicalReplayEvent(event: CanonicalLocalReplayEvent): CanonicalLocalReplayEvent {
  return cloneJson(event) as CanonicalLocalReplayEvent;
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === undefined) {
    throw new Error("cannot digest undefined values");
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("cannot digest non-finite numbers");
  }
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }
  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function formatValidationIssues(scope: string, issues: readonly ValidationIssue[]): string {
  const details = issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
  return `${scope} validation failed: ${details}`;
}

const canonicalReplayEventKeys = [
  "schemaVersion",
  "id",
  "workspaceId",
  "actorId",
  "sequence",
  "occurredAt",
  "recordedAt",
  "localOnly",
  "operation",
  "payload",
  "payloadDigest",
  "previousDigest",
  "redactionMetadata",
] as const;

const redactionMetadataKeys = [
  "redacted",
  "redactedFieldCount",
  "redactedPaths",
  "retainedMetadataKeys",
] as const;
