import { existsSync, readFileSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

import {
  createAuditReplayEntries,
  type ApprovalActorLike,
  type ApprovalDecisionLike,
  type ApprovalSessionSnapshotLike,
} from "../../../services/mcp-gateway/src/auditReplay.ts";

export interface McpApprovalEvidenceReplayCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface McpApprovalEvidenceReplayRunOptions {
  readonly cwd?: string;
  readonly dispatch?: McpApprovalEvidencePreviewDispatcher;
}

export interface McpApprovalEvidenceReplayRequest {
  readonly method: string;
  readonly path: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly actorId?: string;
  readonly body: unknown;
}

export interface McpApprovalEvidenceReplayResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

export type McpApprovalEvidencePreviewDispatcher = (
  request: McpApprovalEvidenceReplayRequest,
) => McpApprovalEvidenceReplayResponse | Promise<McpApprovalEvidenceReplayResponse>;

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

interface McpApprovalEvidenceFixtureBundle {
  readonly schemaVersion: "mcp-approval-evidence-preview-requests.v1";
  readonly generatedAt: string;
  readonly apiBase?: string;
  readonly requests: readonly McpApprovalEvidenceFixtureRequest[];
}

interface McpApprovalEvidenceFixtureRequest {
  readonly id: string;
  readonly title?: string;
  readonly method: string;
  readonly path: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly actorId?: string;
  readonly body: unknown;
  readonly expectedStatus: number;
  readonly expectedBody?: unknown;
  readonly expectedChecks?: Readonly<Record<string, unknown>>;
}

interface ReplayedRequest {
  readonly fixture: McpApprovalEvidenceFixtureRequest;
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

const HELP_TEXT = {
  usage: [
    "sovereignops mcp approval evidence replay --fixture <path> [--id <id>]",
    "sovereignops mcp approval-evidence replay --fixture <path> [--id <id>]",
    "sovereignops mcp-approval-evidence replay --fixture <path> [--id <id>]",
  ],
  options: {
    fixture: "Local MCP approval evidence preview request fixture JSON path inside this workspace.",
    id: "Optional exact request id filter, for example api_mcp_approval_evidence_preview_pending.",
  },
};

const BOOLEAN_FLAGS = new Set(["help", "h"]);
const ALLOWED_FLAGS = new Set(["fixture", "help", "h", "id"]);
const PREVIEW_ROUTE = "/v1/mcp/approval-evidence/preview";
const PREVIEW_METHOD = "POST";
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

export async function runMcpApprovalEvidenceReplayCli(
  argv: readonly string[] = [],
  options: McpApprovalEvidenceReplayRunOptions = {},
): Promise<McpApprovalEvidenceReplayCliResult | undefined> {
  const parsed = parseArgv(argv);
  if (!isMcpApprovalEvidenceReplayParsedCommand(parsed)) {
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
      kind: "mcp-approval-evidence-replay.help",
      ...HELP_TEXT,
    });
  }

  const commandLength = mcpApprovalEvidenceReplayCommandLength(parsed.positionals);
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
      options.dispatch ?? createMcpApprovalEvidencePreviewDispatcher(),
    );
    const failedRequests = replayed.filter((request) => !replaySucceeded(request)).length;

    return jsonSuccess({
      kind: "mcp-approval-evidence-preview-replay",
      schemaVersion: bundle.schemaVersion,
      generatedAt: bundle.generatedAt,
      ...optionalFields({
        apiBase: bundle.apiBase,
      }),
      endpoint: {
        method: PREVIEW_METHOD,
        path: PREVIEW_ROUTE,
      },
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
    if (error instanceof McpApprovalEvidenceReplayError) {
      return jsonFailure(error.exitCode, error.code, error.message, error.details);
    }

    return jsonFailure(
      1,
      "mcp_approval_evidence_replay_error",
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function isMcpApprovalEvidenceReplayCommand(argv: readonly string[]): boolean {
  return isMcpApprovalEvidenceReplayParsedCommand(parseArgv(argv));
}

export async function loadMcpApprovalEvidenceRequests(
  fixturePath: string,
  cwd: string = process.cwd(),
): Promise<readonly McpApprovalEvidenceReplayRequest[]> {
  const fixture = await resolveFixturePath(fixturePath, cwd);
  const bundle = parseFixtureBundle(await readFixtureJson(fixture));
  return Object.freeze(
    bundle.requests.map((request) =>
      deepFreeze({
        method: request.method,
        path: request.path,
        ...(request.headers === undefined ? {} : { headers: request.headers }),
        ...(request.actorId === undefined ? {} : { actorId: request.actorId }),
        body: cloneJson(request.body),
      }),
    ),
  );
}

export function createMcpApprovalEvidencePreviewDispatcher(): McpApprovalEvidencePreviewDispatcher {
  return async (request) => {
    const method = normalizeMethod(request.method);
    const routePath = normalizeRoutePath(request.path);

    if (method !== PREVIEW_METHOD || routePath !== PREVIEW_ROUTE) {
      return apiJsonError(
        404,
        "MCP_APPROVAL_EVIDENCE_ROUTE_NOT_FOUND",
        `No MCP approval evidence preview route found for ${method} ${routePath}.`,
      );
    }

    try {
      return apiJsonResponse(200, createMcpApprovalEvidencePreview(request.body));
    } catch (error) {
      if (error instanceof McpApprovalEvidencePreviewError) {
        return apiJsonError(error.status, error.code, error.message, error.details);
      }

      return apiJsonError(
        500,
        "MCP_APPROVAL_EVIDENCE_PREVIEW_ERROR",
        error instanceof Error ? error.message : String(error),
      );
    }
  };
}

export function createMcpApprovalEvidencePreview(body: unknown): Record<string, unknown> {
  const request = requiredPreviewBody(body);
  const approvalSessions = readApprovalSessions(request);
  const entries = createAuditReplayEntries({ approvalSessions });
  const statusCounts = new Map<string, number>();
  for (const session of approvalSessions) {
    increment(statusCounts, session.status);
  }

  const redactionCounter = createRedactor();
  redactionCounter.redact(approvalSessions, "$.approvalSessions");

  return optionalFields({
    kind: "mcp-approval-evidence.preview",
    schemaVersion: "mcp-approval-evidence-preview/v1",
    generatedAt: optionalTimestamp(request.generatedAt, "body.generatedAt"),
    summary: {
      approvalSessionCount: approvalSessions.length,
      entryCount: entries.length,
      redactionCount: redactionCounter.redactions.length,
      statuses: sortedRecord(statusCounts),
    },
    entries,
  });
}

async function replayRequests(
  requests: readonly McpApprovalEvidenceFixtureRequest[],
  dispatch: McpApprovalEvidencePreviewDispatcher,
): Promise<readonly ReplayedRequest[]> {
  const replayed: ReplayedRequest[] = [];

  for (const request of requests) {
    const response = await dispatchSafely(dispatch, {
      method: request.method,
      path: request.path,
      ...(request.headers === undefined ? {} : { headers: request.headers }),
      ...(request.actorId === undefined ? {} : { actorId: request.actorId }),
      body: cloneJson(request.body),
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
  dispatch: McpApprovalEvidencePreviewDispatcher,
  request: McpApprovalEvidenceReplayRequest,
): Promise<McpApprovalEvidenceReplayResponse> {
  try {
    return await dispatch(request);
  } catch (error) {
    return apiJsonError(
      500,
      "MCP_APPROVAL_EVIDENCE_DISPATCH_ERROR",
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
    method: request.fixture.method,
    path: request.fixture.path,
    request: optionalFields({
      headers: request.fixture.headers === undefined
        ? undefined
        : redactor.redact(request.fixture.headers, "$.request.headers"),
      body: redactor.redact(request.fixture.body, "$.request.body"),
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
  response: McpApprovalEvidenceReplayResponse,
  expected: Readonly<Record<string, unknown>> | undefined,
): readonly string[] {
  if (expected === undefined) {
    return [];
  }

  const issues: string[] = [];
  const body = isRecord(response.body) ? response.body : {};
  const summary = isRecord(body.summary) ? body.summary : {};
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
  if (
    expected.approvalSessionCount !== undefined &&
    summary.approvalSessionCount !== expected.approvalSessionCount
  ) {
    issues.push("approvalSessionCount");
  }
  if (expected.entryCount !== undefined && summary.entryCount !== expected.entryCount) {
    issues.push("entryCount");
  }
  if (expected.redactionCount !== undefined && summary.redactionCount !== expected.redactionCount) {
    issues.push("redactionCount");
  }
  if (expected.statuses !== undefined && !jsonEquals(summary.statuses, expected.statuses)) {
    issues.push("statuses");
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
      throw new McpApprovalEvidenceReplayError({
        exitCode: 2,
        code: "fixture_not_found",
        message: "Fixture file was not found.",
        details: {
          path: displayPath(workspaceRoot, requestedPath),
        },
      });
    }

    throw new McpApprovalEvidenceReplayError({
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
    throw new McpApprovalEvidenceReplayError({
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
    throw new McpApprovalEvidenceReplayError({
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
    throw new McpApprovalEvidenceReplayError({
      exitCode: 2,
      code: "invalid_fixture_json",
      message: "Fixture file must contain valid JSON.",
      details: {
        path: fixture.displayPath,
      },
    });
  }
}

function parseFixtureBundle(value: unknown): McpApprovalEvidenceFixtureBundle {
  if (!isRecord(value)) {
    throw invalidFixture("fixture root must be a JSON object.");
  }
  if (value.schemaVersion !== "mcp-approval-evidence-preview-requests.v1") {
    throw invalidFixture(
      'fixture.schemaVersion must be "mcp-approval-evidence-preview-requests.v1".',
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

function parseFixtureRequest(value: unknown, index: number): McpApprovalEvidenceFixtureRequest {
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

  if (!Object.hasOwn(request, "body")) {
    throw invalidFixture(`${prefix}.request.body is required.`);
  }

  const method = normalizeMethod(nonEmptyString(route.method, `${prefix}.route.method`));
  const routePathInput = nonEmptyString(route.path, `${prefix}.route.path`);
  if (!routePathInput.startsWith("/")) {
    throw invalidFixture(`${prefix}.route.path must start with "/".`);
  }
  const routePath = normalizeRoutePath(routePathInput);
  if (method !== PREVIEW_METHOD || routePath !== PREVIEW_ROUTE) {
    throw invalidFixture(`${prefix}.route must target ${PREVIEW_METHOD} ${PREVIEW_ROUTE}.`);
  }

  const status = response.status;
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    throw invalidFixture(`${prefix}.${responseLabel}.status must be an HTTP status code.`);
  }

  const headers = optionalHeaders(request.headers, `${prefix}.request.headers`);
  const actorId = optionalNonEmptyString(request.actorId, `${prefix}.request.actorId`);

  return {
    id,
    ...(title === undefined ? {} : { title }),
    method,
    path: routePath,
    ...(headers === undefined ? {} : { headers }),
    ...(actorId === undefined ? {} : { actorId }),
    body: cloneJson(request.body),
    expectedStatus: status,
    ...(Object.hasOwn(response, "body")
      ? { expectedBody: cloneJson(response.body) }
      : {}),
    ...(Object.hasOwn(value, "expect")
      ? { expectedChecks: cloneJson(response) as Readonly<Record<string, unknown>> }
      : {}),
  };
}

function requiredPreviewBody(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new McpApprovalEvidencePreviewError({
      status: 400,
      code: "INVALID_MCP_APPROVAL_EVIDENCE_PREVIEW_REQUEST",
      message: "MCP approval evidence preview request body must be a JSON object.",
    });
  }
  return value;
}

function readApprovalSessions(body: Record<string, unknown>): readonly ApprovalSessionSnapshotLike[] {
  const value = body.approvalSessions ?? body.sessions;
  if (!Array.isArray(value)) {
    throw new McpApprovalEvidencePreviewError({
      status: 400,
      code: "INVALID_MCP_APPROVAL_EVIDENCE_PREVIEW_REQUEST",
      message: "MCP approval evidence preview requires body.approvalSessions as an array.",
    });
  }

  return value.map((session, index) => parseApprovalSession(session, index));
}

function parseApprovalSession(value: unknown, index: number): ApprovalSessionSnapshotLike {
  const label = `body.approvalSessions[${index}]`;
  const record = requiredPreviewRecord(value, label);
  const id = nonEmptyPreviewString(record.id, `${label}.id`);
  const status = approvalStatus(record.status, `${label}.status`);
  const request = requiredPreviewRecord(record.request, `${label}.request`);
  const createdAt = optionalTimestamp(record.createdAt, `${label}.createdAt`) ?? DEFAULT_TIMESTAMP;
  const updatedAt = optionalTimestamp(record.updatedAt, `${label}.updatedAt`) ?? createdAt;
  const decision = optionalDecision(record.decision, `${label}.decision`);

  return optionalFields({
    id,
    status,
    createdAt,
    updatedAt,
    expiresAt: optionalTimestamp(record.expiresAt, `${label}.expiresAt`),
    request: cloneJson(request),
    actor: optionalActor(record.actor, `${label}.actor`),
    reason: optionalPreviewString(record.reason, `${label}.reason`),
    ruleId: optionalPreviewString(record.ruleId, `${label}.ruleId`),
    metadata: optionalRecordClone(record.metadata, `${label}.metadata`),
    decision,
    approvedAt: optionalTimestamp(record.approvedAt, `${label}.approvedAt`),
    approvedBy: optionalActor(record.approvedBy, `${label}.approvedBy`),
    rejectedAt: optionalTimestamp(record.rejectedAt, `${label}.rejectedAt`),
    rejectedBy: optionalActor(record.rejectedBy, `${label}.rejectedBy`),
    expiredAt: optionalTimestamp(record.expiredAt, `${label}.expiredAt`),
    expiredBy: optionalActor(record.expiredBy, `${label}.expiredBy`),
  });
}

function optionalDecision(value: unknown, label: string): ApprovalDecisionLike | undefined {
  if (value === undefined) {
    return undefined;
  }

  const record = requiredPreviewRecord(value, label);
  const status = approvalTerminalStatus(record.status, `${label}.status`);
  const at = optionalTimestamp(record.at, `${label}.at`) ?? DEFAULT_TIMESTAMP;

  return optionalFields({
    status,
    at,
    actor: optionalActor(record.actor, `${label}.actor`),
    reason: optionalPreviewString(record.reason, `${label}.reason`),
    metadata: optionalRecordClone(record.metadata, `${label}.metadata`),
  });
}

function optionalActor(value: unknown, label: string): ApprovalActorLike | undefined {
  if (value === undefined) {
    return undefined;
  }

  const record = requiredPreviewRecord(value, label);
  const actor: ApprovalActorLike = {
    id: nonEmptyPreviewString(record.id, `${label}.id`),
  };

  if (record.roles !== undefined) {
    if (!Array.isArray(record.roles) || record.roles.some((role) => typeof role !== "string")) {
      throw previewInvalid(`${label}.roles must be an array of strings.`);
    }
    actor.roles = [...record.roles];
  }

  const metadata = optionalRecordClone(record.metadata, `${label}.metadata`);
  if (metadata !== undefined) {
    actor.metadata = metadata;
  }

  return actor;
}

function requiredPreviewRecord(value: unknown, label = "body"): Record<string, unknown> {
  if (!isRecord(value)) {
    throw previewInvalid(`${label} must be a JSON object.`);
  }
  return value;
}

function optionalRecordClone(value: unknown, label: string): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  return cloneJson(requiredPreviewRecord(value, label));
}

function nonEmptyPreviewString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw previewInvalid(`${label} must be a non-empty string.`);
  }
  return value;
}

function optionalPreviewString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return nonEmptyPreviewString(value, label);
}

function optionalTimestamp(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const timestamp = nonEmptyPreviewString(value, label);
  if (Number.isNaN(Date.parse(timestamp))) {
    throw previewInvalid(`${label} must be an ISO timestamp.`);
  }
  return timestamp;
}

function approvalStatus(
  value: unknown,
  label: string,
): ApprovalSessionSnapshotLike["status"] {
  if (value === "pending" || value === "approved" || value === "rejected" || value === "expired") {
    return value;
  }
  throw previewInvalid(`${label} must be pending, approved, rejected, or expired.`);
}

function approvalTerminalStatus(
  value: unknown,
  label: string,
): ApprovalDecisionLike["status"] {
  if (value === "approved" || value === "rejected" || value === "expired") {
    return value;
  }
  throw previewInvalid(`${label} must be approved, rejected, or expired.`);
}

function previewInvalid(message: string): McpApprovalEvidencePreviewError {
  return new McpApprovalEvidencePreviewError({
    status: 400,
    code: "INVALID_MCP_APPROVAL_EVIDENCE_PREVIEW_REQUEST",
    message,
  });
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
  }

  return {
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

function isMcpApprovalEvidenceReplayParsedCommand(parsed: ParsedArgv): boolean {
  return mcpApprovalEvidenceReplayCommandLength(parsed.positionals) > 0;
}

function mcpApprovalEvidenceReplayCommandLength(positionals: readonly string[]): number {
  if (
    positionals[0] === "mcp" &&
    positionals[1] === "approval" &&
    positionals[2] === "evidence" &&
    positionals[3] === "replay"
  ) {
    return 4;
  }
  if (
    positionals[0] === "mcp" &&
    positionals[1] === "approval-evidence" &&
    positionals[2] === "replay"
  ) {
    return 3;
  }
  if (positionals[0] === "mcp-approval-evidence" && positionals[1] === "replay") {
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
  if (typeof value !== "string" || value.trim().length === 0) {
    throw invalidFixture(`${label} must be a non-empty string.`);
  }
  return value;
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
): McpApprovalEvidenceReplayResponse {
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
): McpApprovalEvidenceReplayResponse {
  return apiJsonResponse(status, {
    error: optionalFields({
      code,
      message,
      details,
    }),
  });
}

function jsonSuccess(value: unknown): McpApprovalEvidenceReplayCliResult {
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
): McpApprovalEvidenceReplayCliResult {
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

function usageError(message: string): McpApprovalEvidenceReplayError {
  return new McpApprovalEvidenceReplayError({
    exitCode: 2,
    code: "usage_error",
    message,
  });
}

function invalidFixture(message: string): McpApprovalEvidenceReplayError {
  return new McpApprovalEvidenceReplayError({
    exitCode: 2,
    code: "invalid_fixture",
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

class McpApprovalEvidenceReplayError extends Error {
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
    this.name = "McpApprovalEvidenceReplayError";
    this.exitCode = options.exitCode;
    this.code = options.code;
    this.details = options.details;
  }
}

class McpApprovalEvidencePreviewError extends Error {
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
    this.name = "McpApprovalEvidencePreviewError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}
