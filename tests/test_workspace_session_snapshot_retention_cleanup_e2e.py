from __future__ import annotations

import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
FIXTURE_REL = "examples/workspace-session/snapshot-retention-cleanup.json"
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
    re.compile(r"\bsess_[a-z0-9_]{6,}\b"),
    re.compile(r"\bkey_[a-z0-9_]{6,}\b"),
)
RAW_PATH_PATTERNS = (
    re.compile(r"(?<![A-Za-z0-9])[A-Za-z]:[\\/]"),
    re.compile(r"\\\\[^\\\s]+\\[^\\\s]+"),
    re.compile(
        r"(?<![A-Za-z0-9_])/(?:Users|home|root|tmp|var|etc|opt|private|mnt|Volumes)(?:/|\b)"
    ),
    re.compile(r"(?<![A-Za-z0-9_])workspaces[\\/]"),
)

NODE_REPLAY_SCRIPT = r"""
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { createApiRouter } from "./apps/api/src/router.ts";
import {
  createWorkspaceSessionSnapshotRetentionCleanupRoutes,
} from "./apps/api/src/workspaceSessionSnapshotRetentionCleanupRoutes.ts";
import {
  loadWorkspaceSessionSnapshotRetentionCleanupInput,
  runWorkspaceSessionSnapshotRetentionCleanupCli,
} from "./packages/cli/src/workspaceSessionSnapshotRetentionCleanup.ts";
import {
  planFileBackedLocalWorkspaceSessionSnapshotRetentionCleanup,
  planLocalWorkspaceSessionSnapshotRetentionCleanup,
  planSnapshotRetentionCleanupDryRun,
} from "./packages/sdk-js/src/localWorkspaceSessionSnapshotRetention.ts";
import {
  buildWorkspaceSessionSnapshotRetentionCleanupState,
} from "./apps/web/src/workspaceSessionSnapshotRetentionCleanupState.ts";

const fixturePath = "examples/workspace-session/snapshot-retention-cleanup.json";
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
const expectedPlan = fixture.cleanupPlan;
const runtimeInput = runtimeInputFromFixture(fixture);
const route = parseRoute(fixture.commandContracts.apiPreviewRoute);

assert.equal(fixture.schemaVersion, "local-workspace-session-snapshot-retention/v1");
assert.equal(fixture.kind, "workspace-session.snapshot-retention-cleanup.dry-run");
assert.equal(fixture.localOnly, true);
assert.equal(fixture.dryRun, true);
assert.equal(fixture.durableWrites, false);
assert.equal(fixture.rawRequestBodyRetained, false);

const loadedDirectInput = await loadWorkspaceSessionSnapshotRetentionCleanupInput(
  fixturePath,
  { cwd: process.cwd() },
);
assert.equal(loadedDirectInput.records.length, fixture.input.records.length);
assert.equal(loadedDirectInput.maxCount, fixture.input.maxCount);
assert.equal(loadedDirectInput.maxAgeMs, fixture.input.maxAgeMs);
assert.equal(loadedDirectInput.now, fixture.input.now);

const sdkPlan = planSnapshotRetentionCleanupDryRun(runtimeInput);
const sdkLocalPlan = planLocalWorkspaceSessionSnapshotRetentionCleanup(runtimeInput);
const sdkFileBackedPlan = planFileBackedLocalWorkspaceSessionSnapshotRetentionCleanup(
  runtimeInput,
);
assertPlanMatchesFixtureIntent(sdkPlan, expectedPlan);
assert.deepEqual(planIntent(sdkLocalPlan), planIntent(expectedPlan));
assert.deepEqual(planIntent(sdkFileBackedPlan), planIntent(expectedPlan));
assert.equal(Object.isFrozen(sdkPlan), true);
assert.equal(JSON.stringify(sdkPlan).includes("[redacted:path:"), false);

const router = createApiRouter(createWorkspaceSessionSnapshotRetentionCleanupRoutes());
const apiPreview = await router.dispatch({
  method: route.method,
  path: route.path,
  body: runtimeInput,
});
assert.equal(apiPreview.status, 200, JSON.stringify(apiPreview.body));
assert.match(apiPreview.headers["content-type"], /^application\/json/);
assertPlanMatchesFixtureIntent(apiPreview.body, expectedPlan);

const directCli = await runWorkspaceSessionSnapshotRetentionCleanupCli([
  "workspace-session",
  "snapshot",
  "retention-cleanup",
  "preview",
  "--fixture",
  fixturePath,
], {
  cwd: process.cwd(),
});
assert.ok(directCli);
assert.equal(directCli.exitCode, 0);
assert.equal(directCli.stderr, "");
const directCliBody = JSON.parse(directCli.stdout);
assert.equal(directCliBody.kind, "workspace-session-snapshot-retention-cleanup.preview");
assert.equal(directCliBody.fixture.path, fixturePath);
assert.equal(directCliBody.retention.previewOnly, true);
assert.equal(directCliBody.retention.writes, false);
assert.equal(directCliBody.retention.deletes, false);
assert.equal(directCliBody.retention.mutation, false);
assert.deepEqual(directCliBody.retention.inspectedSections, ["records"]);
assert.equal(directCliBody.plan.entryCount, fixture.input.records.length);
assert.equal(directCliBody.plan.localOnly, true);
assert.equal(directCliBody.plan.dryRun, true);
assert.equal(directCliBody.plan.durableWrites, false);

const tempDir = path.join(
  process.cwd(),
  "tests",
  ".tmp-workspace-session-snapshot-retention-cleanup-e2e",
);
const replayFixturePath = path.join(tempDir, "snapshot-retention-cleanup-runtime.json");
const replayFixtureRel = path.relative(process.cwd(), replayFixturePath).split(path.sep).join("/");
let cliReplayBody;
try {
  await mkdir(tempDir, { recursive: true });
  await writeFile(
    replayFixturePath,
    `${JSON.stringify({
      schemaVersion: fixture.schemaVersion,
      kind: fixture.kind,
      generatedAt: fixture.generatedAt,
      input: runtimeInput,
    }, null, 2)}\n`,
  );

  const cliReplay = await runWorkspaceSessionSnapshotRetentionCleanupCli([
    "workspace-session-snapshot-retention-cleanup",
    "preview",
    "--fixture",
    replayFixtureRel,
  ], {
    cwd: process.cwd(),
  });
  assert.ok(cliReplay);
  assert.equal(cliReplay.exitCode, 0);
  assert.equal(cliReplay.stderr, "");
  cliReplayBody = JSON.parse(cliReplay.stdout);
  assert.equal(cliReplayBody.fixture.path, replayFixtureRel);
  assert.deepEqual(cliReplayBody.retention.inspectedSections, ["records"]);
  assert.equal(cliReplayBody.retention.previewOnly, true);
  assert.equal(cliReplayBody.retention.writes, false);
  assert.equal(cliReplayBody.retention.deletes, false);
  assert.equal(cliReplayBody.retention.mutation, false);
  assertPlanMatchesFixtureIntent(cliReplayBody.plan, expectedPlan);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

const webFixtureState = buildWorkspaceSessionSnapshotRetentionCleanupState(fixture);
const webSdkState = buildWorkspaceSessionSnapshotRetentionCleanupState(sdkPlan);
const webApiState = buildWorkspaceSessionSnapshotRetentionCleanupState({
  response: apiPreview,
});
const webCliState = buildWorkspaceSessionSnapshotRetentionCleanupState(cliReplayBody);

for (const state of [webFixtureState, webSdkState, webApiState, webCliState]) {
  assert.equal(state.phase, "success");
  assert.equal(state.status, "attention");
  assert.equal(state.entryCount, expectedPlan.entryCount);
  assert.equal(state.keepCount, expectedPlan.keepCount);
  assert.equal(state.deleteCount, expectedPlan.deleteCount);
  assert.equal(state.reviewCount, expectedPlan.reviewCount);
  assert.equal(state.dryRunReady, true);
  assert.deepEqual(state.warnings.map((warning) => warning.kind), []);
  assert.equal(state.errorStates.length, 0);
}

const replay = {
  fixture: {
    path: fixturePath,
    schemaVersion: fixture.schemaVersion,
    kind: fixture.kind,
  },
  sdk: summarizePlan(sdkPlan),
  api: {
    route,
    plan: summarizePlan(apiPreview.body),
  },
  cli: {
    direct: {
      kind: directCliBody.kind,
      fixture: directCliBody.fixture,
      retention: directCliBody.retention,
      plan: summarizePlan(directCliBody.plan),
    },
    replay: {
      kind: cliReplayBody.kind,
      fixture: cliReplayBody.fixture,
      retention: cliReplayBody.retention,
      plan: summarizePlan(cliReplayBody.plan),
    },
  },
  web: {
    fixture: summarizeWebState(webFixtureState),
    sdk: summarizeWebState(webSdkState),
    api: summarizeWebState(webApiState),
    cli: summarizeWebState(webCliState),
  },
};
assertNoUnsafeText(JSON.stringify(replay));
console.log(JSON.stringify(replay));

function runtimeInputFromFixture(value) {
  return {
    records: value.input.records.map(runtimeRecordFromFixtureRecord),
    maxCount: value.input.maxCount,
    maxAgeMs: value.input.maxAgeMs,
    now: value.input.now,
  };
}

function runtimeRecordFromFixtureRecord(record) {
  return optionalFields({
    sourceKind: record.sourceKind,
    snapshotId: safeAlias(record.snapshotRef, "snapshot"),
    workspaceId: safeAlias(record.workspaceRef, "workspace"),
    deviceId: safeAlias(record.deviceRef, "device"),
    label: record.snapshotRef,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    eventCount: record.operationCount,
    sizeBytes: record.sizeBytes,
    fingerprint: record.fingerprint,
    snapshotFingerprint: record.fingerprint,
  });
}

function safeAlias(ref, prefix) {
  assert.equal(typeof ref, "string");
  const match = /^\[redacted:[A-Za-z0-9_-]+:([A-Za-z0-9_-]+)\]$/.exec(ref);
  assert.ok(match, `fixture reference must already be redacted: ${ref}`);
  const suffix = match[1]
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${prefix}-${suffix || "unknown"}`;
}

function parseRoute(value) {
  const match = /^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)$/.exec(value);
  assert.ok(match, `invalid route contract: ${value}`);
  return {
    method: match[1],
    path: match[2],
  };
}

function optionalFields(record) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );
}

function assertPlanMatchesFixtureIntent(actual, expected) {
  assert.equal(actual.kind, expected.kind);
  assert.equal(actual.schemaVersion, expected.schemaVersion);
  assert.equal(actual.localOnly, true);
  assert.equal(actual.dryRun, true);
  assert.equal(actual.durableWrites, false);
  assert.deepEqual(planIntent(actual), planIntent(expected));
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
      reasons: [...action.reasons].sort(),
      issueKinds: action.issues.map((issue) => issue.issueKind).sort(),
    })),
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
    actions: plan.actions.map((action) => ({
      action: action.action,
      sourceIndex: action.sourceIndex,
      rank: action.rank ?? null,
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
    entryCount: state.entryCount,
    keepCount: state.keepCount,
    deleteCount: state.deleteCount,
    reviewCount: state.reviewCount,
    dryRunReady: state.dryRunReady,
    warningKinds: state.warnings.map((warning) => warning.kind),
  };
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
  assert.equal(/(?:\/Users|\/home|\/root|\/tmp|\/var|\/etc|\/opt|\/private|\/mnt|\/Volumes)\//.test(text), false);
  assert.equal(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|AKIA[0-9A-Z]{16})\b/.test(text), false);
}
"""


class WorkspaceSessionSnapshotRetentionCleanupE2ETests(unittest.TestCase):
    maxDiff = None

    def test_public_fixture_replays_across_runtime_surfaces(self) -> None:
        node = shutil.which("node")
        if node is None:
            self.skipTest("node executable is required for the fixture replay")

        fixture = read_json(FIXTURE_PATH)
        self.assertEqual(
            fixture["schemaVersion"],
            "local-workspace-session-snapshot-retention/v1",
        )
        self.assertEqual(
            fixture["kind"],
            "workspace-session.snapshot-retention-cleanup.dry-run",
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
                "Node snapshot retention cleanup replay failed.\n"
                f"stdout:\n{result.stdout}\n"
                f"stderr:\n{result.stderr}"
            )

        replay = json.loads(result.stdout)
        self.assertEqual(replay["fixture"]["path"], FIXTURE_REL)
        self.assertEqual(replay["fixture"]["schemaVersion"], fixture["schemaVersion"])
        self.assertEqual(replay["sdk"]["keepCount"], fixture["cleanupPlan"]["keepCount"])
        self.assertEqual(replay["sdk"]["deleteCount"], fixture["cleanupPlan"]["deleteCount"])
        self.assertEqual(replay["sdk"]["reviewCount"], fixture["cleanupPlan"]["reviewCount"])
        self.assertEqual(replay["api"]["route"]["path"], fixture["commandContracts"]["apiPreviewRoute"].split()[1])
        self.assertEqual(replay["api"]["plan"]["entryCount"], fixture["cleanupPlan"]["entryCount"])
        self.assertEqual(replay["cli"]["direct"]["fixture"]["path"], FIXTURE_REL)
        self.assertEqual(replay["cli"]["direct"]["retention"]["inspectedSections"], ["records"])
        self.assertEqual(replay["cli"]["replay"]["plan"]["keepCount"], fixture["cleanupPlan"]["keepCount"])
        self.assertEqual(replay["web"]["fixture"]["phase"], "success")
        self.assertEqual(replay["web"]["sdk"]["phase"], "success")
        self.assertEqual(replay["web"]["api"]["phase"], "success")
        self.assertEqual(replay["web"]["cli"]["phase"], "success")

        combined_public_output = "\n".join(
            [
                FIXTURE_PATH.read_text(encoding="utf-8"),
                json.dumps(replay, sort_keys=True),
            ]
        )
        assert_no_private_plan_or_raw_sensitive_output(self, combined_public_output)


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
