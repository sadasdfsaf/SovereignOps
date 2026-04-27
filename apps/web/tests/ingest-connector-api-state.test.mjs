import assert from "node:assert/strict";

import {
  buildIngestConnectorApiCards,
  buildIngestConnectorApiErrorStates,
  buildIngestConnectorApiRequestCards,
  buildIngestConnectorApiRows,
  buildIngestConnectorApiState,
  redactIngestConnectorApiText,
} from "../src/ingestConnectorApiState.ts";

const apiManifest = {
  schemaVersion: "ingest-connector-manifest/v1",
  localOnly: true,
  connectors: [
    {
      id: "local.files",
      label: "Local Files",
      description:
        "Previews caller-provided local file content for normalization, indexing, and search.",
      transport: "in-process",
      capabilities: [
        "ingest.normalize",
        "ingest.structured",
        "repository.scan",
        "search.query",
        "quarantine.preview",
      ],
      mediaTypes: ["text/plain", "text/markdown", "text/csv", "application/json"],
      auth: {
        mode: "none",
        required: false,
      },
      safety: {
        localOnly: true,
        networkAccess: false,
        durableWrites: false,
        untrustedByDefault: true,
      },
    },
    {
      id: "local.workspace-index",
      label: "Workspace Index",
      description:
        "Queries the in-process local search index without contacting external services.",
      transport: "in-process",
      capabilities: ["search.query", "quarantine.preview"],
      mediaTypes: ["text/plain", "text/markdown", "text/csv", "application/json"],
      auth: {
        mode: "none",
        required: false,
      },
      safety: {
        localOnly: true,
        networkAccess: false,
        durableWrites: false,
        untrustedByDefault: false,
      },
    },
  ],
};

function testRawConnectorApiResponse() {
  const original = structuredClone(apiManifest);
  const state = buildIngestConnectorApiState(apiManifest);

  assert.deepEqual(apiManifest, original);
  assert.equal(state.id, "ingest_connector_api_state");
  assert.equal(state.generatedAt, "1970-01-01T00:00:00.000Z");
  assert.equal(state.status, "ready");
  assert.equal(state.requestCount, 1);
  assert.equal(state.connectorCount, 2);
  assert.deepEqual(
    state.rows.map((row) => [row.connectorId, row.safetyState, row.readinessStatus]),
    [
      ["local.files", "untrusted", "ready"],
      ["local.workspace-index", "safe", "ready"],
    ],
  );
  assert.deepEqual(
    state.requestCards.map((card) => [
      card.method,
      card.routePath,
      card.status,
      card.statusCode,
    ]),
    [["GET", "/v1/ingest/connectors", "success", undefined]],
  );
  assert.equal(state.summary.routeLabels.includes("/v1/ingest/connectors: 1"), true);
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.connectorState.rows[0].warningLabels), true);
  assert.equal(Object.isFrozen(state.requestCards[0].detailLabels), true);
}

function testSdkWrappersBuildCardsRowsAndRedact() {
  const secret = "sk-testsecret1234567890";
  const rawPath = "E:\\SovereignOps\\.codex-private\\round48\\plan.json";
  const input = {
    id: "sdk_connector_list",
    method: "get",
    routePath: `/v1/ingest/connectors?token=${secret}`,
    status: 200,
    data: {
      profiles: [
        {
          profileId: "Markdown Profile",
          connector: "markdown",
          mediaTypes: ["text/markdown"],
          citationCapabilities: ["line-range"],
          safety: {
            localOnly: true,
            untrustedByDefault: true,
            networkAccess: false,
            durableWrites: false,
          },
          defaultOptions: {
            apiKey: secret,
          },
          notes: rawPath,
        },
      ],
    },
  };

  const state = buildIngestConnectorApiState(input);

  assert.equal(state.status, "error");
  assert.equal(state.rows[0].connectorId, "markdown_profile");
  assert.equal(state.rows[0].safetyState, "unsafe");
  assert.equal(state.requestCards[0].method, "GET");
  assert.equal(
    state.requestCards[0].routePath,
    "/v1/ingest/connectors?token=[redacted-secret]",
  );
  assert.equal(state.redacted, true);
  assert.equal(state.redactionCount >= 2, true);
  assert.deepEqual(
    [...new Set(state.connectorState.warnings.map((warning) => warning.code))].sort(),
    ["private_path_input", "raw_path_input", "secret_input"],
  );

  const rows = buildIngestConnectorApiRows({ result: apiManifest });
  const cards = buildIngestConnectorApiCards({ body: apiManifest, status: 200 });
  assert.equal(rows.length, 2);
  assert.equal(cards[0].connectorId, "local.files");

  const serialized = JSON.stringify(state);
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes(rawPath), false);
  assert.equal(serialized.includes(".codex-private"), false);
}

function testConnectorReplayFixtureEnvelope() {
  const replayFixture = {
    schemaVersion: "ingest-connector-api-requests.v1",
    generatedAt: "2026-04-27T09:10:00.000Z",
    localOnly: true,
    requests: [
      {
        id: "api_ingest_connectors_manifest",
        title: "List local ingest connectors",
        route: {
          method: "GET",
          path: "/v1/ingest/connectors",
        },
        request: {
          headers: {
            accept: "application/json",
          },
        },
        expect: {
          status: 200,
          contentType: "application/json",
          body: apiManifest,
        },
      },
      {
        id: "api_ingest_connectors_bad_method",
        title: "Reject unsupported connector method",
        route: {
          method: "POST",
          path: "/v1/ingest/connectors",
        },
        expect: {
          status: 404,
          contentType: "application/json",
          error: {
            code: "API_ROUTE_NOT_FOUND",
            message: "No API route found for POST /v1/ingest/connectors",
          },
        },
      },
    ],
  };

  const state = buildIngestConnectorApiState(replayFixture);

  assert.equal(state.generatedAt, "2026-04-27T09:10:00.000Z");
  assert.equal(state.status, "ready");
  assert.equal(state.requestCount, 2);
  assert.equal(state.failedRequestCount, 0);
  assert.deepEqual(
    state.requestCards.map((card) => [
      card.requestId,
      card.method,
      card.routePath,
      card.status,
      card.statusCode,
      card.valueLabel,
    ]),
    [
      [
        "api_ingest_connectors_manifest",
        "GET",
        "/v1/ingest/connectors",
        "success",
        200,
        "Expected HTTP 200",
      ],
      [
        "api_ingest_connectors_bad_method",
        "POST",
        "/v1/ingest/connectors",
        "success",
        404,
        "Expected HTTP 404",
      ],
    ],
  );
  assert.deepEqual(state.errorStates, []);
  assert.deepEqual(
    state.summary.statusLabels,
    ["HTTP 200: 1", "HTTP 404: 1"],
  );

  const requestCards = buildIngestConnectorApiRequestCards(replayFixture);
  assert.equal(requestCards[1].detailLabels.includes("Fixture expectation"), true);
}

function testActualReplayErrorsAreRedacted() {
  const secret = "Bearer replay-fixture-token";
  const rawPath = "C:\\Users\\DELL\\Desktop\\connector.json";
  const replay = {
    kind: "ingest-connector-api-fixture-replay",
    schemaVersion: "ingest-connector-api-requests.v1",
    generatedAt: "2026-04-27T09:12:00.000Z",
    requests: [
      {
        id: "api_ingest_connectors_manifest",
        title: `Failed with ${secret}`,
        method: "GET",
        path: `/v1/ingest/connectors?api_key=${secret}`,
        request: {
          headers: {
            authorization: secret,
          },
        },
        expected: {
          status: 200,
          body: apiManifest,
        },
        actual: {
          status: 500,
          body: {
            error: {
              code: "CONNECTOR_MANIFEST_FAILED",
              message: `failed to read ${rawPath} with authorization=${secret}`,
            },
          },
        },
        matches: {
          status: false,
          body: false,
          expectation: false,
        },
      },
    ],
  };

  const state = buildIngestConnectorApiState(replay);

  assert.equal(state.status, "error");
  assert.equal(state.connectorCount, 0);
  assert.equal(state.failedRequestCount, 1);
  assert.equal(state.requestCards[0].status, "error");
  assert.equal(state.requestCards[0].redacted, true);
  assert.equal(state.errorStates.length, 1);
  assert.equal(state.errorStates[0].context, "replay");
  assert.equal(state.errorStates[0].status, 500);
  assert.match(state.errorStates[0].errorState.description, /Replay mismatch/);

  const serialized = JSON.stringify(state);
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes(rawPath), false);
  assert.equal(serialized.includes("api_key=Bearer"), false);
}

function testMalformedInputsReturnUsefulErrorState() {
  const state = buildIngestConnectorApiState("not an API response");

  assert.equal(state.status, "error");
  assert.equal(state.connectorState.status, "empty");
  assert.equal(state.connectorCount, 0);
  assert.equal(state.requestCount, 0);
  assert.equal(state.errorStates.length, 1);
  assert.equal(
    state.errorStates[0].errorState.description,
    "Connector API response must be an object.",
  );
  assert.equal(Object.isFrozen(state.errorStates[0].errorState), true);

  const malformed = buildIngestConnectorApiState({
    connectors: "bad",
  });
  assert.equal(malformed.status, "error");
  assert.equal(malformed.connectorState.errorCount, 1);
  assert.equal(malformed.rows[0].connectorId, "connector_1");

  const errors = buildIngestConnectorApiErrorStates({
    status: 503,
    body: {
      error: {
        message: "Connector route offline",
      },
    },
  });
  assert.equal(errors[0].status, 503);
  assert.equal(errors[0].errorState.description, "Connector route offline");

  assert.equal(
    redactIngestConnectorApiText("token=abc123456789 C:\\Users\\DELL\\file.txt"),
    "token=[redacted-secret] [redacted-path]",
  );
}

testRawConnectorApiResponse();
testSdkWrappersBuildCardsRowsAndRedact();
testConnectorReplayFixtureEnvelope();
testActualReplayErrorsAreRedacted();
testMalformedInputsReturnUsefulErrorState();

console.log("ingest connector api state tests passed");
