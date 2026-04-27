import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));
const openApiPath = path.join(workspaceRoot, "docs", "openapi.yaml");
const openApiText = await readFile(openApiPath, "utf8");
const openApiLines = openApiText.split(/\r?\n/);

const routePath = "/v1/workspace-session/snapshot-retention-cleanup/preview";
const operationId = "previewWorkspaceSessionSnapshotRetentionCleanup";
const requestSchema = "WorkspaceSessionSnapshotRetentionCleanupPreviewRequest";
const responseSchema = "WorkspaceSessionSnapshotRetentionCleanupPreviewResponse";
const cleanupInputSchema = "WorkspaceSessionSnapshotRetentionCleanupInputEntry";

const clientSurfaceSchemas = Object.freeze([
  "WorkspaceSessionSnapshotRetentionCleanupInputEntry",
  "WorkspaceSessionSnapshotRetentionCleanupPreviewRequest",
  "WorkspaceSessionSnapshotRetentionCleanupPreviewResponse",
  "WorkspaceSessionSnapshotRetentionCleanupThresholds",
  "WorkspaceSessionSnapshotRetentionCleanupSummary",
  "WorkspaceSessionSnapshotRetentionCleanupAction",
  "WorkspaceSessionSnapshotRetentionCleanupIssue",
  "ErrorResponse",
  "ValidationIssue",
]);

const forbiddenGeneratedFieldNames = Object.freeze(new Set([
  "absolutePath",
  "apiKey",
  "authorization",
  "bearerToken",
  "bodySnapshot",
  "filePath",
  "lockToken",
  "password",
  "rawBody",
  "rawLockToken",
  "rawPath",
  "rawRequestBody",
  "rawSecret",
  "rawToken",
  "requestBody",
  "secret",
  "sessionToken",
  "storagePath",
  "token",
]));

const forbiddenGeneratedMutationFields = Object.freeze(new Set([
  "applied",
  "deletedSnapshotIds",
  "deletes",
  "durableWriteCount",
  "mutated",
  "removedSnapshotIds",
  "unlinkedPaths",
  "writes",
]));

describe("workspace session snapshot retention cleanup OpenAPI SDK client threats", () => {
  it("derives a body-only JSON POST client without path or token parameters", () => {
    const contract = cleanupClientContract();

    assert.equal(contract.method, "post");
    assert.equal(contract.path, routePath);
    assert.equal(contract.operationId, operationId);
    assert.deepEqual(contract.pathParams, []);
    assert.deepEqual(contract.queryParams, []);
    assert.deepEqual(contract.requestContentTypes, ["application/json"]);
    assert.deepEqual(contract.successContentTypes, ["application/json"]);
    assert.equal(contract.requestSchema, requestSchema);
    assert.equal(contract.responseSchema, responseSchema);
  });

  it("keeps generated request schemas on the cleanup-safe summary shape", () => {
    const requestBlock = schemaBlock(requestSchema);

    for (const field of ["entries", "files", "records"]) {
      const fieldBlock = requireNestedBlock(requestBlock, field);
      assert.ok(
        hasSchemaRef(fieldBlock, cleanupInputSchema),
        `${field} must use ${cleanupInputSchema}`,
      );
      assert.equal(
        hasSchemaRef(fieldBlock, "WorkspaceSessionSnapshotRecord"),
        false,
        `${field} must not expose full snapshot records to generated clients`,
      );
    }

    assert.deepEqual(
      schemaRefs(requestBlock).sort(),
      [cleanupInputSchema],
    );
  });

  it("omits raw body, raw path, raw token, and mutation fields from generated schemas", () => {
    for (const schemaName of clientSurfaceSchemas) {
      const block = schemaBlock(schemaName);
      const fields = schemaPropertyNames(block);
      const forbiddenSecurity = fields.filter((field) =>
        forbiddenGeneratedFieldNames.has(field)
      );
      const forbiddenMutation = fields.filter((field) =>
        forbiddenGeneratedMutationFields.has(field)
      );

      assert.deepEqual(
        forbiddenSecurity,
        [],
        `${schemaName} exposes forbidden raw security fields`,
      );
      assert.deepEqual(
        forbiddenMutation,
        [],
        `${schemaName} exposes forbidden cleanup mutation fields`,
      );
      assert.ok(
        stripped(block).has("additionalProperties: false"),
        `${schemaName} must reject unknown generated-client fields`,
      );
    }
  });

  it("pins localOnly, dryRun, and durableWrites to preview-only constants", () => {
    const block = schemaBlock(responseSchema);

    for (const [field, expectedConst] of [
      ["localOnly", "const: true"],
      ["dryRun", "const: true"],
      ["durableWrites", "const: false"],
    ]) {
      const fieldBlock = requireNestedBlock(block, field);
      const lines = stripped(fieldBlock);

      assert.ok(lines.has("type: boolean"), `${field} must be boolean`);
      assert.ok(lines.has(expectedConst), `${field} must be ${expectedConst}`);
      assert.ok(requiredFields(block).includes(field), `${field} must be required`);
    }
  });

  it("documents JSON-only success and error behavior for generated clients", () => {
    const routeBlock = requireBlock(openApiLines, routePath, 2);
    const methodBlock = requireBlock(routeBlock, "post", 4);
    const responsesBlock = requireBlock(methodBlock, "responses", 6);
    const successBlock = requireBlock(responsesBlock, "\"200\"", 8);
    const badRequestBlock = requireBlock(responsesBlock, "\"400\"", 8);
    const defaultBlock = requireBlock(responsesBlock, "default", 8);
    const errorResponseBlock = requireBlock(openApiLines, "Error", 4);
    const errorSchemaBlock = schemaBlock("ErrorResponse");

    assert.deepEqual(mediaTypes(successBlock), ["application/json"]);
    assert.deepEqual(mediaTypes(errorResponseBlock), ["application/json"]);
    assert.ok(hasSchemaRef(successBlock, responseSchema));
    assert.ok(stripped(badRequestBlock).has("$ref: \"#/components/responses/Error\""));
    assert.ok(stripped(defaultBlock).has("$ref: \"#/components/responses/Error\""));
    assert.ok(hasSchemaRef(errorResponseBlock, "ErrorResponse"));
    assert.deepEqual(
      schemaPropertyNames(errorSchemaBlock).filter((field) =>
        forbiddenGeneratedFieldNames.has(field)
      ),
      [],
    );
  });
});

function cleanupClientContract() {
  const routeBlock = requireBlock(openApiLines, routePath, 2);
  const methodBlock = requireBlock(routeBlock, "post", 4);
  const requestBlock = requireBlock(methodBlock, "requestBody", 6);
  const responsesBlock = requireBlock(methodBlock, "responses", 6);
  const successBlock = requireBlock(responsesBlock, "\"200\"", 8);

  assert.equal(stripped(methodBlock).has("parameters:"), false);

  return {
    method: "post",
    path: routePath,
    operationId: readScalar(methodBlock, "operationId"),
    pathParams: Array.from(routePath.matchAll(/\{([^}]+)\}/g), (match) => match[1]),
    queryParams: [],
    requestContentTypes: mediaTypes(requestBlock),
    successContentTypes: mediaTypes(successBlock),
    requestSchema: schemaRefs(requestBlock)[0],
    responseSchema: schemaRefs(successBlock)[0],
  };
}

function schemaBlock(schemaName) {
  return requireBlock(openApiLines, schemaName, 4);
}

function requireBlock(lines, key, indent) {
  const block = findBlock(lines, key, indent);
  assert.ok(block, `missing block ${key} at indent ${indent}`);
  return block;
}

function findBlock(lines, key, indent) {
  const prefix = `${" ".repeat(indent)}${key}:`;
  const index = lines.findIndex((line) => line.startsWith(prefix));
  return index === -1 ? undefined : collectBlock(lines, index, indent);
}

function collectBlock(lines, index, indent) {
  const block = [];
  for (const child of lines.slice(index + 1)) {
    if (child.trim() === "" || child.trimStart().startsWith("#")) {
      block.push(child);
      continue;
    }
    const childIndent = child.length - child.trimStart().length;
    if (childIndent <= indent) {
      break;
    }
    block.push(child);
  }
  return block;
}

function requireNestedBlock(lines, key) {
  const index = lines.findIndex((line) => line.trim() === `${key}:`);
  assert.notEqual(index, -1, `missing nested block ${key}`);

  const indent = lines[index].length - lines[index].trimStart().length;
  return collectBlock(lines, index, indent);
}

function readScalar(lines, key) {
  const prefix = `${key}: `;
  const line = lines.find((candidate) => candidate.trim().startsWith(prefix));
  assert.ok(line, `missing scalar ${key}`);
  return line.trim().slice(prefix.length);
}

function schemaRefs(lines) {
  const refs = [];
  for (const line of lines) {
    const match = line.match(/\$ref: "#\/components\/schemas\/([^"]+)"/);
    if (match && !refs.includes(match[1])) {
      refs.push(match[1]);
    }
  }
  return refs;
}

function hasSchemaRef(lines, schemaName) {
  return schemaRefs(lines).includes(schemaName);
}

function mediaTypes(lines) {
  const contentIndex = lines.findIndex((line) => line.trim() === "content:");
  if (contentIndex === -1) {
    return [];
  }

  const contentIndent = lines[contentIndex].length - lines[contentIndex].trimStart().length;
  const mediaIndent = contentIndent + 2;
  const types = [];
  for (const line of lines.slice(contentIndex + 1)) {
    if (line.trim() === "") {
      continue;
    }
    const indent = line.length - line.trimStart().length;
    if (indent <= contentIndent) {
      break;
    }
    if (indent === mediaIndent && line.trim().endsWith(":")) {
      types.push(line.trim().slice(0, -1));
    }
  }
  return types;
}

function schemaPropertyNames(lines) {
  const propertiesIndex = lines.findIndex((line) => line.trim() === "properties:");
  if (propertiesIndex === -1) {
    return [];
  }

  const propertiesIndent =
    lines[propertiesIndex].length - lines[propertiesIndex].trimStart().length;
  const propertyIndent = propertiesIndent + 2;
  const names = [];
  for (const line of lines.slice(propertiesIndex + 1)) {
    if (line.trim() === "") {
      continue;
    }
    const indent = line.length - line.trimStart().length;
    if (indent <= propertiesIndent) {
      break;
    }
    const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*):$/);
    if (indent === propertyIndent && match) {
      names.push(match[1]);
    }
  }
  return names;
}

function requiredFields(lines) {
  const requiredIndex = lines.findIndex((line) => line.trim() === "required:");
  if (requiredIndex === -1) {
    return [];
  }

  const requiredIndent = lines[requiredIndex].length - lines[requiredIndex].trimStart().length;
  const fields = [];
  for (const line of lines.slice(requiredIndex + 1)) {
    if (line.trim() === "") {
      continue;
    }
    const indent = line.length - line.trimStart().length;
    if (indent <= requiredIndent) {
      break;
    }
    const match = line.trim().match(/^- ([A-Za-z_][A-Za-z0-9_]*)$/);
    if (match) {
      fields.push(match[1]);
    }
  }
  return fields;
}

function stripped(lines) {
  return new Set(lines.map((line) => line.trim()));
}
