import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  MCP_APPROVAL_EVIDENCE_PREVIEW_REQUESTS_SCHEMA_VERSION,
  MCP_APPROVAL_EVIDENCE_SCHEMA_VERSION,
  assertMcpApprovalEvidence,
  assertMcpApprovalEvidenceObject,
  assertMcpApprovalEvidencePreviewRequestBundle,
  getMcpApprovalEvidenceSchema,
  isMcpApprovalAuditEventId,
  isMcpApprovalEvidenceId,
  isMcpApprovalPolicyDecision,
  isMcpApprovalSessionId,
  isMcpApprovalStatus,
  mcpApprovalEvidenceApiRouteMethods,
  mcpApprovalAuditEventTypes,
  mcpApprovalEvidenceKinds,
  mcpApprovalEvidencePreviewRequestsSchema,
  mcpApprovalEvidenceSchema,
  mcpApprovalEvidenceSchemaDefinition,
  mcpApprovalEvidenceSchemaDefinitions,
  mcpApprovalEvidenceSchemas,
  mcpApprovalEvidenceValidators,
  mcpApprovalPolicyDecisions,
  mcpApprovalSessionRefRoles,
  mcpApprovalStatuses,
  normalizeMcpApprovalPolicyDecision,
  normalizeMcpApprovalStatus,
  validateMcpApprovalEvidenceObject,
  validateMcpApprovalEvidencePreviewRequestBundle,
  validateMcpApprovalAuditEventRef,
  validateMcpApprovalEvidence,
  validateMcpApprovalRedactionSummary,
  validateMcpApprovalSessionRef,
} from "../src/mcpApprovalEvidence.ts";

const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url));
const examplesDir = fileURLToPath(new URL("../../../examples/", import.meta.url));

test("exposes MCP approval evidence schema metadata and normalized enums", () => {
  assert.equal(MCP_APPROVAL_EVIDENCE_SCHEMA_VERSION, "mcp-approval-evidence/v1");
  assert.equal(
    MCP_APPROVAL_EVIDENCE_PREVIEW_REQUESTS_SCHEMA_VERSION,
    "mcp-approval-evidence-preview-requests.v1",
  );
  assert.deepEqual(mcpApprovalEvidenceKinds, [
    "mcpApprovalEvidence",
    "mcpApprovalEvidencePreviewRequests",
  ]);
  assert.equal(mcpApprovalEvidenceSchemaDefinition.kind, "mcpApprovalEvidence");
  assert.equal(mcpApprovalEvidenceSchemaDefinition.schemaVersion, MCP_APPROVAL_EVIDENCE_SCHEMA_VERSION);
  assert.equal(mcpApprovalEvidenceSchemaDefinition.schema, mcpApprovalEvidenceSchema);
  assert.equal(getMcpApprovalEvidenceSchema("mcpApprovalEvidence"), mcpApprovalEvidenceSchema);
  assert.equal(
    getMcpApprovalEvidenceSchema("mcpApprovalEvidencePreviewRequests"),
    mcpApprovalEvidenceSchemas.mcpApprovalEvidencePreviewRequests,
  );
  assert.equal(
    mcpApprovalEvidenceSchemaDefinitions.mcpApprovalEvidencePreviewRequests.schema,
    mcpApprovalEvidencePreviewRequestsSchema,
  );
  assert.equal(
    mcpApprovalEvidenceSchema.$id,
    "https://schemas.sovereignops.local/mcp/approval-evidence.schema.json",
  );
  assert.equal(mcpApprovalEvidenceSchema.properties.schemaVersion.const, MCP_APPROVAL_EVIDENCE_SCHEMA_VERSION);
  assert.deepEqual(mcpApprovalPolicyDecisions, ["allow", "require_approval", "deny"]);
  assert.deepEqual(mcpApprovalStatuses, ["pending", "approved", "rejected", "expired"]);
  assert.deepEqual(mcpApprovalSessionRefRoles, ["subject", "related"]);
  assert.deepEqual(mcpApprovalAuditEventTypes, ["policy_decision", "operation_succeeded", "operation_failed"]);
  assert.deepEqual(mcpApprovalEvidenceApiRouteMethods, ["GET", "POST", "PUT", "PATCH", "DELETE"]);

  assert.equal(normalizeMcpApprovalPolicyDecision("Require Approval"), "require_approval");
  assert.equal(normalizeMcpApprovalPolicyDecision("approval-required"), "require_approval");
  assert.equal(normalizeMcpApprovalPolicyDecision("DENIED"), "deny");
  assert.equal(normalizeMcpApprovalPolicyDecision("review"), undefined);
  assert.equal(normalizeMcpApprovalStatus(" APPROVE "), "approved");
  assert.equal(normalizeMcpApprovalStatus("rejected"), "rejected");
  assert.equal(normalizeMcpApprovalStatus("queued"), undefined);
});

test("MCP approval evidence preview API request schema export fixture matches source export", async () => {
  assert.deepEqual(
    await readFixtureJson("mcp-approval-evidence-preview-requests.schema.json"),
    JSON.parse(JSON.stringify(mcpApprovalEvidencePreviewRequestsSchema)),
  );
});

test("valid fixture satisfies runtime validators and schema contract", async () => {
  const fixture = await readFixtureJson("mcp-approval-evidence.valid.json");
  const runtimeResult = validateMcpApprovalEvidence(fixture);
  const schemaIssues = validateWithJsonSchema(mcpApprovalEvidenceSchema, fixture);

  assert.equal(runtimeResult.ok, true, formatIssues(runtimeResult.issues));
  assert.deepEqual(runtimeResult.issues, []);
  assert.deepEqual(schemaIssues, []);
  assert.equal(validateMcpApprovalSessionRef(fixture.sessionRefs[0]).ok, true);
  assert.equal(validateMcpApprovalAuditEventRef(fixture.auditEventRefs[0]).ok, true);
  assert.equal(validateMcpApprovalRedactionSummary(fixture.redactionSummary).ok, true);
  assert.equal(isMcpApprovalEvidenceId(fixture.id), true);
  assert.equal(isMcpApprovalSessionId(fixture.sessionRefs[0].sessionId), true);
  assert.equal(isMcpApprovalAuditEventId(fixture.auditEventRefs[0].eventId), true);
  assert.equal(isMcpApprovalPolicyDecision(fixture.policyDecision), true);
  assert.equal(isMcpApprovalStatus(fixture.approvalStatus), true);
  assert.doesNotThrow(() => assertMcpApprovalEvidence(fixture));
});

test("public MCP approval evidence preview API request bundle satisfies runtime validator and schema", async () => {
  const publicBundle = await readExampleJson("mcp/approval-evidence-preview-requests.json");
  const fixture = await readFixtureJson("mcp-approval-evidence-preview-requests.valid.json");

  assert.deepEqual(fixture, publicBundle);

  const runtimeResult = validateMcpApprovalEvidencePreviewRequestBundle(publicBundle);
  const genericResult = validateMcpApprovalEvidenceObject("mcpApprovalEvidencePreviewRequests", publicBundle);
  const schemaIssues = validateWithJsonSchema(mcpApprovalEvidencePreviewRequestsSchema, publicBundle);

  assert.equal(runtimeResult.ok, true, formatIssues(runtimeResult.issues));
  assert.equal(genericResult.ok, true, formatIssues(genericResult.issues));
  assert.equal(mcpApprovalEvidenceValidators.mcpApprovalEvidencePreviewRequests(publicBundle).ok, true);
  assert.deepEqual(schemaIssues, [], formatIssues(schemaIssues));
  assert.doesNotThrow(() => assertMcpApprovalEvidencePreviewRequestBundle(publicBundle));
  assert.doesNotThrow(() => assertMcpApprovalEvidenceObject("mcpApprovalEvidencePreviewRequests", publicBundle));
});

test("successful validation returns a cloned and deeply frozen value", async () => {
  const fixture = await readFixtureJson("mcp-approval-evidence.valid.json");
  const result = validateMcpApprovalEvidence(fixture);

  assert.equal(result.ok, true, formatIssues(result.issues));
  assert.notEqual(result.value, fixture);
  assert.notEqual(result.value.sessionRefs, fixture.sessionRefs);
  assert.notEqual(result.value.redactionSummary, fixture.redactionSummary);
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value.sessionRefs), true);
  assert.equal(Object.isFrozen(result.value.redactionSummary), true);

  fixture.sessionRefs[0].sessionId = "approval_mutated";
  assert.equal(result.value.sessionRefs[0].sessionId, "approval_localnotes_primary");
  assert.throws(() => {
    result.value.sessionRefs[0].sessionId = "approval_changed";
  }, TypeError);
});

test("successful preview API request bundle validation returns a cloned and deeply frozen value", async () => {
  const fixture = await readFixtureJson("mcp-approval-evidence-preview-requests.valid.json");
  const result = validateMcpApprovalEvidencePreviewRequestBundle(fixture);

  assert.equal(result.ok, true, formatIssues(result.issues));
  assert.notEqual(result.value, fixture);
  assert.notEqual(result.value.requests, fixture.requests);
  assert.notEqual(result.value.requests[0].request, fixture.requests[0].request);
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value.requests), true);
  assert.equal(Object.isFrozen(result.value.requests[0].request), true);

  fixture.requests[0].id = "changed";
  assert.equal(result.value.requests[0].id, "api_mcp_approval_evidence_preview_local_tasks");
  assert.throws(() => {
    result.value.requests[0].id = "changed";
  }, TypeError);
});

test("invalid fixture reports useful runtime paths and schema issues", async () => {
  const fixture = await readFixtureJson("mcp-approval-evidence.invalid.json");
  const runtimeResult = validateMcpApprovalEvidence(fixture);
  const schemaIssues = validateWithJsonSchema(mcpApprovalEvidenceSchema, fixture);
  const paths = issuePaths(runtimeResult.issues);

  assert.equal(runtimeResult.ok, false);
  assert.ok(paths.includes("schemaVersion"));
  assert.ok(paths.includes("id"));
  assert.ok(paths.includes("generatedAt"));
  assert.ok(paths.includes("workspaceId"));
  assert.ok(paths.includes("localOnly"));
  assert.ok(paths.includes("policyDecision"));
  assert.ok(paths.includes("approvalStatus"));
  assert.ok(paths.includes("unexpected"));
  assert.ok(paths.includes("sessionRefs[1].sessionId"));
  assert.ok(paths.includes("sessionRefs[1].status"));
  assert.ok(paths.includes("sessionRefs[1].extra"));
  assert.ok(paths.includes("auditEventRefs[1].eventId"));
  assert.ok(paths.includes("auditEventRefs[1].type"));
  assert.ok(paths.includes("auditEventRefs[1].occurredAt"));
  assert.ok(paths.includes("redactionSummary.redacted"));
  assert.ok(paths.includes("redactionSummary.redactedFieldCount"));
  assert.ok(paths.includes("redactionSummary.redactedPaths[0]"));
  assert.ok(paths.includes("redactionSummary.retainedMetadataKeys[1]"));
  assert.ok(paths.includes("redactionSummary.rawValue"));
  assert.ok(paths.includes("metadata.accessToken"));
  assert.ok(paths.includes("metadata.nested"));
  assert.ok(schemaIssues.length > 0);
  assert.ok(issuePaths(schemaIssues).includes("$.schemaVersion"));
  assert.ok(issuePaths(schemaIssues).includes("$.localOnly"));
  assert.ok(issuePaths(schemaIssues).includes("$.metadata.accessToken"));
});

test("invalid MCP approval evidence preview API request bundle reports useful paths", async () => {
  const fixture = await readFixtureJson("mcp-approval-evidence-preview-requests.invalid.json");
  const runtimeResult = validateMcpApprovalEvidencePreviewRequestBundle(fixture);
  const schemaIssues = validateWithJsonSchema(mcpApprovalEvidencePreviewRequestsSchema, fixture);
  const paths = issuePaths(runtimeResult.issues);

  assert.equal(runtimeResult.ok, false);
  assert.ok(paths.includes("fixtureRefs[0].fixturePath"));
  assert.ok(paths.includes("requests[0].request.headers.authorization"));
  assert.ok(paths.includes("requests[0].request.body.approvalSessions[0].metadata.source"));
  assert.ok(paths.includes("requests[0].request.body.approvalSessions[0].metadata.note"));
  assert.ok(paths.includes("requests[1].id"));
  assert.ok(schemaIssues.length > 0);
  assert.ok(issuePaths(schemaIssues).includes("$.fixtureRefs[0].fixturePath"));
});

test("session and audit refs must be sorted by canonical ids", async () => {
  const fixture = await readFixtureJson("mcp-approval-evidence.valid.json");

  const unsortedSessions = cloneJson(fixture);
  unsortedSessions.sessionRefs = [...unsortedSessions.sessionRefs].reverse();
  const sessionResult = validateMcpApprovalEvidence(unsortedSessions);
  assert.equal(sessionResult.ok, false);
  assert.ok(issuePaths(sessionResult.issues).includes("sessionRefs[1].sessionId"));

  const unsortedAudit = cloneJson(fixture);
  unsortedAudit.auditEventRefs = [...unsortedAudit.auditEventRefs].reverse();
  const auditResult = validateMcpApprovalEvidence(unsortedAudit);
  assert.equal(auditResult.ok, false);
  assert.ok(issuePaths(auditResult.issues).includes("auditEventRefs[1].eventId"));
});

test("rejects raw secret-like metadata fields", async () => {
  const fixture = await readFixtureJson("mcp-approval-evidence.valid.json");
  fixture.metadata.apiToken = "not-a-real-token";
  fixture.redactionSummary.retainedMetadataKeys = [
    ...fixture.redactionSummary.retainedMetadataKeys,
    "password",
  ];

  const result = validateMcpApprovalEvidence(fixture);
  const paths = issuePaths(result.issues);

  assert.equal(result.ok, false);
  assert.ok(paths.includes("metadata.apiToken"));
  assert.ok(paths.includes("redactionSummary.retainedMetadataKeys[3]"));
});

async function readFixtureJson(file) {
  return JSON.parse(await readFile(join(fixturesDir, file), "utf8"));
}

async function readExampleJson(file) {
  return JSON.parse(await readFile(join(examplesDir, file), "utf8"));
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
