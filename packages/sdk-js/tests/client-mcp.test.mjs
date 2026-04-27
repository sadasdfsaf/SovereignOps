import assert from "node:assert/strict";
import test from "node:test";

import {
  ApiRequestValidationError,
  ApiResponseValidationError,
  createSovereignOpsClient,
} from "../src/client.ts";

const resourceSummary = Object.freeze({
  uri: "sovereignops://docs/operator-guide",
  name: "Operator Guide",
  description: "Local operator notes.",
  mimeType: "text/plain",
});

const resourceContent = Object.freeze({
  uri: resourceSummary.uri,
  mimeType: "text/plain",
  text: "Local operator note.",
  trust: "trusted",
  safety: {
    schemaVersion: 1,
    scope: "mcp_resource_content",
    trustLevel: "trusted",
    action: "mark_only",
    reasons: ["No prompt-injection heuristic findings detected in scanned text."],
    findings: [],
  },
});

const toolSafety = Object.freeze({
  schemaVersion: 1,
  scope: "mcp_tool_output",
  trustLevel: "untrusted",
  action: "mark_only",
  reasons: ["Explicit untrusted content marker found."],
  findings: [
    {
      id: "explicit_untrusted_marker",
      severity: "high",
      path: "$.description",
      reason: "Explicit untrusted content marker found.",
      excerpt: "<UNTRUSTED_CONTENT>candidate</UNTRUSTED_CONTENT>",
    },
  ],
});

const toolDescriptor = Object.freeze({
  name: "draft_document_patch",
  description: "Draft a local document patch.",
  inputSchema: {
    type: "object",
    properties: {
      targetPath: { type: "string" },
      patch: { type: "string" },
    },
    required: ["targetPath"],
    additionalProperties: false,
  },
});

const approvalSession = Object.freeze({
  id: "approval_1",
  status: "pending",
  createdAt: "2026-04-27T00:00:00.000Z",
  updatedAt: "2026-04-27T00:00:00.000Z",
  expiresAt: "2026-04-27T00:05:00.000Z",
  request: {
    toolName: "draft_document_patch",
    arguments: { targetPath: "notes/local.md" },
  },
  actor: {
    id: "operator-a",
    roles: ["author"],
    metadata: { lane: "blue" },
  },
  reason: "review required",
  ruleId: "rule_tool_review",
  metadata: { source: "sdk-test" },
});

const decidedApprovalSession = Object.freeze({
  ...approvalSession,
  status: "approved",
  updatedAt: "2026-04-27T00:00:03.000Z",
  decision: {
    status: "approved",
    at: "2026-04-27T00:00:03.000Z",
    actor: {
      id: "reviewer-a",
      roles: ["reviewer"],
    },
    reason: "checked",
    metadata: { queue: "primary" },
  },
  approvedAt: "2026-04-27T00:00:03.000Z",
  approvedBy: {
    id: "reviewer-a",
    roles: ["reviewer"],
  },
});

test("lists and reads MCP resources through mcp-prefixed API paths", async () => {
  const fetch = fakeFetch([
    jsonResponse(200, { resources: [resourceSummary] }),
    jsonResponse(200, { contents: [resourceContent] }),
  ]);
  const client = createSovereignOpsClient({
    baseUrl: "https://api.example.test/v1",
    apiKey: "test-key",
    fetch,
  });

  const listed = await client.listMcpResources();
  const read = await client.readMcpResource({
    uri: resourceSummary.uri,
    actor: {
      id: "operator-a",
      roles: ["author"],
    },
    metadata: { requestId: "req_resource_read" },
  });

  assert.deepEqual(listed, { resources: [resourceSummary] });
  assert.deepEqual(read, { contents: [resourceContent] });
  assert.equal(fetch.calls[0].url, "https://api.example.test/v1/mcp/resources");
  assert.equal(fetch.calls[0].init.method, "GET");
  assert.equal(fetch.calls[0].init.headers.accept, "application/json");
  assert.equal(fetch.calls[0].init.headers.authorization, "Bearer test-key");
  assert.equal(Object.hasOwn(fetch.calls[0].init.headers, "content-type"), false);
  assert.equal(fetch.calls[1].url, "https://api.example.test/v1/mcp/resources/read");
  assert.equal(fetch.calls[1].init.method, "POST");
  assert.deepEqual(JSON.parse(fetch.calls[1].init.body), {
    uri: resourceSummary.uri,
    actor: {
      id: "operator-a",
      roles: ["author"],
    },
    metadata: { requestId: "req_resource_read" },
  });
});

test("lists and calls MCP tools with stable request payloads", async () => {
  const toolResult = {
    content: [
      {
        type: "text",
        text: JSON.stringify({ kind: "document_patch", durableSideEffects: false }),
        safety: toolSafety,
      },
    ],
    structuredContent: {
      kind: "document_patch",
      durableSideEffects: false,
      _safety: toolSafety,
    },
    safety: toolSafety,
  };
  const fetch = fakeFetch([
    jsonResponse(200, { tools: [toolDescriptor] }),
    jsonResponse(200, toolResult),
  ]);
  const client = createSovereignOpsClient({
    baseUrl: "https://api.example.test/v1/",
    fetch,
  });

  const listed = await client.listMcpTools();
  const called = await client.callMcpTool({
    name: "draft_document_patch",
    arguments: {
      targetPath: "notes/local.md",
      patch: "candidate patch",
    },
    actor: "operator-a",
  });

  assert.deepEqual(listed, { tools: [toolDescriptor] });
  assert.deepEqual(called, toolResult);
  assert.equal(fetch.calls[0].url, "https://api.example.test/v1/mcp/tools");
  assert.equal(fetch.calls[0].init.method, "GET");
  assert.equal(fetch.calls[1].url, "https://api.example.test/v1/mcp/tools/call");
  assert.deepEqual(JSON.parse(fetch.calls[1].init.body), {
    name: "draft_document_patch",
    arguments: {
      targetPath: "notes/local.md",
      patch: "candidate patch",
    },
    actor: "operator-a",
  });
});

test("lists and decides MCP approval sessions", async () => {
  const fetch = fakeFetch([
    jsonResponse(200, { sessions: [approvalSession] }),
    jsonResponse(200, { session: decidedApprovalSession }),
  ]);
  const client = createSovereignOpsClient({
    baseUrl: "https://api.example.test/v1",
    fetch,
  });

  const listed = await client.listMcpApprovalSessions({
    status: "pending",
    actorId: "operator-a",
  });
  const decided = await client.decideMcpApprovalSession({
    sessionId: "approval_1",
    decision: "approve",
    actor: {
      id: "reviewer-a",
      roles: ["reviewer"],
    },
    reason: "checked",
    metadata: { queue: "primary" },
  });
  const listUrl = new URL(fetch.calls[0].url);

  assert.deepEqual(listed, { sessions: [approvalSession] });
  assert.deepEqual(decided, { session: decidedApprovalSession });
  assert.equal(
    listUrl.href,
    "https://api.example.test/v1/mcp/approval-sessions?status=pending&actorId=operator-a",
  );
  assert.equal(fetch.calls[0].init.method, "GET");
  assert.equal(
    fetch.calls[1].url,
    "https://api.example.test/v1/mcp/approval-sessions/approval_1/decision",
  );
  assert.deepEqual(JSON.parse(fetch.calls[1].init.body), {
    decision: "approve",
    actor: {
      id: "reviewer-a",
      roles: ["reviewer"],
    },
    reason: "checked",
    metadata: { queue: "primary" },
  });
});

test("rejects malformed MCP responses with typed validation errors", async () => {
  const fetch = fakeFetch([
    jsonResponse(200, { resources: [{ ...resourceSummary, uri: "" }] }),
    jsonResponse(200, {
      tools: [
        {
          ...toolDescriptor,
          inputSchema: { type: "array" },
        },
      ],
    }),
  ]);
  const client = createSovereignOpsClient({
    baseUrl: "https://api.example.test/v1",
    fetch,
  });

  await assert.rejects(
    client.listMcpResources(),
    (error) => {
      assert.equal(error instanceof ApiResponseValidationError, true);
      assert.deepEqual(
        error.issues.map((issue) => issue.path),
        ["resources.0.uri"],
      );
      return true;
    },
  );
  await assert.rejects(
    client.listMcpTools(),
    (error) => {
      assert.equal(error instanceof ApiResponseValidationError, true);
      assert.deepEqual(
        error.issues.map((issue) => issue.path),
        ["tools.0.inputSchema.type"],
      );
      return true;
    },
  );
});

test("validates MCP request inputs before fetch is called", async () => {
  const fetch = fakeFetch([]);
  const client = createSovereignOpsClient({
    baseUrl: "https://api.example.test/v1",
    fetch,
  });

  await assert.rejects(
    client.readMcpResource({ uri: " " }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(
        error.issues.map((issue) => issue.path),
        ["uri"],
      );
      return true;
    },
  );
  await assert.rejects(
    client.callMcpTool({
      name: "",
      arguments: [],
    }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(
        error.issues.map((issue) => issue.path),
        ["name", "arguments"],
      );
      return true;
    },
  );
  await assert.rejects(
    client.listMcpApprovalSessions({ status: "queued" }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(
        error.issues.map((issue) => issue.path),
        ["query.status"],
      );
      return true;
    },
  );
  await assert.rejects(
    client.decideMcpApprovalSession({
      sessionId: "",
      decision: "pending",
      actor: { id: "" },
    }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(
        error.issues.map((issue) => issue.path),
        ["sessionId", "decision", "actor.id"],
      );
      return true;
    },
  );
  assert.equal(fetch.calls.length, 0);
});

function fakeFetch(items) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const next = items.shift();
    if (next instanceof Error) {
      throw next;
    }
    if (next === undefined) {
      throw new Error("fake fetch response queue is empty");
    }
    return next;
  };
  fetch.calls = calls;
  return fetch;
}

function jsonResponse(status, body, headers = {}) {
  return textResponse(status, JSON.stringify(body), {
    "content-type": "application/json",
    ...headers,
  });
}

function textResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: statusTextFor(status),
    headers: headersLike(headers),
    async text() {
      return body;
    },
  };
}

function headersLike(headers) {
  const normalized = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    get(name) {
      return normalized.get(name.toLowerCase()) ?? null;
    },
  };
}

function statusTextFor(status) {
  if (status === 200) {
    return "OK";
  }
  return "";
}
