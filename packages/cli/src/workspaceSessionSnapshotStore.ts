import { existsSync, readFileSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

export interface WorkspaceSessionSnapshotStoreCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface WorkspaceSessionSnapshotStoreRunOptions {
  readonly cwd?: string;
}

export interface WorkspaceSessionSnapshotStore {
  readonly schemaVersion: typeof WORKSPACE_SESSION_SNAPSHOT_STORE_SCHEMA_VERSION;
  readonly kind?: string;
  readonly generatedAt: string;
  readonly localOnly: boolean;
  readonly durable: boolean;
  readonly network?: Readonly<Record<string, unknown>>;
  readonly storage: Readonly<Record<string, unknown>>;
  readonly descriptor: Readonly<Record<string, unknown>>;
  readonly session: Readonly<Record<string, unknown>>;
  readonly routes: {
    readonly summary: WorkspaceSessionSnapshotStoreRoute;
    readonly auditPreview: WorkspaceSessionSnapshotStoreRoute;
  };
  readonly validationCommandCount: number;
}

export interface WorkspaceSessionSnapshotStoreRoute {
  readonly method: string;
  readonly path: string;
  readonly requestBodyPresent: boolean;
  readonly responseStatus: number;
  readonly responseBody: Readonly<Record<string, unknown>>;
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

interface RedactionRecord {
  readonly path: string;
  readonly reason: string;
}

interface Redactor {
  readonly redactions: readonly RedactionRecord[];
  redact(value: unknown, valuePath: string): unknown;
}

export const WORKSPACE_SESSION_SNAPSHOT_STORE_SCHEMA_VERSION =
  "workspace-session-persistence/v1";

const DEFAULT_WORKSPACE_SESSION_SNAPSHOT_STORE_FIXTURE =
  "examples/workspace-session/session-store.json";
const HELP_TEXT = {
  usage: [
    "sovereignops workspace-session snapshot inspect --fixture <path>",
    "sovereignops workspace-session-snapshot inspect --fixture <path>",
  ],
  options: {
    fixture:
      `Local workspace/session snapshot store JSON fixture path, for example ${DEFAULT_WORKSPACE_SESSION_SNAPSHOT_STORE_FIXTURE}.`,
  },
};

const BOOLEAN_FLAGS = new Set(["help", "h"]);
const ALLOWED_FLAGS = new Set(["fixture", "help", "h"]);
const PRIVATE_WORKSPACE_SEGMENT = `.codex${"-private"}`;
const PLAN_PACK_SEGMENTS = new Set([
  "codex-pack",
  "plan-pack",
  "sovereignops-codex-pack",
]);
const SENSITIVE_KEY_PATTERN =
  /authorization|cookie|credential|credentials|password|passphrase|secret|api[._-]?key|api[._-]?token|private[._-]?key|access[._-]?token|refresh[._-]?token|root[._-]?key|rootkeyref|lock[._-]?token|token/i;
const SENSITIVE_TEXT_PATTERNS = [
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/g,
  /\b(?:sk-[A-Za-z0-9_-]{8,}|sk_[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,})\b/g,
  /\b((?:apiKey|api[_-]?key|token|password|secret)\s*[:=]\s*)["']?[^"',;\s]+["']?/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];
const RAW_LOCAL_PATH_PATTERNS = [
  /\b[A-Za-z]:[\\/][^\s"',;)}\]]+/g,
  /\\\\[^\\\s"',;)}\]]+[\\][^\s"',;)}\]]+/g,
  /\/\/[^/\s"',;)}\]]+\/[^\s"',;)}\]]+/g,
  /\b(?:\/Users|\/home|\/var|\/tmp|\/private|\/mnt|\/Volumes)\/[^\s"',;)}\]]+/g,
  /\bworkspaces[\\/][^\s"',;)}\]]+/g,
];

export async function runWorkspaceSessionSnapshotStoreCli(
  argv: readonly string[] = [],
  options: WorkspaceSessionSnapshotStoreRunOptions = {},
): Promise<WorkspaceSessionSnapshotStoreCliResult | undefined> {
  const parsed = parseArgv(argv);
  if (!isWorkspaceSessionSnapshotStoreParsedCommand(parsed)) {
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
      kind: "workspace-session-snapshot-store.help",
      ...HELP_TEXT,
    });
  }

  const commandLength = workspaceSessionSnapshotStoreCommandLength(parsed.positionals);
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
    const store = parseSnapshotStore(await readFixtureJson(fixture));

    return jsonSuccess(formatSnapshotStoreInspect(store, fixture));
  } catch (error) {
    if (error instanceof WorkspaceSessionSnapshotStoreError) {
      return jsonFailure(error.exitCode, error.code, error.message, error.details);
    }

    return jsonFailure(
      1,
      "workspace_session_snapshot_store_error",
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function isWorkspaceSessionSnapshotStoreCommand(argv: readonly string[]): boolean {
  return isWorkspaceSessionSnapshotStoreParsedCommand(parseArgv(argv));
}

export async function loadWorkspaceSessionSnapshotStore(
  fixturePath: string,
  options: Pick<WorkspaceSessionSnapshotStoreRunOptions, "cwd"> = {},
): Promise<WorkspaceSessionSnapshotStore> {
  const fixture = await resolveFixturePath(fixturePath, options.cwd ?? process.cwd());
  return parseSnapshotStore(await readFixtureJson(fixture));
}

function formatSnapshotStoreInspect(
  store: WorkspaceSessionSnapshotStore,
  fixture: ResolvedFixturePath,
): Record<string, unknown> {
  const redactor = createRedactor();
  const value = {
    kind: "workspace-session-snapshot-store.inspect",
    schemaVersion: store.schemaVersion,
    fixture: {
      path: fixture.displayPath,
    },
    generatedAt: store.generatedAt,
    localOnly: store.localOnly,
    durable: store.durable,
    network: summarizeNetwork(store.network),
    persistence: summarizePersistence(store),
    routes: {
      summary: summarizeSummaryRoute(store.routes.summary),
      auditPreview: summarizeAuditPreviewRoute(store.routes.auditPreview),
    },
    retention: {
      writes: false,
      rawBodyRetained: false,
      rawRequestBodiesRetained: false,
      requestBodiesOutput: false,
      inspectedSections: [
        "storage",
        "descriptor",
        "session",
        "routes.summary.responseBody",
        "routes.auditPreview.responseBody",
      ],
    },
    validation: {
      commandCount: store.validationCommandCount,
    },
  };
  const redacted = redactor.redact(value, "$");

  return {
    ...(isRecord(redacted) ? redacted : { value: redacted }),
    ...(redactor.redactions.length === 0 ? {} : { redactions: redactor.redactions }),
  };
}

function summarizeNetwork(value: Readonly<Record<string, unknown>> | undefined): Record<string, unknown> {
  if (value === undefined) {
    return {};
  }

  const allowedUriPrefixes = stringArray(value.allowedUriPrefixes);
  return optionalFields({
    mode: optionalString(value.mode),
    allowedUriPrefixCount: allowedUriPrefixes?.length,
    allowedUriPrefixes,
  });
}

function summarizePersistence(store: WorkspaceSessionSnapshotStore): Record<string, unknown> {
  const storagePath = optionalString(store.storage.path) ?? optionalString(store.descriptor.storagePath);
  const operations = stringArray(store.session.operations) ?? [];

  return {
    storage: optionalFields({
      format: optionalString(store.storage.format),
      path: storagePath === undefined ? undefined : redactedPath(storagePath),
      pathRedactedInResponses: optionalBoolean(store.storage.pathRedactedInResponses),
      rawPathsStored: optionalBoolean(store.storage.rawPathsStored),
      rawLockMaterialStored: optionalBoolean(store.storage.rawLockMaterialStored),
    }),
    descriptor: optionalFields({
      workspaceId: optionalString(store.descriptor.workspaceId),
      deviceId: optionalString(store.descriptor.deviceId),
      rootKeyRef: optionalString(store.descriptor.rootKeyRef),
      createdAt: optionalString(store.descriptor.createdAt),
      updatedAt: optionalString(store.descriptor.updatedAt),
      gateway: cloneRecord(store.descriptor.gateway),
    }),
    session: optionalFields({
      sessionRef: redactedId("sessionId", optionalString(store.session.sessionId)),
      state: optionalString(store.session.state),
      operationCount: operations.length,
      operations,
      lastCursor: optionalString(store.session.lastCursor),
      snapshotVersion: optionalInteger(store.session.snapshotVersion),
      openedAt: optionalString(store.session.openedAt),
      lockedAt: optionalString(store.session.lockedAt),
      lockTokenRef: optionalString(store.session.lockTokenRef),
    }),
  };
}

function summarizeSummaryRoute(route: WorkspaceSessionSnapshotStoreRoute): Record<string, unknown> {
  const body = route.responseBody;
  const storage = isRecord(body.storage) ? body.storage : {};
  const gateway = isRecord(body.gateway) ? body.gateway : undefined;
  const session = isRecord(body.session) ? body.session : {};
  const operations = stringArray(session.operations) ?? [];

  return optionalFields({
    method: route.method,
    path: route.path,
    responseStatus: route.responseStatus,
    responseKind: optionalString(body.kind),
    schemaVersion: optionalString(body.schemaVersion),
    localOnly: optionalBoolean(body.localOnly),
    durableWrites: optionalBoolean(body.durableWrites),
    workspaceId: optionalString(body.workspaceId),
    deviceId: optionalString(body.deviceId),
    storage: optionalFields({
      localOnly: optionalBoolean(storage.localOnly),
      storagePath: normalizeResponsePath(storage.storagePath),
      storagePathRedacted: optionalBoolean(storage.storagePathRedacted),
    }),
    gateway: cloneRecord(gateway),
    session: optionalFields({
      sessionRef: redactedId("sessionId", optionalString(session.sessionId)),
      operationCount: operations.length,
      operations,
    }),
    requestBodyPresent: route.requestBodyPresent,
    requestBodyRetained: false,
    requestBodyOutput: false,
  });
}

function summarizeAuditPreviewRoute(route: WorkspaceSessionSnapshotStoreRoute): Record<string, unknown> {
  const body = route.responseBody;
  const events = Array.isArray(body.events) ? body.events : [];
  const audit = isRecord(body.audit) ? body.audit : {};
  const auditRecords = Array.isArray(audit.records)
    ? audit.records
    : Array.isArray(body.records)
    ? body.records
    : [];

  return optionalFields({
    method: route.method,
    path: route.path,
    responseStatus: route.responseStatus,
    responseKind: optionalString(body.kind),
    schemaVersion: optionalString(body.schemaVersion),
    localOnly: optionalBoolean(body.localOnly),
    durableWrites: optionalBoolean(body.durableWrites),
    eventCount: events.length,
    auditRecordCount: auditRecords.length,
    operations: countEventOperations(events),
    actions: countAuditActions(auditRecords),
    redacted: optionalBoolean(audit.redacted),
    requestBodyPresent: route.requestBodyPresent,
    requestBodyRetained: false,
    requestBodyOutput: false,
    summary: isRecord(body.summary)
      ? summarizeSummaryRoute({
        method: "POST",
        path: "/v1/workspace-session/summary",
        requestBodyPresent: false,
        responseStatus: 200,
        responseBody: body.summary,
      })
      : undefined,
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
      throw new WorkspaceSessionSnapshotStoreError({
        exitCode: 2,
        code: "fixture_not_found",
        message: "Fixture file was not found.",
        details: {
          path: displayPath(workspaceRoot, requestedPath),
        },
      });
    }

    throw new WorkspaceSessionSnapshotStoreError({
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
    throw new WorkspaceSessionSnapshotStoreError({
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
    throw new WorkspaceSessionSnapshotStoreError({
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
    throw new WorkspaceSessionSnapshotStoreError({
      exitCode: 2,
      code: "invalid_fixture_json",
      message: "Fixture file must contain valid JSON.",
      details: {
        path: fixture.displayPath,
      },
    });
  }
}

function parseSnapshotStore(value: unknown): WorkspaceSessionSnapshotStore {
  const record = requiredRecord(value, "fixture");
  if (record.schemaVersion !== WORKSPACE_SESSION_SNAPSHOT_STORE_SCHEMA_VERSION) {
    throw invalidFixture(
      `fixture.schemaVersion must be "${WORKSPACE_SESSION_SNAPSHOT_STORE_SCHEMA_VERSION}".`,
    );
  }

  const routes = requiredRecord(record.routes, "fixture.routes");
  const validationCommands = record.validationCommands;
  if (validationCommands !== undefined && !Array.isArray(validationCommands)) {
    throw invalidFixture("fixture.validationCommands must be an array when provided.");
  }

  return {
    schemaVersion: WORKSPACE_SESSION_SNAPSHOT_STORE_SCHEMA_VERSION,
    kind: optionalNonEmptyString(record.kind, "fixture.kind"),
    generatedAt: nonEmptyString(record.generatedAt, "fixture.generatedAt"),
    localOnly: requiredBoolean(record.localOnly, "fixture.localOnly"),
    durable: requiredBoolean(record.durable, "fixture.durable"),
    network: optionalRecord(record.network, "fixture.network"),
    storage: requiredRecord(record.storage, "fixture.storage"),
    descriptor: requiredRecord(record.descriptor, "fixture.descriptor"),
    session: requiredRecord(record.session, "fixture.session"),
    routes: {
      summary: parseSnapshotRoute(routes.summary, "fixture.routes.summary"),
      auditPreview: parseSnapshotRoute(routes.auditPreview, "fixture.routes.auditPreview"),
    },
    validationCommandCount: validationCommands?.length ?? 0,
  };
}

function parseSnapshotRoute(value: unknown, label: string): WorkspaceSessionSnapshotStoreRoute {
  const record = requiredRecord(value, label);
  const responseStatus = record.responseStatus;
  if (!Number.isInteger(responseStatus) || responseStatus < 100 || responseStatus > 599) {
    throw invalidFixture(`${label}.responseStatus must be an HTTP status code.`);
  }

  return {
    method: normalizeMethod(nonEmptyString(record.method, `${label}.method`), `${label}.method`),
    path: normalizeRoutePath(nonEmptyString(record.path, `${label}.path`), `${label}.path`),
    requestBodyPresent: Object.hasOwn(record, "requestBody"),
    responseStatus,
    responseBody: requiredRecord(record.responseBody, `${label}.responseBody`),
  };
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

function isWorkspaceSessionSnapshotStoreParsedCommand(parsed: ParsedArgv): boolean {
  return workspaceSessionSnapshotStoreCommandLength(parsed.positionals) > 0;
}

function workspaceSessionSnapshotStoreCommandLength(positionals: readonly string[]): number {
  if (
    positionals[0] === "workspace" &&
    positionals[1] === "session" &&
    (positionals[2] === "snapshot" || positionals[2] === "snapshot-store") &&
    positionals[3] === "inspect"
  ) {
    return 4;
  }

  if (
    positionals[0] === "workspace-session" &&
    (positionals[1] === "snapshot" || positionals[1] === "snapshot-store") &&
    positionals[2] === "inspect"
  ) {
    return 3;
  }

  if (
    (positionals[0] === "workspace-session-snapshot" ||
      positionals[0] === "workspace-session-snapshot-store") &&
    positionals[1] === "inspect"
  ) {
    return 2;
  }

  return 0;
}

function hasHelp(parsed: ParsedArgv): boolean {
  return parsed.flags.help === true || parsed.flags.h === true;
}

function requireStringFlag(parsed: ParsedArgv, name: string): string {
  const value = parsed.flags[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw usageError(`Missing required option --${name}.`);
  }
  return value;
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

function normalizeMethod(method: string, label: string): string {
  const normalized = method.toUpperCase();
  if (!/^[A-Z]+$/.test(normalized)) {
    throw invalidFixture(`${label} must be an HTTP method token.`);
  }
  return normalized;
}

function normalizeRoutePath(routePath: string, label: string): string {
  if (!routePath.startsWith("/")) {
    throw invalidFixture(`${label} must start with "/".`);
  }

  const withoutSuffix = routePath.trim().split("?")[0].split("#")[0];
  const collapsed = withoutSuffix.replace(/\/+/g, "/");
  return collapsed.length > 1 && collapsed.endsWith("/")
    ? collapsed.slice(0, -1)
    : collapsed;
}

function countEventOperations(events: readonly unknown[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const event of events) {
    const record = isRecord(event) ? event : {};
    const payload = isRecord(record.payload) ? record.payload : {};
    const operation = optionalString(payload.operation);
    if (operation !== undefined) {
      increment(counts, operation);
    }
  }
  return sortedRecord(counts);
}

function countAuditActions(records: readonly unknown[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const record of records) {
    if (!isRecord(record)) {
      continue;
    }
    const action = optionalString(record.action);
    if (action !== undefined) {
      increment(counts, action);
    }
  }
  return sortedRecord(counts);
}

function normalizeResponsePath(value: unknown): string | undefined {
  const pathValue = optionalString(value);
  if (pathValue === undefined) {
    return undefined;
  }
  if (/^\[redacted:path:[A-Za-z0-9_-]+\]$/.test(pathValue)) {
    return pathValue;
  }
  return redactedPath(pathValue);
}

function redactedPath(value: string): string {
  return `[redacted:path:${stableHash(value)}]`;
}

function redactedId(label: string, value: string | undefined): string | undefined {
  return value === undefined ? undefined : `[redacted:${label}:${stableHash(value)}]`;
}

function stableHash(value: string): string {
  const normalized = value.trim().replace(/\\/g, "/");
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;

  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= BigInt(normalized.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }

  return hash.toString(16).padStart(16, "0").slice(0, 12);
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortedRecord(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries([...map.entries()].sort(([left], [right]) =>
    compareStrings(left, right),
  ));
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function nonEmptyString(value: unknown, label: string): string {
  const stringValue = optionalString(value);
  if (stringValue === undefined) {
    throw invalidFixture(`${label} must be a non-empty string.`);
  }
  return stringValue;
}

function optionalNonEmptyString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return nonEmptyString(value, label);
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw invalidFixture(`${label} must be a boolean.`);
  }
  return value;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function optionalInteger(value: unknown): number | undefined {
  return Number.isInteger(value) ? value : undefined;
}

function stringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const strings = value.filter((item): item is string => typeof item === "string");
  return strings.length === value.length ? strings : undefined;
}

function cloneRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? cloneJson(value) : undefined;
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw invalidFixture(`${label} must be an object.`);
  }
  return value;
}

function optionalRecord(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requiredRecord(value, label);
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
        typeof prefix === "string" ? `${prefix}[REDACTED]` : "[REDACTED]"
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

function jsonSuccess(value: unknown): WorkspaceSessionSnapshotStoreCliResult {
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
): WorkspaceSessionSnapshotStoreCliResult {
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

function usageError(message: string): WorkspaceSessionSnapshotStoreError {
  return new WorkspaceSessionSnapshotStoreError({
    exitCode: 2,
    code: "usage_error",
    message,
  });
}

function invalidFixture(message: string): WorkspaceSessionSnapshotStoreError {
  return new WorkspaceSessionSnapshotStoreError({
    exitCode: 2,
    code: "invalid_fixture",
    message,
  });
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function serializePrettyJson(value: unknown): string {
  return JSON.stringify(sortJson(value), null, 2);
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

class WorkspaceSessionSnapshotStoreError extends Error {
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
    this.name = "WorkspaceSessionSnapshotStoreError";
    this.exitCode = options.exitCode;
    this.code = options.code;
    this.details = options.details;
  }
}
