export type IdentifierPrefix = "wsp" | "act" | "dev" | "obj" | "key";

export interface WorkspaceRef {
  id: `${"wsp"}_${string}`;
  displayName: string;
}

export interface AgentActionPreview {
  id: `${"obj"}_${string}`;
  workspaceId: WorkspaceRef["id"];
  actorId: `${"act"}_${string}`;
  capability: "read_object" | "write_object" | "propose_agent_action" | "manage_plugin" | "sync_bundle";
  risk: "low" | "medium" | "high";
  summary: string;
}

export interface AuditEntry {
  workspaceId: WorkspaceRef["id"];
  actorId: `${"act"}_${string}`;
  action: string;
  decision: "allow" | "require_approval" | "deny";
  redactedPaths: string[];
  recordedAt: string;
}

export function isSovereignId(value: string, prefix: IdentifierPrefix): boolean {
  return new RegExp(`^${prefix}_[A-Za-z0-9_-]{1,88}$`).test(value);
}

