import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildIngestEvidenceApiCommandRows,
  buildIngestEvidenceApiEmptyStates,
  buildIngestEvidenceApiErrorStates,
  buildIngestEvidenceApiFormatCards,
  buildIngestEvidenceApiLocalOnlyStatus,
  buildIngestEvidenceApiPackageDescriptors,
  buildIngestEvidenceApiRedactionSummary,
  buildIngestEvidenceApiRouteRows,
  buildIngestEvidenceApiState,
} from "../src/ingestEvidenceApiState.ts";

const evidenceExportSessionFixture = JSON.parse(
  readFileSync(
    new URL(
      "../../../examples/ingest-search/evidence-export-session.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

function buildApiManifest() {
  return {
    kind: "ingest-evidence.manifest",
    version: 1,
    exportId: "exp_ingest_evidence_api_001",
    createdAt: "2026-04-27T08:30:00.000Z",
    schemaVersion: evidenceExportSessionFixture.evidence.schemaVersion,
    workspaceId: evidenceExportSessionFixture.workspaceId,
    sessionId: evidenceExportSessionFixture.sessionId,
    localOnly: true,
    filters: evidenceExportSessionFixture.exportInput.filters,
    evidenceSummary: evidenceExportSessionFixture.evidence.summary,
    sections: [
      {
        section: "evidenceFiles",
        itemCount: 9,
        mediaType: "application/json",
        bytes: 900,
        fingerprint: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
      {
        section: "apiRequestTrace",
        itemCount: 6,
        mediaType: "application/json",
        bytes: 600,
        fingerprint: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    ],
    content: {
      mediaType: "application/json",
      bytes: 4096,
      fingerprint: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    },
    fingerprint: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
  };
}

function buildExportResponse(format, manifest) {
  const content =
    format === "manifest"
      ? JSON.stringify(manifest)
      : JSON.stringify({
          schemaVersion: manifest.schemaVersion,
          generatedAt: evidenceExportSessionFixture.generatedAt,
          workspaceId: manifest.workspaceId,
          sessionId: manifest.sessionId,
          localOnly: true,
          evidenceSummary: manifest.evidenceSummary,
        });

  return {
    kind: "ingest-evidence.export",
    version: 1,
    format,
    mediaType: "application/json",
    content,
    fingerprint:
      format === "manifest"
        ? "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
        : "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    exportId: manifest.exportId,
    createdAt: manifest.createdAt,
    manifest,
  };
}

function buildPackageResponse(manifest) {
  return {
    kind: "ingest-evidence.package",
    version: 1,
    manifest,
    files: [
      {
        path: "manifest.json",
        mediaType: "application/json",
        bytes: 1234,
        fingerprint: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        content: JSON.stringify(manifest),
      },
      {
        path: "evidence.json",
        mediaType: "application/json",
        bytes: 4096,
        fingerprint: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
        content: "{}",
      },
    ],
    fingerprint: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
  };
}

function buildApiReplayFixture() {
  const manifest = buildApiManifest();

  return {
    schemaVersion: "ingest-evidence-api-requests.v1",
    generatedAt: "2026-04-27T08:31:00.000Z",
    apiBase: "http://127.0.0.1:7317",
    requests: [
      {
        id: "api_export_json",
        route: {
          method: "POST",
          path: "/v1/ingest/evidence/export",
        },
        request: {
          body: {
            format: "json",
          },
        },
        response: {
          status: 200,
          body: buildExportResponse("json", manifest),
        },
      },
      {
        id: "api_export_manifest",
        route: {
          method: "POST",
          path: "/v1/ingest/evidence/export",
        },
        request: {
          body: {
            format: "manifest",
          },
        },
        response: {
          status: 200,
          body: buildExportResponse("manifest", manifest),
        },
      },
      {
        id: "api_package",
        route: {
          method: "POST",
          path: "/v1/ingest/evidence/package",
        },
        request: {
          body: {},
        },
        response: {
          status: 200,
          body: buildPackageResponse(manifest),
        },
      },
    ],
  };
}

function testPassThroughExportSessionFixture() {
  const original = structuredClone(evidenceExportSessionFixture);
  const state = buildIngestEvidenceApiState(evidenceExportSessionFixture);

  assert.deepEqual(evidenceExportSessionFixture, original);
  assert.equal(state.schemaVersion, "ingest-evidence-export-session.v1");
  assert.equal(state.localOnlyStatus.status, "complete");
  assert.deepEqual(
    state.formatCards.map((card) => card.format),
    ["summary", "jsonl", "csv", "package"],
  );
  assert.deepEqual(
    state.routeRows.map((row) => row.routePath),
    [
      "/v1/ingest/evidence/export",
      "/v1/ingest/evidence/package",
      "local-package-helper",
    ],
  );
  assert.deepEqual(
    state.packageDescriptors.map((descriptor) => descriptor.descriptorId),
    ["package", "manifest", "evidence", "jsonl", "csv"],
  );
  assert.equal(state.redactionSummary.status, "complete");
}

function testApiReplayBuildsReviewState() {
  const apiReplayFixture = buildApiReplayFixture();
  const original = structuredClone(apiReplayFixture);
  const state = buildIngestEvidenceApiState(apiReplayFixture);

  assert.deepEqual(apiReplayFixture, original);
  assert.equal(state.schemaVersion, "ingest-evidence-api-requests.v1");
  assert.equal(state.workspaceId, "wsp_ingest_demo");
  assert.equal(state.sessionId, "sess_ingest_search_local_001");
  assert.equal(state.generatedAt, "2026-04-27T08:31:00.000Z");

  assert.equal(state.localOnlyStatus.localOnly, true);
  assert.equal(state.localOnlyStatus.status, "complete");
  assert.deepEqual(state.localOnlyStatus.allowedUrlPrefixes, [
    "http://127.0.0.1:7317",
  ]);
  assert.deepEqual(state.localOnlyStatus.blockedUrlPrefixes, []);

  assert.deepEqual(
    state.formatCards.map((card) => [
      card.format,
      card.surface,
      card.route,
      card.status,
      card.commandId,
    ]),
    [
      ["json", "api", "/v1/ingest/evidence/export", "complete", "api_export_json"],
      [
        "manifest",
        "api",
        "/v1/ingest/evidence/export",
        "complete",
        "api_export_manifest",
      ],
      [
        "package",
        "api",
        "/v1/ingest/evidence/package",
        "complete",
        "api_package",
      ],
    ],
  );

  assert.deepEqual(
    state.commandRows.map((row) => [
      row.commandId,
      row.format,
      row.method,
      row.routePath,
      row.status,
    ]),
    [
      [
        "api_export_json",
        "json",
        "POST",
        "/v1/ingest/evidence/export",
        "complete",
      ],
      [
        "api_export_manifest",
        "manifest",
        "POST",
        "/v1/ingest/evidence/export",
        "complete",
      ],
      [
        "api_package",
        "package",
        "POST",
        "/v1/ingest/evidence/package",
        "complete",
      ],
    ],
  );

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
        ["JSON", "Manifest"],
        ["api_export_json", "api_export_manifest"],
      ],
      [
        "POST /v1/ingest/evidence/package",
        "api",
        ["Package"],
        ["api_package"],
      ],
    ],
  );

  assert.deepEqual(
    state.packageDescriptors.map((descriptor) => [
      descriptor.descriptorId,
      descriptor.title,
      descriptor.status,
    ]),
    [
      ["package", "Package", "complete"],
      ["manifest", "Manifest", "complete"],
      ["evidence", "Evidence", "complete"],
      ["content", "Evidence content", "complete"],
      ["file_manifest_json", "manifest.json", "complete"],
      ["file_evidence_json", "evidence.json", "complete"],
      ["export_json", "JSON export", "complete"],
      ["export_manifest", "Manifest export", "complete"],
    ],
  );
  assert.equal(
    state.packageDescriptors.find(
      (descriptor) => descriptor.descriptorId === "file_manifest_json",
    )?.byteCount,
    1234,
  );
  assert.equal(state.redactionSummary.status, "empty");
}

function testFocusedBridgeHelpers() {
  const apiReplayFixture = buildApiReplayFixture();

  assert.deepEqual(
    buildIngestEvidenceApiFormatCards(apiReplayFixture).map((card) => card.title),
    ["JSON", "Manifest", "Package"],
  );
  assert.deepEqual(
    buildIngestEvidenceApiCommandRows(apiReplayFixture).map((row) => row.commandId),
    ["api_export_json", "api_export_manifest", "api_package"],
  );
  assert.deepEqual(
    buildIngestEvidenceApiRouteRows(apiReplayFixture).map((row) => row.routePath),
    ["/v1/ingest/evidence/export", "/v1/ingest/evidence/package"],
  );
  assert.deepEqual(
    buildIngestEvidenceApiPackageDescriptors(apiReplayFixture).map(
      (descriptor) => descriptor.descriptorId,
    ),
    [
      "package",
      "manifest",
      "evidence",
      "content",
      "file_manifest_json",
      "file_evidence_json",
      "export_json",
      "export_manifest",
    ],
  );

  const localOnlyStatus = buildIngestEvidenceApiLocalOnlyStatus(apiReplayFixture);
  assert.equal(localOnlyStatus.statusLabel, "Complete");

  const redactionSummary = buildIngestEvidenceApiRedactionSummary(apiReplayFixture);
  assert.equal(redactionSummary.emptyState.label, "No redaction rules");

  assert.equal(
    buildIngestEvidenceApiEmptyStates().packageDescriptors.label,
    "No package manifest",
  );
}

function testDirectApiResponses() {
  const manifest = buildApiManifest();
  const exportState = buildIngestEvidenceApiState(buildExportResponse("json", manifest), {
    apiBase: "http://127.0.0.1:7317",
  });

  assert.equal(exportState.generatedAt, "2026-04-27T08:30:00.000Z");
  assert.deepEqual(
    exportState.formatCards.map((card) => [card.format, card.commandId]),
    [["json", "api_export_json"]],
  );
  assert.deepEqual(
    exportState.packageDescriptors.map((descriptor) => descriptor.descriptorId),
    ["manifest", "content", "export_json"],
  );

  const packageState = buildIngestEvidenceApiState(buildPackageResponse(manifest), {
    apiBase: "http://127.0.0.1:7317",
  });
  assert.deepEqual(
    packageState.packageDescriptors.map((descriptor) => descriptor.descriptorId),
    ["package", "manifest", "evidence", "file_manifest_json", "file_evidence_json"],
  );
}

function testEmptyAndErrorStates() {
  const emptyState = buildIngestEvidenceApiState({
    schemaVersion: "ingest-evidence-api-requests.v1",
    generatedAt: "2026-04-27T09:00:00.000Z",
    requests: [],
  });

  assert.equal(emptyState.generatedAt, "2026-04-27T09:00:00.000Z");
  assert.deepEqual(emptyState.formatCards, []);
  assert.deepEqual(emptyState.commandRows, []);
  assert.deepEqual(emptyState.routeRows, []);
  assert.deepEqual(emptyState.packageDescriptors, []);
  assert.equal(emptyState.emptyStates.routes.label, "No routes");
  assert.deepEqual(emptyState.errorStates, []);

  const errorReplay = {
    generatedAt: "2026-04-27T09:05:00.000Z",
    requests: [
      {
        id: "api_package_error",
        route: {
          method: "POST",
          path: "/v1/ingest/evidence/package",
        },
        response: {
          status: 503,
          body: {
            error: {
              message: "Package offline",
            },
          },
        },
      },
    ],
  };
  const errorState = buildIngestEvidenceApiState(errorReplay);
  assert.deepEqual(
    errorState.errorStates.map((error) => [
      error.context,
      error.errorState.label,
      error.errorState.description,
    ]),
    [["package", "Package manifest could not load", "Package offline"]],
  );
  assert.deepEqual(
    buildIngestEvidenceApiErrorStates(errorReplay).map((error) => [
      error.context,
      error.errorState.description,
    ]),
    [["package", "Package offline"]],
  );
}

function testReturnedViewModelsAreDefensivelyCloned() {
  const apiReplayFixture = buildApiReplayFixture();
  const state = buildIngestEvidenceApiState(apiReplayFixture);

  state.localOnlyStatus.allowedUrlPrefixes.push("mutated");
  state.formatCards[0].detailLabels.push("mutated");
  state.commandRows[0].detailLabels.push("mutated");
  state.routeRows[0].formatLabels[0] = "mutated";
  state.routeRows[0].commandIds.push("mutated");
  state.packageDescriptors[0].detailLabels.push("mutated");
  state.redactionSummary.detailLabels.push("mutated");
  state.emptyStates.formats.label = "mutated";

  const rebuilt = buildIngestEvidenceApiState(apiReplayFixture);
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
  assert.equal(rebuilt.redactionSummary.detailLabels.includes("mutated"), false);
  assert.equal(rebuilt.emptyStates.formats.label, "No export formats");
}

testPassThroughExportSessionFixture();
testApiReplayBuildsReviewState();
testFocusedBridgeHelpers();
testDirectApiResponses();
testEmptyAndErrorStates();
testReturnedViewModelsAreDefensivelyCloned();

console.log("ingest evidence api state tests passed");
