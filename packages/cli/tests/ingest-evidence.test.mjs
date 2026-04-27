import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  isIngestEvidenceCommand,
  runIngestEvidenceCli,
} from "../src/ingestEvidence.ts";

const evidencePath = fileURLToPath(
  new URL("../../../examples/ingest-search/audit-evidence.json", import.meta.url),
);
const tempDir = fileURLToPath(new URL("../.tmp-ingest-evidence/", import.meta.url));

test("summarizes ingest evidence deterministically", async () => {
  const first = await runIngestEvidenceCli([
    "ingest",
    "evidence",
    "summary",
    "--input",
    evidencePath,
  ]);
  const second = await runIngestEvidenceCli([
    "ingest-evidence",
    "summary",
    "--input-path",
    evidencePath,
  ]);
  assert.ok(first);
  assert.ok(second);
  const payload = JSON.parse(first.stdout);

  assert.equal(first.exitCode, 0);
  assert.equal(first.stderr, "");
  assert.equal(first.stdout, second.stdout);
  assert.equal(payload.kind, "ingest-evidence.summary");
  assert.equal(payload.input.path, "examples/ingest-search/audit-evidence.json");
  assert.equal(payload.schemaVersion, "ingest-search-audit-evidence.v1");
  assert.equal(payload.workspaceId, "wsp_ingest_demo");
  assert.equal(payload.localOnly, true);
  assert.equal(payload.summary.sourceCount, 3);
  assert.equal(payload.summary.evidenceFileCount, 9);
  assert.equal(payload.summary.citationCount, 4);
  assert.deepEqual(payload.summary.mediaTypes, {
    "application/json": 1,
    "text/csv": 1,
    "text/markdown": 1,
  });
  assert.deepEqual(payload.summary.repositoryStates, {
    indexed: 2,
    partly_quarantined: 1,
  });
  assert.deepEqual(
    payload.sources.map((source) => source.sourceUri),
    [
      "fixture://ingest-search/notes.md",
      "fixture://ingest-search/records.csv",
      "fixture://ingest-search/records.json",
    ],
  );
});

test("exports ingest evidence records as JSON-wrapped JSONL and CSV", async () => {
  const jsonlResult = await runIngestEvidenceCli([
    "ingest",
    "evidence",
    "export",
    "--input",
    evidencePath,
    "--format",
    "jsonl",
  ]);
  const csvResult = await runIngestEvidenceCli([
    "ingest",
    "evidence",
    "export",
    "--input",
    evidencePath,
    "--format",
    "csv",
  ]);
  assert.ok(jsonlResult);
  assert.ok(csvResult);
  const jsonlPayload = JSON.parse(jsonlResult.stdout);
  const csvPayload = JSON.parse(csvResult.stdout);
  const jsonlRows = jsonlPayload.content.split("\n").map((line) => JSON.parse(line));
  const csvLines = csvPayload.content.split("\n");

  assert.equal(jsonlResult.exitCode, 0);
  assert.equal(jsonlResult.stderr, "");
  assert.equal(jsonlPayload.kind, "ingest-evidence.export");
  assert.equal(jsonlPayload.format, "jsonl");
  assert.equal(jsonlPayload.recordCount, 27);
  assert.deepEqual(
    jsonlRows.slice(0, 3).map((row) => [row.category, row.id]),
    [
      ["apiRequestTrace", "api_ingest_normalize"],
      ["apiRequestTrace", "api_ingest_repository_scan"],
      ["apiRequestTrace", "api_ingest_structured_csv"],
    ],
  );

  assert.equal(csvResult.exitCode, 0);
  assert.equal(csvResult.stderr, "");
  assert.equal(csvPayload.kind, "ingest-evidence.export");
  assert.equal(csvPayload.format, "csv");
  assert.equal(csvLines[0], "category,id,sourceUri,fixturePath,checksum,mediaType,schemaVersion,relatedIds,details");
  assert.match(csvLines[1], /^apiRequestTrace,api_ingest_normalize,/);
  assert.match(csvPayload.contentSha256, /^sha256:[0-9a-f]{64}$/);
});

test("packages ingest evidence with deterministic manifest output", async () => {
  const argv = ["ingest", "evidence", "package", "--input", evidencePath];
  const first = await runIngestEvidenceCli(argv);
  const second = await runIngestEvidenceCli(argv);
  assert.ok(first);
  assert.ok(second);
  const payload = JSON.parse(first.stdout);

  assert.equal(first.exitCode, 0);
  assert.equal(first.stderr, "");
  assert.equal(first.stdout, second.stdout);
  assert.equal(payload.kind, "ingest-evidence.package");
  assert.equal(payload.manifest.kind, "ingest-evidence.manifest");
  assert.equal(payload.manifest.input.path, "examples/ingest-search/audit-evidence.json");
  assert.equal(payload.manifest.recordCount, 27);
  assert.equal(payload.manifest.jsonl.lines, 27);
  assert.equal(payload.manifest.csv.rows, 27);
  assert.match(payload.manifest.fingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.match(payload.fingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.equal(payload.summary.summary.sourceCount, 3);
});

test("reports invalid ingest evidence path and format as JSON-only errors", async () => {
  const outsidePath = path.resolve(path.dirname(evidencePath), "..", "..", "..", "outside.json");
  const invalidPath = await runIngestEvidenceCli([
    "ingest",
    "evidence",
    "summary",
    "--input",
    outsidePath,
  ]);
  const invalidFormat = await runIngestEvidenceCli([
    "ingest",
    "evidence",
    "export",
    "--input",
    evidencePath,
    "--format",
    "xml",
  ]);
  assert.ok(invalidPath);
  assert.ok(invalidFormat);
  const pathError = JSON.parse(invalidPath.stderr);
  const formatError = JSON.parse(invalidFormat.stderr);

  assert.equal(invalidPath.exitCode, 2);
  assert.equal(invalidPath.stdout, "");
  assert.equal(pathError.error.code, "usage_error");
  assert.match(pathError.error.message, /must stay inside/);

  assert.equal(invalidFormat.exitCode, 2);
  assert.equal(invalidFormat.stdout, "");
  assert.equal(formatError.error.code, "usage_error");
  assert.match(formatError.error.message, /--format/);
});

test("reports malformed ingest evidence as JSON-only errors", async () => {
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  evidence.evidenceSummary.sourceCount = 99;
  const invalidPath = await writeEvidence("bad-count.json", evidence);

  try {
    const result = await runIngestEvidenceCli([
      "ingest",
      "evidence",
      "summary",
      "--input",
      invalidPath,
    ]);
    assert.ok(result);
    const payload = JSON.parse(result.stderr);

    assert.equal(result.exitCode, 2);
    assert.equal(result.stdout, "");
    assert.equal(payload.error.code, "invalid_evidence");
    assert.match(payload.error.message, /sourceCount/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("detects ingest evidence commands", () => {
  assert.equal(isIngestEvidenceCommand(["ingest", "evidence", "summary"]), true);
  assert.equal(isIngestEvidenceCommand(["ingest-evidence", "export"]), true);
  assert.equal(isIngestEvidenceCommand(["ingest", "api", "replay"]), false);
  assert.equal(isIngestEvidenceCommand(["ingest", "search", "source", "summary"]), false);
});

async function writeEvidence(name, evidence) {
  await mkdir(tempDir, { recursive: true });
  const outputPath = path.join(tempDir, name);
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  return outputPath;
}
