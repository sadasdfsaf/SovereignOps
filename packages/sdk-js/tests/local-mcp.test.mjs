import assert from "node:assert/strict";
import test from "node:test";

import { createLocalMcpClient } from "../src/index.ts";

const fixedClock = () => "2026-04-27T00:00:00.000Z";

test("runs MCP gateway resource and safe local tool flows without a remote server", async () => {
  const client = createLocalMcpClient({ clock: fixedClock });

  const listedResources = await client.listResources({
    actor: { id: "worker-4" },
  });
  assert.equal(listedResources.ok, true);
  assert.equal(
    listedResources.value.resources.some(
      (resource) => resource.uri === "sovereignops://docs/operator-guide",
    ),
    true,
  );

  const read = await client.readResource("sovereignops://docs/operator-guide", {
    actor: { id: "worker-4" },
  });
  assert.equal(read.ok, true);
  assert.match(read.value.contents[0].text, /Operator Guide/);

  const listedTools = client.listTools();
  assert.equal(listedTools.ok, true);
  assert.equal(
    listedTools.value.tools.some((tool) => tool.name === "draft_document_patch"),
    true,
  );

  const called = await client.callTool(
    "draft_document_patch",
    {
      targetPath: "notes/local.md",
      summary: "Document the local MCP helper.",
      patch: "--- a/notes/local.md\n+++ b/notes/local.md\n",
    },
    { actor: { id: "worker-4" } },
  );
  assert.equal(called.ok, true);
  assert.equal(called.value.structuredContent.kind, "document_patch");
  assert.equal(called.value.structuredContent.targetPath, "notes/local.md");
  assert.equal(
    called.value.structuredContent.summary,
    "Document the local MCP helper.",
  );
  assert.equal(
    called.value.structuredContent.patch,
    "--- a/notes/local.md\n+++ b/notes/local.md\n",
  );
  assert.equal(called.value.structuredContent.durableSideEffects, false);
  assert.equal(called.value.structuredContent._safety.scope, "mcp_tool_output");

  assert.deepEqual(client.listApprovalSessions(), []);
  assert.deepEqual(
    client.auditEntries().tools.map((record) => record.type),
    ["tool_call_requested", "tool_call_approved", "tool_call_executed"],
  );
  assert.equal(
    client.auditEntries().resources.some(
      (record) =>
        record.type === "operation_succeeded" &&
        record.path === "sovereignops://docs/operator-guide",
    ),
    true,
  );
});

test("surfaces approval-required tool calls and lets callers decide sessions locally", async () => {
  const client = createLocalMcpClient({
    clock: fixedClock,
    approvalIdPrefix: "sdk-local-approval-",
    toolPolicyRules: [
      {
        id: "require-local-document-review",
        toolName: "draft_document_patch",
        decision: "require_approval",
        reason: "Document patch proposals need a local reviewer.",
      },
    ],
  });

  const called = await client.callTool(
    "draft_document_patch",
    {
      targetPath: "notes/review.md",
      patch: "candidate patch",
    },
    {
      actor: { id: "worker-4", roles: ["sdk-example"] },
      metadata: { requestId: "req-local-mcp-approval" },
    },
  );
  assert.equal(called.ok, false);
  assert.equal(called.error.code, "approval_required");
  assert.equal(called.error.approvalId, "sdk-local-approval-1");

  const pending = client.listApprovalSessions({
    status: "pending",
    actorId: "worker-4",
  });
  assert.equal(pending.length, 1);
  assert.equal(pending[0].id, "sdk-local-approval-1");
  assert.equal(pending[0].request.type, "tool");
  assert.equal(pending[0].request.toolName, "draft_document_patch");
  assert.deepEqual(pending[0].request.arguments, {
    targetPath: "notes/review.md",
    patch: "candidate patch",
  });
  assert.equal(pending[0].ruleId, "require-local-document-review");

  const decided = client.decideApprovalSession({
    sessionId: "sdk-local-approval-1",
    decision: "approve",
    actor: { id: "reviewer-1", roles: ["reviewer"] },
    reason: "Safe proposal output only.",
    metadata: { queue: "sdk-local" },
  });
  assert.equal(decided.status, "approved");
  assert.equal(decided.approvedBy.id, "reviewer-1");
  assert.deepEqual(
    client.listApprovalSessions({ status: "approved" }).map((session) => session.id),
    ["sdk-local-approval-1"],
  );
  assert.deepEqual(
    client.toolAuditEntries().map((record) => [record.type, record.metadata?.approvalId]),
    [
      ["tool_call_requested", undefined],
      ["tool_call_approval_required", "sdk-local-approval-1"],
    ],
  );
});
