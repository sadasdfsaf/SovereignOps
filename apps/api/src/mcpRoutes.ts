import type {
  ApiResponse,
  ApiRoute,
  ApiRouter,
} from "./router.ts";
import { jsonError, jsonResponse } from "./router.ts";

type MaybePromise<TValue> = TValue | Promise<TValue>;

export interface McpActor {
  id: string;
  roles?: readonly string[];
}

export interface McpRouteContext {
  actor?: McpActor;
  metadata?: Record<string, unknown>;
}

export interface McpResourceSummary {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

export interface McpListResourcesResult {
  resources: McpResourceSummary[];
}

export interface McpReadResourceResult {
  contents: McpResourceContent[];
}

export type McpGatewayResult<TValue> =
  | {
      ok: true;
      value: TValue;
      auditIntents?: readonly unknown[];
    }
  | {
      ok: false;
      error: McpGatewayError;
      auditIntents?: readonly unknown[];
    };

export interface McpGatewayError {
  code: string;
  message: string;
  uri?: string;
  capability?: string;
  decision?: string;
  ruleId?: string;
}

export interface McpResourceAdapter {
  listResources(context?: McpRouteContext): MaybePromise<McpGatewayResult<McpListResourcesResult>>;
  readResource(uri: string, context?: McpRouteContext): MaybePromise<McpGatewayResult<McpReadResourceResult>>;
}

export interface McpToolExecutionPreviewRequest {
  toolName: string;
  arguments?: Record<string, unknown>;
  actor?: McpActor;
  metadata?: Record<string, unknown>;
}

export type McpToolExecutionPreview = (
  request: McpToolExecutionPreviewRequest,
  context: McpRouteContext,
) => MaybePromise<unknown>;

export interface McpRouteDependencies {
  adapter: McpResourceAdapter;
  executeToolPreview: McpToolExecutionPreview;
}

export interface McpRoutesOptions {
  basePath?: string;
}

export function createMcpRoutes(
  dependencies: McpRouteDependencies,
  options: McpRoutesOptions = {},
): readonly ApiRoute[] {
  const basePath = normalizeBasePath(options.basePath ?? "/mcp");

  return [
    {
      method: "GET",
      path: joinPath(basePath, "resources"),
      description: "Lists MCP resources allowed by injected access rules.",
      handler: async ({ request }) => {
        const context = toRouteContext(request.body, request.actorId);
        if (!context.ok) {
          return context.error;
        }

        return gatewayResultResponse(
          await dependencies.adapter.listResources(context.value),
        );
      },
    },
    {
      method: "POST",
      path: joinPath(basePath, "resources/read"),
      description: "Reads an MCP resource through injected access rules.",
      handler: async ({ request }) => {
        const body = asRecord(request.body);
        if (!body.ok) {
          return body.error;
        }

        const uri = body.value.uri;
        if (typeof uri !== "string" || uri.trim().length === 0) {
          return validationError("Resource read requires a non-empty uri.", { path: "body.uri" });
        }

        const context = toRouteContext(body.value, request.actorId);
        if (!context.ok) {
          return context.error;
        }

        return gatewayResultResponse(
          await dependencies.adapter.readResource(uri, context.value),
        );
      },
    },
    {
      method: "POST",
      path: joinPath(basePath, "tools/execute-preview"),
      description: "Previews safe local tool execution.",
      handler: async ({ request }) => {
        const previewRequest = toToolPreviewRequest(request.body, request.actorId);
        if (!previewRequest.ok) {
          return previewRequest.error;
        }

        try {
          const context = {
            actor: previewRequest.value.actor,
            metadata: previewRequest.value.metadata,
          };
          return jsonResponse(
            200,
            await dependencies.executeToolPreview(previewRequest.value, context),
          );
        } catch (error) {
          return caughtToolPreviewError(error);
        }
      },
    },
  ];
}

export function mountMcpRoutes(
  router: ApiRouter,
  dependencies: McpRouteDependencies,
  options: McpRoutesOptions = {},
): ApiRouter {
  for (const route of createMcpRoutes(dependencies, options)) {
    router.register(route);
  }

  return router;
}

function gatewayResultResponse<TBody>(result: McpGatewayResult<TBody>): ApiResponse<TBody> {
  if (result.ok) {
    return jsonResponse(200, result.value);
  }

  return jsonError(
    gatewayErrorStatus(result.error.code),
    result.error.code,
    result.error.message,
    gatewayErrorDetails(result.error),
  );
}

function toToolPreviewRequest(
  body: unknown,
  actorId: string | undefined,
):
  | { ok: true; value: McpToolExecutionPreviewRequest }
  | { ok: false; error: ApiResponse } {
  const record = asRecord(body);
  if (!record.ok) {
    return record;
  }

  const toolName = record.value.toolName;
  if (typeof toolName !== "string" || toolName.trim().length === 0) {
    return {
      ok: false,
      error: validationError("Tool preview requires a non-empty toolName.", { path: "body.toolName" }),
    };
  }

  const args = record.value.arguments;
  if (args !== undefined && !isRecord(args)) {
    return {
      ok: false,
      error: validationError("Tool preview arguments must be an object.", { path: "body.arguments" }),
    };
  }

  const metadata = optionalRecord(record.value.metadata, "body.metadata");
  if (!metadata.ok) {
    return metadata;
  }

  const actor = optionalActor(record.value.actor, actorId);
  if (!actor.ok) {
    return actor;
  }

  return {
    ok: true,
    value: {
      toolName,
      arguments: args === undefined ? undefined : { ...args },
      actor: actor.value,
      metadata: metadata.value,
    },
  };
}

function toRouteContext(
  body: unknown,
  actorId: string | undefined,
): { ok: true; value: McpRouteContext } | { ok: false; error: ApiResponse } {
  if (body !== undefined && !isRecord(body)) {
    return {
      ok: false,
      error: validationError("Request body must be an object.", { path: "body" }),
    };
  }

  const record: Record<string, unknown> = body === undefined ? {} : body;
  const metadata = optionalRecord(record.metadata, "body.metadata");
  if (!metadata.ok) {
    return metadata;
  }

  const actor = optionalActor(record.actor, actorId);
  if (!actor.ok) {
    return actor;
  }

  return {
    ok: true,
    value: {
      actor: actor.value,
      metadata: metadata.value,
    },
  };
}

function asRecord(
  body: unknown,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: ApiResponse } {
  if (!isRecord(body)) {
    return {
      ok: false,
      error: validationError("Request body must be an object.", { path: "body" }),
    };
  }

  return { ok: true, value: body };
}

function optionalRecord(
  value: unknown,
  path: string,
): { ok: true; value?: Record<string, unknown> } | { ok: false; error: ApiResponse } {
  if (value === undefined) {
    return { ok: true };
  }

  if (!isRecord(value)) {
    return {
      ok: false,
      error: validationError("Field must be an object.", { path }),
    };
  }

  return { ok: true, value: { ...value } };
}

function optionalActor(
  value: unknown,
  actorId: string | undefined,
): { ok: true; value?: McpActor } | { ok: false; error: ApiResponse } {
  if (value === undefined) {
    return actorId ? { ok: true, value: { id: actorId } } : { ok: true };
  }

  if (typeof value === "string") {
    if (value.trim().length === 0) {
      return {
        ok: false,
        error: validationError("Actor id must be non-empty when provided.", { path: "body.actor" }),
      };
    }

    return { ok: true, value: { id: value } };
  }

  if (!isRecord(value) || typeof value.id !== "string" || value.id.trim().length === 0) {
    return {
      ok: false,
      error: validationError("Actor must be an object with a non-empty id.", { path: "body.actor" }),
    };
  }

  if (
    value.roles !== undefined &&
    (!Array.isArray(value.roles) || value.roles.some((role) => typeof role !== "string"))
  ) {
    return {
      ok: false,
      error: validationError("Actor roles must be strings when provided.", { path: "body.actor.roles" }),
    };
  }

  const roles = value.roles as string[] | undefined;

  return {
    ok: true,
    value: {
      id: value.id,
      roles: roles === undefined ? undefined : [...roles],
    },
  };
}

function caughtToolPreviewError(error: unknown): ApiResponse {
  const message = error instanceof Error ? error.message : "Tool preview failed.";
  const name = error instanceof Error ? error.name : "";
  const status = name === "ToolNotFoundError" ? 404 : 400;
  const code = name === "ToolNotFoundError"
    ? "tool_not_found"
    : "tool_preview_failed";

  return jsonError(status, code, message);
}

function validationError(
  message: string,
  details: Readonly<Record<string, unknown>>,
): ApiResponse {
  return jsonError(400, "validation_failed", message, details);
}

function gatewayErrorStatus(code: string): number {
  if (code === "resource_not_found") {
    return 404;
  }
  if (code === "policy_denied") {
    return 403;
  }
  if (code === "approval_required") {
    return 409;
  }

  return 500;
}

function gatewayErrorDetails(error: McpGatewayError): Record<string, unknown> | undefined {
  const details = Object.fromEntries(
    Object.entries({
      uri: error.uri,
      capability: error.capability,
      decision: error.decision,
      ruleId: error.ruleId,
    }).filter(([, value]) => value !== undefined),
  );

  return Object.keys(details).length === 0 ? undefined : details;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
