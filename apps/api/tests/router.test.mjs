import assert from "node:assert/strict";
import test from "node:test";

import {
  RouteConflictError,
  RouteValidationError,
  createApiRouter,
  createHealthRoute,
  jsonError,
  jsonResponse,
} from "../src/router.ts";

test("dispatches health route and lists stable metadata", async () => {
  const router = createApiRouter([
    createHealthRoute({ ok: true, service: "api" }),
  ]);

  const response = await router.dispatch({ method: "get", path: "/health?x=1" });

  assert.equal(response.status, 200);
  assert.equal(response.headers["content-type"], "application/json; charset=utf-8");
  assert.deepEqual(response.body, { ok: true, service: "api" });
  assert.deepEqual(router.listRoutes(), [
    {
      method: "GET",
      path: "/health",
      description: "Reports local API readiness.",
    },
  ]);
});

test("matches parameter routes and freezes request headers", async () => {
  const router = createApiRouter();
  router.register({
    method: "POST",
    path: "/workspaces/:workspaceId/events/:eventId",
    description: "Accepts a local workspace event.",
    handler: ({ params, request }) =>
      jsonResponse(202, {
        workspaceId: params.workspaceId,
        eventId: params.eventId,
        token: request.headers?.token,
      }),
  });

  const response = await router.dispatch({
    method: "POST",
    path: "/workspaces/wsp_alpha/events/evt_001/",
    headers: { token: "local-token" },
  });

  assert.equal(response.status, 202);
  assert.deepEqual(response.body, {
    workspaceId: "wsp_alpha",
    eventId: "evt_001",
    token: "local-token",
  });
});

test("returns standard not-found and custom error bodies", async () => {
  const router = createApiRouter();
  const missing = await router.dispatch({ method: "GET", path: "/missing" });

  assert.deepEqual(missing, {
    status: 404,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: {
      error: {
        code: "API_ROUTE_NOT_FOUND",
        message: "No API route found for GET /missing",
      },
    },
  });

  assert.deepEqual(jsonError(400, "BAD_INPUT", "Input failed validation.", { path: "body" }).body, {
    error: {
      code: "BAD_INPUT",
      message: "Input failed validation.",
      details: { path: "body" },
    },
  });
});

test("rejects duplicate routes and invalid path parameters", () => {
  const router = createApiRouter([createHealthRoute()]);

  assert.throws(() => router.register(createHealthRoute()), RouteConflictError);
  assert.throws(
    () =>
      router.register({
        method: "GET",
        path: "/bad/:1",
        description: "Invalid path.",
        handler: () => jsonResponse(200, {}),
      }),
    RouteValidationError,
  );
  assert.throws(
    () =>
      router.register({
        method: "TRACE",
        path: "/trace",
        description: "Invalid method.",
        handler: () => jsonResponse(200, {}),
      }),
    RouteValidationError,
  );
});
