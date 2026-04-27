import assert from "node:assert/strict";
import test from "node:test";

import {
  ApiHttpError,
  ApiRequestValidationError,
  ApiResponseValidationError,
  createSovereignOpsClient,
  toApiResult,
} from "../src/client.ts";

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

const eventResponse = Object.freeze({
  kind: "event",
  sequence: 1,
  name: "workspace.opened",
  level: "info",
  timestamp: "2026-04-27T00:11:00.000Z",
  message: "Workspace opened",
  resource: {
    serviceName: "desktop",
    serviceVersion: "0.1.0",
    workspaceId,
    attributes: {
      channel: "local",
    },
  },
  attributes: {
    mode: "read_write",
  },
  redactedPaths: [],
});

const metricResponse = Object.freeze({
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

test("plans and runs workspace migrations with typed payloads", async () => {
  const fetch = fakeFetch([
    jsonResponse(200, migrationPlan),
    jsonResponse(200, migrationRun),
  ]);
  const client = createSovereignOpsClient({
    baseUrl: "https://api.example.test/v1",
    apiKey: "test-key",
    fetch,
  });

  const planned = await client.planMigration({
    workspaceId,
    metadata: metadataV1,
    targetVersion: 2,
  });
  const run = await client.runMigration({
    workspaceId,
    metadata: metadataV1,
    targetVersion: 2,
    dryRun: false,
  });

  assert.deepEqual(planned, migrationPlan);
  assert.deepEqual(run, migrationRun);
  assert.equal(fetch.calls[0].url, "https://api.example.test/v1/workspaces/wsp_alpha/migrations/plan");
  assert.equal(fetch.calls[0].init.method, "POST");
  assert.equal(fetch.calls[0].init.headers.authorization, "Bearer test-key");
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), {
    metadata: metadataV1,
    targetVersion: 2,
  });
  assert.equal(fetch.calls[1].url, "https://api.example.test/v1/workspaces/wsp_alpha/migrations/run");
  assert.deepEqual(JSON.parse(fetch.calls[1].init.body), {
    metadata: metadataV1,
    targetVersion: 2,
    dryRun: false,
  });
});

test("submits backup manifests and creates restore plans", async () => {
  const fetch = fakeFetch([
    jsonResponse(201, backupManifest),
    jsonResponse(200, restorePlan),
  ]);
  const client = createSovereignOpsClient({
    baseUrl: "https://api.example.test/v1/",
    fetch,
  });

  const submitted = await client.submitBackupManifest({
    workspaceId,
    manifest: backupManifest,
  });
  const planned = await client.planRestore({
    targetWorkspaceId,
    manifest: backupManifest,
    mode: "preview",
    includePayloadIds: ["pay_records"],
    existingPayloadFingerprints: {
      "records/items.json": "fp_0000000000000009",
    },
  });

  assert.deepEqual(submitted, backupManifest);
  assert.deepEqual(planned, restorePlan);
  assert.equal(fetch.calls[0].url, "https://api.example.test/v1/workspaces/wsp_alpha/backups/manifests");
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), {
    manifest: backupManifest,
  });
  assert.equal(fetch.calls[1].url, "https://api.example.test/v1/workspaces/wsp_restored/restores/plan");
  assert.deepEqual(JSON.parse(fetch.calls[1].init.body), {
    manifest: backupManifest,
    mode: "preview",
    includePayloadIds: ["pay_records"],
    existingPayloadFingerprints: {
      "records/items.json": "fp_0000000000000009",
    },
  });
});

test("submits observability events and metrics", async () => {
  const fetch = fakeFetch([
    jsonResponse(202, eventResponse),
    jsonResponse(202, metricResponse),
  ]);
  const client = createSovereignOpsClient({
    baseUrl: "https://api.example.test/v1",
    fetch,
  });

  const eventInput = {
    name: "workspace.opened",
    level: "info",
    timestamp: "2026-04-27T00:11:00.000Z",
    message: "Workspace opened",
    resource: {
      serviceName: "desktop",
      serviceVersion: "0.1.0",
      workspaceId,
      attributes: {
        channel: "local",
      },
    },
    attributes: {
      mode: "read_write",
    },
  };
  const metricInput = {
    kind: "gauge",
    name: "workspace.open_handles",
    value: 3,
    unit: "count",
    attributes: {
      workspaceId,
    },
    updatedAt: "2026-04-27T00:11:01.000Z",
    redactedPaths: [],
  };

  const event = await client.submitObservabilityEvent(eventInput);
  const metric = await client.submitObservabilityMetric(metricInput);

  assert.deepEqual(event, eventResponse);
  assert.deepEqual(metric, metricResponse);
  assert.equal(fetch.calls[0].url, "https://api.example.test/v1/observability/events");
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), eventInput);
  assert.equal(fetch.calls[1].url, "https://api.example.test/v1/observability/metrics");
  assert.deepEqual(JSON.parse(fetch.calls[1].init.body), metricInput);
});

test("plans compaction requests and keeps HTTP failures typed", async () => {
  const fetch = fakeFetch([
    jsonResponse(200, compactionPlan),
    jsonResponse(422, {
      error: {
        code: "COMPACTION_PLAN_INVALID",
        message: "compaction range is invalid",
        details: { workspaceId },
      },
    }),
  ]);
  const client = createSovereignOpsClient({
    baseUrl: "https://api.example.test/v1",
    fetch,
  });

  const planned = await client.planCompaction({
    workspaceId,
    fromSequence: 10,
    toSequence: 25,
    reducerVersion: "reducer-v2",
    sourceEventCount: 16,
    targetByteLimit: 1024,
  });
  const result = await toApiResult(client.planCompaction({
    workspaceId,
    fromSequence: 30,
    toSequence: 10,
    reducerVersion: "reducer-v2",
    sourceEventCount: 16,
  }));

  assert.deepEqual(planned, compactionPlan);
  assert.equal(fetch.calls[0].url, "https://api.example.test/v1/workspaces/wsp_alpha/compactions/plan");
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), {
    fromSequence: 10,
    toSequence: 25,
    reducerVersion: "reducer-v2",
    sourceEventCount: 16,
    targetByteLimit: 1024,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error instanceof ApiRequestValidationError, true);
  assert.equal(fetch.calls.length, 1);

  const httpResult = await toApiResult(client.planCompaction({
    workspaceId,
    fromSequence: 10,
    toSequence: 30,
    reducerVersion: "reducer-v2",
    sourceEventCount: 16,
  }));

  assert.equal(httpResult.ok, false);
  assert.equal(httpResult.error instanceof ApiHttpError, true);
  assert.equal(httpResult.error.status, 422);
  assert.equal(httpResult.error.apiCode, "COMPACTION_PLAN_INVALID");
  assert.deepEqual(httpResult.error.details, { workspaceId });
});

test("validates lifecycle response shapes", async () => {
  const fetch = fakeFetch([
    jsonResponse(200, {
      ...migrationPlan,
      summary: {
        ...migrationPlan.summary,
        stepIds: [1],
      },
    }),
  ]);
  const client = createSovereignOpsClient({
    baseUrl: "https://api.example.test/v1",
    fetch,
  });

  await assert.rejects(
    client.planMigration({
      workspaceId,
      metadata: metadataV1,
      targetVersion: 2,
    }),
    (error) => {
      assert.equal(error instanceof ApiResponseValidationError, true);
      assert.equal(
        error.issues.some((issue) => issue.path === "summary.stepIds.0"),
        true,
      );
      return true;
    },
  );
});

test("validates lifecycle requests before fetch is called", async () => {
  const fetch = fakeFetch([]);
  const client = createSovereignOpsClient({
    baseUrl: "https://api.example.test/v1",
    fetch,
  });

  await assert.rejects(
    client.submitObservabilityMetric({
      ...metricResponse,
      value: Number.POSITIVE_INFINITY,
    }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(
        error.issues.map((issue) => issue.path),
        ["metric.value"],
      );
      return true;
    },
  );

  assert.equal(fetch.calls.length, 0);
});

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
  if (status === 201) {
    return "Created";
  }
  if (status === 202) {
    return "Accepted";
  }
  if (status === 422) {
    return "Unprocessable Content";
  }
  return "";
}
