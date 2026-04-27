import assert from "node:assert/strict";
import test from "node:test";

import { runCli } from "../src/index.ts";
import { isLocalEventsCommand, runLocalEventsCli } from "../src/localEvents.ts";

test("inspects bundled canonical local event fixtures with filters", async () => {
  const result = await runCli([
    "local",
    "events",
    "catalog",
    "inspect",
    "--fixture",
    "valid",
    "--operation",
    "append",
  ]);
  const body = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(body.kind, "local-events.catalog-inspect");
  assert.equal(body.source.fixture, "canonical-events.valid.json");
  assert.equal(body.source.declaredValid, true);
  assert.equal(body.totalEvents, 6);
  assert.equal(body.matchedEvents, 2);
  assert.deepEqual(body.filters, { operation: "append" });
  assert.deepEqual(body.summary.operations, { append: 2 });
  assert.deepEqual(
    body.events.map((event) => [event.id, event.operation, event.redaction.redacted]),
    [
      ["evt_local_01", "append", true],
      ["evt_local_03", "append", true],
    ],
  );
});

test("replays approval records from bundled canonical events", async () => {
  const result = await runCli([
    "local-events",
    "catalog",
    "replay",
    "--fixture",
    "canonical-events.valid.json",
    "--schema-kind",
    "approvals",
  ]);
  const body = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(body.kind, "local-events.catalog-replay");
  assert.equal(body.totalEvents, 6);
  assert.equal(body.replayedEvents, 2);
  assert.match(body.terminalDigest, /^[a-f0-9]{64}$/);
  assert.deepEqual(
    body.steps.map((step) => [step.eventId, step.operation, step.approvalStatus]),
    [
      ["evt_local_05", "approval_requested", "requested"],
      ["evt_local_06", "approval_approved", "approved"],
    ],
  );
  assert.deepEqual(body.records, [
    {
      approvalId: "apv_release_notes",
      approvalStatus: "approved",
      currentDigest: "6666666666666666666666666666666666666666666666666666666666666666",
      deleted: false,
      lastEventId: "evt_local_06",
      lastOperation: "approval_approved",
      lastSequence: 6,
      recordId: "apv_release_notes",
      redactedEvents: 0,
      redactedFieldCount: 0,
      schemaKind: "approvals",
      summary: "Approve release notes for local sharing.",
      targetId: "doc_release_notes",
    },
  ]);
});

test("loads public example catalogs from workspace-local input paths", async () => {
  const result = await runCli([
    "local-event-catalog",
    "inspect",
    "--input-path",
    "examples/local-events/catalog.json",
    "--record-id",
    "doc_support_handoff",
  ]);
  const body = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(body.source.type, "input_path");
  assert.equal(body.source.path, "examples/local-events/catalog.json");
  assert.equal(body.workspaceId, "wsp_local_catalog");
  assert.equal(body.matchedEvents, 5);
  assert.deepEqual(
    body.events.map((event) => event.id),
    [
      "evt_catalog_001",
      "evt_catalog_002",
      "evt_catalog_003",
      "evt_catalog_004",
      "evt_catalog_005",
    ],
  );
});

test("returns JSON-only errors for invalid fixtures and unsafe paths", async () => {
  const invalid = await runLocalEventsCli([
    "local",
    "events",
    "catalog",
    "inspect",
    "--fixture",
    "invalid",
  ]);
  const invalidBody = JSON.parse(invalid.stderr);

  assert.equal(invalid.exitCode, 2);
  assert.equal(invalid.stdout, "");
  assert.equal(invalidBody.error.code, "invalid_catalog");
  assert.equal(invalidBody.error.details.source.declaredValid, false);
  assert.ok(invalidBody.error.details.issues.length > 0);

  const unsafe = await runLocalEventsCli([
    "local-events",
    "catalog",
    "inspect",
    "--input-path",
    ".codex-private/catalog.json",
  ]);
  const unsafeBody = JSON.parse(unsafe.stderr);

  assert.equal(unsafe.exitCode, 2);
  assert.equal(unsafe.stdout, "");
  assert.equal(unsafeBody.error.code, "usage_error");
  assert.match(unsafeBody.error.message, /private workspace files/);
});

test("detects local event catalog command aliases", async () => {
  assert.equal(isLocalEventsCommand(["local", "events", "catalog", "inspect"]), true);
  assert.equal(isLocalEventsCommand(["local-event-catalog", "replay"]), true);
  assert.equal(isLocalEventsCommand(["workspace", "list"]), false);

  const unrelated = await runLocalEventsCli(["workspace", "list"]);
  assert.equal(unrelated, undefined);
});
