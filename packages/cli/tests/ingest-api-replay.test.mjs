import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  isIngestApiReplayCommand,
  runIngestApiReplayCli,
} from "../src/ingestApiReplay.ts";

const fixturePath = fileURLToPath(
  new URL("../../../examples/ingest-search/api-requests.json", import.meta.url),
);
const tempDir = fileURLToPath(new URL("../.tmp-ingest-api-replay/", import.meta.url));

test("summarizes ingest API request fixtures without a live server", async () => {
  const result = await runIngestApiReplayCli([
    "ingest",
    "api",
    "replay",
    "--fixture",
    fixturePath,
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.kind, "ingest-api-fixture-replay");
  assert.equal(payload.schemaVersion, "ingest-search-api-requests.v1");
  assert.equal(payload.apiBase, "http://127.0.0.1:7317");
  assert.equal(payload.fixture.path, "examples/ingest-search/api-requests.json");
  assert.equal(payload.totalRequests, 6);
  assert.equal(payload.replayedRequests, 6);
  assert.deepEqual(payload.summary.methods, { POST: 6 });
  assert.deepEqual(payload.summary.statuses, { 200: 6 });
  assert.deepEqual(
    payload.requests.map((request) => [
      request.id,
      request.method,
      request.path,
      request.response.status,
    ]),
    [
      ["api_ingest_normalize", "POST", "/v1/ingest/normalize", 200],
      ["api_ingest_structured_csv", "POST", "/v1/ingest/structured", 200],
      ["api_ingest_repository_scan", "POST", "/v1/ingest/repository/scan", 200],
      ["api_search_query", "POST", "/v1/search/query", 200],
      ["api_quarantine_cases", "POST", "/v1/quarantine/cases", 200],
      [
        "api_quarantine_decision",
        "POST",
        "/v1/quarantine/cases/qtn_csv_beta_status/decision",
        200,
      ],
    ],
  );
  assert.deepEqual(payload.requests[0].request.body.options, {
    trusted: false,
  });
  assert.equal(payload.requests[3].response.body.results[0].matchedTerms[0], "checksum");
});

test("filters ingest API fixture replay by method, route, and id", async () => {
  const result = await runIngestApiReplayCli([
    "ingest-api",
    "replay",
    "--fixture",
    fixturePath,
    "--method",
    "post",
    "--route",
    "/v1/search/query",
    "--id",
    "api_search_query",
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(payload.filters, {
    method: "POST",
    route: "/v1/search/query",
    id: "api_search_query",
  });
  assert.equal(payload.totalRequests, 6);
  assert.equal(payload.replayedRequests, 1);
  assert.deepEqual(payload.summary.routes, { "/v1/search/query": 1 });
  assert.deepEqual(payload.requests.map((request) => request.id), ["api_search_query"]);
});

test("detects ingest API replay commands", () => {
  assert.equal(isIngestApiReplayCommand(["ingest", "api", "replay"]), true);
  assert.equal(isIngestApiReplayCommand(["ingest-api", "replay"]), true);
  assert.equal(isIngestApiReplayCommand(["ingest", "search", "source", "summary"]), false);
});

test("rejects unsafe fixture paths as JSON-only errors", async () => {
  const unsafePath = path.resolve(path.dirname(fixturePath), "..", "..", "..", "outside.json");
  const result = await runIngestApiReplayCli([
    "ingest",
    "api",
    "replay",
    "--fixture",
    unsafePath,
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stderr);

  assert.equal(result.exitCode, 2);
  assert.equal(result.stdout, "");
  assert.equal(payload.error.code, "usage_error");
  assert.match(payload.error.message, /must stay inside/);
});

test("reports invalid ingest API fixture shape as JSON-only errors", async () => {
  await mkdir(tempDir, { recursive: true });
  const invalidPath = path.join(tempDir, "invalid.json");
  await writeFile(
    invalidPath,
    JSON.stringify({
      schemaVersion: "ingest-search-api-requests.v1",
      generatedAt: "2026-04-27T08:00:00.000Z",
      requests: [{ id: "api_missing_route" }],
    }),
  );

  try {
    const result = await runIngestApiReplayCli([
      "ingest",
      "api",
      "replay",
      "--fixture",
      invalidPath,
    ]);
    assert.ok(result);
    const payload = JSON.parse(result.stderr);

    assert.equal(result.exitCode, 2);
    assert.equal(result.stdout, "");
    assert.equal(payload.error.code, "invalid_fixture");
    assert.match(payload.error.message, /fixture\.requests\[0\]\.route/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
