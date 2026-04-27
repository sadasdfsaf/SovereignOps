import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createToolAuditEmitter } from "../src/auditEmitter.ts";
import {
  SAFE_LOCAL_TOOL_NAMES,
  createSafeLocalToolRegistry,
  executeToolCall,
} from "../src/tools.ts";

const fixedClock = () => "2026-04-27T00:00:00.000Z";

describe("safe local tool registry and audit emitter", () => {
  it("returns a denied result and records the denied call", async () => {
    const audit = createToolAuditEmitter({ now: fixedClock });

    const result = await executeToolCall({
      toolName: "create_task_proposal",
      arguments: { title: "Review local notes" },
      audit,
      handlers: {
        create_task_proposal: () => ({ shouldNotRun: true }),
      },
      policy: () => ({
        decision: "deny",
        reason: "tool is blocked for this workspace",
        ruleId: "deny-create-task",
      }),
    });

    assert.equal(result.status, "denied");
    assert.equal(result.policy.reason, "tool is blocked for this workspace");
    assert.deepEqual(
      audit.entries().map((event) => [event.type, event.toolName, event.decision]),
      [
        ["tool_call_requested", "create_task_proposal", undefined],
        ["tool_call_denied", "create_task_proposal", "deny"],
      ],
    );
  });

  it("returns approval_required without executing the handler", async () => {
    const audit = createToolAuditEmitter({ now: fixedClock });
    let handlerCalled = false;

    const result = await executeToolCall({
      toolName: "draft_document_patch",
      arguments: { targetPath: "docs/work-notes.md", patch: "proposed patch" },
      audit,
      handlers: {
        draft_document_patch: () => {
          handlerCalled = true;
          return { shouldNotRun: true };
        },
      },
      policy: () => ({
        decision: "require_approval",
        reason: "document patch needs review",
        approvalId: "apv_document_patch",
      }),
    });

    assert.equal(result.status, "approval_required");
    assert.equal(result.policy.approvalId, "apv_document_patch");
    assert.equal(handlerCalled, false);
    assert.deepEqual(
      audit.entries().map((event) => event.type),
      ["tool_call_requested", "tool_call_approval_required"],
    );
    assert.equal(audit.entries()[1].decision, "require_approval");
  });

  it("allows and executes registered safe local tools as proposals", async () => {
    const audit = createToolAuditEmitter({ now: fixedClock });
    const registry = createSafeLocalToolRegistry();

    assert.deepEqual(
      registry.list().map((tool) => tool.name),
      [...SAFE_LOCAL_TOOL_NAMES],
    );

    const result = await registry.execute({
      toolName: "create_task_proposal",
      arguments: {
        title: "Prepare draft summary",
        description: "Collect local findings before review.",
      },
      audit,
      policy: () => ({ decision: "allow", ruleId: "allow-safe-local" }),
    });

    assert.equal(result.status, "executed");
    assert.deepEqual(result.output, {
      kind: "task_proposal",
      title: "Prepare draft summary",
      description: "Collect local findings before review.",
      priority: undefined,
      acceptanceCriteria: undefined,
      evidence: undefined,
      durableSideEffects: false,
    });
    assert.deepEqual(
      audit.entries().map((event) => [event.type, event.decision, event.resultSummary]),
      [
        ["tool_call_requested", undefined, undefined],
        ["tool_call_approved", "allow", undefined],
        ["tool_call_executed", "allow", "task_proposal"],
      ],
    );
  });

  it("does not call an injected handler when policy denies execution", async () => {
    let handlerCalls = 0;

    const result = await executeToolCall({
      toolName: "custom_safe_action",
      arguments: { title: "Do not run" },
      handlers: {
        custom_safe_action: () => {
          handlerCalls += 1;
          return { ran: true };
        },
      },
      policy: () => "deny",
    });

    assert.equal(result.status, "denied");
    assert.equal(handlerCalls, 0);
  });

  it("redacts sensitive argument names and values in audit records", () => {
    const audit = createToolAuditEmitter({ now: fixedClock });
    const originalArguments = {
      title: "Prepare draft summary",
      apiKey: "plain-secret-value",
      nested: {
        sessionToken: "nested-secret-value",
        note: "Bearer abcdefghijklmnopqrstuvwxyz",
      },
      cards: ["4111 1111 1111 1111"],
      visible: "keep me",
    };

    audit.requested({
      toolName: "create_task_proposal",
      arguments: originalArguments,
    });

    const [record] = audit.entries();
    assert.equal(record.arguments.apiKey, "[REDACTED]");
    assert.equal(record.arguments.nested.sessionToken, "[REDACTED]");
    assert.equal(record.arguments.nested.note, "[REDACTED]");
    assert.deepEqual(record.arguments.cards, ["[REDACTED]"]);
    assert.equal(record.arguments.visible, "keep me");
    assert.equal(originalArguments.apiKey, "plain-secret-value");
  });
});
