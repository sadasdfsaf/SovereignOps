import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runIngestSearchCli } from "../src/ingestSearch.ts";

const repository = Object.freeze({
  schemaVersion: "ingest-search-repository.v1",
  workspaceId: "wsp_ingest_demo",
  generatedAt: "2026-04-27T00:00:00.000Z",
  sources: [
    {
      sourceUri: "fixture://ingest-search/records.csv",
      path: "examples/ingest-search/records.csv",
      mediaType: "text/csv",
      checksum: "sha_csv",
      state: "partly_quarantined",
    },
    {
      sourceUri: "fixture://ingest-search/notes.md",
      path: "examples/ingest-search/notes.md",
      mediaType: "text/markdown",
      checksum: "sha_md",
      state: "indexed",
    },
    {
      sourceUri: "fixture://ingest-search/records.json",
      path: "examples/ingest-search/records.json",
      mediaType: "application/json",
      checksum: "sha_json",
      state: "indexed",
    },
  ],
});

const searchIndex = Object.freeze({
  schemaVersion: "ingest-search-index.v1",
  workspaceId: "wsp_ingest_demo",
  documents: [
    document(
      "idx_beta",
      "fixture://ingest-search/records.json",
      "Checksum recap",
      "Checksums detect repeated source content before indexing.",
      "application/json",
    ),
    document(
      "idx_alpha",
      "fixture://ingest-search/notes.md",
      "Notebook Import",
      "local-first search import with citations and checksums",
      "text/markdown",
    ),
    document(
      "idx_csv",
      "fixture://ingest-search/records.csv",
      "Notebook import",
      "Avery owns the indexed notebook import row",
      "text/csv",
    ),
  ],
});

const quarantine = Object.freeze({
  schemaVersion: "ingest-search-quarantine.v1",
  workspaceId: "wsp_ingest_demo",
  items: [
    {
      id: "qtn_csv_beta_status",
      sourceUri: "fixture://ingest-search/records.csv",
      checksum: "sha_csv",
      reasonCode: "needs_local_review",
      reason: "The row is held outside the index until local review accepts the status value.",
      citation: {
        sourceUri: "fixture://ingest-search/records.csv",
        range: {
          column: "status",
          row: 3,
        },
        trusted: false,
      },
      untrusted: true,
    },
  ],
});

test("summarizes source fixture JSON deterministically", async () => {
  const first = await runIngestSearchCli([
    "ingest",
    "search",
    "source",
    "summary",
    "--input-json",
    JSON.stringify(repository),
  ]);
  const second = await runIngestSearchCli([
    "ingest-search",
    "source",
    "summarize",
    "--stdin",
  ], {
    stdin: JSON.stringify({
      sources: [...repository.sources].reverse(),
      workspaceId: repository.workspaceId,
      schemaVersion: repository.schemaVersion,
      generatedAt: repository.generatedAt,
    }),
  });
  const summary = JSON.parse(first.stdout);

  assert.equal(first.exitCode, 0);
  assert.equal(first.stderr, "");
  assert.equal(first.stdout, second.stdout);
  assert.deepEqual(summary.summary.mediaTypes, {
    "application/json": 1,
    "text/csv": 1,
    "text/markdown": 1,
  });
  assert.deepEqual(summary.summary.states, {
    indexed: 2,
    partly_quarantined: 1,
  });
  assert.deepEqual(
    summary.sources.map((source) => source.sourceUri),
    [
      "fixture://ingest-search/notes.md",
      "fixture://ingest-search/records.csv",
      "fixture://ingest-search/records.json",
    ],
  );
});

test("searches index fixture JSON with stable ranking and filters", async () => {
  const result = await runIngestSearchCli([
    "ingest",
    "search",
    "index",
    "search",
    "--index-path",
    "fixture-index.json",
    "--query",
    "notebook import",
    "--media-type",
    "text/csv",
    "--limit",
    "5",
  ], {
    files: {
      readText(path) {
        assert.equal(path, "fixture-index.json");
        return JSON.stringify(searchIndex);
      },
    },
  });
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.summary.documentCount, 3);
  assert.equal(payload.summary.resultCount, 1);
  assert.deepEqual(payload.results.map((item) => item.id), ["idx_csv"]);
  assert.equal(payload.results[0].score, 4);
  assert.deepEqual(payload.results[0].matchedTerms, ["import", "notebook"]);
  assert.equal(payload.results[0].citation.range.row, 2);
});

test("lists quarantine fixture records with summary counts", async () => {
  const result = await runIngestSearchCli([
    "ingest",
    "search",
    "quarantine",
    "list",
    "--quarantine-json",
    JSON.stringify(quarantine),
    "--source-uri",
    "fixture://ingest-search/records.csv",
  ]);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.summary.itemCount, 1);
  assert.deepEqual(payload.summary.reasonCodes, { needs_local_review: 1 });
  assert.deepEqual(payload.items.map((item) => item.id), ["qtn_csv_beta_status"]);
});

test("writes quarantine decision JSON to stdout and output path", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "ingest-search-cli-"));
  const outputPath = join(tempDir, "decision.json");

  try {
    const result = await runIngestSearchCli([
      "ingest",
      "search",
      "quarantine",
      "decide",
      "--quarantine-json",
      JSON.stringify(quarantine),
      "--item-id",
      "qtn_csv_beta_status",
      "--decision",
      "release",
      "--actor-id",
      "worker_5",
      "--reason",
      "local review completed",
      "--timestamp",
      "2026-04-27T09:30:00.000Z",
      "--output",
      outputPath,
    ]);
    const written = await readFile(outputPath, "utf-8");
    const payload = JSON.parse(result.stdout);

    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    assert.equal(written, result.stdout);
    assert.equal(payload.kind, "ingest-search.quarantine-decision");
    assert.equal(payload.itemId, "qtn_csv_beta_status");
    assert.equal(payload.toState, "released");
    assert.equal(payload.auditEventSummary.eventType, "quarantine_decision");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("reports invalid ingest/search argv", async () => {
  const missingInput = await runIngestSearchCli(["ingest", "search", "source", "summary"]);
  const invalidLimit = await runIngestSearchCli([
    "ingest",
    "search",
    "index",
    "search",
    "--index-json",
    JSON.stringify(searchIndex),
    "--query",
    "notebook",
    "--limit",
    "0",
  ]);
  const unknownFlag = await runIngestSearchCli([
    "ingest",
    "search",
    "quarantine",
    "list",
    "--quarantine-json",
    JSON.stringify(quarantine),
    "--unexpected",
    "value",
  ]);

  assert.equal(missingInput.exitCode, 2);
  assert.match(missingInput.stderr, /Missing required option/);
  assert.equal(invalidLimit.exitCode, 2);
  assert.match(invalidLimit.stderr, /positive integer/);
  assert.equal(unknownFlag.exitCode, 2);
  assert.match(unknownFlag.stderr, /Unsupported option: --unexpected/);
});

function document(id, sourceUri, title, body, mediaType) {
  return {
    id,
    sourceUri,
    mediaType,
    checksum: `checksum_${id}`,
    title,
    body,
    citations: [
      {
        sourceUri,
        range: {
          row: 2,
        },
        trusted: false,
      },
    ],
    quarantineState: "clear",
  };
}
