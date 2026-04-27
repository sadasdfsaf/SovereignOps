import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  createIngestConnectorRoutes,
  createMemoryIngestConnectorRouteState,
} from "../src/ingestConnectorRoutes.ts";
import { createApiRouter } from "../src/router.ts";
import {
  assertIngestConnectorApiManifest,
  validateIngestConnectorApiManifest,
} from "../../../packages/schemas/src/ingestConnectorApiManifest.ts";

const fixturesDir = fileURLToPath(new URL("../../../packages/schemas/fixtures/", import.meta.url));

test("default connector route manifest matches API schema fixture", async () => {
  const fixture = await readFixtureJson("ingest-connector-api-manifest.valid.json");
  const manifest = await dispatchConnectorManifest();
  const result = validateIngestConnectorApiManifest(manifest);

  assert.equal(result.ok, true, formatIssues(result.issues));
  assert.deepEqual(result.issues, []);
  assert.doesNotThrow(() => assertIngestConnectorApiManifest(manifest));
  assert.deepEqual(manifest, fixture);
});

test("connector API manifest validator rejects unsafe route variants", async () => {
  const manifest = await dispatchConnectorManifest();

  assertRejectsMutation(
    manifest,
    "auth required true",
    (unsafe) => {
      unsafe.connectors[0].auth.required = true;
    },
    "connectors[0].auth.required",
  );
  assertRejectsMutation(
    manifest,
    "networkAccess true",
    (unsafe) => {
      unsafe.connectors[0].safety.networkAccess = true;
    },
    "connectors[0].safety.networkAccess",
  );
  assertRejectsMutation(
    manifest,
    "durableWrites true",
    (unsafe) => {
      unsafe.connectors[0].safety.durableWrites = true;
    },
    "connectors[0].safety.durableWrites",
  );
  assertRejectsMutation(
    manifest,
    "duplicate connector ids",
    (unsafe) => {
      unsafe.connectors = [
        ...unsafe.connectors,
        {
          ...unsafe.connectors[1],
          id: unsafe.connectors[0].id,
        },
      ];
    },
    `connectors[${manifest.connectors.length}].id`,
  );
  assertRejectsMutation(
    manifest,
    "unsafe description string",
    (unsafe) => {
      unsafe.connectors[0].description = "Includes credential marker.";
    },
    "connectors[0].description",
  );
});

test("seeded connector route state validates with an added local connector", async () => {
  const fixture = await readFixtureJson("ingest-connector-api-manifest.valid.json");
  const localConnector = {
    id: "local.schema-alignment",
    label: "Schema Alignment",
    description: "Exercises API package schema alignment through a local connector.",
    transport: "in-process",
    capabilities: ["search.query"],
    mediaTypes: ["text/plain"],
    auth: {
      mode: "none",
      required: false,
    },
    preview: {
      dryRun: true,
      maxItems: 3,
      maxTextBytes: 4096,
    },
    safety: {
      localOnly: true,
      networkAccess: false,
      durableWrites: false,
      untrustedByDefault: true,
    },
  };
  const state = createMemoryIngestConnectorRouteState({
    connectors: [
      ...fixture.connectors,
      localConnector,
    ],
  });
  const manifest = await dispatchConnectorManifest(state);
  const result = validateIngestConnectorApiManifest(manifest);
  const ids = manifest.connectors.map((connector) => connector.id);

  assert.equal(result.ok, true, formatIssues(result.issues));
  assert.doesNotThrow(() => assertIngestConnectorApiManifest(manifest));
  assert.ok(ids.includes(localConnector.id));
  assert.equal(ids.length, new Set(ids).size);
  assert.equal(manifest.connectors.length, fixture.connectors.length + 1);
});

async function dispatchConnectorManifest(state) {
  const routes = state === undefined
    ? createIngestConnectorRoutes()
    : createIngestConnectorRoutes(state);
  const router = createApiRouter(routes);
  const response = await router.dispatch({
    method: "GET",
    path: "/v1/ingest/connectors",
  });

  assert.equal(response.status, 200);
  assert.match(response.headers["content-type"], /^application\/json/);

  return cloneJson(response.body);
}

function assertRejectsMutation(manifest, label, mutate, expectedPath) {
  const unsafe = cloneJson(manifest);
  mutate(unsafe);

  const result = validateIngestConnectorApiManifest(unsafe);

  assert.equal(result.ok, false, label);
  assert.ok(
    result.issues.some((issue) => issue.path === expectedPath),
    `${label}: expected ${expectedPath}, got ${formatIssues(result.issues)}`,
  );
}

async function readFixtureJson(file) {
  return JSON.parse(await readFile(join(fixturesDir, file), "utf8"));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function formatIssues(issues) {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
}
