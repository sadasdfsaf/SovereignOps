import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  buildIngestConnectorMcpCards,
  buildIngestConnectorMcpRows,
  buildIngestConnectorMcpSections,
  buildIngestConnectorMcpState,
} from "../src/ingestConnectorMcpState.ts";

function testResourceListEnvelopeSortsDeterministically() {
  const listEnvelope = {
    generatedAt: "2026-04-27T08:00:00.000Z",
    resources: [
      {
        id: "res_z",
        uri: "workspace://beta/zeta",
        name: "Zeta",
        connectorId: "workspace.beta",
        mimeType: "application/json",
        safety: {
          localOnly: true,
          networkAccess: false,
          durableWrites: false,
        },
      },
      {
        id: "res_external",
        uri: "https://example.invalid/resource",
        name: "External",
        connectorId: "remote.connector",
        mimeType: "text/plain",
        localOnly: false,
        noNetwork: false,
        durableWrites: false,
      },
      {
        id: "res_a",
        uri: "local://alpha/alpha",
        name: "Alpha",
        connectorId: "local.alpha",
        mimeType: "text/markdown",
        safety: {
          localOnly: true,
          networkAccess: false,
          durableWrites: false,
        },
      },
    ],
  };
  const state = buildIngestConnectorMcpState(listEnvelope);

  assert.equal(state.id, "ingest_connector_mcp_state");
  assert.equal(state.generatedAt, "2026-04-27T08:00:00.000Z");
  assert.equal(state.status, "attention");
  assert.equal(state.resourceCount, 3);
  assert.equal(state.connectorCount, 3);
  assert.deepEqual(
    state.rows.map((row) => [row.connectorId, row.title, row.safetyStatus]),
    [
      ["remote.connector", "External", "unsafe"],
      ["local.alpha", "Alpha", "safe"],
      ["workspace.beta", "Zeta", "safe"],
    ],
  );
  assert.deepEqual(
    state.rows.map((row) => row.previewStatus),
    ["empty", "empty", "empty"],
  );
  assert.deepEqual(
    state.safety.indicatorLabels,
    ["Local only: no", "No network: no", "Durable writes: no"],
  );
  assert.deepEqual(
    state.sections.map((section) => section.kind),
    ["resources", "safety", "requests", "errors"],
  );

  const rows = buildIngestConnectorMcpRows(listEnvelope);
  assert.deepEqual(
    rows.map((row) => row.title),
    ["External", "Alpha", "Zeta"],
  );
}

function testSingleResourcePreviewEnvelopeIsReady() {
  const state = buildIngestConnectorMcpState({
    preview: {
      status: "loaded",
      resource: {
        id: "guide",
        uri: "local://docs/guide",
        name: "Guide",
        connectorId: "local.docs",
        mimeType: "text/plain",
        sizeBytes: 42,
        updatedAt: "2026-04-27T08:10:00.000Z",
        safety: {
          localOnly: true,
          networkAccess: false,
          durableWrites: false,
        },
      },
      content: {
        uri: "local://docs/guide",
        mimeType: "text/plain",
        text: "Preview text for the guide.",
      },
    },
  });

  assert.equal(state.status, "ready");
  assert.equal(state.resourceCount, 1);
  assert.equal(state.previewCount, 1);
  assert.equal(state.requestCount, 0);
  assert.equal(state.rows[0].resourceId, "guide");
  assert.equal(state.rows[0].previewStatus, "loaded");
  assert.equal(state.rows[0].requestStatus, "success");
  assert.equal(state.rows[0].safetyStatus, "safe");
  assert.equal(state.rows[0].sizeLabel, "42 B");
  assert.equal(state.cards[0].valueLabel, "27 B preview");

  const cards = buildIngestConnectorMcpCards({
    resource: {
      uri: "workspace://notes/current",
      name: "Current Notes",
      connectorId: "workspace.notes",
      mimeType: "application/json",
      localOnly: true,
      noNetwork: true,
      durableWrites: false,
    },
    content: {
      uri: "workspace://notes/current",
      mimeType: "application/json",
      json: {
        itemCount: 2,
      },
    },
  });
  assert.equal(cards.length, 1);
  assert.equal(cards[0].previewStatus, "loaded");

  const sections = buildIngestConnectorMcpSections({ resource: cards[0] });
  assert.equal(sections[0].kind, "resources");
}

function testApiReplayAndSdkWrappersBuildRequestsAndPreviews() {
  const replay = {
    schemaVersion: "ingest-connector-mcp-preview.v1",
    generatedAt: "2026-04-27T08:20:00.000Z",
    requests: [
      {
        id: "mcp_list_resources",
        title: "List resources",
        route: {
          method: "GET",
          path: "/v1/mcp/resources",
        },
        response: {
          status: 200,
          body: {
            resources: [
              {
                id: "res_alpha",
                uri: "workspace://alpha/summary",
                name: "Alpha Summary",
                connectorId: "workspace.alpha",
                mimeType: "application/json",
                localOnly: true,
                noNetwork: true,
                durableWrites: false,
              },
            ],
          },
        },
      },
      {
        id: "mcp_read_resource",
        title: "Read resource",
        route: {
          method: "POST",
          path: "/v1/mcp/resources/read",
        },
        request: {
          body: {
            resourceUri: "workspace://alpha/summary",
          },
        },
        response: {
          status: 200,
          body: {
            resource: {
              id: "res_alpha",
              uri: "workspace://alpha/summary",
              name: "Alpha Summary",
              connectorId: "workspace.alpha",
              mimeType: "application/json",
              localOnly: true,
              noNetwork: true,
              durableWrites: false,
            },
            content: {
              uri: "workspace://alpha/summary",
              mimeType: "application/json",
              json: {
                itemCount: 3,
              },
            },
          },
        },
      },
    ],
  };

  const state = buildIngestConnectorMcpState(replay);

  assert.equal(state.generatedAt, "2026-04-27T08:20:00.000Z");
  assert.equal(state.status, "ready");
  assert.equal(state.resourceCount, 1);
  assert.equal(state.requestCount, 2);
  assert.equal(state.successfulRequestCount, 2);
  assert.equal(state.rows[0].previewStatus, "loaded");
  assert.deepEqual(
    state.requestCards.map((card) => [
      card.requestId,
      card.method,
      card.routePath,
      card.operation,
      card.status,
      card.statusCode,
    ]),
    [
      [
        "mcp_list_resources",
        "GET",
        "/v1/mcp/resources",
        "list",
        "success",
        200,
      ],
      [
        "mcp_read_resource",
        "POST",
        "/v1/mcp/resources/read",
        "read",
        "success",
        200,
      ],
    ],
  );
  assert.equal(state.requestCards[1].resourceUri, "workspace://alpha/summary");

  const sdkState = buildIngestConnectorMcpState({
    data: {
      resources: [
        {
          uri: "fixture://sdk/item",
          name: "SDK Item",
          mimeType: "text/plain",
          connectorId: "sdk.connector",
          localOnly: true,
          noNetwork: true,
          durableWrites: false,
        },
      ],
    },
  });
  assert.equal(sdkState.requestCount, 1);
  assert.equal(sdkState.rows[0].connectorId, "sdk.connector");
}

function testErrorRedactionCloneAndFreezeBoundaries() {
  const secret = "sk-testsecret1234567890";
  const rawPath = "E:\\SovereignOps\\.codex-private\\round50\\plan.json";
  const input = {
    ok: false,
    error: {
      message: `failed to preview ${rawPath} with authorization=${secret} from private plan pack`,
    },
    resources: [
      {
        id: rawPath,
        uri: rawPath,
        name: `private plan pack ${secret}`,
        connectorId: rawPath,
        mimeType: "text/plain",
        localOnly: false,
        noNetwork: false,
        durableWrites: true,
        content: {
          text: `token=${secret} path=${rawPath}`,
        },
      },
    ],
  };
  const original = structuredClone(input);
  const state = buildIngestConnectorMcpState(input);

  input.resources[0].name = "mutated after build";

  assert.deepEqual(original.resources[0].name, `private plan pack ${secret}`);
  assert.equal(state.status, "error");
  assert.equal(state.redacted, true);
  assert.equal(state.redactionCount >= 4, true);
  assert.equal(state.rows[0].connectorId, "connector_1");
  assert.equal(state.rows[0].safetyStatus, "unsafe");
  assert.equal(state.rows[0].safetyFlags.durableWrites, true);
  assert.equal(state.errorStates.length >= 1, true);
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.rows), true);
  assert.equal(Object.isFrozen(state.rows[0].safetyFlags.indicatorLabels), true);
  assert.throws(() => {
    state.rows.push(state.rows[0]);
  }, TypeError);

  const serialized = JSON.stringify(state);
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes(rawPath), false);
  assert.equal(serialized.includes(".codex-private"), false);
  assert.equal(serialized.includes("private plan"), false);
}

function testOptionalConnectorMcpPreviewExample() {
  const fixtureUrl = new URL(
    "../../../examples/ingest-search/connector-mcp-preview.json",
    import.meta.url,
  );
  if (!existsSync(fixtureUrl)) {
    return;
  }

  const fixture = JSON.parse(readFileSync(fixtureUrl, "utf8"));
  const state = buildIngestConnectorMcpState(fixture);

  assert.equal(Object.isFrozen(state), true);
  assert.equal(Array.isArray(state.sections), true);
  assert.equal(state.sections.length, 4);
  assert.equal(JSON.stringify(state).includes(".codex-private"), false);
}

testResourceListEnvelopeSortsDeterministically();
testSingleResourcePreviewEnvelopeIsReady();
testApiReplayAndSdkWrappersBuildRequestsAndPreviews();
testErrorRedactionCloneAndFreezeBoundaries();
testOptionalConnectorMcpPreviewExample();

console.log("ingest connector mcp state tests passed");
