import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { AuditExportError } from "../../../packages/audit-export/src/index.ts";
import {
  createLocalEventReplayExportPackage,
  type LocalEventReplayExportOptions,
  type LocalEventReplayExportPackage,
} from "../../../packages/audit-export/src/localEventReplayExport.ts";
import type { LocalEventCatalogInput } from "../../../packages/sdk-js/src/localEvents.ts";
import type {
  ApiResponse,
  ApiRoute,
  ApiRouter,
} from "./router.ts";
import { jsonError, jsonResponse } from "./router.ts";
import {
  inspectLocalEventCatalog,
  loadWorkspaceLocalEventCatalog,
  LocalEventCatalogRouteError,
} from "./localEventCatalogRoutes.ts";

export const DEFAULT_LOCAL_EVENT_REPLAY_EXPORT_ROUTE_BASE_PATH =
  "/v1/local-events/replay-export";

const DEFAULT_WORKSPACE_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const DEFAULT_LOCAL_EVENT_CATALOG_PATH = fileURLToPath(
  new URL("../../../packages/schemas/fixtures/canonical-events.valid.json", import.meta.url),
);

export interface LocalEventReplayExportRoutesOptions {
  readonly basePath?: string;
  readonly workspaceRoot?: string;
  readonly catalog?: LocalEventCatalogInput;
  readonly catalogPath?: string;
  readonly exportOptions?: LocalEventReplayExportOptions;
}

export interface LocalEventReplayExportContentResponse {
  readonly kind: "audit-export.local-event-replay.content";
  readonly format: "jsonl" | "csv";
  readonly mediaType: string;
  readonly content: string;
  readonly fingerprint: string;
  readonly exportId: string;
  readonly createdAt: string;
  readonly manifest: LocalEventReplayExportPackage["manifest"];
}

export type LocalEventReplayExportRouteResponse =
  | LocalEventReplayExportContentResponse
  | LocalEventReplayExportPackage;

type LocalEventReplayExportFormat = "jsonl" | "csv" | "package";
type Parsed<TValue> = { ok: true; value: TValue } | { ok: false; error: ApiResponse };

interface ParsedLocalEventReplayExportRequest {
  readonly catalog: LocalEventCatalogInput;
  readonly options: LocalEventReplayExportOptions;
}

export function exportLocalEventReplayCatalog(
  input: LocalEventCatalogInput,
  options: LocalEventReplayExportOptions = {},
): LocalEventReplayExportPackage {
  const catalog = inspectLocalEventCatalog(input).catalog;
  return createLocalEventReplayExportPackage(catalog, options);
}

export function createLocalEventReplayExportRoutes(
  options: LocalEventReplayExportRoutesOptions = {},
): readonly ApiRoute[] {
  const basePath = normalizeBasePath(
    options.basePath ?? DEFAULT_LOCAL_EVENT_REPLAY_EXPORT_ROUTE_BASE_PATH,
  );

  return Object.freeze([
    createFlexibleExportRoute(basePath, options),
    createExportRoute("jsonl", joinPath(basePath, "/jsonl"), options),
    createExportRoute("csv", joinPath(basePath, "/csv"), options),
    createExportRoute("package", joinPath(basePath, "/package"), options),
  ]);
}

export function mountLocalEventReplayExportRoutes(
  router: ApiRouter,
  options: LocalEventReplayExportRoutesOptions = {},
): ApiRouter {
  for (const route of createLocalEventReplayExportRoutes(options)) {
    router.register(route);
  }

  return router;
}

function createFlexibleExportRoute(
  path: string,
  routeOptions: LocalEventReplayExportRoutesOptions,
): ApiRoute {
  return {
    method: "POST",
    path,
    description: "Exports local event replay records using the request body format.",
    handler: ({ request }) => localEventReplayExportResponse(() => {
      const format = parseRequestFormat(request.body);
      if (!format.ok) {
        return format.error;
      }
      const parsed = parseLocalEventReplayExportRequest(request.body, routeOptions);
      if (!parsed.ok) {
        return parsed.error;
      }

      return jsonResponse(200, buildExportResponse(format.value, parsed.value));
    }),
  };
}

function createExportRoute(
  format: LocalEventReplayExportFormat,
  path: string,
  routeOptions: LocalEventReplayExportRoutesOptions,
): ApiRoute {
  return {
    method: "POST",
    path,
    description: `Exports local event replay records as ${format}.`,
    handler: ({ request }) => localEventReplayExportResponse(() => {
      const parsed = parseLocalEventReplayExportRequest(request.body, routeOptions);
      if (!parsed.ok) {
        return parsed.error;
      }

      return jsonResponse(200, buildExportResponse(format, parsed.value));
    }),
  };
}

function parseRequestFormat(body: unknown): Parsed<LocalEventReplayExportFormat> {
  const parsedBody = parseOptionalRequestBody(body);
  if (!parsedBody.ok) {
    return parsedBody;
  }
  const format = parsedBody.value?.format;
  if (format === undefined) {
    return { ok: true, value: "package" };
  }
  if (format === "jsonl" || format === "csv" || format === "package") {
    return { ok: true, value: format };
  }
  return validationFailure("Local event replay export format must be jsonl, csv, or package.", {
    path: "body.format",
  });
}

function buildExportResponse(
  format: LocalEventReplayExportFormat,
  request: ParsedLocalEventReplayExportRequest,
): LocalEventReplayExportRouteResponse {
  const exportPackage = exportLocalEventReplayCatalog(request.catalog, request.options);
  if (format === "package") {
    return exportPackage;
  }

  const descriptor = exportPackage.manifest[format];
  return deepFreeze({
    kind: "audit-export.local-event-replay.content",
    format,
    mediaType: descriptor.mediaType,
    content: exportPackage[format],
    fingerprint: descriptor.fingerprint,
    exportId: exportPackage.manifest.exportId,
    createdAt: exportPackage.manifest.createdAt,
    manifest: exportPackage.manifest,
  } satisfies LocalEventReplayExportContentResponse);
}

function parseLocalEventReplayExportRequest(
  body: unknown,
  routeOptions: LocalEventReplayExportRoutesOptions,
): Parsed<ParsedLocalEventReplayExportRequest> {
  const exportOptions = parseExportOptions(body, routeOptions.exportOptions);
  if (!exportOptions.ok) {
    return exportOptions;
  }

  return {
    ok: true,
    value: {
      catalog: resolveRequestCatalog(body, routeOptions),
      options: exportOptions.value,
    },
  };
}

function resolveRequestCatalog(
  body: unknown,
  options: LocalEventReplayExportRoutesOptions,
): LocalEventCatalogInput {
  const parsedBody = parseOptionalRequestBody(body);
  if (!parsedBody.ok) {
    throw responseAsRouteError(parsedBody.error);
  }

  if (parsedBody.value?.catalog !== undefined) {
    return inspectLocalEventCatalog(parsedBody.value.catalog as LocalEventCatalogInput).catalog;
  }

  const workspaceRoot = normalizeWorkspaceRoot(options.workspaceRoot);
  const catalogPath = parseOptionalCatalogPath(parsedBody.value, workspaceRoot);
  if (!catalogPath.ok) {
    throw responseAsRouteError(catalogPath.error);
  }
  if (catalogPath.value !== undefined) {
    return loadWorkspaceLocalEventCatalog({
      workspaceRoot,
      catalogPath: catalogPath.value,
    });
  }

  if (options.catalog !== undefined) {
    return inspectLocalEventCatalog(options.catalog).catalog;
  }

  return loadWorkspaceLocalEventCatalog({
    workspaceRoot,
    catalogPath: options.catalogPath ?? DEFAULT_LOCAL_EVENT_CATALOG_PATH,
  });
}

function parseExportOptions(
  body: unknown,
  configuredOptions: LocalEventReplayExportOptions | undefined,
): Parsed<LocalEventReplayExportOptions> {
  const parsedBody = parseOptionalRequestBody(body);
  if (!parsedBody.ok) {
    return parsedBody;
  }

  const filters = parsedBody.value?.filters;
  if (filters !== undefined && !isRecord(filters)) {
    return validationFailure("Local event replay export filters must be an object.", {
      path: "body.filters",
    });
  }

  const createdAt = parsedBody.value?.createdAt;
  if (createdAt !== undefined && typeof createdAt !== "string") {
    return validationFailure("Local event replay export createdAt must be a string.", {
      path: "body.createdAt",
    });
  }

  const exportId = parsedBody.value?.exportId;
  if (exportId !== undefined && typeof exportId !== "string") {
    return validationFailure("Local event replay export exportId must be a string.", {
      path: "body.exportId",
    });
  }

  return {
    ok: true,
    value: {
      ...(configuredOptions ?? {}),
      ...optionalFields({
        createdAt,
        exportId,
        filters,
      }),
    },
  };
}

function parseOptionalRequestBody(
  body: unknown,
): Parsed<Readonly<Record<string, unknown>> | undefined> {
  if (body === undefined) {
    return { ok: true, value: undefined };
  }
  if (!isRecord(body)) {
    return validationFailure("Request body must be an object.", { path: "body" });
  }

  return { ok: true, value: body };
}

function parseOptionalCatalogPath(
  body: Readonly<Record<string, unknown>> | undefined,
  workspaceRoot: string,
): Parsed<string | undefined> {
  if (body?.catalogPath === undefined) {
    return { ok: true, value: undefined };
  }
  if (typeof body.catalogPath !== "string" || body.catalogPath.trim().length === 0) {
    return validationFailure("Catalog path must be a non-empty string.", {
      path: "body.catalogPath",
    });
  }

  try {
    resolveWorkspaceJsonPath(body.catalogPath, workspaceRoot, "body.catalogPath");
    return { ok: true, value: body.catalogPath };
  } catch (error) {
    if (error instanceof LocalEventCatalogRouteError) {
      return { ok: false, error: jsonError(error.status, error.code, error.message, error.details) };
    }
    throw error;
  }
}

function localEventReplayExportResponse(callback: () => ApiResponse): ApiResponse {
  try {
    return callback();
  } catch (error) {
    return caughtLocalEventReplayExportError(error);
  }
}

function caughtLocalEventReplayExportError(error: unknown): ApiResponse {
  if (error instanceof LocalEventCatalogRouteError) {
    return jsonError(error.status, error.code, error.message, error.details);
  }

  if (error instanceof AuditExportError) {
    return jsonError(400, error.code, error.message, error.details);
  }

  if (error instanceof TypeError) {
    return jsonError(400, "validation_failed", error.message);
  }

  return jsonError(
    500,
    "local_event_replay_export_failed",
    "Local event replay export failed.",
  );
}

function responseAsRouteError(response: ApiResponse): LocalEventCatalogRouteError {
  if (isRecord(response.body) && isRecord(response.body.error)) {
    const error = response.body.error;
    return new LocalEventCatalogRouteError(
      response.status,
      String(error.code),
      String(error.message),
      isRecord(error.details) ? error.details : undefined,
    );
  }

  return new LocalEventCatalogRouteError(
    response.status,
    "local_event_replay_export_failed",
    "Local event replay export failed.",
  );
}

function validationFailure<TValue>(
  message: string,
  details: Readonly<Record<string, unknown>>,
): Parsed<TValue> {
  return { ok: false, error: validationError(message, details) };
}

function validationError(
  message: string,
  details: Readonly<Record<string, unknown>>,
): ApiResponse {
  return jsonError(400, "validation_failed", message, details);
}

function normalizeWorkspaceRoot(value: string | undefined): string {
  const workspaceRoot = resolve(value ?? DEFAULT_WORKSPACE_ROOT);
  return workspaceRoot.replace(/[\\/]+$/g, "");
}

function resolveWorkspaceJsonPath(
  value: string,
  workspaceRoot: string,
  detailsPath: string,
): string {
  const inputPath = pathFromInput(value, workspaceRoot, detailsPath);
  const catalogPath = resolve(workspaceRoot, inputPath);
  const relativePath = relative(workspaceRoot, catalogPath);

  if (
    relativePath === "" ||
    isPathOutsideRoot(relativePath) ||
    isAbsolute(relativePath) ||
    extname(catalogPath).toLowerCase() !== ".json"
  ) {
    throw new LocalEventCatalogRouteError(
      400,
      "validation_failed",
      "Catalog path must be a workspace-local JSON path.",
      { path: detailsPath },
    );
  }

  return catalogPath;
}

function pathFromInput(value: string, workspaceRoot: string, detailsPath: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("file:")) {
    try {
      return fileURLToPath(new URL(trimmed));
    } catch {
      throw new LocalEventCatalogRouteError(
        400,
        "validation_failed",
        "Catalog path must be a workspace-local JSON path.",
        { path: detailsPath },
      );
    }
  }

  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(trimmed) && !/^[A-Za-z]:[\\/]/.test(trimmed)) {
    throw new LocalEventCatalogRouteError(
      400,
      "validation_failed",
      "Catalog path must be a workspace-local JSON path.",
      { path: detailsPath },
    );
  }

  return resolve(workspaceRoot, trimmed);
}

function isPathOutsideRoot(relativePath: string): boolean {
  return relativePath === ".." || relativePath.startsWith(`..${sep}`) || relativePath.startsWith("../");
}

function normalizeBasePath(path: string): string {
  const trimmed = path.trim();
  if (trimmed.length === 0 || trimmed === "/") {
    return "";
  }

  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const collapsed = withSlash.replace(/\/+/g, "/");

  return collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed;
}

function joinPath(basePath: string, suffix: string): string {
  const normalizedSuffix = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `${basePath}${normalizedSuffix}`;
}

function optionalFields<T extends Record<string, unknown>>(record: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze<TValue>(value: TValue): TValue {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }

  return value;
}
