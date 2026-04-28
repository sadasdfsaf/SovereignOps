export const INGEST_CONNECTOR_MCP_RESOURCES_SCHEMA_VERSION =
  "ingest-connector-mcp-resources/v1";
export const INGEST_CONNECTOR_MCP_RESOURCE_SCHEMA_VERSION =
  "ingest-connector-mcp-resource/v1";
export const INGEST_CONNECTOR_MCP_PREVIEW_SCHEMA_VERSION =
  "ingest-connector-mcp-preview/v1";
export const INGEST_CONNECTOR_MCP_API_REQUESTS_SCHEMA_VERSION =
  "ingest-connector-mcp-api-requests.v1";
export const INGEST_CONNECTOR_MCP_API_JSON_SCHEMA_DRAFT =
  "https://json-schema.org/draft/2020-12/schema";

export const ingestConnectorMcpApiKinds = [
  "resources",
  "resource",
  "preview",
  "apiRequests",
] as const;
export type IngestConnectorMcpApiKind = (typeof ingestConnectorMcpApiKinds)[number];

export const ingestConnectorMcpApiOperations = [
  "resources/list",
  "resources/read",
  "preview",
] as const;
export type IngestConnectorMcpApiOperation = (typeof ingestConnectorMcpApiOperations)[number];

export const ingestConnectorMcpApiResponseSchemaVersions = [
  INGEST_CONNECTOR_MCP_RESOURCES_SCHEMA_VERSION,
  INGEST_CONNECTOR_MCP_RESOURCE_SCHEMA_VERSION,
  INGEST_CONNECTOR_MCP_PREVIEW_SCHEMA_VERSION,
] as const;
export type IngestConnectorMcpApiResponseSchemaVersion =
  (typeof ingestConnectorMcpApiResponseSchemaVersions)[number];

export type IngestConnectorMcpApiSchemaVersion =
  | typeof INGEST_CONNECTOR_MCP_RESOURCES_SCHEMA_VERSION
  | typeof INGEST_CONNECTOR_MCP_RESOURCE_SCHEMA_VERSION
  | typeof INGEST_CONNECTOR_MCP_PREVIEW_SCHEMA_VERSION
  | typeof INGEST_CONNECTOR_MCP_API_REQUESTS_SCHEMA_VERSION;

export interface IngestConnectorMcpResourceSummary {
  readonly id: string;
  readonly uri: string;
  readonly name: string;
  readonly description: string;
  readonly mimeType: string;
  readonly textBytes: number;
}

export interface IngestConnectorMcpResourcesEnvelope {
  readonly schemaVersion: typeof INGEST_CONNECTOR_MCP_RESOURCES_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly connectorId: string;
  readonly localOnly: true;
  readonly resources: readonly IngestConnectorMcpResourceSummary[];
}

export interface IngestConnectorMcpResourceTextContent {
  readonly type: "text";
  readonly text: string;
  readonly truncated: boolean;
}

export interface IngestConnectorMcpResourceEnvelope {
  readonly schemaVersion: typeof INGEST_CONNECTOR_MCP_RESOURCE_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly connectorId: string;
  readonly localOnly: true;
  readonly resource: IngestConnectorMcpResourceSummary;
  readonly content: IngestConnectorMcpResourceTextContent;
}

export interface IngestConnectorMcpPreviewRequest {
  readonly maxItems: number;
  readonly maxTextBytes: number;
}

export interface IngestConnectorMcpPreviewSummary {
  readonly resourceCount: number;
  readonly totalTextBytes: number;
  readonly truncated: boolean;
}

export interface IngestConnectorMcpPreviewEnvelope {
  readonly schemaVersion: typeof INGEST_CONNECTOR_MCP_PREVIEW_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly connectorId: string;
  readonly localOnly: true;
  readonly dryRun: true;
  readonly request: IngestConnectorMcpPreviewRequest;
  readonly resources: readonly IngestConnectorMcpResourceEnvelope[];
  readonly summary: IngestConnectorMcpPreviewSummary;
}

export interface IngestConnectorMcpApiRequestFixture {
  readonly id: string;
  readonly requestedAt: string;
  readonly connectorId: string;
  readonly operation: IngestConnectorMcpApiOperation;
  readonly resourceUri?: string;
  readonly responseSchemaVersion: IngestConnectorMcpApiResponseSchemaVersion;
  readonly fixture: string;
}

export interface IngestConnectorMcpApiRequestBundle {
  readonly schemaVersion: typeof INGEST_CONNECTOR_MCP_API_REQUESTS_SCHEMA_VERSION;
  readonly bundleId: string;
  readonly generatedAt: string;
  readonly connectorId: string;
  readonly localOnly: true;
  readonly requests: readonly IngestConnectorMcpApiRequestFixture[];
  readonly resources: IngestConnectorMcpResourcesEnvelope;
  readonly resourceFixtures: readonly IngestConnectorMcpResourceEnvelope[];
  readonly preview: IngestConnectorMcpPreviewEnvelope;
}

export interface IngestConnectorMcpApiObjectByKind {
  readonly resources: IngestConnectorMcpResourcesEnvelope;
  readonly resource: IngestConnectorMcpResourceEnvelope;
  readonly preview: IngestConnectorMcpPreviewEnvelope;
  readonly apiRequests: IngestConnectorMcpApiRequestBundle;
}

export interface IngestConnectorMcpApiValidationIssue {
  readonly path: string;
  readonly message: string;
}

export interface IngestConnectorMcpApiValidationResult<TRecord = unknown> {
  readonly ok: boolean;
  readonly issues: readonly IngestConnectorMcpApiValidationIssue[];
  readonly value?: TRecord;
}

export type IngestConnectorMcpApiJsonSchemaType =
  | "array"
  | "boolean"
  | "integer"
  | "null"
  | "number"
  | "object"
  | "string";

export interface IngestConnectorMcpApiJsonSchema {
  readonly $schema?: string;
  readonly $id?: string;
  readonly title?: string;
  readonly type?:
    | IngestConnectorMcpApiJsonSchemaType
    | readonly IngestConnectorMcpApiJsonSchemaType[];
  readonly additionalProperties?: boolean | IngestConnectorMcpApiJsonSchema;
  readonly properties?: Record<string, IngestConnectorMcpApiJsonSchema>;
  readonly required?: readonly string[];
  readonly enum?: readonly (string | number | boolean | null)[];
  readonly const?: string | number | boolean | null;
  readonly pattern?: string;
  readonly minLength?: number;
  readonly minimum?: number;
  readonly minItems?: number;
  readonly uniqueItems?: boolean;
  readonly items?: IngestConnectorMcpApiJsonSchema;
}

export interface IngestConnectorMcpApiSchemaDefinition {
  readonly kind: IngestConnectorMcpApiKind;
  readonly schemaVersion: IngestConnectorMcpApiSchemaVersion;
  readonly title: string;
  readonly schema: IngestConnectorMcpApiJsonSchema;
}

const RAW_LOCAL_PATH_PATTERN_SOURCE =
  "(?:\\b[A-Za-z]:[\\\\/][^\\s\"',;)}\\]]+|\\\\\\\\[^\\\\\\s\"',;)}\\]]+[\\\\][^\\s\"',;)}\\]]+|file://[^\\s\"',;)}\\]]+|/(?:Users|home|var|tmp|private|mnt|Volumes)/[^\\s\"',;)}\\]]+)";
const PRIVATE_MARKER_PATTERN_SOURCE =
  "(?:^|[\\\\/])\\.codex-private(?:[\\\\/]|$)|[pP][rR][iI][vV][aA][tT][eE][- _]?[pP][lL][aA][nN](?:[- _]?[pP][aA][cC][kK])?|[pP][rR][iI][vV][aA][tT][eE][- _]?[mM][aA][rR][kK][eE][rR]";
const RAW_SECRET_VALUE_PATTERN_SOURCE =
  "(?:[bB][eE][aA][rR][eE][rR]\\s+[A-Za-z0-9._~+/=-]{8,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:sk|rk|pk|tok|pat|npm|ghp|gho)_[A-Za-z0-9_-]{8,}|(?:sk|rk|pat|glpat|github_pat)-[A-Za-z0-9_-]{8,})";
const SECRET_WORD_PATTERN_SOURCE =
  "(?:[aA][pP][iI][_-]?[kK][eE][yY]|[aA][uU][tT][hH][oO][rR][iI][zZ][aA][tT][iI][oO][nN]|[bB][eE][aA][rR][eE][rR]|[cC][rR][eE][dD][eE][nN][tT][iI][aA][lL]|[pP][aA][sS][sS][wW][oO][rR][dD]|[pP][aA][sS][sS][pP][hH][rR][aA][sS][eE]|[pP][rR][iI][vV][aA][tT][eE][_-]?[kK][eE][yY]|[sS][eE][cC][rR][eE][tT]|[sS][eE][sS][sS][iI][oO][nN][_-]?[tT][oO][kK][eE][nN]|[tT][oO][kK][eE][nN])";
const UNSAFE_PUBLIC_STRING_PATTERN_SOURCE =
  `${RAW_LOCAL_PATH_PATTERN_SOURCE}|${PRIVATE_MARKER_PATTERN_SOURCE}|${RAW_SECRET_VALUE_PATTERN_SOURCE}|${SECRET_WORD_PATTERN_SOURCE}`;
const SAFE_PUBLIC_STRING_PATTERN =
  `^(?!.*(?:${UNSAFE_PUBLIC_STRING_PATTERN_SOURCE})).*\\S.*$`;
const CONNECTOR_ID_PATTERN =
  `^(?!.*(?:${UNSAFE_PUBLIC_STRING_PATTERN_SOURCE}))[a-z0-9][a-z0-9._-]{0,63}$`;
const RESOURCE_ID_PATTERN =
  `^(?!.*(?:${UNSAFE_PUBLIC_STRING_PATTERN_SOURCE}))[a-z][a-z0-9._-]{0,63}$`;
const URI_CONNECTOR_ID_CAPTURE_SOURCE = "([a-z0-9][a-z0-9._-]{0,63})";
const RESOURCE_URI_PATTERN =
  `^ingest://${URI_CONNECTOR_ID_CAPTURE_SOURCE}/[A-Za-z0-9][A-Za-z0-9._~:/?#\\[\\]@!$&'()*+,;=%-]{0,191}$`;
const MEDIA_TYPE_PATTERN = "^[^\\s/]+/[^\\s]+$";
const TIMESTAMP_PATTERN = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$";
const FIXTURE_PATH_PATTERN =
  "^(?!/)(?![A-Za-z]:)(?!.*(?:^|/)\\.\\.(?:/|$))(?!.*//)[A-Za-z0-9._/-]+\\.json$";
const REQUEST_ID_PATTERN =
  `^(?!.*(?:${UNSAFE_PUBLIC_STRING_PATTERN_SOURCE}))[a-z][a-z0-9._:-]{0,63}$`;
const BUNDLE_ID_PATTERN =
  `^(?!.*(?:${UNSAFE_PUBLIC_STRING_PATTERN_SOURCE}))[a-z][a-z0-9._:-]{0,95}$`;

const unsafePublicStringPattern = new RegExp(UNSAFE_PUBLIC_STRING_PATTERN_SOURCE);
const resourceUriPattern = new RegExp(RESOURCE_URI_PATTERN);
const timestampPattern = new RegExp(TIMESTAMP_PATTERN);

const resourceSummarySchema = objectSchema(
  "Ingest connector MCP resource summary",
  {
    id: resourceIdSchema(),
    uri: resourceUriSchema(),
    name: safePublicStringSchema(),
    description: safePublicStringSchema(),
    mimeType: mediaTypeSchema(),
    textBytes: nonNegativeIntegerSchema(),
  },
  ["id", "uri", "name", "description", "mimeType", "textBytes"],
);

const resourceTextContentSchema = objectSchema(
  "Ingest connector MCP resource text content",
  {
    type: constStringSchema("text"),
    text: safePublicStringSchema(),
    truncated: { type: "boolean" },
  },
  ["type", "text", "truncated"],
);

const previewRequestSchema = objectSchema(
  "Ingest connector MCP preview request",
  {
    maxItems: positiveIntegerSchema(),
    maxTextBytes: positiveIntegerSchema(),
  },
  ["maxItems", "maxTextBytes"],
);

const previewSummarySchema = objectSchema(
  "Ingest connector MCP preview summary",
  {
    resourceCount: nonNegativeIntegerSchema(),
    totalTextBytes: nonNegativeIntegerSchema(),
    truncated: { type: "boolean" },
  },
  ["resourceCount", "totalTextBytes", "truncated"],
);

const apiRequestFixtureSchema = objectSchema(
  "Ingest connector MCP API request fixture",
  {
    id: requestIdSchema(),
    requestedAt: timestampSchema(),
    connectorId: connectorIdSchema(),
    operation: enumSchema(ingestConnectorMcpApiOperations),
    resourceUri: resourceUriSchema(),
    responseSchemaVersion: enumSchema(ingestConnectorMcpApiResponseSchemaVersions),
    fixture: fixturePathSchema(),
  },
  ["id", "requestedAt", "connectorId", "operation", "responseSchemaVersion", "fixture"],
);

export const ingestConnectorMcpResourcesSchema = deepFreeze(
  objectSchema(
    "Ingest connector MCP resources envelope",
    {
      schemaVersion: constStringSchema(INGEST_CONNECTOR_MCP_RESOURCES_SCHEMA_VERSION),
      generatedAt: timestampSchema(),
      connectorId: connectorIdSchema(),
      localOnly: constBooleanSchema(true),
      resources: arraySchema(resourceSummarySchema),
    },
    ["schemaVersion", "generatedAt", "connectorId", "localOnly", "resources"],
    "resources",
  ),
);

export const ingestConnectorMcpResourceSchema = deepFreeze(
  objectSchema(
    "Ingest connector MCP resource envelope",
    {
      schemaVersion: constStringSchema(INGEST_CONNECTOR_MCP_RESOURCE_SCHEMA_VERSION),
      generatedAt: timestampSchema(),
      connectorId: connectorIdSchema(),
      localOnly: constBooleanSchema(true),
      resource: resourceSummarySchema,
      content: resourceTextContentSchema,
    },
    ["schemaVersion", "generatedAt", "connectorId", "localOnly", "resource", "content"],
    "resource",
  ),
);

export const ingestConnectorMcpPreviewSchema = deepFreeze(
  objectSchema(
    "Ingest connector MCP preview envelope",
    {
      schemaVersion: constStringSchema(INGEST_CONNECTOR_MCP_PREVIEW_SCHEMA_VERSION),
      generatedAt: timestampSchema(),
      connectorId: connectorIdSchema(),
      localOnly: constBooleanSchema(true),
      dryRun: constBooleanSchema(true),
      request: previewRequestSchema,
      resources: arraySchema(ingestConnectorMcpResourceSchema),
      summary: previewSummarySchema,
    },
    [
      "schemaVersion",
      "generatedAt",
      "connectorId",
      "localOnly",
      "dryRun",
      "request",
      "resources",
      "summary",
    ],
    "preview",
  ),
);

export const ingestConnectorMcpApiRequestsSchema = deepFreeze(
  objectSchema(
    "Ingest connector MCP API request fixture bundle",
    {
      schemaVersion: constStringSchema(INGEST_CONNECTOR_MCP_API_REQUESTS_SCHEMA_VERSION),
      bundleId: bundleIdSchema(),
      generatedAt: timestampSchema(),
      connectorId: connectorIdSchema(),
      localOnly: constBooleanSchema(true),
      requests: arraySchema(apiRequestFixtureSchema, 1),
      resources: ingestConnectorMcpResourcesSchema,
      resourceFixtures: arraySchema(ingestConnectorMcpResourceSchema, 1),
      preview: ingestConnectorMcpPreviewSchema,
    },
    [
      "schemaVersion",
      "bundleId",
      "generatedAt",
      "connectorId",
      "localOnly",
      "requests",
      "resources",
      "resourceFixtures",
      "preview",
    ],
    "api-requests",
  ),
);

export const ingestConnectorMcpApiSchemaDefinitions = deepFreeze({
  resources: {
    kind: "resources",
    schemaVersion: INGEST_CONNECTOR_MCP_RESOURCES_SCHEMA_VERSION,
    title: ingestConnectorMcpResourcesSchema.title ?? "Ingest connector MCP resources envelope",
    schema: ingestConnectorMcpResourcesSchema,
  },
  resource: {
    kind: "resource",
    schemaVersion: INGEST_CONNECTOR_MCP_RESOURCE_SCHEMA_VERSION,
    title: ingestConnectorMcpResourceSchema.title ?? "Ingest connector MCP resource envelope",
    schema: ingestConnectorMcpResourceSchema,
  },
  preview: {
    kind: "preview",
    schemaVersion: INGEST_CONNECTOR_MCP_PREVIEW_SCHEMA_VERSION,
    title: ingestConnectorMcpPreviewSchema.title ?? "Ingest connector MCP preview envelope",
    schema: ingestConnectorMcpPreviewSchema,
  },
  apiRequests: {
    kind: "apiRequests",
    schemaVersion: INGEST_CONNECTOR_MCP_API_REQUESTS_SCHEMA_VERSION,
    title:
      ingestConnectorMcpApiRequestsSchema.title ??
      "Ingest connector MCP API request fixture bundle",
    schema: ingestConnectorMcpApiRequestsSchema,
  },
} satisfies Record<IngestConnectorMcpApiKind, IngestConnectorMcpApiSchemaDefinition>);

export const ingestConnectorMcpApiSchemas = {
  resources: ingestConnectorMcpResourcesSchema,
  resource: ingestConnectorMcpResourceSchema,
  preview: ingestConnectorMcpPreviewSchema,
  apiRequests: ingestConnectorMcpApiRequestsSchema,
} as const satisfies Record<IngestConnectorMcpApiKind, IngestConnectorMcpApiJsonSchema>;

export const ingestConnectorMcpApiValidators = {
  resources: validateIngestConnectorMcpResources,
  resource: validateIngestConnectorMcpResource,
  preview: validateIngestConnectorMcpPreview,
  apiRequests: validateIngestConnectorMcpApiRequestBundle,
} as const;

export function getIngestConnectorMcpApiSchema(
  kind: IngestConnectorMcpApiKind,
): IngestConnectorMcpApiJsonSchema {
  return ingestConnectorMcpApiSchemas[kind];
}

export function validateIngestConnectorMcpApiObject<K extends IngestConnectorMcpApiKind>(
  kind: K,
  value: unknown,
): IngestConnectorMcpApiValidationResult<IngestConnectorMcpApiObjectByKind[K]> {
  const validator = ingestConnectorMcpApiValidators[kind] as (
    candidate: unknown,
  ) => IngestConnectorMcpApiValidationResult<unknown>;
  return validator(value) as IngestConnectorMcpApiValidationResult<
    IngestConnectorMcpApiObjectByKind[K]
  >;
}

export function assertIngestConnectorMcpApiObject<K extends IngestConnectorMcpApiKind>(
  kind: K,
  value: unknown,
): asserts value is IngestConnectorMcpApiObjectByKind[K] {
  const result = validateIngestConnectorMcpApiObject(kind, value);
  if (!result.ok) {
    throw new Error(formatValidationIssues(kind, result.issues));
  }
}

export function validateIngestConnectorMcpResources(
  value: unknown,
): IngestConnectorMcpApiValidationResult<IngestConnectorMcpResourcesEnvelope> {
  const issues: IngestConnectorMcpApiValidationIssue[] = [];
  collectUnsafePublicStringIssues(value, "$", issues);
  validateResourcesEnvelopeValue(value, "$", issues);
  return validationResult(value, issues);
}

export function validateIngestConnectorMcpResource(
  value: unknown,
): IngestConnectorMcpApiValidationResult<IngestConnectorMcpResourceEnvelope> {
  const issues: IngestConnectorMcpApiValidationIssue[] = [];
  collectUnsafePublicStringIssues(value, "$", issues);
  validateResourceEnvelopeValue(value, "$", issues);
  return validationResult(value, issues);
}

export function validateIngestConnectorMcpPreview(
  value: unknown,
): IngestConnectorMcpApiValidationResult<IngestConnectorMcpPreviewEnvelope> {
  const issues: IngestConnectorMcpApiValidationIssue[] = [];
  collectUnsafePublicStringIssues(value, "$", issues);
  validatePreviewEnvelopeValue(value, "$", issues);
  return validationResult(value, issues);
}

export function validateIngestConnectorMcpApiRequestBundle(
  value: unknown,
): IngestConnectorMcpApiValidationResult<IngestConnectorMcpApiRequestBundle> {
  const issues: IngestConnectorMcpApiValidationIssue[] = [];
  collectUnsafePublicStringIssues(value, "$", issues);
  validateApiRequestBundleValue(value, "$", issues);
  return validationResult(value, issues);
}

export function assertIngestConnectorMcpResources(
  value: unknown,
): asserts value is IngestConnectorMcpResourcesEnvelope {
  const result = validateIngestConnectorMcpResources(value);
  if (!result.ok) {
    throw new Error(formatValidationIssues("resources", result.issues));
  }
}

export function assertIngestConnectorMcpResource(
  value: unknown,
): asserts value is IngestConnectorMcpResourceEnvelope {
  const result = validateIngestConnectorMcpResource(value);
  if (!result.ok) {
    throw new Error(formatValidationIssues("resource", result.issues));
  }
}

export function assertIngestConnectorMcpPreview(
  value: unknown,
): asserts value is IngestConnectorMcpPreviewEnvelope {
  const result = validateIngestConnectorMcpPreview(value);
  if (!result.ok) {
    throw new Error(formatValidationIssues("preview", result.issues));
  }
}

export function assertIngestConnectorMcpApiRequestBundle(
  value: unknown,
): asserts value is IngestConnectorMcpApiRequestBundle {
  const result = validateIngestConnectorMcpApiRequestBundle(value);
  if (!result.ok) {
    throw new Error(formatValidationIssues("apiRequests", result.issues));
  }
}

export function isIngestConnectorMcpConnectorId(value: unknown): value is string {
  return typeof value === "string" && new RegExp(CONNECTOR_ID_PATTERN).test(value);
}

export function isIngestConnectorMcpResourceId(value: unknown): value is string {
  return typeof value === "string" && new RegExp(RESOURCE_ID_PATTERN).test(value);
}

export function isIngestConnectorMcpResourceUri(value: unknown): value is string {
  return typeof value === "string" && resourceUriPattern.test(value);
}

export function getIngestConnectorMcpResourceUriConnectorId(uri: string): string | undefined {
  return resourceUriPattern.exec(uri)?.[1];
}

export function isIngestConnectorMcpSafePublicString(value: unknown): value is string {
  return typeof value === "string" && isSafePublicString(value);
}

function validateResourcesEnvelopeValue(
  value: unknown,
  path: string,
  issues: IngestConnectorMcpApiValidationIssue[],
): IngestConnectorMcpResourcesEnvelope | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, resourcesEnvelopeKeys, issues);
  requireExactString(record, "schemaVersion", INGEST_CONNECTOR_MCP_RESOURCES_SCHEMA_VERSION, issues, path);
  requireTimestamp(record, "generatedAt", issues, path);
  requireConnectorId(record, "connectorId", issues, path);
  requireConstBoolean(record, "localOnly", true, issues, path);
  const resources = validateArray(record, "resources", validateResourceSummary, false, issues, path);
  validateResourceSummariesCrossReferences(record.connectorId, resources, keyPath(path, "resources"), issues);

  return record as unknown as IngestConnectorMcpResourcesEnvelope;
}

function validateResourceEnvelopeValue(
  value: unknown,
  path: string,
  issues: IngestConnectorMcpApiValidationIssue[],
): IngestConnectorMcpResourceEnvelope | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, resourceEnvelopeKeys, issues);
  requireExactString(record, "schemaVersion", INGEST_CONNECTOR_MCP_RESOURCE_SCHEMA_VERSION, issues, path);
  requireTimestamp(record, "generatedAt", issues, path);
  requireConnectorId(record, "connectorId", issues, path);
  requireConstBoolean(record, "localOnly", true, issues, path);

  const resourceRecord = requireRecord(record, "resource", issues, path);
  const resource = resourceRecord
    ? validateResourceSummary(resourceRecord, keyPath(path, "resource"), issues)
    : undefined;

  const contentRecord = requireRecord(record, "content", issues, path);
  if (contentRecord) {
    validateResourceTextContent(contentRecord, keyPath(path, "content"), issues);
  }
  validateResourceConnectorReference(record.connectorId, resource, keyPath(path, "resource"), issues);
  validateResourceContentLength(resource, contentRecord, path, issues);

  return record as unknown as IngestConnectorMcpResourceEnvelope;
}

function validatePreviewEnvelopeValue(
  value: unknown,
  path: string,
  issues: IngestConnectorMcpApiValidationIssue[],
): IngestConnectorMcpPreviewEnvelope | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, previewEnvelopeKeys, issues);
  requireExactString(record, "schemaVersion", INGEST_CONNECTOR_MCP_PREVIEW_SCHEMA_VERSION, issues, path);
  requireTimestamp(record, "generatedAt", issues, path);
  requireConnectorId(record, "connectorId", issues, path);
  requireConstBoolean(record, "localOnly", true, issues, path);
  requireConstBoolean(record, "dryRun", true, issues, path);

  const requestRecord = requireRecord(record, "request", issues, path);
  if (requestRecord) {
    validatePreviewRequest(requestRecord, keyPath(path, "request"), issues);
  }

  const resources = validateArray(
    record,
    "resources",
    validateResourceEnvelopeValue,
    false,
    issues,
    path,
  );
  const summaryRecord = requireRecord(record, "summary", issues, path);
  if (summaryRecord) {
    validatePreviewSummary(summaryRecord, keyPath(path, "summary"), issues);
  }
  validatePreviewCrossReferences(record, resources, summaryRecord, path, issues);

  return record as unknown as IngestConnectorMcpPreviewEnvelope;
}

function validateApiRequestBundleValue(
  value: unknown,
  path: string,
  issues: IngestConnectorMcpApiValidationIssue[],
): IngestConnectorMcpApiRequestBundle | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, apiRequestBundleKeys, issues);
  requireExactString(record, "schemaVersion", INGEST_CONNECTOR_MCP_API_REQUESTS_SCHEMA_VERSION, issues, path);
  requirePattern(record, "bundleId", BUNDLE_ID_PATTERN, "bundleId must be a safe bundle id", issues, path);
  requireTimestamp(record, "generatedAt", issues, path);
  requireConnectorId(record, "connectorId", issues, path);
  requireConstBoolean(record, "localOnly", true, issues, path);

  const requests = validateArray(record, "requests", validateApiRequestFixture, true, issues, path);

  const resourcesRecord = requireRecord(record, "resources", issues, path);
  const resources = resourcesRecord
    ? validateResourcesEnvelopeValue(resourcesRecord, keyPath(path, "resources"), issues)
    : undefined;

  const resourceFixtures = validateArray(
    record,
    "resourceFixtures",
    validateResourceEnvelopeValue,
    true,
    issues,
    path,
  );

  const previewRecord = requireRecord(record, "preview", issues, path);
  const preview = previewRecord
    ? validatePreviewEnvelopeValue(previewRecord, keyPath(path, "preview"), issues)
    : undefined;

  validateBundleCrossReferences(
    record,
    requests,
    resources,
    resourceFixtures,
    preview,
    path,
    issues,
  );

  return record as unknown as IngestConnectorMcpApiRequestBundle;
}

function validateResourceSummary(
  value: unknown,
  path: string,
  issues: IngestConnectorMcpApiValidationIssue[],
): IngestConnectorMcpResourceSummary | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, resourceSummaryKeys, issues);
  requirePattern(record, "id", RESOURCE_ID_PATTERN, "id must be a safe resource id", issues, path);
  requireResourceUri(record, "uri", issues, path);
  requireSafePublicString(record, "name", issues, path);
  requireSafePublicString(record, "description", issues, path);
  requirePattern(record, "mimeType", MEDIA_TYPE_PATTERN, "mimeType must be a media type", issues, path);
  requireNonNegativeInteger(record, "textBytes", issues, path);

  return record as unknown as IngestConnectorMcpResourceSummary;
}

function validateResourceTextContent(
  record: Record<string, unknown>,
  path: string,
  issues: IngestConnectorMcpApiValidationIssue[],
): void {
  requireOnlyKeys(record, path, resourceTextContentKeys, issues);
  requireExactString(record, "type", "text", issues, path);
  requireSafePublicString(record, "text", issues, path);
  requireBoolean(record, "truncated", issues, path);
}

function validatePreviewRequest(
  record: Record<string, unknown>,
  path: string,
  issues: IngestConnectorMcpApiValidationIssue[],
): void {
  requireOnlyKeys(record, path, previewRequestKeys, issues);
  requirePositiveInteger(record, "maxItems", issues, path);
  requirePositiveInteger(record, "maxTextBytes", issues, path);
}

function validatePreviewSummary(
  record: Record<string, unknown>,
  path: string,
  issues: IngestConnectorMcpApiValidationIssue[],
): void {
  requireOnlyKeys(record, path, previewSummaryKeys, issues);
  requireNonNegativeInteger(record, "resourceCount", issues, path);
  requireNonNegativeInteger(record, "totalTextBytes", issues, path);
  requireBoolean(record, "truncated", issues, path);
}

function validateApiRequestFixture(
  value: unknown,
  path: string,
  issues: IngestConnectorMcpApiValidationIssue[],
): IngestConnectorMcpApiRequestFixture | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, apiRequestFixtureKeys, issues);
  requirePattern(record, "id", REQUEST_ID_PATTERN, "id must be a safe request id", issues, path);
  requireTimestamp(record, "requestedAt", issues, path);
  requireConnectorId(record, "connectorId", issues, path);
  requireEnum(record, "operation", ingestConnectorMcpApiOperations, issues, path);
  if (record.resourceUri !== undefined) {
    requireResourceUri(record, "resourceUri", issues, path);
  }
  requireEnum(
    record,
    "responseSchemaVersion",
    ingestConnectorMcpApiResponseSchemaVersions,
    issues,
    path,
  );
  requirePattern(record, "fixture", FIXTURE_PATH_PATTERN, "fixture must be a safe relative JSON fixture path", issues, path);
  validateRequestOperation(record, path, issues);

  return record as unknown as IngestConnectorMcpApiRequestFixture;
}

function validateResourceSummariesCrossReferences(
  connectorId: unknown,
  resources: readonly IngestConnectorMcpResourceSummary[] | undefined,
  path: string,
  issues: IngestConnectorMcpApiValidationIssue[],
): void {
  if (!resources) {
    return;
  }

  const seenIds = new Set<string>();
  const seenUris = new Set<string>();
  for (const [index, resource] of resources.entries()) {
    const itemPath = `${path}[${index}]`;
    if (seenIds.has(resource.id)) {
      issues.push({ path: `${itemPath}.id`, message: "resource ids must be unique" });
    }
    seenIds.add(resource.id);
    if (seenUris.has(resource.uri)) {
      issues.push({ path: `${itemPath}.uri`, message: "resource URIs must be unique" });
    }
    seenUris.add(resource.uri);
    validateResourceConnectorReference(connectorId, resource, itemPath, issues);
  }
}

function validateResourceConnectorReference(
  connectorId: unknown,
  resource: IngestConnectorMcpResourceSummary | undefined,
  path: string,
  issues: IngestConnectorMcpApiValidationIssue[],
): void {
  if (!resource || typeof connectorId !== "string") {
    return;
  }
  const uriConnectorId = getIngestConnectorMcpResourceUriConnectorId(resource.uri);
  if (uriConnectorId && uriConnectorId !== connectorId) {
    issues.push({
      path: `${path}.uri`,
      message: "resource URI connector id must match connectorId",
    });
  }
}

function validateResourceContentLength(
  resource: IngestConnectorMcpResourceSummary | undefined,
  content: Record<string, unknown> | undefined,
  path: string,
  issues: IngestConnectorMcpApiValidationIssue[],
): void {
  if (!resource || !content || typeof content.text !== "string") {
    return;
  }
  if (resource.textBytes !== content.text.length) {
    issues.push({
      path: keyPath(path, "resource.textBytes"),
      message: "resource textBytes must match content text length",
    });
  }
}

function validatePreviewCrossReferences(
  record: Record<string, unknown>,
  resources: readonly IngestConnectorMcpResourceEnvelope[] | undefined,
  summary: Record<string, unknown> | undefined,
  path: string,
  issues: IngestConnectorMcpApiValidationIssue[],
): void {
  if (!resources) {
    return;
  }

  const resourcesPath = keyPath(path, "resources");
  const seenIds = new Set<string>();
  const seenUris = new Set<string>();
  let totalTextBytes = 0;

  for (const [index, item] of resources.entries()) {
    const itemPath = `${resourcesPath}[${index}]`;
    if (item.connectorId !== record.connectorId) {
      issues.push({
        path: `${itemPath}.connectorId`,
        message: "preview resource connectorId must match preview connectorId",
      });
    }
    if (seenIds.has(item.resource.id)) {
      issues.push({ path: `${itemPath}.resource.id`, message: "preview resource ids must be unique" });
    }
    seenIds.add(item.resource.id);
    if (seenUris.has(item.resource.uri)) {
      issues.push({ path: `${itemPath}.resource.uri`, message: "preview resource URIs must be unique" });
    }
    seenUris.add(item.resource.uri);
    totalTextBytes += item.resource.textBytes;
  }

  if (!summary) {
    return;
  }
  const summaryPath = keyPath(path, "summary");
  if (typeof summary.resourceCount === "number" && summary.resourceCount !== resources.length) {
    issues.push({ path: keyPath(summaryPath, "resourceCount"), message: "resourceCount must match resources length" });
  }
  if (typeof summary.totalTextBytes === "number" && summary.totalTextBytes !== totalTextBytes) {
    issues.push({
      path: keyPath(summaryPath, "totalTextBytes"),
      message: "totalTextBytes must match resource text byte total",
    });
  }
}

function validateRequestOperation(
  record: Record<string, unknown>,
  path: string,
  issues: IngestConnectorMcpApiValidationIssue[],
): void {
  if (record.operation === "resources/list") {
    if (record.resourceUri !== undefined) {
      issues.push({
        path: keyPath(path, "resourceUri"),
        message: "resources/list requests must not include resourceUri",
      });
    }
    if (record.responseSchemaVersion !== INGEST_CONNECTOR_MCP_RESOURCES_SCHEMA_VERSION) {
      issues.push({
        path: keyPath(path, "responseSchemaVersion"),
        message: `resources/list responses must use ${INGEST_CONNECTOR_MCP_RESOURCES_SCHEMA_VERSION}`,
      });
    }
  }
  if (record.operation === "resources/read") {
    if (typeof record.resourceUri !== "string") {
      issues.push({
        path: keyPath(path, "resourceUri"),
        message: "resources/read requests must include resourceUri",
      });
    }
    if (record.responseSchemaVersion !== INGEST_CONNECTOR_MCP_RESOURCE_SCHEMA_VERSION) {
      issues.push({
        path: keyPath(path, "responseSchemaVersion"),
        message: `resources/read responses must use ${INGEST_CONNECTOR_MCP_RESOURCE_SCHEMA_VERSION}`,
      });
    }
  }
  if (record.operation === "preview") {
    if (record.resourceUri !== undefined) {
      issues.push({
        path: keyPath(path, "resourceUri"),
        message: "preview requests must not include resourceUri",
      });
    }
    if (record.responseSchemaVersion !== INGEST_CONNECTOR_MCP_PREVIEW_SCHEMA_VERSION) {
      issues.push({
        path: keyPath(path, "responseSchemaVersion"),
        message: `preview responses must use ${INGEST_CONNECTOR_MCP_PREVIEW_SCHEMA_VERSION}`,
      });
    }
  }
}

function validateBundleCrossReferences(
  record: Record<string, unknown>,
  requests: readonly IngestConnectorMcpApiRequestFixture[] | undefined,
  resources: IngestConnectorMcpResourcesEnvelope | undefined,
  resourceFixtures: readonly IngestConnectorMcpResourceEnvelope[] | undefined,
  preview: IngestConnectorMcpPreviewEnvelope | undefined,
  path: string,
  issues: IngestConnectorMcpApiValidationIssue[],
): void {
  const connectorId = record.connectorId;
  if (typeof connectorId !== "string") {
    return;
  }

  if (resources && resources.connectorId !== connectorId) {
    issues.push({
      path: keyPath(path, "resources.connectorId"),
      message: "resources connectorId must match bundle connectorId",
    });
  }
  if (preview && preview.connectorId !== connectorId) {
    issues.push({
      path: keyPath(path, "preview.connectorId"),
      message: "preview connectorId must match bundle connectorId",
    });
  }

  const listedByUri = new Map<string, IngestConnectorMcpResourceSummary>();
  if (resources) {
    for (const resource of resources.resources) {
      listedByUri.set(resource.uri, resource);
    }
  }

  const fixtureByUri = new Map<string, IngestConnectorMcpResourceEnvelope>();
  if (resourceFixtures) {
    for (const [index, fixture] of resourceFixtures.entries()) {
      const itemPath = `${keyPath(path, "resourceFixtures")}[${index}]`;
      if (fixture.connectorId !== connectorId) {
        issues.push({
          path: `${itemPath}.connectorId`,
          message: "resource fixture connectorId must match bundle connectorId",
        });
      }
      if (fixtureByUri.has(fixture.resource.uri)) {
        issues.push({
          path: `${itemPath}.resource.uri`,
          message: "resource fixture URIs must be unique",
        });
      }
      fixtureByUri.set(fixture.resource.uri, fixture);
      const listed = listedByUri.get(fixture.resource.uri);
      if (!listed) {
        issues.push({
          path: `${itemPath}.resource.uri`,
          message: "resource fixture URI must be listed in resources",
        });
      } else if (!resourceSummariesEqual(listed, fixture.resource)) {
        issues.push({
          path: `${itemPath}.resource`,
          message: "resource fixture summary must match resources list summary",
        });
      }
    }
  }

  for (const [uri] of listedByUri) {
    if (!fixtureByUri.has(uri)) {
      issues.push({
        path: keyPath(path, "resourceFixtures"),
        message: `resourceFixtures must include ${uri}`,
      });
    }
  }

  validateRequestBundleReferences(record, requests, listedByUri, path, issues);
  validatePreviewBundleReferences(preview, fixtureByUri, path, issues);
}

function validateRequestBundleReferences(
  record: Record<string, unknown>,
  requests: readonly IngestConnectorMcpApiRequestFixture[] | undefined,
  listedByUri: ReadonlyMap<string, IngestConnectorMcpResourceSummary>,
  path: string,
  issues: IngestConnectorMcpApiValidationIssue[],
): void {
  if (!requests) {
    return;
  }

  const requestsPath = keyPath(path, "requests");
  const seenIds = new Set<string>();
  let hasListRequest = false;
  let hasPreviewRequest = false;

  for (const [index, request] of requests.entries()) {
    const itemPath = `${requestsPath}[${index}]`;
    if (seenIds.has(request.id)) {
      issues.push({ path: `${itemPath}.id`, message: "request ids must be unique" });
    }
    seenIds.add(request.id);
    if (request.connectorId !== record.connectorId) {
      issues.push({
        path: `${itemPath}.connectorId`,
        message: "request connectorId must match bundle connectorId",
      });
    }
    if (request.resourceUri) {
      const uriConnectorId = getIngestConnectorMcpResourceUriConnectorId(request.resourceUri);
      if (uriConnectorId && uriConnectorId !== request.connectorId) {
        issues.push({
          path: `${itemPath}.resourceUri`,
          message: "request resourceUri connector id must match request connectorId",
        });
      }
      if (!listedByUri.has(request.resourceUri)) {
        issues.push({
          path: `${itemPath}.resourceUri`,
          message: "request resourceUri must reference a listed resource",
        });
      }
    }
    if (request.operation === "resources/list") {
      hasListRequest = true;
    }
    if (request.operation === "preview") {
      hasPreviewRequest = true;
    }
  }

  if (!hasListRequest) {
    issues.push({ path: requestsPath, message: "requests must include a resources/list fixture" });
  }
  if (!hasPreviewRequest) {
    issues.push({ path: requestsPath, message: "requests must include a preview fixture" });
  }
}

function validatePreviewBundleReferences(
  preview: IngestConnectorMcpPreviewEnvelope | undefined,
  fixtureByUri: ReadonlyMap<string, IngestConnectorMcpResourceEnvelope>,
  path: string,
  issues: IngestConnectorMcpApiValidationIssue[],
): void {
  if (!preview) {
    return;
  }
  for (const [index, resource] of preview.resources.entries()) {
    const itemPath = `${keyPath(path, "preview.resources")}[${index}]`;
    const fixture = fixtureByUri.get(resource.resource.uri);
    if (!fixture) {
      issues.push({
        path: `${itemPath}.resource.uri`,
        message: "preview resources must reference resourceFixtures",
      });
      continue;
    }
    if (!resourceSummariesEqual(fixture.resource, resource.resource)) {
      issues.push({
        path: `${itemPath}.resource`,
        message: "preview resource summary must match resource fixture summary",
      });
    }
  }
}

function resourceSummariesEqual(
  left: IngestConnectorMcpResourceSummary,
  right: IngestConnectorMcpResourceSummary,
): boolean {
  return (
    left.id === right.id &&
    left.uri === right.uri &&
    left.name === right.name &&
    left.description === right.description &&
    left.mimeType === right.mimeType &&
    left.textBytes === right.textBytes
  );
}

function objectSchema(
  title: string,
  properties: Record<string, IngestConnectorMcpApiJsonSchema>,
  required: readonly string[],
  slug?: string,
): IngestConnectorMcpApiJsonSchema {
  return {
    $schema: INGEST_CONNECTOR_MCP_API_JSON_SCHEMA_DRAFT,
    $id: slug
      ? `https://schemas.sovereignops.local/ingest-connectors/mcp/${slug}.schema.json`
      : undefined,
    title,
    type: "object",
    additionalProperties: false,
    required,
    properties,
  };
}

function arraySchema(
  items: IngestConnectorMcpApiJsonSchema,
  minItems?: number,
): IngestConnectorMcpApiJsonSchema {
  return {
    type: "array",
    minItems,
    items,
  };
}

function constStringSchema(value: string): IngestConnectorMcpApiJsonSchema {
  return {
    type: "string",
    const: value,
    enum: [value],
  };
}

function constBooleanSchema(value: boolean): IngestConnectorMcpApiJsonSchema {
  return {
    type: "boolean",
    const: value,
    enum: [value],
  };
}

function enumSchema(
  values: readonly (string | number | boolean | null)[],
): IngestConnectorMcpApiJsonSchema {
  return {
    type: typeof values[0] === "string" ? "string" : undefined,
    enum: values,
  };
}

function connectorIdSchema(): IngestConnectorMcpApiJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: CONNECTOR_ID_PATTERN,
  };
}

function resourceIdSchema(): IngestConnectorMcpApiJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: RESOURCE_ID_PATTERN,
  };
}

function resourceUriSchema(): IngestConnectorMcpApiJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: RESOURCE_URI_PATTERN,
  };
}

function safePublicStringSchema(): IngestConnectorMcpApiJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: SAFE_PUBLIC_STRING_PATTERN,
  };
}

function mediaTypeSchema(): IngestConnectorMcpApiJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: MEDIA_TYPE_PATTERN,
  };
}

function timestampSchema(): IngestConnectorMcpApiJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: TIMESTAMP_PATTERN,
  };
}

function fixturePathSchema(): IngestConnectorMcpApiJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: FIXTURE_PATH_PATTERN,
  };
}

function requestIdSchema(): IngestConnectorMcpApiJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: REQUEST_ID_PATTERN,
  };
}

function bundleIdSchema(): IngestConnectorMcpApiJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: BUNDLE_ID_PATTERN,
  };
}

function positiveIntegerSchema(): IngestConnectorMcpApiJsonSchema {
  return {
    type: "integer",
    minimum: 1,
  };
}

function nonNegativeIntegerSchema(): IngestConnectorMcpApiJsonSchema {
  return {
    type: "integer",
    minimum: 0,
  };
}

function collectUnsafePublicStringIssues(
  value: unknown,
  path: string,
  issues: IngestConnectorMcpApiValidationIssue[],
  seen: WeakSet<object> = new WeakSet<object>(),
): void {
  if (typeof value === "string") {
    if (isUnsafePublicString(value)) {
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
      collectUnsafePublicStringIssues(item, `${path}[${index}]`, issues, seen);
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
    const nestedPath = keyPath(path, key);
    if (isUnsafePublicString(key)) {
      issues.push({
        path: nestedPath,
        message: "public field names must not include raw local paths, secrets, or private markers",
      });
    }
    collectUnsafePublicStringIssues(nested, nestedPath, issues, seen);
  }
  seen.delete(value);
}

function requireRecord(
  record: Record<string, unknown>,
  key: string,
  issues: IngestConnectorMcpApiValidationIssue[],
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
  issues: IngestConnectorMcpApiValidationIssue[],
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
  validator: (
    value: unknown,
    path: string,
    issues: IngestConnectorMcpApiValidationIssue[],
  ) => TRecord | undefined,
  nonEmpty: boolean,
  issues: IngestConnectorMcpApiValidationIssue[],
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

function validationResult<TRecord>(
  value: unknown,
  issues: IngestConnectorMcpApiValidationIssue[],
): IngestConnectorMcpApiValidationResult<TRecord> {
  return issues.length === 0
    ? { ok: true, issues, value: deepFreeze(cloneJson(value)) as TRecord }
    : { ok: false, issues };
}

function requireOnlyKeys(
  record: Record<string, unknown>,
  path: string,
  allowedKeys: readonly string[],
  issues: IngestConnectorMcpApiValidationIssue[],
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
  issues: IngestConnectorMcpApiValidationIssue[],
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
  issues: IngestConnectorMcpApiValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (typeof value !== "string" || !new RegExp(pattern).test(value)) {
    issues.push({ path: keyPath(parentPath, key), message });
  }
}

function requireConnectorId(
  record: Record<string, unknown>,
  key: string,
  issues: IngestConnectorMcpApiValidationIssue[],
  parentPath: string,
): void {
  requirePattern(record, key, CONNECTOR_ID_PATTERN, `${key} must be a safe connector id`, issues, parentPath);
}

function requireResourceUri(
  record: Record<string, unknown>,
  key: string,
  issues: IngestConnectorMcpApiValidationIssue[],
  parentPath: string,
): void {
  requirePattern(record, key, RESOURCE_URI_PATTERN, `${key} must be an ingest:// resource URI`, issues, parentPath);
}

function requireSafePublicString(
  record: Record<string, unknown>,
  key: string,
  issues: IngestConnectorMcpApiValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (typeof value !== "string" || !isSafePublicString(value)) {
    issues.push({
      path: keyPath(parentPath, key),
      message: `${key} must be a non-empty public string without raw local paths, secrets, or private markers`,
    });
  }
}

function requireBoolean(
  record: Record<string, unknown>,
  key: string,
  issues: IngestConnectorMcpApiValidationIssue[],
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
  issues: IngestConnectorMcpApiValidationIssue[],
  parentPath: string,
): void {
  if (record[key] !== expected) {
    issues.push({ path: keyPath(parentPath, key), message: `${key} must be ${expected}` });
  }
}

function requireTimestamp(
  record: Record<string, unknown>,
  key: string,
  issues: IngestConnectorMcpApiValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  const path = keyPath(parentPath, key);
  if (typeof value !== "string" || !timestampPattern.test(value)) {
    issues.push({ path, message: `${key} must be an ISO UTC timestamp` });
    return;
  }
  if (Number.isNaN(Date.parse(value))) {
    issues.push({ path, message: `${key} must be a valid timestamp` });
  }
}

function requirePositiveInteger(
  record: Record<string, unknown>,
  key: string,
  issues: IngestConnectorMcpApiValidationIssue[],
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
  issues: IngestConnectorMcpApiValidationIssue[],
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
  issues: IngestConnectorMcpApiValidationIssue[],
  parentPath: string,
): void {
  if (!allowed.includes(record[key] as TValue)) {
    issues.push({ path: keyPath(parentPath, key), message: `${key} must be one of ${allowed.join(", ")}` });
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
  kind: IngestConnectorMcpApiKind,
  issues: readonly IngestConnectorMcpApiValidationIssue[],
): string {
  const details = issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
  return `ingest connector MCP ${kind} validation failed: ${details}`;
}

const resourceSummaryKeys = [
  "id",
  "uri",
  "name",
  "description",
  "mimeType",
  "textBytes",
] as const;

const resourceTextContentKeys = ["type", "text", "truncated"] as const;

const resourcesEnvelopeKeys = [
  "schemaVersion",
  "generatedAt",
  "connectorId",
  "localOnly",
  "resources",
] as const;

const resourceEnvelopeKeys = [
  "schemaVersion",
  "generatedAt",
  "connectorId",
  "localOnly",
  "resource",
  "content",
] as const;

const previewRequestKeys = ["maxItems", "maxTextBytes"] as const;

const previewSummaryKeys = ["resourceCount", "totalTextBytes", "truncated"] as const;

const previewEnvelopeKeys = [
  "schemaVersion",
  "generatedAt",
  "connectorId",
  "localOnly",
  "dryRun",
  "request",
  "resources",
  "summary",
] as const;

const apiRequestFixtureKeys = [
  "id",
  "requestedAt",
  "connectorId",
  "operation",
  "resourceUri",
  "responseSchemaVersion",
  "fixture",
] as const;

const apiRequestBundleKeys = [
  "schemaVersion",
  "bundleId",
  "generatedAt",
  "connectorId",
  "localOnly",
  "requests",
  "resources",
  "resourceFixtures",
  "preview",
] as const;
