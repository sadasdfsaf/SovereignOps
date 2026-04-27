export const WORKSPACE_METADATA_SCHEMA_VERSION = 1;

export const WORKSPACE_STORE_ERROR_CODES = Object.freeze({
  IDEMPOTENCY_GUARD_FAILED: "WORKSPACE_STORE_IDEMPOTENCY_GUARD_FAILED",
  INVALID_METADATA: "WORKSPACE_STORE_INVALID_METADATA",
  INVALID_MIGRATION_STEP: "WORKSPACE_STORE_INVALID_MIGRATION_STEP",
  INVALID_SCHEMA_VERSION: "WORKSPACE_STORE_INVALID_SCHEMA_VERSION",
  MIGRATION_FAILED: "WORKSPACE_STORE_MIGRATION_FAILED",
  MIGRATION_PATH_AMBIGUOUS: "WORKSPACE_STORE_MIGRATION_PATH_AMBIGUOUS",
  MIGRATION_PATH_NOT_FOUND: "WORKSPACE_STORE_MIGRATION_PATH_NOT_FOUND",
  MIGRATION_RESULT_INVALID: "WORKSPACE_STORE_MIGRATION_RESULT_INVALID",
  SERIALIZATION_INVALID: "WORKSPACE_STORE_SERIALIZATION_INVALID",
});

export type WorkspaceStoreErrorCode =
  (typeof WORKSPACE_STORE_ERROR_CODES)[keyof typeof WORKSPACE_STORE_ERROR_CODES];

export type JsonPrimitive = string | number | boolean | null;
export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? Readonly<{ [K in keyof T]: DeepReadonly<T[K]> }>
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

export interface WorkspaceStoreErrorOptions {
  readonly cause?: unknown;
  readonly details?: Readonly<Record<string, unknown>>;
}

export class WorkspaceStoreError extends Error {
  readonly code: WorkspaceStoreErrorCode;
  readonly details?: DeepReadonly<Record<string, unknown>>;

  constructor(
    code: WorkspaceStoreErrorCode,
    message: string,
    options: WorkspaceStoreErrorOptions = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "WorkspaceStoreError";
    this.code = code;
    this.details =
      options.details === undefined ? undefined : readOnlyClone(options.details);
  }
}

export class WorkspaceMetadataError extends WorkspaceStoreError {
  constructor(
    code: WorkspaceStoreErrorCode,
    message: string,
    options: WorkspaceStoreErrorOptions = {},
  ) {
    super(code, message, options);
    this.name = "WorkspaceMetadataError";
  }
}

export class MigrationPlanError extends WorkspaceStoreError {
  constructor(
    code: WorkspaceStoreErrorCode,
    message: string,
    options: WorkspaceStoreErrorOptions = {},
  ) {
    super(code, message, options);
    this.name = "MigrationPlanError";
  }
}

export class MigrationRunError extends WorkspaceStoreError {
  constructor(
    code: WorkspaceStoreErrorCode,
    message: string,
    options: WorkspaceStoreErrorOptions = {},
  ) {
    super(code, message, options);
    this.name = "MigrationRunError";
  }
}

export interface WorkspaceMetadata {
  readonly schemaVersion: number;
  readonly [key: string]: unknown;
}

export interface MigrationStepDescriptor {
  readonly id: string;
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly summary: string;
  readonly rollbackNote: string;
}

export interface MigrationContext {
  readonly dryRun: false;
  readonly sourceVersion: number;
  readonly targetVersion: number;
  readonly step: MigrationStepDescriptor;
}

export interface MigrationStep<Metadata extends WorkspaceMetadata = WorkspaceMetadata>
  extends MigrationStepDescriptor {
  readonly isApplied?: (metadata: DeepReadonly<Metadata>) => boolean;
  readonly migrate: (
    metadata: DeepReadonly<Metadata>,
    context: MigrationContext,
  ) => WorkspaceMetadata;
}

export interface MigrationPlanOptions {
  readonly targetVersion?: number;
}

export interface MigrationRunOptions extends MigrationPlanOptions {
  readonly dryRun?: boolean;
}

export interface MigrationPlanStep extends MigrationStepDescriptor {
  readonly fingerprint: string;
}

export interface MigrationPlanSummary {
  readonly sourceVersion: number;
  readonly targetVersion: number;
  readonly stepCount: number;
  readonly stepIds: readonly string[];
  readonly alreadyCurrent: boolean;
  readonly dryRun: true;
  readonly sourceFingerprint: string;
  readonly fingerprint: string;
}

export interface MigrationPlan {
  readonly sourceVersion: number;
  readonly targetVersion: number;
  readonly steps: readonly MigrationPlanStep[];
  readonly rollbackNotes: readonly string[];
  readonly alreadyCurrent: boolean;
  readonly dryRun: true;
  readonly summary: MigrationPlanSummary;
  readonly fingerprint: string;
}

export type MigrationAppliedStepStatus = "applied" | "skipped";

export interface MigrationAppliedStep extends MigrationStepDescriptor {
  readonly status: MigrationAppliedStepStatus;
  readonly fingerprintBefore: string;
  readonly fingerprintAfter: string;
}

export interface MigrationRunSummary {
  readonly sourceVersion: number;
  readonly targetVersion: number;
  readonly plannedStepCount: number;
  readonly appliedStepCount: number;
  readonly skippedStepCount: number;
  readonly dryRun: boolean;
  readonly sourceFingerprint: string;
  readonly targetFingerprint: string;
  readonly fingerprint: string;
}

export interface MigrationRunResult {
  readonly metadata: DeepReadonly<WorkspaceMetadata>;
  readonly plan: MigrationPlan;
  readonly appliedSteps: readonly MigrationAppliedStep[];
  readonly rollbackNotes: readonly string[];
  readonly summary: MigrationRunSummary;
  readonly fingerprint: string;
}

interface InternalMigrationPlan<Metadata extends WorkspaceMetadata> {
  readonly source: DeepReadonly<Metadata>;
  readonly publicPlan: MigrationPlan;
  readonly selectedSteps: readonly NormalizedMigrationStep<Metadata>[];
}

interface NormalizedMigrationStep<Metadata extends WorkspaceMetadata>
  extends MigrationStep<Metadata> {
  readonly id: string;
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly summary: string;
  readonly rollbackNote: string;
}

export function planWorkspaceMetadataMigrations<
  Metadata extends WorkspaceMetadata = WorkspaceMetadata,
>(
  metadata: Metadata,
  steps: readonly MigrationStep<Metadata>[],
  options: MigrationPlanOptions = {},
): MigrationPlan {
  return createInternalMigrationPlan(metadata, steps, options).publicPlan;
}

export function runWorkspaceMetadataMigrations<
  Metadata extends WorkspaceMetadata = WorkspaceMetadata,
>(
  metadata: Metadata,
  steps: readonly MigrationStep<Metadata>[],
  options: MigrationRunOptions = {},
): MigrationRunResult {
  const plan = createInternalMigrationPlan(metadata, steps, options);
  const dryRun = options.dryRun === true;

  if (dryRun) {
    const summary = createRunSummary(
      plan.publicPlan,
      [],
      plan.publicPlan.summary.sourceFingerprint,
      plan.publicPlan.summary.sourceFingerprint,
      true,
    );
    return readOnlyClone({
      metadata: plan.source,
      plan: plan.publicPlan,
      appliedSteps: [],
      rollbackNotes: plan.publicPlan.rollbackNotes,
      summary,
      fingerprint: summary.fingerprint,
    });
  }

  let current = cloneWorkspaceMetadata(plan.source, "metadata");
  const appliedSteps: MigrationAppliedStep[] = [];

  for (const step of plan.selectedSteps) {
    const beforeFingerprint = fingerprintWorkspaceMetadata(current);
    const stepView = toStepDescriptor(step);
    const alreadyApplied = evaluateIdempotencyGuard(step, current);

    if (alreadyApplied) {
      current = {
        ...cloneWorkspaceMetadata(current, "metadata"),
        schemaVersion: step.toVersion,
      };
      appliedSteps.push({
        ...stepView,
        status: "skipped",
        fingerprintBefore: beforeFingerprint,
        fingerprintAfter: fingerprintWorkspaceMetadata(current),
      });
      continue;
    }

    const migrated = runMigrationStep(step, current, {
      dryRun: false,
      sourceVersion: plan.publicPlan.sourceVersion,
      targetVersion: plan.publicPlan.targetVersion,
      step: stepView,
    });

    current = migrated;
    const afterFingerprint = fingerprintWorkspaceMetadata(current);
    appliedSteps.push({
      ...stepView,
      status: "applied",
      fingerprintBefore: beforeFingerprint,
      fingerprintAfter: afterFingerprint,
    });
  }

  const target = readOnlyClone(current);
  const summary = createRunSummary(
    plan.publicPlan,
    appliedSteps,
    plan.publicPlan.summary.sourceFingerprint,
    fingerprintWorkspaceMetadata(target),
    false,
  );

  return readOnlyClone({
    metadata: target,
    plan: plan.publicPlan,
    appliedSteps,
    rollbackNotes: plan.publicPlan.rollbackNotes,
    summary,
    fingerprint: summary.fingerprint,
  });
}

export function fingerprintWorkspaceMetadata(metadata: WorkspaceMetadata): string {
  const normalized = readWorkspaceMetadata(metadata, "metadata");
  return createFingerprint({
    kind: "workspace-metadata",
    metadata: normalized,
  });
}

export function serializeDeterministicJson(value: unknown): string {
  return stringifyStable(value, "", new WeakSet<object>());
}

function createInternalMigrationPlan<Metadata extends WorkspaceMetadata>(
  metadata: Metadata,
  steps: readonly MigrationStep<Metadata>[],
  options: MigrationPlanOptions,
): InternalMigrationPlan<Metadata> {
  const source = readWorkspaceMetadata(metadata, "metadata") as DeepReadonly<Metadata>;
  const normalizedSteps = normalizeMigrationSteps(steps);
  const targetVersion = resolveTargetVersion(
    options.targetVersion,
    normalizedSteps,
    source.schemaVersion,
  );

  if (source.schemaVersion > targetVersion) {
    throw new MigrationPlanError(
      WORKSPACE_STORE_ERROR_CODES.MIGRATION_PATH_NOT_FOUND,
      "metadata schema version is newer than the requested target version",
      {
        details: {
          sourceVersion: source.schemaVersion,
          targetVersion,
        },
      },
    );
  }

  const selectedSteps = selectMigrationSteps(
    normalizedSteps,
    source.schemaVersion,
    targetVersion,
  );
  const publicPlan = createPublicPlan(source, targetVersion, selectedSteps);

  return {
    source,
    publicPlan,
    selectedSteps,
  };
}

function normalizeMigrationSteps<Metadata extends WorkspaceMetadata>(
  steps: readonly MigrationStep<Metadata>[],
): readonly NormalizedMigrationStep<Metadata>[] {
  if (!Array.isArray(steps)) {
    throw new MigrationPlanError(
      WORKSPACE_STORE_ERROR_CODES.INVALID_MIGRATION_STEP,
      "migration steps must be an array",
      { details: { path: "steps" } },
    );
  }

  const ids = new Set<string>();
  return steps.map((step, index) => {
    if (!isRecord(step)) {
      throw invalidMigrationStep("migration step must be an object", index);
    }

    const id = requireCleanString(step.id, `steps.${index}.id`);
    if (ids.has(id)) {
      throw new MigrationPlanError(
        WORKSPACE_STORE_ERROR_CODES.INVALID_MIGRATION_STEP,
        "migration step ids must be unique",
        { details: { id, path: `steps.${index}.id` } },
      );
    }
    ids.add(id);

    const fromVersion = readSchemaVersion(step.fromVersion, `steps.${index}.fromVersion`);
    const toVersion = readSchemaVersion(step.toVersion, `steps.${index}.toVersion`);
    if (toVersion <= fromVersion) {
      throw new MigrationPlanError(
        WORKSPACE_STORE_ERROR_CODES.INVALID_MIGRATION_STEP,
        "migration step must advance the schema version",
        {
          details: {
            id,
            fromVersion,
            toVersion,
          },
        },
      );
    }

    const summary = requireCleanString(step.summary, `steps.${index}.summary`);
    const rollbackNote = requireCleanString(
      step.rollbackNote,
      `steps.${index}.rollbackNote`,
    );

    if (typeof step.migrate !== "function") {
      throw invalidMigrationStep("migration step migrate must be a function", index, id);
    }

    if (step.isApplied !== undefined && typeof step.isApplied !== "function") {
      throw invalidMigrationStep("migration step isApplied must be a function", index, id);
    }

    return {
      ...step,
      id,
      fromVersion,
      toVersion,
      summary,
      rollbackNote,
    };
  }).sort(compareMigrationSteps);
}

function selectMigrationSteps<Metadata extends WorkspaceMetadata>(
  steps: readonly NormalizedMigrationStep<Metadata>[],
  sourceVersion: number,
  targetVersion: number,
): readonly NormalizedMigrationStep<Metadata>[] {
  const selected: NormalizedMigrationStep<Metadata>[] = [];
  let version = sourceVersion;

  while (version < targetVersion) {
    const candidates = steps.filter(
      (step) => step.fromVersion === version && step.toVersion <= targetVersion,
    );

    if (candidates.length === 0) {
      throw new MigrationPlanError(
        WORKSPACE_STORE_ERROR_CODES.MIGRATION_PATH_NOT_FOUND,
        "no migration step connects the current schema version to the target version",
        {
          details: {
            fromVersion: version,
            targetVersion,
          },
        },
      );
    }

    if (candidates.length > 1) {
      throw new MigrationPlanError(
        WORKSPACE_STORE_ERROR_CODES.MIGRATION_PATH_AMBIGUOUS,
        "multiple migration steps start from the same schema version",
        {
          details: {
            fromVersion: version,
            stepIds: candidates.map((step) => step.id),
          },
        },
      );
    }

    const [step] = candidates;
    selected.push(step);
    version = step.toVersion;
  }

  return selected;
}

function createPublicPlan<Metadata extends WorkspaceMetadata>(
  source: DeepReadonly<Metadata>,
  targetVersion: number,
  steps: readonly NormalizedMigrationStep<Metadata>[],
): MigrationPlan {
  const planSteps = steps.map((step) => {
    const descriptor = toStepDescriptor(step);
    return {
      ...descriptor,
      fingerprint: createFingerprint({
        kind: "workspace-metadata-migration-step",
        step: descriptor,
      }),
    };
  });
  const rollbackNotes = planSteps
    .map((step) => step.rollbackNote)
    .reverse();
  const sourceFingerprint = fingerprintWorkspaceMetadata(source);
  const summaryPayload = {
    alreadyCurrent: planSteps.length === 0,
    dryRun: true,
    sourceFingerprint,
    sourceVersion: source.schemaVersion,
    stepCount: planSteps.length,
    stepIds: planSteps.map((step) => step.id),
    targetVersion,
  };
  const fingerprint = createFingerprint({
    kind: "workspace-metadata-migration-plan",
    rollbackNotes,
    summary: summaryPayload,
  });
  const summary: MigrationPlanSummary = {
    ...summaryPayload,
    fingerprint,
  };

  return readOnlyClone({
    sourceVersion: source.schemaVersion,
    targetVersion,
    steps: planSteps,
    rollbackNotes,
    alreadyCurrent: planSteps.length === 0,
    dryRun: true,
    summary,
    fingerprint,
  });
}

function createRunSummary(
  plan: MigrationPlan,
  appliedSteps: readonly MigrationAppliedStep[],
  sourceFingerprint: string,
  targetFingerprint: string,
  dryRun: boolean,
): MigrationRunSummary {
  const appliedStepCount = appliedSteps.filter((step) => step.status === "applied").length;
  const skippedStepCount = appliedSteps.filter((step) => step.status === "skipped").length;
  const summaryPayload = {
    appliedStepCount,
    dryRun,
    plannedStepCount: plan.steps.length,
    skippedStepCount,
    sourceFingerprint,
    sourceVersion: plan.sourceVersion,
    targetFingerprint,
    targetVersion: plan.targetVersion,
  };

  return {
    ...summaryPayload,
    fingerprint: createFingerprint({
      kind: "workspace-metadata-migration-run",
      planFingerprint: plan.fingerprint,
      steps: appliedSteps,
      summary: summaryPayload,
    }),
  };
}

function runMigrationStep<Metadata extends WorkspaceMetadata>(
  step: NormalizedMigrationStep<Metadata>,
  current: WorkspaceMetadata,
  context: MigrationContext,
): WorkspaceMetadata {
  let result: WorkspaceMetadata;
  try {
    result = step.migrate(readOnlyClone(current) as DeepReadonly<Metadata>, context);
  } catch (cause) {
    throw new MigrationRunError(
      WORKSPACE_STORE_ERROR_CODES.MIGRATION_FAILED,
      "migration step failed",
      {
        cause,
        details: {
          id: step.id,
          fromVersion: step.fromVersion,
          toVersion: step.toVersion,
        },
      },
    );
  }

  const migrated = readWorkspaceMetadata(result, `migration:${step.id}`);
  if (migrated.schemaVersion !== step.toVersion) {
    throw new MigrationRunError(
      WORKSPACE_STORE_ERROR_CODES.MIGRATION_RESULT_INVALID,
      "migration step returned the wrong schema version",
      {
        details: {
          id: step.id,
          expectedVersion: step.toVersion,
          actualVersion: migrated.schemaVersion,
        },
      },
    );
  }

  if (step.isApplied !== undefined && !evaluateIdempotencyGuard(step, migrated)) {
    throw new MigrationRunError(
      WORKSPACE_STORE_ERROR_CODES.IDEMPOTENCY_GUARD_FAILED,
      "migration step completed but its idempotency guard did not match",
      {
        details: {
          id: step.id,
          toVersion: step.toVersion,
        },
      },
    );
  }

  return cloneWorkspaceMetadata(migrated, `migration:${step.id}`);
}

function evaluateIdempotencyGuard<Metadata extends WorkspaceMetadata>(
  step: NormalizedMigrationStep<Metadata>,
  metadata: WorkspaceMetadata,
): boolean {
  if (step.isApplied === undefined) {
    return false;
  }

  try {
    return step.isApplied(readOnlyClone(metadata) as DeepReadonly<Metadata>) === true;
  } catch (cause) {
    throw new MigrationRunError(
      WORKSPACE_STORE_ERROR_CODES.IDEMPOTENCY_GUARD_FAILED,
      "migration step idempotency guard failed",
      {
        cause,
        details: {
          id: step.id,
          fromVersion: step.fromVersion,
          toVersion: step.toVersion,
        },
      },
    );
  }
}

function resolveTargetVersion<Metadata extends WorkspaceMetadata>(
  requestedTargetVersion: number | undefined,
  steps: readonly NormalizedMigrationStep<Metadata>[],
  sourceVersion: number,
): number {
  if (requestedTargetVersion !== undefined) {
    return readSchemaVersion(requestedTargetVersion, "targetVersion");
  }

  return Math.max(
    WORKSPACE_METADATA_SCHEMA_VERSION,
    sourceVersion,
    ...steps.map((step) => step.toVersion),
  );
}

function readWorkspaceMetadata<Metadata extends WorkspaceMetadata>(
  value: Metadata,
  label: string,
): DeepReadonly<Metadata> {
  if (!isPlainRecord(value)) {
    throw new WorkspaceMetadataError(
      WORKSPACE_STORE_ERROR_CODES.INVALID_METADATA,
      "workspace metadata must be a plain object",
      { details: { path: label } },
    );
  }

  readSchemaVersion(value.schemaVersion, `${label}.schemaVersion`);
  return readOnlyClone(value);
}

function cloneWorkspaceMetadata<Metadata extends WorkspaceMetadata>(
  value: Metadata,
  label: string,
): Metadata {
  try {
    const cloned = structuredClone(value) as Metadata;
    readSchemaVersion(cloned.schemaVersion, `${label}.schemaVersion`);
    return cloned;
  } catch (cause) {
    if (cause instanceof WorkspaceStoreError) {
      throw cause;
    }
    throw new WorkspaceMetadataError(
      WORKSPACE_STORE_ERROR_CODES.INVALID_METADATA,
      "workspace metadata must be structured-cloneable",
      { cause, details: { path: label } },
    );
  }
}

function readSchemaVersion(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new WorkspaceMetadataError(
      WORKSPACE_STORE_ERROR_CODES.INVALID_SCHEMA_VERSION,
      "schema version must be a non-negative integer",
      {
        details: {
          path,
          value,
        },
      },
    );
  }

  return value as number;
}

function requireCleanString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value !== value.trim()) {
    throw new MigrationPlanError(
      WORKSPACE_STORE_ERROR_CODES.INVALID_MIGRATION_STEP,
      "migration step fields must be non-empty strings without surrounding whitespace",
      {
        details: {
          path,
          value,
        },
      },
    );
  }

  return value;
}

function invalidMigrationStep(
  message: string,
  index: number,
  id?: string,
): MigrationPlanError {
  return new MigrationPlanError(
    WORKSPACE_STORE_ERROR_CODES.INVALID_MIGRATION_STEP,
    message,
    {
      details: {
        id,
        path: `steps.${index}`,
      },
    },
  );
}

function toStepDescriptor(step: MigrationStepDescriptor): MigrationStepDescriptor {
  return {
    id: step.id,
    fromVersion: step.fromVersion,
    toVersion: step.toVersion,
    summary: step.summary,
    rollbackNote: step.rollbackNote,
  };
}

function createFingerprint(value: unknown): string {
  const serialized = serializeDeterministicJson(value);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;

  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= BigInt(serialized.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }

  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

function stringifyStable(value: unknown, path: string, seen: WeakSet<object>): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw serializationError("numbers must be finite", path);
    }
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw serializationError("values must not contain circular references", path);
    }
    seen.add(value);
    const serialized = `[${value
      .map((item, index) => stringifyStable(item, `${path}.${index}`, seen))
      .join(",")}]`;
    seen.delete(value);
    return serialized;
  }

  if (isRecord(value)) {
    if (!isPlainRecord(value)) {
      throw serializationError("objects must be plain records", path);
    }

    if (seen.has(value)) {
      throw serializationError("values must not contain circular references", path);
    }
    seen.add(value);

    const entries = Object.entries(value)
      .sort(([left], [right]) => compareStrings(left, right))
      .map(([key, nested]) => {
        const nestedPath = path.length === 0 ? key : `${path}.${key}`;
        return `${JSON.stringify(key)}:${stringifyStable(nested, nestedPath, seen)}`;
      });

    seen.delete(value);
    return `{${entries.join(",")}}`;
  }

  throw serializationError("value must be JSON-compatible", path);
}

function serializationError(message: string, path: string): WorkspaceMetadataError {
  return new WorkspaceMetadataError(
    WORKSPACE_STORE_ERROR_CODES.SERIALIZATION_INVALID,
    message,
    {
      details: {
        path,
      },
    },
  );
}

function readOnlyClone<T>(value: T): DeepReadonly<T> {
  try {
    return deepFreeze(structuredClone(value)) as DeepReadonly<T>;
  } catch (cause) {
    if (cause instanceof WorkspaceStoreError) {
      throw cause;
    }
    throw new WorkspaceMetadataError(
      WORKSPACE_STORE_ERROR_CODES.INVALID_METADATA,
      "value must be structured-cloneable",
      { cause },
    );
  }
}

function deepFreeze<T>(value: T): T {
  if (!isRecord(value) && !Array.isArray(value)) {
    return value;
  }

  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }

  return Object.freeze(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function compareMigrationSteps<Metadata extends WorkspaceMetadata>(
  left: NormalizedMigrationStep<Metadata>,
  right: NormalizedMigrationStep<Metadata>,
): number {
  return (
    left.fromVersion - right.fromVersion ||
    left.toVersion - right.toVersion ||
    compareStrings(left.id, right.id)
  );
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
