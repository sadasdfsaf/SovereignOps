import { readFileSync } from "node:fs";

import {
  type FetchLike,
  type FetchRequestInit,
  type FetchResponseLike,
  type HeadersLike,
  type JsonValue,
} from "./client.ts";
import {
  createIngestSearchClient,
  type IngestSearchClient,
} from "./ingestClient.ts";

export const DEFAULT_INGEST_FIXTURE_PATH = new URL(
  "../../../examples/ingest-search/api-requests.json",
  import.meta.url,
);

export interface IngestFixtureRoute {
  readonly method: string;
  readonly path: string;
}

export interface IngestFixtureRequestSpec {
  readonly body?: JsonValue;
}

export interface IngestFixtureResponseSpec {
  readonly status: number;
  readonly body: JsonValue;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface IngestFixtureRequestEntry {
  readonly id: string;
  readonly title?: string;
  readonly route: IngestFixtureRoute;
  readonly request: IngestFixtureRequestSpec;
  readonly response: IngestFixtureResponseSpec;
}

export interface IngestFixtureRequestBundle {
  readonly schemaVersion: string;
  readonly generatedAt?: string;
  readonly apiBase?: string;
  readonly requests: readonly IngestFixtureRequestEntry[];
}

export interface IngestFixtureFetchOptions {
  readonly bundle?: IngestFixtureRequestBundle;
  readonly fixturePath?: string | URL;
}

export interface IngestFixtureClientOptions extends IngestFixtureFetchOptions {
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface IngestFixtureFetchCall {
  readonly url: string;
  readonly method: string;
  readonly path: string;
  readonly body?: JsonValue;
  readonly matchedRequestId?: string;
  readonly status: number;
}

export interface IngestFixtureResponseLike extends FetchResponseLike {
  json(): Promise<JsonValue>;
  clone(): IngestFixtureResponseLike;
}

export interface IngestFixtureFetch extends FetchLike {
  readonly bundle: IngestFixtureRequestBundle;
  readonly calls: readonly IngestFixtureFetchCall[];
}

export interface IngestFixtureClientHarness {
  readonly bundle: IngestFixtureRequestBundle;
  readonly baseUrl: string;
  readonly fetch: IngestFixtureFetch;
  readonly client: IngestSearchClient;
}

interface NormalizedFixtureRequest {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly expectedBody?: JsonValue;
  readonly response: IngestFixtureResponseSpec;
}

type BodyReadResult =
  | {
      readonly ok: true;
      readonly value?: JsonValue;
    }
  | {
      readonly ok: false;
      readonly response: IngestFixtureResponseLike;
    };

export function loadIngestFixtureBundle(
  fixturePath: string | URL = DEFAULT_INGEST_FIXTURE_PATH,
): IngestFixtureRequestBundle {
  const raw = readFileSync(fixturePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  validateFixtureBundle(parsed);
  return deepFreezeClone(parsed);
}

export function createIngestFixtureFetch(
  input: IngestFixtureRequestBundle | IngestFixtureFetchOptions = {},
): IngestFixtureFetch {
  const bundle = resolveFixtureBundle(input);
  const fixtures = normalizeFixtureRequests(bundle);
  const calls: IngestFixtureFetchCall[] = [];

  const fetch = (async (
    url: string,
    init: FetchRequestInit = {},
  ): Promise<IngestFixtureResponseLike> => {
    const requestUrl = parseRequestUrl(url);
    if (requestUrl === undefined) {
      const response = fixtureErrorResponse(400, "ingest_fixture_url_invalid", "Fixture request URL is invalid.", {
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
    const samePath = fixtures.filter((fixture) => fixture.path === path);
    const sameMethod = samePath.filter((fixture) => fixture.method === method);

    if (samePath.length === 0) {
      const response = fixtureErrorResponse(404, "ingest_fixture_request_not_found", "No fixture request matched the path.", {
        method,
        path,
        knownRoutes: fixtures.map((fixture) => `${fixture.method} ${fixture.path}`),
      });
      calls.push(freezeCall({
        url: String(url),
        method,
        path,
        status: response.status,
      }));
      return response;
    }

    if (sameMethod.length === 0) {
      const response = fixtureErrorResponse(405, "ingest_fixture_method_mismatch", "Fixture path matched but method did not.", {
        method,
        path,
        allowedMethods: sortedUnique(samePath.map((fixture) => fixture.method)),
      });
      calls.push(freezeCall({
        url: String(url),
        method,
        path,
        status: response.status,
      }));
      return response;
    }

    const requestBody = readRequestBody(init);
    if (!requestBody.ok) {
      calls.push(freezeCall({
        url: String(url),
        method,
        path,
        status: requestBody.response.status,
      }));
      return requestBody.response;
    }

    for (const fixture of sameMethod) {
      const mismatch = compareJson(fixture.expectedBody, requestBody.value, "");
      if (mismatch === undefined) {
        const response = fixtureResponse(fixture.response);
        calls.push(freezeCall({
          url: String(url),
          method,
          path,
          body: requestBody.value,
          matchedRequestId: fixture.id,
          status: response.status,
        }));
        return response;
      }
    }

    const response = fixtureErrorResponse(422, "ingest_fixture_body_mismatch", "Fixture route matched but request body did not.", {
      method,
      path,
      candidateRequestIds: sameMethod.map((fixture) => fixture.id),
      mismatches: sameMethod.map((fixture) => ({
        requestId: fixture.id,
        mismatch: compareJson(fixture.expectedBody, requestBody.value, "") ?? "unknown mismatch",
      })),
    });
    calls.push(freezeCall({
      url: String(url),
      method,
      path,
      body: requestBody.value,
      status: response.status,
    }));
    return response;
  }) as IngestFixtureFetch;

  Object.defineProperties(fetch, {
    bundle: {
      enumerable: true,
      value: bundle,
    },
    calls: {
      enumerable: true,
      value: calls,
    },
  });

  return fetch;
}

export function createIngestFixtureClient(
  input: IngestFixtureRequestBundle | IngestFixtureClientOptions = {},
): IngestSearchClient {
  return createIngestFixtureClientHarness(input).client;
}

export function createIngestFixtureClientHarness(
  input: IngestFixtureRequestBundle | IngestFixtureClientOptions = {},
): IngestFixtureClientHarness {
  const options = fixtureClientOptions(input);
  const bundle = resolveFixtureBundle(options);
  const fetch = createIngestFixtureFetch(bundle);
  const baseUrl = options.baseUrl ?? baseUrlFromIngestFixtureBundle(bundle);
  const client = createIngestSearchClient({
    baseUrl,
    fetch,
    ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
    ...(options.headers === undefined ? {} : { headers: options.headers }),
  });

  return Object.freeze({
    bundle,
    baseUrl,
    fetch,
    client,
  });
}

export function baseUrlFromIngestFixtureBundle(
  bundle: IngestFixtureRequestBundle = loadIngestFixtureBundle(),
): string {
  validateFixtureBundle(bundle);
  const apiBase = bundle.apiBase ?? "http://127.0.0.1:7317";
  const base = new URL(apiBase.endsWith("/") ? apiBase : `${apiBase}/`);
  const firstPath = bundle.requests[0]?.route.path ?? "";
  const versionPrefix = firstPath.match(/^\/(v[0-9]+)(?:\/|$)/)?.[1];

  return versionPrefix === undefined
    ? base.href
    : new URL(`${versionPrefix}/`, base).href;
}

function resolveFixtureBundle(
  input: IngestFixtureRequestBundle | IngestFixtureFetchOptions,
): IngestFixtureRequestBundle {
  const options = fixtureFetchOptions(input);
  return options.bundle === undefined
    ? loadIngestFixtureBundle(options.fixturePath)
    : deepFreezeClone(validateAndReturnBundle(options.bundle));
}

function fixtureFetchOptions(
  input: IngestFixtureRequestBundle | IngestFixtureFetchOptions,
): IngestFixtureFetchOptions {
  return isFixtureBundle(input) ? { bundle: input } : input;
}

function fixtureClientOptions(
  input: IngestFixtureRequestBundle | IngestFixtureClientOptions,
): IngestFixtureClientOptions {
  return isFixtureBundle(input) ? { bundle: input } : input;
}

function normalizeFixtureRequests(
  bundle: IngestFixtureRequestBundle,
): NormalizedFixtureRequest[] {
  validateFixtureBundle(bundle);
  const seen = new Set<string>();

  return bundle.requests.map((entry) => {
    const method = normalizeMethod(entry.route.method);
    const path = normalizeRoutePath(entry.route.path);
    const expectedBody = entry.request.body;
    const duplicateKey = `${method} ${path} ${stableStringify(expectedBody)}`;

    if (seen.has(duplicateKey)) {
      throw new TypeError(`fixture request is duplicated: ${method} ${path}`);
    }
    seen.add(duplicateKey);

    return deepFreeze({
      id: entry.id,
      method,
      path,
      expectedBody,
      response: entry.response,
    });
  });
}

function readRequestBody(init: FetchRequestInit): BodyReadResult {
  if (init.body === undefined) {
    return { ok: true };
  }

  if (typeof init.body !== "string") {
    return {
      ok: false,
      response: fixtureErrorResponse(400, "ingest_fixture_body_invalid", "Fixture requests must use a JSON string body.", {}),
    };
  }

  try {
    const parsed = JSON.parse(init.body) as unknown;
    if (!isJsonValue(parsed)) {
      return {
        ok: false,
        response: fixtureErrorResponse(400, "ingest_fixture_body_invalid", "Fixture request body must be JSON-compatible.", {}),
      };
    }
    return { ok: true, value: parsed };
  } catch {
    return {
      ok: false,
      response: fixtureErrorResponse(400, "ingest_fixture_body_invalid", "Fixture request body was not valid JSON.", {}),
    };
  }
}

function fixtureResponse(spec: IngestFixtureResponseSpec): IngestFixtureResponseLike {
  return new FixtureResponse(spec.status, spec.body, spec.headers);
}

function fixtureErrorResponse(
  status: number,
  code: string,
  message: string,
  details: JsonValue,
): IngestFixtureResponseLike {
  return fixtureResponse({
    status,
    body: {
      error: {
        code,
        message,
        details,
      },
    },
  });
}

class FixtureResponse implements IngestFixtureResponseLike {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly headers: HeadersLike;

  readonly #body: JsonValue;
  readonly #headers: Readonly<Record<string, string>>;
  readonly #text: string;

  constructor(
    status: number,
    body: JsonValue,
    headers: Readonly<Record<string, string>> = {},
  ) {
    const responseHeaders = {
      "content-type": "application/json",
      ...headers,
    };

    this.ok = status >= 200 && status < 300;
    this.status = status;
    this.statusText = statusTextFor(status);
    this.#body = deepFreezeClone(body);
    this.#headers = deepFreezeClone(responseHeaders);
    this.headers = headersLike(this.#headers);
    this.#text = JSON.stringify(this.#body);
  }

  async text(): Promise<string> {
    return this.#text;
  }

  async json(): Promise<JsonValue> {
    return structuredClone(this.#body);
  }

  clone(): IngestFixtureResponseLike {
    return new FixtureResponse(this.status, this.#body, this.#headers);
  }
}

function validateAndReturnBundle(
  bundle: IngestFixtureRequestBundle,
): IngestFixtureRequestBundle {
  validateFixtureBundle(bundle);
  return bundle;
}

function validateFixtureBundle(value: unknown): asserts value is IngestFixtureRequestBundle {
  if (!isRecord(value)) {
    throw new TypeError("ingest fixture bundle must be an object");
  }
  requireNonEmptyString(value, "schemaVersion", "schemaVersion");
  if (value.generatedAt !== undefined) {
    requireNonEmptyString(value, "generatedAt", "generatedAt");
  }
  if (value.apiBase !== undefined) {
    requireNonEmptyString(value, "apiBase", "apiBase");
    new URL(value.apiBase as string);
  }
  if (!Array.isArray(value.requests) || value.requests.length === 0) {
    throw new TypeError("requests must be a non-empty array");
  }

  value.requests.forEach((request, index) => {
    const path = `requests.${index}`;
    if (!isRecord(request)) {
      throw new TypeError(`${path} must be an object`);
    }

    requireNonEmptyString(request, "id", `${path}.id`);
    if (!isRecord(request.route)) {
      throw new TypeError(`${path}.route must be an object`);
    }
    requireNonEmptyString(request.route, "method", `${path}.route.method`);
    requireRoutePath(request.route, "path", `${path}.route.path`);

    if (!isRecord(request.request)) {
      throw new TypeError(`${path}.request must be an object`);
    }
    if (request.request.body !== undefined && !isJsonValue(request.request.body)) {
      throw new TypeError(`${path}.request.body must be JSON-compatible`);
    }

    if (!isRecord(request.response)) {
      throw new TypeError(`${path}.response must be an object`);
    }
    if (
      !Number.isInteger(request.response.status) ||
      (request.response.status as number) < 100 ||
      (request.response.status as number) > 599
    ) {
      throw new TypeError(`${path}.response.status must be an HTTP status code`);
    }
    if (!isJsonValue(request.response.body)) {
      throw new TypeError(`${path}.response.body must be JSON-compatible`);
    }
    if (request.response.headers !== undefined && !isStringRecord(request.response.headers)) {
      throw new TypeError(`${path}.response.headers must contain string values`);
    }
  });
}

function compareJson(expected: unknown, actual: unknown, path: string): string | undefined {
  if (Object.is(expected, actual)) {
    return undefined;
  }

  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      return mismatch(path, expected, actual);
    }
    if (expected.length !== actual.length) {
      return `${displayPath(path)} length expected ${expected.length} but got ${actual.length}`;
    }
    for (let index = 0; index < expected.length; index += 1) {
      const nested = compareJson(expected[index], actual[index], `${path}.${index}`);
      if (nested !== undefined) {
        return nested;
      }
    }
    return undefined;
  }

  if (isRecord(expected) || isRecord(actual)) {
    if (!isRecord(expected) || !isRecord(actual)) {
      return mismatch(path, expected, actual);
    }

    const expectedKeys = Object.keys(expected).sort();
    const actualKeys = Object.keys(actual).sort();
    for (const key of expectedKeys) {
      if (!Object.hasOwn(actual, key)) {
        return `${displayPath(joinPath(path, key))} missing`;
      }
    }
    for (const key of actualKeys) {
      if (!Object.hasOwn(expected, key)) {
        return `${displayPath(joinPath(path, key))} unexpected`;
      }
    }
    for (const key of expectedKeys) {
      const nested = compareJson(expected[key], actual[key], joinPath(path, key));
      if (nested !== undefined) {
        return nested;
      }
    }
    return undefined;
  }

  return mismatch(path, expected, actual);
}

function mismatch(path: string, expected: unknown, actual: unknown): string {
  return `${displayPath(path)} expected ${shortJson(expected)} but got ${shortJson(actual)}`;
}

function normalizeMethod(value: string | undefined): string {
  return (value ?? "GET").trim().toUpperCase();
}

function normalizeRoutePath(value: string): string {
  const url = new URL(value, "http://ingest.fixture.local");
  return `${url.pathname}${url.search}`;
}

function parseRequestUrl(value: string): URL | undefined {
  try {
    return new URL(String(value), "http://ingest.fixture.local");
  } catch {
    return undefined;
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

function freezeCall(call: IngestFixtureFetchCall): IngestFixtureFetchCall {
  return deepFreezeClone(call);
}

function requireNonEmptyString(
  value: Record<string, unknown>,
  field: string,
  path: string,
): void {
  if (typeof value[field] !== "string" || (value[field] as string).trim().length === 0) {
    throw new TypeError(`${path} must be a non-empty string`);
  }
}

function requireRoutePath(
  value: Record<string, unknown>,
  field: string,
  path: string,
): void {
  requireNonEmptyString(value, field, path);
  if (!(value[field] as string).startsWith("/")) {
    throw new TypeError(`${path} must start with /`);
  }
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
  if (status === 422) {
    return "Unprocessable Entity";
  }
  return "";
}

function shortJson(value: unknown): string {
  const text = stableStringify(value);
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
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

function sortedUnique(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function isFixtureBundle(value: unknown): value is IngestFixtureRequestBundle {
  return isRecord(value) && Array.isArray(value.requests);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
}

function isJsonValue(value: unknown, seen: WeakSet<object> = new WeakSet()): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    const valid = value.every((entry) => isJsonValue(entry, seen));
    seen.delete(value);
    return valid;
  }
  if (isRecord(value)) {
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    const valid = Object.values(value).every((entry) => isJsonValue(entry, seen));
    seen.delete(value);
    return valid;
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function joinPath(prefix: string, field: string): string {
  return prefix.length === 0 ? field : `${prefix}.${field}`;
}

function displayPath(path: string): string {
  return path.length === 0 ? "$" : path;
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
