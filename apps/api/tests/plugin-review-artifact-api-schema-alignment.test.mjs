import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { dirname } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createPluginReviewArtifactRoutes } from "../src/pluginReviewArtifactRoutes.ts";
import { createApiRouter } from "../src/router.ts";
import { runPluginInSandbox } from "../../../packages/plugin-sdk/src/index.ts";
import {
  PLUGIN_REVIEW_ARTIFACT_API_REQUESTS_SCHEMA_VERSION,
  validatePluginReviewArtifactApiRequestBundle,
} from "../../../packages/schemas/src/pluginReviewArtifact.ts";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDirectory, "../../..");
const bundlePath = resolveWorkspacePath("examples/plugins/release-notes/review-artifact-api-requests.json");

test("public plugin review artifact API bundle validates with the shared schema", () => {
  const bundle = readJson(bundlePath);
  const result = validatePluginReviewArtifactApiRequestBundle(bundle);

  assert.equal(bundle.schemaVersion, PLUGIN_REVIEW_ARTIFACT_API_REQUESTS_SCHEMA_VERSION);
  assert.equal(result.ok, true, formatIssues(result.issues));
  assert.deepEqual(result.issues, []);
  assert.notEqual(result.value, bundle);
  assert.notEqual(result.value.requests, bundle.requests);
  assert.notEqual(result.value.requests[0].request, bundle.requests[0].request);
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value.requests), true);
  assert.equal(Object.isFrozen(result.value.requests[0].request), true);

  const refs = readFixtureRefs(bundle);
  const fixture = findFixture(bundle, "api_plugin_review_artifact_preview_release_notes");
  const materializedBody = materializeFixtureRefs(fixture.request.body, refs);

  assert.equal(refs.get("releaseNotesManifest").id, "plugin.release-notes.local-draft");
  assert.deepEqual(materializedBody.manifest, refs.get("releaseNotesManifest"));
  assert.notEqual(materializedBody.manifest, refs.get("releaseNotesManifest"));
  assert.throws(() => {
    result.value.requests[0].id = "changed";
  }, TypeError);
});

test("materialized review artifact preview fixture replays through the current API route", async () => {
  const bundle = readJson(bundlePath);
  const refs = readFixtureRefs(bundle);
  const fixture = findFixture(bundle, "api_plugin_review_artifact_preview_release_notes");
  const materializedBody = materializeFixtureRefs(fixture.request.body, refs);
  const routeBody = createCurrentPreviewBody(materializedBody.manifest, materializedBody);
  const before = structuredClone(routeBody);
  const router = createApiRouter(createPluginReviewArtifactRoutes());

  const response = await router.dispatch({
    method: fixture.route.method,
    path: fixture.route.path,
    headers: fixture.request.headers,
    body: routeBody,
  });
  const secondResponse = await router.dispatch({
    method: fixture.route.method,
    path: fixture.route.path,
    headers: fixture.request.headers,
    body: structuredClone(routeBody),
  });

  assertJsonResponse(response, fixture.expect.status);
  assert.deepEqual(routeBody, before);
  assert.deepEqual(response.body, secondResponse.body);
  assert.equal(response.body.kind, fixture.expect.kind);
  assert.equal(response.body.schemaVersion, "plugin-review-artifact/v1");
  assert.equal(fixture.expect.schemaVersion, "plugin-review-artifact-preview.v1");
  assert.equal(response.body.artifact.manifest.id, fixture.expect.pluginId);
  assert.equal(
    response.body.artifact.capabilityEvidence.length,
    fixture.expect.summary.capabilityCount,
  );
  assert.equal(response.body.artifact.evidence.length, 1);
  assert.equal(Object.isFrozen(response.body), true);
  assert.equal(Object.isFrozen(response.body.artifact), true);
  assert.equal(Object.isFrozen(response.body.artifact.manifest), true);
  assert.notEqual(secondResponse.body, response.body);
  assert.throws(() => {
    response.body.artifact.manifest.id = "changed";
  }, TypeError);
});

test("invalid review artifact preview fixture materializes into a route validation error", async () => {
  const bundle = readJson(bundlePath);
  const refs = readFixtureRefs(bundle);
  const validManifest = refs.get("releaseNotesManifest");
  const fixture = findFixture(bundle, "api_plugin_review_artifact_preview_invalid_manifest");
  const routeBody = createCurrentPreviewBody(fixture.request.body.manifest, {
    capabilityManifest: validManifest,
  });
  const router = createApiRouter(createPluginReviewArtifactRoutes());

  const response = await router.dispatch({
    method: fixture.route.method,
    path: fixture.route.path,
    headers: fixture.request.headers,
    body: routeBody,
  });

  assertJsonError(response, fixture.expect.status, "validation_failed");
  assert.equal(fixture.expect.errorCode, "invalid_plugin_review_artifact");
  assert.equal(response.body.error.details.path, "body.manifest");
});

function createCurrentPreviewBody(manifest, source = {}) {
  const capabilityManifest = source.capabilityManifest ?? manifest;
  const capabilities = Array.isArray(capabilityManifest.capabilities)
    ? capabilityManifest.capabilities.map((capability) => capability.id)
    : [];
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
  const note = source.sandboxReviews?.[0]?.details?.note;

  return {
    manifest,
    sandboxReview: {
      runLabel: "schema-alignment-preview",
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
        kind: "fixture",
        summary: typeof note === "string" ? note : "Release note fixture materialized locally.",
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

function assertJsonError(response, status, code) {
  assertJsonResponse(response, status);
  assert.deepEqual(Object.keys(response.body), ["error"]);
  assert.equal(response.body.error.code, code);
}

function formatIssues(issues) {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
