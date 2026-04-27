import {
  createUploadBatch,
  type JsonValue,
  type LocalFirstEventEnvelope,
  type SyncUploadBatch,
  type SyncUploadReceipt,
  type SyncedEventEnvelope,
  type ValidationIssue,
} from "./bundles.ts";
import { CURSOR_VERSION, INITIAL_CURSOR, compareCursors, parseCursor } from "./cursors.ts";
import {
  createEventReplayCatalog,
  validateEventReplayCatalog,
  type EventReplayCatalog,
  type EventReplayCatalogSummary,
} from "./eventCatalog.ts";
import type {
  SyncBundleRepository,
  SyncRepositoryError,
  SyncRepositorySnapshot,
} from "./repository.ts";

export type CatalogImportStatus = "ready" | "blocked";

export type CatalogImportReconciliationIssueCode =
  | "stale_cursor"
  | "future_cursor"
  | "duplicate_event";

export type CatalogImportErrorCode =
  | "validation_failed"
  | CatalogImportReconciliationIssueCode
  | SyncRepositoryError["code"];

export type CatalogImportResult<TValue> =
  | { ok: true; value: TValue }
  | { ok: false; error: CatalogImportError };

export interface CatalogImportReconciliationIssue {
  code: CatalogImportReconciliationIssueCode;
  message: string;
  eventId?: `evt_${string}`;
  baseCursor?: string;
  remoteCursor?: string;
}

export interface CatalogImportReconciliationSummaryIssue {
  code: CatalogImportReconciliationIssueCode;
  message: string;
  eventId?: string;
  baseCursor?: string;
  remoteCursor?: string;
}

export interface CatalogImportReconciliationSummary {
  status: CatalogImportStatus;
  issueCount: number;
  codes: CatalogImportReconciliationIssueCode[];
  baseCursor: string;
  latestCursor: string;
  duplicateEventCount: number;
  issues: CatalogImportReconciliationSummaryIssue[];
}

export interface CatalogImportReconciliation {
  status: CatalogImportStatus;
  baseCursor: string;
  latestCursor: string;
  duplicateEventIds: `evt_${string}`[];
  issues: CatalogImportReconciliationIssue[];
  summary: CatalogImportReconciliationSummary;
}

export interface CatalogImportPlanEventSummary {
  eventId: string;
  cursor: string;
  deviceId: string;
  sequence: number;
  type: string;
  payloadDigest?: string;
  redacted: boolean;
  redactedFieldCount: number;
}

export interface CatalogImportPlanSummary {
  status: "ready";
  workspaceId: string;
  deviceId: string;
  baseCursor: string;
  latestCursor: string;
  nextCursor: string;
  digest: `sha256:${string}`;
  checksum: string;
  eventCount: number;
  firstEventDigest?: string;
  lastEventDigest?: string;
  events: CatalogImportPlanEventSummary[];
  replay: EventReplayCatalogSummary;
  reconciliation: CatalogImportReconciliationSummary;
}

export interface CatalogImportPlan {
  catalog: EventReplayCatalog;
  uploadBatch: SyncUploadBatch;
  reconciliation: CatalogImportReconciliation;
  summary: CatalogImportPlanSummary;
}

export interface CatalogImportReceiptSummary {
  status: "imported";
  workspaceId: string;
  deviceId: string;
  baseCursor: string;
  nextCursor: string;
  digest: `sha256:${string}`;
  checksum: string;
  eventCount: number;
  events: CatalogImportPlanEventSummary[];
}

export interface CatalogImportReceipt {
  plan: CatalogImportPlan;
  receipt: SyncUploadReceipt;
  summary: CatalogImportReceiptSummary;
}

export interface CatalogImportError {
  code: CatalogImportErrorCode;
  message: string;
  validationIssues?: ValidationIssue[];
  eventId?: `evt_${string}`;
  baseCursor?: string;
  remoteCursor?: string;
  reconciliation?: CatalogImportReconciliationSummary;
  planSummary?: CatalogImportPlanSummary;
}

export function createCatalogImportPlan(
  repository: SyncBundleRepository,
  input: unknown,
): CatalogImportResult<CatalogImportPlan> {
  const catalogResult = createValidatedCatalog(input);
  if (!catalogResult.ok) {
    return catalogResult;
  }

  const catalog = catalogResult.value;
  const reconciliation = reconcileEventReplayCatalog(repository, catalog);
  if (reconciliation.status === "blocked") {
    const firstIssue = reconciliation.issues[0];
    return {
      ok: false,
      error: {
        code: firstIssue.code,
        message:
          reconciliation.issues.length === 1
            ? firstIssue.message
            : `catalog import reconciliation blocked by ${reconciliation.issues.length} issues`,
        eventId: firstIssue.eventId,
        baseCursor: firstIssue.baseCursor,
        remoteCursor: firstIssue.remoteCursor,
        reconciliation: reconciliation.summary,
      },
    };
  }

  const uploadBatch = createUploadBatch({
    workspaceId: catalog.workspaceId,
    deviceId: catalog.deviceId,
    baseCursor: catalog.baseCursor,
    events: toUploadEvents(catalog.events),
  });

  return {
    ok: true,
    value: {
      catalog,
      uploadBatch,
      reconciliation,
      summary: createCatalogImportPlanSummary(catalog, reconciliation, uploadBatch),
    },
  };
}

export function reconcileEventReplayCatalog(
  repository: SyncBundleRepository,
  catalog: EventReplayCatalog,
): CatalogImportReconciliation {
  const snapshot = repository.snapshot();
  const latestCursor = findLatestWorkspaceCursor(snapshot, catalog.workspaceId);
  const issues: CatalogImportReconciliationIssue[] = [];
  const cursorComparison = compareCursors(catalog.baseCursor, latestCursor);

  if (cursorComparison < 0) {
    issues.push({
      code: "stale_cursor",
      message: "catalog baseCursor is older than the latest accepted workspace cursor",
      baseCursor: catalog.baseCursor,
      remoteCursor: latestCursor,
    });
  } else if (cursorComparison > 0) {
    issues.push({
      code: "future_cursor",
      message: "catalog baseCursor is newer than the latest accepted workspace cursor",
      baseCursor: catalog.baseCursor,
      remoteCursor: latestCursor,
    });
  }

  const acceptedEvents = acceptedEventCursorsById(snapshot, catalog.workspaceId);
  for (const event of catalog.events) {
    const remoteCursor = acceptedEvents.get(event.id);
    if (remoteCursor !== undefined) {
      issues.push({
        code: "duplicate_event",
        message: "catalog event id has already been accepted for the workspace",
        eventId: event.id,
        remoteCursor,
      });
    }
  }

  const duplicateEventIds = issues
    .filter((issue): issue is CatalogImportReconciliationIssue & { eventId: `evt_${string}` } =>
      issue.code === "duplicate_event" && issue.eventId !== undefined,
    )
    .map((issue) => issue.eventId);
  const status: CatalogImportStatus = issues.length === 0 ? "ready" : "blocked";

  return {
    status,
    baseCursor: catalog.baseCursor,
    latestCursor,
    duplicateEventIds,
    issues,
    summary: createCatalogImportReconciliationSummary({
      status,
      baseCursor: catalog.baseCursor,
      latestCursor,
      duplicateEventIds,
      issues,
    }),
  };
}

export function importEventReplayCatalog(
  repository: SyncBundleRepository,
  input: unknown,
): CatalogImportResult<CatalogImportReceipt> {
  const planResult = createCatalogImportPlan(repository, input);
  if (!planResult.ok) {
    return planResult;
  }

  const receiptResult = repository.upload(planResult.value.uploadBatch);
  if (!receiptResult.ok) {
    return {
      ok: false,
      error: {
        ...toCatalogImportError(receiptResult.error),
        planSummary: planResult.value.summary,
      },
    };
  }

  const receipt = receiptResult.value;
  return {
    ok: true,
    value: {
      plan: planResult.value,
      receipt,
      summary: {
        status: "imported",
        workspaceId: redactIdentifier(receipt.workspaceId),
        deviceId: redactIdentifier(receipt.deviceId),
        baseCursor: redactCursor(receipt.baseCursor),
        nextCursor: redactCursor(receipt.nextCursor),
        digest: planResult.value.catalog.digest,
        checksum: planResult.value.uploadBatch.checksum,
        eventCount: receipt.events.length,
        events: planResult.value.summary.events,
      },
    },
  };
}

function createValidatedCatalog(input: unknown): CatalogImportResult<EventReplayCatalog> {
  const validation = validateEventReplayCatalog(input);
  if (!validation.ok || validation.value === undefined) {
    return {
      ok: false,
      error: {
        code: "validation_failed",
        message: "event replay catalog validation failed",
        validationIssues: validation.issues,
      },
    };
  }

  return {
    ok: true,
    value: createEventReplayCatalog(validation.value),
  };
}

function createCatalogImportPlanSummary(
  catalog: EventReplayCatalog,
  reconciliation: CatalogImportReconciliation,
  uploadBatch: SyncUploadBatch,
): CatalogImportPlanSummary {
  return {
    status: "ready",
    workspaceId: redactIdentifier(catalog.workspaceId),
    deviceId: redactIdentifier(catalog.deviceId),
    baseCursor: redactCursor(catalog.baseCursor),
    latestCursor: redactCursor(reconciliation.latestCursor),
    nextCursor: redactCursor(catalog.nextCursor),
    digest: catalog.digest,
    checksum: uploadBatch.checksum,
    eventCount: uploadBatch.events.length,
    firstEventDigest: catalog.firstEventDigest,
    lastEventDigest: catalog.lastEventDigest,
    events: createPlanEventSummaries(catalog),
    replay: catalog.summary,
    reconciliation: reconciliation.summary,
  };
}

function createCatalogImportReconciliationSummary(input: {
  status: CatalogImportStatus;
  baseCursor: string;
  latestCursor: string;
  duplicateEventIds: readonly `evt_${string}`[];
  issues: readonly CatalogImportReconciliationIssue[];
}): CatalogImportReconciliationSummary {
  return {
    status: input.status,
    issueCount: input.issues.length,
    codes: [...new Set(input.issues.map((issue) => issue.code))].sort(),
    baseCursor: redactCursor(input.baseCursor),
    latestCursor: redactCursor(input.latestCursor),
    duplicateEventCount: input.duplicateEventIds.length,
    issues: input.issues.map((issue) => ({
      code: issue.code,
      message: issue.message,
      eventId: issue.eventId === undefined ? undefined : redactIdentifier(issue.eventId),
      baseCursor: issue.baseCursor === undefined ? undefined : redactCursor(issue.baseCursor),
      remoteCursor: issue.remoteCursor === undefined ? undefined : redactCursor(issue.remoteCursor),
    })),
  };
}

function createPlanEventSummaries(
  catalog: EventReplayCatalog,
): CatalogImportPlanEventSummary[] {
  return catalog.summary.events.map((eventRef, index) => {
    const catalogEvent = catalog.events[index];
    const metadata = readCanonicalPayloadMetadata(catalogEvent);

    return {
      eventId: eventRef.eventId,
      cursor: eventRef.cursor,
      deviceId: eventRef.deviceId,
      sequence: eventRef.sequence,
      type: eventRef.type,
      payloadDigest: metadata.payloadDigest,
      redacted: metadata.redacted,
      redactedFieldCount: metadata.redactedFieldCount,
    };
  });
}

function readCanonicalPayloadMetadata(event: SyncedEventEnvelope): {
  payloadDigest?: string;
  redacted: boolean;
  redactedFieldCount: number;
} {
  const payload = isRecord(event.payload) ? event.payload : undefined;
  const redactionMetadata =
    payload !== undefined && isRecord(payload.redactionMetadata)
      ? payload.redactionMetadata
      : undefined;

  return {
    payloadDigest:
      payload !== undefined && typeof payload.payloadDigest === "string"
        ? payload.payloadDigest
        : undefined,
    redacted: redactionMetadata?.redacted === true,
    redactedFieldCount:
      redactionMetadata !== undefined &&
      Number.isInteger(redactionMetadata.redactedFieldCount)
        ? (redactionMetadata.redactedFieldCount as number)
        : 0,
  };
}

function toUploadEvents(events: readonly SyncedEventEnvelope[]): LocalFirstEventEnvelope[] {
  return events.map((event) => ({
    id: event.id,
    workspaceId: event.workspaceId,
    deviceId: event.deviceId,
    sequence: event.sequence,
    type: event.type,
    payload: cloneJson(event.payload),
    createdAt: event.createdAt,
  }));
}

function findLatestWorkspaceCursor(
  snapshot: SyncRepositorySnapshot,
  workspaceId: `wsp_${string}`,
): string {
  let latestCursor = INITIAL_CURSOR;
  for (const cursor of workspaceCursors(snapshot, workspaceId)) {
    if (compareCursors(cursor, latestCursor) > 0) {
      latestCursor = cursor;
    }
  }
  return latestCursor;
}

function workspaceCursors(
  snapshot: SyncRepositorySnapshot,
  workspaceId: `wsp_${string}`,
): string[] {
  return [
    ...snapshot.batches
      .filter((batch) => batch.workspaceId === workspaceId)
      .map((batch) => batch.nextCursor),
    ...snapshot.events
      .filter((event) => event.workspaceId === workspaceId)
      .map((event) => event.cursor),
  ];
}

function acceptedEventCursorsById(
  snapshot: SyncRepositorySnapshot,
  workspaceId: `wsp_${string}`,
): Map<`evt_${string}`, string> {
  return new Map(
    snapshot.events
      .filter((event) => event.workspaceId === workspaceId)
      .sort(compareAcceptedEvents)
      .map((event) => [event.id, event.cursor]),
  );
}

function compareAcceptedEvents(
  left: SyncedEventEnvelope,
  right: SyncedEventEnvelope,
): number {
  return compareCursors(left.cursor, right.cursor) || left.id.localeCompare(right.id);
}

function toCatalogImportError(error: SyncRepositoryError): CatalogImportError {
  return {
    code: error.code,
    message: error.message,
    validationIssues: error.issues,
    eventId: "eventId" in error ? error.eventId : undefined,
    baseCursor: "baseCursor" in error ? error.baseCursor : undefined,
    remoteCursor: "remoteCursor" in error ? error.remoteCursor : undefined,
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

function redactIdentifier(value: string): string {
  if (value === "origin") {
    return value;
  }
  if (value.length <= 8) {
    return `${value.slice(0, 3)}...`;
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneJson<TValue extends JsonValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}
