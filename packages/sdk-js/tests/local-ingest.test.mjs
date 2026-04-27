import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLocalSearchView,
  groupLocalQuarantineRecords,
  normalizeLocalSourceSummaries,
  prepareLocalQuarantineDecisionPayload,
  searchLocalText,
} from "../src/localIngest.ts";

test("normalizes source summaries into stable local documents", () => {
  const normalized = normalizeLocalSourceSummaries(sourceSummaries());

  assert.deepEqual(
    normalized.map((document) => [
      document.id,
      document.sourceId,
      document.sourceTitle,
      document.title,
      document.tags,
    ]),
    [
      [
        "notes:alpha",
        "notes",
        "Notes",
        "Alpha onboarding",
        ["draft", "team"],
      ],
      [
        "notes:beta",
        "notes",
        "Notes",
        "Beta billing",
        ["draft", "finance", "team"],
      ],
      [
        "tasks:1",
        "tasks",
        "Task Board",
        "Task Board",
        ["team"],
      ],
    ],
  );
  assert.equal(normalized[0].summary, "Reusable local app notes.");
  assert.match(normalized[0].body, /Offline cache/);
  assert.equal(normalized[0].metadata.owner, "product");
  assert.equal(normalized[0].metadata.importance, "high");
});

test("builds compact search views and returns deterministic snippets", () => {
  const documents = normalizeLocalSourceSummaries(sourceSummaries());
  const view = buildLocalSearchView(documents, {
    maxBodyChars: 96,
    maxSummaryChars: 80,
  });
  const results = searchLocalText(view, "offline review", {
    limit: 3,
    snippetRadius: 32,
  });

  assert.deepEqual(view.documents.map((document) => document.id), [
    "notes:alpha",
    "notes:beta",
    "tasks:1",
  ]);
  assert.equal(view.documents[0].body.length <= 96, true);
  assert.equal(view.tokens.includes("offline"), true);
  assert.deepEqual(
    results.map((result) => [result.id, result.matchedTerms, result.score]),
    [
      ["tasks:1", ["offline", "review"], 40],
      ["notes:alpha", ["offline", "review"], 12],
    ],
  );
  assert.equal(results[0].snippets.length, 2);
  assert.match(results[0].snippets[0], /offline/);
});

test("keeps text search tie breaks stable", () => {
  const view = buildLocalSearchView([
    normalizedDocument("source_b:2", "source_b", "Beta result", "shared token"),
    normalizedDocument("source_a:1", "source_a", "Alpha result", "shared token"),
  ]);

  const results = searchLocalText(view, "shared token");

  assert.deepEqual(results.map((result) => result.id), [
    "source_a:1",
    "source_b:2",
  ]);
});

test("groups quarantine records by reason, source, and status", () => {
  const records = quarantineRecords();

  const byReason = groupLocalQuarantineRecords(records);
  const bySource = groupLocalQuarantineRecords(records, { groupBy: "source" });
  const byStatus = groupLocalQuarantineRecords(records, { groupBy: "status" });

  assert.deepEqual(
    byReason.map((group) => [group.key, group.count, group.recordIds]),
    [
      ["duplicate", 1, ["qrn_003"]],
      ["missing-title", 2, ["qrn_001", "qrn_002"]],
    ],
  );
  assert.deepEqual(
    bySource.map((group) => [group.key, group.label, group.sourceIds]),
    [
      ["notes", "Notes", ["notes"]],
      ["tasks", "Task Board", ["tasks"]],
    ],
  );
  assert.deepEqual(
    byStatus.map((group) => [group.key, group.recordIds]),
    [
      ["pending", ["qrn_001", "qrn_002"]],
      ["reviewed", ["qrn_003"]],
    ],
  );
});

test("prepares stable quarantine decision payloads", () => {
  const payload = prepareLocalQuarantineDecisionPayload({
    records: quarantineRecords(),
    recordIds: ["qrn_002", "qrn_001", "qrn_001"],
    decision: "release",
    decidedAt: "2026-04-27T01:00:00.000Z",
    decidedBy: "user_local",
    reason: "Titles were added locally.",
    metadata: {
      queue: "local-ingest",
    },
  });
  const repeated = prepareLocalQuarantineDecisionPayload({
    records: quarantineRecords().reverse(),
    recordIds: ["qrn_001", "qrn_002"],
    decision: "release",
    decidedAt: "2026-04-27T01:00:00.000Z",
    decidedBy: "user_local",
    reason: "Titles were added locally.",
  });

  assert.equal(payload.decisionId, repeated.decisionId);
  assert.equal(payload.decision, "release");
  assert.deepEqual(payload.recordIds, ["qrn_001", "qrn_002"]);
  assert.deepEqual(
    payload.records.map((record) => [record.id, record.sourceId, record.reason]),
    [
      ["qrn_001", "notes", "missing-title"],
      ["qrn_002", "tasks", "missing-title"],
    ],
  );
  assert.deepEqual(payload.metadata, { queue: "local-ingest" });
});

test("surfaces invalid local ingest inputs", () => {
  assert.throws(
    () => searchLocalText({ documents: [] }, "token", { limit: 0 }),
    /limit must be a positive integer/,
  );
  assert.throws(
    () => groupLocalQuarantineRecords([
      { id: "   " },
    ]),
    /records\[0\]\.id must be a non-empty string/,
  );
  assert.throws(
    () => prepareLocalQuarantineDecisionPayload({
      records: quarantineRecords(),
      recordIds: ["missing"],
      decision: "discard",
    }),
    /recordIds contains unknown ids: missing/,
  );
});

function sourceSummaries() {
  return [
    {
      sourceId: "notes",
      title: "Notes",
      summary: "Reusable local app notes.",
      tags: ["team", "draft", "team"],
      metadata: {
        owner: "product",
      },
      documents: [
        {
          id: "beta",
          title: "Beta billing",
          summary: "Invoice sync notes.",
          body: "Billing import queues support retry batches and compact previews.",
          tags: ["finance"],
        },
        {
          id: "alpha",
          title: "Alpha onboarding",
          body: "Offline cache setup and review checklist for local-first workspaces.",
          tags: ["team"],
          updatedAt: "2026-04-27T00:20:00.000Z",
          metadata: {
            importance: "high",
          },
        },
      ],
    },
    {
      sourceId: "tasks",
      title: "Task Board",
      summary: "Offline review tasks",
      text: "Review offline cache entries and assign owners.",
      tags: ["team"],
    },
  ];
}

function quarantineRecords() {
  return [
    {
      id: "qrn_002",
      sourceId: "tasks",
      sourceTitle: "Task Board",
      documentId: "tasks:1",
      title: "Task Board",
      reason: "missing-title",
      status: "pending",
      createdAt: "2026-04-27T00:30:02.000Z",
    },
    {
      id: "qrn_001",
      sourceId: "notes",
      sourceTitle: "Notes",
      documentId: "notes:alpha",
      title: "Alpha onboarding",
      reason: "missing-title",
      status: "pending",
      createdAt: "2026-04-27T00:30:01.000Z",
    },
    {
      id: "qrn_003",
      sourceId: "notes",
      sourceTitle: "Notes",
      documentId: "notes:beta",
      title: "Beta billing",
      reason: "duplicate",
      status: "reviewed",
      createdAt: "2026-04-27T00:30:03.000Z",
    },
  ];
}

function normalizedDocument(id, sourceId, title, body) {
  return {
    id,
    sourceId,
    sourceTitle: sourceId,
    title,
    summary: "",
    body,
    tags: [],
    metadata: {},
  };
}
