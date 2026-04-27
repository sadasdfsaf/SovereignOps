import type { AuditSink } from "./audit.ts";

export type GatewayCapability =
  | "read_object"
  | "write_object"
  | "propose_agent_action";

export type PolicyDecision = "allow" | "require_approval" | "deny";

export interface GatewayActor {
  id: string;
  roles?: readonly string[];
}

export interface GatewayPolicyRequest {
  path: string;
  capability: GatewayCapability;
  actor?: GatewayActor;
  metadata?: Record<string, unknown>;
}

export interface GatewayPolicyResult {
  decision: PolicyDecision;
  path: string;
  capability: GatewayCapability;
  reason?: string;
  ruleId?: string;
}

export interface GatewayPolicyRule {
  id: string;
  path: string;
  decision: PolicyDecision;
  capability?: GatewayCapability;
  reason?: string;
  match?: "exact" | "prefix";
}

export type PolicyEvaluator = (
  request: GatewayPolicyRequest,
) => GatewayPolicyResult | PolicyDecision | Promise<GatewayPolicyResult | PolicyDecision>;

export type PolicyMiddleware<T> = (
  request: GatewayPolicyRequest,
  operation: () => T | Promise<T>,
) => Promise<T>;

export class PolicyDeniedError extends Error {
  readonly result: GatewayPolicyResult;

  constructor(result: GatewayPolicyResult) {
    super(result.reason ?? `Policy denied ${result.capability} for ${result.path}`);
    this.name = "PolicyDeniedError";
    this.result = result;
  }
}

export class PolicyApprovalRequiredError extends Error {
  readonly result: GatewayPolicyResult;

  constructor(result: GatewayPolicyResult) {
    super(result.reason ?? `Approval required for ${result.capability} on ${result.path}`);
    this.name = "PolicyApprovalRequiredError";
    this.result = result;
  }
}

export function createStaticPolicy(
  rules: readonly GatewayPolicyRule[],
  defaultDecision: PolicyDecision = "deny",
): PolicyEvaluator {
  const normalizedRules = rules.map((rule) => ({
    ...rule,
    match: rule.match ?? "exact",
  }));

  return (request) => {
    const rule = normalizedRules.find((candidate) => ruleMatches(candidate, request));
    if (!rule) {
      return {
        decision: defaultDecision,
        path: request.path,
        capability: request.capability,
        reason: `No policy rule matched ${request.capability} for ${request.path}`,
      };
    }

    return {
      decision: rule.decision,
      path: request.path,
      capability: request.capability,
      reason: rule.reason,
      ruleId: rule.id,
    };
  };
}

export async function evaluatePolicy(
  evaluator: PolicyEvaluator,
  request: GatewayPolicyRequest,
): Promise<GatewayPolicyResult> {
  assertPolicyRequest(request);
  const result = await evaluator(request);

  if (typeof result === "string") {
    return {
      decision: result,
      path: request.path,
      capability: request.capability,
    };
  }

  return {
    ...result,
    path: result.path ?? request.path,
    capability: result.capability ?? request.capability,
  };
}

export function createPolicyMiddleware(
  evaluator: PolicyEvaluator,
  audit?: AuditSink,
): PolicyMiddleware<unknown> {
  return async (request, operation) => {
    const result = await evaluatePolicy(evaluator, request);
    audit?.emit({
      type: "policy_decision",
      path: result.path,
      capability: result.capability,
      decision: result.decision,
      message: result.reason,
      metadata: result.ruleId ? { ruleId: result.ruleId } : undefined,
    });

    if (result.decision === "deny") {
      throw new PolicyDeniedError(result);
    }

    if (result.decision === "require_approval") {
      throw new PolicyApprovalRequiredError(result);
    }

    try {
      const value = await operation();
      audit?.emit({
        type: "operation_succeeded",
        path: result.path,
        capability: result.capability,
        decision: result.decision,
      });
      return value;
    } catch (error) {
      audit?.emit({
        type: "operation_failed",
        path: result.path,
        capability: result.capability,
        decision: result.decision,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
}

export function assertPolicyRequest(request: GatewayPolicyRequest): void {
  if (!request || typeof request.path !== "string" || request.path.trim().length === 0) {
    throw new TypeError("Policy request requires a non-empty path.");
  }

  if (!isGatewayCapability(request.capability)) {
    throw new TypeError(`Unsupported gateway capability: ${String(request.capability)}`);
  }
}

export function isGatewayCapability(value: unknown): value is GatewayCapability {
  return (
    value === "read_object" ||
    value === "write_object" ||
    value === "propose_agent_action"
  );
}

function ruleMatches(
  rule: GatewayPolicyRule & { match: "exact" | "prefix" },
  request: GatewayPolicyRequest,
): boolean {
  if (rule.capability && rule.capability !== request.capability) {
    return false;
  }

  if (rule.match === "exact") {
    return rule.path === request.path;
  }

  return request.path === rule.path || request.path.startsWith(`${trimTrailingSlash(rule.path)}/`);
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
