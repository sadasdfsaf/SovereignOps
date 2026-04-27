import assert from "node:assert/strict";
import test from "node:test";

import { GATEWAY_RESOURCE_URIS } from "../../../services/mcp-gateway/src/resources.ts";
import { runCli } from "../src/index.ts";
import { runMcpDemoCli } from "../src/mcpDemo.ts";

test("lists default MCP demo resources as JSON", async () => {
  const result = await runMcpDemoCli(["mcp", "demo", "resources"]);
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.kind, "mcp-demo.resources");
  assert.equal(payload.policyMode, "allow");
  assert.equal(payload.result.ok, true);
  assert.deepEqual(
    payload.result.value.resources.map((resource) => resource.uri),
    [
      GATEWAY_RESOURCE_URIS.docsGuide,
      GATEWAY_RESOURCE_URIS.taskQueue,
      GATEWAY_RESOURCE_URIS.incidentReport,
      GATEWAY_RESOURCE_URIS.searchIndex,
      GATEWAY_RESOURCE_URIS.auditTrail,
    ],
  );
});

test("package entrypoint routes MCP demo commands before core commands", async () => {
  const result = await runCli(["mcp", "demo", "resources"]);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.kind, "mcp-demo.resources");
  assert.equal(payload.result.ok, true);
});

test("reads an allowed MCP demo resource", async () => {
  const result = await runMcpDemoCli([
    "mcp",
    "demo",
    "read",
    "--uri",
    GATEWAY_RESOURCE_URIS.taskQueue,
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.kind, "mcp-demo.read");
  assert.equal(payload.result.ok, true);
  assert.equal(payload.result.value.contents[0].uri, GATEWAY_RESOURCE_URIS.taskQueue);
  assert.match(payload.result.value.contents[0].text, /task-plugin-review/);
});

test("returns deterministic JSON for denied MCP demo resource reads", async () => {
  const result = await runMcpDemoCli([
    "mcp",
    "demo",
    "read",
    "--uri",
    GATEWAY_RESOURCE_URIS.docsGuide,
    "--policy-mode",
    "deny-resource-read",
    "--deny-uri",
    GATEWAY_RESOURCE_URIS.docsGuide,
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.policyMode, "deny-resource-read");
  assert.equal(payload.result.ok, false);
  assert.equal(payload.result.error.code, "policy_denied");
  assert.equal(payload.result.error.ruleId, "mcp-demo-deny-resource-read");
  assert.deepEqual(
    payload.result.auditIntents.map((intent) => [intent.type, intent.decision]),
    [["policy_decision", "deny"]],
  );
});

test("executes a default safe local MCP demo tool from JSON args", async () => {
  const result = await runMcpDemoCli([
    "mcp",
    "demo",
    "tool",
    "--name",
    "create_task_proposal",
    "--args-json",
    JSON.stringify({
      title: "Prepare local note summary",
      description: "Collect the local findings before review.",
    }),
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.kind, "mcp-demo.tool");
  assert.equal(payload.result.status, "executed");
  assert.deepEqual(payload.result.output, {
    kind: "task_proposal",
    title: "Prepare local note summary",
    description: "Collect the local findings before review.",
    durableSideEffects: false,
  });
});

test("returns approval-required JSON for MCP demo tools when selected", async () => {
  const result = await runMcpDemoCli([
    "mcp",
    "demo",
    "tool",
    "--name",
    "create_task_proposal",
    "--args-json",
    JSON.stringify({ title: "Prepare local note summary" }),
    "--policy-mode",
    "require-approval",
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.result.status, "approval_required");
  assert.equal(payload.result.policy.decision, "require_approval");
});

test("validates MCP demo usage errors", async () => {
  const missingUri = await runMcpDemoCli(["mcp", "demo", "read"]);
  const invalidJson = await runMcpDemoCli([
    "mcp",
    "demo",
    "tool",
    "--name",
    "create_task_proposal",
    "--args-json",
    "{",
  ]);
  const unknownFlag = await runMcpDemoCli([
    "mcp",
    "demo",
    "resources",
    "--unexpected",
    "value",
  ]);

  assert.ok(missingUri);
  assert.ok(invalidJson);
  assert.ok(unknownFlag);
  assert.equal(missingUri.exitCode, 2);
  assert.match(missingUri.stderr, /Missing required option --uri/);
  assert.equal(invalidJson.exitCode, 2);
  assert.match(invalidJson.stderr, /must contain valid JSON/);
  assert.equal(unknownFlag.exitCode, 2);
  assert.match(unknownFlag.stderr, /Unsupported option: --unexpected/);
});
