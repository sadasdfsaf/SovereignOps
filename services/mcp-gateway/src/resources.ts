import type {
  GatewayResourceContent,
  GatewayResourceDefinition,
  GatewayResourceRegistryLike,
} from "./adapter.ts";

export const GATEWAY_RESOURCE_URIS = Object.freeze({
  docsGuide: "sovereignops://docs/operator-guide",
  taskQueue: "sovereignops://tasks/sample-queue",
  incidentReport: "sovereignops://incidents/sync-delay-drill",
  searchIndex: "sovereignops://search/workspace-index",
  auditTrail: "sovereignops://audit/policy-trace",
});

export class GatewayResourceRegistry implements GatewayResourceRegistryLike {
  readonly #resources = new Map<string, GatewayResourceDefinition>();

  constructor(resources: readonly GatewayResourceDefinition[] = []) {
    for (const resource of resources) {
      this.register(resource);
    }
  }

  register(resource: GatewayResourceDefinition): void {
    const uri = normalizeResourceUri(resource.uri);
    if (this.#resources.has(uri)) {
      throw new Error(`Gateway resource already registered for ${uri}`);
    }

    this.#resources.set(uri, {
      ...resource,
      uri,
      capability: resource.capability ?? "read_object",
    });
  }

  list(): readonly GatewayResourceDefinition[] {
    return [...this.#resources.values()];
  }

  get(uri: string): GatewayResourceDefinition | undefined {
    return this.#resources.get(normalizeResourceUri(uri));
  }
}

export const DEFAULT_GATEWAY_RESOURCES: readonly GatewayResourceDefinition[] = Object.freeze([
  createTextResource({
    uri: GATEWAY_RESOURCE_URIS.docsGuide,
    name: "Operator Guide",
    description: "Short reference for local-first agent workspace operations.",
    metadata: { category: "docs" },
    text: [
      "# Operator Guide",
      "",
      "- Keep workspace data local-first and encrypted.",
      "- Route agent access through scoped gateway resources.",
      "- Record policy outcomes as audit intents before emitting durable records.",
    ].join("\n"),
  }),
  createTextResource({
    uri: GATEWAY_RESOURCE_URIS.taskQueue,
    name: "Sample Task Queue",
    description: "Safe sample tasks for plugin review and sync checks.",
    metadata: { category: "tasks" },
    text: JSON.stringify(
      {
        tasks: [
          { id: "task-plugin-review", title: "Review plugin manifest", status: "ready" },
          { id: "task-sync-check", title: "Confirm encrypted sync health", status: "ready" },
        ],
      },
      null,
      2,
    ),
  }),
  createTextResource({
    uri: GATEWAY_RESOURCE_URIS.incidentReport,
    name: "Sync Delay Drill",
    description: "Sample incident notes for a delayed encrypted sync drill.",
    metadata: { category: "incidents" },
    text: JSON.stringify(
      {
        incident: "sync-delay-drill",
        status: "contained",
        notes: [
          "Observed delayed workspace replication in a test environment.",
          "Verified local access remained available.",
          "Queued a follow-up task for retry telemetry review.",
        ],
      },
      null,
      2,
    ),
  }),
  createTextResource({
    uri: GATEWAY_RESOURCE_URIS.searchIndex,
    name: "Workspace Search Index",
    description: "Sample search metadata for local docs, tasks, and audit entries.",
    metadata: { category: "search" },
    text: JSON.stringify(
      {
        results: [
          { uri: GATEWAY_RESOURCE_URIS.docsGuide, title: "Operator Guide" },
          { uri: GATEWAY_RESOURCE_URIS.taskQueue, title: "Sample Task Queue" },
          { uri: GATEWAY_RESOURCE_URIS.auditTrail, title: "Policy Trace" },
        ],
      },
      null,
      2,
    ),
  }),
  createTextResource({
    uri: GATEWAY_RESOURCE_URIS.auditTrail,
    name: "Policy Trace",
    description: "Sample audit intent trace for policy decisions.",
    metadata: { category: "audit" },
    text: JSON.stringify(
      {
        auditIntents: [
          {
            type: "policy_decision",
            decision: "allow",
            resource: GATEWAY_RESOURCE_URIS.docsGuide,
          },
        ],
      },
      null,
      2,
    ),
  }),
]);

export function createDefaultGatewayResourceRegistry(): GatewayResourceRegistry {
  return new GatewayResourceRegistry(DEFAULT_GATEWAY_RESOURCES);
}

export function createGatewayResourceRegistry(
  resources: readonly GatewayResourceDefinition[] = [],
): GatewayResourceRegistry {
  return new GatewayResourceRegistry(resources);
}

function createTextResource(options: {
  uri: string;
  name: string;
  description: string;
  metadata: Record<string, unknown>;
  text: string;
}): GatewayResourceDefinition {
  return Object.freeze({
    uri: options.uri,
    name: options.name,
    description: options.description,
    mimeType: "text/plain",
    capability: "read_object",
    metadata: Object.freeze({ ...options.metadata }),
    read: () =>
      ({
        uri: options.uri,
        mimeType: "text/plain",
        text: options.text,
      }) satisfies GatewayResourceContent,
  });
}

function normalizeResourceUri(uri: string): string {
  if (typeof uri !== "string" || uri.trim().length === 0) {
    throw new TypeError("Gateway resource URI must be a non-empty string.");
  }

  return uri;
}
