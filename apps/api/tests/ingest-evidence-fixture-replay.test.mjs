import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createIngestEvidenceRoutes } from "../src/ingestEvidenceRoutes.ts";
import { createApiRouter } from "../src/router.ts";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDirectory, "../../..");
const bundlePath = resolve(workspaceRoot, "examples/ingest-search/evidence-api-requests.json");
const bundle = readJson(bundlePath);
const evidencePath = resolve(workspaceRoot, bundle.inputEvidence.fixturePath);
const evidenceText = readFileSync(evidencePath, "utf8");
const evidence = JSON.parse(evidenceText);

test("ingest evidence API request fixtures stay local and pinned to audit evidence", () => {
  assert.equal(bundle.schemaVersion, "ingest-evidence-api-requests.v1");
  assert.equal(bundle.localOnly, true);
  assert.equal(bundle.network.mode, "disabled");
  assert.equal(bundle.inputEvidence.id, "auditEvidence");
  assert.equal(bundle.inputEvidence.fixturePath, "examples/ingest-search/audit-evidence.json");
  assert.equal(bundle.inputEvidence.schemaVersion, evidence.schemaVersion);
  assert.equal(sha256Hex(evidenceText), bundle.inputEvidence.sha256);
  assert.deepEqual(
    bundle.requests.map((fixture) => fixture.id),
    [
      "api_evidence_export_summary",
      "api_evidence_export_json",
      "api_evidence_export_manifest",
      "api_evidence_package",
      "api_evidence_export_bad_section",
    ],
  );

  for (const fixture of bundle.requests) {
    assert.equal(fixture.route.method, "POST", fixture.id);
    assert.match(
      fixture.route.path,
      /^\/v1\/ingest\/evidence\/(?:export|package)$/,
      fixture.id,
    );
  }
});

test("replays every ingest evidence API fixture through the local router", async (t) => {
  const router = createApiRouter(createIngestEvidenceRoutes());

  for (const fixture of bundle.requests) {
    await t.test(fixture.id, async () => {
      const response = await router.dispatch(createReplayRequest(fixture));
      const secondResponse = await router.dispatch(createReplayRequest(fixture));

      assert.deepEqual(response, secondResponse);
      assertResponseMatchesFixture(response, fixture.expect);
    });
  }
});

function createReplayRequest(fixture) {
  return {
    method: fixture.route.method,
    path: fixture.route.path,
    headers: fixture.request.headers,
    body: materializeFixtureRefs(fixture.request.body),
  };
}

function materializeFixtureRefs(value) {
  if (Array.isArray(value)) {
    return value.map((item) => materializeFixtureRefs(item));
  }

  if (isRecord(value)) {
    if (Object.keys(value).length === 1 && value.$fixtureRef === "auditEvidence") {
      return structuredClone(evidence);
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, materializeFixtureRefs(nested)]),
    );
  }

  return value;
}

function assertResponseMatchesFixture(response, expected) {
  assert.equal(response.status, expected.status);
  assert.match(response.headers["content-type"], new RegExp(`^${escapeRegExp(expected.contentType)}`));

  if (expected.error) {
    assert.deepEqual(Object.keys(response.body), ["error"]);
    assert.deepEqual(response.body.error, expected.error);
    return;
  }

  assert.equal(response.body.kind, expected.kind);
  assert.equal(response.body.version, 1);
  assert.equal(response.body.fingerprint, expected.fingerprint);
  assert.equal(response.body.manifest.fingerprint, expected.manifestFingerprint);
  assert.equal(response.body.manifest.content.fingerprint, expected.contentFingerprint);
  assert.deepEqual(response.body.manifest.evidenceSummary, expected.summary);

  if (expected.kind === "ingest-evidence.export") {
    assertExportMatchesFixture(response.body, expected);
    return;
  }

  if (expected.kind === "ingest-evidence.package") {
    assertPackageMatchesFixture(response.body, expected);
    return;
  }

  assert.fail(`Unsupported expected response kind: ${expected.kind}`);
}

function assertExportMatchesFixture(body, expected) {
  assert.equal(body.format, expected.format);
  assert.equal(body.mediaType, "application/json");
  assert.equal(body.fingerprint, expected.fingerprint);

  const content = JSON.parse(body.content);
  if (expected.contentJson) {
    assert.deepEqual(content, expected.contentJson);
  }
  if (expected.contentEvidenceFileIds) {
    assert.deepEqual(
      content.evidenceFiles.map((file) => file.id),
      expected.contentEvidenceFileIds,
    );
  }
  if (expected.contentSourceUris) {
    assert.deepEqual(
      content.sourceSnapshots.map((source) => source.sourceUri),
      expected.contentSourceUris,
    );
  }
  if (expected.contentCitationKinds) {
    assert.deepEqual(
      content.citationEvidence.map((citation) => citation.kind),
      expected.contentCitationKinds,
    );
  }
  if (expected.sectionItemCounts) {
    assert.equal(content.kind, "ingest-evidence.manifest");
    assert.equal(content.fingerprint, expected.manifestFingerprint);
    assert.equal(content.content.fingerprint, expected.contentFingerprint);
    assert.deepEqual(sectionItemCounts(content.sections), expected.sectionItemCounts);
  }
}

function assertPackageMatchesFixture(body, expected) {
  assert.deepEqual(
    body.files.map(({ path, mediaType, bytes, fingerprint }) => ({
      path,
      mediaType,
      bytes,
      fingerprint,
    })),
    expected.files,
  );
  assert.equal(
    body.files.find((file) => file.path === "evidence.json").fingerprint,
    body.manifest.content.fingerprint,
  );

  const manifestFile = body.files.find((file) => file.path === "manifest.json");
  const evidenceFile = body.files.find((file) => file.path === "evidence.json");
  assert.equal(JSON.parse(manifestFile.content).fingerprint, expected.manifestFingerprint);
  assert.deepEqual(
    JSON.parse(evidenceFile.content).evidenceFiles.map((file) => file.id),
    ["recordsCsv", "recordsJson"],
  );
}

function sectionItemCounts(sections) {
  return Object.fromEntries(
    sections.map((section) => [section.section, section.itemCount]),
  );
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256Hex(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
