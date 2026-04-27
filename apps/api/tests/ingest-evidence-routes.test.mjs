import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createApiRouter } from "../src/router.ts";
import {
  createIngestEvidenceRoutes,
  mountIngestEvidenceRoutes,
} from "../src/ingestEvidenceRoutes.ts";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDirectory, "../../..");
const evidencePath = resolve(workspaceRoot, "examples/ingest-search/audit-evidence.json");
const createdAt = "2026-04-27T09:00:00.000Z";
const exportId = "ingest_evidence_demo_001";
const secret = "sk_local_evidence_secret_123456";

test("mounts ingest evidence export preview routes", () => {
  const router = createApiRouter();
  mountIngestEvidenceRoutes(router);

  assert.deepEqual(
    router.listRoutes().map((route) => `${route.method} ${route.path}`),
    [
      "POST /v1/ingest/evidence/export",
      "POST /v1/ingest/evidence/package",
    ],
  );
});

test("exports filtered ingest evidence in a deterministic JSON wrapper", async () => {
  const router = createApiRouter(createIngestEvidenceRoutes());
  const response = await router.dispatch({
    method: "POST",
    path: "/v1/ingest/evidence/export",
    body: {
      evidence: readAuditEvidence(),
      format: "json",
      createdAt,
      exportId,
      filters: {
        sourceUris: ["fixture://ingest-search/records.csv"],
        citationKinds: ["quarantineItem"],
      },
    },
  });

  assertJsonResponse(response, 200);
  assert.equal(response.body.kind, "ingest-evidence.export");
  assert.equal(response.body.format, "json");
  assert.equal(response.body.mediaType, "application/json");
  assert.equal(response.body.exportId, exportId);
  assert.equal(response.body.createdAt, createdAt);
  assert.equal(response.body.fingerprint, response.body.manifest.content.fingerprint);
  assert.deepEqual(response.body.manifest.evidenceSummary, {
    sourceCount: 1,
    evidenceFileCount: 9,
    citationCount: 1,
    quarantineDecisionCount: 1,
    apiRequestTraceCount: 4,
    clientSessionTraceCount: 3,
  });

  const content = JSON.parse(response.body.content);
  assert.deepEqual(
    content.sourceSnapshots.map((source) => source.sourceUri),
    ["fixture://ingest-search/records.csv"],
  );
  assert.deepEqual(
    content.citationEvidence.map((citation) => citation.id),
    ["cite_qtn_csv_beta_status_1"],
  );
  assert.deepEqual(
    content.apiRequestTrace.map((request) => request.requestId),
    [
      "api_ingest_structured_csv",
      "api_ingest_repository_scan",
      "api_quarantine_cases",
      "api_quarantine_decision",
    ],
  );
});

test("redacts sensitive values from successful export previews", async () => {
  const router = createApiRouter(createIngestEvidenceRoutes());
  const evidence = readAuditEvidence();
  evidence.apiKey = secret;
  evidence.evidenceFiles[0].token = secret;
  evidence.clientSessionTrace[0].command = `token=${secret}`;

  const response = await router.dispatch({
    method: "POST",
    path: "/v1/ingest/evidence/export",
    body: {
      evidence,
      format: "json",
      createdAt,
      exportId,
    },
  });

  assertJsonResponse(response, 200);
  assert.equal(JSON.stringify(response.body).includes(secret), false);
  assert.match(response.body.content, /\[REDACTED\]/);
});

test("returns deterministic package manifests for fixture evidence", async () => {
  const router = createApiRouter(createIngestEvidenceRoutes());
  const body = {
    evidence: readAuditEvidence(),
    options: {
      createdAt,
      exportId,
      filters: {
        evidenceFileIds: ["recordsCsv", "recordsJson"],
        sections: ["evidenceFiles", "sourceSnapshots", "citationEvidence"],
      },
    },
  };

  const first = await router.dispatch({
    method: "POST",
    path: "/v1/ingest/evidence/package",
    body,
  });
  const second = await router.dispatch({
    method: "POST",
    path: "/v1/ingest/evidence/package",
    body: structuredClone(body),
  });

  assertJsonResponse(first, 200);
  assert.deepEqual(first.body, second.body);
  assert.equal(first.body.kind, "ingest-evidence.package");
  assert.deepEqual(first.body.manifest, {
    kind: "ingest-evidence.manifest",
    version: 1,
    exportId,
    createdAt,
    schemaVersion: "ingest-search-audit-evidence.v1",
    workspaceId: "wsp_ingest_demo",
    sessionId: "[REDACTED]",
    localOnly: true,
    filters: {
      sections: ["citationEvidence", "evidenceFiles", "sourceSnapshots"],
      evidenceFileIds: ["recordsCsv", "recordsJson"],
      sourceUris: [],
      citationKinds: [],
    },
    evidenceSummary: {
      sourceCount: 3,
      evidenceFileCount: 2,
      citationCount: 4,
      quarantineDecisionCount: 0,
      apiRequestTraceCount: 0,
      clientSessionTraceCount: 0,
    },
    sections: [
      {
        section: "evidenceFiles",
        itemCount: 2,
        mediaType: "application/json",
        bytes: 297,
        fingerprint: "sha256:e1d3870c5b334c7e3ae30869cab13b59ab8d2d1747cc061b94d73110a7cc369a",
      },
      {
        section: "sourceSnapshots",
        itemCount: 3,
        mediaType: "application/json",
        bytes: 980,
        fingerprint: "sha256:fbad50bb75fe38b87f2be58479b6bf4796d5d808069c52900401160b63e1352c",
      },
      {
        section: "citationEvidence",
        itemCount: 4,
        mediaType: "application/json",
        bytes: 1073,
        fingerprint: "sha256:84b8d2eaaaa360461d94bf6b6c6d7c9e391aaa6a5f0d7e096eb35e3fe54b88d5",
      },
    ],
    content: {
      mediaType: "application/json",
      bytes: 2740,
      fingerprint: "sha256:eea11989db59c9050ba0ed6ed9b65983932be5834e8d3956f01706bf9c53adb6",
    },
    fingerprint: "sha256:8ae3ad38bbeea6c23e937018ee15025fb8b99a9e3442e0bf6a5e1002876384d7",
  });
  assert.deepEqual(
    first.body.files.map(({ path, mediaType, bytes, fingerprint }) => ({
      path,
      mediaType,
      bytes,
      fingerprint,
    })),
    [
      {
        path: "manifest.json",
        mediaType: "application/json",
        bytes: 1335,
        fingerprint: "sha256:3d4e6346e8d889d3b6f69dd3a63b09ddd578248ffc6209025f194906df2ea61e",
      },
      {
        path: "evidence.json",
        mediaType: "application/json",
        bytes: 2740,
        fingerprint: "sha256:eea11989db59c9050ba0ed6ed9b65983932be5834e8d3956f01706bf9c53adb6",
      },
    ],
  );
  assert.equal(first.body.files[1].fingerprint, first.body.manifest.content.fingerprint);
  assert.equal(first.body.fingerprint, "sha256:4da8613b452b277ff2942545c7a5c692064c45c83cb57eb7a3167b7877f45f47");
});

test("returns standard JSON validation errors with redacted details", async () => {
  const router = createApiRouter(createIngestEvidenceRoutes());

  const badBody = await router.dispatch({
    method: "POST",
    path: "/v1/ingest/evidence/export",
    body: ["not-an-object"],
  });
  assertJsonError(badBody, 400, "validation_failed");
  assert.deepEqual(badBody.body.error.details, { path: "body" });

  const missingEvidence = await router.dispatch({
    method: "POST",
    path: "/v1/ingest/evidence/package",
    body: {
      format: "json",
    },
  });
  assertJsonError(missingEvidence, 400, "validation_failed");
  assert.deepEqual(missingEvidence.body.error.details, { path: "body.evidence" });

  const badFilter = await router.dispatch({
    method: "POST",
    path: "/v1/ingest/evidence/export",
    body: {
      evidence: readAuditEvidence(),
      filters: {
        sections: ["unknownSection"],
      },
    },
  });
  assertJsonError(badFilter, 400, "validation_failed");
  assert.deepEqual(badFilter.body.error.details, { path: "body.filters.sections.0" });

  const badTimestamp = await router.dispatch({
    method: "POST",
    path: "/v1/ingest/evidence/package",
    body: {
      evidence: readAuditEvidence(),
      createdAt: `token=${secret}`,
    },
  });
  assertJsonError(badTimestamp, 400, "validation_failed");
  assert.equal(JSON.stringify(badTimestamp.body).includes(secret), false);
  assert.equal(badTimestamp.body.error.details.value, "token=[REDACTED]");
});

function readAuditEvidence() {
  return JSON.parse(readFileSync(evidencePath, "utf8"));
}

function assertJsonResponse(response, status) {
  assert.equal(response.status, status);
  assert.match(response.headers["content-type"], /^application\/json/);
}

function assertJsonError(response, status, code) {
  assertJsonResponse(response, status);
  assert.deepEqual(Object.keys(response.body), ["error"]);
  assert.equal(response.body.error.code, code);
  assert.equal(typeof response.body.error.message, "string");
  assert.ok(response.body.error.message.length > 0);
}
