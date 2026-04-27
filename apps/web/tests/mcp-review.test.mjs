import assert from "node:assert/strict";

import {
  buildMcpApprovalQueueItems,
  buildMcpSafeReview,
  deriveMcpReviewAffordances,
  filterDecidedMcpApprovalSessions,
  filterMcpApprovalSessions,
  filterPendingMcpApprovalSessions,
  isMcpApprovalSessionStatus,
  isMcpReviewKind,
  isMcpReviewRiskLevel,
  summarizeMcpApprovalSessions,
} from "../src/main.ts";

const sessions = [
  {
    id: "approval_low_resource",
    status: "pending",
    createdAt: "2026-04-27T09:00:00.000Z",
    updatedAt: "2026-04-27T09:00:00.000Z",
    expiresAt: "2026-04-27T12:00:00.000Z",
    request: {
      capability: "read_object",
      uri: "sovereignops://workspace/notes/weekly",
    },
    actor: { id: "act_mira", roles: ["author"] },
    reason: "Need to inspect the note before drafting a response.",
    ruleId: "mcp.read.notes",
  },
  {
    id: "approval_high_tool",
    status: "pending",
    createdAt: "2026-04-27T09:10:00.000Z",
    updatedAt: "2026-04-27T09:10:00.000Z",
    expiresAt: "2026-04-27T10:00:00.000Z",
    request: {
      toolName: "propose_automation_rule",
      arguments: {
        name: "Daily note digest",
        trigger: { type: "schedule" },
        action: { type: "create_task_proposal" },
      },
    },
    actor: { id: "act_sol" },
    reason: "A reviewer must check the proposed automation.",
    ruleId: "mcp.tool.automation",
  },
  {
    id: "approval_medium_patch",
    status: "pending",
    createdAt: "2026-04-27T08:00:00.000Z",
    updatedAt: "2026-04-27T08:00:00.000Z",
    expiresAt: "2026-04-27T11:00:00.000Z",
    request: {
      toolName: "draft_document_patch",
      arguments: {
        targetPath: "notes/project.md",
        patch: "- old\n+ new",
      },
    },
    actor: {
      id: "act_mira",
      metadata: { lane: "drafts" },
    },
    metadata: { riskLevel: "medium" },
    ruleId: "mcp.tool.patch",
  },
  {
    id: "approval_rejected_resource",
    status: "rejected",
    createdAt: "2026-04-27T07:00:00.000Z",
    updatedAt: "2026-04-27T09:30:00.000Z",
    request: {
      capability: "write_object",
      path: "sovereignops://workspace/settings",
    },
    actor: { id: "act_ren" },
    ruleId: "mcp.write.settings",
    decision: {
      status: "rejected",
      at: "2026-04-27T09:30:00.000Z",
      actor: { id: "act_reviewer" },
      reason: "Settings change needs a smaller scope.",
    },
    rejectedAt: "2026-04-27T09:30:00.000Z",
    rejectedBy: { id: "act_reviewer" },
  },
  {
    id: "approval_approved_operation",
    status: "approved",
    createdAt: "2026-04-27T07:05:00.000Z",
    updatedAt: "2026-04-27T09:35:00.000Z",
    request: {
      operation: {
        type: "sync_replay",
        target: "workspace-cache",
      },
      risk: "low",
    },
    actor: { id: "act_mira" },
    decision: {
      status: "approved",
      at: "2026-04-27T09:35:00.000Z",
      actor: { id: "act_reviewer" },
    },
    approvedAt: "2026-04-27T09:35:00.000Z",
    approvedBy: { id: "act_reviewer" },
  },
  {
    id: "approval_expired_tool",
    status: "expired",
    createdAt: "2026-04-27T06:00:00.000Z",
    updatedAt: "2026-04-27T08:00:00.000Z",
    request: {
      toolName: "create_task_proposal",
      arguments: {
        title: "Follow up on notes",
      },
    },
    actor: { id: "act_sol" },
    expiredAt: "2026-04-27T08:00:00.000Z",
  },
];

function testQueueSortingAndLabels() {
  const items = buildMcpApprovalQueueItems(sessions);

  assert.deepEqual(
    items.map((item) => item.sessionId),
    [
      "approval_high_tool",
      "approval_medium_patch",
      "approval_low_resource",
      "approval_rejected_resource",
      "approval_approved_operation",
      "approval_expired_tool",
    ],
  );
  assert.deepEqual(
    items.slice(0, 3).map((item) => item.riskLabel),
    ["High risk", "Medium risk", "Low risk"],
  );

  const automation = items[0];
  assert.equal(automation.actionLabel, "Propose automation rule");
  assert.equal(automation.scopeLabel, "Daily note digest");
  assert.equal(automation.review.subjectLabel, "Safe tool");
  assert.match(automation.ariaLabel, /Pending, High risk, Safe tool/);

  const resource = items.find((item) => item.sessionId === "approval_low_resource");
  assert.equal(resource.actionLabel, "Read resource");
  assert.equal(resource.scopeLabel, "sovereignops://workspace/notes/weekly");

  const operation = items.find(
    (item) => item.sessionId === "approval_approved_operation",
  );
  assert.equal(operation.review.kind, "operation");
  assert.equal(operation.actionLabel, "Sync Replay");
  assert.equal(operation.scopeLabel, "workspace-cache");
}

function testFilteringHelpers() {
  const pending = filterPendingMcpApprovalSessions(sessions);
  assert.deepEqual(
    pending.map((session) => session.id),
    ["approval_low_resource", "approval_high_tool", "approval_medium_patch"],
  );

  const decided = filterDecidedMcpApprovalSessions(sessions);
  assert.deepEqual(
    decided.map((session) => session.id),
    [
      "approval_rejected_resource",
      "approval_approved_operation",
      "approval_expired_tool",
    ],
  );

  const miraMedium = filterMcpApprovalSessions(sessions, {
    status: "pending",
    actorId: "act_mira",
    riskLevel: "medium",
    reviewKind: "tool",
    query: "project",
  });
  assert.deepEqual(
    miraMedium.map((session) => session.id),
    ["approval_medium_patch"],
  );

  const rejectedOrExpired = filterMcpApprovalSessions(sessions, {
    status: ["rejected", "expired"],
  });
  assert.deepEqual(
    rejectedOrExpired.map((session) => session.id),
    ["approval_rejected_resource", "approval_expired_tool"],
  );
}

function testSummaryCountsAndAffordances() {
  const summary = summarizeMcpApprovalSessions(sessions);

  assert.equal(summary.total, 6);
  assert.equal(summary.pending, 3);
  assert.equal(summary.decided, 3);
  assert.deepEqual(summary.byStatus, {
    pending: 3,
    approved: 1,
    rejected: 1,
    expired: 1,
  });
  assert.deepEqual(summary.byRiskLevel, {
    low: 3,
    medium: 1,
    high: 2,
  });
  assert.deepEqual(summary.byReviewKind, {
    tool: 3,
    resource: 2,
    operation: 1,
  });

  const pendingToolAffordances = deriveMcpReviewAffordances(sessions[1]);
  assert.equal(pendingToolAffordances.canApprove, true);
  assert.equal(pendingToolAffordances.canReject, true);
  assert.equal(pendingToolAffordances.canPreviewTool, true);
  assert.equal(pendingToolAffordances.canOpenResource, false);
  assert.equal(
    pendingToolAffordances.actions.find((action) => action.id === "approve")
      .enabled,
    true,
  );

  const decidedResourceAffordances = deriveMcpReviewAffordances(sessions[3]);
  assert.equal(decidedResourceAffordances.canApprove, false);
  assert.equal(decidedResourceAffordances.canReject, false);
  assert.equal(decidedResourceAffordances.canOpenResource, true);
  assert.equal(decidedResourceAffordances.canViewDecision, true);
  assert.match(
    decidedResourceAffordances.actions.find((action) => action.id === "approve")
      .disabledReason,
    /already rejected/i,
  );

  assert.equal(isMcpApprovalSessionStatus("pending"), true);
  assert.equal(isMcpApprovalSessionStatus("queued"), false);
  assert.equal(isMcpReviewRiskLevel("high"), true);
  assert.equal(isMcpReviewRiskLevel("critical"), false);
  assert.equal(isMcpReviewKind("resource"), true);
  assert.equal(isMcpReviewKind("template"), false);
}

function testNoMutation() {
  const before = structuredClone(sessions);

  const queue = buildMcpApprovalQueueItems(sessions);
  queue[0].review.request.arguments.name = "mutated";
  queue[0].affordances.actions[0].label = "Mutated";

  const filtered = filterPendingMcpApprovalSessions(sessions);
  filtered[2].request.arguments.targetPath = "changed.md";
  filtered[2].actor.metadata.lane = "changed";

  const review = buildMcpSafeReview(sessions[2]);
  review.request.arguments.patch = "changed";

  assert.deepEqual(sessions, before);
}

testQueueSortingAndLabels();
testFilteringHelpers();
testSummaryCountsAndAffordances();
testNoMutation();

console.log("mcp review tests passed");
