import { createHash } from "node:crypto";

export const CANONICAL_LOCAL_EVENT_SCHEMA_VERSION = "canonical-local-event/v1";
export const CANONICAL_LOCAL_EVENT_CATALOG_SCHEMA_VERSION = "canonical-local-event-catalog/v1";
export const JSON_SCHEMA_DRAFT = "https://json-schema.org/draft/2020-12/schema";

export const canonicalLocalEventKinds = ["canonicalLocalEvent", "canonicalLocalEventCatalog"] as const;
export type CanonicalLocalEventKind = (typeof canonicalLocalEventKinds)[number];

export const canonicalLocalEventOperations = [
  "append",
  "update",
  "delete",
  "approval_requested",
  "approval_approved",
  "approval_rejected",
] as const;
export type CanonicalLocalEventOperation = (typeof canonicalLocalEventOperations)[number];

export const canonicalSharedSchemaKinds = [
  "docs",
  "projects",
  "incidents",
  "comments",
  "attachments",
  "approvals",
] as const;
export type CanonicalSharedSchemaKind = (typeof canonicalSharedSchemaKinds)[number];

export const canonicalLocalEventApprovalStatuses = ["requested", "approved", "rejected"] as const;
export type CanonicalLocalEventApprovalStatus = (typeof canonicalLocalEventApprovalStatuses)[number];

export const canonicalLocalEventApprovalDecisions = ["approved", "rejected"] as const;
export type CanonicalLocalEventApprovalDecision = (typeof canonicalLocalEventApprovalDecisions)[number];

export type JsonSchemaType = "array" | "boolean" | "integer" | "null" | "number" | "object" | "string";

export interface CanonicalLocalEventJsonSchema {
  readonly $schema?: string;
  readonly $id?: string;
  readonly title?: string;
  readonly type?: JsonSchemaType | readonly JsonSchemaType[];
  readonly additionalProperties?: boolean | CanonicalLocalEventJsonSchema;
  readonly properties?: Record<string, CanonicalLocalEventJsonSchema>;
  readonly propertyNames?: CanonicalLocalEventJsonSchema;
  readonly required?: readonly string[];
  readonly enum?: readonly (string | number | boolean | null)[];
  readonly const?: string | number | boolean | null;
  readonly pattern?: string;
  readonly minLength?: number;
  readonly minimum?: number;
  readonly minItems?: number;
  readonly items?: CanonicalLocalEventJsonSchema;
}

export interface CanonicalLocalEventSchemaDefinition {
  kind: CanonicalLocalEventKind;
  schemaVersion: string;
  title: string;
  schema: CanonicalLocalEventJsonSchema;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult<TRecord = unknown> {
  ok: boolean;
  issues: ValidationIssue[];
  value?: TRecord;
}

export interface CanonicalLocalEventPayload {
  schemaKind: CanonicalSharedSchemaKind;
  recordId: string;
  targetId?: string;
  summary: string;
  beforeDigest?: string;
  afterDigest?: string;
  fields?: readonly string[];
  approvalId?: `apv_${string}`;
  approvalStatus?: CanonicalLocalEventApprovalStatus;
  decision?: CanonicalLocalEventApprovalDecision;
}

export interface CanonicalLocalEventRedactionMetadata {
  redacted: boolean;
  redactedFieldCount: number;
  redactedPaths: readonly string[];
  retainedMetadataKeys: readonly string[];
}

export interface CanonicalLocalEvent {
  schemaVersion: typeof CANONICAL_LOCAL_EVENT_SCHEMA_VERSION;
  id: `evt_${string}`;
  workspaceId: `wsp_${string}`;
  actorId: `act_${string}`;
  sequence: number;
  occurredAt: string;
  recordedAt: string;
  localOnly: true;
  operation: CanonicalLocalEventOperation;
  payload: CanonicalLocalEventPayload;
  payloadDigest: string;
  previousDigest: string | null;
  redactionMetadata: CanonicalLocalEventRedactionMetadata;
}

export interface CanonicalLocalEventCatalog {
  schemaVersion: typeof CANONICAL_LOCAL_EVENT_CATALOG_SCHEMA_VERSION;
  generatedAt: string;
  workspaceId: `wsp_${string}`;
  localOnly: true;
  events: readonly CanonicalLocalEvent[];
}

export interface CanonicalLocalEventObjectByKind {
  canonicalLocalEvent: CanonicalLocalEvent;
  canonicalLocalEventCatalog: CanonicalLocalEventCatalog;
}

const HEX_SHA256_PATTERN = "^[a-f0-9]{64}$";
const ID_BODY_PATTERN = "[A-Za-z0-9_-]{1,88}";
const EVENT_ID_PATTERN = `^evt_${ID_BODY_PATTERN}$`;
const WORKSPACE_ID_PATTERN = `^wsp_${ID_BODY_PATTERN}$`;
const ACTOR_ID_PATTERN = `^act_${ID_BODY_PATTERN}$`;
const APPROVAL_ID_PATTERN = `^apv_${ID_BODY_PATTERN}$`;
const SHARED_RECORD_ID_PATTERN = "^(?:doc|prj|inc|cmt|att|apv)_[A-Za-z0-9_-]{1,88}$";
const ISO_TIMESTAMP_PATTERN = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$";
const PATH_REF_PATTERN = "^[A-Za-z][A-Za-z0-9_.\\[\\]-]{0,191}$";
const METADATA_KEY_PATTERN = "^[A-Za-z][A-Za-z0-9_.-]{0,63}$";
const SECRET_LIKE_METADATA_KEY_PATTERN_SOURCE =
  "(?:[aA][pP][iI][_-]?[kK][eE][yY]|[aA][uU][tT][hH][oO][rR][iI][zZ][aA][tT][iI][oO][nN]|[bB][eE][aA][rR][eE][rR]|[cC][rR][eE][dD][eE][nN][tT][iI][aA][lL]|[pP][aA][sS][sS][wW][oO][rR][dD]|[pP][rR][iI][vV][aA][tT][eE][_-]?[kK][eE][yY]|[rR][aA][wW]|[sS][eE][cC][rR][eE][tT]|[tT][oO][kK][eE][nN])";
const SAFE_METADATA_KEY_PATTERN =
  `^(?!.*${SECRET_LIKE_METADATA_KEY_PATTERN_SOURCE})[A-Za-z][A-Za-z0-9_.-]{0,63}$`;
const SECRET_LIKE_METADATA_KEY_PATTERN = new RegExp(SECRET_LIKE_METADATA_KEY_PATTERN_SOURCE);

const schemaKindIdPrefixes = {
  docs: "doc",
  projects: "prj",
  incidents: "inc",
  comments: "cmt",
  attachments: "att",
  approvals: "apv",
} as const satisfies Record<CanonicalSharedSchemaKind, string>;

const payloadSchema = objectSchema(
  "Canonical local event payload",
  {
    schemaKind: enumSchema(canonicalSharedSchemaKinds),
    recordId: sharedRecordIdSchema(),
    targetId: sharedRecordIdSchema(),
    summary: nonBlankStringSchema(),
    beforeDigest: digestSchema(),
    afterDigest: digestSchema(),
    fields: pathRefArraySchema(1),
    approvalId: approvalIdSchema(),
    approvalStatus: enumSchema(canonicalLocalEventApprovalStatuses),
    decision: enumSchema(canonicalLocalEventApprovalDecisions),
  },
  ["schemaKind", "recordId", "summary"],
);

const redactionMetadataSchema = objectSchema(
  "Canonical local event redaction metadata",
  {
    redacted: { type: "boolean" },
    redactedFieldCount: nonNegativeIntegerSchema(),
    redactedPaths: pathRefArraySchema(),
    retainedMetadataKeys: safeMetadataKeyArraySchema(),
  },
  ["redacted", "redactedFieldCount", "redactedPaths", "retainedMetadataKeys"],
);

export const canonicalLocalEventSchema = deepFreeze(
  objectSchema(
    "Canonical local event",
    {
      schemaVersion: {
        type: "string",
        const: CANONICAL_LOCAL_EVENT_SCHEMA_VERSION,
      },
      id: eventIdSchema(),
      workspaceId: workspaceIdSchema(),
      actorId: actorIdSchema(),
      sequence: positiveIntegerSchema(),
      occurredAt: timestampSchema(),
      recordedAt: timestampSchema(),
      localOnly: {
        type: "boolean",
        const: true,
      },
      operation: enumSchema(canonicalLocalEventOperations),
      payload: payloadSchema,
      payloadDigest: digestSchema(),
      previousDigest: nullableDigestSchema(),
      redactionMetadata: redactionMetadataSchema,
    },
    [
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
    ],
    "event",
  ),
);

export const canonicalLocalEventCatalogSchema = deepFreeze(
  objectSchema(
    "Canonical local event catalog",
    {
      schemaVersion: {
        type: "string",
        const: CANONICAL_LOCAL_EVENT_CATALOG_SCHEMA_VERSION,
      },
      generatedAt: timestampSchema(),
      workspaceId: workspaceIdSchema(),
      localOnly: {
        type: "boolean",
        const: true,
      },
      events: arraySchema(canonicalLocalEventSchema, 1),
    },
    ["schemaVersion", "generatedAt", "workspaceId", "localOnly", "events"],
    "event-catalog",
  ),
);

export const canonicalLocalEventSchemaDefinitions = deepFreeze({
  canonicalLocalEvent: {
    kind: "canonicalLocalEvent",
    schemaVersion: CANONICAL_LOCAL_EVENT_SCHEMA_VERSION,
    title: canonicalLocalEventSchema.title ?? "Canonical local event",
    schema: canonicalLocalEventSchema,
  },
  canonicalLocalEventCatalog: {
    kind: "canonicalLocalEventCatalog",
    schemaVersion: CANONICAL_LOCAL_EVENT_CATALOG_SCHEMA_VERSION,
    title: canonicalLocalEventCatalogSchema.title ?? "Canonical local event catalog",
    schema: canonicalLocalEventCatalogSchema,
  },
} satisfies Record<CanonicalLocalEventKind, CanonicalLocalEventSchemaDefinition>);

export const canonicalLocalEventSchemas = {
  canonicalLocalEvent: canonicalLocalEventSchema,
  canonicalLocalEventCatalog: canonicalLocalEventCatalogSchema,
} as const satisfies Record<CanonicalLocalEventKind, CanonicalLocalEventJsonSchema>;

export const canonicalLocalEventValidators = {
  canonicalLocalEvent: validateCanonicalLocalEvent,
  canonicalLocalEventCatalog: validateCanonicalLocalEventCatalog,
} as const;

export function getCanonicalLocalEventSchema(
  kind: CanonicalLocalEventKind,
): CanonicalLocalEventJsonSchema {
  return canonicalLocalEventSchemas[kind];
}

export function validateCanonicalLocalEventObject<K extends CanonicalLocalEventKind>(
  kind: K,
  value: unknown,
): ValidationResult<CanonicalLocalEventObjectByKind[K]> {
  const validator = canonicalLocalEventValidators[kind] as (candidate: unknown) => ValidationResult<unknown>;
  return validator(value) as ValidationResult<CanonicalLocalEventObjectByKind[K]>;
}

export function assertCanonicalLocalEventObject<K extends CanonicalLocalEventKind>(
  kind: K,
  value: unknown,
): asserts value is CanonicalLocalEventObjectByKind[K] {
  const result = validateCanonicalLocalEventObject(kind, value);
  if (!result.ok) {
    throw new Error(formatValidationIssues(kind, result.issues));
  }
}

export function validateCanonicalLocalEvent(value: unknown): ValidationResult<CanonicalLocalEvent> {
  const issues: ValidationIssue[] = [];
  validateCanonicalLocalEventValue(value, "$", issues);
  return validationResult(value, issues);
}

export function validateCanonicalLocalEventCatalog(value: unknown): ValidationResult<CanonicalLocalEventCatalog> {
  const issues: ValidationIssue[] = [];
  const catalog = validateCanonicalLocalEventCatalogValue(value, "$", issues);
  if (catalog) {
    validateCatalogConsistency(catalog, "$", issues);
  }
  return validationResult(value, issues);
}

export function assertCanonicalLocalEvent(value: unknown): asserts value is CanonicalLocalEvent {
  const result = validateCanonicalLocalEvent(value);
  if (!result.ok) {
    throw new Error(formatValidationIssues("canonicalLocalEvent", result.issues));
  }
}

export function assertCanonicalLocalEventCatalog(value: unknown): asserts value is CanonicalLocalEventCatalog {
  const result = validateCanonicalLocalEventCatalog(value);
  if (!result.ok) {
    throw new Error(formatValidationIssues("canonicalLocalEventCatalog", result.issues));
  }
}

export function isCanonicalLocalEventId(value: unknown): value is `evt_${string}` {
  return typeof value === "string" && new RegExp(EVENT_ID_PATTERN).test(value);
}

export function isCanonicalLocalEventDigest(value: unknown): value is string {
  return typeof value === "string" && new RegExp(HEX_SHA256_PATTERN).test(value);
}

export function isCanonicalLocalEventOperation(value: unknown): value is CanonicalLocalEventOperation {
  return isOneOf(value, canonicalLocalEventOperations);
}

export function isCanonicalSharedSchemaKind(value: unknown): value is CanonicalSharedSchemaKind {
  return isOneOf(value, canonicalSharedSchemaKinds);
}

export function isCanonicalSharedRecordId(value: unknown): value is string {
  return typeof value === "string" && new RegExp(SHARED_RECORD_ID_PATTERN).test(value);
}

export function getCanonicalPayloadDigest(payload: CanonicalLocalEventPayload | Record<string, unknown>): string {
  return digestCanonicalValue(payload);
}

export function getCanonicalLocalEventDigest(event: CanonicalLocalEvent): string {
  return digestCanonicalValue({
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
  });
}

function validateCanonicalLocalEventCatalogValue(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): CanonicalLocalEventCatalog | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, catalogKeys, issues);
  requireExactString(record, "schemaVersion", CANONICAL_LOCAL_EVENT_CATALOG_SCHEMA_VERSION, issues, path);
  requireTimestamp(record, "generatedAt", issues, path);
  requirePattern(record, "workspaceId", WORKSPACE_ID_PATTERN, "workspaceId must use the wsp_ id prefix", issues, path);
  requireTrue(record, "localOnly", issues, path);
  validateArray(record, "events", issues, validateCanonicalLocalEventValue, true, path);

  return record as unknown as CanonicalLocalEventCatalog;
}

function validateCanonicalLocalEventValue(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): CanonicalLocalEvent | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, eventKeys, issues);
  requireExactString(record, "schemaVersion", CANONICAL_LOCAL_EVENT_SCHEMA_VERSION, issues, path);
  requirePattern(record, "id", EVENT_ID_PATTERN, "id must use the evt_ id prefix", issues, path);
  requirePattern(record, "workspaceId", WORKSPACE_ID_PATTERN, "workspaceId must use the wsp_ id prefix", issues, path);
  requirePattern(record, "actorId", ACTOR_ID_PATTERN, "actorId must use the act_ id prefix", issues, path);
  requirePositiveInteger(record, "sequence", issues, path);
  requireTimestamp(record, "occurredAt", issues, path);
  requireTimestamp(record, "recordedAt", issues, path);
  requireRecordedAtAfterOccurredAt(record, path, issues);
  requireTrue(record, "localOnly", issues, path);
  requireEnum(record, "operation", canonicalLocalEventOperations, issues, path);
  requireDigest(record, "payloadDigest", issues, path);
  requireNullableDigest(record, "previousDigest", issues, path);

  const payload = requireRecord(record, "payload", issues, path);
  if (payload) {
    validatePayload(payload, keyPath(path, "payload"), issues);
    validatePayloadForOperation(record, payload, path, issues);
    requirePayloadDigest(record, payload, path, issues);
  }

  const redactionMetadata = requireRecord(record, "redactionMetadata", issues, path);
  if (redactionMetadata) {
    validateRedactionMetadata(redactionMetadata, keyPath(path, "redactionMetadata"), issues);
  }

  return record as unknown as CanonicalLocalEvent;
}

function validatePayload(
  record: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
): CanonicalLocalEventPayload | undefined {
  requireOnlyKeys(record, path, payloadKeys, issues);
  requireEnum(record, "schemaKind", canonicalSharedSchemaKinds, issues, path);
  requirePattern(record, "recordId", SHARED_RECORD_ID_PATTERN, "recordId must use a shared schema id prefix", issues, path);
  optionalPattern(record, "targetId", SHARED_RECORD_ID_PATTERN, "targetId must use a shared schema id prefix", issues, path);
  requireNonEmptyString(record, "summary", issues, path);
  optionalDigest(record, "beforeDigest", issues, path);
  optionalDigest(record, "afterDigest", issues, path);
  optionalPathRefArray(record, "fields", issues, path, true);
  optionalPattern(record, "approvalId", APPROVAL_ID_PATTERN, "approvalId must use the apv_ id prefix", issues, path);
  optionalEnum(record, "approvalStatus", canonicalLocalEventApprovalStatuses, issues, path);
  optionalEnum(record, "decision", canonicalLocalEventApprovalDecisions, issues, path);
  requireRecordIdMatchesSchemaKind(record, path, issues);

  return record as unknown as CanonicalLocalEventPayload;
}

function validatePayloadForOperation(
  event: Record<string, unknown>,
  payload: Record<string, unknown>,
  eventPath: string,
  issues: ValidationIssue[],
): void {
  const operation = event.operation;
  const payloadPath = keyPath(eventPath, "payload");
  if (!isCanonicalLocalEventOperation(operation)) {
    return;
  }

  switch (operation) {
    case "append":
      requireDigest(payload, "afterDigest", issues, payloadPath);
      requireAbsent(payload, "beforeDigest", issues, payloadPath);
      requireAbsent(payload, "decision", issues, payloadPath);
      break;
    case "update":
      requireDigest(payload, "beforeDigest", issues, payloadPath);
      requireDigest(payload, "afterDigest", issues, payloadPath);
      requirePathRefArray(payload, "fields", issues, payloadPath, true);
      requireChangedDigest(payload, payloadPath, issues);
      break;
    case "delete":
      requireDigest(payload, "beforeDigest", issues, payloadPath);
      requireAbsent(payload, "afterDigest", issues, payloadPath);
      requireAbsent(payload, "decision", issues, payloadPath);
      break;
    case "approval_requested":
      requirePattern(payload, "approvalId", APPROVAL_ID_PATTERN, "approvalId must use the apv_ id prefix", issues, payloadPath);
      requireExactString(payload, "approvalStatus", "requested", issues, payloadPath);
      requireDigest(payload, "afterDigest", issues, payloadPath);
      requireAbsent(payload, "decision", issues, payloadPath);
      break;
    case "approval_approved":
      requireApprovalDecisionPayload(payload, "approved", payloadPath, issues);
      break;
    case "approval_rejected":
      requireApprovalDecisionPayload(payload, "rejected", payloadPath, issues);
      break;
  }
}

function requireApprovalDecisionPayload(
  payload: Record<string, unknown>,
  decision: CanonicalLocalEventApprovalDecision,
  path: string,
  issues: ValidationIssue[],
): void {
  requirePattern(payload, "approvalId", APPROVAL_ID_PATTERN, "approvalId must use the apv_ id prefix", issues, path);
  requireExactString(payload, "approvalStatus", decision, issues, path);
  requireExactString(payload, "decision", decision, issues, path);
  requireDigest(payload, "beforeDigest", issues, path);
  requireDigest(payload, "afterDigest", issues, path);
  requirePathRefArray(payload, "fields", issues, path, true);
  requireChangedDigest(payload, path, issues);
}

function validateRedactionMetadata(
  record: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
): void {
  requireOnlyKeys(record, path, redactionMetadataKeys, issues);
  requireBoolean(record, "redacted", issues, path);
  requireNonNegativeInteger(record, "redactedFieldCount", issues, path);
  requirePathRefArray(record, "redactedPaths", issues, path);
  requireSafeMetadataKeyArray(record, "retainedMetadataKeys", issues, path);

  const redactedFieldCount = record.redactedFieldCount;
  const redactedPaths = record.redactedPaths;
  if (typeof redactedFieldCount === "number" && Array.isArray(redactedPaths) && redactedFieldCount !== redactedPaths.length) {
    issues.push({
      path: keyPath(path, "redactedFieldCount"),
      message: "redactedFieldCount must match redactedPaths length",
    });
  }
  if (typeof record.redacted === "boolean" && typeof redactedFieldCount === "number") {
    const expectedRedacted = redactedFieldCount > 0;
    if (record.redacted !== expectedRedacted) {
      issues.push({
        path: keyPath(path, "redacted"),
        message: "redacted must indicate whether any fields were redacted",
      });
    }
  }
  if (Array.isArray(redactedPaths)) {
    requireSortedUniqueStrings(
      redactedPaths,
      keyPath(path, "redactedPaths"),
      "redactedPaths must be sorted with no duplicates",
      issues,
    );
  }
  if (Array.isArray(record.retainedMetadataKeys)) {
    requireSortedUniqueStrings(
      record.retainedMetadataKeys,
      keyPath(path, "retainedMetadataKeys"),
      "retainedMetadataKeys must be sorted with no duplicates",
      issues,
    );
  }
}

function validateCatalogConsistency(
  catalog: CanonicalLocalEventCatalog,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(catalog.events)) {
    return;
  }

  const eventIds = new Set<string>();
  let previousDigest: string | null = null;
  let previousRecordedAt: number | undefined;

  for (const [index, value] of catalog.events.entries()) {
    const eventPath = `${keyPath(path, "events")}[${index}]`;
    if (!isRecord(value)) {
      continue;
    }

    const event = value as unknown as CanonicalLocalEvent;
    if (typeof event.id === "string" && eventIds.has(event.id)) {
      issues.push({ path: keyPath(eventPath, "id"), message: "event ids must be unique" });
    }
    if (typeof event.id === "string") {
      eventIds.add(event.id);
    }

    if (event.workspaceId !== catalog.workspaceId) {
      issues.push({
        path: keyPath(eventPath, "workspaceId"),
        message: "event workspaceId must match catalog workspaceId",
      });
    }

    if (event.sequence !== index + 1) {
      issues.push({
        path: keyPath(eventPath, "sequence"),
        message: "event sequence must be contiguous and start at 1",
      });
    }

    if (event.previousDigest !== previousDigest) {
      issues.push({
        path: keyPath(eventPath, "previousDigest"),
        message: index === 0
          ? "first event previousDigest must be null"
          : "previousDigest must match the prior event digest",
      });
    }

    const recordedAt = Date.parse(event.recordedAt);
    if (!Number.isNaN(recordedAt)) {
      if (previousRecordedAt !== undefined && recordedAt < previousRecordedAt) {
        issues.push({
          path: keyPath(eventPath, "recordedAt"),
          message: "recordedAt must not move backward within a catalog",
        });
      }
      previousRecordedAt = recordedAt;
    }

    previousDigest = getCanonicalLocalEventDigest(event);
  }

  const generatedAt = Date.parse(catalog.generatedAt);
  if (!Number.isNaN(generatedAt) && previousRecordedAt !== undefined && generatedAt < previousRecordedAt) {
    issues.push({
      path: keyPath(path, "generatedAt"),
      message: "generatedAt must be at or after the latest event recordedAt",
    });
  }
}

function requirePayloadDigest(
  event: Record<string, unknown>,
  payload: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
): void {
  const payloadDigest = event.payloadDigest;
  if (!isCanonicalLocalEventDigest(payloadDigest)) {
    return;
  }
  const expectedDigest = getCanonicalPayloadDigest(payload);
  if (payloadDigest !== expectedDigest) {
    issues.push({
      path: keyPath(path, "payloadDigest"),
      message: "payloadDigest must match the canonical payload digest",
    });
  }
}

function requireRecordIdMatchesSchemaKind(
  payload: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
): void {
  const schemaKind = payload.schemaKind;
  const recordId = payload.recordId;
  if (!isCanonicalSharedSchemaKind(schemaKind) || typeof recordId !== "string") {
    return;
  }

  const prefix = schemaKindIdPrefixes[schemaKind];
  if (!recordId.startsWith(`${prefix}_`)) {
    issues.push({
      path: keyPath(path, "recordId"),
      message: "recordId prefix must match schemaKind",
    });
  }
}

function requireChangedDigest(
  record: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
): void {
  if (
    typeof record.beforeDigest === "string" &&
    typeof record.afterDigest === "string" &&
    record.beforeDigest === record.afterDigest
  ) {
    issues.push({
      path: keyPath(path, "afterDigest"),
      message: "afterDigest must differ from beforeDigest",
    });
  }
}

function objectSchema(
  title: string,
  properties: Record<string, CanonicalLocalEventJsonSchema>,
  required: readonly string[],
  slug?: string,
): CanonicalLocalEventJsonSchema {
  return {
    $schema: JSON_SCHEMA_DRAFT,
    $id: slug ? `https://schemas.sovereignops.local/canonical-events/${slug}.schema.json` : undefined,
    title,
    type: "object",
    additionalProperties: false,
    required,
    properties,
  };
}

function arraySchema(
  items: CanonicalLocalEventJsonSchema,
  minItems?: number,
): CanonicalLocalEventJsonSchema {
  return {
    type: "array",
    minItems,
    items,
  };
}

function eventIdSchema(): CanonicalLocalEventJsonSchema {
  return {
    type: "string",
    pattern: EVENT_ID_PATTERN,
  };
}

function workspaceIdSchema(): CanonicalLocalEventJsonSchema {
  return {
    type: "string",
    pattern: WORKSPACE_ID_PATTERN,
  };
}

function actorIdSchema(): CanonicalLocalEventJsonSchema {
  return {
    type: "string",
    pattern: ACTOR_ID_PATTERN,
  };
}

function approvalIdSchema(): CanonicalLocalEventJsonSchema {
  return {
    type: "string",
    pattern: APPROVAL_ID_PATTERN,
  };
}

function sharedRecordIdSchema(): CanonicalLocalEventJsonSchema {
  return {
    type: "string",
    pattern: SHARED_RECORD_ID_PATTERN,
  };
}

function digestSchema(): CanonicalLocalEventJsonSchema {
  return {
    type: "string",
    pattern: HEX_SHA256_PATTERN,
  };
}

function nullableDigestSchema(): CanonicalLocalEventJsonSchema {
  return {
    type: ["string", "null"],
    pattern: HEX_SHA256_PATTERN,
  };
}

function timestampSchema(): CanonicalLocalEventJsonSchema {
  return {
    type: "string",
    pattern: ISO_TIMESTAMP_PATTERN,
  };
}

function nonBlankStringSchema(): CanonicalLocalEventJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: "\\S",
  };
}

function pathRefSchema(): CanonicalLocalEventJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: PATH_REF_PATTERN,
  };
}

function pathRefArraySchema(minItems?: number): CanonicalLocalEventJsonSchema {
  return {
    type: "array",
    minItems,
    items: pathRefSchema(),
  };
}

function safeMetadataKeySchema(): CanonicalLocalEventJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: SAFE_METADATA_KEY_PATTERN,
  };
}

function safeMetadataKeyArraySchema(): CanonicalLocalEventJsonSchema {
  return {
    type: "array",
    items: safeMetadataKeySchema(),
  };
}

function positiveIntegerSchema(): CanonicalLocalEventJsonSchema {
  return {
    type: "integer",
    minimum: 1,
  };
}

function nonNegativeIntegerSchema(): CanonicalLocalEventJsonSchema {
  return {
    type: "integer",
    minimum: 0,
  };
}

function enumSchema(values: readonly (string | number | boolean | null)[]): CanonicalLocalEventJsonSchema {
  return {
    type: typeof values[0] === "string" ? "string" : undefined,
    enum: values,
  };
}

function validationResult<TRecord>(value: unknown, issues: ValidationIssue[]): ValidationResult<TRecord> {
  return issues.length === 0
    ? { ok: true, issues, value: deepFreeze(cloneJson(value)) as TRecord }
    : { ok: false, issues };
}

function requireOnlyKeys(
  record: Record<string, unknown>,
  path: string,
  allowedKeys: readonly string[],
  issues: ValidationIssue[],
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      issues.push({ path: keyPath(path, key), message: `${key} is not allowed` });
    }
  }
}

function requireRecord(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): Record<string, unknown> | undefined {
  const path = keyPath(parentPath, key);
  const value = record[key];
  if (!isRecord(value)) {
    issues.push({ path, message: `${key} must be an object` });
    return undefined;
  }
  return value;
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

function validateArray<TRecord>(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  validator: (value: unknown, path: string, issues: ValidationIssue[]) => TRecord | undefined,
  nonEmpty: boolean,
  parentPath: string,
): TRecord[] | undefined {
  const value = record[key];
  const path = keyPath(parentPath, key);
  if (!Array.isArray(value)) {
    issues.push({ path, message: `${key} must be an array` });
    return undefined;
  }
  if (nonEmpty && value.length === 0) {
    issues.push({ path, message: `${key} must contain at least one item` });
  }

  const validRecords: TRecord[] = [];
  for (const [index, item] of value.entries()) {
    const recordValue = validator(item, `${path}[${index}]`, issues);
    if (recordValue) {
      validRecords.push(recordValue);
    }
  }
  return validRecords;
}

function requireExactString(
  record: Record<string, unknown>,
  key: string,
  expected: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  if (record[key] !== expected) {
    issues.push({
      path: keyPath(parentPath, key),
      message: `${key} must be ${expected}`,
    });
  }
}

function requirePattern(
  record: Record<string, unknown>,
  key: string,
  pattern: string,
  message: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (typeof value !== "string" || !new RegExp(pattern).test(value)) {
    issues.push({ path: keyPath(parentPath, key), message });
  }
}

function optionalPattern(
  record: Record<string, unknown>,
  key: string,
  pattern: string,
  message: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  if (record[key] !== undefined) {
    requirePattern(record, key, pattern, message, issues, parentPath);
  }
}

function requireTrue(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  if (record[key] !== true) {
    issues.push({ path: keyPath(parentPath, key), message: `${key} must be true` });
  }
}

function requireAbsent(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  if (record[key] !== undefined) {
    issues.push({ path: keyPath(parentPath, key), message: `${key} must be absent for this operation` });
  }
}

function requireTimestamp(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  const path = keyPath(parentPath, key);
  if (typeof value !== "string" || !new RegExp(ISO_TIMESTAMP_PATTERN).test(value)) {
    issues.push({ path, message: `${key} must be an ISO UTC timestamp` });
    return;
  }
  if (Number.isNaN(Date.parse(value))) {
    issues.push({ path, message: `${key} must be a valid timestamp` });
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
  if (Number.isNaN(occurredAt) || Number.isNaN(recordedAt)) {
    return;
  }
  if (recordedAt < occurredAt) {
    issues.push({
      path: keyPath(path, "recordedAt"),
      message: "recordedAt must be at or after occurredAt",
    });
  }
}

function requireNonEmptyString(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push({ path: keyPath(parentPath, key), message: `${key} must be a non-empty string` });
  }
}

function requireBoolean(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  if (typeof record[key] !== "boolean") {
    issues.push({ path: keyPath(parentPath, key), message: `${key} must be a boolean` });
  }
}

function requirePositiveInteger(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    issues.push({ path: keyPath(parentPath, key), message: `${key} must be a positive integer` });
  }
}

function requireNonNegativeInteger(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    issues.push({ path: keyPath(parentPath, key), message: `${key} must be a non-negative integer` });
  }
}

function requireEnum<TValue extends string>(
  record: Record<string, unknown>,
  key: string,
  allowed: readonly TValue[],
  issues: ValidationIssue[],
  parentPath: string,
): void {
  if (!allowed.includes(record[key] as TValue)) {
    issues.push({ path: keyPath(parentPath, key), message: `${key} must be one of ${allowed.join(", ")}` });
  }
}

function optionalEnum<TValue extends string>(
  record: Record<string, unknown>,
  key: string,
  allowed: readonly TValue[],
  issues: ValidationIssue[],
  parentPath: string,
): void {
  if (record[key] !== undefined) {
    requireEnum(record, key, allowed, issues, parentPath);
  }
}

function requireDigest(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (!isCanonicalLocalEventDigest(value)) {
    issues.push({ path: keyPath(parentPath, key), message: `${key} must be a lowercase sha256 digest` });
  }
}

function optionalDigest(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  if (record[key] !== undefined) {
    requireDigest(record, key, issues, parentPath);
  }
}

function requireNullableDigest(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (value !== null && !isCanonicalLocalEventDigest(value)) {
    issues.push({ path: keyPath(parentPath, key), message: `${key} must be null or a lowercase sha256 digest` });
  }
}

function requirePathRefArray(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
  nonEmpty = false,
): void {
  const value = record[key];
  const path = keyPath(parentPath, key);
  if (!Array.isArray(value)) {
    issues.push({ path, message: `${key} must be an array` });
    return;
  }
  if (nonEmpty && value.length === 0) {
    issues.push({ path, message: `${key} must contain at least one item` });
  }
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || !new RegExp(PATH_REF_PATTERN).test(item)) {
      issues.push({ path: `${path}[${index}]`, message: `${key} values must be safe path references` });
    }
  }
  requireSortedUniqueStrings(value, path, `${key} must be sorted with no duplicates`, issues);
}

function optionalPathRefArray(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
  nonEmpty: boolean,
): void {
  if (record[key] !== undefined) {
    requirePathRefArray(record, key, issues, parentPath, nonEmpty);
  }
}

function requireSafeMetadataKeyArray(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  const path = keyPath(parentPath, key);
  if (!Array.isArray(value)) {
    issues.push({ path, message: `${key} must be an array` });
    return;
  }
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || !isSafeMetadataKey(item)) {
      issues.push({
        path: `${path}[${index}]`,
        message: `${key} values must be non-sensitive metadata keys`,
      });
    }
  }
}

function requireSortedUniqueStrings(
  values: readonly unknown[],
  path: string,
  message: string,
  issues: ValidationIssue[],
): void {
  let previous: string | undefined;
  for (const [index, value] of values.entries()) {
    if (typeof value !== "string") {
      continue;
    }
    if (previous !== undefined && previous >= value) {
      issues.push({ path: `${path}[${index}]`, message });
    }
    previous = value;
  }
}

function isSafeMetadataKey(value: string): boolean {
  return (
    new RegExp(METADATA_KEY_PATTERN).test(value) &&
    !SECRET_LIKE_METADATA_KEY_PATTERN.test(value)
  );
}

function keyPath(parentPath: string, key: string): string {
  return parentPath === "$" ? key : `${parentPath}.${key}`;
}

function isOneOf<TValue extends string>(value: unknown, allowed: readonly TValue[]): value is TValue {
  return typeof value === "string" && allowed.includes(value as TValue);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}

function deepFreeze<TValue>(value: TValue): TValue {
  if (!isFreezable(value) || Object.isFrozen(value)) {
    return value;
  }
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }
  return Object.freeze(value) as TValue;
}

function isFreezable(value: unknown): value is object {
  return (typeof value === "object" || typeof value === "function") && value !== null;
}

function digestCanonicalValue(value: unknown): string {
  return sha256(canonicalJson(value));
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
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

function formatValidationIssues(
  kind: CanonicalLocalEventKind,
  issues: readonly ValidationIssue[],
): string {
  const details = issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
  return `${kind} validation failed: ${details}`;
}

const eventKeys = [
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

const catalogKeys = ["schemaVersion", "generatedAt", "workspaceId", "localOnly", "events"] as const;

const payloadKeys = [
  "schemaKind",
  "recordId",
  "targetId",
  "summary",
  "beforeDigest",
  "afterDigest",
  "fields",
  "approvalId",
  "approvalStatus",
  "decision",
] as const;

const redactionMetadataKeys = [
  "redacted",
  "redactedFieldCount",
  "redactedPaths",
  "retainedMetadataKeys",
] as const;
