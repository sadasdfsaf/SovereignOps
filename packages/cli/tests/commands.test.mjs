import assert from "node:assert/strict";
import test from "node:test";

import { createInMemoryCliServices, runCli } from "../src/commands.ts";

const timestamp = "2026-04-27T00:00:00.000Z";

test("prints help text", async () => {
  const result = await runCli(["--help"]);

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /workspace list/);
  assert.match(result.stdout, /policy preview/);
});

test("returns an error for unknown commands", async () => {
  const result = await runCli(["missing"]);

  assert.equal(result.exitCode, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Unknown command: missing/);
});

test("lists and creates workspaces through in-memory services", async () => {
  const services = createInMemoryCliServices({
    workspaces: [],
    events: [],
    auditRecords: [],
    now: () => timestamp,
  });

  const created = await runCli(
    [
      "workspace",
      "create",
      "--workspace-id",
      "wsp_alpha",
      "--name",
      "Alpha Notes",
      "--device-id",
      "dev_laptop",
      "--root-key-ref",
      "key_alpha",
    ],
    { services },
  );

  assert.equal(created.exitCode, 0);
  assert.equal(created.stderr, "");
  assert.deepEqual(JSON.parse(created.stdout), {
    workspaceId: "wsp_alpha",
    name: "Alpha Notes",
    deviceId: "dev_laptop",
    rootKeyRef: "key_alpha",
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const listed = await runCli(["workspace", "list"], { services });
  assert.equal(listed.exitCode, 0);
  assert.deepEqual(
    JSON.parse(listed.stdout).map((workspace) => workspace.workspaceId),
    ["wsp_alpha"],
  );
});

test("exports workspace bundle JSON", async () => {
  const services = createInMemoryCliServices({
    workspaces: [
      {
        workspaceId: "wsp_alpha",
        name: "Alpha Notes",
        deviceId: "dev_laptop",
        rootKeyRef: "key_alpha",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    events: [
      {
        eventId: "evt_wsp_alpha_00000001",
        workspaceId: "wsp_alpha",
        type: "note.created",
        payload: { title: "First note" },
        sequence: 1,
        createdAt: timestamp,
      },
    ],
    now: () => timestamp,
  });

  const result = await runCli(["export", "bundle", "--workspace-id", "wsp_alpha"], {
    services,
  });
  const bundle = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(bundle.format, "sovereignops.workspace.bundle");
  assert.equal(bundle.version, 1);
  assert.equal(bundle.workspace.workspaceId, "wsp_alpha");
  assert.deepEqual(
    bundle.events.map((event) => event.eventId),
    ["evt_wsp_alpha_00000001"],
  );
});

test("previews policy decisions from JSON input", async () => {
  const services = createInMemoryCliServices({
    workspaces: [],
    events: [],
    policyRules: [
      {
        id: "rule_alpha_notes_read",
        path: "workspace://wsp_alpha/notes",
        capability: "read_object",
        decision: "allow",
        match: "prefix",
        reason: "Alpha notes can be read in preview.",
      },
    ],
    auditRecords: [],
    now: () => timestamp,
  });
  const input = {
    path: "workspace://wsp_alpha/notes/first",
    capability: "read_object",
    actorId: "user_local",
  };

  const result = await runCli(
    ["policy", "preview", "--input-json", JSON.stringify(input)],
    { services },
  );
  const preview = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.deepEqual(preview, {
    decision: "allow",
    path: "workspace://wsp_alpha/notes/first",
    capability: "read_object",
    reason: "Alpha notes can be read in preview.",
    ruleId: "rule_alpha_notes_read",
  });
});

test("previews audit records", async () => {
  const services = createInMemoryCliServices({
    workspaces: [],
    events: [],
    auditRecords: [
      {
        id: "audit_0001",
        type: "workspace.created",
        timestamp,
        workspaceId: "wsp_alpha",
        message: "Created workspace Alpha Notes.",
      },
      {
        id: "audit_0002",
        type: "workspace.opened",
        timestamp,
        workspaceId: "wsp_beta",
        message: "Opened workspace Beta Notes.",
      },
    ],
  });

  const result = await runCli(
    ["audit", "preview", "--workspace-id", "wsp_alpha", "--limit", "1"],
    { services },
  );
  const preview = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 0);
  assert.equal(preview.total, 1);
  assert.deepEqual(preview.records.map((record) => record.id), ["audit_0001"]);
});
