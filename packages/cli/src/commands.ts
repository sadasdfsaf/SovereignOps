export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface CliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface RunCliOptions {
  readonly services?: CliServices;
  readonly stdin?: string;
}

export interface WorkspaceSummary {
  readonly workspaceId: string;
  readonly name: string;
  readonly deviceId: string;
  readonly rootKeyRef: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface WorkspaceEvent {
  readonly eventId: string;
  readonly workspaceId: string;
  readonly type: string;
  readonly payload?: JsonValue;
  readonly sequence: number;
  readonly createdAt: string;
}

export interface WorkspaceBundle {
  readonly format: "sovereignops.workspace.bundle";
  readonly version: 1;
  readonly exportedAt: string;
  readonly workspace: WorkspaceSummary;
  readonly events: readonly WorkspaceEvent[];
}

export interface CreateWorkspaceInput {
  readonly workspaceId: string;
  readonly name: string;
  readonly deviceId?: string;
  readonly rootKeyRef?: string;
}

export interface IngestEventInput {
  readonly workspaceId: string;
  readonly type: string;
  readonly payload?: JsonValue;
}

export interface IngestEventResult {
  readonly workspace: WorkspaceSummary;
  readonly event: WorkspaceEvent;
}

export interface ExportWorkspaceBundleInput {
  readonly workspaceId: string;
}

export type PolicyDecision = "allow" | "require_approval" | "deny";

export interface PolicyPreviewInput {
  readonly path: string;
  readonly capability: string;
  readonly actorId?: string;
  readonly metadata?: Record<string, JsonValue>;
}

export interface PolicyPreviewResult {
  readonly decision: PolicyDecision;
  readonly path: string;
  readonly capability: string;
  readonly reason: string;
  readonly ruleId?: string;
}

export interface AuditPreviewInput {
  readonly workspaceId?: string;
  readonly limit?: number;
}

export interface AuditRecord {
  readonly id: string;
  readonly type: string;
  readonly timestamp: string;
  readonly workspaceId?: string;
  readonly message?: string;
  readonly metadata?: Record<string, JsonValue>;
}

export interface AuditPreviewResult {
  readonly total: number;
  readonly records: readonly AuditRecord[];
}

export interface CliServices {
  readonly listWorkspaces: () => Awaitable<readonly WorkspaceSummary[]>;
  readonly createWorkspace: (input: CreateWorkspaceInput) => Awaitable<WorkspaceSummary>;
  readonly ingestEvent: (input: IngestEventInput) => Awaitable<IngestEventResult>;
  readonly exportWorkspaceBundle: (
    input: ExportWorkspaceBundleInput,
  ) => Awaitable<WorkspaceBundle>;
  readonly previewPolicy: (input: PolicyPreviewInput) => Awaitable<PolicyPreviewResult>;
  readonly previewAudit: (input: AuditPreviewInput) => Awaitable<AuditPreviewResult>;
}

export interface InMemoryCliServicesOptions {
  readonly workspaces?: readonly WorkspaceSummary[];
  readonly events?: readonly WorkspaceEvent[];
  readonly policyRules?: readonly PolicyPreviewRule[];
  readonly auditRecords?: readonly AuditRecord[];
  readonly now?: () => string;
}

export interface PolicyPreviewRule {
  readonly id: string;
  readonly path: string;
  readonly decision: PolicyDecision;
  readonly capability?: string;
  readonly reason?: string;
  readonly match?: "exact" | "prefix";
}

type Awaitable<T> = T | Promise<T>;

interface ParsedArgv {
  readonly positionals: readonly string[];
  readonly flags: Readonly<Record<string, string | boolean>>;
  readonly errors: readonly string[];
}

const DEFAULT_TIMESTAMP = "2026-04-27T00:00:00.000Z";
const BOOLEAN_FLAGS = new Set(["help", "h", "json", "stdin"]);

const HELP_TEXT = `SovereignOps CLI

Usage:
  sovereignops <command> [options]

Commands:
  workspace list
  workspace create --workspace-id <id> --name <name>
  ingest event --workspace-id <id> --type <event-type> [--payload-json <json>]
  policy preview --input-json <json>
  audit preview [--workspace-id <id>] [--limit <count>]
  export bundle --workspace-id <id>

Common options:
  -h, --help     Show this help text.
`;

export async function runCli(
  argv: readonly string[] = [],
  options: RunCliOptions = {},
): Promise<CliResult> {
  const parsed = parseArgv(argv);
  if (parsed.errors.length > 0) {
    return failure(2, parsed.errors.join("\n"));
  }

  if (hasHelp(parsed) || parsed.positionals.length === 0) {
    return success(HELP_TEXT);
  }

  const services = options.services ?? createInMemoryCliServices();
  const [command, subcommand] = parsed.positionals;

  try {
    if (command === "help") {
      return success(HELP_TEXT);
    }

    if (command === "workspace") {
      if (subcommand === "list") {
        return jsonSuccess(await services.listWorkspaces());
      }

      if (subcommand === "create") {
        const workspace = await services.createWorkspace({
          workspaceId: requireStringFlag(parsed, "workspace-id"),
          name: requireStringFlag(parsed, "name"),
          deviceId: optionalStringFlag(parsed, "device-id"),
          rootKeyRef: optionalStringFlag(parsed, "root-key-ref"),
        });
        return jsonSuccess(workspace);
      }

      if (subcommand === "export") {
        return handleExportBundle(parsed, services);
      }
    }

    if (command === "ingest" && subcommand === "event") {
      const payloadText = optionalStringFlag(parsed, "payload-json");
      const event = await services.ingestEvent({
        workspaceId: requireStringFlag(parsed, "workspace-id"),
        type: requireStringFlag(parsed, "type"),
        ...(payloadText === undefined
          ? {}
          : { payload: parseJsonValue(payloadText, "payload-json", options.stdin) }),
      });
      return jsonSuccess(event);
    }

    if (command === "policy" && subcommand === "preview") {
      const input = policyInputFromFlags(parsed, options.stdin);
      return jsonSuccess(await services.previewPolicy(input));
    }

    if (command === "audit" && subcommand === "preview") {
      const limit = optionalPositiveIntegerFlag(parsed, "limit");
      return jsonSuccess(
        await services.previewAudit({
          workspaceId: optionalStringFlag(parsed, "workspace-id"),
          ...(limit === undefined ? {} : { limit }),
        }),
      );
    }

    if (
      command === "export" &&
      (subcommand === "bundle" || subcommand === "workspace-bundle")
    ) {
      return handleExportBundle(parsed, services);
    }
  } catch (error) {
    if (error instanceof CliUsageError) {
      return failure(2, error.message);
    }

    return failure(1, error instanceof Error ? error.message : String(error));
  }

  return failure(
    1,
    `Unknown command: ${parsed.positionals.join(" ")}\nRun "sovereignops --help" for usage.`,
  );
}

export function createInMemoryCliServices(
  options: InMemoryCliServicesOptions = {},
): CliServices {
  const now = options.now ?? (() => DEFAULT_TIMESTAMP);
  const workspaces = new Map<string, WorkspaceSummary>();
  const events = new Map<string, WorkspaceEvent[]>();
  const hasCustomSeed =
    options.workspaces !== undefined ||
    options.events !== undefined ||
    options.policyRules !== undefined ||
    options.auditRecords !== undefined;
  const auditRecords: AuditRecord[] = cloneJson(
    options.auditRecords ?? (hasCustomSeed ? [] : defaultAuditRecords()),
  );
  const policyRules = cloneJson(
    options.policyRules ?? (hasCustomSeed ? [] : defaultPolicyRules()),
  );
  let nextAuditSequence = auditRecords.length + 1;

  for (const workspace of options.workspaces ?? (hasCustomSeed ? [] : defaultWorkspaces())) {
    workspaces.set(workspace.workspaceId, cloneJson(workspace));
  }

  for (const event of options.events ?? (hasCustomSeed ? [] : defaultEvents())) {
    const workspaceEvents = events.get(event.workspaceId) ?? [];
    workspaceEvents.push(cloneJson(event));
    events.set(event.workspaceId, workspaceEvents);
  }

  return {
    listWorkspaces() {
      return [...workspaces.values()]
        .map((workspace) => cloneJson(workspace))
        .sort((left, right) => left.workspaceId.localeCompare(right.workspaceId));
    },

    createWorkspace(input) {
      assertPrefixedId(input.workspaceId, "wsp_", "workspaceId");
      assertNonEmpty(input.name, "name");
      const deviceId = input.deviceId ?? "dev_local";
      const rootKeyRef = input.rootKeyRef ?? `key_${input.workspaceId.slice(4)}`;
      assertPrefixedId(deviceId, "dev_", "deviceId");
      assertPrefixedId(rootKeyRef, "key_", "rootKeyRef");

      if (workspaces.has(input.workspaceId)) {
        throw new Error(`Workspace already exists: ${input.workspaceId}`);
      }

      const timestamp = now();
      const workspace = {
        workspaceId: input.workspaceId,
        name: input.name,
        deviceId,
        rootKeyRef,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      workspaces.set(workspace.workspaceId, workspace);
      events.set(workspace.workspaceId, []);
      appendAudit({
        type: "workspace.created",
        workspaceId: workspace.workspaceId,
        message: `Created workspace ${workspace.name}.`,
      });
      return cloneJson(workspace);
    },

    ingestEvent(input) {
      const workspace = requireWorkspace(workspaces, input.workspaceId);
      assertNonEmpty(input.type, "type");
      const payload =
        input.payload === undefined ? undefined : cloneCheckedJson(input.payload, "payload");
      const workspaceEvents = events.get(input.workspaceId) ?? [];
      const sequence =
        workspaceEvents.reduce((max, event) => Math.max(max, event.sequence), 0) + 1;
      const timestamp = now();
      const event = {
        eventId: `evt_${input.workspaceId}_${String(sequence).padStart(8, "0")}`,
        workspaceId: input.workspaceId,
        type: input.type,
        ...(payload === undefined ? {} : { payload }),
        sequence,
        createdAt: timestamp,
      };
      workspaceEvents.push(event);
      events.set(input.workspaceId, workspaceEvents);
      workspaces.set(input.workspaceId, { ...workspace, updatedAt: timestamp });
      appendAudit({
        type: "ingest.event",
        workspaceId: input.workspaceId,
        message: `Ingested ${input.type}.`,
        metadata: { eventId: event.eventId },
      });

      return {
        workspace: cloneJson(workspaces.get(input.workspaceId) as WorkspaceSummary),
        event: cloneJson(event),
      };
    },

    exportWorkspaceBundle(input) {
      const workspace = requireWorkspace(workspaces, input.workspaceId);
      return {
        format: "sovereignops.workspace.bundle",
        version: 1,
        exportedAt: now(),
        workspace: cloneJson(workspace),
        events: cloneJson(eventsFor(events, input.workspaceId)),
      };
    },

    previewPolicy(input) {
      assertNonEmpty(input.path, "path");
      assertNonEmpty(input.capability, "capability");

      const rule = policyRules.find((candidate) => policyRuleMatches(candidate, input));
      if (!rule) {
        return {
          decision: "deny",
          path: input.path,
          capability: input.capability,
          reason: `No preview rule matched ${input.capability} for ${input.path}.`,
        };
      }

      appendAudit({
        type: "policy.preview",
        message: `Previewed ${input.capability} for ${input.path}.`,
        metadata: { decision: rule.decision, ruleId: rule.id },
      });

      return {
        decision: rule.decision,
        path: input.path,
        capability: input.capability,
        reason: rule.reason ?? `Matched preview rule ${rule.id}.`,
        ruleId: rule.id,
      };
    },

    previewAudit(input) {
      const filtered = auditRecords.filter(
        (record) => input.workspaceId === undefined || record.workspaceId === input.workspaceId,
      );
      const limit = input.limit ?? 20;
      return {
        total: filtered.length,
        records: cloneJson(filtered.slice(0, limit)),
      };
    },
  };

  function appendAudit(event: Omit<AuditRecord, "id" | "timestamp">): void {
    auditRecords.push({
      ...event,
      id: `audit_${String(nextAuditSequence++).padStart(4, "0")}`,
      timestamp: now(),
    });
  }
}

function handleExportBundle(
  parsed: ParsedArgv,
  services: CliServices,
): Promise<CliResult> {
  return Promise.resolve(
    services.exportWorkspaceBundle({
      workspaceId: requireStringFlag(parsed, "workspace-id"),
    }),
  ).then(jsonSuccess);
}

function policyInputFromFlags(parsed: ParsedArgv, stdin?: string): PolicyPreviewInput {
  const jsonInput = optionalStringFlag(parsed, "input-json") ?? optionalStringFlag(parsed, "input");
  if (jsonInput !== undefined) {
    const value = parseJsonValue(jsonInput, "input-json", stdin);
    if (!isRecord(value)) {
      throw new CliUsageError("policy preview input must be a JSON object.");
    }
    return normalizePolicyPreviewInput(value);
  }

  return normalizePolicyPreviewInput({
    path: requireStringFlag(parsed, "path"),
    capability: requireStringFlag(parsed, "capability"),
    actorId: optionalStringFlag(parsed, "actor-id"),
  });
}

function normalizePolicyPreviewInput(value: Record<string, unknown>): PolicyPreviewInput {
  if (typeof value.path !== "string" || value.path.trim().length === 0) {
    throw new CliUsageError("policy preview requires input.path.");
  }
  if (typeof value.capability !== "string" || value.capability.trim().length === 0) {
    throw new CliUsageError("policy preview requires input.capability.");
  }
  if (value.actorId !== undefined && typeof value.actorId !== "string") {
    throw new CliUsageError("policy preview input.actorId must be a string when provided.");
  }
  if (value.metadata !== undefined && !isRecord(value.metadata)) {
    throw new CliUsageError("policy preview input.metadata must be an object when provided.");
  }

  return {
    path: value.path,
    capability: value.capability,
    ...(value.actorId === undefined ? {} : { actorId: value.actorId }),
    ...(value.metadata === undefined
      ? {}
      : { metadata: cloneCheckedJson(value.metadata, "metadata") as Record<string, JsonValue> }),
  };
}

function parseArgv(argv: readonly string[]): ParsedArgv {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  const errors: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }

    if (token.startsWith("--")) {
      const [name, inlineValue] = splitLongFlag(token);
      if (name.length === 0) {
        errors.push("Long flag names cannot be empty.");
        continue;
      }

      if (inlineValue !== undefined) {
        setFlag(flags, name, inlineValue, errors);
        continue;
      }

      if (BOOLEAN_FLAGS.has(name)) {
        setFlag(flags, name, true, errors);
        continue;
      }

      const next = argv[index + 1];
      if (next === undefined || next.startsWith("-")) {
        errors.push(`Flag --${name} requires a value.`);
        continue;
      }

      setFlag(flags, name, next, errors);
      index += 1;
      continue;
    }

    if (token.startsWith("-") && token.length > 1) {
      if (token === "-h") {
        setFlag(flags, "help", true, errors);
      } else {
        errors.push(`Unsupported short flag: ${token}`);
      }
      continue;
    }

    positionals.push(token);
  }

  return { positionals, flags, errors };
}

function splitLongFlag(token: string): [string, string | undefined] {
  const equalsIndex = token.indexOf("=");
  if (equalsIndex === -1) {
    return [token.slice(2), undefined];
  }

  return [token.slice(2, equalsIndex), token.slice(equalsIndex + 1)];
}

function setFlag(
  flags: Record<string, string | boolean>,
  name: string,
  value: string | boolean,
  errors: string[],
): void {
  if (Object.hasOwn(flags, name)) {
    errors.push(`Flag --${name} was provided more than once.`);
    return;
  }

  flags[name] = value;
}

function hasHelp(parsed: ParsedArgv): boolean {
  return parsed.flags.help === true || parsed.flags.h === true;
}

function requireStringFlag(parsed: ParsedArgv, name: string): string {
  const value = optionalStringFlag(parsed, name);
  if (value === undefined || value.trim().length === 0) {
    throw new CliUsageError(`Missing required option --${name}.`);
  }

  return value;
}

function optionalStringFlag(parsed: ParsedArgv, name: string): string | undefined {
  const value = parsed.flags[name];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new CliUsageError(`Option --${name} requires a value.`);
  }

  return value;
}

function optionalPositiveIntegerFlag(parsed: ParsedArgv, name: string): number | undefined {
  const value = optionalStringFlag(parsed, name);
  if (value === undefined) {
    return undefined;
  }

  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    throw new CliUsageError(`Option --${name} must be a positive integer.`);
  }

  return parsedValue;
}

function parseJsonValue(value: string, label: string, stdin = ""): JsonValue {
  const source = value === "-" ? stdin : value;
  if (source.trim().length === 0) {
    throw new CliUsageError(`Option --${label} requires JSON input.`);
  }

  try {
    return cloneCheckedJson(JSON.parse(source), label);
  } catch (error) {
    if (error instanceof CliUsageError) {
      throw error;
    }
    throw new CliUsageError(`Option --${label} must contain valid JSON.`);
  }
}

function cloneCheckedJson(value: unknown, path: string): JsonValue {
  assertJsonValue(value, path);
  return cloneJson(value as JsonValue);
}

function assertJsonValue(value: unknown, path: string): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${path}[${index}]`));
    return;
  }

  if (isRecord(value)) {
    for (const [key, nestedValue] of Object.entries(value)) {
      assertJsonValue(nestedValue, `${path}.${key}`);
    }
    return;
  }

  throw new CliUsageError(`${path} must be JSON-compatible.`);
}

function assertPrefixedId(value: string, prefix: string, path: string): void {
  assertNonEmpty(value, path);
  if (!value.startsWith(prefix)) {
    throw new Error(`${path} must use the ${prefix} prefix.`);
  }
}

function assertNonEmpty(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${path} must be a non-empty string.`);
  }
}

function requireWorkspace(
  workspaces: ReadonlyMap<string, WorkspaceSummary>,
  workspaceId: string,
): WorkspaceSummary {
  assertPrefixedId(workspaceId, "wsp_", "workspaceId");
  const workspace = workspaces.get(workspaceId);
  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }

  return workspace;
}

function eventsFor(
  events: ReadonlyMap<string, readonly WorkspaceEvent[]>,
  workspaceId: string,
): readonly WorkspaceEvent[] {
  return [...(events.get(workspaceId) ?? [])].sort(
    (left, right) => left.sequence - right.sequence || left.eventId.localeCompare(right.eventId),
  );
}

function policyRuleMatches(rule: PolicyPreviewRule, input: PolicyPreviewInput): boolean {
  if (rule.capability !== undefined && rule.capability !== input.capability) {
    return false;
  }

  if ((rule.match ?? "exact") === "exact") {
    return rule.path === input.path;
  }

  const basePath = rule.path.endsWith("/") ? rule.path.slice(0, -1) : rule.path;
  return input.path === basePath || input.path.startsWith(`${basePath}/`);
}

function jsonSuccess(value: unknown): CliResult {
  return success(`${JSON.stringify(value, null, 2)}\n`);
}

function success(stdout: string): CliResult {
  return { exitCode: 0, stdout, stderr: "" };
}

function failure(exitCode: number, message: string): CliResult {
  return {
    exitCode,
    stdout: "",
    stderr: `${message.trimEnd()}\n`,
  };
}

function defaultWorkspaces(): readonly WorkspaceSummary[] {
  return [
    {
      workspaceId: "wsp_demo",
      name: "Notes Lab",
      deviceId: "dev_local",
      rootKeyRef: "key_demo",
      createdAt: DEFAULT_TIMESTAMP,
      updatedAt: DEFAULT_TIMESTAMP,
    },
  ];
}

function defaultEvents(): readonly WorkspaceEvent[] {
  return [
    {
      eventId: "evt_wsp_demo_00000001",
      workspaceId: "wsp_demo",
      type: "note.created",
      payload: { title: "Getting started" },
      sequence: 1,
      createdAt: DEFAULT_TIMESTAMP,
    },
  ];
}

function defaultPolicyRules(): readonly PolicyPreviewRule[] {
  return [
    {
      id: "rule_notes_read",
      path: "workspace://wsp_demo/notes",
      capability: "read_object",
      decision: "allow",
      match: "prefix",
      reason: "Read previews are allowed for notes.",
    },
    {
      id: "rule_workspace_write",
      path: "workspace://wsp_demo",
      capability: "write_object",
      decision: "require_approval",
      match: "prefix",
      reason: "Write previews require local approval.",
    },
  ];
}

function defaultAuditRecords(): readonly AuditRecord[] {
  return [
    {
      id: "audit_0001",
      type: "workspace.opened",
      timestamp: DEFAULT_TIMESTAMP,
      workspaceId: "wsp_demo",
      message: "Opened workspace Notes Lab.",
    },
  ];
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}
