import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  PLUGIN_REVIEW_ARTIFACT_RECORD_COMPARISON_SCHEMA_VERSION,
  PLUGIN_REVIEW_ARTIFACT_RECORD_CREATE_REQUEST_SCHEMA_VERSION,
  PLUGIN_REVIEW_ARTIFACT_RECORD_LIST_SCHEMA_VERSION,
  PLUGIN_REVIEW_ARTIFACT_RECORD_SCHEMA_VERSION,
  arePluginReviewArtifactRecordsCompatible,
  assertPluginReviewArtifactRecord,
  assertPluginReviewArtifactRecordComparison,
  assertPluginReviewArtifactRecordCreateRequest,
  assertPluginReviewArtifactRecordList,
  assertPluginReviewArtifactRecordObject,
  getPluginReviewArtifactRecordCompatibilityKey,
  getPluginReviewArtifactRecordIdForFingerprint,
  getPluginReviewArtifactRecordSchema,
  isPluginReviewArtifactRecordFingerprint,
  isPluginReviewArtifactRecordId,
  isPluginReviewArtifactRecordPath,
  pluginReviewArtifactRecordComparisonChanges,
  pluginReviewArtifactRecordComparisonSchema,
  pluginReviewArtifactRecordCreateRequestSchema,
  pluginReviewArtifactRecordDecisions,
  pluginReviewArtifactRecordKinds,
  pluginReviewArtifactRecordListSchema,
  pluginReviewArtifactRecordSchema,
  pluginReviewArtifactRecordSchemaDefinitions,
  pluginReviewArtifactRecordSchemas,
  pluginReviewArtifactRecordValidators,
  validatePluginReviewArtifactRecord,
  validatePluginReviewArtifactRecordComparison,
  validatePluginReviewArtifactRecordCreateRequest,
  validatePluginReviewArtifactRecordList,
  validatePluginReviewArtifactRecordObject,
} from "../src/pluginReviewArtifactRecord.ts";

const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url));

const fixtureCases = [
  {
    kind: "pluginReviewArtifactRecord",
    fixture: "plugin-review-artifact-record.valid.json",
    schemaFixture: "plugin-review-artifact-record.schema.json",
    schema: pluginReviewArtifactRecordSchema,
    validator: validatePluginReviewArtifactRecord,
  },
  {
    kind: "pluginReviewArtifactRecordList",
    fixture: "plugin-review-artifact-record-list.valid.json",
    schemaFixture: "plugin-review-artifact-record-list.schema.json",
    schema: pluginReviewArtifactRecordListSchema,
    validator: validatePluginReviewArtifactRecordList,
  },
  {
    kind: "pluginReviewArtifactRecordComparison",
    fixture: "plugin-review-artifact-record-comparison.valid.json",
    schemaFixture: "plugin-review-artifact-record-comparison.schema.json",
    schema: pluginReviewArtifactRecordComparisonSchema,
    validator: validatePluginReviewArtifactRecordComparison,
  },
  {
    kind: "pluginReviewArtifactRecordCreateRequest",
    fixture: "plugin-review-artifact-record-create-request.valid.json",
    schemaFixture: "plugin-review-artifact-record-create-request.schema.json",
    schema: pluginReviewArtifactRecordCreateRequestSchema,
    validator: validatePluginReviewArtifactRecordCreateRequest,
  },
];

test("exposes persisted plugin review artifact record schema metadata", () => {
  assert.equal(PLUGIN_REVIEW_ARTIFACT_RECORD_SCHEMA_VERSION, "plugin-review-artifact-record/v1");
  assert.equal(PLUGIN_REVIEW_ARTIFACT_RECORD_LIST_SCHEMA_VERSION, "plugin-review-artifact-record-list/v1");
  assert.equal(
    PLUGIN_REVIEW_ARTIFACT_RECORD_COMPARISON_SCHEMA_VERSION,
    "plugin-review-artifact-record-comparison/v1",
  );
  assert.equal(
    PLUGIN_REVIEW_ARTIFACT_RECORD_CREATE_REQUEST_SCHEMA_VERSION,
    "plugin-review-artifact-record-create-request/v1",
  );
  assert.deepEqual(pluginReviewArtifactRecordKinds, [
    "pluginReviewArtifactRecord",
    "pluginReviewArtifactRecordList",
    "pluginReviewArtifactRecordComparison",
    "pluginReviewArtifactRecordCreateRequest",
  ]);
  assert.deepEqual(pluginReviewArtifactRecordDecisions, ["approved", "approval_required", "denied"]);
  assert.deepEqual(pluginReviewArtifactRecordComparisonChanges, ["added", "removed", "changed"]);

  for (const { kind, schema } of fixtureCases) {
    assert.equal(pluginReviewArtifactRecordSchemaDefinitions[kind].kind, kind);
    assert.equal(pluginReviewArtifactRecordSchemaDefinitions[kind].schema, schema);
    assert.equal(pluginReviewArtifactRecordSchemas[kind], schema);
    assert.equal(getPluginReviewArtifactRecordSchema(kind), schema);
  }

  assert.equal(
    pluginReviewArtifactRecordSchema.$id,
    "https://schemas.sovereignops.local/plugin-review/artifact-record.schema.json",
  );
  assert.equal(
    pluginReviewArtifactRecordSchema.properties.schemaVersion.const,
    PLUGIN_REVIEW_ARTIFACT_RECORD_SCHEMA_VERSION,
  );
});

test("schema export fixtures match source schema exports", async () => {
  for (const { schemaFixture, schema } of fixtureCases) {
    assert.deepEqual(await readFixtureJson(schemaFixture), JSON.parse(JSON.stringify(schema)));
  }
});

test("valid fixtures satisfy runtime validators and JSON schema contracts", async () => {
  for (const { kind, fixture, schema, validator } of fixtureCases) {
    const value = await readFixtureJson(fixture);
    const runtimeResult = validator(value);
    const genericResult = validatePluginReviewArtifactRecordObject(kind, value);
    const schemaIssues = validateWithJsonSchema(schema, value);

    assert.equal(runtimeResult.ok, true, `${fixture}: ${formatIssues(runtimeResult.issues)}`);
    assert.equal(genericResult.ok, true, `${fixture}: ${formatIssues(genericResult.issues)}`);
    assert.equal(pluginReviewArtifactRecordValidators[kind](value).ok, true);
    assert.deepEqual(schemaIssues, [], `${fixture}: ${formatIssues(schemaIssues)}`);
    assert.doesNotThrow(() => assertPluginReviewArtifactRecordObject(kind, value));
  }

  const record = await readFixtureJson("plugin-review-artifact-record.valid.json");
  const list = await readFixtureJson("plugin-review-artifact-record-list.valid.json");
  const comparison = await readFixtureJson("plugin-review-artifact-record-comparison.valid.json");
  const createRequest = await readFixtureJson("plugin-review-artifact-record-create-request.valid.json");

  assert.doesNotThrow(() => assertPluginReviewArtifactRecord(record));
  assert.doesNotThrow(() => assertPluginReviewArtifactRecordList(list));
  assert.doesNotThrow(() => assertPluginReviewArtifactRecordComparison(comparison));
  assert.doesNotThrow(() => assertPluginReviewArtifactRecordCreateRequest(createRequest));
  assert.equal(isPluginReviewArtifactRecordId(record.id), true);
  assert.equal(isPluginReviewArtifactRecordFingerprint(record.artifactFingerprint), true);
  assert.equal(getPluginReviewArtifactRecordIdForFingerprint(record.artifactFingerprint), record.id);
});

test("successful record validation returns a cloned and deeply frozen value", async () => {
  const fixture = await readFixtureJson("plugin-review-artifact-record.valid.json");
  const result = validatePluginReviewArtifactRecord(fixture);

  assert.equal(result.ok, true, formatIssues(result.issues));
  assert.notEqual(result.value, fixture);
  assert.notEqual(result.value.source, fixture.source);
  assert.notEqual(result.value.summary, fixture.summary);
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value.source), true);
  assert.equal(Object.isFrozen(result.value.summary), true);

  fixture.summary.pendingGateCount = 0;
  assert.equal(result.value.summary.pendingGateCount, 1);
  assert.throws(() => {
    result.value.source.artifactPath = "changed.json";
  }, TypeError);
});

test("invalid fixture reports useful runtime paths and JSON schema issues", async () => {
  const fixture = await readFixtureJson("plugin-review-artifact-record.invalid.json");
  const runtimeResult = validatePluginReviewArtifactRecord(fixture);
  const schemaIssues = validateWithJsonSchema(pluginReviewArtifactRecordSchema, fixture);
  const paths = issuePaths(runtimeResult.issues);

  assert.equal(runtimeResult.ok, false);
  assert.ok(paths.includes("schemaVersion"));
  assert.ok(paths.includes("id"));
  assert.ok(paths.includes("artifactFingerprint"));
  assert.ok(paths.includes("createdAt"));
  assert.ok(paths.includes("workspaceId"));
  assert.ok(paths.includes("reviewId"));
  assert.ok(paths.includes("pluginId"));
  assert.ok(paths.includes("artifactId"));
  assert.ok(paths.includes("source.previewSchemaVersion"));
  assert.ok(paths.includes("source.previewFingerprint"));
  assert.ok(paths.includes("source.artifactPath"));
  assert.ok(paths.includes("source.extra"));
  assert.ok(paths.includes("localOnly"));
  assert.ok(paths.includes("redacted"));
  assert.ok(paths.includes("decision"));
  assert.ok(paths.includes("summary.gateCount"));
  assert.ok(paths.includes("summary.pendingGateCount"));
  assert.ok(paths.includes("summary.blockingFindingCount"));
  assert.ok(paths.includes("summary.evidenceCount"));
  assert.ok(paths.includes("summary.redactionCount"));
  assert.ok(paths.includes("summary.externalCallProposalCount"));
  assert.ok(paths.includes("summary.extra"));
  assert.ok(paths.includes("metadata.apiToken"));
  assert.ok(paths.includes("metadata.localPath"));
  assert.ok(paths.includes("metadata.safeLabel"));
  assert.ok(paths.includes("metadata.nested"));
  assert.ok(paths.includes("unexpected"));
  assert.ok(schemaIssues.length > 0);
  assert.ok(issuePaths(schemaIssues).includes("$.schemaVersion"));
  assert.ok(issuePaths(schemaIssues).includes("$.source.artifactPath"));
  assert.ok(issuePaths(schemaIssues).includes("$.metadata.apiToken"));
  assert.ok(issuePaths(schemaIssues).includes("$.metadata.localPath"));
  assert.ok(issuePaths(schemaIssues).includes("$.metadata.safeLabel"));
  assert.ok(issuePaths(schemaIssues).includes("$.metadata.nested"));
});

test("compatibility keys are deterministic and comparison summaries are checked", async () => {
  const record = await readFixtureJson("plugin-review-artifact-record.valid.json");
  const reordered = cloneJson(record);
  reordered.metadata = {
    retryCount: 0,
    workflowId: "wf_plugin_review_record",
    maskedValue: "[REDACTED]",
    clientLabel: "offline-notes",
  };

  assert.equal(validatePluginReviewArtifactRecord(reordered).ok, true);
  assert.equal(
    getPluginReviewArtifactRecordCompatibilityKey(record),
    getPluginReviewArtifactRecordCompatibilityKey(reordered),
  );
  assert.equal(arePluginReviewArtifactRecordsCompatible(record, reordered), true);

  const comparison = await readFixtureJson("plugin-review-artifact-record-comparison.valid.json");
  comparison.compatible = false;
  const emptyDifferenceResult = validatePluginReviewArtifactRecordComparison(comparison);
  let paths = issuePaths(emptyDifferenceResult.issues);

  assert.equal(emptyDifferenceResult.ok, false);
  assert.ok(paths.includes("candidateArtifactFingerprint"));
  assert.ok(paths.includes("differences"));

  comparison.candidateArtifactFingerprint = "33333333333333333333333333333333";
  comparison.differences = [
    {
      path: "summary.pendingGateCount",
      change: "changed",
      baseArtifactFingerprint: "22222222222222222222222222222222",
      candidateArtifactFingerprint: "33333333333333333333333333333333"
    }
  ];
  const mismatchedSummaryResult = validatePluginReviewArtifactRecordComparison(comparison);
  paths = issuePaths(mismatchedSummaryResult.issues);

  assert.equal(mismatchedSummaryResult.ok, false);
  assert.ok(paths.includes("comparisonSummary.changed"));
  assert.ok(paths.includes("comparisonSummary.total"));
});

test("rejects unsafe local paths and secret-looking persisted data", async () => {
  const fixture = await readFixtureJson("plugin-review-artifact-record.valid.json");
  fixture.source.artifactPath = "C:/Users/DELL/plugin-review/artifact.json";
  fixture.metadata.apiKey = "not-a-real-key";
  fixture.metadata.visibleLabel = "token=visible-value";
  fixture.metadata.absolutePath = "/tmp/plugin-review/artifact.json";

  const result = validatePluginReviewArtifactRecord(fixture);
  const paths = issuePaths(result.issues);

  assert.equal(result.ok, false);
  assert.ok(paths.includes("source.artifactPath"));
  assert.ok(paths.includes("metadata.apiKey"));
  assert.ok(paths.includes("metadata.visibleLabel"));
  assert.ok(paths.includes("metadata.absolutePath"));
});

test("helpers accept only stable record ids, fingerprints, and safe paths", () => {
  assert.equal(isPluginReviewArtifactRecordFingerprint("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), true);
  assert.equal(isPluginReviewArtifactRecordFingerprint("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"), false);
  assert.equal(getPluginReviewArtifactRecordIdForFingerprint("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), "prar_aaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(isPluginReviewArtifactRecordId("prar_aaaaaaaaaaaaaaaaaaaaaaaa"), true);
  assert.equal(isPluginReviewArtifactRecordId("prar_aaaaaaaa"), false);
  assert.equal(isPluginReviewArtifactRecordPath("artifacts/plugin-review/offline-notes/review.json"), true);
  assert.equal(isPluginReviewArtifactRecordPath("artifacts/plugin-review/../review.json"), false);
  assert.equal(isPluginReviewArtifactRecordPath("E:/SovereignOps/artifacts/plugin-review/review.json"), false);
  assert.equal(isPluginReviewArtifactRecordPath("artifacts/plugin-review/review.json/"), false);
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
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      issues.push({ path, message: `expected to match ${schema.pattern}` });
    }
  }

  if (typeof value === "number" && schema.minimum !== undefined && value < schema.minimum) {
    issues.push({ path, message: `expected at least ${schema.minimum}` });
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

    if (schema.propertyNames) {
      for (const key of Object.keys(value)) {
        validateWithJsonSchema(schema.propertyNames, key, `${path}.${key}`, issues);
      }
    }

    if (schema.additionalProperties === false) {
      const allowedKeys = new Set(Object.keys(properties));
      for (const key of Object.keys(value)) {
        if (!allowedKeys.has(key)) {
          issues.push({ path: `${path}.${key}`, message: "not allowed" });
        }
      }
    } else if (isRecord(schema.additionalProperties)) {
      for (const [key, entryValue] of Object.entries(value)) {
        if (!Object.hasOwn(properties, key)) {
          validateWithJsonSchema(schema.additionalProperties, entryValue, `${path}.${key}`, issues);
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
