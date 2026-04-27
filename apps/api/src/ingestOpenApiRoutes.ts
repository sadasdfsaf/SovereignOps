import { createHash } from "node:crypto";

import type {
  IngestSearchFixtureBundle,
  LoadIngestSearchFixtureBundleOptions,
} from "./ingestFixtureServices.ts";
import { loadIngestSearchFixtureBundle } from "./ingestFixtureServices.ts";
import type {
  ApiResponse,
  ApiRoute,
  ApiRouter,
} from "./router.ts";
import { jsonError, jsonResponse } from "./router.ts";

export type IngestMediaType =
  | "text/plain"
  | "text/markdown"
  | "text/csv"
  | "application/json";

export type QuarantineState = "clear" | "open" | "released" | "rejected";
export type QuarantineDecisionAction = "release" | "reject";
export type QuarantineSeverity = "low" | "medium" | "high";

export interface IngestOptions {
  readonly trusted?: boolean;
  readonly requiredColumns?: readonly string[];
  readonly uniqueColumns?: readonly string[];
  readonly includePaths?: readonly string[];
  readonly maxTextBytes?: number;
}

export interface IngestNormalizeRequest {
  readonly workspaceId: string;
  readonly sourceUri: string;
  readonly mediaType: IngestMediaType;
  readonly content: string;
  readonly options?: IngestOptions;
}

export interface IngestNormalizeResponse {
  readonly ok: true;
  readonly sourceUri: string;
  readonly mediaType: IngestMediaType;
  readonly checksum: string;
  readonly normalizedText: string;
  readonly untrusted: boolean;
}

export interface SourceCitation {
  readonly sourceUri: string;
  readonly range: Readonly<Record<string, unknown>>;
  readonly trusted: boolean;
}

export interface IngestDocument {
  readonly id: string;
  readonly sourceUri: string;
  readonly mediaType: IngestMediaType;
  readonly checksum: string;
  readonly title: string;
  readonly untrusted: boolean;
  readonly quarantineState: QuarantineState;
  readonly citations: readonly SourceCitation[];
}

export interface QuarantineItem {
  readonly id: string;
  readonly sourceUri: string;
  readonly checksum: string;
  readonly reasonCode: string;
  readonly citation: SourceCitation;
  readonly untrusted: boolean;
  readonly quarantineState: "open";
}

export interface StructuredIngestRequest extends IngestNormalizeRequest {}

export interface StructuredIngestResponse {
  readonly ok: true;
  readonly sourceUri: string;
  readonly mediaType: IngestMediaType;
  readonly summary: {
    readonly documentCount: number;
    readonly indexedCount: number;
    readonly quarantineCount: number;
    readonly validationErrorCount: number;
  };
  readonly documents: readonly IngestDocument[];
  readonly quarantine: {
    readonly items: readonly QuarantineItem[];
  };
}

export interface RepositoryScanRequest {
  readonly workspaceId: string;
  readonly localPath: string;
  readonly options: IngestOptions;
}

export interface RepositorySourceRecord {
  readonly sourceUri: string;
  readonly path: string;
  readonly mediaType: IngestMediaType;
  readonly checksum: string;
  readonly state: "indexed" | "partly_quarantined";
  readonly untrusted: boolean;
}

export interface RepositoryScanResponse {
  readonly ok: true;
  readonly workspaceId: string;
  readonly sources: readonly RepositorySourceRecord[];
}

export interface SearchFilters {
  readonly mediaTypes?: readonly IngestMediaType[];
  readonly sourceUris?: readonly string[];
  readonly tags?: readonly string[];
}

export interface SearchQueryRequest {
  readonly workspaceId: string;
  readonly query: string;
  readonly filters?: SearchFilters;
  readonly limit?: number;
}

export interface SearchResult extends IngestDocument {
  readonly score: number;
  readonly matchedTerms: readonly string[];
  readonly snippet: string;
  readonly quarantineState: "clear";
}

export interface SearchQueryResponse {
  readonly ok: true;
  readonly workspaceId: string;
  readonly query: string;
  readonly results: readonly SearchResult[];
}

export interface QuarantineCaseInput {
  readonly id: string;
  readonly sourceUri: string;
  readonly checksum: string;
  readonly reasonCode: string;
  readonly content: string;
  readonly citation: SourceCitation;
  readonly untrusted: boolean;
}

export interface QuarantineCasesRequest {
  readonly workspaceId: string;
  readonly items: readonly QuarantineCaseInput[];
}

export interface QuarantineCase {
  readonly id: string;
  readonly sourceUri: string;
  readonly state: QuarantineState;
  readonly reasonCodes: readonly string[];
  readonly severity: QuarantineSeverity;
  readonly citationSnapshots: readonly SourceCitation[];
  readonly previewText: string;
  readonly allowedActions: readonly QuarantineDecisionAction[];
}

export interface QuarantineCasesResponse {
  readonly ok: true;
  readonly cases: readonly QuarantineCase[];
}

export interface QuarantineDecisionRequest {
  readonly workspaceId: string;
  readonly actorId: string;
  readonly decision: QuarantineDecisionAction;
  readonly reason: string;
  readonly override?: boolean;
  readonly decidedAt: string;
}

export interface QuarantineDecisionResponse {
  readonly ok: true;
  readonly case: {
    readonly id: string;
    readonly sourceUri: string;
    readonly fromState: QuarantineState;
    readonly state: "released" | "rejected";
    readonly decision: {
      readonly action: QuarantineDecisionAction;
      readonly actorId: string;
      readonly timestamp: string;
      readonly reason: string;
      readonly override: boolean;
    };
  };
}

export interface IngestOpenApiIndexedDocument extends IngestDocument {
  readonly body: string;
  readonly tags?: readonly string[];
}

export interface IngestOpenApiRouteStateSeed {
  readonly repositorySources?: readonly RepositorySourceRecord[];
  readonly documents?: readonly IngestOpenApiIndexedDocument[];
  readonly quarantineCases?: readonly QuarantineCase[];
  readonly sourceChecksums?: Readonly<Record<string, string>>;
}

export interface IngestOpenApiRouteState {
  normalizeIngestContent(request: IngestNormalizeRequest): IngestNormalizeResponse;
  ingestStructuredContent(request: StructuredIngestRequest): StructuredIngestResponse;
  scanIngestRepository(request: RepositoryScanRequest): RepositoryScanResponse;
  queryLocalSearch(request: SearchQueryRequest): SearchQueryResponse;
  createQuarantineCases(request: QuarantineCasesRequest): QuarantineCasesResponse;
  decideQuarantineCase(
    caseId: string,
    request: QuarantineDecisionRequest,
  ): QuarantineDecisionResponse;
}

export interface IngestOpenApiRoutesOptions {
  readonly basePath?: string;
}

export class IngestOpenApiRouteError extends Error {
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
    this.name = "IngestOpenApiRouteError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function createMemoryIngestOpenApiRouteState(
  seed: IngestOpenApiRouteStateSeed = {},
): IngestOpenApiRouteState {
  const repositorySources = (seed.repositorySources ?? []).map(cloneRepositorySource);
  const documents = (seed.documents ?? []).map(cloneIndexedDocument);
  const quarantineCases = new Map(
    (seed.quarantineCases ?? []).map((item) => [item.id, cloneQuarantineCase(item)]),
  );
  const sourceChecksums = new Map<string, string>();

  for (const source of repositorySources) {
    sourceChecksums.set(source.sourceUri, source.checksum);
  }
  for (const [sourceUri, checksum] of Object.entries(seed.sourceChecksums ?? {})) {
    sourceChecksums.set(sourceUri, checksum);
  }

  return {
    normalizeIngestContent(request) {
      const normalizedText = normalizeText(request.content);
      return Object.freeze({
        ok: true,
        sourceUri: request.sourceUri,
        mediaType: request.mediaType,
        checksum: checksumForSource(sourceChecksums, request.sourceUri, request.content),
        normalizedText,
        untrusted: isUntrusted(request.options),
      });
    },

    ingestStructuredContent(request) {
      const checksum = checksumForSource(sourceChecksums, request.sourceUri, request.content);
      const normalizedText = normalizeText(request.content);
      const untrusted = isUntrusted(request.options);

      if (request.mediaType === "text/csv") {
        return ingestCsv({
          request,
          checksum,
          normalizedText,
          untrusted,
          documents,
          quarantineCases,
        });
      }

      const matchingDocuments = documents
        .filter((document) =>
          document.sourceUri === request.sourceUri &&
          document.mediaType === request.mediaType,
        )
        .map(toIngestDocument);
      const fallbackDocuments = matchingDocuments.length > 0
        ? matchingDocuments
        : [createSingleIngestDocument(request, checksum, normalizedText, untrusted)];

      return Object.freeze({
        ok: true,
        sourceUri: request.sourceUri,
        mediaType: request.mediaType,
        summary: Object.freeze({
          documentCount: fallbackDocuments.length,
          indexedCount: fallbackDocuments.length,
          quarantineCount: 0,
          validationErrorCount: 0,
        }),
        documents: Object.freeze(fallbackDocuments),
        quarantine: Object.freeze({ items: Object.freeze([]) }),
      });
    },

    scanIngestRepository(request) {
      const includePaths = request.options.includePaths;
      const basePath = normalizeLocalPath(request.localPath);
      const untrusted = isUntrusted(request.options);
      const sources = repositorySources
        .filter((source) => isSourceUnderPath(source.path, basePath))
        .filter((source) => isIncludedSource(source.path, basePath, includePaths))
        .map((source) => Object.freeze({ ...source, untrusted }));

      return Object.freeze({
        ok: true,
        workspaceId: request.workspaceId,
        sources: Object.freeze(sortRepositorySources(sources, basePath, includePaths)),
      });
    },

    queryLocalSearch(request) {
      const tokens = tokenize(request.query);
      const limit = request.limit ?? 10;
      const filters = request.filters ?? {};
      const results = documents
        .filter((document) => document.quarantineState === "clear")
        .filter((document) => matchesSearchFilters(document, filters))
        .map((document) => scoreSearchDocument(document, tokens))
        .filter((result): result is SearchResult => result !== undefined)
        .sort(compareSearchResults)
        .slice(0, limit)
        .map(cloneSearchResult);

      return Object.freeze({
        ok: true,
        workspaceId: request.workspaceId,
        query: request.query.trim(),
        results: Object.freeze(results),
      });
    },

    createQuarantineCases(request) {
      const cases = request.items.map((item) => {
        const reviewCase = createQuarantineCaseFromInput(item);
        quarantineCases.set(reviewCase.id, cloneQuarantineCase(reviewCase));
        return reviewCase;
      });

      return Object.freeze({
        ok: true,
        cases: Object.freeze(cases),
      });
    },

    decideQuarantineCase(caseId, request) {
      const existing = quarantineCases.get(caseId);
      if (existing === undefined) {
        throw new IngestOpenApiRouteError(
          404,
          "quarantine_case_not_found",
          "Quarantine case was not found.",
          { path: "params.caseId" },
        );
      }
      if (existing.state !== "open") {
        throw new IngestOpenApiRouteError(
          409,
          "quarantine_case_closed",
          "Quarantine case already has a final state.",
          { caseId },
        );
      }

      const nextState = request.decision === "release" ? "released" : "rejected";
      const updatedCase: QuarantineCase = Object.freeze({
        ...existing,
        state: nextState,
        allowedActions: Object.freeze([]),
      });
      quarantineCases.set(caseId, cloneQuarantineCase(updatedCase));

      return Object.freeze({
        ok: true,
        case: Object.freeze({
          id: existing.id,
          sourceUri: existing.sourceUri,
          fromState: existing.state,
          state: nextState,
          decision: Object.freeze({
            action: request.decision,
            actorId: request.actorId,
            timestamp: request.decidedAt,
            reason: request.reason,
            override: request.override ?? false,
          }),
        }),
      });
    },
  };
}

export function createIngestOpenApiRouteStateFromFixtures(
  fixtures: IngestSearchFixtureBundle,
): IngestOpenApiRouteState {
  return createMemoryIngestOpenApiRouteState(
    createIngestOpenApiRouteStateSeedFromFixtures(fixtures),
  );
}

export function createIngestOpenApiRouteStateSeedFromFixtures(
  fixtures: IngestSearchFixtureBundle,
): IngestOpenApiRouteStateSeed {
  return Object.freeze({
    repositorySources: Object.freeze(
      fixtures.repository.sources.map((source): RepositorySourceRecord => Object.freeze({
        sourceUri: source.sourceUri,
        path: source.path,
        mediaType: asIngestMediaType(source.mediaType),
        checksum: source.checksum,
        state: asRepositoryState(source.state),
        untrusted: true,
      })),
    ),
    documents: Object.freeze(
      fixtures.searchIndex.documents.map((document): IngestOpenApiIndexedDocument => Object.freeze({
        id: document.id,
        sourceUri: document.sourceUri,
        mediaType: asIngestMediaType(document.mediaType),
        checksum: document.checksum,
        title: document.title,
        body: document.body,
        citations: Object.freeze(document.citations.map(cloneCitation)),
        untrusted: document.untrusted,
        quarantineState: asQuarantineState(document.quarantineState),
      })),
    ),
    quarantineCases: Object.freeze(
      fixtures.quarantine.items.map((item): QuarantineCase => Object.freeze({
        id: item.id,
        sourceUri: item.sourceUri,
        state: "open",
        reasonCodes: Object.freeze([item.reasonCode]),
        severity: severityForReasonCode(item.reasonCode),
        citationSnapshots: Object.freeze([cloneCitation(item.citation)]),
        previewText: item.reason,
        allowedActions: Object.freeze(["release", "reject"]),
      })),
    ),
  });
}

export function createIngestOpenApiRouteStateFromIngestSearchFixtures(
  options: LoadIngestSearchFixtureBundleOptions = {},
): IngestOpenApiRouteState {
  return createIngestOpenApiRouteStateFromFixtures(loadIngestSearchFixtureBundle(options));
}

export function createIngestOpenApiRoutes(
  state: IngestOpenApiRouteState,
  options: IngestOpenApiRoutesOptions = {},
): readonly ApiRoute[] {
  const basePath = normalizeBasePath(options.basePath ?? "/v1");

  return Object.freeze([
    {
      method: "POST",
      path: joinPath(basePath, "/ingest/normalize"),
      description: "Normalizes local ingest text.",
      handler: ({ request }) => {
        const parsed = parseNormalizeRequest(request.body);
        if (!parsed.ok) {
          return parsed.error;
        }

        try {
          return jsonResponse(200, state.normalizeIngestContent(parsed.value));
        } catch (error) {
          return caughtIngestOpenApiError(error);
        }
      },
    },
    {
      method: "POST",
      path: joinPath(basePath, "/ingest/structured"),
      description: "Parses structured local ingest content.",
      handler: ({ request }) => {
        const parsed = parseStructuredIngestRequest(request.body);
        if (!parsed.ok) {
          return parsed.error;
        }

        try {
          return jsonResponse(200, state.ingestStructuredContent(parsed.value));
        } catch (error) {
          return caughtIngestOpenApiError(error);
        }
      },
    },
    {
      method: "POST",
      path: joinPath(basePath, "/ingest/repository/scan"),
      description: "Scans known local repository sources.",
      handler: ({ request }) => {
        const parsed = parseRepositoryScanRequest(request.body);
        if (!parsed.ok) {
          return parsed.error;
        }

        try {
          return jsonResponse(200, state.scanIngestRepository(parsed.value));
        } catch (error) {
          return caughtIngestOpenApiError(error);
        }
      },
    },
    {
      method: "POST",
      path: joinPath(basePath, "/search/query"),
      description: "Queries the local search index.",
      handler: ({ request }) => {
        const parsed = parseSearchQueryRequest(request.body);
        if (!parsed.ok) {
          return parsed.error;
        }

        try {
          return jsonResponse(200, state.queryLocalSearch(parsed.value));
        } catch (error) {
          return caughtIngestOpenApiError(error);
        }
      },
    },
    {
      method: "POST",
      path: joinPath(basePath, "/quarantine/cases"),
      description: "Builds local quarantine review cases.",
      handler: ({ request }) => {
        const parsed = parseQuarantineCasesRequest(request.body);
        if (!parsed.ok) {
          return parsed.error;
        }

        try {
          return jsonResponse(200, state.createQuarantineCases(parsed.value));
        } catch (error) {
          return caughtIngestOpenApiError(error);
        }
      },
    },
    {
      method: "POST",
      path: joinPath(basePath, "/quarantine/cases/:caseId/decision"),
      description: "Records a local quarantine decision.",
      handler: ({ params, request }) => {
        if (!isQuarantineCaseId(params.caseId)) {
          return validationError("Quarantine case id is invalid.", { path: "params.caseId" });
        }

        const parsed = parseQuarantineDecisionRequest(request.body);
        if (!parsed.ok) {
          return parsed.error;
        }

        try {
          return jsonResponse(200, state.decideQuarantineCase(params.caseId, parsed.value));
        } catch (error) {
          return caughtIngestOpenApiError(error);
        }
      },
    },
  ]);
}

export function mountIngestOpenApiRoutes(
  router: ApiRouter,
  state: IngestOpenApiRouteState,
  options: IngestOpenApiRoutesOptions = {},
): ApiRouter {
  for (const route of createIngestOpenApiRoutes(state, options)) {
    router.register(route);
  }

  return router;
}

type Parsed<TValue> = { ok: true; value: TValue } | { ok: false; error: ApiResponse };

interface CsvIngestContext {
  readonly request: StructuredIngestRequest;
  readonly checksum: string;
  readonly normalizedText: string;
  readonly untrusted: boolean;
  readonly documents: readonly IngestOpenApiIndexedDocument[];
  readonly quarantineCases: Map<string, QuarantineCase>;
}

interface CsvTable {
  readonly headers: readonly string[];
  readonly rows: readonly CsvRow[];
}

interface CsvRow {
  readonly lineNumber: number;
  readonly values: Readonly<Record<string, string>>;
}

function ingestCsv(context: CsvIngestContext): StructuredIngestResponse {
  const parsedTable = parseCsvTable(context.normalizedText);
  const requiredColumns = context.request.options?.requiredColumns ?? [];
  const indexedRows: CsvRow[] = [];
  const quarantineItems: QuarantineItem[] = [];
  let validationErrorCount = 0;

  for (const row of parsedTable.rows) {
    const missingRequired = requiredColumns.filter((column) =>
      readTrimmedString(row.values[column]) === undefined,
    );
    if (missingRequired.length > 0) {
      validationErrorCount += missingRequired.length;
      quarantineItems.push(createCsvQuarantineItem(context, row, "missing_required_column"));
      continue;
    }

    if (rowNeedsReview(row)) {
      quarantineItems.push(createCsvQuarantineItem(context, row, "needs_local_review"));
      continue;
    }

    indexedRows.push(row);
  }

  const matchingDocuments = context.documents
    .filter((document) =>
      document.sourceUri === context.request.sourceUri &&
      document.mediaType === context.request.mediaType,
    )
    .map(toIngestDocument);
  const documents = matchingDocuments.length > 0
    ? matchingDocuments
    : indexedRows.map((row) => createCsvIngestDocument(context, row));

  return Object.freeze({
    ok: true,
    sourceUri: context.request.sourceUri,
    mediaType: context.request.mediaType,
    summary: Object.freeze({
      documentCount: parsedTable.rows.length,
      indexedCount: indexedRows.length,
      quarantineCount: quarantineItems.length,
      validationErrorCount,
    }),
    documents: Object.freeze(documents),
    quarantine: Object.freeze({ items: Object.freeze(quarantineItems) }),
  });
}

function parseNormalizeRequest(body: unknown): Parsed<IngestNormalizeRequest> {
  const root = parseObjectBody(body);
  if (!root.ok) {
    return root;
  }

  const workspaceId = parseNonEmptyString(root.value.workspaceId, "body.workspaceId");
  if (!workspaceId.ok) {
    return workspaceId;
  }
  const sourceUri = parseSourceUri(root.value.sourceUri, "body.sourceUri");
  if (!sourceUri.ok) {
    return sourceUri;
  }
  const mediaType = parseMediaType(root.value.mediaType, "body.mediaType");
  if (!mediaType.ok) {
    return mediaType;
  }
  if (typeof root.value.content !== "string") {
    return validationFailure("Content must be a string.", { path: "body.content" });
  }
  const options = parseOptions(root.value.options, "body.options");
  if (!options.ok) {
    return options;
  }

  return {
    ok: true,
    value: {
      workspaceId: workspaceId.value,
      sourceUri: sourceUri.value,
      mediaType: mediaType.value,
      content: root.value.content,
      ...(options.value === undefined ? {} : { options: options.value }),
    },
  };
}

function parseStructuredIngestRequest(body: unknown): Parsed<StructuredIngestRequest> {
  return parseNormalizeRequest(body);
}

function parseRepositoryScanRequest(body: unknown): Parsed<RepositoryScanRequest> {
  const root = parseObjectBody(body);
  if (!root.ok) {
    return root;
  }

  const workspaceId = parseNonEmptyString(root.value.workspaceId, "body.workspaceId");
  if (!workspaceId.ok) {
    return workspaceId;
  }
  const localPath = parseLocalPath(root.value.localPath, "body.localPath");
  if (!localPath.ok) {
    return localPath;
  }
  const options = parseOptions(root.value.options, "body.options", { required: true });
  if (!options.ok) {
    return options;
  }

  return {
    ok: true,
    value: {
      workspaceId: workspaceId.value,
      localPath: localPath.value,
      options: options.value,
    },
  };
}

function parseSearchQueryRequest(body: unknown): Parsed<SearchQueryRequest> {
  const root = parseObjectBody(body);
  if (!root.ok) {
    return root;
  }

  const workspaceId = parseNonEmptyString(root.value.workspaceId, "body.workspaceId");
  if (!workspaceId.ok) {
    return workspaceId;
  }
  const query = parseNonEmptyString(root.value.query, "body.query");
  if (!query.ok) {
    return query;
  }
  const filters = parseSearchFilters(root.value.filters);
  if (!filters.ok) {
    return filters;
  }
  const limit = parseOptionalInteger(root.value.limit, "body.limit", 1, 100);
  if (!limit.ok) {
    return limit;
  }

  return {
    ok: true,
    value: {
      workspaceId: workspaceId.value,
      query: query.value,
      ...(filters.value === undefined ? {} : { filters: filters.value }),
      ...(limit.value === undefined ? {} : { limit: limit.value }),
    },
  };
}

function parseQuarantineCasesRequest(body: unknown): Parsed<QuarantineCasesRequest> {
  const root = parseObjectBody(body);
  if (!root.ok) {
    return root;
  }

  const workspaceId = parseNonEmptyString(root.value.workspaceId, "body.workspaceId");
  if (!workspaceId.ok) {
    return workspaceId;
  }
  if (!Array.isArray(root.value.items) || root.value.items.length === 0) {
    return validationFailure("Items must be a non-empty array.", { path: "body.items" });
  }

  const items: QuarantineCaseInput[] = [];
  for (const [index, item] of root.value.items.entries()) {
    const parsed = parseQuarantineCaseInput(item, `body.items.${index}`);
    if (!parsed.ok) {
      return parsed;
    }
    items.push(parsed.value);
  }

  return {
    ok: true,
    value: {
      workspaceId: workspaceId.value,
      items: Object.freeze(items),
    },
  };
}

function parseQuarantineDecisionRequest(body: unknown): Parsed<QuarantineDecisionRequest> {
  const root = parseObjectBody(body);
  if (!root.ok) {
    return root;
  }

  const workspaceId = parseNonEmptyString(root.value.workspaceId, "body.workspaceId");
  if (!workspaceId.ok) {
    return workspaceId;
  }
  const actorId = parseActorId(root.value.actorId, "body.actorId");
  if (!actorId.ok) {
    return actorId;
  }
  const decision = parseDecisionAction(root.value.decision, "body.decision");
  if (!decision.ok) {
    return decision;
  }
  const reason = parseNonEmptyString(root.value.reason, "body.reason");
  if (!reason.ok) {
    return reason;
  }
  const decidedAt = parseIsoTimestamp(root.value.decidedAt, "body.decidedAt");
  if (!decidedAt.ok) {
    return decidedAt;
  }
  if (root.value.override !== undefined && typeof root.value.override !== "boolean") {
    return validationFailure("Override must be a boolean.", { path: "body.override" });
  }

  return {
    ok: true,
    value: {
      workspaceId: workspaceId.value,
      actorId: actorId.value,
      decision: decision.value,
      reason: reason.value,
      decidedAt: decidedAt.value,
      ...(root.value.override === undefined ? {} : { override: root.value.override }),
    },
  };
}

function parseObjectBody(body: unknown): Parsed<Record<string, unknown>> {
  if (!isRecord(body)) {
    return validationFailure("Request body must be an object.", { path: "body" });
  }

  return { ok: true, value: body };
}

function parseOptions(
  value: unknown,
  path: string,
  options: { readonly required?: boolean } = {},
): Parsed<IngestOptions | undefined> {
  if (value === undefined) {
    return options.required
      ? validationFailure("Options must be an object.", { path })
      : { ok: true, value: undefined };
  }
  if (!isRecord(value)) {
    return validationFailure("Options must be an object.", { path });
  }

  if (value.trusted !== undefined && typeof value.trusted !== "boolean") {
    return validationFailure("Trusted must be a boolean.", { path: `${path}.trusted` });
  }
  const requiredColumns = parseOptionalStringArray(value.requiredColumns, `${path}.requiredColumns`);
  if (!requiredColumns.ok) {
    return requiredColumns;
  }
  const uniqueColumns = parseOptionalStringArray(value.uniqueColumns, `${path}.uniqueColumns`);
  if (!uniqueColumns.ok) {
    return uniqueColumns;
  }
  const includePaths = parseOptionalLocalPathArray(value.includePaths, `${path}.includePaths`);
  if (!includePaths.ok) {
    return includePaths;
  }
  const maxTextBytes = parseOptionalInteger(value.maxTextBytes, `${path}.maxTextBytes`, 1);
  if (!maxTextBytes.ok) {
    return maxTextBytes;
  }

  return {
    ok: true,
    value: Object.freeze({
      ...(value.trusted === undefined ? {} : { trusted: value.trusted }),
      ...(requiredColumns.value === undefined ? {} : { requiredColumns: requiredColumns.value }),
      ...(uniqueColumns.value === undefined ? {} : { uniqueColumns: uniqueColumns.value }),
      ...(includePaths.value === undefined ? {} : { includePaths: includePaths.value }),
      ...(maxTextBytes.value === undefined ? {} : { maxTextBytes: maxTextBytes.value }),
    }),
  };
}

function parseSearchFilters(value: unknown): Parsed<SearchFilters | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (!isRecord(value)) {
    return validationFailure("Filters must be an object.", { path: "body.filters" });
  }

  const mediaTypes = parseOptionalMediaTypeArray(value.mediaTypes, "body.filters.mediaTypes");
  if (!mediaTypes.ok) {
    return mediaTypes;
  }
  const sourceUris = parseOptionalSourceUriArray(value.sourceUris, "body.filters.sourceUris");
  if (!sourceUris.ok) {
    return sourceUris;
  }
  const tags = parseOptionalStringArray(value.tags, "body.filters.tags");
  if (!tags.ok) {
    return tags;
  }

  return {
    ok: true,
    value: Object.freeze({
      ...(mediaTypes.value === undefined ? {} : { mediaTypes: mediaTypes.value }),
      ...(sourceUris.value === undefined ? {} : { sourceUris: sourceUris.value }),
      ...(tags.value === undefined ? {} : { tags: tags.value }),
    }),
  };
}

function parseQuarantineCaseInput(value: unknown, path: string): Parsed<QuarantineCaseInput> {
  if (!isRecord(value)) {
    return validationFailure("Quarantine item must be an object.", { path });
  }

  const id = parseQuarantineCaseId(value.id, `${path}.id`);
  if (!id.ok) {
    return id;
  }
  const sourceUri = parseSourceUri(value.sourceUri, `${path}.sourceUri`);
  if (!sourceUri.ok) {
    return sourceUri;
  }
  const checksum = parseChecksum(value.checksum, `${path}.checksum`);
  if (!checksum.ok) {
    return checksum;
  }
  const reasonCode = parseNonEmptyString(value.reasonCode, `${path}.reasonCode`);
  if (!reasonCode.ok) {
    return reasonCode;
  }
  if (typeof value.content !== "string") {
    return validationFailure("Content must be a string.", { path: `${path}.content` });
  }
  const citation = parseCitation(value.citation, `${path}.citation`);
  if (!citation.ok) {
    return citation;
  }
  if (typeof value.untrusted !== "boolean") {
    return validationFailure("Untrusted must be a boolean.", { path: `${path}.untrusted` });
  }

  return {
    ok: true,
    value: {
      id: id.value,
      sourceUri: sourceUri.value,
      checksum: checksum.value,
      reasonCode: reasonCode.value,
      content: value.content,
      citation: citation.value,
      untrusted: value.untrusted,
    },
  };
}

function parseCitation(value: unknown, path: string): Parsed<SourceCitation> {
  if (!isRecord(value)) {
    return validationFailure("Citation must be an object.", { path });
  }

  const sourceUri = parseSourceUri(value.sourceUri, `${path}.sourceUri`);
  if (!sourceUri.ok) {
    return sourceUri;
  }
  if (!isRecord(value.range)) {
    return validationFailure("Citation range must be an object.", { path: `${path}.range` });
  }
  const range = parseSourceRange(value.range, `${path}.range`);
  if (!range.ok) {
    return range;
  }
  if (typeof value.trusted !== "boolean") {
    return validationFailure("Citation trusted flag must be a boolean.", {
      path: `${path}.trusted`,
    });
  }

  return {
    ok: true,
    value: Object.freeze({
      sourceUri: sourceUri.value,
      range: range.value,
      trusted: value.trusted,
    }),
  };
}

function parseSourceRange(
  value: Record<string, unknown>,
  path: string,
): Parsed<Readonly<Record<string, unknown>>> {
  if (value.start_line !== undefined || value.end_line !== undefined) {
    const startLine = parseRequiredInteger(value.start_line, `${path}.start_line`, 1);
    if (!startLine.ok) {
      return startLine;
    }
    const endLine = parseRequiredInteger(value.end_line, `${path}.end_line`, 1);
    if (!endLine.ok) {
      return endLine;
    }
    return {
      ok: true,
      value: Object.freeze({ start_line: startLine.value, end_line: endLine.value }),
    };
  }

  if (value.row !== undefined) {
    const row = parseRequiredInteger(value.row, `${path}.row`, 1);
    if (!row.ok) {
      return row;
    }
    if (
      value.column !== undefined &&
      typeof value.column !== "string" &&
      !Number.isInteger(value.column)
    ) {
      return validationFailure("Range column must be a string or integer.", {
        path: `${path}.column`,
      });
    }
    return {
      ok: true,
      value: Object.freeze({
        row: row.value,
        ...(value.column === undefined ? {} : { column: value.column }),
      }),
    };
  }

  if (value.path !== undefined) {
    if (typeof value.path !== "string" || !value.path.startsWith("$")) {
      return validationFailure("Range path must start with $.", { path: `${path}.path` });
    }
    return { ok: true, value: Object.freeze({ path: value.path }) };
  }

  return validationFailure("Citation range is unsupported.", { path });
}

function parseNonEmptyString(value: unknown, path: string): Parsed<string> {
  const parsed = readTrimmedString(value);
  if (parsed === undefined) {
    return validationFailure("Value must be a non-empty string.", { path });
  }

  return { ok: true, value: parsed };
}

function parseSourceUri(value: unknown, path: string): Parsed<string> {
  const parsed = parseNonEmptyString(value, path);
  if (!parsed.ok) {
    return parsed;
  }
  if (!/^(?:fixture|file|stdin|workspace|local):\/\/.+$/.test(parsed.value)) {
    return validationFailure("Source URI is invalid.", { path });
  }

  return parsed;
}

function parseLocalPath(value: unknown, path: string): Parsed<string> {
  const parsed = parseNonEmptyString(value, path);
  if (!parsed.ok) {
    return parsed;
  }
  if (!isLocalPath(parsed.value)) {
    return validationFailure("Local path must be relative and stay under the workspace.", { path });
  }

  return { ok: true, value: normalizeLocalPath(parsed.value) };
}

function parseMediaType(value: unknown, path: string): Parsed<IngestMediaType> {
  if (isIngestMediaType(value)) {
    return { ok: true, value };
  }

  return validationFailure("Media type is unsupported.", { path });
}

function parseChecksum(value: unknown, path: string): Parsed<string> {
  const parsed = parseNonEmptyString(value, path);
  if (!parsed.ok) {
    return parsed;
  }
  if (!/^[0-9a-f]{64}$/.test(parsed.value)) {
    return validationFailure("Checksum must be lowercase sha256.", { path });
  }

  return parsed;
}

function parseQuarantineCaseId(value: unknown, path: string): Parsed<string> {
  const parsed = parseNonEmptyString(value, path);
  if (!parsed.ok) {
    return parsed;
  }
  if (!isQuarantineCaseId(parsed.value)) {
    return validationFailure("Quarantine case id is invalid.", { path });
  }

  return parsed;
}

function parseActorId(value: unknown, path: string): Parsed<string> {
  const parsed = parseNonEmptyString(value, path);
  if (!parsed.ok) {
    return parsed;
  }
  if (!/^[A-Za-z0-9_.-]{1,120}$/.test(parsed.value)) {
    return validationFailure("Actor id is invalid.", { path });
  }

  return parsed;
}

function parseDecisionAction(value: unknown, path: string): Parsed<QuarantineDecisionAction> {
  if (value === "release" || value === "reject") {
    return { ok: true, value };
  }

  return validationFailure("Decision must be release or reject.", { path });
}

function parseIsoTimestamp(value: unknown, path: string): Parsed<string> {
  const parsed = parseNonEmptyString(value, path);
  if (!parsed.ok) {
    return parsed;
  }
  if (Number.isNaN(Date.parse(parsed.value))) {
    return validationFailure("Timestamp must be a valid ISO string.", { path });
  }

  return parsed;
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

function parseOptionalSourceUriArray(
  value: unknown,
  path: string,
): Parsed<readonly string[] | undefined> {
  const parsed = parseOptionalStringArray(value, path);
  if (!parsed.ok || parsed.value === undefined) {
    return parsed;
  }

  for (const [index, item] of parsed.value.entries()) {
    if (!/^(?:fixture|file|stdin|workspace|local):\/\/.+$/.test(item)) {
      return validationFailure("Source URI is invalid.", { path: `${path}.${index}` });
    }
  }

  return parsed;
}

function parseOptionalLocalPathArray(
  value: unknown,
  path: string,
): Parsed<readonly string[] | undefined> {
  const parsed = parseOptionalStringArray(value, path);
  if (!parsed.ok || parsed.value === undefined) {
    return parsed;
  }

  for (const [index, item] of parsed.value.entries()) {
    if (!isLocalPath(item)) {
      return validationFailure("Local path must be relative and stay under the workspace.", {
        path: `${path}.${index}`,
      });
    }
  }

  return {
    ok: true,
    value: Object.freeze(parsed.value.map(normalizeLocalPath)),
  };
}

function parseOptionalMediaTypeArray(
  value: unknown,
  path: string,
): Parsed<readonly IngestMediaType[] | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (!Array.isArray(value)) {
    return validationFailure("Media types must be an array.", { path });
  }

  const values: IngestMediaType[] = [];
  for (const [index, item] of value.entries()) {
    if (!isIngestMediaType(item)) {
      return validationFailure("Media type is unsupported.", { path: `${path}.${index}` });
    }
    values.push(item);
  }

  return { ok: true, value: Object.freeze(values) };
}

function parseRequiredInteger(value: unknown, path: string, min: number): Parsed<number> {
  if (!Number.isInteger(value) || value < min) {
    return validationFailure(`Value must be an integer greater than or equal to ${min}.`, { path });
  }

  return { ok: true, value };
}

function parseOptionalInteger(
  value: unknown,
  path: string,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): Parsed<number | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (!Number.isInteger(value) || value < min || value > max) {
    return validationFailure(`Value must be an integer from ${min} to ${max}.`, { path });
  }

  return { ok: true, value };
}

function createCsvQuarantineItem(
  context: CsvIngestContext,
  row: CsvRow,
  fallbackReasonCode: string,
): QuarantineItem {
  const existingCase = findSeededCaseForCsvRow(context.quarantineCases, context.request.sourceUri, row);
  const reasonCode = existingCase?.reasonCodes[0] ?? fallbackReasonCode;
  const item = Object.freeze({
    id: existingCase?.id ?? `qtn_${slug(row.values.id ?? String(row.lineNumber))}_status`,
    sourceUri: context.request.sourceUri,
    checksum: context.checksum,
    reasonCode,
    citation: Object.freeze({
      sourceUri: context.request.sourceUri,
      range: Object.freeze({
        row: row.lineNumber,
        column: row.values.status === undefined ? "id" : "status",
      }),
      trusted: !context.untrusted,
    }),
    untrusted: context.untrusted,
    quarantineState: "open" as const,
  });
  const reviewCase = createQuarantineCaseFromInput({
    ...item,
    content: row.values.title ?? item.id,
  });
  context.quarantineCases.set(reviewCase.id, cloneQuarantineCase(reviewCase));

  return item;
}

function createCsvIngestDocument(context: CsvIngestContext, row: CsvRow): IngestDocument {
  const title = readTrimmedString(row.values.title) ?? readTrimmedString(row.values.id) ?? "CSV row";
  return Object.freeze({
    id: `idx_${slug(row.values.id ?? String(row.lineNumber))}`,
    sourceUri: context.request.sourceUri,
    mediaType: context.request.mediaType,
    checksum: context.checksum,
    title,
    untrusted: context.untrusted,
    quarantineState: "clear",
    citations: Object.freeze([
      Object.freeze({
        sourceUri: context.request.sourceUri,
        range: Object.freeze({ row: row.lineNumber, column: "title" }),
        trusted: !context.untrusted,
      }),
    ]),
  });
}

function createSingleIngestDocument(
  request: StructuredIngestRequest,
  checksum: string,
  normalizedText: string,
  untrusted: boolean,
): IngestDocument {
  const title = deriveTitle(request.mediaType, normalizedText);
  return Object.freeze({
    id: `idx_${slug(title)}`,
    sourceUri: request.sourceUri,
    mediaType: request.mediaType,
    checksum,
    title,
    untrusted,
    quarantineState: "clear",
    citations: Object.freeze([
      Object.freeze({
        sourceUri: request.sourceUri,
        range: Object.freeze({ start_line: 1, end_line: Math.max(1, normalizedText.split("\n").length) }),
        trusted: !untrusted,
      }),
    ]),
  });
}

function createQuarantineCaseFromInput(item: QuarantineCaseInput): QuarantineCase {
  return Object.freeze({
    id: item.id,
    sourceUri: item.sourceUri,
    state: "open",
    reasonCodes: Object.freeze([item.reasonCode]),
    severity: severityForReasonCode(item.reasonCode),
    citationSnapshots: Object.freeze([cloneCitation(item.citation)]),
    previewText: normalizePreviewText(item.content),
    allowedActions: Object.freeze(["release", "reject"]),
  });
}

function scoreSearchDocument(
  document: IngestOpenApiIndexedDocument,
  tokens: readonly string[],
): SearchResult | undefined {
  const haystack = `${document.title} ${document.body} ${(document.tags ?? []).join(" ")}`
    .toLowerCase();
  const matchedTerms = tokens.filter((token) => haystack.includes(token));
  if (matchedTerms.length === 0) {
    return undefined;
  }

  return Object.freeze({
    ...toIngestDocument(document),
    score: matchedTerms.length,
    matchedTerms: Object.freeze(matchedTerms),
    snippet: createSearchSnippet(document.body, matchedTerms),
    quarantineState: "clear",
  });
}

function matchesSearchFilters(
  document: IngestOpenApiIndexedDocument,
  filters: SearchFilters,
): boolean {
  if (filters.mediaTypes !== undefined && !filters.mediaTypes.includes(document.mediaType)) {
    return false;
  }
  if (filters.sourceUris !== undefined && !filters.sourceUris.includes(document.sourceUri)) {
    return false;
  }
  if (
    filters.tags !== undefined &&
    filters.tags.length > 0 &&
    !filters.tags.some((tag) => (document.tags ?? []).includes(tag))
  ) {
    return false;
  }

  return true;
}

function parseCsvTable(content: string): CsvTable {
  const rows = parseCsvRows(content);
  if (rows.length === 0) {
    return { headers: Object.freeze([]), rows: Object.freeze([]) };
  }

  const headers = rows[0].map((header) => header.trim());
  return Object.freeze({
    headers: Object.freeze(headers),
    rows: Object.freeze(
      rows.slice(1).map((row, index) => Object.freeze({
        lineNumber: index + 2,
        values: Object.freeze(
          Object.fromEntries(headers.map((header, columnIndex) => [header, row[columnIndex] ?? ""])),
        ),
      })),
    ),
  });
}

function parseCsvRows(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (quoted) {
      if (char === "\"" && next === "\"") {
        field += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((candidate) => candidate.some((fieldValue) => fieldValue.trim().length > 0));
}

function rowNeedsReview(row: CsvRow): boolean {
  const status = (row.values.status ?? "").trim().toLowerCase();
  return status === "quarantine" || status === "review" || status === "hold";
}

function findSeededCaseForCsvRow(
  quarantineCases: ReadonlyMap<string, QuarantineCase>,
  sourceUri: string,
  row: CsvRow,
): QuarantineCase | undefined {
  for (const candidate of quarantineCases.values()) {
    if (candidate.sourceUri !== sourceUri) {
      continue;
    }
    if (
      candidate.citationSnapshots.some((citation) =>
        citation.range.row === row.lineNumber &&
        citation.range.column === "status",
      )
    ) {
      return candidate;
    }
  }

  return undefined;
}

function checksumForSource(
  checksums: ReadonlyMap<string, string>,
  sourceUri: string,
  content: string,
): string {
  return checksums.get(sourceUri) ?? sha256(content);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, "\n").trimEnd();
}

function normalizePreviewText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function deriveTitle(mediaType: IngestMediaType, content: string): string {
  if (mediaType === "text/markdown") {
    const heading = content
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.startsWith("#"));
    if (heading !== undefined) {
      return heading.replace(/^#+\s*/, "").trim() || "Markdown document";
    }
  }

  return content.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? "Local content";
}

function createSearchSnippet(body: string, matchedTerms: readonly string[]): string {
  const normalizedBody = body.replace(/\s+/g, " ").trim();
  if (normalizedBody.length <= 160) {
    return normalizedBody;
  }

  const lowerBody = normalizedBody.toLowerCase();
  const firstIndex = Math.min(
    ...matchedTerms
      .map((token) => lowerBody.indexOf(token))
      .filter((index) => index >= 0),
  );
  const start = Math.max(0, firstIndex - 40);
  const end = Math.min(normalizedBody.length, firstIndex + 120);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < normalizedBody.length ? "..." : "";

  return `${prefix}${normalizedBody.slice(start, end)}${suffix}`;
}

function sortRepositorySources(
  sources: readonly RepositorySourceRecord[],
  basePath: string,
  includePaths: readonly string[] | undefined,
): readonly RepositorySourceRecord[] {
  return Object.freeze(
    [...sources].sort((left, right) => {
      const leftRank = includeRank(left.path, basePath, includePaths);
      const rightRank = includeRank(right.path, basePath, includePaths);
      return leftRank - rightRank || left.path.localeCompare(right.path);
    }),
  );
}

function includeRank(
  sourcePath: string,
  basePath: string,
  includePaths: readonly string[] | undefined,
): number {
  if (includePaths === undefined) {
    return Number.MAX_SAFE_INTEGER;
  }
  const relativeSourcePath = relativeSourcePathUnderBase(sourcePath, basePath);
  const rank = includePaths.findIndex((item) => item === sourcePath || item === relativeSourcePath);

  return rank >= 0 ? rank : Number.MAX_SAFE_INTEGER;
}

function isSourceUnderPath(sourcePath: string, basePath: string): boolean {
  return sourcePath === basePath || sourcePath.startsWith(`${basePath}/`);
}

function isIncludedSource(
  sourcePath: string,
  basePath: string,
  includePaths: readonly string[] | undefined,
): boolean {
  if (includePaths === undefined || includePaths.length === 0) {
    return true;
  }
  const relativeSourcePath = relativeSourcePathUnderBase(sourcePath, basePath);
  return includePaths.includes(sourcePath) || includePaths.includes(relativeSourcePath);
}

function relativeSourcePathUnderBase(sourcePath: string, basePath: string): string {
  return sourcePath === basePath ? "" : sourcePath.slice(basePath.length + 1);
}

function compareSearchResults(left: SearchResult, right: SearchResult): number {
  return right.score - left.score || left.id.localeCompare(right.id);
}

function tokenize(query: string): readonly string[] {
  return Object.freeze(
    query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter((token, index, values) => token.length > 0 && values.indexOf(token) === index),
  );
}

function toIngestDocument(document: IngestOpenApiIndexedDocument): IngestDocument {
  return Object.freeze({
    id: document.id,
    sourceUri: document.sourceUri,
    mediaType: document.mediaType,
    checksum: document.checksum,
    title: document.title,
    citations: Object.freeze(document.citations.map(cloneCitation)),
    untrusted: document.untrusted,
    quarantineState: document.quarantineState,
  });
}

function cloneIndexedDocument(document: IngestOpenApiIndexedDocument): IngestOpenApiIndexedDocument {
  return Object.freeze({
    ...document,
    citations: Object.freeze(document.citations.map(cloneCitation)),
    tags: document.tags === undefined ? undefined : Object.freeze([...document.tags]),
  });
}

function cloneRepositorySource(source: RepositorySourceRecord): RepositorySourceRecord {
  return Object.freeze({ ...source });
}

function cloneSearchResult(result: SearchResult): SearchResult {
  return Object.freeze({
    ...result,
    matchedTerms: Object.freeze([...result.matchedTerms]),
    citations: Object.freeze(result.citations.map(cloneCitation)),
  });
}

function cloneQuarantineCase(reviewCase: QuarantineCase): QuarantineCase {
  return Object.freeze({
    ...reviewCase,
    reasonCodes: Object.freeze([...reviewCase.reasonCodes]),
    citationSnapshots: Object.freeze(reviewCase.citationSnapshots.map(cloneCitation)),
    allowedActions: Object.freeze([...reviewCase.allowedActions]),
  });
}

function cloneCitation(citation: SourceCitation): SourceCitation {
  return Object.freeze({
    sourceUri: citation.sourceUri,
    range: Object.freeze(structuredClone(citation.range)),
    trusted: citation.trusted,
  });
}

function isUntrusted(options: IngestOptions | undefined): boolean {
  return options?.trusted === true ? false : true;
}

function isIngestMediaType(value: unknown): value is IngestMediaType {
  return (
    value === "text/plain" ||
    value === "text/markdown" ||
    value === "text/csv" ||
    value === "application/json"
  );
}

function asIngestMediaType(value: string): IngestMediaType {
  if (isIngestMediaType(value)) {
    return value;
  }

  throw new IngestOpenApiRouteError(
    400,
    "validation_failed",
    "Media type is unsupported.",
    { value },
  );
}

function asRepositoryState(value: string): "indexed" | "partly_quarantined" {
  return value === "partly_quarantined" ? "partly_quarantined" : "indexed";
}

function asQuarantineState(value: string): QuarantineState {
  switch (value) {
    case "clear":
    case "open":
    case "released":
    case "rejected":
      return value;
    default:
      return "clear";
  }
}

function severityForReasonCode(reasonCode: string): QuarantineSeverity {
  const normalized = reasonCode.toLowerCase();
  if (normalized.includes("duplicate")) {
    return "low";
  }
  if (normalized.includes("required") || normalized.includes("review")) {
    return "medium";
  }

  return "medium";
}

function normalizeLocalPath(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
}

function isLocalPath(path: string): boolean {
  const normalized = normalizeLocalPath(path);
  return (
    normalized.length > 0 &&
    !/^[A-Za-z]:/.test(normalized) &&
    !normalized.startsWith("/") &&
    !normalized.split("/").includes("..")
  );
}

function isQuarantineCaseId(value: string): boolean {
  return /^qtn_[A-Za-z0-9_.-]{1,120}$/.test(value);
}

function slug(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "_");
  return normalized.replace(/^_+|_+$/g, "") || "local";
}

function readTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function caughtIngestOpenApiError(error: unknown): ApiResponse {
  if (error instanceof IngestOpenApiRouteError) {
    return jsonError(error.status, error.code, error.message, error.details);
  }

  return jsonError(500, "ingest_openapi_route_failed", "Ingest OpenAPI route failed.");
}

function validationError(
  message: string,
  details: Readonly<Record<string, unknown>>,
): ApiResponse {
  return jsonError(400, "validation_failed", message, details);
}

function validationFailure<TValue>(
  message: string,
  details: Readonly<Record<string, unknown>>,
): Parsed<TValue> {
  return { ok: false, error: validationError(message, details) };
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
