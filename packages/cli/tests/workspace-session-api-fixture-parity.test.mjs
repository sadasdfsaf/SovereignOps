import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  createWorkspaceSessionApiDispatcher,
  loadWorkspaceSessionApiRequests,
  runWorkspaceSessionApiReplayCli,
} from "../src/workspaceSessionApiReplay.ts";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const publicFixture = "examples/workspace-session/api-requests.json";

test("default dispatcher responses match the public workspace session API fixture", async () => {
  const bundle = await loadWorkspaceSessionApiRequests(publicFixture, {
    cwd: workspaceRoot,
  });
  const dispatch = createWorkspaceSessionApiDispatcher();

  assert.deepEqual(
    bundle.requests.map((request) => request.id),
    [
      "workspace_session_summary",
      "workspace_session_audit_preview",
    ],
  );

  for (const request of bundle.requests) {
    const response = await dispatch({
      method: request.method,
      path: request.path,
      ...(request.headers === undefined ? {} : { headers: request.headers }),
      ...(request.actorId === undefined ? {} : { actorId: request.actorId }),
      ...(request.body === undefined ? {} : { body: request.body }),
    });

    assert.equal(response.status, request.expectedStatus, request.id);
    assert.deepEqual(response.body, request.expectedBody, request.id);
  }
});

test("CLI replay passes the public fixture without retaining raw session body paths", async () => {
  const result = await runWorkspaceSessionApiReplayCli(
    [
      "workspace-session-api",
      "replay",
      "--fixture",
      publicFixture,
    ],
    {
      cwd: workspaceRoot,
    },
  );
  assert.ok(result);
  const payload = JSON.parse(result.stdout);
  const auditReplay = payload.requests.find(
    (request) => request.id === "workspace_session_audit_preview",
  );

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.totalRequests, 2);
  assert.equal(payload.replayedRequests, 2);
  assert.equal(payload.passedRequests, 2);
  assert.equal(payload.failedRequests, 0);
  assert.deepEqual(payload.summary.mismatches, {});
  assert.ok(auditReplay);
  assert.equal(auditReplay.matches.status, true);
  assert.equal(auditReplay.matches.body, true);
  assert.equal(
    auditReplay.request.body.events[0].payload.storagePath,
    "[redacted-path]",
  );
  assert.equal(
    auditReplay.actual.body.records[0].details.storagePath,
    "[redacted:path:4fd19b72]",
  );
  assert.equal(result.stdout.includes("workspaces/wsp_session_alpha/session.json"), false);
  assert.equal(result.stdout.includes("sess_alpha_laptop_001"), false);
  assert.equal(result.stdout.includes("[redacted:lockToken:1f7a4c22]"), false);
});
