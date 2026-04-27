import assert from "node:assert/strict";
import test from "node:test";

import { createApiRouter } from "../src/router.ts";
import { mountMcpRoutes } from "../src/mcpRoutes.ts";
import {
  createApprovalSessionStore,
  createSafeLocalToolAdapter,
} from "../../../services/mcp-gateway/src/index.ts";

test("MCP routes list tools, call a safe local tool, and decide approval sessions", async () => {
  const clock = fixedClock();
  const approvalSessionStore = createApprovalSessionStore({
    now: clock.now,
    idPrefix: "approval-route-",
  });
  const pending = approvalSessionStore.create({
    request: { type: "review_note", target: "note-1" },
    actor: { id: "requester-1" },
  });
  const router = createMcpRouter({
    safeToolAdapter: createSafeLocalToolAdapter({
      policy: () => ({ decision: "allow", ruleId: "allow-route-test" }),
    }),
    approvalSessionStore,
  });

  const tools = await router.dispatch({
    method: "GET",
    path: "/mcp/tools",
  });
  assertJsonResponse(tools, 200);
  assert.deepEqual(
    tools.body.tools.map((tool) => [tool.name, tool.inputSchema.type]),
    [
      ["create_task_proposal", "object"],
      ["draft_document_patch", "object"],
      ["link_evidence", "object"],
      ["propose_automation_rule", "object"],
    ],
  );

  const call = await router.dispatch({
    method: "POST",
    path: "/mcp/tools/call",
    actorId: "actor-route",
    body: {
      name: "create_task_proposal",
      arguments: { title: "Review local note", priority: "normal" },
      metadata: { source: "mcp-route-test" },
    },
  });
  assertJsonResponse(call, 200);
  assert.equal(call.body.content[0].type, "text");
  assert.equal(call.body.structuredContent.kind, "task_proposal");
  assert.equal(call.body.structuredContent.durableSideEffects, false);
  assert.match(call.body.content[0].text, /Review local note/);

  const list = await router.dispatch({
    method: "GET",
    path: "/mcp/approval-sessions",
    body: { status: "pending" },
  });
  assertJsonResponse(list, 200);
  assert.deepEqual(
    list.body.sessions.map((session) => [session.id, session.status]),
    [[pending.id, "pending"]],
  );

  clock.advance(2_000);
  const decision = await router.dispatch({
    method: "POST",
    path: "/mcp/approval-sessions/decide",
    actorId: "reviewer-1",
    body: {
      sessionId: pending.id,
      decision: "approve",
      reason: "checked",
    },
  });
  assertJsonResponse(decision, 200);
  assert.equal(decision.body.session.status, "approved");
  assert.equal(decision.body.session.approvedAt, "2026-04-27T00:00:02.000Z");
  assert.deepEqual(decision.body.session.approvedBy, { id: "reviewer-1" });
  assert.equal(decision.body.session.decision.reason, "checked");
});

test("MCP safe tool calls return stable denial and approval-required envelopes", async () => {
  const router = createMcpRouter({
    safeToolAdapter: createSafeLocalToolAdapter({
      policy: (request) =>
        request.toolName === "create_task_proposal"
          ? {
              decision: "deny",
              reason: "blocked by route policy",
              ruleId: "deny-route-test",
            }
          : {
              decision: "require_approval",
              reason: "review required",
              ruleId: "approval-route-test",
              approvalId: "approval-route-1",
            },
    }),
    approvalSessionStore: createApprovalSessionStore(),
  });

  const denied = await router.dispatch({
    method: "POST",
    path: "/mcp/tools/call",
    body: {
      toolName: "create_task_proposal",
      arguments: { title: "Blocked note" },
    },
  });
  assertJsonError(denied, 403, "tool_denied");
  assert.deepEqual(denied.body.error.details, {
    toolName: "create_task_proposal",
    decision: "deny",
    reason: "blocked by route policy",
    ruleId: "deny-route-test",
    policy: {
      decision: "deny",
      toolName: "create_task_proposal",
      reason: "blocked by route policy",
      ruleId: "deny-route-test",
    },
  });

  const approval = await router.dispatch({
    method: "POST",
    path: "/mcp/tools/call",
    body: {
      name: "draft_document_patch",
      arguments: { targetPath: "notes/local.md", patch: "candidate patch" },
    },
  });
  assertJsonError(approval, 409, "approval_required");
  assert.equal(approval.body.error.details.toolName, "draft_document_patch");
  assert.equal(approval.body.error.details.approvalId, "approval-route-1");
  assert.equal(approval.body.error.details.policy.decision, "require_approval");
});

test("MCP routes validate new request bodies strictly", async () => {
  const approvalSessionStore = createApprovalSessionStore({
    now: () => "2026-04-27T00:00:00.000Z",
    idPrefix: "approval-route-",
  });
  const session = approvalSessionStore.create({
    request: { type: "check_note", target: "note-2" },
  });
  const router = createMcpRouter({
    safeToolAdapter: createSafeLocalToolAdapter({ policy: () => "allow" }),
    approvalSessionStore,
  });
  const openApiRouter = createMcpRouter({
    basePath: "/v1/mcp",
    pathStyle: "openapi",
    safeToolAdapter: createSafeLocalToolAdapter({ policy: () => "allow" }),
    approvalSessionStore,
  });

  const unknownField = await router.dispatch({
    method: "POST",
    path: "/mcp/tools/call",
    body: {
      name: "create_task_proposal",
      arguments: { title: "Review local note" },
      unsafe: true,
    },
  });
  assertJsonError(unknownField, 400, "validation_failed");
  assert.deepEqual(unknownField.body.error.details, { path: "body.unsafe" });

  const badStatus = await router.dispatch({
    method: "GET",
    path: "/mcp/approval-sessions",
    body: { status: "closed" },
  });
  assertJsonError(badStatus, 400, "validation_failed");
  assert.deepEqual(badStatus.body.error.details, { path: "body.status" });

  const missingSessionId = await router.dispatch({
    method: "POST",
    path: "/mcp/approval-sessions/decide",
    body: { decision: "approve" },
  });
  assertJsonError(missingSessionId, 400, "validation_failed");
  assert.deepEqual(missingSessionId.body.error.details, { path: "body.sessionId" });

  const mismatchedPathAndBody = await openApiRouter.dispatch({
    method: "POST",
    path: `/v1/mcp/approval-sessions/${session.id}/decision`,
    body: {
      sessionId: "approval-route-other",
      decision: "reject",
    },
  });
  assertJsonError(mismatchedPathAndBody, 400, "validation_failed");
  assert.deepEqual(mismatchedPathAndBody.body.error.details, { path: "body.sessionId" });
});

test("MCP route paths preserve legacy and OpenAPI styles", async () => {
  const legacyRouter = createMcpRouter({
    safeToolAdapter: createSafeLocalToolAdapter({ policy: () => "allow" }),
    approvalSessionStore: createApprovalSessionStore(),
  });
  const openApiStore = createApprovalSessionStore({
    now: () => "2026-04-27T00:00:00.000Z",
    idPrefix: "approval-openapi-",
  });
  const openApiSession = openApiStore.create({
    request: { type: "review_link", target: "note-3" },
  });
  const openApiRouter = createMcpRouter({
    basePath: "/v1/mcp",
    pathStyle: "openapi",
    safeToolAdapter: createSafeLocalToolAdapter({ policy: () => "allow" }),
    approvalSessionStore: openApiStore,
  });

  assert.deepEqual(
    legacyRouter.listRoutes().map(routeKey),
    [
      "GET /mcp/approval-sessions",
      "GET /mcp/resources",
      "GET /mcp/tools",
      "POST /mcp/approval-sessions/decide",
      "POST /mcp/resources/read",
      "POST /mcp/tools/call",
      "POST /mcp/tools/execute-preview",
    ],
  );
  assert.deepEqual(
    openApiRouter.listRoutes().map(routeKey),
    [
      "GET /v1/mcp/approval-sessions",
      "GET /v1/mcp/resources",
      "GET /v1/mcp/tools",
      "POST /v1/mcp/approval-sessions/:sessionId/decision",
      "POST /v1/mcp/resources/read",
      "POST /v1/mcp/tools/call",
      "POST /v1/mcp/tools/execute",
    ],
  );

  const legacyOpenApiMiss = await legacyRouter.dispatch({
    method: "POST",
    path: "/mcp/tools/execute",
    body: { toolName: "create_task_proposal", arguments: { title: "Preview" } },
  });
  assertJsonError(legacyOpenApiMiss, 404, "API_ROUTE_NOT_FOUND");

  const openApiDecision = await openApiRouter.dispatch({
    method: "POST",
    path: `/v1/mcp/approval-sessions/${openApiSession.id}/decision`,
    body: {
      decision: "reject",
      actor: { id: "reviewer-openapi" },
      reason: "needs a narrower proposal",
    },
  });
  assertJsonResponse(openApiDecision, 200);
  assert.equal(openApiDecision.body.session.status, "rejected");
  assert.deepEqual(openApiDecision.body.session.rejectedBy, {
    id: "reviewer-openapi",
  });
});

test("existing MCP resource and preview callers stay compatible without new dependencies", async () => {
  const router = createMcpRouter();

  const resources = await router.dispatch({
    method: "GET",
    path: "/mcp/resources",
    body: { metadata: { source: "compat-test" } },
  });
  assertJsonResponse(resources, 200);
  assert.deepEqual(resources.body.resources, [
    {
      uri: "sovereignops://docs/local-note",
      name: "Local Note",
      mimeType: "text/plain",
    },
  ]);

  const preview = await router.dispatch({
    method: "POST",
    path: "/mcp/tools/execute-preview",
    actorId: "actor-preview",
    body: {
      toolName: "create_task_proposal",
      arguments: { title: "Preview note" },
    },
  });
  assertJsonResponse(preview, 200);
  assert.deepEqual(preview.body, {
    status: "previewed",
    toolName: "create_task_proposal",
    actorId: "actor-preview",
    arguments: { title: "Preview note" },
  });

  const missingOptionalDependency = await router.dispatch({
    method: "GET",
    path: "/mcp/tools",
  });
  assertJsonError(missingOptionalDependency, 501, "mcp_dependency_not_configured");
  assert.deepEqual(missingOptionalDependency.body.error.details, {
    dependency: "safeToolAdapter",
  });
});

function createMcpRouter(options = {}) {
  const router = createApiRouter();
  mountMcpRoutes(
    router,
    {
      adapter: options.adapter ?? createResourceAdapter(),
      executeToolPreview: options.executeToolPreview ?? ((request) => ({
        status: "previewed",
        toolName: request.toolName,
        actorId: request.actor?.id,
        arguments: request.arguments,
      })),
      ...(options.safeToolAdapter ? { safeToolAdapter: options.safeToolAdapter } : {}),
      ...(options.approvalSessionStore ? { approvalSessionStore: options.approvalSessionStore } : {}),
    },
    {
      ...(options.basePath ? { basePath: options.basePath } : {}),
      ...(options.pathStyle ? { pathStyle: options.pathStyle } : {}),
    },
  );

  return router;
}

function createResourceAdapter() {
  return {
    listResources() {
      return {
        ok: true,
        value: {
          resources: [
            {
              uri: "sovereignops://docs/local-note",
              name: "Local Note",
              mimeType: "text/plain",
            },
          ],
        },
      };
    },
    readResource(uri) {
      if (uri !== "sovereignops://docs/local-note") {
        return {
          ok: false,
          error: {
            code: "resource_not_found",
            message: `Missing resource ${uri}`,
            uri,
            capability: "read_object",
          },
        };
      }

      return {
        ok: true,
        value: {
          contents: [
            {
              uri,
              mimeType: "text/plain",
              text: "local note body",
            },
          ],
        },
      };
    },
  };
}

function fixedClock() {
  let current = new Date("2026-04-27T00:00:00.000Z");

  return {
    now: () => current.toISOString(),
    advance: (ms) => {
      current = new Date(current.getTime() + ms);
    },
  };
}

function assertJsonResponse(response, status) {
  assert.equal(response.status, status);
  assert.match(response.headers["content-type"], /^application\/json/);
}

function assertJsonError(response, status, code) {
  assertJsonResponse(response, status);
  assert.deepEqual(Object.keys(response.body), ["error"]);
  assert.equal(response.body.error.code, code);
  assert.equal(typeof response.body.error.message, "string");
  assert.ok(response.body.error.message.length > 0);
}

function routeKey(route) {
  return `${route.method} ${route.path}`;
}
