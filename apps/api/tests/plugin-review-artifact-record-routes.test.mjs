import assert from "node:assert/strict";
import test from "node:test";

import { createApiRouter } from "../src/router.ts";
import { createPluginReviewArtifactRoutes } from "../src/pluginReviewArtifactRoutes.ts";
import {
  PLUGIN_REVIEW_ARTIFACT_RECORD_SCHEMA_VERSION,
  createInMemoryPluginReviewArtifactRecordStore,
  createPluginReviewArtifactRecordRoutes,
  mountPluginReviewArtifactRecordRoutes,
} from "../src/pluginReviewArtifactRecordRoutes.ts";
import { runPluginInSandbox } from "../../../packages/plugin-sdk/src/index.ts";

const fixedNow = "2026-04-27T00:00:00.000Z";
const secret = "sk_local_artifact_record_secret_123456";

test("mounts plugin review artifact record routes", () => {
  const router = createApiRouter();
  mountPluginReviewArtifactRecordRoutes(router);

  assert.deepEqual(
    router.listRoutes().map(routeKey),
    [
      "GET /v1/plugins/review-artifacts/records",
      "GET /v1/plugins/review-artifacts/records/:recordId",
      "POST /v1/plugins/review-artifacts/records",
      "POST /v1/plugins/review-artifacts/records/:recordId/compare",
    ],
  );
});

test("stores plugin review artifact records from raw preview inputs with redacted summaries", async () => {
  const store = createInMemoryPluginReviewArtifactRecordStore();
  const router = createApiRouter(createPluginReviewArtifactRecordRoutes({
    store,
    now: () => fixedNow,
  }));
  const body = {
    recordId: "plugin-review-record-1",
    label: "local-baseline",
    metadata: {
      token: secret,
      visible: "kept",
    },
    payload: createApprovedBody({
      evidence: [
        {
          id: "trace",
          kind: "local-trace",
          summary: `Captured C:\\Users\\DELL\\trace.json with token=${secret}`,
          path: "C:\\Users\\DELL\\trace.json",
          content: `token=${secret}\nprivate body`,
          metadata: {
            token: secret,
            visible: "kept",
          },
        },
      ],
    }),
  };
  const before = structuredClone(body);

  const createResponse = await router.dispatch({
    method: "POST",
    path: "/v1/plugins/review-artifacts/records",
    body,
  });

  assertJsonResponse(createResponse, 201);
  assert.deepEqual(body, before);
  assert.equal(createResponse.body.kind, "plugin-review-artifact.record.created");
  assert.equal(createResponse.body.schemaVersion, PLUGIN_REVIEW_ARTIFACT_RECORD_SCHEMA_VERSION);
  assert.equal(createResponse.body.localOnly, true);
  assert.equal(createResponse.body.record.kind, "plugin-review-artifact.record");
  assert.equal(createResponse.body.record.recordId, "plugin-review-record-1");
  assert.equal(createResponse.body.record.localOnly, true);
  assert.equal(createResponse.body.record.redacted, true);
  assert.equal(createResponse.body.record.createdAt, fixedNow);
  assert.equal(createResponse.body.record.updatedAt, fixedNow);
  assert.equal(createResponse.body.record.label, "local-baseline");
  assert.equal(createResponse.body.record.metadata.token, "[REDACTED]");
  assert.equal(createResponse.body.record.metadata.visible, "kept");
  assert.match(createResponse.body.record.fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(
    createResponse.body.record.baselineFingerprint,
    createResponse.body.record.baseline.fingerprint,
  );
  assert.equal(createResponse.body.record.baseline.kind, "plugin-review-artifact.preview");
  assert.equal(createResponse.body.record.baseline.artifact.evidence.length, 1);
  assert.deepEqual(
    Object.keys(createResponse.body.record.baseline.artifact.evidence[0]).sort(),
    ["fingerprint", "id", "kind", "localOnly", "redacted", "summary"],
  );
  assert.equal(JSON.stringify(createResponse.body).includes(secret), false);
  assert.equal(JSON.stringify(createResponse.body).includes("private body"), false);
  assert.equal(JSON.stringify(createResponse.body).includes("C:\\Users\\DELL\\trace.json"), false);

  const listResponse = await router.dispatch({
    method: "GET",
    path: "/v1/plugins/review-artifacts/records",
    body: {
      filters: {
        labels: ["local-baseline"],
        decisions: ["approved"],
      },
      offset: 0,
      limit: 1,
    },
  });
  assertJsonResponse(listResponse, 200);
  assert.deepEqual(listResponse.body.pagination, {
    offset: 0,
    limit: 1,
    totalRecordCount: 1,
    matchedRecordCount: 1,
    returnedRecordCount: 1,
    hasMore: false,
  });
  assert.deepEqual(
    listResponse.body.records.map((record) => ({
      recordId: record.recordId,
      label: record.label,
      pluginId: record.pluginId,
      decision: record.decision,
      evidenceCount: record.evidenceCount,
    })),
    [
      {
        recordId: "plugin-review-record-1",
        label: "local-baseline",
        pluginId: "plugin.local-tools",
        decision: "approved",
        evidenceCount: 1,
      },
    ],
  );

  const getResponse = await router.dispatch({
    method: "GET",
    path: "/v1/plugins/review-artifacts/records/plugin-review-record-1",
  });
  assertJsonResponse(getResponse, 200);
  assert.deepEqual(getResponse.body.record, createResponse.body.record);
});

test("accepts stored preview responses and compares candidate artifact payloads", async () => {
  const store = createInMemoryPluginReviewArtifactRecordStore();
  const router = createApiRouter(createPluginReviewArtifactRecordRoutes({
    store,
    now: () => fixedNow,
  }));
  const preview = await createPreview(createApprovedBody());

  const createResponse = await router.dispatch({
    method: "POST",
    path: "/v1/plugins/review-artifacts/records",
    body: {
      recordId: "plugin-review-preview-1",
      preview,
    },
  });
  assertJsonResponse(createResponse, 201);
  assert.deepEqual(createResponse.body.record.baseline, preview);

  const sameCompare = await router.dispatch({
    method: "POST",
    path: "/v1/plugins/review-artifacts/records/plugin-review-preview-1/compare",
    body: {
      baseline: preview,
    },
  });
  assertJsonResponse(sameCompare, 200);
  assert.equal(sameCompare.body.kind, "plugin-review-artifact.record.compare");
  assert.equal(sameCompare.body.equivalent, true);
  assert.equal(sameCompare.body.summary.addedItemCount, 0);
  assert.equal(sameCompare.body.summary.removedItemCount, 0);
  assert.equal(sameCompare.body.summary.changedItemCount, 0);

  const changedBody = createApprovedBody({
    evidence: [
      {
        id: "trace",
        kind: "local-trace",
        summary: "Updated local review summary",
      },
      {
        id: "snapshot",
        kind: "local-snapshot",
        summary: "Added local snapshot summary",
      },
    ],
  });
  const compareBody = { payload: changedBody };
  const compareBefore = structuredClone(compareBody);

  const changedCompare = await router.dispatch({
    method: "POST",
    path: "/v1/plugins/review-artifacts/records/plugin-review-preview-1/compare",
    body: compareBody,
  });
  assertJsonResponse(changedCompare, 200);
  assert.deepEqual(compareBody, compareBefore);
  assert.equal(changedCompare.body.equivalent, false);
  assert.equal(changedCompare.body.summary.addedItemCount, 2);
  assert.equal(changedCompare.body.summary.removedItemCount, 0);
  assert.equal(changedCompare.body.summary.changedItemCount, 0);
  assert.deepEqual(
    changedCompare.body.differences.added.map((item) => item.key),
    ["evidence:local-snapshot:snapshot", "evidence:local-trace:trace"],
  );
});

test("detects changed plugin review artifact items during compare", async () => {
  const router = createApiRouter(createPluginReviewArtifactRecordRoutes({
    now: () => fixedNow,
  }));
  const originalBody = createApprovedBody({
    evidence: [
      {
        id: "trace",
        kind: "local-trace",
        summary: "Original local review summary",
      },
    ],
  });

  const createResponse = await router.dispatch({
    method: "POST",
    path: "/v1/plugins/review-artifacts/records",
    body: {
      recordId: "plugin-review-compare-1",
      payload: originalBody,
    },
  });
  assertJsonResponse(createResponse, 201);

  const changedBody = createApprovedBody({
    evidence: [
      {
        id: "trace",
        kind: "local-trace",
        summary: "Changed local review summary",
      },
    ],
  });
  const changedCompare = await router.dispatch({
    method: "POST",
    path: "/v1/plugins/review-artifacts/records/plugin-review-compare-1/compare",
    body: {
      payload: changedBody,
    },
  });

  assertJsonResponse(changedCompare, 200);
  assert.equal(changedCompare.body.equivalent, false);
  assert.equal(changedCompare.body.summary.addedItemCount, 0);
  assert.equal(changedCompare.body.summary.removedItemCount, 0);
  assert.equal(changedCompare.body.summary.changedItemCount, 1);
  assert.deepEqual(
    changedCompare.body.differences.changed.map((item) => item.key),
    ["evidence:local-trace:trace"],
  );
});

test("returns standard JSON errors for invalid, missing, duplicate, and unsafe records", async () => {
  const router = createApiRouter(createPluginReviewArtifactRecordRoutes({
    now: () => fixedNow,
  }));

  const badBody = await router.dispatch({
    method: "POST",
    path: "/v1/plugins/review-artifacts/records",
    body: ["not-an-object"],
  });
  assertJsonError(badBody, 400, "validation_failed");
  assert.deepEqual(badBody.body.error.details, { path: "body" });

  const badRecordId = await router.dispatch({
    method: "POST",
    path: "/v1/plugins/review-artifacts/records",
    body: {
      recordId: "bad/id",
      payload: createApprovedBody(),
    },
  });
  assertJsonError(badRecordId, 400, "validation_failed");
  assert.deepEqual(badRecordId.body.error.details, { path: "body.recordId" });

  const malformedPayload = await router.dispatch({
    method: "POST",
    path: "/v1/plugins/review-artifacts/records",
    body: {
      recordId: "plugin-review-malformed",
      payload: {
        manifest: baseManifest(),
        sandboxReview: createApprovedBody().sandboxReview,
        unexpected: true,
      },
    },
  });
  assertJsonError(malformedPayload, 400, "validation_failed");
  assert.deepEqual(malformedPayload.body.error.details, { path: "body.unexpected" });

  const created = await router.dispatch({
    method: "POST",
    path: "/v1/plugins/review-artifacts/records",
    body: {
      recordId: "plugin-review-duplicate",
      payload: createApprovedBody(),
    },
  });
  assertJsonResponse(created, 201);

  const duplicate = await router.dispatch({
    method: "POST",
    path: "/v1/plugins/review-artifacts/records",
    body: {
      recordId: "plugin-review-duplicate",
      payload: createApprovedBody(),
    },
  });
  assertJsonError(duplicate, 409, "plugin_review_artifact_record_duplicate");
  assert.deepEqual(duplicate.body.error.details, { recordId: "plugin-review-duplicate" });

  const missing = await router.dispatch({
    method: "GET",
    path: "/v1/plugins/review-artifacts/records/missing-record",
  });
  assertJsonError(missing, 404, "plugin_review_artifact_record_not_found");
  assert.deepEqual(missing.body.error.details, { recordId: "missing-record" });

  const badList = await router.dispatch({
    method: "GET",
    path: "/v1/plugins/review-artifacts/records",
    body: {
      limit: 101,
    },
  });
  assertJsonError(badList, 400, "validation_failed");
  assert.deepEqual(badList.body.error.details, { path: "body.limit" });

  const preview = await createPreview(createApprovedBody({
    evidence: [
      {
        id: "trace",
        kind: "local-trace",
        summary: "Redacted summary",
      },
    ],
  }));
  const unsafePreview = structuredClone(preview);
  unsafePreview.artifact.evidence[0].content = "raw local evidence body";
  const unsafe = await router.dispatch({
    method: "POST",
    path: "/v1/plugins/review-artifacts/records",
    body: {
      recordId: "plugin-review-unsafe",
      preview: unsafePreview,
    },
  });
  assertJsonError(unsafe, 400, "validation_failed");
  assert.deepEqual(unsafe.body.error.details, {
    path: "body.artifact.evidence.0.content",
  });
});

test("generates deterministic plugin review artifact record ids and rejects duplicate auto ids", async () => {
  const router = createApiRouter(createPluginReviewArtifactRecordRoutes({
    now: () => fixedNow,
  }));

  const first = await router.dispatch({
    method: "POST",
    path: "/v1/plugins/review-artifacts/records",
    body: createApprovedBody(),
  });
  assertJsonResponse(first, 201);
  assert.match(first.body.record.recordId, /^plugrev_[a-f0-9]{24}$/);

  const second = await router.dispatch({
    method: "POST",
    path: "/v1/plugins/review-artifacts/records",
    body: createApprovedBody(),
  });
  assertJsonError(second, 409, "plugin_review_artifact_record_duplicate");
  assert.deepEqual(second.body.error.details, { recordId: first.body.record.recordId });
});

async function createPreview(body) {
  const router = createApiRouter(createPluginReviewArtifactRoutes());
  const response = await router.dispatch({
    method: "POST",
    path: "/v1/plugins/review-artifacts/preview",
    body,
  });

  assertJsonResponse(response, 200);
  return response.body;
}

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
      runLabel: "record-preview",
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

function routeKey(route) {
  return `${route.method} ${route.path}`;
}
