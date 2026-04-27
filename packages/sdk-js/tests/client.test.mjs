import assert from "node:assert/strict";
import test from "node:test";

import {
  ApiHttpError,
  ApiNetworkError,
  ApiRequestValidationError,
  ApiResponseParseError,
  ApiResponseValidationError,
  createSovereignOpsClient,
  parseJsonApiResponse,
  toApiResult,
} from "../src/client.ts";

const descriptor = Object.freeze({
  workspaceId: "wsp_alpha",
  deviceId: "dev_laptop",
  rootKeyRef: "key_root_alpha",
  createdAt: "2026-04-27T00:00:00.000Z",
  updatedAt: "2026-04-27T00:00:00.000Z",
});

test("creates workspaces with stable JSON payloads and headers", async () => {
  const fetch = fakeFetch([
    jsonResponse(201, descriptor),
  ]);
  const client = createSovereignOpsClient({
    baseUrl: "https://api.example.test/v1",
    apiKey: "test-key",
    fetch,
  });

  const created = await client.createWorkspace(descriptor);

  assert.deepEqual(created, descriptor);
  assert.equal(fetch.calls.length, 1);
  assert.equal(fetch.calls[0].url, "https://api.example.test/v1/workspaces");
  assert.equal(fetch.calls[0].init.method, "POST");
  assert.equal(fetch.calls[0].init.headers.accept, "application/json");
  assert.equal(fetch.calls[0].init.headers.authorization, "Bearer test-key");
  assert.equal(fetch.calls[0].init.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), descriptor);
});

test("lists workspaces with query parameters and response validation", async () => {
  const fetch = fakeFetch([
    jsonResponse(200, {
      workspaces: [descriptor],
      nextCursor: "cur_next",
    }),
  ]);
  const client = createSovereignOpsClient({
    baseUrl: "https://api.example.test/v1/",
    fetch,
  });

  const listed = await client.listWorkspaces({ cursor: "cur_1", limit: 10 });
  const url = new URL(fetch.calls[0].url);

  assert.deepEqual(listed, {
    workspaces: [descriptor],
    nextCursor: "cur_next",
  });
  assert.equal(url.href, "https://api.example.test/v1/workspaces?cursor=cur_1&limit=10");
  assert.equal(fetch.calls[0].init.method, "GET");
  assert.equal(fetch.calls[0].init.headers.accept, "application/json");
  assert.equal(Object.hasOwn(fetch.calls[0].init.headers, "content-type"), false);
});

test("uploads bundles with a workspace-scoped request payload", async () => {
  const fetch = fakeFetch([
    jsonResponse(200, {
      workspaceId: "wsp_alpha",
      bundleId: "bnd_notes_001",
      status: "stored",
      uploadedAt: "2026-04-27T00:01:00.000Z",
      checksum: "sha256:test",
    }),
  ]);
  const client = createSovereignOpsClient({
    baseUrl: "https://api.example.test/v1",
    fetch,
  });

  const uploaded = await client.uploadBundle({
    workspaceId: "wsp_alpha",
    bundleId: "bnd_notes_001",
    contentType: "application/vnd.sovereignops.bundle+json",
    checksum: "sha256:test",
    bundle: {
      items: [
        { id: "note_1", title: "First note" },
      ],
    },
  });

  assert.deepEqual(uploaded, {
    workspaceId: "wsp_alpha",
    bundleId: "bnd_notes_001",
    status: "stored",
    uploadedAt: "2026-04-27T00:01:00.000Z",
    checksum: "sha256:test",
  });
  assert.equal(fetch.calls[0].url, "https://api.example.test/v1/workspaces/wsp_alpha/bundles");
  assert.equal(fetch.calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), {
    bundleId: "bnd_notes_001",
    contentType: "application/vnd.sovereignops.bundle+json",
    checksum: "sha256:test",
    bundle: {
      items: [
        { id: "note_1", title: "First note" },
      ],
    },
  });
});

test("lists audit events for a workspace", async () => {
  const fetch = fakeFetch([
    jsonResponse(200, {
      events: [
        {
          auditId: "aud_001",
          workspaceId: "wsp_alpha",
          action: "bundle.uploaded",
          actor: "dev_laptop",
          createdAt: "2026-04-27T00:01:01.000Z",
          details: { bundleId: "bnd_notes_001" },
        },
      ],
      nextCursor: "cur_2",
    }),
  ]);
  const client = createSovereignOpsClient({
    baseUrl: "https://api.example.test/v1",
    fetch,
  });

  const listed = await client.listAudit({
    workspaceId: "wsp_alpha",
    cursor: "cur_1",
    limit: 20,
  });

  assert.deepEqual(listed.events, [
    {
      auditId: "aud_001",
      workspaceId: "wsp_alpha",
      action: "bundle.uploaded",
      actor: "dev_laptop",
      createdAt: "2026-04-27T00:01:01.000Z",
      details: { bundleId: "bnd_notes_001" },
    },
  ]);
  assert.equal(listed.nextCursor, "cur_2");
  assert.equal(
    fetch.calls[0].url,
    "https://api.example.test/v1/workspaces/wsp_alpha/audit?cursor=cur_1&limit=20",
  );
  assert.equal(fetch.calls[0].init.method, "GET");
});

test("converts API error responses into typed HTTP errors and results", async () => {
  const fetch = fakeFetch([
    jsonResponse(409, {
      error: {
        code: "WORKSPACE_ALREADY_EXISTS",
        message: "workspace already exists",
        details: { workspaceId: "wsp_alpha" },
      },
    }),
  ]);
  const client = createSovereignOpsClient({
    baseUrl: "https://api.example.test/v1",
    fetch,
  });

  const result = await toApiResult(client.createWorkspace(descriptor));

  assert.equal(result.ok, false);
  assert.equal(result.error instanceof ApiHttpError, true);
  assert.equal(result.error.status, 409);
  assert.equal(result.error.apiCode, "WORKSPACE_ALREADY_EXISTS");
  assert.deepEqual(result.error.details, { workspaceId: "wsp_alpha" });
});

test("handles non-JSON success bodies as parse errors", async () => {
  const fetch = fakeFetch([
    textResponse(200, "created", { "content-type": "text/plain" }),
  ]);
  const client = createSovereignOpsClient({
    baseUrl: "https://api.example.test/v1",
    fetch,
  });

  await assert.rejects(
    client.createWorkspace(descriptor),
    (error) => {
      assert.equal(error instanceof ApiResponseParseError, true);
      assert.equal(error.rawBody, "created");
      assert.equal(error.contentType, "text/plain");
      return true;
    },
  );
});

test("handles malformed JSON bodies as parse errors", async () => {
  const response = textResponse(200, "{", { "content-type": "application/json" });

  await assert.rejects(
    parseJsonApiResponse(response, (value) => value),
    (error) => {
      assert.equal(error instanceof ApiResponseParseError, true);
      assert.equal(error.status, 200);
      assert.equal(error.rawBody, "{");
      return true;
    },
  );
});

test("handles invalid response shapes as typed validation errors", async () => {
  const fetch = fakeFetch([
    jsonResponse(200, { workspaces: [{ ...descriptor, workspaceId: "alpha" }] }),
  ]);
  const client = createSovereignOpsClient({
    baseUrl: "https://api.example.test/v1",
    fetch,
  });

  await assert.rejects(
    client.listWorkspaces(),
    (error) => {
      assert.equal(error instanceof ApiResponseValidationError, true);
      assert.deepEqual(
        error.issues.map((issue) => issue.path),
        ["workspaces.0.workspaceId"],
      );
      return true;
    },
  );
});

test("validates request payloads before fetch is called", async () => {
  const fetch = fakeFetch([]);
  const client = createSovereignOpsClient({
    baseUrl: "https://api.example.test/v1",
    fetch,
  });

  await assert.rejects(
    client.uploadBundle({
      workspaceId: "wsp_alpha",
      bundleId: "bnd_bad",
      bundle: { title: undefined },
    }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(
        error.issues.map((issue) => issue.path),
        ["bundle.title"],
      );
      return true;
    },
  );
  assert.equal(fetch.calls.length, 0);
});

test("validates list queries before fetch is called", async () => {
  const fetch = fakeFetch([]);
  const client = createSovereignOpsClient({
    baseUrl: "https://api.example.test/v1",
    fetch,
  });

  await assert.rejects(
    client.listWorkspaces({ limit: 0 }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(
        error.issues.map((issue) => issue.path),
        ["query.limit"],
      );
      return true;
    },
  );
  assert.equal(fetch.calls.length, 0);
});

test("wraps fetch failures as network errors", async () => {
  const fetch = fakeFetch([
    new Error("connection refused"),
  ]);
  const client = createSovereignOpsClient({
    baseUrl: "https://api.example.test/v1",
    fetch,
  });

  await assert.rejects(
    client.listAudit(),
    (error) => {
      assert.equal(error instanceof ApiNetworkError, true);
      assert.equal(error.code, "SO_API_NETWORK_ERROR");
      return true;
    },
  );
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
  if (status === 201) {
    return "Created";
  }
  if (status === 409) {
    return "Conflict";
  }
  return "";
}
