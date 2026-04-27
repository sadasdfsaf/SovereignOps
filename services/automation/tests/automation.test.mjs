import assert from "node:assert/strict";
import test from "node:test";

import {
  createActionRegistry,
  createAutomationAuditEmitter,
  createTriggerRegistry,
  evaluateAutomationRule,
  validateAutomationRule,
} from "../src/index.ts";

const fixedClock = () => "2026-04-27T00:00:00.000Z";

const taskEvent = {
  id: "evt_task_001",
  type: "task_changed",
  workspaceId: "wsp_ops",
  actorId: "act_lead",
  occurredAt: "2026-04-27T00:00:00.000Z",
  payload: {
    taskId: "tsk_onboarding",
    status: "ready_for_review",
    priority: "high",
    changedFields: ["status", "owner"],
  },
};

const reviewRule = {
  id: "rule_task_review",
  title: "Task review handoff",
  trigger: {
    type: "task_changed",
    filters: {
      "payload.status": "ready_for_review",
    },
  },
  conditions: [
    {
      path: "payload.priority",
      operator: "equals",
      value: "high",
    },
    {
      path: "payload.changedFields",
      operator: "contains",
      value: "status",
    },
  ],
  actions: [
    {
      type: "create_task",
      input: {
        title: "Check task handoff",
        targetId: "tsk_onboarding",
      },
    },
    {
      type: "notify",
      input: {
        message: "Task is ready for review",
        channel: "workspace",
      },
    },
  ],
  audit: {
    labels: {
      lane: "operations",
    },
  },
};

test("validates automation rule schema for triggers, conditions, actions, approvals, and audit options", () => {
  const valid = validateAutomationRule({
    ...reviewRule,
    approval: {
      required: true,
      gateId: "gate_review",
      approverActorIds: ["act_reviewer"],
      minApprovals: 1,
      reason: "Review before proposals are prepared.",
    },
    audit: {
      enabled: true,
      emitSkipped: true,
      includeEventPayload: true,
      labels: { lane: "operations" },
    },
  });

  assert.equal(valid.ok, true);
  assert.equal(valid.issues.length, 0);

  const invalid = validateAutomationRule({
    id: "bad",
    trigger: { type: "unknown" },
    conditions: [{ path: "payload.status", operator: "equals" }],
    actions: [{ type: "send_email", input: {} }],
    approval: { required: true, gateId: "review" },
    audit: { enabled: "yes" },
  });

  assert.equal(invalid.ok, false);
  assert.equal(invalid.issues.some((issue) => issue.path === "id"), true);
  assert.equal(invalid.issues.some((issue) => issue.path === "trigger.type"), true);
  assert.equal(invalid.issues.some((issue) => issue.path === "conditions[0].value"), true);
  assert.equal(invalid.issues.some((issue) => issue.path === "actions[0].type"), true);
  assert.equal(invalid.issues.some((issue) => issue.path === "approval.gateId"), true);
  assert.equal(invalid.issues.some((issue) => issue.path === "audit.enabled"), true);
});

test("matches registered triggers deterministically with event filters", () => {
  const triggers = createTriggerRegistry();

  assert.deepEqual(
    triggers.list().map((entry) => entry.type),
    ["task_changed", "doc_updated", "incident_created", "approval_decided"],
  );

  assert.deepEqual(
    triggers.match(reviewRule.trigger, taskEvent),
    {
      matched: true,
      triggerType: "task_changed",
      eventType: "task_changed",
    },
  );

  assert.deepEqual(
    triggers.match(reviewRule.trigger, {
      ...taskEvent,
      type: "doc_updated",
    }),
    {
      matched: false,
      triggerType: "task_changed",
      eventType: "doc_updated",
      reason: "event_type_mismatch",
    },
  );

  assert.deepEqual(
    triggers.match(reviewRule.trigger, {
      ...taskEvent,
      payload: { ...taskEvent.payload, status: "draft" },
    }),
    {
      matched: false,
      triggerType: "task_changed",
      eventType: "task_changed",
      reason: "filter_not_matched:payload.status",
    },
  );
});

test("evaluates conditions and returns skipped when any condition fails", () => {
  const result = evaluateAutomationRule(reviewRule, {
    ...taskEvent,
    payload: {
      ...taskEvent.payload,
      priority: "low",
    },
  }, {
    triggerRegistry: createTriggerRegistry(),
    actionRegistry: createActionRegistry(),
    now: fixedClock,
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "condition_not_matched");
  assert.deepEqual(
    result.conditions.map((condition) => [condition.path, condition.matched]),
    [
      ["payload.priority", false],
      ["payload.changedFields", true],
    ],
  );
  assert.deepEqual(result.proposals, []);
});

test("requires approval before producing proposals and matches after approval", () => {
  const approvalRule = {
    ...reviewRule,
    approval: {
      required: true,
      gateId: "gate_task_review",
      approverActorIds: ["act_reviewer"],
      minApprovals: 1,
      reason: "Review required before preparing proposals.",
    },
  };

  const pending = evaluateAutomationRule(approvalRule, taskEvent, {
    triggerRegistry: createTriggerRegistry(),
    actionRegistry: createActionRegistry(),
    now: fixedClock,
  });

  assert.equal(pending.status, "approval_required");
  assert.equal(pending.approval.status, "required");
  assert.equal(pending.proposals.length, 0);

  const approved = evaluateAutomationRule(approvalRule, taskEvent, {
    triggerRegistry: createTriggerRegistry(),
    actionRegistry: createActionRegistry(),
    approvals: [
      {
        id: "apv_task_review",
        ruleId: "rule_task_review",
        gateId: "gate_task_review",
        actorId: "act_reviewer",
        decision: "approved",
      },
    ],
    now: fixedClock,
  });

  assert.equal(approved.status, "matched");
  assert.equal(approved.approval.status, "approved");
  assert.deepEqual(
    approved.proposals.map((proposal) => proposal.mode),
    ["proposal_only", "proposal_only"],
  );
});

test("default actions produce proposals only for every supported action type", () => {
  const rule = {
    id: "rule_proposal_pack",
    trigger: { type: "incident_created" },
    actions: [
      {
        type: "draft_doc",
        input: { title: "Incident summary", targetId: "inc_latency" },
      },
      {
        type: "create_task",
        input: { title: "Assign follow-up", targetId: "inc_latency" },
      },
      {
        type: "notify",
        input: { message: "Incident summary is ready", channel: "workspace" },
      },
      {
        type: "request_agent_review",
        input: { subject: "Review incident summary", targetId: "inc_latency" },
      },
    ],
  };

  const result = evaluateAutomationRule(rule, {
    id: "evt_incident_001",
    type: "incident_created",
    workspaceId: "wsp_ops",
    payload: {
      incidentId: "inc_latency",
      severity: "medium",
    },
  }, {
    triggerRegistry: createTriggerRegistry(),
    actionRegistry: createActionRegistry(),
    now: fixedClock,
  });

  assert.equal(result.status, "matched");
  assert.deepEqual(
    result.proposals.map((proposal) => [
      proposal.actionType,
      proposal.mode,
      proposal.id,
    ]),
    [
      [
        "draft_doc",
        "proposal_only",
        "proposal_rule_proposal_pack_evt_incident_001_01_draft_doc",
      ],
      [
        "create_task",
        "proposal_only",
        "proposal_rule_proposal_pack_evt_incident_001_02_create_task",
      ],
      [
        "notify",
        "proposal_only",
        "proposal_rule_proposal_pack_evt_incident_001_03_notify",
      ],
      [
        "request_agent_review",
        "proposal_only",
        "proposal_rule_proposal_pack_evt_incident_001_04_request_agent_review",
      ],
    ],
  );
});

test("emits audit records for evaluation and execution decisions", () => {
  const audit = createAutomationAuditEmitter({
    now: fixedClock,
    idPrefix: "aud_",
  });
  const result = evaluateAutomationRule(
    {
      ...reviewRule,
      audit: {
        includeEventPayload: true,
        labels: { lane: "operations" },
      },
    },
    taskEvent,
    {
      triggerRegistry: createTriggerRegistry(),
      actionRegistry: createActionRegistry(),
      audit,
    },
  );

  assert.equal(result.status, "matched");
  assert.deepEqual(
    audit.entries().map((record) => [
      record.id,
      record.type,
      record.phase,
      record.decision,
    ]),
    [
      ["aud_1", "automation_evaluation_decision", "trigger", "matched"],
      ["aud_2", "automation_evaluation_decision", "condition", "matched"],
      ["aud_3", "automation_evaluation_decision", "condition", "matched"],
      ["aud_4", "automation_execution_decision", "action", "proposed"],
      ["aud_5", "automation_execution_decision", "action", "proposed"],
      ["aud_6", "automation_evaluation_decision", "rule", "matched"],
    ],
  );
  assert.equal(result.auditRecords.length, 6);
  assert.deepEqual(audit.entries()[0].metadata.eventPayload, taskEvent.payload);
  assert.deepEqual(audit.entries()[0].metadata.labels, { lane: "operations" });
});
