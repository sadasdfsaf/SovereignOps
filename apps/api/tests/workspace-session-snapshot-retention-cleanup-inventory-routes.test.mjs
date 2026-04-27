import assert from "node:assert/strict";
import test from "node:test";

import { createApiRouter } from "../src/router.ts";
import {
  DEFAULT_WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_INVENTORY_ROUTE_BASE_PATH,
  createWorkspaceSessionSnapshotRetentionCleanupInventoryPreview,
  createWorkspaceSessionSnapshotRetentionCleanupInventoryRoutes,
  mountWorkspaceSessionSnapshotRetentionCleanupInventoryRoutes,
} from "../src/workspaceSessionSnapshotRetentionCleanupInventoryRoutes.ts";

const dayMs = 24 * 60 * 60 * 1000;
const rawSecret = "sk_inventory_cleanup_secret_123456";
const rawLockToken = "lock_inventory_cleanup_001";
const rawPath = "C:\\Users\\DELL\\snapshots\\inventory-secret.json";
const snapshotFingerprint = `sha256:${"c".repeat(64)}`;
const recordFingerprint = `sha256:${"d".repeat(64)}`;

test("mounts workspace session snapshot retention cleanup inventory preview route", () => {
  const router = createApiRouter();
  const routes = createWorkspaceSessionSnapshotRetentionCleanupInventoryRoutes();

  mountWorkspaceSessionSnapshotRetentionCleanupInventoryRoutes(router);

  assert.equal(
    DEFAULT_WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_INVENTORY_ROUTE_BASE_PATH,
    "/v1/workspace-session/snapshot-retention-cleanup/inventory",
  );
  assert.equal(Object.isFrozen(routes), true);
  assert.deepEqual(
    router.listRoutes().map(routeKey),
    ["POST /v1/workspace-session/snapshot-retention-cleanup/inventory/preview"],
  );
  assert.ok(
    router.listRoutes().every((route) => route.description.includes("without writing state")),
  );
});

test("previews file-store inventory retention cleanup through the SDK dry-run planner", async () => {
  const router = createApiRouter(createWorkspaceSessionSnapshotRetentionCleanupInventoryRoutes());
  const body = {
    inventory: {
      records: [
        inventoryRecord({
          relativePath: "snapshots/snap-old.json",
          snapshotId: "snap-old",
          createdAt: "2026-04-20T00:00:00.000Z",
        }),
        inventoryRecord({
          relativePath: "snapshots/snap-mid.json",
          snapshotId: "snap-mid",
          createdAt: "2026-04-26T00:00:00.000Z",
          updatedAt: "2026-04-26T00:00:00.000Z",
        }),
        inventoryRecord({
          relativePath: "snapshots/snap-new.json",
          snapshotId: "snap-new",
          createdAt: "2026-04-27T00:00:00.000Z",
        }),
      ],
    },
    policy: {
      maxCount: 2,
      maxAgeMs: 3 * dayMs,
      now: "2026-04-28T00:00:00.000Z",
    },
  };
  const before = structuredClone(body);

  const first = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshot-retention-cleanup/inventory/preview",
    body,
  });
  const second = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshot-retention-cleanup/inventory/preview",
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
  assert.equal(first.body.keepActions[0].summary.sourceKind, "file-metadata");
  assert.equal(first.body.keepActions[0].summary.filePathKind, "relative");
  assert.match(first.body.keepActions[0].summary.fileRef, /^\[redacted:path:[a-f0-9]{12}\]$/);
  assert.equal(JSON.stringify(first.body).includes("snapshots/snap-old.json"), false);
  assert.equal(Object.isFrozen(first.body), true);
  assert.equal(Object.isFrozen(first.body.actions), true);
  assert.throws(() => {
    first.body.actions.push(first.body.keepActions[0]);
  }, TypeError);
});

test("exposes the inventory dry-run planner as a local helper", () => {
  const plan = createWorkspaceSessionSnapshotRetentionCleanupInventoryPreview({
    inventory: [
      inventoryRecord({ snapshotId: "snap-helper-old", createdAt: "2026-04-26T00:00:00.000Z" }),
      inventoryRecord({ snapshotId: "snap-helper-new", createdAt: "2026-04-27T00:00:00.000Z" }),
    ],
    policy: {
      maxCount: 1,
    },
  });

  assert.equal(plan.localOnly, true);
  assert.equal(plan.dryRun, true);
  assert.equal(plan.durableWrites, false);
  assert.deepEqual(actionIds(plan.keepActions), ["snap-helper-new"]);
  assert.deepEqual(actionIds(plan.deleteActions), ["snap-helper-old"]);
});

test("rejects raw paths, secrets, and lock tokens without echoing values", async () => {
  const router = createApiRouter(createWorkspaceSessionSnapshotRetentionCleanupInventoryRoutes());

  const unsafePath = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshot-retention-cleanup/inventory/preview",
    body: {
      inventory: {
        records: [
          inventoryRecord({
            relativePath: rawPath,
            snapshotId: "snap-unsafe-path",
          }),
        ],
      },
      policy: {
        maxCount: 1,
      },
    },
  });
  assertJsonError(unsafePath, 400, "validation_failed");
  assert.deepEqual(unsafePath.body.error.details, {
    path: "body.inventory.records.0.relativePath",
    reason: "raw_local_path",
  });
  assert.equal(JSON.stringify(unsafePath.body).includes(rawPath), false);

  const unsafeSecret = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshot-retention-cleanup/inventory/preview",
    body: {
      inventory: [
        inventoryRecord({
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
    path: "body.inventory.0.metadata.apiToken",
    reason: "raw_secret",
  });
  assert.equal(JSON.stringify(unsafeSecret.body).includes(rawSecret), false);

  const unsafeLockToken = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshot-retention-cleanup/inventory/preview",
    body: {
      inventory: [
        inventoryRecord({
          snapshotId: "snap-unsafe-lock-token",
          lockToken: rawLockToken,
        }),
      ],
    },
  });
  assertJsonError(unsafeLockToken, 400, "validation_failed");
  assert.deepEqual(unsafeLockToken.body.error.details, {
    path: "body.inventory.0.lockToken",
    reason: "raw_lock_token",
  });
  assert.equal(JSON.stringify(unsafeLockToken.body).includes(rawLockToken), false);
});

test("returns JSON validation errors for ambiguous and malformed inventory requests", async () => {
  const router = createApiRouter(createWorkspaceSessionSnapshotRetentionCleanupInventoryRoutes());

  const badBody = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshot-retention-cleanup/inventory/preview",
    body: ["not-an-object"],
  });
  assertJsonError(badBody, 400, "validation_failed");
  assert.deepEqual(badBody.body.error.details, { path: "body" });

  const ambiguousTopLevel = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshot-retention-cleanup/inventory/preview",
    body: {
      inventory: [],
      records: [],
    },
  });
  assertJsonError(ambiguousTopLevel, 400, "validation_failed");
  assert.deepEqual(ambiguousTopLevel.body.error.details, {
    path: "body",
    reason: "ambiguous_sections",
  });

  const ambiguousInventory = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshot-retention-cleanup/inventory/preview",
    body: {
      inventory: {
        files: [],
        records: [],
      },
    },
  });
  assertJsonError(ambiguousInventory, 400, "validation_failed");
  assert.deepEqual(ambiguousInventory.body.error.details, {
    path: "body.inventory",
    reason: "ambiguous_sections",
  });

  const traversalPath = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshot-retention-cleanup/inventory/preview",
    body: {
      inventory: [
        inventoryRecord({
          relativePath: "../snapshots/snap-escape.json",
          snapshotId: "snap-escape",
        }),
      ],
    },
  });
  assertJsonError(traversalPath, 400, "validation_failed");
  assert.deepEqual(traversalPath.body.error.details, {
    path: "body.inventory.0.relativePath",
    reason: "path_traversal",
  });

  const badPolicy = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshot-retention-cleanup/inventory/preview",
    body: {
      inventory: [inventoryRecord()],
      policy: {
        maxAgeMs: dayMs,
      },
    },
  });
  assertJsonError(badPolicy, 400, "validation_failed");
  assert.deepEqual(badPolicy.body.error.details, {
    path: "body.policy.now",
    sdkCode: "LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_INVALID_RETENTION_POLICY",
  });

  const malformed = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshot-retention-cleanup/inventory/preview",
    body: {
      inventory: [
        inventoryRecord({
          createdAt: Number.NaN,
        }),
      ],
    },
  });
  assertJsonError(malformed, 400, "validation_failed");
  assert.deepEqual(malformed.body.error.details, { path: "body.inventory.0.createdAt" });
});

test("index exports workspace session snapshot retention cleanup inventory helpers", async () => {
  const api = await import("../src/index.ts");

  assert.equal(typeof api.createWorkspaceSessionSnapshotRetentionCleanupInventoryPreview, "function");
  assert.equal(typeof api.createWorkspaceSessionSnapshotRetentionCleanupInventoryRoutes, "function");
  assert.equal(typeof api.mountWorkspaceSessionSnapshotRetentionCleanupInventoryRoutes, "function");
});

function actionIds(actions) {
  return actions.map((action) => action.summary.snapshotId);
}

function inventoryRecord(overrides = {}) {
  return {
    relativePath: "snapshots/snap-alpha.json",
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
