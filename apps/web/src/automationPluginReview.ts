import {
  buildAutomationPreviewSummary,
  type ApprovalGateConfig,
  type ApprovalGateMode,
  type AutomationAuditOptions,
  type AutomationPreviewRuleStatus,
  type AutomationSettingsState,
  type PluginPermission,
} from "./automationSettings.ts";

export const AUTOMATION_PLUGIN_REVIEW_STATES = [
  "empty",
  "ready",
  "disabled",
  "missing_permission",
  "approval_required",
  "sandbox_failure",
] as const;

export type AutomationPluginReviewState =
  (typeof AUTOMATION_PLUGIN_REVIEW_STATES)[number];

export const AUTOMATION_SANDBOX_REVIEW_OUTCOMES = [
  "passed",
  "warning",
  "failed",
] as const;

export type AutomationSandboxReviewOutcome =
  (typeof AUTOMATION_SANDBOX_REVIEW_OUTCOMES)[number];

export type AutomationPermissionCardStatus =
  | "granted"
  | "missing_permission"
  | "revoked"
  | "unused";

export type AutomationApprovalGatePanelStatus =
  | "required"
  | "prompt"
  | "off"
  | "unused";

export type AutomationSandboxFindingSeverity = "blocking" | "warning";

export type AutomationReviewActionIntent = "primary" | "secondary" | "danger";

export type AutomationReviewActionId =
  | "run_ready_rules"
  | "grant_missing_permissions"
  | "review_approval_gates"
  | "inspect_sandbox_failures"
  | "open_audit";

export interface AutomationSandboxReviewSummary {
  id: string;
  outcome: AutomationSandboxReviewOutcome;
  title: string;
  checkedAt: string;
  ruleId?: string;
  pluginId?: string;
  details?: string;
  findingCount?: number;
}

export interface AutomationAuditSummary {
  id: string;
  status: string;
  count?: number;
  ruleId?: string;
  pluginId?: string;
  lastEventAt?: string;
}

export interface BuildAutomationPluginReviewOptions {
  generatedAt?: string;
  sandboxReviews?: readonly AutomationSandboxReviewSummary[];
  auditSummaries?: readonly AutomationAuditSummary[];
}

export interface AutomationRuleReviewItem {
  ruleId: string;
  name: string;
  status: AutomationPluginReviewState;
  statusLabel: string;
  previewStatus: AutomationPreviewRuleStatus;
  pluginId?: string;
  approvalGateId?: string;
  missingCapabilities: string[];
  sandboxReviewIds: string[];
  keyActionId: string;
}

export interface AutomationPermissionCard {
  id: string;
  pluginId: string;
  label: string;
  status: AutomationPermissionCardStatus;
  statusLabel: string;
  grantedCapabilities: string[];
  requiredCapabilities: string[];
  missingCapabilities: string[];
  ruleIds: string[];
  affectedRuleCount: number;
  actionId: "plugin.grant" | "plugin.review" | "plugin.configure";
  actionLabel: string;
  ariaLabel: string;
}

export interface AutomationApprovalGatePanel {
  id: string;
  gateId: string;
  label: string;
  description: string;
  enabled: boolean;
  mode: ApprovalGateMode;
  status: AutomationApprovalGatePanelStatus;
  statusLabel: string;
  reviewerRoles: string[];
  ruleIds: string[];
  affectedRuleCount: number;
  actionId: "approval.review" | "approval.configure";
  actionLabel: string;
  ariaLabel: string;
}

export interface AutomationSandboxFinding {
  id: string;
  reviewId: string;
  outcome: Exclude<AutomationSandboxReviewOutcome, "passed">;
  severity: AutomationSandboxFindingSeverity;
  title: string;
  checkedAt: string;
  findingCount: number;
  ruleIds: string[];
  pluginIds: string[];
  details?: string;
  actionId: "sandbox.inspect";
  actionLabel: string;
  ariaLabel: string;
}

export interface AutomationAuditCounter {
  id: string;
  status: string;
  label: string;
  count: number;
  lastEventAt?: string;
  ruleIds: string[];
  pluginIds: string[];
}

export interface AutomationReviewAction {
  id: AutomationReviewActionId;
  label: string;
  intent: AutomationReviewActionIntent;
  enabled: boolean;
  ruleIds: string[];
  pluginIds: string[];
  disabledReason?: string;
}

export interface AutomationPluginReviewSummary {
  totalRules: number;
  enabledRules: number;
  disabledRules: number;
  readyRules: number;
  blockedRules: number;
  missingPermissionRules: number;
  approvalRequiredRules: number;
  sandboxFailureRules: number;
  auditEventCount: number;
  byState: Record<AutomationPluginReviewState, number>;
}

export interface AutomationPluginReviewViewModel {
  status: AutomationPluginReviewState;
  statusLabel: string;
  generatedAt: string;
  isEmpty: boolean;
  summary: AutomationPluginReviewSummary;
  auditOptions: Pick<
    AutomationAuditOptions,
    | "captureRuleChanges"
    | "capturePluginPermissionChanges"
    | "capturePreviewRuns"
    | "includeInputSnapshots"
    | "retainEventDays"
  >;
  rules: AutomationRuleReviewItem[];
  permissionCards: AutomationPermissionCard[];
  approvalGates: AutomationApprovalGatePanel[];
  sandboxFindings: AutomationSandboxFinding[];
  auditCounters: AutomationAuditCounter[];
  reviewActions: AutomationReviewAction[];
}

interface PermissionCardDraft {
  pluginId: string;
  label: string;
  permission?: PluginPermission;
  ruleIds: Set<string>;
  requiredCapabilities: Set<string>;
  missingCapabilities: Set<string>;
}

interface AuditCounterDraft {
  status: string;
  count: number;
  lastEventAt?: string;
  ruleIds: Set<string>;
  pluginIds: Set<string>;
}

export function buildAutomationPluginReviewViewModel(
  state: AutomationSettingsState,
  options: BuildAutomationPluginReviewOptions = {},
): AutomationPluginReviewViewModel {
  const preview = buildAutomationPreviewSummary(state, {
    generatedAt: options.generatedAt,
  });
  const sandboxReviews = normalizeSandboxReviews(options.sandboxReviews ?? []);
  const auditCounters = buildAutomationAuditCounters(
    options.auditSummaries ?? [],
  );
  const rules = preview.rules.map((rule) => {
    const sandboxReviewIds = matchingSandboxReviews(rule.ruleId, rule.pluginId, sandboxReviews)
      .filter((review) => review.outcome === "failed")
      .map((review) => review.id)
      .sort();
    const status = resolveRuleReviewState(rule.status, sandboxReviewIds.length > 0);

    return {
      ruleId: rule.ruleId,
      name: rule.name,
      status,
      statusLabel: reviewStateLabel(status),
      previewStatus: rule.status,
      pluginId: rule.pluginId,
      approvalGateId: rule.approvalGateId,
      missingCapabilities: [...rule.missingCapabilities],
      sandboxReviewIds,
      keyActionId:
        status === "sandbox_failure" ? "sandbox.inspect" : rule.keyActionId,
    };
  });
  const summary = summarizeRules(rules, preview.enabledRules, preview.disabledRules);
  const status = resolveOverallReviewState(summary);
  const permissionCards = buildAutomationPermissionCards(state, rules);
  const approvalGates = buildAutomationApprovalGatePanels(state.approvalGates, rules);
  const sandboxFindings = buildAutomationSandboxFindings(sandboxReviews, rules);

  return {
    status,
    statusLabel: reviewStateLabel(status),
    generatedAt: preview.generatedAt,
    isEmpty: status === "empty",
    summary: {
      ...summary,
      auditEventCount: auditCounters.reduce((total, counter) => total + counter.count, 0),
    },
    auditOptions: {
      captureRuleChanges: state.auditOptions.captureRuleChanges,
      capturePluginPermissionChanges:
        state.auditOptions.capturePluginPermissionChanges,
      capturePreviewRuns: state.auditOptions.capturePreviewRuns,
      includeInputSnapshots: state.auditOptions.includeInputSnapshots,
      retainEventDays: state.auditOptions.retainEventDays,
    },
    rules: rules.map(cloneRuleReviewItem).sort(compareRuleReviewItems),
    permissionCards,
    approvalGates,
    sandboxFindings,
    auditCounters,
    reviewActions: buildAutomationReviewActions(
      status,
      rules,
      permissionCards,
      sandboxFindings,
      auditCounters,
    ),
  };
}

export function buildAutomationPermissionCards(
  state: AutomationSettingsState,
  rules: readonly AutomationRuleReviewItem[],
): AutomationPermissionCard[] {
  const drafts = new Map<string, PermissionCardDraft>();

  for (const permission of state.pluginPermissions) {
    const pluginId = normalizeRequiredText(permission.pluginId, "plugin id");
    drafts.set(pluginId, {
      pluginId,
      label: normalizeDisplayText(permission.label, pluginId),
      permission,
      ruleIds: new Set<string>(),
      requiredCapabilities: new Set<string>(),
      missingCapabilities: new Set<string>(),
    });
  }

  for (const rule of rules) {
    if (!rule.pluginId) {
      continue;
    }

    const pluginId = normalizeRequiredText(rule.pluginId, "plugin id");
    const draft = getOrCreatePermissionCardDraft(drafts, pluginId);
    draft.ruleIds.add(rule.ruleId);
    for (const capability of rule.missingCapabilities) {
      draft.requiredCapabilities.add(capability);
      draft.missingCapabilities.add(capability);
    }
  }

  for (const rule of state.rules) {
    if (!rule.pluginId) {
      continue;
    }

    const pluginId = normalizeRequiredText(rule.pluginId, "plugin id");
    const draft = getOrCreatePermissionCardDraft(drafts, pluginId);
    draft.ruleIds.add(rule.id);
    for (const capability of rule.requiredCapabilities) {
      draft.requiredCapabilities.add(capability);
    }
  }

  return [...drafts.values()]
    .map(toPermissionCard)
    .sort(comparePermissionCards);
}

export function buildAutomationApprovalGatePanels(
  gates: readonly ApprovalGateConfig[],
  rules: readonly AutomationRuleReviewItem[],
): AutomationApprovalGatePanel[] {
  return gates
    .map((gate) => {
      const ruleIds = rules
        .filter((rule) => rule.approvalGateId === gate.id)
        .map((rule) => rule.ruleId)
        .sort();
      const affectedRuleIds = rules
        .filter(
          (rule) =>
            rule.approvalGateId === gate.id &&
            rule.status === "approval_required",
        )
        .map((rule) => rule.ruleId)
        .sort();
      const status = resolveApprovalGatePanelStatus(gate, affectedRuleIds.length);

      return {
        id: `approval_gate.${gate.id}`,
        gateId: gate.id,
        label: gate.label,
        description: gate.description,
        enabled: gate.enabled,
        mode: gate.mode,
        status,
        statusLabel: approvalGateStatusLabel(status),
        reviewerRoles: [...gate.reviewerRoles],
        ruleIds,
        affectedRuleCount: affectedRuleIds.length,
        actionId:
          status === "required" || status === "prompt"
            ? "approval.review"
            : "approval.configure",
        actionLabel:
          status === "required" || status === "prompt"
            ? "Review gate"
            : "Configure gate",
        ariaLabel: [
          gate.label,
          approvalGateStatusLabel(status),
          `${affectedRuleIds.length} gated rule${
            affectedRuleIds.length === 1 ? "" : "s"
          }`,
        ].join(", "),
      };
    })
    .sort(compareApprovalGatePanels);
}

export function buildAutomationSandboxFindings(
  sandboxReviews: readonly AutomationSandboxReviewSummary[],
  rules: readonly AutomationRuleReviewItem[],
): AutomationSandboxFinding[] {
  return normalizeSandboxReviews(sandboxReviews)
    .filter((review) => review.outcome !== "passed")
    .map((review) => {
      const matchingRules = rules
        .filter((rule) => sandboxReviewMatchesRule(review, rule))
        .map((rule) => rule.ruleId)
        .sort();
      const pluginIds = uniqueSorted([
        review.pluginId,
        ...rules
          .filter((rule) => sandboxReviewMatchesRule(review, rule))
          .map((rule) => rule.pluginId),
      ]);
      const severity: AutomationSandboxFindingSeverity =
        review.outcome === "failed" ? "blocking" : "warning";

      return {
        id: `sandbox.${review.id}`,
        reviewId: review.id,
        outcome: review.outcome,
        severity,
        title: review.title,
        checkedAt: review.checkedAt,
        findingCount: review.findingCount ?? 1,
        ruleIds: matchingRules,
        pluginIds,
        details: review.details,
        actionId: "sandbox.inspect",
        actionLabel: "Inspect sandbox",
        ariaLabel: [
          sandboxOutcomeLabel(review.outcome),
          review.title,
          `${matchingRules.length} rule${matchingRules.length === 1 ? "" : "s"}`,
        ].join(", "),
      };
    })
    .sort(compareSandboxFindings);
}

export function buildAutomationAuditCounters(
  auditSummaries: readonly AutomationAuditSummary[],
): AutomationAuditCounter[] {
  const drafts = new Map<string, AuditCounterDraft>();

  for (const summary of auditSummaries) {
    const status = normalizeRequiredText(summary.status, "audit status");
    const count = normalizeCount(summary.count ?? 1, "audit count");
    const draft =
      drafts.get(status) ??
      {
        status,
        count: 0,
        ruleIds: new Set<string>(),
        pluginIds: new Set<string>(),
      };

    draft.count += count;
    if (summary.lastEventAt !== undefined) {
      const lastEventAt = normalizeTimestamp(summary.lastEventAt, "lastEventAt");
      if (
        draft.lastEventAt === undefined ||
        compareTimestamps(lastEventAt, draft.lastEventAt) > 0
      ) {
        draft.lastEventAt = lastEventAt;
      }
    }
    if (summary.ruleId !== undefined) {
      draft.ruleIds.add(normalizeRequiredText(summary.ruleId, "rule id"));
    }
    if (summary.pluginId !== undefined) {
      draft.pluginIds.add(normalizeRequiredText(summary.pluginId, "plugin id"));
    }

    drafts.set(status, draft);
  }

  return [...drafts.values()]
    .map((draft) => {
      const counter: AutomationAuditCounter = {
        id: `audit.${draft.status}`,
        status: draft.status,
        label: `${titleCaseToken(draft.status)} events`,
        count: draft.count,
        ruleIds: [...draft.ruleIds].sort(),
        pluginIds: [...draft.pluginIds].sort(),
      };
      if (draft.lastEventAt !== undefined) {
        counter.lastEventAt = draft.lastEventAt;
      }
      return counter;
    })
    .sort(compareAuditCounters);
}

export function buildAutomationReviewActions(
  status: AutomationPluginReviewState,
  rules: readonly AutomationRuleReviewItem[],
  permissionCards: readonly AutomationPermissionCard[],
  sandboxFindings: readonly AutomationSandboxFinding[],
  auditCounters: readonly AutomationAuditCounter[],
): AutomationReviewAction[] {
  const readyRuleIds = rules
    .filter((rule) => rule.status === "ready")
    .map((rule) => rule.ruleId)
    .sort();
  const missingPermissionCards = permissionCards.filter(
    (card) => card.status === "missing_permission",
  );
  const missingPermissionRuleIds = uniqueSorted(
    missingPermissionCards.flatMap((card) => card.ruleIds),
  );
  const missingPermissionPluginIds = uniqueSorted(
    missingPermissionCards.map((card) => card.pluginId),
  );
  const approvalRuleIds = rules
    .filter((rule) => rule.status === "approval_required")
    .map((rule) => rule.ruleId)
    .sort();
  const sandboxFailureFindings = sandboxFindings.filter(
    (finding) => finding.severity === "blocking",
  );
  const sandboxRuleIds = uniqueSorted(
    sandboxFailureFindings.flatMap((finding) => finding.ruleIds),
  );
  const sandboxPluginIds = uniqueSorted(
    sandboxFailureFindings.flatMap((finding) => finding.pluginIds),
  );
  const auditRuleIds = uniqueSorted(auditCounters.flatMap((counter) => counter.ruleIds));
  const auditPluginIds = uniqueSorted(
    auditCounters.flatMap((counter) => counter.pluginIds),
  );
  const canRunReadyRules = status === "ready" && readyRuleIds.length > 0;

  return [
    {
      id: "run_ready_rules",
      label: "Run ready rules",
      intent: "primary",
      enabled: canRunReadyRules,
      disabledReason: canRunReadyRules
        ? undefined
        : disabledRunReadyRulesReason(status),
      ruleIds: readyRuleIds,
      pluginIds: uniqueSorted(
        rules
          .filter((rule) => readyRuleIds.includes(rule.ruleId))
          .map((rule) => rule.pluginId),
      ),
    },
    {
      id: "grant_missing_permissions",
      label: "Grant missing permissions",
      intent: "secondary",
      enabled: missingPermissionRuleIds.length > 0,
      disabledReason:
        missingPermissionRuleIds.length > 0
          ? undefined
          : "No missing plugin permissions.",
      ruleIds: missingPermissionRuleIds,
      pluginIds: missingPermissionPluginIds,
    },
    {
      id: "review_approval_gates",
      label: "Review approval gates",
      intent: "secondary",
      enabled: approvalRuleIds.length > 0,
      disabledReason:
        approvalRuleIds.length > 0 ? undefined : "No approval gates are waiting.",
      ruleIds: approvalRuleIds,
      pluginIds: uniqueSorted(
        rules
          .filter((rule) => approvalRuleIds.includes(rule.ruleId))
          .map((rule) => rule.pluginId),
      ),
    },
    {
      id: "inspect_sandbox_failures",
      label: "Inspect sandbox failures",
      intent: "danger",
      enabled: sandboxFailureFindings.length > 0,
      disabledReason:
        sandboxFailureFindings.length > 0
          ? undefined
          : "No sandbox failures found.",
      ruleIds: sandboxRuleIds,
      pluginIds: sandboxPluginIds,
    },
    {
      id: "open_audit",
      label: "Open audit",
      intent: "secondary",
      enabled: auditCounters.length > 0,
      disabledReason:
        auditCounters.length > 0 ? undefined : "No automation audit events.",
      ruleIds: auditRuleIds,
      pluginIds: auditPluginIds,
    },
  ].map(cloneReviewAction);
}

function summarizeRules(
  rules: readonly AutomationRuleReviewItem[],
  enabledRules: number,
  disabledRules: number,
): AutomationPluginReviewSummary {
  const byState = createReviewStateCounts();
  for (const rule of rules) {
    byState[rule.status] += 1;
  }

  return {
    totalRules: rules.length,
    enabledRules,
    disabledRules,
    readyRules: byState.ready,
    blockedRules:
      byState.missing_permission +
      byState.approval_required +
      byState.sandbox_failure,
    missingPermissionRules: byState.missing_permission,
    approvalRequiredRules: byState.approval_required,
    sandboxFailureRules: byState.sandbox_failure,
    auditEventCount: 0,
    byState,
  };
}

function resolveOverallReviewState(
  summary: AutomationPluginReviewSummary,
): AutomationPluginReviewState {
  if (summary.totalRules === 0) {
    return "empty";
  }
  if (summary.sandboxFailureRules > 0) {
    return "sandbox_failure";
  }
  if (summary.missingPermissionRules > 0) {
    return "missing_permission";
  }
  if (summary.approvalRequiredRules > 0) {
    return "approval_required";
  }
  if (summary.readyRules > 0) {
    return "ready";
  }
  return "disabled";
}

function resolveRuleReviewState(
  previewStatus: AutomationPreviewRuleStatus,
  hasSandboxFailure: boolean,
): AutomationPluginReviewState {
  if (hasSandboxFailure) {
    return "sandbox_failure";
  }
  if (previewStatus === "missing_permission") {
    return "missing_permission";
  }
  if (previewStatus === "approval_required") {
    return "approval_required";
  }
  if (previewStatus === "disabled") {
    return "disabled";
  }
  return "ready";
}

function matchingSandboxReviews(
  ruleId: string,
  pluginId: string | undefined,
  sandboxReviews: readonly AutomationSandboxReviewSummary[],
): AutomationSandboxReviewSummary[] {
  return sandboxReviews.filter((review) =>
    sandboxReviewMatchesRule(review, { ruleId, pluginId }),
  );
}

function sandboxReviewMatchesRule(
  review: AutomationSandboxReviewSummary,
  rule: Pick<AutomationRuleReviewItem, "ruleId" | "pluginId">,
): boolean {
  return (
    review.ruleId === rule.ruleId ||
    (review.ruleId === undefined &&
      review.pluginId !== undefined &&
      review.pluginId === rule.pluginId)
  );
}

function getOrCreatePermissionCardDraft(
  drafts: Map<string, PermissionCardDraft>,
  pluginId: string,
): PermissionCardDraft {
  const existing = drafts.get(pluginId);
  if (existing) {
    return existing;
  }

  const draft: PermissionCardDraft = {
    pluginId,
    label: pluginId,
    ruleIds: new Set<string>(),
    requiredCapabilities: new Set<string>(),
    missingCapabilities: new Set<string>(),
  };
  drafts.set(pluginId, draft);
  return draft;
}

function toPermissionCard(draft: PermissionCardDraft): AutomationPermissionCard {
  const grantedCapabilities = draft.permission
    ? [...draft.permission.grantedCapabilities].sort()
    : [];
  const requiredCapabilities = [...draft.requiredCapabilities].sort();
  const missingCapabilities = [...draft.missingCapabilities].sort();
  const ruleIds = [...draft.ruleIds].sort();
  const status = resolvePermissionCardStatus(draft, missingCapabilities);

  return {
    id: `plugin_permission.${draft.pluginId}`,
    pluginId: draft.pluginId,
    label: draft.label,
    status,
    statusLabel: permissionCardStatusLabel(status),
    grantedCapabilities,
    requiredCapabilities,
    missingCapabilities,
    ruleIds,
    affectedRuleCount: ruleIds.length,
    actionId: permissionCardActionId(status),
    actionLabel: permissionCardActionLabel(status),
    ariaLabel: [
      draft.label,
      permissionCardStatusLabel(status),
      `${ruleIds.length} rule${ruleIds.length === 1 ? "" : "s"}`,
    ].join(", "),
  };
}

function resolvePermissionCardStatus(
  draft: PermissionCardDraft,
  missingCapabilities: readonly string[],
): AutomationPermissionCardStatus {
  if (missingCapabilities.length > 0) {
    return "missing_permission";
  }
  if (!draft.permission) {
    return "unused";
  }
  if (
    draft.permission.status === "granted" &&
    draft.permission.grantedCapabilities.length > 0
  ) {
    return "granted";
  }
  return "revoked";
}

function resolveApprovalGatePanelStatus(
  gate: ApprovalGateConfig,
  affectedRuleCount: number,
): AutomationApprovalGatePanelStatus {
  if (!gate.enabled || gate.mode === "off") {
    return "off";
  }
  if (affectedRuleCount === 0) {
    return "unused";
  }
  return gate.mode === "required" ? "required" : "prompt";
}

function normalizeSandboxReviews(
  reviews: readonly AutomationSandboxReviewSummary[],
): AutomationSandboxReviewSummary[] {
  return reviews.map((review) => {
    assertSandboxReviewOutcome(review.outcome);
    const next: AutomationSandboxReviewSummary = {
      id: normalizeRequiredText(review.id, "sandbox review id"),
      outcome: review.outcome,
      title: normalizeRequiredText(review.title, "sandbox review title"),
      checkedAt: normalizeTimestamp(review.checkedAt, "checkedAt"),
    };

    if (review.ruleId !== undefined) {
      next.ruleId = normalizeRequiredText(review.ruleId, "rule id");
    }
    if (review.pluginId !== undefined) {
      next.pluginId = normalizeRequiredText(review.pluginId, "plugin id");
    }
    if (review.details !== undefined) {
      next.details = review.details.trim();
    }
    if (review.findingCount !== undefined) {
      next.findingCount = normalizeCount(review.findingCount, "findingCount");
    }

    return next;
  });
}

function cloneRuleReviewItem(item: AutomationRuleReviewItem): AutomationRuleReviewItem {
  return {
    ...item,
    missingCapabilities: [...item.missingCapabilities],
    sandboxReviewIds: [...item.sandboxReviewIds],
  };
}

function cloneReviewAction(action: AutomationReviewAction): AutomationReviewAction {
  return {
    ...action,
    ruleIds: [...action.ruleIds],
    pluginIds: [...action.pluginIds],
  };
}

function createReviewStateCounts(): Record<AutomationPluginReviewState, number> {
  return {
    empty: 0,
    ready: 0,
    disabled: 0,
    missing_permission: 0,
    approval_required: 0,
    sandbox_failure: 0,
  };
}

function compareRuleReviewItems(
  left: AutomationRuleReviewItem,
  right: AutomationRuleReviewItem,
): number {
  return (
    reviewStateSortWeight(left.status) - reviewStateSortWeight(right.status) ||
    left.name.localeCompare(right.name) ||
    left.ruleId.localeCompare(right.ruleId)
  );
}

function comparePermissionCards(
  left: AutomationPermissionCard,
  right: AutomationPermissionCard,
): number {
  return (
    permissionStatusSortWeight(left.status) -
      permissionStatusSortWeight(right.status) ||
    left.label.localeCompare(right.label) ||
    left.pluginId.localeCompare(right.pluginId)
  );
}

function compareApprovalGatePanels(
  left: AutomationApprovalGatePanel,
  right: AutomationApprovalGatePanel,
): number {
  return (
    approvalGateStatusSortWeight(left.status) -
      approvalGateStatusSortWeight(right.status) ||
    left.label.localeCompare(right.label) ||
    left.gateId.localeCompare(right.gateId)
  );
}

function compareSandboxFindings(
  left: AutomationSandboxFinding,
  right: AutomationSandboxFinding,
): number {
  return (
    sandboxSeveritySortWeight(left.severity) -
      sandboxSeveritySortWeight(right.severity) ||
    compareTimestamps(right.checkedAt, left.checkedAt) ||
    left.reviewId.localeCompare(right.reviewId)
  );
}

function compareAuditCounters(
  left: AutomationAuditCounter,
  right: AutomationAuditCounter,
): number {
  return (
    auditStatusSortWeight(left.status) - auditStatusSortWeight(right.status) ||
    left.status.localeCompare(right.status)
  );
}

function reviewStateSortWeight(status: AutomationPluginReviewState): number {
  return {
    sandbox_failure: 0,
    missing_permission: 1,
    approval_required: 2,
    ready: 3,
    disabled: 4,
    empty: 5,
  }[status];
}

function permissionStatusSortWeight(status: AutomationPermissionCardStatus): number {
  return {
    missing_permission: 0,
    revoked: 1,
    granted: 2,
    unused: 3,
  }[status];
}

function approvalGateStatusSortWeight(
  status: AutomationApprovalGatePanelStatus,
): number {
  return {
    required: 0,
    prompt: 1,
    unused: 2,
    off: 3,
  }[status];
}

function sandboxSeveritySortWeight(
  severity: AutomationSandboxFindingSeverity,
): number {
  return {
    blocking: 0,
    warning: 1,
  }[severity];
}

function auditStatusSortWeight(status: string): number {
  const normalized = status.toLowerCase();
  if (["blocked", "failed", "failure", "error"].includes(normalized)) {
    return 0;
  }
  if (["warning", "warn"].includes(normalized)) {
    return 1;
  }
  if (["pending", "queued", "running"].includes(normalized)) {
    return 2;
  }
  if (["approved", "done", "success", "succeeded"].includes(normalized)) {
    return 3;
  }
  return 4;
}

function permissionCardActionId(
  status: AutomationPermissionCardStatus,
): AutomationPermissionCard["actionId"] {
  if (status === "missing_permission" || status === "revoked") {
    return "plugin.grant";
  }
  if (status === "granted") {
    return "plugin.review";
  }
  return "plugin.configure";
}

function permissionCardActionLabel(status: AutomationPermissionCardStatus): string {
  if (status === "missing_permission" || status === "revoked") {
    return "Grant permission";
  }
  if (status === "granted") {
    return "Review permission";
  }
  return "Configure permission";
}

function disabledRunReadyRulesReason(status: AutomationPluginReviewState): string {
  if (status === "empty") {
    return "No automation rules to review.";
  }
  if (status === "disabled") {
    return "All automation rules are disabled.";
  }
  if (status === "sandbox_failure") {
    return "Sandbox failures must be inspected first.";
  }
  if (status === "missing_permission") {
    return "Missing plugin permissions must be granted first.";
  }
  if (status === "approval_required") {
    return "Approval gates must be reviewed first.";
  }
  return "No ready automation rules.";
}

function reviewStateLabel(status: AutomationPluginReviewState): string {
  return {
    empty: "No automation rules",
    ready: "Ready",
    disabled: "Disabled",
    missing_permission: "Missing permissions",
    approval_required: "Approval required",
    sandbox_failure: "Sandbox failure",
  }[status];
}

function permissionCardStatusLabel(status: AutomationPermissionCardStatus): string {
  return {
    granted: "Granted",
    missing_permission: "Missing permissions",
    revoked: "Revoked",
    unused: "Unused",
  }[status];
}

function approvalGateStatusLabel(status: AutomationApprovalGatePanelStatus): string {
  return {
    required: "Required",
    prompt: "Prompt",
    off: "Off",
    unused: "No waiting rules",
  }[status];
}

function sandboxOutcomeLabel(outcome: AutomationSandboxReviewOutcome): string {
  return {
    passed: "Passed",
    warning: "Warning",
    failed: "Failed",
  }[outcome];
}

function titleCaseToken(value: string): string {
  const words = value
    .replace(/[._-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);

  if (words.length === 0) {
    return "Audit";
  }

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function uniqueSorted(values: readonly (string | undefined)[]): string[] {
  return [...new Set(values.filter(isDefined))].sort();
}

function normalizeDisplayText(value: string, fallback: string): string {
  const normalized = value.trim();
  return normalized === "" ? fallback : normalized;
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

function normalizeCount(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return value;
}

function compareTimestamps(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
    throw new Error("timestamps must be valid");
  }

  return leftTime - rightTime || left.localeCompare(right);
}

function assertSandboxReviewOutcome(
  outcome: AutomationSandboxReviewOutcome,
): asserts outcome is AutomationSandboxReviewOutcome {
  if (!AUTOMATION_SANDBOX_REVIEW_OUTCOMES.includes(outcome)) {
    throw new Error("sandbox review outcome is not supported");
  }
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
