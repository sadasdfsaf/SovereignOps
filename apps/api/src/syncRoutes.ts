import type {
  ApiResponse,
  ApiRoute,
  ApiRouter,
} from "./router.ts";

type MaybePromise<TValue> = TValue | Promise<TValue>;

export interface SyncRouteRequest<TBody = unknown> {
  body?: TBody;
  headers?: Record<string, string | undefined>;
  params?: Record<string, string | undefined>;
  query?: Record<string, string | number | undefined>;
}

export interface SyncRouteResponse<TBody = unknown> {
  status: number;
  headers: Record<string, string>;
  body: TBody;
}

export interface SyncRouteHandlers {
  health: (request?: SyncRouteRequest) => MaybePromise<SyncRouteResponse>;
  uploadBundle: (request: SyncRouteRequest) => MaybePromise<SyncRouteResponse>;
  downloadBundle: (request: SyncRouteRequest) => MaybePromise<SyncRouteResponse>;
  cursorStatus: (request: SyncRouteRequest) => MaybePromise<SyncRouteResponse>;
}

export interface SyncRoutesOptions {
  basePath?: string;
  pathStyle?: "legacy" | "openapi";
}

export function createSyncRoutes(
  handlers: SyncRouteHandlers,
  options: SyncRoutesOptions = {},
): readonly ApiRoute[] {
  const basePath = normalizeBasePath(options.basePath ?? "/sync");
  const paths = syncRoutePaths(options.pathStyle ?? "legacy");

  return [
    {
      method: "GET",
      path: joinPath(basePath, paths.health),
      description: "Reports sync service readiness.",
      handler: async ({ request }) =>
        toApiResponse(await handlers.health(toSyncRequest(request.body, request.headers))),
    },
    {
      method: "POST",
      path: joinPath(basePath, paths.upload),
      description: "Accepts a sync upload bundle.",
      handler: async ({ request }) =>
        toApiResponse(await handlers.uploadBundle(toSyncRequest(request.body, request.headers))),
    },
    {
      method: "POST",
      path: joinPath(basePath, paths.download),
      description: "Returns a sync download window.",
      handler: async ({ request }) =>
        toApiResponse(await handlers.downloadBundle(toSyncRequest(request.body, request.headers))),
    },
    {
      method: "POST",
      path: joinPath(basePath, paths.cursorStatus),
      description: "Reports sync cursor status.",
      handler: async ({ request }) =>
        toApiResponse(await handlers.cursorStatus(toSyncRequest(request.body, request.headers))),
    },
  ];
}

export function mountSyncRoutes(
  router: ApiRouter,
  handlers: SyncRouteHandlers,
  options: SyncRoutesOptions = {},
): ApiRouter {
  for (const route of createSyncRoutes(handlers, options)) {
    router.register(route);
  }

  return router;
}

function toSyncRequest(
  body: unknown,
  headers: Readonly<Record<string, string>> | undefined,
): SyncRouteRequest {
  return {
    body,
    headers: Object.fromEntries(
      Object.entries(headers ?? {}).map(([key, value]) => [key, value]),
    ),
  };
}

function toApiResponse<TBody>(response: SyncRouteResponse<TBody>): ApiResponse<TBody> {
  return {
    status: response.status,
    headers: Object.freeze({ ...response.headers }),
    body: response.body,
  };
}

function normalizeBasePath(path: string): string {
  const trimmed = path.trim();
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const collapsed = withSlash.replace(/\/+/g, "/");

  return collapsed.length > 1 && collapsed.endsWith("/")
    ? collapsed.slice(0, -1)
    : collapsed;
}

function joinPath(basePath: string, suffix: string): string {
  return `${basePath}/${suffix}`;
}

function syncRoutePaths(style: "legacy" | "openapi"): {
  health: string;
  upload: string;
  download: string;
  cursorStatus: string;
} {
  if (style === "openapi") {
    return {
      health: "health",
      upload: "bundles",
      download: "download",
      cursorStatus: "cursor-status",
    };
  }

  return {
    health: "health",
    upload: "upload",
    download: "download",
    cursorStatus: "cursor",
  };
}
