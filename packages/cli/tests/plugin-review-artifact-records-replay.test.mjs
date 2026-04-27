import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { runCli } from "../src/index.ts";
import {
  isPluginReviewArtifactRecordsReplayCommand,
  loadPluginReviewArtifactRecordsRequests,
  runPluginReviewArtifactRecordsReplayCli,
} from "../src/pluginReviewArtifactRecordsReplay.ts";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const fixturePath = fileURLToPath(
  new URL(
    "../../../examples/plugins/release-notes/review-artifact-records-requests.json",
    import.meta.url,
  ),
);
const tempDir = fileURLToPath(
  new URL("../.tmp-plugin-review-artifact-records-replay/", import.meta.url),
);

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

test("prints plugin review artifact records replay help", async () => {
  const result = await runPluginReviewArtifactRecordsReplayCli([
    "plugin-review-artifact-records",
    "replay",
    "--help",
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.kind, "plugin-review-artifact-records-replay.help");
  assert.equal(payload.options.fixture.includes("records request fixture"), true);
  assert.equal(
    payload.usage.includes(
      "sovereignops plugin-review-artifact-records replay --fixture <path> [--route <path>] [--id <id>]",
    ),
    true,
  );
});

test("loads plugin review artifact records fixture requests with local fixture refs", async () => {
  const requests = await loadPluginReviewArtifactRecordsRequests(fixturePath);

  assert.equal(requests.length, 4);
  assert.equal(requests[0].method, "POST");
  assert.equal(requests[0].path, "/v1/plugins/review-artifacts/records");
  assert.equal(requests[0].body.record.id, "prar_release_notes_001");
  assert.equal(requests[0].body.record.artifact.kind, "plugin_review_artifact");
  assert.equal(requests[3].body.leftRecord.artifact.plugin.id, "plugin.release-notes.local-draft");
});

test("replays plugin review artifact records fixtures through the local dispatcher", async () => {
  const result = await runPluginReviewArtifactRecordsReplayCli([
    "plugin",
    "review",
    "artifact",
    "records",
    "replay",
    "--fixture",
    fixturePath,
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.kind, "plugin-review-artifact-records-replay");
  assert.equal(payload.schemaVersion, "plugin-review-artifact-records-requests.v1");
  assert.equal(
    payload.fixture.path,
    "examples/plugins/release-notes/review-artifact-records-requests.json",
  );
  assert.equal(payload.totalRequests, 4);
  assert.equal(payload.replayedRequests, 4);
  assert.equal(payload.passedRequests, 4);
  assert.equal(payload.failedRequests, 0);
  assert.deepEqual(payload.summary.endpoints, {
    compare: 1,
    create: 1,
    get: 1,
    list: 1,
  });
  assert.deepEqual(payload.summary.methods, { GET: 2, POST: 2 });
  assert.deepEqual(payload.summary.routes, {
    "/v1/plugins/review-artifacts/records": 2,
    "/v1/plugins/review-artifacts/records/compare": 1,
    "/v1/plugins/review-artifacts/records/prar_release_notes_001": 1,
  });
  assert.deepEqual(payload.summary.actualStatuses, { 200: 3, 201: 1 });
  assert.deepEqual(payload.summary.expectedStatuses, { 200: 3, 201: 1 });
  assert.deepEqual(payload.summary.mismatches, {});
  assert.deepEqual(
    payload.requests.map((request) => [
      request.id,
      request.endpoint,
      request.actual.status,
      request.matches.status,
      request.matches.expectation,
    ]),
    [
      [
        "api_plugin_review_artifact_records_create_release_notes",
        "create",
        201,
        true,
        true,
      ],
      [
        "api_plugin_review_artifact_records_list_release_notes",
        "list",
        200,
        true,
        true,
      ],
      [
        "api_plugin_review_artifact_records_get_release_notes",
        "get",
        200,
        true,
        true,
      ],
      [
        "api_plugin_review_artifact_records_compare_release_notes",
        "compare",
        200,
        true,
        true,
      ],
    ],
  );

  const [create, list, get, compare] = payload.requests;
  assert.equal(create.actual.body.kind, "plugin-review-artifact.record");
  assert.equal(create.actual.body.record.id, "prar_release_notes_001");
  assert.equal(create.actual.body.record.artifact.kind, "plugin_review_artifact");
  assert.equal(list.actual.body.kind, "plugin-review-artifact.records.list");
  assert.equal(list.actual.body.summary.recordCount, 1);
  assert.deepEqual(list.actual.body.summary.statuses, { persisted: 1 });
  assert.deepEqual(list.actual.body.summary.pluginIds, {
    "plugin.release-notes.local-draft": 1,
  });
  assert.equal(get.recordId, "prar_release_notes_001");
  assert.equal(get.actual.body.record.pluginId, "plugin.release-notes.local-draft");
  assert.equal(compare.actual.body.kind, "plugin-review-artifact.records.compare");
  assert.equal(compare.actual.body.matches, true);
  assert.equal(compare.actual.body.summary.differenceCount, 0);
});

test("package entrypoint filters plugin review artifact records replay by route and id", async () => {
  const result = await runCli([
    "plugin",
    "review-artifact",
    "records",
    "replay",
    "--fixture",
    fixturePath,
    "--route",
    "/v1/plugins/review-artifacts/records/compare?ignored=true",
    "--id",
    "api_plugin_review_artifact_records_compare_release_notes",
  ]);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.kind, "plugin-review-artifact-records-replay");
  assert.deepEqual(payload.filters, {
    id: "api_plugin_review_artifact_records_compare_release_notes",
    route: "/v1/plugins/review-artifacts/records/compare",
  });
  assert.equal(payload.totalRequests, 4);
  assert.equal(payload.replayedRequests, 1);
  assert.equal(payload.passedRequests, 1);
  assert.equal(payload.failedRequests, 0);
  assert.equal(payload.requests[0].endpoint, "compare");
  assert.equal(payload.requests[0].actual.status, 200);
  assert.deepEqual(payload.summary.mismatches, {});
});

test("detects plugin review artifact records replay command aliases", () => {
  assert.equal(
    isPluginReviewArtifactRecordsReplayCommand([
      "plugin",
      "review",
      "artifact",
      "records",
      "replay",
    ]),
    true,
  );
  assert.equal(
    isPluginReviewArtifactRecordsReplayCommand([
      "plugin",
      "review-artifact",
      "records",
      "replay",
    ]),
    true,
  );
  assert.equal(
    isPluginReviewArtifactRecordsReplayCommand([
      "plugin",
      "review-artifact-records",
      "replay",
    ]),
    true,
  );
  assert.equal(
    isPluginReviewArtifactRecordsReplayCommand([
      "plugin-review-artifact",
      "records",
      "replay",
    ]),
    true,
  );
  assert.equal(
    isPluginReviewArtifactRecordsReplayCommand([
      "plugin-review-artifact-records",
      "replay",
    ]),
    true,
  );
  assert.equal(
    isPluginReviewArtifactRecordsReplayCommand(["plugin-review-artifact", "preview"]),
    false,
  );
});

test("reports plugin review artifact records replay mismatches in JSON output", async () => {
  const mismatchPath = await writeFixture("mismatch.json", {
    schemaVersion: "plugin-review-artifact-records-requests.v1",
    generatedAt: "2026-04-27T13:25:00.000Z",
    requests: [
      {
        id: "api_plugin_review_artifact_records_mismatch",
        route: {
          method: "POST",
          path: "/v1/plugins/review-artifacts/records",
        },
        request: {
          body: {
            record: buildRecord("prar_mismatch_001"),
          },
        },
        expect: {
          status: 201,
          contentType: "application/json",
          kind: "plugin-review-artifact.record",
          body: {
            kind: "plugin-review-artifact.record",
            ok: true,
          },
        },
      },
    ],
  });

  const result = await runPluginReviewArtifactRecordsReplayCli(
    [
      "plugin-review-artifact-records",
      "replay",
      "--fixture",
      mismatchPath,
    ],
    {
      dispatch: async () => ({
        status: 202,
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
        body: {
          kind: "fixture.mismatch",
          ok: false,
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
    expectation: 1,
    status: 1,
  });
  assert.equal(payload.requests[0].matches.status, false);
  assert.equal(payload.requests[0].matches.body, false);
  assert.equal(payload.requests[0].matches.expectation, false);
  assert.deepEqual(payload.requests[0].expectationIssues, ["kind"]);
});

test("rejects private plugin review artifact records fixture paths as JSON-only errors", async () => {
  const unsafeCases = [
    {
      fixture: path.join(workspaceRoot, ".codex-private", "review-artifact-records.json"),
      message: /private workspace/,
    },
    {
      fixture: path.resolve(
        workspaceRoot,
        "..",
        "sovereignops-codex-pack",
        "review-artifact-records.json",
      ),
      message: /plan-pack/,
    },
  ];

  for (const unsafeCase of unsafeCases) {
    const result = await runPluginReviewArtifactRecordsReplayCli([
      "plugin-review-artifact-records",
      "replay",
      "--fixture",
      unsafeCase.fixture,
    ]);
    assert.ok(result);
    const payload = JSON.parse(result.stderr);

    assert.equal(result.exitCode, 2);
    assert.equal(result.stdout, "");
    assert.equal(payload.error.code, "usage_error");
    assert.match(payload.error.message, unsafeCase.message);
  }
});

test("redacts secret-like plugin review artifact records headers, bodies, and replay errors", async () => {
  const secretFixturePath = await writeFixture("secret-records.json", {
    schemaVersion: "plugin-review-artifact-records-requests.v1",
    generatedAt: "2026-04-27T13:30:00.000Z",
    requests: [
      {
        id: "api_plugin_review_artifact_records_secret_redaction",
        route: {
          method: "POST",
          path: "/v1/plugins/review-artifacts/records",
        },
        request: {
          headers: {
            authorization: "Bearer replay-secret-token-001",
            "x-fixture-scope": "public-release-notes-example",
          },
          body: {
            record: {
              ...buildRecord("prar_secret_001"),
              artifact: {
                kind: "plugin_review_artifact",
                note: "Use Bearer record-secret-token-002 only for redaction coverage.",
                apiToken: "fixture-api-token-003",
              },
              metadata: {
                sessionToken: "fixture-session-token-004",
              },
            },
          },
        },
        expect: {
          status: 201,
          contentType: "application/json",
          kind: "plugin-review-artifact.record",
          schemaVersion: "plugin-review-artifact-record/v1",
          recordId: "prar_secret_001",
        },
      },
      {
        id: "api_plugin_review_artifact_records_error_redaction",
        route: {
          method: "POST",
          path: "/v1/plugins/review-artifacts/records",
        },
        request: {
          body: {
            record: buildRecord("prar_error_001"),
          },
        },
        expect: {
          status: 500,
          contentType: "application/json",
          errorCode: "PLUGIN_REVIEW_ARTIFACT_RECORDS_DISPATCH_ERROR",
        },
      },
    ],
  });

  let calls = 0;
  const result = await runPluginReviewArtifactRecordsReplayCli(
    [
      "plugin-review-artifact-records",
      "replay",
      "--fixture",
      secretFixturePath,
    ],
    {
      dispatch: async (request) => {
        calls += 1;
        if (calls === 2) {
          throw new Error(
            "Dispatch failed with Bearer fixture-error-token-005 and apiKey=fixture-error-key-006.",
          );
        }
        return {
          status: 201,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "x-session-token": "fixture-response-token-007",
          },
          body: {
            kind: "plugin-review-artifact.record",
            schemaVersion: "plugin-review-artifact-record/v1",
            record: request.body.record,
          },
        };
      },
    },
  );
  assert.ok(result);
  const payload = JSON.parse(result.stdout);
  const create = payload.requests[0];
  const error = payload.requests[1];

  for (const secret of [
    "replay-secret-token-001",
    "record-secret-token-002",
    "fixture-api-token-003",
    "fixture-session-token-004",
    "fixture-error-token-005",
    "fixture-error-key-006",
    "fixture-response-token-007",
  ]) {
    assert.equal(result.stdout.includes(secret), false, `stdout leaked ${secret}`);
  }

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(create.request.headers.authorization, "[REDACTED]");
  assert.match(create.request.body.record.artifact.note, /\[REDACTED\]/);
  assert.equal(create.request.body.record.artifact.apiToken, "[REDACTED]");
  assert.equal(create.request.body.record.metadata.sessionToken, "[REDACTED]");
  assert.equal(create.actual.headers["x-session-token"], "[REDACTED]");
  assert.equal(create.actual.body.record.artifact.apiToken, "[REDACTED]");
  assert.match(error.actual.body.error.message, /\[REDACTED\]/);
  assert.equal(error.matches.expectation, true);
  assert.ok(create.redactions.length >= 5);
  assert.ok(error.redactions.length >= 1);
});

function buildRecord(id) {
  return {
    id,
    status: "persisted",
    pluginId: "plugin.release-notes.local-draft",
    artifactId: `${id}.artifact`,
    createdAt: "2026-04-27T13:20:00.000Z",
    updatedAt: "2026-04-27T13:21:00.000Z",
    actor: {
      id: "user_local_reviewer",
      roles: [
        "plugin_review",
      ],
    },
    summary: {
      artifactKind: "plugin_review_artifact",
      proposalOnly: true,
      localOnly: true,
    },
    artifact: {
      kind: "plugin_review_artifact",
      plugin: {
        id: "plugin.release-notes.local-draft",
      },
    },
  };
}

async function writeFixture(name, value) {
  await mkdir(tempDir, { recursive: true });
  const outputPath = path.join(tempDir, name);
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`);
  return outputPath;
}
