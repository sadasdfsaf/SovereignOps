import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createIngestEvidenceRoutes } from "../apps/api/src/ingestEvidenceRoutes.ts";
import { createApiRouter } from "../apps/api/src/router.ts";
import { runIngestEvidenceCli } from "../packages/cli/src/ingestEvidence.ts";
import {
  createIngestEvidenceManifest,
  createIngestEvidencePackage,
  normalizeIngestEvidence,
  renderIngestEvidenceCsv,
  renderIngestEvidenceJsonl,
} from "../packages/ingest-evidence/src/index.ts";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDirectory, "..");
const evidencePath = resolve(workspaceRoot, "examples/ingest-search/audit-evidence.json");
const parityPath = resolve(workspaceRoot, "examples/ingest-search/evidence-parity-session.json");

test("keeps ingest evidence parity across package, API route, and CLI helpers", async () => {
  const { evidence, evidenceText, parity } = await readParityInputs();
  const expectedSummary = parity.evidenceFixture.expectedSummary;
  const expectedRecordCount = parity.expectedParity.recordCount;
  const expectedNormalizedRecordCount = parity.expectedParity.normalizedRecordCount;
  const expectedChecksums = sorted(evidence.evidenceFiles.map((file) => file.sha256));
  const expectedChecksumFingerprint = fingerprintJson(expectedChecksums);

  assert.equal(parity.localOnly, true);
  assert.equal(sha256Hex(evidenceText), parity.evidenceFixture.sha256);
  assert.equal(evidence.schemaVersion, parity.evidenceFixture.schemaVersion);
  assert.deepEqual(evidence.evidenceSummary, expectedSummary);
  assert.equal(parity.evidenceFixture.expectedRecordCount, expectedRecordCount);
  assert.equal(parity.evidenceFixture.expectedNormalizedRecordCount, expectedNormalizedRecordCount);
  assert.equal(expectedChecksums.length, parity.expectedParity.sourceChecksumCount);
  assert.deepEqual(
    parity.localOnlySurfaces.map((surface) => [surface.id, surface.network]),
    [
      ["package_helpers", "none"],
      ["api_router_dispatch", "none"],
      ["cli_runner", "none"],
    ],
  );

  const packageSurface = createPackageSurface(evidence, parity);
  const apiSurface = await createApiSurface(evidence, parity);
  const cliSurface = await createCliSurface(parity);

  assertSurface(packageSurface, {
    expectedChecksumFingerprint,
    expectedRecordCount,
    expectedSummary,
    pattern: parity.expectedParity.fingerprintPatterns.package,
  });
  assertSurface(apiSurface, {
    expectedChecksumFingerprint,
    expectedRecordCount,
    expectedSummary,
    pattern: parity.expectedParity.fingerprintPatterns.api,
  });
  assertSurface(cliSurface, {
    expectedChecksumFingerprint,
    expectedRecordCount,
    expectedSummary,
    pattern: parity.expectedParity.fingerprintPatterns.cli,
  });

  assert.equal(packageSurface.normalizedRecordCount, expectedNormalizedRecordCount);
  assert.equal(packageSurface.renderedJsonlRows, expectedNormalizedRecordCount);
  assert.equal(packageSurface.renderedCsvRows, expectedNormalizedRecordCount);
  assert.match(expectedChecksumFingerprint, new RegExp(parity.expectedParity.fingerprintPatterns.checksumSet));
});

function createPackageSurface(evidence, parity) {
  const normalized = normalizeIngestEvidence(evidence);
  const options = {
    createdAt: parity.generatedAt,
    packageId: "ingest_evidence_parity_pkg",
  };
  const manifest = createIngestEvidenceManifest(evidence, options);
  const evidencePackage = createIngestEvidencePackage(evidence, options);
  const jsonl = renderIngestEvidenceJsonl(evidence);
  const csv = renderIngestEvidenceCsv(evidence);

  assert.equal(evidencePackage.manifest.fingerprint, manifest.fingerprint);
  assert.equal(evidencePackage.manifest.recordCount, manifest.recordCount);
  assert.equal(manifest.recordCount, normalized.records.length);
  assert.equal(manifest.jsonl.lines, normalized.records.length);
  assert.equal(manifest.csv.rows, normalized.records.length);
  assert.equal(manifest.sourceChecksums.length, manifest.evidenceFiles.length);

  return {
    id: "package_helpers",
    summary: normalized.evidenceSummary,
    recordCount: normalized.records.filter((record) => record.recordType !== "evidenceSummary").length,
    normalizedRecordCount: normalized.records.length,
    checksumFingerprint: fingerprintJson(manifest.evidenceFiles.map((file) => file.sha256)),
    fingerprints: [
      normalized.fingerprint,
      manifest.fingerprint,
      evidencePackage.fingerprint,
      manifest.jsonl.fingerprint,
      manifest.csv.fingerprint,
    ],
    renderedJsonlRows: jsonl.split("\n").length,
    renderedCsvRows: csv.split("\n").length - 1,
  };
}

async function createApiSurface(evidence, parity) {
  const router = createApiRouter(createIngestEvidenceRoutes());
  const body = {
    evidence: structuredClone(evidence),
    createdAt: parity.generatedAt,
    exportId: "ingest_evidence_parity_api",
    filters: parity.selectedFilters,
  };
  const firstPackage = await router.dispatch({
    method: "POST",
    path: "/v1/ingest/evidence/package",
    body,
  });
  const secondPackage = await router.dispatch({
    method: "POST",
    path: "/v1/ingest/evidence/package",
    body: structuredClone(body),
  });
  const exportResponse = await router.dispatch({
    method: "POST",
    path: "/v1/ingest/evidence/export",
    body: {
      ...structuredClone(body),
      format: "json",
    },
  });

  assert.equal(firstPackage.status, 200);
  assert.equal(secondPackage.status, 200);
  assert.equal(exportResponse.status, 200);
  assert.deepEqual(firstPackage.body, secondPackage.body);

  const evidenceFile = firstPackage.body.files.find((file) => file.path === "evidence.json");
  assert.ok(evidenceFile);
  assert.equal(evidenceFile.fingerprint, firstPackage.body.manifest.content.fingerprint);
  assert.equal(exportResponse.body.fingerprint, firstPackage.body.manifest.content.fingerprint);
  assert.equal(exportResponse.body.content, evidenceFile.content);

  const exportedEvidence = JSON.parse(evidenceFile.content);

  return {
    id: "api_router_dispatch",
    summary: firstPackage.body.manifest.evidenceSummary,
    recordCount: firstPackage.body.manifest.sections.reduce(
      (total, section) => total + section.itemCount,
      0,
    ),
    checksumFingerprint: fingerprintJson(exportedEvidence.evidenceFiles.map((file) => file.sha256)),
    fingerprints: [
      firstPackage.body.manifest.content.fingerprint,
      firstPackage.body.manifest.fingerprint,
      firstPackage.body.fingerprint,
      exportResponse.body.fingerprint,
    ],
  };
}

async function createCliSurface(parity) {
  const summaryResult = await runIngestEvidenceCli([
    "ingest",
    "evidence",
    "summary",
    "--input",
    parity.evidenceFixture.path,
  ], { cwd: workspaceRoot });
  const packageArgv = [
    "ingest",
    "evidence",
    "package",
    "--input",
    parity.evidenceFixture.path,
  ];
  const firstPackageResult = await runIngestEvidenceCli(packageArgv, { cwd: workspaceRoot });
  const secondPackageResult = await runIngestEvidenceCli(packageArgv, { cwd: workspaceRoot });
  const exportResult = await runIngestEvidenceCli([
    "ingest",
    "evidence",
    "export",
    "--input",
    parity.evidenceFixture.path,
    "--format",
    "jsonl",
  ], { cwd: workspaceRoot });

  assert.ok(summaryResult);
  assert.ok(firstPackageResult);
  assert.ok(secondPackageResult);
  assert.ok(exportResult);
  assert.equal(summaryResult.exitCode, 0);
  assert.equal(firstPackageResult.exitCode, 0);
  assert.equal(secondPackageResult.exitCode, 0);
  assert.equal(exportResult.exitCode, 0);
  assert.equal(firstPackageResult.stdout, secondPackageResult.stdout);
  assert.equal(firstPackageResult.stderr, "");

  const summary = JSON.parse(summaryResult.stdout);
  const evidencePackage = JSON.parse(firstPackageResult.stdout);
  const exported = JSON.parse(exportResult.stdout);

  return {
    id: "cli_runner",
    summary: pickExpectedSummary(summary.summary),
    recordCount: evidencePackage.manifest.recordCount,
    checksumFingerprint: fingerprintJson(evidencePackage.manifest.evidenceFiles.map((file) => file.sha256)),
    fingerprints: [
      evidencePackage.manifest.fingerprint,
      evidencePackage.fingerprint,
      evidencePackage.manifest.jsonl.sha256,
      evidencePackage.manifest.csv.sha256,
      exported.contentSha256,
    ],
  };
}

function assertSurface(surface, expected) {
  assert.deepEqual(surface.summary, expected.expectedSummary, surface.id);
  assert.equal(surface.recordCount, expected.expectedRecordCount, surface.id);
  assert.equal(surface.checksumFingerprint, expected.expectedChecksumFingerprint, surface.id);
  for (const fingerprint of surface.fingerprints) {
    assert.match(fingerprint, new RegExp(expected.pattern), surface.id);
  }
}

async function readParityInputs() {
  const [evidenceText, parityText] = await Promise.all([
    readFile(evidencePath, "utf8"),
    readFile(parityPath, "utf8"),
  ]);

  return {
    evidence: JSON.parse(evidenceText),
    evidenceText,
    parity: JSON.parse(parityText),
  };
}

function pickExpectedSummary(summary) {
  return {
    sourceCount: summary.sourceCount,
    evidenceFileCount: summary.evidenceFileCount,
    citationCount: summary.citationCount,
    quarantineDecisionCount: summary.quarantineDecisionCount,
    apiRequestTraceCount: summary.apiRequestTraceCount,
    clientSessionTraceCount: summary.clientSessionTraceCount,
  };
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function fingerprintJson(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(sorted(value)), "utf8").digest("hex")}`;
}

function sha256Hex(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
