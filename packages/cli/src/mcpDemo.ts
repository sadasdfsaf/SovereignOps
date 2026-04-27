import {
  createGatewayResourceAdapter,
  createStaticPolicy,
  type PolicyDecision,
  type PolicyEvaluator,
} from "../../../services/mcp-gateway/src/index.ts";
import {
  GATEWAY_RESOURCE_URIS,
  createDefaultGatewayResourceRegistry,
} from "../../../services/mcp-gateway/src/resources.ts";
import {
  createSafeLocalToolRegistry,
  type ToolPolicyEvaluator,
} from "../../../services/mcp-gateway/src/tools.ts";

export interface McpDemoCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface McpDemoRunOptions {
  readonly stdin?: string;
}

export type McpDemoPolicyMode = "allow" | "deny-resource-read" | "require-approval";

type ParsedFlagValue = string | boolean;

interface ParsedArgv {
  readonly positionals: readonly string[];
  readonly flags: Readonly<Record<string, ParsedFlagValue>>;
  readonly errors: readonly string[];
}

const HELP_TEXT = `SovereignOps MCP demo CLI

Usage:
  sovereignops mcp demo resources [--policy-mode <mode>] [--deny-uri <uri>]
  sovereignops mcp demo read --uri <uri> [--policy-mode <mode>] [--deny-uri <uri>]
  sovereignops mcp demo tool --name <name> --args-json <json> [--policy-mode <mode>]

Policy modes:
  allow                Allow default gateway resource reads and safe local tools.
  deny-resource-read   Deny one resource URI deterministically; defaults to the policy trace URI.
  require-approval     Return approval-required decisions without executing handlers.
`;

const BOOLEAN_FLAGS = new Set(["help", "h"]);
const ALLOWED_FLAGS = new Set([
  "args-json",
  "deny-uri",
  "help",
  "h",
  "name",
  "policy-mode",
  "uri",
]);
const POLICY_MODES = new Set<McpDemoPolicyMode>([
  "allow",
  "deny-resource-read",
  "require-approval",
]);

export async function runMcpDemoCli(
  argv: readonly string[] = [],
  options: McpDemoRunOptions = {},
): Promise<McpDemoCliResult | undefined> {
  const parsed = parseArgv(argv);
  if (!isMcpDemoParsedCommand(parsed)) {
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

  const [, , action, ...extraPositionals] = parsed.positionals;
  if (action === undefined || extraPositionals.length > 0) {
    return unknownMcpDemoCommand(parsed);
  }

  try {
    const policyMode = readPolicyMode(parsed);
    const adapter = createGatewayResourceAdapter({
      resources: createDefaultGatewayResourceRegistry(),
      policy: createDemoResourcePolicy(policyMode, optionalStringFlag(parsed, "deny-uri")),
    });

    if (action === "resources") {
      return jsonSuccess({
        kind: "mcp-demo.resources",
        policyMode,
        result: await adapter.listResources(),
      });
    }

    if (action === "read") {
      const uri = requireStringFlag(parsed, "uri");
      return jsonSuccess({
        kind: "mcp-demo.read",
        policyMode,
        uri,
        result: await adapter.readResource(uri),
      });
    }

    if (action === "tool") {
      const toolName = requireStringFlag(parsed, "name");
      const args = readArgsJson(parsed, options.stdin);
      const registry = createSafeLocalToolRegistry();
      return jsonSuccess({
        kind: "mcp-demo.tool",
        policyMode,
        toolName,
        result: await registry.execute({
          toolName,
          arguments: args,
          policy: createDemoToolPolicy(policyMode),
        }),
      });
    }
  } catch (error) {
    if (error instanceof McpDemoUsageError) {
      return failure(2, error.message);
    }
    return failure(1, error instanceof Error ? error.message : String(error));
  }

  return unknownMcpDemoCommand(parsed);
}

export function isMcpDemoCommand(argv: readonly string[]): boolean {
  return isMcpDemoParsedCommand(parseArgv(argv));
}

function createDemoResourcePolicy(
  mode: McpDemoPolicyMode,
  deniedUri = GATEWAY_RESOURCE_URIS.auditTrail,
): PolicyEvaluator {
  if (mode === "allow") {
    return createStaticPolicy([], "allow");
  }

  if (mode === "require-approval") {
    return createStaticPolicy(
      [
        {
          id: "mcp-demo-require-approval",
          path: "sovereignops://",
          capability: "read_object",
          decision: "require_approval",
          match: "prefix",
          reason: "MCP demo policy mode requires local approval.",
        },
      ],
      "allow",
    );
  }

  return createStaticPolicy(
    [
      {
        id: "mcp-demo-deny-resource-read",
        path: deniedUri,
        capability: "read_object",
        decision: "deny",
        reason: `MCP demo policy mode denied resource ${deniedUri}.`,
      },
    ],
    "allow",
  );
}

function createDemoToolPolicy(mode: McpDemoPolicyMode): ToolPolicyEvaluator {
  const decision: PolicyDecision = mode === "require-approval" ? "require_approval" : "allow";
  return (request) => ({
    decision,
    toolName: request.toolName,
    reason:
      decision === "allow"
        ? "MCP demo policy mode allows safe local tool execution."
        : "MCP demo policy mode requires local approval.",
    ruleId: decision === "allow" ? "mcp-demo-allow-tool" : "mcp-demo-require-tool-approval",
    approvalId: decision === "require_approval" ? "mcp-demo-approval" : undefined,
  });
}

function readPolicyMode(parsed: ParsedArgv): McpDemoPolicyMode {
  const value = optionalStringFlag(parsed, "policy-mode") ?? "allow";
  if (!POLICY_MODES.has(value as McpDemoPolicyMode)) {
    throw new McpDemoUsageError(
      "Option --policy-mode must be one of allow, deny-resource-read, require-approval.",
    );
  }
  return value as McpDemoPolicyMode;
}

function readArgsJson(
  parsed: ParsedArgv,
  stdin = "",
): Record<string, unknown> {
  const text = requireStringFlag(parsed, "args-json");
  const source = text === "-" ? stdin : text;
  if (source.trim().length === 0) {
    throw new McpDemoUsageError("Option --args-json requires JSON input.");
  }

  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new McpDemoUsageError("Option --args-json must contain valid JSON.");
  }

  if (!isRecord(value)) {
    throw new McpDemoUsageError("Option --args-json must be a JSON object.");
  }
  return cloneJson(value);
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

function isMcpDemoParsedCommand(parsed: ParsedArgv): boolean {
  return parsed.positionals[0] === "mcp" && parsed.positionals[1] === "demo";
}

function hasHelp(parsed: ParsedArgv): boolean {
  return parsed.flags.help === true || parsed.flags.h === true;
}

function requireStringFlag(parsed: ParsedArgv, name: string): string {
  const value = optionalStringFlag(parsed, name);
  if (value === undefined || value.trim().length === 0) {
    throw new McpDemoUsageError(`Missing required option --${name}.`);
  }
  return value;
}

function optionalStringFlag(parsed: ParsedArgv, name: string): string | undefined {
  const value = parsed.flags[name];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new McpDemoUsageError(`Option --${name} requires a value.`);
  }
  return value;
}

function jsonSuccess(value: unknown): McpDemoCliResult {
  return success(`${JSON.stringify(value, null, 2)}\n`);
}

function success(stdout: string): McpDemoCliResult {
  return { exitCode: 0, stdout, stderr: "" };
}

function failure(exitCode: number, message: string): McpDemoCliResult {
  return {
    exitCode,
    stdout: "",
    stderr: `${message.trimEnd()}\n`,
  };
}

function unknownMcpDemoCommand(parsed: ParsedArgv): McpDemoCliResult {
  return failure(
    1,
    `Unknown MCP demo command: ${parsed.positionals.join(" ")}\nRun "sovereignops mcp demo --help" for usage.`,
  );
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class McpDemoUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpDemoUsageError";
  }
}
