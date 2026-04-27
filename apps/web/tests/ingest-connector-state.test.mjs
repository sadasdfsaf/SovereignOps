import assert from "node:assert/strict";

import {
  buildIngestConnectorCards,
  buildIngestConnectorRows,
  buildIngestConnectorState,
  getIngestConnectorReadinessStatusLabel,
  getIngestConnectorSafetyStateLabel,
} from "../src/ingestConnectorState.ts";

const sdkConnectors = [
  {
    connectorId: "csv",
    mediaTypes: ["text/csv", "text/csv"],
    citationCapabilities: ["row", "cell"],
    localOnly: true,
    trusted: false,
    readinessStatus: "ready",
  },
  {
    id: "markdown",
    supportedMediaTypes: ["text/markdown"],
    citations: [
      {
        sourceUri: "fixture://ingest/notes.md",
        range: {
          startLine: 1,
          endLine: 3,
        },
        trusted: false,
      },
    ],
    safetyState: "safe",
    ready: true,
  },
];

function testEmptyState() {
  const state = buildIngestConnectorState([]);

  assert.equal(state.status, "empty");
  assert.equal(state.totalCount, 0);
  assert.deepEqual(state.cards, []);
  assert.deepEqual(state.rows, []);
  assert.deepEqual(state.warnings, []);
  assert.equal(state.emptyState.label, "No connector manifests");
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.rows), true);
  assert.equal(Object.isFrozen(state.emptyState), true);

  assert.deepEqual(buildIngestConnectorRows({ connectors: [] }), []);
  assert.deepEqual(buildIngestConnectorCards({}), []);
}

function testSdkApiAndPythonCliSuccessShapes() {
  const sdkState = buildIngestConnectorState(sdkConnectors);

  assert.equal(sdkState.status, "ready");
  assert.deepEqual(
    sdkState.rows.map((row) => [
      row.connectorId,
      row.mediaTypeLabels,
      row.citationCapabilityLabels,
      row.safetyState,
      row.readinessStatus,
    ]),
    [
      [
        "csv",
        ["CSV"],
        ["Row citations", "Cell citations"],
        "untrusted",
        "ready",
      ],
      [
        "markdown",
        ["Markdown"],
        ["Line citations"],
        "safe",
        "ready",
      ],
    ],
  );
  assert.equal(sdkState.cards[0].valueLabel, "1 media type");
  assert.equal(sdkState.cards[1].detailLabels.includes("Local safe"), true);

  const apiState = buildIngestConnectorState({ connectors: sdkConnectors });
  assert.deepEqual(
    apiState.rows.map((row) => row.connectorId),
    sdkState.rows.map((row) => row.connectorId),
  );

  const cliState = buildIngestConnectorState({
    ok: true,
    command: "parse-json",
    source_uri: "stdin://items",
    documents: [
      {
        media_type: "application/json",
        citation: {
          source_uri: "stdin://items",
          range: {
            path: "$.items[0].name",
          },
          trusted: false,
        },
      },
    ],
  });

  assert.equal(cliState.totalCount, 1);
  assert.deepEqual(cliState.rows[0].mediaTypeLabels, ["JSON"]);
  assert.deepEqual(cliState.rows[0].citationCapabilityLabels, [
    "JSON path citations",
  ]);
  assert.equal(cliState.rows[0].connectorId, "json");
  assert.equal(cliState.rows[0].safetyState, "untrusted");
  assert.equal(cliState.rows[0].readinessStatus, "ready");

  const sdkProfileState = buildIngestConnectorState({
    profiles: [
      {
        profileId: "markdown-profile",
        connector: "markdown",
        mediaTypes: ["text/markdown"],
        capabilities: ["line-citations", "normalization"],
        safety: {
          localOnly: true,
          trustedByDefault: false,
          rawContentRetained: false,
          rawSecretsRetained: false,
          privatePathsBlocked: true,
          rawSecretsBlocked: true,
        },
      },
    ],
  });
  assert.equal(sdkProfileState.status, "ready");
  assert.equal(sdkProfileState.rows[0].connectorId, "markdown-profile");
  assert.deepEqual(sdkProfileState.rows[0].citationCapabilityLabels, [
    "Line citations",
  ]);
  assert.equal(sdkProfileState.warningCount, 0);

  const pythonManifestState = buildIngestConnectorState({
    ok: true,
    command: "connectors manifest",
    manifest: {
      kind: "sovereignops.ingest.connector-manifest",
      local_only: true,
      connectors: [
        {
          id: "csv-structured",
          kind: "ingest",
          media_types: ["text/csv"],
          citation_capabilities: ["table_row", "table_cell"],
          safety_findings: [],
          content_untrusted_by_default: true,
        },
      ],
    },
  });
  assert.equal(pythonManifestState.status, "ready");
  assert.deepEqual(pythonManifestState.rows[0].citationCapabilityLabels, [
    "Row citations",
    "Cell citations",
  ]);
  assert.equal(pythonManifestState.rows[0].safetyState, "untrusted");

  assert.equal(getIngestConnectorReadinessStatusLabel("attention"), "Needs review");
  assert.equal(getIngestConnectorSafetyStateLabel("unsafe"), "Unsafe input");
}

function testMalformedManifestsBecomeBlockedRows() {
  const state = buildIngestConnectorState({
    connectors: [
      {
        mediaTypes: ["not a media type"],
        citationCapabilities: [],
      },
      "not a connector",
    ],
  });

  assert.equal(state.status, "error");
  assert.equal(state.errorCount, 2);
  assert.deepEqual(
    state.rows.map((row) => [row.connectorId, row.safetyState, row.readinessStatus]),
    [
      ["connector_1", "malformed", "error"],
      ["connector_2", "malformed", "error"],
    ],
  );
  assert.equal(
    state.warnings.every((warning) => warning.code === "malformed_manifest"),
    true,
  );
  assert.equal(state.warnings.length >= 4, true);

  const envelope = buildIngestConnectorState({ connectors: "bad" });
  assert.equal(envelope.rows[0].connectorId, "connector_1");
  assert.equal(envelope.rows[0].readinessStatus, "error");
}

function testRedactionWarningsDoNotLeakInputs() {
  const secret = "sk-test-abcdefghijklmnopqrstuvwxyz";
  const rawPath = "C:\\Users\\DELL\\Desktop\\source.csv";
  const privatePath = "E:\\SovereignOps\\.codex-private\\round47\\plan.json";
  const state = buildIngestConnectorState({
    connectors: [
      {
        id: privatePath,
        mediaTypes: ["text/csv"],
        citationCapabilities: ["row"],
        localPath: rawPath,
        endpoint: "https://example.invalid/source.csv",
        apiKey: secret,
        notes: privatePath,
      },
    ],
  });

  assert.equal(state.status, "error");
  assert.equal(state.rows[0].connectorId, "connector_1");
  assert.equal(state.rows[0].safetyState, "unsafe");
  assert.deepEqual(
    [...new Set(state.warnings.map((warning) => warning.code))].sort(),
    [
      "private_path_input",
      "raw_path_input",
      "secret_input",
      "unsafe_input",
    ],
  );

  const serialized = JSON.stringify(state);
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes(rawPath), false);
  assert.equal(serialized.includes(privatePath), false);
  assert.equal(serialized.includes(".codex-private"), false);
  assert.equal(Object.isFrozen(state.warnings[0]), true);
  assert.equal(Object.isFrozen(state.rows[0].warningLabels), true);
}

testEmptyState();
testSdkApiAndPythonCliSuccessShapes();
testMalformedManifestsBecomeBlockedRows();
testRedactionWarningsDoNotLeakInputs();

console.log("ingest connector state tests passed");
