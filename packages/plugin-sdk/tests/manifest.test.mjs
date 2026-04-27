import assert from "node:assert/strict";
import test from "node:test";

import {
  PluginManifestValidationError,
  diffPluginManifestCapabilities,
  isPluginId,
  isSemanticVersion,
  normalizePluginManifest,
  validatePluginManifest,
} from "../src/manifest.ts";

test("validates and normalizes a complete plugin manifest", () => {
  const result = validatePluginManifest(baseManifest());

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
  assert.equal(result.value.id, "plugin.notes-board");
  assert.equal(result.value.entrypoint, "dist/index.js");
  assert.deepEqual(result.value.permissions, [
    "read_object",
    "sync_bundle",
    "write_object",
  ]);
  assert.deepEqual(
    result.value.capabilities.map((capability) => capability.id),
    ["read_notes", "write_notes"],
  );
  assert.deepEqual(
    Object.keys(result.value.tools[0].inputSchema),
    ["properties", "required", "type"],
  );
  assert.deepEqual(
    result.value.prompts[0].arguments.map((argument) => [argument.id, argument.required]),
    [
      ["length", true],
      ["tone", false],
    ],
  );
});

test("detects duplicate tool, resource, and prompt ids", () => {
  const manifest = baseManifest();
  manifest.tools = [
    manifest.tools[0],
    { ...manifest.tools[0], name: "Summarize notes again" },
  ];
  manifest.resources = [
    manifest.resources[0],
    { ...manifest.resources[0], name: "Notes catalog again" },
  ];
  manifest.prompts = [
    manifest.prompts[0],
    { ...manifest.prompts[0], name: "Draft summary again" },
  ];

  const result = validatePluginManifest(manifest);

  assert.equal(result.ok, false);
  assert.ok(hasIssue(result, "$.tools[1].id", "duplicates id summarize_notes"));
  assert.ok(hasIssue(result, "$.resources[1].id", "duplicates id notes_catalog"));
  assert.ok(hasIssue(result, "$.prompts[1].id", "duplicates id draft_summary"));
});

test("keeps normalized manifest output stable across ordering and path variations", () => {
  const first = baseManifest();
  const second = {
    ...baseManifest(),
    entrypoint: "./dist/index.js",
    permissions: ["write_object", "sync_bundle"],
    capabilities: [...baseManifest().capabilities].reverse(),
    tools: [
      {
        ...baseManifest().tools[0],
        inputSchema: {
          required: ["items"],
          type: "object",
          properties: {
            items: { type: "array" },
          },
        },
      },
    ],
    prompts: [
      {
        ...baseManifest().prompts[0],
        arguments: [...baseManifest().prompts[0].arguments].reverse(),
      },
    ],
  };

  const normalizedFirst = normalizePluginManifest(first);
  const normalizedSecond = normalizePluginManifest(second);

  assert.deepEqual(normalizedFirst, normalizedSecond);
  assert.equal(JSON.stringify(normalizedFirst), JSON.stringify(normalizedSecond));
});

test("rejects unsupported permissions and invalid versions", () => {
  assert.equal(isSemanticVersion("1.2.3-alpha.1+build.5"), true);
  assert.equal(isSemanticVersion("1.2"), false);
  assert.equal(isSemanticVersion("01.2.3"), false);
  assert.equal(isPluginId("plugin.notes-board"), true);
  assert.equal(isPluginId("notes-board"), false);

  const badPermission = baseManifest();
  badPermission.permissions = ["read_object", "delete_object"];
  assert.ok(hasIssue(validatePluginManifest(badPermission), "$.permissions[1]", "must be an allowed permission"));

  const badCapabilityPermission = baseManifest();
  badCapabilityPermission.capabilities[0] = {
    ...badCapabilityPermission.capabilities[0],
    permission: "delete_object",
  };
  assert.ok(
    hasIssue(
      validatePluginManifest(badCapabilityPermission),
      "$.capabilities[0].permission",
      "must be an allowed permission",
    ),
  );

  const badVersion = {
    ...baseManifest(),
    version: "1.2",
    minimumHostVersion: "01.0.0",
  };
  const result = validatePluginManifest(badVersion);

  assert.equal(result.ok, false);
  assert.ok(hasIssue(result, "$.version", "must use semantic version format"));
  assert.ok(hasIssue(result, "$.minimumHostVersion", "must use semantic version format"));
  assert.throws(
    () => normalizePluginManifest(badVersion),
    PluginManifestValidationError,
  );
});

test("diffs added, removed, and changed capabilities", () => {
  const before = baseManifest();
  const after = {
    ...baseManifest(),
    capabilities: [
      {
        id: "read_notes",
        permission: "read_object",
        description: "Read note titles and bodies",
      },
      {
        id: "sync_notes",
        permission: "sync_bundle",
        description: "Sync selected note bundles",
      },
    ],
  };

  const diff = diffPluginManifestCapabilities(before, after);

  assert.deepEqual(diff.added.map((capability) => capability.id), ["sync_notes"]);
  assert.deepEqual(diff.removed.map((capability) => capability.id), ["write_notes"]);
  assert.deepEqual(diff.changed.map((change) => change.id), ["read_notes"]);
  assert.deepEqual(diff.changed[0].fields, ["description"]);
});

function hasIssue(result, path, message) {
  return result.issues.some((issue) => issue.path === path && issue.message === message);
}

function baseManifest() {
  return {
    id: "plugin.notes-board",
    name: "Notes Board",
    version: "1.2.3",
    description: "Adds note review helpers to a local workspace.",
    entrypoint: ".\\dist\\index.js",
    permissions: ["sync_bundle"],
    capabilities: [
      {
        id: "write_notes",
        permission: "write_object",
        description: "Create and update notes",
      },
      {
        id: "read_notes",
        permission: "read_object",
        description: "Read note titles and metadata",
      },
    ],
    tools: [
      {
        id: "summarize_notes",
        name: "Summarize notes",
        description: "Summarizes selected notes",
        capability: "read_notes",
        inputSchema: {
          type: "object",
          required: ["items"],
          properties: {
            items: { type: "array" },
          },
        },
      },
    ],
    resources: [
      {
        id: "notes_catalog",
        name: "Notes catalog",
        description: "Lists available notes",
        uri: "sovereignops://notes/catalog",
        capability: "read_notes",
      },
    ],
    prompts: [
      {
        id: "draft_summary",
        name: "Draft summary",
        description: "Builds a concise note summary",
        capability: "read_notes",
        arguments: [
          {
            id: "tone",
            description: "Tone to use",
          },
          {
            id: "length",
            description: "Desired length",
            required: true,
          },
        ],
      },
    ],
    minimumHostVersion: "0.3.0",
  };
}
