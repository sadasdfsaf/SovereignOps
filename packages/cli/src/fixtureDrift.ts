import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface FixtureDriftCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface FixtureDriftRunnerInvocation {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
}

export type FixtureDriftRunner = (
  invocation: FixtureDriftRunnerInvocation,
) => FixtureDriftCliResult | Promise<FixtureDriftCliResult>;

export interface FixtureDriftRunOptions {
  readonly cwd?: string;
  readonly fixtureDriftRunner?: FixtureDriftRunner;
  readonly pythonExecutable?: string;
}

type ParsedFlagValue = string | boolean;

interface ParsedArgv {
  readonly positionals: readonly string[];
  readonly flags: Readonly<Record<string, ParsedFlagValue>>;
  readonly errors: readonly string[];
}

const HELP_TEXT = {
  usage: [
    "sovereignops fixture drift check [--fixture <path>] [--openapi <path>]",
    "sovereignops fixture drift report [--fixture <path>] [--openapi <path>]",
    "sovereignops fixtures verify [--fixture <path>] [--openapi <path>]",
  ],
  options: {
    fixture: "Optional fixture path passed through to scripts/fixture_drift.py.",
    openapi: "Optional OpenAPI path passed through to scripts/fixture_drift.py.",
  },
};

const BOOLEAN_FLAGS = new Set(["help", "h", "json"]);
const ALLOWED_FLAGS = new Set(["fixture", "help", "h", "json", "openapi"]);

export async function runFixtureDriftCli(
  argv: readonly string[] = [],
  options: FixtureDriftRunOptions = {},
): Promise<FixtureDriftCliResult | undefined> {
  const parsed = parseArgv(argv);
  if (!isFixtureDriftParsedCommand(parsed)) {
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
      kind: "fixture-drift.help",
      ...HELP_TEXT,
    });
  }

  const commandLength = fixtureDriftCommandLength(parsed.positionals);
  const extraPositionals = parsed.positionals.slice(commandLength);
  if (extraPositionals.length > 0) {
    return jsonFailure(
      2,
      "usage_error",
      `Unexpected positional argument: ${extraPositionals[0]}`,
    );
  }

  try {
    const cwd = options.cwd ?? process.cwd();
    const workspaceRoot = findWorkspaceRoot(cwd);
    if (workspaceRoot === undefined) {
      throw usageError("Could not locate the SovereignOps workspace root.");
    }

    const invocation = buildFixtureDriftInvocation(parsed, {
      cwd: workspaceRoot,
      pythonExecutable: options.pythonExecutable ?? "python",
      workspaceRoot,
    });
    const runner = options.fixtureDriftRunner ?? createNodeFixtureDriftRunner();
    return normalizeRunnerResult(await runner(invocation));
  } catch (error) {
    if (error instanceof FixtureDriftCliError) {
      return jsonFailure(error.exitCode, error.code, error.message, error.details);
    }

    return jsonFailure(
      1,
      "fixture_drift_error",
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function isFixtureDriftCommand(argv: readonly string[]): boolean {
  return isFixtureDriftParsedCommand(parseArgv(argv));
}

function buildFixtureDriftInvocation(
  parsed: ParsedArgv,
  options: {
    readonly cwd: string;
    readonly pythonExecutable: string;
    readonly workspaceRoot: string;
  },
): FixtureDriftRunnerInvocation {
  const args = [
    path.join(options.cwd, "scripts", "fixture_drift.py"),
    "--json",
  ];
  const fixture = optionalStringFlag(parsed, "fixture");
  const openapi = optionalStringFlag(parsed, "openapi");

  if (fixture !== undefined) {
    args.push("--fixture", cleanPassThroughPathFlag(fixture, "fixture", options.workspaceRoot));
  }
  if (openapi !== undefined) {
    args.push("--openapi", cleanPassThroughPathFlag(openapi, "openapi", options.workspaceRoot));
  }

  return {
    executable: options.pythonExecutable,
    args,
    cwd: options.cwd,
  };
}

function createNodeFixtureDriftRunner(): FixtureDriftRunner {
  return async (invocation) =>
    await new Promise<FixtureDriftCliResult>((resolve) => {
      const child = spawn(invocation.executable, [...invocation.args], {
        cwd: invocation.cwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      let stdout = "";
      let stderr = "";

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("error", (error) => {
        resolve({
          exitCode: 1,
          stdout: "",
          stderr: error instanceof Error ? error.message : String(error),
        });
      });
      child.on("close", (code) => {
        resolve({
          exitCode: code ?? 1,
          stdout,
          stderr,
        });
      });
    });
}

function normalizeRunnerResult(result: FixtureDriftCliResult): FixtureDriftCliResult {
  if (result.exitCode === 0) {
    if (result.stderr.trim().length > 0) {
      return jsonFailure(
        1,
        "fixture_drift_runner_error",
        "Fixture drift check wrote stderr on success.",
        { stderr: result.stderr.trimEnd() },
      );
    }
    if (!isJsonText(result.stdout)) {
      return jsonFailure(
        1,
        "fixture_drift_runner_error",
        "Fixture drift check did not write JSON stdout.",
      );
    }
    return {
      exitCode: 0,
      stdout: withTrailingNewline(result.stdout),
      stderr: "",
    };
  }

  if (result.stderr.trim().length > 0 && !isJsonText(result.stderr)) {
    return jsonFailure(
      result.exitCode,
      "fixture_drift_runner_error",
      "Fixture drift check failed without JSON stderr.",
      { stderr: result.stderr.trimEnd() },
    );
  }
  if (result.stdout.trim().length > 0 && !isJsonText(result.stdout)) {
    return jsonFailure(
      result.exitCode,
      "fixture_drift_runner_error",
      "Fixture drift check failed with non-JSON stdout.",
      { stdout: result.stdout.trimEnd() },
    );
  }
  if (result.stderr.trim().length === 0 && result.stdout.trim().length === 0) {
    return jsonFailure(
      result.exitCode,
      "fixture_drift_runner_error",
      "Fixture drift check failed without JSON output.",
    );
  }

  return {
    exitCode: result.exitCode,
    stdout: result.stdout.trim().length === 0 ? "" : withTrailingNewline(result.stdout),
    stderr: result.stderr.trim().length === 0 ? "" : withTrailingNewline(result.stderr),
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

function isFixtureDriftParsedCommand(parsed: ParsedArgv): boolean {
  return fixtureDriftCommandLength(parsed.positionals) > 0;
}

function fixtureDriftCommandLength(positionals: readonly string[]): number {
  if (
    positionals[0] === "fixture" &&
    positionals[1] === "drift" &&
    (positionals[2] === "check" ||
      positionals[2] === "report" ||
      positionals[2] === "verify")
  ) {
    return 3;
  }

  if (
    positionals[0] === "fixtures" &&
    (positionals[1] === "verify" || positionals[1] === "check")
  ) {
    return 2;
  }

  if (
    positionals[0] === "fixture-drift" &&
    (positionals[1] === "check" || positionals[1] === "verify")
  ) {
    return 2;
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

function cleanPassThroughPathFlag(value: string, name: string, workspaceRoot: string): string {
  const input = value.trim();
  if (input.length === 0) {
    throw usageError(`Option --${name} requires a non-empty value.`);
  }
  if (input.includes("\0")) {
    throw usageError(`Option --${name} must not contain null bytes.`);
  }
  if (/^[A-Za-z][A-Za-z\d+.-]*:\/\//.test(input)) {
    throw usageError(`Option --${name} must be a local file path, not a URL.`);
  }

  const requestedPath = path.resolve(workspaceRoot, input);
  assertPathInsideWorkspace(workspaceRoot, requestedPath, name);
  assertNotPrivatePath(workspaceRoot, requestedPath, name);
  assertNotPlanPackPath(input, name);
  assertNotPlanPackPath(requestedPath, name);

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
  if (segments.includes(".codex-private")) {
    throw usageError(`Option --${flagName} must not reference private workspace files.`);
  }
}

function assertNotPlanPackPath(candidatePath: string, flagName: string): void {
  const segments = candidatePath
    .split(/[\\/]+/)
    .map((segment) => segment.toLowerCase())
    .filter((segment) => segment.length > 0);
  if (
    segments.some(
      (segment) =>
        segment === "codex-pack" ||
        segment === "plan-pack" ||
        segment === "sovereignops-codex-pack",
    )
  ) {
    throw usageError(`Option --${flagName} must not reference private plan-pack paths.`);
  }
}

function jsonSuccess(value: unknown): FixtureDriftCliResult {
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
): FixtureDriftCliResult {
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

function usageError(message: string): FixtureDriftCliError {
  return new FixtureDriftCliError({
    exitCode: 2,
    code: "usage_error",
    message,
  });
}

function isJsonText(value: string): boolean {
  if (value.trim().length === 0) {
    return false;
  }

  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

function withTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
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

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class FixtureDriftCliError extends Error {
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
    this.name = "FixtureDriftCliError";
    this.exitCode = options.exitCode;
    this.code = options.code;
    this.details = options.details;
  }
}
