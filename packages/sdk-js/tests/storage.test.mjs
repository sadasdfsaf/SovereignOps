import assert from "node:assert/strict";
import test from "node:test";

import {
  STORAGE_ERROR_CODES,
  STORAGE_SCHEMA_VERSION,
  StorageAdapterError,
  createInMemoryLocalStorageAdapter,
  parseStorageEnvelope,
  planJsonStorageWrites,
  serializeDeterministicJson,
  validateJsonStorageRelativePath,
} from "../src/storage.ts";

const descriptorAlpha = Object.freeze({
  workspaceId: "wsp_alpha",
  deviceId: "dev_laptop",
  rootKeyRef: "key_alpha",
  createdAt: "2026-04-27T00:00:00.000Z",
  updatedAt: "2026-04-27T00:00:00.000Z",
});

const descriptorBeta = Object.freeze({
  workspaceId: "wsp_beta",
  deviceId: "dev_tablet",
  rootKeyRef: "key_beta",
  createdAt: "2026-04-27T00:00:01.000Z",
  updatedAt: "2026-04-27T00:00:01.000Z",
});

test("keeps workspace descriptors and records isolated by workspace", async () => {
  const storage = createInMemoryLocalStorageAdapter();
  await storage.putWorkspaceDescriptor(descriptorBeta);
  await storage.putWorkspaceDescriptor(descriptorAlpha);

  await storage.appendWorkspaceEvent(eventRecord("evt_beta_1", "wsp_beta", 1));
  await storage.appendWorkspaceEvent(eventRecord("evt_alpha_1", "wsp_alpha", 1));

  const descriptors = await storage.listWorkspaceDescriptors();
  assert.deepEqual(
    descriptors.map((descriptor) => descriptor.workspaceId),
    ["wsp_alpha", "wsp_beta"],
  );

  const alpha = await storage.getWorkspaceDescriptor("wsp_alpha");
  assert.deepEqual(alpha, descriptorAlpha);
  assert.throws(
    () => {
      alpha.deviceId = "dev_changed";
    },
    TypeError,
  );

  const alphaEvents = await storage.listWorkspaceEvents("wsp_alpha");
  const betaEvents = await storage.listWorkspaceEvents("wsp_beta");
  assert.deepEqual(
    alphaEvents.map((event) => event.eventId),
    ["evt_alpha_1"],
  );
  assert.deepEqual(
    betaEvents.map((event) => event.eventId),
    ["evt_beta_1"],
  );
});

test("stores event clones and lists events in sequence order", async () => {
  const storage = createInMemoryLocalStorageAdapter();
  const event = eventRecord("evt_alpha_2", "wsp_alpha", 2, {
    title: "Second item",
    tags: ["draft"],
  });

  await storage.appendWorkspaceEvent(event);
  await storage.appendWorkspaceEvent(eventRecord("evt_alpha_1", "wsp_alpha", 1, {
    title: "First item",
  }));
  await storage.appendWorkspaceEvent({
    ...eventRecord("evt_alpha_3", "wsp_alpha", 3, { title: "Third item" }),
    type: "item.changed",
  });

  event.payload.tags.push("changed");

  const events = await storage.listWorkspaceEvents("wsp_alpha");
  assert.deepEqual(
    events.map((record) => record.sequence),
    [1, 2, 3],
  );
  assert.deepEqual(events[1].payload.tags, ["draft"]);
  assert.throws(
    () => {
      events[1].payload.tags.push("mutated");
    },
    TypeError,
  );

  const filtered = await storage.listWorkspaceEvents("wsp_alpha", {
    sinceCursor: "1",
    type: "item.saved",
  });
  assert.deepEqual(
    filtered.map((record) => record.eventId),
    ["evt_alpha_2"],
  );
});

test("persists sync cursors with clone boundaries", async () => {
  const storage = createInMemoryLocalStorageAdapter();
  const cursor = {
    workspaceId: "wsp_alpha",
    cursorKey: "remote-primary",
    cursor: "cur_001",
    updatedAt: "2026-04-27T00:02:00.000Z",
    metadata: { batch: { count: 3 } },
  };

  const saved = await storage.putSyncCursor(cursor);
  cursor.metadata.batch.count = 4;

  const loaded = await storage.getSyncCursor("wsp_alpha", "remote-primary");
  assert.deepEqual(saved, loaded);
  assert.equal(loaded.metadata.batch.count, 3);
  assert.throws(
    () => {
      loaded.metadata.batch.count = 5;
    },
    TypeError,
  );

  await storage.putSyncCursor({
    ...cursor,
    cursor: "cur_002",
    metadata: { batch: { count: 5 } },
  });
  await storage.putSyncCursor({
    workspaceId: "wsp_beta",
    cursorKey: "remote-primary",
    cursor: "cur_beta",
    updatedAt: "2026-04-27T00:03:00.000Z",
  });

  const alphaCursors = await storage.listSyncCursors("wsp_alpha");
  assert.deepEqual(
    alphaCursors.map((record) => record.cursor),
    ["cur_002"],
  );
});

test("appends audit records with stable cursors", async () => {
  const storage = createInMemoryLocalStorageAdapter();
  const audit = {
    auditId: "aud_001",
    workspaceId: "wsp_alpha",
    action: "item.saved",
    actor: "dev_laptop",
    createdAt: "2026-04-27T00:04:00.000Z",
    details: { itemId: "item_1" },
  };

  const first = await storage.appendAuditRecord(audit);
  const second = await storage.appendAuditRecord({
    auditId: "aud_002",
    workspaceId: "wsp_beta",
    action: "item.saved",
    actor: "dev_tablet",
    createdAt: "2026-04-27T00:05:00.000Z",
  });
  audit.details.itemId = "changed";

  assert.equal(first.cursor, "1");
  assert.equal(second.cursor, "2");
  assert.equal(first.sequence, 1);
  assert.equal(second.sequence, 2);

  const alphaAudit = await storage.listAuditRecords({ workspaceId: "wsp_alpha" });
  assert.deepEqual(
    alphaAudit.map((record) => record.auditId),
    ["aud_001"],
  );
  assert.equal(alphaAudit[0].details.itemId, "item_1");
  assert.throws(
    () => {
      alphaAudit[0].details.itemId = "mutated";
    },
    TypeError,
  );

  const afterFirst = await storage.listAuditRecords({ sinceCursor: first.cursor });
  assert.deepEqual(
    afterFirst.map((record) => record.auditId),
    ["aud_002"],
  );
});

test("validates JSON storage paths as safe relative file targets", () => {
  assert.equal(
    validateJsonStorageRelativePath("workspaces/wsp_alpha/events.json"),
    "workspaces/wsp_alpha/events.json",
  );

  for (const path of [
    "",
    "../events.json",
    "/tmp/events.json",
    "C:/tmp/events.json",
    "workspaces\\wsp_alpha\\events.json",
    "workspaces/./events.json",
    "workspaces/wsp_alpha/events.txt",
    "workspaces/wsp:alpha/events.json",
  ]) {
    assert.throws(
      () => validateJsonStorageRelativePath(path),
      (error) => {
        assert.equal(error instanceof StorageAdapterError, true);
        assert.equal(error.code, STORAGE_ERROR_CODES.INVALID_PATH);
        return true;
      },
    );
  }
});

test("plans JSON writes without disk access and serializes deterministically", () => {
  const plan = planJsonStorageWrites([
    {
      path: "workspaces/wsp_beta/descriptors.json",
      kind: "workspaceDescriptors",
      records: [{ z: 1, a: 2 }],
    },
    {
      path: "workspaces/wsp_alpha/descriptors.json",
      kind: "workspaceDescriptors",
      records: [{ b: 2, nested: { z: null, a: true }, a: 1 }],
    },
  ]);

  assert.deepEqual(
    plan.map((entry) => entry.path),
    [
      "workspaces/wsp_alpha/descriptors.json",
      "workspaces/wsp_beta/descriptors.json",
    ],
  );
  assert.equal(
    plan[0].contents,
    '{"kind":"workspaceDescriptors","records":[{"a":1,"b":2,"nested":{"a":true,"z":null}}],"schemaVersion":1}\n',
  );
  assert.equal(
    serializeDeterministicJson({ z: 1, a: { b: 2, a: 1 } }),
    '{"a":{"a":1,"b":2},"z":1}',
  );

  assert.throws(
    () => serializeDeterministicJson({ value: undefined }),
    (error) => {
      assert.equal(error instanceof StorageAdapterError, true);
      assert.equal(error.code, STORAGE_ERROR_CODES.SERIALIZATION_INVALID);
      return true;
    },
  );
});

test("parses schema-versioned envelopes and reports migration errors", () => {
  const migrated = parseStorageEnvelope(
    {
      schemaVersion: 0,
      kind: "syncCursors",
      records: [{ workspaceId: "wsp_alpha", cursorKey: "primary", cursor: "cur_001" }],
    },
    {
      kind: "syncCursors",
      migrations: {
        0: (envelope) => ({
          ...envelope,
          schemaVersion: STORAGE_SCHEMA_VERSION,
        }),
      },
    },
  );
  assert.equal(migrated.schemaVersion, STORAGE_SCHEMA_VERSION);
  assert.equal(migrated.kind, "syncCursors");

  assert.throws(
    () => parseStorageEnvelope(
      { schemaVersion: 0, kind: "syncCursors", records: [] },
      { kind: "syncCursors" },
    ),
    (error) => {
      assert.equal(error instanceof StorageAdapterError, true);
      assert.equal(error.code, STORAGE_ERROR_CODES.MIGRATION_REQUIRED);
      return true;
    },
  );

  assert.throws(
    () => parseStorageEnvelope(
      { schemaVersion: STORAGE_SCHEMA_VERSION + 1, kind: "syncCursors", records: [] },
      { kind: "syncCursors" },
    ),
    (error) => {
      assert.equal(error instanceof StorageAdapterError, true);
      assert.equal(error.code, STORAGE_ERROR_CODES.MIGRATION_UNSUPPORTED);
      return true;
    },
  );
});

function eventRecord(eventId, workspaceId, sequence, payload = { title: "Item" }) {
  return {
    eventId,
    workspaceId,
    type: "item.saved",
    payload,
    cursor: String(sequence),
    sequence,
    deviceId: "dev_laptop",
    createdAt: `2026-04-27T00:00:${String(sequence).padStart(2, "0")}.000Z`,
  };
}
