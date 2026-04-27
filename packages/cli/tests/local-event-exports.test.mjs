import assert from "node:assert/strict";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { runCli } from "../src/index.ts";
import {
  isLocalEventExportsCommand,
  runLocalEventExportsCli,
} from "../src/localEventExports.ts";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const tempDir = fileURLToPath(new URL("../.tmp-local-event-exports/", import.meta.url));

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

test("prints local event replay export help as JSON", async () => {
  const result = await runLocalEventExportsCli([
    "local-event-catalog",
    "export",
    "--help",
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.kind, "local-events.catalog-replay-export.help");
  assert.equal(
    payload.usage.includes(
      "sovereignops local-event-catalog export <jsonl|csv|package> [--fixture <name>|--input-path <path>] [filters]",
    ),
    true,
  );
});

test("exports local event replay steps as deterministic JSONL", async () => {
  const argv = [
    "local",
    "events",
    "catalog",
    "export",
    "jsonl",
    "--fixture",
    "valid",
    "--schema-kind",
    "approvals",
  ];
  const first = await runCli(argv);
  const second = await runCli(argv);
  const rows = first.stdout.trimEnd().split("\n").map((line) => JSON.parse(line));

  assert.equal(first.exitCode, 0);
  assert.equal(first.stderr, "");
  assert.equal(first.stdout, second.stdout);
  assert.deepEqual(
    rows.map((row) => [row.kind, row.eventId, row.operation, row.approvalStatus]),
    [
      [
        "local-events.catalog-replay-export.row",
        "evt_local_05",
        "approval_requested",
        "requested",
      ],
      [
        "local-events.catalog-replay-export.row",
        "evt_local_06",
        "approval_approved",
        "approved",
      ],
    ],
  );
});

test("exports local event replay steps as CSV from workspace input paths", async () => {
  const result = await runCli([
    "local",
    "events",
    "catalog",
    "replay",
    "export",
    "csv",
    "--input-path",
    "examples/local-events/catalog.json",
    "--record-id",
    "doc_support_handoff",
  ]);
  const lines = result.stdout.trimEnd().split("\n");

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(
    lines[0],
    "sequence,eventId,recordedAt,occurredAt,operation,schemaKind,recordId,targetId,actorId,approvalId,approvalStatus,decision,beforeDigest,afterDigest,previousDigest,eventDigest,redacted,summary",
  );
  assert.equal(lines.length, 6);
  assert.match(lines[1], /^1,evt_catalog_001,2026-04-27T12:00:01\.000Z/);
  assert.match(lines[5], /approval_rejected/);
});

test("exports local event replay package with deterministic manifest output", async () => {
  const argv = [
    "local-events",
    "catalog",
    "export",
    "replay",
    "package",
    "--fixture",
    "canonical-events.valid.json",
    "--operation",
    "append",
  ];
  const first = await runCli(argv);
  const second = await runCli(argv);
  const payload = JSON.parse(first.stdout);

  assert.equal(first.exitCode, 0);
  assert.equal(first.stderr, "");
  assert.equal(first.stdout, second.stdout);
  assert.equal(payload.kind, "local-events.catalog-replay-export.package");
  assert.equal(payload.manifest.kind, "local-events.catalog-replay-export.manifest");
  assert.equal(payload.manifest.format, "package");
  assert.equal(payload.manifest.replayedEvents, 2);
  assert.deepEqual(payload.manifest.operations, { append: 2 });
  assert.equal(typeof payload.csv, "string");
  assert.equal(typeof payload.jsonl, "string");
  assert.match(payload.fingerprint, /^fnv1a64:[a-f0-9]{16}$/);
});

test("writes local event replay exports only to workspace-local output paths", async () => {
  await mkdir(tempDir, { recursive: true });
  const outputPath = path.join(tempDir, "replay.csv");
  const result = await runLocalEventExportsCli([
    "local-event-catalog-export",
    "csv",
    "--fixture",
    "valid",
    "--limit",
    "1",
    "--output",
    outputPath,
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stdout);
  const written = await readFile(outputPath, "utf8");

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(payload.kind, "local-events.catalog-replay-export.written");
  assert.equal(payload.format, "csv");
  assert.equal(payload.path, "packages/cli/.tmp-local-event-exports/replay.csv");
  assert.equal(written.trimEnd().split("\n").length, 2);
  assert.match(written, /^sequence,eventId,recordedAt/);
});

test("returns JSON-only errors for unsafe local event replay export paths", async () => {
  const result = await runLocalEventExportsCli([
    "local-event-catalog-export",
    "jsonl",
    "--fixture",
    "valid",
    "--output-path",
    path.join(workspaceRoot, ".codex-private", "replay.jsonl"),
  ]);
  assert.ok(result);
  const payload = JSON.parse(result.stderr);

  assert.equal(result.exitCode, 2);
  assert.equal(result.stdout, "");
  assert.equal(payload.error.code, "usage_error");
  assert.match(payload.error.message, /private workspace files/);
});

test("detects local event replay export command aliases", () => {
  assert.equal(
    isLocalEventExportsCommand(["local", "events", "catalog", "export", "jsonl"]),
    true,
  );
  assert.equal(
    isLocalEventExportsCommand([
      "local",
      "event",
      "catalog",
      "replay",
      "export",
      "csv",
    ]),
    true,
  );
  assert.equal(
    isLocalEventExportsCommand(["local-events", "catalog", "export", "replay", "package"]),
    true,
  );
  assert.equal(
    isLocalEventExportsCommand(["local-event-catalog", "export", "jsonl"]),
    true,
  );
  assert.equal(
    isLocalEventExportsCommand(["local-event-catalog-export", "csv"]),
    true,
  );
  assert.equal(
    isLocalEventExportsCommand(["local-event-catalog-replay-export", "package"]),
    true,
  );
  assert.equal(isLocalEventExportsCommand(["local-event-catalog", "replay"]), false);
});
