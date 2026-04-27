import assert from "node:assert/strict";
import test from "node:test";

import { createLocalMcpProtocolClient } from "../src/index.ts";

const fixedClock = () => "2026-04-27T00:00:00.000Z";

test("drives a local MCP runtime with JSON-RPC helper methods and raw dispatch", async () => {
  const client = createLocalMcpProtocolClient({
    clock: fixedClock,
    requestIdPrefix: "proto-test-",
  });

  const initialized = await client.initialize({ id: "init-1" });
  assert.equal(initialized.jsonrpc, "2.0");
  assert.equal(initialized.id, "init-1");
  assert.equal(initialized.result.ok, true);
  assert.equal(initialized.result.value.capabilities.resources.read, true);
  assert.equal(initialized.result.value.capabilities.tools.list, true);
  assert.equal(initialized.result.value.capabilities.tools.call, true);

  const listedResources = await client.listResources({
    context: { actor: { id: "worker-3" } },
  });
  assert.equal(listedResources.id, "proto-test-1");
  assert.equal(listedResources.result.ok, true);
  assert.equal(
    listedResources.result.value.resources.some(
      (resource) => resource.uri === "sovereignops://docs/operator-guide",
    ),
    true,
  );

  const read = await client.request(
    {
      jsonrpc: "2.0",
      id: "read-1",
      method: "resources/read",
      params: { uri: "sovereignops://docs/operator-guide" },
    },
    { actor: { id: "worker-3" } },
  );
  assert.equal(read.id, "read-1");
  assert.equal(read.result.ok, true);
  assert.match(read.result.value.contents[0].text, /Operator Guide/);

  const listedTools = await client.listTools({ id: null });
  assert.equal(listedTools.id, null);
  assert.equal(listedTools.result.ok, true);
  assert.equal(
    listedTools.result.value.tools.some(
      (tool) => tool.name === "draft_document_patch",
    ),
    true,
  );

  const called = await client.dispatch(
    {
      jsonrpc: "2.0",
      id: "tool-call-1",
      method: "tools/call",
      params: {
        name: "draft_document_patch",
        arguments: {
          targetPath: "notes/protocol.md",
          summary: "Document the local MCP JSON-RPC helper.",
          patch: "--- a/notes/protocol.md\n+++ b/notes/protocol.md\n",
        },
      },
    },
    {
      actor: { id: "worker-3", roles: ["sdk-test"] },
      metadata: { requestId: "req-local-protocol-success" },
    },
  );
  assert.equal(called.jsonrpc, "2.0");
  assert.equal(called.id, "tool-call-1");
  assert.equal(called.result.ok, true);
  assert.equal(called.result.value.structuredContent.kind, "document_patch");
  assert.equal(
    called.result.value.structuredContent.summary,
    "Document the local MCP JSON-RPC helper.",
  );
  assert.equal(called.result.value.structuredContent.durableSideEffects, false);
  assert.equal(
    called.result.value.structuredContent._safety.scope,
    "mcp_tool_output",
  );
  assert.equal(called.result.value.content[0].safety.scope, "mcp_tool_output");
  assert.deepEqual(
    called.result.auditRecords.map((record) => record.type),
    ["tool_call_requested", "tool_call_approved", "tool_call_executed"],
  );
  assert.deepEqual(
    client.runtime.toolAuditEntries().map((record) => record.type),
    ["tool_call_requested", "tool_call_approved", "tool_call_executed"],
  );
});

test("maps approval-required local tools into JSON-RPC error envelopes", async () => {
  const client = createLocalMcpProtocolClient({
    clock: fixedClock,
    approvalIdPrefix: "protocol-approval-",
    toolPolicyRules: [
      {
        id: "require-protocol-document-review",
        toolName: "draft_document_patch",
        decision: "require_approval",
        reason: "Document patch proposals need protocol review.",
      },
    ],
  });

  const called = await client.callTool({
    id: "approval-call-1",
    name: "draft_document_patch",
    arguments: {
      targetPath: "notes/review.md",
      patch: "candidate patch",
    },
    context: {
      actor: { id: "worker-3", roles: ["sdk-test"] },
      metadata: { requestId: "req-local-protocol-approval" },
    },
  });

  assert.equal(called.jsonrpc, "2.0");
  assert.equal(called.id, "approval-call-1");
  assert.equal(called.error.code, -32001);
  assert.equal(called.error.data.ok, false);
  assert.deepEqual(called.error.data.error, {
    code: "approval_required",
    message: "Document patch proposals need protocol review.",
    toolName: "draft_document_patch",
    decision: "require_approval",
    reason: "Document patch proposals need protocol review.",
    ruleId: "require-protocol-document-review",
    approvalId: "protocol-approval-1",
  });
  assert.deepEqual(
    called.error.data.auditRecords.map((record) => [
      record.type,
      record.metadata?.approvalId,
    ]),
    [
      ["tool_call_requested", undefined],
      ["tool_call_approval_required", "protocol-approval-1"],
    ],
  );

  const pending = client.runtime.approvals.list({
    status: "pending",
    actorId: "worker-3",
  });
  assert.equal(pending.length, 1);
  assert.equal(pending[0].id, "protocol-approval-1");
  assert.equal(pending[0].request.type, "tool");
  assert.equal(pending[0].request.toolName, "draft_document_patch");
  assert.deepEqual(pending[0].request.arguments, {
    targetPath: "notes/review.md",
    patch: "candidate patch",
  });
});
