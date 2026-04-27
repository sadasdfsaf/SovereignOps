import assert from "node:assert/strict";
import test from "node:test";

import {
  createBackupManifest,
  createBackupPayloadDescriptor,
} from "../../workspace-backup/src/index.ts";
import { runCli } from "../src/index.ts";
import { runLifecycleCli } from "../src/lifecycle.ts";

const timestamp = "2026-04-27T00:00:00.000Z";

test("previews workspace metadata migration plans from JSON input", async () => {
  const result = await runLifecycleCli([
    "migration",
    "plan",
    "--input-json",
    JSON.stringify({
      workspaceId: "wsp_alpha",
      metadata: {
        schemaVersion: 1,
        title: "Alpha Notes",
      },
      steps: [
        {
          id: "metadata.v1_to_v2",
          fromVersion: 1,
          toVersion: 2,
          summary: "Add local note indexes.",
          rollbackNote: "Keep the v1 metadata snapshot before applying the index step.",
        },
        {
          id: "metadata.v2_to_v3",
          fromVersion: 2,
          toVersion: 3,
          summary: "Add compact tag records.",
          rollbackNote: "Restore the v2 metadata snapshot if tag records are rejected.",
        },
      ],
      targetVersion: 3,
    }),
  ]);
  assert.ok(result);
  const plan = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(plan.kind, "lifecycle.migration-plan-preview");
  assert.equal(plan.dryRun, true);
  assert.deepEqual(plan.summary.stepIds, ["metadata.v1_to_v2", "metadata.v2_to_v3"]);
  assert.equal(plan.summary.alreadyCurrent, false);
});

test("summarizes backup manifest validation", async () => {
  const manifest = createFixtureManifest();
  const result = await runLifecycleCli([
    "backup",
    "manifest",
    "validate",
    "--input-json",
    JSON.stringify({ manifest }),
  ]);
  assert.ok(result);
  const validation = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(validation.ok, true);
  assert.equal(validation.issueCount, 0);
  assert.equal(validation.summary.payloadCount, 2);
  assert.deepEqual(validation.summary.payloadKinds, ["record", "workspace_state"]);
});

test("summarizes restore plans without applying changes", async () => {
  const manifest = createFixtureManifest();
  const [statePayload, recordPayload] = manifest.payloads;
  const result = await runLifecycleCli([
    "restore",
    "plan",
    "--input-json",
    JSON.stringify({
      manifest,
      targetWorkspaceId: "wsp_beta",
      mode: "merge",
      existingPayloadFingerprints: {
        [statePayload.path]: statePayload.integrity.descriptorFingerprint,
        [recordPayload.path]: "fp_0000000000000000",
      },
    }),
  ]);
  assert.ok(result);
  const plan = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(plan.dryRun, true);
  assert.equal(plan.canRun, false);
  assert.deepEqual(plan.summary, {
    restore: 0,
    skip: 1,
    conflict: 1,
    blocked: 0,
  });
});

test("previews event compaction plans from event JSON", async () => {
  const result = await runLifecycleCli([
    "compaction",
    "plan",
    "--input-json",
    JSON.stringify({
      workspaceId: "wsp_alpha",
      streamId: "stream_notes",
      compactThroughSequence: 2,
      maxEventsPerRange: 2,
      events: [
        event("evt_001", 1),
        event("evt_002", 2),
        event("evt_003", 3),
      ],
    }),
  ]);
  assert.ok(result);
  const plan = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(plan.kind, "lifecycle.compaction-plan-preview");
  assert.equal(plan.dryRun, true);
  assert.equal(plan.eventCount, 3);
  assert.equal(plan.compactedEventCount, 2);
  assert.equal(plan.retainedEventCount, 1);
  assert.equal(plan.checkpointCount, 1);
});

test("wraps LOC integrity with injected file data and no writes", async () => {
  const result = await runLifecycleCli([
    "loc",
    "integrity",
    "--input-json",
    JSON.stringify({
      includeDefaultMinimums: false,
      minimums: {
        docs: 2,
        tooling: 1,
        total: 3,
      },
      generatedMaxFiles: 1,
      generatedMaxLines: 1,
      files: [
        { path: "docs/notes.md", text: "one\ntwo\n" },
        { path: "scripts/tool.py", text: "print('ok')\n" },
        { path: "generated/schema.ts", text: "export const schema = true;\n" },
        { path: ".codex-private/private.md", text: "private\n" },
      ],
    }),
  ]);
  assert.ok(result);
  const integrity = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(integrity.ok, true);
  assert.equal(integrity.dryRun, false);
  assert.equal(integrity.files, 2);
  assert.equal(integrity.generated.totalFiles, 1);
});

test("generates release notes from JSON input", async () => {
  const result = await runLifecycleCli([
    "release",
    "notes",
    "--version",
    "0.2.0",
    "--date",
    "2026-04-27",
    "--source-label",
    "fixture",
    "--input-json",
    JSON.stringify({
      commits: [
        { hash: "aaaaaaaaaaaa1111", subject: "feat(cli): add lifecycle previews" },
        { hash: "bbbbbbbbbbbb2222", subject: "fix(cli): keep summaries stable" },
        { hash: "cccccccccccc3333", subject: "docs: refresh local workflow notes" },
      ],
    }),
  ]);
  assert.ok(result);

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /^# Release Notes - 0\.2\.0/);
  assert.match(result.stdout, /Date: 2026-04-27/);
  assert.match(result.stdout, /Source: `fixture`/);
  assert.match(result.stdout, /## Added\n- cli: add lifecycle previews \(`aaaaaaaaaaaa`\)/);
  assert.match(result.stdout, /## Fixed\n- cli: keep summaries stable \(`bbbbbbbbbbbb`\)/);
});

test("package entrypoint routes lifecycle commands before core commands", async () => {
  const result = await runCli([
    "release-notes",
    "--json",
    "--input-json",
    JSON.stringify([{ hash: "abc123", message: "chore: tidy local fixtures" }]),
  ]);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(payload.kind, "lifecycle.release-notes");
  assert.equal(payload.summary.sections.Maintenance, 1);
});

function createFixtureManifest() {
  const payloads = [
    createBackupPayloadDescriptor({
      id: "pay_state",
      kind: "workspace_state",
      path: "state/main.json",
      plaintextByteSize: 128,
      createdAt: timestamp,
      encryptionKeyId: "key_alpha",
    }),
    createBackupPayloadDescriptor({
      id: "pay_record",
      kind: "record",
      path: "records/first.json",
      plaintextByteSize: 64,
      createdAt: timestamp,
      encryptionKeyId: "key_alpha",
    }),
  ];

  return createBackupManifest({
    backupId: "bkp_alpha",
    workspaceId: "wsp_alpha",
    createdAt: timestamp,
    createdByActorId: "act_local",
    encryptionKeyId: "key_alpha",
    payloads,
  });
}

function event(eventId, sequence) {
  return {
    eventId,
    streamId: "stream_notes",
    sequence,
    type: "note.updated",
    timestamp,
    payload: {
      title: `Note ${sequence}`,
    },
  };
}
