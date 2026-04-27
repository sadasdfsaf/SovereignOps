import assert from "node:assert/strict";
import test from "node:test";

import {
  runPluginInSandbox,
} from "../src/sandbox.ts";
import {
  createPluginReviewArtifact,
} from "../src/reviewArtifact.ts";

test("creates an approved plugin review artifact", () => {
  const manifest = baseManifest();
  const boundary = {
    capabilities: ["write_items", "read_items"],
    deniedHostApis: ["process", "fs"],
    limits: {
      maxAuditEvents: 12,
      maxTicks: 10,
    },
  };
  const result = runPluginInSandbox((context) => {
    context.requireCapability("read_items");
    context.tick(2, "scan");
    return { ready: true };
  }, boundary);

  const artifact = createPluginReviewArtifact({
    manifest,
    sandboxReview: {
      runLabel: "release-check",
      boundary,
      requiredCapabilities: ["read_items"],
      result,
    },
    automationReferences: [
      { id: "bundle-check", kind: "workflow", label: "Bundle check" },
    ],
    auditReferences: [
      { id: "local-log", kind: "run-log", uri: "sovereignops://audit/local-log" },
    ],
    approvalGates: [
      { id: "owner-review", name: "Owner review", state: "approved" },
    ],
  });

  assert.equal(artifact.schemaVersion, "plugin-review-artifact/v1");
  assert.equal(artifact.decision, "approved");
  assert.match(artifact.reviewId, /^plugin-review-plugin\.review-board-[a-f0-9]{16}$/);
  assert.match(artifact.fingerprint, /^[a-f0-9]{32}$/);
  assert.equal(artifact.manifest.id, "plugin.review-board");
  assert.deepEqual(artifact.manifest.permissions, ["read_object", "write_object"]);
  assert.deepEqual(
    artifact.capabilityEvidence.map((item) => [item.capability, item.decision]),
    [
      ["read_items", "granted"],
      ["write_items", "granted"],
    ],
  );
  assert.deepEqual(artifact.hostApiEvidence, [
    {
      api: "fs",
      configuredDenied: true,
      observedDenied: false,
      decision: "blocked",
    },
    {
      api: "process",
      configuredDenied: true,
      observedDenied: false,
      decision: "blocked",
    },
  ]);
  assert.equal(artifact.sandboxReview.pluginId, "plugin.review-board");
});

test("denies artifacts with missing capability evidence", () => {
  const boundary = {
    capabilities: ["read_items"],
    limits: {
      maxAuditEvents: 8,
      maxTicks: 8,
    },
  };
  const result = runPluginInSandbox((context) => {
    context.requireCapability("write_items");
    return "unreachable";
  }, boundary);

  const artifact = createPluginReviewArtifact({
    manifest: baseManifest(),
    sandboxReview: {
      boundary,
      requiredCapabilities: ["read_items", "write_items"],
      result,
    },
  });
  const writeEvidence = artifact.capabilityEvidence.find((item) => item.capability === "write_items");

  assert.equal(artifact.decision, "denied");
  assert.deepEqual(artifact.sandboxReview.capabilities.missing, ["write_items"]);
  assert.deepEqual(writeEvidence, {
    capability: "write_items",
    declared: true,
    permission: "write_object",
    required: true,
    observed: true,
    granted: false,
    missing: true,
    decision: "missing",
  });
  assert.equal(JSON.stringify(artifact).includes("Capability denied"), false);
});

test("marks clean sandbox artifacts as approval required when a required gate is pending", () => {
  const boundary = {
    capabilities: ["read_items"],
    limits: {
      maxAuditEvents: 8,
      maxTicks: 8,
    },
  };
  const result = runPluginInSandbox((context) => {
    context.requireCapability("read_items");
    return "ok";
  }, boundary);

  const artifact = createPluginReviewArtifact({
    manifest: baseManifest(),
    sandboxReview: {
      boundary,
      requiredCapabilities: ["read_items"],
      result,
    },
    approvalGates: [
      { id: "operator-check", name: "Operator check" },
    ],
  });

  assert.equal(artifact.sandboxReview.ok, true);
  assert.equal(artifact.decision, "approval_required");
  assert.deepEqual(artifact.approvalGates, [
    {
      id: "operator-check",
      name: "Operator check",
      required: true,
      state: "pending",
    },
  ]);
});

test("redacts local-only evidence while keeping deterministic evidence fingerprints", () => {
  const artifact = createApprovedArtifact({
    evidence: [
      {
        id: "trace",
        kind: "local-trace",
        summary: "Captured C:\\Users\\DELL\\workspace\\trace.json with token=secret-value",
        path: "C:\\Users\\DELL\\workspace\\trace.json",
        content: "token=secret-value\nprivate body",
        metadata: {
          file: "trace.json",
          size: 42,
        },
      },
    ],
  });
  const serialized = JSON.stringify(artifact);

  assert.equal(artifact.evidence.length, 1);
  assert.equal(artifact.evidence[0].localOnly, true);
  assert.equal(artifact.evidence[0].redacted, true);
  assert.match(artifact.evidence[0].fingerprint, /^[a-f0-9]{32}$/);
  assert.equal(artifact.evidence[0].summary, "Captured [local-path] with token=[redacted]");
  assert.equal(serialized.includes("C:\\Users\\DELL"), false);
  assert.equal(serialized.includes("secret-value"), false);
  assert.equal(serialized.includes("private body"), false);
});

test("keeps artifact ordering, ids, and fingerprints deterministic", () => {
  const first = createApprovedArtifact({
    automationReferences: [
      { id: "zeta", kind: "workflow" },
      { id: "alpha", kind: "workflow" },
    ],
    auditReferences: [
      { id: "run-b", kind: "log" },
      { id: "run-a", kind: "log" },
    ],
    approvalGates: [
      { id: "second", name: "Second", state: "approved" },
      { id: "first", name: "First", state: "approved" },
    ],
    evidence: [
      { id: "b", kind: "local", content: "second" },
      { id: "a", kind: "local", content: "first" },
    ],
  });
  const second = createApprovedArtifact({
    automationReferences: [
      { id: "alpha", kind: "workflow" },
      { id: "zeta", kind: "workflow" },
    ],
    auditReferences: [
      { id: "run-a", kind: "log" },
      { id: "run-b", kind: "log" },
    ],
    approvalGates: [
      { id: "first", name: "First", state: "approved" },
      { id: "second", name: "Second", state: "approved" },
    ],
    evidence: [
      { id: "a", kind: "local", content: "first" },
      { id: "b", kind: "local", content: "second" },
    ],
  });

  assert.deepEqual(first.automationReferences.map((item) => item.id), ["alpha", "zeta"]);
  assert.deepEqual(first.auditReferences.map((item) => item.id), ["run-a", "run-b"]);
  assert.deepEqual(first.approvalGates.map((item) => item.id), ["first", "second"]);
  assert.deepEqual(first.evidence.map((item) => item.id), ["a", "b"]);
  assert.equal(first.reviewId, second.reviewId);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test("clones and freezes review artifact boundaries", () => {
  const manifest = baseManifest();
  const boundary = {
    capabilities: ["read_items"],
    deniedHostApis: ["process"],
    limits: {
      maxAuditEvents: 8,
      maxTicks: 8,
    },
  };
  const result = runPluginInSandbox((context) => {
    context.requireCapability("read_items");
    return "ok";
  }, boundary);

  const artifact = createPluginReviewArtifact({
    manifest,
    sandboxReview: {
      boundary,
      requiredCapabilities: ["read_items"],
      result,
    },
    approvalGates: [
      { id: "owner-review", name: "Owner review", state: "approved" },
    ],
  });
  manifest.capabilities.push({
    id: "extra_items",
    permission: "write_object",
    description: "Update extra items",
  });
  boundary.capabilities.push("extra_items");
  boundary.deniedHostApis.push("fs");
  boundary.limits.maxTicks = 1;

  assert.deepEqual(
    artifact.manifest.capabilities.map((capability) => capability.id),
    ["read_items", "write_items"],
  );
  assert.deepEqual(artifact.sandboxReview.capabilities.granted, ["read_items"]);
  assert.deepEqual(artifact.sandboxReview.hostApis.denied, ["process"]);
  assert.equal(artifact.sandboxReview.limits.maxTicks, 8);
  assert.equal(Object.isFrozen(artifact), true);
  assert.equal(Object.isFrozen(artifact.manifest), true);
  assert.equal(Object.isFrozen(artifact.capabilityEvidence), true);
  assert.equal(Object.isFrozen(artifact.approvalGates[0]), true);
  assert.throws(() => {
    artifact.capabilityEvidence.push({});
  }, TypeError);
});

function createApprovedArtifact(overrides = {}) {
  const boundary = {
    capabilities: ["write_items", "read_items"],
    deniedHostApis: ["process", "fs"],
    limits: {
      maxAuditEvents: 12,
      maxTicks: 10,
    },
  };
  const result = runPluginInSandbox((context) => {
    context.requireCapability("read_items");
    context.requireCapability("write_items");
    return "ok";
  }, boundary);

  return createPluginReviewArtifact({
    manifest: baseManifest(),
    sandboxReview: {
      runLabel: "stable",
      boundary,
      requiredCapabilities: ["write_items", "read_items"],
      result,
    },
    ...overrides,
  });
}

function baseManifest() {
  return {
    id: "plugin.review-board",
    name: "Review Board",
    version: "1.2.3",
    description: "Adds review helpers to a local workspace.",
    entrypoint: ".\\dist\\index.js",
    capabilities: [
      {
        id: "write_items",
        permission: "write_object",
        description: "Create and update review items",
      },
      {
        id: "read_items",
        permission: "read_object",
        description: "Read review item titles and metadata",
      },
    ],
    tools: [
      {
        id: "summarize_items",
        name: "Summarize items",
        description: "Summarizes selected items",
        capability: "read_items",
      },
    ],
    resources: [
      {
        id: "item_catalog",
        name: "Item catalog",
        description: "Lists available items",
        uri: "sovereignops://items/catalog",
        capability: "read_items",
      },
    ],
    prompts: [
      {
        id: "draft_note",
        name: "Draft note",
        description: "Builds a concise review note",
        capability: "read_items",
      },
    ],
    minimumHostVersion: "0.3.0",
  };
}
