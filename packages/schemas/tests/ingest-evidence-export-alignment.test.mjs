import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  INGEST_EVIDENCE_SCHEMA_VERSION,
  JSON_SCHEMA_DRAFT,
  ingestEvidenceSchema,
  ingestEvidenceSchemaDefinition,
  validateIngestEvidence,
} from "../src/ingestEvidence.ts";
import {
  INGEST_EVIDENCE_ERROR_CODES,
  INGEST_EVIDENCE_FORMAT_VERSION,
  INGEST_EVIDENCE_SCHEMA_VERSION as PACKAGE_INGEST_EVIDENCE_SCHEMA_VERSION,
  IngestEvidenceValidationError,
  createIngestEvidenceManifest,
  createIngestEvidencePackage,
  fingerprintIngestEvidenceValue,
  normalizeIngestEvidence,
  renderIngestEvidenceCsv,
  renderIngestEvidenceJsonl,
} from "../../ingest-evidence/src/index.ts";

const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url));
const packageOptions = {
  createdAt: "2026-04-27T09:10:00.000Z",
  packageId: "ingevid_compact_alignment",
};
const csvColumns = [
  "recordType",
  "recordId",
  "sourceUri",
  "fixturePath",
  "checksum",
  "payload",
  "fingerprint",
];
const recordTypeOrder = [
  "evidenceSummary",
  "evidenceFile",
  "sourceSnapshot",
  "citationEvidence",
  "quarantineDecision",
  "apiRequestTrace",
  "clientSessionTrace",
];

test("schema validator accepts evidence fixture and aligns metadata with package helper", async () => {
  const evidence = await readFixtureJson("ingest-evidence.valid.json");
  const validation = validateIngestEvidence(evidence);
  const normalized = normalizeIngestEvidence(evidence);
  const manifest = createIngestEvidenceManifest(evidence, packageOptions);
  const jsonl = renderIngestEvidenceJsonl(evidence);
  const csv = renderIngestEvidenceCsv(evidence);

  assert.equal(validation.ok, true, formatIssues(validation.issues));
  assert.deepEqual(validation.issues, []);
  assert.equal(INGEST_EVIDENCE_SCHEMA_VERSION, PACKAGE_INGEST_EVIDENCE_SCHEMA_VERSION);
  assert.equal(ingestEvidenceSchemaDefinition.kind, "ingestAuditEvidence");
  assert.equal(ingestEvidenceSchemaDefinition.schemaVersion, PACKAGE_INGEST_EVIDENCE_SCHEMA_VERSION);
  assert.equal(ingestEvidenceSchemaDefinition.schema, ingestEvidenceSchema);
  assert.equal(ingestEvidenceSchemaDefinition.schema.$schema, JSON_SCHEMA_DRAFT);
  assert.equal(ingestEvidenceSchemaDefinition.title, ingestEvidenceSchema.title);
  assert.equal(
    ingestEvidenceSchemaDefinition.schema.properties.schemaVersion.const,
    PACKAGE_INGEST_EVIDENCE_SCHEMA_VERSION,
  );
  assert.equal(ingestEvidenceSchemaDefinition.schema.properties.localOnly.const, true);

  assert.equal(manifest.evidence.schemaVersion, ingestEvidenceSchemaDefinition.schemaVersion);
  assert.equal(manifest.evidence.generatedAt, evidence.generatedAt);
  assert.equal(manifest.evidence.workspaceId, evidence.workspaceId);
  assert.equal(manifest.evidence.localOnly, true);
  assert.equal(manifest.evidence.fingerprint, normalized.fingerprint);
  assert.equal(manifest.recordCount, normalized.records.length);
  assert.deepEqual(manifest.recordFingerprints, normalized.records.map((record) => record.fingerprint));
  assert.deepEqual(manifest.sourceChecksums, normalized.sourceChecksums);
  assert.equal(manifest.jsonl.fingerprint, fingerprintIngestEvidenceValue(jsonl));
  assert.equal(manifest.csv.fingerprint, fingerprintIngestEvidenceValue(csv));
  assert.deepEqual(manifest.csv.columns, csvColumns);
});

test("valid package fixture matches helper output and manifest descriptors", async () => {
  const fixture = await readFixtureJson("ingest-evidence-package.valid.json");
  const expected = createIngestEvidencePackage(compactEvidence(), packageOptions);
  const issues = validatePackageFixture(fixture);

  assert.deepEqual(fixture, expected);
  assert.deepEqual(issues, []);
  assert.equal(fixture.manifest.evidence.schemaVersion, ingestEvidenceSchemaDefinition.schemaVersion);
  assert.equal(fixture.manifest.evidence.localOnly, true);
  assert.equal(fixture.manifest.recordCount, 3);
  assert.deepEqual(fixture.manifest.recordTypes, [
    "evidenceSummary",
    "evidenceFile",
    "sourceSnapshot",
  ]);
});

test("invalid package fixture reports package shape alignment failures", async () => {
  const fixture = await readFixtureJson("ingest-evidence-package.invalid.json");
  const issues = validatePackageFixture(fixture);

  assertIssuePaths(issues, [
    "$.kind",
    "$.version",
    "$.manifest.evidence.schemaVersion",
    "$.manifest.recordCount",
    "$.manifest.recordTypes",
    "$.manifest.jsonl.fingerprint",
    "$.manifest.jsonl.lines",
    "$.manifest.csv.fingerprint",
    "$.manifest.csv.rows",
    "$.manifest.csv.columns",
    "$.manifest.fingerprint",
    "$.fingerprint",
  ]);
  assert.match(messageForPath(issues, "$.manifest.recordCount"), /JSONL record count/);
  assert.match(messageForPath(issues, "$.manifest.evidence.schemaVersion"), /schema metadata/);
  assert.match(messageForPath(issues, "$.manifest.fingerprint"), /manifest body/);
});

test("invalid evidence shapes produce schema and package helper failure paths", async () => {
  const fixture = await readFixtureJson("ingest-evidence.invalid.json");
  const validation = validateIngestEvidence(fixture);

  assert.equal(validation.ok, false);
  assertIssuePaths(validation.issues, [
    "schemaVersion",
    "evidenceSummary.sourceCount",
    "sourceSnapshots[0].sourceUri",
    "apiRequestTrace[0].fixtureFileId",
  ]);
  assert.throws(
    () => createIngestEvidencePackage(fixture),
    (error) => {
      assert.equal(error instanceof IngestEvidenceValidationError, true);
      assert.equal(error.code, INGEST_EVIDENCE_ERROR_CODES.INVALID_EVIDENCE);
      assert.equal(error.details.path, "evidence.schemaVersion");
      return true;
    },
  );

  const badCounts = compactEvidence();
  badCounts.evidenceSummary.sourceCount = 2;
  const countValidation = validateIngestEvidence(badCounts);

  assert.equal(countValidation.ok, false);
  assertIssuePaths(countValidation.issues, ["evidenceSummary.sourceCount"]);
  assert.throws(
    () => createIngestEvidenceManifest(badCounts),
    (error) => {
      assert.equal(error instanceof IngestEvidenceValidationError, true);
      assert.equal(error.details.path, "evidence.evidenceSummary.sourceCount");
      return true;
    },
  );
});

async function readFixtureJson(file) {
  return JSON.parse(await readFile(join(fixturesDir, file), "utf8"));
}

function compactEvidence() {
  return {
    schemaVersion: INGEST_EVIDENCE_SCHEMA_VERSION,
    generatedAt: "2026-04-27T09:00:00.000Z",
    workspaceId: "wsp_package_alignment",
    sessionId: "sess_package_alignment_001",
    localOnly: true,
    evidenceSummary: {
      sourceCount: 1,
      evidenceFileCount: 1,
      citationCount: 0,
      quarantineDecisionCount: 0,
      apiRequestTraceCount: 0,
      clientSessionTraceCount: 0,
    },
    evidenceFiles: [
      {
        id: "compactNotes",
        fixturePath: "examples/ingest-search/compact-notes.json",
        schemaVersion: "compact-notes.v1",
        sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    ],
    sourceSnapshots: [
      {
        sourceUri: "fixture://ingest-search/compact-notes.json",
        path: "examples/ingest-search/compact-notes.json",
        mediaType: "application/json",
        checksum: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        repositoryState: "indexed",
        logEntryIds: ["log_compact_notes"],
        indexDocumentIds: [],
        quarantineItemIds: [],
      },
    ],
    citationEvidence: [],
    quarantineDecisions: [],
    apiRequestTrace: [],
    clientSessionTrace: [],
  };
}

function validatePackageFixture(value) {
  const issues = [];
  const record = requireRecord(value, "$", issues);
  if (!record) {
    return issues;
  }

  requireExact(record, "kind", "ingest-evidence.package", "$", issues);
  requireExact(record, "version", INGEST_EVIDENCE_FORMAT_VERSION, "$", issues);
  const manifest = requireRecord(record.manifest, "$.manifest", issues);
  const jsonl = requireString(record, "jsonl", "$", issues);
  const csv = requireString(record, "csv", "$", issues);
  const packageFingerprint = requireString(record, "fingerprint", "$", issues);
  const jsonlRecords = typeof jsonl === "string" ? parseJsonl(jsonl, "$.jsonl", issues) : [];

  if (manifest) {
    validateManifest(manifest, jsonlRecords, jsonl, csv, issues);
  }

  if (manifest && packageFingerprint) {
    const expected = fingerprintIngestEvidenceValue({
      kind: "ingest-evidence.package",
      csvFingerprint: manifest.csv?.fingerprint,
      jsonlFingerprint: manifest.jsonl?.fingerprint,
      manifestFingerprint: manifest.fingerprint,
      version: INGEST_EVIDENCE_FORMAT_VERSION,
    });
    if (packageFingerprint !== expected) {
      issues.push({
        path: "$.fingerprint",
        message: "fingerprint must match package descriptor fingerprints",
      });
    }
  }

  return issues;
}

function validateManifest(manifest, jsonlRecords, jsonl, csv, issues) {
  requireExact(manifest, "kind", "ingest-evidence.manifest", "$.manifest", issues);
  requireExact(manifest, "version", INGEST_EVIDENCE_FORMAT_VERSION, "$.manifest", issues);
  requireString(manifest, "packageId", "$.manifest", issues);
  requireString(manifest, "createdAt", "$.manifest", issues);
  const evidence = requireRecord(manifest.evidence, "$.manifest.evidence", issues);
  const recordCount = requireInteger(manifest, "recordCount", "$.manifest", issues);
  const recordTypes = requireArray(manifest, "recordTypes", "$.manifest", issues);
  const recordFingerprints = requireArray(manifest, "recordFingerprints", "$.manifest", issues);
  const evidenceFiles = requireArray(manifest, "evidenceFiles", "$.manifest", issues);
  const jsonlDescriptor = requireRecord(manifest.jsonl, "$.manifest.jsonl", issues);
  const csvDescriptor = requireRecord(manifest.csv, "$.manifest.csv", issues);
  const manifestFingerprint = requireString(manifest, "fingerprint", "$.manifest", issues);

  if (evidence) {
    requireExact(
      evidence,
      "schemaVersion",
      ingestEvidenceSchemaDefinition.schemaVersion,
      "$.manifest.evidence",
      issues,
      "schemaVersion must match schema metadata",
    );
    requireExact(evidence, "localOnly", true, "$.manifest.evidence", issues);
    requireString(evidence, "generatedAt", "$.manifest.evidence", issues);
    requireString(evidence, "workspaceId", "$.manifest.evidence", issues);
    requireString(evidence, "sessionId", "$.manifest.evidence", issues);
    requireString(evidence, "fingerprint", "$.manifest.evidence", issues);
  }

  if (recordCount !== undefined && recordCount !== jsonlRecords.length) {
    issues.push({
      path: "$.manifest.recordCount",
      message: "recordCount must match JSONL record count",
    });
  }

  const expectedRecordTypes = recordTypeOrder.filter((recordType) =>
    jsonlRecords.some((jsonlRecord) => jsonlRecord.recordType === recordType)
  );
  if (recordTypes && !arrayEquals(recordTypes, expectedRecordTypes)) {
    issues.push({
      path: "$.manifest.recordTypes",
      message: "recordTypes must match JSONL record types",
    });
  }

  const expectedFingerprints = jsonlRecords.map((jsonlRecord) => jsonlRecord.fingerprint);
  if (recordFingerprints && !arrayEquals(recordFingerprints, expectedFingerprints)) {
    issues.push({
      path: "$.manifest.recordFingerprints",
      message: "recordFingerprints must match JSONL record fingerprints",
    });
  }

  if (evidenceFiles) {
    const expectedEvidenceFileCount = jsonlRecords.filter((jsonlRecord) =>
      jsonlRecord.recordType === "evidenceFile"
    ).length;
    if (evidenceFiles.length !== expectedEvidenceFileCount) {
      issues.push({
        path: "$.manifest.evidenceFiles",
        message: "evidenceFiles must match JSONL evidence file records",
      });
    }
  }

  if (jsonlDescriptor && typeof jsonl === "string") {
    validateContentDescriptor(jsonlDescriptor, "$.manifest.jsonl", {
      content: jsonl,
      countKey: "lines",
      count: jsonlRecords.length,
      mediaType: "application/jsonl",
    }, issues);
  }

  if (csvDescriptor && typeof csv === "string") {
    const csvLines = csv.length === 0 ? [] : csv.split("\n");
    validateContentDescriptor(csvDescriptor, "$.manifest.csv", {
      content: csv,
      countKey: "rows",
      count: Math.max(0, csvLines.length - 1),
      mediaType: "text/csv",
    }, issues);
    if (!arrayEquals(csvDescriptor.columns, csvColumns)) {
      issues.push({
        path: "$.manifest.csv.columns",
        message: "columns must match package CSV columns",
      });
    }
    if (!arrayEquals(csvLines[0]?.split(",") ?? [], csvColumns)) {
      issues.push({
        path: "$.csv",
        message: "CSV header must match package CSV columns",
      });
    }
  }

  if (manifestFingerprint) {
    const manifestWithoutFingerprint = { ...manifest };
    delete manifestWithoutFingerprint.fingerprint;
    const expected = fingerprintIngestEvidenceValue({
      kind: "ingest-evidence.manifest",
      manifest: manifestWithoutFingerprint,
    });
    if (manifestFingerprint !== expected) {
      issues.push({
        path: "$.manifest.fingerprint",
        message: "fingerprint must match manifest body",
      });
    }
  }
}

function validateContentDescriptor(descriptor, path, expected, issues) {
  requireExact(descriptor, "mediaType", expected.mediaType, path, issues);
  const fingerprint = requireString(descriptor, "fingerprint", path, issues);
  const bytes = requireInteger(descriptor, "bytes", path, issues);
  const count = requireInteger(descriptor, expected.countKey, path, issues);

  if (fingerprint && fingerprint !== fingerprintIngestEvidenceValue(expected.content)) {
    issues.push({
      path: `${path}.fingerprint`,
      message: "fingerprint must match package content",
    });
  }
  if (bytes !== undefined && bytes !== utf8Bytes(expected.content)) {
    issues.push({ path: `${path}.bytes`, message: "bytes must match package content" });
  }
  if (count !== undefined && count !== expected.count) {
    issues.push({ path: `${path}.${expected.countKey}`, message: `${expected.countKey} must match package content` });
  }
}

function parseJsonl(value, path, issues) {
  if (value.length === 0) {
    return [];
  }

  return value.split("\n").map((line, index) => {
    try {
      const record = JSON.parse(line);
      if (!isRecord(record)) {
        issues.push({ path: `${path}[${index}]`, message: "JSONL rows must be objects" });
      }
      return record;
    } catch {
      issues.push({ path: `${path}[${index}]`, message: "JSONL rows must parse as JSON" });
      return {};
    }
  });
}

function requireExact(record, key, expected, parentPath, issues, message) {
  if (record[key] !== expected) {
    issues.push({
      path: `${parentPath}.${key}`,
      message: message ?? `${key} must be ${expected}`,
    });
  }
}

function requireString(record, key, parentPath, issues) {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    issues.push({ path: `${parentPath}.${key}`, message: `${key} must be a non-empty string` });
    return undefined;
  }
  return value;
}

function requireInteger(record, key, parentPath, issues) {
  const value = record[key];
  if (!Number.isInteger(value)) {
    issues.push({ path: `${parentPath}.${key}`, message: `${key} must be an integer` });
    return undefined;
  }
  return value;
}

function requireArray(record, key, parentPath, issues) {
  const value = record[key];
  if (!Array.isArray(value)) {
    issues.push({ path: `${parentPath}.${key}`, message: `${key} must be an array` });
    return undefined;
  }
  return value;
}

function requireRecord(value, path, issues) {
  if (!isRecord(value)) {
    issues.push({ path, message: "value must be an object" });
    return undefined;
  }
  return value;
}

function assertIssuePaths(issues, expectedPaths) {
  const actualPaths = issuePaths(issues);
  for (const expectedPath of expectedPaths) {
    assert.ok(
      actualPaths.includes(expectedPath),
      `${expectedPath} missing from ${formatIssues(issues)}`,
    );
  }
}

function messageForPath(issues, path) {
  return issues.find((issue) => issue.path === path)?.message ?? "";
}

function issuePaths(issues) {
  return issues.map((issue) => issue.path);
}

function formatIssues(issues) {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
}

function arrayEquals(left, right) {
  return Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((item, index) => item === right[index]);
}

function utf8Bytes(value) {
  return new TextEncoder().encode(value).length;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
