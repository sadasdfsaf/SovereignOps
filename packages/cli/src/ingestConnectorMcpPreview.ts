import { existsSync, readFileSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

import type {
  IngestConnectorManifest,
  IngestConnectorProfile,
} from "../../../apps/api/src/ingestConnectorRoutes.ts";
import { createDefaultIngestConnectorManifest } from "../../../apps/api/src/ingestConnectorRoutes.ts";
import { assertIngestConnectorApiManifest } from "../../../packages/schemas/src/ingestConnectorApiManifest.ts";
import {
  createGatewayResourceAdapter,
  createGatewayResourceRegistry,
  createStaticPolicy,
  type GatewayResourceDefinition,
} from "../../../services/mcp-gateway/src/index.ts";

export interface IngestConnectorMcpPreviewCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface IngestConnectorMcpPreviewRunOptions {
  readonly cwd?: string;
  readonly manifest?: IngestConnectorManifest;
}

type ParsedFlagValue = string | boolean;

interface ParsedArgv {
  readonly positionals: readonly string[];
  readonly flags: Readonly<Record<string, ParsedFlagValue>>;
  readonly errors: readonly string[];
}

interface ResolvedFixturePath {
  readonly absolutePath: string;
  readonly displayPath: string;
}

interface LoadedManifest {
  readonly manifest: IngestConnectorManifest;
  readonly fixture?: {
    readonly path: string;
  };
  readonly redactions: readonly RedactionRecord[];
}

interface RedactionRecord {
  readonly path: string;
  readonly reason: string;
}

interface Redactor {
  readonly redactions: readonly RedactionRecord[];
  redact(value: unknown, valuePath: string): unknown;
}

const PREVIEW_SCHEMA_VERSION = "ingest-connector-mcp-preview/v1";
const RESOURCE_SCHEMA_VERSION = "ingest-connector-mcp-resource/v1";
const HELP_TEXT = {
  usage: [
    "sovereignops ingest connectors mcp preview [--connector <id>] [--format json] [--fixture <path>]",
    "sovereignops ingest connector mcp preview [--connector <id>] [--format json] [--fixture <path>]",
  ],
  options: {
    connector: "Optional connector id to preview, for example local.files.",
    fixture: "Optional local connector manifest JSON path inside this repository.",
    format: "Output format. Only json is supported.",
  },
};

const BOOLEAN_FLAGS = new Set(["help", "h"]);
const ALLOWED_FLAGS = new Set(["connector", "fixture", "format", "help", "h"]);
const PRIVATE_WORKSPACE_SEGMENT = `.codex${"-private"}`;
const PLAN_PACK_SEGMENTS = new Set([
  "codex-pack",
  "plan-pack",
  "private-plan-pack",
  "sovereignops-codex-pack",
]);
const SENSITIVE_KEY_PATTERN =
  /authorization|cookie|credential|credentials|password|passphrase|secret|api[._-]?key|api[._-]?token|private[._-]?key|access[._-]?token|refresh[._-]?token|session[._-]?token|session|token/i;
const SECRET_TEXT_PATTERNS = [
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/g,
  /\b(?:sk-[A-Za-z0-9_-]{8,}|sk_[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,})\b/g,
  /\b((?:apiKey|api[_-]?key|token|password|secret)\s*[:=]\s*)["']?[^"',;\s]+["']?/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];
const RAW_LOCAL_PATH_PATTERNS = [
  /\b[A-Za-z]:[\\/][^\s"',;)}\]]+/g,
  /\\\\[^\\\s"',;)}\]]+[\\][^\s"',;)}\]]+/g,
  /\b(?:\/Users|\/home|\/var|\/tmp|\/private|\/mnt|\/Volumes)\/[^\s"',;)}\]]+/g,
  /\bworkspaces[\\/][^\s"',;)}\]]+/g,
];
const PRIVATE_MARKER_PATTERNS = [
  /(?:^|[\\/])\.codex-private(?:[\\/]|$)/gi,
  /\bprivate[- _]?plan(?:[- _]?pack)?\b/gi,
  /\b(?:codex-pack|plan-pack|sovereignops-codex-pack)\b/gi,
];

export async function runIngestConnectorMcpPreviewCli(
  argv: readonly string[] = [],
  options: IngestConnectorMcpPreviewRunOptions = {},
): Promise<IngestConnectorMcpPreviewCliResult | undefined> {
  const parsed = parseArgv(argv);
  if (!isIngestConnectorMcpPreviewParsedCommand(parsed)) {
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
      kind: "ingest-connector-mcp-preview.help",
      ...HELP_TEXT,
    });
  }

  const commandLength = ingestConnectorMcpPreviewCommandLength(parsed.positionals);
  const extraPositionals = parsed.positionals.slice(commandLength);
  if (extraPositionals.length > 0) {
    return jsonFailure(
      2,
      "usage_error",
      `Unexpected positional argument: ${extraPositionals[0]}`,
    );
  }

  try {
    const format = optionalStringFlag(parsed, "format") ?? "json";
    if (format !== "json") {
      throw usageError("Option --format only supports json.");
    }

    const loaded = await loadManifest(parsed, options);
    const connectorId = optionalConnectorFlag(parsed);
    const connectors = filterConnectors(loaded.manifest.connectors, connectorId);
    const adapter = createGatewayResourceAdapter({
      resources: createGatewayResourceRegistry(createConnectorResources(connectors)),
      policy: createStaticPolicy([], "allow"),
    });
    const listed = await adapter.listResources();
    if (!listed.ok) {
      throw new IngestConnectorMcpPreviewError({
        exitCode: 1,
        code: "mcp_resource_list_error",
        message: listed.error.message,
      });
    }

    const previews = await Promise.all(
      listed.value.resources.map(async (resource) => {
        const read = await adapter.readResource(resource.uri);
        if (!read.ok) {
          throw new IngestConnectorMcpPreviewError({
            exitCode: 1,
            code: "mcp_resource_read_error",
            message: read.error.message,
            details: { uri: resource.uri },
          });
        }

        const connector = connectors.find(
          (candidate) => resourceUriForConnector(candidate.id) === resource.uri,
        );
        if (connector === undefined) {
          throw new Error(`Missing connector for MCP resource ${resource.uri}`);
        }

        return {
          ...resource,
          connectorId: connector.id,
          localOnly: connector.safety.localOnly,
          noNetwork: !connector.safety.networkAccess,
          durableWrites: connector.safety.durableWrites,
          preview: {
            dryRun: connector.preview.dryRun,
            maxItems: connector.preview.maxItems,
            maxTextBytes: connector.preview.maxTextBytes,
          },
          capabilities: [...connector.capabilities],
          mediaTypes: [...connector.mediaTypes],
          content: {
            contentCount: read.value.contents.length,
            mimeTypes: uniqueStrings(
              read.value.contents.map((content) => content.mimeType ?? resource.mimeType ?? ""),
            ).filter((mimeType) => mimeType.length > 0),
            textBytes: read.value.contents.reduce(
              (total, content) => total + byteLength(content.text ?? ""),
              0,
            ),
          },
        };
      }),
    );
    const redactor = createRedactor(loaded.redactions);
    const payload = redactor.redact(
      {
        kind: "ingest-connector-mcp-preview",
        schemaVersion: PREVIEW_SCHEMA_VERSION,
        format,
        localOnly: true,
        noNetwork: true,
        networkAccess: false,
        durableWrites: false,
        source: optionalFields({
          adapter: "mcp-gateway",
          fixture: loaded.fixture,
        }),
        filters: optionalFields({
          connector: connectorId,
        }),
        resourceCount: previews.length,
        connectorIds: connectors.map((connector) => connector.id),
        previewSummary: summarizeConnectors(connectors),
        resources: previews,
      },
      "$",
    );

    return jsonSuccess({
      ...(payload as Record<string, unknown>),
      redaction: summarizeRedactions(redactor.redactions),
    });
  } catch (error) {
    if (error instanceof IngestConnectorMcpPreviewError) {
      return jsonFailure(error.exitCode, error.code, error.message, error.details);
    }

    return jsonFailure(
      1,
      "ingest_connector_mcp_preview_error",
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function isIngestConnectorMcpPreviewCommand(argv: readonly string[]): boolean {
  return isIngestConnectorMcpPreviewParsedCommand(parseArgv(argv));
}

async function loadManifest(
  parsed: ParsedArgv,
  options: IngestConnectorMcpPreviewRunOptions,
): Promise<LoadedManifest> {
  const fixtureValue = optionalStringFlag(parsed, "fixture");
  if (fixtureValue !== undefined) {
    const fixture = await resolveFixturePath(fixtureValue, options.cwd ?? process.cwd());
    const fixtureJson = await readFixtureJson(fixture);
    const redactor = createRedactor();
    const manifest = parseFixtureManifest(redactor.redact(fixtureJson, "$"));

    return {
      manifest,
      fixture: {
        path: fixture.displayPath,
      },
      redactions: redactor.redactions,
    };
  }

  const manifest = options.manifest ?? createDefaultIngestConnectorManifest();
  assertManifest(manifest);

  return {
    manifest,
    redactions: [],
  };
}

function parseFixtureManifest(value: unknown): IngestConnectorManifest {
  const manifest = isRecord(value) && isRecord(value.manifest) ? value.manifest : value;
  assertManifest(manifest);
  return manifest as IngestConnectorManifest;
}

function assertManifest(value: unknown): asserts value is IngestConnectorManifest {
  try {
    assertIngestConnectorApiManifest(value);
  } catch (error) {
    throw invalidFixture(error instanceof Error ? error.message : String(error));
  }
}

function filterConnectors(
  connectors: readonly IngestConnectorProfile[],
  connectorId: string | undefined,
): readonly IngestConnectorProfile[] {
  if (connectorId === undefined) {
    return connectors.map(cloneJson);
  }

  const connector = connectors.find((candidate) => candidate.id === connectorId);
  if (connector === undefined) {
    throw new IngestConnectorMcpPreviewError({
      exitCode: 2,
      code: "unknown_connector",
      message: `Unknown ingest connector: ${connectorId}`,
      details: {
        connectorId,
        availableConnectorIds: connectors.map((candidate) => candidate.id),
      },
    });
  }

  return [cloneJson(connector)];
}

function createConnectorResources(
  connectors: readonly IngestConnectorProfile[],
): readonly GatewayResourceDefinition[] {
  return connectors.map((connector) =>
    Object.freeze({
      uri: resourceUriForConnector(connector.id),
      name: `Ingest connector: ${connector.label}`,
      description: connector.description,
      mimeType: "application/json",
      capability: "read_object",
      metadata: Object.freeze({
        connectorId: connector.id,
        localOnly: connector.safety.localOnly,
        noNetwork: !connector.safety.networkAccess,
        durableWrites: connector.safety.durableWrites,
      }),
      read: () => ({
        uri: resourceUriForConnector(connector.id),
        mimeType: "application/json",
        trust: connector.safety.untrustedByDefault ? "review" : "trusted",
        text: serializePrettyJson({
          schemaVersion: RESOURCE_SCHEMA_VERSION,
          localOnly: connector.safety.localOnly,
          noNetwork: !connector.safety.networkAccess,
          durableWrites: connector.safety.durableWrites,
          connector,
        }),
      }),
    } satisfies GatewayResourceDefinition),
  );
}

function resourceUriForConnector(connectorId: string): string {
  return `sovereignops://ingest/connectors/${encodeURIComponent(connectorId)}`;
}

function summarizeConnectors(connectors: readonly IngestConnectorProfile[]): Record<string, unknown> {
  return {
    connectorCount: connectors.length,
    resourceCount: connectors.length,
    capabilities: countValues(connectors.flatMap((connector) => [...connector.capabilities])),
    mediaTypes: countValues(connectors.flatMap((connector) => [...connector.mediaTypes])),
    maxItems: summarizeNumbers(connectors.map((connector) => connector.preview.maxItems)),
    maxTextBytes: summarizeNumbers(connectors.map((connector) => connector.preview.maxTextBytes)),
    untrustedByDefault: countValues(
      connectors.map((connector) => String(connector.safety.untrustedByDefault)),
    ),
  };
}

function summarizeNumbers(values: readonly number[]): Record<string, number> {
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    total: values.reduce((total, value) => total + value, 0),
  };
}

function countValues(values: readonly string[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => compareStrings(left, right)));
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
      throw new IngestConnectorMcpPreviewError({
        exitCode: 2,
        code: "fixture_not_found",
        message: "Fixture file was not found.",
        details: {
          path: displayPath(workspaceRoot, requestedPath),
        },
      });
    }

    throw new IngestConnectorMcpPreviewError({
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
    throw new IngestConnectorMcpPreviewError({
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
  };
}

async function readFixtureJson(fixture: ResolvedFixturePath): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(fixture.absolutePath, "utf8");
  } catch (error) {
    throw new IngestConnectorMcpPreviewError({
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
    throw new IngestConnectorMcpPreviewError({
      exitCode: 2,
      code: "invalid_fixture_json",
      message: "Fixture file must contain valid JSON.",
      details: {
        path: fixture.displayPath,
      },
    });
  }
}

function cleanPathFlag(value: string, flagName: string): string {
  const input = value.trim();
  if (input.length === 0) {
    throw usageError(`Option --${flagName} requires a non-empty path.`);
  }
  if (input.includes("\0")) {
    throw usageError(`Option --${flagName} must not contain null bytes.`);
  }
  if (/^[A-Za-z][A-Za-z\d+.-]*:\/\//.test(input)) {
    throw usageError(`Option --${flagName} must be a local file path, not a URL.`);
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

function optionalConnectorFlag(parsed: ParsedArgv): string | undefined {
  const connector = optionalStringFlag(parsed, "connector");
  if (connector === undefined) {
    return undefined;
  }
  if (connector.trim().length === 0) {
    throw usageError("Option --connector requires a non-empty value.");
  }
  return connector;
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

function isIngestConnectorMcpPreviewParsedCommand(parsed: ParsedArgv): boolean {
  return ingestConnectorMcpPreviewCommandLength(parsed.positionals) > 0;
}

function ingestConnectorMcpPreviewCommandLength(positionals: readonly string[]): number {
  if (
    positionals.length >= 4 &&
    positionals[0] === "ingest" &&
    (positionals[1] === "connectors" || positionals[1] === "connector") &&
    positionals[2] === "mcp" &&
    positionals[3] === "preview"
  ) {
    return 4;
  }

  if (
    positionals.length >= 3 &&
    (positionals[0] === "ingest-connectors" || positionals[0] === "ingest-connector") &&
    positionals[1] === "mcp" &&
    positionals[2] === "preview"
  ) {
    return 3;
  }

  if (
    positionals.length >= 2 &&
    positionals[0] === "ingest-connector-mcp" &&
    positionals[1] === "preview"
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

function createRedactor(seed: readonly RedactionRecord[] = []): Redactor {
  const redactions: RedactionRecord[] = [...seed];

  function record(valuePath: string, reason: string): void {
    redactions.push({ path: valuePath, reason });
  }

  function redactString(value: string, valuePath: string): string {
    let redacted = value;

    for (const pattern of RAW_LOCAL_PATH_PATTERNS) {
      redacted = redacted.replace(pattern, () => {
        record(valuePath, "local_path");
        return "[redacted-path]";
      });
    }

    for (const pattern of PRIVATE_MARKER_PATTERNS) {
      redacted = redacted.replace(pattern, () => {
        record(valuePath, "private_marker");
        return "[redacted-private-marker]";
      });
    }

    for (const pattern of SECRET_TEXT_PATTERNS) {
      redacted = redacted.replace(pattern, () => {
        record(valuePath, "secret");
        return "[REDACTED]";
      });
    }

    return redacted;
  }

  function redact(value: unknown, valuePath: string): unknown {
    if (typeof value === "string") {
      return redactString(value, valuePath);
    }

    if (Array.isArray(value)) {
      return value.map((item, index) => redact(item, `${valuePath}[${index}]`));
    }

    if (isRecord(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, nested]) => {
          const nestedPath = keyPath(valuePath, key);
          if (SENSITIVE_KEY_PATTERN.test(key)) {
            record(nestedPath, "sensitive_key");
            return [key, "[REDACTED]"];
          }
          return [key, redact(nested, nestedPath)];
        }),
      );
    }

    return value;
  }

  return {
    get redactions() {
      return [...redactions].sort(compareRedactions);
    },
    redact,
  };
}

function summarizeRedactions(redactions: readonly RedactionRecord[]): Record<string, unknown> {
  return {
    applied: redactions.length > 0,
    count: redactions.length,
    records: redactions.map((record) => ({ ...record })),
    reasons: countValues(redactions.map((record) => record.reason)),
  };
}

function jsonSuccess(value: unknown): IngestConnectorMcpPreviewCliResult {
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
): IngestConnectorMcpPreviewCliResult {
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

function usageError(message: string): IngestConnectorMcpPreviewError {
  return new IngestConnectorMcpPreviewError({
    exitCode: 2,
    code: "usage_error",
    message,
  });
}

function invalidFixture(message: string): IngestConnectorMcpPreviewError {
  return new IngestConnectorMcpPreviewError({
    exitCode: 2,
    code: "invalid_fixture",
    message,
  });
}

function cloneJson<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
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

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareStrings);
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function compareRedactions(left: RedactionRecord, right: RedactionRecord): number {
  return compareStrings(left.path, right.path) || compareStrings(left.reason, right.reason);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function keyPath(parentPath: string, key: string): string {
  return parentPath === "$" ? key : `${parentPath}.${key}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class IngestConnectorMcpPreviewError extends Error {
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
    this.name = "IngestConnectorMcpPreviewError";
    this.exitCode = options.exitCode;
    this.code = options.code;
    this.details = options.details;
  }
}
