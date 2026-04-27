import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createGatewayResourceAdapter } from "../src/adapter.ts";
import {
  createGatewayResourceRegistry,
  GATEWAY_RESOURCE_URIS,
} from "../src/resources.ts";
import { createMcpGatewayRuntime } from "../src/runtime.ts";
import { MCP_SAFETY_ANNOTATION_FIELD } from "../src/safety.ts";
import { SafeLocalToolRegistry } from "../src/tools.ts";
import {
  MCP_GATEWAY_PROTOCOL_VERSION,
  MCP_PROTOCOL_ERROR_CODES,
  createMcpProtocolAdapter,
  handleMcpProtocolRequest,
} from "../src/protocol.ts";

const fixedClock = () => "2026-04-27T00:00:00.000Z";

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

  it("routes tools/call through compatible adapters with safety and audit records", async () => {
    const runtime = createMcpGatewayRuntime({ clock: fixedClock });
    const protocol = createMcpProtocolAdapter(runtime);

    const initialized = await protocol.handleRequest({
      jsonrpc: "2.0",
      id: "tool-init",
      method: "initialize",
      params: {},
    });
    assert.equal(initialized.result.ok, true);
    assert.equal(initialized.result.value.capabilities.tools.call, true);

    const response = await protocol.handleRequest(
      {
        jsonrpc: "2.0",
        id: "tool-call-1",
        method: "tools/call",
        params: {
          name: "create_task_proposal",
          arguments: { title: "Review local note" },
        },
      },
      {
        actor: { id: "worker-1" },
        metadata: { source: "protocol-test" },
      },
    );

    assert.equal(response.id, "tool-call-1");
    assert.equal(response.result.ok, true);
    assert.equal(response.result.value.structuredContent.kind, "task_proposal");
    assert.equal(response.result.value.structuredContent.durableSideEffects, false);
    assert.equal(
      response.result.value.structuredContent[MCP_SAFETY_ANNOTATION_FIELD].scope,
      "mcp_tool_output",
    );
    assert.equal(response.result.value.content[0].safety.scope, "mcp_tool_output");
    assert.deepEqual(
      response.result.auditRecords.map((record) => [
        record.type,
        record.toolName,
        record.actorId,
      ]),
      [
        ["tool_call_requested", "create_task_proposal", "worker-1"],
        ["tool_call_approved", "create_task_proposal", "worker-1"],
        ["tool_call_executed", "create_task_proposal", "worker-1"],
      ],
    );
    assert.deepEqual(response.result.auditIntents, []);
  });

  it("accepts toolName alias for tools/call params", async () => {
    const protocol = createMcpProtocolAdapter(
      createMcpGatewayRuntime({ clock: fixedClock }),
    );

    const response = await protocol.handleRequest({
      jsonrpc: "2.0",
      id: "tool-call-alias",
      method: "tools/call",
      params: {
        toolName: "link_evidence",
        arguments: { evidenceRef: "evidence-1", targetRef: "note-1" },
      },
    });

    assert.equal(response.result.ok, true);
    assert.equal(
      response.result.value.structuredContent.kind,
      "evidence_link_proposal",
    );
    assert.equal(response.result.auditRecords[0].toolName, "link_evidence");
  });

  it("returns method-not-found for tools/call on resource-only adapters", async () => {
    const protocol = createProtocol({
      resources: createGatewayResourceRegistry(),
      policy: () => "allow",
    });

    const response = await protocol.handleRequest({
      jsonrpc: "2.0",
      id: "resource-only-tool-call",
      method: "tools/call",
      params: {
        name: "create_task_proposal",
        arguments: { title: "Unsupported call" },
      },
    });

    assert.equal(response.id, "resource-only-tool-call");
    assert.equal(response.error.code, MCP_PROTOCOL_ERROR_CODES.methodNotFound);
    assert.equal(response.error.data.error.code, "method_not_found");
    assert.equal(response.error.data.error.details.method, "tools/call");
  });

  it("maps tools/call adapter errors to structured protocol errors", async () => {
    const cases = [
      {
        id: "tool-denied",
        runtime: createMcpGatewayRuntime({
          toolPolicy: () => ({
            decision: "deny",
            reason: "blocked by protocol test",
            ruleId: "deny-protocol-tool",
          }),
        }),
        params: {
          name: "create_task_proposal",
          arguments: { title: "Blocked proposal" },
        },
        expectedRpcCode: MCP_PROTOCOL_ERROR_CODES.accessRejected,
        expectedAdapterCode: "denied",
        expectedAuditTypes: ["tool_call_requested", "tool_call_denied"],
        expectedRuleId: "deny-protocol-tool",
      },
      {
        id: "tool-approval",
        runtime: createMcpGatewayRuntime({
          clock: fixedClock,
          approvalIdPrefix: "protocol-approval-",
          toolPolicy: () => ({
            decision: "require_approval",
            reason: "review required by protocol test",
            ruleId: "approval-protocol-tool",
          }),
        }),
        params: {
          name: "draft_document_patch",
          arguments: { targetPath: "notes/local.md", patch: "candidate patch" },
        },
        expectedRpcCode: MCP_PROTOCOL_ERROR_CODES.accessRejected,
        expectedAdapterCode: "approval_required",
        expectedAuditTypes: [
          "tool_call_requested",
          "tool_call_approval_required",
        ],
        expectedRuleId: "approval-protocol-tool",
        expectedApprovalId: "protocol-approval-1",
      },
      {
        id: "tool-unknown",
        runtime: createMcpGatewayRuntime(),
        params: {
          name: "missing_safe_local_tool",
          arguments: { title: "Missing tool" },
        },
        expectedRpcCode: MCP_PROTOCOL_ERROR_CODES.notFound,
        expectedAdapterCode: "unknown",
        expectedAuditTypes: ["tool_call_requested", "tool_call_failed"],
      },
      {
        id: "tool-handler-failed",
        runtime: createMcpGatewayRuntime({
          safeLocalToolRegistry: new SafeLocalToolRegistry([
            {
              name: "link_evidence",
              description: "Throwing evidence linker.",
              handler: () => {
                throw new Error("handler broke in protocol test");
              },
            },
          ]),
          toolPolicy: () => ({
            decision: "allow",
            ruleId: "allow-throwing-tool",
          }),
        }),
        params: {
          name: "link_evidence",
          arguments: { evidenceRef: "evidence-2", targetRef: "note-2" },
        },
        expectedRpcCode: MCP_PROTOCOL_ERROR_CODES.gatewayError,
        expectedAdapterCode: "handler_failed",
        expectedAuditTypes: [
          "tool_call_requested",
          "tool_call_approved",
          "tool_call_failed",
        ],
        expectedRuleId: "allow-throwing-tool",
      },
    ];

    for (const testCase of cases) {
      const response = await createMcpProtocolAdapter(testCase.runtime).handleRequest({
        jsonrpc: "2.0",
        id: testCase.id,
        method: "tools/call",
        params: testCase.params,
      });

      assert.equal(response.id, testCase.id);
      assert.equal(response.error.code, testCase.expectedRpcCode);
      assert.equal(response.error.data.ok, false);
      assert.equal(response.error.data.error.code, testCase.expectedAdapterCode);
      assert.equal(response.error.data.error.toolName, testCase.params.name);
      assert.equal(response.error.data.error.ruleId, testCase.expectedRuleId);
      assert.equal(response.error.data.error.approvalId, testCase.expectedApprovalId);
      assert.deepEqual(
        response.error.data.auditRecords.map((record) => record.type),
        testCase.expectedAuditTypes,
      );
      assert.deepEqual(response.error.data.auditIntents, []);
    }
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
