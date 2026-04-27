export const WORKSPACE_LAYOUT_VERSION = 3;

export const DESKTOP_COMMAND_IDS = [
  "workspace.open",
  "workspace.lock",
  "workspace.unlock",
  "gateway.start",
  "workspace.plan_file_layout_migration",
] as const;

export type DesktopCommandId = (typeof DESKTOP_COMMAND_IDS)[number];

export type DesktopCommandCategory = "workspace" | "gateway";

export type DesktopHostEffect =
  | "filesystem-read"
  | "filesystem-write"
  | "process-start"
  | "state-transition"
  | "none";

export interface DesktopCommandDefinition {
  readonly id: DesktopCommandId;
  readonly tauriCommand: string;
  readonly version: 1;
  readonly category: DesktopCommandCategory;
  readonly summary: string;
  readonly payload: string;
  readonly result: string;
  readonly hostEffects: readonly DesktopHostEffect[];
}

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

export type ValidationResult<TValue> =
  | {
      readonly ok: true;
      readonly issues: readonly [];
      readonly value: TValue;
    }
  | {
      readonly ok: false;
      readonly issues: readonly ValidationIssue[];
    };

export type SafePathKind = "windows-drive" | "unc" | "posix";

export interface SafePathDescriptor {
  readonly raw: string;
  readonly normalized: string;
  readonly kind: SafePathKind;
  readonly segments: readonly string[];
}

export type WorkspaceOpenMode = "read-write" | "read-only";

export interface WorkspaceOpenPayload {
  readonly workspacePath: SafePathDescriptor;
  readonly expectedLayoutVersion: number;
  readonly mode: WorkspaceOpenMode;
  readonly requestedAt?: string;
}

export interface WorkspaceLockPayload {
  readonly workspaceId: `wsp_${string}`;
  readonly deviceId: `dev_${string}`;
  readonly requestedAt: string;
  readonly lockToken?: `lock_${string}`;
  readonly reason?: string;
}

export interface WorkspaceUnlockPayload {
  readonly workspaceId: `wsp_${string}`;
  readonly deviceId: `dev_${string}`;
  readonly requestedAt: string;
  readonly lockToken: `lock_${string}`;
}

export type GatewayTransport = "stdio" | "http";
export type GatewayLogLevel = "error" | "warn" | "info" | "debug";

export interface GatewayStartPayload {
  readonly workspaceId: `wsp_${string}`;
  readonly workspacePath: SafePathDescriptor;
  readonly transport: GatewayTransport;
  readonly host: "127.0.0.1" | "localhost";
  readonly port: number;
  readonly logLevel: GatewayLogLevel;
  readonly requestedAt?: string;
}

export interface GatewayStartRequest {
  readonly commandId: "gateway.start";
  readonly tauriCommand: "gateway_start";
  readonly sidecar: "mcp-gateway";
  readonly arguments: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly healthCheck?: {
    readonly url: string;
    readonly method: "GET";
  };
}

export type WorkspaceLayoutEntryKind = "directory" | "file";

export interface WorkspaceLayoutEntry {
  readonly key: string;
  readonly kind: WorkspaceLayoutEntryKind;
  readonly relativePath: string;
  readonly absolutePath: string;
  readonly introducedIn: number;
}

export interface WorkspaceLayoutDescriptor {
  readonly rootPath: SafePathDescriptor;
  readonly version: number;
  readonly entries: readonly WorkspaceLayoutEntry[];
}

export interface WorkspaceLayoutMigrationInput {
  readonly rootPath: SafePathDescriptor;
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly requestedAt?: string;
}

export type WorkspaceLayoutMigrationOperation =
  | "ensure_directory"
  | "ensure_json_file";

export interface WorkspaceLayoutMigrationStep {
  readonly id: string;
  readonly order: number;
  readonly version: number;
  readonly operation: WorkspaceLayoutMigrationOperation;
  readonly relativePath: string;
  readonly absolutePath: string;
}

export interface WorkspaceLayoutMigrationPlan {
  readonly rootPath: SafePathDescriptor;
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly targetLayout: WorkspaceLayoutDescriptor;
  readonly steps: readonly WorkspaceLayoutMigrationStep[];
}

export interface WorkspaceLockState {
  readonly workspaceId: `wsp_${string}`;
  readonly locked: boolean;
  readonly revision: number;
  readonly deviceId?: `dev_${string}`;
  readonly lockToken?: `lock_${string}`;
  readonly lockedAt?: string;
  readonly unlockedAt?: string;
  readonly reason?: string;
}

export type WorkspaceLockTransitionStatus =
  | "locked"
  | "already_locked"
  | "unlocked"
  | "already_unlocked"
  | "unlock_rejected";

export interface WorkspaceLockTransition {
  readonly status: WorkspaceLockTransitionStatus;
  readonly previousState: WorkspaceLockState;
  readonly state: WorkspaceLockState;
}

export type DesktopCommandPayload =
  | WorkspaceOpenPayload
  | WorkspaceLockPayload
  | WorkspaceUnlockPayload
  | GatewayStartPayload
  | WorkspaceLayoutMigrationInput;

const WORKSPACE_ID_PATTERN = /^wsp_[A-Za-z0-9_-]{1,88}$/;
const DEVICE_ID_PATTERN = /^dev_[A-Za-z0-9_-]{1,88}$/;
const LOCK_TOKEN_PATTERN = /^lock_[A-Za-z0-9_-]{1,88}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const COMMAND_DEFINITIONS: readonly DesktopCommandDefinition[] = Object.freeze([
  Object.freeze({
    id: "workspace.open",
    tauriCommand: "workspace_open",
    version: 1,
    category: "workspace",
    summary: "Open a local workspace after validating its path and expected layout.",
    payload: "WorkspaceOpenPayload",
    result: "WorkspaceLayoutDescriptor",
    hostEffects: Object.freeze(["filesystem-read", "state-transition"]),
  }),
  Object.freeze({
    id: "workspace.lock",
    tauriCommand: "workspace_lock",
    version: 1,
    category: "workspace",
    summary: "Move a workspace session into the locked state.",
    payload: "WorkspaceLockPayload",
    result: "WorkspaceLockTransition",
    hostEffects: Object.freeze(["state-transition", "filesystem-write"]),
  }),
  Object.freeze({
    id: "workspace.unlock",
    tauriCommand: "workspace_unlock",
    version: 1,
    category: "workspace",
    summary: "Unlock a workspace session with a matching lock token.",
    payload: "WorkspaceUnlockPayload",
    result: "WorkspaceLockTransition",
    hostEffects: Object.freeze(["state-transition", "filesystem-write"]),
  }),
  Object.freeze({
    id: "gateway.start",
    tauriCommand: "gateway_start",
    version: 1,
    category: "gateway",
    summary: "Build the local gateway sidecar start request.",
    payload: "GatewayStartPayload",
    result: "GatewayStartRequest",
    hostEffects: Object.freeze(["process-start"]),
  }),
  Object.freeze({
    id: "workspace.plan_file_layout_migration",
    tauriCommand: "workspace_plan_file_layout_migration",
    version: 1,
    category: "workspace",
    summary: "Plan ordered workspace file layout migration steps without applying them.",
    payload: "WorkspaceLayoutMigrationInput",
    result: "WorkspaceLayoutMigrationPlan",
    hostEffects: Object.freeze(["none"]),
  }),
]);

const WORKSPACE_OPEN_FIELDS = new Set([
  "workspacePath",
  "expectedLayoutVersion",
  "mode",
  "requestedAt",
]);
const WORKSPACE_LOCK_FIELDS = new Set([
  "workspaceId",
  "deviceId",
  "requestedAt",
  "lockToken",
  "reason",
]);
const WORKSPACE_UNLOCK_FIELDS = new Set([
  "workspaceId",
  "deviceId",
  "requestedAt",
  "lockToken",
]);
const GATEWAY_START_FIELDS = new Set([
  "workspaceId",
  "workspacePath",
  "transport",
  "host",
  "port",
  "logLevel",
  "requestedAt",
]);
const MIGRATION_INPUT_FIELDS = new Set([
  "rootPath",
  "fromVersion",
  "toVersion",
  "requestedAt",
]);

const WORKSPACE_LAYOUT_ENTRIES: readonly Omit<WorkspaceLayoutEntry, "absolutePath">[] =
  Object.freeze([
    Object.freeze({
      key: "controlDir",
      kind: "directory",
      relativePath: ".sovereignops",
      introducedIn: 1,
    }),
    Object.freeze({
      key: "manifest",
      kind: "file",
      relativePath: ".sovereignops/workspace.json",
      introducedIn: 1,
    }),
    Object.freeze({
      key: "eventsDir",
      kind: "directory",
      relativePath: ".sovereignops/events",
      introducedIn: 2,
    }),
    Object.freeze({
      key: "objectsDir",
      kind: "directory",
      relativePath: ".sovereignops/objects",
      introducedIn: 2,
    }),
    Object.freeze({
      key: "indexDir",
      kind: "directory",
      relativePath: ".sovereignops/index",
      introducedIn: 2,
    }),
    Object.freeze({
      key: "locksDir",
      kind: "directory",
      relativePath: ".sovereignops/locks",
      introducedIn: 3,
    }),
    Object.freeze({
      key: "gatewayConfig",
      kind: "file",
      relativePath: ".sovereignops/gateway.json",
      introducedIn: 3,
    }),
    Object.freeze({
      key: "migrationsDir",
      kind: "directory",
      relativePath: ".sovereignops/migrations",
      introducedIn: 3,
    }),
  ]);

const WORKSPACE_MIGRATION_STEPS: readonly Omit<
  WorkspaceLayoutMigrationStep,
  "absolutePath"
>[] = Object.freeze([
  Object.freeze({
    id: "layout.v1.control_dir",
    order: 10,
    version: 1,
    operation: "ensure_directory",
    relativePath: ".sovereignops",
  }),
  Object.freeze({
    id: "layout.v1.manifest",
    order: 20,
    version: 1,
    operation: "ensure_json_file",
    relativePath: ".sovereignops/workspace.json",
  }),
  Object.freeze({
    id: "layout.v2.events_dir",
    order: 30,
    version: 2,
    operation: "ensure_directory",
    relativePath: ".sovereignops/events",
  }),
  Object.freeze({
    id: "layout.v2.objects_dir",
    order: 40,
    version: 2,
    operation: "ensure_directory",
    relativePath: ".sovereignops/objects",
  }),
  Object.freeze({
    id: "layout.v2.index_dir",
    order: 50,
    version: 2,
    operation: "ensure_directory",
    relativePath: ".sovereignops/index",
  }),
  Object.freeze({
    id: "layout.v3.locks_dir",
    order: 60,
    version: 3,
    operation: "ensure_directory",
    relativePath: ".sovereignops/locks",
  }),
  Object.freeze({
    id: "layout.v3.gateway_config",
    order: 70,
    version: 3,
    operation: "ensure_json_file",
    relativePath: ".sovereignops/gateway.json",
  }),
  Object.freeze({
    id: "layout.v3.migrations_dir",
    order: 80,
    version: 3,
    operation: "ensure_directory",
    relativePath: ".sovereignops/migrations",
  }),
]);

export const DESKTOP_COMMAND_DEFINITIONS = COMMAND_DEFINITIONS;

export function listDesktopCommandDefinitions(): readonly DesktopCommandDefinition[] {
  return COMMAND_DEFINITIONS.map((definition) => ({
    ...definition,
    hostEffects: [...definition.hostEffects],
  }));
}

export function findDesktopCommandDefinition(
  id: DesktopCommandId,
): DesktopCommandDefinition | undefined {
  const definition = COMMAND_DEFINITIONS.find((command) => command.id === id);
  return definition
    ? {
        ...definition,
        hostEffects: [...definition.hostEffects],
      }
    : undefined;
}

export function isDesktopCommandId(value: unknown): value is DesktopCommandId {
  return (
    typeof value === "string" &&
    (DESKTOP_COMMAND_IDS as readonly string[]).includes(value)
  );
}

export function validateCommandPayload(
  commandId: unknown,
  payload: unknown,
): ValidationResult<DesktopCommandPayload> {
  if (!isDesktopCommandId(commandId)) {
    return invalid([{ path: "commandId", message: "unsupported desktop command" }]);
  }

  switch (commandId) {
    case "workspace.open":
      return validateWorkspaceOpenPayload(payload);
    case "workspace.lock":
      return validateWorkspaceLockPayload(payload);
    case "workspace.unlock":
      return validateWorkspaceUnlockPayload(payload);
    case "gateway.start":
      return validateGatewayStartPayload(payload);
    case "workspace.plan_file_layout_migration":
      return validateWorkspaceLayoutMigrationInput(payload);
  }
}

export function validateWorkspaceOpenPayload(
  value: unknown,
): ValidationResult<WorkspaceOpenPayload> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return invalid([{ path: "$", message: "workspace open payload must be an object" }]);
  }

  rejectUnknownFields(value, WORKSPACE_OPEN_FIELDS, "$", issues);
  const workspacePath = requireSafePath(value.workspacePath, "workspacePath", issues);
  const expectedLayoutVersion = optionalLayoutVersion(
    value.expectedLayoutVersion,
    "expectedLayoutVersion",
    issues,
    WORKSPACE_LAYOUT_VERSION,
  );
  const mode = optionalEnum(
    value.mode,
    "mode",
    ["read-write", "read-only"] as const,
    issues,
    "read-write",
  );
  const requestedAt = optionalIsoTimestamp(value.requestedAt, "requestedAt", issues);

  if (issues.length > 0 || !workspacePath || !expectedLayoutVersion || !mode) {
    return invalid(issues);
  }

  return valid({
    workspacePath,
    expectedLayoutVersion,
    mode,
    ...(requestedAt ? { requestedAt } : {}),
  });
}

export function validateWorkspaceLockPayload(
  value: unknown,
): ValidationResult<WorkspaceLockPayload> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return invalid([{ path: "$", message: "workspace lock payload must be an object" }]);
  }

  rejectUnknownFields(value, WORKSPACE_LOCK_FIELDS, "$", issues);
  const workspaceId = requirePrefixedId(
    value.workspaceId,
    "workspaceId",
    WORKSPACE_ID_PATTERN,
    "wsp_",
    issues,
  ) as `wsp_${string}` | undefined;
  const deviceId = requirePrefixedId(
    value.deviceId,
    "deviceId",
    DEVICE_ID_PATTERN,
    "dev_",
    issues,
  ) as `dev_${string}` | undefined;
  const requestedAt = requireIsoTimestamp(value.requestedAt, "requestedAt", issues);
  const lockToken = optionalPrefixedId(
    value.lockToken,
    "lockToken",
    LOCK_TOKEN_PATTERN,
    "lock_",
    issues,
  ) as `lock_${string}` | undefined;
  const reason = optionalNonEmptyString(value.reason, "reason", issues);

  if (issues.length > 0 || !workspaceId || !deviceId || !requestedAt) {
    return invalid(issues);
  }

  return valid({
    workspaceId,
    deviceId,
    requestedAt,
    ...(lockToken ? { lockToken } : {}),
    ...(reason ? { reason } : {}),
  });
}

export function validateWorkspaceUnlockPayload(
  value: unknown,
): ValidationResult<WorkspaceUnlockPayload> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return invalid([{ path: "$", message: "workspace unlock payload must be an object" }]);
  }

  rejectUnknownFields(value, WORKSPACE_UNLOCK_FIELDS, "$", issues);
  const workspaceId = requirePrefixedId(
    value.workspaceId,
    "workspaceId",
    WORKSPACE_ID_PATTERN,
    "wsp_",
    issues,
  ) as `wsp_${string}` | undefined;
  const deviceId = requirePrefixedId(
    value.deviceId,
    "deviceId",
    DEVICE_ID_PATTERN,
    "dev_",
    issues,
  ) as `dev_${string}` | undefined;
  const requestedAt = requireIsoTimestamp(value.requestedAt, "requestedAt", issues);
  const lockToken = requirePrefixedId(
    value.lockToken,
    "lockToken",
    LOCK_TOKEN_PATTERN,
    "lock_",
    issues,
  ) as `lock_${string}` | undefined;

  if (issues.length > 0 || !workspaceId || !deviceId || !requestedAt || !lockToken) {
    return invalid(issues);
  }

  return valid({
    workspaceId,
    deviceId,
    requestedAt,
    lockToken,
  });
}

export function validateGatewayStartPayload(
  value: unknown,
): ValidationResult<GatewayStartPayload> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return invalid([{ path: "$", message: "gateway start payload must be an object" }]);
  }

  rejectUnknownFields(value, GATEWAY_START_FIELDS, "$", issues);
  const workspaceId = requirePrefixedId(
    value.workspaceId,
    "workspaceId",
    WORKSPACE_ID_PATTERN,
    "wsp_",
    issues,
  ) as `wsp_${string}` | undefined;
  const workspacePath = requireSafePath(value.workspacePath, "workspacePath", issues);
  const transport = optionalEnum(
    value.transport,
    "transport",
    ["stdio", "http"] as const,
    issues,
    "http",
  );
  const host = optionalEnum(
    value.host,
    "host",
    ["127.0.0.1", "localhost"] as const,
    issues,
    "127.0.0.1",
  );
  const port = optionalPort(value.port, "port", issues, 0);
  const logLevel = optionalEnum(
    value.logLevel,
    "logLevel",
    ["error", "warn", "info", "debug"] as const,
    issues,
    "info",
  );
  const requestedAt = optionalIsoTimestamp(value.requestedAt, "requestedAt", issues);

  if (
    issues.length > 0 ||
    !workspaceId ||
    !workspacePath ||
    !transport ||
    !host ||
    port === undefined ||
    !logLevel
  ) {
    return invalid(issues);
  }

  return valid({
    workspaceId,
    workspacePath,
    transport,
    host,
    port,
    logLevel,
    ...(requestedAt ? { requestedAt } : {}),
  });
}

export function validateWorkspaceLayoutMigrationInput(
  value: unknown,
): ValidationResult<WorkspaceLayoutMigrationInput> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return invalid([{ path: "$", message: "migration input must be an object" }]);
  }

  rejectUnknownFields(value, MIGRATION_INPUT_FIELDS, "$", issues);
  const rootPath = requireSafePath(value.rootPath, "rootPath", issues);
  const fromVersion = requireMigrationVersion(
    value.fromVersion,
    "fromVersion",
    issues,
    0,
  );
  const toVersion = optionalLayoutVersion(
    value.toVersion,
    "toVersion",
    issues,
    WORKSPACE_LAYOUT_VERSION,
  );
  const requestedAt = optionalIsoTimestamp(value.requestedAt, "requestedAt", issues);

  if (
    fromVersion !== undefined &&
    toVersion !== undefined &&
    fromVersion > toVersion
  ) {
    issues.push({
      path: "fromVersion",
      message: "fromVersion must be less than or equal to toVersion",
    });
  }

  if (issues.length > 0 || !rootPath || fromVersion === undefined || !toVersion) {
    return invalid(issues);
  }

  return valid({
    rootPath,
    fromVersion,
    toVersion,
    ...(requestedAt ? { requestedAt } : {}),
  });
}

export function validateSafePathDescriptor(
  value: unknown,
  path = "$",
): ValidationResult<SafePathDescriptor> {
  const issues: ValidationIssue[] = [];
  const descriptor = requireSafePath(value, path, issues);
  return issues.length > 0 || !descriptor ? invalid(issues) : valid(descriptor);
}

export function createWorkspaceLayoutDescriptor(
  rootPath: unknown,
  version = WORKSPACE_LAYOUT_VERSION,
): ValidationResult<WorkspaceLayoutDescriptor> {
  const issues: ValidationIssue[] = [];
  const root = requireSafePath(rootPath, "rootPath", issues);
  const layoutVersion = optionalLayoutVersion(version, "version", issues, version);

  if (issues.length > 0 || !root || !layoutVersion) {
    return invalid(issues);
  }

  return valid(layoutDescriptorFor(root, layoutVersion));
}

export function planWorkspaceFileLayoutMigration(
  value: unknown,
): ValidationResult<WorkspaceLayoutMigrationPlan> {
  const validated = validateWorkspaceLayoutMigrationInput(value);
  if (!validated.ok) {
    return validated;
  }

  const targetLayout = layoutDescriptorFor(
    validated.value.rootPath,
    validated.value.toVersion,
  );
  const steps = WORKSPACE_MIGRATION_STEPS.filter(
    (step) =>
      step.version > validated.value.fromVersion &&
      step.version <= validated.value.toVersion,
  )
    .sort((left, right) => left.order - right.order)
    .map((step) => ({
      ...step,
      absolutePath: joinWorkspacePath(
        validated.value.rootPath.normalized,
        step.relativePath,
      ),
    }));

  return valid({
    rootPath: cloneSafePath(validated.value.rootPath),
    fromVersion: validated.value.fromVersion,
    toVersion: validated.value.toVersion,
    targetLayout,
    steps,
  });
}

export function buildGatewayStartRequest(value: unknown): ValidationResult<GatewayStartRequest> {
  const validated = validateGatewayStartPayload(value);
  if (!validated.ok) {
    return validated;
  }

  const payload = validated.value;
  const args = [
    "--workspace-id",
    payload.workspaceId,
    "--workspace",
    payload.workspacePath.normalized,
    "--transport",
    payload.transport,
    "--log-level",
    payload.logLevel,
  ];

  if (payload.transport === "http") {
    args.push("--host", payload.host, "--port", String(payload.port));
  }

  return valid({
    commandId: "gateway.start",
    tauriCommand: "gateway_start",
    sidecar: "mcp-gateway",
    arguments: args,
    env: {
      SOVEREIGNOPS_WORKSPACE_ID: payload.workspaceId,
      SOVEREIGNOPS_WORKSPACE_PATH: payload.workspacePath.normalized,
      SOVEREIGNOPS_GATEWAY_TRANSPORT: payload.transport,
    },
    ...(payload.transport === "http" && payload.port > 0
      ? {
          healthCheck: {
            url: `http://${payload.host}:${payload.port}/health`,
            method: "GET",
          },
        }
      : {}),
  });
}

export function createUnlockedWorkspaceLockState(
  workspaceId: unknown,
): ValidationResult<WorkspaceLockState> {
  const issues: ValidationIssue[] = [];
  const normalizedWorkspaceId = requirePrefixedId(
    workspaceId,
    "workspaceId",
    WORKSPACE_ID_PATTERN,
    "wsp_",
    issues,
  ) as `wsp_${string}` | undefined;

  if (issues.length > 0 || !normalizedWorkspaceId) {
    return invalid(issues);
  }

  return valid({
    workspaceId: normalizedWorkspaceId,
    locked: false,
    revision: 0,
  });
}

export function lockWorkspaceState(
  state: WorkspaceLockState,
  payload: unknown,
): ValidationResult<WorkspaceLockTransition> {
  const validated = validateWorkspaceLockPayload(payload);
  if (!validated.ok) {
    return validated;
  }

  const stateValidation = validateLockState(state);
  if (!stateValidation.ok) {
    return stateValidation;
  }

  if (stateValidation.value.workspaceId !== validated.value.workspaceId) {
    return invalid([
      {
        path: "workspaceId",
        message: "lock payload workspaceId must match the current state",
      },
    ]);
  }

  const previousState = cloneLockState(stateValidation.value);
  if (stateValidation.value.locked) {
    return valid({
      status: "already_locked",
      previousState,
      state: cloneLockState(stateValidation.value),
    });
  }

  const nextState: WorkspaceLockState = {
    workspaceId: validated.value.workspaceId,
    locked: true,
    revision: stateValidation.value.revision + 1,
    deviceId: validated.value.deviceId,
    lockToken: validated.value.lockToken ?? deriveLockToken(validated.value),
    lockedAt: validated.value.requestedAt,
    ...(validated.value.reason ? { reason: validated.value.reason } : {}),
  };

  return valid({
    status: "locked",
    previousState,
    state: nextState,
  });
}

export function unlockWorkspaceState(
  state: WorkspaceLockState,
  payload: unknown,
): ValidationResult<WorkspaceLockTransition> {
  const validated = validateWorkspaceUnlockPayload(payload);
  if (!validated.ok) {
    return validated;
  }

  const stateValidation = validateLockState(state);
  if (!stateValidation.ok) {
    return stateValidation;
  }

  if (stateValidation.value.workspaceId !== validated.value.workspaceId) {
    return invalid([
      {
        path: "workspaceId",
        message: "unlock payload workspaceId must match the current state",
      },
    ]);
  }

  const previousState = cloneLockState(stateValidation.value);
  if (!stateValidation.value.locked) {
    return valid({
      status: "already_unlocked",
      previousState,
      state: cloneLockState(stateValidation.value),
    });
  }

  if (stateValidation.value.lockToken !== validated.value.lockToken) {
    return valid({
      status: "unlock_rejected",
      previousState,
      state: cloneLockState(stateValidation.value),
    });
  }

  return valid({
    status: "unlocked",
    previousState,
    state: {
      workspaceId: stateValidation.value.workspaceId,
      locked: false,
      revision: stateValidation.value.revision + 1,
      unlockedAt: validated.value.requestedAt,
    },
  });
}

function layoutDescriptorFor(
  rootPath: SafePathDescriptor,
  version: number,
): WorkspaceLayoutDescriptor {
  return {
    rootPath: cloneSafePath(rootPath),
    version,
    entries: WORKSPACE_LAYOUT_ENTRIES.filter(
      (entry) => entry.introducedIn <= version,
    ).map((entry) => ({
      ...entry,
      absolutePath: joinWorkspacePath(rootPath.normalized, entry.relativePath),
    })),
  };
}

function requireSafePath(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): SafePathDescriptor | undefined {
  if (isSafePathDescriptor(value)) {
    return cloneSafePath(value);
  }

  if (typeof value !== "string") {
    issues.push({ path, message: "path must be a string or safe path descriptor" });
    return undefined;
  }

  const raw = value;
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    issues.push({ path, message: "path must be non-empty" });
    return undefined;
  }

  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(trimmed)) {
    issues.push({ path, message: "path must be a local filesystem path, not a URI" });
    return undefined;
  }

  if (/[\u0000-\u001f]/.test(trimmed)) {
    issues.push({ path, message: "path must not contain control characters" });
    return undefined;
  }

  const slashPath = trimmed.replace(/\\/g, "/");
  let normalized = slashPath.startsWith("//")
    ? `//${slashPath.slice(2).replace(/\/+/g, "/")}`
    : slashPath.replace(/\/+/g, "/");

  let kind: SafePathKind | undefined;
  if (/^[A-Za-z]:\//.test(normalized)) {
    kind = "windows-drive";
    normalized = trimTrailingSlash(normalized, 3);
  } else if (normalized.startsWith("//")) {
    kind = "unc";
    normalized = trimTrailingSlash(normalized, 2);
  } else if (normalized.startsWith("/")) {
    kind = "posix";
    normalized = trimTrailingSlash(normalized, 1);
  }

  if (!kind) {
    issues.push({ path, message: "path must be absolute" });
    return undefined;
  }

  const segments = normalized.split("/").filter((segment) => segment.length > 0);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    issues.push({ path, message: "path must not contain . or .. segments" });
    return undefined;
  }

  if (kind === "windows-drive" && segments.length < 2) {
    issues.push({ path, message: "workspace path must include a directory name" });
    return undefined;
  }

  if (kind === "unc" && segments.length < 3) {
    issues.push({ path, message: "UNC workspace path must include a share and directory" });
    return undefined;
  }

  if (kind === "posix" && segments.length < 1) {
    issues.push({ path, message: "workspace path must include a directory name" });
    return undefined;
  }

  return {
    raw,
    normalized,
    kind,
    segments,
  };
}

function isSafePathDescriptor(value: unknown): value is SafePathDescriptor {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.raw === "string" &&
    typeof value.normalized === "string" &&
    (value.kind === "windows-drive" || value.kind === "unc" || value.kind === "posix") &&
    Array.isArray(value.segments) &&
    value.segments.every((segment) => typeof segment === "string")
  );
}

function validateLockState(value: unknown): ValidationResult<WorkspaceLockState> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return invalid([{ path: "$", message: "lock state must be an object" }]);
  }

  const workspaceId = requirePrefixedId(
    value.workspaceId,
    "workspaceId",
    WORKSPACE_ID_PATTERN,
    "wsp_",
    issues,
  ) as `wsp_${string}` | undefined;
  if (typeof value.locked !== "boolean") {
    issues.push({ path: "locked", message: "locked must be a boolean" });
  }
  if (!Number.isInteger(value.revision) || (value.revision as number) < 0) {
    issues.push({ path: "revision", message: "revision must be a non-negative integer" });
  }
  const deviceId = optionalPrefixedId(
    value.deviceId,
    "deviceId",
    DEVICE_ID_PATTERN,
    "dev_",
    issues,
  ) as `dev_${string}` | undefined;
  const lockToken = optionalPrefixedId(
    value.lockToken,
    "lockToken",
    LOCK_TOKEN_PATTERN,
    "lock_",
    issues,
  ) as `lock_${string}` | undefined;
  const lockedAt = optionalIsoTimestamp(value.lockedAt, "lockedAt", issues);
  const unlockedAt = optionalIsoTimestamp(value.unlockedAt, "unlockedAt", issues);
  const reason = optionalNonEmptyString(value.reason, "reason", issues);

  if (issues.length > 0 || !workspaceId) {
    return invalid(issues);
  }

  return valid({
    workspaceId,
    locked: value.locked as boolean,
    revision: value.revision as number,
    ...(deviceId ? { deviceId } : {}),
    ...(lockToken ? { lockToken } : {}),
    ...(lockedAt ? { lockedAt } : {}),
    ...(unlockedAt ? { unlockedAt } : {}),
    ...(reason ? { reason } : {}),
  });
}

function requirePrefixedId(
  value: unknown,
  path: string,
  pattern: RegExp,
  prefix: string,
  issues: ValidationIssue[],
): string | undefined {
  if (typeof value !== "string" || !pattern.test(value.trim())) {
    issues.push({ path, message: `${path} must use the ${prefix} id prefix` });
    return undefined;
  }

  return value.trim();
}

function optionalPrefixedId(
  value: unknown,
  path: string,
  pattern: RegExp,
  prefix: string,
  issues: ValidationIssue[],
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return requirePrefixedId(value, path, pattern, prefix, issues);
}

function requireIsoTimestamp(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): string | undefined {
  if (typeof value !== "string" || !isIsoTimestamp(value)) {
    issues.push({ path, message: `${path} must be an ISO timestamp` });
    return undefined;
  }

  return value;
}

function optionalIsoTimestamp(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return requireIsoTimestamp(value, path, issues);
}

function optionalNonEmptyString(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push({ path, message: `${path} must be a non-empty string` });
    return undefined;
  }

  return value.trim();
}

function optionalEnum<TValue extends string>(
  value: unknown,
  path: string,
  allowed: readonly TValue[],
  issues: ValidationIssue[],
  fallback: TValue,
): TValue | undefined {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "string" || !allowed.includes(value as TValue)) {
    issues.push({
      path,
      message: `${path} must be one of ${allowed.join(", ")}`,
    });
    return undefined;
  }

  return value as TValue;
}

function optionalPort(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  fallback: number,
): number | undefined {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 65535) {
    issues.push({ path, message: `${path} must be an integer from 0 to 65535` });
    return undefined;
  }

  return value as number;
}

function optionalLayoutVersion(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  fallback: number,
): number | undefined {
  const version = value === undefined ? fallback : value;
  if (
    !Number.isInteger(version) ||
    (version as number) < 1 ||
    (version as number) > WORKSPACE_LAYOUT_VERSION
  ) {
    issues.push({
      path,
      message: `${path} must be an integer from 1 to ${WORKSPACE_LAYOUT_VERSION}`,
    });
    return undefined;
  }

  return version as number;
}

function requireMigrationVersion(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  minimum: number,
): number | undefined {
  if (
    !Number.isInteger(value) ||
    (value as number) < minimum ||
    (value as number) > WORKSPACE_LAYOUT_VERSION
  ) {
    issues.push({
      path,
      message: `${path} must be an integer from ${minimum} to ${WORKSPACE_LAYOUT_VERSION}`,
    });
    return undefined;
  }

  return value as number;
}

function rejectUnknownFields(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  issues: ValidationIssue[],
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      issues.push({
        path: path === "$" ? key : `${path}.${key}`,
        message: "field is not supported",
      });
    }
  }
}

function isIsoTimestamp(value: string): boolean {
  if (!ISO_TIMESTAMP_PATTERN.test(value)) {
    return false;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function trimTrailingSlash(value: string, rootLength: number): string {
  let next = value;
  while (next.length > rootLength && next.endsWith("/")) {
    next = next.slice(0, -1);
  }
  return next;
}

function joinWorkspacePath(root: string, relativePath: string): string {
  return `${root}/${relativePath}`;
}

function deriveLockToken(payload: WorkspaceLockPayload): `lock_${string}` {
  const timestamp = payload.requestedAt.replace(/[^0-9]/g, "");
  return `lock_${payload.workspaceId.slice(4)}_${payload.deviceId.slice(4)}_${timestamp}`;
}

function cloneSafePath(path: SafePathDescriptor): SafePathDescriptor {
  return {
    raw: path.raw,
    normalized: path.normalized,
    kind: path.kind,
    segments: [...path.segments],
  };
}

function cloneLockState(state: WorkspaceLockState): WorkspaceLockState {
  return {
    workspaceId: state.workspaceId,
    locked: state.locked,
    revision: state.revision,
    ...(state.deviceId ? { deviceId: state.deviceId } : {}),
    ...(state.lockToken ? { lockToken: state.lockToken } : {}),
    ...(state.lockedAt ? { lockedAt: state.lockedAt } : {}),
    ...(state.unlockedAt ? { unlockedAt: state.unlockedAt } : {}),
    ...(state.reason ? { reason: state.reason } : {}),
  };
}

function valid<TValue>(value: TValue): ValidationResult<TValue> {
  return {
    ok: true,
    issues: [],
    value,
  };
}

function invalid<TValue = never>(
  issues: readonly ValidationIssue[],
): ValidationResult<TValue> {
  return {
    ok: false,
    issues: issues.map((issue) => ({ ...issue })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
