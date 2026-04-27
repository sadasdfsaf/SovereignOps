import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_INVENTORY_SCHEMA_VERSION,
  assertWorkspaceSessionSnapshotRetentionCleanupInventoryObject,
  assertWorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest,
  getWorkspaceSessionSnapshotRetentionCleanupInventorySchema,
  isWorkspaceSessionSnapshotRetentionCleanupInventoryKind,
  isWorkspaceSessionSnapshotRetentionCleanupInventorySafePath,
  validateWorkspaceSessionSnapshotRetentionCleanupInventoryObject,
  validateWorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest,
  workspaceSessionSnapshotRetentionCleanupInventoryKinds,
  workspaceSessionSnapshotRetentionCleanupInventoryPreviewRequestSchema,
  workspaceSessionSnapshotRetentionCleanupInventorySchemaDefinitions,
  workspaceSessionSnapshotRetentionCleanupInventorySchemas,
  workspaceSessionSnapshotRetentionCleanupInventorySectionKeys,
  workspaceSessionSnapshotRetentionCleanupInventorySourceKeys,
  workspaceSessionSnapshotRetentionCleanupInventoryValidators,
} from "../src/workspaceSessionSnapshotRetentionCleanupInventory.ts";

const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url));
const requestKind = "workspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest";
const validFixture =
  "workspace-session-snapshot-retention-cleanup-inventory-request.valid.json";
const invalidFixture =
  "workspace-session-snapshot-retention-cleanup-inventory-request.invalid.json";
const schemaFixture =
  "workspace-session-snapshot-retention-cleanup-inventory-request.schema.json";

test("exposes workspace session snapshot retention cleanup inventory schema metadata", async () => {
  const api = await import("../src/index.ts");

  assert.equal(
    WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_INVENTORY_SCHEMA_VERSION,
    "workspace-session-snapshot-retention-cleanup-inventory/v1",
  );
  assert.deepEqual(workspaceSessionSnapshotRetentionCleanupInventoryKinds, [
    requestKind,
  ]);
  assert.deepEqual(workspaceSessionSnapshotRetentionCleanupInventorySectionKeys, [
    "entries",
    "files",
    "records",
  ]);
  assert.deepEqual(workspaceSessionSnapshotRetentionCleanupInventorySourceKeys, [
    "inventory",
    "entries",
    "files",
    "records",
  ]);
  assert.equal(isWorkspaceSessionSnapshotRetentionCleanupInventoryKind(requestKind), true);
  assert.equal(isWorkspaceSessionSnapshotRetentionCleanupInventoryKind("inventoryRequest"), false);
  assert.equal(
    workspaceSessionSnapshotRetentionCleanupInventorySchemaDefinitions[requestKind].kind,
    requestKind,
  );
  assert.equal(
    workspaceSessionSnapshotRetentionCleanupInventorySchemaDefinitions[requestKind].schema,
    workspaceSessionSnapshotRetentionCleanupInventoryPreviewRequestSchema,
  );
  assert.equal(
    workspaceSessionSnapshotRetentionCleanupInventorySchemas[requestKind],
    workspaceSessionSnapshotRetentionCleanupInventoryPreviewRequestSchema,
  );
  assert.equal(
    getWorkspaceSessionSnapshotRetentionCleanupInventorySchema(requestKind),
    workspaceSessionSnapshotRetentionCleanupInventoryPreviewRequestSchema,
  );
  assert.equal(
    workspaceSessionSnapshotRetentionCleanupInventoryPreviewRequestSchema.$id,
    "https://schemas.sovereignops.local/workspace-session/snapshot-retention-cleanup-inventory-request.schema.json",
  );
  assert.equal(
    api.workspaceSessionSnapshotRetentionCleanupInventoryPreviewRequestSchema,
    workspaceSessionSnapshotRetentionCleanupInventoryPreviewRequestSchema,
  );
});

test("schema export fixture matches source schema export", async () => {
  assert.deepEqual(
    await readFixtureJson(schemaFixture),
    JSON.parse(JSON.stringify(workspaceSessionSnapshotRetentionCleanupInventoryPreviewRequestSchema)),
  );
});

test("valid fixture satisfies runtime validators and JSON schema contract", async () => {
  const value = await readFixtureJson(validFixture);
  const runtimeResult =
    validateWorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest(value);
  const genericResult = validateWorkspaceSessionSnapshotRetentionCleanupInventoryObject(
    requestKind,
    value,
  );
  const schemaIssues = validateWithJsonSchema(
    workspaceSessionSnapshotRetentionCleanupInventoryPreviewRequestSchema,
    value,
  );

  assert.equal(runtimeResult.ok, true, formatIssues(runtimeResult.issues));
  assert.equal(genericResult.ok, true, formatIssues(genericResult.issues));
  assert.equal(
    workspaceSessionSnapshotRetentionCleanupInventoryValidators[requestKind](value).ok,
    true,
  );
  assert.deepEqual(schemaIssues, [], formatIssues(schemaIssues));
  assert.doesNotThrow(() =>
    assertWorkspaceSessionSnapshotRetentionCleanupInventoryObject(requestKind, value)
  );
  assert.doesNotThrow(() =>
    assertWorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest(value)
  );
  assert.equal(
    isWorkspaceSessionSnapshotRetentionCleanupInventorySafePath("snapshots/team-alpha.json"),
    true,
  );
  assert.equal(
    isWorkspaceSessionSnapshotRetentionCleanupInventorySafePath("[redacted:path:abc123]"),
    true,
  );
  assert.equal(
    isWorkspaceSessionSnapshotRetentionCleanupInventorySafePath("../snapshots/raw.json"),
    false,
  );
});

test("accepts route-compatible source and policy shapes", async () => {
  const fixture = await readFixtureJson(validFixture);
  const item = cloneJson(fixture.inventory.records[0]);
  item.metadata.redactedLock = "[redacted:lockToken:abc123]";

  const cases = [
    {
      inventory: [cloneJson(item)],
      maxCount: 1,
      maxAgeMs: 86400000,
      now: "2026-04-28T04:00:00.000Z",
    },
    {
      inventory: {
        entries: [cloneJson(item)],
      },
      policy: {},
    },
    {
      entries: [cloneJson(item)],
      policy: {
        maxCount: 1,
      },
    },
    {
      files: [cloneJson(item)],
      maxCount: 1,
    },
    {
      records: [cloneJson(item)],
      policy: {
        maxAgeMs: 86400000,
        now: "2026-04-28T04:00:00.000Z",
      },
    },
  ];

  for (const request of cases) {
    const result =
      validateWorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest(request);
    const schemaIssues = validateWithJsonSchema(
      workspaceSessionSnapshotRetentionCleanupInventoryPreviewRequestSchema,
      request,
    );

    assert.equal(result.ok, true, formatIssues(result.issues));
    assert.deepEqual(schemaIssues, [], formatIssues(schemaIssues));
  }
});

test("successful validation returns a cloned and deeply frozen value", async () => {
  const fixture = await readFixtureJson(validFixture);
  const result =
    validateWorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest(fixture);

  assert.equal(result.ok, true, formatIssues(result.issues));
  assert.notEqual(result.value, fixture);
  assert.notEqual(result.value.inventory, fixture.inventory);
  assert.notEqual(result.value.inventory.records, fixture.inventory.records);
  assert.notEqual(result.value.inventory.records[0], fixture.inventory.records[0]);
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value.inventory), true);
  assert.equal(Object.isFrozen(result.value.inventory.records), true);
  assert.equal(Object.isFrozen(result.value.inventory.records[0].metadata), true);

  fixture.policy.maxCount = 99;
  assert.equal(result.value.policy.maxCount, 1);
  assert.throws(() => {
    result.value.policy.maxCount = 2;
  }, TypeError);
});

test("invalid fixture reports useful runtime paths and schema issues", async () => {
  const invalid = await readFixtureJson(invalidFixture);
  const result =
    validateWorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest(invalid);
  const schemaIssues = validateWithJsonSchema(
    workspaceSessionSnapshotRetentionCleanupInventoryPreviewRequestSchema,
    invalid,
  );
  const paths = issuePaths(result.issues);

  assert.equal(result.ok, false);
  assert.ok(paths.includes("$"));
  assert.ok(paths.includes("unexpected"));
  assert.ok(paths.includes("inventory"));
  assert.ok(paths.includes("inventory.records[0].relativePath"));
  assert.ok(paths.includes("inventory.records[0].createdAt"));
  assert.ok(paths.includes("inventory.records[0].auditSafe"));
  assert.ok(paths.includes("inventory.records[0].redacted"));
  assert.ok(paths.includes("inventory.records[0].lockToken"));
  assert.ok(paths.includes("inventory.records[0].metadata.apiToken"));
  assert.ok(paths.includes("inventory.records[0].metadata.nested"));
  assert.ok(paths.includes("policy.maxCount"));
  assert.ok(paths.includes("policy.extra"));
  assert.ok(paths.includes("maxAgeMs"));
  assert.ok(paths.includes("now"));
  assert.ok(schemaIssues.length > 0);
});

test("JSON-incompatible request values are rejected before shape validation", () => {
  const request = {
    inventory: [
      {
        snapshotId: "snap-json-check",
        createdAt: Number.NaN,
      },
    ],
  };
  const result =
    validateWorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest(request);

  assert.equal(result.ok, false);
  assert.deepEqual(issuePaths(result.issues), ["inventory[0].createdAt"]);
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
