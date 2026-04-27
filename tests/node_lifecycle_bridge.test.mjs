import assert from "node:assert/strict";
import test from "node:test";

import { createApiRouter } from "../apps/api/src/router.ts";
import { mountLifecycleRoutes } from "../apps/api/src/lifecycleRoutes.ts";
import { createDefaultLifecycleHandlers } from "../apps/api/src/lifecycleServices.ts";
import {
  ApiHttpError,
  SovereignOpsClient,
  toApiResult,
} from "../packages/sdk-js/src/client.ts";
import {
  createBackupManifest,
  createBackupPayloadDescriptor,
} from "../packages/workspace-backup/src/index.ts";
import { createDeterministicClock } from "../packages/observability/src/index.ts";

const workspaceId = "wsp_alpha";
const targetWorkspaceId = "wsp_restore";
const createdAt = "2026-04-27T00:00:00.000Z";

test("bridges SDK lifecycle calls through the API router", async () => {
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

  const fetch = createRouterFetch(router);
  const client = new SovereignOpsClient({
    baseUrl: "https://bridge.example/v1",
    apiKey: "local-test-key",
    fetch,
  });
  const metadata = sourceMetadata();
  const manifest = backupManifest();

  const migrationPlan = await client.planMigration({
    workspaceId,
    metadata,
    targetVersion: 2,
  });
  assert.equal(migrationPlan.sourceVersion, 1);
  assert.equal(migrationPlan.targetVersion, 2);
  assert.deepEqual(migrationPlan.summary.stepIds, ["metadata.add-item-index"]);
  assert.equal(migrationPlan.dryRun, true);

  const migrationRun = await client.runMigration({
    workspaceId,
    metadata,
    targetVersion: 2,
    dryRun: false,
  });
  assert.equal(migrationRun.metadata.schemaVersion, 2);
  assert.deepEqual(migrationRun.metadata.itemIndex, {
    itm_notes: "2026-04-27T00:00:00.000Z",
  });
  assert.equal(migrationRun.summary.appliedStepCount, 1);

  const submittedManifest = await client.submitBackupManifest({
    workspaceId,
    manifest,
  });
  assert.deepEqual(submittedManifest, manifest);

  const restorePlan = await client.planRestore({
    targetWorkspaceId,
    manifest,
    mode: "preview",
    includePayloadIds: ["pay_workspace_notes"],
  });
  assert.equal(restorePlan.backupId, manifest.backupId);
  assert.equal(restorePlan.targetWorkspaceId, targetWorkspaceId);
  assert.deepEqual(restorePlan.summary, {
    restore: 1,
    skip: 0,
    conflict: 0,
    blocked: 0,
  });

  const event = await client.submitObservabilityEvent({
    name: "workspace.opened",
    message: "Workspace opened",
    attributes: {
      mode: "read_write",
    },
  });
  assert.equal(event.sequence, 1);
  assert.equal(event.timestamp, "2026-04-27T01:00:00.000Z");
  assert.deepEqual(event.resource, {
    serviceName: "local-api",
    workspaceId,
  });
  assert.deepEqual(event.attributes, {
    mode: "read_write",
  });

  const metric = await client.submitObservabilityMetric({
    kind: "gauge",
    name: "workspace.open_handles",
    value: 3,
    unit: "count",
    attributes: {
      workspaceId,
    },
    updatedAt: "2026-04-27T01:00:30.000Z",
    redactedPaths: [],
  });
  assert.deepEqual(metric, {
    kind: "gauge",
    name: "workspace.open_handles",
    value: 3,
    unit: "count",
    attributes: {
      workspaceId,
    },
    updatedAt: "2026-04-27T01:00:30.000Z",
    redactedPaths: [],
  });

  const compactionPlan = await client.planCompaction({
    workspaceId,
    fromSequence: 1,
    toSequence: 3,
    reducerVersion: "reducer-v1",
    sourceEventCount: 3,
    sourceByteCount: 300,
    targetByteLimit: 256,
  });
  assert.equal(compactionPlan.workspaceId, workspaceId);
  assert.equal(compactionPlan.fromSequence, 1);
  assert.equal(compactionPlan.toSequence, 3);
  assert.equal(compactionPlan.reducerVersion, "reducer-v1");
  assert.equal(compactionPlan.sourceEventCount, 3);
  assert.equal(compactionPlan.compactedByteCount, 256);
  assert.equal(compactionPlan.dryRun, true);
  assert.match(compactionPlan.checkpointFingerprint, /^fnv1a64:[0-9a-f]{16}$/);
  assert.match(compactionPlan.fingerprint, /^fnv1a64:[0-9a-f]{16}$/);

  assert.deepEqual(fetch.calls.map((call) => [call.method, call.path]), [
    ["POST", "/v1/workspaces/wsp_alpha/migrations/plan"],
    ["POST", "/v1/workspaces/wsp_alpha/migrations/run"],
    ["POST", "/v1/workspaces/wsp_alpha/backups/manifests"],
    ["POST", "/v1/workspaces/wsp_restore/restores/plan"],
    ["POST", "/v1/observability/events"],
    ["POST", "/v1/observability/metrics"],
    ["POST", "/v1/workspaces/wsp_alpha/compactions/plan"],
  ]);
  assert.equal(fetch.calls[0].headers.authorization, "Bearer local-test-key");
});

test("bridges stable API HTTP errors back through the SDK", async () => {
  const router = createApiRouter();
  mountLifecycleRoutes(router, createDefaultLifecycleHandlers({
    migrationSteps: metadataMigrations(),
  }));

  const fetch = createRouterFetch(router);
  const client = new SovereignOpsClient({
    baseUrl: "https://bridge.example/v1",
    fetch,
  });

  const result = await toApiResult(client.planCompaction({
    workspaceId,
    fromSequence: 1,
    toSequence: 3,
    reducerVersion: "reducer-v1",
    sourceEventCount: 2,
  }));

  assert.equal(result.ok, false);
  assert.equal(result.error instanceof ApiHttpError, true);
  assert.equal(result.error.status, 422);
  assert.equal(result.error.apiCode, "compaction_plan_invalid");
  assert.equal(
    result.error.apiMessage,
    "Compaction sourceEventCount must match the inclusive sequence range.",
  );
  assert.deepEqual(result.error.details, {
    expectedEventCount: 3,
    sourceEventCount: 2,
  });
  assert.deepEqual(fetch.calls.map((call) => [call.method, call.path]), [
    ["POST", "/v1/workspaces/wsp_alpha/compactions/plan"],
  ]);
});

function createRouterFetch(router) {
  const calls = [];
  const fetch = async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method ?? "GET";
    const headers = { ...(init.headers ?? {}) };
    const body = init.body === undefined ? undefined : JSON.parse(init.body);
    const response = await router.dispatch({
      method,
      path: url.pathname,
      headers,
      body,
    });

    calls.push({
      method,
      path: url.pathname,
      headers,
      body,
      status: response.status,
    });

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      statusText: statusTextFor(response.status),
      headers: headersLike(response.headers),
      async text() {
        return JSON.stringify(response.body);
      },
    };
  };
  fetch.calls = calls;
  return fetch;
}

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

function sourceMetadata() {
  return {
    schemaVersion: 1,
    items: [
      {
        id: "itm_notes",
        updatedAt: "2026-04-27T00:00:00.000Z",
      },
    ],
  };
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
  if (status === 201) {
    return "Created";
  }
  if (status === 202) {
    return "Accepted";
  }
  if (status === 400) {
    return "Bad Request";
  }
  if (status === 422) {
    return "Unprocessable Content";
  }
  return "";
}
