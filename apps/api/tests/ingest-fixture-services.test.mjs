import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createIngestRoutes } from "../src/ingestRoutes.ts";
import {
  IngestFixtureValidationError,
  createIngestRouteStateFromFixtures,
  createIngestRouteStateFromIngestSearchFixtures,
  createIngestRouteStateSeedFromFixtures,
  loadIngestSearchFixtureBundle,
  resolveIngestSearchFixturePaths,
  resolvePathUnderWorkspace,
  validateIngestSearchFixtureBundle,
} from "../src/ingestFixtureServices.ts";
import { createApiRouter } from "../src/router.ts";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDirectory, "../../..");

test("resolves fixture paths only under the workspace root", () => {
  const paths = resolveIngestSearchFixturePaths({ workspaceRoot });

  assert.equal(
    paths.repository,
    resolve(workspaceRoot, "examples/ingest-search/repository.json"),
  );
  assert.equal(
    paths.searchIndex,
    resolve(workspaceRoot, "examples/ingest-search/search-index.json"),
  );
  assert.equal(
    resolvePathUnderWorkspace(
      workspaceRoot,
      "examples/ingest-search/../ingest-search/notes.md",
    ),
    resolve(workspaceRoot, "examples/ingest-search/notes.md"),
  );
  assert.throws(
    () => resolvePathUnderWorkspace(workspaceRoot, "../outside.json"),
    IngestFixtureValidationError,
  );
});

test("validates and adapts ingest search fixtures into route seed data", () => {
  const fixtures = loadIngestSearchFixtureBundle({ workspaceRoot });
  assert.deepEqual(validateIngestSearchFixtureBundle(fixtures, { workspaceRoot }), []);

  const seed = createIngestRouteStateSeedFromFixtures(fixtures, { workspaceRoot });

  assert.deepEqual(
    seed.sources.map((source) => [
      source.sourceId,
      source.label,
      source.kind,
      source.itemCount,
      source.quarantinedCount,
      source.updatedAt,
    ]),
    [
      [
        "fixture://ingest-search/notes.md",
        "notes.md",
        "markdown",
        1,
        0,
        "2026-04-27T00:03:00.000Z",
      ],
      [
        "fixture://ingest-search/records.csv",
        "records.csv",
        "csv",
        2,
        1,
        "2026-04-27T00:03:00.000Z",
      ],
      [
        "fixture://ingest-search/records.json",
        "records.json",
        "json",
        1,
        0,
        "2026-04-27T00:03:00.000Z",
      ],
    ],
  );
  assert.deepEqual(
    seed.documents.map((document) => [
      document.id,
      document.sourceId,
      document.metadata.sourcePath,
      document.metadata.checksum,
    ]),
    [
      [
        "idx_csv_alpha",
        "fixture://ingest-search/records.csv",
        "examples/ingest-search/records.csv",
        "42a535013f7103d295d7e9156b1cb748178d3bc3a0fe00079c6546f40db93e6a",
      ],
      [
        "idx_json_beta",
        "fixture://ingest-search/records.json",
        "examples/ingest-search/records.json",
        "ecd867eb7c3f7043c7cfcb6e23d6776cad0543b287621cb892449ac45aa90063",
      ],
      [
        "idx_notes_intro",
        "fixture://ingest-search/notes.md",
        "examples/ingest-search/notes.md",
        "c6a91ee2a9789110ebb39cbd27c7f48c26087c5c13aff8bda69da669ada3cda7",
      ],
    ],
  );
  assert.deepEqual(
    seed.quarantineRecords.map((record) => [
      record.id,
      record.sourceId,
      record.itemId,
      record.title,
      record.status,
      record.createdAt,
    ]),
    [
      [
        "qtn_csv_beta_status",
        "fixture://ingest-search/records.csv",
        "qtn_csv_beta_status",
        "Metric recap requires local review before indexing.",
        "pending",
        "2026-04-27T08:00:00.000Z",
      ],
    ],
  );
  assert.equal(seed.now(), "2026-04-27T08:05:00.000Z");
});

test("builds deterministic route state from fixture joins", async () => {
  const fixtures = loadIngestSearchFixtureBundle({ workspaceRoot });
  const state = createIngestRouteStateFromFixtures(fixtures, { workspaceRoot });
  const router = createApiRouter(createIngestRoutes(state, { basePath: "/fixture/ingest" }));

  const sources = await router.dispatch({
    method: "GET",
    path: "/fixture/ingest/sources",
  });
  assertJsonResponse(sources, 200);
  assert.deepEqual(
    sources.body.sources.map((source) => [source.sourceId, source.itemCount]),
    [
      ["fixture://ingest-search/notes.md", 1],
      ["fixture://ingest-search/records.csv", 2],
      ["fixture://ingest-search/records.json", 1],
    ],
  );

  const search = await router.dispatch({
    method: "POST",
    path: "/fixture/ingest/search",
    body: {
      query: "checksum",
      sourceIds: ["fixture://ingest-search/records.json"],
      limit: 5,
    },
  });
  assertJsonResponse(search, 200);
  assert.deepEqual(
    search.body.hits.map((hit) => [hit.id, hit.score, hit.metadata.sourcePath]),
    [["idx_json_beta", 5, "examples/ingest-search/records.json"]],
  );

  const listed = await router.dispatch({
    method: "GET",
    path: "/fixture/ingest/quarantine",
  });
  assertJsonResponse(listed, 200);
  assert.deepEqual(
    listed.body.records.map((record) => [record.id, record.status]),
    [["qtn_csv_beta_status", "pending"]],
  );

  const decided = await router.dispatch({
    method: "POST",
    path: "/fixture/ingest/quarantine/qtn_csv_beta_status/decision",
    body: {
      decision: "release",
      actorId: "local_reviewer",
      reason: "Status accepted for local indexing.",
    },
  });
  assertJsonResponse(decided, 200);
  assert.deepEqual(
    [
      decided.body.record.id,
      decided.body.record.status,
      decided.body.record.decidedAt,
      decided.body.record.decidedBy,
      decided.body.record.decisionReason,
    ],
    [
      "qtn_csv_beta_status",
      "released",
      "2026-04-27T08:05:00.000Z",
      "local_reviewer",
      "Status accepted for local indexing.",
    ],
  );
});

test("can load and construct route state in one call", () => {
  const state = createIngestRouteStateFromIngestSearchFixtures({ workspaceRoot });

  assert.deepEqual(
    state.searchLocalIndex({
      query: "notebook",
      limit: 10,
    }).hits.map((hit) => hit.id),
    ["idx_csv_alpha", "idx_notes_intro"],
  );
});

test("reports invalid fixture paths and broken source joins", () => {
  const fixtures = loadIngestSearchFixtureBundle({ workspaceRoot });

  const badPath = structuredClone(fixtures);
  badPath.repository.sources[0].path = "../notes.md";
  assert.match(
    validateIngestSearchFixtureBundle(badPath, { workspaceRoot }).join("\n"),
    /escapes the workspace root/,
  );

  const badJoin = structuredClone(fixtures);
  badJoin.searchIndex.documents[0].checksum =
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  assert.throws(
    () => createIngestRouteStateSeedFromFixtures(badJoin, { workspaceRoot }),
    (error) =>
      error instanceof IngestFixtureValidationError &&
      error.issues.some((issue) =>
        issue.includes("searchIndex.documents.idx_notes_intro.checksum"),
      ),
  );
});

function assertJsonResponse(response, status) {
  assert.equal(response.status, status);
  assert.match(response.headers["content-type"], /^application\/json/);
}
