import assert from "node:assert/strict";
import test from "node:test";

import { createApiRouter } from "../src/router.ts";
import {
  DEFAULT_WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_ROUTE_BASE_PATH,
  createWorkspaceSessionSnapshotRetentionCleanupPreview,
  createWorkspaceSessionSnapshotRetentionCleanupRoutes,
  mountWorkspaceSessionSnapshotRetentionCleanupRoutes,
} from "../src/workspaceSessionSnapshotRetentionCleanupRoutes.ts";

const dayMs = 24 * 60 * 60 * 1000;
const rawSecret = "sk_retention_cleanup_secret_123456";
const rawLockToken = "lock_retention_cleanup_001";
const rawPath = "C:\\Users\\DELL\\snapshots\\retention-secret.json";
const snapshotFingerprint = `sha256:${"a".repeat(64)}`;
const recordFingerprint = `sha256:${"b".repeat(64)}`;

test("mounts workspace session snapshot retention cleanup preview route", () => {
  const router = createApiRouter();
  const routes = createWorkspaceSessionSnapshotRetentionCleanupRoutes();

  mountWorkspaceSessionSnapshotRetentionCleanupRoutes(router);

  assert.equal(
    DEFAULT_WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_ROUTE_BASE_PATH,
    "/v1/workspace-session/snapshot-retention-cleanup",
  );
  assert.equal(Object.isFrozen(routes), true);
  assert.deepEqual(
    router.listRoutes().map(routeKey),
    ["POST /v1/workspace-session/snapshot-retention-cleanup/preview"],
  );
  assert.ok(
    router.listRoutes().every((route) => route.description.includes("without writing state")),
  );
});

test("previews SDK retention cleanup dry-run plans without durable writes", async () => {
  const router = createApiRouter(createWorkspaceSessionSnapshotRetentionCleanupRoutes());
  const body = {
    entries: [
      fileMetadata({
        path: "snapshots/snap-old.json",
        snapshotId: "snap-old",
        createdAt: "2026-04-20T00:00:00.000Z",
      }),
      snapshotRecord({
        snapshotId: "snap-mid",
        createdAt: "2026-04-26T00:00:00.000Z",
        updatedAt: "2026-04-26T00:00:00.000Z",
      }),
      fileMetadata({
        path: "snapshots/snap-new.json",
        snapshotId: "snap-new",
        createdAt: "2026-04-27T00:00:00.000Z",
      }),
    ],
    maxCount: 2,
    maxAgeMs: 3 * dayMs,
    now: "2026-04-28T00:00:00.000Z",
  };
  const before = structuredClone(body);

  const first = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshot-retention-cleanup/preview",
    body,
  });
  const second = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshot-retention-cleanup/preview",
    body: structuredClone(body),
  });

  assertJsonResponse(first, 200);
  assert.deepEqual(body, before);
  assert.deepEqual(second.body, first.body);
  assert.equal(first.body.kind, "localWorkspaceSessionSnapshotRetentionCleanupPlan");
  assert.equal(first.body.localOnly, true);
  assert.equal(first.body.dryRun, true);
  assert.equal(first.body.durableWrites, false);
  assert.equal(first.body.thresholds.cutoffAt, "2026-04-25T00:00:00.000Z");
  assert.equal(first.body.entryCount, 3);
  assert.equal(first.body.keepCount, 2);
  assert.equal(first.body.deleteCount, 1);
  assert.equal(first.body.reviewCount, 0);
  assert.deepEqual(actionIds(first.body.keepActions), ["snap-new", "snap-mid"]);
  assert.deepEqual(actionIds(first.body.deleteActions), ["snap-old"]);
  assert.deepEqual(first.body.deleteActions[0].reasons, [
    "exceeds-max-count",
    "exceeds-max-age",
  ]);
  assert.match(first.body.keepActions[0].summary.fileRef, /^\[redacted:path:[a-f0-9]{12}\]$/);
  assert.equal(JSON.stringify(first.body).includes("snapshots/snap-old.json"), false);
  assert.equal(Object.isFrozen(first.body), true);
  assert.equal(Object.isFrozen(first.body.actions), true);
  assert.throws(() => {
    first.body.actions.push(first.body.keepActions[0]);
  }, TypeError);
});

test("exposes the SDK dry-run planner as a local helper", () => {
  const plan = createWorkspaceSessionSnapshotRetentionCleanupPreview({
    records: [
      snapshotRecord({ snapshotId: "snap-helper-old", createdAt: "2026-04-26T00:00:00.000Z" }),
      snapshotRecord({ snapshotId: "snap-helper-new", createdAt: "2026-04-27T00:00:00.000Z" }),
    ],
    maxCount: 1,
  });

  assert.equal(plan.localOnly, true);
  assert.equal(plan.dryRun, true);
  assert.equal(plan.durableWrites, false);
  assert.deepEqual(actionIds(plan.keepActions), ["snap-helper-new"]);
  assert.deepEqual(actionIds(plan.deleteActions), ["snap-helper-old"]);
});

test("rejects raw local paths, secrets, and lock tokens without echoing values", async () => {
  const router = createApiRouter(createWorkspaceSessionSnapshotRetentionCleanupRoutes());

  const unsafePath = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshot-retention-cleanup/preview",
    body: {
      files: [
        fileMetadata({
          path: rawPath,
          snapshotId: "snap-unsafe-path",
        }),
      ],
      maxCount: 1,
    },
  });
  assertJsonError(unsafePath, 400, "validation_failed");
  assert.deepEqual(unsafePath.body.error.details, {
    path: "body.files.0.path",
    reason: "raw_local_path",
  });
  assert.equal(JSON.stringify(unsafePath.body).includes(rawPath), false);

  const unsafeSecret = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshot-retention-cleanup/preview",
    body: {
      records: [
        snapshotRecord({
          snapshotId: "snap-unsafe-secret",
          metadata: {
            apiToken: rawSecret,
          },
        }),
      ],
    },
  });
  assertJsonError(unsafeSecret, 400, "validation_failed");
  assert.deepEqual(unsafeSecret.body.error.details, {
    path: "body.records.0.metadata.apiToken",
    reason: "raw_secret",
  });
  assert.equal(JSON.stringify(unsafeSecret.body).includes(rawSecret), false);

  const unsafeLockToken = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshot-retention-cleanup/preview",
    body: {
      entries: [
        fileMetadata({
          snapshotId: "snap-unsafe-lock-token",
          lockToken: rawLockToken,
        }),
      ],
    },
  });
  assertJsonError(unsafeLockToken, 400, "validation_failed");
  assert.deepEqual(unsafeLockToken.body.error.details, {
    path: "body.entries.0.lockToken",
    reason: "raw_lock_token",
  });
  assert.equal(JSON.stringify(unsafeLockToken.body).includes(rawLockToken), false);
});

test("returns JSON validation errors for malformed cleanup requests", async () => {
  const router = createApiRouter(createWorkspaceSessionSnapshotRetentionCleanupRoutes());

  const badBody = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshot-retention-cleanup/preview",
    body: ["not-an-object"],
  });
  assertJsonError(badBody, 400, "validation_failed");
  assert.deepEqual(badBody.body.error.details, { path: "body" });

  const missingEntries = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshot-retention-cleanup/preview",
    body: {
      maxCount: 1,
    },
  });
  assertJsonError(missingEntries, 400, "validation_failed");
  assert.deepEqual(missingEntries.body.error.details, { path: "body" });

  const badPolicy = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshot-retention-cleanup/preview",
    body: {
      records: [snapshotRecord()],
      maxAgeMs: dayMs,
    },
  });
  assertJsonError(badPolicy, 400, "validation_failed");
  assert.deepEqual(badPolicy.body.error.details, {
    path: "body.now",
    sdkCode: "LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_INVALID_RETENTION_POLICY",
  });
});

function actionIds(actions) {
  return actions.map((action) => action.summary.snapshotId);
}

function fileMetadata(overrides = {}) {
  return {
    path: "snapshots/snap-alpha.json",
    snapshotId: "snap-alpha",
    workspaceId: "wsp_alpha",
    deviceId: "dev_laptop",
    sessionId: "sess_alpha_laptop_001",
    label: "local-baseline",
    createdAt: "2026-04-27T00:00:00.000Z",
    updatedAt: "2026-04-27T00:00:00.000Z",
    sizeBytes: 512,
    fingerprint: recordFingerprint,
    snapshotFingerprint,
    eventCount: 1,
    ...overrides,
  };
}

function snapshotRecord(overrides = {}) {
  const snapshot = snapshotPreview();
  return {
    kind: "workspace-session.snapshot-record",
    schemaVersion: "workspace-session-store/v1",
    localOnly: true,
    durableWrites: false,
    redacted: true,
    snapshotId: "snap-alpha",
    label: "local-baseline",
    metadata: {
      workflowId: "workspace-session",
    },
    createdAt: "2026-04-27T00:00:00.000Z",
    updatedAt: "2026-04-27T00:00:00.000Z",
    fingerprint: recordFingerprint,
    snapshotFingerprint: snapshot.fingerprint,
    snapshot,
    ...overrides,
  };
}

function snapshotPreview(overrides = {}) {
  return {
    kind: "workspace-session.snapshot-preview",
    schemaVersion: "workspace-session-store/v1",
    apiSchemaVersion: "workspace-session-api/v1",
    localOnly: true,
    durableWrites: false,
    redacted: true,
    fingerprint: snapshotFingerprint,
    summary: {
      kind: "workspace-session.snapshot-summary",
      localOnly: true,
      redacted: true,
      workspaceId: "wsp_alpha",
      deviceId: "dev_laptop",
      sessionId: "sess_alpha_laptop_001",
      operations: ["open"],
      eventCount: 1,
      eventIds: ["evt_wsp_alpha_open_00000001"],
      auditRecordCount: 1,
      auditIds: ["aud_wsp_alpha_open_00000001"],
      auditActions: ["workspace.session.opened"],
    },
    auditPreview: {
      kind: "workspace-session.audit-preview",
      schemaVersion: "workspace-session-api/v1",
      localOnly: true,
      durableWrites: false,
      summary: {
        kind: "workspace-session.summary",
        localOnly: true,
        durableWrites: false,
        workspaceId: "wsp_alpha",
        deviceId: "dev_laptop",
      },
      events: [],
      audit: {
        kind: "workspace-session.audit-preview.records",
        localOnly: true,
        redacted: true,
        recordCount: 0,
        records: [],
      },
    },
    ...overrides,
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
