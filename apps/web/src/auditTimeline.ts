import type { WorkspaceId } from "./localStore.ts";

export interface AuditTimelineRecord {
  id: string;
  workspaceId: WorkspaceId;
  actionId: string;
  actor: string;
  status: string;
  timestamp: string;
  title?: string;
  details?: string;
}

export interface AuditTimelineFilters {
  workspaceId?: WorkspaceId;
  actionId?: string;
  status?: string | readonly string[];
  actor?: string | readonly string[];
}

export interface AuditTimelineDayGroup {
  day: string;
  records: AuditTimelineRecord[];
}

export type AuditTimelineDirection = "asc" | "desc";
export type AuditTimelineCursor = string;

export interface AuditTimelinePageOptions {
  cursor?: AuditTimelineCursor;
  direction?: AuditTimelineDirection;
  filters?: AuditTimelineFilters;
  limit?: number;
}

export interface AuditTimelinePage {
  records: AuditTimelineRecord[];
  nextCursor?: AuditTimelineCursor;
  hasMore: boolean;
  limit: number;
  direction: AuditTimelineDirection;
}

export interface AuditTimelineCursorParts {
  timestamp: string;
  id: string;
}

export function filterAuditTimelineRecords(
  records: readonly AuditTimelineRecord[],
  filters: AuditTimelineFilters = {},
): AuditTimelineRecord[] {
  return records.filter((record) => matchesFilters(record, filters)).map(cloneRecord);
}

export function groupAuditRecordsByDay(
  records: readonly AuditTimelineRecord[],
  direction: AuditTimelineDirection = "asc",
): AuditTimelineDayGroup[] {
  const groups = new Map<string, AuditTimelineRecord[]>();

  for (const record of sortAuditTimelineRecords(records, direction)) {
    const day = toIsoDay(record.timestamp);
    const group = groups.get(day);
    if (group) {
      group.push(cloneRecord(record));
    } else {
      groups.set(day, [cloneRecord(record)]);
    }
  }

  return [...groups.entries()].map(([day, groupRecords]) => ({
    day,
    records: groupRecords,
  }));
}

export function pageAuditTimelineRecords(
  records: readonly AuditTimelineRecord[],
  options: AuditTimelinePageOptions = {},
): AuditTimelinePage {
  const direction = options.direction ?? "asc";
  const limit = normalizeLimit(options.limit);
  const sorted = sortAuditTimelineRecords(
    filterAuditTimelineRecords(records, options.filters),
    direction,
  );
  const cursor = options.cursor ? decodeCursor(options.cursor) : undefined;
  const afterCursor = cursor
    ? sorted.filter((record) => isAfterCursor(record, cursor, direction))
    : sorted;
  const pageRecords = afterCursor.slice(0, limit);
  const hasMore = afterCursor.length > limit;

  return {
    records: pageRecords.map(cloneRecord),
    nextCursor: hasMore
      ? encodeAuditTimelineCursor(pageRecords[pageRecords.length - 1])
      : undefined,
    hasMore,
    limit,
    direction,
  };
}

export function sortAuditTimelineRecords(
  records: readonly AuditTimelineRecord[],
  direction: AuditTimelineDirection = "asc",
): AuditTimelineRecord[] {
  const multiplier = direction === "asc" ? 1 : -1;
  return records
    .slice()
    .sort((left, right) => multiplier * compareRecordsChronologically(left, right))
    .map(cloneRecord);
}

export function encodeAuditTimelineCursor(
  record: Pick<AuditTimelineRecord, "id" | "timestamp">,
): AuditTimelineCursor {
  assertTimestamp(record.timestamp, "timestamp");
  return `${encodeURIComponent(record.timestamp)}:${encodeURIComponent(record.id)}`;
}

export function decodeAuditTimelineCursor(
  cursor: AuditTimelineCursor,
): AuditTimelineCursorParts {
  return decodeCursor(cursor);
}

function matchesFilters(
  record: AuditTimelineRecord,
  filters: AuditTimelineFilters,
): boolean {
  return (
    (filters.workspaceId === undefined ||
      record.workspaceId === filters.workspaceId) &&
    (filters.actionId === undefined || record.actionId === filters.actionId) &&
    matchesOneOrMany(record.status, filters.status) &&
    matchesOneOrMany(record.actor, filters.actor)
  );
}

function matchesOneOrMany(
  value: string,
  filter: string | readonly string[] | undefined,
): boolean {
  if (filter === undefined) {
    return true;
  }
  return Array.isArray(filter) ? filter.includes(value) : value === filter;
}

function isAfterCursor(
  record: AuditTimelineRecord,
  cursor: AuditTimelineCursorParts,
  direction: AuditTimelineDirection,
): boolean {
  const cursorRecord: AuditTimelineRecord = {
    id: cursor.id,
    workspaceId: "wsp_cursor",
    actionId: "cursor",
    actor: "cursor",
    status: "cursor",
    timestamp: cursor.timestamp,
  };
  const comparison = compareRecordsChronologically(record, cursorRecord);
  return direction === "asc" ? comparison > 0 : comparison < 0;
}

function compareRecordsChronologically(
  left: Pick<AuditTimelineRecord, "id" | "timestamp">,
  right: Pick<AuditTimelineRecord, "id" | "timestamp">,
): number {
  return (
    compareTimestamps(left.timestamp, right.timestamp) ||
    left.id.localeCompare(right.id)
  );
}

function decodeCursor(cursor: AuditTimelineCursor): AuditTimelineCursorParts {
  const separator = cursor.lastIndexOf(":");
  if (separator <= 0 || separator === cursor.length - 1) {
    throw new Error("audit cursor is invalid");
  }

  const timestamp = decodeURIComponent(cursor.slice(0, separator));
  const id = decodeURIComponent(cursor.slice(separator + 1));
  assertTimestamp(timestamp, "cursor timestamp");

  return { timestamp, id };
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return 50;
  }
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("limit must be a positive integer");
  }
  return limit;
}

function toIsoDay(timestamp: string): string {
  assertTimestamp(timestamp, "timestamp");
  return new Date(timestamp).toISOString().slice(0, 10);
}

function cloneRecord(record: AuditTimelineRecord): AuditTimelineRecord {
  return { ...record };
}

function assertTimestamp(value: string, name: string): void {
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${name} must be a valid timestamp`);
  }
}

function compareTimestamps(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
    throw new Error("timestamps must be valid");
  }

  return leftTime - rightTime || left.localeCompare(right);
}
