import type {
  ApiResponse,
  ApiRoute,
  ApiRouter,
} from "./router.ts";
import { jsonError, jsonResponse } from "./router.ts";

export type QuarantineDecision = "release" | "discard";
export type QuarantineStatus = "pending" | "released" | "discarded";

export interface IngestSourceSummary {
  readonly sourceId: string;
  readonly label: string;
  readonly kind: string;
  readonly itemCount: number;
  readonly quarantinedCount: number;
  readonly updatedAt: string;
}

export interface IngestIndexedDocument {
  readonly id: string;
  readonly sourceId: string;
  readonly title: string;
  readonly text: string;
  readonly tags?: readonly string[];
  readonly updatedAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface IngestSearchRequest {
  readonly query: string;
  readonly sourceIds?: readonly string[];
  readonly limit?: number;
}

export interface IngestSearchHit {
  readonly id: string;
  readonly sourceId: string;
  readonly title: string;
  readonly snippet: string;
  readonly score: number;
  readonly tags: readonly string[];
  readonly updatedAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface IngestSearchResponse {
  readonly query: string;
  readonly count: number;
  readonly hits: readonly IngestSearchHit[];
}

export interface QuarantineRecord {
  readonly id: string;
  readonly sourceId: string;
  readonly itemId: string;
  readonly title: string;
  readonly reason: string;
  readonly status: QuarantineStatus;
  readonly createdAt: string;
  readonly decidedAt?: string;
  readonly decidedBy?: string;
  readonly decisionReason?: string;
}

export interface ApplyQuarantineDecisionRequest {
  readonly decision: QuarantineDecision;
  readonly reason?: string;
  readonly actorId?: string;
}

export interface IngestRouteState {
  listSourceSummaries(): readonly IngestSourceSummary[];
  searchLocalIndex(request: IngestSearchRequest): IngestSearchResponse;
  listQuarantineRecords(): readonly QuarantineRecord[];
  applyQuarantineDecision(
    recordId: string,
    request: ApplyQuarantineDecisionRequest,
  ): QuarantineRecord;
}

export interface IngestRouteStateSeed {
  readonly sources?: readonly IngestSourceSummary[];
  readonly documents?: readonly IngestIndexedDocument[];
  readonly quarantineRecords?: readonly QuarantineRecord[];
  readonly now?: () => string;
}

export interface IngestRoutesOptions {
  readonly basePath?: string;
}

export class IngestRouteError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "IngestRouteError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function createMemoryIngestRouteState(
  seed: IngestRouteStateSeed = {},
): IngestRouteState {
  const now = seed.now ?? (() => new Date().toISOString());
  const sourceSummaries = new Map(
    (seed.sources ?? []).map((source) => [source.sourceId, cloneSourceSummary(source)]),
  );
  const documents = (seed.documents ?? []).map(cloneDocument);
  const quarantineRecords = new Map(
    (seed.quarantineRecords ?? []).map((record) => [record.id, cloneQuarantineRecord(record)]),
  );

  return {
    listSourceSummaries() {
      return sortSourceSummaries([...sourceSummaries.values()].map(cloneSourceSummary));
    },

    searchLocalIndex(request) {
      const query = request.query.trim();
      const tokens = tokenize(query);
      const allowedSourceIds = request.sourceIds === undefined
        ? undefined
        : new Set(request.sourceIds);
      const limit = request.limit ?? 20;
      const hits = documents
        .filter((document) =>
          allowedSourceIds === undefined || allowedSourceIds.has(document.sourceId),
        )
        .map((document) => scoreDocument(document, query, tokens))
        .filter((hit): hit is IngestSearchHit => hit !== undefined)
        .sort(compareSearchHits)
        .slice(0, limit);

      return {
        query,
        count: hits.length,
        hits: hits.map(cloneSearchHit),
      };
    },

    listQuarantineRecords() {
      return sortQuarantineRecords([...quarantineRecords.values()].map(cloneQuarantineRecord));
    },

    applyQuarantineDecision(recordId, request) {
      const existing = quarantineRecords.get(recordId);
      if (existing === undefined) {
        throw new IngestRouteError(
          404,
          "quarantine_record_not_found",
          "Quarantine record was not found.",
          { path: "params.recordId" },
        );
      }
      if (existing.status !== "pending") {
        throw new IngestRouteError(
          409,
          "quarantine_record_closed",
          "Quarantine record already has a final state.",
          { recordId },
        );
      }

      const updated: QuarantineRecord = {
        ...existing,
        status: request.decision === "release" ? "released" : "discarded",
        decidedAt: now(),
        decidedBy: request.actorId,
        decisionReason: request.reason,
      };
      quarantineRecords.set(recordId, cloneQuarantineRecord(updated));
      return cloneQuarantineRecord(updated);
    },
  };
}

export function createIngestRouteFixtureState(): IngestRouteState {
  return createMemoryIngestRouteState({
    now: () => "2026-04-27T00:30:00.000Z",
    sources: [
      {
        sourceId: "src_design_notes",
        label: "Design Notes",
        kind: "folder",
        itemCount: 2,
        quarantinedCount: 1,
        updatedAt: "2026-04-27T00:20:00.000Z",
      },
      {
        sourceId: "src_research_clips",
        label: "Research Clips",
        kind: "import",
        itemCount: 1,
        quarantinedCount: 0,
        updatedAt: "2026-04-27T00:12:00.000Z",
      },
    ],
    documents: [
      {
        id: "doc_alpha",
        sourceId: "src_design_notes",
        title: "Alpha local index",
        text: "Alpha notes describe local search scoring and source summaries.",
        tags: ["alpha", "notes"],
        updatedAt: "2026-04-27T00:20:00.000Z",
        metadata: { path: "notes/alpha.md" },
      },
      {
        id: "doc_beta",
        sourceId: "src_research_clips",
        title: "Beta import",
        text: "Alpha appears once in this clipped reference.",
        tags: ["clip"],
        updatedAt: "2026-04-27T00:12:00.000Z",
      },
      {
        id: "doc_gamma",
        sourceId: "src_design_notes",
        title: "Gamma outline",
        text: "This outline tracks unrelated local notes.",
        tags: ["outline"],
        updatedAt: "2026-04-27T00:10:00.000Z",
      },
    ],
    quarantineRecords: [
      {
        id: "qrn_alpha",
        sourceId: "src_design_notes",
        itemId: "raw_alpha",
        title: "Raw alpha note",
        reason: "Missing required metadata.",
        status: "pending",
        createdAt: "2026-04-27T00:21:00.000Z",
      },
      {
        id: "qrn_closed",
        sourceId: "src_design_notes",
        itemId: "raw_closed",
        title: "Closed note",
        reason: "Duplicate item.",
        status: "discarded",
        createdAt: "2026-04-27T00:05:00.000Z",
        decidedAt: "2026-04-27T00:06:00.000Z",
        decidedBy: "act_fixture",
        decisionReason: "Duplicate of doc_alpha.",
      },
    ],
  });
}

export function createIngestRoutes(
  state: IngestRouteState,
  options: IngestRoutesOptions = {},
): readonly ApiRoute[] {
  const basePath = normalizeBasePath(options.basePath ?? "/v1/ingest");

  return [
    {
      method: "GET",
      path: joinPath(basePath, "/sources"),
      description: "Lists local ingest source summaries.",
      handler: () => jsonResponse(200, { sources: state.listSourceSummaries() }),
    },
    {
      method: "POST",
      path: joinPath(basePath, "/search"),
      description: "Searches the local ingest index.",
      handler: ({ request }) => {
        const parsed = parseSearchRequest(request.body);
        if (!parsed.ok) {
          return parsed.error;
        }

        return jsonResponse(200, state.searchLocalIndex(parsed.value));
      },
    },
    {
      method: "GET",
      path: joinPath(basePath, "/quarantine"),
      description: "Lists local quarantine records.",
      handler: () => jsonResponse(200, { records: state.listQuarantineRecords() }),
    },
    {
      method: "POST",
      path: joinPath(basePath, "/quarantine/:recordId/decision"),
      description: "Applies a local quarantine decision.",
      handler: ({ params, request }) => {
        const parsed = parseDecisionRequest(request.body, request.actorId);
        if (!parsed.ok) {
          return parsed.error;
        }

        try {
          return jsonResponse(200, {
            record: state.applyQuarantineDecision(params.recordId, parsed.value),
          });
        } catch (error) {
          return caughtIngestRouteError(error);
        }
      },
    },
  ];
}

export function mountIngestRoutes(
  router: ApiRouter,
  state: IngestRouteState,
  options: IngestRoutesOptions = {},
): ApiRouter {
  for (const route of createIngestRoutes(state, options)) {
    router.register(route);
  }

  return router;
}

function parseSearchRequest(
  body: unknown,
): { ok: true; value: IngestSearchRequest } | { ok: false; error: ApiResponse } {
  if (!isRecord(body)) {
    return {
      ok: false,
      error: validationError("Request body must be an object.", { path: "body" }),
    };
  }

  const query = readTrimmedString(body.query);
  if (query === undefined) {
    return {
      ok: false,
      error: validationError("Search query must be a non-empty string.", { path: "body.query" }),
    };
  }

  const sourceIds = parseOptionalStringArray(body.sourceIds, "body.sourceIds");
  if (!sourceIds.ok) {
    return sourceIds;
  }

  const limit = parseOptionalLimit(body.limit);
  if (!limit.ok) {
    return limit;
  }

  return {
    ok: true,
    value: {
      query,
      ...(sourceIds.value === undefined ? {} : { sourceIds: sourceIds.value }),
      ...(limit.value === undefined ? {} : { limit: limit.value }),
    },
  };
}

function parseDecisionRequest(
  body: unknown,
  actorId: string | undefined,
): {
  ok: true;
  value: ApplyQuarantineDecisionRequest;
} | { ok: false; error: ApiResponse } {
  if (!isRecord(body)) {
    return {
      ok: false,
      error: validationError("Request body must be an object.", { path: "body" }),
    };
  }

  if (body.decision !== "release" && body.decision !== "discard") {
    return {
      ok: false,
      error: validationError("Decision must be release or discard.", { path: "body.decision" }),
    };
  }

  const reason = parseOptionalTrimmedString(body.reason, "body.reason");
  if (!reason.ok) {
    return reason;
  }

  const bodyActorId = parseOptionalTrimmedString(body.actorId, "body.actorId");
  if (!bodyActorId.ok) {
    return bodyActorId;
  }

  return {
    ok: true,
    value: {
      decision: body.decision,
      ...(reason.value === undefined ? {} : { reason: reason.value }),
      actorId: bodyActorId.value ?? actorId,
    },
  };
}

function parseOptionalStringArray(
  value: unknown,
  path: string,
): { ok: true; value: readonly string[] | undefined } | { ok: false; error: ApiResponse } {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (!Array.isArray(value)) {
    return {
      ok: false,
      error: validationError("Value must be an array of non-empty strings.", { path }),
    };
  }

  const values: string[] = [];
  for (const [index, item] of value.entries()) {
    const parsed = readTrimmedString(item);
    if (parsed === undefined) {
      return {
        ok: false,
        error: validationError("Value must be an array of non-empty strings.", {
          path: `${path}.${index}`,
        }),
      };
    }
    values.push(parsed);
  }

  return { ok: true, value: Object.freeze(values) };
}

function parseOptionalLimit(
  value: unknown,
): { ok: true; value: number | undefined } | { ok: false; error: ApiResponse } {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (!Number.isInteger(value) || value < 1 || value > 50) {
    return {
      ok: false,
      error: validationError("Limit must be an integer from 1 to 50.", { path: "body.limit" }),
    };
  }

  return { ok: true, value };
}

function parseOptionalTrimmedString(
  value: unknown,
  path: string,
): { ok: true; value: string | undefined } | { ok: false; error: ApiResponse } {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  const parsed = readTrimmedString(value);
  if (parsed === undefined) {
    return {
      ok: false,
      error: validationError("Value must be a non-empty string.", { path }),
    };
  }

  return { ok: true, value: parsed };
}

function scoreDocument(
  document: IngestIndexedDocument,
  query: string,
  tokens: readonly string[],
): IngestSearchHit | undefined {
  const title = document.title.toLowerCase();
  const text = document.text.toLowerCase();
  const tags = [...(document.tags ?? [])];
  const tagText = tags.join(" ").toLowerCase();
  const score = tokens.reduce(
    (total, token) =>
      total +
      countOccurrences(title, token) * 4 +
      countOccurrences(tagText, token) * 2 +
      countOccurrences(text, token),
    0,
  );

  if (score <= 0) {
    return undefined;
  }

  return {
    id: document.id,
    sourceId: document.sourceId,
    title: document.title,
    snippet: createSnippet(document, query, tokens),
    score,
    tags,
    updatedAt: document.updatedAt,
    metadata: cloneMetadata(document.metadata),
  };
}

function createSnippet(
  document: IngestIndexedDocument,
  query: string,
  tokens: readonly string[],
): string {
  const haystack = `${document.title} ${document.text}`.replace(/\s+/g, " ").trim();
  const lowerHaystack = haystack.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const queryIndex = lowerHaystack.indexOf(lowerQuery);
  const firstIndex = queryIndex >= 0
    ? queryIndex
    : Math.min(
      ...tokens
        .map((token) => lowerHaystack.indexOf(token))
        .filter((index) => index >= 0),
    );
  const start = Math.max(0, firstIndex - 24);
  const end = Math.min(haystack.length, firstIndex + query.length + 72);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < haystack.length ? "..." : "";

  return `${prefix}${haystack.slice(start, end)}${suffix}`;
}

function compareSearchHits(left: IngestSearchHit, right: IngestSearchHit): number {
  return (
    right.score - left.score ||
    right.updatedAt.localeCompare(left.updatedAt) ||
    left.id.localeCompare(right.id)
  );
}

function tokenize(query: string): readonly string[] {
  return Object.freeze(
    query
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 0),
  );
}

function countOccurrences(value: string, token: string): number {
  let count = 0;
  let index = value.indexOf(token);
  while (index >= 0) {
    count += 1;
    index = value.indexOf(token, index + token.length);
  }

  return count;
}

function cloneSourceSummary(source: IngestSourceSummary): IngestSourceSummary {
  return Object.freeze({ ...source });
}

function cloneDocument(document: IngestIndexedDocument): IngestIndexedDocument {
  return Object.freeze({
    ...document,
    tags: Object.freeze([...(document.tags ?? [])]),
    metadata: cloneMetadata(document.metadata),
  });
}

function cloneSearchHit(hit: IngestSearchHit): IngestSearchHit {
  return Object.freeze({
    ...hit,
    tags: Object.freeze([...hit.tags]),
    metadata: cloneMetadata(hit.metadata),
  });
}

function cloneQuarantineRecord(record: QuarantineRecord): QuarantineRecord {
  return Object.freeze({ ...record });
}

function cloneMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> | undefined {
  return metadata === undefined
    ? undefined
    : structuredClone(metadata) as Readonly<Record<string, unknown>>;
}

function sortSourceSummaries(
  sources: readonly IngestSourceSummary[],
): readonly IngestSourceSummary[] {
  return Object.freeze(
    [...sources].sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
  );
}

function sortQuarantineRecords(
  records: readonly QuarantineRecord[],
): readonly QuarantineRecord[] {
  return Object.freeze(
    [...records].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id),
    ),
  );
}

function caughtIngestRouteError(error: unknown): ApiResponse {
  if (error instanceof IngestRouteError) {
    return jsonError(error.status, error.code, error.message, error.details);
  }

  return jsonError(500, "ingest_route_failed", "Ingest route failed.");
}

function validationError(
  message: string,
  details: Readonly<Record<string, unknown>>,
): ApiResponse {
  return jsonError(400, "validation_failed", message, details);
}

function readTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
