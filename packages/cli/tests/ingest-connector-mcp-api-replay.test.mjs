import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { runCli } from "../src/index.ts";
import {
  isIngestConnectorMcpApiReplayCommand,
  runIngestConnectorMcpApiReplayCli,
} from "../src/ingestConnectorMcpApiReplay.ts";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const fixturePath = fileURLToPath(
  new URL("../../../examples/ingest-search/connector-mcp-api-requests.json", import.meta.url),
);
const tempDir = fileURLToPath(
  new URL("../.tmp-ingest-connector-mcp-api-replay/", import.meta.url),
);

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

test("replays connector MCP API fixtures through the combined local router", async () => {
  const result = await runIngestConnectorMcpApiReplayCli([
    "ingest",
    "connectors",
    "mcp",
    "api",
    "replay",
    "--fixture",
    fixturePath,
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.kind, "ingest-connector-mcp-api-fixture-replay");
  assert.equal(payload.schemaVersion, "ingest-connector-mcp-api-requests.v1");
  assert.equal(payload.apiBase, "local://ingest-connector-mcp-api");
  assert.equal(payload.localOnly, true);
  assert.equal(payload.durableWrites, false);
  assert.equal(payload.fixture.path, "examples/ingest-search/connector-mcp-api-requests.json");
  assert.equal(payload.totalRequests, 6);
  assert.equal(payload.replayedRequests, 6);
  assert.equal(payload.passedRequests, 6);
  assert.equal(payload.failedRequests, 0);
  assert.deepEqual(payload.summary.methods, { GET: 3, POST: 3 });
  assert.deepEqual(payload.summary.routes, {
    "/v1/ingest/connectors/mcp/preview": 3,
    "/v1/ingest/connectors/mcp/resources": 1,
    "/v1/ingest/connectors/mcp/resources/local.files": 1,
    "/v1/ingest/connectors/mcp/resources/local.unknown": 1,
  });
  assert.deepEqual(payload.summary.expectedStatuses, { 200: 4, 400: 1, 404: 1 });
  assert.deepEqual(payload.summary.actualStatuses, { 200: 4, 400: 1, 404: 1 });
  assert.deepEqual(payload.summary.mismatches, {});
  assert.deepEqual(payload.requests[0].matches, {
    body: true,
    expectation: true,
    status: true,
  });
  assert.equal(payload.requests[0].actual.body.schemaVersion, "ingest-connector-mcp-resources/v1");
  assert.deepEqual(
    payload.requests[0].actual.body.resources.map((resource) => resource.connectorId),
    ["local.files", "local.manual", "local.workspace-index"],
  );
  assert.equal(payload.requests[2].actual.body.preview.contentIncluded, false);
  assert.equal(payload.requests[3].actual.body.preview.contentIncluded, true);
  assert.equal(
    payload.requests[4].actual.body.error.code,
    "ingest_connector_mcp_resource_not_found",
  );
});

test("detects connector MCP API replay aliases and routes through the top-level CLI", async () => {
  assert.equal(
    isIngestConnectorMcpApiReplayCommand(["ingest", "connectors", "mcp", "api", "replay"]),
    true,
  );
  assert.equal(
    isIngestConnectorMcpApiReplayCommand(["ingest", "connector", "mcp", "api", "replay"]),
    true,
  );
  assert.equal(
    isIngestConnectorMcpApiReplayCommand(["ingest-connector-mcp", "api", "replay"]),
    true,
  );
  assert.equal(
    isIngestConnectorMcpApiReplayCommand(["ingest-connector-mcp-api", "replay"]),
    true,
  );
  assert.equal(
    isIngestConnectorMcpApiReplayCommand(["ingest", "connectors", "mcp", "preview"]),
    false,
  );

  const help = await runIngestConnectorMcpApiReplayCli([
    "ingest",
    "connector",
    "mcp",
    "api",
    "replay",
    "--help",
  ]);
  assert.ok(help);
  assert.equal(help.exitCode, 0);
  assert.equal(help.stderr, "");
  assert.equal(JSON.parse(help.stdout).kind, "ingest-connector-mcp-api-replay.help");

  const result = await runCli([
    "ingest-connector-mcp",
    "api",
    "replay",
    "--fixture",
    fixturePath,
  ]);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.kind, "ingest-connector-mcp-api-fixture-replay");
  assert.equal(payload.passedRequests, 6);
});

test("filters connector MCP API fixture replay by method, route, and id", async () => {
  const result = await runIngestConnectorMcpApiReplayCli([
    "ingest-connector-mcp",
    "api",
    "replay",
    "--fixture",
    fixturePath,
    "--method",
    "post",
    "--route",
    "/v1/ingest/connectors/mcp/preview/",
    "--id",
    "mcp_ingest_connector_preview_local_files",
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(payload.filters, {
    id: "mcp_ingest_connector_preview_local_files",
    method: "POST",
    route: "/v1/ingest/connectors/mcp/preview",
  });
  assert.equal(payload.totalRequests, 6);
  assert.equal(payload.replayedRequests, 1);
  assert.equal(payload.passedRequests, 1);
  assert.deepEqual(payload.summary.routes, {
    "/v1/ingest/connectors/mcp/preview": 1,
  });
});

test("rejects shared schema validation failures as JSON-only errors", async () => {
  const rawSecret = "sk-sharedschema123";
  const invalidPath = await writeFixture("shared-invalid-connector-mcp-api-requests.json", {
    schemaVersion: "ingest-connector-mcp-api-requests.v1",
    generatedAt: "2026-04-27T22:34:00.000Z",
    localOnly: true,
    durableWrites: false,
    requests: [
      {
        id: "mcp_ingest_connector_shared_schema_failure",
        method: "GET",
        path: "/v1/ingest/connectors/mcp/resources",
        expectedStatus: 200,
        expectedBody: {
          schemaVersion: "ingest-connector-mcp-resources/v1",
        },
      },
    ],
  });
  const result = await runIngestConnectorMcpApiReplayCli(
    [
      "ingest",
      "connectors",
      "mcp",
      "api",
      "replay",
      "--fixture",
      invalidPath,
    ],
    {
      sharedSchemaValidators: {
        validateFixtureBundle: () => ({
          ok: false,
          issues: [
            {
              path: "$.network.mode",
              message: "network.mode must be disabled",
            },
            {
              path: "$.requests[0].expectedBody.error.message",
              message: `failed with token=${rawSecret} at C:/Users/DELL/private-fixture.json`,
            },
          ],
        }),
      },
    },
  );
  assert.ok(result);
  const payload = JSON.parse(result.stderr);

  assert.equal(result.exitCode, 2);
  assert.equal(result.stdout, "");
  assert.equal(payload.error.code, "invalid_fixture");
  assert.match(payload.error.message, /shared schema validation/);
  assert.deepEqual(payload.error.details.issues[0], {
    path: "$.network.mode",
    message: "network.mode must be disabled",
  });
  assert.equal(result.stderr.includes(rawSecret), false);
  assert.equal(result.stderr.includes("C:/Users/DELL"), false);
});

test("uses checked-in shared MCP API validators for shared-shape fixture failures", async () => {
  const invalidPath = await writeFixture("shared-shape-invalid-connector-mcp-api-requests.json", {
    schemaVersion: "ingest-connector-mcp-api-requests.v1",
    generatedAt: "2026-04-27T22:34:00.000Z",
    connectorId: "local.files",
    localOnly: true,
    requests: [],
    resources: null,
    resourceFixtures: null,
    preview: null,
  });
  const result = await runIngestConnectorMcpApiReplayCli([
    "ingest",
    "connectors",
    "mcp",
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
  assert.match(payload.error.message, /shared schema validation/);
  assert.equal(
    payload.error.details.issues.some((issue) => issue.path === "bundleId"),
    true,
  );
  assert.equal(
    payload.error.details.issues.some((issue) => issue.path === "resources"),
    true,
  );
});

test("keeps replay output parity when shared fixture and response validators pass", async () => {
  const baseline = await runIngestConnectorMcpApiReplayCli([
    "ingest",
    "connectors",
    "mcp",
    "api",
    "replay",
    "--fixture",
    fixturePath,
  ]);
  const responsePhases = [];
  let bundleValidationCount = 0;
  const withSharedValidators = await runIngestConnectorMcpApiReplayCli(
    [
      "ingest",
      "connectors",
      "mcp",
      "api",
      "replay",
      "--fixture",
      fixturePath,
    ],
    {
      sharedSchemaValidators: {
        validateFixtureBundle: (value) => {
          bundleValidationCount += 1;
          return { ok: true, issues: [], value };
        },
        validateResponseBody: (body, context) => {
          responsePhases.push(context.phase);
          return { ok: true, issues: [], value: body };
        },
      },
    },
  );

  assert.ok(baseline);
  assert.ok(withSharedValidators);
  assert.equal(bundleValidationCount, 1);
  assert.deepEqual(countValues(responsePhases), { actual: 6, expected: 6 });
  assert.equal(withSharedValidators.exitCode, baseline.exitCode);
  assert.equal(withSharedValidators.stderr, baseline.stderr);
  assert.equal(withSharedValidators.stdout, baseline.stdout);
});

test("reports malformed connector MCP API fixtures as JSON-only errors", async () => {
  const invalidPath = await writeFixture("invalid-connector-mcp-api-requests.json", {
    schemaVersion: "ingest-connector-mcp-api-requests.v1",
    generatedAt: "2026-04-27T22:35:00.000Z",
    requests: [{ id: "mcp_missing_method" }],
  });
  const result = await runIngestConnectorMcpApiReplayCli([
    "ingest",
    "connectors",
    "mcp",
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
  assert.match(payload.error.message, /fixture\.requests\[0\]\.method/);
});

test("rejects unsafe connector MCP API fixture paths as JSON-only errors", async () => {
  const outsidePath = path.resolve(workspaceRoot, "..", "outside.json");
  const outside = await runIngestConnectorMcpApiReplayCli([
    "ingest",
    "connectors",
    "mcp",
    "api",
    "replay",
    "--fixture",
    outsidePath,
  ]);
  assert.ok(outside);
  const outsidePayload = JSON.parse(outside.stderr);

  assert.equal(outside.exitCode, 2);
  assert.equal(outside.stdout, "");
  assert.equal(outsidePayload.error.code, "usage_error");
  assert.match(outsidePayload.error.message, /must stay inside/);

  const privatePath = path.join(workspaceRoot, ".codex-private", "fixture.json");
  const privateResult = await runIngestConnectorMcpApiReplayCli([
    "ingest-connector-mcp",
    "api",
    "replay",
    "--fixture",
    privatePath,
  ]);
  assert.ok(privateResult);
  const privatePayload = JSON.parse(privateResult.stderr);

  assert.equal(privateResult.exitCode, 2);
  assert.equal(privateResult.stdout, "");
  assert.equal(privatePayload.error.code, "usage_error");
  assert.match(privatePayload.error.message, /private workspace/);

  const packPath = path.join(workspaceRoot, "sovereignops-codex-pack", "fixture.json");
  const packResult = await runIngestConnectorMcpApiReplayCli([
    "ingest-connector-mcp",
    "api",
    "replay",
    "--fixture",
    packPath,
  ]);
  assert.ok(packResult);
  const packPayload = JSON.parse(packResult.stderr);

  assert.equal(packResult.exitCode, 2);
  assert.equal(packResult.stdout, "");
  assert.equal(packPayload.error.code, "usage_error");
  assert.match(packPayload.error.message, /private|redacted-private-marker/);
});

test("reports invalid connector MCP API fixture JSON as JSON-only errors", async () => {
  await mkdir(tempDir, { recursive: true });
  const invalidPath = path.join(tempDir, "invalid-json-connector-mcp-api-requests.json");
  await writeFile(invalidPath, "{ not json\n");

  const result = await runIngestConnectorMcpApiReplayCli([
    "ingest-connector-mcp",
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
  assert.equal(
    payload.error.details.path,
    "packages/cli/.tmp-ingest-connector-mcp-api-replay/invalid-json-connector-mcp-api-requests.json",
  );
});

test("redacts raw secret and local path values from connector MCP API replay output", async () => {
  const fixture = await writeFixture("redacted-connector-mcp-api-requests.json", {
    schemaVersion: "ingest-connector-mcp-api-requests.v1",
    generatedAt: "2026-04-27T22:40:00.000Z",
    requests: [
      {
        id: "mcp_ingest_connectors_redaction",
        method: "GET",
        path: "/v1/ingest/connectors/mcp/resources",
        headers: {
          authorization: "Bearer fixture-secret",
        },
        body: {
          debugPath: "C:/Users/DELL/connectors/debug.json",
          sessionToken: "raw-local-secret",
        },
        expectedStatus: 500,
        expectedBody: {
          error: {
            code: "connector_mcp_fixture_mismatch",
            message: "token=raw-local-secret failed at C:/Users/DELL/connectors/debug.json",
          },
        },
        expectedChecks: {
          errorCode: "connector_mcp_fixture_mismatch",
        },
      },
    ],
  });
  const result = await runIngestConnectorMcpApiReplayCli(
    [
      "ingest",
      "connectors",
      "mcp",
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
            code: "connector_mcp_fixture_mismatch",
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

function countValues(values) {
  return Object.fromEntries(
    [...new Set(values)].sort().map((value) => [
      value,
      values.filter((entry) => entry === value).length,
    ]),
  );
}
