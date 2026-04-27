import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuditEmitter } from "../src/audit.ts";
import { createToolAuditEmitter } from "../src/auditEmitter.ts";
import { createApprovalSessionStore } from "../src/approvalSessions.ts";
import { GatewayResourceRegistry } from "../src/resources.ts";
import {
  SafeLocalToolRegistry,
  SAFE_LOCAL_TOOL_NAMES,
} from "../src/tools.ts";
import {
  createMcpGatewayRuntime,
  createStaticToolPolicy,
} from "../src/runtime.ts";

const fixedClock = () => "2026-04-27T00:00:00.000Z";

describe("mcp gateway runtime factory", () => {
  it("composes default adapters with allow policies and collected audit", async () => {
    const runtime = createMcpGatewayRuntime({ clock: fixedClock });

    const listedResources = await runtime.listResources();
    assert.equal(listedResources.ok, true);
    assert.ok(listedResources.value.resources.length > 0);
    assert.ok(
      listedResources.value.resources.every((resource) =>
        resource.uri.startsWith("sovereignops://"),
      ),
    );

    const read = await runtime.readResource("sovereignops://docs/operator-guide");
    assert.equal(read.ok, true);
    assert.match(read.value.contents[0].text, /Operator Guide/);

    const listedTools = runtime.listTools();
    assert.equal(listedTools.ok, true);
    assert.deepEqual(
      listedTools.value.tools.map((tool) => tool.name),
      [...SAFE_LOCAL_TOOL_NAMES],
    );

    const called = await runtime.callTool("create_task_proposal", {
      title: "Review local plan",
    });
    assert.equal(called.ok, true);
    assert.equal(called.value.structuredContent.kind, "task_proposal");

    assert.ok(
      runtime.resourceAuditEntries().some(
        (record) =>
          record.type === "operation_succeeded" &&
          record.path === "sovereignops://docs/operator-guide",
      ),
    );
    assert.deepEqual(
      runtime.toolAuditEntries().map((record) => [record.type, record.timestamp]),
      [
        ["tool_call_requested", "2026-04-27T00:00:00.000Z"],
        ["tool_call_approved", "2026-04-27T00:00:00.000Z"],
        ["tool_call_executed", "2026-04-27T00:00:00.000Z"],
      ],
    );
  });

  it("honors injected deny policies without running resource or tool handlers", async () => {
    let resourceHandlerCalls = 0;
    let toolHandlerCalls = 0;
    const resourceRegistry = new GatewayResourceRegistry([
      {
        uri: "sovereignops://docs/blocked-note",
        name: "Blocked Note",
        mimeType: "text/plain",
        read: () => {
          resourceHandlerCalls += 1;
          return {
            uri: "sovereignops://docs/blocked-note",
            text: "should not be returned",
          };
        },
      },
    ]);
    const safeLocalToolRegistry = new SafeLocalToolRegistry([
      {
        name: "create_task_proposal",
        description: "Custom proposal handler.",
        handler: () => {
          toolHandlerCalls += 1;
          return { shouldNotRun: true };
        },
      },
    ]);
    const runtime = createMcpGatewayRuntime({
      resourceRegistry,
      safeLocalToolRegistry,
      resourcePolicy: (request) => ({
        decision: "deny",
        path: request.path,
        capability: request.capability,
        reason: "blocked by runtime test",
        ruleId: "deny-runtime-resource",
      }),
      toolPolicy: () => ({
        decision: "deny",
        reason: "blocked by runtime test",
        ruleId: "deny-runtime-tool",
      }),
    });

    const read = await runtime.readResource("sovereignops://docs/blocked-note");
    assert.equal(read.ok, false);
    assert.equal(read.error.code, "policy_denied");
    assert.equal(read.error.ruleId, "deny-runtime-resource");
    assert.equal(resourceHandlerCalls, 0);

    const called = await runtime.callTool("create_task_proposal", {
      title: "Blocked proposal",
    });
    assert.equal(called.ok, false);
    assert.equal(called.error.code, "denied");
    assert.equal(called.error.ruleId, "deny-runtime-tool");
    assert.equal(toolHandlerCalls, 0);
    assert.deepEqual(
      runtime.toolAuditEntries().map((record) => record.type),
      ["tool_call_requested", "tool_call_denied"],
    );
  });

  it("creates approval sessions for approval-required resource reads and tool calls", async () => {
    const resourceRegistry = new GatewayResourceRegistry([
      {
        uri: "sovereignops://docs/review-note",
        name: "Review Note",
        mimeType: "text/plain",
        read: () => {
          throw new Error("resource handler should not run");
        },
      },
    ]);
    const runtime = createMcpGatewayRuntime({
      clock: fixedClock,
      approvalIdPrefix: "runtime-test-approval-",
      resourceRegistry,
      resourcePolicy: (request) => ({
        decision: "require_approval",
        path: request.path,
        capability: request.capability,
        reason: "resource needs review",
        ruleId: "approval-runtime-resource",
      }),
      toolPolicy: () => ({
        decision: "require_approval",
        reason: "tool needs review",
        ruleId: "approval-runtime-tool",
      }),
      initialApprovalSessions: [
        {
          request: { type: "seeded", target: "preexisting-review" },
          actor: { id: "seed-actor" },
        },
      ],
    });

    const read = await runtime.readResource("sovereignops://docs/review-note", {
      actor: { id: "worker-1" },
    });
    assert.equal(read.ok, false);
    assert.equal(read.error.code, "approval_required");

    const called = await runtime.callTool(
      "draft_document_patch",
      {
        targetPath: "notes/local.md",
        patch: "candidate patch",
      },
      { actor: { id: "worker-1" } },
    );
    assert.equal(called.ok, false);
    assert.equal(called.error.code, "approval_required");
    assert.equal(called.error.approvalId, "runtime-test-approval-3");

    const pending = runtime.approvals.list({ status: "pending" });
    assert.deepEqual(
      pending.map((session) => [session.id, session.request.type, session.ruleId]),
      [
        ["runtime-test-approval-1", "seeded", undefined],
        ["runtime-test-approval-2", "resource", "approval-runtime-resource"],
        ["runtime-test-approval-3", "tool", "approval-runtime-tool"],
      ],
    );
    assert.deepEqual(pending[1].actor, { id: "worker-1" });
    assert.equal(pending[1].createdAt, "2026-04-27T00:00:00.000Z");
    assert.deepEqual(pending[2].request.arguments, {
      targetPath: "notes/local.md",
      patch: "candidate patch",
    });
  });

  it("uses injected registries, static policies, audit sinks, and approval store", async () => {
    const resourceAudit = createAuditEmitter({ now: fixedClock, idPrefix: "res-audit-" });
    const toolAudit = createToolAuditEmitter({
      now: fixedClock,
      idPrefix: "tool-audit-",
    });
    const approvals = createApprovalSessionStore({
      now: fixedClock,
      idPrefix: "injected-approval-",
    });
    const runtime = createMcpGatewayRuntime({
      resourceAudit,
      toolAudit,
      approvals,
      resourceRegistry: new GatewayResourceRegistry([
        {
          uri: "sovereignops://docs/custom-note",
          name: "Custom Note",
          mimeType: "text/plain",
          read: ({ uri }) => ({ uri, text: "custom" }),
        },
      ]),
      safeLocalToolRegistry: new SafeLocalToolRegistry([
        {
          name: "link_evidence",
          description: "Custom evidence linker.",
          handler: (args) => ({ kind: "custom_link", args }),
        },
      ]),
      resourcePolicyRules: [
        {
          id: "allow-custom-note",
          path: "sovereignops://docs/custom-note",
          capability: "read_object",
          decision: "allow",
        },
      ],
      toolPolicy: createStaticToolPolicy([
        {
          id: "allow-custom-link",
          toolName: "link_evidence",
          decision: "allow",
        },
      ]),
      initialApprovalSessions: [
        {
          request: { type: "manual-review", target: "seed" },
        },
      ],
    });

    const read = await runtime.readResource("sovereignops://docs/custom-note");
    assert.equal(read.ok, true);
    assert.equal(read.value.contents[0].text, "custom");

    const called = await runtime.callTool("link_evidence", {
      evidenceRef: "evidence-1",
      targetRef: "note-1",
    });
    assert.equal(called.ok, true);
    assert.equal(called.value.structuredContent.kind, "custom_link");

    assert.deepEqual(
      runtime.approvals.list().map((session) => session.id),
      ["injected-approval-1"],
    );
    assert.deepEqual(
      resourceAudit.entries().map((record) => [record.id, record.type, record.timestamp]),
      [
        ["res-audit-1", "policy_decision", "2026-04-27T00:00:00.000Z"],
        ["res-audit-2", "operation_succeeded", "2026-04-27T00:00:00.000Z"],
      ],
    );
    assert.deepEqual(
      toolAudit.entries().map((record) => [record.id, record.type, record.timestamp]),
      [
        ["tool-audit-1", "tool_call_requested", "2026-04-27T00:00:00.000Z"],
        ["tool-audit-2", "tool_call_approved", "2026-04-27T00:00:00.000Z"],
        ["tool-audit-3", "tool_call_executed", "2026-04-27T00:00:00.000Z"],
      ],
    );
    assert.deepEqual(runtime.auditEntries(), {
      resources: resourceAudit.entries(),
      tools: toolAudit.entries(),
    });
  });
});
