import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createGatewayResourceAdapter } from "../src/adapter.ts";
import { createAuditEmitter } from "../src/audit.ts";
import { createToolAuditEmitter } from "../src/auditEmitter.ts";
import {
  PolicyApprovalRequiredError,
  PolicyDeniedError,
  createStaticPolicy,
} from "../src/policy.ts";
import { createResourceRegistry, createToolRegistry } from "../src/registry.ts";
import { GatewayResourceRegistry } from "../src/resources.ts";
import { executeToolCall } from "../src/tools.ts";

const fixedClock = () => "2026-04-27T00:00:00.000Z";

describe("mcp gateway security contracts", () => {
  it("prevents denied resource and tool handlers from running", async () => {
    const audit = createAuditEmitter({ now: fixedClock });
    const denyAll = createStaticPolicy([], "deny");
    const resources = createResourceRegistry({ audit, policy: denyAll });
    const tools = createToolRegistry({ audit, policy: denyAll });
    let resourceHandlerCalls = 0;
    let toolHandlerCalls = 0;

    resources.register({
      path: "/workspace/private-note",
      handler: () => {
        resourceHandlerCalls += 1;
        return { visible: true };
      },
    });
    tools.register({
      path: "/tools/private-update",
      capability: "write_object",
      handler: () => {
        toolHandlerCalls += 1;
        return { updated: true };
      },
    });

    await assert.rejects(
      () => resources.read("/workspace/private-note"),
      PolicyDeniedError,
    );
    await assert.rejects(
      () => tools.call("/tools/private-update", { title: "Do not run" }),
      PolicyDeniedError,
    );

    assert.equal(resourceHandlerCalls, 0);
    assert.equal(toolHandlerCalls, 0);
    assert.deepEqual(
      audit.entries().map((event) => [event.type, event.path, event.decision]),
      [
        ["policy_decision", "/workspace/private-note", "deny"],
        ["policy_decision", "/tools/private-update", "deny"],
      ],
    );
  });

  it("prevents approval-required paths from producing durable side effects", async () => {
    const audit = createAuditEmitter({ now: fixedClock });
    const tools = createToolRegistry({
      audit,
      policy: createStaticPolicy([
        {
          id: "approval-for-local-write",
          path: "/tools/local-write",
          capability: "write_object",
          decision: "require_approval",
          reason: "local write needs approval",
        },
      ]),
    });
    const durableWrites = [];

    tools.register({
      path: "/tools/local-write",
      capability: "write_object",
      handler: (input) => {
        durableWrites.push(input);
        return { durableSideEffects: true };
      },
    });

    await assert.rejects(
      () => tools.call("/tools/local-write", { recordId: "rec-1" }),
      PolicyApprovalRequiredError,
    );

    assert.deepEqual(durableWrites, []);
    assert.deepEqual(
      audit.entries().map((event) => [event.type, event.path, event.decision]),
      [["policy_decision", "/tools/local-write", "require_approval"]],
    );
  });

  it("denies plugin and tool permission mismatches through injected policy", async () => {
    const audit = createToolAuditEmitter({ now: fixedClock });
    let handlerCalls = 0;

    const result = await executeToolCall({
      toolName: "draft_document_patch",
      arguments: {
        targetPath: "docs/workspace-note.md",
        patch: "candidate patch",
      },
      metadata: {
        pluginId: "workspace-helper",
        allowedTools: ["create_task_proposal"],
      },
      audit,
      handlers: {
        draft_document_patch: () => {
          handlerCalls += 1;
          return { durableSideEffects: true };
        },
      },
      policy: (request) => {
        const allowedTools = request.metadata?.allowedTools;
        return Array.isArray(allowedTools) && allowedTools.includes(request.toolName)
          ? { decision: "allow", ruleId: "tool-permission-match" }
          : {
              decision: "deny",
              reason: "tool is outside plugin permission set",
              ruleId: "tool-permission-mismatch",
            };
      },
    });

    assert.equal(result.status, "denied");
    assert.equal(result.policy.ruleId, "tool-permission-mismatch");
    assert.equal(handlerCalls, 0);
    assert.deepEqual(
      audit.entries().map((event) => [event.type, event.toolName, event.decision]),
      [
        ["tool_call_requested", "draft_document_patch", undefined],
        ["tool_call_denied", "draft_document_patch", "deny"],
      ],
    );
  });

  it("does not resolve traversal-like resource names to registered resources", async () => {
    let handlerCalls = 0;
    let policyCalls = 0;
    const registry = new GatewayResourceRegistry([
      {
        uri: "sovereignops://docs/operator-guide",
        name: "Operator Guide",
        mimeType: "text/plain",
        read: () => {
          handlerCalls += 1;
          return {
            uri: "sovereignops://docs/operator-guide",
            text: "registered resource",
          };
        },
      },
    ]);
    const adapter = createGatewayResourceAdapter({
      resources: registry,
      policy: () => {
        policyCalls += 1;
        return "allow";
      },
    });

    for (const uri of [
      "sovereignops://docs/../docs/operator-guide",
      "sovereignops://docs/%2e%2e/docs/operator-guide",
      "sovereignops://docs/operator-guide/..",
    ]) {
      const result = await adapter.readResource(uri);

      assert.equal(result.ok, false);
      assert.equal(result.error.code, "resource_not_found");
      assert.equal(result.error.uri, uri);
      assert.deepEqual(result.auditIntents, []);
    }

    assert.equal(handlerCalls, 0);
    assert.equal(policyCalls, 0);
  });

  it("audits requested and final outcomes with sensitive arguments redacted", async () => {
    const audit = createToolAuditEmitter({ now: fixedClock });

    await executeToolCall({
      toolName: "create_task_proposal",
      arguments: {
        title: "Allowed proposal",
        apiKey: "plain-secret-value",
      },
      audit,
      handlers: {
        create_task_proposal: () => ({ kind: "task_proposal" }),
      },
      policy: () => ({ decision: "allow", ruleId: "allow-proposal" }),
    });

    await executeToolCall({
      toolName: "link_evidence",
      arguments: {
        evidenceRef: "local-ref-1",
        sessionToken: "nested-secret-value",
      },
      audit,
      handlers: {
        link_evidence: () => ({ durableSideEffects: true }),
      },
      policy: () => ({ decision: "deny", ruleId: "deny-link" }),
    });

    await executeToolCall({
      toolName: "draft_document_patch",
      arguments: {
        targetPath: "docs/workspace-note.md",
        patch: "candidate patch",
        password: "plain-secret-value",
      },
      audit,
      handlers: {
        draft_document_patch: () => ({ durableSideEffects: true }),
      },
      policy: () => ({
        decision: "require_approval",
        ruleId: "approval-document-patch",
        approvalId: "approval-document-patch-1",
      }),
    });

    const entries = audit.entries();
    assertAuditFlow(entries, "create_task_proposal", "allow");
    assertAuditFlow(entries, "link_evidence", "deny");
    assertAuditFlow(entries, "draft_document_patch", "require_approval");

    assert.equal(
      requestedAuditEvent(entries, "create_task_proposal").arguments.apiKey,
      "[REDACTED]",
    );
    assert.equal(
      requestedAuditEvent(entries, "link_evidence").arguments.sessionToken,
      "[REDACTED]",
    );
    assert.equal(
      requestedAuditEvent(entries, "draft_document_patch").arguments.password,
      "[REDACTED]",
    );
    const serializedEntries = JSON.stringify(entries);
    assert.equal(serializedEntries.includes("plain-secret-value"), false);
    assert.equal(serializedEntries.includes("nested-secret-value"), false);
  });
});

function assertAuditFlow(entries, toolName, finalDecision) {
  const toolEvents = entries.filter((event) => event.toolName === toolName);

  assert.equal(toolEvents[0]?.type, "tool_call_requested");
  assert.equal(toolEvents[0]?.decision, undefined);
  assert.ok(
    toolEvents.slice(1).some((event) => event.decision === finalDecision),
    `${toolName} missing final ${finalDecision} audit outcome`,
  );
}

function requestedAuditEvent(entries, toolName) {
  const event = entries.find(
    (candidate) =>
      candidate.toolName === toolName && candidate.type === "tool_call_requested",
  );

  assert.ok(event, `${toolName} missing requested audit record`);
  return event;
}
