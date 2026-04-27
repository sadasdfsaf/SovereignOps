import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  CANONICAL_LOCAL_EVENT_CATALOG_SCHEMA_VERSION,
  CANONICAL_LOCAL_EVENT_SCHEMA_VERSION,
  assertCanonicalLocalEvent,
  assertCanonicalLocalEventCatalog,
  assertCanonicalLocalEventObject,
  canonicalLocalEventCatalogSchema,
  canonicalLocalEventOperations,
  canonicalLocalEventSchema,
  canonicalLocalEventSchemaDefinitions,
  canonicalLocalEventSchemas,
  canonicalLocalEventValidators,
  canonicalLocalEventKinds,
  canonicalSharedSchemaKinds,
  getCanonicalLocalEventDigest,
  getCanonicalLocalEventSchema,
  getCanonicalPayloadDigest,
  isCanonicalLocalEventDigest,
  isCanonicalLocalEventId,
  isCanonicalLocalEventOperation,
  isCanonicalSharedRecordId,
  isCanonicalSharedSchemaKind,
  validateCanonicalLocalEvent,
  validateCanonicalLocalEventCatalog,
  validateCanonicalLocalEventObject,
} from "../src/eventCatalog.ts";

const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url));

test("exposes canonical local event schemas and helpers", () => {
  assert.equal(CANONICAL_LOCAL_EVENT_SCHEMA_VERSION, "canonical-local-event/v1");
  assert.equal(CANONICAL_LOCAL_EVENT_CATALOG_SCHEMA_VERSION, "canonical-local-event-catalog/v1");
  assert.deepEqual(canonicalLocalEventKinds, ["canonicalLocalEvent", "canonicalLocalEventCatalog"]);
  assert.deepEqual(canonicalLocalEventOperations, [
    "append",
    "update",
    "delete",
    "approval_requested",
    "approval_approved",
    "approval_rejected",
  ]);
  assert.deepEqual(canonicalSharedSchemaKinds, [
    "docs",
    "projects",
    "incidents",
    "comments",
    "attachments",
    "approvals",
  ]);
  assert.equal(canonicalLocalEventSchemaDefinitions.canonicalLocalEvent.schema, canonicalLocalEventSchema);
  assert.equal(canonicalLocalEventSchemaDefinitions.canonicalLocalEventCatalog.schema, canonicalLocalEventCatalogSchema);
  assert.equal(getCanonicalLocalEventSchema("canonicalLocalEvent"), canonicalLocalEventSchema);
  assert.equal(getCanonicalLocalEventSchema("canonicalLocalEventCatalog"), canonicalLocalEventCatalogSchema);
  assert.equal(canonicalLocalEventSchemas.canonicalLocalEvent, canonicalLocalEventSchema);
  assert.equal(canonicalLocalEventValidators.canonicalLocalEventCatalog, validateCanonicalLocalEventCatalog);
  assert.equal(
    canonicalLocalEventSchema.$id,
    "https://schemas.sovereignops.local/canonical-events/event.schema.json",
  );
  assert.equal(
    canonicalLocalEventCatalogSchema.$id,
    "https://schemas.sovereignops.local/canonical-events/event-catalog.schema.json",
  );
  assert.equal(canonicalLocalEventSchema.properties.schemaVersion.const, CANONICAL_LOCAL_EVENT_SCHEMA_VERSION);
  assert.equal(
    canonicalLocalEventCatalogSchema.properties.schemaVersion.const,
    CANONICAL_LOCAL_EVENT_CATALOG_SCHEMA_VERSION,
  );

  assert.equal(isCanonicalLocalEventId("evt_local_01"), true);
  assert.equal(isCanonicalLocalEventId("doc_local_01"), false);
  assert.equal(isCanonicalLocalEventDigest("0".repeat(64)), true);
  assert.equal(isCanonicalLocalEventDigest("ABC"), false);
  assert.equal(isCanonicalLocalEventOperation("approval_rejected"), true);
  assert.equal(isCanonicalLocalEventOperation("replace"), false);
  assert.equal(isCanonicalSharedSchemaKind("docs"), true);
  assert.equal(isCanonicalSharedSchemaKind("files"), false);
  assert.equal(isCanonicalSharedRecordId("att_local_preview"), true);
  assert.equal(isCanonicalSharedRecordId("evt_local_01"), false);
  assert.equal(getCanonicalPayloadDigest({ b: 2, a: 1 }), getCanonicalPayloadDigest({ a: 1, b: 2 }));
});

test("fixture catalog maps canonical event fixtures", async () => {
  const catalog = await readFixtureJson("canonical-events.catalog.json");

  assert.equal(catalog.version, 1);
  assert.deepEqual(catalog.fixtures.map((entry) => entry.fixture), [
    "canonical-events.valid.json",
    "canonical-events.invalid.json",
  ]);

  for (const entry of catalog.fixtures) {
    assert.equal(entry.kind, "canonicalLocalEventCatalog");
    const fixture = await readFixtureJson(entry.fixture);
    const result = validateCanonicalLocalEventCatalog(fixture);
    assert.equal(result.ok, entry.valid, `${entry.fixture} validity should match catalog`);
  }
});

test("valid canonical event fixture satisfies runtime validators and schema contracts", async () => {
  const fixture = await readFixtureJson("canonical-events.valid.json");
  const catalogResult = validateCanonicalLocalEventCatalog(fixture);
  const catalogSchemaIssues = validateWithJsonSchema(canonicalLocalEventCatalogSchema, fixture);

  assert.equal(catalogResult.ok, true, formatIssues(catalogResult.issues));
  assert.deepEqual(catalogResult.issues, []);
  assert.deepEqual(catalogSchemaIssues, []);
  assert.doesNotThrow(() => assertCanonicalLocalEventCatalog(fixture));
  assert.doesNotThrow(() => assertCanonicalLocalEventObject("canonicalLocalEventCatalog", fixture));
  assert.equal(validateCanonicalLocalEventObject("canonicalLocalEventCatalog", fixture).ok, true);
  assert.deepEqual(
    [...new Set(fixture.events.map((event) => event.operation))],
    ["append", "update", "delete", "approval_requested", "approval_approved"],
  );

  let previousDigest = null;
  for (const event of fixture.events) {
    const eventResult = validateCanonicalLocalEvent(event);
    const eventSchemaIssues = validateWithJsonSchema(canonicalLocalEventSchema, event);

    assert.equal(eventResult.ok, true, formatIssues(eventResult.issues));
    assert.deepEqual(eventSchemaIssues, []);
    assert.equal(event.payloadDigest, getCanonicalPayloadDigest(event.payload));
    assert.equal(event.previousDigest, previousDigest);
    assert.equal(validateCanonicalLocalEventObject("canonicalLocalEvent", event).ok, true);
    assert.doesNotThrow(() => assertCanonicalLocalEvent(event));
    assert.doesNotThrow(() => assertCanonicalLocalEventObject("canonicalLocalEvent", event));

    previousDigest = getCanonicalLocalEventDigest(event);
  }
});

test("successful catalog validation returns a cloned and deeply frozen value", async () => {
  const fixture = await readFixtureJson("canonical-events.valid.json");
  const result = validateCanonicalLocalEventCatalog(fixture);

  assert.equal(result.ok, true, formatIssues(result.issues));
  assert.notEqual(result.value, fixture);
  assert.notEqual(result.value.events, fixture.events);
  assert.notEqual(result.value.events[0].payload, fixture.events[0].payload);
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value.events), true);
  assert.equal(Object.isFrozen(result.value.events[0].payload), true);
  assert.equal(Object.isFrozen(result.value.events[0].redactionMetadata), true);

  fixture.events[0].id = "evt_mutated";
  assert.equal(result.value.events[0].id, "evt_local_01");
  assert.throws(() => {
    result.value.events[0].id = "evt_changed";
  }, TypeError);
});

test("invalid fixture reports useful runtime paths and schema issues", async () => {
  const fixture = await readFixtureJson("canonical-events.invalid.json");
  const runtimeResult = validateCanonicalLocalEventCatalog(fixture);
  const schemaIssues = validateWithJsonSchema(canonicalLocalEventCatalogSchema, fixture);
  const paths = issuePaths(runtimeResult.issues);

  assert.equal(runtimeResult.ok, false);
  assert.ok(paths.includes("schemaVersion"));
  assert.ok(paths.includes("workspaceId"));
  assert.ok(paths.includes("localOnly"));
  assert.ok(paths.includes("generatedAt"));
  assert.ok(paths.includes("events[0].unexpected"));
  assert.ok(paths.includes("events[0].schemaVersion"));
  assert.ok(paths.includes("events[0].id"));
  assert.ok(paths.includes("events[0].actorId"));
  assert.ok(paths.includes("events[0].sequence"));
  assert.ok(paths.includes("events[0].recordedAt"));
  assert.ok(paths.includes("events[0].operation"));
  assert.ok(paths.includes("events[0].payload.rawDetail"));
  assert.ok(paths.includes("events[0].payload.recordId"));
  assert.ok(paths.includes("events[0].payload.afterDigest"));
  assert.ok(paths.includes("events[0].payloadDigest"));
  assert.ok(paths.includes("events[0].previousDigest"));
  assert.ok(paths.includes("events[0].redactionMetadata.extra"));
  assert.ok(paths.includes("events[0].redactionMetadata.retainedMetadataKeys[1]"));
  assert.ok(paths.includes("events[1].payload.afterDigest"));
  assert.ok(paths.includes("events[1].payloadDigest"));
  assert.ok(paths.includes("events[1].previousDigest"));
  assert.ok(issuePaths(schemaIssues).includes("$.schemaVersion"));
  assert.ok(issuePaths(schemaIssues).includes("$.workspaceId"));
  assert.ok(issuePaths(schemaIssues).includes("$.events[0].payload.rawDetail"));
  assert.ok(issuePaths(schemaIssues).includes("$.events[0].payloadDigest"));
});

test("operation-specific validation rejects incompatible payload shapes", async () => {
  const fixture = await readFixtureJson("canonical-events.valid.json");

  const appendWithBeforeDigest = cloneJson(fixture.events[0]);
  appendWithBeforeDigest.payload.beforeDigest = "0".repeat(64);
  appendWithBeforeDigest.payloadDigest = getCanonicalPayloadDigest(appendWithBeforeDigest.payload);
  const appendResult = validateCanonicalLocalEvent(appendWithBeforeDigest);
  assert.equal(appendResult.ok, false);
  assert.ok(issuePaths(appendResult.issues).includes("payload.beforeDigest"));

  const updateWithEmptyFields = cloneJson(fixture.events[1]);
  updateWithEmptyFields.payload.fields = [];
  updateWithEmptyFields.payloadDigest = getCanonicalPayloadDigest(updateWithEmptyFields.payload);
  const updateResult = validateCanonicalLocalEvent(updateWithEmptyFields);
  assert.equal(updateResult.ok, false);
  assert.ok(issuePaths(updateResult.issues).includes("payload.fields"));

  const rejectedApprovalWithApprovedPayload = cloneJson(fixture.events[5]);
  rejectedApprovalWithApprovedPayload.operation = "approval_rejected";
  rejectedApprovalWithApprovedPayload.payloadDigest = getCanonicalPayloadDigest(
    rejectedApprovalWithApprovedPayload.payload,
  );
  const approvalResult = validateCanonicalLocalEvent(rejectedApprovalWithApprovedPayload);
  assert.equal(approvalResult.ok, false);
  assert.ok(issuePaths(approvalResult.issues).includes("payload.approvalStatus"));
  assert.ok(issuePaths(approvalResult.issues).includes("payload.decision"));
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
