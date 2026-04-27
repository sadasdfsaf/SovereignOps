import assert from "node:assert/strict";

import {
  buildWorkspaceSessionApiAuditPreview,
  buildWorkspaceSessionApiErrorState,
  buildWorkspaceSessionApiErrorStates,
  buildWorkspaceSessionApiLoadingState,
  buildWorkspaceSessionApiRequestCards,
  buildWorkspaceSessionApiState,
  buildWorkspaceSessionApiSummaryCards,
  redactWorkspaceSessionApiError,
} from "../src/workspaceSessionApiState.ts";

const timestamps = {
  generated: "2026-04-28T03:00:00.000Z",
  opened: "2026-04-28T03:01:00.000Z",
  locked: "2026-04-28T03:02:00.000Z",
};

const rawWorkspacePath = "E:\\SovereignOps\\private\\alpha\\session.db";
const rawBackupPath = "C:\\Users\\DELL\\backups\\alpha-session.zip";
const rawPosixPath = "/home/alice/.sovereignops/session.json";
const rawSecret = "sk-live_abcdefghijklmnopqrstuvwxyz";
const rawBearer = "Bearer abcdefghijklmnopqrstuvwxyz";

function assertNoLeak(value, rawValues) {
  const serialized = JSON.stringify(value);
  for (const raw of rawValues) {
    assert.equal(
      serialized.includes(raw),
      false,
      `serialized state leaked raw value: ${raw}`,
    );
    assert.equal(
      serialized.includes(raw.replaceAll("\\", "\\\\")),
      false,
      `serialized state leaked escaped raw value: ${raw}`,
    );
  }
}

function buildReplayFixture() {
  return {
    schemaVersion: "workspace-session-api-requests.v1",
    generatedAt: timestamps.generated,
    apiBase: "local://workspace-session-api",
    requests: [
      {
        id: "api_session_status",
        title: "Read workspace session status",
        route: {
          method: "POST",
          path: "/v1/workspace-session/summary",
        },
        response: {
          status: 200,
          body: {
            localOnly: true,
            workspace: {
              id: "ws_alpha",
              name: "Alpha Workspace",
              open: true,
              rootPath: rawWorkspacePath,
            },
            session: {
              id: "sess_alpha",
              isolated: true,
              storageMode: "workspace",
            },
            lock: {
              locked: true,
              ownerSessionId: "sess_alpha",
              currentSessionId: "sess_alpha",
            },
            approval: {
              required: false,
              requests: [{ id: "approval_done", status: "approved" }],
            },
            gateway: {
              state: "ready",
              connected: true,
            },
            migration: {
              ready: true,
              required: false,
              pendingItemCount: 0,
              blockerCount: 0,
            },
            backup: {
              ready: true,
              restorable: true,
              encrypted: true,
              pendingWrites: 0,
              targetPath: rawBackupPath,
            },
          },
        },
      },
      {
        id: "api_session_audit",
        title: "Read workspace session audit preview",
        route: {
          method: "POST",
          path: "/v1/workspace-session/audit-preview",
        },
        response: {
          status: 200,
          body: {
            auditPreview: {
              rows: [
                {
                  id: "aud_lock",
                  sequence: 2,
                  title: "Session lock renewed",
                  summary: "Lock ownership confirmed for the current session.",
                  createdAt: timestamps.locked,
                  status: "ready",
                  localOnly: true,
                  redactionMarkers: [{ id: "red_session_path" }],
                },
                {
                  id: "aud_open",
                  sequence: 1,
                  action: "Workspace opened",
                  message: "Open state confirmed.",
                  timestamp: timestamps.opened,
                  state: "complete",
                  scope: "local-only",
                },
              ],
            },
          },
        },
      },
    ],
  };
}

function buildErrorFixture() {
  return {
    generatedAt: timestamps.generated,
    requests: [
      {
        id: "api_session_error",
        route: {
          method: "GET",
          path: "/v1/workspace-session/summary",
        },
        response: {
          status: 503,
          body: {
            error: {
              message: `Session failed at ${rawWorkspacePath}; token=${rawSecret}; ${rawBearer}`,
            },
          },
        },
      },
    ],
  };
}

function testApiReplayBuildsWorkspaceSessionRequestsAndAuditPreview() {
  const replay = buildReplayFixture();
  const original = structuredClone(replay);
  const state = buildWorkspaceSessionApiState(replay, {
    apiBase: "local://workspace-session-api",
  });

  assert.deepEqual(replay, original);
  assert.equal(state.id, "workspace_session_api");
  assert.equal(state.phase, "success");
  assert.equal(state.status, "ready");
  assert.equal(state.statusLabel, "Ready");
  assert.equal(state.severity, "success");
  assert.equal(state.generatedAt, timestamps.generated);
  assert.equal(state.requestCount, 2);
  assert.equal(state.sourceCount, 7);
  assert.equal(state.localOnly, true);
  assert.equal(state.redacted, true);

  assert.deepEqual(
    state.requestCards.map((card) => [
      card.requestId,
      card.method,
      card.routePath,
      card.status,
      card.statusCode,
      card.localOnly,
    ]),
    [
      ["api_session_status", "POST", "/v1/workspace-session/summary", "success", 200, true],
      [
        "api_session_audit",
        "POST",
        "/v1/workspace-session/audit-preview",
        "success",
        200,
        false,
      ],
    ],
  );
  assert.equal(
    state.requestCards[0].url,
    "local://workspace-session-api/v1/workspace-session/summary",
  );

  assert.equal(state.workspaceSession.status, "ready");
  assert.equal(state.workspaceSession.workspaceOpen.value, "Open");
  assert.equal(state.workspaceSession.lockState.value, "Locked to session");
  assert.equal(state.workspaceSession.backupReadiness.value, "Restorable");

  assert.deepEqual(
    state.summaryCards.map((card) => [
      card.label,
      card.value,
      card.status,
      card.localOnly,
      card.redacted,
    ]),
    [
      ["Workspace session", "Ready", "ready", true, true],
      ["API requests", "2 requests", "success", true, true],
      ["Audit preview", "2 rows", "success", true, true],
      ["Redactions", "3 redactions", "attention", true, true],
    ],
  );

  assert.equal(state.auditPreview.status, "success");
  assert.equal(state.auditPreview.rowCount, 2);
  assert.equal(state.auditPreview.redacted, true);
  assert.deepEqual(
    state.auditPreview.rows.map((row) => [
      row.auditId,
      row.sequence,
      row.title,
      row.status,
      row.localOnly,
      row.redacted,
    ]),
    [
      ["aud_open", 1, "Workspace opened", "success", true, false],
      ["aud_lock", 2, "Session lock renewed", "ready", true, true],
    ],
  );

  assert.deepEqual(
    buildWorkspaceSessionApiRequestCards(replay).map((card) => card.requestId),
    ["api_session_status", "api_session_audit"],
  );
  assert.deepEqual(
    buildWorkspaceSessionApiSummaryCards(replay).map((card) => card.id),
    [
      "workspace_session_api.summary.status",
      "workspace_session_api.summary.requests",
      "workspace_session_api.summary.audit",
      "workspace_session_api.summary.redactions",
    ],
  );
  assert.deepEqual(
    buildWorkspaceSessionApiAuditPreview(replay).rows.map((row) => row.auditId),
    ["aud_open", "aud_lock"],
  );
  assertNoLeak(state, [rawWorkspacePath, rawBackupPath]);
}

function testErrorStatesRedactLocalPathsAndSecrets() {
  const state = buildWorkspaceSessionApiState(buildErrorFixture());

  assert.equal(state.phase, "error");
  assert.equal(state.status, "error");
  assert.equal(state.requestCards[0].status, "error");
  assert.equal(state.errorStates.length, 1);
  assert.equal(state.errorStates[0].context, "session");
  assert.equal(state.errorStates[0].status, 503);
  assert.equal(state.errorStates[0].redacted, true);

  const description = state.errorStates[0].errorState.description;
  assert.match(description, /\[redacted-path\]/);
  assert.match(description, /\[redacted-secret\]/);
  assert.equal(description.includes(rawWorkspacePath), false);
  assert.equal(description.includes(rawSecret), false);
  assert.equal(description.includes(rawBearer), false);
  assertNoLeak(state, [rawWorkspacePath, rawSecret, rawBearer]);

  assert.deepEqual(
    buildWorkspaceSessionApiErrorStates(buildErrorFixture()).map((error) => [
      error.context,
      error.routeId,
      error.status,
      error.errorState.description,
    ]),
    [["session", "api_session_error", 503, description]],
  );
  assert.equal(
    buildWorkspaceSessionApiErrorState(
      "audit",
      new Error(`Audit failed at ${rawPosixPath} with api_key=${rawSecret}`),
    ).errorState.description.includes(rawPosixPath),
    false,
  );
  assert.equal(
    redactWorkspaceSessionApiError({
      message: "Refresh failed",
      authorization: rawBearer,
    }).text,
    "Refresh failed",
  );
}

function testEmptyAndLoadingStates() {
  const loading = buildWorkspaceSessionApiLoadingState({
    defaultTimestamp: timestamps.generated,
  });
  assert.equal(loading.phase, "loading");
  assert.equal(loading.status, "loading");
  assert.equal(loading.generatedAt, timestamps.generated);
  assert.equal(loading.requestCards[0].status, "loading");
  assert.equal(loading.workspaceSession.status, "loading");
  assert.equal(loading.auditPreview.emptyState.label, "No audit preview");

  const empty = buildWorkspaceSessionApiState(undefined, {
    defaultTimestamp: timestamps.generated,
  });
  assert.equal(empty.phase, "success");
  assert.equal(empty.status, "empty");
  assert.equal(empty.requestCount, 0);
  assert.equal(empty.sourceCount, 0);
  assert.equal(empty.requestCards.length, 0);
  assert.equal(empty.workspaceSession.status, "empty");
  assert.equal(empty.auditPreview.status, "empty");
  assert.equal(empty.emptyStates.requests.label, "No API requests");
}

function testCloneBoundaryAndNoMutation() {
  const replay = buildReplayFixture();
  const original = structuredClone(replay);
  const state = buildWorkspaceSessionApiState(replay);

  state.requestCards[0].detailLabels.push("mutated");
  state.summaryCards[0].detailLabels.push("mutated");
  state.auditPreview.detailLabels.push("mutated");
  state.auditPreview.rows[0].detailLabels.push("mutated");
  state.workspaceSession.summaryCards[0].detailLabels.push("mutated");
  state.emptyStates.requests.label = "mutated";

  assert.deepEqual(replay, original);

  const rebuilt = buildWorkspaceSessionApiState(replay);
  assert.equal(rebuilt.requestCards[0].detailLabels.includes("mutated"), false);
  assert.equal(rebuilt.summaryCards[0].detailLabels.includes("mutated"), false);
  assert.equal(rebuilt.auditPreview.detailLabels.includes("mutated"), false);
  assert.equal(
    rebuilt.auditPreview.rows[0].detailLabels.includes("mutated"),
    false,
  );
  assert.equal(
    rebuilt.workspaceSession.summaryCards[0].detailLabels.includes("mutated"),
    false,
  );
  assert.equal(rebuilt.emptyStates.requests.label, "No API requests");
}

testApiReplayBuildsWorkspaceSessionRequestsAndAuditPreview();
testErrorStatesRedactLocalPathsAndSecrets();
testEmptyAndLoadingStates();
testCloneBoundaryAndNoMutation();

console.log("workspace session api state tests passed");
