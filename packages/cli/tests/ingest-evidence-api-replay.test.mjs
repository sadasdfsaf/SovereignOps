import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  isIngestEvidenceApiReplayCommand,
  runIngestEvidenceApiReplayCli,
} from "../src/ingestEvidenceApiReplay.ts";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const evidencePath = fileURLToPath(
  new URL("../../../examples/ingest-search/audit-evidence.json", import.meta.url),
);
const tempDir = fileURLToPath(
  new URL("../.tmp-ingest-evidence-api-replay/", import.meta.url),
);

const createdAt = "2026-04-27T09:00:00.000Z";
const exportId = "ingest_evidence_demo_001";

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

test("replays ingest evidence API fixtures through the local router", async () => {
  const fixturePath = await writeFixture("evidence-api-requests.json", await buildFixture());
  const result = await runIngestEvidenceApiReplayCli([
    "ingest",
    "evidence",
    "api",
    "replay",
    "--fixture",
    fixturePath,
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.kind, "ingest-evidence-api-fixture-replay");
  assert.equal(payload.schemaVersion, "ingest-evidence-api-requests.v1");
  assert.equal(payload.fixture.path, "packages/cli/.tmp-ingest-evidence-api-replay/evidence-api-requests.json");
  assert.equal(payload.totalRequests, 3);
  assert.equal(payload.replayedRequests, 3);
  assert.equal(payload.passedRequests, 3);
  assert.equal(payload.failedRequests, 0);
  assert.deepEqual(payload.summary.methods, { POST: 3 });
  assert.deepEqual(payload.summary.routes, {
    "/v1/ingest/evidence/export": 2,
    "/v1/ingest/evidence/package": 1,
  });
  assert.deepEqual(payload.summary.actualStatuses, { 200: 3 });
  assert.deepEqual(payload.summary.expectedStatuses, { 200: 3 });
  assert.deepEqual(payload.summary.mismatches, {});
  assert.deepEqual(
    payload.requests.map((request) => [
      request.id,
      request.path,
      request.actual.status,
      request.matches.status,
      request.matches.expectation,
    ]),
    [
      ["api_ingest_evidence_export_json", "/v1/ingest/evidence/export", 200, true, true],
      ["api_ingest_evidence_export_manifest", "/v1/ingest/evidence/export", 200, true, true],
      ["api_ingest_evidence_package", "/v1/ingest/evidence/package", 200, true, true],
    ],
  );
  assert.equal(payload.requests[0].actual.body.kind, "ingest-evidence.export");
  assert.equal(payload.requests[0].actual.body.format, "json");
  assert.equal(payload.requests[0].actual.body.manifest.evidenceSummary.sourceCount, 1);
  assert.equal(payload.requests[2].actual.body.kind, "ingest-evidence.package");
  assert.equal(payload.requests[2].actual.body.manifest.evidenceSummary.evidenceFileCount, 2);
});

test("filters ingest evidence API fixture replay by method, route, and id", async () => {
  const fixturePath = await writeFixture("filterable-evidence-api-requests.json", await buildFixture());
  const result = await runIngestEvidenceApiReplayCli([
    "ingest-evidence",
    "api",
    "replay",
    "--fixture",
    fixturePath,
    "--method",
    "post",
    "--route",
    "/v1/ingest/evidence/package",
    "--id",
    "api_ingest_evidence_package",
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(payload.filters, {
    id: "api_ingest_evidence_package",
    method: "POST",
    route: "/v1/ingest/evidence/package",
  });
  assert.equal(payload.totalRequests, 3);
  assert.equal(payload.replayedRequests, 1);
  assert.equal(payload.passedRequests, 1);
  assert.deepEqual(payload.summary.routes, { "/v1/ingest/evidence/package": 1 });
  assert.deepEqual(payload.requests.map((request) => request.id), [
    "api_ingest_evidence_package",
  ]);
});

test("detects ingest evidence API replay commands", () => {
  assert.equal(isIngestEvidenceApiReplayCommand(["ingest", "evidence", "api", "replay"]), true);
  assert.equal(isIngestEvidenceApiReplayCommand(["ingest-evidence", "api", "replay"]), true);
  assert.equal(isIngestEvidenceApiReplayCommand(["ingest", "evidence", "summary"]), false);
});

test("rejects unsafe ingest evidence API fixture paths as JSON-only errors", async () => {
  const unsafePath = path.resolve(workspaceRoot, "..", "outside.json");
  const result = await runIngestEvidenceApiReplayCli([
    "ingest",
    "evidence",
    "api",
    "replay",
    "--fixture",
    unsafePath,
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stderr);

  assert.equal(result.exitCode, 2);
  assert.equal(result.stdout, "");
  assert.equal(payload.error.code, "usage_error");
  assert.match(payload.error.message, /must stay inside/);
});

test("reports malformed ingest evidence API fixture shape as JSON-only errors", async () => {
  const invalidPath = await writeFixture("invalid-evidence-api-requests.json", {
    schemaVersion: "ingest-evidence-api-requests.v1",
    generatedAt: "2026-04-27T08:30:00.000Z",
    requests: [{ id: "api_missing_route" }],
  });
  const result = await runIngestEvidenceApiReplayCli([
    "ingest",
    "evidence",
    "api",
    "replay",
    "--fixture",
    invalidPath,
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stderr);

  assert.equal(result.exitCode, 2);
  assert.equal(result.stdout, "");
  assert.equal(payload.error.code, "invalid_fixture");
  assert.match(payload.error.message, /fixture\.requests\[0\]\.route/);
});

async function buildFixture() {
  await readFile(evidencePath, "utf8");

  return {
    schemaVersion: "ingest-evidence-api-requests.v1",
    generatedAt: "2026-04-27T08:30:00.000Z",
    apiBase: "http://127.0.0.1:7317",
    inputEvidence: {
      id: "auditEvidence",
      fixturePath: "examples/ingest-search/audit-evidence.json",
    },
    requests: [
      {
        id: "api_ingest_evidence_export_json",
        title: "Preview filtered evidence JSON export",
        route: {
          method: "POST",
          path: "/v1/ingest/evidence/export",
        },
        request: {
          body: {
            evidence: {
              $fixtureRef: "auditEvidence",
            },
            format: "json",
            createdAt,
            exportId,
            filters: {
              sourceUris: ["fixture://ingest-search/records.csv"],
              citationKinds: ["quarantineItem"],
            },
          },
        },
        expect: {
          status: 200,
          contentType: "application/json",
          kind: "ingest-evidence.export",
          format: "json",
          summary: {
            sourceCount: 1,
            evidenceFileCount: 9,
            citationCount: 1,
            quarantineDecisionCount: 1,
            apiRequestTraceCount: 4,
            clientSessionTraceCount: 3,
          },
        },
      },
      {
        id: "api_ingest_evidence_export_manifest",
        title: "Preview evidence manifest export",
        route: {
          method: "POST",
          path: "/v1/ingest/evidence/export",
        },
        request: {
          body: {
            evidence: {
              $fixtureRef: "auditEvidence",
            },
            format: "manifest",
            createdAt,
            exportId,
          },
        },
        expect: {
          status: 200,
          contentType: "application/json",
          kind: "ingest-evidence.export",
          format: "manifest",
          summary: {
            sourceCount: 3,
            evidenceFileCount: 9,
            citationCount: 4,
            quarantineDecisionCount: 1,
            apiRequestTraceCount: 6,
            clientSessionTraceCount: 4,
          },
        },
      },
      {
        id: "api_ingest_evidence_package",
        title: "Preview evidence package",
        route: {
          method: "POST",
          path: "/v1/ingest/evidence/package",
        },
        request: {
          body: {
            evidence: {
              $fixtureRef: "auditEvidence",
            },
            options: {
              createdAt,
              exportId,
              filters: {
                evidenceFileIds: ["recordsCsv", "recordsJson"],
                sections: ["evidenceFiles", "sourceSnapshots", "citationEvidence"],
              },
            },
          },
        },
        expect: {
          status: 200,
          contentType: "application/json",
          kind: "ingest-evidence.package",
          summary: {
            sourceCount: 3,
            evidenceFileCount: 2,
            citationCount: 4,
            quarantineDecisionCount: 0,
            apiRequestTraceCount: 0,
            clientSessionTraceCount: 0,
          },
        },
      },
    ],
  };
}

async function writeFixture(name, fixture) {
  await mkdir(tempDir, { recursive: true });
  const outputPath = path.join(tempDir, name);
  await writeFile(outputPath, `${JSON.stringify(fixture, null, 2)}\n`);
  return outputPath;
}
