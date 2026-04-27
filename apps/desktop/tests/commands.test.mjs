import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DESKTOP_COMMAND_IDS,
  WORKSPACE_LAYOUT_VERSION,
  buildGatewayStartRequest,
  createUnlockedWorkspaceLockState,
  createWorkspaceLayoutDescriptor,
  listDesktopCommandDefinitions,
  lockWorkspaceState,
  planWorkspaceFileLayoutMigration,
  unlockWorkspaceState,
  validateCommandPayload,
  validateGatewayStartPayload,
  validateSafePathDescriptor,
  validateWorkspaceOpenPayload,
} from "../src/commands.ts";

const workspacePath = "E:\\Workspaces\\Alpha";
const requestedAt = "2026-04-27T00:00:00.000Z";

describe("desktop command metadata", () => {
  it("lists the stable Tauri command names and payload contracts", () => {
    const definitions = listDesktopCommandDefinitions();

    assert.deepEqual(
      definitions.map((definition) => definition.id),
      [...DESKTOP_COMMAND_IDS],
    );
    assert.deepEqual(
      definitions.map((definition) => definition.tauriCommand),
      [
        "workspace_open",
        "workspace_lock",
        "workspace_unlock",
        "gateway_start",
        "workspace_plan_file_layout_migration",
      ],
    );

    for (const definition of definitions) {
      assert.equal(definition.version, 1);
      assert.equal(typeof definition.summary, "string");
      assert.ok(definition.summary.length > 20);
      assert.ok(definition.payload.endsWith("Payload") || definition.payload.endsWith("Input"));
      assert.ok(definition.result.length > 0);
      assert.ok(definition.hostEffects.length > 0);
    }

    assert.equal(new Set(definitions.map((definition) => definition.id)).size, definitions.length);
    assert.equal(
      new Set(definitions.map((definition) => definition.tauriCommand)).size,
      definitions.length,
    );
  });
});

describe("desktop command payload validation", () => {
  it("normalizes workspace open paths and defaults command options", () => {
    const result = validateWorkspaceOpenPayload({
      workspacePath,
      requestedAt,
    });

    assert.equal(result.ok, true);
    assert.equal(result.value.workspacePath.normalized, "E:/Workspaces/Alpha");
    assert.equal(result.value.workspacePath.kind, "windows-drive");
    assert.deepEqual(result.value.workspacePath.segments, [
      "E:",
      "Workspaces",
      "Alpha",
    ]);
    assert.equal(result.value.expectedLayoutVersion, WORKSPACE_LAYOUT_VERSION);
    assert.equal(result.value.mode, "read-write");

    const viaCommand = validateCommandPayload("workspace.open", {
      workspacePath,
      mode: "read-only",
    });
    assert.equal(viaCommand.ok, true);
    assert.equal(viaCommand.value.mode, "read-only");
  });

  it("rejects unsafe paths, unsupported fields, and remote gateway hosts", () => {
    const unsafePath = validateSafePathDescriptor("..\\private");
    assert.equal(unsafePath.ok, false);
    assert.equal(unsafePath.issues[0].path, "$");
    assert.match(unsafePath.issues[0].message, /absolute/);

    const unknownField = validateWorkspaceOpenPayload({
      workspacePath,
      surprise: true,
    });
    assert.equal(unknownField.ok, false);
    assert.deepEqual(
      unknownField.issues.map((issue) => issue.path),
      ["surprise"],
    );

    const gateway = validateGatewayStartPayload({
      workspaceId: "wsp_alpha",
      workspacePath,
      host: "0.0.0.0",
      port: 48231,
    });
    assert.equal(gateway.ok, false);
    assert.ok(gateway.issues.some((issue) => issue.path === "host"));

    const unsupported = validateCommandPayload("workspace.delete", {});
    assert.equal(unsupported.ok, false);
    assert.equal(unsupported.issues[0].path, "commandId");
  });

  it("builds safe workspace layout descriptors under the root", () => {
    const descriptor = createWorkspaceLayoutDescriptor(workspacePath, 2);

    assert.equal(descriptor.ok, true);
    assert.equal(descriptor.value.version, 2);
    assert.deepEqual(
      descriptor.value.entries.map((entry) => entry.relativePath),
      [
        ".sovereignops",
        ".sovereignops/workspace.json",
        ".sovereignops/events",
        ".sovereignops/objects",
        ".sovereignops/index",
      ],
    );
    assert.equal(
      descriptor.value.entries[1].absolutePath,
      "E:/Workspaces/Alpha/.sovereignops/workspace.json",
    );
  });
});

describe("workspace lock state transitions", () => {
  it("locks, rejects mismatched unlock tokens, and unlocks without mutating prior state", () => {
    const initial = createUnlockedWorkspaceLockState("wsp_alpha");
    assert.equal(initial.ok, true);

    const locked = lockWorkspaceState(initial.value, {
      workspaceId: "wsp_alpha",
      deviceId: "dev_laptop",
      requestedAt,
      lockToken: "lock_alpha_laptop_001",
      reason: "manual lock",
    });

    assert.equal(locked.ok, true);
    assert.equal(locked.value.status, "locked");
    assert.equal(locked.value.previousState.locked, false);
    assert.equal(locked.value.state.locked, true);
    assert.equal(locked.value.state.revision, 1);
    assert.equal(locked.value.state.lockToken, "lock_alpha_laptop_001");
    assert.equal(initial.value.locked, false);

    const alreadyLocked = lockWorkspaceState(locked.value.state, {
      workspaceId: "wsp_alpha",
      deviceId: "dev_laptop",
      requestedAt: "2026-04-27T00:00:01.000Z",
      lockToken: "lock_alpha_laptop_002",
    });
    assert.equal(alreadyLocked.ok, true);
    assert.equal(alreadyLocked.value.status, "already_locked");
    assert.equal(alreadyLocked.value.state.revision, 1);
    assert.equal(alreadyLocked.value.state.lockToken, "lock_alpha_laptop_001");

    const rejected = unlockWorkspaceState(locked.value.state, {
      workspaceId: "wsp_alpha",
      deviceId: "dev_laptop",
      requestedAt: "2026-04-27T00:00:02.000Z",
      lockToken: "lock_alpha_laptop_bad",
    });
    assert.equal(rejected.ok, true);
    assert.equal(rejected.value.status, "unlock_rejected");
    assert.equal(rejected.value.state.locked, true);

    const unlocked = unlockWorkspaceState(locked.value.state, {
      workspaceId: "wsp_alpha",
      deviceId: "dev_laptop",
      requestedAt: "2026-04-27T00:00:03.000Z",
      lockToken: "lock_alpha_laptop_001",
    });
    assert.equal(unlocked.ok, true);
    assert.equal(unlocked.value.status, "unlocked");
    assert.equal(unlocked.value.state.locked, false);
    assert.equal(unlocked.value.state.revision, 2);
    assert.equal(unlocked.value.state.unlockedAt, "2026-04-27T00:00:03.000Z");
  });
});

describe("gateway start request", () => {
  it("returns the sidecar request shape expected by a Tauri adapter", () => {
    const request = buildGatewayStartRequest({
      workspaceId: "wsp_alpha",
      workspacePath,
      transport: "http",
      host: "127.0.0.1",
      port: 48231,
      logLevel: "debug",
      requestedAt,
    });

    assert.equal(request.ok, true);
    assert.deepEqual(request.value, {
      commandId: "gateway.start",
      tauriCommand: "gateway_start",
      sidecar: "mcp-gateway",
      arguments: [
        "--workspace-id",
        "wsp_alpha",
        "--workspace",
        "E:/Workspaces/Alpha",
        "--transport",
        "http",
        "--log-level",
        "debug",
        "--host",
        "127.0.0.1",
        "--port",
        "48231",
      ],
      env: {
        SOVEREIGNOPS_WORKSPACE_ID: "wsp_alpha",
        SOVEREIGNOPS_WORKSPACE_PATH: "E:/Workspaces/Alpha",
        SOVEREIGNOPS_GATEWAY_TRANSPORT: "http",
      },
      healthCheck: {
        url: "http://127.0.0.1:48231/health",
        method: "GET",
      },
    });
  });
});

describe("workspace file layout migration planning", () => {
  it("orders migration steps by layout version and operation order", () => {
    const plan = planWorkspaceFileLayoutMigration({
      rootPath: workspacePath,
      fromVersion: 0,
      toVersion: WORKSPACE_LAYOUT_VERSION,
      requestedAt,
    });

    assert.equal(plan.ok, true);
    assert.deepEqual(
      plan.value.steps.map((step) => [step.version, step.order, step.operation, step.relativePath]),
      [
        [1, 10, "ensure_directory", ".sovereignops"],
        [1, 20, "ensure_json_file", ".sovereignops/workspace.json"],
        [2, 30, "ensure_directory", ".sovereignops/events"],
        [2, 40, "ensure_directory", ".sovereignops/objects"],
        [2, 50, "ensure_directory", ".sovereignops/index"],
        [3, 60, "ensure_directory", ".sovereignops/locks"],
        [3, 70, "ensure_json_file", ".sovereignops/gateway.json"],
        [3, 80, "ensure_directory", ".sovereignops/migrations"],
      ],
    );
    assert.equal(
      plan.value.steps.at(-1).absolutePath,
      "E:/Workspaces/Alpha/.sovereignops/migrations",
    );
    assert.deepEqual(
      plan.value.targetLayout.entries.map((entry) => entry.key),
      [
        "controlDir",
        "manifest",
        "eventsDir",
        "objectsDir",
        "indexDir",
        "locksDir",
        "gatewayConfig",
        "migrationsDir",
      ],
    );
  });

  it("can plan only the remaining steps from an older layout", () => {
    const plan = planWorkspaceFileLayoutMigration({
      rootPath: workspacePath,
      fromVersion: 2,
      toVersion: 3,
    });

    assert.equal(plan.ok, true);
    assert.deepEqual(
      plan.value.steps.map((step) => step.relativePath),
      [
        ".sovereignops/locks",
        ".sovereignops/gateway.json",
        ".sovereignops/migrations",
      ],
    );

    const invalid = planWorkspaceFileLayoutMigration({
      rootPath: workspacePath,
      fromVersion: 3,
      toVersion: 2,
    });
    assert.equal(invalid.ok, false);
    assert.ok(invalid.issues.some((issue) => issue.path === "fromVersion"));
  });
});
