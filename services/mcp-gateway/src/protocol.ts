import type {
  GatewayAdapterContext,
  GatewayAuditIntent,
  GatewayResourceAdapter,
  GatewayResult,
  McpListResourcesResult,
  McpListToolsResult,
  McpReadResourceResult,
} from "./adapter.ts";

export const MCP_PROTOCOL_JSONRPC_VERSION = "2.0";
export const MCP_GATEWAY_PROTOCOL_VERSION = "2024-11-05";

export const MCP_PROTOCOL_ERROR_CODES = Object.freeze({
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
  gatewayError: -32000,
  accessRejected: -32001,
  notFound: -32004,
});

export type McpProtocolRequestId = string | number | null;

export interface McpProtocolRequest {
  jsonrpc?: typeof MCP_PROTOCOL_JSONRPC_VERSION;
  id?: McpProtocolRequestId;
  method: string;
  params?: unknown;
}

export interface McpInitializeResult {
  protocolVersion: string;
  capabilities: GatewayResourceAdapter["metadata"]["capabilities"];
  serverInfo: {
    name: string;
    version: string;
  };
}

export type McpProtocolResultValue =
  | McpInitializeResult
  | McpListResourcesResult
  | McpReadResourceResult
  | McpListToolsResult;

export interface McpProtocolSuccessResponse<TValue = McpProtocolResultValue> {
  jsonrpc: typeof MCP_PROTOCOL_JSONRPC_VERSION;
  id: McpProtocolRequestId;
  result: {
    ok: true;
    value: TValue;
    auditIntents: GatewayAuditIntent[];
  };
}

export interface McpProtocolErrorEnvelope {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    uri?: string;
    capability?: string;
    decision?: string;
    ruleId?: string;
  };
  auditIntents: GatewayAuditIntent[];
}

export interface McpProtocolErrorResponse {
  jsonrpc: typeof MCP_PROTOCOL_JSONRPC_VERSION;
  id: McpProtocolRequestId;
  error: {
    code: number;
    message: string;
    data: McpProtocolErrorEnvelope;
  };
}

export type McpProtocolResponse<TValue = McpProtocolResultValue> =
  | McpProtocolSuccessResponse<TValue>
  | McpProtocolErrorResponse;

export interface McpProtocolAdapterOptions {
  protocolVersion?: string;
}

export interface McpProtocolAdapter {
  handle(
    request: unknown,
    context?: GatewayAdapterContext,
  ): Promise<McpProtocolResponse>;
  handleRequest(
    request: unknown,
    context?: GatewayAdapterContext,
  ): Promise<McpProtocolResponse>;
}

export function createMcpProtocolAdapter(
  adapter: GatewayResourceAdapter,
  options: McpProtocolAdapterOptions = {},
): McpProtocolAdapter {
  return {
    handle(request, context = {}) {
      return handleMcpProtocolRequest(adapter, request, context, options);
    },
    handleRequest(request, context = {}) {
      return handleMcpProtocolRequest(adapter, request, context, options);
    },
  };
}

export const createGatewayProtocolAdapter = createMcpProtocolAdapter;

export async function handleMcpProtocolRequest(
  adapter: GatewayResourceAdapter,
  request: unknown,
  context: GatewayAdapterContext = {},
  options: McpProtocolAdapterOptions = {},
): Promise<McpProtocolResponse> {
  const requestId = extractRequestId(request);

  if (!isRecord(request)) {
    return protocolError(requestId, MCP_PROTOCOL_ERROR_CODES.invalidRequest, "Invalid request.", {
      code: "invalid_request",
      details: { reason: "Request must be an object." },
    });
  }

  if (!isValidJsonRpcVersion(request.jsonrpc)) {
    return protocolError(requestId, MCP_PROTOCOL_ERROR_CODES.invalidRequest, "Invalid request.", {
      code: "invalid_request",
      details: { param: "jsonrpc", expected: MCP_PROTOCOL_JSONRPC_VERSION },
    });
  }

  if (!isValidRequestId(request.id)) {
    return protocolError(null, MCP_PROTOCOL_ERROR_CODES.invalidRequest, "Invalid request id.", {
      code: "invalid_request",
      details: { param: "id", expected: "string, number, null, or omitted" },
    });
  }

  if (typeof request.method !== "string" || request.method.trim().length === 0) {
    return protocolError(requestId, MCP_PROTOCOL_ERROR_CODES.invalidRequest, "Invalid method.", {
      code: "invalid_request",
      details: { param: "method", expected: "non-empty string" },
    });
  }

  switch (request.method) {
    case "initialize":
      return handleInitialize(adapter, requestId, request.params, options);
    case "resources/list":
      return handleResourcesList(adapter, requestId, request.params, context);
    case "resources/read":
      return handleResourcesRead(adapter, requestId, request.params, context);
    case "tools/list":
      return handleToolsList(adapter, requestId, request.params);
    default:
      return protocolError(
        requestId,
        MCP_PROTOCOL_ERROR_CODES.methodNotFound,
        `Unsupported method: ${request.method}`,
        {
          code: "method_not_found",
          details: { method: request.method },
        },
      );
  }
}

export const handleGatewayProtocolRequest = handleMcpProtocolRequest;

function handleInitialize(
  adapter: GatewayResourceAdapter,
  id: McpProtocolRequestId,
  params: unknown,
  options: McpProtocolAdapterOptions,
): McpProtocolResponse<McpInitializeResult> {
  const validation = validateOptionalParamsObject(params);
  if (validation) {
    return validationError(id, validation);
  }

  return success(id, {
    ok: true,
    value: {
      protocolVersion: options.protocolVersion ?? MCP_GATEWAY_PROTOCOL_VERSION,
      capabilities: adapter.metadata.capabilities,
      serverInfo: {
        name: adapter.metadata.name,
        version: adapter.metadata.version,
      },
    },
    auditIntents: [],
  });
}

async function handleResourcesList(
  adapter: GatewayResourceAdapter,
  id: McpProtocolRequestId,
  params: unknown,
  context: GatewayAdapterContext,
): Promise<McpProtocolResponse<McpListResourcesResult>> {
  const validation = validateOptionalParamsObject(params);
  if (validation) {
    return validationError(id, validation);
  }

  try {
    return fromGatewayResult(id, await adapter.listResources(context));
  } catch (error) {
    return internalError(id, error);
  }
}

async function handleResourcesRead(
  adapter: GatewayResourceAdapter,
  id: McpProtocolRequestId,
  params: unknown,
  context: GatewayAdapterContext,
): Promise<McpProtocolResponse<McpReadResourceResult>> {
  if (!isRecord(params)) {
    return validationError(id, {
      message: "resources/read params must be an object.",
      details: { param: "params", expected: "object with uri" },
    });
  }

  if (typeof params.uri !== "string" || params.uri.trim().length === 0) {
    return validationError(id, {
      message: "resources/read requires a non-empty uri.",
      details: { param: "uri", expected: "non-empty string" },
    });
  }

  try {
    return fromGatewayResult(id, await adapter.readResource(params.uri, context));
  } catch (error) {
    return internalError(id, error);
  }
}

async function handleToolsList(
  adapter: GatewayResourceAdapter,
  id: McpProtocolRequestId,
  params: unknown,
): Promise<McpProtocolResponse<McpListToolsResult>> {
  const validation = validateOptionalParamsObject(params);
  if (validation) {
    return validationError(id, validation);
  }

  try {
    return fromGatewayResult(id, await adapter.listTools());
  } catch (error) {
    return internalError(id, error);
  }
}

function fromGatewayResult<TValue>(
  id: McpProtocolRequestId,
  result: GatewayResult<TValue>,
): McpProtocolResponse<TValue> {
  if (result.ok) {
    return success(id, result);
  }

  return {
    jsonrpc: MCP_PROTOCOL_JSONRPC_VERSION,
    id,
    error: {
      code: gatewayErrorCode(result.error.code),
      message: result.error.message,
      data: {
        ok: false,
        error: pruneUndefined({
          code: result.error.code,
          message: result.error.message,
          uri: result.error.uri,
          capability: result.error.capability,
          decision: result.error.decision,
          ruleId: result.error.ruleId,
        }),
        auditIntents: result.auditIntents,
      },
    },
  };
}

function success<TValue>(
  id: McpProtocolRequestId,
  result: Extract<GatewayResult<TValue>, { ok: true }>,
): McpProtocolSuccessResponse<TValue> {
  return {
    jsonrpc: MCP_PROTOCOL_JSONRPC_VERSION,
    id,
    result: {
      ok: true,
      value: result.value,
      auditIntents: result.auditIntents,
    },
  };
}

function validationError(
  id: McpProtocolRequestId,
  validation: { message: string; details: Record<string, unknown> },
): McpProtocolErrorResponse {
  return protocolError(id, MCP_PROTOCOL_ERROR_CODES.invalidParams, validation.message, {
    code: "invalid_params",
    details: validation.details,
  });
}

function internalError(id: McpProtocolRequestId, error: unknown): McpProtocolErrorResponse {
  const message = error instanceof Error ? error.message : String(error);

  return protocolError(id, MCP_PROTOCOL_ERROR_CODES.internalError, message, {
    code: "internal_error",
  });
}

function protocolError(
  id: McpProtocolRequestId,
  code: number,
  message: string,
  error: {
    code: string;
    details?: Record<string, unknown>;
  },
): McpProtocolErrorResponse {
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

function validateOptionalParamsObject(
  params: unknown,
): { message: string; details: Record<string, unknown> } | undefined {
  if (params === undefined || isRecord(params)) {
    return undefined;
  }

  return {
    message: "Params must be an object when provided.",
    details: { param: "params", expected: "object" },
  };
}

function gatewayErrorCode(code: string): number {
  if (code === "resource_not_found") {
    return MCP_PROTOCOL_ERROR_CODES.notFound;
  }

  if (code === "policy_denied" || code === "approval_required") {
    return MCP_PROTOCOL_ERROR_CODES.accessRejected;
  }

  return MCP_PROTOCOL_ERROR_CODES.gatewayError;
}

function extractRequestId(request: unknown): McpProtocolRequestId {
  if (!isRecord(request) || !isValidRequestId(request.id)) {
    return null;
  }

  return request.id ?? null;
}

function isValidJsonRpcVersion(value: unknown): boolean {
  return value === undefined || value === MCP_PROTOCOL_JSONRPC_VERSION;
}

function isValidRequestId(value: unknown): value is McpProtocolRequestId | undefined {
  return (
    value === undefined ||
    value === null ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
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
