import {
  MCP_APPROVAL_EVIDENCE_SCHEMA_VERSION,
  mcpApprovalPolicyDecisions,
  mcpApprovalStatuses,
  type McpApprovalPolicyDecision,
  type McpApprovalStatus,
} from "./mcpApprovalEvidence.ts";

export const MCP_APPROVAL_EVIDENCE_RECORD_SCHEMA_VERSION = "mcp-approval-evidence-record/v1";
export const MCP_APPROVAL_EVIDENCE_RECORD_LIST_SCHEMA_VERSION = "mcp-approval-evidence-record-list/v1";
export const MCP_APPROVAL_EVIDENCE_RECORD_COMPARISON_SCHEMA_VERSION =
  "mcp-approval-evidence-record-comparison/v1";
export const MCP_APPROVAL_EVIDENCE_RECORD_CREATE_REQUEST_SCHEMA_VERSION =
  "mcp-approval-evidence-record-create-request/v1";
export const JSON_SCHEMA_DRAFT = "https://json-schema.org/draft/2020-12/schema";

export const mcpApprovalEvidenceRecordKinds = [
  "mcpApprovalEvidenceRecord",
  "mcpApprovalEvidenceRecordList",
  "mcpApprovalEvidenceRecordComparison",
  "mcpApprovalEvidenceRecordCreateRequest",
] as const;
export type McpApprovalEvidenceRecordKind = (typeof mcpApprovalEvidenceRecordKinds)[number];

export const mcpApprovalEvidenceReferenceRoles = ["source", "supporting"] as const;
export type McpApprovalEvidenceReferenceRole = (typeof mcpApprovalEvidenceReferenceRoles)[number];

export const mcpApprovalEvidenceRecordComparisonChanges = ["added", "removed", "changed"] as const;
export type McpApprovalEvidenceRecordComparisonChange =
  (typeof mcpApprovalEvidenceRecordComparisonChanges)[number];

export type JsonSchemaType = "array" | "boolean" | "integer" | "null" | "number" | "object" | "string";

export interface McpApprovalEvidenceRecordJsonSchema {
  readonly $schema?: string;
  readonly $id?: string;
  readonly title?: string;
  readonly type?: JsonSchemaType | readonly JsonSchemaType[];
  readonly additionalProperties?: boolean | McpApprovalEvidenceRecordJsonSchema;
  readonly properties?: Record<string, McpApprovalEvidenceRecordJsonSchema>;
  readonly propertyNames?: McpApprovalEvidenceRecordJsonSchema;
  readonly required?: readonly string[];
  readonly enum?: readonly (string | number | boolean | null)[];
  readonly const?: string | number | boolean | null;
  readonly pattern?: string;
  readonly minLength?: number;
  readonly minimum?: number;
  readonly minItems?: number;
  readonly items?: McpApprovalEvidenceRecordJsonSchema;
}

export interface McpApprovalEvidenceRecordSchemaDefinition {
  kind: McpApprovalEvidenceRecordKind;
  schemaVersion: string;
  title: string;
  schema: McpApprovalEvidenceRecordJsonSchema;
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

export type McpApprovalEvidenceRecordMetadataValue = string | number | boolean | null;
export type McpApprovalEvidenceRecordMetadata = Record<string, McpApprovalEvidenceRecordMetadataValue>;

export interface McpApprovalEvidenceReference {
  evidenceId: `mcpae_${string}`;
  evidenceSchemaVersion: typeof MCP_APPROVAL_EVIDENCE_SCHEMA_VERSION;
  role: McpApprovalEvidenceReferenceRole;
  fingerprint: string;
  capturedAt: string;
  redacted: true;
}

export interface McpApprovalEvidenceRecordRedactionSummary {
  redacted: true;
  redactedFieldCount: number;
  redactedPaths: readonly string[];
  retainedMetadataKeys: readonly string[];
}

export interface McpApprovalEvidenceStoredRecord {
  schemaVersion: typeof MCP_APPROVAL_EVIDENCE_RECORD_SCHEMA_VERSION;
  id: `mcpaer_${string}`;
  fingerprint: string;
  createdAt: string;
  workspaceId: `wsp_${string}`;
  sourcePreviewFingerprint: string;
  localOnly: true;
  redacted: true;
  policyDecision: McpApprovalPolicyDecision;
  approvalStatus: McpApprovalStatus;
  evidenceRefs: readonly McpApprovalEvidenceReference[];
  redactionSummary: McpApprovalEvidenceRecordRedactionSummary;
  metadata?: McpApprovalEvidenceRecordMetadata;
}

export interface McpApprovalEvidenceRecordList {
  schemaVersion: typeof MCP_APPROVAL_EVIDENCE_RECORD_LIST_SCHEMA_VERSION;
  generatedAt: string;
  workspaceId: `wsp_${string}`;
  localOnly: true;
  redacted: true;
  records: readonly McpApprovalEvidenceStoredRecord[];
}

export interface McpApprovalEvidenceRecordComparisonDifference {
  path: string;
  change: McpApprovalEvidenceRecordComparisonChange;
  baseFingerprint?: string;
  candidateFingerprint?: string;
}

export interface McpApprovalEvidenceRecordComparison {
  schemaVersion: typeof MCP_APPROVAL_EVIDENCE_RECORD_COMPARISON_SCHEMA_VERSION;
  createdAt: string;
  workspaceId: `wsp_${string}`;
  localOnly: true;
  redacted: true;
  baseRecordId: `mcpaer_${string}`;
  candidateRecordId: `mcpaer_${string}`;
  baseFingerprint: string;
  candidateFingerprint: string;
  sourcePreviewFingerprint: string;
  compatible: boolean;
  differences: readonly McpApprovalEvidenceRecordComparisonDifference[];
}

export interface McpApprovalEvidenceRecordCreateRequest {
  schemaVersion: typeof MCP_APPROVAL_EVIDENCE_RECORD_CREATE_REQUEST_SCHEMA_VERSION;
  requestedAt: string;
  workspaceId: `wsp_${string}`;
  sourcePreviewFingerprint: string;
  localOnly: true;
  redacted: true;
  policyDecision: McpApprovalPolicyDecision;
  approvalStatus: McpApprovalStatus;
  evidenceRefs: readonly McpApprovalEvidenceReference[];
  redactionSummary: McpApprovalEvidenceRecordRedactionSummary;
  metadata?: McpApprovalEvidenceRecordMetadata;
}

export interface McpApprovalEvidenceRecordObjectByKind {
  mcpApprovalEvidenceRecord: McpApprovalEvidenceStoredRecord;
  mcpApprovalEvidenceRecordList: McpApprovalEvidenceRecordList;
  mcpApprovalEvidenceRecordComparison: McpApprovalEvidenceRecordComparison;
  mcpApprovalEvidenceRecordCreateRequest: McpApprovalEvidenceRecordCreateRequest;
}

const HEX_SHA256_PATTERN = "^[a-f0-9]{64}$";
const ID_BODY_PATTERN = "[A-Za-z0-9_-]{1,88}";
const RECORD_ID_PATTERN = "^mcpaer_[a-f0-9]{24}$";
const EVIDENCE_ID_PATTERN = `^mcpae_${ID_BODY_PATTERN}$`;
const WORKSPACE_ID_PATTERN = `^wsp_${ID_BODY_PATTERN}$`;
const ISO_TIMESTAMP_PATTERN = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$";
const PATH_REF_PATTERN = "^[A-Za-z][A-Za-z0-9_.\\[\\]-]{0,191}$";
const METADATA_KEY_PATTERN = "^[A-Za-z][A-Za-z0-9_.-]{0,63}$";
const SECRET_LIKE_METADATA_KEY_PATTERN_SOURCE =
  "(?:[aA][pP][iI][_-]?[kK][eE][yY]|[aA][uU][tT][hH][oO][rR][iI][zZ][aA][tT][iI][oO][nN]|[bB][eE][aA][rR][eE][rR]|[cC][rR][eE][dD][eE][nN][tT][iI][aA][lL]|[pP][aA][sS][sS][wW][oO][rR][dD]|[pP][rR][iI][vV][aA][tT][eE][_-]?[kK][eE][yY]|[rR][aA][wW]|[sS][eE][cC][rR][eE][tT]|[tT][oO][kK][eE][nN])";
const SAFE_METADATA_KEY_PATTERN =
  `^(?!.*${SECRET_LIKE_METADATA_KEY_PATTERN_SOURCE})[A-Za-z][A-Za-z0-9_.-]{0,63}$`;
const SECRET_LIKE_METADATA_KEY_PATTERN = new RegExp(SECRET_LIKE_METADATA_KEY_PATTERN_SOURCE);

const evidenceReferenceSchema = objectSchema(
  "MCP approval evidence reference",
  {
    evidenceId: evidenceIdSchema(),
    evidenceSchemaVersion: {
      type: "string",
      const: MCP_APPROVAL_EVIDENCE_SCHEMA_VERSION,
    },
    role: enumSchema(mcpApprovalEvidenceReferenceRoles),
    fingerprint: fingerprintSchema(),
    capturedAt: timestampSchema(),
    redacted: {
      type: "boolean",
      const: true,
    },
  },
  ["evidenceId", "evidenceSchemaVersion", "role", "fingerprint", "capturedAt", "redacted"],
);

const redactionSummarySchema = objectSchema(
  "MCP approval evidence record redaction summary",
  {
    redacted: {
      type: "boolean",
      const: true,
    },
    redactedFieldCount: positiveIntegerSchema(),
    redactedPaths: nonEmptyPathRefArraySchema(),
    retainedMetadataKeys: safeMetadataKeyArraySchema(),
  },
  ["redacted", "redactedFieldCount", "redactedPaths", "retainedMetadataKeys"],
);

const comparisonDifferenceSchema = objectSchema(
  "MCP approval evidence record comparison difference",
  {
    path: pathRefSchema(),
    change: enumSchema(mcpApprovalEvidenceRecordComparisonChanges),
    baseFingerprint: fingerprintSchema(),
    candidateFingerprint: fingerprintSchema(),
  },
  ["path", "change"],
);

export const mcpApprovalEvidenceRecordSchema = deepFreeze(
  objectSchema(
    "Persisted MCP approval evidence record",
    {
      schemaVersion: {
        type: "string",
        const: MCP_APPROVAL_EVIDENCE_RECORD_SCHEMA_VERSION,
      },
      id: recordIdSchema(),
      fingerprint: fingerprintSchema(),
      createdAt: timestampSchema(),
      workspaceId: workspaceIdSchema(),
      sourcePreviewFingerprint: fingerprintSchema(),
      localOnly: {
        type: "boolean",
        const: true,
      },
      redacted: {
        type: "boolean",
        const: true,
      },
      policyDecision: enumSchema(mcpApprovalPolicyDecisions),
      approvalStatus: enumSchema(mcpApprovalStatuses),
      evidenceRefs: arraySchema(evidenceReferenceSchema, 1),
      redactionSummary: redactionSummarySchema,
      metadata: metadataSchema(),
    },
    [
      "schemaVersion",
      "id",
      "fingerprint",
      "createdAt",
      "workspaceId",
      "sourcePreviewFingerprint",
      "localOnly",
      "redacted",
      "policyDecision",
      "approvalStatus",
      "evidenceRefs",
      "redactionSummary",
    ],
    "approval-evidence-record",
  ),
);

export const mcpApprovalEvidenceRecordListSchema = deepFreeze(
  objectSchema(
    "Persisted MCP approval evidence record list",
    {
      schemaVersion: {
        type: "string",
        const: MCP_APPROVAL_EVIDENCE_RECORD_LIST_SCHEMA_VERSION,
      },
      generatedAt: timestampSchema(),
      workspaceId: workspaceIdSchema(),
      localOnly: {
        type: "boolean",
        const: true,
      },
      redacted: {
        type: "boolean",
        const: true,
      },
      records: arraySchema(mcpApprovalEvidenceRecordSchema),
    },
    ["schemaVersion", "generatedAt", "workspaceId", "localOnly", "redacted", "records"],
    "approval-evidence-record-list",
  ),
);

export const mcpApprovalEvidenceRecordComparisonSchema = deepFreeze(
  objectSchema(
    "Persisted MCP approval evidence record comparison",
    {
      schemaVersion: {
        type: "string",
        const: MCP_APPROVAL_EVIDENCE_RECORD_COMPARISON_SCHEMA_VERSION,
      },
      createdAt: timestampSchema(),
      workspaceId: workspaceIdSchema(),
      localOnly: {
        type: "boolean",
        const: true,
      },
      redacted: {
        type: "boolean",
        const: true,
      },
      baseRecordId: recordIdSchema(),
      candidateRecordId: recordIdSchema(),
      baseFingerprint: fingerprintSchema(),
      candidateFingerprint: fingerprintSchema(),
      sourcePreviewFingerprint: fingerprintSchema(),
      compatible: { type: "boolean" },
      differences: arraySchema(comparisonDifferenceSchema),
    },
    [
      "schemaVersion",
      "createdAt",
      "workspaceId",
      "localOnly",
      "redacted",
      "baseRecordId",
      "candidateRecordId",
      "baseFingerprint",
      "candidateFingerprint",
      "sourcePreviewFingerprint",
      "compatible",
      "differences",
    ],
    "approval-evidence-record-comparison",
  ),
);

export const mcpApprovalEvidenceRecordCreateRequestSchema = deepFreeze(
  objectSchema(
    "MCP approval evidence record create request",
    {
      schemaVersion: {
        type: "string",
        const: MCP_APPROVAL_EVIDENCE_RECORD_CREATE_REQUEST_SCHEMA_VERSION,
      },
      requestedAt: timestampSchema(),
      workspaceId: workspaceIdSchema(),
      sourcePreviewFingerprint: fingerprintSchema(),
      localOnly: {
        type: "boolean",
        const: true,
      },
      redacted: {
        type: "boolean",
        const: true,
      },
      policyDecision: enumSchema(mcpApprovalPolicyDecisions),
      approvalStatus: enumSchema(mcpApprovalStatuses),
      evidenceRefs: arraySchema(evidenceReferenceSchema, 1),
      redactionSummary: redactionSummarySchema,
      metadata: metadataSchema(),
    },
    [
      "schemaVersion",
      "requestedAt",
      "workspaceId",
      "sourcePreviewFingerprint",
      "localOnly",
      "redacted",
      "policyDecision",
      "approvalStatus",
      "evidenceRefs",
      "redactionSummary",
    ],
    "approval-evidence-record-create-request",
  ),
);

export const mcpApprovalEvidenceRecordSchemaDefinitions = deepFreeze({
  mcpApprovalEvidenceRecord: {
    kind: "mcpApprovalEvidenceRecord",
    schemaVersion: MCP_APPROVAL_EVIDENCE_RECORD_SCHEMA_VERSION,
    title: mcpApprovalEvidenceRecordSchema.title ?? "Persisted MCP approval evidence record",
    schema: mcpApprovalEvidenceRecordSchema,
  },
  mcpApprovalEvidenceRecordList: {
    kind: "mcpApprovalEvidenceRecordList",
    schemaVersion: MCP_APPROVAL_EVIDENCE_RECORD_LIST_SCHEMA_VERSION,
    title: mcpApprovalEvidenceRecordListSchema.title ?? "Persisted MCP approval evidence record list",
    schema: mcpApprovalEvidenceRecordListSchema,
  },
  mcpApprovalEvidenceRecordComparison: {
    kind: "mcpApprovalEvidenceRecordComparison",
    schemaVersion: MCP_APPROVAL_EVIDENCE_RECORD_COMPARISON_SCHEMA_VERSION,
    title:
      mcpApprovalEvidenceRecordComparisonSchema.title ??
      "Persisted MCP approval evidence record comparison",
    schema: mcpApprovalEvidenceRecordComparisonSchema,
  },
  mcpApprovalEvidenceRecordCreateRequest: {
    kind: "mcpApprovalEvidenceRecordCreateRequest",
    schemaVersion: MCP_APPROVAL_EVIDENCE_RECORD_CREATE_REQUEST_SCHEMA_VERSION,
    title:
      mcpApprovalEvidenceRecordCreateRequestSchema.title ??
      "MCP approval evidence record create request",
    schema: mcpApprovalEvidenceRecordCreateRequestSchema,
  },
} satisfies Record<McpApprovalEvidenceRecordKind, McpApprovalEvidenceRecordSchemaDefinition>);

export const mcpApprovalEvidenceRecordSchemas = {
  mcpApprovalEvidenceRecord: mcpApprovalEvidenceRecordSchema,
  mcpApprovalEvidenceRecordList: mcpApprovalEvidenceRecordListSchema,
  mcpApprovalEvidenceRecordComparison: mcpApprovalEvidenceRecordComparisonSchema,
  mcpApprovalEvidenceRecordCreateRequest: mcpApprovalEvidenceRecordCreateRequestSchema,
} as const satisfies Record<McpApprovalEvidenceRecordKind, McpApprovalEvidenceRecordJsonSchema>;

export const mcpApprovalEvidenceRecordValidators = {
  mcpApprovalEvidenceRecord: validateMcpApprovalEvidenceRecord,
  mcpApprovalEvidenceRecordList: validateMcpApprovalEvidenceRecordList,
  mcpApprovalEvidenceRecordComparison: validateMcpApprovalEvidenceRecordComparison,
  mcpApprovalEvidenceRecordCreateRequest: validateMcpApprovalEvidenceRecordCreateRequest,
} as const;

export function getMcpApprovalEvidenceRecordSchema(
  kind: McpApprovalEvidenceRecordKind,
): McpApprovalEvidenceRecordJsonSchema {
  return mcpApprovalEvidenceRecordSchemas[kind];
}

export function validateMcpApprovalEvidenceRecordObject<K extends McpApprovalEvidenceRecordKind>(
  kind: K,
  value: unknown,
): ValidationResult<McpApprovalEvidenceRecordObjectByKind[K]> {
  const validator = mcpApprovalEvidenceRecordValidators[kind] as (candidate: unknown) => ValidationResult<unknown>;
  return validator(value) as ValidationResult<McpApprovalEvidenceRecordObjectByKind[K]>;
}

export function assertMcpApprovalEvidenceRecordObject<K extends McpApprovalEvidenceRecordKind>(
  kind: K,
  value: unknown,
): asserts value is McpApprovalEvidenceRecordObjectByKind[K] {
  const result = validateMcpApprovalEvidenceRecordObject(kind, value);
  if (!result.ok) {
    throw new Error(formatValidationIssues(kind, result.issues));
  }
}

export function validateMcpApprovalEvidenceRecord(
  value: unknown,
): ValidationResult<McpApprovalEvidenceStoredRecord> {
  const issues: ValidationIssue[] = [];
  validateMcpApprovalEvidenceRecordValue(value, "$", issues);
  return validationResult(value, issues);
}

export function validateMcpApprovalEvidenceRecordList(
  value: unknown,
): ValidationResult<McpApprovalEvidenceRecordList> {
  const issues: ValidationIssue[] = [];
  validateMcpApprovalEvidenceRecordListValue(value, "$", issues);
  return validationResult(value, issues);
}

export function validateMcpApprovalEvidenceRecordComparison(
  value: unknown,
): ValidationResult<McpApprovalEvidenceRecordComparison> {
  const issues: ValidationIssue[] = [];
  validateMcpApprovalEvidenceRecordComparisonValue(value, "$", issues);
  return validationResult(value, issues);
}

export function validateMcpApprovalEvidenceRecordCreateRequest(
  value: unknown,
): ValidationResult<McpApprovalEvidenceRecordCreateRequest> {
  const issues: ValidationIssue[] = [];
  validateMcpApprovalEvidenceRecordCreateRequestValue(value, "$", issues);
  return validationResult(value, issues);
}

export function assertMcpApprovalEvidenceRecord(value: unknown): asserts value is McpApprovalEvidenceStoredRecord {
  const result = validateMcpApprovalEvidenceRecord(value);
  if (!result.ok) {
    throw new Error(formatValidationIssues("mcpApprovalEvidenceRecord", result.issues));
  }
}

export function assertMcpApprovalEvidenceRecordList(value: unknown): asserts value is McpApprovalEvidenceRecordList {
  const result = validateMcpApprovalEvidenceRecordList(value);
  if (!result.ok) {
    throw new Error(formatValidationIssues("mcpApprovalEvidenceRecordList", result.issues));
  }
}

export function assertMcpApprovalEvidenceRecordComparison(
  value: unknown,
): asserts value is McpApprovalEvidenceRecordComparison {
  const result = validateMcpApprovalEvidenceRecordComparison(value);
  if (!result.ok) {
    throw new Error(formatValidationIssues("mcpApprovalEvidenceRecordComparison", result.issues));
  }
}

export function assertMcpApprovalEvidenceRecordCreateRequest(
  value: unknown,
): asserts value is McpApprovalEvidenceRecordCreateRequest {
  const result = validateMcpApprovalEvidenceRecordCreateRequest(value);
  if (!result.ok) {
    throw new Error(formatValidationIssues("mcpApprovalEvidenceRecordCreateRequest", result.issues));
  }
}

export function isMcpApprovalEvidenceRecordId(value: unknown): value is `mcpaer_${string}` {
  return typeof value === "string" && new RegExp(RECORD_ID_PATTERN).test(value);
}

export function isMcpApprovalEvidenceRecordFingerprint(value: unknown): value is string {
  return typeof value === "string" && new RegExp(HEX_SHA256_PATTERN).test(value);
}

export function getMcpApprovalEvidenceRecordIdForFingerprint(
  fingerprint: string,
): `mcpaer_${string}` | undefined {
  if (!isMcpApprovalEvidenceRecordFingerprint(fingerprint)) {
    return undefined;
  }
  return `mcpaer_${fingerprint.slice(0, 24)}`;
}

export function getMcpApprovalEvidenceRecordCompatibilityKey(
  record: McpApprovalEvidenceStoredRecord,
): string {
  return canonicalJson({
    schemaVersion: record.schemaVersion,
    id: record.id,
    fingerprint: record.fingerprint,
    workspaceId: record.workspaceId,
    sourcePreviewFingerprint: record.sourcePreviewFingerprint,
    localOnly: record.localOnly,
    redacted: record.redacted,
    policyDecision: record.policyDecision,
    approvalStatus: record.approvalStatus,
    evidenceRefs: record.evidenceRefs,
    redactionSummary: record.redactionSummary,
    metadata: record.metadata ?? null,
  });
}

export function areMcpApprovalEvidenceRecordsCompatible(
  base: McpApprovalEvidenceStoredRecord,
  candidate: McpApprovalEvidenceStoredRecord,
): boolean {
  return getMcpApprovalEvidenceRecordCompatibilityKey(base) ===
    getMcpApprovalEvidenceRecordCompatibilityKey(candidate);
}

function validateMcpApprovalEvidenceRecordValue(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): McpApprovalEvidenceStoredRecord | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, recordKeys, issues);
  requireExactString(record, "schemaVersion", MCP_APPROVAL_EVIDENCE_RECORD_SCHEMA_VERSION, issues, path);
  requirePattern(record, "id", RECORD_ID_PATTERN, "id must use the mcpaer_ prefix plus 24 lowercase hex characters", issues, path);
  requireFingerprint(record, "fingerprint", issues, path);
  requireStableRecordId(record, path, issues);
  requireTimestamp(record, "createdAt", issues, path);
  requirePattern(record, "workspaceId", WORKSPACE_ID_PATTERN, "workspaceId must use the wsp_ id prefix", issues, path);
  requireFingerprint(record, "sourcePreviewFingerprint", issues, path);
  requireTrue(record, "localOnly", issues, path);
  requireTrue(record, "redacted", issues, path);
  requireEnum(record, "policyDecision", mcpApprovalPolicyDecisions, issues, path);
  requireEnum(record, "approvalStatus", mcpApprovalStatuses, issues, path);

  const evidenceRefs = validateArray(record, "evidenceRefs", issues, validateEvidenceReference, true, path);
  const redactionSummary = requireRecord(record, "redactionSummary", issues, path);
  if (redactionSummary) {
    validateRedactionSummary(redactionSummary, keyPath(path, "redactionSummary"), issues);
  }
  if (record.metadata !== undefined) {
    validateMetadata(record.metadata, keyPath(path, "metadata"), issues);
  }

  validateEvidenceReferenceCrossReferences(record, evidenceRefs, path, issues);

  return record as unknown as McpApprovalEvidenceStoredRecord;
}

function validateMcpApprovalEvidenceRecordListValue(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): McpApprovalEvidenceRecordList | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, listKeys, issues);
  requireExactString(record, "schemaVersion", MCP_APPROVAL_EVIDENCE_RECORD_LIST_SCHEMA_VERSION, issues, path);
  requireTimestamp(record, "generatedAt", issues, path);
  requirePattern(record, "workspaceId", WORKSPACE_ID_PATTERN, "workspaceId must use the wsp_ id prefix", issues, path);
  requireTrue(record, "localOnly", issues, path);
  requireTrue(record, "redacted", issues, path);

  const records = validateArray(record, "records", issues, validateMcpApprovalEvidenceRecordValue, false, path);
  validateRecordListCrossReferences(record, records, path, issues);

  return record as unknown as McpApprovalEvidenceRecordList;
}

function validateMcpApprovalEvidenceRecordComparisonValue(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): McpApprovalEvidenceRecordComparison | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, comparisonKeys, issues);
  requireExactString(record, "schemaVersion", MCP_APPROVAL_EVIDENCE_RECORD_COMPARISON_SCHEMA_VERSION, issues, path);
  requireTimestamp(record, "createdAt", issues, path);
  requirePattern(record, "workspaceId", WORKSPACE_ID_PATTERN, "workspaceId must use the wsp_ id prefix", issues, path);
  requireTrue(record, "localOnly", issues, path);
  requireTrue(record, "redacted", issues, path);
  requirePattern(record, "baseRecordId", RECORD_ID_PATTERN, "baseRecordId must use the mcpaer_ stable id format", issues, path);
  requirePattern(
    record,
    "candidateRecordId",
    RECORD_ID_PATTERN,
    "candidateRecordId must use the mcpaer_ stable id format",
    issues,
    path,
  );
  requireFingerprint(record, "baseFingerprint", issues, path);
  requireFingerprint(record, "candidateFingerprint", issues, path);
  requireFingerprint(record, "sourcePreviewFingerprint", issues, path);
  requireBoolean(record, "compatible", issues, path);

  const differences = validateArray(record, "differences", issues, validateComparisonDifference, false, path);
  validateComparisonConsistency(record, differences, path, issues);

  return record as unknown as McpApprovalEvidenceRecordComparison;
}

function validateMcpApprovalEvidenceRecordCreateRequestValue(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): McpApprovalEvidenceRecordCreateRequest | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, createRequestKeys, issues);
  requireExactString(record, "schemaVersion", MCP_APPROVAL_EVIDENCE_RECORD_CREATE_REQUEST_SCHEMA_VERSION, issues, path);
  requireTimestamp(record, "requestedAt", issues, path);
  requirePattern(record, "workspaceId", WORKSPACE_ID_PATTERN, "workspaceId must use the wsp_ id prefix", issues, path);
  requireFingerprint(record, "sourcePreviewFingerprint", issues, path);
  requireTrue(record, "localOnly", issues, path);
  requireTrue(record, "redacted", issues, path);
  requireEnum(record, "policyDecision", mcpApprovalPolicyDecisions, issues, path);
  requireEnum(record, "approvalStatus", mcpApprovalStatuses, issues, path);

  const evidenceRefs = validateArray(record, "evidenceRefs", issues, validateEvidenceReference, true, path);
  const redactionSummary = requireRecord(record, "redactionSummary", issues, path);
  if (redactionSummary) {
    validateRedactionSummary(redactionSummary, keyPath(path, "redactionSummary"), issues);
  }
  if (record.metadata !== undefined) {
    validateMetadata(record.metadata, keyPath(path, "metadata"), issues);
  }

  validateEvidenceReferenceCrossReferences(record, evidenceRefs, path, issues);

  return record as unknown as McpApprovalEvidenceRecordCreateRequest;
}

function validateEvidenceReference(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): McpApprovalEvidenceReference | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, evidenceReferenceKeys, issues);
  requirePattern(record, "evidenceId", EVIDENCE_ID_PATTERN, "evidenceId must use the mcpae_ id prefix", issues, path);
  requireExactString(record, "evidenceSchemaVersion", MCP_APPROVAL_EVIDENCE_SCHEMA_VERSION, issues, path);
  requireEnum(record, "role", mcpApprovalEvidenceReferenceRoles, issues, path);
  requireFingerprint(record, "fingerprint", issues, path);
  requireTimestamp(record, "capturedAt", issues, path);
  requireTrue(record, "redacted", issues, path);

  return record as unknown as McpApprovalEvidenceReference;
}

function validateRedactionSummary(
  record: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
): void {
  requireOnlyKeys(record, path, redactionSummaryKeys, issues);
  requireTrue(record, "redacted", issues, path);
  requirePositiveInteger(record, "redactedFieldCount", issues, path);
  requirePathRefArray(record, "redactedPaths", issues, path, true);
  requireSafeMetadataKeyArray(record, "retainedMetadataKeys", issues, path);

  const redactedFieldCount = record.redactedFieldCount;
  const redactedPaths = record.redactedPaths;
  if (typeof redactedFieldCount === "number" && Array.isArray(redactedPaths) && redactedFieldCount !== redactedPaths.length) {
    issues.push({
      path: keyPath(path, "redactedFieldCount"),
      message: "redactedFieldCount must match redactedPaths length",
    });
  }
  if (Array.isArray(redactedPaths)) {
    requireSortedUniqueStrings(redactedPaths, keyPath(path, "redactedPaths"), "redactedPaths must be sorted with no duplicates", issues);
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

function validateMetadata(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): McpApprovalEvidenceRecordMetadata | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  for (const [key, entryValue] of Object.entries(record)) {
    const entryPath = `${path}.${key}`;
    if (!isSafeMetadataKey(key)) {
      issues.push({
        path: entryPath,
        message: "metadata keys must be non-sensitive summary labels",
      });
    }
    if (
      entryValue !== null &&
      typeof entryValue !== "string" &&
      typeof entryValue !== "number" &&
      typeof entryValue !== "boolean"
    ) {
      issues.push({
        path: entryPath,
        message: "metadata values must be primitive sanitized values",
      });
    }
  }

  return record as McpApprovalEvidenceRecordMetadata;
}

function validateComparisonDifference(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): McpApprovalEvidenceRecordComparisonDifference | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, comparisonDifferenceKeys, issues);
  requirePathRef(record, "path", issues, path);
  requireEnum(record, "change", mcpApprovalEvidenceRecordComparisonChanges, issues, path);
  optionalFingerprint(record, "baseFingerprint", issues, path);
  optionalFingerprint(record, "candidateFingerprint", issues, path);

  return record as unknown as McpApprovalEvidenceRecordComparisonDifference;
}

function validateEvidenceReferenceCrossReferences(
  record: Record<string, unknown>,
  evidenceRefs: McpApprovalEvidenceReference[] | undefined,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!evidenceRefs) {
    return;
  }

  const refsPath = keyPath(path, "evidenceRefs");
  requireSortedUniqueRefs(
    evidenceRefs,
    "evidenceId",
    refsPath,
    "evidenceRefs must be sorted by evidenceId with no duplicates",
    issues,
  );

  const sourceRefs = evidenceRefs
    .map((ref, index) => ({ ref, index }))
    .filter(({ ref }) => ref.role === "source");
  if (sourceRefs.length !== 1) {
    issues.push({ path: refsPath, message: "evidenceRefs must contain exactly one source ref" });
    return;
  }

  const sourcePreviewFingerprint = record.sourcePreviewFingerprint;
  const [{ ref, index }] = sourceRefs;
  if (
    typeof sourcePreviewFingerprint === "string" &&
    isMcpApprovalEvidenceRecordFingerprint(sourcePreviewFingerprint) &&
    ref.fingerprint !== sourcePreviewFingerprint
  ) {
    issues.push({
      path: `${refsPath}[${index}].fingerprint`,
      message: "source evidence fingerprint must match sourcePreviewFingerprint",
    });
  }
}

function validateRecordListCrossReferences(
  record: Record<string, unknown>,
  records: McpApprovalEvidenceStoredRecord[] | undefined,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!records) {
    return;
  }

  const recordsPath = keyPath(path, "records");
  requireSortedUniqueRefs(
    records,
    "id",
    recordsPath,
    "records must be sorted by id with no duplicates",
    issues,
  );

  for (const [index, item] of records.entries()) {
    if (typeof record.workspaceId === "string" && item.workspaceId !== record.workspaceId) {
      issues.push({
        path: `${recordsPath}[${index}].workspaceId`,
        message: "record workspaceId must match list workspaceId",
      });
    }
  }
}

function validateComparisonConsistency(
  record: Record<string, unknown>,
  differences: McpApprovalEvidenceRecordComparisonDifference[] | undefined,
  path: string,
  issues: ValidationIssue[],
): void {
  const differencesPath = keyPath(path, "differences");
  if (typeof record.compatible !== "boolean" || !differences) {
    return;
  }

  if (record.compatible) {
    if (record.baseFingerprint !== record.candidateFingerprint) {
      issues.push({
        path: keyPath(path, "candidateFingerprint"),
        message: "candidateFingerprint must match baseFingerprint when compatible is true",
      });
    }
    if (differences.length > 0) {
      issues.push({ path: differencesPath, message: "differences must be empty when compatible is true" });
    }
    return;
  }

  if (record.baseFingerprint === record.candidateFingerprint) {
    issues.push({
      path: keyPath(path, "candidateFingerprint"),
      message: "candidateFingerprint must differ from baseFingerprint when compatible is false",
    });
  }
  if (differences.length === 0) {
    issues.push({ path: differencesPath, message: "differences must describe incompatible records" });
  }
}

function objectSchema(
  title: string,
  properties: Record<string, McpApprovalEvidenceRecordJsonSchema>,
  required: readonly string[],
  slug?: string,
): McpApprovalEvidenceRecordJsonSchema {
  return {
    $schema: JSON_SCHEMA_DRAFT,
    $id: slug ? `https://schemas.sovereignops.local/mcp/${slug}.schema.json` : undefined,
    title,
    type: "object",
    additionalProperties: false,
    required,
    properties,
  };
}

function arraySchema(
  items: McpApprovalEvidenceRecordJsonSchema,
  minItems?: number,
): McpApprovalEvidenceRecordJsonSchema {
  return {
    type: "array",
    minItems,
    items,
  };
}

function recordIdSchema(): McpApprovalEvidenceRecordJsonSchema {
  return {
    type: "string",
    pattern: RECORD_ID_PATTERN,
  };
}

function evidenceIdSchema(): McpApprovalEvidenceRecordJsonSchema {
  return {
    type: "string",
    pattern: EVIDENCE_ID_PATTERN,
  };
}

function workspaceIdSchema(): McpApprovalEvidenceRecordJsonSchema {
  return {
    type: "string",
    pattern: WORKSPACE_ID_PATTERN,
  };
}

function fingerprintSchema(): McpApprovalEvidenceRecordJsonSchema {
  return {
    type: "string",
    pattern: HEX_SHA256_PATTERN,
  };
}

function timestampSchema(): McpApprovalEvidenceRecordJsonSchema {
  return {
    type: "string",
    pattern: ISO_TIMESTAMP_PATTERN,
  };
}

function pathRefSchema(): McpApprovalEvidenceRecordJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: PATH_REF_PATTERN,
  };
}

function pathRefArraySchema(minItems?: number): McpApprovalEvidenceRecordJsonSchema {
  return {
    type: "array",
    minItems,
    items: pathRefSchema(),
  };
}

function nonEmptyPathRefArraySchema(): McpApprovalEvidenceRecordJsonSchema {
  return pathRefArraySchema(1);
}

function safeMetadataKeySchema(): McpApprovalEvidenceRecordJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: SAFE_METADATA_KEY_PATTERN,
  };
}

function safeMetadataKeyArraySchema(): McpApprovalEvidenceRecordJsonSchema {
  return {
    type: "array",
    items: safeMetadataKeySchema(),
  };
}

function metadataSchema(): McpApprovalEvidenceRecordJsonSchema {
  return {
    type: "object",
    propertyNames: safeMetadataKeySchema(),
    additionalProperties: {
      type: ["string", "number", "boolean", "null"],
    },
  };
}

function enumSchema(values: readonly (string | number | boolean | null)[]): McpApprovalEvidenceRecordJsonSchema {
  return {
    type: typeof values[0] === "string" ? "string" : undefined,
    enum: values,
  };
}

function positiveIntegerSchema(): McpApprovalEvidenceRecordJsonSchema {
  return {
    type: "integer",
    minimum: 1,
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
  nonEmpty = false,
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

function requireStableRecordId(
  record: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
): void {
  const id = record.id;
  const fingerprint = record.fingerprint;
  if (typeof id !== "string" || typeof fingerprint !== "string") {
    return;
  }
  const expectedId = getMcpApprovalEvidenceRecordIdForFingerprint(fingerprint);
  if (expectedId && id !== expectedId) {
    issues.push({
      path: keyPath(path, "id"),
      message: "id must be derived from the first 24 hex characters of fingerprint",
    });
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

function requireFingerprint(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (!isMcpApprovalEvidenceRecordFingerprint(value)) {
    issues.push({ path: keyPath(parentPath, key), message: `${key} must be a lowercase sha256 digest` });
  }
}

function optionalFingerprint(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  if (record[key] !== undefined) {
    requireFingerprint(record, key, issues, parentPath);
  }
}

function requirePathRef(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (typeof value !== "string" || !new RegExp(PATH_REF_PATTERN).test(value)) {
    issues.push({ path: keyPath(parentPath, key), message: `${key} must be a safe path reference` });
  }
}

function requirePathRefArray(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
  nonEmpty: boolean,
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

function requireSortedUniqueRefs<TRecord extends Record<string, unknown>>(
  records: readonly TRecord[],
  key: keyof TRecord & string,
  path: string,
  message: string,
  issues: ValidationIssue[],
): void {
  let previous: string | undefined;
  for (const [index, record] of records.entries()) {
    const current = record[key];
    if (typeof current !== "string") {
      continue;
    }
    if (previous !== undefined && previous >= current) {
      issues.push({ path: `${path}[${index}].${key}`, message });
    }
    previous = current;
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

function formatValidationIssues(
  kind: McpApprovalEvidenceRecordKind,
  issues: readonly ValidationIssue[],
): string {
  const details = issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
  return `${kind} validation failed: ${details}`;
}

const recordKeys = [
  "schemaVersion",
  "id",
  "fingerprint",
  "createdAt",
  "workspaceId",
  "sourcePreviewFingerprint",
  "localOnly",
  "redacted",
  "policyDecision",
  "approvalStatus",
  "evidenceRefs",
  "redactionSummary",
  "metadata",
] as const;

const listKeys = ["schemaVersion", "generatedAt", "workspaceId", "localOnly", "redacted", "records"] as const;

const comparisonKeys = [
  "schemaVersion",
  "createdAt",
  "workspaceId",
  "localOnly",
  "redacted",
  "baseRecordId",
  "candidateRecordId",
  "baseFingerprint",
  "candidateFingerprint",
  "sourcePreviewFingerprint",
  "compatible",
  "differences",
] as const;

const createRequestKeys = [
  "schemaVersion",
  "requestedAt",
  "workspaceId",
  "sourcePreviewFingerprint",
  "localOnly",
  "redacted",
  "policyDecision",
  "approvalStatus",
  "evidenceRefs",
  "redactionSummary",
  "metadata",
] as const;

const evidenceReferenceKeys = [
  "evidenceId",
  "evidenceSchemaVersion",
  "role",
  "fingerprint",
  "capturedAt",
  "redacted",
] as const;

const redactionSummaryKeys = [
  "redacted",
  "redactedFieldCount",
  "redactedPaths",
  "retainedMetadataKeys",
] as const;

const comparisonDifferenceKeys = ["path", "change", "baseFingerprint", "candidateFingerprint"] as const;
