import {
  WORKSPACE_LAYOUT_VERSION,
  buildGatewayStartRequest,
  createWorkspaceLayoutDescriptor,
  planWorkspaceFileLayoutMigration,
  validateGatewayStartPayload,
  validateSafePathDescriptor,
  validateWorkspaceLockPayload,
  validateWorkspaceUnlockPayload,
  type GatewayStartPayload,
  type GatewayStartRequest,
  type SafePathDescriptor,
  type ValidationIssue,
  type ValidationResult,
  type WorkspaceLayoutDescriptor,
  type WorkspaceLayoutMigrationPlan,
  type WorkspaceLockPayload,
  type WorkspaceUnlockPayload,
} from "./commands.ts";

export type LocalWorkspaceRootKind = "windows-drive" | "posix";

export interface WorkspaceRootDescriptor {
  readonly rootPath: SafePathDescriptor & { readonly kind: LocalWorkspaceRootKind };
  readonly rootFingerprint: `root_${string}`;
  readonly layoutVersion: number;
  readonly localOnly: true;
  readonly layout: WorkspaceLayoutDescriptor;
}

export interface WorkspaceRootDescriptorOptions {
  readonly layoutVersion?: number;
}

export interface WorkspaceLockRequestProjection {
  readonly commandId: "workspace.lock";
  readonly tauriCommand: "workspace_lock";
  readonly payload: WorkspaceLockPayload;
}

export interface WorkspaceUnlockRequestProjection {
  readonly commandId: "workspace.unlock";
  readonly tauriCommand: "workspace_unlock";
  readonly payload: WorkspaceUnlockPayload;
}

export interface GatewayStartConstraintsInput {
  readonly workspaceId?: unknown;
  readonly workspaceRoot?: unknown;
  readonly transport?: unknown;
  readonly host?: unknown;
  readonly port?: unknown;
  readonly logLevel?: unknown;
  readonly requestedAt?: unknown;
}

export interface GatewayStartConstraints {
  readonly commandId: "gateway.start";
  readonly tauriCommand: "gateway_start";
  readonly localOnly: true;
  readonly allowedHosts: readonly ["127.0.0.1", "localhost"];
  readonly allowedTransports: readonly ["stdio", "http"];
  readonly payload: GatewayStartPayload;
  readonly startRequest: GatewayStartRequest;
}

export type WorkspaceMigrationReadinessStatus =
  | "ready"
  | "migration_required";

export interface WorkspaceMigrationReadinessInput {
  readonly workspaceRoot?: unknown;
  readonly currentLayoutVersion?: unknown;
  readonly targetLayoutVersion?: unknown;
  readonly requestedAt?: unknown;
}

export interface WorkspaceMigrationReadiness {
  readonly status: WorkspaceMigrationReadinessStatus;
  readonly ready: boolean;
  readonly localOnly: true;
  readonly currentLayoutVersion: number;
  readonly targetLayoutVersion: number;
  readonly pendingStepCount: number;
  readonly pendingOperations: readonly WorkspaceMigrationReadinessOperation[];
  readonly plan: WorkspaceLayoutMigrationPlan;
}

export interface WorkspaceMigrationReadinessOperation {
  readonly id: string;
  readonly order: number;
  readonly version: number;
  readonly operation: string;
}

export interface WorkspaceSessionIsolationAuditInput {
  readonly workspaceRoot?: WorkspaceRootDescriptor;
  readonly lockRequest?: WorkspaceLockRequestProjection;
  readonly unlockRequest?: WorkspaceUnlockRequestProjection;
  readonly gatewayConstraints?: GatewayStartConstraints;
  readonly migrationReadiness?: WorkspaceMigrationReadiness;
  readonly issues?: readonly ValidationIssue[];
}

export interface WorkspaceSessionIsolationAuditSummary {
  readonly event: "workspace.session_isolation.audit";
  readonly workspaceRef?: string;
  readonly rootRef?: string;
  readonly rootKind?: LocalWorkspaceRootKind;
  readonly lock?: {
    readonly commandId: "workspace.lock";
    readonly requestedAt: string;
    readonly deviceRef: string;
    readonly hasLockToken: boolean;
    readonly reasonPresent: boolean;
  };
  readonly unlock?: {
    readonly commandId: "workspace.unlock";
    readonly requestedAt: string;
    readonly deviceRef: string;
    readonly hasLockToken: true;
  };
  readonly gateway?: {
    readonly commandId: "gateway.start";
    readonly transport: GatewayStartPayload["transport"];
    readonly host: GatewayStartPayload["host"];
    readonly port: number;
    readonly localOnly: true;
    readonly sidecar: GatewayStartRequest["sidecar"];
    readonly envKeys: readonly string[];
  };
  readonly migration?: {
    readonly status: WorkspaceMigrationReadinessStatus;
    readonly currentLayoutVersion: number;
    readonly targetLayoutVersion: number;
    readonly pendingStepCount: number;
  };
  readonly issues?: readonly ValidationIssue[];
}

const GATEWAY_CONSTRAINT_FIELDS = new Set([
  "workspaceId",
  "workspaceRoot",
  "transport",
  "host",
  "port",
  "logLevel",
  "requestedAt",
]);

const MIGRATION_READINESS_FIELDS = new Set([
  "workspaceRoot",
  "currentLayoutVersion",
  "targetLayoutVersion",
  "requestedAt",
]);

const LOCAL_GATEWAY_HOSTS = Object.freeze(["127.0.0.1", "localhost"] as const);
const LOCAL_GATEWAY_TRANSPORTS = Object.freeze(["stdio", "http"] as const);

export function createWorkspaceRootDescriptor(
  rootPath: unknown,
  options: WorkspaceRootDescriptorOptions = {},
): ValidationResult<WorkspaceRootDescriptor> {
  return createWorkspaceRootDescriptorAt(rootPath, options, "rootPath");
}

export function projectWorkspaceLockRequest(
  value: unknown,
): ValidationResult<WorkspaceLockRequestProjection> {
  const validated = validateWorkspaceLockPayload(value);
  if (!validated.ok) {
    return invalid(validated.issues);
  }

  return validSnapshot({
    commandId: "workspace.lock",
    tauriCommand: "workspace_lock",
    payload: cloneWorkspaceLockPayload(validated.value),
  });
}

export function projectWorkspaceUnlockRequest(
  value: unknown,
): ValidationResult<WorkspaceUnlockRequestProjection> {
  const validated = validateWorkspaceUnlockPayload(value);
  if (!validated.ok) {
    return invalid(validated.issues);
  }

  return validSnapshot({
    commandId: "workspace.unlock",
    tauriCommand: "workspace_unlock",
    payload: cloneWorkspaceUnlockPayload(validated.value),
  });
}

export function planGatewayStartConstraints(
  value: unknown,
): ValidationResult<GatewayStartConstraints> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return invalid([{ path: "$", message: "gateway constraints input must be an object" }]);
  }

  rejectUnknownFields(value, GATEWAY_CONSTRAINT_FIELDS, "$", issues);
  if (value.workspaceRoot === undefined) {
    issues.push({ path: "workspaceRoot", message: "workspaceRoot is required" });
  }

  const root =
    value.workspaceRoot === undefined
      ? undefined
      : resolveWorkspaceRoot(value.workspaceRoot, "workspaceRoot", issues);

  if (issues.length > 0 || !root) {
    return invalid(issues);
  }

  const payloadValidation = validateGatewayStartPayload({
    workspaceId: value.workspaceId,
    workspacePath: root.rootPath,
    transport: value.transport,
    host: value.host,
    port: value.port,
    logLevel: value.logLevel,
    requestedAt: value.requestedAt,
  });
  if (!payloadValidation.ok) {
    return invalid(payloadValidation.issues);
  }

  const startRequest = buildGatewayStartRequest(payloadValidation.value);
  if (!startRequest.ok) {
    return invalid(startRequest.issues);
  }

  return validSnapshot({
    commandId: "gateway.start",
    tauriCommand: "gateway_start",
    localOnly: true,
    allowedHosts: [...LOCAL_GATEWAY_HOSTS],
    allowedTransports: [...LOCAL_GATEWAY_TRANSPORTS],
    payload: cloneGatewayStartPayload(payloadValidation.value),
    startRequest: cloneGatewayStartRequest(startRequest.value),
  });
}

export function assessWorkspaceMigrationReadiness(
  value: unknown,
): ValidationResult<WorkspaceMigrationReadiness> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return invalid([{ path: "$", message: "migration readiness input must be an object" }]);
  }

  rejectUnknownFields(value, MIGRATION_READINESS_FIELDS, "$", issues);
  if (value.workspaceRoot === undefined) {
    issues.push({ path: "workspaceRoot", message: "workspaceRoot is required" });
  }

  const root =
    value.workspaceRoot === undefined
      ? undefined
      : resolveWorkspaceRoot(value.workspaceRoot, "workspaceRoot", issues);

  if (issues.length > 0 || !root) {
    return invalid(issues);
  }

  const targetLayoutVersion =
    value.targetLayoutVersion === undefined
      ? root.layoutVersion
      : value.targetLayoutVersion;
  const plan = planWorkspaceFileLayoutMigration({
    rootPath: root.rootPath,
    fromVersion: value.currentLayoutVersion,
    toVersion: targetLayoutVersion,
    requestedAt: value.requestedAt,
  });
  if (!plan.ok) {
    return invalid(plan.issues);
  }

  const pendingOperations = plan.value.steps.map((step) => ({
    id: step.id,
    order: step.order,
    version: step.version,
    operation: step.operation,
  }));
  const ready = pendingOperations.length === 0;

  return validSnapshot({
    status: ready ? "ready" : "migration_required",
    ready,
    localOnly: true,
    currentLayoutVersion: plan.value.fromVersion,
    targetLayoutVersion: plan.value.toVersion,
    pendingStepCount: pendingOperations.length,
    pendingOperations,
    plan: cloneMigrationPlan(plan.value),
  });
}

export function summarizeWorkspaceSessionIsolationAudit(
  input: WorkspaceSessionIsolationAuditInput,
): WorkspaceSessionIsolationAuditSummary {
  const rootPath =
    input.workspaceRoot?.rootPath ??
    input.gatewayConstraints?.payload.workspacePath ??
    input.migrationReadiness?.plan.rootPath;
  const workspaceId =
    input.lockRequest?.payload.workspaceId ??
    input.unlockRequest?.payload.workspaceId ??
    input.gatewayConstraints?.payload.workspaceId;

  return freezeSnapshot({
    event: "workspace.session_isolation.audit",
    ...(workspaceId ? { workspaceRef: redactId(workspaceId, "wsp") } : {}),
    ...(rootPath
      ? {
          rootRef: rootReference(rootPath.normalized),
          rootKind: rootPath.kind as LocalWorkspaceRootKind,
        }
      : {}),
    ...(input.lockRequest
      ? {
          lock: {
            commandId: input.lockRequest.commandId,
            requestedAt: input.lockRequest.payload.requestedAt,
            deviceRef: redactId(input.lockRequest.payload.deviceId, "dev"),
            hasLockToken: input.lockRequest.payload.lockToken !== undefined,
            reasonPresent: input.lockRequest.payload.reason !== undefined,
          },
        }
      : {}),
    ...(input.unlockRequest
      ? {
          unlock: {
            commandId: input.unlockRequest.commandId,
            requestedAt: input.unlockRequest.payload.requestedAt,
            deviceRef: redactId(input.unlockRequest.payload.deviceId, "dev"),
            hasLockToken: true as const,
          },
        }
      : {}),
    ...(input.gatewayConstraints
      ? {
          gateway: {
            commandId: input.gatewayConstraints.commandId,
            transport: input.gatewayConstraints.payload.transport,
            host: input.gatewayConstraints.payload.host,
            port: input.gatewayConstraints.payload.port,
            localOnly: true as const,
            sidecar: input.gatewayConstraints.startRequest.sidecar,
            envKeys: Object.keys(input.gatewayConstraints.startRequest.env).sort(),
          },
        }
      : {}),
    ...(input.migrationReadiness
      ? {
          migration: {
            status: input.migrationReadiness.status,
            currentLayoutVersion: input.migrationReadiness.currentLayoutVersion,
            targetLayoutVersion: input.migrationReadiness.targetLayoutVersion,
            pendingStepCount: input.migrationReadiness.pendingStepCount,
          },
        }
      : {}),
    ...(input.issues ? { issues: input.issues.map((issue) => ({ ...issue })) } : {}),
  });
}

function createWorkspaceRootDescriptorAt(
  rootPath: unknown,
  options: WorkspaceRootDescriptorOptions,
  path: string,
): ValidationResult<WorkspaceRootDescriptor> {
  const pathValidation = validateSafePathDescriptor(rootPath, path);
  if (!pathValidation.ok) {
    return invalid(pathValidation.issues);
  }

  if (pathValidation.value.kind === "unc") {
    return invalid([
      {
        path,
        message: "workspace root must be a local absolute filesystem path",
      },
    ]);
  }

  const layoutValidation = createWorkspaceLayoutDescriptor(
    pathValidation.value,
    options.layoutVersion ?? WORKSPACE_LAYOUT_VERSION,
  );
  if (!layoutValidation.ok) {
    return invalid(layoutValidation.issues);
  }

  const rootPathDescriptor = cloneSafePathDescriptor(
    layoutValidation.value.rootPath,
  ) as SafePathDescriptor & { readonly kind: LocalWorkspaceRootKind };

  return validSnapshot({
    rootPath: rootPathDescriptor,
    rootFingerprint: rootReference(rootPathDescriptor.normalized),
    layoutVersion: layoutValidation.value.version,
    localOnly: true,
    layout: cloneLayoutDescriptor(layoutValidation.value),
  });
}

function resolveWorkspaceRoot(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): WorkspaceRootDescriptor | undefined {
  const result =
    isRecord(value) && "rootPath" in value
      ? createWorkspaceRootDescriptorAt(
          value.rootPath,
          {
            layoutVersion:
              "layoutVersion" in value
                ? (value.layoutVersion as number)
                : undefined,
          },
          path,
        )
      : createWorkspaceRootDescriptorAt(value, {}, path);

  if (!result.ok) {
    issues.push(...result.issues);
    return undefined;
  }

  return result.value;
}

function cloneSafePathDescriptor(path: SafePathDescriptor): SafePathDescriptor {
  return {
    raw: path.raw,
    normalized: path.normalized,
    kind: path.kind,
    segments: [...path.segments],
  };
}

function cloneLayoutDescriptor(
  layout: WorkspaceLayoutDescriptor,
): WorkspaceLayoutDescriptor {
  return {
    rootPath: cloneSafePathDescriptor(layout.rootPath),
    version: layout.version,
    entries: layout.entries.map((entry) => ({ ...entry })),
  };
}

function cloneWorkspaceLockPayload(
  payload: WorkspaceLockPayload,
): WorkspaceLockPayload {
  return {
    workspaceId: payload.workspaceId,
    deviceId: payload.deviceId,
    requestedAt: payload.requestedAt,
    ...(payload.lockToken ? { lockToken: payload.lockToken } : {}),
    ...(payload.reason ? { reason: payload.reason } : {}),
  };
}

function cloneWorkspaceUnlockPayload(
  payload: WorkspaceUnlockPayload,
): WorkspaceUnlockPayload {
  return {
    workspaceId: payload.workspaceId,
    deviceId: payload.deviceId,
    requestedAt: payload.requestedAt,
    lockToken: payload.lockToken,
  };
}

function cloneGatewayStartPayload(
  payload: GatewayStartPayload,
): GatewayStartPayload {
  return {
    workspaceId: payload.workspaceId,
    workspacePath: cloneSafePathDescriptor(payload.workspacePath),
    transport: payload.transport,
    host: payload.host,
    port: payload.port,
    logLevel: payload.logLevel,
    ...(payload.requestedAt ? { requestedAt: payload.requestedAt } : {}),
  };
}

function cloneGatewayStartRequest(
  request: GatewayStartRequest,
): GatewayStartRequest {
  return {
    commandId: request.commandId,
    tauriCommand: request.tauriCommand,
    sidecar: request.sidecar,
    arguments: [...request.arguments],
    env: { ...request.env },
    ...(request.healthCheck
      ? {
          healthCheck: {
            url: request.healthCheck.url,
            method: request.healthCheck.method,
          },
        }
      : {}),
  };
}

function cloneMigrationPlan(
  plan: WorkspaceLayoutMigrationPlan,
): WorkspaceLayoutMigrationPlan {
  return {
    rootPath: cloneSafePathDescriptor(plan.rootPath),
    fromVersion: plan.fromVersion,
    toVersion: plan.toVersion,
    targetLayout: cloneLayoutDescriptor(plan.targetLayout),
    steps: plan.steps.map((step) => ({ ...step })),
  };
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

function redactId(value: string, prefix: string): string {
  return `${prefix}_redacted_${stableHash(value)}`;
}

function rootReference(normalizedPath: string): `root_${string}` {
  return `root_${stableHash(normalizedPath)}`;
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(16).padStart(8, "0");
}

function validSnapshot<TValue>(value: TValue): ValidationResult<TValue> {
  return {
    ok: true,
    issues: [],
    value: freezeSnapshot(value),
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

function freezeSnapshot<TValue>(value: TValue): TValue {
  return deepFreeze(value);
}

function deepFreeze<TValue>(value: TValue, seen = new WeakSet<object>()): TValue {
  if (typeof value !== "object" || value === null) {
    return value;
  }

  if (seen.has(value)) {
    return value;
  }
  seen.add(value);

  for (const key of Object.keys(value as Record<string, unknown>)) {
    deepFreeze((value as Record<string, unknown>)[key], seen);
  }

  return Object.freeze(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
