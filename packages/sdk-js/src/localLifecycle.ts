import {
  type MigrationPlan,
  type MigrationPlanOptions,
  type MigrationRunOptions,
  type MigrationRunResult,
  type MigrationStep,
  type WorkspaceMetadata,
  planWorkspaceMetadataMigrations,
  runWorkspaceMetadataMigrations,
} from "../../workspace-store/src/index.ts";
import {
  type BackupManifest,
  type BackupValidationIssue,
  type BackupValidationResult,
  type RestoreMode,
  type RestorePlan,
  type RestorePlanOptions,
  BackupManifestValidationError,
  isWorkspaceId,
  planWorkspaceRestore,
  validateBackupManifest,
} from "../../workspace-backup/src/index.ts";
import {
  type InMemoryObservabilityCollectorOptions,
  type MetricRecordOptions,
  type MetricSnapshot,
  type StructuredEvent,
  type StructuredEventInput,
  createObservabilityCollector,
  InMemoryObservabilityCollector,
} from "../../observability/src/index.ts";
import {
  type DryRunCompactionPlan,
  type DryRunCompactionPlanOptions,
  createDryRunCompactionPlan,
} from "../../event-compaction/src/index.ts";
import {
  type AuditEventFilters,
  type AuditExportPackage,
  createAuditExportPackage,
} from "../../audit-export/src/index.ts";

const DEFAULT_LOCAL_TIMESTAMP = "1970-01-01T00:00:00.000Z";

export interface LocalMetadataMigrationPlanRequest<
  Metadata extends WorkspaceMetadata = WorkspaceMetadata,
> extends MigrationPlanOptions {
  readonly metadata: Metadata;
  readonly steps: readonly MigrationStep<Metadata>[];
}

export interface LocalMetadataMigrationRunRequest<
  Metadata extends WorkspaceMetadata = WorkspaceMetadata,
> extends MigrationRunOptions {
  readonly metadata: Metadata;
  readonly steps: readonly MigrationStep<Metadata>[];
}

export interface LocalBackupManifestValidationOptions {
  readonly workspaceId?: string;
}

export interface LocalBackupManifestSubmitRequest {
  readonly workspaceId: string;
  readonly manifest: unknown;
}

export interface LocalRestorePlanRequest
  extends Omit<RestorePlanOptions, "targetWorkspaceId" | "mode" | "now"> {
  readonly targetWorkspaceId: string;
  readonly manifest: unknown;
  readonly mode?: RestoreMode;
  readonly now?: string;
  readonly clock?: () => string;
}

export interface LocalObservabilityRecordOptions
  extends InMemoryObservabilityCollectorOptions {
  readonly collector?: InMemoryObservabilityCollector;
}

export interface LocalObservabilityMetricRecordInput
  extends MetricRecordOptions {
  readonly kind: MetricSnapshot["kind"];
  readonly name: string;
  readonly value: number;
}

export interface LocalCompactionPlanRequest
  extends Omit<DryRunCompactionPlanOptions, "createdAt"> {
  readonly events: readonly unknown[];
  readonly createdAt?: string;
  readonly clock?: () => string;
}

export interface LocalAuditExportPackageRequest {
  readonly events: readonly unknown[];
  readonly createdAt?: string;
  readonly exportId?: string;
  readonly filters?: AuditEventFilters;
  readonly clock?: () => string;
}

export function planLocalMetadataMigration<
  Metadata extends WorkspaceMetadata = WorkspaceMetadata,
>(
  input: LocalMetadataMigrationPlanRequest<Metadata>,
): MigrationPlan {
  return planWorkspaceMetadataMigrations(input.metadata, input.steps, {
    targetVersion: input.targetVersion,
  });
}

export function runLocalMetadataMigration<
  Metadata extends WorkspaceMetadata = WorkspaceMetadata,
>(
  input: LocalMetadataMigrationRunRequest<Metadata>,
): MigrationRunResult {
  return runWorkspaceMetadataMigrations(input.metadata, input.steps, {
    dryRun: input.dryRun,
    targetVersion: input.targetVersion,
  });
}

export function validateLocalBackupManifest(
  manifest: unknown,
  options: LocalBackupManifestValidationOptions = {},
): BackupValidationResult {
  const validation = validateBackupManifest(manifest);
  const issues: BackupValidationIssue[] = [];
  const workspaceId = options.workspaceId;
  const normalizedWorkspaceId =
    typeof workspaceId === "string" ? workspaceId.trim() : undefined;

  if (workspaceId !== undefined && !isWorkspaceId(workspaceId)) {
    issues.push({
      path: "workspaceId",
      message: "must use wsp_<slug> format",
    });
  }

  if (
    validation.ok &&
    normalizedWorkspaceId !== undefined &&
    validation.value.workspaceId !== normalizedWorkspaceId
  ) {
    issues.push({
      path: "$.workspaceId",
      message: `must match ${normalizedWorkspaceId}`,
    });
  }

  if (!validation.ok || issues.length > 0) {
    return {
      ok: false,
      issues: [
        ...(validation.ok ? [] : validation.issues),
        ...issues,
      ],
    };
  }

  return validation;
}

export function submitLocalBackupManifest(
  input: LocalBackupManifestSubmitRequest,
): BackupManifest {
  const validation = validateLocalBackupManifest(input.manifest, {
    workspaceId: input.workspaceId,
  });

  if (!validation.ok) {
    throw new BackupManifestValidationError(validation.issues);
  }

  return validation.value;
}

export function planLocalRestore(input: LocalRestorePlanRequest): RestorePlan {
  const {
    clock,
    manifest,
    targetWorkspaceId,
    ...options
  } = input;

  return planWorkspaceRestore(manifest, {
    ...options,
    targetWorkspaceId,
    now: options.now ?? clock?.() ?? DEFAULT_LOCAL_TIMESTAMP,
  });
}

export function createLocalObservabilityCollector(
  options: InMemoryObservabilityCollectorOptions = {},
): InMemoryObservabilityCollector {
  return createObservabilityCollector(options);
}

export function recordLocalObservabilityEvent(
  input: StructuredEventInput,
  options: LocalObservabilityRecordOptions = {},
): StructuredEvent {
  return resolveObservabilityCollector(options).recordEvent(input);
}

export function recordLocalObservabilityMetric(
  input: LocalObservabilityMetricRecordInput,
  options: LocalObservabilityRecordOptions = {},
): MetricSnapshot {
  const collector = resolveObservabilityCollector(options);
  const metricOptions = toMetricRecordOptions(input);

  if (input.kind === "counter") {
    return collector.incrementCounter(input.name, input.value, metricOptions);
  }
  if (input.kind === "gauge") {
    return collector.setGauge(input.name, input.value, metricOptions);
  }
  if (input.kind === "histogram") {
    return collector.recordHistogram(input.name, input.value, metricOptions);
  }

  throw new TypeError("metric kind must be counter, gauge, or histogram");
}

export function createLocalCompactionPlan(
  input: LocalCompactionPlanRequest,
): DryRunCompactionPlan {
  const {
    clock,
    events,
    ...options
  } = input;

  return createDryRunCompactionPlan(events, {
    ...options,
    createdAt: options.createdAt ?? clock?.() ?? DEFAULT_LOCAL_TIMESTAMP,
  });
}

export function buildLocalAuditExportPackage(
  input: LocalAuditExportPackageRequest,
): AuditExportPackage {
  const {
    clock,
    events,
    ...options
  } = input;

  return createAuditExportPackage(events, {
    ...options,
    createdAt: options.createdAt ?? clock?.() ?? DEFAULT_LOCAL_TIMESTAMP,
  });
}

function resolveObservabilityCollector(
  options: LocalObservabilityRecordOptions,
): InMemoryObservabilityCollector {
  if (options.collector !== undefined) {
    return options.collector;
  }

  const {
    collector: _collector,
    ...collectorOptions
  } = options;

  return createObservabilityCollector(collectorOptions);
}

function toMetricRecordOptions(
  input: LocalObservabilityMetricRecordInput,
): MetricRecordOptions {
  return optionalFields({
    attributes: input.attributes,
    buckets: input.buckets,
    description: input.description,
    timestamp: input.timestamp,
    unit: input.unit,
  });
}

function optionalFields<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T;
}
