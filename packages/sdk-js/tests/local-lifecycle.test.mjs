import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLocalAuditExportPackage,
  createLocalCompactionPlan,
  createLocalObservabilityCollector,
  planLocalMetadataMigration,
  planLocalRestore,
  recordLocalObservabilityEvent,
  recordLocalObservabilityMetric,
  runLocalMetadataMigration,
  submitLocalBackupManifest,
  validateLocalBackupManifest,
} from "../src/index.ts";
import {
  BackupManifestValidationError,
  createBackupManifest,
  createBackupPayloadDescriptor,
  stableFingerprint,
} from "../../workspace-backup/src/index.ts";
import { CompactionPlanError } from "../../event-compaction/src/index.ts";
import { AuditEventFilterError } from "../../audit-export/src/index.ts";

const workspaceId = "wsp_alpha";
const createdAt = "2026-04-27T00:00:00.000Z";

test("plans and runs local metadata migrations without mutating source", () => {
  const source = {
    schemaVersion: 1,
    items: [
      {
        id: "item_alpha",
        title: "Local note",
        updatedAt: "2026-04-27T00:01:00.000Z",
      },
    ],
  };
  const steps = metadataMigrations();

  const plan = planLocalMetadataMigration({
    metadata: source,
    steps,
    targetVersion: 2,
  });
  const repeatedPlan = planLocalMetadataMigration({
    metadata: source,
    steps,
    targetVersion: 2,
  });
  const run = runLocalMetadataMigration({
    metadata: source,
    steps,
    targetVersion: 2,
  });

  assert.equal(plan.sourceVersion, 1);
  assert.equal(plan.targetVersion, 2);
  assert.equal(plan.dryRun, true);
  assert.equal(plan.fingerprint, repeatedPlan.fingerprint);
  assert.deepEqual(plan.summary.stepIds, ["metadata.add-item-index"]);
  assert.equal(run.metadata.schemaVersion, 2);
  assert.deepEqual(run.metadata.itemIndex, {
    item_alpha: "2026-04-27T00:01:00.000Z",
  });
  assert.equal(source.schemaVersion, 1);
  assert.equal(source.itemIndex, undefined);
});

test("validates, submits, and plans restore from local backup manifests", () => {
  const manifest = backupManifest();

  const validation = validateLocalBackupManifest(manifest, { workspaceId });
  const submitted = submitLocalBackupManifest({ workspaceId, manifest });
  const restore = planLocalRestore({
    manifest,
    targetWorkspaceId: "wsp_target",
    mode: "merge",
    includePayloadIds: ["pay_notes"],
    existingPayloadFingerprints: {
      "records/notes.json.enc": stableFingerprint("older-notes"),
    },
  });

  assert.equal(validation.ok, true);
  assert.deepEqual(submitted, manifest);
  assert.equal(restore.workspaceId, workspaceId);
  assert.equal(restore.targetWorkspaceId, "wsp_target");
  assert.equal(restore.canRun, false);
  assert.equal(restore.summary.conflict, 1);
  assert.deepEqual(
    restore.actions.map((action) => [action.type, action.payloadId]),
    [["conflict", "pay_notes"]],
  );
});

test("records local observability events and metrics with an injected collector", () => {
  const collector = createLocalObservabilityCollector({
    clock: deterministicClock("2026-04-27T00:10:00.000Z", 1000),
    resource: {
      serviceName: "local-sdk",
      workspaceId,
    },
  });

  const event = recordLocalObservabilityEvent({
    name: "workspace.note.opened",
    attributes: {
      noteId: "note_alpha",
    },
  }, { collector });
  const counter = recordLocalObservabilityMetric({
    kind: "counter",
    name: "workspace.note.opens",
    value: 2,
    unit: "count",
    attributes: { workspaceId },
  }, { collector });
  const updatedCounter = recordLocalObservabilityMetric({
    kind: "counter",
    name: "workspace.note.opens",
    value: 3,
    unit: "count",
    attributes: { workspaceId },
  }, { collector });

  assert.equal(event.sequence, 1);
  assert.equal(event.timestamp, "2026-04-27T00:10:00.000Z");
  assert.equal(counter.value, 2);
  assert.equal(updatedCounter.value, 5);
  assert.deepEqual(
    collector.snapshot().metrics.map((metric) => [metric.kind, metric.name]),
    [["counter", "workspace.note.opens"]],
  );
});

test("creates local compaction plans and audit export packages deterministically", () => {
  const events = compactionEvents();
  const compaction = createLocalCompactionPlan({
    events,
    streamId: "workspace-alpha",
    compactThroughSequence: 2,
    maxEventsPerRange: 2,
    minimumEventsPerCheckpoint: 2,
    createdAt: "2026-04-27T00:20:00.000Z",
  });
  const exported = buildLocalAuditExportPackage({
    events: auditEvents(),
    createdAt: "2026-04-27T00:30:00.000Z",
    filters: {
      decision: "accepted",
    },
  });
  const repeatedExport = buildLocalAuditExportPackage({
    events: auditEvents().reverse(),
    createdAt: "2026-04-27T00:30:00.000Z",
    filters: {
      decisions: ["accepted"],
    },
  });

  assert.equal(compaction.compactedEventCount, 2);
  assert.equal(compaction.retainedEventCount, 1);
  assert.equal(compaction.checkpointDescriptors.length, 1);
  assert.equal(exported.manifest.eventCount, 2);
  assert.equal(exported.manifest.fingerprint, repeatedExport.manifest.fingerprint);
  assert.equal(exported.fingerprint, repeatedExport.fingerprint);
  assert.equal(exported.jsonl.includes("workspace.note.saved"), true);
});

test("reports local backup validation failures before submit-like success", () => {
  const manifest = backupManifest();

  assert.throws(
    () => submitLocalBackupManifest({
      workspaceId: "wsp_other",
      manifest,
    }),
    (error) => {
      assert.equal(error instanceof BackupManifestValidationError, true);
      assert.equal(
        error.issues.some((issue) => issue.path === "$.workspaceId"),
        true,
      );
      return true;
    },
  );

  const invalidWorkspace = validateLocalBackupManifest(manifest, {
    workspaceId: "alpha",
  });
  assert.equal(invalidWorkspace.ok, false);
  assert.deepEqual(
    invalidWorkspace.issues.map((issue) => issue.path),
    ["workspaceId", "$.workspaceId"],
  );
});

test("surfaces local compaction and audit export validation errors", () => {
  assert.throws(
    () => createLocalCompactionPlan({
      events: [
        compactionEvent("evt_note_001", "workspace-alpha", 1),
        compactionEvent("evt_note_002", "workspace-beta", 1),
      ],
    }),
    CompactionPlanError,
  );

  assert.throws(
    () => buildLocalAuditExportPackage({
      events: auditEvents(),
      filters: {
        from: "2026-04-27T00:30:03.000Z",
        to: "2026-04-27T00:30:01.000Z",
      },
    }),
    AuditEventFilterError,
  );
});

function backupManifest() {
  const payload = createBackupPayloadDescriptor({
    id: "pay_notes",
    kind: "record",
    path: "records/notes.json.enc",
    plaintextByteSize: 512,
    contentType: "application/json",
    createdAt,
    encryptionKeyId: "key_local_backup",
  });

  return createBackupManifest({
    backupId: "bkp_alpha_snapshot",
    workspaceId,
    createdAt,
    createdByActorId: "act_local_user",
    encryptionKeyId: "key_local_backup",
    payloads: [payload],
  });
}

function metadataMigrations() {
  return [
    {
      id: "metadata.add-item-index",
      fromVersion: 1,
      toVersion: 2,
      summary: "Add a local item index.",
      rollbackNote: "Remove itemIndex and restore schemaVersion 1 from a saved metadata snapshot.",
      isApplied(metadata) {
        return isRecord(metadata.itemIndex);
      },
      migrate(metadata) {
        return {
          ...metadata,
          schemaVersion: 2,
          itemIndex: Object.fromEntries(
            metadata.items.map((item) => [item.id, item.updatedAt]),
          ),
        };
      },
    },
  ];
}

function compactionEvents() {
  return [
    compactionEvent("evt_note_001", "workspace-alpha", 1),
    compactionEvent("evt_note_002", "workspace-alpha", 2),
    compactionEvent("evt_note_003", "workspace-alpha", 3),
  ];
}

function compactionEvent(eventId, streamId, sequence) {
  return {
    eventId,
    streamId,
    sequence,
    type: "workspace.note.saved",
    timestamp: `2026-04-27T00:20:0${sequence}.000Z`,
    payload: {
      noteId: `note_${sequence}`,
    },
  };
}

function auditEvents() {
  return [
    auditEvent("audit_002", "2026-04-27T00:30:02.000Z", "workspace.note.opened", "accepted"),
    auditEvent("audit_001", "2026-04-27T00:30:01.000Z", "workspace.note.saved", "accepted"),
    auditEvent("audit_003", "2026-04-27T00:30:03.000Z", "workspace.note.archived", "held"),
  ];
}

function auditEvent(eventId, timestamp, type, decision) {
  return {
    eventId,
    timestamp,
    type,
    decision,
    actor: {
      id: "user_local",
      type: "workspace-member",
    },
    target: {
      id: "note_alpha",
      type: "note",
    },
    attributes: {
      workspaceId,
    },
  };
}

function deterministicClock(start, stepMs) {
  const startMs = Date.parse(start);
  let ticks = 0;
  return () => {
    const timestamp = new Date(startMs + ticks * stepMs).toISOString();
    ticks += 1;
    return timestamp;
  };
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
