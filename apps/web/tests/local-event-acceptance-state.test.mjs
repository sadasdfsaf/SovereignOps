import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildLocalEventAcceptanceApiPanel,
  buildLocalEventAcceptanceImportPlanPanel,
  buildLocalEventAcceptanceLoadingState,
  buildLocalEventAcceptanceReplayExportPanel,
  buildLocalEventAcceptanceSdkPanel,
  buildLocalEventAcceptanceState,
  buildLocalEventAcceptanceSummaryCards,
} from "../src/localEventAcceptanceState.ts";

async function readFixture(name) {
  const url = new URL(`../../../examples/local-events/${name}`, import.meta.url);
  return JSON.parse(await readFile(url, "utf8"));
}

async function readFixtures() {
  const [apiRequests, sdkSession, replayExport, importPlan] = await Promise.all([
    readFixture("api-requests.json"),
    readFixture("sdk-session.json"),
    readFixture("export-session.json"),
    readFixture("import-plan.json"),
  ]);

  return {
    apiRequests,
    sdkSession,
    replayExport,
    importPlan,
  };
}

async function testAcceptanceStateProjectsFixtureSetIntoCardsAndPanels() {
  const fixtures = await readFixtures();
  const original = structuredClone(fixtures);
  const state = buildLocalEventAcceptanceState(fixtures);

  assert.deepEqual(fixtures, original);
  assert.equal(state.phase, "success");
  assert.equal(state.status, "ready");
  assert.equal(state.generatedAt, "2026-04-27T12:34:00.000Z");
  assert.equal(state.sourceCount, 4);

  assert.equal(state.localOnly.localOnly, true);
  assert.equal(state.localOnly.sourceCount, 4);
  assert.equal(state.localOnly.localOnlyCount, 4);
  assert.deepEqual(state.localOnly.nonLocalSourceIds, []);
  assert.equal(state.localOnly.networkMode, "disabled");

  assert.equal(state.redactions.redactedEventCount, 3);
  assert.equal(state.redactions.redactedFieldCount, 3);
  assert.equal(state.redactions.importRedactedFieldCount, 2);
  assert.deepEqual(
    state.redactions.sources.map((source) => [
      source.sourceId,
      source.redactedEventCount ?? 0,
      source.redactedFieldCount ?? 0,
    ]),
    [
      ["api_requests", 3, 3],
      ["sdk_session", 3, 3],
      ["replay_export", 3, 3],
      ["import_plan", 0, 2],
    ],
  );

  assert.equal(state.replaySteps.apiRequestCount, 3);
  assert.equal(state.replaySteps.sdkStepCount, 4);
  assert.equal(state.replaySteps.fixtureFetchCallCount, 3);
  assert.equal(state.replaySteps.replayBatchCount, 2);
  assert.equal(state.replaySteps.replayEventCount, 5);
  assert.equal(state.replaySteps.preflightCheckCount, 5);
  assert.equal(state.replaySteps.importBatchCount, 2);

  assert.deepEqual(state.exportFormats.formats, ["jsonl", "csv", "package"]);
  assert.equal(state.exportFormats.formatCount, 3);
  assert.equal(state.exportFormats.stdoutOnly, true);
  assert.equal(state.exportFormats.writesOnlyWithOutputPath, true);

  assert.equal(state.importReadiness.ready, true);
  assert.equal(state.importReadiness.label, "Ready for dry run");
  assert.equal(state.importReadiness.dryRun, true);
  assert.equal(state.importReadiness.preflightCheckCount, 5);
  assert.equal(state.importReadiness.requiredCheckCount, 5);
  assert.equal(state.importReadiness.importBatchCount, 2);
  assert.equal(state.importReadiness.readyBatchCount, 2);

  assert.deepEqual(
    state.summaryCards.map((card) => [card.title, card.value, card.status]),
    [
      ["Local-only status", "Local only", "ready"],
      ["Redactions", "3 redacted fields", "attention"],
      ["Replay steps", "2 replay batches", "ready"],
      ["Export formats", "3 formats", "ready"],
      ["Import readiness", "Ready for dry run", "ready"],
    ],
  );

  assert.equal(state.panels.apiRequests.status, "ready");
  assert.equal(state.panels.apiRequests.metadata.requestCount, 3);
  assert.equal(state.panels.apiRequests.metadata.eventCount, 5);
  assert.equal(state.panels.apiRequests.metadata.replayBatchCount, 2);
  assert.deepEqual(
    state.panels.apiRequests.cards.map((card) => [
      card.metadata.requestId,
      card.metadata.method,
      card.metadata.routePath,
      card.metadata.statusCode,
      card.metadata.eventCount,
      card.metadata.replayBatchCount,
    ]),
    [
      [
        "local_event_catalog_get",
        "GET",
        "/v1/local-events/catalog",
        200,
        5,
        0,
      ],
      [
        "local_event_summary_get",
        "GET",
        "/v1/local-events/summary",
        200,
        5,
        0,
      ],
      [
        "local_event_replay_batches_get",
        "GET",
        "/v1/local-events/replay-batches",
        200,
        5,
        2,
      ],
    ],
  );

  assert.equal(state.panels.sdkSession.metadata.sdkStepCount, 4);
  assert.equal(state.panels.sdkSession.metadata.fixtureFetchCallCount, 3);
  assert.deepEqual(state.panels.sdkSession.metadata.exportFormats, [
    "jsonl",
    "csv",
    "package",
  ]);
  assert.equal(state.panels.sdkSession.cards[0].kind, "sdk_step");

  assert.equal(state.panels.replayExport.metadata.replayBatchCount, 2);
  assert.equal(state.panels.replayExport.metadata.eventCount, 5);
  assert.equal(state.panels.replayExport.metadata.networkMode, "disabled");
  assert.equal(state.panels.replayExport.cards[0].metadata.firstSequence, 1);
  assert.equal(state.panels.replayExport.cards[1].metadata.lastSequence, 5);

  assert.equal(state.panels.importPlan.status, "ready");
  assert.equal(state.panels.importPlan.metadata.ready, true);
  assert.equal(state.panels.importPlan.metadata.preflightCheckCount, 5);
  assert.equal(state.panels.importPlan.metadata.readyBatchCount, 2);
  assert.equal(
    state.panels.importPlan.cards.filter(
      (card) => card.kind === "import_preflight_check",
    ).length,
    5,
  );
}

async function testFocusedBuildersUseTheSameFixtureShapes() {
  const fixtures = await readFixtures();

  const apiPanel = buildLocalEventAcceptanceApiPanel(fixtures.apiRequests);
  assert.equal(apiPanel.value, "3 requests");
  assert.equal(apiPanel.metadata.redactedFieldCount, 3);
  assert.equal(apiPanel.cards[2].value, "HTTP 200");
  assert.match(apiPanel.cards[2].detailLabels.join(" "), /2 replay batches/);

  const sdkPanel = buildLocalEventAcceptanceSdkPanel(fixtures.sdkSession);
  assert.equal(sdkPanel.value, "4 SDK steps");
  assert.equal(sdkPanel.cards.length, 7);
  assert.equal(sdkPanel.metadata.importPreflightCheckCount, 5);

  const replayExportPanel = buildLocalEventAcceptanceReplayExportPanel(
    fixtures.replayExport,
  );
  assert.equal(replayExportPanel.value, "2 replay batches");
  assert.equal(replayExportPanel.metadata.redactedFieldCount, 3);
  assert.match(replayExportPanel.detailLabels.join(" "), /Network disabled/);

  const importPlanPanel = buildLocalEventAcceptanceImportPlanPanel(
    fixtures.importPlan,
  );
  assert.equal(importPlanPanel.value, "Ready for dry run");
  assert.equal(importPlanPanel.cards.length, 7);
  assert.deepEqual(
    importPlanPanel.cards
      .filter((card) => card.kind === "import_batch")
      .map((card) => [card.metadata.batchId, card.metadata.stage, card.status]),
    [
      ["local_event_replay_export_001_1_3", "ready", "ready"],
      ["local_event_replay_export_002_4_5", "ready", "ready"],
    ],
  );

  assert.deepEqual(
    buildLocalEventAcceptanceSummaryCards(fixtures).map((card) => [
      card.title,
      card.value,
    ]),
    [
      ["Local-only status", "Local only"],
      ["Redactions", "3 redacted fields"],
      ["Replay steps", "2 replay batches"],
      ["Export formats", "3 formats"],
      ["Import readiness", "Ready for dry run"],
    ],
  );
}

async function testLoadingMissingAndDefensiveCloning() {
  const fixtures = await readFixtures();

  const loading = buildLocalEventAcceptanceLoadingState({
    defaultTimestamp: "2026-04-27T00:00:00.000Z",
  });
  assert.equal(loading.phase, "loading");
  assert.equal(loading.status, "loading");
  assert.equal(loading.generatedAt, "2026-04-27T00:00:00.000Z");
  assert.equal(loading.summaryCards[0].value, "Review sources");

  const partial = buildLocalEventAcceptanceState({
    apiRequests: fixtures.apiRequests,
  });
  assert.equal(partial.status, "attention");
  assert.equal(partial.sourceCount, 1);
  assert.equal(partial.importReadiness.status, "empty");
  assert.equal(partial.panels.importPlan.emptyState.label, "No import plan");

  const state = buildLocalEventAcceptanceState(fixtures);
  state.summaryCards[0].detailLabels.push("mutated");
  state.summaryCards[3].metadata.formats.push("mutated");
  state.panels.sdkSession.cards[0].detailLabels.push("mutated");
  state.panels.replayExport.metadata.replayBatchCount = 999;
  state.redactions.sources[0].label = "mutated";

  const rebuilt = buildLocalEventAcceptanceState(fixtures);
  assert.equal(
    rebuilt.summaryCards[0].detailLabels.includes("mutated"),
    false,
  );
  assert.deepEqual(rebuilt.summaryCards[3].metadata.formats, [
    "jsonl",
    "csv",
    "package",
  ]);
  assert.equal(
    rebuilt.panels.sdkSession.cards[0].detailLabels.includes("mutated"),
    false,
  );
  assert.equal(rebuilt.panels.replayExport.metadata.replayBatchCount, 2);
  assert.equal(rebuilt.redactions.sources[0].label, "API summary");
}

await testAcceptanceStateProjectsFixtureSetIntoCardsAndPanels();
await testFocusedBuildersUseTheSameFixtureShapes();
await testLoadingMissingAndDefensiveCloning();

console.log("local event acceptance state tests passed");
