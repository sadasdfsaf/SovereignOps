import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createInMemoryPluginReviewArtifactRecordStore,
  createPluginReviewArtifactRecordRoutes,
} from "../src/pluginReviewArtifactRecordRoutes.ts";
import { createApiRouter } from "../src/router.ts";
import { runPluginInSandbox } from "../../../packages/plugin-sdk/src/index.ts";
import {
  PLUGIN_REVIEW_ARTIFACT_RECORD_API_REQUESTS_SCHEMA_VERSION,
  validatePluginReviewArtifactRecordApiRequestBundle,
} from "../../../packages/schemas/src/pluginReviewArtifactRecord.ts";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDirectory, "../../..");
const bundlePath = resolveWorkspacePath("examples/plugins/release-notes/review-artifact-records-requests.json");

test("public plugin review artifact records API bundle validates with the shared schema", () => {
  const bundle = readJson(bundlePath);
  const result = validatePluginReviewArtifactRecordApiRequestBundle(bundle);

  assert.equal(bundle.schemaVersion, PLUGIN_REVIEW_ARTIFACT_RECORD_API_REQUESTS_SCHEMA_VERSION);
  assert.equal(result.ok, true, formatIssues(result.issues));
  assert.deepEqual(result.issues, []);
  assert.notEqual(result.value, bundle);
  assert.notEqual(result.value.requests, bundle.requests);
  assert.notEqual(result.value.requests[0].request, bundle.requests[0].request);
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value.requests), true);
  assert.equal(Object.isFrozen(result.value.requests[0].request), true);

  const refs = readFixtureRefs(bundle);
  const fixture = findFixture(bundle, "api_plugin_review_artifact_records_create_release_notes");
  const materializedBody = materializeFixtureRefs(fixture.request.body, refs);

  assert.equal(refs.get("releaseNotesReviewArtifact").kind, "plugin_review_artifact");
  assert.equal(materializedBody.record.artifact.plugin.id, "plugin.release-notes.local-draft");
  assert.notEqual(materializedBody.record.artifact, refs.get("releaseNotesReviewArtifact"));
  assert.throws(() => {
    result.value.requests[0].id = "changed";
  }, TypeError);
});

test("materialized review artifact record fixtures replay through the current API routes", async () => {
  const bundle = readJson(bundlePath);
  const refs = readFixtureRefs(bundle);
  const reviewArtifact = refs.get("releaseNotesReviewArtifact");
  const manifest = readWorkspaceJson(reviewArtifact.plugin.manifestPath);
  const createFixture = findFixture(bundle, "api_plugin_review_artifact_records_create_release_notes");
  const listFixture = findFixture(bundle, "api_plugin_review_artifact_records_list_release_notes");
  const getFixture = findFixture(bundle, "api_plugin_review_artifact_records_get_release_notes");
  const compareFixture = findFixture(bundle, "api_plugin_review_artifact_records_compare_release_notes");
  const materializedCreate = materializeFixtureRefs(createFixture.request.body, refs);
  const publicRecord = materializedCreate.record;
  const createBody = {
    recordId: publicRecord.id,
    label: "release-notes",
    metadata: publicRecord.metadata,
    payload: createCurrentPreviewBody(manifest, publicRecord),
  };
  const before = structuredClone(createBody);
  const router = createApiRouter(createPluginReviewArtifactRecordRoutes({
    store: createInMemoryPluginReviewArtifactRecordStore(),
    now: () => bundle.generatedAt,
  }));

  const createResponse = await router.dispatch({
    method: createFixture.route.method,
    path: createFixture.route.path,
    headers: createFixture.request.headers,
    body: createBody,
  });
  assertJsonResponse(createResponse, createFixture.expect.status);
  assert.deepEqual(createBody, before);
  assert.equal(createResponse.body.kind, "plugin-review-artifact.record.created");
  assert.equal(createResponse.body.schemaVersion, createFixture.expect.schemaVersion);
  assert.equal(createResponse.body.record.recordId, createFixture.expect.recordId);
  assert.equal(createResponse.body.record.baseline.artifact.manifest.id, createFixture.expect.pluginId);
  assert.equal(Object.isFrozen(createResponse.body), true);
  assert.equal(Object.isFrozen(createResponse.body.record), true);
  assert.equal(Object.isFrozen(createResponse.body.record.baseline), true);

  const listResponse = await router.dispatch({
    method: listFixture.route.method,
    path: listFixture.route.path,
    headers: listFixture.request.headers,
  });
  assertJsonResponse(listResponse, listFixture.expect.status);
  assert.equal(listResponse.body.kind, "plugin-review-artifact.record.list");
  assert.equal(listResponse.body.schemaVersion, createFixture.expect.schemaVersion);
  assert.equal(listResponse.body.pagination.returnedRecordCount, listFixture.expect.recordCount);
  assert.equal(listResponse.body.records[0].pluginId, createFixture.expect.pluginId);

  const getResponse = await router.dispatch({
    method: getFixture.route.method,
    path: getFixture.route.path,
    headers: getFixture.request.headers,
  });
  assertJsonResponse(getResponse, getFixture.expect.status);
  assert.equal(getResponse.body.kind, "plugin-review-artifact.record.read");
  assert.equal(getResponse.body.schemaVersion, getFixture.expect.schemaVersion);
  assert.equal(getResponse.body.record.recordId, getFixture.expect.recordId);

  const materializedCompare = materializeFixtureRefs(compareFixture.request.body, refs);
  const compareResponse = await router.dispatch({
    method: compareFixture.route.method,
    path: `${createFixture.route.path}/${publicRecord.id}/compare`,
    headers: compareFixture.request.headers,
    body: {
      payload: createCurrentPreviewBody(manifest, materializedCompare.rightRecord),
    },
  });
  assertJsonResponse(compareResponse, compareFixture.expect.status);
  assert.equal(compareResponse.body.kind, "plugin-review-artifact.record.compare");
  assert.equal(compareResponse.body.schemaVersion, createFixture.expect.schemaVersion);
  assert.equal(compareResponse.body.equivalent, compareFixture.expect.matches);
  assert.equal(compareResponse.body.summary.changedItemCount, compareFixture.expect.differenceCount);
});

function createCurrentPreviewBody(manifest, sourceRecord = {}) {
  const capabilities = manifest.capabilities.map((capability) => capability.id);
  const boundary = {
    capabilities,
    deniedHostApis: ["fs", "process"],
    limits: {
      maxAuditEvents: 16,
      maxTicks: 16,
    },
  };
  const result = runPluginInSandbox((context) => {
    for (const capability of capabilities) {
      context.requireCapability(capability);
    }
    context.tick(1, "fixture");
    return { ready: true };
  }, boundary);

  return {
    manifest,
    sandboxReview: {
      runLabel: "schema-alignment-record",
      boundary,
      requiredCapabilities: capabilities,
      result,
    },
    approvalGates: [
      {
        id: "release_note_review",
        name: "Release note review",
        required: true,
        state: "pending",
      },
    ],
    evidence: [
      {
        id: "review-artifact",
        kind: sourceRecord.summary?.artifactKind ?? "fixture",
        summary: "Release note record fixture materialized locally.",
      },
    ],
  };
}

function readFixtureRefs(bundle) {
  return new Map(
    (bundle.fixtureRefs ?? []).map((ref) => [ref.id, readWorkspaceJson(ref.fixturePath)]),
  );
}

function materializeFixtureRefs(value, refs) {
  if (Array.isArray(value)) {
    return value.map((item) => materializeFixtureRefs(item, refs));
  }

  if (isRecord(value)) {
    if (Object.keys(value).length === 1 && typeof value.$fixtureRef === "string") {
      const ref = refs.get(value.$fixtureRef);
      assert.ok(ref, `Missing fixture ref ${value.$fixtureRef}`);
      return structuredClone(ref);
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, materializeFixtureRefs(nested, refs)]),
    );
  }

  return value;
}

function findFixture(bundle, id) {
  const fixture = bundle.requests.find((request) => request.id === id);
  assert.ok(fixture, `Missing fixture ${id}`);
  return fixture;
}

function readWorkspaceJson(path) {
  return readJson(resolveWorkspacePath(path));
}

function resolveWorkspacePath(path) {
  const resolved = resolve(workspaceRoot, path);
  const rel = relative(workspaceRoot, resolved);

  assert.equal(rel.startsWith(".."), false, `Fixture path escaped workspace: ${path}`);
  assert.equal(isAbsolute(rel), false, `Fixture path escaped workspace: ${path}`);
  return resolved;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assertJsonResponse(response, status) {
  assert.equal(response.status, status);
  assert.match(response.headers["content-type"], /^application\/json/);
}

function formatIssues(issues) {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
