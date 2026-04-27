import {
  JSON_SCHEMA_DRAFT,
  type ValidationIssue,
  type ValidationResult,
  type WorkspaceSessionSnapshotRetentionCleanupJsonSchema,
  workspaceSessionSnapshotRetentionCleanupSourceKinds,
} from "./workspaceSessionSnapshotRetentionCleanup.ts";

export const WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_INVENTORY_SCHEMA_VERSION =
  "workspace-session-snapshot-retention-cleanup-inventory/v1";

export const workspaceSessionSnapshotRetentionCleanupInventoryKinds = [
  "workspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest",
] as const;
export type WorkspaceSessionSnapshotRetentionCleanupInventoryKind =
  (typeof workspaceSessionSnapshotRetentionCleanupInventoryKinds)[number];

export const workspaceSessionSnapshotRetentionCleanupInventorySectionKeys = [
  "entries",
  "files",
  "records",
] as const;
export type WorkspaceSessionSnapshotRetentionCleanupInventorySectionKey =
  (typeof workspaceSessionSnapshotRetentionCleanupInventorySectionKeys)[number];

export const workspaceSessionSnapshotRetentionCleanupInventorySourceKeys = [
  "inventory",
  ...workspaceSessionSnapshotRetentionCleanupInventorySectionKeys,
] as const;
export type WorkspaceSessionSnapshotRetentionCleanupInventorySourceKey =
  (typeof workspaceSessionSnapshotRetentionCleanupInventorySourceKeys)[number];

export type WorkspaceSessionSnapshotRetentionCleanupInventoryMetadataValue =
  | string
  | number
  | boolean
  | null;
export type WorkspaceSessionSnapshotRetentionCleanupInventoryMetadata =
  Record<string, WorkspaceSessionSnapshotRetentionCleanupInventoryMetadataValue>;

export interface WorkspaceSessionSnapshotRetentionCleanupInventoryInputItem {
  path?: string;
  relativePath?: string;
  snapshotId?: string;
  workspaceId?: string;
  deviceId?: string;
  sessionId?: string;
  sourceKind?: (typeof workspaceSessionSnapshotRetentionCleanupSourceKinds)[number];
  label?: string;
  createdAt?: string;
  updatedAt?: string;
  sizeBytes?: number;
  eventCount?: number;
  fingerprint?: string;
  snapshotFingerprint?: string;
  auditSafe?: true;
  redacted?: true;
  metadata?: WorkspaceSessionSnapshotRetentionCleanupInventoryMetadata;
}

export interface WorkspaceSessionSnapshotRetentionCleanupInventoryObject {
  entries?: readonly WorkspaceSessionSnapshotRetentionCleanupInventoryInputItem[];
  files?: readonly WorkspaceSessionSnapshotRetentionCleanupInventoryInputItem[];
  records?: readonly WorkspaceSessionSnapshotRetentionCleanupInventoryInputItem[];
}

export type WorkspaceSessionSnapshotRetentionCleanupInventoryValue =
  | readonly WorkspaceSessionSnapshotRetentionCleanupInventoryInputItem[]
  | WorkspaceSessionSnapshotRetentionCleanupInventoryObject;

export interface WorkspaceSessionSnapshotRetentionCleanupInventoryPolicy {
  maxCount?: number;
  maxAgeMs?: number;
  now?: string;
}

export interface WorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest {
  inventory?: WorkspaceSessionSnapshotRetentionCleanupInventoryValue;
  entries?: readonly WorkspaceSessionSnapshotRetentionCleanupInventoryInputItem[];
  files?: readonly WorkspaceSessionSnapshotRetentionCleanupInventoryInputItem[];
  records?: readonly WorkspaceSessionSnapshotRetentionCleanupInventoryInputItem[];
  policy?: WorkspaceSessionSnapshotRetentionCleanupInventoryPolicy;
  maxCount?: number;
  maxAgeMs?: number;
  now?: string;
}

export interface WorkspaceSessionSnapshotRetentionCleanupInventorySchemaDefinition {
  kind: WorkspaceSessionSnapshotRetentionCleanupInventoryKind;
  schemaVersion: typeof WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_INVENTORY_SCHEMA_VERSION;
  title: string;
  schema: WorkspaceSessionSnapshotRetentionCleanupJsonSchema;
}

export interface WorkspaceSessionSnapshotRetentionCleanupInventoryObjectByKind {
  workspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest:
    WorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest;
}

type JsonCompatibleValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonCompatibleValue[]
  | { readonly [key: string]: JsonCompatibleValue };

type CloneResult =
  | { ok: true; value: JsonCompatibleValue }
  | { ok: false };

const MAX_SAFE_INTEGER = 9007199254740991;
const MAX_INVENTORY_RECORDS = 1000;
const ISO_TIMESTAMP_PATTERN = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$";
const SNAPSHOT_ID_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$";
const SAFE_ID_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._:-]{0,160}$";
const ID_OR_REDACTED_PATTERN =
  `(?:${SAFE_ID_PATTERN.slice(1, -1)}|\\[redacted(?::[A-Za-z0-9_-]+)*\\])`;
const SHA256_FINGERPRINT_PATTERN = "^sha256:[a-f0-9]{64}$";
const SAFE_RELATIVE_PATH_PATTERN =
  "^(?!/)(?![A-Za-z]:)(?!.*(?:^|/)\\.\\.(?:/|$))(?!.*//)[A-Za-z0-9._/-]{1,240}$";
const REDACTED_TOKEN_PATTERN_SOURCE = "\\[redacted(?::[A-Za-z0-9_-]+)*\\]";
const PATH_OR_REDACTED_PATTERN =
  `(?:${SAFE_RELATIVE_PATH_PATTERN.slice(1, -1)}|${REDACTED_TOKEN_PATTERN_SOURCE})`;
const SECRET_LIKE_KEY_PATTERN_SOURCE =
  "(?:[aA][pP][iI][._-]?[kK][eE][yY]|[aA][uU][tT][hH]|[aA][uU][tT][hH][oO][rR][iI][zZ][aA][tT][iI][oO][nN]|[bB][eE][aA][rR][eE][rR]|[cC][oO][oO][kK][iI][eE]|[cC][rR][eE][dD][eE][nN][tT][iI][aA][lL]|[jJ][wW][tT]|[pP][aA][sS][sS](?:[wW][oO][rR][dD]|[pP][hH][rR][aA][sS][eE])?|[pP][rR][iI][vV][aA][tT][eE][._-]?[kK][eE][yY]|[rR][eE][fF][rR][eE][sS][hH][._-]?[tT][oO][kK][eE][nN]|[sS][eE][cC][rR][eE][tT]|[sS][eE][sS][sS][iI][oO][nN][._-]?[tT][oO][kK][eE][nN]|[sS][iI][gG][nN][iI][nN][gG][._-]?[kK][eE][yY]|[tT][oO][kK][eE][nN])";
const SAFE_METADATA_KEY_PATTERN =
  `^(?!.*${SECRET_LIKE_KEY_PATTERN_SOURCE})[A-Za-z][A-Za-z0-9_.-]{0,63}$`;
const SAFE_STRING_PATTERN =
  `^(?!${REDACTED_TOKEN_PATTERN_SOURCE}$)(?!.*(?:[bB][eE][aA][rR][eE][rR]\\s+\\S+|(?:sk|rk|pk|tok|pat|npm|ghp|gho)_[A-Za-z0-9_-]{8,}|(?:sk|rk|pat|glpat|github_pat)-[A-Za-z0-9_-]{8,}|lock_[A-Za-z0-9_-]{4,}|[A-Za-z]:[\\\\/]|\\\\\\\\|file://|(?:^|\\s)/(?:Users|home|var|tmp|private|mnt|Volumes)/|[aA][pP][iI][._-]?[kK][eE][yY]\\s*[:=]|[pP][aA][sS][sS](?:[wW][oO][rR][dD]|[pP][hH][rR][aA][sS][eE])?\\s*[:=]|[sS][eE][cC][rR][eE][tT]\\s*[:=]|[tT][oO][kK][eE][nN]\\s*[:=])).*$`;
const PUBLIC_TEXT_PATTERN = "^[A-Za-z0-9\\[][A-Za-z0-9 ._,:()\\[\\]\\/-]{0,79}$";
const METADATA_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const SECRET_LIKE_KEY_PATTERN = new RegExp(SECRET_LIKE_KEY_PATTERN_SOURCE);
const SAFE_STRING_VALUE_PATTERN = new RegExp(SAFE_STRING_PATTERN);
const REDACTED_TOKEN_PATTERN = new RegExp(`^${REDACTED_TOKEN_PATTERN_SOURCE}$`);
const RAW_LOCK_TOKEN_PATTERN = /^lock_[A-Za-z0-9_-]{4,}$/;
const RAW_LOCAL_PATH_PATTERN =
  /(?:\b[A-Za-z]:[\\/][^\s"',;)}\]]+|\\\\[^\\\s"',;)}\]]+[\\][^\s"',;)}\]]+|file:\/\/[^\s"',;)}\]]+|(?:^|[\s"'(=])\/(?!\/)[^\s"',;)}\]]+)/i;
const SECRET_VALUE_PATTERN =
  /\b(?:Bearer\s+[A-Za-z0-9._~+/=-]{8,}|(?:sk|rk|pk|tok|pat|npm|ghp|gho)_[A-Za-z0-9_-]{8,}|(?:sk|rk|pat|glpat|github_pat)-[A-Za-z0-9_-]{8,})\b/i;
const SECRET_ASSIGNMENT_PATTERN =
  /\b(?:api[-_]?key|apikey|authorization|credential|password|passphrase|secret|session[-_]?token|token)\s*[:=]\s*([^\s,;]+)/i;
const SENSITIVE_FIELD_PATTERN =
  /(?:authorization|api_key|apikey|auth|bearer|cookie|credential|jwt|password|passphrase|private_key|refresh_token|secret|session_token|signing_key|token)$/;
const PATH_FIELD_PATTERN =
  /(?:^|_)(?:absolute_path|file_path|path|relative_path|storage_path)$/;

const policyKeys = ["maxCount", "maxAgeMs", "now"] as const;
const requestKeys = [
  ...workspaceSessionSnapshotRetentionCleanupInventorySourceKeys,
  "policy",
  ...policyKeys,
] as const;
const inputItemKeys = [
  "path",
  "relativePath",
  "snapshotId",
  "workspaceId",
  "deviceId",
  "sessionId",
  "sourceKind",
  "label",
  "createdAt",
  "updatedAt",
  "sizeBytes",
  "eventCount",
  "fingerprint",
  "snapshotFingerprint",
  "auditSafe",
  "redacted",
  "metadata",
] as const;

const safeMetadataValueSchema: WorkspaceSessionSnapshotRetentionCleanupJsonSchema = {
  oneOf: [
    {
      type: "string",
      maxLength: 240,
      pattern: SAFE_STRING_PATTERN,
    },
    {
      type: "string",
      pattern: `^${REDACTED_TOKEN_PATTERN_SOURCE}$`,
    },
    {
      type: ["number", "boolean", "null"],
    },
  ],
};

const metadataSchema: WorkspaceSessionSnapshotRetentionCleanupJsonSchema = {
  type: "object",
  propertyNames: safeMetadataKeySchema(),
  additionalProperties: safeMetadataValueSchema,
};

const inventoryInputItemSchema = objectSchema(
  "Workspace session snapshot retention cleanup inventory input item",
  {
    path: pathOrRedactedSchema(),
    relativePath: pathOrRedactedSchema(),
    snapshotId: snapshotIdSchema(),
    workspaceId: idOrRedactedSchema(),
    deviceId: idOrRedactedSchema(),
    sessionId: idOrRedactedSchema(),
    sourceKind: enumSchema(workspaceSessionSnapshotRetentionCleanupSourceKinds),
    label: publicTextSchema(),
    createdAt: timestampSchema(),
    updatedAt: timestampSchema(),
    sizeBytes: nonNegativeIntegerSchema(),
    eventCount: nonNegativeIntegerSchema(),
    fingerprint: fingerprintSchema(),
    snapshotFingerprint: fingerprintSchema(),
    auditSafe: {
      type: "boolean",
      const: true,
    },
    redacted: {
      type: "boolean",
      const: true,
    },
    metadata: metadataSchema,
  },
  [],
);

const inventoryArraySchema: WorkspaceSessionSnapshotRetentionCleanupJsonSchema = {
  type: "array",
  maxItems: MAX_INVENTORY_RECORDS,
  items: inventoryInputItemSchema,
};

const policySchema = objectSchema(
  "Workspace session snapshot retention cleanup inventory policy",
  {
    maxCount: nonNegativeIntegerSchema(),
    maxAgeMs: nonNegativeIntegerSchema(),
    now: timestampSchema(),
  },
  [],
);

export const workspaceSessionSnapshotRetentionCleanupInventoryPreviewRequestSchema =
  deepFreeze({
    $schema: JSON_SCHEMA_DRAFT,
    $id:
      "https://schemas.sovereignops.local/workspace-session/snapshot-retention-cleanup-inventory-request.schema.json",
    title: "Workspace session snapshot retention cleanup inventory preview request",
    oneOf: requestBranchSchemas(),
  } satisfies WorkspaceSessionSnapshotRetentionCleanupJsonSchema);

export const workspaceSessionSnapshotRetentionCleanupInventorySchemaDefinitions =
  deepFreeze({
    workspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest: {
      kind: "workspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest",
      schemaVersion: WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_INVENTORY_SCHEMA_VERSION,
      title:
        workspaceSessionSnapshotRetentionCleanupInventoryPreviewRequestSchema.title ??
        "Workspace session snapshot retention cleanup inventory preview request",
      schema: workspaceSessionSnapshotRetentionCleanupInventoryPreviewRequestSchema,
    },
  } satisfies Record<
    WorkspaceSessionSnapshotRetentionCleanupInventoryKind,
    WorkspaceSessionSnapshotRetentionCleanupInventorySchemaDefinition
  >);

export const workspaceSessionSnapshotRetentionCleanupInventorySchemas = {
  workspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest:
    workspaceSessionSnapshotRetentionCleanupInventoryPreviewRequestSchema,
} as const satisfies Record<
  WorkspaceSessionSnapshotRetentionCleanupInventoryKind,
  WorkspaceSessionSnapshotRetentionCleanupJsonSchema
>;

export const workspaceSessionSnapshotRetentionCleanupInventoryValidators = {
  workspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest:
    validateWorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest,
} as const;

export function isWorkspaceSessionSnapshotRetentionCleanupInventoryKind(
  value: unknown,
): value is WorkspaceSessionSnapshotRetentionCleanupInventoryKind {
  return (
    typeof value === "string" &&
    workspaceSessionSnapshotRetentionCleanupInventoryKinds.includes(
      value as WorkspaceSessionSnapshotRetentionCleanupInventoryKind,
    )
  );
}

export function getWorkspaceSessionSnapshotRetentionCleanupInventorySchema(
  kind: WorkspaceSessionSnapshotRetentionCleanupInventoryKind,
): WorkspaceSessionSnapshotRetentionCleanupJsonSchema {
  return workspaceSessionSnapshotRetentionCleanupInventorySchemas[kind];
}

export function validateWorkspaceSessionSnapshotRetentionCleanupInventoryObject<
  K extends WorkspaceSessionSnapshotRetentionCleanupInventoryKind,
>(
  kind: K,
  value: unknown,
): ValidationResult<WorkspaceSessionSnapshotRetentionCleanupInventoryObjectByKind[K]> {
  const validator = workspaceSessionSnapshotRetentionCleanupInventoryValidators[kind] as (
    candidate: unknown,
  ) => ValidationResult<unknown>;
  return validator(value) as ValidationResult<
    WorkspaceSessionSnapshotRetentionCleanupInventoryObjectByKind[K]
  >;
}

export function assertWorkspaceSessionSnapshotRetentionCleanupInventoryObject<
  K extends WorkspaceSessionSnapshotRetentionCleanupInventoryKind,
>(
  kind: K,
  value: unknown,
): asserts value is WorkspaceSessionSnapshotRetentionCleanupInventoryObjectByKind[K] {
  const result = validateWorkspaceSessionSnapshotRetentionCleanupInventoryObject(kind, value);
  if (!result.ok) {
    throw new Error(formatValidationIssues(kind, result.issues));
  }
}

export function validateWorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest(
  value: unknown,
): ValidationResult<WorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest> {
  const issues: ValidationIssue[] = [];
  const cloned = cloneJsonCompatibleValue(value, "$", issues);
  if (cloned.ok) {
    validateRequestValue(cloned.value, "$", issues);
  }

  return issues.length === 0
    ? {
        ok: true,
        issues,
        value: cloned.ok
          ? cloned.value as WorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest
          : undefined,
      }
    : { ok: false, issues };
}

export function assertWorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest(
  value: unknown,
): asserts value is WorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest {
  const result =
    validateWorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest(value);
  if (!result.ok) {
    throw new Error(
      formatValidationIssues(
        "workspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest",
        result.issues,
      ),
    );
  }
}

export function isWorkspaceSessionSnapshotRetentionCleanupInventorySafePath(
  value: unknown,
): value is string {
  return typeof value === "string" && isSafeRelativeOrRedactedPath(value);
}

function requestBranchSchemas(): readonly WorkspaceSessionSnapshotRetentionCleanupJsonSchema[] {
  return inventorySourceSchemas().flatMap((source) => [
    requestBranchSchema(source, "topLevelPolicy"),
    requestBranchSchema(source, "policyObject"),
  ]);
}

function inventorySourceSchemas(): readonly {
  title: string;
  properties: Record<string, WorkspaceSessionSnapshotRetentionCleanupJsonSchema>;
  required: readonly string[];
}[] {
  const topLevelSectionSchemas = workspaceSessionSnapshotRetentionCleanupInventorySectionKeys.map(
    (sectionKey) => ({
      title: `Workspace session snapshot retention cleanup ${sectionKey} request`,
      properties: {
        [sectionKey]: inventoryArraySchema,
      },
      required: [sectionKey],
    }),
  );
  const nestedInventorySchemas = [
    {
      title: "Workspace session snapshot retention cleanup inventory array request",
      properties: {
        inventory: inventoryArraySchema,
      },
      required: ["inventory"],
    },
    ...workspaceSessionSnapshotRetentionCleanupInventorySectionKeys.map((sectionKey) => ({
      title:
        `Workspace session snapshot retention cleanup inventory ${sectionKey} request`,
      properties: {
        inventory: objectSchema(
          `Workspace session snapshot retention cleanup inventory ${sectionKey}`,
          {
            [sectionKey]: inventoryArraySchema,
          },
          [sectionKey],
        ),
      },
      required: ["inventory"],
    })),
  ];

  return [...nestedInventorySchemas, ...topLevelSectionSchemas];
}

function requestBranchSchema(
  source: {
    title: string;
    properties: Record<string, WorkspaceSessionSnapshotRetentionCleanupJsonSchema>;
    required: readonly string[];
  },
  policyStyle: "topLevelPolicy" | "policyObject",
): WorkspaceSessionSnapshotRetentionCleanupJsonSchema {
  const policyProperties = policyStyle === "topLevelPolicy"
    ? {
        maxCount: nonNegativeIntegerSchema(),
        maxAgeMs: nonNegativeIntegerSchema(),
        now: timestampSchema(),
      }
    : {
        policy: policySchema,
      };

  return objectSchema(
    `${source.title} ${policyStyle === "policyObject" ? "with policy object" : "with top-level policy"}`,
    {
      ...source.properties,
      ...policyProperties,
    },
    policyStyle === "policyObject"
      ? [...source.required, "policy"]
      : source.required,
  );
}

function validateRequestValue(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): WorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, requestKeys, issues);

  const presentSourceKeys = workspaceSessionSnapshotRetentionCleanupInventorySourceKeys.filter(
    (sourceKey) => record[sourceKey] !== undefined,
  );
  if (presentSourceKeys.length !== 1) {
    issues.push({
      path,
      message: "request must include exactly one inventory, entries, files, or records section",
    });
  }

  if (record.inventory !== undefined) {
    validateInventoryValue(record.inventory, keyPath(path, "inventory"), issues);
  }
  for (const sectionKey of workspaceSessionSnapshotRetentionCleanupInventorySectionKeys) {
    if (record[sectionKey] !== undefined) {
      validateInventoryRecordArray(
        record[sectionKey],
        keyPath(path, sectionKey),
        issues,
      );
    }
  }

  validatePolicySections(record, path, issues);
  return record as unknown as WorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest;
}

function validateInventoryValue(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): WorkspaceSessionSnapshotRetentionCleanupInventoryValue | undefined {
  if (Array.isArray(value)) {
    return validateInventoryRecordArray(value, path, issues);
  }

  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(
    record,
    path,
    workspaceSessionSnapshotRetentionCleanupInventorySectionKeys,
    issues,
  );
  const presentSectionKeys = workspaceSessionSnapshotRetentionCleanupInventorySectionKeys.filter(
    (sectionKey) => record[sectionKey] !== undefined,
  );
  if (presentSectionKeys.length !== 1) {
    issues.push({
      path,
      message: "inventory must include exactly one entries, files, or records array",
    });
  }

  for (const sectionKey of workspaceSessionSnapshotRetentionCleanupInventorySectionKeys) {
    if (record[sectionKey] !== undefined) {
      validateInventoryRecordArray(
        record[sectionKey],
        keyPath(path, sectionKey),
        issues,
      );
    }
  }

  return record as unknown as WorkspaceSessionSnapshotRetentionCleanupInventoryObject;
}

function validateInventoryRecordArray(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): WorkspaceSessionSnapshotRetentionCleanupInventoryInputItem[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "inventory records must be an array" });
    return undefined;
  }
  if (value.length > MAX_INVENTORY_RECORDS) {
    issues.push({
      path,
      message: `inventory records must include at most ${MAX_INVENTORY_RECORDS} items`,
    });
  }

  const records: WorkspaceSessionSnapshotRetentionCleanupInventoryInputItem[] = [];
  for (const [index, item] of value.entries()) {
    const itemPath = `${path}[${index}]`;
    const record = validateInventoryInputItem(item, itemPath, issues);
    if (record) {
      records.push(record);
      validateNoUnsafeInventoryInput(record, itemPath, "", issues);
    }
  }
  return records;
}

function validateInventoryInputItem(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): WorkspaceSessionSnapshotRetentionCleanupInventoryInputItem | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, inputItemKeys, issues);
  optionalPathOrRedacted(record, "path", issues, path);
  optionalPathOrRedacted(record, "relativePath", issues, path);
  optionalSnapshotId(record, "snapshotId", issues, path);
  optionalIdOrRedacted(record, "workspaceId", issues, path);
  optionalIdOrRedacted(record, "deviceId", issues, path);
  optionalIdOrRedacted(record, "sessionId", issues, path);
  optionalEnum(record, "sourceKind", workspaceSessionSnapshotRetentionCleanupSourceKinds, issues, path);
  optionalPublicText(record, "label", issues, path);
  optionalTimestamp(record, "createdAt", issues, path);
  optionalTimestamp(record, "updatedAt", issues, path);
  optionalNonNegativeInteger(record, "sizeBytes", issues, path);
  optionalNonNegativeInteger(record, "eventCount", issues, path);
  optionalFingerprint(record, "fingerprint", issues, path);
  optionalFingerprint(record, "snapshotFingerprint", issues, path);
  optionalTrue(record, "auditSafe", issues, path);
  optionalTrue(record, "redacted", issues, path);
  if (record.metadata !== undefined) {
    validateMetadata(record.metadata, keyPath(path, "metadata"), issues);
  }

  return record as unknown as WorkspaceSessionSnapshotRetentionCleanupInventoryInputItem;
}

function validatePolicySections(
  record: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
): void {
  const topLevelPolicyKeys = policyKeys.filter((key) => record[key] !== undefined);
  if (record.policy !== undefined && topLevelPolicyKeys.length > 0) {
    issues.push({
      path,
      message: "request must include only one retention policy section",
    });
  }

  if (record.policy !== undefined) {
    validatePolicy(record.policy, keyPath(path, "policy"), issues);
  }
  for (const policyKey of policyKeys) {
    if (record[policyKey] !== undefined) {
      validatePolicyField(record, policyKey, issues, path);
    }
  }
}

function validatePolicy(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): WorkspaceSessionSnapshotRetentionCleanupInventoryPolicy | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, policyKeys, issues);
  for (const policyKey of policyKeys) {
    if (record[policyKey] !== undefined) {
      validatePolicyField(record, policyKey, issues, path);
    }
  }

  return record as unknown as WorkspaceSessionSnapshotRetentionCleanupInventoryPolicy;
}

function validatePolicyField(
  record: Record<string, unknown>,
  key: (typeof policyKeys)[number],
  issues: ValidationIssue[],
  parentPath: string,
): void {
  if (key === "now") {
    optionalTimestamp(record, key, issues, parentPath);
    return;
  }
  optionalNonNegativeInteger(record, key, issues, parentPath);
}

function validateMetadata(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): WorkspaceSessionSnapshotRetentionCleanupInventoryMetadata | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  for (const [key, entryValue] of Object.entries(record)) {
    const entryPath = keyPath(path, key);
    if (!isSafeMetadataKey(key)) {
      issues.push({
        path: entryPath,
        message: "metadata keys must be non-sensitive summary labels",
      });
    }
    if (!isSafeMetadataValue(entryValue)) {
      issues.push({
        path: entryPath,
        message: "metadata values must be sanitized primitive values",
      });
    }
  }

  return record as WorkspaceSessionSnapshotRetentionCleanupInventoryMetadata;
}

function validateNoUnsafeInventoryInput(
  value: unknown,
  path: string,
  keyHint: string,
  issues: ValidationIssue[],
): void {
  if (typeof value === "string") {
    const reason = unsafeInventoryReason(value, keyHint);
    if (reason !== undefined) {
      issues.push({
        path,
        message:
          `inventory must not include raw secrets, lock tokens, or local paths (${reason})`,
      });
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      validateNoUnsafeInventoryInput(item, `${path}[${index}]`, keyHint, issues);
    }
    return;
  }

  if (isRecord(value)) {
    for (const [key, nested] of Object.entries(value)) {
      validateNoUnsafeInventoryInput(nested, keyPath(path, key), key, issues);
    }
  }
}

function unsafeInventoryReason(value: string, keyHint: string): string | undefined {
  if (isKnownRedactedValue(value) || normalizeToken(keyHint).includes("fingerprint")) {
    return undefined;
  }

  const key = normalizeToken(keyHint);
  if (PATH_FIELD_PATTERN.test(key)) {
    if (RAW_LOCAL_PATH_PATTERN.test(value)) {
      return "raw-local-path";
    }
    if (hasTraversalSegment(value)) {
      return "path-traversal";
    }
    if (!isSafeRelativeOrRedactedPath(value)) {
      return "unsafe-path";
    }
  }
  if (RAW_LOCAL_PATH_PATTERN.test(value)) {
    return "raw-local-path";
  }
  if (RAW_LOCK_TOKEN_PATTERN.test(value) || key.includes("lock_token")) {
    return "raw-lock-token";
  }
  if (SENSITIVE_FIELD_PATTERN.test(key)) {
    return "raw-secret";
  }

  const assignedSecret = SECRET_ASSIGNMENT_PATTERN.exec(value);
  if (assignedSecret !== null && !isKnownRedactedValue(assignedSecret[1])) {
    return "raw-secret";
  }
  if (SECRET_VALUE_PATTERN.test(value)) {
    return "raw-secret";
  }

  return undefined;
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

function optionalEnum<TValue extends string>(
  record: Record<string, unknown>,
  key: string,
  allowed: readonly TValue[],
  issues: ValidationIssue[],
  parentPath: string,
): void {
  if (record[key] !== undefined && !allowed.includes(record[key] as TValue)) {
    issues.push({ path: keyPath(parentPath, key), message: `${key} must be one of ${allowed.join(", ")}` });
  }
}

function optionalPathOrRedacted(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (value !== undefined && (typeof value !== "string" || !isSafeRelativeOrRedactedPath(value))) {
    issues.push({
      path: keyPath(parentPath, key),
      message: `${key} must be a safe relative or redacted path`,
    });
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

function optionalPublicText(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (value !== undefined && (typeof value !== "string" || !new RegExp(PUBLIC_TEXT_PATTERN).test(value))) {
    issues.push({ path: keyPath(parentPath, key), message: `${key} must be redacted-safe public text` });
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

function optionalNonNegativeInteger(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (value !== undefined && !isNonNegativeInteger(value)) {
    issues.push({ path: keyPath(parentPath, key), message: `${key} must be a non-negative safe integer` });
  }
}

function optionalFingerprint(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (value !== undefined && (typeof value !== "string" || !new RegExp(SHA256_FINGERPRINT_PATTERN).test(value))) {
    issues.push({ path: keyPath(parentPath, key), message: `${key} must be a sha256 fingerprint` });
  }
}

function optionalTrue(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  if (record[key] !== undefined && record[key] !== true) {
    issues.push({ path: keyPath(parentPath, key), message: `${key} must be true` });
  }
}

function cloneJsonCompatibleValue(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  seen: WeakSet<object> = new WeakSet<object>(),
): CloneResult {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return { ok: true, value };
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      issues.push({ path, message: "value must be JSON-compatible" });
      return { ok: false };
    }
    return { ok: true, value };
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      issues.push({ path, message: "value must not contain circular references" });
      return { ok: false };
    }

    seen.add(value);
    const output: JsonCompatibleValue[] = [];
    for (const [index, item] of value.entries()) {
      const parsed = cloneJsonCompatibleValue(item, `${path}[${index}]`, issues, seen);
      if (!parsed.ok) {
        seen.delete(value);
        return { ok: false };
      }
      output.push(parsed.value);
    }
    seen.delete(value);

    return { ok: true, value: deepFreeze(output) };
  }

  if (isRecord(value)) {
    if (seen.has(value)) {
      issues.push({ path, message: "value must not contain circular references" });
      return { ok: false };
    }

    seen.add(value);
    const output: Record<string, JsonCompatibleValue> = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      if (entryValue === undefined) {
        issues.push({
          path: keyPath(path, entryKey),
          message: "value must be JSON-compatible",
        });
        seen.delete(value);
        return { ok: false };
      }

      const parsed = cloneJsonCompatibleValue(
        entryValue,
        keyPath(path, entryKey),
        issues,
        seen,
      );
      if (!parsed.ok) {
        seen.delete(value);
        return { ok: false };
      }
      output[entryKey] = parsed.value;
    }
    seen.delete(value);

    return { ok: true, value: deepFreeze(output) };
  }

  issues.push({ path, message: "value must be JSON-compatible" });
  return { ok: false };
}

function isSafeRelativeOrRedactedPath(value: string): boolean {
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

function isSafeMetadataKey(value: string): boolean {
  return METADATA_KEY_PATTERN.test(value) && !SECRET_LIKE_KEY_PATTERN.test(value);
}

function isSafeMetadataValue(value: unknown): boolean {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value === null || Number.isFinite(value);
  }
  return typeof value === "string" && (isKnownRedactedValue(value) || isSafeString(value));
}

function isSafeString(value: string): boolean {
  return SAFE_STRING_VALUE_PATTERN.test(value) && !isUnsafeString(value);
}

function isUnsafeString(value: string): boolean {
  return (
    RAW_LOCAL_PATH_PATTERN.test(value) ||
    RAW_LOCK_TOKEN_PATTERN.test(value) ||
    SECRET_VALUE_PATTERN.test(value) ||
    SECRET_ASSIGNMENT_PATTERN.test(value)
  );
}

function isKnownRedactedValue(value: string): boolean {
  return value === "[REDACTED]" || REDACTED_TOKEN_PATTERN.test(value);
}

function hasTraversalSegment(value: string): boolean {
  return /(^|[\\/])\.\.([\\/]|$)/.test(value);
}

function normalizeToken(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
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
  kind: WorkspaceSessionSnapshotRetentionCleanupInventoryKind,
  issues: readonly ValidationIssue[],
): string {
  const details = issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
  return `${kind} validation failed: ${details}`;
}

function objectSchema(
  title: string,
  properties: Record<string, WorkspaceSessionSnapshotRetentionCleanupJsonSchema>,
  required: readonly string[],
): WorkspaceSessionSnapshotRetentionCleanupJsonSchema {
  return {
    $schema: JSON_SCHEMA_DRAFT,
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

function fingerprintSchema(): WorkspaceSessionSnapshotRetentionCleanupJsonSchema {
  return {
    type: "string",
    pattern: SHA256_FINGERPRINT_PATTERN,
  };
}

function publicTextSchema(): WorkspaceSessionSnapshotRetentionCleanupJsonSchema {
  return {
    type: "string",
    minLength: 1,
    maxLength: 80,
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
