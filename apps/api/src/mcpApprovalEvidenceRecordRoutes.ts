import { createHash } from "node:crypto";

import {
  MCP_APPROVAL_EVIDENCE_SCHEMA_VERSION,
  createMcpApprovalEvidenceRoutes,
} from "./mcpApprovalEvidenceRoutes.ts";
import type {
  McpApprovalEvidenceItem,
  McpApprovalEvidencePreviewResponse,
} from "./mcpApprovalEvidenceRoutes.ts";
import type {
  ApiResponse,
  ApiRoute,
  ApiRouter,
} from "./router.ts";
import { createApiRouter, jsonError, jsonResponse } from "./router.ts";

export const MCP_APPROVAL_EVIDENCE_RECORD_SCHEMA_VERSION =
  "mcp-approval-evidence-record/v1";

export interface McpApprovalEvidenceRecordRoutesOptions {
  readonly basePath?: string;
  readonly now?: () => Date | string;
  readonly store?: McpApprovalEvidenceRecordStore;
}

export interface McpApprovalEvidenceRecordStore {
  create(record: McpApprovalEvidenceRecord): McpApprovalEvidenceRecordCreateResult;
  get(recordId: string): McpApprovalEvidenceRecord | undefined;
  list(): readonly McpApprovalEvidenceRecord[];
}

export interface McpApprovalEvidenceRecordStoreOptions {
  readonly records?: readonly McpApprovalEvidenceRecord[];
}

export interface McpApprovalEvidenceRecord {
  readonly kind: "mcp-approval-evidence.record";
  readonly schemaVersion: typeof MCP_APPROVAL_EVIDENCE_RECORD_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly redacted: true;
  readonly recordId: string;
  readonly label?: string;
  readonly metadata?: JsonRecord;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly fingerprint: string;
  readonly baselineFingerprint: string;
  readonly baseline: McpApprovalEvidencePreviewResponse;
}

export interface McpApprovalEvidenceRecordSummary {
  readonly recordId: string;
  readonly label?: string;
  readonly metadata?: JsonRecord;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly fingerprint: string;
  readonly baselineFingerprint: string;
  readonly evidenceCount: number;
  readonly approvalRequiredCount: number;
  readonly terminalDecisionCount: number;
  readonly sources: Readonly<Record<string, number>>;
  readonly statuses: Readonly<Record<string, number>>;
}

export interface McpApprovalEvidenceRecordCreateResponse {
  readonly kind: "mcp-approval-evidence.record.created";
  readonly schemaVersion: typeof MCP_APPROVAL_EVIDENCE_RECORD_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly record: McpApprovalEvidenceRecord;
}

export interface McpApprovalEvidenceRecordListFilters {
  readonly recordIds?: readonly string[];
  readonly fingerprints?: readonly string[];
  readonly labels?: readonly string[];
  readonly createdAfter?: string;
  readonly createdBefore?: string;
}

export interface McpApprovalEvidenceRecordListResponse {
  readonly kind: "mcp-approval-evidence.record.list";
  readonly schemaVersion: typeof MCP_APPROVAL_EVIDENCE_RECORD_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly filters: McpApprovalEvidenceRecordListFilters;
  readonly pagination: {
    readonly offset: number;
    readonly limit: number;
    readonly totalRecordCount: number;
    readonly matchedRecordCount: number;
    readonly returnedRecordCount: number;
    readonly hasMore: boolean;
  };
  readonly records: readonly McpApprovalEvidenceRecordSummary[];
}

export interface McpApprovalEvidenceRecordGetResponse {
  readonly kind: "mcp-approval-evidence.record.read";
  readonly schemaVersion: typeof MCP_APPROVAL_EVIDENCE_RECORD_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly record: McpApprovalEvidenceRecord;
}

export interface McpApprovalEvidenceRecordCompareResponse {
  readonly kind: "mcp-approval-evidence.record.compare";
  readonly schemaVersion: typeof MCP_APPROVAL_EVIDENCE_RECORD_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly recordId: string;
  readonly equivalent: boolean;
  readonly stored: McpApprovalEvidenceBaselineSummary;
  readonly candidate: McpApprovalEvidenceBaselineSummary;
  readonly summary: {
    readonly storedEvidenceCount: number;
    readonly candidateEvidenceCount: number;
    readonly unchangedEvidenceCount: number;
    readonly addedEvidenceCount: number;
    readonly removedEvidenceCount: number;
    readonly changedEvidenceCount: number;
  };
  readonly differences: {
    readonly added: readonly McpApprovalEvidenceComparableItem[];
    readonly removed: readonly McpApprovalEvidenceComparableItem[];
    readonly changed: readonly McpApprovalEvidenceChangedItem[];
  };
}

export interface McpApprovalEvidenceBaselineSummary {
  readonly fingerprint: string;
  readonly evidenceCount: number;
  readonly approvalRequiredCount: number;
  readonly terminalDecisionCount: number;
  readonly sources: Readonly<Record<string, number>>;
  readonly statuses: Readonly<Record<string, number>>;
}

export interface McpApprovalEvidenceComparableItem {
  readonly key: string;
  readonly id: string;
  readonly source: string;
  readonly status: string;
  readonly subject: McpApprovalEvidenceItem["subject"];
  readonly fingerprint: string;
}

export interface McpApprovalEvidenceChangedItem {
  readonly key: string;
  readonly stored: McpApprovalEvidenceComparableItem;
  readonly candidate: McpApprovalEvidenceComparableItem;
}

type McpApprovalEvidenceRecordCreateResult =
  | { ok: true; record: McpApprovalEvidenceRecord }
  | { ok: false; reason: "duplicate" };

type Parsed<TValue> = { ok: true; value: TValue } | { ok: false; error: ApiResponse };
type JsonRecord = Record<string, unknown>;

interface ParsedCreateRecordRequest {
  readonly recordId?: string;
  readonly label?: string;
  readonly metadata?: JsonRecord;
  readonly evidencePayload: unknown;
}

interface ParsedListRecordsRequest {
  readonly filters: McpApprovalEvidenceRecordListFilters;
  readonly offset: number;
  readonly limit: number;
}

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;
const RECORD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CREATE_WRAPPER_KEYS = [
  "recordId",
  "id",
  "label",
  "metadata",
  "payload",
  "preview",
  "baseline",
  "evidencePayload",
] as const;
const PAYLOAD_WRAPPER_KEYS = ["payload", "preview", "baseline", "evidencePayload"] as const;
const COMPARE_WRAPPER_KEYS = PAYLOAD_WRAPPER_KEYS;
const LIST_TOP_LEVEL_KEYS = [
  "filters",
  "recordIds",
  "fingerprints",
  "labels",
  "createdAfter",
  "createdBefore",
  "offset",
  "limit",
] as const;
const LIST_FILTER_KEYS = [
  "recordIds",
  "fingerprints",
  "labels",
  "createdAfter",
  "createdBefore",
] as const;
const PREVIEW_RESPONSE_KEYS = [
  "kind",
  "schemaVersion",
  "localOnly",
  "redacted",
  "fingerprint",
  "filters",
  "summary",
  "evidence",
] as const;
const previewRouter = createApiRouter(
  createMcpApprovalEvidenceRoutes({ basePath: "/__mcp_approval_evidence" }),
);

export function createInMemoryMcpApprovalEvidenceRecordStore(
  options: McpApprovalEvidenceRecordStoreOptions = {},
): McpApprovalEvidenceRecordStore {
  const records = new Map<string, McpApprovalEvidenceRecord>();

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

export function createMcpApprovalEvidenceRecordRoutes(
  options: McpApprovalEvidenceRecordRoutesOptions = {},
): readonly ApiRoute[] {
  const basePath = normalizeBasePath(options.basePath ?? "/v1/mcp/approval-evidence/records");
  const store = options.store ?? createInMemoryMcpApprovalEvidenceRecordStore();
  const now = options.now ?? (() => new Date());

  return Object.freeze([
    {
      method: "POST",
      path: basePath,
      description: "Stores a local MCP approval evidence record.",
      handler: async ({ request }) => {
        const parsed = parseCreateRecordRequest(request.body);
        if (!parsed.ok) {
          return parsed.error;
        }

        const preview = await resolvePreviewResponse(parsed.value.evidencePayload);
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
            "mcp_approval_evidence_record_duplicate",
            "MCP approval evidence record already exists.",
            { recordId },
          );
        }

        return jsonResponse(201, deepFreeze({
          kind: "mcp-approval-evidence.record.created",
          schemaVersion: MCP_APPROVAL_EVIDENCE_RECORD_SCHEMA_VERSION,
          localOnly: true,
          record: created.record,
        } satisfies McpApprovalEvidenceRecordCreateResponse));
      },
    },
    {
      method: "GET",
      path: basePath,
      description: "Lists stored local MCP approval evidence records.",
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
      description: "Reads a stored local MCP approval evidence record.",
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
          kind: "mcp-approval-evidence.record.read",
          schemaVersion: MCP_APPROVAL_EVIDENCE_RECORD_SCHEMA_VERSION,
          localOnly: true,
          record,
        } satisfies McpApprovalEvidenceRecordGetResponse));
      },
    },
    {
      method: "POST",
      path: joinPath(basePath, "/:recordId/compare"),
      description: "Compares a local MCP approval evidence payload with a stored record.",
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

export function mountMcpApprovalEvidenceRecordRoutes(
  router: ApiRouter,
  options: McpApprovalEvidenceRecordRoutesOptions = {},
): ApiRouter {
  for (const route of createMcpApprovalEvidenceRecordRoutes(options)) {
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
  readonly baseline: McpApprovalEvidencePreviewResponse;
}): McpApprovalEvidenceRecord {
  const recordWithoutFingerprint = optionalFields({
    kind: "mcp-approval-evidence.record" as const,
    schemaVersion: MCP_APPROVAL_EVIDENCE_RECORD_SCHEMA_VERSION,
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
  store: McpApprovalEvidenceRecordStore,
  request: ParsedListRecordsRequest,
): McpApprovalEvidenceRecordListResponse {
  const allRecords = store.list();
  const matchedRecords = applyListFilters(allRecords, request.filters);
  const records = matchedRecords
    .slice(request.offset, request.offset + request.limit)
    .map(summarizeRecord);

  return deepFreeze({
    kind: "mcp-approval-evidence.record.list",
    schemaVersion: MCP_APPROVAL_EVIDENCE_RECORD_SCHEMA_VERSION,
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
  records: readonly McpApprovalEvidenceRecord[],
  filters: McpApprovalEvidenceRecordListFilters,
): readonly McpApprovalEvidenceRecord[] {
  const recordIds = filters.recordIds ? new Set(filters.recordIds) : undefined;
  const fingerprints = filters.fingerprints ? new Set(filters.fingerprints) : undefined;
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
      (labels === undefined || (record.label !== undefined && labels.has(record.label))) &&
      (createdAfter === undefined || createdAt >= createdAfter) &&
      (createdBefore === undefined || createdAt <= createdBefore)
    );
  });
}

function summarizeRecord(record: McpApprovalEvidenceRecord): McpApprovalEvidenceRecordSummary {
  const baseline = summarizeBaseline(record.baseline);

  return deepFreeze(optionalFields({
    recordId: record.recordId,
    label: record.label,
    metadata: record.metadata,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    fingerprint: record.fingerprint,
    baselineFingerprint: record.baselineFingerprint,
    evidenceCount: baseline.evidenceCount,
    approvalRequiredCount: baseline.approvalRequiredCount,
    terminalDecisionCount: baseline.terminalDecisionCount,
    sources: baseline.sources,
    statuses: baseline.statuses,
  }));
}

function compareRecord(
  record: McpApprovalEvidenceRecord,
  candidate: McpApprovalEvidencePreviewResponse,
): McpApprovalEvidenceRecordCompareResponse {
  const storedMap = createEvidenceMap(record.baseline.evidence);
  const candidateMap = createEvidenceMap(candidate.evidence);
  const added: McpApprovalEvidenceComparableItem[] = [];
  const removed: McpApprovalEvidenceComparableItem[] = [];
  const changed: McpApprovalEvidenceChangedItem[] = [];
  let unchangedEvidenceCount = 0;

  for (const [key, candidateItem] of candidateMap) {
    const storedItem = storedMap.get(key);
    if (storedItem === undefined) {
      added.push(candidateItem);
      continue;
    }

    if (storedItem.fingerprint === candidateItem.fingerprint) {
      unchangedEvidenceCount += 1;
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
    kind: "mcp-approval-evidence.record.compare",
    schemaVersion: MCP_APPROVAL_EVIDENCE_RECORD_SCHEMA_VERSION,
    localOnly: true,
    recordId: record.recordId,
    equivalent: record.baseline.fingerprint === candidate.fingerprint,
    stored: summarizeBaseline(record.baseline),
    candidate: summarizeBaseline(candidate),
    summary: {
      storedEvidenceCount: record.baseline.evidence.length,
      candidateEvidenceCount: candidate.evidence.length,
      unchangedEvidenceCount,
      addedEvidenceCount: added.length,
      removedEvidenceCount: removed.length,
      changedEvidenceCount: changed.length,
    },
    differences: {
      added: added.sort(compareComparableItems),
      removed: removed.sort(compareComparableItems),
      changed: changed.sort((left, right) => left.key.localeCompare(right.key)),
    },
  } satisfies McpApprovalEvidenceRecordCompareResponse);
}

function createEvidenceMap(
  evidence: readonly McpApprovalEvidenceItem[],
): Map<string, McpApprovalEvidenceComparableItem> {
  const items = new Map<string, McpApprovalEvidenceComparableItem>();

  for (const item of evidence) {
    const comparable = summarizeEvidenceItem(item);
    items.set(comparable.key, comparable);
  }

  return items;
}

function summarizeEvidenceItem(
  item: McpApprovalEvidenceItem,
): McpApprovalEvidenceComparableItem {
  const key = evidenceKey(item);

  return deepFreeze({
    key,
    id: item.id,
    source: item.source,
    status: item.status,
    subject: item.subject,
    fingerprint: item.fingerprint,
  });
}

function summarizeBaseline(
  preview: McpApprovalEvidencePreviewResponse,
): McpApprovalEvidenceBaselineSummary {
  return deepFreeze({
    fingerprint: preview.fingerprint,
    evidenceCount: preview.evidence.length,
    approvalRequiredCount: preview.evidence.filter((entry) =>
      entry.status === "approval_required"
    ).length,
    terminalDecisionCount: preview.evidence.filter((entry) =>
      entry.status === "approved" ||
      entry.status === "rejected" ||
      entry.status === "expired"
    ).length,
    sources: countBy(preview.evidence, (entry) => entry.source),
    statuses: countBy(preview.evidence, (entry) => entry.status),
  });
}

async function resolvePreviewResponse(
  payload: unknown,
): Promise<Parsed<McpApprovalEvidencePreviewResponse>> {
  const normalized = normalizePreviewLikePayload(payload, "body");
  if (!normalized.ok) {
    return normalized;
  }
  if (normalized.value !== undefined) {
    return { ok: true, value: normalized.value };
  }

  const response = await previewRouter.dispatch({
    method: "POST",
    path: "/__mcp_approval_evidence/preview",
    body: payload,
  });
  if (response.status !== 200) {
    return { ok: false, error: response };
  }

  return { ok: true, value: response.body as McpApprovalEvidencePreviewResponse };
}

function normalizePreviewLikePayload(
  payload: unknown,
  path: string,
): Parsed<McpApprovalEvidencePreviewResponse | undefined> {
  const cloned = cloneJsonCompatibleValue(payload, path);
  if (!cloned.ok) {
    return cloned;
  }
  if (!isRecord(cloned.value)) {
    return { ok: true, value: undefined };
  }
  if (cloned.value.kind !== "mcp-approval-evidence.preview") {
    return { ok: true, value: undefined };
  }

  const keys = allowedKeys(cloned.value, PREVIEW_RESPONSE_KEYS, path);
  if (!keys.ok) {
    return keys;
  }
  if (cloned.value.schemaVersion !== MCP_APPROVAL_EVIDENCE_SCHEMA_VERSION) {
    return validationFailure("MCP approval evidence preview schema version is unsupported.", {
      path: `${path}.schemaVersion`,
    });
  }
  if (cloned.value.localOnly !== true) {
    return validationFailure("MCP approval evidence preview must be local-only.", {
      path: `${path}.localOnly`,
    });
  }
  if (cloned.value.redacted !== true) {
    return validationFailure("MCP approval evidence preview must be redacted.", {
      path: `${path}.redacted`,
    });
  }

  const fingerprint = parseFingerprint(cloned.value.fingerprint, `${path}.fingerprint`);
  if (!fingerprint.ok) {
    return fingerprint;
  }
  if (!isRecord(cloned.value.filters)) {
    return validationFailure("MCP approval evidence preview filters must be an object.", {
      path: `${path}.filters`,
    });
  }
  if (!isRecord(cloned.value.summary)) {
    return validationFailure("MCP approval evidence preview summary must be an object.", {
      path: `${path}.summary`,
    });
  }
  if (!Array.isArray(cloned.value.evidence)) {
    return validationFailure("MCP approval evidence preview evidence must be an array.", {
      path: `${path}.evidence`,
    });
  }

  for (const [index, item] of cloned.value.evidence.entries()) {
    const itemPath = `${path}.evidence.${index}`;
    if (!isRecord(item)) {
      return validationFailure("MCP approval evidence preview evidence must contain objects.", {
        path: itemPath,
      });
    }

    const itemFingerprint = parseFingerprint(item.fingerprint, `${itemPath}.fingerprint`);
    if (!itemFingerprint.ok) {
      return itemFingerprint;
    }
    const id = parseRequiredString(item.id, `${itemPath}.id`);
    if (!id.ok) {
      return id;
    }
    const source = parseRequiredString(item.source, `${itemPath}.source`);
    if (!source.ok) {
      return source;
    }
    const status = parseRequiredString(item.status, `${itemPath}.status`);
    if (!status.ok) {
      return status;
    }
    if (!isRecord(item.subject)) {
      return validationFailure("MCP approval evidence preview subject must be an object.", {
        path: `${itemPath}.subject`,
      });
    }
  }

  return {
    ok: true,
    value: deepFreeze(cloned.value) as McpApprovalEvidencePreviewResponse,
  };
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
        recordId: recordId.value,
        label: label.value,
        metadata: metadata.value,
        evidencePayload: wrapperPayload.value,
      }) as ParsedCreateRecordRequest,
    };
  }

  const evidencePayload = { ...cloned.value };
  delete evidencePayload.recordId;
  delete evidencePayload.id;
  delete evidencePayload.label;
  delete evidencePayload.metadata;

  return {
    ok: true,
    value: optionalFields({
      recordId: recordId.value,
      label: label.value,
      metadata: metadata.value,
      evidencePayload,
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
    return validationFailure("MCP approval evidence record filters must be an object.", {
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
): Parsed<McpApprovalEvidenceRecordListFilters> {
  const keys = allowedKeys(value, LIST_FILTER_KEYS, path);
  if (!keys.ok) {
    return keys;
  }

  const recordIds = parseOptionalRecordIdArray(value.recordIds, `${path}.recordIds`);
  if (!recordIds.ok) {
    return recordIds;
  }

  const fingerprints = parseOptionalFingerprintArray(value.fingerprints, `${path}.fingerprints`);
  if (!fingerprints.ok) {
    return fingerprints;
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
    return validationFailure("Request body must include only one evidence payload field.", {
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
    "mcp_approval_evidence_record_not_found",
    "MCP approval evidence record was not found.",
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
  if (!/^sha256:[a-f0-9]{64}$/.test(parsed.value)) {
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

const SENSITIVE_FIELD_PATTERN =
  /(?:authorization|api[-_]?key|apikey|auth|bearer|cookie|credential|jwt|password|passphrase|private[-_]?key|refresh[-_]?token|secret|session[-_]?token|signing[-_]?key|token)/i;
const SENSITIVE_TEXT_PATTERNS = [
  /\b((?:api[-_]?key|apikey|authorization|credential|password|passphrase|secret|session[-_]?token|token)\s*[:=]\s*)[^\s,;]+/gi,
  /\b(?:sk|rk|pk|tok|pat|npm)_[A-Za-z0-9_-]{8,}\b/g,
  /\b(?:sk|rk|pat|glpat|github_pat)-[A-Za-z0-9_-]{8,}\b/g,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}\b/gi,
];

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

function cloneRecord(record: McpApprovalEvidenceRecord): McpApprovalEvidenceRecord {
  return deepFreeze(structuredClone(record));
}

function createDefaultRecordId(fingerprint: string): string {
  return `mcpae_${fingerprint.slice("sha256:".length, "sha256:".length + 24)}`;
}

function evidenceKey(item: McpApprovalEvidenceItem): string {
  return `${item.source}:${item.id}`;
}

function compareComparableItems(
  left: McpApprovalEvidenceComparableItem,
  right: McpApprovalEvidenceComparableItem,
): number {
  return left.key.localeCompare(right.key);
}

function countBy<TValue>(
  values: readonly TValue[],
  selectKey: (value: TValue) => string,
): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const key = selectKey(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return Object.freeze(
    Object.fromEntries(
      Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
    ),
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

function readTimestamp(now: () => Date | string): string {
  const value = now();
  const timestamp = value instanceof Date ? value.toISOString() : value;
  if (typeof timestamp !== "string" || Number.isNaN(Date.parse(timestamp))) {
    throw new TypeError("MCP approval evidence record timestamp source returned an invalid timestamp.");
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
