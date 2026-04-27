export const MCP_APPROVAL_EVIDENCE_SCHEMA_VERSION = "mcp-approval-evidence/v1";
export const JSON_SCHEMA_DRAFT = "https://json-schema.org/draft/2020-12/schema";

export const mcpApprovalEvidenceKinds = ["mcpApprovalEvidence"] as const;
export type McpApprovalEvidenceKind = (typeof mcpApprovalEvidenceKinds)[number];

export const mcpApprovalPolicyDecisions = ["allow", "require_approval", "deny"] as const;
export type McpApprovalPolicyDecision = (typeof mcpApprovalPolicyDecisions)[number];

export const mcpApprovalStatuses = ["pending", "approved", "rejected", "expired"] as const;
export type McpApprovalStatus = (typeof mcpApprovalStatuses)[number];

export const mcpApprovalSessionRefRoles = ["subject", "related"] as const;
export type McpApprovalSessionRefRole = (typeof mcpApprovalSessionRefRoles)[number];

export const mcpApprovalAuditEventTypes = [
  "policy_decision",
  "operation_succeeded",
  "operation_failed",
] as const;
export type McpApprovalAuditEventType = (typeof mcpApprovalAuditEventTypes)[number];

export type JsonSchemaType = "array" | "boolean" | "integer" | "null" | "number" | "object" | "string";

export interface McpApprovalEvidenceJsonSchema {
  readonly $schema?: string;
  readonly $id?: string;
  readonly title?: string;
  readonly type?: JsonSchemaType | readonly JsonSchemaType[];
  readonly additionalProperties?: boolean | McpApprovalEvidenceJsonSchema;
  readonly properties?: Record<string, McpApprovalEvidenceJsonSchema>;
  readonly propertyNames?: McpApprovalEvidenceJsonSchema;
  readonly required?: readonly string[];
  readonly enum?: readonly (string | number | boolean | null)[];
  readonly const?: string | number | boolean | null;
  readonly pattern?: string;
  readonly minLength?: number;
  readonly minimum?: number;
  readonly minItems?: number;
  readonly items?: McpApprovalEvidenceJsonSchema;
}

export interface McpApprovalEvidenceSchemaDefinition {
  kind: "mcpApprovalEvidence";
  schemaVersion: typeof MCP_APPROVAL_EVIDENCE_SCHEMA_VERSION;
  title: string;
  schema: McpApprovalEvidenceJsonSchema;
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

export type McpApprovalMetadataValue = string | number | boolean | null;
export type McpApprovalEvidenceMetadata = Record<string, McpApprovalMetadataValue>;

export interface McpApprovalSessionRef {
  sessionId: `approval_${string}`;
  role: McpApprovalSessionRefRole;
  status: McpApprovalStatus;
}

export interface McpApprovalAuditEventRef {
  eventId: `audit_${string}`;
  type: McpApprovalAuditEventType;
  occurredAt: string;
}

export interface McpApprovalRedactionSummary {
  redacted: boolean;
  redactedFieldCount: number;
  redactedPaths: readonly string[];
  retainedMetadataKeys: readonly string[];
}

export interface McpApprovalEvidenceRecord {
  schemaVersion: typeof MCP_APPROVAL_EVIDENCE_SCHEMA_VERSION;
  id: `mcpae_${string}`;
  generatedAt: string;
  workspaceId: `wsp_${string}`;
  localOnly: true;
  policyDecision: McpApprovalPolicyDecision;
  approvalStatus: McpApprovalStatus;
  sessionRefs: readonly McpApprovalSessionRef[];
  auditEventRefs: readonly McpApprovalAuditEventRef[];
  redactionSummary: McpApprovalRedactionSummary;
  metadata?: McpApprovalEvidenceMetadata;
}

const ID_BODY_PATTERN = "[A-Za-z0-9_-]{1,88}";
const EVIDENCE_ID_PATTERN = `^mcpae_${ID_BODY_PATTERN}$`;
const WORKSPACE_ID_PATTERN = `^wsp_${ID_BODY_PATTERN}$`;
const SESSION_ID_PATTERN = `^approval_${ID_BODY_PATTERN}$`;
const AUDIT_EVENT_ID_PATTERN = `^audit_${ID_BODY_PATTERN}$`;
const ISO_TIMESTAMP_PATTERN = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$";
const PATH_REF_PATTERN = "^[A-Za-z][A-Za-z0-9_.\\[\\]-]{0,191}$";
const METADATA_KEY_PATTERN = "^[A-Za-z][A-Za-z0-9_.-]{0,63}$";
const SECRET_LIKE_METADATA_KEY_PATTERN_SOURCE =
  "(?:[aA][pP][iI][_-]?[kK][eE][yY]|[aA][uU][tT][hH][oO][rR][iI][zZ][aA][tT][iI][oO][nN]|[bB][eE][aA][rR][eE][rR]|[cC][rR][eE][dD][eE][nN][tT][iI][aA][lL]|[pP][aA][sS][sS][wW][oO][rR][dD]|[sS][eE][cC][rR][eE][tT]|[tT][oO][kK][eE][nN])";
const SAFE_METADATA_KEY_PATTERN =
  `^(?!.*${SECRET_LIKE_METADATA_KEY_PATTERN_SOURCE})[A-Za-z][A-Za-z0-9_.-]{0,63}$`;
const SECRET_LIKE_METADATA_KEY_PATTERN = new RegExp(SECRET_LIKE_METADATA_KEY_PATTERN_SOURCE);

const sessionRefSchema = objectSchema(
  "MCP approval session reference",
  {
    sessionId: sessionIdSchema(),
    role: enumSchema(mcpApprovalSessionRefRoles),
    status: enumSchema(mcpApprovalStatuses),
  },
  ["sessionId", "role", "status"],
);

const auditEventRefSchema = objectSchema(
  "MCP approval audit event reference",
  {
    eventId: auditEventIdSchema(),
    type: enumSchema(mcpApprovalAuditEventTypes),
    occurredAt: timestampSchema(),
  },
  ["eventId", "type", "occurredAt"],
);

const redactionSummarySchema = objectSchema(
  "MCP approval redaction summary",
  {
    redacted: { type: "boolean" },
    redactedFieldCount: nonNegativeIntegerSchema(),
    redactedPaths: pathRefArraySchema(),
    retainedMetadataKeys: safeMetadataKeyArraySchema(),
  },
  ["redacted", "redactedFieldCount", "redactedPaths", "retainedMetadataKeys"],
);

export const mcpApprovalEvidenceSchema = deepFreeze(
  objectSchema(
    "MCP approval evidence",
    {
      schemaVersion: {
        type: "string",
        const: MCP_APPROVAL_EVIDENCE_SCHEMA_VERSION,
      },
      id: evidenceIdSchema(),
      generatedAt: timestampSchema(),
      workspaceId: workspaceIdSchema(),
      localOnly: {
        type: "boolean",
        const: true,
      },
      policyDecision: enumSchema(mcpApprovalPolicyDecisions),
      approvalStatus: enumSchema(mcpApprovalStatuses),
      sessionRefs: arraySchema(sessionRefSchema, 1),
      auditEventRefs: arraySchema(auditEventRefSchema, 1),
      redactionSummary: redactionSummarySchema,
      metadata: metadataSchema(),
    },
    [
      "schemaVersion",
      "id",
      "generatedAt",
      "workspaceId",
      "localOnly",
      "policyDecision",
      "approvalStatus",
      "sessionRefs",
      "auditEventRefs",
      "redactionSummary",
    ],
    "approval-evidence",
  ),
);

export const mcpApprovalEvidenceSchemaDefinition = deepFreeze({
  kind: "mcpApprovalEvidence",
  schemaVersion: MCP_APPROVAL_EVIDENCE_SCHEMA_VERSION,
  title: mcpApprovalEvidenceSchema.title ?? "MCP approval evidence",
  schema: mcpApprovalEvidenceSchema,
} satisfies McpApprovalEvidenceSchemaDefinition);

export const mcpApprovalEvidenceSchemas = {
  mcpApprovalEvidence: mcpApprovalEvidenceSchema,
} as const satisfies Record<McpApprovalEvidenceKind, McpApprovalEvidenceJsonSchema>;

export const mcpApprovalEvidenceValidators = {
  mcpApprovalEvidence: validateMcpApprovalEvidence,
} as const;

export function getMcpApprovalEvidenceSchema(kind: McpApprovalEvidenceKind): McpApprovalEvidenceJsonSchema {
  return mcpApprovalEvidenceSchemas[kind];
}

export function validateMcpApprovalEvidence(
  value: unknown,
): ValidationResult<McpApprovalEvidenceRecord> {
  const issues = recordIssues(value, "$");
  if (issues.length > 0) {
    return invalid(issues);
  }

  const record = value as Record<string, unknown>;
  requireOnlyKeys(record, "$", topLevelKeys, issues);
  requireExactString(record, "schemaVersion", MCP_APPROVAL_EVIDENCE_SCHEMA_VERSION, issues);
  requirePattern(record, "id", EVIDENCE_ID_PATTERN, "id must use the mcpae_ id prefix", issues);
  requireTimestamp(record, "generatedAt", issues);
  requirePattern(record, "workspaceId", WORKSPACE_ID_PATTERN, "workspaceId must use the wsp_ id prefix", issues);
  requireTrue(record, "localOnly", issues);
  requireEnum(record, "policyDecision", mcpApprovalPolicyDecisions, issues, "$");
  requireEnum(record, "approvalStatus", mcpApprovalStatuses, issues, "$");

  const sessionRefs = validateArray(record, "sessionRefs", issues, validateMcpApprovalSessionRefValue, true);
  const auditEventRefs = validateArray(record, "auditEventRefs", issues, validateMcpApprovalAuditEventRefValue, true);
  const redactionSummary = requireRecord(record, "redactionSummary", issues);
  if (redactionSummary) {
    validateMcpApprovalRedactionSummaryRecord(redactionSummary, "redactionSummary", issues);
  }

  if (record.metadata !== undefined) {
    validateMcpApprovalEvidenceMetadata(record.metadata, "metadata", issues);
  }

  validateCrossReferences(record, sessionRefs, auditEventRefs, issues);

  return validationResult(value, issues);
}

export function validateMcpApprovalSessionRef(
  value: unknown,
): ValidationResult<McpApprovalSessionRef> {
  const issues: ValidationIssue[] = [];
  const ref = validateMcpApprovalSessionRefValue(value, "$", issues);
  return issues.length === 0 && ref
    ? { ok: true, issues, value: deepFreeze(cloneJson(ref)) }
    : { ok: false, issues };
}

export function validateMcpApprovalAuditEventRef(
  value: unknown,
): ValidationResult<McpApprovalAuditEventRef> {
  const issues: ValidationIssue[] = [];
  const ref = validateMcpApprovalAuditEventRefValue(value, "$", issues);
  return issues.length === 0 && ref
    ? { ok: true, issues, value: deepFreeze(cloneJson(ref)) }
    : { ok: false, issues };
}

export function validateMcpApprovalRedactionSummary(
  value: unknown,
): ValidationResult<McpApprovalRedactionSummary> {
  const issues: ValidationIssue[] = [];
  const record = requireRecordAtPath(value, "$", issues);
  if (record) {
    validateMcpApprovalRedactionSummaryRecord(record, "$", issues);
  }
  return issues.length === 0 && record
    ? { ok: true, issues, value: deepFreeze(cloneJson(record)) as McpApprovalRedactionSummary }
    : { ok: false, issues };
}

export function assertMcpApprovalEvidence(value: unknown): asserts value is McpApprovalEvidenceRecord {
  const result = validateMcpApprovalEvidence(value);
  if (!result.ok) {
    throw new Error(formatValidationIssues(result.issues));
  }
}

export function isMcpApprovalEvidenceId(value: unknown): value is `mcpae_${string}` {
  return typeof value === "string" && new RegExp(EVIDENCE_ID_PATTERN).test(value);
}

export function isMcpApprovalSessionId(value: unknown): value is `approval_${string}` {
  return typeof value === "string" && new RegExp(SESSION_ID_PATTERN).test(value);
}

export function isMcpApprovalAuditEventId(value: unknown): value is `audit_${string}` {
  return typeof value === "string" && new RegExp(AUDIT_EVENT_ID_PATTERN).test(value);
}

export function isMcpApprovalPolicyDecision(value: unknown): value is McpApprovalPolicyDecision {
  return isOneOf(value, mcpApprovalPolicyDecisions);
}

export function isMcpApprovalStatus(value: unknown): value is McpApprovalStatus {
  return isOneOf(value, mcpApprovalStatuses);
}

export function normalizeMcpApprovalPolicyDecision(
  value: unknown,
): McpApprovalPolicyDecision | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "allowed") {
    return "allow";
  }
  if (normalized === "approval_required" || normalized === "requires_approval") {
    return "require_approval";
  }
  if (normalized === "denied") {
    return "deny";
  }
  return isMcpApprovalPolicyDecision(normalized) ? normalized : undefined;
}

export function normalizeMcpApprovalStatus(value: unknown): McpApprovalStatus | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "approve") {
    return "approved";
  }
  if (normalized === "reject") {
    return "rejected";
  }
  if (normalized === "expire") {
    return "expired";
  }
  return isMcpApprovalStatus(normalized) ? normalized : undefined;
}

function validateMcpApprovalSessionRefValue(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): McpApprovalSessionRef | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, sessionRefKeys, issues);
  requirePattern(record, "sessionId", SESSION_ID_PATTERN, "sessionId must use the approval_ id prefix", issues, path);
  requireEnum(record, "role", mcpApprovalSessionRefRoles, issues, path);
  requireEnum(record, "status", mcpApprovalStatuses, issues, path);

  return record as unknown as McpApprovalSessionRef;
}

function validateMcpApprovalAuditEventRefValue(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): McpApprovalAuditEventRef | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, auditEventRefKeys, issues);
  requirePattern(record, "eventId", AUDIT_EVENT_ID_PATTERN, "eventId must use the audit_ id prefix", issues, path);
  requireEnum(record, "type", mcpApprovalAuditEventTypes, issues, path);
  requireTimestamp(record, "occurredAt", issues, path);

  return record as unknown as McpApprovalAuditEventRef;
}

function validateMcpApprovalRedactionSummaryRecord(
  record: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
): void {
  requireOnlyKeys(record, path, redactionSummaryKeys, issues);
  requireBoolean(record, "redacted", issues, path);
  requireNonNegativeInteger(record, "redactedFieldCount", issues, path);
  requirePathRefArray(record, "redactedPaths", issues, path);
  requireSafeMetadataKeyArray(record, "retainedMetadataKeys", issues, path);

  const redactedFieldCount = record.redactedFieldCount;
  const redactedPaths = record.redactedPaths;
  if (typeof redactedFieldCount === "number" && Array.isArray(redactedPaths) && redactedFieldCount !== redactedPaths.length) {
    issues.push({
      path: `${path}.redactedFieldCount`,
      message: "redactedFieldCount must match redactedPaths length",
    });
  }
  if (typeof record.redacted === "boolean" && typeof redactedFieldCount === "number") {
    const expectedRedacted = redactedFieldCount > 0;
    if (record.redacted !== expectedRedacted) {
      issues.push({
        path: `${path}.redacted`,
        message: "redacted must indicate whether any fields were redacted",
      });
    }
  }
}

function validateMcpApprovalEvidenceMetadata(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): McpApprovalEvidenceMetadata | undefined {
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

  return record as McpApprovalEvidenceMetadata;
}

function validateCrossReferences(
  record: Record<string, unknown>,
  sessionRefs: McpApprovalSessionRef[] | undefined,
  auditEventRefs: McpApprovalAuditEventRef[] | undefined,
  issues: ValidationIssue[],
): void {
  if (sessionRefs) {
    requireSortedUniqueRefs(
      sessionRefs,
      "sessionId",
      "sessionRefs",
      "sessionRefs must be sorted by sessionId with no duplicates",
      issues,
    );

    const subjectIndexes = sessionRefs
      .map((ref, index) => ({ ref, index }))
      .filter(({ ref }) => ref.role === "subject");
    if (subjectIndexes.length !== 1) {
      issues.push({ path: "sessionRefs", message: "sessionRefs must contain exactly one subject ref" });
    }

    const approvalStatus = record.approvalStatus;
    if (isMcpApprovalStatus(approvalStatus) && subjectIndexes.length === 1) {
      const [{ ref, index }] = subjectIndexes;
      if (ref.status !== approvalStatus) {
        issues.push({
          path: `sessionRefs[${index}].status`,
          message: "subject session status must match approvalStatus",
        });
      }
    }
  }

  if (auditEventRefs) {
    requireSortedUniqueRefs(
      auditEventRefs,
      "eventId",
      "auditEventRefs",
      "auditEventRefs must be sorted by eventId with no duplicates",
      issues,
    );
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

function objectSchema(
  title: string,
  properties: Record<string, McpApprovalEvidenceJsonSchema>,
  required: readonly string[],
  slug?: string,
): McpApprovalEvidenceJsonSchema {
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
  items: McpApprovalEvidenceJsonSchema,
  minItems?: number,
): McpApprovalEvidenceJsonSchema {
  return {
    type: "array",
    minItems,
    items,
  };
}

function evidenceIdSchema(): McpApprovalEvidenceJsonSchema {
  return {
    type: "string",
    pattern: EVIDENCE_ID_PATTERN,
  };
}

function workspaceIdSchema(): McpApprovalEvidenceJsonSchema {
  return {
    type: "string",
    pattern: WORKSPACE_ID_PATTERN,
  };
}

function sessionIdSchema(): McpApprovalEvidenceJsonSchema {
  return {
    type: "string",
    pattern: SESSION_ID_PATTERN,
  };
}

function auditEventIdSchema(): McpApprovalEvidenceJsonSchema {
  return {
    type: "string",
    pattern: AUDIT_EVENT_ID_PATTERN,
  };
}

function timestampSchema(): McpApprovalEvidenceJsonSchema {
  return {
    type: "string",
    pattern: ISO_TIMESTAMP_PATTERN,
  };
}

function pathRefSchema(): McpApprovalEvidenceJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: PATH_REF_PATTERN,
  };
}

function safeMetadataKeySchema(): McpApprovalEvidenceJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: SAFE_METADATA_KEY_PATTERN,
  };
}

function pathRefArraySchema(): McpApprovalEvidenceJsonSchema {
  return {
    type: "array",
    items: pathRefSchema(),
  };
}

function safeMetadataKeyArraySchema(): McpApprovalEvidenceJsonSchema {
  return {
    type: "array",
    items: safeMetadataKeySchema(),
  };
}

function metadataSchema(): McpApprovalEvidenceJsonSchema {
  return {
    type: "object",
    propertyNames: safeMetadataKeySchema(),
    additionalProperties: {
      type: ["string", "number", "boolean", "null"],
    },
  };
}

function enumSchema(values: readonly (string | number | boolean | null)[]): McpApprovalEvidenceJsonSchema {
  return {
    type: typeof values[0] === "string" ? "string" : undefined,
    enum: values,
  };
}

function nonNegativeIntegerSchema(): McpApprovalEvidenceJsonSchema {
  return {
    type: "integer",
    minimum: 0,
  };
}

function recordIssues(value: unknown, path: string): ValidationIssue[] {
  if (!isRecord(value)) {
    return [{ path, message: "record must be an object" }];
  }
  return [];
}

function invalid<TRecord>(issues: ValidationIssue[]): ValidationResult<TRecord> {
  return { ok: false, issues };
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
      issues.push({ path: path === "$" ? key : `${path}.${key}`, message: `${key} is not allowed` });
    }
  }
}

function requireRecord(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath?: string,
): Record<string, unknown> | undefined {
  const path = parentPath ? `${parentPath}.${key}` : key;
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
): TRecord[] | undefined {
  const value = record[key];
  if (!Array.isArray(value)) {
    issues.push({ path: key, message: `${key} must be an array` });
    return undefined;
  }
  if (nonEmpty && value.length === 0) {
    issues.push({ path: key, message: `${key} must contain at least one item` });
  }

  const validRecords: TRecord[] = [];
  for (const [index, item] of value.entries()) {
    const recordValue = validator(item, `${key}[${index}]`, issues);
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
  parentPath?: string,
): void {
  if (record[key] !== expected) {
    issues.push({
      path: parentPath ? `${parentPath}.${key}` : key,
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
  parentPath?: string,
): void {
  const value = record[key];
  if (typeof value !== "string" || !new RegExp(pattern).test(value)) {
    issues.push({ path: parentPath ? `${parentPath}.${key}` : key, message });
  }
}

function requireTrue(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath?: string,
): void {
  if (record[key] !== true) {
    issues.push({ path: parentPath ? `${parentPath}.${key}` : key, message: `${key} must be true` });
  }
}

function requireTimestamp(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath?: string,
): void {
  const value = record[key];
  const path = parentPath ? `${parentPath}.${key}` : key;
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
    issues.push({ path: `${parentPath}.${key}`, message: `${key} must be a boolean` });
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
    issues.push({ path: `${parentPath}.${key}`, message: `${key} must be a non-negative integer` });
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
    const path = parentPath === "$" ? key : `${parentPath}.${key}`;
    issues.push({ path, message: `${key} must be one of ${allowed.join(", ")}` });
  }
}

function requirePathRefArray(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (!Array.isArray(value)) {
    issues.push({ path: `${parentPath}.${key}`, message: `${key} must be an array` });
    return;
  }
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || !new RegExp(PATH_REF_PATTERN).test(item)) {
      issues.push({ path: `${parentPath}.${key}[${index}]`, message: `${key} values must be safe path references` });
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
  if (!Array.isArray(value)) {
    issues.push({ path: `${parentPath}.${key}`, message: `${key} must be an array` });
    return;
  }
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || !isSafeMetadataKey(item)) {
      issues.push({
        path: `${parentPath}.${key}[${index}]`,
        message: `${key} values must be non-sensitive metadata keys`,
      });
    }
  }
}

function isSafeMetadataKey(value: string): boolean {
  return (
    new RegExp(METADATA_KEY_PATTERN).test(value) &&
    !SECRET_LIKE_METADATA_KEY_PATTERN.test(value)
  );
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

function formatValidationIssues(issues: readonly ValidationIssue[]): string {
  const details = issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
  return `MCP approval evidence validation failed: ${details}`;
}

const topLevelKeys = [
  "schemaVersion",
  "id",
  "generatedAt",
  "workspaceId",
  "localOnly",
  "policyDecision",
  "approvalStatus",
  "sessionRefs",
  "auditEventRefs",
  "redactionSummary",
  "metadata",
] as const;

const sessionRefKeys = ["sessionId", "role", "status"] as const;

const auditEventRefKeys = ["eventId", "type", "occurredAt"] as const;

const redactionSummaryKeys = [
  "redacted",
  "redactedFieldCount",
  "redactedPaths",
  "retainedMetadataKeys",
] as const;
