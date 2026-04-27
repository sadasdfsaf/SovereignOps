import assert from "node:assert/strict";

import {
  buildLocalEventReplayApprovalCards,
  buildLocalEventReplayDocumentCards,
  buildLocalEventReplayState,
  buildLocalEventReplayTimelineRows,
} from "../src/localEventReplayState.ts";

const timestamps = {
  createDoc: "2026-04-27T02:00:00.000Z",
  updateTask: "2026-04-27T02:05:00.000Z",
  deleteDoc: "2026-04-27T02:10:00.000Z",
  restoreArtifact: "2026-04-27T02:15:00.000Z",
  syncDoc: "2026-04-27T02:20:00.000Z",
  resolvedMarker: "2026-04-27T02:12:00.000Z",
};

const events = [
  {
    id: "evt_artifact_restore",
    streamId: "stream_beta",
    sequence: 2,
    operationKind: "restore",
    schemaKind: "artifact",
    occurredAt: timestamps.restoreArtifact,
    title: "Artifact restore failed",
    summary: "Restore replay found a checksum issue.",
    replay: {
      status: "failed",
      issueCount: 2,
      issueCodes: ["checksum_mismatch", "missing_artifact"],
      checkedAt: timestamps.restoreArtifact,
    },
  },
  {
    id: "evt_doc_sync",
    streamId: "stream_gamma",
    sequence: 1,
    operationKind: "sync",
    schemaKind: "document",
    occurredAt: timestamps.syncDoc,
    riskLevel: "low",
    title: "Document sync completed",
    summary: "Replayed a document sync event.",
    replay: {
      status: "replayed",
      replayedAt: timestamps.syncDoc,
    },
  },
  {
    id: "evt_task_update",
    streamId: "stream_alpha",
    sequence: 2,
    operationKind: "update",
    schemaKind: "task",
    occurredAt: timestamps.updateTask,
    title: "Task title updated",
    summary: "Renamed the local task title.",
    actorId: "act_mira",
    redactionMarkers: [
      {
        id: "red_task_title",
        path: "$.task.title",
        reason: "Task title should stay summarized.",
        marker: "[redacted:title]",
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
    id: "evt_doc_create",
    streamId: "stream_alpha",
    sequence: 1,
    operationKind: "create",
    schemaKind: "document",
    occurredAt: timestamps.createDoc,
    title: "Draft document created",
    summary: "Created a local draft document.",
    payloadFingerprint: "fp_doc_create",
    replay: {
      status: "ready",
      checkedAt: timestamps.createDoc,
    },
  },
  {
    id: "evt_doc_delete",
    streamId: "stream_alpha",
    sequence: 3,
    operationKind: "delete",
    schemaKind: "document",
    occurredAt: timestamps.deleteDoc,
    title: "Draft document removed",
    summary: "Removed an obsolete local draft document.",
    redactionMarkers: [
      {
        id: "red_doc_body",
        path: "$.document.body",
        reason: "Body text must stay summarized before replay.",
        marker: "[redacted:body]",
        severity: "blocking",
        createdAt: timestamps.deleteDoc,
      },
      {
        id: "red_doc_note",
        path: "$.document.note",
        reason: "Note was already summarized.",
        marker: "[redacted:note]",
        severity: "info",
        status: "resolved",
        createdAt: timestamps.deleteDoc,
        resolvedAt: timestamps.resolvedMarker,
      },
    ],
    replay: {
      status: "pending",
    },
  },
];

function byId(items, id) {
  return items.find((item) => item.id === id);
}

function byValue(items, value) {
  return items.find((item) => item.value === value);
}

function testReplayStateBuildsRowsCardsAndFilterOptions() {
  const state = buildLocalEventReplayState(events);

  assert.equal(state.status, "blocked");
  assert.equal(state.totalCount, 5);
  assert.equal(state.visibleCount, 5);
  assert.deepEqual(
    state.timelineRows.map((row) => row.eventId),
    [
      "evt_doc_create",
      "evt_task_update",
      "evt_doc_delete",
      "evt_artifact_restore",
      "evt_doc_sync",
    ],
  );

  const blockedDoc = state.timelineRows.find(
    (row) => row.eventId === "evt_doc_delete",
  );
  assert.equal(blockedDoc.status, "blocked");
  assert.equal(blockedDoc.openBlockingMarkerCount, 1);
  assert.deepEqual(blockedDoc.issueCodes, []);
  assert.ok(blockedDoc.badgeLabels.includes("1 open marker"));
  assert.match(blockedDoc.ariaLabel, /Blocked/);

  assert.deepEqual(
    state.approvalCards.map((card) => [card.targetStatus, card.value]),
    [
      ["blocked", 2],
      ["attention", 1],
      ["ready", 1],
      ["complete", 1],
    ],
  );
  assert.deepEqual(
    byId(state.approvalCards, "local_event_replay.approval.blocked").eventIds,
    ["evt_doc_delete", "evt_artifact_restore"],
  );
  assert.equal(
    byId(state.approvalCards, "local_event_replay.approval.blocked")
      .openBlockingMarkerCount,
    1,
  );

  const allDocuments = byId(
    state.documentCards,
    "local_event_replay.documents.all",
  );
  assert.equal(allDocuments.value, 3);
  assert.equal(allDocuments.status, "blocked");
  assert.deepEqual(allDocuments.eventIds, [
    "evt_doc_create",
    "evt_doc_delete",
    "evt_doc_sync",
  ]);

  assert.equal(byValue(state.filters.operationKindOptions, "update").count, 1);
  assert.equal(byValue(state.filters.replayStatusOptions, "blocked").count, 2);
  assert.equal(
    byValue(state.filters.redactionStatusOptions, "blocking").count,
    1,
  );
  assert.equal(state.filters.activeFilters.length, 0);
}

function testFiltersComposeAcrossCatalogReplayAndRedactions() {
  const state = buildLocalEventReplayState(events, {
    filter: {
      schemaKind: "document",
      replayStatus: ["ready", "blocked"],
      redactionStatus: ["none", "blocking"],
      query: "draft",
    },
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.totalCount, 5);
  assert.equal(state.visibleCount, 2);
  assert.deepEqual(
    state.timelineRows.map((row) => row.eventId),
    ["evt_doc_create", "evt_doc_delete"],
  );
  assert.deepEqual(
    state.filters.activeFilters.map((filter) => filter.label),
    [
      "Document",
      "Ready for replay",
      "Blocked",
      "No redactions",
      "Blocking redactions",
      "Search: draft",
    ],
  );
  assert.equal(state.filters.query, "draft");
  assert.equal(byValue(state.filters.schemaKindOptions, "document").active, true);
  assert.equal(byValue(state.filters.replayStatusOptions, "ready").active, true);
  assert.equal(
    byValue(state.filters.redactionStatusOptions, "blocking").active,
    true,
  );

  const blockedCard = byId(
    state.approvalCards,
    "local_event_replay.approval.blocked",
  );
  assert.deepEqual(blockedCard.eventIds, ["evt_doc_delete"]);

  const readyDocumentCard = byId(
    state.documentCards,
    "local_event_replay.documents.ready",
  );
  assert.deepEqual(readyDocumentCard.eventIds, ["evt_doc_create"]);
}

function testStateObjectsAreIndependent() {
  const state = buildLocalEventReplayState(events);

  state.timelineRows[3].issueCodes.push("mutated");
  state.approvalCards[0].eventIds.push("mutated");
  state.documentCards[0].detailLabels.push("mutated");
  state.filters.filter.replayStatus = "complete";

  const rebuilt = buildLocalEventReplayState(events);
  assert.deepEqual(rebuilt.timelineRows[3].issueCodes, [
    "checksum_mismatch",
    "missing_artifact",
  ]);
  assert.deepEqual(
    rebuilt.approvalCards[0].eventIds,
    ["evt_doc_delete", "evt_artifact_restore"],
  );
  assert.equal(rebuilt.documentCards[0].detailLabels.includes("mutated"), false);
  assert.equal(rebuilt.filters.filter.replayStatus, undefined);
}

function testEmptyAndErrorStates() {
  const empty = buildLocalEventReplayState([]);
  assert.equal(empty.status, "empty");
  assert.equal(empty.emptyState.label, "No local events");
  assert.equal(empty.visibleSummary.replayReadiness.status, "empty");

  const noMatches = buildLocalEventReplayState(events, {
    filter: {
      schemaKind: "workspace",
    },
  });
  assert.equal(noMatches.status, "empty");
  assert.equal(noMatches.totalCount, 5);
  assert.equal(noMatches.visibleCount, 0);
  assert.equal(noMatches.emptyState.actionLabel, "Clear filters");

  const errored = buildLocalEventReplayState(events, {
    error: new Error("Replay manifest unavailable."),
  });
  assert.equal(errored.status, "error");
  assert.equal(errored.emptyState.actionLabel, "Retry replay events");
  assert.equal(errored.errorStates[0].description, "Replay manifest unavailable.");
}

function testStandaloneBuildersUseTheSameFilteredShape() {
  const openRows = buildLocalEventReplayTimelineRows(events, {
    redactionStatus: "open",
  });
  assert.deepEqual(
    openRows.map((row) => row.eventId),
    ["evt_task_update", "evt_doc_delete"],
  );

  const completeCards = buildLocalEventReplayApprovalCards(events, {
    replayStatus: "complete",
  });
  assert.deepEqual(
    completeCards.map((card) => [card.targetStatus, card.value]),
    [
      ["blocked", 0],
      ["attention", 0],
      ["ready", 0],
      ["complete", 1],
    ],
  );

  const readyDocumentCards = buildLocalEventReplayDocumentCards(events, {
    replayStatus: "ready",
  });
  assert.deepEqual(
    byId(readyDocumentCards, "local_event_replay.documents.all").eventIds,
    ["evt_doc_create"],
  );
  assert.equal(
    byId(readyDocumentCards, "local_event_replay.documents.all").status,
    "ready",
  );
}

testReplayStateBuildsRowsCardsAndFilterOptions();
testFiltersComposeAcrossCatalogReplayAndRedactions();
testStateObjectsAreIndependent();
testEmptyAndErrorStates();
testStandaloneBuildersUseTheSameFilteredShape();

console.log("local event replay state tests passed");
