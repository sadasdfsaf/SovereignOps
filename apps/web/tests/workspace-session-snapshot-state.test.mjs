import assert from "node:assert/strict";

import {
  buildWorkspaceSessionSnapshotEmptyState,
  buildWorkspaceSessionSnapshotErrorState,
  buildWorkspaceSessionSnapshotErrorStates,
  buildWorkspaceSessionSnapshotLoadingState,
  buildWorkspaceSessionSnapshotReadinessIndicators,
  buildWorkspaceSessionSnapshotRecordRows,
  buildWorkspaceSessionSnapshotState,
  buildWorkspaceSessionSnapshotSummaryCards,
  redactWorkspaceSessionSnapshotDisplayValue,
} from "../src/workspaceSessionSnapshotState.ts";

const timestamps = {
  created: "2026-04-28T04:00:00.000Z",
  updated: "2026-04-28T04:01:00.000Z",
  eventOpen: "2026-04-28T04:02:00.000Z",
  eventLock: "2026-04-28T04:03:00.000Z",
};

const fingerprints = {
  snapshot: `sha256:${"a".repeat(64)}`,
  record: `sha256:${"b".repeat(64)}`,
};

const rawPath = "C:\\Users\\DELL\\workspace-session\\unsafe-session.json";
const rawSecret = "sk-local-snapshot-secret-123456";

function buildPreview(overrides = {}) {
  return {
    kind: "workspace-session.snapshot-preview",
    schemaVersion: "workspace-session-store/v1",
    apiSchemaVersion: "workspace-session-api/v1",
    localOnly: true,
    durableWrites: false,
    redacted: true,
    fingerprint: fingerprints.snapshot,
    summary: {
      kind: "workspace-session.snapshot-summary",
      localOnly: true,
      redacted: true,
      workspaceId: "wsp_alpha",
      deviceId: "dev_laptop",
      sessionId: "sess_alpha",
      operations: ["open", "lock"],
      eventCount: 2,
      eventIds: ["evt_open", "evt_lock"],
      auditRecordCount: 2,
      auditIds: ["aud_open", "aud_lock"],
      auditActions: ["workspace.session.opened", "workspace.session.locked"],
    },
    auditPreview: {
      kind: "workspace-session.audit-preview",
      schemaVersion: "workspace-session-api/v1",
      localOnly: true,
      durableWrites: false,
      summary: {
        localOnly: true,
        durableWrites: false,
        workspaceId: "wsp_alpha",
        deviceId: "dev_laptop",
        storage: {
          localOnly: true,
          storagePath: "[redacted:path:abc123]",
          storagePathRedacted: true,
        },
        session: {
          sessionId: "sess_alpha",
          operations: ["open", "lock"],
        },
      },
      events: [
        {
          eventId: "evt_open",
          sequence: 1,
          createdAt: timestamps.eventOpen,
          payload: {
            operation: "open",
            sessionId: "sess_alpha",
            localOnly: true,
            storagePath: "[redacted:path:def456]",
            storagePathRedacted: true,
          },
        },
        {
          eventId: "evt_lock",
          sequence: 2,
          createdAt: timestamps.eventLock,
          payload: {
            operation: "lock",
            sessionId: "sess_alpha",
            localOnly: true,
            storagePath: "[redacted:path:def456]",
            storagePathRedacted: true,
            lock: {
              lockTokenRef: "[redacted:lockToken:lock123]",
            },
          },
        },
      ],
      audit: {
        kind: "workspace-session.audit-preview.records",
        localOnly: true,
        redacted: true,
        recordCount: 2,
        records: [
          {
            auditId: "aud_open",
            action: "workspace.session.opened",
            details: {
              localOnly: true,
              redaction: {
                redacted: true,
                fields: ["storagePath"],
              },
            },
          },
          {
            auditId: "aud_lock",
            action: "workspace.session.locked",
            details: {
              localOnly: true,
              redaction: {
                redacted: true,
                fields: ["storagePath", "lockToken"],
              },
            },
          },
        ],
      },
    },
    ...overrides,
  };
}

function buildRecord(overrides = {}) {
  return {
    kind: "workspace-session.snapshot-record",
    schemaVersion: "workspace-session-store/v1",
    localOnly: true,
    durableWrites: false,
    redacted: true,
    snapshotId: "snapshot-local-1",
    label: "local-baseline",
    metadata: {
      visible: "kept",
    },
    createdAt: timestamps.created,
    updatedAt: timestamps.updated,
    fingerprint: fingerprints.record,
    snapshotFingerprint: fingerprints.snapshot,
    snapshot: buildPreview(),
    ...overrides,
  };
}

function buildCreateResponse(record = buildRecord()) {
  return {
    kind: "workspace-session.snapshot-record.created",
    schemaVersion: "workspace-session-store/v1",
    localOnly: true,
    durableWrites: false,
    record,
  };
}

function buildGetResponse(record = buildRecord()) {
  return {
    kind: "workspace-session.snapshot-record.read",
    schemaVersion: "workspace-session-store/v1",
    localOnly: true,
    durableWrites: false,
    record,
  };
}

function buildListResponse(records = [summarizeRecord(buildRecord())]) {
  return {
    kind: "workspace-session.snapshot-record.list",
    schemaVersion: "workspace-session-store/v1",
    localOnly: true,
    durableWrites: false,
    filters: {
      labels: ["local-baseline"],
    },
    pagination: {
      offset: 0,
      limit: 10,
      totalRecordCount: records.length,
      matchedRecordCount: records.length,
      returnedRecordCount: records.length,
      hasMore: false,
    },
    records,
  };
}

function summarizeRecord(record) {
  return {
    snapshotId: record.snapshotId,
    label: record.label,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    fingerprint: record.fingerprint,
    snapshotFingerprint: record.snapshotFingerprint,
    workspaceId: record.snapshot.summary.workspaceId,
    deviceId: record.snapshot.summary.deviceId,
    sessionId: record.snapshot.summary.sessionId,
    operations: record.snapshot.summary.operations,
    eventCount: record.snapshot.summary.eventCount,
    auditRecordCount: record.snapshot.summary.auditRecordCount,
  };
}

function assertNoRawBodyLeak(value, rawValues = []) {
  const serialized = JSON.stringify(value);
  for (const raw of rawValues) {
    assert.equal(
      serialized.includes(raw),
      false,
      `snapshot state leaked raw value: ${raw}`,
    );
    assert.equal(
      serialized.includes(raw.replaceAll("\\", "\\\\")),
      false,
      `snapshot state leaked escaped raw value: ${raw}`,
    );
  }
  for (const key of [
    '"auditPreview"',
    '"events"',
    '"payload"',
    '"snapshot":',
    '"requestBody"',
    '"responseBody"',
    '"metadata"',
  ]) {
    assert.equal(serialized.includes(key), false, `snapshot state retained ${key}`);
  }
}

function testCreateGetListAndPreviewResponsesBuildDerivedState() {
  const createResponse = buildCreateResponse();
  const original = structuredClone(createResponse);
  const createState = buildWorkspaceSessionSnapshotState(createResponse);

  assert.deepEqual(createResponse, original);
  assert.equal(createState.id, "workspace_session_snapshot");
  assert.equal(createState.call, "create");
  assert.equal(createState.phase, "success");
  assert.equal(createState.status, "ready");
  assert.equal(createState.selectedSnapshotId, "snapshot-local-1");
  assert.equal(createState.snapshotCount, 1);
  assert.equal(createState.localOnly, true);
  assert.equal(createState.redacted, true);
  assert.equal(createState.durableWrites, false);
  assert.equal(createState.rawBodyRetained, false);
  assert.equal(createState.rawRetentionRisk, false);
  assert.ok(createState.redactionCount > 0);

  assert.deepEqual(
    createState.recordRows.map((row) => [
      row.snapshotId,
      row.source,
      row.label,
      row.status,
      row.workspaceId,
      row.sessionId,
      row.eventCount,
      row.auditRecordCount,
      row.localOnly,
      row.redacted,
    ]),
    [
      [
        "snapshot-local-1",
        "record",
        "local-baseline",
        "ready",
        "wsp_alpha",
        "sess_alpha",
        2,
        2,
        true,
        true,
      ],
    ],
  );
  assert.deepEqual(createState.recordRows[0].operationLabels, ["open", "lock"]);
  assert.deepEqual(
    createState.readinessIndicators.map((indicator) => [
      indicator.kind,
      indicator.value,
      indicator.status,
      indicator.ready,
    ]),
    [
      ["local_only", "Local only", "ready", true],
      ["redacted", "Redacted", "ready", true],
      ["durable_writes", "0 durable writes", "ready", true],
      ["raw_retention", "Not retained", "ready", true],
    ],
  );
  assert.deepEqual(
    createState.summaryCards.map((card) => [card.label, card.value, card.status]),
    [
      ["Snapshot records", "1 snapshot", "ready"],
      ["Persistence readiness", "Ready", "ready"],
      ["Redactions", `${createState.redactionCount} redactions`, "attention"],
      ["Raw body retention", "Not retained", "ready"],
    ],
  );
  assertNoRawBodyLeak(createState);

  const getState = buildWorkspaceSessionSnapshotState(buildGetResponse());
  assert.equal(getState.call, "get");
  assert.equal(getState.recordRows[0].snapshotId, "snapshot-local-1");

  const listState = buildWorkspaceSessionSnapshotState(buildListResponse());
  assert.equal(listState.call, "list");
  assert.equal(listState.status, "ready");
  assert.equal(listState.recordRows[0].source, "summary");
  assert.equal(listState.recordRows[0].redacted, true);
  assert.equal(listState.pagination?.label, "1 returned snapshot of 1 matched snapshot");
  assertNoRawBodyLeak(listState);

  const previewState = buildWorkspaceSessionSnapshotState(buildPreview(), {
    defaultTimestamp: timestamps.created,
  });
  assert.equal(previewState.call, "preview");
  assert.equal(previewState.status, "ready");
  assert.match(previewState.selectedSnapshotId, /^preview_aaaaaaaaaaaa$/);
  assert.equal(previewState.recordRows[0].source, "preview");
  assert.equal(previewState.recordRows[0].title, "Snapshot preview");
  assertNoRawBodyLeak(previewState);
}

function testFocusedBuildersAndUnsafeRetentionSignals() {
  const listResponse = buildListResponse();

  assert.deepEqual(
    buildWorkspaceSessionSnapshotRecordRows(listResponse).map((row) => [
      row.snapshotId,
      row.source,
      row.status,
    ]),
    [["snapshot-local-1", "summary", "ready"]],
  );
  assert.deepEqual(
    buildWorkspaceSessionSnapshotSummaryCards(listResponse).map((card) => [
      card.id,
      card.value,
    ]),
    [
      ["workspace_session_snapshot.summary.records", "1 snapshot"],
      ["workspace_session_snapshot.summary.readiness", "Ready"],
      ["workspace_session_snapshot.summary.redactions", "0 redactions"],
      ["workspace_session_snapshot.summary.retention", "Not retained"],
    ],
  );
  assert.deepEqual(
    buildWorkspaceSessionSnapshotReadinessIndicators(listResponse).map((indicator) => [
      indicator.kind,
      indicator.status,
    ]),
    [
      ["local_only", "ready"],
      ["redacted", "ready"],
      ["durable_writes", "ready"],
      ["raw_retention", "ready"],
    ],
  );

  const unsafeRecord = buildRecord({
    localOnly: false,
    durableWrites: true,
    redacted: false,
    label: `unsafe ${rawPath}`,
    metadata: {
      token: rawSecret,
      path: rawPath,
    },
    snapshot: buildPreview({
      durableWrites: true,
      redacted: false,
      rawRequestBodyStored: true,
      raw: {
        storagePathRedacted: false,
        token: rawSecret,
        path: rawPath,
      },
    }),
  });
  const unsafeState = buildWorkspaceSessionSnapshotState(
    buildCreateResponse(unsafeRecord),
  );

  assert.equal(unsafeState.status, "blocked");
  assert.equal(unsafeState.localOnly, false);
  assert.equal(unsafeState.redacted, false);
  assert.equal(unsafeState.durableWrites, true);
  assert.equal(unsafeState.rawRetentionRisk, true);
  assert.ok(unsafeState.rawRetentionRiskCount > 0);
  assert.equal(unsafeState.recordRows[0].status, "blocked");
  assert.equal(unsafeState.recordRows[0].label, "[REDACTED]");
  assert.equal(unsafeState.recordRows[0].localOnly, false);
  assert.equal(unsafeState.recordRows[0].redacted, false);
  assert.equal(unsafeState.recordRows[0].durableWrites, true);
  assert.equal(unsafeState.recordRows[0].rawRetentionRisk, true);
  assertNoRawBodyLeak(unsafeState, [rawPath, rawSecret]);
  assert.equal(
    redactWorkspaceSessionSnapshotDisplayValue(rawSecret, "token"),
    "[REDACTED]",
  );
}

function testLoadingEmptyAndErrorStates() {
  const loading = buildWorkspaceSessionSnapshotLoadingState({
    call: "get",
    defaultTimestamp: timestamps.created,
  });
  assert.equal(loading.phase, "loading");
  assert.equal(loading.status, "loading");
  assert.equal(loading.call, "get");
  assert.equal(loading.generatedAt, timestamps.created);
  assert.equal(loading.rawBodyRetained, false);

  const empty = buildWorkspaceSessionSnapshotState(buildListResponse([]));
  assert.equal(empty.phase, "empty");
  assert.equal(empty.status, "empty");
  assert.equal(empty.snapshotCount, 0);
  assert.equal(empty.emptyStates.records.label, "No snapshot records");
  assert.deepEqual(buildWorkspaceSessionSnapshotEmptyState("records"), {
    id: "workspace_session_snapshot_records_empty",
    label: "No snapshot records",
    description:
      "Stored workspace session snapshots will appear after a create, get, list, or preview response loads.",
    ariaLabel: "No workspace session snapshot records are available",
    actionLabel: "Refresh snapshots",
  });

  const error = buildWorkspaceSessionSnapshotState({
    kind: "workspace-session.snapshot-record.list",
    error: {
      message: `Snapshot load failed at ${rawPath} with token=${rawSecret}`,
    },
  });
  assert.equal(error.phase, "error");
  assert.equal(error.status, "error");
  assert.equal(error.errorStates.length, 1);
  assert.equal(error.errorStates[0].context, "list");
  assert.equal(error.errorStates[0].redacted, true);
  assert.equal(error.errorStates[0].errorState.description.includes(rawPath), false);
  assert.equal(error.errorStates[0].errorState.description.includes(rawSecret), false);
  assertNoRawBodyLeak(error, [rawPath, rawSecret]);

  assert.deepEqual(
    buildWorkspaceSessionSnapshotErrorStates({
      call: "get",
      error: "Snapshot store unavailable",
    }).map((entry) => [entry.context, entry.errorState.description]),
    [["get", "Snapshot store unavailable"]],
  );
  assert.deepEqual(
    buildWorkspaceSessionSnapshotErrorState("retention", new Error("Retention scan failed")),
    {
      id: "workspace_session_snapshot_retention_error",
      context: "retention",
      redacted: false,
      redactionCount: 0,
      errorState: {
        id: "workspace_session_snapshot_retention_error",
        label: "Workspace session snapshot retention could not load",
        description: "Retention scan failed",
        ariaLabel: "Workspace session snapshot retention could not load",
        retryLabel: "Retry retention",
      },
    },
  );
}

function testCloneBoundary() {
  const payload = buildListResponse();
  const frozenPayload = deepFreeze(structuredClone(payload));
  const before = structuredClone(frozenPayload);
  const state = buildWorkspaceSessionSnapshotState(frozenPayload);

  state.summaryCards[0].detailLabels.push("mutated");
  state.recordRows[0].operationLabels.push("mutated");
  state.recordRows[0].detailLabels.push("mutated");
  state.readinessIndicators[0].detailLabels.push("mutated");
  state.emptyStates.records.label = "mutated";
  if (state.pagination) {
    state.pagination.label = "mutated";
  }

  assert.deepEqual(frozenPayload, before);

  const rebuilt = buildWorkspaceSessionSnapshotState(frozenPayload);
  assert.equal(rebuilt.summaryCards[0].detailLabels.includes("mutated"), false);
  assert.equal(rebuilt.recordRows[0].operationLabels.includes("mutated"), false);
  assert.equal(rebuilt.recordRows[0].detailLabels.includes("mutated"), false);
  assert.equal(
    rebuilt.readinessIndicators[0].detailLabels.includes("mutated"),
    false,
  );
  assert.equal(rebuilt.emptyStates.records.label, "No snapshot records");
  assert.equal(rebuilt.pagination?.label, "1 returned snapshot of 1 matched snapshot");
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}

testCreateGetListAndPreviewResponsesBuildDerivedState();
testFocusedBuildersAndUnsafeRetentionSignals();
testLoadingEmptyAndErrorStates();
testCloneBoundary();

console.log("workspace session snapshot state tests passed");
