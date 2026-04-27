import type { AuditSink } from "./audit.ts";
import {
  type GatewayActor,
  type GatewayCapability,
  type PolicyEvaluator,
  createPolicyMiddleware,
} from "./policy.ts";

export interface GatewayRegistryContext {
  actor?: GatewayActor;
  metadata?: Record<string, unknown>;
}

export interface GatewayHandlerContext extends GatewayRegistryContext {
  path: string;
  capability: GatewayCapability;
}

export type ResourceHandler<T = unknown> = (
  context: GatewayHandlerContext,
) => T | Promise<T>;

export type ToolHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  context: GatewayHandlerContext,
) => TOutput | Promise<TOutput>;

export interface RegisteredResource<T = unknown> {
  path: string;
  handler: ResourceHandler<T>;
  capability?: GatewayCapability;
  description?: string;
}

export interface RegisteredTool<TInput = unknown, TOutput = unknown> {
  path: string;
  handler: ToolHandler<TInput, TOutput>;
  capability?: GatewayCapability;
  description?: string;
}

export interface RegistryOptions {
  policy: PolicyEvaluator;
  audit?: AuditSink;
}

export interface RegistryEntrySummary {
  path: string;
  capability: GatewayCapability;
  description?: string;
}

export class RegistryPathNotFoundError extends Error {
  constructor(path: string) {
    super(`No gateway registry entry found for ${path}`);
    this.name = "RegistryPathNotFoundError";
  }
}

export class ResourceRegistry {
  readonly #resources = new Map<string, RequiredCapability<RegisteredResource>>();
  readonly #policy: PolicyEvaluator;
  readonly #audit?: AuditSink;

  constructor(options: RegistryOptions) {
    this.#policy = options.policy;
    this.#audit = options.audit;
  }

  register<T>(resource: RegisteredResource<T>): void {
    const path = normalizePath(resource.path);
    if (this.#resources.has(path)) {
      throw new Error(`Resource already registered for ${path}`);
    }

    this.#resources.set(path, {
      ...resource,
      path,
      capability: resource.capability ?? "read_object",
    });
  }

  list(): RegistryEntrySummary[] {
    return [...this.#resources.values()].map((resource) => ({
      path: resource.path,
      capability: resource.capability,
      description: resource.description,
    }));
  }

  async read<T = unknown>(path: string, context: GatewayRegistryContext = {}): Promise<T> {
    const normalizedPath = normalizePath(path);
    const resource = this.#resources.get(normalizedPath);
    const capability = resource?.capability ?? "read_object";
    const middleware = createPolicyMiddleware(this.#policy, this.#audit);

    return middleware(
      requestFor(normalizedPath, capability, context, "resource"),
      async () => {
        if (!resource) {
          throw new RegistryPathNotFoundError(normalizedPath);
        }

        return resource.handler({
          ...context,
          path: normalizedPath,
          capability,
        }) as T | Promise<T>;
      },
    ) as Promise<T>;
  }
}

export class ToolRegistry {
  readonly #tools = new Map<string, RequiredCapability<RegisteredTool>>();
  readonly #policy: PolicyEvaluator;
  readonly #audit?: AuditSink;

  constructor(options: RegistryOptions) {
    this.#policy = options.policy;
    this.#audit = options.audit;
  }

  register<TInput, TOutput>(tool: RegisteredTool<TInput, TOutput>): void {
    const path = normalizePath(tool.path);
    if (this.#tools.has(path)) {
      throw new Error(`Tool already registered for ${path}`);
    }

    this.#tools.set(path, {
      ...tool,
      path,
      capability: tool.capability ?? "propose_agent_action",
    });
  }

  list(): RegistryEntrySummary[] {
    return [...this.#tools.values()].map((tool) => ({
      path: tool.path,
      capability: tool.capability,
      description: tool.description,
    }));
  }

  async call<TInput = unknown, TOutput = unknown>(
    path: string,
    input: TInput,
    context: GatewayRegistryContext = {},
  ): Promise<TOutput> {
    const normalizedPath = normalizePath(path);
    const tool = this.#tools.get(normalizedPath);
    const capability = tool?.capability ?? "propose_agent_action";
    const middleware = createPolicyMiddleware(this.#policy, this.#audit);

    return middleware(
      requestFor(normalizedPath, capability, context, "tool"),
      async () => {
        if (!tool) {
          throw new RegistryPathNotFoundError(normalizedPath);
        }

        return tool.handler(input, {
          ...context,
          path: normalizedPath,
          capability,
        }) as TOutput | Promise<TOutput>;
      },
    ) as Promise<TOutput>;
  }
}

export function createResourceRegistry(options: RegistryOptions): ResourceRegistry {
  return new ResourceRegistry(options);
}

export function createToolRegistry(options: RegistryOptions): ToolRegistry {
  return new ToolRegistry(options);
}

function requestFor(
  path: string,
  capability: GatewayCapability,
  context: GatewayRegistryContext,
  registryKind: "resource" | "tool",
) {
  return {
    path,
    capability,
    actor: context.actor,
    metadata: {
      ...context.metadata,
      registryKind,
    },
  };
}

function normalizePath(path: string): string {
  if (typeof path !== "string" || path.trim().length === 0) {
    throw new TypeError("Gateway registry path must be a non-empty string.");
  }

  return path;
}

type RequiredCapability<T extends { capability?: GatewayCapability }> = Omit<T, "capability"> & {
  capability: GatewayCapability;
};
