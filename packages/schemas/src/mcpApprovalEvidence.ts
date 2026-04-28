export const MCP_APPROVAL_EVIDENCE_SCHEMA_VERSION = "mcp-approval-evidence/v1";
export const MCP_APPROVAL_EVIDENCE_PREVIEW_REQUESTS_SCHEMA_VERSION =
  "mcp-approval-evidence-preview-requests.v1";
export const JSON_SCHEMA_DRAFT = "https://json-schema.org/draft/2020-12/schema";

export const mcpApprovalEvidenceKinds = [
  "mcpApprovalEvidence",
  "mcpApprovalEvidencePreviewRequests",
] as const;
export type McpApprovalEvidenceKind = (typeof mcpApprovalEvidenceKinds)[number];

export const mcpApprovalEvidenceApiRouteMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type McpApprovalEvidenceApiRouteMethod =
  (typeof mcpApprovalEvidenceApiRouteMethods)[number];

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
  readonly maximum?: number;
  readonly minItems?: number;
  readonly items?: McpApprovalEvidenceJsonSchema;
  readonly oneOf?: readonly McpApprovalEvidenceJsonSchema[];
}

export interface McpApprovalEvidenceSchemaDefinition {
  kind: McpApprovalEvidenceKind;
  schemaVersion: string;
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

export type McpApprovalEvidenceApiJsonObject = {
  readonly [key: string]: McpApprovalEvidenceApiJson;
};
export type McpApprovalEvidenceApiJson =
  | string
  | number
  | boolean
  | null
  | readonly McpApprovalEvidenceApiJson[]
  | McpApprovalEvidenceApiJsonObject;

export interface McpApprovalEvidenceApiFixtureRef {
  readonly id: string;
  readonly fixturePath: string;
}

export interface McpApprovalEvidenceApiRoute {
  readonly method: McpApprovalEvidenceApiRouteMethod;
  readonly path: string;
}

export interface McpApprovalEvidenceApiRequestPayload {
  readonly headers?: Record<string, string>;
  readonly body?: McpApprovalEvidenceApiJson;
}

export interface McpApprovalEvidenceApiExpectation {
  readonly status: number;
  readonly contentType?: string;
  readonly kind?: string;
  readonly schemaVersion?: string;
  readonly pluginId?: string;
  readonly recordId?: string;
  readonly errorCode?: string;
  readonly redactionCount?: number;
  readonly approvalSessionCount?: number;
  readonly entryCount?: number;
  readonly recordCount?: number;
  readonly matches?: boolean;
  readonly differenceCount?: number;
  readonly summary?: Record<string, number>;
  readonly statuses?: Record<string, number>;
  readonly pluginIds?: Record<string, number>;
  readonly [key: string]: McpApprovalEvidenceApiJson | undefined;
}

export interface McpApprovalEvidenceApiRequestFixture {
  readonly id: string;
  readonly title: string;
  readonly route: McpApprovalEvidenceApiRoute;
  readonly request: McpApprovalEvidenceApiRequestPayload;
  readonly expect: McpApprovalEvidenceApiExpectation;
}

export interface McpApprovalEvidencePreviewRequestBundle {
  readonly schemaVersion: typeof MCP_APPROVAL_EVIDENCE_PREVIEW_REQUESTS_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly apiBase: string;
  readonly fixtureRefs?: readonly McpApprovalEvidenceApiFixtureRef[];
  readonly requests: readonly McpApprovalEvidenceApiRequestFixture[];
}

export interface McpApprovalEvidenceObjectByKind {
  mcpApprovalEvidence: McpApprovalEvidenceRecord;
  mcpApprovalEvidencePreviewRequests: McpApprovalEvidencePreviewRequestBundle;
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
const API_REQUEST_ID_PATTERN = "^[A-Za-z][A-Za-z0-9_.:-]{0,127}$";
const API_FIXTURE_REF_ID_PATTERN = "^[A-Za-z][A-Za-z0-9_.-]{0,95}$";
const API_BASE_PATTERN = "^local://[a-z0-9][a-z0-9.-]{0,95}$";
const API_ROUTE_PATH_PATTERN = "^/v[0-9]+/(?!.*//)(?!.*\\.\\.)[A-Za-z0-9._~:/-]+$";
const SAFE_RELATIVE_JSON_FIXTURE_PATH_PATTERN =
  "^(?!/)(?![A-Za-z]:)(?!.*(?:^|/)\\.\\.(?:/|$))(?!.*//)[A-Za-z0-9._/-]+\\.json$";
const API_HEADER_NAME_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$";
const MEDIA_TYPE_PATTERN = "^[^\\s/]+/[^\\s]+$";
const API_RAW_LOCAL_PATH_PATTERN_SOURCE =
  "(?:\\b[A-Za-z]:[\\\\/][^\\s\"',;)}\\]]+|\\\\\\\\[^\\\\\\s\"',;)}\\]]+[\\\\][^\\s\"',;)}\\]]+|file://[^\\s\"',;)}\\]]+|/(?:Users|home|var|tmp|private|mnt|Volumes)/[^\\s\"',;)}\\]]+)";
const API_PRIVATE_MARKER_PATTERN_SOURCE =
  "(?:^|[\\\\/])\\." +
  "codex-private" +
  "(?:[\\\\/]|$)|[pP][rR][iI][vV][aA][tT][eE][- _]?[pP][lL][aA][nN](?:[- _]?[pP][aA][cC][kK])?|[pP][rR][iI][vV][aA][tT][eE][- _]?[mM][aA][rR][kK][eE][rR]";
const API_RAW_SECRET_VALUE_PATTERN_SOURCE =
  "(?:[bB][eE][aA][rR][eE][rR]\\s+(?!\\[REDACTED\\])\\S{8,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:^|[^A-Za-z0-9])(?:sk|rk|pk|tok|pat|npm|ghp|gho)_[A-Za-z0-9_-]{8,}|(?:^|[^A-Za-z0-9])(?:sk|rk|pat|glpat|github_pat)-[A-Za-z0-9_-]{8,}|(?:[aA][pP][iI][_-]?[kK][eE][yY]|[aA][uU][tT][hH][oO][rR][iI][zZ][aA][tT][iI][oO][nN]|[cC][rR][eE][dD][eE][nN][tT][iI][aA][lL]|[pP][aA][sS][sS][wW][oO][rR][dD]|[pP][rR][iI][vV][aA][tT][eE][_-]?[kK][eE][yY]|[sS][eE][cC][rR][eE][tT]|[sS][eE][sS][sS][iI][oO][nN][_-]?[tT][oO][kK][eE][nN]|[tT][oO][kK][eE][nN])\\s*[:=]\\s*(?!\\[REDACTED\\])\\S+)";
const API_UNSAFE_PUBLIC_STRING_PATTERN_SOURCE =
  `${API_RAW_LOCAL_PATH_PATTERN_SOURCE}|${API_PRIVATE_MARKER_PATTERN_SOURCE}|${API_RAW_SECRET_VALUE_PATTERN_SOURCE}`;
const API_SAFE_PUBLIC_STRING_PATTERN = `^(?!.*(?:${API_UNSAFE_PUBLIC_STRING_PATTERN_SOURCE})).*\\S.*$`;
const apiUnsafePublicStringPattern = new RegExp(API_UNSAFE_PUBLIC_STRING_PATTERN_SOURCE);

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

const apiSafeJsonValueSchema: McpApprovalEvidenceJsonSchema = {
  oneOf: [
    { type: "string", pattern: API_SAFE_PUBLIC_STRING_PATTERN },
    { type: "number" },
    { type: "boolean" },
    { type: "null" },
    { type: "array" },
    { type: "object" },
  ],
};

const apiMetricMapSchema: McpApprovalEvidenceJsonSchema = {
  type: "object",
  additionalProperties: nonNegativeIntegerSchema(),
};

const apiFixtureRefSchema = objectSchema(
  "MCP approval evidence preview API fixture reference",
  {
    id: apiFixtureRefIdSchema(),
    fixturePath: safeRelativeJsonFixturePathSchema(),
  },
  ["id", "fixturePath"],
);

const apiRouteSchema = objectSchema(
  "MCP approval evidence preview API route",
  {
    method: enumSchema(mcpApprovalEvidenceApiRouteMethods),
    path: apiRoutePathSchema(),
  },
  ["method", "path"],
);

const apiHeadersSchema: McpApprovalEvidenceJsonSchema = {
  type: "object",
  additionalProperties: {
    type: "string",
    pattern: API_SAFE_PUBLIC_STRING_PATTERN,
  },
};

const apiRequestPayloadSchema = objectSchema(
  "MCP approval evidence preview API request payload",
  {
    headers: apiHeadersSchema,
    body: apiSafeJsonValueSchema,
  },
  [],
);

const apiExpectationSchema = objectSchema(
  "MCP approval evidence preview API expectation",
  {
    status: httpStatusSchema(),
    contentType: mediaTypeSchema(),
    kind: safeApiPublicStringSchema(),
    schemaVersion: safeApiPublicStringSchema(),
    pluginId: safeApiPublicStringSchema(),
    recordId: safeApiPublicStringSchema(),
    errorCode: safeApiPublicStringSchema(),
    redactionCount: nonNegativeIntegerSchema(),
    approvalSessionCount: nonNegativeIntegerSchema(),
    entryCount: nonNegativeIntegerSchema(),
    recordCount: nonNegativeIntegerSchema(),
    matches: { type: "boolean" },
    differenceCount: nonNegativeIntegerSchema(),
    summary: apiMetricMapSchema,
    statuses: apiMetricMapSchema,
    pluginIds: apiMetricMapSchema,
  },
  ["status"],
);

const apiRequestFixtureSchema = objectSchema(
  "MCP approval evidence preview API request fixture",
  {
    id: apiRequestIdSchema(),
    title: safeApiPublicStringSchema(),
    route: apiRouteSchema,
    request: apiRequestPayloadSchema,
    expect: apiExpectationSchema,
  },
  ["id", "title", "route", "request", "expect"],
);

export const mcpApprovalEvidencePreviewRequestsSchema = deepFreeze(
  objectSchema(
    "MCP approval evidence preview API request fixture bundle",
    {
      schemaVersion: {
        type: "string",
        const: MCP_APPROVAL_EVIDENCE_PREVIEW_REQUESTS_SCHEMA_VERSION,
      },
      generatedAt: timestampSchema(),
      apiBase: apiBaseSchema(),
      fixtureRefs: arraySchema(apiFixtureRefSchema),
      requests: arraySchema(apiRequestFixtureSchema, 1),
    },
    ["schemaVersion", "generatedAt", "apiBase", "requests"],
    "approval-evidence-preview-requests",
  ),
);

export const mcpApprovalEvidenceSchemaDefinition = deepFreeze({
  kind: "mcpApprovalEvidence",
  schemaVersion: MCP_APPROVAL_EVIDENCE_SCHEMA_VERSION,
  title: mcpApprovalEvidenceSchema.title ?? "MCP approval evidence",
  schema: mcpApprovalEvidenceSchema,
} satisfies McpApprovalEvidenceSchemaDefinition);

export const mcpApprovalEvidenceSchemaDefinitions = deepFreeze({
  mcpApprovalEvidence: mcpApprovalEvidenceSchemaDefinition,
  mcpApprovalEvidencePreviewRequests: {
    kind: "mcpApprovalEvidencePreviewRequests",
    schemaVersion: MCP_APPROVAL_EVIDENCE_PREVIEW_REQUESTS_SCHEMA_VERSION,
    title:
      mcpApprovalEvidencePreviewRequestsSchema.title ??
      "MCP approval evidence preview API request fixture bundle",
    schema: mcpApprovalEvidencePreviewRequestsSchema,
  },
} satisfies Record<McpApprovalEvidenceKind, McpApprovalEvidenceSchemaDefinition>);

export const mcpApprovalEvidenceSchemas = {
  mcpApprovalEvidence: mcpApprovalEvidenceSchema,
  mcpApprovalEvidencePreviewRequests: mcpApprovalEvidencePreviewRequestsSchema,
} as const satisfies Record<McpApprovalEvidenceKind, McpApprovalEvidenceJsonSchema>;

export const mcpApprovalEvidenceValidators = {
  mcpApprovalEvidence: validateMcpApprovalEvidence,
  mcpApprovalEvidencePreviewRequests: validateMcpApprovalEvidencePreviewRequestBundle,
} as const;

export function getMcpApprovalEvidenceSchema(kind: McpApprovalEvidenceKind): McpApprovalEvidenceJsonSchema {
  return mcpApprovalEvidenceSchemas[kind];
}

export function validateMcpApprovalEvidenceObject<K extends McpApprovalEvidenceKind>(
  kind: K,
  value: unknown,
): ValidationResult<McpApprovalEvidenceObjectByKind[K]> {
  const validator = mcpApprovalEvidenceValidators[kind] as (
    candidate: unknown,
  ) => ValidationResult<unknown>;
  return validator(value) as ValidationResult<McpApprovalEvidenceObjectByKind[K]>;
}

export function assertMcpApprovalEvidenceObject<K extends McpApprovalEvidenceKind>(
  kind: K,
  value: unknown,
): asserts value is McpApprovalEvidenceObjectByKind[K] {
  const result = validateMcpApprovalEvidenceObject(kind, value);
  if (!result.ok) {
    throw new Error(formatValidationIssues(kind, result.issues));
  }
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
    throw new Error(formatValidationIssues("mcpApprovalEvidence", result.issues));
  }
}

export function validateMcpApprovalEvidencePreviewRequestBundle(
  value: unknown,
): ValidationResult<McpApprovalEvidencePreviewRequestBundle> {
  const issues: ValidationIssue[] = [];
  collectApiPublicStringIssues(value, "$", issues);
  validateMcpApprovalEvidencePreviewRequestBundleValue(value, "$", issues);
  return validationResult(value, issues);
}

export function assertMcpApprovalEvidencePreviewRequestBundle(
  value: unknown,
): asserts value is McpApprovalEvidencePreviewRequestBundle {
  const result = validateMcpApprovalEvidencePreviewRequestBundle(value);
  if (!result.ok) {
    throw new Error(formatValidationIssues("mcpApprovalEvidencePreviewRequests", result.issues));
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

function validateMcpApprovalEvidencePreviewRequestBundleValue(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): McpApprovalEvidencePreviewRequestBundle | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, apiRequestBundleKeys, issues);
  requireExactString(record, "schemaVersion", MCP_APPROVAL_EVIDENCE_PREVIEW_REQUESTS_SCHEMA_VERSION, issues, path);
  requireTimestamp(record, "generatedAt", issues, path);
  requirePattern(record, "apiBase", API_BASE_PATTERN, "apiBase must be a local:// API base", issues, path);

  const fixtureRefs = record.fixtureRefs !== undefined
    ? validateArray(record, "fixtureRefs", issues, validateApiFixtureRef, false)
    : undefined;
  const fixtureRefIds = validateApiFixtureRefIds(fixtureRefs, issues);
  const requests = validateArray(record, "requests", issues, validateApiRequestFixture, true);
  validateApiRequestIds(requests, issues);
  validateApiFixtureRefObjects(record, fixtureRefIds, path, issues);
  validateApiLocalFixturePathValues(record, path, issues);

  return record as unknown as McpApprovalEvidencePreviewRequestBundle;
}

function validateApiFixtureRef(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): McpApprovalEvidenceApiFixtureRef | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }
  requireOnlyKeys(record, path, apiFixtureRefKeys, issues);
  requirePattern(record, "id", API_FIXTURE_REF_ID_PATTERN, "id must be a non-empty fixture ref id", issues, path);
  requireSafeRelativeJsonFixturePath(record, "fixturePath", issues, path);
  return record as unknown as McpApprovalEvidenceApiFixtureRef;
}

function validateApiRequestFixture(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): McpApprovalEvidenceApiRequestFixture | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }
  requireOnlyKeys(record, path, apiRequestFixtureKeys, issues);
  requirePattern(record, "id", API_REQUEST_ID_PATTERN, "id must be a non-empty safe request id", issues, path);
  requireSafeApiPublicString(record, "title", issues, path);

  const route = requireRecord(record, "route", issues, path);
  if (route) {
    validateApiRoute(route, `${path}.route`, issues);
  }
  const request = requireRecord(record, "request", issues, path);
  if (request) {
    validateApiRequestPayload(request, `${path}.request`, issues);
  }
  const expectation = requireRecord(record, "expect", issues, path);
  if (expectation) {
    validateApiExpectation(expectation, `${path}.expect`, issues);
  }

  return record as unknown as McpApprovalEvidenceApiRequestFixture;
}

function validateApiRoute(record: Record<string, unknown>, path: string, issues: ValidationIssue[]): void {
  requireOnlyKeys(record, path, apiRouteKeys, issues);
  requireEnum(record, "method", mcpApprovalEvidenceApiRouteMethods, issues, path);
  requirePattern(record, "path", API_ROUTE_PATH_PATTERN, "path must be a /vN API route path", issues, path);
}

function validateApiRequestPayload(
  record: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
): void {
  requireOnlyKeys(record, path, apiRequestPayloadKeys, issues);
  if (record.headers !== undefined) {
    validateApiHeaders(record.headers, `${path}.headers`, issues);
  }
  if (record.body !== undefined) {
    validateApiJsonValue(record.body, `${path}.body`, issues);
  }
}

function validateApiHeaders(value: unknown, path: string, issues: ValidationIssue[]): void {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return;
  }
  for (const [key, headerValue] of Object.entries(record)) {
    const headerPath = `${path}.${key}`;
    if (!new RegExp(API_HEADER_NAME_PATTERN).test(key)) {
      issues.push({ path: headerPath, message: "header names must be safe HTTP field names" });
    }
    if (typeof headerValue !== "string" || !isApiSafePublicString(headerValue)) {
      issues.push({
        path: headerPath,
        message: "header values must be public strings without raw local paths, secrets, or private markers",
      });
    }
  }
}

function validateApiExpectation(
  record: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
): void {
  requireOnlyKeys(record, path, apiExpectationKeys, issues);
  requireHttpStatus(record, "status", issues, path);
  if (record.contentType !== undefined) {
    requirePattern(record, "contentType", MEDIA_TYPE_PATTERN, "contentType must be a media type", issues, path);
  }
  for (const key of apiExpectationStringKeys) {
    if (record[key] !== undefined) {
      requireSafeApiPublicString(record, key, issues, path);
    }
  }
  for (const key of apiExpectationCountKeys) {
    if (record[key] !== undefined) {
      requireNonNegativeInteger(record, key, issues, path);
    }
  }
  if (record.matches !== undefined) {
    requireBoolean(record, "matches", issues, path);
  }
  for (const key of apiExpectationMetricMapKeys) {
    if (record[key] !== undefined) {
      validateApiMetricMap(record[key], `${path}.${key}`, issues);
    }
  }
}

function validateApiMetricMap(value: unknown, path: string, issues: ValidationIssue[]): void {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return;
  }
  for (const [key, metric] of Object.entries(record)) {
    const metricPath = `${path}.${key}`;
    if (!isApiSafePublicString(key)) {
      issues.push({
        path: metricPath,
        message: "metric keys must be public strings without raw local paths, secrets, or private markers",
      });
    }
    if (typeof metric !== "number" || !Number.isInteger(metric) || metric < 0) {
      issues.push({ path: metricPath, message: "metric values must be non-negative integers" });
    }
  }
}

function validateApiJsonValue(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return;
  }
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      validateApiJsonValue(item, `${path}[${index}]`, issues);
    }
    return;
  }
  if (isRecord(value)) {
    for (const [key, nested] of Object.entries(value)) {
      validateApiJsonValue(nested, `${path}.${key}`, issues);
    }
    return;
  }
  issues.push({ path, message: "value must be JSON-compatible" });
}

function validateApiFixtureRefIds(
  fixtureRefs: readonly McpApprovalEvidenceApiFixtureRef[] | undefined,
  issues: ValidationIssue[],
): Set<string> {
  const ids = new Set<string>();
  for (const [index, ref] of (fixtureRefs ?? []).entries()) {
    if (ids.has(ref.id)) {
      issues.push({ path: `fixtureRefs[${index}].id`, message: "fixture ref ids must be unique" });
      continue;
    }
    ids.add(ref.id);
  }
  return ids;
}

function validateApiRequestIds(
  requests: readonly McpApprovalEvidenceApiRequestFixture[] | undefined,
  issues: ValidationIssue[],
): void {
  const ids = new Set<string>();
  for (const [index, request] of (requests ?? []).entries()) {
    if (ids.has(request.id)) {
      issues.push({ path: `requests[${index}].id`, message: "request ids must be unique" });
      continue;
    }
    ids.add(request.id);
  }
}

function validateApiFixtureRefObjects(
  value: unknown,
  fixtureRefIds: ReadonlySet<string>,
  path: string,
  issues: ValidationIssue[],
): void {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      validateApiFixtureRefObjects(item, fixtureRefIds, `${path}[${index}]`, issues);
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  if (Object.hasOwn(value, "$fixtureRef")) {
    requireOnlyKeys(value, path, apiFixtureRefObjectKeys, issues);
    const ref = value.$fixtureRef;
    if (typeof ref !== "string" || !new RegExp(API_FIXTURE_REF_ID_PATTERN).test(ref)) {
      issues.push({ path: `${path}.$fixtureRef`, message: "$fixtureRef must be a fixture ref id" });
    } else if (!fixtureRefIds.has(ref)) {
      issues.push({ path: `${path}.$fixtureRef`, message: "$fixtureRef must reference fixtureRefs" });
    }
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    validateApiFixtureRefObjects(nested, fixtureRefIds, path === "$" ? key : `${path}.${key}`, issues);
  }
}

function validateApiLocalFixturePathValues(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      validateApiLocalFixturePathValues(item, `${path}[${index}]`, issues);
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  const isRoute = Object.hasOwn(value, "method") && Object.hasOwn(value, "path");
  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = path === "$" ? key : `${path}.${key}`;
    if (key === "fixturePath" && typeof nested === "string") {
      if (!isSafeRelativeJsonFixturePath(nested)) {
        issues.push({ path: nestedPath, message: "fixturePath must be a safe relative JSON fixture path" });
      }
      continue;
    }
    if (key === "path" && !isRoute && typeof nested === "string" && !isSafeRelativeJsonFixturePath(nested)) {
      issues.push({ path: nestedPath, message: "path must be a safe relative JSON fixture path" });
      continue;
    }
    validateApiLocalFixturePathValues(nested, nestedPath, issues);
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

function mediaTypeSchema(): McpApprovalEvidenceJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: MEDIA_TYPE_PATTERN,
  };
}

function safeApiPublicStringSchema(): McpApprovalEvidenceJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: API_SAFE_PUBLIC_STRING_PATTERN,
  };
}

function apiRequestIdSchema(): McpApprovalEvidenceJsonSchema {
  return {
    type: "string",
    pattern: API_REQUEST_ID_PATTERN,
  };
}

function apiFixtureRefIdSchema(): McpApprovalEvidenceJsonSchema {
  return {
    type: "string",
    pattern: API_FIXTURE_REF_ID_PATTERN,
  };
}

function apiBaseSchema(): McpApprovalEvidenceJsonSchema {
  return {
    type: "string",
    pattern: API_BASE_PATTERN,
  };
}

function apiRoutePathSchema(): McpApprovalEvidenceJsonSchema {
  return {
    type: "string",
    pattern: API_ROUTE_PATH_PATTERN,
  };
}

function safeRelativeJsonFixturePathSchema(): McpApprovalEvidenceJsonSchema {
  return {
    type: "string",
    pattern: SAFE_RELATIVE_JSON_FIXTURE_PATH_PATTERN,
  };
}

function httpStatusSchema(): McpApprovalEvidenceJsonSchema {
  return {
    type: "integer",
    minimum: 100,
    maximum: 599,
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

function collectApiPublicStringIssues(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  seen: WeakSet<object> = new WeakSet<object>(),
): void {
  if (typeof value === "string") {
    if (!isApiSafePublicString(value)) {
      issues.push({
        path,
        message: "public strings must not include raw local paths, secrets, or private markers",
      });
    }
    return;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
    for (const [index, item] of value.entries()) {
      collectApiPublicStringIssues(item, `${path}[${index}]`, issues, seen);
    }
    seen.delete(value);
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);
  for (const [key, nested] of Object.entries(value)) {
    collectApiPublicStringIssues(nested, path === "$" ? key : `${path}.${key}`, issues, seen);
  }
  seen.delete(value);
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

function requireSafeApiPublicString(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (typeof value !== "string" || !isApiSafePublicString(value)) {
    issues.push({
      path: `${parentPath}.${key}`,
      message: `${key} must be a public string without raw local paths, secrets, or private markers`,
    });
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

function requireHttpStatus(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 100 || value > 599) {
    issues.push({ path: `${parentPath}.${key}`, message: `${key} must be an HTTP status from 100 to 599` });
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

function requireSafeRelativeJsonFixturePath(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (typeof value !== "string" || !isSafeRelativeJsonFixturePath(value)) {
    issues.push({
      path: `${parentPath}.${key}`,
      message: `${key} must be a safe relative JSON fixture path`,
    });
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

function isSafeRelativeJsonFixturePath(value: string): boolean {
  return (
    value.trim() === value &&
    new RegExp(SAFE_RELATIVE_JSON_FIXTURE_PATH_PATTERN).test(value) &&
    !apiUnsafePublicStringPattern.test(value)
  );
}

function isApiSafePublicString(value: string): boolean {
  return value.trim().length > 0 && !apiUnsafePublicStringPattern.test(value);
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

function formatValidationIssues(
  kind: McpApprovalEvidenceKind,
  issues: readonly ValidationIssue[],
): string {
  const details = issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
  return `${kind} validation failed: ${details}`;
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

const apiFixtureRefKeys = ["id", "fixturePath"] as const;

const apiFixtureRefObjectKeys = ["$fixtureRef"] as const;

const apiRouteKeys = ["method", "path"] as const;

const apiRequestPayloadKeys = ["headers", "body"] as const;

const apiExpectationStringKeys = [
  "kind",
  "schemaVersion",
  "pluginId",
  "recordId",
  "errorCode",
] as const;

const apiExpectationCountKeys = [
  "redactionCount",
  "approvalSessionCount",
  "entryCount",
  "recordCount",
  "differenceCount",
] as const;

const apiExpectationMetricMapKeys = ["summary", "statuses", "pluginIds"] as const;

const apiExpectationKeys = [
  "status",
  "contentType",
  ...apiExpectationStringKeys,
  ...apiExpectationCountKeys,
  "matches",
  ...apiExpectationMetricMapKeys,
] as const;

const apiRequestFixtureKeys = ["id", "title", "route", "request", "expect"] as const;

const apiRequestBundleKeys = [
  "schemaVersion",
  "generatedAt",
  "apiBase",
  "fixtureRefs",
  "requests",
] as const;
