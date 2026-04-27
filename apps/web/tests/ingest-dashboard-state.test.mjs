import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildIngestDashboardCards,
  buildIngestDashboardSections,
  buildIngestDashboardState,
} from "../src/ingestDashboardState.ts";

const ingestApiFixture = readFixture("api-requests.json");
const connectorApiFixture = readFixture("connector-api-requests.json");

function testDashboardCompositionFromCapturedFixtures() {
  const originalIngest = structuredClone(ingestApiFixture);
  const originalConnector = structuredClone(connectorApiFixture);
  const state = buildIngestDashboardState(ingestApiFixture, connectorApiFixture);

  assert.deepEqual(ingestApiFixture, originalIngest);
  assert.deepEqual(connectorApiFixture, originalConnector);
  assert.equal(state.id, "ingest_dashboard_state");
  assert.equal(state.generatedAt, "2026-04-27T20:30:00.000Z");
  assert.equal(state.status, "attention");
  assert.equal(state.localOnly, true);
  assert.equal(state.noNetwork, true);
  assert.equal(state.redacted, false);
  assert.equal(state.redactionCount, 0);

  assert.deepEqual(
    state.cards.map((card) => card.id),
    [
      "ingest_dashboard_card.connectors",
      "ingest_dashboard_card.sources",
      "ingest_dashboard_card.indexed_items",
      "ingest_dashboard_card.search_results",
      "ingest_dashboard_card.quarantine_pending",
      "ingest_dashboard_card.warnings",
      "ingest_dashboard_card.errors",
      "ingest_dashboard_card.redactions",
    ],
  );
  assert.deepEqual(
    state.sections.map((section) => section.id),
    [
      "overview",
      "connectors",
      "sources",
      "search",
      "quarantine",
      "warnings",
      "errors",
    ],
  );

  assert.equal(state.summary.connectorRequestCount, 3);
  assert.equal(state.summary.successfulConnectorRequestCount, 3);
  assert.equal(state.summary.failedConnectorRequestCount, 0);
  assert.equal(state.summary.connectorCount, 3);
  assert.equal(state.summary.readyConnectorCount, 3);
  assert.equal(state.summary.ingestSourceCount, 3);
  assert.equal(state.summary.readySourceCount, 2);
  assert.equal(state.summary.attentionSourceCount, 1);
  assert.equal(state.summary.indexedItemCount, 4);
  assert.equal(state.summary.queuedItemCount, 0);
  assert.equal(state.summary.quarantinedSourceItemCount, 1);
  assert.equal(state.summary.searchResultCount, 1);
  assert.equal(state.summary.quarantineTotalCount, 1);
  assert.equal(state.summary.quarantinePendingCount, 0);
  assert.equal(state.summary.quarantineDecidedCount, 1);
  assert.equal(state.summary.warningCount, 0);
  assert.equal(state.summary.errorCount, 0);

  assert.equal(state.connectorReadiness.status, "ready");
  assert.equal(state.connectorReadiness.statusLabel, "Ready");
  assert.equal(state.connectorReadiness.connectorCount, 3);
  assert.deepEqual(
    state.connectorApiState.rows.map((row) => [
      row.connectorId,
      row.safetyState,
      row.readinessStatus,
    ]),
    [
      ["local.files", "untrusted", "ready"],
      ["local.manual", "untrusted", "ready"],
      ["local.workspace-index", "safe", "ready"],
    ],
  );
  assert.deepEqual(
    state.ingestApiState.sourceCards.map((card) => [
      card.title,
      card.status,
      card.indexedCount,
      card.quarantinedCount,
    ]),
    [
      ["records.csv", "attention", 2, 1],
      ["notes.md", "ready", 1, 0],
      ["records.json", "ready", 1, 0],
    ],
  );
  assert.deepEqual(
    state.ingestApiState.searchRows.map((row) => [row.resultId, row.scoreLabel]),
    [["idx_json_beta", "100% match"]],
  );
  assert.deepEqual(
    state.ingestApiState.quarantineQueue.items.map((item) => [
      item.itemId,
      item.decision,
    ]),
    [["qtn_csv_beta_status", "release"]],
  );
}

function testDashboardSectionsAndWrapperBuilders() {
  const cards = buildIngestDashboardCards(ingestApiFixture, connectorApiFixture);
  const sections = buildIngestDashboardSections(
    ingestApiFixture,
    connectorApiFixture,
  );
  const sectionById = new Map(sections.map((section) => [section.id, section]));

  assert.equal(cards.length, 8);
  assert.equal(cards[0].valueLabel, "3 connectors");
  assert.equal(sectionById.get("overview").count, 2);
  assert.equal(sectionById.get("connectors").count, 3);
  assert.equal(sectionById.get("sources").status, "attention");
  assert.equal(sectionById.get("search").count, 1);
  assert.equal(sectionById.get("quarantine").status, "ready");
  assert.equal(sectionById.get("warnings").emptyState.label, "No warnings");
  assert.equal(sectionById.get("errors").emptyState.label, "No errors");
}

function testSyntheticSecretsAndPathsAreRedacted() {
  const secret = "sk-dashboardsecret1234567890";
  const rawPath = "C:\\Users\\DELL\\.codex-private\\round49\\private-plan-pack.json";
  const ingest = {
    schemaVersion: "ingest-search-api-requests.v1",
    generatedAt: "2026-04-27T10:00:00.000Z",
    requests: [
      {
        id: "api_search_secret_error",
        title: `Search ${secret}`,
        route: {
          method: "POST",
          path: "/v1/search/query",
        },
        request: {
          body: {
            query: `token=${secret}`,
            sourceUri: `file:///${rawPath.replaceAll("\\", "/")}`,
          },
        },
        response: {
          status: 503,
          body: {
            error: {
              message: `Index failed at ${rawPath} with authorization=${secret}`,
            },
          },
        },
      },
    ],
  };
  const connector = {
    schemaVersion: "ingest-connector-api-requests.v1",
    generatedAt: "2026-04-27T11:00:00.000Z",
    id: "sdk_connector_secret",
    method: "get",
    routePath: `/v1/ingest/connectors?token=${secret}`,
    status: 500,
    message: `Connector failed at ${rawPath} with authorization=${secret}`,
    data: {
      profiles: [
        {
          profileId: "Secret Profile",
          connector: "markdown",
          mediaTypes: ["text/markdown"],
          citationCapabilities: ["line-range"],
          safety: {
            localOnly: true,
            networkAccess: false,
            durableWrites: false,
            untrustedByDefault: true,
          },
          defaultOptions: {
            apiKey: secret,
          },
          notes: rawPath,
        },
      ],
    },
  };

  const state = buildIngestDashboardState(ingest, connector);
  const serialized = JSON.stringify(state);

  assert.equal(state.status, "error");
  assert.equal(state.summary.warningCount, 3);
  assert.equal(state.summary.errorCount, 2);
  assert.equal(state.redacted, true);
  assert.equal(state.redactionCount >= 6, true);
  assert.deepEqual(
    [...new Set(state.warnings.map((warning) => warning.code))].sort(),
    ["private_path_input", "raw_path_input", "secret_input"],
  );
  assert.deepEqual(
    state.errors.map((error) => [error.source, error.context, error.status]),
    [
      ["ingest", "search", 503],
      ["connector", "response", 500],
    ],
  );
  assert.equal(
    state.errors.every((error) => error.description.includes("[redacted-")),
    true,
  );
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes(rawPath), false);
  assert.equal(serialized.includes("C:\\Users\\DELL"), false);
  assert.equal(serialized.includes(".codex-private"), false);
  assert.equal(serialized.includes("private-plan-pack"), false);
  assert.equal(serialized.includes("[redacted-secret]"), true);
  assert.equal(serialized.includes("[redacted-path]"), true);
}

function testDashboardOutputIsDeepFrozenAndCloned() {
  const ingest = structuredClone(ingestApiFixture);
  const connector = structuredClone(connectorApiFixture);
  const state = buildIngestDashboardState(ingest, connector);

  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.cards), true);
  assert.equal(Object.isFrozen(state.cards[0].detailLabels), true);
  assert.equal(Object.isFrozen(state.sections[0].items), true);
  assert.equal(Object.isFrozen(state.ingestApiState.searchRows[0].snippet.segments), true);
  assert.equal(Object.isFrozen(state.connectorApiState.rows[0].warningLabels), true);
  assert.throws(() => {
    state.cards.push({ id: "mutated" });
  }, TypeError);
  assert.throws(() => {
    state.ingestApiState.sourceCards[0].title = "mutated";
  }, TypeError);

  ingest.requests[2].response.body.sources[0].sourceUri = "fixture://mutated";
  connector.requests[0].expect.body.connectors[0].id = "mutated";
  assert.equal(state.ingestApiState.sourceCards[1].title, "notes.md");
  assert.equal(state.connectorApiState.rows[0].connectorId, "local.files");
}

function readFixture(name) {
  const url = new URL(`../../../examples/ingest-search/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8"));
}

testDashboardCompositionFromCapturedFixtures();
testDashboardSectionsAndWrapperBuilders();
testSyntheticSecretsAndPathsAreRedacted();
testDashboardOutputIsDeepFrozenAndCloned();

console.log("ingest dashboard state tests passed");
