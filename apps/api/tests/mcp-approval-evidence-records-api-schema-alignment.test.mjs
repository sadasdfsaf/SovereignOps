import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createInMemoryMcpApprovalEvidenceRecordStore,
  createMcpApprovalEvidenceRecordRoutes,
} from "../src/mcpApprovalEvidenceRecordRoutes.ts";
import { createApiRouter } from "../src/router.ts";
import {
  MCP_APPROVAL_EVIDENCE_RECORD_API_REQUESTS_SCHEMA_VERSION,
  validateMcpApprovalEvidenceRecordApiRequestBundle,
} from "../../../packages/schemas/src/mcpApprovalEvidenceRecord.ts";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDirectory, "../../..");
const bundlePath = resolveWorkspacePath("examples/mcp/approval-evidence-records-requests.json");

test("public MCP approval evidence records API bundle validates with the shared schema", () => {
  const bundle = readJson(bundlePath);
  const result = validateMcpApprovalEvidenceRecordApiRequestBundle(bundle);

  assert.equal(bundle.schemaVersion, MCP_APPROVAL_EVIDENCE_RECORD_API_REQUESTS_SCHEMA_VERSION);
  assert.equal(result.ok, true, formatIssues(result.issues));
  assert.deepEqual(result.issues, []);
  assert.notEqual(result.value, bundle);
  assert.notEqual(result.value.requests, bundle.requests);
  assert.notEqual(result.value.requests[0].request, bundle.requests[0].request);
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value.requests), true);
  assert.equal(Object.isFrozen(result.value.requests[0].request), true);
  assert.throws(() => {
    result.value.requests[0].id = "changed";
  }, TypeError);
});

test("materialized MCP approval evidence record fixtures replay through current API routes", async () => {
  const bundle = readJson(bundlePath);
  const createFixture = findFixture(bundle, "api_mcp_approval_evidence_records_create_local_notes");
  const listFixture = findFixture(bundle, "api_mcp_approval_evidence_records_list_local_notes");
  const getFixture = findFixture(bundle, "api_mcp_approval_evidence_records_get_local_notes");
  const compareFixture = findFixture(bundle, "api_mcp_approval_evidence_records_compare_local_notes");
  const sourceRecord = structuredClone(createFixture.request.body.record);
  const createBody = {
    recordId: sourceRecord.id,
    metadata: sourceRecord.metadata,
    payload: toPreviewPayload(sourceRecord),
  };
  const before = structuredClone(createBody);
  const router = createApiRouter(createMcpApprovalEvidenceRecordRoutes({
    store: createInMemoryMcpApprovalEvidenceRecordStore(),
    now: () => bundle.generatedAt,
  }));

  const createResponse = await router.dispatch({
    method: createFixture.route.method,
    path: createFixture.route.path,
    headers: createFixture.request.headers,
    body: createBody,
  });
  assertJsonResponse(createResponse, createFixture.expect.status);
  assert.deepEqual(createBody, before);
  assert.equal(createResponse.body.kind, "mcp-approval-evidence.record.created");
  assert.equal(createResponse.body.schemaVersion, createFixture.expect.schemaVersion);
  assert.equal(createResponse.body.record.recordId, createFixture.expect.recordId);
  assert.equal(Object.isFrozen(createResponse.body), true);
  assert.equal(Object.isFrozen(createResponse.body.record), true);
  assert.equal(Object.isFrozen(createResponse.body.record.baseline), true);

  const listResponse = await router.dispatch({
    method: listFixture.route.method,
    path: listFixture.route.path,
    headers: listFixture.request.headers,
  });
  assertJsonResponse(listResponse, listFixture.expect.status);
  assert.equal(listResponse.body.kind, "mcp-approval-evidence.record.list");
  assert.equal(listResponse.body.schemaVersion, createFixture.expect.schemaVersion);
  assert.equal(listResponse.body.pagination.returnedRecordCount, listFixture.expect.recordCount);
  assert.equal(listResponse.body.records[0].statuses.approved, listFixture.expect.statuses.approved);

  const getResponse = await router.dispatch({
    method: getFixture.route.method,
    path: getFixture.route.path,
    headers: getFixture.request.headers,
  });
  assertJsonResponse(getResponse, getFixture.expect.status);
  assert.equal(getResponse.body.kind, "mcp-approval-evidence.record.read");
  assert.equal(getResponse.body.schemaVersion, getFixture.expect.schemaVersion);
  assert.equal(getResponse.body.record.recordId, getFixture.expect.recordId);

  const compareResponse = await router.dispatch({
    method: compareFixture.route.method,
    path: `${createFixture.route.path}/${sourceRecord.id}/compare`,
    headers: compareFixture.request.headers,
    body: {
      payload: toPreviewPayload(compareFixture.request.body.rightRecord),
    },
  });
  assertJsonResponse(compareResponse, compareFixture.expect.status);
  assert.equal(compareResponse.body.kind, "mcp-approval-evidence.record.compare");
  assert.equal(compareResponse.body.schemaVersion, createFixture.expect.schemaVersion);
  assert.equal(compareResponse.body.equivalent, compareFixture.expect.matches);
  assert.equal(compareResponse.body.summary.changedEvidenceCount, compareFixture.expect.differenceCount);

  const duplicateResponse = await router.dispatch({
    method: createFixture.route.method,
    path: createFixture.route.path,
    headers: createFixture.request.headers,
    body: createBody,
  });
  assertJsonError(duplicateResponse, 409, "mcp_approval_evidence_record_duplicate");
});

function toPreviewPayload(record) {
  return {
    approvalSessions: [
      structuredClone(record),
    ],
  };
}

function findFixture(bundle, id) {
  const fixture = bundle.requests.find((request) => request.id === id);
  assert.ok(fixture, `Missing fixture ${id}`);
  return fixture;
}

function resolveWorkspacePath(path) {
  const resolved = resolve(workspaceRoot, path);
  const rel = relative(workspaceRoot, resolved);

  assert.equal(rel.startsWith(".."), false, `Fixture path escaped workspace: ${path}`);
  assert.equal(isAbsolute(rel), false, `Fixture path escaped workspace: ${path}`);
  return resolved;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assertJsonResponse(response, status) {
  assert.equal(response.status, status);
  assert.match(response.headers["content-type"], /^application\/json/);
}

function assertJsonError(response, status, code) {
  assertJsonResponse(response, status);
  assert.deepEqual(Object.keys(response.body), ["error"]);
  assert.equal(response.body.error.code, code);
}

function formatIssues(issues) {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
}
