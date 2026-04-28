import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  INGEST_CONNECTOR_MCP_API_REQUESTS_SCHEMA_VERSION,
  INGEST_CONNECTOR_MCP_PREVIEW_SCHEMA_VERSION,
  INGEST_CONNECTOR_MCP_RESOURCES_SCHEMA_VERSION,
  INGEST_CONNECTOR_MCP_RESOURCE_SCHEMA_VERSION,
  assertIngestConnectorMcpApiObject,
  assertIngestConnectorMcpApiRequestBundle,
  assertIngestConnectorMcpPreview,
  assertIngestConnectorMcpResource,
  assertIngestConnectorMcpResources,
  getIngestConnectorMcpApiSchema,
  getIngestConnectorMcpResourceUriConnectorId,
  ingestConnectorMcpApiKinds,
  ingestConnectorMcpApiOperations,
  ingestConnectorMcpApiRequestsSchema,
  ingestConnectorMcpApiResponseSchemaVersions,
  ingestConnectorMcpApiSchemaDefinitions,
  ingestConnectorMcpApiSchemas,
  ingestConnectorMcpApiValidators,
  ingestConnectorMcpPreviewSchema,
  ingestConnectorMcpResourceSchema,
  ingestConnectorMcpResourcesSchema,
  isIngestConnectorMcpConnectorId,
  isIngestConnectorMcpResourceId,
  isIngestConnectorMcpResourceUri,
  isIngestConnectorMcpSafePublicString,
  validateIngestConnectorMcpApiObject,
  validateIngestConnectorMcpApiRequestBundle,
  validateIngestConnectorMcpPreview,
  validateIngestConnectorMcpResource,
  validateIngestConnectorMcpResources,
} from "../src/ingestConnectorMcpApi.ts";

const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url));

const fixtureCases = [
  {
    kind: "resources",
    fixture: "ingest-connector-mcp-resources.valid.json",
    schemaFixture: "ingest-connector-mcp-resources.schema.json",
    schema: ingestConnectorMcpResourcesSchema,
    validator: validateIngestConnectorMcpResources,
  },
  {
    kind: "resource",
    fixture: "ingest-connector-mcp-resource.valid.json",
    schemaFixture: "ingest-connector-mcp-resource.schema.json",
    schema: ingestConnectorMcpResourceSchema,
    validator: validateIngestConnectorMcpResource,
  },
  {
    kind: "preview",
    fixture: "ingest-connector-mcp-preview.valid.json",
    schemaFixture: "ingest-connector-mcp-preview.schema.json",
    schema: ingestConnectorMcpPreviewSchema,
    validator: validateIngestConnectorMcpPreview,
  },
  {
    kind: "apiRequests",
    fixture: "ingest-connector-mcp-api-requests.valid.json",
    schemaFixture: "ingest-connector-mcp-api-requests.schema.json",
    schema: ingestConnectorMcpApiRequestsSchema,
    validator: validateIngestConnectorMcpApiRequestBundle,
  },
];

test("exposes ingest connector MCP API schema metadata", async () => {
  assert.equal(INGEST_CONNECTOR_MCP_RESOURCES_SCHEMA_VERSION, "ingest-connector-mcp-resources/v1");
  assert.equal(INGEST_CONNECTOR_MCP_RESOURCE_SCHEMA_VERSION, "ingest-connector-mcp-resource/v1");
  assert.equal(INGEST_CONNECTOR_MCP_PREVIEW_SCHEMA_VERSION, "ingest-connector-mcp-preview/v1");
  assert.equal(
    INGEST_CONNECTOR_MCP_API_REQUESTS_SCHEMA_VERSION,
    "ingest-connector-mcp-api-requests.v1",
  );
  assert.deepEqual(ingestConnectorMcpApiKinds, [
    "resources",
    "resource",
    "preview",
    "apiRequests",
  ]);
  assert.deepEqual(ingestConnectorMcpApiOperations, [
    "resources/list",
    "resources/read",
    "preview",
  ]);
  assert.deepEqual(ingestConnectorMcpApiResponseSchemaVersions, [
    INGEST_CONNECTOR_MCP_RESOURCES_SCHEMA_VERSION,
    INGEST_CONNECTOR_MCP_RESOURCE_SCHEMA_VERSION,
    INGEST_CONNECTOR_MCP_PREVIEW_SCHEMA_VERSION,
  ]);

  for (const { kind, schema } of fixtureCases) {
    assert.equal(ingestConnectorMcpApiSchemaDefinitions[kind].kind, kind);
    assert.equal(ingestConnectorMcpApiSchemaDefinitions[kind].schema, schema);
    assert.equal(ingestConnectorMcpApiSchemas[kind], schema);
    assert.equal(getIngestConnectorMcpApiSchema(kind), schema);
  }

  assert.equal(isIngestConnectorMcpConnectorId("local.files"), true);
  assert.equal(isIngestConnectorMcpConnectorId("token.connector"), false);
  assert.equal(isIngestConnectorMcpResourceId("notes"), true);
  assert.equal(isIngestConnectorMcpResourceId("9notes"), false);
  assert.equal(isIngestConnectorMcpResourceUri("ingest://local.files/resources/notes"), true);
  assert.equal(isIngestConnectorMcpResourceUri("file:///Users/operator/notes.md"), false);
  assert.equal(
    getIngestConnectorMcpResourceUriConnectorId("ingest://local.files/resources/notes"),
    "local.files",
  );
  assert.equal(isIngestConnectorMcpSafePublicString("Sanitized preview"), true);
  assert.equal(isIngestConnectorMcpSafePublicString("Bearer sk-example-local-test-value"), false);

  const barrel = await import("../src/index.ts");
  assert.equal(barrel.ingestConnectorMcpApiRequestsSchema, ingestConnectorMcpApiRequestsSchema);
});

test("schema export fixtures match source schema exports", async () => {
  for (const { schemaFixture, schema } of fixtureCases) {
    assert.deepEqual(await readFixtureJson(schemaFixture), JSON.parse(JSON.stringify(schema)));
  }
});

test("valid MCP fixtures satisfy runtime validators and JSON schemas", async () => {
  for (const { kind, fixture, schema, validator } of fixtureCases) {
    const value = await readFixtureJson(fixture);
    const runtimeResult = validator(value);
    const genericResult = validateIngestConnectorMcpApiObject(kind, value);
    const schemaIssues = validateWithJsonSchema(schema, value);

    assert.equal(runtimeResult.ok, true, `${fixture}: ${formatIssues(runtimeResult.issues)}`);
    assert.equal(genericResult.ok, true, `${fixture}: ${formatIssues(genericResult.issues)}`);
    assert.equal(ingestConnectorMcpApiValidators[kind](value).ok, true);
    assert.deepEqual(schemaIssues, [], `${fixture}: ${formatIssues(schemaIssues)}`);
    assert.doesNotThrow(() => assertIngestConnectorMcpApiObject(kind, value));
  }

  const resources = await readFixtureJson("ingest-connector-mcp-resources.valid.json");
  const resource = await readFixtureJson("ingest-connector-mcp-resource.valid.json");
  const preview = await readFixtureJson("ingest-connector-mcp-preview.valid.json");
  const apiRequests = await readFixtureJson("ingest-connector-mcp-api-requests.valid.json");

  assert.doesNotThrow(() => assertIngestConnectorMcpResources(resources));
  assert.doesNotThrow(() => assertIngestConnectorMcpResource(resource));
  assert.doesNotThrow(() => assertIngestConnectorMcpPreview(preview));
  assert.doesNotThrow(() => assertIngestConnectorMcpApiRequestBundle(apiRequests));
});

test("successful bundle validation returns a cloned and deeply frozen value", async () => {
  const fixture = await readFixtureJson("ingest-connector-mcp-api-requests.valid.json");
  const result = validateIngestConnectorMcpApiRequestBundle(fixture);

  assert.equal(result.ok, true, formatIssues(result.issues));
  assert.notEqual(result.value, fixture);
  assert.notEqual(result.value.requests, fixture.requests);
  assert.notEqual(result.value.preview, fixture.preview);
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value.requests), true);
  assert.equal(Object.isFrozen(result.value.preview.resources), true);

  fixture.requests[0].id = "mutated";
  assert.equal(result.value.requests[0].id, "list.resources");
  assert.throws(() => {
    result.value.requests[0].id = "changed";
  }, TypeError);
});

test("invalid MCP bundle reports useful runtime paths and JSON schema issues", async () => {
  const fixture = await readFixtureJson("ingest-connector-mcp-api-requests.invalid.json");
  const runtimeResult = validateIngestConnectorMcpApiRequestBundle(fixture);
  const schemaIssues = validateWithJsonSchema(ingestConnectorMcpApiRequestsSchema, fixture);
  const paths = issuePaths(runtimeResult.issues);

  assert.equal(runtimeResult.ok, false);
  assert.ok(paths.includes("schemaVersion"));
  assert.ok(paths.includes("bundleId"));
  assert.ok(paths.includes("generatedAt"));
  assert.ok(paths.includes("localOnly"));
  assert.ok(paths.includes("apiToken"));
  assert.ok(paths.includes("requests[0].resourceUri"));
  assert.ok(paths.includes("requests[0].responseSchemaVersion"));
  assert.ok(paths.includes("requests[0].fixture"));
  assert.ok(paths.includes("requests[1].id"));
  assert.ok(paths.includes("requests[1].connectorId"));
  assert.ok(paths.includes("requests[1].resourceUri"));
  assert.ok(paths.includes("requests[1].responseSchemaVersion"));
  assert.ok(paths.includes("requests[1].fixture"));
  assert.ok(paths.includes("resources.connectorId"));
  assert.ok(paths.includes("resources.resources[0].description"));
  assert.ok(paths.includes("resources.resources[1].id"));
  assert.ok(paths.includes("resources.resources[1].uri"));
  assert.ok(paths.includes("resources.resources[1].textBytes"));
  assert.ok(paths.includes("resourceFixtures[0].resource.textBytes"));
  assert.ok(paths.includes("resourceFixtures[1].connectorId"));
  assert.ok(paths.includes("resourceFixtures[1].localOnly"));
  assert.ok(paths.includes("resourceFixtures[1].resource.description"));
  assert.ok(paths.includes("resourceFixtures[1].resource.uri"));
  assert.ok(paths.includes("preview.connectorId"));
  assert.ok(paths.includes("preview.dryRun"));
  assert.ok(paths.includes("preview.request.maxItems"));
  assert.ok(paths.includes("preview.request.maxTextBytes"));
  assert.ok(paths.includes("preview.resources[0].connectorId"));
  assert.ok(paths.includes("preview.summary.resourceCount"));
  assert.ok(paths.includes("preview.summary.totalTextBytes"));
  assert.ok(schemaIssues.length > 0);
  assert.ok(issuePaths(schemaIssues).includes("$.schemaVersion"));
  assert.ok(issuePaths(schemaIssues).includes("$.localOnly"));
  assert.ok(issuePaths(schemaIssues).includes("$.apiToken"));
  assert.ok(issuePaths(schemaIssues).includes("$.requests[0].fixture"));
});

test("bundle validator catches URI connector mismatches", async () => {
  const fixture = await readFixtureJson("ingest-connector-mcp-api-requests.valid.json");
  fixture.preview.resources[0].resource.uri = "ingest://other.files/resources/notes";

  const result = validateIngestConnectorMcpApiRequestBundle(fixture);
  const paths = issuePaths(result.issues);

  assert.equal(result.ok, false);
  assert.ok(paths.includes("preview.resources[0].resource.uri"));
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
    if (schema.uniqueItems) {
      const serialized = value.map((item) => JSON.stringify(item));
      if (new Set(serialized).size !== serialized.length) {
        issues.push({ path, message: "expected unique items" });
      }
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
