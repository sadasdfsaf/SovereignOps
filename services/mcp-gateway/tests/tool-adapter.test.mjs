import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createToolAuditEmitter } from "../src/auditEmitter.ts";
import {
  MCP_SAFE_LOCAL_TOOL_METADATA,
  createSafeLocalToolAdapter,
} from "../src/toolAdapter.ts";
import {
  SAFE_LOCAL_TOOL_NAMES,
  SafeLocalToolRegistry,
} from "../src/tools.ts";

const fixedClock = () => "2026-04-27T00:00:00.000Z";

describe("safe local MCP tool adapter", () => {
  it("lists stable MCP tool metadata with input schemas", () => {
    const adapter = createSafeLocalToolAdapter({
      policy: () => "allow",
    });

    const first = adapter.listTools();
    assert.equal(first.ok, true);
    assert.deepEqual(
      first.value.tools.map((tool) => tool.name),
      [...SAFE_LOCAL_TOOL_NAMES],
    );
    assert.deepEqual(
      first.value.tools.map((tool) => tool.inputSchema.required),
      [
        ["title"],
        ["targetPath"],
        ["evidenceRef", "targetRef"],
        ["name"],
      ],
    );
    assert.equal(
      first.value.tools.find((tool) => tool.name === "create_task_proposal")
        .inputSchema.properties.title.type,
      "string",
    );
    assert.equal(
      first.value.tools.find((tool) => tool.name === "draft_document_patch")
        .inputSchema.properties.patch.type,
      "string",
    );
    assert.equal(
      first.value.tools.find((tool) => tool.name === "link_evidence")
        .inputSchema.properties.evidenceRef.type,
      "string",
    );
    assert.equal(
      first.value.tools.find((tool) => tool.name === "propose_automation_rule")
        .inputSchema.properties.safeguards.items.type,
      "string",
    );

    first.value.tools[0].name = "mutated";
    first.value.tools[0].inputSchema.properties.title.type = "number";

    const second = adapter.listTools();
    assert.equal(second.ok, true);
    assert.deepEqual(second.value.tools, MCP_SAFE_LOCAL_TOOL_METADATA);
    assert.equal(
      second.value.tools[0].inputSchema.properties.title.type,
      "string",
    );
  });

  it("calls default safe local tools as MCP results without durable side effects", async () => {
    const calls = [];
    const audit = createToolAuditEmitter({ now: fixedClock });
    const adapter = createSafeLocalToolAdapter({
      audit,
      policy: (request) => {
        calls.push(request);
        return { decision: "allow", ruleId: "allow-safe-local" };
      },
    });

    const cases = [
      {
        name: "create_task_proposal",
        args: { title: "Review local note" },
        kind: "task_proposal",
      },
      {
        name: "draft_document_patch",
        args: { targetPath: "notes/local.md", patch: "candidate patch" },
        kind: "document_patch",
      },
      {
        name: "link_evidence",
        args: { evidenceRef: "evidence-1", targetRef: "note-1" },
        kind: "evidence_link_proposal",
      },
      {
        name: "propose_automation_rule",
        args: { name: "Daily local reminder" },
        kind: "automation_rule_proposal",
      },
    ];

    for (const testCase of cases) {
      const result = await adapter.callTool(testCase.name, testCase.args, {
        actor: { id: "worker-c" },
        metadata: { source: "tool-adapter-test" },
      });

      assert.equal(result.ok, true, testCase.name);
      assert.equal(result.value.structuredContent.kind, testCase.kind);
      assert.equal(result.value.structuredContent.durableSideEffects, false);
      assert.equal(result.value.content[0].type, "text");
      assert.match(result.value.content[0].text, /"durableSideEffects": false/);
      assert.deepEqual(
        result.auditRecords.map((record) => record.type),
        ["tool_call_requested", "tool_call_approved", "tool_call_executed"],
      );
    }

    assert.deepEqual(
      calls.map((call) => [call.toolName, call.metadata.operation]),
      cases.map((testCase) => [testCase.name, "tools.call"]),
    );
    assert.equal(audit.entries().length, cases.length * 3);
  });

  it("returns structured errors for denied and approval-required policies", async () => {
    const registry = new SafeLocalToolRegistry([
      {
        name: "create_task_proposal",
        description: "Custom proposal handler.",
        handler: () => ({ shouldNotRun: true }),
      },
      {
        name: "draft_document_patch",
        description: "Custom patch handler.",
        handler: () => ({ shouldNotRun: true }),
      },
    ]);
    const adapter = createSafeLocalToolAdapter({
      registry,
      policy: (request) =>
        request.toolName === "create_task_proposal"
          ? {
              decision: "deny",
              reason: "blocked by test policy",
              ruleId: "deny-proposal",
            }
          : {
              decision: "require_approval",
              reason: "review required",
              ruleId: "approval-patch",
              approvalId: "approval-patch-1",
            },
    });

    const denied = await adapter.callTool("create_task_proposal", {
      title: "Blocked proposal",
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.error.code, "denied");
    assert.equal(denied.error.ruleId, "deny-proposal");
    assert.deepEqual(
      denied.auditRecords.map((record) => [record.type, record.decision]),
      [
        ["tool_call_requested", undefined],
        ["tool_call_denied", "deny"],
      ],
    );

    const approval = await adapter.callTool("draft_document_patch", {
      targetPath: "notes/local.md",
      patch: "candidate patch",
    });
    assert.equal(approval.ok, false);
    assert.equal(approval.error.code, "approval_required");
    assert.equal(approval.error.approvalId, "approval-patch-1");
    assert.deepEqual(
      approval.auditRecords.map((record) => [record.type, record.decision]),
      [
        ["tool_call_requested", undefined],
        ["tool_call_approval_required", "require_approval"],
      ],
    );
  });

  it("returns an unknown structured error without evaluating policy", async () => {
    let policyCalls = 0;
    const adapter = createSafeLocalToolAdapter({
      policy: () => {
        policyCalls += 1;
        return "allow";
      },
    });

    const result = await adapter.callTool("missing_safe_local_tool", {
      title: "Missing tool",
    });

    assert.equal(result.ok, false);
    assert.equal(result.error.code, "unknown");
    assert.equal(result.error.toolName, "missing_safe_local_tool");
    assert.equal(policyCalls, 0);
    assert.deepEqual(
      result.auditRecords.map((record) => record.type),
      ["tool_call_requested", "tool_call_failed"],
    );
    assert.equal(result.auditRecords.at(-1).metadata.code, "unknown");
  });

  it("returns handler_failed when an allowed handler throws", async () => {
    const registry = new SafeLocalToolRegistry([
      {
        name: "link_evidence",
        description: "Throwing evidence handler.",
        handler: () => {
          throw new Error("handler broke");
        },
      },
    ]);
    const adapter = createSafeLocalToolAdapter({
      registry,
      policy: () => ({ decision: "allow", ruleId: "allow-throwing-handler" }),
    });

    const result = await adapter.callTool("link_evidence", {
      evidenceRef: "evidence-2",
      targetRef: "note-2",
    });

    assert.equal(result.ok, false);
    assert.equal(result.error.code, "handler_failed");
    assert.equal(result.error.message, "handler broke");
    assert.deepEqual(
      result.auditRecords.map((record) => [record.type, record.decision]),
      [
        ["tool_call_requested", undefined],
        ["tool_call_approved", "allow"],
        ["tool_call_failed", "allow"],
      ],
    );
    assert.equal(result.auditRecords.at(-1).metadata.code, "handler_failed");
  });
});
