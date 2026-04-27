import type { ToolAuditSink } from "./auditEmitter.ts";

export const SAFE_LOCAL_TOOL_NAMES = [
  "create_task_proposal",
  "draft_document_patch",
  "link_evidence",
  "propose_automation_rule",
] as const;

export type SafeLocalToolName = (typeof SAFE_LOCAL_TOOL_NAMES)[number];

export type ToolPolicyDecision = "allow" | "require_approval" | "deny";

export interface ToolActor {
  id: string;
  roles?: readonly string[];
}

export interface ToolPolicyRequest {
  toolName: string;
  arguments: Record<string, unknown>;
  actor?: ToolActor;
  metadata?: Record<string, unknown>;
}

export interface ToolPolicyResult {
  decision: ToolPolicyDecision;
  toolName?: string;
  reason?: string;
  ruleId?: string;
  approvalId?: string;
}

export type ToolPolicyEvaluator = (
  request: ToolPolicyRequest,
) => ToolPolicyResult | ToolPolicyDecision | Promise<ToolPolicyResult | ToolPolicyDecision>;

export interface ToolHandlerContext {
  toolName: string;
  actor?: ToolActor;
  metadata?: Record<string, unknown>;
}

export type ToolHandler<TArguments = Record<string, unknown>, TResult = unknown> = (
  args: TArguments,
  context: ToolHandlerContext,
) => TResult | Promise<TResult>;

export interface SafeLocalToolDefinition<
  TArguments = Record<string, unknown>,
  TResult = unknown,
> {
  name: SafeLocalToolName;
  description: string;
  handler: ToolHandler<TArguments, TResult>;
}

export interface ToolRegistrySummary {
  name: SafeLocalToolName;
  description: string;
}

export interface ExecuteToolCallOptions {
  toolName: string;
  arguments?: Record<string, unknown>;
  actor?: ToolActor;
  metadata?: Record<string, unknown>;
  policy: ToolPolicyEvaluator;
  handlers: Record<string, ToolHandler>;
  audit?: ToolAuditSink;
}

export type ToolExecutionResult =
  | {
      status: "denied";
      toolName: string;
      policy: NormalizedToolPolicyResult;
    }
  | {
      status: "approval_required";
      toolName: string;
      policy: NormalizedToolPolicyResult;
    }
  | {
      status: "executed";
      toolName: string;
      policy: NormalizedToolPolicyResult;
      output: unknown;
    };

export interface NormalizedToolPolicyResult {
  decision: ToolPolicyDecision;
  toolName: string;
  reason?: string;
  ruleId?: string;
  approvalId?: string;
}

export class ToolNotFoundError extends Error {
  constructor(toolName: string) {
    super(`No safe local tool registered for ${toolName}`);
    this.name = "ToolNotFoundError";
  }
}

export class SafeLocalToolRegistry {
  readonly #tools = new Map<SafeLocalToolName, SafeLocalToolDefinition>();

  constructor(definitions: readonly SafeLocalToolDefinition[] = DEFAULT_SAFE_LOCAL_TOOLS) {
    for (const definition of definitions) {
      this.register(definition);
    }
  }

  register(definition: SafeLocalToolDefinition): void {
    if (!isSafeLocalToolName(definition.name)) {
      throw new TypeError(`Unsupported safe local tool: ${String(definition.name)}`);
    }

    if (this.#tools.has(definition.name)) {
      throw new Error(`Safe local tool already registered: ${definition.name}`);
    }

    this.#tools.set(definition.name, definition);
  }

  list(): ToolRegistrySummary[] {
    return [...this.#tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
    }));
  }

  handlers(): Record<string, ToolHandler> {
    return Object.fromEntries(
      [...this.#tools.values()].map((tool) => [tool.name, tool.handler]),
    );
  }

  async execute(
    options: Omit<ExecuteToolCallOptions, "handlers">,
  ): Promise<ToolExecutionResult> {
    return executeToolCall({
      ...options,
      handlers: this.handlers(),
    });
  }
}

export function createSafeLocalToolRegistry(
  definitions: readonly SafeLocalToolDefinition[] = DEFAULT_SAFE_LOCAL_TOOLS,
): SafeLocalToolRegistry {
  return new SafeLocalToolRegistry(definitions);
}

export async function executeToolCall(
  options: ExecuteToolCallOptions,
): Promise<ToolExecutionResult> {
  const toolName = normalizeToolName(options.toolName);
  const args = normalizeArguments(options.arguments);
  const policyRequest: ToolPolicyRequest = {
    toolName,
    arguments: args,
    actor: options.actor,
    metadata: options.metadata,
  };

  options.audit?.emit({
    type: "tool_call_requested",
    toolName,
    arguments: args,
    actorId: options.actor?.id,
    metadata: options.metadata,
  });

  const policy = await evaluateToolPolicy(options.policy, policyRequest);

  if (policy.decision === "deny") {
    options.audit?.emit({
      type: "tool_call_denied",
      toolName,
      arguments: args,
      actorId: options.actor?.id,
      decision: policy.decision,
      reason: policy.reason,
      metadata: policy.ruleId ? { ruleId: policy.ruleId } : undefined,
    });

    return {
      status: "denied",
      toolName,
      policy,
    };
  }

  if (policy.decision === "require_approval") {
    return {
      status: "approval_required",
      toolName,
      policy,
    };
  }

  const handler = options.handlers[toolName];
  if (!handler) {
    throw new ToolNotFoundError(toolName);
  }

  options.audit?.emit({
    type: "tool_call_approved",
    toolName,
    arguments: args,
    actorId: options.actor?.id,
    decision: policy.decision,
    reason: policy.reason,
    metadata: policy.ruleId ? { ruleId: policy.ruleId } : undefined,
  });

  const output = await handler(args, {
    toolName,
    actor: options.actor,
    metadata: options.metadata,
  });

  options.audit?.emit({
    type: "tool_call_executed",
    toolName,
    arguments: args,
    actorId: options.actor?.id,
    decision: policy.decision,
    resultSummary: summarizeToolOutput(output),
  });

  return {
    status: "executed",
    toolName,
    policy,
    output,
  };
}

export async function evaluateToolPolicy(
  evaluator: ToolPolicyEvaluator,
  request: ToolPolicyRequest,
): Promise<NormalizedToolPolicyResult> {
  const result = await evaluator(request);
  if (typeof result === "string") {
    return {
      decision: assertToolPolicyDecision(result),
      toolName: request.toolName,
    };
  }

  return {
    ...result,
    decision: assertToolPolicyDecision(result.decision),
    toolName: result.toolName ?? request.toolName,
  };
}

export function isSafeLocalToolName(value: unknown): value is SafeLocalToolName {
  return (
    typeof value === "string" &&
    SAFE_LOCAL_TOOL_NAMES.includes(value as SafeLocalToolName)
  );
}

export const DEFAULT_SAFE_LOCAL_TOOLS: readonly SafeLocalToolDefinition[] = [
  {
    name: "create_task_proposal",
    description: "Create a task proposal without writing task state.",
    handler: createTaskProposal,
  },
  {
    name: "draft_document_patch",
    description: "Draft a document patch without modifying the target document.",
    handler: draftDocumentPatch,
  },
  {
    name: "link_evidence",
    description: "Propose a local evidence link without persisting it.",
    handler: linkEvidence,
  },
  {
    name: "propose_automation_rule",
    description: "Draft an automation rule proposal without enabling it.",
    handler: proposeAutomationRule,
  },
];

function createTaskProposal(args: Record<string, unknown>) {
  return {
    kind: "task_proposal",
    title: requiredString(args, "title"),
    description: optionalString(args, "description"),
    priority: optionalString(args, "priority"),
    acceptanceCriteria: optionalStringArray(args, "acceptanceCriteria"),
    evidence: optionalStringArray(args, "evidence"),
    durableSideEffects: false,
  };
}

function draftDocumentPatch(args: Record<string, unknown>) {
  return {
    kind: "document_patch",
    targetPath: requiredString(args, "targetPath"),
    summary: optionalString(args, "summary"),
    patch: args.patch ?? args.diff ?? "",
    durableSideEffects: false,
  };
}

function linkEvidence(args: Record<string, unknown>) {
  return {
    kind: "evidence_link_proposal",
    evidenceRef: requiredString(args, "evidenceRef"),
    targetRef: requiredString(args, "targetRef"),
    relation: optionalString(args, "relation") ?? "supports",
    note: optionalString(args, "note"),
    durableSideEffects: false,
  };
}

function proposeAutomationRule(args: Record<string, unknown>) {
  return {
    kind: "automation_rule_proposal",
    name: requiredString(args, "name"),
    trigger: args.trigger ?? {},
    action: args.action ?? {},
    safeguards: optionalStringArray(args, "safeguards"),
    durableSideEffects: false,
  };
}

function normalizeToolName(toolName: string): string {
  if (typeof toolName !== "string" || toolName.trim().length === 0) {
    throw new TypeError("Tool call requires a non-empty tool name.");
  }

  return toolName;
}

function normalizeArguments(args: Record<string, unknown> | undefined): Record<string, unknown> {
  if (args === undefined) {
    return {};
  }

  if (!isPlainRecord(args)) {
    throw new TypeError("Tool call arguments must be an object.");
  }

  return { ...args };
}

function assertToolPolicyDecision(value: unknown): ToolPolicyDecision {
  if (value === "allow" || value === "require_approval" || value === "deny") {
    return value;
  }

  throw new TypeError(`Unsupported tool policy decision: ${String(value)}`);
}

function requiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${key} must be a non-empty string.`);
  }

  return value;
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new TypeError(`${key} must be a string when provided.`);
  }

  return value;
}

function optionalStringArray(args: Record<string, unknown>, key: string): string[] | undefined {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new TypeError(`${key} must be an array of strings when provided.`);
  }

  return [...value];
}

function summarizeToolOutput(output: unknown): string {
  if (isPlainRecord(output) && typeof output.kind === "string") {
    return output.kind;
  }

  if (Array.isArray(output)) {
    return `array:${output.length}`;
  }

  return typeof output;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
