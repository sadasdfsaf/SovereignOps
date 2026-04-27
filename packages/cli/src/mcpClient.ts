export interface McpApiCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface McpApiRunOptions {
  readonly stdin?: string;
  readonly fetch?: FetchLike;
}

export interface FetchRequestInit {
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
}

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText?: string;
  text(): Promise<string>;
}

export type FetchLike = (
  input: string,
  init: FetchRequestInit,
) => Promise<FetchResponseLike>;

type ParsedFlagValue = string | boolean;

interface ParsedArgv {
  readonly positionals: readonly string[];
  readonly flags: Readonly<Record<string, ParsedFlagValue>>;
  readonly errors: readonly string[];
}

const HELP_TEXT = {
  usage: [
    "sovereignops mcp api resources --base-url <url>",
    "sovereignops mcp api read --base-url <url> --uri <uri>",
    "sovereignops mcp api tools --base-url <url>",
    "sovereignops mcp api call --base-url <url> --tool-name <name> --args-json <json>",
    "sovereignops mcp api approvals --base-url <url>",
    "sovereignops mcp api approval-decide --base-url <url> --session-id <id> --decision <approve|reject>",
  ],
  options: {
    "base-url": "Absolute local API base URL, for example http://127.0.0.1:3000.",
    uri: "Resource URI for mcp api read.",
    "tool-name": "Safe local tool name for mcp api call.",
    "args-json": "JSON object arguments for mcp api call, or - to read JSON from stdin.",
    "session-id": "Approval session id for mcp api approval-decide.",
    decision: "Approval decision, either approve or reject.",
    reason: "Optional decision reason for mcp api approval-decide.",
  },
};

const BOOLEAN_FLAGS = new Set(["help", "h"]);
const ALLOWED_FLAGS = new Set([
  "args-json",
  "base-url",
  "decision",
  "help",
  "h",
  "reason",
  "session-id",
  "tool-name",
  "uri",
]);

export async function runMcpApiCli(
  argv: readonly string[] = [],
  options: McpApiRunOptions = {},
): Promise<McpApiCliResult | undefined> {
  const parsed = parseArgv(argv);
  if (!isMcpApiParsedCommand(parsed)) {
    return undefined;
  }

  if (parsed.errors.length > 0) {
    return jsonFailure(2, "usage_error", parsed.errors.join("\n"));
  }

  const unknownFlags = Object.keys(parsed.flags).filter((flag) => !ALLOWED_FLAGS.has(flag));
  if (unknownFlags.length > 0) {
    return jsonFailure(2, "usage_error", `Unsupported option: --${unknownFlags[0]}`);
  }

  if (hasHelp(parsed) || parsed.positionals.length === 2) {
    return jsonSuccess({
      kind: "mcp-api.help",
      ...HELP_TEXT,
    });
  }

  const [, , action, ...extraPositionals] = parsed.positionals;
  if (action === undefined || extraPositionals.length > 0) {
    return unknownMcpApiCommand(parsed);
  }

  try {
    const baseUrl = readBaseUrl(parsed);
    const fetch = readFetch(options);

    if (action === "resources") {
      const body = await requestJson(fetch, {
        baseUrl,
        method: "GET",
        path: "resources",
      });
      return jsonSuccess(body);
    }

    if (action === "read") {
      const body = await requestJson(fetch, {
        baseUrl,
        method: "POST",
        path: "resources/read",
        body: {
          uri: requireStringFlag(parsed, "uri"),
        },
      });
      return jsonSuccess(body);
    }

    if (action === "tools") {
      const body = await requestJson(fetch, {
        baseUrl,
        method: "GET",
        path: "tools",
      });
      return jsonSuccess(body);
    }

    if (action === "call") {
      const body = await requestJson(fetch, {
        baseUrl,
        method: "POST",
        path: "tools/call",
        body: {
          toolName: requireStringFlag(parsed, "tool-name"),
          arguments: readArgsJson(parsed, options.stdin),
        },
      });
      return jsonSuccess(body);
    }

    if (action === "approvals") {
      const body = await requestJson(fetch, {
        baseUrl,
        method: "GET",
        path: "approval-sessions",
      });
      return jsonSuccess(body);
    }

    if (action === "approval-decide") {
      const sessionId = requireStringFlag(parsed, "session-id");
      const decision = readDecision(parsed);
      const body = await requestJson(fetch, {
        baseUrl,
        method: "POST",
        path: `approval-sessions/${encodePathPart(sessionId)}/decision`,
        body: pruneUndefined({
          decision,
          reason: optionalStringFlag(parsed, "reason"),
        }),
      });
      return jsonSuccess(body);
    }
  } catch (error) {
    if (error instanceof McpApiUsageError) {
      return jsonFailure(2, "usage_error", error.message);
    }

    if (error instanceof McpApiHttpError) {
      return jsonFailure(1, "http_error", "MCP API request failed.", {
        status: error.status,
        statusText: error.statusText,
        body: error.body,
      });
    }

    if (error instanceof McpApiResponseError) {
      return jsonFailure(1, "response_error", error.message, {
        status: error.status,
        contentType: error.contentType,
      });
    }

    return jsonFailure(
      1,
      "request_error",
      error instanceof Error ? error.message : String(error),
    );
  }

  return unknownMcpApiCommand(parsed);
}

export function isMcpApiCommand(argv: readonly string[]): boolean {
  return isMcpApiParsedCommand(parseArgv(argv));
}

async function requestJson(
  fetch: FetchLike,
  options: {
    readonly baseUrl: URL;
    readonly method: "GET" | "POST";
    readonly path: string;
    readonly body?: Record<string, unknown>;
  },
): Promise<unknown> {
  const url = endpointUrl(options.baseUrl, options.path);
  const init: FetchRequestInit = {
    method: options.method,
    headers: {
      accept: "application/json",
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  };

  const response = await fetch(url, init);
  const responseBody = await parseJsonResponse(response);

  if (!response.ok) {
    throw new McpApiHttpError({
      status: response.status,
      statusText: response.statusText ?? "",
      body: responseBody,
    });
  }

  return responseBody;
}

async function parseJsonResponse(response: FetchResponseLike): Promise<unknown> {
  const text = await response.text();
  if (text.trim().length === 0) {
    throw new McpApiResponseError({
      status: response.status,
      contentType: "",
      message: "MCP API response body was empty.",
    });
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new McpApiResponseError({
      status: response.status,
      contentType: "",
      message: "MCP API response body was not valid JSON.",
    });
  }
}

function endpointUrl(baseUrl: URL, path: string): string {
  const normalizedPath = baseUrl.pathname.replace(/\/+$/, "");
  const prefix = normalizedPath === "/v1" || normalizedPath.endsWith("/v1")
    ? "mcp"
    : "v1/mcp";
  return new URL(`${prefix}/${path}`, baseUrl).href;
}

function encodePathPart(value: string): string {
  return encodeURIComponent(value);
}

function readBaseUrl(parsed: ParsedArgv): URL {
  const value = requireStringFlag(parsed, "base-url");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new McpApiUsageError("Option --base-url must be an absolute URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new McpApiUsageError("Option --base-url must use http or https.");
  }

  if (url.username !== "" || url.password !== "") {
    throw new McpApiUsageError("Option --base-url must not include credentials.");
  }

  if (url.search !== "" || url.hash !== "") {
    throw new McpApiUsageError("Option --base-url must not include query or fragment text.");
  }

  if (!url.href.endsWith("/")) {
    url = new URL(`${url.href}/`);
  }

  return url;
}

function readFetch(options: McpApiRunOptions): FetchLike {
  const fetch = options.fetch ?? (globalThis as { fetch?: FetchLike }).fetch;
  if (typeof fetch !== "function") {
    throw new McpApiUsageError("A fetch implementation is required.");
  }
  return fetch;
}

function readArgsJson(
  parsed: ParsedArgv,
  stdin = "",
): Record<string, unknown> {
  const text = requireStringFlag(parsed, "args-json");
  const source = text === "-" ? stdin : text;
  if (source.trim().length === 0) {
    throw new McpApiUsageError("Option --args-json requires JSON input.");
  }

  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new McpApiUsageError("Option --args-json must contain valid JSON.");
  }

  if (!isRecord(value)) {
    throw new McpApiUsageError("Option --args-json must be a JSON object.");
  }
  return cloneJson(value);
}

function readDecision(parsed: ParsedArgv): "approve" | "reject" {
  const decision = requireStringFlag(parsed, "decision");
  if (decision !== "approve" && decision !== "reject") {
    throw new McpApiUsageError("Option --decision must be approve or reject.");
  }
  return decision;
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
      if (next === undefined || (next !== "-" && next.startsWith("-"))) {
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

function isMcpApiParsedCommand(parsed: ParsedArgv): boolean {
  return parsed.positionals[0] === "mcp" && parsed.positionals[1] === "api";
}

function hasHelp(parsed: ParsedArgv): boolean {
  return parsed.flags.help === true || parsed.flags.h === true;
}

function requireStringFlag(parsed: ParsedArgv, name: string): string {
  const value = optionalStringFlag(parsed, name);
  if (value === undefined || value.trim().length === 0) {
    throw new McpApiUsageError(`Missing required option --${name}.`);
  }
  return value;
}

function optionalStringFlag(parsed: ParsedArgv, name: string): string | undefined {
  const value = parsed.flags[name];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new McpApiUsageError(`Option --${name} requires a value.`);
  }
  return value;
}

function jsonSuccess(value: unknown): McpApiCliResult {
  return {
    exitCode: 0,
    stdout: `${JSON.stringify(value, null, 2)}\n`,
    stderr: "",
  };
}

function jsonFailure(
  exitCode: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): McpApiCliResult {
  return {
    exitCode,
    stdout: "",
    stderr: `${JSON.stringify(
      {
        error: pruneUndefined({
          code,
          message,
          details: details && Object.keys(details).length > 0 ? details : undefined,
        }),
      },
      null,
      2,
    )}\n`,
  };
}

function unknownMcpApiCommand(parsed: ParsedArgv): McpApiCliResult {
  return jsonFailure(1, "unknown_command", `Unknown MCP API command: ${parsed.positionals.join(" ")}`);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

class McpApiUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpApiUsageError";
  }
}

class McpApiHttpError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly body: unknown;

  constructor(options: { readonly status: number; readonly statusText: string; readonly body: unknown }) {
    super(`MCP API request failed with status ${options.status}.`);
    this.name = "McpApiHttpError";
    this.status = options.status;
    this.statusText = options.statusText;
    this.body = options.body;
  }
}

class McpApiResponseError extends Error {
  readonly status: number;
  readonly contentType: string;

  constructor(options: {
    readonly status: number;
    readonly contentType: string;
    readonly message: string;
  }) {
    super(options.message);
    this.name = "McpApiResponseError";
    this.status = options.status;
    this.contentType = options.contentType;
  }
}
