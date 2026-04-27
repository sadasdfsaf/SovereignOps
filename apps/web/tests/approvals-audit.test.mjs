import assert from "node:assert/strict";

import {
  decideApproval,
  expireStaleApprovals,
  isApprovalRequestStatus,
  isApprovalRiskLevel,
  listPendingApprovals,
  summarizeApprovals,
} from "../src/approvals.ts";
import {
  decodeAuditTimelineCursor,
  encodeAuditTimelineCursor,
  filterAuditTimelineRecords,
  groupAuditRecordsByDay,
  pageAuditTimelineRecords,
  sortAuditTimelineRecords,
} from "../src/auditTimeline.ts";

const approvalSamples = [
  {
    id: "apv_review_notes",
    workspaceId: "wsp_alpha",
    actionId: "task_publish_notes",
    title: "Publish notes",
    requestedBy: "act_mira",
    createdAt: "2026-04-27T09:00:00.000Z",
    reason: "The notes are ready to share with the workspace.",
    status: "pending",
    riskLevel: "high",
    requiredCapabilities: ["docs.read", "docs.write"],
  },
  {
    id: "apv_backup",
    workspaceId: "wsp_alpha",
    actionId: "task_backup",
    title: "Create local backup",
    requestedBy: "act_mira",
    createdAt: "2026-04-27T10:00:00.000Z",
    reason: "A backup is needed before the data cleanup.",
    status: "pending",
    riskLevel: "medium",
    requiredCapabilities: ["files.write"],
  },
  {
    id: "apv_cleanup",
    workspaceId: "wsp_alpha",
    actionId: "task_cleanup",
    title: "Run cleanup",
    requestedBy: "act_rin",
    createdAt: "2026-04-27T08:00:00.000Z",
    reason: "Remove duplicate local records.",
    status: "approved",
    decidedBy: "act_lead",
    decidedAt: "2026-04-27T08:30:00.000Z",
    decisionReason: "Duplicates were confirmed.",
    riskLevel: "low",
    requiredCapabilities: ["records.write"],
  },
  {
    id: "apv_beta_backup",
    workspaceId: "wsp_beta",
    actionId: "task_backup",
    title: "Create beta backup",
    requestedBy: "act_sol",
    createdAt: "2026-04-27T07:00:00.000Z",
    reason: "Keep a second workspace snapshot.",
    status: "pending",
    riskLevel: "low",
    requiredCapabilities: ["files.write"],
  },
];

const auditSamples = [
  {
    id: "aud_03",
    workspaceId: "wsp_alpha",
    actionId: "task_publish_notes",
    actor: "act_mira",
    status: "done",
    timestamp: "2026-04-28T09:00:00.000Z",
    title: "Notes published",
  },
  {
    id: "aud_01",
    workspaceId: "wsp_alpha",
    actionId: "task_publish_notes",
    actor: "act_mira",
    status: "queued",
    timestamp: "2026-04-27T09:00:00.000Z",
    title: "Notes queued",
  },
  {
    id: "aud_02",
    workspaceId: "wsp_alpha",
    actionId: "task_publish_notes",
    actor: "act_mira",
    status: "done",
    timestamp: "2026-04-27T09:00:00.000Z",
    title: "Notes checked",
  },
  {
    id: "aud_04",
    workspaceId: "wsp_beta",
    actionId: "task_backup",
    actor: "act_sol",
    status: "done",
    timestamp: "2026-04-27T07:00:00.000Z",
    title: "Backup complete",
  },
  {
    id: "aud_05",
    workspaceId: "wsp_alpha",
    actionId: "task_backup",
    actor: "act_rin",
    status: "blocked",
    timestamp: "2026-04-29T12:00:00.000Z",
    title: "Backup paused",
  },
];

function testListPendingApprovals() {
  const pending = listPendingApprovals(approvalSamples, {
    workspaceId: "wsp_alpha",
    requestedBy: "act_mira",
  });

  assert.deepEqual(
    pending.map((approval) => approval.id),
    ["apv_review_notes", "apv_backup"],
  );

  const writable = listPendingApprovals(approvalSamples, {
    requiredCapability: "files.write",
  });
  assert.deepEqual(
    writable.map((approval) => approval.id),
    ["apv_beta_backup", "apv_backup"],
  );

  pending[0].requiredCapabilities.push("mutated");
  assert.deepEqual(approvalSamples[0].requiredCapabilities, [
    "docs.read",
    "docs.write",
  ]);
}

function testDecideApprovalImmutably() {
  const next = decideApproval(approvalSamples, {
    id: "apv_backup",
    status: "rejected",
    decidedBy: "act_lead",
    decidedAt: "2026-04-27T11:00:00.000Z",
    decisionReason: "Backup window moved.",
  });

  const original = approvalSamples.find((approval) => approval.id === "apv_backup");
  const updated = next.find((approval) => approval.id === "apv_backup");

  assert.equal(original.status, "pending");
  assert.equal(updated.status, "rejected");
  assert.equal(updated.decidedBy, "act_lead");
  assert.equal(updated.decidedAt, "2026-04-27T11:00:00.000Z");
  assert.notEqual(updated, original);
  assert.notEqual(updated.requiredCapabilities, original.requiredCapabilities);

  assert.throws(
    () =>
      decideApproval(approvalSamples, {
        id: "apv_cleanup",
        status: "approved",
        decidedBy: "act_lead",
        decidedAt: "2026-04-27T11:05:00.000Z",
      }),
    /pending approvals/,
  );
}

function testExpireAndSummarizeApprovals() {
  const expired = expireStaleApprovals(approvalSamples, {
    staleAtOrBefore: "2026-04-27T09:00:00.000Z",
    expiredAt: "2026-04-27T12:00:00.000Z",
    decisionReason: "Timed out.",
  });

  assert.equal(
    expired.find((approval) => approval.id === "apv_review_notes").status,
    "expired",
  );
  assert.equal(
    expired.find((approval) => approval.id === "apv_beta_backup").status,
    "expired",
  );
  assert.equal(
    expired.find((approval) => approval.id === "apv_backup").status,
    "pending",
  );
  assert.equal(approvalSamples[0].status, "pending");

  const summary = summarizeApprovals(expired);
  assert.equal(summary.total, 4);
  assert.deepEqual(summary.byStatus, {
    pending: 1,
    approved: 1,
    rejected: 0,
    expired: 2,
  });
  assert.deepEqual(summary.byRiskLevel, {
    low: 2,
    medium: 1,
    high: 1,
  });
  assert.equal(summary.byStatusAndRiskLevel.expired.high, 1);
  assert.equal(summary.byStatusAndRiskLevel.pending.medium, 1);

  assert.equal(isApprovalRequestStatus("expired"), true);
  assert.equal(isApprovalRequestStatus("queued"), false);
  assert.equal(isApprovalRiskLevel("high"), true);
  assert.equal(isApprovalRiskLevel("critical"), false);
}

function testAuditFilteringGroupingAndSorting() {
  const filtered = filterAuditTimelineRecords(auditSamples, {
    workspaceId: "wsp_alpha",
    actionId: "task_publish_notes",
    status: ["queued", "done"],
    actor: "act_mira",
  });

  assert.deepEqual(
    filtered.map((record) => record.id),
    ["aud_03", "aud_01", "aud_02"],
  );

  filtered[0].title = "mutated";
  assert.equal(auditSamples[0].title, "Notes published");

  assert.deepEqual(
    sortAuditTimelineRecords(filtered).map((record) => record.id),
    ["aud_01", "aud_02", "aud_03"],
  );

  const groups = groupAuditRecordsByDay(filtered);
  assert.deepEqual(
    groups.map((group) => [group.day, group.records.map((record) => record.id)]),
    [
      ["2026-04-27", ["aud_01", "aud_02"]],
      ["2026-04-28", ["aud_03"]],
    ],
  );
}

function testAuditPagesAndCursors() {
  const firstPage = pageAuditTimelineRecords(auditSamples, {
    filters: { workspaceId: "wsp_alpha" },
    limit: 2,
  });

  assert.deepEqual(
    firstPage.records.map((record) => record.id),
    ["aud_01", "aud_02"],
  );
  assert.equal(firstPage.hasMore, true);
  assert.equal(firstPage.limit, 2);
  assert.equal(firstPage.direction, "asc");
  assert.deepEqual(decodeAuditTimelineCursor(firstPage.nextCursor), {
    timestamp: "2026-04-27T09:00:00.000Z",
    id: "aud_02",
  });

  const secondPage = pageAuditTimelineRecords(auditSamples, {
    filters: { workspaceId: "wsp_alpha" },
    cursor: firstPage.nextCursor,
    limit: 2,
  });

  assert.deepEqual(
    secondPage.records.map((record) => record.id),
    ["aud_03", "aud_05"],
  );
  assert.equal(secondPage.hasMore, false);
  assert.equal(secondPage.nextCursor, undefined);

  const descending = pageAuditTimelineRecords(auditSamples, {
    filters: { workspaceId: "wsp_alpha" },
    direction: "desc",
    limit: 2,
  });
  assert.deepEqual(
    descending.records.map((record) => record.id),
    ["aud_05", "aud_03"],
  );

  const manualCursor = encodeAuditTimelineCursor({
    id: "aud_03",
    timestamp: "2026-04-28T09:00:00.000Z",
  });
  const afterManualCursor = pageAuditTimelineRecords(auditSamples, {
    filters: { workspaceId: "wsp_alpha" },
    cursor: manualCursor,
    limit: 5,
  });
  assert.deepEqual(
    afterManualCursor.records.map((record) => record.id),
    ["aud_05"],
  );
}

testListPendingApprovals();
testDecideApprovalImmutably();
testExpireAndSummarizeApprovals();
testAuditFilteringGroupingAndSorting();
testAuditPagesAndCursors();

console.log("approvals and audit timeline tests passed");
