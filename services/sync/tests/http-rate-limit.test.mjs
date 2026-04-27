import assert from "node:assert/strict";
import test from "node:test";

import {
  createUploadBatch,
  selectDownloadWindow,
} from "../src/bundles.ts";
import {
  INITIAL_CURSOR,
  advanceCursor,
  compareCursors,
} from "../src/cursors.ts";
import {
  SYNC_API_ERROR_CODES,
  createApiErrorResponse,
  createSyncHttpHandlers,
  staleCursorError,
} from "../src/http.ts";
import { InMemoryTokenWindowRateLimiter } from "../src/rateLimit.ts";

const baseEvent = {
  workspaceId: "wsp_alpha",
  deviceId: "dev_laptop",
  type: "note.updated",
  payload: { title: "Field notes", tags: ["alpha", "offline"] },
  createdAt: "2026-04-27T00:00:00.000Z",
};

test("health handler returns a standard JSON response", async () => {
  const handlers = createSyncHttpHandlers({
    now: () => Date.parse("2026-04-27T00:20:00.000Z"),
    repository: createFakeRepository(),
  });

  const response = await handlers.health();

  assert.equal(response.status, 200);
  assert.equal(response.headers["content-type"], "application/json");
  assert.deepEqual(response.body, {
    ok: true,
    service: "sync",
    checkedAt: "2026-04-27T00:20:00.000Z",
    repository: { mode: "memory" },
  });
});

test("download rejects malformed cursors before calling the repository", async () => {
  let downloadCalls = 0;
  const repository = {
    ...createFakeRepository(),
    downloadBundle(request) {
      downloadCalls += 1;
      return selectDownloadWindow([], request);
    },
  };
  const handlers = createSyncHttpHandlers({ repository });

  const response = await handlers.downloadBundle({
    body: {
      workspaceId: "wsp_alpha",
      deviceId: "dev_laptop",
      afterCursor: "not-a-cursor",
      limit: 10,
    },
  });

  assert.equal(downloadCalls, 0);
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "malformed_cursor");
  assert.match(response.body.error.details.issues[0].message, /cur_v1/);
});

test("uploads, downloads, and reads cursor status through an injected repository", async () => {
  const repository = createFakeRepository();
  const handlers = createSyncHttpHandlers({ repository });
  const event = { ...baseEvent, id: "evt_001", sequence: 1 };
  const upload = createUploadBatch({
    workspaceId: "wsp_alpha",
    deviceId: "dev_laptop",
    baseCursor: INITIAL_CURSOR,
    events: [event],
  });

  const uploadResponse = await handlers.uploadBundle({ body: upload });
  assert.equal(uploadResponse.status, 201);
  assert.deepEqual(uploadResponse.body.acceptedEventIds, ["evt_001"]);

  const downloadResponse = await handlers.downloadBundle({
    body: {
      workspaceId: "wsp_alpha",
      deviceId: "dev_tablet",
      afterCursor: INITIAL_CURSOR,
      limit: 10,
    },
  });
  assert.equal(downloadResponse.status, 200);
  assert.deepEqual(downloadResponse.body.events.map((syncedEvent) => syncedEvent.id), ["evt_001"]);
  assert.equal(downloadResponse.body.hasMore, false);

  const cursorResponse = await handlers.cursorStatus({
    body: {
      workspaceId: "wsp_alpha",
      deviceId: "dev_laptop",
      cursor: INITIAL_CURSOR,
    },
  });
  assert.equal(cursorResponse.status, 200);
  assert.equal(cursorResponse.body.stale, true);
  assert.equal(cursorResponse.body.currentCursor, uploadResponse.body.cursor);
});

test("rate limiter scopes tokens per workspace and device", async () => {
  let nowMs = 100_000;
  const limiter = new InMemoryTokenWindowRateLimiter({
    capacity: 1,
    windowMs: 1_000,
    now: () => nowMs,
  });
  const handlers = createSyncHttpHandlers({
    now: () => nowMs,
    rateLimiter: limiter,
    repository: createFakeRepository(),
  });

  const request = {
    body: {
      workspaceId: "wsp_alpha",
      deviceId: "dev_laptop",
      afterCursor: INITIAL_CURSOR,
      limit: 10,
    },
  };

  assert.equal((await handlers.downloadBundle(request)).status, 200);

  const limited = await handlers.downloadBundle(request);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers["retry-after"], "1");
  assert.equal(limited.body.error.code, "rate_limited");
  assert.equal(limited.body.error.details.remaining, 0);

  const otherDevice = await handlers.downloadBundle({
    body: {
      ...request.body,
      deviceId: "dev_tablet",
    },
  });
  assert.equal(otherDevice.status, 200);

  nowMs += 1_000;
  assert.equal((await handlers.downloadBundle(request)).status, 200);
});

test("standard error responses keep code, message, details, and status stable", () => {
  const expectedStatuses = {
    malformed_cursor: 400,
    stale_cursor: 409,
    invalid_upload: 400,
    not_found: 404,
    rate_limited: 429,
  };

  for (const code of SYNC_API_ERROR_CODES) {
    const response = createApiErrorResponse(code, `${code} example`, { field: "value" });
    assert.equal(response.status, expectedStatuses[code]);
    assert.equal(response.headers["content-type"], "application/json");
    assert.deepEqual(response.body, {
      error: {
        code,
        message: `${code} example`,
        details: { field: "value" },
      },
    });
  }
});

test("invalid uploads and stale cursors use standard API error bodies", async () => {
  const handlers = createSyncHttpHandlers({ repository: createFakeRepository() });

  const invalid = await handlers.uploadBundle({
    body: {
      workspaceId: "wsp_alpha",
      deviceId: "dev_laptop",
      baseCursor: INITIAL_CURSOR,
      events: [],
      checksum: `sha256:${"0".repeat(64)}`,
    },
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error.code, "invalid_upload");
  assert.equal(invalid.body.error.details.issues.some((issue) => issue.path === "events"), true);

  const staleHandlers = createSyncHttpHandlers({
    repository: {
      ...createFakeRepository(),
      uploadBundle() {
        throw staleCursorError("Base cursor is behind the current cursor.", {
          baseCursor: INITIAL_CURSOR,
          currentCursor: advanceCursor(INITIAL_CURSOR, ["evt_999"]),
        });
      },
    },
  });
  const upload = createUploadBatch({
    workspaceId: "wsp_alpha",
    deviceId: "dev_laptop",
    baseCursor: INITIAL_CURSOR,
    events: [{ ...baseEvent, id: "evt_010", sequence: 10 }],
  });
  const stale = await staleHandlers.uploadBundle({ body: upload });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error.code, "stale_cursor");
  assert.equal(stale.body.error.details.baseCursor, INITIAL_CURSOR);
});

function createFakeRepository() {
  let currentCursor = INITIAL_CURSOR;
  const syncedEvents = [];

  return {
    health() {
      return { mode: "memory" };
    },
    uploadBundle(batch) {
      if (batch.baseCursor !== currentCursor) {
        throw staleCursorError("Base cursor is behind the current cursor.", {
          baseCursor: batch.baseCursor,
          currentCursor,
        });
      }

      const acceptedEventIds = [];
      for (const event of batch.events) {
        currentCursor = advanceCursor(currentCursor, [event.id]);
        acceptedEventIds.push(event.id);
        syncedEvents.push({
          ...event,
          payload: JSON.parse(JSON.stringify(event.payload)),
          cursor: currentCursor,
        });
      }

      return {
        workspaceId: batch.workspaceId,
        deviceId: batch.deviceId,
        cursor: currentCursor,
        acceptedEventIds,
      };
    },
    downloadBundle(request) {
      return selectDownloadWindow(syncedEvents, request);
    },
    getCursorStatus(request) {
      return {
        ...request,
        currentCursor,
        stale: compareCursors(request.cursor, currentCursor) < 0,
      };
    },
  };
}
