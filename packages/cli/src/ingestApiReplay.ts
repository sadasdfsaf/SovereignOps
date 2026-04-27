import { existsSync, readFileSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

export interface IngestApiReplayCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface IngestApiReplayRunOptions {
  readonly cwd?: string;
}

type ParsedFlagValue = string | boolean;

interface ParsedArgv {
  readonly positionals: readonly string[];
  readonly flags: Readonly<Record<string, ParsedFlagValue>>;
  readonly errors: readonly string[];
}

interface ResolvedFixturePath {
  readonly absolutePath: string;
  readonly displayPath: string;
}

interface IngestApiFixtureBundle {
  readonly schemaVersion: "ingest-search-api-requests.v1";
  readonly generatedAt: string;
  readonly apiBase?: string;
  readonly requests: readonly IngestApiFixtureRequest[];
}

interface IngestApiFixtureRequest {
  readonly id: string;
  readonly title?: string;
  readonly method: string;
  readonly path: string;
  readonly requestBody: unknown;
  readonly responseStatus: number;
  readonly responseBody?: unknown;
}

const HELP_TEXT = {
  usage: [
    "sovereignops ingest api replay --fixture <path> [--method <method>] [--route <path>] [--id <id>]",
  ],
  options: {
    fixture: "Local JSON fixture bundle path inside this repository.",
    method: "Optional HTTP method filter, for example GET or POST.",
    route: "Optional exact route path filter, for example /v1/ingest/normalize.",
    id: "Optional exact request id filter, for example api_ingest_normalize.",
  },
};

const BOOLEAN_FLAGS = new Set(["help", "h"]);
const ALLOWED_FLAGS = new Set(["fixture", "help", "h", "id", "method", "route"]);

export async function runIngestApiReplayCli(
  argv: readonly string[] = [],
  options: IngestApiReplayRunOptions = {},
): Promise<IngestApiReplayCliResult | undefined> {
  const parsed = parseArgv(argv);
  if (!isIngestApiReplayParsedCommand(parsed)) {
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
      kind: "ingest-api-replay.help",
      ...HELP_TEXT,
    });
  }

  const commandLength = ingestApiReplayCommandLength(parsed.positionals);
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
    const method = optionalMethodFlag(parsed);
    const route = optionalRouteFlag(parsed);
    const id = optionalIdFlag(parsed);
    const requests = bundle.requests.filter(
      (request) =>
        (method === undefined || request.method === method) &&
        (route === undefined || request.path === route) &&
        (id === undefined || request.id === id),
    );

    return jsonSuccess({
      kind: "ingest-api-fixture-replay",
      schemaVersion: bundle.schemaVersion,
      generatedAt: bundle.generatedAt,
      ...pruneUndefined({
        apiBase: bundle.apiBase,
      }),
      fixture: {
        path: fixture.displayPath,
      },
      filters: pruneUndefined({
        method,
        route,
        id,
      }),
      totalRequests: bundle.requests.length,
      replayedRequests: requests.length,
      summary: summarizeRequests(requests),
      requests: requests.map((request) =>
        pruneUndefined({
          id: request.id,
          title: request.title,
          method: request.method,
          path: request.path,
          request: {
            body: cloneJson(request.requestBody),
          },
          response: pruneUndefined({
            status: request.responseStatus,
            body:
              request.responseBody === undefined
                ? undefined
                : cloneJson(request.responseBody),
          }),
        }),
      ),
    });
  } catch (error) {
    if (error instanceof IngestApiReplayError) {
      return jsonFailure(error.exitCode, error.code, error.message, error.details);
    }

    return jsonFailure(
      1,
      "replay_error",
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function isIngestApiReplayCommand(argv: readonly string[]): boolean {
  return isIngestApiReplayParsedCommand(parseArgv(argv));
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
      throw new IngestApiReplayError({
        exitCode: 2,
        code: "fixture_not_found",
        message: "Fixture file was not found.",
        details: {
          path: displayPath(workspaceRoot, requestedPath),
        },
      });
    }

    throw new IngestApiReplayError({
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
    throw new IngestApiReplayError({
      exitCode: 2,
      code: "fixture_not_file",
      message: "Fixture path must point to a file.",
      details: {
        path: displayPath(workspaceRoot, requestedPath),
      },
    });
  }

  const actualPath = await realpath(requestedPath);
  assertPathInsideWorkspace(workspaceRoot, actualPath);
  assertNotPrivatePath(workspaceRoot, actualPath);

  return {
    absolutePath: actualPath,
    displayPath: displayPath(workspaceRoot, actualPath),
  };
}

async function readFixtureJson(fixture: ResolvedFixturePath): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(fixture.absolutePath, "utf8");
  } catch (error) {
    throw new IngestApiReplayError({
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
    throw new IngestApiReplayError({
      exitCode: 2,
      code: "invalid_fixture_json",
      message: "Fixture file must contain valid JSON.",
      details: {
        path: fixture.displayPath,
      },
    });
  }
}

function parseFixtureBundle(value: unknown): IngestApiFixtureBundle {
  if (!isRecord(value)) {
    throw invalidFixture("fixture root must be a JSON object.");
  }
  if (value.schemaVersion !== "ingest-search-api-requests.v1") {
    throw invalidFixture('fixture.schemaVersion must be "ingest-search-api-requests.v1".');
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

function parseFixtureRequest(value: unknown, index: number): IngestApiFixtureRequest {
  const prefix = `fixture.requests[${index}]`;
  if (!isRecord(value)) {
    throw invalidFixture(`${prefix} must be an object.`);
  }

  const id = nonEmptyString(value.id, `${prefix}.id`);
  const title = optionalNonEmptyString(value.title, `${prefix}.title`);
  const route = requiredRecord(value.route, `${prefix}.route`);
  const request = requiredRecord(value.request, `${prefix}.request`);
  const response = requiredRecord(value.response, `${prefix}.response`);

  if (!Object.hasOwn(request, "body")) {
    throw invalidFixture(`${prefix}.request.body is required.`);
  }

  const method = nonEmptyString(route.method, `${prefix}.route.method`).toUpperCase();
  if (!/^[A-Z]+$/.test(method)) {
    throw invalidFixture(`${prefix}.route.method must be an HTTP method token.`);
  }

  const routePath = nonEmptyString(route.path, `${prefix}.route.path`);
  if (!routePath.startsWith("/")) {
    throw invalidFixture(`${prefix}.route.path must start with "/".`);
  }

  const status = response.status;
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    throw invalidFixture(`${prefix}.response.status must be an HTTP status code.`);
  }

  return {
    id,
    ...(title === undefined ? {} : { title }),
    method,
    path: routePath,
    requestBody: cloneJson(request.body),
    responseStatus: status,
    ...(Object.hasOwn(response, "body")
      ? { responseBody: cloneJson(response.body) }
      : {}),
  };
}

function summarizeRequests(
  requests: readonly IngestApiFixtureRequest[],
): {
  readonly methods: Record<string, number>;
  readonly routes: Record<string, number>;
  readonly statuses: Record<string, number>;
} {
  const methods = new Map<string, number>();
  const routes = new Map<string, number>();
  const statuses = new Map<string, number>();

  for (const request of requests) {
    increment(methods, request.method);
    increment(routes, request.path);
    increment(statuses, String(request.responseStatus));
  }

  return {
    methods: sortedRecord(methods),
    routes: sortedRecord(routes),
    statuses: sortedRecord(statuses),
  };
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortedRecord(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries([...map.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
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
        if (
          packageJson.name === "@sovereignops/root" &&
          Array.isArray(packageJson.workspaces)
        ) {
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
  if (segments.includes(".codex-private")) {
    throw usageError("Option --fixture must not reference private workspace files.");
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

  const normalized = method.toUpperCase();
  if (!/^[A-Z]+$/.test(normalized)) {
    throw usageError("Option --method must be an HTTP method token.");
  }
  return normalized;
}

function optionalRouteFlag(parsed: ParsedArgv): string | undefined {
  const route = optionalStringFlag(parsed, "route");
  if (route === undefined) {
    return undefined;
  }
  if (!route.startsWith("/")) {
    throw usageError("Option --route must start with /.");
  }
  return route;
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

function isIngestApiReplayParsedCommand(parsed: ParsedArgv): boolean {
  return ingestApiReplayCommandLength(parsed.positionals) > 0;
}

function ingestApiReplayCommandLength(positionals: readonly string[]): number {
  if (
    positionals[0] === "ingest" &&
    positionals[1] === "api" &&
    positionals[2] === "replay"
  ) {
    return 3;
  }
  if (positionals[0] === "ingest-api" && positionals[1] === "replay") {
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

function jsonSuccess(value: unknown): IngestApiReplayCliResult {
  return {
    exitCode: 0,
    stdout: `${JSON.stringify(value, null, 2)}\n`,
    stderr: "",
  };
}

function jsonFailure(
  exitCode: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): IngestApiReplayCliResult {
  return {
    exitCode,
    stdout: "",
    stderr: `${JSON.stringify(
      {
        error: pruneUndefined({
          code,
          message,
          details: details && Object.keys(details).length > 0 ? details : undefined,
        }),
      },
      null,
      2,
    )}\n`,
  };
}

function usageError(message: string): IngestApiReplayError {
  return new IngestApiReplayError({
    exitCode: 2,
    code: "usage_error",
    message,
  });
}

function invalidFixture(message: string): IngestApiReplayError {
  return new IngestApiReplayError({
    exitCode: 2,
    code: "invalid_fixture",
    message,
  });
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

class IngestApiReplayError extends Error {
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
    this.name = "IngestApiReplayError";
    this.exitCode = options.exitCode;
    this.code = options.code;
    this.details = options.details;
  }
}
