import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuditEmitter } from "../src/audit.ts";
import {
  PolicyApprovalRequiredError,
  PolicyDeniedError,
  createStaticPolicy,
} from "../src/policy.ts";
import { createResourceRegistry, createToolRegistry } from "../src/registry.ts";

const fixedClock = () => "2026-04-27T00:00:00.000Z";

describe("mcp gateway policy flow", () => {
  it("denies resource reads before a handler can return data", async () => {
    const audit = createAuditEmitter({ now: fixedClock });
    const resources = createResourceRegistry({
      audit,
      policy: createStaticPolicy([
        {
          id: "deny-private-record",
          path: "/records/private",
          capability: "read_object",
          decision: "deny",
          reason: "private record is blocked",
        },
      ]),
    });
    let handlerCalled = false;

    resources.register({
      path: "/records/private",
      handler: () => {
        handlerCalled = true;
        return { status: "should-not-run" };
      },
    });

    await assert.rejects(
      () => resources.read("/records/private"),
      PolicyDeniedError,
    );
    assert.equal(handlerCalled, false);
    assert.deepEqual(
      audit.entries().map((event) => [event.type, event.decision]),
      [["policy_decision", "deny"]],
    );
  });

  it("requires approval before a tool handler can cause a side effect", async () => {
    const audit = createAuditEmitter({ now: fixedClock });
    const tools = createToolRegistry({
      audit,
      policy: createStaticPolicy([
        {
          id: "approve-batch-update",
          path: "/tools/batch-update",
          capability: "write_object",
          decision: "require_approval",
          reason: "batch update needs review",
        },
      ]),
    });
    let sideEffects = 0;

    tools.register({
      path: "/tools/batch-update",
      capability: "write_object",
      handler: () => {
        sideEffects += 1;
        return { updated: true };
      },
    });

    await assert.rejects(
      () => tools.call("/tools/batch-update", { count: 2 }),
      PolicyApprovalRequiredError,
    );
    assert.equal(sideEffects, 0);
    assert.deepEqual(
      audit.entries().map((event) => [event.type, event.decision]),
      [["policy_decision", "require_approval"]],
    );
  });

  it("allows approved resource and tool paths after policy evaluates first", async () => {
    const order = [];
    const audit = createAuditEmitter({ now: fixedClock });
    const policy = async (request) => {
      order.push(`policy:${request.path}`);
      return {
        decision: "allow",
        path: request.path,
        capability: request.capability,
        ruleId: "allow-test-path",
      };
    };
    const resources = createResourceRegistry({ audit, policy });
    const tools = createToolRegistry({ audit, policy });

    resources.register({
      path: "/records/catalog",
      handler: () => {
        order.push("resource-handler");
        return { label: "catalog" };
      },
    });
    tools.register({
      path: "/tools/summarize",
      handler: (input) => {
        order.push("tool-handler");
        return { summary: `items:${input.items}` };
      },
    });

    assert.deepEqual(await resources.read("/records/catalog"), { label: "catalog" });
    assert.deepEqual(await tools.call("/tools/summarize", { items: 3 }), {
      summary: "items:3",
    });
    assert.deepEqual(order, [
      "policy:/records/catalog",
      "resource-handler",
      "policy:/tools/summarize",
      "tool-handler",
    ]);
    assert.deepEqual(
      audit.entries().map((event) => [event.type, event.path, event.decision]),
      [
        ["policy_decision", "/records/catalog", "allow"],
        ["operation_succeeded", "/records/catalog", "allow"],
        ["policy_decision", "/tools/summarize", "allow"],
        ["operation_succeeded", "/tools/summarize", "allow"],
      ],
    );
  });
});
