import assert from "node:assert/strict";
import test from "node:test";

import { createApiRouter } from "../src/router.ts";
import {
  LifecycleRouteError,
  createLifecycleRoutes,
  mountLifecycleRoutes,
} from "../src/lifecycleRoutes.ts";

const workspaceId = "wsp_alpha";
const targetWorkspaceId = "wsp_restored";
const metadataV1 = Object.freeze({
  schemaVersion: 1,
  itemCount: 2,
});

const migrationPlan = Object.freeze({
  sourceVersion: 1,
  targetVersion: 2,
  steps: [
    {
      id: "mig_add_item_index",
      fromVersion: 1,
      toVersion: 2,
      summary: "Add item index metadata",
      rollbackNote: "Remove item index metadata",
      fingerprint: "fnv1a64:0000000000000001",
    },
  ],
  rollbackNotes: ["Remove item index metadata"],
  alreadyCurrent: false,
  dryRun: true,
  summary: {
    sourceVersion: 1,
    targetVersion: 2,
    stepCount: 1,
    stepIds: ["mig_add_item_index"],
    alreadyCurrent: false,
    dryRun: true,
    sourceFingerprint: "fnv1a64:0000000000000011",
    fingerprint: "fnv1a64:0000000000000012",
  },
  fingerprint: "fnv1a64:0000000000000012",
});

const migrationRun = Object.freeze({
  metadata: {
    schemaVersion: 2,
    itemCount: 2,
    itemIndex: ["rec_alpha", "rec_beta"],
  },
  plan: migrationPlan,
  appliedSteps: [
    {
      id: "mig_add_item_index",
      fromVersion: 1,
      toVersion: 2,
      summary: "Add item index metadata",
      rollbackNote: "Remove item index metadata",
      status: "applied",
      fingerprintBefore: "fnv1a64:0000000000000011",
      fingerprintAfter: "fnv1a64:0000000000000013",
    },
  ],
  rollbackNotes: ["Remove item index metadata"],
  summary: {
    sourceVersion: 1,
    targetVersion: 2,
    plannedStepCount: 1,
    appliedStepCount: 1,
    skippedStepCount: 0,
    dryRun: false,
    sourceFingerprint: "fnv1a64:0000000000000011",
    targetFingerprint: "fnv1a64:0000000000000013",
    fingerprint: "fnv1a64:0000000000000014",
  },
  fingerprint: "fnv1a64:0000000000000014",
});

const backupManifest = Object.freeze({
  manifestVersion: "1.0.0",
  backupId: "bkp_alpha_daily",
  workspaceId,
  createdAt: "2026-04-27T00:10:00.000Z",
  createdByActorId: "act_local_client",
  encryption: {
    algorithm: "metadata-only-encryption-v1",
    keyId: "key_backup_alpha",
    keyFingerprint: "fp_0000000000000001",
  },
  payloads: [
    {
      id: "pay_records",
      kind: "record",
      path: "records/items.json",
      plaintextByteSize: 256,
      encryptedByteSize: 320,
      contentType: "application/json",
      createdAt: "2026-04-27T00:10:01.000Z",
      encryption: {
        algorithm: "metadata-only-encryption-v1",
        keyId: "key_backup_alpha",
        nonceFingerprint: "fp_0000000000000002",
        encryptedPayloadFingerprint: "fp_0000000000000003",
      },
      integrity: {
        plaintextFingerprint: "fp_0000000000000004",
        encryptedPayloadFingerprint: "fp_0000000000000003",
        descriptorFingerprint: "fp_0000000000000005",
      },
    },
  ],
  manifestFingerprint: "fp_0000000000000006",
});

const restorePlan = Object.freeze({
  backupId: "bkp_alpha_daily",
  workspaceId,
  targetWorkspaceId,
  mode: "preview",
  canRun: true,
  safety: {
    safe: true,
    blockers: [],
    warnings: [],
  },
  actions: [
    {
      type: "restore",
      payloadId: "pay_records",
      kind: "record",
      path: "records/items.json",
      reason: "payload will be restored",
      sourceFingerprint: "fp_0000000000000005",
    },
  ],
  summary: {
    restore: 1,
    skip: 0,
    conflict: 0,
    blocked: 0,
  },
});

const eventInput = Object.freeze({
  name: "workspace.opened",
  level: "info",
  timestamp: "2026-04-27T00:11:00.000Z",
  message: "Workspace opened",
  attributes: {
    mode: "read_write",
  },
});

const eventResponse = Object.freeze({
  kind: "event",
  sequence: 1,
  ...eventInput,
  redactedPaths: [],
});

const metricInput = Object.freeze({
  kind: "gauge",
  name: "workspace.open_handles",
  value: 3,
  unit: "count",
  attributes: {
    workspaceId,
  },
  updatedAt: "2026-04-27T00:11:01.000Z",
  redactedPaths: [],
});

const compactionPlan = Object.freeze({
  workspaceId,
  fromSequence: 10,
  toSequence: 25,
  reducerVersion: "reducer-v2",
  checkpointFingerprint: "fp_0000000000000007",
  sourceEventCount: 16,
  compactedByteCount: 512,
  dryRun: true,
  rollbackNote: "Restore uncompacted event segment 10-25",
  fingerprint: "fp_0000000000000008",
});

test("mounts lifecycle routes and dispatches requests to injected handlers", async () => {
  const calls = [];
  const router = createApiRouter();
  mountLifecycleRoutes(router, createFakeLifecycleHandlers(calls));

  assert.deepEqual(
    router.listRoutes().map((route) => `${route.method} ${route.path}`),
    [
      "POST /v1/observability/events",
      "POST /v1/observability/metrics",
      "POST /v1/workspaces/:targetWorkspaceId/restores/plan",
      "POST /v1/workspaces/:workspaceId/backups/manifests",
      "POST /v1/workspaces/:workspaceId/compactions/plan",
      "POST /v1/workspaces/:workspaceId/migrations/plan",
      "POST /v1/workspaces/:workspaceId/migrations/run",
    ],
  );

  const planned = await router.dispatch({
    method: "POST",
    path: "/v1/workspaces/wsp_alpha/migrations/plan",
    actorId: "act_local",
    headers: { "x-request-id": "req_001" },
    body: {
      metadata: metadataV1,
      targetVersion: 2,
    },
  });
  assertJsonResponse(planned, 200);
  assert.deepEqual(planned.body, migrationPlan);

  const run = await router.dispatch({
    method: "POST",
    path: "/v1/workspaces/wsp_alpha/migrations/run",
    body: {
      metadata: metadataV1,
      targetVersion: 2,
      dryRun: false,
    },
  });
  assertJsonResponse(run, 200);
  assert.deepEqual(run.body, migrationRun);

  const backup = await router.dispatch({
    method: "POST",
    path: "/v1/workspaces/wsp_alpha/backups/manifests",
    body: {
      manifest: backupManifest,
    },
  });
  assertJsonResponse(backup, 201);
  assert.deepEqual(backup.body, backupManifest);

  const restore = await router.dispatch({
    method: "POST",
    path: "/v1/workspaces/wsp_restored/restores/plan",
    body: {
      manifest: backupManifest,
      mode: "preview",
    },
  });
  assertJsonResponse(restore, 200);
  assert.deepEqual(restore.body, restorePlan);

  const event = await router.dispatch({
    method: "POST",
    path: "/v1/observability/events",
    body: eventInput,
  });
  assertJsonResponse(event, 202);
  assert.deepEqual(event.body, eventResponse);

  const metric = await router.dispatch({
    method: "POST",
    path: "/v1/observability/metrics",
    body: metricInput,
  });
  assertJsonResponse(metric, 202);
  assert.deepEqual(metric.body, metricInput);

  const compaction = await router.dispatch({
    method: "POST",
    path: "/v1/workspaces/wsp_alpha/compactions/plan",
    body: {
      fromSequence: 10,
      toSequence: 25,
      reducerVersion: "reducer-v2",
      sourceEventCount: 16,
      targetByteLimit: 1024,
    },
  });
  assertJsonResponse(compaction, 200);
  assert.deepEqual(compaction.body, compactionPlan);

  assert.deepEqual(
    calls.map((call) => [call.name, call.request]),
    [
      [
        "planMigration",
        {
          workspaceId,
          metadata: metadataV1,
          targetVersion: 2,
        },
      ],
      [
        "runMigration",
        {
          workspaceId,
          metadata: metadataV1,
          targetVersion: 2,
          dryRun: false,
        },
      ],
      [
        "submitBackupManifest",
        {
          workspaceId,
          manifest: backupManifest,
        },
      ],
      [
        "planRestore",
        {
          targetWorkspaceId,
          manifest: backupManifest,
          mode: "preview",
        },
      ],
      ["submitObservabilityEvent", eventInput],
      ["submitObservabilityMetric", metricInput],
      [
        "planCompaction",
        {
          workspaceId,
          fromSequence: 10,
          toSequence: 25,
          reducerVersion: "reducer-v2",
          sourceEventCount: 16,
          targetByteLimit: 1024,
        },
      ],
    ],
  );
  assert.deepEqual(calls[0].context, {
    actorId: "act_local",
    headers: { "x-request-id": "req_001" },
    params: { workspaceId },
  });
});

test("supports custom base paths and handler-controlled response metadata", async () => {
  const calls = [];
  const router = createApiRouter(
    createLifecycleRoutes(
      createFakeLifecycleHandlers(calls, {
        submitObservabilityEvent: (request, context) => {
          calls.push(captureCall("customEvent", request, context));
          return {
            status: 201,
            headers: { "x-lifecycle-accepted": "event" },
            body: eventResponse,
          };
        },
      }),
      { basePath: "/local/api/" },
    ),
  );

  const response = await router.dispatch({
    method: "POST",
    path: "/local/api/observability/events",
    body: eventInput,
  });

  assert.equal(response.status, 201);
  assert.deepEqual(response.headers, {
    "content-type": "application/json; charset=utf-8",
    "x-lifecycle-accepted": "event",
  });
  assert.deepEqual(response.body, eventResponse);
  assert.deepEqual(calls.map((call) => call.name), ["customEvent"]);
});

test("returns JSON validation errors before calling handlers", async () => {
  const calls = [];
  const router = createApiRouter();
  mountLifecycleRoutes(router, createFakeLifecycleHandlers(calls));

  const badBody = await router.dispatch({
    method: "POST",
    path: "/v1/observability/events",
    body: ["not-an-object"],
  });
  assertJsonError(badBody, 400, "validation_failed");
  assert.deepEqual(badBody.body.error.details, { path: "body" });

  const conflict = await router.dispatch({
    method: "POST",
    path: "/v1/workspaces/wsp_alpha/migrations/plan",
    body: {
      workspaceId: "wsp_other",
      metadata: metadataV1,
    },
  });
  assertJsonError(conflict, 400, "validation_failed");
  assert.deepEqual(conflict.body.error.details, { path: "body.workspaceId" });
  assert.equal(calls.length, 0);
});

test("wraps handler errors and redacts sensitive values", async () => {
  const secret = "sk_live_route_secret_123456";
  const router = createApiRouter();
  mountLifecycleRoutes(
    router,
    createFakeLifecycleHandlers([], {
      submitBackupManifest: () => {
        throw new LifecycleRouteError(
          422,
          "backup_manifest_rejected",
          `Rejected backup manifest with apiKey=${secret}`,
          {
            apiKey: secret,
            nested: { sessionToken: secret },
          },
        );
      },
    }),
  );

  const response = await router.dispatch({
    method: "POST",
    path: "/v1/workspaces/wsp_alpha/backups/manifests",
    body: {
      manifest: backupManifest,
    },
  });

  assertJsonError(response, 422, "backup_manifest_rejected");
  assert.equal(JSON.stringify(response.body).includes(secret), false);
  assert.match(response.body.error.message, /\[REDACTED\]/);
  assert.equal(response.body.error.details.apiKey, "[REDACTED]");
  assert.deepEqual(response.body.error.details.nested, {
    sessionToken: "[REDACTED]",
  });
});

function createFakeLifecycleHandlers(calls, overrides = {}) {
  const handlers = {
    planMigration: (request, context) => {
      calls.push(captureCall("planMigration", request, context));
      return migrationPlan;
    },
    runMigration: (request, context) => {
      calls.push(captureCall("runMigration", request, context));
      return migrationRun;
    },
    submitBackupManifest: (request, context) => {
      calls.push(captureCall("submitBackupManifest", request, context));
      return backupManifest;
    },
    planRestore: (request, context) => {
      calls.push(captureCall("planRestore", request, context));
      return restorePlan;
    },
    submitObservabilityEvent: (request, context) => {
      calls.push(captureCall("submitObservabilityEvent", request, context));
      return eventResponse;
    },
    submitObservabilityMetric: (request, context) => {
      calls.push(captureCall("submitObservabilityMetric", request, context));
      return request;
    },
    planCompaction: (request, context) => {
      calls.push(captureCall("planCompaction", request, context));
      return compactionPlan;
    },
  };

  return { ...handlers, ...overrides };
}

function captureCall(name, request, context) {
  return {
    name,
    request: structuredClone(request),
    context: {
      actorId: context.actorId,
      headers: { ...context.headers },
      params: { ...context.params },
    },
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
