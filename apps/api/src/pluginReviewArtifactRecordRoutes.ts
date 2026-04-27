import { createHash } from "node:crypto";

import type { PluginReviewArtifact } from "../../../packages/plugin-sdk/src/index.ts";
import {
  createPluginReviewArtifactRoutes,
  type PluginReviewArtifactPreviewResponse,
} from "./pluginReviewArtifactRoutes.ts";
import type {
  ApiResponse,
  ApiRoute,
  ApiRouter,
} from "./router.ts";
import { createApiRouter, jsonError, jsonResponse } from "./router.ts";

export const PLUGIN_REVIEW_ARTIFACT_RECORD_SCHEMA_VERSION =
  "plugin-review-artifact-record/v1";

export interface PluginReviewArtifactRecordRoutesOptions {
  readonly basePath?: string;
  readonly now?: () => Date | string;
  readonly store?: PluginReviewArtifactRecordStore;
}

export interface PluginReviewArtifactRecordStore {
  create(record: PluginReviewArtifactRecord): PluginReviewArtifactRecordCreateResult;
  get(recordId: string): PluginReviewArtifactRecord | undefined;
  list(): readonly PluginReviewArtifactRecord[];
}

export interface PluginReviewArtifactRecordStoreOptions {
  readonly records?: readonly PluginReviewArtifactRecord[];
}

export interface PluginReviewArtifactRecord {
  readonly kind: "plugin-review-artifact.record";
  readonly schemaVersion: typeof PLUGIN_REVIEW_ARTIFACT_RECORD_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly redacted: true;
  readonly recordId: string;
  readonly label?: string;
  readonly metadata?: JsonRecord;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly fingerprint: string;
  readonly baselineFingerprint: string;
  readonly baseline: PluginReviewArtifactPreviewResponse;
}

export interface PluginReviewArtifactRecordSummary {
  readonly recordId: string;
  readonly label?: string;
  readonly metadata?: JsonRecord;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly fingerprint: string;
  readonly baselineFingerprint: string;
  readonly reviewId: string;
  readonly pluginId: string;
  readonly pluginName: string;
  readonly pluginVersion: string;
  readonly decision: PluginReviewArtifact["decision"];
  readonly evidenceCount: number;
  readonly approvalGateCount: number;
  readonly requiredApprovalGateCount: number;
  readonly pendingApprovalGateCount: number;
  readonly deniedApprovalGateCount: number;
  readonly missingCapabilityCount: number;
  readonly deniedHostApiCount: number;
}

export interface PluginReviewArtifactRecordCreateResponse {
  readonly kind: "plugin-review-artifact.record.created";
  readonly schemaVersion: typeof PLUGIN_REVIEW_ARTIFACT_RECORD_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly record: PluginReviewArtifactRecord;
}

export interface PluginReviewArtifactRecordListFilters {
  readonly recordIds?: readonly string[];
  readonly fingerprints?: readonly string[];
  readonly reviewIds?: readonly string[];
  readonly pluginIds?: readonly string[];
  readonly decisions?: readonly PluginReviewArtifact["decision"][];
  readonly labels?: readonly string[];
  readonly createdAfter?: string;
  readonly createdBefore?: string;
}

export interface PluginReviewArtifactRecordListResponse {
  readonly kind: "plugin-review-artifact.record.list";
  readonly schemaVersion: typeof PLUGIN_REVIEW_ARTIFACT_RECORD_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly filters: PluginReviewArtifactRecordListFilters;
  readonly pagination: {
    readonly offset: number;
    readonly limit: number;
    readonly totalRecordCount: number;
    readonly matchedRecordCount: number;
    readonly returnedRecordCount: number;
    readonly hasMore: boolean;
  };
  readonly records: readonly PluginReviewArtifactRecordSummary[];
}

export interface PluginReviewArtifactRecordGetResponse {
  readonly kind: "plugin-review-artifact.record.read";
  readonly schemaVersion: typeof PLUGIN_REVIEW_ARTIFACT_RECORD_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly record: PluginReviewArtifactRecord;
}

export interface PluginReviewArtifactRecordCompareResponse {
  readonly kind: "plugin-review-artifact.record.compare";
  readonly schemaVersion: typeof PLUGIN_REVIEW_ARTIFACT_RECORD_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly recordId: string;
  readonly equivalent: boolean;
  readonly stored: PluginReviewArtifactBaselineSummary;
  readonly candidate: PluginReviewArtifactBaselineSummary;
  readonly summary: {
    readonly storedItemCount: number;
    readonly candidateItemCount: number;
    readonly unchangedItemCount: number;
    readonly addedItemCount: number;
    readonly removedItemCount: number;
    readonly changedItemCount: number;
  };
  readonly differences: {
    readonly added: readonly PluginReviewArtifactComparableItem[];
    readonly removed: readonly PluginReviewArtifactComparableItem[];
    readonly changed: readonly PluginReviewArtifactChangedItem[];
  };
}

export interface PluginReviewArtifactBaselineSummary {
  readonly fingerprint: string;
  readonly reviewId: string;
  readonly pluginId: string;
  readonly decision: PluginReviewArtifact["decision"];
  readonly evidenceCount: number;
  readonly approvalGateCount: number;
  readonly requiredApprovalGateCount: number;
  readonly pendingApprovalGateCount: number;
  readonly deniedApprovalGateCount: number;
  readonly missingCapabilityCount: number;
  readonly deniedHostApiCount: number;
}

export interface PluginReviewArtifactComparableItem {
  readonly key: string;
  readonly section: string;
  readonly id: string;
  readonly fingerprint: string;
}

export interface PluginReviewArtifactChangedItem {
  readonly key: string;
  readonly stored: PluginReviewArtifactComparableItem;
  readonly candidate: PluginReviewArtifactComparableItem;
}

type PluginReviewArtifactRecordCreateResult =
  | { ok: true; record: PluginReviewArtifactRecord }
  | { ok: false; reason: "duplicate" };

type Parsed<TValue> = { ok: true; value: TValue } | { ok: false; error: ApiResponse };
type JsonRecord = Record<string, unknown>;

interface ParsedCreateRecordRequest {
  readonly recordId?: string;
  readonly label?: string;
  readonly metadata?: JsonRecord;
  readonly artifactPayload: unknown;
}

interface ParsedListRecordsRequest {
  readonly filters: PluginReviewArtifactRecordListFilters;
  readonly offset: number;
  readonly limit: number;
}

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;
const RECORD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const REVIEW_ARTIFACT_FINGERPRINT_PATTERN = /^[a-f0-9]{32}$/;
const CREATE_WRAPPER_KEYS = [
  "recordId",
  "id",
  "label",
  "metadata",
  "payload",
  "preview",
  "baseline",
  "artifactPayload",
] as const;
const PAYLOAD_WRAPPER_KEYS = ["payload", "preview", "baseline", "artifactPayload"] as const;
const COMPARE_WRAPPER_KEYS = PAYLOAD_WRAPPER_KEYS;
const LIST_TOP_LEVEL_KEYS = [
  "filters",
  "recordIds",
  "fingerprints",
  "reviewIds",
  "pluginIds",
  "decisions",
  "labels",
  "createdAfter",
  "createdBefore",
  "offset",
  "limit",
] as const;
const LIST_FILTER_KEYS = [
  "recordIds",
  "fingerprints",
  "reviewIds",
  "pluginIds",
  "decisions",
  "labels",
  "createdAfter",
  "createdBefore",
] as const;
const PREVIEW_RESPONSE_KEYS = [
  "kind",
  "localOnly",
  "redacted",
  "schemaVersion",
  "reviewId",
  "fingerprint",
  "decision",
  "artifact",
] as const;
const ARTIFACT_KEYS = [
  "schemaVersion",
  "reviewId",
  "fingerprint",
  "decision",
  "manifest",
  "sandboxReview",
  "capabilityEvidence",
  "hostApiEvidence",
  "automationReferences",
  "auditReferences",
  "approvalGates",
  "evidence",
] as const;
const MANIFEST_KEYS = [
  "id",
  "name",
  "version",
  "description",
  "entrypoint",
  "minimumHostVersion",
  "permissions",
  "capabilities",
  "tools",
  "resources",
  "prompts",
] as const;
const MANIFEST_COMPONENT_KEYS = ["id", "name", "capability", "permission"] as const;
const SANDBOX_REVIEW_KEYS = [
  "reviewId",
  "fingerprint",
  "pluginId",
  "runLabel",
  "ok",
  "capabilities",
  "hostApis",
  "limits",
  "audit",
  "failureCategories",
  "failure",
] as const;
const CAPABILITY_REVIEW_KEYS = ["granted", "required", "observed", "missing"] as const;
const HOST_API_REVIEW_KEYS = ["denied", "deniedObserved"] as const;
const LIMIT_REVIEW_KEYS = [
  "maxAuditEvents",
  "maxTicks",
  "ticksUsed",
  "ticksRemaining",
  "tickBudgetExhausted",
] as const;
const AUDIT_REVIEW_KEYS = ["total", "remaining", "overflow", "byType"] as const;
const AUDIT_TYPE_COUNT_KEYS = ["type", "count"] as const;
const FAILURE_REVIEW_KEYS = ["code", "category"] as const;
const CAPABILITY_EVIDENCE_KEYS = [
  "capability",
  "declared",
  "permission",
  "required",
  "observed",
  "granted",
  "missing",
  "decision",
] as const;
const HOST_API_EVIDENCE_KEYS = [
  "api",
  "configuredDenied",
  "observedDenied",
  "decision",
] as const;
const REFERENCE_KEYS = ["id", "kind", "label", "uri"] as const;
const APPROVAL_GATE_KEYS = ["id", "name", "required", "state", "reason"] as const;
const EVIDENCE_KEYS = ["id", "kind", "summary", "localOnly", "redacted", "fingerprint"] as const;
const REVIEW_ARTIFACT_DECISIONS = new Set(["approved", "approval_required", "denied"]);
const APPROVAL_GATE_STATES = new Set(["approved", "denied", "pending"]);
const CAPABILITY_EVIDENCE_DECISIONS = new Set(["granted", "missing", "not_requested"]);
const HOST_API_EVIDENCE_DECISIONS = new Set(["blocked", "denied"]);
const SENSITIVE_FIELD_PATTERN =
  /(?:authorization|api[-_]?key|apikey|auth|bearer|cookie|credential|jwt|password|passphrase|private[-_]?key|refresh[-_]?token|secret|session[-_]?token|signing[-_]?key|token)/i;
const SENSITIVE_TEXT_PATTERNS = [
  /\b((?:api[-_]?key|apikey|authorization|credential|password|passphrase|secret|session[-_]?token|token)\s*[:=]\s*)[^\s,;]+/gi,
  /\b(?:sk|rk|pk|tok|pat|npm)_[A-Za-z0-9_-]{8,}\b/g,
  /\b(?:sk|rk|pat|glpat|github_pat)-[A-Za-z0-9_-]{8,}\b/g,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}\b/gi,
];
const previewRouter = createApiRouter(
  createPluginReviewArtifactRoutes({ basePath: "/__plugin_review_artifacts" }),
);

export function createInMemoryPluginReviewArtifactRecordStore(
  options: PluginReviewArtifactRecordStoreOptions = {},
): PluginReviewArtifactRecordStore {
  const records = new Map<string, PluginReviewArtifactRecord>();

  for (const record of options.records ?? []) {
    records.set(record.recordId, cloneRecord(record));
  }

  return {
    create(record) {
      if (records.has(record.recordId)) {
        return { ok: false, reason: "duplicate" };
      }

      const stored = cloneRecord(record);
      records.set(stored.recordId, stored);
      return { ok: true, record: cloneRecord(stored) };
    },

    get(recordId) {
      const record = records.get(recordId);
      return record === undefined ? undefined : cloneRecord(record);
    },

    list() {
      return Object.freeze(
        [...records.values()]
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt) ||
            left.recordId.localeCompare(right.recordId))
          .map(cloneRecord),
      );
    },
  };
}

export function createPluginReviewArtifactRecordRoutes(
  options: PluginReviewArtifactRecordRoutesOptions = {},
): readonly ApiRoute[] {
  const basePath = normalizeBasePath(options.basePath ?? "/v1/plugins/review-artifacts/records");
  const store = options.store ?? createInMemoryPluginReviewArtifactRecordStore();
  const now = options.now ?? (() => new Date());

  return Object.freeze([
    {
      method: "POST",
      path: basePath,
      description: "Stores a redacted local plugin review artifact record.",
      handler: async ({ request }) => {
        const parsed = parseCreateRecordRequest(request.body);
        if (!parsed.ok) {
          return parsed.error;
        }

        const preview = await resolvePreviewResponse(parsed.value.artifactPayload);
        if (!preview.ok) {
          return preview.error;
        }

        const timestamp = readTimestamp(now);
        const recordId = parsed.value.recordId ?? createDefaultRecordId(preview.value.fingerprint);
        const record = buildRecord({
          recordId,
          createdAt: timestamp,
          updatedAt: timestamp,
          label: parsed.value.label,
          metadata: parsed.value.metadata,
          baseline: preview.value,
        });
        const created = store.create(record);
        if (!created.ok) {
          return jsonError(
            409,
            "plugin_review_artifact_record_duplicate",
            "Plugin review artifact record already exists.",
            { recordId },
          );
        }

        return jsonResponse(201, deepFreeze({
          kind: "plugin-review-artifact.record.created",
          schemaVersion: PLUGIN_REVIEW_ARTIFACT_RECORD_SCHEMA_VERSION,
          localOnly: true,
          record: created.record,
        } satisfies PluginReviewArtifactRecordCreateResponse));
      },
    },
    {
      method: "GET",
      path: basePath,
      description: "Lists stored redacted local plugin review artifact records.",
      handler: ({ request }) => {
        const parsed = parseListRecordsRequest(request.body);
        if (!parsed.ok) {
          return parsed.error;
        }

        return jsonResponse(200, listRecords(store, parsed.value));
      },
    },
    {
      method: "GET",
      path: joinPath(basePath, "/:recordId"),
      description: "Reads a stored redacted local plugin review artifact record.",
      handler: ({ params }) => {
        const recordId = parseRecordId(params.recordId, "recordId");
        if (!recordId.ok) {
          return recordId.error;
        }

        const record = store.get(recordId.value);
        if (record === undefined) {
          return recordNotFound(recordId.value);
        }

        return jsonResponse(200, deepFreeze({
          kind: "plugin-review-artifact.record.read",
          schemaVersion: PLUGIN_REVIEW_ARTIFACT_RECORD_SCHEMA_VERSION,
          localOnly: true,
          record,
        } satisfies PluginReviewArtifactRecordGetResponse));
      },
    },
    {
      method: "POST",
      path: joinPath(basePath, "/:recordId/compare"),
      description: "Compares a local plugin review artifact payload with a stored record.",
      handler: async ({ params, request }) => {
        const recordId = parseRecordId(params.recordId, "recordId");
        if (!recordId.ok) {
          return recordId.error;
        }

        const record = store.get(recordId.value);
        if (record === undefined) {
          return recordNotFound(recordId.value);
        }

        const payload = parseComparePayloadRequest(request.body);
        if (!payload.ok) {
          return payload.error;
        }

        const preview = await resolvePreviewResponse(payload.value);
        if (!preview.ok) {
          return preview.error;
        }

        return jsonResponse(200, compareRecord(record, preview.value));
      },
    },
  ]);
}

export function mountPluginReviewArtifactRecordRoutes(
  router: ApiRouter,
  options: PluginReviewArtifactRecordRoutesOptions = {},
): ApiRouter {
  for (const route of createPluginReviewArtifactRecordRoutes(options)) {
    router.register(route);
  }

  return router;
}

function buildRecord(input: {
  readonly recordId: string;
  readonly label?: string;
  readonly metadata?: JsonRecord;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly baseline: PluginReviewArtifactPreviewResponse;
}): PluginReviewArtifactRecord {
  const recordWithoutFingerprint = optionalFields({
    kind: "plugin-review-artifact.record" as const,
    schemaVersion: PLUGIN_REVIEW_ARTIFACT_RECORD_SCHEMA_VERSION,
    localOnly: true as const,
    redacted: true as const,
    recordId: input.recordId,
    label: input.label,
    metadata: input.metadata,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    baselineFingerprint: input.baseline.fingerprint,
    baseline: input.baseline,
  });

  return deepFreeze({
    ...recordWithoutFingerprint,
    fingerprint: fingerprintValue(recordWithoutFingerprint),
  });
}

function listRecords(
  store: PluginReviewArtifactRecordStore,
  request: ParsedListRecordsRequest,
): PluginReviewArtifactRecordListResponse {
  const allRecords = store.list();
  const matchedRecords = applyListFilters(allRecords, request.filters);
  const records = matchedRecords
    .slice(request.offset, request.offset + request.limit)
    .map(summarizeRecord);

  return deepFreeze({
    kind: "plugin-review-artifact.record.list",
    schemaVersion: PLUGIN_REVIEW_ARTIFACT_RECORD_SCHEMA_VERSION,
    localOnly: true,
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
  });
}

function applyListFilters(
  records: readonly PluginReviewArtifactRecord[],
  filters: PluginReviewArtifactRecordListFilters,
): readonly PluginReviewArtifactRecord[] {
  const recordIds = filters.recordIds ? new Set(filters.recordIds) : undefined;
  const fingerprints = filters.fingerprints ? new Set(filters.fingerprints) : undefined;
  const reviewIds = filters.reviewIds ? new Set(filters.reviewIds) : undefined;
  const pluginIds = filters.pluginIds ? new Set(filters.pluginIds) : undefined;
  const decisions = filters.decisions ? new Set(filters.decisions) : undefined;
  const labels = filters.labels ? new Set(filters.labels) : undefined;
  const createdAfter = filters.createdAfter === undefined
    ? undefined
    : Date.parse(filters.createdAfter);
  const createdBefore = filters.createdBefore === undefined
    ? undefined
    : Date.parse(filters.createdBefore);

  return records.filter((record) => {
    const createdAt = Date.parse(record.createdAt);
    return (
      (recordIds === undefined || recordIds.has(record.recordId)) &&
      (fingerprints === undefined ||
        fingerprints.has(record.fingerprint) ||
        fingerprints.has(record.baselineFingerprint)) &&
      (reviewIds === undefined || reviewIds.has(record.baseline.reviewId)) &&
      (pluginIds === undefined || pluginIds.has(record.baseline.artifact.manifest.id)) &&
      (decisions === undefined || decisions.has(record.baseline.decision)) &&
      (labels === undefined || (record.label !== undefined && labels.has(record.label))) &&
      (createdAfter === undefined || createdAt >= createdAfter) &&
      (createdBefore === undefined || createdAt <= createdBefore)
    );
  });
}

function summarizeRecord(
  record: PluginReviewArtifactRecord,
): PluginReviewArtifactRecordSummary {
  const baseline = summarizeBaseline(record.baseline);

  return deepFreeze(optionalFields({
    recordId: record.recordId,
    label: record.label,
    metadata: record.metadata,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    fingerprint: record.fingerprint,
    baselineFingerprint: record.baselineFingerprint,
    reviewId: baseline.reviewId,
    pluginId: baseline.pluginId,
    pluginName: record.baseline.artifact.manifest.name,
    pluginVersion: record.baseline.artifact.manifest.version,
    decision: baseline.decision,
    evidenceCount: baseline.evidenceCount,
    approvalGateCount: baseline.approvalGateCount,
    requiredApprovalGateCount: baseline.requiredApprovalGateCount,
    pendingApprovalGateCount: baseline.pendingApprovalGateCount,
    deniedApprovalGateCount: baseline.deniedApprovalGateCount,
    missingCapabilityCount: baseline.missingCapabilityCount,
    deniedHostApiCount: baseline.deniedHostApiCount,
  }));
}

function compareRecord(
  record: PluginReviewArtifactRecord,
  candidate: PluginReviewArtifactPreviewResponse,
): PluginReviewArtifactRecordCompareResponse {
  const storedMap = createComparableMap(record.baseline.artifact);
  const candidateMap = createComparableMap(candidate.artifact);
  const added: PluginReviewArtifactComparableItem[] = [];
  const removed: PluginReviewArtifactComparableItem[] = [];
  const changed: PluginReviewArtifactChangedItem[] = [];
  let unchangedItemCount = 0;

  for (const [key, candidateItem] of candidateMap) {
    const storedItem = storedMap.get(key);
    if (storedItem === undefined) {
      added.push(candidateItem);
      continue;
    }

    if (storedItem.fingerprint === candidateItem.fingerprint) {
      unchangedItemCount += 1;
      continue;
    }

    changed.push({
      key,
      stored: storedItem,
      candidate: candidateItem,
    });
  }

  for (const [key, storedItem] of storedMap) {
    if (!candidateMap.has(key)) {
      removed.push(storedItem);
    }
  }

  return deepFreeze({
    kind: "plugin-review-artifact.record.compare",
    schemaVersion: PLUGIN_REVIEW_ARTIFACT_RECORD_SCHEMA_VERSION,
    localOnly: true,
    recordId: record.recordId,
    equivalent: record.baseline.fingerprint === candidate.fingerprint,
    stored: summarizeBaseline(record.baseline),
    candidate: summarizeBaseline(candidate),
    summary: {
      storedItemCount: storedMap.size,
      candidateItemCount: candidateMap.size,
      unchangedItemCount,
      addedItemCount: added.length,
      removedItemCount: removed.length,
      changedItemCount: changed.length,
    },
    differences: {
      added: added.sort(compareComparableItems),
      removed: removed.sort(compareComparableItems),
      changed: changed.sort((left, right) => left.key.localeCompare(right.key)),
    },
  } satisfies PluginReviewArtifactRecordCompareResponse);
}

function createComparableMap(
  artifact: PluginReviewArtifact,
): Map<string, PluginReviewArtifactComparableItem> {
  const items = [
    summarizeComparableItem("manifest", artifact.manifest.id, artifact.manifest),
    summarizeComparableItem("sandbox_review", artifact.sandboxReview.reviewId, artifact.sandboxReview),
    ...artifact.capabilityEvidence.map((item) =>
      summarizeComparableItem("capability", item.capability, item)
    ),
    ...artifact.hostApiEvidence.map((item) =>
      summarizeComparableItem("host_api", item.api, item)
    ),
    ...artifact.automationReferences.map((item) =>
      summarizeComparableItem("automation_reference", `${item.kind}:${item.id}`, item)
    ),
    ...artifact.auditReferences.map((item) =>
      summarizeComparableItem("audit_reference", `${item.kind}:${item.id}`, item)
    ),
    ...artifact.approvalGates.map((item) =>
      summarizeComparableItem("approval_gate", item.id, item)
    ),
    ...artifact.evidence.map((item) =>
      summarizeComparableItem("evidence", `${item.kind}:${item.id}`, item)
    ),
  ];

  return new Map(items.map((item) => [item.key, item]));
}

function summarizeComparableItem(
  section: string,
  id: string,
  value: unknown,
): PluginReviewArtifactComparableItem {
  return deepFreeze({
    key: `${section}:${id}`,
    section,
    id,
    fingerprint: fingerprintValue(value),
  });
}

function summarizeBaseline(
  preview: PluginReviewArtifactPreviewResponse,
): PluginReviewArtifactBaselineSummary {
  const artifact = preview.artifact;

  return deepFreeze({
    fingerprint: preview.fingerprint,
    reviewId: preview.reviewId,
    pluginId: artifact.manifest.id,
    decision: preview.decision,
    evidenceCount: artifact.evidence.length,
    approvalGateCount: artifact.approvalGates.length,
    requiredApprovalGateCount: artifact.approvalGates.filter((gate) => gate.required).length,
    pendingApprovalGateCount: artifact.approvalGates.filter((gate) =>
      gate.state === "pending"
    ).length,
    deniedApprovalGateCount: artifact.approvalGates.filter((gate) =>
      gate.state === "denied"
    ).length,
    missingCapabilityCount: artifact.capabilityEvidence.filter((item) =>
      item.decision === "missing"
    ).length,
    deniedHostApiCount: artifact.hostApiEvidence.filter((item) =>
      item.decision === "denied"
    ).length,
  });
}

async function resolvePreviewResponse(
  payload: unknown,
): Promise<Parsed<PluginReviewArtifactPreviewResponse>> {
  const normalized = normalizePreviewLikePayload(payload, "body");
  if (!normalized.ok) {
    return normalized;
  }
  if (normalized.value !== undefined) {
    return { ok: true, value: normalized.value };
  }

  const cloned = cloneJsonCompatibleValue(payload, "body");
  if (!cloned.ok) {
    return cloned;
  }

  const response = await previewRouter.dispatch({
    method: "POST",
    path: "/__plugin_review_artifacts/preview",
    body: cloned.value,
  });
  if (response.status !== 200) {
    return { ok: false, error: response };
  }

  return { ok: true, value: response.body as PluginReviewArtifactPreviewResponse };
}

function normalizePreviewLikePayload(
  payload: unknown,
  path: string,
): Parsed<PluginReviewArtifactPreviewResponse | undefined> {
  const cloned = cloneJsonCompatibleValue(payload, path);
  if (!cloned.ok) {
    return cloned;
  }
  if (!isRecord(cloned.value)) {
    return { ok: true, value: undefined };
  }
  if (cloned.value.kind !== "plugin-review-artifact.preview") {
    return { ok: true, value: undefined };
  }

  const keys = allowedKeys(cloned.value, PREVIEW_RESPONSE_KEYS, path);
  if (!keys.ok) {
    return keys;
  }
  if (cloned.value.localOnly !== true) {
    return validationFailure("Plugin review artifact preview must be local-only.", {
      path: `${path}.localOnly`,
    });
  }
  if (cloned.value.redacted !== true) {
    return validationFailure("Plugin review artifact preview must be redacted.", {
      path: `${path}.redacted`,
    });
  }
  if (cloned.value.schemaVersion !== "plugin-review-artifact/v1") {
    return validationFailure("Plugin review artifact preview schema version is unsupported.", {
      path: `${path}.schemaVersion`,
    });
  }

  const reviewId = parseRequiredString(cloned.value.reviewId, `${path}.reviewId`);
  if (!reviewId.ok) {
    return reviewId;
  }
  const fingerprint = parseReviewArtifactFingerprint(
    cloned.value.fingerprint,
    `${path}.fingerprint`,
  );
  if (!fingerprint.ok) {
    return fingerprint;
  }
  const decision = parseReviewArtifactDecision(cloned.value.decision, `${path}.decision`);
  if (!decision.ok) {
    return decision;
  }

  const artifact = parsePreviewArtifact(cloned.value.artifact, `${path}.artifact`);
  if (!artifact.ok) {
    return artifact;
  }
  if (artifact.value.reviewId !== reviewId.value) {
    return validationFailure("Plugin review artifact preview reviewId must match artifact reviewId.", {
      path: `${path}.artifact.reviewId`,
    });
  }
  if (artifact.value.fingerprint !== fingerprint.value) {
    return validationFailure("Plugin review artifact preview fingerprint must match artifact fingerprint.", {
      path: `${path}.artifact.fingerprint`,
    });
  }
  if (artifact.value.decision !== decision.value) {
    return validationFailure("Plugin review artifact preview decision must match artifact decision.", {
      path: `${path}.artifact.decision`,
    });
  }

  return {
    ok: true,
    value: deepFreeze(cloned.value) as PluginReviewArtifactPreviewResponse,
  };
}

function parsePreviewArtifact(value: unknown, path: string): Parsed<JsonRecord> {
  if (!isRecord(value)) {
    return validationFailure("Plugin review artifact must be an object.", { path });
  }

  const keys = allowedKeys(value, ARTIFACT_KEYS, path);
  if (!keys.ok) {
    return keys;
  }
  if (value.schemaVersion !== "plugin-review-artifact/v1") {
    return validationFailure("Plugin review artifact schema version is unsupported.", {
      path: `${path}.schemaVersion`,
    });
  }

  const reviewId = parseRequiredString(value.reviewId, `${path}.reviewId`);
  if (!reviewId.ok) {
    return reviewId;
  }
  const fingerprint = parseReviewArtifactFingerprint(value.fingerprint, `${path}.fingerprint`);
  if (!fingerprint.ok) {
    return fingerprint;
  }
  const decision = parseReviewArtifactDecision(value.decision, `${path}.decision`);
  if (!decision.ok) {
    return decision;
  }
  const manifest = parseManifest(value.manifest, `${path}.manifest`);
  if (!manifest.ok) {
    return manifest;
  }
  const sandboxReview = parseSandboxReview(value.sandboxReview, `${path}.sandboxReview`);
  if (!sandboxReview.ok) {
    return sandboxReview;
  }
  const capabilityEvidence = parseCapabilityEvidenceArray(
    value.capabilityEvidence,
    `${path}.capabilityEvidence`,
  );
  if (!capabilityEvidence.ok) {
    return capabilityEvidence;
  }
  const hostApiEvidence = parseHostApiEvidenceArray(
    value.hostApiEvidence,
    `${path}.hostApiEvidence`,
  );
  if (!hostApiEvidence.ok) {
    return hostApiEvidence;
  }
  const automationReferences = parseReferenceArray(
    value.automationReferences,
    `${path}.automationReferences`,
  );
  if (!automationReferences.ok) {
    return automationReferences;
  }
  const auditReferences = parseReferenceArray(value.auditReferences, `${path}.auditReferences`);
  if (!auditReferences.ok) {
    return auditReferences;
  }
  const approvalGates = parseApprovalGateArray(value.approvalGates, `${path}.approvalGates`);
  if (!approvalGates.ok) {
    return approvalGates;
  }
  const evidence = parseEvidenceArray(value.evidence, `${path}.evidence`);
  if (!evidence.ok) {
    return evidence;
  }

  return { ok: true, value };
}

function parseManifest(value: unknown, path: string): Parsed<void> {
  if (!isRecord(value)) {
    return validationFailure("Plugin review artifact manifest must be an object.", { path });
  }

  const keys = allowedKeys(value, MANIFEST_KEYS, path);
  if (!keys.ok) {
    return keys;
  }
  for (const key of ["id", "name", "version", "description", "entrypoint", "minimumHostVersion"]) {
    const parsed = parseRequiredString(value[key], `${path}.${key}`);
    if (!parsed.ok) {
      return parsed;
    }
  }
  for (const key of ["permissions"]) {
    const parsed = parseRequiredStringArray(value[key], `${path}.${key}`);
    if (!parsed.ok) {
      return parsed;
    }
  }
  for (const key of ["capabilities", "tools", "resources", "prompts"]) {
    const parsed = parseManifestComponentArray(value[key], `${path}.${key}`);
    if (!parsed.ok) {
      return parsed;
    }
  }

  return { ok: true, value: undefined };
}

function parseManifestComponentArray(value: unknown, path: string): Parsed<void> {
  if (!Array.isArray(value)) {
    return validationFailure("Plugin review artifact manifest component list must be an array.", {
      path,
    });
  }

  for (const [index, item] of value.entries()) {
    const itemPath = `${path}.${index}`;
    if (!isRecord(item)) {
      return validationFailure("Plugin review artifact manifest component must be an object.", {
        path: itemPath,
      });
    }
    const keys = allowedKeys(item, MANIFEST_COMPONENT_KEYS, itemPath);
    if (!keys.ok) {
      return keys;
    }
    const id = parseRequiredString(item.id, `${itemPath}.id`);
    if (!id.ok) {
      return id;
    }
    for (const key of ["name", "capability", "permission"]) {
      if (item[key] !== undefined) {
        const parsed = parseRequiredString(item[key], `${itemPath}.${key}`);
        if (!parsed.ok) {
          return parsed;
        }
      }
    }
  }

  return { ok: true, value: undefined };
}

function parseSandboxReview(value: unknown, path: string): Parsed<void> {
  if (!isRecord(value)) {
    return validationFailure("Plugin review artifact sandbox review must be an object.", { path });
  }

  const keys = allowedKeys(value, SANDBOX_REVIEW_KEYS, path);
  if (!keys.ok) {
    return keys;
  }
  for (const key of ["reviewId", "fingerprint"]) {
    const parsed = parseRequiredString(value[key], `${path}.${key}`);
    if (!parsed.ok) {
      return parsed;
    }
  }
  for (const key of ["pluginId", "runLabel"]) {
    if (value[key] !== undefined) {
      const parsed = parseRequiredString(value[key], `${path}.${key}`);
      if (!parsed.ok) {
        return parsed;
      }
    }
  }
  if (typeof value.ok !== "boolean") {
    return validationFailure("Plugin review artifact sandbox review ok must be a boolean.", {
      path: `${path}.ok`,
    });
  }
  const capabilities = parseSandboxCapabilityReview(value.capabilities, `${path}.capabilities`);
  if (!capabilities.ok) {
    return capabilities;
  }
  const hostApis = parseSandboxHostApiReview(value.hostApis, `${path}.hostApis`);
  if (!hostApis.ok) {
    return hostApis;
  }
  const limits = parseSandboxLimitReview(value.limits, `${path}.limits`);
  if (!limits.ok) {
    return limits;
  }
  const audit = parseSandboxAuditReview(value.audit, `${path}.audit`);
  if (!audit.ok) {
    return audit;
  }
  const failureCategories = parseRequiredStringArray(
    value.failureCategories,
    `${path}.failureCategories`,
  );
  if (!failureCategories.ok) {
    return failureCategories;
  }
  if (value.failure !== undefined) {
    const failure = parseSandboxFailureReview(value.failure, `${path}.failure`);
    if (!failure.ok) {
      return failure;
    }
  }

  return { ok: true, value: undefined };
}

function parseSandboxCapabilityReview(value: unknown, path: string): Parsed<void> {
  if (!isRecord(value)) {
    return validationFailure("Plugin review artifact sandbox capabilities must be an object.", {
      path,
    });
  }

  const keys = allowedKeys(value, CAPABILITY_REVIEW_KEYS, path);
  if (!keys.ok) {
    return keys;
  }
  for (const key of CAPABILITY_REVIEW_KEYS) {
    const parsed = parseRequiredStringArray(value[key], `${path}.${key}`);
    if (!parsed.ok) {
      return parsed;
    }
  }

  return { ok: true, value: undefined };
}

function parseSandboxHostApiReview(value: unknown, path: string): Parsed<void> {
  if (!isRecord(value)) {
    return validationFailure("Plugin review artifact sandbox host APIs must be an object.", {
      path,
    });
  }

  const keys = allowedKeys(value, HOST_API_REVIEW_KEYS, path);
  if (!keys.ok) {
    return keys;
  }
  for (const key of HOST_API_REVIEW_KEYS) {
    const parsed = parseRequiredStringArray(value[key], `${path}.${key}`);
    if (!parsed.ok) {
      return parsed;
    }
  }

  return { ok: true, value: undefined };
}

function parseSandboxLimitReview(value: unknown, path: string): Parsed<void> {
  if (!isRecord(value)) {
    return validationFailure("Plugin review artifact sandbox limits must be an object.", { path });
  }

  const keys = allowedKeys(value, LIMIT_REVIEW_KEYS, path);
  if (!keys.ok) {
    return keys;
  }
  for (const key of ["maxAuditEvents", "maxTicks", "ticksUsed", "ticksRemaining"]) {
    const parsed = parseRequiredNonNegativeInteger(value[key], `${path}.${key}`);
    if (!parsed.ok) {
      return parsed;
    }
  }
  if (typeof value.tickBudgetExhausted !== "boolean") {
    return validationFailure("Plugin review artifact sandbox tickBudgetExhausted must be a boolean.", {
      path: `${path}.tickBudgetExhausted`,
    });
  }

  return { ok: true, value: undefined };
}

function parseSandboxAuditReview(value: unknown, path: string): Parsed<void> {
  if (!isRecord(value)) {
    return validationFailure("Plugin review artifact sandbox audit must be an object.", { path });
  }

  const keys = allowedKeys(value, AUDIT_REVIEW_KEYS, path);
  if (!keys.ok) {
    return keys;
  }
  for (const key of ["total", "remaining"]) {
    const parsed = parseRequiredNonNegativeInteger(value[key], `${path}.${key}`);
    if (!parsed.ok) {
      return parsed;
    }
  }
  if (typeof value.overflow !== "boolean") {
    return validationFailure("Plugin review artifact sandbox audit overflow must be a boolean.", {
      path: `${path}.overflow`,
    });
  }
  if (!Array.isArray(value.byType)) {
    return validationFailure("Plugin review artifact sandbox audit byType must be an array.", {
      path: `${path}.byType`,
    });
  }
  for (const [index, item] of value.byType.entries()) {
    const itemPath = `${path}.byType.${index}`;
    if (!isRecord(item)) {
      return validationFailure("Plugin review artifact sandbox audit type count must be an object.", {
        path: itemPath,
      });
    }
    const itemKeys = allowedKeys(item, AUDIT_TYPE_COUNT_KEYS, itemPath);
    if (!itemKeys.ok) {
      return itemKeys;
    }
    const type = parseRequiredString(item.type, `${itemPath}.type`);
    if (!type.ok) {
      return type;
    }
    const count = parseRequiredNonNegativeInteger(item.count, `${itemPath}.count`);
    if (!count.ok) {
      return count;
    }
  }

  return { ok: true, value: undefined };
}

function parseSandboxFailureReview(value: unknown, path: string): Parsed<void> {
  if (!isRecord(value)) {
    return validationFailure("Plugin review artifact sandbox failure must be an object.", { path });
  }

  const keys = allowedKeys(value, FAILURE_REVIEW_KEYS, path);
  if (!keys.ok) {
    return keys;
  }
  for (const key of FAILURE_REVIEW_KEYS) {
    const parsed = parseRequiredString(value[key], `${path}.${key}`);
    if (!parsed.ok) {
      return parsed;
    }
  }

  return { ok: true, value: undefined };
}

function parseCapabilityEvidenceArray(value: unknown, path: string): Parsed<void> {
  if (!Array.isArray(value)) {
    return validationFailure("Plugin review artifact capability evidence must be an array.", {
      path,
    });
  }

  for (const [index, item] of value.entries()) {
    const itemPath = `${path}.${index}`;
    if (!isRecord(item)) {
      return validationFailure("Plugin review artifact capability evidence item must be an object.", {
        path: itemPath,
      });
    }
    const keys = allowedKeys(item, CAPABILITY_EVIDENCE_KEYS, itemPath);
    if (!keys.ok) {
      return keys;
    }
    const capability = parseRequiredString(item.capability, `${itemPath}.capability`);
    if (!capability.ok) {
      return capability;
    }
    for (const key of ["declared", "required", "observed", "granted", "missing"]) {
      if (typeof item[key] !== "boolean") {
        return validationFailure("Plugin review artifact capability evidence flag must be a boolean.", {
          path: `${itemPath}.${key}`,
        });
      }
    }
    if (item.permission !== undefined) {
      const permission = parseRequiredString(item.permission, `${itemPath}.permission`);
      if (!permission.ok) {
        return permission;
      }
    }
    if (!CAPABILITY_EVIDENCE_DECISIONS.has(String(item.decision))) {
      return validationFailure("Plugin review artifact capability evidence decision is unsupported.", {
        path: `${itemPath}.decision`,
      });
    }
  }

  return { ok: true, value: undefined };
}

function parseHostApiEvidenceArray(value: unknown, path: string): Parsed<void> {
  if (!Array.isArray(value)) {
    return validationFailure("Plugin review artifact host API evidence must be an array.", {
      path,
    });
  }

  for (const [index, item] of value.entries()) {
    const itemPath = `${path}.${index}`;
    if (!isRecord(item)) {
      return validationFailure("Plugin review artifact host API evidence item must be an object.", {
        path: itemPath,
      });
    }
    const keys = allowedKeys(item, HOST_API_EVIDENCE_KEYS, itemPath);
    if (!keys.ok) {
      return keys;
    }
    const api = parseRequiredString(item.api, `${itemPath}.api`);
    if (!api.ok) {
      return api;
    }
    for (const key of ["configuredDenied", "observedDenied"]) {
      if (typeof item[key] !== "boolean") {
        return validationFailure("Plugin review artifact host API evidence flag must be a boolean.", {
          path: `${itemPath}.${key}`,
        });
      }
    }
    if (!HOST_API_EVIDENCE_DECISIONS.has(String(item.decision))) {
      return validationFailure("Plugin review artifact host API evidence decision is unsupported.", {
        path: `${itemPath}.decision`,
      });
    }
  }

  return { ok: true, value: undefined };
}

function parseReferenceArray(value: unknown, path: string): Parsed<void> {
  if (!Array.isArray(value)) {
    return validationFailure("Plugin review artifact references must be an array.", { path });
  }

  for (const [index, item] of value.entries()) {
    const itemPath = `${path}.${index}`;
    if (!isRecord(item)) {
      return validationFailure("Plugin review artifact reference must be an object.", {
        path: itemPath,
      });
    }
    const keys = allowedKeys(item, REFERENCE_KEYS, itemPath);
    if (!keys.ok) {
      return keys;
    }
    for (const key of ["id", "kind"]) {
      const parsed = parseRequiredString(item[key], `${itemPath}.${key}`);
      if (!parsed.ok) {
        return parsed;
      }
    }
    for (const key of ["label", "uri"]) {
      if (item[key] !== undefined) {
        const parsed = parseRequiredString(item[key], `${itemPath}.${key}`);
        if (!parsed.ok) {
          return parsed;
        }
      }
    }
  }

  return { ok: true, value: undefined };
}

function parseApprovalGateArray(value: unknown, path: string): Parsed<void> {
  if (!Array.isArray(value)) {
    return validationFailure("Plugin review artifact approval gates must be an array.", { path });
  }

  for (const [index, item] of value.entries()) {
    const itemPath = `${path}.${index}`;
    if (!isRecord(item)) {
      return validationFailure("Plugin review artifact approval gate must be an object.", {
        path: itemPath,
      });
    }
    const keys = allowedKeys(item, APPROVAL_GATE_KEYS, itemPath);
    if (!keys.ok) {
      return keys;
    }
    for (const key of ["id", "name"]) {
      const parsed = parseRequiredString(item[key], `${itemPath}.${key}`);
      if (!parsed.ok) {
        return parsed;
      }
    }
    if (typeof item.required !== "boolean") {
      return validationFailure("Plugin review artifact approval gate required must be a boolean.", {
        path: `${itemPath}.required`,
      });
    }
    if (!APPROVAL_GATE_STATES.has(String(item.state))) {
      return validationFailure("Plugin review artifact approval gate state is unsupported.", {
        path: `${itemPath}.state`,
      });
    }
    if (item.reason !== undefined) {
      const reason = parseRequiredString(item.reason, `${itemPath}.reason`);
      if (!reason.ok) {
        return reason;
      }
    }
  }

  return { ok: true, value: undefined };
}

function parseEvidenceArray(value: unknown, path: string): Parsed<void> {
  if (!Array.isArray(value)) {
    return validationFailure("Plugin review artifact evidence must be an array.", { path });
  }

  for (const [index, item] of value.entries()) {
    const itemPath = `${path}.${index}`;
    if (!isRecord(item)) {
      return validationFailure("Plugin review artifact evidence item must be an object.", {
        path: itemPath,
      });
    }
    const keys = allowedKeys(item, EVIDENCE_KEYS, itemPath);
    if (!keys.ok) {
      return keys;
    }
    for (const key of ["id", "kind", "fingerprint"]) {
      const parsed = parseRequiredString(item[key], `${itemPath}.${key}`);
      if (!parsed.ok) {
        return parsed;
      }
    }
    if (item.summary !== undefined) {
      const summary = parseRequiredString(item.summary, `${itemPath}.summary`);
      if (!summary.ok) {
        return summary;
      }
    }
    if (typeof item.localOnly !== "boolean") {
      return validationFailure("Plugin review artifact evidence localOnly must be a boolean.", {
        path: `${itemPath}.localOnly`,
      });
    }
    if (item.redacted !== true) {
      return validationFailure("Plugin review artifact evidence must be redacted.", {
        path: `${itemPath}.redacted`,
      });
    }
  }

  return { ok: true, value: undefined };
}

function parseCreateRecordRequest(body: unknown): Parsed<ParsedCreateRecordRequest> {
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

  const recordId = parseOptionalRecordId(
    cloned.value.recordId ?? cloned.value.id,
    cloned.value.recordId === undefined ? "body.id" : "body.recordId",
  );
  if (!recordId.ok) {
    return recordId;
  }

  const label = parseOptionalRedactedString(cloned.value.label, "body.label");
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
        recordId: recordId.value,
        label: label.value,
        metadata: metadata.value,
        artifactPayload: wrapperPayload.value,
      }) as ParsedCreateRecordRequest,
    };
  }

  const artifactPayload = { ...cloned.value };
  delete artifactPayload.recordId;
  delete artifactPayload.id;
  delete artifactPayload.label;
  delete artifactPayload.metadata;

  return {
    ok: true,
    value: optionalFields({
      recordId: recordId.value,
      label: label.value,
      metadata: metadata.value,
      artifactPayload,
    }) as ParsedCreateRecordRequest,
  };
}

function parseComparePayloadRequest(body: unknown): Parsed<unknown> {
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
    const keys = allowedKeys(cloned.value, COMPARE_WRAPPER_KEYS, "body");
    if (!keys.ok) {
      return keys;
    }
  }

  return { ok: true, value: wrapperPayload.value ?? cloned.value };
}

function parseListRecordsRequest(body: unknown): Parsed<ParsedListRecordsRequest> {
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
    return validationFailure("Plugin review artifact record filters must be an object.", {
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
): Parsed<PluginReviewArtifactRecordListFilters> {
  const keys = allowedKeys(value, LIST_FILTER_KEYS, path);
  if (!keys.ok) {
    return keys;
  }

  const recordIds = parseOptionalRecordIdArray(value.recordIds, `${path}.recordIds`);
  if (!recordIds.ok) {
    return recordIds;
  }
  const fingerprints = parseOptionalReviewArtifactFingerprintArray(
    value.fingerprints,
    `${path}.fingerprints`,
  );
  if (!fingerprints.ok) {
    return fingerprints;
  }
  const reviewIds = parseOptionalStringArray(value.reviewIds, `${path}.reviewIds`);
  if (!reviewIds.ok) {
    return reviewIds;
  }
  const pluginIds = parseOptionalStringArray(value.pluginIds, `${path}.pluginIds`);
  if (!pluginIds.ok) {
    return pluginIds;
  }
  const decisions = parseOptionalReviewArtifactDecisionArray(
    value.decisions,
    `${path}.decisions`,
  );
  if (!decisions.ok) {
    return decisions;
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
      recordIds: recordIds.value,
      fingerprints: fingerprints.value,
      reviewIds: reviewIds.value,
      pluginIds: pluginIds.value,
      decisions: decisions.value,
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
  const keys = PAYLOAD_WRAPPER_KEYS.filter((key) => body[key] !== undefined);
  if (keys.length > 1) {
    return validationFailure("Request body must include only one artifact payload field.", {
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

function recordNotFound(recordId: string): ApiResponse {
  return jsonError(
    404,
    "plugin_review_artifact_record_not_found",
    "Plugin review artifact record was not found.",
    { recordId },
  );
}

function parseOptionalRecordId(value: unknown, path: string): Parsed<string | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  return parseRecordId(value, path);
}

function parseRecordId(value: unknown, path: string): Parsed<string> {
  const parsed = parseRequiredString(value, path);
  if (!parsed.ok) {
    return parsed;
  }
  if (!RECORD_ID_PATTERN.test(parsed.value)) {
    return validationFailure(
      "Record id must start with a letter or number and contain only letters, numbers, dot, underscore, colon, or hyphen.",
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

function parseOptionalRecordIdArray(
  value: unknown,
  path: string,
): Parsed<readonly string[] | undefined> {
  const parsed = parseOptionalStringArray(value, path);
  if (!parsed.ok || parsed.value === undefined) {
    return parsed;
  }

  for (const [index, item] of parsed.value.entries()) {
    if (!RECORD_ID_PATTERN.test(item)) {
      return validationFailure(
        "Record id must start with a letter or number and contain only letters, numbers, dot, underscore, colon, or hyphen.",
        { path: `${path}.${index}` },
      );
    }
  }

  return parsed;
}

function parseOptionalReviewArtifactFingerprintArray(
  value: unknown,
  path: string,
): Parsed<readonly string[] | undefined> {
  const parsed = parseOptionalStringArray(value, path);
  if (!parsed.ok || parsed.value === undefined) {
    return parsed;
  }

  for (const [index, item] of parsed.value.entries()) {
    const fingerprint = parseReviewArtifactFingerprint(item, `${path}.${index}`);
    if (!fingerprint.ok) {
      return fingerprint;
    }
  }

  return parsed;
}

function parseReviewArtifactFingerprint(value: unknown, path: string): Parsed<string> {
  const parsed = parseRequiredString(value, path);
  if (!parsed.ok) {
    return parsed;
  }
  if (!REVIEW_ARTIFACT_FINGERPRINT_PATTERN.test(parsed.value)) {
    return validationFailure("Value must be a plugin review artifact fingerprint.", { path });
  }

  return parsed;
}

function parseOptionalReviewArtifactDecisionArray(
  value: unknown,
  path: string,
): Parsed<readonly PluginReviewArtifact["decision"][] | undefined> {
  const parsed = parseOptionalStringArray(value, path);
  if (!parsed.ok || parsed.value === undefined) {
    return parsed as Parsed<readonly PluginReviewArtifact["decision"][] | undefined>;
  }

  for (const [index, item] of parsed.value.entries()) {
    const decision = parseReviewArtifactDecision(item, `${path}.${index}`);
    if (!decision.ok) {
      return decision as Parsed<readonly PluginReviewArtifact["decision"][] | undefined>;
    }
  }

  return {
    ok: true,
    value: parsed.value as readonly PluginReviewArtifact["decision"][],
  };
}

function parseReviewArtifactDecision(
  value: unknown,
  path: string,
): Parsed<PluginReviewArtifact["decision"]> {
  if (typeof value !== "string" || !REVIEW_ARTIFACT_DECISIONS.has(value)) {
    return validationFailure("Plugin review artifact decision is unsupported.", { path });
  }

  return { ok: true, value: value as PluginReviewArtifact["decision"] };
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

function parseOptionalRedactedString(value: unknown, path: string): Parsed<string | undefined> {
  const parsed = parseOptionalString(value, path);
  if (!parsed.ok || parsed.value === undefined) {
    return parsed;
  }

  return { ok: true, value: redactStringValue(parsed.value) };
}

function parseRequiredStringArray(value: unknown, path: string): Parsed<readonly string[]> {
  const parsed = parseOptionalStringArray(value, path);
  if (!parsed.ok) {
    return parsed;
  }
  if (parsed.value === undefined) {
    return validationFailure("Value must be an array of non-empty strings.", { path });
  }

  return { ok: true, value: parsed.value };
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

function parseRequiredNonNegativeInteger(value: unknown, path: string): Parsed<number> {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    return validationFailure("Value must be a safe integer greater than or equal to 0.", {
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
  if (key.length > 0 && SENSITIVE_FIELD_PATTERN.test(key)) {
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
  return SENSITIVE_TEXT_PATTERNS.reduce(
    (redacted, pattern) => redacted.replace(pattern, (match, prefix) =>
      typeof prefix === "string" ? `${prefix}[REDACTED]` : "[REDACTED]",
    ),
    value,
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

function cloneRecord(record: PluginReviewArtifactRecord): PluginReviewArtifactRecord {
  return deepFreeze(structuredClone(record));
}

function createDefaultRecordId(fingerprint: string): string {
  return `plugrev_${fingerprint.slice(0, 24)}`;
}

function compareComparableItems(
  left: PluginReviewArtifactComparableItem,
  right: PluginReviewArtifactComparableItem,
): number {
  return left.key.localeCompare(right.key);
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
    throw new TypeError("Plugin review artifact record timestamp source returned an invalid timestamp.");
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
