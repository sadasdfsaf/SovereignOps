export const INGEST_EVIDENCE_SCHEMA_VERSION = "ingest-search-audit-evidence.v1";
export const INGEST_AUDIT_EVIDENCE_SCHEMA_VERSION = INGEST_EVIDENCE_SCHEMA_VERSION;
export const INGEST_SEARCH_AUDIT_EVIDENCE_SCHEMA_VERSION = INGEST_EVIDENCE_SCHEMA_VERSION;
export const AUDIT_EVIDENCE_SCHEMA_VERSION = INGEST_EVIDENCE_SCHEMA_VERSION;
export const JSON_SCHEMA_DRAFT = "https://json-schema.org/draft/2020-12/schema";

export const ingestEvidenceKinds = ["ingestAuditEvidence"] as const;
export type IngestEvidenceKind = (typeof ingestEvidenceKinds)[number];

export const repositoryStates = [
  "indexed",
  "partly_quarantined",
  "quarantined",
  "skipped",
  "failed",
] as const;
export type RepositoryState = (typeof repositoryStates)[number];

export const citationEvidenceKinds = ["indexDocument", "quarantineItem"] as const;
export type CitationEvidenceKind = (typeof citationEvidenceKinds)[number];

export const quarantineStates = ["open", "released", "rejected"] as const;
export type QuarantineState = (typeof quarantineStates)[number];

export const quarantineActions = ["release", "reject"] as const;
export type QuarantineAction = (typeof quarantineActions)[number];

export const httpMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type HttpMethod = (typeof httpMethods)[number];

export const clientSessionTraceKinds = ["apiRoute", "cliCommand"] as const;
export type ClientSessionTraceKind = (typeof clientSessionTraceKinds)[number];

export type JsonSchemaType = "array" | "boolean" | "integer" | "null" | "number" | "object" | "string";

export interface IngestEvidenceJsonSchema {
  readonly $schema?: string;
  readonly $id?: string;
  readonly title?: string;
  readonly type?: JsonSchemaType | readonly JsonSchemaType[];
  readonly additionalProperties?: boolean | IngestEvidenceJsonSchema;
  readonly properties?: Record<string, IngestEvidenceJsonSchema>;
  readonly required?: readonly string[];
  readonly enum?: readonly (string | number | boolean | null)[];
  readonly const?: string | number | boolean | null;
  readonly pattern?: string;
  readonly minLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minItems?: number;
  readonly items?: IngestEvidenceJsonSchema;
  readonly oneOf?: readonly IngestEvidenceJsonSchema[];
}

export interface IngestEvidenceSchemaDefinition {
  kind: "ingestAuditEvidence";
  schemaVersion: typeof INGEST_EVIDENCE_SCHEMA_VERSION;
  title: string;
  schema: IngestEvidenceJsonSchema;
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

export interface EvidenceSummary {
  sourceCount: number;
  evidenceFileCount: number;
  citationCount: number;
  quarantineDecisionCount: number;
  apiRequestTraceCount: number;
  clientSessionTraceCount: number;
}

export interface EvidenceFile {
  id: string;
  fixturePath: string;
  schemaVersion?: string;
  sha256: string;
}

export interface SourceSnapshot {
  sourceUri: string;
  path: string;
  mediaType: string;
  checksum: string;
  repositoryState: RepositoryState;
  logEntryIds: readonly string[];
  indexDocumentIds: readonly string[];
  quarantineItemIds: readonly string[];
}

export interface CitationRange {
  start_line?: number;
  end_line?: number;
  path?: string;
  row?: number;
  column?: number | string;
}

export interface CitationEvidence {
  id: string;
  kind: CitationEvidenceKind;
  documentId?: string;
  quarantineItemId?: string;
  sourceUri: string;
  checksum: string;
  range: CitationRange;
  trusted: boolean;
}

export interface QuarantineDecisionEvidence {
  decisionId: string;
  requestId: string;
  itemId: string;
  sourceUri: string;
  checksum: string;
  fromState: QuarantineState;
  toState: QuarantineState;
  actorId: string;
  action: QuarantineAction;
  reason: string;
  decidedAt: string;
  override: boolean;
}

export interface ApiRequestTrace {
  requestId: string;
  fixtureFileId: string;
  method: HttpMethod;
  path: string;
  responseStatus: number;
  sourceUris: readonly string[];
  checksums: readonly string[];
  documentIds?: readonly string[];
  quarantineItemIds?: readonly string[];
}

export interface ClientSessionTrace {
  traceId: string;
  fixtureFileId: string;
  kind: ClientSessionTraceKind;
  method?: HttpMethod;
  routePath?: string;
  command?: string;
  relatedRequestIds: readonly string[];
  sourceUris: readonly string[];
  documentIds?: readonly string[];
  quarantineItemIds?: readonly string[];
}

export interface IngestAuditEvidence {
  schemaVersion: typeof INGEST_EVIDENCE_SCHEMA_VERSION;
  generatedAt: string;
  workspaceId: `wsp_${string}`;
  sessionId: `sess_${string}`;
  localOnly: true;
  evidenceSummary: EvidenceSummary;
  evidenceFiles: readonly EvidenceFile[];
  sourceSnapshots: readonly SourceSnapshot[];
  citationEvidence: readonly CitationEvidence[];
  quarantineDecisions: readonly QuarantineDecisionEvidence[];
  apiRequestTrace: readonly ApiRequestTrace[];
  clientSessionTrace: readonly ClientSessionTrace[];
}

const HEX_SHA256_PATTERN = "^[a-f0-9]{64}$";
const LOCAL_FIXTURE_PATH_PATTERN =
  "^examples/ingest-search/(?!.*(?:^|/)\\.\\.(?:/|$))(?!.*//)[A-Za-z0-9._/-]+$";
const LOCAL_SOURCE_URI_PATTERN =
  "^fixture://ingest-search/(?!.*(?:^|/)\\.\\.(?:/|$))(?!.*//)[A-Za-z0-9._/-]+$";
const ID_PATTERN = "^[A-Za-z][A-Za-z0-9_-]{0,95}$";
const WORKSPACE_ID_PATTERN = "^wsp_[A-Za-z0-9_-]{1,88}$";
const SESSION_ID_PATTERN = "^sess_[A-Za-z0-9_-]{1,88}$";
const ISO_TIMESTAMP_PATTERN = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$";
const MEDIA_TYPE_PATTERN = "^[^\\s/]+/[^\\s]+$";
const API_PATH_PATTERN = "^/[^\\s]*$";

const evidenceSummarySchema = objectSchema(
  "Ingest audit evidence summary",
  {
    sourceCount: nonNegativeIntegerSchema(),
    evidenceFileCount: nonNegativeIntegerSchema(),
    citationCount: nonNegativeIntegerSchema(),
    quarantineDecisionCount: nonNegativeIntegerSchema(),
    apiRequestTraceCount: nonNegativeIntegerSchema(),
    clientSessionTraceCount: nonNegativeIntegerSchema(),
  },
  [
    "sourceCount",
    "evidenceFileCount",
    "citationCount",
    "quarantineDecisionCount",
    "apiRequestTraceCount",
    "clientSessionTraceCount",
  ],
);

const evidenceFileSchema = objectSchema(
  "Ingest audit evidence file",
  {
    id: identifierSchema(),
    fixturePath: localFixturePathSchema(),
    schemaVersion: nonBlankStringSchema(),
    sha256: checksumSchema(),
  },
  ["id", "fixturePath", "sha256"],
);

const sourceSnapshotSchema = objectSchema(
  "Ingest audit source snapshot",
  {
    sourceUri: localSourceUriSchema(),
    path: localFixturePathSchema(),
    mediaType: mediaTypeSchema(),
    checksum: checksumSchema(),
    repositoryState: enumSchema(repositoryStates),
    logEntryIds: stringArraySchema(),
    indexDocumentIds: stringArraySchema(),
    quarantineItemIds: stringArraySchema(),
  },
  [
    "sourceUri",
    "path",
    "mediaType",
    "checksum",
    "repositoryState",
    "logEntryIds",
    "indexDocumentIds",
    "quarantineItemIds",
  ],
);

const citationRangeSchema = objectSchema(
  "Ingest audit citation range",
  {
    start_line: positiveIntegerSchema(),
    end_line: positiveIntegerSchema(),
    path: nonBlankStringSchema(),
    row: positiveIntegerSchema(),
    column: {
      oneOf: [positiveIntegerSchema(), nonBlankStringSchema()],
    },
  },
  [],
);

const citationEvidenceSchema = objectSchema(
  "Ingest audit citation evidence",
  {
    id: identifierSchema(),
    kind: enumSchema(citationEvidenceKinds),
    documentId: nonBlankStringSchema(),
    quarantineItemId: nonBlankStringSchema(),
    sourceUri: localSourceUriSchema(),
    checksum: checksumSchema(),
    range: citationRangeSchema,
    trusted: { type: "boolean" },
  },
  ["id", "kind", "sourceUri", "checksum", "range", "trusted"],
);

const quarantineDecisionSchema = objectSchema(
  "Ingest audit quarantine decision evidence",
  {
    decisionId: identifierSchema(),
    requestId: identifierSchema(),
    itemId: nonBlankStringSchema(),
    sourceUri: localSourceUriSchema(),
    checksum: checksumSchema(),
    fromState: enumSchema(quarantineStates),
    toState: enumSchema(quarantineStates),
    actorId: nonBlankStringSchema(),
    action: enumSchema(quarantineActions),
    reason: nonBlankStringSchema(),
    decidedAt: timestampSchema(),
    override: { type: "boolean" },
  },
  [
    "decisionId",
    "requestId",
    "itemId",
    "sourceUri",
    "checksum",
    "fromState",
    "toState",
    "actorId",
    "action",
    "reason",
    "decidedAt",
    "override",
  ],
);

const apiRequestTraceSchema = objectSchema(
  "Ingest audit API request trace",
  {
    requestId: identifierSchema(),
    fixtureFileId: identifierSchema(),
    method: enumSchema(httpMethods),
    path: apiPathSchema(),
    responseStatus: responseStatusSchema(),
    sourceUris: localSourceUriArraySchema(),
    checksums: checksumArraySchema(),
    documentIds: stringArraySchema(),
    quarantineItemIds: stringArraySchema(),
  },
  ["requestId", "fixtureFileId", "method", "path", "responseStatus", "sourceUris", "checksums"],
);

const clientSessionTraceSchema = objectSchema(
  "Ingest audit client session trace",
  {
    traceId: identifierSchema(),
    fixtureFileId: identifierSchema(),
    kind: enumSchema(clientSessionTraceKinds),
    method: enumSchema(httpMethods),
    routePath: apiPathSchema(),
    command: nonBlankStringSchema(),
    relatedRequestIds: stringArraySchema(),
    sourceUris: localSourceUriArraySchema(),
    documentIds: stringArraySchema(),
    quarantineItemIds: stringArraySchema(),
  },
  ["traceId", "fixtureFileId", "kind", "relatedRequestIds", "sourceUris"],
);

export const ingestEvidenceSchema = deepFreeze(
  objectSchema(
    "Ingest search audit evidence",
    {
      schemaVersion: { type: "string", const: INGEST_EVIDENCE_SCHEMA_VERSION },
      generatedAt: timestampSchema(),
      workspaceId: {
        type: "string",
        pattern: WORKSPACE_ID_PATTERN,
      },
      sessionId: {
        type: "string",
        pattern: SESSION_ID_PATTERN,
      },
      localOnly: {
        type: "boolean",
        const: true,
      },
      evidenceSummary: evidenceSummarySchema,
      evidenceFiles: arraySchema(evidenceFileSchema, 1),
      sourceSnapshots: arraySchema(sourceSnapshotSchema, 1),
      citationEvidence: arraySchema(citationEvidenceSchema),
      quarantineDecisions: arraySchema(quarantineDecisionSchema),
      apiRequestTrace: arraySchema(apiRequestTraceSchema),
      clientSessionTrace: arraySchema(clientSessionTraceSchema),
    },
    [
      "schemaVersion",
      "generatedAt",
      "workspaceId",
      "sessionId",
      "localOnly",
      "evidenceSummary",
      "evidenceFiles",
      "sourceSnapshots",
      "citationEvidence",
      "quarantineDecisions",
      "apiRequestTrace",
      "clientSessionTrace",
    ],
    "audit-evidence",
  ),
);

export const ingestAuditEvidenceSchema = ingestEvidenceSchema;
export const auditEvidenceSchema = ingestEvidenceSchema;

export const ingestEvidenceSchemaDefinition = deepFreeze({
  kind: "ingestAuditEvidence",
  schemaVersion: INGEST_EVIDENCE_SCHEMA_VERSION,
  title: ingestEvidenceSchema.title ?? "Ingest search audit evidence",
  schema: ingestEvidenceSchema,
} satisfies IngestEvidenceSchemaDefinition);

export const ingestAuditEvidenceSchemaDefinition = ingestEvidenceSchemaDefinition;
export const auditEvidenceSchemaDefinition = ingestEvidenceSchemaDefinition;

export function getIngestEvidenceSchema(): IngestEvidenceJsonSchema {
  return ingestEvidenceSchema;
}

export function validateIngestEvidence(value: unknown): ValidationResult<IngestAuditEvidence> {
  const issues = recordIssues(value, "$");
  if (issues.length > 0) {
    return invalid(issues);
  }

  const record = value as Record<string, unknown>;
  requireExactString(record, "schemaVersion", INGEST_EVIDENCE_SCHEMA_VERSION, issues);
  requireTimestamp(record, "generatedAt", issues);
  requirePattern(record, "workspaceId", WORKSPACE_ID_PATTERN, "workspaceId must use the wsp_ id prefix", issues);
  requirePattern(record, "sessionId", SESSION_ID_PATTERN, "sessionId must use the sess_ id prefix", issues);
  requireTrue(record, "localOnly", issues);
  requireOnlyKeys(record, "$", topLevelKeys, issues);

  const evidenceSummary = requireRecord(record, "evidenceSummary", issues);
  if (evidenceSummary) {
    validateEvidenceSummary(evidenceSummary, "evidenceSummary", issues);
  }

  const evidenceFiles = validateArray(record, "evidenceFiles", issues, validateEvidenceFile, true);
  const sourceSnapshots = validateArray(record, "sourceSnapshots", issues, validateSourceSnapshot, true);
  const citationEvidence = validateArray(record, "citationEvidence", issues, validateCitationEvidence);
  const quarantineDecisions = validateArray(
    record,
    "quarantineDecisions",
    issues,
    validateQuarantineDecisionEvidence,
  );
  const apiRequestTrace = validateArray(record, "apiRequestTrace", issues, validateApiRequestTrace);
  const clientSessionTrace = validateArray(
    record,
    "clientSessionTrace",
    issues,
    validateClientSessionTrace,
  );

  validateCrossReferences(
    {
      evidenceSummary,
      evidenceFiles,
      sourceSnapshots,
      citationEvidence,
      quarantineDecisions,
      apiRequestTrace,
      clientSessionTrace,
    },
    issues,
  );

  return validationResult(value, issues);
}

export const validateIngestAuditEvidence = validateIngestEvidence;
export const validateAuditEvidence = validateIngestEvidence;

export const ingestEvidenceValidators = {
  ingestAuditEvidence: validateIngestEvidence,
} as const;

export function assertIngestEvidence(value: unknown): asserts value is IngestAuditEvidence {
  const result = validateIngestEvidence(value);
  if (!result.ok) {
    throw new Error(formatValidationIssues(result.issues));
  }
}

export const assertIngestAuditEvidence = assertIngestEvidence;
export const assertAuditEvidence = assertIngestEvidence;

export function isChecksum(value: string): boolean {
  return new RegExp(HEX_SHA256_PATTERN).test(value);
}

export function isLocalFixturePath(value: string): boolean {
  return (
    value.trim() === value &&
    new RegExp(LOCAL_FIXTURE_PATH_PATTERN).test(value) &&
    hasSafePathTail(value.slice("examples/ingest-search/".length))
  );
}

export function isLocalSourceUri(value: string): boolean {
  return (
    value.trim() === value &&
    new RegExp(LOCAL_SOURCE_URI_PATTERN).test(value) &&
    hasSafePathTail(value.slice("fixture://ingest-search/".length))
  );
}

export function localSourceUriToFixturePath(sourceUri: string): string | undefined {
  if (!isLocalSourceUri(sourceUri)) {
    return undefined;
  }
  return `examples/ingest-search/${sourceUri.slice("fixture://ingest-search/".length)}`;
}

function validateEvidenceSummary(
  record: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
): void {
  requireOnlyKeys(record, path, evidenceSummaryKeys, issues);
  for (const key of evidenceSummaryKeys) {
    requireNonNegativeInteger(record, key, issues, path);
  }
}

function validateEvidenceFile(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): EvidenceFile | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, evidenceFileKeys, issues);
  requireIdentifier(record, "id", issues, path);
  requireLocalFixturePath(record, "fixturePath", issues, path);
  optionalNonEmptyString(record, "schemaVersion", issues, path);
  requireChecksum(record, "sha256", issues, path);

  return record as unknown as EvidenceFile;
}

function validateSourceSnapshot(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): SourceSnapshot | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, sourceSnapshotKeys, issues);
  requireLocalSourceUri(record, "sourceUri", issues, path);
  requireLocalFixturePath(record, "path", issues, path);
  requireMediaType(record, "mediaType", issues, path);
  requireChecksum(record, "checksum", issues, path);
  requireEnum(record, "repositoryState", repositoryStates, issues, path);
  requireStringArray(record, "logEntryIds", issues, path);
  requireStringArray(record, "indexDocumentIds", issues, path);
  requireStringArray(record, "quarantineItemIds", issues, path);

  if (
    typeof record.sourceUri === "string" &&
    typeof record.path === "string" &&
    isLocalSourceUri(record.sourceUri) &&
    isLocalFixturePath(record.path)
  ) {
    const expectedPath = localSourceUriToFixturePath(record.sourceUri);
    if (record.path !== expectedPath) {
      issues.push({
        path: `${path}.path`,
        message: "path must match the local source URI fixture path",
      });
    }
  }

  return record as unknown as SourceSnapshot;
}

function validateCitationEvidence(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): CitationEvidence | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, citationEvidenceKeys, issues);
  requireIdentifier(record, "id", issues, path);
  requireEnum(record, "kind", citationEvidenceKinds, issues, path);
  requireLocalSourceUri(record, "sourceUri", issues, path);
  requireChecksum(record, "checksum", issues, path);
  requireBoolean(record, "trusted", issues, path);

  const range = requireRecord(record, "range", issues, path);
  if (range) {
    validateCitationRange(range, `${path}.range`, issues);
  }

  if (record.kind === "indexDocument") {
    requireNonEmptyString(record, "documentId", issues, path);
    if (record.quarantineItemId !== undefined) {
      issues.push({
        path: `${path}.quarantineItemId`,
        message: "indexDocument citation evidence must not include quarantineItemId",
      });
    }
  }
  if (record.kind === "quarantineItem") {
    requireNonEmptyString(record, "quarantineItemId", issues, path);
    if (record.documentId !== undefined) {
      issues.push({
        path: `${path}.documentId`,
        message: "quarantineItem citation evidence must not include documentId",
      });
    }
  }

  return record as unknown as CitationEvidence;
}

function validateCitationRange(
  range: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
): void {
  requireOnlyKeys(range, path, citationRangeKeys, issues);
  optionalPositiveInteger(range, "start_line", issues, path);
  optionalPositiveInteger(range, "end_line", issues, path);
  optionalNonEmptyString(range, "path", issues, path);
  optionalPositiveInteger(range, "row", issues, path);

  const column = range.column;
  if (
    column !== undefined &&
    !(
      (typeof column === "number" && Number.isInteger(column) && column >= 1) ||
      (typeof column === "string" && column.trim().length > 0)
    )
  ) {
    issues.push({
      path: `${path}.column`,
      message: "column must be a positive integer or non-empty string",
    });
  }

  if (
    typeof range.start_line === "number" &&
    typeof range.end_line === "number" &&
    range.end_line < range.start_line
  ) {
    issues.push({
      path: `${path}.end_line`,
      message: "end_line must be greater than or equal to start_line",
    });
  }

  const hasLineRange = range.start_line !== undefined || range.end_line !== undefined;
  const hasRowRange = range.row !== undefined || range.column !== undefined;
  const hasJsonPath = range.path !== undefined;

  if (!hasLineRange && !hasRowRange && !hasJsonPath) {
    issues.push({
      path,
      message: "range must include a line range, row/column range, or JSON path",
    });
  }
  if (hasLineRange && (range.start_line === undefined || range.end_line === undefined)) {
    issues.push({
      path,
      message: "line ranges must include start_line and end_line",
    });
  }
  if (hasRowRange && (range.row === undefined || range.column === undefined)) {
    issues.push({
      path,
      message: "row ranges must include row and column",
    });
  }
}

function validateQuarantineDecisionEvidence(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): QuarantineDecisionEvidence | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, quarantineDecisionKeys, issues);
  requireIdentifier(record, "decisionId", issues, path);
  requireIdentifier(record, "requestId", issues, path);
  requireNonEmptyString(record, "itemId", issues, path);
  requireLocalSourceUri(record, "sourceUri", issues, path);
  requireChecksum(record, "checksum", issues, path);
  requireEnum(record, "fromState", quarantineStates, issues, path);
  requireEnum(record, "toState", quarantineStates, issues, path);
  requireNonEmptyString(record, "actorId", issues, path);
  requireEnum(record, "action", quarantineActions, issues, path);
  requireNonEmptyString(record, "reason", issues, path);
  requireTimestamp(record, "decidedAt", issues, path);
  requireBoolean(record, "override", issues, path);

  if (record.action === "release" && record.toState !== "released") {
    issues.push({ path: `${path}.toState`, message: "release decisions must end in released" });
  }
  if (record.action === "reject" && record.toState !== "rejected") {
    issues.push({ path: `${path}.toState`, message: "reject decisions must end in rejected" });
  }

  return record as unknown as QuarantineDecisionEvidence;
}

function validateApiRequestTrace(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): ApiRequestTrace | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, apiRequestTraceKeys, issues);
  requireIdentifier(record, "requestId", issues, path);
  requireIdentifier(record, "fixtureFileId", issues, path);
  requireEnum(record, "method", httpMethods, issues, path);
  requireApiPath(record, "path", issues, path);
  requireResponseStatus(record, "responseStatus", issues, path);
  requireLocalSourceUriArray(record, "sourceUris", issues, path, true);
  requireChecksumArray(record, "checksums", issues, path, true);
  optionalStringArray(record, "documentIds", issues, path);
  optionalStringArray(record, "quarantineItemIds", issues, path);

  if (
    Array.isArray(record.sourceUris) &&
    Array.isArray(record.checksums) &&
    record.sourceUris.length !== record.checksums.length
  ) {
    issues.push({
      path: `${path}.checksums`,
      message: "checksums must align one-for-one with sourceUris",
    });
  }

  return record as unknown as ApiRequestTrace;
}

function validateClientSessionTrace(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): ClientSessionTrace | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, clientSessionTraceKeys, issues);
  requireIdentifier(record, "traceId", issues, path);
  requireIdentifier(record, "fixtureFileId", issues, path);
  requireEnum(record, "kind", clientSessionTraceKinds, issues, path);
  requireStringArray(record, "relatedRequestIds", issues, path);
  requireLocalSourceUriArray(record, "sourceUris", issues, path, true);
  optionalStringArray(record, "documentIds", issues, path);
  optionalStringArray(record, "quarantineItemIds", issues, path);

  if (record.kind === "apiRoute") {
    requireEnum(record, "method", httpMethods, issues, path);
    requireApiPath(record, "routePath", issues, path);
    if (record.command !== undefined) {
      issues.push({ path: `${path}.command`, message: "apiRoute traces must not include command" });
    }
  }
  if (record.kind === "cliCommand") {
    requireNonEmptyString(record, "command", issues, path);
    if (record.method !== undefined) {
      issues.push({ path: `${path}.method`, message: "cliCommand traces must not include method" });
    }
    if (record.routePath !== undefined) {
      issues.push({ path: `${path}.routePath`, message: "cliCommand traces must not include routePath" });
    }
  }

  return record as unknown as ClientSessionTrace;
}

function validateCrossReferences(
  records: {
    evidenceSummary?: Record<string, unknown>;
    evidenceFiles?: readonly EvidenceFile[];
    sourceSnapshots?: readonly SourceSnapshot[];
    citationEvidence?: readonly CitationEvidence[];
    quarantineDecisions?: readonly QuarantineDecisionEvidence[];
    apiRequestTrace?: readonly ApiRequestTrace[];
    clientSessionTrace?: readonly ClientSessionTrace[];
  },
  issues: ValidationIssue[],
): void {
  const {
    evidenceSummary,
    evidenceFiles = [],
    sourceSnapshots = [],
    citationEvidence = [],
    quarantineDecisions = [],
    apiRequestTrace = [],
    clientSessionTrace = [],
  } = records;

  if (evidenceSummary) {
    compareCount(evidenceSummary, "sourceCount", sourceSnapshots.length, issues);
    compareCount(evidenceSummary, "evidenceFileCount", evidenceFiles.length, issues);
    compareCount(evidenceSummary, "citationCount", citationEvidence.length, issues);
    compareCount(evidenceSummary, "quarantineDecisionCount", quarantineDecisions.length, issues);
    compareCount(evidenceSummary, "apiRequestTraceCount", apiRequestTrace.length, issues);
    compareCount(evidenceSummary, "clientSessionTraceCount", clientSessionTrace.length, issues);
  }

  const evidenceFileIds = new Set<string>();
  const fixtureChecksums = new Map<string, string>();
  for (const [index, file] of evidenceFiles.entries()) {
    if (evidenceFileIds.has(file.id)) {
      issues.push({ path: `evidenceFiles[${index}].id`, message: "evidence file ids must be unique" });
    }
    evidenceFileIds.add(file.id);
    if (fixtureChecksums.has(file.fixturePath)) {
      issues.push({
        path: `evidenceFiles[${index}].fixturePath`,
        message: "evidence file fixture paths must be unique",
      });
    }
    fixtureChecksums.set(file.fixturePath, file.sha256);
  }

  const sourceByUri = new Map<string, SourceSnapshot>();
  const documentIds = new Set<string>();
  const quarantineItemIds = new Set<string>();
  for (const [index, snapshot] of sourceSnapshots.entries()) {
    if (sourceByUri.has(snapshot.sourceUri)) {
      issues.push({ path: `sourceSnapshots[${index}].sourceUri`, message: "source URIs must be unique" });
    }
    sourceByUri.set(snapshot.sourceUri, snapshot);

    const fixtureChecksum = fixtureChecksums.get(snapshot.path);
    if (fixtureChecksum && fixtureChecksum !== snapshot.checksum) {
      issues.push({
        path: `sourceSnapshots[${index}].checksum`,
        message: "source snapshot checksum must match the evidence file checksum for its path",
      });
    }

    for (const documentId of snapshot.indexDocumentIds) {
      documentIds.add(documentId);
    }
    for (const quarantineItemId of snapshot.quarantineItemIds) {
      quarantineItemIds.add(quarantineItemId);
    }
  }

  for (const [index, citation] of citationEvidence.entries()) {
    validateKnownSourceAndChecksum(
      citation.sourceUri,
      citation.checksum,
      `citationEvidence[${index}]`,
      sourceByUri,
      issues,
    );
    if (citation.documentId !== undefined && !documentIds.has(citation.documentId)) {
      issues.push({
        path: `citationEvidence[${index}].documentId`,
        message: "documentId must reference a source snapshot index document",
      });
    }
    if (citation.quarantineItemId !== undefined && !quarantineItemIds.has(citation.quarantineItemId)) {
      issues.push({
        path: `citationEvidence[${index}].quarantineItemId`,
        message: "quarantineItemId must reference a source snapshot quarantine item",
      });
    }
  }

  const requestIds = new Set<string>();
  for (const [index, request] of apiRequestTrace.entries()) {
    if (requestIds.has(request.requestId)) {
      issues.push({
        path: `apiRequestTrace[${index}].requestId`,
        message: "API request ids must be unique",
      });
    }
    requestIds.add(request.requestId);
    validateFixtureFileReference(evidenceFileIds, request.fixtureFileId, `apiRequestTrace[${index}]`, issues);
    validateSourceChecksumArrays(
      request.sourceUris,
      request.checksums,
      `apiRequestTrace[${index}]`,
      sourceByUri,
      issues,
    );
    validateOptionalIds(request.documentIds, documentIds, `apiRequestTrace[${index}].documentIds`, "documentIds", issues);
    validateOptionalIds(
      request.quarantineItemIds,
      quarantineItemIds,
      `apiRequestTrace[${index}].quarantineItemIds`,
      "quarantineItemIds",
      issues,
    );
  }

  for (const [index, decision] of quarantineDecisions.entries()) {
    validateKnownSourceAndChecksum(
      decision.sourceUri,
      decision.checksum,
      `quarantineDecisions[${index}]`,
      sourceByUri,
      issues,
    );
    if (!requestIds.has(decision.requestId)) {
      issues.push({
        path: `quarantineDecisions[${index}].requestId`,
        message: "requestId must reference an API request trace",
      });
    }
    if (!quarantineItemIds.has(decision.itemId)) {
      issues.push({
        path: `quarantineDecisions[${index}].itemId`,
        message: "itemId must reference a source snapshot quarantine item",
      });
    }
  }

  for (const [index, trace] of clientSessionTrace.entries()) {
    validateFixtureFileReference(evidenceFileIds, trace.fixtureFileId, `clientSessionTrace[${index}]`, issues);
    for (const [requestIndex, requestId] of trace.relatedRequestIds.entries()) {
      if (!requestIds.has(requestId)) {
        issues.push({
          path: `clientSessionTrace[${index}].relatedRequestIds[${requestIndex}]`,
          message: "relatedRequestIds must reference API request traces",
        });
      }
    }
    for (const [sourceIndex, sourceUri] of trace.sourceUris.entries()) {
      if (!sourceByUri.has(sourceUri)) {
        issues.push({
          path: `clientSessionTrace[${index}].sourceUris[${sourceIndex}]`,
          message: "sourceUris must reference sourceSnapshots",
        });
      }
    }
    validateOptionalIds(
      trace.documentIds,
      documentIds,
      `clientSessionTrace[${index}].documentIds`,
      "documentIds",
      issues,
    );
    validateOptionalIds(
      trace.quarantineItemIds,
      quarantineItemIds,
      `clientSessionTrace[${index}].quarantineItemIds`,
      "quarantineItemIds",
      issues,
    );
  }
}

function validateFixtureFileReference(
  evidenceFileIds: ReadonlySet<string>,
  fixtureFileId: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!evidenceFileIds.has(fixtureFileId)) {
    issues.push({
      path: `${path}.fixtureFileId`,
      message: "fixtureFileId must reference an evidence file id",
    });
  }
}

function validateSourceChecksumArrays(
  sourceUris: readonly string[],
  checksums: readonly string[],
  path: string,
  sourceByUri: ReadonlyMap<string, SourceSnapshot>,
  issues: ValidationIssue[],
): void {
  for (const [index, sourceUri] of sourceUris.entries()) {
    const snapshot = sourceByUri.get(sourceUri);
    if (!snapshot) {
      issues.push({
        path: `${path}.sourceUris[${index}]`,
        message: "sourceUris must reference sourceSnapshots",
      });
      continue;
    }

    const checksum = checksums[index];
    if (checksum === undefined) {
      continue;
    }
    if (snapshot.checksum !== checksum) {
      issues.push({
        path: `${path}.checksums[${index}]`,
        message: "checksums must match referenced source snapshots",
      });
    }
  }
}

function validateKnownSourceAndChecksum(
  sourceUri: string,
  checksum: string,
  path: string,
  sourceByUri: ReadonlyMap<string, SourceSnapshot>,
  issues: ValidationIssue[],
): void {
  const snapshot = sourceByUri.get(sourceUri);
  if (!snapshot) {
    issues.push({ path: `${path}.sourceUri`, message: "sourceUri must reference sourceSnapshots" });
    return;
  }
  if (snapshot.checksum !== checksum) {
    issues.push({ path: `${path}.checksum`, message: "checksum must match the referenced source snapshot" });
  }
}

function validateOptionalIds(
  values: readonly string[] | undefined,
  allowed: ReadonlySet<string>,
  path: string,
  label: string,
  issues: ValidationIssue[],
): void {
  if (values === undefined) {
    return;
  }
  for (const [index, value] of values.entries()) {
    if (!allowed.has(value)) {
      issues.push({ path: `${path}[${index}]`, message: `${label} must reference source snapshot ids` });
    }
  }
}

function compareCount(
  summary: Record<string, unknown>,
  key: keyof EvidenceSummary,
  actual: number,
  issues: ValidationIssue[],
): void {
  if (summary[key] !== actual) {
    issues.push({
      path: `evidenceSummary.${key}`,
      message: `${key} must match the corresponding evidence array count`,
    });
  }
}

function objectSchema(
  title: string,
  properties: Record<string, IngestEvidenceJsonSchema>,
  required: readonly string[],
  slug?: string,
): IngestEvidenceJsonSchema {
  return {
    $schema: JSON_SCHEMA_DRAFT,
    $id: slug ? `https://schemas.sovereignops.local/ingest-search/${slug}.schema.json` : undefined,
    title,
    type: "object",
    additionalProperties: false,
    required,
    properties,
  };
}

function arraySchema(items: IngestEvidenceJsonSchema, minItems?: number): IngestEvidenceJsonSchema {
  return {
    type: "array",
    minItems,
    items,
  };
}

function identifierSchema(): IngestEvidenceJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: ID_PATTERN,
  };
}

function nonBlankStringSchema(): IngestEvidenceJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: "\\S",
  };
}

function timestampSchema(): IngestEvidenceJsonSchema {
  return {
    type: "string",
    pattern: ISO_TIMESTAMP_PATTERN,
  };
}

function localFixturePathSchema(): IngestEvidenceJsonSchema {
  return {
    type: "string",
    pattern: LOCAL_FIXTURE_PATH_PATTERN,
  };
}

function localSourceUriSchema(): IngestEvidenceJsonSchema {
  return {
    type: "string",
    pattern: LOCAL_SOURCE_URI_PATTERN,
  };
}

function mediaTypeSchema(): IngestEvidenceJsonSchema {
  return {
    type: "string",
    pattern: MEDIA_TYPE_PATTERN,
  };
}

function checksumSchema(): IngestEvidenceJsonSchema {
  return {
    type: "string",
    pattern: HEX_SHA256_PATTERN,
  };
}

function apiPathSchema(): IngestEvidenceJsonSchema {
  return {
    type: "string",
    pattern: API_PATH_PATTERN,
  };
}

function responseStatusSchema(): IngestEvidenceJsonSchema {
  return {
    type: "integer",
    minimum: 100,
    maximum: 599,
  };
}

function positiveIntegerSchema(): IngestEvidenceJsonSchema {
  return {
    type: "integer",
    minimum: 1,
  };
}

function nonNegativeIntegerSchema(): IngestEvidenceJsonSchema {
  return {
    type: "integer",
    minimum: 0,
  };
}

function enumSchema(values: readonly (string | number | boolean | null)[]): IngestEvidenceJsonSchema {
  return {
    type: typeof values[0] === "string" ? "string" : undefined,
    enum: values,
  };
}

function stringArraySchema(): IngestEvidenceJsonSchema {
  return {
    type: "array",
    items: nonBlankStringSchema(),
  };
}

function localSourceUriArraySchema(): IngestEvidenceJsonSchema {
  return {
    type: "array",
    items: localSourceUriSchema(),
  };
}

function checksumArraySchema(): IngestEvidenceJsonSchema {
  return {
    type: "array",
    items: checksumSchema(),
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

function requireIdentifier(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  requirePattern(record, key, ID_PATTERN, `${key} must be a non-empty local identifier`, issues, parentPath);
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

function requireNonEmptyString(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push({ path: `${parentPath}.${key}`, message: `${key} must be a non-empty string` });
  }
}

function optionalNonEmptyString(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (value !== undefined && (typeof value !== "string" || value.trim().length === 0)) {
    issues.push({ path: `${parentPath}.${key}`, message: `${key} must be a non-empty string when provided` });
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

function optionalPositiveInteger(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (value !== undefined && (typeof value !== "number" || !Number.isInteger(value) || value < 1)) {
    issues.push({ path: `${parentPath}.${key}`, message: `${key} must be a positive integer when provided` });
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
    issues.push({ path: `${parentPath}.${key}`, message: `${key} must be one of ${allowed.join(", ")}` });
  }
}

function requireLocalFixturePath(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (typeof value !== "string" || !isLocalFixturePath(value)) {
    issues.push({
      path: `${parentPath}.${key}`,
      message: `${key} must be a safe examples/ingest-search relative fixture path`,
    });
  }
}

function requireLocalSourceUri(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (typeof value !== "string" || !isLocalSourceUri(value)) {
    issues.push({
      path: `${parentPath}.${key}`,
      message: `${key} must use fixture://ingest-search/ local source URI form`,
    });
  }
}

function requireMediaType(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (typeof value !== "string" || !new RegExp(MEDIA_TYPE_PATTERN).test(value)) {
    issues.push({ path: `${parentPath}.${key}`, message: `${key} must be a media type` });
  }
}

function requireChecksum(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (typeof value !== "string" || !isChecksum(value)) {
    issues.push({ path: `${parentPath}.${key}`, message: `${key} must be a lowercase sha256 digest` });
  }
}

function requireApiPath(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (typeof value !== "string" || !new RegExp(API_PATH_PATTERN).test(value)) {
    issues.push({ path: `${parentPath}.${key}`, message: `${key} must be a local path beginning with /` });
  }
}

function requireResponseStatus(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 100 || value > 599) {
    issues.push({ path: `${parentPath}.${key}`, message: `${key} must be an HTTP status code` });
  }
}

function requireStringArray(
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
  validateStringArrayItems(value, `${parentPath}.${key}`, issues);
}

function optionalStringArray(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    issues.push({ path: `${parentPath}.${key}`, message: `${key} must be an array when provided` });
    return;
  }
  validateStringArrayItems(value, `${parentPath}.${key}`, issues);
}

function requireLocalSourceUriArray(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
  nonEmpty: boolean,
): void {
  const value = record[key];
  if (!Array.isArray(value)) {
    issues.push({ path: `${parentPath}.${key}`, message: `${key} must be an array` });
    return;
  }
  if (nonEmpty && value.length === 0) {
    issues.push({ path: `${parentPath}.${key}`, message: `${key} must contain at least one URI` });
  }
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || !isLocalSourceUri(item)) {
      issues.push({
        path: `${parentPath}.${key}[${index}]`,
        message: `${key} values must use fixture://ingest-search/ local source URI form`,
      });
    }
  }
}

function requireChecksumArray(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
  nonEmpty: boolean,
): void {
  const value = record[key];
  if (!Array.isArray(value)) {
    issues.push({ path: `${parentPath}.${key}`, message: `${key} must be an array` });
    return;
  }
  if (nonEmpty && value.length === 0) {
    issues.push({ path: `${parentPath}.${key}`, message: `${key} must contain at least one checksum` });
  }
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || !isChecksum(item)) {
      issues.push({
        path: `${parentPath}.${key}[${index}]`,
        message: `${key} values must be lowercase sha256 digests`,
      });
    }
  }
}

function validateStringArrayItems(value: readonly unknown[], path: string, issues: ValidationIssue[]): void {
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || item.trim().length === 0) {
      issues.push({ path: `${path}[${index}]`, message: "array values must be non-empty strings" });
    }
  }
}

function hasSafePathTail(path: string): boolean {
  if (path.length === 0 || path.includes("\\") || path.startsWith("/") || path.endsWith("/")) {
    return false;
  }
  return path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
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
  return `ingest audit evidence validation failed: ${details}`;
}

const topLevelKeys = [
  "schemaVersion",
  "generatedAt",
  "workspaceId",
  "sessionId",
  "localOnly",
  "evidenceSummary",
  "evidenceFiles",
  "sourceSnapshots",
  "citationEvidence",
  "quarantineDecisions",
  "apiRequestTrace",
  "clientSessionTrace",
] as const;

const evidenceSummaryKeys = [
  "sourceCount",
  "evidenceFileCount",
  "citationCount",
  "quarantineDecisionCount",
  "apiRequestTraceCount",
  "clientSessionTraceCount",
] as const;

const evidenceFileKeys = ["id", "fixturePath", "schemaVersion", "sha256"] as const;

const sourceSnapshotKeys = [
  "sourceUri",
  "path",
  "mediaType",
  "checksum",
  "repositoryState",
  "logEntryIds",
  "indexDocumentIds",
  "quarantineItemIds",
] as const;

const citationEvidenceKeys = [
  "id",
  "kind",
  "documentId",
  "quarantineItemId",
  "sourceUri",
  "checksum",
  "range",
  "trusted",
] as const;

const citationRangeKeys = ["start_line", "end_line", "path", "row", "column"] as const;

const quarantineDecisionKeys = [
  "decisionId",
  "requestId",
  "itemId",
  "sourceUri",
  "checksum",
  "fromState",
  "toState",
  "actorId",
  "action",
  "reason",
  "decidedAt",
  "override",
] as const;

const apiRequestTraceKeys = [
  "requestId",
  "fixtureFileId",
  "method",
  "path",
  "responseStatus",
  "sourceUris",
  "checksums",
  "documentIds",
  "quarantineItemIds",
] as const;

const clientSessionTraceKeys = [
  "traceId",
  "fixtureFileId",
  "kind",
  "method",
  "routePath",
  "command",
  "relatedRequestIds",
  "sourceUris",
  "documentIds",
  "quarantineItemIds",
] as const;
