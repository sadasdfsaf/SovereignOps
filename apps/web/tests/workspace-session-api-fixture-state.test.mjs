import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildWorkspaceSessionApiFixtureLoadingState,
  buildWorkspaceSessionApiFixturePersistenceReadiness,
  buildWorkspaceSessionApiFixtureRouteStatuses,
  buildWorkspaceSessionApiFixtureState,
  buildWorkspaceSessionApiFixtureSummaryCards,
} from "../src/workspaceSessionApiFixtureState.ts";

const generatedAt = "2026-04-28T00:10:00.000Z";
const rawStoragePath = "workspaces/wsp_session_alpha/session.json";
const rawUnsafePath = "C:\\Users\\DELL\\workspace-session\\session.json";

async function readPublicFixture() {
  const url = new URL(
    "../../../examples/workspace-session/api-requests.json",
    import.meta.url,
  );
  return JSON.parse(await readFile(url, "utf8"));
}

function assertNoBodyLeak(value, rawValues) {
  const serialized = JSON.stringify(value);
  for (const raw of rawValues) {
    assert.equal(
      serialized.includes(raw),
      false,
      `fixture state leaked raw body value: ${raw}`,
    );
    assert.equal(
      serialized.includes(raw.replaceAll("\\", "\\\\")),
      false,
      `fixture state leaked escaped raw body value: ${raw}`,
    );
  }
  assert.equal(serialized.includes('"requestBody"'), false);
  assert.equal(serialized.includes('"responseBody"'), false);
  assert.equal(serialized.includes('"storagePath"'), false);
}

function buildUnsafePersistenceFixture() {
  return {
    schemaVersion: "workspace-session-api-requests/v1",
    generatedAt,
    requests: [
      {
        id: "unsafe_summary",
        method: "POST",
        path: "/v1/workspace-session/summary",
        expected: {
          status: 200,
        },
        actual: {
          status: 200,
          body: {
            kind: "workspace-session.summary",
            schemaVersion: "workspace-session-api/v1",
            localOnly: false,
            durableWrites: true,
            storage: {
              localOnly: false,
              storagePath: rawUnsafePath,
              storagePathRedacted: false,
            },
            redaction: {
              rawPathsStored: true,
              rawLockMaterialStored: true,
            },
          },
        },
        matches: {
          status: true,
        },
      },
    ],
  };
}

function buildMismatchFixture() {
  return {
    generatedAt,
    requests: [
      {
        id: "mismatch_summary",
        method: "POST",
        path: "/v1/workspace-session/summary",
        expected: {
          status: 200,
        },
        actual: {
          status: 503,
          body: {
            error: {
              message: `Snapshot failed at ${rawUnsafePath}`,
            },
          },
        },
        matches: {
          status: false,
        },
      },
    ],
  };
}

async function testPublicFixtureBuildsSafeRouteAndPersistenceState() {
  const fixture = await readPublicFixture();
  const original = structuredClone(fixture);
  const state = buildWorkspaceSessionApiFixtureState(fixture);

  assert.deepEqual(fixture, original);
  assert.equal(state.id, "workspace_session_api_fixture");
  assert.equal(state.phase, "success");
  assert.equal(state.generatedAt, generatedAt);
  assert.equal(state.schemaVersion, "workspace-session-api-requests/v1");
  assert.equal(state.status, "ready");
  assert.equal(state.routeCount, 2);
  assert.equal(state.successfulRouteCount, 2);
  assert.equal(state.failedRouteCount, 0);
  assert.equal(state.localOnly, true);
  assert.equal(state.rawBodyRetained, false);
  assert.equal(state.redactionCount, 6);

  assert.deepEqual(
    state.routeStatuses.map((route) => [
      route.routeId,
      route.title,
      route.label,
      route.status,
      route.statusCode,
      route.localOnly,
      route.redactionCount,
      route.rawRetentionRisk,
    ]),
    [
      [
        "workspace_session_summary",
        "POST Workspace Session Summary",
        "POST /v1/workspace-session/summary",
        "success",
        200,
        true,
        0,
        false,
      ],
      [
        "workspace_session_audit_preview",
        "POST Workspace Session Audit Preview",
        "POST /v1/workspace-session/audit-preview",
        "success",
        200,
        true,
        6,
        false,
      ],
    ],
  );

  assert.equal(state.persistenceReadiness.status, "ready");
  assert.equal(state.persistenceReadiness.ready, true);
  assert.equal(
    state.persistenceReadiness.label,
    "Ready for local snapshot",
  );
  assert.equal(state.persistenceReadiness.rawBodyRetained, false);
  assert.equal(state.persistenceReadiness.durableWriteCount, 0);
  assert.equal(state.persistenceReadiness.rawRetentionRiskCount, 0);
  assert.match(
    state.persistenceReadiness.detailLabels.join(" "),
    /0 raw bodies retained/,
  );

  assert.deepEqual(
    state.summaryCards.map((card) => [
      card.label,
      card.value,
      card.status,
      card.redactionCount,
    ]),
    [
      ["Route status", "2 routes", "success", 6],
      ["Persistence readiness", "Ready for local snapshot", "ready", 6],
      ["Redactions", "6 redactions", "attention", 6],
      ["Raw body retention", "Not retained", "ready", 0],
    ],
  );

  assert.equal(state.apiState.requestCount, 2);
  assertNoBodyLeak(state, [rawStoragePath, "manual open", "idle timeout"]);
}

async function testFocusedBuildersAndExpectedRouteAttention() {
  const fixture = await readPublicFixture();

  const routes = buildWorkspaceSessionApiFixtureRouteStatuses(fixture);
  assert.deepEqual(
    routes.map((route) => [route.routeId, route.status, route.redactionCount]),
    [
      ["workspace_session_summary", "success", 0],
      ["workspace_session_audit_preview", "success", 6],
    ],
  );

  const readiness = buildWorkspaceSessionApiFixturePersistenceReadiness(
    fixture,
    {
      expectedRouteCount: 3,
    },
  );
  assert.equal(readiness.status, "attention");
  assert.equal(readiness.ready, false);
  assert.match(readiness.detailLabels.join(" "), /1 missing route/);

  assert.deepEqual(
    buildWorkspaceSessionApiFixtureSummaryCards(fixture).map((card) => [
      card.id,
      card.value,
    ]),
    [
      ["workspace_session_api_fixture.summary.routes", "2 routes"],
      [
        "workspace_session_api_fixture.summary.persistence",
        "Ready for local snapshot",
      ],
      ["workspace_session_api_fixture.summary.redactions", "6 redactions"],
      ["workspace_session_api_fixture.summary.body_retention", "Not retained"],
    ],
  );
}

function testUnsafePersistenceSignalsBlockSnapshotReadiness() {
  const fixture = buildUnsafePersistenceFixture();
  const state = buildWorkspaceSessionApiFixtureState(fixture);

  assert.equal(state.phase, "success");
  assert.equal(state.status, "blocked");
  assert.equal(state.routeStatuses[0].status, "success");
  assert.equal(state.routeStatuses[0].matched, true);
  assert.equal(state.routeStatuses[0].localOnly, false);
  assert.equal(state.routeStatuses[0].durableWrites, true);
  assert.equal(state.routeStatuses[0].rawRetentionRisk, true);
  assert.equal(state.persistenceReadiness.status, "blocked");
  assert.equal(state.persistenceReadiness.ready, false);
  assert.equal(state.persistenceReadiness.localOnly, false);
  assert.equal(state.persistenceReadiness.durableWriteCount, 1);
  assert.equal(state.persistenceReadiness.rawRetentionRiskCount, 3);
  assert.equal(state.persistenceReadiness.rawBodyRetained, false);
  assertNoBodyLeak(state, [rawUnsafePath]);
}

function testMismatchAndLoadingStatesAreDeterministic() {
  const mismatch = buildWorkspaceSessionApiFixtureState(buildMismatchFixture());
  assert.equal(mismatch.phase, "error");
  assert.equal(mismatch.status, "error");
  assert.equal(mismatch.routeStatuses[0].status, "error");
  assert.equal(mismatch.routeStatuses[0].matched, false);
  assert.equal(mismatch.routeStatuses[0].expectedStatus, 200);
  assert.equal(mismatch.routeStatuses[0].statusCode, 503);
  assertNoBodyLeak(mismatch, [rawUnsafePath]);

  const loading = buildWorkspaceSessionApiFixtureLoadingState({
    defaultTimestamp: generatedAt,
  });
  assert.equal(loading.phase, "loading");
  assert.equal(loading.status, "loading");
  assert.equal(loading.generatedAt, generatedAt);
  assert.equal(loading.routeStatuses[0].status, "loading");
  assert.equal(loading.persistenceReadiness.status, "loading");
  assert.equal(loading.rawBodyRetained, false);
}

function testCloneBoundary() {
  const fixture = buildUnsafePersistenceFixture();
  const state = buildWorkspaceSessionApiFixtureState(fixture);

  state.routeStatuses[0].detailLabels.push("mutated");
  state.persistenceReadiness.detailLabels.push("mutated");
  state.summaryCards[0].detailLabels.push("mutated");
  state.apiState.requestCards[0].detailLabels.push("mutated");

  const rebuilt = buildWorkspaceSessionApiFixtureState(fixture);
  assert.equal(
    rebuilt.routeStatuses[0].detailLabels.includes("mutated"),
    false,
  );
  assert.equal(
    rebuilt.persistenceReadiness.detailLabels.includes("mutated"),
    false,
  );
  assert.equal(rebuilt.summaryCards[0].detailLabels.includes("mutated"), false);
  assert.equal(
    rebuilt.apiState.requestCards[0].detailLabels.includes("mutated"),
    false,
  );
}

await testPublicFixtureBuildsSafeRouteAndPersistenceState();
await testFocusedBuildersAndExpectedRouteAttention();
testUnsafePersistenceSignalsBlockSnapshotReadiness();
testMismatchAndLoadingStatesAreDeterministic();
testCloneBoundary();

console.log("workspace session api fixture state tests passed");
