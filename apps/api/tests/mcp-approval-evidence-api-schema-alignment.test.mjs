import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createMcpApprovalEvidenceRoutes,
} from "../src/mcpApprovalEvidenceRoutes.ts";
import { createApiRouter } from "../src/router.ts";
import {
  MCP_APPROVAL_EVIDENCE_PREVIEW_REQUESTS_SCHEMA_VERSION,
  validateMcpApprovalEvidencePreviewRequestBundle,
} from "../../../packages/schemas/src/mcpApprovalEvidence.ts";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDirectory, "../../..");
const bundlePath = resolveWorkspacePath("examples/mcp/approval-evidence-preview-requests.json");

test("public MCP approval evidence preview API bundle validates with the shared schema", () => {
  const bundle = readJson(bundlePath);
  const result = validateMcpApprovalEvidencePreviewRequestBundle(bundle);

  assert.equal(bundle.schemaVersion, MCP_APPROVAL_EVIDENCE_PREVIEW_REQUESTS_SCHEMA_VERSION);
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

test("materialized MCP approval evidence preview fixture replays through the current API route", async () => {
  const bundle = readJson(bundlePath);
  const fixture = findFixture(bundle, "api_mcp_approval_evidence_preview_local_tasks");
  const body = materializePreviewBody(fixture.request.body);
  const before = structuredClone(body);
  const router = createApiRouter(createMcpApprovalEvidenceRoutes());

  const response = await router.dispatch({
    method: fixture.route.method,
    path: fixture.route.path,
    headers: fixture.request.headers,
    body,
  });

  assertJsonResponse(response, fixture.expect.status);
  assert.deepEqual(body, before);
  assert.equal(response.body.kind, fixture.expect.kind);
  assert.equal(response.body.schemaVersion, fixture.expect.schemaVersion);
  assert.equal(response.body.summary.approvalSessionCount, fixture.expect.approvalSessionCount);
  assert.equal(response.body.summary.returnedEvidenceCount, fixture.expect.entryCount);
  assert.equal(response.body.summary.statuses.approved, fixture.expect.statuses.approved);
  assert.equal(response.body.summary.statuses.approval_required, fixture.expect.statuses.pending);
  assert.equal(JSON.stringify(response.body).includes("fixture-api-token-001"), false);
  assert.equal(JSON.stringify(response.body).includes("fixture-session-token-002"), false);
  assert.equal(Object.isFrozen(response.body), true);
  assert.equal(Object.isFrozen(response.body.evidence), true);
  assert.equal(Object.isFrozen(response.body.evidence[0]), true);
});

test("materialized MCP approval evidence preview route keeps validation errors stable", async () => {
  const bundle = readJson(bundlePath);
  const fixture = findFixture(bundle, "api_mcp_approval_evidence_preview_local_tasks");
  const body = materializePreviewBody(fixture.request.body);
  body.approvalSessions[0].status = "closed";
  const router = createApiRouter(createMcpApprovalEvidenceRoutes());

  const response = await router.dispatch({
    method: fixture.route.method,
    path: fixture.route.path,
    headers: fixture.request.headers,
    body,
  });

  assertJsonError(response, 400, "validation_failed");
  assert.deepEqual(response.body.error.details, {
    path: "body.approvalSessions.0.status",
  });
});

function materializePreviewBody(body) {
  const materialized = structuredClone(body);
  delete materialized.generatedAt;
  return materialized;
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
