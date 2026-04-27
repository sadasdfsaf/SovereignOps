export const INGEST_CONNECTOR_API_MANIFEST_SCHEMA_VERSION = "ingest-connector-manifest/v1";
export const INGEST_CONNECTOR_API_MANIFEST_JSON_SCHEMA_DRAFT =
  "https://json-schema.org/draft/2020-12/schema";

export const ingestConnectorApiCapabilities = [
  "ingest.normalize",
  "ingest.structured",
  "repository.scan",
  "search.query",
  "quarantine.preview",
] as const;
export type IngestConnectorApiCapability = (typeof ingestConnectorApiCapabilities)[number];

export const ingestConnectorApiMediaTypes = [
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
] as const;
export type IngestConnectorApiMediaType = (typeof ingestConnectorApiMediaTypes)[number];

export interface IngestConnectorApiAuthProfile {
  readonly mode: "none";
  readonly required: false;
}

export interface IngestConnectorApiPreviewProfile {
  readonly dryRun: true;
  readonly maxItems: number;
  readonly maxTextBytes: number;
}

export interface IngestConnectorApiSafetyProfile {
  readonly localOnly: true;
  readonly networkAccess: false;
  readonly durableWrites: false;
  readonly untrustedByDefault: boolean;
}

export interface IngestConnectorApiProfile {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly transport: "in-process";
  readonly capabilities: readonly IngestConnectorApiCapability[];
  readonly mediaTypes: readonly IngestConnectorApiMediaType[];
  readonly auth: IngestConnectorApiAuthProfile;
  readonly preview: IngestConnectorApiPreviewProfile;
  readonly safety: IngestConnectorApiSafetyProfile;
}

export interface IngestConnectorApiManifest {
  readonly schemaVersion: typeof INGEST_CONNECTOR_API_MANIFEST_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly connectors: readonly IngestConnectorApiProfile[];
}

export interface IngestConnectorApiManifestValidationIssue {
  readonly path: string;
  readonly message: string;
}

export interface IngestConnectorApiManifestValidationResult<TRecord = unknown> {
  readonly ok: boolean;
  readonly issues: readonly IngestConnectorApiManifestValidationIssue[];
  readonly value?: TRecord;
}

export type IngestConnectorApiManifestJsonSchemaType =
  | "array"
  | "boolean"
  | "integer"
  | "null"
  | "number"
  | "object"
  | "string";

export interface IngestConnectorApiManifestJsonSchema {
  readonly $schema?: string;
  readonly $id?: string;
  readonly title?: string;
  readonly type?:
    | IngestConnectorApiManifestJsonSchemaType
    | readonly IngestConnectorApiManifestJsonSchemaType[];
  readonly additionalProperties?: boolean | IngestConnectorApiManifestJsonSchema;
  readonly properties?: Record<string, IngestConnectorApiManifestJsonSchema>;
  readonly required?: readonly string[];
  readonly enum?: readonly (string | number | boolean | null)[];
  readonly const?: string | number | boolean | null;
  readonly pattern?: string;
  readonly minLength?: number;
  readonly minimum?: number;
  readonly minItems?: number;
  readonly uniqueItems?: boolean;
  readonly items?: IngestConnectorApiManifestJsonSchema;
}

const RAW_LOCAL_PATH_PATTERN_SOURCE =
  "(?:\\b[A-Za-z]:[\\\\/][^\\s\"',;)}\\]]+|\\\\\\\\[^\\\\\\s\"',;)}\\]]+[\\\\][^\\s\"',;)}\\]]+|/(?:Users|home|var|tmp|private|mnt|Volumes)/[^\\s\"',;)}\\]]+)";
const PRIVATE_LOCATION_PATTERN_SOURCE =
  "(?:^|[\\\\/])\\.codex-private(?:[\\\\/]|$)|[pP][rR][iI][vV][aA][tT][eE][- _]?[pP][lL][aA][nN](?:[- _]?[pP][aA][cC][kK])?";
const RAW_SECRET_VALUE_PATTERN_SOURCE =
  "(?:[bB][eE][aA][rR][eE][rR]\\s+[A-Za-z0-9._~+/=-]{8,}|(?:sk|rk|pk|tok|pat|npm|ghp|gho)_[A-Za-z0-9_-]{8,}|(?:sk|rk|pat|glpat|github_pat)-[A-Za-z0-9_-]{8,})";
const SECRET_WORD_PATTERN_SOURCE =
  "\\b(?:[aA][pP][iI][_-]?[kK][eE][yY]|[aA][uU][tT][hH][oO][rR][iI][zZ][aA][tT][iI][oO][nN]|[bB][eE][aA][rR][eE][rR]|[cC][rR][eE][dD][eE][nN][tT][iI][aA][lL]|[pP][aA][sS][sS][wW][oO][rR][dD]|[pP][aA][sS][sS][pP][hH][rR][aA][sS][eE]|[pP][rR][iI][vV][aA][tT][eE][_-]?[kK][eE][yY]|[sS][eE][cC][rR][eE][tT]|[sS][eE][sS][sS][iI][oO][nN][_-]?[tT][oO][kK][eE][nN]|[tT][oO][kK][eE][nN])\\b";
const UNSAFE_PUBLIC_STRING_PATTERN_SOURCE =
  `${RAW_LOCAL_PATH_PATTERN_SOURCE}|${PRIVATE_LOCATION_PATTERN_SOURCE}|${RAW_SECRET_VALUE_PATTERN_SOURCE}|${SECRET_WORD_PATTERN_SOURCE}`;
const SAFE_PUBLIC_STRING_PATTERN = `^(?!.*(?:${UNSAFE_PUBLIC_STRING_PATTERN_SOURCE})).*\\S.*$`;
const CONNECTOR_ID_PATTERN = `^(?!.*(?:${UNSAFE_PUBLIC_STRING_PATTERN_SOURCE}))[a-z0-9][a-z0-9._:-]{0,96}$`;

const unsafePublicStringPattern = new RegExp(UNSAFE_PUBLIC_STRING_PATTERN_SOURCE);

export const ingestConnectorApiAuthProfileSchema = deepFreeze(
  objectSchema(
    "Ingest connector API auth profile",
    {
      mode: constStringSchema("none"),
      required: constBooleanSchema(false),
    },
    ["mode", "required"],
    "api-auth-profile",
  ),
);

export const ingestConnectorApiPreviewProfileSchema = deepFreeze(
  objectSchema(
    "Ingest connector API preview profile",
    {
      dryRun: constBooleanSchema(true),
      maxItems: positiveIntegerSchema(),
      maxTextBytes: positiveIntegerSchema(),
    },
    ["dryRun", "maxItems", "maxTextBytes"],
    "api-preview-profile",
  ),
);

export const ingestConnectorApiSafetyProfileSchema = deepFreeze(
  objectSchema(
    "Ingest connector API safety profile",
    {
      localOnly: constBooleanSchema(true),
      networkAccess: constBooleanSchema(false),
      durableWrites: constBooleanSchema(false),
      untrustedByDefault: { type: "boolean" },
    },
    ["localOnly", "networkAccess", "durableWrites", "untrustedByDefault"],
    "api-safety-profile",
  ),
);

export const ingestConnectorApiProfileSchema = deepFreeze(
  objectSchema(
    "Ingest connector API profile",
    {
      id: connectorIdSchema(),
      label: safePublicStringSchema(),
      description: safePublicStringSchema(),
      transport: constStringSchema("in-process"),
      capabilities: enumArraySchema(ingestConnectorApiCapabilities),
      mediaTypes: enumArraySchema(ingestConnectorApiMediaTypes),
      auth: ingestConnectorApiAuthProfileSchema,
      preview: ingestConnectorApiPreviewProfileSchema,
      safety: ingestConnectorApiSafetyProfileSchema,
    },
    [
      "id",
      "label",
      "description",
      "transport",
      "capabilities",
      "mediaTypes",
      "auth",
      "preview",
      "safety",
    ],
    "api-profile",
  ),
);

export const ingestConnectorApiManifestSchema = deepFreeze(
  objectSchema(
    "Ingest connector API manifest",
    {
      schemaVersion: constStringSchema(INGEST_CONNECTOR_API_MANIFEST_SCHEMA_VERSION),
      localOnly: constBooleanSchema(true),
      connectors: {
        type: "array",
        minItems: 1,
        items: ingestConnectorApiProfileSchema,
      },
    },
    ["schemaVersion", "localOnly", "connectors"],
    "api-manifest",
  ),
);

export const ingestConnectorApiManifestSchemas = {
  auth: ingestConnectorApiAuthProfileSchema,
  preview: ingestConnectorApiPreviewProfileSchema,
  safety: ingestConnectorApiSafetyProfileSchema,
  profile: ingestConnectorApiProfileSchema,
  manifest: ingestConnectorApiManifestSchema,
} as const;

export function getIngestConnectorApiManifestSchema(
  kind: keyof typeof ingestConnectorApiManifestSchemas,
): IngestConnectorApiManifestJsonSchema {
  return ingestConnectorApiManifestSchemas[kind];
}

export function isIngestConnectorApiCapability(
  value: unknown,
): value is IngestConnectorApiCapability {
  return isOneOf(value, ingestConnectorApiCapabilities);
}

export function isIngestConnectorApiMediaType(
  value: unknown,
): value is IngestConnectorApiMediaType {
  return isOneOf(value, ingestConnectorApiMediaTypes);
}

export function isIngestConnectorApiProfileId(value: unknown): value is string {
  return typeof value === "string" && new RegExp(CONNECTOR_ID_PATTERN).test(value);
}

export function validateIngestConnectorApiAuthProfile(
  value: unknown,
): IngestConnectorApiManifestValidationResult<IngestConnectorApiAuthProfile> {
  const issues: IngestConnectorApiManifestValidationIssue[] = [];
  const record = requireRecordAtPath(value, "$", issues);
  if (record) {
    validateAuthProfileRecord(record, "$", issues);
  }
  return validationResult(value, issues);
}

export function validateIngestConnectorApiPreviewProfile(
  value: unknown,
): IngestConnectorApiManifestValidationResult<IngestConnectorApiPreviewProfile> {
  const issues: IngestConnectorApiManifestValidationIssue[] = [];
  const record = requireRecordAtPath(value, "$", issues);
  if (record) {
    validatePreviewProfileRecord(record, "$", issues);
  }
  return validationResult(value, issues);
}

export function validateIngestConnectorApiSafetyProfile(
  value: unknown,
): IngestConnectorApiManifestValidationResult<IngestConnectorApiSafetyProfile> {
  const issues: IngestConnectorApiManifestValidationIssue[] = [];
  const record = requireRecordAtPath(value, "$", issues);
  if (record) {
    validateSafetyProfileRecord(record, "$", issues);
  }
  return validationResult(value, issues);
}

export function validateIngestConnectorApiProfile(
  value: unknown,
): IngestConnectorApiManifestValidationResult<IngestConnectorApiProfile> {
  const issues: IngestConnectorApiManifestValidationIssue[] = [];
  collectUnsafePublicStringIssues(value, "$", issues);
  validateProfileValue(value, "$", issues);
  return validationResult(value, issues);
}

export function validateIngestConnectorApiManifest(
  value: unknown,
): IngestConnectorApiManifestValidationResult<IngestConnectorApiManifest> {
  const issues: IngestConnectorApiManifestValidationIssue[] = [];
  collectUnsafePublicStringIssues(value, "$", issues);

  const record = requireRecordAtPath(value, "$", issues);
  if (!record) {
    return invalid(issues);
  }

  requireOnlyKeys(record, "$", manifestKeys, issues);
  requireExactString(record, "schemaVersion", INGEST_CONNECTOR_API_MANIFEST_SCHEMA_VERSION, issues, "$");
  requireConstBoolean(record, "localOnly", true, issues, "$");

  const connectors = record.connectors;
  if (!Array.isArray(connectors)) {
    issues.push({ path: "connectors", message: "connectors must be an array" });
    return invalid(issues);
  }
  if (connectors.length === 0) {
    issues.push({ path: "connectors", message: "connectors must contain at least one profile" });
  }

  const seen = new Set<string>();
  for (const [index, connector] of connectors.entries()) {
    validateProfileValue(connector, `connectors[${index}]`, issues);
    if (isRecord(connector) && typeof connector.id === "string") {
      if (seen.has(connector.id)) {
        issues.push({
          path: `connectors[${index}].id`,
          message: "connector ids must be unique",
        });
      }
      seen.add(connector.id);
    }
  }

  return validationResult(value, issues);
}

export function assertIngestConnectorApiAuthProfile(
  value: unknown,
): asserts value is IngestConnectorApiAuthProfile {
  const result = validateIngestConnectorApiAuthProfile(value);
  if (!result.ok) {
    throw new Error(formatValidationIssues("ingest connector API auth profile", result.issues));
  }
}

export function assertIngestConnectorApiPreviewProfile(
  value: unknown,
): asserts value is IngestConnectorApiPreviewProfile {
  const result = validateIngestConnectorApiPreviewProfile(value);
  if (!result.ok) {
    throw new Error(formatValidationIssues("ingest connector API preview profile", result.issues));
  }
}

export function assertIngestConnectorApiSafetyProfile(
  value: unknown,
): asserts value is IngestConnectorApiSafetyProfile {
  const result = validateIngestConnectorApiSafetyProfile(value);
  if (!result.ok) {
    throw new Error(formatValidationIssues("ingest connector API safety profile", result.issues));
  }
}

export function assertIngestConnectorApiProfile(
  value: unknown,
): asserts value is IngestConnectorApiProfile {
  const result = validateIngestConnectorApiProfile(value);
  if (!result.ok) {
    throw new Error(formatValidationIssues("ingest connector API profile", result.issues));
  }
}

export function assertIngestConnectorApiManifest(
  value: unknown,
): asserts value is IngestConnectorApiManifest {
  const result = validateIngestConnectorApiManifest(value);
  if (!result.ok) {
    throw new Error(formatValidationIssues("ingest connector API manifest", result.issues));
  }
}

function validateProfileValue(
  value: unknown,
  path: string,
  issues: IngestConnectorApiManifestValidationIssue[],
): IngestConnectorApiProfile | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, profileKeys, issues);
  requirePattern(record, "id", CONNECTOR_ID_PATTERN, "id must be a safe local connector id", issues, path);
  requireSafePublicString(record, "label", issues, path);
  requireSafePublicString(record, "description", issues, path);
  requireExactString(record, "transport", "in-process", issues, path);
  requireEnumArray(record, "capabilities", ingestConnectorApiCapabilities, true, issues, path);
  requireEnumArray(record, "mediaTypes", ingestConnectorApiMediaTypes, true, issues, path);

  const auth = requireRecord(record, "auth", issues, path);
  if (auth) {
    validateAuthProfileRecord(auth, `${path}.auth`, issues);
  }

  const preview = requireRecord(record, "preview", issues, path);
  if (preview) {
    validatePreviewProfileRecord(preview, `${path}.preview`, issues);
  }

  const safety = requireRecord(record, "safety", issues, path);
  if (safety) {
    validateSafetyProfileRecord(safety, `${path}.safety`, issues);
  }

  return record as unknown as IngestConnectorApiProfile;
}

function validateAuthProfileRecord(
  record: Record<string, unknown>,
  path: string,
  issues: IngestConnectorApiManifestValidationIssue[],
): void {
  requireOnlyKeys(record, path, authKeys, issues);
  requireExactString(record, "mode", "none", issues, path);
  requireConstBoolean(record, "required", false, issues, path);
}

function validatePreviewProfileRecord(
  record: Record<string, unknown>,
  path: string,
  issues: IngestConnectorApiManifestValidationIssue[],
): void {
  requireOnlyKeys(record, path, previewKeys, issues);
  requireConstBoolean(record, "dryRun", true, issues, path);
  requirePositiveInteger(record, "maxItems", issues, path);
  requirePositiveInteger(record, "maxTextBytes", issues, path);
}

function validateSafetyProfileRecord(
  record: Record<string, unknown>,
  path: string,
  issues: IngestConnectorApiManifestValidationIssue[],
): void {
  requireOnlyKeys(record, path, safetyKeys, issues);
  requireConstBoolean(record, "localOnly", true, issues, path);
  requireConstBoolean(record, "networkAccess", false, issues, path);
  requireConstBoolean(record, "durableWrites", false, issues, path);
  requireBoolean(record, "untrustedByDefault", issues, path);
}

function objectSchema(
  title: string,
  properties: Record<string, IngestConnectorApiManifestJsonSchema>,
  required: readonly string[],
  slug: string,
): IngestConnectorApiManifestJsonSchema {
  return {
    $schema: INGEST_CONNECTOR_API_MANIFEST_JSON_SCHEMA_DRAFT,
    $id: `https://schemas.sovereignops.local/ingest-connectors/${slug}.schema.json`,
    title,
    type: "object",
    additionalProperties: false,
    required,
    properties,
  };
}

function constStringSchema(value: string): IngestConnectorApiManifestJsonSchema {
  return {
    type: "string",
    const: value,
    enum: [value],
  };
}

function constBooleanSchema(value: boolean): IngestConnectorApiManifestJsonSchema {
  return {
    type: "boolean",
    const: value,
    enum: [value],
  };
}

function enumSchema(values: readonly string[]): IngestConnectorApiManifestJsonSchema {
  return {
    type: "string",
    enum: values,
  };
}

function enumArraySchema(values: readonly string[]): IngestConnectorApiManifestJsonSchema {
  return {
    type: "array",
    minItems: 1,
    uniqueItems: true,
    items: enumSchema(values),
  };
}

function safePublicStringSchema(): IngestConnectorApiManifestJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: SAFE_PUBLIC_STRING_PATTERN,
  };
}

function connectorIdSchema(): IngestConnectorApiManifestJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: CONNECTOR_ID_PATTERN,
  };
}

function positiveIntegerSchema(): IngestConnectorApiManifestJsonSchema {
  return {
    type: "integer",
    minimum: 1,
  };
}

function collectUnsafePublicStringIssues(
  value: unknown,
  path: string,
  issues: IngestConnectorApiManifestValidationIssue[],
  seen: WeakSet<object> = new WeakSet<object>(),
): void {
  if (typeof value === "string") {
    if (isUnsafePublicString(value)) {
      issues.push({
        path,
        message: "public strings must not include private paths or raw secrets",
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
      collectUnsafePublicStringIssues(item, `${path}[${index}]`, issues, seen);
    }
    seen.delete(value);
    return;
  }

  if (isRecord(value)) {
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
    for (const [key, nested] of Object.entries(value)) {
      collectUnsafePublicStringIssues(nested, keyPath(path, key), issues, seen);
    }
    seen.delete(value);
  }
}

function requireRecord(
  record: Record<string, unknown>,
  key: string,
  issues: IngestConnectorApiManifestValidationIssue[],
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
  issues: IngestConnectorApiManifestValidationIssue[],
): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    issues.push({ path, message: "record must be an object" });
    return undefined;
  }
  return value;
}

function invalid<TRecord>(
  issues: IngestConnectorApiManifestValidationIssue[],
): IngestConnectorApiManifestValidationResult<TRecord> {
  return { ok: false, issues };
}

function validationResult<TRecord>(
  value: unknown,
  issues: IngestConnectorApiManifestValidationIssue[],
): IngestConnectorApiManifestValidationResult<TRecord> {
  return issues.length === 0
    ? { ok: true, issues, value: deepFreeze(cloneJson(value)) as TRecord }
    : { ok: false, issues };
}

function requireOnlyKeys(
  record: Record<string, unknown>,
  path: string,
  allowedKeys: readonly string[],
  issues: IngestConnectorApiManifestValidationIssue[],
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      issues.push({ path: keyPath(path, key), message: `${key} is not allowed` });
    }
  }
}

function requireExactString(
  record: Record<string, unknown>,
  key: string,
  expected: string,
  issues: IngestConnectorApiManifestValidationIssue[],
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
  issues: IngestConnectorApiManifestValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (typeof value !== "string" || !new RegExp(pattern).test(value)) {
    issues.push({ path: keyPath(parentPath, key), message });
  }
}

function requireSafePublicString(
  record: Record<string, unknown>,
  key: string,
  issues: IngestConnectorApiManifestValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (typeof value !== "string" || !isSafePublicString(value)) {
    issues.push({
      path: keyPath(parentPath, key),
      message: `${key} must be a non-empty public string without private paths or raw secrets`,
    });
  }
}

function requireBoolean(
  record: Record<string, unknown>,
  key: string,
  issues: IngestConnectorApiManifestValidationIssue[],
  parentPath: string,
): void {
  if (typeof record[key] !== "boolean") {
    issues.push({ path: keyPath(parentPath, key), message: `${key} must be a boolean` });
  }
}

function requireConstBoolean(
  record: Record<string, unknown>,
  key: string,
  expected: boolean,
  issues: IngestConnectorApiManifestValidationIssue[],
  parentPath: string,
): void {
  if (record[key] !== expected) {
    issues.push({ path: keyPath(parentPath, key), message: `${key} must be ${expected}` });
  }
}

function requirePositiveInteger(
  record: Record<string, unknown>,
  key: string,
  issues: IngestConnectorApiManifestValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    issues.push({ path: keyPath(parentPath, key), message: `${key} must be a positive integer` });
  }
}

function requireEnumArray<TValue extends string>(
  record: Record<string, unknown>,
  key: string,
  allowed: readonly TValue[],
  nonEmpty: boolean,
  issues: IngestConnectorApiManifestValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  const path = keyPath(parentPath, key);
  if (!Array.isArray(value)) {
    issues.push({ path, message: `${key} must be an array` });
    return;
  }
  if (nonEmpty && value.length === 0) {
    issues.push({ path, message: `${key} must not be empty` });
  }

  const seen = new Set<string>();
  for (const [index, item] of value.entries()) {
    const itemPath = `${path}[${index}]`;
    if (!allowed.includes(item as TValue)) {
      issues.push({ path: itemPath, message: `${key} values must be one of ${allowed.join(", ")}` });
      continue;
    }
    if (typeof item === "string" && seen.has(item)) {
      issues.push({ path: itemPath, message: `${key} values must be unique` });
    }
    if (typeof item === "string") {
      seen.add(item);
    }
  }
}

function keyPath(parentPath: string, key: string): string {
  return parentPath === "$" ? key : `${parentPath}.${key}`;
}

function isSafePublicString(value: string): boolean {
  return value.trim().length > 0 && !isUnsafePublicString(value);
}

function isUnsafePublicString(value: string): boolean {
  return unsafePublicStringPattern.test(value);
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
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }
  return value;
}

function isFreezable(value: unknown): value is object {
  return (typeof value === "object" || typeof value === "function") && value !== null;
}

function formatValidationIssues(
  label: string,
  issues: readonly IngestConnectorApiManifestValidationIssue[],
): string {
  const details = issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
  return `${label} validation failed: ${details}`;
}

const manifestKeys = ["schemaVersion", "localOnly", "connectors"] as const;

const profileKeys = [
  "id",
  "label",
  "description",
  "transport",
  "capabilities",
  "mediaTypes",
  "auth",
  "preview",
  "safety",
] as const;

const authKeys = ["mode", "required"] as const;

const previewKeys = ["dryRun", "maxItems", "maxTextBytes"] as const;

const safetyKeys = ["localOnly", "networkAccess", "durableWrites", "untrustedByDefault"] as const;
