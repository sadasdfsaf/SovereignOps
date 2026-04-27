export const API_ERROR_SCHEMA_VERSION = "api-error/v1";
export const JSON_SCHEMA_DRAFT = "https://json-schema.org/draft/2020-12/schema";

export const apiErrorKinds = ["errorResponse", "validationIssue"] as const;
export type ApiErrorKind = (typeof apiErrorKinds)[number];

export const apiErrorCodes = [
  "bad_request",
  "unauthenticated",
  "forbidden",
  "not_found",
  "conflict",
  "validation_failed",
  "rate_limited",
  "internal_error",
  "service_unavailable",
] as const;
export type ApiErrorCode = (typeof apiErrorCodes)[number];

export const apiErrorStatuses = [400, 401, 403, 404, 409, 422, 429, 500, 503] as const;
export type ApiErrorStatus = (typeof apiErrorStatuses)[number];

export const apiErrorStatusByCode = {
  bad_request: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  validation_failed: 422,
  rate_limited: 429,
  internal_error: 500,
  service_unavailable: 503,
} as const satisfies Record<ApiErrorCode, ApiErrorStatus>;

export const validationIssueCodes = [
  "required",
  "invalid_type",
  "invalid_format",
  "invalid_value",
  "too_small",
  "too_large",
  "not_allowed",
  "duplicate",
  "not_sorted",
] as const;
export type ValidationIssueCode = (typeof validationIssueCodes)[number];

export const validationIssueExpectations = [
  "array",
  "boolean",
  "integer",
  "number",
  "object",
  "string",
  "non_empty_string",
  "safe_identifier",
  "safe_path",
  "timestamp",
  "allowed_value",
  "present",
  "absent",
] as const;
export type ValidationIssueExpectation = (typeof validationIssueExpectations)[number];

export const validationIssueReceivedTypes = [
  "array",
  "boolean",
  "integer",
  "number",
  "object",
  "string",
  "null",
  "missing",
  "unknown",
] as const;
export type ValidationIssueReceivedType = (typeof validationIssueReceivedTypes)[number];

export type JsonSchemaType = "array" | "boolean" | "integer" | "null" | "number" | "object" | "string";

export interface ApiErrorJsonSchema {
  readonly $schema?: string;
  readonly $id?: string;
  readonly title?: string;
  readonly type?: JsonSchemaType | readonly JsonSchemaType[];
  readonly additionalProperties?: boolean | ApiErrorJsonSchema;
  readonly properties?: Record<string, ApiErrorJsonSchema>;
  readonly required?: readonly string[];
  readonly enum?: readonly (string | number | boolean | null)[];
  readonly const?: string | number | boolean | null;
  readonly pattern?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minItems?: number;
  readonly items?: ApiErrorJsonSchema;
}

export interface ApiErrorSchemaDefinition {
  kind: ApiErrorKind;
  schemaVersion: typeof API_ERROR_SCHEMA_VERSION;
  title: string;
  schema: ApiErrorJsonSchema;
}

export interface ApiErrorSchemaIssue {
  path: string;
  message: string;
}

export interface ValidationResult<TRecord = unknown> {
  ok: boolean;
  issues: ApiErrorSchemaIssue[];
  value?: TRecord;
}

export interface ValidationIssue {
  code: ValidationIssueCode;
  path: string;
  message: string;
  expected?: ValidationIssueExpectation;
  received?: ValidationIssueReceivedType;
}

export interface ErrorResponseError {
  code: ApiErrorCode;
  status: ApiErrorStatus;
  message: string;
  requestId: `req_${string}`;
  issues?: readonly ValidationIssue[];
}

export interface ErrorResponse {
  schemaVersion: typeof API_ERROR_SCHEMA_VERSION;
  error: ErrorResponseError;
}

export interface ApiErrorRecordByKind {
  errorResponse: ErrorResponse;
  validationIssue: ValidationIssue;
}

const ID_BODY_PATTERN = "[A-Za-z0-9_-]{8,96}";
const REQUEST_ID_PATTERN = `^req_${ID_BODY_PATTERN}$`;
const ISSUE_PATH_PATTERN =
  "^(?:\\$|[A-Za-z][A-Za-z0-9_-]*(?:\\[[0-9]+\\])?(?:\\.[A-Za-z][A-Za-z0-9_-]*(?:\\[[0-9]+\\])?)*)$";
const PUBLIC_MESSAGE_PATTERN = "^[A-Za-z0-9][A-Za-z0-9 ._,()\\[\\]-]{0,199}$";

export const validationIssueSchema = deepFreeze(
  objectSchema(
    "API validation issue",
    {
      code: enumSchema(validationIssueCodes),
      path: issuePathSchema(),
      message: publicMessageSchema(),
      expected: enumSchema(validationIssueExpectations),
      received: enumSchema(validationIssueReceivedTypes),
    },
    ["code", "path", "message"],
    "api/validation-issue",
  ),
);

const errorObjectSchema = objectSchema(
  "API error",
  {
    code: enumSchema(apiErrorCodes),
    status: enumSchema(apiErrorStatuses),
    message: publicMessageSchema(),
    requestId: requestIdSchema(),
    issues: arraySchema(validationIssueSchema, 1),
  },
  ["code", "status", "message", "requestId"],
);

export const errorResponseSchema = deepFreeze(
  objectSchema(
    "API error response",
    {
      schemaVersion: {
        type: "string",
        const: API_ERROR_SCHEMA_VERSION,
      },
      error: errorObjectSchema,
    },
    ["schemaVersion", "error"],
    "api/error-response",
  ),
);

export const apiErrorSchemaDefinitions = deepFreeze([
  {
    kind: "errorResponse",
    schemaVersion: API_ERROR_SCHEMA_VERSION,
    title: errorResponseSchema.title ?? "API error response",
    schema: errorResponseSchema,
  },
  {
    kind: "validationIssue",
    schemaVersion: API_ERROR_SCHEMA_VERSION,
    title: validationIssueSchema.title ?? "API validation issue",
    schema: validationIssueSchema,
  },
] as const satisfies readonly ApiErrorSchemaDefinition[]);

export const apiErrorSchemas = {
  errorResponse: errorResponseSchema,
  validationIssue: validationIssueSchema,
} as const satisfies Record<ApiErrorKind, ApiErrorJsonSchema>;

export const apiErrorValidators = {
  errorResponse: validateErrorResponse,
  validationIssue: validateValidationIssue,
} as const;

export function getApiErrorSchema(kind: ApiErrorKind): ApiErrorJsonSchema {
  return apiErrorSchemas[kind];
}

export function getErrorResponseSchema(): ApiErrorJsonSchema {
  return errorResponseSchema;
}

export function getValidationIssueSchema(): ApiErrorJsonSchema {
  return validationIssueSchema;
}

export function validateApiErrorObject<K extends ApiErrorKind>(
  kind: K,
  value: unknown,
): ValidationResult<ApiErrorRecordByKind[K]> {
  const validator = apiErrorValidators[kind] as (candidate: unknown) => ValidationResult<unknown>;
  return validator(value) as ValidationResult<ApiErrorRecordByKind[K]>;
}

export function assertApiErrorObject<K extends ApiErrorKind>(
  kind: K,
  value: unknown,
): asserts value is ApiErrorRecordByKind[K] {
  const result = validateApiErrorObject(kind, value);
  if (!result.ok) {
    throw new Error(formatValidationIssues(kind, result.issues));
  }
}

export function validateErrorResponse(value: unknown): ValidationResult<ErrorResponse> {
  const issues = recordIssues(value, "$");
  if (issues.length > 0) {
    return invalid(issues);
  }

  const record = value as Record<string, unknown>;
  requireOnlyKeys(record, "$", errorResponseKeys, issues);
  requireExactString(record, "schemaVersion", API_ERROR_SCHEMA_VERSION, issues);
  const error = requireRecord(record, "error", issues);
  if (error) {
    validateErrorObject(error, "error", issues);
  }

  return validationResult(value, issues);
}

export function validateValidationIssue(value: unknown): ValidationResult<ValidationIssue> {
  const issues: ApiErrorSchemaIssue[] = [];
  const record = validateValidationIssueValue(value, "$", issues);
  return issues.length === 0 && record
    ? { ok: true, issues, value: deepFreeze(cloneJson(record)) }
    : { ok: false, issues };
}

export function assertErrorResponse(value: unknown): asserts value is ErrorResponse {
  const result = validateErrorResponse(value);
  if (!result.ok) {
    throw new Error(formatValidationIssues("errorResponse", result.issues));
  }
}

export function assertValidationIssue(value: unknown): asserts value is ValidationIssue {
  const result = validateValidationIssue(value);
  if (!result.ok) {
    throw new Error(formatValidationIssues("validationIssue", result.issues));
  }
}

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return isOneOf(value, apiErrorCodes);
}

export function isApiErrorStatus(value: unknown): value is ApiErrorStatus {
  return typeof value === "number" && apiErrorStatuses.includes(value as ApiErrorStatus);
}

export function isApiErrorRequestId(value: unknown): value is `req_${string}` {
  return typeof value === "string" && new RegExp(REQUEST_ID_PATTERN).test(value);
}

export function isValidationIssueCode(value: unknown): value is ValidationIssueCode {
  return isOneOf(value, validationIssueCodes);
}

export function isValidationIssuePath(value: unknown): value is string {
  return typeof value === "string" && new RegExp(ISSUE_PATH_PATTERN).test(value);
}

function validateErrorObject(
  record: Record<string, unknown>,
  path: string,
  issues: ApiErrorSchemaIssue[],
): void {
  requireOnlyKeys(record, path, errorObjectKeys, issues);
  requireEnum(record, "code", apiErrorCodes, issues, path);
  requireEnum(record, "status", apiErrorStatuses, issues, path);
  requirePublicMessage(record, "message", issues, path);
  requirePattern(record, "requestId", REQUEST_ID_PATTERN, "requestId must use the req_ id prefix", issues, path);
  validateStatusForCode(record, path, issues);

  if (record.issues !== undefined) {
    if (record.code !== "validation_failed") {
      issues.push({
        path: `${path}.issues`,
        message: "issues may only be present when code is validation_failed",
      });
    }
    validateIssueArray(record, "issues", issues, path);
  } else if (record.code === "validation_failed") {
    issues.push({
      path: `${path}.issues`,
      message: "issues must contain at least one validation issue",
    });
  }
}

function validateValidationIssueValue(
  value: unknown,
  path: string,
  issues: ApiErrorSchemaIssue[],
): ValidationIssue | undefined {
  const record = requireRecordAtPath(value, path, issues);
  if (!record) {
    return undefined;
  }

  requireOnlyKeys(record, path, validationIssueKeys, issues);
  requireEnum(record, "code", validationIssueCodes, issues, path);
  requirePattern(record, "path", ISSUE_PATH_PATTERN, "path must be a redacted-safe field path", issues, path);
  requirePublicMessage(record, "message", issues, path);

  if (record.expected !== undefined) {
    requireEnum(record, "expected", validationIssueExpectations, issues, path);
  }
  if (record.received !== undefined) {
    requireEnum(record, "received", validationIssueReceivedTypes, issues, path);
  }

  return record as unknown as ValidationIssue;
}

function validateIssueArray(
  record: Record<string, unknown>,
  key: string,
  issues: ApiErrorSchemaIssue[],
  parentPath: string,
): ValidationIssue[] | undefined {
  const value = record[key];
  const path = `${parentPath}.${key}`;
  if (!Array.isArray(value)) {
    issues.push({ path, message: `${key} must be an array` });
    return undefined;
  }
  if (value.length === 0) {
    issues.push({ path, message: `${key} must contain at least one validation issue` });
  }

  const validIssues: ValidationIssue[] = [];
  const seen = new Set<string>();
  let previousKey: string | undefined;
  for (const [index, item] of value.entries()) {
    const issuePath = `${path}[${index}]`;
    const issue = validateValidationIssueValue(item, issuePath, issues);
    if (!issue) {
      continue;
    }

    validIssues.push(issue);
    const key = canonicalIssueKey(issue);
    if (seen.has(key)) {
      issues.push({
        path: `${issuePath}.path`,
        message: "validation issue paths and codes must be unique",
      });
    } else {
      seen.add(key);
    }
    if (previousKey !== undefined && key < previousKey) {
      issues.push({
        path: `${issuePath}.path`,
        message: "validation issues must be sorted by path and code",
      });
    }
    previousKey = key;
  }
  return validIssues;
}

function validateStatusForCode(
  record: Record<string, unknown>,
  path: string,
  issues: ApiErrorSchemaIssue[],
): void {
  if (!isApiErrorCode(record.code) || !isApiErrorStatus(record.status)) {
    return;
  }

  const expectedStatus = apiErrorStatusByCode[record.code];
  if (record.status !== expectedStatus) {
    issues.push({
      path: `${path}.status`,
      message: `status must be ${expectedStatus} for ${record.code}`,
    });
  }
}

function validationResult<TRecord>(
  value: unknown,
  issues: ApiErrorSchemaIssue[],
): ValidationResult<TRecord> {
  return issues.length === 0
    ? { ok: true, issues, value: deepFreeze(cloneJson(value)) as TRecord }
    : invalid(issues);
}

function invalid<TRecord>(issues: ApiErrorSchemaIssue[]): ValidationResult<TRecord> {
  return { ok: false, issues };
}

function recordIssues(value: unknown, path: string): ApiErrorSchemaIssue[] {
  return isRecord(value) ? [] : [{ path, message: "record must be an object" }];
}

function requireOnlyKeys(
  record: Record<string, unknown>,
  path: string,
  allowedKeys: readonly string[],
  issues: ApiErrorSchemaIssue[],
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(record).sort()) {
    if (!allowed.has(key)) {
      issues.push({ path: path === "$" ? key : `${path}.${key}`, message: `${key} is not allowed` });
    }
  }
}

function requireRecord(
  record: Record<string, unknown>,
  key: string,
  issues: ApiErrorSchemaIssue[],
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
  issues: ApiErrorSchemaIssue[],
): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    issues.push({ path, message: "record must be an object" });
    return undefined;
  }
  return value;
}

function requireExactString(
  record: Record<string, unknown>,
  key: string,
  expected: string,
  issues: ApiErrorSchemaIssue[],
  parentPath?: string,
): void {
  if (record[key] !== expected) {
    issues.push({
      path: parentPath ? `${parentPath}.${key}` : key,
      message: `${key} must be ${expected}`,
    });
  }
}

function requireEnum<TValue extends string | number>(
  record: Record<string, unknown>,
  key: string,
  allowed: readonly TValue[],
  issues: ApiErrorSchemaIssue[],
  parentPath: string,
): void {
  if (!allowed.includes(record[key] as TValue)) {
    const path = parentPath === "$" ? key : `${parentPath}.${key}`;
    issues.push({ path, message: `${key} must be one of ${allowed.join(", ")}` });
  }
}

function requirePattern(
  record: Record<string, unknown>,
  key: string,
  pattern: string,
  message: string,
  issues: ApiErrorSchemaIssue[],
  parentPath: string,
): void {
  const value = record[key];
  const path = parentPath === "$" ? key : `${parentPath}.${key}`;
  if (typeof value !== "string" || !new RegExp(pattern).test(value)) {
    issues.push({ path, message });
  }
}

function requirePublicMessage(
  record: Record<string, unknown>,
  key: string,
  issues: ApiErrorSchemaIssue[],
  parentPath: string,
): void {
  requirePattern(record, key, PUBLIC_MESSAGE_PATTERN, `${key} must be a redacted-safe public message`, issues, parentPath);
}

function canonicalIssueKey(issue: ValidationIssue): string {
  return `${issue.path}\u0000${issue.code}`;
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

function formatValidationIssues(kind: ApiErrorKind, issues: readonly ApiErrorSchemaIssue[]): string {
  const details = issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
  return `${kind} validation failed: ${details}`;
}

function objectSchema(
  title: string,
  properties: Record<string, ApiErrorJsonSchema>,
  required: readonly string[],
  id?: string,
): ApiErrorJsonSchema {
  return {
    ...(id ? { $schema: JSON_SCHEMA_DRAFT, $id: `https://schemas.sovereignops.local/${id}.schema.json` } : {}),
    title,
    type: "object",
    additionalProperties: false,
    properties,
    required,
  };
}

function enumSchema<TValue extends string | number>(values: readonly TValue[]): ApiErrorJsonSchema {
  return {
    type: typeof values[0] === "number" ? "integer" : "string",
    enum: values,
  };
}

function arraySchema(items: ApiErrorJsonSchema, minItems = 0): ApiErrorJsonSchema {
  return {
    type: "array",
    minItems,
    items,
  };
}

function requestIdSchema(): ApiErrorJsonSchema {
  return {
    type: "string",
    pattern: REQUEST_ID_PATTERN,
  };
}

function issuePathSchema(): ApiErrorJsonSchema {
  return {
    type: "string",
    pattern: ISSUE_PATH_PATTERN,
  };
}

function publicMessageSchema(): ApiErrorJsonSchema {
  return {
    type: "string",
    minLength: 1,
    maxLength: 200,
    pattern: PUBLIC_MESSAGE_PATTERN,
  };
}

const errorResponseKeys = ["schemaVersion", "error"] as const;

const errorObjectKeys = ["code", "status", "message", "requestId", "issues"] as const;

const validationIssueKeys = ["code", "path", "message", "expected", "received"] as const;
