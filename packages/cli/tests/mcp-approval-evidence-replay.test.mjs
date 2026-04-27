import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { runCli } from "../src/index.ts";
import {
  isMcpApprovalEvidenceReplayCommand,
  runMcpApprovalEvidenceReplayCli,
} from "../src/mcpApprovalEvidenceReplay.ts";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const fixturePath = fileURLToPath(
  new URL("../../../examples/mcp/approval-evidence-preview-requests.json", import.meta.url),
);
const tempDir = fileURLToPath(
  new URL("../.tmp-mcp-approval-evidence-replay/", import.meta.url),
);

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

test("replays MCP approval evidence preview fixtures through the local dispatcher", async () => {
  const result = await runMcpApprovalEvidenceReplayCli([
    "mcp",
    "approval",
    "evidence",
    "replay",
    "--fixture",
    fixturePath,
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.kind, "mcp-approval-evidence-preview-replay");
  assert.equal(payload.schemaVersion, "mcp-approval-evidence-preview-requests.v1");
  assert.deepEqual(payload.endpoint, {
    method: "POST",
    path: "/v1/mcp/approval-evidence/preview",
  });
  assert.equal(payload.fixture.path, "examples/mcp/approval-evidence-preview-requests.json");
  assert.equal(payload.totalRequests, 1);
  assert.equal(payload.replayedRequests, 1);
  assert.equal(payload.passedRequests, 1);
  assert.equal(payload.failedRequests, 0);
  assert.deepEqual(payload.summary.methods, { POST: 1 });
  assert.deepEqual(payload.summary.routes, {
    "/v1/mcp/approval-evidence/preview": 1,
  });
  assert.deepEqual(payload.summary.actualStatuses, { 200: 1 });
  assert.deepEqual(payload.summary.expectedStatuses, { 200: 1 });
  assert.deepEqual(payload.summary.mismatches, {});

  const request = payload.requests[0];
  assert.equal(request.id, "api_mcp_approval_evidence_preview_local_tasks");
  assert.equal(request.actual.status, 200);
  assert.equal(request.matches.status, true);
  assert.equal(request.matches.expectation, true);
  assert.equal(request.actual.body.kind, "mcp-approval-evidence.preview");
  assert.equal(request.actual.body.summary.approvalSessionCount, 2);
  assert.equal(request.actual.body.summary.entryCount, 2);
  assert.equal(request.actual.body.summary.redactionCount, 2);
  assert.deepEqual(request.actual.body.summary.statuses, {
    approved: 1,
    pending: 1,
  });
  assert.deepEqual(
    request.actual.body.entries.map((entry) => [entry.source, entry.subject.type]),
    [
      ["approval_session", "approval_session"],
      ["approval_session", "approval_session"],
    ],
  );
});

test("package entrypoint routes MCP approval evidence replay commands", async () => {
  const result = await runCli([
    "mcp",
    "approval-evidence",
    "replay",
    "--fixture",
    fixturePath,
    "--id",
    "api_mcp_approval_evidence_preview_local_tasks",
  ]);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.kind, "mcp-approval-evidence-preview-replay");
  assert.deepEqual(payload.filters, {
    id: "api_mcp_approval_evidence_preview_local_tasks",
  });
  assert.equal(payload.replayedRequests, 1);
});

test("detects MCP approval evidence replay commands", () => {
  assert.equal(isMcpApprovalEvidenceReplayCommand(["mcp", "approval", "evidence", "replay"]), true);
  assert.equal(isMcpApprovalEvidenceReplayCommand(["mcp", "approval-evidence", "replay"]), true);
  assert.equal(isMcpApprovalEvidenceReplayCommand(["mcp-approval-evidence", "replay"]), true);
  assert.equal(isMcpApprovalEvidenceReplayCommand(["mcp", "api", "replay"]), false);
});

test("reports malformed MCP approval evidence replay fixtures as JSON-only errors", async () => {
  const malformedJsonPath = await writeTextFixture("malformed.json", "{");
  const invalidShapePath = await writeFixture("missing-method.json", {
    schemaVersion: "mcp-approval-evidence-preview-requests.v1",
    generatedAt: "2026-04-27T12:15:00.000Z",
    requests: [
      {
        id: "api_missing_method",
        route: {
          path: "/v1/mcp/approval-evidence/preview",
        },
        request: {
          body: {},
        },
        expect: {
          status: 400,
        },
      },
    ],
  });
  const missingBodyPath = await writeFixture("missing-body.json", {
    schemaVersion: "mcp-approval-evidence-preview-requests.v1",
    generatedAt: "2026-04-27T12:15:00.000Z",
    requests: [
      {
        id: "api_missing_body",
        route: {
          method: "POST",
          path: "/v1/mcp/approval-evidence/preview",
        },
        request: {},
        expect: {
          status: 400,
        },
      },
    ],
  });

  const malformedJson = await runMcpApprovalEvidenceReplayCli([
    "mcp-approval-evidence",
    "replay",
    "--fixture",
    malformedJsonPath,
  ]);
  const invalidShape = await runMcpApprovalEvidenceReplayCli([
    "mcp-approval-evidence",
    "replay",
    "--fixture",
    invalidShapePath,
  ]);
  const missingBody = await runMcpApprovalEvidenceReplayCli([
    "mcp-approval-evidence",
    "replay",
    "--fixture",
    missingBodyPath,
  ]);

  assert.ok(malformedJson);
  assert.ok(invalidShape);
  assert.ok(missingBody);
  const malformedPayload = JSON.parse(malformedJson.stderr);
  const invalidPayload = JSON.parse(invalidShape.stderr);
  const missingBodyPayload = JSON.parse(missingBody.stderr);

  assert.equal(malformedJson.exitCode, 2);
  assert.equal(malformedJson.stdout, "");
  assert.equal(malformedPayload.error.code, "invalid_fixture_json");
  assert.equal(invalidShape.exitCode, 2);
  assert.equal(invalidShape.stdout, "");
  assert.equal(invalidPayload.error.code, "invalid_fixture");
  assert.match(invalidPayload.error.message, /route\.method/);
  assert.equal(missingBody.exitCode, 2);
  assert.equal(missingBody.stdout, "");
  assert.equal(missingBodyPayload.error.code, "invalid_fixture");
  assert.match(missingBodyPayload.error.message, /request\.body is required/);
});

test("rejects unsafe MCP approval evidence fixture paths as JSON-only errors", async () => {
  await mkdir(tempDir, { recursive: true });
  const directoryPath = path.join(tempDir, "directory.json");
  await mkdir(directoryPath, { recursive: true });
  const unsafeCases = [
    {
      fixture: path.resolve(workspaceRoot, "..", "outside.json"),
      message: /must stay inside/,
    },
    {
      fixture: directoryPath,
      code: "fixture_not_file",
      message: /must point to a file/,
    },
    {
      fixture: path.join(workspaceRoot, ".codex-private", "approval-evidence.json"),
      message: /private workspace/,
    },
    {
      fixture: path.resolve(workspaceRoot, "..", "sovereignops-codex-pack", "approval-evidence.json"),
      message: /plan-pack/,
    },
    {
      fixture: path.join(path.dirname(fixturePath), "missing-approval-evidence.json"),
      code: "fixture_not_found",
      message: /Fixture file was not found/,
    },
  ];

  for (const unsafeCase of unsafeCases) {
    const result = await runMcpApprovalEvidenceReplayCli([
      "mcp",
      "approval",
      "evidence",
      "replay",
      "--fixture",
      unsafeCase.fixture,
    ]);
    assert.ok(result);
    const payload = JSON.parse(result.stderr);

    assert.equal(result.exitCode, 2);
    assert.equal(result.stdout, "");
    assert.equal(payload.error.code, unsafeCase.code ?? "usage_error");
    assert.match(payload.error.message, unsafeCase.message);
  }
});

test("rejects MCP approval evidence fixtures for the wrong endpoint", async () => {
  const wrongEndpointPath = await writeFixture("wrong-endpoint.json", {
    schemaVersion: "mcp-approval-evidence-preview-requests.v1",
    generatedAt: "2026-04-27T12:20:00.000Z",
    requests: [
      {
        id: "api_wrong_endpoint",
        route: {
          method: "POST",
          path: "/v1/mcp/approval-evidence/missing",
        },
        request: {
          body: {
            approvalSessions: [],
          },
        },
        expect: {
          status: 404,
        },
      },
    ],
  });
  const result = await runMcpApprovalEvidenceReplayCli([
    "mcp-approval-evidence",
    "replay",
    "--fixture",
    wrongEndpointPath,
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stderr);

  assert.equal(result.exitCode, 2);
  assert.equal(result.stdout, "");
  assert.equal(payload.error.code, "invalid_fixture");
  assert.match(payload.error.message, /must target POST \/v1\/mcp\/approval-evidence\/preview/);
});

test("redacts secret-like values in MCP approval evidence request bodies", async () => {
  const result = await runMcpApprovalEvidenceReplayCli([
    "mcp",
    "approval",
    "evidence",
    "replay",
    "--fixture",
    fixturePath,
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stdout);
  const request = payload.requests[0];

  for (const secret of [
    "fixture-api-token-001",
    "local-preview-token-001",
    "fixture-session-token-002",
    "fixture-header-token",
  ]) {
    assert.equal(result.stdout.includes(secret), false, `stdout leaked ${secret}`);
  }

  assert.equal(request.request.headers.authorization, "[REDACTED]");
  assert.equal(
    request.request.body.approvalSessions[0].request.arguments.apiToken,
    "[REDACTED]",
  );
  assert.match(request.request.body.approvalSessions[0].request.arguments.note, /\[REDACTED\]/);
  assert.equal(request.request.body.approvalSessions[1].metadata.sessionToken, "[REDACTED]");
  assert.ok(request.redactions.length >= 4);
});

async function writeFixture(name, value) {
  return writeTextFixture(name, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeTextFixture(name, text) {
  await mkdir(tempDir, { recursive: true });
  const outputPath = path.join(tempDir, name);
  await writeFile(outputPath, text);
  return outputPath;
}
