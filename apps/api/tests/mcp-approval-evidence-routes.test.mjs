import assert from "node:assert/strict";
import test from "node:test";

import { createApiRouter } from "../src/router.ts";
import {
  MCP_APPROVAL_EVIDENCE_REDACTION,
  MCP_APPROVAL_EVIDENCE_SCHEMA_VERSION,
  createMcpApprovalEvidenceRoutes,
  mountMcpApprovalEvidenceRoutes,
} from "../src/mcpApprovalEvidenceRoutes.ts";

const secret = "sk_local_approval_secret_123456";

test("mounts MCP approval evidence preview route", () => {
  const router = createApiRouter();
  mountMcpApprovalEvidenceRoutes(router);

  assert.deepEqual(
    router.listRoutes().map(routeKey),
    ["POST /v1/mcp/approval-evidence/preview"],
  );
});

test("builds deterministic redacted MCP approval evidence previews", async () => {
  const router = createApiRouter(createMcpApprovalEvidenceRoutes());
  const body = createEvidenceBody();
  const before = structuredClone(body);

  const first = await router.dispatch({
    method: "POST",
    path: "/v1/mcp/approval-evidence/preview",
    body,
  });
  const second = await router.dispatch({
    method: "POST",
    path: "/v1/mcp/approval-evidence/preview",
    body: structuredClone(body),
  });

  assertJsonResponse(first, 200);
  assert.deepEqual(first.body, second.body);
  assert.deepEqual(body, before);
  assert.equal(first.body.kind, "mcp-approval-evidence.preview");
  assert.equal(first.body.schemaVersion, MCP_APPROVAL_EVIDENCE_SCHEMA_VERSION);
  assert.equal(first.body.localOnly, true);
  assert.equal(first.body.redacted, true);
  assert.match(first.body.fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(first.body.evidence.every((item) => /^sha256:[a-f0-9]{64}$/.test(item.fingerprint)), true);
  assert.deepEqual(
    first.body.evidence.map((entry) => [entry.id, entry.source, entry.status]),
    [
      ["tool-requested", "tool_audit", "requested"],
      ["approval-pending", "approval_session", "approval_required"],
      ["tool-approval", "tool_audit", "approval_required"],
      ["resource-approval", "resource_audit", "approval_required"],
      ["approval-approved", "approval_session", "approved"],
    ],
  );
  assert.deepEqual(first.body.summary, {
    inputRecordCount: 5,
    totalEvidenceCount: 5,
    returnedEvidenceCount: 5,
    filteredEvidenceCount: 0,
    approvalSessionCount: 2,
    auditRecordCount: 3,
    approvalRequiredCount: 3,
    terminalDecisionCount: 1,
    sources: {
      approval_session: 2,
      resource_audit: 1,
      tool_audit: 2,
    },
    statuses: {
      approval_required: 3,
      approved: 1,
      requested: 1,
    },
  });

  const serialized = JSON.stringify(first.body);
  assert.equal(serialized.includes(secret), false);
  assert.match(serialized, /\[REDACTED\]/);
  assert.equal(
    first.body.evidence.find((entry) => entry.id === "approval-pending").request.arguments.apiKey,
    MCP_APPROVAL_EVIDENCE_REDACTION,
  );
  assert.equal(
    first.body.evidence.find((entry) => entry.id === "approval-pending").metadata.token,
    MCP_APPROVAL_EVIDENCE_REDACTION,
  );
});

test("supports payload snapshot and list-style filters", async () => {
  const router = createApiRouter(createMcpApprovalEvidenceRoutes());
  const body = createEvidenceBody();
  const response = await router.dispatch({
    method: "POST",
    path: "/v1/mcp/approval-evidence/preview",
    body: {
      snapshot: {
        approvalSessions: body.approvalSessions,
        toolAuditRecords: body.toolAuditRecords,
        resourceAuditRecords: body.resourceAuditRecords,
      },
      filters: {
        sources: ["approval_session"],
        statuses: ["approval_required"],
        limit: 1,
      },
    },
  });

  assertJsonResponse(response, 200);
  assert.deepEqual(response.body.filters, {
    sources: ["approval_session"],
    statuses: ["approval_required"],
    limit: 1,
  });
  assert.equal(response.body.summary.totalEvidenceCount, 5);
  assert.equal(response.body.summary.returnedEvidenceCount, 1);
  assert.equal(response.body.summary.filteredEvidenceCount, 4);
  assert.deepEqual(
    response.body.evidence.map((entry) => [entry.id, entry.source, entry.status]),
    [["approval-pending", "approval_session", "approval_required"]],
  );
});

test("returns standard JSON validation errors for malformed evidence payloads", async () => {
  const router = createApiRouter(createMcpApprovalEvidenceRoutes());

  const badBody = await router.dispatch({
    method: "POST",
    path: "/v1/mcp/approval-evidence/preview",
    body: ["not-an-object"],
  });
  assertJsonError(badBody, 400, "validation_failed");
  assert.deepEqual(badBody.body.error.details, { path: "body" });

  const emptyBody = await router.dispatch({
    method: "POST",
    path: "/v1/mcp/approval-evidence/preview",
    body: {},
  });
  assertJsonError(emptyBody, 400, "validation_failed");
  assert.deepEqual(emptyBody.body.error.details, { path: "body" });

  const unknownField = await router.dispatch({
    method: "POST",
    path: "/v1/mcp/approval-evidence/preview",
    body: {
      approvalSessions: [],
      unexpected: true,
    },
  });
  assertJsonError(unknownField, 400, "validation_failed");
  assert.deepEqual(unknownField.body.error.details, { path: "body.unexpected" });

  const badStatus = await router.dispatch({
    method: "POST",
    path: "/v1/mcp/approval-evidence/preview",
    body: {
      approvalSessions: [
        {
          ...pendingApprovalSession(),
          status: "closed",
        },
      ],
    },
  });
  assertJsonError(badStatus, 400, "validation_failed");
  assert.deepEqual(badStatus.body.error.details, {
    path: "body.approvalSessions.0.status",
  });

  const badMetadata = await router.dispatch({
    method: "POST",
    path: "/v1/mcp/approval-evidence/preview",
    body: {
      toolAuditRecords: [
        {
          id: "tool-bad",
          timestamp: "2026-04-27T00:00:00.000Z",
          type: "tool_call_requested",
          toolName: "create_task_proposal",
          metadata: "not-an-object",
        },
      ],
    },
  });
  assertJsonError(badMetadata, 400, "validation_failed");
  assert.deepEqual(badMetadata.body.error.details, {
    path: "body.toolAuditRecords.0.metadata",
  });

  const mixedSnapshot = await router.dispatch({
    method: "POST",
    path: "/v1/mcp/approval-evidence/preview",
    body: {
      snapshot: { approvalSessions: [pendingApprovalSession()] },
      approvalSessions: [pendingApprovalSession()],
    },
  });
  assertJsonError(mixedSnapshot, 400, "validation_failed");
  assert.deepEqual(mixedSnapshot.body.error.details, {
    path: "body.approvalSessions",
  });
});

function createEvidenceBody() {
  return {
    approvalSessions: [
      pendingApprovalSession(),
      {
        id: "approval-approved",
        status: "approved",
        createdAt: "2026-04-27T00:00:00.000Z",
        updatedAt: "2026-04-27T00:00:04.000Z",
        request: {
          uri: "sovereignops://docs/local-plan",
        },
        reason: "local read review",
        decision: {
          status: "approved",
          at: "2026-04-27T00:00:04.000Z",
          actor: { id: "reviewer-1" },
          reason: "checked locally",
        },
        approvedAt: "2026-04-27T00:00:04.000Z",
        approvedBy: { id: "reviewer-1" },
      },
    ],
    toolAuditRecords: [
      {
        id: "tool-approval",
        timestamp: "2026-04-27T00:00:02.000Z",
        type: "tool_call_approval_required",
        toolName: "draft_document_patch",
        actorId: "actor-1",
        decision: "require_approval",
        reason: `local review needs token=${secret}`,
        metadata: {
          token: secret,
          source: "route-test",
        },
      },
      {
        id: "tool-requested",
        timestamp: "2026-04-27T00:00:00.000Z",
        type: "tool_call_requested",
        toolName: "draft_document_patch",
        actorId: "actor-1",
        arguments: {
          targetPath: "notes/local-plan.md",
          password: secret,
          nested: {
            visible: "kept",
          },
        },
      },
    ],
    resourceAuditRecords: [
      {
        id: "resource-approval",
        timestamp: "2026-04-27T00:00:03.000Z",
        type: "policy_decision",
        uri: "sovereignops://docs/local-plan",
        capability: "read_object",
        decision: "require_approval",
        message: "local resource review needed",
        metadata: {
          operation: "resources.read",
          sessionToken: secret,
        },
      },
    ],
  };
}

function pendingApprovalSession() {
  return {
    id: "approval-pending",
    status: "pending",
    createdAt: "2026-04-27T00:00:01.000Z",
    updatedAt: "2026-04-27T00:00:01.000Z",
    request: {
      toolName: "draft_document_patch",
      arguments: {
        targetPath: "notes/local-plan.md",
        apiKey: secret,
        visible: "keep-approval-value",
      },
    },
    actor: { id: "actor-1" },
    reason: "local approval required",
    ruleId: "local-rule",
    metadata: {
      token: secret,
      visible: "keep-metadata-value",
    },
  };
}

function assertJsonResponse(response, status) {
  assert.equal(response.status, status);
  assert.match(response.headers["content-type"], /^application\/json/);
}

function assertJsonError(response, status, code) {
  assertJsonResponse(response, status);
  assert.deepEqual(Object.keys(response.body), ["error"]);
  assert.equal(response.body.error.code, code);
  assert.equal(typeof response.body.error.message, "string");
  assert.ok(response.body.error.message.length > 0);
}

function routeKey(route) {
  return `${route.method} ${route.path}`;
}
