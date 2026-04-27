import type {
  GatewayAdapterContext,
  GatewayAuditIntent,
  GatewayResourceAdapter,
  GatewayResult,
  McpListResourcesResult,
  McpListToolsResult,
  McpReadResourceResult,
} from "./adapter.ts";
import type { ToolAuditRecord } from "./auditEmitter.ts";
import type {
  McpCallSafeLocalToolResult,
  SafeLocalToolAdapterResult,
} from "./toolAdapter.ts";

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
  capabilities: McpProtocolCapabilities;
  serverInfo: {
    name: string;
    version: string;
  };
}

export type McpProtocolResultValue =
  | McpInitializeResult
  | McpListResourcesResult
  | McpReadResourceResult
  | McpListToolsResult
  | McpCallSafeLocalToolResult;

export type McpProtocolCapabilities = Record<string, unknown> & {
  resources?: Record<string, unknown>;
  tools?: Record<string, unknown>;
};

export interface McpProtocolSuccessResponse<TValue = McpProtocolResultValue> {
  jsonrpc: typeof MCP_PROTOCOL_JSONRPC_VERSION;
  id: McpProtocolRequestId;
  result: {
    ok: true;
    value: TValue;
    auditIntents: GatewayAuditIntent[];
    auditRecords?: ToolAuditRecord[];
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
    toolName?: string;
    reason?: string;
    approvalId?: string;
  };
  auditIntents: GatewayAuditIntent[];
  auditRecords?: ToolAuditRecord[];
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

export interface McpProtocolAdapterMetadata {
  name: string;
  version: string;
  capabilities: McpProtocolCapabilities;
}

export type McpProtocolListToolsResult =
  | GatewayResult<McpListToolsResult>
  | SafeLocalToolAdapterResult<McpListToolsResult>;

export interface McpProtocolGatewayAdapter {
  readonly metadata?: McpProtocolAdapterMetadata;
  readonly resourceAdapter?: Pick<GatewayResourceAdapter, "metadata">;
  listResources(
    context?: GatewayAdapterContext,
  ): Promise<GatewayResult<McpListResourcesResult>>;
  readResource(
    uri: string,
    context?: GatewayAdapterContext,
  ): Promise<GatewayResult<McpReadResourceResult>>;
  listTools(): McpProtocolListToolsResult;
  callTool?(
    toolName: string,
    args?: Record<string, unknown>,
    context?: GatewayAdapterContext,
  ): Promise<SafeLocalToolAdapterResult<McpCallSafeLocalToolResult>>;
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
  adapter: McpProtocolGatewayAdapter,
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
  adapter: McpProtocolGatewayAdapter,
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
    case "tools/call":
      return handleToolsCall(adapter, requestId, request.params, context);
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
  adapter: McpProtocolGatewayAdapter,
  id: McpProtocolRequestId,
  params: unknown,
  options: McpProtocolAdapterOptions,
): McpProtocolResponse<McpInitializeResult> {
  const validation = validateOptionalParamsObject(params);
  if (validation) {
    return validationError(id, validation);
  }

  const metadata = adapterMetadata(adapter);
  if (!metadata) {
    return protocolError(
      id,
      MCP_PROTOCOL_ERROR_CODES.internalError,
      "Adapter metadata unavailable.",
      {
        code: "internal_error",
      },
    );
  }

  return success(id, {
    ok: true,
    value: {
      protocolVersion: options.protocolVersion ?? MCP_GATEWAY_PROTOCOL_VERSION,
      capabilities: adapterCapabilities(adapter, metadata.capabilities),
      serverInfo: {
        name: metadata.name,
        version: metadata.version,
      },
    },
    auditIntents: [],
  });
}

async function handleResourcesList(
  adapter: McpProtocolGatewayAdapter,
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
  adapter: McpProtocolGatewayAdapter,
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
  adapter: McpProtocolGatewayAdapter,
  id: McpProtocolRequestId,
  params: unknown,
): Promise<McpProtocolResponse<McpListToolsResult>> {
  const validation = validateOptionalParamsObject(params);
  if (validation) {
    return validationError(id, validation);
  }

  try {
    return fromCompatibleResult(id, adapter.listTools());
  } catch (error) {
    return internalError(id, error);
  }
}

async function handleToolsCall(
  adapter: McpProtocolGatewayAdapter,
  id: McpProtocolRequestId,
  params: unknown,
  context: GatewayAdapterContext,
): Promise<McpProtocolResponse<McpCallSafeLocalToolResult>> {
  if (!adapter.callTool) {
    return protocolError(
      id,
      MCP_PROTOCOL_ERROR_CODES.methodNotFound,
      "Adapter does not support tools/call.",
      {
        code: "method_not_found",
        details: { method: "tools/call" },
      },
    );
  }

  const normalized = normalizeToolCallParams(params);
  if (!normalized.ok) {
    return validationError(id, normalized.error);
  }

  try {
    return fromToolAdapterResult(
      id,
      await adapter.callTool(normalized.toolName, normalized.arguments, context),
    );
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

function fromCompatibleResult<TValue>(
  id: McpProtocolRequestId,
  result: GatewayResult<TValue> | SafeLocalToolAdapterResult<TValue>,
): McpProtocolResponse<TValue> {
  if (hasAuditRecords(result)) {
    return fromToolAdapterResult(id, result);
  }

  return fromGatewayResult(id, result);
}

function fromToolAdapterResult<TValue>(
  id: McpProtocolRequestId,
  result: SafeLocalToolAdapterResult<TValue>,
): McpProtocolResponse<TValue> {
  if (result.ok) {
    return success(id, {
      ok: true,
      value: result.value,
      auditIntents: [],
      auditRecords: result.auditRecords,
    });
  }

  return {
    jsonrpc: MCP_PROTOCOL_JSONRPC_VERSION,
    id,
    error: {
      code: toolErrorCode(result.error.code),
      message: result.error.message,
      data: {
        ok: false,
        error: pruneUndefined({
          code: result.error.code,
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

function success<TValue>(
  id: McpProtocolRequestId,
  result: {
    ok: true;
    value: TValue;
    auditIntents?: GatewayAuditIntent[];
    auditRecords?: ToolAuditRecord[];
  },
): McpProtocolSuccessResponse<TValue> {
  return {
    jsonrpc: MCP_PROTOCOL_JSONRPC_VERSION,
    id,
    result: {
      ok: true,
      value: result.value,
      auditIntents: result.auditIntents ?? [],
      ...(result.auditRecords ? { auditRecords: result.auditRecords } : {}),
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

function normalizeToolCallParams(
  params: unknown,
):
  | {
      ok: true;
      toolName: string;
      arguments: Record<string, unknown>;
    }
  | {
      ok: false;
      error: { message: string; details: Record<string, unknown> };
    } {
  if (!isRecord(params)) {
    return {
      ok: false,
      error: {
        message: "tools/call params must be an object.",
        details: {
          param: "params",
          expected: "object with name or toolName and arguments",
        },
      },
    };
  }

  const toolName = firstNonEmptyString(params.name, params.toolName);
  if (!toolName) {
    return {
      ok: false,
      error: {
        message: "tools/call requires a non-empty tool name.",
        details: {
          param: "name",
          expected: "non-empty string name or toolName",
        },
      },
    };
  }

  if (params.arguments !== undefined && !isRecord(params.arguments)) {
    return {
      ok: false,
      error: {
        message: "tools/call arguments must be an object when provided.",
        details: { param: "arguments", expected: "object" },
      },
    };
  }

  return {
    ok: true,
    toolName,
    arguments: params.arguments ? { ...params.arguments } : {},
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

function toolErrorCode(code: string): number {
  if (code === "unknown") {
    return MCP_PROTOCOL_ERROR_CODES.notFound;
  }

  if (code === "denied" || code === "approval_required") {
    return MCP_PROTOCOL_ERROR_CODES.accessRejected;
  }

  return MCP_PROTOCOL_ERROR_CODES.gatewayError;
}

function adapterMetadata(
  adapter: McpProtocolGatewayAdapter,
): McpProtocolAdapterMetadata | undefined {
  return adapter.metadata ?? adapter.resourceAdapter?.metadata;
}

function adapterCapabilities(
  adapter: McpProtocolGatewayAdapter,
  capabilities: McpProtocolCapabilities,
): McpProtocolCapabilities {
  const cloned = cloneJsonLike(capabilities) as McpProtocolCapabilities;

  if (!adapter.callTool) {
    return cloned;
  }

  return {
    ...cloned,
    tools: {
      ...(isRecord(cloned.tools) ? cloned.tools : {}),
      call: true,
    },
  };
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

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

function hasAuditRecords<TValue>(
  result: GatewayResult<TValue> | SafeLocalToolAdapterResult<TValue>,
): result is SafeLocalToolAdapterResult<TValue> {
  return "auditRecords" in result;
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

function cloneJsonLike<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => cloneJsonLike(entry)) as T;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
      key,
      cloneJsonLike(entryValue),
    ]),
  ) as T;
}
