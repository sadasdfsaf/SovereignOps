import {
  calculateUploadChecksum,
  selectDownloadWindow,
  validateDownloadRequest,
  validateUploadRequest,
  type ConflictCode,
  type JsonValue,
  type LocalFirstEventEnvelope,
  type SyncDownloadWindow,
  type SyncUploadBatch,
  type SyncedEventEnvelope,
  type ValidationIssue,
} from "./bundles.ts";
import { INITIAL_CURSOR, advanceCursor, compareCursors } from "./cursors.ts";

export type SyncRepositoryErrorCode = ConflictCode | "validation_failed";

export interface SyncRepositoryValidationError {
  code: "validation_failed";
  message: string;
  issues: ValidationIssue[];
}

export interface SyncRepositoryConflictError {
  code: ConflictCode;
  message: string;
  eventId?: `evt_${string}`;
  baseCursor?: string;
  remoteCursor?: string;
  issues?: ValidationIssue[];
}

export type SyncRepositoryError =
  | SyncRepositoryValidationError
  | SyncRepositoryConflictError;

export type SyncRepositoryResult<TValue> =
  | { ok: true; value: TValue }
  | { ok: false; error: SyncRepositoryError };

export interface StoredSyncUploadBatch {
  workspaceId: `wsp_${string}`;
  deviceId: `dev_${string}`;
  baseCursor: string;
  nextCursor: string;
  checksum: string;
  eventIds: `evt_${string}`[];
}

export interface SyncUploadReceipt {
  workspaceId: `wsp_${string}`;
  deviceId: `dev_${string}`;
  baseCursor: string;
  nextCursor: string;
  events: SyncedEventEnvelope[];
}

export interface SyncRepositorySnapshot {
  batches: StoredSyncUploadBatch[];
  events: SyncedEventEnvelope[];
}

export interface SyncBundleRepository {
  upload(batch: unknown): SyncRepositoryResult<SyncUploadReceipt>;
  listAfter(request: unknown): SyncRepositoryResult<SyncDownloadWindow>;
  download(request: unknown): SyncRepositoryResult<SyncDownloadWindow>;
  snapshot(): SyncRepositorySnapshot;
}

interface WorkspaceState {
  cursor: string;
  batches: StoredSyncUploadBatch[];
  events: SyncedEventEnvelope[];
  eventsById: Map<`evt_${string}`, SyncedEventEnvelope>;
}

export function createInMemorySyncRepository(): SyncBundleRepository {
  return new InMemorySyncBundleRepository();
}

export class InMemorySyncBundleRepository implements SyncBundleRepository {
  readonly #workspaces = new Map<`wsp_${string}`, WorkspaceState>();

  upload(batch: unknown): SyncRepositoryResult<SyncUploadReceipt> {
    const validation = validateUploadRequest(batch);
    if (!validation.ok || validation.value === undefined) {
      return uploadValidationError(validation.issues);
    }

    const uploadBatch = validation.value;
    const checksumError = validateChecksum(uploadBatch);
    if (checksumError) {
      return { ok: false, error: checksumError };
    }

    const state = this.#workspace(uploadBatch.workspaceId);
    if (compareCursors(uploadBatch.baseCursor, state.cursor) !== 0) {
      return {
        ok: false,
        error: {
          code: "base_cursor_mismatch",
          message: "baseCursor must match the latest accepted cursor for the workspace",
          baseCursor: uploadBatch.baseCursor,
          remoteCursor: state.cursor,
        },
      };
    }

    for (const event of uploadBatch.events) {
      const existing = state.eventsById.get(event.id);
      if (existing) {
        return {
          ok: false,
          error: {
            code: "duplicate_event",
            message: "event id has already been accepted for the workspace",
            eventId: event.id,
            remoteCursor: existing.cursor,
          },
        };
      }
    }

    let cursor = state.cursor;
    const acceptedEvents = uploadBatch.events.map((event) => {
      cursor = advanceCursor(cursor, [event.id]);
      return toSyncedEvent(event, cursor);
    });

    const storedBatch: StoredSyncUploadBatch = {
      workspaceId: uploadBatch.workspaceId,
      deviceId: uploadBatch.deviceId,
      baseCursor: uploadBatch.baseCursor,
      nextCursor: cursor,
      checksum: uploadBatch.checksum,
      eventIds: acceptedEvents.map((event) => event.id),
    };

    state.cursor = cursor;
    state.batches.push(storedBatch);
    for (const event of acceptedEvents) {
      state.events.push(event);
      state.eventsById.set(event.id, event);
    }

    return {
      ok: true,
      value: {
        workspaceId: uploadBatch.workspaceId,
        deviceId: uploadBatch.deviceId,
        baseCursor: uploadBatch.baseCursor,
        nextCursor: cursor,
        events: acceptedEvents.map(cloneSyncedEvent),
      },
    };
  }

  listAfter(request: unknown): SyncRepositoryResult<SyncDownloadWindow> {
    const validation = validateDownloadRequest(request);
    if (!validation.ok || validation.value === undefined) {
      return validationError("download request validation failed", validation.issues);
    }

    const downloadRequest = validation.value;
    const state = this.#workspaces.get(downloadRequest.workspaceId);
    const events = state?.events ?? [];

    return {
      ok: true,
      value: selectDownloadWindow(events, downloadRequest),
    };
  }

  download(request: unknown): SyncRepositoryResult<SyncDownloadWindow> {
    return this.listAfter(request);
  }

  snapshot(): SyncRepositorySnapshot {
    const batches: StoredSyncUploadBatch[] = [];
    const events: SyncedEventEnvelope[] = [];

    for (const state of this.#orderedWorkspaceStates()) {
      batches.push(...state.batches.map(cloneStoredBatch));
      events.push(...state.events.map(cloneSyncedEvent));
    }

    return {
      batches,
      events: events.sort(compareSyncedEventCursor),
    };
  }

  #workspace(workspaceId: `wsp_${string}`): WorkspaceState {
    let state = this.#workspaces.get(workspaceId);
    if (!state) {
      state = {
        cursor: INITIAL_CURSOR,
        batches: [],
        events: [],
        eventsById: new Map(),
      };
      this.#workspaces.set(workspaceId, state);
    }
    return state;
  }

  #orderedWorkspaceStates(): WorkspaceState[] {
    return [...this.#workspaces.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, state]) => state);
  }
}

function validateChecksum(batch: SyncUploadBatch): SyncRepositoryConflictError | undefined {
  const expected = calculateUploadChecksum({
    workspaceId: batch.workspaceId,
    deviceId: batch.deviceId,
    baseCursor: batch.baseCursor,
    events: batch.events,
  });

  if (batch.checksum === expected) {
    return undefined;
  }

  return {
    code: "checksum_mismatch",
    message: "checksum does not match the upload body",
    issues: [{ path: "checksum", message: "checksum does not match the upload body" }],
  };
}

function uploadValidationError(issues: ValidationIssue[]): SyncRepositoryResult<SyncUploadReceipt> {
  if (isChecksumMismatchIssue(issues)) {
    return {
      ok: false,
      error: {
        code: "checksum_mismatch",
        message: "checksum does not match the upload body",
        issues,
      },
    };
  }

  return validationError("upload request validation failed", issues);
}

function validationError<TValue>(
  message: string,
  issues: ValidationIssue[],
): SyncRepositoryResult<TValue> {
  return {
    ok: false,
    error: {
      code: "validation_failed",
      message,
      issues,
    },
  };
}

function isChecksumMismatchIssue(issues: readonly ValidationIssue[]): boolean {
  return (
    issues.length === 1 &&
    issues[0].path === "checksum" &&
    issues[0].message === "checksum does not match the upload body"
  );
}

function toSyncedEvent(event: LocalFirstEventEnvelope, cursor: string): SyncedEventEnvelope {
  return {
    ...event,
    payload: cloneJson(event.payload),
    cursor,
  };
}

function cloneStoredBatch(batch: StoredSyncUploadBatch): StoredSyncUploadBatch {
  return {
    ...batch,
    eventIds: [...batch.eventIds],
  };
}

function cloneSyncedEvent(event: SyncedEventEnvelope): SyncedEventEnvelope {
  return {
    ...event,
    payload: cloneJson(event.payload),
  };
}

function cloneJson<TValue extends JsonValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}

function compareSyncedEventCursor(
  left: SyncedEventEnvelope,
  right: SyncedEventEnvelope,
): number {
  return (
    compareCursors(left.cursor, right.cursor) ||
    left.workspaceId.localeCompare(right.workspaceId) ||
    left.id.localeCompare(right.id)
  );
}
