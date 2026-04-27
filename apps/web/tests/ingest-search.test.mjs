import assert from "node:assert/strict";

import {
  buildHighlightedSnippet,
  buildIngestQuarantineQueueState,
  buildIngestSearchEmptyState,
  buildIngestSearchErrorState,
  buildIngestSourceSummaryCards,
  buildSearchResultRows,
  getIngestQuarantineDecisionLabel,
} from "../src/ingestSearch.ts";

const sources = [
  {
    id: "src_notes",
    label: "Notes",
    kind: "markdown",
    status: "ready",
    indexedCount: 12,
    queuedCount: 1,
    quarantinedCount: 0,
    lastIndexedAt: "2026-04-27T01:00:00.000Z",
  },
  {
    id: "src_archive",
    label: "Archive",
    kind: "json",
    status: "ready",
    indexedCount: 4,
    queuedCount: 0,
    quarantinedCount: 2,
  },
  {
    id: "src_feed",
    label: "Feed",
    kind: "rss",
    status: "error",
    indexedCount: 0,
    lastError: "Connection refused",
  },
];

const results = [
  {
    id: "res_slow",
    sourceId: "src_notes",
    sourceLabel: "Notes",
    title: "Notebook setup",
    kind: "note",
    text: "Setup notes mention alpha import health and retry windows.",
    score: 0.64,
    updatedAt: "2026-04-27T01:05:00.000Z",
  },
  {
    id: "res_fast",
    sourceId: "src_archive",
    sourceLabel: "Archive",
    title: "Index run summary",
    kind: "record",
    text:
      "The archive index captured Alpha entries, source coverage, and queue counts.",
    score: 0.91,
    url: "https://example.test/archive/summary",
    updatedAt: "2026-04-27T01:10:00.000Z",
  },
  {
    id: "res_blank",
    sourceId: "src_notes",
    sourceLabel: "Notes",
    title: "Blank preview",
    kind: "note",
    text: "",
    score: 0.2,
  },
];

const quarantineItems = [
  {
    id: "qua_newer",
    sourceId: "src_archive",
    sourceLabel: "Archive",
    title: "Archive row 41",
    reason: "failed_validation",
    quarantinedAt: "2026-04-27T03:00:00.000Z",
    detail: "Missing title field",
    retryCount: 1,
  },
  {
    id: "qua_older",
    sourceId: "src_notes",
    sourceLabel: "Notes",
    title: "Notes import",
    reason: "parse_error",
    quarantinedAt: "2026-04-27T02:00:00.000Z",
    contentType: "text/markdown",
  },
  {
    id: "qua_released",
    sourceId: "src_feed",
    sourceLabel: "Feed",
    title: "Feed entry",
    reason: "duplicate",
    quarantinedAt: "2026-04-27T01:30:00.000Z",
    decision: "release",
    decidedAt: "2026-04-27T03:30:00.000Z",
    decidedBy: "act_reviewer",
  },
];

function testSourceSummaryCards() {
  const cards = buildIngestSourceSummaryCards(sources);

  assert.deepEqual(
    cards.map((card) => card.sourceId),
    ["src_feed", "src_archive", "src_notes"],
  );
  assert.equal(cards[0].status, "error");
  assert.equal(cards[0].statusLabel, "Error");
  assert.match(cards[0].ariaLabel, /0 indexed items/);
  assert.equal(cards[1].status, "attention");
  assert.deepEqual(cards[2].detailLabels, [
    "Ready source",
    "1 queued item",
    "0 quarantined items",
    "Last indexed at 2026-04-27T01:00:00.000Z",
  ]);

  cards[2].detailLabels.push("mutated");
  assert.equal(buildIngestSourceSummaryCards(sources)[2].detailLabels.length, 4);
}

function testSearchRowsAndHighlightedSnippets() {
  const rows = buildSearchResultRows(results, {
    query: "alpha index",
    snippetLength: 72,
  });

  assert.deepEqual(
    rows.map((row) => row.resultId),
    ["res_fast", "res_slow", "res_blank"],
  );
  assert.equal(rows[0].scoreLabel, "91% match");
  assert.equal(rows[0].url, "https://example.test/archive/summary");
  assert.equal(rows[0].snippet.matchCount, 2);
  assert.deepEqual(
    rows[0].snippet.segments
      .filter((segment) => segment.highlighted)
      .map((segment) => segment.text.toLocaleLowerCase()),
    ["index", "alpha"],
  );
  assert.equal(rows[2].snippet.plainText, "No preview text available.");

  const blankQuery = buildSearchResultRows([results[0]], { query: "" });
  assert.equal(blankQuery[0].snippet.matchCount, 0);
  assert.equal(blankQuery[0].snippet.segments[0].highlighted, false);

  rows[0].snippet.segments[0].text = "mutated";
  assert.notEqual(
    buildSearchResultRows(results, { query: "alpha index", snippetLength: 72 })[0]
      .snippet.segments[0].text,
    "mutated",
  );
}

function testStandaloneSnippetTruncation() {
  const snippet = buildHighlightedSnippet(
    "First sentence. A long middle section introduces retry handling for Alpha records near the end.",
    "alpha",
    48,
  );

  assert.equal(snippet.isTruncated, true);
  assert.equal(snippet.matchCount, 1);
  assert.ok(snippet.plainText.startsWith("..."));
  assert.ok(
    snippet.segments.some(
      (segment) =>
        segment.highlighted && segment.text.toLocaleLowerCase() === "alpha",
    ),
  );
}

function testQuarantineQueueStateAndDecisionLabels() {
  const queue = buildIngestQuarantineQueueState(quarantineItems);

  assert.equal(queue.status, "attention");
  assert.equal(queue.totalCount, 3);
  assert.equal(queue.pendingCount, 2);
  assert.equal(queue.decidedCount, 1);
  assert.deepEqual(
    queue.items.map((item) => item.itemId),
    ["qua_older", "qua_newer"],
  );
  assert.deepEqual(
    queue.items.map((item) => item.reasonLabel),
    ["Parsing failed", "Validation failed"],
  );
  assert.equal(queue.items[0].decisionLabel.label, "Needs review");
  assert.deepEqual(queue.items[1].detailLabels, [
    "Validation failed",
    "Quarantined at 2026-04-27T03:00:00.000Z",
    "1 retry",
    "Missing title field",
  ]);

  const all = buildIngestQuarantineQueueState(quarantineItems, {
    decisionFilter: "all",
  });
  assert.deepEqual(
    all.items.map((item) => item.itemId),
    ["qua_older", "qua_newer", "qua_released"],
  );
  assert.equal(all.items[2].decisionLabel.label, "Release to index");

  const releasedOnly = buildIngestQuarantineQueueState(quarantineItems, {
    decisionFilter: "retry",
  });
  assert.equal(releasedOnly.items.length, 0);
  assert.equal(releasedOnly.emptyState.label, "No retry ingest items");

  assert.deepEqual(getIngestQuarantineDecisionLabel("discard"), {
    decision: "discard",
    label: "Discard item",
    description: "The item should stay out of searchable content.",
    status: "complete",
  });
}

function testEmptyAndErrorStates() {
  assert.deepEqual(
    buildIngestSearchEmptyState("search", {
      query: "alpha",
      actionLabel: "Clear query",
    }),
    {
      id: "ingest_search_empty",
      label: 'No results for "alpha"',
      description: "Try another query or check source coverage.",
      ariaLabel: "No search results for alpha",
      actionLabel: "Clear query",
    },
  );

  assert.deepEqual(buildIngestSearchEmptyState("sources"), {
    id: "ingest_sources_empty",
    label: "No sources connected",
    description: "Connect a source before running ingest or search.",
    ariaLabel: "No ingest sources are connected",
  });

  assert.deepEqual(
    buildIngestSearchErrorState("search", new Error("Index unavailable")),
    {
      id: "ingest_search_error",
      label: "Search could not run",
      description: "Index unavailable",
      ariaLabel: "Search could not run",
      retryLabel: "Retry search",
    },
  );

  const queue = buildIngestQuarantineQueueState([], {
    error: "Queue timeout",
  });
  assert.equal(queue.status, "error");
  assert.equal(queue.errorState.description, "Queue timeout");
}

function testValidation() {
  assert.throws(
    () => buildHighlightedSnippet("alpha", "alpha", 12),
    /snippetLength/,
  );
  assert.throws(
    () =>
      buildIngestSourceSummaryCards([
        {
          id: "src_bad",
          label: "Bad source",
          kind: "json",
          status: "ready",
          indexedCount: -1,
        },
      ]),
    /indexedCount/,
  );
  assert.throws(
    () =>
      buildIngestQuarantineQueueState([
        {
          id: "qua_bad",
          sourceId: "src_notes",
          sourceLabel: "Notes",
          title: "Bad item",
          reason: "parse_error",
          quarantinedAt: "not-a-date",
        },
      ]),
    /quarantinedAt/,
  );
}

testSourceSummaryCards();
testSearchRowsAndHighlightedSnippets();
testStandaloneSnippetTruncation();
testQuarantineQueueStateAndDecisionLabels();
testEmptyAndErrorStates();
testValidation();

console.log("ingest search tests passed");
