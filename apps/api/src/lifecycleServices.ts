import type {
  LifecycleHandler,
  LifecycleRouteHandlers,
  RestorePlanLifecycleRequest,
  WorkspaceLifecycleRequest,
} from "./lifecycleRoutes.ts";
import { LifecycleRouteError } from "./lifecycleRoutes.ts";
import {
  type MigrationStep,
  type WorkspaceMetadata,
  WorkspaceStoreError,
  planWorkspaceMetadataMigrations,
  runWorkspaceMetadataMigrations,
} from "../../../packages/workspace-store/src/index.ts";
import {
  BackupManifestValidationError,
  type RestoreMode,
  planWorkspaceRestore,
  validateBackupManifest,
} from "../../../packages/workspace-backup/src/index.ts";
import {
  type InMemoryObservabilityCollectorOptions,
  type MetricRecordOptions,
  createObservabilityCollector,
} from "../../../packages/observability/src/index.ts";
import {
  EventCompactionError,
  createDryRunCompactionPlan,
} from "../../../packages/event-compaction/src/index.ts";

type LifecycleRecord = Readonly<Record<string, unknown>>;

export interface DefaultLifecycleHandlersOptions {
  readonly migrationSteps?: readonly MigrationStep[];
  readonly observabilityCollectorOptions?: InMemoryObservabilityCollectorOptions;
}

export function createDefaultLifecycleHandlers(
  options: DefaultLifecycleHandlersOptions = {},
): LifecycleRouteHandlers {
  const migrationSteps = options.migrationSteps ?? [];
  const observability = createObservabilityCollector(
    options.observabilityCollectorOptions,
  );

  return {
    planMigration: withLifecycleErrors("migration_plan_failed", (request) => {
      const metadata = readWorkspaceMetadataRequest(request);
      return planWorkspaceMetadataMigrations(metadata, migrationSteps, {
        targetVersion: readOptionalNonNegativeInteger(request, "targetVersion"),
      });
    }),

    runMigration: withLifecycleErrors("migration_run_failed", (request) => {
      const metadata = readWorkspaceMetadataRequest(request);
      return runWorkspaceMetadataMigrations(metadata, migrationSteps, {
        dryRun: readOptionalBoolean(request, "dryRun") ?? false,
        targetVersion: readOptionalNonNegativeInteger(request, "targetVersion"),
      });
    }),

    submitBackupManifest: withLifecycleErrors(
      "backup_manifest_submit_failed",
      (request) => {
        const manifest = readRequiredField(request, "manifest");
        const validation = validateBackupManifest(manifest);
        if (!validation.ok) {
          throw new LifecycleRouteError(
            422,
            "backup_manifest_invalid",
            "Backup manifest validation failed.",
            { issues: validation.issues },
          );
        }

        if (validation.value.workspaceId !== request.workspaceId) {
          throw new LifecycleRouteError(
            400,
            "validation_failed",
            "Backup manifest workspaceId must match the route parameter.",
            { path: "body.manifest.workspaceId" },
          );
        }

        return validation.value;
      },
    ),

    planRestore: withLifecycleErrors("restore_plan_failed", (request) => {
      return planWorkspaceRestore(readRequiredField(request, "manifest"), {
        targetWorkspaceId: request.targetWorkspaceId,
        mode: readOptionalRestoreMode(request, "mode"),
        allowSourceWorkspaceOverwrite: readOptionalBoolean(
          request,
          "allowSourceWorkspaceOverwrite",
        ),
        allowDestructiveRestore: readOptionalBoolean(
          request,
          "allowDestructiveRestore",
        ),
        trustedManifestFingerprints: readOptionalStringArray(
          request,
          "trustedManifestFingerprints",
        ),
        availablePayloadIds: readOptionalStringArray(
          request,
          "availablePayloadIds",
        ),
        maxManifestAgeDays: readOptionalNonNegativeInteger(
          request,
          "maxManifestAgeDays",
        ),
        now: readOptionalString(request, "now"),
        includePayloadIds: readOptionalStringArray(request, "includePayloadIds"),
        excludePayloadIds: readOptionalStringArray(request, "excludePayloadIds"),
        existingPayloadFingerprints: readOptionalStringRecord(
          request,
          "existingPayloadFingerprints",
        ),
      });
    }),

    submitObservabilityEvent: withLifecycleErrors(
      "observability_event_submit_failed",
      (request) => observability.recordEvent(request),
    ),

    submitObservabilityMetric: withLifecycleErrors(
      "observability_metric_submit_failed",
      (request) => {
        const name = readRequiredString(request, "name");
        const options = readMetricOptions(request);

        switch (request.kind) {
          case "counter":
            return observability.incrementCounter(
              name,
              readOptionalFiniteNumber(request, "value") ?? 1,
              options,
            );
          case "gauge":
            return observability.setGauge(
              name,
              readRequiredFiniteNumber(request, "value"),
              options,
            );
          case "histogram":
            return observability.recordHistogram(
              name,
              readHistogramObservation(request),
              options,
            );
          default:
            throw new LifecycleRouteError(
              400,
              "validation_failed",
              "Observability metric kind must be counter, gauge, or histogram.",
              { path: "body.kind" },
            );
        }
      },
    ),

    planCompaction: withLifecycleErrors("compaction_plan_failed", (request) => {
      const fromSequence = readRequiredPositiveInteger(request, "fromSequence");
      const toSequence = readRequiredPositiveInteger(request, "toSequence");
      if (toSequence < fromSequence) {
        throw new LifecycleRouteError(
          400,
          "validation_failed",
          "Compaction toSequence must be greater than or equal to fromSequence.",
          { path: "body.toSequence" },
        );
      }

      const sourceEventCount = readRequiredNonNegativeInteger(
        request,
        "sourceEventCount",
      );
      const expectedEventCount = toSequence - fromSequence + 1;
      if (sourceEventCount !== expectedEventCount) {
        throw new LifecycleRouteError(
          422,
          "compaction_plan_invalid",
          "Compaction sourceEventCount must match the inclusive sequence range.",
          {
            expectedEventCount,
            sourceEventCount,
          },
        );
      }

      const reducerVersion = readRequiredString(request, "reducerVersion");
      const events = createSyntheticCompactionEvents({
        fromSequence,
        reducerVersion,
        toSequence,
        workspaceId: request.workspaceId,
      });
      const dryRunPlan = createDryRunCompactionPlan(events, {
        compactThroughSequence: toSequence,
        createdAt: readOptionalString(request, "createdAt"),
        maxEventsPerRange: sourceEventCount,
        minimumEventsPerCheckpoint: 1,
        planId: readOptionalString(request, "planId"),
        streamId: compactionStreamId(request.workspaceId),
      });
      const checkpointFingerprint = readOptionalString(
        request,
        "checkpointFingerprint",
      ) ?? dryRunPlan.checkpointDescriptors.at(-1)?.fingerprint
        ?? dryRunPlan.fingerprint;

      return {
        workspaceId: request.workspaceId,
        fromSequence,
        toSequence,
        reducerVersion,
        checkpointFingerprint,
        sourceEventCount: dryRunPlan.eventCount,
        compactedByteCount: estimateCompactedByteCount(
          request,
          dryRunPlan.compactedEventCount,
        ),
        dryRun: true,
        rollbackNote: `Restore uncompacted event segment ${fromSequence}-${toSequence}`,
        fingerprint: dryRunPlan.fingerprint,
      };
    }),
  };
}

function withLifecycleErrors<TRequest extends LifecycleRecord, TBody>(
  fallbackCode: string,
  handler: LifecycleHandler<TRequest, TBody>,
): LifecycleHandler<TRequest, TBody> {
  return (request, context) => {
    try {
      const result = handler(request, context);
      return isPromiseLike(result)
        ? result.catch((error: unknown) => {
            throw toLifecycleRouteError(error, fallbackCode);
          })
        : result;
    } catch (error) {
      throw toLifecycleRouteError(error, fallbackCode);
    }
  };
}

function toLifecycleRouteError(error: unknown, fallbackCode: string): LifecycleRouteError {
  if (error instanceof LifecycleRouteError) {
    return error;
  }

  if (error instanceof BackupManifestValidationError) {
    return new LifecycleRouteError(
      422,
      "backup_manifest_invalid",
      "Backup manifest validation failed.",
      { issues: error.issues },
    );
  }

  if (error instanceof WorkspaceStoreError) {
    return new LifecycleRouteError(
      422,
      error.code,
      error.message,
      sanitizeErrorDetails(error.details),
    );
  }

  if (error instanceof EventCompactionError) {
    return new LifecycleRouteError(
      422,
      error.code,
      error.message,
      sanitizeErrorDetails(error.details),
    );
  }

  if (error instanceof TypeError || error instanceof Error) {
    return new LifecycleRouteError(
      400,
      fallbackCode,
      error.message,
      sanitizeErrorDetails(readErrorDetails(error)),
    );
  }

  return new LifecycleRouteError(
    500,
    fallbackCode,
    "Lifecycle service handler failed.",
  );
}

function readWorkspaceMetadataRequest(
  request: WorkspaceLifecycleRequest,
): WorkspaceMetadata {
  const metadata = readRequiredField(request, "metadata");
  if (!isPlainRecord(metadata)) {
    throw new LifecycleRouteError(
      400,
      "validation_failed",
      "Migration metadata must be an object.",
      { path: "body.metadata" },
    );
  }

  return metadata as WorkspaceMetadata;
}

function readMetricOptions(request: LifecycleRecord): MetricRecordOptions {
  return {
    timestamp: readOptionalString(request, "updatedAt")
      ?? readOptionalString(request, "timestamp"),
    unit: readOptionalString(request, "unit"),
    description: readOptionalString(request, "description"),
    attributes: readOptionalRecord(request, "attributes") ?? {},
    buckets: readOptionalNumberArray(request, "buckets"),
  };
}

function readHistogramObservation(request: LifecycleRecord): number {
  const value = readOptionalFiniteNumber(request, "value");
  if (value !== undefined) {
    return value;
  }

  const sum = readRequiredFiniteNumber(request, "sum");
  const count = readRequiredPositiveInteger(request, "count");
  return sum / count;
}

function createSyntheticCompactionEvents(input: {
  readonly workspaceId: string;
  readonly fromSequence: number;
  readonly toSequence: number;
  readonly reducerVersion: string;
}): readonly Record<string, unknown>[] {
  const streamId = compactionStreamId(input.workspaceId);
  const events: Record<string, unknown>[] = [];

  for (
    let sequence = input.fromSequence;
    sequence <= input.toSequence;
    sequence += 1
  ) {
    events.push({
      eventId: `evt_${input.workspaceId}_${String(sequence).padStart(6, "0")}`,
      streamId,
      sequence,
      type: "workspace.compaction_source",
      timestamp: new Date(Date.UTC(2026, 3, 27, 0, 0, sequence)).toISOString(),
      payload: {
        reducerVersion: input.reducerVersion,
        workspaceId: input.workspaceId,
      },
      metadata: {
        source: "api.lifecycle",
      },
    });
  }

  return events;
}

function compactionStreamId(workspaceId: string): string {
  return `stream_${workspaceId}`;
}

function estimateCompactedByteCount(
  request: LifecycleRecord,
  compactedEventCount: number,
): number {
  const sourceByteCount = readOptionalNonNegativeInteger(request, "sourceByteCount");
  const sourceEventCount = readRequiredNonNegativeInteger(request, "sourceEventCount");
  const targetByteLimit = readOptionalNonNegativeInteger(request, "targetByteLimit");

  const estimated = sourceByteCount === undefined || sourceEventCount === 0
    ? compactedEventCount * 64
    : Math.ceil((sourceByteCount * compactedEventCount) / sourceEventCount);

  return targetByteLimit === undefined ? estimated : Math.min(estimated, targetByteLimit);
}

function readRequiredField(
  record: LifecycleRecord,
  field: string,
): unknown {
  if (!Object.hasOwn(record, field)) {
    throw new LifecycleRouteError(
      400,
      "validation_failed",
      `Request ${field} is required.`,
      { path: `body.${field}` },
    );
  }

  return record[field];
}

function readOptionalString(
  record: LifecycleRecord,
  field: string,
): string | undefined {
  const value = record[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new LifecycleRouteError(
      400,
      "validation_failed",
      `Request ${field} must be a non-empty string.`,
      { path: `body.${field}` },
    );
  }

  return value;
}

function readRequiredString(record: LifecycleRecord, field: string): string {
  readRequiredField(record, field);
  return readOptionalString(record, field) as string;
}

function readOptionalBoolean(
  record: LifecycleRecord,
  field: string,
): boolean | undefined {
  const value = record[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new LifecycleRouteError(
      400,
      "validation_failed",
      `Request ${field} must be a boolean.`,
      { path: `body.${field}` },
    );
  }

  return value;
}

function readRequiredFiniteNumber(record: LifecycleRecord, field: string): number {
  readRequiredField(record, field);
  return readOptionalFiniteNumber(record, field) as number;
}

function readOptionalFiniteNumber(
  record: LifecycleRecord,
  field: string,
): number | undefined {
  const value = record[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new LifecycleRouteError(
      400,
      "validation_failed",
      `Request ${field} must be a finite number.`,
      { path: `body.${field}` },
    );
  }

  return value;
}

function readRequiredPositiveInteger(
  record: LifecycleRecord,
  field: string,
): number {
  const value = readRequiredNonNegativeInteger(record, field);
  if (value <= 0) {
    throw new LifecycleRouteError(
      400,
      "validation_failed",
      `Request ${field} must be greater than zero.`,
      { path: `body.${field}` },
    );
  }

  return value;
}

function readRequiredNonNegativeInteger(
  record: LifecycleRecord,
  field: string,
): number {
  readRequiredField(record, field);
  return readOptionalNonNegativeInteger(record, field) as number;
}

function readOptionalNonNegativeInteger(
  record: LifecycleRecord,
  field: string,
): number | undefined {
  const value = record[field];
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new LifecycleRouteError(
      400,
      "validation_failed",
      `Request ${field} must be a non-negative integer.`,
      { path: `body.${field}` },
    );
  }

  return value as number;
}

function readOptionalRestoreMode(
  record: RestorePlanLifecycleRequest,
  field: string,
): RestoreMode | undefined {
  const value = readOptionalString(record, field);
  if (value === undefined) {
    return undefined;
  }
  if (value !== "preview" && value !== "merge" && value !== "replace") {
    throw new LifecycleRouteError(
      400,
      "validation_failed",
      "Restore mode must be preview, merge, or replace.",
      { path: `body.${field}` },
    );
  }

  return value;
}

function readOptionalStringArray(
  record: LifecycleRecord,
  field: string,
): readonly string[] | undefined {
  const value = record[field];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new LifecycleRouteError(
      400,
      "validation_failed",
      `Request ${field} must be an array.`,
      { path: `body.${field}` },
    );
  }

  return value.map((item, index) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new LifecycleRouteError(
        400,
        "validation_failed",
        `Request ${field} entries must be non-empty strings.`,
        { path: `body.${field}.${index}` },
      );
    }

    return item;
  });
}

function readOptionalNumberArray(
  record: LifecycleRecord,
  field: string,
): readonly number[] | undefined {
  const value = record[field];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new LifecycleRouteError(
      400,
      "validation_failed",
      `Request ${field} must be an array.`,
      { path: `body.${field}` },
    );
  }

  return value.map((item, index) => {
    if (typeof item !== "number" || !Number.isFinite(item)) {
      throw new LifecycleRouteError(
        400,
        "validation_failed",
        `Request ${field} entries must be finite numbers.`,
        { path: `body.${field}.${index}` },
      );
    }

    return item;
  });
}

function readOptionalStringRecord(
  record: LifecycleRecord,
  field: string,
): Readonly<Record<string, string>> | undefined {
  const value = record[field];
  if (value === undefined) {
    return undefined;
  }
  if (!isPlainRecord(value)) {
    throw new LifecycleRouteError(
      400,
      "validation_failed",
      `Request ${field} must be an object.`,
      { path: `body.${field}` },
    );
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => {
      if (key.trim().length === 0 || typeof nested !== "string" || nested.trim().length === 0) {
        throw new LifecycleRouteError(
          400,
          "validation_failed",
          `Request ${field} values must be non-empty strings.`,
          { path: `body.${field}.${key}` },
        );
      }

      return [key, nested];
    }),
  );
}

function readOptionalRecord(
  record: LifecycleRecord,
  field: string,
): Record<string, unknown> | undefined {
  const value = record[field];
  if (value === undefined) {
    return undefined;
  }
  if (!isPlainRecord(value)) {
    throw new LifecycleRouteError(
      400,
      "validation_failed",
      `Request ${field} must be an object.`,
      { path: `body.${field}` },
    );
  }

  return value;
}

function readErrorDetails(error: Error): Readonly<Record<string, unknown>> | undefined {
  const details = (error as { readonly details?: unknown }).details;
  return isPlainRecord(details)
    ? details
    : undefined;
}

function sanitizeErrorDetails(
  details: unknown,
): Readonly<Record<string, unknown>> | undefined {
  if (!isPlainRecord(details)) {
    return undefined;
  }

  return sanitizeDetailsRecord(details);
}

function sanitizeDetailsRecord(
  record: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      shouldRedactDetailKey(key) ? "[REDACTED]" : sanitizeDetailValue(value),
    ]),
  );
}

function sanitizeDetailValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeDetailValue);
  }
  if (isPlainRecord(value)) {
    return sanitizeDetailsRecord(value);
  }

  return value;
}

function shouldRedactDetailKey(key: string): boolean {
  return /^(value|input|payload|metadata|manifest|event|events)$/i.test(key);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isPromiseLike<TValue>(
  value: TValue | Promise<TValue>,
): value is Promise<TValue> {
  return typeof (value as { readonly then?: unknown }).then === "function";
}
