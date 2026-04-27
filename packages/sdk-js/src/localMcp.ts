import {
  type ApprovalSessionSnapshot,
  type AuditRecord,
  type GatewayAdapterContext,
  type ListApprovalSessionsFilter,
  type McpGatewayRuntime,
  type McpGatewayRuntimeAuditSnapshot,
  type McpGatewayRuntimeOptions,
  type SafeLocalToolAdapterContext,
  type ToolAuditRecord,
  createMcpGatewayRuntime,
} from "../../../services/mcp-gateway/src/index.ts";

export type LocalMcpRuntimeOptions = McpGatewayRuntimeOptions;
export type LocalMcpResourceContext = GatewayAdapterContext;
export type LocalMcpToolContext = SafeLocalToolAdapterContext;
export type LocalMcpApprovalSession = ApprovalSessionSnapshot;
export type LocalMcpAuditSnapshot = McpGatewayRuntimeAuditSnapshot;

export type LocalMcpApprovalDecisionAction = "approve" | "reject";

export interface LocalMcpApprovalDecisionInput {
  readonly sessionId: string;
  readonly decision: LocalMcpApprovalDecisionAction;
  readonly actor?: ApprovalSessionSnapshot["actor"];
  readonly reason?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface LocalMcpRuntimeClient {
  readonly runtime: McpGatewayRuntime;
  listResources(
    context?: LocalMcpResourceContext,
  ): ReturnType<McpGatewayRuntime["listResources"]>;
  readResource(
    uri: string,
    context?: LocalMcpResourceContext,
  ): ReturnType<McpGatewayRuntime["readResource"]>;
  listTools(): ReturnType<McpGatewayRuntime["listTools"]>;
  callTool(
    toolName: string,
    args?: Record<string, unknown>,
    context?: LocalMcpToolContext,
  ): ReturnType<McpGatewayRuntime["callTool"]>;
  listApprovalSessions(
    filter?: ListApprovalSessionsFilter,
  ): ApprovalSessionSnapshot[];
  decideApprovalSession(
    input: LocalMcpApprovalDecisionInput,
  ): ApprovalSessionSnapshot;
  resourceAuditEntries(): AuditRecord[];
  toolAuditEntries(): ToolAuditRecord[];
  auditEntries(): LocalMcpAuditSnapshot;
}

export function createLocalMcpRuntimeClient(
  options: LocalMcpRuntimeOptions = {},
): LocalMcpRuntimeClient {
  const runtime = createMcpGatewayRuntime(options);

  return {
    runtime,
    listResources(context) {
      return runtime.listResources(context);
    },
    readResource(uri, context) {
      return runtime.readResource(uri, context);
    },
    listTools() {
      return runtime.listTools();
    },
    callTool(toolName, args, context) {
      return runtime.callTool(toolName, args, context);
    },
    listApprovalSessions(filter = {}) {
      return runtime.approvals.list(filter);
    },
    decideApprovalSession(input) {
      const transition = {
        actor: input.actor,
        reason: input.reason,
        metadata: input.metadata,
      };

      if (input.decision === "approve") {
        return runtime.approvals.approve(input.sessionId, transition);
      }
      if (input.decision === "reject") {
        return runtime.approvals.reject(input.sessionId, transition);
      }

      throw new TypeError("Local MCP approval decision must be approve or reject.");
    },
    resourceAuditEntries() {
      return runtime.resourceAuditEntries();
    },
    toolAuditEntries() {
      return runtime.toolAuditEntries();
    },
    auditEntries() {
      return runtime.auditEntries();
    },
  };
}

export const createLocalMcpClient = createLocalMcpRuntimeClient;
