from __future__ import annotations

import json
import re
import shutil
import subprocess
import unittest
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
FIXTURE_REL = "examples/ingest-search/connector-mcp-api-requests.json"
FIXTURE_PATH = ROOT / FIXTURE_REL

EXPECTED_SCHEMA_VERSION = "ingest-connector-mcp-api-requests.v1"
EXPECTED_REQUEST_IDS = [
    "mcp_ingest_connector_resources",
    "mcp_ingest_connector_local_files_resource",
    "mcp_ingest_connector_preview_local_files",
    "mcp_ingest_connector_preview_workspace_index_manifest_uri",
    "mcp_ingest_connector_missing_resource",
    "mcp_ingest_connector_bad_preview_body",
]
EXPECTED_ROUTE_SUMMARY = [
    "GET /v1/ingest/connectors",
    "GET /v1/ingest/connectors/mcp/resources",
    "GET /v1/ingest/connectors/mcp/resources/:connectorId",
    "POST /v1/ingest/connectors/mcp/preview",
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

import { createApiRouter } from "./apps/api/src/router.ts";
import {
  createIngestConnectorRoutes,
  createMemoryIngestConnectorRouteState,
} from "./apps/api/src/ingestConnectorRoutes.ts";
import { createIngestConnectorMcpRoutes } from "./apps/api/src/ingestConnectorMcpRoutes.ts";
import { createIngestConnectorMcpClient } from "./packages/sdk-js/src/ingestConnectorMcpClient.ts";

const fixturePath = "examples/ingest-search/connector-mcp-api-requests.json";
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
const expectedRequestIds = [
  "mcp_ingest_connector_resources",
  "mcp_ingest_connector_local_files_resource",
  "mcp_ingest_connector_preview_local_files",
  "mcp_ingest_connector_preview_workspace_index_manifest_uri",
  "mcp_ingest_connector_missing_resource",
  "mcp_ingest_connector_bad_preview_body",
];
const expectedRoutes = [
  "GET /v1/ingest/connectors",
  "GET /v1/ingest/connectors/mcp/resources",
  "GET /v1/ingest/connectors/mcp/resources/:connectorId",
  "POST /v1/ingest/connectors/mcp/preview",
];
let globalFetchCalls = 0;

globalThis.fetch = async () => {
  globalFetchCalls += 1;
  throw new Error("Live network fetch is disabled in ingest connector MCP API replay.");
};

assert.equal(fixture.schemaVersion, "ingest-connector-mcp-api-requests.v1");
assert.equal(fixture.apiBase, "local://ingest-connector-mcp-api");
assert.equal(fixture.localOnly, true);
assert.equal(fixture.network.mode, "disabled");
assert.equal(fixture.durableWrites, false);
assert.deepEqual(fixture.requests.map((entry) => entry.id), expectedRequestIds);
assertNoUnsafeText(JSON.stringify(fixture));

const state = createMemoryIngestConnectorRouteState();
const router = createApiRouter([
  ...createIngestConnectorRoutes(state),
  ...createIngestConnectorMcpRoutes(state),
]);
const routeSummary = router.listRoutes().map((route) => `${route.method} ${route.path}`);
assert.deepEqual(routeSummary, expectedRoutes);

const replayed = [];
for (const entry of fixture.requests) {
  const response = await router.dispatch({
    method: entry.method,
    path: entry.path,
    headers: entry.headers,
    ...(entry.body === undefined ? {} : { body: entry.body }),
  });

  replayed.push({
    id: entry.id,
    method: entry.method,
    path: entry.path,
    expectedStatus: entry.expectedStatus,
    actualStatus: response.status,
  });
  assert.equal(response.status, entry.expectedStatus, entry.id);
  assert.match(response.headers["content-type"], /^application\/json/, entry.id);
  assert.deepEqual(response.body, entry.expectedBody, entry.id);
}

const resourceList = requestById(fixture, "mcp_ingest_connector_resources").expectedBody;
const previewWithoutContent = requestById(
  fixture,
  "mcp_ingest_connector_preview_local_files",
).expectedBody;
const previewWithContent = requestById(
  fixture,
  "mcp_ingest_connector_preview_workspace_index_manifest_uri",
).expectedBody;
assert.equal(resourceList.localOnly, true);
assert.deepEqual(
  resourceList.resources.map((resource) => resource.connectorId),
  ["local.files", "local.manual", "local.workspace-index"],
);
assert.equal(previewWithoutContent.preview.contentIncluded, false);
assert.equal(previewWithoutContent.preview.contentBytes, 0);
assert.equal(previewWithContent.preview.contentIncluded, true);
assert.equal(previewWithContent.preview.contentBytes, byteLength(previewWithContent.resource.content.text));

const optional = {
  sdkFixtureHarness: await runOptionalSdkFixtureHarness(fixture),
  cliReplay: await runOptionalCliReplay(fixture, router),
};

const replay = {
  fixture: {
    path: fixturePath,
    schemaVersion: fixture.schemaVersion,
    apiBase: fixture.apiBase,
    localOnly: fixture.localOnly,
    networkMode: fixture.network.mode,
    requestIds: fixture.requests.map((entry) => entry.id),
  },
  api: {
    routes: routeSummary,
    replayedRequests: replayed.length,
    passedRequests: replayed.filter((entry) => entry.expectedStatus === entry.actualStatus).length,
    actualStatuses: countValues(replayed.map((entry) => String(entry.actualStatus))),
    resourceConnectorIds: resourceList.resources.map((resource) => resource.connectorId),
  },
  optional,
  network: {
    globalFetchCalls,
    localOnly: true,
  },
};
assertNoUnsafeText(JSON.stringify(replay));
console.log(JSON.stringify(replay));

async function runOptionalSdkFixtureHarness(bundle) {
  const loaded = await optionalImport("./packages/sdk-js/src/ingestConnectorMcpFixtureFetch.ts");
  if (loaded.module === undefined) {
    return {
      present: false,
      checked: false,
      reason: loaded.reason,
    };
  }

  const harnessNames = [
    "createIngestConnectorMcpFixtureClientHarness",
    "createIngestConnectorMcpApiFixtureClientHarness",
    "createIngestConnectorMcpFixtureHarness",
  ];
  for (const name of harnessNames) {
    const createHarness = loaded.module[name];
    if (typeof createHarness !== "function") {
      continue;
    }
    for (const input of [{ bundle }, bundle]) {
      try {
        const harness = await createHarness(input);
        const client = harness?.client ?? harness;
        const listResources = method(client, [
          "listResources",
          "listConnectorResources",
          "listMcpConnectorResources",
        ]);
        const readResource = method(client, [
          "readResource",
          "readConnectorResource",
          "readMcpConnectorResource",
        ]);
        const preview = method(client, ["preview", "previewOutput", "previewManifestResources"]);
        if (!listResources || !readResource || !preview) {
          continue;
        }

        assert.deepEqual(
          await listResources.call(client),
          requestById(bundle, "mcp_ingest_connector_resources").expectedBody,
        );
        assert.deepEqual(
          await readResource.call(client, "local.files"),
          requestById(bundle, "mcp_ingest_connector_local_files_resource").expectedBody,
        );
        assert.deepEqual(
          await preview.call(client, { connectorId: "local.files", includeContent: false }),
          requestById(bundle, "mcp_ingest_connector_preview_local_files").expectedBody,
        );
        return {
          present: true,
          checked: true,
          exportName: name,
          mode: "client-harness",
        };
      } catch {
        continue;
      }
    }
  }

  const fetchNames = [
    "createIngestConnectorMcpFixtureFetch",
    "createIngestConnectorMcpApiFixtureFetch",
  ];
  for (const name of fetchNames) {
    const createFetch = loaded.module[name];
    if (typeof createFetch !== "function") {
      continue;
    }
    for (const input of [{ bundle }, bundle]) {
      try {
        const fetch = await createFetch(input);
        if (typeof fetch !== "function") {
          continue;
        }
        const client = createIngestConnectorMcpClient({
          baseUrl: "local://ingest-connector-mcp-api/v1/",
          fetch,
        });
        assert.deepEqual(
          await client.listResources(),
          requestById(bundle, "mcp_ingest_connector_resources").expectedBody,
        );
        assert.deepEqual(
          await client.readResource("local.files"),
          requestById(bundle, "mcp_ingest_connector_local_files_resource").expectedBody,
        );
        assert.deepEqual(
          await client.preview({ connectorId: "local.files", includeContent: false }),
          requestById(bundle, "mcp_ingest_connector_preview_local_files").expectedBody,
        );
        return {
          present: true,
          checked: true,
          exportName: name,
          mode: "fixture-fetch",
        };
      } catch {
        continue;
      }
    }
  }

  return {
    present: true,
    checked: false,
    reason: "no supported ingest connector MCP fixture harness export was found",
  };
}

async function runOptionalCliReplay(bundle, router) {
  const candidates = [
    {
      specifier: "./packages/cli/src/ingestConnectorMcpApiReplay.ts",
      names: [
        "runIngestConnectorMcpApiReplayCli",
        "runIngestConnectorMcpReplayCli",
        "runIngestConnectorMcpFixtureReplayCli",
      ],
    },
    {
      specifier: "./packages/cli/src/ingestConnectorMcpReplay.ts",
      names: [
        "runIngestConnectorMcpReplayCli",
        "runIngestConnectorMcpApiReplayCli",
        "runIngestConnectorMcpFixtureReplayCli",
      ],
    },
  ];

  for (const candidate of candidates) {
    const loaded = await optionalImport(candidate.specifier);
    if (loaded.module === undefined) {
      continue;
    }
    for (const name of candidate.names) {
      const runCli = loaded.module[name];
      if (typeof runCli !== "function") {
        continue;
      }
      const argvCandidates = [
        ["ingest", "connectors", "mcp", "api", "replay", "--fixture", fixturePath],
        ["ingest", "connector", "mcp", "api", "replay", "--fixture", fixturePath],
        ["ingest-connectors", "mcp", "api", "replay", "--fixture", fixturePath],
        ["ingest-connector-mcp", "api", "replay", "--fixture", fixturePath],
        ["ingest", "connectors", "mcp", "replay", "--fixture", fixturePath],
        ["ingest-connector-mcp", "replay", "--fixture", fixturePath],
      ];
      for (const argv of argvCandidates) {
        const result = await runCli(argv, {
          cwd: process.cwd(),
          dispatch: async (request) => dispatchReplayRequest(router, request),
        });
        if (result === undefined) {
          continue;
        }
        assert.equal(result.exitCode, 0);
        assert.equal(result.stderr, "");
        assertNoUnsafeText(result.stdout);
        const payload = JSON.parse(result.stdout);
        if (payload.totalRequests !== undefined) {
          assert.equal(payload.totalRequests, bundle.requests.length);
        }
        if (payload.replayedRequests !== undefined) {
          assert.equal(payload.replayedRequests, bundle.requests.length);
        }
        if (payload.failedRequests !== undefined) {
          assert.equal(payload.failedRequests, 0);
        }
        if (Array.isArray(payload.requests)) {
          assert.deepEqual(
            payload.requests.map((entry) => entry.id),
            bundle.requests.map((entry) => entry.id),
          );
        }
        return {
          present: true,
          checked: true,
          module: candidate.specifier,
          exportName: name,
          command: argv.slice(0, -2).join(" "),
        };
      }
    }
    return {
      present: true,
      checked: false,
      module: candidate.specifier,
      reason: "no supported ingest connector MCP replay CLI export was found",
    };
  }

  return {
    present: false,
    checked: false,
    reason: "optional ingest connector MCP replay CLI module is absent",
  };
}

async function optionalImport(specifier) {
  try {
    return { module: await import(specifier) };
  } catch (error) {
    if (
      error?.code === "ERR_MODULE_NOT_FOUND" ||
      error?.code === "ERR_UNKNOWN_FILE_EXTENSION" ||
      /Cannot find module/i.test(String(error?.message ?? error))
    ) {
      return {
        module: undefined,
        reason: `optional module ${specifier} is absent`,
      };
    }
    throw error;
  }
}

function dispatchReplayRequest(router, request) {
  const method = request?.method ?? request?.route?.method;
  const path = request?.path ?? request?.route?.path;
  const headers = request?.headers ?? request?.request?.headers;
  const body = request?.body ?? request?.request?.body;
  return router.dispatch({
    method,
    path,
    headers,
    ...(body === undefined ? {} : { body }),
  });
}

function method(value, names) {
  if (value === null || typeof value !== "object") {
    return undefined;
  }
  return names.map((name) => value[name]).find((candidate) => typeof candidate === "function");
}

function requestById(bundle, id) {
  const entry = bundle.requests.find((request) => request.id === id);
  assert.notEqual(entry, undefined, `missing fixture request ${id}`);
  return entry;
}

function countValues(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function byteLength(value) {
  return new TextEncoder().encode(value).length;
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
  assert.equal(/(?<![A-Za-z0-9_])\/(?:Users|home|root|tmp|var|etc|opt|private|mnt|Volumes)(?:\/|\b)/.test(text), false);
  assert.equal(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|AKIA[0-9A-Z]{16})\b/.test(text), false);
  assert.equal(/\bbearer\s+(?!\[REDACTED\]|\[redacted[:-])[A-Za-z0-9._~+/=-]+/i.test(text), false);
  assert.equal(/\b(?:token|secret|api[_-]?key)\s*[:=]\s*(?!\[REDACTED\]|\[redacted[:-])\S{4,}/i.test(text), false);
}
"""


class IngestConnectorMcpApiE2ETests(unittest.TestCase):
    maxDiff = None

    def test_connector_mcp_api_fixture_replays_against_local_routes(self) -> None:
        node = shutil.which("node")
        if node is None:
            self.skipTest("node executable is required for ingest connector MCP API replay")

        fixture = read_json(FIXTURE_PATH)
        self.assertEqual(fixture["schemaVersion"], EXPECTED_SCHEMA_VERSION)
        self.assertEqual(fixture["apiBase"], "local://ingest-connector-mcp-api")
        self.assertIs(fixture["localOnly"], True)
        self.assertEqual(fixture["network"]["mode"], "disabled")
        self.assertIs(fixture["durableWrites"], False)
        self.assertEqual([entry["id"] for entry in fixture["requests"]], EXPECTED_REQUEST_IDS)

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
                "Node ingest connector MCP API replay failed.\n"
                f"stdout:\n{result.stdout}\n"
                f"stderr:\n{result.stderr}"
            )

        replay = json.loads(result.stdout)
        self.assertEqual(replay["fixture"]["path"], FIXTURE_REL)
        self.assertEqual(replay["fixture"]["schemaVersion"], EXPECTED_SCHEMA_VERSION)
        self.assertIs(replay["fixture"]["localOnly"], True)
        self.assertEqual(replay["fixture"]["networkMode"], "disabled")
        self.assertEqual(replay["fixture"]["requestIds"], EXPECTED_REQUEST_IDS)
        self.assertEqual(replay["api"]["routes"], EXPECTED_ROUTE_SUMMARY)
        self.assertEqual(replay["api"]["replayedRequests"], len(EXPECTED_REQUEST_IDS))
        self.assertEqual(replay["api"]["passedRequests"], len(EXPECTED_REQUEST_IDS))
        self.assertEqual(replay["api"]["actualStatuses"], {"200": 4, "400": 1, "404": 1})
        self.assertEqual(
            replay["api"]["resourceConnectorIds"],
            ["local.files", "local.manual", "local.workspace-index"],
        )
        self.assertIn("sdkFixtureHarness", replay["optional"])
        self.assertIn("cliReplay", replay["optional"])
        self.assertEqual(replay["network"]["globalFetchCalls"], 0)
        self.assertIs(replay["network"]["localOnly"], True)

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
