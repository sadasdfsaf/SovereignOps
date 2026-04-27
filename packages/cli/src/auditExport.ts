import {
  AuditExportError,
  createAuditExportPackage,
  renderAuditCsv,
  renderAuditJsonl,
  serializeDeterministicJson,
  type AuditEventFilters,
  type AuditExportOptions,
} from "../../audit-export/src/index.ts";

export interface AuditExportCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface AuditExportRunOptions {
  readonly stdin?: string;
}

type ParsedFlagValue = string | boolean | readonly string[];

interface ParsedArgv {
  readonly positionals: readonly string[];
  readonly flags: Readonly<Record<string, ParsedFlagValue>>;
  readonly errors: readonly string[];
}

const HELP_TEXT = `SovereignOps audit export CLI

Usage:
  sovereignops audit export jsonl --input-json <json>|--stdin [filters]
  sovereignops audit export csv --input-json <json>|--stdin [filters]
  sovereignops audit export package --input-json <json>|--stdin [filters]

Input:
  --input-json <json>   JSON array of audit events, or an object with an events array.
  --stdin               Read the same JSON shape from stdin.

Filters:
  --decision <value>    Keep events with this decision. Can be repeated.
  --type <value>        Keep events with this type. Can be repeated.
  --from <timestamp>    Keep events at or after this ISO timestamp.
  --to <timestamp>      Keep events at or before this ISO timestamp.

Package options:
  --created-at <timestamp>
  --export-id <id>
`;

const BOOLEAN_FLAGS = new Set(["help", "h", "stdin"]);
const REPEATED_FLAGS = new Set(["decision", "decisions", "type", "types"]);
const EXPORT_FORMATS = new Set(["jsonl", "csv", "package"]);
const ALLOWED_FLAGS = new Set([
  "created-at",
  "decision",
  "decisions",
  "export-id",
  "from",
  "from-timestamp",
  "help",
  "h",
  "input",
  "input-json",
  "stdin",
  "to",
  "to-timestamp",
  "type",
  "types",
]);

export async function runAuditExportCli(
  argv: readonly string[] = [],
  options: AuditExportRunOptions = {},
): Promise<AuditExportCliResult | undefined> {
  const parsed = parseArgv(argv);
  if (!isAuditExportParsedCommand(parsed)) {
    return undefined;
  }

  if (parsed.errors.length > 0) {
    return failure(2, parsed.errors.join("\n"));
  }

  const unknownFlags = Object.keys(parsed.flags).filter((flag) => !ALLOWED_FLAGS.has(flag));
  if (unknownFlags.length > 0) {
    return failure(2, `Unsupported option: --${unknownFlags[0]}`);
  }

  if (hasHelp(parsed) || parsed.positionals.length === 2) {
    return success(HELP_TEXT);
  }

  const [, , format, ...extraPositionals] = parsed.positionals;
  if (format === undefined || extraPositionals.length > 0 || !EXPORT_FORMATS.has(format)) {
    return unknownAuditExportCommand(parsed);
  }

  try {
    const events = readAuditEvents(parsed, options.stdin);
    const filters = readFilters(parsed);

    if (format === "jsonl") {
      return textSuccess(renderAuditJsonl(events, filters));
    }

    if (format === "csv") {
      return textSuccess(renderAuditCsv(events, filters));
    }

    if (format === "package") {
      const auditPackage = createAuditExportPackage(events, readExportOptions(parsed, filters));
      return success(`${serializeDeterministicJson(auditPackage)}\n`);
    }
  } catch (error) {
    if (error instanceof AuditExportUsageError) {
      return failure(2, error.message);
    }
    if (error instanceof AuditExportError) {
      return failure(2, error.message);
    }

    return failure(1, error instanceof Error ? error.message : String(error));
  }

  return unknownAuditExportCommand(parsed);
}

export function isAuditExportCommand(argv: readonly string[]): boolean {
  return isAuditExportParsedCommand(parseArgv(argv));
}

function readAuditEvents(parsed: ParsedArgv, stdin = ""): readonly unknown[] {
  const input = optionalStringFlag(parsed, "input-json") ?? optionalStringFlag(parsed, "input");
  const useStdin = parsed.flags.stdin === true || input === "-";
  if (input !== undefined && input !== "-" && parsed.flags.stdin === true) {
    throw new AuditExportUsageError("Use either --input-json or --stdin, not both.");
  }
  if (input === undefined && !useStdin) {
    throw new AuditExportUsageError("Missing required option --input-json or --stdin.");
  }

  const source = useStdin ? stdin : input;
  if (source === undefined || source.trim().length === 0) {
    throw new AuditExportUsageError("Audit export input cannot be empty.");
  }

  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new AuditExportUsageError("Audit export input must contain valid JSON.");
  }

  if (Array.isArray(value)) {
    return value;
  }
  if (isRecord(value) && Array.isArray(value.events)) {
    return value.events;
  }

  throw new AuditExportUsageError(
    "Audit export input must be a JSON array or an object with an events array.",
  );
}

function readFilters(parsed: ParsedArgv): AuditEventFilters {
  const decisions = [
    ...repeatedStringFlag(parsed, "decision"),
    ...repeatedStringFlag(parsed, "decisions"),
  ];
  const types = [
    ...repeatedStringFlag(parsed, "type"),
    ...repeatedStringFlag(parsed, "types"),
  ];

  return optionalFields({
    decisions: decisions.length === 0 ? undefined : decisions,
    types: types.length === 0 ? undefined : types,
    fromTimestamp: timestampFlag(parsed, "from", "from-timestamp"),
    toTimestamp: timestampFlag(parsed, "to", "to-timestamp"),
  });
}

function readExportOptions(
  parsed: ParsedArgv,
  filters: AuditEventFilters,
): AuditExportOptions {
  return optionalFields({
    createdAt: optionalStringFlag(parsed, "created-at"),
    exportId: optionalStringFlag(parsed, "export-id"),
    filters,
  });
}

function timestampFlag(
  parsed: ParsedArgv,
  shortName: string,
  longName: string,
): string | undefined {
  const shortValue = optionalStringFlag(parsed, shortName);
  const longValue = optionalStringFlag(parsed, longName);
  if (shortValue !== undefined && longValue !== undefined) {
    throw new AuditExportUsageError(`Use either --${shortName} or --${longName}, not both.`);
  }
  return shortValue ?? longValue;
}

function parseArgv(argv: readonly string[]): ParsedArgv {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean | string[]> = {};
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
  flags: Record<string, string | boolean | string[]>,
  name: string,
  value: string | boolean,
  errors: string[],
): void {
  if (REPEATED_FLAGS.has(name)) {
    const current = flags[name];
    if (current === undefined) {
      flags[name] = [String(value)];
      return;
    }
    if (Array.isArray(current)) {
      flags[name] = [...current, String(value)];
      return;
    }
    errors.push(`Flag --${name} cannot mix repeated and single values.`);
    return;
  }

  if (Object.hasOwn(flags, name)) {
    errors.push(`Flag --${name} was provided more than once.`);
    return;
  }

  flags[name] = value;
}

function isAuditExportParsedCommand(parsed: ParsedArgv): boolean {
  return parsed.positionals[0] === "audit" && parsed.positionals[1] === "export";
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
    throw new AuditExportUsageError(`Option --${name} requires a value.`);
  }
  return value;
}

function repeatedStringFlag(parsed: ParsedArgv, name: string): readonly string[] {
  const value = parsed.flags[name];
  if (value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    return [value];
  }
  throw new AuditExportUsageError(`Option --${name} requires a value.`);
}

function textSuccess(stdout: string): AuditExportCliResult {
  return success(stdout.length === 0 ? "" : `${stdout}\n`);
}

function success(stdout: string): AuditExportCliResult {
  return { exitCode: 0, stdout, stderr: "" };
}

function failure(exitCode: number, message: string): AuditExportCliResult {
  return {
    exitCode,
    stdout: "",
    stderr: `${message.trimEnd()}\n`,
  };
}

function unknownAuditExportCommand(parsed: ParsedArgv): AuditExportCliResult {
  return failure(
    1,
    `Unknown audit export command: ${parsed.positionals.join(" ")}\nRun "sovereignops audit export --help" for usage.`,
  );
}

function optionalFields<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class AuditExportUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditExportUsageError";
  }
}
