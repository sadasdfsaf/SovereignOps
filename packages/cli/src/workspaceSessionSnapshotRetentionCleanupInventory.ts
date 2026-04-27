import { existsSync, readFileSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

import {
  LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_ERROR_CODES,
  LocalWorkspaceSessionSnapshotRetentionError,
  planFileBackedLocalWorkspaceSessionSnapshotRetentionCleanup,
  type LocalWorkspaceSessionSnapshotRetentionCleanupInput,
  type LocalWorkspaceSessionSnapshotRetentionCleanupIssueKind,
  type LocalWorkspaceSessionSnapshotRetentionCleanupPlan,
} from "../../sdk-js/src/localWorkspaceSessionSnapshotRetention.ts";

export interface WorkspaceSessionSnapshotRetentionCleanupInventoryCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface WorkspaceSessionSnapshotRetentionCleanupInventoryRunOptions {
  readonly cwd?: string;
}

type ParsedFlagValue = string | boolean;
type FixtureSafetyIssueKind =
  | "path-traversal"
  | "plan-pack-path"
  | "private-workspace-path"
  | "raw-local-path"
  | "raw-lock-token"
  | "raw-secret";

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

interface LoadedInventoryInput {
  readonly input: LocalWorkspaceSessionSnapshotRetentionCleanupInput;
  readonly inspectedSections: readonly string[];
  readonly sourcePath: string;
}

interface FixtureSafetyIssue {
  readonly issueKind: FixtureSafetyIssueKind;
  readonly path: string;
  readonly reason: string;
}

interface RedactionRecord {
  readonly path: string;
  readonly reason: string;
}

interface Redactor {
  readonly redactions: readonly RedactionRecord[];
  redact(value: unknown, valuePath: string): unknown;
}

export const WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_INVENTORY_CLI_SCHEMA_VERSION =
  "workspace-session-snapshot-retention-cleanup-inventory-cli/v1";

const DEFAULT_WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_INVENTORY_FIXTURE =
  "examples/workspace-session/snapshot-retention-cleanup-inventory.json";
const HELP_TEXT = {
  usage: [
    "sovereignops workspace-session snapshot retention-cleanup inventory --fixture <path>",
    "sovereignops workspace session snapshot retention-cleanup inventory --fixture <path>",
    "sovereignops workspace-session snapshot retention cleanup inventory --fixture <path>",
    "sovereignops workspace-session-snapshot retention-cleanup inventory --fixture <path>",
    "sovereignops workspace-session-snapshot-retention-cleanup inventory --fixture <path>",
  ],
  options: {
    fixture:
      `Workspace-local snapshot file-store inventory JSON fixture path, for example ${DEFAULT_WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_INVENTORY_FIXTURE}.`,
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
const UNSAFE_PLANNER_ISSUES = new Set<LocalWorkspaceSessionSnapshotRetentionCleanupIssueKind>([
  "path-traversal",
  "raw-lock-token",
  "raw-secret",
  "unsafe-absolute-path",
]);
const REDACTED_VALUE_PATTERN = /^\[redacted:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+\]$/;
const REDACTED_LOCK_TOKEN_PATTERN = /^\[redacted:lockToken:[A-Za-z0-9_-]+\]$/;
const REDACTED_PATH_PATTERN = /^\[redacted:path:[A-Za-z0-9_-]+\]$/;
const RAW_LOCAL_PATH_PATTERNS = [
  /\b[A-Za-z]:[\\/][^\s"',;)}\]]+/g,
  /\\\\[^\\\s"',;)}\]]+[\\][^\s"',;)}\]]+/g,
  /\b(?:\/Users|\/home|\/var|\/tmp|\/private|\/mnt|\/Volumes)\/[^\s"',;)}\]]+/g,
];
const RAW_SECRET_PATTERNS = [
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/i,
  /\b(?:sk-[A-Za-z0-9_-]{8,}|sk_[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,})\b/i,
  /\b(?:apiKey|api[_-]?key|token|password|secret)\s*[:=]\s*["']?[^"',;\s]+/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/i,
];

export async function runWorkspaceSessionSnapshotRetentionCleanupInventoryCli(
  argv: readonly string[] = [],
  options: WorkspaceSessionSnapshotRetentionCleanupInventoryRunOptions = {},
): Promise<WorkspaceSessionSnapshotRetentionCleanupInventoryCliResult | undefined> {
  const parsed = parseArgv(argv);
  const command = workspaceSessionSnapshotRetentionCleanupInventoryCommand(
    parsed.positionals,
  );
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
      kind: "workspace-session-snapshot-retention-cleanup-inventory.help",
      schemaVersion: WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_INVENTORY_CLI_SCHEMA_VERSION,
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
    const fixtureJson = await readFixtureJson(fixture);
    assertNoUnsafeFixtureMaterial(fixtureJson);
    const loaded = parseInventoryFixture(fixtureJson);
    const plan = planFileBackedLocalWorkspaceSessionSnapshotRetentionCleanup(loaded.input);
    assertNoUnsafePlannerMaterial(plan);

    return jsonSuccess(formatInventoryEnvelope(plan, fixture, loaded));
  } catch (error) {
    if (error instanceof WorkspaceSessionSnapshotRetentionCleanupInventoryError) {
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
      "workspace_session_snapshot_retention_cleanup_inventory_error",
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function isWorkspaceSessionSnapshotRetentionCleanupInventoryCommand(
  argv: readonly string[],
): boolean {
  return workspaceSessionSnapshotRetentionCleanupInventoryCommand(parseArgv(argv).positionals) !==
    undefined;
}

export async function loadWorkspaceSessionSnapshotRetentionCleanupInventoryInput(
  fixturePath: string,
  options: Pick<WorkspaceSessionSnapshotRetentionCleanupInventoryRunOptions, "cwd"> = {},
): Promise<LocalWorkspaceSessionSnapshotRetentionCleanupInput> {
  const fixture = await resolveFixturePath(fixturePath, options.cwd ?? process.cwd());
  const fixtureJson = await readFixtureJson(fixture);
  assertNoUnsafeFixtureMaterial(fixtureJson);
  return parseInventoryFixture(fixtureJson).input;
}

function formatInventoryEnvelope(
  plan: LocalWorkspaceSessionSnapshotRetentionCleanupPlan,
  fixture: ResolvedFixturePath,
  loaded: LoadedInventoryInput,
): Record<string, unknown> {
  return {
    kind: "workspace-session-snapshot-retention-cleanup.inventory",
    schemaVersion: WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_INVENTORY_CLI_SCHEMA_VERSION,
    fixture: {
      path: fixture.displayPath,
    },
    inventory: {
      localOnly: true,
      sourcePath: loaded.sourcePath,
      safeRelativeOrRedactedMetadataOnly: true,
      inspectedSections: loaded.inspectedSections,
      entryCount: plan.entryCount,
    },
    retention: {
      previewOnly: true,
      localOnly: plan.localOnly,
      dryRun: plan.dryRun,
      durableWrites: plan.durableWrites,
      writes: false,
      deletes: false,
      mutation: false,
      wouldKeepCount: plan.keepCount,
      wouldDeleteCount: plan.deleteCount,
      reviewCount: plan.reviewCount,
    },
    plan,
  };
}

function parseInventoryFixture(value: unknown): LoadedInventoryInput {
  const fixture = requiredRecord(value, "fixture");
  const [inputValue, sourcePath] = inventoryInputCandidate(fixture);
  const input = requiredRecord(inputValue, sourcePath);

  return {
    input: input as LocalWorkspaceSessionSnapshotRetentionCleanupInput,
    inspectedSections: cleanupInputSections(input),
    sourcePath,
  };
}

function inventoryInputCandidate(
  fixture: Record<string, unknown>,
): readonly [unknown, string] {
  if (fixture.inventory !== undefined) {
    return [fixture.inventory, "$.inventory"];
  }
  if (fixture.input !== undefined) {
    return [fixture.input, "$.input"];
  }
  return [fixture, "$"];
}

function cleanupInputSections(input: Record<string, unknown>): readonly string[] {
  return ["entries", "files", "records"].filter((field) => Array.isArray(input[field]));
}

function assertNoUnsafeFixtureMaterial(value: unknown): void {
  const issues = collectFixtureSafetyIssues(value);
  if (issues.length === 0) {
    return;
  }

  throw new WorkspaceSessionSnapshotRetentionCleanupInventoryError({
    exitCode: 2,
    code: "unsafe_inventory_fixture_material",
    message:
      "Inventory fixture contains unsafe path or secret-like material and was rejected.",
    details: {
      issueCount: issues.length,
      issueKinds: uniqueSorted(issues.map((issue) => issue.issueKind)),
      reasons: uniqueSorted(issues.map((issue) => issue.reason)),
    },
  });
}

function assertNoUnsafePlannerMaterial(
  plan: LocalWorkspaceSessionSnapshotRetentionCleanupPlan,
): void {
  const unsafeIssues = plan.actions.flatMap((action) =>
    action.issues.filter((issue) => UNSAFE_PLANNER_ISSUES.has(issue.issueKind))
  );
  if (unsafeIssues.length === 0) {
    return;
  }

  throw new WorkspaceSessionSnapshotRetentionCleanupInventoryError({
    exitCode: 2,
    code: "unsafe_inventory_fixture_material",
    message:
      "Inventory fixture contains unsafe path or secret-like material and was rejected.",
    details: {
      issueCount: unsafeIssues.length,
      issueKinds: uniqueSorted(unsafeIssues.map((issue) => issue.issueKind)),
      reasons: uniqueSorted(unsafeIssues.map((issue) => issue.reason)),
    },
  });
}

function collectFixtureSafetyIssues(
  value: unknown,
  valuePath = "$",
  key?: string,
  seen: WeakSet<object> = new WeakSet(),
): readonly FixtureSafetyIssue[] {
  const issues: FixtureSafetyIssue[] = [];
  collect(value, valuePath, key);
  return issues;

  function collect(nested: unknown, nestedPath: string, nestedKey?: string): void {
    if (typeof nested === "string") {
      issues.push(...stringSafetyIssues(nested, nestedPath, nestedKey));
      return;
    }
    if (nested === null || typeof nested !== "object") {
      return;
    }
    if (seen.has(nested)) {
      return;
    }
    seen.add(nested);

    if (Array.isArray(nested)) {
      nested.forEach((item, index) => collect(item, `${nestedPath}[${index}]`));
    } else if (isRecord(nested)) {
      for (const [entryKey, entryValue] of Object.entries(nested)) {
        collect(entryValue, `${nestedPath}${jsonPathSegment(entryKey)}`, entryKey);
      }
    }

    seen.delete(nested);
  }
}

function stringSafetyIssues(
  value: string,
  valuePath: string,
  key: string | undefined,
): readonly FixtureSafetyIssue[] {
  if (isKnownRedactedValue(value)) {
    return [];
  }

  const issues: FixtureSafetyIssue[] = [];
  if (containsRawLocalPath(value)) {
    issues.push(fixtureSafetyIssue("raw-local-path", valuePath, "raw-local-path"));
  }
  if (isPathKey(key) && hasTraversalSegment(value)) {
    issues.push(fixtureSafetyIssue("path-traversal", valuePath, "path-traversal"));
  }
  if (isPathKey(key) && containsPrivateWorkspacePath(value)) {
    issues.push(
      fixtureSafetyIssue(
        "private-workspace-path",
        valuePath,
        "private-workspace-path",
      ),
    );
  }
  if (isPathKey(key) && containsPlanPackPath(value)) {
    issues.push(fixtureSafetyIssue("plan-pack-path", valuePath, "plan-pack-path"));
  }
  if (isRawLockToken(value, key)) {
    issues.push(fixtureSafetyIssue("raw-lock-token", valuePath, "raw-lock-token"));
  } else if (isRawSecret(value, key)) {
    issues.push(fixtureSafetyIssue("raw-secret", valuePath, "raw-secret"));
  }
  return issues;
}

function fixtureSafetyIssue(
  issueKind: FixtureSafetyIssueKind,
  issuePath: string,
  reason: string,
): FixtureSafetyIssue {
  return {
    issueKind,
    path: issuePath,
    reason,
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

function workspaceSessionSnapshotRetentionCleanupInventoryCommand(
  positionals: readonly string[],
): ParsedCommand | undefined {
  if (
    positionals[0] === "workspace" &&
    positionals[1] === "session" &&
    positionals[2] === "snapshot" &&
    positionals[3] === "retention-cleanup" &&
    positionals[4] === "inventory"
  ) {
    return { length: 5 };
  }

  if (
    positionals[0] === "workspace" &&
    positionals[1] === "session" &&
    positionals[2] === "snapshot" &&
    positionals[3] === "retention" &&
    positionals[4] === "cleanup" &&
    positionals[5] === "inventory"
  ) {
    return { length: 6 };
  }

  if (
    positionals[0] === "workspace-session" &&
    positionals[1] === "snapshot" &&
    positionals[2] === "retention-cleanup" &&
    positionals[3] === "inventory"
  ) {
    return { length: 4 };
  }

  if (
    positionals[0] === "workspace-session" &&
    positionals[1] === "snapshot" &&
    positionals[2] === "retention" &&
    positionals[3] === "cleanup" &&
    positionals[4] === "inventory"
  ) {
    return { length: 5 };
  }

  if (
    positionals[0] === "workspace-session-snapshot" &&
    positionals[1] === "retention-cleanup" &&
    positionals[2] === "inventory"
  ) {
    return { length: 3 };
  }

  if (
    positionals[0] === "workspace-session-snapshot" &&
    positionals[1] === "retention" &&
    positionals[2] === "cleanup" &&
    positionals[3] === "inventory"
  ) {
    return { length: 4 };
  }

  if (
    positionals[0] === "workspace-session-snapshot-retention-cleanup" &&
    positionals[1] === "inventory"
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
      throw new WorkspaceSessionSnapshotRetentionCleanupInventoryError({
        exitCode: 2,
        code: "fixture_not_found",
        message: "Fixture file was not found.",
        details: {
          path: displayPath(workspaceRoot, requestedPath),
        },
      });
    }

    throw new WorkspaceSessionSnapshotRetentionCleanupInventoryError({
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
    throw new WorkspaceSessionSnapshotRetentionCleanupInventoryError({
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
    throw new WorkspaceSessionSnapshotRetentionCleanupInventoryError({
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
    throw new WorkspaceSessionSnapshotRetentionCleanupInventoryError({
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

function containsRawLocalPath(value: string): boolean {
  return RAW_LOCAL_PATH_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    const matched = pattern.test(value);
    pattern.lastIndex = 0;
    return matched;
  });
}

function containsPrivateWorkspacePath(value: string): boolean {
  return pathSegments(value).includes(PRIVATE_WORKSPACE_SEGMENT);
}

function containsPlanPackPath(value: string): boolean {
  return pathSegments(value).some((segment) => PLAN_PACK_SEGMENTS.has(segment.toLowerCase()));
}

function pathSegments(value: string): readonly string[] {
  return value.split(/[\\/]+/).filter((segment) => segment.length > 0);
}

function isKnownRedactedValue(value: string): boolean {
  return value === "[REDACTED]" ||
    value === "[redacted-path]" ||
    REDACTED_VALUE_PATTERN.test(value);
}

function isPathKey(key: string | undefined): boolean {
  return key !== undefined && /(?:^|\.|_|-)(?:absolute)?(?:file|storage)?path$/i.test(key);
}

function hasTraversalSegment(value: string): boolean {
  return /(^|[\\/])\.\.([\\/]|$)/.test(value);
}

function isRawLockToken(value: string, key: string | undefined): boolean {
  if (REDACTED_LOCK_TOKEN_PATTERN.test(value)) {
    return false;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }
  return /lock[._-]?token(?:ref)?/i.test(key ?? "") ||
    /\block_[A-Za-z0-9_-]{4,}\b/.test(trimmed) ||
    /\block-token-[A-Za-z0-9_-]{4,}\b/i.test(trimmed) ||
    /\blockToken\s*[:=]\s*["']?[^"',;\s]+/i.test(trimmed);
}

function isRawSecret(value: string, key: string | undefined): boolean {
  if (isKnownRedactedValue(value) || REDACTED_PATH_PATTERN.test(value)) {
    return false;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (
    key !== undefined &&
    /authorization|credential|credentials|password|passphrase|secret|api[._-]?key|api[._-]?token|private[._-]?key|access[._-]?token|refresh[._-]?token/i
      .test(key)
  ) {
    return true;
  }
  if (key !== undefined && /token/i.test(key) && !/lock[._-]?token/i.test(key)) {
    return true;
  }
  return RAW_SECRET_PATTERNS.some((pattern) => pattern.test(trimmed));
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
    return "invalid_retention_cleanup_inventory_policy";
  }
  return "invalid_retention_cleanup_inventory_fixture";
}

function jsonSuccess(
  value: unknown,
): WorkspaceSessionSnapshotRetentionCleanupInventoryCliResult {
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
): WorkspaceSessionSnapshotRetentionCleanupInventoryCliResult {
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

function usageError(message: string): WorkspaceSessionSnapshotRetentionCleanupInventoryError {
  return new WorkspaceSessionSnapshotRetentionCleanupInventoryError({
    exitCode: 2,
    code: "usage_error",
    message,
  });
}

function invalidFixture(message: string): WorkspaceSessionSnapshotRetentionCleanupInventoryError {
  return new WorkspaceSessionSnapshotRetentionCleanupInventoryError({
    exitCode: 2,
    code: "invalid_fixture",
    message,
  });
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
            const nestedPath = `${valuePath}${jsonPathSegment(key)}`;
            if (isRawLockToken(String(nested), key)) {
              redactions.push({ path: nestedPath, reason: "lock token" });
              return [key, "[REDACTED]"];
            }
            if (isRawSecret(String(nested), key)) {
              redactions.push({ path: nestedPath, reason: "secret-like value" });
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
    if (isRawLockToken(redacted, undefined)) {
      redactions.push({ path: valuePath, reason: "lock token" });
      redacted = "[REDACTED]";
    }
    for (const pattern of RAW_SECRET_PATTERNS) {
      if (!pattern.test(redacted)) {
        continue;
      }
      redactions.push({ path: valuePath, reason: "secret-like value" });
      redacted = redacted.replace(pattern, "[REDACTED]");
    }
    for (const pattern of RAW_LOCAL_PATH_PATTERNS) {
      pattern.lastIndex = 0;
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

function jsonPathSegment(key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values)).sort(compareStrings);
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

class WorkspaceSessionSnapshotRetentionCleanupInventoryError extends Error {
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
    this.name = "WorkspaceSessionSnapshotRetentionCleanupInventoryError";
    this.exitCode = options.exitCode;
    this.code = options.code;
    this.details = options.details;
  }
}
