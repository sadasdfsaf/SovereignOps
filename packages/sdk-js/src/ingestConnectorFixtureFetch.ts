import { readFileSync } from "node:fs";

import {
  type FetchLike,
  type FetchRequestInit,
  type FetchResponseLike,
  type HeadersLike,
  type JsonValue,
} from "./client.ts";
import {
  createIngestConnectorClient,
  type IngestConnectorClient,
  type IngestConnectorClientOptions,
} from "./ingestConnectorClient.ts";
import {
  LOCAL_INGEST_CONNECTOR_MANIFEST_SCHEMA_VERSION,
  normalizeLocalIngestConnectorManifest,
} from "./localIngestConnectorManifest.ts";

export const DEFAULT_INGEST_CONNECTOR_FIXTURE_PATH = new URL(
  "../../../examples/ingest-search/connector-api-requests.json",
  import.meta.url,
);

const INGEST_CONNECTOR_FIXTURE_SCHEMA_VERSION = "ingest-connector-api-requests.v1";
const INGEST_CONNECTOR_MANIFEST_ROUTE_PATTERN = /^\/v[0-9]+\/ingest\/connectors$/;

const RAW_LOCAL_PATH_PATTERN =
  /(?:\b[A-Za-z]:[\\/][^\s"',;)}\]]+|\\\\[^\\\s"',;)}\]]+[\\][^\s"',;)}\]]+|\b(?:\/Users|\/home|\/var|\/tmp|\/private|\/mnt|\/Volumes)\/[^\s"',;)}\]]+)/g;
const PRIVATE_LOCATION_PATTERN =
  /(?:^|[\\/])\.codex-private(?:[\\/]|$)|\bprivate[-_\s]?plan(?:[-_\s]?pack)?\b/gi;
const SECRET_VALUE_PATTERN =
  /\b(?:Bearer\s+[A-Za-z0-9._~+/=-]{8,}|(?:sk|rk|pk|tok|pat|npm|ghp|gho)_[A-Za-z0-9_-]{8,}|(?:sk|rk|pat|glpat|github_pat)-[A-Za-z0-9_-]{8,})\b/gi;
const SECRET_ASSIGNMENT_PATTERN =
  /\b((?:api[-_]?key|apikey|authorization|credential|password|passphrase|secret|session[-_]?token|token)\s*[:=]\s*)([^\s,;]+)/gi;
const SENSITIVE_FIELD_PATTERN =
  /(?:authorization|api[-_]?key|apikey|auth|bearer|cookie|credential|jwt|password|passphrase|private[-_]?key|refresh[-_]?token|secret|session[-_]?token|signing[-_]?key|token)$/i;
const PATH_FIELD_PATTERN =
  /(?:^|_)(?:absolute_path|file_path|include_paths?|path|paths|relative_path|root_path|storage_path)$/i;
const REDACTED_TOKEN_PATTERN = /^\[redacted(?::[A-Za-z0-9_-]+)*\]$/i;

export type IngestConnectorFixtureErrorCode =
  | "ingest_connector_fixture_load_failed"
  | "ingest_connector_fixture_parse_failed"
  | "ingest_connector_fixture_invalid"
  | "ingest_connector_fixture_url_invalid"
  | "ingest_connector_fixture_request_not_found"
  | "ingest_connector_fixture_method_mismatch"
  | "ingest_connector_fixture_body_invalid"
  | "ingest_connector_fixture_body_mismatch";

export interface IngestConnectorFixtureIssue {
  readonly path: string;
  readonly message: string;
}

export class IngestConnectorFixtureError extends TypeError {
  readonly code: IngestConnectorFixtureErrorCode;
  readonly issues: readonly IngestConnectorFixtureIssue[];

  constructor(
    code: IngestConnectorFixtureErrorCode,
    message: string,
    issues: readonly IngestConnectorFixtureIssue[] = [],
  ) {
    super(redactUnsafeText(message));
    this.name = "IngestConnectorFixtureError";
    this.code = code;
    this.issues = deepFreezeClone(
      issues.map((issue) => ({
        path: redactUnsafeText(issue.path),
        message: redactUnsafeText(issue.message),
      })),
    );
  }
}

export interface IngestConnectorFixtureRoute {
  readonly method: string;
  readonly path: string;
}

export interface IngestConnectorFixtureRequestSpec {
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: JsonValue;
}

export interface IngestConnectorFixtureResponseSpec {
  readonly status: number;
  readonly body: JsonValue;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface IngestConnectorFixtureExpectationSpec {
  readonly status: number;
  readonly contentType?: string;
  readonly schemaVersion?: string;
  readonly localOnly?: boolean;
  readonly connectorCount?: number;
  readonly connectorIds?: readonly string[];
  readonly body?: JsonValue;
  readonly error?: JsonValue;
  readonly [key: string]: JsonValue | undefined;
}

export interface IngestConnectorFixtureRequestEntry {
  readonly id: string;
  readonly title?: string;
  readonly route: IngestConnectorFixtureRoute;
  readonly request: IngestConnectorFixtureRequestSpec;
  readonly response?: IngestConnectorFixtureResponseSpec;
  readonly expect?: IngestConnectorFixtureExpectationSpec;
}

export interface IngestConnectorFixtureRequestBundle {
  readonly schemaVersion: string;
  readonly generatedAt?: string;
  readonly apiBase?: string;
  readonly localOnly?: boolean;
  readonly requests: readonly IngestConnectorFixtureRequestEntry[];
}

export interface IngestConnectorFixtureFetchOptions {
  readonly bundle?: IngestConnectorFixtureRequestBundle;
  readonly fixturePath?: string | URL;
}

export interface IngestConnectorFixtureClientOptions extends IngestConnectorFixtureFetchOptions {
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface IngestConnectorFixtureFetchCall {
  readonly url: string;
  readonly method: string;
  readonly path: string;
  readonly body?: JsonValue;
  readonly matchedRequestId?: string;
  readonly status: number;
}

export interface IngestConnectorFixtureErrorBody {
  readonly error: {
    readonly code: IngestConnectorFixtureErrorCode;
    readonly message: string;
    readonly details: JsonValue;
  };
}

export interface IngestConnectorFixtureResponseLike extends FetchResponseLike {
  json(): Promise<JsonValue>;
  clone(): IngestConnectorFixtureResponseLike;
}

export interface IngestConnectorFixtureFetch extends FetchLike {
  readonly bundle: IngestConnectorFixtureRequestBundle;
  readonly calls: readonly IngestConnectorFixtureFetchCall[];
}

export interface IngestConnectorFixtureClientHarness {
  readonly bundle: IngestConnectorFixtureRequestBundle;
  readonly baseUrl: string;
  readonly fetch: IngestConnectorFixtureFetch;
  readonly client: IngestConnectorClient;
}

interface NormalizedFixtureRequest {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly expectedBody?: JsonValue;
  readonly response: IngestConnectorFixtureResponseSpec;
}

type BodyReadResult =
  | {
      readonly ok: true;
      readonly value?: JsonValue;
    }
  | {
      readonly ok: false;
      readonly response: IngestConnectorFixtureResponseLike;
    };

export function loadIngestConnectorFixtureBundle(
  fixturePath: string | URL = DEFAULT_INGEST_CONNECTOR_FIXTURE_PATH,
): IngestConnectorFixtureRequestBundle {
  let raw: string;
  try {
    raw = readFileSync(fixturePath, "utf8");
  } catch {
    throw new IngestConnectorFixtureError(
      "ingest_connector_fixture_load_failed",
      "ingest connector fixture bundle could not be loaded",
      [{ path: "fixturePath", message: redactUnsafeText(String(fixturePath)) }],
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new IngestConnectorFixtureError(
      "ingest_connector_fixture_parse_failed",
      "ingest connector fixture bundle is not valid JSON",
    );
  }

  validateFixtureBundle(parsed);
  return deepFreezeClone(parsed);
}

export function createIngestConnectorFixtureFetch(
  input: IngestConnectorFixtureRequestBundle | IngestConnectorFixtureFetchOptions = {},
): IngestConnectorFixtureFetch {
  const bundle = resolveFixtureBundle(input);
  const fixtures = normalizeFixtureRequests(bundle);
  const calls: IngestConnectorFixtureFetchCall[] = [];

  const fetch = (async (
    url: string,
    init: FetchRequestInit = {},
  ): Promise<IngestConnectorFixtureResponseLike> => {
    const requestUrl = parseRequestUrl(url);
    if (requestUrl === undefined) {
      const response = fixtureErrorResponse(400, "ingest_connector_fixture_url_invalid", "Fixture request URL is invalid.", {
        url: String(url),
      });
      calls.push(freezeCall({
        url: redactUnsafeText(String(url)),
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
      const response = fixtureErrorResponse(404, "ingest_connector_fixture_request_not_found", "No fixture request matched the path.", {
        method,
        path,
        knownRoutes: fixtures.map((fixture) => `${fixture.method} ${fixture.path}`),
      });
      calls.push(freezeCall({
        url: redactUnsafeText(String(url)),
        method,
        path: redactUnsafeText(path),
        status: response.status,
      }));
      return response;
    }

    if (sameMethod.length === 0) {
      const response = fixtureErrorResponse(405, "ingest_connector_fixture_method_mismatch", "Fixture path matched but method did not.", {
        method,
        path,
        allowedMethods: sortedUnique(samePath.map((fixture) => fixture.method)),
      });
      calls.push(freezeCall({
        url: redactUnsafeText(String(url)),
        method,
        path: redactUnsafeText(path),
        status: response.status,
      }));
      return response;
    }

    const requestBody = readRequestBody(init);
    if (!requestBody.ok) {
      calls.push(freezeCall({
        url: redactUnsafeText(String(url)),
        method,
        path: redactUnsafeText(path),
        status: requestBody.response.status,
      }));
      return requestBody.response;
    }

    for (const fixture of sameMethod) {
      const mismatch = compareJson(fixture.expectedBody, requestBody.value, "");
      if (mismatch === undefined) {
        const response = fixtureResponse(fixture.response);
        calls.push(freezeCall({
          url: redactUnsafeText(String(url)),
          method,
          path: redactUnsafeText(path),
          body: requestBody.value === undefined ? undefined : redactUnsafeValue(requestBody.value) as JsonValue,
          matchedRequestId: fixture.id,
          status: response.status,
        }));
        return response;
      }
    }

    const response = fixtureErrorResponse(422, "ingest_connector_fixture_body_mismatch", "Fixture route matched but request body did not.", {
      method,
      path,
      candidateRequestIds: sameMethod.map((fixture) => fixture.id),
      mismatches: sameMethod.map((fixture) => ({
        requestId: fixture.id,
        mismatch: compareJson(fixture.expectedBody, requestBody.value, "") ?? "unknown mismatch",
      })),
    });
    calls.push(freezeCall({
      url: redactUnsafeText(String(url)),
      method,
      path: redactUnsafeText(path),
      body: requestBody.value === undefined ? undefined : redactUnsafeValue(requestBody.value) as JsonValue,
      status: response.status,
    }));
    return response;
  }) as IngestConnectorFixtureFetch;

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

export function createIngestConnectorFixtureClient(
  input: IngestConnectorFixtureRequestBundle | IngestConnectorFixtureClientOptions = {},
): IngestConnectorClient {
  return createIngestConnectorFixtureClientHarness(input).client;
}

export function createIngestConnectorFixtureClientHarness(
  input: IngestConnectorFixtureRequestBundle | IngestConnectorFixtureClientOptions = {},
): IngestConnectorFixtureClientHarness {
  const options = fixtureClientOptions(input);
  const bundle = resolveFixtureBundle(options);
  const fetch = createIngestConnectorFixtureFetch(bundle);
  const baseUrl = options.baseUrl ?? baseUrlFromIngestConnectorFixtureBundle(bundle);
  const client = createIngestConnectorClient({
    baseUrl,
    fetch,
    ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
    ...(options.headers === undefined ? {} : { headers: options.headers }),
  } satisfies IngestConnectorClientOptions);

  return Object.freeze({
    bundle,
    baseUrl,
    fetch,
    client,
  });
}

export function baseUrlFromIngestConnectorFixtureBundle(
  bundle: IngestConnectorFixtureRequestBundle = loadIngestConnectorFixtureBundle(),
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
  input: IngestConnectorFixtureRequestBundle | IngestConnectorFixtureFetchOptions,
): IngestConnectorFixtureRequestBundle {
  const options = fixtureFetchOptions(input);
  return options.bundle === undefined
    ? loadIngestConnectorFixtureBundle(options.fixturePath)
    : deepFreezeClone(validateAndReturnBundle(options.bundle));
}

function fixtureFetchOptions(
  input: IngestConnectorFixtureRequestBundle | IngestConnectorFixtureFetchOptions,
): IngestConnectorFixtureFetchOptions {
  return isFixtureBundle(input) ? { bundle: input } : input;
}

function fixtureClientOptions(
  input: IngestConnectorFixtureRequestBundle | IngestConnectorFixtureClientOptions,
): IngestConnectorFixtureClientOptions {
  return isFixtureBundle(input) ? { bundle: input } : input;
}

function normalizeFixtureRequests(
  bundle: IngestConnectorFixtureRequestBundle,
): NormalizedFixtureRequest[] {
  validateFixtureBundle(bundle);
  const seen = new Set<string>();

  return bundle.requests.map((entry) => {
    const method = normalizeMethod(entry.route.method);
    const path = normalizeRoutePath(entry.route.path);
    const expectedBody = entry.request.body;
    const duplicateKey = `${method} ${path} ${stableStringify(expectedBody)}`;

    if (seen.has(duplicateKey)) {
      throw invalidFixture([
        { path: "requests", message: `fixture request is duplicated: ${method} ${path}` },
      ]);
    }
    seen.add(duplicateKey);

    return deepFreeze({
      id: entry.id,
      method,
      path,
      expectedBody,
      response: responseSpecForEntry(entry),
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
      response: fixtureErrorResponse(400, "ingest_connector_fixture_body_invalid", "Fixture requests must use a JSON string body.", {}),
    };
  }

  try {
    const parsed = JSON.parse(init.body) as unknown;
    if (!isJsonValue(parsed)) {
      return {
        ok: false,
        response: fixtureErrorResponse(400, "ingest_connector_fixture_body_invalid", "Fixture request body must be JSON-compatible.", {}),
      };
    }
    return { ok: true, value: parsed };
  } catch {
    return {
      ok: false,
      response: fixtureErrorResponse(400, "ingest_connector_fixture_body_invalid", "Fixture request body was not valid JSON.", {}),
    };
  }
}

function fixtureResponse(spec: IngestConnectorFixtureResponseSpec): IngestConnectorFixtureResponseLike {
  return new FixtureResponse(spec.status, spec.body, spec.headers);
}

function fixtureErrorResponse(
  status: number,
  code: IngestConnectorFixtureErrorCode,
  message: string,
  details: JsonValue,
): IngestConnectorFixtureResponseLike {
  return fixtureResponse({
    status,
    body: {
      error: {
        code,
        message: redactUnsafeText(message),
        details: redactUnsafeValue(details) as JsonValue,
      },
    } satisfies IngestConnectorFixtureErrorBody,
  });
}

function responseSpecForEntry(
  entry: IngestConnectorFixtureRequestEntry,
): IngestConnectorFixtureResponseSpec {
  if (entry.response !== undefined) {
    return entry.response;
  }

  const expect = entry.expect;
  if (expect === undefined) {
    throw invalidFixture([
      { path: `requests.${entry.id}`, message: "fixture request must include response or expect" },
    ]);
  }

  const headers = {
    "content-type": expect.contentType ?? "application/json",
  };

  if (expect.body !== undefined) {
    return {
      status: expect.status,
      headers,
      body: expect.body,
    };
  }

  if (expect.status >= 400) {
    return {
      status: expect.status,
      headers,
      body: {
        error: expect.error ?? {
          code: "fixture_expected_error",
          message: "Fixture expected an error response.",
          details: {},
        },
      },
    };
  }

  throw invalidFixture([
    { path: `requests.${entry.id}.expect.body`, message: "successful connector fixture expectations must include a body" },
  ]);
}

class FixtureResponse implements IngestConnectorFixtureResponseLike {
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

  clone(): IngestConnectorFixtureResponseLike {
    return new FixtureResponse(this.status, this.#body, this.#headers);
  }
}

function validateAndReturnBundle(
  bundle: IngestConnectorFixtureRequestBundle,
): IngestConnectorFixtureRequestBundle {
  validateFixtureBundle(bundle);
  return bundle;
}

function validateFixtureBundle(value: unknown): asserts value is IngestConnectorFixtureRequestBundle {
  const issues: IngestConnectorFixtureIssue[] = [];

  if (!isRecord(value)) {
    throw invalidFixture([{ path: "", message: "ingest connector fixture bundle must be an object" }]);
  }

  if (value.schemaVersion !== INGEST_CONNECTOR_FIXTURE_SCHEMA_VERSION) {
    issues.push({
      path: "schemaVersion",
      message: `schemaVersion must be ${INGEST_CONNECTOR_FIXTURE_SCHEMA_VERSION}`,
    });
  }
  if (value.generatedAt !== undefined && !isIsoTimestamp(value.generatedAt)) {
    issues.push({ path: "generatedAt", message: "generatedAt must be an ISO timestamp" });
  }
  if (value.apiBase !== undefined) {
    if (typeof value.apiBase !== "string" || value.apiBase.trim().length === 0) {
      issues.push({ path: "apiBase", message: "apiBase must be a non-empty string" });
    } else {
      try {
        const parsed = new URL(value.apiBase);
        if (!isLocalApiBase(parsed)) {
          issues.push({ path: "apiBase", message: "apiBase must be a local:// or loopback URL" });
        }
      } catch {
        issues.push({ path: "apiBase", message: "apiBase must be an absolute URL" });
      }
    }
  }
  if (value.localOnly !== undefined && value.localOnly !== true) {
    issues.push({ path: "localOnly", message: "localOnly must be true when present" });
  }
  if (!Array.isArray(value.requests) || value.requests.length === 0) {
    issues.push({ path: "requests", message: "requests must be a non-empty array" });
  }

  if (Array.isArray(value.requests)) {
    const seenIds = new Set<string>();
    let successfulManifestRoutes = 0;

    value.requests.forEach((request, index) => {
      const path = `requests.${index}`;
      if (!isRecord(request)) {
        issues.push({ path, message: "request must be an object" });
        return;
      }

      if (typeof request.id !== "string" || request.id.trim().length === 0) {
        issues.push({ path: `${path}.id`, message: "id must be a non-empty string" });
      } else if (seenIds.has(request.id)) {
        issues.push({ path: `${path}.id`, message: "request id must be unique" });
      } else {
        seenIds.add(request.id);
      }

      if (!isRecord(request.route)) {
        issues.push({ path: `${path}.route`, message: "route must be an object" });
      } else {
        requireNonEmptyString(request.route, "method", `${path}.route.method`, issues);
        requireRoutePath(request.route, "path", `${path}.route.path`, issues);
      }

      if (!isRecord(request.request)) {
        issues.push({ path: `${path}.request`, message: "request must be an object" });
      } else {
        if (request.request.headers !== undefined && !isStringRecord(request.request.headers)) {
          issues.push({ path: `${path}.request.headers`, message: "headers must contain string values" });
        }
        if (request.request.body !== undefined && !isJsonValue(request.request.body)) {
          issues.push({ path: `${path}.request.body`, message: "body must be JSON-compatible" });
        }
      }

      if (request.response !== undefined) {
        validateResponseSpec(request.response, `${path}.response`, issues);
      }
      if (request.expect !== undefined) {
        validateExpectationSpec(request.expect, `${path}.expect`, issues);
      }
      if (request.response === undefined && request.expect === undefined) {
        issues.push({ path, message: "request must include response or expect" });
      }

      if (isRecord(request.route) && isRecord(request.request)) {
        const method = typeof request.route.method === "string"
          ? normalizeMethod(request.route.method)
          : "";
        const routePath = typeof request.route.path === "string"
          ? normalizeRoutePath(request.route.path)
          : "";
        const status = statusForEntry(request);

        if (isSuccessStatus(status)) {
          if (method !== "GET") {
            issues.push({ path: `${path}.route.method`, message: "successful connector manifest fixture route must use GET" });
          }
          if (!isConnectorManifestFixturePath(routePath)) {
            issues.push({ path: `${path}.route.path`, message: "successful connector manifest fixture route must be /v1/ingest/connectors" });
          }
          if (request.request.body !== undefined) {
            issues.push({ path: `${path}.request.body`, message: "GET connector manifest fixture request must not include a body" });
          }
          successfulManifestRoutes += validateManifestExpectation(request, path, issues) ? 1 : 0;
        }
      }
    });

    if (successfulManifestRoutes !== 1) {
      issues.push({
        path: "requests",
        message: "requests must contain exactly one successful GET /v1/ingest/connectors manifest fixture",
      });
    }
  }

  if (issues.length > 0) {
    throw invalidFixture(issues);
  }
}

function validateResponseSpec(
  value: unknown,
  path: string,
  issues: IngestConnectorFixtureIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "response must be an object" });
    return;
  }
  validateStatus(value.status, `${path}.status`, issues);
  if (!isJsonValue(value.body)) {
    issues.push({ path: `${path}.body`, message: "body must be JSON-compatible" });
  }
  if (value.headers !== undefined && !isStringRecord(value.headers)) {
    issues.push({ path: `${path}.headers`, message: "headers must contain string values" });
  }
}

function validateExpectationSpec(
  value: unknown,
  path: string,
  issues: IngestConnectorFixtureIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "expect must be an object" });
    return;
  }
  validateStatus(value.status, `${path}.status`, issues);
  if (value.contentType !== undefined && typeof value.contentType !== "string") {
    issues.push({ path: `${path}.contentType`, message: "contentType must be a string" });
  }
  if (value.schemaVersion !== undefined && typeof value.schemaVersion !== "string") {
    issues.push({ path: `${path}.schemaVersion`, message: "schemaVersion must be a string" });
  }
  if (value.localOnly !== undefined && typeof value.localOnly !== "boolean") {
    issues.push({ path: `${path}.localOnly`, message: "localOnly must be a boolean" });
  }
  if (value.connectorCount !== undefined && (!Number.isInteger(value.connectorCount) || (value.connectorCount as number) < 0)) {
    issues.push({ path: `${path}.connectorCount`, message: "connectorCount must be a non-negative integer" });
  }
  if (value.connectorIds !== undefined && !isStringArray(value.connectorIds)) {
    issues.push({ path: `${path}.connectorIds`, message: "connectorIds must contain string values" });
  }
  if (value.body !== undefined && !isJsonValue(value.body)) {
    issues.push({ path: `${path}.body`, message: "body must be JSON-compatible" });
  }
  if (value.error !== undefined && !isJsonValue(value.error)) {
    issues.push({ path: `${path}.error`, message: "error must be JSON-compatible" });
  }
  if (!isJsonValue(value)) {
    issues.push({ path, message: "expect must be JSON-compatible" });
  }
}

function validateStatus(
  value: unknown,
  path: string,
  issues: IngestConnectorFixtureIssue[],
): void {
  if (!Number.isInteger(value) || (value as number) < 100 || (value as number) > 599) {
    issues.push({ path, message: "status must be an HTTP status code" });
  }
}

function validateManifestExpectation(
  entry: IngestConnectorFixtureRequestEntry,
  path: string,
  issues: IngestConnectorFixtureIssue[],
): boolean {
  const body = responseBodyForEntry(entry);
  if (body === undefined) {
    issues.push({ path: `${path}.expect.body`, message: "successful connector fixture must include a response body" });
    return false;
  }

  try {
    const manifest = normalizeLocalIngestConnectorManifest(body);
    const expect = entry.expect;
    if (expect !== undefined) {
      if (
        expect.schemaVersion !== undefined &&
        expect.schemaVersion !== manifest.schemaVersion
      ) {
        issues.push({ path: `${path}.expect.schemaVersion`, message: "schemaVersion must match the manifest body" });
      }
      if (expect.localOnly !== undefined && expect.localOnly !== manifest.localOnly) {
        issues.push({ path: `${path}.expect.localOnly`, message: "localOnly must match the manifest body" });
      }
      if (expect.connectorCount !== undefined && expect.connectorCount !== manifest.profileCount) {
        issues.push({ path: `${path}.expect.connectorCount`, message: "connectorCount must match the manifest body" });
      }
      if (expect.connectorIds !== undefined) {
        const connectorIds = connectorIdsForBody(body);
        const mismatch = compareJson(expect.connectorIds, connectorIds, "");
        if (mismatch !== undefined) {
          issues.push({ path: `${path}.expect.connectorIds`, message: "connectorIds must match the manifest body" });
        }
      }
    }
    if (manifest.schemaVersion !== LOCAL_INGEST_CONNECTOR_MANIFEST_SCHEMA_VERSION) {
      issues.push({ path: `${path}.expect.body.schemaVersion`, message: "manifest schemaVersion is unsupported" });
    }
    return true;
  } catch (error) {
    issues.push({
      path: `${path}.expect.body`,
      message: error instanceof Error ? error.message : "connector manifest body is invalid",
    });
    return false;
  }
}

function responseBodyForEntry(entry: IngestConnectorFixtureRequestEntry): JsonValue | undefined {
  return entry.response?.body ?? entry.expect?.body;
}

function statusForEntry(entry: IngestConnectorFixtureRequestEntry): number | undefined {
  return entry.response?.status ?? entry.expect?.status;
}

function connectorIdsForBody(body: JsonValue): string[] {
  if (!isRecord(body)) {
    return [];
  }
  const connectors = Array.isArray(body.connectors) ? body.connectors : body.profiles;
  return Array.isArray(connectors)
    ? connectors
        .map((connector) => isRecord(connector) ? connector.id ?? connector.profileId : undefined)
        .filter((id): id is string => typeof id === "string")
    : [];
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
  return `${displayPath(path)} expected ${shortJson(redactUnsafeValue(expected))} but got ${shortJson(redactUnsafeValue(actual))}`;
}

function normalizeMethod(value: string | undefined): string {
  return (value ?? "GET").trim().toUpperCase();
}

function normalizeRoutePath(value: string): string {
  const url = new URL(value, "http://ingest-connector.fixture.local");
  return `${url.pathname}${url.search}`;
}

function parseRequestUrl(value: string): URL | undefined {
  try {
    return new URL(String(value), "http://ingest-connector.fixture.local");
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

function freezeCall(call: IngestConnectorFixtureFetchCall): IngestConnectorFixtureFetchCall {
  return deepFreezeClone(call);
}

function invalidFixture(
  issues: readonly IngestConnectorFixtureIssue[],
): IngestConnectorFixtureError {
  return new IngestConnectorFixtureError(
    "ingest_connector_fixture_invalid",
    "ingest connector fixture bundle is invalid",
    issues,
  );
}

function requireNonEmptyString(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: IngestConnectorFixtureIssue[],
): void {
  if (typeof value[field] !== "string" || (value[field] as string).trim().length === 0) {
    issues.push({ path, message: `${field} must be a non-empty string` });
  }
}

function requireRoutePath(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: IngestConnectorFixtureIssue[],
): void {
  requireNonEmptyString(value, field, path, issues);
  if (typeof value[field] === "string" && !(value[field] as string).startsWith("/")) {
    issues.push({ path, message: `${field} must start with /` });
  }
}

function isConnectorManifestFixturePath(value: string): boolean {
  const url = new URL(value, "http://ingest-connector.fixture.local");
  return INGEST_CONNECTOR_MANIFEST_ROUTE_PATTERN.test(url.pathname) && url.search === "";
}

function isSuccessStatus(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 200 && (value as number) < 300;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    new Date(Date.parse(value)).toISOString() === value;
}

function isLocalApiBase(value: URL): boolean {
  if (value.protocol === "local:") {
    return true;
  }
  if (value.protocol !== "http:" && value.protocol !== "https:") {
    return false;
  }
  return value.hostname === "localhost" ||
    value.hostname === "127.0.0.1" ||
    value.hostname === "::1" ||
    value.hostname === "[::1]";
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

function isFixtureBundle(value: unknown): value is IngestConnectorFixtureRequestBundle {
  return isRecord(value) && Array.isArray(value.requests);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
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

function redactUnsafeValue(
  value: unknown,
  keyHint = "",
  seen: WeakSet<object> = new WeakSet<object>(),
): unknown {
  if (typeof value === "string") {
    return redactUnsafeText(value, keyHint);
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return "[redacted:circular]";
    }
    seen.add(value);
    const redacted = value.map((item) => redactUnsafeValue(item, keyHint, seen));
    seen.delete(value);
    return redacted;
  }

  if (isRecord(value)) {
    if (seen.has(value)) {
      return "[redacted:circular]";
    }
    seen.add(value);
    const redacted = Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        redactUnsafeValue(nested, key, seen),
      ]),
    );
    seen.delete(value);
    return redacted;
  }

  return value;
}

function redactUnsafeText(value: string, keyHint = ""): string {
  if (isRedactedToken(value)) {
    return value;
  }

  if (SENSITIVE_FIELD_PATTERN.test(keyHint) && value.trim().length > 0) {
    return "[redacted:secret]";
  }

  const key = normalizeToken(keyHint);
  if (PATH_FIELD_PATTERN.test(key) && hasTraversalSegment(value)) {
    return "[redacted:path]";
  }

  return value
    .replace(SECRET_ASSIGNMENT_PATTERN, (_match, prefix: string) => `${prefix}[redacted:secret]`)
    .replace(SECRET_VALUE_PATTERN, "[redacted:secret]")
    .replace(RAW_LOCAL_PATH_PATTERN, "[redacted:path]")
    .replace(PRIVATE_LOCATION_PATTERN, "[redacted:path]");
}

function normalizeToken(value: string): string {
  return value
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function hasTraversalSegment(value: string): boolean {
  return value
    .replace(/\\/g, "/")
    .split("/")
    .includes("..");
}

function isRedactedToken(value: string): boolean {
  return (
    value === "[REDACTED]" ||
    value === "[redacted:path]" ||
    value === "[redacted:secret]" ||
    REDACTED_TOKEN_PATTERN.test(value)
  );
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
