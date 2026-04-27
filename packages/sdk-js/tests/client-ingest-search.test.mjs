import assert from "node:assert/strict";
import test from "node:test";

import {
  ApiHttpError,
  ApiRequestValidationError,
  ApiResponseValidationError,
  toApiResult,
} from "../src/client.ts";
import { createIngestSearchClient } from "../src/ingestClient.ts";

const checksumA = "a".repeat(64);
const checksumB = "b".repeat(64);
const checksumC = "c".repeat(64);

const citation = Object.freeze({
  sourceUri: "fixture://ingest-search/records.csv",
  range: {
    row: 3,
    column: "status",
  },
  trusted: false,
});

test("normalizes text with stable request body and headers", async () => {
  const response = {
    ok: true,
    sourceUri: "fixture://ingest-search/notes.md",
    mediaType: "text/markdown",
    checksum: checksumA,
    normalizedText: "# Notebook Import\n\nLocal-first notes.",
    untrusted: true,
  };
  const fetch = fakeFetch([
    jsonResponse(200, response),
  ]);
  const client = createIngestSearchClient({
    baseUrl: "https://api.example.test/v1",
    apiKey: "test-key",
    fetch,
  });

  const normalized = await client.normalize({
    workspaceId: "wsp_ingest_demo",
    sourceUri: "fixture://ingest-search/notes.md",
    mediaType: "text/markdown",
    content: "# Notebook Import\n\nLocal-first notes.\n",
    options: {
      trusted: false,
    },
  });

  assert.deepEqual(normalized, response);
  assert.equal(fetch.calls.length, 1);
  assert.equal(fetch.calls[0].url, "https://api.example.test/v1/ingest/normalize");
  assert.equal(fetch.calls[0].init.method, "POST");
  assert.equal(fetch.calls[0].init.headers.accept, "application/json");
  assert.equal(fetch.calls[0].init.headers.authorization, "Bearer test-key");
  assert.equal(fetch.calls[0].init.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), {
    workspaceId: "wsp_ingest_demo",
    sourceUri: "fixture://ingest-search/notes.md",
    mediaType: "text/markdown",
    content: "# Notebook Import\n\nLocal-first notes.\n",
    options: {
      trusted: false,
    },
  });
});

test("builds structured ingest, repository scan, and search query calls", async () => {
  const structuredResponse = {
    ok: true,
    sourceUri: "fixture://ingest-search/records.csv",
    mediaType: "text/csv",
    summary: {
      documentCount: 3,
      indexedCount: 2,
      quarantineCount: 1,
      validationErrorCount: 0,
    },
    documents: [
      {
        id: "idx_csv_alpha",
        sourceUri: "fixture://ingest-search/records.csv",
        mediaType: "text/csv",
        checksum: checksumB,
        title: "Notebook import",
        untrusted: true,
        quarantineState: "clear",
        citations: [citation],
      },
    ],
    quarantine: {
      items: [
        {
          id: "qtn_csv_beta_status",
          sourceUri: "fixture://ingest-search/records.csv",
          checksum: checksumB,
          reasonCode: "needs_local_review",
          citation,
          untrusted: true,
          quarantineState: "open",
        },
      ],
    },
  };
  const scanResponse = {
    ok: true,
    workspaceId: "wsp_ingest_demo",
    sources: [
      {
        sourceUri: "fixture://ingest-search/records.json",
        path: "examples/ingest-search/records.json",
        mediaType: "application/json",
        checksum: checksumC,
        state: "indexed",
        untrusted: true,
      },
    ],
  };
  const searchResponse = {
    ok: true,
    workspaceId: "wsp_ingest_demo",
    query: "checksum",
    results: [
      {
        id: "idx_json_beta",
        score: 1,
        matchedTerms: ["checksum"],
        sourceUri: "fixture://ingest-search/records.json",
        mediaType: "application/json",
        checksum: checksumC,
        title: "Checksum recap",
        snippet: "Checksums detect repeated source content before indexing.",
        citations: [
          {
            sourceUri: "fixture://ingest-search/records.json",
            range: {
              path: "$.items[1].summary",
            },
            trusted: false,
          },
        ],
        untrusted: true,
        quarantineState: "clear",
      },
    ],
  };
  const fetch = fakeFetch([
    jsonResponse(200, structuredResponse),
    jsonResponse(200, scanResponse),
    jsonResponse(200, searchResponse),
  ]);
  const client = createIngestSearchClient({
    baseUrl: "https://api.example.test/v1/",
    fetch,
  });

  const structured = await client.ingestStructured({
    workspaceId: "wsp_ingest_demo",
    sourceUri: "fixture://ingest-search/records.csv",
    mediaType: "text/csv",
    content: "id,title,status\ndoc_alpha,Notebook import,indexed\n",
    options: {
      requiredColumns: ["id", "title"],
      uniqueColumns: ["id"],
      trusted: false,
    },
  });
  const scanned = await client.scanRepository({
    workspaceId: "wsp_ingest_demo",
    localPath: "examples/ingest-search",
    options: {
      includePaths: ["records.json"],
      maxTextBytes: 5242880,
      trusted: false,
    },
  });
  const searched = await client.search({
    workspaceId: "wsp_ingest_demo",
    query: " checksum ",
    filters: {
      mediaTypes: ["application/json"],
      sourceUris: ["fixture://ingest-search/records.json"],
      tags: ["reference"],
    },
    limit: 5,
  });

  assert.deepEqual(structured, structuredResponse);
  assert.deepEqual(scanned, scanResponse);
  assert.deepEqual(searched, searchResponse);
  assert.equal(fetch.calls[0].url, "https://api.example.test/v1/ingest/structured");
  assert.equal(fetch.calls[1].url, "https://api.example.test/v1/ingest/repository/scan");
  assert.equal(fetch.calls[2].url, "https://api.example.test/v1/search/query");
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), {
    workspaceId: "wsp_ingest_demo",
    sourceUri: "fixture://ingest-search/records.csv",
    mediaType: "text/csv",
    content: "id,title,status\ndoc_alpha,Notebook import,indexed\n",
    options: {
      requiredColumns: ["id", "title"],
      uniqueColumns: ["id"],
      trusted: false,
    },
  });
  assert.deepEqual(JSON.parse(fetch.calls[1].init.body), {
    workspaceId: "wsp_ingest_demo",
    localPath: "examples/ingest-search",
    options: {
      includePaths: ["records.json"],
      maxTextBytes: 5242880,
      trusted: false,
    },
  });
  assert.deepEqual(JSON.parse(fetch.calls[2].init.body), {
    workspaceId: "wsp_ingest_demo",
    query: "checksum",
    filters: {
      mediaTypes: ["application/json"],
      sourceUris: ["fixture://ingest-search/records.json"],
      tags: ["reference"],
    },
    limit: 5,
  });
});

test("creates quarantine cases and applies a case decision", async () => {
  const casesResponse = {
    ok: true,
    cases: [
      {
        id: "qtn_csv_beta_status",
        sourceUri: "fixture://ingest-search/records.csv",
        state: "open",
        reasonCodes: ["needs_local_review"],
        severity: "medium",
        citationSnapshots: [citation],
        previewText: "Metric recap requires local review before indexing.",
        allowedActions: ["release", "reject"],
      },
    ],
  };
  const decisionResponse = {
    ok: true,
    case: {
      id: "qtn_csv_beta_status",
      sourceUri: "fixture://ingest-search/records.csv",
      fromState: "open",
      state: "released",
      decision: {
        action: "release",
        actorId: "local_reviewer",
        timestamp: "2026-04-27T08:05:00.000Z",
        reason: "Status accepted for local indexing.",
        override: false,
      },
    },
  };
  const fetch = fakeFetch([
    jsonResponse(200, casesResponse),
    jsonResponse(200, decisionResponse),
  ]);
  const client = createIngestSearchClient({
    baseUrl: "https://api.example.test/v1",
    fetch,
  });

  const cases = await client.createQuarantineCases({
    workspaceId: "wsp_ingest_demo",
    items: [
      {
        id: "qtn_csv_beta_status",
        sourceUri: "fixture://ingest-search/records.csv",
        checksum: checksumB,
        reasonCode: "needs_local_review",
        content: "Metric recap requires local review before indexing.",
        citation,
        untrusted: true,
      },
    ],
  });
  const decided = await client.decideQuarantineCase({
    caseId: "qtn_csv_beta_status",
    workspaceId: "wsp_ingest_demo",
    actorId: "local_reviewer",
    decision: "release",
    reason: "Status accepted for local indexing.",
    override: false,
    decidedAt: "2026-04-27T08:05:00.000Z",
  });

  assert.deepEqual(cases, casesResponse);
  assert.deepEqual(decided, decisionResponse);
  assert.equal(fetch.calls[0].url, "https://api.example.test/v1/quarantine/cases");
  assert.equal(
    fetch.calls[1].url,
    "https://api.example.test/v1/quarantine/cases/qtn_csv_beta_status/decision",
  );
  assert.deepEqual(JSON.parse(fetch.calls[1].init.body), {
    workspaceId: "wsp_ingest_demo",
    actorId: "local_reviewer",
    decision: "release",
    reason: "Status accepted for local indexing.",
    override: false,
    decidedAt: "2026-04-27T08:05:00.000Z",
  });
});

test("validates requests before fetch is called", async () => {
  const fetch = fakeFetch([]);
  const client = createIngestSearchClient({
    baseUrl: "https://api.example.test/v1",
    fetch,
  });

  await assert.rejects(
    client.normalize({
      workspaceId: "wsp_ingest_demo",
      sourceUri: "https://example.test/notes.md",
      mediaType: "text/markdown",
      content: "blocked remote source",
    }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(error.issues.map((issue) => issue.path), ["sourceUri"]);
      return true;
    },
  );

  await assert.rejects(
    client.scanRepository({
      workspaceId: "wsp_ingest_demo",
      localPath: "../outside",
    }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(error.issues.map((issue) => issue.path), ["localPath"]);
      return true;
    },
  );

  await assert.rejects(
    client.search({
      workspaceId: "wsp_ingest_demo",
      query: " ",
      limit: 0,
    }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(error.issues.map((issue) => issue.path), ["query", "limit"]);
      return true;
    },
  );

  await assert.rejects(
    client.decideQuarantineCase({
      caseId: "qtn_csv_beta_status",
      workspaceId: "wsp_ingest_demo",
      actorId: "local_reviewer",
      decision: "release",
      reason: "Accepted.",
      decidedAt: "not-a-date",
    }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(error.issues.map((issue) => issue.path), ["decidedAt"]);
      return true;
    },
  );

  assert.equal(fetch.calls.length, 0);
});

test("rejects invalid response shapes and preserves HTTP result errors", async () => {
  const fetch = fakeFetch([
    jsonResponse(200, {
      ok: true,
      workspaceId: "wsp_ingest_demo",
      query: "checksum",
      results: [
        {
          id: "idx_json_beta",
          score: 1,
          matchedTerms: ["checksum"],
          sourceUri: "fixture://ingest-search/records.json",
          mediaType: "application/json",
          checksum: "not-a-checksum",
          title: "Checksum recap",
          snippet: "Checksums detect repeated source content before indexing.",
          citations: [
            {
              sourceUri: "fixture://ingest-search/records.json",
              range: {
                path: "$.items[1].summary",
              },
              trusted: false,
            },
          ],
          untrusted: true,
          quarantineState: "clear",
        },
      ],
    }),
    jsonResponse(409, {
      error: {
        code: "quarantine_case_closed",
        message: "Case already has a final state.",
        details: {
          caseId: "qtn_csv_beta_status",
        },
      },
    }),
  ]);
  const client = createIngestSearchClient({
    baseUrl: "https://api.example.test/v1",
    fetch,
  });

  await assert.rejects(
    client.search({
      workspaceId: "wsp_ingest_demo",
      query: "checksum",
    }),
    (error) => {
      assert.equal(error instanceof ApiResponseValidationError, true);
      assert.deepEqual(error.issues.map((issue) => issue.path), ["results.0.checksum"]);
      return true;
    },
  );

  const result = await toApiResult(client.decideQuarantineCase({
    caseId: "qtn_csv_beta_status",
    workspaceId: "wsp_ingest_demo",
    actorId: "local_reviewer",
    decision: "reject",
    reason: "Duplicate item.",
    decidedAt: "2026-04-27T08:06:00.000Z",
  }));

  assert.equal(result.ok, false);
  assert.equal(result.error instanceof ApiHttpError, true);
  assert.equal(result.error.status, 409);
  assert.equal(result.error.apiCode, "quarantine_case_closed");
  assert.deepEqual(result.error.details, { caseId: "qtn_csv_beta_status" });
});

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
  if (status === 409) {
    return "Conflict";
  }
  return "";
}
