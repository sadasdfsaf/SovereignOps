export const WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_SCHEMA_VERSION =
  "workspace-session-snapshot-retention-cleanup/v1";
export const LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_SCHEMA_VERSION =
  "local-workspace-session-snapshot-retention/v1";
export const JSON_SCHEMA_DRAFT = "https://json-schema.org/draft/2020-12/schema";

export const workspaceSessionSnapshotRetentionCleanupKinds = [
  "workspaceSessionSnapshotRetentionCleanupRequest",
  "workspaceSessionSnapshotRetentionCleanupResponse",
] as const;
export type WorkspaceSessionSnapshotRetentionCleanupKind =
  (typeof workspaceSessionSnapshotRetentionCleanupKinds)[number];

export const workspaceSessionSnapshotRetentionCleanupSourceKeys = [
  "entries",
  "files",
  "records",
] as const;
export type WorkspaceSessionSnapshotRetentionCleanupSourceKey =
  (typeof workspaceSessionSnapshotRetentionCleanupSourceKeys)[number];

export const workspaceSessionSnapshotRetentionCleanupSourceKinds = [
  "file-metadata",
  "snapshot-record",
  "snapshot-record-summary",
  "unknown",
] as const;
export type WorkspaceSessionSnapshotRetentionCleanupSourceKind =
  (typeof workspaceSessionSnapshotRetentionCleanupSourceKinds)[number];

export const workspaceSessionSnapshotRetentionCleanupActions = [
  "delete",
  "keep",
  "review",
] as const;
export type WorkspaceSessionSnapshotRetentionCleanupActionKind =
  (typeof workspaceSessionSnapshotRetentionCleanupActions)[number];

export const workspaceSessionSnapshotRetentionCleanupReasons = [
  "duplicate-snapshot-id",
  "exceeds-max-age",
  "exceeds-max-count",
  "invalid-metadata",
  "missing-created-at",
  "missing-snapshot-id",
  "path-traversal",
  "raw-lock-token",
  "raw-secret",
  "requires-review",
  "unsafe-absolute-path",
  "within-max-age",
  "within-max-count",
  "within-policy",
] as const;
export type WorkspaceSessionSnapshotRetentionCleanupReason =
  (typeof workspaceSessionSnapshotRetentionCleanupReasons)[number];

export const workspaceSessionSnapshotRetentionCleanupIssueKinds = [
  "duplicate-snapshot-id",
  "invalid-created-at",
  "invalid-metadata",
  "invalid-snapshot-id",
  "missing-created-at",
  "missing-snapshot-id",
  "path-traversal",
  "raw-lock-token",
  "raw-secret",
  "unsafe-absolute-path",
] as const;
export type WorkspaceSessionSnapshotRetentionCleanupIssueKind =
  (typeof workspaceSessionSnapshotRetentionCleanupIssueKinds)[number];

export type JsonSchemaType = "array" | "boolean" | "integer" | "null" | "number" | "object" | "string";

export interface WorkspaceSessionSnapshotRetentionCleanupJsonSchema {
  readonly $schema?: string;
  readonly $id?: string;
  readonly title?: string;
  readonly type?: JsonSchemaType | readonly JsonSchemaType[];
  readonly additionalProperties?: boolean | WorkspaceSessionSnapshotRetentionCleanupJsonSchema;
  readonly propertyNames?: WorkspaceSessionSnapshotRetentionCleanupJsonSchema;
  readonly properties?: Record<string, WorkspaceSessionSnapshotRetentionCleanupJsonSchema>;
  readonly required?: readonly string[];
  readonly enum?: readonly (string | number | boolean | null)[];
  readonly const?: string | number | boolean | null;
  readonly pattern?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly items?: WorkspaceSessionSnapshotRetentionCleanupJsonSchema;
  readonly oneOf?: readonly WorkspaceSessionSnapshotRetentionCleanupJsonSchema[];
}

export interface WorkspaceSessionSnapshotRetentionCleanupSchemaDefinition {
  kind: WorkspaceSessionSnapshotRetentionCleanupKind;
  schemaVersion: typeof WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_SCHEMA_VERSION;
  title: string;
  schema: WorkspaceSessionSnapshotRetentionCleanupJsonSchema;
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

export type WorkspaceSessionSnapshotRetentionCleanupMetadataValue =
  | string
  | number
  | boolean
  | null;
export type WorkspaceSessionSnapshotRetentionCleanupMetadata =
  Record<string, WorkspaceSessionSnapshotRetentionCleanupMetadataValue>;

export interface WorkspaceSessionSnapshotRetentionCleanupRequestEntry {
  sourceKind?: WorkspaceSessionSnapshotRetentionCleanupSourceKind;
  path?: string;
  snapshotId?: string;
  workspaceId?: string;
  deviceId?: string;
  sessionId?: string;
  label?: string;
  createdAt?: string;
  updatedAt?: string;
  sizeBytes?: number;
  eventCount?: number;
  fingerprint?: string;
  snapshotFingerprint?: string;
  metadata?: WorkspaceSessionSnapshotRetentionCleanupMetadata;
}

export interface WorkspaceSessionSnapshotRetentionCleanupRequest {
  entries?: readonly WorkspaceSessionSnapshotRetentionCleanupRequestEntry[];
  files?: readonly WorkspaceSessionSnapshotRetentionCleanupRequestEntry[];
  records?: readonly WorkspaceSessionSnapshotRetentionCleanupRequestEntry[];
  maxCount?: number;
  maxAgeMs?: number;
  now?: string;
}

export interface WorkspaceSessionSnapshotRetentionCleanupThresholds {
  maxCount?: number;
  maxAgeMs?: number;
  now?: string;
  cutoffAt?: string;
}

export interface WorkspaceSessionSnapshotRetentionCleanupIssue {
  kind: "localWorkspaceSessionSnapshotRetentionCleanupIssue";
  issueKind: WorkspaceSessionSnapshotRetentionCleanupIssueKind;
  path: string;
  reason: WorkspaceSessionSnapshotRetentionCleanupReason;
  message: string;
}

export interface WorkspaceSessionSnapshotRetentionCleanupSummary {
  kind: "localWorkspaceSessionSnapshotRetentionCleanupSummary";
  sourceKind: WorkspaceSessionSnapshotRetentionCleanupSourceKind;
  auditSafe: true;
  redacted: true;
  snapshotId?: string;
  workspaceId?: string;
  deviceId?: string;
  sessionId?: string;
  label?: string;
  createdAt?: string;
  updatedAt?: string;
  ageMs?: number;
  fileRef?: string;
  filePathKind?: "absolute" | "relative";
  sizeBytes?: number;
  fingerprint?: string;
  snapshotFingerprint?: string;
  operationCount?: number;
}

export interface WorkspaceSessionSnapshotRetentionCleanupAction {
  kind: "localWorkspaceSessionSnapshotRetentionCleanupAction";
  action: WorkspaceSessionSnapshotRetentionCleanupActionKind;
  reasons: readonly WorkspaceSessionSnapshotRetentionCleanupReason[];
  sourceIndex: number;
  rank?: number;
  summary: WorkspaceSessionSnapshotRetentionCleanupSummary;
  issues: readonly WorkspaceSessionSnapshotRetentionCleanupIssue[];
}

export interface WorkspaceSessionSnapshotRetentionCleanupResponse {
  kind: "localWorkspaceSessionSnapshotRetentionCleanupPlan";
  schemaVersion: typeof LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_SCHEMA_VERSION;
  localOnly: true;
  dryRun: true;
  durableWrites: false;
  thresholds: WorkspaceSessionSnapshotRetentionCleanupThresholds;
  entryCount: number;
  keepCount: number;
  deleteCount: number;
  reviewCount: number;
  actions: readonly WorkspaceSessionSnapshotRetentionCleanupAction[];
  keepActions: readonly WorkspaceSessionSnapshotRetentionCleanupAction[];
  deleteActions: readonly WorkspaceSessionSnapshotRetentionCleanupAction[];
  reviewActions: readonly WorkspaceSessionSnapshotRetentionCleanupAction[];
}

export interface WorkspaceSessionSnapshotRetentionCleanupObjectByKind {
  workspaceSessionSnapshotRetentionCleanupRequest: WorkspaceSessionSnapshotRetentionCleanupRequest;
  workspaceSessionSnapshotRetentionCleanupResponse: WorkspaceSessionSnapshotRetentionCleanupResponse;
}

const MAX_SAFE_INTEGER = 9007199254740991;
const ISO_TIMESTAMP_PATTERN = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$";
const SNAPSHOT_ID_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$";
const SAFE_ID_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._:-]{0,160}$";
const ID_OR_REDACTED_PATTERN =
  `(?:${SAFE_ID_PATTERN.slice(1, -1)}|\\[redacted(?::[A-Za-z0-9_-]+)*\\])`;
const SHA256_FINGERPRINT_PATTERN = "^sha256:[a-f0-9]{64}$";
const SAFE_RELATIVE_PATH_PATTERN =
  "^(?!/)(?![A-Za-z]:)(?!.*(?:^|/)\\.\\.(?:/|$))(?!.*//)[A-Za-z0-9._/-]{1,200}$";
const REDACTED_TOKEN_PATTERN_SOURCE = "\\[redacted(?::[A-Za-z0-9_-]+)*\\]";
const REDACTED_PATH_REF_PATTERN = "^\\[redacted:path:[a-f0-9]{12}\\]$";
const PATH_OR_REDACTED_PATTERN = `(?:${SAFE_RELATIVE_PATH_PATTERN.slice(1, -1)}|${REDACTED_TOKEN_PATTERN_SOURCE})`;
const FIELD_PATH_PATTERN = "^\\$?(?:\\.?[A-Za-z0-9_-]+|\\[[0-9]+\\]){1,32}$";
const PUBLIC_TEXT_PATTERN = "^[A-Za-z0-9\\[][A-Za-z0-9 ._,:()\\[\\]\\/-]{0,239}$";
const METADATA_KEY_PATTERN = "^[A-Za-z][A-Za-z0-9_.-]{0,63}$";
const SECRET_LIKE_PATTERN_SOURCE =
  "(?:[aA][pP][iI][_-]?[kK][eE][yY]|[aA][uU][tT][hH][oO][rR][iI][zZ][aA][tT][iI][oO][nN]|[bB][eE][aA][rR][eE][rR]|[cC][oO][oO][kK][iI][eE]|[cC][rR][eE][dD][eE][nN][tT][iI][aA][lL]|[jJ][wW][tT]|[pP][aA][sS][sS][wW][oO][rR][dD]|[pP][rR][iI][vV][aA][tT][eE][_-]?[kK][eE][yY]|[rR][aA][wW]|[sS][eE][cC][rR][eE][tT]|[sS][eE][sS][sS][iI][oO][nN][_-]?[tT][oO][kK][eE][nN]|[tT][oO][kK][eE][nN])";
const SAFE_METADATA_KEY_PATTERN =
  `^(?!.*${SECRET_LIKE_PATTERN_SOURCE})[A-Za-z][A-Za-z0-9_.-]{0,63}$`;
const SAFE_STRING_PATTERN =
  `^(?!.*(?:${SECRET_LIKE_PATTERN_SOURCE}\\s*[:=]|[bB][eE][aA][rR][eE][rR]\\s+\\S+|(?:sk|rk|pk|tok|pat|npm|ghp|gho)_[A-Za-z0-9_-]{8,}|(?:sk|rk|pat|glpat|github_pat)-[A-Za-z0-9_-]{8,}|lock_[A-Za-z0-9_-]{4,}|[A-Za-z]:[\\\\/]|\\\\\\\\|file://|(?:^|\\s)/(?:Users|home|var|tmp|private|mnt|Volumes)/)).*$`;
const SECRET_LIKE_PATTERN = new RegExp(SECRET_LIKE_PATTERN_SOURCE);
const SAFE_STRING_VALUE_PATTERN = new RegExp(SAFE_STRING_PATTERN);
const REDACTED_TOKEN_PATTERN = new RegExp(`^${REDACTED_TOKEN_PATTERN_SOURCE}$`);
const RAW_LOCAL_PATH_PATTERN =
  /(?:\b[A-Za-z]:[\\/]|\\\\|file:\/\/|(?:^|\s)\/(?:Users|home|var|tmp|private|mnt|Volumes)\/)/;
const RAW_LOCK_TOKEN_PATTERN = /^lock_[A-Za-z0-9_-]{4,}$/;

const safeMetadataValueSchema: WorkspaceSessionSnapshotRetentionCleanupJsonSchema = {
  type: ["string", "number", "boolean", "null"],
  pattern: SAFE_STRING_PATTERN,
};

const metadataSchema: WorkspaceSessionSnapshotRetentionCleanupJsonSchema = {
  type: "object",
  propertyNames: safeMetadataKeySchema(),
  additionalProperties: safeMetadataValueSchema,
};

const requestEntrySchema = objectSchema(
  "Workspace session snapshot retention cleanup request entry",
  {
    sourceKind: enumSchema(workspaceSessionSnapshotRetentionCleanupSourceKinds),
    path: pathOrRedactedSchema(),
    snapshotId: snapshotIdSchema(),
    workspaceId: idOrRedactedSchema(),
    deviceId: idOrRedactedSchema(),
    sessionId: idOrRedactedSchema(),
    label: publicTextSchema(),
    createdAt: timestampSchema(),
    updatedAt: timestampSchema(),
    sizeBytes: nonNegativeIntegerSchema(),
    eventCount: nonNegativeIntegerSchema(),
    fingerprint: fingerprintSchema(),
    snapshotFingerprint: fingerprintSchema(),
    metadata: metadataSchema,
  },
  [],
);

const thresholdsSchema = objectSchema(
  "Workspace session snapshot retention cleanup thresholds",
  {
    maxCount: nonNegativeIntegerSchema(),
    maxAgeMs: nonNegativeIntegerSchema(),
    now: timestampSchema(),
    cutoffAt: timestampSchema(),
  },
  [],
);

const issueSchema = objectSchema(
  "Workspace session snapshot retention cleanup issue",
  {
    kind: {
      type: "string",
      const: "localWorkspaceSessionSnapshotRetentionCleanupIssue",
    },
    issueKind: enumSchema(workspaceSessionSnapshotRetentionCleanupIssueKinds),
    path: fieldPathSchema(),
    reason: enumSchema(workspaceSessionSnapshotRetentionCleanupReasons),
    message: publicTextSchema(),
  },
  ["kind", "issueKind", "path", "reason", "message"],
);

const summarySchema = objectSchema(
  "Workspace session snapshot retention cleanup summary",
  {
    kind: {
      type: "string",
      const: "localWorkspaceSessionSnapshotRetentionCleanupSummary",
    },
    sourceKind: enumSchema(workspaceSessionSnapshotRetentionCleanupSourceKinds),
    auditSafe: {
      type: "boolean",
      const: true,
    },
    redacted: {
      type: "boolean",
      const: true,
    },
    snapshotId: snapshotIdSchema(),
    workspaceId: idOrRedactedSchema(),
    deviceId: idOrRedactedSchema(),
    sessionId: idOrRedactedSchema(),
    label: publicTextSchema(),
    createdAt: timestampSchema(),
    updatedAt: timestampSchema(),
    ageMs: nonNegativeIntegerSchema(),
    fileRef: redactedPathRefSchema(),
    filePathKind: enumSchema(["absolute", "relative"] as const),
    sizeBytes: nonNegativeIntegerSchema(),
    fingerprint: fingerprintSchema(),
    snapshotFingerprint: fingerprintSchema(),
    operationCount: nonNegativeIntegerSchema(),
  },
  ["kind", "sourceKind", "auditSafe", "redacted"],
);

const actionSchema = objectSchema(
  "Workspace session snapshot retention cleanup action",
  {
    kind: {
      type: "string",
      const: "localWorkspaceSessionSnapshotRetentionCleanupAction",
    },
    action: enumSchema(workspaceSessionSnapshotRetentionCleanupActions),
    reasons: nonEmptyReasonArraySchema(),
    sourceIndex: nonNegativeIntegerSchema(),
    rank: positiveIntegerSchema(),
    summary: summarySchema,
    issues: {
      type: "array",
      items: issueSchema,
    },
  },
  ["kind", "action", "reasons", "sourceIndex", "summary", "issues"],
);

export const workspaceSessionSnapshotRetentionCleanupRequestSchema = deepFreeze({
  $schema: JSON_SCHEMA_DRAFT,
  $id:
    "https://schemas.sovereignops.local/workspace-session/snapshot-retention-cleanup-request.schema.json",
  title: "Workspace session snapshot retention cleanup request",
  oneOf: workspaceSessionSnapshotRetentionCleanupSourceKeys.map(requestBranchSchema),
} satisfies WorkspaceSessionSnapshotRetentionCleanupJsonSchema);

export const workspaceSessionSnapshotRetentionCleanupResponseSchema = deepFreeze(
  objectSchema(
    "Workspace session snapshot retention cleanup response",
    {
      kind: {
        type: "string",
        const: "localWorkspaceSessionSnapshotRetentionCleanupPlan",
      },
      schemaVersion: {
        type: "string",
        const: LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_SCHEMA_VERSION,
      },
      localOnly: {
        type: "boolean",
        const: true,
      },
      dryRun: {
        type: "boolean",
        const: true,
      },
      durableWrites: {
        type: "boolean",
        const: false,
      },
      thresholds: thresholdsSchema,
      entryCount: nonNegativeIntegerSchema(),
      keepCount: nonNegativeIntegerSchema(),
      deleteCount: nonNegativeIntegerSchema(),
      reviewCount: nonNegativeIntegerSchema(),
      actions: {
        type: "array",
        items: actionSchema,
      },
      keepActions: {
        type: "array",
        items: actionSchema,
      },
      deleteActions: {
        type: "array",
        items: actionSchema,
      },
      reviewActions: {
        type: "array",
        items: actionSchema,
      },
    },
    [
      "kind",
      "schemaVersion",
      "localOnly",
      "dryRun",
      "durableWrites",
      "thresholds",
      "entryCount",
      "keepCount",
      "deleteCount",
      "reviewCount",
      "actions",
      "keepActions",
      "deleteActions",
      "reviewActions",
    ],
    "snapshot-retention-cleanup-response",
  ),
);

export const workspaceSessionSnapshotRetentionCleanupSchemaDefinitions = deepFreeze({
  workspaceSessionSnapshotRetentionCleanupRequest: {
    kind: "workspaceSessionSnapshotRetentionCleanupRequest",
    schemaVersion: WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_SCHEMA_VERSION,
    title:
      workspaceSessionSnapshotRetentionCleanupRequestSchema.title ??
      "Workspace session snapshot retention cleanup request",
    schema: workspaceSessionSnapshotRetentionCleanupRequestSchema,
  },
  workspaceSessionSnapshotRetentionCleanupResponse: {
    kind: "workspaceSessionSnapshotRetentionCleanupResponse",
    schemaVersion: WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_SCHEMA_VERSION,
    title:
      workspaceSessionSnapshotRetentionCleanupResponseSchema.title ??
      "Workspace session snapshot retention cleanup response",
    schema: workspaceSessionSnapshotRetentionCleanupResponseSchema,
  },
} satisfies Record<
  WorkspaceSessionSnapshotRetentionCleanupKind,
  WorkspaceSessionSnapshotRetentionCleanupSchemaDefinition
>);

export const workspaceSessionSnapshotRetentionCleanupSchemas = {
  workspaceSessionSnapshotRetentionCleanupRequest:
    workspaceSessionSnapshotRetentionCleanupRequestSchema,
  workspaceSessionSnapshotRetentionCleanupResponse:
    workspaceSessionSnapshotRetentionCleanupResponseSchema,
} as const satisfies Record<
  WorkspaceSessionSnapshotRetentionCleanupKind,
  WorkspaceSessionSnapshotRetentionCleanupJsonSchema
>;

export const workspaceSessionSnapshotRetentionCleanupValidators = {
  workspaceSessionSnapshotRetentionCleanupRequest:
    validateWorkspaceSessionSnapshotRetentionCleanupRequest,
  workspaceSessionSnapshotRetentionCleanupResponse:
    validateWorkspaceSessionSnapshotRetentionCleanupResponse,
} as const;

export function isWorkspaceSessionSnapshotRetentionCleanupKind(
  value: unknown,
): value is WorkspaceSessionSnapshotRetentionCleanupKind {
  return (
    typeof value === "string" &&
    workspaceSessionSnapshotRetentionCleanupKinds.includes(
      value as WorkspaceSessionSnapshotRetentionCleanupKind,
    )
  );
}

export function getWorkspaceSessionSnapshotRetentionCleanupSchema(
  kind: WorkspaceSessionSnapshotRetentionCleanupKind,
): WorkspaceSessionSnapshotRetentionCleanupJsonSchema {
  return workspaceSessionSnapshotRetentionCleanupSchemas[kind];
}

export function validateWorkspaceSessionSnapshotRetentionCleanupObject<
  K extends WorkspaceSessionSnapshotRetentionCleanupKind,
>(
  kind: K,
  value: unknown,
): ValidationResult<WorkspaceSessionSnapshotRetentionCleanupObjectByKind[K]> {
  const validator = workspaceSessionSnapshotRetentionCleanupValidators[kind] as (
    candidate: unknown,
  ) => ValidationResult<unknown>;
  return validator(value) as ValidationResult<WorkspaceSessionSnapshotRetentionCleanupObjectByKind[K]>;
}

export function assertWorkspaceSessionSnapshotRetentionCleanupObject<
  K extends WorkspaceSessionSnapshotRetentionCleanupKind,
>(
  kind: K,
  value: unknown,
): asserts value is WorkspaceSessionSnapshotRetentionCleanupObjectByKind[K] {
  const result = validateWorkspaceSessionSnapshotRetentionCleanupObject(kind, value);
  if (!result.ok) {
    throw new Error(formatValidationIssues(kind, result.issues));
  }
}

export function validateWorkspaceSessionSnapshotRetentionCleanupRequest(
  value: unknown,
): ValidationResult<WorkspaceSessionSnapshotRetentionCleanupRequest> {
  const issues: ValidationIssue[] = [];
  validateRequestValue(value, "$", issues);
  return validationResult(value, issues);
}

export function validateWorkspaceSessionSnapshotRetentionCleanupResponse(
  value: unknown,
): ValidationResult<WorkspaceSessionSnapshotRetentionCleanupResponse> {
  const issues: ValidationIssue[] = [];
  validateResponseValue(value, "$", issues);
  return validationResult(value, issues);
}

export function assertWorkspaceSessionSnapshotRetentionCleanupRequest(
  value: unknown,
): asserts value is WorkspaceSessionSnapshotRetentionCleanupRequest {
  const result = validateWorkspaceSessionSnapshotRetentionCleanupRequest(value);
  if (!result.ok) {
    throw new Error(
      formatValidationIssues("workspaceSessionSnapshotRetentionCleanupRequest", result.issues),
    );
  }
}

export function assertWorkspaceSessionSnapshotRetentionCleanupResponse(
  value: unknown,
): asserts value is WorkspaceSessionSnapshotRetentionCleanupResponse {
  const result = validateWorkspaceSessionSnapshotRetentionCleanupResponse(value);
  if (!result.ok) {
    throw new Error(
      formatValidationIssues("workspaceSessionSnapshotRetentionCleanupResponse", result.issues),
    );
  }
}

export function isWorkspaceSessionSnapshotRetentionCleanupFingerprint(
  value: unknown,
): value is `sha256:${string}` {
  return typeof value === "string" && new RegExp(SHA256_FINGERPRINT_PATTERN).test(value);
}

export function isWorkspaceSessionSnapshotRetentionCleanupSnapshotId(
  value: unknown,
): value is string {
  return typeof value === "string" && new RegExp(SNAPSHOT_ID_PATTERN).test(value);
}

export function isWorkspaceSessionSnapshotRetentionCleanupSafePath(value: unknown): value is string {
  return typeof value === "string" && isSafePathOrRedacted(value);
}

function requestBranchSchema(
  sourceKey: WorkspaceSessionSnapshotRetentionCleanupSourceKey,
): WorkspaceSessionSnapshotRetentionCleanupJsonSchema {
  return objectSchema(
    `Workspace session snapshot retention cleanup ${sourceKey} request`,
    {
      [sourceKey]: {
        type: "array",
        maxItems: 1000,
        items: requestEntrySchema,
      },
      maxCount: nonNegativeIntegerSchema(),
      maxAgeMs: nonNegativeIntegerSchema(),
      now: timestampSchema(),
    },
    [sourceKey],
  );
}

function validateRequestValue(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): WorkspaceSessionSnapshotRetentionCleanupRequest | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, requestKeys, issues);
  const presentSourceKeys = workspaceSessionSnapshotRetentionCleanupSourceKeys.filter(
    (sourceKey) => record[sourceKey] !== undefined,
  );
  if (presentSourceKeys.length !== 1) {
    issues.push({ path, message: "request must include exactly one entries, files, or records array" });
  }

  for (const sourceKey of workspaceSessionSnapshotRetentionCleanupSourceKeys) {
    if (record[sourceKey] !== undefined) {
      validateRequestEntryArray(record, sourceKey, issues, path);
    }
  }
  optionalNonNegativeInteger(record, "maxCount", issues, path);
  optionalNonNegativeInteger(record, "maxAgeMs", issues, path);
  optionalTimestamp(record, "now", issues, path);

  return record as unknown as WorkspaceSessionSnapshotRetentionCleanupRequest;
}

function validateResponseValue(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): WorkspaceSessionSnapshotRetentionCleanupResponse | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, responseKeys, issues);
  requireExactString(record, "kind", "localWorkspaceSessionSnapshotRetentionCleanupPlan", issues, path);
  requireExactString(record, "schemaVersion", LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_SCHEMA_VERSION, issues, path);
  requireTrue(record, "localOnly", issues, path);
  requireTrue(record, "dryRun", issues, path);
  requireFalse(record, "durableWrites", issues, path);
  const thresholds = requireRecord(record, "thresholds", issues, path);
  if (thresholds) {
    validateThresholds(thresholds, keyPath(path, "thresholds"), issues);
  }
  requireNonNegativeInteger(record, "entryCount", issues, path);
  requireNonNegativeInteger(record, "keepCount", issues, path);
  requireNonNegativeInteger(record, "deleteCount", issues, path);
  requireNonNegativeInteger(record, "reviewCount", issues, path);

  const actions = validateActionArray(record, "actions", issues, path);
  const keepActions = validateActionArray(record, "keepActions", issues, path);
  const deleteActions = validateActionArray(record, "deleteActions", issues, path);
  const reviewActions = validateActionArray(record, "reviewActions", issues, path);
  validateResponseCounts(record, actions, keepActions, deleteActions, reviewActions, path, issues);

  return record as unknown as WorkspaceSessionSnapshotRetentionCleanupResponse;
}

function validateRequestEntryArray(
  record: Record<string, unknown>,
  key: WorkspaceSessionSnapshotRetentionCleanupSourceKey,
  issues: ValidationIssue[],
  parentPath: string,
): WorkspaceSessionSnapshotRetentionCleanupRequestEntry[] | undefined {
  const value = record[key];
  const path = keyPath(parentPath, key);
  if (!Array.isArray(value)) {
    issues.push({ path, message: `${key} must be an array` });
    return undefined;
  }
  if (value.length > 1000) {
    issues.push({ path, message: `${key} must include at most 1000 entries` });
  }

  const entries: WorkspaceSessionSnapshotRetentionCleanupRequestEntry[] = [];
  for (const [index, entry] of value.entries()) {
    const entryValue = validateRequestEntry(entry, `${path}[${index}]`, issues);
    if (entryValue) {
      entries.push(entryValue);
    }
  }
  return entries;
}

function validateRequestEntry(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): WorkspaceSessionSnapshotRetentionCleanupRequestEntry | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, requestEntryKeys, issues);
  optionalEnum(record, "sourceKind", workspaceSessionSnapshotRetentionCleanupSourceKinds, issues, path);
  optionalPathOrRedacted(record, "path", issues, path);
  optionalSnapshotId(record, "snapshotId", issues, path);
  optionalIdOrRedacted(record, "workspaceId", issues, path);
  optionalIdOrRedacted(record, "deviceId", issues, path);
  optionalIdOrRedacted(record, "sessionId", issues, path);
  optionalPublicText(record, "label", issues, path);
  optionalTimestamp(record, "createdAt", issues, path);
  optionalTimestamp(record, "updatedAt", issues, path);
  optionalNonNegativeInteger(record, "sizeBytes", issues, path);
  optionalNonNegativeInteger(record, "eventCount", issues, path);
  optionalFingerprint(record, "fingerprint", issues, path);
  optionalFingerprint(record, "snapshotFingerprint", issues, path);
  if (record.metadata !== undefined) {
    validateMetadata(record.metadata, keyPath(path, "metadata"), issues);
  }

  return record as unknown as WorkspaceSessionSnapshotRetentionCleanupRequestEntry;
}

function validateThresholds(
  record: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
): void {
  requireOnlyKeys(record, path, thresholdsKeys, issues);
  optionalNonNegativeInteger(record, "maxCount", issues, path);
  optionalNonNegativeInteger(record, "maxAgeMs", issues, path);
  optionalTimestamp(record, "now", issues, path);
  optionalTimestamp(record, "cutoffAt", issues, path);
}

function validateActionArray(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): WorkspaceSessionSnapshotRetentionCleanupAction[] | undefined {
  const value = record[key];
  const path = keyPath(parentPath, key);
  if (!Array.isArray(value)) {
    issues.push({ path, message: `${key} must be an array` });
    return undefined;
  }

  const actions: WorkspaceSessionSnapshotRetentionCleanupAction[] = [];
  for (const [index, item] of value.entries()) {
    const action = validateAction(item, `${path}[${index}]`, issues);
    if (action) {
      actions.push(action);
    }
  }
  return actions;
}

function validateAction(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): WorkspaceSessionSnapshotRetentionCleanupAction | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, actionKeys, issues);
  requireExactString(record, "kind", "localWorkspaceSessionSnapshotRetentionCleanupAction", issues, path);
  requireEnum(record, "action", workspaceSessionSnapshotRetentionCleanupActions, issues, path);
  validateReasonArray(record, "reasons", issues, path);
  requireNonNegativeInteger(record, "sourceIndex", issues, path);
  optionalPositiveInteger(record, "rank", issues, path);
  const summary = requireRecord(record, "summary", issues, path);
  if (summary) {
    validateSummary(summary, keyPath(path, "summary"), issues);
  }
  const actionIssues = validateIssueArray(record, "issues", issues, path);
  validateActionConsistency(record, actionIssues, path, issues);

  return record as unknown as WorkspaceSessionSnapshotRetentionCleanupAction;
}

function validateSummary(
  record: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
): void {
  requireOnlyKeys(record, path, summaryKeys, issues);
  requireExactString(record, "kind", "localWorkspaceSessionSnapshotRetentionCleanupSummary", issues, path);
  requireEnum(record, "sourceKind", workspaceSessionSnapshotRetentionCleanupSourceKinds, issues, path);
  requireTrue(record, "auditSafe", issues, path);
  requireTrue(record, "redacted", issues, path);
  optionalSnapshotId(record, "snapshotId", issues, path);
  optionalIdOrRedacted(record, "workspaceId", issues, path);
  optionalIdOrRedacted(record, "deviceId", issues, path);
  optionalIdOrRedacted(record, "sessionId", issues, path);
  optionalPublicText(record, "label", issues, path);
  optionalTimestamp(record, "createdAt", issues, path);
  optionalTimestamp(record, "updatedAt", issues, path);
  optionalNonNegativeInteger(record, "ageMs", issues, path);
  optionalRedactedPathRef(record, "fileRef", issues, path);
  optionalEnum(record, "filePathKind", ["absolute", "relative"] as const, issues, path);
  optionalNonNegativeInteger(record, "sizeBytes", issues, path);
  optionalFingerprint(record, "fingerprint", issues, path);
  optionalFingerprint(record, "snapshotFingerprint", issues, path);
  optionalNonNegativeInteger(record, "operationCount", issues, path);
}

function validateIssueArray(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): WorkspaceSessionSnapshotRetentionCleanupIssue[] | undefined {
  const value = record[key];
  const path = keyPath(parentPath, key);
  if (!Array.isArray(value)) {
    issues.push({ path, message: `${key} must be an array` });
    return undefined;
  }

  const validIssues: WorkspaceSessionSnapshotRetentionCleanupIssue[] = [];
  for (const [index, item] of value.entries()) {
    const issue = validateIssue(item, `${path}[${index}]`, issues);
    if (issue) {
      validIssues.push(issue);
    }
  }
  return validIssues;
}

function validateIssue(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): WorkspaceSessionSnapshotRetentionCleanupIssue | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, issueKeys, issues);
  requireExactString(record, "kind", "localWorkspaceSessionSnapshotRetentionCleanupIssue", issues, path);
  requireEnum(record, "issueKind", workspaceSessionSnapshotRetentionCleanupIssueKinds, issues, path);
  requirePattern(record, "path", FIELD_PATH_PATTERN, "path must be a redacted-safe field path", issues, path);
  requireEnum(record, "reason", workspaceSessionSnapshotRetentionCleanupReasons, issues, path);
  requirePublicText(record, "message", issues, path);

  return record as unknown as WorkspaceSessionSnapshotRetentionCleanupIssue;
}

function validateReasonArray(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): WorkspaceSessionSnapshotRetentionCleanupReason[] | undefined {
  const value = record[key];
  const path = keyPath(parentPath, key);
  if (!Array.isArray(value)) {
    issues.push({ path, message: `${key} must be an array` });
    return undefined;
  }
  if (value.length === 0) {
    issues.push({ path, message: `${key} must contain at least one reason` });
  }

  const seen = new Set<string>();
  const reasons: WorkspaceSessionSnapshotRetentionCleanupReason[] = [];
  for (const [index, item] of value.entries()) {
    if (!workspaceSessionSnapshotRetentionCleanupReasons.includes(item as WorkspaceSessionSnapshotRetentionCleanupReason)) {
      issues.push({
        path: `${path}[${index}]`,
        message: `${key} values must be known cleanup reasons`,
      });
      continue;
    }
    if (seen.has(item as string)) {
      issues.push({ path: `${path}[${index}]`, message: `${key} values must not be duplicated` });
    }
    seen.add(item as string);
    reasons.push(item as WorkspaceSessionSnapshotRetentionCleanupReason);
  }
  return reasons;
}

function validateActionConsistency(
  record: Record<string, unknown>,
  actionIssues: WorkspaceSessionSnapshotRetentionCleanupIssue[] | undefined,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!workspaceSessionSnapshotRetentionCleanupActions.includes(record.action as WorkspaceSessionSnapshotRetentionCleanupActionKind)) {
    return;
  }
  const action = record.action as WorkspaceSessionSnapshotRetentionCleanupActionKind;
  const reasons = Array.isArray(record.reasons) ? record.reasons : [];

  if (action === "review") {
    if (record.rank !== undefined) {
      issues.push({ path: keyPath(path, "rank"), message: "review actions must not include rank" });
    }
    if (!reasons.includes("requires-review")) {
      issues.push({
        path: keyPath(path, "reasons"),
        message: "review actions must include requires-review",
      });
    }
    if (actionIssues && actionIssues.length === 0) {
      issues.push({ path: keyPath(path, "issues"), message: "review actions must include issues" });
    }
    return;
  }

  if (record.rank === undefined) {
    issues.push({ path: keyPath(path, "rank"), message: `${action} actions must include rank` });
  }
  if (reasons.includes("requires-review")) {
    issues.push({
      path: keyPath(path, "reasons"),
      message: `${action} actions must not include requires-review`,
    });
  }
  if (actionIssues && actionIssues.length > 0) {
    issues.push({ path: keyPath(path, "issues"), message: `${action} actions must not include issues` });
  }
}

function validateResponseCounts(
  record: Record<string, unknown>,
  actions: WorkspaceSessionSnapshotRetentionCleanupAction[] | undefined,
  keepActions: WorkspaceSessionSnapshotRetentionCleanupAction[] | undefined,
  deleteActions: WorkspaceSessionSnapshotRetentionCleanupAction[] | undefined,
  reviewActions: WorkspaceSessionSnapshotRetentionCleanupAction[] | undefined,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!actions || !keepActions || !deleteActions || !reviewActions) {
    return;
  }

  requireCount(record, "entryCount", actions.length, issues, path);
  requireCount(record, "keepCount", keepActions.length, issues, path);
  requireCount(record, "deleteCount", deleteActions.length, issues, path);
  requireCount(record, "reviewCount", reviewActions.length, issues, path);
  requireOnlyActionKind(keepActions, "keep", keyPath(path, "keepActions"), issues);
  requireOnlyActionKind(deleteActions, "delete", keyPath(path, "deleteActions"), issues);
  requireOnlyActionKind(reviewActions, "review", keyPath(path, "reviewActions"), issues);

  const groupedActionCount = keepActions.length + deleteActions.length + reviewActions.length;
  if (actions.length !== groupedActionCount) {
    issues.push({
      path: keyPath(path, "actions"),
      message: "actions must match grouped action arrays",
    });
  }
}

function validateMetadata(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): WorkspaceSessionSnapshotRetentionCleanupMetadata | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  for (const [key, entryValue] of Object.entries(record)) {
    const entryPath = keyPath(path, key);
    if (!isSafeMetadataKey(key)) {
      issues.push({ path: entryPath, message: "metadata keys must be non-sensitive summary labels" });
    }
    if (!isSafeMetadataValue(entryValue)) {
      issues.push({ path: entryPath, message: "metadata values must be sanitized primitive values" });
    }
  }

  return record as WorkspaceSessionSnapshotRetentionCleanupMetadata;
}

function validationResult<TRecord>(
  value: unknown,
  issues: ValidationIssue[],
): ValidationResult<TRecord> {
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

function requireExactString(
  record: Record<string, unknown>,
  key: string,
  expected: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  if (record[key] !== expected) {
    issues.push({ path: keyPath(parentPath, key), message: `${key} must be ${expected}` });
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

function requireFalse(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  if (record[key] !== false) {
    issues.push({ path: keyPath(parentPath, key), message: `${key} must be false` });
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

function requirePublicText(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  requirePattern(record, key, PUBLIC_TEXT_PATTERN, `${key} must be redacted-safe public text`, issues, parentPath);
}

function optionalPublicText(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  if (record[key] !== undefined) {
    requirePublicText(record, key, issues, parentPath);
  }
}

function requireNonNegativeInteger(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (!isNonNegativeInteger(value)) {
    issues.push({ path: keyPath(parentPath, key), message: `${key} must be a non-negative safe integer` });
  }
}

function optionalNonNegativeInteger(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  if (record[key] !== undefined) {
    requireNonNegativeInteger(record, key, issues, parentPath);
  }
}

function optionalPositiveInteger(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (value !== undefined && (!Number.isSafeInteger(value) || (value as number) < 1)) {
    issues.push({ path: keyPath(parentPath, key), message: `${key} must be a positive safe integer` });
  }
}

function optionalTimestamp(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  const path = keyPath(parentPath, key);
  if (value === undefined) {
    return;
  }
  if (typeof value !== "string" || !new RegExp(ISO_TIMESTAMP_PATTERN).test(value)) {
    issues.push({ path, message: `${key} must be an ISO UTC timestamp` });
    return;
  }
  if (!isExactIsoTimestamp(value)) {
    issues.push({ path, message: `${key} must be a valid timestamp` });
  }
}

function optionalPathOrRedacted(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (value !== undefined && (typeof value !== "string" || !isSafePathOrRedacted(value))) {
    issues.push({ path: keyPath(parentPath, key), message: `${key} must be a safe relative or redacted path` });
  }
}

function optionalRedactedPathRef(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (value !== undefined && (typeof value !== "string" || !new RegExp(REDACTED_PATH_REF_PATTERN).test(value))) {
    issues.push({ path: keyPath(parentPath, key), message: `${key} must be a redacted path reference` });
  }
}

function optionalSnapshotId(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (value !== undefined && (typeof value !== "string" || !new RegExp(SNAPSHOT_ID_PATTERN).test(value))) {
    issues.push({ path: keyPath(parentPath, key), message: `${key} must be a safe snapshot id` });
  }
}

function optionalIdOrRedacted(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (value !== undefined && (typeof value !== "string" || !new RegExp(`^${ID_OR_REDACTED_PATTERN}$`).test(value))) {
    issues.push({ path: keyPath(parentPath, key), message: `${key} must be a safe id or redacted reference` });
  }
}

function optionalFingerprint(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (
    value !== undefined &&
    !isWorkspaceSessionSnapshotRetentionCleanupFingerprint(value)
  ) {
    issues.push({ path: keyPath(parentPath, key), message: `${key} must be a sha256 fingerprint` });
  }
}

function requireCount(
  record: Record<string, unknown>,
  key: string,
  expected: number,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  if (typeof record[key] === "number" && record[key] !== expected) {
    issues.push({ path: keyPath(parentPath, key), message: `${key} must match action counts` });
  }
}

function requireOnlyActionKind(
  actions: readonly WorkspaceSessionSnapshotRetentionCleanupAction[],
  expected: WorkspaceSessionSnapshotRetentionCleanupActionKind,
  path: string,
  issues: ValidationIssue[],
): void {
  for (const [index, action] of actions.entries()) {
    if (action.action !== expected) {
      issues.push({ path: `${path}[${index}].action`, message: `${path} must contain only ${expected} actions` });
    }
  }
}

function isSafeMetadataKey(value: string): boolean {
  return new RegExp(METADATA_KEY_PATTERN).test(value) && !SECRET_LIKE_PATTERN.test(value);
}

function isSafeMetadataValue(value: unknown): boolean {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value === null || Number.isFinite(value);
  }
  return typeof value === "string" && isSafeString(value);
}

function isSafePathOrRedacted(value: string): boolean {
  if (REDACTED_TOKEN_PATTERN.test(value)) {
    return true;
  }
  return (
    new RegExp(SAFE_RELATIVE_PATH_PATTERN).test(value) &&
    !value.includes("\\") &&
    !value.split("/").includes("..") &&
    !isUnsafeString(value)
  );
}

function isSafeString(value: string): boolean {
  return SAFE_STRING_VALUE_PATTERN.test(value) && !isUnsafeString(value);
}

function isUnsafeString(value: string): boolean {
  return RAW_LOCAL_PATH_PATTERN.test(value) || RAW_LOCK_TOKEN_PATTERN.test(value) || SECRET_LIKE_PATTERN.test(value);
}

function isNonNegativeInteger(value: unknown): boolean {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isExactIsoTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function keyPath(parentPath: string, key: string): string {
  return parentPath === "$" ? key : `${parentPath}.${key}`;
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

function formatValidationIssues(
  kind: WorkspaceSessionSnapshotRetentionCleanupKind,
  issues: readonly ValidationIssue[],
): string {
  const details = issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
  return `${kind} validation failed: ${details}`;
}

function objectSchema(
  title: string,
  properties: Record<string, WorkspaceSessionSnapshotRetentionCleanupJsonSchema>,
  required: readonly string[],
  slug?: string,
): WorkspaceSessionSnapshotRetentionCleanupJsonSchema {
  return {
    $schema: JSON_SCHEMA_DRAFT,
    $id: slug ? `https://schemas.sovereignops.local/workspace-session/${slug}.schema.json` : undefined,
    title,
    type: "object",
    additionalProperties: false,
    properties,
    required,
  };
}

function enumSchema(
  values: readonly (string | number | boolean | null)[],
): WorkspaceSessionSnapshotRetentionCleanupJsonSchema {
  return {
    type: typeof values[0] === "string" ? "string" : undefined,
    enum: values,
  };
}

function timestampSchema(): WorkspaceSessionSnapshotRetentionCleanupJsonSchema {
  return {
    type: "string",
    pattern: ISO_TIMESTAMP_PATTERN,
  };
}

function snapshotIdSchema(): WorkspaceSessionSnapshotRetentionCleanupJsonSchema {
  return {
    type: "string",
    pattern: SNAPSHOT_ID_PATTERN,
  };
}

function idOrRedactedSchema(): WorkspaceSessionSnapshotRetentionCleanupJsonSchema {
  return {
    type: "string",
    pattern: `^${ID_OR_REDACTED_PATTERN}$`,
  };
}

function pathOrRedactedSchema(): WorkspaceSessionSnapshotRetentionCleanupJsonSchema {
  return {
    type: "string",
    pattern: `^${PATH_OR_REDACTED_PATTERN}$`,
  };
}

function redactedPathRefSchema(): WorkspaceSessionSnapshotRetentionCleanupJsonSchema {
  return {
    type: "string",
    pattern: REDACTED_PATH_REF_PATTERN,
  };
}

function fingerprintSchema(): WorkspaceSessionSnapshotRetentionCleanupJsonSchema {
  return {
    type: "string",
    pattern: SHA256_FINGERPRINT_PATTERN,
  };
}

function fieldPathSchema(): WorkspaceSessionSnapshotRetentionCleanupJsonSchema {
  return {
    type: "string",
    minLength: 1,
    maxLength: 192,
    pattern: FIELD_PATH_PATTERN,
  };
}

function publicTextSchema(): WorkspaceSessionSnapshotRetentionCleanupJsonSchema {
  return {
    type: "string",
    minLength: 1,
    maxLength: 240,
    pattern: PUBLIC_TEXT_PATTERN,
  };
}

function safeMetadataKeySchema(): WorkspaceSessionSnapshotRetentionCleanupJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: SAFE_METADATA_KEY_PATTERN,
  };
}

function nonNegativeIntegerSchema(): WorkspaceSessionSnapshotRetentionCleanupJsonSchema {
  return {
    type: "integer",
    minimum: 0,
    maximum: MAX_SAFE_INTEGER,
  };
}

function positiveIntegerSchema(): WorkspaceSessionSnapshotRetentionCleanupJsonSchema {
  return {
    type: "integer",
    minimum: 1,
    maximum: MAX_SAFE_INTEGER,
  };
}

function nonEmptyReasonArraySchema(): WorkspaceSessionSnapshotRetentionCleanupJsonSchema {
  return {
    type: "array",
    minItems: 1,
    items: enumSchema(workspaceSessionSnapshotRetentionCleanupReasons),
  };
}

const requestKeys = ["entries", "files", "records", "maxCount", "maxAgeMs", "now"] as const;

const requestEntryKeys = [
  "sourceKind",
  "path",
  "snapshotId",
  "workspaceId",
  "deviceId",
  "sessionId",
  "label",
  "createdAt",
  "updatedAt",
  "sizeBytes",
  "eventCount",
  "fingerprint",
  "snapshotFingerprint",
  "metadata",
] as const;

const thresholdsKeys = ["maxCount", "maxAgeMs", "now", "cutoffAt"] as const;

const responseKeys = [
  "kind",
  "schemaVersion",
  "localOnly",
  "dryRun",
  "durableWrites",
  "thresholds",
  "entryCount",
  "keepCount",
  "deleteCount",
  "reviewCount",
  "actions",
  "keepActions",
  "deleteActions",
  "reviewActions",
] as const;

const actionKeys = ["kind", "action", "reasons", "sourceIndex", "rank", "summary", "issues"] as const;

const summaryKeys = [
  "kind",
  "sourceKind",
  "auditSafe",
  "redacted",
  "snapshotId",
  "workspaceId",
  "deviceId",
  "sessionId",
  "label",
  "createdAt",
  "updatedAt",
  "ageMs",
  "fileRef",
  "filePathKind",
  "sizeBytes",
  "fingerprint",
  "snapshotFingerprint",
  "operationCount",
] as const;

const issueKeys = ["kind", "issueKind", "path", "reason", "message"] as const;
