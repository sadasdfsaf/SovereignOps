import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  INGEST_CONNECTOR_MANIFEST_SCHEMA_VERSION,
  assertIngestConnectorManifest,
  getIngestConnectorManifestSchema,
  ingestConnectorIds,
  ingestConnectorManifestSchema,
  ingestConnectorManifestSchemas,
  ingestConnectorProfileSchema,
  isIngestConnectorId,
  validateIngestConnectorManifest,
  validateIngestConnectorProfile,
} from "../src/ingestConnectorManifest.ts";

const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url));

test("exposes connector manifest schema metadata", () => {
  assert.deepEqual(ingestConnectorIds, ["markdown", "json", "csv", "log", "repository"]);
  assert.equal(isIngestConnectorId("markdown"), true);
  assert.equal(isIngestConnectorId("remote"), false);
  assert.equal(getIngestConnectorManifestSchema("profile"), ingestConnectorProfileSchema);
  assert.equal(getIngestConnectorManifestSchema("manifest"), ingestConnectorManifestSchema);
  assert.equal(ingestConnectorManifestSchemas.manifest, ingestConnectorManifestSchema);
});

test("valid fixture satisfies runtime validators and JSON schema", async () => {
  const fixture = await readFixtureJson("ingest-connector-manifest.valid.json");
  const result = validateIngestConnectorManifest(fixture);

  assert.equal(fixture.schema_version, INGEST_CONNECTOR_MANIFEST_SCHEMA_VERSION);
  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
  assert.doesNotThrow(() => assertIngestConnectorManifest(fixture));
  assert.deepEqual(validateWithJsonSchema(ingestConnectorManifestSchema, fixture), []);

  for (const connector of fixture.connectors) {
    assert.equal(validateIngestConnectorProfile(connector).ok, true, connector.id);
    assert.deepEqual(validateWithJsonSchema(ingestConnectorProfileSchema, connector), []);
  }
});

test("invalid fixture rejects unsafe strings, remote access, duplicates, and missing connectors", async () => {
  const fixture = await readFixtureJson("ingest-connector-manifest.invalid.json");
  const result = validateIngestConnectorManifest(fixture);
  const schemaIssues = validateWithJsonSchema(ingestConnectorManifestSchema, fixture);

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.path === "schema_version"));
  assert.ok(result.issues.some((issue) => issue.path === "generated_by"));
  assert.ok(result.issues.some((issue) => issue.path === "connectors[0].description"));
  assert.ok(result.issues.some((issue) => issue.path === "connectors[0].network_access"));
  assert.ok(result.issues.some((issue) => issue.path === "connectors"));
  assert.ok(schemaIssues.length > 0);
});

test("connector ids must be unique", async () => {
  const fixture = await readFixtureJson("ingest-connector-manifest.valid.json");
  const duplicate = cloneJson(fixture);
  duplicate.connectors[1] = cloneJson(duplicate.connectors[0]);

  const result = validateIngestConnectorManifest(duplicate);

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.path === "connectors[1].id"));
});

async function readFixtureJson(file) {
  return JSON.parse(await readFile(join(fixturesDir, file), "utf8"));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
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
    if (schema.pattern && !new RegExp(schema.pattern, "i").test(value)) {
      issues.push({ path, message: `expected to match ${schema.pattern}` });
    }
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
