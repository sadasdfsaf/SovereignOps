import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  PLUGIN_REVIEW_ARTIFACT_PREVIEW_SCHEMA_VERSION,
  assertPluginReviewArtifactObject,
  assertPluginReviewArtifactPreview,
  externalCallMethods,
  getPluginReviewArtifactPreviewSchema,
  getPluginReviewArtifactSchema,
  isPluginReviewArtifactFingerprint,
  isPluginReviewArtifactSourceFilePath,
  pluginReviewArtifactKinds,
  pluginReviewArtifactPreviewSchema,
  pluginReviewArtifactPreviewSchemaDefinition,
  pluginReviewArtifactSchemas,
  pluginReviewArtifactValidators,
  previewRenderModes,
  redactionKinds,
  sourceFileRoles,
  validatePluginReviewArtifactObject,
  validatePluginReviewArtifactPreview,
} from "../src/pluginReviewArtifact.ts";

const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url));

test("exposes plugin review artifact preview schema metadata", () => {
  assert.equal(PLUGIN_REVIEW_ARTIFACT_PREVIEW_SCHEMA_VERSION, "plugin-review-artifact-preview.v1");
  assert.deepEqual(pluginReviewArtifactKinds, ["pluginReviewArtifactPreview"]);
  assert.equal(pluginReviewArtifactPreviewSchemaDefinition.kind, "pluginReviewArtifactPreview");
  assert.equal(pluginReviewArtifactPreviewSchemaDefinition.schemaVersion, PLUGIN_REVIEW_ARTIFACT_PREVIEW_SCHEMA_VERSION);
  assert.equal(pluginReviewArtifactPreviewSchemaDefinition.schema, pluginReviewArtifactPreviewSchema);
  assert.equal(
    pluginReviewArtifactPreviewSchema.$id,
    "https://schemas.sovereignops.local/plugin-review/artifact-preview.schema.json",
  );
  assert.equal(pluginReviewArtifactPreviewSchema.properties.schemaVersion.const, PLUGIN_REVIEW_ARTIFACT_PREVIEW_SCHEMA_VERSION);
  assert.equal(getPluginReviewArtifactPreviewSchema(), pluginReviewArtifactPreviewSchema);
  assert.equal(getPluginReviewArtifactSchema("pluginReviewArtifactPreview"), pluginReviewArtifactSchemas.pluginReviewArtifactPreview);
  assert.deepEqual(sourceFileRoles.slice(0, 3), ["manifest", "entrypoint", "source"]);
  assert.deepEqual(redactionKinds, ["credential", "personalData", "internalPath", "proprietaryValue"]);
  assert.deepEqual(externalCallMethods, ["GET", "POST", "PUT", "PATCH", "DELETE"]);
  assert.deepEqual(previewRenderModes, ["markdown", "json", "text"]);
});

test("valid fixture satisfies runtime validator and schema contract", async () => {
  const fixture = await readFixtureJson("plugin-review-artifact-preview.valid.json");
  const runtimeResult = validatePluginReviewArtifactPreview(fixture);
  const genericResult = validatePluginReviewArtifactObject("pluginReviewArtifactPreview", fixture);
  const schemaIssues = validateWithJsonSchema(pluginReviewArtifactPreviewSchema, fixture);

  assert.equal(runtimeResult.ok, true);
  assert.equal(genericResult.ok, true);
  assert.deepEqual(runtimeResult.issues, []);
  assert.deepEqual(schemaIssues, []);
  assert.equal(pluginReviewArtifactValidators.pluginReviewArtifactPreview(fixture).ok, true);
  assert.doesNotThrow(() => assertPluginReviewArtifactPreview(fixture));
  assert.doesNotThrow(() => assertPluginReviewArtifactObject("pluginReviewArtifactPreview", fixture));
});

test("successful validation returns a cloned and deeply frozen value", async () => {
  const fixture = await readFixtureJson("plugin-review-artifact-preview.valid.json");
  const result = validatePluginReviewArtifactPreview(fixture);

  assert.equal(result.ok, true);
  assert.notEqual(result.value, fixture);
  assert.notEqual(result.value.sourceFiles, fixture.sourceFiles);
  assert.notEqual(result.value.preview.sections[0], fixture.preview.sections[0]);
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value.sourceFiles), true);
  assert.equal(Object.isFrozen(result.value.preview.sections[0]), true);

  fixture.sourceFiles[0].id = "changed";
  assert.equal(result.value.sourceFiles[0].id, "manifest");
  assert.throws(() => {
    result.value.preview.sections[0].id = "changed";
  }, TypeError);
});

test("invalid fixture reports useful runtime paths and schema issues", async () => {
  const fixture = await readFixtureJson("plugin-review-artifact-preview.invalid.json");
  const runtimeResult = validatePluginReviewArtifactPreview(fixture);
  const schemaIssues = validateWithJsonSchema(pluginReviewArtifactPreviewSchema, fixture);
  const paths = issuePaths(runtimeResult.issues);

  assert.equal(runtimeResult.ok, false);
  assert.ok(paths.includes("schemaVersion"));
  assert.ok(paths.includes("generatedAt"));
  assert.ok(paths.includes("workspaceId"));
  assert.ok(paths.includes("reviewId"));
  assert.ok(paths.includes("pluginId"));
  assert.ok(paths.includes("artifactId"));
  assert.ok(paths.includes("localOnly"));
  assert.ok(paths.includes("proposalOnly"));
  assert.ok(paths.includes("fingerprint"));
  assert.ok(paths.includes("unexpected"));
  assert.ok(paths.includes("sourceFiles[0].path"));
  assert.ok(paths.includes("sourceFiles[0].mediaType"));
  assert.ok(paths.includes("sourceFiles[0].role"));
  assert.ok(paths.includes("sourceFiles[0].sha256"));
  assert.ok(paths.includes("sourceFiles[0].byteSize"));
  assert.ok(paths.includes("sourceFiles[0].includedInPreview"));
  assert.ok(paths.includes("sourceFiles[0].extra"));
  assert.ok(paths.includes("sourceFiles[1].id"));
  assert.ok(paths.includes("redactions[0].sourceFileId"));
  assert.ok(paths.includes("redactions[0].kind"));
  assert.ok(paths.includes("redactions[0].range.endLine"));
  assert.ok(paths.includes("redactions[0].range.endColumn"));
  assert.ok(paths.includes("redactions[0].replacement"));
  assert.ok(paths.includes("redactions[0].originalFingerprint"));
  assert.ok(paths.includes("externalCalls[0].method"));
  assert.ok(paths.includes("externalCalls[0].url"));
  assert.ok(paths.includes("externalCalls[0].purpose"));
  assert.ok(paths.includes("externalCalls[0].requestedBySourceFileId"));
  assert.ok(paths.includes("externalCalls[0].proposalOnly"));
  assert.ok(paths.includes("externalCalls[0].executed"));
  assert.ok(paths.includes("preview.artifactType"));
  assert.ok(paths.includes("preview.title"));
  assert.ok(paths.includes("preview.summary"));
  assert.ok(paths.includes("preview.renderMode"));
  assert.ok(paths.includes("preview.extra"));
  assert.ok(paths.includes("preview.sections[0].sourceFileIds[0]"));
  assert.ok(paths.includes("preview.sections[0].redactionIds[0]"));
  assert.ok(paths.includes("preview.sections[0].contentFingerprint"));
  assert.ok(paths.includes("preview.sections[1].id"));
  assert.ok(schemaIssues.length > 0);
  assert.ok(issuePaths(schemaIssues).includes("$.schemaVersion"));
  assert.ok(issuePaths(schemaIssues).includes("$.localOnly"));
  assert.ok(issuePaths(schemaIssues).includes("$.externalCalls[0].executed"));
});

test("helpers accept only local preview fingerprints and source paths", () => {
  assert.equal(isPluginReviewArtifactFingerprint("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), true);
  assert.equal(isPluginReviewArtifactFingerprint("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"), false);
  assert.equal(isPluginReviewArtifactSourceFilePath("plugins/offline-notes/plugin.json"), true);
  assert.equal(isPluginReviewArtifactSourceFilePath("plugins/offline-notes/../plugin.json"), false);
  assert.equal(isPluginReviewArtifactSourceFilePath("E:/SovereignOps/plugins/offline-notes/plugin.json"), false);
  assert.equal(isPluginReviewArtifactSourceFilePath("plugins/offline-notes/"), false);
});

test("assertion helper includes the contract kind in failures", async () => {
  const fixture = await readFixtureJson("plugin-review-artifact-preview.invalid.json");

  assert.throws(
    () => assertPluginReviewArtifactPreview(fixture),
    /pluginReviewArtifactPreview validation failed/,
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
