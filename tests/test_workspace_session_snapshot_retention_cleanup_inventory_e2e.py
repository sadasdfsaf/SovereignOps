from __future__ import annotations

import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
FIXTURE_REL = "examples/workspace-session/snapshot-retention-cleanup-inventory.json"
FIXTURE_PATH = ROOT / FIXTURE_REL

PRIVATE_PATH_MARKERS = (
    "".join(("sovereignops", "-codex", "-pack")),
    "." + "codex-private",
    "." + "codex-run",
    "CODEX" + "_START" + "_HERE",
    "tasks" + "/backlog.jsonl",
    "tasks" + "\\backlog.jsonl",
)
RAW_SECRET_PATTERNS = (
    re.compile(r"sk-[A-Za-z0-9_-]{12,}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9_]{12,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"(?i)\bbearer\s+(?!\[REDACTED\])[A-Za-z0-9._~+/=-]+"),
    re.compile(
        r"(?i)(?:password|passwd|secret|api[_-]?key)"
        r"\s*[:=]\s*(?!\[REDACTED\]|\[redacted:)\S{4,}"
    ),
    re.compile(
        r"(?i)(?<![A-Za-z0-9_])(?<!\[redacted:)(?:lock[_-]?token|token)"
        r"\s*[:=]\s*(?!\[REDACTED\]|\[redacted:)\S{4,}"
    ),
    re.compile(r"\block-token-[A-Za-z0-9_-]+\b"),
    re.compile(r"\block_[A-Za-z0-9_-]{4,}\b"),
)
RAW_PATH_PATTERNS = (
    re.compile(r"(?<![A-Za-z0-9])[A-Za-z]:[\\/]"),
    re.compile(r"\\\\[^\\\s]+\\[^\\\s]+"),
    re.compile(
        r"(?<![A-Za-z0-9_])/(?:Users|home|root|tmp|var|etc|opt|private|mnt|Volumes)(?:/|\b)"
    ),
)

NODE_REPLAY_SCRIPT = r"""
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { createApiRouter } from "./apps/api/src/router.ts";
import {
  createWorkspaceSessionSnapshotRetentionCleanupInventoryPreview,
  createWorkspaceSessionSnapshotRetentionCleanupInventoryRoutes,
} from "./apps/api/src/workspaceSessionSnapshotRetentionCleanupInventoryRoutes.ts";
import { runCli } from "./packages/cli/src/index.ts";
import {
  isWorkspaceSessionSnapshotRetentionCleanupInventoryCommand,
  loadWorkspaceSessionSnapshotRetentionCleanupInventoryInput,
  runWorkspaceSessionSnapshotRetentionCleanupInventoryCli,
} from "./packages/cli/src/workspaceSessionSnapshotRetentionCleanupInventory.ts";
import {
  planFileBackedLocalWorkspaceSessionSnapshotRetentionCleanup,
  planLocalWorkspaceSessionSnapshotRetentionCleanup,
  planSnapshotRetentionCleanupDryRun,
} from "./packages/sdk-js/src/localWorkspaceSessionSnapshotRetention.ts";
import {
  buildWorkspaceSessionSnapshotRetentionCleanupInventoryState,
} from "./apps/web/src/workspaceSessionSnapshotRetentionCleanupInventoryState.ts";

const fixturePath = "examples/workspace-session/snapshot-retention-cleanup-inventory.json";
const inventoryRoute = {
  method: "POST",
  path: "/v1/workspace-session/snapshot-retention-cleanup/inventory/preview",
};
const expectedCounts = {
  entryCount: 4,
  keepCount: 2,
  deleteCount: 1,
  reviewCount: 1,
};

const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
const fixtureBefore = structuredClone(fixture);
assert.equal(
  fixture.schemaVersion,
  "workspace-session-snapshot-retention-cleanup-inventory-fixture/v1",
);
assert.equal(
  fixture.kind,
  "workspace-session.snapshot-retention-cleanup.inventory-fixture",
);
assert.equal(fixture.localOnly, true);
assert.equal(fixture.dryRun, true);
assert.equal(fixture.durableWrites, false);
assert.equal(fixture.inventory.sourceKind, "file-metadata");
assert.deepEqual(countsFromInventoryFixture(fixture), expectedCounts);
assertNoUnsafeText(JSON.stringify(fixture));

const loadedInput = await loadWorkspaceSessionSnapshotRetentionCleanupInventoryInput(
  fixturePath,
  { cwd: process.cwd() },
);
assert.equal(loadedInput.files.length, fixture.inventory.files.length);
assert.equal(loadedInput.maxCount, fixture.inventory.maxCount);
assert.equal(loadedInput.maxAgeMs, fixture.inventory.maxAgeMs);
assert.equal(loadedInput.now, fixture.inventory.now);
assert.deepEqual(fixture, fixtureBefore);

const runtimeInput = runtimeInputFromFixture(fixture);
const loadedInputBefore = structuredClone(loadedInput);
const runtimeInputBefore = structuredClone(runtimeInput);
const sdkPlan = planFileBackedLocalWorkspaceSessionSnapshotRetentionCleanup(loadedInput);
const localPlan = planLocalWorkspaceSessionSnapshotRetentionCleanup(runtimeInput);
const dryRunPlan = planSnapshotRetentionCleanupDryRun(runtimeInput);
const apiHelperPlan = createWorkspaceSessionSnapshotRetentionCleanupInventoryPreview({
  inventory: fixture.inventory.files,
  policy: retentionPolicyFromFixture(fixture),
});

for (const plan of [sdkPlan, localPlan, dryRunPlan, apiHelperPlan]) {
  assertAdvisoryOnlyPlan(plan);
  assertPlanCounts(plan, expectedCounts);
  assert.deepEqual(planIntent(plan), planIntent(sdkPlan));
}
assert.equal(Object.isFrozen(sdkPlan), true);
assert.equal(Object.isFrozen(sdkPlan.actions), true);
assert.deepEqual(loadedInput, loadedInputBefore);
assert.deepEqual(runtimeInput, runtimeInputBefore);

const router = createApiRouter(createWorkspaceSessionSnapshotRetentionCleanupInventoryRoutes());
const apiRequestBody = {
  inventory: {
    files: fixture.inventory.files,
  },
  policy: retentionPolicyFromFixture(fixture),
};
const apiRequestBefore = structuredClone(apiRequestBody);
const apiPreview = await router.dispatch({
  method: inventoryRoute.method,
  path: inventoryRoute.path,
  body: apiRequestBody,
});
assert.equal(apiPreview.status, 200, JSON.stringify(apiPreview.body));
assert.match(apiPreview.headers["content-type"], /^application\/json/);
assertAdvisoryOnlyPlan(apiPreview.body);
assertPlanCounts(apiPreview.body, expectedCounts);
assert.deepEqual(planIntent(apiPreview.body), planIntent(sdkPlan));
assert.deepEqual(apiRequestBody, apiRequestBefore);

const cliCommand = [
  "workspace-session",
  "snapshot",
  "retention-cleanup",
  "inventory",
  "--fixture",
  fixturePath,
];
assert.equal(
  isWorkspaceSessionSnapshotRetentionCleanupInventoryCommand(cliCommand.slice(0, 4)),
  true,
);

const directCli = await runWorkspaceSessionSnapshotRetentionCleanupInventoryCli(
  cliCommand,
  { cwd: process.cwd() },
);
assert.ok(directCli);
const dispatchCli = await runCli(cliCommand, { cwd: process.cwd() });
for (const result of [directCli, dispatchCli]) {
  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  const body = JSON.parse(result.stdout);
  assertCliInventoryEnvelope(body);
  assert.deepEqual(planIntent(body.plan), planIntent(sdkPlan));
}
const cliBody = JSON.parse(dispatchCli.stdout);

const webStates = {
  sdk: buildWorkspaceSessionSnapshotRetentionCleanupInventoryState(sdkPlan),
  api: buildWorkspaceSessionSnapshotRetentionCleanupInventoryState({
    response: apiPreview,
  }),
  cliPlan: buildWorkspaceSessionSnapshotRetentionCleanupInventoryState(cliBody.plan),
};
for (const state of Object.values(webStates)) {
  assert.equal(state.phase, "success");
  assert.equal(state.status, "attention");
  assert.equal(state.localOnly, true);
  assert.equal(state.dryRun, true);
  assert.equal(state.durableWrites, false);
  assert.equal(state.dryRunReady, true);
  assert.equal(state.entryCount, expectedCounts.entryCount);
  assert.equal(state.keepCount, expectedCounts.keepCount);
  assert.equal(state.deleteCount, expectedCounts.deleteCount);
  assert.equal(state.reviewCount, expectedCounts.reviewCount);
  assert.equal(state.advisoryDeleteCount, expectedCounts.deleteCount);
  assert.deepEqual(state.warnings.map((warning) => warning.kind), []);
  assert.deepEqual(state.errors, []);
}

const optionalSdkInventoryClient = await exerciseOptionalSdkInventoryClient(
  router,
  apiRequestBody,
  sdkPlan,
);

const replay = {
  fixture: {
    path: fixturePath,
    schemaVersion: fixture.schemaVersion,
    kind: fixture.kind,
  },
  sdk: {
    stablePlanner: summarizePlan(sdkPlan),
    localPlanner: summarizePlan(localPlan),
    dryRunPlanner: summarizePlan(dryRunPlan),
    apiRouteHelper: summarizePlan(apiHelperPlan),
    optionalInventoryApiClient: optionalSdkInventoryClient,
  },
  api: {
    route: inventoryRoute,
    plan: summarizePlan(apiPreview.body),
  },
  cli: {
    direct: summarizeCliInventoryEnvelope(JSON.parse(directCli.stdout)),
    dispatch: summarizeCliInventoryEnvelope(cliBody),
  },
  web: Object.fromEntries(
    Object.entries(webStates).map(([key, state]) => [key, summarizeWebState(state)]),
  ),
};

const surfaceOutput = JSON.stringify(replay);
assertNoUnsafeText(surfaceOutput);
assertNoFixturePathEcho(surfaceOutput, fixture.inventory.files);
assert.deepEqual(fixture, fixtureBefore);
console.log(JSON.stringify(replay));

function runtimeInputFromFixture(value) {
  return {
    files: value.inventory.files,
    ...retentionPolicyFromFixture(value),
  };
}

function retentionPolicyFromFixture(value) {
  return {
    maxCount: value.inventory.maxCount,
    maxAgeMs: value.inventory.maxAgeMs,
    now: value.inventory.now,
  };
}

function countsFromInventoryFixture(value) {
  const plan = planFileBackedLocalWorkspaceSessionSnapshotRetentionCleanup(
    runtimeInputFromFixture(value),
  );
  return {
    entryCount: plan.entryCount,
    keepCount: plan.keepCount,
    deleteCount: plan.deleteCount,
    reviewCount: plan.reviewCount,
  };
}

function assertCliInventoryEnvelope(body) {
  assert.equal(body.kind, "workspace-session-snapshot-retention-cleanup.inventory");
  assert.equal(
    body.schemaVersion,
    "workspace-session-snapshot-retention-cleanup-inventory-cli/v1",
  );
  assert.equal(body.fixture.path, fixturePath);
  assert.equal(body.inventory.localOnly, true);
  assert.equal(body.inventory.safeRelativeOrRedactedMetadataOnly, true);
  assert.equal(body.inventory.sourcePath, "$.inventory");
  assert.deepEqual(body.inventory.inspectedSections, ["files"]);
  assert.equal(body.inventory.entryCount, expectedCounts.entryCount);
  assert.equal(body.retention.previewOnly, true);
  assert.equal(body.retention.localOnly, true);
  assert.equal(body.retention.dryRun, true);
  assert.equal(body.retention.durableWrites, false);
  assert.equal(body.retention.writes, false);
  assert.equal(body.retention.deletes, false);
  assert.equal(body.retention.mutation, false);
  assert.equal(body.retention.wouldKeepCount, expectedCounts.keepCount);
  assert.equal(body.retention.wouldDeleteCount, expectedCounts.deleteCount);
  assert.equal(body.retention.reviewCount, expectedCounts.reviewCount);
  assertAdvisoryOnlyPlan(body.plan);
  assertPlanCounts(body.plan, expectedCounts);
}

async function exerciseOptionalSdkInventoryClient(router, requestBody, expectedPlan) {
  const candidates = [
    "./packages/sdk-js/src/localWorkspaceSessionSnapshotRetentionCleanupInventoryApiClient.ts",
    "./packages/sdk-js/src/localWorkspaceSessionSnapshotRetentionCleanupApiClient.ts",
    "./packages/sdk-js/src/index.ts",
  ];

    for (const modulePath of candidates) {
    if (modulePath !== "./packages/sdk-js/src/index.ts" && !existsSync(modulePath.slice(2))) {
      continue;
    }

    const mod = await import(modulePath);
    const exportNames = Object.keys(mod).filter((name) => /Inventory/.test(name));
    const normalize = firstFunction(mod, [
      "normalizeLocalWorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest",
      "normalizeWorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest",
    ]);
    if (normalize !== undefined) {
      const normalized = normalize(requestBody);
      assert.deepEqual(JSON.parse(JSON.stringify(normalized)), requestBody);
    }

    const calls = [];
    const options = {
      baseUrl: "http://local.test/v1/",
      fetch: localRouteFetch(router, calls),
    };
    const helper = firstFunction(mod, [
      "previewLocalWorkspaceSessionSnapshotRetentionCleanupInventoryViaApi",
      "previewWorkspaceSessionSnapshotRetentionCleanupInventoryViaApi",
    ]);
    if (helper !== undefined) {
      const response = await helper(options, requestBody);
      assertAdvisoryOnlyPlan(response);
      assert.deepEqual(planIntent(response), planIntent(expectedPlan));
      return {
        available: true,
        modulePath,
        exportNames,
        callSurface: "helper",
        fetchCallCount: calls.length,
        plan: summarizePlan(response),
      };
    }

    const factory = firstFunction(mod, [
      "createLocalWorkspaceSessionSnapshotRetentionCleanupInventoryApiClient",
      "createWorkspaceSessionSnapshotRetentionCleanupInventoryApiClient",
    ]);
    const inventoryClient = mod.LocalWorkspaceSessionSnapshotRetentionCleanupInventoryApiClient ??
      mod.WorkspaceSessionSnapshotRetentionCleanupInventoryApiClient;
    const fallbackClient = mod.LocalWorkspaceSessionSnapshotRetentionCleanupApiClient;
    const Client = inventoryClient ?? fallbackClient;
    const client = factory !== undefined
      ? factory(options)
      : typeof Client === "function"
        ? new Client(options)
        : undefined;
    if (client === undefined) {
      continue;
    }

    const methodNames = [
      "previewInventory",
      "inventoryPreview",
      "previewCleanupInventory",
      "retentionCleanupInventoryPreview",
      ...(inventoryClient === undefined ? [] : ["preview"]),
    ];
    const methodName = methodNames.find((name) => typeof client[name] === "function");
    if (methodName === undefined) {
      continue;
    }

    const response = await client[methodName](requestBody);
    assertAdvisoryOnlyPlan(response);
    assert.deepEqual(planIntent(response), planIntent(expectedPlan));
    return {
      available: true,
      modulePath,
      exportNames,
      callSurface: `client.${methodName}`,
      fetchCallCount: calls.length,
      plan: summarizePlan(response),
    };
  }

  return {
    available: false,
    fallback: "planFileBackedLocalWorkspaceSessionSnapshotRetentionCleanup",
  };
}

function localRouteFetch(router, calls) {
  return async (url, init = {}) => {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\/v1\/v1\//, "/v1/");
    const body = init.body === undefined ? undefined : JSON.parse(String(init.body));
    calls.push({
      method: init.method,
      path,
      contentType: headerValue(init.headers, "content-type"),
    });
    const response = await router.dispatch({
      method: init.method ?? "GET",
      path,
      body,
    });
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      statusText: response.status === 200 ? "OK" : "ERROR",
      headers: {
        get(name) {
          return headerValue(response.headers, name);
        },
      },
      async text() {
        return JSON.stringify(response.body);
      },
    };
  };
}

function firstFunction(moduleExports, names) {
  for (const name of names) {
    if (typeof moduleExports[name] === "function") {
      return moduleExports[name];
    }
  }
  return undefined;
}

function headerValue(headers, name) {
  if (headers === undefined) {
    return null;
  }
  const normalized = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === normalized) {
      return String(value);
    }
  }
  return null;
}

function assertAdvisoryOnlyPlan(plan) {
  assert.equal(plan.kind, "localWorkspaceSessionSnapshotRetentionCleanupPlan");
  assert.equal(plan.schemaVersion, "local-workspace-session-snapshot-retention/v1");
  assert.equal(plan.localOnly, true);
  assert.equal(plan.dryRun, true);
  assert.equal(plan.durableWrites, false);
  for (const action of plan.actions) {
    assert.notEqual(action.applied, true);
    assert.equal(action.summary.auditSafe, true);
    assert.equal(action.summary.redacted, true);
    assert.deepEqual(
      action.issues.filter((issue) =>
        ["raw-secret", "raw-lock-token", "unsafe-absolute-path", "path-traversal"].includes(
          issue.issueKind,
        )
      ),
      [],
    );
  }
}

function assertPlanCounts(plan, counts) {
  assert.equal(plan.entryCount, counts.entryCount);
  assert.equal(plan.keepCount, counts.keepCount);
  assert.equal(plan.deleteCount, counts.deleteCount);
  assert.equal(plan.reviewCount, counts.reviewCount);
  assert.equal(plan.keepActions.length, counts.keepCount);
  assert.equal(plan.deleteActions.length, counts.deleteCount);
  assert.equal(plan.reviewActions.length, counts.reviewCount);
  assert.deepEqual(
    plan.actions.map((action) => [action.summary.snapshotId, action.action]),
    [
      ["snap-current", "keep"],
      ["snap-previous", "keep"],
      ["snap-stale", "delete"],
      ["snap-review", "review"],
    ],
  );
}

function planIntent(plan) {
  return {
    entryCount: plan.entryCount,
    keepCount: plan.keepCount,
    deleteCount: plan.deleteCount,
    reviewCount: plan.reviewCount,
    thresholds: plan.thresholds,
    actions: plan.actions.map((action) => ({
      action: action.action,
      sourceIndex: action.sourceIndex,
      rank: action.rank ?? null,
      snapshotId: action.summary.snapshotId,
      fileRef: action.summary.fileRef,
      filePathKind: action.summary.filePathKind,
      reasons: [...action.reasons].sort(),
      issueKinds: action.issues.map((issue) => issue.issueKind).sort(),
    })),
  };
}

function summarizeCliInventoryEnvelope(body) {
  return {
    kind: body.kind,
    schemaVersion: body.schemaVersion,
    fixture: body.fixture,
    inventory: body.inventory,
    retention: body.retention,
    plan: summarizePlan(body.plan),
  };
}

function summarizePlan(plan) {
  return {
    kind: plan.kind,
    schemaVersion: plan.schemaVersion,
    localOnly: plan.localOnly,
    dryRun: plan.dryRun,
    durableWrites: plan.durableWrites,
    entryCount: plan.entryCount,
    keepCount: plan.keepCount,
    deleteCount: plan.deleteCount,
    reviewCount: plan.reviewCount,
    thresholds: plan.thresholds,
    actions: plan.actions.map((action) => ({
      action: action.action,
      sourceIndex: action.sourceIndex,
      rank: action.rank ?? null,
      snapshotId: action.summary.snapshotId,
      fileRef: action.summary.fileRef,
      filePathKind: action.summary.filePathKind,
      reasons: [...action.reasons].sort(),
      issueKinds: action.issues.map((issue) => issue.issueKind).sort(),
    })),
  };
}

function summarizeWebState(state) {
  return {
    sourceKind: state.sourceKind,
    phase: state.phase,
    status: state.status,
    localOnly: state.localOnly,
    dryRun: state.dryRun,
    durableWrites: state.durableWrites,
    dryRunReady: state.dryRunReady,
    entryCount: state.entryCount,
    keepCount: state.keepCount,
    deleteCount: state.deleteCount,
    reviewCount: state.reviewCount,
    advisoryDeleteCount: state.advisoryDeleteCount,
    warningKinds: state.warnings.map((warning) => warning.kind),
  };
}

function assertNoFixturePathEcho(text, files) {
  for (const file of files) {
    assert.equal(text.includes(file.path), false);
  }
}

function assertNoUnsafeText(text) {
  for (const marker of [
    ".codex-private",
    ".codex-run",
    "sovereignops-codex-pack",
    "CODEX_START_HERE",
  ]) {
    assert.equal(text.toLowerCase().includes(marker.toLowerCase()), false);
  }
  assert.equal(/[A-Za-z]:[\\/]/.test(text), false);
  assert.equal(/\\\\[^\\\s]+\\[^\\\s]+/.test(text), false);
  assert.equal(
    /(?:\/Users|\/home|\/root|\/tmp|\/var|\/etc|\/opt|\/private|\/mnt|\/Volumes)\//.test(
      text,
    ),
    false,
  );
  assert.equal(
    /\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|AKIA[0-9A-Z]{16})\b/.test(
      text,
    ),
    false,
  );
  assert.equal(/\block-token-[A-Za-z0-9_-]+\b/.test(text), false);
  assert.equal(/\block_[A-Za-z0-9_-]{4,}\b/.test(text), false);
}
"""


class WorkspaceSessionSnapshotRetentionCleanupInventoryE2ETests(unittest.TestCase):
    maxDiff = None

    def test_public_inventory_fixture_replays_across_runtime_surfaces(self) -> None:
        node = shutil.which("node")
        if node is None:
            self.skipTest("node executable is required for the fixture replay")

        fixture = read_json(FIXTURE_PATH)
        self.assertEqual(
            fixture["schemaVersion"],
            "workspace-session-snapshot-retention-cleanup-inventory-fixture/v1",
        )
        self.assertEqual(
            fixture["kind"],
            "workspace-session.snapshot-retention-cleanup.inventory-fixture",
        )
        self.assertIs(fixture["localOnly"], True)
        self.assertIs(fixture["dryRun"], True)
        self.assertIs(fixture["durableWrites"], False)
        assert_no_private_plan_or_raw_sensitive_output(
            self,
            FIXTURE_PATH.read_text(encoding="utf-8"),
        )

        result = subprocess.run(
            [node, "--input-type=module", "--eval", NODE_REPLAY_SCRIPT],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            self.fail(
                "Node snapshot retention cleanup inventory replay failed.\n"
                f"stdout:\n{result.stdout}\n"
                f"stderr:\n{result.stderr}"
            )

        replay = json.loads(result.stdout)
        self.assertEqual(replay["fixture"]["path"], FIXTURE_REL)
        self.assertEqual(replay["api"]["route"]["method"], "POST")
        self.assertEqual(
            replay["api"]["route"]["path"],
            "/v1/workspace-session/snapshot-retention-cleanup/inventory/preview",
        )

        for surface in (
            replay["sdk"]["stablePlanner"],
            replay["sdk"]["localPlanner"],
            replay["sdk"]["dryRunPlanner"],
            replay["sdk"]["apiRouteHelper"],
            replay["api"]["plan"],
            replay["cli"]["direct"]["plan"],
            replay["cli"]["dispatch"]["plan"],
        ):
            with self.subTest(surface=surface["kind"]):
                self.assertEqual(surface["entryCount"], 4)
                self.assertEqual(surface["keepCount"], 2)
                self.assertEqual(surface["deleteCount"], 1)
                self.assertEqual(surface["reviewCount"], 1)
                self.assertIs(surface["localOnly"], True)
                self.assertIs(surface["dryRun"], True)
                self.assertIs(surface["durableWrites"], False)

        for cli_surface in (replay["cli"]["direct"], replay["cli"]["dispatch"]):
            with self.subTest(cli=cli_surface["kind"]):
                self.assertIs(cli_surface["inventory"]["localOnly"], True)
                self.assertEqual(cli_surface["inventory"]["inspectedSections"], ["files"])
                self.assertIs(cli_surface["retention"]["previewOnly"], True)
                self.assertIs(cli_surface["retention"]["writes"], False)
                self.assertIs(cli_surface["retention"]["deletes"], False)
                self.assertIs(cli_surface["retention"]["mutation"], False)
                self.assertEqual(cli_surface["retention"]["wouldDeleteCount"], 1)
                self.assertEqual(cli_surface["retention"]["reviewCount"], 1)

        for state_name, state in replay["web"].items():
            with self.subTest(web_state=state_name):
                self.assertEqual(state["phase"], "success")
                self.assertEqual(state["status"], "attention")
                self.assertIs(state["localOnly"], True)
                self.assertIs(state["dryRun"], True)
                self.assertIs(state["durableWrites"], False)
                self.assertIs(state["dryRunReady"], True)
                self.assertEqual(state["advisoryDeleteCount"], 1)
                self.assertEqual(state["reviewCount"], 1)
                self.assertEqual(state["warningKinds"], [])

        optional_client = replay["sdk"]["optionalInventoryApiClient"]
        if optional_client["available"]:
            self.assertGreaterEqual(optional_client["fetchCallCount"], 1)
            self.assertEqual(optional_client["plan"]["deleteCount"], 1)
            self.assertEqual(optional_client["plan"]["reviewCount"], 1)
        else:
            self.assertEqual(
                optional_client["fallback"],
                "planFileBackedLocalWorkspaceSessionSnapshotRetentionCleanup",
            )

        assert_no_private_plan_or_raw_sensitive_output(
            self,
            json.dumps(replay, sort_keys=True),
        )


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def assert_no_private_plan_or_raw_sensitive_output(
    testcase: unittest.TestCase,
    text: str,
) -> None:
    lower_text = text.lower()

    for marker in PRIVATE_PATH_MARKERS:
        with testcase.subTest(marker=marker):
            testcase.assertNotIn(marker.lower(), lower_text)

    for pattern in RAW_PATH_PATTERNS:
        with testcase.subTest(pattern=pattern.pattern):
            testcase.assertIsNone(pattern.search(text))

    for pattern in RAW_SECRET_PATTERNS:
        with testcase.subTest(pattern=pattern.pattern):
            testcase.assertIsNone(pattern.search(text))


if __name__ == "__main__":
    unittest.main()
