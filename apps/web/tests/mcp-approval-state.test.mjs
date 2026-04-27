import assert from "node:assert/strict";

import {
  createMcpApprovalInboxState,
  expireStaleMcpApprovalSessions,
  optimisticallyApproveMcpApprovalSession,
  optimisticallyRejectMcpApprovalSession,
  rollbackOptimisticMcpApprovalDecision,
} from "../src/main.ts";

const sessions = [
  {
    id: "mcp_pending_tool",
    status: "pending",
    createdAt: "2026-04-27T09:00:00.000Z",
    updatedAt: "2026-04-27T09:00:00.000Z",
    expiresAt: "2026-04-27T12:00:00.000Z",
    request: {
      toolName: "draft_document_patch",
      arguments: {
        targetPath: "notes/brief.md",
        patch: "- old\n+ new",
      },
    },
    actor: { id: "act_mira", roles: ["author"] },
    reason: "Draft update needs approval.",
    ruleId: "mcp.tool.patch",
  },
  {
    id: "mcp_pending_resource",
    status: "pending",
    createdAt: "2026-04-27T09:05:00.000Z",
    updatedAt: "2026-04-27T09:05:00.000Z",
    expiresAt: "2026-04-27T12:30:00.000Z",
    request: {
      capability: "write_object",
      path: "sovereignops://workspace/settings",
    },
    actor: { id: "act_sol" },
    reason: "Settings write needs approval.",
    ruleId: "mcp.write.settings",
  },
  {
    id: "mcp_stale_tool",
    status: "pending",
    createdAt: "2026-04-27T07:00:00.000Z",
    updatedAt: "2026-04-27T07:00:00.000Z",
    expiresAt: "2026-04-27T08:00:00.000Z",
    request: {
      toolName: "create_task_proposal",
      arguments: {
        title: "Follow up on stale note",
      },
    },
    actor: { id: "act_ren" },
  },
  {
    id: "mcp_approved_operation",
    status: "approved",
    createdAt: "2026-04-27T06:00:00.000Z",
    updatedAt: "2026-04-27T06:30:00.000Z",
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
      at: "2026-04-27T06:30:00.000Z",
      actor: { id: "act_reviewer" },
    },
    approvedAt: "2026-04-27T06:30:00.000Z",
    approvedBy: { id: "act_reviewer" },
  },
];

const reviewer = { id: "act_reviewer", roles: ["owner"] };

function byId(state, id) {
  return state.sessions.find((session) => session.id === id);
}

function testOptimisticApproveUpdatesStateAndSummary() {
  const baseState = createMcpApprovalInboxState(sessions);
  const beforeState = structuredClone(baseState);
  const beforeSessions = structuredClone(sessions);

  const result = optimisticallyApproveMcpApprovalSession(baseState, {
    sessionId: "mcp_pending_tool",
    decidedAt: "2026-04-27T10:00:00.000Z",
    actor: reviewer,
    reason: "Patch is limited to the requested brief.",
  });

  assert.equal(result.refusal, undefined);
  assert.equal(result.mutation.status, "approved");
  assert.equal(result.mutation.previousSession.status, "pending");
  assert.deepEqual(baseState, beforeState);
  assert.deepEqual(sessions, beforeSessions);

  const approved = byId(result.state, "mcp_pending_tool");
  assert.equal(approved.status, "approved");
  assert.equal(approved.updatedAt, "2026-04-27T10:00:00.000Z");
  assert.equal(approved.approvedAt, "2026-04-27T10:00:00.000Z");
  assert.equal(approved.approvedBy.id, "act_reviewer");
  assert.equal(approved.decision.metadata.optimistic, true);

  assert.equal(result.state.summary.pending, 2);
  assert.equal(result.state.summary.decided, 2);
  assert.deepEqual(result.state.summary.byStatus, {
    pending: 2,
    approved: 2,
    rejected: 0,
    expired: 0,
  });

  assert.equal(result.state.optimistic.length, 1);
  assert.equal(result.auditNote.action, "approved");
  assert.equal(result.auditNote.optimistic, true);
  assert.deepEqual(result.auditNote.route.query, {
    mcpApprovalSessionId: "mcp_pending_tool",
    auditNoteId: result.auditNote.id,
  });

  result.state.sessions[0].request.arguments.targetPath = "mutated.md";
  assert.equal(sessions[0].request.arguments.targetPath, "notes/brief.md");
}

function testOptimisticRejectUpdatesSession() {
  const baseState = createMcpApprovalInboxState(sessions);

  const result = optimisticallyRejectMcpApprovalSession(baseState, {
    sessionId: "mcp_pending_resource",
    decidedAt: "2026-04-27T10:10:00.000Z",
    actor: reviewer,
    reason: "Settings write needs a narrower scope.",
  });

  assert.equal(result.refusal, undefined);
  assert.equal(result.mutation.status, "rejected");

  const rejected = byId(result.state, "mcp_pending_resource");
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.rejectedAt, "2026-04-27T10:10:00.000Z");
  assert.equal(rejected.rejectedBy.id, "act_reviewer");
  assert.equal(rejected.decision.reason, "Settings write needs a narrower scope.");
  assert.equal(result.auditNote.action, "rejected");
  assert.match(result.auditNote.summary, /Rejected Write resource/);

  assert.deepEqual(result.state.summary.byStatus, {
    pending: 2,
    approved: 1,
    rejected: 1,
    expired: 0,
  });
}

function testRollbackRestoresPreviousSession() {
  const baseState = createMcpApprovalInboxState(sessions);
  const approved = optimisticallyApproveMcpApprovalSession(baseState, {
    sessionId: "mcp_pending_tool",
    decidedAt: "2026-04-27T10:00:00.000Z",
    actor: reviewer,
    mutationId: "mut_patch_approve",
  });
  const optimisticState = approved.state;
  const beforeRollbackState = structuredClone(optimisticState);

  const rolledBack = rollbackOptimisticMcpApprovalDecision(optimisticState, {
    mutationId: "mut_patch_approve",
    failedAt: "2026-04-27T10:01:00.000Z",
    actor: reviewer,
    reason: "Gateway rejected the approval.",
  });

  assert.equal(rolledBack.refusal, undefined);
  assert.deepEqual(optimisticState, beforeRollbackState);
  assert.equal(byId(rolledBack.state, "mcp_pending_tool").status, "pending");
  assert.equal(byId(rolledBack.state, "mcp_pending_tool").decision, undefined);
  assert.equal(rolledBack.state.optimistic.length, 0);
  assert.deepEqual(rolledBack.state.summary.byStatus, {
    pending: 3,
    approved: 1,
    rejected: 0,
    expired: 0,
  });
  assert.equal(rolledBack.auditNote.action, "rolled_back");
  assert.equal(rolledBack.state.auditNotes.length, 2);
  assert.equal(byId(optimisticState, "mcp_pending_tool").status, "approved");
}

function testStaleAndTerminalRefusals() {
  const baseState = createMcpApprovalInboxState(sessions);

  const stale = optimisticallyApproveMcpApprovalSession(baseState, {
    sessionId: "mcp_stale_tool",
    decidedAt: "2026-04-27T09:00:00.000Z",
    actor: reviewer,
  });

  assert.equal(stale.refusal.reason, "stale_session");
  assert.equal(byId(stale.state, "mcp_stale_tool").status, "pending");
  assert.equal(stale.auditNote.action, "refused");
  assert.deepEqual(baseState.summary.byStatus, {
    pending: 3,
    approved: 1,
    rejected: 0,
    expired: 0,
  });

  const terminal = optimisticallyRejectMcpApprovalSession(baseState, {
    sessionId: "mcp_approved_operation",
    decidedAt: "2026-04-27T09:10:00.000Z",
    actor: reviewer,
  });

  assert.equal(terminal.refusal.reason, "terminal_session");
  assert.match(terminal.refusal.message, /already approved/);
  assert.equal(byId(terminal.state, "mcp_approved_operation").status, "approved");

  const rollback = rollbackOptimisticMcpApprovalDecision(baseState, {
    mutationId: "missing_mutation",
    failedAt: "2026-04-27T09:15:00.000Z",
  });
  assert.equal(rollback.refusal.reason, "not_optimistic");
  assert.deepEqual(rollback.state, baseState);
}

function testExpireStaleSessionsAndSummary() {
  const baseState = createMcpApprovalInboxState(sessions);

  const expired = expireStaleMcpApprovalSessions(baseState, {
    staleAt: "2026-04-27T08:00:00.000Z",
    actor: reviewer,
    reason: "Approval window elapsed.",
  });

  assert.deepEqual(expired.expiredSessionIds, ["mcp_stale_tool"]);
  assert.equal(expired.auditNotes[0].action, "expired");
  assert.equal(byId(expired.state, "mcp_stale_tool").status, "expired");
  assert.equal(
    byId(expired.state, "mcp_stale_tool").decision.reason,
    "Approval window elapsed.",
  );
  assert.deepEqual(expired.state.summary.byStatus, {
    pending: 2,
    approved: 1,
    rejected: 0,
    expired: 1,
  });
  assert.equal(baseState.summary.byStatus.expired, 0);
}

testOptimisticApproveUpdatesStateAndSummary();
testOptimisticRejectUpdatesSession();
testRollbackRestoresPreviousSession();
testStaleAndTerminalRefusals();
testExpireStaleSessionsAndSummary();

console.log("mcp approval state tests passed");
