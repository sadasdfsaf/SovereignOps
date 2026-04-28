import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  createIngestConnectorMcpResourceList,
  createIngestConnectorMcpRoutes,
} from "../src/ingestConnectorMcpRoutes.ts";
import { createApiRouter } from "../src/router.ts";
import {
  INGEST_CONNECTOR_MCP_API_REQUESTS_SCHEMA_VERSION,
  INGEST_CONNECTOR_MCP_PREVIEW_SCHEMA_VERSION,
  INGEST_CONNECTOR_MCP_RESOURCES_SCHEMA_VERSION,
  INGEST_CONNECTOR_MCP_RESOURCE_SCHEMA_VERSION,
  assertIngestConnectorMcpApiRequestBundle,
  assertIngestConnectorMcpPreview,
  assertIngestConnectorMcpResource,
  assertIngestConnectorMcpResources,
  validateIngestConnectorMcpApiRequestBundle,
  validateIngestConnectorMcpPreview,
  validateIngestConnectorMcpResource,
  validateIngestConnectorMcpResources,
} from "../../../packages/schemas/src/ingestConnectorMcpApi.ts";

const fixturesDir = fileURLToPath(new URL("../../../examples/ingest-search/", import.meta.url));
const apiRequestFixturePath = join(fixturesDir, "connector-mcp-api-requests.json");
const generatedAt = "2026-04-27T22:30:00.000Z";
const apiRequestFixtureReference = "examples/ingest-search/connector-mcp-api-requests.json";

test("createIngestConnectorMcpResourceList output maps to the shared resources validator", async () => {
  const list = await createIngestConnectorMcpResourceList(undefined, null);

  for (const resource of list.resources) {
    const shared = createSharedResourcesEnvelope([resource], {
      connectorId: resource.connectorId,
      generatedAt,
    });
    const result = validateIngestConnectorMcpResources(shared);

    assert.equal(result.ok, true, formatIssues(result.issues));
    assert.deepEqual(result.issues, []);
    assert.doesNotThrow(() => assertIngestConnectorMcpResources(shared));
  }
});

test("single MCP resource response output maps to the shared resource validator", async () => {
  const response = await dispatchMcpRoute({
    method: "GET",
    path: "/v1/ingest/connectors/mcp/resources/local.files",
  });
  const shared = createSharedResourceEnvelope(response.body.resource, { generatedAt });
  const result = validateIngestConnectorMcpResource(shared);

  assert.equal(response.status, 200);
  assert.equal(result.ok, true, formatIssues(result.issues));
  assert.deepEqual(result.issues, []);
  assert.doesNotThrow(() => assertIngestConnectorMcpResource(shared));
});

test("/manifest alias preview output maps to the shared preview validator", async () => {
  const response = await dispatchMcpRoute({
    method: "POST",
    path: "/v1/ingest/connectors/mcp/preview",
    body: {
      resourceUri: "sovereignops://ingest/connectors/local.workspace-index/manifest",
      includeContent: true,
    },
  });
  const shared = createSharedPreviewEnvelope(response.body, { generatedAt });
  const result = validateIngestConnectorMcpPreview(shared);

  assert.equal(response.status, 200);
  assert.equal(response.body.connectorId, "local.workspace-index");
  assert.equal(result.ok, true, formatIssues(result.issues));
  assert.deepEqual(result.issues, []);
  assert.doesNotThrow(() => assertIngestConnectorMcpPreview(shared));
});

test("connector MCP API request example materializes through the shared bundle validator", async () => {
  const legacy = await readFixtureJson("connector-mcp-api-requests.json");
  const listFixture = findLegacyFixture(legacy, "mcp_ingest_connector_resources");
  const previewFixture = findLegacyFixture(
    legacy,
    "mcp_ingest_connector_preview_workspace_index_manifest_uri",
  );
  const connectorId = previewFixture.expectedBody.connectorId;
  const resource = previewFixture.expectedBody.resource;
  const resources = createSharedResourcesEnvelope([resource], {
    connectorId,
    generatedAt: legacy.generatedAt,
  });
  const preview = createSharedPreviewEnvelope(previewFixture.expectedBody, {
    generatedAt: legacy.generatedAt,
  });
  const shared = {
    schemaVersion: INGEST_CONNECTOR_MCP_API_REQUESTS_SCHEMA_VERSION,
    bundleId: "connector.mcp.api.requests",
    generatedAt: legacy.generatedAt,
    connectorId,
    localOnly: true,
    requests: [
      {
        id: requestIdFromFixture(listFixture.id),
        requestedAt: legacy.generatedAt,
        connectorId,
        operation: "resources/list",
        responseSchemaVersion: INGEST_CONNECTOR_MCP_RESOURCES_SCHEMA_VERSION,
        fixture: apiRequestFixtureReference,
      },
      {
        id: requestIdFromFixture(previewFixture.id),
        requestedAt: legacy.generatedAt,
        connectorId,
        operation: "preview",
        responseSchemaVersion: INGEST_CONNECTOR_MCP_PREVIEW_SCHEMA_VERSION,
        fixture: apiRequestFixtureReference,
      },
    ],
    resources,
    resourceFixtures: [createSharedResourceEnvelope(resource, { generatedAt: legacy.generatedAt })],
    preview,
  };
  const result = validateIngestConnectorMcpApiRequestBundle(shared);

  assert.equal(legacy.schemaVersion, INGEST_CONNECTOR_MCP_API_REQUESTS_SCHEMA_VERSION);
  assert.equal(result.ok, true, formatIssues(result.issues));
  assert.deepEqual(result.issues, []);
  assert.doesNotThrow(() => assertIngestConnectorMcpApiRequestBundle(shared));
});

async function dispatchMcpRoute(request) {
  const router = createApiRouter(createIngestConnectorMcpRoutes(undefined, { gatewayHelper: null }));
  return router.dispatch(request);
}

function createSharedPreviewEnvelope(preview, options) {
  const resources = [createSharedResourceEnvelope(preview.resource, options)];
  const totalTextBytes = resources.reduce(
    (sum, resource) => sum + resource.resource.textBytes,
    0,
  );

  return {
    schemaVersion: INGEST_CONNECTOR_MCP_PREVIEW_SCHEMA_VERSION,
    generatedAt: options.generatedAt,
    connectorId: preview.connectorId,
    localOnly: true,
    dryRun: true,
    request: {
      maxItems: preview.resource.connector.preview.maxItems,
      maxTextBytes: preview.resource.connector.preview.maxTextBytes,
    },
    resources,
    summary: {
      resourceCount: resources.length,
      totalTextBytes,
      truncated: false,
    },
  };
}

function createSharedResourcesEnvelope(resources, options) {
  return {
    schemaVersion: INGEST_CONNECTOR_MCP_RESOURCES_SCHEMA_VERSION,
    generatedAt: options.generatedAt,
    connectorId: options.connectorId,
    localOnly: true,
    resources: resources.map(createSharedResourceSummary),
  };
}

function createSharedResourceEnvelope(resource, options) {
  return {
    schemaVersion: INGEST_CONNECTOR_MCP_RESOURCE_SCHEMA_VERSION,
    generatedAt: options.generatedAt,
    connectorId: resource.connectorId,
    localOnly: true,
    resource: createSharedResourceSummary(resource),
    content: {
      type: "text",
      text: resource.content.text,
      truncated: false,
    },
  };
}

function createSharedResourceSummary(resource) {
  return {
    id: resource.connectorId,
    uri: `ingest://${resource.connectorId}/manifest`,
    name: resource.resource.name,
    description: resource.resource.description,
    mimeType: resource.resource.mimeType,
    textBytes: resource.content.text.length,
  };
}

function findLegacyFixture(bundle, id) {
  const fixture = bundle.requests.find((candidate) => candidate.id === id);
  assert.ok(fixture, `Missing fixture ${id}`);
  return fixture;
}

async function readFixtureJson(file) {
  return JSON.parse(await readFile(join(fixturesDir, file), "utf8"));
}

function requestIdFromFixture(id) {
  return id.replaceAll("_", ".");
}

function formatIssues(issues) {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
}
