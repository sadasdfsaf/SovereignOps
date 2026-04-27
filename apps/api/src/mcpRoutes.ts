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

export interface McpToolMetadata {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: readonly string[];
    additionalProperties?: boolean;
  };
}

export interface McpListToolsResult {
  tools: McpToolMetadata[];
}

export interface McpTextContent {
  type: "text";
  text: string;
}

export interface McpCallToolResult {
  content: McpTextContent[];
  structuredContent?: unknown;
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

export type McpSafeToolResult<TValue> =
  | {
      ok: true;
      value: TValue;
      auditRecords?: readonly unknown[];
      policy?: unknown;
    }
  | {
      ok: false;
      error: McpSafeToolError;
      auditRecords?: readonly unknown[];
      policy?: unknown;
    };

export interface McpSafeToolError {
  code: "denied" | "approval_required" | "unknown" | "handler_failed" | string;
  message: string;
  toolName?: string;
  decision?: string;
  reason?: string;
  ruleId?: string;
  approvalId?: string;
  policy?: unknown;
}

export interface McpSafeToolAdapter {
  listTools(context?: McpRouteContext): MaybePromise<McpSafeToolResult<McpListToolsResult>>;
  callTool(
    toolName: string,
    args?: Record<string, unknown>,
    context?: McpRouteContext,
  ): MaybePromise<McpSafeToolResult<McpCallToolResult>>;
}

export type McpApprovalSessionStatus = "pending" | "approved" | "rejected" | "expired";

export interface McpApprovalSessionActor extends McpActor {
  metadata?: Record<string, unknown>;
}

export interface McpApprovalSessionFilter {
  status?: McpApprovalSessionStatus;
  actorId?: string;
}

export interface McpApprovalSessionTransition {
  actor?: McpApprovalSessionActor;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface McpApprovalSessionDecision {
  status: Exclude<McpApprovalSessionStatus, "pending">;
  at: string;
  actor?: McpApprovalSessionActor;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface McpApprovalSessionSnapshot {
  id: string;
  status: McpApprovalSessionStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  request: Record<string, unknown>;
  actor?: McpApprovalSessionActor;
  reason?: string;
  ruleId?: string;
  metadata?: Record<string, unknown>;
  decision?: McpApprovalSessionDecision;
  approvedAt?: string;
  approvedBy?: McpApprovalSessionActor;
  rejectedAt?: string;
  rejectedBy?: McpApprovalSessionActor;
  expiredAt?: string;
  expiredBy?: McpApprovalSessionActor;
}

export interface McpApprovalSessionStore {
  list(filter?: McpApprovalSessionFilter): MaybePromise<McpApprovalSessionSnapshot[]>;
  approve(
    sessionId: string,
    input?: McpApprovalSessionTransition,
  ): MaybePromise<McpApprovalSessionSnapshot>;
  reject(
    sessionId: string,
    input?: McpApprovalSessionTransition,
  ): MaybePromise<McpApprovalSessionSnapshot>;
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
  safeToolAdapter?: McpSafeToolAdapter;
  approvalSessionStore?: McpApprovalSessionStore;
}

export interface McpRoutesOptions {
  basePath?: string;
  pathStyle?: "legacy" | "openapi";
}

export function createMcpRoutes(
  dependencies: McpRouteDependencies,
  options: McpRoutesOptions = {},
): readonly ApiRoute[] {
  const basePath = normalizeBasePath(options.basePath ?? "/mcp");
  const paths = mcpRoutePaths(options.pathStyle ?? "legacy");

  return [
    {
      method: "GET",
      path: joinPath(basePath, paths.resources),
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
      path: joinPath(basePath, paths.resourceRead),
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
      method: "GET",
      path: joinPath(basePath, paths.tools),
      description: "Lists safe local MCP tools exposed by the injected adapter.",
      handler: async ({ request }) => {
        if (!dependencies.safeToolAdapter) {
          return missingDependencyError("safeToolAdapter");
        }

        const context = toStrictRouteContext(request.body, request.actorId);
        if (!context.ok) {
          return context.error;
        }

        try {
          return safeToolResultResponse(
            await dependencies.safeToolAdapter.listTools(context.value),
          );
        } catch (error) {
          return caughtSafeToolError(error, "Tool list failed.");
        }
      },
    },
    {
      method: "POST",
      path: joinPath(basePath, paths.toolExecute),
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
    {
      method: "POST",
      path: joinPath(basePath, paths.toolCall),
      description: "Calls a safe local MCP tool through injected policy and audit controls.",
      handler: async ({ request }) => {
        if (!dependencies.safeToolAdapter) {
          return missingDependencyError("safeToolAdapter");
        }

        const toolRequest = toSafeToolCallRequest(request.body, request.actorId);
        if (!toolRequest.ok) {
          return toolRequest.error;
        }

        try {
          const context = {
            actor: toolRequest.value.actor,
            metadata: toolRequest.value.metadata,
          };
          return safeToolResultResponse(
            await dependencies.safeToolAdapter.callTool(
              toolRequest.value.toolName,
              toolRequest.value.arguments,
              context,
            ),
          );
        } catch (error) {
          return caughtSafeToolError(error, "Tool call failed.");
        }
      },
    },
    {
      method: "GET",
      path: joinPath(basePath, paths.approvalSessions),
      description: "Lists MCP approval sessions from the injected session store.",
      handler: async ({ request }) => {
        if (!dependencies.approvalSessionStore) {
          return missingDependencyError("approvalSessionStore");
        }

        const listRequest = toApprovalSessionListRequest(request.body, request.actorId);
        if (!listRequest.ok) {
          return listRequest.error;
        }

        try {
          return jsonResponse(200, {
            sessions: await dependencies.approvalSessionStore.list(listRequest.value.filter),
          });
        } catch (error) {
          return caughtApprovalSessionError(error, "Approval session list failed.");
        }
      },
    },
    {
      method: "POST",
      path: joinPath(basePath, paths.approvalSessionDecision),
      description: "Records an approval or rejection decision for an MCP approval session.",
      handler: async ({ params, request }) => {
        if (!dependencies.approvalSessionStore) {
          return missingDependencyError("approvalSessionStore");
        }

        const decisionRequest = toApprovalSessionDecisionRequest(
          request.body,
          request.actorId,
          params.sessionId,
        );
        if (!decisionRequest.ok) {
          return decisionRequest.error;
        }

        try {
          const session =
            decisionRequest.value.decision === "approve"
              ? await dependencies.approvalSessionStore.approve(
                  decisionRequest.value.sessionId,
                  decisionRequest.value.transition,
                )
              : await dependencies.approvalSessionStore.reject(
                  decisionRequest.value.sessionId,
                  decisionRequest.value.transition,
                );

          return jsonResponse(200, { session });
        } catch (error) {
          return caughtApprovalSessionError(error, "Approval session decision failed.");
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

function safeToolResultResponse<TBody>(result: McpSafeToolResult<TBody>): ApiResponse<TBody> {
  if (result.ok) {
    return jsonResponse(200, result.value);
  }

  return jsonError(
    safeToolErrorStatus(result.error.code),
    safeToolErrorCode(result.error.code),
    result.error.message,
    safeToolErrorDetails(result.error),
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

function toSafeToolCallRequest(
  body: unknown,
  actorId: string | undefined,
):
  | { ok: true; value: McpToolExecutionPreviewRequest }
  | { ok: false; error: ApiResponse } {
  const record = asRecord(body);
  if (!record.ok) {
    return record;
  }

  const keys = allowedKeys(record.value, [
    "name",
    "toolName",
    "arguments",
    "actor",
    "metadata",
  ]);
  if (!keys.ok) {
    return keys;
  }

  const name = record.value.name;
  const toolName = record.value.toolName;
  if (name !== undefined && typeof name !== "string") {
    return {
      ok: false,
      error: validationError("Tool call name must be a string when provided.", { path: "body.name" }),
    };
  }
  if (toolName !== undefined && typeof toolName !== "string") {
    return {
      ok: false,
      error: validationError("Tool call toolName must be a string when provided.", { path: "body.toolName" }),
    };
  }
  if (
    typeof name === "string" &&
    typeof toolName === "string" &&
    name !== toolName
  ) {
    return {
      ok: false,
      error: validationError("Tool call name and toolName must match when both are provided.", {
        path: "body.name",
      }),
    };
  }

  const resolvedToolName = typeof toolName === "string" ? toolName : name;
  if (typeof resolvedToolName !== "string" || resolvedToolName.trim().length === 0) {
    return {
      ok: false,
      error: validationError("Tool call requires a non-empty name.", { path: "body.name" }),
    };
  }

  const args = record.value.arguments;
  if (args !== undefined && !isRecord(args)) {
    return {
      ok: false,
      error: validationError("Tool call arguments must be an object.", { path: "body.arguments" }),
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
      toolName: resolvedToolName,
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

function toStrictRouteContext(
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
  const keys = allowedKeys(record, ["actor", "metadata"]);
  if (!keys.ok) {
    return keys;
  }

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

function toApprovalSessionListRequest(
  body: unknown,
  actorId: string | undefined,
):
  | { ok: true; value: { filter: McpApprovalSessionFilter; context: McpRouteContext } }
  | { ok: false; error: ApiResponse } {
  if (body !== undefined && !isRecord(body)) {
    return {
      ok: false,
      error: validationError("Request body must be an object.", { path: "body" }),
    };
  }

  const record: Record<string, unknown> = body === undefined ? {} : body;
  const keys = allowedKeys(record, ["status", "actorId", "actor", "metadata"]);
  if (!keys.ok) {
    return keys;
  }

  const context = toStrictRouteContext(
    {
      ...(record.actor === undefined ? {} : { actor: record.actor }),
      ...(record.metadata === undefined ? {} : { metadata: record.metadata }),
    },
    actorId,
  );
  if (!context.ok) {
    return context;
  }

  const status = optionalApprovalStatus(record.status);
  if (!status.ok) {
    return status;
  }

  const actorIdFilter = record.actorId;
  if (
    actorIdFilter !== undefined &&
    (typeof actorIdFilter !== "string" || actorIdFilter.trim().length === 0)
  ) {
    return {
      ok: false,
      error: validationError("Approval session actorId must be non-empty when provided.", {
        path: "body.actorId",
      }),
    };
  }

  return {
    ok: true,
    value: {
      filter: {
        status: status.value,
        actorId: actorIdFilter,
      },
      context: context.value,
    },
  };
}

function toApprovalSessionDecisionRequest(
  body: unknown,
  actorId: string | undefined,
  pathSessionId: string | undefined,
):
  | {
      ok: true;
      value: {
        sessionId: string;
        decision: "approve" | "reject";
        transition: McpApprovalSessionTransition;
      };
    }
  | { ok: false; error: ApiResponse } {
  const record = asRecord(body);
  if (!record.ok) {
    return record;
  }

  const keys = allowedKeys(record.value, [
    "sessionId",
    "decision",
    "actor",
    "reason",
    "metadata",
  ]);
  if (!keys.ok) {
    return keys;
  }

  const bodySessionId = record.value.sessionId;
  if (
    bodySessionId !== undefined &&
    (typeof bodySessionId !== "string" || bodySessionId.trim().length === 0)
  ) {
    return {
      ok: false,
      error: validationError("Approval session decision requires a non-empty sessionId.", {
        path: "body.sessionId",
      }),
    };
  }

  if (
    typeof pathSessionId === "string" &&
    typeof bodySessionId === "string" &&
    bodySessionId !== pathSessionId
  ) {
    return {
      ok: false,
      error: validationError("Approval session path id and body sessionId must match.", {
        path: "body.sessionId",
      }),
    };
  }

  const sessionId = typeof pathSessionId === "string" ? pathSessionId : bodySessionId;
  if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
    return {
      ok: false,
      error: validationError("Approval session decision requires a non-empty sessionId.", {
        path: "body.sessionId",
      }),
    };
  }

  const decision = record.value.decision;
  if (decision !== "approve" && decision !== "reject") {
    return {
      ok: false,
      error: validationError("Approval session decision must be approve or reject.", {
        path: "body.decision",
      }),
    };
  }

  const actor = optionalApprovalActor(record.value.actor, actorId);
  if (!actor.ok) {
    return actor;
  }

  const reason = record.value.reason;
  if (reason !== undefined && typeof reason !== "string") {
    return {
      ok: false,
      error: validationError("Approval session decision reason must be a string when provided.", {
        path: "body.reason",
      }),
    };
  }

  const metadata = optionalRecord(record.value.metadata, "body.metadata");
  if (!metadata.ok) {
    return metadata;
  }

  return {
    ok: true,
    value: {
      sessionId,
      decision,
      transition: {
        actor: actor.value,
        reason,
        metadata: metadata.value,
      },
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

function allowedKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
): { ok: true } | { ok: false; error: ApiResponse } {
  const allowed = new Set(keys);
  const unknown = Object.keys(record).find((key) => !allowed.has(key));
  if (unknown) {
    return {
      ok: false,
      error: validationError("Request body contains an unknown field.", {
        path: `body.${unknown}`,
      }),
    };
  }

  return { ok: true };
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

function optionalApprovalActor(
  value: unknown,
  actorId: string | undefined,
): { ok: true; value?: McpApprovalSessionActor } | { ok: false; error: ApiResponse } {
  if (value === undefined) {
    return actorId ? { ok: true, value: { id: actorId } } : { ok: true };
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

  const metadata = optionalRecord(value.metadata, "body.actor.metadata");
  if (!metadata.ok) {
    return metadata;
  }

  const roles = value.roles as string[] | undefined;

  return {
    ok: true,
    value: {
      id: value.id,
      roles: roles === undefined ? undefined : [...roles],
      metadata: metadata.value,
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

function caughtSafeToolError(error: unknown, fallbackMessage: string): ApiResponse {
  const message = error instanceof Error ? error.message : fallbackMessage;
  const name = error instanceof Error ? error.name : "";
  const status = name === "ToolNotFoundError" ? 404 : 400;
  const code = name === "ToolNotFoundError"
    ? "tool_not_found"
    : "tool_call_failed";

  return jsonError(status, code, message);
}

function caughtApprovalSessionError(error: unknown, fallbackMessage: string): ApiResponse {
  const message = error instanceof Error ? error.message : fallbackMessage;
  const name = error instanceof Error ? error.name : "";

  if (name === "ApprovalSessionNotFoundError") {
    return jsonError(404, "approval_session_not_found", message, {
      sessionId: error instanceof Error && "sessionId" in error
        ? (error as { sessionId?: unknown }).sessionId
        : undefined,
    });
  }

  if (name === "ApprovalSessionStateError") {
    return jsonError(409, "approval_session_state_conflict", message, {
      sessionId: error instanceof Error && "sessionId" in error
        ? (error as { sessionId?: unknown }).sessionId
        : undefined,
      status: error instanceof Error && "status" in error
        ? (error as { status?: unknown }).status
        : undefined,
    });
  }

  return jsonError(400, "approval_session_failed", message);
}

function validationError(
  message: string,
  details: Readonly<Record<string, unknown>>,
): ApiResponse {
  return jsonError(400, "validation_failed", message, details);
}

function missingDependencyError(name: string): ApiResponse {
  return jsonError(501, "mcp_dependency_not_configured", `MCP route dependency is not configured: ${name}`, {
    dependency: name,
  });
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

function safeToolErrorStatus(code: string): number {
  if (code === "unknown") {
    return 404;
  }
  if (code === "denied") {
    return 403;
  }
  if (code === "approval_required") {
    return 409;
  }

  return 400;
}

function safeToolErrorCode(code: string): string {
  if (code === "unknown") {
    return "tool_not_found";
  }
  if (code === "denied") {
    return "tool_denied";
  }
  if (code === "approval_required") {
    return "approval_required";
  }

  return "tool_call_failed";
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

function safeToolErrorDetails(error: McpSafeToolError): Record<string, unknown> | undefined {
  const details = Object.fromEntries(
    Object.entries({
      toolName: error.toolName,
      decision: error.decision,
      reason: error.reason,
      ruleId: error.ruleId,
      approvalId: error.approvalId,
      policy: error.policy,
    }).filter(([, value]) => value !== undefined),
  );

  return Object.keys(details).length === 0 ? undefined : details;
}

function optionalApprovalStatus(
  value: unknown,
): { ok: true; value?: McpApprovalSessionStatus } | { ok: false; error: ApiResponse } {
  if (value === undefined) {
    return { ok: true };
  }

  if (
    value === "pending" ||
    value === "approved" ||
    value === "rejected" ||
    value === "expired"
  ) {
    return { ok: true, value };
  }

  return {
    ok: false,
    error: validationError(
      "Approval session status must be pending, approved, rejected, or expired.",
      { path: "body.status" },
    ),
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

function mcpRoutePaths(style: "legacy" | "openapi"): {
  resources: string;
  resourceRead: string;
  tools: string;
  toolExecute: string;
  toolCall: string;
  approvalSessions: string;
  approvalSessionDecision: string;
} {
  if (style === "openapi") {
    return {
      resources: "resources",
      resourceRead: "resources/read",
      tools: "tools",
      toolExecute: "tools/execute",
      toolCall: "tools/call",
      approvalSessions: "approval-sessions",
      approvalSessionDecision: "approval-sessions/:sessionId/decision",
    };
  }

  return {
    resources: "resources",
    resourceRead: "resources/read",
    tools: "tools",
    toolExecute: "tools/execute-preview",
    toolCall: "tools/call",
    approvalSessions: "approval-sessions",
    approvalSessionDecision: "approval-sessions/decide",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
