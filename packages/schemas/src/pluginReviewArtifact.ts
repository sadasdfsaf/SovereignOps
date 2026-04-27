export const PLUGIN_REVIEW_ARTIFACT_PREVIEW_SCHEMA_VERSION = "plugin-review-artifact-preview.v1";
export const JSON_SCHEMA_DRAFT = "https://json-schema.org/draft/2020-12/schema";

export const pluginReviewArtifactKinds = ["pluginReviewArtifactPreview"] as const;
export type PluginReviewArtifactKind = (typeof pluginReviewArtifactKinds)[number];

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
  kind: "pluginReviewArtifactPreview";
  schemaVersion: typeof PLUGIN_REVIEW_ARTIFACT_PREVIEW_SCHEMA_VERSION;
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

export const pluginReviewArtifactPreviewSchemaDefinition = deepFreeze({
  kind: "pluginReviewArtifactPreview",
  schemaVersion: PLUGIN_REVIEW_ARTIFACT_PREVIEW_SCHEMA_VERSION,
  title: pluginReviewArtifactPreviewSchema.title ?? "Plugin review artifact preview",
  schema: pluginReviewArtifactPreviewSchema,
} satisfies PluginReviewArtifactSchemaDefinition);

export const pluginReviewArtifactSchemas = {
  pluginReviewArtifactPreview: pluginReviewArtifactPreviewSchema,
} as const satisfies Record<PluginReviewArtifactKind, PluginReviewArtifactJsonSchema>;

export const pluginReviewArtifactValidators = {
  pluginReviewArtifactPreview: validatePluginReviewArtifactPreview,
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
): ValidationResult<K extends "pluginReviewArtifactPreview" ? PluginReviewArtifactPreview : unknown> {
  const validator = pluginReviewArtifactValidators[kind] as (candidate: unknown) => ValidationResult<unknown>;
  return validator(value) as ValidationResult<
    K extends "pluginReviewArtifactPreview" ? PluginReviewArtifactPreview : unknown
  >;
}

export function assertPluginReviewArtifactObject<K extends PluginReviewArtifactKind>(
  kind: K,
  value: unknown,
): asserts value is K extends "pluginReviewArtifactPreview" ? PluginReviewArtifactPreview : unknown {
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
