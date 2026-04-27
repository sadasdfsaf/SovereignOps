export type WorkspaceSessionPhase = "loading" | "success" | "error";

export type WorkspaceSessionStatus =
  | "loading"
  | "empty"
  | "ready"
  | "attention"
  | "blocked"
  | "error";

export type WorkspaceSessionSeverity =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "critical";

export type WorkspaceSessionCardKind =
  | "summary"
  | "workspace_open"
  | "lock_state"
  | "approval_gateway"
  | "migration_readiness"
  | "backup_readiness"
  | "error";

export interface BuildWorkspaceSessionStateOptions {
  defaultTimestamp?: string;
  loading?: boolean;
  error?: unknown;
}

export interface WorkspaceSessionInput {
  generatedAt?: string;
  updatedAt?: string;
  workspace?: unknown;
  workspaceOpen?: unknown;
  session?: unknown;
  lock?: unknown;
  lockState?: unknown;
  approval?: unknown;
  approvals?: unknown;
  gateway?: unknown;
  approvalGateway?: unknown;
  migration?: unknown;
  migrationReadiness?: unknown;
  backup?: unknown;
  backupReadiness?: unknown;
  errors?: unknown;
}

export interface WorkspaceSessionState {
  id: "workspace_session_isolation";
  phase: WorkspaceSessionPhase;
  generatedAt: string;
  status: WorkspaceSessionStatus;
  statusLabel: string;
  severity: WorkspaceSessionSeverity;
  severityLabel: string;
  sourceCount: number;
  workspaceOpen: WorkspaceOpenState;
  lockState: WorkspaceLockState;
  approvalGateway: WorkspaceApprovalGatewayState;
  migrationReadiness: WorkspaceMigrationReadinessState;
  backupReadiness: WorkspaceBackupReadinessState;
  summaryCards: WorkspaceSessionCard[];
  cards: WorkspaceSessionCard[];
  errorCards: WorkspaceSessionCard[];
  emptyState: WorkspaceSessionEmptyState;
  ariaLabel: string;
}

export interface WorkspaceOpenState {
  id: "workspace_session.workspace_open";
  title: "Workspace open state";
  status: WorkspaceSessionStatus;
  statusLabel: string;
  severity: WorkspaceSessionSeverity;
  severityLabel: string;
  value: string;
  open: boolean;
  isolated: boolean;
  workspaceLabel: string;
  sessionLabel?: string;
  detailLabels: string[];
  metadata: WorkspaceSessionMetadata;
  ariaLabel: string;
}

export interface WorkspaceLockState {
  id: "workspace_session.lock_state";
  title: "Session lock state";
  status: WorkspaceSessionStatus;
  statusLabel: string;
  severity: WorkspaceSessionSeverity;
  severityLabel: string;
  value: string;
  locked: boolean;
  ownedByCurrentSession: boolean;
  stale: boolean;
  detailLabels: string[];
  metadata: WorkspaceSessionMetadata;
  ariaLabel: string;
}

export interface WorkspaceApprovalGatewayState {
  id: "workspace_session.approval_gateway";
  title: "Approvals and gateway";
  status: WorkspaceSessionStatus;
  statusLabel: string;
  severity: WorkspaceSessionSeverity;
  severityLabel: string;
  value: string;
  pendingApprovalCount: number;
  gatewayReady: boolean;
  gatewayBlocked: boolean;
  approvalRequired: boolean;
  detailLabels: string[];
  metadata: WorkspaceSessionMetadata;
  ariaLabel: string;
}

export interface WorkspaceMigrationReadinessState {
  id: "workspace_session.migration_readiness";
  title: "Migration readiness";
  status: WorkspaceSessionStatus;
  statusLabel: string;
  severity: WorkspaceSessionSeverity;
  severityLabel: string;
  value: string;
  ready: boolean;
  required: boolean;
  pendingItemCount: number;
  blockerCount: number;
  detailLabels: string[];
  metadata: WorkspaceSessionMetadata;
  ariaLabel: string;
}

export interface WorkspaceBackupReadinessState {
  id: "workspace_session.backup_readiness";
  title: "Backup readiness";
  status: WorkspaceSessionStatus;
  statusLabel: string;
  severity: WorkspaceSessionSeverity;
  severityLabel: string;
  value: string;
  ready: boolean;
  restorable: boolean;
  encrypted: boolean;
  stale: boolean;
  pendingWriteCount: number;
  lastBackupAt?: string;
  detailLabels: string[];
  metadata: WorkspaceSessionMetadata;
  ariaLabel: string;
}

export interface WorkspaceSessionCard {
  id: string;
  kind: WorkspaceSessionCardKind;
  title: string;
  value: string;
  status: WorkspaceSessionStatus;
  statusLabel: string;
  severity: WorkspaceSessionSeverity;
  severityLabel: string;
  badgeLabels: string[];
  detailLabels: string[];
  metadata: WorkspaceSessionMetadata;
  ariaLabel: string;
}

export interface WorkspaceSessionEmptyState {
  id: string;
  label: string;
  description: string;
  ariaLabel: string;
  actionLabel?: string;
}

export type WorkspaceSessionMetadata = Record<
  string,
  string | number | boolean | string[] | number[] | undefined
>;

type AnyRecord = Record<string, unknown>;

interface NormalizedWorkspaceSessionInput {
  generatedAt?: string;
  workspace?: AnyRecord;
  session?: AnyRecord;
  lock?: AnyRecord;
  approval?: AnyRecord;
  gateway?: AnyRecord;
  migration?: AnyRecord;
  backup?: AnyRecord;
  errors: unknown[];
}

const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";

const STATUS_LABELS: Record<WorkspaceSessionStatus, string> = {
  loading: "Loading",
  empty: "Not configured",
  ready: "Ready",
  attention: "Needs attention",
  blocked: "Blocked",
  error: "Error",
};

const SEVERITY_LABELS: Record<WorkspaceSessionSeverity, string> = {
  neutral: "Neutral",
  info: "Info",
  success: "Success",
  warning: "Warning",
  critical: "Critical",
};

export function buildWorkspaceSessionState(
  input: unknown = {},
  options: BuildWorkspaceSessionStateOptions = {},
): WorkspaceSessionState {
  if (options.loading === true) {
    return buildWorkspaceSessionLoadingState(options);
  }

  const normalized = normalizeWorkspaceSessionInput(input);
  const optionErrors = options.error === undefined ? [] : [options.error];
  const errorCards = buildWorkspaceSessionErrorCards([
    ...normalized.errors,
    ...optionErrors,
  ]);
  const generatedAt =
    normalized.generatedAt ?? options.defaultTimestamp ?? DEFAULT_TIMESTAMP;

  const workspaceOpen = buildWorkspaceOpenState({
    workspace: normalized.workspace,
    session: normalized.session,
  });
  const lockState = buildWorkspaceLockState({
    lock: normalized.lock,
    session: normalized.session,
  });
  const approvalGateway = buildWorkspaceApprovalGatewayState({
    approval: normalized.approval,
    gateway: normalized.gateway,
  });
  const migrationReadiness = buildWorkspaceMigrationReadiness(
    normalized.migration,
  );
  const backupReadiness = buildWorkspaceBackupReadiness(normalized.backup);
  const sourceCount = [
    normalized.workspace,
    normalized.session,
    normalized.lock,
    normalized.approval,
    normalized.gateway,
    normalized.migration,
    normalized.backup,
  ].filter(isRecord).length;
  const status = resolveWorkspaceSessionStatus({
    sourceCount,
    sections: [
      workspaceOpen,
      lockState,
      approvalGateway,
      migrationReadiness,
      backupReadiness,
    ],
    errorCards,
  });
  const severity = severityForStatus(status);
  const summaryCards = buildSummaryCards({
    workspaceOpen,
    lockState,
    approvalGateway,
    migrationReadiness,
    backupReadiness,
  });
  const cards = [
    cardFromSection(workspaceOpen, "workspace_open"),
    cardFromSection(lockState, "lock_state"),
    cardFromSection(approvalGateway, "approval_gateway"),
    cardFromSection(migrationReadiness, "migration_readiness"),
    cardFromSection(backupReadiness, "backup_readiness"),
    ...errorCards,
  ];

  return cloneWorkspaceSessionState({
    id: "workspace_session_isolation",
    phase: errorCards.length > 0 ? "error" : "success",
    generatedAt,
    status,
    statusLabel: statusLabel(status),
    severity,
    severityLabel: severityLabel(severity),
    sourceCount,
    workspaceOpen,
    lockState,
    approvalGateway,
    migrationReadiness,
    backupReadiness,
    summaryCards,
    cards,
    errorCards,
    emptyState: buildWorkspaceSessionEmptyState(),
    ariaLabel: [
      "Workspace session isolation",
      statusLabel(status),
      severityLabel(severity),
      formatCount(errorCards.length, "redacted error"),
    ].join(", "),
  });
}

export function buildWorkspaceSessionLoadingState(
  options: BuildWorkspaceSessionStateOptions = {},
): WorkspaceSessionState {
  const generatedAt = options.defaultTimestamp ?? DEFAULT_TIMESTAMP;
  const loadingSection = buildLoadingSection;
  const workspaceOpen = loadingSection(
    "workspace_session.workspace_open",
    "Workspace open state",
    "Workspace status loading",
  ) as WorkspaceOpenState;
  const lockState = loadingSection(
    "workspace_session.lock_state",
    "Session lock state",
    "Session lock loading",
  ) as WorkspaceLockState;
  const approvalGateway = loadingSection(
    "workspace_session.approval_gateway",
    "Approvals and gateway",
    "Approval gateway loading",
  ) as WorkspaceApprovalGatewayState;
  const migrationReadiness = loadingSection(
    "workspace_session.migration_readiness",
    "Migration readiness",
    "Migration readiness loading",
  ) as WorkspaceMigrationReadinessState;
  const backupReadiness = loadingSection(
    "workspace_session.backup_readiness",
    "Backup readiness",
    "Backup readiness loading",
  ) as WorkspaceBackupReadinessState;
  const summaryCards = buildSummaryCards({
    workspaceOpen,
    lockState,
    approvalGateway,
    migrationReadiness,
    backupReadiness,
  });

  return cloneWorkspaceSessionState({
    id: "workspace_session_isolation",
    phase: "loading",
    generatedAt,
    status: "loading",
    statusLabel: statusLabel("loading"),
    severity: "info",
    severityLabel: severityLabel("info"),
    sourceCount: 0,
    workspaceOpen,
    lockState,
    approvalGateway,
    migrationReadiness,
    backupReadiness,
    summaryCards,
    cards: [
      cardFromSection(workspaceOpen, "workspace_open"),
      cardFromSection(lockState, "lock_state"),
      cardFromSection(approvalGateway, "approval_gateway"),
      cardFromSection(migrationReadiness, "migration_readiness"),
      cardFromSection(backupReadiness, "backup_readiness"),
    ],
    errorCards: [],
    emptyState: buildWorkspaceSessionEmptyState(),
    ariaLabel: "Workspace session isolation, Loading, Info",
  });
}

export function buildWorkspaceOpenState(input: unknown): WorkspaceOpenState {
  const record = isRecord(input) ? input : {};
  const workspace = recordField(record, "workspace", "workspaceOpen") ?? record;
  const session = recordField(record, "session") ?? {};
  const hasData = hasDefinedInput(input);
  const open = deriveOpenFlag(workspace);
  const isolated = deriveIsolatedFlag(workspace, session);
  const workspaceLabel = safeWorkspaceLabel(workspace);
  const sessionLabel = safeSessionLabel(session);
  let status: WorkspaceSessionStatus = "empty";
  let value = "No workspace";

  if (hasData) {
    if (open === false) {
      status = "blocked";
      value = "Closed";
    } else if (open === true && isolated === true) {
      status = "ready";
      value = "Open";
    } else if (open === true) {
      status = isolated === false ? "blocked" : "attention";
      value = isolated === false ? "Isolation missing" : "Open";
    } else {
      status = "attention";
      value = "Open state unknown";
    }
  }

  const severity = severityForStatus(status);
  const detailLabels = [
    open === true ? "Workspace open" : open === false ? "Workspace closed" : "Open state unknown",
    isolated === true
      ? "Session isolated"
      : isolated === false
        ? "Session isolation missing"
        : "Session isolation unknown",
    sessionLabel === undefined ? undefined : `Session ${sessionLabel}`,
  ].filter(isDefined);

  return {
    id: "workspace_session.workspace_open",
    title: "Workspace open state",
    status,
    statusLabel: statusLabel(status),
    severity,
    severityLabel: severityLabel(severity),
    value,
    open: open === true,
    isolated: isolated === true,
    workspaceLabel,
    sessionLabel,
    detailLabels,
    metadata: {
      open: open === true,
      isolated: isolated === true,
      workspaceId: safeIdentifierField(workspace, "id", "workspaceId", "workspace_id"),
      sessionId: safeIdentifierField(session, "id", "sessionId", "session_id"),
    },
    ariaLabel: [
      "Workspace open state",
      value,
      statusLabel(status),
      ...detailLabels,
    ].join(", "),
  };
}

export function buildWorkspaceLockState(input: unknown): WorkspaceLockState {
  const record = isRecord(input) ? input : {};
  const lock = recordField(record, "lock", "lockState") ?? record;
  const session = recordField(record, "session") ?? {};
  const hasData = hasDefinedInput(input);
  const locked = deriveLockedFlag(lock);
  const stale = deriveStaleFlag(lock);
  const currentSessionId =
    stringField(lock, "currentSessionId", "current_session_id") ??
    stringField(session, "id", "sessionId", "session_id");
  const ownerSessionId = stringField(
    lock,
    "ownerSessionId",
    "owner_session_id",
    "sessionId",
    "session_id",
    "ownerId",
    "owner_id",
  );
  const ownedByCurrentSession =
    locked === true &&
    ownerSessionId !== undefined &&
    currentSessionId !== undefined &&
    ownerSessionId === currentSessionId;
  const hasOwnerConflict =
    locked === true &&
    ownerSessionId !== undefined &&
    currentSessionId !== undefined &&
    ownerSessionId !== currentSessionId;
  let status: WorkspaceSessionStatus = "empty";
  let value = "No lock";

  if (hasData) {
    if (stale) {
      status = "attention";
      value = "Stale lock";
    } else if (hasOwnerConflict) {
      status = "blocked";
      value = "Locked by another session";
    } else if (locked === true) {
      status = "ready";
      value = ownedByCurrentSession ? "Locked to session" : "Locked";
    } else if (locked === false) {
      status = "attention";
      value = "Unlocked";
    } else {
      status = "attention";
      value = "Lock state unknown";
    }
  }

  const severity = severityForStatus(status);
  const detailLabels = [
    locked === true ? "Lock active" : locked === false ? "Lock inactive" : "Lock state unknown",
    stale ? "Lock is stale" : undefined,
    ownedByCurrentSession ? "Owned by current session" : undefined,
    hasOwnerConflict ? "Owner differs from current session" : undefined,
  ].filter(isDefined);

  return {
    id: "workspace_session.lock_state",
    title: "Session lock state",
    status,
    statusLabel: statusLabel(status),
    severity,
    severityLabel: severityLabel(severity),
    value,
    locked: locked === true,
    ownedByCurrentSession,
    stale,
    detailLabels,
    metadata: {
      locked: locked === true,
      stale,
      ownedByCurrentSession,
      lockMode: safeTextField(lock, "mode", "lockMode", "lock_mode"),
    },
    ariaLabel: ["Session lock state", value, statusLabel(status), ...detailLabels].join(
      ", ",
    ),
  };
}

export function buildWorkspaceApprovalGatewayState(
  input: unknown,
): WorkspaceApprovalGatewayState {
  const record = isRecord(input) ? input : {};
  const approval =
    recordField(record, "approval", "approvals", "pendingApproval") ?? record;
  const gateway =
    recordField(record, "gateway", "approvalGateway", "gatewayState") ?? record;
  const hasData = hasDefinedInput(input);
  const pendingApprovalCount = Math.max(
    derivePendingApprovalCount(approval, record),
    derivePendingApprovalCount(gateway, {}),
  );
  const gatewayStatus = stringField(gateway, "status", "state", "decision");
  const gatewayReady = deriveGatewayReadyFlag(gateway, gatewayStatus);
  const gatewayBlocked = deriveGatewayBlockedFlag(gateway, gatewayStatus);
  const approvalRequired =
    booleanField(approval, "required", "approvalRequired", "approval_required") ??
    booleanField(gateway, "approvalRequired", "approval_required") ??
    false;
  let status: WorkspaceSessionStatus = "empty";
  let value = "No gateway";

  if (hasData) {
    if (gatewayBlocked) {
      status = "blocked";
      value = "Gateway blocked";
    } else if (pendingApprovalCount > 0) {
      status = "attention";
      value = formatCount(pendingApprovalCount, "pending approval");
    } else if (approvalRequired) {
      status = "attention";
      value = "Approval required";
    } else if (gatewayReady) {
      status = "ready";
      value = "Clear";
    } else {
      status = "attention";
      value = "Gateway pending";
    }
  }

  const severity = severityForStatus(status);
  const detailLabels = [
    gatewayReady ? "Gateway ready" : undefined,
    gatewayBlocked ? "Gateway blocked" : undefined,
    pendingApprovalCount > 0
      ? formatCount(pendingApprovalCount, "pending approval")
      : "No pending approvals",
    approvalRequired ? "Approval required" : undefined,
  ].filter(isDefined);

  return {
    id: "workspace_session.approval_gateway",
    title: "Approvals and gateway",
    status,
    statusLabel: statusLabel(status),
    severity,
    severityLabel: severityLabel(severity),
    value,
    pendingApprovalCount,
    gatewayReady,
    gatewayBlocked,
    approvalRequired,
    detailLabels,
    metadata: {
      pendingApprovalCount,
      gatewayReady,
      gatewayBlocked,
      approvalRequired,
      gatewayStatus: safeLabel(gatewayStatus),
    },
    ariaLabel: [
      "Approvals and gateway",
      value,
      statusLabel(status),
      ...detailLabels,
    ].join(", "),
  };
}

export function buildWorkspacePendingApprovalGatewayState(
  input: unknown,
): WorkspaceApprovalGatewayState {
  return buildWorkspaceApprovalGatewayState(input);
}

export function buildWorkspaceGatewayState(
  input: unknown,
): WorkspaceApprovalGatewayState {
  return buildWorkspaceApprovalGatewayState(input);
}

export function buildPendingApprovalGatewayState(
  input: unknown,
): WorkspaceApprovalGatewayState {
  return buildWorkspaceApprovalGatewayState(input);
}

export function buildWorkspaceMigrationReadiness(
  input: unknown,
): WorkspaceMigrationReadinessState {
  const migration = isRecord(input) ? input : {};
  const hasData = hasDefinedInput(input);
  const pendingItemCount = deriveCount(
    migration,
    ["pendingItemCount", "pending_items", "remainingItemCount", "remaining_items"],
    ["pendingItems", "pending_items", "items"],
    (item) => stringField(item, "status", "state") !== "ready",
  );
  const blockerCount = deriveCount(
    migration,
    ["blockerCount", "blockers_count"],
    ["blockers", "errors", "failures"],
  );
  const required =
    booleanField(migration, "required", "migrationRequired", "migration_required") ??
    pendingItemCount > 0;
  const explicitReady = booleanField(migration, "ready", "isReady");
  const failed = hasFailureState(migration);
  const ready =
    explicitReady ??
    (hasData && !failed && blockerCount === 0 && pendingItemCount === 0);
  let status: WorkspaceSessionStatus = "empty";
  let value = "No migration";

  if (hasData) {
    if (failed || blockerCount > 0) {
      status = "blocked";
      value = "Migration blocked";
    } else if (ready) {
      status = "ready";
      value = required ? "Ready" : "Not required";
    } else if (pendingItemCount > 0 || required) {
      status = "attention";
      value = formatCount(pendingItemCount, "pending item");
    } else {
      status = "attention";
      value = "Migration readiness unknown";
    }
  }

  const severity = severityForStatus(status);
  const detailLabels = [
    required ? "Migration required" : "Migration not required",
    formatCount(pendingItemCount, "pending item"),
    formatCount(blockerCount, "blocker"),
  ];

  return {
    id: "workspace_session.migration_readiness",
    title: "Migration readiness",
    status,
    statusLabel: statusLabel(status),
    severity,
    severityLabel: severityLabel(severity),
    value,
    ready,
    required,
    pendingItemCount,
    blockerCount,
    detailLabels,
    metadata: {
      ready,
      required,
      pendingItemCount,
      blockerCount,
      schemaVersion: safeTextField(
        migration,
        "schemaVersion",
        "schema_version",
        "targetVersion",
        "target_version",
      ),
    },
    ariaLabel: ["Migration readiness", value, statusLabel(status), ...detailLabels].join(
      ", ",
    ),
  };
}

export function buildWorkspaceMigrationReadinessState(
  input: unknown,
): WorkspaceMigrationReadinessState {
  return buildWorkspaceMigrationReadiness(input);
}

export function buildWorkspaceBackupReadiness(
  input: unknown,
): WorkspaceBackupReadinessState {
  const backup = isRecord(input) ? input : {};
  const hasData = hasDefinedInput(input);
  const pendingWriteCount = deriveCount(
    backup,
    ["pendingWriteCount", "pending_write_count", "pendingWrites", "pending_writes"],
    ["pendingWriteItems", "pending_write_items", "writes"],
    (item) => stringField(item, "status", "state") !== "flushed",
  );
  const lastBackupAt = timestampField(
    backup,
    "lastBackupAt",
    "last_backup_at",
    "completedAt",
    "completed_at",
  );
  const explicitReady = booleanField(backup, "ready", "isReady");
  const restorable =
    booleanField(backup, "restorable", "canRestore", "can_restore") ?? false;
  const encrypted =
    booleanField(backup, "encrypted", "isEncrypted", "is_encrypted") ?? false;
  const stale = booleanField(backup, "stale", "isStale", "is_stale") ?? false;
  const failed = hasFailureState(backup);
  const ready =
    explicitReady ??
    (hasData && !failed && restorable && pendingWriteCount === 0 && !stale);
  let status: WorkspaceSessionStatus = "empty";
  let value = "No backup";

  if (hasData) {
    if (failed || restorable === false) {
      status = "blocked";
      value = failed ? "Backup failed" : "Not restorable";
    } else if (ready) {
      status = "ready";
      value = "Restorable";
    } else if (stale) {
      status = "attention";
      value = "Backup stale";
    } else if (pendingWriteCount > 0) {
      status = "attention";
      value = formatCount(pendingWriteCount, "pending write");
    } else {
      status = "attention";
      value = "Backup readiness unknown";
    }
  }

  const severity = severityForStatus(status);
  const detailLabels = [
    restorable ? "Backup restorable" : "Backup not restorable",
    encrypted ? "Encrypted backup" : "Encryption not confirmed",
    stale ? "Backup stale" : undefined,
    formatCount(pendingWriteCount, "pending write"),
    lastBackupAt === undefined ? undefined : `Last backup ${lastBackupAt}`,
  ].filter(isDefined);

  return {
    id: "workspace_session.backup_readiness",
    title: "Backup readiness",
    status,
    statusLabel: statusLabel(status),
    severity,
    severityLabel: severityLabel(severity),
    value,
    ready,
    restorable,
    encrypted,
    stale,
    pendingWriteCount,
    lastBackupAt,
    detailLabels,
    metadata: {
      ready,
      restorable,
      encrypted,
      stale,
      pendingWriteCount,
      lastBackupAt,
    },
    ariaLabel: ["Backup readiness", value, statusLabel(status), ...detailLabels].join(
      ", ",
    ),
  };
}

export function buildWorkspaceBackupReadinessState(
  input: unknown,
): WorkspaceBackupReadinessState {
  return buildWorkspaceBackupReadiness(input);
}

export function buildWorkspaceSessionSummaryCards(
  input: unknown = {},
  options: BuildWorkspaceSessionStateOptions = {},
): WorkspaceSessionCard[] {
  return buildWorkspaceSessionState(input, options).summaryCards.map(cloneCard);
}

export function buildWorkspaceSessionErrorCards(
  input: unknown,
): WorkspaceSessionCard[] {
  const errors = collectErrors(input);
  const seen = new Map<string, number>();

  return errors.map((error, index) => {
    const record = isRecord(error) ? error : {};
    const code = safeIdentifierField(record, "code", "errorCode", "error_code");
    const rawMessage = errorMessage(error);
    const redacted = redactSensitiveTextWithStats(
      rawMessage ?? "Workspace session state could not load.",
    );
    const explicitSeverity = normalizeSeverity(
      stringField(record, "severity", "level"),
    );
    const status =
      normalizeStatus(stringField(record, "status", "state")) ?? "error";
    const severity = explicitSeverity ?? severityForStatus(status);
    const baseId = sanitizeIdentifier(code ?? `error_${index + 1}`, "error");
    const duplicateIndex = (seen.get(baseId) ?? 0) + 1;
    seen.set(baseId, duplicateIndex);
    const id =
      duplicateIndex === 1
        ? `workspace_session.error.${baseId}`
        : `workspace_session.error.${baseId}.${duplicateIndex}`;
    const title =
      code === undefined
        ? "Workspace session error"
        : `Workspace session error: ${labelFromKey(code)}`;

    return buildCard({
      id,
      kind: "error",
      title,
      value: redacted.text,
      status,
      severity,
      badgeLabels: [severityLabel(severity)],
      detailLabels: [
        redacted.redactionCount > 0
          ? formatCount(redacted.redactionCount, "redaction")
          : "No sensitive fields detected",
      ],
      metadata: {
        code,
        redacted: redacted.redactionCount > 0,
        redactionCount: redacted.redactionCount,
      },
    });
  });
}

export function buildRedactedWorkspaceSessionErrorCards(
  input: unknown,
): WorkspaceSessionCard[] {
  return buildWorkspaceSessionErrorCards(input);
}

export function redactWorkspaceSessionText(value: unknown): string {
  return redactSensitiveTextWithStats(value).text;
}

function normalizeWorkspaceSessionInput(
  input: unknown,
): NormalizedWorkspaceSessionInput {
  const record = isRecord(input) ? input : {};
  const workspace =
    recordField(record, "workspace", "workspaceOpen") ??
    pickRecord(record, ["open", "isOpen", "workspaceId", "workspace_id"]);
  const session = recordField(record, "session", "sessionState");
  const lock = recordField(record, "lock", "lockState");
  const approval = recordField(record, "approval", "approvals");
  const gateway = recordField(record, "gateway", "approvalGateway");
  const migration = recordField(record, "migration", "migrationReadiness");
  const backup = recordField(record, "backup", "backupReadiness");
  const errors = collectErrors(record.errors);

  return {
    generatedAt: timestampField(record, "generatedAt", "generated_at", "updatedAt", "updated_at"),
    workspace,
    session,
    lock,
    approval,
    gateway,
    migration,
    backup,
    errors,
  };
}

function buildSummaryCards(input: {
  workspaceOpen: WorkspaceOpenState;
  lockState: WorkspaceLockState;
  approvalGateway: WorkspaceApprovalGatewayState;
  migrationReadiness: WorkspaceMigrationReadinessState;
  backupReadiness: WorkspaceBackupReadinessState;
}): WorkspaceSessionCard[] {
  return [
    summaryCard("workspace_open", input.workspaceOpen),
    summaryCard("lock_state", input.lockState),
    summaryCard("approval_gateway", input.approvalGateway),
    summaryCard("migration_readiness", input.migrationReadiness),
    summaryCard("backup_readiness", input.backupReadiness),
  ];
}

function summaryCard(
  key: string,
  section:
    | WorkspaceOpenState
    | WorkspaceLockState
    | WorkspaceApprovalGatewayState
    | WorkspaceMigrationReadinessState
    | WorkspaceBackupReadinessState,
): WorkspaceSessionCard {
  return buildCard({
    id: `workspace_session.summary.${key}`,
    kind: "summary",
    title: section.title,
    value: section.value,
    status: section.status,
    severity: section.severity,
    detailLabels: section.detailLabels,
    metadata: section.metadata,
  });
}

function cardFromSection(
  section:
    | WorkspaceOpenState
    | WorkspaceLockState
    | WorkspaceApprovalGatewayState
    | WorkspaceMigrationReadinessState
    | WorkspaceBackupReadinessState,
  kind: Exclude<WorkspaceSessionCardKind, "summary" | "error">,
): WorkspaceSessionCard {
  return buildCard({
    id: section.id,
    kind,
    title: section.title,
    value: section.value,
    status: section.status,
    severity: section.severity,
    detailLabels: section.detailLabels,
    metadata: section.metadata,
  });
}

function buildLoadingSection(
  id: string,
  title: string,
  value: string,
): Partial<
  | WorkspaceOpenState
  | WorkspaceLockState
  | WorkspaceApprovalGatewayState
  | WorkspaceMigrationReadinessState
  | WorkspaceBackupReadinessState
> {
  return {
    id,
    title,
    status: "loading",
    statusLabel: statusLabel("loading"),
    severity: "info",
    severityLabel: severityLabel("info"),
    value,
    open: false,
    isolated: false,
    locked: false,
    ownedByCurrentSession: false,
    stale: false,
    pendingApprovalCount: 0,
    gatewayReady: false,
    gatewayBlocked: false,
    approvalRequired: false,
    ready: false,
    required: false,
    pendingItemCount: 0,
    blockerCount: 0,
    restorable: false,
    encrypted: false,
    pendingWriteCount: 0,
    workspaceLabel: "Workspace",
    detailLabels: ["Loading"],
    metadata: {},
    ariaLabel: `${title}, Loading`,
  };
}

function resolveWorkspaceSessionStatus(input: {
  sourceCount: number;
  sections: readonly {
    status: WorkspaceSessionStatus;
  }[];
  errorCards: readonly WorkspaceSessionCard[];
}): WorkspaceSessionStatus {
  if (input.errorCards.length > 0) {
    return "error";
  }
  if (input.sourceCount === 0) {
    return "empty";
  }
  if (input.sections.some((section) => section.status === "blocked")) {
    return "blocked";
  }
  if (input.sections.some((section) => section.status === "attention")) {
    return "attention";
  }
  if (input.sections.some((section) => section.status === "loading")) {
    return "loading";
  }
  if (input.sections.every((section) => section.status === "empty")) {
    return "empty";
  }
  return "ready";
}

function deriveOpenFlag(workspace: AnyRecord): boolean | undefined {
  const explicit = booleanField(workspace, "open", "isOpen", "opened", "mounted");
  if (explicit !== undefined) {
    return explicit;
  }

  const status = stringField(workspace, "status", "state");
  if (status === undefined) {
    return undefined;
  }
  return ["open", "opened", "active", "mounted", "ready"].includes(
    status.toLowerCase(),
  )
    ? true
    : ["closed", "missing", "detached", "unmounted"].includes(status.toLowerCase())
      ? false
      : undefined;
}

function deriveIsolatedFlag(
  workspace: AnyRecord,
  session: AnyRecord,
): boolean | undefined {
  const explicit =
    booleanField(session, "isolated", "isIsolated", "workspaceIsolated") ??
    booleanField(workspace, "isolated", "isIsolated", "sessionIsolated");
  if (explicit !== undefined) {
    return explicit;
  }

  const storageMode = stringField(session, "storageMode", "storage_mode");
  const boundary = stringField(session, "boundary", "scope");
  if (storageMode !== undefined) {
    return ["workspace", "workspace_session", "isolated"].includes(
      storageMode.toLowerCase(),
    );
  }
  if (boundary !== undefined) {
    return ["workspace", "workspace_session", "isolated"].includes(
      boundary.toLowerCase(),
    );
  }
  return undefined;
}

function deriveLockedFlag(lock: AnyRecord): boolean | undefined {
  const explicit = booleanField(lock, "locked", "isLocked", "acquired");
  if (explicit !== undefined) {
    return explicit;
  }

  const status = stringField(lock, "status", "state");
  if (status === undefined) {
    return undefined;
  }
  return ["locked", "active", "acquired", "held"].includes(status.toLowerCase())
    ? true
    : ["unlocked", "released", "none", "missing"].includes(status.toLowerCase())
      ? false
      : undefined;
}

function deriveStaleFlag(lock: AnyRecord): boolean {
  const explicit = booleanField(lock, "stale", "isStale", "expired");
  if (explicit !== undefined) {
    return explicit;
  }

  const status = stringField(lock, "status", "state");
  return status === undefined
    ? false
    : ["stale", "expired", "orphaned"].includes(status.toLowerCase());
}

function derivePendingApprovalCount(
  approval: AnyRecord,
  root: AnyRecord,
): number {
  const direct =
    nonNegativeIntegerField(
      approval,
      "pendingApprovalCount",
      "pending_approval_count",
      "pendingCount",
      "pending_count",
    ) ??
    nonNegativeIntegerField(
      root,
      "pendingApprovalCount",
      "pending_approval_count",
      "pendingCount",
      "pending_count",
    );
  if (direct !== undefined) {
    return direct;
  }

  const entries = [
    ...arrayField(approval, "sessions", "requests", "queue", "items"),
    ...arrayField(root, "sessions", "requests", "queue", "items"),
  ];
  return entries.filter((entry) => {
    const status = stringField(entry, "status", "state", "decision");
    return status === undefined || status.toLowerCase() === "pending";
  }).length;
}

function deriveGatewayReadyFlag(
  gateway: AnyRecord,
  gatewayStatus: string | undefined,
): boolean {
  const explicit = booleanField(
    gateway,
    "ready",
    "isReady",
    "available",
    "connected",
  );
  if (explicit !== undefined) {
    return explicit;
  }
  return gatewayStatus === undefined
    ? false
    : ["ready", "clear", "approved", "open", "connected"].includes(
        gatewayStatus.toLowerCase(),
      );
}

function deriveGatewayBlockedFlag(
  gateway: AnyRecord,
  gatewayStatus: string | undefined,
): boolean {
  const explicit = booleanField(gateway, "blocked", "denied", "rejected");
  if (explicit !== undefined) {
    return explicit;
  }
  return gatewayStatus === undefined
    ? false
    : ["blocked", "denied", "rejected", "closed", "failed"].includes(
        gatewayStatus.toLowerCase(),
      );
}

function deriveCount(
  record: AnyRecord,
  countKeys: readonly string[],
  arrayKeys: readonly string[],
  predicate: (item: unknown) => boolean = () => true,
): number {
  for (const key of countKeys) {
    const value = nonNegativeIntegerField(record, key);
    if (value !== undefined) {
      return value;
    }
  }

  return arrayKeys
    .flatMap((key) => arrayField(record, key))
    .filter((item) => predicate(item)).length;
}

function hasFailureState(record: AnyRecord): boolean {
  const failed = booleanField(record, "failed", "hasFailed", "has_failed");
  if (failed !== undefined) {
    return failed;
  }

  const status = stringField(record, "status", "state");
  return status === undefined
    ? false
    : ["failed", "blocked", "error"].includes(status.toLowerCase());
}

function safeWorkspaceLabel(workspace: AnyRecord): string {
  const label = safeTextField(
    workspace,
    "displayName",
    "display_name",
    "name",
    "title",
    "id",
    "workspaceId",
    "workspace_id",
  );
  return label ?? "Selected workspace";
}

function safeSessionLabel(session: AnyRecord): string | undefined {
  return safeTextField(session, "label", "name", "id", "sessionId", "session_id");
}

function safeTextField(
  record: AnyRecord,
  ...keys: readonly string[]
): string | undefined {
  const value = stringField(record, ...keys);
  return safeLabel(value);
}

function safeIdentifierField(
  record: AnyRecord,
  ...keys: readonly string[]
): string | undefined {
  const value = stringField(record, ...keys);
  if (value === undefined) {
    return undefined;
  }
  return sanitizeIdentifier(redactWorkspaceSessionText(value), "id");
}

function safeLabel(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const redacted = redactWorkspaceSessionText(value).replace(/\s+/g, " ").trim();
  return redacted === "" ? undefined : truncate(redacted, 96);
}

function buildCard(input: {
  id: string;
  kind: WorkspaceSessionCardKind;
  title: string;
  value: string;
  status: WorkspaceSessionStatus;
  severity?: WorkspaceSessionSeverity;
  badgeLabels?: readonly string[];
  detailLabels?: readonly string[];
  metadata?: WorkspaceSessionMetadata;
}): WorkspaceSessionCard {
  const severity = input.severity ?? severityForStatus(input.status);
  return cloneCard({
    id: input.id,
    kind: input.kind,
    title: input.title,
    value: input.value,
    status: input.status,
    statusLabel: statusLabel(input.status),
    severity,
    severityLabel: severityLabel(severity),
    badgeLabels: [...(input.badgeLabels ?? [])],
    detailLabels: [...(input.detailLabels ?? [])],
    metadata: cloneMetadata(input.metadata ?? {}),
    ariaLabel: [
      input.title,
      input.value,
      statusLabel(input.status),
      severityLabel(severity),
      ...(input.detailLabels ?? []),
    ].join(", "),
  });
}

function buildWorkspaceSessionEmptyState(): WorkspaceSessionEmptyState {
  return {
    id: "workspace_session_empty",
    label: "No workspace session state",
    description:
      "Workspace and session isolation details will appear after a workspace session is selected.",
    ariaLabel: "No workspace session state is available",
    actionLabel: "Select workspace session",
  };
}

function statusLabel(status: WorkspaceSessionStatus): string {
  return STATUS_LABELS[status];
}

function severityLabel(severity: WorkspaceSessionSeverity): string {
  return SEVERITY_LABELS[severity];
}

function severityForStatus(status: WorkspaceSessionStatus): WorkspaceSessionSeverity {
  switch (status) {
    case "ready":
      return "success";
    case "attention":
      return "warning";
    case "blocked":
    case "error":
      return "critical";
    case "loading":
      return "info";
    case "empty":
      return "neutral";
  }
}

function normalizeStatus(value: string | undefined): WorkspaceSessionStatus | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.toLowerCase();
  if (
    normalized === "loading" ||
    normalized === "empty" ||
    normalized === "ready" ||
    normalized === "attention" ||
    normalized === "blocked" ||
    normalized === "error"
  ) {
    return normalized;
  }
  if (normalized === "failed" || normalized === "failure") {
    return "error";
  }
  if (normalized === "pending" || normalized === "warning") {
    return "attention";
  }
  return undefined;
}

function normalizeSeverity(
  value: string | undefined,
): WorkspaceSessionSeverity | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.toLowerCase();
  if (
    normalized === "neutral" ||
    normalized === "info" ||
    normalized === "success" ||
    normalized === "warning" ||
    normalized === "critical"
  ) {
    return normalized;
  }
  if (normalized === "error" || normalized === "fatal") {
    return "critical";
  }
  return undefined;
}

function collectErrors(input: unknown): unknown[] {
  if (input === undefined || input === null) {
    return [];
  }
  if (Array.isArray(input)) {
    return input;
  }
  if (isRecord(input)) {
    const nested = arrayField(input, "errors", "errorCards");
    if (nested.length > 0) {
      return nested;
    }
  }
  return [input];
}

function errorMessage(error: unknown): string | undefined {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim() !== "") {
    return error.trim();
  }
  if (isRecord(error)) {
    return stringField(error, "message", "error", "description", "detail");
  }
  return undefined;
}

function redactSensitiveTextWithStats(value: unknown): {
  text: string;
  redactionCount: number;
} {
  let text = value === undefined || value === null ? "" : String(value);
  let redactionCount = 0;
  const replace = (
    pattern: RegExp,
    replacement: string | ((match: string, ...args: string[]) => string),
  ) => {
    text = text.replace(pattern, (...args) => {
      redactionCount += 1;
      const match = args[0];
      if (typeof replacement === "function") {
        return replacement(match, ...(args.slice(1, -2) as string[]));
      }
      return replacement;
    });
  };

  replace(
    /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|authorization)\b\s*[:=]\s*("[^"]+"|'[^']+'|[^\s,;]+)/gi,
    (_match, key) => `${key}=[redacted-secret]`,
  );
  replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted-secret]");
  replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[redacted-secret]");
  replace(/\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]{8,}\b/g, "[redacted-secret]");
  replace(
    /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    "[redacted-secret]",
  );
  replace(/\b[0-9a-f]{32,}\b/gi, "[redacted-secret]");
  replace(
    /([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|key)=)[^&\s]+/gi,
    (_match, prefix) => `${prefix}[redacted-secret]`,
  );
  replace(/\bfile:\/\/\/?[^\s,;'"<>]+/gi, "[redacted-path]");
  replace(/\b[A-Za-z]:[\\/](?:[^\s,;'"<>()[\]]+[\\/])*[^\s,;'"<>()[\]]*/g, "[redacted-path]");
  replace(/\\\\[^\s,;'"<>]+/g, "[redacted-path]");
  replace(
    /(?<!https?:)\/(?:Users|home|var|tmp|etc|mnt|Volumes|private|workspace|root|secrets?|opt|srv)(?:\/[^\s,;'"<>()[\]]*)+/g,
    "[redacted-path]",
  );
  replace(
    /(?<![:/])\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+){1,}/g,
    "[redacted-path]",
  );

  text = text
    .replace(/(?:\[redacted-path\]){2,}/g, "[redacted-path]")
    .replace(/(?:\[redacted-secret\]){2,}/g, "[redacted-secret]")
    .replace(/\s+/g, " ")
    .trim();

  return {
    text: text === "" ? "Workspace session state could not load." : truncate(text, 180),
    redactionCount,
  };
}

function recordField(
  record: AnyRecord | undefined,
  ...keys: readonly string[]
): AnyRecord | undefined {
  if (record === undefined) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (isRecord(value)) {
      return value;
    }
  }
  return undefined;
}

function pickRecord(
  record: AnyRecord,
  keys: readonly string[],
): AnyRecord | undefined {
  const picked: AnyRecord = {};
  for (const key of keys) {
    if (record[key] !== undefined) {
      picked[key] = record[key];
    }
  }
  return Object.keys(picked).length === 0 ? undefined : picked;
}

function arrayField(
  record: AnyRecord | unknown,
  ...keys: readonly string[]
): unknown[] {
  if (!isRecord(record)) {
    return [];
  }
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function stringField(
  record: AnyRecord | unknown,
  ...keys: readonly string[]
): string | undefined {
  if (!isRecord(record)) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return undefined;
}

function timestampField(
  record: AnyRecord | unknown,
  ...keys: readonly string[]
): string | undefined {
  const value = stringField(record, ...keys);
  return value === undefined || Number.isNaN(Date.parse(value)) ? undefined : value;
}

function booleanField(
  record: AnyRecord | unknown,
  ...keys: readonly string[]
): boolean | undefined {
  if (!isRecord(record)) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true" || normalized === "yes") {
        return true;
      }
      if (normalized === "false" || normalized === "no") {
        return false;
      }
    }
  }
  return undefined;
}

function nonNegativeIntegerField(
  record: AnyRecord | unknown,
  ...keys: readonly string[]
): number | undefined {
  if (!isRecord(record)) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
      return value;
    }
    if (typeof value === "string" && /^\d+$/.test(value)) {
      return Number(value);
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is AnyRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasDefinedInput(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return Object.values(value).some((entry) => {
    if (entry === undefined || entry === null) {
      return false;
    }
    if (Array.isArray(entry)) {
      return entry.length > 0;
    }
    if (isRecord(entry)) {
      return Object.keys(entry).length > 0;
    }
    return true;
  });
}

function isDefined<TValue>(value: TValue | undefined): value is TValue {
  return value !== undefined;
}

function sanitizeIdentifier(value: string, fallback: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return sanitized === "" ? fallback : sanitized;
}

function labelFromKey(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatCount(
  value: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 1)}...`;
}

function cloneWorkspaceSessionState(
  state: WorkspaceSessionState,
): WorkspaceSessionState {
  return {
    ...state,
    workspaceOpen: cloneOpenState(state.workspaceOpen),
    lockState: cloneLockState(state.lockState),
    approvalGateway: cloneGatewayState(state.approvalGateway),
    migrationReadiness: cloneMigrationState(state.migrationReadiness),
    backupReadiness: cloneBackupState(state.backupReadiness),
    summaryCards: state.summaryCards.map(cloneCard),
    cards: state.cards.map(cloneCard),
    errorCards: state.errorCards.map(cloneCard),
    emptyState: { ...state.emptyState },
  };
}

function cloneOpenState(state: WorkspaceOpenState): WorkspaceOpenState {
  return {
    ...state,
    detailLabels: [...state.detailLabels],
    metadata: cloneMetadata(state.metadata),
  };
}

function cloneLockState(state: WorkspaceLockState): WorkspaceLockState {
  return {
    ...state,
    detailLabels: [...state.detailLabels],
    metadata: cloneMetadata(state.metadata),
  };
}

function cloneGatewayState(
  state: WorkspaceApprovalGatewayState,
): WorkspaceApprovalGatewayState {
  return {
    ...state,
    detailLabels: [...state.detailLabels],
    metadata: cloneMetadata(state.metadata),
  };
}

function cloneMigrationState(
  state: WorkspaceMigrationReadinessState,
): WorkspaceMigrationReadinessState {
  return {
    ...state,
    detailLabels: [...state.detailLabels],
    metadata: cloneMetadata(state.metadata),
  };
}

function cloneBackupState(
  state: WorkspaceBackupReadinessState,
): WorkspaceBackupReadinessState {
  return {
    ...state,
    detailLabels: [...state.detailLabels],
    metadata: cloneMetadata(state.metadata),
  };
}

function cloneCard(card: WorkspaceSessionCard): WorkspaceSessionCard {
  return {
    ...card,
    badgeLabels: [...card.badgeLabels],
    detailLabels: [...card.detailLabels],
    metadata: cloneMetadata(card.metadata),
  };
}

function cloneMetadata(metadata: WorkspaceSessionMetadata): WorkspaceSessionMetadata {
  const clone: WorkspaceSessionMetadata = {};
  for (const [key, value] of Object.entries(metadata)) {
    clone[key] = Array.isArray(value) ? [...value] : value;
  }
  return clone;
}
