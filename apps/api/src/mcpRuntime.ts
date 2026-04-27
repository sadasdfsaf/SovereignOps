import type {
  McpGatewayRuntime,
  McpGatewayRuntimeOptions,
} from "../../../services/mcp-gateway/src/index.ts";
import { createMcpGatewayRuntime } from "../../../services/mcp-gateway/src/index.ts";
import type {
  McpRouteDependencies,
  McpRouteContext,
  McpToolExecutionPreviewRequest,
} from "./mcpRoutes.ts";

export interface McpRuntimeRouteDependencies {
  runtime: McpGatewayRuntime;
  dependencies: McpRouteDependencies;
}

export interface McpRuntimeRouteOptions {
  runtime?: McpGatewayRuntime;
  runtimeOptions?: McpGatewayRuntimeOptions;
}

export interface McpRuntimeToolPreview {
  ok: boolean;
  value?: unknown;
  error?: unknown;
  policy?: unknown;
  auditRecords: readonly unknown[];
}

export function createMcpRuntimeRouteDependencies(
  options: McpRuntimeRouteOptions = {},
): McpRuntimeRouteDependencies {
  if (options.runtime && options.runtimeOptions) {
    throw new Error("Provide either an MCP runtime or runtimeOptions, not both.");
  }

  const runtime = options.runtime ?? createMcpGatewayRuntime(options.runtimeOptions);

  return {
    runtime,
    dependencies: {
      adapter: {
        listResources: (context) => runtime.listResources(context),
        readResource: (uri, context) => runtime.readResource(uri, context),
      },
      safeToolAdapter: {
        listTools: () => runtime.listTools(),
        callTool: (toolName, args, context) => runtime.callTool(toolName, args, context),
      },
      approvalSessionStore: runtime.approvals,
      executeToolPreview: (request, context) =>
        previewRuntimeToolCall(runtime, request, context),
    },
  };
}

export async function previewRuntimeToolCall(
  runtime: McpGatewayRuntime,
  request: McpToolExecutionPreviewRequest,
  context: McpRouteContext = {},
): Promise<McpRuntimeToolPreview> {
  const result = await runtime.callTool(request.toolName, request.arguments, {
    actor: request.actor ?? context.actor,
    metadata: {
      ...context.metadata,
      ...request.metadata,
      operation: "tools.execute-preview",
    },
  });

  if (result.ok) {
    return {
      ok: true,
      value: result.value,
      policy: result.policy,
      auditRecords: result.auditRecords,
    };
  }

  return {
    ok: false,
    error: result.error,
    policy: result.policy,
    auditRecords: result.auditRecords,
  };
}
