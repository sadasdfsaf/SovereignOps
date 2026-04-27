import assert from "node:assert/strict";

import {
  buildLocalEventApiErrorState,
  buildLocalEventApiErrorStates,
  buildLocalEventApiExportView,
  buildLocalEventApiLoadingState,
  buildLocalEventApiRequestCards,
  buildLocalEventApiReplayState,
  buildLocalEventApiState,
  collectLocalEventApiEvents,
  redactLocalEventApiError,
} from "../src/localEventApiState.ts";

const timestamps = {
  generated: "2026-04-27T10:00:00.000Z",
  createDoc: "2026-04-27T10:01:00.000Z",
  updateTask: "2026-04-27T10:02:00.000Z",
  deleteDoc: "2026-04-27T10:03:00.000Z",
  replayed: "2026-04-27T10:04:00.000Z",
};

function buildEvents() {
  return [
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
      title: "Document created",
      summary: "Created a local document draft.",
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
      title: "Document removed",
      summary: "Removed an obsolete local document.",
      redactionMarkers: [
        {
          id: "red_doc_body",
          path: "$.document.body",
          reason: "Body text must stay summarized before replay.",
          marker: "[redacted:body]",
          severity: "blocking",
          createdAt: timestamps.deleteDoc,
        },
      ],
      replay: {
        status: "pending",
        issueCount: 1,
        issueCodes: ["marker_open"],
      },
    },
  ];
}

function buildReplayFixture() {
  const events = buildEvents();

  return {
    schemaVersion: "local-event-api-requests.v1",
    generatedAt: timestamps.generated,
    apiBase: "http://127.0.0.1:7317",
    requests: [
      {
        id: "api_list_events",
        title: "List local events",
        route: {
          method: "GET",
          path: "/v1/local-events",
        },
        response: {
          status: 200,
          body: {
            events: [events[0], events[1]],
          },
        },
      },
      {
        id: "api_replay_events",
        title: "Replay local events",
        route: {
          method: "POST",
          path: "/v1/local-events/replay",
        },
        response: {
          status: 200,
          body: {
            result: {
              localEvents: [events[2]],
            },
          },
        },
      },
    ],
  };
}

function buildErrorFixture() {
  return {
    generatedAt: timestamps.generated,
    requests: [
      {
        id: "api_export_error",
        route: {
          method: "POST",
          path: "/v1/local-events/export",
        },
        response: {
          status: 503,
          body: {
            error: {
              message:
                "Export failed for Bearer sk_live_secret at C:\\Users\\DELL\\private\\events.json token=local-secret",
            },
          },
        },
      },
    ],
  };
}

function testApiReplayBuildsRequestSummaryReplayAndExportViews() {
  const replay = buildReplayFixture();
  const original = structuredClone(replay);
  const state = buildLocalEventApiState(replay, {
    apiBase: "http://127.0.0.1:7317",
    exportFormat: "manifest",
  });

  assert.deepEqual(replay, original);
  assert.equal(state.phase, "success");
  assert.equal(state.status, "blocked");
  assert.equal(state.generatedAt, timestamps.generated);
  assert.equal(state.totalCount, 3);
  assert.equal(state.visibleCount, 3);

  assert.deepEqual(
    state.requestCards.map((card) => [
      card.requestId,
      card.method,
      card.routePath,
      card.status,
      card.statusCode,
      card.eventCount,
    ]),
    [
      ["api_list_events", "GET", "/v1/local-events", "success", 200, 2],
      ["api_replay_events", "POST", "/v1/local-events/replay", "success", 200, 1],
    ],
  );

  assert.deepEqual(
    state.catalog.summaries.map((summary) => summary.eventId),
    ["evt_doc_create", "evt_task_update", "evt_doc_delete"],
  );
  assert.deepEqual(
    state.replay.timelineRows.map((row) => [row.eventId, row.status]),
    [
      ["evt_doc_create", "ready"],
      ["evt_task_update", "attention"],
      ["evt_doc_delete", "blocked"],
    ],
  );
  assert.deepEqual(
    state.summaryCards.map((card) => [card.label, card.value, card.status]),
    [
      ["Local events", "3 events", "blocked"],
      ["Replay readiness", "Blocked", "blocked"],
      ["Redactions", "2 redaction markers", "blocked"],
      ["API requests", "2 requests", "success"],
    ],
  );

  assert.equal(state.exportView.format, "manifest");
  assert.equal(state.exportView.status, "blocked");
  assert.equal(state.exportView.eventCount, 3);
  assert.equal(state.exportView.redactionMarkerCount, 2);
  assert.deepEqual(
    JSON.parse(state.exportView.content).eventIds,
    ["evt_doc_create", "evt_task_update", "evt_doc_delete"],
  );
  assert.deepEqual(
    state.exportView.rows.map((row) => [row.eventId, row.status]),
    [
      ["evt_doc_create", "ready"],
      ["evt_task_update", "attention"],
      ["evt_doc_delete", "blocked"],
    ],
  );
}

function testFiltersAndFocusedBuildersUseCatalogReplayShapes() {
  const replay = buildReplayFixture();
  const state = buildLocalEventApiState(replay, {
    filter: {
      schemaKind: "document",
    },
    replayFilter: {
      schemaKind: "document",
      replayStatus: ["ready", "blocked"],
    },
    exportFormat: "jsonl",
  });

  assert.equal(state.totalCount, 3);
  assert.equal(state.visibleCount, 2);
  assert.deepEqual(
    state.catalog.summaries.map((summary) => summary.eventId),
    ["evt_doc_create", "evt_doc_delete"],
  );
  assert.deepEqual(
    buildLocalEventApiReplayState(replay, {
      replayFilter: { redactionStatus: "blocking" },
    }).timelineRows.map((row) => row.eventId),
    ["evt_doc_delete"],
  );

  const exportView = buildLocalEventApiExportView(replay, {
    filter: { schemaKind: "document" },
    exportFormat: "jsonl",
  });
  assert.equal(exportView.eventCount, 2);
  assert.equal(exportView.mediaType, "application/x-ndjson");
  assert.deepEqual(
    exportView.content
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line).id),
    ["evt_doc_create", "evt_doc_delete"],
  );

  assert.deepEqual(
    collectLocalEventApiEvents(replay).map((event) => event.id),
    ["evt_doc_create", "evt_task_update", "evt_doc_delete"],
  );
  assert.deepEqual(
    buildLocalEventApiRequestCards(replay).map((card) => card.requestId),
    ["api_list_events", "api_replay_events"],
  );
}

function testLoadingAndSafeErrorStates() {
  const loading = buildLocalEventApiLoadingState({
    defaultTimestamp: timestamps.generated,
  });
  assert.equal(loading.phase, "loading");
  assert.equal(loading.status, "loading");
  assert.equal(loading.generatedAt, timestamps.generated);
  assert.equal(loading.requestCards[0].status, "loading");
  assert.equal(loading.exportView.emptyState.label, "Export loading");

  const errored = buildLocalEventApiState(buildErrorFixture());
  assert.equal(errored.phase, "error");
  assert.equal(errored.status, "error");
  assert.equal(errored.requestCards[0].status, "error");
  assert.equal(errored.replay.status, "error");
  assert.equal(errored.exportView.emptyState.actionLabel, "Retry local events");

  const description = errored.errorStates[0].errorState.description;
  assert.match(description, /Bearer \[redacted\]/);
  assert.match(description, /token=\[redacted\]/);
  assert.match(description, /\[local path\]/);
  assert.equal(description.includes("sk_live_secret"), false);
  assert.equal(description.includes("local-secret"), false);
  assert.equal(description.includes("C:\\Users"), false);

  assert.deepEqual(
    buildLocalEventApiErrorStates(buildErrorFixture()).map((error) => [
      error.context,
      error.routeId,
      error.status,
      error.errorState.description,
    ]),
    [["export", "api_export_error", 503, description]],
  );
  assert.equal(
    buildLocalEventApiErrorState(
      "replay",
      new Error("Replay failed with apiKey=abc123"),
    ).errorState.description,
    "Replay failed with apiKey=[redacted]",
  );
  assert.equal(
    redactLocalEventApiError({
      message: "Refresh failed",
      authorization: "Bearer abc123",
    }),
    "Refresh failed",
  );
}

function testDirectSnakeCaseShapeAndDefensiveCloning() {
  const directResponse = {
    generated_at: timestamps.generated,
    local_events: [
      {
        event_id: "evt_connection_sync",
        stream_id: "stream_beta",
        sequence: 1,
        operation_kind: "sync",
        schema_kind: "connection",
        occurred_at: timestamps.replayed,
        risk_level: "low",
        title: "Connection sync replayed",
        summary: "Replayed a local connection sync.",
        replay: {
          status: "complete",
          replayed_at: timestamps.replayed,
        },
      },
    ],
  };
  const state = buildLocalEventApiState(directResponse);

  assert.equal(state.phase, "success");
  assert.equal(state.status, "complete");
  assert.equal(state.requestCards[0].routePath, "/v1/local-events");
  assert.equal(state.catalog.summaries[0].eventId, "evt_connection_sync");
  assert.equal(state.replay.timelineRows[0].status, "complete");

  state.requestCards[0].detailLabels.push("mutated");
  state.summaryCards[0].detailLabels.push("mutated");
  state.catalog.summaries[0].detailLabels.push("mutated");
  state.replay.timelineRows[0].detailLabels.push("mutated");
  state.exportView.rows[0].detailLabels.push("mutated");
  state.emptyStates.requests.label = "mutated";

  const rebuilt = buildLocalEventApiState(directResponse);
  assert.equal(rebuilt.requestCards[0].detailLabels.includes("mutated"), false);
  assert.equal(rebuilt.summaryCards[0].detailLabels.includes("mutated"), false);
  assert.equal(
    rebuilt.catalog.summaries[0].detailLabels.includes("mutated"),
    false,
  );
  assert.equal(
    rebuilt.replay.timelineRows[0].detailLabels.includes("mutated"),
    false,
  );
  assert.equal(
    rebuilt.exportView.rows[0].detailLabels.includes("mutated"),
    false,
  );
  assert.equal(rebuilt.emptyStates.requests.label, "No API requests");
}

testApiReplayBuildsRequestSummaryReplayAndExportViews();
testFiltersAndFocusedBuildersUseCatalogReplayShapes();
testLoadingAndSafeErrorStates();
testDirectSnakeCaseShapeAndDefensiveCloning();

console.log("local event api state tests passed");
