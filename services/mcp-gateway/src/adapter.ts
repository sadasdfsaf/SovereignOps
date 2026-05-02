import type {
  GatewayActor,
  GatewayCapability,
  GatewayPolicyRequest,
  GatewayPolicyResult,
  PolicyDecision,
  PolicyEvaluator,
} from "./policy.ts";
import { evaluatePolicy } from "./policy.ts";
import { assessContentSafety } from "./safety.ts";
import type {
  SafetyAnnotation,
  SafetyFinding,
  SafetyTrustLevel,
} from "./safety.ts";

export const MCP_GATEWAY_ADAPTER_METADATA = Object.freeze({
  name: "sovereignops-mcp-gateway-adapter",
  version: "0.1.0",
  protocol: "mcp-resource-adapter",
  capabilities: Object.freeze({
    resources: Object.freeze({
      list: true,
      read: true,
    }),
    tools: Object.freeze({
      list: true,
    }),
  }),
});

export interface GatewayAdapterContext {
  actor?: GatewayActor;
  metadata?: Record<string, unknown>;
}

export interface GatewayResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
  trust?: GatewayResourceTrust;
  safety?: GatewayResourceSafetyAnnotation;
}

export type GatewayResourceTrust = SafetyTrustLevel;

export interface GatewayResourceSafetyAnnotation {
  schemaVersion: SafetyAnnotation["schemaVersion"];
  scope: SafetyAnnotation["scope"] | "mcp_resource_content";
  trustLevel: GatewayResourceTrust;
  action: SafetyAnnotation["action"];
  reasons: string[];
  findings: SafetyFinding[];
}

export interface GatewayResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  capability?: GatewayCapability;
  metadata?: Record<string, unknown>;
  read: (context: GatewayResourceReadContext) =>
    | GatewayResourceContent
    | readonly GatewayResourceContent[]
    | Promise<GatewayResourceContent | readonly GatewayResourceContent[]>;
}

export interface GatewayResourceReadContext extends GatewayAdapterContext {
  uri: string;
  capability: GatewayCapability;
}

export interface GatewayResourceRegistryLike {
  list(): readonly GatewayResourceDefinition[];
  get(uri: string): GatewayResourceDefinition | undefined;
}

export interface McpResourceSummary {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpListResourcesResult {
  resources: McpResourceSummary[];
}

export interface McpReadResourceResult {
  contents: GatewayResourceContent[];
}

export interface GatewayToolMetadata {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: readonly string[];
    additionalProperties?: boolean;
  };
}

export interface McpListToolsResult {
  tools: GatewayToolMetadata[];
}

export type GatewayResult<T> =
  | {
      ok: true;
      value: T;
      auditIntents: GatewayAuditIntent[];
    }
  | {
      ok: false;
      error: GatewayAdapterError;
      auditIntents: GatewayAuditIntent[];
    };

export type GatewayAdapterErrorCode =
  | "resource_not_found"
  | "policy_denied"
  | "approval_required"
  | "handler_failed";

export interface GatewayAdapterError {
  code: GatewayAdapterErrorCode;
  message: string;
  uri?: string;
  capability?: GatewayCapability;
  decision?: PolicyDecision;
  ruleId?: string;
}

export interface GatewayAuditIntent {
  type: "policy_decision" | "operation_succeeded" | "operation_failed";
  uri?: string;
  capability?: GatewayCapability;
  decision?: PolicyDecision;
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface GatewayResourceAdapterOptions {
  resources: GatewayResourceRegistryLike;
  policy: PolicyEvaluator;
  tools?: readonly GatewayToolMetadata[];
}

export interface GatewayResourceAdapter {
  readonly metadata: typeof MCP_GATEWAY_ADAPTER_METADATA;
  listResources(context?: GatewayAdapterContext): Promise<GatewayResult<McpListResourcesResult>>;
  readResource(uri: string, context?: GatewayAdapterContext): Promise<GatewayResult<McpReadResourceResult>>;
  listTools(): GatewayResult<McpListToolsResult>;
}

export const MCP_GATEWAY_TOOL_METADATA: readonly GatewayToolMetadata[] = Object.freeze([
  Object.freeze({
    name: "gateway.list_resources",
    description: "List gateway resources allowed by the injected policy.",
    inputSchema: Object.freeze({
      type: "object",
      properties: Object.freeze({}),
      additionalProperties: false,
    }),
  }),
  Object.freeze({
    name: "gateway.read_resource",
    description: "Read a gateway resource after the injected policy allows access.",
    inputSchema: Object.freeze({
      type: "object",
      properties: Object.freeze({
        uri: Object.freeze({
          type: "string",
          description: "Resource URI to read.",
        }),
      }),
      required: Object.freeze(["uri"]),
      additionalProperties: false,
    }),
  }),
]);

export function createGatewayResourceAdapter(
  options: GatewayResourceAdapterOptions,
): GatewayResourceAdapter {
  const tools = cloneTools(options.tools ?? MCP_GATEWAY_TOOL_METADATA);

  return {
    metadata: MCP_GATEWAY_ADAPTER_METADATA,
    async listResources(context = {}) {
      const auditIntents: GatewayAuditIntent[] = [];
      const resources: McpResourceSummary[] = [];

      for (const resource of options.resources.list()) {
        const capability = resource.capability ?? "read_object";
        const policy = await authorizeResource(
          options.policy,
          resource.uri,
          capability,
          context,
          "resources.list",
          resource.metadata,
        );
        auditIntents.push(policyAuditIntent(policy));

        if (policy.decision === "allow") {
          resources.push(toResourceSummary(resource));
        }
      }

      return {
        ok: true,
        value: { resources },
        auditIntents,
      };
    },
    async readResource(uri, context = {}) {
      const auditIntents: GatewayAuditIntent[] = [];
      const resource = options.resources.get(uri);

      if (!resource) {
        return {
          ok: false,
          error: {
            code: "resource_not_found",
            message: `No gateway resource found for ${uri}`,
            uri,
            capability: "read_object",
          },
          auditIntents,
        };
      }

      const capability = resource.capability ?? "read_object";
      const policy = await authorizeResource(
        options.policy,
        resource.uri,
        capability,
        context,
        "resources.read",
        resource.metadata,
      );
      auditIntents.push(policyAuditIntent(policy));

      if (policy.decision !== "allow") {
        return {
          ok: false,
          error: policyError(policy),
          auditIntents,
        };
      }

      try {
        const rawContents = await resource.read({
          ...context,
          uri: resource.uri,
          capability,
        });
        auditIntents.push({
          type: "operation_succeeded",
          uri: resource.uri,
          capability,
          decision: policy.decision,
        });

        return {
          ok: true,
          value: {
            contents: normalizeContents(resource, rawContents),
          },
          auditIntents,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        auditIntents.push({
          type: "operation_failed",
          uri: resource.uri,
          capability,
          decision: policy.decision,
          message,
        });

        return {
          ok: false,
          error: {
            code: "handler_failed",
            message,
            uri: resource.uri,
            capability,
          },
          auditIntents,
        };
      }
    },
    listTools() {
      return {
        ok: true,
        value: {
          tools: cloneTools(tools),
        },
        auditIntents: [],
      };
    },
  };
}

async function authorizeResource(
  policy: PolicyEvaluator,
  uri: string,
  capability: GatewayCapability,
  context: GatewayAdapterContext,
  operation: "resources.list" | "resources.read",
  metadata?: Record<string, unknown>,
): Promise<GatewayPolicyResult> {
  const request: GatewayPolicyRequest = {
    path: uri,
    capability,
    actor: context.actor,
    metadata: {
      ...context.metadata,
      ...metadata,
      operation,
    },
  };

  return evaluatePolicy(policy, request);
}

function toResourceSummary(resource: GatewayResourceDefinition): McpResourceSummary {
  return {
    uri: resource.uri,
    name: resource.name,
    description: resource.description,
    mimeType: resource.mimeType,
  };
}

function policyAuditIntent(result: GatewayPolicyResult): GatewayAuditIntent {
  return {
    type: "policy_decision",
    uri: result.path,
    capability: result.capability,
    decision: result.decision,
    message: result.reason,
    metadata: result.ruleId ? { ruleId: result.ruleId } : undefined,
  };
}

function policyError(result: GatewayPolicyResult): GatewayAdapterError {
  return {
    code: result.decision === "require_approval" ? "approval_required" : "policy_denied",
    message: result.reason ?? `Policy ${result.decision} for ${result.path}`,
    uri: result.path,
    capability: result.capability,
    decision: result.decision,
    ruleId: result.ruleId,
  };
}

function normalizeContents(
  resource: GatewayResourceDefinition,
  contents: GatewayResourceContent | readonly GatewayResourceContent[],
): GatewayResourceContent[] {
  const values = Array.isArray(contents) ? contents : [contents];

  return values.map((content) => {
    const safety = annotateResourceContentSafety(content);

    const normalized: GatewayResourceContent = {
      uri: content.uri || resource.uri,
      mimeType: content.mimeType ?? resource.mimeType,
      text: content.text,
      blob: content.blob,
    };

    if (safety) {
      normalized.trust = safety.trustLevel;
      normalized.safety = safety;
    }

    return normalized;
  });
}

function annotateResourceContentSafety(
  content: GatewayResourceContent,
): GatewayResourceSafetyAnnotation | undefined {
  const assessed =
    typeof content.text === "string"
      ? toResourceSafetyAnnotation(assessContentSafety(content.text))
      : undefined;
  let safety = content.safety ? cloneResourceSafetyAnnotation(content.safety) : assessed;

  if (content.safety && assessed) {
    safety = mergeResourceSafetyAnnotations(content.safety, assessed);
  }

  if (safety && content.trust) {
    const trustLevel = elevateTrustLevel(safety.trustLevel, content.trust);
    safety = {
      ...safety,
      trustLevel,
      reasons:
        trustLevel === safety.trustLevel
          ? safety.reasons
          : uniqueStrings([
              ...safety.reasons,
              `Resource content declared ${content.trust}.`,
            ]),
    };
  }

  if (!safety && content.trust) {
    safety = createDeclaredResourceSafetyAnnotation(content.trust);
  }

  return safety;
}

function toResourceSafetyAnnotation(
  safety: SafetyAnnotation,
): GatewayResourceSafetyAnnotation {
  return {
    schemaVersion: safety.schemaVersion,
    scope: "mcp_resource_content",
    trustLevel: safety.trustLevel,
    action: safety.action,
    reasons: [...safety.reasons],
    findings: safety.findings.map((finding) => ({ ...finding })),
  };
}

function cloneResourceSafetyAnnotation(
  safety: GatewayResourceSafetyAnnotation,
): GatewayResourceSafetyAnnotation {
  return {
    schemaVersion: safety.schemaVersion,
    scope: safety.scope,
    trustLevel: safety.trustLevel,
    action: safety.action,
    reasons: [...safety.reasons],
    findings: safety.findings.map((finding) => ({ ...finding })),
  };
}

function mergeResourceSafetyAnnotations(
  first: GatewayResourceSafetyAnnotation,
  second: GatewayResourceSafetyAnnotation,
): GatewayResourceSafetyAnnotation {
  return {
    schemaVersion: 1,
    scope: first.scope,
    trustLevel: elevateTrustLevel(first.trustLevel, second.trustLevel),
    action: "mark_only",
    reasons: uniqueStrings([...first.reasons, ...second.reasons]),
    findings: [
      ...first.findings.map((finding) => ({ ...finding })),
      ...second.findings.map((finding) => ({ ...finding })),
    ],
  };
}

function createDeclaredResourceSafetyAnnotation(
  trustLevel: GatewayResourceTrust,
): GatewayResourceSafetyAnnotation {
  return {
    schemaVersion: 1,
    scope: "mcp_resource_content",
    trustLevel,
    action: "mark_only",
    reasons: [`Resource content declared ${trustLevel}.`],
    findings: [],
  };
}

function elevateTrustLevel(
  current: GatewayResourceTrust,
  next: GatewayResourceTrust,
): GatewayResourceTrust {
  const order: Record<GatewayResourceTrust, number> = {
    trusted: 0,
    review: 1,
    untrusted: 2,
  };

  return order[next] > order[current] ? next : current;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function cloneTools(tools: readonly GatewayToolMetadata[]): GatewayToolMetadata[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: pruneUndefined({
      type: tool.inputSchema.type,
      properties: cloneRecord(tool.inputSchema.properties),
      required: tool.inputSchema.required ? [...tool.inputSchema.required] : undefined,
      additionalProperties: tool.inputSchema.additionalProperties,
    }),
  }));
}

function cloneRecord(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? { ...(entry as Record<string, unknown>) }
        : entry,
    ]),
  );
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}
