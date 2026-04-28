import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { runCli } from "../src/index.ts";
import {
  isMcpApprovalEvidenceRecordsReplayCommand,
  runMcpApprovalEvidenceRecordsReplayCli,
} from "../src/mcpApprovalEvidenceRecordsReplay.ts";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const fixturePath = fileURLToPath(
  new URL("../../../examples/mcp/approval-evidence-records-requests.json", import.meta.url),
);
const tempDir = fileURLToPath(
  new URL("../.tmp-mcp-approval-evidence-records-replay/", import.meta.url),
);

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

test("replays MCP approval evidence records fixtures through the local dispatcher", async () => {
  const result = await runMcpApprovalEvidenceRecordsReplayCli([
    "mcp",
    "approval",
    "evidence",
    "records",
    "replay",
    "--fixture",
    fixturePath,
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.kind, "mcp-approval-evidence-records-replay");
  assert.equal(payload.schemaVersion, "mcp-approval-evidence-records-requests.v1");
  assert.equal(payload.fixture.path, "examples/mcp/approval-evidence-records-requests.json");
  assert.equal(payload.totalRequests, 4);
  assert.equal(payload.replayedRequests, 4);
  assert.equal(payload.passedRequests, 4);
  assert.equal(payload.failedRequests, 0);
  assert.deepEqual(payload.summary.endpoints, {
    compare: 1,
    create: 1,
    get: 1,
    list: 1,
  });
  assert.deepEqual(payload.summary.methods, { GET: 2, POST: 2 });
  assert.deepEqual(payload.summary.routes, {
    "/v1/mcp/approval-evidence/records": 2,
    "/v1/mcp/approval-evidence/records/aer_local_notes_001": 1,
    "/v1/mcp/approval-evidence/records/compare": 1,
  });
  assert.deepEqual(payload.summary.actualStatuses, { 200: 3, 201: 1 });
  assert.deepEqual(payload.summary.expectedStatuses, { 200: 3, 201: 1 });
  assert.deepEqual(payload.summary.mismatches, {});

  assert.deepEqual(
    payload.requests.map((request) => [
      request.id,
      request.endpoint,
      request.actual.status,
      request.matches.status,
      request.matches.expectation,
    ]),
    [
      [
        "api_mcp_approval_evidence_records_create_local_notes",
        "create",
        201,
        true,
        true,
      ],
      [
        "api_mcp_approval_evidence_records_list_local_notes",
        "list",
        200,
        true,
        true,
      ],
      [
        "api_mcp_approval_evidence_records_get_local_notes",
        "get",
        200,
        true,
        true,
      ],
      [
        "api_mcp_approval_evidence_records_compare_local_notes",
        "compare",
        200,
        true,
        true,
      ],
    ],
  );

  const [create, list, get, compare] = payload.requests;
  assert.equal(create.actual.body.kind, "mcp-approval-evidence.record");
  assert.equal(create.actual.body.record.id, "aer_local_notes_001");
  assert.equal(list.actual.body.kind, "mcp-approval-evidence.records.list");
  assert.equal(list.actual.body.summary.recordCount, 1);
  assert.deepEqual(list.actual.body.summary.statuses, { approved: 1 });
  assert.equal(get.recordId, "aer_local_notes_001");
  assert.equal(get.actual.body.record.id, "aer_local_notes_001");
  assert.equal(compare.actual.body.kind, "mcp-approval-evidence.records.compare");
  assert.equal(compare.actual.body.matches, true);
  assert.equal(compare.actual.body.summary.differenceCount, 0);
});

test("package entrypoint routes MCP approval evidence records replay commands", async () => {
  const result = await runCli([
    "mcp",
    "approval-evidence",
    "records",
    "replay",
    "--fixture",
    fixturePath,
    "--id",
    "api_mcp_approval_evidence_records_compare_local_notes",
  ]);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.kind, "mcp-approval-evidence-records-replay");
  assert.deepEqual(payload.filters, {
    id: "api_mcp_approval_evidence_records_compare_local_notes",
  });
  assert.equal(payload.replayedRequests, 1);
  assert.equal(payload.requests[0].endpoint, "compare");
});

test("detects MCP approval evidence records replay command aliases", () => {
  assert.equal(
    isMcpApprovalEvidenceRecordsReplayCommand([
      "mcp",
      "approval",
      "evidence",
      "records",
      "replay",
    ]),
    true,
  );
  assert.equal(
    isMcpApprovalEvidenceRecordsReplayCommand([
      "mcp",
      "approval-evidence",
      "records",
      "replay",
    ]),
    true,
  );
  assert.equal(
    isMcpApprovalEvidenceRecordsReplayCommand([
      "mcp",
      "approval-evidence-records",
      "replay",
    ]),
    true,
  );
  assert.equal(
    isMcpApprovalEvidenceRecordsReplayCommand([
      "mcp-approval-evidence",
      "records",
      "replay",
    ]),
    true,
  );
  assert.equal(
    isMcpApprovalEvidenceRecordsReplayCommand([
      "mcp-approval-evidence-records",
      "replay",
    ]),
    true,
  );
  assert.equal(
    isMcpApprovalEvidenceRecordsReplayCommand(["mcp", "approval", "evidence", "replay"]),
    false,
  );
});

test("reports malformed MCP approval evidence records fixtures as JSON-only errors", async () => {
  const malformedJsonPath = await writeTextFixture("malformed.json", "{");
  const invalidBodyPath = await writeFixture("missing-record.json", {
    schemaVersion: "mcp-approval-evidence-records-requests.v1",
    generatedAt: "2026-04-27T12:35:00.000Z",
    apiBase: "local://mcp-approval-evidence-records-api",
    requests: [
      {
        id: "api_missing_record",
        title: "Missing record body",
        route: {
          method: "POST",
          path: "/v1/mcp/approval-evidence/records",
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

  const malformedJson = await runMcpApprovalEvidenceRecordsReplayCli([
    "mcp-approval-evidence-records",
    "replay",
    "--fixture",
    malformedJsonPath,
  ]);
  const invalidBody = await runMcpApprovalEvidenceRecordsReplayCli([
    "mcp-approval-evidence-records",
    "replay",
    "--fixture",
    invalidBodyPath,
  ]);

  assert.ok(malformedJson);
  assert.ok(invalidBody);
  const malformedPayload = JSON.parse(malformedJson.stderr);
  const invalidBodyPayload = JSON.parse(invalidBody.stderr);

  assert.equal(malformedJson.exitCode, 2);
  assert.equal(malformedJson.stdout, "");
  assert.equal(malformedPayload.error.code, "invalid_fixture_json");
  assert.equal(invalidBody.exitCode, 2);
  assert.equal(invalidBody.stdout, "");
  assert.equal(invalidBodyPayload.error.code, "invalid_fixture");
  assert.match(invalidBodyPayload.error.message, /request\.body\.record/);
});

test("rejects malformed MCP approval evidence records bundles through shared validator paths", async () => {
  const invalidPath = await writeFixture("shared-invalid-records.json", {
    schemaVersion: "mcp-approval-evidence-records-requests.v1",
    generatedAt: "2026-04-27T12:36:00.000Z",
    apiBase: "local://mcp-approval-evidence-records-api",
    requests: [
      {
        id: "api_mcp_approval_evidence_records_missing_request",
        title: "Missing request object",
        route: {
          method: "POST",
          path: "/v1/mcp/approval-evidence/records",
        },
        expect: {
          status: 400,
        },
      },
    ],
  });
  const result = await runMcpApprovalEvidenceRecordsReplayCli([
    "mcp-approval-evidence-records",
    "replay",
    "--fixture",
    invalidPath,
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stderr);

  assert.equal(result.exitCode, 2);
  assert.equal(result.stdout, "");
  assert.equal(payload.error.code, "invalid_fixture");
  assert.match(payload.error.message, /shared schema validation/);
  assert.equal(hasIssuePath(payload, "requests[0].request"), true);
});

test("rejects duplicate MCP approval evidence records ids and unsafe fixture refs via shared validation", async () => {
  const duplicatePath = await writeFixture("duplicate-approval-evidence-records.json", {
    schemaVersion: "mcp-approval-evidence-records-requests.v1",
    generatedAt: "2026-04-27T12:37:00.000Z",
    apiBase: "local://mcp-approval-evidence-records-api",
    requests: [
      buildCreateRequest("api_mcp_approval_evidence_records_duplicate"),
      buildCreateRequest("api_mcp_approval_evidence_records_duplicate"),
    ],
  });
  const unsafeRefPath = await writeFixture("unsafe-ref-approval-evidence-records.json", {
    schemaVersion: "mcp-approval-evidence-records-requests.v1",
    generatedAt: "2026-04-27T12:38:00.000Z",
    apiBase: "local://mcp-approval-evidence-records-api",
    fixtureRefs: [
      {
        id: "evidenceRecordRef",
        fixturePath: "private-plan-pack/evidence-record.json",
      },
    ],
    requests: [
      {
        ...buildCreateRequest("api_mcp_approval_evidence_records_unsafe_ref"),
        request: {
          body: {
            record: {
              $fixtureRef: "evidenceRecordRef",
            },
          },
        },
      },
    ],
  });

  const duplicate = await runMcpApprovalEvidenceRecordsReplayCli([
    "mcp-approval-evidence-records",
    "replay",
    "--fixture",
    duplicatePath,
  ]);
  const unsafeRef = await runMcpApprovalEvidenceRecordsReplayCli([
    "mcp-approval-evidence-records",
    "replay",
    "--fixture",
    unsafeRefPath,
  ]);
  assert.ok(duplicate);
  assert.ok(unsafeRef);
  const duplicatePayload = JSON.parse(duplicate.stderr);
  const unsafeRefPayload = JSON.parse(unsafeRef.stderr);

  assert.equal(duplicate.exitCode, 2);
  assert.equal(duplicate.stdout, "");
  assert.equal(duplicatePayload.error.code, "invalid_fixture");
  assert.equal(hasIssuePath(duplicatePayload, "requests[1].id"), true);
  assert.equal(unsafeRef.exitCode, 2);
  assert.equal(unsafeRef.stdout, "");
  assert.equal(unsafeRefPayload.error.code, "invalid_fixture");
  assert.equal(hasIssuePath(unsafeRefPayload, "fixtureRefs[0].fixturePath"), true);
});

test("rejects unsafe MCP approval evidence records fixture paths as JSON-only errors", async () => {
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
      fixture: path.join(workspaceRoot, ".codex-private", "approval-evidence-records.json"),
      message: /private workspace/,
    },
    {
      fixture: path.resolve(
        workspaceRoot,
        "..",
        "sovereignops-codex-pack",
        "approval-evidence-records.json",
      ),
      message: /plan-pack/,
    },
    {
      fixture: path.join(path.dirname(fixturePath), "missing-approval-evidence-records.json"),
      code: "fixture_not_found",
      message: /Fixture file was not found/,
    },
  ];

  for (const unsafeCase of unsafeCases) {
    const result = await runMcpApprovalEvidenceRecordsReplayCli([
      "mcp",
      "approval",
      "evidence",
      "records",
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

test("rejects MCP approval evidence records fixtures for the wrong endpoint", async () => {
  const wrongEndpointPath = await writeFixture("wrong-endpoint.json", {
    schemaVersion: "mcp-approval-evidence-records-requests.v1",
    generatedAt: "2026-04-27T12:40:00.000Z",
    apiBase: "local://mcp-approval-evidence-records-api",
    requests: [
      {
        id: "api_wrong_endpoint",
        title: "Wrong endpoint",
        route: {
          method: "POST",
          path: "/v1/mcp/approval-evidence/preview",
        },
        request: {
          body: {
            record: buildRecord(),
          },
        },
        expect: {
          status: 404,
        },
      },
    ],
  });
  const result = await runMcpApprovalEvidenceRecordsReplayCli([
    "mcp-approval-evidence-records",
    "replay",
    "--fixture",
    wrongEndpointPath,
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stderr);

  assert.equal(result.exitCode, 2);
  assert.equal(result.stdout, "");
  assert.equal(payload.error.code, "invalid_fixture");
  assert.match(payload.error.message, /must target one of/);
  assert.match(payload.error.message, /\/v1\/mcp\/approval-evidence\/records/);
});

test("redacts secret-like values in MCP approval evidence records request bodies", async () => {
  const secretFixturePath = await writeFixture("secret-records.json", {
    schemaVersion: "mcp-approval-evidence-records-requests.v1",
    generatedAt: "2026-04-27T12:45:00.000Z",
    apiBase: "local://mcp-approval-evidence-records-api",
    requests: [
      {
        id: "api_secret_body_redaction",
        title: "Redact MCP approval evidence record",
        route: {
          method: "POST",
          path: "/v1/mcp/approval-evidence/records",
        },
        request: {
          body: {
            record: {
              ...buildRecord(),
              request: {
                toolName: "sync_local_notes",
                arguments: {
                  apiToken: "[REDACTED]",
                  note: "Use [REDACTED] only for redaction coverage.",
                },
              },
              metadata: {
                sessionToken: "[REDACTED]",
              },
            },
          },
        },
        expect: {
          status: 201,
          contentType: "application/json",
          kind: "mcp-approval-evidence.record",
          schemaVersion: "mcp-approval-evidence-record/v1",
          recordId: "aer_test_001",
        },
      },
    ],
  });

  const result = await runMcpApprovalEvidenceRecordsReplayCli([
    "mcp",
    "approval",
    "evidence",
    "records",
    "replay",
    "--fixture",
    secretFixturePath,
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stdout);
  const request = payload.requests[0];

  for (const secret of [
    "fixture-api-token-001",
    "fixture-secret-token-002",
    "fixture-session-token-003",
  ]) {
    assert.equal(result.stdout.includes(secret), false, `stdout leaked ${secret}`);
  }

  assert.equal(
    request.request.body.record.request.arguments.apiToken,
    "[REDACTED]",
  );
  assert.match(request.request.body.record.request.arguments.note, /\[REDACTED\]/);
  assert.equal(request.request.body.record.metadata.sessionToken, "[REDACTED]");
  assert.equal(
    request.actual.body.record.request.arguments.apiToken,
    "[REDACTED]",
  );
  assert.ok(request.redactions.length >= 4);
});

function buildRecord() {
  return {
    id: "aer_test_001",
    status: "approved",
    createdAt: "2026-04-27T12:00:00.000Z",
    updatedAt: "2026-04-27T12:05:00.000Z",
    actor: {
      id: "user_local_operator",
    },
    decision: {
      status: "approved",
      at: "2026-04-27T12:05:00.000Z",
      actor: {
        id: "user_local_reviewer",
      },
    },
    request: {
      toolName: "summarize_local_notes",
      arguments: {
        workspaceId: "wsp_local_alpha",
      },
    },
  };
}

function buildCreateRequest(id) {
  return {
    id,
    title: `Create approval evidence record ${id}`,
    route: {
      method: "POST",
      path: "/v1/mcp/approval-evidence/records",
    },
    request: {
      body: {
        record: buildRecord(),
      },
    },
    expect: {
      status: 201,
    },
  };
}

async function writeFixture(name, value) {
  return writeTextFixture(name, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeTextFixture(name, text) {
  await mkdir(tempDir, { recursive: true });
  const outputPath = path.join(tempDir, name);
  await writeFile(outputPath, text);
  return outputPath;
}

function hasIssuePath(payload, suffix) {
  return payload.error.details.issues.some((issue) => issue.path.endsWith(suffix));
}
