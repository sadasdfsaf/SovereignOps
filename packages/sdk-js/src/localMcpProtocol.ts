import {
  MCP_PROTOCOL_ERROR_CODES,
  MCP_PROTOCOL_JSONRPC_VERSION,
  createMcpGatewayRuntime,
  createMcpProtocolAdapter,
  type GatewayAdapterContext,
  type GatewayAuditIntent,
  type GatewayResourceAdapter,
  type McpCallSafeLocalToolResult,
  type McpGatewayRuntime,
  type McpGatewayRuntimeOptions,
  type McpInitializeResult,
  type McpListResourcesResult,
  type McpListSafeLocalToolsResult,
  type McpListToolsResult,
  type McpProtocolAdapter,
  type McpProtocolGatewayAdapter,
  type McpProtocolRequestId,
  type McpReadResourceResult,
  type SafeLocalToolAdapterContext,
  type SafeLocalToolAdapterErrorCode,
  type SafeLocalToolAdapterResult,
  type ToolAuditRecord,
} from "../../../services/mcp-gateway/src/index.ts";

export type LocalMcpProtocolRuntimeOptions = McpGatewayRuntimeOptions;
export type LocalMcpProtocolContext = GatewayAdapterContext & SafeLocalToolAdapterContext;

export interface LocalMcpProtocolClientOptions extends LocalMcpProtocolRuntimeOptions {
  readonly protocolVersion?: string;
  readonly requestIdPrefix?: string;
}

export type LocalMcpProtocolResultValue =
  | McpInitializeResult
  | McpListResourcesResult
  | McpReadResourceResult
  | McpListToolsResult
  | McpListSafeLocalToolsResult
  | McpCallSafeLocalToolResult;

export interface LocalMcpProtocolSuccessResponse<
  TValue = LocalMcpProtocolResultValue,
> {
  readonly jsonrpc: typeof MCP_PROTOCOL_JSONRPC_VERSION;
  readonly id: McpProtocolRequestId;
  readonly result: {
    readonly ok: true;
    readonly value: TValue;
    readonly auditIntents: GatewayAuditIntent[];
    readonly auditRecords?: ToolAuditRecord[];
  };
}

export interface LocalMcpProtocolErrorResponse {
  readonly jsonrpc: typeof MCP_PROTOCOL_JSONRPC_VERSION;
  readonly id: McpProtocolRequestId;
  readonly error: {
    readonly code: number;
    readonly message: string;
    readonly data: {
      readonly ok: false;
      readonly error: LocalMcpProtocolError;
      readonly auditIntents: GatewayAuditIntent[];
      readonly auditRecords?: ToolAuditRecord[];
    };
  };
}

export interface LocalMcpProtocolError {
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
  readonly uri?: string;
  readonly capability?: string;
  readonly decision?: string;
  readonly ruleId?: string;
  readonly toolName?: string;
  readonly approvalId?: string;
  readonly reason?: string;
}

export type LocalMcpProtocolResponse<TValue = LocalMcpProtocolResultValue> =
  | LocalMcpProtocolSuccessResponse<TValue>
  | LocalMcpProtocolErrorResponse;

export interface LocalMcpProtocolRequest {
  readonly jsonrpc?: typeof MCP_PROTOCOL_JSONRPC_VERSION;
  readonly id?: McpProtocolRequestId;
  readonly method: string;
  readonly params?: unknown;
}

export interface LocalMcpProtocolMethodOptions {
  readonly id?: McpProtocolRequestId;
  readonly context?: LocalMcpProtocolContext;
}

export interface LocalMcpProtocolInitializeOptions extends LocalMcpProtocolMethodOptions {
  readonly params?: Record<string, unknown>;
}

export interface LocalMcpProtocolListResourcesOptions
  extends LocalMcpProtocolMethodOptions {
  readonly params?: Record<string, unknown>;
}

export interface LocalMcpProtocolReadResourceOptions
  extends LocalMcpProtocolMethodOptions {
  readonly uri: string;
}

export interface LocalMcpProtocolListToolsOptions extends LocalMcpProtocolMethodOptions {
  readonly params?: Record<string, unknown>;
}

export interface LocalMcpProtocolCallToolOptions extends LocalMcpProtocolMethodOptions {
  readonly name: string;
  readonly arguments?: Record<string, unknown>;
}

export interface LocalMcpProtocolClient {
  readonly runtime: McpGatewayRuntime;
  readonly protocol: McpProtocolAdapter;
  request<TValue = LocalMcpProtocolResultValue>(
    request: unknown,
    context?: LocalMcpProtocolContext,
  ): Promise<LocalMcpProtocolResponse<TValue>>;
  dispatch<TValue = LocalMcpProtocolResultValue>(
    request: unknown,
    context?: LocalMcpProtocolContext,
  ): Promise<LocalMcpProtocolResponse<TValue>>;
  initialize(
    options?: LocalMcpProtocolInitializeOptions,
  ): Promise<LocalMcpProtocolResponse<McpInitializeResult>>;
  listResources(
    options?: LocalMcpProtocolListResourcesOptions,
  ): Promise<LocalMcpProtocolResponse<McpListResourcesResult>>;
  readResource(
    options: LocalMcpProtocolReadResourceOptions,
  ): Promise<LocalMcpProtocolResponse<McpReadResourceResult>>;
  listTools(
    options?: LocalMcpProtocolListToolsOptions,
  ): Promise<LocalMcpProtocolResponse<McpListSafeLocalToolsResult>>;
  callTool(
    options: LocalMcpProtocolCallToolOptions,
  ): Promise<LocalMcpProtocolResponse<McpCallSafeLocalToolResult>>;
}

export function createLocalMcpProtocolClient(
  options: LocalMcpProtocolClientOptions = {},
): LocalMcpProtocolClient {
  const { protocolVersion, requestIdPrefix = "sdk-local-mcp-", ...runtimeOptions } =
    options;
  const runtime = createMcpGatewayRuntime(runtimeOptions);
  const protocol = createMcpProtocolAdapter(createRuntimeProtocolAdapter(runtime), {
    protocolVersion,
  });
  let requestIdSequence = 1;

  const nextRequestId = () => `${requestIdPrefix}${requestIdSequence++}`;
  const requestFor = (
    method: string,
    params: unknown,
    id: McpProtocolRequestId | undefined,
  ): LocalMcpProtocolRequest =>
    pruneUndefined({
      jsonrpc: MCP_PROTOCOL_JSONRPC_VERSION,
      id: id === undefined ? nextRequestId() : id,
      method,
      params,
    });

  const client: LocalMcpProtocolClient = {
    runtime,
    protocol,
    async request(request, context = {}) {
      const response = await protocol.handleRequest(request, context);
      if (isUnsupportedToolsCall(request, response)) {
        return handleLocalToolsCall(runtime, request, context);
      }

      return response as LocalMcpProtocolResponse;
    },
    dispatch(request, context = {}) {
      return client.request(request, context);
    },
    initialize(methodOptions = {}) {
      return client.request(
        requestFor("initialize", methodOptions.params ?? {}, methodOptions.id),
        methodOptions.context,
      );
    },
    listResources(methodOptions = {}) {
      return client.request(
        requestFor("resources/list", methodOptions.params ?? {}, methodOptions.id),
        methodOptions.context,
      );
    },
    readResource(methodOptions) {
      return client.request(
        requestFor(
          "resources/read",
          {
            uri: methodOptions.uri,
          },
          methodOptions.id,
        ),
        methodOptions.context,
      );
    },
    listTools(methodOptions = {}) {
      return client.request(
        requestFor("tools/list", methodOptions.params ?? {}, methodOptions.id),
        methodOptions.context,
      );
    },
    callTool(methodOptions) {
      return client.request(
        requestFor(
          "tools/call",
          {
            name: methodOptions.name,
            arguments: methodOptions.arguments ?? {},
          },
          methodOptions.id,
        ),
        methodOptions.context,
      );
    },
  };

  return client;
}

export const createLocalMcpJsonRpcClient = createLocalMcpProtocolClient;
export const createLocalMcpProtocolRuntimeClient = createLocalMcpProtocolClient;

function createRuntimeProtocolAdapter(runtime: McpGatewayRuntime): McpProtocolGatewayAdapter {
  const resourceAdapter = runtime.resourceAdapter;

  return {
    metadata: localRuntimeProtocolMetadata(resourceAdapter),
    resourceAdapter,
    listResources(context = {}) {
      return runtime.listResources(context);
    },
    readResource(uri, context = {}) {
      return runtime.readResource(uri, context);
    },
    listTools() {
      return runtime.listTools();
    },
    callTool(toolName, args, context = {}) {
      return runtime.callTool(toolName, args, context);
    },
  };
}

function localRuntimeProtocolMetadata(
  adapter: GatewayResourceAdapter,
): NonNullable<McpProtocolGatewayAdapter["metadata"]> {
  return {
    ...adapter.metadata,
    capabilities: {
      ...adapter.metadata.capabilities,
      tools: {
        ...adapter.metadata.capabilities.tools,
        call: true,
      },
    },
  };
}

async function handleLocalToolsCall(
  runtime: McpGatewayRuntime,
  request: LocalMcpProtocolRequest,
  context: LocalMcpProtocolContext,
): Promise<LocalMcpProtocolResponse<McpCallSafeLocalToolResult>> {
  const id = request.id ?? null;
  const params = request.params;

  if (!isRecord(params)) {
    return validationError(id, "tools/call params must be an object.", {
      param: "params",
      expected: "object with name and arguments",
    });
  }

  const name = readToolName(params);
  if (!name) {
    return validationError(id, "tools/call requires a non-empty name.", {
      param: "name",
      expected: "non-empty string",
    });
  }

  const args = params.arguments ?? params.args ?? {};
  if (!isRecord(args)) {
    return validationError(id, "tools/call arguments must be an object.", {
      param: "arguments",
      expected: "object",
    });
  }

  try {
    return fromToolResult(id, await runtime.callTool(name, args, context));
  } catch (error) {
    return protocolError(
      id,
      MCP_PROTOCOL_ERROR_CODES.internalError,
      error instanceof Error ? error.message : String(error),
      {
        code: "internal_error",
      },
    );
  }
}

function readToolName(params: Record<string, unknown>): string | undefined {
  const name = params.name ?? params.toolName;
  if (typeof name !== "string" || name.trim().length === 0) {
    return undefined;
  }

  return name;
}

function fromToolResult(
  id: McpProtocolRequestId,
  result: SafeLocalToolAdapterResult<McpCallSafeLocalToolResult>,
): LocalMcpProtocolResponse<McpCallSafeLocalToolResult> {
  if (result.ok) {
    return {
      jsonrpc: MCP_PROTOCOL_JSONRPC_VERSION,
      id,
      result: {
        ok: true,
        value: result.value,
        auditIntents: [],
        auditRecords: result.auditRecords,
      },
    };
  }

  return {
    jsonrpc: MCP_PROTOCOL_JSONRPC_VERSION,
    id,
    error: {
      code: toolProtocolErrorCode(result.error.code),
      message: result.error.message,
      data: {
        ok: false,
        error: pruneUndefined({
          code: toolProtocolErrorName(result.error.code),
          message: result.error.message,
          toolName: result.error.toolName,
          decision: result.error.decision,
          reason: result.error.reason,
          ruleId: result.error.ruleId,
          approvalId: result.error.approvalId,
        }),
        auditIntents: [],
        auditRecords: result.auditRecords,
      },
    },
  };
}

function toolProtocolErrorCode(code: SafeLocalToolAdapterErrorCode): number {
  if (code === "approval_required" || code === "denied") {
    return MCP_PROTOCOL_ERROR_CODES.accessRejected;
  }

  if (code === "unknown") {
    return MCP_PROTOCOL_ERROR_CODES.notFound;
  }

  return MCP_PROTOCOL_ERROR_CODES.gatewayError;
}

function toolProtocolErrorName(code: SafeLocalToolAdapterErrorCode): string {
  if (code === "denied") {
    return "policy_denied";
  }

  return code;
}

function validationError(
  id: McpProtocolRequestId,
  message: string,
  details: Record<string, unknown>,
): LocalMcpProtocolErrorResponse {
  return protocolError(id, MCP_PROTOCOL_ERROR_CODES.invalidParams, message, {
    code: "invalid_params",
    details,
  });
}

function protocolError(
  id: McpProtocolRequestId,
  code: number,
  message: string,
  error: {
    readonly code: string;
    readonly details?: Record<string, unknown>;
  },
): LocalMcpProtocolErrorResponse {
  return {
    jsonrpc: MCP_PROTOCOL_JSONRPC_VERSION,
    id,
    error: {
      code,
      message,
      data: {
        ok: false,
        error: pruneUndefined({
          code: error.code,
          message,
          details: error.details,
        }),
        auditIntents: [],
      },
    },
  };
}

function isUnsupportedToolsCall(
  request: unknown,
  response: LocalMcpProtocolResponse,
): request is LocalMcpProtocolRequest {
  return (
    isRecord(request) &&
    request.method === "tools/call" &&
    "error" in response &&
    response.error.data.error.code === "method_not_found"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}
