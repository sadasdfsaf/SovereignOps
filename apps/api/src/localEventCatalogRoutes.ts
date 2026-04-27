import { readFileSync } from "node:fs";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalLocalEventOperations,
  canonicalSharedSchemaKinds,
  validateCanonicalLocalEventCatalog,
  type CanonicalLocalEventCatalog,
  type CanonicalLocalEventOperation,
  type CanonicalSharedSchemaKind,
  type ValidationIssue as CanonicalLocalEventValidationIssue,
} from "../../../packages/schemas/src/eventCatalog.ts";
import {
  createLocalEventReplayBatches,
  summarizeLocalEventCatalog,
  type LocalEventCatalogInput,
  type LocalEventCatalogSummary,
  type LocalEventReplayBatch,
  type LocalEventReplayBatchOptions,
} from "../../../packages/sdk-js/src/localEvents.ts";
import type {
  ApiResponse,
  ApiRoute,
  ApiRouter,
} from "./router.ts";
import { jsonError, jsonResponse } from "./router.ts";

export const DEFAULT_LOCAL_EVENT_CATALOG_ROUTE_BASE_PATH = "/v1/local-events";

const DEFAULT_WORKSPACE_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const DEFAULT_LOCAL_EVENT_CATALOG_PATH = fileURLToPath(
  new URL("../../../packages/schemas/fixtures/canonical-events.valid.json", import.meta.url),
);

export interface LocalEventCatalogRoutesOptions {
  readonly basePath?: string;
  readonly workspaceRoot?: string;
  readonly catalog?: CanonicalLocalEventCatalog;
  readonly catalogPath?: string;
  readonly replay?: LocalEventReplayBatchOptions;
}

export interface LocalEventCatalogInspection {
  readonly kind: "local-event-catalog.inspection";
  readonly catalog: CanonicalLocalEventCatalog;
  readonly summary: LocalEventCatalogSummary;
  readonly validation: {
    readonly ok: true;
    readonly issues: readonly CanonicalLocalEventValidationIssue[];
  };
}

export interface LocalEventCatalogReplay {
  readonly kind: "local-event-catalog.replay";
  readonly batches: readonly LocalEventReplayBatch[];
}

export interface LoadWorkspaceLocalEventCatalogOptions {
  readonly workspaceRoot?: string;
  readonly catalogPath?: string;
}

type Parsed<TValue> = { ok: true; value: TValue } | { ok: false; error: ApiResponse };

export class LocalEventCatalogRouteError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "LocalEventCatalogRouteError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function inspectLocalEventCatalog(
  input: LocalEventCatalogInput,
): LocalEventCatalogInspection {
  const catalog = validateLocalEventCatalogForRoute(input, "local event catalog");

  return deepFreeze({
    kind: "local-event-catalog.inspection",
    catalog,
    summary: summarizeLocalEventCatalog(catalog),
    validation: {
      ok: true,
      issues: [],
    },
  });
}

export function replayLocalEventCatalog(
  input: LocalEventCatalogInput,
  options: LocalEventReplayBatchOptions = {},
): LocalEventCatalogReplay {
  const catalog = validateLocalEventCatalogForRoute(input, "local event catalog");

  return deepFreeze({
    kind: "local-event-catalog.replay",
    batches: createLocalEventReplayBatches(catalog, options),
  });
}

export function loadWorkspaceLocalEventCatalog(
  options: LoadWorkspaceLocalEventCatalogOptions = {},
): CanonicalLocalEventCatalog {
  const workspaceRoot = normalizeWorkspaceRoot(options.workspaceRoot);
  const catalogPath = resolveWorkspaceJsonPath(
    options.catalogPath ?? DEFAULT_LOCAL_EVENT_CATALOG_PATH,
    workspaceRoot,
    "catalogPath",
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(catalogPath, "utf8")) as unknown;
  } catch (error) {
    throw new LocalEventCatalogRouteError(
      400,
      "local_event_catalog_read_failed",
      "Local event catalog JSON could not be read.",
      {
        catalogPath: displayPath(catalogPath, workspaceRoot),
        reason: errorMessage(error),
      },
    );
  }

  return validateLocalEventCatalogForRoute(
    parsed,
    displayPath(catalogPath, workspaceRoot),
  );
}

export function createLocalEventCatalogRoutes(
  options: LocalEventCatalogRoutesOptions = {},
): readonly ApiRoute[] {
  const basePath = normalizeBasePath(options.basePath ?? DEFAULT_LOCAL_EVENT_CATALOG_ROUTE_BASE_PATH);

  return Object.freeze([
    {
      method: "GET",
      path: joinPath(basePath, "/catalog"),
      description: "Returns a canonical local event catalog.",
      handler: ({ request }) => localEventCatalogResponse(() =>
        jsonResponse(200, resolveRequestCatalog(request.body, options)),
      ),
    },
    {
      method: "GET",
      path: joinPath(basePath, "/summary"),
      description: "Summarizes a canonical local event catalog.",
      handler: ({ request }) => localEventCatalogResponse(() =>
        jsonResponse(200, summarizeLocalEventCatalog(resolveRequestCatalog(request.body, options))),
      ),
    },
    {
      method: "GET",
      path: joinPath(basePath, "/replay-batches"),
      description: "Builds deterministic replay batches for a canonical local event catalog.",
      handler: ({ request }) => localEventCatalogResponse(() => {
        const catalog = resolveRequestCatalog(request.body, options);
        const replayOptions = parseReplayOptions(request.body, options.replay);
        if (!replayOptions.ok) {
          return replayOptions.error;
        }

        return jsonResponse(200, {
          batches: createLocalEventReplayBatches(catalog, replayOptions.value),
        });
      }),
    },
  ]);
}

export function mountLocalEventCatalogRoutes(
  router: ApiRouter,
  options: LocalEventCatalogRoutesOptions = {},
): ApiRouter {
  for (const route of createLocalEventCatalogRoutes(options)) {
    router.register(route);
  }

  return router;
}

function resolveRequestCatalog(
  body: unknown,
  options: LocalEventCatalogRoutesOptions,
): CanonicalLocalEventCatalog {
  const parsedBody = parseOptionalRequestBody(body);
  if (!parsedBody.ok) {
    throw responseAsRouteError(parsedBody.error);
  }

  if (parsedBody.value?.catalog !== undefined) {
    return validateLocalEventCatalogForRoute(parsedBody.value.catalog, "body.catalog");
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
    return validateLocalEventCatalogForRoute(options.catalog, "options.catalog");
  }

  return loadWorkspaceLocalEventCatalog({
    workspaceRoot,
    catalogPath: options.catalogPath ?? DEFAULT_LOCAL_EVENT_CATALOG_PATH,
  });
}

function validateLocalEventCatalogForRoute(
  input: LocalEventCatalogInput | unknown,
  source: string,
): CanonicalLocalEventCatalog {
  const value = Array.isArray(input)
    ? {
      schemaVersion: "canonical-local-event-catalog/v1",
      generatedAt: input.at(-1)?.recordedAt ?? new Date(0).toISOString(),
      workspaceId: input[0]?.workspaceId,
      localOnly: true,
      events: input,
    }
    : input;
  const result = validateCanonicalLocalEventCatalog(value);

  if (!result.ok) {
    throw new LocalEventCatalogRouteError(
      400,
      "local_event_catalog_validation_failed",
      "Local event catalog validation failed.",
      {
        source,
        issues: result.issues,
      },
    );
  }

  return result.value as CanonicalLocalEventCatalog;
}

function parseReplayOptions(
  body: unknown,
  configuredOptions: LocalEventReplayBatchOptions | undefined,
): Parsed<LocalEventReplayBatchOptions> {
  const parsedBody = parseOptionalRequestBody(body);
  if (!parsedBody.ok) {
    return parsedBody;
  }

  const bodyOptions = parsedBody.value?.replay;
  if (bodyOptions !== undefined && !isRecord(bodyOptions)) {
    return validationFailure("Replay options must be an object.", { path: "body.replay" });
  }

  const source = isRecord(bodyOptions) ? bodyOptions : parsedBody.value;
  const sourcePath = isRecord(bodyOptions) ? "body.replay" : "body";
  const parsed = parseReplayOptionRecord(source, sourcePath);
  if (!parsed.ok) {
    return parsed;
  }

  return {
    ok: true,
    value: {
      ...(configuredOptions ?? {}),
      ...parsed.value,
    },
  };
}

function parseReplayOptionRecord(
  source: Readonly<Record<string, unknown>> | undefined,
  path: string,
): Parsed<LocalEventReplayBatchOptions> {
  if (source === undefined) {
    return { ok: true, value: {} };
  }

  const batchSize = parseOptionalPositiveInteger(source.batchSize, `${path}.batchSize`);
  if (!batchSize.ok) {
    return batchSize;
  }
  const startSequence = parseOptionalPositiveInteger(source.startSequence, `${path}.startSequence`);
  if (!startSequence.ok) {
    return startSequence;
  }
  const endSequence = parseOptionalPositiveInteger(source.endSequence, `${path}.endSequence`);
  if (!endSequence.ok) {
    return endSequence;
  }
  const operationsKey = source.operations === undefined ? "operation" : "operations";
  const operations = parseOptionalAllowedValues(
    source[operationsKey],
    canonicalLocalEventOperations,
    `${path}.${operationsKey}`,
  );
  if (!operations.ok) {
    return operations;
  }
  const schemaKindsKey = source.schemaKinds === undefined ? "schemaKind" : "schemaKinds";
  const schemaKinds = parseOptionalAllowedValues(
    source[schemaKindsKey],
    canonicalSharedSchemaKinds,
    `${path}.${schemaKindsKey}`,
  );
  if (!schemaKinds.ok) {
    return schemaKinds;
  }

  if (
    startSequence.value !== undefined &&
    endSequence.value !== undefined &&
    endSequence.value < startSequence.value
  ) {
    return validationFailure("endSequence must be greater than or equal to startSequence.", {
      path: `${path}.endSequence`,
    });
  }

  return {
    ok: true,
    value: {
      ...(batchSize.value === undefined ? {} : { batchSize: batchSize.value }),
      ...(startSequence.value === undefined ? {} : { startSequence: startSequence.value }),
      ...(endSequence.value === undefined ? {} : { endSequence: endSequence.value }),
      ...(operations.value === undefined ? {} : {
        operations: operations.value as readonly CanonicalLocalEventOperation[],
      }),
      ...(schemaKinds.value === undefined ? {} : {
        schemaKinds: schemaKinds.value as readonly CanonicalSharedSchemaKind[],
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
    return validationFailure("Catalog path must be a non-empty string.", { path: "body.catalogPath" });
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

function parseOptionalPositiveInteger(
  value: unknown,
  path: string,
): Parsed<number | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (!Number.isInteger(value) || value <= 0) {
    return validationFailure("Value must be a positive integer.", { path });
  }

  return { ok: true, value };
}

function parseOptionalAllowedValues<TValue extends string>(
  value: unknown,
  allowed: readonly TValue[],
  path: string,
): Parsed<readonly TValue[] | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  const values = Array.isArray(value) ? value : [value];
  const parsed: TValue[] = [];
  for (const [index, item] of values.entries()) {
    if (typeof item !== "string" || !allowed.includes(item as TValue)) {
      return validationFailure(`Value must be one of ${allowed.join(", ")}.`, {
        path: `${path}.${index}`,
      });
    }
    parsed.push(item as TValue);
  }

  return { ok: true, value: Object.freeze(parsed) };
}

function localEventCatalogResponse(
  callback: () => ApiResponse,
): ApiResponse {
  try {
    return callback();
  } catch (error) {
    return caughtLocalEventCatalogRouteError(error);
  }
}

function caughtLocalEventCatalogRouteError(error: unknown): ApiResponse {
  if (error instanceof LocalEventCatalogRouteError) {
    return jsonError(error.status, error.code, error.message, error.details);
  }

  if (error instanceof TypeError) {
    return jsonError(400, "validation_failed", error.message);
  }

  return jsonError(500, "local_event_catalog_route_failed", "Local event catalog route failed.");
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
    "local_event_catalog_route_failed",
    "Local event catalog route failed.",
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

function displayPath(path: string, workspaceRoot: string): string {
  const relativePath = relative(workspaceRoot, path);
  if (relativePath === "" || isPathOutsideRoot(relativePath) || isAbsolute(relativePath)) {
    return path.replace(/\\/g, "/");
  }

  return relativePath.replace(/\\/g, "/");
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
