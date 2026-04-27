import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createApiRouter } from "../../../apps/api/src/router.ts";
import { createIngestEvidenceRoutes } from "../../../apps/api/src/ingestEvidenceRoutes.ts";
import {
  ApiHttpError,
  ApiNetworkError,
  ApiRequestValidationError,
  ApiResponseValidationError,
  toApiResult,
} from "../src/client.ts";
import { createIngestEvidenceClient } from "../src/ingestEvidenceClient.ts";

const fixtureUrl = new URL("../../../examples/ingest-search/audit-evidence.json", import.meta.url);
const createdAt = "2026-04-27T09:00:00.000Z";
const exportId = "ingest_evidence_demo_001";

test("exports ingest evidence through the typed client with stable headers and body", async () => {
  const fetch = apiRouterFetch();
  const client = createIngestEvidenceClient({
    baseUrl: "https://api.example.test/v1",
    apiKey: "test-key",
    fetch,
  });

  const result = await toApiResult(client.exportEvidence({
    evidence: fixtureObject(),
    format: "summary",
    createdAt,
    exportId,
    filters: {
      sourceUris: ["fixture://ingest-search/records.csv"],
      citationKinds: ["quarantineItem"],
    },
  }));

  assert.equal(result.ok, true);
  const exported = result.value;
  assert.equal(exported.kind, "ingest-evidence.export");
  assert.equal(exported.format, "summary");
  assert.equal(exported.mediaType, "application/json");
  assert.equal(exported.exportId, exportId);
  assert.equal(exported.createdAt, createdAt);
  assert.match(exported.fingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(JSON.parse(exported.content), {
    sourceCount: 1,
    evidenceFileCount: 9,
    citationCount: 1,
    quarantineDecisionCount: 1,
    apiRequestTraceCount: 4,
    clientSessionTraceCount: 3,
  });
  assert.equal(fetch.calls.length, 1);
  assert.equal(fetch.calls[0].url, "https://api.example.test/v1/ingest/evidence/export");
  assert.equal(fetch.calls[0].init.method, "POST");
  assert.equal(fetch.calls[0].init.headers.accept, "application/json");
  assert.equal(fetch.calls[0].init.headers.authorization, "Bearer test-key");
  assert.equal(fetch.calls[0].init.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body).filters, {
    sourceUris: ["fixture://ingest-search/records.csv"],
    citationKinds: ["quarantineItem"],
  });
});

test("packages ingest evidence and preserves frozen clone boundaries", async () => {
  const fetch = apiRouterFetch();
  const client = createIngestEvidenceClient({
    baseUrl: "https://api.example.test/v1/",
    fetch,
  });
  const evidence = fixtureObject();

  const packaged = await client.packageEvidence({
    evidence,
    createdAt,
    exportId,
    filters: {
      sections: ["evidenceFiles", "sourceSnapshots", "citationEvidence"],
      evidenceFileIds: ["recordsCsv", "recordsJson"],
    },
  });
  evidence.evidenceFiles[0].id = "mutated_after_request";

  assert.equal(packaged.kind, "ingest-evidence.package");
  assert.equal(packaged.manifest.kind, "ingest-evidence.manifest");
  assert.deepEqual(packaged.files.map((file) => file.path), [
    "manifest.json",
    "evidence.json",
  ]);
  assert.deepEqual(packaged.manifest.filters, {
    sections: ["citationEvidence", "evidenceFiles", "sourceSnapshots"],
    evidenceFileIds: ["recordsCsv", "recordsJson"],
    sourceUris: [],
    citationKinds: [],
  });
  assert.equal(packaged.manifest.evidenceSummary.evidenceFileCount, 2);
  assert.equal(packaged.files[1].fingerprint, packaged.manifest.content.fingerprint);
  assert.throws(
    () => {
      packaged.files[0].path = "evidence.json";
    },
    TypeError,
  );
});

test("validates ingest evidence requests before fetch is called", async () => {
  const fetch = fakeFetch([]);
  const client = createIngestEvidenceClient({
    baseUrl: "https://api.example.test/v1",
    fetch,
  });

  await assert.rejects(
    client.exportEvidence({
      evidence: fixtureObject(),
      format: "xml",
    }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(error.issues.map((issue) => issue.path), ["format"]);
      return true;
    },
  );

  await assert.rejects(
    client.packageEvidence({
      evidence: fixtureObject(),
      filters: {
        sections: ["unknownSection"],
      },
    }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(error.issues.map((issue) => issue.path), ["filters.sections.0"]);
      return true;
    },
  );

  await assert.rejects(
    client.exportEvidence({
      evidence: {
        ...fixtureObject(),
        invalid: undefined,
      },
    }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(error.issues.map((issue) => issue.path), ["evidence.invalid"]);
      return true;
    },
  );

  assert.equal(fetch.calls.length, 0);
});

test("rejects malformed ingest evidence response wrappers", async () => {
  const fetch = fakeFetch([
    jsonResponse(200, {
      kind: "ingest-evidence.export",
      version: 1,
      format: "json",
      mediaType: "application/json",
      fingerprint: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      exportId,
      createdAt,
      manifest: validManifest(),
    }),
    jsonResponse(200, {
      kind: "ingest-evidence.package",
      version: 1,
      manifest: {
        ...validManifest(),
        content: {
          mediaType: "application/json",
          bytes: "2740",
          fingerprint: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
        },
      },
      files: validPackageFiles(),
      fingerprint: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
    }),
  ]);
  const client = createIngestEvidenceClient({
    baseUrl: "https://api.example.test/v1",
    fetch,
  });

  await assert.rejects(
    client.exportEvidence({ evidence: fixtureObject() }),
    (error) => {
      assert.equal(error instanceof ApiResponseValidationError, true);
      assert.deepEqual(error.issues.map((issue) => issue.path), ["content"]);
      return true;
    },
  );

  await assert.rejects(
    client.packageEvidence({ evidence: fixtureObject() }),
    (error) => {
      assert.equal(error instanceof ApiResponseValidationError, true);
      assert.equal(
        error.issues.some((issue) => issue.path === "manifest.content.bytes"),
        true,
      );
      return true;
    },
  );
});

test("keeps HTTP and network failures typed", async () => {
  const httpFetch = fakeFetch([
    jsonResponse(400, {
      error: {
        code: "validation_failed",
        message: "Ingest evidence filters must be valid.",
        details: { path: "body.filters.sections.0" },
      },
    }),
  ]);
  const httpClient = createIngestEvidenceClient({
    baseUrl: "https://api.example.test/v1",
    fetch: httpFetch,
  });

  const httpResult = await toApiResult(httpClient.packageEvidence({
    evidence: fixtureObject(),
  }));

  assert.equal(httpResult.ok, false);
  assert.equal(httpResult.error instanceof ApiHttpError, true);
  assert.equal(httpResult.error.status, 400);
  assert.equal(httpResult.error.apiCode, "validation_failed");
  assert.deepEqual(httpResult.error.details, { path: "body.filters.sections.0" });

  const networkClient = createIngestEvidenceClient({
    baseUrl: "https://api.example.test/v1",
    fetch: fakeFetch([new Error("offline")]),
  });
  const networkResult = await toApiResult(networkClient.exportEvidence({
    evidence: fixtureObject(),
  }));

  assert.equal(networkResult.ok, false);
  assert.equal(networkResult.error instanceof ApiNetworkError, true);
  assert.equal(networkResult.error.code, "SO_API_NETWORK_ERROR");
});

function apiRouterFetch() {
  const router = createApiRouter(createIngestEvidenceRoutes());
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const response = await router.dispatch({
      method: init.method,
      path: new URL(url).pathname,
      body: init.body === undefined ? undefined : JSON.parse(init.body),
    });
    return textResponse(response.status, JSON.stringify(response.body), response.headers);
  };
  fetch.calls = calls;
  return fetch;
}

function fakeFetch(items) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const next = items.shift();
    if (next instanceof Error) {
      throw next;
    }
    if (next === undefined) {
      throw new Error("fake fetch response queue is empty");
    }
    return next;
  };
  fetch.calls = calls;
  return fetch;
}

function fixtureObject() {
  return JSON.parse(readFileSync(fixtureUrl, "utf8"));
}

function validManifest() {
  return {
    kind: "ingest-evidence.manifest",
    version: 1,
    exportId,
    createdAt,
    schemaVersion: "ingest-search-audit-evidence.v1",
    workspaceId: "wsp_ingest_demo",
    sessionId: "sess_ingest_search_local_001",
    localOnly: true,
    filters: {
      sections: [],
      evidenceFileIds: [],
      sourceUris: [],
      citationKinds: [],
    },
    evidenceSummary: {
      sourceCount: 3,
      evidenceFileCount: 9,
      citationCount: 4,
      quarantineDecisionCount: 1,
      apiRequestTraceCount: 6,
      clientSessionTraceCount: 4,
    },
    sections: [
      {
        section: "evidenceFiles",
        itemCount: 9,
        mediaType: "application/json",
        bytes: 100,
        fingerprint: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
      },
    ],
    content: {
      mediaType: "application/json",
      bytes: 2740,
      fingerprint: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    },
    fingerprint: "sha256:5555555555555555555555555555555555555555555555555555555555555555",
  };
}

function validPackageFiles() {
  return [
    {
      path: "manifest.json",
      content: "{}",
      mediaType: "application/json",
      bytes: 2,
      fingerprint: "sha256:6666666666666666666666666666666666666666666666666666666666666666",
    },
    {
      path: "evidence.json",
      content: "{}",
      mediaType: "application/json",
      bytes: 2,
      fingerprint: "sha256:7777777777777777777777777777777777777777777777777777777777777777",
    },
  ];
}

function jsonResponse(status, body, headers = {}) {
  return textResponse(status, JSON.stringify(body), {
    "content-type": "application/json",
    ...headers,
  });
}

function textResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: statusTextFor(status),
    headers: headersLike(headers),
    async text() {
      return body;
    },
  };
}

function headersLike(headers) {
  const normalized = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    get(name) {
      return normalized.get(name.toLowerCase()) ?? null;
    },
  };
}

function statusTextFor(status) {
  if (status === 200) {
    return "OK";
  }
  if (status === 400) {
    return "Bad Request";
  }
  return "";
}
