import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  createPluginReviewArtifactApiDispatcher,
  isPluginReviewArtifactApiReplayCommand,
  runPluginReviewArtifactApiReplayCli,
} from "../src/pluginReviewArtifactApiReplay.ts";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const fixturePath = fileURLToPath(
  new URL(
    "../../../examples/plugins/release-notes/review-artifact-api-requests.json",
    import.meta.url,
  ),
);
const tempDir = fileURLToPath(
  new URL("../.tmp-plugin-review-artifact-api-replay/", import.meta.url),
);

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

test("replays plugin review artifact API fixtures through the local dispatcher", async () => {
  const result = await runPluginReviewArtifactApiReplayCli([
    "plugin",
    "review",
    "artifact",
    "api",
    "replay",
    "--fixture",
    fixturePath,
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.kind, "plugin-review-artifact-api-fixture-replay");
  assert.equal(payload.schemaVersion, "plugin-review-artifact-api-requests.v1");
  assert.equal(payload.fixture.path, "examples/plugins/release-notes/review-artifact-api-requests.json");
  assert.equal(payload.totalRequests, 2);
  assert.equal(payload.replayedRequests, 2);
  assert.equal(payload.passedRequests, 2);
  assert.equal(payload.failedRequests, 0);
  assert.deepEqual(payload.summary.methods, { POST: 2 });
  assert.deepEqual(payload.summary.routes, {
    "/v1/plugins/review-artifacts/preview": 2,
  });
  assert.deepEqual(payload.summary.actualStatuses, { 200: 1, 400: 1 });
  assert.deepEqual(payload.summary.expectedStatuses, { 200: 1, 400: 1 });
  assert.deepEqual(payload.summary.mismatches, {});
  assert.deepEqual(
    payload.requests.map((request) => [
      request.id,
      request.path,
      request.actual.status,
      request.matches.status,
      request.matches.expectation,
    ]),
    [
      [
        "api_plugin_review_artifact_preview_release_notes",
        "/v1/plugins/review-artifacts/preview",
        200,
        true,
        true,
      ],
      [
        "api_plugin_review_artifact_preview_invalid_manifest",
        "/v1/plugins/review-artifacts/preview",
        400,
        true,
        true,
      ],
    ],
  );
  assert.equal(payload.requests[0].actual.body.kind, "plugin-review-artifact.preview");
  assert.equal(payload.requests[0].actual.body.plugin.id, "plugin.release-notes.local-draft");
  assert.equal(payload.requests[0].actual.body.summary.redactionCount, 3);
  assert.equal(payload.requests[1].actual.body.error.code, "invalid_plugin_review_artifact");

  for (const secret of [
    "super-secret-token",
    "Bearer replay-fixture-token",
    "Bearer fixture-review-token",
    "session-secret",
  ]) {
    assert.equal(result.stdout.includes(secret), false, `stdout leaked ${secret}`);
  }
  assert.equal(payload.requests[0].request.headers.authorization, "[REDACTED]");
});

test("filters plugin review artifact API fixture replay by route and id", async () => {
  const result = await runPluginReviewArtifactApiReplayCli([
    "plugin-review-artifact-api",
    "replay",
    "--fixture",
    fixturePath,
    "--route",
    "/v1/plugins/review-artifacts/preview",
    "--id",
    "api_plugin_review_artifact_preview_release_notes",
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(payload.filters, {
    id: "api_plugin_review_artifact_preview_release_notes",
    route: "/v1/plugins/review-artifacts/preview",
  });
  assert.equal(payload.totalRequests, 2);
  assert.equal(payload.replayedRequests, 1);
  assert.equal(payload.passedRequests, 1);
  assert.deepEqual(payload.summary.routes, {
    "/v1/plugins/review-artifacts/preview": 1,
  });
  assert.deepEqual(payload.requests.map((request) => request.id), [
    "api_plugin_review_artifact_preview_release_notes",
  ]);
});

test("detects plugin review artifact API replay commands", () => {
  assert.equal(isPluginReviewArtifactApiReplayCommand(["plugin", "review", "artifact", "api", "replay"]), true);
  assert.equal(isPluginReviewArtifactApiReplayCommand(["plugin", "review-artifact", "api", "replay"]), true);
  assert.equal(isPluginReviewArtifactApiReplayCommand(["plugin-review-artifact", "api", "replay"]), true);
  assert.equal(isPluginReviewArtifactApiReplayCommand(["plugin-review-artifact-api", "replay"]), true);
  assert.equal(isPluginReviewArtifactApiReplayCommand(["plugin-review-artifact", "preview"]), false);
});

test("supports an injected dispatcher without network access", async () => {
  const fixture = await writeFixture("injected-dispatcher.json", {
    schemaVersion: "plugin-review-artifact-api-requests.v1",
    generatedAt: "2026-04-27T10:00:00.000Z",
    requests: [
      {
        id: "api_injected_dispatcher",
        route: {
          method: "POST",
          path: "/v1/plugins/review-artifacts/preview",
        },
        request: {
          body: {
            ok: true,
          },
        },
        expect: {
          status: 202,
          contentType: "application/json",
          kind: "fixture.injected",
        },
      },
    ],
  });
  const result = await runPluginReviewArtifactApiReplayCli(
    [
      "plugin-review-artifact-api",
      "replay",
      "--fixture",
      fixture,
    ],
    {
      dispatch: async (request) => ({
        status: 202,
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
        body: {
          kind: "fixture.injected",
          route: request.path,
        },
      }),
    },
  );
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.passedRequests, 1);
  assert.equal(payload.requests[0].actual.status, 202);
  assert.equal(payload.requests[0].actual.body.kind, "fixture.injected");
});

test("rejects unsafe plugin review artifact API fixture paths as JSON-only errors", async () => {
  const unsafePath = path.resolve(workspaceRoot, "..", "outside.json");
  const result = await runPluginReviewArtifactApiReplayCli([
    "plugin-review-artifact-api",
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

test("reports malformed plugin review artifact API fixtures as JSON-only errors", async () => {
  const invalidPath = await writeFixture("invalid-plugin-review-artifact-api.json", {
    schemaVersion: "plugin-review-artifact-api-requests.v1",
    generatedAt: "2026-04-27T10:15:00.000Z",
    requests: [{ id: "api_missing_route" }],
  });
  const result = await runPluginReviewArtifactApiReplayCli([
    "plugin-review-artifact-api",
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

test("local dispatcher returns JSON API errors for missing routes", async () => {
  const dispatcher = createPluginReviewArtifactApiDispatcher();
  const response = await dispatcher({
    method: "POST",
    path: "/v1/plugins/review-artifacts/missing",
    body: {},
  });

  assert.equal(response.status, 404);
  assert.equal(response.headers["content-type"].startsWith("application/json"), true);
  assert.equal(response.body.error.code, "API_ROUTE_NOT_FOUND");
});

async function writeFixture(name, value) {
  await mkdir(tempDir, { recursive: true });
  const outputPath = path.join(tempDir, name);
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`);
  return outputPath;
}
