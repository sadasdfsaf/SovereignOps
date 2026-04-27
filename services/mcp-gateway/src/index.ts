export interface GatewayPolicyGate {
  resource: string;
  capability: "read_object" | "write_object" | "propose_agent_action";
  decision: "allow" | "require_approval" | "deny";
}

export function canExecute(gate: GatewayPolicyGate): boolean {
  return gate.decision === "allow";
}

