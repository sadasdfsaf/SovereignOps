import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTOMATION_AUDIT_REDACTED,
  createExecutionProposalAuditEvent,
  createPreviewRunAuditEvent,
} from "../src/audit.ts";
import {
  createActionRegistry,
  createAutomationAuditEmitter,
  createTriggerRegistry,
  evaluateAutomationRule,
} from "../src/index.ts";
import {
  buildAutomationPluginReviewArtifact,
  cloneAutomationPluginReviewArtifact,
  fingerprintAutomationPluginReviewArtifact,
  serializeAutomationPluginReviewArtifact,
  summarizeAutomationEvaluationGate,
  summarizeAutomationPluginReviewAudit,
} from "../src/pluginReview.ts";

const fixedClock = () => "2026-04-27T04:00:00.000Z";
const generatedAt = "2026-04-27T04:10:00.000Z";

const docEvent = {
  id: "evt_doc_001",
  type: "doc_updated",
  workspaceId: "wsp_notes",
  actorId: "act_writer",
  occurredAt: "2026-04-27T04:00:00.000Z",
  payload: {
    docId: "doc_release_notes",
    status: "ready",
    section: "summary",
  },
};

const docRule = {
  id: "rule_doc_summary",
  title: "Document summary",
  trigger: {
    type: "doc_updated",
    filters: {
      "payload.status": "ready",
    },
  },
  conditions: [
    {
      path: "payload.section",
      operator: "equals",
      value: "summary",
    },
  ],
  actions: [
    {
      type: "draft_doc",
      input: {
        title: "Prepare release notes",
        targetId: "doc_release_notes",
        apiKey: "key_live_private",
      },
    },
  ],
  approval: {
    required: true,
    gateId: "gate_doc_review",
    approverActorIds: ["act_reviewer"],
    minApprovals: 1,
    reason: "Review before preparing draft.",
  },
  audit: {
    includeEventPayload: true,
    labels: {
      lane: "notes",
    },
  },
};

test("builds a deterministic proposed plugin review artifact from evaluations and audit events", () => {
  const audit = createAutomationAuditEmitter({
    now: fixedClock,
    idPrefix: "aud_",
  });
  const result = evaluateAutomationRule(docRule, docEvent, {
    triggerRegistry: createTriggerRegistry(),
    actionRegistry: createActionRegistry(),
    approvals: [
      {
        id: "apv_doc_summary",
        ruleId: "rule_doc_summary",
        gateId: "gate_doc_review",
        actorId: "act_reviewer",
        decision: "approved",
      },
    ],
    audit,
  });
  const events = [
    createExecutionProposalAuditEvent({
      occurredAt: "2026-04-27T04:06:00.000Z",
      actorId: "act_runner",
      workspaceId: "wsp_notes",
      proposalId: result.proposals[0].id,
      ruleId: "rule_doc_summary",
      actionType: "draft_doc",
      payload: {
        authorization: "Bearer abcdefghijklmnopqrstuvwxyz",
      },
    }),
    createPreviewRunAuditEvent({
      occurredAt: "2026-04-27T04:05:00.000Z",
      actorId: "act_runner",
      workspaceId: "wsp_notes",
      ruleId: "rule_doc_summary",
      previewRunId: "preview_doc_001",
      outcome: "matched",
      result: {
        proposals: 1,
      },
    }),
  ];

  const artifact = buildAutomationPluginReviewArtifact({
    generatedAt,
    pluginId: "plugin_notes",
    reviewLabel: "Notes automation",
    evaluations: [result],
    auditEvents: events,
  });
  const rebuilt = buildAutomationPluginReviewArtifact({
    generatedAt,
    pluginId: "plugin_notes",
    reviewLabel: "Notes automation",
    evaluations: [result],
    auditEvents: [...events].reverse(),
  });

  assert.equal(result.status, "matched");
  assert.equal(artifact.status, "proposed");
  assert.equal(artifact.approvalStatus, "approved");
  assert.match(artifact.id, /^automation_plugin_review_[a-f0-9]{16}$/);
  assert.match(artifact.fingerprint, /^fnv1a64:[a-f0-9]{16}$/);
  assert.equal(artifact.id, rebuilt.id);
  assert.equal(artifact.fingerprint, rebuilt.fingerprint);
  assert.deepEqual(artifact.summary, {
    totalGates: 1,
    approved: 0,
    skipped: 0,
    blocked: 0,
    proposed: 1,
    approvalRequired: 0,
    approvalRejected: 0,
    proposals: 1,
    auditEvents: 2,
    auditRecords: 5,
  });
  assert.deepEqual(
    artifact.gates.map((gate) => [
      gate.ruleId,
      gate.outcome,
      gate.approval.status,
      gate.conditions,
      gate.proposals.actionTypes,
    ]),
    [
      [
        "rule_doc_summary",
        "proposed",
        "approved",
        { total: 1, matched: 1, skipped: 0 },
        ["draft_doc"],
      ],
    ],
  );
  assert.deepEqual(artifact.audit.events.byOutcome, {
    matched: 1,
    proposed: 1,
  });
  assert.deepEqual(artifact.audit.records.byDecision, {
    matched: 4,
    proposed: 1,
  });
  assert.deepEqual(artifact.audit.actors, [
    {
      id: artifact.audit.actors[0].id,
      actorId: AUTOMATION_AUDIT_REDACTED,
      actorFingerprint: artifact.audit.actors[0].actorFingerprint,
      eventCount: 2,
      lastEventAt: "2026-04-27T04:06:00.000Z",
    },
  ]);
  assert.match(artifact.audit.actors[0].id, /^review_actor_[a-f0-9]{16}$/);
  assert.match(artifact.audit.actors[0].actorFingerprint, /^actor:[a-f0-9]{16}$/);
  assert.deepEqual(artifact.audit.actions, [
    {
      id: artifact.audit.actions[0].id,
      actionType: "draft_doc",
      proposalId: AUTOMATION_AUDIT_REDACTED,
      proposalFingerprint: artifact.audit.actions[0].proposalFingerprint,
      eventCount: 1,
      recordCount: 1,
    },
  ]);
  assert.match(artifact.audit.actions[0].proposalFingerprint, /^proposal:[a-f0-9]{16}$/);

  const serialized = serializeAutomationPluginReviewArtifact(artifact);
  assert.equal(serialized.includes("act_runner"), false);
  assert.equal(serialized.includes(result.proposals[0].id), false);
  assert.equal(serialized.includes("key_live_private"), false);
  assert.equal(serialized.includes("Bearer"), false);
  assert.equal(fingerprintAutomationPluginReviewArtifact(artifact), artifact.fingerprint);
});

test("classifies blocked and skipped evaluation gates", () => {
  const pending = evaluateAutomationRule(docRule, docEvent, {
    triggerRegistry: createTriggerRegistry(),
    actionRegistry: createActionRegistry(),
    now: fixedClock,
  });
  const disabled = evaluateAutomationRule(
    {
      ...docRule,
      id: "rule_doc_disabled",
      enabled: false,
      approval: undefined,
    },
    docEvent,
    {
      triggerRegistry: createTriggerRegistry(),
      actionRegistry: createActionRegistry(),
      now: fixedClock,
    },
  );

  const pendingGate = summarizeAutomationEvaluationGate(pending);
  const disabledGate = summarizeAutomationEvaluationGate(disabled);
  const artifact = buildAutomationPluginReviewArtifact({
    generatedAt,
    evaluations: [disabled, pending],
  });

  assert.equal(pending.status, "approval_required");
  assert.equal(pendingGate.outcome, "blocked");
  assert.equal(pendingGate.approvalStatus, "required");
  assert.equal(pendingGate.approval.waitingCount, 1);
  assert.equal(disabledGate.outcome, "skipped");
  assert.equal(disabledGate.reason, "rule_disabled");
  assert.equal(artifact.status, "blocked");
  assert.equal(artifact.approvalStatus, "required");
  assert.deepEqual(
    artifact.gates.map((gate) => [gate.ruleId, gate.outcome]),
    [
      ["rule_doc_summary", "blocked"],
      ["rule_doc_disabled", "skipped"],
    ],
  );
  assert.deepEqual(artifact.summary, {
    totalGates: 2,
    approved: 0,
    skipped: 1,
    blocked: 1,
    proposed: 0,
    approvalRequired: 1,
    approvalRejected: 0,
    proposals: 0,
    auditEvents: 0,
    auditRecords: 6,
  });
});

test("summarizes audit events without exposing actor ids or action payloads", () => {
  const event = createExecutionProposalAuditEvent({
    occurredAt: "2026-04-27T04:06:00.000Z",
    actorId: "act_runner",
    workspaceId: "wsp_notes",
    proposalId: "proposal_secret_001",
    ruleId: "rule_doc_summary",
    actionType: "notify",
    payload: {
      message: "Ready",
      clientSecret: "hidden",
    },
  });

  const summary = summarizeAutomationPluginReviewAudit([event], []);
  const serialized = JSON.stringify(summary);

  assert.equal(summary.events.total, 1);
  assert.deepEqual(summary.events.byType, {
    automation_execution_proposal: 1,
  });
  assert.deepEqual(summary.actions, [
    {
      id: summary.actions[0].id,
      actionType: "notify",
      proposalId: AUTOMATION_AUDIT_REDACTED,
      proposalFingerprint: summary.actions[0].proposalFingerprint,
      eventCount: 1,
      recordCount: 0,
    },
  ]);
  assert.equal(serialized.includes("act_runner"), false);
  assert.equal(serialized.includes("proposal_secret_001"), false);
  assert.equal(serialized.includes("hidden"), false);
});

test("keeps clone and freeze boundaries for review artifacts", () => {
  const audit = createAutomationAuditEmitter({
    now: fixedClock,
    idPrefix: "aud_",
  });
  const result = evaluateAutomationRule(
    {
      ...docRule,
      approval: undefined,
    },
    docEvent,
    {
      triggerRegistry: createTriggerRegistry(),
      actionRegistry: createActionRegistry(),
      audit,
    },
  );
  const artifact = buildAutomationPluginReviewArtifact({
    generatedAt,
    evaluations: [result],
  });

  result.proposals[0].payload.title = "Mutated title";
  result.auditRecords[0].metadata.eventPayload.status = "mutated";

  assert.equal(artifact.gates[0].proposals.total, 1);
  assert.deepEqual(artifact.gates[0].proposals.actionTypes, ["draft_doc"]);
  assert.equal(Object.isFrozen(artifact), true);
  assert.equal(Object.isFrozen(artifact.gates), true);
  assert.equal(Object.isFrozen(artifact.gates[0].proposals.actionTypes), true);
  assert.throws(() => {
    artifact.gates[0].proposals.actionTypes.push("notify");
  }, TypeError);

  const cloned = cloneAutomationPluginReviewArtifact(artifact);
  assert.notEqual(cloned, artifact);
  assert.deepEqual(cloned, artifact);
  assert.equal(Object.isFrozen(cloned), true);
  assert.throws(() => {
    cloned.summary.proposed = 9;
  }, TypeError);
  assert.throws(
    () =>
      cloneAutomationPluginReviewArtifact({
        ...artifact,
        summary: {
          ...artifact.summary,
          proposed: 9,
        },
      }),
    /deterministic body/,
  );
});
