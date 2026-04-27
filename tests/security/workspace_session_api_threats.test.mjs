import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createWorkspaceRootDescriptor,
  planGatewayStartConstraints,
  projectWorkspaceLockRequest,
  summarizeWorkspaceSessionIsolationAudit,
} from "../../apps/desktop/src/workspaceSessionIsolation.ts";
import {
  LOCAL_WORKSPACE_SESSION_ERROR_CODES,
  LocalWorkspaceSessionError,
  createLocalWorkspaceSessionAuditPreviewRecords,
  normalizeLocalWorkspaceDescriptor,
  normalizeLocalWorkspaceGateway,
  planLocalWorkspaceSessionLockEvent,
  planLocalWorkspaceSessionOpenEvent,
  validateLocalWorkspaceStoragePath,
} from "../../packages/sdk-js/src/localWorkspaceSession.ts";
import {
  buildWorkspaceSessionState,
  redactWorkspaceSessionText,
} from "../../apps/web/src/workspaceSessionState.ts";

const timestamp = "2026-04-27T00:00:00.000Z";
const workspaceId = "wsp_alpha";
const deviceId = "dev_laptop";
const sessionId = "sess_alpha_laptop_001";
const lockToken = "lock_alpha_laptop_001";
const workspaceRoot = "E:\\SovereignOps\\workspaces\\Alpha";
const storagePath = "workspaces/wsp_alpha/session.json";

describe("workspace/session API cross-layer threat controls", () => {
  it("rejects traversal at Desktop roots and SDK session storage paths", () => {
    for (const rootPath of [
      "E:\\SovereignOps\\workspaces\\Alpha\\..\\Escape",
      "https://example.invalid/workspaces/Alpha",
      "\\\\fileserver\\share\\Alpha",
    ]) {
      const root = createWorkspaceRootDescriptor(rootPath);
      assert.equal(root.ok, false, `${rootPath} should be rejected`);
    }

    for (const unsafePath of [
      "../session.json",
      "sessions/../../escape.json",
      "C:/tmp/session.json",
      "~/session.json",
      "workspaces\\wsp_alpha\\session.json",
    ]) {
      assertLocalSessionError(
        () => validateLocalWorkspaceStoragePath(unsafePath),
        LOCAL_WORKSPACE_SESSION_ERROR_CODES.INVALID_STORAGE_PATH,
        unsafePath,
      );
      assertLocalSessionError(
        () =>
          normalizeLocalWorkspaceDescriptor({
            ...workspaceDescriptor(),
            storagePath: unsafePath,
          }),
        LOCAL_WORKSPACE_SESSION_ERROR_CODES.INVALID_STORAGE_PATH,
        unsafePath,
      );
    }
  });

  it("rejects remote gateway hosts before a start request is planned", () => {
    const root = createWorkspaceRootDescriptor(workspaceRoot);
    assert.equal(root.ok, true);

    for (const host of ["0.0.0.0", "192.168.1.10", "gateway.example.invalid"]) {
      const desktop = planGatewayStartConstraints({
        workspaceId,
        workspaceRoot: root.value,
        transport: "http",
        host,
        port: 48231,
        logLevel: "info",
        requestedAt: timestamp,
      });
      assert.equal(desktop.ok, false, `${host} should be rejected by Desktop`);
      assert.ok(desktop.issues.some((issue) => issue.path === "host"));
      assert.equal("value" in desktop, false);

      assertLocalSessionError(
        () => normalizeLocalWorkspaceGateway({ host, port: 48231 }),
        LOCAL_WORKSPACE_SESSION_ERROR_CODES.INVALID_GATEWAY,
        host,
      );
    }

    const accepted = planGatewayStartConstraints({
      workspaceId,
      workspaceRoot: root.value,
      transport: "http",
      host: "127.0.0.1",
      port: 48231,
      logLevel: "debug",
      requestedAt: timestamp,
    });

    assert.equal(accepted.ok, true);
    assert.equal(accepted.value.localOnly, true);
    assert.deepEqual(accepted.value.allowedHosts, ["127.0.0.1", "localhost"]);
    assert.equal(accepted.value.startRequest.healthCheck.url, "http://127.0.0.1:48231/health");
  });

  it("prevents denied session actions from applying local side effects", () => {
    const root = createWorkspaceRootDescriptor(workspaceRoot);
    assert.equal(root.ok, true);
    const attempts = [];

    const denied = planWorkspaceSessionApiResponse({
      allowSideEffects: false,
      workspaceRoot: root.value,
      onSideEffect: (effect) => attempts.push(effect),
    });

    assert.equal(denied.status, 403);
    assert.equal(denied.body.ok, false);
    assert.equal(denied.body.localOnly, true);
    assert.deepEqual(denied.body.appliedEffects, []);
    assert.deepEqual(attempts, []);

    const allowed = planWorkspaceSessionApiResponse({
      allowSideEffects: true,
      workspaceRoot: root.value,
      onSideEffect: (effect) => attempts.push(effect),
    });

    assert.equal(allowed.status, 200);
    assert.equal(allowed.body.ok, true);
    assert.deepEqual(allowed.body.appliedEffects, ["session.lock"]);
    assert.deepEqual(attempts, ["session.lock"]);
  });

  it("keeps composed API responses local-only across Desktop, SDK, and Web state", () => {
    const response = buildComposedWorkspaceSessionApiPreview();

    assert.equal(response.status, 200);
    assert.equal(response.body.kind, "workspace-session.api.preview");
    assert.equal(response.body.localOnly, true);
    assert.equal(response.body.gateway.localOnly, true);
    assert.equal(response.body.session.localOnly, true);
    assert.deepEqual(response.body.session.operations, ["open", "lock"]);
    assert.equal(response.body.webState.id, "workspace_session_isolation");
    assert.equal(response.body.webState.phase, "success");
    assert.equal(response.body.webState.workspaceOpen.open, true);
    assert.equal(response.body.webState.workspaceOpen.isolated, true);
    assert.ok(response.body.audit.workspaceRef.startsWith("wsp_redacted_"));

    for (const record of response.body.auditPreviewRecords) {
      assert.equal(record.details.localOnly, true);
      assert.match(record.details.storagePath, /^\[redacted:path:[a-z0-9]+\]$/);
    }
  });

  it("redacts secret-shaped values and local paths from response surfaces", () => {
    const rawPath = "C:\\Users\\DELL\\workspaces\\Alpha\\session.json";
    const rawPosixPath = "/home/alice/workspaces/Alpha/session.json";
    const rawSecret = "sk-test_abcdefghijklmnopqrstuvwxyz";
    const rawBearer = "Bearer abcdefghijklmnopqrstuvwxyz";
    const message = `Failed at ${rawPath} and ${rawPosixPath} with api_key=${rawSecret}; ${rawBearer}`;

    const redactedText = redactWorkspaceSessionText(message);
    assert.match(redactedText, /\[redacted-path\]/);
    assert.match(redactedText, /\[redacted-secret\]/);
    assertNoRawValues(redactedText, [rawPath, rawPosixPath, rawSecret, rawBearer]);

    const state = buildWorkspaceSessionState({
      workspace: {
        id: workspaceId,
        open: true,
        path: rawPath,
      },
      session: {
        id: sessionId,
        isolated: true,
      },
      errors: [
        {
          code: "E_SESSION_PATH",
          message,
        },
      ],
    });
    assert.equal(state.errorCards.length, 1);
    assert.equal(state.errorCards[0].metadata.redacted, true);
    assertNoRawValues(state, [rawPath, rawPosixPath, rawSecret, rawBearer]);

    const composed = buildComposedWorkspaceSessionApiPreview();
    const serialized = JSON.stringify(composed);
    assertNoRawValues(serialized, [
      workspaceRoot,
      workspaceRoot.replaceAll("\\", "/"),
      lockToken,
    ]);
  });
});

function buildComposedWorkspaceSessionApiPreview() {
  const root = createWorkspaceRootDescriptor(workspaceRoot);
  assert.equal(root.ok, true);

  const lock = projectWorkspaceLockRequest({
    workspaceId,
    deviceId,
    requestedAt: timestamp,
    lockToken,
    reason: "manual lock",
  });
  assert.equal(lock.ok, true);

  const gateway = planGatewayStartConstraints({
    workspaceId,
    workspaceRoot: root.value,
    transport: "http",
    host: "127.0.0.1",
    port: 48231,
    logLevel: "info",
    requestedAt: timestamp,
  });
  assert.equal(gateway.ok, true);

  const openEvent = planLocalWorkspaceSessionOpenEvent({
    descriptor: localDescriptor(),
    sessionId,
    sequence: 1,
    createdAt: timestamp,
  });
  const lockEvent = planLocalWorkspaceSessionLockEvent({
    descriptor: localDescriptor(),
    sessionId,
    sequence: 2,
    createdAt: "2026-04-27T00:01:00.000Z",
    lockToken,
    reason: "manual lock",
  });

  const audit = summarizeWorkspaceSessionIsolationAudit({
    workspaceRoot: root.value,
    lockRequest: lock.value,
    gatewayConstraints: gateway.value,
  });
  const auditPreviewRecords = createLocalWorkspaceSessionAuditPreviewRecords({
    events: [openEvent, lockEvent],
    actor: "api-session-worker",
    createdAt: "2026-04-27T00:02:00.000Z",
  });
  const webState = buildWorkspaceSessionState({
    generatedAt: "2026-04-27T00:02:00.000Z",
    workspace: {
      id: workspaceId,
      name: "Alpha Workspace",
      open: true,
    },
    session: {
      id: sessionId,
      isolated: true,
      storageMode: "workspace",
    },
    lock: {
      locked: true,
      ownerSessionId: sessionId,
      currentSessionId: sessionId,
    },
    approval: {
      required: false,
      pendingApprovalCount: 0,
    },
    gateway: {
      status: "ready",
      connected: true,
    },
    migration: {
      ready: true,
      required: false,
    },
    backup: {
      ready: true,
      restorable: true,
      encrypted: true,
    },
  });

  return {
    status: 200,
    body: {
      ok: true,
      kind: "workspace-session.api.preview",
      localOnly: true,
      generatedAt: "2026-04-27T00:02:00.000Z",
      session: {
        id: sessionId,
        localOnly: true,
        operations: [openEvent.payload.operation, lockEvent.payload.operation],
      },
      gateway: {
        commandId: gateway.value.commandId,
        transport: gateway.value.payload.transport,
        host: gateway.value.payload.host,
        localOnly: gateway.value.localOnly,
        sidecar: gateway.value.startRequest.sidecar,
        envKeys: Object.keys(gateway.value.startRequest.env).sort(),
      },
      audit,
      auditPreviewRecords,
      webState,
    },
  };
}

function planWorkspaceSessionApiResponse({ allowSideEffects, workspaceRoot, onSideEffect }) {
  const lock = projectWorkspaceLockRequest({
    workspaceId,
    deviceId,
    requestedAt: timestamp,
    lockToken,
  });
  assert.equal(lock.ok, true);

  const gateway = planGatewayStartConstraints({
    workspaceId,
    workspaceRoot,
    transport: "http",
    host: "127.0.0.1",
    port: 48231,
    logLevel: "info",
    requestedAt: timestamp,
  });
  assert.equal(gateway.ok, true);

  if (!allowSideEffects) {
    return {
      status: 403,
      body: {
        ok: false,
        kind: "workspace-session.api.denied",
        localOnly: true,
        appliedEffects: [],
        reason: "session side effects denied",
      },
    };
  }

  onSideEffect("session.lock");
  return {
    status: 200,
    body: {
      ok: true,
      kind: "workspace-session.api.applied",
      localOnly: true,
      appliedEffects: ["session.lock"],
    },
  };
}

function localDescriptor() {
  return {
    ...workspaceDescriptor(),
    storagePath,
    gateway: {
      host: "127.0.0.1",
      port: 48231,
    },
  };
}

function workspaceDescriptor() {
  return {
    workspaceId,
    deviceId,
    rootKeyRef: "key_alpha",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function assertLocalSessionError(fn, code, label) {
  assert.throws(
    fn,
    (error) => {
      assert.equal(error instanceof LocalWorkspaceSessionError, true, label);
      assert.equal(error.code, code, label);
      return true;
    },
  );
}

function assertNoRawValues(value, rawValues) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  for (const raw of rawValues) {
    assert.equal(serialized.includes(raw), false, `leaked raw value: ${raw}`);
    assert.equal(
      serialized.includes(raw.replaceAll("\\", "\\\\")),
      false,
      `leaked escaped value: ${raw}`,
    );
  }
}
