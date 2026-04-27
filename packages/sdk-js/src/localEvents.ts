import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  canonicalLocalEventOperations,
  canonicalSharedSchemaKinds,
  getCanonicalLocalEventDigest,
  validateCanonicalLocalEventCatalog,
  type CanonicalLocalEvent,
  type CanonicalLocalEventCatalog,
  type CanonicalLocalEventOperation,
  type CanonicalSharedSchemaKind,
  type ValidationIssue as CanonicalLocalEventValidationIssue,
} from "../../schemas/src/eventCatalog.ts";
import {
  type FetchLike,
  type FetchRequestInit,
  type FetchResponseLike,
  type HeadersLike,
  type JsonValue,
} from "./client.ts";

export const DEFAULT_LOCAL_EVENT_FIXTURE_CATALOG_PATH = new URL(
  "../../schemas/fixtures/canonical-events.catalog.json",
  import.meta.url,
);
export const DEFAULT_LOCAL_EVENT_CATALOG_FIXTURE_PATH = new URL(
  "../../schemas/fixtures/canonical-events.valid.json",
  import.meta.url,
);

export type LocalEventCatalogInput = CanonicalLocalEventCatalog | readonly CanonicalLocalEvent[];

export type LocalEventFixtureErrorCode =
  | "local_event_fixture_url_invalid"
  | "local_event_fixture_route_not_found"
  | "local_event_fixture_method_mismatch"
  | "local_event_fixture_query_invalid";

export interface LocalEventFixtureCatalogEntry {
  readonly kind: "canonicalLocalEventCatalog";
  readonly fixture: string;
  readonly valid: boolean;
}

export interface LocalEventFixtureCatalog {
  readonly version: number;
  readonly fixtures: readonly LocalEventFixtureCatalogEntry[];
}

export interface LocalEventCatalogFixtureSetOptions {
  readonly fixtureCatalogPath?: string | URL;
  readonly includeInvalid?: boolean;
}

export interface LocalEventCatalogFixtureValidation {
  readonly fixture: string;
  readonly kind: "canonicalLocalEventCatalog";
  readonly expectedValid: boolean;
  readonly ok: boolean;
  readonly issues: readonly CanonicalLocalEventValidationIssue[];
  readonly catalog?: CanonicalLocalEventCatalog;
}

export interface LocalEventOperationSchemaKindSummary {
  readonly operation: CanonicalLocalEventOperation;
  readonly schemaKind: CanonicalSharedSchemaKind;
  readonly count: number;
}

export interface LocalEventCatalogSummary {
  readonly workspaceId?: `wsp_${string}`;
  readonly generatedAt?: string;
  readonly eventCount: number;
  readonly firstSequence?: number;
  readonly lastSequence?: number;
  readonly firstRecordedAt?: string;
  readonly lastRecordedAt?: string;
  readonly redactedEventCount: number;
  readonly redactedFieldCount: number;
  readonly operations: Readonly<Record<CanonicalLocalEventOperation, number>>;
  readonly schemaKinds: Readonly<Record<CanonicalSharedSchemaKind, number>>;
  readonly operationSchemaKinds: readonly LocalEventOperationSchemaKindSummary[];
  readonly actorIds: readonly `act_${string}`[];
  readonly recordIds: readonly string[];
}

export interface LocalEventReplayBatchOptions {
  readonly batchSize?: number;
  readonly operations?: readonly CanonicalLocalEventOperation[];
  readonly schemaKinds?: readonly CanonicalSharedSchemaKind[];
  readonly startSequence?: number;
  readonly endSequence?: number;
}

export interface LocalEventReplayBatch {
  readonly batchId: string;
  readonly batchIndex: number;
  readonly eventCount: number;
  readonly firstSequence: number;
  readonly lastSequence: number;
  readonly firstEventId: `evt_${string}`;
  readonly lastEventId: `evt_${string}`;
  readonly previousDigest: string | null;
  readonly finalDigest: string;
  readonly operations: Readonly<Record<CanonicalLocalEventOperation, number>>;
  readonly schemaKinds: Readonly<Record<CanonicalSharedSchemaKind, number>>;
  readonly events: readonly CanonicalLocalEvent[];
}

export interface LocalEventCatalogFixtureFetchOptions {
  readonly catalog?: CanonicalLocalEventCatalog;
  readonly fixturePath?: string | URL;
  readonly basePath?: string;
  readonly replay?: LocalEventReplayBatchOptions;
}

export interface LocalEventFixtureFetchCall {
  readonly url: string;
  readonly method: string;
  readonly path: string;
  readonly route?: "catalog" | "summary" | "replayBatches";
  readonly status: number;
}

export interface LocalEventFixtureErrorBody {
  readonly error: {
    readonly code: LocalEventFixtureErrorCode;
    readonly message: string;
    readonly details: JsonValue;
  };
}

export interface LocalEventFixtureResponseLike extends FetchResponseLike {
  json(): Promise<JsonValue>;
  clone(): LocalEventFixtureResponseLike;
}

export interface LocalEventCatalogFixtureFetch extends FetchLike {
  readonly catalog: CanonicalLocalEventCatalog;
  readonly basePath: string;
  readonly calls: readonly LocalEventFixtureFetchCall[];
}

export class LocalEventCatalogValidationError extends TypeError {
  readonly source: string;
  readonly issues: readonly CanonicalLocalEventValidationIssue[];

  constructor(source: string, issues: readonly CanonicalLocalEventValidationIssue[]) {
    super(`local event catalog validation failed for ${source}: ${formatIssues(issues)}`);
    this.name = "LocalEventCatalogValidationError";
    this.source = source;
    this.issues = deepFreezeClone(issues);
  }
}

export function loadLocalEventFixtureCatalog(
  fixtureCatalogPath: string | URL = DEFAULT_LOCAL_EVENT_FIXTURE_CATALOG_PATH,
): LocalEventFixtureCatalog {
  const parsed = readJson(fixtureCatalogPath, "local event fixture catalog");
  validateLocalEventFixtureCatalog(parsed);
  return deepFreezeClone(parsed);
}

export function loadLocalEventCatalogFixture(
  fixturePath: string | URL = DEFAULT_LOCAL_EVENT_CATALOG_FIXTURE_PATH,
): CanonicalLocalEventCatalog {
  const parsed = readJson(fixturePath, "local event catalog fixture");
  return validateLocalEventCatalogFixture(parsed, displayPath(fixturePath));
}

export function validateLocalEventCatalogFixture(
  value: unknown,
  source = "local event catalog fixture",
): CanonicalLocalEventCatalog {
  const result = validateCanonicalLocalEventCatalog(value);
  if (!result.ok) {
    throw new LocalEventCatalogValidationError(source, result.issues);
  }
  return result.value as CanonicalLocalEventCatalog;
}

export function loadLocalEventCatalogFixtureSet(
  options: LocalEventCatalogFixtureSetOptions = {},
): LocalEventCatalogFixtureValidation[] {
  const fixtureCatalogPath = options.fixtureCatalogPath ?? DEFAULT_LOCAL_EVENT_FIXTURE_CATALOG_PATH;
  const fixtureCatalog = loadLocalEventFixtureCatalog(fixtureCatalogPath);
  const fixtureCatalogUrl = toFileUrl(fixtureCatalogPath);
  const includeInvalid = options.includeInvalid === true;
  const validations: LocalEventCatalogFixtureValidation[] = [];

  for (const entry of fixtureCatalog.fixtures) {
    const fixtureUrl = new URL(entry.fixture, fixtureCatalogUrl);
    const parsed = readJson(fixtureUrl, "local event catalog fixture");
    const result = validateCanonicalLocalEventCatalog(parsed);

    if (result.ok !== entry.valid) {
      throw new LocalEventCatalogValidationError(fixtureUrl.href, [
        {
          path: "$",
          message: `fixture catalog expected valid=${entry.valid} but validator returned valid=${result.ok}`,
        },
        ...result.issues,
      ]);
    }

    if (!entry.valid && !includeInvalid) {
      continue;
    }

    validations.push({
      fixture: entry.fixture,
      kind: entry.kind,
      expectedValid: entry.valid,
      ok: result.ok,
      issues: result.issues,
      ...(result.value === undefined ? {} : { catalog: result.value }),
    });
  }

  return deepFreezeClone(validations);
}

export function summarizeLocalEventCatalog(input: LocalEventCatalogInput): LocalEventCatalogSummary {
  const catalog = Array.isArray(input) ? undefined : input;
  const events = eventsFromInput(input);
  const operations = zeroOperationCounts();
  const schemaKinds = zeroSchemaKindCounts();
  const matrix = new Map<string, LocalEventOperationSchemaKindSummary>();
  let redactedEventCount = 0;
  let redactedFieldCount = 0;

  for (const event of events) {
    operations[event.operation] += 1;
    schemaKinds[event.payload.schemaKind] += 1;
    redactedFieldCount += event.redactionMetadata.redactedFieldCount;
    if (event.redactionMetadata.redacted) {
      redactedEventCount += 1;
    }

    const matrixKey = `${event.operation}:${event.payload.schemaKind}`;
    const existing = matrix.get(matrixKey);
    matrix.set(matrixKey, {
      operation: event.operation,
      schemaKind: event.payload.schemaKind,
      count: (existing?.count ?? 0) + 1,
    });
  }

  const orderedEvents = orderedEventsForReplay(events);
  const first = orderedEvents[0];
  const last = orderedEvents.at(-1);

  return deepFreezeClone({
    ...(catalog === undefined ? {} : {
      workspaceId: catalog.workspaceId,
      generatedAt: catalog.generatedAt,
    }),
    eventCount: events.length,
    ...(first === undefined ? {} : {
      firstSequence: first.sequence,
      firstRecordedAt: first.recordedAt,
    }),
    ...(last === undefined ? {} : {
      lastSequence: last.sequence,
      lastRecordedAt: last.recordedAt,
    }),
    redactedEventCount,
    redactedFieldCount,
    operations,
    schemaKinds,
    operationSchemaKinds: Array.from(matrix.values()).sort(compareOperationSchemaKindSummary),
    actorIds: sortedUnique(events.map((event) => event.actorId)) as `act_${string}`[],
    recordIds: sortedUnique(events.map((event) => event.payload.recordId)),
  });
}

export function createLocalEventReplayBatches(
  input: LocalEventCatalogInput,
  options: LocalEventReplayBatchOptions = {},
): LocalEventReplayBatch[] {
  const batchSize = positiveIntegerOption(options.batchSize, 100, "batchSize");
  const operations = optionSet(options.operations, canonicalLocalEventOperations, "operations");
  const schemaKinds = optionSet(options.schemaKinds, canonicalSharedSchemaKinds, "schemaKinds");
  const startSequence = positiveIntegerOption(options.startSequence, 1, "startSequence");
  const endSequence = positiveIntegerOption(options.endSequence, Number.MAX_SAFE_INTEGER, "endSequence");

  if (endSequence < startSequence) {
    throw new TypeError("endSequence must be greater than or equal to startSequence");
  }

  const events = orderedEventsForReplay(eventsFromInput(input)).filter((event) =>
    event.sequence >= startSequence &&
    event.sequence <= endSequence &&
    (operations === undefined || operations.has(event.operation)) &&
    (schemaKinds === undefined || schemaKinds.has(event.payload.schemaKind))
  );
  const batches: LocalEventReplayBatch[] = [];

  for (let offset = 0; offset < events.length; offset += batchSize) {
    const batchEvents = events.slice(offset, offset + batchSize);
    const first = batchEvents[0] as CanonicalLocalEvent;
    const last = batchEvents.at(-1) as CanonicalLocalEvent;
    const summary = summarizeLocalEventCatalog(batchEvents);
    const batchIndex = batches.length + 1;
    const batchFingerprint = stableHash(stableStringify(batchEvents.map((event) => [
      event.id,
      event.sequence,
      event.payloadDigest,
      event.previousDigest,
    ])));

    batches.push({
      batchId: `local_event_replay_${String(batchIndex).padStart(3, "0")}_${first.sequence}_${last.sequence}_${batchFingerprint}`,
      batchIndex,
      eventCount: batchEvents.length,
      firstSequence: first.sequence,
      lastSequence: last.sequence,
      firstEventId: first.id,
      lastEventId: last.id,
      previousDigest: first.previousDigest,
      finalDigest: getCanonicalLocalEventDigest(last),
      operations: summary.operations,
      schemaKinds: summary.schemaKinds,
      events: batchEvents,
    });
  }

  return deepFreezeClone(batches);
}

export function createLocalEventCatalogFixtureFetch(
  input: CanonicalLocalEventCatalog | LocalEventCatalogFixtureFetchOptions = {},
): LocalEventCatalogFixtureFetch {
  const options = fixtureFetchOptions(input);
  const catalog = resolveLocalEventCatalog(options);
  const basePath = normalizeBasePath(options.basePath ?? "/v1/local-events");
  const calls: LocalEventFixtureFetchCall[] = [];

  const fetch = (async (
    url: string,
    init: FetchRequestInit = {},
  ): Promise<LocalEventFixtureResponseLike> => {
    const requestUrl = parseRequestUrl(url);
    if (requestUrl === undefined) {
      const response = fixtureErrorResponse(400, "local_event_fixture_url_invalid", "Fixture request URL is invalid.", {
        url: String(url),
      });
      calls.push(freezeCall({
        url: String(url),
        method: normalizeMethod(init.method),
        path: "",
        status: response.status,
      }));
      return response;
    }

    const method = normalizeMethod(init.method);
    const path = `${requestUrl.pathname}${requestUrl.search}`;
    const route = routeFor(requestUrl.pathname, basePath);

    if (route === undefined) {
      const response = fixtureErrorResponse(404, "local_event_fixture_route_not_found", "No local event fixture route matched the path.", {
        method,
        path,
        knownRoutes: [
          `${basePath}/catalog`,
          `${basePath}/summary`,
          `${basePath}/replay-batches`,
        ],
      });
      calls.push(freezeCall({
        url: String(url),
        method,
        path,
        status: response.status,
      }));
      return response;
    }

    if (method !== "GET") {
      const response = fixtureErrorResponse(405, "local_event_fixture_method_mismatch", "Local event fixture routes only support GET.", {
        method,
        path,
        allowedMethods: ["GET"],
      });
      calls.push(freezeCall({
        url: String(url),
        method,
        path,
        route,
        status: response.status,
      }));
      return response;
    }

    const response = responseForRoute(catalog, route, requestUrl, options.replay);
    calls.push(freezeCall({
      url: String(url),
      method,
      path,
      route,
      status: response.status,
    }));
    return response;
  }) as LocalEventCatalogFixtureFetch;

  Object.defineProperties(fetch, {
    catalog: {
      enumerable: true,
      value: catalog,
    },
    basePath: {
      enumerable: true,
      value: basePath,
    },
    calls: {
      enumerable: true,
      value: calls,
    },
  });

  return fetch;
}

function responseForRoute(
  catalog: CanonicalLocalEventCatalog,
  route: "catalog" | "summary" | "replayBatches",
  requestUrl: URL,
  configuredReplayOptions: LocalEventReplayBatchOptions | undefined,
): LocalEventFixtureResponseLike {
  if (route === "catalog") {
    return fixtureResponse(200, catalog as unknown as JsonValue);
  }
  if (route === "summary") {
    return fixtureResponse(200, summarizeLocalEventCatalog(catalog) as unknown as JsonValue);
  }

  try {
    const replayOptions = replayOptionsFromSearch(requestUrl.searchParams, configuredReplayOptions);
    return fixtureResponse(200, {
      batches: createLocalEventReplayBatches(catalog, replayOptions) as unknown as JsonValue,
    });
  } catch (error) {
    return fixtureErrorResponse(400, "local_event_fixture_query_invalid", errorMessage(error), {
      path: `${requestUrl.pathname}${requestUrl.search}`,
    });
  }
}

function replayOptionsFromSearch(
  searchParams: URLSearchParams,
  configuredOptions: LocalEventReplayBatchOptions | undefined,
): LocalEventReplayBatchOptions {
  return {
    ...configuredOptions,
    ...optionalPositiveQueryNumber(searchParams, "batchSize"),
    ...optionalPositiveQueryNumber(searchParams, "startSequence"),
    ...optionalPositiveQueryNumber(searchParams, "endSequence"),
    ...optionalAllowedQueryValues(searchParams, "operation", "operations", canonicalLocalEventOperations),
    ...optionalAllowedQueryValues(searchParams, "schemaKind", "schemaKinds", canonicalSharedSchemaKinds),
  };
}

function optionalPositiveQueryNumber(
  searchParams: URLSearchParams,
  key: "batchSize" | "startSequence" | "endSequence",
): Partial<LocalEventReplayBatchOptions> {
  const value = searchParams.get(key);
  if (value === null) {
    return {};
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new TypeError(`${key} must be a positive integer`);
  }
  return { [key]: parsed };
}

function optionalAllowedQueryValues<TValue extends string>(
  searchParams: URLSearchParams,
  queryKey: string,
  optionKey: "operations" | "schemaKinds",
  allowed: readonly TValue[],
): Partial<LocalEventReplayBatchOptions> {
  const values = searchParams.getAll(queryKey).flatMap((value) =>
    value.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0)
  );
  if (values.length === 0) {
    return {};
  }

  for (const value of values) {
    if (!allowed.includes(value as TValue)) {
      throw new TypeError(`${queryKey} must be one of ${allowed.join(", ")}`);
    }
  }

  return { [optionKey]: values as TValue[] };
}

function resolveLocalEventCatalog(
  options: LocalEventCatalogFixtureFetchOptions,
): CanonicalLocalEventCatalog {
  if (options.catalog !== undefined) {
    return validateLocalEventCatalogFixture(options.catalog, "local event catalog");
  }
  return loadLocalEventCatalogFixture(options.fixturePath);
}

function fixtureFetchOptions(
  input: CanonicalLocalEventCatalog | LocalEventCatalogFixtureFetchOptions,
): LocalEventCatalogFixtureFetchOptions {
  return isCanonicalLocalEventCatalogLike(input) ? { catalog: input } : input;
}

function validateLocalEventFixtureCatalog(value: unknown): asserts value is LocalEventFixtureCatalog {
  if (!isRecord(value)) {
    throw new TypeError("local event fixture catalog must be an object");
  }
  if (!Number.isInteger(value.version) || (value.version as number) < 1) {
    throw new TypeError("version must be a positive integer");
  }
  if (!Array.isArray(value.fixtures) || value.fixtures.length === 0) {
    throw new TypeError("fixtures must be a non-empty array");
  }

  value.fixtures.forEach((entry, index) => {
    const path = `fixtures.${index}`;
    if (!isRecord(entry)) {
      throw new TypeError(`${path} must be an object`);
    }
    if (entry.kind !== "canonicalLocalEventCatalog") {
      throw new TypeError(`${path}.kind must be canonicalLocalEventCatalog`);
    }
    if (typeof entry.fixture !== "string" || entry.fixture.trim().length === 0) {
      throw new TypeError(`${path}.fixture must be a non-empty string`);
    }
    if (typeof entry.valid !== "boolean") {
      throw new TypeError(`${path}.valid must be a boolean`);
    }
  });
}

function eventsFromInput(input: LocalEventCatalogInput): readonly CanonicalLocalEvent[] {
  return Array.isArray(input) ? input : input.events;
}

function orderedEventsForReplay(events: readonly CanonicalLocalEvent[]): CanonicalLocalEvent[] {
  return [...events].sort((left, right) =>
    left.sequence - right.sequence || left.id.localeCompare(right.id)
  );
}

function zeroOperationCounts(): Record<CanonicalLocalEventOperation, number> {
  return Object.fromEntries(canonicalLocalEventOperations.map((operation) => [operation, 0])) as Record<
    CanonicalLocalEventOperation,
    number
  >;
}

function zeroSchemaKindCounts(): Record<CanonicalSharedSchemaKind, number> {
  return Object.fromEntries(canonicalSharedSchemaKinds.map((schemaKind) => [schemaKind, 0])) as Record<
    CanonicalSharedSchemaKind,
    number
  >;
}

function compareOperationSchemaKindSummary(
  left: LocalEventOperationSchemaKindSummary,
  right: LocalEventOperationSchemaKindSummary,
): number {
  return (
    canonicalLocalEventOperations.indexOf(left.operation) -
    canonicalLocalEventOperations.indexOf(right.operation)
  ) || (
    canonicalSharedSchemaKinds.indexOf(left.schemaKind) -
    canonicalSharedSchemaKinds.indexOf(right.schemaKind)
  );
}

function optionSet<TValue extends string>(
  values: readonly TValue[] | undefined,
  allowed: readonly TValue[],
  name: string,
): ReadonlySet<TValue> | undefined {
  if (values === undefined) {
    return undefined;
  }
  if (!Array.isArray(values)) {
    throw new TypeError(`${name} must be an array`);
  }
  for (const value of values) {
    if (!allowed.includes(value)) {
      throw new TypeError(`${name} must only contain ${allowed.join(", ")}`);
    }
  }
  return new Set(values);
}

function positiveIntegerOption(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return value;
}

function routeFor(pathname: string, basePath: string): "catalog" | "summary" | "replayBatches" | undefined {
  if (pathname === `${basePath}/catalog`) {
    return "catalog";
  }
  if (pathname === `${basePath}/summary`) {
    return "summary";
  }
  if (pathname === `${basePath}/replay-batches`) {
    return "replayBatches";
  }
  return undefined;
}

function normalizeBasePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) {
    throw new TypeError("basePath must start with /");
  }
  return trimmed.replace(/\/+$/g, "");
}

function parseRequestUrl(value: string): URL | undefined {
  try {
    return new URL(String(value), "http://local-events.fixture");
  } catch {
    return undefined;
  }
}

function fixtureResponse(status: number, body: JsonValue): LocalEventFixtureResponseLike {
  return new FixtureResponse(status, body);
}

function fixtureErrorResponse(
  status: number,
  code: LocalEventFixtureErrorCode,
  message: string,
  details: JsonValue,
): LocalEventFixtureResponseLike {
  return fixtureResponse(status, {
    error: {
      code,
      message,
      details,
    },
  });
}

class FixtureResponse implements LocalEventFixtureResponseLike {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly headers: HeadersLike;

  readonly #body: JsonValue;
  readonly #headers: Readonly<Record<string, string>>;
  readonly #text: string;

  constructor(status: number, body: JsonValue) {
    this.ok = status >= 200 && status < 300;
    this.status = status;
    this.statusText = statusTextFor(status);
    this.#body = deepFreezeClone(body);
    this.#headers = deepFreezeClone({ "content-type": "application/json" });
    this.headers = headersLike(this.#headers);
    this.#text = JSON.stringify(this.#body);
  }

  async text(): Promise<string> {
    return this.#text;
  }

  async json(): Promise<JsonValue> {
    return structuredClone(this.#body);
  }

  clone(): LocalEventFixtureResponseLike {
    return new FixtureResponse(this.status, this.#body);
  }
}

function headersLike(headers: Readonly<Record<string, string>>): HeadersLike {
  const normalized = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return Object.freeze({
    get(name: string): string | null {
      return normalized.get(name.toLowerCase()) ?? null;
    },
  });
}

function freezeCall(call: LocalEventFixtureFetchCall): LocalEventFixtureFetchCall {
  return deepFreezeClone(call);
}

function normalizeMethod(value: string | undefined): string {
  return (value ?? "GET").trim().toUpperCase();
}

function statusTextFor(status: number): string {
  if (status === 200) {
    return "OK";
  }
  if (status === 400) {
    return "Bad Request";
  }
  if (status === 404) {
    return "Not Found";
  }
  if (status === 405) {
    return "Method Not Allowed";
  }
  return "";
}

function readJson(path: string | URL, label: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    throw new TypeError(`${label} JSON could not be read from ${displayPath(path)}: ${errorMessage(error)}`);
  }
}

function toFileUrl(value: string | URL): URL {
  if (value instanceof URL) {
    return value;
  }
  try {
    return new URL(value);
  } catch {
    return pathToFileURL(resolve(value));
  }
}

function displayPath(value: string | URL): string {
  return value instanceof URL ? value.href : value;
}

function formatIssues(issues: readonly CanonicalLocalEventValidationIssue[]): string {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sortedUnique(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort(compareText);
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right);
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36).padStart(7, "0");
}

function stableStringify(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function isCanonicalLocalEventCatalogLike(value: unknown): value is CanonicalLocalEventCatalog {
  return isRecord(value) && value.schemaVersion === "canonical-local-event-catalog/v1" && Array.isArray(value.events);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreezeClone<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }
  return value;
}
