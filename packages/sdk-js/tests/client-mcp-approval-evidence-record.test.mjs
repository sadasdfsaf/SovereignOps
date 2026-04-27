import assert from "node:assert/strict";
import test from "node:test";

import {
  ApiHttpError,
  ApiRequestValidationError,
  ApiResponseParseError,
  ApiResponseValidationError,
  createMcpApprovalEvidenceRecordClient,
  toApiResult,
} from "../src/index.ts";

test("creates, lists, gets, and compares MCP approval evidence records", async () => {
  const record = validRecord();
  const otherRecord = {
    ...validRecord("mcpae_localNotesReviewNext"),
    approvalStatus: "pending",
    sessionRefs: [
      {
        sessionId: "approval_localnotes_primary",
        role: "subject",
        status: "pending",
      },
    ],
  };
  const compare = {
    kind: "mcp-approval-evidence-record.compare",
    localOnly: true,
    leftRecordId: record.id,
    rightRecordId: otherRecord.id,
    equal: false,
    differences: [
      {
        path: "approvalStatus",
        left: "approved",
        right: "pending",
      },
    ],
    records: [record, otherRecord],
  };
  const fetch = fakeFetch([
    jsonResponse(201, { record }),
    jsonResponse(200, { localOnly: true, records: [record], nextCursor: "cur_next" }),
    jsonResponse(200, { record }),
    jsonResponse(200, compare),
  ]);
  const client = createMcpApprovalEvidenceRecordClient({
    baseUrl: "local://api/v1/",
    apiKey: "test-key",
    headers: {
      "x-sdk-test": "mcp-approval-evidence-record",
    },
    fetch,
  });

  const created = await client.create(record);
  const listed = await client.list({
    workspaceId: "wsp_localReview",
    approvalStatus: "approved",
    policyDecision: "require_approval",
    limit: 10,
    cursor: "cur_1",
  });
  const fetched = await client.get("mcpae_localNotesReview/with space");
  const compared = await client.compare({
    leftRecordId: record.id,
    rightRecordId: otherRecord.id,
  });

  assert.deepEqual(created, { record });
  assert.deepEqual(listed, { localOnly: true, records: [record], nextCursor: "cur_next" });
  assert.deepEqual(fetched, { record });
  assert.deepEqual(compared, compare);

  assert.equal(fetch.calls[0].url, "local://api/v1/mcp/approval-evidence/records");
  assert.equal(fetch.calls[0].init.method, "POST");
  assert.equal(fetch.calls[0].init.headers.accept, "application/json");
  assert.equal(fetch.calls[0].init.headers.authorization, "Bearer test-key");
  assert.equal(fetch.calls[0].init.headers["content-type"], "application/json");
  assert.equal(fetch.calls[0].init.headers["x-sdk-test"], "mcp-approval-evidence-record");
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), record);

  assert.equal(
    fetch.calls[1].url,
    "local://api/v1/mcp/approval-evidence/records?workspaceId=wsp_localReview&approvalStatus=approved&policyDecision=require_approval&limit=10&cursor=cur_1",
  );
  assert.equal(fetch.calls[1].init.method, "GET");
  assert.equal(Object.hasOwn(fetch.calls[1].init.headers, "content-type"), false);

  assert.equal(
    fetch.calls[2].url,
    "local://api/v1/mcp/approval-evidence/records/mcpae_localNotesReview%2Fwith%20space",
  );
  assert.equal(fetch.calls[2].init.method, "GET");

  assert.equal(fetch.calls[3].url, "local://api/v1/mcp/approval-evidence/records/compare");
  assert.equal(fetch.calls[3].init.method, "POST");
  assert.deepEqual(JSON.parse(fetch.calls[3].init.body), {
    leftRecordId: record.id,
    rightRecordId: otherRecord.id,
  });
});

test("validates record requests before fetch is called", async () => {
  const fetch = fakeFetch([]);
  const client = createMcpApprovalEvidenceRecordClient({
    baseUrl: "local://api/v1",
    fetch,
  });

  await assert.rejects(
    client.create({
      ...validRecord(),
      localOnly: false,
      metadata: {
        token: "[REDACTED]",
      },
      redactionSummary: {
        redacted: true,
        redactedFieldCount: 2,
        redactedPaths: ["request.arguments.previewText"],
        retainedMetadataKeys: ["clientLabel"],
      },
    }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(
        error.issues.map((issue) => issue.path),
        [
          "localOnly",
          "redactionSummary.redactedFieldCount",
          "metadata.token",
        ],
      );
      return true;
    },
  );

  await assert.rejects(
    client.list({ workspaceId: "workspace-local", limit: -1 }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(
        error.issues.map((issue) => issue.path),
        ["query.workspaceId", "query.limit"],
      );
      return true;
    },
  );

  await assert.rejects(
    client.get(""),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(error.issues.map((issue) => issue.path), ["recordId"]);
      return true;
    },
  );

  await assert.rejects(
    client.compare({ leftRecordId: "mcpae_left", rightRecordId: "" }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(error.issues.map((issue) => issue.path), ["rightRecordId"]);
      return true;
    },
  );

  assert.equal(fetch.calls.length, 0);
});

test("supports payload wrappers and record-scoped compare paths", async () => {
  const created = {
    kind: "mcp-approval-evidence.record.created",
    schemaVersion: "mcp-approval-evidence-record/v1",
    localOnly: true,
    record: routeRecord(),
  };
  const compared = {
    kind: "mcp-approval-evidence.record.compare",
    schemaVersion: "mcp-approval-evidence-record/v1",
    localOnly: true,
    recordId: "record-local-1",
    equivalent: true,
    summary: {
      storedEvidenceCount: 1,
      candidateEvidenceCount: 1,
      unchangedEvidenceCount: 1,
      addedEvidenceCount: 0,
      removedEvidenceCount: 0,
      changedEvidenceCount: 0,
    },
    differences: {
      added: [],
      removed: [],
      changed: [],
    },
  };
  const payload = {
    approvalSessions: [pendingApprovalSession()],
  };
  const fetch = fakeFetch([
    jsonResponse(201, created),
    jsonResponse(200, compared),
  ]);
  const client = createMcpApprovalEvidenceRecordClient({
    baseUrl: "local://api/v1",
    fetch,
  });

  assert.deepEqual(
    await client.create({
      recordId: "record-local-1",
      label: "local-baseline",
      payload,
    }),
    created,
  );
  assert.deepEqual(await client.compare("record-local-1", payload), compared);
  assert.equal(fetch.calls[0].url, "local://api/v1/mcp/approval-evidence/records");
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), {
    recordId: "record-local-1",
    label: "local-baseline",
    payload,
  });
  assert.equal(
    fetch.calls[1].url,
    "local://api/v1/mcp/approval-evidence/records/record-local-1/compare",
  );
  assert.deepEqual(JSON.parse(fetch.calls[1].init.body), { payload });
});

test("rejects malformed success bodies and invalid JSON", async () => {
  const malformedRecord = {
    ...validRecord(),
    localOnly: false,
  };
  const fetch = fakeFetch([
    jsonResponse(200, { localOnly: true, records: [malformedRecord] }),
    jsonResponse(200, {
      localOnly: false,
      differences: [],
    }),
    textResponse(200, "{", { "content-type": "application/json" }),
  ]);
  const client = createMcpApprovalEvidenceRecordClient({
    baseUrl: "local://api/v1",
    fetch,
  });

  await assert.rejects(
    client.list(),
    (error) => {
      assert.equal(error instanceof ApiResponseValidationError, true);
      assert.deepEqual(error.issues.map((issue) => issue.path), ["records.0.localOnly"]);
      return true;
    },
  );

  await assert.rejects(
    client.compare({ leftRecordId: "mcpae_left", rightRecordId: "mcpae_right" }),
    (error) => {
      assert.equal(error instanceof ApiResponseValidationError, true);
      assert.deepEqual(error.issues.map((issue) => issue.path), ["localOnly"]);
      return true;
    },
  );

  await assert.rejects(
    client.get("mcpae_localNotesReview"),
    (error) => {
      assert.equal(error instanceof ApiResponseParseError, true);
      assert.equal(error.status, 200);
      return true;
    },
  );
});

test("keeps duplicate and not-found errors typed", async () => {
  const fetch = fakeFetch([
    jsonResponse(409, {
      error: {
        code: "mcp_approval_evidence_record_duplicate",
        message: "MCP approval evidence record already exists.",
        details: {
          recordId: "mcpae_localNotesReview",
        },
      },
    }),
    jsonResponse(404, {
      error: {
        code: "mcp_approval_evidence_record_not_found",
        message: "MCP approval evidence record was not found.",
        details: {
          recordId: "mcpae_missing",
        },
      },
    }),
  ]);
  const client = createMcpApprovalEvidenceRecordClient({
    baseUrl: "local://api/v1",
    fetch,
  });

  const duplicate = await toApiResult(client.create(validRecord()));
  const missing = await toApiResult(client.get("mcpae_missing"));

  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.error instanceof ApiHttpError, true);
  assert.equal(duplicate.error.status, 409);
  assert.equal(duplicate.error.apiCode, "mcp_approval_evidence_record_duplicate");
  assert.deepEqual(duplicate.error.details, { recordId: "mcpae_localNotesReview" });

  assert.equal(missing.ok, false);
  assert.equal(missing.error instanceof ApiHttpError, true);
  assert.equal(missing.error.status, 404);
  assert.equal(missing.error.apiCode, "mcp_approval_evidence_record_not_found");
  assert.deepEqual(missing.error.details, { recordId: "mcpae_missing" });
});

test("keeps response clone boundaries isolated", async () => {
  const responseRecord = validRecord();
  const fetch = fakeFetch([
    jsonResponse(200, { record: responseRecord }),
  ]);
  const client = createMcpApprovalEvidenceRecordClient({
    baseUrl: "local://api/v1/",
    fetch,
  });

  const pending = client.get("mcpae_localNotesReview");
  responseRecord.metadata.clientLabel = "mutated";
  const response = await pending;
  const record = response.record;

  assert.equal(record.metadata.clientLabel, "local-notes");
  assert.equal(Object.isFrozen(record), true);
  assert.equal(Object.isFrozen(record.sessionRefs), true);
  assert.equal(Object.isFrozen(record.metadata), true);
  assert.throws(() => {
    record.localOnly = false;
  }, TypeError);
  assert.throws(() => {
    record.sessionRefs.push({});
  }, TypeError);
});

function validRecord(id = "mcpae_localNotesReview") {
  return {
    schemaVersion: "mcp-approval-evidence/v1",
    id,
    generatedAt: "2026-04-27T13:00:00.000Z",
    workspaceId: "wsp_localReview",
    localOnly: true,
    policyDecision: "require_approval",
    approvalStatus: "approved",
    sessionRefs: [
      {
        sessionId: "approval_localnotes_primary",
        role: "subject",
        status: "approved",
      },
      {
        sessionId: "approval_localnotes_related",
        role: "related",
        status: "expired",
      },
    ],
    auditEventRefs: [
      {
        eventId: "audit_0001",
        type: "policy_decision",
        occurredAt: "2026-04-27T12:58:00.000Z",
      },
      {
        eventId: "audit_0002",
        type: "operation_succeeded",
        occurredAt: "2026-04-27T12:59:00.000Z",
      },
    ],
    redactionSummary: {
      redacted: true,
      redactedFieldCount: 1,
      redactedPaths: ["request.arguments.previewText"],
      retainedMetadataKeys: ["clientLabel", "workflowId"],
    },
    metadata: {
      clientLabel: "local-notes",
      workflowId: "wf_offline_review",
      retryCount: 0,
    },
  };
}

function pendingApprovalSession() {
  return {
    id: "approval-pending",
    status: "pending",
    createdAt: "2026-04-27T00:00:01.000Z",
    updatedAt: "2026-04-27T00:00:01.000Z",
    request: {
      toolName: "draft_local_note",
      arguments: {
        targetPath: "notes/local-plan.md",
      },
    },
  };
}

function routeRecord() {
  return {
    kind: "mcp-approval-evidence.record",
    schemaVersion: "mcp-approval-evidence-record/v1",
    localOnly: true,
    redacted: true,
    recordId: "record-local-1",
    label: "local-baseline",
    createdAt: "2026-04-27T13:00:00.000Z",
    updatedAt: "2026-04-27T13:00:00.000Z",
    fingerprint: `sha256:${"d".repeat(64)}`,
    baselineFingerprint: `sha256:${"e".repeat(64)}`,
  };
}

function fakeFetch(items) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const next = items.shift();
    if (next instanceof Error) {
      throw next;
    }
    if (next === undefined) {
      throw new Error("fake fetch response queue is empty");
    }
    return next;
  };
  fetch.calls = calls;
  return fetch;
}

function jsonResponse(status, body, headers = {}) {
  return textResponse(status, JSON.stringify(body), {
    "content-type": "application/json",
    ...headers,
  });
}

function textResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: statusTextFor(status),
    headers: headersLike(headers),
    async text() {
      return body;
    },
  };
}

function headersLike(headers) {
  const normalized = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    get(name) {
      return normalized.get(name.toLowerCase()) ?? null;
    },
  };
}

function statusTextFor(status) {
  if (status === 200) {
    return "OK";
  }
  if (status === 201) {
    return "Created";
  }
  if (status === 404) {
    return "Not Found";
  }
  if (status === 409) {
    return "Conflict";
  }
  return "";
}
