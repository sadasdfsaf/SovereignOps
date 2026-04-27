import assert from "node:assert/strict";

import {
  defaultRoute,
  findRouteById,
  listNavigationRoutes,
  listRoutes,
  matchRoutePath,
  normalizeRoutePath,
  resolveRoutePath,
} from "../src/routes.ts";
import {
  createInitialOnboardingState,
  createInMemoryWorkspaceRepository,
  createLocalWorkspace,
  listLocalWorkspaces,
  openLocalWorkspace,
  selectEncryptionMode,
  setOnboardingEncryptionMode,
} from "../src/onboarding.ts";

function fixedRuntime(id = "wsp_alpha") {
  return {
    now: () => new Date("2026-04-27T00:00:00.000Z"),
    createWorkspaceId: () => id,
  };
}

function testRouteCatalog() {
  const routes = listRoutes();

  assert.deepEqual(
    routes.map((route) => route.id),
    [
      "dashboard",
      "tasks",
      "docs",
      "incidents",
      "approvals",
      "search",
      "settings",
    ],
  );
  assert.equal(defaultRoute.id, "dashboard");

  for (const route of routes) {
    assert.equal(route.component.kind, "route-shell");
    assert.equal(route.component.routeId, route.id);
    assert.ok(route.component.name.endsWith("Route"));
    assert.ok(route.component.slots.length > 0);
  }
}

function testRouteMatchingAndNavigation() {
  assert.equal(normalizeRoutePath("tasks/?page=1#top"), "/tasks");
  assert.equal(matchRoutePath("/")?.route.id, "dashboard");
  assert.equal(matchRoutePath("/")?.isAlias, true);
  assert.equal(matchRoutePath("/dashboard/")?.canonicalPath, "/dashboard");
  assert.equal(matchRoutePath("INCIDENTS")?.route.id, "incidents");
  assert.equal(resolveRoutePath("/missing").id, "dashboard");
  assert.equal(findRouteById("approvals").path, "/approvals");

  assert.deepEqual(
    listNavigationRoutes().map((route) => route.id),
    ["dashboard", "tasks", "docs", "incidents", "approvals", "settings"],
  );
}

function testEncryptionSelection() {
  assert.deepEqual(selectEncryptionMode("local-key").validationErrors, []);

  const shortPassphrase = selectEncryptionMode({
    mode: "passphrase",
    passphrase: "too-short",
  });
  assert.equal(shortPassphrase.ready, false);
  assert.match(shortPassphrase.validationErrors[0], /passphrase/);

  const externalKey = selectEncryptionMode({
    mode: "external-key",
    keyReference: "  keyring://workspace-alpha  ",
  });
  assert.equal(externalKey.ready, true);
  assert.equal(externalKey.keyReference, "keyring://workspace-alpha");
}

function testOnboardingStateSelection() {
  const initial = createInitialOnboardingState();
  const next = setOnboardingEncryptionMode(initial, "local-key");

  assert.equal(initial.step, "select-encryption");
  assert.equal(next.step, "create-workspace");
  assert.equal(next.selectedEncryptionMode?.mode, "local-key");
}

function testCreateAndOpenWorkspace() {
  const repository = createInMemoryWorkspaceRepository();

  const created = createLocalWorkspace(
    repository,
    {
      name: "  Alpha   Workspace  ",
      encryption: "local-key",
    },
    fixedRuntime(),
  );

  assert.equal(created.action, "created");
  assert.equal(created.state.step, "ready");
  assert.equal(created.workspace.id, "wsp_alpha");
  assert.equal(created.workspace.name, "Alpha Workspace");
  assert.equal(created.workspace.slug, "alpha-workspace");
  assert.equal(created.workspace.encryption.mode, "local-key");
  assert.equal(created.workspace.createdAt, "2026-04-27T00:00:00.000Z");
  assert.equal(created.workspace.lastOpenedAt, undefined);

  const opened = openLocalWorkspace(
    repository,
    {
      workspaceId: "wsp_alpha",
      encryption: "local-key",
    },
    {
      now: () => new Date("2026-04-27T00:00:10.000Z"),
    },
  );

  assert.equal(opened.action, "opened");
  assert.equal(opened.workspace.lastOpenedAt, "2026-04-27T00:00:10.000Z");
  assert.equal(opened.workspace.updatedAt, "2026-04-27T00:00:10.000Z");
}

function testWorkspaceValidation() {
  const repository = createInMemoryWorkspaceRepository();

  assert.throws(
    () =>
      createLocalWorkspace(
        repository,
        {
          name: "Alpha",
          encryption: { mode: "passphrase", passphrase: "short" },
        },
        fixedRuntime(),
      ),
    /encryption mode is not ready/,
  );
  assert.throws(
    () =>
      createLocalWorkspace(
        repository,
        {
          name: "   ",
          encryption: "local-key",
        },
        fixedRuntime(),
      ),
    /workspace name/,
  );
  assert.throws(
    () =>
      openLocalWorkspace(repository, {
        workspaceId: "wsp_missing",
        encryption: "local-key",
      }),
    /workspace not found/,
  );
}

function testWorkspaceCopiesAndOrdering() {
  const repository = createInMemoryWorkspaceRepository();
  const first = createLocalWorkspace(
    repository,
    {
      name: "First",
      encryption: "local-key",
    },
    {
      now: () => new Date("2026-04-27T00:00:00.000Z"),
      createWorkspaceId: () => "wsp_first",
    },
  );
  createLocalWorkspace(
    repository,
    {
      name: "Second",
      encryption: {
        mode: "external-key",
        keyReference: "keyring://second",
      },
    },
    {
      now: () => new Date("2026-04-27T00:00:01.000Z"),
      createWorkspaceId: () => "wsp_second",
    },
  );

  first.workspace.name = "Changed outside";
  const loaded = openLocalWorkspace(
    repository,
    {
      workspaceId: "wsp_first",
      encryption: "local-key",
    },
    {
      now: () => new Date("2026-04-27T00:00:02.000Z"),
    },
  );

  assert.equal(loaded.workspace.name, "First");
  loaded.workspace.encryption.mode = "passphrase";

  const loadedAgain = openLocalWorkspace(
    repository,
    {
      workspaceId: "wsp_first",
      encryption: "local-key",
    },
    {
      now: () => new Date("2026-04-27T00:00:03.000Z"),
    },
  );
  assert.equal(loadedAgain.workspace.encryption.mode, "local-key");

  assert.deepEqual(
    listLocalWorkspaces(repository).map((workspace) => workspace.id),
    ["wsp_first", "wsp_second"],
  );
}

testRouteCatalog();
testRouteMatchingAndNavigation();
testEncryptionSelection();
testOnboardingStateSelection();
testCreateAndOpenWorkspace();
testWorkspaceValidation();
testWorkspaceCopiesAndOrdering();

console.log("routes and onboarding tests passed");
