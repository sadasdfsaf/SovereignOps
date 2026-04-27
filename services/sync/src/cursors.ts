export interface ParsedSyncCursor {
  position: number;
  eventId: string;
}

export type SyncCursorInput = string | ParsedSyncCursor;

export const CURSOR_VERSION = "cur_v1";
export const INITIAL_CURSOR = "cur_v1:0000000000000000:origin";

const CURSOR_PATTERN = /^cur_v1:([0-9]{16}):(origin|evt_[A-Za-z0-9_-]{1,88})$/;
const EVENT_ID_PATTERN = /^evt_[A-Za-z0-9_-]{1,88}$/;

export function parseCursor(cursor: string): ParsedSyncCursor {
  const match = CURSOR_PATTERN.exec(cursor);
  if (!match) {
    throw new Error("cursor must use cur_v1:0000000000000000:event_id format");
  }

  const position = Number(match[1]);
  if (!Number.isSafeInteger(position)) {
    throw new Error("cursor position must be a safe integer");
  }

  return {
    position,
    eventId: match[2],
  };
}

export function formatCursor(cursor: ParsedSyncCursor): string {
  assertCursorPosition(cursor.position);
  assertCursorEventId(cursor.eventId);

  return `${CURSOR_VERSION}:${String(cursor.position).padStart(16, "0")}:${cursor.eventId}`;
}

export function compareCursors(left: SyncCursorInput, right: SyncCursorInput): number {
  const parsedLeft = normalizeCursor(left);
  const parsedRight = normalizeCursor(right);

  if (parsedLeft.position !== parsedRight.position) {
    return parsedLeft.position < parsedRight.position ? -1 : 1;
  }

  return parsedLeft.eventId.localeCompare(parsedRight.eventId);
}

export function advanceCursor(cursor: string, acceptedEventIds: readonly string[]): string {
  const parsed = parseCursor(cursor);
  if (acceptedEventIds.length === 0) {
    return formatCursor(parsed);
  }

  const seen = new Set<string>();
  for (const eventId of acceptedEventIds) {
    assertAcceptedEventId(eventId);
    if (seen.has(eventId)) {
      throw new Error(`accepted event id appears more than once: ${eventId}`);
    }
    seen.add(eventId);
  }

  const nextPosition = parsed.position + acceptedEventIds.length;
  assertCursorPosition(nextPosition);

  return formatCursor({
    position: nextPosition,
    eventId: acceptedEventIds[acceptedEventIds.length - 1],
  });
}

export function isCursor(value: unknown): value is string {
  return typeof value === "string" && CURSOR_PATTERN.test(value);
}

export function isEventId(value: unknown): value is `evt_${string}` {
  return typeof value === "string" && EVENT_ID_PATTERN.test(value);
}

function normalizeCursor(cursor: SyncCursorInput): ParsedSyncCursor {
  return typeof cursor === "string" ? parseCursor(cursor) : parseCursor(formatCursor(cursor));
}

function assertCursorPosition(position: number): void {
  if (!Number.isSafeInteger(position) || position < 0) {
    throw new Error("cursor position must be a non-negative safe integer");
  }
}

function assertCursorEventId(eventId: string): void {
  if (eventId !== "origin" && !EVENT_ID_PATTERN.test(eventId)) {
    throw new Error("cursor eventId must be origin or an evt_ id");
  }
}

function assertAcceptedEventId(eventId: string): void {
  if (!EVENT_ID_PATTERN.test(eventId)) {
    throw new Error("accepted event ids must use the evt_ id prefix");
  }
}
