import { existsSync, readFileSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createCatalogImportPlan,
  type CatalogImportError,
  type CatalogImportErrorCode,
} from "../../../services/sync/src/catalogImport.ts";
import { INITIAL_CURSOR, parseCursor } from "../../../services/sync/src/cursors.ts";
import {
  createInMemorySyncRepository,
  type SyncBundleRepository,
} from "../../../services/sync/src/repository.ts";

export interface LocalEventImportsCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface LocalEventImportsRunOptions {
  readonly cwd?: string;
  readonly repository?: SyncBundleRepository;
}

type ParsedFlagValue = string | boolean;

interface ParsedArgv {
  readonly positionals: readonly string[];
  readonly flags: Readonly<Record<string, ParsedFlagValue>>;
  readonly errors: readonly string[];
}

interface ParsedImportCommand {
  readonly commandLength: number;
  readonly action?: string;
}

interface LoadedImportSource {
  readonly input: unknown;
  readonly source: CatalogImportSource;
}

interface ResolvedImportSource {
  readonly absolutePath: string;
  readonly source: CatalogImportSource;
}

interface CatalogImportSource {
  readonly type: "input_path" | "schema_fixture";
  readonly path: string;
  readonly fixture?: string;
  readonly declaredValid?: boolean;
}

interface FixtureCatalogEntry {
  readonly kind: string;
  readonly fixture: string;
  readonly valid: boolean;
}

interface CatalogImportInputBuild {
  readonly input: unknown;
  readonly inputKind: "canonical_local_event_catalog" | "event_replay_catalog" | "unknown";
  readonly workspaceId?: string;
  readonly deviceId?: string;
  readonly baseCursor?: string;
  readonly eventCount?: number;
}

const FIXTURES_DIR = fileURLToPath(new URL("../../schemas/fixtures/", import.meta.url));
const FIXTURE_CATALOG = "canonical-events.catalog.json";
const DEFAULT_FIXTURE = "canonical-events.valid.json";
const DEFAULT_DEVICE_ID = "dev_local_import";
const PRIVATE_WORKSPACE_SEGMENT = `.codex${"-private"}`;
const PLAN_PACK_SEGMENTS = new Set([
  "codex-pack",
  "plan-pack",
  "sovereignops-codex-pack",
]);
const DEVICE_ID_PATTERN = /^dev_[A-Za-z0-9_-]{1,88}$/;
const RECONCILIATION_ERROR_CODES = new Set<CatalogImportErrorCode>([
  "duplicate_event",
  "future_cursor",
  "stale_cursor",
]);

const HELP_TEXT = {
  usage: [
    "sovereignops local events catalog import plan [--fixture <name>|--input-path <path>] [--device-id <id>] [--base-cursor <cursor>] [--dry-run]",
    "sovereignops local-events catalog import plan [--fixture <name>|--input-path <path>] [--device-id <id>] [--base-cursor <cursor>] [--dry-run]",
    "sovereignops local-event-catalog import plan [--fixture <name>|--input-path <path>] [--device-id <id>] [--base-cursor <cursor>] [--dry-run]",
    "sovereignops local-event-catalog-import plan [--fixture <name>|--input-path <path>] [--device-id <id>] [--base-cursor <cursor>] [--dry-run]",
    "sovereignops local-event-catalog-import-plan [--fixture <name>|--input-path <path>] [--device-id <id>] [--base-cursor <cursor>] [--dry-run]",
  ],
  source: {
    fixture: `Bundled packages/schemas fixture name. Defaults to ${DEFAULT_FIXTURE}.`,
    inputPath: "Local JSON catalog path inside this repository.",
  },
  planning: {
    baseCursor: `Import reconciliation cursor. Defaults to ${INITIAL_CURSOR}.`,
    deviceId: `Target import device id. Defaults to ${DEFAULT_DEVICE_ID}.`,
    dryRun: "Only dry-run import planning is supported; repositories are not mutated.",
  },
};

const BOOLEAN_FLAGS = new Set(["dry-run", "help", "h"]);
const ALLOWED_FLAGS = new Set([
  "base-cursor",
  "device-id",
  "dry-run",
  "fixture",
  "h",
  "help",
  "input-path",
  "path",
  "target-device-id",
]);
const FIXTURE_ALIASES = new Map<string, string>([
  ["default", DEFAULT_FIXTURE],
  ["valid", DEFAULT_FIXTURE],
  ["invalid", "canonical-events.invalid.json"],
]);

export async function runLocalEventImportsCli(
  argv: readonly string[] = [],
  options: LocalEventImportsRunOptions = {},
): Promise<LocalEventImportsCliResult | undefined> {
  const parsed = parseArgv(argv);
  const command = parseLocalEventImportCommand(parsed.positionals);
  if (command === undefined) {
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
      kind: "local-events.catalog-import-plan.help",
      ...HELP_TEXT,
    });
  }

  const action = command.action ?? "plan";
  const extraPositionals = parsed.positionals.slice(command.commandLength);
  if (extraPositionals.length > 0) {
    return jsonFailure(
      2,
      "usage_error",
      `Unexpected positional argument: ${extraPositionals[0]}`,
    );
  }

  if (action !== "plan") {
    return jsonFailure(
      1,
      "unknown_command",
      `Unknown local event catalog import command: ${parsed.positionals.join(" ")}`,
    );
  }

  try {
    assertDryRunOnly(parsed);
    const source = await readImportSource(parsed, options);
    const baseCursor = optionalBaseCursorFlag(parsed);
    const deviceId = optionalDeviceIdFlag(parsed);
    const built = buildCatalogImportInput(source.input, {
      baseCursor,
      deviceId,
    });
    const repository = options.repository ?? createInMemorySyncRepository();
    const plan = createCatalogImportPlan(repository, built.input);

    if (!plan.ok) {
      return jsonFailure(
        exitCodeForCatalogImportError(plan.error),
        plan.error.code,
        plan.error.message,
        catalogImportErrorDetails(plan.error, source.source, built),
      );
    }

    return jsonSuccess({
      kind: "local-events.catalog-import-plan",
      dryRun: true,
      source: source.source,
      request: {
        baseCursor: built.baseCursor ?? INITIAL_CURSOR,
        deviceId: built.deviceId ?? deviceId ?? DEFAULT_DEVICE_ID,
      },
      catalog: pruneUndefined({
        inputKind: built.inputKind,
        workspaceId: built.workspaceId,
        eventCount: built.eventCount,
      }),
      plan: plan.value.summary,
    });
  } catch (error) {
    if (error instanceof LocalEventImportError) {
      return jsonFailure(error.exitCode, error.code, error.message, error.details);
    }

    return jsonFailure(
      1,
      "local_event_import_error",
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function isLocalEventImportsCommand(argv: readonly string[]): boolean {
  return parseLocalEventImportCommand(parseArgv(argv).positionals) !== undefined;
}

async function readImportSource(
  parsed: ParsedArgv,
  options: LocalEventImportsRunOptions,
): Promise<LoadedImportSource> {
  const fixture = optionalStringFlag(parsed, "fixture");
  const inputPath = exclusiveInputPath(parsed);
  if (fixture !== undefined && inputPath !== undefined) {
    throw usageError("Use only one of --fixture or --input-path.");
  }

  const resolved =
    inputPath === undefined
      ? await readFixtureSource(fixture ?? DEFAULT_FIXTURE)
      : await readInputPathSource(inputPath, options.cwd ?? process.cwd());
  return {
    input: await readJsonSource(resolved),
    source: resolved.source,
  };
}

async function readFixtureSource(value: string): Promise<ResolvedImportSource> {
  const fixture = normalizeFixtureName(value);
  const entries = await readFixtureCatalog();
  const entry = entries.find((candidate) => candidate.fixture === fixture);
  if (entry === undefined) {
    throw new LocalEventImportError({
      exitCode: 2,
      code: "fixture_not_found",
      message: "Bundled canonical event fixture was not found.",
      details: {
        fixture,
        availableFixtures: entries.map((candidate) => candidate.fixture).sort(),
      },
    });
  }

  const fixturePath = path.join(FIXTURES_DIR, entry.fixture);
  const workspaceRoot = findWorkspaceRoot(path.dirname(fixturePath));
  return {
    absolutePath: fixturePath,
    source: {
      type: "schema_fixture",
      fixture: entry.fixture,
      path: workspaceRoot === undefined ? fixturePath : displayPath(workspaceRoot, fixturePath),
      declaredValid: entry.valid,
    },
  };
}

async function readInputPathSource(
  value: string,
  cwd: string,
): Promise<ResolvedImportSource> {
  const input = cleanPathFlag(value, "input-path");
  assertNotPlanPackPath(input, "input-path");

  const cwdPath = path.resolve(cwd);
  const cwdRelativePath = path.resolve(cwdPath, input);
  const workspaceRoot =
    findWorkspaceRoot(cwdPath) ?? findWorkspaceRoot(path.dirname(cwdRelativePath));
  if (workspaceRoot === undefined) {
    throw usageError("Could not locate the SovereignOps workspace root for --input-path.");
  }

  const requestedPath = path.isAbsolute(input)
    ? path.resolve(input)
    : path.resolve(workspaceRoot, input);
  assertPathInsideWorkspace(workspaceRoot, requestedPath, "input-path");
  assertNotPrivatePath(workspaceRoot, requestedPath, "input-path");
  assertNotPlanPackPath(requestedPath, "input-path");
  if (path.extname(requestedPath) !== ".json") {
    throw usageError("Option --input-path must point to a .json file.");
  }

  let fileStat: Awaited<ReturnType<typeof stat>>;
  try {
    fileStat = await stat(requestedPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new LocalEventImportError({
        exitCode: 2,
        code: "input_not_found",
        message: "Input catalog file was not found.",
        details: {
          path: displayPath(workspaceRoot, requestedPath),
        },
      });
    }

    throw new LocalEventImportError({
      exitCode: 1,
      code: "input_stat_error",
      message: "Could not inspect input catalog file.",
      details: {
        path: displayPath(workspaceRoot, requestedPath),
        cause: error instanceof Error ? error.message : String(error),
      },
    });
  }

  if (!fileStat.isFile()) {
    throw new LocalEventImportError({
      exitCode: 2,
      code: "input_not_file",
      message: "Option --input-path must point to a file.",
      details: {
        path: displayPath(workspaceRoot, requestedPath),
      },
    });
  }

  const actualPath = await realpath(requestedPath);
  assertPathInsideWorkspace(workspaceRoot, actualPath, "input-path");
  assertNotPrivatePath(workspaceRoot, actualPath, "input-path");
  assertNotPlanPackPath(actualPath, "input-path");

  return {
    absolutePath: actualPath,
    source: {
      type: "input_path",
      path: displayPath(workspaceRoot, actualPath),
    },
  };
}

async function readJsonSource(source: ResolvedImportSource): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(source.absolutePath, "utf8");
  } catch (error) {
    throw new LocalEventImportError({
      exitCode: 1,
      code: "catalog_read_error",
      message: "Could not read local event import catalog.",
      details: {
        path: source.source.path,
        cause: error instanceof Error ? error.message : String(error),
      },
    });
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new LocalEventImportError({
      exitCode: 2,
      code: "invalid_catalog_json",
      message: "Local event import catalog must contain valid JSON.",
      details: {
        path: source.source.path,
      },
    });
  }
}

async function readFixtureCatalog(): Promise<readonly FixtureCatalogEntry[]> {
  const catalogPath = path.join(FIXTURES_DIR, FIXTURE_CATALOG);
  let value: unknown;
  try {
    value = JSON.parse(await readFile(catalogPath, "utf8"));
  } catch (error) {
    throw new LocalEventImportError({
      exitCode: 1,
      code: "fixture_catalog_read_error",
      message: "Could not read bundled canonical event fixture catalog.",
      details: {
        path: catalogPath,
        cause: error instanceof Error ? error.message : String(error),
      },
    });
  }

  if (!isRecord(value) || !Array.isArray(value.fixtures)) {
    throw new LocalEventImportError({
      exitCode: 1,
      code: "fixture_catalog_invalid",
      message: "Bundled canonical event fixture catalog has an invalid shape.",
    });
  }

  return value.fixtures
    .filter((entry): entry is FixtureCatalogEntry => {
      return (
        isRecord(entry) &&
        entry.kind === "canonicalLocalEventCatalog" &&
        typeof entry.fixture === "string" &&
        typeof entry.valid === "boolean"
      );
    })
    .sort((left, right) => left.fixture.localeCompare(right.fixture));
}

function buildCatalogImportInput(
  value: unknown,
  options: {
    readonly baseCursor?: string;
    readonly deviceId?: string;
  },
): CatalogImportInputBuild {
  if (!isRecord(value)) {
    return {
      input: value,
      inputKind: "unknown",
    };
  }

  const inputKind = readInputKind(value);
  const baseCursor = options.baseCursor ?? readOptionalString(value.baseCursor) ?? INITIAL_CURSOR;
  const deviceId = options.deviceId ?? readOptionalString(value.deviceId) ?? DEFAULT_DEVICE_ID;
  const workspaceId = readOptionalString(value.workspaceId);
  const eventCount = Array.isArray(value.events) ? value.events.length : undefined;

  if (inputKind === "event_replay_catalog") {
    const input = cloneJson(value);
    input.baseCursor = baseCursor;
    input.deviceId = deviceId;
    if (options.baseCursor !== undefined) {
      delete input.digest;
    }

    return {
      input,
      inputKind,
      workspaceId,
      deviceId,
      baseCursor,
      eventCount,
    };
  }

  return {
    input: pruneUndefined({
      workspaceId,
      deviceId,
      baseCursor,
      events: cloneJson(value.events),
    }),
    inputKind,
    workspaceId,
    deviceId,
    baseCursor,
    eventCount,
  };
}

function readInputKind(
  value: Record<string, unknown>,
): CatalogImportInputBuild["inputKind"] {
  if (value.schemaVersion === "canonical-local-event-catalog/v1") {
    return "canonical_local_event_catalog";
  }
  if (value.deviceId !== undefined && value.workspaceId !== undefined && value.events !== undefined) {
    return "event_replay_catalog";
  }
  return "unknown";
}

function catalogImportErrorDetails(
  error: CatalogImportError,
  source: CatalogImportSource,
  built: CatalogImportInputBuild,
): Record<string, unknown> {
  return pruneUndefined({
    source,
    catalog: pruneUndefined({
      inputKind: built.inputKind,
      workspaceId: built.workspaceId,
      eventCount: built.eventCount,
    }),
    validationIssues: error.validationIssues,
    eventId: error.eventId,
    baseCursor: error.baseCursor,
    remoteCursor: error.remoteCursor,
    reconciliation: error.reconciliation,
    planSummary: error.planSummary,
  });
}

function exitCodeForCatalogImportError(error: CatalogImportError): number {
  if (
    error.code === "validation_failed" ||
    RECONCILIATION_ERROR_CODES.has(error.code)
  ) {
    return 2;
  }
  return 1;
}

function assertDryRunOnly(parsed: ParsedArgv): void {
  const value = parsed.flags["dry-run"];
  if (value === undefined || value === true) {
    return;
  }
  throw usageError("Only --dry-run import planning is supported.");
}

function exclusiveInputPath(parsed: ParsedArgv): string | undefined {
  const inputPath = optionalStringFlag(parsed, "input-path");
  const pathAlias = optionalStringFlag(parsed, "path");
  if (inputPath !== undefined && pathAlias !== undefined) {
    throw usageError("Use either --input-path or --path, not both.");
  }
  return inputPath ?? pathAlias;
}

function optionalBaseCursorFlag(parsed: ParsedArgv): string | undefined {
  const value = optionalStringFlag(parsed, "base-cursor");
  if (value === undefined) {
    return undefined;
  }

  try {
    parseCursor(value);
  } catch (error) {
    throw usageError(
      `Option --base-cursor is invalid: ${
        error instanceof Error ? error.message : "cursor is invalid"
      }.`,
    );
  }
  return value;
}

function optionalDeviceIdFlag(parsed: ParsedArgv): string | undefined {
  const deviceId = optionalStringFlag(parsed, "device-id");
  const targetDeviceId = optionalStringFlag(parsed, "target-device-id");
  if (deviceId !== undefined && targetDeviceId !== undefined) {
    throw usageError("Use either --device-id or --target-device-id, not both.");
  }

  const value = deviceId ?? targetDeviceId;
  if (value === undefined) {
    return undefined;
  }
  if (!DEVICE_ID_PATTERN.test(value)) {
    throw usageError("Option --device-id must use the dev_ id prefix.");
  }
  return value;
}

function normalizeFixtureName(value: string): string {
  const fixture = FIXTURE_ALIASES.get(value) ?? value;
  if (fixture.trim().length === 0) {
    throw usageError("Option --fixture requires a non-empty fixture name.");
  }
  if (
    fixture.includes("\0") ||
    fixture.includes("/") ||
    fixture.includes("\\") ||
    path.isAbsolute(fixture)
  ) {
    throw usageError("Option --fixture must be a bundled fixture file name, not a path.");
  }
  if (path.extname(fixture) !== ".json") {
    throw usageError("Option --fixture must name a .json fixture.");
  }
  return fixture;
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

function parseLocalEventImportCommand(
  positionals: readonly string[],
): ParsedImportCommand | undefined {
  if (positionals[0] === "local-event-catalog-import-plan") {
    return { commandLength: 1, action: "plan" };
  }
  if (positionals[0] === "local-event-catalog-import") {
    return {
      commandLength: Math.min(positionals.length, 2),
      action: positionals[1] ?? "plan",
    };
  }

  const baseLength = localEventCatalogBaseLength(positionals);
  if (baseLength === 0) {
    return undefined;
  }

  const tail = positionals.slice(baseLength);
  if (tail[0] === "import" || tail[0] === "imports") {
    return {
      commandLength: baseLength + Math.min(tail.length, 2),
      action: tail[1] ?? "plan",
    };
  }
  if (tail[0] === "import-plan") {
    return {
      commandLength: baseLength + 1,
      action: "plan",
    };
  }

  return undefined;
}

function localEventCatalogBaseLength(positionals: readonly string[]): number {
  if (
    positionals[0] === "local" &&
    (positionals[1] === "events" || positionals[1] === "event") &&
    positionals[2] === "catalog"
  ) {
    return 3;
  }
  if (positionals[0] === "local-events" && positionals[1] === "catalog") {
    return 2;
  }
  if (positionals[0] === "local-event-catalog") {
    return 1;
  }
  return 0;
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
    throw usageError(`Option --${flagName} must not reference plan-pack paths.`);
  }
}

function displayPath(workspaceRoot: string, candidatePath: string): string {
  return path.relative(workspaceRoot, candidatePath).split(path.sep).join("/");
}

function hasHelp(parsed: ParsedArgv): boolean {
  return parsed.flags.help === true || parsed.flags.h === true;
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

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function jsonSuccess(value: unknown): LocalEventImportsCliResult {
  return {
    exitCode: 0,
    stdout: `${serializeDeterministicJson(value)}\n`,
    stderr: "",
  };
}

function jsonFailure(
  exitCode: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): LocalEventImportsCliResult {
  return {
    exitCode,
    stdout: "",
    stderr: `${serializeDeterministicJson({
      error: pruneUndefined({
        code,
        message,
        details: details && Object.keys(details).length > 0 ? details : undefined,
      }),
    })}\n`,
  };
}

function usageError(message: string): LocalEventImportError {
  return new LocalEventImportError({
    exitCode: 2,
    code: "usage_error",
    message,
  });
}

function serializeDeterministicJson(value: unknown): string {
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
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJson(nested)]),
    );
  }
  return value;
}

function cloneJson<TValue>(value: TValue): TValue {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as TValue;
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class LocalEventImportError extends Error {
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
    this.name = "LocalEventImportError";
    this.exitCode = options.exitCode;
    this.code = options.code;
    this.details = options.details;
  }
}
