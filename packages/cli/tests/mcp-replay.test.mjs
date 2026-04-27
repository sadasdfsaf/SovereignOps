import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runCli } from "../src/index.ts";
import { runMcpReplayCli } from "../src/mcpReplay.ts";

const fixturePath = fileURLToPath(
  new URL("../../../examples/mcp-gateway/api-requests.json", import.meta.url),
);
const tempDir = fileURLToPath(new URL("../.tmp-mcp-replay/", import.meta.url));

test("summarizes MCP API request fixtures without a live server", async () => {
  const result = await runMcpReplayCli([
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
  assert.equal(payload.kind, "mcp-api-fixture-replay");
  assert.equal(payload.schemaVersion, "mcp-gateway-fixtures.v1");
  assert.equal(payload.fixture.path, "examples/mcp-gateway/api-requests.json");
  assert.equal(payload.totalRequests, 6);
  assert.equal(payload.replayedRequests, 6);
  assert.deepEqual(
    payload.requests.map((request) => [
      request.id,
      request.method,
      request.path,
      request.expectedStatus,
    ]),
    [
      ["api_resource_list", "GET", "/v1/mcp/resources", 200],
      ["api_resource_read", "POST", "/v1/mcp/resources/read", 200],
      ["api_tool_list", "GET", "/v1/mcp/tools", 200],
      ["api_tool_call", "POST", "/v1/mcp/tools/call", 200],
      ["api_approval_list", "GET", "/v1/mcp/approval-sessions", 200],
      [
        "api_approval_decision",
        "POST",
        "/v1/mcp/approval-sessions/aps_snapshot_export_pending/decision",
        200,
      ],
    ],
  );
  assert.equal(payload.requests[0].body, null);
  assert.deepEqual(payload.requests[3].body, {
    toolName: "preview_sync_batch",
    arguments: {
      workspaceId: "wsp_demo_alpha",
      limit: 25,
    },
  });
});

test("filters MCP API fixture replay by method and route", async () => {
  const result = await runCli([
    "mcp",
    "api",
    "replay",
    "--fixture",
    fixturePath,
    "--method",
    "post",
    "--route",
    "/v1/mcp/tools/call",
  ]);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(payload.filters, {
    method: "POST",
    route: "/v1/mcp/tools/call",
  });
  assert.equal(payload.totalRequests, 6);
  assert.equal(payload.replayedRequests, 1);
  assert.deepEqual(payload.requests.map((request) => request.id), ["api_tool_call"]);
});

test("reports missing fixture files as JSON-only errors", async () => {
  const missingPath = path.join(path.dirname(fixturePath), "missing-api-requests.json");
  const result = await runMcpReplayCli([
    "mcp",
    "api",
    "replay",
    "--fixture",
    missingPath,
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stderr);

  assert.equal(result.exitCode, 2);
  assert.equal(result.stdout, "");
  assert.equal(payload.error.code, "fixture_not_found");
  assert.match(payload.error.message, /Fixture file was not found/);
  assert.equal(payload.error.details.path, "examples/mcp-gateway/missing-api-requests.json");
});

test("reports invalid fixture shape as JSON-only errors", async () => {
  await mkdir(tempDir, { recursive: true });
  const invalidPath = path.join(tempDir, "invalid.json");
  await writeFile(
    invalidPath,
    JSON.stringify({
      schemaVersion: "mcp-gateway-fixtures.v1",
      generatedAt: "2026-04-27T07:00:00.000Z",
      requests: [{ id: "api_missing_route" }],
    }),
  );

  try {
    const result = await runMcpReplayCli([
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
    assert.match(payload.error.message, /fixture\.requests\[0\]\.route/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
