import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  INGEST_EVIDENCE_SCHEMA_VERSION,
  assertIngestEvidence,
  citationEvidenceKinds,
  clientSessionTraceKinds,
  httpMethods,
  ingestEvidenceSchema,
  ingestEvidenceSchemaDefinition,
  isChecksum,
  isLocalFixturePath,
  isLocalSourceUri,
  localSourceUriToFixturePath,
  quarantineActions,
  repositoryStates,
  validateIngestEvidence,
} from "../src/ingestEvidence.ts";

const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

test("exposes ingest audit evidence schema metadata", () => {
  assert.equal(INGEST_EVIDENCE_SCHEMA_VERSION, "ingest-search-audit-evidence.v1");
  assert.equal(ingestEvidenceSchemaDefinition.kind, "ingestAuditEvidence");
  assert.equal(ingestEvidenceSchemaDefinition.schemaVersion, INGEST_EVIDENCE_SCHEMA_VERSION);
  assert.equal(ingestEvidenceSchemaDefinition.schema, ingestEvidenceSchema);
  assert.equal(ingestEvidenceSchema.$id, "https://schemas.sovereignops.local/ingest-search/audit-evidence.schema.json");
  assert.equal(ingestEvidenceSchema.properties.schemaVersion.const, INGEST_EVIDENCE_SCHEMA_VERSION);
  assert.deepEqual(repositoryStates.slice(0, 3), ["indexed", "partly_quarantined", "quarantined"]);
  assert.deepEqual(citationEvidenceKinds, ["indexDocument", "quarantineItem"]);
  assert.deepEqual(quarantineActions, ["release", "reject"]);
  assert.deepEqual(httpMethods, ["GET", "POST", "PUT", "PATCH", "DELETE"]);
  assert.deepEqual(clientSessionTraceKinds, ["apiRoute", "cliCommand"]);
});

test("valid fixture satisfies runtime validator and schema contract", async () => {
  const fixture = await readFixtureJson("ingest-evidence.valid.json");
  const result = validateIngestEvidence(fixture);
  const schemaIssues = validateWithJsonSchema(ingestEvidenceSchema, fixture);

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(schemaIssues, []);
  assert.doesNotThrow(() => assertIngestEvidence(fixture));
});

test("real ingest-search audit evidence example validates", async () => {
  const auditEvidence = JSON.parse(
    await readFile(join(repoRoot, "examples/ingest-search/audit-evidence.json"), "utf8"),
  );

  const result = validateIngestEvidence(auditEvidence);

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});

test("successful validation returns a cloned and deeply frozen value", async () => {
  const fixture = await readFixtureJson("ingest-evidence.valid.json");
  const result = validateIngestEvidence(fixture);

  assert.equal(result.ok, true);
  assert.notEqual(result.value, fixture);
  assert.notEqual(result.value.evidenceFiles, fixture.evidenceFiles);
  assert.notEqual(result.value.sourceSnapshots[0], fixture.sourceSnapshots[0]);
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value.evidenceFiles), true);
  assert.equal(Object.isFrozen(result.value.evidenceFiles[0]), true);

  fixture.evidenceFiles[0].id = "mutated";
  assert.equal(result.value.evidenceFiles[0].id, "notes");
  assert.throws(() => {
    result.value.evidenceFiles[0].id = "changed";
  }, TypeError);
});

test("invalid fixture reports useful runtime paths and schema issues", async () => {
  const fixture = await readFixtureJson("ingest-evidence.invalid.json");
  const result = validateIngestEvidence(fixture);
  const schemaIssues = validateWithJsonSchema(ingestEvidenceSchema, fixture);
  const paths = issuePaths(result.issues);

  assert.equal(result.ok, false);
  assert.ok(paths.includes("schemaVersion"));
  assert.ok(paths.includes("workspaceId"));
  assert.ok(paths.includes("sessionId"));
  assert.ok(paths.includes("localOnly"));
  assert.ok(paths.includes("unexpected"));
  assert.ok(paths.includes("evidenceSummary.sourceCount"));
  assert.ok(paths.includes("evidenceFiles[0].fixturePath"));
  assert.ok(paths.includes("evidenceFiles[0].sha256"));
  assert.ok(paths.includes("evidenceFiles[1].id"));
  assert.ok(paths.includes("sourceSnapshots[0].sourceUri"));
  assert.ok(paths.includes("sourceSnapshots[0].mediaType"));
  assert.ok(paths.includes("sourceSnapshots[0].repositoryState"));
  assert.ok(paths.includes("citationEvidence[0].documentId"));
  assert.ok(paths.includes("citationEvidence[0].quarantineItemId"));
  assert.ok(paths.includes("citationEvidence[0].range.end_line"));
  assert.ok(paths.includes("quarantineDecisions[0].toState"));
  assert.ok(paths.includes("apiRequestTrace[0].checksums"));
  assert.ok(paths.includes("apiRequestTrace[0].fixtureFileId"));
  assert.ok(paths.includes("clientSessionTrace[0].relatedRequestIds[0]"));
  assert.ok(schemaIssues.length > 0);
  assert.ok(issuePaths(schemaIssues).includes("$.schemaVersion"));
  assert.ok(issuePaths(schemaIssues).includes("$.localOnly"));
  assert.ok(issuePaths(schemaIssues).includes("$.evidenceFiles[0].fixturePath"));
});

test("local path and checksum helpers accept only local audit evidence forms", () => {
  assert.equal(isChecksum("c6a91ee2a9789110ebb39cbd27c7f48c26087c5c13aff8bda69da669ada3cda7"), true);
  assert.equal(isChecksum("C6A91EE2A9789110EBB39CBD27C7F48C26087C5C13AFF8BDA69DA669ADA3CDA7"), false);
  assert.equal(isLocalFixturePath("examples/ingest-search/notes.md"), true);
  assert.equal(isLocalFixturePath("examples/ingest-search/../secret.txt"), false);
  assert.equal(isLocalFixturePath("E:/SovereignOps/examples/ingest-search/notes.md"), false);
  assert.equal(isLocalSourceUri("fixture://ingest-search/records.csv"), true);
  assert.equal(isLocalSourceUri("https://example.test/records.csv"), false);
  assert.equal(
    localSourceUriToFixturePath("fixture://ingest-search/records.csv"),
    "examples/ingest-search/records.csv",
  );
});

async function readFixtureJson(file) {
  return JSON.parse(await readFile(join(fixturesDir, file), "utf8"));
}

function issuePaths(issues) {
  return issues.map((issue) => issue.path);
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
