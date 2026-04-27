import assert from "node:assert/strict";

import {
  buildLocalEventCatalogState,
  buildLocalEventSummaries,
  filterCanonicalLocalEvents,
  filterLocalEventSummaries,
  getCatalogStatusLabel,
  getLocalEventOperationLabel,
  getLocalEventRedactionSeverityLabel,
  getLocalEventRiskLabel,
  getLocalEventSchemaLabel,
  isLocalEventOperationKind,
  isLocalEventRedactionSeverity,
  isLocalEventRedactionStatus,
  isLocalEventReplayStatus,
  isLocalEventRiskLevel,
  isLocalEventSchemaKind,
  summarizeLocalEvents,
} from "../src/localEventCatalog.ts";

const timestamps = {
  createDoc: "2026-04-27T01:00:00.000Z",
  updateTask: "2026-04-27T01:10:00.000Z",
  deleteTask: "2026-04-27T01:20:00.000Z",
  restoreSetting: "2026-04-27T01:30:00.000Z",
  syncConnection: "2026-04-27T01:40:00.000Z",
  resolvedMarker: "2026-04-27T01:25:00.000Z",
};

const events = [
  {
    id: "evt_task_update",
    streamId: "stream_alpha",
    sequence: 2,
    operationKind: "update",
    schemaKind: "task",
    occurredAt: timestamps.updateTask,
    title: "Task caption updated",
    summary: "Renamed the task caption after a local edit.",
    actorId: "act_mira",
    redactionMarkers: [
      {
        id: "red_task_caption",
        path: "$.task.caption",
        reason: "Caption text should stay summarized.",
        marker: "[redacted:caption]",
        severity: "warning",
        createdAt: timestamps.updateTask,
      },
    ],
    replay: {
      status: "ready",
      checkedAt: timestamps.updateTask,
    },
  },
  {
    id: "evt_connection_sync",
    streamId: "stream_beta",
    sequence: 1,
    operationKind: "sync",
    schemaKind: "connection",
    occurredAt: timestamps.syncConnection,
    riskLevel: "low",
    title: "Connection sync replayed",
    summary: "Replayed a connection sync event.",
    replay: {
      status: "replayed",
      replayedAt: timestamps.syncConnection,
    },
  },
  {
    id: "evt_doc_create",
    streamId: "stream_alpha",
    sequence: 1,
    operationKind: "create",
    schemaKind: "document",
    occurredAt: timestamps.createDoc,
    title: "Document created",
    summary: "Created a local document draft.",
    payloadFingerprint: "fp_doc_create",
    replay: {
      status: "ready",
      checkedAt: timestamps.createDoc,
    },
  },
  {
    id: "evt_setting_restore",
    streamId: "stream_alpha",
    sequence: 4,
    operationKind: "restore",
    schemaKind: "setting",
    occurredAt: timestamps.restoreSetting,
    title: "Setting restored",
    summary: "Restored a setting snapshot.",
    metadata: { source: { id: "snapshot_alpha" } },
    replay: {
      status: "failed",
      issueCount: 2,
      issueCodes: ["checksum_mismatch", "missing_snapshot"],
      checkedAt: timestamps.restoreSetting,
    },
  },
  {
    id: "evt_task_delete",
    streamId: "stream_alpha",
    sequence: 3,
    operationKind: "delete",
    schemaKind: "task",
    occurredAt: timestamps.deleteTask,
    title: "Task deleted",
    summary: "Removed a stale local task.",
    redactionMarkers: [
      {
        id: "red_task_payload",
        path: "$.task.payload",
        reason: "Payload value must be masked before replay.",
        marker: "[redacted:payload]",
        severity: "blocking",
        createdAt: timestamps.deleteTask,
      },
      {
        id: "red_task_note",
        path: "$.task.note",
        reason: "Note was already summarized.",
        marker: "[redacted:note]",
        severity: "info",
        status: "resolved",
        createdAt: timestamps.deleteTask,
        resolvedAt: timestamps.resolvedMarker,
      },
    ],
    replay: {
      status: "pending",
    },
  },
];

function testCatalogStateSummariesAndCounts() {
  const state = buildLocalEventCatalogState(events);

  assert.equal(state.status, "blocked");
  assert.equal(state.totalCount, 5);
  assert.equal(state.visibleCount, 5);
  assert.deepEqual(
    state.summaries.map((summary) => summary.eventId),
    [
      "evt_doc_create",
      "evt_task_update",
      "evt_task_delete",
      "evt_setting_restore",
      "evt_connection_sync",
    ],
  );

  assert.deepEqual(state.summary.byOperationKind, {
    create: 1,
    update: 1,
    delete: 1,
    restore: 1,
    sync: 1,
  });
  assert.deepEqual(state.summary.bySchemaKind, {
    workspace: 0,
    document: 1,
    task: 2,
    artifact: 0,
    setting: 1,
    connection: 1,
  });
  assert.deepEqual(state.summary.byRiskLevel, {
    low: 2,
    medium: 1,
    high: 2,
  });

  assert.equal(state.summary.redactions.total, 3);
  assert.equal(state.summary.redactions.open, 2);
  assert.equal(state.summary.redactions.resolved, 1);
  assert.equal(state.summary.redactions.openBlocking, 1);
  assert.deepEqual(state.summary.redactions.bySeverity, {
    info: 1,
    warning: 1,
    blocking: 1,
  });
  assert.deepEqual(state.summary.redactions.openBySeverity, {
    info: 0,
    warning: 1,
    blocking: 1,
  });

  assert.deepEqual(state.summary.replayReadiness.byStatus, {
    empty: 0,
    ready: 1,
    attention: 1,
    blocked: 2,
    complete: 1,
  });
  assert.deepEqual(state.summary.replayReadiness.readyEventIds, [
    "evt_doc_create",
  ]);
  assert.deepEqual(state.summary.replayReadiness.attentionEventIds, [
    "evt_task_update",
  ]);
  assert.deepEqual(state.summary.replayReadiness.blockedEventIds, [
    "evt_task_delete",
    "evt_setting_restore",
  ]);
  assert.deepEqual(state.summary.replayReadiness.completeEventIds, [
    "evt_connection_sync",
  ]);

  const blockedTask = state.summaries.find(
    (summary) => summary.eventId === "evt_task_delete",
  );
  assert.equal(blockedTask.replayReadiness.status, "blocked");
  assert.deepEqual(blockedTask.redactions.openBlockingMarkerIds, [
    "red_task_payload",
  ]);
  assert.deepEqual(
    blockedTask.redactions.markers.map((marker) => marker.id),
    ["red_task_payload", "red_task_note"],
  );
  assert.match(blockedTask.ariaLabel, /Replay blocked/);

  const failedRestore = state.summaries.find(
    (summary) => summary.eventId === "evt_setting_restore",
  );
  assert.equal(failedRestore.replayReadiness.status, "blocked");
  assert.deepEqual(failedRestore.replayReadiness.issueCodes, [
    "checksum_mismatch",
    "missing_snapshot",
  ]);
  assert.deepEqual(failedRestore.replayReadiness.reasonLabels, [
    "2 replay issues",
  ]);
}

function testFiltersAndVisibleSummary() {
  const taskSummaries = buildLocalEventSummaries(events, {
    operationKind: ["update", "delete"],
    schemaKind: "task",
    riskLevel: ["medium", "high"],
  });
  assert.deepEqual(
    taskSummaries.map((summary) => summary.eventId),
    ["evt_task_update", "evt_task_delete"],
  );

  const captionMatches = filterLocalEventSummaries(taskSummaries, {
    query: "caption",
  });
  assert.deepEqual(
    captionMatches.map((summary) => summary.eventId),
    ["evt_task_update"],
  );

  const highRisk = filterCanonicalLocalEvents(events, { riskLevel: "high" });
  assert.deepEqual(
    highRisk.map((event) => event.id),
    ["evt_setting_restore", "evt_task_delete"],
  );

  const state = buildLocalEventCatalogState(events, {
    schemaKind: "workspace",
  });
  assert.equal(state.totalCount, 5);
  assert.equal(state.visibleCount, 0);
  assert.equal(state.emptyState.label, "No matching local events");
  assert.deepEqual(state.visibleSummary.bySchemaKind.workspace, 0);
}

function testSummariesAreIndependent() {
  const state = buildLocalEventCatalogState(events);
  state.summaries[1].detailLabels.push("mutated");
  state.summaries[1].redactions.markers[0].reason = "mutated";
  state.summaries[3].replayReadiness.issueCodes.push("mutated");
  state.summary.replayReadiness.byStatus.blocked = 0;

  const rebuilt = buildLocalEventCatalogState(events);
  assert.deepEqual(
    rebuilt.summaries[1].detailLabels.includes("mutated"),
    false,
  );
  assert.equal(
    rebuilt.summaries[1].redactions.markers[0].reason,
    "Caption text should stay summarized.",
  );
  assert.deepEqual(rebuilt.summaries[3].replayReadiness.issueCodes, [
    "checksum_mismatch",
    "missing_snapshot",
  ]);
  assert.equal(rebuilt.summary.replayReadiness.byStatus.blocked, 2);

  const highRisk = filterCanonicalLocalEvents(events, { riskLevel: "high" });
  highRisk[0].metadata.source.id = "mutated";
  highRisk[0].replay.issueCodes.push("mutated");
  highRisk[1].redactionMarkers[0].reason = "mutated";

  assert.equal(events[3].metadata.source.id, "snapshot_alpha");
  assert.deepEqual(events[3].replay.issueCodes, [
    "checksum_mismatch",
    "missing_snapshot",
  ]);
  assert.equal(
    events[4].redactionMarkers[0].reason,
    "Payload value must be masked before replay.",
  );
}

function testEmptySummaryAndLabels() {
  const empty = buildLocalEventCatalogState([]);
  assert.equal(empty.status, "empty");
  assert.equal(empty.emptyState.label, "No local events");
  assert.deepEqual(empty.summary.byOperationKind, {
    create: 0,
    update: 0,
    delete: 0,
    restore: 0,
    sync: 0,
  });
  assert.equal(summarizeLocalEvents([]).replayReadiness.status, "empty");

  assert.equal(getLocalEventOperationLabel("restore"), "Restore");
  assert.equal(getLocalEventSchemaLabel("artifact"), "Artifact");
  assert.equal(getLocalEventRiskLabel("medium"), "Medium risk");
  assert.equal(getLocalEventRedactionSeverityLabel("blocking"), "Blocking");
  assert.equal(getCatalogStatusLabel("ready"), "Ready for replay");
}

function testTypeGuardsAndValidation() {
  assert.equal(isLocalEventOperationKind("update"), true);
  assert.equal(isLocalEventOperationKind("export"), false);
  assert.equal(isLocalEventSchemaKind("document"), true);
  assert.equal(isLocalEventSchemaKind("record"), false);
  assert.equal(isLocalEventRiskLevel("high"), true);
  assert.equal(isLocalEventRiskLevel("urgent"), false);
  assert.equal(isLocalEventRedactionSeverity("warning"), true);
  assert.equal(isLocalEventRedactionSeverity("critical"), false);
  assert.equal(isLocalEventRedactionStatus("resolved"), true);
  assert.equal(isLocalEventRedactionStatus("closed"), false);
  assert.equal(isLocalEventReplayStatus("replayed"), true);
  assert.equal(isLocalEventReplayStatus("done"), false);

  assert.throws(
    () =>
      buildLocalEventSummaries([
        {
          ...events[0],
          operationKind: "export",
        },
      ]),
    /operation kind/,
  );
  assert.throws(
    () =>
      buildLocalEventSummaries([
        {
          ...events[0],
          sequence: 0,
        },
      ]),
    /sequence/,
  );
  assert.throws(
    () =>
      buildLocalEventSummaries([
        {
          ...events[0],
          occurredAt: "not-a-date",
        },
      ]),
    /occurredAt/,
  );
  assert.throws(
    () =>
      buildLocalEventSummaries([
        {
          ...events[0],
          redactionMarkers: [
            {
              id: "red_bad",
              path: " ",
              reason: "Missing path.",
              marker: "[redacted:value]",
            },
          ],
        },
      ]),
    /redaction path/,
  );
  assert.throws(
    () =>
      buildLocalEventSummaries([
        {
          ...events[0],
          replay: {
            status: "ready",
            issueCount: -1,
          },
        },
      ]),
    /issueCount/,
  );
  assert.throws(
    () =>
      buildLocalEventSummaries([
        {
          ...events[0],
          replay: {
            status: "done",
          },
        },
      ]),
    /replay status/,
  );
}

testCatalogStateSummariesAndCounts();
testFiltersAndVisibleSummary();
testSummariesAreIndependent();
testEmptySummaryAndLabels();
testTypeGuardsAndValidation();

console.log("local event catalog tests passed");
