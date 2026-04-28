import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  ApiHttpError,
  ApiRequestValidationError,
  ApiResponseParseError,
  ApiResponseValidationError,
  createPluginReviewArtifactRecordClient,
  toApiResult,
} from "../src/index.ts";
import {
  validatePluginReviewArtifactRecordApiRequestBundle,
} from "../../schemas/src/pluginReviewArtifactRecord.ts";

const schemasFixturesDir = fileURLToPath(new URL("../../schemas/fixtures/", import.meta.url));

const reviewId = "plugin-review-plugin.local-tools-aaaaaaaaaaaaaaaa";
const sandboxReviewId = "sandbox-review-bbbbbbbbbbbbbbbb";
const artifactFingerprint = "a".repeat(32);
const sandboxFingerprint = "b".repeat(32);
const evidenceFingerprint = "c".repeat(32);

test("creates, lists, gets, and compares plugin review artifact records", async () => {
  const record = validRecord();
  const otherRecord = {
    ...validRecord("prar_localToolsNext"),
    reviewId: "plugin-review-plugin.local-tools-bbbbbbbbbbbbbbbb",
    decision: "approval_required",
  };
  const compare = {
    kind: "plugin-review-artifact-record.compare",
    localOnly: true,
    leftRecordId: record.recordId,
    rightRecordId: otherRecord.recordId,
    equal: false,
    summary: {
      equal: false,
      changedArtifactCount: 1,
      unchangedArtifactCount: 0,
      addedArtifactCount: 0,
      removedArtifactCount: 0,
    },
    differences: [
      {
        path: "decision",
        left: "approved",
        right: "approval_required",
      },
    ],
  };
  const fetch = fakeFetch([
    jsonResponse(201, { record }),
    jsonResponse(200, { localOnly: true, records: [record], nextCursor: "cur_next" }),
    jsonResponse(200, { record }),
    jsonResponse(200, compare),
  ]);
  const client = createPluginReviewArtifactRecordClient({
    baseUrl: "local://api/v1/",
    apiKey: "test-key",
    headers: {
      "x-sdk-test": "plugin-review-artifact-record",
    },
    fetch,
  });

  const created = await client.create(record);
  const listed = await client.list({
    workspaceId: "wsp_localReview",
    pluginId: "plugin.local-tools",
    decision: "approved",
    limit: 10,
    cursor: "cur_1",
  });
  const fetched = await client.get("prar_localTools/with space");
  const compared = await client.compare({
    leftRecordId: record.recordId,
    rightRecordId: otherRecord.recordId,
  });

  assert.deepEqual(created, { record });
  assert.deepEqual(listed, { localOnly: true, records: [record], nextCursor: "cur_next" });
  assert.deepEqual(fetched, { record });
  assert.deepEqual(compared, compare);

  assert.equal(fetch.calls[0].url, "local://api/v1/plugins/review-artifacts/records");
  assert.equal(fetch.calls[0].init.method, "POST");
  assert.equal(fetch.calls[0].init.headers.accept, "application/json");
  assert.equal(fetch.calls[0].init.headers.authorization, "Bearer test-key");
  assert.equal(fetch.calls[0].init.headers["content-type"], "application/json");
  assert.equal(fetch.calls[0].init.headers["x-sdk-test"], "plugin-review-artifact-record");
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), record);

  assert.equal(
    fetch.calls[1].url,
    "local://api/v1/plugins/review-artifacts/records?workspaceId=wsp_localReview&pluginId=plugin.local-tools&decision=approved&limit=10&cursor=cur_1",
  );
  assert.equal(fetch.calls[1].init.method, "GET");
  assert.equal(Object.hasOwn(fetch.calls[1].init.headers, "content-type"), false);

  assert.equal(
    fetch.calls[2].url,
    "local://api/v1/plugins/review-artifacts/records/prar_localTools%2Fwith%20space",
  );
  assert.equal(fetch.calls[2].init.method, "GET");

  assert.equal(fetch.calls[3].url, "local://api/v1/plugins/review-artifacts/records/compare");
  assert.equal(fetch.calls[3].init.method, "POST");
  assert.deepEqual(JSON.parse(fetch.calls[3].init.body), {
    leftRecordId: record.recordId,
    rightRecordId: otherRecord.recordId,
  });
});

test("validates public plugin review artifact records bundle and drives SDK record calls", async () => {
  const bundle = await validatedPublicBundle(
    "plugin-review-artifact-records-requests.valid.json",
    validatePluginReviewArtifactRecordApiRequestBundle,
  );
  const invalidBundle = await readSchemaFixtureJson("plugin-review-artifact-records-requests.invalid.json");
  const invalidResult = validatePluginReviewArtifactRecordApiRequestBundle(invalidBundle);
  const createFixture = fixtureRequest(bundle, "api_plugin_review_artifact_records_create_release_notes");
  const listFixture = fixtureRequest(bundle, "api_plugin_review_artifact_records_list_release_notes");
  const getFixture = fixtureRequest(bundle, "api_plugin_review_artifact_records_get_release_notes");
  const compareFixture = fixtureRequest(bundle, "api_plugin_review_artifact_records_compare_release_notes");
  const fetch = fakeFetch([
    jsonResponse(createFixture.expect.status, recordResponseFromFixture(createFixture)),
    jsonResponse(listFixture.expect.status, recordListResponseFromFixture(listFixture, createFixture)),
    jsonResponse(getFixture.expect.status, recordResponseFromFixture(getFixture, createFixture)),
    jsonResponse(compareFixture.expect.status, compareResponseFromFixture(compareFixture)),
  ]);
  const client = createPluginReviewArtifactRecordClient({
    baseUrl: baseUrlForFixture(bundle),
    fetch,
  });

  const created = await client.create(createFixture.request.body);
  const listed = await client.list();
  const fetched = await client.get(getFixture.expect.recordId);
  const compared = await client.compare(compareFixture.request.body);

  assert.equal(invalidResult.ok, false);
  assert.deepEqual(
    [
      "fixtureRefs[0].fixturePath",
      "requests[0].request.headers.authorization",
      "requests[0].request.body.record.metadata.source",
      "requests[1].id",
    ].every((path) => invalidResult.issues.some((issue) => issue.path === path)),
    true,
  );
  assert.equal(created.kind, createFixture.expect.kind);
  assert.equal(created.recordId, createFixture.expect.recordId);
  assert.equal(listed.kind, listFixture.expect.kind);
  assert.equal(listed.records.length, listFixture.expect.recordCount);
  assert.equal(fetched.recordId, getFixture.expect.recordId);
  assert.equal(compared.kind, compareFixture.expect.kind);
  assert.equal(compared.matches, true);
  assert.deepEqual(fetch.calls.map((call) => [call.init.method, new URL(call.url).pathname]), [
    [createFixture.route.method, createFixture.route.path],
    [listFixture.route.method, listFixture.route.path],
    [getFixture.route.method, getFixture.route.path],
    [compareFixture.route.method, compareFixture.route.path],
  ]);
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), createFixture.request.body);
  assert.deepEqual(JSON.parse(fetch.calls[3].init.body), compareFixture.request.body);
});

test("validates plugin review artifact record requests before fetch is called", async () => {
  const fetch = fakeFetch([]);
  const client = createPluginReviewArtifactRecordClient({
    baseUrl: "local://api/v1",
    fetch,
  });

  await assert.rejects(
    client.create({
      ...validRecord(),
      localOnly: false,
      redacted: false,
    }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(
        error.issues.map((issue) => issue.path),
        ["localOnly", "redacted"],
      );
      return true;
    },
  );

  await assert.rejects(
    client.list({ decision: "needs_review", limit: -1 }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(
        error.issues.map((issue) => issue.path),
        ["query.decision", "query.limit"],
      );
      return true;
    },
  );

  await assert.rejects(
    client.get(""),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(error.issues.map((issue) => issue.path), ["recordId"]);
      return true;
    },
  );

  await assert.rejects(
    client.compare({ leftRecordId: "prar_left", rightRecordId: "" }),
    (error) => {
      assert.equal(error instanceof ApiRequestValidationError, true);
      assert.deepEqual(error.issues.map((issue) => issue.path), ["rightRecordId"]);
      return true;
    },
  );

  assert.equal(fetch.calls.length, 0);
});

test("supports payload wrappers and record-scoped compare paths", async () => {
  const created = {
    kind: "plugin-review-artifact.record.created",
    schemaVersion: "plugin-review-artifact-record/v1",
    localOnly: true,
    record: validRecord("record-local-1"),
  };
  const compared = {
    kind: "plugin-review-artifact.record.compare",
    schemaVersion: "plugin-review-artifact-record/v1",
    localOnly: true,
    recordId: "record-local-1",
    equivalent: true,
    summary: {
      equivalent: true,
      unchangedArtifactCount: 1,
      changedArtifactCount: 0,
      addedArtifactCount: 0,
      removedArtifactCount: 0,
    },
    differences: {
      added: [],
      removed: [],
      changed: [],
    },
  };
  const payload = {
    manifest: baseManifest(),
    sandboxReview: validPreview().artifact.sandboxReview,
  };
  const fetch = fakeFetch([
    jsonResponse(201, created),
    jsonResponse(200, compared),
  ]);
  const client = createPluginReviewArtifactRecordClient({
    baseUrl: "local://api/v1",
    fetch,
  });

  assert.deepEqual(
    await client.create({
      recordId: "record-local-1",
      label: "local-baseline",
      payload,
    }),
    created,
  );
  assert.deepEqual(await client.compare("record-local-1", payload), compared);
  assert.equal(fetch.calls[0].url, "local://api/v1/plugins/review-artifacts/records");
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), {
    recordId: "record-local-1",
    label: "local-baseline",
    payload,
  });
  assert.equal(
    fetch.calls[1].url,
    "local://api/v1/plugins/review-artifacts/records/record-local-1/compare",
  );
  assert.deepEqual(JSON.parse(fetch.calls[1].init.body), { payload });
});

test("rejects malformed plugin review artifact record success bodies and invalid JSON", async () => {
  const malformedRecord = {
    ...validRecord(),
    localOnly: false,
  };
  const fetch = fakeFetch([
    jsonResponse(200, { localOnly: true, records: [malformedRecord] }),
    jsonResponse(200, {
      localOnly: false,
      differences: [],
    }),
    textResponse(200, "{", { "content-type": "application/json" }),
  ]);
  const client = createPluginReviewArtifactRecordClient({
    baseUrl: "local://api/v1",
    fetch,
  });

  await assert.rejects(
    client.list(),
    (error) => {
      assert.equal(error instanceof ApiResponseValidationError, true);
      assert.deepEqual(error.issues.map((issue) => issue.path), ["records.0.localOnly"]);
      return true;
    },
  );

  await assert.rejects(
    client.compare({ leftRecordId: "prar_left", rightRecordId: "prar_right" }),
    (error) => {
      assert.equal(error instanceof ApiResponseValidationError, true);
      assert.deepEqual(error.issues.map((issue) => issue.path), ["localOnly"]);
      return true;
    },
  );

  await assert.rejects(
    client.get("prar_localTools"),
    (error) => {
      assert.equal(error instanceof ApiResponseParseError, true);
      assert.equal(error.status, 200);
      return true;
    },
  );
});

test("keeps duplicate and not-found plugin review artifact record errors typed", async () => {
  const fetch = fakeFetch([
    jsonResponse(409, {
      error: {
        code: "plugin_review_artifact_record_duplicate",
        message: "Plugin review artifact record already exists.",
        details: {
          recordId: "prar_localTools",
        },
      },
    }),
    jsonResponse(404, {
      error: {
        code: "plugin_review_artifact_record_not_found",
        message: "Plugin review artifact record was not found.",
        details: {
          recordId: "prar_missing",
        },
      },
    }),
  ]);
  const client = createPluginReviewArtifactRecordClient({
    baseUrl: "local://api/v1",
    fetch,
  });

  const duplicate = await toApiResult(client.create(validRecord()));
  const missing = await toApiResult(client.get("prar_missing"));

  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.error instanceof ApiHttpError, true);
  assert.equal(duplicate.error.status, 409);
  assert.equal(duplicate.error.apiCode, "plugin_review_artifact_record_duplicate");
  assert.deepEqual(duplicate.error.details, { recordId: "prar_localTools" });

  assert.equal(missing.ok, false);
  assert.equal(missing.error instanceof ApiHttpError, true);
  assert.equal(missing.error.status, 404);
  assert.equal(missing.error.apiCode, "plugin_review_artifact_record_not_found");
  assert.deepEqual(missing.error.details, { recordId: "prar_missing" });
});

function validRecord(recordId = "prar_localTools") {
  return {
    kind: "plugin-review-artifact.record",
    schemaVersion: "plugin-review-artifact-record/v1",
    localOnly: true,
    redacted: true,
    recordId,
    reviewId,
    pluginId: "plugin.local-tools",
    pluginName: "Local Tools",
    pluginVersion: "1.2.3",
    decision: "approved",
    label: "local-baseline",
    metadata: {
      clientLabel: "local-tools",
      workflowId: "wf_plugin_review",
    },
    createdAt: "2026-04-27T13:00:00.000Z",
    updatedAt: "2026-04-27T13:00:01.000Z",
    fingerprint: `sha256:${"d".repeat(64)}`,
    baselineFingerprint: `sha256:${"e".repeat(64)}`,
    artifact: validArtifact(),
  };
}

function validPreview() {
  return {
    kind: "plugin-review-artifact.preview",
    localOnly: true,
    redacted: true,
    schemaVersion: "plugin-review-artifact/v1",
    reviewId,
    fingerprint: artifactFingerprint,
    decision: "approved",
    artifact: validArtifact(),
  };
}

function validArtifact() {
  return {
    schemaVersion: "plugin-review-artifact/v1",
    reviewId,
    fingerprint: artifactFingerprint,
    decision: "approved",
    manifest: {
      id: "plugin.local-tools",
      name: "Local Tools",
      version: "1.2.3",
      description: "Adds local item helpers to a workspace.",
      entrypoint: "dist/index.js",
      minimumHostVersion: "0.3.0",
      permissions: ["read_object", "write_object"],
      capabilities: [
        { id: "read_items", permission: "read_object" },
        { id: "write_items", permission: "write_object" },
      ],
      tools: [
        { id: "summarize_items", name: "Summarize items", capability: "read_items" },
      ],
      resources: [
        { id: "item_catalog", name: "Item catalog", capability: "read_items" },
      ],
      prompts: [
        { id: "draft_note", name: "Draft note", capability: "read_items" },
      ],
    },
    sandboxReview: {
      reviewId: sandboxReviewId,
      fingerprint: sandboxFingerprint,
      pluginId: "plugin.local-tools",
      runLabel: "route-preview",
      ok: true,
      capabilities: {
        granted: ["read_items", "write_items"],
        required: ["read_items", "write_items"],
        observed: ["read_items"],
        missing: [],
      },
      hostApis: {
        denied: ["fs", "process"],
        deniedObserved: [],
      },
      limits: {
        maxAuditEvents: 12,
        maxTicks: 10,
        ticksUsed: 2,
        ticksRemaining: 8,
        tickBudgetExhausted: false,
      },
      audit: {
        total: 2,
        remaining: 10,
        overflow: false,
        byType: [
          { type: "capability.allowed", count: 1 },
          { type: "sandbox.run_started", count: 1 },
        ],
      },
      failureCategories: ["success"],
    },
    capabilityEvidence: [
      {
        capability: "read_items",
        declared: true,
        permission: "read_object",
        required: true,
        observed: true,
        granted: true,
        missing: false,
        decision: "granted",
      },
    ],
    hostApiEvidence: [
      {
        api: "fs",
        configuredDenied: true,
        observedDenied: false,
        decision: "blocked",
      },
    ],
    automationReferences: [
      { id: "bundle-check", kind: "workflow", label: "Bundle check" },
    ],
    auditReferences: [
      { id: "local-log", kind: "run-log", uri: "sovereignops://audit/local-log" },
    ],
    approvalGates: [
      { id: "owner-check", name: "Owner check", required: true, state: "approved" },
    ],
    evidence: [
      {
        id: "trace",
        kind: "local-trace",
        summary: "Local trace summary",
        localOnly: true,
        redacted: true,
        fingerprint: evidenceFingerprint,
      },
    ],
  };
}

function baseManifest() {
  return {
    id: "plugin.local-tools",
    name: "Local Tools",
    version: "1.2.3",
    description: "Adds local item helpers to a workspace.",
    entrypoint: ".\\dist\\index.js",
    capabilities: [
      {
        id: "write_items",
        permission: "write_object",
        description: "Create and update local items",
      },
      {
        id: "read_items",
        permission: "read_object",
        description: "Read local item titles and metadata",
      },
    ],
    tools: [
      {
        id: "summarize_items",
        name: "Summarize items",
        description: "Summarizes selected items",
        capability: "read_items",
      },
    ],
    resources: [
      {
        id: "item_catalog",
        name: "Item catalog",
        description: "Lists available items",
        uri: "sovereignops://items/catalog",
        capability: "read_items",
      },
    ],
    prompts: [
      {
        id: "draft_note",
        name: "Draft note",
        description: "Builds a concise note",
        capability: "read_items",
      },
    ],
    minimumHostVersion: "0.3.0",
  };
}

function recordResponseFromFixture(fixture, createFixture = fixture) {
  return {
    localOnly: true,
    redacted: true,
    kind: fixture.expect.kind,
    schemaVersion: fixture.expect.schemaVersion,
    recordId: fixture.expect.recordId,
    pluginId: fixture.expect.pluginId,
    record: createFixture.request.body.record,
  };
}

function recordListResponseFromFixture(fixture, createFixture) {
  return {
    localOnly: true,
    redacted: true,
    kind: fixture.expect.kind,
    schemaVersion: fixture.expect.schemaVersion,
    records: [createFixture.request.body.record],
    recordCount: fixture.expect.recordCount,
    statuses: fixture.expect.statuses,
    pluginIds: fixture.expect.pluginIds,
  };
}

function compareResponseFromFixture(fixture) {
  return {
    localOnly: true,
    redacted: true,
    kind: fixture.expect.kind,
    schemaVersion: fixture.expect.schemaVersion,
    matches: fixture.expect.matches,
    differenceCount: fixture.expect.differenceCount,
  };
}

async function validatedPublicBundle(file, validator) {
  const bundle = await readSchemaFixtureJson(file);
  const result = validator(bundle);

  assert.equal(result.ok, true, formatIssues(result.issues));
  assert.equal(Object.isFrozen(result.value), true);
  return result.value;
}

async function readSchemaFixtureJson(file) {
  return JSON.parse(await readFile(join(schemasFixturesDir, file), "utf8"));
}

function fixtureRequest(bundle, id) {
  const fixture = bundle.requests.find((request) => request.id === id);
  assert.notEqual(fixture, undefined);
  return fixture;
}

function baseUrlForFixture(bundle) {
  return new URL("v1/", bundle.apiBase.endsWith("/") ? bundle.apiBase : `${bundle.apiBase}/`).href;
}

function formatIssues(issues) {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
}

function fakeFetch(items) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const next = items.shift();
    if (next instanceof Error) {
      throw next;
    }
    if (next === undefined) {
      throw new Error("fake fetch response queue is empty");
    }
    return next;
  };
  fetch.calls = calls;
  return fetch;
}

function jsonResponse(status, body, headers = {}) {
  return textResponse(status, JSON.stringify(body), {
    "content-type": "application/json",
    ...headers,
  });
}

function textResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: statusTextFor(status),
    headers: headersLike(headers),
    async text() {
      return body;
    },
  };
}

function headersLike(headers) {
  const normalized = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    get(name) {
      return normalized.get(name.toLowerCase()) ?? null;
    },
  };
}

function statusTextFor(status) {
  if (status === 200) {
    return "OK";
  }
  if (status === 201) {
    return "Created";
  }
  if (status === 404) {
    return "Not Found";
  }
  if (status === 409) {
    return "Conflict";
  }
  return "";
}
