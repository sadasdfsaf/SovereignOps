import { existsSync, readFileSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

export interface McpApprovalEvidenceRecordsReplayCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface McpApprovalEvidenceRecordsReplayRunOptions {
  readonly cwd?: string;
  readonly dispatch?: McpApprovalEvidenceRecordsDispatcher;
}

export interface McpApprovalEvidenceRecordsReplayRequest {
  readonly method: string;
  readonly path: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly actorId?: string;
  readonly body?: unknown;
}

export interface McpApprovalEvidenceRecordsReplayResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

export type McpApprovalEvidenceRecordsDispatcher = (
  request: McpApprovalEvidenceRecordsReplayRequest,
) =>
  | McpApprovalEvidenceRecordsReplayResponse
  | Promise<McpApprovalEvidenceRecordsReplayResponse>;

type ParsedFlagValue = string | boolean;
type RecordsEndpointKind = "create" | "list" | "get" | "compare";
type ApprovalRecordStatus = "pending" | "approved" | "rejected" | "expired";

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

interface McpApprovalEvidenceRecordsFixtureBundle {
  readonly schemaVersion: "mcp-approval-evidence-records-requests.v1";
  readonly generatedAt: string;
  readonly apiBase?: string;
  readonly requests: readonly McpApprovalEvidenceRecordsFixtureRequest[];
}

interface McpApprovalEvidenceRecordsFixtureRequest {
  readonly id: string;
  readonly title?: string;
  readonly endpointKind: RecordsEndpointKind;
  readonly method: string;
  readonly path: string;
  readonly recordId?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly actorId?: string;
  readonly body?: unknown;
  readonly expectedStatus: number;
  readonly expectedBody?: unknown;
  readonly expectedChecks?: Readonly<Record<string, unknown>>;
}

interface RecordsEndpoint {
  readonly kind: RecordsEndpointKind;
  readonly method: string;
  readonly path: string;
  readonly recordId?: string;
}

interface ReplayedRequest {
  readonly fixture: McpApprovalEvidenceRecordsFixtureRequest;
  readonly actualStatus: number;
  readonly actualHeaders: Readonly<Record<string, string>>;
  readonly actualBody: unknown;
  readonly statusMatches: boolean;
  readonly bodyMatches?: boolean;
  readonly expectationMatches?: boolean;
  readonly expectationIssues: readonly string[];
}

interface RedactionRecord {
  readonly path: string;
  readonly reason: string;
}

interface Redactor {
  readonly redactions: readonly RedactionRecord[];
  redact(value: unknown, valuePath: string): unknown;
}

interface JsonDifference {
  readonly path: string;
  readonly left?: unknown;
  readonly right?: unknown;
}

const HELP_TEXT = {
  usage: [
    "sovereignops mcp approval evidence records replay --fixture <path> [--id <id>]",
    "sovereignops mcp approval-evidence records replay --fixture <path> [--id <id>]",
    "sovereignops mcp approval-evidence-records replay --fixture <path> [--id <id>]",
    "sovereignops mcp-approval-evidence records replay --fixture <path> [--id <id>]",
    "sovereignops mcp-approval-evidence-records replay --fixture <path> [--id <id>]",
  ],
  options: {
    fixture: "Local MCP approval evidence records request fixture JSON path inside this workspace.",
    id: "Optional exact request id filter, for example api_mcp_approval_evidence_records_create.",
  },
};

const BOOLEAN_FLAGS = new Set(["help", "h"]);
const ALLOWED_FLAGS = new Set(["fixture", "help", "h", "id"]);
const RECORDS_ROUTE = "/v1/mcp/approval-evidence/records";
const COMPARE_ROUTE = `${RECORDS_ROUTE}/compare`;
const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const PRIVATE_WORKSPACE_SEGMENT = `.codex${"-private"}`;
const PLAN_PACK_SEGMENTS = new Set([
  "codex-pack",
  "plan-pack",
  "sovereignops-codex-pack",
]);
const SENSITIVE_KEY_PATTERN =
  /(^|[._-])(authorization|cookie|credential|credentials|password|passphrase|secret|api[._-]?key|api[._-]?token|private[._-]?key|access[._-]?token|refresh[._-]?token|session[._-]?token|token)([._-]|$)/i;
const SENSITIVE_TEXT_PATTERNS = [
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/g,
  /\b(?:sk-[A-Za-z0-9_-]{8,}|sk_[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,})\b/g,
  /\b((?:apiKey|api[_-]?key|token|password|secret)\s*[:=]\s*)["']?[^"',;\s]+["']?/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

export async function runMcpApprovalEvidenceRecordsReplayCli(
  argv: readonly string[] = [],
  options: McpApprovalEvidenceRecordsReplayRunOptions = {},
): Promise<McpApprovalEvidenceRecordsReplayCliResult | undefined> {
  const parsed = parseArgv(argv);
  if (!isMcpApprovalEvidenceRecordsReplayParsedCommand(parsed)) {
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
      kind: "mcp-approval-evidence-records-replay.help",
      ...HELP_TEXT,
    });
  }

  const commandLength = mcpApprovalEvidenceRecordsReplayCommandLength(parsed.positionals);
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
    const bundle = parseFixtureBundle(await readFixtureJson(fixture));
    const id = optionalIdFlag(parsed);
    const requests = bundle.requests.filter((request) => id === undefined || request.id === id);
    const replayed = await replayRequests(
      requests,
      options.dispatch ?? createMcpApprovalEvidenceRecordsDispatcher(),
    );
    const failedRequests = replayed.filter((request) => !replaySucceeded(request)).length;

    return jsonSuccess({
      kind: "mcp-approval-evidence-records-replay",
      schemaVersion: bundle.schemaVersion,
      generatedAt: bundle.generatedAt,
      ...optionalFields({
        apiBase: bundle.apiBase,
      }),
      endpoints: recordsEndpointSummary(),
      fixture: {
        path: fixture.displayPath,
      },
      filters: optionalFields({
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
    if (error instanceof McpApprovalEvidenceRecordsReplayError) {
      return jsonFailure(error.exitCode, error.code, error.message, error.details);
    }

    return jsonFailure(
      1,
      "mcp_approval_evidence_records_replay_error",
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function isMcpApprovalEvidenceRecordsReplayCommand(argv: readonly string[]): boolean {
  return isMcpApprovalEvidenceRecordsReplayParsedCommand(parseArgv(argv));
}

export async function loadMcpApprovalEvidenceRecordsRequests(
  fixturePath: string,
  cwd: string = process.cwd(),
): Promise<readonly McpApprovalEvidenceRecordsReplayRequest[]> {
  const fixture = await resolveFixturePath(fixturePath, cwd);
  const bundle = parseFixtureBundle(await readFixtureJson(fixture));
  return Object.freeze(
    bundle.requests.map((request) =>
      deepFreeze({
        method: request.method,
        path: request.path,
        ...(request.headers === undefined ? {} : { headers: request.headers }),
        ...(request.actorId === undefined ? {} : { actorId: request.actorId }),
        ...(request.body === undefined ? {} : { body: cloneJson(request.body) }),
      }),
    ),
  );
}

export function createMcpApprovalEvidenceRecordsDispatcher(): McpApprovalEvidenceRecordsDispatcher {
  const records = new Map<string, Record<string, unknown>>();

  return async (request) => {
    const method = normalizeMethod(request.method);
    const routePath = normalizeRoutePath(request.path);
    const endpoint = parseRecordsEndpoint(method, routePath);

    if (endpoint === undefined) {
      return apiJsonError(
        404,
        "MCP_APPROVAL_EVIDENCE_RECORDS_ROUTE_NOT_FOUND",
        `No MCP approval evidence records route found for ${method} ${routePath}.`,
      );
    }

    try {
      if (endpoint.kind === "create") {
        const record = readCreateRecordBody(request.body);
        records.set(String(record.id), cloneJson(record));
        return apiJsonResponse(201, recordBody(record));
      }

      if (endpoint.kind === "list") {
        const listedRecords = [...records.values()].map(cloneJson).sort(compareRecordsById);
        return apiJsonResponse(200, {
          kind: "mcp-approval-evidence.records.list",
          schemaVersion: "mcp-approval-evidence-records/v1",
          summary: summarizeRecords(listedRecords),
          records: listedRecords,
        });
      }

      if (endpoint.kind === "get") {
        const record = records.get(endpoint.recordId ?? "");
        if (record === undefined) {
          return apiJsonError(
            404,
            "MCP_APPROVAL_EVIDENCE_RECORD_NOT_FOUND",
            `MCP approval evidence record was not found: ${endpoint.recordId ?? ""}.`,
          );
        }
        return apiJsonResponse(200, recordBody(record));
      }

      const comparison = readCompareRecordBody(request.body);
      const differences = diffJson(comparison.leftRecord, comparison.rightRecord);
      return apiJsonResponse(200, {
        kind: "mcp-approval-evidence.records.compare",
        schemaVersion: "mcp-approval-evidence-record-compare/v1",
        matches: differences.length === 0,
        summary: {
          differenceCount: differences.length,
        },
        differences,
      });
    } catch (error) {
      if (error instanceof McpApprovalEvidenceRecordsApiError) {
        return apiJsonError(error.status, error.code, error.message, error.details);
      }

      return apiJsonError(
        500,
        "MCP_APPROVAL_EVIDENCE_RECORDS_REPLAY_ERROR",
        error instanceof Error ? error.message : String(error),
      );
    }
  };
}

async function replayRequests(
  requests: readonly McpApprovalEvidenceRecordsFixtureRequest[],
  dispatch: McpApprovalEvidenceRecordsDispatcher,
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
    const expectationMatches =
      request.expectedChecks === undefined ? undefined : expectationIssues.length === 0;

    replayed.push({
      fixture: request,
      actualStatus: response.status,
      actualHeaders: response.headers,
      actualBody: response.body,
      statusMatches: response.status === request.expectedStatus,
      ...(bodyMatches === undefined ? {} : { bodyMatches }),
      ...(expectationMatches === undefined ? {} : { expectationMatches }),
      expectationIssues,
    });
  }

  return replayed;
}

async function dispatchSafely(
  dispatch: McpApprovalEvidenceRecordsDispatcher,
  request: McpApprovalEvidenceRecordsReplayRequest,
): Promise<McpApprovalEvidenceRecordsReplayResponse> {
  try {
    return await dispatch(request);
  } catch (error) {
    return apiJsonError(
      500,
      "MCP_APPROVAL_EVIDENCE_RECORDS_DISPATCH_ERROR",
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

function formatReplayedRequest(request: ReplayedRequest): Record<string, unknown> {
  const redactor = createRedactor();
  const value = optionalFields({
    id: request.fixture.id,
    title: request.fixture.title,
    endpoint: request.fixture.endpointKind,
    method: request.fixture.method,
    path: request.fixture.path,
    recordId: request.fixture.recordId,
    request: optionalFields({
      headers: request.fixture.headers === undefined
        ? undefined
        : redactor.redact(request.fixture.headers, "$.request.headers"),
      body: request.fixture.body === undefined
        ? undefined
        : redactor.redact(request.fixture.body, "$.request.body"),
    }),
    expected: optionalFields({
      status: request.fixture.expectedStatus,
      body: request.fixture.expectedBody === undefined
        ? undefined
        : redactor.redact(request.fixture.expectedBody, "$.expected.body"),
      checks: request.fixture.expectedChecks === undefined
        ? undefined
        : redactor.redact(request.fixture.expectedChecks, "$.expected.checks"),
    }),
    actual: {
      status: request.actualStatus,
      headers: request.actualHeaders,
      body: redactor.redact(request.actualBody, "$.actual.body"),
    },
    matches: optionalFields({
      status: request.statusMatches,
      body: request.bodyMatches,
      expectation: request.expectationMatches,
    }),
    expectationIssues:
      request.expectationIssues.length === 0 ? undefined : request.expectationIssues,
    redactions: redactor.redactions.length === 0 ? undefined : redactor.redactions,
  });

  return value;
}

function expectationMismatchIssues(
  response: McpApprovalEvidenceRecordsReplayResponse,
  expected: Readonly<Record<string, unknown>> | undefined,
): readonly string[] {
  if (expected === undefined) {
    return [];
  }

  const issues: string[] = [];
  const body = isRecord(response.body) ? response.body : {};
  const summary = isRecord(body.summary) ? body.summary : {};
  const record = isRecord(body.record) ? body.record : {};
  const error = isRecord(body.error) ? body.error : {};

  if (
    typeof expected.contentType === "string" &&
    !String(response.headers["content-type"] ?? "")
      .toLowerCase()
      .startsWith(expected.contentType.toLowerCase())
  ) {
    issues.push("contentType");
  }
  if (expected.kind !== undefined && body.kind !== expected.kind) {
    issues.push("kind");
  }
  if (expected.schemaVersion !== undefined && body.schemaVersion !== expected.schemaVersion) {
    issues.push("schemaVersion");
  }
  if (expected.recordId !== undefined && record.id !== expected.recordId) {
    issues.push("recordId");
  }
  if (
    expected.recordCount !== undefined &&
    summary.recordCount !== expected.recordCount
  ) {
    issues.push("recordCount");
  }
  if (expected.statuses !== undefined && !jsonEquals(summary.statuses, expected.statuses)) {
    issues.push("statuses");
  }
  if (expected.matches !== undefined && body.matches !== expected.matches) {
    issues.push("matches");
  }
  if (
    expected.differenceCount !== undefined &&
    summary.differenceCount !== expected.differenceCount
  ) {
    issues.push("differenceCount");
  }
  if (expected.errorCode !== undefined && error.code !== expected.errorCode) {
    issues.push("errorCode");
  }

  return issues;
}

async function resolveFixturePath(
  value: string,
  cwd: string,
): Promise<ResolvedFixturePath> {
  const input = value.trim();
  if (input.length === 0) {
    throw usageError("Option --fixture requires a non-empty path.");
  }
  if (input.includes("\0")) {
    throw usageError("Option --fixture must not contain null bytes.");
  }
  if (/^[A-Za-z][A-Za-z\d+.-]*:\/\//.test(input)) {
    throw usageError("Option --fixture must be a local file path, not a URL.");
  }

  const cwdPath = path.resolve(cwd);
  const requestedPath = path.resolve(cwdPath, input);
  assertNotPlanPackPath(requestedPath);
  const workspaceRoot =
    findWorkspaceRoot(cwdPath) ?? findWorkspaceRoot(path.dirname(requestedPath));
  if (workspaceRoot === undefined) {
    throw usageError("Could not locate the SovereignOps workspace root for --fixture.");
  }

  assertPathInsideWorkspace(workspaceRoot, requestedPath);
  assertNotPrivatePath(workspaceRoot, requestedPath);
  if (path.extname(requestedPath) !== ".json") {
    throw usageError("Option --fixture must point to a .json file.");
  }

  let fileStat: Awaited<ReturnType<typeof stat>>;
  try {
    fileStat = await stat(requestedPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new McpApprovalEvidenceRecordsReplayError({
        exitCode: 2,
        code: "fixture_not_found",
        message: "Fixture file was not found.",
        details: {
          path: displayPath(workspaceRoot, requestedPath),
        },
      });
    }

    throw new McpApprovalEvidenceRecordsReplayError({
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
    throw new McpApprovalEvidenceRecordsReplayError({
      exitCode: 2,
      code: "fixture_not_file",
      message: "Fixture path must point to a file.",
      details: {
        path: displayPath(workspaceRoot, requestedPath),
      },
    });
  }

  const actualPath = await realpath(requestedPath);
  assertNotPlanPackPath(actualPath);
  assertPathInsideWorkspace(workspaceRoot, actualPath);
  assertNotPrivatePath(workspaceRoot, actualPath);

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
    throw new McpApprovalEvidenceRecordsReplayError({
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
    throw new McpApprovalEvidenceRecordsReplayError({
      exitCode: 2,
      code: "invalid_fixture_json",
      message: "Fixture file must contain valid JSON.",
      details: {
        path: fixture.displayPath,
      },
    });
  }
}

function parseFixtureBundle(value: unknown): McpApprovalEvidenceRecordsFixtureBundle {
  if (!isRecord(value)) {
    throw invalidFixture("fixture root must be a JSON object.");
  }
  if (value.schemaVersion !== "mcp-approval-evidence-records-requests.v1") {
    throw invalidFixture(
      'fixture.schemaVersion must be "mcp-approval-evidence-records-requests.v1".',
    );
  }
  if (typeof value.generatedAt !== "string" || value.generatedAt.trim().length === 0) {
    throw invalidFixture("fixture.generatedAt must be a non-empty string.");
  }
  if (!Array.isArray(value.requests)) {
    throw invalidFixture("fixture.requests must be an array.");
  }

  const apiBase = optionalNonEmptyString(value.apiBase, "fixture.apiBase");

  return {
    schemaVersion: value.schemaVersion,
    generatedAt: value.generatedAt,
    ...(apiBase === undefined ? {} : { apiBase }),
    requests: value.requests.map((request, index) => parseFixtureRequest(request, index)),
  };
}

function parseFixtureRequest(
  value: unknown,
  index: number,
): McpApprovalEvidenceRecordsFixtureRequest {
  const prefix = `fixture.requests[${index}]`;
  if (!isRecord(value)) {
    throw invalidFixture(`${prefix} must be an object.`);
  }

  const id = nonEmptyString(value.id, `${prefix}.id`);
  const title = optionalNonEmptyString(value.title, `${prefix}.title`);
  const route = requiredRecord(value.route, `${prefix}.route`);
  const request = requiredRecord(value.request, `${prefix}.request`);
  const responseField = Object.hasOwn(value, "response") ? value.response : value.expect;
  const responseLabel = Object.hasOwn(value, "response") ? "response" : "expect";
  const response = requiredRecord(responseField, `${prefix}.${responseLabel}`);

  const method = normalizeMethod(nonEmptyString(route.method, `${prefix}.route.method`));
  const routePathInput = nonEmptyString(route.path, `${prefix}.route.path`);
  if (!routePathInput.startsWith("/")) {
    throw invalidFixture(`${prefix}.route.path must start with "/".`);
  }
  const routePath = normalizeRoutePath(routePathInput);
  const endpoint = parseRecordsEndpoint(method, routePath);
  if (endpoint === undefined) {
    throw invalidFixture(`${prefix}.route must target one of: ${formatAllowedEndpoints()}.`);
  }

  const status = response.status;
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    throw invalidFixture(`${prefix}.${responseLabel}.status must be an HTTP status code.`);
  }

  const hasBody = Object.hasOwn(request, "body");
  if ((endpoint.kind === "create" || endpoint.kind === "compare") && !hasBody) {
    throw invalidFixture(`${prefix}.request.body is required for ${endpoint.kind} records requests.`);
  }
  if (hasBody) {
    validateRequestBody(endpoint.kind, request.body, `${prefix}.request.body`);
  }

  const headers = optionalHeaders(request.headers, `${prefix}.request.headers`);
  const actorId = optionalNonEmptyString(request.actorId, `${prefix}.request.actorId`);

  return {
    id,
    ...(title === undefined ? {} : { title }),
    endpointKind: endpoint.kind,
    method,
    path: routePath,
    ...(endpoint.recordId === undefined ? {} : { recordId: endpoint.recordId }),
    ...(headers === undefined ? {} : { headers }),
    ...(actorId === undefined ? {} : { actorId }),
    ...(hasBody ? { body: cloneJson(request.body) } : {}),
    expectedStatus: status,
    ...(Object.hasOwn(response, "body")
      ? { expectedBody: cloneJson(response.body) }
      : {}),
    ...(Object.hasOwn(value, "expect")
      ? { expectedChecks: cloneJson(response) as Readonly<Record<string, unknown>> }
      : {}),
  };
}

function validateRequestBody(kind: RecordsEndpointKind, body: unknown, label: string): void {
  if (kind === "create") {
    const record = requiredRecord(body, label);
    validateRecordLike(requiredRecord(record.record, `${label}.record`), `${label}.record`);
    return;
  }

  if (kind === "compare") {
    const record = requiredRecord(body, label);
    validateRecordLike(
      requiredRecord(record.leftRecord, `${label}.leftRecord`),
      `${label}.leftRecord`,
    );
    validateRecordLike(
      requiredRecord(record.rightRecord, `${label}.rightRecord`),
      `${label}.rightRecord`,
    );
    return;
  }

  if (body !== undefined && !isRecord(body)) {
    throw invalidFixture(`${label} must be a JSON object when provided.`);
  }
}

function validateRecordLike(record: Record<string, unknown>, label: string): void {
  nonEmptyString(record.id, `${label}.id`);
  if (record.status !== undefined) {
    approvalStatus(record.status, `${label}.status`);
  }
  optionalTimestamp(record.createdAt, `${label}.createdAt`);
  optionalTimestamp(record.updatedAt, `${label}.updatedAt`);
  optionalTimestamp(record.expiresAt, `${label}.expiresAt`);
  if (record.request !== undefined) {
    requiredRecord(record.request, `${label}.request`);
  }
  if (record.actor !== undefined) {
    validateActor(requiredRecord(record.actor, `${label}.actor`), `${label}.actor`);
  }
  if (record.decision !== undefined) {
    validateDecision(requiredRecord(record.decision, `${label}.decision`), `${label}.decision`);
  }
  if (record.metadata !== undefined) {
    requiredRecord(record.metadata, `${label}.metadata`);
  }
}

function validateDecision(record: Record<string, unknown>, label: string): void {
  approvalTerminalStatus(record.status, `${label}.status`);
  optionalTimestamp(record.at, `${label}.at`);
  if (record.actor !== undefined) {
    validateActor(requiredRecord(record.actor, `${label}.actor`), `${label}.actor`);
  }
  if (record.metadata !== undefined) {
    requiredRecord(record.metadata, `${label}.metadata`);
  }
}

function validateActor(record: Record<string, unknown>, label: string): void {
  nonEmptyString(record.id, `${label}.id`);
  if (record.roles !== undefined) {
    if (!Array.isArray(record.roles) || record.roles.some((role) => typeof role !== "string")) {
      throw invalidFixture(`${label}.roles must be an array of strings.`);
    }
  }
  if (record.metadata !== undefined) {
    requiredRecord(record.metadata, `${label}.metadata`);
  }
}

function readCreateRecordBody(body: unknown): Record<string, unknown> {
  const record = requiredApiRecord(body, "body");
  return normalizeApiRecord(requiredApiRecord(record.record, "body.record"), "body.record");
}

function readCompareRecordBody(body: unknown): {
  readonly leftRecord: Record<string, unknown>;
  readonly rightRecord: Record<string, unknown>;
} {
  const record = requiredApiRecord(body, "body");
  return {
    leftRecord: normalizeApiRecord(
      requiredApiRecord(record.leftRecord, "body.leftRecord"),
      "body.leftRecord",
    ),
    rightRecord: normalizeApiRecord(
      requiredApiRecord(record.rightRecord, "body.rightRecord"),
      "body.rightRecord",
    ),
  };
}

function normalizeApiRecord(
  record: Record<string, unknown>,
  label: string,
): Record<string, unknown> {
  const id = nonEmptyApiString(record.id, `${label}.id`);
  if (record.status !== undefined) {
    apiApprovalStatus(record.status, `${label}.status`);
  }
  optionalApiTimestamp(record.createdAt, `${label}.createdAt`);
  optionalApiTimestamp(record.updatedAt, `${label}.updatedAt`);
  optionalApiTimestamp(record.expiresAt, `${label}.expiresAt`);
  if (record.request !== undefined) {
    requiredApiRecord(record.request, `${label}.request`);
  }
  if (record.actor !== undefined) {
    normalizeApiActor(requiredApiRecord(record.actor, `${label}.actor`), `${label}.actor`);
  }
  if (record.decision !== undefined) {
    normalizeApiDecision(requiredApiRecord(record.decision, `${label}.decision`), `${label}.decision`);
  }
  if (record.metadata !== undefined) {
    requiredApiRecord(record.metadata, `${label}.metadata`);
  }

  return optionalFields({
    ...cloneJson(record),
    id,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : DEFAULT_TIMESTAMP,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : DEFAULT_TIMESTAMP,
  });
}

function normalizeApiDecision(record: Record<string, unknown>, label: string): void {
  apiApprovalTerminalStatus(record.status, `${label}.status`);
  optionalApiTimestamp(record.at, `${label}.at`);
  if (record.actor !== undefined) {
    normalizeApiActor(requiredApiRecord(record.actor, `${label}.actor`), `${label}.actor`);
  }
  if (record.metadata !== undefined) {
    requiredApiRecord(record.metadata, `${label}.metadata`);
  }
}

function normalizeApiActor(record: Record<string, unknown>, label: string): void {
  nonEmptyApiString(record.id, `${label}.id`);
  if (record.roles !== undefined) {
    if (!Array.isArray(record.roles) || record.roles.some((role) => typeof role !== "string")) {
      throw apiInvalid(`${label}.roles must be an array of strings.`);
    }
  }
  if (record.metadata !== undefined) {
    requiredApiRecord(record.metadata, `${label}.metadata`);
  }
}

function parseRecordsEndpoint(method: string, routePath: string): RecordsEndpoint | undefined {
  if (method === "POST" && routePath === RECORDS_ROUTE) {
    return { kind: "create", method, path: routePath };
  }
  if (method === "GET" && routePath === RECORDS_ROUTE) {
    return { kind: "list", method, path: routePath };
  }
  if (method === "POST" && routePath === COMPARE_ROUTE) {
    return { kind: "compare", method, path: routePath };
  }
  if (method === "GET" && routePath.startsWith(`${RECORDS_ROUTE}/`)) {
    const recordId = routePath.slice(RECORDS_ROUTE.length + 1);
    if (recordId.length > 0 && !recordId.includes("/") && recordId !== "compare") {
      return { kind: "get", method, path: routePath, recordId };
    }
  }
  return undefined;
}

function recordsEndpointSummary(): readonly Record<string, string>[] {
  return Object.freeze([
    { kind: "create", method: "POST", path: RECORDS_ROUTE },
    { kind: "list", method: "GET", path: RECORDS_ROUTE },
    { kind: "get", method: "GET", path: `${RECORDS_ROUTE}/{id}` },
    { kind: "compare", method: "POST", path: COMPARE_ROUTE },
  ]);
}

function formatAllowedEndpoints(): string {
  return recordsEndpointSummary()
    .map((endpoint) => `${endpoint.method} ${endpoint.path}`)
    .join(", ");
}

function recordBody(record: Record<string, unknown>): Record<string, unknown> {
  return {
    kind: "mcp-approval-evidence.record",
    schemaVersion: "mcp-approval-evidence-record/v1",
    record: cloneJson(record),
  };
}

function summarizeRecords(records: readonly Record<string, unknown>[]): Record<string, unknown> {
  const statuses = new Map<string, number>();
  for (const record of records) {
    increment(statuses, typeof record.status === "string" ? record.status : "unspecified");
  }

  return {
    recordCount: records.length,
    statuses: sortedRecord(statuses),
  };
}

function compareRecordsById(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): number {
  return compareStrings(String(left.id ?? ""), String(right.id ?? ""));
}

function diffJson(left: unknown, right: unknown): readonly JsonDifference[] {
  const differences: JsonDifference[] = [];
  collectDifferences(left, right, "$", differences);
  return differences;
}

function collectDifferences(
  left: unknown,
  right: unknown,
  valuePath: string,
  differences: JsonDifference[],
): void {
  if (jsonEquals(left, right)) {
    return;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    const maxLength = Math.max(left.length, right.length);
    for (let index = 0; index < maxLength; index += 1) {
      collectDifferences(left[index], right[index], `${valuePath}[${index}]`, differences);
    }
    return;
  }

  if (isRecord(left) && isRecord(right)) {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort(compareStrings);
    for (const key of keys) {
      collectDifferences(left[key], right[key], `${valuePath}.${key}`, differences);
    }
    return;
  }

  differences.push(optionalFields({
    path: valuePath,
    left: cloneJson(left),
    right: cloneJson(right),
  }));
}

function summarizeReplay(replayed: readonly ReplayedRequest[]): Record<string, unknown> {
  const endpoints = new Map<string, number>();
  const methods = new Map<string, number>();
  const routes = new Map<string, number>();
  const expectedStatuses = new Map<string, number>();
  const actualStatuses = new Map<string, number>();
  const mismatches = new Map<string, number>();

  for (const request of replayed) {
    increment(endpoints, request.fixture.endpointKind);
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
  }

  return {
    endpoints: sortedRecord(endpoints),
    methods: sortedRecord(methods),
    routes: sortedRecord(routes),
    expectedStatuses: sortedRecord(expectedStatuses),
    actualStatuses: sortedRecord(actualStatuses),
    mismatches: sortedRecord(mismatches),
  };
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

function assertPathInsideWorkspace(workspaceRoot: string, candidatePath: string): void {
  const relativePath = path.relative(workspaceRoot, candidatePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw usageError("Option --fixture must stay inside the SovereignOps workspace.");
  }
}

function assertNotPrivatePath(workspaceRoot: string, candidatePath: string): void {
  const segments = path.relative(workspaceRoot, candidatePath).split(path.sep);
  if (segments.includes(PRIVATE_WORKSPACE_SEGMENT)) {
    throw usageError("Option --fixture must not reference private workspace files.");
  }
}

function assertNotPlanPackPath(candidatePath: string): void {
  const segments = candidatePath
    .split(/[\\/]+/)
    .map((segment) => segment.toLowerCase())
    .filter((segment) => segment.length > 0);
  if (segments.some((segment) => PLAN_PACK_SEGMENTS.has(segment))) {
    throw usageError("Option --fixture must not reference plan-pack paths.");
  }
}

function displayPath(workspaceRoot: string, candidatePath: string): string {
  return path.relative(workspaceRoot, candidatePath).split(path.sep).join("/");
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
    headers[key] = headerValue;
  }
  return Object.freeze(headers);
}

function normalizeMethod(method: string): string {
  const normalized = method.toUpperCase();
  if (!/^[A-Z]+$/.test(normalized)) {
    throw invalidFixture("route.method must be an HTTP method token.");
  }
  return normalized;
}

function normalizeRoutePath(routePath: string): string {
  if (typeof routePath !== "string" || routePath.trim().length === 0) {
    throw invalidFixture("route.path must be a non-empty string.");
  }

  const withoutSuffix = routePath.trim().split("?")[0].split("#")[0];
  const withSlash = withoutSuffix.startsWith("/") ? withoutSuffix : `/${withoutSuffix}`;
  const collapsed = withSlash.replace(/\/+/g, "/");
  return collapsed.length > 1 && collapsed.endsWith("/")
    ? collapsed.slice(0, -1)
    : collapsed;
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

function isMcpApprovalEvidenceRecordsReplayParsedCommand(parsed: ParsedArgv): boolean {
  return mcpApprovalEvidenceRecordsReplayCommandLength(parsed.positionals) > 0;
}

function mcpApprovalEvidenceRecordsReplayCommandLength(
  positionals: readonly string[],
): number {
  if (
    positionals[0] === "mcp" &&
    positionals[1] === "approval" &&
    positionals[2] === "evidence" &&
    positionals[3] === "records" &&
    positionals[4] === "replay"
  ) {
    return 5;
  }
  if (
    positionals[0] === "mcp" &&
    positionals[1] === "approval-evidence" &&
    positionals[2] === "records" &&
    positionals[3] === "replay"
  ) {
    return 4;
  }
  if (
    positionals[0] === "mcp" &&
    positionals[1] === "approval-evidence-records" &&
    positionals[2] === "replay"
  ) {
    return 3;
  }
  if (
    positionals[0] === "mcp-approval-evidence" &&
    positionals[1] === "records" &&
    positionals[2] === "replay"
  ) {
    return 3;
  }
  if (positionals[0] === "mcp-approval-evidence-records" && positionals[1] === "replay") {
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

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw invalidFixture(`${label} must be an object.`);
  }
  return value;
}

function requiredApiRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw apiInvalid(`${label} must be a JSON object.`);
  }
  return value;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw invalidFixture(`${label} must be a non-empty string.`);
  }
  return value;
}

function nonEmptyApiString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw apiInvalid(`${label} must be a non-empty string.`);
  }
  return value;
}

function optionalNonEmptyString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    throw invalidFixture(`${label} must be a non-empty string.`);
  }
  return value;
}

function optionalTimestamp(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const timestamp = nonEmptyString(value, label);
  if (Number.isNaN(Date.parse(timestamp))) {
    throw invalidFixture(`${label} must be an ISO timestamp.`);
  }
  return timestamp;
}

function optionalApiTimestamp(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const timestamp = nonEmptyApiString(value, label);
  if (Number.isNaN(Date.parse(timestamp))) {
    throw apiInvalid(`${label} must be an ISO timestamp.`);
  }
  return timestamp;
}

function approvalStatus(value: unknown, label: string): ApprovalRecordStatus {
  if (value === "pending" || value === "approved" || value === "rejected" || value === "expired") {
    return value;
  }
  throw invalidFixture(`${label} must be pending, approved, rejected, or expired.`);
}

function apiApprovalStatus(value: unknown, label: string): ApprovalRecordStatus {
  if (value === "pending" || value === "approved" || value === "rejected" || value === "expired") {
    return value;
  }
  throw apiInvalid(`${label} must be pending, approved, rejected, or expired.`);
}

function approvalTerminalStatus(value: unknown, label: string): Exclude<ApprovalRecordStatus, "pending"> {
  if (value === "approved" || value === "rejected" || value === "expired") {
    return value;
  }
  throw invalidFixture(`${label} must be approved, rejected, or expired.`);
}

function apiApprovalTerminalStatus(
  value: unknown,
  label: string,
): Exclude<ApprovalRecordStatus, "pending"> {
  if (value === "approved" || value === "rejected" || value === "expired") {
    return value;
  }
  throw apiInvalid(`${label} must be approved, rejected, or expired.`);
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
              redactions.push({ path: nestedPath, reason: "sensitive key" });
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
    for (const pattern of SENSITIVE_TEXT_PATTERNS) {
      if (!pattern.test(redacted)) {
        pattern.lastIndex = 0;
        continue;
      }
      pattern.lastIndex = 0;
      redactions.push({ path: valuePath, reason: "secret-like value" });
      redacted = redacted.replace(pattern, (match, prefix) =>
        typeof prefix === "string" ? `${prefix}[REDACTED]` : "[REDACTED]",
      );
      pattern.lastIndex = 0;
    }
    return redacted;
  }
}

function apiJsonResponse(
  status: number,
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
): McpApprovalEvidenceRecordsReplayResponse {
  return {
    status,
    headers: Object.freeze({
      "content-type": "application/json; charset=utf-8",
      ...headers,
    }),
    body: cloneJson(body),
  };
}

function apiJsonError(
  status: number,
  code: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): McpApprovalEvidenceRecordsReplayResponse {
  return apiJsonResponse(status, {
    error: optionalFields({
      code,
      message,
      details,
    }),
  });
}

function jsonSuccess(value: unknown): McpApprovalEvidenceRecordsReplayCliResult {
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
): McpApprovalEvidenceRecordsReplayCliResult {
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

function usageError(message: string): McpApprovalEvidenceRecordsReplayError {
  return new McpApprovalEvidenceRecordsReplayError({
    exitCode: 2,
    code: "usage_error",
    message,
  });
}

function invalidFixture(message: string): McpApprovalEvidenceRecordsReplayError {
  return new McpApprovalEvidenceRecordsReplayError({
    exitCode: 2,
    code: "invalid_fixture",
    message,
  });
}

function apiInvalid(message: string): McpApprovalEvidenceRecordsApiError {
  return new McpApprovalEvidenceRecordsApiError({
    status: 400,
    code: "INVALID_MCP_APPROVAL_EVIDENCE_RECORDS_REQUEST",
    message,
  });
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortedRecord(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries([...map.entries()].sort(([left], [right]) =>
    compareStrings(left, right),
  ));
}

function cloneJson<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    value.forEach(deepFreeze);
    return Object.freeze(value) as T;
  }
  if (isRecord(value)) {
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value) as T;
  }
  return value;
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

class McpApprovalEvidenceRecordsReplayError extends Error {
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
    this.name = "McpApprovalEvidenceRecordsReplayError";
    this.exitCode = options.exitCode;
    this.code = options.code;
    this.details = options.details;
  }
}

class McpApprovalEvidenceRecordsApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(options: {
    readonly status: number;
    readonly code: string;
    readonly message: string;
    readonly details?: Record<string, unknown>;
  }) {
    super(options.message);
    this.name = "McpApprovalEvidenceRecordsApiError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}
