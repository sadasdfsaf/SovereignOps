import { readFileSync } from "node:fs";
import {
  basename,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";

import {
  createMemoryIngestRouteState,
  type IngestIndexedDocument,
  type IngestRouteState,
  type IngestRouteStateSeed,
  type IngestSourceSummary,
  type QuarantineRecord,
} from "./ingestRoutes.ts";

export const DEFAULT_INGEST_SEARCH_FIXTURE_DIRECTORY = "examples/ingest-search";

export interface IngestSearchFixturePaths {
  readonly repository: string;
  readonly searchIndex: string;
  readonly quarantine: string;
  readonly apiRequests: string;
}

export interface ResolveIngestSearchFixturePathsOptions {
  readonly workspaceRoot?: string;
  readonly fixtureDirectory?: string;
}

export interface LoadIngestSearchFixtureBundleOptions
  extends ResolveIngestSearchFixturePathsOptions {
  readonly paths?: Partial<IngestSearchFixturePaths>;
}

export interface IngestSearchFixtureBundle {
  readonly repository: IngestSearchRepositoryFixture;
  readonly searchIndex: IngestSearchIndexFixture;
  readonly quarantine: IngestSearchQuarantineFixture;
  readonly apiRequests: IngestSearchApiRequestsFixture;
}

export interface BuildIngestRouteFixtureStateOptions {
  readonly workspaceRoot?: string;
}

export interface IngestSearchRepositoryFixture {
  readonly schemaVersion: string;
  readonly workspaceId: string;
  readonly generatedAt: string;
  readonly sources: readonly IngestSearchRepositorySourceFixture[];
}

export interface IngestSearchRepositorySourceFixture {
  readonly sourceUri: string;
  readonly path: string;
  readonly mediaType: string;
  readonly checksum: string;
  readonly state: string;
}

export interface IngestSearchIndexFixture {
  readonly schemaVersion: string;
  readonly workspaceId: string;
  readonly generatedAt: string;
  readonly documents: readonly IngestSearchIndexDocumentFixture[];
}

export interface IngestSearchIndexDocumentFixture {
  readonly id: string;
  readonly sourceUri: string;
  readonly mediaType: string;
  readonly checksum: string;
  readonly title: string;
  readonly body: string;
  readonly citations: readonly IngestSearchCitationFixture[];
  readonly untrusted: boolean;
  readonly quarantineState: string;
}

export interface IngestSearchCitationFixture {
  readonly sourceUri: string;
  readonly range: Readonly<Record<string, unknown>>;
  readonly trusted: boolean;
}

export interface IngestSearchQuarantineFixture {
  readonly schemaVersion: string;
  readonly workspaceId: string;
  readonly items: readonly IngestSearchQuarantineItemFixture[];
}

export interface IngestSearchQuarantineItemFixture {
  readonly id: string;
  readonly sourceUri: string;
  readonly checksum: string;
  readonly reasonCode: string;
  readonly reason: string;
  readonly citation: IngestSearchCitationFixture;
  readonly untrusted: boolean;
}

export interface IngestSearchApiRequestsFixture {
  readonly schemaVersion: string;
  readonly generatedAt: string;
  readonly apiBase: string;
  readonly requests: readonly IngestSearchApiRequestFixture[];
}

export interface IngestSearchApiRequestFixture {
  readonly id: string;
  readonly title: string;
  readonly route: {
    readonly method: string;
    readonly path: string;
  };
  readonly request: Readonly<Record<string, unknown>>;
  readonly response: Readonly<Record<string, unknown>>;
}

export class IngestFixtureValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid ingest fixture bundle: ${issues.join("; ")}`);
    this.name = "IngestFixtureValidationError";
    this.issues = Object.freeze([...issues]);
  }
}

export function resolvePathUnderWorkspace(
  workspaceRoot: string,
  pathCandidate: string,
): string {
  if (typeof workspaceRoot !== "string" || workspaceRoot.trim().length === 0) {
    throw new IngestFixtureValidationError(["workspaceRoot must be a non-empty string"]);
  }
  if (typeof pathCandidate !== "string" || pathCandidate.trim().length === 0) {
    throw new IngestFixtureValidationError(["pathCandidate must be a non-empty string"]);
  }

  const root = resolve(workspaceRoot);
  const resolvedPath = resolve(root, pathCandidate);
  const rootRelativePath = relative(root, resolvedPath);
  const insideRoot =
    rootRelativePath === "" ||
    (!rootRelativePath.startsWith("..") && !isAbsolute(rootRelativePath));

  if (!insideRoot) {
    throw new IngestFixtureValidationError([
      `Fixture path escapes the workspace root: ${pathCandidate}`,
    ]);
  }

  return resolvedPath;
}

export function resolveIngestSearchFixturePaths(
  options: ResolveIngestSearchFixturePathsOptions = {},
): IngestSearchFixturePaths {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const fixtureDirectory =
    options.fixtureDirectory ?? DEFAULT_INGEST_SEARCH_FIXTURE_DIRECTORY;
  const fixtureRoot = resolvePathUnderWorkspace(workspaceRoot, fixtureDirectory);

  return Object.freeze({
    repository: resolvePathUnderWorkspace(workspaceRoot, resolve(fixtureRoot, "repository.json")),
    searchIndex: resolvePathUnderWorkspace(
      workspaceRoot,
      resolve(fixtureRoot, "search-index.json"),
    ),
    quarantine: resolvePathUnderWorkspace(workspaceRoot, resolve(fixtureRoot, "quarantine.json")),
    apiRequests: resolvePathUnderWorkspace(
      workspaceRoot,
      resolve(fixtureRoot, "api-requests.json"),
    ),
  });
}

export function loadIngestSearchFixtureBundle(
  options: LoadIngestSearchFixtureBundleOptions = {},
): IngestSearchFixtureBundle {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const defaultPaths = resolveIngestSearchFixturePaths(options);
  const resolvedPaths = resolveFixturePathOverrides(
    workspaceRoot,
    defaultPaths,
    options.paths ?? {},
  );

  return Object.freeze({
    repository: readJsonFixture(resolvedPaths.repository, "repository"),
    searchIndex: readJsonFixture(resolvedPaths.searchIndex, "searchIndex"),
    quarantine: readJsonFixture(resolvedPaths.quarantine, "quarantine"),
    apiRequests: readJsonFixture(resolvedPaths.apiRequests, "apiRequests"),
  });
}

export function createIngestRouteStateSeedFromFixtures(
  fixtures: IngestSearchFixtureBundle,
  options: BuildIngestRouteFixtureStateOptions = {},
): IngestRouteStateSeed {
  assertValidIngestSearchFixtureBundle(fixtures, options);

  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd());
  const sourceByUri = new Map(
    fixtures.repository.sources.map((source) => [source.sourceUri, source]),
  );
  const quarantineItemsBySourceUri = countBy(
    fixtures.quarantine.items,
    (item) => item.sourceUri,
  );
  const documentsBySourceUri = countBy(
    fixtures.searchIndex.documents,
    (document) => document.sourceUri,
  );
  const quarantineTitles = collectQuarantineTitles(fixtures.apiRequests);
  const now =
    readFixtureDecisionTimestamp(fixtures.apiRequests) ?? fixtures.apiRequests.generatedAt;

  return Object.freeze({
    now: () => now,
    sources: Object.freeze(
      fixtures.repository.sources
        .map((source): IngestSourceSummary => {
          const itemCount =
            (documentsBySourceUri.get(source.sourceUri) ?? 0) +
            (quarantineItemsBySourceUri.get(source.sourceUri) ?? 0);

          return Object.freeze({
            sourceId: source.sourceUri,
            label: basename(source.path),
            kind: mediaTypeToKind(source.mediaType),
            itemCount,
            quarantinedCount: quarantineItemsBySourceUri.get(source.sourceUri) ?? 0,
            updatedAt: fixtures.searchIndex.generatedAt,
          });
        })
        .sort(compareSources),
    ),
    documents: Object.freeze(
      fixtures.searchIndex.documents
        .map((document): IngestIndexedDocument => {
          const source = requireSource(sourceByUri, document.sourceUri);
          const resolvedPath = resolvePathUnderWorkspace(workspaceRoot, source.path);

          return Object.freeze({
            id: document.id,
            sourceId: document.sourceUri,
            title: document.title,
            text: document.body,
            tags: Object.freeze([
              mediaTypeToKind(document.mediaType),
              document.quarantineState,
            ]),
            updatedAt: fixtures.searchIndex.generatedAt,
            metadata: Object.freeze({
              sourceUri: document.sourceUri,
              sourcePath: toWorkspacePath(workspaceRoot, resolvedPath),
              mediaType: document.mediaType,
              checksum: document.checksum,
              citations: structuredClone(document.citations),
              untrusted: document.untrusted,
              quarantineState: document.quarantineState,
            }),
          });
        })
        .sort(compareDocuments),
    ),
    quarantineRecords: Object.freeze(
      fixtures.quarantine.items
        .map((item): QuarantineRecord => {
          requireSource(sourceByUri, item.sourceUri);

          return Object.freeze({
            id: item.id,
            sourceId: item.sourceUri,
            itemId: item.id,
            title: quarantineTitles.get(item.id) ?? item.id,
            reason: item.reason,
            status: "pending",
            createdAt: fixtures.apiRequests.generatedAt,
          });
        })
        .sort(compareQuarantineRecords),
    ),
  });
}

export function createIngestRouteStateFromFixtures(
  fixtures: IngestSearchFixtureBundle,
  options: BuildIngestRouteFixtureStateOptions = {},
): IngestRouteState {
  return createMemoryIngestRouteState(
    createIngestRouteStateSeedFromFixtures(fixtures, options),
  );
}

export function createIngestRouteStateFromIngestSearchFixtures(
  options: LoadIngestSearchFixtureBundleOptions = {},
): IngestRouteState {
  return createIngestRouteStateFromFixtures(
    loadIngestSearchFixtureBundle(options),
    { workspaceRoot: options.workspaceRoot },
  );
}

export function assertValidIngestSearchFixtureBundle(
  fixtures: IngestSearchFixtureBundle,
  options: BuildIngestRouteFixtureStateOptions = {},
): void {
  const issues = validateIngestSearchFixtureBundle(fixtures, options);
  if (issues.length > 0) {
    throw new IngestFixtureValidationError(issues);
  }
}

export function validateIngestSearchFixtureBundle(
  fixtures: IngestSearchFixtureBundle,
  options: BuildIngestRouteFixtureStateOptions = {},
): readonly string[] {
  const issues: string[] = [];
  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd());

  validateRepositoryFixture(fixtures.repository, workspaceRoot, issues);
  validateSearchIndexFixture(fixtures.searchIndex, issues);
  validateQuarantineFixture(fixtures.quarantine, issues);
  validateApiRequestsFixture(fixtures.apiRequests, issues);

  if (
    isNonEmptyString(fixtures.repository?.workspaceId) &&
    isNonEmptyString(fixtures.searchIndex?.workspaceId) &&
    fixtures.repository.workspaceId !== fixtures.searchIndex.workspaceId
  ) {
    issues.push("repository.workspaceId must match searchIndex.workspaceId");
  }
  if (
    isNonEmptyString(fixtures.repository?.workspaceId) &&
    isNonEmptyString(fixtures.quarantine?.workspaceId) &&
    fixtures.repository.workspaceId !== fixtures.quarantine.workspaceId
  ) {
    issues.push("repository.workspaceId must match quarantine.workspaceId");
  }

  const sourceByUri = new Map<string, IngestSearchRepositorySourceFixture>();
  for (const source of fixtures.repository?.sources ?? []) {
    if (!isNonEmptyString(source.sourceUri)) {
      continue;
    }
    if (sourceByUri.has(source.sourceUri)) {
      issues.push(`duplicate repository sourceUri: ${source.sourceUri}`);
      continue;
    }
    sourceByUri.set(source.sourceUri, source);
  }

  const documentIds = new Set<string>();
  for (const document of fixtures.searchIndex?.documents ?? []) {
    if (isNonEmptyString(document.id)) {
      if (documentIds.has(document.id)) {
        issues.push(`duplicate searchIndex document id: ${document.id}`);
      }
      documentIds.add(document.id);
    }
    validateSourceJoin(
      sourceByUri,
      document.sourceUri,
      document.checksum,
      document.mediaType,
      `searchIndex.documents.${document.id || "<unknown>"}`,
      issues,
    );
    validateCitations(
      document.citations,
      sourceByUri,
      `searchIndex.documents.${document.id}`,
      issues,
    );
  }

  const quarantineIds = new Set<string>();
  for (const item of fixtures.quarantine?.items ?? []) {
    if (isNonEmptyString(item.id)) {
      if (quarantineIds.has(item.id)) {
        issues.push(`duplicate quarantine item id: ${item.id}`);
      }
      quarantineIds.add(item.id);
    }
    validateSourceJoin(
      sourceByUri,
      item.sourceUri,
      item.checksum,
      undefined,
      `quarantine.items.${item.id || "<unknown>"}`,
      issues,
    );
    validateCitations([item.citation], sourceByUri, `quarantine.items.${item.id}`, issues);
  }

  validateApiFixtureReferences(
    fixtures.apiRequests,
    fixtures.repository?.workspaceId,
    sourceByUri,
    documentIds,
    quarantineIds,
    issues,
  );

  return Object.freeze(issues);
}

function validateRepositoryFixture(
  fixture: IngestSearchRepositoryFixture,
  workspaceRoot: string,
  issues: string[],
): void {
  validateRootObject(fixture, "repository", issues);
  requireString(fixture?.schemaVersion, "repository.schemaVersion", issues);
  requireString(fixture?.workspaceId, "repository.workspaceId", issues);
  requireIsoString(fixture?.generatedAt, "repository.generatedAt", issues);
  requireArray(fixture?.sources, "repository.sources", issues);

  for (const [index, source] of (fixture?.sources ?? []).entries()) {
    const path = `repository.sources.${index}`;
    validateRootObject(source, path, issues);
    requireString(source.sourceUri, `${path}.sourceUri`, issues);
    requireString(source.path, `${path}.path`, issues);
    requireString(source.mediaType, `${path}.mediaType`, issues);
    requireChecksum(source.checksum, `${path}.checksum`, issues);
    requireString(source.state, `${path}.state`, issues);

    if (isNonEmptyString(source.path)) {
      try {
        resolvePathUnderWorkspace(workspaceRoot, source.path);
      } catch (error) {
        issues.push(error instanceof IngestFixtureValidationError
          ? error.issues[0]
          : `${path}.path must stay under workspaceRoot`);
      }
    }
  }
}

function validateSearchIndexFixture(
  fixture: IngestSearchIndexFixture,
  issues: string[],
): void {
  validateRootObject(fixture, "searchIndex", issues);
  requireString(fixture?.schemaVersion, "searchIndex.schemaVersion", issues);
  requireString(fixture?.workspaceId, "searchIndex.workspaceId", issues);
  requireIsoString(fixture?.generatedAt, "searchIndex.generatedAt", issues);
  requireArray(fixture?.documents, "searchIndex.documents", issues);

  for (const [index, document] of (fixture?.documents ?? []).entries()) {
    const path = `searchIndex.documents.${index}`;
    validateRootObject(document, path, issues);
    requireString(document.id, `${path}.id`, issues);
    requireString(document.sourceUri, `${path}.sourceUri`, issues);
    requireString(document.mediaType, `${path}.mediaType`, issues);
    requireChecksum(document.checksum, `${path}.checksum`, issues);
    requireString(document.title, `${path}.title`, issues);
    requireString(document.body, `${path}.body`, issues);
    requireArray(document.citations, `${path}.citations`, issues);
    requireBoolean(document.untrusted, `${path}.untrusted`, issues);
    requireString(document.quarantineState, `${path}.quarantineState`, issues);
    validateCitations(document.citations, undefined, `${path}.citations`, issues);
  }
}

function validateQuarantineFixture(
  fixture: IngestSearchQuarantineFixture,
  issues: string[],
): void {
  validateRootObject(fixture, "quarantine", issues);
  requireString(fixture?.schemaVersion, "quarantine.schemaVersion", issues);
  requireString(fixture?.workspaceId, "quarantine.workspaceId", issues);
  requireArray(fixture?.items, "quarantine.items", issues);

  for (const [index, item] of (fixture?.items ?? []).entries()) {
    const path = `quarantine.items.${index}`;
    validateRootObject(item, path, issues);
    requireString(item.id, `${path}.id`, issues);
    requireString(item.sourceUri, `${path}.sourceUri`, issues);
    requireChecksum(item.checksum, `${path}.checksum`, issues);
    requireString(item.reasonCode, `${path}.reasonCode`, issues);
    requireString(item.reason, `${path}.reason`, issues);
    requireBoolean(item.untrusted, `${path}.untrusted`, issues);
    validateCitations([item.citation], undefined, `${path}.citation`, issues);
  }
}

function validateApiRequestsFixture(
  fixture: IngestSearchApiRequestsFixture,
  issues: string[],
): void {
  validateRootObject(fixture, "apiRequests", issues);
  requireString(fixture?.schemaVersion, "apiRequests.schemaVersion", issues);
  requireIsoString(fixture?.generatedAt, "apiRequests.generatedAt", issues);
  requireString(fixture?.apiBase, "apiRequests.apiBase", issues);
  requireArray(fixture?.requests, "apiRequests.requests", issues);

  const ids = new Set<string>();
  for (const [index, request] of (fixture?.requests ?? []).entries()) {
    const path = `apiRequests.requests.${index}`;
    validateRootObject(request, path, issues);
    requireString(request.id, `${path}.id`, issues);
    requireString(request.title, `${path}.title`, issues);
    validateRootObject(request.route, `${path}.route`, issues);
    requireString(request.route?.method, `${path}.route.method`, issues);
    requireString(request.route?.path, `${path}.route.path`, issues);
    validateRootObject(request.request, `${path}.request`, issues);
    validateRootObject(request.response, `${path}.response`, issues);

    if (isNonEmptyString(request.id)) {
      if (ids.has(request.id)) {
        issues.push(`duplicate apiRequests request id: ${request.id}`);
      }
      ids.add(request.id);
    }
  }
}

function validateSourceJoin(
  sourceByUri: ReadonlyMap<string, IngestSearchRepositorySourceFixture>,
  sourceUri: string,
  checksum: string,
  mediaType: string | undefined,
  path: string,
  issues: string[],
): void {
  if (!isNonEmptyString(sourceUri)) {
    return;
  }

  const source = sourceByUri.get(sourceUri);
  if (source === undefined) {
    issues.push(`${path}.sourceUri does not match a repository source`);
    return;
  }
  if (isNonEmptyString(checksum) && source.checksum !== checksum) {
    issues.push(`${path}.checksum must match repository source checksum`);
  }
  if (mediaType !== undefined && isNonEmptyString(mediaType) && source.mediaType !== mediaType) {
    issues.push(`${path}.mediaType must match repository source mediaType`);
  }
}

function validateCitations(
  citations: readonly IngestSearchCitationFixture[] | undefined,
  sourceByUri: ReadonlyMap<string, IngestSearchRepositorySourceFixture> | undefined,
  path: string,
  issues: string[],
): void {
  if (!Array.isArray(citations)) {
    return;
  }

  for (const [index, citation] of citations.entries()) {
    const citationPath = `${path}.${index}`;
    validateRootObject(citation, citationPath, issues);
    requireString(citation.sourceUri, `${citationPath}.sourceUri`, issues);
    validateRootObject(citation.range, `${citationPath}.range`, issues);
    requireBoolean(citation.trusted, `${citationPath}.trusted`, issues);
    if (
      sourceByUri !== undefined &&
      isNonEmptyString(citation.sourceUri) &&
      !sourceByUri.has(citation.sourceUri)
    ) {
      issues.push(`${citationPath}.sourceUri does not match a repository source`);
    }
  }
}

function validateApiFixtureReferences(
  fixture: IngestSearchApiRequestsFixture,
  workspaceId: string | undefined,
  sourceByUri: ReadonlyMap<string, IngestSearchRepositorySourceFixture>,
  documentIds: ReadonlySet<string>,
  quarantineIds: ReadonlySet<string>,
  issues: string[],
): void {
  for (const request of fixture?.requests ?? []) {
    const requestBody = readRecord(request.request?.body);
    const responseBody = readRecord(request.response?.body);
    if (
      isNonEmptyString(requestBody?.workspaceId) &&
      isNonEmptyString(workspaceId) &&
      requestBody.workspaceId !== workspaceId
    ) {
      issues.push(
        `apiRequests.requests.${request.id}.request.body.workspaceId must match ` +
          "repository.workspaceId",
      );
    }

    const requestSourceUri = requestBody?.sourceUri;
    if (isNonEmptyString(requestSourceUri) && !sourceByUri.has(requestSourceUri)) {
      issues.push(`apiRequests.requests.${request.id}.request.body.sourceUri is unknown`);
    }

    for (const sourceUri of readStringArray(readRecord(requestBody?.filters)?.sourceUris)) {
      if (!sourceByUri.has(sourceUri)) {
        issues.push(
          `apiRequests.requests.${request.id}.request.body.filters.sourceUris has unknown source`,
        );
      }
    }

    for (const result of readRecordArray(responseBody?.results)) {
      const resultId = result.id;
      if (isNonEmptyString(resultId) && !documentIds.has(resultId)) {
        issues.push(
          `apiRequests.requests.${request.id}.response.body.results has unknown document id`,
        );
      }
    }

    for (const item of readRecordArray(requestBody?.items)) {
      const itemId = item.id;
      const itemSourceUri = item.sourceUri;
      const itemChecksum = item.checksum;
      if (isNonEmptyString(itemId) && !quarantineIds.has(itemId)) {
        issues.push(`apiRequests.requests.${request.id}.request.body.items has unknown item id`);
      }
      validateSourceJoin(
        sourceByUri,
        String(itemSourceUri ?? ""),
        String(itemChecksum ?? ""),
        undefined,
        `apiRequests.requests.${request.id}.request.body.items.${itemId || "<unknown>"}`,
        issues,
      );
    }

    for (const item of readRecordArray(readRecord(responseBody?.quarantine)?.items)) {
      const itemId = item.id;
      if (isNonEmptyString(itemId) && !quarantineIds.has(itemId)) {
        issues.push(
          `apiRequests.requests.${request.id}.response.body.quarantine.items has unknown item id`,
        );
      }
    }

    for (const item of readRecordArray(responseBody?.cases)) {
      const itemId = item.id;
      if (isNonEmptyString(itemId) && !quarantineIds.has(itemId)) {
        issues.push(`apiRequests.requests.${request.id}.response.body.cases has unknown item id`);
      }
    }
  }
}

function readFixtureDecisionTimestamp(
  fixture: IngestSearchApiRequestsFixture,
): string | undefined {
  for (const request of fixture.requests) {
    if (!request.route.path.endsWith("/decision")) {
      continue;
    }
    const body = readRecord(request.request.body);
    if (body !== undefined && isNonEmptyString(body.decidedAt)) {
      return body.decidedAt;
    }
  }

  return undefined;
}

function collectQuarantineTitles(
  fixture: IngestSearchApiRequestsFixture,
): ReadonlyMap<string, string> {
  const titles = new Map<string, string>();

  for (const request of fixture.requests) {
    const body = readRecord(request.request.body);
    for (const item of readRecordArray(body?.items)) {
      if (isNonEmptyString(item.id) && isNonEmptyString(item.content)) {
        titles.set(item.id, item.content);
      }
    }

    const responseBody = readRecord(request.response.body);
    for (const item of readRecordArray(responseBody?.cases)) {
      if (isNonEmptyString(item.id) && isNonEmptyString(item.previewText)) {
        titles.set(item.id, item.previewText);
      }
    }
  }

  return titles;
}

function mediaTypeToKind(mediaType: string): string {
  switch (mediaType) {
    case "application/json":
      return "json";
    case "text/csv":
      return "csv";
    case "text/markdown":
      return "markdown";
    case "text/plain":
      return "text";
    default:
      return mediaType.trim().toLowerCase() || "unknown";
  }
}

function compareSources(
  left: IngestSourceSummary,
  right: IngestSourceSummary,
): number {
  return left.sourceId.localeCompare(right.sourceId);
}

function compareDocuments(
  left: IngestIndexedDocument,
  right: IngestIndexedDocument,
): number {
  return left.id.localeCompare(right.id);
}

function compareQuarantineRecords(
  left: QuarantineRecord,
  right: QuarantineRecord,
): number {
  return left.id.localeCompare(right.id);
}

function countBy<T>(items: readonly T[], keyOf: (item: T) => string): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyOf(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

function resolveFixturePathOverrides(
  workspaceRoot: string,
  defaultPaths: IngestSearchFixturePaths,
  overrides: Partial<IngestSearchFixturePaths>,
): IngestSearchFixturePaths {
  return Object.freeze({
    repository: overrides.repository === undefined
      ? defaultPaths.repository
      : resolvePathUnderWorkspace(workspaceRoot, overrides.repository),
    searchIndex: overrides.searchIndex === undefined
      ? defaultPaths.searchIndex
      : resolvePathUnderWorkspace(workspaceRoot, overrides.searchIndex),
    quarantine: overrides.quarantine === undefined
      ? defaultPaths.quarantine
      : resolvePathUnderWorkspace(workspaceRoot, overrides.quarantine),
    apiRequests: overrides.apiRequests === undefined
      ? defaultPaths.apiRequests
      : resolvePathUnderWorkspace(workspaceRoot, overrides.apiRequests),
  });
}

function requireSource(
  sourceByUri: ReadonlyMap<string, IngestSearchRepositorySourceFixture>,
  sourceUri: string,
): IngestSearchRepositorySourceFixture {
  const source = sourceByUri.get(sourceUri);
  if (source === undefined) {
    throw new IngestFixtureValidationError([`source is not joined: ${sourceUri}`]);
  }

  return source;
}

function toWorkspacePath(workspaceRoot: string, resolvedPath: string): string {
  return relative(workspaceRoot, resolvedPath).split(sep).join("/");
}

function readJsonFixture<T>(path: string, label: string): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new IngestFixtureValidationError([`${label} fixture could not be read: ${message}`]);
  }
}

function validateRootObject(value: unknown, path: string, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`);
  }
}

function requireString(value: unknown, path: string, issues: string[]): void {
  if (!isNonEmptyString(value)) {
    issues.push(`${path} must be a non-empty string`);
  }
}

function requireIsoString(value: unknown, path: string, issues: string[]): void {
  if (!isNonEmptyString(value) || Number.isNaN(Date.parse(value))) {
    issues.push(`${path} must be an ISO timestamp string`);
  }
}

function requireChecksum(value: unknown, path: string, issues: string[]): void {
  if (!isNonEmptyString(value) || !/^[a-f0-9]{64}$/.test(value)) {
    issues.push(`${path} must be a lowercase sha256 checksum`);
  }
}

function requireArray(value: unknown, path: string, issues: string[]): void {
  if (!Array.isArray(value)) {
    issues.push(`${path} must be an array`);
  }
}

function requireBoolean(value: unknown, path: string, issues: string[]): void {
  if (typeof value !== "boolean") {
    issues.push(`${path} must be a boolean`);
  }
}

function readStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return Object.freeze([]);
  }

  return Object.freeze(value.filter(isNonEmptyString));
}

function readRecordArray(value: unknown): readonly JsonRecord[] {
  if (!Array.isArray(value)) {
    return Object.freeze([]);
  }

  return Object.freeze(value.filter(isRecord));
}

function readRecord(value: unknown): JsonRecord | undefined {
  return isRecord(value) ? value : undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type JsonRecord = Record<string, unknown>;
