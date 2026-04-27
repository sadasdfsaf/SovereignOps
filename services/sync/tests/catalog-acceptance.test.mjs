import assert from "node:assert/strict";
import test from "node:test";

import {
  createCatalogAcceptanceReport,
  detectCatalogImportRisks,
  summarizeCatalogImportPlanStatus,
  validateCatalogFixtureReadiness,
} from "../src/catalogAcceptance.ts";
import { importEventReplayCatalog } from "../src/catalogImport.ts";
import { INITIAL_CURSOR } from "../src/cursors.ts";
import {
  CANONICAL_LOCAL_EVENT_SCHEMA_VERSION,
  calculateCanonicalLocalEventDigest,
  calculateCanonicalLocalEventPayloadDigest,
  calculateEventReplayCatalogDigest,
} from "../src/eventCatalog.ts";
import { createInMemorySyncRepository } from "../src/repository.ts";

const workspaceId = "wsp_alpha";
const deviceId = "dev_catalog";
const actorId = "act_writer";

test("creates redacted ready acceptance reports without mutating repositories", () => {
  const repository = createInMemorySyncRepository();
  const fixture = catalog([
    { id: "evt_alpha_001", operation: "append", title: "Notebook alpha", privateText: "Hidden alpha body" },
    { id: "evt_alpha_002", operation: "update", title: "Notebook beta", privateText: "Hidden beta body" },
  ]);
  const reorderedFixture = catalog([
    {
      id: "evt_alpha_001",
      operation: "append",
      title: "Notebook alpha",
      privateText: "Hidden alpha body",
      extraFirst: true,
    },
    {
      id: "evt_alpha_002",
      operation: "update",
      title: "Notebook beta",
      privateText: "Hidden beta body",
      extraFirst: true,
    },
  ]);
  const before = repository.snapshot();

  const readiness = validateCatalogFixtureReadiness(fixture);
  const planStatus = summarizeCatalogImportPlanStatus(repository, fixture);
  const report = createCatalogAcceptanceReport(repository, fixture);
  const reorderedReport = createCatalogAcceptanceReport(repository, reorderedFixture);

  assert.deepEqual(repository.snapshot(), before);
  assert.equal(readiness.status, "ready");
  assert.equal(readiness.exportReadiness.eventCount, 2);
  assert.equal(readiness.exportReadiness.replayIntegrity.status, "ok");
  assert.equal(planStatus.status, "ready");
  assert.equal(report.status, "ready");
  assert.equal(report.risks.riskCount, 0);
  assert.deepEqual(report.risks.codes, []);
  assert.equal(report.importPlan.plan.eventCount, 2);
  assert.equal(report.importPlan.plan.events[0].eventId, "evt_..._001");
  assert.equal(report.fixture.exportReadiness.digest, reorderedReport.fixture.exportReadiness.digest);
  assert.equal(report.importPlan.plan.checksum, reorderedReport.importPlan.plan.checksum);
  assert.deepEqual(report.importPlan.plan.events, reorderedReport.importPlan.plan.events);

  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("Hidden alpha body"), false);
  assert.equal(serialized.includes("Hidden beta body"), false);
  assert.equal(serialized.includes("Notebook alpha"), false);
  assert.equal(serialized.includes(actorId), false);
  assert.equal(serialized.includes(workspaceId), false);
  assert.equal(serialized.includes("evt_alpha_001"), false);
});

test("detects duplicate event and stale cursor risks without importing", () => {
  const repository = createInMemorySyncRepository();
  assertOk(
    importEventReplayCatalog(
      repository,
      catalog([{ id: "evt_alpha_001", operation: "append", title: "Notebook alpha" }]),
    ),
  );
  const before = repository.snapshot();
  const riskyFixture = catalog(
    [{ id: "evt_alpha_001", operation: "update", title: "Notebook duplicate", privateText: "Hidden duplicate body" }],
    { baseCursor: INITIAL_CURSOR },
  );

  const risks = detectCatalogImportRisks(repository, riskyFixture);
  const planStatus = summarizeCatalogImportPlanStatus(repository, riskyFixture);
  const report = createCatalogAcceptanceReport(repository, riskyFixture);

  assert.deepEqual(repository.snapshot(), before);
  assert.equal(risks.status, "blocked");
  assert.deepEqual(risks.codes, ["duplicate_event", "stale_cursor"]);
  assert.equal(risks.duplicateEventCount, 1);
  assert.equal(risks.cursorRiskCount, 1);
  assert.equal(risks.duplicateEventRisk, true);
  assert.equal(risks.staleCursorRisk, true);
  assert.equal(risks.futureCursorRisk, false);
  assert.deepEqual(
    risks.risks.map((risk) => [risk.code, risk.eventId, risk.remoteCursor]),
    [
      ["stale_cursor", undefined, "cur_v1:0000000000000001:evt_..._001"],
      ["duplicate_event", "evt_..._001", "cur_v1:0000000000000001:evt_..._001"],
    ],
  );
  assert.equal(planStatus.status, "blocked");
  assert.equal(planStatus.code, "stale_cursor");
  assert.equal(report.status, "blocked");
  assert.equal(report.fixture.status, "ready");
  assert.equal(report.importPlan.reconciliation.latestCursor, "cur_v1:0000000000000001:evt_..._001");
  assert.equal(JSON.stringify(report).includes("Hidden duplicate body"), false);
  assert.equal(JSON.stringify(report).includes("evt_alpha_001"), false);
});

test("blocks invalid fixture readiness with validation-only reports", () => {
  const repository = createInMemorySyncRepository();
  const invalidFixture = catalog([
    { id: "evt_alpha_001", operation: "append", title: "Notebook alpha", privateText: "Original hidden body" },
  ]);
  invalidFixture.events[0].payload.privateText = "Changed hidden body";
  const before = repository.snapshot();

  const readiness = validateCatalogFixtureReadiness(invalidFixture);
  const report = createCatalogAcceptanceReport(repository, invalidFixture);

  assert.deepEqual(repository.snapshot(), before);
  assert.equal(readiness.status, "blocked");
  assert.equal(readiness.code, "validation_failed");
  assert.equal(readiness.validation.status, "failed");
  assert.equal(
    readiness.validation.issues.some((issue) => issue.path === "events[0].payloadDigest"),
    true,
  );
  assert.equal(report.status, "blocked");
  assert.equal(report.importPlan.code, "validation_failed");
  assert.deepEqual(report.risks.codes, ["validation_failed"]);
  assert.equal(report.risks.riskCount > 0, true);

  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("Changed hidden body"), false);
  assert.equal(serialized.includes("Original hidden body"), false);
  assert.equal(serialized.includes(actorId), false);
  assert.equal(serialized.includes("evt_alpha_001"), false);
});

function catalog(definitions, options = {}) {
  const selectedWorkspaceId = options.workspaceId ?? workspaceId;
  const baseCursor = options.baseCursor ?? INITIAL_CURSOR;
  const events = canonicalEvents(definitions, { workspaceId: selectedWorkspaceId });

  return {
    workspaceId: selectedWorkspaceId,
    deviceId: options.deviceId ?? deviceId,
    baseCursor,
    digest: calculateEventReplayCatalogDigest({
      workspaceId: selectedWorkspaceId,
      baseCursor,
      events,
    }),
    events,
  };
}

function canonicalEvents(definitions, options = {}) {
  let previousDigest = null;
  const selectedWorkspaceId = options.workspaceId ?? workspaceId;

  return definitions.map((definition, index) => {
    const payload = definition.extraFirst
      ? {
          extra: { b: 2, a: 1 },
          privateText: definition.privateText ?? `Private note ${index + 1}`,
          title: definition.title,
          noteId: `note_${String(index + 1).padStart(3, "0")}`,
        }
      : {
          noteId: `note_${String(index + 1).padStart(3, "0")}`,
          title: definition.title,
          privateText: definition.privateText ?? `Private note ${index + 1}`,
          extra: { a: 1, b: 2 },
        };
    const event = {
      schemaVersion: CANONICAL_LOCAL_EVENT_SCHEMA_VERSION,
      id: definition.id,
      workspaceId: selectedWorkspaceId,
      actorId,
      sequence: index + 1,
      occurredAt: `2026-04-27T00:0${index}:00.000Z`,
      recordedAt: `2026-04-27T00:0${index}:01.000Z`,
      localOnly: true,
      operation: definition.operation,
      payload,
      payloadDigest: calculateCanonicalLocalEventPayloadDigest(payload),
      previousDigest,
      redactionMetadata: {
        redacted: true,
        redactedFieldCount: 1,
        redactedPaths: ["privateText"],
        retainedMetadataKeys: ["client"],
      },
    };

    previousDigest = calculateCanonicalLocalEventDigest(event);
    return event;
  });
}

function assertOk(result) {
  if (!result.ok) {
    assert.fail(JSON.stringify(result.error));
  }
  return result.value;
}
