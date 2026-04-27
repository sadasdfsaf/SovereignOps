import type { ToolAuditEvent, ToolAuditRecord, ToolAuditSink } from "./auditEmitter.ts";
import { createToolAuditEmitter } from "./auditEmitter.ts";
import {
  annotateStructuredContent,
  annotateTextContent,
  assessContentSafety,
  cloneSafetyAnnotation,
  type SafetyAnnotation,
} from "./safety.ts";
import {
  SAFE_LOCAL_TOOL_NAMES,
  type NormalizedToolPolicyResult,
  type SafeLocalToolName,
  type SafeLocalToolRegistry,
  type ToolActor,
  type ToolPolicyEvaluator,
  createSafeLocalToolRegistry,
  evaluateToolPolicy,
  isSafeLocalToolName,
} from "./tools.ts";

export interface SafeLocalToolAdapterContext {
  actor?: ToolActor;
  metadata?: Record<string, unknown>;
}

export interface SafeLocalToolMetadata {
  name: SafeLocalToolName;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: readonly string[];
    additionalProperties: boolean;
  };
}

export interface McpListSafeLocalToolsResult {
  tools: SafeLocalToolMetadata[];
}

export interface McpTextContent {
  type: "text";
  text: string;
  safety?: SafetyAnnotation;
}

export interface McpCallSafeLocalToolResult {
  content: McpTextContent[];
  structuredContent: unknown;
  safety?: SafetyAnnotation;
}

export type SafeLocalToolAdapterErrorCode =
  | "denied"
  | "approval_required"
  | "unknown"
  | "handler_failed";

export interface SafeLocalToolAdapterError {
  code: SafeLocalToolAdapterErrorCode;
  message: string;
  toolName: string;
  decision?: NormalizedToolPolicyResult["decision"];
  reason?: string;
  ruleId?: string;
  approvalId?: string;
  policy?: NormalizedToolPolicyResult;
}

export type SafeLocalToolAdapterResult<T> =
  | {
      ok: true;
      value: T;
      auditRecords: ToolAuditRecord[];
      policy?: NormalizedToolPolicyResult;
    }
  | {
      ok: false;
      error: SafeLocalToolAdapterError;
      auditRecords: ToolAuditRecord[];
      policy?: NormalizedToolPolicyResult;
    };

export interface SafeLocalToolAdapterOptions {
  registry?: SafeLocalToolRegistry;
  policy: ToolPolicyEvaluator;
  audit?: ToolAuditSink;
}

export interface SafeLocalToolAdapter {
  listTools(): SafeLocalToolAdapterResult<McpListSafeLocalToolsResult>;
  callTool(
    toolName: string,
    args?: Record<string, unknown>,
    context?: SafeLocalToolAdapterContext,
  ): Promise<SafeLocalToolAdapterResult<McpCallSafeLocalToolResult>>;
}

export const MCP_SAFE_LOCAL_TOOL_METADATA: readonly SafeLocalToolMetadata[] = deepFreeze([
  {
    name: "create_task_proposal",
    description: "Create a task proposal without writing task state.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Short proposal title.",
        },
        description: {
          type: "string",
          description: "Optional proposal details.",
        },
        priority: {
          type: "string",
          description: "Optional local priority label.",
        },
        acceptanceCriteria: {
          type: "array",
          items: { type: "string" },
          description: "Optional acceptance criteria for the proposed task.",
        },
        evidence: {
          type: "array",
          items: { type: "string" },
          description: "Optional local evidence references.",
        },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  {
    name: "draft_document_patch",
    description: "Draft a document patch without modifying the target document.",
    inputSchema: {
      type: "object",
      properties: {
        targetPath: {
          type: "string",
          description: "Local target path the patch would apply to.",
        },
        summary: {
          type: "string",
          description: "Optional summary of the proposed document change.",
        },
        patch: {
          type: "string",
          description: "Proposed patch text.",
        },
        diff: {
          type: "string",
          description: "Alternate proposed diff text.",
        },
      },
      required: ["targetPath"],
      additionalProperties: false,
    },
  },
  {
    name: "link_evidence",
    description: "Propose a local evidence link without persisting it.",
    inputSchema: {
      type: "object",
      properties: {
        evidenceRef: {
          type: "string",
          description: "Local evidence reference to link.",
        },
        targetRef: {
          type: "string",
          description: "Local target reference the evidence supports.",
        },
        relation: {
          type: "string",
          description: "Optional relation label.",
        },
        note: {
          type: "string",
          description: "Optional note for reviewers.",
        },
      },
      required: ["evidenceRef", "targetRef"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_automation_rule",
    description: "Draft an automation rule proposal without enabling it.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Automation rule proposal name.",
        },
        trigger: {
          type: "object",
          description: "Draft trigger definition.",
        },
        action: {
          type: "object",
          description: "Draft action definition.",
        },
        safeguards: {
          type: "array",
          items: { type: "string" },
          description: "Optional safeguards for the proposed rule.",
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
] satisfies readonly SafeLocalToolMetadata[]);

export const SAFE_LOCAL_MCP_TOOL_METADATA = MCP_SAFE_LOCAL_TOOL_METADATA;

export function createSafeLocalToolAdapter(
  options: SafeLocalToolAdapterOptions,
): SafeLocalToolAdapter {
  const registry = options.registry ?? createSafeLocalToolRegistry();

  return {
    listTools() {
      const listedNames = new Set(registry.list().map((tool) => tool.name));

      return {
        ok: true,
        value: {
          tools: cloneToolMetadata(
            MCP_SAFE_LOCAL_TOOL_METADATA.filter((tool) => listedNames.has(tool.name)),
          ),
        },
        auditRecords: [],
      };
    },
    async callTool(toolName, args, context = {}) {
      const capture = createAuditCapture(options.audit);
      const normalizedArgs = normalizeArgumentsForAdapter(args);

      if (!normalizedArgs.ok) {
        const safeToolName = normalizeToolNameForError(toolName);
        capture.emit({
          type: "tool_call_requested",
          toolName: safeToolName,
          arguments: {},
          actorId: context.actor?.id,
          metadata: context.metadata,
        });
        capture.emit({
          type: "tool_call_failed",
          toolName: safeToolName,
          arguments: {},
          actorId: context.actor?.id,
          reason: normalizedArgs.error.message,
          metadata: { code: "handler_failed" },
        });

        return {
          ok: false,
          error: {
            code: "handler_failed",
            message: normalizedArgs.error.message,
            toolName: safeToolName,
          },
          auditRecords: capture.records(),
        };
      }

      const normalizedToolName = normalizeToolNameForError(toolName);
      capture.emit({
        type: "tool_call_requested",
        toolName: normalizedToolName,
        arguments: normalizedArgs.value,
        actorId: context.actor?.id,
        metadata: context.metadata,
      });

      if (!isSafeLocalToolName(normalizedToolName)) {
        return unknownToolResult(normalizedToolName, normalizedArgs.value, context, capture);
      }

      const handlers = registry.handlers();
      const handler = handlers[normalizedToolName];
      if (!handler) {
        return unknownToolResult(normalizedToolName, normalizedArgs.value, context, capture);
      }

      let policy: NormalizedToolPolicyResult;
      try {
        policy = await evaluateToolPolicy(options.policy, {
          toolName: normalizedToolName,
          arguments: normalizedArgs.value,
          actor: context.actor,
          metadata: {
            ...context.metadata,
            operation: "tools.call",
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        capture.emit({
          type: "tool_call_failed",
          toolName: normalizedToolName,
          arguments: normalizedArgs.value,
          actorId: context.actor?.id,
          reason: message,
          metadata: { code: "handler_failed" },
        });

        return {
          ok: false,
          error: {
            code: "handler_failed",
            message,
            toolName: normalizedToolName,
          },
          auditRecords: capture.records(),
        };
      }

      if (policy.decision === "deny") {
        capture.emit({
          type: "tool_call_denied",
          toolName: normalizedToolName,
          arguments: normalizedArgs.value,
          actorId: context.actor?.id,
          decision: policy.decision,
          reason: policy.reason,
          metadata: policy.ruleId ? { ruleId: policy.ruleId } : undefined,
        });

        return {
          ok: false,
          error: policyError("denied", normalizedToolName, policy),
          auditRecords: capture.records(),
          policy,
        };
      }

      if (policy.decision === "require_approval") {
        capture.emit({
          type: "tool_call_approval_required",
          toolName: normalizedToolName,
          arguments: normalizedArgs.value,
          actorId: context.actor?.id,
          decision: policy.decision,
          reason: policy.reason,
          metadata: {
            ...(policy.ruleId ? { ruleId: policy.ruleId } : {}),
            ...(policy.approvalId ? { approvalId: policy.approvalId } : {}),
          },
        });

        return {
          ok: false,
          error: policyError("approval_required", normalizedToolName, policy),
          auditRecords: capture.records(),
          policy,
        };
      }

      capture.emit({
        type: "tool_call_approved",
        toolName: normalizedToolName,
        arguments: normalizedArgs.value,
        actorId: context.actor?.id,
        decision: policy.decision,
        reason: policy.reason,
        metadata: policy.ruleId ? { ruleId: policy.ruleId } : undefined,
      });

      try {
        const output = await handler(normalizedArgs.value, {
          toolName: normalizedToolName,
          actor: context.actor,
          metadata: context.metadata,
        });

        capture.emit({
          type: "tool_call_executed",
          toolName: normalizedToolName,
          arguments: normalizedArgs.value,
          actorId: context.actor?.id,
          decision: policy.decision,
          resultSummary: summarizeToolOutput(output),
        });

        return {
          ok: true,
          value: toMcpToolResult(output),
          auditRecords: capture.records(),
          policy,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        capture.emit({
          type: "tool_call_failed",
          toolName: normalizedToolName,
          arguments: normalizedArgs.value,
          actorId: context.actor?.id,
          decision: policy.decision,
          reason: message,
          metadata: {
            code: "handler_failed",
            ...(policy.ruleId ? { ruleId: policy.ruleId } : {}),
          },
        });

        return {
          ok: false,
          error: {
            code: "handler_failed",
            message,
            toolName: normalizedToolName,
            decision: policy.decision,
            reason: message,
            ruleId: policy.ruleId,
            policy,
          },
          auditRecords: capture.records(),
          policy,
        };
      }
    },
  };
}

export const createMcpSafeLocalToolAdapter = createSafeLocalToolAdapter;

function unknownToolResult(
  toolName: string,
  args: Record<string, unknown>,
  context: SafeLocalToolAdapterContext,
  capture: AuditCapture,
): SafeLocalToolAdapterResult<McpCallSafeLocalToolResult> {
  const message = `No safe local tool registered for ${toolName}`;
  capture.emit({
    type: "tool_call_failed",
    toolName,
    arguments: args,
    actorId: context.actor?.id,
    reason: message,
    metadata: { code: "unknown" },
  });

  return {
    ok: false,
    error: {
      code: "unknown",
      message,
      toolName,
    },
    auditRecords: capture.records(),
  };
}

function policyError(
  code: "denied" | "approval_required",
  toolName: string,
  policy: NormalizedToolPolicyResult,
): SafeLocalToolAdapterError {
  return {
    code,
    message:
      policy.reason ??
      (code === "denied"
        ? `Policy denied ${toolName}`
        : `Approval required for ${toolName}`),
    toolName,
    decision: policy.decision,
    reason: policy.reason,
    ruleId: policy.ruleId,
    approvalId: policy.approvalId,
    policy,
  };
}

function toMcpToolResult(output: unknown): McpCallSafeLocalToolResult {
  const safety = assessContentSafety(output);
  const text = stringifyToolOutput(output);

  return {
    content: [
      annotateTextContent(
        {
          type: "text",
          text,
        },
        safety,
      ),
    ],
    structuredContent: annotateStructuredContent(output, safety),
    safety: cloneSafetyAnnotation(safety),
  };
}

function stringifyToolOutput(output: unknown): string {
  if (typeof output === "string") {
    return output;
  }

  const serialized = JSON.stringify(output, null, 2);
  return serialized ?? String(output);
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

function normalizeArgumentsForAdapter(
  args: Record<string, unknown> | undefined,
):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: Error } {
  if (args === undefined) {
    return { ok: true, value: {} };
  }

  if (!isPlainRecord(args)) {
    return {
      ok: false,
      error: new TypeError("Tool call arguments must be an object."),
    };
  }

  return { ok: true, value: { ...args } };
}

function normalizeToolNameForError(toolName: string): string {
  return typeof toolName === "string" && toolName.trim().length > 0
    ? toolName
    : String(toolName);
}

interface ToolFailureAuditEvent extends Omit<ToolAuditEvent, "type"> {
  type: "tool_call_failed";
}

interface AuditCapture {
  emit(event: ToolAuditEvent | ToolFailureAuditEvent): ToolAuditRecord;
  records(): ToolAuditRecord[];
}

function createAuditCapture(audit: ToolAuditSink | undefined): AuditCapture {
  const sink = audit ?? createToolAuditEmitter();
  const records: ToolAuditRecord[] = [];

  return {
    emit(event) {
      const record = sink.emit(event as ToolAuditEvent);
      records.push(cloneAuditRecord(record));
      return record;
    },
    records() {
      return records.map(cloneAuditRecord);
    },
  };
}

function cloneToolMetadata(
  tools: readonly SafeLocalToolMetadata[],
): SafeLocalToolMetadata[] {
  return tools.map((tool) => cloneJsonLike(tool) as SafeLocalToolMetadata);
}

function cloneAuditRecord(record: ToolAuditRecord): ToolAuditRecord {
  return cloneJsonLike(record) as ToolAuditRecord;
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

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);
  for (const entryValue of Object.values(value as Record<string, unknown>)) {
    deepFreeze(entryValue);
  }

  return value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
