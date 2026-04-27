import assert from "node:assert/strict";
import test from "node:test";

import { createApiRouter } from "../src/router.ts";
import {
  createPluginReviewArtifactRoutes,
  mountPluginReviewArtifactRoutes,
} from "../src/pluginReviewArtifactRoutes.ts";
import { runPluginInSandbox } from "../../../packages/plugin-sdk/src/index.ts";

const secret = "sk_local_review_secret_123456";

test("mounts plugin review artifact preview route", () => {
  const router = createApiRouter();
  mountPluginReviewArtifactRoutes(router);

  assert.deepEqual(
    router.listRoutes().map((route) => `${route.method} ${route.path}`),
    ["POST /v1/plugins/review-artifacts/preview"],
  );
});

test("builds deterministic plugin review artifact previews", async () => {
  const router = createApiRouter(createPluginReviewArtifactRoutes());
  const body = createApprovedBody({
    automationReferences: [
      { id: "bundle-check", kind: "workflow", label: "Bundle check" },
    ],
    auditReferences: [
      { id: "local-log", kind: "run-log", uri: "sovereignops://audit/local-log" },
    ],
  });

  const first = await router.dispatch({
    method: "POST",
    path: "/v1/plugins/review-artifacts/preview",
    body,
  });
  const second = await router.dispatch({
    method: "POST",
    path: "/v1/plugins/review-artifacts/preview",
    body: structuredClone(body),
  });

  assertJsonResponse(first, 200);
  assert.deepEqual(first.body, second.body);
  assert.equal(first.body.kind, "plugin-review-artifact.preview");
  assert.equal(first.body.localOnly, true);
  assert.equal(first.body.redacted, true);
  assert.equal(first.body.schemaVersion, "plugin-review-artifact/v1");
  assert.equal(first.body.reviewId, first.body.artifact.reviewId);
  assert.equal(first.body.fingerprint, first.body.artifact.fingerprint);
  assert.equal(first.body.decision, "approved");
  assert.match(first.body.reviewId, /^plugin-review-plugin\.local-tools-[a-f0-9]{16}$/);
  assert.match(first.body.fingerprint, /^[a-f0-9]{32}$/);
  assert.deepEqual(first.body.artifact.manifest, {
    id: "plugin.local-tools",
    name: "Local Tools",
    version: "1.2.3",
    description: "Adds local item helpers to a workspace.",
    entrypoint: "dist/index.js",
    minimumHostVersion: "0.3.0",
    permissions: ["read_object", "write_object"],
    capabilities: [
      { id: "read_items", permission: "read_object" },
      { id: "write_items", permission: "write_object" },
    ],
    tools: [
      { id: "summarize_items", name: "Summarize items", capability: "read_items" },
    ],
    resources: [
      { id: "item_catalog", name: "Item catalog", capability: "read_items" },
    ],
    prompts: [
      { id: "draft_note", name: "Draft note", capability: "read_items" },
    ],
  });
  assert.deepEqual(
    first.body.artifact.capabilityEvidence.map((item) => [item.capability, item.decision]),
    [
      ["read_items", "granted"],
      ["write_items", "granted"],
    ],
  );
  assert.deepEqual(
    first.body.artifact.hostApiEvidence.map((item) => [item.api, item.decision]),
    [
      ["fs", "blocked"],
      ["process", "blocked"],
    ],
  );
  assert.equal(first.body.artifact.sandboxReview.pluginId, "plugin.local-tools");
});

test("redacts sensitive values before returning successful previews", async () => {
  const router = createApiRouter(createPluginReviewArtifactRoutes());
  const body = createApprovedBody({
    manifest: {
      ...baseManifest(),
      description: `Adds helpers after token=${secret}`,
    },
    automationReferences: [
      { id: "bundle-check", kind: "workflow", label: `token=${secret}` },
    ],
    auditReferences: [
      { id: "local-log", kind: "run-log", uri: `sovereignops://audit/local-log?apiKey=${secret}` },
    ],
    approvalGates: [
      { id: "owner-check", name: "Owner check", state: "approved", reason: `secret=${secret}` },
    ],
    evidence: [
      {
        id: "trace",
        kind: "local-trace",
        summary: `Captured C:\\Users\\DELL\\trace.json with token=${secret}`,
        path: "C:\\Users\\DELL\\trace.json",
        content: `token=${secret}\nprivate body`,
        metadata: {
          token: secret,
        },
      },
    ],
  });

  const response = await router.dispatch({
    method: "POST",
    path: "/v1/plugins/review-artifacts/preview",
    body,
  });

  assertJsonResponse(response, 200);
  const serialized = JSON.stringify(response.body);
  assert.equal(serialized.includes(secret), false);
  assert.match(serialized, /\[REDACTED\]/);
  assert.equal(response.body.artifact.manifest.description, "[REDACTED]");
  assert.equal(response.body.artifact.automationReferences[0].label, "[REDACTED]");
  assert.equal(response.body.artifact.auditReferences[0].uri, "[REDACTED]");
  assert.equal(response.body.artifact.approvalGates[0].reason, "[REDACTED]");
  assert.equal(response.body.artifact.evidence[0].summary, "[REDACTED]");
});

test("returns standard JSON validation errors for invalid preview bodies", async () => {
  const router = createApiRouter(createPluginReviewArtifactRoutes());

  const badBody = await router.dispatch({
    method: "POST",
    path: "/v1/plugins/review-artifacts/preview",
    body: ["not-an-object"],
  });
  assertJsonError(badBody, 400, "validation_failed");
  assert.deepEqual(badBody.body.error.details, { path: "body" });

  const missingManifest = await router.dispatch({
    method: "POST",
    path: "/v1/plugins/review-artifacts/preview",
    body: {
      sandboxReview: createApprovedBody().sandboxReview,
    },
  });
  assertJsonError(missingManifest, 400, "validation_failed");
  assert.deepEqual(missingManifest.body.error.details, { path: "body.manifest" });

  const unknownNestedField = await router.dispatch({
    method: "POST",
    path: "/v1/plugins/review-artifacts/preview",
    body: {
      ...createApprovedBody(),
      sandboxReview: {
        ...createApprovedBody().sandboxReview,
        unsafe: true,
      },
    },
  });
  assertJsonError(unknownNestedField, 400, "validation_failed");
  assert.deepEqual(unknownNestedField.body.error.details, {
    path: "body.sandboxReview.unsafe",
  });

  const badAuditDetail = await router.dispatch({
    method: "POST",
    path: "/v1/plugins/review-artifacts/preview",
    body: {
      ...createApprovedBody(),
      sandboxReview: {
        ...createApprovedBody().sandboxReview,
        result: {
          ok: true,
          value: "ok",
          ticks: 0,
          audit: [
            {
              sequence: 1,
              tick: 0,
              type: "sandbox.run_started",
              detail: ["not-an-object"],
            },
          ],
        },
      },
    },
  });
  assertJsonError(badAuditDetail, 400, "validation_failed");
  assert.deepEqual(badAuditDetail.body.error.details, {
    path: "body.sandboxReview.result.audit.0.detail",
  });
});

test("wraps plugin SDK validation failures as route validation errors", async () => {
  const router = createApiRouter(createPluginReviewArtifactRoutes());
  const response = await router.dispatch({
    method: "POST",
    path: "/v1/plugins/review-artifacts/preview",
    body: {
      ...createApprovedBody(),
      manifest: {
        ...baseManifest(),
        id: "local-tools",
      },
    },
  });

  assertJsonError(response, 400, "validation_failed");
  assert.equal(response.body.error.details.path, "body.manifest");
  assert.deepEqual(response.body.error.details.issues, [
    {
      path: "$.id",
      message: "must use plugin.<slug> format",
    },
  ]);
});

function createApprovedBody(overrides = {}) {
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
    context.tick(2, "scan");
    return { ready: true };
  }, boundary);

  return {
    manifest: baseManifest(),
    sandboxReview: {
      runLabel: "route-preview",
      boundary,
      requiredCapabilities: ["read_items", "write_items"],
      result,
    },
    approvalGates: [
      { id: "owner-check", name: "Owner check", state: "approved" },
    ],
    ...overrides,
  };
}

function baseManifest() {
  return {
    id: "plugin.local-tools",
    name: "Local Tools",
    version: "1.2.3",
    description: "Adds local item helpers to a workspace.",
    entrypoint: ".\\dist\\index.js",
    capabilities: [
      {
        id: "write_items",
        permission: "write_object",
        description: "Create and update local items",
      },
      {
        id: "read_items",
        permission: "read_object",
        description: "Read local item titles and metadata",
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
        description: "Builds a concise note",
        capability: "read_items",
      },
    ],
    minimumHostVersion: "0.3.0",
  };
}

function assertJsonResponse(response, status) {
  assert.equal(response.status, status);
  assert.match(response.headers["content-type"], /^application\/json/);
}

function assertJsonError(response, status, code) {
  assertJsonResponse(response, status);
  assert.deepEqual(Object.keys(response.body), ["error"]);
  assert.equal(response.body.error.code, code);
  assert.equal(typeof response.body.error.message, "string");
  assert.ok(response.body.error.message.length > 0);
}
