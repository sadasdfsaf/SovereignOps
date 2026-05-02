import type { SyncedEventEnvelope } from "./bundles.ts";
import {
  CURSOR_VERSION,
  INITIAL_CURSOR,
  compareCursors,
  compareStableText,
  formatCursor,
  parseCursor,
} from "./cursors.ts";

export type ReplayIntegrityIssueCode =
  | "duplicate_cursor"
  | "duplicate_event"
  | "gap"
  | "invalid_cursor"
  | "stale_cursor";

export type ReplayIntegritySeverity = "blocking" | "warning";
export type ReplayIntegrityStatus = "ok" | "blocked" | "degraded";

export interface ReplayCursorWindowRequest {
  workspaceId: `wsp_${string}`;
  afterCursor?: string;
  untilCursor?: string;
  limit?: number;
}

export interface ReplayIntegrityIssue {
  code: ReplayIntegrityIssueCode;
  severity: ReplayIntegritySeverity;
  message: string;
  eventId?: `evt_${string}`;
  cursor?: string;
  previousCursor?: string;
  expectedCursor?: string;
  expectedPosition?: number;
  actualPosition?: number;
}

export interface ReplayIntegritySummary {
  status: ReplayIntegrityStatus;
  issueCount: number;
  blockingCount: number;
  warningCount: number;
  codes: ReplayIntegrityIssueCode[];
}

export interface ReplayWindow {
  workspaceId: `wsp_${string}`;
  afterCursor: string;
  untilCursor?: string;
  nextCursor: string;
  events: SyncedEventEnvelope[];
  hasMore: boolean;
  integrity: ReplayIntegritySummary;
  issues: ReplayIntegrityIssue[];
  audit: ReplayAuditSummary;
}

export interface ReplayAuditEventRef {
  eventId: string;
  cursor: string;
  deviceId: string;
  sequence: number;
  type: string;
}

export interface ReplayAuditIssue {
  code: ReplayIntegrityIssueCode;
  severity: ReplayIntegritySeverity;
  message: string;
  eventId?: string;
  cursor?: string;
  previousCursor?: string;
  expectedCursor?: string;
}

export interface ReplayAuditSummary {
  workspaceId: string;
  afterCursor: string;
  untilCursor?: string;
  nextCursor: string;
  eventCount: number;
  hasMore: boolean;
  integrity: ReplayIntegritySummary;
  events: ReplayAuditEventRef[];
  issues: ReplayAuditIssue[];
}

export interface ReplayIntegrityOptions {
  workspaceId?: `wsp_${string}`;
  afterCursor?: string;
}

const MAX_REPLAY_LIMIT = 500;
const WORKSPACE_ID_PATTERN = /^wsp_[A-Za-z0-9_-]{1,88}$/;

export function replayAcceptedEvents(
  events: readonly SyncedEventEnvelope[],
  request: ReplayCursorWindowRequest,
): ReplayWindow {
  const normalizedRequest = normalizeReplayRequest(request);
  const workspaceEvents = orderReplayEvents(events).filter(
    (event) => event.workspaceId === normalizedRequest.workspaceId,
  );
  const orderedEvents = workspaceEvents.filter((event) =>
    isInReplayWindow(event, normalizedRequest),
  );

  const selectedEvents = orderedEvents
    .slice(0, normalizedRequest.limit)
    .map(cloneSyncedEvent);
  const nextCursor =
    selectedEvents.length > 0
      ? selectedEvents[selectedEvents.length - 1].cursor
      : normalizedRequest.afterCursor;
  const issues = [
    ...detectReplayIntegrityIssues(orderedEvents, {
      workspaceId: normalizedRequest.workspaceId,
      afterCursor: normalizedRequest.afterCursor,
    }),
    ...detectReplayIntegrityIssues(
      workspaceEvents.filter((event) => !tryParseCursor(event.cursor)),
      {
        workspaceId: normalizedRequest.workspaceId,
        afterCursor: normalizedRequest.afterCursor,
      },
    ),
  ];
  const integrity = classifyReplayIntegrityIssues(issues);
  const window = {
    workspaceId: normalizedRequest.workspaceId,
    afterCursor: normalizedRequest.afterCursor,
    untilCursor: normalizedRequest.untilCursor,
    nextCursor,
    events: selectedEvents,
    hasMore: orderedEvents.length > selectedEvents.length,
    integrity,
    issues,
  };

  return {
    ...window,
    audit: createReplayAuditSummary(window),
  };
}

export function detectReplayIntegrityIssues(
  events: readonly SyncedEventEnvelope[],
  options: ReplayIntegrityOptions = {},
): ReplayIntegrityIssue[] {
  const afterCursor = options.afterCursor ?? INITIAL_CURSOR;
  const baseline = parseCursor(afterCursor);
  const orderedEvents = orderReplayEvents(
    options.workspaceId === undefined
      ? events
      : events.filter((event) => event.workspaceId === options.workspaceId),
  );

  const issues: ReplayIntegrityIssue[] = [];
  const seenEventIds = new Map<string, SyncedEventEnvelope>();
  const seenCursorPositions = new Map<number, SyncedEventEnvelope>();
  let expectedPosition = baseline.position + 1;

  for (const event of orderedEvents) {
    const parsedCursor = parseEventCursor(event, issues);
    if (!parsedCursor) {
      continue;
    }

    const previousEvent = seenEventIds.get(event.id);
    if (previousEvent) {
      issues.push({
        code: "duplicate_event",
        severity: "blocking",
        message: "event id appears more than once in the replay stream",
        eventId: event.id,
        cursor: event.cursor,
        previousCursor: previousEvent.cursor,
      });
    } else {
      seenEventIds.set(event.id, event);
    }

    const previousCursorEvent = seenCursorPositions.get(parsedCursor.position);
    if (previousCursorEvent) {
      issues.push({
        code: "duplicate_cursor",
        severity: "blocking",
        message: "cursor position appears more than once in the replay stream",
        eventId: event.id,
        cursor: event.cursor,
        previousCursor: previousCursorEvent.cursor,
        actualPosition: parsedCursor.position,
      });
      continue;
    }
    seenCursorPositions.set(parsedCursor.position, event);

    if (parsedCursor.position <= baseline.position) {
      issues.push({
        code: "stale_cursor",
        severity: "blocking",
        message: "event cursor is not newer than the replay baseline",
        eventId: event.id,
        cursor: event.cursor,
        expectedCursor: formatCursor({
          position: expectedPosition,
          eventId: event.id,
        }),
        expectedPosition,
        actualPosition: parsedCursor.position,
      });
      continue;
    }

    if (parsedCursor.position > expectedPosition) {
      issues.push({
        code: "gap",
        severity: "blocking",
        message: "replay stream is missing one or more cursor positions",
        eventId: event.id,
        cursor: event.cursor,
        expectedCursor: formatCursor({
          position: expectedPosition,
          eventId: event.id,
        }),
        expectedPosition,
        actualPosition: parsedCursor.position,
      });
    }

    expectedPosition = parsedCursor.position + 1;
  }

  return issues;
}

export function classifyReplayIntegrityIssue(
  issue: ReplayIntegrityIssue,
): ReplayIntegritySeverity {
  return issue.severity;
}

export function classifyReplayIntegrityIssues(
  issues: readonly ReplayIntegrityIssue[],
): ReplayIntegritySummary {
  const blockingCount = issues.filter(
    (issue) => classifyReplayIntegrityIssue(issue) === "blocking",
  ).length;
  const warningCount = issues.length - blockingCount;
  const codes = [...new Set(issues.map((issue) => issue.code))].sort();

  return {
    status: blockingCount > 0 ? "blocked" : warningCount > 0 ? "degraded" : "ok",
    issueCount: issues.length,
    blockingCount,
    warningCount,
    codes,
  };
}

export function createReplayAuditSummary(input: {
  workspaceId: `wsp_${string}`;
  afterCursor: string;
  untilCursor?: string;
  nextCursor: string;
  events: readonly SyncedEventEnvelope[];
  hasMore: boolean;
  integrity?: ReplayIntegritySummary;
  issues?: readonly ReplayIntegrityIssue[];
}): ReplayAuditSummary {
  const issues = input.issues ?? [];

  return {
    workspaceId: redactIdentifier(input.workspaceId),
    afterCursor: redactCursor(input.afterCursor),
    untilCursor:
      input.untilCursor === undefined ? undefined : redactCursor(input.untilCursor),
    nextCursor: redactCursor(input.nextCursor),
    eventCount: input.events.length,
    hasMore: input.hasMore,
    integrity: input.integrity ?? classifyReplayIntegrityIssues(issues),
    events: input.events.map((event) => ({
      eventId: redactIdentifier(event.id),
      cursor: redactCursor(event.cursor),
      deviceId: redactIdentifier(event.deviceId),
      sequence: event.sequence,
      type: event.type,
    })),
    issues: issues.map((issue) => ({
      code: issue.code,
      severity: issue.severity,
      message: issue.message,
      eventId: issue.eventId === undefined ? undefined : redactIdentifier(issue.eventId),
      cursor: issue.cursor === undefined ? undefined : redactCursor(issue.cursor),
      previousCursor:
        issue.previousCursor === undefined ? undefined : redactCursor(issue.previousCursor),
      expectedCursor:
        issue.expectedCursor === undefined ? undefined : redactCursor(issue.expectedCursor),
    })),
  };
}

function normalizeReplayRequest(request: ReplayCursorWindowRequest): Required<
  Omit<ReplayCursorWindowRequest, "untilCursor">
> &
  Pick<ReplayCursorWindowRequest, "untilCursor"> {
  if (typeof request.workspaceId !== "string" || !WORKSPACE_ID_PATTERN.test(request.workspaceId)) {
    throw new Error("workspaceId must use the wsp_ id prefix");
  }

  const afterCursor = request.afterCursor ?? INITIAL_CURSOR;
  parseCursor(afterCursor);

  if (request.untilCursor !== undefined && compareCursors(request.untilCursor, afterCursor) < 0) {
    throw new Error("untilCursor must be greater than or equal to afterCursor");
  }

  const limit = request.limit ?? MAX_REPLAY_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_REPLAY_LIMIT) {
    throw new Error(`limit must be an integer from 1 through ${MAX_REPLAY_LIMIT}`);
  }

  return {
    workspaceId: request.workspaceId,
    afterCursor,
    untilCursor: request.untilCursor,
    limit,
  };
}

function parseEventCursor(
  event: SyncedEventEnvelope,
  issues: ReplayIntegrityIssue[],
): ReturnType<typeof parseCursor> | undefined {
  try {
    return parseCursor(event.cursor);
  } catch {
    issues.push({
      code: "invalid_cursor",
      severity: "blocking",
      message: "event cursor is not parseable",
      eventId: event.id,
      cursor: event.cursor,
    });
    return undefined;
  }
}

function orderReplayEvents(events: readonly SyncedEventEnvelope[]): SyncedEventEnvelope[] {
  return [...events].sort(compareReplayEvents);
}

function compareReplayEvents(
  left: SyncedEventEnvelope,
  right: SyncedEventEnvelope,
): number {
  const leftCursor = tryParseCursor(left.cursor);
  const rightCursor = tryParseCursor(right.cursor);

  if (leftCursor && rightCursor) {
    return (
      (leftCursor.position === rightCursor.position
        ? compareStableText(leftCursor.eventId, rightCursor.eventId)
        : leftCursor.position - rightCursor.position) ||
      left.sequence - right.sequence ||
      compareStableText(left.id, right.id)
    );
  }

  if (leftCursor) {
    return -1;
  }
  if (rightCursor) {
    return 1;
  }

  return left.sequence - right.sequence || compareStableText(left.id, right.id);
}

function cloneSyncedEvent(event: SyncedEventEnvelope): SyncedEventEnvelope {
  return {
    ...event,
    payload: JSON.parse(JSON.stringify(event.payload)),
  };
}

function redactCursor(cursor: string): string {
  try {
    const parsed = parseCursor(cursor);
    return `${CURSOR_VERSION}:${String(parsed.position).padStart(16, "0")}:${
      parsed.eventId === "origin" ? "origin" : redactIdentifier(parsed.eventId)
    }`;
  } catch {
    return redactIdentifier(cursor);
  }
}

function isInReplayWindow(
  event: SyncedEventEnvelope,
  request: ReturnType<typeof normalizeReplayRequest>,
): boolean {
  if (!tryParseCursor(event.cursor)) {
    return false;
  }

  return (
    compareCursors(event.cursor, request.afterCursor) > 0 &&
    (request.untilCursor === undefined || compareCursors(event.cursor, request.untilCursor) <= 0)
  );
}

function tryParseCursor(cursor: string): ReturnType<typeof parseCursor> | undefined {
  try {
    return parseCursor(cursor);
  } catch {
    return undefined;
  }
}

function redactIdentifier(value: string): string {
  if (value === "origin") {
    return value;
  }
  if (value.length <= 8) {
    return `${value.slice(0, 3)}...`;
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
