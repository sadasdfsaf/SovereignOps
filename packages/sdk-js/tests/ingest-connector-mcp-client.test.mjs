import assert from "node:assert/strict";
import test from "node:test";

import {
  ApiHttpError,
  ApiNetworkError,
  ApiRequestValidationError,
  ApiResponseParseError,
  ApiResponseValidationError,
  createIngestConnectorMcpClient,
  toApiResult,
} from "../src/index.ts";

const listSchemaVersion = "ingest-connector-mcp-resources/v1";
const resourceSchemaVersion = "ingest-connector-mcp-resource/v1";
const contentSchemaVersion = "ingest-connector-mcp-resource-content/v1";
const previewSchemaVersion = "ingest-connector-mcp-preview/v1";
const privatePath = "E:\\SovereignOps\\.codex-private\\round50\\plan.md";
const rawSecret = "sk-testsecret123";

test("lists, reads, and previews ingest connector MCP resources via injected fetch", async () => {
  const listResponse = validListResponse();
  const readResponse = validReadResponse();
  const previewResponse = validPreviewResponse();
  const fetch = fakeFetch([
    jsonResponse(200, listResponse),
    jsonResponse(200, readResponse),
    jsonResponse(200, previewResponse),
  ]);
  const client = createIngestConnectorMcpClient({
    baseUrl: "local://api/v1",
    apiKey: "[REDACTED]",
    headers: {
      "x-sdk-test": "ingest-connector-mcp",
    },
    fetch,
  });

  const listed = await client.listResources();
  const read = await client.readResource("local.files");
  const previewRequest = {
    connectorId: "local.files",
    includeContent: true,
  };
  const preview = await client.preview(previewRequest);

  assert.deepEqual(listed, listResponse);
  assert.deepEqual(read, readResponse);
  assert.deepEqual(preview, previewResponse);
  assert.equal(fetch.calls.length, 3);

  assert.equal(
    fetch.calls[0].url,
    "local://api/v1/ingest/connectors/mcp/resources",
  );
  assert.equal(fetch.calls[0].init.method, "GET");
  assert.equal(fetch.calls[0].init.headers.accept, "application/json");
  assert.equal(fetch.calls[0].init.headers.authorization, "Bearer [REDACTED]");
  assert.equal(fetch.calls[0].init.headers["x-sdk-test"], "ingest-connector-mcp");
  assert.equal(Object.hasOwn(fetch.calls[0].init.headers, "content-type"), false);
  assert.equal(fetch.calls[0].init.body, undefined);

  assert.equal(
    fetch.calls[1].url,
    "local://api/v1/ingest/connectors/mcp/resources/local.files",
  );
  assert.equal(fetch.calls[1].init.method, "GET");
  assert.equal(Object.hasOwn(fetch.calls[1].init.headers, "content-type"), false);

  assert.equal(
    fetch.calls[2].url,
    "local://api/v1/ingest/connectors/mcp/preview",
  );
  assert.equal(fetch.calls[2].init.method, "POST");
  assert.equal(fetch.calls[2].init.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(fetch.calls[2].init.body), previewRequest);
});

test("requires injected fetch instead of falling back to global fetch", () => {
  assert.throws(
    () => createIngestConnectorMcpClient({ baseUrl: "local://api/v1" }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(error.issues.map((issue) => issue.path), ["fetch"]);
      return true;
    },
  );
});

test("validates connector ids and preview bodies before fetch is called", async () => {
  const fetch = fakeFetch([]);
  const client = createIngestConnectorMcpClient({
    baseUrl: "local://api/v1",
    fetch,
  });

  await assert.rejects(
    client.readResource("files"),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(error.issues.map((issue) => issue.path), ["connectorId"]);
      return true;
    },
  );

  await assert.rejects(
    client.preview({
      connectorId: "Local Files",
      resourceUri: privatePath,
      includeContent: "yes",
      unexpected: true,
    }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(
        error.issues.map((issue) => issue.path),
        ["unexpected", "connectorId", "resourceUri", "includeContent"],
      );
      assertNoSensitiveText(error);
      return true;
    },
  );

  await assert.rejects(
    client.preview({ includeContent: false }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(error.issues.map((issue) => issue.path), ["connectorId"]);
      return true;
    },
  );

  assert.equal(fetch.calls.length, 0);
});

test("rejects malformed success envelopes", async () => {
  const malformedList = {
    ...validListResponse(),
    localOnly: false,
    resources: [
      {
        ...resourceManifest("local.files"),
        content: {
          ...resourceManifest("local.files").content,
          uri: "sovereignops://ingest/connectors/local.manual/manifest",
        },
      },
    ],
  };
  const malformedPreview = {
    ...validPreviewResponse(),
    preview: {
      ...validPreviewResponse().preview,
      contentBytes: 1,
    },
    resource: {
      ...resourceManifest("local.files"),
      connector: {
        ...connectorProfile("local.files"),
        safety: {
          ...connectorProfile("local.files").safety,
          networkAccess: true,
        },
      },
    },
  };
  const fetch = fakeFetch([
    jsonResponse(200, malformedList),
    jsonResponse(200, malformedPreview),
  ]);
  const client = createIngestConnectorMcpClient({
    baseUrl: "local://api/v1",
    fetch,
  });

  await assert.rejects(
    client.listResources(),
    (error) => {
      assert.equal(error instanceof ApiResponseValidationError, true);
      assert.deepEqual(
        error.issues.map((issue) => issue.path),
        ["localOnly", "resources.0.content.uri"],
      );
      return true;
    },
  );

  await assert.rejects(
    client.preview({ connectorId: "local.files" }),
    (error) => {
      assert.equal(error instanceof ApiResponseValidationError, true);
      assert.deepEqual(
        error.issues.map((issue) => issue.path),
        ["resource.connector.safety.networkAccess", "preview.contentBytes"],
      );
      return true;
    },
  );
});

test("keeps HTTP, parse, and network errors typed and redacted", async () => {
  const httpClient = createIngestConnectorMcpClient({
    baseUrl: "local://api/v1",
    fetch: fakeFetch([
      jsonResponse(500, {
        error: {
          code: "ingest_connector_mcp_failed",
          message: `Preview failed at ${privatePath} with ${rawSecret}`,
          details: {
            path: privatePath,
            token: rawSecret,
          },
        },
      }),
    ]),
  });

  const httpResult = await toApiResult(httpClient.listResources());
  assert.equal(httpResult.ok, false);
  assert.equal(httpResult.error instanceof ApiHttpError, true);
  assert.equal(httpResult.error.status, 500);
  assert.equal(httpResult.error.apiCode, "ingest_connector_mcp_failed");
  assertNoSensitiveText(httpResult.error);

  const parseClient = createIngestConnectorMcpClient({
    baseUrl: "local://api/v1",
    fetch: fakeFetch([
      textResponse(200, `{"path":"${privatePath}","token":"${rawSecret}"`, {
        "content-type": "application/json",
      }),
    ]),
  });

  await assert.rejects(
    parseClient.readResource("local.files"),
    (error) => {
      assert.equal(error instanceof ApiResponseParseError, true);
      assert.equal(error.status, 200);
      assertNoSensitiveText(error);
      assertNoSensitiveText(error.rawBody);
      return true;
    },
  );

  const networkClient = createIngestConnectorMcpClient({
    baseUrl: "local://api/v1",
    fetch: fakeFetch([
      new Error(`offline at ${privatePath} with ${rawSecret}`),
    ]),
  });

  const networkResult = await toApiResult(
    networkClient.preview({ resourceUri: "sovereignops://ingest/connectors/local.files/manifest" }),
  );
  assert.equal(networkResult.ok, false);
  assert.equal(networkResult.error instanceof ApiNetworkError, true);
  assert.equal(networkResult.error.code, "SO_API_NETWORK_ERROR");
  assertNoSensitiveText(networkResult.error);
  assertNoSensitiveText(networkResult.error.cause);
});

test("keeps request and response clone boundaries isolated", async () => {
  const request = {
    connectorId: "local.files",
    includeContent: true,
  };
  const response = validPreviewResponse();
  const fetch = fakeFetch([
    jsonResponse(200, response),
  ]);
  const client = createIngestConnectorMcpClient({
    baseUrl: "local://api/v1/",
    fetch,
  });

  const pending = client.preview(request);
  request.connectorId = "local.manual";
  request.includeContent = false;
  const preview = await pending;
  response.resource.connector.label = "mutated";

  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), {
    connectorId: "local.files",
    includeContent: true,
  });
  assert.equal(preview.resource.connector.label, "Local Files");
  assert.equal(Object.isFrozen(preview), true);
  assert.equal(Object.isFrozen(preview.resource.connector.safety), true);
  assert.equal(Object.isFrozen(preview.resource.content), true);
  assert.throws(() => {
    preview.localOnly = false;
  }, TypeError);
  assert.throws(() => {
    preview.resource.connector.safety.networkAccess = true;
  }, TypeError);
});

function validListResponse() {
  return {
    schemaVersion: listSchemaVersion,
    localOnly: true,
    noNetwork: true,
    durableWrites: false,
    metadata: metadata(),
    resources: [
      resourceManifest("local.files"),
      resourceManifest("local.manual"),
    ],
  };
}

function validReadResponse() {
  return {
    schemaVersion: resourceSchemaVersion,
    localOnly: true,
    noNetwork: true,
    durableWrites: false,
    metadata: metadata(),
    resource: resourceManifest("local.files"),
  };
}

function validPreviewResponse() {
  const resource = resourceManifest("local.files");
  return {
    schemaVersion: previewSchemaVersion,
    localOnly: true,
    noNetwork: true,
    durableWrites: false,
    dryRun: true,
    metadata: metadata(),
    connectorId: "local.files",
    resource,
    preview: {
      accepted: true,
      sideEffects: false,
      durableWrites: false,
      contentIncluded: true,
      contentBytes: new TextEncoder().encode(resource.content.text).length,
    },
  };
}

function resourceManifest(connectorId) {
  const connector = connectorProfile(connectorId);
  const resource = resourceDescriptor(connectorId);
  return {
    schemaVersion: resourceSchemaVersion,
    localOnly: true,
    noNetwork: true,
    durableWrites: false,
    metadata: metadata(),
    connectorId,
    resource,
    connector,
    content: resourceContent(connector, resource),
  };
}

function metadata() {
  return {
    localOnly: true,
    noNetwork: true,
    durableWrites: false,
  };
}

function resourceDescriptor(connectorId) {
  const label = connectorId === "local.files" ? "Local Files" : "Manual Text";
  return {
    uri: `sovereignops://ingest/connectors/${connectorId}/manifest`,
    name: `${label} MCP Resource`,
    description: connectorProfile(connectorId).description,
    mimeType: "application/json",
  };
}

function resourceContent(connector, resource) {
  return {
    uri: resource.uri,
    mimeType: "application/json",
    text: JSON.stringify({
      schemaVersion: contentSchemaVersion,
      localOnly: true,
      noNetwork: true,
      durableWrites: false,
      connector,
      resource,
    }),
  };
}

function connectorProfile(id) {
  const files = id === "local.files";
  return {
    id,
    label: files ? "Local Files" : "Manual Text",
    description: files
      ? "Previews caller-provided local file content."
      : "Accepts caller-supplied text for local normalization.",
    transport: "in-process",
    capabilities: files
      ? ["ingest.normalize", "repository.scan", "search.query"]
      : ["ingest.normalize", "ingest.structured", "search.query"],
    mediaTypes: files
      ? ["text/plain", "text/markdown", "application/json"]
      : ["text/plain", "text/markdown"],
    auth: {
      mode: "none",
      required: false,
    },
    preview: {
      dryRun: true,
      maxItems: files ? 50 : 20,
      maxTextBytes: files ? 65536 : 32768,
    },
    safety: {
      localOnly: true,
      networkAccess: false,
      durableWrites: false,
      untrustedByDefault: true,
    },
  };
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

function jsonResponse(status, body, headers = {}) {
  const text = JSON.stringify(body);
  return textResponse(status, text, {
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
  if (status === 500) {
    return "Internal Server Error";
  }
  return "";
}

function assertNoSensitiveText(value) {
  const serialized = `${String(value)}\n${JSON.stringify(value)}`;
  assert.equal(serialized.includes(rawSecret), false);
  assert.equal(serialized.includes(".codex-private"), false);
  assert.equal(serialized.includes("SovereignOps"), false);
}
