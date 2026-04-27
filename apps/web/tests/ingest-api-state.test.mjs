import assert from "node:assert/strict";

import {
  buildIngestApiErrorStates,
  buildIngestApiQuarantineQueueState,
  buildIngestApiSearchRows,
  buildIngestApiSourceCards,
  buildIngestApiState,
  collectIngestApiQuarantineItems,
  collectIngestApiSearchResults,
  collectIngestApiSourceSummaries,
} from "../src/ingestApiState.ts";

const apiRequestsFixture = {
  schemaVersion: "ingest-search-api-requests.v1",
  generatedAt: "2026-04-27T08:00:00.000Z",
  requests: [
    {
      id: "api_repository_scan",
      title: "Scan fixture paths",
      route: {
        method: "POST",
        path: "/v1/ingest/repository/scan",
      },
      request: {
        body: {
          workspaceId: "wsp_ingest_demo",
          localPath: "examples/ingest-search",
        },
      },
      response: {
        status: 200,
        body: {
          ok: true,
          sources: [
            {
              sourceUri: "fixture://ingest-search/zeta.json",
              path: "examples/ingest-search/zeta.json",
              mediaType: "application/json",
              state: "indexed",
            },
            {
              sourceUri: "fixture://ingest-search/records.csv",
              path: "examples/ingest-search/records.csv",
              mediaType: "text/csv",
              state: "partly_quarantined",
            },
            {
              sourceUri: "fixture://ingest-search/notes.md",
              path: "examples/ingest-search/notes.md",
              mediaType: "text/markdown",
              state: "indexed",
            },
          ],
        },
      },
    },
    {
      id: "api_structured_csv",
      title: "Parse CSV",
      route: {
        method: "POST",
        path: "/v1/ingest/structured",
      },
      request: {
        body: {
          workspaceId: "wsp_ingest_demo",
          sourceUri: "fixture://ingest-search/records.csv",
          mediaType: "text/csv",
        },
      },
      response: {
        status: 200,
        body: {
          ok: true,
          summary: {
            documentCount: 4,
            indexedCount: 2,
            quarantineCount: 1,
          },
          documents: [
            {
              id: "idx_csv_alpha",
              sourceUri: "fixture://ingest-search/records.csv",
              mediaType: "text/csv",
              title: "Notebook import",
            },
          ],
          quarantine: {
            items: [
              {
                id: "qtn_csv_beta",
                sourceUri: "fixture://ingest-search/records.csv",
                reasonCode: "needs_local_review",
                content: "Metric recap needs review.",
                mediaType: "text/csv",
                quarantineState: "open",
              },
            ],
          },
        },
      },
    },
    {
      id: "api_search_query",
      title: "Search local index",
      route: {
        method: "POST",
        path: "/v1/search/query",
      },
      request: {
        body: {
          workspaceId: "wsp_ingest_demo",
          query: "checksum",
          limit: 5,
        },
      },
      response: {
        status: 200,
        body: {
          ok: true,
          query: "checksum",
          results: [
            {
              id: "res_low",
              score: 0.45,
              sourceUri: "fixture://ingest-search/notes.md",
              mediaType: "text/markdown",
              title: "Notebook setup",
              snippet: "Notebook setup mentions checksum checks.",
              updatedAt: "2026-04-27T08:01:00.000Z",
            },
            {
              id: "res_high",
              score: 1.7,
              sourceUri: "fixture://ingest-search/zeta.json",
              mediaType: "application/json",
              title: "Checksum recap",
              snippet: "Checksum recap keeps source checksums near local notes.",
              updatedAt: "2026-04-27T08:02:00.000Z",
            },
          ],
        },
      },
    },
    {
      id: "api_quarantine_cases",
      title: "Build queue cases",
      route: {
        method: "POST",
        path: "/v1/quarantine/cases",
      },
      request: {
        body: {
          workspaceId: "wsp_ingest_demo",
          items: [
            {
              id: "qtn_manual",
              sourceUri: "fixture://ingest-search/manual.txt",
              reasonCode: "duplicate_record",
              content: "Duplicate manual row.",
              mediaType: "text/plain",
            },
          ],
        },
      },
      response: {
        status: 200,
        body: {
          ok: true,
          cases: [
            {
              id: "qtn_manual",
              sourceUri: "fixture://ingest-search/manual.txt",
              state: "open",
              reasonCodes: ["duplicate_record"],
              severity: "low",
              previewText: "Duplicate manual row.",
              allowedActions: ["release", "reject"],
            },
            {
              id: "qtn_released",
              sourceUri: "fixture://ingest-search/records.csv",
              state: "released",
              reasonCodes: ["needs_local_review"],
              severity: "medium",
              previewText: "Released row.",
              decision: {
                action: "release",
                actorId: "act_local",
                timestamp: "2026-04-27T08:05:00.000Z",
              },
            },
          ],
        },
      },
    },
    {
      id: "api_search_error",
      title: "Search error",
      route: {
        method: "POST",
        path: "/v1/search/query",
      },
      request: {
        body: {
          workspaceId: "wsp_ingest_demo",
          query: "missing",
        },
      },
      response: {
        status: 503,
        body: {
          error: {
            code: "index_unavailable",
            message: "Index offline",
          },
        },
      },
    },
  ],
};

function testFullApiStateFromFixture() {
  const original = structuredClone(apiRequestsFixture);
  const state = buildIngestApiState(apiRequestsFixture, {
    decisionFilter: "all",
    snippetLength: 48,
  });

  assert.deepEqual(apiRequestsFixture, original);
  assert.deepEqual(
    state.sourceCards.map((card) => card.title),
    ["manual.txt", "records.csv", "notes.md", "zeta.json"],
  );
  assert.equal(state.sourceCards[0].status, "attention");
  assert.equal(state.sourceCards[1].indexedCount, 2);
  assert.equal(state.sourceCards[1].quarantinedCount, 1);

  assert.deepEqual(
    state.searchRows.map((row) => row.resultId),
    ["res_high", "res_low"],
  );
  assert.equal(state.searchRows[0].score, 1);
  assert.equal(state.searchRows[0].scoreLabel, "100% match");
  assert.ok(
    state.searchRows[0].snippet.segments.some(
      (segment) =>
        segment.highlighted &&
        segment.text.toLocaleLowerCase() === "checksum",
    ),
  );

  assert.deepEqual(
    state.quarantineQueue.items.map((item) => item.itemId),
    ["qtn_csv_beta", "qtn_manual", "qtn_released"],
  );
  assert.equal(state.quarantineQueue.pendingCount, 2);
  assert.equal(state.quarantineQueue.decidedCount, 1);
  assert.equal(state.quarantineQueue.items[1].reason, "duplicate");
  assert.equal(state.quarantineQueue.items[2].decision, "release");
  assert.equal(state.quarantineQueue.items[2].decidedBy, "act_local");

  assert.deepEqual(
    state.errorStates.map((error) => [error.context, error.errorState.description]),
    [["search", "Index offline"]],
  );
}

function testFocusedBuildersAndInputCollections() {
  const sources = collectIngestApiSourceSummaries(apiRequestsFixture);
  assert.deepEqual(
    sources.map((source) => [source.label, source.status]),
    [
      ["manual.txt", "attention"],
      ["records.csv", "attention"],
      ["notes.md", "ready"],
      ["zeta.json", "ready"],
    ],
  );

  const cards = buildIngestApiSourceCards(apiRequestsFixture);
  assert.equal(cards[1].valueLabel, "2 indexed items");

  const searchResults = collectIngestApiSearchResults(apiRequestsFixture);
  assert.deepEqual(
    searchResults.map((result) => [result.id, result.score]),
    [
      ["res_high", 1],
      ["res_low", 0.45],
    ],
  );

  const rows = buildIngestApiSearchRows(apiRequestsFixture, {
    query: "notebook",
    snippetLength: 40,
  });
  assert.equal(rows[1].snippet.matchCount, 1);

  const quarantineItems = collectIngestApiQuarantineItems(apiRequestsFixture);
  assert.deepEqual(
    quarantineItems.map((item) => [item.id, item.decision]),
    [
      ["qtn_csv_beta", "pending"],
      ["qtn_manual", "pending"],
      ["qtn_released", "release"],
    ],
  );

  const pendingQueue = buildIngestApiQuarantineQueueState(apiRequestsFixture);
  assert.deepEqual(
    pendingQueue.items.map((item) => item.itemId),
    ["qtn_csv_beta", "qtn_manual"],
  );
}

function testBareResponseShapes() {
  const snakeCaseResponse = {
    searchResult: {
      document: {
        source_uri: "file:///workspace/notes/alpha.txt",
        content: "Alpha beta content",
        media_type: "text/plain",
        updated_at: "2026-04-27T00:00:00.000Z",
      },
      score: 3,
      snippet: "Alpha beta content",
    },
    quarantineRecord: {
      id: "q_0123456789abcdefabcd",
      source_uri: "file:///workspace/items.csv",
      reason_codes: ["duplicate_record"],
      severity: "low",
      preview_text: "duplicate sample row",
      state: "rejected",
      decisions: [
        {
          action: "reject",
          actor_id: "worker-1",
          timestamp: "2026-04-27T09:25:00.000Z",
        },
      ],
    },
  };

  const rows = buildIngestApiSearchRows(snakeCaseResponse, { query: "alpha" });
  assert.equal(rows[0].resultId.startsWith("result_"), true);
  assert.equal(rows[0].score, 1);
  assert.equal(rows[0].kindLabel, "text/plain");
  assert.equal(rows[0].snippet.matchCount, 1);

  const queue = buildIngestApiQuarantineQueueState(snakeCaseResponse, {
    decisionFilter: "all",
  });
  assert.equal(queue.items[0].decision, "discard");
  assert.equal(queue.items[0].decidedBy, "worker-1");
}

function testErrorStateMapping() {
  const errors = buildIngestApiErrorStates({
    id: "api_quarantine_error",
    route: {
      path: "/v1/quarantine/cases",
    },
    response: {
      status: 422,
      body: {
        error: {
          message: "Case payload invalid",
        },
      },
    },
  });

  assert.equal(errors.length, 1);
  assert.equal(errors[0].context, "quarantine");
  assert.equal(errors[0].status, 422);
  assert.deepEqual(errors[0].errorState, {
    id: "ingest_quarantine_error",
    label: "Quarantine queue could not load",
    description: "Case payload invalid",
    ariaLabel: "Quarantine queue could not load",
    retryLabel: "Retry queue",
  });

  const queue = buildIngestApiQuarantineQueueState({
    id: "api_quarantine_error",
    route: {
      path: "/v1/quarantine/cases",
    },
    response: {
      status: 500,
      body: {
        error: {
          message: "Queue unavailable",
        },
      },
    },
  });
  assert.equal(queue.status, "error");
  assert.equal(queue.errorState.description, "Queue unavailable");
}

function testReturnedStateIsDefensivelyCloned() {
  const state = buildIngestApiState(apiRequestsFixture, {
    decisionFilter: "all",
  });

  state.sources[0].label = "mutated";
  state.sourceCards[0].detailLabels.push("mutated");
  state.searchResults[0].title = "mutated";
  state.searchRows[0].snippet.segments[0].text = "mutated";
  state.quarantineItems[0].title = "mutated";
  state.quarantineQueue.items[0].detailLabels.push("mutated");
  state.errorStates[0].errorState.description = "mutated";

  const rebuilt = buildIngestApiState(apiRequestsFixture, {
    decisionFilter: "all",
  });
  assert.equal(rebuilt.sources[0].label, "manual.txt");
  assert.equal(rebuilt.sourceCards[0].detailLabels.includes("mutated"), false);
  assert.equal(rebuilt.searchResults[0].title, "Checksum recap");
  assert.notEqual(rebuilt.searchRows[0].snippet.segments[0].text, "mutated");
  assert.equal(rebuilt.quarantineItems[0].title, "Metric recap needs review.");
  assert.equal(
    rebuilt.quarantineQueue.items[0].detailLabels.includes("mutated"),
    false,
  );
  assert.equal(rebuilt.errorStates[0].errorState.description, "Index offline");
}

testFullApiStateFromFixture();
testFocusedBuildersAndInputCollections();
testBareResponseShapes();
testErrorStateMapping();
testReturnedStateIsDefensivelyCloned();

console.log("ingest api state tests passed");
