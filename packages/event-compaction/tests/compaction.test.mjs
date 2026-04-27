import assert from "node:assert/strict";
import test from "node:test";

import {
  CheckpointSnapshotError,
  CompactionPlanError,
  EVENT_COMPACTION_ERROR_CODES,
  EventEnvelopeValidationError,
  SequenceRangePlanError,
  createCheckpointSnapshotDescriptor,
  createDryRunCompactionPlan,
  fingerprintEventEnvelope,
  planSequenceRanges,
  serializeDeterministicJson,
  summarizeReplayVerification,
  validateEventEnvelope,
} from "../src/index.ts";

const baseEvents = Object.freeze([
  event(1, "notes.created", { title: "First note" }),
  event(2, "notes.updated", { title: "First note", tags: ["local"] }),
  event(3, "tasks.created", { title: "Check local queue" }),
  event(5, "tasks.updated", { title: "Check local queue", done: true }),
  event(6, "notes.archived", { title: "First note" }),
]);

test("validates event envelopes and returns immutable normalized copies", () => {
  const source = event(1, "notes.created", {
    nested: {
      b: 2,
      a: 1,
    },
  });
  const normalized = validateEventEnvelope(source);
  const repeated = validateEventEnvelope({
    ...source,
    payload: {
      nested: {
        a: 1,
        b: 2,
      },
    },
  });

  assert.equal(normalized.eventId, "evt_notes_0001");
  assert.equal(normalized.streamId, "stream_notes");
  assert.equal(normalized.sequence, 1);
  assert.equal(fingerprintEventEnvelope(normalized), fingerprintEventEnvelope(repeated));
  assert.throws(() => {
    normalized.payload.nested.a = 99;
  }, TypeError);
  assert.throws(
    () => validateEventEnvelope({ ...source, sequence: 0 }),
    (error) => {
      assert.equal(error instanceof EventEnvelopeValidationError, true);
      assert.equal(error.code, EVENT_COMPACTION_ERROR_CODES.INVALID_EVENT_ENVELOPE);
      assert.deepEqual(error.details.path, "event.sequence");
      return true;
    },
  );
});

test("plans deterministic sequence ranges and reports gaps", () => {
  const plan = planSequenceRanges(baseEvents, {
    maxEventsPerRange: 2,
  });
  const repeated = planSequenceRanges([...baseEvents].reverse(), {
    maxEventsPerRange: 2,
  });

  assert.equal(plan.eventCount, 5);
  assert.equal(plan.rangeCount, 3);
  assert.equal(plan.fingerprint, repeated.fingerprint);
  assert.deepEqual(
    plan.streams[0].ranges.map((range) => [range.fromSequence, range.toSequence, range.eventCount]),
    [
      [1, 2, 2],
      [3, 3, 1],
      [5, 6, 2],
    ],
  );
  assert.deepEqual(plan.gaps, [
    {
      streamId: "stream_notes",
      afterSequence: 3,
      beforeSequence: 5,
      missingCount: 1,
    },
  ]);
  assert.throws(
    () => planSequenceRanges([
      event(1, "notes.created", { title: "First note" }),
      {
        ...event(1, "notes.updated", { title: "First note" }),
        eventId: "evt_notes_duplicate",
      },
    ]),
    (error) => {
      assert.equal(error instanceof SequenceRangePlanError, true);
      assert.equal(error.code, EVENT_COMPACTION_ERROR_CODES.INVALID_SEQUENCE_RANGE);
      assert.deepEqual(error.details, {
        sequence: 1,
        streamId: "stream_notes",
      });
      return true;
    },
  );
});

test("creates checkpoint snapshot descriptors with stable ids and state fingerprints", () => {
  const checkpoint = createCheckpointSnapshotDescriptor({
    streamId: "stream_notes",
    sequence: 3,
    createdAt: "2026-04-27T04:00:00.000Z",
    state: {
      noteCount: 1,
      taskCount: 1,
    },
    sourceEventIds: baseEvents.slice(0, 3).map((item) => item.eventId),
    metadata: {
      dryRun: false,
    },
  });
  const repeated = createCheckpointSnapshotDescriptor({
    streamId: "stream_notes",
    sequence: 3,
    createdAt: "2026-04-27T04:00:00.000Z",
    state: {
      taskCount: 1,
      noteCount: 1,
    },
    sourceEventIds: baseEvents.slice(0, 3).map((item) => item.eventId),
    metadata: {
      dryRun: false,
    },
  });

  assert.equal(checkpoint.kind, "event-compaction.checkpoint-snapshot");
  assert.equal(checkpoint.checkpointId, repeated.checkpointId);
  assert.equal(checkpoint.stateFingerprint, repeated.stateFingerprint);
  assert.equal(checkpoint.sourceEventCount, 3);
  assert.match(checkpoint.fingerprint, /^fnv1a64:[0-9a-f]{16}$/);
  assert.throws(
    () => createCheckpointSnapshotDescriptor({
      streamId: "stream_notes",
      sequence: 3,
      createdAt: "not-a-date",
      state: {},
      sourceEventIds: [],
    }),
    (error) => {
      assert.equal(error instanceof CheckpointSnapshotError, true);
      assert.equal(error.code, EVENT_COMPACTION_ERROR_CODES.CHECKPOINT_INVALID);
      return true;
    },
  );
});

test("summarizes replay verification against checkpoint descriptors", () => {
  const checkpoint = createCheckpointSnapshotDescriptor({
    streamId: "stream_notes",
    sequence: 3,
    createdAt: "2026-04-27T04:00:00.000Z",
    state: {
      noteCount: 1,
      taskCount: 1,
    },
    sourceEventIds: baseEvents.slice(0, 3).map((item) => item.eventId),
  });

  const summary = summarizeReplayVerification(baseEvents.slice(0, 3), {
    checkpoint,
    expectedStateFingerprint: checkpoint.stateFingerprint,
  });
  const mismatch = summarizeReplayVerification(baseEvents.slice(0, 2), {
    checkpoint,
  });

  assert.equal(summary.ok, true);
  assert.equal(summary.streamId, "stream_notes");
  assert.equal(summary.firstSequence, 1);
  assert.equal(summary.lastSequence, 3);
  assert.deepEqual(summary.issues, []);
  assert.deepEqual(summary.checkpoint, {
    checkpointId: checkpoint.checkpointId,
    streamId: "stream_notes",
    sequence: 3,
    stateFingerprint: checkpoint.stateFingerprint,
    sourceEventCount: 3,
    sourceEventIdsMatch: true,
    stateFingerprintMatch: true,
  });

  assert.equal(mismatch.ok, false);
  assert.deepEqual(
    mismatch.issues.map((issue) => issue.code),
    ["checkpoint_sequence_mismatch", "checkpoint_source_events_mismatch"],
  );
});

test("builds dry-run compaction plans without mutating source events", () => {
  const source = baseEvents.map((item) => ({ ...item, payload: { ...item.payload } }));
  const plan = createDryRunCompactionPlan(source, {
    compactThroughSequence: 3,
    createdAt: "2026-04-27T05:00:00.000Z",
    maxEventsPerRange: 3,
    minimumEventsPerCheckpoint: 2,
  });
  const repeated = createDryRunCompactionPlan([...source].reverse(), {
    compactThroughSequence: 3,
    createdAt: "2026-04-27T05:00:00.000Z",
    maxEventsPerRange: 3,
    minimumEventsPerCheckpoint: 2,
  });

  assert.equal(plan.dryRun, true);
  assert.equal(plan.planId, repeated.planId);
  assert.equal(plan.fingerprint, repeated.fingerprint);
  assert.equal(plan.eventCount, 5);
  assert.equal(plan.compactedEventCount, 3);
  assert.equal(plan.retainedEventCount, 2);
  assert.deepEqual(
    plan.checkpointDescriptors.map((checkpoint) => checkpoint.sequence),
    [3],
  );
  assert.deepEqual(
    plan.retainedEvents.map((item) => item.sequence),
    [5, 6],
  );
  assert.deepEqual(plan.warnings, [
    "sequence gaps remain visible in the dry-run plan",
  ]);
  assert.equal(source[0].payload.title, "First note");
  assert.throws(() => {
    plan.retainedEvents.push({ eventId: "x" });
  }, TypeError);
});

test("requires explicit stream selection for multi-stream dry runs", () => {
  const mixed = [
    event(1, "notes.created", { title: "First note" }),
    {
      ...event(1, "items.created", { title: "Second item" }),
      eventId: "evt_items_0001",
      streamId: "stream_items",
    },
  ];

  assert.throws(
    () => createDryRunCompactionPlan(mixed),
    (error) => {
      assert.equal(error instanceof CompactionPlanError, true);
      assert.equal(error.code, EVENT_COMPACTION_ERROR_CODES.INVALID_COMPACTION_PLAN);
      assert.deepEqual(error.details.streamIds, ["stream_items", "stream_notes"]);
      return true;
    },
  );

  const selected = createDryRunCompactionPlan(mixed, {
    streamId: "stream_items",
  });
  assert.equal(selected.eventCount, 1);
  assert.equal(selected.retainedEventCount, 1);
});

test("serializes JSON deterministically and rejects unsupported values", () => {
  assert.equal(
    serializeDeterministicJson({ z: 1, a: { b: false, a: null } }),
    '{"a":{"a":null,"b":false},"z":1}',
  );
  assert.throws(() => serializeDeterministicJson({ bad: Number.NaN }));
});

function event(sequence, type, payload) {
  return {
    eventId: `evt_notes_${String(sequence).padStart(4, "0")}`,
    streamId: "stream_notes",
    sequence,
    type,
    timestamp: new Date(Date.UTC(2026, 3, 27, 4, 0, sequence)).toISOString(),
    payload,
    metadata: {
      source: "local-test",
    },
  };
}
