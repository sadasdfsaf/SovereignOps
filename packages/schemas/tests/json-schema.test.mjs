import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { validateSovereignRecord } from "../src/index.ts";
import { jsonSchemaCatalog, jsonSchemas, schemaKinds } from "../src/jsonSchema.ts";

const packageDir = fileURLToPath(new URL("../", import.meta.url));
const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url));

test("export script check passes", () => {
  const result = spawnSync(process.execPath, ["scripts/export-json-schema.mjs", "--check"], {
    cwd: packageDir,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("all fixture JSON files parse", async () => {
  const files = (await readdir(fixturesDir)).filter((file) => file.endsWith(".json"));
  assert.ok(files.includes("fixture-catalog.json"));

  for (const file of files) {
    JSON.parse(await readFile(join(fixturesDir, file), "utf8"));
  }
});

test("schema export files match source exports", async () => {
  const catalog = await readFixtureJson("schema-catalog.json");
  assert.deepEqual(catalog, jsonSchemaCatalog);

  for (const kind of schemaKinds) {
    const schema = await readFixtureJson(`${kind}.schema.json`);
    assert.deepEqual(schema, jsonSchemas[kind]);
  }
});

test("fixture catalog maps valid records to schemas", async () => {
  const catalog = await readFixtureJson("fixture-catalog.json");

  assert.equal(catalog.version, 1);
  assert.equal(catalog.fixtures.length, schemaKinds.length);

  for (const entry of catalog.fixtures) {
    assert.ok(schemaKinds.includes(entry.kind), `${entry.kind} should be a known kind`);
    assert.equal(entry.schema, `${entry.kind}.schema.json`);
    assert.equal(entry.fixture, `${entry.kind}.valid.json`);
    assert.equal(entry.valid, true);
    await readFixtureJson(entry.schema);
    await readFixtureJson(entry.fixture);
  }
});

test("valid fixtures satisfy runtime validators and JSON Schemas", async () => {
  const catalog = await readFixtureJson("fixture-catalog.json");

  for (const entry of catalog.fixtures) {
    const record = await readFixtureJson(entry.fixture);
    const runtimeResult = validateSovereignRecord(entry.kind, record);
    const schemaIssues = validateWithJsonSchema(jsonSchemas[entry.kind], record);

    assert.equal(runtimeResult.ok, true, `${entry.fixture} should pass runtime validation`);
    assert.deepEqual(schemaIssues, [], `${entry.fixture} should pass JSON Schema validation`);
  }
});

test("JSON Schemas reject invalid risk and status values", async () => {
  const catalog = await readFixtureJson("fixture-catalog.json");

  for (const entry of catalog.fixtures) {
    const record = await readFixtureJson(entry.fixture);

    const riskIssues = validateWithJsonSchema(jsonSchemas[entry.kind], {
      ...record,
      risk: "critical",
    });
    assert.ok(issuePaths(riskIssues).includes("$.risk"), `${entry.kind} should reject bad risk`);

    const statusIssues = validateWithJsonSchema(jsonSchemas[entry.kind], {
      ...record,
      status: "queued",
    });
    assert.ok(issuePaths(statusIssues).includes("$.status"), `${entry.kind} should reject bad status`);
  }
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
