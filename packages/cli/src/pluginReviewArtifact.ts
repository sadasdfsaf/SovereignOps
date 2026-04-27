import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

import {
  validatePluginManifest,
  type NormalizedPluginManifest,
} from "../../plugin-sdk/src/manifest.ts";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export interface PluginReviewArtifactCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface PluginReviewArtifactRunOptions {
  readonly cwd?: string;
}

export interface PluginReviewArtifactSource {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly itemCount?: number;
}

export interface PluginReviewArtifactInput {
  readonly manifest: unknown;
  readonly generatedAt?: string;
  readonly sandboxReviews?: readonly unknown[];
  readonly automationGateSummaries?: readonly unknown[];
  readonly automationAuditSummaries?: readonly unknown[];
  readonly sources?: {
    readonly manifest?: PluginReviewArtifactSource;
    readonly sandboxReviews?: readonly PluginReviewArtifactSource[];
    readonly automationGateSummaries?: readonly PluginReviewArtifactSource[];
    readonly automationAuditSummaries?: readonly PluginReviewArtifactSource[];
  };
}

type ParsedFlagValue = string | boolean | readonly string[];

interface ParsedArgv {
  readonly positionals: readonly string[];
  readonly flags: Readonly<Record<string, ParsedFlagValue>>;
  readonly errors: readonly string[];
}

interface ResolvedLocalPath {
  readonly absolutePath: string;
  readonly displayPath: string;
  readonly workspaceRoot: string;
}

interface JsonSource {
  readonly value: unknown;
  readonly source: PluginReviewArtifactSource;
}

interface RedactionRecord {
  readonly path: string;
  readonly reason: string;
}

interface Redactor {
  readonly redactions: readonly RedactionRecord[];
  redact(value: unknown, valuePath: string): JsonValue;
}

interface SandboxReviewPreview {
  readonly id: string;
  readonly outcome: "passed" | "warning" | "failed";
  readonly title: string;
  readonly checkedAt: string;
  readonly pluginId: string;
  readonly ruleId?: string;
  readonly findingCount: number;
  readonly details?: JsonValue;
  readonly fingerprint: string;
}

interface AutomationGateSummaryPreview {
  readonly id: string;
  readonly gateId: string;
  readonly label: string;
  readonly status: string;
  readonly pluginIds: readonly string[];
  readonly ruleIds: readonly string[];
  readonly affectedRuleCount: number;
  readonly enabled?: boolean;
  readonly mode?: string;
  readonly lastCheckedAt?: string;
  readonly details?: JsonValue;
  readonly fingerprint: string;
}

interface AutomationAuditSummaryPreview {
  readonly id: string;
  readonly status: string;
  readonly count: number;
  readonly pluginIds: readonly string[];
  readonly ruleIds: readonly string[];
  readonly lastEventAt?: string;
  readonly details?: JsonValue;
  readonly fingerprint: string;
}

const HELP_PAYLOAD = {
  kind: "plugin-review-artifact.help",
  usage: [
    "sovereignops plugin review artifact preview --manifest <path> [inputs]",
    "sovereignops plugin-review-artifact preview --manifest <path> [inputs]",
  ],
  options: {
    manifest: "Local plugin manifest JSON path inside this workspace.",
    sandboxReview: "Local sandbox review summary JSON path. Can be repeated.",
    automationGateSummary: "Local automation gate summary JSON path. Can be repeated.",
    automationAuditSummary: "Local automation audit summary JSON path. Can be repeated.",
    generatedAt: "Optional ISO timestamp for deterministic preview metadata.",
  },
};

const DEFAULT_GENERATED_AT = "2026-04-27T00:00:00.000Z";
const BOOLEAN_FLAGS = new Set(["help", "h"]);
const REPEATED_FLAGS = new Set([
  "audit-summary",
  "audit-summaries",
  "automation-audit-summary",
  "automation-audit-summaries",
  "automation-gate-summary",
  "automation-gate-summaries",
  "gate-summary",
  "gate-summaries",
  "sandbox-review",
  "sandbox-reviews",
]);
const ALLOWED_FLAGS = new Set([
  "audit-summary",
  "audit-summaries",
  "automation-audit-summary",
  "automation-audit-summaries",
  "automation-gate-summary",
  "automation-gate-summaries",
  "gate-summary",
  "gate-summaries",
  "generated-at",
  "help",
  "h",
  "manifest",
  "manifest-path",
  "sandbox-review",
  "sandbox-reviews",
]);
const SANDBOX_OUTCOMES = new Set(["passed", "warning", "failed"]);
const SENSITIVE_KEY_PATTERN =
  /(^|[._-])(authorization|cookie|credential|credentials|password|passphrase|secret|api[._-]?key|api[._-]?token|private[._-]?key|access[._-]?token|refresh[._-]?token|session[._-]?token|token)([._-]|$)/i;
const SENSITIVE_VALUE_PATTERN =
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*|\bsk-[A-Za-z0-9_-]{8,}\b|\bgh[pousr]_[A-Za-z0-9_]{8,}\b/;

export async function runPluginReviewArtifactCli(
  argv: readonly string[] = [],
  options: PluginReviewArtifactRunOptions = {},
): Promise<PluginReviewArtifactCliResult | undefined> {
  const parsed = parseArgv(argv);
  if (!isPluginReviewArtifactParsedCommand(parsed)) {
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
    return jsonSuccess(HELP_PAYLOAD);
  }

  const action = pluginReviewArtifactAction(parsed.positionals);
  if (action.length === 0) {
    return jsonSuccess(HELP_PAYLOAD);
  }
  if (action.length !== 1 || action[0] !== "preview") {
    return unknownPluginReviewArtifactCommand(parsed);
  }

  try {
    const cwd = options.cwd ?? process.cwd();
    const manifest = await readJsonInputSource(requireSinglePath(parsed, "manifest"), cwd, "manifest");
    const sandboxSources = await readCollectionSources(
      readRepeatedPaths(parsed, ["sandbox-review", "sandbox-reviews"]),
      cwd,
      "sandbox review",
      ["sandboxReviews", "reviews", "items"],
      "sandbox-review",
    );
    const gateSources = await readCollectionSources(
      readRepeatedPaths(parsed, [
        "automation-gate-summary",
        "automation-gate-summaries",
        "gate-summary",
        "gate-summaries",
      ]),
      cwd,
      "automation gate summary",
      ["automationGateSummaries", "gateSummaries", "gates", "items"],
      "automation-gate-summary",
    );
    const auditSources = await readCollectionSources(
      readRepeatedPaths(parsed, [
        "automation-audit-summary",
        "automation-audit-summaries",
        "audit-summary",
        "audit-summaries",
      ]),
      cwd,
      "automation audit summary",
      ["automationAuditSummaries", "auditSummaries", "summaries", "items"],
      "automation-audit-summary",
    );

    const preview = createPluginReviewArtifactPreview({
      manifest: manifest.value,
      generatedAt: optionalStringFlag(parsed, "generated-at"),
      sandboxReviews: sandboxSources.flatMap((source) => source.items),
      automationGateSummaries: gateSources.flatMap((source) => source.items),
      automationAuditSummaries: auditSources.flatMap((source) => source.items),
      sources: {
        manifest: manifest.source,
        sandboxReviews: sandboxSources.map((source) => source.source),
        automationGateSummaries: gateSources.map((source) => source.source),
        automationAuditSummaries: auditSources.map((source) => source.source),
      },
    });

    return jsonSuccess(preview);
  } catch (error) {
    if (error instanceof PluginReviewArtifactError) {
      return jsonFailure(error.exitCode, error.code, error.message, error.details);
    }

    return jsonFailure(
      1,
      "plugin_review_artifact_error",
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function isPluginReviewArtifactCommand(argv: readonly string[]): boolean {
  return isPluginReviewArtifactParsedCommand(parseArgv(argv));
}

export function createPluginReviewArtifactPreview(
  input: PluginReviewArtifactInput,
): Record<string, unknown> {
  const manifestResult = validatePluginManifest(input.manifest);
  if (!manifestResult.ok) {
    throw invalidInput("Plugin manifest is invalid.", {
      issues: manifestResult.issues,
    });
  }

  const manifest = manifestResult.value;
  const generatedAt = normalizeTimestamp(
    input.generatedAt ?? latestInputTimestamp(input) ?? DEFAULT_GENERATED_AT,
    "generatedAt",
  );
  const redactor = createRedactor();
  const plugin = createPluginPreview(manifest, redactor);
  const sandboxReviews = normalizeSandboxReviews(
    input.sandboxReviews ?? [],
    manifest.id,
    generatedAt,
    redactor,
  );
  const automationGateSummaries = normalizeGateSummaries(
    input.automationGateSummaries ?? [],
    manifest.id,
    generatedAt,
    redactor,
  );
  const automationAuditSummaries = normalizeAuditSummaries(
    input.automationAuditSummaries ?? [],
    manifest.id,
    redactor,
  );
  const sources = normalizeSources(input.sources);
  const summary = {
    capabilityCount: manifest.capabilities.length,
    toolCount: manifest.tools.length,
    resourceCount: manifest.resources.length,
    promptCount: manifest.prompts.length,
    sandboxReviewCount: sandboxReviews.length,
    sandboxFailureCount: sandboxReviews.filter((review) => review.outcome === "failed").length,
    sandboxWarningCount: sandboxReviews.filter((review) => review.outcome === "warning").length,
    sandboxFindingCount: sandboxReviews.reduce((total, review) => total + review.findingCount, 0),
    automationGateSummaryCount: automationGateSummaries.length,
    requiredGateCount: automationGateSummaries.filter((summary) => summary.status === "required")
      .length,
    automationAuditSummaryCount: automationAuditSummaries.length,
    automationAuditEventCount: automationAuditSummaries.reduce(
      (total, summary) => total + summary.count,
      0,
    ),
    redactionCount: redactor.redactions.length,
  };
  const artifactSeed = {
    kind: "plugin-review-artifact.preview",
    schemaVersion: "plugin-review-artifact-preview.v1",
    generatedAt,
    plugin,
    sources,
    summary,
    sandboxReviews,
    automationGateSummaries,
    automationAuditSummaries,
    redactions: redactor.redactions,
  };
  const fingerprint = sha256(serializeCompactJson(artifactSeed));

  return {
    ...artifactSeed,
    artifactId: `plugin_review_artifact.${slugFromPluginId(manifest.id)}.${fingerprint.slice(
      "sha256:".length,
      "sha256:".length + 12,
    )}`,
    fingerprint,
  };
}

function createPluginPreview(
  manifest: NormalizedPluginManifest,
  redactor: Redactor,
): Record<string, unknown> {
  const redactedManifest = redactor.redact(manifest, "$.manifest");
  const fingerprint = sha256(serializeCompactJson(redactedManifest));

  return {
    ...(redactedManifest as Record<string, JsonValue>),
    fingerprint,
  };
}

function normalizeSandboxReviews(
  values: readonly unknown[],
  manifestPluginId: string,
  generatedAt: string,
  redactor: Redactor,
): readonly SandboxReviewPreview[] {
  return values
    .map((value, index) => {
      const label = `sandboxReviews[${index}]`;
      const record = requiredRecord(value, label);
      const pluginId = optionalText(record.pluginId, `${label}.pluginId`) ?? manifestPluginId;
      if (pluginId !== manifestPluginId) {
        return undefined;
      }
      const outcome = requiredText(record.outcome, `${label}.outcome`);
      if (!SANDBOX_OUTCOMES.has(outcome)) {
        throw invalidInput(`${label}.outcome must be one of passed, warning, failed.`);
      }

      const details = record.details === undefined
        ? undefined
        : redactor.redact(record.details, `$.${label}.details`);
      const findingCount =
        record.findingCount === undefined
          ? Array.isArray(record.findings)
            ? record.findings.length
            : outcome === "passed"
              ? 0
              : 1
          : nonNegativeInteger(record.findingCount, `${label}.findingCount`);
      const reviewSeed = optionalFields({
        id: optionalText(record.id, `${label}.id`),
        outcome: outcome as SandboxReviewPreview["outcome"],
        title: requiredText(record.title, `${label}.title`),
        checkedAt: record.checkedAt === undefined
          ? generatedAt
          : normalizeTimestamp(requiredText(record.checkedAt, `${label}.checkedAt`), `${label}.checkedAt`),
        pluginId,
        ruleId: optionalText(record.ruleId, `${label}.ruleId`),
        findingCount,
        details,
      });
      const id = reviewSeed.id ?? deterministicId("sandbox_review", reviewSeed);
      const review = {
        ...reviewSeed,
        id,
        fingerprint: sha256(serializeCompactJson({ ...reviewSeed, id })),
      } as SandboxReviewPreview;

      return review;
    })
    .filter(isDefined)
    .sort(compareSandboxReviews);
}

function normalizeGateSummaries(
  values: readonly unknown[],
  manifestPluginId: string,
  generatedAt: string,
  redactor: Redactor,
): readonly AutomationGateSummaryPreview[] {
  return values
    .map((value, index) => {
      const label = `automationGateSummaries[${index}]`;
      const record = requiredRecord(value, label);
      const pluginIds = pluginIdsFor(record, `${label}.pluginIds`, manifestPluginId);
      if (pluginIds.length > 0 && !pluginIds.includes(manifestPluginId)) {
        return undefined;
      }
      const gateId =
        optionalText(record.gateId, `${label}.gateId`) ??
        optionalText(record.id, `${label}.id`) ??
        deterministicId("gate", redactor.redact(record, `$.${label}.idSeed`));
      const details = record.details === undefined
        ? undefined
        : redactor.redact(record.details, `$.${label}.details`);
      const gateSeed = optionalFields({
        id: optionalText(record.id, `${label}.id`),
        gateId,
        label: optionalText(record.label, `${label}.label`) ?? gateId,
        status: normalizeStatus(
          optionalText(record.status, `${label}.status`) ??
            optionalText(record.mode, `${label}.mode`) ??
            "unused",
        ),
        pluginIds: pluginIds.length === 0 ? [manifestPluginId] : pluginIds,
        ruleIds: stringArray(record.ruleIds, `${label}.ruleIds`),
        affectedRuleCount:
          record.affectedRuleCount === undefined
            ? stringArray(record.ruleIds, `${label}.ruleIds`).length
            : nonNegativeInteger(record.affectedRuleCount, `${label}.affectedRuleCount`),
        enabled: optionalBoolean(record.enabled, `${label}.enabled`),
        mode: optionalText(record.mode, `${label}.mode`),
        lastCheckedAt: record.lastCheckedAt === undefined
          ? generatedAt
          : normalizeTimestamp(
              requiredText(record.lastCheckedAt, `${label}.lastCheckedAt`),
              `${label}.lastCheckedAt`,
            ),
        details,
      });
      const id = gateSeed.id ?? `automation_gate.${gateId}`;
      const summary = {
        ...gateSeed,
        id,
        fingerprint: sha256(serializeCompactJson({ ...gateSeed, id })),
      } as AutomationGateSummaryPreview;

      return summary;
    })
    .filter(isDefined)
    .sort(compareGateSummaries);
}

function normalizeAuditSummaries(
  values: readonly unknown[],
  manifestPluginId: string,
  redactor: Redactor,
): readonly AutomationAuditSummaryPreview[] {
  return values
    .map((value, index) => {
      const label = `automationAuditSummaries[${index}]`;
      const record = requiredRecord(value, label);
      const pluginIds = pluginIdsFor(record, `${label}.pluginIds`, manifestPluginId);
      if (pluginIds.length > 0 && !pluginIds.includes(manifestPluginId)) {
        return undefined;
      }
      const details = record.details === undefined
        ? undefined
        : redactor.redact(record.details, `$.${label}.details`);
      const summarySeed = optionalFields({
        id: optionalText(record.id, `${label}.id`),
        status: normalizeStatus(requiredText(record.status, `${label}.status`)),
        count: record.count === undefined ? 1 : nonNegativeInteger(record.count, `${label}.count`),
        pluginIds: pluginIds.length === 0 ? [manifestPluginId] : pluginIds,
        ruleIds: uniqueSorted([
          ...stringArray(record.ruleIds, `${label}.ruleIds`),
          ...optionalTextArray([optionalText(record.ruleId, `${label}.ruleId`)]),
        ]),
        lastEventAt: record.lastEventAt === undefined
          ? undefined
          : normalizeTimestamp(
              requiredText(record.lastEventAt, `${label}.lastEventAt`),
              `${label}.lastEventAt`,
            ),
        details,
      });
      const id = summarySeed.id ?? deterministicId("automation_audit", summarySeed);
      const summary = {
        ...summarySeed,
        id,
        fingerprint: sha256(serializeCompactJson({ ...summarySeed, id })),
      } as AutomationAuditSummaryPreview;

      return summary;
    })
    .filter(isDefined)
    .sort(compareAuditSummaries);
}

function normalizeSources(
  sources: PluginReviewArtifactInput["sources"],
): Record<string, unknown> {
  return {
    manifest: sources?.manifest,
    sandboxReviews: sources?.sandboxReviews ?? [],
    automationGateSummaries: sources?.automationGateSummaries ?? [],
    automationAuditSummaries: sources?.automationAuditSummaries ?? [],
  };
}

async function readCollectionSources(
  paths: readonly string[],
  cwd: string,
  label: string,
  arrayKeys: readonly string[],
  flagName: string,
): Promise<readonly { readonly items: readonly unknown[]; readonly source: PluginReviewArtifactSource }[]> {
  const sources: { items: readonly unknown[]; source: PluginReviewArtifactSource }[] = [];
  for (const inputPath of paths) {
    const json = await readJsonInputSource(inputPath, cwd, flagName);
    const items = collectionItems(json.value, label, arrayKeys);
    sources.push({
      items,
      source: {
        ...json.source,
        itemCount: items.length,
      },
    });
  }
  return sources;
}

function collectionItems(
  value: unknown,
  label: string,
  arrayKeys: readonly string[],
): readonly unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (isRecord(value)) {
    for (const key of arrayKeys) {
      if (value[key] === undefined) {
        continue;
      }
      if (!Array.isArray(value[key])) {
        throw invalidInput(`${label}.${key} must be an array.`);
      }
      return value[key] as readonly unknown[];
    }
    return [value];
  }

  throw invalidInput(`${label} input must be a JSON object or array.`);
}

async function readJsonInputSource(
  inputPath: string,
  cwd: string,
  flagName: string,
): Promise<JsonSource> {
  const resolved = await resolveLocalJsonPath(inputPath, cwd, flagName);
  let text: string;
  try {
    text = await readFile(resolved.absolutePath, "utf8");
  } catch (error) {
    throw new PluginReviewArtifactError({
      exitCode: 1,
      code: "input_read_error",
      message: "Could not read plugin review artifact input.",
      details: {
        path: resolved.displayPath,
        cause: error instanceof Error ? error.message : String(error),
      },
    });
  }

  try {
    return {
      value: JSON.parse(text),
      source: {
        path: resolved.displayPath,
        sha256: sha256(text),
        bytes: Buffer.byteLength(text, "utf8"),
      },
    };
  } catch {
    throw new PluginReviewArtifactError({
      exitCode: 2,
      code: "invalid_json",
      message: "Plugin review artifact input must contain valid JSON.",
      details: {
        path: resolved.displayPath,
      },
    });
  }
}

async function resolveLocalJsonPath(
  value: string,
  cwd: string,
  flagName: string,
): Promise<ResolvedLocalPath> {
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

  const cwdPath = path.resolve(cwd);
  const requestedPath = path.resolve(cwdPath, input);
  const workspaceRoot =
    findWorkspaceRoot(cwdPath) ?? findWorkspaceRoot(path.dirname(requestedPath));
  if (workspaceRoot === undefined) {
    throw usageError(`Could not locate the SovereignOps workspace root for --${flagName}.`);
  }

  assertPathInsideWorkspace(workspaceRoot, requestedPath, flagName);
  assertNotPrivatePath(workspaceRoot, requestedPath, flagName);
  if (path.extname(requestedPath) !== ".json") {
    throw usageError(`Option --${flagName} must point to a .json file.`);
  }

  let fileStat: Awaited<ReturnType<typeof stat>>;
  try {
    fileStat = await stat(requestedPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new PluginReviewArtifactError({
        exitCode: 2,
        code: "input_not_found",
        message: "Plugin review artifact input file was not found.",
        details: {
          path: displayPath(workspaceRoot, requestedPath),
        },
      });
    }

    throw new PluginReviewArtifactError({
      exitCode: 1,
      code: "input_stat_error",
      message: "Could not inspect plugin review artifact input.",
      details: {
        path: displayPath(workspaceRoot, requestedPath),
        cause: error instanceof Error ? error.message : String(error),
      },
    });
  }

  if (!fileStat.isFile()) {
    throw new PluginReviewArtifactError({
      exitCode: 2,
      code: "input_not_file",
      message: `Option --${flagName} must point to a file.`,
      details: {
        path: displayPath(workspaceRoot, requestedPath),
      },
    });
  }

  const actualPath = await realpath(requestedPath);
  assertPathInsideWorkspace(workspaceRoot, actualPath, flagName);
  assertNotPrivatePath(workspaceRoot, actualPath, flagName);

  return {
    absolutePath: actualPath,
    displayPath: displayPath(workspaceRoot, actualPath),
    workspaceRoot,
  };
}

function createRedactor(): Redactor {
  const redactions: RedactionRecord[] = [];

  return {
    get redactions() {
      return [...redactions].sort(compareRedactions);
    },
    redact(value: unknown, valuePath: string): JsonValue {
      return redactValue(value, valuePath);
    },
  };

  function redactValue(value: unknown, valuePath: string): JsonValue {
    if (value === null || typeof value === "boolean") {
      return value;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        throw invalidInput(`${valuePath} must be JSON-compatible.`);
      }
      return value;
    }
    if (typeof value === "string") {
      if (SENSITIVE_VALUE_PATTERN.test(value)) {
        redactions.push({ path: valuePath, reason: "secret-like value" });
        return "[REDACTED]";
      }
      return value;
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

    throw invalidInput(`${valuePath} must be JSON-compatible.`);
  }
}

function latestInputTimestamp(input: PluginReviewArtifactInput): string | undefined {
  const timestamps: string[] = [];
  collectTimestamps(input.sandboxReviews ?? [], timestamps);
  collectTimestamps(input.automationGateSummaries ?? [], timestamps);
  collectTimestamps(input.automationAuditSummaries ?? [], timestamps);
  return timestamps.sort(compareStrings).at(-1);
}

function collectTimestamps(values: readonly unknown[], timestamps: string[]): void {
  for (const value of values) {
    if (!isRecord(value)) {
      continue;
    }
    for (const key of ["checkedAt", "lastCheckedAt", "lastEventAt", "generatedAt"]) {
      const candidate = value[key];
      if (typeof candidate === "string" && !Number.isNaN(Date.parse(candidate))) {
        timestamps.push(new Date(Date.parse(candidate)).toISOString());
      }
    }
  }
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

function isPluginReviewArtifactParsedCommand(parsed: ParsedArgv): boolean {
  return pluginReviewArtifactCommandLength(parsed.positionals) > 0;
}

function pluginReviewArtifactCommandLength(positionals: readonly string[]): number {
  if (positionals[0] === "plugin" && positionals[1] === "review" && positionals[2] === "artifact") {
    return 3;
  }
  if (positionals[0] === "plugin" && positionals[1] === "review-artifact") {
    return 2;
  }
  if (positionals[0] === "plugin-review-artifact") {
    return 1;
  }
  return 0;
}

function pluginReviewArtifactAction(positionals: readonly string[]): readonly string[] {
  return positionals.slice(pluginReviewArtifactCommandLength(positionals));
}

function hasHelp(parsed: ParsedArgv): boolean {
  return parsed.flags.help === true || parsed.flags.h === true;
}

function requireSinglePath(parsed: ParsedArgv, name: string): string {
  const primary = optionalStringFlag(parsed, name);
  const alias = optionalStringFlag(parsed, `${name}-path`);
  if (primary !== undefined && alias !== undefined) {
    throw usageError(`Use either --${name} or --${name}-path, not both.`);
  }
  const value = primary ?? alias;
  if (value === undefined || value.trim().length === 0) {
    throw usageError(`Missing required option --${name}.`);
  }
  return value;
}

function readRepeatedPaths(parsed: ParsedArgv, names: readonly string[]): readonly string[] {
  return names.flatMap((name) => repeatedStringFlag(parsed, name));
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
  throw usageError(`Option --${name} requires a value.`);
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw invalidInput(`${label} must be an object.`);
  }
  return value;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value !== value.trim()) {
    throw invalidInput(`${label} must be a non-empty string without surrounding whitespace.`);
  }
  return value;
}

function optionalText(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requiredText(value, label);
}

function optionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw invalidInput(`${label} must be a boolean.`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw invalidInput(`${label} must be a non-negative integer.`);
  }
  return value;
}

function normalizeTimestamp(value: string, label: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw invalidInput(`${label} must be a valid ISO timestamp.`);
  }
  return new Date(parsed).toISOString();
}

function normalizeStatus(value: string): string {
  const status = value.trim().toLowerCase().replace(/\s+/g, "_");
  if (status.length === 0) {
    throw invalidInput("summary status must be a non-empty string.");
  }
  return status;
}

function pluginIdsFor(
  record: Record<string, unknown>,
  label: string,
  manifestPluginId: string,
): readonly string[] {
  const pluginIds = uniqueSorted([
    ...stringArray(record.pluginIds, label),
    ...optionalTextArray([optionalText(record.pluginId, label.replace(/pluginIds$/, "pluginId"))]),
  ]);
  for (const pluginId of pluginIds) {
    if (!pluginId.startsWith("plugin.")) {
      throw invalidInput(`${label} values must use plugin.<slug> format.`);
    }
  }
  return pluginIds;
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw invalidInput(`${label} must be an array.`);
  }
  return uniqueSorted(
    value.map((item, index) => requiredText(item, `${label}[${index}]`)),
  );
}

function optionalTextArray(values: readonly (string | undefined)[]): readonly string[] {
  return values.filter(isDefined);
}

function deterministicId(prefix: string, value: unknown): string {
  return `${prefix}.${sha256(serializeCompactJson(value)).slice("sha256:".length, "sha256:".length + 12)}`;
}

function slugFromPluginId(pluginId: string): string {
  return pluginId.replace(/^plugin\./, "").replace(/[^a-z0-9]+/g, "_");
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

function displayPath(workspaceRoot: string, candidatePath: string): string {
  return path.relative(workspaceRoot, candidatePath).split(path.sep).join("/");
}

function jsonSuccess(value: unknown): PluginReviewArtifactCliResult {
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
): PluginReviewArtifactCliResult {
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

function unknownPluginReviewArtifactCommand(parsed: ParsedArgv): PluginReviewArtifactCliResult {
  return jsonFailure(
    1,
    "unknown_command",
    `Unknown plugin review artifact command: ${parsed.positionals.join(" ")}`,
  );
}

function usageError(message: string, details?: Record<string, unknown>): PluginReviewArtifactError {
  return new PluginReviewArtifactError({
    exitCode: 2,
    code: "usage_error",
    message,
    details,
  });
}

function invalidInput(message: string, details?: Record<string, unknown>): PluginReviewArtifactError {
  return new PluginReviewArtifactError({
    exitCode: 2,
    code: "invalid_plugin_review_artifact",
    message,
    details,
  });
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function serializePrettyJson(value: unknown): string {
  return JSON.stringify(sortJson(value), null, 2);
}

function serializeCompactJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
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
  return [...new Set(values)].sort(compareStrings);
}

function compareSandboxReviews(left: SandboxReviewPreview, right: SandboxReviewPreview): number {
  return (
    sandboxOutcomeSortWeight(left.outcome) - sandboxOutcomeSortWeight(right.outcome) ||
    compareStrings(left.checkedAt, right.checkedAt) ||
    compareStrings(left.id, right.id)
  );
}

function compareGateSummaries(
  left: AutomationGateSummaryPreview,
  right: AutomationGateSummaryPreview,
): number {
  return compareStrings(left.status, right.status) || compareStrings(left.id, right.id);
}

function compareAuditSummaries(
  left: AutomationAuditSummaryPreview,
  right: AutomationAuditSummaryPreview,
): number {
  return compareStrings(left.status, right.status) || compareStrings(left.id, right.id);
}

function compareRedactions(left: RedactionRecord, right: RedactionRecord): number {
  return compareStrings(left.path, right.path) || compareStrings(left.reason, right.reason);
}

function sandboxOutcomeSortWeight(outcome: SandboxReviewPreview["outcome"]): number {
  return {
    failed: 0,
    warning: 1,
    passed: 2,
  }[outcome];
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class PluginReviewArtifactError extends Error {
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
    this.name = "PluginReviewArtifactError";
    this.exitCode = options.exitCode;
    this.code = options.code;
    this.details = options.details;
  }
}
