import assert from "node:assert/strict";
import test from "node:test";

import {
  ApiHttpError,
  ApiNetworkError,
  ApiRequestValidationError,
  ApiResponseParseError,
  ApiResponseValidationError,
  toApiResult,
} from "../src/client.ts";
import {
  LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_SCHEMA_VERSION,
} from "../src/localWorkspaceSessionSnapshotRetention.ts";
import {
  createLocalWorkspaceSessionSnapshotRetentionCleanupApiClient,
  normalizeLocalWorkspaceSessionSnapshotRetentionCleanupPreviewRequest,
  previewLocalWorkspaceSessionSnapshotRetentionCleanupViaApi,
} from "../src/localWorkspaceSessionSnapshotRetentionCleanupApiClient.ts";

const fingerprint = `sha256:${"a".repeat(64)}`;
const snapshotFingerprint = `sha256:${"b".repeat(64)}`;

test("previews snapshot retention cleanup through injected fetch", async () => {
  const older = snapshotSummaryRecord({
    snapshotId: "snap-alpha-older",
    createdAt: "2026-04-26T00:00:00.000Z",
    updatedAt: "2026-04-26T00:00:00.000Z",
  });
  const newer = snapshotSummaryRecord({
    snapshotId: "snap-alpha-newer",
    createdAt: "2026-04-27T00:00:00.000Z",
    updatedAt: "2026-04-27T00:00:00.000Z",
  });
  const response = cleanupPlan({
    actions: [
      cleanupAction({
        action: "keep",
        reasons: ["within-max-count"],
        sourceIndex: 1,
        rank: 1,
        summary: cleanupSummary({
          snapshotId: "snap-alpha-newer",
          createdAt: "2026-04-27T00:00:00.000Z",
          updatedAt: "2026-04-27T00:00:00.000Z",
        }),
      }),
      cleanupAction({
        action: "delete",
        reasons: ["exceeds-max-count"],
        sourceIndex: 0,
        rank: 2,
        summary: cleanupSummary({
          snapshotId: "snap-alpha-older",
          createdAt: "2026-04-26T00:00:00.000Z",
          updatedAt: "2026-04-26T00:00:00.000Z",
        }),
      }),
    ],
    keepActions: [
      cleanupAction({
        action: "keep",
        reasons: ["within-max-count"],
        sourceIndex: 1,
        rank: 1,
        summary: cleanupSummary({
          snapshotId: "snap-alpha-newer",
          createdAt: "2026-04-27T00:00:00.000Z",
          updatedAt: "2026-04-27T00:00:00.000Z",
        }),
      }),
    ],
    deleteActions: [
      cleanupAction({
        action: "delete",
        reasons: ["exceeds-max-count"],
        sourceIndex: 0,
        rank: 2,
        summary: cleanupSummary({
          snapshotId: "snap-alpha-older",
          createdAt: "2026-04-26T00:00:00.000Z",
          updatedAt: "2026-04-26T00:00:00.000Z",
        }),
      }),
    ],
    keepCount: 1,
    deleteCount: 1,
  });
  const fetch = fakeFetch([
    jsonResponse(200, response),
  ]);
  const client = createLocalWorkspaceSessionSnapshotRetentionCleanupApiClient({
    baseUrl: "https://api.example.test/v1/",
    apiKey: "local-key",
    headers: {
      "x-local-client": "retention-cleanup-test",
    },
    fetch,
  });

  const result = await client.preview({
    records: [older, newer],
    maxCount: 1,
  });

  assert.deepEqual(result, response);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.actions[0].summary), true);
  assert.equal(fetch.calls.length, 1);
  assert.equal(
    fetch.calls[0].url,
    "https://api.example.test/v1/workspace-session/snapshot-retention-cleanup/preview",
  );
  assert.equal(fetch.calls[0].init.method, "POST");
  assert.equal(fetch.calls[0].init.headers.accept, "application/json");
  assert.equal(fetch.calls[0].init.headers.authorization, "Bearer local-key");
  assert.equal(fetch.calls[0].init.headers["x-local-client"], "retention-cleanup-test");
  assert.equal(fetch.calls[0].init.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), {
    records: [older, newer],
    maxCount: 1,
  });
  assert.throws(() => {
    result.actions[0].summary.snapshotId = "snap-mutated";
  }, TypeError);
});

test("preview helper posts the same cleanup request shape", async () => {
  const response = cleanupPlan();
  const fetch = fakeFetch([
    jsonResponse(200, response),
  ]);

  const result = await previewLocalWorkspaceSessionSnapshotRetentionCleanupViaApi({
    baseUrl: "local://api/v1",
    fetch,
  }, {
    entries: [snapshotSummaryRecord()],
  });

  assert.deepEqual(result, response);
  assert.equal(
    fetch.calls[0].url,
    "local://api/v1/workspace-session/snapshot-retention-cleanup/preview",
  );
});

test("validates cleanup preview requests before fetch is called", async () => {
  const fetch = fakeFetch([]);
  const client = createLocalWorkspaceSessionSnapshotRetentionCleanupApiClient({
    baseUrl: "local://api/v1",
    fetch,
  });
  const circular = {};
  circular.self = circular;

  await assert.rejects(
    client.preview({ entries: [], records: [] }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.equal(error.issues.some((issue) => issue.path === "request"), true);
      return true;
    },
  );

  await assert.rejects(
    client.preview({ records: [circular] }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.equal(error.issues.some((issue) => issue.path === "request.records.0.self"), true);
      return true;
    },
  );

  await assert.rejects(
    client.preview({
      files: [{
        path: "C:\\Temp\\snapshot-retention-cleanup.json",
        snapshotId: "snap-alpha-001",
      }],
    }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.equal(error.issues.some((issue) => issue.path === "request.files.0.path"), true);
      return true;
    },
  );

  await assert.rejects(
    client.preview({
      records: [{
        snapshotId: "snap-alpha-001",
        metadata: {
          token: "sk_retention_cleanup_secret_123456",
        },
      }],
    }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.equal(error.issues.some((issue) => issue.path === "request.records.0.metadata.token"), true);
      return true;
    },
  );

  await assert.rejects(
    client.preview({
      entries: [snapshotSummaryRecord()],
      maxCount: -1,
      maxAgeMs: 1.5,
      now: "2026-04-27",
    }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.equal(error.issues.some((issue) => issue.path === "request.maxCount"), true);
      assert.equal(error.issues.some((issue) => issue.path === "request.maxAgeMs"), true);
      assert.equal(error.issues.some((issue) => issue.path === "request.now"), true);
      return true;
    },
  );

  assert.equal(fetch.calls.length, 0);
});

test("keeps response validation, parse, HTTP, and network errors typed", async () => {
  const client = createLocalWorkspaceSessionSnapshotRetentionCleanupApiClient({
    baseUrl: "local://api/v1",
    fetch: fakeFetch([
      jsonResponse(200, cleanupPlan({ durableWrites: true })),
      textResponse(200, "{", { "content-type": "application/json" }),
      jsonResponse(400, {
        error: {
          code: "validation_failed",
          message: "Cleanup request was invalid.",
          details: {
            path: "body.records",
          },
        },
      }),
    ]),
  });

  await assert.rejects(
    client.preview({ records: [snapshotSummaryRecord()] }),
    (error) => {
      assert.equal(error instanceof ApiResponseValidationError, true);
      assert.equal(error.issues.some((issue) => issue.path === "durableWrites"), true);
      return true;
    },
  );

  await assert.rejects(
    client.preview({ records: [snapshotSummaryRecord()] }),
    (error) => {
      assert.equal(error instanceof ApiResponseParseError, true);
      assert.equal(error.rawBody, "{");
      return true;
    },
  );

  const httpResult = await toApiResult(client.preview({
    records: [snapshotSummaryRecord()],
  }));
  assert.equal(httpResult.ok, false);
  assert.equal(httpResult.error instanceof ApiHttpError, true);
  assert.equal(httpResult.error.status, 400);
  assert.equal(httpResult.error.apiCode, "validation_failed");
  assert.deepEqual(httpResult.error.details, { path: "body.records" });

  const networkClient = createLocalWorkspaceSessionSnapshotRetentionCleanupApiClient({
    baseUrl: "local://api/v1",
    fetch: fakeFetch([new Error("offline")]),
  });
  const networkResult = await toApiResult(networkClient.preview({
    records: [snapshotSummaryRecord()],
  }));
  assert.equal(networkResult.ok, false);
  assert.equal(networkResult.error instanceof ApiNetworkError, true);
});

test("normalizer preserves clone boundaries and returns frozen JSON", () => {
  const record = snapshotSummaryRecord({
    operations: ["open"],
  });
  const body = normalizeLocalWorkspaceSessionSnapshotRetentionCleanupPreviewRequest({
    records: [record],
    maxAgeMs: 60_000,
    now: "2026-04-27T00:00:00.000Z",
  });

  record.operations.push("lock");

  assert.deepEqual(body.records[0].operations, ["open"]);
  assert.equal(Object.isFrozen(body), true);
  assert.equal(Object.isFrozen(body.records[0].operations), true);
  assert.throws(() => {
    body.records[0].operations.push("close");
  }, TypeError);
});

function cleanupPlan(overrides = {}) {
  const actions = overrides.actions ?? [
    cleanupAction(),
  ];
  const keepActions = overrides.keepActions ?? actions.filter((action) => action.action === "keep");
  const deleteActions = overrides.deleteActions ?? actions.filter((action) => action.action === "delete");
  const reviewActions = overrides.reviewActions ?? actions.filter((action) => action.action === "review");

  return {
    kind: "localWorkspaceSessionSnapshotRetentionCleanupPlan",
    schemaVersion: LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_SCHEMA_VERSION,
    localOnly: true,
    dryRun: true,
    durableWrites: false,
    thresholds: {
      maxCount: 1,
    },
    entryCount: actions.length,
    keepCount: keepActions.length,
    deleteCount: deleteActions.length,
    reviewCount: reviewActions.length,
    actions,
    keepActions,
    deleteActions,
    reviewActions,
    ...overrides,
  };
}

function cleanupAction(overrides = {}) {
  return {
    kind: "localWorkspaceSessionSnapshotRetentionCleanupAction",
    action: "keep",
    reasons: ["within-policy"],
    sourceIndex: 0,
    rank: 1,
    summary: cleanupSummary(),
    issues: [],
    ...overrides,
  };
}

function cleanupSummary(overrides = {}) {
  return {
    kind: "localWorkspaceSessionSnapshotRetentionCleanupSummary",
    sourceKind: "snapshot-record-summary",
    auditSafe: true,
    redacted: true,
    snapshotId: "snap-alpha-001",
    workspaceId: "wsp_alpha",
    deviceId: "dev_laptop",
    sessionId: "sess_alpha",
    createdAt: "2026-04-27T00:00:00.000Z",
    updatedAt: "2026-04-27T00:00:00.000Z",
    fileRef: "[redacted:path:abc123]",
    filePathKind: "relative",
    fingerprint,
    snapshotFingerprint,
    operationCount: 1,
    ...overrides,
  };
}

function snapshotSummaryRecord(overrides = {}) {
  return {
    snapshotId: "snap-alpha-001",
    workspaceId: "wsp_alpha",
    deviceId: "dev_laptop",
    sessionId: "sess_alpha",
    createdAt: "2026-04-27T00:00:00.000Z",
    updatedAt: "2026-04-27T00:00:00.000Z",
    fingerprint,
    snapshotFingerprint,
    operations: ["open"],
    eventCount: 1,
    ...overrides,
  };
}

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
  if (status === 400) {
    return "Bad Request";
  }
  return "";
}
