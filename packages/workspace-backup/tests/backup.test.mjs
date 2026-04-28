import assert from "node:assert/strict";
import test from "node:test";

import {
  BackupManifestValidationError,
  checkRestoreSafety,
  createBackupManifest,
  createBackupPayloadDescriptor,
  createRedactedBackupAuditEvent,
  evaluateRetentionPolicy,
  planWorkspaceRestore,
  stableFingerprint,
  validateBackupManifest,
} from "../src/index.ts";

const createdAt = "2026-04-27T00:00:00.000Z";

test("creates deterministic encrypted backup manifests", () => {
  const first = baseManifest();
  const second = baseManifest();

  assert.equal(first.manifestFingerprint, second.manifestFingerprint);
  assert.equal(first.payloads[0].integrity.descriptorFingerprint, second.payloads[0].integrity.descriptorFingerprint);
  assert.equal(first.payloads[0].encryption.algorithm, "metadata-only-encryption-v1");
  assert.equal(first.payloads[0].encryptedByteSize, first.payloads[0].plaintextByteSize + 32);
  assert.deepEqual(
    first.payloads.map((payload) => payload.id),
    ["pay_workspace_index", "pay_workspace_notes"],
  );
});

test("validates manifest fields, payload uniqueness, and fingerprints", () => {
  const manifest = baseManifest();
  const result = validateBackupManifest(manifest);

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);

  const duplicate = {
    ...manifest,
    payloads: [
      manifest.payloads[0],
      { ...manifest.payloads[0], id: "pay_workspace_index" },
    ],
    manifestFingerprint: stableFingerprint("stale"),
  };
  const duplicateResult = validateBackupManifest(duplicate);

  assert.equal(duplicateResult.ok, false);
  assert.ok(hasIssue(duplicateResult, "$.payloads[1].id", "duplicates payload id pay_workspace_index"));
  assert.ok(hasIssue(duplicateResult, "$.payloads[1].path", "duplicates payload path records/workspace-index.json.enc"));

  const staleFingerprintResult = validateBackupManifest({
    ...manifest,
    manifestFingerprint: stableFingerprint("stale"),
  });

  assert.equal(staleFingerprintResult.ok, false);
  assert.ok(hasIssue(staleFingerprintResult, "$.manifestFingerprint", "does not match manifest contents"));

  const stalePayloadFingerprint = {
    ...manifest,
    payloads: [
      {
        ...manifest.payloads[0],
        integrity: {
          ...manifest.payloads[0].integrity,
          descriptorFingerprint: stableFingerprint("stale-descriptor"),
        },
      },
      manifest.payloads[1],
    ],
  };
  const stalePayloadResult = validateBackupManifest(stalePayloadFingerprint);

  assert.equal(stalePayloadResult.ok, false);
  assert.ok(
    hasIssue(
      stalePayloadResult,
      "$.payloads[0].integrity.descriptorFingerprint",
      "does not match payload descriptor",
    ),
  );
});

test("throws a typed error when asserting an invalid manifest", async () => {
  const { assertBackupManifest } = await import("../src/index.ts");

  assert.throws(
    () => assertBackupManifest({}),
    BackupManifestValidationError,
  );
});

test("plans safe restore actions without mutating inputs", () => {
  const manifest = baseManifest();
  const plan = planWorkspaceRestore(manifest, {
    targetWorkspaceId: "wsp_restore",
    mode: "merge",
    existingPayloadFingerprints: {
      "records/workspace-index.json.enc": manifest.payloads[0].integrity.descriptorFingerprint,
      "records/notes.json.enc": stableFingerprint("older-notes"),
    },
  });

  assert.equal(plan.canRun, false);
  assert.equal(plan.summary.skip, 1);
  assert.equal(plan.summary.conflict, 1);
  assert.deepEqual(
    plan.actions.map((action) => [action.type, action.path]),
    [
      ["skip", "records/workspace-index.json.enc"],
      ["conflict", "records/notes.json.enc"],
    ],
  );

  const replacePlan = planWorkspaceRestore(manifest, {
    targetWorkspaceId: "wsp_restore",
    mode: "replace",
    allowDestructiveRestore: true,
    existingPayloadFingerprints: {
      "records/notes.json.enc": stableFingerprint("older-notes"),
    },
  });

  assert.equal(replacePlan.canRun, true);
  assert.equal(replacePlan.summary.restore, 2);
});

test("blocks unsafe restore requests", () => {
  const manifest = baseManifest();
  const plan = planWorkspaceRestore(manifest, {
    targetWorkspaceId: "wsp_main",
    mode: "replace",
  });

  assert.equal(plan.canRun, false);
  assert.equal(plan.summary.blocked, 2);
  assert.ok(plan.safety.blockers.includes("restore targets the source workspace without explicit overwrite approval"));
  assert.ok(plan.safety.blockers.includes("replace mode requires explicit destructive restore approval"));
});

test("rejects unsupported restore modes at runtime", () => {
  const manifest = baseManifest();

  assert.throws(
    () => planWorkspaceRestore(manifest, {
      targetWorkspaceId: "wsp_restore",
      mode: "replacee",
      existingPayloadFingerprints: {
        "records/notes.json.enc": stableFingerprint("older-notes"),
      },
    }),
    (error) => {
      assert.equal(error instanceof BackupManifestValidationError, true);
      assert.deepEqual(error.issues, [
        {
          path: "options.mode",
          message: "must be one of preview, merge, or replace",
        },
      ]);
      return true;
    },
  );

  assert.throws(
    () => checkRestoreSafety(manifest, {
      targetWorkspaceId: "wsp_restore",
      mode: "replacee",
    }),
    BackupManifestValidationError,
  );
});

test("evaluates retention rules while preserving required backups", () => {
  const manifests = [
    baseManifest({ backupId: "bkp_alpha_day_one", createdAt: "2026-04-20T00:00:00.000Z" }),
    baseManifest({ backupId: "bkp_alpha_day_two", createdAt: "2026-04-24T00:00:00.000Z" }),
    baseManifest({ backupId: "bkp_alpha_day_three", createdAt: "2026-04-26T00:00:00.000Z" }),
  ];

  const evaluation = evaluateRetentionPolicy(manifests, {
    keepLatest: 1,
    deleteAfterDays: 3,
    minimumBackups: 2,
  }, "2026-04-27T00:00:00.000Z");

  assert.deepEqual(
    evaluation.delete.map((decision) => decision.backupId),
    ["bkp_alpha_day_one"],
  );
  assert.deepEqual(
    evaluation.keep.map((decision) => decision.backupId),
    ["bkp_alpha_day_three", "bkp_alpha_day_two"],
  );
});

test("creates redacted audit events without payload paths or raw identifiers", () => {
  const manifest = baseManifest();
  const event = createRedactedBackupAuditEvent({
    operation: "restore_planned",
    outcome: "warning",
    backupId: manifest.backupId,
    workspaceId: manifest.workspaceId,
    actorId: manifest.createdByActorId,
    timestamp: "2026-04-27T01:00:00.000Z",
    payloads: manifest.payloads,
    restoreMode: "merge",
    message: "Conflict at records/notes.json.enc",
  });

  assert.equal(event.payloadCount, 2);
  assert.deepEqual(event.payloadKinds, ["record", "workspace_state"]);
  assert.match(event.backupRef, /^backup:[0-9a-f]{12}$/);
  assert.match(event.workspaceRef, /^workspace:[0-9a-f]{12}$/);
  assert.equal(event.backupRef.includes(manifest.backupId), false);
  assert.equal(event.workspaceRef.includes(manifest.workspaceId), false);
  assert.equal(event.message.includes("records/notes.json.enc"), false);
  assert.equal(event.message, "Conflict at [redacted-path]");
});

function hasIssue(result, path, message) {
  return result.issues.some((issue) => issue.path === path && issue.message === message);
}

function baseManifest(overrides = {}) {
  const indexPayload = createBackupPayloadDescriptor({
    id: "pay_workspace_index",
    kind: "workspace_state",
    path: "records/workspace-index.json.enc",
    plaintextByteSize: 1024,
    createdAt,
    encryptionKeyId: "key_workspace_backup",
  });
  const notesPayload = createBackupPayloadDescriptor({
    id: "pay_workspace_notes",
    kind: "record",
    path: "records/notes.json.enc",
    plaintextByteSize: 2048,
    contentType: "application/json",
    createdAt,
    encryptionKeyId: "key_workspace_backup",
  });

  return createBackupManifest({
    backupId: overrides.backupId ?? "bkp_alpha_snapshot",
    workspaceId: "wsp_main",
    createdAt: overrides.createdAt ?? createdAt,
    createdByActorId: "act_owner",
    encryptionKeyId: "key_workspace_backup",
    payloads: [notesPayload, indexPayload],
  });
}
