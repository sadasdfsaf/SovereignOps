import assert from "node:assert/strict";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { createApiRouter } from "../../apps/api/src/router.ts";
import { createWorkspaceSessionAuditPreview } from "../../apps/api/src/workspaceSessionRoutes.ts";
import {
  createWorkspaceSessionStoreRoutes,
} from "../../apps/api/src/workspaceSessionStoreRoutes.ts";
import {
  buildWorkspaceSessionSnapshotState,
} from "../../apps/web/src/workspaceSessionSnapshotState.ts";
import {
  runWorkspaceSessionSnapshotStoreCli,
} from "../../packages/cli/src/workspaceSessionSnapshotStore.ts";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));
const tempDir = path.join(
  workspaceRoot,
  "tests",
  ".tmp-workspace-session-snapshot-review-threats",
);

const timestamp = "2026-04-28T05:00:00.000Z";
const workspaceId = "wsp_snapshot_review_alpha";
const deviceId = "dev_snapshot_review_laptop";
const sessionId = "sess_snapshot_review_alpha_001";
const rootKeyRef = "key_snapshot_review_alpha";
const lockToken = "lock_snapshot_review_alpha_001";
const storagePath = "workspaces/wsp_snapshot_review_alpha/session-store.json";
const rawWindowsPath = "C:\\Users\\DELL\\SovereignOps\\session-review\\snapshot.json";
const rawUnixPath = "/home/operator/sovereignops/session-review/snapshot.json";
const privatePackSegment = ["sovereignops", "-codex", "-pack"].join("");
const privatePlanPackPath = path.join(
  "E:\\",
  privatePackSegment,
  privatePackSegment,
  "session-review",
  "snapshot.json",
);
const rawSecret = "sk-local-snapshot-review-secret-123456";
const rawBearer = `Bearer ${rawSecret}`;

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("workspace session snapshot review and retention threat controls", () => {
  it("redacts snapshot inspect retention output without retaining request bodies", async () => {
    const fixturePath = await writeFixture("snapshot-review-retention.json", snapshotStoreFixture());
    const beforeEntries = await listTempEntries();

    const result = await runWorkspaceSessionSnapshotStoreCli(
      [
        "workspace-session",
        "snapshot",
        "inspect",
        "--fixture",
        path.relative(workspaceRoot, fixturePath),
      ],
      { cwd: workspaceRoot },
    );
    const afterEntries = await listTempEntries();

    assert.ok(result);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    assert.deepEqual(afterEntries, beforeEntries);

    const payload = JSON.parse(result.stdout);
    assert.equal(payload.kind, "workspace-session-snapshot-store.inspect");
    assert.equal(payload.localOnly, true);
    assert.equal(payload.retention.writes, false);
    assert.equal(payload.retention.rawBodyRetained, false);
    assert.equal(payload.retention.rawRequestBodiesRetained, false);
    assert.equal(payload.retention.requestBodiesOutput, false);
    assert.equal(payload.persistence.storage.rawPathsStored, false);
    assert.equal(payload.persistence.storage.rawLockMaterialStored, false);
    assert.match(payload.persistence.storage.path, /^\[redacted:path:[a-f0-9]{12}\]$/);
    assert.equal(payload.persistence.descriptor.rootKeyRef, "[REDACTED]");
    assert.match(payload.persistence.session.sessionRef, /^\[redacted:sessionId:[a-f0-9]{12}\]$/);
    assert.equal(payload.persistence.session.lockTokenRef, "[REDACTED]");
    assertNoRawValues(result.stdout, forbiddenRawValues());
    assertNoRawRequestBodies(result.stdout);
  });

  it("denies unsafe snapshot fixture paths without echoing private path material", async () => {
    const unsafeFixtures = [
      path.join(workspaceRoot, ".codex-private", "session-review.json"),
      path.resolve(workspaceRoot, "..", privatePackSegment, "session-review.json"),
      path.resolve(workspaceRoot, "..", "outside-workspace", "session-review.json"),
      "https://example.invalid/session-review.json",
    ];

    for (const unsafeFixture of unsafeFixtures) {
      const result = await runWorkspaceSessionSnapshotStoreCli(
        [
          "workspace-session-snapshot",
          "inspect",
          "--fixture",
          unsafeFixture,
        ],
        { cwd: workspaceRoot },
      );

      assert.ok(result);
      assert.equal(result.exitCode, 2, unsafeFixture);
      assert.equal(result.stdout, "");
      const payload = JSON.parse(result.stderr);
      assert.equal(payload.error.code, "usage_error", unsafeFixture);
      assertNoRawValues(result.stderr, [
        privatePackSegment,
        path.join("E:\\", privatePackSegment),
        ".codex-private",
        unsafeFixture,
      ]);
    }
  });

  it("rejects API-like snapshot preview payloads that retain raw paths, lock material, or bodies", async () => {
    const router = createApiRouter(createWorkspaceSessionStoreRoutes({
      now: () => timestamp,
    }));
    const cases = [
      {
        name: "summary storage path",
        path: "body.summary.storage.storagePath",
        mutate(preview) {
          preview.summary.storage.storagePath = rawUnixPath;
          preview.summary.storage.storagePathRedacted = false;
        },
      },
      {
        name: "event lock token",
        path: "body.events.1.payload.lock.lockTokenRef",
        mutate(preview) {
          preview.events[1].payload.lock.lockTokenRef = lockToken;
        },
      },
      {
        name: "audit record lock token",
        path: "body.audit.records.1.details.lock.lockTokenRef",
        mutate(preview) {
          preview.audit.records[1].details.lock.lockTokenRef = lockToken;
        },
      },
      {
        name: "request body retention",
        path: "body.requestBody",
        mutate(preview) {
          preview.requestBody = {
            rootKeyRef,
            sessionId,
            lockToken,
            authorization: rawBearer,
            windowsPath: rawWindowsPath,
            unixPath: rawUnixPath,
            privatePlanPackPath,
          };
        },
      },
    ];

    for (const testCase of cases) {
      const preview = validAuditPreview();
      testCase.mutate(preview);

      const response = await router.dispatch({
        method: "POST",
        path: "/v1/workspace-session/snapshots/preview",
        body: { auditPreview: preview },
      });

      assertJsonError(response, 400, "validation_failed", testCase.name);
      assert.equal(response.body.error.details.path, testCase.path, testCase.name);
      assertNoRawValues(response.body, forbiddenRawValues());
      assertNoRawRequestBodies(JSON.stringify(response.body));
    }
  });

  it("previews snapshot retention without store writes or deletes", async () => {
    const effects = [];
    const router = createApiRouter(createWorkspaceSessionStoreRoutes({
      now: () => timestamp,
      store: {
        create(record) {
          effects.push(["create", record.snapshotId]);
          return { ok: true, record };
        },
        get(snapshotId) {
          effects.push(["get", snapshotId]);
          return undefined;
        },
        list() {
          effects.push(["list"]);
          return [];
        },
      },
    }));

    const response = await router.dispatch({
      method: "POST",
      path: "/v1/workspace-session/snapshots/preview",
      body: snapshotPayload(),
    });

    assertJsonResponse(response, 200);
    assert.deepEqual(effects, []);
    assert.equal(response.body.localOnly, true);
    assert.equal(response.body.durableWrites, false);
    assert.equal(response.body.redacted, true);
    assertNoRawValues(response.body, [
      rawWindowsPath,
      rawUnixPath,
      privatePlanPackPath,
      privatePackSegment,
      rootKeyRef,
      lockToken,
      rawSecret,
      rawBearer,
    ]);
    assertNoRawRequestBodies(JSON.stringify(response.body));
  });

  it("builds comparison and retention state without leaking raw threat inputs", () => {
    const state = buildWorkspaceSessionSnapshotState({
      kind: "workspace-session.snapshot-record.list",
      schemaVersion: "workspace-session-store/v1",
      localOnly: true,
      durableWrites: false,
      redacted: true,
      retention: {
        writes: false,
        deletes: false,
        rawRequestBodiesRetained: false,
        requestBody: {
          rootKeyRef,
          sessionId,
          lockToken,
          authorization: rawBearer,
          windowsPath: rawWindowsPath,
          unixPath: rawUnixPath,
          privatePlanPackPath,
        },
      },
      pagination: {
        offset: 0,
        limit: 10,
        totalRecordCount: 1,
        matchedRecordCount: 1,
        returnedRecordCount: 1,
        hasMore: false,
      },
      records: [
        {
          snapshotId: "snapshot-review-alpha",
          label: `review ${rawWindowsPath}`,
          createdAt: timestamp,
          updatedAt: "2026-04-28T05:01:00.000Z",
          fingerprint: `sha256:${"a".repeat(64)}`,
          snapshotFingerprint: `sha256:${"b".repeat(64)}`,
          workspaceId,
          deviceId,
          sessionId: "[redacted:sessionId:snapshotreview001]",
          operations: ["open", "lock"],
          eventCount: 2,
          auditRecordCount: 2,
          localOnly: true,
          redacted: true,
          durableWrites: false,
          rawPathsStored: true,
          rawRequestBodyStored: true,
          metadata: {
            rootKeyRef,
            lockToken,
            sessionId,
            privatePlanPackPath,
          },
          requestBody: {
            authorization: rawBearer,
            windowsPath: rawWindowsPath,
            unixPath: rawUnixPath,
          },
        },
      ],
    }, {
      call: "list",
      defaultTimestamp: timestamp,
    });

    assert.equal(state.call, "list");
    assert.equal(state.rawBodyRetained, false);
    assert.equal(state.rawRetentionRisk, true);
    assert.ok(state.rawRetentionRiskCount > 0);
    assert.equal(state.recordRows[0].rawBodyRetained, false);
    assert.equal(state.recordRows[0].rawRetentionRisk, true);
    assert.equal(state.recordRows[0].label, "[REDACTED]");
    assert.equal(
      state.readinessIndicators.find((indicator) => indicator.kind === "raw_retention")?.status,
      "blocked",
    );
    assert.equal(
      state.summaryCards.find((card) => card.id === "workspace_session_snapshot.summary.retention")?.status,
      "blocked",
    );
    assertNoRawValues(state, forbiddenRawValues());
    assertNoRawRequestBodies(JSON.stringify(state));
  });
});

async function writeFixture(name, value) {
  await mkdir(tempDir, { recursive: true });
  const outputPath = path.join(tempDir, name);
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return outputPath;
}

async function listTempEntries() {
  return (await readdir(tempDir)).sort();
}

function snapshotStoreFixture() {
  const auditPreview = validAuditPreview();
  const summary = structuredClone(auditPreview.summary);
  summary.storage.storagePath = rawWindowsPath;
  summary.gateway = {
    ...summary.gateway,
    diagnosticPath: privatePlanPackPath,
    privatePlanPackPath,
  };
  const fixtureDescriptor = {
    ...descriptor(),
    storagePath: rawWindowsPath,
    gateway: {
      transport: "stdio",
      diagnosticPath: privatePlanPackPath,
    },
  };

  return {
    schemaVersion: "workspace-session-persistence/v1",
    kind: "workspace-session.session-store",
    generatedAt: timestamp,
    localOnly: true,
    durable: true,
    network: {
      mode: "disabled",
      allowedUriPrefixes: ["local://", "workspace://"],
    },
    storage: {
      path: rawWindowsPath,
      format: "atomic-json",
      pathRedactedInResponses: true,
      rawPathsStored: false,
      rawLockMaterialStored: false,
    },
    descriptor: fixtureDescriptor,
    session: {
      sessionId,
      state: "locked",
      operations: ["open", "lock"],
      lastCursor: "2",
      snapshotVersion: 7,
      openedAt: "2026-04-28T05:00:30.000Z",
      lockedAt: "2026-04-28T05:01:00.000Z",
      lockTokenRef: lockToken,
    },
    routes: {
      summary: {
        method: "POST",
        path: "/v1/workspace-session/summary",
        requestBody: retainedRequestBody(),
        responseStatus: 200,
        responseBody: summary,
      },
      auditPreview: {
        method: "POST",
        path: "/v1/workspace-session/audit-preview",
        requestBody: retainedRequestBody(),
        responseStatus: 200,
        responseBody: auditPreview,
      },
    },
    validationCommands: [
      `node scripts/validate.js --input "${privatePlanPackPath}"`,
      `node scripts/validate.js --session "${sessionId}"`,
    ],
  };
}

function retainedRequestBody() {
  return {
    descriptor: descriptor(),
    sessionId,
    lockToken,
    authorization: rawBearer,
    windowsPath: rawWindowsPath,
    unixPath: rawUnixPath,
    privatePlanPackPath,
    bodySnapshot: {
      rootKeyRef,
      rawSecret,
    },
  };
}

function validAuditPreview() {
  return structuredClone(createWorkspaceSessionAuditPreview(snapshotPayload()));
}

function snapshotPayload() {
  return {
    descriptor: descriptor(),
    sessionId,
    actor: "snapshot-review-worker",
    createdAt: "2026-04-28T05:02:00.000Z",
    events: [
      {
        operation: "open",
        sequence: 1,
        cursor: "1",
        createdAt: "2026-04-28T05:00:30.000Z",
        reason: `loaded ${rawWindowsPath} with token=${rawSecret}`,
      },
      {
        operation: "lock",
        sequence: 2,
        cursor: "2",
        createdAt: "2026-04-28T05:01:00.000Z",
        lockToken,
        reason: `sealed ${rawWindowsPath}`,
      },
    ],
  };
}

function descriptor() {
  return {
    workspaceId,
    deviceId,
    rootKeyRef,
    createdAt: timestamp,
    updatedAt: "2026-04-28T05:01:00.000Z",
    storagePath,
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
    sessionId,
    rawSecret,
    rawBearer,
  ];
}

function assertJsonResponse(response, status) {
  assert.equal(response.status, status);
  assert.match(response.headers["content-type"], /^application\/json/);
}

function assertJsonError(response, status, code, label) {
  assertJsonResponse(response, status);
  assert.deepEqual(Object.keys(response.body), ["error"], label);
  assert.equal(response.body.error.code, code, label);
  assert.equal(typeof response.body.error.message, "string", label);
  assert.ok(response.body.error.message.length > 0, label);
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

function assertNoRawRequestBodies(text) {
  for (const key of [
    '"requestBody":',
    '"rawBody":',
    '"rawRequestBody":',
    '"bodySnapshot":',
    '"metadata":',
  ]) {
    assert.equal(text.includes(key), false, `retained raw body field ${key}`);
  }
}
