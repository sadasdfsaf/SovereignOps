import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { WORKSPACE_LAYOUT_VERSION } from "../src/commands.ts";
import {
  assessWorkspaceMigrationReadiness,
  createWorkspaceRootDescriptor,
  planGatewayStartConstraints,
  projectWorkspaceLockRequest,
  projectWorkspaceUnlockRequest,
  summarizeWorkspaceSessionIsolationAudit,
} from "../src/workspaceSessionIsolation.ts";

const requestedAt = "2026-04-27T00:00:00.000Z";
const workspacePath = "E:\\Workspaces\\Alpha";

describe("workspace root descriptors", () => {
  it("rejects traversal and remote-like absolute roots", () => {
    const traversal = createWorkspaceRootDescriptor("E:\\Workspaces\\..\\Private");
    assert.equal(traversal.ok, false);
    assert.ok(
      traversal.issues.some((issue) => /must not contain \. or \./.test(issue.message)),
    );

    const uri = createWorkspaceRootDescriptor("https://example.test/workspace");
    assert.equal(uri.ok, false);
    assert.ok(uri.issues.some((issue) => /not a URI/.test(issue.message)));

    const unc = createWorkspaceRootDescriptor("\\\\fileserver\\share\\Alpha");
    assert.equal(unc.ok, false);
    assert.deepEqual(unc.issues, [
      {
        path: "rootPath",
        message: "workspace root must be a local absolute filesystem path",
      },
    ]);
  });

  it("returns immutable local root and request snapshots", () => {
    const root = createWorkspaceRootDescriptor(workspacePath, {
      layoutVersion: 2,
    });
    assert.equal(root.ok, true);
    assert.equal(root.value.localOnly, true);
    assert.equal(root.value.rootPath.normalized, "E:/Workspaces/Alpha");
    assert.equal(root.value.rootPath.kind, "windows-drive");
    assert.equal(root.value.layoutVersion, 2);
    assert.equal(Object.isFrozen(root.value), true);
    assert.equal(Object.isFrozen(root.value.rootPath), true);
    assert.equal(Object.isFrozen(root.value.rootPath.segments), true);
    assert.equal(Object.isFrozen(root.value.layout.entries[0]), true);
    assert.throws(() => root.value.rootPath.segments.push("escape"), TypeError);
    assert.throws(() => {
      root.value.layout.entries[0].absolutePath = "E:/Other";
    }, TypeError);

    const lock = projectWorkspaceLockRequest({
      workspaceId: "wsp_alpha",
      deviceId: "dev_laptop",
      requestedAt,
      lockToken: "lock_alpha_laptop_001",
      reason: "manual session lock",
    });
    assert.equal(lock.ok, true);
    assert.equal(lock.value.commandId, "workspace.lock");
    assert.equal(lock.value.tauriCommand, "workspace_lock");
    assert.equal(Object.isFrozen(lock.value.payload), true);
    assert.throws(() => {
      lock.value.payload.lockToken = "lock_alpha_laptop_002";
    }, TypeError);

    const unlock = projectWorkspaceUnlockRequest({
      workspaceId: "wsp_alpha",
      deviceId: "dev_laptop",
      requestedAt: "2026-04-27T00:00:01.000Z",
      lockToken: "lock_alpha_laptop_001",
    });
    assert.equal(unlock.ok, true);
    assert.equal(unlock.value.commandId, "workspace.unlock");
    assert.equal(unlock.value.payload.lockToken, "lock_alpha_laptop_001");
    assert.equal(Object.isFrozen(unlock.value.payload), true);
  });
});

describe("gateway start constraints", () => {
  it("keeps gateway starts bound to local roots and local hosts", () => {
    const root = createWorkspaceRootDescriptor(workspacePath);
    assert.equal(root.ok, true);

    const constraints = planGatewayStartConstraints({
      workspaceId: "wsp_alpha",
      workspaceRoot: root.value,
      transport: "http",
      host: "localhost",
      port: 48231,
      logLevel: "debug",
      requestedAt,
    });
    assert.equal(constraints.ok, true);
    assert.equal(constraints.value.localOnly, true);
    assert.deepEqual(constraints.value.allowedHosts, ["127.0.0.1", "localhost"]);
    assert.equal(
      constraints.value.startRequest.healthCheck.url,
      "http://localhost:48231/health",
    );
    assert.equal(
      constraints.value.startRequest.env.SOVEREIGNOPS_WORKSPACE_PATH,
      "E:/Workspaces/Alpha",
    );
    assert.equal(Object.isFrozen(constraints.value.startRequest.arguments), true);

    const remoteHost = planGatewayStartConstraints({
      workspaceId: "wsp_alpha",
      workspaceRoot: root.value,
      host: "0.0.0.0",
      port: 48231,
    });
    assert.equal(remoteHost.ok, false);
    assert.ok(remoteHost.issues.some((issue) => issue.path === "host"));

    const remoteRoot = planGatewayStartConstraints({
      workspaceId: "wsp_alpha",
      workspaceRoot: "\\\\fileserver\\share\\Alpha",
      host: "127.0.0.1",
      port: 48231,
    });
    assert.equal(remoteRoot.ok, false);
    assert.ok(
      remoteRoot.issues.some(
        (issue) =>
          issue.path === "workspaceRoot" &&
          /local absolute filesystem path/.test(issue.message),
      ),
    );
  });
});

describe("workspace migration readiness", () => {
  it("summarizes pending layout migration work without applying it", () => {
    const root = createWorkspaceRootDescriptor(workspacePath);
    assert.equal(root.ok, true);

    const readiness = assessWorkspaceMigrationReadiness({
      workspaceRoot: root.value,
      currentLayoutVersion: 2,
      targetLayoutVersion: WORKSPACE_LAYOUT_VERSION,
      requestedAt,
    });
    assert.equal(readiness.ok, true);
    assert.equal(readiness.value.status, "migration_required");
    assert.equal(readiness.value.ready, false);
    assert.equal(readiness.value.pendingStepCount, 3);
    assert.deepEqual(
      readiness.value.pendingOperations.map((operation) => operation.id),
      [
        "layout.v3.locks_dir",
        "layout.v3.gateway_config",
        "layout.v3.migrations_dir",
      ],
    );
    assert.equal(
      readiness.value.plan.steps.at(-1).absolutePath,
      "E:/Workspaces/Alpha/.sovereignops/migrations",
    );
    assert.equal(Object.isFrozen(readiness.value.plan.steps), true);

    const alreadyReady = assessWorkspaceMigrationReadiness({
      workspaceRoot: root.value,
      currentLayoutVersion: WORKSPACE_LAYOUT_VERSION,
    });
    assert.equal(alreadyReady.ok, true);
    assert.equal(alreadyReady.value.status, "ready");
    assert.equal(alreadyReady.value.pendingStepCount, 0);
  });
});

describe("redacted workspace session audit summaries", () => {
  it("does not leak workspace paths, secret tokens, device ids, or reasons", () => {
    const sensitivePath = "E:\\Customers\\Sensitive Client\\Alpha Secret";
    const root = createWorkspaceRootDescriptor(sensitivePath);
    assert.equal(root.ok, true);

    const lock = projectWorkspaceLockRequest({
      workspaceId: "wsp_customer_secret",
      deviceId: "dev_alice_laptop",
      requestedAt,
      lockToken: "lock_super_secret_token",
      reason: "operator note references E:\\Customers\\Sensitive Client",
    });
    assert.equal(lock.ok, true);

    const unlock = projectWorkspaceUnlockRequest({
      workspaceId: "wsp_customer_secret",
      deviceId: "dev_alice_laptop",
      requestedAt: "2026-04-27T00:00:01.000Z",
      lockToken: "lock_super_secret_token",
    });
    assert.equal(unlock.ok, true);

    const gateway = planGatewayStartConstraints({
      workspaceId: "wsp_customer_secret",
      workspaceRoot: root.value,
      host: "127.0.0.1",
      port: 48231,
    });
    assert.equal(gateway.ok, true);

    const migration = assessWorkspaceMigrationReadiness({
      workspaceRoot: root.value,
      currentLayoutVersion: 1,
      targetLayoutVersion: WORKSPACE_LAYOUT_VERSION,
    });
    assert.equal(migration.ok, true);

    const audit = summarizeWorkspaceSessionIsolationAudit({
      workspaceRoot: root.value,
      lockRequest: lock.value,
      unlockRequest: unlock.value,
      gatewayConstraints: gateway.value,
      migrationReadiness: migration.value,
    });
    const serialized = JSON.stringify(audit);

    assert.equal(audit.event, "workspace.session_isolation.audit");
    assert.equal(audit.lock.hasLockToken, true);
    assert.equal(audit.lock.reasonPresent, true);
    assert.match(audit.workspaceRef, /^wsp_redacted_[a-f0-9]{8}$/);
    assert.match(audit.rootRef, /^root_[a-f0-9]{8}$/);
    assert.doesNotMatch(serialized, /E:\\\\Customers/);
    assert.doesNotMatch(serialized, /E:\/Customers/);
    assert.doesNotMatch(serialized, /Sensitive Client/);
    assert.doesNotMatch(serialized, /Alpha Secret/);
    assert.doesNotMatch(serialized, /wsp_customer_secret/);
    assert.doesNotMatch(serialized, /dev_alice_laptop/);
    assert.doesNotMatch(serialized, /lock_super_secret_token/);
    assert.doesNotMatch(serialized, /operator note/);
    assert.equal(Object.isFrozen(audit.gateway.envKeys), true);
  });
});
