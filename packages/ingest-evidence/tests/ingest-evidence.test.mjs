import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  INGEST_EVIDENCE_ERROR_CODES,
  INGEST_EVIDENCE_REDACTION,
  IngestEvidenceValidationError,
  createIngestEvidenceManifest,
  createIngestEvidencePackage,
  fingerprintIngestEvidence,
  normalizeIngestEvidence,
  normalizeIngestEvidenceRecords,
  redactIngestEvidenceValue,
  renderIngestEvidenceCsv,
  renderIngestEvidenceJsonl,
  serializeDeterministicJson,
} from "../src/index.ts";

const fixturesDir = fileURLToPath(new URL("../../../examples/ingest-search/", import.meta.url));
const secretValue = "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJsb2NhbCJ9.signaturepart";

test("normalizes example audit evidence into immutable canonical records", async () => {
  const fixture = await readFixture();
  const normalized = normalizeIngestEvidence(fixture);
  const records = normalizeIngestEvidenceRecords(fixture);

  assert.equal(normalized.kind, "ingest-evidence.audit-evidence");
  assert.equal(normalized.localOnly, true);
  assert.equal(normalized.sessionId, INGEST_EVIDENCE_REDACTION);
  assert.equal(normalized.records.length, 28);
  assert.deepEqual(
    normalized.records.map((record) => record.recordType).slice(0, 4),
    ["evidenceSummary", "evidenceFile", "evidenceFile", "evidenceFile"],
  );
  assert.equal(records[0].recordType, "evidenceSummary");
  assert.match(normalized.fingerprint, /^fnv1a64:[0-9a-f]{16}$/);
  assert.throws(() => {
    normalized.records[0].payload.sourceCount = 99;
  }, TypeError);
});

test("renders JSONL and CSV with stable output and package descriptors", async () => {
  const fixture = await readFixture();
  const jsonl = renderIngestEvidenceJsonl(fixture);
  const csv = renderIngestEvidenceCsv(fixture);
  const exported = createIngestEvidencePackage(fixture, {
    createdAt: "2026-04-27T08:30:00.000Z",
  });
  const manifest = createIngestEvidenceManifest(fixture, {
    createdAt: "2026-04-27T08:30:00.000Z",
  });
  const jsonRecords = jsonl.split("\n").map((line) => JSON.parse(line));

  assert.equal(jsonRecords.length, 28);
  assert.deepEqual(
    jsonRecords.slice(0, 3).map((record) => record.recordId),
    ["evidenceSummary", "apiRequests", "clientSession"],
  );
  assert.equal(
    csv.split("\n")[0],
    "recordType,recordId,sourceUri,fixturePath,checksum,payload,fingerprint",
  );
  assert.equal(csv.includes("\"{"), true);
  assert.equal(exported.manifest.fingerprint, manifest.fingerprint);
  assert.equal(exported.manifest.recordCount, 28);
  assert.equal(exported.manifest.jsonl.lines, 28);
  assert.equal(exported.manifest.csv.rows, 28);
  assert.equal(exported.manifest.evidenceFiles.length, 9);
  assert.equal(exported.manifest.sourceChecksums.length, 9);
});

test("redacts sensitive fields before JSONL, CSV, and manifest rendering", async () => {
  const fixture = await readFixture();
  const source = cloneJson(fixture);
  source.sessionId = "sess_secret_local_002";
  source.apiRequestTrace[0].authorization = secretValue;
  source.clientSessionTrace[0].command = `node local.js --token=${"a".repeat(16)}`;

  const normalized = normalizeIngestEvidence(source);
  const jsonl = renderIngestEvidenceJsonl(source);
  const csv = renderIngestEvidenceCsv(source);
  const exported = createIngestEvidencePackage(source);

  assert.equal(redactIngestEvidenceValue({ apiKey: "small" }).apiKey, INGEST_EVIDENCE_REDACTION);
  assert.equal(normalized.sessionId, INGEST_EVIDENCE_REDACTION);
  assert.equal(jsonl.includes(secretValue), false);
  assert.equal(csv.includes(secretValue), false);
  assert.equal(serializeDeterministicJson(exported.manifest).includes(secretValue), false);
  assert.equal(jsonl.includes(INGEST_EVIDENCE_REDACTION), true);
  assert.equal(csv.includes(INGEST_EVIDENCE_REDACTION), true);
});

test("rejects invalid evidence, non-local sources, and duplicate record ids", async () => {
  const fixture = await readFixture();

  assert.throws(
    () => normalizeIngestEvidence({ ...fixture, localOnly: false }),
    (error) => {
      assert.equal(error instanceof IngestEvidenceValidationError, true);
      assert.equal(error.code, INGEST_EVIDENCE_ERROR_CODES.INVALID_EVIDENCE);
      assert.equal(error.details.path, "evidence.localOnly");
      return true;
    },
  );

  const badChecksum = cloneJson(fixture);
  badChecksum.evidenceFiles[0].sha256 = "not-a-sha";
  assert.throws(
    () => normalizeIngestEvidence(badChecksum),
    (error) => {
      assert.equal(error instanceof IngestEvidenceValidationError, true);
      assert.equal(error.details.path, "evidence.evidenceFiles.0.sha256");
      return true;
    },
  );

  const remoteSource = cloneJson(fixture);
  remoteSource.sourceSnapshots[0].sourceUri = "https://example.test/source";
  assert.throws(
    () => normalizeIngestEvidence(remoteSource),
    (error) => {
      assert.equal(error instanceof IngestEvidenceValidationError, true);
      assert.equal(error.details.path, "evidence.sourceSnapshots.0.sourceUri");
      return true;
    },
  );

  const duplicate = cloneJson(fixture);
  duplicate.evidenceFiles[1].id = duplicate.evidenceFiles[0].id;
  assert.throws(
    () => normalizeIngestEvidence(duplicate),
    (error) => {
      assert.equal(error instanceof IngestEvidenceValidationError, true);
      assert.equal(error.details.recordType, "evidenceFile");
      return true;
    },
  );
});

test("fingerprints are deterministic across object key and array order", async () => {
  const fixture = await readFixture();
  const shuffled = {
    clientSessionTrace: [...fixture.clientSessionTrace].reverse(),
    apiRequestTrace: [...fixture.apiRequestTrace].reverse(),
    quarantineDecisions: [...fixture.quarantineDecisions].reverse(),
    citationEvidence: [...fixture.citationEvidence].reverse(),
    sourceSnapshots: [...fixture.sourceSnapshots].reverse(),
    evidenceFiles: [...fixture.evidenceFiles].reverse(),
    evidenceSummary: {
      clientSessionTraceCount: 4,
      apiRequestTraceCount: 6,
      quarantineDecisionCount: 1,
      citationCount: 4,
      evidenceFileCount: 9,
      sourceCount: 3,
    },
    localOnly: fixture.localOnly,
    sessionId: fixture.sessionId,
    workspaceId: fixture.workspaceId,
    generatedAt: fixture.generatedAt,
    schemaVersion: fixture.schemaVersion,
  };

  assert.equal(fingerprintIngestEvidence(fixture), fingerprintIngestEvidence(shuffled));
  assert.equal(
    serializeDeterministicJson({ z: 1, a: { b: false, a: null } }),
    "{\"a\":{\"a\":null,\"b\":false},\"z\":1}",
  );
});

test("clone boundaries prevent source mutation from leaking into normalized output", async () => {
  const fixture = await readFixture();
  const normalized = normalizeIngestEvidence(fixture);
  const before = normalized.fingerprint;

  fixture.evidenceSummary.sourceCount = 999;
  fixture.evidenceFiles[0].sha256 = "0".repeat(64);

  assert.equal(normalized.fingerprint, before);
  assert.equal(normalized.evidenceSummary.sourceCount, 3);
  assert.equal(
    normalized.records.find((record) => record.recordId === "notes").checksum,
    "c6a91ee2a9789110ebb39cbd27c7f48c26087c5c13aff8bda69da669ada3cda7",
  );
});

async function readFixture() {
  return JSON.parse(await readFile(join(fixturesDir, "audit-evidence.json"), "utf8"));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
