import type {
  ApiResponse,
  ApiRoute,
  ApiRouter,
} from "./router.ts";
import { jsonError, jsonResponse } from "./router.ts";

type MaybePromise<TValue> = TValue | Promise<TValue>;
type LifecycleRecord = Readonly<Record<string, unknown>>;

export interface LifecycleRouteContext {
  actorId?: string;
  headers: Readonly<Record<string, string>>;
  params: Readonly<Record<string, string>>;
}

export interface LifecycleHandlerResponse<TBody = unknown> {
  status: number;
  headers?: Readonly<Record<string, string>>;
  body: TBody;
}

export type LifecycleHandlerResult<TBody = unknown> =
  | TBody
  | LifecycleHandlerResponse<TBody>;

export type LifecycleHandler<TRequest = LifecycleRecord, TBody = unknown> = (
  request: Readonly<TRequest>,
  context: LifecycleRouteContext,
) => MaybePromise<LifecycleHandlerResult<TBody>>;

export type WorkspaceLifecycleRequest = LifecycleRecord & {
  readonly workspaceId: string;
};

export type RestorePlanLifecycleRequest = LifecycleRecord & {
  readonly targetWorkspaceId: string;
};

export interface LifecycleRouteHandlers {
  planMigration: LifecycleHandler<WorkspaceLifecycleRequest>;
  runMigration: LifecycleHandler<WorkspaceLifecycleRequest>;
  submitBackupManifest: LifecycleHandler<WorkspaceLifecycleRequest>;
  planRestore: LifecycleHandler<RestorePlanLifecycleRequest>;
  submitObservabilityEvent: LifecycleHandler<LifecycleRecord>;
  submitObservabilityMetric: LifecycleHandler<LifecycleRecord>;
  planCompaction: LifecycleHandler<WorkspaceLifecycleRequest>;
}

export interface LifecycleRoutesOptions {
  basePath?: string;
}

export class LifecycleRouteError extends Error {
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
    this.name = "LifecycleRouteError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function createLifecycleRoutes(
  handlers: LifecycleRouteHandlers,
  options: LifecycleRoutesOptions = {},
): readonly ApiRoute[] {
  const basePath = normalizeBasePath(options.basePath ?? "/v1");

  return [
    createPostRoute({
      path: joinPath(basePath, "/workspaces/:workspaceId/migrations/plan"),
      description: "Plans workspace metadata migrations.",
      defaultStatus: 200,
      handler: handlers.planMigration,
      buildRequest: (body, params) =>
        withRouteParam(body, "workspaceId", params.workspaceId),
    }),
    createPostRoute({
      path: joinPath(basePath, "/workspaces/:workspaceId/migrations/run"),
      description: "Runs workspace metadata migrations.",
      defaultStatus: 200,
      handler: handlers.runMigration,
      buildRequest: (body, params) =>
        withRouteParam(body, "workspaceId", params.workspaceId),
    }),
    createPostRoute({
      path: joinPath(basePath, "/workspaces/:workspaceId/backups/manifests"),
      description: "Submits a workspace backup manifest.",
      defaultStatus: 201,
      handler: handlers.submitBackupManifest,
      buildRequest: (body, params) =>
        withRouteParam(body, "workspaceId", params.workspaceId),
    }),
    createPostRoute({
      path: joinPath(basePath, "/workspaces/:targetWorkspaceId/restores/plan"),
      description: "Plans a workspace restore.",
      defaultStatus: 200,
      handler: handlers.planRestore,
      buildRequest: (body, params) =>
        withRouteParam(body, "targetWorkspaceId", params.targetWorkspaceId),
    }),
    createPostRoute({
      path: joinPath(basePath, "/observability/events"),
      description: "Submits a structured observability event.",
      defaultStatus: 202,
      handler: handlers.submitObservabilityEvent,
      buildRequest: (body) => ({ ok: true, value: body }),
    }),
    createPostRoute({
      path: joinPath(basePath, "/observability/metrics"),
      description: "Submits an observability metric.",
      defaultStatus: 202,
      handler: handlers.submitObservabilityMetric,
      buildRequest: (body) => ({ ok: true, value: body }),
    }),
    createPostRoute({
      path: joinPath(basePath, "/workspaces/:workspaceId/compactions/plan"),
      description: "Plans workspace event compaction.",
      defaultStatus: 200,
      handler: handlers.planCompaction,
      buildRequest: (body, params) =>
        withRouteParam(body, "workspaceId", params.workspaceId),
    }),
  ];
}

export function mountLifecycleRoutes(
  router: ApiRouter,
  handlers: LifecycleRouteHandlers,
  options: LifecycleRoutesOptions = {},
): ApiRouter {
  for (const route of createLifecycleRoutes(handlers, options)) {
    router.register(route);
  }

  return router;
}

interface PostRouteSpec<TRequest> {
  path: string;
  description: string;
  defaultStatus: number;
  handler: LifecycleHandler<TRequest>;
  buildRequest: (
    body: LifecycleRecord,
    params: Readonly<Record<string, string>>,
  ) => BuildRequestResult<TRequest>;
}

type BuildRequestResult<TRequest> =
  | { ok: true; value: TRequest }
  | { ok: false; error: ApiResponse };

function createPostRoute<TRequest>(spec: PostRouteSpec<TRequest>): ApiRoute {
  return {
    method: "POST",
    path: spec.path,
    description: spec.description,
    handler: async ({ params, request }) => {
      const body = asRequestBody(request.body);
      if (!body.ok) {
        return body.error;
      }

      const builtRequest = spec.buildRequest(body.value, params);
      if (!builtRequest.ok) {
        return builtRequest.error;
      }

      try {
        const result = await spec.handler(builtRequest.value, {
          actorId: request.actorId,
          headers: request.headers ?? EMPTY_HEADERS,
          params,
        });
        return toApiResponse(result, spec.defaultStatus);
      } catch (error) {
        return caughtHandlerError(error);
      }
    },
  };
}

function asRequestBody(
  body: unknown,
): { ok: true; value: LifecycleRecord } | { ok: false; error: ApiResponse } {
  if (!isRecord(body)) {
    return {
      ok: false,
      error: validationError("Request body must be an object.", { path: "body" }),
    };
  }

  return { ok: true, value: { ...body } };
}

function withRouteParam<TName extends string>(
  body: LifecycleRecord,
  name: TName,
  value: string,
): BuildRequestResult<LifecycleRecord & Record<TName, string>> {
  const existing = body[name];
  if (existing !== undefined && existing !== value) {
    return {
      ok: false,
      error: validationError(`Request ${name} must match the route parameter.`, {
        path: `body.${name}`,
      }),
    };
  }

  return {
    ok: true,
    value: {
      ...body,
      [name]: value,
    } as LifecycleRecord & Record<TName, string>,
  };
}

function toApiResponse<TBody>(
  result: LifecycleHandlerResult<TBody>,
  defaultStatus: number,
): ApiResponse<TBody> {
  if (isHandlerResponse(result)) {
    if (!isHttpStatus(result.status)) {
      return jsonError(
        500,
        "lifecycle_handler_invalid_response",
        "Lifecycle handler returned an invalid status.",
        { status: result.status },
      ) as ApiResponse<TBody>;
    }

    return jsonResponse(result.status, result.body, result.headers);
  }

  return jsonResponse(defaultStatus, result);
}

function caughtHandlerError(error: unknown): ApiResponse {
  const record = isRecord(error) ? error : undefined;
  const status = readErrorStatus(record, error);
  const code = readErrorCode(record);
  const message = error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "Lifecycle route handler failed.";
  const details = record !== undefined && isRecord(record.details)
    ? record.details
    : undefined;

  return jsonError(status, code, message, details);
}

function readErrorStatus(
  record: Record<string, unknown> | undefined,
  error: unknown,
): number {
  const explicitStatus = record === undefined
    ? undefined
    : readStatusValue(record.status) ?? readStatusValue(record.statusCode);
  if (explicitStatus !== undefined) {
    return explicitStatus;
  }

  return error instanceof TypeError || readErrorCode(record) !== "lifecycle_handler_failed"
    ? 400
    : 500;
}

function readStatusValue(value: unknown): number | undefined {
  return isHttpStatus(value) ? value : undefined;
}

function readErrorCode(record: Record<string, unknown> | undefined): string {
  return typeof record?.code === "string" && record.code.trim().length > 0
    ? record.code
    : "lifecycle_handler_failed";
}

function validationError(
  message: string,
  details: Readonly<Record<string, unknown>>,
): ApiResponse {
  return jsonError(400, "validation_failed", message, details);
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

function isHandlerResponse<TBody>(
  value: LifecycleHandlerResult<TBody>,
): value is LifecycleHandlerResponse<TBody> {
  return isRecord(value) && typeof value.status === "number" && Object.hasOwn(value, "body");
}

function isHttpStatus(value: unknown): value is number {
  return Number.isInteger(value) && value >= 100 && value <= 599;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const EMPTY_HEADERS: Readonly<Record<string, string>> = Object.freeze({});
