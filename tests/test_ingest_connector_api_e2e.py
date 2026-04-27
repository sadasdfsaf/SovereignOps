from __future__ import annotations

import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
FIXTURE_REL = "examples/ingest-search/connector-api-requests.json"
FIXTURE_PATH = ROOT / FIXTURE_REL

EXPECTED_CONNECTOR_IDS = [
    "local.files",
    "local.manual",
    "local.workspace-index",
]

PRIVATE_PATH_MARKERS = (
    "".join(("sovereignops", "-codex", "-pack")),
    "plan-pack",
    "private plan pack",
    "." + "codex-private",
    "." + "codex-run",
    "CODEX" + "_START" + "_HERE",
    "tasks" + "/backlog.jsonl",
    "tasks" + "\\backlog.jsonl",
)
RAW_SECRET_PATTERNS = (
    re.compile(r"sk-[A-Za-z0-9_-]{12,}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9_]{12,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"(?i)\bbearer\s+(?!\[REDACTED\]|\[redacted[:-])[A-Za-z0-9._~+/=-]+"),
    re.compile(
        r"(?i)(?:password|passwd|secret|api[_-]?key)"
        r"\s*[:=]\s*(?!\[REDACTED\]|\[redacted[:-])\S{4,}"
    ),
    re.compile(
        r"(?i)(?<![A-Za-z0-9_])(?<!\[redacted[:-])(?:lock[_-]?token|token)"
        r"\s*[:=]\s*(?!\[REDACTED\]|\[redacted[:-])\S{4,}"
    ),
)
RAW_PATH_PATTERNS = (
    re.compile(r"(?<![A-Za-z0-9])[A-Za-z]:[\\/]"),
    re.compile(r"\\\\[^\\\s]+\\[^\\\s]+"),
    re.compile(
        r"(?<![A-Za-z0-9_])/(?:Users|home|root|tmp|var|etc|opt|private|mnt|Volumes)(?:/|\b)"
    ),
    re.compile(r"(?<![A-Za-z0-9_])workspaces[\\/]"),
)

NODE_REPLAY_SCRIPT = r"""
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { createApiRouter } from "./apps/api/src/router.ts";
import { createIngestConnectorRoutes } from "./apps/api/src/ingestConnectorRoutes.ts";
import { runIngestConnectorApiReplayCli } from "./packages/cli/src/ingestConnectorApiReplay.ts";
import {
  createIngestConnectorClient,
  toApiResult,
} from "./packages/sdk-js/src/index.ts";
import {
  assertIngestConnectorApiManifest,
  ingestConnectorApiManifestSchema,
  validateIngestConnectorApiManifest,
} from "./packages/schemas/src/ingestConnectorApiManifest.ts";
import {
  buildIngestConnectorApiState,
  redactIngestConnectorApiText,
} from "./apps/web/src/ingestConnectorApiState.ts";

const fixturePath = "examples/ingest-search/connector-api-requests.json";
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
const expectedConnectorIds = [
  "local.files",
  "local.manual",
  "local.workspace-index",
];
const rawSecret = "sk-round49secret1234567890";
const rawPath = ["C:", "Users", "DELL", "connectors", "manifest.json"].join("\\");
let globalFetchCalls = 0;

globalThis.fetch = async () => {
  globalFetchCalls += 1;
  throw new Error("Live network fetch is disabled in connector API parity replay.");
};

assert.equal(fixture.schemaVersion, "ingest-connector-api-requests.v1");
assert.equal(fixture.apiBase, "local://ingest-connector-api");
assert.equal(fixture.localOnly, true);
assert.equal(fixture.network.mode, "disabled");
assert.equal(fixture.durableWrites, false);

const manifestEntry = requestById(fixture, "api_ingest_connectors_manifest");
const errorEntries = fixture.requests.filter((entry) => entry.expect.status >= 400);
assert.deepEqual(
  fixture.requests.map((entry) => entry.id),
  [
    "api_ingest_connectors_manifest",
    "api_ingest_connectors_bad_method",
    "api_ingest_connectors_bad_path",
  ],
);
assert.deepEqual(
  manifestEntry.expect.body.connectors.map((connector) => connector.id),
  expectedConnectorIds,
);
assert.deepEqual(
  errorEntries.map((entry) => [entry.id, entry.route.method, entry.expect.status]),
  [
    ["api_ingest_connectors_bad_method", "POST", 404],
    ["api_ingest_connectors_bad_path", "GET", 404],
  ],
);

const router = createApiRouter(createIngestConnectorRoutes());
const apiRoutes = router.listRoutes();
assert.deepEqual(apiRoutes.map((route) => `${route.method} ${route.path}`), [
  "GET /v1/ingest/connectors",
]);

const apiResponses = [];
for (const entry of fixture.requests) {
  const response = await router.dispatch({
    method: entry.route.method,
    path: entry.route.path,
    headers: entry.request.headers,
    ...(entry.request.body === undefined ? {} : { body: entry.request.body }),
  });

  apiResponses.push({ id: entry.id, response });
  assert.equal(response.status, entry.expect.status, entry.id);
  assert.match(response.headers["content-type"], /^application\/json/);
  assert.deepEqual(response.body, entry.expect.body, entry.id);
}

const apiManifest = apiResponses.find((entry) => entry.id === manifestEntry.id).response.body;
assert.equal(apiManifest.schemaVersion, "ingest-connector-manifest/v1");
assert.equal(apiManifest.localOnly, true);
assert.deepEqual(
  apiManifest.connectors.map((connector) => connector.id),
  expectedConnectorIds,
);
for (const connector of apiManifest.connectors) {
  assert.equal(connector.safety.localOnly, true, connector.id);
  assert.equal(connector.safety.networkAccess, false, connector.id);
  assert.equal(connector.safety.durableWrites, false, connector.id);
}

const schemaResult = validateIngestConnectorApiManifest(apiManifest);
assert.equal(schemaResult.ok, true, JSON.stringify(schemaResult.issues));
assert.deepEqual(schemaResult.issues, []);
assert.doesNotThrow(() => assertIngestConnectorApiManifest(apiManifest));
assert.deepEqual(validateWithJsonSchema(ingestConnectorApiManifestSchema, apiManifest), []);

const cliResult = await runIngestConnectorApiReplayCli([
  "ingest",
  "connectors",
  "api",
  "replay",
  "--fixture",
  fixturePath,
], {
  cwd: process.cwd(),
});
assert.ok(cliResult);
assert.equal(cliResult.exitCode, 0);
assert.equal(cliResult.stderr, "");
const cliReplay = JSON.parse(cliResult.stdout);
assert.equal(cliReplay.kind, "ingest-connector-api-fixture-replay");
assert.equal(cliReplay.schemaVersion, fixture.schemaVersion);
assert.equal(cliReplay.apiBase, "local://ingest-connector-api");
assert.equal(cliReplay.fixture.path, fixturePath);
assert.equal(cliReplay.totalRequests, 3);
assert.equal(cliReplay.passedRequests, 3);
assert.equal(cliReplay.failedRequests, 0);
assert.deepEqual(cliReplay.summary.expectedStatuses, { 200: 1, 404: 2 });
assert.deepEqual(cliReplay.summary.actualStatuses, { 200: 1, 404: 2 });
assert.deepEqual(
  cliReplay.requests.map((entry) => [entry.id, entry.actual.status, entry.matches]),
  [
    ["api_ingest_connectors_manifest", 200, { body: true, expectation: true, status: true }],
    ["api_ingest_connectors_bad_method", 404, { body: true, expectation: true, status: true }],
    ["api_ingest_connectors_bad_path", 404, { body: true, expectation: true, status: true }],
  ],
);
assert.deepEqual(
  cliReplay.requests[0].actual.body.connectors.map((connector) => connector.id),
  expectedConnectorIds,
);

const sdk = await loadSdkConnectorSurface(fixture);
assert.equal(sdk.manifest.localOnly, true);
assert.equal(sdk.manifest.profileCount, expectedConnectorIds.length);
assert.deepEqual([...sdk.profileIds].sort(), expectedConnectorIds);
assert.equal(sdk.readiness.localOnly, true);
assert.equal(sdk.readiness.profileCount, expectedConnectorIds.length);
assert.equal(globalFetchCalls, 0);
assert.equal(sdk.fetchCalls.every((call) => isLocalOnlyUrl(call.url)), true);

const webFixtureState = buildIngestConnectorApiState(fixture);
const webApiState = buildIngestConnectorApiState(apiManifest, { status: 200 });
const webCliState = buildIngestConnectorApiState(cliReplay);
const webSdkState = buildIngestConnectorApiState({ body: sdk.manifest, status: 200 });
assert.equal(webFixtureState.status, "ready");
assert.equal(webFixtureState.requestCount, 3);
assert.equal(webFixtureState.failedRequestCount, 0);
assert.equal(webFixtureState.errorStates.length, 0);
assert.equal(webApiState.connectorCount, expectedConnectorIds.length);
assert.equal(webApiState.requestCount, 1);
assert.equal(webCliState.requestCount, 3);
assert.equal(webCliState.failedRequestCount, 2);
assert.deepEqual(
  webCliState.errorStates.map((entry) => [entry.routeId, entry.method, entry.status]),
  [
    ["api_ingest_connectors_bad_method", "POST", 404],
    ["api_ingest_connectors_bad_path", "GET", 404],
  ],
);
assert.equal(webSdkState.connectorCount, expectedConnectorIds.length);

const redaction = await runRedactionProbe();
assert.equal(redaction.cli.passedRequests, 1);
assert.equal(redaction.cli.failedRequests, 0);
assert.equal(redaction.cli.requests[0].redactions.length >= 4, true);
assert.equal(redaction.sdkError.ok, false);
assert.match(redaction.web.errorStates[0].errorState.description, /\[redacted-/);
assert.equal(redaction.web.redacted, true);
assert.equal(
  redactIngestConnectorApiText(`token=${rawSecret} ${rawPath}`),
  "token=[redacted-secret] [redacted-path]",
);

const replay = {
  fixture: {
    path: fixturePath,
    schemaVersion: fixture.schemaVersion,
    localOnly: fixture.localOnly,
    networkMode: fixture.network.mode,
    requestIds: fixture.requests.map((entry) => entry.id),
    errorRequestIds: errorEntries.map((entry) => entry.id),
  },
  api: {
    routes: apiRoutes,
    connectorIds: apiManifest.connectors.map((connector) => connector.id),
    localOnly: apiManifest.localOnly,
  },
  cli: {
    kind: cliReplay.kind,
    fixture: cliReplay.fixture,
    passedRequests: cliReplay.passedRequests,
    failedRequests: cliReplay.failedRequests,
    statusSummary: cliReplay.summary.actualStatuses,
    requestIds: cliReplay.requests.map((entry) => entry.id),
  },
  sdk: {
    surface: sdk.surface,
    connectorIds: sdk.profileIds,
    localOnly: sdk.manifest.localOnly,
    readiness: {
      profileCount: sdk.readiness.profileCount,
      readyCount: sdk.readiness.readyCount,
      blockedCount: sdk.readiness.blockedCount,
    },
    fetchCalls: sdk.fetchCalls,
  },
  schema: {
    ok: schemaResult.ok,
    issueCount: schemaResult.issues.length,
  },
  web: {
    fixture: summarizeWebState(webFixtureState),
    api: summarizeWebState(webApiState),
    cli: summarizeWebState(webCliState),
    sdk: summarizeWebState(webSdkState),
  },
  redaction: {
    cli: {
      redactionCount: redaction.cli.requests[0].redactions.length,
      message: redaction.cli.requests[0].actual.body.error.message,
    },
    sdk: redaction.sdkErrorSummary,
    web: {
      redacted: redaction.web.redacted,
      redactionCount: redaction.web.redactionCount,
      error: redaction.web.errorStates[0].errorState.description,
    },
  },
  network: {
    globalFetchCalls,
    localOnly: true,
  },
};
assertNoUnsafeText(JSON.stringify(replay));
console.log(JSON.stringify(replay));

async function loadSdkConnectorSurface(bundle) {
  const harness = await maybeLoadConnectorFixtureHarness(bundle);
  if (harness !== undefined) {
    return harness;
  }

  const fetch = createConnectorFixtureFetch(bundle);
  const client = createIngestConnectorClient({
    baseUrl: "local://ingest-connector-api/v1/",
    apiKey: "round49-local-key",
    fetch,
  });
  const manifest = await client.getManifest();
  const readiness = await client.getReadiness();

  return {
    surface: "createIngestConnectorClient+inline-fixture-fetch",
    manifest,
    readiness,
    profileIds: manifest.profiles.map((profile) => profile.profileId),
    fetchCalls: fetch.calls.map(summarizeFetchCall),
  };
}

async function maybeLoadConnectorFixtureHarness(bundle) {
  let module;
  try {
    module = await import("./packages/sdk-js/src/ingestConnectorFixtureFetch.ts");
  } catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND" || error?.code === "ERR_UNKNOWN_FILE_EXTENSION") {
      return undefined;
    }
    return undefined;
  }

  const createHarness = module.createIngestConnectorFixtureClientHarness;
  if (typeof createHarness !== "function") {
    return undefined;
  }

  const candidateInputs = [
    { bundle },
    bundle,
    { bundle: connectorResponseBundle(bundle) },
    connectorResponseBundle(bundle),
  ];
  for (const input of candidateInputs) {
    try {
      const harness = createHarness(input);
      const client = harness.client ?? harness;
      const manifest = typeof client.getManifest === "function"
        ? await client.getManifest()
        : await client.manifest();
      const readiness = typeof client.getReadiness === "function"
        ? await client.getReadiness()
        : typeof client.readiness === "function"
          ? await client.readiness()
          : { localOnly: manifest.localOnly, profileCount: manifest.profileCount };

      return {
        surface: "createIngestConnectorFixtureClientHarness",
        manifest,
        readiness,
        profileIds: manifest.profiles.map((profile) => profile.profileId),
        fetchCalls: Array.from(harness.fetch?.calls ?? []).map(summarizeFetchCall),
      };
    } catch {
      continue;
    }
  }

  return undefined;
}

function createConnectorFixtureFetch(bundle) {
  const normalizedRequests = bundle.requests.map((entry) => ({
    id: entry.id,
    method: entry.route.method.toUpperCase(),
    path: normalizeFixturePath(entry.route.path),
    body: entry.request.body,
    response: responseForEntry(entry),
  }));
  const calls = [];

  const fetch = async (url, init = {}) => {
    assert.equal(isLocalOnlyUrl(url), true, `non-local SDK fixture URL: ${url}`);
    const requestUrl = new URL(url);
    const method = String(init.method ?? "GET").toUpperCase();
    const requestPath = `${requestUrl.pathname}${requestUrl.search}`;
    const body = init.body === undefined ? undefined : JSON.parse(init.body);
    const match = normalizedRequests.find((entry) =>
      entry.method === method &&
      entry.path === requestPath &&
      JSON.stringify(entry.body ?? null) === JSON.stringify(body ?? null)
    );
    if (match === undefined) {
      const response = fetchResponse(404, {
        error: {
          code: "INGEST_CONNECTOR_FIXTURE_REQUEST_NOT_FOUND",
          message: `No connector API fixture matched ${method} ${requestPath}`,
        },
      });
      calls.push({ url: String(url), method, path: requestPath, status: response.status });
      return response;
    }

    const response = fetchResponse(match.response.status, match.response.body, match.response.headers);
    calls.push({
      url: String(url),
      method,
      path: requestPath,
      matchedRequestId: match.id,
      status: response.status,
    });
    return response;
  };
  fetch.calls = calls;
  return fetch;
}

async function runRedactionProbe() {
  const tempDir = path.join(process.cwd(), "tests", ".tmp-ingest-connector-api-e2e");
  const redactionPath = path.join(tempDir, "connector-api-redaction.json");
  const redactionRel = path.relative(process.cwd(), redactionPath).split(path.sep).join("/");
  const unsafeMessage = `token=${rawSecret} failed at ${rawPath}`;
  const redactionFixture = {
    schemaVersion: fixture.schemaVersion,
    generatedAt: fixture.generatedAt,
    apiBase: fixture.apiBase,
    requests: [
      {
        id: "api_ingest_connectors_redaction",
        title: "Synthetic connector redaction",
        route: {
          method: "GET",
          path: "/v1/ingest/connectors",
        },
        request: {
          headers: {
            authorization: `Bearer ${rawSecret}`,
          },
          body: {
            debugPath: rawPath,
            sessionToken: rawSecret,
          },
        },
        response: {
          status: 500,
          body: {
            error: {
              code: "connector_fixture_mismatch",
              message: unsafeMessage,
              details: {
                debugPath: rawPath,
                token: rawSecret,
              },
            },
          },
        },
      },
    ],
  };

  let cliPayload;
  try {
    await mkdir(tempDir, { recursive: true });
    await writeFile(redactionPath, `${JSON.stringify(redactionFixture, null, 2)}\n`);
    const cli = await runIngestConnectorApiReplayCli([
      "ingest",
      "connectors",
      "api",
      "replay",
      "--fixture",
      redactionRel,
    ], {
      cwd: process.cwd(),
      dispatch: async () => ({
        status: 500,
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
        body: redactionFixture.requests[0].response.body,
      }),
    });
    assert.ok(cli);
    assert.equal(cli.exitCode, 0);
    assert.equal(cli.stderr, "");
    assertNoUnsafeText(cli.stdout);
    cliPayload = JSON.parse(cli.stdout);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  const sdkClient = createIngestConnectorClient({
    baseUrl: "local://ingest-connector-api/v1/",
    fetch: async (url, init = {}) => {
      assert.equal(isLocalOnlyUrl(url), true);
      return fetchResponse(500, redactionFixture.requests[0].response.body);
    },
  });
  const sdkError = await toApiResult(sdkClient.getManifest());
  assert.equal(sdkError.ok, false);
  const sdkErrorSummary = {
    ok: sdkError.ok,
    name: sdkError.error.name,
    status: sdkError.error.status,
    code: sdkError.error.code,
    apiCode: sdkError.error.apiCode,
    message: sdkError.error.message,
    apiMessage: sdkError.error.apiMessage,
    details: sdkError.error.details,
  };
  assertNoUnsafeText(JSON.stringify(sdkErrorSummary));

  const web = buildIngestConnectorApiState({
    requests: [
      {
        id: "api_ingest_connectors_redaction",
        title: `Synthetic connector redaction ${rawSecret}`,
        method: "GET",
        path: `/v1/ingest/connectors?token=${rawSecret}`,
        actual: {
          status: 500,
          body: redactionFixture.requests[0].response.body,
        },
      },
    ],
  });
  assertNoUnsafeText(JSON.stringify(web));

  return {
    cli: cliPayload,
    sdkError,
    sdkErrorSummary,
    web,
  };
}

function responseForEntry(entry) {
  if (entry.response !== undefined) {
    return entry.response;
  }
  return {
    status: entry.expect.status,
    headers: {
      "content-type": entry.expect.contentType ?? "application/json",
    },
    body: entry.expect.body,
  };
}

function connectorResponseBundle(bundle) {
  return {
    ...bundle,
    requests: bundle.requests.map((entry) => ({
      ...entry,
      response: responseForEntry(entry),
    })),
  };
}

function fetchResponse(status, body, headers = {}) {
  const responseHeaders = {
    "content-type": "application/json",
    ...headers,
  };
  const text = JSON.stringify(body);

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : status === 500 ? "Internal Server Error" : "",
    headers: {
      get(name) {
        return responseHeaders[String(name).toLowerCase()] ?? null;
      },
    },
    async text() {
      return text;
    },
    async json() {
      return structuredClone(body);
    },
    clone() {
      return fetchResponse(status, body, responseHeaders);
    },
  };
}

function requestById(bundle, id) {
  const entry = bundle.requests.find((request) => request.id === id);
  assert.notEqual(entry, undefined, `missing fixture request ${id}`);
  return entry;
}

function normalizeFixturePath(value) {
  const url = new URL(value, "local://ingest-connector-api");
  return `${url.pathname}${url.search}`;
}

function isLocalOnlyUrl(value) {
  const url = new URL(String(value));
  return (
    url.protocol === "local:" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "localhost" ||
    url.hostname === "::1"
  );
}

function summarizeFetchCall(call) {
  return {
    url: call.url,
    method: call.method,
    path: call.path,
    matchedRequestId: call.matchedRequestId,
    status: call.status,
  };
}

function summarizeWebState(state) {
  return {
    status: state.status,
    requestCount: state.requestCount,
    successfulRequestCount: state.successfulRequestCount,
    failedRequestCount: state.failedRequestCount,
    connectorCount: state.connectorCount,
    warningCount: state.warningCount,
    errorCount: state.errorStates.length,
    redacted: state.redacted,
  };
}

function validateWithJsonSchema(schema, value, currentPath = "$", issues = []) {
  if (schema.type && !matchesSchemaType(schema.type, value)) {
    issues.push({ path: currentPath, message: `expected ${schema.type}` });
    return issues;
  }
  if (schema.const !== undefined && value !== schema.const) {
    issues.push({ path: currentPath, message: `expected ${schema.const}` });
  }
  if (schema.enum && !schema.enum.includes(value)) {
    issues.push({ path: currentPath, message: `expected one of ${schema.enum.join(", ")}` });
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      issues.push({ path: currentPath, message: `expected at least ${schema.minLength} chars` });
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      issues.push({ path: currentPath, message: `expected pattern ${schema.pattern}` });
    }
  }
  if (typeof value === "number" && schema.minimum !== undefined && value < schema.minimum) {
    issues.push({ path: currentPath, message: `expected minimum ${schema.minimum}` });
  }
  if (schema.type === "array" && Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      issues.push({ path: currentPath, message: `expected at least ${schema.minItems} items` });
    }
    if (schema.uniqueItems) {
      const serialized = value.map((item) => JSON.stringify(item));
      if (new Set(serialized).size !== serialized.length) {
        issues.push({ path: currentPath, message: "expected unique items" });
      }
    }
    if (schema.items) {
      value.forEach((item, index) =>
        validateWithJsonSchema(schema.items, item, `${currentPath}[${index}]`, issues)
      );
    }
  }
  if (schema.type === "object" && isRecord(value)) {
    const properties = schema.properties ?? {};
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) {
        issues.push({ path: `${currentPath}.${key}`, message: "required" });
      }
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(properties));
      for (const key of Object.keys(value)) {
        if (!allowed.has(key)) {
          issues.push({ path: `${currentPath}.${key}`, message: "not allowed" });
        }
      }
    }
    for (const [key, nestedSchema] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) {
        validateWithJsonSchema(nestedSchema, value[key], `${currentPath}.${key}`, issues);
      }
    }
  }
  return issues;
}

function matchesSchemaType(type, value) {
  if (Array.isArray(type)) {
    return type.some((entry) => matchesSchemaType(entry, value));
  }

  switch (type) {
    case "array":
      return Array.isArray(value);
    case "boolean":
      return typeof value === "boolean";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "number":
      return typeof value === "number";
    case "object":
      return isRecord(value);
    case "string":
      return typeof value === "string";
    default:
      return true;
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertNoUnsafeText(text) {
  for (const marker of [
    ".codex-private",
    ".codex-run",
    "sovereignops-codex-pack",
    "plan-pack",
    "private plan pack",
    "CODEX_START_HERE",
  ]) {
    assert.equal(text.toLowerCase().includes(marker.toLowerCase()), false, marker);
  }
  assert.equal(/(?<![A-Za-z0-9])[A-Za-z]:[\\/]/.test(text), false);
  assert.equal(/\\\\[^\\\s]+\\[^\\\s]+/.test(text), false);
  assert.equal(/(?:\/Users|\/home|\/root|\/tmp|\/var|\/etc|\/opt|\/private|\/mnt|\/Volumes)\//.test(text), false);
  assert.equal(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|AKIA[0-9A-Z]{16})\b/.test(text), false);
  assert.equal(/\bbearer\s+(?!\[REDACTED\]|\[redacted[:-])[A-Za-z0-9._~+/=-]+/i.test(text), false);
  assert.equal(/\b(?:token|secret|api[_-]?key)\s*[:=]\s*(?!\[REDACTED\]|\[redacted[:-])\S{4,}/i.test(text), false);
}
"""


class IngestConnectorApiE2ETests(unittest.TestCase):
    maxDiff = None

    def test_connector_api_fixture_matches_runtime_surfaces(self) -> None:
        node = shutil.which("node")
        if node is None:
            self.skipTest("node executable is required for connector API parity replay")

        fixture = read_json(FIXTURE_PATH)
        self.assertEqual(fixture["schemaVersion"], "ingest-connector-api-requests.v1")
        self.assertEqual(fixture["apiBase"], "local://ingest-connector-api")
        self.assertEqual(fixture["localOnly"], True)
        self.assertEqual(fixture["network"]["mode"], "disabled")
        self.assertEqual(
            fixture["requests"][0]["expect"]["body"]["connectors"][0]["id"],
            EXPECTED_CONNECTOR_IDS[0],
        )

        result = subprocess.run(
            [node, "--input-type=module", "--eval", NODE_REPLAY_SCRIPT],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
            timeout=45,
        )
        if result.returncode != 0:
            self.fail(
                "Node connector API parity replay failed.\n"
                f"stdout:\n{result.stdout}\n"
                f"stderr:\n{result.stderr}"
            )

        replay = json.loads(result.stdout)
        self.assertEqual(replay["fixture"]["path"], FIXTURE_REL)
        self.assertEqual(replay["fixture"]["localOnly"], True)
        self.assertEqual(replay["fixture"]["networkMode"], "disabled")
        self.assertEqual(replay["fixture"]["errorRequestIds"], [
            "api_ingest_connectors_bad_method",
            "api_ingest_connectors_bad_path",
        ])
        self.assertEqual(replay["api"]["connectorIds"], EXPECTED_CONNECTOR_IDS)
        self.assertEqual(replay["api"]["localOnly"], True)
        self.assertEqual(replay["cli"]["passedRequests"], 3)
        self.assertEqual(replay["cli"]["failedRequests"], 0)
        self.assertEqual(replay["cli"]["statusSummary"], {"200": 1, "404": 2})
        self.assertEqual(sorted(replay["sdk"]["connectorIds"]), EXPECTED_CONNECTOR_IDS)
        self.assertEqual(replay["sdk"]["localOnly"], True)
        self.assertEqual(replay["schema"]["ok"], True)
        self.assertEqual(replay["schema"]["issueCount"], 0)
        self.assertEqual(replay["web"]["fixture"]["requestCount"], 3)
        self.assertEqual(replay["web"]["cli"]["failedRequestCount"], 2)
        self.assertEqual(replay["network"]["globalFetchCalls"], 0)
        self.assertEqual(replay["network"]["localOnly"], True)
        self.assertGreaterEqual(replay["redaction"]["cli"]["redactionCount"], 4)

        combined_public_output = "\n".join(
            [
                FIXTURE_PATH.read_text(encoding="utf-8"),
                json.dumps(replay, sort_keys=True),
            ]
        )
        assert_no_private_plan_or_raw_sensitive_output(self, combined_public_output)


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def assert_no_private_plan_or_raw_sensitive_output(
    testcase: unittest.TestCase,
    text: str,
) -> None:
    lower_text = text.lower()

    for marker in PRIVATE_PATH_MARKERS:
        with testcase.subTest(marker=marker):
            testcase.assertNotIn(marker.lower(), lower_text)

    for pattern in RAW_PATH_PATTERNS:
        with testcase.subTest(pattern=pattern.pattern):
            testcase.assertIsNone(pattern.search(text))

    for pattern in RAW_SECRET_PATTERNS:
        with testcase.subTest(pattern=pattern.pattern):
            testcase.assertIsNone(pattern.search(text))


if __name__ == "__main__":
    unittest.main()
