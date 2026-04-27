import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { runCli } from "../src/index.ts";
import {
  isIngestConnectorApiReplayCommand,
  runIngestConnectorApiReplayCli,
} from "../src/ingestConnectorApiReplay.ts";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const fixturePath = fileURLToPath(
  new URL("../../../examples/ingest-search/connector-api-requests.json", import.meta.url),
);
const tempDir = fileURLToPath(
  new URL("../.tmp-ingest-connector-api-replay/", import.meta.url),
);

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

test("replays connector manifest API fixtures through the local router", async () => {
  const result = await runIngestConnectorApiReplayCli([
    "ingest",
    "connectors",
    "api",
    "replay",
    "--fixture",
    fixturePath,
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.kind, "ingest-connector-api-fixture-replay");
  assert.equal(payload.schemaVersion, "ingest-connector-api-requests.v1");
  assert.equal(payload.apiBase, "local://ingest-connector-api");
  assert.equal(payload.fixture.path, "examples/ingest-search/connector-api-requests.json");
  assert.equal(payload.totalRequests, 3);
  assert.equal(payload.replayedRequests, 3);
  assert.equal(payload.passedRequests, 3);
  assert.equal(payload.failedRequests, 0);
  assert.deepEqual(payload.summary.methods, { GET: 2, POST: 1 });
  assert.deepEqual(payload.summary.routes, {
    "/v1/ingest/connectors": 2,
    "/v1/ingest/connectors/local.files": 1,
  });
  assert.deepEqual(payload.summary.expectedStatuses, { 200: 1, 404: 2 });
  assert.deepEqual(payload.summary.actualStatuses, { 200: 1, 404: 2 });
  assert.deepEqual(payload.summary.mismatches, {});
  assert.deepEqual(payload.requests[0].matches, {
    body: true,
    expectation: true,
    status: true,
  });
  assert.equal(payload.requests[0].actual.body.schemaVersion, "ingest-connector-manifest/v1");
  assert.equal(payload.requests[0].actual.body.localOnly, true);
  assert.deepEqual(
    payload.requests[0].actual.body.connectors.map((connector) => connector.id),
    ["local.files", "local.manual", "local.workspace-index"],
  );
});

test("detects connector API replay aliases and routes through the top-level CLI", async () => {
  assert.equal(
    isIngestConnectorApiReplayCommand(["ingest", "connectors", "api", "replay"]),
    true,
  );
  assert.equal(
    isIngestConnectorApiReplayCommand(["ingest", "connector", "api", "replay"]),
    true,
  );
  assert.equal(
    isIngestConnectorApiReplayCommand(["ingest-connectors", "api", "replay"]),
    true,
  );
  assert.equal(
    isIngestConnectorApiReplayCommand(["ingest-connector-api", "replay"]),
    true,
  );
  assert.equal(isIngestConnectorApiReplayCommand(["ingest", "api", "replay"]), false);

  const result = await runCli([
    "ingest-connector-api",
    "replay",
    "--fixture",
    fixturePath,
  ]);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.kind, "ingest-connector-api-fixture-replay");
  assert.equal(payload.passedRequests, 3);
});

test("filters connector API fixture replay by method, route, and id", async () => {
  const result = await runIngestConnectorApiReplayCli([
    "ingest-connectors",
    "api",
    "replay",
    "--fixture",
    fixturePath,
    "--method",
    "get",
    "--route",
    "/v1/ingest/connectors/",
    "--id",
    "api_ingest_connectors_manifest",
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(payload.filters, {
    id: "api_ingest_connectors_manifest",
    method: "GET",
    route: "/v1/ingest/connectors",
  });
  assert.equal(payload.totalRequests, 3);
  assert.equal(payload.replayedRequests, 1);
  assert.equal(payload.passedRequests, 1);
  assert.deepEqual(payload.summary.routes, { "/v1/ingest/connectors": 1 });
});

test("reports malformed connector API fixtures as JSON-only errors", async () => {
  const invalidPath = await writeFixture("invalid-connector-api-requests.json", {
    schemaVersion: "ingest-connector-api-requests.v1",
    generatedAt: "2026-04-27T20:35:00.000Z",
    requests: [{ id: "api_missing_route" }],
  });
  const result = await runIngestConnectorApiReplayCli([
    "ingest",
    "connectors",
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
});

test("rejects unsafe connector API fixture paths as JSON-only errors", async () => {
  const unsafePath = path.resolve(workspaceRoot, "..", "outside.json");
  const result = await runIngestConnectorApiReplayCli([
    "ingest",
    "connectors",
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

test("reports invalid connector API fixture JSON as JSON-only errors", async () => {
  await mkdir(tempDir, { recursive: true });
  const invalidPath = path.join(tempDir, "invalid-json-connector-api-requests.json");
  await writeFile(invalidPath, "{ not json\n");

  const result = await runIngestConnectorApiReplayCli([
    "ingest-connectors",
    "api",
    "replay",
    "--fixture",
    invalidPath,
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stderr);

  assert.equal(result.exitCode, 2);
  assert.equal(result.stdout, "");
  assert.equal(payload.error.code, "invalid_fixture_json");
  assert.equal(payload.error.details.path, "packages/cli/.tmp-ingest-connector-api-replay/invalid-json-connector-api-requests.json");
});

test("redacts raw secret and local path values from connector API replay output", async () => {
  const fixture = await writeFixture("redacted-connector-api-requests.json", {
    schemaVersion: "ingest-connector-api-requests.v1",
    generatedAt: "2026-04-27T20:40:00.000Z",
    requests: [
      {
        id: "api_ingest_connectors_redaction",
        route: {
          method: "GET",
          path: "/v1/ingest/connectors",
        },
        request: {
          headers: {
            authorization: "Bearer fixture-secret",
          },
          body: {
            debugPath: "C:/Users/DELL/connectors/debug.json",
            sessionToken: "raw-local-secret",
          },
        },
        response: {
          status: 500,
          body: {
            error: {
              code: "connector_fixture_mismatch",
              message: "token=raw-local-secret failed at C:/Users/DELL/connectors/debug.json",
            },
          },
        },
      },
    ],
  });
  const result = await runIngestConnectorApiReplayCli(
    [
      "ingest",
      "connectors",
      "api",
      "replay",
      "--fixture",
      fixture,
    ],
    {
      dispatch: async () => ({
        status: 500,
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
        body: {
          error: {
            code: "connector_fixture_mismatch",
            message: "token=raw-local-secret failed at C:/Users/DELL/connectors/debug.json",
          },
        },
      }),
    },
  );
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.passedRequests, 1);
  assert.equal(payload.failedRequests, 0);
  assert.equal(
    payload.requests[0].actual.body.error.message,
    "token=[REDACTED] failed at [redacted-path]",
  );
  assert.ok(payload.requests[0].redactions.length >= 4);
  assertNoLeak(result.stdout);
});

async function writeFixture(name, value) {
  await mkdir(tempDir, { recursive: true });
  const outputPath = path.join(tempDir, name);
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`);
  return outputPath;
}

function assertNoLeak(text) {
  assert.equal(text.includes("Bearer fixture-secret"), false);
  assert.equal(text.includes("raw-local-secret"), false);
  assert.equal(text.includes("C:/Users/DELL"), false);
}
