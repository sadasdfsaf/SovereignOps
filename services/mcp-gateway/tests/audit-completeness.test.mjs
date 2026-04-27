import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createGatewayResourceAdapter } from "../src/adapter.ts";
import { createToolAuditEmitter } from "../src/auditEmitter.ts";
import { GatewayResourceRegistry } from "../src/resources.ts";
import { ToolNotFoundError, executeToolCall } from "../src/tools.ts";

const fixedClock = () => "2026-04-27T00:00:00.000Z";
const REDACTED = "[REDACTED]";

describe("mcp gateway audit completeness", () => {
  it("records requested and terminal audit events for each tool outcome", async () => {
    const cases = [
      {
        name: "denied",
        toolName: "create_task_proposal",
        arguments: {
          title: "Denied local note",
          apiKey: "denied-secret-value",
        },
        policy: {
          decision: "deny",
          reason: "blocked by test rule",
          ruleId: "deny-local-note",
        },
        expectedStatus: "denied",
        terminalType: "tool_call_denied",
        expectedHandlerCalls: 0,
      },
      {
        name: "approval required",
        toolName: "draft_document_patch",
        arguments: {
          targetPath: "docs/workspace-note.md",
          patch: "candidate patch",
          password: "approval-secret-value",
        },
        policy: {
          decision: "require_approval",
          reason: "review needed",
          ruleId: "approval-local-patch",
          approvalId: "approval-local-patch-1",
        },
        expectedStatus: "approval_required",
        terminalType: "tool_call_approval_required",
        expectedHandlerCalls: 0,
      },
      {
        name: "allowed",
        toolName: "link_evidence",
        arguments: {
          evidenceRef: "local-evidence-1",
          targetRef: "workspace-note-1",
          sessionToken: "allowed-secret-value",
        },
        policy: {
          decision: "allow",
          ruleId: "allow-local-link",
        },
        expectedStatus: "executed",
        terminalType: "tool_call_executed",
        expectedHandlerCalls: 1,
      },
    ];

    for (const testCase of cases) {
      const audit = createToolAuditEmitter({ now: fixedClock });
      let handlerCalls = 0;

      const result = await executeToolCall({
        toolName: testCase.toolName,
        arguments: testCase.arguments,
        audit,
        handlers: {
          [testCase.toolName]: () => {
            handlerCalls += 1;
            return { kind: `${testCase.name.replaceAll(" ", "_")}_result` };
          },
        },
        policy: () => testCase.policy,
      });

      assert.equal(result.status, testCase.expectedStatus, testCase.name);
      assert.equal(handlerCalls, testCase.expectedHandlerCalls, testCase.name);

      const entries = audit.entries();
      assert.equal(entries[0]?.type, "tool_call_requested", testCase.name);
      assert.equal(entries[0]?.toolName, testCase.toolName, testCase.name);
      assert.equal(entries.at(-1)?.type, testCase.terminalType, testCase.name);
      assert.equal(
        entries.at(-1)?.decision,
        testCase.policy.decision,
        testCase.name,
      );

      if (testCase.policy.decision === "allow") {
        assert.deepEqual(
          entries.map((event) => event.type),
          ["tool_call_requested", "tool_call_approved", "tool_call_executed"],
        );
      } else {
        assert.deepEqual(
          entries.map((event) => event.type),
          ["tool_call_requested", testCase.terminalType],
        );
      }
    }
  });

  it("redacts sensitive tool arguments on denied, approval-required, and allowed paths", async () => {
    const cases = [
      {
        toolName: "create_task_proposal",
        arguments: {
          title: "Denied local note",
          apiKey: "denied-secret-value",
          visible: "keep-denied-value",
        },
        policy: { decision: "deny", ruleId: "deny-redaction" },
        leakedValues: ["denied-secret-value"],
        retainedValues: ["keep-denied-value"],
      },
      {
        toolName: "draft_document_patch",
        arguments: {
          targetPath: "docs/workspace-note.md",
          patch: "candidate patch",
          nested: {
            sessionToken: "approval-secret-value",
            visible: "keep-approval-value",
          },
        },
        policy: {
          decision: "require_approval",
          ruleId: "approval-redaction",
          approvalId: "approval-redaction-1",
        },
        leakedValues: ["approval-secret-value"],
        retainedValues: ["keep-approval-value"],
      },
      {
        toolName: "link_evidence",
        arguments: {
          evidenceRef: "local-evidence-2",
          targetRef: "workspace-note-2",
          note: "Bearer abcdefghijklmnopqrstuvwxyz",
          visible: "keep-allowed-value",
        },
        policy: { decision: "allow", ruleId: "allow-redaction" },
        leakedValues: ["Bearer abcdefghijklmnopqrstuvwxyz"],
        retainedValues: ["keep-allowed-value"],
      },
    ];

    for (const testCase of cases) {
      const audit = createToolAuditEmitter({ now: fixedClock });

      await executeToolCall({
        toolName: testCase.toolName,
        arguments: testCase.arguments,
        audit,
        handlers: {
          [testCase.toolName]: () => ({ kind: "redaction_result" }),
        },
        policy: () => testCase.policy,
      });

      const serializedEntries = JSON.stringify(audit.entries());
      assert.ok(
        serializedEntries.includes(REDACTED),
        `${testCase.toolName} should redact at least one value`,
      );
      for (const value of testCase.leakedValues) {
        assert.equal(
          serializedEntries.includes(value),
          false,
          `${testCase.toolName} leaked ${value}`,
        );
      }
      for (const value of testCase.retainedValues) {
        assert.ok(
          serializedEntries.includes(value),
          `${testCase.toolName} dropped non-sensitive value ${value}`,
        );
      }
    }
  });

  it("emits consistent read and list audit intents for resources", async () => {
    let readableHandlerCalls = 0;
    let blockedHandlerCalls = 0;
    const registry = new GatewayResourceRegistry([
      {
        uri: "sovereignops://docs/readable-note",
        name: "Readable Note",
        mimeType: "text/plain",
        metadata: { category: "notes" },
        read: ({ uri }) => {
          readableHandlerCalls += 1;
          return { uri, text: "readable" };
        },
      },
      {
        uri: "sovereignops://docs/blocked-note",
        name: "Blocked Note",
        mimeType: "text/plain",
        metadata: { category: "notes" },
        read: ({ uri }) => {
          blockedHandlerCalls += 1;
          return { uri, text: "blocked" };
        },
      },
    ]);
    const operations = [];
    const adapter = createGatewayResourceAdapter({
      resources: registry,
      policy: (request) => {
        operations.push(request.metadata.operation);
        return {
          decision: request.path.endsWith("blocked-note") ? "deny" : "allow",
          path: request.path,
          capability: request.capability,
          reason: "audit completeness policy",
          ruleId: `rule-${request.metadata.operation}-${request.path.split("/").at(-1)}`,
        };
      },
    });

    const listResult = await adapter.listResources();
    assert.equal(listResult.ok, true);
    assert.deepEqual(
      listResult.value.resources.map((resource) => resource.uri),
      ["sovereignops://docs/readable-note"],
    );
    assert.deepEqual(operations.splice(0), ["resources.list", "resources.list"]);
    assert.deepEqual(
      listResult.auditIntents.map(compactResourceIntent),
      [
        {
          type: "policy_decision",
          uri: "sovereignops://docs/readable-note",
          capability: "read_object",
          decision: "allow",
          ruleId: "rule-resources.list-readable-note",
        },
        {
          type: "policy_decision",
          uri: "sovereignops://docs/blocked-note",
          capability: "read_object",
          decision: "deny",
          ruleId: "rule-resources.list-blocked-note",
        },
      ],
    );

    const readResult = await adapter.readResource("sovereignops://docs/readable-note");
    assert.equal(readResult.ok, true);
    assert.equal(readableHandlerCalls, 1);
    assert.deepEqual(operations.splice(0), ["resources.read"]);
    assert.deepEqual(
      readResult.auditIntents.map(compactResourceIntent),
      [
        {
          type: "policy_decision",
          uri: "sovereignops://docs/readable-note",
          capability: "read_object",
          decision: "allow",
          ruleId: "rule-resources.read-readable-note",
        },
        {
          type: "operation_succeeded",
          uri: "sovereignops://docs/readable-note",
          capability: "read_object",
          decision: "allow",
          ruleId: undefined,
        },
      ],
    );

    const deniedReadResult = await adapter.readResource("sovereignops://docs/blocked-note");
    assert.equal(deniedReadResult.ok, false);
    assert.equal(deniedReadResult.error.code, "policy_denied");
    assert.equal(blockedHandlerCalls, 0);
    assert.deepEqual(operations.splice(0), ["resources.read"]);
    assert.deepEqual(
      deniedReadResult.auditIntents.map(compactResourceIntent),
      [
        {
          type: "policy_decision",
          uri: "sovereignops://docs/blocked-note",
          capability: "read_object",
          decision: "deny",
          ruleId: "rule-resources.read-blocked-note",
        },
      ],
    );
  });

  it("does not call registered handlers for unknown tool or resource errors", async () => {
    const audit = createToolAuditEmitter({ now: fixedClock });
    let toolHandlerCalls = 0;

    await assert.rejects(
      () =>
        executeToolCall({
          toolName: "missing_local_tool",
          arguments: { title: "Missing local tool" },
          audit,
          handlers: {
            create_task_proposal: () => {
              toolHandlerCalls += 1;
              return { shouldNotRun: true };
            },
          },
          policy: () => "allow",
        }),
      ToolNotFoundError,
    );

    assert.equal(toolHandlerCalls, 0);
    assert.deepEqual(
      audit.entries().map((event) => [event.type, event.toolName]),
      [["tool_call_requested", "missing_local_tool"]],
    );

    let resourceHandlerCalls = 0;
    let policyCalls = 0;
    const adapter = createGatewayResourceAdapter({
      resources: new GatewayResourceRegistry([
        {
          uri: "sovereignops://docs/known-note",
          name: "Known Note",
          mimeType: "text/plain",
          read: () => {
            resourceHandlerCalls += 1;
            return {
              uri: "sovereignops://docs/known-note",
              text: "known",
            };
          },
        },
      ]),
      policy: () => {
        policyCalls += 1;
        return "allow";
      },
    });

    const result = await adapter.readResource("sovereignops://docs/missing-note");

    assert.equal(result.ok, false);
    assert.equal(result.error.code, "resource_not_found");
    assert.equal(resourceHandlerCalls, 0);
    assert.equal(policyCalls, 0);
    assert.deepEqual(result.auditIntents, []);
  });
});

function compactResourceIntent(intent) {
  return {
    type: intent.type,
    uri: intent.uri,
    capability: intent.capability,
    decision: intent.decision,
    ruleId: intent.metadata?.ruleId,
  };
}
