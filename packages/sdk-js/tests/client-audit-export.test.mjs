import assert from "node:assert/strict";
import test from "node:test";

import {
  ApiHttpError,
  ApiRequestValidationError,
  ApiResponseValidationError,
  createSovereignOpsClient,
  toApiResult,
} from "../src/client.ts";

const events = Object.freeze([
  {
    eventId: "evt_file_created",
    timestamp: "2026-04-27T04:00:01.000Z",
    type: "workspace.file.created",
    decision: "allow",
    actor: {
      id: "user_local",
    },
    target: "file_alpha",
    attributes: {
      file: "alpha.md",
    },
    context: {
      workspaceId: "wsp_alpha",
    },
  },
]);

const filters = Object.freeze({
  decisions: ["allow"],
  types: ["workspace.file.created"],
  fromTimestamp: "2026-04-27T04:00:00.000Z",
  toTimestamp: "2026-04-27T04:59:59.000Z",
});

const request = Object.freeze({
  events,
  filters,
  createdAt: "2026-04-27T04:30:00.000Z",
  exportId: "audit_alpha",
});

const manifest = Object.freeze({
  kind: "audit-export.manifest",
  version: 1,
  exportId: "audit_alpha",
  createdAt: "2026-04-27T04:30:00.000Z",
  eventCount: 1,
  firstTimestamp: "2026-04-27T04:00:01.000Z",
  lastTimestamp: "2026-04-27T04:00:01.000Z",
  decisions: ["allow"],
  types: ["workspace.file.created"],
  filters,
  eventFingerprints: ["fnv1a64:1111111111111111"],
  jsonl: {
    fingerprint: "fnv1a64:2222222222222222",
    mediaType: "application/jsonl",
    bytes: 96,
    lines: 1,
  },
  csv: {
    fingerprint: "fnv1a64:3333333333333333",
    mediaType: "text/csv",
    bytes: 160,
    rows: 1,
    columns: [
      "eventId",
      "timestamp",
      "type",
      "decision",
      "actor",
      "target",
      "reason",
      "attributes",
      "context",
      "fingerprint",
    ],
  },
  fingerprint: "fnv1a64:4444444444444444",
});

const jsonl = "{\"eventId\":\"evt_file_created\"}\n";
const csv = "eventId,timestamp,type,decision\n";

test("exports audit JSONL with stable request body and response parsing", async () => {
  const fetch = fakeFetch([
    jsonResponse(200, {
      kind: "audit-export.content",
      format: "jsonl",
      mediaType: "application/jsonl",
      content: jsonl,
      fingerprint: manifest.jsonl.fingerprint,
      exportId: manifest.exportId,
      createdAt: manifest.createdAt,
      manifest,
    }),
  ]);
  const client = createSovereignOpsClient({
    baseUrl: "https://api.example.test/v1",
    apiKey: "test-key",
    fetch,
  });

  const exported = await client.exportAuditJsonl(request);

  assert.deepEqual(exported, {
    jsonl,
    manifest,
  });
  assert.equal(fetch.calls.length, 1);
  assert.equal(fetch.calls[0].url, "https://api.example.test/v1/audit/export/jsonl");
  assert.equal(fetch.calls[0].init.method, "POST");
  assert.equal(fetch.calls[0].init.headers.accept, "application/json");
  assert.equal(fetch.calls[0].init.headers.authorization, "Bearer test-key");
  assert.equal(fetch.calls[0].init.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), request);
});

test("exports audit CSV and package responses", async () => {
  const auditPackage = {
    kind: "audit-export.package",
    version: 1,
    manifest,
    jsonl,
    csv,
    fingerprint: "fnv1a64:5555555555555555",
  };
  const fetch = fakeFetch([
    jsonResponse(200, {
      kind: "audit-export.content",
      format: "csv",
      mediaType: "text/csv",
      content: csv,
      fingerprint: manifest.csv.fingerprint,
      exportId: manifest.exportId,
      createdAt: manifest.createdAt,
      manifest,
    }),
    jsonResponse(200, auditPackage),
  ]);
  const client = createSovereignOpsClient({
    baseUrl: "https://api.example.test/v1/",
    fetch,
  });

  const csvExport = await client.exportAuditCsv(request);
  const packageExport = await client.exportAuditPackage(request);

  assert.deepEqual(csvExport, {
    csv,
    manifest,
  });
  assert.deepEqual(packageExport, auditPackage);
  assert.equal(fetch.calls[0].url, "https://api.example.test/v1/audit/export/csv");
  assert.equal(fetch.calls[1].url, "https://api.example.test/v1/audit/export/package");
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), request);
  assert.deepEqual(JSON.parse(fetch.calls[1].init.body), request);
});

test("validates audit export events and filters before fetch is called", async () => {
  const fetch = fakeFetch([]);
  const client = createSovereignOpsClient({
    baseUrl: "https://api.example.test/v1",
    fetch,
  });

  await assert.rejects(
    client.exportAuditJsonl({
      events,
      filters: {
        fromTimestamp: "2026-04-27T04:30:00.000Z",
        toTimestamp: "2026-04-27T04:00:00.000Z",
      },
    }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(
        error.issues.map((issue) => issue.path),
        ["filters.toTimestamp"],
      );
      return true;
    },
  );

  await assert.rejects(
    client.exportAuditCsv({
      events: [
        {
          timestamp: "not-a-timestamp",
          type: "workspace.file.created",
        },
      ],
    }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(
        error.issues.map((issue) => issue.path),
        ["events.0.timestamp"],
      );
      return true;
    },
  );

  assert.equal(fetch.calls.length, 0);
});

test("rejects malformed audit export wrappers and manifests", async () => {
  const fetch = fakeFetch([
    jsonResponse(200, {
      kind: "audit-export.content",
      format: "jsonl",
      mediaType: "application/jsonl",
      fingerprint: manifest.jsonl.fingerprint,
      exportId: manifest.exportId,
      createdAt: manifest.createdAt,
      manifest,
    }),
    jsonResponse(200, {
      kind: "audit-export.content",
      format: "csv",
      mediaType: "text/csv",
      content: csv,
      fingerprint: manifest.csv.fingerprint,
      exportId: manifest.exportId,
      createdAt: manifest.createdAt,
      manifest: {
        ...manifest,
        eventCount: "1",
      },
    }),
  ]);
  const client = createSovereignOpsClient({
    baseUrl: "https://api.example.test/v1",
    fetch,
  });

  await assert.rejects(
    client.exportAuditJsonl(request),
    (error) => {
      assert.equal(error instanceof ApiResponseValidationError, true);
      assert.deepEqual(
        error.issues.map((issue) => issue.path),
        ["content"],
      );
      return true;
    },
  );

  await assert.rejects(
    client.exportAuditCsv(request),
    (error) => {
      assert.equal(error instanceof ApiResponseValidationError, true);
      assert.equal(
        error.issues.some((issue) => issue.path === "manifest.eventCount"),
        true,
      );
      return true;
    },
  );
});

test("keeps audit export HTTP errors typed", async () => {
  const fetch = fakeFetch([
    jsonResponse(422, {
      error: {
        code: "AUDIT_EXPORT_INVALID",
        message: "audit export request failed",
        details: { exportId: "audit_alpha" },
      },
    }),
  ]);
  const client = createSovereignOpsClient({
    baseUrl: "https://api.example.test/v1",
    fetch,
  });

  const result = await toApiResult(client.exportAuditPackage(request));

  assert.equal(result.ok, false);
  assert.equal(result.error instanceof ApiHttpError, true);
  assert.equal(result.error.status, 422);
  assert.equal(result.error.apiCode, "AUDIT_EXPORT_INVALID");
  assert.deepEqual(result.error.details, { exportId: "audit_alpha" });
  assert.equal(fetch.calls[0].url, "https://api.example.test/v1/audit/export/package");
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
  if (status === 422) {
    return "Unprocessable Content";
  }
  return "";
}
