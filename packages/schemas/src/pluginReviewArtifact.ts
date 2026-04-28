export const PLUGIN_REVIEW_ARTIFACT_PREVIEW_SCHEMA_VERSION = "plugin-review-artifact-preview.v1";
export const PLUGIN_REVIEW_ARTIFACT_API_REQUESTS_SCHEMA_VERSION =
  "plugin-review-artifact-api-requests.v1";
export const JSON_SCHEMA_DRAFT = "https://json-schema.org/draft/2020-12/schema";

export const pluginReviewArtifactKinds = [
  "pluginReviewArtifactPreview",
  "pluginReviewArtifactApiRequests",
] as const;
export type PluginReviewArtifactKind = (typeof pluginReviewArtifactKinds)[number];

export const pluginReviewArtifactApiRouteMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type PluginReviewArtifactApiRouteMethod =
  (typeof pluginReviewArtifactApiRouteMethods)[number];

export const sourceFileRoles = [
  "manifest",
  "entrypoint",
  "source",
  "metadata",
  "asset",
  "test",
  "documentation",
] as const;
export type SourceFileRole = (typeof sourceFileRoles)[number];

export const redactionKinds = ["credential", "personalData", "internalPath", "proprietaryValue"] as const;
export type RedactionKind = (typeof redactionKinds)[number];

export const externalCallMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type ExternalCallMethod = (typeof externalCallMethods)[number];

export const previewRenderModes = ["markdown", "json", "text"] as const;
export type PreviewRenderMode = (typeof previewRenderModes)[number];

export type JsonSchemaType = "array" | "boolean" | "integer" | "null" | "number" | "object" | "string";

export interface PluginReviewArtifactJsonSchema {
  readonly $schema?: string;
  readonly $id?: string;
  readonly title?: string;
  readonly type?: JsonSchemaType | readonly JsonSchemaType[];
  readonly additionalProperties?: boolean | PluginReviewArtifactJsonSchema;
  readonly properties?: Record<string, PluginReviewArtifactJsonSchema>;
  readonly required?: readonly string[];
  readonly enum?: readonly (string | number | boolean | null)[];
  readonly const?: string | number | boolean | null;
  readonly pattern?: string;
  readonly minLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly items?: PluginReviewArtifactJsonSchema;
  readonly oneOf?: readonly PluginReviewArtifactJsonSchema[];
}

export interface PluginReviewArtifactSchemaDefinition {
  kind: PluginReviewArtifactKind;
  schemaVersion: string;
  title: string;
  schema: PluginReviewArtifactJsonSchema;
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

export interface SourceFile {
  id: string;
  path: string;
  mediaType: string;
  role: SourceFileRole;
  sha256: string;
  byteSize: number;
  includedInPreview: boolean;
}

export interface SourceRange {
  startLine: number;
  endLine: number;
  startColumn?: number;
  endColumn?: number;
}

export interface Redaction {
  id: string;
  sourceFileId: string;
  kind: RedactionKind;
  range: SourceRange;
  replacement: "[redacted]";
  originalFingerprint: string;
}

export interface ExternalCallProposal {
  id: string;
  method: ExternalCallMethod;
  url: string;
  purpose: string;
  requestedBySourceFileId: string;
  proposalOnly: true;
  executed: false;
}

export interface PreviewSection {
  id: string;
  title: string;
  sourceFileIds: readonly string[];
  redactionIds: readonly string[];
  contentFingerprint: string;
}

export interface ArtifactPreviewBody {
  artifactType: "pluginReviewArtifact";
  title: string;
  summary: string;
  renderMode: PreviewRenderMode;
  sections: readonly PreviewSection[];
}

export interface PluginReviewArtifactPreview {
  schemaVersion: typeof PLUGIN_REVIEW_ARTIFACT_PREVIEW_SCHEMA_VERSION;
  generatedAt: string;
  workspaceId: `wsp_${string}`;
  reviewId: `prv_${string}`;
  pluginId: `plug_${string}`;
  artifactId: `art_${string}`;
  localOnly: true;
  proposalOnly: true;
  fingerprint: string;
  sourceFiles: readonly SourceFile[];
  redactions: readonly Redaction[];
  externalCalls: readonly ExternalCallProposal[];
  preview: ArtifactPreviewBody;
}

export type PluginReviewArtifactApiJsonObject = {
  readonly [key: string]: PluginReviewArtifactApiJson;
};
export type PluginReviewArtifactApiJson =
  | string
  | number
  | boolean
  | null
  | readonly PluginReviewArtifactApiJson[]
  | PluginReviewArtifactApiJsonObject;

export interface PluginReviewArtifactApiFixtureRef {
  readonly id: string;
  readonly fixturePath: string;
}

export interface PluginReviewArtifactApiRoute {
  readonly method: PluginReviewArtifactApiRouteMethod;
  readonly path: string;
}

export interface PluginReviewArtifactApiRequestPayload {
  readonly headers?: Record<string, string>;
  readonly body?: PluginReviewArtifactApiJson;
}

export interface PluginReviewArtifactApiExpectation {
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
  readonly [key: string]: PluginReviewArtifactApiJson | undefined;
}

export interface PluginReviewArtifactApiRequestFixture {
  readonly id: string;
  readonly title: string;
  readonly route: PluginReviewArtifactApiRoute;
  readonly request: PluginReviewArtifactApiRequestPayload;
  readonly expect: PluginReviewArtifactApiExpectation;
}

export interface PluginReviewArtifactApiRequestBundle {
  readonly schemaVersion: typeof PLUGIN_REVIEW_ARTIFACT_API_REQUESTS_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly apiBase: string;
  readonly fixtureRefs?: readonly PluginReviewArtifactApiFixtureRef[];
  readonly requests: readonly PluginReviewArtifactApiRequestFixture[];
}

export interface PluginReviewArtifactObjectByKind {
  pluginReviewArtifactPreview: PluginReviewArtifactPreview;
  pluginReviewArtifactApiRequests: PluginReviewArtifactApiRequestBundle;
}

const HEX_SHA256_PATTERN = "^[a-f0-9]{64}$";
const ID_PATTERN = "^[A-Za-z][A-Za-z0-9_-]{0,95}$";
const WORKSPACE_ID_PATTERN = "^wsp_[A-Za-z0-9_-]{1,88}$";
const REVIEW_ID_PATTERN = "^prv_[A-Za-z0-9_-]{1,88}$";
const PLUGIN_ID_PATTERN = "^plug_[A-Za-z0-9_-]{1,88}$";
const ARTIFACT_ID_PATTERN = "^art_[A-Za-z0-9_-]{1,88}$";
const ISO_TIMESTAMP_PATTERN = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$";
const MEDIA_TYPE_PATTERN = "^[^\\s/]+/[^\\s]+$";
const LOCAL_SOURCE_FILE_PATH_PATTERN =
  "^(?!/)(?![A-Za-z]:)(?!.*(?:^|/)\\.\\.(?:/|$))(?!.*//)[A-Za-z0-9._/-]+$";
const HTTPS_URL_PATTERN = "^https://[^\\s]+$";
const API_REQUEST_ID_PATTERN =
  "^[A-Za-z][A-Za-z0-9_.:-]{0,127}$";
const API_FIXTURE_REF_ID_PATTERN = "^[A-Za-z][A-Za-z0-9_.-]{0,95}$";
const API_BASE_PATTERN = "^local://[a-z0-9][a-z0-9.-]{0,95}$";
const API_ROUTE_PATH_PATTERN = "^/v[0-9]+/(?!.*//)(?!.*\\.\\.)[A-Za-z0-9._~:/-]+$";
const SAFE_RELATIVE_JSON_FIXTURE_PATH_PATTERN =
  "^(?!/)(?![A-Za-z]:)(?!.*(?:^|/)\\.\\.(?:/|$))(?!.*//)[A-Za-z0-9._/-]+\\.json$";
const API_HEADER_NAME_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$";
const RAW_LOCAL_PATH_PATTERN_SOURCE =
  "(?:\\b[A-Za-z]:[\\\\/][^\\s\"',;)}\\]]+|\\\\\\\\[^\\\\\\s\"',;)}\\]]+[\\\\][^\\s\"',;)}\\]]+|file://[^\\s\"',;)}\\]]+|/(?:Users|home|var|tmp|private|mnt|Volumes)/[^\\s\"',;)}\\]]+)";
const PRIVATE_MARKER_PATTERN_SOURCE =
  "(?:^|[\\\\/])\\." +
  "codex-private" +
  "(?:[\\\\/]|$)|[pP][rR][iI][vV][aA][tT][eE][- _]?[pP][lL][aA][nN](?:[- _]?[pP][aA][cC][kK])?|[pP][rR][iI][vV][aA][tT][eE][- _]?[mM][aA][rR][kK][eE][rR]";
const RAW_SECRET_VALUE_PATTERN_SOURCE =
  "(?:[bB][eE][aA][rR][eE][rR]\\s+(?!\\[REDACTED\\])\\S{8,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:^|[^A-Za-z0-9])(?:sk|rk|pk|tok|pat|npm|ghp|gho)_[A-Za-z0-9_-]{8,}|(?:^|[^A-Za-z0-9])(?:sk|rk|pat|glpat|github_pat)-[A-Za-z0-9_-]{8,}|(?:[aA][pP][iI][_-]?[kK][eE][yY]|[aA][uU][tT][hH][oO][rR][iI][zZ][aA][tT][iI][oO][nN]|[cC][rR][eE][dD][eE][nN][tT][iI][aA][lL]|[pP][aA][sS][sS][wW][oO][rR][dD]|[pP][rR][iI][vV][aA][tT][eE][_-]?[kK][eE][yY]|[sS][eE][cC][rR][eE][tT]|[sS][eE][sS][sS][iI][oO][nN][_-]?[tT][oO][kK][eE][nN]|[tT][oO][kK][eE][nN])\\s*[:=]\\s*(?!\\[REDACTED\\])\\S+)";
const UNSAFE_PUBLIC_STRING_PATTERN_SOURCE =
  `${RAW_LOCAL_PATH_PATTERN_SOURCE}|${PRIVATE_MARKER_PATTERN_SOURCE}|${RAW_SECRET_VALUE_PATTERN_SOURCE}`;
const SAFE_PUBLIC_STRING_PATTERN = `^(?!.*(?:${UNSAFE_PUBLIC_STRING_PATTERN_SOURCE})).*\\S.*$`;
const unsafePublicStringPattern = new RegExp(UNSAFE_PUBLIC_STRING_PATTERN_SOURCE);

const sourceRangeSchema = objectSchema(
  "Plugin review source range",
  {
    startLine: positiveIntegerSchema(),
    endLine: positiveIntegerSchema(),
    startColumn: positiveIntegerSchema(),
    endColumn: positiveIntegerSchema(),
  },
  ["startLine", "endLine"],
);

const sourceFileSchema = objectSchema(
  "Plugin review source file",
  {
    id: identifierSchema(),
    path: localSourceFilePathSchema(),
    mediaType: mediaTypeSchema(),
    role: enumSchema(sourceFileRoles),
    sha256: fingerprintSchema(),
    byteSize: nonNegativeIntegerSchema(),
    includedInPreview: { type: "boolean" },
  },
  ["id", "path", "mediaType", "role", "sha256", "byteSize", "includedInPreview"],
);

const redactionSchema = objectSchema(
  "Plugin review redaction",
  {
    id: identifierSchema(),
    sourceFileId: identifierSchema(),
    kind: enumSchema(redactionKinds),
    range: sourceRangeSchema,
    replacement: {
      type: "string",
      const: "[redacted]",
    },
    originalFingerprint: fingerprintSchema(),
  },
  ["id", "sourceFileId", "kind", "range", "replacement", "originalFingerprint"],
);

const externalCallSchema = objectSchema(
  "Plugin review proposed external call",
  {
    id: identifierSchema(),
    method: enumSchema(externalCallMethods),
    url: httpsUrlSchema(),
    purpose: nonBlankStringSchema(),
    requestedBySourceFileId: identifierSchema(),
    proposalOnly: {
      type: "boolean",
      const: true,
    },
    executed: {
      type: "boolean",
      const: false,
    },
  },
  ["id", "method", "url", "purpose", "requestedBySourceFileId", "proposalOnly", "executed"],
);

const previewSectionSchema = objectSchema(
  "Plugin review preview section",
  {
    id: identifierSchema(),
    title: nonBlankStringSchema(),
    sourceFileIds: nonEmptyIdentifierArraySchema(),
    redactionIds: identifierArraySchema(),
    contentFingerprint: fingerprintSchema(),
  },
  ["id", "title", "sourceFileIds", "redactionIds", "contentFingerprint"],
);

const previewBodySchema = objectSchema(
  "Plugin review artifact preview body",
  {
    artifactType: {
      type: "string",
      const: "pluginReviewArtifact",
    },
    title: nonBlankStringSchema(),
    summary: nonBlankStringSchema(),
    renderMode: enumSchema(previewRenderModes),
    sections: arraySchema(previewSectionSchema, 1),
  },
  ["artifactType", "title", "summary", "renderMode", "sections"],
);

const apiSafeJsonValueSchema: PluginReviewArtifactJsonSchema = {
  oneOf: [
    { type: "string", pattern: SAFE_PUBLIC_STRING_PATTERN },
    { type: "number" },
    { type: "boolean" },
    { type: "null" },
    { type: "array" },
    { type: "object" },
  ],
};

const apiMetricMapSchema: PluginReviewArtifactJsonSchema = {
  type: "object",
  additionalProperties: nonNegativeIntegerSchema(),
};

const apiFixtureRefSchema = objectSchema(
  "Plugin review artifact API fixture reference",
  {
    id: apiFixtureRefIdSchema(),
    fixturePath: safeRelativeJsonFixturePathSchema(),
  },
  ["id", "fixturePath"],
);

const apiRouteSchema = objectSchema(
  "Plugin review artifact API route",
  {
    method: enumSchema(pluginReviewArtifactApiRouteMethods),
    path: apiRoutePathSchema(),
  },
  ["method", "path"],
);

const apiHeadersSchema: PluginReviewArtifactJsonSchema = {
  type: "object",
  additionalProperties: {
    type: "string",
    pattern: SAFE_PUBLIC_STRING_PATTERN,
  },
};

const apiRequestPayloadSchema = objectSchema(
  "Plugin review artifact API request payload",
  {
    headers: apiHeadersSchema,
    body: apiSafeJsonValueSchema,
  },
  [],
);

const apiExpectationSchema = objectSchema(
  "Plugin review artifact API expectation",
  {
    status: httpStatusSchema(),
    contentType: mediaTypeSchema(),
    kind: safePublicStringSchema(),
    schemaVersion: safePublicStringSchema(),
    pluginId: safePublicStringSchema(),
    recordId: safePublicStringSchema(),
    errorCode: safePublicStringSchema(),
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
  "Plugin review artifact API request fixture",
  {
    id: apiRequestIdSchema(),
    title: safePublicStringSchema(),
    route: apiRouteSchema,
    request: apiRequestPayloadSchema,
    expect: apiExpectationSchema,
  },
  ["id", "title", "route", "request", "expect"],
);

export const pluginReviewArtifactPreviewSchema = deepFreeze(
  objectSchema(
    "Plugin review artifact preview",
    {
      schemaVersion: {
        type: "string",
        const: PLUGIN_REVIEW_ARTIFACT_PREVIEW_SCHEMA_VERSION,
      },
      generatedAt: timestampSchema(),
      workspaceId: {
        type: "string",
        pattern: WORKSPACE_ID_PATTERN,
      },
      reviewId: {
        type: "string",
        pattern: REVIEW_ID_PATTERN,
      },
      pluginId: {
        type: "string",
        pattern: PLUGIN_ID_PATTERN,
      },
      artifactId: {
        type: "string",
        pattern: ARTIFACT_ID_PATTERN,
      },
      localOnly: {
        type: "boolean",
        const: true,
      },
      proposalOnly: {
        type: "boolean",
        const: true,
      },
      fingerprint: fingerprintSchema(),
      sourceFiles: arraySchema(sourceFileSchema, 1),
      redactions: arraySchema(redactionSchema),
      externalCalls: arraySchema(externalCallSchema),
      preview: previewBodySchema,
    },
    [
      "schemaVersion",
      "generatedAt",
      "workspaceId",
      "reviewId",
      "pluginId",
      "artifactId",
      "localOnly",
      "proposalOnly",
      "fingerprint",
      "sourceFiles",
      "redactions",
      "externalCalls",
      "preview",
    ],
    "artifact-preview",
  ),
);

export const pluginReviewArtifactApiRequestsSchema = deepFreeze(
  objectSchema(
    "Plugin review artifact API request fixture bundle",
    {
      schemaVersion: {
        type: "string",
        const: PLUGIN_REVIEW_ARTIFACT_API_REQUESTS_SCHEMA_VERSION,
      },
      generatedAt: timestampSchema(),
      apiBase: apiBaseSchema(),
      fixtureRefs: arraySchema(apiFixtureRefSchema),
      requests: arraySchema(apiRequestFixtureSchema, 1),
    },
    ["schemaVersion", "generatedAt", "apiBase", "requests"],
    "artifact-api-requests",
  ),
);

export const pluginReviewArtifactPreviewSchemaDefinition = deepFreeze({
  kind: "pluginReviewArtifactPreview",
  schemaVersion: PLUGIN_REVIEW_ARTIFACT_PREVIEW_SCHEMA_VERSION,
  title: pluginReviewArtifactPreviewSchema.title ?? "Plugin review artifact preview",
  schema: pluginReviewArtifactPreviewSchema,
} satisfies PluginReviewArtifactSchemaDefinition);

export const pluginReviewArtifactSchemaDefinitions = deepFreeze({
  pluginReviewArtifactPreview: pluginReviewArtifactPreviewSchemaDefinition,
  pluginReviewArtifactApiRequests: {
    kind: "pluginReviewArtifactApiRequests",
    schemaVersion: PLUGIN_REVIEW_ARTIFACT_API_REQUESTS_SCHEMA_VERSION,
    title:
      pluginReviewArtifactApiRequestsSchema.title ??
      "Plugin review artifact API request fixture bundle",
    schema: pluginReviewArtifactApiRequestsSchema,
  },
} satisfies Record<PluginReviewArtifactKind, PluginReviewArtifactSchemaDefinition>);

export const pluginReviewArtifactSchemas = {
  pluginReviewArtifactPreview: pluginReviewArtifactPreviewSchema,
  pluginReviewArtifactApiRequests: pluginReviewArtifactApiRequestsSchema,
} as const satisfies Record<PluginReviewArtifactKind, PluginReviewArtifactJsonSchema>;

export const pluginReviewArtifactValidators = {
  pluginReviewArtifactPreview: validatePluginReviewArtifactPreview,
  pluginReviewArtifactApiRequests: validatePluginReviewArtifactApiRequestBundle,
} as const;

export function getPluginReviewArtifactSchema(kind: PluginReviewArtifactKind): PluginReviewArtifactJsonSchema {
  return pluginReviewArtifactSchemas[kind];
}

export function getPluginReviewArtifactPreviewSchema(): PluginReviewArtifactJsonSchema {
  return pluginReviewArtifactPreviewSchema;
}

export function validatePluginReviewArtifactObject<K extends PluginReviewArtifactKind>(
  kind: K,
  value: unknown,
): ValidationResult<PluginReviewArtifactObjectByKind[K]> {
  const validator = pluginReviewArtifactValidators[kind] as (candidate: unknown) => ValidationResult<unknown>;
  return validator(value) as ValidationResult<PluginReviewArtifactObjectByKind[K]>;
}

export function assertPluginReviewArtifactObject<K extends PluginReviewArtifactKind>(
  kind: K,
  value: unknown,
): asserts value is PluginReviewArtifactObjectByKind[K] {
  const result = validatePluginReviewArtifactObject(kind, value);
  if (!result.ok) {
    throw new Error(formatValidationIssues(kind, result.issues));
  }
}

export function validatePluginReviewArtifactPreview(
  value: unknown,
): ValidationResult<PluginReviewArtifactPreview> {
  const issues = recordIssues(value, "$");
  if (issues.length > 0) {
    return invalid(issues);
  }

  const record = value as Record<string, unknown>;
  requireOnlyKeys(record, "$", topLevelKeys, issues);
  requireExactString(record, "schemaVersion", PLUGIN_REVIEW_ARTIFACT_PREVIEW_SCHEMA_VERSION, issues);
  requireTimestamp(record, "generatedAt", issues);
  requirePattern(record, "workspaceId", WORKSPACE_ID_PATTERN, "workspaceId must use the wsp_ id prefix", issues);
  requirePattern(record, "reviewId", REVIEW_ID_PATTERN, "reviewId must use the prv_ id prefix", issues);
  requirePattern(record, "pluginId", PLUGIN_ID_PATTERN, "pluginId must use the plug_ id prefix", issues);
  requirePattern(record, "artifactId", ARTIFACT_ID_PATTERN, "artifactId must use the art_ id prefix", issues);
  requireTrue(record, "localOnly", issues);
  requireTrue(record, "proposalOnly", issues);
  requireFingerprint(record, "fingerprint", issues, "$");

  const sourceFiles = validateArray(record, "sourceFiles", issues, validateSourceFile, true);
  const redactions = validateArray(record, "redactions", issues, validateRedaction);
  const externalCalls = validateArray(record, "externalCalls", issues, validateExternalCall);
  const preview = requireRecord(record, "preview", issues);
  const previewValue = preview ? validatePreviewBody(preview, "preview", issues) : undefined;

  validateCrossReferences(
    {
      sourceFiles,
      redactions,
      externalCalls,
      preview: previewValue,
    },
    issues,
  );

  return validationResult(value, issues);
}

export function assertPluginReviewArtifactPreview(
  value: unknown,
): asserts value is PluginReviewArtifactPreview {
  const result = validatePluginReviewArtifactPreview(value);
  if (!result.ok) {
    throw new Error(formatValidationIssues("pluginReviewArtifactPreview", result.issues));
  }
}

export function validatePluginReviewArtifactApiRequestBundle(
  value: unknown,
): ValidationResult<PluginReviewArtifactApiRequestBundle> {
  const issues: ValidationIssue[] = [];
  collectApiPublicStringIssues(value, "$", issues);
  validatePluginReviewArtifactApiRequestBundleValue(value, "$", issues);
  return validationResult(value, issues);
}

export function assertPluginReviewArtifactApiRequestBundle(
  value: unknown,
): asserts value is PluginReviewArtifactApiRequestBundle {
  const result = validatePluginReviewArtifactApiRequestBundle(value);
  if (!result.ok) {
    throw new Error(formatValidationIssues("pluginReviewArtifactApiRequests", result.issues));
  }
}

export function isPluginReviewArtifactFingerprint(value: string): boolean {
  return new RegExp(HEX_SHA256_PATTERN).test(value);
}

export function isPluginReviewArtifactSourceFilePath(value: string): boolean {
  return (
    value.trim() === value &&
    new RegExp(LOCAL_SOURCE_FILE_PATH_PATTERN).test(value) &&
    hasSafePathTail(value)
  );
}

function validateSourceFile(value: unknown, path: string, issues: ValidationIssue[]): SourceFile | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, sourceFileKeys, issues);
  requireIdentifier(record, "id", issues, path);
  requireLocalSourceFilePath(record, "path", issues, path);
  requireMediaType(record, "mediaType", issues, path);
  requireEnum(record, "role", sourceFileRoles, issues, path);
  requireFingerprint(record, "sha256", issues, path);
  requireNonNegativeInteger(record, "byteSize", issues, path);
  requireBoolean(record, "includedInPreview", issues, path);

  return record as unknown as SourceFile;
}

function validateRedaction(value: unknown, path: string, issues: ValidationIssue[]): Redaction | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, redactionKeys, issues);
  requireIdentifier(record, "id", issues, path);
  requireIdentifier(record, "sourceFileId", issues, path);
  requireEnum(record, "kind", redactionKinds, issues, path);
  requireExactString(record, "replacement", "[redacted]", issues, path);
  requireFingerprint(record, "originalFingerprint", issues, path);

  const range = requireRecord(record, "range", issues, path);
  if (range) {
    validateSourceRange(range, `${path}.range`, issues);
  }

  return record as unknown as Redaction;
}

function validateExternalCall(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): ExternalCallProposal | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, externalCallKeys, issues);
  requireIdentifier(record, "id", issues, path);
  requireEnum(record, "method", externalCallMethods, issues, path);
  requireHttpsUrl(record, "url", issues, path);
  requireNonEmptyString(record, "purpose", issues, path);
  requireIdentifier(record, "requestedBySourceFileId", issues, path);
  requireTrue(record, "proposalOnly", issues, path);
  requireFalse(record, "executed", issues, path);

  return record as unknown as ExternalCallProposal;
}

function validatePreviewBody(
  record: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
): ArtifactPreviewBody | undefined {
  requireOnlyKeys(record, path, previewBodyKeys, issues);
  requireExactString(record, "artifactType", "pluginReviewArtifact", issues, path);
  requireNonEmptyString(record, "title", issues, path);
  requireNonEmptyString(record, "summary", issues, path);
  requireEnum(record, "renderMode", previewRenderModes, issues, path);
  validateArray(record, "sections", issues, validatePreviewSection, true, path);

  return record as unknown as ArtifactPreviewBody;
}

function validatePreviewSection(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): PreviewSection | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, previewSectionKeys, issues);
  requireIdentifier(record, "id", issues, path);
  requireNonEmptyString(record, "title", issues, path);
  requireIdentifierArray(record, "sourceFileIds", issues, path, true);
  requireIdentifierArray(record, "redactionIds", issues, path, false);
  requireFingerprint(record, "contentFingerprint", issues, path);

  return record as unknown as PreviewSection;
}

function validateSourceRange(range: Record<string, unknown>, path: string, issues: ValidationIssue[]): void {
  requireOnlyKeys(range, path, sourceRangeKeys, issues);
  requirePositiveInteger(range, "startLine", issues, path);
  requirePositiveInteger(range, "endLine", issues, path);
  optionalPositiveInteger(range, "startColumn", issues, path);
  optionalPositiveInteger(range, "endColumn", issues, path);

  if (
    typeof range.startLine === "number" &&
    typeof range.endLine === "number" &&
    range.endLine < range.startLine
  ) {
    issues.push({ path: `${path}.endLine`, message: "endLine must be greater than or equal to startLine" });
  }

  if (
    typeof range.startLine === "number" &&
    typeof range.endLine === "number" &&
    range.endLine <= range.startLine &&
    typeof range.startColumn === "number" &&
    typeof range.endColumn === "number" &&
    range.endColumn < range.startColumn
  ) {
    issues.push({ path: `${path}.endColumn`, message: "endColumn must be greater than or equal to startColumn" });
  }
}

function validateCrossReferences(
  values: {
    sourceFiles?: SourceFile[];
    redactions?: Redaction[];
    externalCalls?: ExternalCallProposal[];
    preview?: ArtifactPreviewBody;
  },
  issues: ValidationIssue[],
): void {
  const sourceFiles = values.sourceFiles ?? [];
  const redactions = values.redactions ?? [];
  const externalCalls = values.externalCalls ?? [];
  const previewSections = values.preview?.sections ?? [];

  const sourceFileIds = uniqueIdSet(sourceFiles, "sourceFiles", issues);
  const includedSourceFileIds = new Set(
    sourceFiles.filter((sourceFile) => sourceFile.includedInPreview).map((sourceFile) => sourceFile.id),
  );
  const redactionIds = uniqueIdSet(redactions, "redactions", issues);
  uniqueIdSet(externalCalls, "externalCalls", issues);
  uniqueIdSet(previewSections, "preview.sections", issues);

  for (const [index, redaction] of redactions.entries()) {
    if (!sourceFileIds.has(redaction.sourceFileId)) {
      issues.push({
        path: `redactions[${index}].sourceFileId`,
        message: "sourceFileId must reference a source file id",
      });
    }
  }

  for (const [index, externalCall] of externalCalls.entries()) {
    if (!sourceFileIds.has(externalCall.requestedBySourceFileId)) {
      issues.push({
        path: `externalCalls[${index}].requestedBySourceFileId`,
        message: "requestedBySourceFileId must reference a source file id",
      });
    }
  }

  for (const [sectionIndex, section] of previewSections.entries()) {
    for (const [sourceIndex, sourceFileId] of section.sourceFileIds.entries()) {
      if (!sourceFileIds.has(sourceFileId)) {
        issues.push({
          path: `preview.sections[${sectionIndex}].sourceFileIds[${sourceIndex}]`,
          message: "sourceFileIds must reference source file ids",
        });
        continue;
      }
      if (!includedSourceFileIds.has(sourceFileId)) {
        issues.push({
          path: `preview.sections[${sectionIndex}].sourceFileIds[${sourceIndex}]`,
          message: "sourceFileIds must reference files included in the preview",
        });
      }
    }
    for (const [redactionIndex, redactionId] of section.redactionIds.entries()) {
      if (!redactionIds.has(redactionId)) {
        issues.push({
          path: `preview.sections[${sectionIndex}].redactionIds[${redactionIndex}]`,
          message: "redactionIds must reference redaction ids",
        });
      }
    }
  }
}

function validatePluginReviewArtifactApiRequestBundleValue(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): PluginReviewArtifactApiRequestBundle | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, apiRequestBundleKeys, issues);
  requireExactString(record, "schemaVersion", PLUGIN_REVIEW_ARTIFACT_API_REQUESTS_SCHEMA_VERSION, issues, path);
  requireTimestampAtPath(record, "generatedAt", issues, path);
  requirePattern(record, "apiBase", API_BASE_PATTERN, "apiBase must be a local:// API base", issues, path);

  const fixtureRefs = record.fixtureRefs !== undefined
    ? validateArray(record, "fixtureRefs", issues, validateApiFixtureRef, false, path)
    : undefined;
  const fixtureRefIds = validateApiFixtureRefIds(fixtureRefs, issues);
  const requests = validateArray(record, "requests", issues, validateApiRequestFixture, true, path);
  validateApiRequestIds(requests, issues);
  validateApiFixtureRefObjects(record, fixtureRefIds, path, issues);
  validateApiLocalFixturePathValues(record, path, issues);

  return record as unknown as PluginReviewArtifactApiRequestBundle;
}

function validateApiFixtureRef(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): PluginReviewArtifactApiFixtureRef | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, apiFixtureRefKeys, issues);
  requirePattern(record, "id", API_FIXTURE_REF_ID_PATTERN, "id must be a non-empty fixture ref id", issues, path);
  requireSafeRelativeJsonFixturePath(record, "fixturePath", issues, path);
  return record as unknown as PluginReviewArtifactApiFixtureRef;
}

function validateApiRequestFixture(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): PluginReviewArtifactApiRequestFixture | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, apiRequestFixtureKeys, issues);
  requirePattern(record, "id", API_REQUEST_ID_PATTERN, "id must be a non-empty safe request id", issues, path);
  requireSafePublicString(record, "title", issues, path);

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

  return record as unknown as PluginReviewArtifactApiRequestFixture;
}

function validateApiRoute(record: Record<string, unknown>, path: string, issues: ValidationIssue[]): void {
  requireOnlyKeys(record, path, apiRouteKeys, issues);
  requireEnum(record, "method", pluginReviewArtifactApiRouteMethods, issues, path);
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
    if (typeof headerValue !== "string" || !isSafePublicString(headerValue)) {
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
    requireMediaType(record, "contentType", issues, path);
  }
  for (const key of apiExpectationStringKeys) {
    if (record[key] !== undefined) {
      requireSafePublicString(record, key, issues, path);
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
    if (!isSafePublicString(key)) {
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
  fixtureRefs: readonly PluginReviewArtifactApiFixtureRef[] | undefined,
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
  requests: readonly PluginReviewArtifactApiRequestFixture[] | undefined,
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
  properties: Record<string, PluginReviewArtifactJsonSchema>,
  required: readonly string[],
  slug?: string,
): PluginReviewArtifactJsonSchema {
  return {
    $schema: JSON_SCHEMA_DRAFT,
    $id: slug ? `https://schemas.sovereignops.local/plugin-review/${slug}.schema.json` : undefined,
    title,
    type: "object",
    additionalProperties: false,
    required,
    properties,
  };
}

function arraySchema(items: PluginReviewArtifactJsonSchema, minItems?: number): PluginReviewArtifactJsonSchema {
  return {
    type: "array",
    minItems,
    items,
  };
}

function identifierSchema(): PluginReviewArtifactJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: ID_PATTERN,
  };
}

function nonBlankStringSchema(): PluginReviewArtifactJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: "\\S",
  };
}

function timestampSchema(): PluginReviewArtifactJsonSchema {
  return {
    type: "string",
    pattern: ISO_TIMESTAMP_PATTERN,
  };
}

function localSourceFilePathSchema(): PluginReviewArtifactJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: LOCAL_SOURCE_FILE_PATH_PATTERN,
  };
}

function mediaTypeSchema(): PluginReviewArtifactJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: MEDIA_TYPE_PATTERN,
  };
}

function safePublicStringSchema(): PluginReviewArtifactJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: SAFE_PUBLIC_STRING_PATTERN,
  };
}

function apiRequestIdSchema(): PluginReviewArtifactJsonSchema {
  return {
    type: "string",
    pattern: API_REQUEST_ID_PATTERN,
  };
}

function apiFixtureRefIdSchema(): PluginReviewArtifactJsonSchema {
  return {
    type: "string",
    pattern: API_FIXTURE_REF_ID_PATTERN,
  };
}

function apiBaseSchema(): PluginReviewArtifactJsonSchema {
  return {
    type: "string",
    pattern: API_BASE_PATTERN,
  };
}

function apiRoutePathSchema(): PluginReviewArtifactJsonSchema {
  return {
    type: "string",
    pattern: API_ROUTE_PATH_PATTERN,
  };
}

function safeRelativeJsonFixturePathSchema(): PluginReviewArtifactJsonSchema {
  return {
    type: "string",
    pattern: SAFE_RELATIVE_JSON_FIXTURE_PATH_PATTERN,
  };
}

function httpStatusSchema(): PluginReviewArtifactJsonSchema {
  return {
    type: "integer",
    minimum: 100,
    maximum: 599,
  };
}

function fingerprintSchema(): PluginReviewArtifactJsonSchema {
  return {
    type: "string",
    pattern: HEX_SHA256_PATTERN,
  };
}

function httpsUrlSchema(): PluginReviewArtifactJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: HTTPS_URL_PATTERN,
  };
}

function positiveIntegerSchema(): PluginReviewArtifactJsonSchema {
  return {
    type: "integer",
    minimum: 1,
  };
}

function nonNegativeIntegerSchema(): PluginReviewArtifactJsonSchema {
  return {
    type: "integer",
    minimum: 0,
  };
}

function enumSchema(values: readonly (string | number | boolean | null)[]): PluginReviewArtifactJsonSchema {
  return {
    type: typeof values[0] === "string" ? "string" : undefined,
    enum: values,
  };
}

function identifierArraySchema(minItems?: number): PluginReviewArtifactJsonSchema {
  return {
    type: "array",
    minItems,
    items: identifierSchema(),
  };
}

function nonEmptyIdentifierArraySchema(): PluginReviewArtifactJsonSchema {
  return identifierArraySchema(1);
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
    if (!isSafePublicString(value)) {
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
  parentPath?: string,
): TRecord[] | undefined {
  const value = record[key];
  const path = parentPath ? `${parentPath}.${key}` : key;
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

function requireFalse(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  if (record[key] !== false) {
    issues.push({ path: `${parentPath}.${key}`, message: `${key} must be false` });
  }
}

function requireTimestamp(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
): void {
  const value = record[key];
  if (typeof value !== "string" || !new RegExp(ISO_TIMESTAMP_PATTERN).test(value)) {
    issues.push({ path: key, message: `${key} must be an ISO UTC timestamp` });
    return;
  }
  if (Number.isNaN(Date.parse(value))) {
    issues.push({ path: key, message: `${key} must be a valid timestamp` });
  }
}

function requireTimestampAtPath(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  const path = parentPath === "$" ? key : `${parentPath}.${key}`;
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

function requireSafePublicString(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (typeof value !== "string" || !isSafePublicString(value)) {
    issues.push({
      path: `${parentPath}.${key}`,
      message: `${key} must be a public string without raw local paths, secrets, or private markers`,
    });
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

function requirePositiveInteger(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    issues.push({ path: `${parentPath}.${key}`, message: `${key} must be a positive integer` });
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

function requireLocalSourceFilePath(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (typeof value !== "string" || !isPluginReviewArtifactSourceFilePath(value)) {
    issues.push({
      path: `${parentPath}.${key}`,
      message: `${key} must be a safe local source file path`,
    });
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

function requireFingerprint(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  const path = parentPath === "$" ? key : `${parentPath}.${key}`;
  if (typeof value !== "string" || !isPluginReviewArtifactFingerprint(value)) {
    issues.push({ path, message: `${key} must be a lowercase sha256 digest` });
  }
}

function requireHttpsUrl(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (typeof value !== "string" || !new RegExp(HTTPS_URL_PATTERN).test(value)) {
    issues.push({ path: `${parentPath}.${key}`, message: `${key} must be an https URL without whitespace` });
  }
}

function requireIdentifierArray(
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
    issues.push({ path: `${parentPath}.${key}`, message: `${key} must contain at least one id` });
  }
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || !new RegExp(ID_PATTERN).test(item)) {
      issues.push({ path: `${parentPath}.${key}[${index}]`, message: `${key} values must be local identifiers` });
    }
  }
}

function uniqueIdSet<TRecord extends { id: string }>(
  records: readonly TRecord[],
  path: string,
  issues: ValidationIssue[],
): Set<string> {
  const ids = new Set<string>();
  for (const [index, record] of records.entries()) {
    if (ids.has(record.id)) {
      issues.push({ path: `${path}[${index}].id`, message: "id values must be unique" });
      continue;
    }
    ids.add(record.id);
  }
  return ids;
}

function hasSafePathTail(path: string): boolean {
  if (path.length === 0 || path.includes("\\") || path.startsWith("/") || path.endsWith("/")) {
    return false;
  }
  return path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function isSafeRelativeJsonFixturePath(value: string): boolean {
  return (
    value.trim() === value &&
    new RegExp(SAFE_RELATIVE_JSON_FIXTURE_PATH_PATTERN).test(value) &&
    !unsafePublicStringPattern.test(value)
  );
}

function isSafePublicString(value: string): boolean {
  return value.trim().length > 0 && !unsafePublicStringPattern.test(value);
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

function formatValidationIssues(kind: PluginReviewArtifactKind, issues: readonly ValidationIssue[]): string {
  const details = issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
  return `${kind} validation failed: ${details}`;
}

const topLevelKeys = [
  "schemaVersion",
  "generatedAt",
  "workspaceId",
  "reviewId",
  "pluginId",
  "artifactId",
  "localOnly",
  "proposalOnly",
  "fingerprint",
  "sourceFiles",
  "redactions",
  "externalCalls",
  "preview",
] as const;

const sourceFileKeys = ["id", "path", "mediaType", "role", "sha256", "byteSize", "includedInPreview"] as const;

const redactionKeys = ["id", "sourceFileId", "kind", "range", "replacement", "originalFingerprint"] as const;

const sourceRangeKeys = ["startLine", "endLine", "startColumn", "endColumn"] as const;

const externalCallKeys = [
  "id",
  "method",
  "url",
  "purpose",
  "requestedBySourceFileId",
  "proposalOnly",
  "executed",
] as const;

const previewBodyKeys = ["artifactType", "title", "summary", "renderMode", "sections"] as const;

const previewSectionKeys = ["id", "title", "sourceFileIds", "redactionIds", "contentFingerprint"] as const;

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
