import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  ApiHttpError,
  ApiNetworkError,
  ApiRequestValidationError,
  ApiResponseParseError,
  ApiResponseValidationError,
  createMcpApprovalEvidenceClient,
  toApiResult,
} from "../src/index.ts";
import {
  validateMcpApprovalEvidencePreviewRequestBundle,
} from "../../schemas/src/mcpApprovalEvidence.ts";

const schemasFixturesDir = fileURLToPath(new URL("../../schemas/fixtures/", import.meta.url));

const redaction = "[REDACTED]";
const secretPlaceholder = "[redacted:token:2b5f]";
const responseFingerprint = `sha256:${"a".repeat(64)}`;
const toolFingerprint = `sha256:${"b".repeat(64)}`;
const approvalFingerprint = `sha256:${"c".repeat(64)}`;

test("previews MCP approval evidence with stable request body and headers", async () => {
  const request = validRequest();
  const response = validPreview();
  const fetch = fakeFetch([
    jsonResponse(200, response),
  ]);
  const client = createMcpApprovalEvidenceClient({
    baseUrl: "local://api/v1",
    apiKey: "[REDACTED]",
    headers: {
      "x-sdk-test": "mcp-approval-evidence",
    },
    fetch,
  });

  const preview = await client.preview(request);

  assert.deepEqual(preview, response);
  assert.equal(fetch.calls.length, 1);
  assert.equal(
    fetch.calls[0].url,
    "local://api/v1/mcp/approval-evidence/preview",
  );
  assert.equal(fetch.calls[0].init.method, "POST");
  assert.equal(fetch.calls[0].init.headers.accept, "application/json");
  assert.equal(fetch.calls[0].init.headers.authorization, "Bearer [REDACTED]");
  assert.equal(fetch.calls[0].init.headers["content-type"], "application/json");
  assert.equal(fetch.calls[0].init.headers["x-sdk-test"], "mcp-approval-evidence");
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), request);
});

test("validates public MCP approval evidence request bundle and drives SDK preview with fixture data", async () => {
  const bundle = await validatedPublicBundle(
    "mcp-approval-evidence-preview-requests.valid.json",
    validateMcpApprovalEvidencePreviewRequestBundle,
  );
  const invalidBundle = await readSchemaFixtureJson("mcp-approval-evidence-preview-requests.invalid.json");
  const invalidResult = validateMcpApprovalEvidencePreviewRequestBundle(invalidBundle);
  const fixture = fixtureRequest(bundle, "api_mcp_approval_evidence_preview_local_tasks");
  const request = previewRequestFromFixture(fixture);
  const response = previewResponseFromFixture(fixture);
  const fetch = fakeFetch([
    jsonResponse(fixture.expect.status, response),
  ]);
  const client = createMcpApprovalEvidenceClient({
    baseUrl: baseUrlForFixture(bundle),
    fetch,
  });

  const preview = await client.preview(request);

  assert.equal(invalidResult.ok, false);
  assert.deepEqual(
    [
      "fixtureRefs[0].fixturePath",
      "requests[0].request.headers.authorization",
      "requests[0].request.body.approvalSessions[0].metadata.source",
      "requests[1].id",
    ].every((path) => invalidResult.issues.some((issue) => issue.path === path)),
    true,
  );
  assert.equal(fixture.route.method, "POST");
  assert.equal(fixture.route.path, "/v1/mcp/approval-evidence/preview");
  assert.equal(fetch.calls[0].url, "local://mcp-approval-evidence-api/v1/mcp/approval-evidence/preview");
  assert.equal(fetch.calls[0].init.method, fixture.route.method);
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), request);
  assert.equal(preview.kind, fixture.expect.kind);
  assert.equal(preview.schemaVersion, fixture.expect.schemaVersion);
  assert.equal(preview.summary.approvalSessionCount, fixture.expect.approvalSessionCount);
  assert.equal(preview.summary.returnedEvidenceCount, fixture.expect.entryCount);
  assert.equal(preview.evidence.length, fixture.expect.entryCount);
});

test("supports snapshot request bodies and list-style filters", async () => {
  const request = {
    snapshot: {
      approvalSessions: [pendingApprovalSession()],
      toolAuditRecords: [toolApprovalRecord()],
    },
    filters: {
      sources: ["approval_session"],
      statuses: ["approval_required"],
      subjectTypes: ["approval_session"],
      actorIds: ["actor-1"],
      limit: 1,
    },
  };
  const response = {
    ...validPreview(),
    filters: request.filters,
    summary: {
      ...validPreview().summary,
      returnedEvidenceCount: 1,
      filteredEvidenceCount: 1,
      sources: {
        approval_session: 1,
      },
      statuses: {
        approval_required: 1,
      },
    },
    evidence: [approvalEvidenceItem()],
  };
  const fetch = fakeFetch([
    jsonResponse(200, response),
  ]);
  const client = createMcpApprovalEvidenceClient({
    baseUrl: "local://api/v1/",
    fetch,
  });

  const preview = await client.previewEvidence(request);

  assert.deepEqual(preview, response);
  assert.equal(
    fetch.calls[0].url,
    "local://api/v1/mcp/approval-evidence/preview",
  );
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), request);
});

test("validates MCP approval evidence requests before fetch is called", async () => {
  const fetch = fakeFetch([]);
  const client = createMcpApprovalEvidenceClient({
    baseUrl: "local://api/v1",
    fetch,
  });

  await assert.rejects(
    client.preview({
      ...validRequest(),
      unexpected: true,
    }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(error.issues.map((issue) => issue.path), ["unexpected"]);
      return true;
    },
  );

  await assert.rejects(
    client.preview({
      snapshot: {
        approvalSessions: [
          {
            ...pendingApprovalSession(),
            status: "closed",
            request: ["not an object"],
            actor: {
              id: "",
              roles: ["author", ""],
            },
          },
        ],
        toolAuditRecords: [
          {
            ...toolApprovalRecord(),
            type: "tool_call_unknown",
            metadata: {
              count: Number.POSITIVE_INFINITY,
            },
          },
        ],
        resourceAuditRecords: [
          {
            id: "resource-invalid",
            timestamp: "2026-04-27T00:00:03.000Z",
            type: "policy_decision",
          },
        ],
      },
      filters: {
        sources: ["unknown"],
      },
    }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(
        error.issues.map((issue) => issue.path),
        [
          "filters.sources.0",
          "snapshot.approvalSessions.0.status",
          "snapshot.approvalSessions.0.request",
          "snapshot.approvalSessions.0.actor.id",
          "snapshot.approvalSessions.0.actor.roles.1",
          "snapshot.toolAuditRecords.0.type",
          "snapshot.toolAuditRecords.0.metadata.count",
          "snapshot.resourceAuditRecords.0",
        ],
      );
      return true;
    },
  );

  await assert.rejects(
    client.preview({
      snapshot: {
        approvalSessions: [pendingApprovalSession()],
      },
      approvalSessions: [pendingApprovalSession()],
    }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(error.issues.map((issue) => issue.path), ["approvalSessions"]);
      return true;
    },
  );

  assert.equal(fetch.calls.length, 0);
});

test("keeps malformed success bodies and HTTP errors typed", async () => {
  const malformed = validPreview();
  malformed.redacted = false;
  delete malformed.summary.returnedEvidenceCount;
  malformed.evidence[0].fingerprint = "not-a-fingerprint";
  const fetch = fakeFetch([
    jsonResponse(200, malformed),
    jsonResponse(422, {
      error: {
        code: "validation_failed",
        message: "Approval evidence preview request is invalid.",
        details: {
          path: "body.approvalSessions.0.status",
        },
      },
    }),
  ]);
  const client = createMcpApprovalEvidenceClient({
    baseUrl: "local://api/v1",
    fetch,
  });

  await assert.rejects(
    client.preview(validRequest()),
    (error) => {
      assert.equal(error instanceof ApiResponseValidationError, true);
      assert.deepEqual(
        error.issues.map((issue) => issue.path),
        ["redacted", "summary.returnedEvidenceCount", "evidence.0.fingerprint"],
      );
      return true;
    },
  );

  const result = await toApiResult(client.preview(validRequest()));

  assert.equal(result.ok, false);
  assert.equal(result.error instanceof ApiHttpError, true);
  assert.equal(result.error.status, 422);
  assert.equal(result.error.apiCode, "validation_failed");
  assert.deepEqual(result.error.details, { path: "body.approvalSessions.0.status" });
});

test("keeps invalid JSON and fetch failures typed", async () => {
  const invalidJsonClient = createMcpApprovalEvidenceClient({
    baseUrl: "local://api/v1",
    fetch: fakeFetch([
      textResponse(200, "{", { "content-type": "application/json" }),
    ]),
  });

  await assert.rejects(
    invalidJsonClient.preview(validRequest()),
    (error) => {
      assert.equal(error instanceof ApiResponseParseError, true);
      assert.equal(error.code, "SO_API_RESPONSE_PARSE_ERROR");
      assert.equal(error.status, 200);
      return true;
    },
  );

  const networkClient = createMcpApprovalEvidenceClient({
    baseUrl: "local://api/v1",
    fetch: fakeFetch([new Error("offline")]),
  });
  const networkResult = await toApiResult(networkClient.preview(validRequest()));

  assert.equal(networkResult.ok, false);
  assert.equal(networkResult.error instanceof ApiNetworkError, true);
  assert.equal(networkResult.error.code, "SO_API_NETWORK_ERROR");
});

test("keeps request and response clone boundaries isolated", async () => {
  const request = validRequest();
  const response = validPreview();
  const fetch = fakeFetch([
    jsonResponse(200, response),
  ]);
  const client = createMcpApprovalEvidenceClient({
    baseUrl: "local://api/v1/",
    fetch,
  });

  const pending = client.preview(request);
  request.approvalSessions[0].request.arguments.targetPath = "[redacted:path:mutated]";
  response.evidence[0].arguments.targetPath = "mutated";
  const preview = await pending;

  assert.equal(
    JSON.parse(fetch.calls[0].init.body).approvalSessions[0].request.arguments.targetPath,
    "[redacted:path:7a9c]",
  );
  assert.equal(preview.evidence[0].arguments.targetPath, redaction);
  assert.equal(Object.isFrozen(preview), true);
  assert.equal(Object.isFrozen(preview.evidence), true);
  assert.equal(Object.isFrozen(preview.evidence[0].arguments), true);
  assert.throws(() => {
    preview.redacted = false;
  }, TypeError);
  assert.throws(() => {
    preview.evidence.push({});
  }, TypeError);
});

test("uses redaction-safe examples for approval evidence previews", () => {
  const requestText = JSON.stringify(validRequest());
  const responseText = JSON.stringify(validPreview());

  assert.match(requestText, /\[redacted:path:[^\]]+\]/);
  assert.match(requestText, /\[redacted:token:[^\]]+\]/);
  assert.match(responseText, /\[REDACTED\]/);
  assert.equal(responseText.includes(secretPlaceholder), false);
  assert.doesNotMatch(`${requestText}\n${responseText}`, /raw-token|local-secret|user@example\.test/);
  assert.equal(validPreview().redacted, true);
  assert.equal(
    validPreview().evidence.every((item) =>
      JSON.stringify(item).includes(redaction) || item.source === "approval_session"),
    true,
  );
});

function validRequest() {
  return {
    approvalSessions: [pendingApprovalSession()],
    toolAuditRecords: [toolApprovalRecord()],
    filters: {
      statuses: ["approval_required", "requested"],
    },
  };
}

function validPreview() {
  return {
    kind: "mcp-approval-evidence.preview",
    schemaVersion: "mcp-approval-evidence-preview/v1",
    localOnly: true,
    redacted: true,
    fingerprint: responseFingerprint,
    filters: {
      statuses: ["approval_required", "requested"],
    },
    summary: {
      inputRecordCount: 2,
      totalEvidenceCount: 2,
      returnedEvidenceCount: 2,
      filteredEvidenceCount: 0,
      approvalSessionCount: 1,
      auditRecordCount: 1,
      approvalRequiredCount: 2,
      terminalDecisionCount: 0,
      sources: {
        approval_session: 1,
        tool_audit: 1,
      },
      statuses: {
        approval_required: 2,
      },
    },
    evidence: [
      toolEvidenceItem(),
      approvalEvidenceItem(),
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
        targetPath: "[redacted:path:7a9c]",
        apiKey: secretPlaceholder,
        visible: "keep-approval-value",
      },
    },
    actor: {
      id: "actor-1",
      roles: ["author"],
    },
    reason: "local approval required",
    ruleId: "local-rule",
    metadata: {
      token: secretPlaceholder,
      visible: "keep-metadata-value",
    },
  };
}

function toolApprovalRecord() {
  return {
    id: "tool-approval",
    timestamp: "2026-04-27T00:00:02.000Z",
    type: "tool_call_approval_required",
    toolName: "draft_document_patch",
    actorId: "actor-1",
    decision: "require_approval",
    reason: "local review needs redacted token",
    arguments: {
      targetPath: "[redacted:path:7a9c]",
      apiKey: secretPlaceholder,
    },
    metadata: {
      token: secretPlaceholder,
      source: "sdk-test",
    },
  };
}

function toolEvidenceItem() {
  return {
    id: "tool-approval",
    timestamp: "2026-04-27T00:00:02.000Z",
    source: "tool_audit",
    kind: "tool_approval_required",
    status: "approval_required",
    title: "Tool call requires approval",
    subject: {
      type: "tool",
      name: "draft_document_patch",
    },
    actorId: "actor-1",
    decision: "require_approval",
    reason: "local review needs token=[REDACTED]",
    arguments: {
      targetPath: redaction,
      apiKey: redaction,
    },
    metadata: {
      token: redaction,
      source: "sdk-test",
    },
    fingerprint: toolFingerprint,
  };
}

function approvalEvidenceItem() {
  return {
    id: "approval-pending",
    timestamp: "2026-04-27T00:00:01.000Z",
    source: "approval_session",
    kind: "approval_session_pending",
    status: "approval_required",
    title: "Approval session pending",
    subject: {
      type: "approval_session",
      id: "approval-pending",
    },
    actorId: "actor-1",
    request: {
      toolName: "draft_document_patch",
      arguments: {
        targetPath: redaction,
        apiKey: redaction,
        visible: "keep-approval-value",
      },
    },
    metadata: {
      token: redaction,
      visible: "keep-metadata-value",
    },
    fingerprint: approvalFingerprint,
  };
}

function previewRequestFromFixture(fixture) {
  const { generatedAt, ...request } = fixture.request.body;
  assert.equal(typeof generatedAt, "string");
  return request;
}

function previewResponseFromFixture(fixture) {
  const sessions = fixture.request.body.approvalSessions;
  const evidence = sessions.map((session, index) => ({
    id: session.id,
    timestamp: session.updatedAt,
    source: "approval_session",
    kind: session.status === "approved" ? "approval_session_approved" : "approval_session_pending",
    status: session.status === "approved" ? "approved" : "approval_required",
    title: session.status === "approved" ? "Approval session approved" : "Approval session pending",
    subject: {
      type: "approval_session",
      id: session.id,
    },
    actorId: session.actor?.id,
    request: redactSecretFields(session.request),
    metadata: redactSecretFields(session.metadata ?? {}),
    fingerprint: `sha256:${String(index + 1).repeat(64)}`,
  }));

  return {
    kind: fixture.expect.kind,
    schemaVersion: fixture.expect.schemaVersion,
    localOnly: true,
    redacted: true,
    fingerprint: responseFingerprint,
    filters: {},
    summary: {
      inputRecordCount: sessions.length,
      totalEvidenceCount: fixture.expect.entryCount,
      returnedEvidenceCount: fixture.expect.entryCount,
      filteredEvidenceCount: 0,
      approvalSessionCount: fixture.expect.approvalSessionCount,
      auditRecordCount: 0,
      approvalRequiredCount: sessions.filter((session) => session.status === "pending").length,
      terminalDecisionCount: sessions.filter((session) => session.status !== "pending").length,
      sources: {
        approval_session: fixture.expect.entryCount,
      },
      statuses: fixture.expect.statuses,
    },
    evidence,
  };
}

function redactSecretFields(value) {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecretFields(item));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        /token/i.test(key) ? redaction : redactSecretFields(nested),
      ]),
    );
  }
  return value;
}

async function validatedPublicBundle(file, validator) {
  const bundle = await readSchemaFixtureJson(file);
  const result = validator(bundle);

  assert.equal(result.ok, true, formatIssues(result.issues));
  assert.equal(Object.isFrozen(result.value), true);
  return result.value;
}

async function readSchemaFixtureJson(file) {
  return JSON.parse(await readFile(join(schemasFixturesDir, file), "utf8"));
}

function fixtureRequest(bundle, id) {
  const fixture = bundle.requests.find((request) => request.id === id);
  assert.notEqual(fixture, undefined);
  return fixture;
}

function baseUrlForFixture(bundle) {
  return new URL("v1/", bundle.apiBase.endsWith("/") ? bundle.apiBase : `${bundle.apiBase}/`).href;
}

function formatIssues(issues) {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  if (status === 422) {
    return "Unprocessable Content";
  }
  return "";
}
