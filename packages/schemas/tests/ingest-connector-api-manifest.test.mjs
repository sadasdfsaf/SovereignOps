import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  INGEST_CONNECTOR_API_MANIFEST_SCHEMA_VERSION,
  assertIngestConnectorApiManifest,
  assertIngestConnectorApiProfile,
  getIngestConnectorApiManifestSchema,
  ingestConnectorApiCapabilities,
  ingestConnectorApiManifestSchema,
  ingestConnectorApiManifestSchemas,
  ingestConnectorApiMediaTypes,
  ingestConnectorApiProfileSchema,
  isIngestConnectorApiCapability,
  isIngestConnectorApiMediaType,
  isIngestConnectorApiProfileId,
  validateIngestConnectorApiManifest,
  validateIngestConnectorApiProfile,
} from "../src/ingestConnectorApiManifest.ts";

const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url));

test("exposes camelCase connector API manifest schema metadata", async () => {
  assert.deepEqual(ingestConnectorApiCapabilities, [
    "ingest.normalize",
    "ingest.structured",
    "repository.scan",
    "search.query",
    "quarantine.preview",
  ]);
  assert.deepEqual(ingestConnectorApiMediaTypes, [
    "text/plain",
    "text/markdown",
    "text/csv",
    "application/json",
  ]);
  assert.equal(isIngestConnectorApiCapability("search.query"), true);
  assert.equal(isIngestConnectorApiCapability("network.fetch"), false);
  assert.equal(isIngestConnectorApiMediaType("application/json"), true);
  assert.equal(isIngestConnectorApiMediaType("application/octet-stream"), false);
  assert.equal(isIngestConnectorApiProfileId("local.workspace-index"), true);
  assert.equal(isIngestConnectorApiProfileId("token.connector"), false);
  assert.equal(getIngestConnectorApiManifestSchema("profile"), ingestConnectorApiProfileSchema);
  assert.equal(getIngestConnectorApiManifestSchema("manifest"), ingestConnectorApiManifestSchema);
  assert.equal(ingestConnectorApiManifestSchemas.manifest, ingestConnectorApiManifestSchema);

  const barrel = await import("../src/index.ts");
  assert.equal(barrel.ingestConnectorApiManifestSchema, ingestConnectorApiManifestSchema);
});

test("valid API fixture satisfies runtime validators and JSON schema", async () => {
  const fixture = await readFixtureJson("ingest-connector-api-manifest.valid.json");
  const generatedSchema = await readFixtureJson("ingest-connector-api-manifest.schema.json");
  const result = validateIngestConnectorApiManifest(fixture);

  assert.equal(fixture.schemaVersion, INGEST_CONNECTOR_API_MANIFEST_SCHEMA_VERSION);
  assert.equal(fixture.localOnly, true);
  assert.deepEqual(generatedSchema, ingestConnectorApiManifestSchema);
  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
  assert.doesNotThrow(() => assertIngestConnectorApiManifest(fixture));
  assert.deepEqual(validateWithJsonSchema(ingestConnectorApiManifestSchema, fixture), []);

  for (const connector of fixture.connectors) {
    assert.equal(validateIngestConnectorApiProfile(connector).ok, true, connector.id);
    assert.doesNotThrow(() => assertIngestConnectorApiProfile(connector));
    assert.deepEqual(validateWithJsonSchema(ingestConnectorApiProfileSchema, connector), []);
  }
});

test("route-compatible seeded profile remains valid without default-id coupling", async () => {
  const fixture = await readFixtureJson("ingest-connector-api-manifest.valid.json");
  const seeded = {
    schemaVersion: fixture.schemaVersion,
    localOnly: true,
    connectors: [
      {
        ...fixture.connectors[0],
        id: "local.zeta",
        label: "Zeta",
        description: "Zeta connector.",
        capabilities: ["search.query"],
        mediaTypes: ["text/plain"],
        preview: {
          dryRun: true,
          maxItems: 1,
          maxTextBytes: 1024,
        },
      },
    ],
  };

  assert.equal(validateIngestConnectorApiManifest(seeded).ok, true);
  assert.deepEqual(validateWithJsonSchema(ingestConnectorApiManifestSchema, seeded), []);
});

test("invalid API fixture rejects unsafe strings, remote access, auth, preview, and duplicates", async () => {
  const fixture = await readFixtureJson("ingest-connector-api-manifest.invalid.json");
  const result = validateIngestConnectorApiManifest(fixture);
  const schemaIssues = validateWithJsonSchema(ingestConnectorApiManifestSchema, fixture);
  const paths = issuePaths(result.issues);

  assert.equal(result.ok, false);
  assert.ok(paths.includes("schemaVersion"));
  assert.ok(paths.includes("localOnly"));
  assert.ok(paths.includes("connectors[0].description"));
  assert.ok(paths.includes("connectors[0].transport"));
  assert.ok(paths.includes("connectors[0].capabilities[1]"));
  assert.ok(paths.includes("connectors[0].capabilities[2]"));
  assert.ok(paths.includes("connectors[0].mediaTypes[1]"));
  assert.ok(paths.includes("connectors[0].mediaTypes[2]"));
  assert.ok(paths.includes("connectors[0].auth.mode"));
  assert.ok(paths.includes("connectors[0].auth.required"));
  assert.ok(paths.includes("connectors[0].preview.dryRun"));
  assert.ok(paths.includes("connectors[0].preview.maxItems"));
  assert.ok(paths.includes("connectors[0].preview.maxTextBytes"));
  assert.ok(paths.includes("connectors[0].safety.localOnly"));
  assert.ok(paths.includes("connectors[0].safety.networkAccess"));
  assert.ok(paths.includes("connectors[0].safety.durableWrites"));
  assert.ok(paths.includes("connectors[1].description"));
  assert.ok(paths.includes("connectors[1].id"));
  assert.ok(schemaIssues.length > 0);
});

test("snake_case cross-language manifest remains a distinct contract", async () => {
  const snakeCaseManifest = await readFixtureJson("ingest-connector-manifest.valid.json");
  const result = validateIngestConnectorApiManifest(snakeCaseManifest);
  const schemaIssues = validateWithJsonSchema(ingestConnectorApiManifestSchema, snakeCaseManifest);

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.path === "schema_version"));
  assert.ok(result.issues.some((issue) => issue.path === "schemaVersion"));
  assert.ok(schemaIssues.some((issue) => issue.path === "$.schema_version"));
});

async function readFixtureJson(file) {
  return JSON.parse(await readFile(join(fixturesDir, file), "utf8"));
}

function issuePaths(issues) {
  return issues.map((issue) => issue.path);
}

function validateWithJsonSchema(schema, value, path = "$", issues = []) {
  if (schema.type && !matchesSchemaType(schema.type, value)) {
    issues.push({ path, message: `expected ${schema.type}` });
    return issues;
  }

  if (schema.const !== undefined && value !== schema.const) {
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
