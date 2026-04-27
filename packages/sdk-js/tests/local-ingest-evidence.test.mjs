import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  LocalIngestEvidenceValidationError,
  buildLocalIngestEvidenceExportPreview,
  detectLocalIngestEvidenceDrift,
  loadLocalIngestEvidence,
  summarizeLocalIngestEvidence,
} from "../src/localIngestEvidence.ts";

const fixtureUrl = new URL("../../../examples/ingest-search/audit-evidence.json", import.meta.url);

test("loads audit evidence and summarizes files, sources, citations, and decisions", () => {
  const evidence = loadLocalIngestEvidence(readFileSync(fixtureUrl, "utf8"));
  const summary = summarizeLocalIngestEvidence(evidence);

  assert.equal(evidence.schemaVersion, "ingest-search-audit-evidence.v1");
  assert.equal(evidence.localOnly, true);
  assert.deepEqual(summary.computedCounts, {
    sourceCount: 3,
    evidenceFileCount: 9,
    citationCount: 4,
    quarantineDecisionCount: 1,
    apiRequestTraceCount: 6,
    clientSessionTraceCount: 4,
  });
  assert.deepEqual(summary.declaredCounts, summary.computedCounts);
  assert.deepEqual(summary.citations.byKind, {
    indexDocument: 3,
    quarantineItem: 1,
  });
  assert.deepEqual(summary.quarantineDecisions.byTransition, {
    "open->released": 1,
  });

  const recordsCsv = summary.sources.find((source) =>
    source.sourceUri === "fixture://ingest-search/records.csv"
  );
  assert.notEqual(recordsCsv, undefined);
  assert.equal(recordsCsv.repositoryState, "partly_quarantined");
  assert.equal(recordsCsv.citationCount, 2);
  assert.equal(recordsCsv.decisionCount, 1);
});

test("reports no drift for the checked-in audit evidence fixture", () => {
  const report = detectLocalIngestEvidenceDrift(fixtureObject());

  assert.deepEqual(report, {
    ok: true,
    issueCount: 0,
    errorCount: 0,
    warningCount: 0,
    issues: [],
  });
});

test("detects stale counts and missing references", () => {
  const drifted = fixtureObject();
  drifted.evidenceSummary.citationCount = 99;
  drifted.citationEvidence[0].documentId = "idx_missing_notes";
  drifted.quarantineDecisions[0].requestId = "api_missing_decision";
  drifted.clientSessionTrace[0].sourceUris.push("fixture://ingest-search/missing.md");

  const report = detectLocalIngestEvidenceDrift(drifted);
  const codes = new Set(report.issues.map((issue) => issue.code));

  assert.equal(report.ok, false);
  assert.equal(report.warningCount, 1);
  assert.equal(codes.has("summary_count_mismatch"), true);
  assert.equal(codes.has("missing_document_reference"), true);
  assert.equal(codes.has("missing_api_request_reference"), true);
  assert.equal(codes.has("missing_source_reference"), true);
});

test("builds deterministic export preview payloads", () => {
  const options = {
    exportId: "ingest_preview_demo",
    generatedAt: "2026-04-27T09:00:00.000Z",
  };
  const preview = buildLocalIngestEvidenceExportPreview(fixtureObject(), options);
  const repeated = buildLocalIngestEvidenceExportPreview(fixtureObject(), options);

  assert.equal(preview.kind, "ingest-evidence.export-preview");
  assert.equal(preview.schemaVersion, "ingest-search-audit-evidence-export-preview.v1");
  assert.equal(preview.exportId, "ingest_preview_demo");
  assert.equal(preview.generatedAt, "2026-04-27T09:00:00.000Z");
  assert.equal(preview.summary.computedCounts.evidenceFileCount, 9);
  assert.equal(preview.files.length, 9);
  assert.equal(preview.sources.length, 3);
  assert.equal(preview.citations.length, 4);
  assert.equal(preview.decisions.length, 1);
  assert.equal(preview.traces.apiRequests.length, 6);
  assert.equal(preview.drift.ok, true);
  assert.match(preview.manifest.evidenceFingerprint, /^fnv1a32:/);
  assert.equal(preview.manifest.previewFingerprint, repeated.manifest.previewFingerprint);
});

test("redacts sensitive preview fields with stable placeholders", () => {
  const preview = buildLocalIngestEvidenceExportPreview(fixtureObject(), {
    generatedAt: "2026-04-27T09:00:00.000Z",
    redact: true,
  });
  const serialized = JSON.stringify(preview);

  assert.equal(preview.redaction.enabled, true);
  assert.deepEqual(preview.redaction.fields, [
    "actorIds",
    "checksums",
    "commands",
    "paths",
    "reasons",
    "sourceUris",
  ]);
  assert.match(preview.sources[0].sourceUri, /^\[redacted:sourceUri:/);
  assert.match(preview.sources[0].checksum, /^\[redacted:checksum:/);
  assert.match(preview.decisions[0].actorId, /^\[redacted:actorId:/);
  assert.match(preview.decisions[0].reason, /^\[redacted:reason:/);
  assert.match(preview.traces.clientSessions.at(-1).command, /^\[redacted:command:/);
  assert.doesNotMatch(serialized, /fixture:\/\/ingest-search/);
  assert.doesNotMatch(serialized, /local_reviewer/);
  assert.doesNotMatch(serialized, /Status accepted for local indexing/);
  assert.doesNotMatch(serialized, /examples\/ingest-search/);
});

test("keeps load and preview clone boundaries isolated", () => {
  const raw = fixtureObject();
  const evidence = loadLocalIngestEvidence(raw);
  raw.evidenceFiles[0].id = "mutated_after_load";

  assert.notEqual(evidence.evidenceFiles[0].id, "mutated_after_load");
  assert.throws(
    () => {
      evidence.evidenceFiles[0].id = "mutate_frozen_evidence";
    },
    TypeError,
  );

  const preview = buildLocalIngestEvidenceExportPreview(evidence);
  assert.throws(
    () => {
      preview.files[0].id = "mutate_frozen_preview";
    },
    TypeError,
  );
});

test("surfaces useful validation errors for invalid inputs", () => {
  assert.throws(
    () => loadLocalIngestEvidence("{not json"),
    /ingest evidence JSON could not be parsed/,
  );

  assert.throws(
    () => loadLocalIngestEvidence({
      schemaVersion: "ingest-search-audit-evidence.v1",
      evidenceFiles: "not-an-array",
      sourceSnapshots: [],
      citationEvidence: [],
      quarantineDecisions: [],
      apiRequestTrace: [],
      clientSessionTrace: [],
    }),
    (error) => {
      assert.equal(error instanceof LocalIngestEvidenceValidationError, true);
      assert.deepEqual(error.issues.map((issue) => issue.path), ["evidenceFiles"]);
      return true;
    },
  );

  const invalidRange = fixtureObject();
  invalidRange.citationEvidence[0].range = {};

  assert.throws(
    () => loadLocalIngestEvidence(invalidRange),
    (error) => {
      assert.equal(error instanceof LocalIngestEvidenceValidationError, true);
      assert.equal(
        error.issues.some((issue) => issue.path.endsWith(".range") && /at least one locator/.test(issue.message)),
        true,
      );
      return true;
    },
  );
});

function fixtureObject() {
  return JSON.parse(readFileSync(fixtureUrl, "utf8"));
}
