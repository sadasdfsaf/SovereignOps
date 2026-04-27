import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createLocalEventCatalogRoutes } from "../src/localEventCatalogRoutes.ts";
import { createLocalEventReplayExportRoutes } from "../src/localEventReplayExportRoutes.ts";
import { createApiRouter } from "../src/router.ts";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDirectory, "../../..");
const requestExamples = readJson("examples/local-events/api-requests.json");
const catalogPath = requestExamples.catalog.path;
const exportCreatedAt = "2026-04-27T12:31:00.000Z";
const exportId = "local_replay_api_acceptance";

test("replays documented local event API examples through the in-memory router", async () => {
  const router = createLocalEventApiRouter();

  for (const example of requestExamples.requests) {
    const response = await router.dispatch({
      method: example.route.method,
      path: example.route.path,
      body: example.request.body,
    });

    assertJsonResponse(response, example.response.status);
    assertDocumentedBodyExcerpt(response.body, example.response.body, example.id);
    assertLocalOnlyBehavior(response.body, example.id);
    assertNoRawSensitiveMetadata(response.body, example.id);
  }
});

test("exports the local event replay package with deterministic fingerprints", async () => {
  const router = createLocalEventApiRouter();
  const request = {
    method: "POST",
    path: "/v1/local-events/replay-export/package",
    body: {
      catalogPath,
      createdAt: exportCreatedAt,
      exportId,
    },
  };

  const first = await router.dispatch(request);
  const second = await router.dispatch(structuredClone(request));

  assertJsonResponse(first, 200);
  assertJsonResponse(second, 200);
  assert.deepEqual(first.body, second.body);
  assert.equal(first.body.kind, "audit-export.local-event-replay.package");
  assert.equal(first.body.manifest.exportId, exportId);
  assert.equal(first.body.manifest.createdAt, exportCreatedAt);
  assert.equal(first.body.manifest.recordCount, requestExamples.catalog.eventCount);
  assert.deepEqual(first.body.manifest.recordTypes, ["canonical_event"]);
  assert.deepEqual(first.body.manifest.workspaceIds, [requestExamples.catalog.workspaceId]);
  assert.deepEqual(first.body.manifest.recordFingerprints, [
    "fnv1a64:99783442e5b69009",
    "fnv1a64:8345b1f4b045189b",
    "fnv1a64:7cfba0cbfcd72ab4",
    "fnv1a64:d2c332b149cc1b89",
    "fnv1a64:5ff3e65aa8b43677",
  ]);
  assert.equal(first.body.manifest.jsonl.fingerprint, "fnv1a64:5f023bc3b7f88863");
  assert.equal(first.body.manifest.csv.fingerprint, "fnv1a64:394c77021ba220d9");
  assert.equal(first.body.manifest.fingerprint, "fnv1a64:1e1cbb833db3efe2");
  assert.equal(first.body.fingerprint, "fnv1a64:35e3caed4b7d03d2");
  assertExportContentIsLocalOnly(first.body);
  assertNoRawSensitiveMetadata(first.body, "local_event_replay_export_package");
});

test("exports JSONL through the flexible replay export route", async () => {
  const router = createLocalEventApiRouter();

  const response = await router.dispatch({
    method: "POST",
    path: "/v1/local-events/replay-export",
    body: {
      catalogPath,
      createdAt: exportCreatedAt,
      exportId,
      format: "jsonl",
    },
  });

  assertJsonResponse(response, 200);
  assert.equal(response.body.kind, "audit-export.local-event-replay.content");
  assert.equal(response.body.format, "jsonl");
  assert.equal(response.body.mediaType, "application/jsonl");
  assert.equal(response.body.exportId, exportId);
  assert.equal(response.body.fingerprint, "fnv1a64:5f023bc3b7f88863");
  assert.equal(response.body.fingerprint, response.body.manifest.jsonl.fingerprint);
  assert.equal(response.body.content.split("\n").length, requestExamples.catalog.eventCount);
  assertExportContentIsLocalOnly(response.body);
  assertNoRawSensitiveMetadata(response.body, "local_event_replay_export_jsonl");
});

test("returns JSON-only standard errors for malformed local event requests", async () => {
  const router = createLocalEventApiRouter();

  const response = await router.dispatch({
    method: "GET",
    path: "/v1/local-events/replay-batches",
    body: {
      catalogPath,
      apiKey: "sk_local_event_acceptance_should_not_leak",
      replay: {
        batchSize: 0,
      },
    },
  });

  assertJsonError(response, 400, "validation_failed");
  assert.deepEqual(response.body.error.details, { path: "body.replay.batchSize" });
  assertNoRawSensitiveMetadata(response.body, "malformed_local_event_replay_request");
});

function createLocalEventApiRouter() {
  return createApiRouter([
    ...createLocalEventCatalogRoutes({ workspaceRoot }),
    ...createLocalEventReplayExportRoutes({ workspaceRoot }),
  ]);
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(workspaceRoot, path), "utf8"));
}

function assertJsonResponse(response, status) {
  assert.equal(response.status, status);
  assert.match(response.headers["content-type"], /^application\/json/);
}

function assertJsonError(response, status, code) {
  assertJsonResponse(response, status);
  assert.deepEqual(Object.keys(response.body), ["error"]);
  assert.deepEqual(Object.keys(response.headers), ["content-type"]);
  assert.equal(response.body.error.code, code);
  assert.equal(typeof response.body.error.message, "string");
  assert.ok(response.body.error.message.length > 0);
}

function assertDocumentedBodyExcerpt(actual, expected, label) {
  if (typeof expected.eventCount === "number" && Array.isArray(actual.events)) {
    assert.equal(actual.events.length, expected.eventCount, `${label}: event count`);
  }
  if (Array.isArray(expected.eventIds)) {
    assert.deepEqual(
      actual.events.map((event) => event.id),
      expected.eventIds,
      `${label}: event ids`,
    );
  }
  if (typeof expected.eventsRef === "string") {
    assert.equal(expected.eventsRef, `${catalogPath}#events`, `${label}: documented events ref`);
    assert.ok(Array.isArray(actual.events), `${label}: catalog response includes events`);
  }
  if (typeof expected.batchCount === "number") {
    assert.equal(actual.batches.length, expected.batchCount, `${label}: batch count`);
  }
  if (Array.isArray(expected.batches)) {
    expected.batches.forEach((expectedBatch, index) => {
      const actualBatch = actual.batches[index];
      if (Array.isArray(expectedBatch.eventRefs)) {
        assert.deepEqual(
          actualBatch.events.map((event) => `catalog.events[${event.sequence - 1}]`),
          expectedBatch.eventRefs,
          `${label}.batches[${index}]: event refs`,
        );
      }
      if (Array.isArray(expectedBatch.payloadDigests)) {
        assert.deepEqual(
          actualBatch.events.map((event) => event.payloadDigest),
          expectedBatch.payloadDigests,
          `${label}.batches[${index}]: payload digests`,
        );
      }
    });
  }

  assertObjectExcerpt(actual, expected, label, new Set([
    "batchCount",
    "eventCount",
    "eventIds",
    "eventRefs",
    "eventsRef",
    "payloadDigests",
  ]));
}

function assertObjectExcerpt(actual, expected, label, skippedKeys = new Set()) {
  if (Array.isArray(expected)) {
    assert.equal(actual.length, expected.length, `${label}: array length`);
    expected.forEach((item, index) => {
      assertObjectExcerpt(actual[index], item, `${label}[${index}]`, skippedKeys);
    });
    return;
  }

  if (isRecord(expected)) {
    assert.ok(isRecord(actual), `${label}: expected object`);
    for (const [key, expectedValue] of Object.entries(expected)) {
      if (skippedKeys.has(key)) {
        continue;
      }
      assert.ok(Object.hasOwn(actual, key), `${label}.${key}: missing`);
      assertObjectExcerpt(actual[key], expectedValue, `${label}.${key}`, skippedKeys);
    }
    return;
  }

  assert.deepEqual(actual, expected, label);
}

function assertLocalOnlyBehavior(body, label) {
  const localOnlyValues = collectValuesForKey(body, "localOnly");

  if (localOnlyValues.length > 0) {
    assert.ok(
      localOnlyValues.every((value) => value === true),
      `${label}: every localOnly marker is true`,
    );
  }
}

function assertExportContentIsLocalOnly(body) {
  for (const record of parseExportRecords(body)) {
    assert.equal(record.workspaceId, requestExamples.catalog.workspaceId);
    assert.equal(record.recordType, "canonical_event");
    assert.equal(record.metadata.localOnly, true);
  }
}

function parseExportRecords(body) {
  const content = typeof body.content === "string" ? body.content : body.jsonl;
  return content
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

function assertNoRawSensitiveMetadata(value, label) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);

  assert.doesNotMatch(serialized, /\b(?:sk|pk|tok|pat)_[A-Za-z0-9_-]{8,}\b/, `${label}: secret-like token leaked`);
  assert.doesNotMatch(serialized, /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/i, `${label}: bearer token leaked`);

  const findings = [];
  collectRawSensitiveFields(value, "$", findings);
  assert.deepEqual(findings, [], `${label}: raw sensitive fields`);
}

function collectRawSensitiveFields(value, path, findings) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectRawSensitiveFields(item, `${path}[${index}]`, findings);
    });
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`;
    if (isSensitiveKey(key) && nested !== "[REDACTED]") {
      findings.push(nestedPath);
    }
    collectRawSensitiveFields(nested, nestedPath, findings);
  }
}

function collectValuesForKey(value, key) {
  const values = [];
  collectValuesForKeyInto(value, key, values);
  return values;
}

function collectValuesForKeyInto(value, key, values) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectValuesForKeyInto(item, key, values);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [entryKey, nested] of Object.entries(value)) {
    if (entryKey === key) {
      values.push(nested);
    }
    collectValuesForKeyInto(nested, key, values);
  }
}

function isSensitiveKey(key) {
  const normalized = key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toLowerCase();

  return [
    "api_key",
    "authorization",
    "client_secret",
    "credential",
    "password",
    "passphrase",
    "private_key",
    "refresh_token",
    "secret",
    "session",
    "session_id",
    "token",
  ].some((part) => normalized === part || normalized.endsWith(`_${part}`));
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
