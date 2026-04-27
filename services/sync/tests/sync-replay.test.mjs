import assert from "node:assert/strict";
import test from "node:test";

import { formatCursor, INITIAL_CURSOR } from "../src/cursors.ts";
import {
  classifyReplayIntegrityIssues,
  createReplayAuditSummary,
  detectReplayIntegrityIssues,
  replayAcceptedEvents,
} from "../src/replay.ts";

const createdAt = "2026-04-27T00:00:00.000Z";

test("replays accepted events deterministically by cursor window", () => {
  const events = [
    event("evt_alpha_003", 3, { sequence: 3 }),
    event("evt_alpha_001", 1, { sequence: 1 }),
    event("evt_beta_001", 1, { workspaceId: "wsp_beta" }),
    event("evt_alpha_004", 4, { sequence: 4 }),
    event("evt_alpha_002", 2, { sequence: 2 }),
  ];

  const window = replayAcceptedEvents(events, {
    workspaceId: "wsp_alpha",
    afterCursor: formatCursor({ position: 1, eventId: "evt_alpha_001" }),
    limit: 2,
  });

  assert.deepEqual(
    window.events.map((replayedEvent) => replayedEvent.id),
    ["evt_alpha_002", "evt_alpha_003"],
  );
  assert.equal(window.nextCursor, formatCursor({ position: 3, eventId: "evt_alpha_003" }));
  assert.equal(window.hasMore, true);
  assert.deepEqual(window.integrity, {
    status: "ok",
    issueCount: 0,
    blockingCount: 0,
    warningCount: 0,
    codes: [],
  });

  window.events[0].payload.title = "Mutated outside";
  assert.equal(events.find((storedEvent) => storedEvent.id === "evt_alpha_002").payload.title, "Task 2");
});

test("detects replay gaps, duplicates, and stale cursors", () => {
  const issues = detectReplayIntegrityIssues(
    [
      event("evt_alpha_stale", 0),
      event("evt_alpha_001", 1),
      event("evt_alpha_003", 3),
      event("evt_alpha_cursor_collision", 3, { cursorId: "evt_alpha_collision" }),
      event("evt_alpha_003", 4),
      event("evt_alpha_invalid", 5, { cursor: "bad_cursor" }),
    ],
    { workspaceId: "wsp_alpha", afterCursor: INITIAL_CURSOR },
  );

  assert.deepEqual(
    issues.map((issue) => issue.code),
    ["stale_cursor", "gap", "duplicate_cursor", "duplicate_event", "invalid_cursor"],
  );
  assert.equal(issues.every((issue) => issue.severity === "blocking"), true);

  const classification = classifyReplayIntegrityIssues(issues);
  assert.deepEqual(classification, {
    status: "blocked",
    issueCount: 5,
    blockingCount: 5,
    warningCount: 0,
    codes: ["duplicate_cursor", "duplicate_event", "gap", "invalid_cursor", "stale_cursor"],
  });
});

test("redacts replay audit summaries and omits payload data", () => {
  const window = replayAcceptedEvents(
    [
      event("evt_alpha_001", 1, { payload: { title: "Sensitive draft" } }),
      event("evt_alpha_002", 2, { payload: { title: "Private follow-up" } }),
    ],
    {
      workspaceId: "wsp_alpha",
      afterCursor: INITIAL_CURSOR,
      limit: 2,
    },
  );
  const audit = createReplayAuditSummary(window);
  const serialized = JSON.stringify(audit);

  assert.equal(audit.workspaceId, "wsp_...lpha");
  assert.equal(audit.eventCount, 2);
  assert.equal(audit.events[0].eventId, "evt_..._001");
  assert.equal(audit.events[0].deviceId, "dev_...ptop");
  assert.equal(serialized.includes("evt_alpha_001"), false);
  assert.equal(serialized.includes("dev_laptop"), false);
  assert.equal(serialized.includes("Sensitive draft"), false);
  assert.equal(serialized.includes("Private follow-up"), false);
});

function event(id, position, overrides = {}) {
  const workspaceId = overrides.workspaceId ?? "wsp_alpha";
  const deviceId = overrides.deviceId ?? "dev_laptop";
  const cursorId = overrides.cursorId ?? id;

  return {
    id,
    workspaceId,
    deviceId,
    sequence: overrides.sequence ?? position,
    type: overrides.type ?? "task.updated",
    payload: overrides.payload ?? { title: `Task ${position}` },
    createdAt,
    cursor: overrides.cursor ?? formatCursor({ position, eventId: cursorId }),
  };
}
