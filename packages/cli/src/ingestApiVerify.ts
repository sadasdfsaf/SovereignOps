import { existsSync, readFileSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

export interface IngestApiVerifyCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface IngestApiVerifyRunOptions {
  readonly cwd?: string;
}

type ParsedFlagValue = string | boolean;

interface ParsedArgv {
  readonly positionals: readonly string[];
  readonly flags: Readonly<Record<string, ParsedFlagValue>>;
  readonly errors: readonly string[];
}

interface ResolvedLocalPath {
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
  readonly responseBody: unknown;
}

interface OpenApiRoute {
  readonly method: string;
  readonly path: string;
}

interface VerificationIssue {
  readonly code: string;
  readonly message: string;
  readonly id?: string;
  readonly method?: string;
  readonly path?: string;
}

const HELP_TEXT = {
  usage: [
    "sovereignops ingest api verify --fixture <path> --openapi <path>",
    "sovereignops ingest-api verify --fixture <path> --openapi <path>",
  ],
  options: {
    fixture: "Local JSON fixture bundle path inside this repository.",
    openapi: "Local OpenAPI YAML path inside this repository.",
  },
};

const BOOLEAN_FLAGS = new Set(["help", "h"]);
const ALLOWED_FLAGS = new Set(["fixture", "help", "h", "openapi"]);
const HTTP_METHODS = new Set([
  "connect",
  "delete",
  "get",
  "head",
  "options",
  "patch",
  "post",
  "put",
  "trace",
]);

export async function runIngestApiVerifyCli(
  argv: readonly string[] = [],
  options: IngestApiVerifyRunOptions = {},
): Promise<IngestApiVerifyCliResult | undefined> {
  const parsed = parseArgv(argv);
  if (!isIngestApiVerifyParsedCommand(parsed)) {
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
      kind: "ingest-api-verify.help",
      ...HELP_TEXT,
    });
  }

  const commandLength = ingestApiVerifyCommandLength(parsed.positionals);
  const extraPositionals = parsed.positionals.slice(commandLength);
  if (extraPositionals.length > 0) {
    return jsonFailure(
      2,
      "usage_error",
      `Unexpected positional argument: ${extraPositionals[0]}`,
    );
  }

  try {
    const cwd = options.cwd ?? process.cwd();
    const fixture = await resolveLocalPath({
      flagName: "fixture",
      value: requireStringFlag(parsed, "fixture"),
      cwd,
      allowedExtensions: [".json"],
    });
    const openapi = await resolveLocalPath({
      flagName: "openapi",
      value: requireStringFlag(parsed, "openapi"),
      cwd,
      allowedExtensions: [".yaml", ".yml"],
    });

    const bundle = parseFixtureBundle(await readFixtureJson(fixture));
    assertUniqueRequestIds(bundle.requests);
    assertFixtureUsesOnlySafeLocalPaths(bundle.requests);
    assertNoLiveNetworkUsage(bundle);

    const openapiText = await readOpenApiText(openapi);
    const openapiRoutes = parseOpenApiRoutes(openapiText);
    const issues = verifyRoutes(bundle.requests, openapiRoutes);
    if (issues.length > 0) {
      throw new IngestApiVerifyError({
        exitCode: 1,
        code: "verification_failed",
        message: "Ingest API fixture verification failed.",
        details: {
          issues,
        },
      });
    }

    return jsonSuccess({
      kind: "ingest-api-fixture-verify",
      schemaVersion: bundle.schemaVersion,
      generatedAt: bundle.generatedAt,
      ...pruneUndefined({
        apiBase: bundle.apiBase,
      }),
      fixture: {
        path: fixture.displayPath,
      },
      openapi: {
        path: openapi.displayPath,
      },
      network: {
        liveRequests: 0,
        allowed: "local-fixture-only",
      },
      totalRequests: bundle.requests.length,
      verifiedRequests: bundle.requests.length,
      summary: summarizeRequests(bundle.requests),
      routes: bundle.requests.map((request) =>
        pruneUndefined({
          id: request.id,
          title: request.title,
          method: request.method,
          path: request.path,
          response: {
            status: request.responseStatus,
            hasBody: true,
          },
        }),
      ),
    });
  } catch (error) {
    if (error instanceof IngestApiVerifyError) {
      return jsonFailure(error.exitCode, error.code, error.message, error.details);
    }

    return jsonFailure(
      1,
      "verify_error",
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function isIngestApiVerifyCommand(argv: readonly string[]): boolean {
  return isIngestApiVerifyParsedCommand(parseArgv(argv));
}

async function resolveLocalPath(options: {
  readonly flagName: string;
  readonly value: string;
  readonly cwd: string;
  readonly allowedExtensions: readonly string[];
}): Promise<ResolvedLocalPath> {
  const input = options.value.trim();
  if (input.length === 0) {
    throw usageError(`Option --${options.flagName} requires a non-empty path.`);
  }
  if (input.includes("\0")) {
    throw usageError(`Option --${options.flagName} must not contain null bytes.`);
  }
  if (/^[A-Za-z][A-Za-z\d+.-]*:\/\//.test(input)) {
    throw usageError(`Option --${options.flagName} must be a local file path, not a URL.`);
  }

  const cwdPath = path.resolve(options.cwd);
  const requestedPath = path.resolve(cwdPath, input);
  const workspaceRoot =
    findWorkspaceRoot(cwdPath) ?? findWorkspaceRoot(path.dirname(requestedPath));
  if (workspaceRoot === undefined) {
    throw usageError(
      `Could not locate the SovereignOps workspace root for --${options.flagName}.`,
    );
  }

  assertPathInsideWorkspace(workspaceRoot, requestedPath, options.flagName);
  assertNotPrivatePath(workspaceRoot, requestedPath, options.flagName);

  const extension = path.extname(requestedPath);
  if (!options.allowedExtensions.includes(extension)) {
    throw usageError(
      `Option --${options.flagName} must point to a ${formatExtensions(
        options.allowedExtensions,
      )} file.`,
    );
  }

  let fileStat: Awaited<ReturnType<typeof stat>>;
  try {
    fileStat = await stat(requestedPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new IngestApiVerifyError({
        exitCode: 2,
        code: `${options.flagName}_not_found`,
        message: `${titleCase(options.flagName)} file was not found.`,
        details: {
          path: displayPath(workspaceRoot, requestedPath),
        },
      });
    }

    throw new IngestApiVerifyError({
      exitCode: 1,
      code: `${options.flagName}_stat_error`,
      message: `Could not inspect ${options.flagName} file.`,
      details: {
        path: displayPath(workspaceRoot, requestedPath),
        cause: error instanceof Error ? error.message : String(error),
      },
    });
  }

  if (!fileStat.isFile()) {
    throw new IngestApiVerifyError({
      exitCode: 2,
      code: `${options.flagName}_not_file`,
      message: `Option --${options.flagName} must point to a file.`,
      details: {
        path: displayPath(workspaceRoot, requestedPath),
      },
    });
  }

  const actualPath = await realpath(requestedPath);
  assertPathInsideWorkspace(workspaceRoot, actualPath, options.flagName);
  assertNotPrivatePath(workspaceRoot, actualPath, options.flagName);

  return {
    absolutePath: actualPath,
    displayPath: displayPath(workspaceRoot, actualPath),
  };
}

async function readFixtureJson(fixture: ResolvedLocalPath): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(fixture.absolutePath, "utf8");
  } catch (error) {
    throw new IngestApiVerifyError({
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
    throw new IngestApiVerifyError({
      exitCode: 2,
      code: "invalid_fixture_json",
      message: "Fixture file must contain valid JSON.",
      details: {
        path: fixture.displayPath,
      },
    });
  }
}

async function readOpenApiText(openapi: ResolvedLocalPath): Promise<string> {
  try {
    return await readFile(openapi.absolutePath, "utf8");
  } catch (error) {
    throw new IngestApiVerifyError({
      exitCode: 1,
      code: "openapi_read_error",
      message: "Could not read OpenAPI file.",
      details: {
        path: openapi.displayPath,
        cause: error instanceof Error ? error.message : String(error),
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
  if (!Object.hasOwn(response, "body")) {
    throw invalidFixture(`${prefix}.response.body is required.`);
  }

  return {
    id,
    ...(title === undefined ? {} : { title }),
    method,
    path: routePath,
    requestBody: cloneJson(request.body),
    responseStatus: status,
    responseBody: cloneJson(response.body),
  };
}

function assertUniqueRequestIds(requests: readonly IngestApiFixtureRequest[]): void {
  const seen = new Set<string>();
  for (const request of requests) {
    if (seen.has(request.id)) {
      throw invalidFixture(`fixture.requests[].id must be unique: ${request.id}`);
    }
    seen.add(request.id);
  }
}

function assertFixtureUsesOnlySafeLocalPaths(
  requests: readonly IngestApiFixtureRequest[],
): void {
  for (const [index, request] of requests.entries()) {
    assertSafeLocalPathFields(
      request.requestBody,
      `fixture.requests[${index}].request.body`,
    );
    assertSafeLocalPathFields(
      request.responseBody,
      `fixture.requests[${index}].response.body`,
    );
  }
}

function assertSafeLocalPathFields(value: unknown, label: string): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSafeLocalPathFields(entry, `${label}[${index}]`));
    return;
  }
  if (!isRecord(value)) {
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    const entryLabel = `${label}.${key}`;
    if (key === "localPath") {
      assertSafeFixtureLocalPath(entry, entryLabel);
      continue;
    }
    if (key === "includePaths") {
      if (!Array.isArray(entry)) {
        throw invalidFixture(`${entryLabel} must be an array.`);
      }
      entry.forEach((includePath, index) =>
        assertSafeFixtureLocalPath(includePath, `${entryLabel}[${index}]`),
      );
      continue;
    }
    if (key === "sources" && Array.isArray(entry)) {
      entry.forEach((source, index) => {
        if (!isRecord(source) || !Object.hasOwn(source, "path")) {
          return;
        }
        assertSafeFixtureLocalPath(source.path, `${entryLabel}[${index}].path`);
      });
      continue;
    }

    assertSafeLocalPathFields(entry, entryLabel);
  }
}

function assertSafeFixtureLocalPath(value: unknown, label: string): void {
  const localPath = nonEmptyString(value, label);
  if (localPath.includes("\0")) {
    throw invalidFixture(`${label} must not contain null bytes.`);
  }
  if (/^[A-Za-z][A-Za-z\d+.-]*:\/\//.test(localPath)) {
    throw invalidFixture(`${label} must be a local path, not a URL.`);
  }
  if (/^[A-Za-z]:[\\/]/.test(localPath) || localPath.startsWith("/") || localPath.startsWith("\\")) {
    throw invalidFixture(`${label} must be a relative local path.`);
  }
  const normalizedSegments = localPath.split(/[\\/]+/).filter((segment) => segment.length > 0);
  if (normalizedSegments.some((segment) => segment === "..")) {
    throw invalidFixture(`${label} must not contain parent directory segments.`);
  }
}

function assertNoLiveNetworkUsage(bundle: IngestApiFixtureBundle): void {
  if (bundle.apiBase === undefined) {
    return;
  }

  let url: URL;
  try {
    url = new URL(bundle.apiBase);
  } catch {
    throw invalidFixture("fixture.apiBase must be a valid URL when provided.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw invalidFixture("fixture.apiBase must use http or https when provided.");
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "[::1]") {
    throw invalidFixture("fixture.apiBase must point to a local host.");
  }
}

function parseOpenApiRoutes(openapiText: string): readonly OpenApiRoute[] {
  const routes: OpenApiRoute[] = [];
  const lines = openapiText.split(/\r?\n/);
  let activePath: string | undefined;
  let inPaths = false;

  for (const line of lines) {
    if (/^paths:\s*$/.test(line)) {
      inPaths = true;
      activePath = undefined;
      continue;
    }
    if (!inPaths) {
      continue;
    }
    if (/^[A-Za-z0-9_-]+:\s*$/.test(line)) {
      break;
    }

    const pathMatch = /^  (["']?)(\/[^"':]+(?:\{[^}]+\}[^"':]*)*)\1:\s*$/.exec(line);
    if (pathMatch !== null) {
      activePath = pathMatch[2];
      continue;
    }

    const methodMatch = /^    ([a-z]+):\s*$/.exec(line);
    if (activePath !== undefined && methodMatch !== null && HTTP_METHODS.has(methodMatch[1])) {
      routes.push({
        method: methodMatch[1].toUpperCase(),
        path: activePath,
      });
    }
  }

  return routes;
}

function verifyRoutes(
  requests: readonly IngestApiFixtureRequest[],
  openapiRoutes: readonly OpenApiRoute[],
): readonly VerificationIssue[] {
  const issues: VerificationIssue[] = [];

  for (const request of requests) {
    if (
      !openapiRoutes.some(
        (route) =>
          route.method === request.method && openApiPathMatchesFixturePath(route.path, request.path),
      )
    ) {
      issues.push({
        code: "route_not_in_openapi",
        message: "Fixture route is not present in the OpenAPI paths.",
        id: request.id,
        method: request.method,
        path: request.path,
      });
    }
  }

  return issues;
}

function openApiPathMatchesFixturePath(openApiPath: string, fixturePath: string): boolean {
  if (openApiPath === fixturePath) {
    return true;
  }

  const openApiSegments = openApiPath.split("/").filter((segment) => segment.length > 0);
  const fixtureSegments = fixturePath.split("/").filter((segment) => segment.length > 0);
  if (openApiSegments.length !== fixtureSegments.length) {
    return false;
  }

  return openApiSegments.every(
    (segment, index) => isOpenApiPathParameter(segment) || segment === fixtureSegments[index],
  );
}

function isOpenApiPathParameter(segment: string): boolean {
  return /^\{[A-Za-z0-9_.-]+\}$/.test(segment);
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
  if (segments.includes(".codex-private")) {
    throw usageError(`Option --${flagName} must not reference private workspace files.`);
  }
}

function displayPath(workspaceRoot: string, candidatePath: string): string {
  return path.relative(workspaceRoot, candidatePath).split(path.sep).join("/");
}

function formatExtensions(extensions: readonly string[]): string {
  return extensions.join(" or ");
}

function titleCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
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

function isIngestApiVerifyParsedCommand(parsed: ParsedArgv): boolean {
  return ingestApiVerifyCommandLength(parsed.positionals) > 0;
}

function ingestApiVerifyCommandLength(positionals: readonly string[]): number {
  if (
    positionals[0] === "ingest" &&
    positionals[1] === "api" &&
    positionals[2] === "verify"
  ) {
    return 3;
  }
  if (positionals[0] === "ingest-api" && positionals[1] === "verify") {
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

function jsonSuccess(value: unknown): IngestApiVerifyCliResult {
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
): IngestApiVerifyCliResult {
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

function usageError(message: string): IngestApiVerifyError {
  return new IngestApiVerifyError({
    exitCode: 2,
    code: "usage_error",
    message,
  });
}

function invalidFixture(message: string): IngestApiVerifyError {
  return new IngestApiVerifyError({
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

class IngestApiVerifyError extends Error {
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
    this.name = "IngestApiVerifyError";
    this.exitCode = options.exitCode;
    this.code = options.code;
    this.details = options.details;
  }
}
