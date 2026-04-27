import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));
const docsPath = path.join(
  workspaceRoot,
  "docs",
  "workspace-session-snapshot-retention-cleanup.md",
);
const openApiPath = path.join(workspaceRoot, "docs", "openapi.yaml");
const releaseCheckPath = path.join(workspaceRoot, "scripts", "release_check.py");

const docsText = await readFile(docsPath, "utf8");
const openApiText = await readFile(openApiPath, "utf8");
const releaseCheckText = await readFile(releaseCheckPath, "utf8");
const openApiLines = openApiText.split(/\r?\n/);

const routePath = "/v1/workspace-session/snapshot-retention-cleanup/inventory/preview";
const operationId = "previewWorkspaceSessionSnapshotRetentionCleanupInventory";
const requestSchema = "WorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest";
const responseSchema = "WorkspaceSessionSnapshotRetentionCleanupPreviewResponse";
const itemSchema = "WorkspaceSessionSnapshotRetentionCleanupInventoryInputItem";
const policySchema = "WorkspaceSessionSnapshotRetentionCleanupInventoryPolicy";
const cleanupIssueSchema = "WorkspaceSessionSnapshotRetentionCleanupIssue";

const inventorySurfaceSchemas = Object.freeze([
  requestSchema,
  responseSchema,
  itemSchema,
  policySchema,
  "ErrorResponse",
  "ValidationIssue",
]);

const forbiddenRawRetentionFields = Object.freeze(new Set([
  "absolutePath",
  "apiKey",
  "authorization",
  "bearerToken",
  "bodySnapshot",
  "deletedSnapshotIds",
  "deletes",
  "filePath",
  "lockToken",
  "mutated",
  "password",
  "rawBody",
  "rawLockToken",
  "rawPath",
  "rawRequestBody",
  "rawSecret",
  "rawToken",
  "removedSnapshotIds",
  "requestBody",
  "secret",
  "sessionToken",
  "storagePath",
  "token",
  "unlinkedPaths",
  "writes",
]));

describe("workspace session snapshot retention cleanup inventory threats", () => {
  it("documents the inventory preview as local-only dry-run and release-gated", () => {
    for (const expected of [
      "The retention cleanup inventory preview is the Round 45 handoff",
      routePath,
      "examples/workspace-session/snapshot-retention-cleanup-inventory.json",
      "apps/api/src/workspaceSessionSnapshotRetentionCleanupInventoryRoutes.ts",
      "packages/cli/src/workspaceSessionSnapshotRetentionCleanupInventory.ts",
      "apps/web/src/workspaceSessionSnapshotRetentionCleanupInventoryState.ts",
      "tests/security/workspace_session_snapshot_retention_cleanup_inventory_threats.test.mjs",
    ]) {
      assert.ok(docsText.includes(expected), `missing inventory docs text: ${expected}`);
    }

    for (const expected of [
      "`localOnly: true`, `dryRun: true`, and `durableWrites: false`",
      "must not perform durable writes, deletes",
      "must not retain raw paths, secrets, tokens",
      "without echoing the raw",
    ]) {
      assert.ok(docsText.includes(expected), `missing dry-run safety text: ${expected}`);
    }

    assert.ok(
      releaseCheckText.includes(
        "tests/security/workspace_session_snapshot_retention_cleanup_inventory_threats.test.mjs",
      ),
      "release_check must track the inventory security test",
    );
  });

  it("exposes a body-only JSON OpenAPI route with Error response refs", () => {
    const route = inventoryRouteContract();

    assert.equal(route.method, "post");
    assert.equal(route.path, routePath);
    assert.equal(route.operationId, operationId);
    assert.deepEqual(route.pathParams, []);
    assert.deepEqual(route.queryParams, []);
    assert.deepEqual(route.requestContentTypes, ["application/json"]);
    assert.deepEqual(route.successContentTypes, ["application/json"]);
    assert.equal(route.requestSchema, requestSchema);
    assert.equal(route.responseSchema, responseSchema);
    assert.equal(route.badRequestUsesErrorRef, true);
    assert.equal(route.defaultUsesErrorRef, true);
  });

  it("pins inventory previews to local dry-run constants with no durable writes", () => {
    const responseBlock = schemaBlock(responseSchema);

    for (const [field, expectedConst] of [
      ["localOnly", "const: true"],
      ["dryRun", "const: true"],
      ["durableWrites", "const: false"],
    ]) {
      const fieldBlock = requireNestedBlock(responseBlock, field);
      const lines = stripped(fieldBlock);

      assert.ok(lines.has("type: boolean"), `${field} must be boolean`);
      assert.ok(lines.has(expectedConst), `${field} must be ${expectedConst}`);
      assert.ok(requiredFields(responseBlock).includes(field), `${field} must be required`);
    }
  });

  it("keeps inventory schemas on redacted refs and rejects raw retention fields", () => {
    const requestBlock = schemaBlock(requestSchema);
    const itemBlock = schemaBlock(itemSchema);
    const policyBlock = schemaBlock(policySchema);
    const issueBlock = schemaBlock(cleanupIssueSchema);

    assert.ok(hasSchemaRef(requestBlock, itemSchema), "request must use safe inventory items");
    assert.ok(hasSchemaRef(requestBlock, policySchema), "request must use bounded policy fields");
    assert.ok(
      stripped(policyBlock).has("additionalProperties: false"),
      `${policySchema} must reject unknown fields`,
    );

    for (const sourceField of ["inventory", "entries", "files", "records"]) {
      assert.ok(
        schemaPropertyNames(requestBlock).includes(sourceField),
        `${requestSchema} exposes ${sourceField}`,
      );
    }

    for (const pathField of ["path", "relativePath"]) {
      const pathBlock = requireNestedBlock(itemBlock, pathField);
      const pathLines = stripped(pathBlock);

      assert.ok(pathLines.has("type: string"), `${pathField} must be a string`);
      assert.ok(
        Array.from(pathLines).some((line) => line.includes("(?![A-Za-z]:)")),
        `${pathField} must reject drive-qualified raw paths`,
      );
      assert.ok(
        Array.from(pathLines).some((line) => line.includes("\\.\\.")),
        `${pathField} must reject traversal segments`,
      );
    }

    for (const issueKind of [
      "- unsafe-absolute-path",
      "- raw-secret",
      "- raw-lock-token",
    ]) {
      assert.ok(
        stripped(issueBlock).has(issueKind),
        `${cleanupIssueSchema} must classify ${issueKind}`,
      );
    }

    for (const schemaName of inventorySurfaceSchemas) {
      const block = schemaBlock(schemaName);
      const fields = schemaPropertyNames(block);
      const forbidden = fields.filter((field) => forbiddenRawRetentionFields.has(field));

      assert.deepEqual(forbidden, [], `${schemaName} exposes forbidden raw retention fields`);
      assert.ok(
        stripped(block).has("additionalProperties: false"),
        `${schemaName} must reject unknown fields`,
      );
    }
  });

  it("does not preserve raw path, secret, token, or request-body examples in docs or schemas", () => {
    const inventoryText = [
      docsText,
      ...inventorySurfaceSchemas.map((schemaName) => schemaBlock(schemaName).join("\n")),
    ].join("\n");

    for (const pattern of [
      /(?<![A-Za-z0-9])[A-Za-z]:[\\/]/,
      /\\\\[^\\\s]+\\[^\\\s]+/,
      /(?<![A-Za-z0-9_])\/(?:Users|home|root|tmp|var|etc|opt|private|mnt|Volumes)(?:\/|\b)/,
      /sk-[A-Za-z0-9_-]{12,}/,
      /gh[pousr]_[A-Za-z0-9_]{12,}/,
      /AKIA[0-9A-Z]{16}/,
      /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
      /\bBearer\s+(?!\[REDACTED\])[A-Za-z0-9._~+/=-]+/i,
    ]) {
      assert.equal(pattern.test(inventoryText), false, `inventory text leaked ${pattern}`);
    }
  });
});

function inventoryRouteContract() {
  const routeBlock = requireBlock(openApiLines, routePath, 2);
  const methodBlock = requireBlock(routeBlock, "post", 4);
  const requestBlock = requireBlock(methodBlock, "requestBody", 6);
  const responsesBlock = requireBlock(methodBlock, "responses", 6);
  const successBlock = requireBlock(responsesBlock, "\"200\"", 8);
  const badRequestBlock = requireBlock(responsesBlock, "\"400\"", 8);
  const defaultBlock = requireBlock(responsesBlock, "default", 8);

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
    badRequestUsesErrorRef: stripped(badRequestBlock).has("$ref: \"#/components/responses/Error\""),
    defaultUsesErrorRef: stripped(defaultBlock).has("$ref: \"#/components/responses/Error\""),
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
