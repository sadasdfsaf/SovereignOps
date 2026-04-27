import assert from "node:assert/strict";
import test from "node:test";

import {
  createUploadBatch,
  selectDownloadWindow,
  validateConflictSummary,
  validateUploadRequest,
} from "../src/bundles.ts";
import {
  INITIAL_CURSOR,
  advanceCursor,
  compareCursors,
  formatCursor,
  parseCursor,
} from "../src/cursors.ts";

const baseEvent = {
  workspaceId: "wsp_alpha",
  deviceId: "dev_laptop",
  type: "note.updated",
  payload: { title: "Field notes", tags: ["alpha", "offline"] },
  createdAt: "2026-04-27T00:00:00.000Z",
};

test("creates deterministic upload checksums from ordered event envelopes", () => {
  const first = {
    ...baseEvent,
    id: "evt_001",
    sequence: 1,
    payload: { tags: ["alpha"], title: "First note" },
  };
  const second = {
    ...baseEvent,
    id: "evt_002",
    sequence: 2,
    payload: { title: "Second note", tags: ["beta"] },
  };

  const ordered = createUploadBatch({
    workspaceId: "wsp_alpha",
    deviceId: "dev_laptop",
    baseCursor: INITIAL_CURSOR,
    events: [first, second],
  });
  const shuffled = createUploadBatch({
    workspaceId: "wsp_alpha",
    deviceId: "dev_laptop",
    baseCursor: INITIAL_CURSOR,
    events: [
      { ...second, payload: { tags: ["beta"], title: "Second note" } },
      { ...first, payload: { title: "First note", tags: ["alpha"] } },
    ],
  });

  assert.deepEqual(
    shuffled.events.map((event) => event.id),
    ["evt_001", "evt_002"],
  );
  assert.equal(ordered.checksum, shuffled.checksum);
  assert.equal(validateUploadRequest(ordered).ok, true);
});

test("parses, compares, formats, and advances stable cursors", () => {
  const firstCursor = formatCursor({ position: 1, eventId: "evt_001" });
  const secondCursor = advanceCursor(firstCursor, ["evt_002", "evt_003"]);

  assert.deepEqual(parseCursor(firstCursor), { position: 1, eventId: "evt_001" });
  assert.equal(secondCursor, "cur_v1:0000000000000003:evt_003");
  assert.equal(compareCursors(INITIAL_CURSOR, firstCursor), -1);
  assert.equal(compareCursors(secondCursor, firstCursor), 1);
  assert.throws(() => advanceCursor(firstCursor, ["bad_002"]), /evt_/);
});

test("rejects malformed upload requests and conflict summaries", () => {
  const goodBatch = createUploadBatch({
    workspaceId: "wsp_alpha",
    deviceId: "dev_laptop",
    baseCursor: INITIAL_CURSOR,
    events: [{ ...baseEvent, id: "evt_010", sequence: 10 }],
  });

  const badWorkspace = validateUploadRequest({
    ...goodBatch,
    workspaceId: "alpha",
  });
  assert.equal(badWorkspace.ok, false);
  assert.equal(badWorkspace.issues.some((issue) => issue.path === "workspaceId"), true);

  const badChecksum = validateUploadRequest({
    ...goodBatch,
    checksum: `sha256:${"0".repeat(64)}`,
  });
  assert.equal(badChecksum.ok, false);
  assert.equal(badChecksum.issues.some((issue) => issue.path === "checksum"), true);

  assert.equal(
    validateConflictSummary({
      code: "duplicate_event",
      message: "Event was already accepted.",
      eventId: "evt_010",
      remoteCursor: formatCursor({ position: 10, eventId: "evt_010" }),
    }).ok,
    true,
  );
  assert.equal(validateConflictSummary({ code: "unknown", message: "" }).ok, false);
});

test("selects download windows by workspace, cursor, and limit", () => {
  const syncedEvents = [
    {
      ...baseEvent,
      id: "evt_003",
      sequence: 3,
      cursor: formatCursor({ position: 3, eventId: "evt_003" }),
    },
    {
      ...baseEvent,
      id: "evt_001",
      sequence: 1,
      cursor: formatCursor({ position: 1, eventId: "evt_001" }),
    },
    {
      ...baseEvent,
      workspaceId: "wsp_beta",
      id: "evt_004",
      sequence: 4,
      cursor: formatCursor({ position: 4, eventId: "evt_004" }),
    },
    {
      ...baseEvent,
      id: "evt_002",
      sequence: 2,
      cursor: formatCursor({ position: 2, eventId: "evt_002" }),
    },
  ];

  const window = selectDownloadWindow(syncedEvents, {
    workspaceId: "wsp_alpha",
    deviceId: "dev_tablet",
    afterCursor: formatCursor({ position: 1, eventId: "evt_001" }),
    limit: 1,
  });

  assert.deepEqual(
    window.events.map((event) => event.id),
    ["evt_002"],
  );
  assert.equal(window.nextCursor, formatCursor({ position: 2, eventId: "evt_002" }));
  assert.equal(window.hasMore, true);
});
