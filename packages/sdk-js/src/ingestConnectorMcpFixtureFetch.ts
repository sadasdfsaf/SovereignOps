import { readFileSync } from "node:fs";

import {
  type FetchLike,
  type FetchRequestInit,
  type FetchResponseLike,
  type HeadersLike,
  type JsonValue,
} from "./client.ts";
import {
  createIngestConnectorMcpClient,
  type IngestConnectorMcpClient,
  type IngestConnectorMcpClientOptions,
} from "./ingestConnectorMcpClient.ts";

export const DEFAULT_INGEST_CONNECTOR_MCP_FIXTURE_PATH = new URL(
  "../../../examples/ingest-search/connector-mcp-api-requests.json",
  import.meta.url,
);

const INGEST_CONNECTOR_MCP_FIXTURE_SCHEMA_VERSION = "ingest-connector-mcp-api-requests.v1";
const MCP_RESOURCE_LIST_ROUTE_PATTERN = /^\/v[0-9]+\/ingest\/connectors\/mcp\/resources$/;
const MCP_RESOURCE_READ_ROUTE_PATTERN = /^\/v[0-9]+\/ingest\/connectors\/mcp\/resources\/([^/?#]+)$/;
const MCP_PREVIEW_ROUTE_PATTERN = /^\/v[0-9]+\/ingest\/connectors\/mcp\/preview$/;
const CONNECTOR_ID_PATTERN = /^local\.[A-Za-z0-9_.-]{1,96}$/;

const RAW_LOCAL_PATH_PATTERN =
  /(?:\b[A-Za-z]:[\\/][^\s"',;)}\]]+|\\\\[^\\\s"',;)}\]]+[\\][^\s"',;)}\]]+|\b(?:\/Users|\/home|\/root|\/tmp|\/var|\/etc|\/opt|\/private|\/mnt|\/Volumes)\/[^\s"',;)}\]]+)/g;
const PRIVATE_LOCATION_PATTERN =
  /(?:^|[\\/])\.codex-private(?:[\\/]|$)|(?:^|[\\/])\.codex-run(?:[\\/]|$)|\bsovereignops-codex-pack\b|\bplan-pack\b|\bprivate[-_\s]?plan(?:[-_\s]?pack)?\b|\bcodex_start_here\b/gi;
const SECRET_VALUE_PATTERN =
  /\b(?:Bearer\s+[A-Za-z0-9._~+/=-]{8,}|(?:sk|rk|pk|tok|pat|npm|ghp|gho)_[A-Za-z0-9_-]{8,}|(?:sk|rk|pat|glpat|github_pat)-[A-Za-z0-9_-]{8,}|AKIA[0-9A-Z]{16})\b|-----BEGIN [A-Z ]*PRIVATE KEY-----/gi;
const SECRET_ASSIGNMENT_PATTERN =
  /\b((?:api[-_]?key|apikey|authorization|credential|password|passwd|passphrase|secret|session[-_]?token|token)\s*[:=]\s*)([^\s,;]+)/gi;
const SENSITIVE_FIELD_PATTERN =
  /(?:authorization|api[-_]?key|apikey|auth|bearer|cookie|credential|jwt|password|passwd|passphrase|private[-_]?key|refresh[-_]?token|secret|session[-_]?token|signing[-_]?key|token)$/i;
const PATH_FIELD_PATTERN =
  /(?:^|_)(?:absolute_path|file_path|include_paths?|path|paths|relative_path|root_path|storage_path)$/i;
const REDACTED_TOKEN_PATTERN = /^\[redacted(?::[A-Za-z0-9_-]+)*\]$/i;

export type IngestConnectorMcpFixtureErrorCode =
  | "ingest_connector_mcp_fixture_load_failed"
  | "ingest_connector_mcp_fixture_parse_failed"
  | "ingest_connector_mcp_fixture_invalid"
  | "ingest_connector_mcp_fixture_url_invalid"
  | "ingest_connector_mcp_fixture_request_not_found"
  | "ingest_connector_mcp_fixture_method_mismatch"
  | "ingest_connector_mcp_fixture_body_invalid"
  | "ingest_connector_mcp_fixture_body_mismatch";

export interface IngestConnectorMcpFixtureIssue {
  readonly path: string;
  readonly message: string;
}

export class IngestConnectorMcpFixtureError extends TypeError {
  readonly code: IngestConnectorMcpFixtureErrorCode;
  readonly issues: readonly IngestConnectorMcpFixtureIssue[];

  constructor(
    code: IngestConnectorMcpFixtureErrorCode,
    message: string,
    issues: readonly IngestConnectorMcpFixtureIssue[] = [],
  ) {
    super(redactUnsafeText(message));
    this.name = "IngestConnectorMcpFixtureError";
    this.code = code;
    this.issues = deepFreezeClone(
      issues.map((issue) => ({
        path: redactUnsafeText(issue.path),
        message: redactUnsafeText(issue.message),
      })),
    );
  }
}

export interface IngestConnectorMcpFixtureNetworkSpec {
  readonly mode: "disabled";
  readonly notes?: string;
}

export interface IngestConnectorMcpFixtureAuthSpec {
  readonly mode: "none";
  readonly required: false;
}

export interface IngestConnectorMcpFixtureExpectedChecks {
  readonly schemaVersion?: string;
  readonly localOnly?: boolean;
  readonly resourceCount?: number;
  readonly connectorIds?: readonly string[];
  readonly connectorId?: string;
  readonly contentIncluded?: boolean;
  readonly errorCode?: string;
  readonly [key: string]: JsonValue | undefined;
}

export interface IngestConnectorMcpFixtureRequestEntry {
  readonly id: string;
  readonly title?: string;
  readonly method: string;
  readonly path: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: JsonValue;
  readonly expectedStatus: number;
  readonly expectedBody: JsonValue;
  readonly expectedChecks?: IngestConnectorMcpFixtureExpectedChecks;
}

export interface IngestConnectorMcpFixtureRequestBundle {
  readonly schemaVersion: string;
  readonly generatedAt?: string;
  readonly apiBase?: string;
  readonly localOnly?: boolean;
  readonly network?: IngestConnectorMcpFixtureNetworkSpec;
  readonly durableWrites?: false;
  readonly auth?: IngestConnectorMcpFixtureAuthSpec;
  readonly requests: readonly IngestConnectorMcpFixtureRequestEntry[];
}

export interface IngestConnectorMcpFixtureFetchOptions {
  readonly bundle?: IngestConnectorMcpFixtureRequestBundle;
  readonly fixturePath?: string | URL;
}

export interface IngestConnectorMcpFixtureClientOptions extends IngestConnectorMcpFixtureFetchOptions {
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface IngestConnectorMcpFixtureFetchCall {
  readonly url: string;
  readonly method: string;
  readonly path: string;
  readonly body?: JsonValue;
  readonly matchedRequestId?: string;
  readonly status: number;
}

export interface IngestConnectorMcpFixtureErrorBody {
  readonly error: {
    readonly code: IngestConnectorMcpFixtureErrorCode;
    readonly message: string;
    readonly details: JsonValue;
  };
}

export interface IngestConnectorMcpFixtureResponseLike extends FetchResponseLike {
  json(): Promise<JsonValue>;
  clone(): IngestConnectorMcpFixtureResponseLike;
}

export interface IngestConnectorMcpFixtureFetch extends FetchLike {
  readonly bundle: IngestConnectorMcpFixtureRequestBundle;
  readonly calls: readonly IngestConnectorMcpFixtureFetchCall[];
}

export interface IngestConnectorMcpFixtureClientHarness {
  readonly bundle: IngestConnectorMcpFixtureRequestBundle;
  readonly baseUrl: string;
  readonly fetch: IngestConnectorMcpFixtureFetch;
  readonly client: IngestConnectorMcpClient;
}

interface NormalizedMcpFixtureRequest {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly expectedBody?: JsonValue;
  readonly response: IngestConnectorMcpFixtureResponseSpec;
}

interface IngestConnectorMcpFixtureResponseSpec {
  readonly status: number;
  readonly body: JsonValue;
  readonly headers?: Readonly<Record<string, string>>;
}

type McpFixtureRouteKind = "resources_list" | "resource_read" | "preview";

type BodyReadResult =
  | {
      readonly ok: true;
      readonly value?: JsonValue;
    }
  | {
      readonly ok: false;
      readonly response: IngestConnectorMcpFixtureResponseLike;
    };

export function loadIngestConnectorMcpFixtureBundle(
  fixturePath: string | URL = DEFAULT_INGEST_CONNECTOR_MCP_FIXTURE_PATH,
): IngestConnectorMcpFixtureRequestBundle {
  let raw: string;
  try {
    raw = readFileSync(fixturePath, "utf8");
  } catch {
    throw new IngestConnectorMcpFixtureError(
      "ingest_connector_mcp_fixture_load_failed",
      "ingest connector MCP fixture bundle could not be loaded",
      [{ path: "fixturePath", message: redactUnsafeText(String(fixturePath)) }],
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new IngestConnectorMcpFixtureError(
      "ingest_connector_mcp_fixture_parse_failed",
      "ingest connector MCP fixture bundle is not valid JSON",
    );
  }

  validateFixtureBundle(parsed);
  return deepFreezeClone(parsed);
}

export function createIngestConnectorMcpFixtureFetch(
  input: IngestConnectorMcpFixtureRequestBundle | IngestConnectorMcpFixtureFetchOptions = {},
): IngestConnectorMcpFixtureFetch {
  const bundle = resolveFixtureBundle(input);
  const fixtures = normalizeFixtureRequests(bundle);
  const calls: IngestConnectorMcpFixtureFetchCall[] = [];

  const fetch = (async (
    url: string,
    init: FetchRequestInit = {},
  ): Promise<IngestConnectorMcpFixtureResponseLike> => {
    const requestUrl = parseRequestUrl(url);
    const method = normalizeMethod(init.method);
    if (requestUrl === undefined || !isAllowedRequestUrl(String(url), requestUrl)) {
      const response = fixtureErrorResponse(
        400,
        "ingest_connector_mcp_fixture_url_invalid",
        "Fixture request URL must be relative or local-only.",
        { url: String(url) },
      );
      calls.push(freezeCall({
        url: redactUnsafeText(String(url)),
        method,
        path: "",
        status: response.status,
      }));
      return response;
    }

    const path = `${requestUrl.pathname}${requestUrl.search}`;
    const samePath = fixtures.filter((fixture) => fixture.path === path);
    const sameMethod = samePath.filter((fixture) => fixture.method === method);

    if (samePath.length === 0) {
      const response = fixtureErrorResponse(
        404,
        "ingest_connector_mcp_fixture_request_not_found",
        "No fixture request matched the path.",
        {
          method,
          path,
          knownRoutes: fixtures.map((fixture) => `${fixture.method} ${fixture.path}`),
        },
      );
      calls.push(freezeCall({
        url: redactUnsafeText(String(url)),
        method,
        path: redactUnsafeText(path),
        status: response.status,
      }));
      return response;
    }

    if (sameMethod.length === 0) {
      const response = fixtureErrorResponse(
        405,
        "ingest_connector_mcp_fixture_method_mismatch",
        "Fixture path matched but method did not.",
        {
          method,
          path,
          allowedMethods: sortedUnique(samePath.map((fixture) => fixture.method)),
        },
      );
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

    const response = fixtureErrorResponse(
      422,
      "ingest_connector_mcp_fixture_body_mismatch",
      "Fixture route matched but request body did not.",
      {
        method,
        path,
        candidateRequestIds: sameMethod.map((fixture) => fixture.id),
        mismatches: sameMethod.map((fixture) => ({
          requestId: fixture.id,
          mismatch: compareJson(fixture.expectedBody, requestBody.value, "") ?? "unknown mismatch",
        })),
      },
    );
    calls.push(freezeCall({
      url: redactUnsafeText(String(url)),
      method,
      path: redactUnsafeText(path),
      body: requestBody.value === undefined ? undefined : redactUnsafeValue(requestBody.value) as JsonValue,
      status: response.status,
    }));
    return response;
  }) as IngestConnectorMcpFixtureFetch;

  Object.defineProperties(fetch, {
    bundle: {
      enumerable: true,
      value: bundle,
    },
    calls: {
      enumerable: true,
      get(): readonly IngestConnectorMcpFixtureFetchCall[] {
        return deepFreezeClone(calls);
      },
    },
  });

  return fetch;
}

export function createIngestConnectorMcpFixtureClient(
  input: IngestConnectorMcpFixtureRequestBundle | IngestConnectorMcpFixtureClientOptions = {},
): IngestConnectorMcpClient {
  return createIngestConnectorMcpFixtureClientHarness(input).client;
}

export function createIngestConnectorMcpFixtureClientHarness(
  input: IngestConnectorMcpFixtureRequestBundle | IngestConnectorMcpFixtureClientOptions = {},
): IngestConnectorMcpFixtureClientHarness {
  const options = fixtureClientOptions(input);
  const bundle = resolveFixtureBundle(options);
  const fetch = createIngestConnectorMcpFixtureFetch(bundle);
  const baseUrl = options.baseUrl ?? baseUrlFromIngestConnectorMcpFixtureBundle(bundle);
  validateLocalBaseUrl(baseUrl, "baseUrl");
  const client = createIngestConnectorMcpClient({
    baseUrl,
    fetch,
    ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
    ...(options.headers === undefined ? {} : { headers: options.headers }),
  } satisfies IngestConnectorMcpClientOptions);

  return Object.freeze({
    bundle,
    baseUrl,
    fetch,
    client,
  });
}

export function baseUrlFromIngestConnectorMcpFixtureBundle(
  bundle: IngestConnectorMcpFixtureRequestBundle = loadIngestConnectorMcpFixtureBundle(),
): string {
  validateFixtureBundle(bundle);
  const apiBase = bundle.apiBase ?? "local://ingest-connector-mcp-api";
  const base = new URL(apiBase.endsWith("/") ? apiBase : `${apiBase}/`);
  const firstPath = bundle.requests[0]?.path ?? "";
  const versionPrefix = firstPath.match(/^\/(v[0-9]+)(?:\/|$)/)?.[1];

  return versionPrefix === undefined
    ? base.href
    : new URL(`${versionPrefix}/`, base).href;
}

function resolveFixtureBundle(
  input: IngestConnectorMcpFixtureRequestBundle | IngestConnectorMcpFixtureFetchOptions,
): IngestConnectorMcpFixtureRequestBundle {
  const options = fixtureFetchOptions(input);
  return options.bundle === undefined
    ? loadIngestConnectorMcpFixtureBundle(options.fixturePath)
    : deepFreezeClone(validateAndReturnBundle(options.bundle));
}

function fixtureFetchOptions(
  input: IngestConnectorMcpFixtureRequestBundle | IngestConnectorMcpFixtureFetchOptions,
): IngestConnectorMcpFixtureFetchOptions {
  return isFixtureBundle(input) ? { bundle: input } : input;
}

function fixtureClientOptions(
  input: IngestConnectorMcpFixtureRequestBundle | IngestConnectorMcpFixtureClientOptions,
): IngestConnectorMcpFixtureClientOptions {
  return isFixtureBundle(input) ? { bundle: input } : input;
}

function normalizeFixtureRequests(
  bundle: IngestConnectorMcpFixtureRequestBundle,
): NormalizedMcpFixtureRequest[] {
  validateFixtureBundle(bundle);
  const seen = new Set<string>();

  return bundle.requests.map((entry) => {
    const method = normalizeMethod(entry.method);
    const path = normalizeRoutePath(entry.path);
    const expectedBody = entry.body;
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
      response: {
        status: entry.expectedStatus,
        headers: {
          "content-type": "application/json",
        },
        body: entry.expectedBody,
      },
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
      response: fixtureErrorResponse(
        400,
        "ingest_connector_mcp_fixture_body_invalid",
        "Fixture requests must use a JSON string body.",
        {},
      ),
    };
  }

  try {
    const parsed = JSON.parse(init.body) as unknown;
    if (!isJsonValue(parsed)) {
      return {
        ok: false,
        response: fixtureErrorResponse(
          400,
          "ingest_connector_mcp_fixture_body_invalid",
          "Fixture request body must be JSON-compatible.",
          {},
        ),
      };
    }
    return { ok: true, value: parsed };
  } catch {
    return {
      ok: false,
      response: fixtureErrorResponse(
        400,
        "ingest_connector_mcp_fixture_body_invalid",
        "Fixture request body was not valid JSON.",
        {},
      ),
    };
  }
}

function fixtureResponse(
  spec: IngestConnectorMcpFixtureResponseSpec,
): IngestConnectorMcpFixtureResponseLike {
  return new FixtureResponse(spec.status, spec.body, spec.headers);
}

function fixtureErrorResponse(
  status: number,
  code: IngestConnectorMcpFixtureErrorCode,
  message: string,
  details: JsonValue,
): IngestConnectorMcpFixtureResponseLike {
  return fixtureResponse({
    status,
    body: {
      error: {
        code,
        message: redactUnsafeText(message),
        details: redactUnsafeValue(details) as JsonValue,
      },
    } satisfies IngestConnectorMcpFixtureErrorBody,
  });
}

class FixtureResponse implements IngestConnectorMcpFixtureResponseLike {
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

  clone(): IngestConnectorMcpFixtureResponseLike {
    return new FixtureResponse(this.status, this.#body, this.#headers);
  }
}

function validateAndReturnBundle(
  bundle: IngestConnectorMcpFixtureRequestBundle,
): IngestConnectorMcpFixtureRequestBundle {
  validateFixtureBundle(bundle);
  return bundle;
}

function validateFixtureBundle(value: unknown): asserts value is IngestConnectorMcpFixtureRequestBundle {
  const issues: IngestConnectorMcpFixtureIssue[] = [];

  if (!isRecord(value)) {
    throw invalidFixture([{ path: "", message: "ingest connector MCP fixture bundle must be an object" }]);
  }

  if (value.schemaVersion !== INGEST_CONNECTOR_MCP_FIXTURE_SCHEMA_VERSION) {
    issues.push({
      path: "schemaVersion",
      message: `schemaVersion must be ${INGEST_CONNECTOR_MCP_FIXTURE_SCHEMA_VERSION}`,
    });
  }
  if (value.generatedAt !== undefined && !isIsoTimestamp(value.generatedAt)) {
    issues.push({ path: "generatedAt", message: "generatedAt must be an ISO timestamp" });
  }
  if (value.apiBase !== undefined) {
    if (typeof value.apiBase !== "string" || value.apiBase.trim().length === 0) {
      issues.push({ path: "apiBase", message: "apiBase must be a non-empty string" });
    } else {
      collectLocalBaseUrlIssues(value.apiBase, "apiBase", issues);
    }
  }
  if (value.localOnly !== undefined && value.localOnly !== true) {
    issues.push({ path: "localOnly", message: "localOnly must be true when present" });
  }
  if (value.network !== undefined) {
    if (!isRecord(value.network)) {
      issues.push({ path: "network", message: "network must be an object" });
    } else {
      if (value.network.mode !== "disabled") {
        issues.push({ path: "network.mode", message: "network.mode must be disabled" });
      }
      if (value.network.notes !== undefined && typeof value.network.notes !== "string") {
        issues.push({ path: "network.notes", message: "network.notes must be a string" });
      }
    }
  }
  if (value.durableWrites !== undefined && value.durableWrites !== false) {
    issues.push({ path: "durableWrites", message: "durableWrites must be false when present" });
  }
  if (value.auth !== undefined) {
    if (!isRecord(value.auth)) {
      issues.push({ path: "auth", message: "auth must be an object" });
    } else {
      if (value.auth.mode !== "none") {
        issues.push({ path: "auth.mode", message: "auth.mode must be none" });
      }
      if (value.auth.required !== false) {
        issues.push({ path: "auth.required", message: "auth.required must be false" });
      }
    }
  }
  if (!Array.isArray(value.requests) || value.requests.length === 0) {
    issues.push({ path: "requests", message: "requests must be a non-empty array" });
  }

  if (Array.isArray(value.requests)) {
    validateRequestEntries(value.requests, issues);
  }

  if (issues.length > 0) {
    throw invalidFixture(issues);
  }
}

function validateRequestEntries(
  requests: readonly unknown[],
  issues: IngestConnectorMcpFixtureIssue[],
): void {
  const seenIds = new Set<string>();
  let successfulListRoutes = 0;
  let successfulReadRoutes = 0;
  let successfulPreviewRoutes = 0;

  requests.forEach((request, index) => {
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
    if (request.title !== undefined && typeof request.title !== "string") {
      issues.push({ path: `${path}.title`, message: "title must be a string" });
    }

    requireNonEmptyString(request, "method", `${path}.method`, issues);
    requireRoutePath(request, "path", `${path}.path`, issues);
    if (request.headers !== undefined && !isStringRecord(request.headers)) {
      issues.push({ path: `${path}.headers`, message: "headers must contain string values" });
    }
    if (request.body !== undefined && !isJsonValue(request.body)) {
      issues.push({ path: `${path}.body`, message: "body must be JSON-compatible" });
    }
    validateStatus(request.expectedStatus, `${path}.expectedStatus`, issues);
    if (!isJsonValue(request.expectedBody)) {
      issues.push({ path: `${path}.expectedBody`, message: "expectedBody must be JSON-compatible" });
    }
    if (request.expectedChecks !== undefined) {
      validateExpectedChecksSpec(request.expectedChecks, `${path}.expectedChecks`, issues);
    }

    if (typeof request.method !== "string" || typeof request.path !== "string") {
      return;
    }

    const method = normalizeMethod(request.method);
    const routePath = safeNormalizeRoutePath(request.path);
    if (routePath === undefined) {
      issues.push({ path: `${path}.path`, message: "path must be a valid URL path" });
      return;
    }

    const routeKind = classifyMcpFixtureRoute(routePath);
    if (routeKind === undefined) {
      issues.push({
        path: `${path}.path`,
        message: "path must target ingest connector MCP resources or preview routes",
      });
      return;
    }

    collectRouteMethodAndBodyIssues(routeKind, method, request.body, path, issues);

    const status = request.expectedStatus;
    if (isSuccessStatus(status)) {
      if (routeKind === "resources_list") {
        successfulListRoutes += validateSuccessfulListResponse(request, path, issues) ? 1 : 0;
      } else if (routeKind === "resource_read") {
        successfulReadRoutes += validateSuccessfulReadResponse(request, path, routePath, issues) ? 1 : 0;
      } else {
        successfulPreviewRoutes += validateSuccessfulPreviewResponse(request, path, issues) ? 1 : 0;
      }
    } else if (Number.isInteger(status) && (status as number) >= 400) {
      validateErrorResponseBody(request.expectedBody, `${path}.expectedBody`, issues);
    }

    validateExpectedChecksAgainstBody(request, path, issues);
  });

  if (successfulListRoutes < 1) {
    issues.push({
      path: "requests",
      message: "requests must contain at least one successful GET MCP resource list fixture",
    });
  }
  if (successfulReadRoutes < 1) {
    issues.push({
      path: "requests",
      message: "requests must contain at least one successful GET MCP resource read fixture",
    });
  }
  if (successfulPreviewRoutes < 1) {
    issues.push({
      path: "requests",
      message: "requests must contain at least one successful POST MCP preview fixture",
    });
  }
}

function collectRouteMethodAndBodyIssues(
  routeKind: McpFixtureRouteKind,
  method: string,
  body: unknown,
  path: string,
  issues: IngestConnectorMcpFixtureIssue[],
): void {
  if (routeKind === "preview") {
    if (method !== "POST") {
      issues.push({ path: `${path}.method`, message: "MCP preview fixture route must use POST" });
    }
    if (!isRecord(body)) {
      issues.push({ path: `${path}.body`, message: "MCP preview fixture request must include a JSON object body" });
    }
    return;
  }

  if (method !== "GET") {
    issues.push({ path: `${path}.method`, message: "MCP resource fixture route must use GET" });
  }
  if (body !== undefined) {
    issues.push({ path: `${path}.body`, message: "GET MCP resource fixture request must not include a body" });
  }
}

function validateSuccessfulListResponse(
  entry: Record<string, unknown>,
  path: string,
  issues: IngestConnectorMcpFixtureIssue[],
): boolean {
  const body = entry.expectedBody;
  if (!isRecord(body)) {
    issues.push({ path: `${path}.expectedBody`, message: "MCP resource list response must be an object" });
    return false;
  }

  const bodyIssuesStart = issues.length;
  requireLiteralString(body, "schemaVersion", `${path}.expectedBody.schemaVersion`, "ingest-connector-mcp-resources/v1", issues);
  collectLocalEnvelopeIssues(body, `${path}.expectedBody`, issues);
  collectMetadataIssues(body.metadata, `${path}.expectedBody.metadata`, issues);
  if (!Array.isArray(body.resources) || body.resources.length === 0) {
    issues.push({ path: `${path}.expectedBody.resources`, message: "resources must be a non-empty array" });
  } else {
    const seen = new Set<string>();
    body.resources.forEach((resource, index) => {
      const itemPath = `${path}.expectedBody.resources.${index}`;
      collectResourceManifestIssues(resource, itemPath, issues);
      if (isRecord(resource) && typeof resource.connectorId === "string") {
        if (seen.has(resource.connectorId)) {
          issues.push({ path: `${itemPath}.connectorId`, message: "connectorId values must be unique" });
        }
        seen.add(resource.connectorId);
      }
    });
  }
  return issues.length === bodyIssuesStart;
}

function validateSuccessfulReadResponse(
  entry: Record<string, unknown>,
  path: string,
  routePath: string,
  issues: IngestConnectorMcpFixtureIssue[],
): boolean {
  const body = entry.expectedBody;
  if (!isRecord(body)) {
    issues.push({ path: `${path}.expectedBody`, message: "MCP resource response must be an object" });
    return false;
  }

  const bodyIssuesStart = issues.length;
  requireLiteralString(body, "schemaVersion", `${path}.expectedBody.schemaVersion`, "ingest-connector-mcp-resource/v1", issues);
  collectLocalEnvelopeIssues(body, `${path}.expectedBody`, issues);
  collectMetadataIssues(body.metadata, `${path}.expectedBody.metadata`, issues);
  collectResourceManifestIssues(body.resource, `${path}.expectedBody.resource`, issues);

  const connectorId = connectorIdFromReadPath(routePath);
  if (
    connectorId !== undefined &&
    isRecord(body.resource) &&
    typeof body.resource.connectorId === "string" &&
    decodeURIComponent(connectorId) !== body.resource.connectorId
  ) {
    issues.push({
      path: `${path}.expectedBody.resource.connectorId`,
      message: "resource connectorId must match the route path",
    });
  }

  return issues.length === bodyIssuesStart;
}

function validateSuccessfulPreviewResponse(
  entry: Record<string, unknown>,
  path: string,
  issues: IngestConnectorMcpFixtureIssue[],
): boolean {
  const body = entry.expectedBody;
  if (!isRecord(body)) {
    issues.push({ path: `${path}.expectedBody`, message: "MCP preview response must be an object" });
    return false;
  }

  const bodyIssuesStart = issues.length;
  requireLiteralString(body, "schemaVersion", `${path}.expectedBody.schemaVersion`, "ingest-connector-mcp-preview/v1", issues);
  collectLocalEnvelopeIssues(body, `${path}.expectedBody`, issues);
  requireTrue(body, "dryRun", `${path}.expectedBody.dryRun`, issues);
  collectMetadataIssues(body.metadata, `${path}.expectedBody.metadata`, issues);
  requireConnectorIdValue(body.connectorId, `${path}.expectedBody.connectorId`, issues);
  collectResourceManifestIssues(body.resource, `${path}.expectedBody.resource`, issues);
  collectPreviewSummaryIssues(body.preview, `${path}.expectedBody.preview`, issues);
  collectPreviewConsistencyIssues(body, `${path}.expectedBody`, issues);
  collectPreviewRequestResponseConsistencyIssues(entry.body, body, path, issues);

  return issues.length === bodyIssuesStart;
}

function validateErrorResponseBody(
  value: unknown,
  path: string,
  issues: IngestConnectorMcpFixtureIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "error response body must be an object" });
    return;
  }
  if (!isRecord(value.error)) {
    issues.push({ path: `${path}.error`, message: "error response body must include an error object" });
    return;
  }
  requireNonEmptyString(value.error, "code", `${path}.error.code`, issues);
  requireNonEmptyString(value.error, "message", `${path}.error.message`, issues);
  if (value.error.details !== undefined && !isJsonValue(value.error.details)) {
    issues.push({ path: `${path}.error.details`, message: "error details must be JSON-compatible" });
  }
}

function validateExpectedChecksSpec(
  value: unknown,
  path: string,
  issues: IngestConnectorMcpFixtureIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "expectedChecks must be an object" });
    return;
  }
  if (!isJsonValue(value)) {
    issues.push({ path, message: "expectedChecks must be JSON-compatible" });
  }
  if (value.schemaVersion !== undefined && typeof value.schemaVersion !== "string") {
    issues.push({ path: `${path}.schemaVersion`, message: "schemaVersion must be a string" });
  }
  if (value.localOnly !== undefined && typeof value.localOnly !== "boolean") {
    issues.push({ path: `${path}.localOnly`, message: "localOnly must be a boolean" });
  }
  if (value.resourceCount !== undefined && (!Number.isInteger(value.resourceCount) || (value.resourceCount as number) < 0)) {
    issues.push({ path: `${path}.resourceCount`, message: "resourceCount must be a non-negative integer" });
  }
  if (value.connectorIds !== undefined && !isStringArray(value.connectorIds)) {
    issues.push({ path: `${path}.connectorIds`, message: "connectorIds must contain string values" });
  }
  if (value.connectorId !== undefined && typeof value.connectorId !== "string") {
    issues.push({ path: `${path}.connectorId`, message: "connectorId must be a string" });
  }
  if (value.contentIncluded !== undefined && typeof value.contentIncluded !== "boolean") {
    issues.push({ path: `${path}.contentIncluded`, message: "contentIncluded must be a boolean" });
  }
  if (value.errorCode !== undefined && typeof value.errorCode !== "string") {
    issues.push({ path: `${path}.errorCode`, message: "errorCode must be a string" });
  }
}

function validateExpectedChecksAgainstBody(
  entry: Record<string, unknown>,
  path: string,
  issues: IngestConnectorMcpFixtureIssue[],
): void {
  if (!isRecord(entry.expectedChecks) || !isRecord(entry.expectedBody)) {
    return;
  }

  const checks = entry.expectedChecks;
  const body = entry.expectedBody;
  compareExpectedCheck(checks.schemaVersion, body.schemaVersion, `${path}.expectedChecks.schemaVersion`, issues);
  compareExpectedCheck(checks.localOnly, body.localOnly, `${path}.expectedChecks.localOnly`, issues);
  if (checks.resourceCount !== undefined) {
    compareExpectedCheck(
      checks.resourceCount,
      Array.isArray(body.resources) ? body.resources.length : undefined,
      `${path}.expectedChecks.resourceCount`,
      issues,
    );
  }
  if (checks.connectorIds !== undefined) {
    compareExpectedCheck(
      checks.connectorIds,
      connectorIdsForBody(body),
      `${path}.expectedChecks.connectorIds`,
      issues,
    );
  }
  if (checks.connectorId !== undefined) {
    compareExpectedCheck(checks.connectorId, connectorIdForBody(body), `${path}.expectedChecks.connectorId`, issues);
  }
  if (checks.contentIncluded !== undefined) {
    const actual = isRecord(body.preview) ? body.preview.contentIncluded : undefined;
    compareExpectedCheck(checks.contentIncluded, actual, `${path}.expectedChecks.contentIncluded`, issues);
  }
  if (checks.errorCode !== undefined) {
    const actual = isRecord(body.error) ? body.error.code : undefined;
    compareExpectedCheck(checks.errorCode, actual, `${path}.expectedChecks.errorCode`, issues);
  }
}

function compareExpectedCheck(
  expected: unknown,
  actual: unknown,
  path: string,
  issues: IngestConnectorMcpFixtureIssue[],
): void {
  if (expected === undefined) {
    return;
  }
  const mismatchText = compareJson(expected, actual, "");
  if (mismatchText !== undefined) {
    issues.push({ path, message: mismatchText });
  }
}

function collectLocalEnvelopeIssues(
  value: Record<string, unknown>,
  path: string,
  issues: IngestConnectorMcpFixtureIssue[],
): void {
  requireTrue(value, "localOnly", `${path}.localOnly`, issues);
  requireTrue(value, "noNetwork", `${path}.noNetwork`, issues);
  requireFalse(value, "durableWrites", `${path}.durableWrites`, issues);
}

function collectMetadataIssues(
  value: unknown,
  path: string,
  issues: IngestConnectorMcpFixtureIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "metadata must be an object" });
    return;
  }
  requireTrue(value, "localOnly", `${path}.localOnly`, issues);
  requireTrue(value, "noNetwork", `${path}.noNetwork`, issues);
  requireFalse(value, "durableWrites", `${path}.durableWrites`, issues);
}

function collectResourceManifestIssues(
  value: unknown,
  path: string,
  issues: IngestConnectorMcpFixtureIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "resource manifest must be an object" });
    return;
  }

  requireLiteralString(value, "schemaVersion", `${path}.schemaVersion`, "ingest-connector-mcp-resource/v1", issues);
  collectLocalEnvelopeIssues(value, path, issues);
  collectMetadataIssues(value.metadata, `${path}.metadata`, issues);
  requireConnectorIdValue(value.connectorId, `${path}.connectorId`, issues);
  collectResourceDescriptorIssues(value.resource, `${path}.resource`, issues);
  collectConnectorProfileIssues(value.connector, `${path}.connector`, issues);
  collectResourceContentIssues(value.content, `${path}.content`, issues);
  collectResourceManifestConsistencyIssues(value, path, issues);
}

function collectResourceDescriptorIssues(
  value: unknown,
  path: string,
  issues: IngestConnectorMcpFixtureIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "resource descriptor must be an object" });
    return;
  }
  requireSafeString(value, "uri", `${path}.uri`, issues);
  requireSafeString(value, "name", `${path}.name`, issues);
  requireSafeString(value, "description", `${path}.description`, issues);
  requireLiteralString(value, "mimeType", `${path}.mimeType`, "application/json", issues);
}

function collectConnectorProfileIssues(
  value: unknown,
  path: string,
  issues: IngestConnectorMcpFixtureIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "connector must be an object" });
    return;
  }
  requireConnectorIdValue(value.id, `${path}.id`, issues);
  requireSafeString(value, "label", `${path}.label`, issues);
  requireSafeString(value, "description", `${path}.description`, issues);
  requireLiteralString(value, "transport", `${path}.transport`, "in-process", issues);
  collectStringArrayIssues(value.capabilities, `${path}.capabilities`, issues);
  collectStringArrayIssues(value.mediaTypes, `${path}.mediaTypes`, issues);
  collectAuthIssues(value.auth, `${path}.auth`, issues);
  collectConnectorPreviewIssues(value.preview, `${path}.preview`, issues);
  collectConnectorSafetyIssues(value.safety, `${path}.safety`, issues);
}

function collectAuthIssues(
  value: unknown,
  path: string,
  issues: IngestConnectorMcpFixtureIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "auth must be an object" });
    return;
  }
  requireLiteralString(value, "mode", `${path}.mode`, "none", issues);
  requireFalse(value, "required", `${path}.required`, issues);
}

function collectConnectorPreviewIssues(
  value: unknown,
  path: string,
  issues: IngestConnectorMcpFixtureIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "preview must be an object" });
    return;
  }
  requireTrue(value, "dryRun", `${path}.dryRun`, issues);
  requirePositiveInteger(value, "maxItems", `${path}.maxItems`, issues);
  requirePositiveInteger(value, "maxTextBytes", `${path}.maxTextBytes`, issues);
}

function collectConnectorSafetyIssues(
  value: unknown,
  path: string,
  issues: IngestConnectorMcpFixtureIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "safety must be an object" });
    return;
  }
  requireTrue(value, "localOnly", `${path}.localOnly`, issues);
  requireFalse(value, "networkAccess", `${path}.networkAccess`, issues);
  requireFalse(value, "durableWrites", `${path}.durableWrites`, issues);
  requireBoolean(value, "untrustedByDefault", `${path}.untrustedByDefault`, issues);
}

function collectResourceContentIssues(
  value: unknown,
  path: string,
  issues: IngestConnectorMcpFixtureIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "resource content must be an object" });
    return;
  }
  requireSafeString(value, "uri", `${path}.uri`, issues);
  requireLiteralString(value, "mimeType", `${path}.mimeType`, "application/json", issues);
  if (typeof value.text !== "string") {
    issues.push({ path: `${path}.text`, message: "text must be a string" });
  } else {
    collectSafeStringValueIssues(value.text, "text", `${path}.text`, issues, { allowEmpty: true });
    collectContentTextIssues(value.text, `${path}.text`, issues);
  }
}

function collectContentTextIssues(
  value: string,
  path: string,
  issues: IngestConnectorMcpFixtureIssue[],
): void {
  if (value.trim().length === 0) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    issues.push({ path, message: "text must contain JSON" });
    return;
  }
  if (!isRecord(parsed)) {
    issues.push({ path, message: "text JSON must be an object" });
    return;
  }
  if (parsed.schemaVersion !== undefined) {
    requireLiteralString(parsed, "schemaVersion", `${path}.schemaVersion`, "ingest-connector-mcp-resource-content/v1", issues);
  }
  if (parsed.localOnly !== undefined) {
    requireTrue(parsed, "localOnly", `${path}.localOnly`, issues);
  }
}

function collectPreviewSummaryIssues(
  value: unknown,
  path: string,
  issues: IngestConnectorMcpFixtureIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "preview must be an object" });
    return;
  }
  requireTrue(value, "accepted", `${path}.accepted`, issues);
  requireFalse(value, "sideEffects", `${path}.sideEffects`, issues);
  requireFalse(value, "durableWrites", `${path}.durableWrites`, issues);
  requireBoolean(value, "contentIncluded", `${path}.contentIncluded`, issues);
  requireNonNegativeInteger(value, "contentBytes", `${path}.contentBytes`, issues);
}

function collectResourceManifestConsistencyIssues(
  value: Record<string, unknown>,
  path: string,
  issues: IngestConnectorMcpFixtureIssue[],
): void {
  if (
    typeof value.connectorId === "string" &&
    isRecord(value.connector) &&
    typeof value.connector.id === "string" &&
    value.connectorId !== value.connector.id
  ) {
    issues.push({ path: `${path}.connector.id`, message: "connector.id must match connectorId" });
  }
  if (
    isRecord(value.resource) &&
    isRecord(value.content) &&
    typeof value.resource.uri === "string" &&
    typeof value.content.uri === "string" &&
    value.resource.uri !== value.content.uri
  ) {
    issues.push({ path: `${path}.content.uri`, message: "content uri must match resource uri" });
  }
}

function collectPreviewConsistencyIssues(
  value: Record<string, unknown>,
  path: string,
  issues: IngestConnectorMcpFixtureIssue[],
): void {
  if (
    typeof value.connectorId === "string" &&
    isRecord(value.resource) &&
    typeof value.resource.connectorId === "string" &&
    value.connectorId !== value.resource.connectorId
  ) {
    issues.push({ path: `${path}.resource.connectorId`, message: "resource connectorId must match response connectorId" });
  }
  if (!isRecord(value.preview) || !isRecord(value.resource) || !isRecord(value.resource.content)) {
    return;
  }

  const text = value.resource.content.text;
  if (
    value.preview.contentIncluded === false &&
    typeof text === "string" &&
    text.length > 0
  ) {
    issues.push({ path: `${path}.resource.content.text`, message: "content text must be empty when content is excluded" });
  }
  if (
    value.preview.contentIncluded === true &&
    Number.isInteger(value.preview.contentBytes) &&
    typeof text === "string" &&
    value.preview.contentBytes !== new TextEncoder().encode(text).length
  ) {
    issues.push({ path: `${path}.preview.contentBytes`, message: "contentBytes must match content text bytes" });
  }
}

function collectPreviewRequestResponseConsistencyIssues(
  requestBody: unknown,
  responseBody: Record<string, unknown>,
  path: string,
  issues: IngestConnectorMcpFixtureIssue[],
): void {
  if (!isRecord(requestBody)) {
    return;
  }
  if (
    typeof requestBody.connectorId === "string" &&
    typeof responseBody.connectorId === "string" &&
    requestBody.connectorId !== responseBody.connectorId
  ) {
    issues.push({ path: `${path}.expectedBody.connectorId`, message: "preview connectorId must match request connectorId" });
  }
  if (
    typeof requestBody.includeContent === "boolean" &&
    isRecord(responseBody.preview) &&
    typeof responseBody.preview.contentIncluded === "boolean" &&
    requestBody.includeContent !== responseBody.preview.contentIncluded
  ) {
    issues.push({ path: `${path}.expectedBody.preview.contentIncluded`, message: "preview contentIncluded must match request includeContent" });
  }
}

function connectorIdsForBody(body: Record<string, unknown>): string[] {
  if (Array.isArray(body.resources)) {
    return body.resources
      .map((resource) => isRecord(resource) ? resource.connectorId : undefined)
      .filter((id): id is string => typeof id === "string");
  }
  const connectorId = connectorIdForBody(body);
  return connectorId === undefined ? [] : [connectorId];
}

function connectorIdForBody(body: Record<string, unknown>): string | undefined {
  if (typeof body.connectorId === "string") {
    return body.connectorId;
  }
  if (isRecord(body.resource) && typeof body.resource.connectorId === "string") {
    return body.resource.connectorId;
  }
  return undefined;
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
  const url = new URL(value, "http://ingest-connector-mcp.fixture.local");
  return `${url.pathname}${url.search}`;
}

function safeNormalizeRoutePath(value: string): string | undefined {
  try {
    return normalizeRoutePath(value);
  } catch {
    return undefined;
  }
}

function parseRequestUrl(value: string): URL | undefined {
  try {
    return new URL(String(value), "http://ingest-connector-mcp.fixture.local");
  } catch {
    return undefined;
  }
}

function isAllowedRequestUrl(rawUrl: string, parsedUrl: URL): boolean {
  if (!isAbsoluteUrl(rawUrl)) {
    return true;
  }
  return isLocalApiBase(parsedUrl);
}

function isAbsoluteUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function classifyMcpFixtureRoute(routePath: string): McpFixtureRouteKind | undefined {
  const url = new URL(routePath, "http://ingest-connector-mcp.fixture.local");
  if (url.search !== "") {
    return undefined;
  }
  if (MCP_RESOURCE_LIST_ROUTE_PATTERN.test(url.pathname)) {
    return "resources_list";
  }
  if (MCP_RESOURCE_READ_ROUTE_PATTERN.test(url.pathname)) {
    return "resource_read";
  }
  if (MCP_PREVIEW_ROUTE_PATTERN.test(url.pathname)) {
    return "preview";
  }
  return undefined;
}

function connectorIdFromReadPath(routePath: string): string | undefined {
  const url = new URL(routePath, "http://ingest-connector-mcp.fixture.local");
  return MCP_RESOURCE_READ_ROUTE_PATTERN.exec(url.pathname)?.[1];
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

function freezeCall(call: IngestConnectorMcpFixtureFetchCall): IngestConnectorMcpFixtureFetchCall {
  return deepFreezeClone(call);
}

function invalidFixture(
  issues: readonly IngestConnectorMcpFixtureIssue[],
): IngestConnectorMcpFixtureError {
  return new IngestConnectorMcpFixtureError(
    "ingest_connector_mcp_fixture_invalid",
    "ingest connector MCP fixture bundle is invalid",
    issues,
  );
}

function requireNonEmptyString(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: IngestConnectorMcpFixtureIssue[],
): void {
  if (typeof value[field] !== "string" || (value[field] as string).trim().length === 0) {
    issues.push({ path, message: `${field} must be a non-empty string` });
  }
}

function requireRoutePath(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: IngestConnectorMcpFixtureIssue[],
): void {
  requireNonEmptyString(value, field, path, issues);
  if (typeof value[field] === "string" && !(value[field] as string).startsWith("/")) {
    issues.push({ path, message: `${field} must start with /` });
  }
}

function requireSafeString(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: IngestConnectorMcpFixtureIssue[],
): void {
  collectSafeStringValueIssues(value[field], field, path, issues);
}

function collectSafeStringValueIssues(
  value: unknown,
  label: string,
  path: string,
  issues: IngestConnectorMcpFixtureIssue[],
  options: { readonly allowEmpty?: boolean } = {},
): void {
  if (typeof value !== "string" || (!options.allowEmpty && value.trim().length === 0)) {
    issues.push({ path, message: `${label} must be ${options.allowEmpty ? "a string" : "a non-empty string"}` });
    return;
  }
  if (unsafeStringReason(value, label) !== undefined) {
    issues.push({ path, message: `${label} must not include private paths or raw secrets` });
  }
}

function requireConnectorIdValue(
  value: unknown,
  path: string,
  issues: IngestConnectorMcpFixtureIssue[],
): void {
  if (typeof value !== "string" || !CONNECTOR_ID_PATTERN.test(value)) {
    issues.push({ path, message: "connector id must be a safe local connector id" });
    return;
  }
  if (unsafeStringReason(value, "connectorId") !== undefined) {
    issues.push({ path, message: "connector id must not include private paths or raw secrets" });
  }
}

function requireLiteralString(
  value: Record<string, unknown>,
  field: string,
  path: string,
  expected: string,
  issues: IngestConnectorMcpFixtureIssue[],
): void {
  if (value[field] !== expected) {
    issues.push({ path, message: `${field} must be ${expected}` });
  }
}

function requireTrue(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: IngestConnectorMcpFixtureIssue[],
): void {
  if (value[field] !== true) {
    issues.push({ path, message: `${field} must be true` });
  }
}

function requireFalse(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: IngestConnectorMcpFixtureIssue[],
): void {
  if (value[field] !== false) {
    issues.push({ path, message: `${field} must be false` });
  }
}

function requireBoolean(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: IngestConnectorMcpFixtureIssue[],
): void {
  if (typeof value[field] !== "boolean") {
    issues.push({ path, message: `${field} must be a boolean` });
  }
}

function requirePositiveInteger(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: IngestConnectorMcpFixtureIssue[],
): void {
  if (!Number.isInteger(value[field]) || (value[field] as number) <= 0) {
    issues.push({ path, message: `${field} must be a positive integer` });
  }
}

function requireNonNegativeInteger(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: IngestConnectorMcpFixtureIssue[],
): void {
  if (!Number.isInteger(value[field]) || (value[field] as number) < 0) {
    issues.push({ path, message: `${field} must be a non-negative integer` });
  }
}

function validateStatus(
  value: unknown,
  path: string,
  issues: IngestConnectorMcpFixtureIssue[],
): void {
  if (!Number.isInteger(value) || (value as number) < 100 || (value as number) > 599) {
    issues.push({ path, message: "status must be an HTTP status code" });
  }
}

function collectStringArrayIssues(
  value: unknown,
  path: string,
  issues: IngestConnectorMcpFixtureIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "value must be an array of strings" });
    return;
  }
  if (value.length === 0) {
    issues.push({ path, message: "value must not be empty" });
  }
  value.forEach((item, index) => {
    collectSafeStringValueIssues(item, "value", `${path}.${index}`, issues);
  });
}

function validateLocalBaseUrl(value: string, path: string): void {
  const issues: IngestConnectorMcpFixtureIssue[] = [];
  collectLocalBaseUrlIssues(value, path, issues);
  if (issues.length > 0) {
    throw invalidFixture(issues);
  }
}

function collectLocalBaseUrlIssues(
  value: string,
  path: string,
  issues: IngestConnectorMcpFixtureIssue[],
): void {
  try {
    const parsed = new URL(value);
    if (!isLocalApiBase(parsed)) {
      issues.push({ path, message: `${path} must be a local:// or loopback URL` });
    }
  } catch {
    issues.push({ path, message: `${path} must be an absolute URL` });
  }
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

function isFixtureBundle(value: unknown): value is IngestConnectorMcpFixtureRequestBundle {
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

function unsafeStringReason(value: string, keyHint: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0 || isRedactedToken(trimmed)) {
    return undefined;
  }

  const key = normalizeToken(keyHint);
  if (matches(PRIVATE_LOCATION_PATTERN, trimmed)) {
    return "private_path";
  }
  if (PATH_FIELD_PATTERN.test(key) && hasTraversalSegment(trimmed)) {
    return "path_traversal";
  }
  if (matches(RAW_LOCAL_PATH_PATTERN, trimmed)) {
    return "raw_local_path";
  }
  if (SENSITIVE_FIELD_PATTERN.test(keyHint)) {
    return "raw_secret";
  }
  if (matches(SECRET_ASSIGNMENT_PATTERN, trimmed) || matches(SECRET_VALUE_PATTERN, trimmed)) {
    return "raw_secret";
  }
  return undefined;
}

function matches(pattern: RegExp, value: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(value);
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
