import { PLUGIN_REVIEW_ARTIFACT_PREVIEW_SCHEMA_VERSION } from "./pluginReviewArtifact.ts";

export const PLUGIN_REVIEW_ARTIFACT_RECORD_SCHEMA_VERSION = "plugin-review-artifact-record/v1";
export const PLUGIN_REVIEW_ARTIFACT_RECORD_LIST_SCHEMA_VERSION =
  "plugin-review-artifact-record-list/v1";
export const PLUGIN_REVIEW_ARTIFACT_RECORD_COMPARISON_SCHEMA_VERSION =
  "plugin-review-artifact-record-comparison/v1";
export const PLUGIN_REVIEW_ARTIFACT_RECORD_CREATE_REQUEST_SCHEMA_VERSION =
  "plugin-review-artifact-record-create-request/v1";
export const PLUGIN_REVIEW_ARTIFACT_RECORD_API_REQUESTS_SCHEMA_VERSION =
  "plugin-review-artifact-records-requests.v1";
export const JSON_SCHEMA_DRAFT = "https://json-schema.org/draft/2020-12/schema";

export const pluginReviewArtifactRecordKinds = [
  "pluginReviewArtifactRecord",
  "pluginReviewArtifactRecordList",
  "pluginReviewArtifactRecordComparison",
  "pluginReviewArtifactRecordCreateRequest",
  "pluginReviewArtifactRecordApiRequests",
] as const;
export type PluginReviewArtifactRecordKind = (typeof pluginReviewArtifactRecordKinds)[number];

export const pluginReviewArtifactRecordApiRouteMethods = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
] as const;
export type PluginReviewArtifactRecordApiRouteMethod =
  (typeof pluginReviewArtifactRecordApiRouteMethods)[number];

export const pluginReviewArtifactRecordDecisions = [
  "approved",
  "approval_required",
  "denied",
] as const;
export type PluginReviewArtifactRecordDecision =
  (typeof pluginReviewArtifactRecordDecisions)[number];

export const pluginReviewArtifactRecordComparisonChanges = ["added", "removed", "changed"] as const;
export type PluginReviewArtifactRecordComparisonChange =
  (typeof pluginReviewArtifactRecordComparisonChanges)[number];

export type JsonSchemaType = "array" | "boolean" | "integer" | "null" | "number" | "object" | "string";

export interface PluginReviewArtifactRecordJsonSchema {
  readonly $schema?: string;
  readonly $id?: string;
  readonly title?: string;
  readonly type?: JsonSchemaType | readonly JsonSchemaType[];
  readonly additionalProperties?: boolean | PluginReviewArtifactRecordJsonSchema;
  readonly propertyNames?: PluginReviewArtifactRecordJsonSchema;
  readonly properties?: Record<string, PluginReviewArtifactRecordJsonSchema>;
  readonly required?: readonly string[];
  readonly enum?: readonly (string | number | boolean | null)[];
  readonly const?: string | number | boolean | null;
  readonly pattern?: string;
  readonly minLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minItems?: number;
  readonly items?: PluginReviewArtifactRecordJsonSchema;
  readonly oneOf?: readonly PluginReviewArtifactRecordJsonSchema[];
}

export interface PluginReviewArtifactRecordSchemaDefinition {
  kind: PluginReviewArtifactRecordKind;
  schemaVersion: string;
  title: string;
  schema: PluginReviewArtifactRecordJsonSchema;
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

export type PluginReviewArtifactRecordMetadataValue = string | number | boolean | null;
export type PluginReviewArtifactRecordMetadata = Record<string, PluginReviewArtifactRecordMetadataValue>;

export interface PluginReviewArtifactSourceRef {
  previewSchemaVersion: typeof PLUGIN_REVIEW_ARTIFACT_PREVIEW_SCHEMA_VERSION;
  previewFingerprint: string;
  artifactPath: string;
}

export interface PluginReviewArtifactRecordSummary {
  gateCount: number;
  passedGateCount: number;
  failedGateCount: number;
  pendingGateCount: number;
  warningGateCount: number;
  skippedGateCount: number;
  sandboxFindingCount: number;
  blockingFindingCount: number;
  evidenceCount: number;
  redactionCount: number;
  externalCallProposalCount: number;
}

export interface PluginReviewArtifactStoredRecord {
  schemaVersion: typeof PLUGIN_REVIEW_ARTIFACT_RECORD_SCHEMA_VERSION;
  id: `prar_${string}`;
  artifactFingerprint: string;
  createdAt: string;
  workspaceId: `wsp_${string}`;
  reviewId: `prv_${string}`;
  pluginId: `plug_${string}`;
  artifactId: `art_${string}`;
  source: PluginReviewArtifactSourceRef;
  localOnly: true;
  redacted: true;
  decision: PluginReviewArtifactRecordDecision;
  summary: PluginReviewArtifactRecordSummary;
  metadata?: PluginReviewArtifactRecordMetadata;
}

export interface PluginReviewArtifactRecordList {
  schemaVersion: typeof PLUGIN_REVIEW_ARTIFACT_RECORD_LIST_SCHEMA_VERSION;
  generatedAt: string;
  workspaceId: `wsp_${string}`;
  localOnly: true;
  redacted: true;
  records: readonly PluginReviewArtifactStoredRecord[];
}

export interface PluginReviewArtifactRecordComparisonSummary {
  added: number;
  removed: number;
  changed: number;
  total: number;
}

export interface PluginReviewArtifactRecordComparisonDifference {
  path: string;
  change: PluginReviewArtifactRecordComparisonChange;
  baseArtifactFingerprint?: string;
  candidateArtifactFingerprint?: string;
}

export interface PluginReviewArtifactRecordComparison {
  schemaVersion: typeof PLUGIN_REVIEW_ARTIFACT_RECORD_COMPARISON_SCHEMA_VERSION;
  createdAt: string;
  workspaceId: `wsp_${string}`;
  localOnly: true;
  redacted: true;
  baseRecordId: `prar_${string}`;
  candidateRecordId: `prar_${string}`;
  baseArtifactFingerprint: string;
  candidateArtifactFingerprint: string;
  baseDecision: PluginReviewArtifactRecordDecision;
  candidateDecision: PluginReviewArtifactRecordDecision;
  compatible: boolean;
  comparisonSummary: PluginReviewArtifactRecordComparisonSummary;
  differences: readonly PluginReviewArtifactRecordComparisonDifference[];
}

export interface PluginReviewArtifactRecordCreateRequest {
  schemaVersion: typeof PLUGIN_REVIEW_ARTIFACT_RECORD_CREATE_REQUEST_SCHEMA_VERSION;
  requestedAt: string;
  workspaceId: `wsp_${string}`;
  reviewId: `prv_${string}`;
  pluginId: `plug_${string}`;
  artifactId: `art_${string}`;
  artifactFingerprint: string;
  source: PluginReviewArtifactSourceRef;
  localOnly: true;
  redacted: true;
  decision: PluginReviewArtifactRecordDecision;
  summary: PluginReviewArtifactRecordSummary;
  metadata?: PluginReviewArtifactRecordMetadata;
}

export type PluginReviewArtifactRecordApiJsonObject = {
  readonly [key: string]: PluginReviewArtifactRecordApiJson;
};
export type PluginReviewArtifactRecordApiJson =
  | string
  | number
  | boolean
  | null
  | readonly PluginReviewArtifactRecordApiJson[]
  | PluginReviewArtifactRecordApiJsonObject;

export interface PluginReviewArtifactRecordApiFixtureRef {
  readonly id: string;
  readonly fixturePath: string;
}

export interface PluginReviewArtifactRecordApiRoute {
  readonly method: PluginReviewArtifactRecordApiRouteMethod;
  readonly path: string;
}

export interface PluginReviewArtifactRecordApiRequestPayload {
  readonly headers?: Record<string, string>;
  readonly body?: PluginReviewArtifactRecordApiJson;
}

export interface PluginReviewArtifactRecordApiExpectation {
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
  readonly [key: string]: PluginReviewArtifactRecordApiJson | undefined;
}

export interface PluginReviewArtifactRecordApiRequestFixture {
  readonly id: string;
  readonly title: string;
  readonly route: PluginReviewArtifactRecordApiRoute;
  readonly request: PluginReviewArtifactRecordApiRequestPayload;
  readonly expect: PluginReviewArtifactRecordApiExpectation;
}

export interface PluginReviewArtifactRecordApiRequestBundle {
  readonly schemaVersion: typeof PLUGIN_REVIEW_ARTIFACT_RECORD_API_REQUESTS_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly apiBase: string;
  readonly fixtureRefs?: readonly PluginReviewArtifactRecordApiFixtureRef[];
  readonly requests: readonly PluginReviewArtifactRecordApiRequestFixture[];
}

export interface PluginReviewArtifactRecordObjectByKind {
  pluginReviewArtifactRecord: PluginReviewArtifactStoredRecord;
  pluginReviewArtifactRecordList: PluginReviewArtifactRecordList;
  pluginReviewArtifactRecordComparison: PluginReviewArtifactRecordComparison;
  pluginReviewArtifactRecordCreateRequest: PluginReviewArtifactRecordCreateRequest;
  pluginReviewArtifactRecordApiRequests: PluginReviewArtifactRecordApiRequestBundle;
}

const ARTIFACT_FINGERPRINT_PATTERN = "^[a-f0-9]{32}$";
const HEX_SHA256_PATTERN = "^[a-f0-9]{64}$";
const ID_BODY_PATTERN = "[A-Za-z0-9_-]{1,88}";
const RECORD_ID_PATTERN = "^prar_[a-f0-9]{24}$";
const WORKSPACE_ID_PATTERN = `^wsp_${ID_BODY_PATTERN}$`;
const REVIEW_ID_PATTERN = `^prv_${ID_BODY_PATTERN}$`;
const PLUGIN_ID_PATTERN = `^plug_${ID_BODY_PATTERN}$`;
const ARTIFACT_ID_PATTERN = `^art_${ID_BODY_PATTERN}$`;
const ISO_TIMESTAMP_PATTERN = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$";
const MEDIA_TYPE_PATTERN = "^[^\\s/]+/[^\\s]+$";
const LOCAL_ARTIFACT_PATH_PATTERN =
  "^(?!/)(?![A-Za-z]:)(?!.*(?:^|/)\\.\\.(?:/|$))(?!.*//)[A-Za-z0-9._/-]+$";
const PATH_REF_PATTERN = "^[A-Za-z][A-Za-z0-9_.\\[\\]-]{0,191}$";
const METADATA_KEY_PATTERN = "^[A-Za-z][A-Za-z0-9_.-]{0,63}$";
const SECRET_LIKE_METADATA_KEY_PATTERN_SOURCE =
  "(?:[aA][pP][iI][_-]?[kK][eE][yY]|[aA][uU][tT][hH][oO][rR][iI][zZ][aA][tT][iI][oO][nN]|[bB][eE][aA][rR][eE][rR]|[cC][rR][eE][dD][eE][nN][tT][iI][aA][lL]|[pP][aA][sS][sS][wW][oO][rR][dD]|[pP][rR][iI][vV][aA][tT][eE][_-]?[kK][eE][yY]|[rR][aA][wW]|[sS][eE][cC][rR][eE][tT]|[tT][oO][kK][eE][nN])";
const SAFE_METADATA_KEY_PATTERN =
  `^(?!.*${SECRET_LIKE_METADATA_KEY_PATTERN_SOURCE})[A-Za-z][A-Za-z0-9_.-]{0,63}$`;
const SECRET_LIKE_METADATA_VALUE_PATTERN_SOURCE =
  "(?:[aA][pP][iI][_-]?[kK][eE][yY]|[aA][uU][tT][hH][oO][rR][iI][zZ][aA][tT][iI][oO][nN]|[bB][eE][aA][rR][eE][rR]|[cC][rR][eE][dD][eE][nN][tT][iI][aA][lL]|[pP][aA][sS][sS][wW][oO][rR][dD]|[pP][rR][iI][vV][aA][tT][eE][_-]?[kK][eE][yY]|[sS][eE][cC][rR][eE][tT]|[tT][oO][kK][eE][nN])\\s*[:=]|[bB][eE][aA][rR][eE][rR]\\s+\\S+|-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[A-Za-z0-9_-]{16,}";
const LOCAL_PATH_VALUE_PATTERN_SOURCE = "(?:[A-Za-z]:[\\\\/]|\\\\\\\\|file://|(?:^|\\s)/)";
const SAFE_METADATA_STRING_PATTERN =
  `^(?!.*(?:${SECRET_LIKE_METADATA_VALUE_PATTERN_SOURCE}|${LOCAL_PATH_VALUE_PATTERN_SOURCE})).*$`;
const SECRET_LIKE_METADATA_KEY_PATTERN = new RegExp(SECRET_LIKE_METADATA_KEY_PATTERN_SOURCE);
const SECRET_LIKE_METADATA_VALUE_PATTERN = new RegExp(SECRET_LIKE_METADATA_VALUE_PATTERN_SOURCE);
const LOCAL_PATH_VALUE_PATTERN = new RegExp(LOCAL_PATH_VALUE_PATTERN_SOURCE);
const API_REQUEST_ID_PATTERN = "^[A-Za-z][A-Za-z0-9_.:-]{0,127}$";
const API_FIXTURE_REF_ID_PATTERN = "^[A-Za-z][A-Za-z0-9_.-]{0,95}$";
const API_BASE_PATTERN = "^local://[a-z0-9][a-z0-9.-]{0,95}$";
const API_ROUTE_PATH_PATTERN = "^/v[0-9]+/(?!.*//)(?!.*\\.\\.)[A-Za-z0-9._~:/-]+$";
const SAFE_RELATIVE_JSON_FIXTURE_PATH_PATTERN =
  "^(?!/)(?![A-Za-z]:)(?!.*(?:^|/)\\.\\.(?:/|$))(?!.*//)[A-Za-z0-9._/-]+\\.json$";
const API_HEADER_NAME_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$";
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

const sourceRefSchema = objectSchema(
  "Plugin review artifact record source",
  {
    previewSchemaVersion: {
      type: "string",
      const: PLUGIN_REVIEW_ARTIFACT_PREVIEW_SCHEMA_VERSION,
    },
    previewFingerprint: sha256Schema(),
    artifactPath: localArtifactPathSchema(),
  },
  ["previewSchemaVersion", "previewFingerprint", "artifactPath"],
);

const summarySchema = objectSchema(
  "Plugin review artifact record summary",
  {
    gateCount: nonNegativeIntegerSchema(),
    passedGateCount: nonNegativeIntegerSchema(),
    failedGateCount: nonNegativeIntegerSchema(),
    pendingGateCount: nonNegativeIntegerSchema(),
    warningGateCount: nonNegativeIntegerSchema(),
    skippedGateCount: nonNegativeIntegerSchema(),
    sandboxFindingCount: nonNegativeIntegerSchema(),
    blockingFindingCount: nonNegativeIntegerSchema(),
    evidenceCount: nonNegativeIntegerSchema(),
    redactionCount: nonNegativeIntegerSchema(),
    externalCallProposalCount: nonNegativeIntegerSchema(),
  },
  [
    "gateCount",
    "passedGateCount",
    "failedGateCount",
    "pendingGateCount",
    "warningGateCount",
    "skippedGateCount",
    "sandboxFindingCount",
    "blockingFindingCount",
    "evidenceCount",
    "redactionCount",
    "externalCallProposalCount",
  ],
);

const comparisonSummarySchema = objectSchema(
  "Plugin review artifact record comparison summary",
  {
    added: nonNegativeIntegerSchema(),
    removed: nonNegativeIntegerSchema(),
    changed: nonNegativeIntegerSchema(),
    total: nonNegativeIntegerSchema(),
  },
  ["added", "removed", "changed", "total"],
);

const comparisonDifferenceSchema = objectSchema(
  "Plugin review artifact record comparison difference",
  {
    path: pathRefSchema(),
    change: enumSchema(pluginReviewArtifactRecordComparisonChanges),
    baseArtifactFingerprint: artifactFingerprintSchema(),
    candidateArtifactFingerprint: artifactFingerprintSchema(),
  },
  ["path", "change"],
);

export const pluginReviewArtifactRecordSchema = deepFreeze(
  objectSchema(
    "Persisted plugin review artifact record",
    {
      schemaVersion: {
        type: "string",
        const: PLUGIN_REVIEW_ARTIFACT_RECORD_SCHEMA_VERSION,
      },
      id: recordIdSchema(),
      artifactFingerprint: artifactFingerprintSchema(),
      createdAt: timestampSchema(),
      workspaceId: workspaceIdSchema(),
      reviewId: reviewIdSchema(),
      pluginId: pluginIdSchema(),
      artifactId: artifactIdSchema(),
      source: sourceRefSchema,
      localOnly: {
        type: "boolean",
        const: true,
      },
      redacted: {
        type: "boolean",
        const: true,
      },
      decision: enumSchema(pluginReviewArtifactRecordDecisions),
      summary: summarySchema,
      metadata: metadataSchema(),
    },
    [
      "schemaVersion",
      "id",
      "artifactFingerprint",
      "createdAt",
      "workspaceId",
      "reviewId",
      "pluginId",
      "artifactId",
      "source",
      "localOnly",
      "redacted",
      "decision",
      "summary",
    ],
    "artifact-record",
  ),
);

export const pluginReviewArtifactRecordListSchema = deepFreeze(
  objectSchema(
    "Persisted plugin review artifact record list",
    {
      schemaVersion: {
        type: "string",
        const: PLUGIN_REVIEW_ARTIFACT_RECORD_LIST_SCHEMA_VERSION,
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
      records: arraySchema(pluginReviewArtifactRecordSchema),
    },
    ["schemaVersion", "generatedAt", "workspaceId", "localOnly", "redacted", "records"],
    "artifact-record-list",
  ),
);

export const pluginReviewArtifactRecordComparisonSchema = deepFreeze(
  objectSchema(
    "Persisted plugin review artifact record comparison",
    {
      schemaVersion: {
        type: "string",
        const: PLUGIN_REVIEW_ARTIFACT_RECORD_COMPARISON_SCHEMA_VERSION,
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
      baseArtifactFingerprint: artifactFingerprintSchema(),
      candidateArtifactFingerprint: artifactFingerprintSchema(),
      baseDecision: enumSchema(pluginReviewArtifactRecordDecisions),
      candidateDecision: enumSchema(pluginReviewArtifactRecordDecisions),
      compatible: { type: "boolean" },
      comparisonSummary: comparisonSummarySchema,
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
      "baseArtifactFingerprint",
      "candidateArtifactFingerprint",
      "baseDecision",
      "candidateDecision",
      "compatible",
      "comparisonSummary",
      "differences",
    ],
    "artifact-record-comparison",
  ),
);

export const pluginReviewArtifactRecordCreateRequestSchema = deepFreeze(
  objectSchema(
    "Plugin review artifact record create request",
    {
      schemaVersion: {
        type: "string",
        const: PLUGIN_REVIEW_ARTIFACT_RECORD_CREATE_REQUEST_SCHEMA_VERSION,
      },
      requestedAt: timestampSchema(),
      workspaceId: workspaceIdSchema(),
      reviewId: reviewIdSchema(),
      pluginId: pluginIdSchema(),
      artifactId: artifactIdSchema(),
      artifactFingerprint: artifactFingerprintSchema(),
      source: sourceRefSchema,
      localOnly: {
        type: "boolean",
        const: true,
      },
      redacted: {
        type: "boolean",
        const: true,
      },
      decision: enumSchema(pluginReviewArtifactRecordDecisions),
      summary: summarySchema,
      metadata: metadataSchema(),
    },
    [
      "schemaVersion",
      "requestedAt",
      "workspaceId",
      "reviewId",
      "pluginId",
      "artifactId",
      "artifactFingerprint",
      "source",
      "localOnly",
      "redacted",
      "decision",
      "summary",
    ],
    "artifact-record-create-request",
  ),
);

const apiSafeJsonValueSchema: PluginReviewArtifactRecordJsonSchema = {
  oneOf: [
    { type: "string", pattern: API_SAFE_PUBLIC_STRING_PATTERN },
    { type: "number" },
    { type: "boolean" },
    { type: "null" },
    { type: "array" },
    { type: "object" },
  ],
};

const apiMetricMapSchema: PluginReviewArtifactRecordJsonSchema = {
  type: "object",
  additionalProperties: nonNegativeIntegerSchema(),
};

const apiFixtureRefSchema = objectSchema(
  "Plugin review artifact records API fixture reference",
  {
    id: apiFixtureRefIdSchema(),
    fixturePath: safeRelativeJsonFixturePathSchema(),
  },
  ["id", "fixturePath"],
);

const apiRouteSchema = objectSchema(
  "Plugin review artifact records API route",
  {
    method: enumSchema(pluginReviewArtifactRecordApiRouteMethods),
    path: apiRoutePathSchema(),
  },
  ["method", "path"],
);

const apiHeadersSchema: PluginReviewArtifactRecordJsonSchema = {
  type: "object",
  additionalProperties: {
    type: "string",
    pattern: API_SAFE_PUBLIC_STRING_PATTERN,
  },
};

const apiRequestPayloadSchema = objectSchema(
  "Plugin review artifact records API request payload",
  {
    headers: apiHeadersSchema,
    body: apiSafeJsonValueSchema,
  },
  [],
);

const apiExpectationSchema = objectSchema(
  "Plugin review artifact records API expectation",
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
  "Plugin review artifact records API request fixture",
  {
    id: apiRequestIdSchema(),
    title: safeApiPublicStringSchema(),
    route: apiRouteSchema,
    request: apiRequestPayloadSchema,
    expect: apiExpectationSchema,
  },
  ["id", "title", "route", "request", "expect"],
);

export const pluginReviewArtifactRecordApiRequestsSchema = deepFreeze(
  objectSchema(
    "Plugin review artifact records API request fixture bundle",
    {
      schemaVersion: {
        type: "string",
        const: PLUGIN_REVIEW_ARTIFACT_RECORD_API_REQUESTS_SCHEMA_VERSION,
      },
      generatedAt: timestampSchema(),
      apiBase: apiBaseSchema(),
      fixtureRefs: arraySchema(apiFixtureRefSchema),
      requests: arraySchema(apiRequestFixtureSchema, 1),
    },
    ["schemaVersion", "generatedAt", "apiBase", "requests"],
    "artifact-records-api-requests",
  ),
);

export const pluginReviewArtifactRecordSchemaDefinitions = deepFreeze({
  pluginReviewArtifactRecord: {
    kind: "pluginReviewArtifactRecord",
    schemaVersion: PLUGIN_REVIEW_ARTIFACT_RECORD_SCHEMA_VERSION,
    title: pluginReviewArtifactRecordSchema.title ?? "Persisted plugin review artifact record",
    schema: pluginReviewArtifactRecordSchema,
  },
  pluginReviewArtifactRecordList: {
    kind: "pluginReviewArtifactRecordList",
    schemaVersion: PLUGIN_REVIEW_ARTIFACT_RECORD_LIST_SCHEMA_VERSION,
    title: pluginReviewArtifactRecordListSchema.title ?? "Persisted plugin review artifact record list",
    schema: pluginReviewArtifactRecordListSchema,
  },
  pluginReviewArtifactRecordComparison: {
    kind: "pluginReviewArtifactRecordComparison",
    schemaVersion: PLUGIN_REVIEW_ARTIFACT_RECORD_COMPARISON_SCHEMA_VERSION,
    title:
      pluginReviewArtifactRecordComparisonSchema.title ??
      "Persisted plugin review artifact record comparison",
    schema: pluginReviewArtifactRecordComparisonSchema,
  },
  pluginReviewArtifactRecordCreateRequest: {
    kind: "pluginReviewArtifactRecordCreateRequest",
    schemaVersion: PLUGIN_REVIEW_ARTIFACT_RECORD_CREATE_REQUEST_SCHEMA_VERSION,
    title:
      pluginReviewArtifactRecordCreateRequestSchema.title ??
      "Plugin review artifact record create request",
    schema: pluginReviewArtifactRecordCreateRequestSchema,
  },
  pluginReviewArtifactRecordApiRequests: {
    kind: "pluginReviewArtifactRecordApiRequests",
    schemaVersion: PLUGIN_REVIEW_ARTIFACT_RECORD_API_REQUESTS_SCHEMA_VERSION,
    title:
      pluginReviewArtifactRecordApiRequestsSchema.title ??
      "Plugin review artifact records API request fixture bundle",
    schema: pluginReviewArtifactRecordApiRequestsSchema,
  },
} satisfies Record<PluginReviewArtifactRecordKind, PluginReviewArtifactRecordSchemaDefinition>);

export const pluginReviewArtifactRecordSchemas = {
  pluginReviewArtifactRecord: pluginReviewArtifactRecordSchema,
  pluginReviewArtifactRecordList: pluginReviewArtifactRecordListSchema,
  pluginReviewArtifactRecordComparison: pluginReviewArtifactRecordComparisonSchema,
  pluginReviewArtifactRecordCreateRequest: pluginReviewArtifactRecordCreateRequestSchema,
  pluginReviewArtifactRecordApiRequests: pluginReviewArtifactRecordApiRequestsSchema,
} as const satisfies Record<PluginReviewArtifactRecordKind, PluginReviewArtifactRecordJsonSchema>;

export const pluginReviewArtifactRecordValidators = {
  pluginReviewArtifactRecord: validatePluginReviewArtifactRecord,
  pluginReviewArtifactRecordList: validatePluginReviewArtifactRecordList,
  pluginReviewArtifactRecordComparison: validatePluginReviewArtifactRecordComparison,
  pluginReviewArtifactRecordCreateRequest: validatePluginReviewArtifactRecordCreateRequest,
  pluginReviewArtifactRecordApiRequests: validatePluginReviewArtifactRecordApiRequestBundle,
} as const;

export function getPluginReviewArtifactRecordSchema(
  kind: PluginReviewArtifactRecordKind,
): PluginReviewArtifactRecordJsonSchema {
  return pluginReviewArtifactRecordSchemas[kind];
}

export function validatePluginReviewArtifactRecordObject<K extends PluginReviewArtifactRecordKind>(
  kind: K,
  value: unknown,
): ValidationResult<PluginReviewArtifactRecordObjectByKind[K]> {
  const validator = pluginReviewArtifactRecordValidators[kind] as (
    candidate: unknown,
  ) => ValidationResult<unknown>;
  return validator(value) as ValidationResult<PluginReviewArtifactRecordObjectByKind[K]>;
}

export function assertPluginReviewArtifactRecordObject<K extends PluginReviewArtifactRecordKind>(
  kind: K,
  value: unknown,
): asserts value is PluginReviewArtifactRecordObjectByKind[K] {
  const result = validatePluginReviewArtifactRecordObject(kind, value);
  if (!result.ok) {
    throw new Error(formatValidationIssues(kind, result.issues));
  }
}

export function validatePluginReviewArtifactRecord(
  value: unknown,
): ValidationResult<PluginReviewArtifactStoredRecord> {
  const issues: ValidationIssue[] = [];
  validatePluginReviewArtifactRecordValue(value, "$", issues);
  return validationResult(value, issues);
}

export function validatePluginReviewArtifactRecordList(
  value: unknown,
): ValidationResult<PluginReviewArtifactRecordList> {
  const issues: ValidationIssue[] = [];
  validatePluginReviewArtifactRecordListValue(value, "$", issues);
  return validationResult(value, issues);
}

export function validatePluginReviewArtifactRecordComparison(
  value: unknown,
): ValidationResult<PluginReviewArtifactRecordComparison> {
  const issues: ValidationIssue[] = [];
  validatePluginReviewArtifactRecordComparisonValue(value, "$", issues);
  return validationResult(value, issues);
}

export function validatePluginReviewArtifactRecordCreateRequest(
  value: unknown,
): ValidationResult<PluginReviewArtifactRecordCreateRequest> {
  const issues: ValidationIssue[] = [];
  validatePluginReviewArtifactRecordCreateRequestValue(value, "$", issues);
  return validationResult(value, issues);
}

export function validatePluginReviewArtifactRecordApiRequestBundle(
  value: unknown,
): ValidationResult<PluginReviewArtifactRecordApiRequestBundle> {
  const issues: ValidationIssue[] = [];
  collectApiPublicStringIssues(value, "$", issues);
  validatePluginReviewArtifactRecordApiRequestBundleValue(value, "$", issues);
  return validationResult(value, issues);
}

export function assertPluginReviewArtifactRecord(
  value: unknown,
): asserts value is PluginReviewArtifactStoredRecord {
  const result = validatePluginReviewArtifactRecord(value);
  if (!result.ok) {
    throw new Error(formatValidationIssues("pluginReviewArtifactRecord", result.issues));
  }
}

export function assertPluginReviewArtifactRecordList(
  value: unknown,
): asserts value is PluginReviewArtifactRecordList {
  const result = validatePluginReviewArtifactRecordList(value);
  if (!result.ok) {
    throw new Error(formatValidationIssues("pluginReviewArtifactRecordList", result.issues));
  }
}

export function assertPluginReviewArtifactRecordComparison(
  value: unknown,
): asserts value is PluginReviewArtifactRecordComparison {
  const result = validatePluginReviewArtifactRecordComparison(value);
  if (!result.ok) {
    throw new Error(formatValidationIssues("pluginReviewArtifactRecordComparison", result.issues));
  }
}

export function assertPluginReviewArtifactRecordCreateRequest(
  value: unknown,
): asserts value is PluginReviewArtifactRecordCreateRequest {
  const result = validatePluginReviewArtifactRecordCreateRequest(value);
  if (!result.ok) {
    throw new Error(formatValidationIssues("pluginReviewArtifactRecordCreateRequest", result.issues));
  }
}

export function assertPluginReviewArtifactRecordApiRequestBundle(
  value: unknown,
): asserts value is PluginReviewArtifactRecordApiRequestBundle {
  const result = validatePluginReviewArtifactRecordApiRequestBundle(value);
  if (!result.ok) {
    throw new Error(formatValidationIssues("pluginReviewArtifactRecordApiRequests", result.issues));
  }
}

export function isPluginReviewArtifactRecordId(value: unknown): value is `prar_${string}` {
  return typeof value === "string" && new RegExp(RECORD_ID_PATTERN).test(value);
}

export function isPluginReviewArtifactRecordFingerprint(value: unknown): value is string {
  return typeof value === "string" && new RegExp(ARTIFACT_FINGERPRINT_PATTERN).test(value);
}

export function isPluginReviewArtifactRecordPath(value: unknown): value is string {
  return typeof value === "string" && isSafeLocalArtifactPath(value);
}

export function getPluginReviewArtifactRecordIdForFingerprint(
  fingerprint: string,
): `prar_${string}` | undefined {
  if (!isPluginReviewArtifactRecordFingerprint(fingerprint)) {
    return undefined;
  }
  return `prar_${fingerprint.slice(0, 24)}`;
}

export function getPluginReviewArtifactRecordCompatibilityKey(
  record: PluginReviewArtifactStoredRecord,
): string {
  return canonicalJson({
    schemaVersion: record.schemaVersion,
    id: record.id,
    artifactFingerprint: record.artifactFingerprint,
    workspaceId: record.workspaceId,
    reviewId: record.reviewId,
    pluginId: record.pluginId,
    artifactId: record.artifactId,
    source: record.source,
    localOnly: record.localOnly,
    redacted: record.redacted,
    decision: record.decision,
    summary: record.summary,
    metadata: record.metadata ?? null,
  });
}

export function arePluginReviewArtifactRecordsCompatible(
  base: PluginReviewArtifactStoredRecord,
  candidate: PluginReviewArtifactStoredRecord,
): boolean {
  return getPluginReviewArtifactRecordCompatibilityKey(base) ===
    getPluginReviewArtifactRecordCompatibilityKey(candidate);
}

function validatePluginReviewArtifactRecordValue(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): PluginReviewArtifactStoredRecord | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, recordKeys, issues);
  requireExactString(record, "schemaVersion", PLUGIN_REVIEW_ARTIFACT_RECORD_SCHEMA_VERSION, issues, path);
  requireRecordId(record, "id", issues, path);
  requireArtifactFingerprint(record, "artifactFingerprint", issues, path);
  requireStableRecordId(record, path, issues);
  requireTimestamp(record, "createdAt", issues, path);
  requireWorkspaceId(record, "workspaceId", issues, path);
  requireReviewId(record, "reviewId", issues, path);
  requirePluginId(record, "pluginId", issues, path);
  requireArtifactId(record, "artifactId", issues, path);
  const source = requireRecord(record, "source", issues, path);
  if (source) {
    validateSourceRef(source, keyPath(path, "source"), issues);
  }
  requireTrue(record, "localOnly", issues, path);
  requireTrue(record, "redacted", issues, path);
  requireEnum(record, "decision", pluginReviewArtifactRecordDecisions, issues, path);
  const summary = requireRecord(record, "summary", issues, path);
  if (summary) {
    validateSummary(summary, keyPath(path, "summary"), issues);
    validateDecisionSummaryConsistency(record.decision, summary, path, issues);
  }
  if (record.metadata !== undefined) {
    validateMetadata(record.metadata, keyPath(path, "metadata"), issues);
  }

  return record as unknown as PluginReviewArtifactStoredRecord;
}

function validatePluginReviewArtifactRecordListValue(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): PluginReviewArtifactRecordList | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, listKeys, issues);
  requireExactString(record, "schemaVersion", PLUGIN_REVIEW_ARTIFACT_RECORD_LIST_SCHEMA_VERSION, issues, path);
  requireTimestamp(record, "generatedAt", issues, path);
  requireWorkspaceId(record, "workspaceId", issues, path);
  requireTrue(record, "localOnly", issues, path);
  requireTrue(record, "redacted", issues, path);
  const records = validateArray(record, "records", issues, validatePluginReviewArtifactRecordValue, false, path);
  validateRecordListCrossReferences(record, records, path, issues);

  return record as unknown as PluginReviewArtifactRecordList;
}

function validatePluginReviewArtifactRecordComparisonValue(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): PluginReviewArtifactRecordComparison | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, comparisonKeys, issues);
  requireExactString(
    record,
    "schemaVersion",
    PLUGIN_REVIEW_ARTIFACT_RECORD_COMPARISON_SCHEMA_VERSION,
    issues,
    path,
  );
  requireTimestamp(record, "createdAt", issues, path);
  requireWorkspaceId(record, "workspaceId", issues, path);
  requireTrue(record, "localOnly", issues, path);
  requireTrue(record, "redacted", issues, path);
  requireRecordId(record, "baseRecordId", issues, path);
  requireRecordId(record, "candidateRecordId", issues, path);
  requireArtifactFingerprint(record, "baseArtifactFingerprint", issues, path);
  requireArtifactFingerprint(record, "candidateArtifactFingerprint", issues, path);
  requireEnum(record, "baseDecision", pluginReviewArtifactRecordDecisions, issues, path);
  requireEnum(record, "candidateDecision", pluginReviewArtifactRecordDecisions, issues, path);
  requireBoolean(record, "compatible", issues, path);
  const comparisonSummary = requireRecord(record, "comparisonSummary", issues, path);
  if (comparisonSummary) {
    validateComparisonSummary(comparisonSummary, keyPath(path, "comparisonSummary"), issues);
  }
  const differences = validateArray(record, "differences", issues, validateComparisonDifference, false, path);
  validateComparisonConsistency(record, comparisonSummary, differences, path, issues);

  return record as unknown as PluginReviewArtifactRecordComparison;
}

function validatePluginReviewArtifactRecordCreateRequestValue(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): PluginReviewArtifactRecordCreateRequest | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, createRequestKeys, issues);
  requireExactString(
    record,
    "schemaVersion",
    PLUGIN_REVIEW_ARTIFACT_RECORD_CREATE_REQUEST_SCHEMA_VERSION,
    issues,
    path,
  );
  requireTimestamp(record, "requestedAt", issues, path);
  requireWorkspaceId(record, "workspaceId", issues, path);
  requireReviewId(record, "reviewId", issues, path);
  requirePluginId(record, "pluginId", issues, path);
  requireArtifactId(record, "artifactId", issues, path);
  requireArtifactFingerprint(record, "artifactFingerprint", issues, path);
  const source = requireRecord(record, "source", issues, path);
  if (source) {
    validateSourceRef(source, keyPath(path, "source"), issues);
  }
  requireTrue(record, "localOnly", issues, path);
  requireTrue(record, "redacted", issues, path);
  requireEnum(record, "decision", pluginReviewArtifactRecordDecisions, issues, path);
  const summary = requireRecord(record, "summary", issues, path);
  if (summary) {
    validateSummary(summary, keyPath(path, "summary"), issues);
    validateDecisionSummaryConsistency(record.decision, summary, path, issues);
  }
  if (record.metadata !== undefined) {
    validateMetadata(record.metadata, keyPath(path, "metadata"), issues);
  }

  return record as unknown as PluginReviewArtifactRecordCreateRequest;
}

function validateSourceRef(
  record: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
): PluginReviewArtifactSourceRef | undefined {
  requireOnlyKeys(record, path, sourceRefKeys, issues);
  requireExactString(
    record,
    "previewSchemaVersion",
    PLUGIN_REVIEW_ARTIFACT_PREVIEW_SCHEMA_VERSION,
    issues,
    path,
  );
  requireSha256(record, "previewFingerprint", issues, path);
  requireLocalArtifactPath(record, "artifactPath", issues, path);

  return record as unknown as PluginReviewArtifactSourceRef;
}

function validateSummary(
  record: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
): PluginReviewArtifactRecordSummary | undefined {
  requireOnlyKeys(record, path, summaryKeys, issues);
  for (const key of summaryKeys) {
    requireNonNegativeInteger(record, key, issues, path);
  }

  const gateCount = record.gateCount;
  const gateStatusCount =
    numberValue(record.passedGateCount) +
    numberValue(record.failedGateCount) +
    numberValue(record.pendingGateCount) +
    numberValue(record.warningGateCount) +
    numberValue(record.skippedGateCount);
  if (typeof gateCount === "number" && Number.isInteger(gateCount) && gateCount >= 0 && gateCount !== gateStatusCount) {
    issues.push({
      path: keyPath(path, "gateCount"),
      message: "gateCount must match gate status counts",
    });
  }

  if (
    typeof record.blockingFindingCount === "number" &&
    typeof record.sandboxFindingCount === "number" &&
    record.blockingFindingCount > record.sandboxFindingCount
  ) {
    issues.push({
      path: keyPath(path, "blockingFindingCount"),
      message: "blockingFindingCount must not exceed sandboxFindingCount",
    });
  }

  return record as unknown as PluginReviewArtifactRecordSummary;
}

function validateComparisonSummary(
  record: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
): PluginReviewArtifactRecordComparisonSummary | undefined {
  requireOnlyKeys(record, path, comparisonSummaryKeys, issues);
  for (const key of comparisonSummaryKeys) {
    requireNonNegativeInteger(record, key, issues, path);
  }

  const total = record.total;
  const computedTotal = numberValue(record.added) + numberValue(record.removed) + numberValue(record.changed);
  if (typeof total === "number" && Number.isInteger(total) && total >= 0 && total !== computedTotal) {
    issues.push({
      path: keyPath(path, "total"),
      message: "total must match added, removed, and changed counts",
    });
  }

  return record as unknown as PluginReviewArtifactRecordComparisonSummary;
}

function validateMetadata(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): PluginReviewArtifactRecordMetadata | undefined {
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
      continue;
    }
    if (typeof entryValue === "number" && !Number.isFinite(entryValue)) {
      issues.push({
        path: entryPath,
        message: "metadata number values must be finite",
      });
    }
    if (typeof entryValue === "string" && !isSafePersistedString(entryValue)) {
      issues.push({
        path: entryPath,
        message: "metadata string values must not contain local paths or secret-looking data",
      });
    }
  }

  return record as PluginReviewArtifactRecordMetadata;
}

function validateComparisonDifference(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): PluginReviewArtifactRecordComparisonDifference | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, comparisonDifferenceKeys, issues);
  requirePathRef(record, "path", issues, path);
  requireEnum(record, "change", pluginReviewArtifactRecordComparisonChanges, issues, path);
  optionalArtifactFingerprint(record, "baseArtifactFingerprint", issues, path);
  optionalArtifactFingerprint(record, "candidateArtifactFingerprint", issues, path);

  return record as unknown as PluginReviewArtifactRecordComparisonDifference;
}

function validateDecisionSummaryConsistency(
  decision: unknown,
  summary: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!pluginReviewArtifactRecordDecisions.includes(decision as PluginReviewArtifactRecordDecision)) {
    return;
  }

  const failedGateCount = numberValue(summary.failedGateCount);
  const pendingGateCount = numberValue(summary.pendingGateCount);
  const warningGateCount = numberValue(summary.warningGateCount);
  const blockingFindingCount = numberValue(summary.blockingFindingCount);
  const decisionPath = keyPath(path, "decision");

  if (decision === "approved" && (failedGateCount > 0 || pendingGateCount > 0 || blockingFindingCount > 0)) {
    issues.push({
      path: decisionPath,
      message: "approved records cannot have failed, pending, or blocking summary counts",
    });
  }
  if (decision === "approval_required") {
    if (failedGateCount > 0 || blockingFindingCount > 0) {
      issues.push({
        path: decisionPath,
        message: "approval_required records cannot include failed or blocking summary counts",
      });
    }
    if (pendingGateCount + warningGateCount === 0) {
      issues.push({
        path: decisionPath,
        message: "approval_required records must include pending or warning summary counts",
      });
    }
  }
  if (decision === "denied" && failedGateCount + blockingFindingCount === 0) {
    issues.push({
      path: decisionPath,
      message: "denied records must include failed or blocking summary counts",
    });
  }
}

function validateRecordListCrossReferences(
  record: Record<string, unknown>,
  records: PluginReviewArtifactStoredRecord[] | undefined,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!records) {
    return;
  }

  const recordsPath = keyPath(path, "records");
  requireSortedUniqueRefs(records, "id", recordsPath, "records must be sorted by id with no duplicates", issues);

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
  comparisonSummary: Record<string, unknown> | undefined,
  differences: PluginReviewArtifactRecordComparisonDifference[] | undefined,
  path: string,
  issues: ValidationIssue[],
): void {
  if (typeof record.compatible !== "boolean" || !comparisonSummary || !differences) {
    return;
  }

  const differencesPath = keyPath(path, "differences");
  const summaryPath = keyPath(path, "comparisonSummary");
  const counts = {
    added: 0,
    removed: 0,
    changed: 0,
  };
  for (const difference of differences) {
    counts[difference.change] += 1;
  }
  for (const change of pluginReviewArtifactRecordComparisonChanges) {
    if (comparisonSummary[change] !== undefined && comparisonSummary[change] !== counts[change]) {
      issues.push({
        path: keyPath(summaryPath, change),
        message: `${change} count must match differences`,
      });
    }
  }
  if (typeof comparisonSummary.total === "number" && comparisonSummary.total !== differences.length) {
    issues.push({
      path: keyPath(summaryPath, "total"),
      message: "total must match differences length",
    });
  }

  if (record.compatible) {
    if (record.baseArtifactFingerprint !== record.candidateArtifactFingerprint) {
      issues.push({
        path: keyPath(path, "candidateArtifactFingerprint"),
        message: "candidateArtifactFingerprint must match baseArtifactFingerprint when compatible is true",
      });
    }
    if (record.baseDecision !== record.candidateDecision) {
      issues.push({
        path: keyPath(path, "candidateDecision"),
        message: "candidateDecision must match baseDecision when compatible is true",
      });
    }
    if (differences.length > 0) {
      issues.push({ path: differencesPath, message: "differences must be empty when compatible is true" });
    }
    return;
  }

  if (
    record.baseArtifactFingerprint === record.candidateArtifactFingerprint &&
    record.baseDecision === record.candidateDecision
  ) {
    issues.push({
      path: keyPath(path, "candidateArtifactFingerprint"),
      message: "candidate record must differ when compatible is false",
    });
  }
  if (differences.length === 0) {
    issues.push({ path: differencesPath, message: "differences must describe incompatible records" });
  }
}

function validatePluginReviewArtifactRecordApiRequestBundleValue(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): PluginReviewArtifactRecordApiRequestBundle | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, apiRequestBundleKeys, issues);
  requireExactString(record, "schemaVersion", PLUGIN_REVIEW_ARTIFACT_RECORD_API_REQUESTS_SCHEMA_VERSION, issues, path);
  requireTimestamp(record, "generatedAt", issues, path);
  requirePattern(record, "apiBase", API_BASE_PATTERN, "apiBase must be a local:// API base", issues, path);

  const fixtureRefs = record.fixtureRefs !== undefined
    ? validateArray(record, "fixtureRefs", issues, validateApiFixtureRef, false, path)
    : undefined;
  const fixtureRefIds = validateApiFixtureRefIds(fixtureRefs, issues);
  const requests = validateArray(record, "requests", issues, validateApiRequestFixture, true, path);
  validateApiRequestIds(requests, issues);
  validateApiFixtureRefObjects(record, fixtureRefIds, path, issues);
  validateApiLocalFixturePathValues(record, path, issues);

  return record as unknown as PluginReviewArtifactRecordApiRequestBundle;
}

function validateApiFixtureRef(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): PluginReviewArtifactRecordApiFixtureRef | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }
  requireOnlyKeys(record, path, apiFixtureRefKeys, issues);
  requirePattern(record, "id", API_FIXTURE_REF_ID_PATTERN, "id must be a non-empty fixture ref id", issues, path);
  requireSafeRelativeJsonFixturePath(record, "fixturePath", issues, path);
  return record as unknown as PluginReviewArtifactRecordApiFixtureRef;
}

function validateApiRequestFixture(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): PluginReviewArtifactRecordApiRequestFixture | undefined {
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

  return record as unknown as PluginReviewArtifactRecordApiRequestFixture;
}

function validateApiRoute(record: Record<string, unknown>, path: string, issues: ValidationIssue[]): void {
  requireOnlyKeys(record, path, apiRouteKeys, issues);
  requireEnum(record, "method", pluginReviewArtifactRecordApiRouteMethods, issues, path);
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
  fixtureRefs: readonly PluginReviewArtifactRecordApiFixtureRef[] | undefined,
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
  requests: readonly PluginReviewArtifactRecordApiRequestFixture[] | undefined,
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
  properties: Record<string, PluginReviewArtifactRecordJsonSchema>,
  required: readonly string[],
  slug?: string,
): PluginReviewArtifactRecordJsonSchema {
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

function arraySchema(
  items: PluginReviewArtifactRecordJsonSchema,
  minItems?: number,
): PluginReviewArtifactRecordJsonSchema {
  return {
    type: "array",
    minItems,
    items,
  };
}

function recordIdSchema(): PluginReviewArtifactRecordJsonSchema {
  return {
    type: "string",
    pattern: RECORD_ID_PATTERN,
  };
}

function workspaceIdSchema(): PluginReviewArtifactRecordJsonSchema {
  return {
    type: "string",
    pattern: WORKSPACE_ID_PATTERN,
  };
}

function reviewIdSchema(): PluginReviewArtifactRecordJsonSchema {
  return {
    type: "string",
    pattern: REVIEW_ID_PATTERN,
  };
}

function pluginIdSchema(): PluginReviewArtifactRecordJsonSchema {
  return {
    type: "string",
    pattern: PLUGIN_ID_PATTERN,
  };
}

function artifactIdSchema(): PluginReviewArtifactRecordJsonSchema {
  return {
    type: "string",
    pattern: ARTIFACT_ID_PATTERN,
  };
}

function artifactFingerprintSchema(): PluginReviewArtifactRecordJsonSchema {
  return {
    type: "string",
    pattern: ARTIFACT_FINGERPRINT_PATTERN,
  };
}

function sha256Schema(): PluginReviewArtifactRecordJsonSchema {
  return {
    type: "string",
    pattern: HEX_SHA256_PATTERN,
  };
}

function timestampSchema(): PluginReviewArtifactRecordJsonSchema {
  return {
    type: "string",
    pattern: ISO_TIMESTAMP_PATTERN,
  };
}

function mediaTypeSchema(): PluginReviewArtifactRecordJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: MEDIA_TYPE_PATTERN,
  };
}

function safeApiPublicStringSchema(): PluginReviewArtifactRecordJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: API_SAFE_PUBLIC_STRING_PATTERN,
  };
}

function apiRequestIdSchema(): PluginReviewArtifactRecordJsonSchema {
  return {
    type: "string",
    pattern: API_REQUEST_ID_PATTERN,
  };
}

function apiFixtureRefIdSchema(): PluginReviewArtifactRecordJsonSchema {
  return {
    type: "string",
    pattern: API_FIXTURE_REF_ID_PATTERN,
  };
}

function apiBaseSchema(): PluginReviewArtifactRecordJsonSchema {
  return {
    type: "string",
    pattern: API_BASE_PATTERN,
  };
}

function apiRoutePathSchema(): PluginReviewArtifactRecordJsonSchema {
  return {
    type: "string",
    pattern: API_ROUTE_PATH_PATTERN,
  };
}

function safeRelativeJsonFixturePathSchema(): PluginReviewArtifactRecordJsonSchema {
  return {
    type: "string",
    pattern: SAFE_RELATIVE_JSON_FIXTURE_PATH_PATTERN,
  };
}

function httpStatusSchema(): PluginReviewArtifactRecordJsonSchema {
  return {
    type: "integer",
    minimum: 100,
    maximum: 599,
  };
}

function localArtifactPathSchema(): PluginReviewArtifactRecordJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: LOCAL_ARTIFACT_PATH_PATTERN,
  };
}

function pathRefSchema(): PluginReviewArtifactRecordJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: PATH_REF_PATTERN,
  };
}

function safeMetadataKeySchema(): PluginReviewArtifactRecordJsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: SAFE_METADATA_KEY_PATTERN,
  };
}

function metadataSchema(): PluginReviewArtifactRecordJsonSchema {
  return {
    type: "object",
    propertyNames: safeMetadataKeySchema(),
    additionalProperties: {
      type: ["string", "number", "boolean", "null"],
      pattern: SAFE_METADATA_STRING_PATTERN,
    },
  };
}

function enumSchema(values: readonly (string | number | boolean | null)[]): PluginReviewArtifactRecordJsonSchema {
  return {
    type: typeof values[0] === "string" ? "string" : undefined,
    enum: values,
  };
}

function nonNegativeIntegerSchema(): PluginReviewArtifactRecordJsonSchema {
  return {
    type: "integer",
    minimum: 0,
  };
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
    collectApiPublicStringIssues(nested, keyPath(path, key), issues, seen);
  }
  seen.delete(value);
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
  nonEmpty: boolean,
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

function requireSafeApiPublicString(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (typeof value !== "string" || !isApiSafePublicString(value)) {
    issues.push({
      path: keyPath(parentPath, key),
      message: `${key} must be a public string without raw local paths, secrets, or private markers`,
    });
  }
}

function requireRecordId(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  requirePattern(record, key, RECORD_ID_PATTERN, `${key} must be a plugin review artifact record id`, issues, parentPath);
}

function requireWorkspaceId(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  requirePattern(record, key, WORKSPACE_ID_PATTERN, `${key} must use the wsp_ id prefix`, issues, parentPath);
}

function requireReviewId(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  requirePattern(record, key, REVIEW_ID_PATTERN, `${key} must use the prv_ id prefix`, issues, parentPath);
}

function requirePluginId(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  requirePattern(record, key, PLUGIN_ID_PATTERN, `${key} must use the plug_ id prefix`, issues, parentPath);
}

function requireArtifactId(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  requirePattern(record, key, ARTIFACT_ID_PATTERN, `${key} must use the art_ id prefix`, issues, parentPath);
}

function requireStableRecordId(
  record: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[],
): void {
  const id = record.id;
  const fingerprint = record.artifactFingerprint;
  if (typeof id !== "string" || typeof fingerprint !== "string") {
    return;
  }
  const expectedId = getPluginReviewArtifactRecordIdForFingerprint(fingerprint);
  if (expectedId && id !== expectedId) {
    issues.push({
      path: keyPath(path, "id"),
      message: "id must be derived from the first 24 hex characters of artifactFingerprint",
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

function requireHttpStatus(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 100 || value > 599) {
    issues.push({ path: keyPath(parentPath, key), message: `${key} must be an HTTP status from 100 to 599` });
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
    issues.push({ path: keyPath(parentPath, key), message: `${key} must be a non-negative integer` });
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

function requireArtifactFingerprint(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (!isPluginReviewArtifactRecordFingerprint(value)) {
    issues.push({ path: keyPath(parentPath, key), message: `${key} must be a 32-character lowercase artifact fingerprint` });
  }
}

function optionalArtifactFingerprint(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  if (record[key] !== undefined) {
    requireArtifactFingerprint(record, key, issues, parentPath);
  }
}

function requireSha256(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (typeof value !== "string" || !new RegExp(HEX_SHA256_PATTERN).test(value)) {
    issues.push({ path: keyPath(parentPath, key), message: `${key} must be a lowercase sha256 digest` });
  }
}

function requireLocalArtifactPath(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  parentPath: string,
): void {
  const value = record[key];
  if (!isPluginReviewArtifactRecordPath(value)) {
    issues.push({
      path: keyPath(parentPath, key),
      message: `${key} must be a safe local artifact path`,
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
      path: keyPath(parentPath, key),
      message: `${key} must be a safe relative JSON fixture path`,
    });
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

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

function isSafeLocalArtifactPath(path: string): boolean {
  return (
    path.trim() === path &&
    new RegExp(LOCAL_ARTIFACT_PATH_PATTERN).test(path) &&
    hasSafePathTail(path)
  );
}

function hasSafePathTail(path: string): boolean {
  if (path.length === 0 || path.includes("\\") || path.startsWith("/") || path.endsWith("/")) {
    return false;
  }
  return path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function isSafeMetadataKey(value: string): boolean {
  return (
    new RegExp(METADATA_KEY_PATTERN).test(value) &&
    !SECRET_LIKE_METADATA_KEY_PATTERN.test(value)
  );
}

function isSafePersistedString(value: string): boolean {
  return !SECRET_LIKE_METADATA_VALUE_PATTERN.test(value) && !LOCAL_PATH_VALUE_PATTERN.test(value);
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
  kind: PluginReviewArtifactRecordKind,
  issues: readonly ValidationIssue[],
): string {
  const details = issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
  return `${kind} validation failed: ${details}`;
}

const recordKeys = [
  "schemaVersion",
  "id",
  "artifactFingerprint",
  "createdAt",
  "workspaceId",
  "reviewId",
  "pluginId",
  "artifactId",
  "source",
  "localOnly",
  "redacted",
  "decision",
  "summary",
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
  "baseArtifactFingerprint",
  "candidateArtifactFingerprint",
  "baseDecision",
  "candidateDecision",
  "compatible",
  "comparisonSummary",
  "differences",
] as const;

const createRequestKeys = [
  "schemaVersion",
  "requestedAt",
  "workspaceId",
  "reviewId",
  "pluginId",
  "artifactId",
  "artifactFingerprint",
  "source",
  "localOnly",
  "redacted",
  "decision",
  "summary",
  "metadata",
] as const;

const sourceRefKeys = ["previewSchemaVersion", "previewFingerprint", "artifactPath"] as const;

const summaryKeys = [
  "gateCount",
  "passedGateCount",
  "failedGateCount",
  "pendingGateCount",
  "warningGateCount",
  "skippedGateCount",
  "sandboxFindingCount",
  "blockingFindingCount",
  "evidenceCount",
  "redactionCount",
  "externalCallProposalCount",
] as const;

const comparisonSummaryKeys = ["added", "removed", "changed", "total"] as const;

const comparisonDifferenceKeys = [
  "path",
  "change",
  "baseArtifactFingerprint",
  "candidateArtifactFingerprint",
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
