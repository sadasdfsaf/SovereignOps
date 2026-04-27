import assert from "node:assert/strict";
import test from "node:test";

import { createMcpGatewayRuntime } from "../../../services/mcp-gateway/src/index.ts";
import {
  createMcpRuntimeRouteDependencies,
  mountMcpRoutes,
  createApiRouter,
} from "../src/index.ts";

test("MCP runtime route dependencies expose local resources and safe tools", async () => {
  const { runtime, dependencies } = createMcpRuntimeRouteDependencies({
    runtimeOptions: {
      clock: () => "2026-04-27T00:00:00.000Z",
    },
  });
  const router = createApiRouter();
  mountMcpRoutes(router, dependencies, { basePath: "/v1/mcp", pathStyle: "openapi" });

  const resources = await router.dispatch({
    method: "GET",
    path: "/v1/mcp/resources",
    actorId: "act_local_api",
  });
  assert.equal(resources.status, 200);
  assert.ok(resources.body.resources.length >= 1);
  assert.ok(
    resources.body.resources.every((resource) =>
      resource.uri.startsWith("sovereignops://"),
    ),
  );

  const tools = await router.dispatch({
    method: "GET",
    path: "/v1/mcp/tools",
  });
  assert.equal(tools.status, 200);
  assert.deepEqual(
    tools.body.tools.map((tool) => tool.name),
    [
      "create_task_proposal",
      "draft_document_patch",
      "link_evidence",
      "propose_automation_rule",
    ],
  );

  const call = await router.dispatch({
    method: "POST",
    path: "/v1/mcp/tools/call",
    actorId: "act_local_api",
    body: {
      name: "create_task_proposal",
      arguments: {
        title: "Review local runtime bridge",
        acceptanceCriteria: ["No remote server required"],
      },
      metadata: { source: "api-runtime-test" },
    },
  });
  assert.equal(call.status, 200);
  assert.equal(call.body.structuredContent.kind, "task_proposal");
  assert.equal(call.body.structuredContent.durableSideEffects, false);

  assert.equal(runtime.toolAuditEntries().length, 3);
});

test("MCP runtime route dependencies create reviewable approval sessions", async () => {
  const runtime = createMcpGatewayRuntime({
    clock: fixedClock(),
    toolPolicyRules: [
      {
        id: "runtime-route-approval",
        toolName: "draft_document_patch",
        decision: "require_approval",
        reason: "review document patch before returning it",
      },
    ],
    toolDefaultDecision: "deny",
  });
  const { dependencies } = createMcpRuntimeRouteDependencies({ runtime });
  const router = createApiRouter();
  mountMcpRoutes(router, dependencies, { basePath: "/v1/mcp", pathStyle: "openapi" });

  const required = await router.dispatch({
    method: "POST",
    path: "/v1/mcp/tools/call",
    actorId: "act_patch_author",
    body: {
      name: "draft_document_patch",
      arguments: {
        targetPath: "notes/local-runtime.md",
        patch: "Add a local runtime bridge note.",
      },
      metadata: { source: "api-runtime-test" },
    },
  });
  assert.equal(required.status, 409);
  assert.equal(required.body.error.code, "approval_required");
  assert.match(required.body.error.details.approvalId, /^runtime_approval_/);

  const sessions = await router.dispatch({
    method: "GET",
    path: "/v1/mcp/approval-sessions",
    body: { status: "pending" },
  });
  assert.equal(sessions.status, 200);
  assert.equal(sessions.body.sessions.length, 1);
  assert.equal(sessions.body.sessions[0].status, "pending");
  assert.equal(sessions.body.sessions[0].request.toolName, "draft_document_patch");

  const decided = await router.dispatch({
    method: "POST",
    path: `/v1/mcp/approval-sessions/${sessions.body.sessions[0].id}/decision`,
    actorId: "act_runtime_reviewer",
    body: {
      decision: "approve",
      reason: "patch is local and non-durable",
    },
  });
  assert.equal(decided.status, 200);
  assert.equal(decided.body.session.status, "approved");
  assert.equal(decided.body.session.decision.actor.id, "act_runtime_reviewer");
});

test("MCP runtime preview helper returns JSON envelopes instead of throwing policy errors", async () => {
  const { dependencies } = createMcpRuntimeRouteDependencies({
    runtimeOptions: {
      toolPolicyRules: [],
      toolDefaultDecision: "deny",
      clock: () => "2026-04-27T00:00:00.000Z",
    },
  });
  const preview = await dependencies.executeToolPreview(
    {
      toolName: "create_task_proposal",
      arguments: { title: "Blocked preview" },
      actor: { id: "act_preview" },
    },
    {},
  );

  assert.equal(preview.ok, false);
  assert.equal(preview.error.code, "denied");
  assert.equal(preview.policy.decision, "deny");
  assert.equal(preview.auditRecords.length, 2);
});

test("MCP runtime dependency factory rejects ambiguous construction", () => {
  assert.throws(
    () =>
      createMcpRuntimeRouteDependencies({
        runtime: createMcpGatewayRuntime(),
        runtimeOptions: {},
      }),
    /either an MCP runtime or runtimeOptions/,
  );
});

function fixedClock() {
  let elapsed = 0;
  return () => new Date(Date.parse("2026-04-27T00:00:00.000Z") + elapsed++).toISOString();
}
