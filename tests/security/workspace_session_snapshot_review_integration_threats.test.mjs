import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { createApiRouter } from "../../apps/api/src/router.ts";
import {
  createInMemoryWorkspaceSessionSnapshotStore,
  createWorkspaceSessionStoreRoutes,
} from "../../apps/api/src/workspaceSessionStoreRoutes.ts";
import {
  createWorkspaceSessionSnapshotReviewRoutes,
} from "../../apps/api/src/workspaceSessionSnapshotReviewRoutes.ts";
import {
  buildWorkspaceSessionSnapshotReviewState,
} from "../../apps/web/src/workspaceSessionSnapshotReviewState.ts";
import {
  loadWorkspaceSessionSnapshotReviewFixture,
  runWorkspaceSessionSnapshotReviewCli,
} from "../../packages/cli/src/workspaceSessionSnapshotReview.ts";
import {
  compareLocalWorkspaceSessionSnapshots,
  previewLocalWorkspaceSessionSnapshotRetention,
} from "../../packages/sdk-js/src/localWorkspaceSessionSnapshotReview.ts";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));
const publicFixturePath = path.join(
  workspaceRoot,
  "examples",
  "workspace-session",
  "snapshot-review.json",
);

const timestamp = "2026-04-28T06:00:00.000Z";
const workspaceId = "wsp_snapshot_review_integration";
const deviceId = "dev_snapshot_review_integration";
const sessionId = "sess_snapshot_review_integration_001";
const rootKeyRef = "key_snapshot_review_integration";
const lockToken = "lock_snapshot_review_integration_001";
const rawWindowsPath = "C:\\Users\\DELL\\SovereignOps\\snapshot-review\\integration.json";
const rawUnixPath = "/home/operator/sovereignops/snapshot-review/integration.json";
const rawSecret = "sk-snapshot-review-integration-secret-123456";
const rawBearer = `Bearer ${rawSecret}`;
const privatePackSegment = ["sovereignops", "-codex", "-pack"].join("");
const privatePlanPackPath = path.join(
  "E:\\",
  privatePackSegment,
  privatePackSegment,
  "snapshot-review",
  "integration.json",
);

describe("workspace session snapshot review integration threat controls", () => {
  it("replays the public snapshot review fixture without private-pack or raw retention leakage", async () => {
    const fixtureText = await readFile(publicFixturePath, "utf8");
    const fixture = await loadWorkspaceSessionSnapshotReviewFixture(
      path.relative(workspaceRoot, publicFixturePath),
      { cwd: workspaceRoot },
    );

    assert.equal(fixture.schemaVersion, "workspace-session-snapshot-review/v1");
    assert.equal(fixture.records.length > 0, true);
    assertNoRawValues(fixtureText, forbiddenRawValues());
    assertNoPrivatePlanPackReferences(fixtureText);

    const compare = await runWorkspaceSessionSnapshotReviewCli(
      [
        "workspace-session",
        "snapshot-review",
        "compare",
        "--fixture",
        path.relative(workspaceRoot, publicFixturePath),
      ],
      { cwd: workspaceRoot },
    );
    const retention = await runWorkspaceSessionSnapshotReviewCli(
      [
        "workspace-session",
        "snapshot-review",
        "retention-preview",
        "--fixture",
        path.relative(workspaceRoot, publicFixturePath),
      ],
      { cwd: workspaceRoot },
    );

    assert.ok(compare);
    assert.ok(retention);
    assertCliJsonSuccess(compare, "workspace-session-snapshot-review.compare");
    assertCliJsonSuccess(retention, "workspace-session-snapshot-review.retention-preview");

    const comparePayload = JSON.parse(compare.stdout);
    const retentionPayload = JSON.parse(retention.stdout);

    assert.equal(comparePayload.retention.previewOnly, true);
    assert.equal(comparePayload.retention.writes, false);
    assert.equal(comparePayload.retention.deletes, false);
    assert.equal(retentionPayload.retention.previewOnly, true);
    assert.equal(retentionPayload.retention.writes, false);
    assert.equal(retentionPayload.retention.deletes, false);
    assert.equal(retentionPayload.retention.rawPathsOutput, false);
    assert.equal(retentionPayload.retention.lockTokensOutput, false);
    assertNoRawValues(comparePayload, forbiddenRawValues());
    assertNoRawValues(retentionPayload, forbiddenRawValues());
    assertNoRawRequestBodies(compare.stdout);
    assertNoRawRequestBodies(retention.stdout);
  });

  it("keeps API review, SDK client summaries, and UI state redacted during compare and retention preview", async () => {
    const store = createInMemoryWorkspaceSessionSnapshotStore();
    let currentNow = timestamp;
    const router = createApiRouter([
      ...createWorkspaceSessionStoreRoutes({
        now: () => currentNow,
        store,
      }),
      ...createWorkspaceSessionSnapshotReviewRoutes(),
    ]);

    const baseline = await createSnapshotRecord(router, {
      snapshotId: "snapshot-review-integration-baseline",
      label: "baseline local snapshot",
      metadata: {
        sourcePath: rawWindowsPath,
        authorization: rawBearer,
        privatePlanPackPath,
      },
      events: baseEvents(),
    });
    currentNow = "2026-04-28T06:05:00.000Z";
    const candidate = await createSnapshotRecord(router, {
      snapshotId: "snapshot-review-integration-candidate",
      label: "candidate local snapshot",
      metadata: {
        sourcePath: rawWindowsPath,
        token: rawSecret,
      },
      events: [...baseEvents(), unlockEvent()],
    });
    const beforeRetentionList = await listSnapshotIds(router);

    const compare = await router.dispatch({
      method: "POST",
      path: "/v1/workspace-session/snapshot-review/compare",
      body: {
        baseline,
        candidate,
      },
    });
    const retention = await router.dispatch({
      method: "POST",
      path: "/v1/workspace-session/snapshot-review/retention-preview",
      body: {
        snapshots: [baseline, candidate],
        policy: {
          retainNewest: 1,
          deleteBefore: "2026-04-28T05:59:00.000Z",
        },
      },
    });
    const afterRetentionList = await listSnapshotIds(router);

    assertJsonResponse(compare, 200);
    assertJsonResponse(retention, 200);
    assert.equal(compare.body.localOnly, true);
    assert.equal(compare.body.durableWrites, false);
    assert.equal(compare.body.redacted, true);
    assert.equal(retention.body.localOnly, true);
    assert.equal(retention.body.durableWrites, false);
    assert.equal(retention.body.redacted, true);
    assert.deepEqual(afterRetentionList, beforeRetentionList);
    assert.deepEqual(
      retention.body.snapshots.map((snapshot) => [
        snapshot.snapshotId,
        snapshot.plannedAction,
        snapshot.retain,
      ]),
      [
        ["snapshot-review-integration-candidate", "retain", true],
        ["snapshot-review-integration-baseline", "expire", false],
      ],
    );
    assertNoMutationFields(retention.body);

    const sdkCompare = compareLocalWorkspaceSessionSnapshots({
      baseline,
      candidate,
    });
    const sdkRetention = previewLocalWorkspaceSessionSnapshotRetention({
      records: [baseline, candidate],
      maxCount: 1,
      now: timestamp,
      maxAgeMs: 60 * 60 * 1000,
    });
    const compareState = buildWorkspaceSessionSnapshotReviewState({
      body: compare.body,
    });
    const retentionState = buildWorkspaceSessionSnapshotReviewState({
      body: retention.body,
    }, {
      kind: "retention_preview",
      defaultTimestamp: timestamp,
    });

    assert.equal(sdkCompare.localOnly, true);
    assert.equal(sdkCompare.durableWrites, false);
    assert.equal(sdkRetention.localOnly, true);
    assert.equal(sdkRetention.durableWrites, false);
    assert.equal(sdkRetention.keepCount, 1);
    assert.equal(sdkRetention.deleteCount, 1);
    assert.equal(compareState.localOnly, true);
    assert.equal(retentionState.localOnly, true);
    assertNoRawValues({
      baseline,
      candidate,
      compare: compare.body,
      retention: retention.body,
      sdkCompare,
      sdkRetention,
      compareState,
      retentionState,
    }, forbiddenRawValues());
    assertNoRawRequestBodies(JSON.stringify({
      compare: compare.body,
      retention: retention.body,
      sdkCompare,
      sdkRetention,
      compareState,
      retentionState,
    }));
  });

  it("returns JSON-only failures for unsafe API and replay inputs without echoing raw material", async () => {
    const router = createApiRouter(createWorkspaceSessionSnapshotReviewRoutes());
    const safeRecord = await buildSafeRecord("snapshot-review-integration-safe", timestamp);
    const unsafeRecord = structuredClone(safeRecord);
    unsafeRecord.metadata = {
      lockToken,
      rawPath: rawWindowsPath,
      authorization: rawBearer,
      privatePlanPackPath,
    };

    const apiFailure = await router.dispatch({
      method: "POST",
      path: "/v1/workspace-session/snapshot-review/retention-preview",
      body: {
        snapshots: [unsafeRecord],
        policy: {
          retainNewest: 1,
        },
      },
    });

    assertJsonError(apiFailure, 400, "validation_failed");
    assert.equal(apiFailure.body.error.details.path, "body.snapshots.0.metadata.lockToken");
    assert.equal(apiFailure.body.error.details.reason, "raw_secret");
    assertNoRawValues(apiFailure.body, forbiddenRawValues());
    assertNoRawRequestBodies(JSON.stringify(apiFailure.body));

    const cliFailure = await runWorkspaceSessionSnapshotReviewCli(
      [
        "workspace-session",
        "snapshot-review",
        "compare",
        "--fixture",
        privatePlanPackPath,
      ],
      { cwd: workspaceRoot },
    );

    assert.ok(cliFailure);
    assert.equal(cliFailure.exitCode, 2);
    assert.equal(cliFailure.stdout, "");
    const stderrPayload = JSON.parse(cliFailure.stderr);
    assert.deepEqual(Object.keys(stderrPayload), ["error"]);
    assert.equal(stderrPayload.error.code, "usage_error");
    assertNoRawValues(cliFailure.stderr, [
      privatePlanPackPath,
      privatePackSegment,
      rawWindowsPath,
      rawUnixPath,
      rawSecret,
      rawBearer,
      lockToken,
    ]);
  });
});

async function createSnapshotRecord(router, { snapshotId, label, metadata, events }) {
  const response = await router.dispatch({
    method: "POST",
    path: "/v1/workspace-session/snapshots",
    body: {
      snapshotId,
      label,
      metadata,
      payload: snapshotPayload(events),
    },
  });

  assertJsonResponse(response, 201);
  assertNoRawValues(response.body, forbiddenRawValues());
  return structuredClone(response.body.record);
}

async function buildSafeRecord(snapshotId, now) {
  const store = createInMemoryWorkspaceSessionSnapshotStore();
  const router = createApiRouter(createWorkspaceSessionStoreRoutes({
    now: () => now,
    store,
  }));

  return createSnapshotRecord(router, {
    snapshotId,
    label: "safe integration baseline",
    metadata: {
      channel: "local",
    },
    events: baseEvents(),
  });
}

async function listSnapshotIds(router) {
  const response = await router.dispatch({
    method: "GET",
    path: "/v1/workspace-session/snapshots",
  });

  assertJsonResponse(response, 200);
  return response.body.records.map((record) => record.snapshotId).sort();
}

function snapshotPayload(events) {
  return {
    descriptor: descriptor(),
    sessionId,
    actor: "snapshot-review-integration-worker",
    createdAt: "2026-04-28T06:01:00.000Z",
    events,
  };
}

function baseEvents() {
  return [
    {
      operation: "open",
      sequence: 1,
      cursor: "1",
      createdAt: "2026-04-28T06:01:00.000Z",
      reason: `loaded ${rawWindowsPath} authorization=${rawBearer}`,
    },
    {
      operation: "lock",
      sequence: 2,
      cursor: "2",
      createdAt: "2026-04-28T06:02:00.000Z",
      lockToken,
      reason: `locked using ${privatePlanPackPath} token=${rawSecret}`,
    },
  ];
}

function unlockEvent() {
  return {
    operation: "unlock",
    sequence: 3,
    cursor: "3",
    createdAt: "2026-04-28T06:03:00.000Z",
    lockToken,
      reason: `unlock after local check ${rawWindowsPath}`,
  };
}

function descriptor() {
  return {
    workspaceId,
    deviceId,
    rootKeyRef,
    createdAt: timestamp,
    updatedAt: "2026-04-28T06:03:00.000Z",
    storagePath: "workspaces/wsp_snapshot_review_integration/session-store.json",
    gateway: {
      transport: "stdio",
    },
  };
}

function forbiddenRawValues() {
  return [
    rawWindowsPath,
    rawUnixPath,
    privatePlanPackPath,
    privatePackSegment,
    rootKeyRef,
    lockToken,
    rawSecret,
    rawBearer,
  ];
}

function assertCliJsonSuccess(result, kind) {
  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.kind, kind);
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

function assertNoRawValues(value, rawValues) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  for (const raw of rawValues) {
    assert.equal(serialized.includes(raw), false, `leaked raw value: ${raw}`);
    assert.equal(
      serialized.includes(raw.replaceAll("\\", "\\\\")),
      false,
      `leaked escaped raw value: ${raw}`,
    );
  }
}

function assertNoPrivatePlanPackReferences(value) {
  assertNoRawValues(value, [
    privatePackSegment,
    path.join("E:\\", privatePackSegment),
    ".codex-private",
  ]);
}

function assertNoRawRequestBodies(text) {
  for (const key of [
    '"requestBody":',
    '"rawBody":',
    '"rawRequestBody":',
    '"bodySnapshot":',
    '"metadata":{"authorization"',
  ]) {
    assert.equal(text.includes(key), false, `retained raw body field ${key}`);
  }
}

function assertNoMutationFields(value) {
  const serialized = JSON.stringify(value);
  for (const key of [
    '"applied":true',
    '"dryRun":false',
    '"writes":true',
    '"deletes":true',
    '"deletedSnapshotIds"',
    '"removedSnapshotIds"',
  ]) {
    assert.equal(serialized.includes(key), false, `retention response exposed mutation field ${key}`);
  }
}
