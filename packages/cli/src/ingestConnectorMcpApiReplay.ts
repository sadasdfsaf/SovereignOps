import { existsSync, readFileSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

import {
  createIngestConnectorRoutes,
  createMemoryIngestConnectorRouteState,
} from "../../../apps/api/src/ingestConnectorRoutes.ts";
import { createIngestConnectorMcpRoutes } from "../../../apps/api/src/ingestConnectorMcpRoutes.ts";
import { createApiRouter } from "../../../apps/api/src/router.ts";

export interface IngestConnectorMcpApiReplayCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface IngestConnectorMcpApiReplayRunOptions {
  readonly cwd?: string;
  readonly dispatch?: IngestConnectorMcpApiDispatcher;
  readonly sharedSchemaValidators?: IngestConnectorMcpApiReplaySharedSchemaValidators;
}

export interface IngestConnectorMcpApiReplayRequest {
  readonly method: string;
  readonly path: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly actorId?: string;
}

export interface IngestConnectorMcpApiReplayResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

export type IngestConnectorMcpApiDispatcher = (
  request: IngestConnectorMcpApiReplayRequest,
) =>
  | IngestConnectorMcpApiReplayResponse
  | Promise<IngestConnectorMcpApiReplayResponse>;

export interface IngestConnectorMcpApiReplaySharedValidationIssue {
  readonly path: string;
  readonly message: string;
}

export interface IngestConnectorMcpApiReplaySharedValidationResult<TValue = unknown> {
  readonly ok: boolean;
  readonly issues: readonly IngestConnectorMcpApiReplaySharedValidationIssue[];
  readonly value?: TValue;
}

export interface IngestConnectorMcpApiReplayResponseValidationContext {
  readonly phase: "expected" | "actual";
  readonly requestId: string;
  readonly method: string;
  readonly path: string;
  readonly status: number;
}

export interface IngestConnectorMcpApiReplaySharedSchemaValidators {
  readonly validateFixtureBundle?: (
    value: unknown,
  ) => IngestConnectorMcpApiReplaySharedValidationResult | boolean | void;
  readonly validateResponse?: (
    response: IngestConnectorMcpApiReplayResponse,
    context: IngestConnectorMcpApiReplayResponseValidationContext,
  ) => IngestConnectorMcpApiReplaySharedValidationResult | boolean | void;
  readonly validateResponseBody?: (
    body: unknown,
    context: IngestConnectorMcpApiReplayResponseValidationContext,
  ) => IngestConnectorMcpApiReplaySharedValidationResult | boolean | void;
  readonly validateResponseBodies?: Readonly<
    Partial<
      Record<
        "preview" | "resource" | "resources",
        (
          body: unknown,
          context: IngestConnectorMcpApiReplayResponseValidationContext,
        ) => IngestConnectorMcpApiReplaySharedValidationResult | boolean | void
      >
    >
  >;
  readonly validateOnlySharedShape?: boolean;
}

type SharedValidationFunction = (...args: readonly unknown[]) => unknown;

type ParsedFlagValue = string | boolean;

interface ParsedArgv {
  readonly positionals: readonly string[];
  readonly flags: Readonly<Record<string, ParsedFlagValue>>;
  readonly errors: readonly string[];
}

interface ResolvedFixturePath {
  readonly absolutePath: string;
  readonly displayPath: string;
  readonly workspaceRoot: string;
}

interface IngestConnectorMcpApiFixtureBundle {
  readonly schemaVersion: "ingest-connector-mcp-api-requests.v1";
  readonly generatedAt: string;
  readonly apiBase?: string;
  readonly localOnly?: boolean;
  readonly durableWrites?: boolean;
  readonly requests: readonly IngestConnectorMcpApiFixtureRequest[];
}

interface IngestConnectorMcpApiFixtureRequest {
  readonly id: string;
  readonly title?: string;
  readonly method: string;
  readonly path: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly actorId?: string;
  readonly body?: unknown;
  readonly expectedStatus: number;
  readonly expectedBody?: unknown;
  readonly expectedChecks?: Readonly<Record<string, unknown>>;
}

interface ReplayedRequest {
  readonly fixture: IngestConnectorMcpApiFixtureRequest;
  readonly actualStatus: number;
  readonly actualHeaders: Readonly<Record<string, string>>;
  readonly actualBody: unknown;
  readonly statusMatches: boolean;
  readonly bodyMatches?: boolean;
  readonly expectationMatches?: boolean;
  readonly expectationIssues: readonly string[];
  readonly responseValidationIssues: readonly IngestConnectorMcpApiReplaySharedValidationIssue[];
}

interface RedactionRecord {
  readonly path: string;
  readonly reason: string;
}

interface Redactor {
  readonly redactions: readonly RedactionRecord[];
  redact(value: unknown, valuePath: string): unknown;
}

const HELP_TEXT = {
  usage: [
    "sovereignops ingest connectors mcp api replay --fixture <path> [--method <method>] [--route <path>] [--id <id>]",
    "sovereignops ingest connector mcp api replay --fixture <path> [--method <method>] [--route <path>] [--id <id>]",
    "sovereignops ingest-connector-mcp api replay --fixture <path> [--method <method>] [--route <path>] [--id <id>]",
  ],
  options: {
    fixture: "Local connector MCP API request fixture bundle JSON path inside this repository.",
    method: "Optional HTTP method filter, for example GET.",
    route: "Optional exact route path filter, for example /v1/ingest/connectors/mcp/resources.",
    id: "Optional exact request id filter, for example mcp_ingest_connector_resources.",
  },
};

const BOOLEAN_FLAGS = new Set(["help", "h"]);
const ALLOWED_FLAGS = new Set(["fixture", "help", "h", "id", "method", "route"]);
const PRIVATE_WORKSPACE_SEGMENT = `.codex${"-private"}`;
const PLAN_PACK_SEGMENTS = new Set([
  "codex-pack",
  "plan-pack",
  "private-plan-pack",
  "sovereignops-codex-pack",
]);
const SENSITIVE_KEY_PATTERN =
  /authorization|cookie|credential|credentials|password|passphrase|secret|api[._-]?key|api[._-]?token|private[._-]?key|access[._-]?token|refresh[._-]?token|session[._-]?token|session|token/i;
const SENSITIVE_TEXT_PATTERNS = [
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/g,
  /\b(?:sk-[A-Za-z0-9_-]{8,}|sk_[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,})\b/g,
  /\b((?:apiKey|api[_-]?key|token|password|secret)\s*[:=]\s*)["']?[^"',;\s]+["']?/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];
const RAW_LOCAL_PATH_PATTERNS = [
  /\b[A-Za-z]:[\\/][^\s"',;)}\]]+/g,
  /\\\\[^\\\s"',;)}\]]+[\\][^\s"',;)}\]]+/g,
  /\b(?:\/Users|\/home|\/var|\/tmp|\/private|\/mnt|\/Volumes)\/[^\s"',;)}\]]+/g,
  /\bworkspaces[\\/][^\s"',;)}\]]+/g,
];
const PRIVATE_MARKER_PATTERNS = [
  /(?:^|[\\/])\.codex-private(?:[\\/]|$)/gi,
  /\bprivate[- _]?plan(?:[- _]?pack)?\b/gi,
  /\b(?:codex-pack|plan-pack|sovereignops-codex-pack|codex_start_here)\b/gi,
];
const SHARED_SCHEMA_MODULE_URL = new URL(
  "../../schemas/src/ingestConnectorMcpApi.ts",
  import.meta.url,
);

export async function runIngestConnectorMcpApiReplayCli(
  argv: readonly string[] = [],
  options: IngestConnectorMcpApiReplayRunOptions = {},
): Promise<IngestConnectorMcpApiReplayCliResult | undefined> {
  const parsed = parseArgv(argv);
  if (!isIngestConnectorMcpApiReplayParsedCommand(parsed)) {
    return undefined;
  }

  if (parsed.errors.length > 0) {
    return jsonFailure(2, "usage_error", parsed.errors.join("\n"));
  }

  const unknownFlags = Object.keys(parsed.flags).filter((flag) => !ALLOWED_FLAGS.has(flag));
  if (unknownFlags.length > 0) {
    return jsonFailure(2, "usage_error", `Unsupported option: --${unknownFlags[0]}`);
  }

  if (hasHelp(parsed)) {
    return jsonSuccess({
      kind: "ingest-connector-mcp-api-replay.help",
      ...HELP_TEXT,
    });
  }

  const commandLength = ingestConnectorMcpApiReplayCommandLength(parsed.positionals);
  const extraPositionals = parsed.positionals.slice(commandLength);
  if (extraPositionals.length > 0) {
    return jsonFailure(
      2,
      "usage_error",
      `Unexpected positional argument: ${extraPositionals[0]}`,
    );
  }

  try {
    const fixture = await resolveFixturePath(
      requireStringFlag(parsed, "fixture"),
      options.cwd ?? process.cwd(),
    );
    const sharedSchemaValidators =
      options.sharedSchemaValidators ?? await loadSharedSchemaValidators();
    const bundle = parseFixtureBundle(
      await readFixtureJson(fixture),
      sharedSchemaValidators,
    );
    const method = optionalMethodFlag(parsed);
    const route = optionalRouteFlag(parsed);
    const id = optionalIdFlag(parsed);
    const requests = bundle.requests.filter(
      (request) =>
        (method === undefined || request.method === method) &&
        (route === undefined || request.path === route) &&
        (id === undefined || request.id === id),
    );
    const replayed = await replayRequests(
      requests,
      options.dispatch ?? createIngestConnectorMcpApiDispatcher(),
      sharedSchemaValidators,
    );
    const failedRequests = replayed.filter((request) => !replaySucceeded(request)).length;

    return jsonSuccess({
      kind: "ingest-connector-mcp-api-fixture-replay",
      schemaVersion: bundle.schemaVersion,
      generatedAt: bundle.generatedAt,
      ...optionalFields({
        apiBase: bundle.apiBase,
        localOnly: bundle.localOnly,
        durableWrites: bundle.durableWrites,
      }),
      fixture: {
        path: fixture.displayPath,
      },
      filters: optionalFields({
        method,
        route,
        id,
      }),
      totalRequests: bundle.requests.length,
      replayedRequests: replayed.length,
      passedRequests: replayed.length - failedRequests,
      failedRequests,
      summary: summarizeReplay(replayed),
      requests: replayed.map(formatReplayedRequest),
    });
  } catch (error) {
    if (error instanceof IngestConnectorMcpApiReplayError) {
      return jsonFailure(error.exitCode, error.code, error.message, error.details);
    }

    return jsonFailure(
      1,
      "ingest_connector_mcp_api_replay_error",
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function isIngestConnectorMcpApiReplayCommand(argv: readonly string[]): boolean {
  return isIngestConnectorMcpApiReplayParsedCommand(parseArgv(argv));
}

export function createIngestConnectorMcpApiDispatcher(): IngestConnectorMcpApiDispatcher {
  const state = createMemoryIngestConnectorRouteState();
  const router = createApiRouter([
    ...createIngestConnectorRoutes(state),
    ...createIngestConnectorMcpRoutes(state),
  ]);

  return async (request) => router.dispatch(request);
}

async function replayRequests(
  requests: readonly IngestConnectorMcpApiFixtureRequest[],
  dispatch: IngestConnectorMcpApiDispatcher,
  sharedSchemaValidators: IngestConnectorMcpApiReplaySharedSchemaValidators,
): Promise<readonly ReplayedRequest[]> {
  const replayed: ReplayedRequest[] = [];

  for (const request of requests) {
    const response = await dispatchSafely(dispatch, {
      method: request.method,
      path: request.path,
      ...(request.headers === undefined ? {} : { headers: request.headers }),
      ...(request.actorId === undefined ? {} : { actorId: request.actorId }),
      ...(request.body === undefined ? {} : { body: cloneJson(request.body) }),
    });
    const bodyMatches =
      request.expectedBody === undefined
        ? undefined
        : jsonEquals(response.body, request.expectedBody);
    const expectationIssues = expectationMismatchIssues(response, request.expectedChecks);
    const responseValidationIssues = validateResponseWithSharedSchema(
      response,
      request,
      "actual",
      sharedSchemaValidators,
    );
    const allExpectationIssues = [
      ...expectationIssues,
      ...responseValidationIssues.map(formatSharedValidationIssue),
    ];
    const expectationMatches =
      request.expectedChecks === undefined && responseValidationIssues.length === 0
        ? undefined
        : allExpectationIssues.length === 0;

    replayed.push({
      fixture: request,
      actualStatus: response.status,
      actualHeaders: response.headers,
      actualBody: response.body,
      statusMatches: response.status === request.expectedStatus,
      ...(bodyMatches === undefined ? {} : { bodyMatches }),
      ...(expectationMatches === undefined ? {} : { expectationMatches }),
      expectationIssues: allExpectationIssues,
      responseValidationIssues,
    });
  }

  return replayed;
}

async function dispatchSafely(
  dispatch: IngestConnectorMcpApiDispatcher,
  request: IngestConnectorMcpApiReplayRequest,
): Promise<IngestConnectorMcpApiReplayResponse> {
  try {
    return await dispatch(request);
  } catch (error) {
    return apiJsonError(
      500,
      "INGEST_CONNECTOR_MCP_API_DISPATCH_ERROR",
      error instanceof Error ? error.message : String(error),
    );
  }
}

function replaySucceeded(request: ReplayedRequest): boolean {
  return (
    request.statusMatches &&
    request.bodyMatches !== false &&
    request.expectationMatches !== false
  );
}

function expectationMismatchIssues(
  response: IngestConnectorMcpApiReplayResponse,
  expected: Readonly<Record<string, unknown>> | undefined,
): readonly string[] {
  if (expected === undefined) {
    return [];
  }

  const issues: string[] = [];
  const body = isRecord(response.body) ? response.body : {};
  const error = isRecord(body.error) ? body.error : {};
  const resources = Array.isArray(body.resources) ? body.resources : [];
  const connectors = Array.isArray(body.connectors) ? body.connectors : [];
  const preview = isRecord(body.preview) ? body.preview : {};

  if (
    typeof expected.contentType === "string" &&
    !String(response.headers["content-type"] ?? "")
      .toLowerCase()
      .startsWith(expected.contentType.toLowerCase())
  ) {
    issues.push("contentType");
  }
  if (expected.schemaVersion !== undefined && body.schemaVersion !== expected.schemaVersion) {
    issues.push("schemaVersion");
  }
  if (expected.localOnly !== undefined && body.localOnly !== expected.localOnly) {
    issues.push("localOnly");
  }
  if (
    expected.resourceCount !== undefined &&
    resources.length !== expected.resourceCount
  ) {
    issues.push("resourceCount");
  }
  if (
    expected.connectorCount !== undefined &&
    connectors.length !== expected.connectorCount
  ) {
    issues.push("connectorCount");
  }
  if (
    expected.connectorIds !== undefined &&
    !jsonEquals(responseConnectorIds(body), expected.connectorIds)
  ) {
    issues.push("connectorIds");
  }
  if (
    expected.connectorId !== undefined &&
    responseConnectorId(body) !== expected.connectorId
  ) {
    issues.push("connectorId");
  }
  if (
    expected.contentIncluded !== undefined &&
    preview.contentIncluded !== expected.contentIncluded
  ) {
    issues.push("contentIncluded");
  }
  if (expected.errorCode !== undefined && error.code !== expected.errorCode) {
    issues.push("errorCode");
  }
  if (expected.body !== undefined && !jsonEquals(response.body, expected.body)) {
    issues.push("body");
  }

  return issues;
}

function responseConnectorIds(body: Record<string, unknown>): readonly unknown[] {
  if (Array.isArray(body.resources)) {
    return body.resources.map((resource) =>
      isRecord(resource) ? resource.connectorId : undefined
    );
  }
  if (Array.isArray(body.connectors)) {
    return body.connectors.map((connector) =>
      isRecord(connector) ? connector.id : undefined
    );
  }
  return [];
}

function responseConnectorId(body: Record<string, unknown>): unknown {
  if (typeof body.connectorId === "string") {
    return body.connectorId;
  }

  const resource = isRecord(body.resource) ? body.resource : undefined;
  if (typeof resource?.connectorId === "string") {
    return resource.connectorId;
  }

  const nestedResource = isRecord(resource?.resource) ? resource.resource : undefined;
  if (typeof nestedResource?.connectorId === "string") {
    return nestedResource.connectorId;
  }

  const connector = isRecord(body.connector) ? body.connector : undefined;
  return typeof connector?.id === "string" ? connector.id : undefined;
}

function formatReplayedRequest(request: ReplayedRequest): Record<string, unknown> {
  const redactor = createRedactor();
  const value = optionalFields({
    id: request.fixture.id,
    title: request.fixture.title,
    method: request.fixture.method,
    path: request.fixture.path,
    request: optionalFields({
      headers:
        request.fixture.headers === undefined
          ? undefined
          : redactor.redact(request.fixture.headers, "$.request.headers"),
      body:
        request.fixture.body === undefined
          ? undefined
          : redactor.redact(request.fixture.body, "$.request.body"),
    }),
    expected: optionalFields({
      status: request.fixture.expectedStatus,
      body:
        request.fixture.expectedBody === undefined
          ? undefined
          : redactor.redact(request.fixture.expectedBody, "$.expected.body"),
      checks:
        request.fixture.expectedChecks === undefined
          ? undefined
          : redactor.redact(request.fixture.expectedChecks, "$.expected.checks"),
    }),
    actual: {
      status: request.actualStatus,
      body: redactor.redact(request.actualBody, "$.actual.body"),
    },
    matches: optionalFields({
      status: request.statusMatches,
      body: request.bodyMatches,
      expectation: request.expectationMatches,
    }),
    expectationIssues:
      request.expectationIssues.length === 0 ? undefined : request.expectationIssues,
    responseValidationIssues:
      request.responseValidationIssues.length === 0
        ? undefined
        : redactor.redact(
            request.responseValidationIssues,
            "$.responseValidationIssues",
          ),
    redactions: redactor.redactions.length === 0 ? undefined : redactor.redactions,
  });

  return value;
}

async function resolveFixturePath(
  value: string,
  cwd: string,
): Promise<ResolvedFixturePath> {
  const input = cleanPathFlag(value, "fixture");
  assertNotPlanPackPath(input, "fixture");

  const cwdPath = path.resolve(cwd);
  const requestedPath = path.resolve(cwdPath, input);
  const workspaceRoot =
    findWorkspaceRoot(cwdPath) ?? findWorkspaceRoot(path.dirname(requestedPath));
  if (workspaceRoot === undefined) {
    throw usageError("Could not locate the SovereignOps workspace root for --fixture.");
  }

  assertPathInsideWorkspace(workspaceRoot, requestedPath, "fixture");
  assertNotPrivatePath(workspaceRoot, requestedPath, "fixture");
  assertNotPlanPackPath(requestedPath, "fixture");
  if (path.extname(requestedPath) !== ".json") {
    throw usageError("Option --fixture must point to a .json file.");
  }

  let fileStat: Awaited<ReturnType<typeof stat>>;
  try {
    fileStat = await stat(requestedPath);
  } catch (error) {
    const code = isRecord(error) ? error.code : undefined;
    if (code === "ENOENT") {
      throw new IngestConnectorMcpApiReplayError({
        exitCode: 2,
        code: "fixture_not_found",
        message: "Fixture file was not found.",
        details: {
          path: displayPath(workspaceRoot, requestedPath),
        },
      });
    }

    throw new IngestConnectorMcpApiReplayError({
      exitCode: 1,
      code: "fixture_stat_error",
      message: "Could not inspect fixture file.",
      details: {
        path: displayPath(workspaceRoot, requestedPath),
        cause: error instanceof Error ? error.message : String(error),
      },
    });
  }

  if (!fileStat.isFile()) {
    throw new IngestConnectorMcpApiReplayError({
      exitCode: 2,
      code: "fixture_not_file",
      message: "Fixture path must point to a file.",
      details: {
        path: displayPath(workspaceRoot, requestedPath),
      },
    });
  }

  const actualPath = await realpath(requestedPath);
  assertPathInsideWorkspace(workspaceRoot, actualPath, "fixture");
  assertNotPrivatePath(workspaceRoot, actualPath, "fixture");
  assertNotPlanPackPath(actualPath, "fixture");

  return {
    absolutePath: actualPath,
    displayPath: displayPath(workspaceRoot, actualPath),
    workspaceRoot,
  };
}

async function readFixtureJson(fixture: ResolvedFixturePath): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(fixture.absolutePath, "utf8");
  } catch (error) {
    throw new IngestConnectorMcpApiReplayError({
      exitCode: 1,
      code: "fixture_read_error",
      message: "Could not read fixture file.",
      details: {
        path: fixture.displayPath,
        cause: error instanceof Error ? error.message : String(error),
      },
    });
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new IngestConnectorMcpApiReplayError({
      exitCode: 2,
      code: "invalid_fixture_json",
      message: "Fixture file must contain valid JSON.",
      details: {
        path: fixture.displayPath,
      },
    });
  }
}

async function loadSharedSchemaValidators(): Promise<IngestConnectorMcpApiReplaySharedSchemaValidators> {
  if (!existsSync(SHARED_SCHEMA_MODULE_URL)) {
    return {};
  }

  const sharedModule = await import(SHARED_SCHEMA_MODULE_URL.href) as Record<string, unknown>;
  return discoverSharedSchemaValidators(sharedModule);
}

function discoverSharedSchemaValidators(
  sharedModule: Record<string, unknown>,
): IngestConnectorMcpApiReplaySharedSchemaValidators {
  const groups = [
    sharedModule.ingestConnectorMcpApiValidators,
    sharedModule.ingestConnectorMcpApiFixtureValidators,
    sharedModule.ingestConnectorMcpApiSchemas,
  ].filter(isRecord);

  return optionalFields({
    validateFixtureBundle: firstSharedValidationFunction(
      sharedModule,
      groups,
      [
        "validateIngestConnectorMcpApiRequestBundle",
        "validateIngestConnectorMcpApiFixtureBundle",
        "validateIngestConnectorMcpApiFixtureRequestBundle",
        "validateIngestConnectorMcpFixtureBundle",
        "validateFixtureBundle",
        "apiRequests",
        "fixtureBundle",
      ],
    ) as IngestConnectorMcpApiReplaySharedSchemaValidators["validateFixtureBundle"],
    validateResponse: firstSharedValidationFunction(
      sharedModule,
      groups,
      [
        "validateIngestConnectorMcpApiResponse",
        "validateIngestConnectorMcpApiFixtureResponse",
        "validateFixtureResponse",
        "validateResponse",
        "response",
      ],
    ) as IngestConnectorMcpApiReplaySharedSchemaValidators["validateResponse"],
    validateResponseBody: firstSharedValidationFunction(
      sharedModule,
      groups,
      [
        "validateIngestConnectorMcpApiResponseBody",
        "validateIngestConnectorMcpApiFixtureResponseBody",
        "validateFixtureResponseBody",
        "validateResponseBody",
        "responseBody",
      ],
    ) as IngestConnectorMcpApiReplaySharedSchemaValidators["validateResponseBody"],
    validateResponseBodies: optionalFields({
      resources: firstSharedValidationFunction(
        sharedModule,
        groups,
        ["validateIngestConnectorMcpResources", "resources"],
      ),
      resource: firstSharedValidationFunction(
        sharedModule,
        groups,
        ["validateIngestConnectorMcpResource", "resource"],
      ),
      preview: firstSharedValidationFunction(
        sharedModule,
        groups,
        ["validateIngestConnectorMcpPreview", "preview"],
      ),
    }) as IngestConnectorMcpApiReplaySharedSchemaValidators["validateResponseBodies"],
    validateOnlySharedShape: true,
  });
}

function firstSharedValidationFunction(
  sharedModule: Record<string, unknown>,
  groups: readonly Record<string, unknown>[],
  names: readonly string[],
): SharedValidationFunction | undefined {
  for (const name of names) {
    const direct = sharedModule[name];
    if (typeof direct === "function") {
      return direct as SharedValidationFunction;
    }

    for (const group of groups) {
      const grouped = group[name];
      if (typeof grouped === "function") {
        return grouped as SharedValidationFunction;
      }
    }
  }

  return undefined;
}

function validateFixtureBundleWithSharedSchema(
  value: unknown,
  sharedSchemaValidators: IngestConnectorMcpApiReplaySharedSchemaValidators,
): unknown {
  const validator = sharedSchemaValidators.validateFixtureBundle;
  if (validator === undefined) {
    return value;
  }
  if (
    sharedSchemaValidators.validateOnlySharedShape === true &&
    !isSharedMcpApiFixtureBundleShape(value)
  ) {
    return value;
  }

  const result = callSharedValidationFunction(validator, [value], value);
  if (!result.ok) {
    throw invalidFixture("Fixture bundle failed shared schema validation.", {
      issues: result.issues,
    });
  }

  return result.value ?? value;
}

function parseFixtureBundle(
  value: unknown,
  sharedSchemaValidators: IngestConnectorMcpApiReplaySharedSchemaValidators,
): IngestConnectorMcpApiFixtureBundle {
  const sharedValidatedValue = validateFixtureBundleWithSharedSchema(
    value,
    sharedSchemaValidators,
  );

  value = sharedValidatedValue;
  if (!isRecord(value)) {
    throw invalidFixture("fixture root must be a JSON object.");
  }
  if (value.schemaVersion !== "ingest-connector-mcp-api-requests.v1") {
    throw invalidFixture(
      'fixture.schemaVersion must be "ingest-connector-mcp-api-requests.v1".',
    );
  }
  if (typeof value.generatedAt !== "string" || value.generatedAt.trim().length === 0) {
    throw invalidFixture("fixture.generatedAt must be a non-empty string.");
  }
  if (!Array.isArray(value.requests)) {
    throw invalidFixture("fixture.requests must be an array.");
  }

  const apiBase = optionalNonEmptyString(value.apiBase, "fixture.apiBase");
  const localOnly = optionalBoolean(value.localOnly, "fixture.localOnly");
  const durableWrites = optionalBoolean(value.durableWrites, "fixture.durableWrites");

  return {
    schemaVersion: value.schemaVersion,
    generatedAt: value.generatedAt,
    ...(apiBase === undefined ? {} : { apiBase }),
    ...(localOnly === undefined ? {} : { localOnly }),
    ...(durableWrites === undefined ? {} : { durableWrites }),
    requests: value.requests.map((request, index) =>
      parseFixtureRequest(request, index, sharedSchemaValidators)
    ),
  };
}

function parseFixtureRequest(
  value: unknown,
  index: number,
  sharedSchemaValidators: IngestConnectorMcpApiReplaySharedSchemaValidators,
): IngestConnectorMcpApiFixtureRequest {
  const prefix = `fixture.requests[${index}]`;
  if (!isRecord(value)) {
    throw invalidFixture(`${prefix} must be an object.`);
  }

  const id = nonEmptyString(value.id, `${prefix}.id`);
  const title = optionalNonEmptyString(value.title, `${prefix}.title`);
  const method = normalizeFixtureMethod(
    nonEmptyString(value.method, `${prefix}.method`),
    `${prefix}.method`,
  );
  const routePath = normalizeRoutePath(
    nonEmptyString(value.path, `${prefix}.path`),
    `${prefix}.path`,
  );
  const status = value.expectedStatus;
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    throw invalidFixture(`${prefix}.expectedStatus must be an HTTP status code.`);
  }

  const headers = optionalHeaders(value.headers, `${prefix}.headers`);
  const actorId = optionalNonEmptyString(value.actorId, `${prefix}.actorId`);
  const expectedChecks = optionalChecks(value.expectedChecks, `${prefix}.expectedChecks`);

  const fixtureRequest: IngestConnectorMcpApiFixtureRequest = {
    id,
    ...(title === undefined ? {} : { title }),
    method,
    path: routePath,
    ...(headers === undefined ? {} : { headers }),
    ...(actorId === undefined ? {} : { actorId }),
    ...(Object.hasOwn(value, "body") ? { body: cloneJson(value.body) } : {}),
    expectedStatus: status,
    ...(Object.hasOwn(value, "expectedBody")
      ? { expectedBody: cloneJson(value.expectedBody) }
      : {}),
    ...(expectedChecks === undefined ? {} : { expectedChecks }),
  };

  validateFixtureExpectedResponseWithSharedSchema(
    fixtureRequest,
    prefix,
    sharedSchemaValidators,
  );

  return fixtureRequest;
}

function optionalChecks(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw invalidFixture(`${label} must be an object.`);
  }
  return cloneJson(value);
}

function validateFixtureExpectedResponseWithSharedSchema(
  request: IngestConnectorMcpApiFixtureRequest,
  requestPath: string,
  sharedSchemaValidators: IngestConnectorMcpApiReplaySharedSchemaValidators,
): void {
  if (request.expectedBody === undefined) {
    return;
  }

  const response = {
    status: request.expectedStatus,
    headers: Object.freeze({
      "content-type": "application/json; charset=utf-8",
    }),
    body: request.expectedBody,
  };
  const issues = validateResponseWithSharedSchema(
    response,
    request,
    "expected",
    sharedSchemaValidators,
  );
  if (issues.length === 0) {
    return;
  }

  throw invalidFixture("Fixture expected responses failed shared schema validation.", {
    issues: issues.map((issue) => ({
      path: `${requestPath}.expectedBody${sharedIssuePathSuffix(issue.path)}`,
      message: issue.message,
    })),
  });
}

function validateResponseWithSharedSchema(
  response: IngestConnectorMcpApiReplayResponse,
  request: IngestConnectorMcpApiFixtureRequest,
  phase: IngestConnectorMcpApiReplayResponseValidationContext["phase"],
  sharedSchemaValidators: IngestConnectorMcpApiReplaySharedSchemaValidators,
): readonly IngestConnectorMcpApiReplaySharedValidationIssue[] {
  const context = {
    phase,
    requestId: request.id,
    method: request.method,
    path: request.path,
    status: response.status,
  } satisfies IngestConnectorMcpApiReplayResponseValidationContext;

  const issues: IngestConnectorMcpApiReplaySharedValidationIssue[] = [];
  if (
    sharedSchemaValidators.validateOnlySharedShape === true &&
    !isSharedMcpApiResponseShape(response.body)
  ) {
    return issues;
  }

  if (sharedSchemaValidators.validateResponse !== undefined) {
    const result = callSharedValidationFunction(
      sharedSchemaValidators.validateResponse,
      [response, context],
      response,
    );
    if (!result.ok) {
      issues.push(...result.issues);
    }
  }
  if (sharedSchemaValidators.validateResponseBody !== undefined) {
    const result = callSharedValidationFunction(
      sharedSchemaValidators.validateResponseBody,
      [response.body, context],
      response.body,
    );
    if (!result.ok) {
      issues.push(...result.issues);
    }
  }
  const responseKind = sharedMcpApiResponseKind(response.body);
  const kindValidator = responseKind === undefined
    ? undefined
    : sharedSchemaValidators.validateResponseBodies?.[responseKind];
  if (kindValidator !== undefined) {
    const result = callSharedValidationFunction(
      kindValidator,
      [response.body, context],
      response.body,
    );
    if (!result.ok) {
      issues.push(...result.issues);
    }
  }

  return issues;
}

function isSharedMcpApiFixtureBundleShape(value: unknown): boolean {
  if (!isRecord(value)) {
    return true;
  }
  if (
    Object.hasOwn(value, "bundleId") ||
    Object.hasOwn(value, "resources") ||
    Object.hasOwn(value, "resourceFixtures") ||
    Object.hasOwn(value, "preview")
  ) {
    return true;
  }
  if (!Array.isArray(value.requests)) {
    return false;
  }
  return value.requests.some((request) =>
    isRecord(request) &&
    (
      Object.hasOwn(request, "fixture") ||
      Object.hasOwn(request, "operation") ||
      Object.hasOwn(request, "requestedAt") ||
      Object.hasOwn(request, "responseSchemaVersion")
    )
  );
}

function isSharedMcpApiResponseShape(value: unknown): boolean {
  return (
    isRecord(value) &&
    sharedMcpApiResponseKind(value) !== undefined &&
    Object.hasOwn(value, "generatedAt")
  );
}

function sharedMcpApiResponseKind(
  value: unknown,
): "preview" | "resource" | "resources" | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  switch (value.schemaVersion) {
    case "ingest-connector-mcp-resources/v1":
      return "resources";
    case "ingest-connector-mcp-resource/v1":
      return "resource";
    case "ingest-connector-mcp-preview/v1":
      return "preview";
    default:
      return undefined;
  }
}

function callSharedValidationFunction(
  validator: SharedValidationFunction,
  args: readonly unknown[],
  fallbackValue: unknown,
): IngestConnectorMcpApiReplaySharedValidationResult {
  try {
    return normalizeSharedValidationResult(validator(...args), fallbackValue);
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          path: "$",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}

function normalizeSharedValidationResult(
  value: unknown,
  fallbackValue: unknown,
): IngestConnectorMcpApiReplaySharedValidationResult {
  if (value === undefined || value === true) {
    return {
      ok: true,
      issues: [],
      value: fallbackValue,
    };
  }
  if (value === false) {
    return {
      ok: false,
      issues: [{ path: "$", message: "shared schema validation failed" }],
    };
  }
  if (Array.isArray(value)) {
    const issues = normalizeSharedValidationIssues(value);
    return {
      ok: issues.length === 0,
      issues,
      value: fallbackValue,
    };
  }
  if (isRecord(value)) {
    const rawIssues = Array.isArray(value.issues)
      ? value.issues
      : Array.isArray(value.errors)
        ? value.errors
        : [];
    const issues = normalizeSharedValidationIssues(rawIssues);
    const ok = typeof value.ok === "boolean"
      ? value.ok
      : typeof value.valid === "boolean"
        ? value.valid
        : issues.length === 0;

    return {
      ok,
      issues: ok ? [] : issues.length === 0
        ? [{ path: "$", message: "shared schema validation failed" }]
        : issues,
      value: Object.hasOwn(value, "value") ? value.value : fallbackValue,
    };
  }

  return {
    ok: false,
    issues: [{ path: "$", message: String(value) }],
  };
}

function normalizeSharedValidationIssues(
  values: readonly unknown[],
): readonly IngestConnectorMcpApiReplaySharedValidationIssue[] {
  return values.map((value) => {
    if (isRecord(value)) {
      const pathValue = value.path ?? value.pointer ?? value.instancePath ?? "$";
      const messageValue = value.message ?? value.reason ?? "shared schema validation failed";
      return {
        path: typeof pathValue === "string" && pathValue.trim().length > 0
          ? pathValue
          : "$",
        message: typeof messageValue === "string" && messageValue.trim().length > 0
          ? messageValue
          : "shared schema validation failed",
      };
    }

    return {
      path: "$",
      message: String(value),
    };
  });
}

function formatSharedValidationIssue(
  issue: IngestConnectorMcpApiReplaySharedValidationIssue,
): string {
  return `${issue.path}: ${issue.message}`;
}

function sharedIssuePathSuffix(issuePath: string): string {
  const cleanPath = issuePath.trim();
  if (cleanPath.length === 0 || cleanPath === "$") {
    return "";
  }
  if (cleanPath.startsWith("$.")) {
    return cleanPath.slice(1);
  }
  if (cleanPath.startsWith("$[")) {
    return cleanPath.slice(1);
  }
  if (cleanPath.startsWith(".") || cleanPath.startsWith("[")) {
    return cleanPath;
  }
  return `.${cleanPath}`;
}

function summarizeReplay(replayed: readonly ReplayedRequest[]): Record<string, unknown> {
  const methods = new Map<string, number>();
  const routes = new Map<string, number>();
  const expectedStatuses = new Map<string, number>();
  const actualStatuses = new Map<string, number>();
  const mismatches = new Map<string, number>();

  for (const request of replayed) {
    increment(methods, request.fixture.method);
    increment(routes, request.fixture.path);
    increment(expectedStatuses, String(request.fixture.expectedStatus));
    increment(actualStatuses, String(request.actualStatus));
    if (!request.statusMatches) {
      increment(mismatches, "status");
    }
    if (request.bodyMatches === false) {
      increment(mismatches, "body");
    }
    if (request.expectationMatches === false) {
      increment(mismatches, "expectation");
    }
    if (request.responseValidationIssues.length > 0) {
      increment(mismatches, "response");
    }
  }

  return {
    methods: sortedRecord(methods),
    routes: sortedRecord(routes),
    expectedStatuses: sortedRecord(expectedStatuses),
    actualStatuses: sortedRecord(actualStatuses),
    mismatches: sortedRecord(mismatches),
  };
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortedRecord(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries([...map.entries()].sort(([left], [right]) =>
    compareStrings(left, right),
  ));
}

function findWorkspaceRoot(start: string): string | undefined {
  let current = path.resolve(start);

  while (true) {
    const packageJsonPath = path.join(current, "package.json");
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
          readonly name?: unknown;
          readonly workspaces?: unknown;
        };
        if (packageJson.name === "@sovereignops/root" && Array.isArray(packageJson.workspaces)) {
          return current;
        }
      } catch {
        return undefined;
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

function assertPathInsideWorkspace(
  workspaceRoot: string,
  candidatePath: string,
  flagName: string,
): void {
  const relativePath = path.relative(workspaceRoot, candidatePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw usageError(`Option --${flagName} must stay inside the SovereignOps workspace.`);
  }
}

function assertNotPrivatePath(
  workspaceRoot: string,
  candidatePath: string,
  flagName: string,
): void {
  const segments = path.relative(workspaceRoot, candidatePath).split(path.sep);
  if (segments.includes(PRIVATE_WORKSPACE_SEGMENT)) {
    throw usageError(`Option --${flagName} must not reference private workspace files.`);
  }
}

function assertNotPlanPackPath(candidatePath: string, flagName: string): void {
  const segments = candidatePath
    .split(/[\\/]+/)
    .map((segment) => segment.toLowerCase())
    .filter((segment) => segment.length > 0);
  if (segments.some((segment) => PLAN_PACK_SEGMENTS.has(segment))) {
    throw usageError(`Option --${flagName} must not reference private plan-pack paths.`);
  }
}

function displayPath(workspaceRoot: string, candidatePath: string): string {
  return path.relative(workspaceRoot, candidatePath).split(path.sep).join("/");
}

function optionalMethodFlag(parsed: ParsedArgv): string | undefined {
  const method = optionalStringFlag(parsed, "method");
  if (method === undefined) {
    return undefined;
  }
  return normalizeMethod(method);
}

function optionalRouteFlag(parsed: ParsedArgv): string | undefined {
  const route = optionalStringFlag(parsed, "route");
  if (route === undefined) {
    return undefined;
  }
  if (!route.startsWith("/")) {
    throw usageError("Option --route must start with /.");
  }
  return normalizeRoutePath(route, "route");
}

function optionalIdFlag(parsed: ParsedArgv): string | undefined {
  const id = optionalStringFlag(parsed, "id");
  if (id === undefined) {
    return undefined;
  }
  if (id.trim().length === 0) {
    throw usageError("Option --id requires a non-empty value.");
  }
  return id;
}

function parseArgv(argv: readonly string[]): ParsedArgv {
  const positionals: string[] = [];
  const flags: Record<string, ParsedFlagValue> = {};
  const errors: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }

    if (token.startsWith("--")) {
      const [name, inlineValue] = splitLongFlag(token);
      if (name.length === 0) {
        errors.push("Long flag names cannot be empty.");
        continue;
      }
      if (inlineValue !== undefined) {
        setFlag(flags, name, inlineValue, errors);
        continue;
      }
      if (BOOLEAN_FLAGS.has(name)) {
        setFlag(flags, name, true, errors);
        continue;
      }

      const next = argv[index + 1];
      if (next === undefined || next.startsWith("-")) {
        errors.push(`Flag --${name} requires a value.`);
        continue;
      }
      setFlag(flags, name, next, errors);
      index += 1;
      continue;
    }

    if (token.startsWith("-") && token.length > 1) {
      if (token === "-h") {
        setFlag(flags, "help", true, errors);
      } else {
        errors.push(`Unsupported short flag: ${token}`);
      }
      continue;
    }

    positionals.push(token);
  }

  return { positionals, flags, errors };
}

function splitLongFlag(token: string): [string, string | undefined] {
  const equalsIndex = token.indexOf("=");
  if (equalsIndex === -1) {
    return [token.slice(2), undefined];
  }

  return [token.slice(2, equalsIndex), token.slice(equalsIndex + 1)];
}

function setFlag(
  flags: Record<string, ParsedFlagValue>,
  name: string,
  value: ParsedFlagValue,
  errors: string[],
): void {
  if (Object.hasOwn(flags, name)) {
    errors.push(`Flag --${name} was provided more than once.`);
    return;
  }

  flags[name] = value;
}

function isIngestConnectorMcpApiReplayParsedCommand(parsed: ParsedArgv): boolean {
  return ingestConnectorMcpApiReplayCommandLength(parsed.positionals) > 0;
}

function ingestConnectorMcpApiReplayCommandLength(positionals: readonly string[]): number {
  if (
    positionals[0] === "ingest" &&
    positionals[1] === "connectors" &&
    positionals[2] === "mcp" &&
    positionals[3] === "api" &&
    positionals[4] === "replay"
  ) {
    return 5;
  }
  if (
    positionals[0] === "ingest" &&
    positionals[1] === "connector" &&
    positionals[2] === "mcp" &&
    positionals[3] === "api" &&
    positionals[4] === "replay"
  ) {
    return 5;
  }
  if (
    positionals[0] === "ingest-connectors" &&
    positionals[1] === "mcp" &&
    positionals[2] === "api" &&
    positionals[3] === "replay"
  ) {
    return 4;
  }
  if (
    positionals[0] === "ingest-connector" &&
    positionals[1] === "mcp" &&
    positionals[2] === "api" &&
    positionals[3] === "replay"
  ) {
    return 4;
  }
  if (
    positionals[0] === "ingest-connector-mcp" &&
    positionals[1] === "api" &&
    positionals[2] === "replay"
  ) {
    return 3;
  }
  if (positionals[0] === "ingest-connector-mcp-api" && positionals[1] === "replay") {
    return 2;
  }
  return 0;
}

function hasHelp(parsed: ParsedArgv): boolean {
  return parsed.flags.help === true || parsed.flags.h === true;
}

function requireStringFlag(parsed: ParsedArgv, name: string): string {
  const value = optionalStringFlag(parsed, name);
  if (value === undefined || value.trim().length === 0) {
    throw usageError(`Missing required option --${name}.`);
  }
  return value;
}

function optionalStringFlag(parsed: ParsedArgv, name: string): string | undefined {
  const value = parsed.flags[name];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw usageError(`Option --${name} requires a value.`);
  }
  return value;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw invalidFixture(`${label} must be a non-empty string.`);
  }
  return value;
}

function optionalNonEmptyString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return nonEmptyString(value, label);
}

function optionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw invalidFixture(`${label} must be a boolean.`);
  }
  return value;
}

function optionalHeaders(
  value: unknown,
  label: string,
): Readonly<Record<string, string>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw invalidFixture(`${label} must be an object.`);
  }

  const headers: Record<string, string> = {};
  for (const [key, headerValue] of Object.entries(value)) {
    if (typeof headerValue !== "string") {
      throw invalidFixture(`${label}.${key} must be a string.`);
    }
    headers[key.toLowerCase()] = headerValue;
  }
  return Object.freeze(headers);
}

function cleanPathFlag(value: string, name: string): string {
  const input = value.trim();
  if (input.length === 0) {
    throw usageError(`Option --${name} requires a non-empty path.`);
  }
  if (input.includes("\0")) {
    throw usageError(`Option --${name} must not contain null bytes.`);
  }
  if (/^[A-Za-z][A-Za-z\d+.-]*:\/\//.test(input)) {
    throw usageError(`Option --${name} must be a local file path, not a URL.`);
  }
  return input;
}

function normalizeMethod(method: string): string {
  const normalized = method.toUpperCase();
  if (!/^[A-Z]+$/.test(normalized)) {
    throw usageError("Option --method must be an HTTP method token.");
  }
  return normalized;
}

function normalizeFixtureMethod(method: string, label: string): string {
  const normalized = method.toUpperCase();
  if (!/^[A-Z]+$/.test(normalized)) {
    throw invalidFixture(`${label} must be an HTTP method token.`);
  }
  return normalized;
}

function normalizeRoutePath(routePath: string, label: string): string {
  if (routePath.trim().length === 0) {
    throw invalidFixture(`${label} must be a non-empty string.`);
  }

  const withoutSuffix = routePath.trim().split("?")[0].split("#")[0];
  const withSlash = withoutSuffix.startsWith("/") ? withoutSuffix : `/${withoutSuffix}`;
  const collapsed = withSlash.replace(/\/+/g, "/");
  return collapsed.length > 1 && collapsed.endsWith("/")
    ? collapsed.slice(0, -1)
    : collapsed;
}

function createRedactor(): Redactor {
  const redactions: RedactionRecord[] = [];

  return {
    get redactions() {
      return [...redactions].sort(compareRedactions);
    },
    redact(value: unknown, valuePath: string): unknown {
      return redactValue(value, valuePath);
    },
  };

  function record(valuePath: string, reason: string): void {
    redactions.push({ path: valuePath, reason });
  }

  function redactValue(value: unknown, valuePath: string): unknown {
    if (value === null || typeof value === "boolean" || typeof value === "number") {
      return value;
    }
    if (typeof value === "string") {
      return redactString(value, valuePath);
    }
    if (Array.isArray(value)) {
      return value.map((item, index) => redactValue(item, `${valuePath}[${index}]`));
    }
    if (isRecord(value)) {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([left], [right]) => compareStrings(left, right))
          .map(([key, nested]) => {
            const nestedPath = `${valuePath}.${key}`;
            if (SENSITIVE_KEY_PATTERN.test(key)) {
              record(nestedPath, "sensitive key");
              return [key, "[REDACTED]"];
            }
            return [key, redactValue(nested, nestedPath)];
          }),
      );
    }

    return String(value);
  }

  function redactString(value: string, valuePath: string): string {
    let redacted = value;

    for (const pattern of RAW_LOCAL_PATH_PATTERNS) {
      redacted = redacted.replace(pattern, () => {
        record(valuePath, "raw local path");
        return "[redacted-path]";
      });
    }

    for (const pattern of PRIVATE_MARKER_PATTERNS) {
      redacted = redacted.replace(pattern, () => {
        record(valuePath, "private marker");
        return "[redacted-private-marker]";
      });
    }

    for (const pattern of SENSITIVE_TEXT_PATTERNS) {
      redacted = redacted.replace(pattern, (match: string, ...args: unknown[]) => {
        const prefix = typeof args[0] === "string" ? args[0] : undefined;
        record(valuePath, "secret-like value");
        return prefix !== undefined && match.startsWith(prefix)
          ? `${prefix}[REDACTED]`
          : "[REDACTED]";
      });
    }

    return redacted;
  }
}

function apiJsonError(
  status: number,
  code: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): IngestConnectorMcpApiReplayResponse {
  const redactor = createRedactor();
  return {
    status,
    headers: Object.freeze({
      "content-type": "application/json; charset=utf-8",
    }),
    body: redactor.redact({
      error: optionalFields({
        code,
        message,
        details,
      }),
    }, "$"),
  };
}

function jsonSuccess(value: unknown): IngestConnectorMcpApiReplayCliResult {
  return {
    exitCode: 0,
    stdout: `${serializePrettyJson(value)}\n`,
    stderr: "",
  };
}

function jsonFailure(
  exitCode: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): IngestConnectorMcpApiReplayCliResult {
  const redactor = createRedactor();
  const errorBody = {
    error: optionalFields({
      code,
      message,
      details: details && Object.keys(details).length > 0 ? details : undefined,
    }),
  };

  return {
    exitCode,
    stdout: "",
    stderr: `${serializePrettyJson(redactor.redact(errorBody, "$"))}\n`,
  };
}

function usageError(message: string): IngestConnectorMcpApiReplayError {
  return new IngestConnectorMcpApiReplayError({
    exitCode: 2,
    code: "usage_error",
    message,
  });
}

function invalidFixture(
  message: string,
  details?: Record<string, unknown>,
): IngestConnectorMcpApiReplayError {
  return new IngestConnectorMcpApiReplayError({
    exitCode: 2,
    code: "invalid_fixture",
    message,
    ...(details === undefined ? {} : { details }),
  });
}

function cloneJson<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

function jsonEquals(left: unknown, right: unknown): boolean {
  return serializeCompactJson(left) === serializeCompactJson(right);
}

function serializePrettyJson(value: unknown): string {
  return JSON.stringify(sortJson(value), null, 2);
}

function serializeCompactJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => compareStrings(left, right))
        .map(([key, nested]) => [key, sortJson(nested)]),
    );
  }
  return value;
}

function optionalFields<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T;
}

function compareRedactions(left: RedactionRecord, right: RedactionRecord): number {
  return compareStrings(left.path, right.path) || compareStrings(left.reason, right.reason);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class IngestConnectorMcpApiReplayError extends Error {
  readonly exitCode: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(options: {
    readonly exitCode: number;
    readonly code: string;
    readonly message: string;
    readonly details?: Record<string, unknown>;
  }) {
    super(options.message);
    this.name = "IngestConnectorMcpApiReplayError";
    this.exitCode = options.exitCode;
    this.code = options.code;
    this.details = options.details;
  }
}
