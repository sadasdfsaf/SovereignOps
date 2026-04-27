export const AUTOMATION_SETTINGS_TAB_IDS = [
  "rules",
  "plugin_permissions",
  "audit_options",
  "test_run_preview",
] as const;

export type AutomationSettingsTabId =
  (typeof AUTOMATION_SETTINGS_TAB_IDS)[number];

export interface AutomationSettingsActionMetadata {
  id: string;
  label: string;
  description: string;
}

export interface AutomationSettingsTabMetadata {
  id: AutomationSettingsTabId;
  label: string;
  description: string;
  ariaLabel: string;
  keyActions: readonly AutomationSettingsActionMetadata[];
}

export const AUTOMATION_SETTINGS_TABS: readonly AutomationSettingsTabMetadata[] = [
  {
    id: "rules",
    label: "Rules",
    description: "Create and maintain local automation rules.",
    ariaLabel: "Automation rules settings",
    keyActions: [
      {
        id: "rule.add",
        label: "Add rule",
        description: "Create a local rule with a trigger and operation.",
      },
      {
        id: "rule.disable",
        label: "Disable rule",
        description: "Pause a rule without deleting its settings.",
      },
    ],
  },
  {
    id: "plugin_permissions",
    label: "Plugin permissions",
    description: "Review which plugins can use scoped capabilities.",
    ariaLabel: "Plugin permission settings",
    keyActions: [
      {
        id: "plugin.grant",
        label: "Grant permission",
        description: "Allow a plugin to use selected capabilities.",
      },
      {
        id: "plugin.revoke",
        label: "Revoke permission",
        description: "Remove selected plugin capabilities.",
      },
    ],
  },
  {
    id: "audit_options",
    label: "Audit options",
    description: "Choose which automation events are retained locally.",
    ariaLabel: "Automation audit option settings",
    keyActions: [
      {
        id: "audit.update",
        label: "Update audit options",
        description: "Change retained automation event details.",
      },
    ],
  },
  {
    id: "test_run_preview",
    label: "Test run preview",
    description: "Preview rule readiness before running automation.",
    ariaLabel: "Automation test run preview",
    keyActions: [
      {
        id: "preview.build",
        label: "Build preview",
        description: "Summarize ready, blocked, and review-gated rules.",
      },
    ],
  },
];

export const APPROVAL_GATE_MODES = ["off", "prompt", "required"] as const;

export type ApprovalGateMode = (typeof APPROVAL_GATE_MODES)[number];

export type PluginPermissionStatus = "granted" | "revoked";

export type AutomationPreviewRuleStatus =
  | "ready"
  | "disabled"
  | "missing_permission"
  | "approval_required";

export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: string;
  operation: string;
  pluginId?: string;
  requiredCapabilities: string[];
  approvalGateId?: string;
  createdAt: string;
  updatedAt: string;
  disabledAt?: string;
}

export interface CreateAutomationRuleInput {
  id: string;
  name: string;
  description?: string;
  enabled?: boolean;
  trigger: string;
  operation: string;
  pluginId?: string;
  requiredCapabilities?: string[];
  approvalGateId?: string;
  now?: string;
}

export interface AutomationRuleUpdate {
  name?: string;
  description?: string;
  enabled?: boolean;
  trigger?: string;
  operation?: string;
  pluginId?: string | null;
  requiredCapabilities?: string[];
  approvalGateId?: string | null;
  now?: string;
}

export interface PluginPermission {
  pluginId: string;
  label: string;
  status: PluginPermissionStatus;
  grantedCapabilities: string[];
  grantedAt?: string;
  revokedAt?: string;
  updatedAt: string;
}

export interface GrantPluginPermissionInput {
  pluginId: string;
  label?: string;
  capabilities: string[];
  grantedAt?: string;
}

export interface RevokePluginPermissionInput {
  pluginId: string;
  capabilities?: string[];
  revokedAt?: string;
}

export interface ApprovalGateConfig {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  mode: ApprovalGateMode;
  reviewerRoles: string[];
  updatedAt: string;
}

export interface ApprovalGateUpdate {
  label?: string;
  description?: string;
  enabled?: boolean;
  mode?: ApprovalGateMode;
  reviewerRoles?: string[];
  updatedAt?: string;
}

export interface AutomationAuditOptions {
  captureRuleChanges: boolean;
  capturePluginPermissionChanges: boolean;
  capturePreviewRuns: boolean;
  includeInputSnapshots: boolean;
  retainEventDays: number;
  updatedAt: string;
}

export interface AutomationAuditOptionsUpdate {
  captureRuleChanges?: boolean;
  capturePluginPermissionChanges?: boolean;
  capturePreviewRuns?: boolean;
  includeInputSnapshots?: boolean;
  retainEventDays?: number;
  updatedAt?: string;
}

export interface AutomationSettingsState {
  rules: AutomationRule[];
  pluginPermissions: PluginPermission[];
  approvalGates: ApprovalGateConfig[];
  auditOptions: AutomationAuditOptions;
}

export interface CreateAutomationSettingsStateInput {
  rules?: readonly AutomationRule[];
  pluginPermissions?: readonly PluginPermission[];
  approvalGates?: readonly ApprovalGateConfig[];
  auditOptions?: AutomationAuditOptions;
}

export type AutomationSettingsReducerAction =
  | { type: "rule.add"; rule: CreateAutomationRuleInput }
  | { type: "rule.update"; ruleId: string; patch: AutomationRuleUpdate }
  | { type: "rule.disable"; ruleId: string; disabledAt?: string }
  | { type: "plugin.grant"; permission: GrantPluginPermissionInput }
  | { type: "plugin.revoke"; permission: RevokePluginPermissionInput }
  | { type: "approval_gate.update"; gateId: string; patch: ApprovalGateUpdate }
  | { type: "audit_options.update"; patch: AutomationAuditOptionsUpdate };

export interface BuildAutomationPreviewOptions {
  ruleIds?: readonly string[];
  generatedAt?: string;
}

export type AutomationPreviewStatusCounts = Record<
  AutomationPreviewRuleStatus,
  number
>;

export interface AutomationPreviewRuleSummary {
  ruleId: string;
  name: string;
  status: AutomationPreviewRuleStatus;
  pluginId?: string;
  approvalGateId?: string;
  missingCapabilities: string[];
  keyActionId: string;
}

export interface AutomationPreviewSummary {
  tabId: "test_run_preview";
  generatedAt: string;
  totalRules: number;
  enabledRules: number;
  disabledRules: number;
  grantedPluginCount: number;
  enabledApprovalGateCount: number;
  byStatus: AutomationPreviewStatusCounts;
  readyRuleIds: string[];
  blockedRuleIds: string[];
  audit: Pick<
    AutomationAuditOptions,
    "capturePreviewRuns" | "includeInputSnapshots" | "retainEventDays"
  >;
  rules: AutomationPreviewRuleSummary[];
}

const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";

export const defaultAutomationAuditOptions: AutomationAuditOptions = {
  captureRuleChanges: true,
  capturePluginPermissionChanges: true,
  capturePreviewRuns: true,
  includeInputSnapshots: false,
  retainEventDays: 30,
  updatedAt: DEFAULT_TIMESTAMP,
};

export const defaultAutomationApprovalGates: readonly ApprovalGateConfig[] = [
  {
    id: "rule_changes",
    label: "Rule changes",
    description: "Request review when automation rules are changed.",
    enabled: true,
    mode: "prompt",
    reviewerRoles: ["workspace_owner"],
    updatedAt: DEFAULT_TIMESTAMP,
  },
  {
    id: "plugin_permissions",
    label: "Plugin permissions",
    description: "Require review before plugins receive new capabilities.",
    enabled: true,
    mode: "required",
    reviewerRoles: ["workspace_owner"],
    updatedAt: DEFAULT_TIMESTAMP,
  },
  {
    id: "preview_runs",
    label: "Preview runs",
    description: "Request review before a preview run is promoted.",
    enabled: false,
    mode: "prompt",
    reviewerRoles: [],
    updatedAt: DEFAULT_TIMESTAMP,
  },
];

export function listAutomationSettingsTabs(): AutomationSettingsTabMetadata[] {
  return AUTOMATION_SETTINGS_TABS.map(cloneTabMetadata);
}

export function getAutomationSettingsTab(
  tabId: AutomationSettingsTabId,
): AutomationSettingsTabMetadata {
  const tab = AUTOMATION_SETTINGS_TABS.find((item) => item.id === tabId);
  if (!tab) {
    throw new Error(`automation settings tab not found: ${tabId}`);
  }
  return cloneTabMetadata(tab);
}

export function createAutomationSettingsState(
  input: CreateAutomationSettingsStateInput = {},
): AutomationSettingsState {
  return cloneAutomationSettingsState({
    rules: input.rules ?? [],
    pluginPermissions: input.pluginPermissions ?? [],
    approvalGates: input.approvalGates ?? defaultAutomationApprovalGates,
    auditOptions: input.auditOptions ?? defaultAutomationAuditOptions,
  });
}

export function automationSettingsReducer(
  state: AutomationSettingsState,
  action: AutomationSettingsReducerAction,
): AutomationSettingsState {
  switch (action.type) {
    case "rule.add":
      return addAutomationRule(state, action.rule);
    case "rule.update":
      return updateAutomationRule(state, action.ruleId, action.patch);
    case "rule.disable":
      return disableAutomationRule(state, action.ruleId, action.disabledAt);
    case "plugin.grant":
      return grantPluginPermission(state, action.permission);
    case "plugin.revoke":
      return revokePluginPermission(state, action.permission);
    case "approval_gate.update":
      return updateApprovalGate(state, action.gateId, action.patch);
    case "audit_options.update":
      return updateAutomationAuditOptions(state, action.patch);
  }
}

export function addAutomationRule(
  state: AutomationSettingsState,
  input: CreateAutomationRuleInput,
): AutomationSettingsState {
  const id = normalizeRequiredText(input.id, "rule id");
  if (state.rules.some((rule) => rule.id === id)) {
    throw new Error(`automation rule already exists: ${id}`);
  }

  const now = normalizeTimestamp(input.now ?? nowIso(), "now");
  const enabled = input.enabled ?? true;
  const rule: AutomationRule = {
    id,
    name: normalizeRequiredText(input.name, "rule name"),
    description: input.description?.trim() ?? "",
    enabled,
    trigger: normalizeRequiredText(input.trigger, "rule trigger"),
    operation: normalizeRequiredText(input.operation, "rule operation"),
    requiredCapabilities: normalizeStringList(
      input.requiredCapabilities ?? [],
      "required capability",
    ),
    createdAt: now,
    updatedAt: now,
  };

  if (input.pluginId !== undefined) {
    rule.pluginId = normalizeRequiredText(input.pluginId, "plugin id");
  }
  if (input.approvalGateId !== undefined) {
    rule.approvalGateId = normalizeRequiredText(
      input.approvalGateId,
      "approval gate id",
    );
  }
  if (!enabled) {
    rule.disabledAt = now;
  }

  const next = cloneAutomationSettingsState(state);
  next.rules.push(rule);
  return next;
}

export function updateAutomationRule(
  state: AutomationSettingsState,
  ruleId: string,
  patch: AutomationRuleUpdate,
): AutomationSettingsState {
  const id = normalizeRequiredText(ruleId, "rule id");
  const updatedAt = patch.now ? normalizeTimestamp(patch.now, "now") : undefined;
  let found = false;

  const rules = state.rules.map((rule) => {
    if (rule.id !== id) {
      return cloneRule(rule);
    }

    found = true;
    const next = applyRulePatch(rule, patch);
    if (rulesEqual(rule, next)) {
      return cloneRule(rule);
    }

    next.updatedAt = updatedAt ?? nowIso();
    if (next.enabled) {
      delete next.disabledAt;
    } else if (!next.disabledAt) {
      next.disabledAt = next.updatedAt;
    }
    return next;
  });

  if (!found) {
    throw new Error(`automation rule not found: ${id}`);
  }

  return {
    ...cloneAutomationSettingsState(state),
    rules,
  };
}

export function disableAutomationRule(
  state: AutomationSettingsState,
  ruleId: string,
  disabledAt: string = nowIso(),
): AutomationSettingsState {
  const id = normalizeRequiredText(ruleId, "rule id");
  const normalizedDisabledAt = normalizeTimestamp(disabledAt, "disabledAt");
  let found = false;

  const rules = state.rules.map((rule) => {
    if (rule.id !== id) {
      return cloneRule(rule);
    }

    found = true;
    const next = cloneRule(rule);
    if (!next.enabled) {
      return next;
    }

    next.enabled = false;
    next.disabledAt = normalizedDisabledAt;
    next.updatedAt = normalizedDisabledAt;
    return next;
  });

  if (!found) {
    throw new Error(`automation rule not found: ${id}`);
  }

  return {
    ...cloneAutomationSettingsState(state),
    rules,
  };
}

export function grantPluginPermission(
  state: AutomationSettingsState,
  input: GrantPluginPermissionInput,
): AutomationSettingsState {
  const pluginId = normalizeRequiredText(input.pluginId, "plugin id");
  const capabilities = normalizeStringList(input.capabilities, "capability");
  if (capabilities.length === 0) {
    throw new Error("at least one capability is required");
  }

  const grantedAt = normalizeTimestamp(input.grantedAt ?? nowIso(), "grantedAt");
  const label = input.label?.trim();
  let found = false;

  const pluginPermissions = state.pluginPermissions.map((permission) => {
    if (permission.pluginId !== pluginId) {
      return clonePluginPermission(permission);
    }

    found = true;
    const next: PluginPermission = {
      ...clonePluginPermission(permission),
      label: label && label !== "" ? label : permission.label,
      status: "granted",
      grantedCapabilities: mergeStringLists(
        permission.grantedCapabilities,
        capabilities,
      ),
      grantedAt: permission.grantedAt ?? grantedAt,
      updatedAt: grantedAt,
    };
    delete next.revokedAt;
    return next;
  });

  if (!found) {
    pluginPermissions.push({
      pluginId,
      label: label && label !== "" ? label : pluginId,
      status: "granted",
      grantedCapabilities: capabilities,
      grantedAt,
      updatedAt: grantedAt,
    });
  }

  return {
    ...cloneAutomationSettingsState(state),
    pluginPermissions,
  };
}

export function revokePluginPermission(
  state: AutomationSettingsState,
  input: RevokePluginPermissionInput,
): AutomationSettingsState {
  const pluginId = normalizeRequiredText(input.pluginId, "plugin id");
  const capabilities =
    input.capabilities === undefined
      ? undefined
      : normalizeStringList(input.capabilities, "capability");
  const revokedAt = normalizeTimestamp(input.revokedAt ?? nowIso(), "revokedAt");
  let found = false;

  const pluginPermissions = state.pluginPermissions.map((permission) => {
    if (permission.pluginId !== pluginId) {
      return clonePluginPermission(permission);
    }

    found = true;
    const next = clonePluginPermission(permission);
    next.grantedCapabilities =
      capabilities === undefined
        ? []
        : next.grantedCapabilities.filter(
            (capability) => !capabilities.includes(capability),
          );
    next.status = next.grantedCapabilities.length > 0 ? "granted" : "revoked";
    next.revokedAt = revokedAt;
    next.updatedAt = revokedAt;
    return next;
  });

  if (!found) {
    throw new Error(`plugin permission not found: ${pluginId}`);
  }

  return {
    ...cloneAutomationSettingsState(state),
    pluginPermissions,
  };
}

export function updateApprovalGate(
  state: AutomationSettingsState,
  gateId: string,
  patch: ApprovalGateUpdate,
): AutomationSettingsState {
  const id = normalizeRequiredText(gateId, "approval gate id");
  const updatedAt = patch.updatedAt
    ? normalizeTimestamp(patch.updatedAt, "updatedAt")
    : undefined;
  let found = false;

  const approvalGates = state.approvalGates.map((gate) => {
    if (gate.id !== id) {
      return cloneApprovalGate(gate);
    }

    found = true;
    const next = cloneApprovalGate(gate);
    if (patch.label !== undefined) {
      next.label = normalizeRequiredText(patch.label, "approval gate label");
    }
    if (patch.description !== undefined) {
      next.description = patch.description.trim();
    }
    if (patch.enabled !== undefined) {
      next.enabled = patch.enabled;
    }
    if (patch.mode !== undefined) {
      assertApprovalGateMode(patch.mode);
      next.mode = patch.mode;
    }
    if (patch.reviewerRoles !== undefined) {
      next.reviewerRoles = normalizeStringList(
        patch.reviewerRoles,
        "reviewer role",
      );
    }
    if (!approvalGatesEqual(gate, next)) {
      next.updatedAt = updatedAt ?? nowIso();
    }
    return next;
  });

  if (!found) {
    throw new Error(`approval gate not found: ${id}`);
  }

  return {
    ...cloneAutomationSettingsState(state),
    approvalGates,
  };
}

export function updateAutomationAuditOptions(
  state: AutomationSettingsState,
  patch: AutomationAuditOptionsUpdate,
): AutomationSettingsState {
  const nextAuditOptions = cloneAuditOptions(state.auditOptions);

  if (patch.captureRuleChanges !== undefined) {
    nextAuditOptions.captureRuleChanges = patch.captureRuleChanges;
  }
  if (patch.capturePluginPermissionChanges !== undefined) {
    nextAuditOptions.capturePluginPermissionChanges =
      patch.capturePluginPermissionChanges;
  }
  if (patch.capturePreviewRuns !== undefined) {
    nextAuditOptions.capturePreviewRuns = patch.capturePreviewRuns;
  }
  if (patch.includeInputSnapshots !== undefined) {
    nextAuditOptions.includeInputSnapshots = patch.includeInputSnapshots;
  }
  if (patch.retainEventDays !== undefined) {
    nextAuditOptions.retainEventDays = normalizeRetentionDays(
      patch.retainEventDays,
    );
  }

  if (!auditOptionsEqual(state.auditOptions, nextAuditOptions)) {
    nextAuditOptions.updatedAt = patch.updatedAt
      ? normalizeTimestamp(patch.updatedAt, "updatedAt")
      : nowIso();
  }

  return {
    ...cloneAutomationSettingsState(state),
    auditOptions: nextAuditOptions,
  };
}

export function buildAutomationPreviewSummary(
  state: AutomationSettingsState,
  options: BuildAutomationPreviewOptions = {},
): AutomationPreviewSummary {
  const generatedAt = normalizeTimestamp(
    options.generatedAt ?? nowIso(),
    "generatedAt",
  );
  const rules = resolvePreviewRules(state.rules, options.ruleIds);
  const summaries = rules.map((rule) => buildRulePreviewSummary(state, rule));
  const byStatus = createPreviewStatusCounts();

  for (const summary of summaries) {
    byStatus[summary.status] += 1;
  }

  return {
    tabId: "test_run_preview",
    generatedAt,
    totalRules: summaries.length,
    enabledRules: summaries.filter((summary) => summary.status !== "disabled")
      .length,
    disabledRules: byStatus.disabled,
    grantedPluginCount: state.pluginPermissions.filter(
      (permission) =>
        permission.status === "granted" &&
        permission.grantedCapabilities.length > 0,
    ).length,
    enabledApprovalGateCount: state.approvalGates.filter(
      (gate) => gate.enabled && gate.mode !== "off",
    ).length,
    byStatus,
    readyRuleIds: summaries
      .filter((summary) => summary.status === "ready")
      .map((summary) => summary.ruleId),
    blockedRuleIds: summaries
      .filter((summary) => summary.status !== "ready")
      .map((summary) => summary.ruleId),
    audit: {
      capturePreviewRuns: state.auditOptions.capturePreviewRuns,
      includeInputSnapshots: state.auditOptions.includeInputSnapshots,
      retainEventDays: state.auditOptions.retainEventDays,
    },
    rules: summaries,
  };
}

function buildRulePreviewSummary(
  state: AutomationSettingsState,
  rule: AutomationRule,
): AutomationPreviewRuleSummary {
  const missingCapabilities = findMissingCapabilities(state, rule);
  const approvalGate = rule.approvalGateId
    ? state.approvalGates.find((gate) => gate.id === rule.approvalGateId)
    : undefined;
  const status = getPreviewRuleStatus(rule, missingCapabilities, approvalGate);
  const summary: AutomationPreviewRuleSummary = {
    ruleId: rule.id,
    name: rule.name,
    status,
    missingCapabilities,
    keyActionId: getPreviewKeyActionId(status),
  };

  if (rule.pluginId !== undefined) {
    summary.pluginId = rule.pluginId;
  }
  if (rule.approvalGateId !== undefined) {
    summary.approvalGateId = rule.approvalGateId;
  }

  return summary;
}

function getPreviewRuleStatus(
  rule: AutomationRule,
  missingCapabilities: readonly string[],
  approvalGate: ApprovalGateConfig | undefined,
): AutomationPreviewRuleStatus {
  if (!rule.enabled) {
    return "disabled";
  }
  if (missingCapabilities.length > 0) {
    return "missing_permission";
  }
  if (approvalGate?.enabled && approvalGate.mode !== "off") {
    return "approval_required";
  }
  return "ready";
}

function getPreviewKeyActionId(status: AutomationPreviewRuleStatus): string {
  switch (status) {
    case "ready":
      return "preview.run_rule";
    case "disabled":
      return "rule.enable";
    case "missing_permission":
      return "plugin.grant";
    case "approval_required":
      return "approval.review";
  }
}

function findMissingCapabilities(
  state: AutomationSettingsState,
  rule: AutomationRule,
): string[] {
  if (rule.requiredCapabilities.length === 0) {
    return [];
  }

  const grantedCapabilities =
    rule.pluginId === undefined
      ? []
      : (state.pluginPermissions.find(
          (permission) =>
            permission.pluginId === rule.pluginId &&
            permission.status === "granted",
        )?.grantedCapabilities ?? []);
  const granted = new Set(grantedCapabilities);
  return rule.requiredCapabilities.filter((capability) => !granted.has(capability));
}

function resolvePreviewRules(
  rules: readonly AutomationRule[],
  ruleIds: readonly string[] | undefined,
): AutomationRule[] {
  if (ruleIds === undefined) {
    return rules.map(cloneRule);
  }

  return ruleIds.map((ruleId) => {
    const id = normalizeRequiredText(ruleId, "rule id");
    const rule = rules.find((item) => item.id === id);
    if (!rule) {
      throw new Error(`automation rule not found: ${id}`);
    }
    return cloneRule(rule);
  });
}

function applyRulePatch(
  rule: AutomationRule,
  patch: AutomationRuleUpdate,
): AutomationRule {
  const next = cloneRule(rule);

  if (patch.name !== undefined) {
    next.name = normalizeRequiredText(patch.name, "rule name");
  }
  if (patch.description !== undefined) {
    next.description = patch.description.trim();
  }
  if (patch.enabled !== undefined) {
    next.enabled = patch.enabled;
  }
  if (patch.trigger !== undefined) {
    next.trigger = normalizeRequiredText(patch.trigger, "rule trigger");
  }
  if (patch.operation !== undefined) {
    next.operation = normalizeRequiredText(patch.operation, "rule operation");
  }
  if (patch.pluginId !== undefined) {
    if (patch.pluginId === null) {
      delete next.pluginId;
    } else {
      next.pluginId = normalizeRequiredText(patch.pluginId, "plugin id");
    }
  }
  if (patch.requiredCapabilities !== undefined) {
    next.requiredCapabilities = normalizeStringList(
      patch.requiredCapabilities,
      "required capability",
    );
  }
  if (patch.approvalGateId !== undefined) {
    if (patch.approvalGateId === null) {
      delete next.approvalGateId;
    } else {
      next.approvalGateId = normalizeRequiredText(
        patch.approvalGateId,
        "approval gate id",
      );
    }
  }

  return next;
}

function cloneAutomationSettingsState(
  state: AutomationSettingsState,
): AutomationSettingsState {
  return {
    rules: state.rules.map(cloneRule),
    pluginPermissions: state.pluginPermissions.map(clonePluginPermission),
    approvalGates: state.approvalGates.map(cloneApprovalGate),
    auditOptions: cloneAuditOptions(state.auditOptions),
  };
}

function cloneRule(rule: AutomationRule): AutomationRule {
  return {
    ...rule,
    requiredCapabilities: [...rule.requiredCapabilities],
  };
}

function clonePluginPermission(permission: PluginPermission): PluginPermission {
  return {
    ...permission,
    grantedCapabilities: [...permission.grantedCapabilities],
  };
}

function cloneApprovalGate(gate: ApprovalGateConfig): ApprovalGateConfig {
  return {
    ...gate,
    reviewerRoles: [...gate.reviewerRoles],
  };
}

function cloneAuditOptions(options: AutomationAuditOptions): AutomationAuditOptions {
  return { ...options };
}

function cloneTabMetadata(
  tab: AutomationSettingsTabMetadata,
): AutomationSettingsTabMetadata {
  return {
    ...tab,
    keyActions: tab.keyActions.map((action) => ({ ...action })),
  };
}

function createPreviewStatusCounts(): AutomationPreviewStatusCounts {
  return {
    ready: 0,
    disabled: 0,
    missing_permission: 0,
    approval_required: 0,
  };
}

function normalizeStringList(values: readonly string[], name: string): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const item = normalizeRequiredText(value, name);
    if (!seen.has(item)) {
      seen.add(item);
      normalized.push(item);
    }
  }

  return normalized;
}

function mergeStringLists(
  existing: readonly string[],
  next: readonly string[],
): string[] {
  return normalizeStringList([...existing, ...next], "capability");
}

function normalizeRequiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized === "") {
    throw new Error(`${field} is required`);
  }
  return normalized;
}

function normalizeTimestamp(value: string, field: string): string {
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be a valid timestamp`);
  }
  return value;
}

function normalizeRetentionDays(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("retainEventDays must be a positive integer");
  }
  return value;
}

function assertApprovalGateMode(
  mode: ApprovalGateMode,
): asserts mode is ApprovalGateMode {
  if (!APPROVAL_GATE_MODES.includes(mode)) {
    throw new Error("approval gate mode is not supported");
  }
}

function rulesEqual(left: AutomationRule, right: AutomationRule): boolean {
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.description === right.description &&
    left.enabled === right.enabled &&
    left.trigger === right.trigger &&
    left.operation === right.operation &&
    left.pluginId === right.pluginId &&
    left.approvalGateId === right.approvalGateId &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt &&
    left.disabledAt === right.disabledAt &&
    stringListsEqual(left.requiredCapabilities, right.requiredCapabilities)
  );
}

function approvalGatesEqual(
  left: ApprovalGateConfig,
  right: ApprovalGateConfig,
): boolean {
  return (
    left.id === right.id &&
    left.label === right.label &&
    left.description === right.description &&
    left.enabled === right.enabled &&
    left.mode === right.mode &&
    left.updatedAt === right.updatedAt &&
    stringListsEqual(left.reviewerRoles, right.reviewerRoles)
  );
}

function auditOptionsEqual(
  left: AutomationAuditOptions,
  right: AutomationAuditOptions,
): boolean {
  return (
    left.captureRuleChanges === right.captureRuleChanges &&
    left.capturePluginPermissionChanges ===
      right.capturePluginPermissionChanges &&
    left.capturePreviewRuns === right.capturePreviewRuns &&
    left.includeInputSnapshots === right.includeInputSnapshots &&
    left.retainEventDays === right.retainEventDays &&
    left.updatedAt === right.updatedAt
  );
}

function stringListsEqual(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}

function nowIso(): string {
  return new Date().toISOString();
}
