import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createApiRouter,
  createMcpRuntimeRouteDependencies,
  mountMcpRoutes,
} from "../src/index.ts";

const fixture = JSON.parse(
  readFileSync(
    new URL("../../../examples/mcp-gateway/runtime-router.json", import.meta.url),
    "utf8",
  ),
);

test("runtime router fixture replays through mounted API routes without a server", async () => {
  const router = createFixtureRouter(fixture);

  assert.deepEqual(router.listRoutes(), fixture.routes);

  for (const example of fixture.requests) {
    const response = await router.dispatch(example.request);
    assert.deepEqual(jsonRoundTrip(response), example.response, example.id);
  }
});

test("runtime router fixture covers resource, safety, and approval flows", () => {
  const examples = new Map(fixture.requests.map((example) => [example.id, example]));

  assert.deepEqual([...examples.keys()], [
    "runtime_resource_list",
    "runtime_resource_read",
    "runtime_tool_call_safety",
    "runtime_approval_create",
    "runtime_approval_list_pending",
    "runtime_approval_decision",
  ]);

  const listResources = examples.get("runtime_resource_list");
  assert.equal(listResources.request.method, "GET");
  assert.equal(listResources.request.path, "/v1/mcp/resources");
  assert.ok(listResources.response.body.resources.length >= 1);

  const readResource = examples.get("runtime_resource_read");
  assert.equal(readResource.request.body.uri, "sovereignops://docs/operator-guide");
  assert.equal(readResource.response.body.contents[0].uri, readResource.request.body.uri);

  const safetyCall = examples.get("runtime_tool_call_safety");
  assert.equal(safetyCall.response.body.safety.trustLevel, "untrusted");
  assert.equal(
    safetyCall.response.body.structuredContent._safety.trustLevel,
    "untrusted",
  );
  assert.ok(safetyCall.response.body.safety.findings.length > 0);

  const approvalCreate = examples.get("runtime_approval_create");
  const approvalId = approvalCreate.response.body.error.details.approvalId;
  assert.equal(approvalCreate.response.status, 409);
  assert.equal(approvalCreate.response.body.error.code, "approval_required");

  const approvalList = examples.get("runtime_approval_list_pending");
  assert.deepEqual(
    approvalList.response.body.sessions.map((session) => [session.id, session.status]),
    [[approvalId, "pending"]],
  );

  const decision = examples.get("runtime_approval_decision");
  assert.equal(
    decision.request.path,
    `/v1/mcp/approval-sessions/${approvalId}/decision`,
  );
  assert.equal(decision.response.body.session.id, approvalId);
  assert.equal(decision.response.body.session.status, "approved");
});

function createFixtureRouter(value) {
  const { dependencies } = createMcpRuntimeRouteDependencies({
    runtimeOptions: {
      approvalIdPrefix: value.runtime.approvalIdPrefix,
      clock: fixedIncrementClock(value.runtime.clock),
      toolDefaultDecision: value.runtime.toolDefaultDecision,
      toolPolicyRules: value.runtime.toolPolicyRules,
    },
  });
  const router = createApiRouter();
  mountMcpRoutes(router, dependencies, value.mount);
  return router;
}

function fixedIncrementClock(config) {
  let elapsed = 0;
  const startMs = Date.parse(config.startAt);
  const incrementMs = config.incrementMs;

  return () => {
    const timestamp = new Date(startMs + elapsed).toISOString();
    elapsed += incrementMs;
    return timestamp;
  };
}

function jsonRoundTrip(value) {
  return JSON.parse(JSON.stringify(value));
}
