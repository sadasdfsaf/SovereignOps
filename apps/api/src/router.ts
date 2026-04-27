export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiRequest<TBody = unknown> {
  method: ApiMethod | string;
  path: string;
  headers?: Readonly<Record<string, string>>;
  body?: TBody;
  actorId?: string;
}

export interface ApiResponse<TBody = unknown> {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: TBody;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Readonly<Record<string, unknown>>;
  };
}

export interface ApiRouteContext {
  params: Readonly<Record<string, string>>;
  request: ApiRequest;
}

export type ApiRouteHandler<TBody = unknown> = (
  context: ApiRouteContext,
) => ApiResponse<TBody> | Promise<ApiResponse<TBody>>;

export interface ApiRoute<TBody = unknown> {
  method: ApiMethod;
  path: string;
  description: string;
  handler: ApiRouteHandler<TBody>;
}

export interface ApiRouteSummary {
  method: ApiMethod;
  path: string;
  description: string;
}

export interface ApiRouter {
  register<TBody>(route: ApiRoute<TBody>): void;
  dispatch(request: ApiRequest): Promise<ApiResponse>;
  listRoutes(): readonly ApiRouteSummary[];
}

interface RegisteredRoute {
  method: ApiMethod;
  path: string;
  description: string;
  pattern: RegExp;
  params: readonly string[];
  handler: ApiRouteHandler;
}

export class RouteConflictError extends Error {
  constructor(method: ApiMethod, path: string) {
    super(`API route already registered for ${method} ${path}`);
    this.name = "RouteConflictError";
  }
}

export class RouteValidationError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "RouteValidationError";
  }
}

export function createApiRouter(routes: readonly ApiRoute[] = []): ApiRouter {
  const registered: RegisteredRoute[] = [];

  const router: ApiRouter = {
    register(route) {
      const normalized = normalizeRoute(route);
      if (
        registered.some(
          (candidate) =>
            candidate.method === normalized.method &&
            candidate.path === normalized.path,
        )
      ) {
        throw new RouteConflictError(normalized.method, normalized.path);
      }
      registered.push(normalized);
    },

    async dispatch(request) {
      const method = normalizeMethod(request.method);
      const path = normalizePath(request.path);

      for (const route of registered) {
        if (route.method !== method) {
          continue;
        }

        const match = route.pattern.exec(path);
        if (!match) {
          continue;
        }

        const params = Object.freeze(
          Object.fromEntries(
            route.params.map((name, index) => [
              name,
              decodeURIComponent(match[index + 1]),
            ]),
          ),
        );
        return route.handler({
          params,
          request: {
            ...request,
            method,
            path,
            headers: freezeHeaders(request.headers),
          },
        });
      }

      return jsonError(404, "API_ROUTE_NOT_FOUND", `No API route found for ${method} ${path}`);
    },

    listRoutes() {
      return registered
        .map((route) => ({
          method: route.method,
          path: route.path,
          description: route.description,
        }))
        .sort((left, right) => `${left.method} ${left.path}`.localeCompare(`${right.method} ${right.path}`));
    },
  };

  for (const route of routes) {
    router.register(route);
  }

  return router;
}

export function createHealthRoute(
  body: Readonly<Record<string, unknown>> = { ok: true },
): ApiRoute<Readonly<Record<string, unknown>>> {
  return {
    method: "GET",
    path: "/health",
    description: "Reports local API readiness.",
    handler: () => jsonResponse(200, body),
  };
}

export function jsonResponse<TBody>(
  status: number,
  body: TBody,
  headers: Readonly<Record<string, string>> = {},
): ApiResponse<TBody> {
  return {
    status,
    headers: Object.freeze({
      "content-type": "application/json; charset=utf-8",
      ...headers,
    }),
    body,
  };
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): ApiResponse<ApiErrorBody> {
  return jsonResponse(status, {
    error: details === undefined ? { code, message } : { code, message, details },
  });
}

function normalizeRoute(route: ApiRoute): RegisteredRoute {
  const method = normalizeMethod(route.method);
  const path = normalizePath(route.path);
  if (typeof route.description !== "string" || route.description.trim().length === 0) {
    throw new RouteValidationError("API route description is required.");
  }
  if (typeof route.handler !== "function") {
    throw new RouteValidationError("API route handler must be a function.");
  }

  const { pattern, params } = compilePath(path);
  return {
    method,
    path,
    description: route.description.trim(),
    pattern,
    params,
    handler: route.handler as ApiRouteHandler,
  };
}

function normalizeMethod(method: string): ApiMethod {
  const normalized = method.toUpperCase();
  if (
    normalized !== "GET" &&
    normalized !== "POST" &&
    normalized !== "PUT" &&
    normalized !== "PATCH" &&
    normalized !== "DELETE"
  ) {
    throw new RouteValidationError(`Unsupported API method: ${method}`);
  }
  return normalized;
}

function normalizePath(path: string): string {
  if (typeof path !== "string" || path.trim().length === 0) {
    throw new RouteValidationError("API path must be a non-empty string.");
  }

  const withoutSuffix = path.trim().split("?")[0].split("#")[0];
  const withSlash = withoutSuffix.startsWith("/") ? withoutSuffix : `/${withoutSuffix}`;
  const collapsed = withSlash.replace(/\/+/g, "/");
  return collapsed.length > 1 && collapsed.endsWith("/")
    ? collapsed.slice(0, -1)
    : collapsed;
}

function compilePath(path: string): { pattern: RegExp; params: readonly string[] } {
  const params: string[] = [];
  const source = path
    .split("/")
    .map((segment) => {
      if (!segment) {
        return "";
      }
      if (segment.startsWith(":")) {
        const name = segment.slice(1);
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
          throw new RouteValidationError(`Invalid API path parameter: ${segment}`);
        }
        params.push(name);
        return "([^/]+)";
      }
      return escapeRegExp(segment);
    })
    .join("/");

  return { pattern: new RegExp(`^${source}$`), params };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function freezeHeaders(
  headers: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> {
  return Object.freeze({ ...(headers ?? {}) });
}
