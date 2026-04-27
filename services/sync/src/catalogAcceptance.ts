import type { ValidationIssue } from "./bundles.ts";
import {
  createCatalogImportPlan,
  reconcileEventReplayCatalog,
  type CatalogImportErrorCode,
  type CatalogImportPlanSummary,
  type CatalogImportReconciliationIssueCode,
  type CatalogImportReconciliationSummary,
} from "./catalogImport.ts";
import { CURSOR_VERSION, parseCursor } from "./cursors.ts";
import {
  createEventReplayCatalog,
  validateEventReplayCatalog,
  type EventReplayCatalog,
  type EventReplayCatalogSummary,
  type ValidatedEventReplayCatalogInput,
} from "./eventCatalog.ts";
import type { ReplayIntegritySummary } from "./replay.ts";
import type { SyncBundleRepository } from "./repository.ts";

export type CatalogAcceptanceStatus = "ready" | "blocked";

export type CatalogFixtureReadinessCode =
  | "ready"
  | "validation_failed"
  | "replay_integrity";

export type CatalogImportPlanStatusCode =
  | "ready"
  | CatalogImportErrorCode
  | "replay_integrity";

export type CatalogAcceptanceRiskCode =
  | "validation_failed"
  | "replay_integrity"
  | CatalogImportReconciliationIssueCode;

export interface CatalogAcceptanceValidationSummary {
  status: "passed" | "failed";
  issueCount: number;
  issues: ValidationIssue[];
}

export interface CatalogFixtureExportReadinessSummary {
  status: CatalogAcceptanceStatus;
  workspaceId: string;
  deviceId: string;
  baseCursor: string;
  nextCursor: string;
  digest: `sha256:${string}`;
  eventCount: number;
  firstEventDigest?: string;
  lastEventDigest?: string;
  replayIntegrity: ReplayIntegritySummary;
  replay: EventReplayCatalogSummary;
}

export interface CatalogFixtureReadinessSummary {
  status: CatalogAcceptanceStatus;
  code: CatalogFixtureReadinessCode;
  validation: CatalogAcceptanceValidationSummary;
  exportReadiness?: CatalogFixtureExportReadinessSummary;
}

export interface CatalogImportPlanStatusSummary {
  status: CatalogAcceptanceStatus;
  code: CatalogImportPlanStatusCode;
  message?: string;
  eventCount: number;
  plan?: CatalogImportPlanSummary;
  validation?: CatalogAcceptanceValidationSummary;
  reconciliation?: CatalogImportReconciliationSummary;
}

export interface CatalogAcceptanceRisk {
  code: CatalogAcceptanceRiskCode;
  severity: "blocking";
  message: string;
  path?: string;
  eventId?: string;
  baseCursor?: string;
  remoteCursor?: string;
}

export interface CatalogAcceptanceRiskSummary {
  status: CatalogAcceptanceStatus;
  riskCount: number;
  codes: CatalogAcceptanceRiskCode[];
  duplicateEventCount: number;
  cursorRiskCount: number;
  duplicateEventRisk: boolean;
  staleCursorRisk: boolean;
  futureCursorRisk: boolean;
  risks: CatalogAcceptanceRisk[];
  reconciliation?: CatalogImportReconciliationSummary;
}

export interface CatalogAcceptanceReport {
  status: CatalogAcceptanceStatus;
  fixture: CatalogFixtureReadinessSummary;
  importPlan: CatalogImportPlanStatusSummary;
  risks: CatalogAcceptanceRiskSummary;
}

export function validateCatalogFixtureReadiness(
  input: unknown,
): CatalogFixtureReadinessSummary {
  const catalogResult = createValidatedCatalog(input);
  if (!catalogResult.ok) {
    return {
      status: "blocked",
      code: "validation_failed",
      validation: createValidationSummary(catalogResult.issues),
    };
  }

  const exportReadiness = createExportReadinessSummary(catalogResult.catalog);
  const status = exportReadiness.status;

  return {
    status,
    code: status === "ready" ? "ready" : "replay_integrity",
    validation: createValidationSummary([]),
    exportReadiness,
  };
}

export function summarizeCatalogImportPlanStatus(
  repository: SyncBundleRepository,
  input: unknown,
): CatalogImportPlanStatusSummary {
  const catalogResult = createValidatedCatalog(input);
  if (!catalogResult.ok) {
    return {
      status: "blocked",
      code: "validation_failed",
      message: "event replay catalog validation failed",
      eventCount: 0,
      validation: createValidationSummary(catalogResult.issues),
    };
  }

  const exportReadiness = createExportReadinessSummary(catalogResult.catalog);
  if (exportReadiness.status === "blocked") {
    return {
      status: "blocked",
      code: "replay_integrity",
      message: "event replay catalog integrity is not ready for import",
      eventCount: exportReadiness.eventCount,
      validation: createValidationSummary([]),
    };
  }

  const planResult = createCatalogImportPlan(repository, catalogResult.input);
  if (!planResult.ok) {
    return {
      status: "blocked",
      code: planResult.error.code,
      message: planResult.error.message,
      eventCount: catalogResult.catalog.events.length,
      validation:
        planResult.error.validationIssues === undefined
          ? undefined
          : createValidationSummary(planResult.error.validationIssues),
      reconciliation: planResult.error.reconciliation,
    };
  }

  return {
    status: "ready",
    code: "ready",
    eventCount: planResult.value.summary.eventCount,
    plan: planResult.value.summary,
    validation: createValidationSummary([]),
    reconciliation: planResult.value.reconciliation.summary,
  };
}

export function detectCatalogImportRisks(
  repository: SyncBundleRepository,
  input: unknown,
): CatalogAcceptanceRiskSummary {
  const catalogResult = createValidatedCatalog(input);
  if (!catalogResult.ok) {
    return createRiskSummary(
      catalogResult.issues.map((issue) => ({
        code: "validation_failed",
        severity: "blocking",
        message: issue.message,
        path: issue.path,
      })),
    );
  }

  const exportReadiness = createExportReadinessSummary(catalogResult.catalog);
  if (exportReadiness.status === "blocked") {
    return createRiskSummary([
      {
        code: "replay_integrity",
        severity: "blocking",
        message: "event replay catalog integrity is not ready for import",
      },
    ]);
  }

  const reconciliation = reconcileEventReplayCatalog(repository, catalogResult.catalog);
  return createRiskSummary(
    reconciliation.summary.issues.map((issue) => ({
      code: issue.code,
      severity: "blocking",
      message: issue.message,
      eventId: issue.eventId,
      baseCursor: issue.baseCursor,
      remoteCursor: issue.remoteCursor,
    })),
    reconciliation.summary,
  );
}

export function createCatalogAcceptanceReport(
  repository: SyncBundleRepository,
  input: unknown,
): CatalogAcceptanceReport {
  const fixture = validateCatalogFixtureReadiness(input);
  const importPlan = summarizeCatalogImportPlanStatus(repository, input);
  const risks = detectCatalogImportRisks(repository, input);
  const status =
    fixture.status === "ready" && importPlan.status === "ready" && risks.status === "ready"
      ? "ready"
      : "blocked";

  return {
    status,
    fixture,
    importPlan,
    risks,
  };
}

function createValidatedCatalog(
  input: unknown,
):
  | {
      ok: true;
      input: ValidatedEventReplayCatalogInput;
      catalog: EventReplayCatalog;
    }
  | { ok: false; issues: ValidationIssue[] } {
  const validation = validateEventReplayCatalog(input);
  if (!validation.ok || validation.value === undefined) {
    return {
      ok: false,
      issues: validation.issues.map(cloneValidationIssue),
    };
  }

  return {
    ok: true,
    input: validation.value,
    catalog: createEventReplayCatalog(validation.value),
  };
}

function createExportReadinessSummary(
  catalog: EventReplayCatalog,
): CatalogFixtureExportReadinessSummary {
  const status: CatalogAcceptanceStatus =
    catalog.replay.integrity.status === "ok" ? "ready" : "blocked";

  return {
    status,
    workspaceId: redactIdentifier(catalog.workspaceId),
    deviceId: redactIdentifier(catalog.deviceId),
    baseCursor: redactCursor(catalog.baseCursor),
    nextCursor: redactCursor(catalog.nextCursor),
    digest: catalog.digest,
    eventCount: catalog.events.length,
    firstEventDigest: catalog.firstEventDigest,
    lastEventDigest: catalog.lastEventDigest,
    replayIntegrity: catalog.replay.integrity,
    replay: catalog.summary,
  };
}

function createValidationSummary(
  issues: readonly ValidationIssue[],
): CatalogAcceptanceValidationSummary {
  return {
    status: issues.length === 0 ? "passed" : "failed",
    issueCount: issues.length,
    issues: issues.map(cloneValidationIssue),
  };
}

function createRiskSummary(
  risks: readonly CatalogAcceptanceRisk[],
  reconciliation?: CatalogImportReconciliationSummary,
): CatalogAcceptanceRiskSummary {
  const normalizedRisks = risks.map(cloneRisk);
  const duplicateEventCount = normalizedRisks.filter(
    (risk) => risk.code === "duplicate_event",
  ).length;
  const cursorRiskCount = normalizedRisks.filter(
    (risk) => risk.code === "stale_cursor" || risk.code === "future_cursor",
  ).length;

  return {
    status: normalizedRisks.length === 0 ? "ready" : "blocked",
    riskCount: normalizedRisks.length,
    codes: [...new Set(normalizedRisks.map((risk) => risk.code))].sort(),
    duplicateEventCount,
    cursorRiskCount,
    duplicateEventRisk: duplicateEventCount > 0,
    staleCursorRisk: normalizedRisks.some((risk) => risk.code === "stale_cursor"),
    futureCursorRisk: normalizedRisks.some((risk) => risk.code === "future_cursor"),
    risks: normalizedRisks,
    reconciliation,
  };
}

function cloneValidationIssue(issue: ValidationIssue): ValidationIssue {
  return {
    path: issue.path,
    message: issue.message,
  };
}

function cloneRisk(risk: CatalogAcceptanceRisk): CatalogAcceptanceRisk {
  return {
    code: risk.code,
    severity: risk.severity,
    message: risk.message,
    path: risk.path,
    eventId: risk.eventId,
    baseCursor: risk.baseCursor,
    remoteCursor: risk.remoteCursor,
  };
}

function redactCursor(cursor: string): string {
  try {
    const parsed = parseCursor(cursor);
    return `${CURSOR_VERSION}:${String(parsed.position).padStart(16, "0")}:${
      parsed.eventId === "origin" ? "origin" : redactIdentifier(parsed.eventId)
    }`;
  } catch {
    return redactIdentifier(cursor);
  }
}

function redactIdentifier(value: string): string {
  if (value === "origin") {
    return value;
  }
  if (value.length <= 8) {
    return `${value.slice(0, 3)}...`;
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
