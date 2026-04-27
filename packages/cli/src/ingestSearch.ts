import { readFile, writeFile } from "node:fs/promises";

export interface IngestSearchCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface IngestSearchRunOptions {
  readonly files?: IngestSearchFileSystem;
  readonly stdin?: string;
}

export interface IngestSearchFileSystem {
  readonly readText?: (path: string) => Awaitable<string>;
  readonly writeText?: (path: string, text: string) => Awaitable<void>;
}

type Awaitable<T> = T | Promise<T>;
type ParsedFlagValue = string | boolean | readonly string[];

interface ParsedArgv {
  readonly positionals: readonly string[];
  readonly flags: Readonly<Record<string, ParsedFlagValue>>;
  readonly errors: readonly string[];
}

interface IngestSearchCommand {
  readonly action: readonly string[];
}

interface SourceRecord {
  readonly sourceUri?: string;
  readonly path?: string;
  readonly mediaType?: string;
  readonly checksum?: string;
  readonly state?: string;
}

interface IndexDocumentRecord {
  readonly id: string;
  readonly sourceUri: string;
  readonly mediaType?: string;
  readonly checksum?: string;
  readonly title?: string;
  readonly body: string;
  readonly citations?: unknown;
  readonly quarantineState?: string;
}

interface QuarantineItemRecord {
  readonly id: string;
  readonly sourceUri: string;
  readonly checksum?: string;
  readonly reasonCode?: string;
  readonly reason?: string;
  readonly citation?: unknown;
  readonly untrusted?: boolean;
}

export interface SearchIndexJsonOptions {
  readonly limit?: number;
  readonly mediaTypes?: readonly string[];
  readonly query: string;
  readonly sourceUris?: readonly string[];
}

export interface ListQuarantineRecordsOptions {
  readonly reasonCodes?: readonly string[];
  readonly sourceUris?: readonly string[];
}

export interface QuarantineDecisionJsonInput {
  readonly actorId: string;
  readonly decision: "release" | "reject";
  readonly itemId: string;
  readonly override?: boolean;
  readonly reason: string;
  readonly timestamp: string;
}

const HELP_TEXT = `SovereignOps ingest/search CLI

Usage:
  sovereignops ingest search source summary --input-json <json>|--input-path <path>|--stdin
  sovereignops ingest search index search --query <text> --input-json <json>|--input-path <path>|--stdin
  sovereignops ingest search quarantine list --input-json <json>|--input-path <path>|--stdin
  sovereignops ingest search quarantine decide --item-id <id> --decision <release|reject> --actor-id <id> --reason <text> --timestamp <iso> --input-json <json>|--input-path <path>|--stdin [--output <path>]

Input aliases:
  --index-json <json>       Alias for --input-json on index search.
  --index-path <path>       Alias for --input-path on index search.
  --quarantine-json <json>  Alias for --input-json on quarantine commands.
  --quarantine-path <path>  Alias for --input-path on quarantine commands.
`;

const BOOLEAN_FLAGS = new Set(["help", "h", "override", "stdin"]);
const REPEATED_FLAGS = new Set(["media-type", "reason-code", "source-uri"]);
const ALLOWED_FLAGS = new Set([
  "action",
  "actor-id",
  "decision",
  "h",
  "help",
  "index-json",
  "index-path",
  "input",
  "input-json",
  "input-path",
  "item-id",
  "limit",
  "media-type",
  "output",
  "override",
  "query",
  "quarantine-json",
  "quarantine-path",
  "reason",
  "reason-code",
  "source-uri",
  "stdin",
  "timestamp",
]);
const DECISIONS = new Set(["release", "reject"]);

export async function runIngestSearchCli(
  argv: readonly string[] = [],
  options: IngestSearchRunOptions = {},
): Promise<IngestSearchCliResult | undefined> {
  const parsed = parseArgv(argv);
  if (!isIngestSearchParsedCommand(parsed)) {
    return undefined;
  }

  if (parsed.errors.length > 0) {
    return failure(2, parsed.errors.join("\n"));
  }

  const unknownFlags = Object.keys(parsed.flags).filter((flag) => !ALLOWED_FLAGS.has(flag));
  if (unknownFlags.length > 0) {
    return failure(2, `Unsupported option: --${unknownFlags[0]}`);
  }

  if (hasHelp(parsed)) {
    return success(HELP_TEXT);
  }

  const command = ingestSearchCommandFrom(parsed.positionals);
  if (command === undefined || command.action.length === 0) {
    return success(HELP_TEXT);
  }

  try {
    if (matchesAction(command, "source", "summary") || matchesAction(command, "source", "summarize") || matchesAction(command, "sources", "summary")) {
      return jsonSuccess(summarizeSourceJson(await readInputJson(parsed, options, "source")));
    }

    if (matchesAction(command, "index", "search") || matchesAction(command, "index", "query") || matchesAction(command, "search", "index")) {
      return jsonSuccess(searchIndexJson(await readInputJson(parsed, options, "index"), {
        limit: positiveIntegerFlag(parsed, "limit", 10),
        mediaTypes: repeatedStringFlag(parsed, "media-type"),
        query: requireStringFlag(parsed, "query"),
        sourceUris: repeatedStringFlag(parsed, "source-uri"),
      }));
    }

    if (matchesAction(command, "quarantine", "list")) {
      return jsonSuccess(listQuarantineRecords(await readInputJson(parsed, options, "quarantine"), {
        reasonCodes: repeatedStringFlag(parsed, "reason-code"),
        sourceUris: repeatedStringFlag(parsed, "source-uri"),
      }));
    }

    if (matchesAction(command, "quarantine", "decide") || matchesAction(command, "quarantine", "decision")) {
      const decision = writeQuarantineDecisionJson(
        await readInputJson(parsed, options, "quarantine"),
        readQuarantineDecisionInput(parsed),
      );
      const stdout = serializeDeterministicJson(decision);
      const output = optionalStringFlag(parsed, "output");
      if (output !== undefined) {
        await writeText(output, stdout, options.files);
      }
      return success(stdout);
    }
  } catch (error) {
    if (error instanceof IngestSearchUsageError) {
      return failure(2, error.message);
    }
    return failure(1, error instanceof Error ? error.message : String(error));
  }

  return failure(
    1,
    `Unknown ingest/search command: ${parsed.positionals.join(" ")}\nRun "sovereignops ingest search --help" for usage.`,
  );
}

export function isIngestSearchCommand(argv: readonly string[]): boolean {
  return isIngestSearchParsedCommand(parseArgv(argv));
}

export function summarizeSourceJson(value: unknown): unknown {
  const record = requireRecord(value, "source input");
  const sources = readSourceRecords(record);
  const topLevelKeys = Object.keys(record).sort();
  const itemCount = Array.isArray(record.items)
    ? record.items.length
    : Array.isArray(value)
      ? value.length
      : sources.length;

  return optionalFields({
    kind: "ingest-search.source-summary",
    schemaVersion: optionalStringFrom(record.schemaVersion),
    workspaceId: optionalStringFrom(record.workspaceId),
    summary: {
      rootType: Array.isArray(value) ? "array" : "object",
      topLevelKeys,
      itemCount,
      sourceCount: sources.length,
      checksumCount: sources.filter((source) => source.checksum !== undefined).length,
      mediaTypes: countBy(sources, (source) => source.mediaType),
      states: countBy(sources, (source) => source.state),
    },
    sources,
  });
}

export function searchIndexJson(value: unknown, options: SearchIndexJsonOptions): unknown {
  const record = requireRecord(value, "search index input");
  const documents = readIndexDocuments(record);
  const query = requireCleanString(options.query, "query");
  const limit = options.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new IngestSearchUsageError("search index limit must be a positive integer.");
  }
  const sourceFilters = new Set(options.sourceUris ?? []);
  const mediaFilters = new Set(options.mediaTypes ?? []);
  const queryFrequencies = frequencies(tokenize(query));
  const queryTerms = Object.keys(queryFrequencies).sort();

  const results = documents
    .filter((document) => sourceFilters.size === 0 || sourceFilters.has(document.sourceUri))
    .filter((document) => mediaFilters.size === 0 || mediaFilters.has(document.mediaType ?? ""))
    .map((document) => searchDocument(document, queryFrequencies, queryTerms))
    .filter((result) => result !== undefined)
    .sort((left, right) => (
      right.score - left.score ||
      right.matchedTerms.length - left.matchedTerms.length ||
      left.sourceUri.localeCompare(right.sourceUri) ||
      left.id.localeCompare(right.id)
    ))
    .slice(0, limit);

  return optionalFields({
    kind: "ingest-search.index-search",
    schemaVersion: optionalStringFrom(record.schemaVersion),
    workspaceId: optionalStringFrom(record.workspaceId),
    query,
    summary: {
      documentCount: documents.length,
      resultCount: results.length,
    },
    results,
  });
}

export function listQuarantineRecords(
  value: unknown,
  options: ListQuarantineRecordsOptions = {},
): unknown {
  const record = requireRecord(value, "quarantine input");
  const sourceFilters = new Set(options.sourceUris ?? []);
  const reasonFilters = new Set(options.reasonCodes ?? []);
  const items = readQuarantineItems(record)
    .filter((item) => sourceFilters.size === 0 || sourceFilters.has(item.sourceUri))
    .filter((item) => reasonFilters.size === 0 || reasonFilters.has(item.reasonCode ?? ""))
    .sort((left, right) => left.id.localeCompare(right.id));

  return optionalFields({
    kind: "ingest-search.quarantine-list",
    schemaVersion: optionalStringFrom(record.schemaVersion),
    workspaceId: optionalStringFrom(record.workspaceId),
    summary: {
      itemCount: items.length,
      reasonCodes: countBy(items, (item) => item.reasonCode),
      sourceUris: countBy(items, (item) => item.sourceUri),
    },
    items,
  });
}

export function writeQuarantineDecisionJson(
  value: unknown,
  input: QuarantineDecisionJsonInput,
): unknown {
  const record = requireRecord(value, "quarantine input");
  const itemId = requireCleanString(input.itemId, "itemId");
  const actorId = requireCleanString(input.actorId, "actorId");
  const reason = requireCleanString(input.reason, "reason");
  assertIsoTimestamp(input.timestamp, "timestamp");
  const item = readQuarantineItems(record).find((candidate) => candidate.id === itemId);
  if (item === undefined) {
    throw new IngestSearchUsageError(`Quarantine item not found: ${itemId}`);
  }

  const toState = input.decision === "release" ? "released" : "rejected";
  return optionalFields({
    kind: "ingest-search.quarantine-decision",
    schemaVersion: "ingest-search-quarantine-decision.v1",
    workspaceId: optionalStringFrom(record.workspaceId),
    itemId: item.id,
    sourceUri: item.sourceUri,
    checksum: item.checksum,
    decision: input.decision,
    actorId,
    decidedAt: input.timestamp,
    reason,
    fromState: "open",
    toState,
    override: input.override === true,
    reasonCode: item.reasonCode,
    citation: item.citation,
    auditEventSummary: optionalFields({
      eventType: "quarantine_decision",
      itemId: item.id,
      sourceUri: item.sourceUri,
      decision: input.decision,
      actorId,
      timestamp: input.timestamp,
      fromState: "open",
      toState,
      reason,
      override: input.override === true,
    }),
  });
}

function readQuarantineDecisionInput(parsed: ParsedArgv): QuarantineDecisionJsonInput {
  const decision = optionalStringFlag(parsed, "decision") ?? optionalStringFlag(parsed, "action");
  if (decision === undefined || !DECISIONS.has(decision)) {
    throw new IngestSearchUsageError("Option --decision must be one of release, reject.");
  }

  return {
    actorId: requireStringFlag(parsed, "actor-id"),
    decision: decision as "release" | "reject",
    itemId: requireStringFlag(parsed, "item-id"),
    override: parsed.flags.override === true,
    reason: requireStringFlag(parsed, "reason"),
    timestamp: requireIsoTimestampFlag(parsed, "timestamp"),
  };
}

function searchDocument(
  document: IndexDocumentRecord,
  queryFrequencies: Readonly<Record<string, number>>,
  queryTerms: readonly string[],
): ({
  readonly id: string;
  readonly sourceUri: string;
  readonly title?: string;
  readonly mediaType?: string;
  readonly checksum?: string;
  readonly quarantineState?: string;
  readonly score: number;
  readonly matchedTerms: readonly string[];
  readonly snippet: string;
  readonly citation?: unknown;
}) | undefined {
  const searchableText = `${document.title ?? ""} ${document.body}`.trim();
  const documentFrequencies = frequencies(tokenize(searchableText));
  const matchedTerms = queryTerms.filter((term) => (documentFrequencies[term] ?? 0) > 0);
  if (matchedTerms.length === 0) {
    return undefined;
  }

  const score = Object.entries(queryFrequencies).reduce(
    (total, [term, queryCount]) => total + (documentFrequencies[term] ?? 0) * queryCount,
    0,
  );
  return optionalFields({
    id: document.id,
    sourceUri: document.sourceUri,
    title: document.title,
    mediaType: document.mediaType,
    checksum: document.checksum,
    quarantineState: document.quarantineState,
    score,
    matchedTerms,
    snippet: makeSnippet(searchableText, matchedTerms),
    citation: firstCitation(document.citations),
  });
}

function readSourceRecords(record: Record<string, unknown>): readonly SourceRecord[] {
  if (!Array.isArray(record.sources)) {
    return [];
  }

  return record.sources
    .map((source, index) => {
      const sourceRecord = requireRecord(source, `sources[${index}]`);
      return optionalFields({
        sourceUri: optionalStringFrom(sourceRecord.sourceUri),
        path: optionalStringFrom(sourceRecord.path),
        mediaType: optionalStringFrom(sourceRecord.mediaType),
        checksum: optionalStringFrom(sourceRecord.checksum),
        state: optionalStringFrom(sourceRecord.state),
      });
    })
    .sort((left, right) => (
      (left.sourceUri ?? "").localeCompare(right.sourceUri ?? "") ||
      (left.path ?? "").localeCompare(right.path ?? "")
    ));
}

function readIndexDocuments(record: Record<string, unknown>): readonly IndexDocumentRecord[] {
  if (!Array.isArray(record.documents)) {
    throw new IngestSearchUsageError("search index input.documents must be an array.");
  }

  return record.documents.map((document, index) => {
    const value = requireRecord(document, `documents[${index}]`);
    const title = optionalStringFrom(value.title);
    const body = optionalStringFrom(value.body) ?? optionalStringFrom(value.content);
    if (body === undefined) {
      throw new IngestSearchUsageError(`documents[${index}].body must be a string.`);
    }
    return optionalFields({
      id: requireCleanString(value.id, `documents[${index}].id`),
      sourceUri: requireCleanString(value.sourceUri, `documents[${index}].sourceUri`),
      mediaType: optionalStringFrom(value.mediaType),
      checksum: optionalStringFrom(value.checksum),
      title,
      body,
      citations: value.citations,
      quarantineState: optionalStringFrom(value.quarantineState),
    });
  });
}

function readQuarantineItems(record: Record<string, unknown>): readonly QuarantineItemRecord[] {
  if (!Array.isArray(record.items)) {
    throw new IngestSearchUsageError("quarantine input.items must be an array.");
  }

  return record.items.map((item, index) => {
    const value = requireRecord(item, `items[${index}]`);
    return optionalFields({
      id: requireCleanString(value.id, `items[${index}].id`),
      sourceUri: requireCleanString(value.sourceUri, `items[${index}].sourceUri`),
      checksum: optionalStringFrom(value.checksum),
      reasonCode: optionalStringFrom(value.reasonCode),
      reason: optionalStringFrom(value.reason),
      citation: value.citation,
      untrusted: typeof value.untrusted === "boolean" ? value.untrusted : undefined,
    });
  });
}

async function readInputJson(
  parsed: ParsedArgv,
  options: IngestSearchRunOptions,
  family: "index" | "quarantine" | "source",
): Promise<unknown> {
  const jsonFlagNames = family === "index"
    ? ["index-json", "input-json", "input"]
    : family === "quarantine"
      ? ["quarantine-json", "input-json", "input"]
      : ["input-json", "input"];
  const pathFlagNames = family === "index"
    ? ["index-path", "input-path"]
    : family === "quarantine"
      ? ["quarantine-path", "input-path"]
      : ["input-path"];
  const jsonValues = jsonFlagNames
    .map((name) => optionalStringFlag(parsed, name))
    .filter((value) => value !== undefined);
  const pathValues = pathFlagNames
    .map((name) => optionalStringFlag(parsed, name))
    .filter((value) => value !== undefined);
  const useStdin = parsed.flags.stdin === true || jsonValues.includes("-");
  const selectedInputs = jsonValues.filter((value) => value !== "-").length + pathValues.length + (useStdin ? 1 : 0);

  if (selectedInputs === 0) {
    throw new IngestSearchUsageError("Missing required option --input-json, --input-path, or --stdin.");
  }
  if (selectedInputs > 1) {
    throw new IngestSearchUsageError("Use only one of --input-json, --input-path, or --stdin.");
  }

  const source = useStdin
    ? options.stdin ?? ""
    : pathValues[0] !== undefined
      ? await readText(pathValues[0], options.files)
      : jsonValues[0] ?? "";
  if (source.trim().length === 0) {
    throw new IngestSearchUsageError("Input JSON cannot be empty.");
  }

  try {
    return JSON.parse(source);
  } catch {
    throw new IngestSearchUsageError("Input must contain valid JSON.");
  }
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

function isIngestSearchParsedCommand(parsed: ParsedArgv): boolean {
  return (
    (parsed.positionals[0] === "ingest" && parsed.positionals[1] === "search") ||
    parsed.positionals[0] === "ingest-search"
  );
}

function ingestSearchCommandFrom(positionals: readonly string[]): IngestSearchCommand | undefined {
  if (positionals[0] === "ingest" && positionals[1] === "search") {
    return { action: positionals.slice(2) };
  }
  if (positionals[0] === "ingest-search") {
    return { action: positionals.slice(1) };
  }
  return undefined;
}

function matchesAction(command: IngestSearchCommand, ...action: readonly string[]): boolean {
  return command.action.length === action.length
    && command.action.every((part, index) => part === action[index]);
}

function hasHelp(parsed: ParsedArgv): boolean {
  return parsed.flags.help === true || parsed.flags.h === true;
}

function requireStringFlag(parsed: ParsedArgv, name: string): string {
  const value = optionalStringFlag(parsed, name);
  if (value === undefined || value.trim().length === 0) {
    throw new IngestSearchUsageError(`Missing required option --${name}.`);
  }
  return value;
}

function requireIsoTimestampFlag(parsed: ParsedArgv, name: string): string {
  const value = requireStringFlag(parsed, name);
  assertIsoTimestamp(value, `Option --${name}`);
  return value;
}

function assertIsoTimestamp(value: string, path: string): void {
  const parsedDate = Date.parse(value);
  if (!Number.isFinite(parsedDate) || new Date(parsedDate).toISOString() !== value) {
    throw new IngestSearchUsageError(`${path} must be an ISO timestamp.`);
  }
}

function optionalStringFlag(parsed: ParsedArgv, name: string): string | undefined {
  const value = parsed.flags[name];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new IngestSearchUsageError(`Option --${name} requires a value.`);
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
  throw new IngestSearchUsageError(`Option --${name} requires a value.`);
}

function positiveIntegerFlag(parsed: ParsedArgv, name: string, defaultValue: number): number {
  const value = optionalStringFlag(parsed, name);
  if (value === undefined) {
    return defaultValue;
  }
  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    throw new IngestSearchUsageError(`Option --${name} must be a positive integer.`);
  }
  return parsedValue;
}

function optionalStringFrom(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function requireCleanString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value !== value.trim()) {
    throw new IngestSearchUsageError(`${path} must be a non-empty string without surrounding whitespace.`);
  }
  return value;
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new IngestSearchUsageError(`${path} must be a JSON object.`);
  }
  return value;
}

function countBy<TValue>(
  values: readonly TValue[],
  selector: (value: TValue) => string | undefined,
): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const key = selector(value);
    if (key === undefined || key.length === 0) {
      continue;
    }
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function firstCitation(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function tokenize(value: string): readonly string[] {
  return [...value.matchAll(/[A-Za-z0-9]+/g)].map((match) => match[0].toLowerCase());
}

function frequencies(tokens: readonly string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const token of tokens) {
    result[token] = (result[token] ?? 0) + 1;
  }
  return result;
}

function makeSnippet(text: string, matchedTerms: readonly string[], maxLength = 160): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }

  const lower = compact.toLowerCase();
  const firstMatch = matchedTerms.reduce((best, term) => {
    const index = lower.indexOf(term.toLowerCase());
    return index === -1 ? best : Math.min(best, index);
  }, Number.POSITIVE_INFINITY);
  const anchor = Number.isFinite(firstMatch) ? firstMatch : 0;
  const start = Math.max(0, anchor - Math.floor(maxLength / 3));
  const end = Math.min(compact.length, start + maxLength);
  return `${start > 0 ? "... " : ""}${compact.slice(start, end).trim()}${end < compact.length ? " ..." : ""}`;
}

function optionalFields<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T;
}

async function readText(path: string, files?: IngestSearchFileSystem): Promise<string> {
  if (files?.readText !== undefined) {
    return files.readText(path);
  }
  return readFile(path, "utf-8");
}

async function writeText(
  path: string,
  text: string,
  files?: IngestSearchFileSystem,
): Promise<void> {
  if (files?.writeText !== undefined) {
    await files.writeText(path, text);
    return;
  }
  await writeFile(path, text, "utf-8");
}

function jsonSuccess(value: unknown): IngestSearchCliResult {
  return success(serializeDeterministicJson(value));
}

function serializeDeterministicJson(value: unknown): string {
  return `${JSON.stringify(sortJson(value), null, 2)}\n`;
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

function success(stdout: string): IngestSearchCliResult {
  return { exitCode: 0, stdout, stderr: "" };
}

function failure(exitCode: number, message: string): IngestSearchCliResult {
  return {
    exitCode,
    stdout: "",
    stderr: `${message.trimEnd()}\n`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class IngestSearchUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngestSearchUsageError";
  }
}
