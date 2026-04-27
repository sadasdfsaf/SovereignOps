import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  isLocalEventImportsCommand,
  runLocalEventImportsCli,
} from "../src/localEventImports.ts";
import { INITIAL_CURSOR } from "../../../services/sync/src/cursors.ts";
import { importEventReplayCatalog } from "../../../services/sync/src/catalogImport.ts";
import { createInMemorySyncRepository } from "../../../services/sync/src/repository.ts";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const validFixturePath = fileURLToPath(
  new URL("../../schemas/fixtures/canonical-events.valid.json", import.meta.url),
);

test("prints local event import planning help as deterministic JSON", async () => {
  const first = await runLocalEventImportsCli([
    "local-event-catalog",
    "import",
    "plan",
    "--help",
  ]);
  const second = await runLocalEventImportsCli([
    "local-event-catalog-import-plan",
    "--help",
  ]);
  assert.ok(first);
  assert.ok(second);

  const body = JSON.parse(first.stdout);
  assert.equal(first.exitCode, 0);
  assert.equal(first.stderr, "");
  assert.equal(first.stdout, second.stdout);
  assert.equal(body.kind, "local-events.catalog-import-plan.help");
  assert.equal(
    body.usage.includes(
      "sovereignops local-event-catalog-import-plan [--fixture <name>|--input-path <path>] [--device-id <id>] [--base-cursor <cursor>] [--dry-run]",
    ),
    true,
  );
});

test("plans dry-run catalog imports from bundled fixtures without mutating state", async () => {
  const repository = createInMemorySyncRepository();
  const argv = [
    "local",
    "events",
    "catalog",
    "import",
    "plan",
    "--fixture",
    "valid",
    "--dry-run",
  ];
  const first = await runLocalEventImportsCli(argv, { repository });
  const second = await runLocalEventImportsCli(argv, { repository });
  assert.ok(first);
  assert.ok(second);
  const body = JSON.parse(first.stdout);

  assert.equal(first.exitCode, 0);
  assert.equal(first.stderr, "");
  assert.equal(first.stdout, second.stdout);
  assert.equal(body.kind, "local-events.catalog-import-plan");
  assert.equal(body.dryRun, true);
  assert.equal(body.source.fixture, "canonical-events.valid.json");
  assert.equal(body.catalog.inputKind, "canonical_local_event_catalog");
  assert.equal(body.catalog.eventCount, 6);
  assert.deepEqual(body.request, {
    baseCursor: INITIAL_CURSOR,
    deviceId: "dev_local_import",
  });
  assert.equal(body.plan.status, "ready");
  assert.equal(body.plan.eventCount, 6);
  assert.equal(body.plan.events[0].eventId, "evt_...l_01");
  assert.match(body.plan.checksum, /^sha256:[a-f0-9]{64}$/);
  assert.equal(repository.snapshot().events.length, 0);
  assert.equal(JSON.stringify(body).includes("Create local release notes."), false);
});

test("plans workspace-local input paths with explicit base cursor and device", async () => {
  const result = await runLocalEventImportsCli([
    "local-events",
    "catalog",
    "import-plan",
    "--input-path",
    "examples/local-events/catalog.json",
    "--device-id",
    "dev_cli_import",
    "--base-cursor",
    INITIAL_CURSOR,
  ]);
  assert.ok(result);
  const body = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(body.source.type, "input_path");
  assert.equal(body.source.path, "examples/local-events/catalog.json");
  assert.equal(body.catalog.workspaceId, "wsp_local_catalog");
  assert.equal(body.catalog.eventCount, 5);
  assert.deepEqual(body.request, {
    baseCursor: INITIAL_CURSOR,
    deviceId: "dev_cli_import",
  });
  assert.equal(body.plan.eventCount, 5);
  assert.equal(body.plan.baseCursor, "cur_v1:0000000000000000:origin");
  assert.equal(body.plan.events[0].payloadDigest.length, 64);
});

test("reports stale base cursors as JSON-only reconciliation errors", async () => {
  const repository = createInMemorySyncRepository();
  const imported = assertOk(
    importEventReplayCatalog(repository, await readFixtureImportInput()),
  );

  const result = await runLocalEventImportsCli(
    ["local-event-catalog-import", "plan", "--fixture", "valid"],
    { repository },
  );
  assert.ok(result);
  const body = JSON.parse(result.stderr);

  assert.equal(result.exitCode, 2);
  assert.equal(result.stdout, "");
  assert.equal(body.error.code, "stale_cursor");
  assert.equal(body.error.details.baseCursor, INITIAL_CURSOR);
  assert.equal(body.error.details.remoteCursor, imported.receipt.nextCursor);
  assert.equal(body.error.details.reconciliation.status, "blocked");
  assert.deepEqual(body.error.details.reconciliation.codes, [
    "duplicate_event",
    "stale_cursor",
  ]);
  assert.equal(JSON.stringify(body).includes("Create local release notes."), false);
  assert.equal(repository.snapshot().events.length, 6);
});

test("reports duplicate imported events when the base cursor is current", async () => {
  const repository = createInMemorySyncRepository();
  const imported = assertOk(
    importEventReplayCatalog(repository, await readFixtureImportInput()),
  );

  const result = await runLocalEventImportsCli(
    [
      "local",
      "event",
      "catalog",
      "import",
      "plan",
      "--fixture",
      "valid",
      "--base-cursor",
      imported.receipt.nextCursor,
    ],
    { repository },
  );
  assert.ok(result);
  const body = JSON.parse(result.stderr);

  assert.equal(result.exitCode, 2);
  assert.equal(result.stdout, "");
  assert.equal(body.error.code, "duplicate_event");
  assert.equal(body.error.details.eventId, "evt_local_01");
  assert.equal(body.error.details.reconciliation.duplicateEventCount, 6);
  assert.deepEqual(body.error.details.reconciliation.codes, ["duplicate_event"]);
  assert.equal(
    body.error.details.reconciliation.issues[0].eventId,
    "evt_...l_01",
  );
  assert.equal(repository.snapshot().events.length, 6);
});

test("returns JSON-only errors for unsafe local event import paths", async () => {
  const privateResult = await runLocalEventImportsCli([
    "local-event-catalog-import-plan",
    "--input-path",
    path.join(workspaceRoot, ".codex-private", "catalog.json"),
  ]);
  assert.ok(privateResult);
  const privateBody = JSON.parse(privateResult.stderr);

  assert.equal(privateResult.exitCode, 2);
  assert.equal(privateResult.stdout, "");
  assert.equal(privateBody.error.code, "usage_error");
  assert.match(privateBody.error.message, /private workspace files/);

  const planPackResult = await runLocalEventImportsCli([
    "local-event-catalog-import-plan",
    "--input-path",
    path.join(
      "E:\\",
      "sovereignops-codex-pack",
      "sovereignops-codex-pack",
      "catalog.json",
    ),
  ]);
  assert.ok(planPackResult);
  const planPackBody = JSON.parse(planPackResult.stderr);

  assert.equal(planPackResult.exitCode, 2);
  assert.equal(planPackResult.stdout, "");
  assert.equal(planPackBody.error.code, "usage_error");
  assert.match(planPackBody.error.message, /plan-pack paths/);
});

test("detects local event import planning command aliases", () => {
  assert.equal(
    isLocalEventImportsCommand(["local", "events", "catalog", "import", "plan"]),
    true,
  );
  assert.equal(
    isLocalEventImportsCommand(["local", "event", "catalog", "import", "plan"]),
    true,
  );
  assert.equal(
    isLocalEventImportsCommand(["local-events", "catalog", "import-plan"]),
    true,
  );
  assert.equal(
    isLocalEventImportsCommand(["local-event-catalog", "import", "plan"]),
    true,
  );
  assert.equal(
    isLocalEventImportsCommand(["local-event-catalog-import", "plan"]),
    true,
  );
  assert.equal(
    isLocalEventImportsCommand(["local-event-catalog-import-plan"]),
    true,
  );
  assert.equal(isLocalEventImportsCommand(["local-event-catalog", "replay"]), false);
});

async function readFixtureImportInput() {
  const fixture = JSON.parse(await readFile(validFixturePath, "utf8"));
  return {
    workspaceId: fixture.workspaceId,
    deviceId: "dev_local_import",
    baseCursor: INITIAL_CURSOR,
    events: fixture.events,
  };
}

function assertOk(result) {
  if (!result.ok) {
    assert.fail(JSON.stringify(result.error));
  }
  return result.value;
}
