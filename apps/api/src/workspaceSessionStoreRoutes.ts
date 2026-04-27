import { createHash } from "node:crypto";

import type {
  ApiResponse,
  ApiRoute,
  ApiRouter,
} from "./router.ts";
import { createApiRouter, jsonError, jsonResponse } from "./router.ts";
import {
  WORKSPACE_SESSION_API_SCHEMA_VERSION,
  createWorkspaceSessionRoutes,
  type WorkspaceSessionAuditPreviewResponse,
} from "./workspaceSessionRoutes.ts";

export const WORKSPACE_SESSION_STORE_SCHEMA_VERSION = "workspace-session-store/v1";
export const DEFAULT_WORKSPACE_SESSION_STORE_ROUTE_BASE_PATH =
  "/v1/workspace-session/snapshots";

export interface WorkspaceSessionStoreRoutesOptions {
  readonly basePath?: string;
  readonly now?: () => Date | string;
  readonly store?: WorkspaceSessionSnapshotStore;
}

export interface WorkspaceSessionSnapshotStore {
  create(record: WorkspaceSessionSnapshotRecord): WorkspaceSessionSnapshotCreateResult;
  get(snapshotId: string): WorkspaceSessionSnapshotRecord | undefined;
  list(): readonly WorkspaceSessionSnapshotRecord[];
}

export interface WorkspaceSessionSnapshotStoreOptions {
  readonly records?: readonly WorkspaceSessionSnapshotRecord[];
}

export interface WorkspaceSessionSnapshotPreviewSummary {
  readonly kind: "workspace-session.snapshot-summary";
  readonly localOnly: true;
  readonly redacted: true;
  readonly workspaceId: string;
  readonly deviceId: string;
  readonly sessionId: string;
  readonly operations: readonly string[];
  readonly eventCount: number;
  readonly eventIds: readonly string[];
  readonly auditRecordCount: number;
  readonly auditIds: readonly string[];
  readonly auditActions: readonly string[];
}

export interface WorkspaceSessionSnapshotPreviewResponse {
  readonly kind: "workspace-session.snapshot-preview";
  readonly schemaVersion: typeof WORKSPACE_SESSION_STORE_SCHEMA_VERSION;
  readonly apiSchemaVersion: typeof WORKSPACE_SESSION_API_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly durableWrites: false;
  readonly redacted: true;
  readonly fingerprint: string;
  readonly summary: WorkspaceSessionSnapshotPreviewSummary;
  readonly auditPreview: WorkspaceSessionAuditPreviewResponse;
}

export interface WorkspaceSessionSnapshotRecord {
  readonly kind: "workspace-session.snapshot-record";
  readonly schemaVersion: typeof WORKSPACE_SESSION_STORE_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly durableWrites: false;
  readonly redacted: true;
  readonly snapshotId: string;
  readonly label?: string;
  readonly metadata?: JsonRecord;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly fingerprint: string;
  readonly snapshotFingerprint: string;
  readonly snapshot: WorkspaceSessionSnapshotPreviewResponse;
}

export interface WorkspaceSessionSnapshotRecordSummary {
  readonly snapshotId: string;
  readonly label?: string;
  readonly metadata?: JsonRecord;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly fingerprint: string;
  readonly snapshotFingerprint: string;
  readonly workspaceId: string;
  readonly deviceId: string;
  readonly sessionId: string;
  readonly operations: readonly string[];
  readonly eventCount: number;
  readonly auditRecordCount: number;
}

export interface WorkspaceSessionSnapshotCreateResponse {
  readonly kind: "workspace-session.snapshot-record.created";
  readonly schemaVersion: typeof WORKSPACE_SESSION_STORE_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly durableWrites: false;
  readonly record: WorkspaceSessionSnapshotRecord;
}

export interface WorkspaceSessionSnapshotListFilters {
  readonly snapshotIds?: readonly string[];
  readonly fingerprints?: readonly string[];
  readonly workspaceIds?: readonly string[];
  readonly sessionIds?: readonly string[];
  readonly labels?: readonly string[];
  readonly createdAfter?: string;
  readonly createdBefore?: string;
}

export interface WorkspaceSessionSnapshotListResponse {
  readonly kind: "workspace-session.snapshot-record.list";
  readonly schemaVersion: typeof WORKSPACE_SESSION_STORE_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly durableWrites: false;
  readonly filters: WorkspaceSessionSnapshotListFilters;
  readonly pagination: {
    readonly offset: number;
    readonly limit: number;
    readonly totalRecordCount: number;
    readonly matchedRecordCount: number;
    readonly returnedRecordCount: number;
    readonly hasMore: boolean;
  };
  readonly records: readonly WorkspaceSessionSnapshotRecordSummary[];
}

export interface WorkspaceSessionSnapshotGetResponse {
  readonly kind: "workspace-session.snapshot-record.read";
  readonly schemaVersion: typeof WORKSPACE_SESSION_STORE_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly durableWrites: false;
  readonly record: WorkspaceSessionSnapshotRecord;
}

type WorkspaceSessionSnapshotCreateResult =
  | { ok: true; record: WorkspaceSessionSnapshotRecord }
  | { ok: false; reason: "duplicate" };

type Parsed<TValue> = { ok: true; value: TValue } | { ok: false; error: ApiResponse };
type JsonRecord = Record<string, unknown>;

interface ParsedCreateSnapshotRequest {
  readonly snapshotId?: string;
  readonly label?: string;
  readonly metadata?: JsonRecord;
  readonly snapshotPayload: unknown;
}

interface ParsedListSnapshotsRequest {
  readonly filters: WorkspaceSessionSnapshotListFilters;
  readonly offset: number;
  readonly limit: number;
}

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;
const SNAPSHOT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256_FINGERPRINT_PATTERN = /^sha256:[a-f0-9]{64}$/;
const REDACTED_STORAGE_PATTERN = /^\[redacted:path:[a-z0-9]+\]$/;
const REDACTED_LOCK_TOKEN_PATTERN = /^\[redacted:lockToken:[a-z0-9]+\]$/;
const CREATE_WRAPPER_KEYS = [
  "snapshotId",
  "id",
  "label",
  "metadata",
  "payload",
  "preview",
  "baseline",
  "snapshot",
  "auditPreview",
] as const;
const PREVIEW_WRAPPER_KEYS = ["payload", "preview", "baseline", "snapshot", "auditPreview"] as const;
const LIST_TOP_LEVEL_KEYS = [
  "filters",
  "snapshotIds",
  "fingerprints",
  "workspaceIds",
  "sessionIds",
  "labels",
  "createdAfter",
  "createdBefore",
  "offset",
  "limit",
] as const;
const LIST_FILTER_KEYS = [
  "snapshotIds",
  "fingerprints",
  "workspaceIds",
  "sessionIds",
  "labels",
  "createdAfter",
  "createdBefore",
] as const;
const SNAPSHOT_PREVIEW_KEYS = [
  "kind",
  "schemaVersion",
  "apiSchemaVersion",
  "localOnly",
  "durableWrites",
  "redacted",
  "fingerprint",
  "summary",
  "auditPreview",
] as const;
const AUDIT_PREVIEW_KEYS = [
  "kind",
  "schemaVersion",
  "localOnly",
  "durableWrites",
  "summary",
  "events",
  "audit",
] as const;
const SENSITIVE_FIELD_PATTERN =
  /(?:authorization|api[-_]?key|apikey|auth|bearer|cookie|credential|jwt|password|passphrase|private[-_]?key|refresh[-_]?token|secret|session[-_]?token|signing[-_]?key|token)$/i;
const SENSITIVE_TEXT_PATTERNS = [
  /\b((?:api[-_]?key|apikey|authorization|credential|password|passphrase|secret|session[-_]?token|token)\s*[:=]\s*)[^\s,;]+/gi,
  /\b(?:sk|rk|pk|tok|pat|npm)_[A-Za-z0-9_-]{8,}\b/g,
  /\b(?:sk|rk|pat|glpat|github_pat)-[A-Za-z0-9_-]{8,}\b/g,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}\b/gi,
];
const RAW_LOCAL_PATH_PATTERNS = [
  /\b[A-Za-z]:[\\/][^\s"',;)}\]]+/g,
  /\\\\[^\\\s"',;)}\]]+[\\][^\s"',;)}\]]+/g,
  /\b(?:\/Users|\/home|\/var|\/tmp|\/private|\/mnt|\/Volumes)\/[^\s"',;)}\]]+/g,
];
const auditPreviewRouter = createApiRouter(
  createWorkspaceSessionRoutes({ basePath: "/__workspace_session_store" }),
);

export function createInMemoryWorkspaceSessionSnapshotStore(
  options: WorkspaceSessionSnapshotStoreOptions = {},
): WorkspaceSessionSnapshotStore {
  const records = new Map<string, WorkspaceSessionSnapshotRecord>();

  for (const record of options.records ?? []) {
    records.set(record.snapshotId, cloneRecord(record));
  }

  return {
    create(record) {
      if (records.has(record.snapshotId)) {
        return { ok: false, reason: "duplicate" };
      }

      const stored = cloneRecord(record);
      records.set(stored.snapshotId, stored);
      return { ok: true, record: cloneRecord(stored) };
    },

    get(snapshotId) {
      const record = records.get(snapshotId);
      return record === undefined ? undefined : cloneRecord(record);
    },

    list() {
      return Object.freeze(
        [...records.values()]
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt) ||
            left.snapshotId.localeCompare(right.snapshotId))
          .map(cloneRecord),
      );
    },
  };
}

export function createWorkspaceSessionSnapshotPreview(
  auditPreview: WorkspaceSessionAuditPreviewResponse,
): WorkspaceSessionSnapshotPreviewResponse {
  const normalized = normalizeAuditPreviewResponse(auditPreview, "auditPreview");
  if (!normalized.ok || normalized.value === undefined) {
    throw new TypeError("Workspace session snapshot preview requires an audit preview.");
  }

  const redactedAuditPreview = redactJsonValue(normalized.value) as WorkspaceSessionAuditPreviewResponse;
  const summary = summarizeSnapshotPreview(redactedAuditPreview);
  const previewWithoutFingerprint = {
    kind: "workspace-session.snapshot-preview" as const,
    schemaVersion: WORKSPACE_SESSION_STORE_SCHEMA_VERSION,
    apiSchemaVersion: WORKSPACE_SESSION_API_SCHEMA_VERSION,
    localOnly: true as const,
    durableWrites: false as const,
    redacted: true as const,
    summary,
    auditPreview: redactedAuditPreview,
  };

  return deepFreeze({
    ...previewWithoutFingerprint,
    fingerprint: fingerprintValue(previewWithoutFingerprint),
  });
}

export function createWorkspaceSessionStoreRoutes(
  options: WorkspaceSessionStoreRoutesOptions = {},
): readonly ApiRoute[] {
  const basePath = normalizeBasePath(
    options.basePath ?? DEFAULT_WORKSPACE_SESSION_STORE_ROUTE_BASE_PATH,
  );
  const store = options.store ?? createInMemoryWorkspaceSessionSnapshotStore();
  const now = options.now ?? (() => new Date());

  return Object.freeze([
    {
      method: "POST",
      path: joinPath(basePath, "/preview"),
      description: "Previews a redacted local workspace session snapshot without writing state.",
      handler: async ({ request }) => {
        const parsed = parsePreviewSnapshotRequest(request.body);
        if (!parsed.ok) {
          return parsed.error;
        }

        const preview = await resolveSnapshotPreview(parsed.value);
        if (!preview.ok) {
          return preview.error;
        }

        return jsonResponse(200, preview.value);
      },
    },
    {
      method: "POST",
      path: basePath,
      description: "Stores a redacted local workspace session snapshot.",
      handler: async ({ request }) => {
        const parsed = parseCreateSnapshotRequest(request.body);
        if (!parsed.ok) {
          return parsed.error;
        }

        const preview = await resolveSnapshotPreview(parsed.value.snapshotPayload);
        if (!preview.ok) {
          return preview.error;
        }

        let timestamp: string;
        try {
          timestamp = readTimestamp(now);
        } catch (error) {
          return caughtWorkspaceSessionStoreError(error);
        }

        const snapshotId = parsed.value.snapshotId ??
          createDefaultSnapshotId(preview.value.fingerprint);
        const record = buildRecord({
          snapshotId,
          createdAt: timestamp,
          updatedAt: timestamp,
          label: parsed.value.label,
          metadata: parsed.value.metadata,
          snapshot: preview.value,
        });
        const created = store.create(record);
        if (!created.ok) {
          return jsonError(
            409,
            "workspace_session_snapshot_duplicate",
            "Workspace session snapshot already exists.",
            { snapshotId },
          );
        }

        return jsonResponse(201, deepFreeze({
          kind: "workspace-session.snapshot-record.created",
          schemaVersion: WORKSPACE_SESSION_STORE_SCHEMA_VERSION,
          localOnly: true,
          durableWrites: false,
          record: created.record,
        } satisfies WorkspaceSessionSnapshotCreateResponse));
      },
    },
    {
      method: "GET",
      path: basePath,
      description: "Lists stored redacted local workspace session snapshots.",
      handler: ({ request }) => {
        const parsed = parseListSnapshotsRequest(request.body);
        if (!parsed.ok) {
          return parsed.error;
        }

        return jsonResponse(200, listSnapshots(store, parsed.value));
      },
    },
    {
      method: "GET",
      path: joinPath(basePath, "/:snapshotId"),
      description: "Reads a stored redacted local workspace session snapshot.",
      handler: ({ params }) => {
        const snapshotId = parseSnapshotId(params.snapshotId, "snapshotId");
        if (!snapshotId.ok) {
          return snapshotId.error;
        }

        const record = store.get(snapshotId.value);
        if (record === undefined) {
          return snapshotNotFound(snapshotId.value);
        }

        return jsonResponse(200, deepFreeze({
          kind: "workspace-session.snapshot-record.read",
          schemaVersion: WORKSPACE_SESSION_STORE_SCHEMA_VERSION,
          localOnly: true,
          durableWrites: false,
          record,
        } satisfies WorkspaceSessionSnapshotGetResponse));
      },
    },
  ]);
}

export function mountWorkspaceSessionStoreRoutes(
  router: ApiRouter,
  options: WorkspaceSessionStoreRoutesOptions = {},
): ApiRouter {
  for (const route of createWorkspaceSessionStoreRoutes(options)) {
    router.register(route);
  }

  return router;
}

function buildRecord(input: {
  readonly snapshotId: string;
  readonly label?: string;
  readonly metadata?: JsonRecord;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly snapshot: WorkspaceSessionSnapshotPreviewResponse;
}): WorkspaceSessionSnapshotRecord {
  const recordWithoutFingerprint = optionalFields({
    kind: "workspace-session.snapshot-record" as const,
    schemaVersion: WORKSPACE_SESSION_STORE_SCHEMA_VERSION,
    localOnly: true as const,
    durableWrites: false as const,
    redacted: true as const,
    snapshotId: input.snapshotId,
    label: input.label,
    metadata: input.metadata,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    snapshotFingerprint: input.snapshot.fingerprint,
    snapshot: input.snapshot,
  });

  return deepFreeze({
    ...recordWithoutFingerprint,
    fingerprint: fingerprintValue(recordWithoutFingerprint),
  });
}

function listSnapshots(
  store: WorkspaceSessionSnapshotStore,
  request: ParsedListSnapshotsRequest,
): WorkspaceSessionSnapshotListResponse {
  const allRecords = store.list();
  const matchedRecords = applyListFilters(allRecords, request.filters);
  const records = matchedRecords
    .slice(request.offset, request.offset + request.limit)
    .map(summarizeRecord);

  return deepFreeze({
    kind: "workspace-session.snapshot-record.list",
    schemaVersion: WORKSPACE_SESSION_STORE_SCHEMA_VERSION,
    localOnly: true,
    durableWrites: false,
    filters: request.filters,
    pagination: {
      offset: request.offset,
      limit: request.limit,
      totalRecordCount: allRecords.length,
      matchedRecordCount: matchedRecords.length,
      returnedRecordCount: records.length,
      hasMore: request.offset + records.length < matchedRecords.length,
    },
    records,
  } satisfies WorkspaceSessionSnapshotListResponse);
}

function applyListFilters(
  records: readonly WorkspaceSessionSnapshotRecord[],
  filters: WorkspaceSessionSnapshotListFilters,
): readonly WorkspaceSessionSnapshotRecord[] {
  const snapshotIds = filters.snapshotIds ? new Set(filters.snapshotIds) : undefined;
  const fingerprints = filters.fingerprints ? new Set(filters.fingerprints) : undefined;
  const workspaceIds = filters.workspaceIds ? new Set(filters.workspaceIds) : undefined;
  const sessionIds = filters.sessionIds ? new Set(filters.sessionIds) : undefined;
  const labels = filters.labels ? new Set(filters.labels) : undefined;
  const createdAfter = filters.createdAfter === undefined
    ? undefined
    : Date.parse(filters.createdAfter);
  const createdBefore = filters.createdBefore === undefined
    ? undefined
    : Date.parse(filters.createdBefore);

  return records.filter((record) => {
    const createdAt = Date.parse(record.createdAt);
    const summary = record.snapshot.summary;

    return (
      (snapshotIds === undefined || snapshotIds.has(record.snapshotId)) &&
      (fingerprints === undefined ||
        fingerprints.has(record.fingerprint) ||
        fingerprints.has(record.snapshotFingerprint)) &&
      (workspaceIds === undefined || workspaceIds.has(summary.workspaceId)) &&
      (sessionIds === undefined || sessionIds.has(summary.sessionId)) &&
      (labels === undefined || (record.label !== undefined && labels.has(record.label))) &&
      (createdAfter === undefined || createdAt >= createdAfter) &&
      (createdBefore === undefined || createdAt <= createdBefore)
    );
  });
}

function summarizeRecord(
  record: WorkspaceSessionSnapshotRecord,
): WorkspaceSessionSnapshotRecordSummary {
  const summary = record.snapshot.summary;

  return deepFreeze(optionalFields({
    snapshotId: record.snapshotId,
    label: record.label,
    metadata: record.metadata,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    fingerprint: record.fingerprint,
    snapshotFingerprint: record.snapshotFingerprint,
    workspaceId: summary.workspaceId,
    deviceId: summary.deviceId,
    sessionId: summary.sessionId,
    operations: summary.operations,
    eventCount: summary.eventCount,
    auditRecordCount: summary.auditRecordCount,
  }));
}

function summarizeSnapshotPreview(
  preview: WorkspaceSessionAuditPreviewResponse,
): WorkspaceSessionSnapshotPreviewSummary {
  const sessionId =
    preview.summary.session?.sessionId ??
    preview.events.find((event) =>
      isRecord(event.payload) && typeof event.payload.sessionId === "string"
    )?.payload.sessionId;
  if (sessionId === undefined) {
    throw new TypeError("Workspace session snapshot preview requires a sessionId.");
  }

  return deepFreeze({
    kind: "workspace-session.snapshot-summary",
    localOnly: true,
    redacted: true,
    workspaceId: preview.summary.workspaceId,
    deviceId: preview.summary.deviceId,
    sessionId,
    operations: preview.events.map((event) => String(event.payload.operation)),
    eventCount: preview.events.length,
    eventIds: preview.events.map((event) => event.eventId),
    auditRecordCount: preview.audit.recordCount,
    auditIds: preview.audit.records.map((record) => record.auditId),
    auditActions: preview.audit.records.map((record) => record.action),
  });
}

async function resolveSnapshotPreview(
  payload: unknown,
): Promise<Parsed<WorkspaceSessionSnapshotPreviewResponse>> {
  const cloned = cloneJsonCompatibleValue(payload, "body");
  if (!cloned.ok) {
    return cloned;
  }

  const snapshotPreview = normalizeSnapshotPreviewResponse(cloned.value, "body");
  if (!snapshotPreview.ok) {
    return snapshotPreview;
  }
  if (snapshotPreview.value !== undefined) {
    try {
      return {
        ok: true,
        value: createWorkspaceSessionSnapshotPreview(snapshotPreview.value.auditPreview),
      };
    } catch (error) {
      return { ok: false, error: caughtWorkspaceSessionStoreError(error) };
    }
  }

  const auditPreview = normalizeAuditPreviewResponse(cloned.value, "body");
  if (!auditPreview.ok) {
    return auditPreview;
  }
  if (auditPreview.value !== undefined) {
    try {
      return { ok: true, value: createWorkspaceSessionSnapshotPreview(auditPreview.value) };
    } catch (error) {
      return { ok: false, error: caughtWorkspaceSessionStoreError(error) };
    }
  }

  const response = await auditPreviewRouter.dispatch({
    method: "POST",
    path: "/__workspace_session_store/audit-preview",
    body: cloned.value,
  });
  if (response.status !== 200) {
    return { ok: false, error: response };
  }

  try {
    return {
      ok: true,
      value: createWorkspaceSessionSnapshotPreview(
        response.body as WorkspaceSessionAuditPreviewResponse,
      ),
    };
  } catch (error) {
    return { ok: false, error: caughtWorkspaceSessionStoreError(error) };
  }
}

function normalizeSnapshotPreviewResponse(
  value: unknown,
  path: string,
): Parsed<WorkspaceSessionSnapshotPreviewResponse | undefined> {
  if (!isRecord(value)) {
    return { ok: true, value: undefined };
  }
  if (value.kind !== "workspace-session.snapshot-preview") {
    return { ok: true, value: undefined };
  }

  const keys = allowedKeys(value, SNAPSHOT_PREVIEW_KEYS, path);
  if (!keys.ok) {
    return keys;
  }
  if (value.schemaVersion !== WORKSPACE_SESSION_STORE_SCHEMA_VERSION) {
    return validationFailure("Workspace session snapshot preview schema version is unsupported.", {
      path: `${path}.schemaVersion`,
    });
  }
  if (value.apiSchemaVersion !== WORKSPACE_SESSION_API_SCHEMA_VERSION) {
    return validationFailure("Workspace session API schema version is unsupported.", {
      path: `${path}.apiSchemaVersion`,
    });
  }
  if (value.localOnly !== true || value.durableWrites !== false || value.redacted !== true) {
    return validationFailure("Workspace session snapshot preview must be local-only and redacted.", {
      path,
    });
  }
  const fingerprint = parseFingerprint(value.fingerprint, `${path}.fingerprint`);
  if (!fingerprint.ok) {
    return fingerprint;
  }
  const auditPreview = normalizeAuditPreviewResponse(value.auditPreview, `${path}.auditPreview`);
  if (!auditPreview.ok) {
    return auditPreview;
  }
  if (auditPreview.value === undefined) {
    return validationFailure("Workspace session snapshot preview requires an audit preview.", {
      path: `${path}.auditPreview`,
    });
  }

  return {
    ok: true,
    value: deepFreeze(value) as WorkspaceSessionSnapshotPreviewResponse,
  };
}

function normalizeAuditPreviewResponse(
  value: unknown,
  path: string,
): Parsed<WorkspaceSessionAuditPreviewResponse | undefined> {
  if (!isRecord(value)) {
    return { ok: true, value: undefined };
  }
  if (value.kind !== "workspace-session.audit-preview") {
    return { ok: true, value: undefined };
  }

  const keys = allowedKeys(value, AUDIT_PREVIEW_KEYS, path);
  if (!keys.ok) {
    return keys;
  }
  if (value.schemaVersion !== WORKSPACE_SESSION_API_SCHEMA_VERSION) {
    return validationFailure("Workspace session audit preview schema version is unsupported.", {
      path: `${path}.schemaVersion`,
    });
  }
  if (value.localOnly !== true || value.durableWrites !== false) {
    return validationFailure("Workspace session audit preview must be local-only.", { path });
  }
  const summary = validateAuditPreviewSummary(value.summary, `${path}.summary`);
  if (!summary.ok) {
    return summary;
  }
  const events = validateAuditPreviewEvents(value.events, `${path}.events`);
  if (!events.ok) {
    return events;
  }
  const audit = validateAuditPreviewRecords(value.audit, `${path}.audit`);
  if (!audit.ok) {
    return audit;
  }

  return {
    ok: true,
    value: deepFreeze(value) as WorkspaceSessionAuditPreviewResponse,
  };
}

function validateAuditPreviewSummary(
  value: unknown,
  path: string,
): Parsed<undefined> {
  if (!isRecord(value)) {
    return validationFailure("Workspace session audit preview summary must be an object.", { path });
  }
  if (value.kind !== "workspace-session.summary") {
    return validationFailure("Workspace session audit preview summary kind is unsupported.", {
      path: `${path}.kind`,
    });
  }
  if (value.localOnly !== true || value.durableWrites !== false) {
    return validationFailure("Workspace session audit preview summary must be local-only.", {
      path,
    });
  }
  if (!isRecord(value.storage)) {
    return validationFailure("Workspace session audit preview storage must be an object.", {
      path: `${path}.storage`,
    });
  }
  if (
    value.storage.storagePathRedacted !== true ||
    typeof value.storage.storagePath !== "string" ||
    !REDACTED_STORAGE_PATTERN.test(value.storage.storagePath)
  ) {
    return validationFailure("Workspace session audit preview storage path must be redacted.", {
      path: `${path}.storage.storagePath`,
    });
  }

  return { ok: true, value: undefined };
}

function validateAuditPreviewEvents(
  value: unknown,
  path: string,
): Parsed<undefined> {
  if (!Array.isArray(value)) {
    return validationFailure("Workspace session audit preview events must be an array.", { path });
  }

  for (const [index, event] of value.entries()) {
    const itemPath = `${path}.${index}`;
    if (!isRecord(event)) {
      return validationFailure("Workspace session audit preview event must be an object.", {
        path: itemPath,
      });
    }
    if (!isRecord(event.payload)) {
      return validationFailure("Workspace session audit preview event payload must be an object.", {
        path: `${itemPath}.payload`,
      });
    }
    if (
      event.payload.localOnly !== true ||
      event.payload.storagePathRedacted !== true ||
      typeof event.payload.storagePath !== "string" ||
      !REDACTED_STORAGE_PATTERN.test(event.payload.storagePath)
    ) {
      return validationFailure("Workspace session event storage path must be redacted.", {
        path: `${itemPath}.payload.storagePath`,
      });
    }
    if (event.payload.lock !== undefined) {
      if (
        !isRecord(event.payload.lock) ||
        typeof event.payload.lock.lockTokenRef !== "string" ||
        !REDACTED_LOCK_TOKEN_PATTERN.test(event.payload.lock.lockTokenRef)
      ) {
        return validationFailure("Workspace session event lock token must be redacted.", {
          path: `${itemPath}.payload.lock.lockTokenRef`,
        });
      }
    }
  }

  return { ok: true, value: undefined };
}

function validateAuditPreviewRecords(
  value: unknown,
  path: string,
): Parsed<undefined> {
  if (!isRecord(value)) {
    return validationFailure("Workspace session audit preview records must be an object.", { path });
  }
  if (value.kind !== "workspace-session.audit-preview.records") {
    return validationFailure("Workspace session audit preview records kind is unsupported.", {
      path: `${path}.kind`,
    });
  }
  if (value.localOnly !== true || value.redacted !== true) {
    return validationFailure("Workspace session audit preview records must be local-only and redacted.", {
      path,
    });
  }
  if (!Array.isArray(value.records)) {
    return validationFailure("Workspace session audit preview records must be an array.", {
      path: `${path}.records`,
    });
  }
  if (value.recordCount !== value.records.length) {
    return validationFailure("Workspace session audit preview recordCount must match records length.", {
      path: `${path}.recordCount`,
    });
  }

  for (const [index, record] of value.records.entries()) {
    const itemPath = `${path}.records.${index}`;
    if (!isRecord(record)) {
      return validationFailure("Workspace session audit record must be an object.", {
        path: itemPath,
      });
    }
    const auditId = parseRequiredString(record.auditId, `${itemPath}.auditId`);
    if (!auditId.ok) {
      return auditId;
    }
    const action = parseRequiredString(record.action, `${itemPath}.action`);
    if (!action.ok) {
      return action;
    }
    if (isRecord(record.details)) {
      if (
        record.details.storagePath !== undefined &&
        (typeof record.details.storagePath !== "string" ||
          !REDACTED_STORAGE_PATTERN.test(record.details.storagePath))
      ) {
        return validationFailure("Workspace session audit record storage path must be redacted.", {
          path: `${itemPath}.details.storagePath`,
        });
      }
      if (isRecord(record.details.lock)) {
        const lockTokenRef = record.details.lock.lockTokenRef;
        if (typeof lockTokenRef !== "string" || !REDACTED_LOCK_TOKEN_PATTERN.test(lockTokenRef)) {
          return validationFailure("Workspace session audit record lock token must be redacted.", {
            path: `${itemPath}.details.lock.lockTokenRef`,
          });
        }
      }
    }
  }

  return { ok: true, value: undefined };
}

function parsePreviewSnapshotRequest(body: unknown): Parsed<unknown> {
  const cloned = cloneJsonCompatibleValue(body, "body");
  if (!cloned.ok) {
    return cloned;
  }
  if (!isRecord(cloned.value)) {
    return validationFailure("Request body must be an object.", { path: "body" });
  }

  const wrapperPayload = readWrapperPayload(cloned.value, "body");
  if (!wrapperPayload.ok) {
    return wrapperPayload;
  }
  if (wrapperPayload.value !== undefined) {
    const keys = allowedKeys(cloned.value, PREVIEW_WRAPPER_KEYS, "body");
    if (!keys.ok) {
      return keys;
    }
  }

  return { ok: true, value: wrapperPayload.value ?? cloned.value };
}

function parseCreateSnapshotRequest(body: unknown): Parsed<ParsedCreateSnapshotRequest> {
  const cloned = cloneJsonCompatibleValue(body, "body");
  if (!cloned.ok) {
    return cloned;
  }
  if (!isRecord(cloned.value)) {
    return validationFailure("Request body must be an object.", { path: "body" });
  }

  const wrapperPayload = readWrapperPayload(cloned.value, "body");
  if (!wrapperPayload.ok) {
    return wrapperPayload;
  }

  const snapshotId = parseOptionalSnapshotId(
    cloned.value.snapshotId ?? cloned.value.id,
    cloned.value.snapshotId === undefined ? "body.id" : "body.snapshotId",
  );
  if (!snapshotId.ok) {
    return snapshotId;
  }

  const label = parseOptionalString(cloned.value.label, "body.label");
  if (!label.ok) {
    return label;
  }

  const metadata = parseOptionalRecord(cloned.value.metadata, "body.metadata");
  if (!metadata.ok) {
    return metadata;
  }

  if (wrapperPayload.value !== undefined) {
    const keys = allowedKeys(cloned.value, CREATE_WRAPPER_KEYS, "body");
    if (!keys.ok) {
      return keys;
    }

    return {
      ok: true,
      value: optionalFields({
        snapshotId: snapshotId.value,
        label: label.value,
        metadata: metadata.value,
        snapshotPayload: wrapperPayload.value,
      }) as ParsedCreateSnapshotRequest,
    };
  }

  const snapshotPayload = { ...cloned.value };
  delete snapshotPayload.snapshotId;
  delete snapshotPayload.id;
  delete snapshotPayload.label;
  delete snapshotPayload.metadata;

  return {
    ok: true,
    value: optionalFields({
      snapshotId: snapshotId.value,
      label: label.value,
      metadata: metadata.value,
      snapshotPayload,
    }) as ParsedCreateSnapshotRequest,
  };
}

function parseListSnapshotsRequest(body: unknown): Parsed<ParsedListSnapshotsRequest> {
  if (body === undefined) {
    return {
      ok: true,
      value: {
        filters: {},
        offset: 0,
        limit: DEFAULT_LIST_LIMIT,
      },
    };
  }

  const cloned = cloneJsonCompatibleValue(body, "body");
  if (!cloned.ok) {
    return cloned;
  }
  if (!isRecord(cloned.value)) {
    return validationFailure("Request body must be an object.", { path: "body" });
  }

  const keys = allowedKeys(cloned.value, LIST_TOP_LEVEL_KEYS, "body");
  if (!keys.ok) {
    return keys;
  }

  if (cloned.value.filters !== undefined && !isRecord(cloned.value.filters)) {
    return validationFailure("Workspace session snapshot filters must be an object.", {
      path: "body.filters",
    });
  }
  const filterRecord = isRecord(cloned.value.filters)
    ? cloned.value.filters
    : pickFields(cloned.value, LIST_FILTER_KEYS);
  const filters = parseListFilters(
    filterRecord,
    isRecord(cloned.value.filters) ? "body.filters" : "body",
  );
  if (!filters.ok) {
    return filters;
  }

  const offset = parseOptionalIntegerInRange(cloned.value.offset, "body.offset", 0);
  if (!offset.ok) {
    return offset;
  }

  const limit = parseOptionalIntegerInRange(cloned.value.limit, "body.limit", 0, MAX_LIST_LIMIT);
  if (!limit.ok) {
    return limit;
  }

  return {
    ok: true,
    value: {
      filters: filters.value,
      offset: offset.value ?? 0,
      limit: limit.value ?? DEFAULT_LIST_LIMIT,
    },
  };
}

function parseListFilters(
  value: JsonRecord,
  path: string,
): Parsed<WorkspaceSessionSnapshotListFilters> {
  const keys = allowedKeys(value, LIST_FILTER_KEYS, path);
  if (!keys.ok) {
    return keys;
  }

  const snapshotIds = parseOptionalSnapshotIdArray(value.snapshotIds, `${path}.snapshotIds`);
  if (!snapshotIds.ok) {
    return snapshotIds;
  }
  const fingerprints = parseOptionalFingerprintArray(value.fingerprints, `${path}.fingerprints`);
  if (!fingerprints.ok) {
    return fingerprints;
  }
  const workspaceIds = parseOptionalStringArray(value.workspaceIds, `${path}.workspaceIds`);
  if (!workspaceIds.ok) {
    return workspaceIds;
  }
  const sessionIds = parseOptionalStringArray(value.sessionIds, `${path}.sessionIds`);
  if (!sessionIds.ok) {
    return sessionIds;
  }
  const labels = parseOptionalStringArray(value.labels, `${path}.labels`);
  if (!labels.ok) {
    return labels;
  }
  const createdAfter = parseOptionalTimestamp(value.createdAfter, `${path}.createdAfter`);
  if (!createdAfter.ok) {
    return createdAfter;
  }
  const createdBefore = parseOptionalTimestamp(value.createdBefore, `${path}.createdBefore`);
  if (!createdBefore.ok) {
    return createdBefore;
  }

  if (
    createdAfter.value !== undefined &&
    createdBefore.value !== undefined &&
    Date.parse(createdAfter.value) > Date.parse(createdBefore.value)
  ) {
    return validationFailure("createdAfter must be before or equal to createdBefore.", {
      path: `${path}.createdAfter`,
    });
  }

  return {
    ok: true,
    value: optionalFields({
      snapshotIds: snapshotIds.value,
      fingerprints: fingerprints.value,
      workspaceIds: workspaceIds.value,
      sessionIds: sessionIds.value,
      labels: labels.value,
      createdAfter: createdAfter.value,
      createdBefore: createdBefore.value,
    }),
  };
}

function readWrapperPayload(
  body: JsonRecord,
  path: string,
): Parsed<unknown | undefined> {
  const keys = PREVIEW_WRAPPER_KEYS.filter((key) => body[key] !== undefined);
  if (keys.length > 1) {
    return validationFailure("Request body must include only one workspace session snapshot payload field.", {
      path,
      fields: keys,
    });
  }

  return { ok: true, value: keys.length === 0 ? undefined : body[keys[0]] };
}

function pickFields(
  record: JsonRecord,
  keys: readonly string[],
): JsonRecord {
  return Object.fromEntries(
    keys
      .filter((key) => record[key] !== undefined)
      .map((key) => [key, record[key]]),
  );
}

function snapshotNotFound(snapshotId: string): ApiResponse {
  return jsonError(
    404,
    "workspace_session_snapshot_not_found",
    "Workspace session snapshot was not found.",
    { snapshotId },
  );
}

function parseOptionalSnapshotId(value: unknown, path: string): Parsed<string | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  return parseSnapshotId(value, path);
}

function parseSnapshotId(value: unknown, path: string): Parsed<string> {
  const parsed = parseRequiredString(value, path);
  if (!parsed.ok) {
    return parsed;
  }
  if (!SNAPSHOT_ID_PATTERN.test(parsed.value)) {
    return validationFailure(
      "Snapshot id must start with a letter or number and contain only letters, numbers, dot, underscore, colon, or hyphen.",
      { path },
    );
  }

  return parsed;
}

function parseOptionalRecord(
  value: unknown,
  path: string,
): Parsed<JsonRecord | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (!isRecord(value)) {
    return validationFailure("Value must be an object.", { path });
  }

  return { ok: true, value: redactJsonValue(value) as JsonRecord };
}

function parseOptionalSnapshotIdArray(
  value: unknown,
  path: string,
): Parsed<readonly string[] | undefined> {
  const parsed = parseOptionalStringArray(value, path);
  if (!parsed.ok || parsed.value === undefined) {
    return parsed;
  }

  for (const [index, item] of parsed.value.entries()) {
    if (!SNAPSHOT_ID_PATTERN.test(item)) {
      return validationFailure(
        "Snapshot id must start with a letter or number and contain only letters, numbers, dot, underscore, colon, or hyphen.",
        { path: `${path}.${index}` },
      );
    }
  }

  return parsed;
}

function parseOptionalFingerprintArray(
  value: unknown,
  path: string,
): Parsed<readonly string[] | undefined> {
  const parsed = parseOptionalStringArray(value, path);
  if (!parsed.ok || parsed.value === undefined) {
    return parsed;
  }

  for (const [index, item] of parsed.value.entries()) {
    const fingerprint = parseFingerprint(item, `${path}.${index}`);
    if (!fingerprint.ok) {
      return fingerprint;
    }
  }

  return parsed;
}

function parseFingerprint(value: unknown, path: string): Parsed<string> {
  const parsed = parseRequiredString(value, path);
  if (!parsed.ok) {
    return parsed;
  }
  if (!SHA256_FINGERPRINT_PATTERN.test(parsed.value)) {
    return validationFailure("Value must be a sha256 fingerprint.", { path });
  }

  return parsed;
}

function parseRequiredString(value: unknown, path: string): Parsed<string> {
  const parsed = readTrimmedString(value);
  if (parsed === undefined) {
    return validationFailure("Value must be a non-empty string.", { path });
  }

  return { ok: true, value: parsed };
}

function parseOptionalString(value: unknown, path: string): Parsed<string | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  return parseRequiredString(value, path);
}

function parseOptionalStringArray(
  value: unknown,
  path: string,
): Parsed<readonly string[] | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (!Array.isArray(value)) {
    return validationFailure("Value must be an array of non-empty strings.", { path });
  }

  const values: string[] = [];
  for (const [index, item] of value.entries()) {
    const parsed = readTrimmedString(item);
    if (parsed === undefined) {
      return validationFailure("Value must be an array of non-empty strings.", {
        path: `${path}.${index}`,
      });
    }
    values.push(parsed);
  }

  return { ok: true, value: Object.freeze(values) };
}

function parseOptionalTimestamp(value: unknown, path: string): Parsed<string | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  const parsed = parseRequiredString(value, path);
  if (!parsed.ok) {
    return parsed;
  }
  if (Number.isNaN(Date.parse(parsed.value))) {
    return validationFailure("Value must be a valid timestamp.", { path });
  }

  return parsed;
}

function parseOptionalIntegerInRange(
  value: unknown,
  path: string,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): Parsed<number | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) {
    return validationFailure(`Value must be a safe integer between ${min} and ${max}.`, {
      path,
    });
  }

  return { ok: true, value: Number(value) };
}

function allowedKeys(
  record: JsonRecord,
  keys: readonly string[],
  path: string,
): { ok: true } | { ok: false; error: ApiResponse } {
  const allowed = new Set(keys);
  const unknown = Object.keys(record).find((key) => !allowed.has(key));
  if (unknown) {
    return validationFailure("Request body contains an unknown field.", {
      path: `${path}.${unknown}`,
    });
  }

  return { ok: true };
}

function cloneJsonCompatibleValue(
  value: unknown,
  path: string,
  seen: WeakSet<object> = new WeakSet<object>(),
): Parsed<unknown> {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return { ok: true, value };
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return validationFailure("Request body must be JSON-compatible.", { path });
    }

    return { ok: true, value };
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return validationFailure("Request body must not contain circular references.", { path });
    }

    seen.add(value);
    const values: unknown[] = [];
    for (const [index, item] of value.entries()) {
      const parsed = cloneJsonCompatibleValue(item, `${path}.${index}`, seen);
      if (!parsed.ok) {
        return parsed;
      }
      values.push(parsed.value);
    }
    seen.delete(value);

    return { ok: true, value: Object.freeze(values) };
  }

  if (isRecord(value)) {
    if (seen.has(value)) {
      return validationFailure("Request body must not contain circular references.", { path });
    }

    seen.add(value);
    const output: JsonRecord = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      if (entryValue === undefined) {
        return validationFailure("Request body must be JSON-compatible.", {
          path: `${path}.${entryKey}`,
        });
      }

      const parsed = cloneJsonCompatibleValue(entryValue, `${path}.${entryKey}`, seen);
      if (!parsed.ok) {
        return parsed;
      }
      output[entryKey] = parsed.value;
    }
    seen.delete(value);

    return { ok: true, value: deepFreeze(output) };
  }

  return validationFailure("Request body must be JSON-compatible.", { path });
}

function redactJsonValue(
  value: unknown,
  key = "",
  seen: WeakSet<object> = new WeakSet<object>(),
): unknown {
  if (key.length > 0 && key !== "lockTokenRef" && SENSITIVE_FIELD_PATTERN.test(key)) {
    return "[REDACTED]";
  }

  if (typeof value === "string") {
    return redactStringValue(value);
  }

  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return "[Circular]";
    }

    seen.add(value);
    const redacted = value.map((item) => redactJsonValue(item, "", seen));
    seen.delete(value);
    return Object.freeze(redacted);
  }

  if (isRecord(value)) {
    if (seen.has(value)) {
      return "[Circular]";
    }

    seen.add(value);
    const redacted = Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactJsonValue(entryValue, entryKey, seen),
      ]),
    );
    seen.delete(value);

    return deepFreeze(redacted);
  }

  return value;
}

function redactStringValue(value: string): string {
  const secretRedacted = SENSITIVE_TEXT_PATTERNS.reduce(
    (redacted, pattern) => redacted.replace(pattern, (match, prefix) =>
      typeof prefix === "string" ? `${prefix}[REDACTED]` : "[REDACTED]",
    ),
    value,
  );

  return RAW_LOCAL_PATH_PATTERNS.reduce(
    (redacted, pattern) => redacted.replace(pattern, "[redacted:path]"),
    secretRedacted,
  );
}

function caughtWorkspaceSessionStoreError(error: unknown): ApiResponse {
  if (error instanceof TypeError) {
    return validationError(error.message, { path: "body" });
  }

  return jsonError(
    500,
    "workspace_session_snapshot_route_failed",
    "Workspace session snapshot route failed.",
  );
}

function validationFailure<TValue>(
  message: string,
  details: Readonly<Record<string, unknown>>,
): Parsed<TValue> {
  return { ok: false, error: validationError(message, details) };
}

function validationError(
  message: string,
  details: Readonly<Record<string, unknown>>,
): ApiResponse {
  return jsonError(400, "validation_failed", message, details);
}

function cloneRecord(record: WorkspaceSessionSnapshotRecord): WorkspaceSessionSnapshotRecord {
  return deepFreeze(structuredClone(record));
}

function createDefaultSnapshotId(fingerprint: string): string {
  return `wssnap_${fingerprint.slice("sha256:".length, "sha256:".length + 24)}`;
}

function fingerprintValue(value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(serializeDeterministicJson(value), "utf8")
    .digest("hex")}`;
}

function serializeDeterministicJson(value: unknown): string {
  return stringifyStable(value, new WeakSet<object>());
}

function stringifyStable(value: unknown, seen: WeakSet<object>): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new TypeError("Cannot serialize circular values.");
    }

    seen.add(value);
    const serialized = `[${value.map((item) => stringifyStable(item, seen)).join(",")}]`;
    seen.delete(value);
    return serialized;
  }

  if (isRecord(value)) {
    if (seen.has(value)) {
      throw new TypeError("Cannot serialize circular values.");
    }

    seen.add(value);
    const serialized = `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stringifyStable(value[key], seen)}`)
      .join(",")}}`;
    seen.delete(value);
    return serialized;
  }

  throw new TypeError("Cannot serialize non-JSON values.");
}

function readTimestamp(now: () => Date | string): string {
  const value = now();
  const timestamp = value instanceof Date ? value.toISOString() : value;
  if (typeof timestamp !== "string" || Number.isNaN(Date.parse(timestamp))) {
    throw new TypeError("Workspace session snapshot timestamp source returned an invalid timestamp.");
  }

  return timestamp;
}

function optionalFields<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) =>
      value !== undefined &&
      (!Array.isArray(value) || value.length > 0),
    ),
  ) as T;
}

function normalizeBasePath(path: string): string {
  const trimmed = path.trim();
  if (trimmed.length === 0 || trimmed === "/") {
    return "";
  }

  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const collapsed = withSlash.replace(/\/+/g, "/");

  return collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed;
}

function joinPath(basePath: string, suffix: string): string {
  const normalizedSuffix = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `${basePath}${normalizedSuffix}`;
}

function readTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isRecord(value: unknown): value is JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
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
