import assert from "node:assert/strict";
import test from "node:test";

import { createApiRouter } from "../src/router.ts";
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

const baseEvent = {
  workspaceId: "wsp_alpha",
  deviceId: "dev_laptop",
  type: "note.updated",
  payload: { title: "Local notes", tags: ["draft"] },
  createdAt: "2026-04-27T00:00:00.000Z",
};

test("mounts sync routes and dispatches upload, download, and cursor requests", async () => {
  const router = createApiRouter();
  mountSyncRoutes(router, createSyncHttpHandlers({ repository: createFakeSyncRepository() }));

  assert.deepEqual(
    router.listRoutes().map((route) => `${route.method} ${route.path}`),
    [
      "GET /sync/health",
      "POST /sync/cursor",
      "POST /sync/download",
      "POST /sync/upload",
    ],
  );

  const missing = await router.dispatch({ method: "GET", path: "/sync/missing" });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, "API_ROUTE_NOT_FOUND");

  const upload = createUploadBatch({
    workspaceId: "wsp_alpha",
    deviceId: "dev_laptop",
    baseCursor: INITIAL_CURSOR,
    events: [{ ...baseEvent, id: "evt_001", sequence: 1 }],
  });

  const uploadResponse = await router.dispatch({
    method: "POST",
    path: "/sync/upload",
    body: upload,
  });
  assert.equal(uploadResponse.status, 201);
  assert.deepEqual(uploadResponse.body.acceptedEventIds, ["evt_001"]);

  const downloadResponse = await router.dispatch({
    method: "POST",
    path: "/sync/download",
    body: {
      workspaceId: "wsp_alpha",
      deviceId: "dev_tablet",
      afterCursor: INITIAL_CURSOR,
      limit: 10,
    },
  });
  assert.equal(downloadResponse.status, 200);
  assert.deepEqual(
    downloadResponse.body.events.map((event) => event.id),
    ["evt_001"],
  );
  assert.equal(downloadResponse.body.hasMore, false);

  const cursorResponse = await router.dispatch({
    method: "POST",
    path: "/sync/cursor",
    body: {
      workspaceId: "wsp_alpha",
      deviceId: "dev_laptop",
      cursor: INITIAL_CURSOR,
    },
  });
  assert.equal(cursorResponse.status, 200);
  assert.equal(cursorResponse.body.stale, true);
  assert.equal(cursorResponse.body.currentCursor, uploadResponse.body.cursor);
});

test("mounts MCP routes for resource list, resource read, and tool preview", async () => {
  const resourceUri = "sovereignops://docs/local-notes";
  const router = createApiRouter();
  const adapter = createGatewayResourceAdapter({
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
  });

  mountMcpRoutes(router, {
    adapter,
    executeToolPreview: (request) =>
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
      }),
  });

  const listResponse = await router.dispatch({
    method: "GET",
    path: "/mcp/resources",
  });
  assert.equal(listResponse.status, 200);
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
    path: "/mcp/resources/read",
    body: { uri: resourceUri },
  });
  assert.equal(readResponse.status, 200);
  assert.deepEqual(readResponse.body.contents, [
    {
      uri: resourceUri,
      mimeType: "text/plain",
      text: "ready for review",
      blob: undefined,
      trust: "trusted",
      safety: {
        schemaVersion: 1,
        scope: "mcp_resource_content",
        trustLevel: "trusted",
        action: "mark_only",
        reasons: [
          "No prompt-injection heuristic findings detected in scanned text.",
        ],
        findings: [],
      },
    },
  ]);

  const previewResponse = await router.dispatch({
    method: "POST",
    path: "/mcp/tools/execute-preview",
    actorId: "act_local",
    body: {
      toolName: "create_task_proposal",
      arguments: { title: "Review local notes" },
      metadata: { source: "route-test" },
    },
  });
  assert.equal(previewResponse.status, 200);
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

test("returns standard JSON errors for MCP misses and validation failures", async () => {
  const router = createApiRouter();
  mountMcpRoutes(router, {
    adapter: createGatewayResourceAdapter({
      resources: new GatewayResourceRegistry([]),
      policy: () => "allow",
    }),
    executeToolPreview: () => {
      throw new Error("should not run");
    },
  });

  const missingResource = await router.dispatch({
    method: "POST",
    path: "/mcp/resources/read",
    body: { uri: "sovereignops://docs/missing" },
  });
  assert.equal(missingResource.status, 404);
  assert.deepEqual(missingResource.headers, {
    "content-type": "application/json; charset=utf-8",
  });
  assert.deepEqual(missingResource.body, {
    error: {
      code: "resource_not_found",
      message: "No gateway resource found for sovereignops://docs/missing",
      details: {
        uri: "sovereignops://docs/missing",
        capability: "read_object",
      },
    },
  });

  const badPreview = await router.dispatch({
    method: "POST",
    path: "/mcp/tools/execute-preview",
    body: {
      toolName: "create_task_proposal",
      arguments: "not-an-object",
    },
  });
  assert.equal(badPreview.status, 400);
  assert.deepEqual(badPreview.body, {
    error: {
      code: "validation_failed",
      message: "Tool preview arguments must be an object.",
      details: { path: "body.arguments" },
    },
  });
});

function createFakeSyncRepository() {
  let currentCursor = INITIAL_CURSOR;
  const syncedEvents = [];

  return {
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
