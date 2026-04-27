import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  API_ERROR_SCHEMA_VERSION,
  apiErrorCodes,
  apiErrorKinds,
  apiErrorSchemaDefinitions,
  apiErrorSchemas,
  apiErrorStatusByCode,
  apiErrorStatuses,
  apiErrorValidators,
  assertApiErrorObject,
  assertErrorResponse,
  assertValidationIssue,
  errorResponseSchema,
  getApiErrorSchema,
  getErrorResponseSchema,
  getValidationIssueSchema,
  isApiErrorCode,
  isApiErrorRequestId,
  isApiErrorStatus,
  isValidationIssueCode,
  isValidationIssuePath,
  validateApiErrorObject,
  validateErrorResponse,
  validateValidationIssue,
  validationIssueCodes,
  validationIssueExpectations,
  validationIssueReceivedTypes,
  validationIssueSchema,
} from "../src/apiError.ts";

const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url));

test("exposes API error schema metadata and enum contracts", () => {
  assert.equal(API_ERROR_SCHEMA_VERSION, "api-error/v1");
  assert.deepEqual(apiErrorKinds, ["errorResponse", "validationIssue"]);
  assert.deepEqual(apiErrorCodes, [
    "bad_request",
    "unauthenticated",
    "forbidden",
    "not_found",
    "conflict",
    "validation_failed",
    "rate_limited",
    "internal_error",
    "service_unavailable",
  ]);
  assert.deepEqual(apiErrorStatuses, [400, 401, 403, 404, 409, 422, 429, 500, 503]);
  assert.equal(apiErrorStatusByCode.validation_failed, 422);
  assert.deepEqual(validationIssueCodes.slice(0, 4), ["required", "invalid_type", "invalid_format", "invalid_value"]);
  assert.ok(validationIssueExpectations.includes("non_empty_string"));
  assert.ok(validationIssueReceivedTypes.includes("missing"));

  assert.equal(apiErrorSchemaDefinitions.length, apiErrorKinds.length);
  assert.equal(apiErrorSchemaDefinitions[0].schema, errorResponseSchema);
  assert.equal(apiErrorSchemaDefinitions[1].schema, validationIssueSchema);
  assert.equal(getApiErrorSchema("errorResponse"), apiErrorSchemas.errorResponse);
  assert.equal(getApiErrorSchema("validationIssue"), apiErrorSchemas.validationIssue);
  assert.equal(getErrorResponseSchema(), errorResponseSchema);
  assert.equal(getValidationIssueSchema(), validationIssueSchema);
  assert.equal(errorResponseSchema.$id, "https://schemas.sovereignops.local/api/error-response.schema.json");
  assert.equal(validationIssueSchema.$id, "https://schemas.sovereignops.local/api/validation-issue.schema.json");
  assert.equal(errorResponseSchema.properties.schemaVersion.const, API_ERROR_SCHEMA_VERSION);

  assert.equal(isApiErrorCode("not_found"), true);
  assert.equal(isApiErrorCode("missing"), false);
  assert.equal(isApiErrorStatus(404), true);
  assert.equal(isApiErrorStatus(418), false);
  assert.equal(isApiErrorRequestId("req_01HY9J6M4K8A9Z4P3G2T1C0B9D"), true);
  assert.equal(isApiErrorRequestId("request-01HY9J6M4K8A9Z4P3G2T1C0B9D"), false);
  assert.equal(isValidationIssueCode("invalid_format"), true);
  assert.equal(isValidationIssueCode("raw_value"), false);
  assert.equal(isValidationIssuePath("body.items[0].name"), true);
  assert.equal(isValidationIssuePath("body.items[0].name=\"raw\""), false);
});

test("valid fixture satisfies runtime validators and schema contracts", async () => {
  const fixture = await readFixtureJson("api-error.valid.json");
  const runtimeResult = validateErrorResponse(fixture);
  const genericResult = validateApiErrorObject("errorResponse", fixture);
  const schemaIssues = validateWithJsonSchema(errorResponseSchema, fixture);
  const issueSchemaIssues = validateWithJsonSchema(validationIssueSchema, fixture.error.issues[0]);

  assert.equal(runtimeResult.ok, true, formatIssues(runtimeResult.issues));
  assert.equal(genericResult.ok, true, formatIssues(genericResult.issues));
  assert.deepEqual(runtimeResult.issues, []);
  assert.deepEqual(schemaIssues, []);
  assert.deepEqual(issueSchemaIssues, []);
  assert.equal(apiErrorValidators.errorResponse(fixture).ok, true);
  assert.equal(apiErrorValidators.validationIssue(fixture.error.issues[0]).ok, true);
  assert.equal(validateValidationIssue(fixture.error.issues[0]).ok, true);
  assert.doesNotThrow(() => assertErrorResponse(fixture));
  assert.doesNotThrow(() => assertValidationIssue(fixture.error.issues[0]));
  assert.doesNotThrow(() => assertApiErrorObject("errorResponse", fixture));
});

test("successful validation returns a cloned and deeply frozen value", async () => {
  const fixture = await readFixtureJson("api-error.valid.json");
  const result = validateErrorResponse(fixture);

  assert.equal(result.ok, true, formatIssues(result.issues));
  assert.notEqual(result.value, fixture);
  assert.notEqual(result.value.error, fixture.error);
  assert.notEqual(result.value.error.issues, fixture.error.issues);
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value.error), true);
  assert.equal(Object.isFrozen(result.value.error.issues[0]), true);

  fixture.error.requestId = "req_changed000000";
  assert.equal(result.value.error.requestId, "req_01HY9J6M4K8A9Z4P3G2T1C0B9D");
  assert.throws(() => {
    result.value.error.issues[0].path = "body.changed";
  }, TypeError);
});

test("invalid fixture reports useful runtime paths and schema issues", async () => {
  const fixture = await readFixtureJson("api-error.invalid.json");
  const runtimeResult = validateErrorResponse(fixture);
  const schemaIssues = validateWithJsonSchema(errorResponseSchema, fixture);
  const paths = issuePaths(runtimeResult.issues);

  assert.equal(runtimeResult.ok, false);
  assert.ok(paths.includes("schemaVersion"));
  assert.ok(paths.includes("unexpected"));
  assert.ok(paths.includes("error.debug"));
  assert.ok(paths.includes("error.status"));
  assert.ok(paths.includes("error.message"));
  assert.ok(paths.includes("error.requestId"));
  assert.ok(paths.includes("error.issues[1].path"));
  assert.ok(paths.includes("error.issues[2].path"));
  assert.ok(paths.includes("error.issues[3].code"));
  assert.ok(paths.includes("error.issues[3].message"));
  assert.ok(paths.includes("error.issues[3].expected"));
  assert.ok(paths.includes("error.issues[3].received"));
  assert.ok(paths.includes("error.issues[3].receivedValue"));
  assert.ok(schemaIssues.length > 0);
  assert.ok(issuePaths(schemaIssues).includes("$.schemaVersion"));
  assert.ok(issuePaths(schemaIssues).includes("$.error.message"));
  assert.ok(issuePaths(schemaIssues).includes("$.error.requestId"));
  assert.ok(issuePaths(schemaIssues).includes("$.error.issues[3].receivedValue"));
});

test("non-validation errors reject nested validation issues", () => {
  const response = {
    schemaVersion: API_ERROR_SCHEMA_VERSION,
    error: {
      code: "not_found",
      status: 404,
      message: "Document was not found.",
      requestId: "req_01HY9J6M4K8A9Z4P3G2T1C0B9D",
      issues: [
        {
          code: "required",
          path: "body.workspaceId",
          message: "workspaceId is required.",
          expected: "present",
          received: "missing",
        },
      ],
    },
  };

  const result = validateErrorResponse(response);

  assert.equal(result.ok, false);
  assert.ok(issuePaths(result.issues).includes("error.issues"));
});

test("validation issues are sorted and duplicate-free by path and code", async () => {
  const fixture = await readFixtureJson("api-error.valid.json");
  const unsorted = cloneJson(fixture);
  unsorted.error.issues = [...unsorted.error.issues].reverse();
  const duplicate = cloneJson(fixture);
  duplicate.error.issues = [duplicate.error.issues[0], cloneJson(duplicate.error.issues[0])];

  const unsortedResult = validateErrorResponse(unsorted);
  const duplicateResult = validateErrorResponse(duplicate);

  assert.equal(unsortedResult.ok, false);
  assert.ok(issuePaths(unsortedResult.issues).includes("error.issues[1].path"));
  assert.equal(duplicateResult.ok, false);
  assert.ok(issuePaths(duplicateResult.issues).includes("error.issues[1].path"));
});

test("validation issue contract rejects raw-value fields and unsafe text", () => {
  const result = validateValidationIssue({
    code: "invalid_value",
    path: "body.rawValue",
    message: "raw value \"abc\" is not allowed",
    expected: "allowed_value",
    received: "string",
    receivedValue: "abc",
  });
  const paths = issuePaths(result.issues);

  assert.equal(result.ok, false);
  assert.ok(paths.includes("message"));
  assert.ok(paths.includes("receivedValue"));
});

test("assertion helper includes the contract kind in failures", async () => {
  const fixture = await readFixtureJson("api-error.invalid.json");

  assert.throws(
    () => assertApiErrorObject("errorResponse", fixture),
    /errorResponse validation failed/,
  );
});

async function readFixtureJson(file) {
  return JSON.parse(await readFile(join(fixturesDir, file), "utf8"));
}

function issuePaths(issues) {
  return issues.map((issue) => issue.path);
}

function formatIssues(issues) {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function validateWithJsonSchema(schema, value, path = "$", issues = []) {
  if (schema.type && !matchesSchemaType(schema.type, value)) {
    issues.push({ path, message: `expected ${schema.type}` });
    return issues;
  }

  if (Object.hasOwn(schema, "const") && value !== schema.const) {
    issues.push({ path, message: `expected ${schema.const}` });
  }

  if (schema.enum && !schema.enum.includes(value)) {
    issues.push({ path, message: `expected one of ${schema.enum.join(", ")}` });
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      issues.push({ path, message: `expected at least ${schema.minLength} characters` });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      issues.push({ path, message: `expected at most ${schema.maxLength} characters` });
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      issues.push({ path, message: `expected to match ${schema.pattern}` });
    }
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      issues.push({ path, message: `expected at least ${schema.minimum}` });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      issues.push({ path, message: `expected at most ${schema.maximum}` });
    }
  }

  if (schema.type === "array" && Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      issues.push({ path, message: `expected at least ${schema.minItems} items` });
    }
    if (schema.items) {
      for (const [index, item] of value.entries()) {
        validateWithJsonSchema(schema.items, item, `${path}[${index}]`, issues);
      }
    }
  }

  if (schema.type === "object" && isRecord(value)) {
    const properties = schema.properties ?? {};

    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) {
        issues.push({ path: `${path}.${key}`, message: "required" });
      }
    }

    if (schema.additionalProperties === false) {
      const allowedKeys = new Set(Object.keys(properties));
      for (const key of Object.keys(value)) {
        if (!allowedKeys.has(key)) {
          issues.push({ path: `${path}.${key}`, message: "not allowed" });
        }
      }
    }

    for (const [key, propertySchema] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) {
        validateWithJsonSchema(propertySchema, value[key], `${path}.${key}`, issues);
      }
    }
  }

  return issues;
}

function matchesSchemaType(type, value) {
  if (Array.isArray(type)) {
    return type.some((item) => matchesSchemaType(item, value));
  }

  switch (type) {
    case "array":
      return Array.isArray(value);
    case "boolean":
      return typeof value === "boolean";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "null":
      return value === null;
    case "number":
      return typeof value === "number";
    case "object":
      return isRecord(value);
    case "string":
      return typeof value === "string";
    default:
      return false;
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
