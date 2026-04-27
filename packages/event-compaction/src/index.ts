export const EVENT_COMPACTION_FORMAT_VERSION = 1;

export const EVENT_COMPACTION_ERROR_CODES = Object.freeze({
  CHECKPOINT_INVALID: "EVENT_COMPACTION_CHECKPOINT_INVALID",
  INVALID_EVENT_ENVELOPE: "EVENT_COMPACTION_INVALID_EVENT_ENVELOPE",
  INVALID_COMPACTION_PLAN: "EVENT_COMPACTION_INVALID_COMPACTION_PLAN",
  INVALID_SEQUENCE_RANGE: "EVENT_COMPACTION_INVALID_SEQUENCE_RANGE",
  REPLAY_VERIFICATION_FAILED: "EVENT_COMPACTION_REPLAY_VERIFICATION_FAILED",
  SERIALIZATION_INVALID: "EVENT_COMPACTION_SERIALIZATION_INVALID",
});

export type EventCompactionErrorCode =
  (typeof EVENT_COMPACTION_ERROR_CODES)[keyof typeof EVENT_COMPACTION_ERROR_CODES];

export type JsonPrimitive = string | number | boolean | null;
export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? Readonly<{ [K in keyof T]: DeepReadonly<T[K]> }>
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

export interface EventCompactionErrorOptions {
  readonly cause?: unknown;
  readonly details?: Readonly<Record<string, unknown>>;
}

export class EventCompactionError extends Error {
  readonly code: EventCompactionErrorCode;
  readonly details?: DeepReadonly<Record<string, unknown>>;

  constructor(
    code: EventCompactionErrorCode,
    message: string,
    options: EventCompactionErrorOptions = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "EventCompactionError";
    this.code = code;
    this.details = options.details === undefined ? undefined : readOnlyClone(options.details);
  }
}

export class EventEnvelopeValidationError extends EventCompactionError {
  constructor(message: string, options: EventCompactionErrorOptions = {}) {
    super(EVENT_COMPACTION_ERROR_CODES.INVALID_EVENT_ENVELOPE, message, options);
    this.name = "EventEnvelopeValidationError";
  }
}

export class SequenceRangePlanError extends EventCompactionError {
  constructor(message: string, options: EventCompactionErrorOptions = {}) {
    super(EVENT_COMPACTION_ERROR_CODES.INVALID_SEQUENCE_RANGE, message, options);
    this.name = "SequenceRangePlanError";
  }
}

export class CheckpointSnapshotError extends EventCompactionError {
  constructor(message: string, options: EventCompactionErrorOptions = {}) {
    super(EVENT_COMPACTION_ERROR_CODES.CHECKPOINT_INVALID, message, options);
    this.name = "CheckpointSnapshotError";
  }
}

export class ReplayVerificationError extends EventCompactionError {
  constructor(message: string, options: EventCompactionErrorOptions = {}) {
    super(EVENT_COMPACTION_ERROR_CODES.REPLAY_VERIFICATION_FAILED, message, options);
    this.name = "ReplayVerificationError";
  }
}

export class CompactionPlanError extends EventCompactionError {
  constructor(message: string, options: EventCompactionErrorOptions = {}) {
    super(EVENT_COMPACTION_ERROR_CODES.INVALID_COMPACTION_PLAN, message, options);
    this.name = "CompactionPlanError";
  }
}

export interface EventEnvelope {
  readonly eventId: string;
  readonly streamId: string;
  readonly sequence: number;
  readonly type: string;
  readonly timestamp: string;
  readonly payload: JsonObject;
  readonly metadata?: JsonObject;
}

export interface SequenceRangePlanOptions {
  readonly maxEventsPerRange?: number;
  readonly streamId?: string;
}

export interface SequenceGap {
  readonly streamId: string;
  readonly afterSequence: number;
  readonly beforeSequence: number;
  readonly missingCount: number;
}

export interface SequenceRange {
  readonly streamId: string;
  readonly fromSequence: number;
  readonly toSequence: number;
  readonly eventCount: number;
  readonly eventIds: readonly string[];
  readonly fingerprint: string;
}

export interface StreamSequencePlan {
  readonly streamId: string;
  readonly eventCount: number;
  readonly firstSequence: number | null;
  readonly lastSequence: number | null;
  readonly ranges: readonly SequenceRange[];
  readonly gaps: readonly SequenceGap[];
  readonly fingerprint: string;
}

export interface SequenceRangePlan {
  readonly kind: "event-compaction.sequence-range-plan";
  readonly version: number;
  readonly dryRun: true;
  readonly eventCount: number;
  readonly rangeCount: number;
  readonly streams: readonly StreamSequencePlan[];
  readonly gaps: readonly SequenceGap[];
  readonly sourceFingerprint: string;
  readonly fingerprint: string;
}

export interface CheckpointSnapshotInput {
  readonly checkpointId?: string;
  readonly streamId: string;
  readonly sequence: number;
  readonly createdAt: string;
  readonly state: JsonObject;
  readonly sourceEventIds?: readonly string[];
  readonly metadata?: JsonObject;
}

export interface CheckpointSnapshotDescriptor {
  readonly kind: "event-compaction.checkpoint-snapshot";
  readonly version: number;
  readonly checkpointId: string;
  readonly streamId: string;
  readonly sequence: number;
  readonly createdAt: string;
  readonly stateFingerprint: string;
  readonly sourceEventCount: number;
  readonly sourceEventIds: readonly string[];
  readonly metadata?: JsonObject;
  readonly fingerprint: string;
}

export interface ReplayVerificationOptions {
  readonly checkpoint?: CheckpointSnapshotDescriptor;
  readonly expectedStateFingerprint?: string;
  readonly streamId?: string;
}

export type ReplayVerificationIssueCode =
  | "sequence_gap"
  | "checkpoint_stream_mismatch"
  | "checkpoint_sequence_mismatch"
  | "checkpoint_source_events_mismatch"
  | "checkpoint_state_fingerprint_mismatch";

export interface ReplayVerificationIssue {
  readonly code: ReplayVerificationIssueCode;
  readonly message: string;
  readonly details?: DeepReadonly<Record<string, unknown>>;
}

export interface ReplayCheckpointVerification {
  readonly checkpointId: string;
  readonly streamId: string;
  readonly sequence: number;
  readonly stateFingerprint: string;
  readonly sourceEventCount: number;
  readonly sourceEventIdsMatch: boolean;
  readonly stateFingerprintMatch: boolean | null;
}

export interface ReplayVerificationSummary {
  readonly kind: "event-compaction.replay-verification";
  readonly version: number;
  readonly ok: boolean;
  readonly streamId: string | null;
  readonly eventCount: number;
  readonly firstSequence: number | null;
  readonly lastSequence: number | null;
  readonly rangeCount: number;
  readonly gaps: readonly SequenceGap[];
  readonly checkpoint: ReplayCheckpointVerification | null;
  readonly issues: readonly ReplayVerificationIssue[];
  readonly sourceFingerprint: string;
  readonly fingerprint: string;
}

export interface DryRunCompactionPlanOptions {
  readonly compactThroughSequence?: number;
  readonly createdAt?: string;
  readonly maxEventsPerRange?: number;
  readonly minimumEventsPerCheckpoint?: number;
  readonly planId?: string;
  readonly streamId?: string;
}

export interface RetainedEventDescriptor {
  readonly eventId: string;
  readonly streamId: string;
  readonly sequence: number;
  readonly fingerprint: string;
}

export interface DryRunCompactionPlan {
  readonly kind: "event-compaction.dry-run-plan";
  readonly version: number;
  readonly dryRun: true;
  readonly planId: string;
  readonly createdAt: string;
  readonly eventCount: number;
  readonly compactedEventCount: number;
  readonly retainedEventCount: number;
  readonly sourceFingerprint: string;
  readonly sequencePlanFingerprint: string;
  readonly checkpointDescriptors: readonly CheckpointSnapshotDescriptor[];
  readonly retainedEvents: readonly RetainedEventDescriptor[];
  readonly warnings: readonly string[];
  readonly fingerprint: string;
}

interface NormalizedEventSet {
  readonly events: readonly EventEnvelope[];
  readonly sourceFingerprint: string;
}

interface CandidateCompactionRange {
  readonly range: SequenceRange;
  readonly events: readonly EventEnvelope[];
}

const DEFAULT_PLAN_CREATED_AT = "1970-01-01T00:00:00.000Z";

export function validateEventEnvelope(value: unknown): DeepReadonly<EventEnvelope> {
  if (!isPlainRecord(value)) {
    throw new EventEnvelopeValidationError("event envelope must be a plain object", {
      details: { path: "event" },
    });
  }

  const event: EventEnvelope = {
    eventId: requireCleanString(value.eventId, "event.eventId", eventEnvelopeError),
    streamId: requireCleanString(value.streamId, "event.streamId", eventEnvelopeError),
    sequence: readPositiveInteger(value.sequence, "event.sequence", eventEnvelopeError),
    type: requireCleanString(value.type, "event.type", eventEnvelopeError),
    timestamp: readTimestamp(value.timestamp, "event.timestamp", eventEnvelopeError),
    payload: readJsonObject(value.payload, "event.payload", eventEnvelopeError),
  };

  if (value.metadata !== undefined) {
    event.metadata = readJsonObject(value.metadata, "event.metadata", eventEnvelopeError);
  }

  return readOnlyClone(event);
}

export function validateEventEnvelopes(values: readonly unknown[]): readonly DeepReadonly<EventEnvelope>[] {
  return normalizeEventSet(values).events;
}

export function fingerprintEventEnvelope(value: EventEnvelope): string {
  const event = validateEventEnvelope(value);
  return createFingerprint({
    kind: "event-compaction.event-envelope",
    event,
  });
}

export function planSequenceRanges(
  values: readonly unknown[],
  options: SequenceRangePlanOptions = {},
): SequenceRangePlan {
  const maxEventsPerRange = options.maxEventsPerRange === undefined
    ? Number.MAX_SAFE_INTEGER
    : readPositiveInteger(
      options.maxEventsPerRange,
      "options.maxEventsPerRange",
      sequenceRangeError,
    );
  const streamId = options.streamId === undefined
    ? undefined
    : requireCleanString(options.streamId, "options.streamId", sequenceRangeError);
  const source = normalizeEventSet(values, streamId);

  const streams = [...new Set(source.events.map((event) => event.streamId))]
    .sort(compareStrings)
    .map((id) => createStreamSequencePlan(
      id,
      source.events.filter((event) => event.streamId === id),
      maxEventsPerRange,
    ));
  const gaps = streams.flatMap((stream) => stream.gaps);
  const rangeCount = streams.reduce((count, stream) => count + stream.ranges.length, 0);
  const summaryPayload = {
    dryRun: true,
    eventCount: source.events.length,
    gaps,
    rangeCount,
    sourceFingerprint: source.sourceFingerprint,
    streamIds: streams.map((stream) => stream.streamId),
    version: EVENT_COMPACTION_FORMAT_VERSION,
  };
  const fingerprint = createFingerprint({
    kind: "event-compaction.sequence-range-plan",
    summary: summaryPayload,
    streams,
  });

  return readOnlyClone({
    kind: "event-compaction.sequence-range-plan",
    version: EVENT_COMPACTION_FORMAT_VERSION,
    dryRun: true,
    eventCount: source.events.length,
    rangeCount,
    streams,
    gaps,
    sourceFingerprint: source.sourceFingerprint,
    fingerprint,
  });
}

export function createCheckpointSnapshotDescriptor(
  input: CheckpointSnapshotInput,
): CheckpointSnapshotDescriptor {
  if (!isPlainRecord(input)) {
    throw new CheckpointSnapshotError("checkpoint input must be a plain object", {
      details: { path: "checkpoint" },
    });
  }

  const streamId = requireCleanString(input.streamId, "checkpoint.streamId", checkpointError);
  const sequence = readNonNegativeInteger(input.sequence, "checkpoint.sequence", checkpointError);
  const createdAt = readTimestamp(input.createdAt, "checkpoint.createdAt", checkpointError);
  const state = readJsonObject(input.state, "checkpoint.state", checkpointError);
  const sourceEventIds = readSourceEventIds(input.sourceEventIds ?? [], "checkpoint.sourceEventIds");
  const metadata = input.metadata === undefined
    ? undefined
    : readJsonObject(input.metadata, "checkpoint.metadata", checkpointError);
  const stateFingerprint = createFingerprint({
    kind: "event-compaction.checkpoint-state",
    state,
  });
  const checkpointId = input.checkpointId === undefined
    ? createCheckpointId(streamId, sequence, stateFingerprint, sourceEventIds, metadata)
    : requireCleanString(input.checkpointId, "checkpoint.checkpointId", checkpointError);
  const base = {
    checkpointId,
    createdAt,
    kind: "event-compaction.checkpoint-snapshot",
    metadata,
    sequence,
    sourceEventCount: sourceEventIds.length,
    sourceEventIds,
    stateFingerprint,
    streamId,
    version: EVENT_COMPACTION_FORMAT_VERSION,
  };
  const fingerprint = createFingerprint({
    kind: "event-compaction.checkpoint-snapshot",
    descriptor: base,
  });

  const descriptor: CheckpointSnapshotDescriptor = {
    kind: "event-compaction.checkpoint-snapshot",
    version: EVENT_COMPACTION_FORMAT_VERSION,
    checkpointId,
    streamId,
    sequence,
    createdAt,
    stateFingerprint,
    sourceEventCount: sourceEventIds.length,
    sourceEventIds,
    fingerprint,
  };
  if (metadata !== undefined) {
    descriptor.metadata = metadata;
  }

  return readOnlyClone(descriptor);
}

export function fingerprintCheckpointSnapshot(
  checkpoint: CheckpointSnapshotDescriptor,
): string {
  const normalized = readCheckpointSnapshotDescriptor(checkpoint);
  return normalized.fingerprint;
}

export function summarizeReplayVerification(
  values: readonly unknown[],
  options: ReplayVerificationOptions = {},
): ReplayVerificationSummary {
  const checkpoint = options.checkpoint === undefined
    ? undefined
    : readCheckpointSnapshotDescriptor(options.checkpoint);
  const streamId = options.streamId === undefined
    ? checkpoint?.streamId
    : requireCleanString(options.streamId, "options.streamId", replayVerificationError);
  const source = normalizeEventSet(values, streamId);
  const uniqueStreamIds = [...new Set(source.events.map((event) => event.streamId))].sort(compareStrings);

  if (streamId === undefined && uniqueStreamIds.length > 1) {
    throw new ReplayVerificationError(
      "replay verification must target one stream when multiple streams are present",
      { details: { streamIds: uniqueStreamIds } },
    );
  }

  const selectedStreamId = streamId ?? uniqueStreamIds[0] ?? null;
  const selectedEvents = selectedStreamId === null
    ? []
    : source.events.filter((event) => event.streamId === selectedStreamId);
  const plan = planSequenceRanges(selectedEvents, {
    streamId: selectedStreamId ?? undefined,
  });
  const streamPlan = plan.streams[0];
  const issues: ReplayVerificationIssue[] = plan.gaps.map((gap) => ({
    code: "sequence_gap",
    message: "event sequence has a gap",
    details: {
      afterSequence: gap.afterSequence,
      beforeSequence: gap.beforeSequence,
      missingCount: gap.missingCount,
      streamId: gap.streamId,
    },
  }));
  const checkpointSummary = checkpoint === undefined
    ? null
    : verifyCheckpointReplay(checkpoint, selectedStreamId, selectedEvents, options, issues);
  const summaryPayload = {
    checkpoint: checkpointSummary,
    eventCount: selectedEvents.length,
    firstSequence: streamPlan?.firstSequence ?? null,
    gaps: plan.gaps,
    issues,
    lastSequence: streamPlan?.lastSequence ?? null,
    rangeCount: plan.rangeCount,
    sourceFingerprint: source.sourceFingerprint,
    streamId: selectedStreamId,
    version: EVENT_COMPACTION_FORMAT_VERSION,
  };
  const fingerprint = createFingerprint({
    kind: "event-compaction.replay-verification",
    summary: summaryPayload,
  });

  return readOnlyClone({
    kind: "event-compaction.replay-verification",
    version: EVENT_COMPACTION_FORMAT_VERSION,
    ok: issues.length === 0,
    streamId: selectedStreamId,
    eventCount: selectedEvents.length,
    firstSequence: streamPlan?.firstSequence ?? null,
    lastSequence: streamPlan?.lastSequence ?? null,
    rangeCount: plan.rangeCount,
    gaps: plan.gaps,
    checkpoint: checkpointSummary,
    issues,
    sourceFingerprint: source.sourceFingerprint,
    fingerprint,
  });
}

export function createDryRunCompactionPlan(
  values: readonly unknown[],
  options: DryRunCompactionPlanOptions = {},
): DryRunCompactionPlan {
  const streamId = options.streamId === undefined
    ? undefined
    : requireCleanString(options.streamId, "options.streamId", compactionPlanError);
  const source = normalizeEventSet(values, streamId);
  const uniqueStreamIds = [...new Set(source.events.map((event) => event.streamId))].sort(compareStrings);

  if (streamId === undefined && uniqueStreamIds.length > 1) {
    throw new CompactionPlanError(
      "dry-run compaction must target one stream when multiple streams are present",
      { details: { streamIds: uniqueStreamIds } },
    );
  }

  const selectedStreamId = streamId ?? uniqueStreamIds[0] ?? null;
  const selectedEvents = selectedStreamId === null
    ? []
    : source.events.filter((event) => event.streamId === selectedStreamId);
  const maxEventsPerRange = options.maxEventsPerRange === undefined
    ? Number.MAX_SAFE_INTEGER
    : readPositiveInteger(
      options.maxEventsPerRange,
      "options.maxEventsPerRange",
      compactionPlanError,
    );
  const minimumEventsPerCheckpoint = options.minimumEventsPerCheckpoint === undefined
    ? 2
    : readPositiveInteger(
      options.minimumEventsPerCheckpoint,
      "options.minimumEventsPerCheckpoint",
      compactionPlanError,
    );
  const createdAt = options.createdAt === undefined
    ? DEFAULT_PLAN_CREATED_AT
    : readTimestamp(options.createdAt, "options.createdAt", compactionPlanError);
  const compactThroughSequence = options.compactThroughSequence === undefined
    ? Number.MAX_SAFE_INTEGER
    : readNonNegativeInteger(
      options.compactThroughSequence,
      "options.compactThroughSequence",
      compactionPlanError,
    );
  const sequencePlan = planSequenceRanges(selectedEvents, {
    maxEventsPerRange,
    streamId: selectedStreamId ?? undefined,
  });
  const candidates = collectCandidateRanges(
    selectedEvents,
    sequencePlan,
    compactThroughSequence,
    minimumEventsPerCheckpoint,
  );
  const compactedEventIds = new Set(candidates.flatMap((candidate) => candidate.range.eventIds));
  const checkpointDescriptors = candidates.map((candidate) => createCheckpointSnapshotDescriptor({
    createdAt,
    metadata: {
      compactedRangeFingerprint: candidate.range.fingerprint,
      dryRun: true,
    },
    sequence: candidate.range.toSequence,
    sourceEventIds: candidate.range.eventIds,
    state: {
      compactedEventCount: candidate.events.length,
      fromSequence: candidate.range.fromSequence,
      sourceFingerprint: fingerprintEvents(candidate.events),
      streamId: candidate.range.streamId,
      toSequence: candidate.range.toSequence,
    },
    streamId: candidate.range.streamId,
  }));
  const retainedEvents = selectedEvents
    .filter((event) => !compactedEventIds.has(event.eventId))
    .map((event) => ({
      eventId: event.eventId,
      streamId: event.streamId,
      sequence: event.sequence,
      fingerprint: fingerprintEventEnvelope(event),
    }))
    .sort(compareRetainedEvents);
  const warnings = sequencePlan.gaps.length === 0
    ? []
    : ["sequence gaps remain visible in the dry-run plan"];
  const summaryPayload = {
    checkpointFingerprints: checkpointDescriptors.map((checkpoint) => checkpoint.fingerprint),
    compactedEventCount: compactedEventIds.size,
    createdAt,
    dryRun: true,
    eventCount: selectedEvents.length,
    retainedEventCount: retainedEvents.length,
    retainedEventFingerprints: retainedEvents.map((event) => event.fingerprint),
    sequencePlanFingerprint: sequencePlan.fingerprint,
    sourceFingerprint: source.sourceFingerprint,
    version: EVENT_COMPACTION_FORMAT_VERSION,
    warnings,
  };
  const planId = options.planId === undefined
    ? `plan_${createFingerprint(summaryPayload).slice("fnv1a64:".length)}`
    : requireCleanString(options.planId, "options.planId", compactionPlanError);
  const fingerprint = createFingerprint({
    kind: "event-compaction.dry-run-plan",
    planId,
    summary: summaryPayload,
  });

  return readOnlyClone({
    kind: "event-compaction.dry-run-plan",
    version: EVENT_COMPACTION_FORMAT_VERSION,
    dryRun: true,
    planId,
    createdAt,
    eventCount: selectedEvents.length,
    compactedEventCount: compactedEventIds.size,
    retainedEventCount: retainedEvents.length,
    sourceFingerprint: source.sourceFingerprint,
    sequencePlanFingerprint: sequencePlan.fingerprint,
    checkpointDescriptors,
    retainedEvents,
    warnings,
    fingerprint,
  });
}

export function fingerprintDryRunCompactionPlan(plan: DryRunCompactionPlan): string {
  return createFingerprint({
    kind: "event-compaction.dry-run-plan",
    plan,
  });
}

export function serializeDeterministicJson(value: unknown): string {
  return stringifyStable(value, "", new WeakSet<object>());
}

function normalizeEventSet(values: readonly unknown[], streamId?: string): NormalizedEventSet {
  if (!Array.isArray(values)) {
    throw new EventEnvelopeValidationError("events must be an array", {
      details: { path: "events" },
    });
  }

  const events = values
    .map(validateEventEnvelope)
    .filter((event) => streamId === undefined || event.streamId === streamId)
    .sort(compareEvents);
  const ids = new Set<string>();
  for (const event of events) {
    if (ids.has(event.eventId)) {
      throw new EventEnvelopeValidationError("event ids must be unique", {
        details: { eventId: event.eventId },
      });
    }
    ids.add(event.eventId);
  }

  return {
    events: readOnlyClone(events),
    sourceFingerprint: fingerprintEvents(events),
  };
}

function createStreamSequencePlan(
  streamId: string,
  events: readonly EventEnvelope[],
  maxEventsPerRange: number,
): StreamSequencePlan {
  const ranges: SequenceRange[] = [];
  const gaps: SequenceGap[] = [];
  let currentEvents: EventEnvelope[] = [];
  let previousSequence: number | null = null;
  const seenSequences = new Set<number>();

  for (const event of events) {
    if (seenSequences.has(event.sequence)) {
      throw new SequenceRangePlanError("event sequences must be unique per stream", {
        details: {
          sequence: event.sequence,
          streamId,
        },
      });
    }
    seenSequences.add(event.sequence);

    const shouldStartNewRange =
      previousSequence === null ||
      event.sequence !== previousSequence + 1 ||
      currentEvents.length >= maxEventsPerRange;

    if (shouldStartNewRange) {
      if (currentEvents.length > 0) {
        ranges.push(createSequenceRange(streamId, currentEvents));
      }
      if (previousSequence !== null && event.sequence > previousSequence + 1) {
        gaps.push({
          streamId,
          afterSequence: previousSequence,
          beforeSequence: event.sequence,
          missingCount: event.sequence - previousSequence - 1,
        });
      }
      currentEvents = [];
    }

    currentEvents.push(event);
    previousSequence = event.sequence;
  }

  if (currentEvents.length > 0) {
    ranges.push(createSequenceRange(streamId, currentEvents));
  }

  const firstSequence = events[0]?.sequence ?? null;
  const lastSequence = events.at(-1)?.sequence ?? null;
  const fingerprint = createFingerprint({
    kind: "event-compaction.stream-sequence-plan",
    eventCount: events.length,
    firstSequence,
    gaps,
    lastSequence,
    ranges,
    streamId,
  });

  return {
    streamId,
    eventCount: events.length,
    firstSequence,
    lastSequence,
    ranges,
    gaps,
    fingerprint,
  };
}

function createSequenceRange(
  streamId: string,
  events: readonly EventEnvelope[],
): SequenceRange {
  const eventIds = events.map((event) => event.eventId);
  const fromSequence = events[0].sequence;
  const toSequence = events.at(-1)?.sequence ?? fromSequence;
  const payload = {
    eventCount: events.length,
    eventFingerprints: events.map(fingerprintEventEnvelope),
    eventIds,
    fromSequence,
    streamId,
    toSequence,
  };

  return {
    streamId,
    fromSequence,
    toSequence,
    eventCount: events.length,
    eventIds,
    fingerprint: createFingerprint({
      kind: "event-compaction.sequence-range",
      range: payload,
    }),
  };
}

function verifyCheckpointReplay(
  checkpoint: CheckpointSnapshotDescriptor,
  selectedStreamId: string | null,
  events: readonly EventEnvelope[],
  options: ReplayVerificationOptions,
  issues: ReplayVerificationIssue[],
): ReplayCheckpointVerification {
  if (selectedStreamId !== null && checkpoint.streamId !== selectedStreamId) {
    issues.push({
      code: "checkpoint_stream_mismatch",
      message: "checkpoint stream does not match replay stream",
      details: {
        checkpointStreamId: checkpoint.streamId,
        replayStreamId: selectedStreamId,
      },
    });
  }

  const eventsThroughCheckpoint = events.filter((event) => event.sequence <= checkpoint.sequence);
  const lastSequence = eventsThroughCheckpoint.at(-1)?.sequence ?? null;
  if (lastSequence !== checkpoint.sequence) {
    issues.push({
      code: "checkpoint_sequence_mismatch",
      message: "checkpoint sequence is not covered by replay events",
      details: {
        checkpointSequence: checkpoint.sequence,
        lastReplaySequence: lastSequence,
      },
    });
  }

  const replaySourceEventIds = eventsThroughCheckpoint.map((event) => event.eventId);
  const sourceEventIdsMatch = arraysEqual(replaySourceEventIds, checkpoint.sourceEventIds);
  if (!sourceEventIdsMatch) {
    issues.push({
      code: "checkpoint_source_events_mismatch",
      message: "checkpoint source events do not match replay events",
      details: {
        checkpointEventIds: checkpoint.sourceEventIds,
        replayEventIds: replaySourceEventIds,
      },
    });
  }

  const expectedStateFingerprint = options.expectedStateFingerprint;
  const stateFingerprintMatch = expectedStateFingerprint === undefined
    ? null
    : checkpoint.stateFingerprint === expectedStateFingerprint;
  if (stateFingerprintMatch === false) {
    issues.push({
      code: "checkpoint_state_fingerprint_mismatch",
      message: "checkpoint state fingerprint does not match expected replay state",
      details: {
        checkpointStateFingerprint: checkpoint.stateFingerprint,
        expectedStateFingerprint,
      },
    });
  }

  return {
    checkpointId: checkpoint.checkpointId,
    streamId: checkpoint.streamId,
    sequence: checkpoint.sequence,
    stateFingerprint: checkpoint.stateFingerprint,
    sourceEventCount: checkpoint.sourceEventCount,
    sourceEventIdsMatch,
    stateFingerprintMatch,
  };
}

function collectCandidateRanges(
  events: readonly EventEnvelope[],
  sequencePlan: SequenceRangePlan,
  compactThroughSequence: number,
  minimumEventsPerCheckpoint: number,
): readonly CandidateCompactionRange[] {
  const byEventId = new Map(events.map((event) => [event.eventId, event]));
  return sequencePlan.streams.flatMap((stream) => stream.ranges)
    .filter((range) => (
      range.toSequence <= compactThroughSequence &&
      range.eventCount >= minimumEventsPerCheckpoint
    ))
    .map((range) => ({
      range,
      events: range.eventIds.map((eventId) => {
        const event = byEventId.get(eventId);
        if (event === undefined) {
          throw new CompactionPlanError("sequence range references an unknown event", {
            details: { eventId },
          });
        }
        return event;
      }),
    }));
}

function readCheckpointSnapshotDescriptor(
  value: CheckpointSnapshotDescriptor,
): CheckpointSnapshotDescriptor {
  if (!isPlainRecord(value)) {
    throw new CheckpointSnapshotError("checkpoint descriptor must be a plain object", {
      details: { path: "checkpoint" },
    });
  }

  if (value.kind !== "event-compaction.checkpoint-snapshot") {
    throw new CheckpointSnapshotError("checkpoint descriptor kind is invalid", {
      details: { kind: value.kind },
    });
  }

  const descriptor: CheckpointSnapshotDescriptor = {
    kind: "event-compaction.checkpoint-snapshot",
    version: readPositiveInteger(value.version, "checkpoint.version", checkpointError),
    checkpointId: requireCleanString(value.checkpointId, "checkpoint.checkpointId", checkpointError),
    streamId: requireCleanString(value.streamId, "checkpoint.streamId", checkpointError),
    sequence: readNonNegativeInteger(value.sequence, "checkpoint.sequence", checkpointError),
    createdAt: readTimestamp(value.createdAt, "checkpoint.createdAt", checkpointError),
    stateFingerprint: requireCleanString(
      value.stateFingerprint,
      "checkpoint.stateFingerprint",
      checkpointError,
    ),
    sourceEventCount: readNonNegativeInteger(
      value.sourceEventCount,
      "checkpoint.sourceEventCount",
      checkpointError,
    ),
    sourceEventIds: readSourceEventIds(value.sourceEventIds, "checkpoint.sourceEventIds"),
    fingerprint: requireCleanString(value.fingerprint, "checkpoint.fingerprint", checkpointError),
  };
  if (value.metadata !== undefined) {
    descriptor.metadata = readJsonObject(value.metadata, "checkpoint.metadata", checkpointError);
  }
  if (descriptor.sourceEventCount !== descriptor.sourceEventIds.length) {
    throw new CheckpointSnapshotError("checkpoint source event count must match sourceEventIds", {
      details: {
        sourceEventCount: descriptor.sourceEventCount,
        sourceEventIdsLength: descriptor.sourceEventIds.length,
      },
    });
  }

  return readOnlyClone(descriptor);
}

function readSourceEventIds(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new CheckpointSnapshotError("checkpoint sourceEventIds must be an array", {
      details: { path },
    });
  }

  const ids = value.map((item, index) => (
    requireCleanString(item, `${path}.${index}`, checkpointError)
  ));
  const unique = new Set<string>();
  for (const id of ids) {
    if (unique.has(id)) {
      throw new CheckpointSnapshotError("checkpoint sourceEventIds must be unique", {
        details: { eventId: id, path },
      });
    }
    unique.add(id);
  }
  return ids;
}

function createCheckpointId(
  streamId: string,
  sequence: number,
  stateFingerprint: string,
  sourceEventIds: readonly string[],
  metadata: JsonObject | undefined,
): string {
  return `chk_${createFingerprint({
    kind: "event-compaction.checkpoint-id",
    metadata,
    sequence,
    sourceEventIds,
    stateFingerprint,
    streamId,
  }).slice("fnv1a64:".length)}`;
}

function fingerprintEvents(events: readonly EventEnvelope[]): string {
  return createFingerprint({
    kind: "event-compaction.event-set",
    events: events.map((event) => ({
      eventId: event.eventId,
      fingerprint: fingerprintEventEnvelope(event),
      sequence: event.sequence,
      streamId: event.streamId,
    })),
  });
}

function createFingerprint(value: unknown): string {
  const serialized = serializeDeterministicJson(value);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;

  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= BigInt(serialized.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }

  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

function stringifyStable(value: unknown, path: string, seen: WeakSet<object>): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw serializationError("numbers must be finite", path);
    }
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw serializationError("values must not contain circular references", path);
    }
    seen.add(value);
    const serialized = `[${value
      .map((item, index) => stringifyStable(item, formatArrayPath(path, index), seen))
      .join(",")}]`;
    seen.delete(value);
    return serialized;
  }

  if (isRecord(value)) {
    if (!isPlainRecord(value)) {
      throw serializationError("objects must be plain records", path);
    }

    if (seen.has(value)) {
      throw serializationError("values must not contain circular references", path);
    }
    seen.add(value);

    const entries = Object.entries(value)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => compareStrings(left, right))
      .map(([key, nested]) => {
        const nestedPath = path.length === 0 ? key : `${path}.${key}`;
        return `${JSON.stringify(key)}:${stringifyStable(nested, nestedPath, seen)}`;
      });

    seen.delete(value);
    return `{${entries.join(",")}}`;
  }

  throw serializationError("value must be JSON-compatible", path);
}

function readJsonObject(
  value: unknown,
  path: string,
  createError: ErrorFactory,
): JsonObject {
  if (!isPlainRecord(value)) {
    throw createError("value must be a plain JSON object", { path });
  }

  try {
    return readOnlyClone(value) as JsonObject;
  } catch (cause) {
    if (cause instanceof EventCompactionError) {
      throw cause;
    }
    throw createError("value must be JSON-compatible", { cause, path });
  }
}

function readTimestamp(
  value: unknown,
  path: string,
  createError: ErrorFactory,
): string {
  const timestamp = requireCleanString(value, path, createError);
  if (!Number.isFinite(Date.parse(timestamp))) {
    throw createError("value must be an ISO-compatible timestamp", { path, value });
  }
  return timestamp;
}

function readPositiveInteger(
  value: unknown,
  path: string,
  createError: ErrorFactory,
): number {
  const parsed = readInteger(value, path, createError);
  if (parsed <= 0) {
    throw createError("value must be greater than zero", { path, value });
  }
  return parsed;
}

function readNonNegativeInteger(
  value: unknown,
  path: string,
  createError: ErrorFactory,
): number {
  const parsed = readInteger(value, path, createError);
  if (parsed < 0) {
    throw createError("value must be zero or greater", { path, value });
  }
  return parsed;
}

function readInteger(value: unknown, path: string, createError: ErrorFactory): number {
  if (!Number.isSafeInteger(value)) {
    throw createError("value must be a safe integer", { path, value });
  }
  return value as number;
}

function requireCleanString(
  value: unknown,
  path: string,
  createError: ErrorFactory,
): string {
  if (typeof value !== "string" || value.trim().length === 0 || value !== value.trim()) {
    throw createError(
      "value must be a non-empty string without surrounding whitespace",
      { path, value },
    );
  }
  return value;
}

function readOnlyClone<T>(value: T): DeepReadonly<T> {
  try {
    return deepFreeze(structuredClone(value)) as DeepReadonly<T>;
  } catch (cause) {
    if (cause instanceof EventCompactionError) {
      throw cause;
    }
    throw serializationError("value must be structured-cloneable", "", cause);
  }
}

function deepFreeze<T>(value: T): T {
  if (!isRecord(value) && !Array.isArray(value)) {
    return value;
  }

  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }

  return Object.freeze(value);
}

function serializationError(
  message: string,
  path: string,
  cause?: unknown,
): EventCompactionError {
  return new EventCompactionError(
    EVENT_COMPACTION_ERROR_CODES.SERIALIZATION_INVALID,
    message,
    { cause, details: { path } },
  );
}

type ErrorFactory = (
  message: string,
  details?: Readonly<Record<string, unknown>>,
) => EventCompactionError;

function eventEnvelopeError(
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): EventEnvelopeValidationError {
  return new EventEnvelopeValidationError(message, { details });
}

function sequenceRangeError(
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): SequenceRangePlanError {
  return new SequenceRangePlanError(message, { details });
}

function checkpointError(
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): CheckpointSnapshotError {
  return new CheckpointSnapshotError(message, { details });
}

function replayVerificationError(
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): ReplayVerificationError {
  return new ReplayVerificationError(message, { details });
}

function compactionPlanError(
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): CompactionPlanError {
  return new CompactionPlanError(message, { details });
}

function formatArrayPath(path: string, index: number): string {
  return path.length === 0 ? String(index) : `${path}.${index}`;
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function compareEvents(left: EventEnvelope, right: EventEnvelope): number {
  return (
    compareStrings(left.streamId, right.streamId) ||
    left.sequence - right.sequence ||
    compareStrings(left.eventId, right.eventId)
  );
}

function compareRetainedEvents(left: RetainedEventDescriptor, right: RetainedEventDescriptor): number {
  return (
    compareStrings(left.streamId, right.streamId) ||
    left.sequence - right.sequence ||
    compareStrings(left.eventId, right.eventId)
  );
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
