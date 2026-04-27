import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ApprovalSessionStateError,
  createApprovalSessionStore,
} from "../src/approvalSessions.ts";

function controllableClock(start = "2026-04-27T00:00:00.000Z") {
  let current = new Date(start);

  return {
    now: () => current.toISOString(),
    advance: (ms) => {
      current = new Date(current.getTime() + ms);
    },
  };
}

describe("approval session store", () => {
  it("creates deterministic pending sessions and preserves requester actor metadata", () => {
    const clock = controllableClock();
    const store = createApprovalSessionStore({
      now: clock.now,
      idPrefix: "approval-test-",
    });

    const first = store.create({
      toolName: "draft_workspace_patch",
      arguments: { targetPath: "notes/workspace.md" },
      actor: {
        id: "operator-a",
        roles: ["author"],
        metadata: { desk: "blue" },
      },
      metadata: { batchId: "batch-1" },
      ttlMs: 60_000,
    });
    const second = store.create({
      operation: { type: "link_record", target: "record-7" },
      actor: { id: "operator-b" },
    });

    assert.equal(first.id, "approval-test-1");
    assert.equal(second.id, "approval-test-2");
    assert.equal(first.createdAt, "2026-04-27T00:00:00.000Z");
    assert.equal(first.expiresAt, "2026-04-27T00:01:00.000Z");
    assert.equal(first.status, "pending");
    assert.deepEqual(first.actor, {
      id: "operator-a",
      roles: ["author"],
      metadata: { desk: "blue" },
    });
    assert.deepEqual(store.get(first.id), first);
    assert.deepEqual(
      store.list({ actorId: "operator-a" }).map((session) => session.id),
      [first.id],
    );
  });

  it("records approval decisions with actor metadata and transition details", () => {
    const clock = controllableClock();
    const store = createApprovalSessionStore({ now: clock.now });
    const session = store.create({
      request: { type: "refresh_index", target: "workspace-cache" },
      actor: { id: "requester-1", metadata: { lane: "alpha" } },
    });

    clock.advance(2_000);
    const approved = store.approve(session.id, {
      actor: {
        id: "reviewer-1",
        roles: ["reviewer"],
        metadata: { ticket: "review-77" },
      },
      reason: "checked",
      metadata: { channel: "queue" },
    });

    assert.equal(approved.status, "approved");
    assert.equal(approved.approvedAt, "2026-04-27T00:00:02.000Z");
    assert.deepEqual(approved.approvedBy, {
      id: "reviewer-1",
      roles: ["reviewer"],
      metadata: { ticket: "review-77" },
    });
    assert.deepEqual(approved.decision, {
      status: "approved",
      at: "2026-04-27T00:00:02.000Z",
      actor: {
        id: "reviewer-1",
        roles: ["reviewer"],
        metadata: { ticket: "review-77" },
      },
      reason: "checked",
      metadata: { channel: "queue" },
    });
  });

  it("expires stale sessions before approval and blocks later terminal transitions", () => {
    const clock = controllableClock();
    const store = createApprovalSessionStore({ now: clock.now });
    const session = store.create({
      request: { type: "publish_note", target: "workspace-note" },
      ttlMs: 1_000,
    });

    clock.advance(1_001);

    assert.throws(
      () => store.approve(session.id, { actor: { id: "reviewer-1" } }),
      (error) =>
        error instanceof ApprovalSessionStateError &&
        error.sessionId === session.id &&
        error.status === "expired" &&
        /stale approval session/.test(error.message),
    );

    const expired = store.get(session.id);
    assert.equal(expired.status, "expired");
    assert.equal(expired.expiredAt, "2026-04-27T00:00:01.001Z");
    assert.deepEqual(
      store.list({ status: "expired" }).map((candidate) => candidate.id),
      [session.id],
    );
    assert.throws(
      () => store.reject(session.id, { actor: { id: "reviewer-2" } }),
      /terminal approval session .* status expired/,
    );
  });

  it("rejects unsafe transitions from every terminal state", () => {
    const store = createApprovalSessionStore({
      now: () => "2026-04-27T00:00:00.000Z",
    });

    const approved = store.approve(
      store.create({ request: { type: "sync_item", target: "item-a" } }).id,
      { actor: { id: "reviewer-a" } },
    );
    const rejected = store.reject(
      store.create({ request: { type: "sync_item", target: "item-b" } }).id,
      { actor: { id: "reviewer-b" }, reason: "needs changes" },
    );
    const expired = store.expire(
      store.create({ request: { type: "sync_item", target: "item-c" } }).id,
      { actor: { id: "reviewer-c" }, reason: "window closed" },
    );

    for (const session of [approved, rejected, expired]) {
      assert.throws(
        () => store.approve(session.id, { actor: { id: "reviewer-x" } }),
        /terminal approval session/,
      );
      assert.throws(
        () => store.reject(session.id, { actor: { id: "reviewer-y" } }),
        /terminal approval session/,
      );
      assert.throws(
        () => store.expire(session.id, { actor: { id: "reviewer-z" } }),
        /terminal approval session/,
      );
    }
  });

  it("returns immutable snapshots and keeps input and output clone boundaries", () => {
    const store = createApprovalSessionStore({
      now: () => "2026-04-27T00:00:00.000Z",
    });
    const request = {
      type: "update_workspace_note",
      target: "note-1",
      payload: { tags: ["alpha"], nested: { ready: true } },
    };
    const actor = {
      id: "operator-a",
      roles: ["author"],
      metadata: { desk: "blue" },
    };
    const metadata = { workflow: { id: "flow-1" } };

    const created = store.create({ request, actor, metadata });
    request.payload.tags.push("changed");
    request.payload.nested.ready = false;
    actor.roles.push("changed");
    actor.metadata.desk = "red";
    metadata.workflow.id = "changed";

    const fetched = store.get(created.id);
    assert.notEqual(fetched, created);
    assert.deepEqual(fetched.request, {
      type: "update_workspace_note",
      target: "note-1",
      payload: { tags: ["alpha"], nested: { ready: true } },
    });
    assert.deepEqual(fetched.actor, {
      id: "operator-a",
      roles: ["author"],
      metadata: { desk: "blue" },
    });
    assert.deepEqual(fetched.metadata, { workflow: { id: "flow-1" } });

    assert.equal(Object.isFrozen(fetched), true);
    assert.equal(Object.isFrozen(fetched.request), true);
    assert.equal(Object.isFrozen(fetched.actor.metadata), true);
    assert.throws(() => {
      fetched.request.payload.tags.push("mutated");
    }, TypeError);
    assert.throws(() => {
      fetched.actor.metadata.desk = "green";
    }, TypeError);

    assert.deepEqual(store.get(created.id).request, {
      type: "update_workspace_note",
      target: "note-1",
      payload: { tags: ["alpha"], nested: { ready: true } },
    });
  });
});
