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
  assert.equal(state.malformedRequestCount, 0);
  assert.equal(state.schemaIssueCount, 0);
  assert.deepEqual(state.schemaIssues, []);
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

function testCheckedInFixtureSummariesSurviveCliAndApiEnvelopes() {
  const direct = fixtureSummaryFingerprint(
    buildIngestConnectorMcpFixtureState(fixture),
  );
  const envelopes = [
    { ok: true, data: fixture },
    { status: 200, body: { fixture } },
    { result: { value: fixture } },
  ];

  for (const envelope of envelopes) {
    const state = buildIngestConnectorMcpFixtureState(envelope);
    assert.deepEqual(fixtureSummaryFingerprint(state), direct);
    assert.equal(state.malformedRequestCount, 0);
    assert.equal(state.schemaIssueCount, 0);
  }
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

function testSharedSchemaBundleSemantics() {
  const generatedAt = "2026-04-28T02:00:00.000Z";
  const resource = {
    id: "readme",
    uri: "ingest://local.files/readme",
    name: "Readme",
    description: "Local readme text",
    mimeType: "text/markdown",
    textBytes: 42,
  };
  const resourceFixture = {
    schemaVersion: "ingest-connector-mcp-resource/v1",
    generatedAt,
    connectorId: "local.files",
    localOnly: true,
    resource,
    content: {
      type: "text",
      text: "Local preview text",
      truncated: false,
    },
  };
  const bundle = {
    schemaVersion: "ingest-connector-mcp-api-requests.v1",
    bundleId: "bundle.local.files",
    generatedAt,
    connectorId: "local.files",
    localOnly: true,
    requests: [
      {
        id: "resources_list",
        requestedAt: generatedAt,
        connectorId: "local.files",
        operation: "resources/list",
        responseSchemaVersion: "ingest-connector-mcp-resources/v1",
        fixture: "fixtures/resources.json",
      },
      {
        id: "resources_read",
        requestedAt: generatedAt,
        connectorId: "local.files",
        operation: "resources/read",
        resourceUri: "ingest://local.files/readme",
        responseSchemaVersion: "ingest-connector-mcp-resource/v1",
        fixture: "fixtures/readme.json",
      },
      {
        id: "preview",
        requestedAt: generatedAt,
        connectorId: "local.files",
        operation: "preview",
        responseSchemaVersion: "ingest-connector-mcp-preview/v1",
        fixture: "fixtures/preview.json",
      },
    ],
    resources: {
      schemaVersion: "ingest-connector-mcp-resources/v1",
      generatedAt,
      connectorId: "local.files",
      localOnly: true,
      resources: [resource],
    },
    resourceFixtures: [resourceFixture],
    preview: {
      schemaVersion: "ingest-connector-mcp-preview/v1",
      generatedAt,
      connectorId: "local.files",
      localOnly: true,
      dryRun: true,
      request: {
        maxItems: 5,
        maxTextBytes: 1000,
      },
      resources: [resourceFixture],
      summary: {
        resourceCount: 1,
        totalTextBytes: 42,
        truncated: false,
      },
    },
  };

  const state = buildIngestConnectorMcpFixtureState({ ok: true, value: bundle });

  assert.equal(state.status, "ready");
  assert.equal(state.schemaVersion, "ingest-connector-mcp-api-requests.v1");
  assert.equal(state.requestCount, 3);
  assert.equal(state.successfulRequestCount, 3);
  assert.equal(state.failedRequestCount, 0);
  assert.equal(state.resourceCount, 1);
  assert.equal(state.resourceSuccessCount, 2);
  assert.equal(state.previewSuccessCount, 1);
  assert.equal(state.connectorCount, 1);
  assert.deepEqual(state.connectorIds, ["local.files"]);
  assert.equal(state.localOnly, true);
  assert.equal(state.noNetwork, true);
  assert.equal(state.durableWrites, false);
  assert.equal(state.malformedRequestCount, 0);
  assert.equal(state.schemaIssueCount, 0);
  assert.deepEqual(
    state.methodCounts.map((count) => count.label),
    ["GET: 2", "POST: 1"],
  );
  assert.deepEqual(
    state.requestCards.map((card) => [
      card.requestId,
      card.method,
      card.routePath,
      card.status,
      card.resourceSuccess,
      card.previewSuccess,
    ]),
    [
      [
        "resources_list",
        "GET",
        "/v1/ingest/connectors/mcp/resources",
        "success",
        true,
        false,
      ],
      [
        "resources_read",
        "GET",
        "/v1/ingest/connectors/mcp/resources/local.files",
        "success",
        true,
        false,
      ],
      [
        "preview",
        "POST",
        "/v1/ingest/connectors/mcp/preview",
        "success",
        false,
        true,
      ],
    ],
  );
  assertNoBodyLeak(state, ["Local preview text"]);
}

function testSchemaIssuesSurfaceAndRedactEnvelopeDetails() {
  const secret = "sk-schemaissue1234567890";
  const rawPath = "C:\\Users\\DELL\\.codex-private\\round52\\schema.json";
  const state = buildIngestConnectorMcpFixtureState({
    ok: false,
    data: {
      generatedAt: "2026-04-28T01:00:00.000Z",
      requests: [
        {
          id: "schema_issue_request",
          method: "GET",
          path: "/v1/ingest/connectors/mcp/resources",
          expectedStatus: 200,
          expectedBody: {
            schemaVersion: "ingest-connector-mcp-resources/v1",
            localOnly: true,
            noNetwork: true,
            durableWrites: false,
            resources: [],
          },
        },
      ],
    },
    error: {
      details: {
        issues: [
          {
            path: `$.requests[0].${rawPath}`,
            message: `schema file ${rawPath} exposed token ${secret}`,
            requestId: "schema_issue_request",
          },
        ],
      },
    },
    validation: {
      issues: [
        {
          path: "$.requests[0].extraField",
          message: "extraField is not allowed",
        },
      ],
    },
  });

  assert.equal(state.status, "attention");
  assert.equal(state.requestCount, 1);
  assert.equal(state.successfulRequestCount, 1);
  assert.equal(state.failedRequestCount, 0);
  assert.equal(state.schemaIssueCount, 2);
  assert.equal(state.schemaIssues.length, 2);
  assert.equal(state.schemaIssues.some((issue) => issue.redacted), true);
  assert.deepEqual(
    state.warnings
      .filter((warning) => warning.code === "schema_issue")
      .map((warning) => [warning.code, warning.count]),
    [["schema_issue", 2]],
  );
  assert.deepEqual(
    [...new Set(state.warnings.map((warning) => warning.code))].sort(),
    [
      "private_marker_input",
      "raw_path_input",
      "schema_issue",
      "secret_input",
    ],
  );
  assert.equal(
    state.schemaIssues.some(
      (issue) =>
        issue.requestId === "schema_issue_request" &&
        issue.path.includes("[redacted-path]") &&
        issue.message.includes("[redacted-secret]"),
    ),
    true,
  );
  assertNoBodyLeak(state, [secret, rawPath, "C:\\Users\\DELL", ".codex-private"]);
}

function testMalformedFixtureCountsAndDeclaredRequestCountIssues() {
  const state = buildIngestConnectorMcpFixtureState(
    {
      generatedAt: "2026-04-28T01:30:00.000Z",
      requestCount: 4,
      requests: [
        null,
        {},
        {
          id: "valid_resource_fixture",
          method: "GET",
          path: "/v1/ingest/connectors/mcp/resources",
          expectedStatus: 200,
          expectedBody: {
            schemaVersion: "ingest-connector-mcp-resources/v1",
            localOnly: true,
            noNetwork: true,
            durableWrites: false,
            resources: [],
          },
        },
      ],
    },
    { expectedRequestCount: 4 },
  );

  assert.equal(state.status, "error");
  assert.equal(state.requestCount, 3);
  assert.equal(state.malformedRequestCount, 2);
  assert.equal(state.successfulRequestCount, 1);
  assert.equal(state.failedRequestCount, 2);
  assert.equal(state.schemaIssueCount, 1);
  assert.deepEqual(
    state.requestCards.map((card) => card.status),
    ["error", "error", "success"],
  );
  assert.deepEqual(
    state.warnings.map((warning) => [warning.code, warning.count]),
    [
      ["malformed_request", 2],
      ["schema_issue", 1],
    ],
  );
  assert.equal(
    state.schemaIssues[0].message,
    "expected 4 requests but normalized 3 requests.",
  );
  assert.equal(
    state.errorStates.filter((error) => error.context === "request").length,
    2,
  );
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

function fixtureSummaryFingerprint(state) {
  return {
    generatedAt: state.generatedAt,
    schemaVersion: state.schemaVersion,
    status: state.status,
    requestCount: state.requestCount,
    successfulRequestCount: state.successfulRequestCount,
    failedRequestCount: state.failedRequestCount,
    resourceCount: state.resourceCount,
    resourceSuccessCount: state.resourceSuccessCount,
    previewSuccessCount: state.previewSuccessCount,
    connectorCount: state.connectorCount,
    connectorIds: state.connectorIds,
    mismatchCount: state.mismatchCount,
    warningCount: state.warningCount,
    summary: {
      valueLabel: state.summary.valueLabel,
      detailLabels: state.summary.detailLabels,
    },
    methodCounts: state.methodCounts.map((count) => count.label),
    statusCounts: state.statusCounts.map((count) => count.label),
    routeCounts: state.routeCounts.map((count) => count.label),
    summaryCards: state.summaryCards.map((card) => [
      card.label,
      card.value,
      card.status,
    ]),
  };
}

function readFixture(name) {
  const url = new URL(`../../../examples/ingest-search/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8"));
}

testCheckedInFixtureBuildsDashboardSummary();
testCheckedInFixtureSummariesSurviveCliAndApiEnvelopes();
testFocusedBuildersAndFixtureLikeObject();
testSharedSchemaBundleSemantics();
testSchemaIssuesSurfaceAndRedactEnvelopeDetails();
testMalformedFixtureCountsAndDeclaredRequestCountIssues();
testMalformedReplaySafetyAndRedactionSignals();
testInvalidInputAndFreezeBoundary();

console.log("ingest connector mcp fixture state tests passed");
