import {
  AUTOMATION_ACTION_TYPES,
  AUTOMATION_TRIGGER_TYPES,
  type AutomationAction,
  type AutomationActionContext,
  type AutomationActionProposal,
  type AutomationActionRegistryLike,
  type AutomationActionType,
  type AutomationTrigger,
  type AutomationTriggerMatch,
  type AutomationTriggerRegistryLike,
  type AutomationTriggerType,
  type LocalAutomationEvent,
  matchAutomationTrigger,
  proposeAutomationAction,
} from "./rules.ts";

export interface AutomationTriggerDefinition {
  type: AutomationTriggerType;
  description?: string;
  match?: (
    trigger: AutomationTrigger,
    event: LocalAutomationEvent,
  ) => AutomationTriggerMatch;
}

export interface AutomationActionDefinition {
  type: AutomationActionType;
  description?: string;
  propose?: (
    action: AutomationAction,
    context: AutomationActionContext,
  ) => AutomationActionProposal;
}

export interface AutomationRegistryEntry {
  type: string;
  description?: string;
}

export class AutomationRegistryEntryNotFoundError extends Error {
  constructor(kind: "trigger" | "action", type: string) {
    super(`No automation ${kind} registered for ${type}`);
    this.name = "AutomationRegistryEntryNotFoundError";
  }
}

export class AutomationTriggerRegistry implements AutomationTriggerRegistryLike {
  readonly #triggers = new Map<AutomationTriggerType, RequiredTriggerDefinition>();

  register(definition: AutomationTriggerDefinition): void {
    if (!AUTOMATION_TRIGGER_TYPES.includes(definition.type)) {
      throw new Error(`Unsupported automation trigger type: ${definition.type}`);
    }
    if (this.#triggers.has(definition.type)) {
      throw new Error(`Automation trigger already registered for ${definition.type}`);
    }

    this.#triggers.set(definition.type, {
      ...definition,
      match: definition.match ?? matchAutomationTrigger,
    });
  }

  list(): AutomationRegistryEntry[] {
    return [...this.#triggers.values()].map((trigger) => ({
      type: trigger.type,
      description: trigger.description,
    }));
  }

  match(
    trigger: AutomationTrigger,
    event: LocalAutomationEvent,
  ): AutomationTriggerMatch {
    const definition = this.#triggers.get(trigger.type);
    if (!definition) {
      throw new AutomationRegistryEntryNotFoundError("trigger", trigger.type);
    }

    return definition.match(trigger, event);
  }
}

export class AutomationActionRegistry implements AutomationActionRegistryLike {
  readonly #actions = new Map<AutomationActionType, RequiredActionDefinition>();

  register(definition: AutomationActionDefinition): void {
    if (!AUTOMATION_ACTION_TYPES.includes(definition.type)) {
      throw new Error(`Unsupported automation action type: ${definition.type}`);
    }
    if (this.#actions.has(definition.type)) {
      throw new Error(`Automation action already registered for ${definition.type}`);
    }

    this.#actions.set(definition.type, {
      ...definition,
      propose: definition.propose ?? proposeAutomationAction,
    });
  }

  list(): AutomationRegistryEntry[] {
    return [...this.#actions.values()].map((action) => ({
      type: action.type,
      description: action.description,
    }));
  }

  propose(
    action: AutomationAction,
    context: AutomationActionContext,
  ): AutomationActionProposal {
    const definition = this.#actions.get(action.type);
    if (!definition) {
      throw new AutomationRegistryEntryNotFoundError("action", action.type);
    }

    return definition.propose(action, context);
  }
}

export function createTriggerRegistry(
  options: { includeDefaults?: boolean } = {},
): AutomationTriggerRegistry {
  const registry = new AutomationTriggerRegistry();
  if (options.includeDefaults !== false) {
    registerDefaultTriggers(registry);
  }
  return registry;
}

export function createActionRegistry(
  options: { includeDefaults?: boolean } = {},
): AutomationActionRegistry {
  const registry = new AutomationActionRegistry();
  if (options.includeDefaults !== false) {
    registerDefaultActions(registry);
  }
  return registry;
}

export function registerDefaultTriggers(registry: AutomationTriggerRegistry): void {
  registry.register({
    type: "task_changed",
    description: "Matches local task change events.",
  });
  registry.register({
    type: "doc_updated",
    description: "Matches local document update events.",
  });
  registry.register({
    type: "incident_created",
    description: "Matches local incident creation events.",
  });
  registry.register({
    type: "approval_decided",
    description: "Matches local approval decision events.",
  });
}

export function registerDefaultActions(registry: AutomationActionRegistry): void {
  registry.register({
    type: "draft_doc",
    description: "Proposes a document draft.",
  });
  registry.register({
    type: "create_task",
    description: "Proposes a task creation.",
  });
  registry.register({
    type: "notify",
    description: "Proposes a notification.",
  });
  registry.register({
    type: "request_agent_review",
    description: "Proposes an agent review request.",
  });
}

type RequiredTriggerDefinition = Omit<AutomationTriggerDefinition, "match"> & {
  match: NonNullable<AutomationTriggerDefinition["match"]>;
};

type RequiredActionDefinition = Omit<AutomationActionDefinition, "propose"> & {
  propose: NonNullable<AutomationActionDefinition["propose"]>;
};
