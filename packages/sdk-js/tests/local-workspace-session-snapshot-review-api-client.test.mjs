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
  WORKSPACE_SESSION_API_SCHEMA_VERSION,
} from "../src/localWorkspaceSessionApiClient.ts";
import {
  WORKSPACE_SESSION_SNAPSHOT_API_SCHEMA_VERSION,
} from "../src/localWorkspaceSessionSnapshotApiClient.ts";
import {
  WORKSPACE_SESSION_SNAPSHOT_REVIEW_API_SCHEMA_VERSION,
  createLocalWorkspaceSessionSnapshotReviewApiClient,
  normalizeLocalWorkspaceSessionSnapshotReviewCompareRequest,
  normalizeLocalWorkspaceSessionSnapshotReviewRetentionPreviewRequest,
} from "../src/localWorkspaceSessionSnapshotReviewApiClient.ts";

const sessionId = "sess_alpha_laptop_001";
const redactedStoragePath = "[redacted:path:abc1234]";
const snapshotFingerprint = `sha256:${"a".repeat(64)}`;
const recordFingerprint = `sha256:${"b".repeat(64)}`;
const reviewFingerprint = `sha256:${"c".repeat(64)}`;

test("compares snapshots through injected fetch with stable request shape", async () => {
  const baseline = snapshotPreviewResponse();
  const candidate = snapshotPreviewResponse({
    fingerprint: `sha256:${"d".repeat(64)}`,
  });
  const response = compareResponse({
    candidate: boundarySummary({
      fingerprint: candidate.fingerprint,
      eventCount: 2,
      operations: ["open", "lock"],
      auditRecordCount: 2,
      auditActions: ["workspace.session.opened", "workspace.session.locked"],
    }),
    summary: {
      ...compareSummary(),
      fingerprintMatch: false,
      candidateEventCount: 2,
      addedEventCount: 1,
      candidateAuditRecordCount: 2,
      addedAuditRecordCount: 1,
    },
    differences: {
      events: {
        added: [comparableEvent({ operation: "lock", sequence: 2 })],
        removed: [],
        changed: [],
      },
      auditRecords: {
        added: [comparableAuditRecord({ action: "workspace.session.locked" })],
        removed: [],
        changed: [],
      },
    },
  });
  const fetch = fakeFetch([
    jsonResponse(200, response),
  ]);
  const client = createLocalWorkspaceSessionSnapshotReviewApiClient({
    baseUrl: "https://api.example.test/v1/",
    apiKey: "local-key",
    headers: {
      "x-local-client": "snapshot-review-test",
    },
    fetch,
  });

  const result = await client.compare({ baseline, candidate });

  assert.deepEqual(result, response);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.differences.events.added[0]), true);
  assert.equal(fetch.calls.length, 1);
  assert.equal(
    fetch.calls[0].url,
    "https://api.example.test/v1/workspace-session/snapshot-review/compare",
  );
  assert.equal(fetch.calls[0].init.method, "POST");
  assert.equal(fetch.calls[0].init.headers.accept, "application/json");
  assert.equal(fetch.calls[0].init.headers.authorization, "Bearer local-key");
  assert.equal(fetch.calls[0].init.headers["x-local-client"], "snapshot-review-test");
  assert.equal(fetch.calls[0].init.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), { baseline, candidate });
  assert.throws(() => {
    result.summary.addedEventCount = 99;
  }, TypeError);
});

test("previews retention through injected fetch and returns immutable decisions", async () => {
  const older = snapshotRecord({
    snapshotId: "snap-alpha-older",
    createdAt: "2026-04-26T00:00:00.000Z",
    updatedAt: "2026-04-26T00:00:00.000Z",
    fingerprint: `sha256:${"d".repeat(64)}`,
  });
  const newer = snapshotRecord({
    snapshotId: "snap-alpha-newer",
    createdAt: "2026-04-27T00:00:00.000Z",
    updatedAt: "2026-04-27T00:00:00.000Z",
    fingerprint: `sha256:${"e".repeat(64)}`,
  });
  const response = retentionPreviewResponse({
    snapshots: [
      retentionDecision({
        snapshotId: "snap-alpha-newer",
        fingerprint: newer.fingerprint,
        createdAt: newer.createdAt,
        updatedAt: newer.updatedAt,
        newestRank: 1,
        retain: true,
        plannedAction: "retain",
        reasonCodes: ["within-retention-policy"],
      }),
      retentionDecision({
        snapshotId: "snap-alpha-older",
        fingerprint: older.fingerprint,
        createdAt: older.createdAt,
        updatedAt: older.updatedAt,
        newestRank: 2,
        retain: false,
        plannedAction: "expire",
        reasonCodes: ["outside-retain-newest"],
      }),
    ],
  });
  const fetch = fakeFetch([
    jsonResponse(200, response),
  ]);
  const client = createLocalWorkspaceSessionSnapshotReviewApiClient({
    baseUrl: "local://api/v1",
    fetch,
  });

  const result = await client.retentionPreview({
    snapshots: [older, newer],
    policy: {
      retainNewest: 1,
    },
  });

  assert.deepEqual(result, response);
  assert.equal(
    fetch.calls[0].url,
    "local://api/v1/workspace-session/snapshot-review/retention-preview",
  );
  assert.equal(fetch.calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), {
    snapshots: [older, newer],
    policy: {
      retainNewest: 1,
    },
  });
  assert.equal(Object.isFrozen(result.snapshots[0].reasonCodes), true);
  assert.throws(() => {
    result.snapshots[0].reasonCodes.push("changed");
  }, TypeError);
});

test("validates snapshot review requests before fetch is called", async () => {
  const fetch = fakeFetch([]);
  const client = createLocalWorkspaceSessionSnapshotReviewApiClient({
    baseUrl: "local://api/v1",
    fetch,
  });
  const circular = {};
  circular.self = circular;
  const unsafePath = snapshotPreviewResponse({
    auditPreview: auditPreviewResponse({
      events: [previewEventFixture({
        payload: {
          ...previewEventFixture().payload,
          storagePath: "C:\\Users\\DELL\\snapshot-review-secret.json",
        },
      })],
    }),
  });
  const unsafeSecret = snapshotRecord({
    metadata: {
      token: "sk_snapshot_review_secret_123456",
    },
  });

  await assert.rejects(
    client.compare({ baseline: circular, candidate: snapshotPreviewResponse() }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.equal(error.issues.some((issue) => issue.path === "request.baseline.self"), true);
      return true;
    },
  );

  await assert.rejects(
    client.compare({ baseline: unsafePath, candidate: snapshotPreviewResponse() }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.equal(
        error.issues.some((issue) =>
          issue.path === "request.baseline.auditPreview.events.0.payload.storagePath"
        ),
        true,
      );
      return true;
    },
  );

  await assert.rejects(
    client.retentionPreview({
      snapshots: [snapshotRecord(), snapshotRecord()],
      policy: {
        retainNewest: 501,
        retainSnapshotIds: ["bad/id"],
        deleteBefore: "not-a-timestamp",
      },
    }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.equal(error.issues.some((issue) => issue.path === "request.snapshots.1.snapshotId"), true);
      assert.equal(error.issues.some((issue) => issue.path === "request.policy.retainNewest"), true);
      assert.equal(error.issues.some((issue) => issue.path === "request.policy.retainSnapshotIds.0"), true);
      assert.equal(error.issues.some((issue) => issue.path === "request.policy.deleteBefore"), true);
      return true;
    },
  );

  await assert.rejects(
    client.retentionPreview({ snapshots: [unsafeSecret] }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.equal(error.issues.some((issue) => issue.path === "request.snapshots.0.metadata.token"), true);
      return true;
    },
  );

  assert.equal(fetch.calls.length, 0);
});

test("keeps response validation, parse, HTTP, and network errors typed", async () => {
  const client = createLocalWorkspaceSessionSnapshotReviewApiClient({
    baseUrl: "local://api/v1",
    fetch: fakeFetch([
      jsonResponse(200, compareResponse({ redacted: false })),
      textResponse(200, "{", { "content-type": "application/json" }),
      jsonResponse(400, {
        error: {
          code: "validation_failed",
          message: "Snapshot review request was invalid.",
          details: {
            path: "body.baseline",
          },
        },
      }),
    ]),
  });

  await assert.rejects(
    client.compare({
      baseline: snapshotPreviewResponse(),
      candidate: snapshotPreviewResponse(),
    }),
    (error) => {
      assert.equal(error instanceof ApiResponseValidationError, true);
      assert.equal(error.issues.some((issue) => issue.path === "redacted"), true);
      return true;
    },
  );

  await assert.rejects(
    client.retentionPreview({ snapshots: [snapshotRecord()] }),
    (error) => {
      assert.equal(error instanceof ApiResponseParseError, true);
      assert.equal(error.rawBody, "{");
      return true;
    },
  );

  const httpResult = await toApiResult(client.compare({
    baseline: snapshotPreviewResponse(),
    candidate: snapshotPreviewResponse(),
  }));
  assert.equal(httpResult.ok, false);
  assert.equal(httpResult.error instanceof ApiHttpError, true);
  assert.equal(httpResult.error.status, 400);
  assert.equal(httpResult.error.apiCode, "validation_failed");
  assert.deepEqual(httpResult.error.details, { path: "body.baseline" });

  const networkClient = createLocalWorkspaceSessionSnapshotReviewApiClient({
    baseUrl: "local://api/v1",
    fetch: fakeFetch([new Error("offline")]),
  });
  const networkResult = await toApiResult(networkClient.retentionPreview({
    snapshots: [snapshotRecord()],
  }));
  assert.equal(networkResult.ok, false);
  assert.equal(networkResult.error instanceof ApiNetworkError, true);
});

test("normalizers preserve clone boundaries and return frozen JSON", () => {
  const baseline = snapshotPreviewResponse();
  const candidate = snapshotPreviewResponse();
  const compareBody = normalizeLocalWorkspaceSessionSnapshotReviewCompareRequest({
    baseline,
    candidate,
  });
  const retentionBody = normalizeLocalWorkspaceSessionSnapshotReviewRetentionPreviewRequest({
    snapshots: [snapshotRecord()],
    policy: {
      retainSnapshotIds: ["snap-alpha-001"],
    },
  });

  baseline.summary.operations.push("lock");

  assert.deepEqual(compareBody.baseline.summary.operations, ["open"]);
  assert.equal(Object.isFrozen(compareBody.baseline.summary.operations), true);
  assert.deepEqual(retentionBody.policy.retainSnapshotIds, ["snap-alpha-001"]);
  assert.equal(Object.isFrozen(retentionBody.snapshots[0].snapshot.auditPreview.audit.records), true);
  assert.throws(() => {
    retentionBody.policy.retainSnapshotIds.push("snap-alpha-002");
  }, TypeError);
});

function compareResponse(overrides = {}) {
  return {
    kind: "workspace-session.snapshot-review.compare",
    schemaVersion: WORKSPACE_SESSION_SNAPSHOT_REVIEW_API_SCHEMA_VERSION,
    storeSchemaVersion: WORKSPACE_SESSION_SNAPSHOT_API_SCHEMA_VERSION,
    apiSchemaVersion: WORKSPACE_SESSION_API_SCHEMA_VERSION,
    localOnly: true,
    durableWrites: false,
    redacted: true,
    fingerprint: reviewFingerprint,
    equivalent: true,
    baseline: boundarySummary(),
    candidate: boundarySummary(),
    summary: compareSummary(),
    differences: {
      events: {
        added: [],
        removed: [],
        changed: [],
      },
      auditRecords: {
        added: [],
        removed: [],
        changed: [],
      },
    },
    ...overrides,
  };
}

function compareSummary() {
  return {
    fingerprintMatch: true,
    workspaceMatch: true,
    deviceMatch: true,
    sessionMatch: true,
    baselineEventCount: 1,
    candidateEventCount: 1,
    unchangedEventCount: 1,
    addedEventCount: 0,
    removedEventCount: 0,
    changedEventCount: 0,
    baselineAuditRecordCount: 1,
    candidateAuditRecordCount: 1,
    unchangedAuditRecordCount: 1,
    addedAuditRecordCount: 0,
    removedAuditRecordCount: 0,
    changedAuditRecordCount: 0,
  };
}

function retentionPreviewResponse(overrides = {}) {
  return {
    kind: "workspace-session.snapshot-review.retention-preview",
    schemaVersion: WORKSPACE_SESSION_SNAPSHOT_REVIEW_API_SCHEMA_VERSION,
    storeSchemaVersion: WORKSPACE_SESSION_SNAPSHOT_API_SCHEMA_VERSION,
    localOnly: true,
    durableWrites: false,
    redacted: true,
    fingerprint: reviewFingerprint,
    policy: {
      retainNewest: 1,
      retainSnapshotIds: [],
    },
    summary: {
      totalSnapshotCount: 2,
      retainedSnapshotCount: 1,
      expiredSnapshotCount: 1,
      pinnedSnapshotCount: 0,
    },
    snapshots: [
      retentionDecision(),
      retentionDecision({
        snapshotId: "snap-alpha-002",
        newestRank: 2,
        retain: false,
        plannedAction: "expire",
        reasonCodes: ["outside-retain-newest"],
      }),
    ],
    ...overrides,
  };
}

function retentionDecision(overrides = {}) {
  return {
    snapshotId: "snap-alpha-001",
    fingerprint: recordFingerprint,
    snapshotFingerprint,
    createdAt: "2026-04-27T00:05:00.000Z",
    updatedAt: "2026-04-27T00:05:00.000Z",
    workspaceId: "wsp_alpha",
    deviceId: "dev_laptop",
    sessionId,
    eventCount: 1,
    auditRecordCount: 1,
    newestRank: 1,
    retain: true,
    plannedAction: "retain",
    reasonCodes: ["within-retention-policy"],
    ...overrides,
  };
}

function boundarySummary(overrides = {}) {
  return {
    fingerprint: snapshotFingerprint,
    workspaceId: "wsp_alpha",
    deviceId: "dev_laptop",
    sessionId,
    operations: ["open"],
    auditActions: ["workspace.session.opened"],
    eventCount: 1,
    auditRecordCount: 1,
    ...overrides,
  };
}

function comparableEvent(overrides = {}) {
  const operation = overrides.operation ?? "open";
  const sequence = overrides.sequence ?? 1;
  return {
    key: `event:evt_wsp_alpha_${operation}_${String(sequence).padStart(8, "0")}`,
    eventId: `evt_wsp_alpha_${operation}_${String(sequence).padStart(8, "0")}`,
    operation,
    sequence,
    createdAt: `2026-04-27T00:0${sequence}:00.000Z`,
    fingerprint: `sha256:${"f".repeat(64)}`,
    ...overrides,
  };
}

function comparableAuditRecord(overrides = {}) {
  return {
    key: "audit:aud_wsp_alpha_lock_00000002",
    auditId: "aud_wsp_alpha_lock_00000002",
    action: "workspace.session.locked",
    createdAt: "2026-04-27T00:02:00.000Z",
    fingerprint: `sha256:${"1".repeat(64)}`,
    ...overrides,
  };
}

function snapshotRecord(overrides = {}) {
  const snapshot = overrides.snapshot ?? snapshotPreviewResponse();
  return {
    kind: "workspace-session.snapshot-record",
    schemaVersion: WORKSPACE_SESSION_SNAPSHOT_API_SCHEMA_VERSION,
    localOnly: true,
    durableWrites: false,
    redacted: true,
    snapshotId: "snap-alpha-001",
    label: "local-baseline",
    metadata: {
      workflowId: "workspace-session",
    },
    createdAt: "2026-04-27T00:05:00.000Z",
    updatedAt: "2026-04-27T00:05:00.000Z",
    fingerprint: recordFingerprint,
    snapshotFingerprint: snapshot.fingerprint,
    snapshot,
    ...overrides,
  };
}

function snapshotPreviewResponse(overrides = {}) {
  return {
    kind: "workspace-session.snapshot-preview",
    schemaVersion: WORKSPACE_SESSION_SNAPSHOT_API_SCHEMA_VERSION,
    apiSchemaVersion: WORKSPACE_SESSION_API_SCHEMA_VERSION,
    localOnly: true,
    durableWrites: false,
    redacted: true,
    fingerprint: snapshotFingerprint,
    summary: snapshotSummary(),
    auditPreview: auditPreviewResponse(),
    ...overrides,
  };
}

function snapshotSummary(overrides = {}) {
  return {
    kind: "workspace-session.snapshot-summary",
    localOnly: true,
    redacted: true,
    workspaceId: "wsp_alpha",
    deviceId: "dev_laptop",
    sessionId,
    operations: ["open"],
    eventCount: 1,
    eventIds: ["evt_wsp_alpha_open_00000001"],
    auditRecordCount: 1,
    auditIds: ["aud_wsp_alpha_open_00000001"],
    auditActions: ["workspace.session.opened"],
    ...overrides,
  };
}

function auditPreviewResponse(overrides = {}) {
  return {
    kind: "workspace-session.audit-preview",
    schemaVersion: WORKSPACE_SESSION_API_SCHEMA_VERSION,
    localOnly: true,
    durableWrites: false,
    summary: {
      kind: "workspace-session.summary",
      schemaVersion: WORKSPACE_SESSION_API_SCHEMA_VERSION,
      localOnly: true,
      durableWrites: false,
      workspaceId: "wsp_alpha",
      deviceId: "dev_laptop",
      storage: {
        localOnly: true,
        storagePath: redactedStoragePath,
        storagePathRedacted: true,
      },
      gateway: {
        transport: "http",
        host: "localhost",
        port: 48231,
      },
      session: {
        sessionId,
        operations: ["open"],
      },
    },
    events: [previewEventFixture()],
    audit: {
      kind: "workspace-session.audit-preview.records",
      localOnly: true,
      redacted: true,
      recordCount: 1,
      records: [auditRecordFixture()],
    },
    ...overrides,
  };
}

function previewEventFixture(overrides = {}) {
  const operation = overrides.operation ?? "open";
  const sequence = overrides.sequence ?? 1;
  return {
    eventId: `evt_wsp_alpha_${operation}_${String(sequence).padStart(8, "0")}`,
    workspaceId: "wsp_alpha",
    type: `workspace.session.${operation === "lock" ? "locked" : "opened"}`,
    cursor: String(sequence),
    sequence,
    deviceId: "dev_laptop",
    createdAt: `2026-04-27T00:0${sequence}:00.000Z`,
    payload: {
      kind: "localWorkspaceSession",
      schemaVersion: "local-workspace-session/v1",
      operation,
      sessionId,
      localOnly: true,
      storagePath: redactedStoragePath,
      storagePathRedacted: true,
      gateway: {
        transport: "http",
        host: "localhost",
        port: 48231,
      },
    },
    ...overrides,
  };
}

function auditRecordFixture(overrides = {}) {
  return {
    auditId: "aud_wsp_alpha_open_00000001",
    action: "workspace.session.opened",
    createdAt: "2026-04-27T00:01:00.000Z",
    details: {
      storagePath: redactedStoragePath,
    },
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
