import assert from "node:assert/strict";
import test from "node:test";

import { runCli } from "../src/index.ts";

const events = Object.freeze([
  event("evt_note_002", "2026-04-27T04:00:02.000Z", "note.updated", "allow", {
    labels: ["ready"],
    title: "Second note",
  }),
  event("evt_note_001", "2026-04-27T04:00:01.000Z", "note.created", "allow", {
    labels: ["draft"],
    title: "First note",
  }),
  event("evt_note_003", "2026-04-27T04:00:03.000Z", "note.deleted", "deny", {
    title: "Old note",
  }),
]);

test("exports audit events as deterministic JSONL", async () => {
  const first = await runCli([
    "audit",
    "export",
    "jsonl",
    "--input-json",
    JSON.stringify([...events].reverse()),
  ]);
  const second = await runCli([
    "audit",
    "export",
    "jsonl",
    "--input-json",
    JSON.stringify(events),
  ]);
  const exported = first.stdout.trimEnd().split("\n").map((line) => JSON.parse(line));

  assert.equal(first.exitCode, 0);
  assert.equal(first.stderr, "");
  assert.equal(first.stdout, second.stdout);
  assert.deepEqual(
    exported.map((item) => item.eventId),
    ["evt_note_001", "evt_note_002", "evt_note_003"],
  );
});

test("exports audit events as CSV", async () => {
  const result = await runCli([
    "audit",
    "export",
    "csv",
    "--input-json",
    JSON.stringify({ events }),
  ]);
  const lines = result.stdout.trimEnd().split("\n");

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(
    lines[0],
    "eventId,timestamp,type,decision,actor,target,reason,attributes,context,fingerprint",
  );
  assert.equal(lines[1].startsWith("evt_note_001,2026-04-27T04:00:01.000Z"), true);
  assert.match(lines[1], /note\.created/);
});

test("exports audit package with deterministic manifest output", async () => {
  const argv = [
    "audit",
    "export",
    "package",
    "--created-at",
    "2026-04-27T04:30:00.000Z",
    "--export-id",
    "audit_notes",
    "--input-json",
    JSON.stringify({ events }),
  ];
  const first = await runCli(argv);
  const second = await runCli(argv);
  const exported = JSON.parse(first.stdout);

  assert.equal(first.exitCode, 0);
  assert.equal(first.stderr, "");
  assert.equal(first.stdout, second.stdout);
  assert.equal(exported.kind, "audit-export.package");
  assert.equal(exported.manifest.kind, "audit-export.manifest");
  assert.equal(exported.manifest.exportId, "audit_notes");
  assert.equal(exported.manifest.eventCount, 3);
  assert.equal(exported.manifest.jsonl.lines, 3);
  assert.equal(exported.manifest.csv.rows, 3);
});

test("applies audit export filter flags", async () => {
  const result = await runCli([
    "audit",
    "export",
    "jsonl",
    "--input-json",
    JSON.stringify(events),
    "--decision",
    "allow",
    "--type",
    "note.updated",
    "--from",
    "2026-04-27T04:00:02.000Z",
    "--to",
    "2026-04-27T04:00:02.000Z",
  ]);
  const exported = result.stdout.trimEnd().split("\n").map((line) => JSON.parse(line));

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(
    exported.map((item) => item.eventId),
    ["evt_note_002"],
  );
  assert.deepEqual(exported[0].attributes, {
    labels: ["ready"],
    title: "Second note",
  });
});

test("reads audit export input from stdin", async () => {
  const result = await runCli(["audit", "export", "jsonl", "--stdin"], {
    stdin: JSON.stringify([events[0]]),
  });
  const [exported] = result.stdout.trimEnd().split("\n").map((line) => JSON.parse(line));

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.equal(exported.eventId, "evt_note_002");
});

test("reports unknown and invalid audit export commands", async () => {
  const unknown = await runCli(["audit", "export", "xml", "--input-json", "[]"]);
  const missingInput = await runCli(["audit", "export", "jsonl"]);
  const invalidJson = await runCli(["audit", "export", "jsonl", "--input-json", "{"]);
  const unsupportedFlag = await runCli([
    "audit",
    "export",
    "jsonl",
    "--input-json",
    "[]",
    "--unexpected",
    "value",
  ]);

  assert.equal(unknown.exitCode, 1);
  assert.match(unknown.stderr, /Unknown audit export command: audit export xml/);
  assert.equal(missingInput.exitCode, 2);
  assert.match(missingInput.stderr, /Missing required option --input-json or --stdin/);
  assert.equal(invalidJson.exitCode, 2);
  assert.match(invalidJson.stderr, /must contain valid JSON/);
  assert.equal(unsupportedFlag.exitCode, 2);
  assert.match(unsupportedFlag.stderr, /Unsupported option: --unexpected/);
});

function event(eventId, timestamp, type, decision, attributes) {
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
      id: "workspace_notes",
      type: "workspace",
    },
    attributes,
    context: {
      source: "cli-test",
    },
  };
}
