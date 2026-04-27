import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  MCP_APPROVAL_EVIDENCE_RECORD_COMPARISON_SCHEMA_VERSION,
  MCP_APPROVAL_EVIDENCE_RECORD_CREATE_REQUEST_SCHEMA_VERSION,
  MCP_APPROVAL_EVIDENCE_RECORD_LIST_SCHEMA_VERSION,
  MCP_APPROVAL_EVIDENCE_RECORD_SCHEMA_VERSION,
  areMcpApprovalEvidenceRecordsCompatible,
  assertMcpApprovalEvidenceRecord,
  assertMcpApprovalEvidenceRecordComparison,
  assertMcpApprovalEvidenceRecordCreateRequest,
  assertMcpApprovalEvidenceRecordList,
  assertMcpApprovalEvidenceRecordObject,
  getMcpApprovalEvidenceRecordCompatibilityKey,
  getMcpApprovalEvidenceRecordIdForFingerprint,
  getMcpApprovalEvidenceRecordSchema,
  isMcpApprovalEvidenceRecordFingerprint,
  isMcpApprovalEvidenceRecordId,
  mcpApprovalEvidenceReferenceRoles,
  mcpApprovalEvidenceRecordComparisonChanges,
  mcpApprovalEvidenceRecordComparisonSchema,
  mcpApprovalEvidenceRecordCreateRequestSchema,
  mcpApprovalEvidenceRecordKinds,
  mcpApprovalEvidenceRecordListSchema,
  mcpApprovalEvidenceRecordSchema,
  mcpApprovalEvidenceRecordSchemaDefinitions,
  mcpApprovalEvidenceRecordSchemas,
  mcpApprovalEvidenceRecordValidators,
  validateMcpApprovalEvidenceRecord,
  validateMcpApprovalEvidenceRecordComparison,
  validateMcpApprovalEvidenceRecordCreateRequest,
  validateMcpApprovalEvidenceRecordList,
  validateMcpApprovalEvidenceRecordObject,
} from "../src/mcpApprovalEvidenceRecord.ts";

const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url));

const fixtureCases = [
  {
    kind: "mcpApprovalEvidenceRecord",
    fixture: "mcp-approval-evidence-record.valid.json",
    schemaFixture: "mcp-approval-evidence-record.schema.json",
    schema: mcpApprovalEvidenceRecordSchema,
    validator: validateMcpApprovalEvidenceRecord,
  },
  {
    kind: "mcpApprovalEvidenceRecordList",
    fixture: "mcp-approval-evidence-record-list.valid.json",
    schemaFixture: "mcp-approval-evidence-record-list.schema.json",
    schema: mcpApprovalEvidenceRecordListSchema,
    validator: validateMcpApprovalEvidenceRecordList,
  },
  {
    kind: "mcpApprovalEvidenceRecordComparison",
    fixture: "mcp-approval-evidence-record-comparison.valid.json",
    schemaFixture: "mcp-approval-evidence-record-comparison.schema.json",
    schema: mcpApprovalEvidenceRecordComparisonSchema,
    validator: validateMcpApprovalEvidenceRecordComparison,
  },
  {
    kind: "mcpApprovalEvidenceRecordCreateRequest",
    fixture: "mcp-approval-evidence-record-create-request.valid.json",
    schemaFixture: "mcp-approval-evidence-record-create-request.schema.json",
    schema: mcpApprovalEvidenceRecordCreateRequestSchema,
    validator: validateMcpApprovalEvidenceRecordCreateRequest,
  },
];

test("exposes persisted MCP approval evidence record schema metadata", () => {
  assert.equal(MCP_APPROVAL_EVIDENCE_RECORD_SCHEMA_VERSION, "mcp-approval-evidence-record/v1");
  assert.equal(MCP_APPROVAL_EVIDENCE_RECORD_LIST_SCHEMA_VERSION, "mcp-approval-evidence-record-list/v1");
  assert.equal(
    MCP_APPROVAL_EVIDENCE_RECORD_COMPARISON_SCHEMA_VERSION,
    "mcp-approval-evidence-record-comparison/v1",
  );
  assert.equal(
    MCP_APPROVAL_EVIDENCE_RECORD_CREATE_REQUEST_SCHEMA_VERSION,
    "mcp-approval-evidence-record-create-request/v1",
  );
  assert.deepEqual(mcpApprovalEvidenceRecordKinds, [
    "mcpApprovalEvidenceRecord",
    "mcpApprovalEvidenceRecordList",
    "mcpApprovalEvidenceRecordComparison",
    "mcpApprovalEvidenceRecordCreateRequest",
  ]);
  assert.deepEqual(mcpApprovalEvidenceReferenceRoles, ["source", "supporting"]);
  assert.deepEqual(mcpApprovalEvidenceRecordComparisonChanges, ["added", "removed", "changed"]);

  for (const { kind, schema } of fixtureCases) {
    assert.equal(mcpApprovalEvidenceRecordSchemaDefinitions[kind].kind, kind);
    assert.equal(mcpApprovalEvidenceRecordSchemaDefinitions[kind].schema, schema);
    assert.equal(mcpApprovalEvidenceRecordSchemas[kind], schema);
    assert.equal(getMcpApprovalEvidenceRecordSchema(kind), schema);
  }

  assert.equal(
    mcpApprovalEvidenceRecordSchema.$id,
    "https://schemas.sovereignops.local/mcp/approval-evidence-record.schema.json",
  );
  assert.equal(
    mcpApprovalEvidenceRecordSchema.properties.schemaVersion.const,
    MCP_APPROVAL_EVIDENCE_RECORD_SCHEMA_VERSION,
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
    const genericResult = validateMcpApprovalEvidenceRecordObject(kind, value);
    const schemaIssues = validateWithJsonSchema(schema, value);

    assert.equal(runtimeResult.ok, true, `${fixture}: ${formatIssues(runtimeResult.issues)}`);
    assert.equal(genericResult.ok, true, `${fixture}: ${formatIssues(genericResult.issues)}`);
    assert.equal(mcpApprovalEvidenceRecordValidators[kind](value).ok, true);
    assert.deepEqual(schemaIssues, [], `${fixture}: ${formatIssues(schemaIssues)}`);
    assert.doesNotThrow(() => assertMcpApprovalEvidenceRecordObject(kind, value));
  }

  const record = await readFixtureJson("mcp-approval-evidence-record.valid.json");
  const list = await readFixtureJson("mcp-approval-evidence-record-list.valid.json");
  const comparison = await readFixtureJson("mcp-approval-evidence-record-comparison.valid.json");
  const createRequest = await readFixtureJson("mcp-approval-evidence-record-create-request.valid.json");

  assert.doesNotThrow(() => assertMcpApprovalEvidenceRecord(record));
  assert.doesNotThrow(() => assertMcpApprovalEvidenceRecordList(list));
  assert.doesNotThrow(() => assertMcpApprovalEvidenceRecordComparison(comparison));
  assert.doesNotThrow(() => assertMcpApprovalEvidenceRecordCreateRequest(createRequest));
  assert.equal(isMcpApprovalEvidenceRecordId(record.id), true);
  assert.equal(isMcpApprovalEvidenceRecordFingerprint(record.fingerprint), true);
  assert.equal(getMcpApprovalEvidenceRecordIdForFingerprint(record.fingerprint), record.id);
});

test("successful record validation returns a cloned and deeply frozen value", async () => {
  const fixture = await readFixtureJson("mcp-approval-evidence-record.valid.json");
  const result = validateMcpApprovalEvidenceRecord(fixture);

  assert.equal(result.ok, true, formatIssues(result.issues));
  assert.notEqual(result.value, fixture);
  assert.notEqual(result.value.evidenceRefs, fixture.evidenceRefs);
  assert.notEqual(result.value.redactionSummary, fixture.redactionSummary);
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value.evidenceRefs), true);
  assert.equal(Object.isFrozen(result.value.redactionSummary), true);

  fixture.evidenceRefs[0].evidenceId = "mcpae_mutated";
  assert.equal(result.value.evidenceRefs[0].evidenceId, "mcpae_localNotesReview");
  assert.throws(() => {
    result.value.evidenceRefs[0].evidenceId = "mcpae_changed";
  }, TypeError);
});

test("invalid fixture reports useful runtime paths and JSON schema issues", async () => {
  const fixture = await readFixtureJson("mcp-approval-evidence-record.invalid.json");
  const runtimeResult = validateMcpApprovalEvidenceRecord(fixture);
  const schemaIssues = validateWithJsonSchema(mcpApprovalEvidenceRecordSchema, fixture);
  const paths = issuePaths(runtimeResult.issues);

  assert.equal(runtimeResult.ok, false);
  assert.ok(paths.includes("schemaVersion"));
  assert.ok(paths.includes("id"));
  assert.ok(paths.includes("fingerprint"));
  assert.ok(paths.includes("createdAt"));
  assert.ok(paths.includes("workspaceId"));
  assert.ok(paths.includes("sourcePreviewFingerprint"));
  assert.ok(paths.includes("localOnly"));
  assert.ok(paths.includes("redacted"));
  assert.ok(paths.includes("policyDecision"));
  assert.ok(paths.includes("approvalStatus"));
  assert.ok(paths.includes("unexpected"));
  assert.ok(paths.includes("evidenceRefs[0].evidenceSchemaVersion"));
  assert.ok(paths.includes("evidenceRefs[0].capturedAt"));
  assert.ok(paths.includes("evidenceRefs[0].redacted"));
  assert.ok(paths.includes("evidenceRefs[1].evidenceId"));
  assert.ok(paths.includes("evidenceRefs[1].role"));
  assert.ok(paths.includes("evidenceRefs[1].fingerprint"));
  assert.ok(paths.includes("evidenceRefs[1].extra"));
  assert.ok(paths.includes("redactionSummary.redacted"));
  assert.ok(paths.includes("redactionSummary.redactedFieldCount"));
  assert.ok(paths.includes("redactionSummary.redactedPaths[0]"));
  assert.ok(paths.includes("redactionSummary.retainedMetadataKeys[1]"));
  assert.ok(paths.includes("redactionSummary.rawValue"));
  assert.ok(paths.includes("metadata.accessToken"));
  assert.ok(paths.includes("metadata.rawArguments"));
  assert.ok(paths.includes("metadata.nested"));
  assert.ok(schemaIssues.length > 0);
  assert.ok(issuePaths(schemaIssues).includes("$.schemaVersion"));
  assert.ok(issuePaths(schemaIssues).includes("$.localOnly"));
  assert.ok(issuePaths(schemaIssues).includes("$.metadata.accessToken"));
  assert.ok(issuePaths(schemaIssues).includes("$.metadata.rawArguments"));
});

test("compatibility keys are deterministic and redaction aware", async () => {
  const record = await readFixtureJson("mcp-approval-evidence-record.valid.json");
  const reordered = cloneJson(record);
  reordered.metadata = {
    retryCount: 0,
    workflowId: "wf_offline_review",
    maskedValue: "[REDACTED]",
    clientLabel: "local-notes",
  };

  assert.equal(validateMcpApprovalEvidenceRecord(reordered).ok, true);
  assert.equal(
    getMcpApprovalEvidenceRecordCompatibilityKey(record),
    getMcpApprovalEvidenceRecordCompatibilityKey(reordered),
  );
  assert.equal(areMcpApprovalEvidenceRecordsCompatible(record, reordered), true);

  const changedSource = cloneJson(record);
  changedSource.sourcePreviewFingerprint = "3333333333333333333333333333333333333333333333333333333333333333";
  changedSource.evidenceRefs[0].fingerprint = changedSource.sourcePreviewFingerprint;

  assert.equal(validateMcpApprovalEvidenceRecord(changedSource).ok, true);
  assert.notEqual(
    getMcpApprovalEvidenceRecordCompatibilityKey(record),
    getMcpApprovalEvidenceRecordCompatibilityKey(changedSource),
  );
  assert.equal(areMcpApprovalEvidenceRecordsCompatible(record, changedSource), false);
});

test("rejects redaction-sensitive fields on persisted records", async () => {
  const fixture = await readFixtureJson("mcp-approval-evidence-record.valid.json");
  fixture.metadata.apiToken = "not-a-real-token";
  fixture.metadata.rawPreview = "visible";
  fixture.evidenceRefs[0].redacted = false;
  fixture.redactionSummary.retainedMetadataKeys = [
    ...fixture.redactionSummary.retainedMetadataKeys,
    "secretToken",
  ];

  const result = validateMcpApprovalEvidenceRecord(fixture);
  const paths = issuePaths(result.issues);

  assert.equal(result.ok, false);
  assert.ok(paths.includes("metadata.apiToken"));
  assert.ok(paths.includes("metadata.rawPreview"));
  assert.ok(paths.includes("evidenceRefs[0].redacted"));
  assert.ok(paths.includes("redactionSummary.retainedMetadataKeys[3]"));
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
