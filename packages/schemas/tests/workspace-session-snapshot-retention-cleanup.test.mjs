import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_SCHEMA_VERSION,
  WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_SCHEMA_VERSION,
  assertWorkspaceSessionSnapshotRetentionCleanupObject,
  assertWorkspaceSessionSnapshotRetentionCleanupRequest,
  assertWorkspaceSessionSnapshotRetentionCleanupResponse,
  getWorkspaceSessionSnapshotRetentionCleanupSchema,
  isWorkspaceSessionSnapshotRetentionCleanupFingerprint,
  isWorkspaceSessionSnapshotRetentionCleanupKind,
  isWorkspaceSessionSnapshotRetentionCleanupSafePath,
  isWorkspaceSessionSnapshotRetentionCleanupSnapshotId,
  validateWorkspaceSessionSnapshotRetentionCleanupObject,
  validateWorkspaceSessionSnapshotRetentionCleanupRequest,
  validateWorkspaceSessionSnapshotRetentionCleanupResponse,
  workspaceSessionSnapshotRetentionCleanupActions,
  workspaceSessionSnapshotRetentionCleanupIssueKinds,
  workspaceSessionSnapshotRetentionCleanupKinds,
  workspaceSessionSnapshotRetentionCleanupReasons,
  workspaceSessionSnapshotRetentionCleanupRequestSchema,
  workspaceSessionSnapshotRetentionCleanupResponseSchema,
  workspaceSessionSnapshotRetentionCleanupSchemaDefinitions,
  workspaceSessionSnapshotRetentionCleanupSchemas,
  workspaceSessionSnapshotRetentionCleanupSourceKeys,
  workspaceSessionSnapshotRetentionCleanupSourceKinds,
  workspaceSessionSnapshotRetentionCleanupValidators,
} from "../src/workspaceSessionSnapshotRetentionCleanup.ts";

const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url));

const fixtureCases = [
  {
    kind: "workspaceSessionSnapshotRetentionCleanupRequest",
    fixture: "workspace-session-snapshot-retention-cleanup-request.valid.json",
    schemaFixture: "workspace-session-snapshot-retention-cleanup-request.schema.json",
    schema: workspaceSessionSnapshotRetentionCleanupRequestSchema,
    validator: validateWorkspaceSessionSnapshotRetentionCleanupRequest,
  },
  {
    kind: "workspaceSessionSnapshotRetentionCleanupResponse",
    fixture: "workspace-session-snapshot-retention-cleanup-response.valid.json",
    schemaFixture: "workspace-session-snapshot-retention-cleanup-response.schema.json",
    schema: workspaceSessionSnapshotRetentionCleanupResponseSchema,
    validator: validateWorkspaceSessionSnapshotRetentionCleanupResponse,
  },
];

test("exposes workspace session snapshot retention cleanup schema metadata", () => {
  assert.equal(
    WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_SCHEMA_VERSION,
    "workspace-session-snapshot-retention-cleanup/v1",
  );
  assert.equal(
    LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_SCHEMA_VERSION,
    "local-workspace-session-snapshot-retention/v1",
  );
  assert.deepEqual(workspaceSessionSnapshotRetentionCleanupKinds, [
    "workspaceSessionSnapshotRetentionCleanupRequest",
    "workspaceSessionSnapshotRetentionCleanupResponse",
  ]);
  assert.deepEqual(workspaceSessionSnapshotRetentionCleanupSourceKeys, [
    "entries",
    "files",
    "records",
  ]);
  assert.deepEqual(workspaceSessionSnapshotRetentionCleanupSourceKinds, [
    "file-metadata",
    "snapshot-record",
    "snapshot-record-summary",
    "unknown",
  ]);
  assert.deepEqual(workspaceSessionSnapshotRetentionCleanupActions, ["delete", "keep", "review"]);
  assert.ok(workspaceSessionSnapshotRetentionCleanupReasons.includes("requires-review"));
  assert.ok(workspaceSessionSnapshotRetentionCleanupIssueKinds.includes("unsafe-absolute-path"));
  assert.equal(isWorkspaceSessionSnapshotRetentionCleanupKind(fixtureCases[0].kind), true);
  assert.equal(isWorkspaceSessionSnapshotRetentionCleanupKind("snapshotCleanup"), false);

  for (const { kind, schema } of fixtureCases) {
    assert.equal(workspaceSessionSnapshotRetentionCleanupSchemaDefinitions[kind].kind, kind);
    assert.equal(workspaceSessionSnapshotRetentionCleanupSchemaDefinitions[kind].schema, schema);
    assert.equal(workspaceSessionSnapshotRetentionCleanupSchemas[kind], schema);
    assert.equal(getWorkspaceSessionSnapshotRetentionCleanupSchema(kind), schema);
  }

  assert.equal(
    workspaceSessionSnapshotRetentionCleanupRequestSchema.$id,
    "https://schemas.sovereignops.local/workspace-session/snapshot-retention-cleanup-request.schema.json",
  );
  assert.equal(
    workspaceSessionSnapshotRetentionCleanupResponseSchema.properties.schemaVersion.const,
    LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_SCHEMA_VERSION,
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
    const genericResult = validateWorkspaceSessionSnapshotRetentionCleanupObject(kind, value);
    const schemaIssues = validateWithJsonSchema(schema, value);

    assert.equal(runtimeResult.ok, true, `${fixture}: ${formatIssues(runtimeResult.issues)}`);
    assert.equal(genericResult.ok, true, `${fixture}: ${formatIssues(genericResult.issues)}`);
    assert.equal(workspaceSessionSnapshotRetentionCleanupValidators[kind](value).ok, true);
    assert.deepEqual(schemaIssues, [], `${fixture}: ${formatIssues(schemaIssues)}`);
    assert.doesNotThrow(() => assertWorkspaceSessionSnapshotRetentionCleanupObject(kind, value));
  }

  const request = await readFixtureJson("workspace-session-snapshot-retention-cleanup-request.valid.json");
  const response = await readFixtureJson("workspace-session-snapshot-retention-cleanup-response.valid.json");

  assert.doesNotThrow(() => assertWorkspaceSessionSnapshotRetentionCleanupRequest(request));
  assert.doesNotThrow(() => assertWorkspaceSessionSnapshotRetentionCleanupResponse(response));
  assert.equal(isWorkspaceSessionSnapshotRetentionCleanupSnapshotId("wssnap_cleanup_latest"), true);
  assert.equal(isWorkspaceSessionSnapshotRetentionCleanupFingerprint(`sha256:${"a".repeat(64)}`), true);
  assert.equal(isWorkspaceSessionSnapshotRetentionCleanupSafePath("snapshots/wssnap-cleanup-latest.json"), true);
  assert.equal(isWorkspaceSessionSnapshotRetentionCleanupSafePath("C:/temp/snapshot.json"), false);
});

test("successful response validation returns a cloned and deeply frozen value", async () => {
  const fixture = await readFixtureJson("workspace-session-snapshot-retention-cleanup-response.valid.json");
  const result = validateWorkspaceSessionSnapshotRetentionCleanupResponse(fixture);

  assert.equal(result.ok, true, formatIssues(result.issues));
  assert.notEqual(result.value, fixture);
  assert.notEqual(result.value.actions, fixture.actions);
  assert.notEqual(result.value.actions[0].summary, fixture.actions[0].summary);
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value.actions), true);
  assert.equal(Object.isFrozen(result.value.actions[0].summary), true);

  fixture.actions[0].summary.snapshotId = "wssnap_changed";
  assert.equal(result.value.actions[0].summary.snapshotId, "wssnap_cleanup_latest");
  assert.throws(() => {
    result.value.actions[0].summary.snapshotId = "wssnap_mutated";
  }, TypeError);
});

test("invalid fixtures report useful runtime paths and schema issues", async () => {
  const invalidRequest = await readFixtureJson("workspace-session-snapshot-retention-cleanup-request.invalid.json");
  const invalidResponse = await readFixtureJson("workspace-session-snapshot-retention-cleanup-response.invalid.json");
  const requestResult = validateWorkspaceSessionSnapshotRetentionCleanupRequest(invalidRequest);
  const responseResult = validateWorkspaceSessionSnapshotRetentionCleanupResponse(invalidResponse);
  const requestSchemaIssues = validateWithJsonSchema(
    workspaceSessionSnapshotRetentionCleanupRequestSchema,
    invalidRequest,
  );
  const responseSchemaIssues = validateWithJsonSchema(
    workspaceSessionSnapshotRetentionCleanupResponseSchema,
    invalidResponse,
  );
  const requestPaths = issuePaths(requestResult.issues);
  const responsePaths = issuePaths(responseResult.issues);

  assert.equal(requestResult.ok, false);
  assert.ok(requestPaths.includes("$"));
  assert.ok(requestPaths.includes("unexpected"));
  assert.ok(requestPaths.includes("entries[0].path"));
  assert.ok(requestPaths.includes("entries[0].createdAt"));
  assert.ok(requestPaths.includes("entries[0].metadata.apiToken"));
  assert.ok(requestPaths.includes("entries[0].metadata.nested"));
  assert.ok(requestPaths.includes("maxCount"));
  assert.ok(requestPaths.includes("maxAgeMs"));
  assert.ok(requestPaths.includes("now"));
  assert.ok(requestSchemaIssues.length > 0);

  assert.equal(responseResult.ok, false);
  assert.ok(responsePaths.includes("schemaVersion"));
  assert.ok(responsePaths.includes("localOnly"));
  assert.ok(responsePaths.includes("dryRun"));
  assert.ok(responsePaths.includes("durableWrites"));
  assert.ok(responsePaths.includes("entryCount"));
  assert.ok(responsePaths.includes("keepCount"));
  assert.ok(responsePaths.includes("actions[0].rank"));
  assert.ok(responsePaths.includes("actions[0].issues"));
  assert.ok(responsePaths.includes("actions[0].summary.auditSafe"));
  assert.ok(responsePaths.includes("actions[0].summary.redacted"));
  assert.ok(responsePaths.includes("actions[0].summary.fileRef"));
  assert.ok(responsePaths.includes("actions[0].issues[0].path"));
  assert.ok(responsePaths.includes("keepActions[0].action"));
  assert.ok(responseSchemaIssues.length > 0);
});

test("response counts and grouped action arrays must stay aligned", async () => {
  const fixture = await readFixtureJson("workspace-session-snapshot-retention-cleanup-response.valid.json");
  const mismatched = cloneJson(fixture);
  mismatched.keepCount = 2;
  mismatched.reviewActions = [];
  mismatched.keepActions = [cloneJson(fixture.deleteActions[0])];

  const result = validateWorkspaceSessionSnapshotRetentionCleanupResponse(mismatched);
  const paths = issuePaths(result.issues);

  assert.equal(result.ok, false);
  assert.ok(paths.includes("keepCount"));
  assert.ok(paths.includes("reviewCount"));
  assert.ok(paths.includes("keepActions[0].action"));
  assert.ok(paths.includes("actions"));
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
  if (schema.oneOf) {
    const matches = schema.oneOf.filter((candidate) => {
      const branchIssues = validateWithJsonSchema(candidate, value, path, []);
      return branchIssues.length === 0;
    });
    if (matches.length !== 1) {
      issues.push({ path, message: "expected exactly one matching schema" });
    }
    return issues;
  }

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
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      issues.push({ path, message: `expected at most ${schema.maxItems} items` });
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
