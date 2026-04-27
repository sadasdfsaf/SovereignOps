import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { runCli } from "../src/index.ts";
import {
  isWorkspaceSessionApiReplayCommand,
  runWorkspaceSessionApiReplayCli,
} from "../src/workspaceSessionApiReplay.ts";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const tempDir = fileURLToPath(
  new URL("../.tmp-workspace-session-api-replay/", import.meta.url),
);

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

test("replays workspace session API fixtures with a local mocked dispatcher", async () => {
  const fixture = await writeFixture("workspace-session-api-requests.json", validFixture());
  const result = await runWorkspaceSessionApiReplayCli(
    [
      "workspace",
      "session",
      "api",
      "replay",
      "--fixture",
      fixture,
    ],
    {
      dispatch: mockedDispatcher,
    },
  );
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.kind, "workspace-session-api-fixture-replay");
  assert.equal(payload.schemaVersion, "workspace-session-api-requests/v1");
  assert.equal(payload.fixture.path, "packages/cli/.tmp-workspace-session-api-replay/workspace-session-api-requests.json");
  assert.deepEqual(payload.filters, {});
  assert.equal(payload.totalRequests, 3);
  assert.equal(payload.replayedRequests, 3);
  assert.equal(payload.passedRequests, 3);
  assert.equal(payload.failedRequests, 0);
  assert.deepEqual(payload.summary.methods, { GET: 1, POST: 2 });
  assert.deepEqual(payload.summary.routes, {
    "/v1/workspace-session/export-bundle": 1,
    "/v1/workspace-session/workspaces": 2,
  });
  assert.deepEqual(payload.summary.mismatches, {});
  assert.deepEqual(
    payload.requests.map((request) => [
      request.id,
      request.actual.status,
      request.matches.status,
      request.matches.expectation,
    ]),
    [
      ["api_workspace_session_list", 200, true, true],
      ["api_workspace_session_create", 201, true, true],
      ["api_workspace_session_export_bundle", 200, true, true],
    ],
  );
  assert.equal(payload.requests[0].request.headers.authorization, "[REDACTED]");
  assert.equal(payload.requests[0].request.body.sessionSecret, "[REDACTED]");
  assert.equal(payload.requests[0].request.body.tracePath, "[redacted-path]");
  assert.equal(payload.requests[0].actual.body.debugPath, "[redacted-path]");
  assert.equal(payload.requests[0].actual.body.sessionToken, "[REDACTED]");
  assertNoLeak(result.stdout);
});

test("filters workspace session API replay by method, route, and id through the package entrypoint", async () => {
  const fixture = await writeFixture("filterable-workspace-session-api-requests.json", validFixture());
  const seen = [];
  const result = await runCli(
    [
      "workspace-session",
      "api",
      "replay",
      "--fixture",
      fixture,
      "--method",
      "post",
      "--route",
      "/v1/workspace-session/export-bundle",
      "--id",
      "api_workspace_session_export_bundle",
    ],
    {
      dispatch: async (request) => {
        seen.push(`${request.method} ${request.path}`);
        return mockedDispatcher(request);
      },
    },
  );
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(payload.filters, {
    id: "api_workspace_session_export_bundle",
    method: "POST",
    route: "/v1/workspace-session/export-bundle",
  });
  assert.equal(payload.totalRequests, 3);
  assert.equal(payload.replayedRequests, 1);
  assert.equal(payload.passedRequests, 1);
  assert.deepEqual(payload.summary.methods, { POST: 1 });
  assert.deepEqual(payload.summary.routes, {
    "/v1/workspace-session/export-bundle": 1,
  });
  assert.deepEqual(payload.requests.map((request) => request.id), [
    "api_workspace_session_export_bundle",
  ]);
  assert.deepEqual(seen, ["POST /v1/workspace-session/export-bundle"]);
});

test("redacts secret-like values and raw local paths from replay mismatches", async () => {
  const fixture = await writeFixture("workspace-session-api-mismatch.json", {
    schemaVersion: "workspace-session-api-requests/v1",
    generatedAt: "2026-04-27T12:00:00.000Z",
    requests: [
      {
        id: "api_workspace_session_mismatch",
        route: {
          method: "GET",
          path: "/v1/workspace-session/workspaces",
        },
        request: {
          headers: {
            authorization: "Bearer fixture-secret",
          },
          body: {
            tracePath: "C:/Users/DELL/session/raw.json",
          },
        },
        response: {
          status: 200,
          body: {
            kind: "workspace-session.workspaces",
            workspaces: [],
          },
        },
      },
    ],
  });
  const result = await runWorkspaceSessionApiReplayCli(
    [
      "workspace-session-api",
      "replay",
      "--fixture",
      fixture,
    ],
    {
      dispatch: async () => ({
        status: 500,
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
        body: {
          error: {
            code: "fixture_mismatch",
            message: "session token=raw-local-secret failed at C:/Users/DELL/session/raw.json",
          },
        },
      }),
    },
  );
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.passedRequests, 0);
  assert.equal(payload.failedRequests, 1);
  assert.deepEqual(payload.summary.mismatches, {
    body: 1,
    status: 1,
  });
  assert.equal(payload.requests[0].actual.body.error.message, "session token=[REDACTED] failed at [redacted-path]");
  assertNoLeak(result.stdout);
});

test("rejects unsafe workspace session API fixture paths as JSON-only errors", async () => {
  const unsafePath = path.resolve(workspaceRoot, "..", "outside.json");
  const result = await runWorkspaceSessionApiReplayCli([
    "workspace",
    "session",
    "api",
    "replay",
    "--fixture",
    unsafePath,
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stderr);

  assert.equal(result.exitCode, 2);
  assert.equal(result.stdout, "");
  assert.equal(payload.error.code, "usage_error");
  assert.match(payload.error.message, /must stay inside/);
});

test("reports malformed workspace session API fixtures as JSON-only errors", async () => {
  const invalidPath = await writeFixture("invalid-workspace-session-api.json", {
    schemaVersion: "workspace-session-api-requests/v1",
    generatedAt: "2026-04-27T12:15:00.000Z",
    requests: [{ id: "api_missing_route" }],
  });
  const result = await runWorkspaceSessionApiReplayCli([
    "workspace-session",
    "api",
    "replay",
    "--fixture",
    invalidPath,
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stderr);

  assert.equal(result.exitCode, 2);
  assert.equal(result.stdout, "");
  assert.equal(payload.error.code, "invalid_fixture");
  assert.match(payload.error.message, /fixture\.requests\[0\]\.route/);
});

test("detects workspace session API replay command aliases", () => {
  assert.equal(isWorkspaceSessionApiReplayCommand(["workspace", "session", "api", "replay"]), true);
  assert.equal(isWorkspaceSessionApiReplayCommand(["workspace-session", "api", "replay"]), true);
  assert.equal(isWorkspaceSessionApiReplayCommand(["workspace-session-api", "replay"]), true);
  assert.equal(isWorkspaceSessionApiReplayCommand(["workspace", "list"]), false);
});

async function mockedDispatcher(request) {
  if (request.method === "GET" && request.path === "/v1/workspace-session/workspaces") {
    return {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
      body: {
        kind: "workspace-session.workspaces",
        workspaces: [
          {
            workspaceId: "wsp_notes_lab",
            name: "Notes Lab",
          },
        ],
        debugPath: "C:/Users/DELL/session/debug.json",
        sessionToken: "token=raw-local-secret",
      },
    };
  }

  if (request.method === "POST" && request.path === "/v1/workspace-session/workspaces") {
    return {
      status: 201,
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
      body: {
        kind: "workspace-session.workspace",
        workspace: {
          workspaceId: request.body.workspaceId,
          name: request.body.name,
        },
      },
    };
  }

  if (request.method === "POST" && request.path === "/v1/workspace-session/export-bundle") {
    return {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
      body: {
        kind: "workspace-session.bundle",
        bundle: {
          format: "sovereignops.workspace.bundle",
          workspace: {
            workspaceId: request.body.workspaceId,
          },
          events: [],
        },
      },
    };
  }

  return {
    status: 404,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
    body: {
      error: {
        code: "not_found",
      },
    },
  };
}

function validFixture() {
  return {
    schemaVersion: "workspace-session-api-requests/v1",
    generatedAt: "2026-04-27T11:30:00.000Z",
    apiBase: "local://workspace-session-api",
    requests: [
      {
        id: "api_workspace_session_list",
        title: "List isolated workspaces",
        route: {
          method: "GET",
          path: "/v1/workspace-session/workspaces",
        },
        request: {
          headers: {
            authorization: "Bearer fixture-secret",
          },
          body: {
            sessionSecret: "raw-local-secret",
            tracePath: "C:/Users/DELL/session/list.json",
          },
        },
        expect: {
          status: 200,
          contentType: "application/json",
          kind: "workspace-session.workspaces",
          workspaceCount: 1,
        },
      },
      {
        id: "api_workspace_session_create",
        title: "Create an isolated workspace",
        route: {
          method: "POST",
          path: "/v1/workspace-session/workspaces",
        },
        request: {
          body: {
            workspaceId: "wsp_notes_lab",
            name: "Notes Lab",
            deviceId: "dev_laptop_alpha",
            rootKeyRef: "key_notes_lab",
          },
        },
        expect: {
          status: 201,
          contentType: "application/json",
          kind: "workspace-session.workspace",
          workspaceId: "wsp_notes_lab",
        },
      },
      {
        id: "api_workspace_session_export_bundle",
        title: "Export an isolated workspace bundle",
        route: {
          method: "POST",
          path: "/v1/workspace-session/export-bundle",
        },
        request: {
          body: {
            workspaceId: "wsp_notes_lab",
          },
        },
        expect: {
          status: 200,
          contentType: "application/json",
          kind: "workspace-session.bundle",
          eventCount: 0,
        },
      },
    ],
  };
}

async function writeFixture(name, value) {
  await mkdir(tempDir, { recursive: true });
  const outputPath = path.join(tempDir, name);
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`);
  return outputPath;
}

function assertNoLeak(text) {
  assert.equal(text.includes("Bearer fixture-secret"), false);
  assert.equal(text.includes("raw-local-secret"), false);
  assert.equal(text.includes("C:/Users/DELL"), false);
}
