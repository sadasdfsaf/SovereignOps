import assert from "node:assert/strict";
import test from "node:test";

import { createApiRouter } from "../src/router.ts";
import { mountLifecycleRoutes } from "../src/lifecycleRoutes.ts";
import { createDefaultLifecycleHandlers } from "../src/lifecycleServices.ts";
import {
  createBackupManifest,
  createBackupPayloadDescriptor,
  stableFingerprint,
} from "../../../packages/workspace-backup/src/index.ts";
import { createDeterministicClock } from "../../../packages/observability/src/index.ts";

const workspaceId = "wsp_alpha";
const targetWorkspaceId = "wsp_restored";
const createdAt = "2026-04-27T00:00:00.000Z";

test("mounts concrete lifecycle services and delegates to local packages", async () => {
  const router = createApiRouter();
  mountLifecycleRoutes(router, createDefaultLifecycleHandlers({
    migrationSteps: metadataMigrations(),
    observabilityCollectorOptions: {
      clock: createDeterministicClock("2026-04-27T01:00:00.000Z", 10),
      resource: {
        serviceName: "local-api",
        workspaceId,
      },
    },
  }));

  const metadata = {
    schemaVersion: 1,
    items: [
      {
        id: "itm_notes",
        updatedAt: "2026-04-27T00:00:00.000Z",
      },
    ],
  };

  const migrationPlan = await router.dispatch({
    method: "POST",
    path: `/v1/workspaces/${workspaceId}/migrations/plan`,
    body: {
      metadata,
      targetVersion: 2,
    },
  });
  assertJsonResponse(migrationPlan, 200);
  assert.equal(migrationPlan.body.sourceVersion, 1);
  assert.equal(migrationPlan.body.targetVersion, 2);
  assert.deepEqual(migrationPlan.body.summary.stepIds, ["metadata.add-item-index"]);
  assert.equal(migrationPlan.body.dryRun, true);

  const migrationRun = await router.dispatch({
    method: "POST",
    path: `/v1/workspaces/${workspaceId}/migrations/run`,
    body: {
      metadata,
      targetVersion: 2,
      dryRun: false,
    },
  });
  assertJsonResponse(migrationRun, 200);
  assert.equal(migrationRun.body.metadata.schemaVersion, 2);
  assert.deepEqual(migrationRun.body.metadata.itemIndex, {
    itm_notes: "2026-04-27T00:00:00.000Z",
  });
  assert.equal(migrationRun.body.summary.appliedStepCount, 1);

  const manifest = backupManifest();
  const backupResponse = await router.dispatch({
    method: "POST",
    path: `/v1/workspaces/${workspaceId}/backups/manifests`,
    body: { manifest },
  });
  assertJsonResponse(backupResponse, 201);
  assert.deepEqual(backupResponse.body, manifest);

  const restoreResponse = await router.dispatch({
    method: "POST",
    path: `/v1/workspaces/${targetWorkspaceId}/restores/plan`,
    body: {
      manifest,
      mode: "preview",
      includePayloadIds: ["pay_workspace_notes"],
    },
  });
  assertJsonResponse(restoreResponse, 200);
  assert.equal(restoreResponse.body.backupId, manifest.backupId);
  assert.equal(restoreResponse.body.targetWorkspaceId, targetWorkspaceId);
  assert.deepEqual(restoreResponse.body.summary, {
    restore: 1,
    skip: 0,
    conflict: 0,
    blocked: 0,
  });

  const eventResponse = await router.dispatch({
    method: "POST",
    path: "/v1/observability/events",
    body: {
      name: "workspace.opened",
      message: "Workspace opened",
      attributes: {
        token: "tok_local_secret_123456",
        mode: "read_write",
      },
    },
  });
  assertJsonResponse(eventResponse, 202);
  assert.equal(eventResponse.body.sequence, 1);
  assert.equal(eventResponse.body.timestamp, "2026-04-27T01:00:00.000Z");
  assert.deepEqual(eventResponse.body.attributes, {
    mode: "read_write",
    token: "[REDACTED]",
  });
  assert.deepEqual(eventResponse.body.redactedPaths, ["attributes.token"]);

  const metricResponse = await router.dispatch({
    method: "POST",
    path: "/v1/observability/metrics",
    body: {
      kind: "gauge",
      name: "workspace.open_handles",
      value: 3,
      unit: "count",
      updatedAt: "2026-04-27T01:00:30.000Z",
      attributes: {
        secret: "hidden",
        workspaceId,
      },
    },
  });
  assertJsonResponse(metricResponse, 202);
  assert.deepEqual(metricResponse.body, {
    kind: "gauge",
    name: "workspace.open_handles",
    value: 3,
    unit: "count",
    attributes: {
      secret: "[REDACTED]",
      workspaceId,
    },
    updatedAt: "2026-04-27T01:00:30.000Z",
    redactedPaths: ["attributes.secret"],
  });

  const compactionResponse = await router.dispatch({
    method: "POST",
    path: `/v1/workspaces/${workspaceId}/compactions/plan`,
    body: {
      fromSequence: 1,
      toSequence: 3,
      reducerVersion: "reducer-v1",
      sourceEventCount: 3,
      sourceByteCount: 300,
      targetByteLimit: 256,
    },
  });
  assertJsonResponse(compactionResponse, 200);
  assert.equal(compactionResponse.body.workspaceId, workspaceId);
  assert.equal(compactionResponse.body.fromSequence, 1);
  assert.equal(compactionResponse.body.toSequence, 3);
  assert.equal(compactionResponse.body.reducerVersion, "reducer-v1");
  assert.equal(compactionResponse.body.sourceEventCount, 3);
  assert.equal(compactionResponse.body.compactedByteCount, 256);
  assert.equal(compactionResponse.body.dryRun, true);
  assert.equal(compactionResponse.body.rollbackNote, "Restore uncompacted event segment 1-3");
  assert.match(compactionResponse.body.checkpointFingerprint, /^fnv1a64:[0-9a-f]{16}$/);
  assert.match(compactionResponse.body.fingerprint, /^fnv1a64:[0-9a-f]{16}$/);
});

test("returns stable validation errors from concrete lifecycle services", async () => {
  const router = createApiRouter();
  mountLifecycleRoutes(router, createDefaultLifecycleHandlers({
    migrationSteps: metadataMigrations(),
  }));

  const invalidManifest = {
    ...backupManifest(),
    manifestFingerprint: stableFingerprint("stale-manifest"),
  };
  const invalidBackup = await router.dispatch({
    method: "POST",
    path: `/v1/workspaces/${workspaceId}/backups/manifests`,
    body: { manifest: invalidManifest },
  });
  assertJsonError(invalidBackup, 422, "backup_manifest_invalid");
  assert.deepEqual(invalidBackup.body.error.details.issues, [
    {
      path: "$.manifestFingerprint",
      message: "does not match manifest contents",
    },
  ]);

  const badCompaction = await router.dispatch({
    method: "POST",
    path: `/v1/workspaces/${workspaceId}/compactions/plan`,
    body: {
      fromSequence: 1,
      toSequence: 3,
      reducerVersion: "reducer-v1",
      sourceEventCount: 2,
    },
  });
  assertJsonError(badCompaction, 422, "compaction_plan_invalid");
  assert.deepEqual(badCompaction.body.error.details, {
    expectedEventCount: 3,
    sourceEventCount: 2,
  });
});

function metadataMigrations() {
  return [
    {
      id: "metadata.add-item-index",
      fromVersion: 1,
      toVersion: 2,
      summary: "Add item index metadata.",
      rollbackNote: "Remove itemIndex and restore schemaVersion 1 from a saved metadata snapshot.",
      isApplied(metadata) {
        return typeof metadata.itemIndex === "object" && metadata.itemIndex !== null;
      },
      migrate(metadata) {
        return {
          ...metadata,
          schemaVersion: 2,
          itemIndex: Object.fromEntries(
            metadata.items.map((item) => [item.id, item.updatedAt]),
          ),
        };
      },
    },
  ];
}

function backupManifest() {
  const notesPayload = createBackupPayloadDescriptor({
    id: "pay_workspace_notes",
    kind: "record",
    path: "records/notes.json.enc",
    plaintextByteSize: 2048,
    contentType: "application/json",
    createdAt,
    encryptionKeyId: "key_workspace_backup",
  });

  return createBackupManifest({
    backupId: "bkp_alpha_snapshot",
    workspaceId,
    createdAt,
    createdByActorId: "act_owner",
    encryptionKeyId: "key_workspace_backup",
    payloads: [notesPayload],
  });
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
