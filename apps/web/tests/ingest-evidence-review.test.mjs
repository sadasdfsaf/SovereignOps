import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildIngestEvidenceCommandRows,
  buildIngestEvidenceFormatCards,
  buildIngestEvidenceLocalOnlyStatus,
  buildIngestEvidencePackageDescriptors,
  buildIngestEvidenceRedactionSummary,
  buildIngestEvidenceReview,
  buildIngestEvidenceReviewEmptyState,
  buildIngestEvidenceReviewErrorState,
  buildIngestEvidenceRouteRows,
} from "../src/ingestEvidenceReview.ts";

const evidenceExportSessionFixture = JSON.parse(
  readFileSync(
    new URL(
      "../../../examples/ingest-search/evidence-export-session.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

function testReviewStateFromFixture() {
  const original = structuredClone(evidenceExportSessionFixture);
  const state = buildIngestEvidenceReview(evidenceExportSessionFixture);

  assert.deepEqual(evidenceExportSessionFixture, original);
  assert.equal(state.schemaVersion, "ingest-evidence-export-session.v1");
  assert.equal(state.workspaceId, "wsp_ingest_demo");
  assert.equal(state.sessionId, "sess_ingest_search_local_001");
  assert.equal(state.generatedAt, "2026-04-27T08:20:00.000Z");

  assert.equal(state.localOnlyStatus.localOnly, true);
  assert.equal(state.localOnlyStatus.status, "complete");
  assert.equal(state.localOnlyStatus.mode, "disabled");
  assert.deepEqual(state.localOnlyStatus.allowedUrlPrefixes, [
    "http://127.0.0.1:7317",
  ]);
  assert.deepEqual(state.localOnlyStatus.allowedUriPrefixes, [
    "fixture://ingest-search/",
  ]);
  assert.deepEqual(state.localOnlyStatus.blockedUrlPrefixes, []);

  assert.deepEqual(
    state.formatCards.map((card) => [
      card.format,
      card.surface,
      card.status,
      card.commandId,
    ]),
    [
      ["summary", "cli", "complete", "cli_summary"],
      ["jsonl", "package", "complete", "cli_jsonl"],
      ["csv", "package", "complete", "cli_csv"],
      ["package", "api", "complete", "cli_package"],
    ],
  );
  assert.equal(state.formatCards[0].mediaType, "application/json");
  assert.match(state.formatCards[3].ariaLabel, /Package, API, Complete/);

  assert.equal(state.commandRows.length, 16);
  assert.deepEqual(
    state.commandRows.slice(0, 6).map((row) => [
      row.commandId,
      row.surface,
      row.format,
      row.status,
    ]),
    [
      ["cli_summary", "cli", "summary", "complete"],
      ["cli_jsonl", "cli", "jsonl", "complete"],
      ["cli_csv", "cli", "csv", "complete"],
      ["cli_package", "cli", "package", "complete"],
      ["api_json", "api", "json", "complete"],
      ["api_manifest", "api", "manifest", "complete"],
    ],
  );
  assert.equal(
    state.commandRows.find((row) => row.commandId === "sdk_preview")?.entryPoint,
    "buildLocalIngestEvidenceExportPreview",
  );
  assert.equal(state.commandRows.at(-1)?.commandType, "validation");
  assert.match(state.commandRows.at(-1)?.command ?? "", /sdk-js/);

  assert.deepEqual(
    state.routeRows.map((row) => [
      row.title,
      row.surface,
      row.formatLabels,
      row.commandIds,
    ]),
    [
      [
        "POST /v1/ingest/evidence/export",
        "api",
        ["JSON", "Manifest", "Summary"],
        ["api_json", "api_manifest", "cli_summary"],
      ],
      [
        "POST /v1/ingest/evidence/package",
        "api",
        ["Package"],
        ["api_package", "cli_package"],
      ],
      [
        "LOCAL local-package-helper",
        "package",
        ["CSV", "JSONL"],
        ["cli_csv", "cli_jsonl"],
      ],
    ],
  );

  assert.deepEqual(
    state.packageDescriptors.map((descriptor) => [
      descriptor.descriptorId,
      descriptor.status,
      descriptor.fingerprint,
    ]),
    [
      ["package", "complete", "fnv1a64:4c86fe3a3e9c66cc"],
      ["manifest", "complete", "fnv1a64:e705c60717adb0dc"],
      ["evidence", "complete", "fnv1a64:19194235a1285631"],
      ["jsonl", "complete", "fnv1a64:2e60846d48e5bb45"],
      ["csv", "complete", "fnv1a64:cb4ede0470052a8b"],
    ],
  );
  assert.equal(state.packageDescriptors[1].recordCount, 28);
  assert.equal(state.packageDescriptors[3].lineCount, 28);
  assert.equal(state.packageDescriptors[4].columnCount, 7);

  assert.equal(state.redactionSummary.status, "complete");
  assert.equal(state.redactionSummary.marker, "[REDACTED]");
  assert.deepEqual(state.redactionSummary.scopeLabels, [
    "Credential-like keys",
    "Credential-like values",
    "Request error details",
    "Session ID",
  ]);
  assert.deepEqual(state.redactionSummary.appliesBeforeLabels, [
    "CSV",
    "JSONL",
    "Manifest",
    "Package fingerprint",
  ]);
}

function testFocusedBuilders() {
  const cards = buildIngestEvidenceFormatCards(evidenceExportSessionFixture);
  assert.deepEqual(
    cards.map((card) => card.title),
    ["Summary", "JSONL", "CSV", "Package"],
  );

  const commandRows = buildIngestEvidenceCommandRows(evidenceExportSessionFixture);
  assert.equal(
    commandRows.find((row) => row.commandId === "api_package")?.routePath,
    "/v1/ingest/evidence/package",
  );
  assert.equal(
    commandRows.find((row) => row.commandId === "package_csv")?.packagePath,
    "packages/ingest-evidence/src/index.ts",
  );

  const routeRows = buildIngestEvidenceRouteRows(evidenceExportSessionFixture);
  assert.equal(routeRows.length, 3);
  assert.equal(routeRows[0].statusLabel, "Complete");

  const manifestDescriptors = buildIngestEvidencePackageDescriptors(
    evidenceExportSessionFixture.packageMetadata.manifest,
  );
  assert.deepEqual(
    manifestDescriptors.map((descriptor) => descriptor.descriptorId),
    ["manifest", "evidence", "jsonl", "csv"],
  );

  const attentionRedaction = buildIngestEvidenceRedactionSummary({
    scopes: ["sessionId"],
    appliesBefore: ["jsonl"],
  });
  assert.equal(attentionRedaction.status, "attention");
  assert.equal(attentionRedaction.markerLabel, "No redaction marker");

  const emptyRedaction = buildIngestEvidenceRedactionSummary(undefined);
  assert.equal(emptyRedaction.status, "empty");
  assert.equal(emptyRedaction.emptyState.label, "No redaction rules");

  const remoteStatus = buildIngestEvidenceLocalOnlyStatus({
    localOnly: true,
    network: {
      mode: "disabled",
      allowedUrlPrefixes: ["https://example.test/export"],
    },
  });
  assert.equal(remoteStatus.status, "error");
  assert.deepEqual(remoteStatus.blockedUrlPrefixes, [
    "https://example.test/export",
  ]);
}

function testReturnedViewModelsAreDefensivelyCloned() {
  const state = buildIngestEvidenceReview(evidenceExportSessionFixture);

  state.localOnlyStatus.allowedUrlPrefixes.push("mutated");
  state.formatCards[0].detailLabels.push("mutated");
  state.commandRows[0].detailLabels.push("mutated");
  state.routeRows[0].formatLabels[0] = "mutated";
  state.routeRows[0].commandIds.push("mutated");
  state.packageDescriptors[0].detailLabels.push("mutated");
  state.redactionSummary.scopeLabels[0] = "mutated";
  state.emptyStates.commands.label = "mutated";

  const rebuilt = buildIngestEvidenceReview(evidenceExportSessionFixture);
  assert.deepEqual(rebuilt.localOnlyStatus.allowedUrlPrefixes, [
    "http://127.0.0.1:7317",
  ]);
  assert.equal(rebuilt.formatCards[0].detailLabels.includes("mutated"), false);
  assert.equal(rebuilt.commandRows[0].detailLabels.includes("mutated"), false);
  assert.equal(rebuilt.routeRows[0].formatLabels.includes("mutated"), false);
  assert.equal(rebuilt.routeRows[0].commandIds.includes("mutated"), false);
  assert.equal(
    rebuilt.packageDescriptors[0].detailLabels.includes("mutated"),
    false,
  );
  assert.equal(rebuilt.redactionSummary.scopeLabels[0], "Credential-like keys");
  assert.equal(rebuilt.emptyStates.commands.label, "No commands");
}

function testFallbackAndErrorStates() {
  const state = buildIngestEvidenceReview("not a session", {
    defaultTimestamp: "2026-04-27T09:45:00.000Z",
  });

  assert.equal(state.generatedAt, "2026-04-27T09:45:00.000Z");
  assert.equal(state.localOnlyStatus.localOnly, false);
  assert.equal(state.localOnlyStatus.status, "attention");
  assert.deepEqual(state.formatCards, []);
  assert.deepEqual(state.commandRows, []);
  assert.deepEqual(state.routeRows, []);
  assert.deepEqual(state.packageDescriptors, []);
  assert.equal(state.redactionSummary.status, "empty");
  assert.deepEqual(
    state.errorStates.map((error) => [
      error.context,
      error.errorState.label,
      error.errorState.description,
    ]),
    [
      [
        "session",
        "Evidence session could not load",
        "Evidence export session must be an object.",
      ],
    ],
  );

  assert.deepEqual(buildIngestEvidenceReviewEmptyState("package"), {
    id: "ingest_evidence_package_empty",
    label: "No package manifest",
    description: "Package descriptors will appear when manifest metadata is present.",
    ariaLabel: "No ingest evidence package descriptors are available",
  });
  assert.deepEqual(
    buildIngestEvidenceReviewErrorState("commands", new Error("Commands failed")),
    {
      id: "ingest_evidence_commands_error",
      context: "commands",
      errorState: {
        id: "ingest_evidence_commands_error",
        label: "Commands could not load",
        description: "Commands failed",
        ariaLabel: "Commands could not load",
        retryLabel: "Retry commands",
      },
    },
  );
}

testReviewStateFromFixture();
testFocusedBuilders();
testReturnedViewModelsAreDefensivelyCloned();
testFallbackAndErrorStates();

console.log("ingest evidence review tests passed");
