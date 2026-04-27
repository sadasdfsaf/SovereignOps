import assert from "node:assert/strict";
import test from "node:test";

import {
  INGEST_CONNECTOR_MCP_PREVIEW_SCHEMA_VERSION,
  INGEST_CONNECTOR_MCP_RESOURCE_LIST_SCHEMA_VERSION,
  INGEST_CONNECTOR_MCP_RESOURCE_SCHEMA_VERSION,
  createIngestConnectorMcpRoutes,
  createIngestConnectorMcpResourceList,
  mountIngestConnectorMcpRoutes,
} from "../src/ingestConnectorMcpRoutes.ts";
import { createApiRouter } from "../src/router.ts";

test("mounts local MCP ingest connector resource routes", async () => {
  const router = createApiRouter();
  mountIngestConnectorMcpRoutes(router, undefined, { gatewayHelper: null });

  assert.deepEqual(
    router.listRoutes().map(routeKey),
    [
      "GET /v1/ingest/connectors/mcp/resources",
      "GET /v1/ingest/connectors/mcp/resources/:connectorId",
      "POST /v1/ingest/connectors/mcp/preview",
    ],
  );

  const response = await router.dispatch({
    method: "GET",
    path: "/v1/ingest/connectors/mcp/resources",
  });

  assertJsonResponse(response, 200);
  assert.equal(response.body.schemaVersion, INGEST_CONNECTOR_MCP_RESOURCE_LIST_SCHEMA_VERSION);
  assertLocalOnlyEnvelope(response.body);
  assert.deepEqual(
    response.body.resources.map((resource) => resource.connectorId),
    ["local.files", "local.manual", "local.workspace-index"],
  );

  const first = response.body.resources[0];
  assert.equal(first.schemaVersion, INGEST_CONNECTOR_MCP_RESOURCE_SCHEMA_VERSION);
  assertLocalOnlyEnvelope(first);
  assert.equal(first.resource.uri, "sovereignops://ingest/connectors/local.files/manifest");
  assert.equal(first.resource.mimeType, "application/json");
  assert.equal(first.content.uri, first.resource.uri);
  assert.equal(first.content.mimeType, "application/json");

  const content = JSON.parse(first.content.text);
  assert.equal(content.schemaVersion, "ingest-connector-mcp-resource-content/v1");
  assert.equal(content.connector.id, "local.files");
  assert.equal(content.localOnly, true);
  assert.equal(content.noNetwork, true);
  assert.equal(content.durableWrites, false);
  assertNoUnsafeText(response.body);
});

test("returns one resource manifest and standard missing connector errors", async () => {
  const router = createApiRouter(createIngestConnectorMcpRoutes(undefined, { gatewayHelper: null }));

  const found = await router.dispatch({
    method: "GET",
    path: "/v1/ingest/connectors/mcp/resources/local.manual",
  });
  assertJsonResponse(found, 200);
  assert.equal(found.body.schemaVersion, INGEST_CONNECTOR_MCP_RESOURCE_SCHEMA_VERSION);
  assertLocalOnlyEnvelope(found.body);
  assert.equal(found.body.resource.connectorId, "local.manual");
  assert.equal(found.body.resource.connector.id, "local.manual");

  const missing = await router.dispatch({
    method: "GET",
    path: "/v1/ingest/connectors/mcp/resources/local.unknown",
  });
  assertJsonError(missing, 404, "ingest_connector_mcp_resource_not_found");
  assert.deepEqual(missing.body.error.details, { connectorId: "local.unknown" });

  const unsafeId = [["C:", "Users", "DELL"].join("\\"), "manifest.json"].join("\\");
  const invalid = await router.dispatch({
    method: "GET",
    path: `/v1/ingest/connectors/mcp/resources/${encodeURIComponent(unsafeId)}`,
  });
  assertJsonError(invalid, 400, "validation_failed");
  assert.deepEqual(invalid.body.error.details, { path: "params.connectorId" });
  assertNoUnsafeText(invalid.body);
});

test("previews connector MCP resources as a dry run without side effects", async () => {
  const router = createApiRouter(createIngestConnectorMcpRoutes(undefined, { gatewayHelper: null }));

  const response = await router.dispatch({
    method: "POST",
    path: "/v1/ingest/connectors/mcp/preview",
    body: {
      connectorId: "local.workspace-index",
      includeContent: false,
    },
  });

  assertJsonResponse(response, 200);
  assert.equal(response.body.schemaVersion, INGEST_CONNECTOR_MCP_PREVIEW_SCHEMA_VERSION);
  assertLocalOnlyEnvelope(response.body);
  assert.equal(response.body.dryRun, true);
  assert.equal(response.body.connectorId, "local.workspace-index");
  assert.equal(response.body.preview.accepted, true);
  assert.equal(response.body.preview.sideEffects, false);
  assert.equal(response.body.preview.durableWrites, false);
  assert.equal(response.body.preview.contentIncluded, false);
  assert.equal(response.body.preview.contentBytes, 0);
  assert.equal(response.body.resource.content.text, "");
  assertNoUnsafeText(response.body);
});

test("previews MCP resources by resourceUri manifest alias when canonical URI omits it", async () => {
  const router = createApiRouter(createIngestConnectorMcpRoutes(undefined, {
    gatewayHelper(input) {
      const connectors = Array.isArray(input?.connectors)
        ? input.connectors
        : input?.manifest?.connectors;
      if (!Array.isArray(connectors)) {
        return undefined;
      }

      return {
        resources: connectors.map((connector) => ({
          connectorId: connector.id,
          uri: `sovereignops://ingest/connectors/${connector.id}`,
          name: `Alias ${connector.label}`,
          description: connector.description,
        })),
      };
    },
  }));

  const byUri = await router.dispatch({
    method: "POST",
    path: "/v1/ingest/connectors/mcp/preview",
    body: {
      resourceUri: "sovereignops://ingest/connectors/local.workspace-index/manifest",
      includeContent: false,
    },
  });
  assertJsonResponse(byUri, 200);
  assert.equal(byUri.body.connectorId, "local.workspace-index");
  assert.equal(byUri.body.resource.resource.uri, "sovereignops://ingest/connectors/local.workspace-index");
  assert.equal(byUri.body.preview.contentIncluded, false);

  const byConnectorAndUri = await router.dispatch({
    method: "POST",
    path: "/v1/ingest/connectors/mcp/preview",
    body: {
      connectorId: "local.workspace-index",
      resourceUri: "sovereignops://ingest/connectors/local.workspace-index/manifest",
      includeContent: false,
    },
  });
  assertJsonResponse(byConnectorAndUri, 200);
  assert.equal(byConnectorAndUri.body.connectorId, "local.workspace-index");
  assert.equal(
    byConnectorAndUri.body.resource.resource.uri,
    "sovereignops://ingest/connectors/local.workspace-index",
  );
  assertNoUnsafeText(byUri.body);
  assertNoUnsafeText(byConnectorAndUri.body);
});

test("preview validation never echoes raw paths, secrets, or private markers", async () => {
  const router = createApiRouter(createIngestConnectorMcpRoutes(undefined, { gatewayHelper: null }));
  const unsafePath = [["C:", "Users", "DELL"].join("\\"), "connectors.json"].join("\\");
  const rawSecret = ["sk", "round50secret1234567890"].join("-");
  const privateMarker = ["plan", "pack"].join("-");

  const badBody = await router.dispatch({
    method: "POST",
    path: "/v1/ingest/connectors/mcp/preview",
    body: {
      connectorId: "local.files",
      apiKey: rawSecret,
      debugPath: unsafePath,
      marker: privateMarker,
    },
  });
  assertJsonError(badBody, 400, "validation_failed");
  assert.deepEqual(badBody.body.error.details, { path: "body.apiKey" });
  assertNoUnsafeText(badBody.body);

  const missingBody = await router.dispatch({
    method: "POST",
    path: "/v1/ingest/connectors/mcp/preview",
  });
  assertJsonError(missingBody, 400, "validation_failed");
  assert.deepEqual(missingBody.body.error.details, { path: "body" });

  const mismatch = await router.dispatch({
    method: "POST",
    path: "/v1/ingest/connectors/mcp/preview",
    body: {
      connectorId: "local.files",
      resourceUri: "sovereignops://ingest/connectors/local.manual/manifest",
    },
  });
  assertJsonError(mismatch, 400, "validation_failed");
  assert.deepEqual(mismatch.body.error.details, { path: "body.resourceUri" });
  assertNoUnsafeText(mismatch.body);
});

test("delegates resource construction to an injected gateway helper when available", async () => {
  const router = createApiRouter(createIngestConnectorMcpRoutes(undefined, {
    gatewayHelper(input) {
      if (!input?.manifest) {
        return undefined;
      }

      return {
        resources: input.manifest.connectors.map((connector) => ({
          connectorId: connector.id,
          uri: `sovereignops://ingest-connector/${connector.id}/manifest`,
          name: `Delegated ${connector.label}`,
          description: `Delegated ${connector.id}`,
        })),
      };
    },
  }));

  const response = await router.dispatch({
    method: "GET",
    path: "/v1/ingest/connectors/mcp/resources",
  });

  assertJsonResponse(response, 200);
  assert.deepEqual(
    response.body.resources.map((resource) => resource.resource.uri),
    [
      "sovereignops://ingest-connector/local.files/manifest",
      "sovereignops://ingest-connector/local.manual/manifest",
      "sovereignops://ingest-connector/local.workspace-index/manifest",
    ],
  );
  assert.equal(response.body.resources[0].resource.name, "Delegated Local Files");
  assertNoUnsafeText(response.body);
});

test("resource list helper returns deterministic clone boundaries", async () => {
  const first = await createIngestConnectorMcpResourceList(undefined, null);
  const second = await createIngestConnectorMcpResourceList(undefined, null);

  assert.deepEqual(first, second);
  assert.notEqual(first.resources, second.resources);
  assert.notEqual(first.resources[0], second.resources[0]);
  assert.throws(() => {
    first.resources[0].connector.safety.networkAccess = true;
  }, TypeError);
});

test("index exports ingest connector MCP route helpers", async () => {
  const api = await import("../src/index.ts");

  assert.equal(typeof api.createIngestConnectorMcpRoutes, "function");
  assert.equal(typeof api.mountIngestConnectorMcpRoutes, "function");
  assert.equal(typeof api.createIngestConnectorMcpResourceList, "function");
});

function assertLocalOnlyEnvelope(body) {
  assert.equal(body.localOnly, true);
  assert.equal(body.noNetwork, true);
  assert.equal(body.durableWrites, false);
  assert.deepEqual(body.metadata, {
    localOnly: true,
    noNetwork: true,
    durableWrites: false,
  });
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

function assertNoUnsafeText(value) {
  const text = JSON.stringify(value);
  const lowerText = text.toLowerCase();
  const privateMarkers = [
    ".codex-private",
    ".codex-run",
    "sovereignops-codex-pack",
    ["plan", "pack"].join("-"),
    "private " + "plan " + "pack",
    "codex_start_here",
  ];
  for (const marker of privateMarkers) {
    assert.equal(lowerText.includes(marker), false, marker);
  }

  assert.equal(/(?<![A-Za-z0-9])[A-Za-z]:[\\/]/.test(text), false);
  assert.equal(/\\\\[^\\\s]+\\[^\\\s]+/.test(text), false);
  assert.equal(/(?<![A-Za-z0-9_])\/(?:Users|home|root|tmp|var|etc|opt|private|mnt|Volumes)(?:\/|\b)/.test(text), false);
  assert.equal(/\bsk-[A-Za-z0-9_-]{12,}\b/.test(text), false);
  assert.equal(/\bgh[pousr]_[A-Za-z0-9_]{12,}\b/.test(text), false);
  assert.equal(/\bAKIA[0-9A-Z]{16}\b/.test(text), false);
  assert.equal(/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text), false);
  assert.equal(/\bbearer\s+(?!\[REDACTED\])[A-Za-z0-9._~+/=-]{8,}/i.test(text), false);
  assert.equal(/\b(?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*(?!\[REDACTED\])\S{4,}/i.test(text), false);
}

function routeKey(route) {
  return `${route.method} ${route.path}`;
}
