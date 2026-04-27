import { existsSync, readFileSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

import { createIngestEvidenceRoutes } from "../../../apps/api/src/ingestEvidenceRoutes.ts";
import { createApiRouter } from "../../../apps/api/src/router.ts";

export interface IngestEvidenceApiReplayCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface IngestEvidenceApiReplayRunOptions {
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
  readonly workspaceRoot: string;
}

interface IngestEvidenceApiFixtureBundle {
  readonly schemaVersion: "ingest-evidence-api-requests.v1";
  readonly generatedAt: string;
  readonly apiBase?: string;
  readonly fixtureRefs: readonly IngestEvidenceApiFixtureRef[];
  readonly requests: readonly IngestEvidenceApiFixtureRequest[];
}

interface IngestEvidenceApiFixtureRef {
  readonly id: string;
  readonly fixturePath: string;
}

interface IngestEvidenceApiFixtureRequest {
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
  readonly fixture: IngestEvidenceApiFixtureRequest;
  readonly actualStatus: number;
  readonly actualBody: unknown;
  readonly statusMatches: boolean;
  readonly bodyMatches?: boolean;
  readonly expectationMatches?: boolean;
  readonly expectationIssues: readonly string[];
}

const HELP_TEXT = {
  usage: [
    "sovereignops ingest evidence api replay --fixture <path> [--method <method>] [--route <path>] [--id <id>]",
  ],
  options: {
    fixture: "Local evidence API request fixture bundle JSON path inside this repository.",
    method: "Optional HTTP method filter, for example POST.",
    route: "Optional exact route path filter, for example /v1/ingest/evidence/export.",
    id: "Optional exact request id filter, for example api_ingest_evidence_export_json.",
  },
};

const BOOLEAN_FLAGS = new Set(["help", "h"]);
const ALLOWED_FLAGS = new Set(["fixture", "help", "h", "id", "method", "route"]);

export async function runIngestEvidenceApiReplayCli(
  argv: readonly string[] = [],
  options: IngestEvidenceApiReplayRunOptions = {},
): Promise<IngestEvidenceApiReplayCliResult | undefined> {
  const parsed = parseArgv(argv);
  if (!isIngestEvidenceApiReplayParsedCommand(parsed)) {
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
      kind: "ingest-evidence-api-replay.help",
      ...HELP_TEXT,
    });
  }

  const commandLength = ingestEvidenceApiReplayCommandLength(parsed.positionals);
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
    const replayed = await replayRequests(requests, fixtureRefs);
    const failedRequests = replayed.filter((request) => !replaySucceeded(request)).length;

    return jsonSuccess({
      kind: "ingest-evidence-api-fixture-replay",
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
      requests: replayed.map((request) =>
        optionalFields({
          id: request.fixture.id,
          title: request.fixture.title,
          method: request.fixture.method,
          path: request.fixture.path,
          expected: optionalFields({
            status: request.fixture.expectedStatus,
            body: cloneJson(request.fixture.expectedBody),
            checks: cloneJson(request.fixture.expectedChecks),
          }),
          actual: {
            status: request.actualStatus,
            body: cloneJson(request.actualBody),
          },
          matches: optionalFields({
            status: request.statusMatches,
            body: request.bodyMatches,
            expectation: request.expectationMatches,
          }),
          expectationIssues:
            request.expectationIssues.length === 0 ? undefined : request.expectationIssues,
        }),
      ),
    });
  } catch (error) {
    if (error instanceof IngestEvidenceApiReplayError) {
      return jsonFailure(error.exitCode, error.code, error.message, error.details);
    }

    return jsonFailure(
      1,
      "replay_error",
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function isIngestEvidenceApiReplayCommand(argv: readonly string[]): boolean {
  return isIngestEvidenceApiReplayParsedCommand(parseArgv(argv));
}

async function replayRequests(
  requests: readonly IngestEvidenceApiFixtureRequest[],
  fixtureRefs: ReadonlyMap<string, unknown>,
): Promise<readonly ReplayedRequest[]> {
  const router = createApiRouter(createIngestEvidenceRoutes());
  const replayed: ReplayedRequest[] = [];

  for (const request of requests) {
    const response = await router.dispatch({
      method: request.method,
      path: request.path,
      ...(request.headers === undefined ? {} : { headers: request.headers }),
      ...(request.actorId === undefined ? {} : { actorId: request.actorId }),
      body: materializeFixtureRefs(request.body, fixtureRefs),
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
      actualBody: response.body,
      statusMatches: response.status === request.expectedStatus,
      ...(bodyMatches === undefined ? {} : { bodyMatches }),
      ...(expectationMatches === undefined ? {} : { expectationMatches }),
      expectationIssues,
    });
  }

  return replayed;
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
  response: { readonly status: number; readonly headers: Readonly<Record<string, string>>; readonly body: unknown },
  expected: Readonly<Record<string, unknown>> | undefined,
): readonly string[] {
  if (expected === undefined) {
    return [];
  }

  const issues: string[] = [];
  const body = isRecord(response.body) ? response.body : {};
  const manifest = isRecord(body.manifest) ? body.manifest : {};
  const contentDescriptor = isRecord(manifest.content) ? manifest.content : {};

  if (
    typeof expected.contentType === "string" &&
    !String(response.headers["content-type"] ?? "")
      .toLowerCase()
      .startsWith(expected.contentType.toLowerCase())
  ) {
    issues.push("contentType");
  }
  if (expected.error !== undefined && !jsonEquals(readRecordField(body, "error"), expected.error)) {
    issues.push("error");
  }
  if (expected.kind !== undefined && body.kind !== expected.kind) {
    issues.push("kind");
  }
  if (expected.format !== undefined && body.format !== expected.format) {
    issues.push("format");
  }
  if (expected.fingerprint !== undefined && body.fingerprint !== expected.fingerprint) {
    issues.push("fingerprint");
  }
  if (
    expected.manifestFingerprint !== undefined &&
    manifest.fingerprint !== expected.manifestFingerprint
  ) {
    issues.push("manifestFingerprint");
  }
  if (
    expected.contentFingerprint !== undefined &&
    contentDescriptor.fingerprint !== expected.contentFingerprint
  ) {
    issues.push("contentFingerprint");
  }
  if (
    expected.summary !== undefined &&
    !jsonEquals(readRecordField(manifest, "evidenceSummary"), expected.summary)
  ) {
    issues.push("summary");
  }
  if (expected.files !== undefined && !jsonEquals(summarizePackageFiles(body.files), expected.files)) {
    issues.push("files");
  }

  return issues;
}

function summarizePackageFiles(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.map((file) => {
    if (!isRecord(file)) {
      return file;
    }
    return optionalFields({
      path: file.path,
      mediaType: file.mediaType,
      bytes: file.bytes,
      fingerprint: file.fingerprint,
    });
  });
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
      throw new IngestEvidenceApiReplayError({
        exitCode: 2,
        code: "fixture_not_found",
        message: "Fixture file was not found.",
        details: {
          path: displayPath(workspaceRoot, requestedPath),
        },
      });
    }

    throw new IngestEvidenceApiReplayError({
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
    throw new IngestEvidenceApiReplayError({
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
    workspaceRoot,
  };
}

async function readFixtureJson(fixture: ResolvedFixturePath): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(fixture.absolutePath, "utf8");
  } catch (error) {
    throw new IngestEvidenceApiReplayError({
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
    throw new IngestEvidenceApiReplayError({
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
  refs: readonly IngestEvidenceApiFixtureRef[],
  workspaceRoot: string,
): Promise<ReadonlyMap<string, unknown>> {
  const loaded = new Map<string, unknown>();

  for (const ref of refs) {
    const absolutePath = await resolveReferencedFixturePath(ref.fixturePath, workspaceRoot);
    let text: string;
    try {
      text = await readFile(absolutePath, "utf8");
    } catch (error) {
      throw new IngestEvidenceApiReplayError({
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
      throw new IngestEvidenceApiReplayError({
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
  assertPathInsideWorkspace(workspaceRoot, requestedPath);
  assertNotPrivatePath(workspaceRoot, requestedPath);

  let fileStat: Awaited<ReturnType<typeof stat>>;
  try {
    fileStat = await stat(requestedPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new IngestEvidenceApiReplayError({
        exitCode: 2,
        code: "fixture_ref_not_found",
        message: "Referenced fixture file was not found.",
        details: {
          path: displayPath(workspaceRoot, requestedPath),
        },
      });
    }

    throw new IngestEvidenceApiReplayError({
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
    throw new IngestEvidenceApiReplayError({
      exitCode: 2,
      code: "fixture_ref_not_file",
      message: "Referenced fixture path must point to a file.",
      details: {
        path: displayPath(workspaceRoot, requestedPath),
      },
    });
  }

  const actualPath = await realpath(requestedPath);
  assertPathInsideWorkspace(workspaceRoot, actualPath);
  assertNotPrivatePath(workspaceRoot, actualPath);
  return actualPath;
}

function parseFixtureBundle(value: unknown): IngestEvidenceApiFixtureBundle {
  if (!isRecord(value)) {
    throw invalidFixture("fixture root must be a JSON object.");
  }
  if (value.schemaVersion !== "ingest-evidence-api-requests.v1") {
    throw invalidFixture('fixture.schemaVersion must be "ingest-evidence-api-requests.v1".');
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
    fixtureRefs: parseFixtureRefs(value),
    requests: value.requests.map((request, index) => parseFixtureRequest(request, index)),
  };
}

function parseFixtureRefs(value: Record<string, unknown>): readonly IngestEvidenceApiFixtureRef[] {
  const refs: IngestEvidenceApiFixtureRef[] = [];

  if (value.inputEvidence !== undefined) {
    refs.push(parseFixtureRef(value.inputEvidence, "fixture.inputEvidence"));
  }
  if (value.fixtureRefs !== undefined) {
    if (!Array.isArray(value.fixtureRefs)) {
      throw invalidFixture("fixture.fixtureRefs must be an array.");
    }
    refs.push(
      ...value.fixtureRefs.map((item, index) =>
        parseFixtureRef(item, `fixture.fixtureRefs[${index}]`),
      ),
    );
  }

  const seen = new Set<string>();
  for (const ref of refs) {
    if (seen.has(ref.id)) {
      throw invalidFixture(`fixture reference ids must be unique: ${ref.id}`);
    }
    seen.add(ref.id);
  }

  return refs;
}

function parseFixtureRef(value: unknown, label: string): IngestEvidenceApiFixtureRef {
  const record = requiredRecord(value, label);
  const id = nonEmptyString(record.id, `${label}.id`);
  const fixturePath = safeRelativeJsonPath(record.fixturePath, `${label}.fixturePath`);

  return { id, fixturePath };
}

function parseFixtureRequest(value: unknown, index: number): IngestEvidenceApiFixtureRequest {
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

function isIngestEvidenceApiReplayParsedCommand(parsed: ParsedArgv): boolean {
  return ingestEvidenceApiReplayCommandLength(parsed.positionals) > 0;
}

function ingestEvidenceApiReplayCommandLength(positionals: readonly string[]): number {
  if (
    positionals[0] === "ingest" &&
    positionals[1] === "evidence" &&
    positionals[2] === "api" &&
    positionals[3] === "replay"
  ) {
    return 4;
  }
  if (
    positionals[0] === "ingest-evidence" &&
    positionals[1] === "api" &&
    positionals[2] === "replay"
  ) {
    return 3;
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
    headers[key] = headerValue;
  }
  return Object.freeze(headers);
}

function jsonSuccess(value: unknown): IngestEvidenceApiReplayCliResult {
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
): IngestEvidenceApiReplayCliResult {
  return {
    exitCode,
    stdout: "",
    stderr: `${serializePrettyJson({
      error: optionalFields({
        code,
        message,
        details: details && Object.keys(details).length > 0 ? details : undefined,
      }),
    })}\n`,
  };
}

function usageError(message: string): IngestEvidenceApiReplayError {
  return new IngestEvidenceApiReplayError({
    exitCode: 2,
    code: "usage_error",
    message,
  });
}

function invalidFixture(message: string): IngestEvidenceApiReplayError {
  return new IngestEvidenceApiReplayError({
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecordField(record: Record<string, unknown>, field: string): unknown {
  return record[field];
}

function optionalFields<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

class IngestEvidenceApiReplayError extends Error {
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
    this.name = "IngestEvidenceApiReplayError";
    this.exitCode = options.exitCode;
    this.code = options.code;
    this.details = options.details;
  }
}
