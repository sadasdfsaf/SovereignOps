import assert from "node:assert/strict";
import test from "node:test";

import {
  ApiHttpError,
  ApiNetworkError,
  ApiRequestValidationError,
  ApiResponseValidationError,
  toApiResult,
} from "../src/client.ts";
import {
  createPluginReviewArtifactClient,
} from "../src/pluginReviewArtifactClient.ts";

const reviewId = "plugin-review-plugin.local-tools-aaaaaaaaaaaaaaaa";
const sandboxReviewId = "sandbox-review-bbbbbbbbbbbbbbbb";
const artifactFingerprint = "a".repeat(32);
const sandboxFingerprint = "b".repeat(32);
const evidenceFingerprint = "c".repeat(32);

test("previews plugin review artifacts with stable request body and headers", async () => {
  const response = validPreview();
  const fetch = fakeFetch([
    jsonResponse(200, response),
  ]);
  const client = createPluginReviewArtifactClient({
    baseUrl: "https://api.example.test/v1",
    apiKey: "test-key",
    fetch,
  });

  const preview = await client.preview(validRequest());

  assert.deepEqual(preview, response);
  assert.equal(fetch.calls.length, 1);
  assert.equal(fetch.calls[0].url, "https://api.example.test/v1/plugins/review-artifacts/preview");
  assert.equal(fetch.calls[0].init.method, "POST");
  assert.equal(fetch.calls[0].init.headers.accept, "application/json");
  assert.equal(fetch.calls[0].init.headers.authorization, "Bearer test-key");
  assert.equal(fetch.calls[0].init.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), validRequest());
});

test("validates preview requests before fetch is called", async () => {
  const fetch = fakeFetch([]);
  const client = createPluginReviewArtifactClient({
    baseUrl: "https://api.example.test/v1",
    fetch,
  });

  await assert.rejects(
    client.preview({
      ...validRequest(),
      unexpected: true,
    }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(error.issues.map((issue) => issue.path), ["unexpected"]);
      return true;
    },
  );

  await assert.rejects(
    client.preview({
      ...validRequest(),
      sandboxReview: {
        ...validRequest().sandboxReview,
        result: {
          ...validRequest().sandboxReview.result,
          ticks: -1,
          audit: [
            {
              sequence: 1,
              tick: 0,
              type: "sandbox.run_started",
              detail: ["not an object"],
            },
          ],
        },
      },
    }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(
        error.issues.map((issue) => issue.path),
        [
          "sandboxReview.result.audit.0.detail",
          "sandboxReview.result.ticks",
        ],
      );
      return true;
    },
  );

  assert.equal(fetch.calls.length, 0);
});

test("rejects malformed preview responses and keeps failures typed", async () => {
  const malformed = validPreview();
  malformed.artifact.sandboxReview.limits.maxTicks = "10";
  const fetch = fakeFetch([
    jsonResponse(200, malformed),
    jsonResponse(422, {
      error: {
        code: "validation_failed",
        message: "Sandbox review is invalid.",
        details: {
          path: "body.sandboxReview",
        },
      },
    }),
  ]);
  const client = createPluginReviewArtifactClient({
    baseUrl: "https://api.example.test/v1",
    fetch,
  });

  await assert.rejects(
    client.preview(validRequest()),
    (error) => {
      assert.equal(error instanceof ApiResponseValidationError, true);
      assert.deepEqual(
        error.issues.map((issue) => issue.path),
        ["artifact.sandboxReview.limits.maxTicks"],
      );
      return true;
    },
  );

  const httpResult = await toApiResult(client.preview(validRequest()));

  assert.equal(httpResult.ok, false);
  assert.equal(httpResult.error instanceof ApiHttpError, true);
  assert.equal(httpResult.error.status, 422);
  assert.equal(httpResult.error.apiCode, "validation_failed");
  assert.deepEqual(httpResult.error.details, { path: "body.sandboxReview" });

  const networkClient = createPluginReviewArtifactClient({
    baseUrl: "https://api.example.test/v1",
    fetch: fakeFetch([new Error("offline")]),
  });
  const networkResult = await toApiResult(networkClient.preview(validRequest()));

  assert.equal(networkResult.ok, false);
  assert.equal(networkResult.error instanceof ApiNetworkError, true);
  assert.equal(networkResult.error.code, "SO_API_NETWORK_ERROR");
});

test("keeps request and response clone boundaries isolated", async () => {
  const response = validPreview();
  const request = validRequest();
  const fetch = fakeFetch([
    jsonResponse(200, response),
  ]);
  const client = createPluginReviewArtifactClient({
    baseUrl: "https://api.example.test/v1/",
    fetch,
  });

  const pending = client.preview(request);
  request.manifest.name = "Mutated after submit";
  response.artifact.manifest.name = "Mutated response source";
  const preview = await pending;

  assert.equal(JSON.parse(fetch.calls[0].init.body).manifest.name, "Local Tools");
  assert.equal(preview.artifact.manifest.name, "Local Tools");
  assert.equal(Object.isFrozen(preview), true);
  assert.equal(Object.isFrozen(preview.artifact), true);
  assert.equal(Object.isFrozen(preview.artifact.sandboxReview.capabilities.granted), true);
  assert.throws(() => {
    preview.artifact.decision = "denied";
  }, TypeError);
  assert.throws(() => {
    preview.artifact.capabilityEvidence.push({});
  }, TypeError);
});

function validRequest() {
  return {
    manifest: baseManifest(),
    sandboxReview: {
      runLabel: "route-preview",
      boundary: {
        capabilities: ["write_items", "read_items"],
        deniedHostApis: ["process", "fs"],
        limits: {
          maxAuditEvents: 12,
          maxTicks: 10,
        },
      },
      requiredCapabilities: ["read_items", "write_items"],
      result: {
        ok: true,
        value: {
          ready: true,
        },
        audit: [
          {
            sequence: 1,
            tick: 0,
            type: "sandbox.run_started",
            detail: {},
          },
          {
            sequence: 2,
            tick: 0,
            type: "capability.allowed",
            detail: {
              capability: "read_items",
            },
          },
        ],
        ticks: 2,
      },
    },
    automationReferences: [
      { id: "bundle-check", kind: "workflow", label: "Bundle check" },
    ],
    auditReferences: [
      { id: "local-log", kind: "run-log", uri: "sovereignops://audit/local-log" },
    ],
    approvalGates: [
      { id: "owner-check", name: "Owner check", state: "approved" },
    ],
    evidence: [
      {
        id: "trace",
        kind: "local-trace",
        summary: "Local trace summary",
        localOnly: true,
        metadata: {
          file: "trace.json",
        },
      },
    ],
  };
}

function validPreview() {
  return {
    kind: "plugin-review-artifact.preview",
    localOnly: true,
    redacted: true,
    schemaVersion: "plugin-review-artifact/v1",
    reviewId,
    fingerprint: artifactFingerprint,
    decision: "approved",
    artifact: validArtifact(),
  };
}

function validArtifact() {
  return {
    schemaVersion: "plugin-review-artifact/v1",
    reviewId,
    fingerprint: artifactFingerprint,
    decision: "approved",
    manifest: {
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
    },
    sandboxReview: {
      reviewId: sandboxReviewId,
      fingerprint: sandboxFingerprint,
      pluginId: "plugin.local-tools",
      runLabel: "route-preview",
      ok: true,
      capabilities: {
        granted: ["read_items", "write_items"],
        required: ["read_items", "write_items"],
        observed: ["read_items"],
        missing: [],
      },
      hostApis: {
        denied: ["fs", "process"],
        deniedObserved: [],
      },
      limits: {
        maxAuditEvents: 12,
        maxTicks: 10,
        ticksUsed: 2,
        ticksRemaining: 8,
        tickBudgetExhausted: false,
      },
      audit: {
        total: 2,
        remaining: 10,
        overflow: false,
        byType: [
          { type: "capability.allowed", count: 1 },
          { type: "sandbox.run_started", count: 1 },
        ],
      },
      failureCategories: ["success"],
    },
    capabilityEvidence: [
      {
        capability: "read_items",
        declared: true,
        permission: "read_object",
        required: true,
        observed: true,
        granted: true,
        missing: false,
        decision: "granted",
      },
      {
        capability: "write_items",
        declared: true,
        permission: "write_object",
        required: true,
        observed: false,
        granted: true,
        missing: false,
        decision: "granted",
      },
    ],
    hostApiEvidence: [
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
    ],
    automationReferences: [
      { id: "bundle-check", kind: "workflow", label: "Bundle check" },
    ],
    auditReferences: [
      { id: "local-log", kind: "run-log", uri: "sovereignops://audit/local-log" },
    ],
    approvalGates: [
      { id: "owner-check", name: "Owner check", required: true, state: "approved" },
    ],
    evidence: [
      {
        id: "trace",
        kind: "local-trace",
        summary: "Local trace summary",
        localOnly: true,
        redacted: true,
        fingerprint: evidenceFingerprint,
      },
    ],
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

function fakeFetch(items) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const next = items.shift();
    if (next instanceof Error) {
      throw next;
    }
    if (next === undefined) {
      throw new Error("fake fetch response queue is empty");
    }
    return next;
  };
  fetch.calls = calls;
  return fetch;
}

function jsonResponse(status, body, headers = {}) {
  return textResponse(status, JSON.stringify(body), {
    "content-type": "application/json",
    ...headers,
  });
}

function textResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: statusTextFor(status),
    headers: headersLike(headers),
    async text() {
      return body;
    },
  };
}

function headersLike(headers) {
  const normalized = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    get(name) {
      return normalized.get(name.toLowerCase()) ?? null;
    },
  };
}

function statusTextFor(status) {
  if (status === 200) {
    return "OK";
  }
  if (status === 422) {
    return "Unprocessable Content";
  }
  return "";
}
