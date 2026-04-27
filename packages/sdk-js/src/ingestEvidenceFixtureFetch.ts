import { readFileSync } from "node:fs";

import {
  type FetchLike,
  type FetchRequestInit,
  type FetchResponseLike,
  type HeadersLike,
  type JsonValue,
} from "./client.ts";
import {
  IngestEvidenceClient,
  createIngestEvidenceClient,
  type IngestEvidenceClientOptions,
} from "./ingestEvidenceClient.ts";

export const DEFAULT_INGEST_EVIDENCE_FIXTURE_PATH = new URL(
  "../../../examples/ingest-search/evidence-api-requests.json",
  import.meta.url,
);

export type IngestEvidenceFixtureErrorCode =
  | "ingest_evidence_fixture_url_invalid"
  | "ingest_evidence_fixture_request_not_found"
  | "ingest_evidence_fixture_method_mismatch"
  | "ingest_evidence_fixture_body_invalid"
  | "ingest_evidence_fixture_body_mismatch";

export interface IngestEvidenceFixtureRoute {
  readonly method: string;
  readonly path: string;
}

export interface IngestEvidenceFixtureRequestSpec {
  readonly body?: JsonValue;
}

export interface IngestEvidenceFixtureResponseSpec {
  readonly status: number;
  readonly body: JsonValue;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface IngestEvidenceFixtureExpectationSpec {
  readonly status: number;
  readonly contentType?: string;
  readonly kind?: string;
  readonly format?: string;
  readonly fingerprint?: string;
  readonly manifestFingerprint?: string;
  readonly contentFingerprint?: string;
  readonly summary?: JsonValue;
  readonly contentJson?: JsonValue;
  readonly sectionItemCounts?: Readonly<Record<string, number>>;
  readonly files?: readonly JsonValue[];
  readonly error?: JsonValue;
  readonly [key: string]: JsonValue | undefined;
}

export interface IngestEvidenceFixtureRequestEntry {
  readonly id: string;
  readonly title?: string;
  readonly route: IngestEvidenceFixtureRoute;
  readonly request: IngestEvidenceFixtureRequestSpec;
  readonly response?: IngestEvidenceFixtureResponseSpec;
  readonly expect?: IngestEvidenceFixtureExpectationSpec;
}

export interface IngestEvidenceFixtureRequestBundle {
  readonly schemaVersion: string;
  readonly generatedAt?: string;
  readonly apiBase?: string;
  readonly requests: readonly IngestEvidenceFixtureRequestEntry[];
}

export interface IngestEvidenceFixtureFetchOptions {
  readonly bundle?: IngestEvidenceFixtureRequestBundle;
  readonly fixturePath?: string | URL;
}

export interface IngestEvidenceFixtureClientOptions extends IngestEvidenceFixtureFetchOptions {
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface IngestEvidenceFixtureFetchCall {
  readonly url: string;
  readonly method: string;
  readonly path: string;
  readonly body?: JsonValue;
  readonly matchedRequestId?: string;
  readonly status: number;
}

export interface IngestEvidenceFixtureErrorBody {
  readonly error: {
    readonly code: IngestEvidenceFixtureErrorCode;
    readonly message: string;
    readonly details: JsonValue;
  };
}

export interface IngestEvidenceFixtureResponseLike extends FetchResponseLike {
  json(): Promise<JsonValue>;
  clone(): IngestEvidenceFixtureResponseLike;
}

export interface IngestEvidenceFixtureFetch extends FetchLike {
  readonly bundle: IngestEvidenceFixtureRequestBundle;
  readonly calls: readonly IngestEvidenceFixtureFetchCall[];
}

export interface IngestEvidenceFixtureClientHarness {
  readonly bundle: IngestEvidenceFixtureRequestBundle;
  readonly baseUrl: string;
  readonly fetch: IngestEvidenceFixtureFetch;
  readonly client: IngestEvidenceClient;
}

interface NormalizedFixtureRequest {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly expectedBody?: JsonValue;
  readonly response: IngestEvidenceFixtureResponseSpec;
}

type BodyReadResult =
  | {
      readonly ok: true;
      readonly value?: JsonValue;
    }
  | {
      readonly ok: false;
      readonly response: IngestEvidenceFixtureResponseLike;
    };

const INGEST_EVIDENCE_ROUTE_PATTERN = /^\/(?:v[0-9]+\/)?ingest\/evidence\/(?:export|package)$/;
const INGEST_EVIDENCE_SECTIONS = [
  "evidenceFiles",
  "sourceSnapshots",
  "citationEvidence",
  "quarantineDecisions",
  "apiRequestTrace",
  "clientSessionTrace",
] as const;
const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const DEFAULT_SHA256 = `sha256:${"0".repeat(64)}`;

export function loadIngestEvidenceFixtureBundle(
  fixturePath: string | URL = DEFAULT_INGEST_EVIDENCE_FIXTURE_PATH,
): IngestEvidenceFixtureRequestBundle {
  const raw = readFileSync(fixturePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  validateFixtureBundle(parsed);
  return deepFreezeClone(parsed);
}

export function createIngestEvidenceFixtureFetch(
  input: IngestEvidenceFixtureRequestBundle | IngestEvidenceFixtureFetchOptions = {},
): IngestEvidenceFixtureFetch {
  const bundle = resolveFixtureBundle(input);
  const fixtures = normalizeFixtureRequests(bundle);
  const calls: IngestEvidenceFixtureFetchCall[] = [];

  const fetch = (async (
    url: string,
    init: FetchRequestInit = {},
  ): Promise<IngestEvidenceFixtureResponseLike> => {
    const requestUrl = parseRequestUrl(url);
    if (requestUrl === undefined) {
      const response = fixtureErrorResponse(400, "ingest_evidence_fixture_url_invalid", "Fixture request URL is invalid.", {
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
      const response = fixtureErrorResponse(404, "ingest_evidence_fixture_request_not_found", "No fixture request matched the path.", {
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
      const response = fixtureErrorResponse(405, "ingest_evidence_fixture_method_mismatch", "Fixture path matched but method did not.", {
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

    const response = fixtureErrorResponse(422, "ingest_evidence_fixture_body_mismatch", "Fixture route matched but request body did not.", {
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
  }) as IngestEvidenceFixtureFetch;

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

export function createIngestEvidenceFixtureClient(
  input: IngestEvidenceFixtureRequestBundle | IngestEvidenceFixtureClientOptions = {},
): IngestEvidenceClient {
  return createIngestEvidenceFixtureClientHarness(input).client;
}

export function createIngestEvidenceFixtureClientHarness(
  input: IngestEvidenceFixtureRequestBundle | IngestEvidenceFixtureClientOptions = {},
): IngestEvidenceFixtureClientHarness {
  const options = fixtureClientOptions(input);
  const bundle = resolveFixtureBundle(options);
  const fetch = createIngestEvidenceFixtureFetch(bundle);
  const baseUrl = options.baseUrl ?? baseUrlFromIngestEvidenceFixtureBundle(bundle);
  const client = createIngestEvidenceClient({
    baseUrl,
    fetch,
    ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
    ...(options.headers === undefined ? {} : { headers: options.headers }),
  } satisfies IngestEvidenceClientOptions);

  return Object.freeze({
    bundle,
    baseUrl,
    fetch,
    client,
  });
}

export function baseUrlFromIngestEvidenceFixtureBundle(
  bundle: IngestEvidenceFixtureRequestBundle = loadIngestEvidenceFixtureBundle(),
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
  input: IngestEvidenceFixtureRequestBundle | IngestEvidenceFixtureFetchOptions,
): IngestEvidenceFixtureRequestBundle {
  const options = fixtureFetchOptions(input);
  return options.bundle === undefined
    ? loadIngestEvidenceFixtureBundle(options.fixturePath)
    : deepFreezeClone(validateAndReturnBundle(options.bundle));
}

function fixtureFetchOptions(
  input: IngestEvidenceFixtureRequestBundle | IngestEvidenceFixtureFetchOptions,
): IngestEvidenceFixtureFetchOptions {
  return isFixtureBundle(input) ? { bundle: input } : input;
}

function fixtureClientOptions(
  input: IngestEvidenceFixtureRequestBundle | IngestEvidenceFixtureClientOptions,
): IngestEvidenceFixtureClientOptions {
  return isFixtureBundle(input) ? { bundle: input } : input;
}

function normalizeFixtureRequests(
  bundle: IngestEvidenceFixtureRequestBundle,
): NormalizedFixtureRequest[] {
  validateFixtureBundle(bundle);
  const seen = new Set<string>();

  return bundle.requests.flatMap((entry) => {
    const method = normalizeMethod(entry.route.method);
    const path = normalizeRoutePath(entry.route.path);
    const response = responseSpecForEntry(entry);

    return expectedBodiesForEntry(entry).map((expectedBody) => {
      const duplicateKey = `${method} ${path} ${stableStringify(expectedBody)}`;

      if (seen.has(duplicateKey)) {
        throw new TypeError(`ingest evidence fixture request is duplicated: ${method} ${path}`);
      }
      seen.add(duplicateKey);

      return deepFreeze({
        id: entry.id,
        method,
        path,
        expectedBody,
        response,
      });
    });
  });
}

function expectedBodiesForEntry(entry: IngestEvidenceFixtureRequestEntry): JsonValue[] {
  const bodies = [entry.request.body] as JsonValue[];
  const sdkPackageBody = sdkPackageBodyForEntry(entry);
  if (
    sdkPackageBody !== undefined &&
    stableStringify(sdkPackageBody) !== stableStringify(entry.request.body)
  ) {
    bodies.push(sdkPackageBody);
  }

  return bodies;
}

function sdkPackageBodyForEntry(entry: IngestEvidenceFixtureRequestEntry): JsonValue | undefined {
  if (!normalizeRoutePath(entry.route.path).includes("/ingest/evidence/package")) {
    return undefined;
  }
  if (!isRecord(entry.request.body) || !isRecord(entry.request.body.options)) {
    return undefined;
  }

  const options = entry.request.body.options;
  return {
    evidence: entry.request.body.evidence,
    ...(options.filters === undefined ? {} : { filters: options.filters }),
    ...(options.createdAt === undefined ? {} : { createdAt: options.createdAt }),
    ...(options.exportId === undefined ? {} : { exportId: options.exportId }),
  };
}

function readRequestBody(init: FetchRequestInit): BodyReadResult {
  if (init.body === undefined) {
    return { ok: true };
  }

  if (typeof init.body !== "string") {
    return {
      ok: false,
      response: fixtureErrorResponse(400, "ingest_evidence_fixture_body_invalid", "Fixture requests must use a JSON string body.", {}),
    };
  }

  try {
    const parsed = JSON.parse(init.body) as unknown;
    if (!isJsonValue(parsed)) {
      return {
        ok: false,
        response: fixtureErrorResponse(400, "ingest_evidence_fixture_body_invalid", "Fixture request body must be JSON-compatible.", {}),
      };
    }
    return { ok: true, value: parsed };
  } catch {
    return {
      ok: false,
      response: fixtureErrorResponse(400, "ingest_evidence_fixture_body_invalid", "Fixture request body was not valid JSON.", {}),
    };
  }
}

function fixtureResponse(spec: IngestEvidenceFixtureResponseSpec): IngestEvidenceFixtureResponseLike {
  return new FixtureResponse(spec.status, spec.body, spec.headers);
}

function fixtureErrorResponse(
  status: number,
  code: IngestEvidenceFixtureErrorCode,
  message: string,
  details: JsonValue,
): IngestEvidenceFixtureResponseLike {
  return fixtureResponse({
    status,
    body: {
      error: {
        code,
        message,
        details,
      },
    } satisfies IngestEvidenceFixtureErrorBody,
  });
}

function responseSpecForEntry(
  entry: IngestEvidenceFixtureRequestEntry,
): IngestEvidenceFixtureResponseSpec {
  if (entry.response !== undefined) {
    return entry.response;
  }

  const expect = entry.expect;
  if (expect === undefined) {
    throw new TypeError(`fixture request ${entry.id} must include response or expect`);
  }

  const headers = {
    "content-type": expect.contentType ?? "application/json",
  };

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

  if (expect.kind === "ingest-evidence.package" || entry.route.path.includes("/package")) {
    return {
      status: expect.status,
      headers,
      body: packageBodyForExpectation(entry, expect),
    };
  }

  return {
    status: expect.status,
    headers,
    body: exportBodyForExpectation(entry, expect),
  };
}

function exportBodyForExpectation(
  entry: IngestEvidenceFixtureRequestEntry,
  expect: IngestEvidenceFixtureExpectationSpec,
): JsonValue {
  const requestBody = requestBodyRecord(entry);
  const format = readString(expect.format) ?? readString(requestBody.format) ?? "json";
  const manifest = manifestForExpectation(entry, expect);
  const content = contentForExpectation(format, expect, manifest);

  return {
    kind: "ingest-evidence.export",
    version: 1,
    format,
    mediaType: "application/json",
    content,
    fingerprint: readString(expect.fingerprint) ?? DEFAULT_SHA256,
    exportId: exportIdForEntry(entry),
    createdAt: createdAtForEntry(entry),
    manifest,
  };
}

function packageBodyForExpectation(
  entry: IngestEvidenceFixtureRequestEntry,
  expect: IngestEvidenceFixtureExpectationSpec,
): JsonValue {
  const manifest = manifestForExpectation(entry, expect);
  const evidenceContent = evidenceContentForExpectation(expect);
  const files = Array.isArray(expect.files) && expect.files.length > 0
    ? expect.files.map((file) => packageFileForExpectation(file, manifest, evidenceContent))
    : [
        {
          path: "manifest.json",
          mediaType: "application/json",
          bytes: JSON.stringify(manifest).length,
          fingerprint: readString(expect.manifestFingerprint) ?? DEFAULT_SHA256,
          content: JSON.stringify(manifest),
        },
        {
          path: "evidence.json",
          mediaType: "application/json",
          bytes: evidenceContent.length,
          fingerprint: readString(expect.contentFingerprint) ?? DEFAULT_SHA256,
          content: evidenceContent,
        },
      ];

  return {
    kind: "ingest-evidence.package",
    version: 1,
    manifest,
    files,
    fingerprint: readString(expect.fingerprint) ?? DEFAULT_SHA256,
  };
}

function packageFileForExpectation(
  file: JsonValue,
  manifest: JsonValue,
  evidenceContent: string,
): JsonValue {
  if (!isRecord(file)) {
    return {
      path: "evidence.json",
      mediaType: "application/json",
      bytes: evidenceContent.length,
      fingerprint: DEFAULT_SHA256,
      content: evidenceContent,
    };
  }

  const path = file.path === "manifest.json" ? "manifest.json" : "evidence.json";
  const content = path === "manifest.json" ? JSON.stringify(manifest) : evidenceContent;

  return {
    path,
    mediaType: readString(file.mediaType) ?? "application/json",
    bytes: Number.isInteger(file.bytes) && (file.bytes as number) >= 0
      ? file.bytes as number
      : content.length,
    fingerprint: readString(file.fingerprint) ?? DEFAULT_SHA256,
    content,
  };
}

function manifestForExpectation(
  entry: IngestEvidenceFixtureRequestEntry,
  expect: IngestEvidenceFixtureExpectationSpec,
): JsonValue {
  const summary = summaryForExpectation(expect.summary);
  const content = evidenceContentForExpectation(expect);

  return {
    kind: "ingest-evidence.manifest",
    version: 1,
    exportId: exportIdForEntry(entry),
    createdAt: createdAtForEntry(entry),
    schemaVersion: null,
    workspaceId: null,
    sessionId: null,
    localOnly: true,
    filters: filtersForEntry(entry),
    evidenceSummary: summary,
    sections: sectionsForExpectation(expect, summary),
    content: {
      mediaType: "application/json",
      bytes: content.length,
      fingerprint: readString(expect.contentFingerprint) ?? DEFAULT_SHA256,
    },
    fingerprint: readString(expect.manifestFingerprint) ?? DEFAULT_SHA256,
  };
}

function contentForExpectation(
  format: string,
  expect: IngestEvidenceFixtureExpectationSpec,
  manifest: JsonValue,
): string {
  if (format === "manifest") {
    return JSON.stringify(manifest);
  }
  if (expect.contentJson !== undefined) {
    return JSON.stringify(expect.contentJson);
  }
  if (format === "summary" && expect.summary !== undefined) {
    return JSON.stringify(expect.summary);
  }

  return evidenceContentForExpectation(expect);
}

function evidenceContentForExpectation(
  expect: IngestEvidenceFixtureExpectationSpec,
): string {
  return JSON.stringify({
    evidenceFileIds: readStringArray(expect.contentEvidenceFileIds),
    sourceUris: readStringArray(expect.contentSourceUris),
    citationKinds: readStringArray(expect.contentCitationKinds),
    summary: summaryForExpectation(expect.summary),
  });
}

function sectionsForExpectation(
  expect: IngestEvidenceFixtureExpectationSpec,
  summary: Readonly<Record<string, number>>,
): JsonValue {
  const counts = isRecord(expect.sectionItemCounts) ? expect.sectionItemCounts : undefined;
  return INGEST_EVIDENCE_SECTIONS
    .map((section) => {
      const itemCount = countForSection(section, counts, summary);
      if (itemCount === undefined) {
        return undefined;
      }

      return {
        section,
        itemCount,
        mediaType: "application/json",
        bytes: JSON.stringify({ section, itemCount }).length,
        fingerprint: readString(expect.contentFingerprint) ?? DEFAULT_SHA256,
      };
    })
    .filter((section): section is JsonValue => section !== undefined);
}

function countForSection(
  section: string,
  counts: Record<string, unknown> | undefined,
  summary: Readonly<Record<string, number>>,
): number | undefined {
  if (counts !== undefined) {
    const count = counts[section];
    return Number.isInteger(count) && (count as number) >= 0 ? count as number : undefined;
  }

  if (section === "evidenceFiles") {
    return summary.evidenceFileCount;
  }
  if (section === "sourceSnapshots") {
    return summary.sourceCount;
  }
  if (section === "citationEvidence") {
    return summary.citationCount;
  }
  if (section === "quarantineDecisions") {
    return summary.quarantineDecisionCount;
  }
  if (section === "apiRequestTrace") {
    return summary.apiRequestTraceCount;
  }
  if (section === "clientSessionTrace") {
    return summary.clientSessionTraceCount;
  }
  return undefined;
}

function summaryForExpectation(value: unknown): Readonly<Record<string, number>> {
  const summary = isRecord(value) ? value : {};
  return {
    sourceCount: readNonNegativeInteger(summary.sourceCount),
    evidenceFileCount: readNonNegativeInteger(summary.evidenceFileCount),
    citationCount: readNonNegativeInteger(summary.citationCount),
    quarantineDecisionCount: readNonNegativeInteger(summary.quarantineDecisionCount),
    apiRequestTraceCount: readNonNegativeInteger(summary.apiRequestTraceCount),
    clientSessionTraceCount: readNonNegativeInteger(summary.clientSessionTraceCount),
  };
}

function filtersForEntry(entry: IngestEvidenceFixtureRequestEntry): JsonValue {
  const requestBody = requestBodyRecord(entry);
  const options = isRecord(requestBody.options) ? requestBody.options : {};
  const filters = isRecord(requestBody.filters)
    ? requestBody.filters
    : isRecord(options.filters)
      ? options.filters
      : {};

  return {
    sections: readStringArray(filters.sections),
    evidenceFileIds: readStringArray(filters.evidenceFileIds),
    sourceUris: readStringArray(filters.sourceUris),
    citationKinds: readStringArray(filters.citationKinds),
  };
}

function createdAtForEntry(entry: IngestEvidenceFixtureRequestEntry): string {
  const requestBody = requestBodyRecord(entry);
  const options = isRecord(requestBody.options) ? requestBody.options : {};
  return readString(requestBody.createdAt) ?? readString(options.createdAt) ?? DEFAULT_TIMESTAMP;
}

function exportIdForEntry(entry: IngestEvidenceFixtureRequestEntry): string {
  const requestBody = requestBodyRecord(entry);
  const options = isRecord(requestBody.options) ? requestBody.options : {};
  return readString(requestBody.exportId) ?? readString(options.exportId) ?? entry.id;
}

function requestBodyRecord(entry: IngestEvidenceFixtureRequestEntry): Record<string, unknown> {
  return isRecord(entry.request.body) ? entry.request.body : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function readNonNegativeInteger(value: unknown): number {
  return Number.isInteger(value) && (value as number) >= 0 ? value as number : 0;
}

class FixtureResponse implements IngestEvidenceFixtureResponseLike {
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

  clone(): IngestEvidenceFixtureResponseLike {
    return new FixtureResponse(this.status, this.#body, this.#headers);
  }
}

function validateAndReturnBundle(
  bundle: IngestEvidenceFixtureRequestBundle,
): IngestEvidenceFixtureRequestBundle {
  validateFixtureBundle(bundle);
  return bundle;
}

function validateFixtureBundle(value: unknown): asserts value is IngestEvidenceFixtureRequestBundle {
  if (!isRecord(value)) {
    throw new TypeError("ingest evidence fixture bundle must be an object");
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
    if (!isIngestEvidenceFixturePath(request.route.path as string)) {
      throw new TypeError(`${path}.route.path must be an ingest evidence export or package route`);
    }

    if (!isRecord(request.request)) {
      throw new TypeError(`${path}.request must be an object`);
    }
    if (request.request.body !== undefined && !isJsonValue(request.request.body)) {
      throw new TypeError(`${path}.request.body must be JSON-compatible`);
    }

    if (request.response !== undefined) {
      validateResponseSpec(request.response, `${path}.response`);
    }
    if (request.expect !== undefined) {
      validateExpectationSpec(request.expect, `${path}.expect`);
    }
    if (request.response === undefined && request.expect === undefined) {
      throw new TypeError(`${path} must include response or expect`);
    }
  });
}

function validateResponseSpec(value: unknown, path: string): void {
  if (!isRecord(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  if (
    !Number.isInteger(value.status) ||
    (value.status as number) < 100 ||
    (value.status as number) > 599
  ) {
    throw new TypeError(`${path}.status must be an HTTP status code`);
  }
  if (!isJsonValue(value.body)) {
    throw new TypeError(`${path}.body must be JSON-compatible`);
  }
  if (value.headers !== undefined && !isStringRecord(value.headers)) {
    throw new TypeError(`${path}.headers must contain string values`);
  }
}

function validateExpectationSpec(value: unknown, path: string): void {
  if (!isRecord(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  if (
    !Number.isInteger(value.status) ||
    (value.status as number) < 100 ||
    (value.status as number) > 599
  ) {
    throw new TypeError(`${path}.status must be an HTTP status code`);
  }
  if (!isJsonValue(value)) {
    throw new TypeError(`${path} must be JSON-compatible`);
  }
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
  const url = new URL(value, "http://ingest-evidence.fixture.local");
  return `${url.pathname}${url.search}`;
}

function parseRequestUrl(value: string): URL | undefined {
  try {
    return new URL(String(value), "http://ingest-evidence.fixture.local");
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

function freezeCall(call: IngestEvidenceFixtureFetchCall): IngestEvidenceFixtureFetchCall {
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

function isIngestEvidenceFixturePath(value: string): boolean {
  const url = new URL(value, "http://ingest-evidence.fixture.local");
  return INGEST_EVIDENCE_ROUTE_PATTERN.test(url.pathname);
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

function isFixtureBundle(value: unknown): value is IngestEvidenceFixtureRequestBundle {
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
