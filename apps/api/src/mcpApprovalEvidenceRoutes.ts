import { createHash } from "node:crypto";

import {
  createAuditReplayEntries,
} from "../../../services/mcp-gateway/src/auditReplay.ts";
import type {
  ApprovalSessionSnapshotLike,
  AuditReplayEntry,
  AuditReplayInput,
  AuditReplaySourceKind,
  AuditReplayStatus,
  ResourceAuditRecordLike,
  ToolAuditRecordLike,
} from "../../../services/mcp-gateway/src/auditReplay.ts";
import type {
  ApiResponse,
  ApiRoute,
  ApiRouter,
} from "./router.ts";
import { jsonError, jsonResponse } from "./router.ts";

export const MCP_APPROVAL_EVIDENCE_SCHEMA_VERSION = "mcp-approval-evidence-preview/v1";
export const MCP_APPROVAL_EVIDENCE_REDACTION = "[REDACTED]";

export interface McpApprovalEvidenceRoutesOptions {
  readonly basePath?: string;
}

export interface McpApprovalEvidenceFilters {
  readonly sources?: readonly AuditReplaySourceKind[];
  readonly statuses?: readonly AuditReplayStatus[];
  readonly subjectTypes?: readonly AuditReplayEntry["subject"]["type"][];
  readonly actorIds?: readonly string[];
  readonly limit?: number;
}

export interface McpApprovalEvidencePreviewSummary {
  readonly inputRecordCount: number;
  readonly totalEvidenceCount: number;
  readonly returnedEvidenceCount: number;
  readonly filteredEvidenceCount: number;
  readonly approvalSessionCount: number;
  readonly auditRecordCount: number;
  readonly approvalRequiredCount: number;
  readonly terminalDecisionCount: number;
  readonly sources: Readonly<Record<string, number>>;
  readonly statuses: Readonly<Record<string, number>>;
}

export interface McpApprovalEvidenceItem extends AuditReplayEntry {
  readonly fingerprint: string;
}

export interface McpApprovalEvidencePreviewResponse {
  readonly kind: "mcp-approval-evidence.preview";
  readonly schemaVersion: typeof MCP_APPROVAL_EVIDENCE_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly redacted: true;
  readonly fingerprint: string;
  readonly filters: McpApprovalEvidenceFilters;
  readonly summary: McpApprovalEvidencePreviewSummary;
  readonly evidence: readonly McpApprovalEvidenceItem[];
}

type Parsed<TValue> = { ok: true; value: TValue } | { ok: false; error: ApiResponse };
type JsonRecord = Record<string, unknown>;

interface ParsedApprovalEvidenceRequest {
  readonly input: AuditReplayInput;
  readonly filters: McpApprovalEvidenceFilters;
  readonly counts: {
    readonly approvalSessions: number;
    readonly toolAuditRecords: number;
    readonly resourceAuditRecords: number;
  };
}

const TOP_LEVEL_SOURCE_KEYS = [
  "approvalSessions",
  "toolAuditRecords",
  "toolRecords",
  "resourceAuditRecords",
  "resourceAuditIntents",
  "auditIntents",
] as const;
const TOP_LEVEL_KEYS = ["snapshot", "filters", ...TOP_LEVEL_SOURCE_KEYS] as const;
const SNAPSHOT_KEYS = TOP_LEVEL_SOURCE_KEYS;
const FILTER_KEYS = ["sources", "statuses", "subjectTypes", "actorIds", "limit"] as const;
const TOOL_AUDIT_KEYS = [
  "id",
  "timestamp",
  "type",
  "toolName",
  "arguments",
  "actorId",
  "decision",
  "reason",
  "metadata",
  "resultSummary",
] as const;
const RESOURCE_AUDIT_KEYS = [
  "id",
  "timestamp",
  "type",
  "uri",
  "path",
  "capability",
  "decision",
  "message",
  "metadata",
] as const;
const APPROVAL_SESSION_KEYS = [
  "id",
  "status",
  "createdAt",
  "updatedAt",
  "expiresAt",
  "request",
  "actor",
  "reason",
  "ruleId",
  "metadata",
  "decision",
  "approvedAt",
  "approvedBy",
  "rejectedAt",
  "rejectedBy",
  "expiredAt",
  "expiredBy",
] as const;
const APPROVAL_ACTOR_KEYS = ["id", "roles", "metadata"] as const;
const APPROVAL_DECISION_KEYS = ["status", "at", "actor", "reason", "metadata"] as const;
const TOOL_AUDIT_TYPES = new Set([
  "tool_call_requested",
  "tool_call_approved",
  "tool_call_approval_required",
  "tool_call_denied",
  "tool_call_executed",
  "tool_call_failed",
]);
const RESOURCE_AUDIT_TYPES = new Set([
  "policy_decision",
  "operation_succeeded",
  "operation_failed",
]);
const APPROVAL_STATUSES = new Set(["pending", "approved", "rejected", "expired"]);
const TERMINAL_APPROVAL_STATUSES = new Set(["approved", "rejected", "expired"]);
const REPLAY_SOURCES = new Set(["tool_audit", "resource_audit", "approval_session"]);
const REPLAY_STATUSES = new Set([
  "requested",
  "approval_required",
  "approved",
  "executed",
  "failed",
  "denied",
  "succeeded",
  "rejected",
  "expired",
]);
const SUBJECT_TYPES = new Set(["tool", "resource", "approval_session"]);
const DEFAULT_FILTERS: McpApprovalEvidenceFilters = Object.freeze({});
const SENSITIVE_FIELD_PATTERN =
  /(?:authorization|api[-_]?key|apikey|auth|bearer|cookie|credential|jwt|password|passphrase|private[-_]?key|refresh[-_]?token|secret|session[-_]?token|signing[-_]?key|token)/i;
const SENSITIVE_TEXT_PATTERNS = [
  /\b((?:api[-_]?key|apikey|authorization|credential|password|passphrase|secret|session[-_]?token|token)\s*[:=]\s*)[^\s,;]+/gi,
  /\b(?:sk|rk|pk|tok|pat|npm)_[A-Za-z0-9_-]{8,}\b/g,
  /\b(?:sk|rk|pat|glpat|github_pat)-[A-Za-z0-9_-]{8,}\b/g,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}\b/gi,
];

export function createMcpApprovalEvidenceRoutes(
  options: McpApprovalEvidenceRoutesOptions = {},
): readonly ApiRoute[] {
  const basePath = normalizeBasePath(options.basePath ?? "/v1/mcp/approval-evidence");

  return Object.freeze([
    {
      method: "POST",
      path: joinPath(basePath, "/preview"),
      description: "Previews local MCP approval evidence from request payload snapshots.",
      handler: ({ request }) => {
        const parsed = parseApprovalEvidencePreviewRequest(request.body);
        if (!parsed.ok) {
          return parsed.error;
        }

        try {
          return jsonResponse(200, buildApprovalEvidencePreview(parsed.value));
        } catch {
          return jsonError(
            500,
            "mcp_approval_evidence_preview_failed",
            "MCP approval evidence preview failed.",
          );
        }
      },
    },
  ]);
}

export function mountMcpApprovalEvidenceRoutes(
  router: ApiRouter,
  options: McpApprovalEvidenceRoutesOptions = {},
): ApiRouter {
  for (const route of createMcpApprovalEvidenceRoutes(options)) {
    router.register(route);
  }

  return router;
}

function buildApprovalEvidencePreview(
  request: ParsedApprovalEvidenceRequest,
): McpApprovalEvidencePreviewResponse {
  const replayEntries = createAuditReplayEntries(request.input);
  const redactedEntries = redactJsonValue(replayEntries) as AuditReplayEntry[];
  const filteredEntries = applyFilters(redactedEntries, request.filters);
  const evidence = filteredEntries.map(toEvidenceItem);
  const summary = summarizeEvidence(
    redactedEntries,
    evidence,
    request.counts,
  );
  const responseWithoutFingerprint = {
    kind: "mcp-approval-evidence.preview",
    schemaVersion: MCP_APPROVAL_EVIDENCE_SCHEMA_VERSION,
    localOnly: true,
    redacted: true,
    filters: request.filters,
    summary,
    evidence,
  } satisfies Omit<McpApprovalEvidencePreviewResponse, "fingerprint">;

  return deepFreeze({
    ...responseWithoutFingerprint,
    fingerprint: fingerprintValue(responseWithoutFingerprint),
  });
}

function parseApprovalEvidencePreviewRequest(
  body: unknown,
): Parsed<ParsedApprovalEvidenceRequest> {
  const json = cloneJsonCompatibleValue(body, "body");
  if (!json.ok) {
    return json;
  }
  if (!isRecord(json.value)) {
    return validationFailure("Request body must be an object.", { path: "body" });
  }

  const topLevel = allowedKeys(json.value, TOP_LEVEL_KEYS, "body");
  if (!topLevel.ok) {
    return topLevel;
  }

  const filters = parseFilters(json.value.filters, "body.filters");
  if (!filters.ok) {
    return filters;
  }

  const snapshot = parseSnapshotSource(json.value);
  if (!snapshot.ok) {
    return snapshot;
  }

  const input = snapshot.value;
  const approvalSessions = parseOptionalApprovalSessions(
    input.approvalSessions,
    "body.approvalSessions",
  );
  if (!approvalSessions.ok) {
    return approvalSessions;
  }

  const toolAuditRecords = parseOptionalToolAuditRecords(
    input.toolAuditRecords,
    "body.toolAuditRecords",
  );
  if (!toolAuditRecords.ok) {
    return toolAuditRecords;
  }

  const toolRecords = parseOptionalToolAuditRecords(
    input.toolRecords,
    "body.toolRecords",
  );
  if (!toolRecords.ok) {
    return toolRecords;
  }

  const resourceAuditRecords = parseOptionalResourceAuditRecords(
    input.resourceAuditRecords,
    "body.resourceAuditRecords",
  );
  if (!resourceAuditRecords.ok) {
    return resourceAuditRecords;
  }

  const resourceAuditIntents = parseOptionalResourceAuditRecords(
    input.resourceAuditIntents,
    "body.resourceAuditIntents",
  );
  if (!resourceAuditIntents.ok) {
    return resourceAuditIntents;
  }

  const auditIntents = parseOptionalResourceAuditRecords(
    input.auditIntents,
    "body.auditIntents",
  );
  if (!auditIntents.ok) {
    return auditIntents;
  }

  const counts = {
    approvalSessions: approvalSessions.value.length,
    toolAuditRecords: toolAuditRecords.value.length + toolRecords.value.length,
    resourceAuditRecords:
      resourceAuditRecords.value.length +
      resourceAuditIntents.value.length +
      auditIntents.value.length,
  };
  if (counts.approvalSessions + counts.toolAuditRecords + counts.resourceAuditRecords === 0) {
    return validationFailure(
      "MCP approval evidence preview requires at least one approval session or audit record.",
      { path: "body" },
    );
  }

  return {
    ok: true,
    value: {
      input: optionalFields({
        approvalSessions: approvalSessions.value,
        toolAuditRecords: toolAuditRecords.value,
        toolRecords: toolRecords.value,
        resourceAuditRecords: resourceAuditRecords.value,
        resourceAuditIntents: resourceAuditIntents.value,
        auditIntents: auditIntents.value,
      }),
      filters: filters.value,
      counts,
    },
  };
}

function parseSnapshotSource(
  body: JsonRecord,
): Parsed<JsonRecord> {
  if (body.snapshot === undefined) {
    return { ok: true, value: body };
  }

  const disallowed = TOP_LEVEL_SOURCE_KEYS.find((key) => body[key] !== undefined);
  if (disallowed) {
    return validationFailure(
      "Request body must not mix snapshot and top-level evidence arrays.",
      { path: `body.${disallowed}` },
    );
  }

  if (!isRecord(body.snapshot)) {
    return validationFailure("MCP approval evidence snapshot must be an object.", {
      path: "body.snapshot",
    });
  }

  const keys = allowedKeys(body.snapshot, SNAPSHOT_KEYS, "body.snapshot");
  if (!keys.ok) {
    return keys;
  }

  return { ok: true, value: body.snapshot };
}

function parseOptionalApprovalSessions(
  value: unknown,
  path: string,
): Parsed<readonly ApprovalSessionSnapshotLike[]> {
  return parseOptionalRecordArray(value, path, parseApprovalSession);
}

function parseApprovalSession(
  record: JsonRecord,
  path: string,
): Parsed<ApprovalSessionSnapshotLike> {
  const keys = allowedKeys(record, APPROVAL_SESSION_KEYS, path);
  if (!keys.ok) {
    return keys;
  }

  const id = parseRequiredString(record.id, `${path}.id`);
  if (!id.ok) {
    return id;
  }

  const status = parseApprovalStatus(record.status, `${path}.status`);
  if (!status.ok) {
    return status;
  }

  const createdAt = parseRequiredTimestamp(record.createdAt, `${path}.createdAt`);
  if (!createdAt.ok) {
    return createdAt;
  }

  const updatedAt = parseRequiredTimestamp(record.updatedAt, `${path}.updatedAt`);
  if (!updatedAt.ok) {
    return updatedAt;
  }

  const expiresAt = parseOptionalTimestamp(record.expiresAt, `${path}.expiresAt`);
  if (!expiresAt.ok) {
    return expiresAt;
  }

  const request = parseRequiredRecord(record.request, `${path}.request`, "Approval session request");
  if (!request.ok) {
    return request;
  }

  const actor = parseOptionalActor(record.actor, `${path}.actor`);
  if (!actor.ok) {
    return actor;
  }

  const reason = parseOptionalString(record.reason, `${path}.reason`);
  if (!reason.ok) {
    return reason;
  }

  const ruleId = parseOptionalString(record.ruleId, `${path}.ruleId`);
  if (!ruleId.ok) {
    return ruleId;
  }

  const metadata = parseOptionalRecord(record.metadata, `${path}.metadata`);
  if (!metadata.ok) {
    return metadata;
  }

  const decision = parseOptionalApprovalDecision(record.decision, `${path}.decision`);
  if (!decision.ok) {
    return decision;
  }

  const approvedAt = parseOptionalTimestamp(record.approvedAt, `${path}.approvedAt`);
  if (!approvedAt.ok) {
    return approvedAt;
  }

  const approvedBy = parseOptionalActor(record.approvedBy, `${path}.approvedBy`);
  if (!approvedBy.ok) {
    return approvedBy;
  }

  const rejectedAt = parseOptionalTimestamp(record.rejectedAt, `${path}.rejectedAt`);
  if (!rejectedAt.ok) {
    return rejectedAt;
  }

  const rejectedBy = parseOptionalActor(record.rejectedBy, `${path}.rejectedBy`);
  if (!rejectedBy.ok) {
    return rejectedBy;
  }

  const expiredAt = parseOptionalTimestamp(record.expiredAt, `${path}.expiredAt`);
  if (!expiredAt.ok) {
    return expiredAt;
  }

  const expiredBy = parseOptionalActor(record.expiredBy, `${path}.expiredBy`);
  if (!expiredBy.ok) {
    return expiredBy;
  }

  return {
    ok: true,
    value: optionalFields({
      id: id.value,
      status: status.value,
      createdAt: createdAt.value,
      updatedAt: updatedAt.value,
      expiresAt: expiresAt.value,
      request: request.value,
      actor: actor.value,
      reason: reason.value,
      ruleId: ruleId.value,
      metadata: metadata.value,
      decision: decision.value,
      approvedAt: approvedAt.value,
      approvedBy: approvedBy.value,
      rejectedAt: rejectedAt.value,
      rejectedBy: rejectedBy.value,
      expiredAt: expiredAt.value,
      expiredBy: expiredBy.value,
    }) as ApprovalSessionSnapshotLike,
  };
}

function parseOptionalApprovalDecision(
  value: unknown,
  path: string,
): Parsed<ApprovalSessionSnapshotLike["decision"] | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (!isRecord(value)) {
    return validationFailure("Approval session decision must be an object.", { path });
  }

  const keys = allowedKeys(value, APPROVAL_DECISION_KEYS, path);
  if (!keys.ok) {
    return keys;
  }

  const status = parseTerminalApprovalStatus(value.status, `${path}.status`);
  if (!status.ok) {
    return status;
  }

  const at = parseRequiredTimestamp(value.at, `${path}.at`);
  if (!at.ok) {
    return at;
  }

  const actor = parseOptionalActor(value.actor, `${path}.actor`);
  if (!actor.ok) {
    return actor;
  }

  const reason = parseOptionalString(value.reason, `${path}.reason`);
  if (!reason.ok) {
    return reason;
  }

  const metadata = parseOptionalRecord(value.metadata, `${path}.metadata`);
  if (!metadata.ok) {
    return metadata;
  }

  return {
    ok: true,
    value: optionalFields({
      status: status.value,
      at: at.value,
      actor: actor.value,
      reason: reason.value,
      metadata: metadata.value,
    }) as ApprovalSessionSnapshotLike["decision"],
  };
}

function parseOptionalActor(
  value: unknown,
  path: string,
): Parsed<ApprovalSessionSnapshotLike["actor"] | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (!isRecord(value)) {
    return validationFailure("Approval actor must be an object.", { path });
  }

  const keys = allowedKeys(value, APPROVAL_ACTOR_KEYS, path);
  if (!keys.ok) {
    return keys;
  }

  const id = parseRequiredString(value.id, `${path}.id`);
  if (!id.ok) {
    return id;
  }

  const roles = parseOptionalStringArray(value.roles, `${path}.roles`);
  if (!roles.ok) {
    return roles;
  }

  const metadata = parseOptionalRecord(value.metadata, `${path}.metadata`);
  if (!metadata.ok) {
    return metadata;
  }

  return {
    ok: true,
    value: optionalFields({
      id: id.value,
      roles: roles.value,
      metadata: metadata.value,
    }) as ApprovalSessionSnapshotLike["actor"],
  };
}

function parseOptionalToolAuditRecords(
  value: unknown,
  path: string,
): Parsed<readonly ToolAuditRecordLike[]> {
  return parseOptionalRecordArray(value, path, parseToolAuditRecord);
}

function parseToolAuditRecord(
  record: JsonRecord,
  path: string,
): Parsed<ToolAuditRecordLike> {
  const keys = allowedKeys(record, TOOL_AUDIT_KEYS, path);
  if (!keys.ok) {
    return keys;
  }

  const type = parseRequiredString(record.type, `${path}.type`);
  if (!type.ok) {
    return type;
  }
  if (!TOOL_AUDIT_TYPES.has(type.value)) {
    return validationFailure("Tool audit type is unsupported.", { path: `${path}.type` });
  }

  const toolName = parseRequiredString(record.toolName, `${path}.toolName`);
  if (!toolName.ok) {
    return toolName;
  }

  const id = parseOptionalString(record.id, `${path}.id`);
  if (!id.ok) {
    return id;
  }

  const timestamp = parseOptionalTimestamp(record.timestamp, `${path}.timestamp`);
  if (!timestamp.ok) {
    return timestamp;
  }

  const args = parseOptionalRecord(record.arguments, `${path}.arguments`);
  if (!args.ok) {
    return args;
  }

  const actorId = parseOptionalString(record.actorId, `${path}.actorId`);
  if (!actorId.ok) {
    return actorId;
  }

  const decision = parseOptionalString(record.decision, `${path}.decision`);
  if (!decision.ok) {
    return decision;
  }

  const reason = parseOptionalString(record.reason, `${path}.reason`);
  if (!reason.ok) {
    return reason;
  }

  const metadata = parseOptionalRecord(record.metadata, `${path}.metadata`);
  if (!metadata.ok) {
    return metadata;
  }

  const resultSummary = parseOptionalString(record.resultSummary, `${path}.resultSummary`);
  if (!resultSummary.ok) {
    return resultSummary;
  }

  return {
    ok: true,
    value: optionalFields({
      id: id.value,
      timestamp: timestamp.value,
      type: type.value,
      toolName: toolName.value,
      arguments: args.value,
      actorId: actorId.value,
      decision: decision.value,
      reason: reason.value,
      metadata: metadata.value,
      resultSummary: resultSummary.value,
    }) as ToolAuditRecordLike,
  };
}

function parseOptionalResourceAuditRecords(
  value: unknown,
  path: string,
): Parsed<readonly ResourceAuditRecordLike[]> {
  return parseOptionalRecordArray(value, path, parseResourceAuditRecord);
}

function parseResourceAuditRecord(
  record: JsonRecord,
  path: string,
): Parsed<ResourceAuditRecordLike> {
  const keys = allowedKeys(record, RESOURCE_AUDIT_KEYS, path);
  if (!keys.ok) {
    return keys;
  }

  const type = parseRequiredString(record.type, `${path}.type`);
  if (!type.ok) {
    return type;
  }
  if (!RESOURCE_AUDIT_TYPES.has(type.value)) {
    return validationFailure("Resource audit type is unsupported.", { path: `${path}.type` });
  }

  const id = parseOptionalString(record.id, `${path}.id`);
  if (!id.ok) {
    return id;
  }

  const timestamp = parseOptionalTimestamp(record.timestamp, `${path}.timestamp`);
  if (!timestamp.ok) {
    return timestamp;
  }

  const uri = parseOptionalString(record.uri, `${path}.uri`);
  if (!uri.ok) {
    return uri;
  }

  const resourcePath = parseOptionalString(record.path, `${path}.path`);
  if (!resourcePath.ok) {
    return resourcePath;
  }
  if (uri.value === undefined && resourcePath.value === undefined) {
    return validationFailure("Resource audit record requires uri or path.", { path });
  }

  const capability = parseOptionalString(record.capability, `${path}.capability`);
  if (!capability.ok) {
    return capability;
  }

  const decision = parseOptionalString(record.decision, `${path}.decision`);
  if (!decision.ok) {
    return decision;
  }

  const message = parseOptionalString(record.message, `${path}.message`);
  if (!message.ok) {
    return message;
  }

  const metadata = parseOptionalRecord(record.metadata, `${path}.metadata`);
  if (!metadata.ok) {
    return metadata;
  }

  return {
    ok: true,
    value: optionalFields({
      id: id.value,
      timestamp: timestamp.value,
      type: type.value,
      uri: uri.value,
      path: resourcePath.value,
      capability: capability.value,
      decision: decision.value,
      message: message.value,
      metadata: metadata.value,
    }) as ResourceAuditRecordLike,
  };
}

function parseFilters(
  value: unknown,
  path: string,
): Parsed<McpApprovalEvidenceFilters> {
  if (value === undefined) {
    return { ok: true, value: DEFAULT_FILTERS };
  }
  if (!isRecord(value)) {
    return validationFailure("MCP approval evidence filters must be an object.", { path });
  }

  const keys = allowedKeys(value, FILTER_KEYS, path);
  if (!keys.ok) {
    return keys;
  }

  const sources = parseOptionalEnumArray(
    value.sources,
    `${path}.sources`,
    REPLAY_SOURCES,
    "MCP approval evidence source is unsupported.",
  ) as Parsed<readonly AuditReplaySourceKind[] | undefined>;
  if (!sources.ok) {
    return sources;
  }

  const statuses = parseOptionalEnumArray(
    value.statuses,
    `${path}.statuses`,
    REPLAY_STATUSES,
    "MCP approval evidence status is unsupported.",
  ) as Parsed<readonly AuditReplayStatus[] | undefined>;
  if (!statuses.ok) {
    return statuses;
  }

  const subjectTypes = parseOptionalEnumArray(
    value.subjectTypes,
    `${path}.subjectTypes`,
    SUBJECT_TYPES,
    "MCP approval evidence subject type is unsupported.",
  ) as Parsed<readonly AuditReplayEntry["subject"]["type"][] | undefined>;
  if (!subjectTypes.ok) {
    return subjectTypes;
  }

  const actorIds = parseOptionalStringArray(value.actorIds, `${path}.actorIds`);
  if (!actorIds.ok) {
    return actorIds;
  }

  const limit = parseOptionalNonNegativeInteger(value.limit, `${path}.limit`);
  if (!limit.ok) {
    return limit;
  }

  return {
    ok: true,
    value: optionalFields({
      sources: sources.value,
      statuses: statuses.value,
      subjectTypes: subjectTypes.value,
      actorIds: actorIds.value,
      limit: limit.value,
    }),
  };
}

function applyFilters(
  entries: readonly AuditReplayEntry[],
  filters: McpApprovalEvidenceFilters,
): readonly AuditReplayEntry[] {
  const sourceSet = filters.sources ? new Set(filters.sources) : undefined;
  const statusSet = filters.statuses ? new Set(filters.statuses) : undefined;
  const subjectTypeSet = filters.subjectTypes ? new Set(filters.subjectTypes) : undefined;
  const actorSet = filters.actorIds ? new Set(filters.actorIds) : undefined;
  const filtered = entries.filter((entry) =>
    (sourceSet === undefined || sourceSet.has(entry.source)) &&
    (statusSet === undefined || statusSet.has(entry.status)) &&
    (subjectTypeSet === undefined || subjectTypeSet.has(entry.subject.type)) &&
    (actorSet === undefined || (entry.actorId !== undefined && actorSet.has(entry.actorId)))
  );

  return filters.limit === undefined ? filtered : filtered.slice(0, filters.limit);
}

function toEvidenceItem(entry: AuditReplayEntry): McpApprovalEvidenceItem {
  return deepFreeze({
    ...entry,
    fingerprint: fingerprintValue(entry),
  });
}

function summarizeEvidence(
  allEntries: readonly AuditReplayEntry[],
  evidence: readonly McpApprovalEvidenceItem[],
  counts: ParsedApprovalEvidenceRequest["counts"],
): McpApprovalEvidencePreviewSummary {
  return deepFreeze({
    inputRecordCount:
      counts.approvalSessions +
      counts.toolAuditRecords +
      counts.resourceAuditRecords,
    totalEvidenceCount: allEntries.length,
    returnedEvidenceCount: evidence.length,
    filteredEvidenceCount: Math.max(0, allEntries.length - evidence.length),
    approvalSessionCount: counts.approvalSessions,
    auditRecordCount: counts.toolAuditRecords + counts.resourceAuditRecords,
    approvalRequiredCount: evidence.filter((entry) => entry.status === "approval_required").length,
    terminalDecisionCount: evidence.filter((entry) =>
      entry.status === "approved" ||
      entry.status === "rejected" ||
      entry.status === "expired",
    ).length,
    sources: countBy(evidence, (entry) => entry.source),
    statuses: countBy(evidence, (entry) => entry.status),
  });
}

function parseOptionalRecordArray<TValue>(
  value: unknown,
  path: string,
  parseItem: (record: JsonRecord, path: string) => Parsed<TValue>,
): Parsed<readonly TValue[]> {
  if (value === undefined) {
    return { ok: true, value: Object.freeze([]) };
  }
  if (!Array.isArray(value)) {
    return validationFailure("Value must be an array of objects.", { path });
  }

  const items: TValue[] = [];
  for (const [index, item] of value.entries()) {
    const itemPath = `${path}.${index}`;
    if (!isRecord(item)) {
      return validationFailure("Value must be an array of objects.", { path: itemPath });
    }

    const parsed = parseItem(item, itemPath);
    if (!parsed.ok) {
      return parsed;
    }
    items.push(parsed.value);
  }

  return { ok: true, value: Object.freeze(items) };
}

function parseRequiredRecord(value: unknown, path: string, label: string): Parsed<JsonRecord> {
  if (!isRecord(value)) {
    return validationFailure(`${label} must be an object.`, { path });
  }
  if (Object.keys(value).length === 0) {
    return validationFailure(`${label} must not be empty.`, { path });
  }

  return { ok: true, value };
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

  return { ok: true, value };
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

function parseOptionalEnumArray(
  value: unknown,
  path: string,
  allowed: ReadonlySet<string>,
  message: string,
): Parsed<readonly string[] | undefined> {
  const parsed = parseOptionalStringArray(value, path);
  if (!parsed.ok || parsed.value === undefined) {
    return parsed;
  }

  for (const [index, item] of parsed.value.entries()) {
    if (!allowed.has(item)) {
      return validationFailure(message, { path: `${path}.${index}` });
    }
  }

  return parsed;
}

function parseApprovalStatus(
  value: unknown,
  path: string,
): Parsed<ApprovalSessionSnapshotLike["status"]> {
  const parsed = parseRequiredString(value, path);
  if (!parsed.ok) {
    return parsed;
  }
  if (!APPROVAL_STATUSES.has(parsed.value)) {
    return validationFailure(
      "Approval session status must be pending, approved, rejected, or expired.",
      { path },
    );
  }

  return { ok: true, value: parsed.value as ApprovalSessionSnapshotLike["status"] };
}

function parseTerminalApprovalStatus(
  value: unknown,
  path: string,
): Parsed<Exclude<ApprovalSessionSnapshotLike["status"], "pending">> {
  const parsed = parseRequiredString(value, path);
  if (!parsed.ok) {
    return parsed;
  }
  if (!TERMINAL_APPROVAL_STATUSES.has(parsed.value)) {
    return validationFailure(
      "Approval decision status must be approved, rejected, or expired.",
      { path },
    );
  }

  return {
    ok: true,
    value: parsed.value as Exclude<ApprovalSessionSnapshotLike["status"], "pending">,
  };
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

function parseOptionalNonNegativeInteger(
  value: unknown,
  path: string,
): Parsed<number | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    return validationFailure("Value must be a safe integer greater than or equal to 0.", {
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
    return MCP_APPROVAL_EVIDENCE_REDACTION;
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
  if (isSecretShapedString(value)) {
    return MCP_APPROVAL_EVIDENCE_REDACTION;
  }

  return SENSITIVE_TEXT_PATTERNS.reduce(
    (redacted, pattern) => redacted.replace(pattern, (match, prefix) =>
      typeof prefix === "string"
        ? `${prefix}${MCP_APPROVAL_EVIDENCE_REDACTION}`
        : MCP_APPROVAL_EVIDENCE_REDACTION,
    ),
    value,
  );
}

function isSecretShapedString(value: string): boolean {
  const trimmed = value.trim();
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(trimmed)) {
    return true;
  }
  if (/^Bearer\s+[A-Za-z0-9._~+/=-]{8,}$/i.test(trimmed)) {
    return true;
  }
  if (/^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/.test(trimmed)) {
    return true;
  }
  if (/^(?:sk|rk|pat|npm)_[A-Za-z0-9_-]{12,}$/.test(trimmed)) {
    return true;
  }
  if (/^(?:sk|rk|pat|glpat|github_pat)-[A-Za-z0-9_-]{12,}$/.test(trimmed)) {
    return true;
  }
  if (/(?:api[_-]?key|authorization|password|secret|session[_-]?token|token)=\S{8,}/i.test(trimmed)) {
    return true;
  }

  return (
    trimmed.length >= 40 &&
    /^[A-Za-z0-9+/=_-]+$/.test(trimmed) &&
    /[a-z]/.test(trimmed) &&
    /[A-Z]/.test(trimmed) &&
    /[0-9]/.test(trimmed)
  );
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
  return fingerprintString(serializeDeterministicJson(value));
}

function fingerprintString(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
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
