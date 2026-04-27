import { existsSync, readFileSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

import {
  LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_ERROR_CODES,
  LocalWorkspaceSessionSnapshotRetentionError,
  planSnapshotRetentionCleanupDryRun,
  type LocalWorkspaceSessionSnapshotRetentionCleanupInput,
  type LocalWorkspaceSessionSnapshotRetentionCleanupIssueKind,
  type LocalWorkspaceSessionSnapshotRetentionCleanupPlan,
} from "../../sdk-js/src/localWorkspaceSessionSnapshotRetention.ts";

export interface WorkspaceSessionSnapshotRetentionCleanupCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface WorkspaceSessionSnapshotRetentionCleanupRunOptions {
  readonly cwd?: string;
}

type ParsedFlagValue = string | boolean;

interface ParsedArgv {
  readonly positionals: readonly string[];
  readonly flags: Readonly<Record<string, ParsedFlagValue>>;
  readonly errors: readonly string[];
}

interface ParsedCommand {
  readonly length: number;
}

interface ResolvedFixturePath {
  readonly absolutePath: string;
  readonly displayPath: string;
  readonly workspaceRoot: string;
}

interface LoadedCleanupInput {
  readonly input: LocalWorkspaceSessionSnapshotRetentionCleanupInput;
  readonly inspectedSections: readonly string[];
}

export const WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_CLI_SCHEMA_VERSION =
  "workspace-session-snapshot-retention-cleanup-cli/v1";

const DEFAULT_WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_FIXTURE =
  "examples/workspace-session/snapshot-retention-cleanup.json";
const HELP_TEXT = {
  usage: [
    "sovereignops workspace-session snapshot retention-cleanup preview --fixture <path>",
    "sovereignops workspace session snapshot retention-cleanup preview --fixture <path>",
    "sovereignops workspace-session snapshot retention cleanup preview --fixture <path>",
    "sovereignops workspace-session-snapshot retention-cleanup preview --fixture <path>",
    "sovereignops workspace-session-snapshot-retention-cleanup preview --fixture <path>",
  ],
  options: {
    fixture:
      `Local workspace/session snapshot retention cleanup JSON fixture path, for example ${DEFAULT_WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_FIXTURE}.`,
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
const UNSAFE_MATERIAL_ISSUES = new Set<LocalWorkspaceSessionSnapshotRetentionCleanupIssueKind>([
  "path-traversal",
  "raw-lock-token",
  "raw-secret",
  "unsafe-absolute-path",
]);

export async function runWorkspaceSessionSnapshotRetentionCleanupCli(
  argv: readonly string[] = [],
  options: WorkspaceSessionSnapshotRetentionCleanupRunOptions = {},
): Promise<WorkspaceSessionSnapshotRetentionCleanupCliResult | undefined> {
  const parsed = parseArgv(argv);
  const command = workspaceSessionSnapshotRetentionCleanupCommand(parsed.positionals);
  if (command === undefined) {
    return undefined;
  }

  if (parsed.errors.length > 0) {
    return jsonFailure(2, "usage_error", parsed.errors.join("\n"));
  }

  const unknownFlags = Object.keys(parsed.flags).filter((flag) => !ALLOWED_FLAGS.has(flag));
  if (unknownFlags.length > 0) {
    return jsonFailure(2, "usage_error", "Unsupported option.");
  }

  if (hasHelp(parsed)) {
    return jsonSuccess({
      kind: "workspace-session-snapshot-retention-cleanup.help",
      schemaVersion: WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_CLI_SCHEMA_VERSION,
      ...HELP_TEXT,
    });
  }

  const extraPositionals = parsed.positionals.slice(command.length);
  if (extraPositionals.length > 0) {
    return jsonFailure(2, "usage_error", "Unexpected positional argument.");
  }

  try {
    const fixture = await resolveFixturePath(
      requireStringFlag(parsed, "fixture"),
      options.cwd ?? process.cwd(),
    );
    const loaded = parseRetentionCleanupFixture(await readFixtureJson(fixture));
    const plan = planSnapshotRetentionCleanupDryRun(loaded.input);
    assertNoUnsafeMaterial(plan);

    return jsonSuccess(formatRetentionCleanupPreview(plan, fixture, loaded));
  } catch (error) {
    if (error instanceof WorkspaceSessionSnapshotRetentionCleanupError) {
      return jsonFailure(error.exitCode, error.code, error.message, error.details);
    }

    if (error instanceof LocalWorkspaceSessionSnapshotRetentionError) {
      return jsonFailure(
        2,
        retentionPlannerErrorCode(error),
        error.message,
        isRecord(error.details) ? error.details : undefined,
      );
    }

    return jsonFailure(
      1,
      "workspace_session_snapshot_retention_cleanup_error",
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function isWorkspaceSessionSnapshotRetentionCleanupCommand(
  argv: readonly string[],
): boolean {
  return workspaceSessionSnapshotRetentionCleanupCommand(parseArgv(argv).positionals) !==
    undefined;
}

export async function loadWorkspaceSessionSnapshotRetentionCleanupInput(
  fixturePath: string,
  options: Pick<WorkspaceSessionSnapshotRetentionCleanupRunOptions, "cwd"> = {},
): Promise<LocalWorkspaceSessionSnapshotRetentionCleanupInput> {
  const fixture = await resolveFixturePath(fixturePath, options.cwd ?? process.cwd());
  return parseRetentionCleanupFixture(await readFixtureJson(fixture)).input;
}

function formatRetentionCleanupPreview(
  plan: LocalWorkspaceSessionSnapshotRetentionCleanupPlan,
  fixture: ResolvedFixturePath,
  loaded: LoadedCleanupInput,
): Record<string, unknown> {
  return {
    kind: "workspace-session-snapshot-retention-cleanup.preview",
    schemaVersion: WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_CLI_SCHEMA_VERSION,
    fixture: {
      path: fixture.displayPath,
    },
    retention: {
      previewOnly: true,
      localOnly: plan.localOnly,
      dryRun: plan.dryRun,
      durableWrites: plan.durableWrites,
      writes: false,
      deletes: false,
      mutation: false,
      inspectedSections: loaded.inspectedSections,
      wouldDeleteCount: plan.deleteCount,
    },
    plan,
  };
}

function parseRetentionCleanupFixture(value: unknown): LoadedCleanupInput {
  const fixture = requiredRecord(value, "fixture");
  const inputValue = fixture.input;
  const input = inputValue === undefined
    ? fixture
    : requiredRecord(inputValue, "fixture.input");

  return {
    input: input as LocalWorkspaceSessionSnapshotRetentionCleanupInput,
    inspectedSections: cleanupInputSections(input),
  };
}

function cleanupInputSections(
  input: Record<string, unknown>,
): readonly string[] {
  return ["entries", "files", "records"].filter((field) => Array.isArray(input[field]));
}

function assertNoUnsafeMaterial(
  plan: LocalWorkspaceSessionSnapshotRetentionCleanupPlan,
): void {
  const unsafeIssues = plan.actions.flatMap((action) =>
    action.issues.filter((issue) => UNSAFE_MATERIAL_ISSUES.has(issue.issueKind))
  );
  if (unsafeIssues.length === 0) {
    return;
  }

  throw new WorkspaceSessionSnapshotRetentionCleanupError({
    exitCode: 2,
    code: "unsafe_fixture_material",
    message:
      "Retention cleanup fixture contains unsafe path or secret-like material and was rejected.",
    details: {
      issueCount: unsafeIssues.length,
      issueKinds: uniqueSorted(unsafeIssues.map((issue) => issue.issueKind)),
      reasons: uniqueSorted(unsafeIssues.map((issue) => issue.reason)),
    },
  });
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
        errors.push("Flag requires a value.");
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
        errors.push("Unsupported short flag.");
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
    errors.push("Flag was provided more than once.");
    return;
  }

  flags[name] = value;
}

function workspaceSessionSnapshotRetentionCleanupCommand(
  positionals: readonly string[],
): ParsedCommand | undefined {
  if (
    positionals[0] === "workspace" &&
    positionals[1] === "session" &&
    positionals[2] === "snapshot" &&
    positionals[3] === "retention-cleanup" &&
    positionals[4] === "preview"
  ) {
    return { length: 5 };
  }

  if (
    positionals[0] === "workspace" &&
    positionals[1] === "session" &&
    positionals[2] === "snapshot" &&
    positionals[3] === "retention" &&
    positionals[4] === "cleanup" &&
    positionals[5] === "preview"
  ) {
    return { length: 6 };
  }

  if (
    positionals[0] === "workspace-session" &&
    positionals[1] === "snapshot" &&
    positionals[2] === "retention-cleanup" &&
    positionals[3] === "preview"
  ) {
    return { length: 4 };
  }

  if (
    positionals[0] === "workspace-session" &&
    positionals[1] === "snapshot" &&
    positionals[2] === "retention" &&
    positionals[3] === "cleanup" &&
    positionals[4] === "preview"
  ) {
    return { length: 5 };
  }

  if (
    positionals[0] === "workspace-session-snapshot" &&
    positionals[1] === "retention-cleanup" &&
    positionals[2] === "preview"
  ) {
    return { length: 3 };
  }

  if (
    positionals[0] === "workspace-session-snapshot-retention-cleanup" &&
    positionals[1] === "preview"
  ) {
    return { length: 2 };
  }

  return undefined;
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
      throw new WorkspaceSessionSnapshotRetentionCleanupError({
        exitCode: 2,
        code: "fixture_not_found",
        message: "Fixture file was not found.",
        details: {
          path: displayPath(workspaceRoot, requestedPath),
        },
      });
    }

    throw new WorkspaceSessionSnapshotRetentionCleanupError({
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
    throw new WorkspaceSessionSnapshotRetentionCleanupError({
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
    throw new WorkspaceSessionSnapshotRetentionCleanupError({
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
    throw new WorkspaceSessionSnapshotRetentionCleanupError({
      exitCode: 2,
      code: "invalid_fixture_json",
      message: "Fixture file must contain valid JSON.",
      details: {
        path: fixture.displayPath,
      },
    });
  }
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

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw invalidFixture(`${label} must be an object.`);
  }
  return value;
}

function retentionPlannerErrorCode(
  error: LocalWorkspaceSessionSnapshotRetentionError,
): string {
  if (
    error.code ===
      LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_ERROR_CODES.INVALID_RETENTION_POLICY
  ) {
    return "invalid_retention_cleanup_policy";
  }
  return "invalid_retention_cleanup_fixture";
}

function jsonSuccess(
  value: unknown,
): WorkspaceSessionSnapshotRetentionCleanupCliResult {
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
): WorkspaceSessionSnapshotRetentionCleanupCliResult {
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

function usageError(message: string): WorkspaceSessionSnapshotRetentionCleanupError {
  return new WorkspaceSessionSnapshotRetentionCleanupError({
    exitCode: 2,
    code: "usage_error",
    message,
  });
}

function invalidFixture(message: string): WorkspaceSessionSnapshotRetentionCleanupError {
  return new WorkspaceSessionSnapshotRetentionCleanupError({
    exitCode: 2,
    code: "invalid_fixture",
    message,
  });
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

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values)).sort(compareStrings);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class WorkspaceSessionSnapshotRetentionCleanupError extends Error {
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
    this.name = "WorkspaceSessionSnapshotRetentionCleanupError";
    this.exitCode = options.exitCode;
    this.code = options.code;
    this.details = options.details;
  }
}
