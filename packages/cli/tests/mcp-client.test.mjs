import assert from "node:assert/strict";
import test from "node:test";

import { runCli } from "../src/index.ts";
import { runMcpApiCli } from "../src/mcpClient.ts";

const baseUrl = "http://127.0.0.1:3000";

test("lists MCP API resources through injected fetch", async () => {
  const fetch = fakeFetch([
    {
      status: 200,
      body: {
        resources: [
          {
            uri: "sovereignops://docs/local-notes",
            name: "Local Notes",
            mimeType: "text/plain",
          },
        ],
      },
    },
  ]);

  const result = await runMcpApiCli([
    "mcp",
    "api",
    "resources",
    "--base-url",
    baseUrl,
  ], { fetch });
  assert.ok(result);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), {
    resources: [
      {
        uri: "sovereignops://docs/local-notes",
        name: "Local Notes",
        mimeType: "text/plain",
      },
    ],
  });
  assert.deepEqual(fetch.calls, [
    {
      input: "http://127.0.0.1:3000/v1/mcp/resources",
      init: {
        method: "GET",
        headers: { accept: "application/json" },
      },
    },
  ]);
});

test("package entrypoint routes MCP API commands before the demo handler", async () => {
  const fetch = fakeFetch([{ status: 200, body: { resources: [] } }]);
  const result = await runCli([
    "mcp",
    "api",
    "resources",
    "--base-url",
    baseUrl,
  ], { fetch });

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), { resources: [] });
  assert.equal(fetch.calls.length, 1);
});

test("reads an MCP API resource with strict JSON body shape", async () => {
  const resourceUri = "sovereignops://docs/local-notes";
  const fetch = fakeFetch([
    {
      status: 200,
      body: {
        contents: [
          {
            uri: resourceUri,
            mimeType: "text/plain",
            text: "ready for review",
          },
        ],
      },
    },
  ]);

  const result = await runMcpApiCli([
    "mcp",
    "api",
    "read",
    "--base-url",
    `${baseUrl}/v1`,
    "--uri",
    resourceUri,
  ], { fetch });

  assert.ok(result);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout).contents[0], {
    uri: resourceUri,
    mimeType: "text/plain",
    text: "ready for review",
  });
  assert.deepEqual(fetch.calls[0], {
    input: "http://127.0.0.1:3000/v1/mcp/resources/read",
    init: {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ uri: resourceUri }),
    },
  });
});

test("lists MCP API tools through the tool metadata endpoint", async () => {
  const fetch = fakeFetch([
    {
      status: 200,
      body: {
        tools: [
          {
            name: "create_task_proposal",
            description: "Create a task proposal without writing task state.",
            inputSchema: { type: "object" },
          },
        ],
      },
    },
  ]);

  const result = await runMcpApiCli([
    "mcp",
    "api",
    "tools",
    "--base-url",
    baseUrl,
  ], { fetch });

  assert.ok(result);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout).tools.map((tool) => tool.name), [
    "create_task_proposal",
  ]);
  assert.deepEqual(fetch.calls[0], {
    input: "http://127.0.0.1:3000/v1/mcp/tools",
    init: {
      method: "GET",
      headers: { accept: "application/json" },
    },
  });
});

test("calls an MCP API tool with JSON args from stdin", async () => {
  const fetch = fakeFetch([
    {
      status: 200,
      body: {
        status: "executed",
        toolName: "create_task_proposal",
        output: {
          kind: "task_proposal",
          title: "Review local notes",
          durableSideEffects: false,
        },
      },
    },
  ]);

  const result = await runMcpApiCli([
    "mcp",
    "api",
    "call",
    "--base-url",
    baseUrl,
    "--tool-name",
    "create_task_proposal",
    "--args-json",
    "-",
  ], {
    fetch,
    stdin: JSON.stringify({ title: "Review local notes" }),
  });

  assert.ok(result);
  assert.equal(result.exitCode, 0);
  assert.equal(JSON.parse(result.stdout).status, "executed");
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), {
    toolName: "create_task_proposal",
    arguments: { title: "Review local notes" },
  });
  assert.equal(fetch.calls[0].input, "http://127.0.0.1:3000/v1/mcp/tools/call");
});

test("lists and decides MCP API approval sessions", async () => {
  const fetch = fakeFetch([
    {
      status: 200,
      body: {
        sessions: [
          {
            id: "approval-route-1",
            status: "pending",
          },
        ],
      },
    },
    {
      status: 200,
      body: {
        session: {
          id: "approval-route-1",
          status: "approved",
        },
      },
    },
  ]);

  const listed = await runMcpApiCli([
    "mcp",
    "api",
    "approvals",
    "--base-url",
    baseUrl,
  ], { fetch });
  const decided = await runMcpApiCli([
    "mcp",
    "api",
    "approval-decide",
    "--base-url",
    baseUrl,
    "--session-id",
    "approval-route-1",
    "--decision",
    "approve",
    "--reason",
    "checked",
  ], { fetch });

  assert.ok(listed);
  assert.ok(decided);
  assert.equal(listed.exitCode, 0);
  assert.deepEqual(JSON.parse(listed.stdout), {
    sessions: [
      {
        id: "approval-route-1",
        status: "pending",
      },
    ],
  });
  assert.equal(decided.exitCode, 0);
  assert.deepEqual(JSON.parse(decided.stdout), {
    session: {
      id: "approval-route-1",
      status: "approved",
    },
  });
  assert.equal(fetch.calls[0].input, "http://127.0.0.1:3000/v1/mcp/approval-sessions");
  assert.deepEqual(fetch.calls[0].init, {
    method: "GET",
    headers: { accept: "application/json" },
  });
  assert.equal(
    fetch.calls[1].input,
    "http://127.0.0.1:3000/v1/mcp/approval-sessions/approval-route-1/decision",
  );
  assert.deepEqual(JSON.parse(fetch.calls[1].init.body), {
    decision: "approve",
    reason: "checked",
  });
});

test("returns JSON-only usage errors without calling fetch", async () => {
  const fetch = fakeFetch([]);
  const invalidBaseUrl = await runMcpApiCli([
    "mcp",
    "api",
    "resources",
    "--base-url",
    "ftp://127.0.0.1:3000",
  ], { fetch });
  const invalidArgs = await runMcpApiCli([
    "mcp",
    "api",
    "call",
    "--base-url",
    baseUrl,
    "--tool-name",
    "create_task_proposal",
    "--args-json",
    "[]",
  ], { fetch });
  const unknownFlag = await runMcpApiCli([
    "mcp",
    "api",
    "resources",
    "--base-url",
    baseUrl,
    "--token",
    "not-accepted",
  ], { fetch });

  assert.ok(invalidBaseUrl);
  assert.ok(invalidArgs);
  assert.ok(unknownFlag);
  assert.equal(invalidBaseUrl.exitCode, 2);
  assert.equal(JSON.parse(invalidBaseUrl.stderr).error.code, "usage_error");
  assert.match(JSON.parse(invalidArgs.stderr).error.message, /JSON object/);
  assert.match(JSON.parse(unknownFlag.stderr).error.message, /Unsupported option: --token/);
  assert.equal(fetch.calls.length, 0);
});

test("validates MCP API approval decision flags before fetch", async () => {
  const fetch = fakeFetch([]);
  const missingSession = await runMcpApiCli([
    "mcp",
    "api",
    "approval-decide",
    "--base-url",
    baseUrl,
    "--decision",
    "approve",
  ], { fetch });
  const badDecision = await runMcpApiCli([
    "mcp",
    "api",
    "approval-decide",
    "--base-url",
    baseUrl,
    "--session-id",
    "approval-route-1",
    "--decision",
    "pending",
  ], { fetch });

  assert.ok(missingSession);
  assert.ok(badDecision);
  assert.equal(missingSession.exitCode, 2);
  assert.match(JSON.parse(missingSession.stderr).error.message, /--session-id/);
  assert.equal(badDecision.exitCode, 2);
  assert.match(JSON.parse(badDecision.stderr).error.message, /approve or reject/);
  assert.equal(fetch.calls.length, 0);
});

test("returns JSON-only HTTP and response errors", async () => {
  const httpFetch = fakeFetch([
    {
      status: 404,
      statusText: "Not Found",
      body: {
        error: {
          code: "resource_not_found",
          message: "No gateway resource found.",
        },
      },
    },
  ]);
  const httpError = await runMcpApiCli([
    "mcp",
    "api",
    "resources",
    "--base-url",
    baseUrl,
  ], { fetch: httpFetch });

  assert.ok(httpError);
  assert.equal(httpError.exitCode, 1);
  assert.equal(httpError.stdout, "");
  assert.deepEqual(JSON.parse(httpError.stderr), {
    error: {
      code: "http_error",
      message: "MCP API request failed.",
      details: {
        status: 404,
        statusText: "Not Found",
        body: {
          error: {
            code: "resource_not_found",
            message: "No gateway resource found.",
          },
        },
      },
    },
  });

  const badJsonFetch = fakeFetch([{ status: 200, text: "not-json" }]);
  const parseError = await runMcpApiCli([
    "mcp",
    "api",
    "resources",
    "--base-url",
    baseUrl,
  ], { fetch: badJsonFetch });

  assert.ok(parseError);
  assert.equal(parseError.exitCode, 1);
  assert.equal(JSON.parse(parseError.stderr).error.code, "response_error");
});

function fakeFetch(items) {
  const calls = [];
  const fetch = async (input, init) => {
    calls.push({
      input,
      init: JSON.parse(JSON.stringify(init)),
    });

    if (items.length === 0) {
      throw new Error("Unexpected fetch call");
    }

    const next = items.shift();
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      statusText: next.statusText ?? "",
      async text() {
        if (next.text !== undefined) {
          return next.text;
        }
        return JSON.stringify(next.body);
      },
    };
  };
  fetch.calls = calls;
  return fetch;
}
