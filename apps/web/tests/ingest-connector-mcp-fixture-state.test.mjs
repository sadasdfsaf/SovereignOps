import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildIngestConnectorMcpFixtureRequestCards,
  buildIngestConnectorMcpFixtureSafetySummary,
  buildIngestConnectorMcpFixtureState,
  buildIngestConnectorMcpFixtureSummaryCards,
} from "../src/ingestConnectorMcpFixtureState.ts";

const fixture = readFixture("connector-mcp-api-requests.json");

function testCheckedInFixtureBuildsDashboardSummary() {
  const original = structuredClone(fixture);
  const state = buildIngestConnectorMcpFixtureState(fixture);

  assert.deepEqual(fixture, original);
  assert.equal(state.id, "ingest_connector_mcp_fixture_state");
  assert.equal(state.label, "Ingest connector MCP fixture");
  assert.equal(state.generatedAt, "2026-04-27T22:30:00.000Z");
  assert.equal(state.schemaVersion, "ingest-connector-mcp-api-requests.v1");
  assert.equal(state.status, "ready");
  assert.equal(state.requestCount, 6);
  assert.equal(state.successfulRequestCount, 6);
  assert.equal(state.failedRequestCount, 0);
  assert.equal(state.resourceCount, 3);
  assert.equal(state.resourceSuccessCount, 2);
  assert.equal(state.previewSuccessCount, 2);
  assert.equal(state.connectorCount, 3);
  assert.deepEqual(state.connectorIds, [
    "local.files",
    "local.manual",
    "local.workspace-index",
  ]);
  assert.equal(state.localOnly, true);
  assert.equal(state.noNetwork, true);
  assert.equal(state.durableWrites, false);
  assert.equal(state.mismatchCount, 0);
  assert.equal(state.warningCount, 0);
  assert.equal(state.redacted, false);
  assert.equal(state.rawBodyRetained, false);

  assert.deepEqual(
    state.methodCounts.map((count) => count.label),
    ["GET: 3", "POST: 3"],
  );
  assert.deepEqual(
    state.statusCounts.map((count) => count.label),
    ["HTTP 200: 4", "HTTP 400: 1", "HTTP 404: 1"],
  );
  assert.deepEqual(
    state.routeCounts.map((count) => count.label),
    [
      "/v1/ingest/connectors/mcp/preview: 3",
      "/v1/ingest/connectors/mcp/resources: 1",
      "/v1/ingest/connectors/mcp/resources/local.files: 1",
      "/v1/ingest/connectors/mcp/resources/local.unknown: 1",
    ],
  );
  assert.deepEqual(
    state.requestCards.map((card) => [
      card.requestId,
      card.method,
      card.routePath,
      card.status,
      card.statusCode,
      card.resourceSuccess,
      card.previewSuccess,
    ]),
    [
      [
        "mcp_ingest_connector_resources",
        "GET",
        "/v1/ingest/connectors/mcp/resources",
        "success",
        200,
        true,
        false,
      ],
      [
        "mcp_ingest_connector_local_files_resource",
        "GET",
        "/v1/ingest/connectors/mcp/resources/local.files",
        "success",
        200,
        true,
        false,
      ],
      [
        "mcp_ingest_connector_preview_local_files",
        "POST",
        "/v1/ingest/connectors/mcp/preview",
        "success",
        200,
        false,
        true,
      ],
      [
        "mcp_ingest_connector_preview_workspace_index_manifest_uri",
        "POST",
        "/v1/ingest/connectors/mcp/preview",
        "success",
        200,
        false,
        true,
      ],
      [
        "mcp_ingest_connector_missing_resource",
        "GET",
        "/v1/ingest/connectors/mcp/resources/local.unknown",
        "success",
        404,
        false,
        false,
      ],
      [
        "mcp_ingest_connector_bad_preview_body",
        "POST",
        "/v1/ingest/connectors/mcp/preview",
        "success",
        400,
        false,
        false,
      ],
    ],
  );

  assert.equal(state.safety.status, "safe");
  assert.equal(state.safety.localOnly, true);
  assert.equal(state.safety.noNetwork, true);
  assert.equal(state.safety.durableWrites, false);
  assert.equal(state.safety.localOnlyCount > 0, true);
  assert.equal(state.safety.noNetworkCount > 0, true);
  assert.equal(state.safety.durableWriteCount, 0);
  assert.match(state.summary.valueLabel, /6 requests, 3 connectors/);
  assert.deepEqual(
    state.summaryCards.map((card) => [card.label, card.value, card.status]),
    [
      ["Requests", "6 requests", "ready"],
      ["Resources", "3 resources", "ready"],
      ["Previews", "2 preview successes", "ready"],
      ["Safety", "Safe", "ready"],
      ["Mismatches", "0 mismatches", "ready"],
      ["Redactions", "0 redactions", "ready"],
    ],
  );
  assertNoBodyLeak(state, [
    "expectedBody",
    "requestBody",
    "responseBody",
    "Previews caller-provided local file content",
  ]);
}

function testFocusedBuildersAndFixtureLikeObject() {
  const cards = buildIngestConnectorMcpFixtureRequestCards(fixture);
  const summaryCards = buildIngestConnectorMcpFixtureSummaryCards(fixture);
  const safety = buildIngestConnectorMcpFixtureSafetySummary(fixture);

  assert.equal(cards.length, 6);
  assert.equal(summaryCards.length, 6);
  assert.equal(safety.status, "safe");

  const single = buildIngestConnectorMcpFixtureState({
    id: "single_preview",
    method: "post",
    path: "/v1/ingest/connectors/mcp/preview",
    expectedStatus: 200,
    expectedBody: {
      schemaVersion: "ingest-connector-mcp-preview/v1",
      localOnly: true,
      noNetwork: true,
      durableWrites: false,
      connectorId: "local.manual",
      resource: {
        connectorId: "local.manual",
        resource: {
          uri: "sovereignops://ingest/connectors/local.manual",
          mimeType: "application/json",
        },
      },
      preview: {
        accepted: true,
        durableWrites: false,
      },
    },
  });

  assert.equal(single.status, "ready");
  assert.equal(single.requestCount, 1);
  assert.equal(single.previewSuccessCount, 1);
  assert.equal(single.resourceCount, 1);
  assert.deepEqual(single.connectorIds, ["local.manual"]);
  assert.equal(single.requestCards[0].method, "POST");
  assert.equal(single.requestCards[0].previewSuccess, true);
}

function testMalformedReplaySafetyAndRedactionSignals() {
  const secret = "sk-fixturesecret1234567890";
  const rawPath = "C:\\Users\\DELL\\.codex-private\\round51\\private-plan-pack.json";
  const unsafeFixture = {
    generatedAt: "2026-04-27T23:00:00.000Z",
    localOnly: false,
    network: {
      mode: "enabled",
      endpoint: `https://example.invalid/mcp?token=${secret}`,
    },
    durableWrites: true,
    requests: [
      null,
      {
        id: "mcp_replay_mismatch",
        title: `Replay failed with ${secret}`,
        method: "GET",
        path: `/v1/ingest/connectors/mcp/resources?api_key=${secret}`,
        expectedStatus: 200,
        expectedBody: {
          localOnly: true,
          noNetwork: true,
          durableWrites: false,
          resources: [],
        },
        actual: {
          status: 503,
          body: {
            error: {
              message: `Failed at ${rawPath} with authorization=${secret}`,
            },
            localOnly: false,
            noNetwork: false,
            durableWrites: true,
          },
        },
        matches: {
          status: false,
          body: false,
        },
      },
      {
        id: "unsafe_preview",
        method: "POST",
        path: "https://example.invalid/v1/ingest/connectors/mcp/preview",
        expectedStatus: 200,
        expectedBody: {
          schemaVersion: "ingest-connector-mcp-preview/v1",
          localOnly: false,
          noNetwork: false,
          durableWrites: true,
          connectorId: `private plan pack ${secret}`,
          preview: {
            accepted: true,
          },
        },
      },
    ],
  };

  const state = buildIngestConnectorMcpFixtureState(unsafeFixture);

  assert.equal(state.status, "error");
  assert.equal(state.requestCount, 3);
  assert.equal(state.successfulRequestCount, 1);
  assert.equal(state.failedRequestCount, 2);
  assert.equal(state.mismatchCount, 1);
  assert.equal(state.safety.status, "unsafe");
  assert.equal(state.safety.localOnly, false);
  assert.equal(state.safety.noNetwork, false);
  assert.equal(state.safety.durableWrites, true);
  assert.equal(state.safety.durableWriteCount > 0, true);
  assert.deepEqual(
    state.requestCards.map((card) => card.status),
    ["error", "mismatch", "success"],
  );
  assert.deepEqual(state.mismatchIndicators[0].fields, ["body", "status"]);
  assert.deepEqual(
    [...new Set(state.warnings.map((warning) => warning.code))].sort(),
    [
      "malformed_request",
      "private_marker_input",
      "raw_path_input",
      "secret_input",
    ],
  );
  assert.equal(state.redacted, true);
  assert.equal(state.redactionCount >= 4, true);
  assert.equal(state.errorStates.some((error) => error.context === "replay"), true);
  assert.equal(state.errorStates.some((error) => error.context === "request"), true);
  assertNoBodyLeak(state, [
    secret,
    rawPath,
    "C:\\Users\\DELL",
    ".codex-private",
    "private-plan-pack",
    "private plan pack",
    "example.invalid",
    "expectedBody",
    "responseBody",
  ]);
}

function testInvalidInputAndFreezeBoundary() {
  const invalid = buildIngestConnectorMcpFixtureState("not a fixture");

  assert.equal(invalid.status, "error");
  assert.equal(invalid.requestCount, 0);
  assert.equal(invalid.errorStates.length, 1);
  assert.equal(invalid.errorStates[0].context, "input");

  const state = buildIngestConnectorMcpFixtureState(fixture);
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.requestCards), true);
  assert.equal(Object.isFrozen(state.requestCards[0].detailLabels), true);
  assert.equal(Object.isFrozen(state.summaryCards[0].detailLabels), true);
  assert.throws(() => {
    state.requestCards.push(state.requestCards[0]);
  }, TypeError);
  assert.throws(() => {
    state.safety.detailLabels.push("mutated");
  }, TypeError);

  fixture.requests[0].id = "mutated after build";
  assert.equal(state.requestCards[0].requestId, "mcp_ingest_connector_resources");
}

function assertNoBodyLeak(value, rawValues) {
  const serialized = JSON.stringify(value);
  for (const raw of rawValues) {
    assert.equal(
      serialized.includes(raw),
      false,
      `fixture state leaked raw value: ${raw}`,
    );
    assert.equal(
      serialized.includes(raw.replaceAll("\\", "\\\\")),
      false,
      `fixture state leaked escaped raw value: ${raw}`,
    );
  }
}

function readFixture(name) {
  const url = new URL(`../../../examples/ingest-search/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8"));
}

testCheckedInFixtureBuildsDashboardSummary();
testFocusedBuildersAndFixtureLikeObject();
testMalformedReplaySafetyAndRedactionSignals();
testInvalidInputAndFreezeBoundary();

console.log("ingest connector mcp fixture state tests passed");
