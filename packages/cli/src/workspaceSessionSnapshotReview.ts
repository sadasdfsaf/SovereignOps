import { existsSync, readFileSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

export interface WorkspaceSessionSnapshotReviewCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface WorkspaceSessionSnapshotReviewRunOptions {
  readonly cwd?: string;
}

export interface WorkspaceSessionSnapshotReviewFixture {
  readonly schemaVersion: typeof WORKSPACE_SESSION_SNAPSHOT_REVIEW_SCHEMA_VERSION;
  readonly kind?: string;
  readonly generatedAt: string;
  readonly baseline: Readonly<Record<string, unknown>>;
  readonly candidate: Readonly<Record<string, unknown>>;
  readonly records: readonly unknown[];
}

type SnapshotReviewAction = "compare" | "retention-preview";
type ParsedFlagValue = string | boolean;
type DifferenceStatus = "added" | "removed" | "changed";

interface ParsedArgv {
  readonly positionals: readonly string[];
  readonly flags: Readonly<Record<string, ParsedFlagValue>>;
  readonly errors: readonly string[];
}

interface ParsedCommand {
  readonly action: SnapshotReviewAction;
  readonly length: number;
}

interface ResolvedFixturePath {
  readonly absolutePath: string;
  readonly displayPath: string;
  readonly workspaceRoot: string;
}

interface SnapshotDifference {
  readonly path: string;
  readonly status: DifferenceStatus;
  readonly baseline?: unknown;
  readonly candidate?: unknown;
}

interface RedactionRecord {
  readonly path: string;
  readonly reason: string;
}

interface Redactor {
  readonly redactions: readonly RedactionRecord[];
  redact(value: unknown, valuePath: string): unknown;
}

export const WORKSPACE_SESSION_SNAPSHOT_REVIEW_SCHEMA_VERSION =
  "workspace-session-snapshot-review/v1";

const DEFAULT_WORKSPACE_SESSION_SNAPSHOT_REVIEW_FIXTURE =
  "examples/workspace-session/snapshot-review.json";
const HELP_TEXT = {
  usage: [
    "sovereignops workspace-session snapshot-review compare --fixture <path>",
    "sovereignops workspace-session snapshot-review retention-preview --fixture <path>",
    "sovereignops workspace-session snapshot compare --fixture <path>",
    "sovereignops workspace-session snapshot retention-preview --fixture <path>",
    "sovereignops workspace-session-snapshot-review compare --fixture <path>",
    "sovereignops workspace-session-snapshot-review retention-preview --fixture <path>",
    "sovereignops workspace-session-snapshot compare --fixture <path>",
    "sovereignops workspace-session-snapshot retention-preview --fixture <path>",
  ],
  options: {
    fixture:
      `Local workspace/session snapshot review JSON fixture path, for example ${DEFAULT_WORKSPACE_SESSION_SNAPSHOT_REVIEW_FIXTURE}.`,
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
  /^(authorization|cookie|credential|credentials|password|passphrase|secret|api[._-]?key|api[._-]?token|private[._-]?key|access[._-]?token|refresh[._-]?token|root[._-]?key(?:ref)?|rootkeyref|lock[._-]?token(?:ref)?|locktokenref|session[._-]?id|sessionid|session[._-]?token|token)$/i;
const SENSITIVE_TEXT_PATTERNS = [
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/g,
  /\b(?:sk-[A-Za-z0-9_-]{8,}|sk_[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,})\b/g,
  /\b((?:apiKey|api[_-]?key|token|password|secret|rootKeyRef|root[_-]?key|lockTokenRef|lock[_-]?token|sessionId|session[_-]?id)\s*[:=]\s*)["']?[^"',;\s]+["']?/gi,
  /\bkey_session_[A-Za-z0-9_-]+\b/g,
  /\block-token-[A-Za-z0-9_-]+\b/g,
  /\bsess_[A-Za-z0-9_-]+\b/g,
  /\[redacted:lockToken:[^\]]+\]/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];
const RAW_LOCAL_PATH_PATTERNS = [
  /\b[A-Za-z]:[\\/][^\s"',;)}\]]+/g,
  /\\\\[^\\\s"',;)}\]]+[\\][^\s"',;)}\]]+/g,
  /\/\/[^/\s"',;)}\]]+\/[^\s"',;)}\]]+/g,
  /\b(?:\/Users|\/home|\/var|\/tmp|\/private|\/mnt|\/Volumes)\/[^\s"',;)}\]]+/g,
  /\bworkspaces[\\/][^\s"',;)}\]]+/g,
];

export async function runWorkspaceSessionSnapshotReviewCli(
  argv: readonly string[] = [],
  options: WorkspaceSessionSnapshotReviewRunOptions = {},
): Promise<WorkspaceSessionSnapshotReviewCliResult | undefined> {
  const parsed = parseArgv(argv);
  const command = workspaceSessionSnapshotReviewCommand(parsed.positionals);
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
      kind: "workspace-session-snapshot-review.help",
      command: command.action,
      ...HELP_TEXT,
    });
  }

  const extraPositionals = parsed.positionals.slice(command.length);
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
    const bundle = parseSnapshotReviewFixture(await readFixtureJson(fixture));

    return jsonSuccess(
      command.action === "compare"
        ? formatSnapshotCompare(bundle, fixture)
        : formatRetentionPreview(bundle, fixture),
    );
  } catch (error) {
    if (error instanceof WorkspaceSessionSnapshotReviewError) {
      return jsonFailure(error.exitCode, error.code, error.message, error.details);
    }

    return jsonFailure(
      1,
      "workspace_session_snapshot_review_error",
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function isWorkspaceSessionSnapshotReviewCommand(argv: readonly string[]): boolean {
  return workspaceSessionSnapshotReviewCommand(parseArgv(argv).positionals) !== undefined;
}

export async function loadWorkspaceSessionSnapshotReviewFixture(
  fixturePath: string,
  options: Pick<WorkspaceSessionSnapshotReviewRunOptions, "cwd"> = {},
): Promise<WorkspaceSessionSnapshotReviewFixture> {
  const fixture = await resolveFixturePath(fixturePath, options.cwd ?? process.cwd());
  return parseSnapshotReviewFixture(await readFixtureJson(fixture));
}

function formatSnapshotCompare(
  bundle: WorkspaceSessionSnapshotReviewFixture,
  fixture: ResolvedFixturePath,
): Record<string, unknown> {
  const differences = diffValues(bundle.baseline, bundle.candidate, "$");
  const counts = countDifferences(differences);
  const value = {
    kind: "workspace-session-snapshot-review.compare",
    schemaVersion: bundle.schemaVersion,
    generatedAt: bundle.generatedAt,
    fixture: {
      path: fixture.displayPath,
    },
    baseline: summarizeSnapshot(bundle.baseline),
    candidate: summarizeSnapshot(bundle.candidate),
    records: {
      total: bundle.records.length,
      actions: countRecordStrings(bundle.records, recordAction),
      operations: countRecordStrings(bundle.records, recordOperation),
    },
    summary: {
      changed: differences.length > 0,
      differenceCount: differences.length,
      addedCount: counts.added,
      removedCount: counts.removed,
      changedCount: counts.changed,
    },
    differences,
    retention: noMutationRetentionSummary([
      "baseline",
      "candidate",
      "records",
    ]),
  };

  return redactAndAttach(value);
}

function formatRetentionPreview(
  bundle: WorkspaceSessionSnapshotReviewFixture,
  fixture: ResolvedFixturePath,
): Record<string, unknown> {
  const value = {
    kind: "workspace-session-snapshot-review.retention-preview",
    schemaVersion: bundle.schemaVersion,
    generatedAt: bundle.generatedAt,
    fixture: {
      path: fixture.displayPath,
    },
    baseline: summarizeSnapshot(bundle.baseline),
    candidate: summarizeSnapshot(bundle.candidate),
    records: {
      total: bundle.records.length,
      actions: countRecordStrings(bundle.records, recordAction),
      operations: countRecordStrings(bundle.records, recordOperation),
      retentionDecisions: countRecordStrings(bundle.records, recordRetentionDecision),
      preview: bundle.records.map(summarizeRecordForRetention),
    },
    retention: noMutationRetentionSummary([
      "baseline",
      "candidate",
      "records",
    ]),
  };

  return redactAndAttach(value);
}

function noMutationRetentionSummary(inspectedSections: readonly string[]): Record<string, unknown> {
  return {
    previewOnly: true,
    writes: false,
    deletes: false,
    rawPathsOutput: false,
    rootKeysOutput: false,
    lockTokensOutput: false,
    sessionIdsOutput: false,
    inspectedSections,
  };
}

function summarizeSnapshot(value: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const descriptor = isRecord(value.descriptor) ? value.descriptor : {};
  const session = isRecord(value.session) ? value.session : value;
  const storage = isRecord(value.storage) ? value.storage : {};
  const operations = stringArray(session.operations) ?? [];
  const records = Array.isArray(value.records) ? value.records : undefined;
  const storagePath =
    optionalString(storage.path) ??
    optionalString(storage.storagePath) ??
    optionalString(descriptor.storagePath);

  return optionalFields({
    workspaceId: optionalString(value.workspaceId) ?? optionalString(descriptor.workspaceId),
    deviceId: optionalString(value.deviceId) ?? optionalString(descriptor.deviceId),
    state: optionalString(session.state),
    operationCount: operations.length,
    operations,
    snapshotVersion: optionalInteger(session.snapshotVersion),
    sessionRef: redactedId("sessionId", optionalString(session.sessionId)),
    storagePath: storagePath === undefined ? undefined : redactedPath(storagePath),
    recordCount: records?.length,
  });
}

function summarizeRecordForRetention(value: unknown, index: number): Record<string, unknown> {
  const record = isRecord(value) ? value : {};
  const details = isRecord(record.details) ? record.details : {};
  const payload = isRecord(record.payload) ? record.payload : {};
  const nestedLock = isRecord(details.lock)
    ? details.lock
    : isRecord(payload.lock)
    ? payload.lock
    : {};
  const sessionId =
    optionalString(record.sessionId) ??
    optionalString(details.sessionId) ??
    optionalString(payload.sessionId);

  return optionalFields({
    index,
    id:
      optionalString(record.id) ??
      optionalString(record.auditId) ??
      optionalString(record.eventId),
    action: recordAction(record),
    operation: recordOperation(record),
    createdAt: optionalString(record.createdAt) ?? optionalString(details.createdAt),
    decision: recordRetentionDecision(record),
    reason:
      optionalString(record.reason) ??
      optionalString(details.reason) ??
      optionalString(payload.reason),
    sessionRef: redactedId("sessionId", sessionId),
    storagePath:
      optionalString(record.storagePath) ??
      optionalString(details.storagePath) ??
      optionalString(payload.storagePath),
    storagePathDisplay:
      optionalString(record.storagePathDisplay) ??
      optionalString(details.storagePathDisplay) ??
      optionalString(payload.storagePathDisplay),
    lockTokenRef:
      optionalString(record.lockTokenRef) ??
      optionalString(details.lockTokenRef) ??
      optionalString(payload.lockTokenRef) ??
      optionalString(nestedLock.lockTokenRef),
  });
}

function recordAction(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return optionalString(value.action) ?? optionalString(value.type);
}

function recordOperation(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const details = isRecord(value.details) ? value.details : {};
  const payload = isRecord(value.payload) ? value.payload : {};
  return (
    optionalString(value.operation) ??
    optionalString(details.operation) ??
    optionalString(payload.operation)
  );
}

function recordRetentionDecision(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const retained =
    optionalBoolean(value.retained) ??
    optionalBoolean(value.keep) ??
    optionalBoolean(value.wouldRetain);
  if (retained !== undefined) {
    return retained ? "retain" : "drop";
  }
  return (
    optionalString(value.retentionDecision) ??
    optionalString(value.decision) ??
    optionalString(value.retention)
  );
}

function countRecordStrings(
  records: readonly unknown[],
  selector: (record: unknown) => string | undefined,
): Record<string, number> {
  const counts = new Map<string, number>();
  for (const record of records) {
    const value = selector(record);
    if (value !== undefined) {
      increment(counts, value);
    }
  }
  return sortedRecord(counts);
}

function diffValues(
  baseline: unknown,
  candidate: unknown,
  valuePath: string,
): readonly SnapshotDifference[] {
  const differences: SnapshotDifference[] = [];
  collectDifferences(baseline, candidate, valuePath, differences);
  return differences;
}

function collectDifferences(
  baseline: unknown,
  candidate: unknown,
  valuePath: string,
  differences: SnapshotDifference[],
): void {
  if (isRecord(baseline) && isRecord(candidate)) {
    const keys = new Set([...Object.keys(baseline), ...Object.keys(candidate)]);
    for (const key of [...keys].sort(compareStrings)) {
      const nestedPath = `${valuePath}${jsonPathSegment(key)}`;
      const hasBaseline = Object.hasOwn(baseline, key);
      const hasCandidate = Object.hasOwn(candidate, key);
      if (!hasBaseline) {
        differences.push({
          path: nestedPath,
          status: "added",
          candidate: candidate[key],
        });
        continue;
      }
      if (!hasCandidate) {
        differences.push({
          path: nestedPath,
          status: "removed",
          baseline: baseline[key],
        });
        continue;
      }
      collectDifferences(baseline[key], candidate[key], nestedPath, differences);
    }
    return;
  }

  if (Array.isArray(baseline) && Array.isArray(candidate)) {
    const length = Math.max(baseline.length, candidate.length);
    for (let index = 0; index < length; index += 1) {
      const nestedPath = `${valuePath}[${index}]`;
      if (index >= baseline.length) {
        differences.push({
          path: nestedPath,
          status: "added",
          candidate: candidate[index],
        });
        continue;
      }
      if (index >= candidate.length) {
        differences.push({
          path: nestedPath,
          status: "removed",
          baseline: baseline[index],
        });
        continue;
      }
      collectDifferences(baseline[index], candidate[index], nestedPath, differences);
    }
    return;
  }

  if (!Object.is(baseline, candidate)) {
    differences.push({
      path: valuePath,
      status: "changed",
      baseline,
      candidate,
    });
  }
}

function countDifferences(differences: readonly SnapshotDifference[]): Record<DifferenceStatus, number> {
  const counts: Record<DifferenceStatus, number> = {
    added: 0,
    removed: 0,
    changed: 0,
  };
  for (const difference of differences) {
    counts[difference.status] += 1;
  }
  return counts;
}

function jsonPathSegment(key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
}

function parseSnapshotReviewFixture(value: unknown): WorkspaceSessionSnapshotReviewFixture {
  const record = requiredRecord(value, "fixture");
  if (record.schemaVersion !== WORKSPACE_SESSION_SNAPSHOT_REVIEW_SCHEMA_VERSION) {
    throw invalidFixture(
      `fixture.schemaVersion must be "${WORKSPACE_SESSION_SNAPSHOT_REVIEW_SCHEMA_VERSION}".`,
    );
  }

  const snapshots = isRecord(record.snapshots) ? record.snapshots : undefined;
  const retentionPreview = isRecord(record.retentionPreview)
    ? record.retentionPreview
    : undefined;
  const retentionResponse = isRecord(retentionPreview?.response)
    ? retentionPreview.response
    : undefined;
  const records = Array.isArray(record.records)
    ? record.records
    : retentionResponse?.records;
  if (!Array.isArray(records)) {
    throw invalidFixture("fixture.records must be an array or fixture.retentionPreview.response.records must be an array.");
  }

  return {
    schemaVersion: WORKSPACE_SESSION_SNAPSHOT_REVIEW_SCHEMA_VERSION,
    kind: optionalNonEmptyString(record.kind, "fixture.kind"),
    generatedAt: nonEmptyString(record.generatedAt, "fixture.generatedAt"),
    baseline: requiredRecord(
      record.baseline ?? snapshots?.baseline,
      "fixture.baseline",
    ),
    candidate: requiredRecord(
      record.candidate ?? snapshots?.candidate,
      "fixture.candidate",
    ),
    records,
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

function workspaceSessionSnapshotReviewCommand(
  positionals: readonly string[],
): ParsedCommand | undefined {
  if (
    positionals[0] === "workspace" &&
    positionals[1] === "session" &&
    positionals[2] === "snapshot" &&
    isSnapshotReviewAction(positionals[3])
  ) {
    return {
      action: positionals[3],
      length: 4,
    };
  }

  if (
    positionals[0] === "workspace-session" &&
    positionals[1] === "snapshot-review" &&
    isSnapshotReviewAction(positionals[2])
  ) {
    return {
      action: positionals[2],
      length: 3,
    };
  }

  if (
    positionals[0] === "workspace-session" &&
    positionals[1] === "snapshot" &&
    isSnapshotReviewAction(positionals[2])
  ) {
    return {
      action: positionals[2],
      length: 3,
    };
  }

  if (
    positionals[0] === "workspace-session-snapshot-review" &&
    isSnapshotReviewAction(positionals[1])
  ) {
    return {
      action: positionals[1],
      length: 2,
    };
  }

  if (
    positionals[0] === "workspace-session-snapshot" &&
    isSnapshotReviewAction(positionals[1])
  ) {
    return {
      action: positionals[1],
      length: 2,
    };
  }

  return undefined;
}

function isSnapshotReviewAction(value: unknown): value is SnapshotReviewAction {
  return value === "compare" || value === "retention-preview";
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
      throw new WorkspaceSessionSnapshotReviewError({
        exitCode: 2,
        code: "fixture_not_found",
        message: "Fixture file was not found.",
        details: {
          path: displayPath(workspaceRoot, requestedPath),
        },
      });
    }

    throw new WorkspaceSessionSnapshotReviewError({
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
    throw new WorkspaceSessionSnapshotReviewError({
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
    throw new WorkspaceSessionSnapshotReviewError({
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
    throw new WorkspaceSessionSnapshotReviewError({
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

function redactAndAttach(value: Record<string, unknown>): Record<string, unknown> {
  const redactor = createRedactor();
  const redacted = redactor.redact(value, "$");
  return {
    ...(isRecord(redacted) ? redacted : { value: redacted }),
    ...(redactor.redactions.length === 0 ? {} : { redactions: redactor.redactions }),
  };
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

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw invalidFixture(`${label} must be an object.`);
  }
  return value;
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

function jsonSuccess(value: unknown): WorkspaceSessionSnapshotReviewCliResult {
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
): WorkspaceSessionSnapshotReviewCliResult {
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

function usageError(message: string): WorkspaceSessionSnapshotReviewError {
  return new WorkspaceSessionSnapshotReviewError({
    exitCode: 2,
    code: "usage_error",
    message,
  });
}

function invalidFixture(message: string): WorkspaceSessionSnapshotReviewError {
  return new WorkspaceSessionSnapshotReviewError({
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

function compareRedactions(left: RedactionRecord, right: RedactionRecord): number {
  return compareStrings(left.path, right.path) || compareStrings(left.reason, right.reason);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class WorkspaceSessionSnapshotReviewError extends Error {
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
    this.name = "WorkspaceSessionSnapshotReviewError";
    this.exitCode = options.exitCode;
    this.code = options.code;
    this.details = options.details;
  }
}
