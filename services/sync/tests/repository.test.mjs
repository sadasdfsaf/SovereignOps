import assert from "node:assert/strict";
import test from "node:test";

import { createUploadBatch } from "../src/bundles.ts";
import { INITIAL_CURSOR, formatCursor } from "../src/cursors.ts";
import { createInMemorySyncRepository } from "../src/repository.ts";

const createdAt = "2026-04-27T00:00:00.000Z";

test("uploads a batch and stores synced events with stable cursors", () => {
  const repository = createInMemorySyncRepository();
  const result = repository.upload(
    batch({
      events: [
        event("evt_alpha_001", 1),
        event("evt_alpha_002", 2),
      ],
    }),
  );

  const receipt = assertOk(result);
  assert.equal(receipt.baseCursor, INITIAL_CURSOR);
  assert.equal(receipt.nextCursor, formatCursor({ position: 2, eventId: "evt_alpha_002" }));
  assert.deepEqual(
    receipt.events.map((storedEvent) => [storedEvent.id, storedEvent.cursor]),
    [
      ["evt_alpha_001", formatCursor({ position: 1, eventId: "evt_alpha_001" })],
      ["evt_alpha_002", formatCursor({ position: 2, eventId: "evt_alpha_002" })],
    ],
  );

  const snapshot = repository.snapshot();
  assert.equal(snapshot.batches.length, 1);
  assert.deepEqual(snapshot.batches[0].eventIds, ["evt_alpha_001", "evt_alpha_002"]);
});

test("listAfter returns workspace events after a cursor in stable order", () => {
  const repository = createInMemorySyncRepository();
  assertOk(
    repository.upload(
      batch({
        events: [
          event("evt_alpha_001", 1),
          event("evt_alpha_002", 2),
          event("evt_alpha_003", 3),
        ],
      }),
    ),
  );

  const firstWindow = assertOk(
    repository.listAfter({
      workspaceId: "wsp_alpha",
      deviceId: "dev_reader",
      afterCursor: formatCursor({ position: 1, eventId: "evt_alpha_001" }),
      limit: 1,
    }),
  );

  assert.deepEqual(
    firstWindow.events.map((storedEvent) => storedEvent.id),
    ["evt_alpha_002"],
  );
  assert.equal(firstWindow.nextCursor, formatCursor({ position: 2, eventId: "evt_alpha_002" }));
  assert.equal(firstWindow.hasMore, true);

  const secondWindow = assertOk(
    repository.download({
      workspaceId: "wsp_alpha",
      deviceId: "dev_reader",
      afterCursor: firstWindow.nextCursor,
      limit: 10,
    }),
  );

  assert.deepEqual(
    secondWindow.events.map((storedEvent) => storedEvent.id),
    ["evt_alpha_003"],
  );
  assert.equal(secondWindow.hasMore, false);
});

test("rejects stale base cursors", () => {
  const repository = createInMemorySyncRepository();
  const firstReceipt = assertOk(
    repository.upload(batch({ events: [event("evt_alpha_001", 1)] })),
  );

  const result = repository.upload(
    batch({
      baseCursor: INITIAL_CURSOR,
      events: [event("evt_alpha_002", 2)],
    }),
  );

  const error = assertError(result, "base_cursor_mismatch");
  assert.equal(error.baseCursor, INITIAL_CURSOR);
  assert.equal(error.remoteCursor, firstReceipt.nextCursor);
});

test("rejects checksum mismatches", () => {
  const repository = createInMemorySyncRepository();
  const upload = batch({ events: [event("evt_alpha_001", 1)] });

  const result = repository.upload({
    ...upload,
    checksum: `sha256:${"0".repeat(64)}`,
  });

  const error = assertError(result, "checksum_mismatch");
  assert.equal(error.issues.some((issue) => issue.path === "checksum"), true);
});

test("rejects duplicate event ids already accepted in a workspace", () => {
  const repository = createInMemorySyncRepository();
  const firstReceipt = assertOk(
    repository.upload(batch({ events: [event("evt_alpha_001", 1)] })),
  );

  const result = repository.upload(
    batch({
      baseCursor: firstReceipt.nextCursor,
      events: [event("evt_alpha_001", 2, { payload: { title: "Updated task" } })],
    }),
  );

  const error = assertError(result, "duplicate_event");
  assert.equal(error.eventId, "evt_alpha_001");
  assert.equal(error.remoteCursor, formatCursor({ position: 1, eventId: "evt_alpha_001" }));
});

test("isolates uploads and downloads by workspace", () => {
  const repository = createInMemorySyncRepository();

  assertOk(
    repository.upload(
      batch({
        workspaceId: "wsp_alpha",
        deviceId: "dev_laptop",
        events: [event("evt_shared_001", 1, { workspaceId: "wsp_alpha", deviceId: "dev_laptop" })],
      }),
    ),
  );
  assertOk(
    repository.upload(
      batch({
        workspaceId: "wsp_beta",
        deviceId: "dev_tablet",
        events: [event("evt_shared_001", 1, { workspaceId: "wsp_beta", deviceId: "dev_tablet" })],
      }),
    ),
  );

  const alphaWindow = assertOk(
    repository.listAfter({
      workspaceId: "wsp_alpha",
      deviceId: "dev_reader",
      afterCursor: INITIAL_CURSOR,
      limit: 10,
    }),
  );
  const betaWindow = assertOk(
    repository.listAfter({
      workspaceId: "wsp_beta",
      deviceId: "dev_reader",
      afterCursor: INITIAL_CURSOR,
      limit: 10,
    }),
  );

  assert.deepEqual(
    alphaWindow.events.map((storedEvent) => storedEvent.workspaceId),
    ["wsp_alpha"],
  );
  assert.deepEqual(
    betaWindow.events.map((storedEvent) => storedEvent.workspaceId),
    ["wsp_beta"],
  );
  assert.deepEqual(
    repository.snapshot().batches.map((storedBatch) => storedBatch.workspaceId),
    ["wsp_alpha", "wsp_beta"],
  );
});

function batch({
  workspaceId = "wsp_alpha",
  deviceId = "dev_laptop",
  baseCursor = INITIAL_CURSOR,
  events,
}) {
  return createUploadBatch({
    workspaceId,
    deviceId,
    baseCursor,
    events,
  });
}

function event(id, sequence, overrides = {}) {
  return {
    id,
    workspaceId: "wsp_alpha",
    deviceId: "dev_laptop",
    sequence,
    type: "task.updated",
    payload: { title: `Task ${sequence}` },
    createdAt,
    ...overrides,
  };
}

function assertOk(result) {
  if (!result.ok) {
    assert.fail(JSON.stringify(result.error));
  }
  return result.value;
}

function assertError(result, code) {
  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail(`expected ${code} but received success`);
  }
  assert.equal(result.error.code, code);
  return result.error;
}
