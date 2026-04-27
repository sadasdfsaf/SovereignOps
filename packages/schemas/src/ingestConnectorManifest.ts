export const INGEST_CONNECTOR_MANIFEST_SCHEMA_VERSION = "ingest-connector-manifest/v1";
export const INGEST_CONNECTOR_MANIFEST_JSON_SCHEMA_DRAFT =
  "https://json-schema.org/draft/2020-12/schema";

export const ingestConnectorIds = ["markdown", "json", "csv", "log", "repository"] as const;
export type IngestConnectorId = (typeof ingestConnectorIds)[number];

export const ingestConnectorSourceKinds = ["file", "directory", "stream", "record"] as const;
export type IngestConnectorSourceKind = (typeof ingestConnectorSourceKinds)[number];

export const ingestConnectorCitationKinds = [
  "line-range",
  "json-path",
  "table-cell",
  "row",
  "file-path",
  "timestamp",
] as const;
export type IngestConnectorCitationKind = (typeof ingestConnectorCitationKinds)[number];

export const ingestConnectorValidationModes = [
  "syntax",
  "required-columns",
  "unique-columns",
  "path-boundary",
  "media-type",
  "size-limit",
  "utf8-decode",
  "safety-scan",
] as const;
export type IngestConnectorValidationMode = (typeof ingestConnectorValidationModes)[number];

export const ingestConnectorSafetyFindingKinds = [
  "embedded-instruction-override",
  "embedded-prompt-reference",
  "path-traversal",
  "private-path",
  "raw-secret",
] as const;
export type IngestConnectorSafetyFindingKind = (typeof ingestConnectorSafetyFindingKinds)[number];

export interface IngestConnectorProfile {
  id: IngestConnectorId;
  display_name: string;
  description: string;
  source_kinds: readonly IngestConnectorSourceKind[];
  media_types: readonly string[];
  citation_kinds: readonly IngestConnectorCitationKind[];
  validation_modes: readonly IngestConnectorValidationMode[];
  safety_finding_kinds: readonly IngestConnectorSafetyFindingKind[];
  default_untrusted: true;
  local_only: true;
  network_access: false;
  reads_files: boolean;
  requires_approval: boolean;
}

export interface IngestConnectorManifest {
  schema_version: typeof INGEST_CONNECTOR_MANIFEST_SCHEMA_VERSION;
  generated_by: string;
  connectors: readonly IngestConnectorProfile[];
}

export interface IngestConnectorManifestValidationIssue {
  path: string;
  message: string;
}

export interface IngestConnectorManifestValidationResult<TRecord = unknown> {
  ok: boolean;
  issues: IngestConnectorManifestValidationIssue[];
  value?: TRecord;
}

export type IngestConnectorManifestJsonSchemaType =
  | "array"
  | "boolean"
  | "integer"
  | "null"
  | "number"
  | "object"
  | "string";

export interface IngestConnectorManifestJsonSchema {
  readonly $schema?: string;
  readonly $id?: string;
  readonly title?: string;
  readonly type?: IngestConnectorManifestJsonSchemaType | readonly IngestConnectorManifestJsonSchemaType[];
  readonly additionalProperties?: boolean | IngestConnectorManifestJsonSchema;
  readonly properties?: Record<string, IngestConnectorManifestJsonSchema>;
  readonly required?: readonly string[];
  readonly enum?: readonly (string | number | boolean | null)[];
  readonly pattern?: string;
  readonly const?: string | number | boolean | null;
  readonly minLength?: number;
  readonly minItems?: number;
  readonly uniqueItems?: boolean;
  readonly items?: IngestConnectorManifestJsonSchema;
}

const MEDIA_TYPE_PATTERN = "^[^\\s/]+/[^\\s]+$";
const SAFE_STRING_PATTERN = "^(?!.*(?:E:|C:|/Users/|/home/|\\\\Users\\\\|secret|token|password|apikey|api_key)).*\\S.*$";

const connectorProfileSchema = objectSchema(
  "Ingest connector profile",
  {
    id: enumSchema(ingestConnectorIds),
    display_name: safeStringSchema(),
    description: safeStringSchema(),
    source_kinds: enumArraySchema(ingestConnectorSourceKinds, true),
    media_types: mediaTypeArraySchema(),
    citation_kinds: enumArraySchema(ingestConnectorCitationKinds, true),
    validation_modes: enumArraySchema(ingestConnectorValidationModes, true),
    safety_finding_kinds: enumArraySchema(ingestConnectorSafetyFindingKinds, true),
    default_untrusted: constBooleanSchema(true),
    local_only: constBooleanSchema(true),
    network_access: constBooleanSchema(false),
    reads_files: { type: "boolean" },
    requires_approval: { type: "boolean" },
  },
  [
    "id",
    "display_name",
    "description",
    "source_kinds",
    "media_types",
    "citation_kinds",
    "validation_modes",
    "safety_finding_kinds",
    "default_untrusted",
    "local_only",
    "network_access",
    "reads_files",
    "requires_approval",
  ],
  "profile",
);

export const ingestConnectorManifestSchema = objectSchema(
  "Ingest connector manifest",
  {
    schema_version: {
      type: "string",
      const: INGEST_CONNECTOR_MANIFEST_SCHEMA_VERSION,
      enum: [INGEST_CONNECTOR_MANIFEST_SCHEMA_VERSION],
    },
    generated_by: safeStringSchema(),
    connectors: {
      type: "array",
      minItems: ingestConnectorIds.length,
      items: connectorProfileSchema,
    },
  },
  ["schema_version", "generated_by", "connectors"],
  "manifest",
);

export const ingestConnectorProfileSchema = connectorProfileSchema;

export const ingestConnectorManifestSchemas = {
  profile: ingestConnectorProfileSchema,
  manifest: ingestConnectorManifestSchema,
} as const;

export function getIngestConnectorManifestSchema(
  kind: keyof typeof ingestConnectorManifestSchemas,
): IngestConnectorManifestJsonSchema {
  return ingestConnectorManifestSchemas[kind];
}

export function isIngestConnectorId(value: unknown): value is IngestConnectorId {
  return isOneOf(value, ingestConnectorIds);
}

export function validateIngestConnectorProfile(
  value: unknown,
): IngestConnectorManifestValidationResult<IngestConnectorProfile> {
  const issues = recordIssues(value, "$");
  if (issues.length > 0) {
    return invalid(issues);
  }
  const record = value as Record<string, unknown>;

  requireEnum(record, "id", ingestConnectorIds, issues);
  requireSafeString(record, "display_name", issues);
  requireSafeString(record, "description", issues);
  requireEnumArray(record, "source_kinds", ingestConnectorSourceKinds, true, issues);
  requireMediaTypeArray(record, "media_types", true, issues);
  requireEnumArray(record, "citation_kinds", ingestConnectorCitationKinds, true, issues);
  requireEnumArray(record, "validation_modes", ingestConnectorValidationModes, true, issues);
  requireEnumArray(record, "safety_finding_kinds", ingestConnectorSafetyFindingKinds, true, issues);
  requireConstBoolean(record, "default_untrusted", true, issues);
  requireConstBoolean(record, "local_only", true, issues);
  requireConstBoolean(record, "network_access", false, issues);
  requireBoolean(record, "reads_files", issues);
  requireBoolean(record, "requires_approval", issues);

  return validationResult(value, issues);
}

export function validateIngestConnectorManifest(
  value: unknown,
): IngestConnectorManifestValidationResult<IngestConnectorManifest> {
  const issues = recordIssues(value, "$");
  if (issues.length > 0) {
    return invalid(issues);
  }
  const record = value as Record<string, unknown>;

  if (record.schema_version !== INGEST_CONNECTOR_MANIFEST_SCHEMA_VERSION) {
    issues.push({
      path: "schema_version",
      message: `schema_version must be ${INGEST_CONNECTOR_MANIFEST_SCHEMA_VERSION}`,
    });
  }
  requireSafeString(record, "generated_by", issues);

  const connectors = record.connectors;
  if (!Array.isArray(connectors)) {
    issues.push({ path: "connectors", message: "connectors must be an array" });
    return invalid(issues);
  }
  if (connectors.length === 0) {
    issues.push({ path: "connectors", message: "connectors must not be empty" });
  }

  const seen = new Set<string>();
  for (const [index, connector] of connectors.entries()) {
    const nested = validateIngestConnectorProfile(connector);
    appendNestedIssues(nested.issues, `connectors[${index}]`, issues);

    if (isRecord(connector) && typeof connector.id === "string") {
      if (seen.has(connector.id)) {
        issues.push({ path: `connectors[${index}].id`, message: "connector ids must be unique" });
      }
      seen.add(connector.id);
    }
  }

  for (const connectorId of ingestConnectorIds) {
    if (!seen.has(connectorId)) {
      issues.push({ path: "connectors", message: `connectors must include ${connectorId}` });
    }
  }

  return validationResult(value, issues);
}

export function assertIngestConnectorProfile(
  value: unknown,
): asserts value is IngestConnectorProfile {
  const result = validateIngestConnectorProfile(value);
  if (!result.ok) {
    throw new Error(formatValidationIssues("ingest connector profile", result.issues));
  }
}

export function assertIngestConnectorManifest(
  value: unknown,
): asserts value is IngestConnectorManifest {
  const result = validateIngestConnectorManifest(value);
  if (!result.ok) {
    throw new Error(formatValidationIssues("ingest connector manifest", result.issues));
  }
}

function objectSchema(
  title: string,
  properties: Record<string, IngestConnectorManifestJsonSchema>,
  required: readonly string[],
  slug: string,
): IngestConnectorManifestJsonSchema {
  return {
    $schema: INGEST_CONNECTOR_MANIFEST_JSON_SCHEMA_DRAFT,
    $id: `https://schemas.sovereignops.local/ingest-connectors/${slug}.schema.json`,
    title,
    type: "object",
    additionalProperties: false,
    required,
    properties,
  };
}

function enumSchema(values: readonly string[]): IngestConnectorManifestJsonSchema {
  return {
    type: "string",
    enum: values,
  };
}

function enumArraySchema(
  values: readonly string[],
  uniqueItems: boolean,
): IngestConnectorManifestJsonSchema {
  return {
    type: "array",
    minItems: 1,
    uniqueItems,
    items: enumSchema(values),
  };
}

function constBooleanSchema(value: boolean): IngestConnectorManifestJsonSchema {
  return {
    type: "boolean",
    const: value,
    enum: [value],
  };
}

function safeStringSchema(): IngestConnectorManifestJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: SAFE_STRING_PATTERN,
  };
}

function mediaTypeArraySchema(): IngestConnectorManifestJsonSchema {
  return {
    type: "array",
    minItems: 1,
    uniqueItems: true,
    items: {
      type: "string",
      minLength: 1,
      pattern: MEDIA_TYPE_PATTERN,
    },
  };
}

function recordIssues(
  value: unknown,
  path: string,
): IngestConnectorManifestValidationIssue[] {
  if (!isRecord(value)) {
    return [{ path, message: "record must be an object" }];
  }
  return [];
}

function invalid<TRecord>(
  issues: IngestConnectorManifestValidationIssue[],
): IngestConnectorManifestValidationResult<TRecord> {
  return { ok: false, issues };
}

function validationResult<TRecord>(
  value: unknown,
  issues: IngestConnectorManifestValidationIssue[],
): IngestConnectorManifestValidationResult<TRecord> {
  return issues.length === 0
    ? { ok: true, issues, value: value as TRecord }
    : { ok: false, issues };
}

function requireSafeString(
  record: Record<string, unknown>,
  key: string,
  issues: IngestConnectorManifestValidationIssue[],
): void {
  const value = record[key];
  if (typeof value !== "string" || !isSafeString(value)) {
    issues.push({ path: key, message: `${key} must be a non-empty safe string` });
  }
}

function requireBoolean(
  record: Record<string, unknown>,
  key: string,
  issues: IngestConnectorManifestValidationIssue[],
): void {
  if (typeof record[key] !== "boolean") {
    issues.push({ path: key, message: `${key} must be a boolean` });
  }
}

function requireConstBoolean(
  record: Record<string, unknown>,
  key: string,
  expected: boolean,
  issues: IngestConnectorManifestValidationIssue[],
): void {
  if (record[key] !== expected) {
    issues.push({ path: key, message: `${key} must be ${expected}` });
  }
}

function requireEnum<TValue extends string>(
  record: Record<string, unknown>,
  key: string,
  allowed: readonly TValue[],
  issues: IngestConnectorManifestValidationIssue[],
): void {
  if (!allowed.includes(record[key] as TValue)) {
    issues.push({ path: key, message: `${key} must be one of ${allowed.join(", ")}` });
  }
}

function requireEnumArray<TValue extends string>(
  record: Record<string, unknown>,
  key: string,
  allowed: readonly TValue[],
  nonEmpty: boolean,
  issues: IngestConnectorManifestValidationIssue[],
): void {
  requireArrayWith(
    record,
    key,
    (value) => (allowed as readonly string[]).includes(value),
    nonEmpty,
    "supported value",
    issues,
  );
}

function requireMediaTypeArray(
  record: Record<string, unknown>,
  key: string,
  nonEmpty: boolean,
  issues: IngestConnectorManifestValidationIssue[],
): void {
  requireArrayWith(record, key, isMediaType, nonEmpty, "media type", issues);
}

function requireArrayWith(
  record: Record<string, unknown>,
  key: string,
  predicate: (value: string) => boolean,
  nonEmpty: boolean,
  label: string,
  issues: IngestConnectorManifestValidationIssue[],
): void {
  const value = record[key];
  if (!Array.isArray(value)) {
    issues.push({ path: key, message: `${key} must be an array` });
    return;
  }
  if (nonEmpty && value.length === 0) {
    issues.push({ path: key, message: `${key} must not be empty` });
  }

  const seen = new Set<string>();
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || !predicate(item)) {
      issues.push({ path: `${key}[${index}]`, message: `${key} values must be a valid ${label}` });
      continue;
    }
    if (seen.has(item)) {
      issues.push({ path: `${key}[${index}]`, message: `${key} values must be unique` });
    }
    seen.add(item);
  }
}

function appendNestedIssues(
  nestedIssues: readonly IngestConnectorManifestValidationIssue[],
  prefix: string,
  issues: IngestConnectorManifestValidationIssue[],
): void {
  for (const issue of nestedIssues) {
    issues.push({
      path: issue.path === "$" ? prefix : `${prefix}.${issue.path}`,
      message: issue.message,
    });
  }
}

function isOneOf<TValue extends string>(value: unknown, allowed: readonly TValue[]): value is TValue {
  return typeof value === "string" && allowed.includes(value as TValue);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMediaType(value: string): boolean {
  return /^[^\s/]+\/[^\s]+$/.test(value);
}

function isSafeString(value: string): boolean {
  if (value.trim().length === 0) {
    return false;
  }
  return !/(?:E:|C:|\/Users\/|\/home\/|\\Users\\|secret|token|password|apikey|api_key)/i.test(value);
}

function formatValidationIssues(
  label: string,
  issues: readonly IngestConnectorManifestValidationIssue[],
): string {
  const details = issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
  return `${label} validation failed: ${details}`;
}
