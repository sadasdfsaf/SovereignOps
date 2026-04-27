import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createGatewayResourceAdapter } from "../src/adapter.ts";
import {
  createGatewayResourceRegistry,
  GATEWAY_RESOURCE_URIS,
} from "../src/resources.ts";
import {
  MCP_GATEWAY_PROTOCOL_VERSION,
  MCP_PROTOCOL_ERROR_CODES,
  createMcpProtocolAdapter,
  handleMcpProtocolRequest,
} from "../src/protocol.ts";

function createProtocol({ resources, policy }) {
  const adapter = createGatewayResourceAdapter({
    resources,
    policy,
  });

  return createMcpProtocolAdapter(adapter);
}

describe("mcp gateway protocol adapter", () => {
  it("returns initialize metadata in a stable success envelope", async () => {
    const protocol = createProtocol({
      resources: createGatewayResourceRegistry(),
      policy: () => "allow",
    });

    const response = await protocol.handleRequest({
      jsonrpc: "2.0",
      id: "init-1",
      method: "initialize",
      params: {},
    });

    assert.equal(response.jsonrpc, "2.0");
    assert.equal(response.id, "init-1");
    assert.equal(response.result.ok, true);
    assert.equal(response.result.value.protocolVersion, MCP_GATEWAY_PROTOCOL_VERSION);
    assert.deepEqual(response.result.value.capabilities, {
      resources: {
        list: true,
        read: true,
      },
      tools: {
        list: true,
      },
    });
    assert.equal(response.result.value.serverInfo.name, "sovereignops-mcp-gateway-adapter");
    assert.deepEqual(response.result.auditIntents, []);
  });

  it("routes resources/list and preserves policy audit intents", async () => {
    const protocol = createProtocol({
      resources: createGatewayResourceRegistry([
        {
          uri: GATEWAY_RESOURCE_URIS.docsGuide,
          name: "Visible Note",
          description: "Visible test resource.",
          mimeType: "text/plain",
          read: () => ({ uri: GATEWAY_RESOURCE_URIS.docsGuide, text: "visible" }),
        },
        {
          uri: GATEWAY_RESOURCE_URIS.auditTrail,
          name: "Filtered Note",
          mimeType: "text/plain",
          read: () => ({ uri: GATEWAY_RESOURCE_URIS.auditTrail, text: "filtered" }),
        },
      ]),
      policy: (request) => ({
        decision: request.path === GATEWAY_RESOURCE_URIS.auditTrail ? "deny" : "allow",
        path: request.path,
        capability: request.capability,
        reason: "test decision",
      }),
    });

    const response = await protocol.handleRequest({
      jsonrpc: "2.0",
      id: 42,
      method: "resources/list",
    });

    assert.equal(response.id, 42);
    assert.equal(response.result.ok, true);
    assert.deepEqual(response.result.value.resources, [
      {
        uri: GATEWAY_RESOURCE_URIS.docsGuide,
        name: "Visible Note",
        description: "Visible test resource.",
        mimeType: "text/plain",
      },
    ]);
    assert.deepEqual(
      response.result.auditIntents.map((intent) => [intent.type, intent.decision]),
      [
        ["policy_decision", "allow"],
        ["policy_decision", "deny"],
      ],
    );
  });

  it("routes resources/read with context and preserves successful read output", async () => {
    const actorIds = [];
    const protocol = createProtocol({
      resources: createGatewayResourceRegistry([
        {
          uri: GATEWAY_RESOURCE_URIS.taskQueue,
          name: "Readable Note",
          mimeType: "text/plain",
          read: ({ actor, uri }) => ({
            uri,
            text: `actor:${actor?.id ?? "none"}`,
          }),
        },
      ]),
      policy: (request) => {
        actorIds.push(request.actor?.id);
        return "allow";
      },
    });

    const response = await protocol.handleRequest(
      {
        jsonrpc: "2.0",
        id: "read-1",
        method: "resources/read",
        params: { uri: GATEWAY_RESOURCE_URIS.taskQueue },
      },
      { actor: { id: "user-1" } },
    );

    assert.equal(response.result.ok, true);
    assert.deepEqual(actorIds, ["user-1"]);
    assert.deepEqual(response.result.value.contents, [
      {
        uri: GATEWAY_RESOURCE_URIS.taskQueue,
        mimeType: "text/plain",
        text: "actor:user-1",
        blob: undefined,
      },
    ]);
    assert.deepEqual(
      response.result.auditIntents.map((intent) => intent.type),
      ["policy_decision", "operation_succeeded"],
    );
  });

  it("returns validation errors without calling resource handlers", async () => {
    let handlerCalls = 0;
    const protocol = createProtocol({
      resources: createGatewayResourceRegistry([
        {
          uri: GATEWAY_RESOURCE_URIS.taskQueue,
          name: "Readable Note",
          read: () => {
            handlerCalls += 1;
            return { uri: GATEWAY_RESOURCE_URIS.taskQueue, text: "read" };
          },
        },
      ]),
      policy: () => "allow",
    });

    const response = await protocol.handleRequest({
      jsonrpc: "2.0",
      id: "bad-read",
      method: "resources/read",
      params: {},
    });

    assert.equal(response.id, "bad-read");
    assert.equal(response.error.code, MCP_PROTOCOL_ERROR_CODES.invalidParams);
    assert.equal(response.error.data.ok, false);
    assert.equal(response.error.data.error.code, "invalid_params");
    assert.equal(response.error.data.error.details.param, "uri");
    assert.deepEqual(response.error.data.auditIntents, []);
    assert.equal(handlerCalls, 0);
  });

  it("preserves adapter errors and audit intents in error envelopes", async () => {
    const protocol = createProtocol({
      resources: createGatewayResourceRegistry([
        {
          uri: GATEWAY_RESOURCE_URIS.taskQueue,
          name: "Approval Note",
          read: () => ({ uri: GATEWAY_RESOURCE_URIS.taskQueue, text: "blocked" }),
        },
      ]),
      policy: (request) => ({
        decision: "require_approval",
        path: request.path,
        capability: request.capability,
        reason: "approval required by test",
        ruleId: "approval-test",
      }),
    });

    const response = await protocol.handleRequest({
      jsonrpc: "2.0",
      id: "blocked-read",
      method: "resources/read",
      params: { uri: GATEWAY_RESOURCE_URIS.taskQueue },
    });

    assert.equal(response.id, "blocked-read");
    assert.equal(response.error.code, MCP_PROTOCOL_ERROR_CODES.accessRejected);
    assert.equal(response.error.data.ok, false);
    assert.deepEqual(response.error.data.error, {
      code: "approval_required",
      message: "approval required by test",
      uri: GATEWAY_RESOURCE_URIS.taskQueue,
      capability: "read_object",
      decision: "require_approval",
      ruleId: "approval-test",
    });
    assert.deepEqual(
      response.error.data.auditIntents.map((intent) => [
        intent.type,
        intent.decision,
        intent.metadata,
      ]),
      [["policy_decision", "require_approval", { ruleId: "approval-test" }]],
    );
  });

  it("routes tools/list and exposes stable tool metadata", async () => {
    const protocol = createProtocol({
      resources: createGatewayResourceRegistry(),
      policy: () => "allow",
    });

    const response = await protocol.handleRequest({
      jsonrpc: "2.0",
      id: null,
      method: "tools/list",
      params: {},
    });

    assert.equal(response.id, null);
    assert.equal(response.result.ok, true);
    assert.deepEqual(
      response.result.value.tools.map((tool) => tool.name),
      ["gateway.list_resources", "gateway.read_resource"],
    );
    assert.deepEqual(response.result.auditIntents, []);
  });

  it("returns method-not-found and invalid-request envelopes with request ids", async () => {
    const adapter = createGatewayResourceAdapter({
      resources: createGatewayResourceRegistry(),
      policy: () => "allow",
    });

    const unknown = await handleMcpProtocolRequest(adapter, {
      jsonrpc: "2.0",
      id: "unknown-1",
      method: "unknown/method",
    });
    assert.equal(unknown.id, "unknown-1");
    assert.equal(unknown.error.code, MCP_PROTOCOL_ERROR_CODES.methodNotFound);
    assert.equal(unknown.error.data.error.code, "method_not_found");

    const invalid = await handleMcpProtocolRequest(adapter, []);
    assert.equal(invalid.id, null);
    assert.equal(invalid.error.code, MCP_PROTOCOL_ERROR_CODES.invalidRequest);
    assert.equal(invalid.error.data.error.code, "invalid_request");
  });
});
