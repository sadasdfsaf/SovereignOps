import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  APPROVAL_EVIDENCE_REDACTED,
  buildApprovalEvidenceSummary,
  classifyApprovalEvidenceExpiry,
  normalizeApprovalEvidenceAuditRecords,
} from "../src/approvalEvidence.ts";

const CREATED_AT = "2026-04-27T00:00:00.000Z";
const UPDATED_AT = "2026-04-27T00:00:05.000Z";

describe("approval evidence builder", () => {
  it("sorts audit refs and redacted request details deterministically", () => {
    const session = approvalSession({
      request: {
        zeta: "last",
        apiKey: "raw-request-key",
        action: "draft_patch",
        metadata: { b: 2, a: 1 },
        toolName: "draft_document_patch",
      },
      metadata: {
        workspaceId: "workspace-b",
        deviceId: "device-b",
      },
      actor: {
        id: "operator-b",
        roles: ["reviewer", "author"],
        metadata: {
          workspaceId: "workspace-a",
          deviceId: "device-a",
        },
      },
    });
    const auditRecords = [
      {
        id: "audit-later",
        timestamp: "2026-04-27T00:00:02.000Z",
        type: "tool_call_denied",
        toolName: "draft_document_patch",
        actorId: "operator-c",
        decision: "deny",
        metadata: {
          ruleId: "rule-b",
          approvalId: "approval-1",
          workspaceId: "workspace-c",
        },
      },
      {
        id: "audit-earlier-b",
        timestamp: "2026-04-27T00:00:01.000Z",
        type: "tool_call_requested",
        toolName: "draft_document_patch",
      },
      {
        id: "audit-earlier-a",
        timestamp: "2026-04-27T00:00:01.000Z",
        type: "tool_call_approval_required",
        toolName: "draft_document_patch",
        decision: "require_approval",
        metadata: {
          ruleId: "rule-a",
          bearerAuth: "Bearer hidden-local-token",
        },
      },
    ];

    const first = buildApprovalEvidenceSummary({
      session,
      auditRecords,
      now: "2026-04-27T00:00:03.000Z",
    });
    const second = buildApprovalEvidenceSummary({
      session,
      auditRecords,
      now: "2026-04-27T00:00:03.000Z",
    });

    assert.equal(JSON.stringify(first), JSON.stringify(second));
    assert.deepEqual(
      first.audit.eventRefs.map((ref) => ref.id),
      ["audit-earlier-a", "audit-earlier-b", "audit-later"],
    );
    assert.deepEqual(Object.keys(first.request.details), [
      "action",
      "apiKey",
      "metadata",
      "toolName",
      "zeta",
    ]);
    assert.deepEqual(first.request.details.metadata, { a: 1, b: 2 });
    assert.equal(first.request.details.apiKey, APPROVAL_EVIDENCE_REDACTED);
    assert.deepEqual(first.refs.actorIds, ["operator-b", "operator-c"]);
    assert.deepEqual(first.refs.deviceIds, ["device-a", "device-b"]);
    assert.deepEqual(first.refs.workspaceIds, [
      "workspace-a",
      "workspace-b",
      "workspace-c",
    ]);
  });

  it("classifies pending, stale, and terminal expiry states", () => {
    assert.deepEqual(
      classifyApprovalEvidenceExpiry(
        approvalSession({ expiresAt: "2026-04-27T00:10:00.000Z" }),
        "2026-04-27T00:05:00.000Z",
      ),
      {
        state: "active",
        expired: false,
        evaluatedAt: "2026-04-27T00:05:00.000Z",
        expiresAt: "2026-04-27T00:10:00.000Z",
      },
    );
    assert.equal(
      classifyApprovalEvidenceExpiry(
        approvalSession({ expiresAt: "2026-04-27T00:01:00.000Z" }),
        "2026-04-27T00:01:00.000Z",
      ).state,
      "expired",
    );
    assert.equal(
      classifyApprovalEvidenceExpiry(
        approvalSession({
          status: "approved",
          updatedAt: "2026-04-27T00:06:00.000Z",
          expiresAt: "2026-04-27T00:10:00.000Z",
          approvedAt: "2026-04-27T00:06:00.000Z",
          approvedBy: { id: "reviewer-a" },
          decision: {
            status: "approved",
            at: "2026-04-27T00:06:00.000Z",
            actor: { id: "reviewer-a" },
          },
        }),
        "2026-04-27T00:20:00.000Z",
      ).state,
      "terminal_before_expiry",
    );
    assert.deepEqual(
      classifyApprovalEvidenceExpiry(
        approvalSession({
          status: "approved",
          updatedAt: "2026-04-27T00:11:00.000Z",
          expiresAt: "2026-04-27T00:10:00.000Z",
          approvedAt: "2026-04-27T00:11:00.000Z",
          approvedBy: { id: "reviewer-late" },
          decision: {
            status: "approved",
            at: "2026-04-27T00:11:00.000Z",
            actor: { id: "reviewer-late" },
          },
        }),
        "2026-04-27T00:12:00.000Z",
      ),
      {
        state: "terminal_after_expiry",
        expired: true,
        evaluatedAt: "2026-04-27T00:12:00.000Z",
        expiresAt: "2026-04-27T00:10:00.000Z",
      },
    );
  });

  it("redacts secret-like request, actor, decision, and audit metadata fields", () => {
    const summary = buildApprovalEvidenceSummary({
      session: approvalSession({
        request: {
          type: "tool",
          toolName: "draft_document_patch",
          arguments: {
            password: "raw-password",
            visible: "keep-visible",
            nested: {
              authToken: "raw-token",
              note: "Bearer raw-bearer",
            },
          },
        },
        actor: {
          id: "operator-a",
          metadata: {
            accessKey: "raw-access-key",
            visible: "keep-actor-visible",
          },
        },
        metadata: {
          secret: "raw-session-secret",
          nested: {
            password: "raw-nested-password",
          },
        },
        decision: {
          status: "rejected",
          at: UPDATED_AT,
          actor: {
            id: "reviewer-a",
            metadata: {
              authHeader: "raw-auth-header",
            },
          },
          metadata: {
            bearer: "raw-decision-bearer",
          },
        },
      }),
      auditRecords: [
        {
          id: "audit-redact",
          timestamp: UPDATED_AT,
          type: "tool_call_denied",
          toolName: "draft_document_patch",
          decision: "deny",
          metadata: {
            authorization: "raw-audit-auth",
            nested: {
              token: "raw-audit-token",
            },
          },
        },
      ],
    });
    const serialized = JSON.stringify(summary);

    for (const rawValue of [
      "raw-password",
      "raw-token",
      "raw-bearer",
      "raw-access-key",
      "raw-session-secret",
      "raw-nested-password",
      "raw-auth-header",
      "raw-decision-bearer",
      "raw-audit-auth",
      "raw-audit-token",
    ]) {
      assert.equal(serialized.includes(rawValue), false, rawValue);
    }
    assert.ok(serialized.includes(APPROVAL_EVIDENCE_REDACTED));
    assert.ok(serialized.includes("keep-visible"));
    assert.ok(serialized.includes("keep-actor-visible"));
  });

  it("marks missing audit refs without inventing a policy decision", () => {
    const summary = buildApprovalEvidenceSummary({
      session: approvalSession({
        id: "approval-missing-audit",
        request: {
          type: "tool",
          toolName: "link_evidence",
          operation: "tools.call",
        },
      }),
    });

    assert.equal(summary.audit.coverage, "missing");
    assert.deepEqual(summary.audit.eventRefs, []);
    assert.deepEqual(summary.policy.decisions, []);
    assert.equal(summary.policy.decision, undefined);
    assert.deepEqual(summary.policy.approvalIds, ["approval-missing-audit"]);
  });

  it("builds approved, denied, and expired evidence shapes", () => {
    const approved = buildApprovalEvidenceSummary({
      session: approvalSession({
        id: "approval-approved",
        status: "approved",
        expiresAt: "2026-04-27T00:10:00.000Z",
        updatedAt: "2026-04-27T00:06:00.000Z",
        approvedAt: "2026-04-27T00:06:00.000Z",
        approvedBy: { id: "reviewer-approved" },
        decision: {
          status: "approved",
          at: "2026-04-27T00:06:00.000Z",
          actor: { id: "reviewer-approved" },
          reason: "review complete",
        },
      }),
      auditRecords: [
        {
          id: "audit-approval-required",
          timestamp: CREATED_AT,
          type: "tool_call_approval_required",
          toolName: "draft_document_patch",
          decision: "require_approval",
          reason: "review needed",
          metadata: {
            approvalId: "approval-approved",
            ruleId: "rule-review",
          },
        },
      ],
    });
    const denied = buildApprovalEvidenceSummary({
      session: approvalSession({
        id: "approval-denied",
        status: "rejected",
        rejectedAt: "2026-04-27T00:06:00.000Z",
        rejectedBy: { id: "reviewer-denied" },
        decision: {
          status: "rejected",
          at: "2026-04-27T00:06:00.000Z",
          actor: { id: "reviewer-denied" },
          reason: "needs a safer draft",
        },
      }),
      auditRecords: [
        {
          id: "audit-denied",
          timestamp: UPDATED_AT,
          type: "tool_call_denied",
          toolName: "draft_document_patch",
          decision: "deny",
          metadata: { ruleId: "rule-deny" },
        },
      ],
    });
    const expired = buildApprovalEvidenceSummary({
      session: approvalSession({
        id: "approval-expired",
        status: "expired",
        expiresAt: "2026-04-27T00:01:00.000Z",
        expiredAt: "2026-04-27T00:01:00.000Z",
        expiredBy: { id: "system-clock" },
        decision: {
          status: "expired",
          at: "2026-04-27T00:01:00.000Z",
          actor: { id: "system-clock" },
          reason: "review window closed",
        },
      }),
    });

    assert.equal(approved.session.status, "approved");
    assert.equal(approved.session.result, "approved");
    assert.equal(approved.policy.result, "approved");
    assert.equal(approved.policy.decision, "require_approval");
    assert.equal(approved.actors.decision.id, "reviewer-approved");
    assert.equal(approved.session.expiry.state, "terminal_before_expiry");

    assert.equal(denied.session.status, "rejected");
    assert.equal(denied.session.result, "denied");
    assert.equal(denied.policy.result, "denied");
    assert.equal(denied.policy.decision, "deny");
    assert.equal(denied.actors.decision.id, "reviewer-denied");

    assert.equal(expired.session.status, "expired");
    assert.equal(expired.session.result, "expired");
    assert.equal(expired.policy.result, "expired");
    assert.equal(expired.session.expiry.state, "expired");
    assert.equal(expired.audit.coverage, "missing");
  });

  it("normalizes audit records with stable sorting helper", () => {
    assert.deepEqual(
      normalizeApprovalEvidenceAuditRecords([
        {
          id: "audit-2",
          timestamp: "2026-04-27T00:00:02.000Z",
          type: "tool_call_requested",
          toolName: "link_evidence",
        },
        {
          id: "audit-1",
          timestamp: "2026-04-27T00:00:01.000Z",
          type: "tool_call_requested",
          toolName: "link_evidence",
        },
      ]).map((ref) => ref.id),
      ["audit-1", "audit-2"],
    );
  });
});

function approvalSession(overrides = {}) {
  return {
    id: "approval-1",
    status: "pending",
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    request: {
      type: "tool",
      toolName: "draft_document_patch",
      arguments: {
        targetPath: "notes/local.md",
        patch: "candidate patch",
      },
      operation: "tools.call",
    },
    ...overrides,
  };
}
