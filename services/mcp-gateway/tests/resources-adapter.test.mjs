import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MCP_GATEWAY_ADAPTER_METADATA,
  MCP_GATEWAY_TOOL_METADATA,
  createGatewayResourceAdapter,
} from "../src/adapter.ts";
import {
  GATEWAY_RESOURCE_URIS,
  GatewayResourceRegistry,
  createDefaultGatewayResourceRegistry,
} from "../src/resources.ts";

describe("mcp gateway resource adapter", () => {
  it("filters resource listing through policy decisions", async () => {
    const registry = createDefaultGatewayResourceRegistry();
    const policyCalls = [];
    const adapter = createGatewayResourceAdapter({
      resources: registry,
      policy: (request) => {
        policyCalls.push(request);
        return {
          decision:
            request.path === GATEWAY_RESOURCE_URIS.auditTrail ? "deny" : "allow",
          path: request.path,
          capability: request.capability,
          reason: "test policy",
        };
      },
    });

    const result = await adapter.listResources();

    assert.equal(result.ok, true);
    assert.deepEqual(
      result.value.resources.map((resource) => resource.uri),
      [
        GATEWAY_RESOURCE_URIS.docsGuide,
        GATEWAY_RESOURCE_URIS.taskQueue,
        GATEWAY_RESOURCE_URIS.incidentReport,
        GATEWAY_RESOURCE_URIS.searchIndex,
      ],
    );
    assert.equal(policyCalls.length, 5);
    assert.equal(policyCalls[0].metadata.operation, "resources.list");
    assert.deepEqual(
      result.auditIntents.map((intent) => [intent.type, intent.decision]),
      [
        ["policy_decision", "allow"],
        ["policy_decision", "allow"],
        ["policy_decision", "allow"],
        ["policy_decision", "allow"],
        ["policy_decision", "deny"],
      ],
    );
  });

  it("prevents denied reads from executing the resource handler", async () => {
    let handlerCalls = 0;
    const registry = new GatewayResourceRegistry([
      {
        uri: "sovereignops://docs/blocked-note",
        name: "Blocked Note",
        description: "Sample blocked note.",
        mimeType: "text/plain",
        read: () => {
          handlerCalls += 1;
          return {
            uri: "sovereignops://docs/blocked-note",
            text: "should not be returned",
          };
        },
      },
    ]);
    const adapter = createGatewayResourceAdapter({
      resources: registry,
      policy: (request) => ({
        decision: "deny",
        path: request.path,
        capability: request.capability,
        reason: "blocked by test policy",
        ruleId: "deny-blocked-note",
      }),
    });

    const result = await adapter.readResource("sovereignops://docs/blocked-note");

    assert.equal(result.ok, false);
    assert.equal(result.error.code, "policy_denied");
    assert.equal(result.error.ruleId, "deny-blocked-note");
    assert.equal(handlerCalls, 0);
    assert.deepEqual(
      result.auditIntents.map((intent) => [intent.type, intent.decision]),
      [["policy_decision", "deny"]],
    );
  });

  it("returns allowed read contents with success audit intent", async () => {
    let handlerCalls = 0;
    const registry = new GatewayResourceRegistry([
      {
        uri: "sovereignops://tasks/readable-note",
        name: "Readable Note",
        description: "Sample readable note.",
        mimeType: "text/plain",
        read: ({ uri }) => {
          handlerCalls += 1;
          return {
            uri,
            text: "ready",
          };
        },
      },
    ]);
    const adapter = createGatewayResourceAdapter({
      resources: registry,
      policy: () => "allow",
    });

    const result = await adapter.readResource("sovereignops://tasks/readable-note");

    assert.equal(result.ok, true);
    assert.equal(handlerCalls, 1);
    assert.deepEqual(result.value.contents, [
      {
        uri: "sovereignops://tasks/readable-note",
        mimeType: "text/plain",
        text: "ready",
        blob: undefined,
      },
    ]);
    assert.deepEqual(
      result.auditIntents.map((intent) => [intent.type, intent.decision]),
      [
        ["policy_decision", "allow"],
        ["operation_succeeded", "allow"],
      ],
    );
  });

  it("returns a structured error for unknown resources", async () => {
    const adapter = createGatewayResourceAdapter({
      resources: createDefaultGatewayResourceRegistry(),
      policy: () => "allow",
    });

    const result = await adapter.readResource("sovereignops://docs/missing-note");

    assert.equal(result.ok, false);
    assert.deepEqual(result.error, {
      code: "resource_not_found",
      message: "No gateway resource found for sovereignops://docs/missing-note",
      uri: "sovereignops://docs/missing-note",
      capability: "read_object",
    });
    assert.deepEqual(result.auditIntents, []);
  });

  it("keeps adapter metadata and tool metadata stable", () => {
    const adapter = createGatewayResourceAdapter({
      resources: createDefaultGatewayResourceRegistry(),
      policy: () => "allow",
    });

    const first = adapter.listTools();
    assert.equal(first.ok, true);
    first.value.tools[0].name = "mutated";

    const second = adapter.listTools();
    assert.equal(second.ok, true);
    assert.deepEqual(adapter.metadata, MCP_GATEWAY_ADAPTER_METADATA);
    assert.deepEqual(second.value.tools, MCP_GATEWAY_TOOL_METADATA);
    assert.deepEqual(
      second.value.tools.map((tool) => tool.name),
      ["gateway.list_resources", "gateway.read_resource"],
    );
  });
});
