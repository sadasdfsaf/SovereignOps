import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  createApiRouter,
  createHealthRoute,
  jsonError,
  jsonResponse,
} from "../src/router.ts";
import { mountMcpRoutes } from "../src/mcpRoutes.ts";
import { mountSyncRoutes } from "../src/syncRoutes.ts";
import {
  createUploadBatch,
  selectDownloadWindow,
} from "../../../services/sync/src/bundles.ts";
import {
  INITIAL_CURSOR,
  advanceCursor,
  compareCursors,
} from "../../../services/sync/src/cursors.ts";
import { createSyncHttpHandlers } from "../../../services/sync/src/http.ts";
import { createGatewayResourceAdapter } from "../../../services/mcp-gateway/src/adapter.ts";
import { GatewayResourceRegistry } from "../../../services/mcp-gateway/src/resources.ts";
import { executeToolCall } from "../../../services/mcp-gateway/src/tools.ts";

const fixedNow = Date.parse("2026-04-27T00:00:00.000Z");
const resourceUri = "sovereignops://docs/local-notes";

const baseEvent = {
  workspaceId: "wsp_alpha",
  deviceId: "dev_laptop",
  type: "note.updated",
  payload: { title: "Local notes", tags: ["draft"] },
  createdAt: "2026-04-27T00:00:00.000Z",
};

test("documented OpenAPI sync and MCP operations are mounted by public routes", () => {
  const router = createPublicContractRouter();
  const routeKeys = new Set(router.listRoutes().map(routeKey));
  const operations = readOpenApiOperations();

  const expectedOperations = new Map([
    ["getHealth", "GET /health"],
    ["uploadSyncBundle", "POST /v1/sync/bundles"],
    ["downloadSyncWindow", "POST /v1/sync/download"],
    ["getSyncCursorStatus", "POST /v1/sync/cursor-status"],
    ["listMcpResources", "GET /v1/mcp/resources"],
    ["readMcpResource", "POST /v1/mcp/resources/read"],
    ["executeMcpToolPreview", "POST /v1/mcp/tools/execute"],
  ]);

  for (const [operationId, expectedRouteKey] of expectedOperations) {
    const operation = operations.get(operationId);
    assert.ok(operation, `OpenAPI operation ${operationId} is missing`);
    assert.equal(routeKey(operation), expectedRouteKey);
    assert.ok(routeKeys.has(expectedRouteKey), `${expectedRouteKey} is not mounted`);
  }
});

test("JSON errors keep a stable envelope across router, sync, and MCP routes", async () => {
  const router = createPublicContractRouter();

  const missing = await router.dispatch({ method: "GET", path: "/v1/unknown?x=1#fragment" });
  assertJsonError(missing, 404, "API_ROUTE_NOT_FOUND");
  assert.equal(missing.body.error.message, "No API route found for GET /v1/unknown");

  const badSync = await router.dispatch({
    method: "POST",
    path: "/v1/sync/download",
    body: {
      workspaceId: "wsp_alpha",
      deviceId: "dev_laptop",
      afterCursor: "not-a-cursor",
      limit: 10,
    },
  });
  assertJsonError(badSync, 400, "malformed_cursor");
  assert.deepEqual(
    badSync.body.error.details.issues.map(issue => issue.path),
    ["afterCursor"],
  );

  const badMcp = await router.dispatch({
    method: "POST",
    path: "/v1/mcp/tools/execute",
    body: {
      toolName: "create_task_proposal",
      arguments: "not-an-object",
    },
  });
  assertJsonError(badMcp, 400, "validation_failed");
  assert.deepEqual(badMcp.body.error.details, { path: "body.arguments" });
});

test("sync public routes preserve upload, download, and cursor contracts", async () => {
  const router = createPublicContractRouter();
  const upload = createUploadBatch({
    workspaceId: "wsp_alpha",
    deviceId: "dev_laptop",
    baseCursor: INITIAL_CURSOR,
    events: [{ ...baseEvent, id: "evt_contract_001", sequence: 1 }],
  });

  const uploadResponse = await router.dispatch({
    method: "POST",
    path: "/v1/sync/bundles",
    body: upload,
  });
  const expectedCursor = advanceCursor(INITIAL_CURSOR, ["evt_contract_001"]);
  assertJsonResponse(uploadResponse, 201);
  assert.deepEqual(uploadResponse.body, {
    workspaceId: "wsp_alpha",
    deviceId: "dev_laptop",
    cursor: expectedCursor,
    acceptedEventIds: ["evt_contract_001"],
  });

  const downloadResponse = await router.dispatch({
    method: "POST",
    path: "/v1/sync/download",
    body: {
      workspaceId: "wsp_alpha",
      deviceId: "dev_tablet",
      afterCursor: INITIAL_CURSOR,
      limit: 10,
    },
  });
  assertJsonResponse(downloadResponse, 200);
  assert.equal(downloadResponse.body.workspaceId, "wsp_alpha");
  assert.equal(downloadResponse.body.afterCursor, INITIAL_CURSOR);
  assert.equal(downloadResponse.body.nextCursor, expectedCursor);
  assert.equal(downloadResponse.body.hasMore, false);
  assert.deepEqual(
    downloadResponse.body.events.map(event => [event.id, event.cursor]),
    [["evt_contract_001", expectedCursor]],
  );

  const cursorResponse = await router.dispatch({
    method: "POST",
    path: "/v1/sync/cursor-status",
    body: {
      workspaceId: "wsp_alpha",
      deviceId: "dev_laptop",
      cursor: INITIAL_CURSOR,
    },
  });
  assertJsonResponse(cursorResponse, 200);
  assert.deepEqual(cursorResponse.body, {
    workspaceId: "wsp_alpha",
    deviceId: "dev_laptop",
    cursor: INITIAL_CURSOR,
    currentCursor: expectedCursor,
    stale: true,
  });
});

test("MCP public routes preserve resource and safe tool preview contracts", async () => {
  const router = createPublicContractRouter();

  const listResponse = await router.dispatch({
    method: "GET",
    path: "/v1/mcp/resources",
  });
  assertJsonResponse(listResponse, 200);
  assert.deepEqual(listResponse.body.resources, [
    {
      uri: resourceUri,
      name: "Local Notes",
      description: "Draft notes for local review.",
      mimeType: "text/plain",
    },
  ]);

  const readResponse = await router.dispatch({
    method: "POST",
    path: "/v1/mcp/resources/read",
    body: { uri: resourceUri },
  });
  assertJsonResponse(readResponse, 200);
  assert.deepEqual(
    readResponse.body.contents.map(({ uri, mimeType, text }) => ({ uri, mimeType, text })),
    [{ uri: resourceUri, mimeType: "text/plain", text: "ready for review" }],
  );

  const previewResponse = await router.dispatch({
    method: "POST",
    path: "/v1/mcp/tools/execute",
    actorId: "act_local",
    body: {
      toolName: "create_task_proposal",
      arguments: { title: "Review local notes", priority: "normal" },
      metadata: { source: "api-contract-test" },
    },
  });
  assertJsonResponse(previewResponse, 200);
  assert.deepEqual(previewResponse.body, {
    status: "executed",
    toolName: "create_task_proposal",
    policy: {
      decision: "allow",
      toolName: "create_task_proposal",
      ruleId: "allow-preview",
    },
    output: {
      kind: "task_proposal",
      title: "Review local notes",
      actorId: "act_local",
      durableSideEffects: false,
    },
  });
});

test("router dispatch normalizes requests deterministically without mutating callers", async () => {
  const router = createApiRouter();
  router.register({
    method: "GET",
    path: "/items/:itemId",
    description: "Reads a local item.",
    handler: ({ params, request }) => {
      assert.throws(() => {
        request.headers.token = "mutated";
      }, TypeError);

      return jsonResponse(200, {
        method: request.method,
        path: request.path,
        itemId: params.itemId,
        token: request.headers.token,
      });
    },
  });

  const request = {
    method: "get",
    path: "//items/item%201/?ignored=1#fragment",
    headers: { token: "local-token" },
  };
  const first = await router.dispatch(request);
  const second = await router.dispatch({ ...request, headers: { ...request.headers } });

  assert.deepEqual(first, second);
  assert.deepEqual(first.body, {
    method: "GET",
    path: "/items/item%201",
    itemId: "item 1",
    token: "local-token",
  });
  assert.deepEqual(request, {
    method: "get",
    path: "//items/item%201/?ignored=1#fragment",
    headers: { token: "local-token" },
  });
});

test("error bodies redact sensitive values from messages and details", async () => {
  const secret = "sk_live_contract_secret_123456";
  const router = createPublicContractRouter({
    mcpDependencies: createMcpDependencies({
      executeToolPreview: () => {
        throw new Error(`Tool preview failed with apiKey=${secret}`);
      },
    }),
  });

  const response = await router.dispatch({
    method: "POST",
    path: "/v1/mcp/tools/execute",
    body: {
      toolName: "create_task_proposal",
      arguments: { apiKey: secret },
    },
  });
  assertJsonError(response, 400, "tool_preview_failed");
  assert.equal(JSON.stringify(response.body).includes(secret), false);
  assert.match(response.body.error.message, /\[REDACTED\]/);

  const direct = jsonError(400, "validation_failed", "Rejected token=tok_contract_secret_123456", {
    apiKey: secret,
    nested: { sessionToken: secret },
  });
  assert.equal(JSON.stringify(direct.body).includes(secret), false);
  assert.equal(direct.body.error.details.apiKey, "[REDACTED]");
  assert.deepEqual(direct.body.error.details.nested, { sessionToken: "[REDACTED]" });
});

function createPublicContractRouter(options = {}) {
  const router = createApiRouter([
    createHealthRoute({ ok: true, service: "sovereignops-local-api" }),
  ]);

  mountSyncRoutes(
    router,
    createSyncHttpHandlers({
      now: () => fixedNow,
      repository: options.syncRepository ?? createFakeSyncRepository(),
    }),
    { basePath: "/v1/sync", pathStyle: "openapi" },
  );
  mountMcpRoutes(
    router,
    options.mcpDependencies ?? createMcpDependencies(),
    { basePath: "/v1/mcp", pathStyle: "openapi" },
  );

  return router;
}

function createMcpDependencies(overrides = {}) {
  return {
    adapter: overrides.adapter ?? createGatewayResourceAdapter({
      resources: new GatewayResourceRegistry([
        {
          uri: resourceUri,
          name: "Local Notes",
          description: "Draft notes for local review.",
          mimeType: "text/plain",
          read: ({ uri }) => ({ uri, text: "ready for review" }),
        },
      ]),
      policy: () => "allow",
    }),
    executeToolPreview: overrides.executeToolPreview ?? ((request) =>
      executeToolCall({
        toolName: request.toolName,
        arguments: request.arguments,
        actor: request.actor,
        metadata: request.metadata,
        handlers: {
          create_task_proposal: (args, context) => ({
            kind: "task_proposal",
            title: args.title,
            actorId: context.actor?.id,
            durableSideEffects: false,
          }),
        },
        policy: () => ({ decision: "allow", ruleId: "allow-preview" }),
      })),
  };
}

function createFakeSyncRepository() {
  let currentCursor = INITIAL_CURSOR;
  const syncedEvents = [];

  return {
    health() {
      return { mode: "memory" };
    },
    uploadBundle(batch) {
      const acceptedEventIds = [];

      for (const event of batch.events) {
        currentCursor = advanceCursor(currentCursor, [event.id]);
        acceptedEventIds.push(event.id);
        syncedEvents.push({
          ...event,
          payload: JSON.parse(JSON.stringify(event.payload)),
          cursor: currentCursor,
        });
      }

      return {
        workspaceId: batch.workspaceId,
        deviceId: batch.deviceId,
        cursor: currentCursor,
        acceptedEventIds,
      };
    },
    downloadBundle(request) {
      return selectDownloadWindow(syncedEvents, request);
    },
    getCursorStatus(request) {
      return {
        ...request,
        currentCursor,
        stale: compareCursors(request.cursor, currentCursor) < 0,
      };
    },
  };
}

function readOpenApiOperations() {
  const path = fileURLToPath(new URL("../../../docs/openapi.yaml", import.meta.url));
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const operations = new Map();
  let inPaths = false;
  let currentPath;
  let currentOperation;

  for (const line of lines) {
    if (line === "paths:") {
      inPaths = true;
      continue;
    }
    if (inPaths && line === "components:") {
      break;
    }
    if (!inPaths) {
      continue;
    }

    const pathMatch = /^  (\/[^:]+):$/.exec(line);
    if (pathMatch) {
      currentPath = pathMatch[1];
      currentOperation = undefined;
      continue;
    }

    const methodMatch = /^    (get|post|put|patch|delete):$/.exec(line);
    if (methodMatch && currentPath) {
      currentOperation = {
        method: methodMatch[1].toUpperCase(),
        path: openApiPathToRoutePath(currentPath),
      };
      continue;
    }

    const operationIdMatch = /^      operationId:\s*([A-Za-z][A-Za-z0-9_]*)\s*$/.exec(line);
    if (operationIdMatch && currentOperation) {
      operations.set(operationIdMatch[1], currentOperation);
    }
  }

  return operations;
}

function openApiPathToRoutePath(path) {
  return path.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, ":$1");
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

function routeKey(route) {
  return `${route.method} ${route.path}`;
}
