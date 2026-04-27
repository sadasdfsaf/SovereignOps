import type {
  GatewayAdapterContext,
  GatewayAuditIntent,
  GatewayResourceAdapter,
  GatewayResourceRegistryLike,
  GatewayResult,
  McpListResourcesResult,
  McpReadResourceResult,
} from "./adapter.ts";
import { createGatewayResourceAdapter } from "./adapter.ts";
import type {
  ApprovalSessionActor,
  ApprovalSessionStore,
  CreateApprovalSessionInput,
} from "./approvalSessions.ts";
import { createApprovalSessionStore } from "./approvalSessions.ts";
import type { AuditRecord, AuditSink } from "./audit.ts";
import { createAuditEmitter } from "./audit.ts";
import type { ToolAuditRecord, ToolAuditSink } from "./auditEmitter.ts";
import { createToolAuditEmitter } from "./auditEmitter.ts";
import type {
  GatewayActor,
  GatewayPolicyRule,
  GatewayPolicyRequest,
  GatewayPolicyResult,
  PolicyDecision,
  PolicyEvaluator,
} from "./policy.ts";
import { createStaticPolicy, evaluatePolicy } from "./policy.ts";
import { createDefaultGatewayResourceRegistry } from "./resources.ts";
import type {
  McpCallSafeLocalToolResult,
  McpListSafeLocalToolsResult,
  SafeLocalToolAdapter,
  SafeLocalToolAdapterContext,
  SafeLocalToolAdapterResult,
} from "./toolAdapter.ts";
import { createSafeLocalToolAdapter } from "./toolAdapter.ts";
import type {
  NormalizedToolPolicyResult,
  SafeLocalToolRegistry,
  ToolActor,
  ToolPolicyDecision,
  ToolPolicyEvaluator,
  ToolPolicyRequest,
} from "./tools.ts";
import {
  SAFE_LOCAL_TOOL_NAMES,
  createSafeLocalToolRegistry,
  evaluateToolPolicy,
} from "./tools.ts";

export interface GatewayToolPolicyRule {
  id: string;
  toolName: string;
  decision: ToolPolicyDecision;
  reason?: string;
  match?: "exact" | "prefix";
  approvalId?: string;
}

export interface McpGatewayRuntimeOptions {
  resourceRegistry?: GatewayResourceRegistryLike;
  safeLocalToolRegistry?: SafeLocalToolRegistry;
  resourcePolicy?: PolicyEvaluator;
  resourcePolicyRules?: readonly GatewayPolicyRule[];
  resourceDefaultDecision?: PolicyDecision;
  toolPolicy?: ToolPolicyEvaluator;
  toolPolicyRules?: readonly GatewayToolPolicyRule[];
  toolDefaultDecision?: ToolPolicyDecision;
  clock?: () => Date | string;
  resourceAudit?: AuditSink;
  toolAudit?: ToolAuditSink;
  approvals?: ApprovalSessionStore;
  approvalIdPrefix?: string;
  initialApprovalSessions?: readonly CreateApprovalSessionInput[];
  createApprovalSessions?: boolean;
}

export interface McpGatewayRuntimeAuditSnapshot {
  resources: AuditRecord[];
  tools: ToolAuditRecord[];
}

export interface McpGatewayRuntime {
  readonly resourceRegistry: GatewayResourceRegistryLike;
  readonly safeLocalToolRegistry: SafeLocalToolRegistry;
  readonly resourceAdapter: GatewayResourceAdapter;
  readonly toolAdapter: SafeLocalToolAdapter;
  readonly approvals: ApprovalSessionStore;
  readonly resourceAudit: AuditSink;
  readonly toolAudit: ToolAuditSink;
  listResources(context?: GatewayAdapterContext): Promise<GatewayResult<McpListResourcesResult>>;
  readResource(
    uri: string,
    context?: GatewayAdapterContext,
  ): Promise<GatewayResult<McpReadResourceResult>>;
  listTools(): SafeLocalToolAdapterResult<McpListSafeLocalToolsResult>;
  callTool(
    toolName: string,
    args?: Record<string, unknown>,
    context?: SafeLocalToolAdapterContext,
  ): Promise<SafeLocalToolAdapterResult<McpCallSafeLocalToolResult>>;
  resourceAuditEntries(): AuditRecord[];
  toolAuditEntries(): ToolAuditRecord[];
  auditEntries(): McpGatewayRuntimeAuditSnapshot;
}

export const DEFAULT_MCP_GATEWAY_RUNTIME_RESOURCE_POLICY_RULES: readonly GatewayPolicyRule[] =
  Object.freeze([
    Object.freeze({
      id: "runtime-allow-local-resource-read",
      path: "sovereignops://",
      capability: "read_object",
      decision: "allow",
      match: "prefix",
      reason: "Local gateway resources are readable by default.",
    }),
  ]);

export const DEFAULT_MCP_GATEWAY_RUNTIME_TOOL_POLICY_RULES: readonly GatewayToolPolicyRule[] =
  Object.freeze(
    SAFE_LOCAL_TOOL_NAMES.map((toolName) =>
      Object.freeze({
        id: `runtime-allow-${toolName}`,
        toolName,
        decision: "allow" as const,
        reason: "Safe local proposal tools are allowed by default.",
      }),
    ),
  );

export function createMcpGatewayRuntime(
  options: McpGatewayRuntimeOptions = {},
): McpGatewayRuntime {
  const clock = options.clock ?? (() => new Date());
  const resourceAudit = options.resourceAudit ?? createAuditEmitter({ now: clock });
  const toolAudit = options.toolAudit ?? createToolAuditEmitter({ now: clock });
  const approvals =
    options.approvals ??
    createApprovalSessionStore({
      now: clock,
      idPrefix: options.approvalIdPrefix ?? "runtime_approval_",
    });

  for (const session of options.initialApprovalSessions ?? []) {
    approvals.create(session);
  }

  const resourceRegistry =
    options.resourceRegistry ?? createDefaultGatewayResourceRegistry();
  const safeLocalToolRegistry =
    options.safeLocalToolRegistry ?? createSafeLocalToolRegistry();
  const shouldCreateApprovalSessions = options.createApprovalSessions !== false;
  const resourcePolicy = withResourceApprovalSessions(
    createRuntimeResourcePolicy(options),
    approvals,
    shouldCreateApprovalSessions,
  );
  const toolPolicy = withToolApprovalSessions(
    createRuntimeToolPolicy(options),
    approvals,
    shouldCreateApprovalSessions,
  );
  const resourceAdapter = createGatewayResourceAdapter({
    resources: resourceRegistry,
    policy: resourcePolicy,
  });
  const toolAdapter = createSafeLocalToolAdapter({
    registry: safeLocalToolRegistry,
    policy: toolPolicy,
    audit: toolAudit,
  });
  const collectedResourceAudit: AuditRecord[] = [];
  const collectedToolAudit: ToolAuditRecord[] = [];

  return {
    resourceRegistry,
    safeLocalToolRegistry,
    resourceAdapter,
    toolAdapter,
    approvals,
    resourceAudit,
    toolAudit,
    async listResources(context = {}) {
      const result = await resourceAdapter.listResources(context);
      captureResourceAudit(result.auditIntents, resourceAudit, collectedResourceAudit);
      return result;
    },
    async readResource(uri, context = {}) {
      const result = await resourceAdapter.readResource(uri, context);
      captureResourceAudit(result.auditIntents, resourceAudit, collectedResourceAudit);
      return result;
    },
    listTools() {
      return toolAdapter.listTools();
    },
    async callTool(toolName, args, context = {}) {
      const result = await toolAdapter.callTool(toolName, args, context);
      collectedToolAudit.push(...result.auditRecords.map(cloneToolAuditRecord));
      return result;
    },
    resourceAuditEntries() {
      return collectedResourceAudit.map(cloneAuditRecord);
    },
    toolAuditEntries() {
      return collectedToolAudit.map(cloneToolAuditRecord);
    },
    auditEntries() {
      return {
        resources: collectedResourceAudit.map(cloneAuditRecord),
        tools: collectedToolAudit.map(cloneToolAuditRecord),
      };
    },
  };
}

export const createGatewayRuntime = createMcpGatewayRuntime;

export function createStaticToolPolicy(
  rules: readonly GatewayToolPolicyRule[],
  defaultDecision: ToolPolicyDecision = "deny",
): ToolPolicyEvaluator {
  const normalizedRules = rules.map((rule) => ({
    ...rule,
    match: rule.match ?? "exact",
  }));

  return (request) => {
    const rule = normalizedRules.find((candidate) =>
      toolRuleMatches(candidate, request),
    );

    if (!rule) {
      return {
        decision: defaultDecision,
        toolName: request.toolName,
        reason: `No tool policy rule matched ${request.toolName}`,
      };
    }

    return {
      decision: rule.decision,
      toolName: request.toolName,
      reason: rule.reason,
      ruleId: rule.id,
      approvalId: rule.approvalId,
    };
  };
}

function createRuntimeResourcePolicy(
  options: McpGatewayRuntimeOptions,
): PolicyEvaluator {
  if (options.resourcePolicy) {
    return options.resourcePolicy;
  }

  return createStaticPolicy(
    options.resourcePolicyRules ?? DEFAULT_MCP_GATEWAY_RUNTIME_RESOURCE_POLICY_RULES,
    options.resourceDefaultDecision ?? "deny",
  );
}

function createRuntimeToolPolicy(
  options: McpGatewayRuntimeOptions,
): ToolPolicyEvaluator {
  if (options.toolPolicy) {
    return options.toolPolicy;
  }

  return createStaticToolPolicy(
    options.toolPolicyRules ?? DEFAULT_MCP_GATEWAY_RUNTIME_TOOL_POLICY_RULES,
    options.toolDefaultDecision ?? "deny",
  );
}

function withResourceApprovalSessions(
  policy: PolicyEvaluator,
  approvals: ApprovalSessionStore,
  enabled: boolean,
): PolicyEvaluator {
  if (!enabled) {
    return policy;
  }

  return async (request) => {
    const result = await evaluatePolicy(policy, request);

    if (
      result.decision === "require_approval" &&
      request.metadata?.operation === "resources.read"
    ) {
      approvals.create(resourceApprovalInput(request, result));
    }

    return result;
  };
}

function withToolApprovalSessions(
  policy: ToolPolicyEvaluator,
  approvals: ApprovalSessionStore,
  enabled: boolean,
): ToolPolicyEvaluator {
  if (!enabled) {
    return policy;
  }

  return async (request) => {
    const result = await evaluateToolPolicy(policy, request);

    if (result.decision !== "require_approval" || result.approvalId) {
      return result;
    }

    const session = approvals.create(toolApprovalInput(request, result));
    return {
      ...result,
      approvalId: session.id,
    };
  };
}

function resourceApprovalInput(
  request: GatewayPolicyRequest,
  result: GatewayPolicyResult,
): CreateApprovalSessionInput {
  return {
    request: {
      type: "resource",
      path: result.path,
      capability: result.capability,
      operation: request.metadata?.operation,
    },
    path: result.path,
    capability: result.capability,
    actor: toApprovalActor(request.actor),
    reason: result.reason,
    ruleId: result.ruleId,
    metadata: runtimeApprovalMetadata(request.metadata),
  };
}

function toolApprovalInput(
  request: ToolPolicyRequest,
  result: NormalizedToolPolicyResult,
): CreateApprovalSessionInput {
  return {
    request: {
      type: "tool",
      toolName: result.toolName,
      arguments: cloneJsonLike(request.arguments),
      operation: request.metadata?.operation,
    },
    toolName: result.toolName,
    arguments: cloneJsonLike(request.arguments),
    actor: toApprovalActor(request.actor),
    reason: result.reason,
    ruleId: result.ruleId,
    metadata: runtimeApprovalMetadata(request.metadata),
  };
}

function runtimeApprovalMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return {
    ...metadata,
    source: "mcp_gateway_runtime",
  };
}

function captureResourceAudit(
  intents: readonly GatewayAuditIntent[],
  audit: AuditSink,
  collected: AuditRecord[],
): void {
  for (const intent of intents) {
    const record = audit.emit({
      type: intent.type,
      path: intent.uri,
      capability: intent.capability,
      decision: intent.decision,
      message: intent.message,
      metadata: intent.metadata,
    });
    collected.push(cloneAuditRecord(record));
  }
}

function toolRuleMatches(
  rule: GatewayToolPolicyRule & { match: "exact" | "prefix" },
  request: ToolPolicyRequest,
): boolean {
  if (rule.match === "exact") {
    return rule.toolName === request.toolName;
  }

  return request.toolName === rule.toolName || request.toolName.startsWith(rule.toolName);
}

function toApprovalActor(
  actor: GatewayActor | ToolActor | undefined,
): ApprovalSessionActor | undefined {
  if (!actor) {
    return undefined;
  }

  return {
    id: actor.id,
    roles: actor.roles ? [...actor.roles] : undefined,
  };
}

function cloneAuditRecord(record: AuditRecord): AuditRecord {
  return cloneJsonLike(record);
}

function cloneToolAuditRecord(record: ToolAuditRecord): ToolAuditRecord {
  return cloneJsonLike(record);
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
