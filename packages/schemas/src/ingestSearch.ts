export const INGEST_SEARCH_SCHEMA_VERSION = 1;
export const JSON_SCHEMA_DRAFT = "https://json-schema.org/draft/2020-12/schema";

export const ingestSearchKinds = [
  "repositorySourceSnapshot",
  "logSourceSnapshot",
  "normalizedDocument",
  "searchQuery",
  "searchResult",
  "quarantineRecord",
  "quarantineDecision",
] as const;
export type IngestSearchKind = (typeof ingestSearchKinds)[number];

export const QUARANTINE_STATES = ["open", "released", "rejected"] as const;
export type QuarantineState = (typeof QUARANTINE_STATES)[number];

export const QUARANTINE_ACTIONS = ["release", "reject"] as const;
export type QuarantineAction = (typeof QUARANTINE_ACTIONS)[number];

export const QUARANTINE_SEVERITIES = ["notice", "low", "medium", "high", "critical"] as const;
export type QuarantineSeverity = (typeof QUARANTINE_SEVERITIES)[number];

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue };

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult<TRecord = unknown> {
  ok: boolean;
  issues: ValidationIssue[];
  value?: TRecord;
}

export interface CitationRange {
  start_line?: number;
  end_line?: number;
  path?: string;
  row?: number;
  column?: number | string;
}

export interface CitationSnapshot {
  source_uri: string;
  range: CitationRange;
  trusted: boolean;
}

export interface RepositorySourceSnapshot {
  source_uri: string;
  relative_path: string;
  media_type: string;
  size_bytes: number;
  checksum: string;
  citation: CitationSnapshot;
  metadata: JsonObject;
  content?: string;
}

export interface LogSourceSnapshot {
  source_uri: string;
  content: string;
  media_type: string;
  message: string;
  citation: CitationSnapshot;
  metadata: JsonObject;
  timestamp?: string;
  level?: string;
}

export interface NormalizedDocument {
  source_uri: string;
  checksum: string;
  normalized_text: string;
  untrusted: boolean;
}

export interface SearchIndexDocument {
  source_uri: string;
  content: string;
  media_type: string;
  citation: CitationSnapshot;
  checksum: string;
  tags: readonly string[];
  metadata: JsonObject;
  updated_at?: string;
}

export interface SearchQuery {
  text: string;
  tags: readonly string[];
  media_types: readonly string[];
  source_uris: readonly string[];
  limit: number;
}

export interface SearchResult {
  document: SearchIndexDocument;
  score: number;
  matched_terms: readonly string[];
  snippet: string;
  citation: CitationSnapshot;
}

export interface QuarantineDecision {
  action: QuarantineAction;
  actor_id: string;
  timestamp: string;
  reason: string;
  from_state: QuarantineState;
  to_state: QuarantineState;
  override: boolean;
  audit_event_summary: JsonObject;
}

export interface QuarantineRecord {
  id: `q_${string}`;
  source_uri: string;
  reason_codes: readonly string[];
  severity: QuarantineSeverity;
  citation_snapshots: readonly CitationSnapshot[];
  suggested_next_action: string;
  preview_text: string;
  state: QuarantineState;
  decisions: readonly QuarantineDecision[];
}

export interface IngestSearchRecordByKind {
  repositorySourceSnapshot: RepositorySourceSnapshot;
  logSourceSnapshot: LogSourceSnapshot;
  normalizedDocument: NormalizedDocument;
  searchQuery: SearchQuery;
  searchResult: SearchResult;
  quarantineRecord: QuarantineRecord;
  quarantineDecision: QuarantineDecision;
}

export type IngestSearchRecord = IngestSearchRecordByKind[IngestSearchKind];

export type JsonSchemaType = "array" | "boolean" | "integer" | "null" | "number" | "object" | "string";

export interface IngestSearchJsonSchema {
  readonly $schema?: string;
  readonly $id?: string;
  readonly title?: string;
  readonly type?: JsonSchemaType | readonly JsonSchemaType[];
  readonly additionalProperties?: boolean | IngestSearchJsonSchema;
  readonly properties?: Record<string, IngestSearchJsonSchema>;
  readonly required?: readonly string[];
  readonly enum?: readonly (string | number | boolean | null)[];
  readonly pattern?: string;
  readonly minLength?: number;
  readonly minimum?: number;
  readonly minItems?: number;
  readonly items?: IngestSearchJsonSchema;
  readonly oneOf?: readonly IngestSearchJsonSchema[];
}

export interface IngestSearchSchemaDefinition {
  kind: IngestSearchKind;
  title: string;
  schema: IngestSearchJsonSchema;
}

const HEX_SHA256_PATTERN = "^[a-f0-9]{64}$";
const QUARANTINE_ID_PATTERN = "^q_[a-f0-9]{20}$";
const SOURCE_URI_PATTERN = "^[^\\s:]+:\\S*$";
const MEDIA_TYPE_PATTERN = "^[^\\s/]+/[^\\s]+$";
const RELATIVE_PATH_PATTERN = "^(?!/)(?!.*(?:^|/)\\.\\.(?:/|$))[^\\\\]+$";

const citationRangeSchema = objectSchema(
  "Citation range",
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

const citationSchema = objectSchema(
  "Citation",
  {
    source_uri: sourceUriSchema(),
    range: citationRangeSchema,
    trusted: { type: "boolean" },
  },
  ["source_uri", "range", "trusted"],
);

const jsonObjectSchema: IngestSearchJsonSchema = {
  type: "object",
  additionalProperties: true,
};

const searchIndexDocumentSchema = objectSchema(
  "Search index document",
  {
    source_uri: sourceUriSchema(),
    content: { type: "string" },
    media_type: mediaTypeSchema(),
    citation: citationSchema,
    checksum: checksumSchema(),
    tags: stringArraySchema(),
    metadata: jsonObjectSchema,
    updated_at: nonBlankStringSchema(),
  },
  ["source_uri", "content", "media_type", "citation", "checksum", "tags", "metadata"],
);

const quarantineDecisionSchema = objectSchema(
  "Quarantine decision",
  {
    action: enumSchema(QUARANTINE_ACTIONS),
    actor_id: nonBlankStringSchema(),
    timestamp: nonBlankStringSchema(),
    reason: nonBlankStringSchema(),
    from_state: enumSchema(QUARANTINE_STATES),
    to_state: enumSchema(QUARANTINE_STATES),
    override: { type: "boolean" },
    audit_event_summary: jsonObjectSchema,
  },
  [
    "action",
    "actor_id",
    "timestamp",
    "reason",
    "from_state",
    "to_state",
    "override",
    "audit_event_summary",
  ],
);

export const ingestSearchSchemas = {
  repositorySourceSnapshot: objectSchema(
    "Repository source snapshot",
    {
      source_uri: sourceUriSchema(),
      relative_path: relativePathSchema(),
      media_type: mediaTypeSchema(),
      size_bytes: nonNegativeIntegerSchema(),
      checksum: checksumSchema(),
      citation: citationSchema,
      metadata: jsonObjectSchema,
      content: { type: "string" },
    },
    [
      "source_uri",
      "relative_path",
      "media_type",
      "size_bytes",
      "checksum",
      "citation",
      "metadata",
    ],
    "repository-source-snapshot",
  ),
  logSourceSnapshot: objectSchema(
    "Log source snapshot",
    {
      source_uri: sourceUriSchema(),
      content: { type: "string" },
      media_type: mediaTypeSchema(),
      message: { type: "string" },
      citation: citationSchema,
      metadata: jsonObjectSchema,
      timestamp: nonBlankStringSchema(),
      level: nonBlankStringSchema(),
    },
    ["source_uri", "content", "media_type", "message", "citation", "metadata"],
    "log-source-snapshot",
  ),
  normalizedDocument: objectSchema(
    "Normalized document",
    {
      source_uri: sourceUriSchema(),
      checksum: checksumSchema(),
      normalized_text: { type: "string" },
      untrusted: { type: "boolean" },
    },
    ["source_uri", "checksum", "normalized_text", "untrusted"],
    "normalized-document",
  ),
  searchQuery: objectSchema(
    "Search query",
    {
      text: { type: "string" },
      tags: stringArraySchema(),
      media_types: mediaTypeArraySchema(),
      source_uris: sourceUriArraySchema(),
      limit: positiveIntegerSchema(),
    },
    ["text", "tags", "media_types", "source_uris", "limit"],
    "search-query",
  ),
  searchResult: objectSchema(
    "Search result",
    {
      document: searchIndexDocumentSchema,
      score: nonNegativeIntegerSchema(),
      matched_terms: nonEmptyStringArraySchema(),
      snippet: { type: "string" },
      citation: citationSchema,
    },
    ["document", "score", "matched_terms", "snippet", "citation"],
    "search-result",
  ),
  quarantineRecord: objectSchema(
    "Quarantine record",
    {
      id: {
        type: "string",
        pattern: QUARANTINE_ID_PATTERN,
      },
      source_uri: sourceUriSchema(),
      reason_codes: nonEmptyStringArraySchema(),
      severity: enumSchema(QUARANTINE_SEVERITIES),
      citation_snapshots: {
        type: "array",
        minItems: 1,
        items: citationSchema,
      },
      suggested_next_action: nonBlankStringSchema(),
      preview_text: { type: "string" },
      state: enumSchema(QUARANTINE_STATES),
      decisions: {
        type: "array",
        items: quarantineDecisionSchema,
      },
    },
    [
      "id",
      "source_uri",
      "reason_codes",
      "severity",
      "citation_snapshots",
      "suggested_next_action",
      "preview_text",
      "state",
      "decisions",
    ],
    "quarantine-record",
  ),
  quarantineDecision: withSchemaId(quarantineDecisionSchema, "quarantine-decision"),
} as const satisfies Record<IngestSearchKind, IngestSearchJsonSchema>;

export const ingestSearchSchemaDefinitions = ingestSearchKinds.map((kind) => ({
  kind,
  title: ingestSearchSchemas[kind].title ?? kind,
  schema: ingestSearchSchemas[kind],
})) as readonly IngestSearchSchemaDefinition[];

export const ingestSearchValidators = {
  repositorySourceSnapshot: validateRepositorySourceSnapshot,
  logSourceSnapshot: validateLogSourceSnapshot,
  normalizedDocument: validateNormalizedDocument,
  searchQuery: validateSearchQuery,
  searchResult: validateSearchResult,
  quarantineRecord: validateQuarantineRecord,
  quarantineDecision: validateQuarantineDecision,
} as const;

export function isIngestSearchKind(value: unknown): value is IngestSearchKind {
  return typeof value === "string" && ingestSearchKinds.includes(value as IngestSearchKind);
}

export function getIngestSearchSchema(kind: IngestSearchKind): IngestSearchJsonSchema {
  return ingestSearchSchemas[kind];
}

export function validateIngestSearchObject<K extends IngestSearchKind>(
  kind: K,
  value: unknown,
): ValidationResult<IngestSearchRecordByKind[K]> {
  const validator = ingestSearchValidators[kind] as (
    candidate: unknown,
  ) => ValidationResult<IngestSearchRecordByKind[K]>;
  return validator(value);
}

export function assertIngestSearchObject<K extends IngestSearchKind>(
  kind: K,
  value: unknown,
): asserts value is IngestSearchRecordByKind[K] {
  const result = validateIngestSearchObject(kind, value);
  if (!result.ok) {
    throw new Error(formatValidationIssues(kind, result.issues));
  }
}

export function validateRepositorySourceSnapshot(
  value: unknown,
): ValidationResult<RepositorySourceSnapshot> {
  const issues = recordIssues(value, "$");
  if (issues.length > 0) {
    return invalid(issues);
  }
  const record = value as Record<string, unknown>;

  requireSourceUri(record, "source_uri", issues);
  requireRelativePath(record, "relative_path", issues);
  requireMediaType(record, "media_type", issues);
  requireChecksum(record, "checksum", issues);
  requireNonNegativeInteger(record, "size_bytes", issues);
  requireCitation(record, "citation", issues);
  requireJsonObject(record, "metadata", issues);
  optionalString(record, "content", issues);

  return validationResult(value, issues);
}

export function validateLogSourceSnapshot(value: unknown): ValidationResult<LogSourceSnapshot> {
  const issues = recordIssues(value, "$");
  if (issues.length > 0) {
    return invalid(issues);
  }
  const record = value as Record<string, unknown>;

  requireSourceUri(record, "source_uri", issues);
  requireString(record, "content", issues);
  requireMediaType(record, "media_type", issues);
  requireString(record, "message", issues);
  requireCitation(record, "citation", issues);
  requireJsonObject(record, "metadata", issues);
  optionalNonEmptyString(record, "timestamp", issues);
  optionalNonEmptyString(record, "level", issues);

  return validationResult(value, issues);
}

export function validateNormalizedDocument(value: unknown): ValidationResult<NormalizedDocument> {
  const issues = recordIssues(value, "$");
  if (issues.length > 0) {
    return invalid(issues);
  }
  const record = value as Record<string, unknown>;

  requireSourceUri(record, "source_uri", issues);
  requireChecksum(record, "checksum", issues);
  requireString(record, "normalized_text", issues);
  requireBoolean(record, "untrusted", issues);

  return validationResult(value, issues);
}

export function validateSearchIndexDocument(value: unknown): ValidationResult<SearchIndexDocument> {
  const issues = recordIssues(value, "$");
  if (issues.length > 0) {
    return invalid(issues);
  }
  const record = value as Record<string, unknown>;

  requireSourceUri(record, "source_uri", issues);
  requireString(record, "content", issues);
  requireMediaType(record, "media_type", issues);
  requireCitation(record, "citation", issues);
  requireChecksum(record, "checksum", issues);
  requireStringArray(record, "tags", issues);
  requireJsonObject(record, "metadata", issues);
  optionalNonEmptyString(record, "updated_at", issues);

  return validationResult(value, issues);
}

export function validateSearchQuery(value: unknown): ValidationResult<SearchQuery> {
  const issues = recordIssues(value, "$");
  if (issues.length > 0) {
    return invalid(issues);
  }
  const record = value as Record<string, unknown>;

  requireString(record, "text", issues);
  requireStringArray(record, "tags", issues);
  requireMediaTypeArray(record, "media_types", issues);
  requireSourceUriArray(record, "source_uris", issues);
  requirePositiveInteger(record, "limit", issues);

  return validationResult(value, issues);
}

export function validateSearchResult(value: unknown): ValidationResult<SearchResult> {
  const issues = recordIssues(value, "$");
  if (issues.length > 0) {
    return invalid(issues);
  }
  const record = value as Record<string, unknown>;

  appendNestedIssues(validateSearchIndexDocument(record.document).issues, "document", issues);
  requireNonNegativeInteger(record, "score", issues);
  requireNonEmptyStringArray(record, "matched_terms", issues);
  requireString(record, "snippet", issues);
  requireCitation(record, "citation", issues);

  return validationResult(value, issues);
}

export function validateQuarantineRecord(value: unknown): ValidationResult<QuarantineRecord> {
  const issues = recordIssues(value, "$");
  if (issues.length > 0) {
    return invalid(issues);
  }
  const record = value as Record<string, unknown>;

  requirePattern(record, "id", QUARANTINE_ID_PATTERN, "id must use the q_ case id shape", issues);
  requireSourceUri(record, "source_uri", issues);
  requireNonEmptyStringArray(record, "reason_codes", issues);
  requireEnum(record, "severity", QUARANTINE_SEVERITIES, issues);
  requireCitationArray(record, "citation_snapshots", issues, true);
  requireNonEmptyString(record, "suggested_next_action", issues);
  requireString(record, "preview_text", issues);
  requireEnum(record, "state", QUARANTINE_STATES, issues);
  requireDecisionArray(record, "decisions", issues);

  return validationResult(value, issues);
}

export function validateQuarantineDecision(value: unknown): ValidationResult<QuarantineDecision> {
  const issues = recordIssues(value, "$");
  if (issues.length > 0) {
    return invalid(issues);
  }
  const record = value as Record<string, unknown>;

  requireEnum(record, "action", QUARANTINE_ACTIONS, issues);
  requireNonEmptyString(record, "actor_id", issues);
  requireNonEmptyString(record, "timestamp", issues);
  requireNonEmptyString(record, "reason", issues);
  requireEnum(record, "from_state", QUARANTINE_STATES, issues);
  requireEnum(record, "to_state", QUARANTINE_STATES, issues);
  requireBoolean(record, "override", issues);
  requireJsonObject(record, "audit_event_summary", issues);

  if (record.action === "release" && record.to_state !== "released") {
    issues.push({ path: "to_state", message: "release decisions must end in released" });
  }
  if (record.action === "reject" && record.to_state !== "rejected") {
    issues.push({ path: "to_state", message: "reject decisions must end in rejected" });
  }

  return validationResult(value, issues);
}

function objectSchema(
  title: string,
  properties: Record<string, IngestSearchJsonSchema>,
  required: readonly string[],
  slug?: string,
): IngestSearchJsonSchema {
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

function withSchemaId(schema: IngestSearchJsonSchema, slug: string): IngestSearchJsonSchema {
  return {
    ...schema,
    $schema: JSON_SCHEMA_DRAFT,
    $id: `https://schemas.sovereignops.local/ingest-search/${slug}.schema.json`,
  };
}

function sourceUriSchema(): IngestSearchJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: SOURCE_URI_PATTERN,
  };
}

function relativePathSchema(): IngestSearchJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: RELATIVE_PATH_PATTERN,
  };
}

function mediaTypeSchema(): IngestSearchJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: MEDIA_TYPE_PATTERN,
  };
}

function checksumSchema(): IngestSearchJsonSchema {
  return {
    type: "string",
    pattern: HEX_SHA256_PATTERN,
  };
}

function enumSchema(values: readonly (string | number | boolean | null)[]): IngestSearchJsonSchema {
  return {
    type: typeof values[0] === "string" ? "string" : undefined,
    enum: values,
  };
}

function nonBlankStringSchema(): IngestSearchJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: "\\S",
  };
}

function positiveIntegerSchema(): IngestSearchJsonSchema {
  return {
    type: "integer",
    minimum: 1,
  };
}

function nonNegativeIntegerSchema(): IngestSearchJsonSchema {
  return {
    type: "integer",
    minimum: 0,
  };
}

function stringArraySchema(): IngestSearchJsonSchema {
  return {
    type: "array",
    items: nonBlankStringSchema(),
  };
}

function nonEmptyStringArraySchema(): IngestSearchJsonSchema {
  return {
    type: "array",
    minItems: 1,
    items: nonBlankStringSchema(),
  };
}

function mediaTypeArraySchema(): IngestSearchJsonSchema {
  return {
    type: "array",
    items: mediaTypeSchema(),
  };
}

function sourceUriArraySchema(): IngestSearchJsonSchema {
  return {
    type: "array",
    items: sourceUriSchema(),
  };
}

function recordIssues(value: unknown, path: string): ValidationIssue[] | undefined {
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
    ? { ok: true, issues, value: value as TRecord }
    : { ok: false, issues };
}

function requireSourceUri(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
): void {
  const value = record[key];
  if (typeof value !== "string" || !isSourceUri(value)) {
    issues.push({ path: key, message: `${key} must be a non-empty URI without whitespace` });
  }
}

function requireRelativePath(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
): void {
  const value = record[key];
  if (typeof value !== "string" || !isRelativePath(value)) {
    issues.push({ path: key, message: `${key} must be a safe relative path` });
  }
}

function requireMediaType(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
): void {
  const value = record[key];
  if (typeof value !== "string" || !isMediaType(value)) {
    issues.push({ path: key, message: `${key} must be a media type` });
  }
}

function requireChecksum(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
): void {
  const value = record[key];
  if (typeof value !== "string" || !isChecksum(value)) {
    issues.push({ path: key, message: `${key} must be a lowercase sha256 digest` });
  }
}

function requireString(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
): void {
  if (typeof record[key] !== "string") {
    issues.push({ path: key, message: `${key} must be a string` });
  }
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
): void {
  if (record[key] !== undefined && typeof record[key] !== "string") {
    issues.push({ path: key, message: `${key} must be a string when provided` });
  }
}

function requireNonEmptyString(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
): void {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push({ path: key, message: `${key} must be a non-empty string` });
  }
}

function optionalNonEmptyString(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
): void {
  const value = record[key];
  if (value !== undefined && (typeof value !== "string" || value.trim().length === 0)) {
    issues.push({ path: key, message: `${key} must be a non-empty string when provided` });
  }
}

function requireBoolean(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
): void {
  if (typeof record[key] !== "boolean") {
    issues.push({ path: key, message: `${key} must be a boolean` });
  }
}

function requireNonNegativeInteger(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
): void {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    issues.push({ path: key, message: `${key} must be a non-negative integer` });
  }
}

function requirePositiveInteger(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
): void {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    issues.push({ path: key, message: `${key} must be a positive integer` });
  }
}

function requirePattern(
  record: Record<string, unknown>,
  key: string,
  pattern: string,
  message: string,
  issues: ValidationIssue[],
): void {
  const value = record[key];
  if (typeof value !== "string" || !new RegExp(pattern).test(value)) {
    issues.push({ path: key, message });
  }
}

function requireEnum<TValue extends string>(
  record: Record<string, unknown>,
  key: string,
  allowed: readonly TValue[],
  issues: ValidationIssue[],
): void {
  if (!allowed.includes(record[key] as TValue)) {
    issues.push({ path: key, message: `${key} must be one of ${allowed.join(", ")}` });
  }
}

function requireJsonObject(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
): void {
  if (!isJsonObject(record[key])) {
    issues.push({ path: key, message: `${key} must be a JSON object` });
  }
}

function requireCitation(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
): void {
  const value = record[key];
  if (!isRecord(value)) {
    issues.push({ path: key, message: `${key} must be a citation object` });
    return;
  }

  const nested: ValidationIssue[] = [];
  requireSourceUri(value, "source_uri", nested);
  if (!isRecord(value.range)) {
    nested.push({ path: "range", message: "range must be an object" });
  } else {
    validateCitationRange(value.range, nested);
  }
  requireBoolean(value, "trusted", nested);
  appendNestedIssues(nested, key, issues);
}

function validateCitationRange(range: Record<string, unknown>, issues: ValidationIssue[]): void {
  optionalPositiveInteger(range, "start_line", issues);
  optionalPositiveInteger(range, "end_line", issues);
  optionalNonEmptyString(range, "path", issues);
  optionalPositiveInteger(range, "row", issues);

  const column = range.column;
  if (
    column !== undefined &&
    !(
      (typeof column === "number" && Number.isInteger(column) && column >= 1) ||
      (typeof column === "string" && column.trim().length > 0)
    )
  ) {
    issues.push({ path: "column", message: "column must be a positive integer or non-empty string" });
  }

  if (
    typeof range.start_line === "number" &&
    typeof range.end_line === "number" &&
    range.end_line < range.start_line
  ) {
    issues.push({ path: "end_line", message: "end_line must be greater than or equal to start_line" });
  }
}

function optionalPositiveInteger(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
): void {
  const value = record[key];
  if (value !== undefined && (typeof value !== "number" || !Number.isInteger(value) || value < 1)) {
    issues.push({ path: key, message: `${key} must be a positive integer when provided` });
  }
}

function requireStringArray(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
): void {
  const value = record[key];
  if (!Array.isArray(value)) {
    issues.push({ path: key, message: `${key} must be an array` });
    return;
  }
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || item.trim().length === 0) {
      issues.push({ path: `${key}[${index}]`, message: `${key} values must be non-empty strings` });
    }
  }
}

function requireNonEmptyStringArray(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
): void {
  const before = issues.length;
  requireStringArray(record, key, issues);
  if (issues.length === before && Array.isArray(record[key]) && record[key].length === 0) {
    issues.push({ path: key, message: `${key} must contain at least one value` });
  }
}

function requireMediaTypeArray(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
): void {
  requireArrayWith(record, key, issues, isMediaType, "media type");
}

function requireSourceUriArray(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
): void {
  requireArrayWith(record, key, issues, isSourceUri, "source URI");
}

function requireArrayWith(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  predicate: (value: string) => boolean,
  label: string,
): void {
  const value = record[key];
  if (!Array.isArray(value)) {
    issues.push({ path: key, message: `${key} must be an array` });
    return;
  }
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || !predicate(item)) {
      issues.push({ path: `${key}[${index}]`, message: `${key} values must be valid ${label}s` });
    }
  }
}

function requireCitationArray(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  nonEmpty: boolean,
): void {
  const value = record[key];
  if (!Array.isArray(value)) {
    issues.push({ path: key, message: `${key} must be an array` });
    return;
  }
  if (nonEmpty && value.length === 0) {
    issues.push({ path: key, message: `${key} must contain at least one citation` });
  }
  for (const [index, item] of value.entries()) {
    const nested: ValidationIssue[] = [];
    requireCitation({ item }, "item", nested);
    appendNestedIssues(nested.map((issue) => stripPathPrefix(issue, "item")), `${key}[${index}]`, issues);
  }
}

function requireDecisionArray(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
): void {
  const value = record[key];
  if (!Array.isArray(value)) {
    issues.push({ path: key, message: `${key} must be an array` });
    return;
  }
  for (const [index, item] of value.entries()) {
    appendNestedIssues(validateQuarantineDecision(item).issues, `${key}[${index}]`, issues);
  }
}

function appendNestedIssues(
  nestedIssues: readonly ValidationIssue[],
  prefix: string,
  issues: ValidationIssue[],
): void {
  for (const issue of nestedIssues) {
    issues.push({
      path: issue.path === "$" ? prefix : `${prefix}.${issue.path}`,
      message: issue.message,
    });
  }
}

function stripPathPrefix(issue: ValidationIssue, prefix: string): ValidationIssue {
  if (issue.path === prefix) {
    return { ...issue, path: "$" };
  }
  if (issue.path.startsWith(`${prefix}.`)) {
    return { ...issue, path: issue.path.slice(prefix.length + 1) };
  }
  return issue;
}

function isSourceUri(value: string): boolean {
  return value.trim() === value && value.length > 0 && !/\s/.test(value) && value.includes(":");
}

function isMediaType(value: string): boolean {
  return /^[^\s/]+\/[^\s]+$/.test(value);
}

function isRelativePath(value: string): boolean {
  if (value.trim().length === 0 || value.includes("\\") || value.startsWith("/")) {
    return false;
  }
  return !value.split("/").includes("..");
}

function isChecksum(value: string): boolean {
  return new RegExp(HEX_SHA256_PATTERN).test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  return isJsonObject(value);
}

function formatValidationIssues(kind: IngestSearchKind, issues: readonly ValidationIssue[]): string {
  const details = issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
  return `${kind} validation failed: ${details}`;
}
