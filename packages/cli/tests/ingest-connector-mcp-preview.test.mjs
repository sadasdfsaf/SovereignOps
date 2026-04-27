import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { runCli } from "../src/index.ts";
import {
  isIngestConnectorMcpPreviewCommand,
  runIngestConnectorMcpPreviewCli,
} from "../src/ingestConnectorMcpPreview.ts";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const tempDir = fileURLToPath(
  new URL("../.tmp-ingest-connector-mcp-preview/", import.meta.url),
);

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

test("previews all ingest connector MCP resources as JSON", async () => {
  const result = await runIngestConnectorMcpPreviewCli([
    "ingest",
    "connectors",
    "mcp",
    "preview",
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.kind, "ingest-connector-mcp-preview");
  assert.equal(payload.schemaVersion, "ingest-connector-mcp-preview/v1");
  assert.equal(payload.format, "json");
  assert.equal(payload.localOnly, true);
  assert.equal(payload.noNetwork, true);
  assert.equal(payload.networkAccess, false);
  assert.equal(payload.durableWrites, false);
  assert.equal(payload.source.adapter, "mcp-gateway");
  assert.equal(payload.resourceCount, 3);
  assert.deepEqual(payload.connectorIds, [
    "local.files",
    "local.manual",
    "local.workspace-index",
  ]);
  assert.equal(payload.previewSummary.connectorCount, 3);
  assert.equal(payload.previewSummary.resourceCount, 3);
  assert.deepEqual(payload.previewSummary.capabilities, {
    "ingest.normalize": 2,
    "ingest.structured": 2,
    "quarantine.preview": 2,
    "repository.scan": 1,
    "search.query": 3,
  });
  assert.equal(payload.resources.length, 3);
  assert.deepEqual(
    payload.resources.map((resource) => [
      resource.connectorId,
      resource.uri,
      resource.mimeType,
      resource.localOnly,
      resource.noNetwork,
      resource.durableWrites,
    ]),
    [
      [
        "local.files",
        "sovereignops://ingest/connectors/local.files",
        "application/json",
        true,
        true,
        false,
      ],
      [
        "local.manual",
        "sovereignops://ingest/connectors/local.manual",
        "application/json",
        true,
        true,
        false,
      ],
      [
        "local.workspace-index",
        "sovereignops://ingest/connectors/local.workspace-index",
        "application/json",
        true,
        true,
        false,
      ],
    ],
  );
  assert.deepEqual(payload.redaction, {
    applied: false,
    count: 0,
    reasons: {},
    records: [],
  });
});

test("detects ingest connector MCP preview aliases and routes through runCli", async () => {
  assert.equal(
    isIngestConnectorMcpPreviewCommand(["ingest", "connectors", "mcp", "preview"]),
    true,
  );
  assert.equal(
    isIngestConnectorMcpPreviewCommand(["ingest", "connector", "mcp", "preview"]),
    true,
  );
  assert.equal(
    isIngestConnectorMcpPreviewCommand(["ingest-connectors", "mcp", "preview"]),
    true,
  );
  assert.equal(
    isIngestConnectorMcpPreviewCommand(["ingest-connector-mcp", "preview"]),
    true,
  );
  assert.equal(isIngestConnectorMcpPreviewCommand(["ingest", "mcp", "preview"]), false);

  const result = await runCli([
    "ingest",
    "connector",
    "mcp",
    "preview",
    "--format",
    "json",
  ]);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.kind, "ingest-connector-mcp-preview");
  assert.equal(payload.resourceCount, 3);
});

test("previews a single connector MCP resource", async () => {
  const result = await runIngestConnectorMcpPreviewCli([
    "ingest-connectors",
    "mcp",
    "preview",
    "--connector",
    "local.files",
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(payload.filters, { connector: "local.files" });
  assert.equal(payload.resourceCount, 1);
  assert.deepEqual(payload.connectorIds, ["local.files"]);
  assert.equal(payload.previewSummary.maxItems.total, 50);
  assert.equal(payload.resources[0].connectorId, "local.files");
  assert.equal(payload.resources[0].preview.maxTextBytes, 65536);
});

test("reports unknown connector selections as JSON-only errors", async () => {
  const result = await runIngestConnectorMcpPreviewCli([
    "ingest",
    "connectors",
    "mcp",
    "preview",
    "--connector",
    "local.missing",
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stderr);

  assert.equal(result.exitCode, 2);
  assert.equal(result.stdout, "");
  assert.equal(payload.error.code, "unknown_connector");
  assert.match(payload.error.message, /Unknown ingest connector/);
  assert.equal(payload.error.details.connectorId, "local.missing");
  assert.deepEqual(payload.error.details.availableConnectorIds, [
    "local.files",
    "local.manual",
    "local.workspace-index",
  ]);
});

test("rejects unsafe MCP preview fixture paths as JSON-only errors", async () => {
  const unsafePath = path.resolve(workspaceRoot, "..", "outside.json");
  const result = await runIngestConnectorMcpPreviewCli([
    "ingest",
    "connectors",
    "mcp",
    "preview",
    "--fixture",
    unsafePath,
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stderr);

  assert.equal(result.exitCode, 2);
  assert.equal(result.stdout, "");
  assert.equal(payload.error.code, "usage_error");
  assert.match(payload.error.message, /must stay inside/);
});

test("redacts secret path and private markers from MCP preview fixtures", async () => {
  const fixture = await writeFixture("redacted-connector-mcp-preview.json", {
    schemaVersion: "ingest-connector-manifest/v1",
    localOnly: true,
    connectors: [
      {
        id: "local.redaction",
        label: "Redaction Preview",
        description:
          "Preview Bearer fixture-secret-token from C:/Users/DELL/connectors/config.json in private plan pack.",
        transport: "in-process",
        capabilities: ["search.query"],
        mediaTypes: ["application/json"],
        auth: {
          mode: "none",
          required: false,
        },
        preview: {
          dryRun: true,
          maxItems: 1,
          maxTextBytes: 1024,
        },
        safety: {
          localOnly: true,
          networkAccess: false,
          durableWrites: false,
          untrustedByDefault: true,
        },
      },
    ],
  });
  const result = await runIngestConnectorMcpPreviewCli([
    "ingest",
    "connectors",
    "mcp",
    "preview",
    "--fixture",
    fixture,
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.resourceCount, 1);
  assert.equal(
    payload.resources[0].description,
    "Preview [REDACTED] from [redacted-path] in [redacted-private-marker].",
  );
  assert.equal(payload.redaction.applied, true);
  assert.ok(payload.redaction.count >= 3);
  assert.equal(payload.redaction.reasons.secret >= 1, true);
  assert.equal(payload.redaction.reasons.local_path >= 1, true);
  assert.equal(payload.redaction.reasons.private_marker >= 1, true);
  assertNoLeak(result.stdout);
});

async function writeFixture(name, value) {
  await mkdir(tempDir, { recursive: true });
  const outputPath = path.join(tempDir, name);
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`);
  return outputPath;
}

function assertNoLeak(text) {
  assert.equal(text.includes("Bearer fixture-secret-token"), false);
  assert.equal(text.includes("C:/Users/DELL"), false);
  assert.equal(text.includes("private plan pack"), false);
}
