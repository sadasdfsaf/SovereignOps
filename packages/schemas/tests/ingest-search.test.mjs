import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  assertIngestSearchObject,
  getIngestSearchSchema,
  ingestSearchKinds,
  ingestSearchSchemaDefinitions,
  ingestSearchSchemas,
  ingestSearchValidators,
  isIngestSearchKind,
  validateIngestSearchObject,
  validateQuarantineDecision,
  validateSearchResult,
} from "../src/ingestSearch.ts";

const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url));

test("exposes ingest search schema metadata", () => {
  assert.deepEqual(ingestSearchKinds, [
    "repositorySourceSnapshot",
    "logSourceSnapshot",
    "normalizedDocument",
    "searchQuery",
    "searchResult",
    "quarantineRecord",
    "quarantineDecision",
  ]);
  assert.equal(isIngestSearchKind("searchQuery"), true);
  assert.equal(isIngestSearchKind("search-query"), false);
  assert.equal(ingestSearchSchemaDefinitions.length, ingestSearchKinds.length);

  for (const kind of ingestSearchKinds) {
    assert.equal(getIngestSearchSchema(kind), ingestSearchSchemas[kind]);
  }
});

test("valid fixture records satisfy runtime validators and schema contracts", async () => {
  const fixture = await readFixtureJson("ingest-search.valid.json");

  for (const kind of ingestSearchKinds) {
    const record = fixture[kind];
    const runtimeResult = validateIngestSearchObject(kind, record);
    const schemaIssues = validateWithJsonSchema(ingestSearchSchemas[kind], record);

    assert.equal(runtimeResult.ok, true, `${kind} should pass runtime validation`);
    assert.deepEqual(runtimeResult.issues, []);
    assert.equal(ingestSearchValidators[kind](record).ok, true, `${kind} named validator should pass`);
    assert.doesNotThrow(() => assertIngestSearchObject(kind, record));
    assert.deepEqual(schemaIssues, [], `${kind} should pass schema validation`);
  }
});

test("invalid fixture records fail runtime validators and schema contracts", async () => {
  const fixture = await readFixtureJson("ingest-search.invalid.json");

  for (const kind of ingestSearchKinds) {
    const runtimeResult = validateIngestSearchObject(kind, fixture[kind]);
    const schemaIssues = validateWithJsonSchema(ingestSearchSchemas[kind], fixture[kind]);

    assert.equal(runtimeResult.ok, false, `${kind} should fail runtime validation`);
    assert.ok(runtimeResult.issues.length > 0, `${kind} should report runtime issues`);
    assert.ok(schemaIssues.length > 0, `${kind} should report schema issues`);
  }
});

test("nested search document errors keep useful paths", async () => {
  const fixture = await readFixtureJson("ingest-search.valid.json");
  const record = cloneJson(fixture.searchResult);
  record.document.citation.range.end_line = 0;

  const result = validateSearchResult(record);

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.path === "document.citation.end_line"));
});

test("quarantine decisions reject action and state mismatches", async () => {
  const fixture = await readFixtureJson("ingest-search.valid.json");
  const decision = {
    ...fixture.quarantineDecision,
    action: "release",
    to_state: "rejected",
  };

  const result = validateQuarantineDecision(decision);

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.path === "to_state"));
});

async function readFixtureJson(file) {
  return JSON.parse(await readFile(join(fixturesDir, file), "utf8"));
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
