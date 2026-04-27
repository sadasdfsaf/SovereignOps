import { existsSync, readFileSync } from "node:fs";
import { realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  fingerprintAuditExport,
  serializeDeterministicJson,
} from "../../audit-export/src/index.ts";
import { runLocalEventsCli } from "./localEvents.ts";

export interface LocalEventExportsCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface LocalEventExportsRunOptions {
  readonly cwd?: string;
}

type ParsedFlagValue = string | boolean;
type LocalEventExportFormat = "jsonl" | "csv" | "package";

interface ParsedArgv {
  readonly positionals: readonly string[];
  readonly flags: Readonly<Record<string, ParsedFlagValue>>;
  readonly errors: readonly string[];
}

interface ParsedExportCommand {
  readonly commandLength: number;
  readonly format?: string;
}

export interface LocalEventReplayExportInput {
  readonly kind: "local-events.catalog-replay";
  readonly generatedAt: string;
  readonly workspaceId: string;
  readonly source: Record<string, unknown>;
  readonly filters?: Record<string, unknown>;
  readonly totalEvents: number;
  readonly replayedEvents: number;
  readonly terminalDigest: string | null;
  readonly steps: readonly LocalEventReplayExportStep[];
  readonly records: readonly Record<string, unknown>[];
}

export interface LocalEventReplayExportStep {
  readonly actorId: string;
  readonly afterDigest?: string;
  readonly approvalId?: string;
  readonly approvalStatus?: string;
  readonly beforeDigest?: string;
  readonly decision?: string;
  readonly eventDigest: string;
  readonly eventId: string;
  readonly occurredAt: string;
  readonly operation: string;
  readonly previousDigest: string | null;
  readonly recordedAt: string;
  readonly recordId: string;
  readonly redacted: boolean;
  readonly schemaKind: string;
  readonly sequence: number;
  readonly summary: string;
  readonly targetId?: string;
}

interface ExportContent {
  readonly format: LocalEventExportFormat;
  readonly mediaType: string;
  readonly content: string;
  readonly descriptor: Record<string, unknown>;
  readonly manifest: Record<string, unknown>;
}

interface ResolvedOutputPath {
  readonly absolutePath: string;
  readonly displayPath: string;
  readonly workspaceRoot: string;
}

const HELP_TEXT = {
  usage: [
    "sovereignops local events catalog export <jsonl|csv|package> [--fixture <name>|--input-path <path>] [filters]",
    "sovereignops local events catalog replay export <jsonl|csv|package> [--fixture <name>|--input-path <path>] [filters]",
    "sovereignops local-events catalog export <jsonl|csv|package> [--fixture <name>|--input-path <path>] [filters]",
    "sovereignops local-event-catalog export <jsonl|csv|package> [--fixture <name>|--input-path <path>] [filters]",
  ],
  source: {
    fixture: "Bundled packages/schemas fixture name. Defaults to canonical-events.valid.json.",
    inputPath: "Local JSON catalog path inside this repository.",
  },
  output: {
    format: "jsonl exports replay steps, csv exports replay steps, package includes both with a manifest.",
    outputPath: "Optional workspace-local output file path. Defaults to stdout.",
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
const EXPORT_FORMATS = new Set(["jsonl", "csv", "package"]);
const REPLAY_FLAGS = [
  "actor-id",
  "fixture",
  "from-sequence",
  "input-path",
  "limit",
  "operation",
  "path",
  "record-id",
  "schema-kind",
  "to-sequence",
] as const;
const ALLOWED_FLAGS = new Set([
  ...REPLAY_FLAGS,
  "h",
  "help",
  "output",
  "output-path",
]);
const CSV_COLUMNS = [
  "sequence",
  "eventId",
  "recordedAt",
  "occurredAt",
  "operation",
  "schemaKind",
  "recordId",
  "targetId",
  "actorId",
  "approvalId",
  "approvalStatus",
  "decision",
  "beforeDigest",
  "afterDigest",
  "previousDigest",
  "eventDigest",
  "redacted",
  "summary",
] as const;
const FORMAT_EXTENSIONS = {
  jsonl: ".jsonl",
  csv: ".csv",
  package: ".json",
} as const satisfies Record<LocalEventExportFormat, string>;
const PRIVATE_WORKSPACE_SEGMENT = `.codex${"-private"}`;
const PLAN_PACK_SEGMENTS = new Set([
  "codex-pack",
  "plan-pack",
  "sovereignops-codex-pack",
]);

export async function runLocalEventExportsCli(
  argv: readonly string[] = [],
  options: LocalEventExportsRunOptions = {},
): Promise<LocalEventExportsCliResult | undefined> {
  const parsed = parseArgv(argv);
  const command = parseLocalEventExportCommand(parsed.positionals);
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
      kind: "local-events.catalog-replay-export.help",
      ...HELP_TEXT,
    });
  }

  const extraPositionals = parsed.positionals.slice(command.commandLength);
  if (extraPositionals.length > 0) {
    return jsonFailure(
      2,
      "usage_error",
      `Unexpected positional argument: ${extraPositionals[0]}`,
    );
  }

  if (command.format === undefined || !EXPORT_FORMATS.has(command.format)) {
    return jsonFailure(
      1,
      "unknown_command",
      `Unknown local event catalog export command: ${parsed.positionals.join(" ")}`,
    );
  }

  const format = command.format as LocalEventExportFormat;

  try {
    const outputPath = optionalOutputPathFlag(parsed);
    const replayResult = await runLocalEventsCli(buildReplayArgv(parsed), {
      cwd: options.cwd,
    });
    if (replayResult === undefined) {
      return jsonFailure(1, "local_event_export_error", "Local event replay command was not handled.");
    }
    if (replayResult.exitCode !== 0) {
      return replayResult;
    }

    const replay = readReplayOutput(replayResult.stdout);
    const exported = createReplayExport(replay, format);
    const output = outputPath === undefined
      ? undefined
      : await resolveOutputPath(outputPath, format, options.cwd ?? process.cwd());

    if (output !== undefined) {
      await writeOutputFile(output, exported.content);
      return jsonSuccess({
        kind: "local-events.catalog-replay-export.written",
        format,
        mediaType: exported.mediaType,
        path: output.displayPath,
        bytes: countUtf8Bytes(exported.content),
        fingerprint: exported.descriptor.fingerprint,
        manifest: exported.manifest,
      });
    }

    return textSuccess(exported.content);
  } catch (error) {
    if (error instanceof LocalEventExportError) {
      return jsonFailure(error.exitCode, error.code, error.message, error.details);
    }

    return jsonFailure(
      1,
      "local_event_export_error",
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function isLocalEventExportsCommand(argv: readonly string[]): boolean {
  return parseLocalEventExportCommand(parseArgv(argv).positionals) !== undefined;
}

export function createLocalEventReplayExportPackage(
  replay: LocalEventReplayExportInput,
): Record<string, unknown> {
  const jsonl = renderReplayJsonl(replay.steps);
  const csv = renderReplayCsv(replay.steps);
  const manifest = createReplayExportManifest(replay, {
    format: "package",
    mediaType: "application/json",
    content: `${serializeDeterministicJson({ csv, jsonl })}\n`,
    descriptor: {
      csv: contentDescriptor("text/csv", csv, { rows: replay.steps.length, columns: CSV_COLUMNS }),
      jsonl: contentDescriptor("application/jsonl", jsonl, { lines: replay.steps.length }),
    },
  });
  const replayPackage = {
    kind: "local-events.catalog-replay-export.package",
    version: 1,
    manifest,
    jsonl,
    csv,
  };

  return {
    ...replayPackage,
    fingerprint: fingerprintAuditExport(replayPackage),
  };
}

function createReplayExport(
  replay: LocalEventReplayExportInput,
  format: LocalEventExportFormat,
): ExportContent {
  const jsonl = renderReplayJsonl(replay.steps);
  const csv = renderReplayCsv(replay.steps);

  if (format === "jsonl") {
    return createContent(replay, format, "application/jsonl", jsonl, {
      lines: replay.steps.length,
    });
  }

  if (format === "csv") {
    return createContent(replay, format, "text/csv", csv, {
      rows: replay.steps.length,
      columns: CSV_COLUMNS,
    });
  }

  const replayPackage = createLocalEventReplayExportPackage(replay);
  const content = `${serializeDeterministicJson(replayPackage)}\n`;
  return {
    format,
    mediaType: "application/json",
    content,
    descriptor: contentDescriptor("application/json", content, {
      packageFingerprint: replayPackage.fingerprint,
    }),
    manifest: replayPackage.manifest as Record<string, unknown>,
  };
}

function createContent(
  replay: LocalEventReplayExportInput,
  format: LocalEventExportFormat,
  mediaType: string,
  content: string,
  extraDescriptor: Record<string, unknown>,
): ExportContent {
  const descriptor = contentDescriptor(mediaType, content, extraDescriptor);
  return {
    format,
    mediaType,
    content,
    descriptor,
    manifest: createReplayExportManifest(replay, {
      format,
      mediaType,
      content,
      descriptor,
    }),
  };
}

function createReplayExportManifest(
  replay: LocalEventReplayExportInput,
  content: {
    readonly format: LocalEventExportFormat;
    readonly mediaType: string;
    readonly content: string;
    readonly descriptor: Record<string, unknown>;
  },
): Record<string, unknown> {
  const manifest = {
    kind: "local-events.catalog-replay-export.manifest",
    version: 1,
    format: content.format,
    generatedAt: replay.generatedAt,
    workspaceId: replay.workspaceId,
    source: replay.source,
    filters: replay.filters ?? {},
    totalEvents: replay.totalEvents,
    replayedEvents: replay.replayedEvents,
    recordCount: replay.records.length,
    terminalDigest: replay.terminalDigest,
    firstSequence: replay.steps[0]?.sequence ?? null,
    lastSequence: replay.steps.at(-1)?.sequence ?? null,
    operations: countBy(replay.steps, (step) => step.operation),
    schemaKinds: countBy(replay.steps, (step) => step.schemaKind),
    redactedEvents: replay.steps.filter((step) => step.redacted).length,
    content: content.descriptor,
  };

  return {
    ...manifest,
    fingerprint: fingerprintAuditExport(manifest),
  };
}

function contentDescriptor(
  mediaType: string,
  content: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    mediaType,
    bytes: countUtf8Bytes(content),
    fingerprint: fingerprintAuditExport(content),
    ...extra,
  };
}

function renderReplayJsonl(steps: readonly LocalEventReplayExportStep[]): string {
  return steps.map((step) => serializeDeterministicJson(replayExportRow(step))).join("\n");
}

function renderReplayCsv(steps: readonly LocalEventReplayExportStep[]): string {
  const rows = steps.map((step) =>
    CSV_COLUMNS.map((column) => formatCsvCell(readReplayCsvColumn(step, column))).join(","),
  );
  return [CSV_COLUMNS.join(","), ...rows].join("\n");
}

function replayExportRow(step: LocalEventReplayExportStep): Record<string, unknown> {
  return optionalFields({
    kind: "local-events.catalog-replay-export.row",
    sequence: step.sequence,
    eventId: step.eventId,
    recordedAt: step.recordedAt,
    occurredAt: step.occurredAt,
    operation: step.operation,
    schemaKind: step.schemaKind,
    recordId: step.recordId,
    targetId: step.targetId,
    actorId: step.actorId,
    approvalId: step.approvalId,
    approvalStatus: step.approvalStatus,
    decision: step.decision,
    beforeDigest: step.beforeDigest,
    afterDigest: step.afterDigest,
    previousDigest: step.previousDigest,
    eventDigest: step.eventDigest,
    redacted: step.redacted,
    summary: step.summary,
  });
}

function readReplayCsvColumn(
  step: LocalEventReplayExportStep,
  column: (typeof CSV_COLUMNS)[number],
): string {
  const value = replayExportRow(step)[column];
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return serializeDeterministicJson(value);
}

function formatCsvCell(value: string): string {
  if (!/[",\r\n]/.test(value)) {
    return value;
  }
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function buildReplayArgv(parsed: ParsedArgv): string[] {
  const argv = ["local-events", "catalog", "replay"];
  for (const flag of REPLAY_FLAGS) {
    const value = parsed.flags[flag];
    if (typeof value === "string") {
      argv.push(`--${flag}`, value);
    }
  }
  return argv;
}

function readReplayOutput(stdout: string): LocalEventReplayExportInput {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch (cause) {
    throw new LocalEventExportError({
      exitCode: 1,
      code: "invalid_replay_output",
      message: "Local event replay output was not valid JSON.",
      details: {
        cause: cause instanceof Error ? cause.message : String(cause),
      },
    });
  }

  if (!isRecord(value) || value.kind !== "local-events.catalog-replay") {
    throw invalidReplayOutput("Local event replay output had an unexpected kind.");
  }
  if (
    typeof value.generatedAt !== "string" ||
    typeof value.workspaceId !== "string" ||
    typeof value.totalEvents !== "number" ||
    typeof value.replayedEvents !== "number" ||
    !Array.isArray(value.steps) ||
    !Array.isArray(value.records) ||
    !isRecord(value.source)
  ) {
    throw invalidReplayOutput("Local event replay output had an invalid shape.");
  }

  const steps = value.steps.map((step, index) => readReplayStep(step, index));
  return {
    kind: value.kind,
    generatedAt: value.generatedAt,
    workspaceId: value.workspaceId,
    source: cloneJson(value.source),
    filters: isRecord(value.filters) ? cloneJson(value.filters) : undefined,
    totalEvents: value.totalEvents,
    replayedEvents: value.replayedEvents,
    terminalDigest: typeof value.terminalDigest === "string" ? value.terminalDigest : null,
    steps,
    records: value.records.map((record) => cloneJson(record) as Record<string, unknown>),
  };
}

function readReplayStep(value: unknown, index: number): LocalEventReplayExportStep {
  const label = `replay.steps[${index}]`;
  if (!isRecord(value)) {
    throw invalidReplayOutput(`${label} must be an object.`);
  }

  return {
    actorId: requiredString(value.actorId, `${label}.actorId`),
    afterDigest: optionalString(value.afterDigest, `${label}.afterDigest`),
    approvalId: optionalString(value.approvalId, `${label}.approvalId`),
    approvalStatus: optionalString(value.approvalStatus, `${label}.approvalStatus`),
    beforeDigest: optionalString(value.beforeDigest, `${label}.beforeDigest`),
    decision: optionalString(value.decision, `${label}.decision`),
    eventDigest: requiredString(value.eventDigest, `${label}.eventDigest`),
    eventId: requiredString(value.eventId, `${label}.eventId`),
    occurredAt: requiredString(value.occurredAt, `${label}.occurredAt`),
    operation: requiredString(value.operation, `${label}.operation`),
    previousDigest:
      value.previousDigest === null ? null : requiredString(value.previousDigest, `${label}.previousDigest`),
    recordedAt: requiredString(value.recordedAt, `${label}.recordedAt`),
    recordId: requiredString(value.recordId, `${label}.recordId`),
    redacted: requiredBoolean(value.redacted, `${label}.redacted`),
    schemaKind: requiredString(value.schemaKind, `${label}.schemaKind`),
    sequence: requiredInteger(value.sequence, `${label}.sequence`),
    summary: requiredString(value.summary, `${label}.summary`),
    targetId: optionalString(value.targetId, `${label}.targetId`),
  };
}

async function resolveOutputPath(
  value: string,
  format: LocalEventExportFormat,
  cwd: string,
): Promise<ResolvedOutputPath> {
  const input = cleanPathFlag(value, "output-path");
  assertNotPlanPackPath(input, "output-path");

  const cwdPath = path.resolve(cwd);
  const candidatePath = path.isAbsolute(input)
    ? path.resolve(input)
    : path.resolve(findWorkspaceRoot(cwdPath) ?? cwdPath, input);
  const workspaceRoot =
    findWorkspaceRoot(cwdPath) ?? findWorkspaceRoot(path.dirname(candidatePath));
  if (workspaceRoot === undefined) {
    throw usageError("Could not locate the SovereignOps workspace root for --output-path.");
  }

  assertPathInsideWorkspace(workspaceRoot, candidatePath, "output-path");
  assertNotPrivatePath(workspaceRoot, candidatePath, "output-path");
  assertNotPlanPackPath(candidatePath, "output-path");

  const requiredExtension = FORMAT_EXTENSIONS[format];
  if (path.extname(candidatePath) !== requiredExtension) {
    throw usageError(`Option --output-path for ${format} export must end with ${requiredExtension}.`);
  }

  const parentPath = path.dirname(candidatePath);
  let parentStat: Awaited<ReturnType<typeof stat>>;
  try {
    parentStat = await stat(parentPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new LocalEventExportError({
        exitCode: 2,
        code: "output_parent_not_found",
        message: "Output directory was not found.",
        details: {
          path: displayPath(workspaceRoot, parentPath),
        },
      });
    }
    throw new LocalEventExportError({
      exitCode: 1,
      code: "output_stat_error",
      message: "Could not inspect output directory.",
      details: {
        path: displayPath(workspaceRoot, parentPath),
        cause: error instanceof Error ? error.message : String(error),
      },
    });
  }

  if (!parentStat.isDirectory()) {
    throw new LocalEventExportError({
      exitCode: 2,
      code: "output_parent_not_directory",
      message: "Output parent path must be a directory.",
      details: {
        path: displayPath(workspaceRoot, parentPath),
      },
    });
  }

  const actualParent = await realpath(parentPath);
  assertPathInsideWorkspace(workspaceRoot, actualParent, "output-path");
  assertNotPrivatePath(workspaceRoot, actualParent, "output-path");
  assertNotPlanPackPath(actualParent, "output-path");

  return {
    absolutePath: path.join(actualParent, path.basename(candidatePath)),
    displayPath: displayPath(workspaceRoot, path.join(actualParent, path.basename(candidatePath))),
    workspaceRoot,
  };
}

async function writeOutputFile(output: ResolvedOutputPath, content: string): Promise<void> {
  try {
    await writeFile(output.absolutePath, content, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      throw new LocalEventExportError({
        exitCode: 2,
        code: "output_exists",
        message: "Output file already exists.",
        details: {
          path: output.displayPath,
        },
      });
    }

    throw new LocalEventExportError({
      exitCode: 1,
      code: "output_write_error",
      message: "Could not write local event replay export.",
      details: {
        path: output.displayPath,
        cause: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

function optionalOutputPathFlag(parsed: ParsedArgv): string | undefined {
  const outputPath = optionalStringFlag(parsed, "output-path");
  const outputAlias = optionalStringFlag(parsed, "output");
  if (outputPath !== undefined && outputAlias !== undefined) {
    throw usageError("Use either --output-path or --output, not both.");
  }
  return outputPath ?? outputAlias;
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

function parseLocalEventExportCommand(
  positionals: readonly string[],
): ParsedExportCommand | undefined {
  if (positionals[0] === "local-event-catalog-export") {
    return { commandLength: Math.min(positionals.length, 2), format: positionals[1] };
  }
  if (positionals[0] === "local-event-catalog-replay-export") {
    return { commandLength: Math.min(positionals.length, 2), format: positionals[1] };
  }

  const baseLength = localEventCatalogBaseLength(positionals);
  if (baseLength === 0) {
    return undefined;
  }

  const tail = positionals.slice(baseLength);
  if (tail[0] === "export") {
    if (tail[1] === "replay") {
      return {
        commandLength: baseLength + Math.min(tail.length, 3),
        format: tail[2],
      };
    }
    return {
      commandLength: baseLength + Math.min(tail.length, 2),
      format: tail[1],
    };
  }
  if (tail[0] === "replay" && tail[1] === "export") {
    return {
      commandLength: baseLength + Math.min(tail.length, 3),
      format: tail[2],
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

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw invalidReplayOutput(`${label} must be a string.`);
  }
  return value;
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requiredString(value, label);
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw invalidReplayOutput(`${label} must be a boolean.`);
  }
  return value;
}

function requiredInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value)) {
    throw invalidReplayOutput(`${label} must be an integer.`);
  }
  return value;
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
    compareStrings(left, right),
  ));
}

function textSuccess(stdout: string): LocalEventExportsCliResult {
  return {
    exitCode: 0,
    stdout: stdout.length === 0 ? "" : `${stdout}\n`,
    stderr: "",
  };
}

function jsonSuccess(value: unknown): LocalEventExportsCliResult {
  return textSuccess(serializeDeterministicJson(value));
}

function jsonFailure(
  exitCode: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): LocalEventExportsCliResult {
  return {
    exitCode,
    stdout: "",
    stderr: `${serializeDeterministicJson({
      error: optionalFields({
        code,
        message,
        details: details && Object.keys(details).length > 0 ? details : undefined,
      }),
    })}\n`,
  };
}

function usageError(message: string): LocalEventExportError {
  return new LocalEventExportError({
    exitCode: 2,
    code: "usage_error",
    message,
  });
}

function invalidReplayOutput(message: string): LocalEventExportError {
  return new LocalEventExportError({
    exitCode: 1,
    code: "invalid_replay_output",
    message,
  });
}

function countUtf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

function cloneJson<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

function optionalFields<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class LocalEventExportError extends Error {
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
    this.name = "LocalEventExportError";
    this.exitCode = options.exitCode;
    this.code = options.code;
    this.details = options.details;
  }
}
