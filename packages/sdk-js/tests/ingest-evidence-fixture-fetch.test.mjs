import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

import {
  ApiHttpError,
  toApiResult,
} from "../src/client.ts";
import {
  IngestEvidenceClient,
} from "../src/ingestEvidenceClient.ts";
import {
  DEFAULT_INGEST_EVIDENCE_FIXTURE_PATH,
  baseUrlFromIngestEvidenceFixtureBundle,
  createIngestEvidenceFixtureClient,
  createIngestEvidenceFixtureClientHarness,
  createIngestEvidenceFixtureFetch,
  loadIngestEvidenceFixtureBundle,
} from "../src/ingestEvidenceFixtureFetch.ts";

const realFixtureUrl = new URL("../../../examples/ingest-search/evidence-api-requests.json", import.meta.url);
const createdAt = "2026-04-27T08:10:00.000Z";
const exportId = "ingest_evidence_fixture_001";
const fingerprintA = `sha256:${"a".repeat(64)}`;
const fingerprintB = `sha256:${"b".repeat(64)}`;
const fingerprintC = `sha256:${"c".repeat(64)}`;

const inlineEvidence = Object.freeze({
  schemaVersion: "ingest-evidence-fixture.v1",
  workspaceId: "wsp_fixture",
  sessionId: "ses_fixture",
  localOnly: true,
  evidenceFiles: [
    {
      id: "evf_local_note",
      sourceUri: "fixture://ingest-evidence/note.md",
      mediaType: "text/markdown",
      checksum: fingerprintA,
    },
  ],
  sourceSnapshots: [
    {
      sourceUri: "fixture://ingest-evidence/note.md",
      mediaType: "text/markdown",
      checksum: fingerprintA,
    },
  ],
  citationEvidence: [
    {
      documentId: "doc_local_note",
      sourceUri: "fixture://ingest-evidence/note.md",
      kind: "exact",
      range: { lineStart: 1, lineEnd: 1 },
    },
  ],
  quarantineDecisions: [],
  apiRequestTrace: [],
  clientSessionTrace: [],
});

test("loads the real evidence fixture when present and keeps the default path ready", () => {
  assert.equal(
    DEFAULT_INGEST_EVIDENCE_FIXTURE_PATH.href,
    realFixtureUrl.href,
  );

  if (!existsSync(realFixtureUrl)) {
    assert.equal(fixtureBundle().schemaVersion, "ingest-evidence-api-requests.inline.v1");
    return;
  }

  const bundle = loadIngestEvidenceFixtureBundle();

  assert.equal(bundle.requests.length > 0, true);
  assert.match(bundle.schemaVersion, /evidence/);
  assert.equal(baseUrlFromIngestEvidenceFixtureBundle(bundle).endsWith("/v1/"), true);
  assert.equal(
    bundle.requests.every((entry) => /\/v[0-9]+\/ingest\/evidence\/(?:export|package)$/.test(entry.route.path)),
    true,
  );
});

test("serves matching evidence fixture responses deterministically", async () => {
  const bundle = fixtureBundle();
  const fetch = createIngestEvidenceFixtureFetch(bundle);

  for (const entry of bundle.requests) {
    const response = await fetch(urlFor(bundle, entry), {
      method: entry.route.method.toLowerCase(),
      body: JSON.stringify(shuffleTopLevelKeys(entry.request.body)),
    });

    const status = expectedStatus(entry);
    assert.equal(response.ok, status >= 200 && status < 300);
    assert.equal(response.status, expectedStatus(entry));
    assert.equal(response.statusText, expectedStatusText(status));
    assert.equal(response.headers?.get("content-type"), "application/json");
    const responseJson = await response.json();
    assertFixtureResponse(entry, responseJson);
    assertFixtureResponse(entry, await response.clone().json());
    assert.equal(await response.text(), JSON.stringify(responseJson));
  }

  assert.deepEqual(
    fetch.calls.map((call) => [call.method, call.path, call.matchedRequestId, call.status]),
    bundle.requests.map((entry) => [
      entry.route.method,
      entry.route.path,
      entry.id,
      expectedStatus(entry),
    ]),
  );
});

test("returns typed fixture errors for unmatched evidence paths and methods", async () => {
  const bundle = inlineFixtureBundle();
  const fetch = createIngestEvidenceFixtureFetch(bundle);

  const missingPath = await fetch("http://127.0.0.1:7317/v1/ingest/evidence/missing", {
    method: "POST",
    body: JSON.stringify({ evidence: inlineEvidence }),
  });
  const missingPathBody = await missingPath.json();

  assert.equal(missingPath.ok, false);
  assert.equal(missingPath.status, 404);
  assert.equal(missingPathBody.error.code, "ingest_evidence_fixture_request_not_found");
  assert.equal(missingPathBody.error.details.path, "/v1/ingest/evidence/missing");

  const methodMismatch = await fetch("http://127.0.0.1:7317/v1/ingest/evidence/export", {
    method: "GET",
  });
  const methodMismatchBody = await methodMismatch.json();

  assert.equal(methodMismatch.status, 405);
  assert.equal(methodMismatchBody.error.code, "ingest_evidence_fixture_method_mismatch");
  assert.deepEqual(methodMismatchBody.error.details.allowedMethods, ["POST"]);
});

test("reports evidence request body drift on matched routes", async () => {
  const bundle = inlineFixtureBundle();
  const fetch = createIngestEvidenceFixtureFetch(bundle);
  const entry = fixtureRequest(bundle, "evidence_export_json");
  const body = structuredClone(entry.request.body);
  body.exportId = "different_export";

  const response = await fetch(urlFor(bundle, entry), {
    method: entry.route.method,
    body: JSON.stringify(body),
  });
  const responseBody = await response.json();

  assert.equal(response.status, 422);
  assert.equal(responseBody.error.code, "ingest_evidence_fixture_body_mismatch");
  assert.deepEqual(responseBody.error.details.candidateRequestIds, ["evidence_export_json"]);
  assert.match(responseBody.error.details.mismatches[0].mismatch, /exportId/);
  assert.equal(fetch.calls[0].matchedRequestId, undefined);
  assert.equal(fetch.calls[0].status, 422);
});

test("rejects non-evidence route bundles before fetch creation", () => {
  const bundle = inlineFixtureBundle();
  const drifted = structuredClone(bundle);
  drifted.requests[0].route.path = "/v1/search/query";

  assert.throws(
    () => createIngestEvidenceFixtureFetch(drifted),
    /route\.path must be an ingest evidence export or package route/,
  );
});

test("drives IngestEvidenceClient through fixture fetch without network access", async () => {
  const bundle = inlineFixtureBundle();
  const harness = createIngestEvidenceFixtureClientHarness(bundle);
  const client = createIngestEvidenceFixtureClient(bundle);

  assert.equal(harness.client instanceof IngestEvidenceClient, true);
  assert.equal(client instanceof IngestEvidenceClient, true);
  assert.equal(harness.baseUrl, "http://127.0.0.1:7317/v1/");

  const exported = await harness.client.exportEvidence(requestBody(bundle, "evidence_export_json"));
  const packaged = await client.packageEvidence(requestBody(bundle, "evidence_package_json"));

  assert.deepEqual(exported, responseBody(bundle, "evidence_export_json"));
  assert.deepEqual(packaged, responseBody(bundle, "evidence_package_json"));
  assert.deepEqual(harness.fetch.calls.map((call) => call.matchedRequestId), ["evidence_export_json"]);
});

test("drives the real evidence fixture through the SDK client when present", async () => {
  if (!existsSync(realFixtureUrl)) {
    return;
  }

  const bundle = loadIngestEvidenceFixtureBundle(realFixtureUrl);
  const harness = createIngestEvidenceFixtureClientHarness(bundle);
  const exportEntry = bundle.requests.find((entry) =>
    entry.route.path.endsWith("/export") &&
    entry.expect?.status === 200 &&
    entry.request.body.format === "json"
  );
  const packageEntry = bundle.requests.find((entry) =>
    entry.route.path.endsWith("/package") &&
    entry.expect?.status === 200
  );

  assert.notEqual(exportEntry, undefined);
  assert.notEqual(packageEntry, undefined);

  const exported = await harness.client.exportEvidence(sdkClientBody(exportEntry));
  const packaged = await harness.client.packageEvidence(sdkClientBody(packageEntry));

  assert.equal(exported.kind, "ingest-evidence.export");
  assert.equal(exported.format, "json");
  assert.equal(packaged.kind, "ingest-evidence.package");
  assert.deepEqual(harness.fetch.calls.map((call) => call.matchedRequestId), [
    exportEntry.id,
    packageEntry.id,
  ]);
});

test("surfaces evidence fixture drift as a client HTTP error", async () => {
  const bundle = inlineFixtureBundle();
  const driftedBundle = structuredClone(bundle);
  fixtureRequest(driftedBundle, "evidence_export_json").request.body.exportId = "different_export";
  const client = createIngestEvidenceFixtureClient(driftedBundle);

  const result = await toApiResult(client.exportEvidence(requestBody(bundle, "evidence_export_json")));

  assert.equal(result.ok, false);
  assert.equal(result.error instanceof ApiHttpError, true);
  assert.equal(result.error.status, 422);
  assert.equal(result.error.apiCode, "ingest_evidence_fixture_body_mismatch");
});

function fixtureBundle() {
  if (existsSync(realFixtureUrl)) {
    return loadIngestEvidenceFixtureBundle(realFixtureUrl);
  }

  return inlineFixtureBundle();
}

function inlineFixtureBundle() {
  const evidence = structuredClone(inlineEvidence);
  const exportRequest = {
    evidence,
    format: "json",
    createdAt,
    exportId,
  };
  const packageRequest = {
    evidence,
    filters: {
      sections: ["evidenceFiles"],
      evidenceFileIds: ["evf_local_note"],
      sourceUris: ["fixture://ingest-evidence/note.md"],
      citationKinds: ["exact"],
    },
    createdAt,
    exportId,
  };

  return {
    schemaVersion: "ingest-evidence-api-requests.inline.v1",
    generatedAt: createdAt,
    apiBase: "http://127.0.0.1:7317",
    requests: [
      {
        id: "evidence_export_json",
        title: "Export local evidence JSON",
        route: {
          method: "POST",
          path: "/v1/ingest/evidence/export",
        },
        request: {
          body: exportRequest,
        },
        response: {
          status: 200,
          body: exportResponse(evidence),
        },
      },
      {
        id: "evidence_package_json",
        title: "Package local evidence JSON",
        route: {
          method: "POST",
          path: "/v1/ingest/evidence/package",
        },
        request: {
          body: packageRequest,
        },
        response: {
          status: 200,
          body: packageResponse(evidence),
        },
      },
    ],
  };
}

function exportResponse(evidence) {
  return {
    kind: "ingest-evidence.export",
    version: 1,
    format: "json",
    mediaType: "application/json",
    content: JSON.stringify(evidence),
    fingerprint: fingerprintB,
    exportId,
    createdAt,
    manifest: manifest(evidence),
  };
}

function packageResponse(evidence) {
  const manifestBody = manifest(evidence);

  return {
    kind: "ingest-evidence.package",
    version: 1,
    manifest: manifestBody,
    files: [
      {
        path: "manifest.json",
        mediaType: "application/json",
        bytes: 64,
        fingerprint: fingerprintB,
        content: JSON.stringify(manifestBody),
      },
      {
        path: "evidence.json",
        mediaType: "application/json",
        bytes: 128,
        fingerprint: fingerprintC,
        content: JSON.stringify(evidence),
      },
    ],
    fingerprint: fingerprintC,
  };
}

function manifest(evidence) {
  return {
    kind: "ingest-evidence.manifest",
    version: 1,
    exportId,
    createdAt,
    schemaVersion: evidence.schemaVersion,
    workspaceId: evidence.workspaceId,
    sessionId: evidence.sessionId,
    localOnly: true,
    filters: {
      sections: [],
      evidenceFileIds: [],
      sourceUris: [],
      citationKinds: [],
    },
    evidenceSummary: {
      sourceCount: 1,
      evidenceFileCount: 1,
      citationCount: 1,
      quarantineDecisionCount: 0,
      apiRequestTraceCount: 0,
      clientSessionTraceCount: 0,
    },
    sections: [
      {
        section: "evidenceFiles",
        itemCount: 1,
        mediaType: "application/json",
        bytes: 32,
        fingerprint: fingerprintA,
      },
    ],
    content: {
      mediaType: "application/json",
      bytes: 128,
      fingerprint: fingerprintC,
    },
    fingerprint: fingerprintB,
  };
}

function fixtureRequest(bundle, id) {
  const entry = bundle.requests.find((request) => request.id === id);
  assert.notEqual(entry, undefined);
  return entry;
}

function requestBody(bundle, id) {
  return structuredClone(fixtureRequest(bundle, id).request.body);
}

function responseBody(bundle, id) {
  return structuredClone(fixtureRequest(bundle, id).response.body);
}

function sdkClientBody(entry) {
  const body = structuredClone(entry.request.body);
  if (entry.route.path.endsWith("/package") && body.options !== undefined) {
    return {
      evidence: body.evidence,
      ...body.options,
    };
  }

  return body;
}

function expectedStatus(entry) {
  return entry.response?.status ?? entry.expect.status;
}

function expectedStatusText(status) {
  if (status === 200) {
    return "OK";
  }
  if (status === 400) {
    return "Bad Request";
  }
  if (status === 404) {
    return "Not Found";
  }
  if (status === 405) {
    return "Method Not Allowed";
  }
  if (status === 422) {
    return "Unprocessable Entity";
  }
  return "";
}

function assertFixtureResponse(entry, responseBody) {
  if (entry.response !== undefined) {
    assert.deepEqual(responseBody, entry.response.body);
    return;
  }

  assert.notEqual(entry.expect, undefined);
  if (entry.expect.error !== undefined) {
    assert.deepEqual(responseBody.error, entry.expect.error);
    return;
  }

  assert.equal(responseBody.kind, entry.expect.kind);
  assert.equal(responseBody.fingerprint, entry.expect.fingerprint);
  if (entry.expect.format !== undefined) {
    assert.equal(responseBody.format, entry.expect.format);
  }
}

function urlFor(bundle, entry) {
  return new URL(entry.route.path, bundle.apiBase ?? "http://127.0.0.1:7317").href;
}

function shuffleTopLevelKeys(value) {
  if (value === undefined || value === null || Array.isArray(value) || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(Object.entries(value).reverse());
}
