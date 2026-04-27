import assert from "node:assert/strict";
import test from "node:test";

import { createApiRouter } from "../src/router.ts";
import { createMcpApprovalEvidenceRoutes } from "../src/mcpApprovalEvidenceRoutes.ts";
import {
  MCP_APPROVAL_EVIDENCE_RECORD_SCHEMA_VERSION,
  createInMemoryMcpApprovalEvidenceRecordStore,
  createMcpApprovalEvidenceRecordRoutes,
  mountMcpApprovalEvidenceRecordRoutes,
} from "../src/mcpApprovalEvidenceRecordRoutes.ts";

const fixedNow = "2026-04-27T00:00:00.000Z";
const secret = "sk_local_record_secret_123456";

test("mounts MCP approval evidence record routes", () => {
  const router = createApiRouter();
  mountMcpApprovalEvidenceRecordRoutes(router);

  assert.deepEqual(
    router.listRoutes().map(routeKey),
    [
      "GET /v1/mcp/approval-evidence/records",
      "GET /v1/mcp/approval-evidence/records/:recordId",
      "POST /v1/mcp/approval-evidence/records",
      "POST /v1/mcp/approval-evidence/records/:recordId/compare",
    ],
  );
});

test("stores approval evidence records from raw preview inputs with injected memory store", async () => {
  const store = createInMemoryMcpApprovalEvidenceRecordStore();
  const router = createApiRouter(createMcpApprovalEvidenceRecordRoutes({
    store,
    now: () => fixedNow,
  }));
  const body = {
    recordId: "record-local-1",
    label: "local-baseline",
    metadata: {
      token: secret,
      visible: "kept",
    },
    payload: createEvidenceBody(),
  };
  const before = structuredClone(body);

  const createResponse = await router.dispatch({
    method: "POST",
    path: "/v1/mcp/approval-evidence/records",
    body,
  });

  assertJsonResponse(createResponse, 201);
  assert.deepEqual(body, before);
  assert.equal(createResponse.body.kind, "mcp-approval-evidence.record.created");
  assert.equal(createResponse.body.schemaVersion, MCP_APPROVAL_EVIDENCE_RECORD_SCHEMA_VERSION);
  assert.equal(createResponse.body.localOnly, true);
  assert.equal(createResponse.body.record.kind, "mcp-approval-evidence.record");
  assert.equal(createResponse.body.record.recordId, "record-local-1");
  assert.equal(createResponse.body.record.createdAt, fixedNow);
  assert.equal(createResponse.body.record.updatedAt, fixedNow);
  assert.equal(createResponse.body.record.label, "local-baseline");
  assert.equal(createResponse.body.record.metadata.token, "[REDACTED]");
  assert.equal(createResponse.body.record.metadata.visible, "kept");
  assert.equal(createResponse.body.record.baseline.summary.returnedEvidenceCount, 3);
  assert.match(createResponse.body.record.fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(
    createResponse.body.record.baselineFingerprint,
    createResponse.body.record.baseline.fingerprint,
  );
  assert.equal(JSON.stringify(createResponse.body).includes(secret), false);

  const listResponse = await router.dispatch({
    method: "GET",
    path: "/v1/mcp/approval-evidence/records",
    body: {
      filters: {
        labels: ["local-baseline"],
      },
      offset: 0,
      limit: 1,
    },
  });
  assertJsonResponse(listResponse, 200);
  assert.deepEqual(listResponse.body.pagination, {
    offset: 0,
    limit: 1,
    totalRecordCount: 1,
    matchedRecordCount: 1,
    returnedRecordCount: 1,
    hasMore: false,
  });
  assert.deepEqual(
    listResponse.body.records.map((record) => ({
      recordId: record.recordId,
      label: record.label,
      evidenceCount: record.evidenceCount,
      approvalRequiredCount: record.approvalRequiredCount,
    })),
    [
      {
        recordId: "record-local-1",
        label: "local-baseline",
        evidenceCount: 3,
        approvalRequiredCount: 3,
      },
    ],
  );

  const getResponse = await router.dispatch({
    method: "GET",
    path: "/v1/mcp/approval-evidence/records/record-local-1",
  });
  assertJsonResponse(getResponse, 200);
  assert.deepEqual(getResponse.body.record, createResponse.body.record);
});

test("accepts stored preview responses and compares candidate evidence payloads", async () => {
  const store = createInMemoryMcpApprovalEvidenceRecordStore();
  const router = createApiRouter(createMcpApprovalEvidenceRecordRoutes({
    store,
    now: () => fixedNow,
  }));
  const preview = await createPreview(createEvidenceBody());

  const createResponse = await router.dispatch({
    method: "POST",
    path: "/v1/mcp/approval-evidence/records",
    body: {
      recordId: "record-preview-1",
      preview,
    },
  });
  assertJsonResponse(createResponse, 201);
  assert.deepEqual(createResponse.body.record.baseline, preview);

  const sameCompare = await router.dispatch({
    method: "POST",
    path: "/v1/mcp/approval-evidence/records/record-preview-1/compare",
    body: {
      baseline: preview,
    },
  });
  assertJsonResponse(sameCompare, 200);
  assert.equal(sameCompare.body.kind, "mcp-approval-evidence.record.compare");
  assert.equal(sameCompare.body.equivalent, true);
  assert.deepEqual(sameCompare.body.summary, {
    storedEvidenceCount: 3,
    candidateEvidenceCount: 3,
    unchangedEvidenceCount: 3,
    addedEvidenceCount: 0,
    removedEvidenceCount: 0,
    changedEvidenceCount: 0,
  });

  const changedBody = createEvidenceBody();
  changedBody.toolAuditRecords[0].reason = "updated local review details";
  changedBody.resourceAuditRecords.push({
    id: "resource-added",
    timestamp: "2026-04-27T00:00:04.000Z",
    type: "policy_decision",
    uri: "sovereignops://local/extra-note",
    capability: "read_object",
    decision: "require_approval",
    message: "extra local review",
  });

  const changedCompare = await router.dispatch({
    method: "POST",
    path: "/v1/mcp/approval-evidence/records/record-preview-1/compare",
    body: {
      payload: changedBody,
    },
  });
  assertJsonResponse(changedCompare, 200);
  assert.equal(changedCompare.body.equivalent, false);
  assert.deepEqual(changedCompare.body.summary, {
    storedEvidenceCount: 3,
    candidateEvidenceCount: 4,
    unchangedEvidenceCount: 2,
    addedEvidenceCount: 1,
    removedEvidenceCount: 0,
    changedEvidenceCount: 1,
  });
  assert.deepEqual(
    changedCompare.body.differences.added.map((item) => item.key),
    ["resource_audit:resource-added"],
  );
  assert.deepEqual(
    changedCompare.body.differences.changed.map((item) => item.key),
    ["tool_audit:tool-approval"],
  );
});

test("returns standard JSON errors for invalid, missing, and duplicate records", async () => {
  const router = createApiRouter(createMcpApprovalEvidenceRecordRoutes({
    now: () => fixedNow,
  }));

  const badBody = await router.dispatch({
    method: "POST",
    path: "/v1/mcp/approval-evidence/records",
    body: ["not-an-object"],
  });
  assertJsonError(badBody, 400, "validation_failed");
  assert.deepEqual(badBody.body.error.details, { path: "body" });

  const badRecordId = await router.dispatch({
    method: "POST",
    path: "/v1/mcp/approval-evidence/records",
    body: {
      recordId: "bad/id",
      payload: createEvidenceBody(),
    },
  });
  assertJsonError(badRecordId, 400, "validation_failed");
  assert.deepEqual(badRecordId.body.error.details, { path: "body.recordId" });

  const malformedPayload = await router.dispatch({
    method: "POST",
    path: "/v1/mcp/approval-evidence/records",
    body: {
      recordId: "record-malformed",
      payload: {
        approvalSessions: [],
        unexpected: true,
      },
    },
  });
  assertJsonError(malformedPayload, 400, "validation_failed");
  assert.deepEqual(malformedPayload.body.error.details, { path: "body.unexpected" });

  const created = await router.dispatch({
    method: "POST",
    path: "/v1/mcp/approval-evidence/records",
    body: {
      recordId: "record-duplicate",
      payload: createEvidenceBody(),
    },
  });
  assertJsonResponse(created, 201);

  const duplicate = await router.dispatch({
    method: "POST",
    path: "/v1/mcp/approval-evidence/records",
    body: {
      recordId: "record-duplicate",
      payload: createEvidenceBody(),
    },
  });
  assertJsonError(duplicate, 409, "mcp_approval_evidence_record_duplicate");
  assert.deepEqual(duplicate.body.error.details, { recordId: "record-duplicate" });

  const missing = await router.dispatch({
    method: "GET",
    path: "/v1/mcp/approval-evidence/records/missing-record",
  });
  assertJsonError(missing, 404, "mcp_approval_evidence_record_not_found");
  assert.deepEqual(missing.body.error.details, { recordId: "missing-record" });

  const badList = await router.dispatch({
    method: "GET",
    path: "/v1/mcp/approval-evidence/records",
    body: {
      limit: 101,
    },
  });
  assertJsonError(badList, 400, "validation_failed");
  assert.deepEqual(badList.body.error.details, { path: "body.limit" });
});

test("generates deterministic record ids and rejects duplicate auto ids", async () => {
  const router = createApiRouter(createMcpApprovalEvidenceRecordRoutes({
    now: () => fixedNow,
  }));

  const first = await router.dispatch({
    method: "POST",
    path: "/v1/mcp/approval-evidence/records",
    body: createEvidenceBody(),
  });
  assertJsonResponse(first, 201);
  assert.match(first.body.record.recordId, /^mcpae_[a-f0-9]{24}$/);

  const second = await router.dispatch({
    method: "POST",
    path: "/v1/mcp/approval-evidence/records",
    body: createEvidenceBody(),
  });
  assertJsonError(second, 409, "mcp_approval_evidence_record_duplicate");
  assert.deepEqual(second.body.error.details, { recordId: first.body.record.recordId });
});

async function createPreview(body) {
  const router = createApiRouter(createMcpApprovalEvidenceRoutes());
  const response = await router.dispatch({
    method: "POST",
    path: "/v1/mcp/approval-evidence/preview",
    body,
  });

  assertJsonResponse(response, 200);
  return response.body;
}

function createEvidenceBody() {
  return {
    approvalSessions: [
      {
        id: "approval-pending",
        status: "pending",
        createdAt: "2026-04-27T00:00:01.000Z",
        updatedAt: "2026-04-27T00:00:01.000Z",
        request: {
          toolName: "draft_local_note",
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
      },
    ],
    toolAuditRecords: [
      {
        id: "tool-approval",
        timestamp: "2026-04-27T00:00:02.000Z",
        type: "tool_call_approval_required",
        toolName: "draft_local_note",
        actorId: "actor-1",
        decision: "require_approval",
        reason: `local review needs token=${secret}`,
        metadata: {
          source: "record-route-test",
        },
      },
    ],
    resourceAuditRecords: [
      {
        id: "resource-approval",
        timestamp: "2026-04-27T00:00:03.000Z",
        type: "policy_decision",
        uri: "sovereignops://local/plan",
        capability: "read_object",
        decision: "require_approval",
        message: "local resource review needed",
      },
    ],
    filters: {
      statuses: ["approval_required"],
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
