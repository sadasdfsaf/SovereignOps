import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createBackupManifest,
  createBackupPayloadDescriptor,
} from "../../workspace-backup/src/index.ts";
import { createInMemoryCliServices, runCli } from "../src/commands.ts";
import { runLifecycleCli } from "../src/lifecycle.ts";

const timestamp = "2026-04-27T00:00:00.000Z";
const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));
const sensitiveMarker = "session_secret_acceptance_marker";

test("workspace create/list/export stay isolated to the injected local session", async () => {
  const firstSession = createSessionServices();
  const secondSession = createSessionServices();

  const created = await runCli(
    [
      "workspace",
      "create",
      "--workspace-id",
      "wsp_session_alpha",
      "--name",
      "Session Alpha",
      "--device-id",
      "dev_session",
      "--root-key-ref",
      "key_session_alpha",
    ],
    { services: firstSession },
  );
  assertJsonSuccess(created);
  assert.deepEqual(JSON.parse(created.stdout), {
    workspaceId: "wsp_session_alpha",
    name: "Session Alpha",
    deviceId: "dev_session",
    rootKeyRef: "key_session_alpha",
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const firstList = await runCli(["workspace", "list"], { services: firstSession });
  assertJsonSuccess(firstList);
  assert.deepEqual(
    JSON.parse(firstList.stdout).map((workspace) => workspace.workspaceId),
    ["wsp_session_alpha"],
  );

  const secondList = await runCli(["workspace", "list"], { services: secondSession });
  assertJsonSuccess(secondList);
  assert.deepEqual(JSON.parse(secondList.stdout), []);

  const workspaceExport = await runCli(
    ["workspace", "export", "--workspace-id", "wsp_session_alpha"],
    { services: firstSession },
  );
  const bundleExport = await runCli(
    ["export", "bundle", "--workspace-id", "wsp_session_alpha"],
    { services: firstSession },
  );
  assertJsonSuccess(workspaceExport);
  assert.equal(workspaceExport.stdout, bundleExport.stdout);
  assert.equal(JSON.parse(workspaceExport.stdout).workspace.workspaceId, "wsp_session_alpha");

  const isolatedExport = await runCli(
    ["workspace", "export", "--workspace-id", "wsp_session_alpha"],
    { services: secondSession },
  );
  assert.equal(isolatedExport.exitCode, 1);
  assert.equal(isolatedExport.stdout, "");
  assert.match(isolatedExport.stderr, /Workspace not found: wsp_session_alpha/);
});

test("workspace export remains stdout-only and does not create requested output files", async () => {
  const services = createSessionServices({
    workspaces: [workspace("wsp_session_alpha")],
  });
  const blockedOutputPath = path.join(
    workspaceRoot,
    "packages",
    "cli",
    "workspace-session-acceptance-output.json",
  );

  assert.equal(existsSync(blockedOutputPath), false);
  const result = await runCli(
    [
      "workspace",
      "export",
      "--workspace-id",
      "wsp_session_alpha",
      "--output-path",
      blockedOutputPath,
    ],
    { services },
  );

  assertJsonSuccess(result);
  assert.equal(existsSync(blockedOutputPath), false);
  assert.equal(JSON.parse(result.stdout).workspace.workspaceId, "wsp_session_alpha");
});

test("policy preview omits sensitive local metadata and keeps deterministic stdout", async () => {
  const services = createSessionServices({
    policyRules: [
      {
        id: "rule_session_notes_read",
        path: "workspace://wsp_session_alpha/notes",
        capability: "read_object",
        decision: "allow",
        match: "prefix",
        reason: "Local session notes can be previewed.",
      },
    ],
  });
  const input = {
    path: "workspace://wsp_session_alpha/notes/first",
    capability: "read_object",
    actorId: "act_local",
    metadata: {
      sessionSecret: sensitiveMarker,
      nested: {
        token: sensitiveMarker,
      },
    },
  };
  const args = ["policy", "preview", "--input-json", JSON.stringify(input)];

  const first = await runCli(args, { services });
  const second = await runCli(args, { services });

  assertJsonSuccess(first);
  assert.equal(first.stdout, second.stdout);
  const preview = JSON.parse(first.stdout);
  assert.deepEqual(preview, {
    decision: "allow",
    path: "workspace://wsp_session_alpha/notes/first",
    capability: "read_object",
    reason: "Local session notes can be previewed.",
    ruleId: "rule_session_notes_read",
  });
  assertNoSensitiveOutput(first);
});

test("current workspace and lifecycle usage errors are stdout-empty but not JSON envelopes", async () => {
  const policyError = await runCli([
    "policy",
    "preview",
    "--input-json",
    JSON.stringify({
      path: "workspace://wsp_session_alpha/notes",
      capability: "",
      metadata: { sessionSecret: sensitiveMarker },
    }),
  ]);
  assert.equal(policyError.exitCode, 2);
  assert.equal(policyError.stdout, "");
  assert.match(policyError.stderr, /policy preview requires input\.capability/);
  assert.throws(() => JSON.parse(policyError.stderr));
  assertNoSensitiveOutput(policyError);

  const lifecycleError = await runLifecycleCli([
    "migration",
    "plan",
    "--input-json",
    JSON.stringify({
      workspaceId: "wsp_session_alpha",
      metadata: {
        schemaVersion: 1,
        sessionSecret: sensitiveMarker,
      },
      steps: "not-an-array",
    }),
  ]);
  assert.ok(lifecycleError);
  assert.equal(lifecycleError.exitCode, 2);
  assert.equal(lifecycleError.stdout, "");
  assert.match(lifecycleError.stderr, /migration plan input\.steps must be an array/);
  assert.throws(() => JSON.parse(lifecycleError.stderr));
  assertNoSensitiveOutput(lifecycleError);
});

test("migration previews are dry-run, deterministic, and omit raw metadata", async () => {
  const input = {
    workspaceId: "wsp_session_alpha",
    metadata: {
      schemaVersion: 1,
      title: "Session Alpha",
      sessionSecret: sensitiveMarker,
    },
    steps: [
      {
        id: "metadata.v1_to_v2",
        fromVersion: 1,
        toVersion: 2,
        summary: "Add local indexes.",
        rollbackNote: "Keep the v1 metadata snapshot until the preview is accepted.",
      },
      {
        id: "metadata.v2_to_v3",
        fromVersion: 2,
        toVersion: 3,
        summary: "Add local summary records.",
        rollbackNote: "Restore the v2 metadata snapshot if summaries are rejected.",
      },
    ],
    targetVersion: 3,
  };
  const args = ["lifecycle", "migration", "plan", "--input-json", JSON.stringify(input)];

  const first = await runLifecycleCli(args);
  const second = await runLifecycleCli(args);
  assert.ok(first);
  assert.ok(second);
  assertJsonSuccess(first);
  assert.equal(first.stdout, second.stdout);

  const plan = JSON.parse(first.stdout);
  assert.equal(plan.kind, "lifecycle.migration-plan-preview");
  assert.equal(plan.dryRun, true);
  assert.equal(plan.summary.dryRun, true);
  assert.deepEqual(plan.summary.stepIds, ["metadata.v1_to_v2", "metadata.v2_to_v3"]);
  assert.match(plan.summary.sourceFingerprint, /^fnv1a64:[0-9a-f]{16}$/);
  assertNoSensitiveOutput(first);
});

test("backup validation rejects unsafe payload paths as JSON without touching the filesystem", async () => {
  const manifest = fixtureManifest();
  const unsafeManifest = {
    ...manifest,
    payloads: [
      {
        ...manifest.payloads[0],
        path: "../outside-session/state.json",
      },
    ],
  };

  const result = await runLifecycleCli([
    "backup",
    "manifest",
    "validate",
    "--input-json",
    JSON.stringify({ manifest: unsafeManifest }),
  ]);
  assert.ok(result);
  assertJsonSuccess(result);

  const validation = JSON.parse(result.stdout);
  assert.equal(validation.kind, "lifecycle.backup-manifest-validation");
  assert.equal(validation.ok, false);
  assert.equal(validation.summary, null);
  assert.ok(
    validation.issues.some(
      (issue) => issue.path === "$.payloads[0].path" && /relative backup path/.test(issue.message),
    ),
  );
});

test("restore plans are dry-run deterministic summaries with redacted key material", async () => {
  const manifest = fixtureManifest();
  const input = {
    manifest,
    targetWorkspaceId: "wsp_session_beta",
    mode: "preview",
    trustedManifestFingerprints: [manifest.manifestFingerprint],
    availablePayloadIds: manifest.payloads.map((payload) => payload.id),
  };
  const args = ["restore", "plan", "--input-json", JSON.stringify(input)];

  const first = await runLifecycleCli(args);
  const second = await runLifecycleCli(args);
  assert.ok(first);
  assert.ok(second);
  assertJsonSuccess(first);
  assert.equal(first.stdout, second.stdout);

  const plan = JSON.parse(first.stdout);
  assert.equal(plan.kind, "lifecycle.restore-plan-summary");
  assert.equal(plan.dryRun, true);
  assert.equal(plan.canRun, true);
  assert.deepEqual(plan.summary, {
    restore: 2,
    skip: 0,
    conflict: 0,
    blocked: 0,
  });
  assert.deepEqual(
    plan.actions.map((action) => action.path),
    ["records/first.json", "state/main.json"],
  );
  assert.doesNotMatch(first.stdout, /key_session_acceptance/);
});

function createSessionServices(overrides = {}) {
  return createInMemoryCliServices({
    workspaces: [],
    events: [],
    policyRules: [],
    auditRecords: [],
    now: () => timestamp,
    ...overrides,
  });
}

function workspace(workspaceId) {
  return {
    workspaceId,
    name: "Session Alpha",
    deviceId: "dev_session",
    rootKeyRef: "key_session_alpha",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function fixtureManifest() {
  const payloads = [
    createBackupPayloadDescriptor({
      id: "pay_state",
      kind: "workspace_state",
      path: "state/main.json",
      plaintextByteSize: 128,
      createdAt: timestamp,
      encryptionKeyId: "key_session_acceptance",
    }),
    createBackupPayloadDescriptor({
      id: "pay_record",
      kind: "record",
      path: "records/first.json",
      plaintextByteSize: 64,
      createdAt: timestamp,
      encryptionKeyId: "key_session_acceptance",
    }),
  ];

  return createBackupManifest({
    backupId: "bkp_session_acceptance",
    workspaceId: "wsp_session_alpha",
    createdAt: timestamp,
    createdByActorId: "act_local",
    encryptionKeyId: "key_session_acceptance",
    payloads,
  });
}

function assertJsonSuccess(result) {
  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.doesNotThrow(() => JSON.parse(result.stdout));
}

function assertNoSensitiveOutput(result) {
  assert.doesNotMatch(result.stdout, new RegExp(sensitiveMarker));
  assert.doesNotMatch(result.stderr, new RegExp(sensitiveMarker));
}
