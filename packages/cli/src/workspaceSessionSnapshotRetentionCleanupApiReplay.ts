import { existsSync, readFileSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

import {
  createWorkspaceSessionSnapshotRetentionCleanupRoutes,
  DEFAULT_WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_ROUTE_BASE_PATH,
  type WorkspaceSessionSnapshotRetentionCleanupRoutesOptions,
} from "../../../apps/api/src/workspaceSessionSnapshotRetentionCleanupRoutes.ts";
import { createApiRouter } from "../../../apps/api/src/router.ts";

export interface WorkspaceSessionSnapshotRetentionCleanupApiReplayCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface WorkspaceSessionSnapshotRetentionCleanupApiReplayRunOptions {
  readonly cwd?: string;
  readonly dispatch?: WorkspaceSessionSnapshotRetentionCleanupApiDispatcher;
}

export interface WorkspaceSessionSnapshotRetentionCleanupApiReplayRequest {
  readonly method: string;
  readonly path: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly actorId?: string;
}

export interface WorkspaceSessionSnapshotRetentionCleanupApiReplayResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

export type WorkspaceSessionSnapshotRetentionCleanupApiDispatcher = (
  request: WorkspaceSessionSnapshotRetentionCleanupApiReplayRequest,
) =>
  | WorkspaceSessionSnapshotRetentionCleanupApiReplayResponse
  | Promise<WorkspaceSessionSnapshotRetentionCleanupApiReplayResponse>;

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

export const WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_API_REQUESTS_SCHEMA_VERSION =
  "workspace-session-snapshot-retention-cleanup-api-requests/v1";
const LEGACY_WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_API_REQUESTS_SCHEMA_VERSION =
  "workspace-session-snapshot-retention-cleanup-api-requests.v1";

export interface WorkspaceSessionSnapshotRetentionCleanupApiFixtureBundle {
  readonly schemaVersion:
    typeof WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_API_REQUESTS_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly apiBase?: string;
  readonly fixtureRefs: readonly WorkspaceSessionSnapshotRetentionCleanupApiFixtureRef[];
  readonly requests: readonly WorkspaceSessionSnapshotRetentionCleanupApiFixtureRequest[];
}

export interface WorkspaceSessionSnapshotRetentionCleanupApiFixtureRef {
  readonly id: string;
  readonly fixturePath: string;
}

export interface WorkspaceSessionSnapshotRetentionCleanupApiFixtureRequest {
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
  readonly fixture: WorkspaceSessionSnapshotRetentionCleanupApiFixtureRequest;
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

const PREVIEW_ROUTE =
  `${DEFAULT_WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_ROUTE_BASE_PATH}/preview`;
const DEFAULT_WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_API_FIXTURE =
  "examples/workspace-session/snapshot-retention-cleanup-api-requests.json";
const HELP_TEXT = {
  usage: [
    "sovereignops workspace-session snapshot retention-cleanup api replay --fixture <path> [--method <method>] [--route <path>] [--id <id>]",
    "sovereignops workspace session snapshot retention-cleanup api replay --fixture <path> [--method <method>] [--route <path>] [--id <id>]",
    "sovereignops workspace-session-snapshot-retention-cleanup-api replay --fixture <path> [--method <method>] [--route <path>] [--id <id>]",
  ],
  options: {
    fixture:
      `Local workspace/session snapshot retention cleanup API request fixture bundle JSON path, for example ${DEFAULT_WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_API_FIXTURE}.`,
    method: "Optional HTTP method filter, for example POST.",
    route: `Optional exact route path filter, for example ${PREVIEW_ROUTE}.`,
    id:
      "Optional exact request id filter, for example api_workspace_session_snapshot_retention_cleanup_preview.",
  },
};

const BOOLEAN_FLAGS = new Set(["help", "h"]);
const ALLOWED_FLAGS = new Set(["fixture", "help", "h", "id", "method", "route"]);
const PRIVATE_WORKSPACE_SEGMENT = `.codex${"-private"}`;
const PLAN_PACK_SEGMENTS = new Set([
  "codex-pack",
  "plan-pack",
  "sovereignops-codex-pack",
]);
const SENSITIVE_KEY_PATTERN =
  /(^|[._-])(authorization|cookie|credential|credentials|password|passphrase|secret|api[._-]?key|api[._-]?token|private[._-]?key|access[._-]?token|refresh[._-]?token|session[._-]?token|token)([._-]|$)/i;
const BODY_PATH_KEY_PATTERN =
  /(?:^|[._-])(?:absolute[._-]?path|display[._-]?path|file[._-]?path|path|relative[._-]?path|storage[._-]?path)([._-]|$)/i;
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
];

export async function runWorkspaceSessionSnapshotRetentionCleanupApiReplayCli(
  argv: readonly string[] = [],
  options: WorkspaceSessionSnapshotRetentionCleanupApiReplayRunOptions = {},
): Promise<WorkspaceSessionSnapshotRetentionCleanupApiReplayCliResult | undefined> {
  const parsed = parseArgv(argv);
  if (!isWorkspaceSessionSnapshotRetentionCleanupApiReplayParsedCommand(parsed)) {
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
      kind: "workspace-session-snapshot-retention-cleanup-api-replay.help",
      ...HELP_TEXT,
    });
  }

  const commandLength = workspaceSessionSnapshotRetentionCleanupApiReplayCommandLength(
    parsed.positionals,
  );
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
    const fixtureRefs = await loadFixtureRefs(bundle.fixtureRefs, fixture.workspaceRoot);
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
      fixtureRefs,
      options.dispatch ?? createWorkspaceSessionSnapshotRetentionCleanupApiDispatcher(),
    );
    const failedRequests = replayed.filter((request) => !replaySucceeded(request)).length;

    return jsonSuccess({
      kind: "workspace-session-snapshot-retention-cleanup-api-fixture-replay",
      schemaVersion: bundle.schemaVersion,
      generatedAt: bundle.generatedAt,
      ...optionalFields({
        apiBase: bundle.apiBase,
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
    if (error instanceof WorkspaceSessionSnapshotRetentionCleanupApiReplayError) {
      return jsonFailure(error.exitCode, error.code, error.message, error.details);
    }

    return jsonFailure(
      1,
      "workspace_session_snapshot_retention_cleanup_api_replay_error",
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function isWorkspaceSessionSnapshotRetentionCleanupApiReplayCommand(
  argv: readonly string[],
): boolean {
  return isWorkspaceSessionSnapshotRetentionCleanupApiReplayParsedCommand(parseArgv(argv));
}

export async function loadWorkspaceSessionSnapshotRetentionCleanupApiRequests(
  fixturePath: string,
  options: Pick<WorkspaceSessionSnapshotRetentionCleanupApiReplayRunOptions, "cwd"> = {},
): Promise<readonly WorkspaceSessionSnapshotRetentionCleanupApiReplayRequest[]> {
  const fixture = await resolveFixturePath(fixturePath, options.cwd ?? process.cwd());
  const bundle = parseFixtureBundle(await readFixtureJson(fixture));
  const fixtureRefs = await loadFixtureRefs(bundle.fixtureRefs, fixture.workspaceRoot);

  return Object.freeze(
    bundle.requests.map((request) =>
      Object.freeze({
        method: request.method,
        path: request.path,
        ...(request.headers === undefined ? {} : { headers: request.headers }),
        ...(request.actorId === undefined ? {} : { actorId: request.actorId }),
        body: materializeFixtureRefs(request.body, fixtureRefs),
      }),
    ),
  );
}

export function createWorkspaceSessionSnapshotRetentionCleanupApiDispatcher(
  options: WorkspaceSessionSnapshotRetentionCleanupRoutesOptions = {},
): WorkspaceSessionSnapshotRetentionCleanupApiDispatcher {
  const router = createApiRouter(createWorkspaceSessionSnapshotRetentionCleanupRoutes(options));

  return async (request) => {
    try {
      const response = await router.dispatch(request);
      return apiJsonResponse(response.status, response.body, response.headers);
    } catch (error) {
      return apiJsonError(
        500,
        "WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_API_DISPATCH_ERROR",
        error instanceof Error ? error.message : String(error),
      );
    }
  };
}

async function replayRequests(
  requests: readonly WorkspaceSessionSnapshotRetentionCleanupApiFixtureRequest[],
  fixtureRefs: ReadonlyMap<string, unknown>,
  dispatch: WorkspaceSessionSnapshotRetentionCleanupApiDispatcher,
): Promise<readonly ReplayedRequest[]> {
  const replayed: ReplayedRequest[] = [];

  for (const request of requests) {
    const body = materializeFixtureRefs(request.body, fixtureRefs);
    const response = await dispatchSafely(dispatch, {
      method: request.method,
      path: request.path,
      ...(request.headers === undefined ? {} : { headers: request.headers }),
      ...(request.actorId === undefined ? {} : { actorId: request.actorId }),
      body,
    });
    const bodyMatches =
      request.expectedBody === undefined
        ? undefined
        : jsonEquals(response.body, request.expectedBody);
    const expectationIssues = expectationMismatchIssues(response, request.expectedChecks);
    const expectationMatches =
      request.expectedChecks === undefined ? undefined : expectationIssues.length === 0;

    replayed.push({
      fixture: {
        ...request,
        body,
      },
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
  dispatch: WorkspaceSessionSnapshotRetentionCleanupApiDispatcher,
  request: WorkspaceSessionSnapshotRetentionCleanupApiReplayRequest,
): Promise<WorkspaceSessionSnapshotRetentionCleanupApiReplayResponse> {
  try {
    return await dispatch(request);
  } catch (error) {
    return apiJsonError(
      500,
      "WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_API_DISPATCH_ERROR",
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

function materializeFixtureRefs(
  value: unknown,
  fixtureRefs: ReadonlyMap<string, unknown>,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => materializeFixtureRefs(item, fixtureRefs));
  }

  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length === 1 && typeof value.$fixtureRef === "string") {
      const fixture = fixtureRefs.get(value.$fixtureRef);
      if (fixture === undefined) {
        throw invalidFixture(`Unknown fixture reference: ${value.$fixtureRef}`);
      }
      return cloneJson(fixture);
    }

    return Object.fromEntries(
      entries.map(([key, nested]) => [key, materializeFixtureRefs(nested, fixtureRefs)]),
    );
  }

  return cloneJson(value);
}

function expectationMismatchIssues(
  response: WorkspaceSessionSnapshotRetentionCleanupApiReplayResponse,
  expected: Readonly<Record<string, unknown>> | undefined,
): readonly string[] {
  if (expected === undefined) {
    return [];
  }

  const issues: string[] = [];
  const body = isRecord(response.body) ? response.body : {};
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
  if (expected.entryCount !== undefined && body.entryCount !== expected.entryCount) {
    issues.push("entryCount");
  }
  if (expected.keepCount !== undefined && body.keepCount !== expected.keepCount) {
    issues.push("keepCount");
  }
  if (expected.deleteCount !== undefined && body.deleteCount !== expected.deleteCount) {
    issues.push("deleteCount");
  }
  if (expected.reviewCount !== undefined && body.reviewCount !== expected.reviewCount) {
    issues.push("reviewCount");
  }
  if (expected.errorCode !== undefined && error.code !== expected.errorCode) {
    issues.push("errorCode");
  }
  if (expected.body !== undefined && !jsonEquals(response.body, expected.body)) {
    issues.push("body");
  }

  return issues;
}

function formatReplayedRequest(request: ReplayedRequest): Record<string, unknown> {
  const redactor = createRedactor();
  return optionalFields({
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
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new WorkspaceSessionSnapshotRetentionCleanupApiReplayError({
        exitCode: 2,
        code: "fixture_not_found",
        message: "Fixture file was not found.",
        details: {
          path: displayPath(workspaceRoot, requestedPath),
        },
      });
    }

    throw new WorkspaceSessionSnapshotRetentionCleanupApiReplayError({
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
    throw new WorkspaceSessionSnapshotRetentionCleanupApiReplayError({
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
    throw new WorkspaceSessionSnapshotRetentionCleanupApiReplayError({
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
    throw new WorkspaceSessionSnapshotRetentionCleanupApiReplayError({
      exitCode: 2,
      code: "invalid_fixture_json",
      message: "Fixture file must contain valid JSON.",
      details: {
        path: fixture.displayPath,
      },
    });
  }
}

async function loadFixtureRefs(
  refs: readonly WorkspaceSessionSnapshotRetentionCleanupApiFixtureRef[],
  workspaceRoot: string,
): Promise<ReadonlyMap<string, unknown>> {
  const loaded = new Map<string, unknown>();

  for (const ref of refs) {
    const absolutePath = await resolveReferencedFixturePath(ref.fixturePath, workspaceRoot);
    let text: string;
    try {
      text = await readFile(absolutePath, "utf8");
    } catch (error) {
      throw new WorkspaceSessionSnapshotRetentionCleanupApiReplayError({
        exitCode: 1,
        code: "fixture_ref_read_error",
        message: "Could not read referenced fixture file.",
        details: {
          id: ref.id,
          path: displayPath(workspaceRoot, absolutePath),
          cause: error instanceof Error ? error.message : String(error),
        },
      });
    }

    try {
      loaded.set(ref.id, JSON.parse(text));
    } catch {
      throw new WorkspaceSessionSnapshotRetentionCleanupApiReplayError({
        exitCode: 2,
        code: "invalid_fixture_ref_json",
        message: "Referenced fixture file must contain valid JSON.",
        details: {
          id: ref.id,
          path: displayPath(workspaceRoot, absolutePath),
        },
      });
    }
  }

  return loaded;
}

async function resolveReferencedFixturePath(
  fixturePath: string,
  workspaceRoot: string,
): Promise<string> {
  const requestedPath = path.resolve(workspaceRoot, fixturePath);
  assertPathInsideWorkspace(workspaceRoot, requestedPath, "fixture");
  assertNotPrivatePath(workspaceRoot, requestedPath, "fixture");
  assertNotPlanPackPath(requestedPath, "fixture");

  let fileStat: Awaited<ReturnType<typeof stat>>;
  try {
    fileStat = await stat(requestedPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new WorkspaceSessionSnapshotRetentionCleanupApiReplayError({
        exitCode: 2,
        code: "fixture_ref_not_found",
        message: "Referenced fixture file was not found.",
        details: {
          path: displayPath(workspaceRoot, requestedPath),
        },
      });
    }

    throw new WorkspaceSessionSnapshotRetentionCleanupApiReplayError({
      exitCode: 1,
      code: "fixture_ref_stat_error",
      message: "Could not inspect referenced fixture file.",
      details: {
        path: displayPath(workspaceRoot, requestedPath),
        cause: error instanceof Error ? error.message : String(error),
      },
    });
  }

  if (!fileStat.isFile()) {
    throw new WorkspaceSessionSnapshotRetentionCleanupApiReplayError({
      exitCode: 2,
      code: "fixture_ref_not_file",
      message: "Referenced fixture path must point to a file.",
      details: {
        path: displayPath(workspaceRoot, requestedPath),
      },
    });
  }

  const actualPath = await realpath(requestedPath);
  assertPathInsideWorkspace(workspaceRoot, actualPath, "fixture");
  assertNotPrivatePath(workspaceRoot, actualPath, "fixture");
  assertNotPlanPackPath(actualPath, "fixture");
  return actualPath;
}

function parseFixtureBundle(
  value: unknown,
): WorkspaceSessionSnapshotRetentionCleanupApiFixtureBundle {
  if (!isRecord(value)) {
    throw invalidFixture("fixture root must be a JSON object.");
  }
  if (
    value.schemaVersion !== WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_API_REQUESTS_SCHEMA_VERSION &&
    value.schemaVersion !==
      LEGACY_WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_API_REQUESTS_SCHEMA_VERSION
  ) {
    throw invalidFixture(
      `fixture.schemaVersion must be "${WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_API_REQUESTS_SCHEMA_VERSION}".`,
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
    schemaVersion: WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_API_REQUESTS_SCHEMA_VERSION,
    generatedAt: value.generatedAt,
    ...(apiBase === undefined ? {} : { apiBase }),
    fixtureRefs: parseFixtureRefs(value.fixtureRefs),
    requests: value.requests.map((request, index) => parseFixtureRequest(request, index)),
  };
}

function parseFixtureRefs(
  value: unknown,
): readonly WorkspaceSessionSnapshotRetentionCleanupApiFixtureRef[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw invalidFixture("fixture.fixtureRefs must be an array.");
  }

  const refs = value.map((item, index) => parseFixtureRef(item, `fixture.fixtureRefs[${index}]`));
  const seen = new Set<string>();
  for (const ref of refs) {
    if (seen.has(ref.id)) {
      throw invalidFixture(`fixture reference ids must be unique: ${ref.id}`);
    }
    seen.add(ref.id);
  }
  return refs;
}

function parseFixtureRef(
  value: unknown,
  label: string,
): WorkspaceSessionSnapshotRetentionCleanupApiFixtureRef {
  const record = requiredRecord(value, label);
  const id = nonEmptyString(record.id, `${label}.id`);
  const fixturePath = safeRelativeJsonPath(record.fixturePath, `${label}.fixturePath`);

  return { id, fixturePath };
}

function parseFixtureRequest(
  value: unknown,
  index: number,
): WorkspaceSessionSnapshotRetentionCleanupApiFixtureRequest {
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

  const method = normalizeFixtureMethod(
    nonEmptyString(route.method, `${prefix}.route.method`),
    `${prefix}.route.method`,
  );
  const routePathInput = nonEmptyString(route.path, `${prefix}.route.path`);
  if (!routePathInput.startsWith("/")) {
    throw invalidFixture(`${prefix}.route.path must start with "/".`);
  }
  const routePath = normalizeRoutePath(routePathInput);
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
  return normalizeRoutePath(route);
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

function isWorkspaceSessionSnapshotRetentionCleanupApiReplayParsedCommand(
  parsed: ParsedArgv,
): boolean {
  return workspaceSessionSnapshotRetentionCleanupApiReplayCommandLength(
    parsed.positionals,
  ) > 0;
}

function workspaceSessionSnapshotRetentionCleanupApiReplayCommandLength(
  positionals: readonly string[],
): number {
  if (
    positionals[0] === "workspace" &&
    positionals[1] === "session" &&
    positionals[2] === "snapshot" &&
    positionals[3] === "retention-cleanup" &&
    positionals[4] === "api" &&
    positionals[5] === "replay"
  ) {
    return 6;
  }

  if (
    positionals[0] === "workspace" &&
    positionals[1] === "session" &&
    positionals[2] === "snapshot" &&
    positionals[3] === "retention" &&
    positionals[4] === "cleanup" &&
    positionals[5] === "api" &&
    positionals[6] === "replay"
  ) {
    return 7;
  }

  if (
    positionals[0] === "workspace-session" &&
    positionals[1] === "snapshot" &&
    positionals[2] === "retention-cleanup" &&
    positionals[3] === "api" &&
    positionals[4] === "replay"
  ) {
    return 5;
  }

  if (
    positionals[0] === "workspace-session" &&
    positionals[1] === "snapshot" &&
    positionals[2] === "retention" &&
    positionals[3] === "cleanup" &&
    positionals[4] === "api" &&
    positionals[5] === "replay"
  ) {
    return 6;
  }

  if (
    positionals[0] === "workspace-session-snapshot" &&
    positionals[1] === "retention-cleanup" &&
    positionals[2] === "api" &&
    positionals[3] === "replay"
  ) {
    return 4;
  }

  if (
    positionals[0] === "workspace-session-snapshot" &&
    positionals[1] === "retention" &&
    positionals[2] === "cleanup" &&
    positionals[3] === "api" &&
    positionals[4] === "replay"
  ) {
    return 5;
  }

  if (
    positionals[0] === "workspace-session-snapshot-retention-cleanup" &&
    positionals[1] === "api" &&
    positionals[2] === "replay"
  ) {
    return 3;
  }

  if (
    positionals[0] === "workspace-session-snapshot-retention-cleanup-api" &&
    positionals[1] === "replay"
  ) {
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
  return nonEmptyString(value, label);
}

function safeRelativeJsonPath(value: unknown, label: string): string {
  const fixturePath = nonEmptyString(value, label);
  if (fixturePath.includes("\0")) {
    throw invalidFixture(`${label} must not contain null bytes.`);
  }
  if (/^[A-Za-z][A-Za-z\d+.-]*:\/\//.test(fixturePath)) {
    throw invalidFixture(`${label} must be a local path, not a URL.`);
  }
  if (
    /^[A-Za-z]:[\\/]/.test(fixturePath) ||
    fixturePath.startsWith("/") ||
    fixturePath.startsWith("\\")
  ) {
    throw invalidFixture(`${label} must be a relative local path.`);
  }
  if (path.extname(fixturePath) !== ".json") {
    throw invalidFixture(`${label} must point to a .json file.`);
  }

  const normalizedSegments = fixturePath.split(/[\\/]+/).filter((segment) => segment.length > 0);
  if (normalizedSegments.some((segment) => segment === "..")) {
    throw invalidFixture(`${label} must not contain parent directory segments.`);
  }
  if (normalizedSegments.includes(PRIVATE_WORKSPACE_SEGMENT)) {
    throw invalidFixture(`${label} must not reference private workspace files.`);
  }
  if (normalizedSegments.some((segment) => PLAN_PACK_SEGMENTS.has(segment.toLowerCase()))) {
    throw invalidFixture(`${label} must not reference private plan-pack paths.`);
  }

  return normalizedSegments.join("/");
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
    if (value === null || typeof value === "boolean") {
      return value;
    }
    if (typeof value === "number") {
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
            if (
              typeof nested === "string" &&
              isBodyValuePath(nestedPath) &&
              BODY_PATH_KEY_PATTERN.test(key) &&
              !isRedactedPathLike(nested)
            ) {
              redactions.push({ path: nestedPath, reason: "path field" });
              return [key, "[redacted-path]"];
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

    for (const pattern of RAW_LOCAL_PATH_PATTERNS) {
      if (!pattern.test(redacted)) {
        pattern.lastIndex = 0;
        continue;
      }
      pattern.lastIndex = 0;
      redactions.push({ path: valuePath, reason: "raw local path" });
      redacted = redacted.replace(pattern, "[redacted-path]");
      pattern.lastIndex = 0;
    }

    return redacted;
  }
}

function isBodyValuePath(valuePath: string): boolean {
  return (
    valuePath.includes(".request.body.") ||
    valuePath.includes(".expected.body.") ||
    valuePath.includes(".actual.body.")
  );
}

function isRedactedPathLike(value: string): boolean {
  return value === "[redacted-path]" || /^\[redacted:path:[A-Za-z0-9_-]+\]$/.test(value);
}

function apiJsonResponse(
  status: number,
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
): WorkspaceSessionSnapshotRetentionCleanupApiReplayResponse {
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
): WorkspaceSessionSnapshotRetentionCleanupApiReplayResponse {
  const redactor = createRedactor();
  return apiJsonResponse(status, redactor.redact({
    error: optionalFields({
      code,
      message,
      details,
    }),
  }, "$"));
}

function jsonSuccess(
  value: unknown,
): WorkspaceSessionSnapshotRetentionCleanupApiReplayCliResult {
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
): WorkspaceSessionSnapshotRetentionCleanupApiReplayCliResult {
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

function usageError(
  message: string,
): WorkspaceSessionSnapshotRetentionCleanupApiReplayError {
  return new WorkspaceSessionSnapshotRetentionCleanupApiReplayError({
    exitCode: 2,
    code: "usage_error",
    message,
  });
}

function invalidFixture(
  message: string,
): WorkspaceSessionSnapshotRetentionCleanupApiReplayError {
  return new WorkspaceSessionSnapshotRetentionCleanupApiReplayError({
    exitCode: 2,
    code: "invalid_fixture",
    message,
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

class WorkspaceSessionSnapshotRetentionCleanupApiReplayError extends Error {
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
    this.name = "WorkspaceSessionSnapshotRetentionCleanupApiReplayError";
    this.exitCode = options.exitCode;
    this.code = options.code;
    this.details = options.details;
  }
}
