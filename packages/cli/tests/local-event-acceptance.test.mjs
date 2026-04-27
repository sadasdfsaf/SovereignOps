import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runCli } from "../src/index.ts";
import { createInMemorySyncRepository } from "../../../services/sync/src/repository.ts";

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const nestedCliCwd = path.join(workspaceRoot, "packages", "cli");

test("local event inspect and replay stay aligned with API and SDK examples", async () => {
  const { apiRequests, sdkSession } = await readAcceptanceFixtures();
  const catalogPath = sdkSession.catalog.path;
  const catalogResponse = requestById(apiRequests, "local_event_catalog_get").response.body;
  const summaryResponse = requestById(apiRequests, "local_event_summary_get").response.body;
  const replayBatchesResponse = requestById(
    apiRequests,
    "local_event_replay_batches_get",
  ).response.body;

  assert.equal(catalogPath, apiRequests.catalog.path);
  assert.equal(catalogPath, catalogResponse.eventsRef.replace(/#events$/, ""));
  assert.deepEqual(sdkSession.catalog.eventIds, apiRequests.catalog.eventIds);

  const inspectResult = await runCli(
    ["local-events", "catalog", "inspect", "--input-path", catalogPath],
    { cwd: nestedCliCwd },
  );
  const inspect = JSON.parse(inspectResult.stdout);

  assert.equal(inspectResult.exitCode, 0);
  assert.equal(inspectResult.stderr, "");
  assert.equal(inspect.source.path, catalogPath);
  assert.equal(inspect.source.type, "input_path");
  assert.equal(inspect.schemaVersion, catalogResponse.schemaVersion);
  assert.equal(inspect.workspaceId, catalogResponse.workspaceId);
  assert.equal(inspect.localOnly, catalogResponse.localOnly);
  assert.equal(inspect.totalEvents, catalogResponse.eventCount);
  assert.equal(inspect.matchedEvents, catalogResponse.eventCount);
  assert.deepEqual(
    inspect.events.map((event) => event.id),
    catalogResponse.eventIds,
  );
  assert.equal(inspect.summary.firstSequence, summaryResponse.firstSequence);
  assert.equal(inspect.summary.lastSequence, summaryResponse.lastSequence);
  assert.equal(inspect.summary.redactedEvents, summaryResponse.redactedEventCount);
  assert.equal(inspect.summary.redactedFieldCount, summaryResponse.redactedFieldCount);
  assert.deepEqual(inspect.summary.operations, nonZeroCounts(summaryResponse.operations));
  assert.deepEqual(inspect.summary.schemaKinds, nonZeroCounts(summaryResponse.schemaKinds));
  assert.deepEqual(Object.keys(inspect.summary.actors), summaryResponse.actorIds);
  assert.deepEqual(Object.keys(inspect.summary.recordIds), summaryResponse.recordIds);

  const replayResult = await runCli(
    ["local-events", "catalog", "replay", "--input-path", catalogPath],
    { cwd: nestedCliCwd },
  );
  const replay = JSON.parse(replayResult.stdout);

  assert.equal(replayResult.exitCode, 0);
  assert.equal(replayResult.stderr, "");
  assert.equal(replay.replayedEvents, apiRequests.catalog.eventCount);
  assert.equal(replay.terminalDigest, apiRequests.catalog.lastEventDigest);
  assert.deepEqual(
    replay.steps.map((step) => step.eventId),
    apiRequests.catalog.eventIds,
  );
  assert.deepEqual(
    replayBatchesResponse.batches.map((batch) => ({
      eventCount: batch.eventCount,
      finalDigest: replay.steps[batch.lastSequence - 1].eventDigest,
      firstEventId: replay.steps[batch.firstSequence - 1].eventId,
      firstSequence: batch.firstSequence,
      lastEventId: replay.steps[batch.lastSequence - 1].eventId,
      lastSequence: batch.lastSequence,
      previousDigest: replay.steps[batch.firstSequence - 1].previousDigest,
    })),
    replayBatchesResponse.batches.map((batch) => ({
      eventCount: batch.eventCount,
      finalDigest: batch.finalDigest,
      firstEventId: batch.firstEventId,
      firstSequence: batch.firstSequence,
      lastEventId: batch.lastEventId,
      lastSequence: batch.lastSequence,
      previousDigest: batch.previousDigest,
    })),
  );
});

test("documented replay export commands produce package output matching examples", async () => {
  const { apiRequests, sdkSession } = await readAcceptanceFixtures();
  const jsonlResult = await runCli(documentedExportArgs(sdkSession, "jsonl"), {
    cwd: workspaceRoot,
  });
  const csvResult = await runCli(documentedExportArgs(sdkSession, "csv"), {
    cwd: workspaceRoot,
  });
  const packageArgs = documentedExportArgs(sdkSession, "package");
  const packageResult = await runCli(packageArgs, { cwd: workspaceRoot });
  const secondPackageResult = await runCli(packageArgs, { cwd: workspaceRoot });
  const jsonlRows = parseJsonl(jsonlResult.stdout);
  const csvLines = csvResult.stdout.trimEnd().split("\n");
  const replayPackage = JSON.parse(packageResult.stdout);
  const packageRows = parseJsonl(replayPackage.jsonl);

  assert.deepEqual(sdkSession.cli.exportPlan.formats, ["jsonl", "csv", "package"]);
  assert.equal(sdkSession.cli.exportPlan.stdoutOnly, true);
  assert.equal(sdkSession.cli.exportPlan.writesOnlyWithOutputPath, true);

  assert.equal(jsonlResult.exitCode, 0);
  assert.equal(jsonlResult.stderr, "");
  assert.deepEqual(
    jsonlRows.map((row) => row.eventId),
    apiRequests.catalog.eventIds,
  );

  assert.equal(csvResult.exitCode, 0);
  assert.equal(csvResult.stderr, "");
  assert.deepEqual(csvLines[0].split(","), sdkSession.auditExport.retainedFields);
  assert.equal(csvLines.length, apiRequests.catalog.eventCount + 1);

  assert.equal(packageResult.exitCode, 0);
  assert.equal(packageResult.stderr, "");
  assert.equal(packageResult.stdout, secondPackageResult.stdout);
  assert.equal(replayPackage.kind, sdkSession.auditExport.packageKind);
  assert.equal(replayPackage.manifest.kind, sdkSession.auditExport.manifestKind);
  assert.equal(replayPackage.manifest.format, "package");
  assert.equal(replayPackage.manifest.source.path, sdkSession.catalog.path);
  assert.equal(replayPackage.manifest.totalEvents, apiRequests.catalog.eventCount);
  assert.equal(replayPackage.manifest.replayedEvents, apiRequests.catalog.eventCount);
  assert.equal(replayPackage.manifest.terminalDigest, apiRequests.catalog.lastEventDigest);
  assert.equal(replayPackage.manifest.content.jsonl.lines, apiRequests.catalog.eventCount);
  assert.equal(replayPackage.manifest.content.csv.rows, apiRequests.catalog.eventCount);
  assert.deepEqual(
    replayPackage.manifest.content.csv.columns,
    sdkSession.auditExport.retainedFields,
  );
  assert.deepEqual(
    packageRows.map((row) => row.eventId),
    apiRequests.catalog.eventIds,
  );
  assert.equal(replayPackage.csv.split("\n")[0], sdkSession.auditExport.retainedFields.join(","));
  assert.match(replayPackage.fingerprint, /^fnv1a64:[a-f0-9]{16}$/);
});

test("import planning is dry-run only and does not mutate repositories", async () => {
  const { apiRequests, sdkSession } = await readAcceptanceFixtures();
  const repository = createInMemorySyncRepository();
  const argv = [
    "local-event-catalog-import-plan",
    "--input-path",
    sdkSession.catalog.path,
    "--device-id",
    sdkSession.deviceId,
    "--dry-run",
  ];

  const first = await runCli(argv, { cwd: nestedCliCwd, repository });
  const second = await runCli(argv, { cwd: nestedCliCwd, repository });
  const body = JSON.parse(first.stdout);

  assert.equal(first.exitCode, 0);
  assert.equal(first.stderr, "");
  assert.equal(first.stdout, second.stdout);
  assert.equal(body.kind, "local-events.catalog-import-plan");
  assert.equal(body.dryRun, sdkSession.cli.importPlan.dryRun);
  assert.equal(body.source.path, sdkSession.catalog.path);
  assert.equal(body.request.baseCursor, sdkSession.sync.reconciliation.afterCursor);
  assert.equal(body.request.deviceId, sdkSession.deviceId);
  assert.equal(body.catalog.inputKind, "canonical_local_event_catalog");
  assert.equal(body.catalog.workspaceId, sdkSession.workspaceId);
  assert.equal(body.catalog.eventCount, apiRequests.catalog.eventCount);
  assert.equal(body.plan.status, "ready");
  assert.equal(body.plan.eventCount, sdkSession.sync.reconciliation.acceptedEventIds.length);
  assert.equal(body.plan.lastEventDigest, apiRequests.catalog.lastEventDigest);
  assert.equal(body.plan.reconciliation.status, "ready");
  assert.deepEqual(body.plan.reconciliation.codes, []);
  assert.equal(body.plan.replay.afterCursor, sdkSession.sync.reconciliation.afterCursor);
  assert.equal(body.plan.replay.integrity.status, sdkSession.sync.reconciliation.integrity.status);
  assert.equal(repository.snapshot().events.length, 0);
});

test("unsafe paths and unsupported write modes return JSON-only errors", async () => {
  const { sdkSession } = await readAcceptanceFixtures();
  const outsideWorkspacePath = path.resolve(workspaceRoot, "..", "local-event-export.json");
  const privateCatalogPath = path.join(workspaceRoot, ".codex-private", "local-events.json");
  const planPackCatalogPath = path.join(workspaceRoot, "plan-pack", "local-events.json");

  assertJsonOnlyError(
    await runCli(
      ["local-events", "catalog", "inspect", "--input-path", privateCatalogPath],
      { cwd: nestedCliCwd },
    ),
    {
      code: "usage_error",
      message: /private workspace files/,
    },
  );

  assertJsonOnlyError(
    await runCli(
      ["local-event-catalog-import-plan", "--input-path", planPackCatalogPath],
      { cwd: nestedCliCwd },
    ),
    {
      code: "usage_error",
      message: /plan-pack paths/,
    },
  );

  assertJsonOnlyError(
    await runCli(
      [
        "local-event-catalog-export",
        "package",
        "--input-path",
        sdkSession.catalog.path,
        "--output-path",
        outsideWorkspacePath,
      ],
      { cwd: nestedCliCwd },
    ),
    {
      code: "usage_error",
      message: /stay inside the SovereignOps workspace/,
    },
  );

  assertJsonOnlyError(
    await runCli(["local-event-catalog-import-plan", "--dry-run=false"]),
    {
      code: "usage_error",
      message: /Only --dry-run import planning is supported/,
    },
  );
});

async function readAcceptanceFixtures() {
  const [apiRequests, sdkSession] = await Promise.all([
    readWorkspaceJson("examples/local-events/api-requests.json"),
    readWorkspaceJson("examples/local-events/sdk-session.json"),
  ]);
  return { apiRequests, sdkSession };
}

async function readWorkspaceJson(relativePath) {
  return JSON.parse(await readFile(path.join(workspaceRoot, relativePath), "utf8"));
}

function requestById(apiRequests, id) {
  const request = apiRequests.requests.find((candidate) => candidate.id === id);
  assert.ok(request, `missing API request fixture ${id}`);
  return request;
}

function documentedExportArgs(sdkSession, format) {
  const command = sdkSession.cli.exportPlan.commands.find((candidate) =>
    cliArgsFromDocumentedNodeCommand(candidate).includes(format),
  );
  assert.ok(command, `missing documented ${format} export command`);
  return cliArgsFromDocumentedNodeCommand(command);
}

function cliArgsFromDocumentedNodeCommand(command) {
  const tokens = command.split(/\s+/).filter(Boolean);
  assert.equal(tokens[0], "node");
  assert.equal(tokens[1].replaceAll("\\", "/"), "packages/cli/src/index.ts");
  return tokens.slice(2).map((token) => token.replaceAll("\\", "/"));
}

function nonZeroCounts(counts) {
  return Object.fromEntries(Object.entries(counts).filter(([, count]) => count !== 0));
}

function parseJsonl(value) {
  const lines = value.trimEnd().split("\n").filter(Boolean);
  return lines.map((line) => JSON.parse(line));
}

function assertJsonOnlyError(result, expected) {
  assert.notEqual(result.exitCode, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr.endsWith("\n"), true);
  const payload = JSON.parse(result.stderr);
  assert.equal(payload.error.code, expected.code);
  assert.match(payload.error.message, expected.message);
  return payload;
}
