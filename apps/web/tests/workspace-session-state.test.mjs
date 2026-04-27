import assert from "node:assert/strict";

import {
  buildPendingApprovalGatewayState,
  buildRedactedWorkspaceSessionErrorCards,
  buildWorkspaceBackupReadinessState,
  buildWorkspaceGatewayState,
  buildWorkspaceLockState,
  buildWorkspaceMigrationReadinessState,
  buildWorkspaceOpenState,
  buildWorkspaceSessionLoadingState,
  buildWorkspaceSessionState,
  buildWorkspaceSessionSummaryCards,
  redactWorkspaceSessionText,
} from "../src/workspaceSessionState.ts";

const rawWorkspacePath = "E:\\SovereignOps\\private\\alpha\\session.db";
const rawBackupPath = "C:\\Users\\DELL\\backups\\alpha-session.zip";
const rawPosixPath = "/home/alice/.sovereignops/session.json";
const rawFileUrl = "file:///C:/Users/DELL/private/session.json";
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

function assertAccessibleCards(cards) {
  for (const card of cards) {
    assert.equal(typeof card.ariaLabel, "string");
    assert.ok(card.ariaLabel.length > 0);
    assert.equal(typeof card.status, "string");
    assert.equal(typeof card.severity, "string");
    assert.ok(card.id.startsWith("workspace_session."));
  }
}

function testReadyWorkspaceSessionState() {
  const fixture = {
    generatedAt: "2026-04-28T01:00:00.000Z",
    workspace: {
      id: "ws_alpha",
      name: "Alpha Workspace",
      open: true,
      rootPath: rawWorkspacePath,
    },
    session: {
      id: "sess_alpha",
      workspaceId: "ws_alpha",
      isolated: true,
      storageMode: "workspace",
    },
    lock: {
      locked: true,
      ownerSessionId: "sess_alpha",
      currentSessionId: "sess_alpha",
      mode: "exclusive",
    },
    approval: {
      required: false,
      requests: [{ id: "approval_done", status: "approved" }],
    },
    gateway: {
      status: "ready",
      connected: true,
    },
    migration: {
      ready: true,
      required: false,
      pendingItemCount: 0,
      blockerCount: 0,
      schemaVersion: "session-v2",
    },
    backup: {
      ready: true,
      restorable: true,
      encrypted: true,
      lastBackupAt: "2026-04-28T00:30:00.000Z",
      pendingWrites: 0,
      targetPath: rawBackupPath,
    },
    errors: [],
  };
  const original = structuredClone(fixture);

  const state = buildWorkspaceSessionState(fixture);

  assert.deepEqual(fixture, original);
  assert.equal(state.id, "workspace_session_isolation");
  assert.equal(state.phase, "success");
  assert.equal(state.status, "ready");
  assert.equal(state.statusLabel, "Ready");
  assert.equal(state.severity, "success");
  assert.equal(state.generatedAt, "2026-04-28T01:00:00.000Z");
  assert.equal(state.sourceCount, 7);

  assert.equal(state.workspaceOpen.status, "ready");
  assert.equal(state.workspaceOpen.value, "Open");
  assert.equal(state.workspaceOpen.workspaceLabel, "Alpha Workspace");
  assert.equal(state.workspaceOpen.open, true);
  assert.equal(state.workspaceOpen.isolated, true);
  assert.equal(state.workspaceOpen.ariaLabel.includes("Session isolated"), true);

  assert.equal(state.lockState.status, "ready");
  assert.equal(state.lockState.value, "Locked to session");
  assert.equal(state.lockState.ownedByCurrentSession, true);
  assert.equal(state.approvalGateway.status, "ready");
  assert.equal(state.approvalGateway.pendingApprovalCount, 0);
  assert.equal(state.migrationReadiness.status, "ready");
  assert.equal(state.migrationReadiness.value, "Not required");
  assert.equal(state.backupReadiness.status, "ready");
  assert.equal(state.backupReadiness.value, "Restorable");

  assert.deepEqual(
    state.summaryCards.map((card) => [
      card.id,
      card.title,
      card.status,
      card.severity,
    ]),
    [
      [
        "workspace_session.summary.workspace_open",
        "Workspace open state",
        "ready",
        "success",
      ],
      [
        "workspace_session.summary.lock_state",
        "Session lock state",
        "ready",
        "success",
      ],
      [
        "workspace_session.summary.approval_gateway",
        "Approvals and gateway",
        "ready",
        "success",
      ],
      [
        "workspace_session.summary.migration_readiness",
        "Migration readiness",
        "ready",
        "success",
      ],
      [
        "workspace_session.summary.backup_readiness",
        "Backup readiness",
        "ready",
        "success",
      ],
    ],
  );

  assert.deepEqual(
    state.cards.map((card) => card.id),
    [
      "workspace_session.workspace_open",
      "workspace_session.lock_state",
      "workspace_session.approval_gateway",
      "workspace_session.migration_readiness",
      "workspace_session.backup_readiness",
    ],
  );
  assertAccessibleCards(state.cards);
  assertAccessibleCards(state.summaryCards);
  assertNoLeak(state, [rawWorkspacePath, rawBackupPath]);
}

function testPendingBlockedAndErrorsAreRedacted() {
  const fixture = {
    generatedAt: "2026-04-28T02:00:00.000Z",
    workspace: {
      id: "ws_beta",
      name: "Beta Workspace",
      open: true,
      path: rawWorkspacePath,
    },
    session: {
      id: "sess_current",
      isolated: true,
    },
    lock: {
      locked: true,
      ownerSessionId: "sess_other",
      currentSessionId: "sess_current",
      reason: `Held by previous process at ${rawWorkspacePath}`,
    },
    approval: {
      required: true,
      requests: [
        { id: "approval_1", status: "pending" },
        { id: "approval_2", state: "pending" },
        { id: "approval_3", status: "approved" },
      ],
    },
    gateway: {
      state: "pending",
      connected: true,
    },
    migration: {
      required: true,
      pendingItems: [{ status: "pending" }, { status: "ready" }],
      blockers: [`Cannot read ${rawWorkspacePath}`],
    },
    backup: {
      restorable: true,
      encrypted: false,
      stale: true,
      pendingWrites: 3,
      targetPath: rawBackupPath,
    },
    errors: [
      {
        code: "E_SECRET_PATH",
        severity: "critical",
        message: `Failed opening ${rawWorkspacePath}; token=${rawSecret}; ${rawBearer}`,
      },
    ],
  };

  const state = buildWorkspaceSessionState(fixture);

  assert.equal(state.phase, "error");
  assert.equal(state.status, "error");
  assert.equal(state.severity, "critical");
  assert.equal(state.lockState.status, "blocked");
  assert.equal(state.lockState.value, "Locked by another session");
  assert.equal(state.approvalGateway.status, "attention");
  assert.equal(state.approvalGateway.pendingApprovalCount, 2);
  assert.equal(state.migrationReadiness.status, "blocked");
  assert.equal(state.migrationReadiness.pendingItemCount, 1);
  assert.equal(state.migrationReadiness.blockerCount, 1);
  assert.equal(state.backupReadiness.status, "attention");
  assert.equal(state.backupReadiness.value, "Backup stale");

  assert.equal(state.errorCards.length, 1);
  assert.equal(state.errorCards[0].id, "workspace_session.error.e_secret_path");
  assert.equal(state.errorCards[0].status, "error");
  assert.equal(state.errorCards[0].severity, "critical");
  assert.match(state.errorCards[0].value, /\[redacted-path\]/);
  assert.match(state.errorCards[0].value, /\[redacted-secret\]/);
  assert.equal(state.errorCards[0].metadata.redacted, true);
  assertAccessibleCards(state.errorCards);
  assertNoLeak(state, [rawWorkspacePath, rawBackupPath, rawSecret, rawBearer]);
}

function testFocusedBuildersUseStableProjection() {
  const open = buildWorkspaceOpenState({
    workspace: {
      open: false,
      path: rawPosixPath,
    },
    session: {
      isolated: false,
    },
  });
  assert.equal(open.status, "blocked");
  assert.equal(open.value, "Closed");
  assert.equal(open.metadata.workspaceId, undefined);
  assertNoLeak(open, [rawPosixPath]);

  const lock = buildWorkspaceLockState({ state: "unlocked" });
  assert.equal(lock.status, "attention");
  assert.equal(lock.value, "Unlocked");
  assert.equal(lock.severity, "warning");

  const gateway = buildPendingApprovalGatewayState({
    approvals: {
      sessions: [{ status: "pending" }, { status: "approved" }],
    },
    gateway: {
      state: "ready",
    },
  });
  assert.equal(gateway.status, "attention");
  assert.equal(gateway.pendingApprovalCount, 1);
  assert.equal(gateway.gatewayReady, true);

  const gatewayAlias = buildWorkspaceGatewayState({
    approvalGateway: {
      state: "ready",
      pendingApprovalCount: 0,
    },
  });
  assert.equal(gatewayAlias.status, "ready");

  const migration = buildWorkspaceMigrationReadinessState({
    required: true,
    pendingItems: [{ status: "pending" }],
    blockers: [],
  });
  assert.equal(migration.status, "attention");
  assert.equal(migration.value, "1 pending item");

  const backup = buildWorkspaceBackupReadinessState({
    restorable: false,
    targetPath: rawFileUrl,
  });
  assert.equal(backup.status, "blocked");
  assert.equal(backup.value, "Not restorable");
  assertNoLeak(backup, [rawFileUrl]);
}

function testRedactionAndDefensiveCloning() {
  const redacted = redactWorkspaceSessionText(
    `Read failed at ${rawPosixPath} with api_key=${rawSecret}`,
  );
  assert.match(redacted, /\[redacted-path\]/);
  assert.match(redacted, /api_key=\[redacted-secret\]/);
  assert.equal(redacted.includes(rawPosixPath), false);
  assert.equal(redacted.includes(rawSecret), false);

  const errorCards = buildRedactedWorkspaceSessionErrorCards([
    {
      code: "E_DUPLICATE",
      message: `first ${rawWorkspacePath}`,
    },
    {
      code: "E_DUPLICATE",
      message: `second ${rawBackupPath}`,
    },
  ]);
  assert.deepEqual(
    errorCards.map((card) => card.id),
    [
      "workspace_session.error.e_duplicate",
      "workspace_session.error.e_duplicate.2",
    ],
  );
  assertNoLeak(errorCards, [rawWorkspacePath, rawBackupPath]);

  const fixture = {
    workspace: { name: "Clone Workspace", open: true },
    session: { id: "sess_clone", isolated: true },
    lock: { locked: true, ownerSessionId: "sess_clone", currentSessionId: "sess_clone" },
    gateway: { state: "ready" },
    approval: { pendingApprovalCount: 0 },
    migration: { ready: true, required: false },
    backup: { ready: true, restorable: true, encrypted: true },
  };
  const state = buildWorkspaceSessionState(fixture);
  state.summaryCards[0].detailLabels.push("mutated");
  state.cards[0].metadata.open = false;
  state.workspaceOpen.detailLabels.push("mutated");

  const rebuilt = buildWorkspaceSessionState(fixture);
  assert.equal(rebuilt.summaryCards[0].detailLabels.includes("mutated"), false);
  assert.equal(rebuilt.cards[0].metadata.open, true);
  assert.equal(rebuilt.workspaceOpen.detailLabels.includes("mutated"), false);

  const summary = buildWorkspaceSessionSummaryCards(fixture);
  summary[0].metadata.open = false;
  const rebuiltSummary = buildWorkspaceSessionSummaryCards(fixture);
  assert.equal(rebuiltSummary[0].metadata.open, true);
}

function testLoadingAndEmptyStates() {
  const loading = buildWorkspaceSessionLoadingState({
    defaultTimestamp: "2026-04-28T00:00:00.000Z",
  });
  assert.equal(loading.phase, "loading");
  assert.equal(loading.status, "loading");
  assert.equal(loading.generatedAt, "2026-04-28T00:00:00.000Z");
  assert.equal(loading.summaryCards[0].id, "workspace_session.summary.workspace_open");
  assert.equal(loading.summaryCards[0].value, "Workspace status loading");
  assertAccessibleCards(loading.cards);

  const empty = buildWorkspaceSessionState(undefined, {
    defaultTimestamp: "2026-04-28T00:00:00.000Z",
  });
  assert.equal(empty.status, "empty");
  assert.equal(empty.sourceCount, 0);
  assert.equal(empty.workspaceOpen.status, "empty");
  assert.equal(empty.lockState.status, "empty");
  assert.equal(empty.emptyState.id, "workspace_session_empty");
}

testReadyWorkspaceSessionState();
testPendingBlockedAndErrorsAreRedacted();
testFocusedBuildersUseStableProjection();
testRedactionAndDefensiveCloning();
testLoadingAndEmptyStates();

console.log("workspace session state tests passed");
