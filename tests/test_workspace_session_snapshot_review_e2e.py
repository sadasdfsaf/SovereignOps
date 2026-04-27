from __future__ import annotations

import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
FIXTURE_REL = "examples/workspace-session/snapshot-review.json"
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

import {
  createApiRouter,
} from "./apps/api/src/router.ts";
import {
  createWorkspaceSessionSnapshotReviewRoutes,
} from "./apps/api/src/workspaceSessionSnapshotReviewRoutes.ts";
import {
  runWorkspaceSessionSnapshotReviewCli,
  loadWorkspaceSessionSnapshotReviewFixture,
} from "./packages/cli/src/workspaceSessionSnapshotReview.ts";
import {
  compareLocalWorkspaceSessionSnapshots,
  previewLocalWorkspaceSessionSnapshotRetention,
} from "./packages/sdk-js/src/localWorkspaceSessionSnapshotReview.ts";
import {
  buildWorkspaceSessionSnapshotReviewState,
} from "./apps/web/src/workspaceSessionSnapshotReviewState.ts";

const fixturePath = "examples/workspace-session/snapshot-review.json";
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

const compareRoute = fixture.api.routes.find((route) => route.id === fixture.compare.routeId);
const retentionRoute = fixture.api.routes.find(
  (route) => route.id === fixture.retentionPreview.routeId,
);
assert.ok(compareRoute, "fixture compare route must be declared");
assert.ok(retentionRoute, "fixture retention-preview route must be declared");

const loadedFixture = await loadWorkspaceSessionSnapshotReviewFixture(fixturePath, {
  cwd: process.cwd(),
});
assert.equal(loadedFixture.schemaVersion, fixture.schemaVersion);
assert.equal(loadedFixture.kind, fixture.kind);
assert.equal(loadedFixture.baseline.snapshotRef, fixture.snapshots.baseline.snapshotRef);
assert.equal(loadedFixture.candidate.snapshotRef, fixture.snapshots.candidate.snapshotRef);
assert.equal(loadedFixture.records.length, fixture.retentionPreview.response.records.length);

const sdkBaseline = sdkRecordFromFixtureSnapshot(fixture.snapshots.baseline);
const sdkCandidate = sdkRecordFromFixtureSnapshot(fixture.snapshots.candidate);
const sdkCompare = compareLocalWorkspaceSessionSnapshots({
  baseline: sdkBaseline,
  candidate: sdkCandidate,
});
assert.equal(sdkCompare.kind, "localWorkspaceSessionSnapshotCompareSummary");
assert.equal(sdkCompare.changed, true);
assert.equal(sdkCompare.localOnly, true);
assert.equal(sdkCompare.durableWrites, false);
assert.equal(sdkCompare.baseline.snapshotId, fixture.snapshots.baseline.snapshotRef);
assert.equal(sdkCompare.candidate.snapshotId, fixture.snapshots.candidate.snapshotRef);
assert.equal(
  sdkCompare.baseline.operationCount,
  fixture.snapshots.baseline.operationCount,
);
assert.equal(
  sdkCompare.candidate.operationCount,
  fixture.snapshots.candidate.operationCount,
);

const sdkRetention = previewLocalWorkspaceSessionSnapshotRetention({
  records: [sdkBaseline, sdkCandidate],
  maxCount: 1,
});
assert.equal(sdkRetention.kind, "localWorkspaceSessionSnapshotRetentionPreview");
assert.equal(sdkRetention.localOnly, true);
assert.equal(sdkRetention.durableWrites, false);
assert.equal(sdkRetention.recordCount, 2);
assert.equal(sdkRetention.keepCount, 1);
assert.equal(sdkRetention.deleteCount, 1);
assert.deepEqual(
  sdkRetention.keepCandidates.map((candidate) => candidate.snapshotId),
  [fixture.snapshots.candidate.snapshotRef],
);

const router = createApiRouter(createWorkspaceSessionSnapshotReviewRoutes());
const baselinePreview = apiPreviewFromFixtureSnapshot(fixture.snapshots.baseline);
const candidatePreview = apiPreviewFromFixtureSnapshot(fixture.snapshots.candidate);
const apiCompare = await router.dispatch({
  method: compareRoute.method,
  path: compareRoute.path,
  body: {
    baseline: baselinePreview,
    candidate: candidatePreview,
  },
});
assert.equal(apiCompare.status, 200, JSON.stringify(apiCompare.body));
assert.equal(apiCompare.body.kind, fixture.compare.response.kind);
assert.equal(apiCompare.body.schemaVersion, fixture.schemaVersion);
assert.equal(apiCompare.body.localOnly, true);
assert.equal(apiCompare.body.durableWrites, false);
assert.equal(apiCompare.body.summary.baselineEventCount, fixture.snapshots.baseline.operationCount);
assert.equal(apiCompare.body.summary.candidateEventCount, fixture.snapshots.candidate.operationCount);

const apiRetention = await router.dispatch({
  method: retentionRoute.method,
  path: retentionRoute.path,
  body: {
    snapshots: [
      apiRecordFromFixtureSnapshot(fixture.snapshots.baseline),
      apiRecordFromFixtureSnapshot(fixture.snapshots.candidate),
    ],
    policy: {
      retainNewest: 1,
    },
  },
});
assert.equal(apiRetention.status, 200, JSON.stringify(apiRetention.body));
assert.equal(apiRetention.body.kind, fixture.retentionPreview.response.kind);
assert.equal(apiRetention.body.schemaVersion, fixture.schemaVersion);
assert.equal(apiRetention.body.localOnly, true);
assert.equal(apiRetention.body.durableWrites, false);
assert.equal(apiRetention.body.summary.totalSnapshotCount, 2);
assert.equal(apiRetention.body.summary.retainedSnapshotCount, 1);
assert.equal(apiRetention.body.summary.expiredSnapshotCount, 1);

const cliCompare = await runWorkspaceSessionSnapshotReviewCli([
  "workspace-session",
  "snapshot-review",
  "compare",
  "--fixture",
  fixturePath,
], {
  cwd: process.cwd(),
});
const cliRetention = await runWorkspaceSessionSnapshotReviewCli([
  "workspace-session",
  "snapshot-review",
  "retention-preview",
  "--fixture",
  fixturePath,
], {
  cwd: process.cwd(),
});
assert.ok(cliCompare);
assert.ok(cliRetention);
assert.equal(cliCompare.exitCode, 0);
assert.equal(cliCompare.stderr, "");
assert.equal(cliRetention.exitCode, 0);
assert.equal(cliRetention.stderr, "");
const cliCompareBody = JSON.parse(cliCompare.stdout);
const cliRetentionBody = JSON.parse(cliRetention.stdout);
assert.equal(cliCompareBody.kind, "workspace-session-snapshot-review.compare");
assert.equal(cliRetentionBody.kind, "workspace-session-snapshot-review.retention-preview");
assert.equal(cliCompareBody.schemaVersion, fixture.schemaVersion);
assert.equal(cliRetentionBody.schemaVersion, fixture.schemaVersion);
assert.equal(cliCompareBody.fixture.path, fixturePath);
assert.equal(cliRetentionBody.fixture.path, fixturePath);
assert.equal(cliCompareBody.summary.changed, true);
assert.equal(cliRetentionBody.retention.previewOnly, true);

const webFixtureState = buildWorkspaceSessionSnapshotReviewState(fixture);
const webCompareState = buildWorkspaceSessionSnapshotReviewState(apiCompare.body);
const webRetentionState = buildWorkspaceSessionSnapshotReviewState(apiRetention.body);
assert.equal(webFixtureState.kind, "mixed");
assert.equal(webFixtureState.phase, "success");
assert.equal(webFixtureState.errorStates.length, 0);
assert.equal(webCompareState.phase, "success");
assert.equal(webCompareState.errorStates.length, 0);
assert.equal(webRetentionState.phase, "success");
assert.equal(webRetentionState.retentionTotalCount, 2);
assert.equal(webRetentionState.errorStates.length, 0);

console.log(JSON.stringify({
  fixture: {
    path: fixturePath,
    schemaVersion: fixture.schemaVersion,
    kind: fixture.kind,
  },
  sdk: {
    compare: sdkCompare,
    retention: sdkRetention,
  },
  api: {
    compare: apiCompare.body,
    retention: apiRetention.body,
  },
  cli: {
    compare: cliCompareBody,
    retention: cliRetentionBody,
  },
  web: {
    fixture: summarizeWebState(webFixtureState),
    compare: summarizeWebState(webCompareState),
    retention: summarizeWebState(webRetentionState),
  },
}));

function operationNames(snapshot) {
  const names = ["open", "lock", "unlock", "open"];
  return Array.from({ length: snapshot.operationCount }, (_, index) => (
    names[index] ?? `operation_${index + 1}`
  ));
}

function actionForOperation(operation) {
  if (operation === "open") {
    return "workspace.session.opened";
  }
  if (operation === "lock") {
    return "workspace.session.locked";
  }
  if (operation === "unlock") {
    return "workspace.session.unlocked";
  }
  return `workspace.session.${operation}`;
}

function sdkRecordFromFixtureSnapshot(snapshot) {
  const operations = operationNames(snapshot);
  return {
    schemaVersion: fixture.schemaVersion,
    snapshotId: snapshot.snapshotRef,
    workspaceId: snapshot.workspaceRef,
    deviceId: snapshot.deviceRef,
    sessionId: snapshot.sessionIdRef,
    localOnly: true,
    redacted: true,
    rawSecretsStored: false,
    storagePathRedacted: true,
    eventCount: snapshot.operationCount,
    operations,
    cursor: String(snapshot.operationCount),
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.createdAt,
    redactedFields: [
      "storagePath",
      "displayPath",
      "lockToken",
      "sessionId",
      "rootKey",
    ],
  };
}

function apiPreviewFromFixtureSnapshot(snapshot) {
  const operations = operationNames(snapshot);
  const eventIds = operations.map((operation, index) => (
    `evt_snapshot_review_${operation}_${index + 1}`
  ));
  const auditIds = operations.map((operation, index) => (
    `aud_snapshot_review_${operation}_${index + 1}`
  ));
  return {
    kind: "workspace-session.snapshot-preview",
    schemaVersion: "workspace-session-store/v1",
    apiSchemaVersion: "workspace-session-api/v1",
    localOnly: true,
    durableWrites: false,
    redacted: true,
    fingerprint: snapshot.fingerprint,
    summary: {
      kind: "workspace-session.snapshot-summary",
      localOnly: true,
      redacted: true,
      workspaceId: snapshot.workspaceRef,
      deviceId: snapshot.deviceRef,
      sessionId: snapshot.sessionIdRef,
      operations,
      eventCount: operations.length,
      eventIds,
      auditRecordCount: operations.length,
      auditIds,
      auditActions: operations.map(actionForOperation),
    },
    auditPreview: {
      kind: "workspace-session.audit-preview",
      schemaVersion: "workspace-session-api/v1",
      localOnly: true,
      durableWrites: false,
      summary: {
        kind: "workspace-session.summary",
        localOnly: true,
        durableWrites: false,
        storage: {
          localOnly: true,
          storagePath: snapshot.storagePathRef,
          storagePathRedacted: true,
        },
      },
      events: operations.map((operation, index) => ({
        eventId: eventIds[index],
        payload: {
          operation,
          localOnly: true,
          storagePath: snapshot.storagePathRef,
          storagePathRedacted: true,
          ...(operation === "lock"
            ? { lock: { lockTokenRef: snapshot.lockTokenRef } }
            : {}),
        },
        cursor: String(index + 1),
        sequence: index + 1,
      })),
      audit: {
        kind: "workspace-session.audit-preview.records",
        localOnly: true,
        redacted: true,
        recordCount: operations.length,
        records: operations.map((operation, index) => ({
          auditId: auditIds[index],
          action: actionForOperation(operation),
          details: {
            storagePath: snapshot.storagePathRef,
            ...(operation === "lock"
              ? { lock: { lockTokenRef: snapshot.lockTokenRef } }
              : {}),
          },
        })),
      },
    },
  };
}

function apiRecordFromFixtureSnapshot(snapshot) {
  const preview = apiPreviewFromFixtureSnapshot(snapshot);
  return {
    kind: "workspace-session.snapshot-record",
    schemaVersion: "workspace-session-store/v1",
    localOnly: true,
    durableWrites: false,
    redacted: true,
    snapshotId: snapshot.snapshotRef,
    label: snapshot.role,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.createdAt,
    fingerprint: snapshot.fingerprint,
    snapshotFingerprint: snapshot.fingerprint,
    snapshot: preview,
  };
}

function summarizeWebState(state) {
  return {
    kind: state.kind,
    phase: state.phase,
    status: state.status,
    riskLevel: state.riskLevel,
    changedFieldCount: state.changedFieldCount,
    retentionTotalCount: state.retentionTotalCount,
    warningKinds: state.warnings.map((warning) => warning.kind),
  };
}
"""


class WorkspaceSessionSnapshotReviewE2ETests(unittest.TestCase):
    maxDiff = None

    def test_public_fixture_replays_across_runtime_surfaces(self) -> None:
        node = shutil.which("node")
        if node is None:
            self.skipTest("node executable is required for the fixture replay")

        fixture = read_json(FIXTURE_PATH)
        self.assertEqual(fixture["schemaVersion"], "workspace-session-snapshot-review/v1")
        self.assertEqual(fixture["kind"], "workspace-session.snapshot-review")

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
                "Node snapshot review replay failed.\n"
                f"stdout:\n{result.stdout}\n"
                f"stderr:\n{result.stderr}"
            )

        replay = json.loads(result.stdout)
        self.assertEqual(replay["fixture"]["path"], FIXTURE_REL)
        self.assertEqual(replay["fixture"]["schemaVersion"], fixture["schemaVersion"])
        self.assertEqual(replay["sdk"]["compare"]["changed"], True)
        self.assertEqual(replay["sdk"]["retention"]["recordCount"], 2)
        self.assertEqual(replay["api"]["compare"]["kind"], fixture["compare"]["response"]["kind"])
        self.assertEqual(
            replay["api"]["retention"]["kind"],
            fixture["retentionPreview"]["response"]["kind"],
        )
        self.assertEqual(replay["cli"]["compare"]["fixture"]["path"], FIXTURE_REL)
        self.assertEqual(replay["cli"]["retention"]["fixture"]["path"], FIXTURE_REL)
        self.assertEqual(replay["web"]["fixture"]["phase"], "success")
        self.assertEqual(replay["web"]["compare"]["phase"], "success")
        self.assertEqual(replay["web"]["retention"]["phase"], "success")

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
