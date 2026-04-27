import { createHash } from "node:crypto";

import type {
  ApiResponse,
  ApiRoute,
  ApiRouter,
} from "./router.ts";
import { jsonError, jsonResponse } from "./router.ts";
import { WORKSPACE_SESSION_API_SCHEMA_VERSION } from "./workspaceSessionRoutes.ts";
import {
  WORKSPACE_SESSION_STORE_SCHEMA_VERSION,
  type WorkspaceSessionSnapshotPreviewResponse,
  type WorkspaceSessionSnapshotRecord,
} from "./workspaceSessionStoreRoutes.ts";

export const WORKSPACE_SESSION_SNAPSHOT_REVIEW_SCHEMA_VERSION =
  "workspace-session-snapshot-review/v1";
export const DEFAULT_WORKSPACE_SESSION_SNAPSHOT_REVIEW_ROUTE_BASE_PATH =
  "/v1/workspace-session/snapshot-review";

export interface WorkspaceSessionSnapshotReviewRoutesOptions {
  readonly basePath?: string;
}

export interface WorkspaceSessionSnapshotReviewBoundarySummary {
  readonly fingerprint: string;
  readonly snapshotId?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly workspaceId: string;
  readonly deviceId: string;
  readonly sessionId: string;
  readonly operations: readonly string[];
  readonly auditActions: readonly string[];
  readonly eventCount: number;
  readonly auditRecordCount: number;
}

export interface WorkspaceSessionSnapshotReviewComparableEvent {
  readonly key: string;
  readonly eventId: string;
  readonly operation: string;
  readonly sequence?: number;
  readonly createdAt?: string;
  readonly fingerprint: string;
}

export interface WorkspaceSessionSnapshotReviewComparableAuditRecord {
  readonly key: string;
  readonly auditId: string;
  readonly action: string;
  readonly createdAt?: string;
  readonly fingerprint: string;
}

export interface WorkspaceSessionSnapshotReviewChangedItem<TItem> {
  readonly key: string;
  readonly baseline: TItem;
  readonly candidate: TItem;
}

export interface WorkspaceSessionSnapshotCompareResponse {
  readonly kind: "workspace-session.snapshot-review.compare";
  readonly schemaVersion: typeof WORKSPACE_SESSION_SNAPSHOT_REVIEW_SCHEMA_VERSION;
  readonly storeSchemaVersion: typeof WORKSPACE_SESSION_STORE_SCHEMA_VERSION;
  readonly apiSchemaVersion: typeof WORKSPACE_SESSION_API_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly durableWrites: false;
  readonly redacted: true;
  readonly fingerprint: string;
  readonly equivalent: boolean;
  readonly baseline: WorkspaceSessionSnapshotReviewBoundarySummary;
  readonly candidate: WorkspaceSessionSnapshotReviewBoundarySummary;
  readonly summary: {
    readonly fingerprintMatch: boolean;
    readonly workspaceMatch: boolean;
    readonly deviceMatch: boolean;
    readonly sessionMatch: boolean;
    readonly baselineEventCount: number;
    readonly candidateEventCount: number;
    readonly unchangedEventCount: number;
    readonly addedEventCount: number;
    readonly removedEventCount: number;
    readonly changedEventCount: number;
    readonly baselineAuditRecordCount: number;
    readonly candidateAuditRecordCount: number;
    readonly unchangedAuditRecordCount: number;
    readonly addedAuditRecordCount: number;
    readonly removedAuditRecordCount: number;
    readonly changedAuditRecordCount: number;
  };
  readonly differences: {
    readonly events: {
      readonly added: readonly WorkspaceSessionSnapshotReviewComparableEvent[];
      readonly removed: readonly WorkspaceSessionSnapshotReviewComparableEvent[];
      readonly changed: readonly WorkspaceSessionSnapshotReviewChangedItem<
        WorkspaceSessionSnapshotReviewComparableEvent
      >[];
    };
    readonly auditRecords: {
      readonly added: readonly WorkspaceSessionSnapshotReviewComparableAuditRecord[];
      readonly removed: readonly WorkspaceSessionSnapshotReviewComparableAuditRecord[];
      readonly changed: readonly WorkspaceSessionSnapshotReviewChangedItem<
        WorkspaceSessionSnapshotReviewComparableAuditRecord
      >[];
    };
  };
}

export interface WorkspaceSessionSnapshotRetentionPolicy {
  readonly retainNewest?: number;
  readonly retainSnapshotIds: readonly string[];
  readonly deleteBefore?: string;
}

export interface WorkspaceSessionSnapshotRetentionDecision {
  readonly snapshotId: string;
  readonly fingerprint: string;
  readonly snapshotFingerprint: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly workspaceId: string;
  readonly deviceId: string;
  readonly sessionId: string;
  readonly eventCount: number;
  readonly auditRecordCount: number;
  readonly newestRank: number;
  readonly retain: boolean;
  readonly plannedAction: "retain" | "expire";
  readonly reasonCodes: readonly string[];
}

export interface WorkspaceSessionSnapshotRetentionPreviewResponse {
  readonly kind: "workspace-session.snapshot-review.retention-preview";
  readonly schemaVersion: typeof WORKSPACE_SESSION_SNAPSHOT_REVIEW_SCHEMA_VERSION;
  readonly storeSchemaVersion: typeof WORKSPACE_SESSION_STORE_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly durableWrites: false;
  readonly redacted: true;
  readonly fingerprint: string;
  readonly policy: WorkspaceSessionSnapshotRetentionPolicy;
  readonly summary: {
    readonly totalSnapshotCount: number;
    readonly retainedSnapshotCount: number;
    readonly expiredSnapshotCount: number;
    readonly pinnedSnapshotCount: number;
  };
  readonly snapshots: readonly WorkspaceSessionSnapshotRetentionDecision[];
}

type Parsed<TValue> = { ok: true; value: TValue } | { ok: false; error: ApiResponse };
type JsonRecord = Record<string, unknown>;

interface ParsedCompareRequest {
  readonly baseline: NormalizedSnapshotBoundary;
  readonly candidate: NormalizedSnapshotBoundary;
}

interface ParsedRetentionPreviewRequest {
  readonly snapshots: readonly NormalizedSnapshotBoundary[];
  readonly policy: WorkspaceSessionSnapshotRetentionPolicy;
}

interface NormalizedSnapshotBoundary {
  readonly preview: WorkspaceSessionSnapshotPreviewResponse;
  readonly record?: WorkspaceSessionSnapshotRecord;
}

const COMPARE_BODY_KEYS = ["baseline", "candidate"] as const;
const RETENTION_PREVIEW_BODY_KEYS = ["snapshots", "policy"] as const;
const RETENTION_POLICY_KEYS = ["retainNewest", "retainSnapshotIds", "deleteBefore"] as const;
const SNAPSHOT_RECORD_KEYS = [
  "kind",
  "schemaVersion",
  "localOnly",
  "durableWrites",
  "redacted",
  "snapshotId",
  "label",
  "metadata",
  "createdAt",
  "updatedAt",
  "fingerprint",
  "snapshotFingerprint",
  "snapshot",
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
const SNAPSHOT_SUMMARY_KEYS = [
  "kind",
  "localOnly",
  "redacted",
  "workspaceId",
  "deviceId",
  "sessionId",
  "operations",
  "eventCount",
  "eventIds",
  "auditRecordCount",
  "auditIds",
  "auditActions",
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
const SNAPSHOT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256_FINGERPRINT_PATTERN = /^sha256:[a-f0-9]{64}$/;
const REDACTED_STORAGE_PATTERN = /^\[redacted:path:[a-z0-9]+\]$/;
const REDACTED_LOCK_TOKEN_PATTERN = /^\[redacted:lockToken:[a-z0-9]+\]$/;
const SENSITIVE_FIELD_PATTERN =
  /(?:authorization|api[-_]?key|apikey|auth|bearer|cookie|credential|jwt|password|passphrase|private[-_]?key|refresh[-_]?token|secret|session[-_]?token|signing[-_]?key|token)$/i;
const SECRET_VALUE_PATTERN =
  /\b(?:Bearer\s+[A-Za-z0-9._~+/=-]{8,}|(?:sk|rk|pk|tok|pat|npm|ghp|gho)_[A-Za-z0-9_-]{8,}|(?:sk|rk|pat|glpat|github_pat)-[A-Za-z0-9_-]{8,})\b/i;
const SECRET_ASSIGNMENT_PATTERN =
  /\b(?:api[-_]?key|apikey|authorization|credential|password|passphrase|secret|session[-_]?token|token)\s*[:=]\s*([^\s,;]+)/i;
const RAW_LOCAL_PATH_PATTERN =
  /(?:\b[A-Za-z]:[\\/][^\s"',;)}\]]+|\\\\[^\\\s"',;)}\]]+[\\][^\s"',;)}\]]+|\b(?:\/Users|\/home|\/var|\/tmp|\/private|\/mnt|\/Volumes)\/[^\s"',;)}\]]+)/;
const MAX_RETENTION_SNAPSHOTS = 500;

export function createWorkspaceSessionSnapshotReviewRoutes(
  options: WorkspaceSessionSnapshotReviewRoutesOptions = {},
): readonly ApiRoute[] {
  const basePath = normalizeBasePath(
    options.basePath ?? DEFAULT_WORKSPACE_SESSION_SNAPSHOT_REVIEW_ROUTE_BASE_PATH,
  );

  return Object.freeze([
    {
      method: "POST",
      path: joinPath(basePath, "/compare"),
      description: "Compares two redacted local workspace session snapshots without writing state.",
      handler: ({ request }) => {
        const parsed = parseCompareRequest(request.body);
        if (!parsed.ok) {
          return parsed.error;
        }

        return jsonResponse(200, compareSnapshots(parsed.value));
      },
    },
    {
      method: "POST",
      path: joinPath(basePath, "/retention-preview"),
      description: "Previews local workspace session snapshot retention decisions without writing state.",
      handler: ({ request }) => {
        const parsed = parseRetentionPreviewRequest(request.body);
        if (!parsed.ok) {
          return parsed.error;
        }

        return jsonResponse(200, previewRetention(parsed.value));
      },
    },
  ]);
}

export function mountWorkspaceSessionSnapshotReviewRoutes(
  router: ApiRouter,
  options: WorkspaceSessionSnapshotReviewRoutesOptions = {},
): ApiRouter {
  for (const route of createWorkspaceSessionSnapshotReviewRoutes(options)) {
    router.register(route);
  }

  return router;
}

function parseCompareRequest(body: unknown): Parsed<ParsedCompareRequest> {
  const parsedBody = parseRequiredRequestBody(body);
  if (!parsedBody.ok) {
    return parsedBody;
  }

  const keys = allowedKeys(parsedBody.value, COMPARE_BODY_KEYS, "body");
  if (!keys.ok) {
    return keys;
  }

  const unsafe = validateNoUnsafeRetention(parsedBody.value, "body");
  if (!unsafe.ok) {
    return unsafe;
  }

  const baseline = normalizeSnapshotBoundary(parsedBody.value.baseline, "body.baseline");
  if (!baseline.ok) {
    return baseline;
  }

  const candidate = normalizeSnapshotBoundary(parsedBody.value.candidate, "body.candidate");
  if (!candidate.ok) {
    return candidate;
  }

  return {
    ok: true,
    value: {
      baseline: baseline.value,
      candidate: candidate.value,
    },
  };
}

function parseRetentionPreviewRequest(body: unknown): Parsed<ParsedRetentionPreviewRequest> {
  const parsedBody = parseRequiredRequestBody(body);
  if (!parsedBody.ok) {
    return parsedBody;
  }

  const keys = allowedKeys(parsedBody.value, RETENTION_PREVIEW_BODY_KEYS, "body");
  if (!keys.ok) {
    return keys;
  }

  const unsafe = validateNoUnsafeRetention(parsedBody.value, "body");
  if (!unsafe.ok) {
    return unsafe;
  }

  if (!Array.isArray(parsedBody.value.snapshots)) {
    return validationFailure("Snapshots must be an array of stored snapshot records.", {
      path: "body.snapshots",
    });
  }
  if (parsedBody.value.snapshots.length > MAX_RETENTION_SNAPSHOTS) {
    return validationFailure(`Snapshots must include at most ${MAX_RETENTION_SNAPSHOTS} records.`, {
      path: "body.snapshots",
    });
  }

  const snapshots: NormalizedSnapshotBoundary[] = [];
  const seenSnapshotIds = new Set<string>();
  for (const [index, item] of parsedBody.value.snapshots.entries()) {
    const path = `body.snapshots.${index}`;
    const normalized = normalizeSnapshotRecordBoundary(item, path);
    if (!normalized.ok) {
      return normalized;
    }

    const snapshotId = normalized.value.record.snapshotId;
    if (seenSnapshotIds.has(snapshotId)) {
      return validationFailure("Snapshots must not include duplicate snapshot ids.", {
        path: `${path}.snapshotId`,
      });
    }
    seenSnapshotIds.add(snapshotId);
    snapshots.push(normalized.value);
  }

  const policy = parseRetentionPolicy(parsedBody.value.policy, "body.policy");
  if (!policy.ok) {
    return policy;
  }

  return {
    ok: true,
    value: {
      snapshots: Object.freeze(snapshots),
      policy: policy.value,
    },
  };
}

function parseRetentionPolicy(
  value: unknown,
  path: string,
): Parsed<WorkspaceSessionSnapshotRetentionPolicy> {
  if (value === undefined) {
    return {
      ok: true,
      value: deepFreeze({
        retainSnapshotIds: [],
      }),
    };
  }
  if (!isRecord(value)) {
    return validationFailure("Retention policy must be an object.", { path });
  }

  const keys = allowedKeys(value, RETENTION_POLICY_KEYS, path);
  if (!keys.ok) {
    return keys;
  }

  const retainNewest = parseOptionalIntegerInRange(
    value.retainNewest,
    `${path}.retainNewest`,
    0,
    MAX_RETENTION_SNAPSHOTS,
  );
  if (!retainNewest.ok) {
    return retainNewest;
  }

  const retainSnapshotIds = parseOptionalSnapshotIdArray(
    value.retainSnapshotIds,
    `${path}.retainSnapshotIds`,
  );
  if (!retainSnapshotIds.ok) {
    return retainSnapshotIds;
  }

  const deleteBefore = parseOptionalTimestamp(value.deleteBefore, `${path}.deleteBefore`);
  if (!deleteBefore.ok) {
    return deleteBefore;
  }

  return {
    ok: true,
    value: deepFreeze({
      ...(retainNewest.value === undefined ? {} : { retainNewest: retainNewest.value }),
      retainSnapshotIds: retainSnapshotIds.value ?? [],
      ...(deleteBefore.value === undefined ? {} : { deleteBefore: deleteBefore.value }),
    } satisfies WorkspaceSessionSnapshotRetentionPolicy),
  };
}

function compareSnapshots(
  request: ParsedCompareRequest,
): WorkspaceSessionSnapshotCompareResponse {
  const baselineEvents = createEventMap(request.baseline.preview);
  const candidateEvents = createEventMap(request.candidate.preview);
  const eventDiff = compareMaps(baselineEvents, candidateEvents);
  const baselineAuditRecords = createAuditRecordMap(request.baseline.preview);
  const candidateAuditRecords = createAuditRecordMap(request.candidate.preview);
  const auditDiff = compareMaps(baselineAuditRecords, candidateAuditRecords);
  const baselineSummary = summarizeBoundary(request.baseline);
  const candidateSummary = summarizeBoundary(request.candidate);
  const fingerprintMatch = baselineSummary.fingerprint === candidateSummary.fingerprint;
  const workspaceMatch = baselineSummary.workspaceId === candidateSummary.workspaceId;
  const deviceMatch = baselineSummary.deviceId === candidateSummary.deviceId;
  const sessionMatch = baselineSummary.sessionId === candidateSummary.sessionId;
  const equivalent =
    fingerprintMatch &&
    eventDiff.added.length === 0 &&
    eventDiff.removed.length === 0 &&
    eventDiff.changed.length === 0 &&
    auditDiff.added.length === 0 &&
    auditDiff.removed.length === 0 &&
    auditDiff.changed.length === 0;
  const responseWithoutFingerprint = {
    kind: "workspace-session.snapshot-review.compare" as const,
    schemaVersion: WORKSPACE_SESSION_SNAPSHOT_REVIEW_SCHEMA_VERSION,
    storeSchemaVersion: WORKSPACE_SESSION_STORE_SCHEMA_VERSION,
    apiSchemaVersion: WORKSPACE_SESSION_API_SCHEMA_VERSION,
    localOnly: true as const,
    durableWrites: false as const,
    redacted: true as const,
    equivalent,
    baseline: baselineSummary,
    candidate: candidateSummary,
    summary: {
      fingerprintMatch,
      workspaceMatch,
      deviceMatch,
      sessionMatch,
      baselineEventCount: baselineEvents.size,
      candidateEventCount: candidateEvents.size,
      unchangedEventCount: eventDiff.unchangedCount,
      addedEventCount: eventDiff.added.length,
      removedEventCount: eventDiff.removed.length,
      changedEventCount: eventDiff.changed.length,
      baselineAuditRecordCount: baselineAuditRecords.size,
      candidateAuditRecordCount: candidateAuditRecords.size,
      unchangedAuditRecordCount: auditDiff.unchangedCount,
      addedAuditRecordCount: auditDiff.added.length,
      removedAuditRecordCount: auditDiff.removed.length,
      changedAuditRecordCount: auditDiff.changed.length,
    },
    differences: {
      events: {
        added: eventDiff.added,
        removed: eventDiff.removed,
        changed: eventDiff.changed,
      },
      auditRecords: {
        added: auditDiff.added,
        removed: auditDiff.removed,
        changed: auditDiff.changed,
      },
    },
  };

  return deepFreeze({
    ...responseWithoutFingerprint,
    fingerprint: fingerprintValue(responseWithoutFingerprint),
  } satisfies WorkspaceSessionSnapshotCompareResponse);
}

function previewRetention(
  request: ParsedRetentionPreviewRequest,
): WorkspaceSessionSnapshotRetentionPreviewResponse {
  const orderedByNewest = [...request.snapshots].sort(compareBoundariesByNewest);
  const newestRanks = new Map(
    orderedByNewest.map((snapshot, index) => [
      snapshot.record?.snapshotId ?? snapshot.preview.fingerprint,
      index + 1,
    ]),
  );
  const retainSnapshotIds = new Set(request.policy.retainSnapshotIds);
  const decisions = request.snapshots
    .map((snapshot) =>
      retentionDecision(snapshot, request.policy, retainSnapshotIds, newestRanks)
    )
    .sort(compareRetentionDecisions);
  const retainedSnapshotCount = decisions.filter((decision) => decision.retain).length;
  const responseWithoutFingerprint = {
    kind: "workspace-session.snapshot-review.retention-preview" as const,
    schemaVersion: WORKSPACE_SESSION_SNAPSHOT_REVIEW_SCHEMA_VERSION,
    storeSchemaVersion: WORKSPACE_SESSION_STORE_SCHEMA_VERSION,
    localOnly: true as const,
    durableWrites: false as const,
    redacted: true as const,
    policy: request.policy,
    summary: {
      totalSnapshotCount: decisions.length,
      retainedSnapshotCount,
      expiredSnapshotCount: decisions.length - retainedSnapshotCount,
      pinnedSnapshotCount: request.policy.retainSnapshotIds.length,
    },
    snapshots: decisions,
  };

  return deepFreeze({
    ...responseWithoutFingerprint,
    fingerprint: fingerprintValue(responseWithoutFingerprint),
  } satisfies WorkspaceSessionSnapshotRetentionPreviewResponse);
}

function retentionDecision(
  snapshot: NormalizedSnapshotBoundary,
  policy: WorkspaceSessionSnapshotRetentionPolicy,
  retainSnapshotIds: ReadonlySet<string>,
  newestRanks: ReadonlyMap<string, number>,
): WorkspaceSessionSnapshotRetentionDecision {
  const record = snapshot.record as WorkspaceSessionSnapshotRecord;
  const rank = newestRanks.get(record.snapshotId) ?? 0;
  const pinned = retainSnapshotIds.has(record.snapshotId);
  const reasonCodes: string[] = [];

  if (pinned) {
    reasonCodes.push("explicitly-retained");
  } else {
    if (
      policy.deleteBefore !== undefined &&
      Date.parse(record.createdAt) < Date.parse(policy.deleteBefore)
    ) {
      reasonCodes.push("older-than-delete-before");
    }
    if (policy.retainNewest !== undefined && rank > policy.retainNewest) {
      reasonCodes.push("outside-retain-newest");
    }
  }

  const retain = pinned || reasonCodes.length === 0;
  if (retain && reasonCodes.length === 0) {
    reasonCodes.push("within-retention-policy");
  }

  return deepFreeze({
    snapshotId: record.snapshotId,
    fingerprint: record.fingerprint,
    snapshotFingerprint: record.snapshotFingerprint,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    workspaceId: snapshot.preview.summary.workspaceId,
    deviceId: snapshot.preview.summary.deviceId,
    sessionId: snapshot.preview.summary.sessionId,
    eventCount: snapshot.preview.summary.eventCount,
    auditRecordCount: snapshot.preview.summary.auditRecordCount,
    newestRank: rank,
    retain,
    plannedAction: retain ? "retain" : "expire",
    reasonCodes: Object.freeze(reasonCodes),
  });
}

function normalizeSnapshotBoundary(
  value: unknown,
  path: string,
): Parsed<NormalizedSnapshotBoundary> {
  const record = normalizeSnapshotRecord(value, path);
  if (record.ok) {
    return {
      ok: true,
      value: deepFreeze({
        preview: record.value.snapshot,
        record: record.value,
      }),
    };
  }
  if (isRecord(value) && value.kind === "workspace-session.snapshot-record") {
    return record;
  }

  const preview = normalizeSnapshotPreview(value, path);
  if (preview.ok) {
    return {
      ok: true,
      value: deepFreeze({ preview: preview.value }),
    };
  }
  if (isRecord(value) && value.kind === "workspace-session.snapshot-preview") {
    return preview;
  }

  if (isRecord(value) && value.record !== undefined) {
    return normalizeSnapshotBoundary(value.record, `${path}.record`);
  }
  if (isRecord(value) && value.preview !== undefined) {
    return normalizeSnapshotBoundary(value.preview, `${path}.preview`);
  }
  if (isRecord(value) && value.snapshot !== undefined) {
    return normalizeSnapshotBoundary(value.snapshot, `${path}.snapshot`);
  }

  return validationFailure(
    "Snapshot boundary must be a workspace session snapshot preview or record.",
    { path },
  );
}

function normalizeSnapshotRecordBoundary(
  value: unknown,
  path: string,
): Parsed<NormalizedSnapshotBoundary & { readonly record: WorkspaceSessionSnapshotRecord }> {
  const normalized = normalizeSnapshotRecord(value, path);
  if (!normalized.ok) {
    return normalized;
  }

  return {
    ok: true,
    value: deepFreeze({
      preview: normalized.value.snapshot,
      record: normalized.value,
    }),
  };
}

function normalizeSnapshotRecord(
  value: unknown,
  path: string,
): Parsed<WorkspaceSessionSnapshotRecord> {
  if (!isRecord(value)) {
    return validationFailure("Workspace session snapshot record must be an object.", { path });
  }
  if (value.kind !== "workspace-session.snapshot-record") {
    return validationFailure("Workspace session snapshot record kind is unsupported.", {
      path: `${path}.kind`,
    });
  }

  const keys = allowedKeys(value, SNAPSHOT_RECORD_KEYS, path);
  if (!keys.ok) {
    return keys;
  }
  if (value.schemaVersion !== WORKSPACE_SESSION_STORE_SCHEMA_VERSION) {
    return validationFailure("Workspace session snapshot record schema version is unsupported.", {
      path: `${path}.schemaVersion`,
    });
  }
  if (value.localOnly !== true || value.durableWrites !== false || value.redacted !== true) {
    return validationFailure("Workspace session snapshot record must be local-only and redacted.", {
      path,
    });
  }

  const snapshotId = parseSnapshotId(value.snapshotId, `${path}.snapshotId`);
  if (!snapshotId.ok) {
    return snapshotId;
  }
  const createdAt = parseRequiredTimestamp(value.createdAt, `${path}.createdAt`);
  if (!createdAt.ok) {
    return createdAt;
  }
  const updatedAt = parseRequiredTimestamp(value.updatedAt, `${path}.updatedAt`);
  if (!updatedAt.ok) {
    return updatedAt;
  }
  if (Date.parse(updatedAt.value) < Date.parse(createdAt.value)) {
    return validationFailure("updatedAt must be after or equal to createdAt.", {
      path: `${path}.updatedAt`,
    });
  }
  const fingerprint = parseFingerprint(value.fingerprint, `${path}.fingerprint`);
  if (!fingerprint.ok) {
    return fingerprint;
  }
  const snapshotFingerprint = parseFingerprint(
    value.snapshotFingerprint,
    `${path}.snapshotFingerprint`,
  );
  if (!snapshotFingerprint.ok) {
    return snapshotFingerprint;
  }
  const snapshot = normalizeSnapshotPreview(value.snapshot, `${path}.snapshot`);
  if (!snapshot.ok) {
    return snapshot;
  }
  if (snapshot.value.fingerprint !== snapshotFingerprint.value) {
    return validationFailure("snapshotFingerprint must match snapshot fingerprint.", {
      path: `${path}.snapshotFingerprint`,
    });
  }

  return { ok: true, value: deepFreeze(value) as WorkspaceSessionSnapshotRecord };
}

function normalizeSnapshotPreview(
  value: unknown,
  path: string,
): Parsed<WorkspaceSessionSnapshotPreviewResponse> {
  if (!isRecord(value)) {
    return validationFailure("Workspace session snapshot preview must be an object.", { path });
  }
  if (value.kind !== "workspace-session.snapshot-preview") {
    return validationFailure("Workspace session snapshot preview kind is unsupported.", {
      path: `${path}.kind`,
    });
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

  const summary = validateSnapshotSummary(value.summary, `${path}.summary`);
  if (!summary.ok) {
    return summary;
  }
  const auditPreview = validateAuditPreview(value.auditPreview, `${path}.auditPreview`);
  if (!auditPreview.ok) {
    return auditPreview;
  }

  return { ok: true, value: deepFreeze(value) as WorkspaceSessionSnapshotPreviewResponse };
}

function validateSnapshotSummary(value: unknown, path: string): Parsed<undefined> {
  if (!isRecord(value)) {
    return validationFailure("Workspace session snapshot summary must be an object.", { path });
  }

  const keys = allowedKeys(value, SNAPSHOT_SUMMARY_KEYS, path);
  if (!keys.ok) {
    return keys;
  }
  if (value.kind !== "workspace-session.snapshot-summary") {
    return validationFailure("Workspace session snapshot summary kind is unsupported.", {
      path: `${path}.kind`,
    });
  }
  if (value.localOnly !== true || value.redacted !== true) {
    return validationFailure("Workspace session snapshot summary must be local-only and redacted.", {
      path,
    });
  }

  for (const key of ["workspaceId", "deviceId", "sessionId"] as const) {
    const parsed = parseRequiredString(value[key], `${path}.${key}`);
    if (!parsed.ok) {
      return parsed;
    }
  }

  const operations = parseRequiredStringArray(value.operations, `${path}.operations`);
  if (!operations.ok) {
    return operations;
  }
  const eventCount = parseRequiredIntegerInRange(value.eventCount, `${path}.eventCount`, 0);
  if (!eventCount.ok) {
    return eventCount;
  }
  const eventIds = parseRequiredStringArray(value.eventIds, `${path}.eventIds`);
  if (!eventIds.ok) {
    return eventIds;
  }
  const auditRecordCount = parseRequiredIntegerInRange(
    value.auditRecordCount,
    `${path}.auditRecordCount`,
    0,
  );
  if (!auditRecordCount.ok) {
    return auditRecordCount;
  }
  const auditIds = parseRequiredStringArray(value.auditIds, `${path}.auditIds`);
  if (!auditIds.ok) {
    return auditIds;
  }
  const auditActions = parseRequiredStringArray(value.auditActions, `${path}.auditActions`);
  if (!auditActions.ok) {
    return auditActions;
  }

  if (operations.value.length !== eventCount.value || eventIds.value.length !== eventCount.value) {
    return validationFailure("eventCount must match operations and eventIds length.", {
      path: `${path}.eventCount`,
    });
  }
  if (
    auditIds.value.length !== auditRecordCount.value ||
    auditActions.value.length !== auditRecordCount.value
  ) {
    return validationFailure("auditRecordCount must match auditIds and auditActions length.", {
      path: `${path}.auditRecordCount`,
    });
  }

  return { ok: true, value: undefined };
}

function validateAuditPreview(value: unknown, path: string): Parsed<undefined> {
  if (!isRecord(value)) {
    return validationFailure("Workspace session audit preview must be an object.", { path });
  }

  const keys = allowedKeys(value, AUDIT_PREVIEW_KEYS, path);
  if (!keys.ok) {
    return keys;
  }
  if (value.kind !== "workspace-session.audit-preview") {
    return validationFailure("Workspace session audit preview kind is unsupported.", {
      path: `${path}.kind`,
    });
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

  return { ok: true, value: undefined };
}

function validateAuditPreviewSummary(value: unknown, path: string): Parsed<undefined> {
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

function validateAuditPreviewEvents(value: unknown, path: string): Parsed<undefined> {
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
    const eventId = parseRequiredString(event.eventId, `${itemPath}.eventId`);
    if (!eventId.ok) {
      return eventId;
    }
    if (!isRecord(event.payload)) {
      return validationFailure("Workspace session audit preview event payload must be an object.", {
        path: `${itemPath}.payload`,
      });
    }
    const operation = parseRequiredString(event.payload.operation, `${itemPath}.payload.operation`);
    if (!operation.ok) {
      return operation;
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

function validateAuditPreviewRecords(value: unknown, path: string): Parsed<undefined> {
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

function summarizeBoundary(
  boundary: NormalizedSnapshotBoundary,
): WorkspaceSessionSnapshotReviewBoundarySummary {
  const summary = boundary.preview.summary;

  return deepFreeze({
    fingerprint: boundary.preview.fingerprint,
    ...(boundary.record === undefined ? {} : {
      snapshotId: boundary.record.snapshotId,
      createdAt: boundary.record.createdAt,
      updatedAt: boundary.record.updatedAt,
    }),
    workspaceId: summary.workspaceId,
    deviceId: summary.deviceId,
    sessionId: summary.sessionId,
    operations: summary.operations,
    auditActions: summary.auditActions,
    eventCount: summary.eventCount,
    auditRecordCount: summary.auditRecordCount,
  } satisfies WorkspaceSessionSnapshotReviewBoundarySummary);
}

function createEventMap(
  preview: WorkspaceSessionSnapshotPreviewResponse,
): Map<string, WorkspaceSessionSnapshotReviewComparableEvent> {
  const map = new Map<string, WorkspaceSessionSnapshotReviewComparableEvent>();
  for (const event of preview.auditPreview.events as readonly JsonRecord[]) {
    const eventId = String(event.eventId);
    const payload = isRecord(event.payload) ? event.payload : {};
    const item = deepFreeze(optionalFields({
      key: `event:${eventId}`,
      eventId,
      operation: String(payload.operation),
      sequence: typeof event.sequence === "number" ? event.sequence : undefined,
      createdAt: typeof event.createdAt === "string" ? event.createdAt : undefined,
      fingerprint: fingerprintValue(event),
    }) as WorkspaceSessionSnapshotReviewComparableEvent);
    map.set(item.key, item);
  }

  return map;
}

function createAuditRecordMap(
  preview: WorkspaceSessionSnapshotPreviewResponse,
): Map<string, WorkspaceSessionSnapshotReviewComparableAuditRecord> {
  const map = new Map<string, WorkspaceSessionSnapshotReviewComparableAuditRecord>();
  for (const record of preview.auditPreview.audit.records as readonly JsonRecord[]) {
    const auditId = String(record.auditId);
    const item = deepFreeze(optionalFields({
      key: `audit:${auditId}`,
      auditId,
      action: String(record.action),
      createdAt: typeof record.createdAt === "string" ? record.createdAt : undefined,
      fingerprint: fingerprintValue(record),
    }) as WorkspaceSessionSnapshotReviewComparableAuditRecord);
    map.set(item.key, item);
  }

  return map;
}

function compareMaps<TItem extends { readonly key: string; readonly fingerprint: string }>(
  baseline: ReadonlyMap<string, TItem>,
  candidate: ReadonlyMap<string, TItem>,
): {
  readonly added: readonly TItem[];
  readonly removed: readonly TItem[];
  readonly changed: readonly WorkspaceSessionSnapshotReviewChangedItem<TItem>[];
  readonly unchangedCount: number;
} {
  const added: TItem[] = [];
  const removed: TItem[] = [];
  const changed: WorkspaceSessionSnapshotReviewChangedItem<TItem>[] = [];
  let unchangedCount = 0;

  for (const [key, candidateItem] of candidate) {
    const baselineItem = baseline.get(key);
    if (baselineItem === undefined) {
      added.push(candidateItem);
      continue;
    }
    if (baselineItem.fingerprint === candidateItem.fingerprint) {
      unchangedCount += 1;
      continue;
    }
    changed.push({ key, baseline: baselineItem, candidate: candidateItem });
  }

  for (const [key, baselineItem] of baseline) {
    if (!candidate.has(key)) {
      removed.push(baselineItem);
    }
  }

  return deepFreeze({
    added: added.sort(compareComparableItems),
    removed: removed.sort(compareComparableItems),
    changed: changed.sort((left, right) => left.key.localeCompare(right.key)),
    unchangedCount,
  });
}

function parseRequiredRequestBody(body: unknown): Parsed<JsonRecord> {
  const json = cloneJsonCompatibleValue(body, "body");
  if (!json.ok) {
    return json;
  }
  if (!isRecord(json.value)) {
    return validationFailure("Request body must be an object.", { path: "body" });
  }

  return { ok: true, value: json.value };
}

function validateNoUnsafeRetention(
  value: unknown,
  path: string,
  keyHint = "",
): Parsed<undefined> {
  if (typeof value === "string") {
    const reason = unsafeRetentionReason(value, keyHint);
    if (reason !== undefined) {
      return validationFailure("Workspace session snapshot review input must not retain raw secrets or raw local paths.", {
        path,
        reason,
      });
    }
    return { ok: true, value: undefined };
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const nested = validateNoUnsafeRetention(item, `${path}.${index}`, keyHint);
      if (!nested.ok) {
        return nested;
      }
    }
    return { ok: true, value: undefined };
  }

  if (isRecord(value)) {
    for (const [key, nested] of Object.entries(value)) {
      const token = normalizeToken(key);
      if (isRawRetentionFlag(token, nested)) {
        return validationFailure(
          "Workspace session snapshot review input must not retain raw secrets or raw local paths.",
          { path: `${path}.${key}`, reason: "raw_retention_flag" },
        );
      }

      const result = validateNoUnsafeRetention(nested, `${path}.${key}`, key);
      if (!result.ok) {
        return result;
      }
    }
  }

  return { ok: true, value: undefined };
}

function unsafeRetentionReason(value: string, keyHint: string): string | undefined {
  if (isRedactedToken(value) || normalizeToken(keyHint).includes("fingerprint")) {
    return undefined;
  }
  if (SENSITIVE_FIELD_PATTERN.test(keyHint)) {
    return "raw_secret";
  }
  const assignedSecret = SECRET_ASSIGNMENT_PATTERN.exec(value);
  if (
    assignedSecret !== null &&
    !isRedactedToken(assignedSecret[1])
  ) {
    return "raw_secret";
  }
  if (SECRET_VALUE_PATTERN.test(value)) {
    return "raw_secret";
  }
  if (RAW_LOCAL_PATH_PATTERN.test(value)) {
    return "raw_local_path";
  }

  return undefined;
}

function isRawRetentionFlag(key: string, value: unknown): boolean {
  if (value === true) {
    return (
      key === "raw_body_stored" ||
      key === "raw_body_retained" ||
      key === "raw_request_body_stored" ||
      key === "raw_response_body_stored" ||
      key === "raw_paths_stored" ||
      key === "raw_storage_paths_stored" ||
      key === "raw_lock_material_stored" ||
      key === "raw_secrets_stored" ||
      key === "stores_raw_body"
    );
  }

  return (
    value === false &&
    (key === "storage_path_redacted" ||
      key === "storage_paths_redacted" ||
      key === "lock_material_redacted" ||
      key === "body_redacted")
  );
}

function isRedactedToken(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed === "[REDACTED]" ||
    /^\[redacted(?::[A-Za-z0-9_-]+)*\]$/.test(trimmed) ||
    trimmed === "[redacted-path]" ||
    trimmed === "[redacted-secret]"
  );
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

  return { ok: true, value: Object.freeze([...new Set(parsed.value)].sort()) };
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

function parseRequiredTimestamp(value: unknown, path: string): Parsed<string> {
  const parsed = parseRequiredString(value, path);
  if (!parsed.ok) {
    return parsed;
  }
  if (Number.isNaN(Date.parse(parsed.value))) {
    return validationFailure("Value must be a valid timestamp.", { path });
  }

  return parsed;
}

function parseOptionalTimestamp(value: unknown, path: string): Parsed<string | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  return parseRequiredTimestamp(value, path);
}

function parseRequiredString(value: unknown, path: string): Parsed<string> {
  const parsed = readTrimmedString(value);
  if (parsed === undefined) {
    return validationFailure("Value must be a non-empty string.", { path });
  }

  return { ok: true, value: parsed };
}

function parseRequiredStringArray(value: unknown, path: string): Parsed<readonly string[]> {
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

function parseOptionalStringArray(
  value: unknown,
  path: string,
): Parsed<readonly string[] | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  return parseRequiredStringArray(value, path);
}

function parseRequiredIntegerInRange(
  value: unknown,
  path: string,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): Parsed<number> {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) {
    return validationFailure(`Value must be a safe integer between ${min} and ${max}.`, {
      path,
    });
  }

  return { ok: true, value: Number(value) };
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

  return parseRequiredIntegerInRange(value, path, min, max);
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

function compareComparableItems<TItem extends { readonly key: string }>(
  left: TItem,
  right: TItem,
): number {
  return left.key.localeCompare(right.key);
}

function compareBoundariesByNewest(
  left: NormalizedSnapshotBoundary,
  right: NormalizedSnapshotBoundary,
): number {
  const leftRecord = left.record as WorkspaceSessionSnapshotRecord;
  const rightRecord = right.record as WorkspaceSessionSnapshotRecord;

  return (
    rightRecord.createdAt.localeCompare(leftRecord.createdAt) ||
    rightRecord.updatedAt.localeCompare(leftRecord.updatedAt) ||
    leftRecord.snapshotId.localeCompare(rightRecord.snapshotId)
  );
}

function compareRetentionDecisions(
  left: WorkspaceSessionSnapshotRetentionDecision,
  right: WorkspaceSessionSnapshotRetentionDecision,
): number {
  return (
    left.newestRank - right.newestRank ||
    left.snapshotId.localeCompare(right.snapshotId)
  );
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

function normalizeToken(value: string | undefined): string {
  return value === undefined
    ? ""
    : value
      .trim()
      .replace(/([a-z])([A-Z])/g, "$1_$2")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
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
