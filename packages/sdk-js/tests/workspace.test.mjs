import assert from "node:assert/strict";
import test from "node:test";

import {
  WORKSPACE_ERROR_CODES,
  createInMemoryWorkspaceClient,
  err,
  ok,
  validateWorkspaceDescriptor,
} from "../src/workspace.ts";

const descriptor = {
  workspaceId: "wsp_alpha",
  deviceId: "dev_laptop",
  rootKeyRef: "key_root_alpha",
  createdAt: "2026-04-27T00:00:00.000Z",
  updatedAt: "2026-04-27T00:00:00.000Z",
};

test("validates workspace descriptors", () => {
  const valid = validateWorkspaceDescriptor(descriptor);
  assert.equal(valid.ok, true);
  assert.deepEqual(valid.value, descriptor);

  const invalid = validateWorkspaceDescriptor({
    workspaceId: "alpha",
    deviceId: "",
    rootKeyRef: "root",
    createdAt: "2026-04-27",
    updatedAt: "2026-04-26T23:59:59.000Z",
  });

  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, WORKSPACE_ERROR_CODES.INVALID_DESCRIPTOR);
  assert.deepEqual(
    invalid.error.details.issues.map((issue) => issue.path),
    ["workspaceId", "deviceId", "rootKeyRef", "createdAt"],
  );

  const staleUpdate = validateWorkspaceDescriptor({
    ...descriptor,
    createdAt: "2026-04-27T00:00:02.000Z",
    updatedAt: "2026-04-27T00:00:01.000Z",
  });
  assert.equal(staleUpdate.ok, false);
  assert.deepEqual(
    staleUpdate.error.details.issues.map((issue) => issue.path),
    ["updatedAt"],
  );
});

test("appends events in sequence and lists by type and cursor", () => {
  const client = createInMemoryWorkspaceClient();
  assert.equal(client.createWorkspace(descriptor).ok, true);

  const first = client.appendEvent("wsp_alpha", {
    type: "note.added",
    payload: { title: "First note" },
    createdAt: "2026-04-27T00:00:02.000Z",
  });
  const second = client.appendEvent("wsp_alpha", {
    type: "note.changed",
    payload: { title: "First note updated" },
    createdAt: "2026-04-27T00:00:01.000Z",
  });
  const third = client.appendEvent("wsp_alpha", {
    type: "note.added",
    payload: { title: "Second note" },
    createdAt: "2026-04-27T00:00:03.000Z",
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(third.ok, true);
  assert.deepEqual([first.value.sequence, second.value.sequence, third.value.sequence], [
    1,
    2,
    3,
  ]);

  const all = client.listEvents("wsp_alpha");
  assert.equal(all.ok, true);
  assert.deepEqual(
    all.value.map((event) => event.type),
    ["note.added", "note.changed", "note.added"],
  );

  const filtered = client.listEvents("wsp_alpha", {
    type: "note.added",
    sinceCursor: first.value.cursor,
  });
  assert.equal(filtered.ok, true);
  assert.deepEqual(
    filtered.value.map((event) => event.payload.title),
    ["Second note"],
  );
});

test("returns immutable snapshots and defensive event payload copies", () => {
  const client = createInMemoryWorkspaceClient();
  const payload = { nested: { count: 1 }, tags: ["draft"] };

  assert.equal(client.createWorkspace(descriptor).ok, true);
  const appended = client.appendEvent("wsp_alpha", {
    type: "note.added",
    payload,
    createdAt: "2026-04-27T00:00:04.000Z",
  });
  assert.equal(appended.ok, true);

  payload.nested.count = 2;
  payload.tags.push("changed");

  const snapshot = client.snapshot("wsp_alpha");
  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.value.events[0].payload.nested.count, 1);
  assert.deepEqual(snapshot.value.events[0].payload.tags, ["draft"]);

  assert.throws(
    () => {
      snapshot.value.descriptor.workspaceId = "wsp_changed";
    },
    TypeError,
  );
  assert.throws(
    () => {
      snapshot.value.events.push(appended.value);
    },
    TypeError,
  );
  assert.throws(
    () => {
      snapshot.value.events[0].payload.nested.count = 3;
    },
    TypeError,
  );

  const secondSnapshot = client.openWorkspace("wsp_alpha");
  assert.equal(secondSnapshot.ok, true);
  assert.equal(secondSnapshot.value.events[0].payload.nested.count, 1);
});

test("returns stable result and error shapes", () => {
  const success = ok({ ready: true });
  assert.deepEqual(success, { ok: true, value: { ready: true } });

  const failure = err(WORKSPACE_ERROR_CODES.EVENT_INVALID, "bad event", {
    path: "type",
  });
  assert.equal(failure.ok, false);
  assert.equal(failure.error.code, "WORKSPACE_EVENT_INVALID");
  assert.equal(failure.error.details.path, "type");
});

test("handles duplicate workspaces, missing workspaces, invalid events, and cursors", () => {
  const client = createInMemoryWorkspaceClient();

  const missing = client.openWorkspace("wsp_missing");
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, WORKSPACE_ERROR_CODES.NOT_FOUND);

  assert.equal(client.createWorkspace(descriptor).ok, true);

  const duplicate = client.createWorkspace(descriptor);
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.error.code, WORKSPACE_ERROR_CODES.ALREADY_EXISTS);

  const invalidEvent = client.appendEvent("wsp_alpha", {
    type: "",
    createdAt: "2026-04-27T00:00:05.000Z",
  });
  assert.equal(invalidEvent.ok, false);
  assert.equal(invalidEvent.error.code, WORKSPACE_ERROR_CODES.EVENT_INVALID);

  const invalidPayload = client.appendEvent("wsp_alpha", {
    type: "note.added",
    payload: () => "not cloneable",
    createdAt: "2026-04-27T00:00:06.000Z",
  });
  assert.equal(invalidPayload.ok, false);
  assert.equal(invalidPayload.error.code, WORKSPACE_ERROR_CODES.EVENT_INVALID);

  const badCursor = client.listEvents("wsp_alpha", { sinceCursor: "next" });
  assert.equal(badCursor.ok, false);
  assert.equal(badCursor.error.code, WORKSPACE_ERROR_CODES.CURSOR_INVALID);
});
