export interface LifecycleCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface LifecycleRunOptions {
  readonly files?: LifecycleFileSystem;
  readonly services?: Partial<LifecycleServices>;
  readonly stdin?: string;
}

export interface LifecycleFileSystem {
  readonly listFiles: (root: string) => Awaitable<readonly string[]>;
  readonly readText: (path: string) => Awaitable<string>;
}

export interface LifecycleServices {
  readonly planMigrationPreview: (
    input: MigrationPlanPreviewInput,
  ) => Awaitable<MigrationPlanPreview>;
  readonly validateBackupManifest: (
    input: BackupManifestValidationInput,
  ) => Awaitable<BackupManifestValidationSummary>;
  readonly planRestoreSummary: (input: RestorePlanSummaryInput) => Awaitable<RestorePlanSummary>;
  readonly planCompactionPreview: (
    input: CompactionPlanPreviewInput,
  ) => Awaitable<CompactionPlanPreview>;
  readonly checkLocIntegrity: (input: LocIntegrityInput) => Awaitable<LocIntegrityResult>;
  readonly generateReleaseNotes: (
    input: ReleaseNotesInput,
  ) => Awaitable<ReleaseNotesResult>;
}

export type LifecycleJsonPrimitive = string | number | boolean | null;
export type LifecycleJsonObject = { readonly [key: string]: LifecycleJsonValue };
export type LifecycleJsonValue =
  | LifecycleJsonPrimitive
  | LifecycleJsonObject
  | readonly LifecycleJsonValue[];

export interface MigrationStepDescriptor {
  readonly id: string;
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly summary: string;
  readonly rollbackNote: string;
}

export interface MigrationPlanPreviewInput {
  readonly workspaceId?: string;
  readonly metadata: LifecycleJsonObject;
  readonly steps: readonly MigrationStepDescriptor[];
  readonly targetVersion?: number;
}

export interface MigrationPlanPreview {
  readonly kind: "lifecycle.migration-plan-preview";
  readonly workspaceId?: string;
  readonly sourceVersion: number;
  readonly targetVersion: number;
  readonly steps: readonly MigrationPlanStepPreview[];
  readonly rollbackNotes: readonly string[];
  readonly alreadyCurrent: boolean;
  readonly dryRun: true;
  readonly summary: {
    readonly sourceVersion: number;
    readonly targetVersion: number;
    readonly stepCount: number;
    readonly stepIds: readonly string[];
    readonly alreadyCurrent: boolean;
    readonly dryRun: true;
    readonly sourceFingerprint: string;
    readonly fingerprint: string;
  };
  readonly fingerprint: string;
}

export interface MigrationPlanStepPreview extends MigrationStepDescriptor {
  readonly fingerprint: string;
}

export interface BackupManifestValidationInput {
  readonly manifest: unknown;
}

export interface BackupManifestValidationSummary {
  readonly kind: "lifecycle.backup-manifest-validation";
  readonly ok: boolean;
  readonly issueCount: number;
  readonly issues: readonly ValidationIssue[];
  readonly manifest?: BackupManifest;
  readonly summary: BackupManifestSummary | null;
}

export interface BackupManifestSummary {
  readonly backupId: string;
  readonly workspaceId: string;
  readonly createdAt: string;
  readonly payloadCount: number;
  readonly payloadKinds: readonly string[];
  readonly plaintextByteSize: number;
  readonly encryptedByteSize: number;
  readonly manifestFingerprint: string;
}

export interface RestorePlanSummaryInput {
  readonly manifest: unknown;
  readonly targetWorkspaceId: string;
  readonly mode?: RestoreMode;
  readonly allowSourceWorkspaceOverwrite?: boolean;
  readonly allowDestructiveRestore?: boolean;
  readonly trustedManifestFingerprints?: readonly string[];
  readonly availablePayloadIds?: readonly string[];
  readonly maxManifestAgeDays?: number;
  readonly now?: string;
  readonly includePayloadIds?: readonly string[];
  readonly excludePayloadIds?: readonly string[];
  readonly existingPayloadFingerprints?: Readonly<Record<string, string>>;
}

export type RestoreMode = "preview" | "merge" | "replace";
export type RestoreActionType = "restore" | "skip" | "conflict" | "blocked";

export interface RestorePlanAction {
  readonly type: RestoreActionType;
  readonly payloadId: string;
  readonly kind: BackupPayloadKind;
  readonly path: string;
  readonly reason: string;
  readonly sourceFingerprint: string;
  readonly targetFingerprint?: string;
}

export interface RestorePlanSummary {
  readonly kind: "lifecycle.restore-plan-summary";
  readonly backupId: string | null;
  readonly workspaceId: string | null;
  readonly targetWorkspaceId: string;
  readonly mode: RestoreMode;
  readonly canRun: boolean;
  readonly dryRun: true;
  readonly safety: {
    readonly safe: boolean;
    readonly blockers: readonly string[];
    readonly warnings: readonly string[];
  };
  readonly actions: readonly RestorePlanAction[];
  readonly summary: {
    readonly restore: number;
    readonly skip: number;
    readonly conflict: number;
    readonly blocked: number;
  };
}

export interface CompactionPlanPreviewInput {
  readonly workspaceId?: string;
  readonly fromSequence?: number;
  readonly toSequence?: number;
  readonly reducerVersion?: string;
  readonly sourceEventCount?: number;
  readonly sourceByteCount?: number;
  readonly targetByteLimit?: number;
  readonly checkpointFingerprint?: string;
  readonly events?: readonly unknown[];
  readonly streamId?: string;
  readonly compactThroughSequence?: number;
  readonly createdAt?: string;
  readonly maxEventsPerRange?: number;
  readonly minimumEventsPerCheckpoint?: number;
  readonly planId?: string;
}

export interface CompactionPlanPreview {
  readonly kind: "lifecycle.compaction-plan-preview";
  readonly workspaceId?: string;
  readonly dryRun: true;
  readonly planId: string;
  readonly eventCount: number;
  readonly compactedEventCount: number;
  readonly retainedEventCount: number;
  readonly checkpointCount: number;
  readonly checkpointFingerprint: string;
  readonly sourceFingerprint: string;
  readonly rollbackNote: string;
  readonly warnings: readonly string[];
  readonly fingerprint: string;
}

export interface LocIntegrityInput {
  readonly root?: string;
  readonly files?: readonly LocIntegrityFile[];
  readonly minimums?: Readonly<Record<string, number>>;
  readonly includeDefaultMinimums?: boolean;
  readonly generatedDirs?: readonly string[];
  readonly generatedMaxFiles?: number;
  readonly generatedMaxLines?: number;
}

export interface LocIntegrityFile {
  readonly path: string;
  readonly text: string;
}

export interface LocIntegrityResult {
  readonly kind: "lifecycle.loc-integrity";
  readonly ok: boolean;
  readonly dryRun: boolean;
  readonly command?: readonly string[];
  readonly files: number;
  readonly total: number;
  readonly totals: Readonly<Record<string, number>>;
  readonly minimums: Readonly<Record<string, number>>;
  readonly generated: {
    readonly files: readonly { readonly path: string; readonly lines: number }[];
    readonly maxFiles: number;
    readonly maxLines: number;
    readonly totalFiles: number;
    readonly totalLines: number;
  };
  readonly violations: readonly ValidationIssue[];
}

export interface ReleaseNotesInput {
  readonly commits: readonly ReleaseNotesCommit[];
  readonly version?: string;
  readonly releaseDate?: string;
  readonly source?: string;
}

export interface ReleaseNotesCommit {
  readonly hash?: string;
  readonly commit_hash?: string;
  readonly subject?: string;
  readonly message?: string;
  readonly body?: string;
  readonly date?: string;
  readonly author_date?: string;
}

export interface ReleaseNotesResult {
  readonly kind: "lifecycle.release-notes";
  readonly markdown: string;
  readonly summary: {
    readonly version: string;
    readonly releaseDate?: string;
    readonly source?: string;
    readonly commitCount: number;
    readonly sections: Readonly<Record<string, number>>;
  };
}

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

type Awaitable<T> = T | Promise<T>;
type ParsedFlagValue = string | boolean | readonly string[];

interface ParsedArgv {
  readonly positionals: readonly string[];
  readonly flags: Readonly<Record<string, ParsedFlagValue>>;
  readonly errors: readonly string[];
}

interface BackupManifest {
  readonly manifestVersion: string;
  readonly backupId: string;
  readonly workspaceId: string;
  readonly createdAt: string;
  readonly createdByActorId: string;
  readonly encryption: {
    readonly algorithm: string;
    readonly keyId: string;
    readonly keyFingerprint: string;
  };
  readonly payloads: readonly BackupPayloadDescriptor[];
  readonly manifestFingerprint: string;
}

type BackupPayloadKind = "workspace_state" | "record" | "asset" | "settings";

interface BackupPayloadDescriptor {
  readonly id: string;
  readonly kind: BackupPayloadKind;
  readonly path: string;
  readonly plaintextByteSize: number;
  readonly encryptedByteSize: number;
  readonly contentType?: string;
  readonly createdAt: string;
  readonly encryption: {
    readonly algorithm: string;
    readonly keyId: string;
    readonly nonceFingerprint: string;
    readonly encryptedPayloadFingerprint: string;
  };
  readonly integrity: {
    readonly plaintextFingerprint: string;
    readonly encryptedPayloadFingerprint: string;
    readonly descriptorFingerprint: string;
  };
}

interface LifecycleCommand {
  readonly family: string;
  readonly action: readonly string[];
}

interface EventEnvelope {
  readonly eventId: string;
  readonly streamId: string;
  readonly sequence: number;
  readonly type: string;
  readonly timestamp: string;
  readonly payload: LifecycleJsonObject;
}

interface ReleaseNote {
  readonly section: string;
  readonly summary: string;
  readonly scope: string;
  readonly commitHash: string;
}

const HELP_TEXT = `SovereignOps lifecycle CLI

Usage:
  sovereignops lifecycle <command> [--input-json <json>|--stdin]

Commands:
  migration plan --input-json <json>
  backup manifest validate --input-json <json>
  restore plan --input-json <json>
  compaction plan --input-json <json>
  loc integrity [--input-json <json>]
  release notes --input-json <json> [--version <label>] [--date <yyyy-mm-dd>]

Lifecycle commands are dry-run previews by default and never write files.
`;

const BOOLEAN_FLAGS = new Set([
  "help",
  "h",
  "json",
  "stdin",
  "no-default-minimums",
]);
const REPEATED_FLAGS = new Set(["minimum", "generated-dir"]);
const LIFECYCLE_COMMANDS = new Set([
  "backup",
  "compaction",
  "lifecycle",
  "loc",
  "loc-integrity",
  "migration",
  "release",
  "release-notes",
  "restore",
]);
const DEFAULT_TIMESTAMP = "2026-04-27T00:00:00.000Z";
const DEFAULT_LOC_MINIMUMS = Object.freeze({
  docs: 1500,
  other: 1500,
  python: 800,
  rust: 3000,
  tests: 5000,
  tooling: 1200,
  total: 30000,
  typescript: 10000,
});
const COUNTED_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".py",
  ".rs",
  ".sh",
  ".toml",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);
const EXCLUDED_DIRS = new Set([
  ".codex-private",
  ".codex-run",
  ".git",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "generated",
  "node_modules",
  "target",
  "venv",
]);
const DEFAULT_GENERATED_DIRS = ["generated"];
const PAYLOAD_KINDS = new Set(["asset", "record", "settings", "workspace_state"]);
const RESTORE_MODES = new Set(["merge", "preview", "replace"]);
const SECTION_ORDER = [
  "Breaking Changes",
  "Added",
  "Fixed",
  "Changed",
  "Documentation",
  "Testing",
  "Build",
  "Maintenance",
  "Other",
];
const TYPE_TO_SECTION: Readonly<Record<string, string>> = Object.freeze({
  build: "Build",
  chore: "Maintenance",
  ci: "Build",
  docs: "Documentation",
  feat: "Added",
  fix: "Fixed",
  perf: "Changed",
  refactor: "Changed",
  test: "Testing",
});
const CONVENTIONAL_COMMIT_PATTERN =
  /^(?<type>[A-Za-z]+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?:\s*(?<summary>.+)$/;

export async function runLifecycleCli(
  argv: readonly string[] = [],
  options: LifecycleRunOptions = {},
): Promise<LifecycleCliResult | undefined> {
  const parsed = parseArgv(argv);
  if (!isLifecycleParsedCommand(parsed)) {
    return undefined;
  }
  if (parsed.errors.length > 0) {
    return failure(2, parsed.errors.join("\n"));
  }

  if (hasHelp(parsed)) {
    return success(HELP_TEXT);
  }

  const command = lifecycleCommandFrom(parsed.positionals);
  if (command === undefined) {
    return success(HELP_TEXT);
  }

  const services = createLifecycleServices({
    files: options.files,
    services: options.services,
  });

  try {
    if (command.family === "migration" && matchesAction(command, "plan")) {
      return jsonSuccess(
        await services.planMigrationPreview(readMigrationPlanInput(parsed, options.stdin)),
      );
    }

    if (command.family === "backup" && matchesAction(command, "manifest", "validate")) {
      return jsonSuccess(
        await services.validateBackupManifest(readBackupManifestInput(parsed, options.stdin)),
      );
    }

    if (command.family === "backup" && matchesAction(command, "validate")) {
      return jsonSuccess(
        await services.validateBackupManifest(readBackupManifestInput(parsed, options.stdin)),
      );
    }

    if (command.family === "restore" && matchesAction(command, "plan")) {
      return jsonSuccess(
        await services.planRestoreSummary(readRestorePlanInput(parsed, options.stdin)),
      );
    }

    if (command.family === "compaction" && matchesAction(command, "plan")) {
      return jsonSuccess(
        await services.planCompactionPreview(readCompactionPlanInput(parsed, options.stdin)),
      );
    }

    if (command.family === "loc" && matchesAction(command, "integrity")) {
      const result = await services.checkLocIntegrity(readLocIntegrityInput(parsed, options.stdin));
      return {
        exitCode: result.ok ? 0 : 1,
        stdout: `${JSON.stringify(result, null, 2)}\n`,
        stderr: "",
      };
    }

    if (command.family === "release" && matchesAction(command, "notes")) {
      const result = await services.generateReleaseNotes(
        readReleaseNotesInput(parsed, options.stdin),
      );
      return parsed.flags.json === true ? jsonSuccess(result) : success(result.markdown);
    }
  } catch (error) {
    if (error instanceof LifecycleUsageError) {
      return failure(2, error.message);
    }

    return failure(1, error instanceof Error ? error.message : String(error));
  }

  return failure(
    1,
    `Unknown lifecycle command: ${parsed.positionals.join(" ")}\nRun "sovereignops lifecycle --help" for usage.`,
  );
}

export function isLifecycleCommand(argv: readonly string[]): boolean {
  return isLifecycleParsedCommand(parseArgv(argv));
}

export function createLifecycleServices(options: {
  readonly files?: LifecycleFileSystem;
  readonly services?: Partial<LifecycleServices>;
} = {}): LifecycleServices {
  const defaults: LifecycleServices = {
    planMigrationPreview: createMigrationPlanPreview,
    validateBackupManifest: ({ manifest }) => validateBackupManifestSummary(manifest),
    planRestoreSummary: createRestorePlanSummary,
    planCompactionPreview: createCompactionPlanPreview,
    checkLocIntegrity: (input) => checkLocIntegrity(input, options.files),
    generateReleaseNotes: generateReleaseNotes,
  };

  return {
    ...defaults,
    ...options.services,
  };
}

function readMigrationPlanInput(parsed: ParsedArgv, stdin = ""): MigrationPlanPreviewInput {
  const value = readJsonInput(parsed, stdin);
  if (!isRecord(value)) {
    throw new LifecycleUsageError("migration plan input must be a JSON object.");
  }
  const metadata = value.metadata;
  if (!isJsonObject(metadata)) {
    throw new LifecycleUsageError("migration plan input.metadata must be a JSON object.");
  }
  if (!Array.isArray(value.steps)) {
    throw new LifecycleUsageError("migration plan input.steps must be an array.");
  }
  const targetVersion = optionalIntegerFrom(value.targetVersion, "targetVersion");
  return {
    ...(typeof value.workspaceId === "string" ? { workspaceId: value.workspaceId } : {}),
    metadata,
    steps: value.steps.map(readMigrationStep),
    ...(targetVersion === undefined ? {} : { targetVersion }),
  };
}

function readBackupManifestInput(
  parsed: ParsedArgv,
  stdin = "",
): BackupManifestValidationInput {
  const value = readJsonInput(parsed, stdin);
  const manifest = isRecord(value) && Object.hasOwn(value, "manifest") ? value.manifest : value;
  return { manifest };
}

function readRestorePlanInput(parsed: ParsedArgv, stdin = ""): RestorePlanSummaryInput {
  const value = readJsonInput(parsed, stdin);
  if (!isRecord(value)) {
    throw new LifecycleUsageError("restore plan input must be a JSON object.");
  }
  if (value.manifest === undefined) {
    throw new LifecycleUsageError("restore plan input.manifest is required.");
  }
  if (typeof value.targetWorkspaceId !== "string" || value.targetWorkspaceId.trim().length === 0) {
    throw new LifecycleUsageError("restore plan input.targetWorkspaceId is required.");
  }
  const mode = value.mode === undefined ? undefined : readRestoreMode(value.mode, "mode");
  return {
    manifest: value.manifest,
    targetWorkspaceId: value.targetWorkspaceId,
    ...(mode === undefined ? {} : { mode }),
    ...(value.allowSourceWorkspaceOverwrite === undefined
      ? {}
      : { allowSourceWorkspaceOverwrite: readBoolean(value.allowSourceWorkspaceOverwrite, "allowSourceWorkspaceOverwrite") }),
    ...(value.allowDestructiveRestore === undefined
      ? {}
      : { allowDestructiveRestore: readBoolean(value.allowDestructiveRestore, "allowDestructiveRestore") }),
    ...(value.trustedManifestFingerprints === undefined
      ? {}
      : { trustedManifestFingerprints: readStringArray(value.trustedManifestFingerprints, "trustedManifestFingerprints") }),
    ...(value.availablePayloadIds === undefined
      ? {}
      : { availablePayloadIds: readStringArray(value.availablePayloadIds, "availablePayloadIds") }),
    ...(value.maxManifestAgeDays === undefined
      ? {}
      : { maxManifestAgeDays: readNonNegativeInteger(value.maxManifestAgeDays, "maxManifestAgeDays") }),
    ...(typeof value.now === "string" ? { now: value.now } : {}),
    ...(value.includePayloadIds === undefined
      ? {}
      : { includePayloadIds: readStringArray(value.includePayloadIds, "includePayloadIds") }),
    ...(value.excludePayloadIds === undefined
      ? {}
      : { excludePayloadIds: readStringArray(value.excludePayloadIds, "excludePayloadIds") }),
    ...(value.existingPayloadFingerprints === undefined
      ? {}
      : { existingPayloadFingerprints: readStringRecord(value.existingPayloadFingerprints, "existingPayloadFingerprints") }),
  };
}

function readCompactionPlanInput(parsed: ParsedArgv, stdin = ""): CompactionPlanPreviewInput {
  const value = readJsonInput(parsed, stdin);
  if (!isRecord(value)) {
    throw new LifecycleUsageError("compaction plan input must be a JSON object.");
  }
  return {
    ...(typeof value.workspaceId === "string" ? { workspaceId: value.workspaceId } : {}),
    ...(value.fromSequence === undefined ? {} : { fromSequence: readNonNegativeInteger(value.fromSequence, "fromSequence") }),
    ...(value.toSequence === undefined ? {} : { toSequence: readNonNegativeInteger(value.toSequence, "toSequence") }),
    ...(typeof value.reducerVersion === "string" ? { reducerVersion: value.reducerVersion } : {}),
    ...(value.sourceEventCount === undefined ? {} : { sourceEventCount: readNonNegativeInteger(value.sourceEventCount, "sourceEventCount") }),
    ...(value.sourceByteCount === undefined ? {} : { sourceByteCount: readNonNegativeInteger(value.sourceByteCount, "sourceByteCount") }),
    ...(value.targetByteLimit === undefined ? {} : { targetByteLimit: readNonNegativeInteger(value.targetByteLimit, "targetByteLimit") }),
    ...(typeof value.checkpointFingerprint === "string" ? { checkpointFingerprint: value.checkpointFingerprint } : {}),
    ...(Array.isArray(value.events) ? { events: value.events } : {}),
    ...(typeof value.streamId === "string" ? { streamId: value.streamId } : {}),
    ...(value.compactThroughSequence === undefined ? {} : { compactThroughSequence: readNonNegativeInteger(value.compactThroughSequence, "compactThroughSequence") }),
    ...(typeof value.createdAt === "string" ? { createdAt: value.createdAt } : {}),
    ...(value.maxEventsPerRange === undefined ? {} : { maxEventsPerRange: readPositiveInteger(value.maxEventsPerRange, "maxEventsPerRange") }),
    ...(value.minimumEventsPerCheckpoint === undefined ? {} : { minimumEventsPerCheckpoint: readPositiveInteger(value.minimumEventsPerCheckpoint, "minimumEventsPerCheckpoint") }),
    ...(typeof value.planId === "string" ? { planId: value.planId } : {}),
  };
}

function readLocIntegrityInput(parsed: ParsedArgv, stdin = ""): LocIntegrityInput {
  const jsonInput = optionalJsonInput(parsed, stdin);
  const base = jsonInput === undefined ? {} : readLocIntegrityJson(jsonInput);
  const minimums = readMinimumFlags(parsed);
  const generatedDirs = repeatedStringFlag(parsed, "generated-dir");
  return {
    ...base,
    ...(optionalStringFlag(parsed, "root") === undefined
      ? {}
      : { root: optionalStringFlag(parsed, "root") }),
    ...(Object.keys(minimums).length === 0 ? {} : { minimums }),
    ...(parsed.flags["no-default-minimums"] === true ? { includeDefaultMinimums: false } : {}),
    ...(generatedDirs.length === 0 ? {} : { generatedDirs }),
    ...(optionalStringFlag(parsed, "generated-max-files") === undefined
      ? {}
      : { generatedMaxFiles: positiveIntegerFlag(parsed, "generated-max-files", true) }),
    ...(optionalStringFlag(parsed, "generated-max-lines") === undefined
      ? {}
      : { generatedMaxLines: positiveIntegerFlag(parsed, "generated-max-lines", true) }),
  };
}

function readReleaseNotesInput(parsed: ParsedArgv, stdin = ""): ReleaseNotesInput {
  const value = readJsonInput(parsed, stdin);
  const commitsValue = isRecord(value) && Object.hasOwn(value, "commits") ? value.commits : value;
  if (!Array.isArray(commitsValue)) {
    throw new LifecycleUsageError("release notes input must be a commit array or an object with commits.");
  }

  const sourceRecord = isRecord(value) ? value : {};
  const version =
    optionalStringFlag(parsed, "version") ??
    optionalStringFrom(sourceRecord.version) ??
    "Unreleased";
  const releaseDate =
    optionalStringFlag(parsed, "date") ??
    optionalStringFrom(sourceRecord.releaseDate) ??
    optionalStringFrom(sourceRecord.date);
  const source =
    optionalStringFlag(parsed, "source-label") ??
    optionalStringFrom(sourceRecord.source) ??
    optionalStringFrom(sourceRecord.sourceLabel);

  return {
    commits: commitsValue.map(readReleaseNotesCommit),
    version,
    ...(releaseDate === undefined ? {} : { releaseDate }),
    ...(source === undefined ? {} : { source }),
  };
}

function createMigrationPlanPreview(input: MigrationPlanPreviewInput): MigrationPlanPreview {
  const sourceVersion = readNonNegativeInteger(input.metadata.schemaVersion, "metadata.schemaVersion");
  const steps = normalizeMigrationSteps(input.steps);
  const targetVersion = input.targetVersion ?? Math.max(sourceVersion, ...steps.map((step) => step.toVersion));
  if (targetVersion < sourceVersion) {
    throw new LifecycleUsageError("targetVersion cannot be lower than metadata.schemaVersion.");
  }

  const selected = selectMigrationSteps(steps, sourceVersion, targetVersion);
  const planSteps = selected.map((step) => ({
    ...step,
    fingerprint: lifecycleFingerprint({
      kind: "lifecycle.migration-step",
      step,
    }),
  }));
  const rollbackNotes = planSteps.map((step) => step.rollbackNote).reverse();
  const sourceFingerprint = lifecycleFingerprint({
    kind: "lifecycle.workspace-metadata",
    metadata: input.metadata,
  });
  const summaryBase = {
    alreadyCurrent: planSteps.length === 0,
    dryRun: true,
    sourceFingerprint,
    sourceVersion,
    stepCount: planSteps.length,
    stepIds: planSteps.map((step) => step.id),
    targetVersion,
  };
  const fingerprint = lifecycleFingerprint({
    kind: "lifecycle.migration-plan-preview",
    rollbackNotes,
    steps: planSteps,
    summary: summaryBase,
  });

  return deepClone({
    kind: "lifecycle.migration-plan-preview",
    ...(input.workspaceId === undefined ? {} : { workspaceId: input.workspaceId }),
    sourceVersion,
    targetVersion,
    steps: planSteps,
    rollbackNotes,
    alreadyCurrent: planSteps.length === 0,
    dryRun: true,
    summary: {
      ...summaryBase,
      fingerprint,
    },
    fingerprint,
  });
}

function validateBackupManifestSummary(value: unknown): BackupManifestValidationSummary {
  const result = validateBackupManifest(value);
  if (!result.ok) {
    return {
      kind: "lifecycle.backup-manifest-validation",
      ok: false,
      issueCount: result.issues.length,
      issues: result.issues,
      summary: null,
    };
  }

  const manifest = result.manifest;
  return {
    kind: "lifecycle.backup-manifest-validation",
    ok: true,
    issueCount: 0,
    issues: [],
    manifest,
    summary: summarizeBackupManifest(manifest),
  };
}

function createRestorePlanSummary(input: RestorePlanSummaryInput): RestorePlanSummary {
  const mode = input.mode ?? "preview";
  const manifestResult = validateBackupManifest(input.manifest);
  const blockers: string[] = [];
  const warnings: string[] = [];
  const targetWorkspaceId = input.targetWorkspaceId.trim();
  if (!isWorkspaceId(targetWorkspaceId)) {
    blockers.push("targetWorkspaceId must use wsp_<slug> format");
  }

  if (!manifestResult.ok) {
    blockers.push(...manifestResult.issues.map((issue) => `${issue.path} ${issue.message}`));
    return {
      kind: "lifecycle.restore-plan-summary",
      backupId: null,
      workspaceId: null,
      targetWorkspaceId,
      mode,
      canRun: false,
      dryRun: true,
      safety: {
        safe: false,
        blockers,
        warnings,
      },
      actions: [],
      summary: {
        restore: 0,
        skip: 0,
        conflict: 0,
        blocked: 0,
      },
    };
  }

  const manifest = manifestResult.manifest;
  if (targetWorkspaceId === manifest.workspaceId && input.allowSourceWorkspaceOverwrite !== true) {
    blockers.push("restore targets the source workspace without explicit overwrite approval");
  }
  if (mode === "replace" && input.allowDestructiveRestore !== true) {
    blockers.push("replace mode requires explicit destructive restore approval");
  }
  if (
    input.trustedManifestFingerprints !== undefined &&
    !input.trustedManifestFingerprints.includes(manifest.manifestFingerprint)
  ) {
    blockers.push("manifest fingerprint is not trusted");
  }
  if (input.availablePayloadIds !== undefined) {
    const available = new Set(input.availablePayloadIds);
    const missing = manifest.payloads.filter((payload) => !available.has(payload.id));
    if (missing.length > 0) {
      blockers.push(`missing payload descriptors: ${missing.map((payload) => payload.id).join(", ")}`);
    }
  }
  if (input.maxManifestAgeDays !== undefined) {
    const now = Date.parse(input.now ?? DEFAULT_TIMESTAMP);
    const created = Date.parse(manifest.createdAt);
    const maxAgeMs = input.maxManifestAgeDays * 24 * 60 * 60 * 1000;
    if (Number.isFinite(now) && now - created > maxAgeMs) {
      warnings.push(`manifest is older than ${input.maxManifestAgeDays} days`);
    }
  }

  const include = input.includePayloadIds === undefined
    ? undefined
    : new Set(input.includePayloadIds);
  const exclude = new Set(input.excludePayloadIds ?? []);
  const selected = manifest.payloads.filter((payload) => (
    (include === undefined || include.has(payload.id)) && !exclude.has(payload.id)
  ));
  const safe = blockers.length === 0;
  const existing = input.existingPayloadFingerprints ?? {};
  const actions = selected.map((payload): RestorePlanAction => {
    if (!safe) {
      return restoreAction("blocked", payload, "restore is blocked by safety checks");
    }

    const targetFingerprint = existing[payload.path];
    if (targetFingerprint === payload.integrity.descriptorFingerprint) {
      return restoreAction(
        "skip",
        payload,
        "target already has this payload descriptor",
        targetFingerprint,
      );
    }
    if (targetFingerprint !== undefined && mode === "merge") {
      return restoreAction(
        "conflict",
        payload,
        "target has a different payload at this path",
        targetFingerprint,
      );
    }
    return restoreAction(
      "restore",
      payload,
      targetFingerprint === undefined ? "payload will be restored" : "target payload will be replaced",
      targetFingerprint,
    );
  });
  const summary = summarizeRestoreActions(actions);

  return {
    kind: "lifecycle.restore-plan-summary",
    backupId: manifest.backupId,
    workspaceId: manifest.workspaceId,
    targetWorkspaceId,
    mode,
    canRun: safe && summary.conflict === 0 && summary.blocked === 0,
    dryRun: true,
    safety: {
      safe,
      blockers,
      warnings,
    },
    actions,
    summary,
  };
}

function createCompactionPlanPreview(input: CompactionPlanPreviewInput): CompactionPlanPreview {
  if (input.events !== undefined) {
    return createEventCompactionPreview(input);
  }

  const fromSequence = readNonNegativeInteger(input.fromSequence, "fromSequence");
  const toSequence = readNonNegativeInteger(input.toSequence, "toSequence");
  if (toSequence < fromSequence) {
    throw new LifecycleUsageError("toSequence must be greater than or equal to fromSequence.");
  }
  const sourceEventCount = readPositiveInteger(input.sourceEventCount, "sourceEventCount");
  const reducerVersion = requireCleanString(input.reducerVersion, "reducerVersion");
  const sourceByteCount = input.sourceByteCount ?? sourceEventCount * 128;
  const compactedByteCount = Math.min(sourceByteCount, input.targetByteLimit ?? sourceByteCount);
  const sourceFingerprint = lifecycleFingerprint({
    fromSequence,
    reducerVersion,
    sourceByteCount,
    sourceEventCount,
    toSequence,
    workspaceId: input.workspaceId,
  });
  const checkpointFingerprint =
    input.checkpointFingerprint ??
    lifecycleFingerprint({
      kind: "lifecycle.compaction-checkpoint",
      sourceFingerprint,
    });
  const planId = input.planId ?? `plan_${checkpointFingerprint.slice("fnv1a64:".length)}`;
  const fingerprint = lifecycleFingerprint({
    checkpointFingerprint,
    compactedByteCount,
    kind: "lifecycle.compaction-plan-preview",
    planId,
    sourceFingerprint,
  });

  return {
    kind: "lifecycle.compaction-plan-preview",
    ...(input.workspaceId === undefined ? {} : { workspaceId: input.workspaceId }),
    dryRun: true,
    planId,
    eventCount: sourceEventCount,
    compactedEventCount: sourceEventCount,
    retainedEventCount: 0,
    checkpointCount: 1,
    checkpointFingerprint,
    sourceFingerprint,
    rollbackNote: "Dry-run only; keep original events until the compaction result is accepted.",
    warnings: compactedByteCount === sourceByteCount && input.targetByteLimit !== undefined
      ? ["targetByteLimit did not reduce the preview byte count"]
      : [],
    fingerprint,
  };
}

async function checkLocIntegrity(
  input: LocIntegrityInput,
  files?: LifecycleFileSystem,
): Promise<LocIntegrityResult> {
  const root = input.root ?? ".";
  const minimums = {
    ...(input.includeDefaultMinimums === false ? {} : DEFAULT_LOC_MINIMUMS),
    ...(input.minimums ?? {}),
  };
  const generatedDirs = input.generatedDirs ?? DEFAULT_GENERATED_DIRS;
  const generatedMaxFiles = input.generatedMaxFiles ?? 0;
  const generatedMaxLines = input.generatedMaxLines ?? 0;
  const providedFiles = input.files ?? (files === undefined ? undefined : await readFiles(root, files));

  if (providedFiles === undefined) {
    return {
      kind: "lifecycle.loc-integrity",
      ok: true,
      dryRun: true,
      command: locIntegrityCommand(input),
      files: 0,
      total: 0,
      totals: {},
      minimums,
      generated: {
        files: [],
        maxFiles: generatedMaxFiles,
        maxLines: generatedMaxLines,
        totalFiles: 0,
        totalLines: 0,
      },
      violations: [],
    };
  }

  const counts = collectLocCounts(providedFiles);
  const generated = collectGeneratedLoc(providedFiles, generatedDirs);
  const violations: ValidationIssue[] = [];
  for (const [bucket, minimum] of Object.entries(minimums).sort(([left], [right]) => left.localeCompare(right))) {
    const actual = bucket === "total" ? counts.total : (counts.totals[bucket] ?? 0);
    if (actual < minimum) {
      violations.push({
        path: `minimums.${bucket}`,
        message: `${bucket} LOC ${actual} is below required minimum ${minimum}`,
      });
    }
  }
  if (generated.length > generatedMaxFiles) {
    violations.push({
      path: "generated.totalFiles",
      message: `generated file count ${generated.length} exceeds maximum ${generatedMaxFiles}`,
    });
  }
  const generatedLines = generated.reduce((sum, file) => sum + file.lines, 0);
  if (generatedLines > generatedMaxLines) {
    violations.push({
      path: "generated.totalLines",
      message: `generated LOC ${generatedLines} exceeds maximum ${generatedMaxLines}`,
    });
  }

  return {
    kind: "lifecycle.loc-integrity",
    ok: violations.length === 0,
    dryRun: false,
    files: counts.files,
    total: counts.total,
    totals: counts.totals,
    minimums,
    generated: {
      files: generated,
      maxFiles: generatedMaxFiles,
      maxLines: generatedMaxLines,
      totalFiles: generated.length,
      totalLines: generatedLines,
    },
    violations,
  };
}

function generateReleaseNotes(input: ReleaseNotesInput): ReleaseNotesResult {
  const commits = input.commits.map(normalizeReleaseNotesCommit);
  const notes = commits.map(noteFromCommit);
  const grouped = groupNotes(notes);
  const version = input.version ?? "Unreleased";
  const lines = [`# Release Notes - ${version}`];
  if (input.releaseDate !== undefined || input.source !== undefined) {
    lines.push("");
    if (input.releaseDate !== undefined) {
      lines.push(`Date: ${input.releaseDate}`);
    }
    if (input.source !== undefined) {
      lines.push(`Source: \`${input.source}\``);
    }
  }

  let wroteSection = false;
  for (const section of SECTION_ORDER) {
    const sectionNotes = grouped[section] ?? [];
    if (sectionNotes.length === 0) {
      continue;
    }
    wroteSection = true;
    lines.push("", `## ${section}`);
    for (const note of sectionNotes) {
      const scope = note.scope.length === 0 ? "" : `${note.scope}: `;
      const suffix = note.commitHash.length === 0 ? "" : ` (\`${note.commitHash}\`)`;
      lines.push(`- ${scope}${note.summary}${suffix}`);
    }
  }

  if (!wroteSection) {
    lines.push("", "No notable changes.");
  }

  return {
    kind: "lifecycle.release-notes",
    markdown: `${lines.join("\n")}\n`,
    summary: {
      version,
      ...(input.releaseDate === undefined ? {} : { releaseDate: input.releaseDate }),
      ...(input.source === undefined ? {} : { source: input.source }),
      commitCount: commits.length,
      sections: Object.fromEntries(
        SECTION_ORDER.map((section) => [section, grouped[section]?.length ?? 0]),
      ),
    },
  };
}

function createEventCompactionPreview(input: CompactionPlanPreviewInput): CompactionPlanPreview {
  const events = normalizeEvents(input.events ?? [], input.streamId);
  const compactThroughSequence = input.compactThroughSequence ?? Number.MAX_SAFE_INTEGER;
  const minimumEventsPerCheckpoint = input.minimumEventsPerCheckpoint ?? 2;
  const ranges = collectEventRanges(events, input.maxEventsPerRange ?? Number.MAX_SAFE_INTEGER);
  const compactedRanges = ranges.filter(
    (range) =>
      range.events.length >= minimumEventsPerCheckpoint &&
      range.toSequence <= compactThroughSequence,
  );
  const compactedIds = new Set(compactedRanges.flatMap((range) => range.events.map((event) => event.eventId)));
  const compactedEventCount = compactedIds.size;
  const retainedEventCount = events.length - compactedEventCount;
  const sourceFingerprint = lifecycleFingerprint({
    events: events.map((event) => ({
      eventId: event.eventId,
      sequence: event.sequence,
      streamId: event.streamId,
      fingerprint: lifecycleFingerprint(event),
    })),
    kind: "lifecycle.compaction-event-set",
  });
  const checkpointFingerprint = lifecycleFingerprint({
    compactedRanges: compactedRanges.map((range) => ({
      eventIds: range.events.map((event) => event.eventId),
      fromSequence: range.fromSequence,
      streamId: range.streamId,
      toSequence: range.toSequence,
    })),
    kind: "lifecycle.compaction-checkpoints",
    sourceFingerprint,
  });
  const planId = input.planId ?? `plan_${checkpointFingerprint.slice("fnv1a64:".length)}`;
  const warnings = hasSequenceGaps(events)
    ? ["sequence gaps remain visible in the dry-run plan"]
    : [];
  const fingerprint = lifecycleFingerprint({
    checkpointFingerprint,
    compactedEventCount,
    kind: "lifecycle.compaction-plan-preview",
    planId,
    retainedEventCount,
    sourceFingerprint,
    warnings,
  });

  return {
    kind: "lifecycle.compaction-plan-preview",
    ...(input.workspaceId === undefined ? {} : { workspaceId: input.workspaceId }),
    dryRun: true,
    planId,
    eventCount: events.length,
    compactedEventCount,
    retainedEventCount,
    checkpointCount: compactedRanges.length,
    checkpointFingerprint,
    sourceFingerprint,
    rollbackNote: "Dry-run only; keep original events until the compaction result is accepted.",
    warnings,
    fingerprint,
  };
}

function validateBackupManifest(value: unknown):
  | { readonly ok: true; readonly manifest: BackupManifest }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: "$", message: "must be an object" }] };
  }

  requireExactString(value, "manifestVersion", "$.manifestVersion", "1.0.0", issues);
  requirePatternString(value, "backupId", "$.backupId", /^bkp_[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/, "must use bkp_<slug> format", issues);
  requirePatternString(value, "workspaceId", "$.workspaceId", /^wsp_[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/, "must use wsp_<slug> format", issues);
  requireIsoTimestamp(value, "createdAt", "$.createdAt", issues);
  requirePatternString(value, "createdByActorId", "$.createdByActorId", /^act_[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/, "must use act_<slug> format", issues);
  validateEncryption(value.encryption, "$.encryption", issues);
  validatePayloads(value.payloads, "$.payloads", issues);
  requirePatternString(value, "manifestFingerprint", "$.manifestFingerprint", /^fp_[0-9a-f]{16}$/, "must be a deterministic fingerprint", issues);

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const manifest = normalizeBackupManifestUnchecked(value as unknown as BackupManifest);
  if (value.manifestFingerprint !== manifest.manifestFingerprint) {
    return {
      ok: false,
      issues: [{ path: "$.manifestFingerprint", message: "does not match manifest contents" }],
    };
  }

  return { ok: true, manifest };
}

function normalizeBackupManifestUnchecked(manifest: BackupManifest): BackupManifest {
  const withoutFingerprint = {
    manifestVersion: "1.0.0",
    backupId: manifest.backupId.trim(),
    workspaceId: manifest.workspaceId.trim(),
    createdAt: new Date(Date.parse(manifest.createdAt.trim())).toISOString(),
    createdByActorId: manifest.createdByActorId.trim(),
    encryption: {
      algorithm: manifest.encryption.algorithm.trim(),
      keyId: manifest.encryption.keyId.trim(),
      keyFingerprint: manifest.encryption.keyFingerprint.trim(),
    },
    payloads: manifest.payloads.map(normalizePayloadUnchecked).sort((left, right) => left.id.localeCompare(right.id)),
  };
  return {
    ...withoutFingerprint,
    manifestFingerprint: backupFingerprint(withoutFingerprint),
  };
}

function normalizePayloadUnchecked(payload: BackupPayloadDescriptor): BackupPayloadDescriptor {
  const withoutIntegrity = optionalFields({
    id: payload.id.trim(),
    kind: payload.kind,
    path: normalizeRelativePath(payload.path),
    plaintextByteSize: payload.plaintextByteSize,
    encryptedByteSize: payload.encryptedByteSize,
    contentType: payload.contentType?.trim(),
    createdAt: new Date(Date.parse(payload.createdAt.trim())).toISOString(),
    encryption: {
      algorithm: payload.encryption.algorithm.trim(),
      keyId: payload.encryption.keyId.trim(),
      nonceFingerprint: payload.encryption.nonceFingerprint.trim(),
      encryptedPayloadFingerprint: payload.encryption.encryptedPayloadFingerprint.trim(),
    },
  });

  return {
    ...withoutIntegrity,
    integrity: {
      plaintextFingerprint: payload.integrity.plaintextFingerprint.trim(),
      encryptedPayloadFingerprint: payload.integrity.encryptedPayloadFingerprint.trim(),
      descriptorFingerprint: backupFingerprint(withoutIntegrity),
    },
  };
}

function summarizeBackupManifest(manifest: BackupManifest): BackupManifestSummary {
  return {
    backupId: manifest.backupId,
    workspaceId: manifest.workspaceId,
    createdAt: manifest.createdAt,
    payloadCount: manifest.payloads.length,
    payloadKinds: [...new Set(manifest.payloads.map((payload) => payload.kind))].sort(),
    plaintextByteSize: manifest.payloads.reduce((sum, payload) => sum + payload.plaintextByteSize, 0),
    encryptedByteSize: manifest.payloads.reduce((sum, payload) => sum + payload.encryptedByteSize, 0),
    manifestFingerprint: manifest.manifestFingerprint,
  };
}

function validatePayloads(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push({ path, message: "must be a non-empty array" });
    return;
  }

  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();
  value.forEach((payload, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(payload)) {
      issues.push({ path: itemPath, message: "must be an object" });
      return;
    }
    const id = requirePatternString(payload, "id", `${itemPath}.id`, /^pay_[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/, "must use pay_<slug> format", issues);
    const rawPath = requireString(payload, "path", `${itemPath}.path`, issues);
    if (typeof payload.kind !== "string" || !PAYLOAD_KINDS.has(payload.kind)) {
      issues.push({ path: `${itemPath}.kind`, message: "must be a supported payload kind" });
    }
    requireNonNegativeIntegerField(payload, "plaintextByteSize", `${itemPath}.plaintextByteSize`, issues);
    requireNonNegativeIntegerField(payload, "encryptedByteSize", `${itemPath}.encryptedByteSize`, issues);
    if (
      Number.isInteger(payload.plaintextByteSize) &&
      Number.isInteger(payload.encryptedByteSize) &&
      payload.encryptedByteSize < payload.plaintextByteSize
    ) {
      issues.push({ path: `${itemPath}.encryptedByteSize`, message: "must be greater than or equal to plaintextByteSize" });
    }
    if (payload.contentType !== undefined && !isNonEmptyString(payload.contentType)) {
      issues.push({ path: `${itemPath}.contentType`, message: "must be a non-empty string" });
    }
    requireIsoTimestamp(payload, "createdAt", `${itemPath}.createdAt`, issues);
    validatePayloadEncryption(payload.encryption, `${itemPath}.encryption`, issues);
    validatePayloadIntegrity(payload.integrity, `${itemPath}.integrity`, issues);
    if (id !== undefined) {
      if (seenIds.has(id)) {
        issues.push({ path: `${itemPath}.id`, message: `duplicates payload id ${id}` });
      }
      seenIds.add(id);
    }
    if (rawPath !== undefined) {
      if (!isSafeRelativePath(rawPath)) {
        issues.push({ path: `${itemPath}.path`, message: "must be a relative backup path" });
      } else {
        const normalizedPath = normalizeRelativePath(rawPath);
        if (seenPaths.has(normalizedPath)) {
          issues.push({ path: `${itemPath}.path`, message: `duplicates payload path ${normalizedPath}` });
        }
        seenPaths.add(normalizedPath);
      }
    }
    if (
      isRecord(payload.encryption) &&
      isRecord(payload.integrity) &&
      typeof payload.encryption.encryptedPayloadFingerprint === "string" &&
      typeof payload.integrity.encryptedPayloadFingerprint === "string" &&
      payload.encryption.encryptedPayloadFingerprint !== payload.integrity.encryptedPayloadFingerprint
    ) {
      issues.push({
        path: `${itemPath}.integrity.encryptedPayloadFingerprint`,
        message: "must match encryption.encryptedPayloadFingerprint",
      });
    }
  });
}

function validateEncryption(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "must be an object" });
    return;
  }
  requireString(value, "algorithm", `${path}.algorithm`, issues);
  requireString(value, "keyId", `${path}.keyId`, issues);
  requirePatternString(value, "keyFingerprint", `${path}.keyFingerprint`, /^fp_[0-9a-f]{16}$/, "must be a deterministic fingerprint", issues);
}

function validatePayloadEncryption(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "must be an object" });
    return;
  }
  requireString(value, "algorithm", `${path}.algorithm`, issues);
  requireString(value, "keyId", `${path}.keyId`, issues);
  requirePatternString(value, "nonceFingerprint", `${path}.nonceFingerprint`, /^fp_[0-9a-f]{16}$/, "must be a deterministic fingerprint", issues);
  requirePatternString(value, "encryptedPayloadFingerprint", `${path}.encryptedPayloadFingerprint`, /^fp_[0-9a-f]{16}$/, "must be a deterministic fingerprint", issues);
}

function validatePayloadIntegrity(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "must be an object" });
    return;
  }
  requirePatternString(value, "plaintextFingerprint", `${path}.plaintextFingerprint`, /^fp_[0-9a-f]{16}$/, "must be a deterministic fingerprint", issues);
  requirePatternString(value, "encryptedPayloadFingerprint", `${path}.encryptedPayloadFingerprint`, /^fp_[0-9a-f]{16}$/, "must be a deterministic fingerprint", issues);
  requirePatternString(value, "descriptorFingerprint", `${path}.descriptorFingerprint`, /^fp_[0-9a-f]{16}$/, "must be a deterministic fingerprint", issues);
}

function normalizeMigrationSteps(
  steps: readonly MigrationStepDescriptor[],
): readonly MigrationStepDescriptor[] {
  const ids = new Set<string>();
  return steps.map((step, index) => {
    const normalized = readMigrationStep(step, `steps[${index}]`);
    if (ids.has(normalized.id)) {
      throw new LifecycleUsageError(`migration step id is duplicated: ${normalized.id}`);
    }
    ids.add(normalized.id);
    if (normalized.toVersion <= normalized.fromVersion) {
      throw new LifecycleUsageError(`migration step ${normalized.id} must advance schema version.`);
    }
    return normalized;
  }).sort((left, right) => (
    left.fromVersion - right.fromVersion ||
    left.toVersion - right.toVersion ||
    left.id.localeCompare(right.id)
  ));
}

function selectMigrationSteps(
  steps: readonly MigrationStepDescriptor[],
  sourceVersion: number,
  targetVersion: number,
): readonly MigrationStepDescriptor[] {
  const selected: MigrationStepDescriptor[] = [];
  let version = sourceVersion;
  while (version < targetVersion) {
    const candidates = steps.filter(
      (step) => step.fromVersion === version && step.toVersion <= targetVersion,
    );
    if (candidates.length === 0) {
      throw new LifecycleUsageError(
        `no migration step connects schema version ${version} to ${targetVersion}.`,
      );
    }
    if (candidates.length > 1) {
      throw new LifecycleUsageError(
        `multiple migration steps start at schema version ${version}.`,
      );
    }
    selected.push(candidates[0]);
    version = candidates[0].toVersion;
  }
  return selected;
}

function collectLocCounts(files: readonly LocIntegrityFile[]): {
  readonly files: number;
  readonly total: number;
  readonly totals: Readonly<Record<string, number>>;
} {
  const totals: Record<string, number> = {};
  let fileCount = 0;
  for (const file of files) {
    const path = normalizePath(file.path);
    if (skipCountedPath(path) || !COUNTED_EXTENSIONS.has(extensionOf(path))) {
      continue;
    }
    fileCount += 1;
    const bucket = classifyLocPath(path);
    totals[bucket] = (totals[bucket] ?? 0) + countLines(file.text);
  }
  return {
    files: fileCount,
    total: Object.values(totals).reduce((sum, count) => sum + count, 0),
    totals,
  };
}

function collectGeneratedLoc(
  files: readonly LocIntegrityFile[],
  generatedDirs: readonly string[],
): readonly { readonly path: string; readonly lines: number }[] {
  const generated = new Set(generatedDirs);
  const skipDirs = new Set([...EXCLUDED_DIRS].filter((entry) => !generated.has(entry)));
  return files
    .map((file) => ({ path: normalizePath(file.path), text: file.text }))
    .filter((file) => {
      const parts = file.path.split("/");
      return parts.some((part) => generated.has(part)) && !parts.some((part) => skipDirs.has(part));
    })
    .map((file) => ({
      path: file.path,
      lines: countLines(file.text),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

async function readFiles(
  root: string,
  files: LifecycleFileSystem,
): Promise<readonly LocIntegrityFile[]> {
  const paths = await files.listFiles(root);
  const result: LocIntegrityFile[] = [];
  for (const path of paths) {
    result.push({
      path,
      text: await files.readText(path),
    });
  }
  return result;
}

function locIntegrityCommand(input: LocIntegrityInput): readonly string[] {
  const command = ["python", "scripts/loc_integrity.py"];
  if (input.root !== undefined) {
    command.push("--root", input.root);
  }
  for (const [bucket, minimum] of Object.entries(input.minimums ?? {})) {
    command.push("--minimum", `${bucket}=${minimum}`);
  }
  if (input.includeDefaultMinimums === false) {
    command.push("--no-default-minimums");
  }
  for (const dir of input.generatedDirs ?? []) {
    command.push("--generated-dir", dir);
  }
  if (input.generatedMaxFiles !== undefined) {
    command.push("--generated-max-files", String(input.generatedMaxFiles));
  }
  if (input.generatedMaxLines !== undefined) {
    command.push("--generated-max-lines", String(input.generatedMaxLines));
  }
  command.push("--json");
  return command;
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

function isLifecycleParsedCommand(parsed: ParsedArgv): boolean {
  const first = parsed.positionals[0];
  return first !== undefined && LIFECYCLE_COMMANDS.has(first);
}

function lifecycleCommandFrom(positionals: readonly string[]): LifecycleCommand | undefined {
  if (positionals.length === 0) {
    return undefined;
  }
  const parts = positionals[0] === "lifecycle" ? positionals.slice(1) : positionals;
  if (parts.length === 0) {
    return undefined;
  }
  if (parts[0] === "loc-integrity") {
    return { family: "loc", action: ["integrity", ...parts.slice(1)] };
  }
  if (parts[0] === "release-notes") {
    return { family: "release", action: ["notes", ...parts.slice(1)] };
  }
  return { family: parts[0], action: parts.slice(1) };
}

function matchesAction(command: LifecycleCommand, ...expected: readonly string[]): boolean {
  if (command.action.length < expected.length) {
    return false;
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (command.action[index] !== expected[index]) {
      return false;
    }
  }
  const remaining = command.action.slice(expected.length);
  return remaining.length === 0 || remaining.every((part) => part === "preview" || part === "summary" || part === "generate");
}

function readJsonInput(parsed: ParsedArgv, stdin = ""): unknown {
  const value = optionalJsonInput(parsed, stdin);
  if (value === undefined) {
    throw new LifecycleUsageError("Missing required option --input-json or --stdin.");
  }
  return value;
}

function optionalJsonInput(parsed: ParsedArgv, stdin = ""): unknown | undefined {
  const input = optionalStringFlag(parsed, "input-json") ?? optionalStringFlag(parsed, "input");
  if (input === undefined && parsed.flags.stdin !== true) {
    return undefined;
  }
  const source = input === undefined || input === "-" ? stdin : input;
  if (source.trim().length === 0) {
    throw new LifecycleUsageError("JSON input cannot be empty.");
  }
  try {
    return JSON.parse(source);
  } catch {
    throw new LifecycleUsageError("Input must contain valid JSON.");
  }
}

function readLocIntegrityJson(value: unknown): LocIntegrityInput {
  if (!isRecord(value)) {
    throw new LifecycleUsageError("loc integrity input must be a JSON object.");
  }
  return {
    ...(typeof value.root === "string" ? { root: value.root } : {}),
    ...(Array.isArray(value.files)
      ? { files: value.files.map(readLocIntegrityFile) }
      : {}),
    ...(value.minimums === undefined
      ? {}
      : { minimums: readNumberRecord(value.minimums, "minimums") }),
    ...(value.includeDefaultMinimums === undefined
      ? {}
      : { includeDefaultMinimums: readBoolean(value.includeDefaultMinimums, "includeDefaultMinimums") }),
    ...(value.generatedDirs === undefined
      ? {}
      : { generatedDirs: readStringArray(value.generatedDirs, "generatedDirs") }),
    ...(value.generatedMaxFiles === undefined
      ? {}
      : { generatedMaxFiles: readNonNegativeInteger(value.generatedMaxFiles, "generatedMaxFiles") }),
    ...(value.generatedMaxLines === undefined
      ? {}
      : { generatedMaxLines: readNonNegativeInteger(value.generatedMaxLines, "generatedMaxLines") }),
  };
}

function readLocIntegrityFile(value: unknown, index: number): LocIntegrityFile {
  if (!isRecord(value)) {
    throw new LifecycleUsageError(`files[${index}] must be an object.`);
  }
  return {
    path: requireCleanString(value.path, `files[${index}].path`),
    text: typeof value.text === "string" ? value.text : "",
  };
}

function readMigrationStep(value: unknown, path = "step"): MigrationStepDescriptor {
  if (!isRecord(value)) {
    throw new LifecycleUsageError(`${path} must be an object.`);
  }
  return {
    id: requireCleanString(value.id, `${path}.id`),
    fromVersion: readNonNegativeInteger(value.fromVersion, `${path}.fromVersion`),
    toVersion: readNonNegativeInteger(value.toVersion, `${path}.toVersion`),
    summary: requireCleanString(value.summary, `${path}.summary`),
    rollbackNote: requireCleanString(value.rollbackNote, `${path}.rollbackNote`),
  };
}

function readReleaseNotesCommit(value: unknown, index: number): ReleaseNotesCommit {
  if (!isRecord(value)) {
    throw new LifecycleUsageError(`commit entry ${index} must be an object.`);
  }
  return {
    ...(optionalStringFrom(value.hash) === undefined ? {} : { hash: optionalStringFrom(value.hash) }),
    ...(optionalStringFrom(value.commit_hash) === undefined ? {} : { commit_hash: optionalStringFrom(value.commit_hash) }),
    ...(optionalStringFrom(value.subject) === undefined ? {} : { subject: optionalStringFrom(value.subject) }),
    ...(optionalStringFrom(value.message) === undefined ? {} : { message: optionalStringFrom(value.message) }),
    ...(optionalStringFrom(value.body) === undefined ? {} : { body: optionalStringFrom(value.body) }),
    ...(optionalStringFrom(value.date) === undefined ? {} : { date: optionalStringFrom(value.date) }),
    ...(optionalStringFrom(value.author_date) === undefined ? {} : { author_date: optionalStringFrom(value.author_date) }),
  };
}

function normalizeReleaseNotesCommit(input: ReleaseNotesCommit): {
  readonly commitHash: string;
  readonly subject: string;
  readonly body: string;
} {
  const message = input.message ?? "";
  const subject = (input.subject ?? message.split(/\r?\n/)[0] ?? "").trim();
  if (subject.length === 0) {
    throw new LifecycleUsageError("release notes commit is missing subject or message.");
  }
  const body = (input.body ?? message.split(/\r?\n/).slice(1).join("\n")).trim();
  return {
    commitHash: (input.hash ?? input.commit_hash ?? "").slice(0, 12),
    subject,
    body,
  };
}

function noteFromCommit(commit: {
  readonly commitHash: string;
  readonly subject: string;
  readonly body: string;
}): ReleaseNote {
  const match = CONVENTIONAL_COMMIT_PATTERN.exec(commit.subject);
  let section = "Other";
  let scope = "";
  let summary = commit.subject;
  if (match?.groups !== undefined) {
    section = TYPE_TO_SECTION[match.groups.type.toLowerCase()] ?? "Other";
    scope = match.groups.scope ?? "";
    summary = match.groups.summary.trim();
  }
  if (match?.groups?.breaking !== undefined || commit.body.includes("BREAKING CHANGE:")) {
    section = "Breaking Changes";
  }
  return {
    section,
    scope,
    summary,
    commitHash: commit.commitHash,
  };
}

function groupNotes(notes: readonly ReleaseNote[]): Readonly<Record<string, readonly ReleaseNote[]>> {
  const grouped: Record<string, ReleaseNote[]> = Object.fromEntries(
    SECTION_ORDER.map((section) => [section, []]),
  );
  for (const note of notes) {
    grouped[note.section] = grouped[note.section] ?? [];
    grouped[note.section].push(note);
  }
  return grouped;
}

function normalizeEvents(values: readonly unknown[], streamId?: string): readonly EventEnvelope[] {
  const events = values.map(readEventEnvelope);
  const filtered = streamId === undefined
    ? events
    : events.filter((event) => event.streamId === streamId);
  const ids = new Set<string>();
  for (const event of filtered) {
    if (ids.has(event.eventId)) {
      throw new LifecycleUsageError(`event id is duplicated: ${event.eventId}`);
    }
    ids.add(event.eventId);
  }
  const streamIds = [...new Set(filtered.map((event) => event.streamId))];
  if (streamId === undefined && streamIds.length > 1) {
    throw new LifecycleUsageError("compaction plan must target one stream when multiple streams are present.");
  }
  return filtered.sort((left, right) => (
    left.streamId.localeCompare(right.streamId) ||
    left.sequence - right.sequence ||
    left.eventId.localeCompare(right.eventId)
  ));
}

function readEventEnvelope(value: unknown, index: number): EventEnvelope {
  if (!isRecord(value)) {
    throw new LifecycleUsageError(`events[${index}] must be an object.`);
  }
  const payload = value.payload;
  if (!isJsonObject(payload)) {
    throw new LifecycleUsageError(`events[${index}].payload must be a JSON object.`);
  }
  return {
    eventId: requireCleanString(value.eventId, `events[${index}].eventId`),
    streamId: requireCleanString(value.streamId, `events[${index}].streamId`),
    sequence: readPositiveInteger(value.sequence, `events[${index}].sequence`),
    type: requireCleanString(value.type, `events[${index}].type`),
    timestamp: requireCleanString(value.timestamp, `events[${index}].timestamp`),
    payload,
  };
}

function collectEventRanges(
  events: readonly EventEnvelope[],
  maxEventsPerRange: number,
): readonly {
  readonly streamId: string;
  readonly fromSequence: number;
  readonly toSequence: number;
  readonly events: readonly EventEnvelope[];
}[] {
  const ranges: {
    streamId: string;
    fromSequence: number;
    toSequence: number;
    events: EventEnvelope[];
  }[] = [];
  let current: EventEnvelope[] = [];
  let previousSequence: number | null = null;
  const seenSequences = new Set<number>();

  for (const event of events) {
    if (seenSequences.has(event.sequence)) {
      throw new LifecycleUsageError(`event sequence is duplicated: ${event.sequence}`);
    }
    seenSequences.add(event.sequence);
    const startNew =
      previousSequence === null ||
      event.sequence !== previousSequence + 1 ||
      current.length >= maxEventsPerRange;
    if (startNew && current.length > 0) {
      ranges.push({
        streamId: current[0].streamId,
        fromSequence: current[0].sequence,
        toSequence: current[current.length - 1].sequence,
        events: current,
      });
      current = [];
    }
    current.push(event);
    previousSequence = event.sequence;
  }
  if (current.length > 0) {
    ranges.push({
      streamId: current[0].streamId,
      fromSequence: current[0].sequence,
      toSequence: current[current.length - 1].sequence,
      events: current,
    });
  }
  return ranges;
}

function hasSequenceGaps(events: readonly EventEnvelope[]): boolean {
  for (let index = 1; index < events.length; index += 1) {
    if (events[index].sequence !== events[index - 1].sequence + 1) {
      return true;
    }
  }
  return false;
}

function summarizeRestoreActions(actions: readonly RestorePlanAction[]): RestorePlanSummary["summary"] {
  const summary = {
    restore: 0,
    skip: 0,
    conflict: 0,
    blocked: 0,
  };
  for (const action of actions) {
    summary[action.type] += 1;
  }
  return summary;
}

function restoreAction(
  type: RestoreActionType,
  payload: BackupPayloadDescriptor,
  reason: string,
  targetFingerprint?: string,
): RestorePlanAction {
  return optionalFields({
    type,
    payloadId: payload.id,
    kind: payload.kind,
    path: payload.path,
    reason,
    sourceFingerprint: payload.integrity.descriptorFingerprint,
    targetFingerprint,
  });
}

function readMinimumFlags(parsed: ParsedArgv): Record<string, number> {
  const minimums: Record<string, number> = {};
  for (const value of repeatedStringFlag(parsed, "minimum")) {
    const separator = value.indexOf("=");
    if (separator <= 0) {
      throw new LifecycleUsageError(`minimum must use name=value format: ${value}`);
    }
    const name = value.slice(0, separator).trim();
    const minimum = Number(value.slice(separator + 1));
    if (name.length === 0 || !Number.isInteger(minimum) || minimum < 0) {
      throw new LifecycleUsageError(`minimum must use a non-negative integer: ${value}`);
    }
    minimums[name] = minimum;
  }
  return minimums;
}

function positiveIntegerFlag(parsed: ParsedArgv, name: string, allowZero = false): number {
  const value = optionalStringFlag(parsed, name);
  if (value === undefined) {
    throw new LifecycleUsageError(`Missing required option --${name}.`);
  }
  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue < (allowZero ? 0 : 1)) {
    throw new LifecycleUsageError(`Option --${name} must be a ${allowZero ? "non-negative" : "positive"} integer.`);
  }
  return parsedValue;
}

function optionalStringFlag(parsed: ParsedArgv, name: string): string | undefined {
  const value = parsed.flags[name];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new LifecycleUsageError(`Option --${name} requires a value.`);
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
  throw new LifecycleUsageError(`Option --${name} requires a value.`);
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

function hasHelp(parsed: ParsedArgv): boolean {
  return parsed.flags.help === true || parsed.flags.h === true;
}

function requireCleanString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value !== value.trim()) {
    throw new LifecycleUsageError(`${path} must be a non-empty string without surrounding whitespace.`);
  }
  return value;
}

function requireString(
  record: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): string | undefined {
  if (!isNonEmptyString(record[field])) {
    issues.push({ path, message: "must be a non-empty string" });
    return undefined;
  }
  return String(record[field]).trim();
}

function requireExactString(
  record: Record<string, unknown>,
  field: string,
  path: string,
  expected: string,
  issues: ValidationIssue[],
): void {
  if (record[field] !== expected) {
    issues.push({ path, message: `must be ${expected}` });
  }
}

function requirePatternString(
  record: Record<string, unknown>,
  field: string,
  path: string,
  pattern: RegExp,
  message: string,
  issues: ValidationIssue[],
): string | undefined {
  const value = requireString(record, field, path, issues);
  if (value !== undefined && !pattern.test(value)) {
    issues.push({ path, message });
    return undefined;
  }
  return value;
}

function requireIsoTimestamp(
  record: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (typeof record[field] !== "string" || !isIsoTimestamp(record[field])) {
    issues.push({ path, message: "must be an ISO timestamp" });
  }
}

function requireNonNegativeIntegerField(
  record: Record<string, unknown>,
  field: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Number.isInteger(record[field]) || (record[field] as number) < 0) {
    issues.push({ path, message: "must be a non-negative integer" });
  }
}

function readPositiveInteger(value: unknown, path: string): number {
  const numberValue = readNonNegativeInteger(value, path);
  if (numberValue === 0) {
    throw new LifecycleUsageError(`${path} must be greater than zero.`);
  }
  return numberValue;
}

function readNonNegativeInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new LifecycleUsageError(`${path} must be a non-negative integer.`);
  }
  return value as number;
}

function optionalIntegerFrom(value: unknown, path: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return readNonNegativeInteger(value, path);
}

function readBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new LifecycleUsageError(`${path} must be a boolean.`);
  }
  return value;
}

function readStringArray(value: unknown, path: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new LifecycleUsageError(`${path} must be an array.`);
  }
  return value.map((item, index) => requireCleanString(item, `${path}[${index}]`));
}

function readStringRecord(value: unknown, path: string): Readonly<Record<string, string>> {
  if (!isRecord(value)) {
    throw new LifecycleUsageError(`${path} must be an object.`);
  }
  const record: Record<string, string> = {};
  for (const [key, nested] of Object.entries(value)) {
    record[key] = requireCleanString(nested, `${path}.${key}`);
  }
  return record;
}

function readNumberRecord(value: unknown, path: string): Readonly<Record<string, number>> {
  if (!isRecord(value)) {
    throw new LifecycleUsageError(`${path} must be an object.`);
  }
  const record: Record<string, number> = {};
  for (const [key, nested] of Object.entries(value)) {
    record[key] = readNonNegativeInteger(nested, `${path}.${key}`);
  }
  return record;
}

function readRestoreMode(value: unknown, path: string): RestoreMode {
  if (typeof value !== "string" || !RESTORE_MODES.has(value)) {
    throw new LifecycleUsageError(`${path} must be one of preview, merge, replace.`);
  }
  return value as RestoreMode;
}

function optionalStringFrom(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isJsonObject(value: unknown): value is LifecycleJsonObject {
  return isRecord(value) && isJsonValue(value);
}

function isJsonValue(value: unknown): value is LifecycleJsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (isRecord(value)) {
    return Object.values(value).every(isJsonValue);
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  if (!isNonEmptyString(value)) {
    return false;
  }
  const parsed = Date.parse(value.trim());
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value.trim();
}

function isWorkspaceId(value: string): boolean {
  return /^wsp_[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(value.trim());
}

function isSafeRelativePath(value: string): boolean {
  const normalized = value.trim().replace(/\\/g, "/");
  if (
    normalized.includes("\0") ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized)
  ) {
    return false;
  }
  const parts = normalized.split("/").filter((part) => part.length > 0 && part !== ".");
  return parts.length > 0 && !parts.includes("..");
}

function normalizeRelativePath(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part.length > 0 && part !== ".")
    .join("/");
}

function normalizePath(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/^\.\/+/, "");
}

function skipCountedPath(path: string): boolean {
  return path.split("/").some((part) => EXCLUDED_DIRS.has(part));
}

function extensionOf(path: string): string {
  const name = path.split("/").at(-1) ?? path;
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot);
}

function classifyLocPath(path: string): string {
  const parts = path.split("/");
  const filename = parts.at(-1) ?? "";
  if (parts.includes("tests") || filename.endsWith(".test.ts") || filename.endsWith(".spec.ts") || filename.endsWith("_test.rs")) {
    return "tests";
  }
  if (parts[0] === "crates") {
    return "rust";
  }
  if (parts[0] === "apps" || parts[0] === "packages") {
    return "typescript";
  }
  if (path.startsWith("services/mcp-gateway") || path.startsWith("services/sync")) {
    return "typescript";
  }
  if (path.startsWith("services/ingest")) {
    return "python";
  }
  if (parts[0] === "scripts") {
    return "tooling";
  }
  if ([".md", ".yaml", ".yml"].includes(extensionOf(path))) {
    return "docs";
  }
  return "other";
}

function countLines(value: string): number {
  if (value.length === 0) {
    return 0;
  }
  return value.endsWith("\n") ? value.split("\n").length - 1 : value.split("\n").length;
}

function backupFingerprint(value: unknown): string {
  return `fp_${fingerprintHex(value)}`;
}

function lifecycleFingerprint(value: unknown): string {
  return `fnv1a64:${fingerprintHex(value)}`;
}

function fingerprintHex(value: unknown): string {
  const serialized = stableStringify(value);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= BigInt(serialized.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }
  return hash.toString(16).padStart(16, "0");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.entries(value)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
      .join(",")}}`;
  }
  return "null";
}

function optionalFields<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function jsonSuccess(value: unknown): LifecycleCliResult {
  return success(`${JSON.stringify(value, null, 2)}\n`);
}

function success(stdout: string): LifecycleCliResult {
  return { exitCode: 0, stdout, stderr: "" };
}

function failure(exitCode: number, message: string): LifecycleCliResult {
  return {
    exitCode,
    stdout: "",
    stderr: `${message.trimEnd()}\n`,
  };
}

class LifecycleUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LifecycleUsageError";
  }
}
