import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  isIngestApiVerifyCommand,
  runIngestApiVerifyCli,
} from "../src/ingestApiVerify.ts";

const fixturePath = fileURLToPath(
  new URL("../../../examples/ingest-search/api-requests.json", import.meta.url),
);
const openapiPath = fileURLToPath(new URL("../../../docs/openapi.yaml", import.meta.url));
const tempDir = fileURLToPath(new URL("../.tmp-ingest-api-verify/", import.meta.url));

test("verifies ingest API request fixtures against OpenAPI without live network usage", async () => {
  const result = await runIngestApiVerifyCli([
    "ingest",
    "api",
    "verify",
    "--fixture",
    fixturePath,
    "--openapi",
    openapiPath,
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.kind, "ingest-api-fixture-verify");
  assert.equal(payload.schemaVersion, "ingest-search-api-requests.v1");
  assert.equal(payload.apiBase, "http://127.0.0.1:7317");
  assert.equal(payload.fixture.path, "examples/ingest-search/api-requests.json");
  assert.equal(payload.openapi.path, "docs/openapi.yaml");
  assert.deepEqual(payload.network, {
    liveRequests: 0,
    allowed: "local-fixture-only",
  });
  assert.equal(payload.totalRequests, 6);
  assert.equal(payload.verifiedRequests, 6);
  assert.deepEqual(payload.summary.methods, { POST: 6 });
  assert.deepEqual(payload.summary.statuses, { 200: 6 });
  assert.deepEqual(
    payload.routes.map((route) => [route.id, route.method, route.path, route.response]),
    [
      [
        "api_ingest_normalize",
        "POST",
        "/v1/ingest/normalize",
        { status: 200, hasBody: true },
      ],
      [
        "api_ingest_structured_csv",
        "POST",
        "/v1/ingest/structured",
        { status: 200, hasBody: true },
      ],
      [
        "api_ingest_repository_scan",
        "POST",
        "/v1/ingest/repository/scan",
        { status: 200, hasBody: true },
      ],
      ["api_search_query", "POST", "/v1/search/query", { status: 200, hasBody: true }],
      [
        "api_quarantine_cases",
        "POST",
        "/v1/quarantine/cases",
        { status: 200, hasBody: true },
      ],
      [
        "api_quarantine_decision",
        "POST",
        "/v1/quarantine/cases/qtn_csv_beta_status/decision",
        { status: 200, hasBody: true },
      ],
    ],
  );
});

test("reports fixture routes missing from OpenAPI as JSON-only errors", async () => {
  const bundle = await readBundle();
  bundle.requests[0].route.path = "/v1/ingest/not-in-openapi";
  const invalidPath = await writeBundle("route-mismatch.json", bundle);

  try {
    const result = await runIngestApiVerifyCli([
      "ingest-api",
      "verify",
      "--fixture",
      invalidPath,
      "--openapi",
      openapiPath,
    ]);
    assert.ok(result);
    const payload = JSON.parse(result.stderr);

    assert.equal(result.exitCode, 1);
    assert.equal(result.stdout, "");
    assert.equal(payload.error.code, "verification_failed");
    assert.deepEqual(payload.error.details.issues, [
      {
        code: "route_not_in_openapi",
        message: "Fixture route is not present in the OpenAPI paths.",
        id: "api_ingest_normalize",
        method: "POST",
        path: "/v1/ingest/not-in-openapi",
      },
    ]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("rejects duplicate ingest API fixture request ids", async () => {
  const bundle = await readBundle();
  bundle.requests[1].id = bundle.requests[0].id;
  const invalidPath = await writeBundle("duplicate-id.json", bundle);

  try {
    const result = await runIngestApiVerifyCli([
      "ingest",
      "api",
      "verify",
      "--fixture",
      invalidPath,
      "--openapi",
      openapiPath,
    ]);
    assert.ok(result);
    const payload = JSON.parse(result.stderr);

    assert.equal(result.exitCode, 2);
    assert.equal(result.stdout, "");
    assert.equal(payload.error.code, "invalid_fixture");
    assert.match(payload.error.message, /must be unique/);
    assert.match(payload.error.message, /api_ingest_normalize/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("rejects unsafe local paths in fixture bundles as JSON-only errors", async () => {
  const bundle = await readBundle();
  bundle.requests[2].request.body.localPath = "../outside";
  const invalidPath = await writeBundle("unsafe-path.json", bundle);

  try {
    const result = await runIngestApiVerifyCli([
      "ingest",
      "api",
      "verify",
      "--fixture",
      invalidPath,
      "--openapi",
      openapiPath,
    ]);
    assert.ok(result);
    const payload = JSON.parse(result.stderr);

    assert.equal(result.exitCode, 2);
    assert.equal(result.stdout, "");
    assert.equal(payload.error.code, "invalid_fixture");
    assert.match(payload.error.message, /localPath/);
    assert.match(payload.error.message, /parent directory/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("detects ingest API verify commands", () => {
  assert.equal(isIngestApiVerifyCommand(["ingest", "api", "verify"]), true);
  assert.equal(isIngestApiVerifyCommand(["ingest-api", "verify"]), true);
  assert.equal(isIngestApiVerifyCommand(["ingest", "api", "replay"]), false);
  assert.equal(isIngestApiVerifyCommand(["ingest", "search", "source", "summary"]), false);
});

async function readBundle() {
  return JSON.parse(await readFile(fixturePath, "utf8"));
}

async function writeBundle(name, bundle) {
  await mkdir(tempDir, { recursive: true });
  const outputPath = path.join(tempDir, name);
  await writeFile(outputPath, `${JSON.stringify(bundle, null, 2)}\n`);
  return outputPath;
}
