export interface GatewayPolicyGate {
  resource: string;
  capability: "read_object" | "write_object" | "propose_agent_action";
  decision: "allow" | "require_approval" | "deny";
}

export function canExecute(gate: GatewayPolicyGate): boolean {
  return gate.decision === "allow";
}

export { AuditEmitter, createAuditEmitter } from "./audit.ts";
export type { AuditEvent, AuditEventType, AuditListener, AuditRecord, AuditSink } from "./audit.ts";
export {
  PolicyApprovalRequiredError,
  PolicyDeniedError,
  assertPolicyRequest,
  createPolicyMiddleware,
  createStaticPolicy,
  evaluatePolicy,
  isGatewayCapability,
} from "./policy.ts";
export type {
  GatewayActor,
  GatewayCapability,
  GatewayPolicyRequest,
  GatewayPolicyResult,
  GatewayPolicyRule,
  PolicyDecision,
  PolicyEvaluator,
} from "./policy.ts";
export {
  RegistryPathNotFoundError,
  ResourceRegistry,
  ToolRegistry,
  createResourceRegistry,
  createToolRegistry,
} from "./registry.ts";
export type {
  GatewayHandlerContext,
  GatewayRegistryContext,
  RegisteredResource,
  RegisteredTool,
  RegistryEntrySummary,
  RegistryOptions,
  ResourceHandler,
  ToolHandler,
} from "./registry.ts";
