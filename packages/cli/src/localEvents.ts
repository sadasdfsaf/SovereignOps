import { existsSync, readFileSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalLocalEventOperations,
  canonicalSharedSchemaKinds,
  getCanonicalLocalEventDigest,
  validateCanonicalLocalEventCatalog,
  type CanonicalLocalEvent,
  type CanonicalLocalEventCatalog,
  type CanonicalLocalEventOperation,
  type CanonicalSharedSchemaKind,
} from "../../schemas/src/eventCatalog.ts";

export interface LocalEventsCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface LocalEventsRunOptions {
  readonly cwd?: string;
}

type ParsedFlagValue = string | boolean;

interface ParsedArgv {
  readonly positionals: readonly string[];
  readonly flags: Readonly<Record<string, ParsedFlagValue>>;
  readonly errors: readonly string[];
}

interface LoadedCatalog {
  readonly catalog: CanonicalLocalEventCatalog;
  readonly source: CatalogSource;
}

interface ResolvedCatalogSource {
  readonly absolutePath: string;
  readonly source: CatalogSource;
}

interface CatalogSource {
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

interface LocalEventFilters {
  readonly actorId?: string;
  readonly fromSequence?: number;
  readonly limit?: number;
  readonly operation?: CanonicalLocalEventOperation;
  readonly recordId?: string;
  readonly schemaKind?: CanonicalSharedSchemaKind;
  readonly toSequence?: number;
}

interface ReplayRecord {
  readonly approvalId?: string;
  readonly approvalStatus?: string;
  readonly currentDigest?: string;
  readonly deleted: boolean;
  readonly lastEventId: string;
  readonly lastOperation: CanonicalLocalEventOperation;
  readonly lastSequence: number;
  readonly recordId: string;
  readonly redactedEvents: number;
  readonly redactedFieldCount: number;
  readonly schemaKind: CanonicalSharedSchemaKind;
  readonly summary: string;
  readonly targetId?: string;
}

const FIXTURES_DIR = fileURLToPath(new URL("../../schemas/fixtures/", import.meta.url));
const FIXTURE_CATALOG = "canonical-events.catalog.json";
const DEFAULT_FIXTURE = "canonical-events.valid.json";

const HELP_TEXT = {
  usage: [
    "sovereignops local events catalog inspect [--fixture <name>|--input-path <path>] [filters]",
    "sovereignops local events catalog replay [--fixture <name>|--input-path <path>] [filters]",
    "sovereignops local-events catalog inspect [--fixture <name>|--input-path <path>] [filters]",
    "sovereignops local-event-catalog replay [--fixture <name>|--input-path <path>] [filters]",
  ],
  source: {
    fixture: `Bundled packages/schemas fixture name. Defaults to ${DEFAULT_FIXTURE}.`,
    inputPath: "Local JSON catalog path inside this repository.",
  },
  filters: {
    actorId: "Keep events from one actor id.",
    fromSequence: "Keep events with sequence >= this positive integer.",
    limit: "Maximum number of matched events to return.",
    operation: "Keep events with one canonical local event operation.",
    recordId: "Keep events whose payload recordId or targetId matches this id.",
    schemaKind: "Keep events with one canonical shared schema kind.",
    toSequence: "Keep events with sequence <= this positive integer.",
  },
};

const BOOLEAN_FLAGS = new Set(["help", "h"]);
const ALLOWED_FLAGS = new Set([
  "actor-id",
  "fixture",
  "from-sequence",
  "h",
  "help",
  "input-path",
  "limit",
  "operation",
  "path",
  "record-id",
  "schema-kind",
  "to-sequence",
]);

const FIXTURE_ALIASES = new Map<string, string>([
  ["default", DEFAULT_FIXTURE],
  ["valid", DEFAULT_FIXTURE],
  ["invalid", "canonical-events.invalid.json"],
]);

export async function runLocalEventsCli(
  argv: readonly string[] = [],
  options: LocalEventsRunOptions = {},
): Promise<LocalEventsCliResult | undefined> {
  const parsed = parseArgv(argv);
  if (!isLocalEventsParsedCommand(parsed)) {
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
      kind: "local-events.catalog.help",
      ...HELP_TEXT,
    });
  }

  const commandLength = localEventsCommandLength(parsed.positionals);
  const [action, ...extraPositionals] = parsed.positionals.slice(commandLength);
  if (action === undefined) {
    return jsonSuccess({
      kind: "local-events.catalog.help",
      ...HELP_TEXT,
    });
  }
  if (extraPositionals.length > 0) {
    return jsonFailure(
      2,
      "usage_error",
      `Unexpected positional argument: ${extraPositionals[0]}`,
    );
  }

  try {
    const loaded = await readCatalog(parsed, options);
    const filters = readFilters(parsed);
    const events = applyFilters(loaded.catalog.events, filters);

    if (action === "inspect" || action === "summary") {
      return jsonSuccess(inspectCatalog(loaded, events, filters));
    }

    if (action === "replay") {
      return jsonSuccess(replayCatalog(loaded, events, filters));
    }
  } catch (error) {
    if (error instanceof LocalEventsError) {
      return jsonFailure(error.exitCode, error.code, error.message, error.details);
    }

    return jsonFailure(
      1,
      "local_events_error",
      error instanceof Error ? error.message : String(error),
    );
  }

  return jsonFailure(
    1,
    "unknown_command",
    `Unknown local event catalog command: ${parsed.positionals.join(" ")}`,
  );
}

export function isLocalEventsCommand(argv: readonly string[]): boolean {
  return isLocalEventsParsedCommand(parseArgv(argv));
}

function inspectCatalog(
  loaded: LoadedCatalog,
  events: readonly CanonicalLocalEvent[],
  filters: LocalEventFilters,
): unknown {
  const catalog = loaded.catalog;
  return pruneUndefined({
    kind: "local-events.catalog-inspect",
    schemaVersion: catalog.schemaVersion,
    generatedAt: catalog.generatedAt,
    workspaceId: catalog.workspaceId,
    localOnly: catalog.localOnly,
    source: loaded.source,
    filters: isEmptyRecord(filters) ? undefined : filters,
    totalEvents: catalog.events.length,
    matchedEvents: events.length,
    summary: summarizeEvents(events),
    events: events.map((event) =>
      pruneUndefined({
        actorId: event.actorId,
        id: event.id,
        occurredAt: event.occurredAt,
        operation: event.operation,
        payloadDigest: event.payloadDigest,
        previousDigest: event.previousDigest,
        recordedAt: event.recordedAt,
        recordId: event.payload.recordId,
        redaction: {
          redacted: event.redactionMetadata.redacted,
          redactedFieldCount: event.redactionMetadata.redactedFieldCount,
        },
        schemaKind: event.payload.schemaKind,
        sequence: event.sequence,
        summary: event.payload.summary,
        targetId: event.payload.targetId,
      }),
    ),
  });
}

function replayCatalog(
  loaded: LoadedCatalog,
  events: readonly CanonicalLocalEvent[],
  filters: LocalEventFilters,
): unknown {
  const catalog = loaded.catalog;
  const lastEvent = events.at(-1);
  return pruneUndefined({
    kind: "local-events.catalog-replay",
    schemaVersion: catalog.schemaVersion,
    generatedAt: catalog.generatedAt,
    workspaceId: catalog.workspaceId,
    localOnly: catalog.localOnly,
    source: loaded.source,
    filters: isEmptyRecord(filters) ? undefined : filters,
    totalEvents: catalog.events.length,
    replayedEvents: events.length,
    terminalDigest: lastEvent === undefined ? null : getCanonicalLocalEventDigest(lastEvent),
    steps: events.map(replayStep),
    records: replayRecords(events),
  });
}

function summarizeEvents(events: readonly CanonicalLocalEvent[]): unknown {
  return {
    actors: countBy(events, (event) => event.actorId),
    firstSequence: events[0]?.sequence ?? null,
    lastSequence: events.at(-1)?.sequence ?? null,
    operations: countBy(events, (event) => event.operation),
    recordIds: countBy(events, (event) => event.payload.recordId),
    redactedEvents: events.filter((event) => event.redactionMetadata.redacted).length,
    redactedFieldCount: events.reduce(
      (total, event) => total + event.redactionMetadata.redactedFieldCount,
      0,
    ),
    schemaKinds: countBy(events, (event) => event.payload.schemaKind),
  };
}

function replayStep(event: CanonicalLocalEvent): unknown {
  return pruneUndefined({
    actorId: event.actorId,
    afterDigest: event.payload.afterDigest,
    approvalId: event.payload.approvalId,
    approvalStatus: event.payload.approvalStatus,
    beforeDigest: event.payload.beforeDigest,
    decision: event.payload.decision,
    eventDigest: getCanonicalLocalEventDigest(event),
    eventId: event.id,
    occurredAt: event.occurredAt,
    operation: event.operation,
    payloadDigest: event.payloadDigest,
    previousDigest: event.previousDigest,
    recordedAt: event.recordedAt,
    recordId: event.payload.recordId,
    redacted: event.redactionMetadata.redacted,
    schemaKind: event.payload.schemaKind,
    sequence: event.sequence,
    summary: event.payload.summary,
    targetId: event.payload.targetId,
  });
}

function replayRecords(events: readonly CanonicalLocalEvent[]): readonly ReplayRecord[] {
  const records = new Map<string, ReplayRecord>();

  for (const event of events) {
    const payload = event.payload;
    const key = `${payload.schemaKind}:${payload.recordId}`;
    const current = records.get(key);
    const currentDigest = payload.afterDigest ?? payload.beforeDigest ?? current?.currentDigest;
    const redactedEvents =
      (current?.redactedEvents ?? 0) + (event.redactionMetadata.redacted ? 1 : 0);
    const redactedFieldCount =
      (current?.redactedFieldCount ?? 0) + event.redactionMetadata.redactedFieldCount;

    records.set(
      key,
      pruneUndefined({
        approvalId: payload.approvalId ?? current?.approvalId,
        approvalStatus: payload.approvalStatus ?? current?.approvalStatus,
        currentDigest,
        deleted: event.operation === "delete",
        lastEventId: event.id,
        lastOperation: event.operation,
        lastSequence: event.sequence,
        recordId: payload.recordId,
        redactedEvents,
        redactedFieldCount,
        schemaKind: payload.schemaKind,
        summary: payload.summary,
        targetId: payload.targetId ?? current?.targetId,
      }),
    );
  }

  return [...records.values()].sort(
    (left, right) =>
      left.schemaKind.localeCompare(right.schemaKind) ||
      left.recordId.localeCompare(right.recordId),
  );
}

async function readCatalog(
  parsed: ParsedArgv,
  options: LocalEventsRunOptions,
): Promise<LoadedCatalog> {
  const fixture = optionalStringFlag(parsed, "fixture");
  const inputPath = exclusiveInputPath(parsed);
  if (fixture !== undefined && inputPath !== undefined) {
    throw usageError("Use only one of --fixture or --input-path.");
  }

  const source =
    inputPath === undefined
      ? await readFixtureSource(fixture ?? DEFAULT_FIXTURE)
      : await readInputPathSource(inputPath, options.cwd ?? process.cwd());

  const json = await readJsonSource(source);
  const result = validateCanonicalLocalEventCatalog(json);
  if (!result.ok || result.value === undefined) {
    throw new LocalEventsError({
      exitCode: 2,
      code: "invalid_catalog",
      message: "Canonical local event catalog validation failed.",
      details: {
        source: source.source,
        issues: result.issues,
      },
    });
  }

  return {
    catalog: result.value,
    source: source.source,
  };
}

function exclusiveInputPath(parsed: ParsedArgv): string | undefined {
  const inputPath = optionalStringFlag(parsed, "input-path");
  const pathAlias = optionalStringFlag(parsed, "path");
  if (inputPath !== undefined && pathAlias !== undefined) {
    throw usageError("Use either --input-path or --path, not both.");
  }
  return inputPath ?? pathAlias;
}

async function readFixtureSource(value: string): Promise<ResolvedCatalogSource> {
  const fixture = normalizeFixtureName(value);
  const entries = await readFixtureCatalog();
  const entry = entries.find((candidate) => candidate.fixture === fixture);
  if (entry === undefined) {
    throw new LocalEventsError({
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
): Promise<ResolvedCatalogSource> {
  const input = cleanPathFlag(value, "input-path");
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
  if (path.extname(requestedPath) !== ".json") {
    throw usageError("Option --input-path must point to a .json file.");
  }

  let fileStat: Awaited<ReturnType<typeof stat>>;
  try {
    fileStat = await stat(requestedPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new LocalEventsError({
        exitCode: 2,
        code: "input_not_found",
        message: "Input catalog file was not found.",
        details: {
          path: displayPath(workspaceRoot, requestedPath),
        },
      });
    }

    throw new LocalEventsError({
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
    throw new LocalEventsError({
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

  return {
    absolutePath: actualPath,
    source: {
      type: "input_path",
      path: displayPath(workspaceRoot, actualPath),
    },
  };
}

async function readJsonSource(source: ResolvedCatalogSource): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(source.absolutePath, "utf8");
  } catch (error) {
    throw new LocalEventsError({
      exitCode: 1,
      code: "catalog_read_error",
      message: "Could not read canonical local event catalog.",
      details: {
        path: source.source.path,
        cause: error instanceof Error ? error.message : String(error),
      },
    });
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new LocalEventsError({
      exitCode: 2,
      code: "invalid_catalog_json",
      message: "Canonical local event catalog must contain valid JSON.",
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
    throw new LocalEventsError({
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
    throw new LocalEventsError({
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

function readFilters(parsed: ParsedArgv): LocalEventFilters {
  const fromSequence = optionalPositiveIntegerFlag(parsed, "from-sequence");
  const toSequence = optionalPositiveIntegerFlag(parsed, "to-sequence");
  if (
    fromSequence !== undefined &&
    toSequence !== undefined &&
    fromSequence > toSequence
  ) {
    throw usageError("Option --from-sequence must be less than or equal to --to-sequence.");
  }

  return pruneUndefined({
    actorId: optionalPrefixedIdFlag(parsed, "actor-id", "act"),
    fromSequence,
    limit: optionalPositiveIntegerFlag(parsed, "limit"),
    operation: optionalOperationFlag(parsed),
    recordId: optionalRecordIdFlag(parsed),
    schemaKind: optionalSchemaKindFlag(parsed),
    toSequence,
  });
}

function applyFilters(
  events: readonly CanonicalLocalEvent[],
  filters: LocalEventFilters,
): readonly CanonicalLocalEvent[] {
  const matched = events.filter((event) => {
    return (
      (filters.actorId === undefined || event.actorId === filters.actorId) &&
      (filters.fromSequence === undefined || event.sequence >= filters.fromSequence) &&
      (filters.operation === undefined || event.operation === filters.operation) &&
      (filters.recordId === undefined ||
        event.payload.recordId === filters.recordId ||
        event.payload.targetId === filters.recordId) &&
      (filters.schemaKind === undefined || event.payload.schemaKind === filters.schemaKind) &&
      (filters.toSequence === undefined || event.sequence <= filters.toSequence)
    );
  });

  return filters.limit === undefined ? matched : matched.slice(0, filters.limit);
}

function optionalOperationFlag(parsed: ParsedArgv): CanonicalLocalEventOperation | undefined {
  const value = optionalStringFlag(parsed, "operation");
  if (value === undefined) {
    return undefined;
  }
  if (!canonicalLocalEventOperations.includes(value as CanonicalLocalEventOperation)) {
    throw usageError(
      `Option --operation must be one of ${canonicalLocalEventOperations.join(", ")}.`,
    );
  }
  return value as CanonicalLocalEventOperation;
}

function optionalSchemaKindFlag(parsed: ParsedArgv): CanonicalSharedSchemaKind | undefined {
  const value = optionalStringFlag(parsed, "schema-kind");
  if (value === undefined) {
    return undefined;
  }
  if (!canonicalSharedSchemaKinds.includes(value as CanonicalSharedSchemaKind)) {
    throw usageError(`Option --schema-kind must be one of ${canonicalSharedSchemaKinds.join(", ")}.`);
  }
  return value as CanonicalSharedSchemaKind;
}

function optionalRecordIdFlag(parsed: ParsedArgv): string | undefined {
  const value = optionalStringFlag(parsed, "record-id");
  if (value === undefined) {
    return undefined;
  }
  if (!/^(?:doc|prj|inc|cmt|att|apv)_[A-Za-z0-9_-]{1,88}$/.test(value)) {
    throw usageError("Option --record-id must be a canonical shared record id.");
  }
  return value;
}

function optionalPrefixedIdFlag(
  parsed: ParsedArgv,
  name: string,
  prefix: string,
): string | undefined {
  const value = optionalStringFlag(parsed, name);
  if (value === undefined) {
    return undefined;
  }
  if (!new RegExp(`^${prefix}_[A-Za-z0-9_-]{1,88}$`).test(value)) {
    throw usageError(`Option --${name} must use the ${prefix}_ id prefix.`);
  }
  return value;
}

function optionalPositiveIntegerFlag(parsed: ParsedArgv, name: string): number | undefined {
  const value = optionalStringFlag(parsed, name);
  if (value === undefined) {
    return undefined;
  }
  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    throw usageError(`Option --${name} must be a positive integer.`);
  }
  return parsedValue;
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

function countBy<TValue>(
  values: readonly TValue[],
  selector: (value: TValue) => string,
): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = selector(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  ));
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

function isLocalEventsParsedCommand(parsed: ParsedArgv): boolean {
  return localEventsCommandLength(parsed.positionals) > 0;
}

function localEventsCommandLength(positionals: readonly string[]): number {
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

function jsonSuccess(value: unknown): LocalEventsCliResult {
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
): LocalEventsCliResult {
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

function usageError(message: string): LocalEventsError {
  return new LocalEventsError({
    exitCode: 2,
    code: "usage_error",
    message,
  });
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

function isEmptyRecord(value: Record<string, unknown>): boolean {
  return Object.keys(value).length === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class LocalEventsError extends Error {
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
    this.name = "LocalEventsError";
    this.exitCode = options.exitCode;
    this.code = options.code;
    this.details = options.details;
  }
}
