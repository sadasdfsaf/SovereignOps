import assert from "node:assert/strict";
import test from "node:test";

import { createApiRouter } from "../src/router.ts";
import { createWorkspaceSessionStoreRoutes } from "../src/workspaceSessionStoreRoutes.ts";
import {
  WORKSPACE_SESSION_SNAPSHOT_REVIEW_SCHEMA_VERSION,
  createWorkspaceSessionSnapshotReviewRoutes,
  mountWorkspaceSessionSnapshotReviewRoutes,
} from "../src/workspaceSessionSnapshotReviewRoutes.ts";

const rawSecret = "sk_snapshot_review_secret_123456";
const rawPath = "C:\\Users\\DELL\\snapshot-review-secret.json";
const descriptor = {
  workspaceId: "wsp_review",
  deviceId: "dev_laptop",
  rootKeyRef: "key_review",
  createdAt: "2026-04-27T00:00:00.000Z",
  updatedAt: "2026-04-27T00:00:00.000Z",
  storagePath: "workspaces/wsp_review/session.json",
  gateway: {
    host: "localhost",
    port: 48231,
  },
};
const sessionId = "sess_review_laptop_001";
const lockToken = "lock_review_laptop_001";

test("mounts workspace session snapshot review routes with stable metadata", () => {
  const router = createApiRouter();
  const routes = createWorkspaceSessionSnapshotReviewRoutes();

  mountWorkspaceSessionSnapshotReviewRoutes(router);

  assert.equal(Object.isFrozen(routes), true);
  assert.deepEqual(
    router.listRoutes().map(routeKey),
    [
      "POST /v1/workspace-session/snapshot-review/compare",
      "POST /v1/workspace-session/snapshot-review/retention-preview",
    ],
  );
  assert.ok(
    router.listRoutes().every((route) => route.description.includes("without writing state")),
  );
});

test("compares redacted local workspace session snapshots deterministically", async () => {
  const router = createApiRouter(createWorkspaceSessionSnapshotReviewRoutes());
  const baseline = await previewSnapshot(baseEvents());
  const candidate = await previewSnapshot([...baseEvents(), unlockEvent()]);
  const body = { baseline, candidate };
  const before = structuredClone(body);

  const first = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshot-review/compare",
    body,
  });
  const second = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshot-review/compare",
    body: structuredClone(body),
  });

  assertJsonResponse(first, 200);
  assert.deepEqual(body, before);
  assert.deepEqual(second.body, first.body);
  assert.equal(first.body.kind, "workspace-session.snapshot-review.compare");
  assert.equal(first.body.schemaVersion, WORKSPACE_SESSION_SNAPSHOT_REVIEW_SCHEMA_VERSION);
  assert.equal(first.body.localOnly, true);
  assert.equal(first.body.durableWrites, false);
  assert.equal(first.body.redacted, true);
  assert.match(first.body.fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(first.body.equivalent, false);
  assert.equal(first.body.summary.workspaceMatch, true);
  assert.equal(first.body.summary.sessionMatch, true);
  assert.equal(first.body.summary.baselineEventCount, 2);
  assert.equal(first.body.summary.candidateEventCount, 3);
  assert.equal(first.body.summary.addedEventCount, 1);
  assert.equal(first.body.summary.removedEventCount, 0);
  assert.equal(first.body.summary.changedEventCount, 0);
  assert.equal(first.body.summary.addedAuditRecordCount, 1);
  assert.deepEqual(
    first.body.differences.events.added.map((event) => event.operation),
    ["unlock"],
  );
  assert.equal(JSON.stringify(first.body).includes(rawSecret), false);
  assert.equal(JSON.stringify(first.body).includes(rawPath), false);
  assert.equal(JSON.stringify(first.body).includes(lockToken), false);
  assert.equal(Object.isFrozen(first.body), true);
  assert.equal(Object.isFrozen(first.body.summary), true);
  assert.equal(Object.isFrozen(first.body.differences.events.added[0]), true);
  assert.throws(() => {
    first.body.summary.addedEventCount = 99;
  }, TypeError);
});

test("previews snapshot retention decisions without writing state", async () => {
  const router = createApiRouter(createWorkspaceSessionSnapshotReviewRoutes());
  const older = await createSnapshotRecord(
    "snapshot-review-older",
    "2026-04-27T00:00:00.000Z",
    baseEvents(),
  );
  const newer = await createSnapshotRecord(
    "snapshot-review-newer",
    "2026-04-28T00:00:00.000Z",
    [...baseEvents(), unlockEvent()],
  );
  const body = {
    snapshots: [older, newer],
    policy: {
      retainNewest: 1,
    },
  };
  const before = structuredClone(body);

  const response = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshot-review/retention-preview",
    body,
  });

  assertJsonResponse(response, 200);
  assert.deepEqual(body, before);
  assert.equal(response.body.kind, "workspace-session.snapshot-review.retention-preview");
  assert.equal(response.body.schemaVersion, WORKSPACE_SESSION_SNAPSHOT_REVIEW_SCHEMA_VERSION);
  assert.equal(response.body.localOnly, true);
  assert.equal(response.body.durableWrites, false);
  assert.equal(response.body.redacted, true);
  assert.match(response.body.fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(response.body.policy, {
    retainNewest: 1,
    retainSnapshotIds: [],
  });
  assert.deepEqual(response.body.summary, {
    totalSnapshotCount: 2,
    retainedSnapshotCount: 1,
    expiredSnapshotCount: 1,
    pinnedSnapshotCount: 0,
  });
  assert.deepEqual(
    response.body.snapshots.map((snapshot) => [
      snapshot.snapshotId,
      snapshot.newestRank,
      snapshot.plannedAction,
      snapshot.reasonCodes,
    ]),
    [
      ["snapshot-review-newer", 1, "retain", ["within-retention-policy"]],
      ["snapshot-review-older", 2, "expire", ["outside-retain-newest"]],
    ],
  );
  assert.equal(JSON.stringify(response.body).includes(rawSecret), false);
  assert.equal(JSON.stringify(response.body).includes(rawPath), false);
  assert.equal(Object.isFrozen(response.body.snapshots[0].reasonCodes), true);
});

test("returns JSON validation errors for malformed snapshot review requests", async () => {
  const router = createApiRouter(createWorkspaceSessionSnapshotReviewRoutes());

  const badCompareBody = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshot-review/compare",
    body: ["not-an-object"],
  });
  assertJsonError(badCompareBody, 400, "validation_failed");
  assert.deepEqual(badCompareBody.body.error.details, { path: "body" });

  const badRetentionBody = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshot-review/retention-preview",
    body: {
      snapshots: "not-an-array",
    },
  });
  assertJsonError(badRetentionBody, 400, "validation_failed");
  assert.deepEqual(badRetentionBody.body.error.details, { path: "body.snapshots" });
});

test("rejects raw secret and path retention at the review API boundary", async () => {
  const router = createApiRouter(createWorkspaceSessionSnapshotReviewRoutes());
  const safePreview = await previewSnapshot(baseEvents());
  const unsafePreview = structuredClone(safePreview);
  unsafePreview.auditPreview.events[0].payload.storagePath = rawPath;
  unsafePreview.auditPreview.events[0].payload.storagePathRedacted = false;

  const unsafePath = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshot-review/compare",
    body: {
      baseline: unsafePreview,
      candidate: safePreview,
    },
  });
  assertJsonError(unsafePath, 400, "validation_failed");
  assert.deepEqual(unsafePath.body.error.details, {
    path: "body.baseline.auditPreview.events.0.payload.storagePath",
    reason: "raw_local_path",
  });
  assert.equal(JSON.stringify(unsafePath.body).includes(rawPath), false);

  const unsafeRecord = await createSnapshotRecord(
    "snapshot-review-unsafe",
    "2026-04-27T00:00:00.000Z",
    baseEvents(),
  );
  unsafeRecord.metadata = {
    token: rawSecret,
  };
  const unsafeSecret = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshot-review/retention-preview",
    body: {
      snapshots: [unsafeRecord],
    },
  });
  assertJsonError(unsafeSecret, 400, "validation_failed");
  assert.deepEqual(unsafeSecret.body.error.details, {
    path: "body.snapshots.0.metadata.token",
    reason: "raw_secret",
  });
  assert.equal(JSON.stringify(unsafeSecret.body).includes(rawSecret), false);
});

async function previewSnapshot(events) {
  const router = createApiRouter(createWorkspaceSessionStoreRoutes());
  const response = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshots/preview",
    body: createSnapshotPayload(events),
  });

  assertJsonResponse(response, 200);
  return response.body;
}

async function createSnapshotRecord(snapshotId, now, events) {
  const router = createApiRouter(createWorkspaceSessionStoreRoutes({
    now: () => now,
  }));
  const response = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshots",
    body: {
      snapshotId,
      payload: createSnapshotPayload(events),
    },
  });

  assertJsonResponse(response, 201);
  return structuredClone(response.body.record);
}

function createSnapshotPayload(events) {
  return {
    descriptor,
    sessionId,
    actor: "api-worker-review",
    createdAt: "2026-04-27T00:10:00.000Z",
    events,
  };
}

function baseEvents() {
  return [
    {
      operation: "open",
      sequence: 1,
      createdAt: "2026-04-27T00:01:00.000Z",
      reason: `loaded local snapshot input from ${rawPath} with token=${rawSecret}`,
    },
    {
      operation: "lock",
      sequence: 2,
      createdAt: "2026-04-27T00:02:00.000Z",
      lockToken,
      reason: "local idle timeout",
    },
  ];
}

function unlockEvent() {
  return {
    operation: "unlock",
    sequence: 3,
    createdAt: "2026-04-27T00:03:00.000Z",
    lockToken,
    reason: "local operator returned",
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
