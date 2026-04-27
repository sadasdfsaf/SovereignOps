export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult<TValue = unknown> {
  ok: boolean;
  issues: ValidationIssue[];
  value?: TValue;
}

export const AUTOMATION_TRIGGER_TYPES = [
  "task_changed",
  "doc_updated",
  "incident_created",
  "approval_decided",
] as const;

export type AutomationTriggerType = (typeof AUTOMATION_TRIGGER_TYPES)[number];

export const AUTOMATION_ACTION_TYPES = [
  "draft_doc",
  "create_task",
  "notify",
  "request_agent_review",
] as const;

export type AutomationActionType = (typeof AUTOMATION_ACTION_TYPES)[number];

export const AUTOMATION_CONDITION_OPERATORS = [
  "equals",
  "not_equals",
  "in",
  "contains",
  "exists",
] as const;

export type AutomationConditionOperator =
  (typeof AUTOMATION_CONDITION_OPERATORS)[number];

export interface AutomationTrigger {
  type: AutomationTriggerType;
  filters?: Record<string, JsonValue>;
}

export interface AutomationCondition {
  path: string;
  operator: AutomationConditionOperator;
  value?: JsonValue;
}

export interface AutomationAction {
  type: AutomationActionType;
  input: JsonObject;
  description?: string;
}

export interface AutomationApprovalGate {
  required: boolean;
  gateId?: string;
  reason?: string;
  approverActorIds?: string[];
  minApprovals?: number;
}

export interface AutomationAuditOptions {
  enabled?: boolean;
  emitSkipped?: boolean;
  includeEventPayload?: boolean;
  labels?: Record<string, string>;
}

export interface AutomationRule {
  id: `rule_${string}`;
  title?: string;
  description?: string;
  enabled?: boolean;
  trigger: AutomationTrigger;
  conditions?: AutomationCondition[];
  actions: AutomationAction[];
  approval?: AutomationApprovalGate;
  audit?: AutomationAuditOptions;
}

export interface LocalAutomationEvent {
  id?: string;
  type: string;
  workspaceId?: string;
  actorId?: string;
  occurredAt?: string;
  payload?: JsonObject;
}

export type AutomationEvaluationStatus =
  | "matched"
  | "skipped"
  | "approval_required";

export interface AutomationTriggerMatch {
  matched: boolean;
  triggerType: AutomationTriggerType;
  eventType: string;
  reason?: string;
}

export interface AutomationConditionResult {
  matched: boolean;
  path: string;
  operator: AutomationConditionOperator;
  actual?: JsonValue;
  expected?: JsonValue;
  reason?: string;
}

export type AutomationApprovalStatus =
  | "not_required"
  | "approved"
  | "required"
  | "rejected";

export interface AutomationApprovalDecision {
  id?: string;
  ruleId?: string;
  gateId?: string;
  actorId: string;
  decision: "approved" | "rejected";
  decidedAt?: string;
}

export interface AutomationApprovalResult {
  status: AutomationApprovalStatus;
  required: boolean;
  satisfied: boolean;
  gateId?: string;
  reason?: string;
  approvedCount: number;
  requiredCount: number;
}

export interface AutomationActionContext {
  ruleId: string;
  event: LocalAutomationEvent;
  actionIndex: number;
}

export interface AutomationActionProposal {
  id: string;
  ruleId: string;
  eventId?: string;
  actionType: AutomationActionType;
  actionIndex: number;
  mode: "proposal_only";
  summary: string;
  payload: JsonObject;
  source: {
    triggerType: string;
    workspaceId?: string;
  };
}

export interface AutomationTriggerRegistryLike {
  match(
    trigger: AutomationTrigger,
    event: LocalAutomationEvent,
  ): AutomationTriggerMatch;
}

export interface AutomationActionRegistryLike {
  propose(
    action: AutomationAction,
    context: AutomationActionContext,
  ): AutomationActionProposal;
}

export type AutomationAuditRecordType =
  | "automation_evaluation_decision"
  | "automation_execution_decision";

export type AutomationAuditPhase =
  | "rule"
  | "trigger"
  | "condition"
  | "approval_gate"
  | "action";

export interface AutomationAuditEvent {
  type: AutomationAuditRecordType;
  phase: AutomationAuditPhase;
  ruleId: string;
  eventId?: string;
  decision: AutomationEvaluationStatus | "proposed";
  reason?: string;
  metadata?: Record<string, JsonValue>;
}

export interface AutomationAuditRecord extends AutomationAuditEvent {
  id: string;
  timestamp: string;
}

export interface AutomationAuditEmitterOptions {
  now?: () => Date | string;
  idPrefix?: string;
}

export interface AutomationAuditSink {
  emit(event: AutomationAuditEvent): AutomationAuditRecord;
}

export type AutomationAuditListener = (record: AutomationAuditRecord) => void;

export class AutomationAuditEmitter implements AutomationAuditSink {
  readonly #records: AutomationAuditRecord[] = [];
  readonly #listeners = new Set<AutomationAuditListener>();
  readonly #now: () => Date | string;
  readonly #idPrefix: string;
  #sequence = 0;

  constructor(options: AutomationAuditEmitterOptions = {}) {
    this.#now = options.now ?? (() => new Date());
    this.#idPrefix = options.idPrefix ?? "automation_audit_";
  }

  emit(event: AutomationAuditEvent): AutomationAuditRecord {
    const record: AutomationAuditRecord = {
      ...cloneAuditEvent(event),
      id: `${this.#idPrefix}${++this.#sequence}`,
      timestamp: toTimestamp(this.#now()),
    };

    this.#records.push(record);
    for (const listener of this.#listeners) {
      listener(cloneAuditRecord(record));
    }

    return cloneAuditRecord(record);
  }

  entries(): AutomationAuditRecord[] {
    return this.#records.map(cloneAuditRecord);
  }

  clear(): void {
    this.#records.length = 0;
  }

  subscribe(listener: AutomationAuditListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
}

export interface AutomationEvaluationOptions {
  triggerRegistry?: AutomationTriggerRegistryLike;
  actionRegistry?: AutomationActionRegistryLike;
  approvals?: readonly AutomationApprovalDecision[];
  audit?: AutomationAuditSink;
  now?: () => Date | string;
}

export interface AutomationEvaluationResult {
  status: AutomationEvaluationStatus;
  ruleId: string;
  eventId?: string;
  reason?: string;
  trigger: AutomationTriggerMatch;
  conditions: AutomationConditionResult[];
  approval: AutomationApprovalResult;
  proposals: AutomationActionProposal[];
  auditRecords: AutomationAuditRecord[];
}

const RULE_ID_PATTERN = /^rule_[A-Za-z0-9_-]{1,88}$/;
const GATE_ID_PATTERN = /^gate_[A-Za-z0-9_-]{1,88}$/;

export function createAutomationAuditEmitter(
  options: AutomationAuditEmitterOptions = {},
): AutomationAuditEmitter {
  return new AutomationAuditEmitter(options);
}

export function validateAutomationRule(value: unknown): ValidationResult<AutomationRule> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [{ path: "$", message: "automation rule must be an object" }],
    };
  }

  requireOnlyKeys(
    value,
    [
      "id",
      "title",
      "description",
      "enabled",
      "trigger",
      "conditions",
      "actions",
      "approval",
      "audit",
    ],
    "$",
    issues,
  );
  requireRuleId(value.id, "id", issues);
  requireOptionalString(value.title, "title", issues);
  requireOptionalString(value.description, "description", issues);
  requireOptionalBoolean(value.enabled, "enabled", issues);
  validateTrigger(value.trigger, "trigger", issues);
  validateConditions(value.conditions, "conditions", issues);
  validateActions(value.actions, "actions", issues);
  validateApprovalGate(value.approval, "approval", issues);
  validateAuditOptions(value.audit, "audit", issues);

  return issues.length === 0
    ? { ok: true, issues, value: cloneJsonValue(value as JsonObject) as unknown as AutomationRule }
    : { ok: false, issues };
}

export function assertAutomationRule(value: unknown): AutomationRule {
  const validation = validateAutomationRule(value);
  if (!validation.ok || !validation.value) {
    throw new Error(formatValidationIssues("automation rule", validation.issues));
  }

  return validation.value;
}

export function evaluateAutomationRule(
  inputRule: AutomationRule,
  event: LocalAutomationEvent,
  options: AutomationEvaluationOptions = {},
): AutomationEvaluationResult {
  const rule = assertAutomationRule(inputRule);
  const triggerRegistry = options.triggerRegistry ?? DEFAULT_TRIGGER_REGISTRY;
  const actionRegistry = options.actionRegistry ?? DEFAULT_ACTION_REGISTRY;
  const auditSink =
    options.audit ?? createAutomationAuditEmitter({ now: options.now });
  const auditRecords: AutomationAuditRecord[] = [];
  const auditEnabled = rule.audit?.enabled !== false;
  const emitSkipped = rule.audit?.emitSkipped !== false;

  const emit = (auditEvent: AutomationAuditEvent): void => {
    if (!auditEnabled) {
      return;
    }
    if (auditEvent.decision === "skipped" && !emitSkipped) {
      return;
    }
    auditRecords.push(auditSink.emit(withAuditMetadata(auditEvent, rule, event)));
  };

  const skipped = (
    reason: string,
    trigger: AutomationTriggerMatch,
    conditions: AutomationConditionResult[] = [],
    approval: AutomationApprovalResult = approvalNotRequired(),
  ): AutomationEvaluationResult => {
    emit({
      type: "automation_evaluation_decision",
      phase: "rule",
      ruleId: rule.id,
      eventId: event.id,
      decision: "skipped",
      reason,
    });

    return {
      status: "skipped",
      ruleId: rule.id,
      eventId: event.id,
      reason,
      trigger,
      conditions,
      approval,
      proposals: [],
      auditRecords,
    };
  };

  if (rule.enabled === false) {
    const trigger = {
      matched: false,
      triggerType: rule.trigger.type,
      eventType: event.type,
      reason: "rule_disabled",
    };
    emit({
      type: "automation_evaluation_decision",
      phase: "trigger",
      ruleId: rule.id,
      eventId: event.id,
      decision: "skipped",
      reason: "rule_disabled",
    });
    return skipped("rule_disabled", trigger);
  }

  const trigger = triggerRegistry.match(rule.trigger, event);
  emit({
    type: "automation_evaluation_decision",
    phase: "trigger",
    ruleId: rule.id,
    eventId: event.id,
    decision: trigger.matched ? "matched" : "skipped",
    reason: trigger.reason,
    metadata: { triggerType: trigger.triggerType },
  });

  if (!trigger.matched) {
    return skipped(trigger.reason ?? "trigger_not_matched", trigger);
  }

  const conditions = (rule.conditions ?? []).map((condition, index) => {
    const result = evaluateAutomationCondition(condition, event);
    emit({
      type: "automation_evaluation_decision",
      phase: "condition",
      ruleId: rule.id,
      eventId: event.id,
      decision: result.matched ? "matched" : "skipped",
      reason: result.reason,
      metadata: {
        conditionIndex: index,
        conditionPath: result.path,
        operator: result.operator,
      },
    });
    return result;
  });
  const failedCondition = conditions.find((condition) => !condition.matched);
  if (failedCondition) {
    return skipped("condition_not_matched", trigger, conditions);
  }

  const approval = evaluateApprovalGate(rule, options.approvals ?? []);
  if (approval.required) {
    emit({
      type: "automation_evaluation_decision",
      phase: "approval_gate",
      ruleId: rule.id,
      eventId: event.id,
      decision: approval.satisfied ? "matched" : "approval_required",
      reason: approval.reason,
      metadata: {
        gateId: approval.gateId ?? "",
        approvedCount: approval.approvedCount,
        requiredCount: approval.requiredCount,
      },
    });
  }

  if (approval.status === "rejected") {
    return skipped("approval_rejected", trigger, conditions, approval);
  }

  if (!approval.satisfied) {
    emit({
      type: "automation_evaluation_decision",
      phase: "rule",
      ruleId: rule.id,
      eventId: event.id,
      decision: "approval_required",
      reason: approval.reason ?? "approval_required",
    });

    return {
      status: "approval_required",
      ruleId: rule.id,
      eventId: event.id,
      reason: approval.reason ?? "approval_required",
      trigger,
      conditions,
      approval,
      proposals: [],
      auditRecords,
    };
  }

  const proposals = rule.actions.map((action, actionIndex) => {
    const proposal = actionRegistry.propose(action, {
      ruleId: rule.id,
      event,
      actionIndex,
    });
    emit({
      type: "automation_execution_decision",
      phase: "action",
      ruleId: rule.id,
      eventId: event.id,
      decision: "proposed",
      metadata: {
        actionIndex,
        actionType: action.type,
        proposalId: proposal.id,
        mode: proposal.mode,
      },
    });
    return proposal;
  });

  emit({
    type: "automation_evaluation_decision",
    phase: "rule",
    ruleId: rule.id,
    eventId: event.id,
    decision: "matched",
  });

  return {
    status: "matched",
    ruleId: rule.id,
    eventId: event.id,
    trigger,
    conditions,
    approval,
    proposals,
    auditRecords,
  };
}

export function evaluateAutomationRules(
  rules: readonly AutomationRule[],
  event: LocalAutomationEvent,
  options: AutomationEvaluationOptions = {},
): AutomationEvaluationResult[] {
  return rules.map((rule) => evaluateAutomationRule(rule, event, options));
}

export function evaluateAutomationCondition(
  condition: AutomationCondition,
  event: LocalAutomationEvent,
): AutomationConditionResult {
  const actual = readPath(event as unknown as JsonObject, condition.path);
  const expected = condition.value;
  const matched = conditionMatches(condition, actual);

  return {
    matched,
    path: condition.path,
    operator: condition.operator,
    actual: actual.exists ? cloneJsonValue(actual.value as JsonValue) : undefined,
    expected: expected === undefined ? undefined : cloneJsonValue(expected),
    reason: matched ? undefined : "condition_not_matched",
  };
}

export function matchAutomationTrigger(
  trigger: AutomationTrigger,
  event: LocalAutomationEvent,
): AutomationTriggerMatch {
  if (event.type !== trigger.type) {
    return {
      matched: false,
      triggerType: trigger.type,
      eventType: event.type,
      reason: "event_type_mismatch",
    };
  }

  for (const key of Object.keys(trigger.filters ?? {}).sort()) {
    const actual = readPath(event as unknown as JsonObject, key);
    const expected = trigger.filters?.[key];
    if (!actual.exists || !jsonEquals(actual.value as JsonValue, expected as JsonValue)) {
      return {
        matched: false,
        triggerType: trigger.type,
        eventType: event.type,
        reason: `filter_not_matched:${key}`,
      };
    }
  }

  return {
    matched: true,
    triggerType: trigger.type,
    eventType: event.type,
  };
}

export function proposeAutomationAction(
  action: AutomationAction,
  context: AutomationActionContext,
): AutomationActionProposal {
  return {
    id: proposalId(context.ruleId, context.event.id, context.actionIndex, action.type),
    ruleId: context.ruleId,
    eventId: context.event.id,
    actionType: action.type,
    actionIndex: context.actionIndex,
    mode: "proposal_only",
    summary: actionSummary(action),
    payload: cloneJsonValue(action.input) as JsonObject,
    source: {
      triggerType: context.event.type,
      workspaceId: context.event.workspaceId,
    },
  };
}

function validateTrigger(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "trigger must be an object" });
    return;
  }

  requireOnlyKeys(value, ["type", "filters"], path, issues);
  if (
    typeof value.type !== "string" ||
    !AUTOMATION_TRIGGER_TYPES.includes(value.type as AutomationTriggerType)
  ) {
    issues.push({
      path: `${path}.type`,
      message: `type must be one of ${AUTOMATION_TRIGGER_TYPES.join(", ")}`,
    });
  }
  if (value.filters !== undefined) {
    validateJsonRecord(value.filters, `${path}.filters`, issues);
  }
}

function validateConditions(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    issues.push({ path, message: "conditions must be an array when provided" });
    return;
  }

  value.forEach((condition, index) => {
    const conditionPath = `${path}[${index}]`;
    if (!isRecord(condition)) {
      issues.push({ path: conditionPath, message: "condition must be an object" });
      return;
    }

    requireOnlyKeys(condition, ["path", "operator", "value"], conditionPath, issues);
    if (typeof condition.path !== "string" || condition.path.trim().length === 0) {
      issues.push({
        path: `${conditionPath}.path`,
        message: "path must be a non-empty string",
      });
    }
    if (
      typeof condition.operator !== "string" ||
      !AUTOMATION_CONDITION_OPERATORS.includes(
        condition.operator as AutomationConditionOperator,
      )
    ) {
      issues.push({
        path: `${conditionPath}.operator`,
        message: `operator must be one of ${AUTOMATION_CONDITION_OPERATORS.join(", ")}`,
      });
    }
    if (condition.operator !== "exists" && condition.value === undefined) {
      issues.push({
        path: `${conditionPath}.value`,
        message: "value is required for this operator",
      });
    }
    if (condition.value !== undefined) {
      validateJsonValue(condition.value, `${conditionPath}.value`, issues);
    }
  });
}

function validateActions(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push({ path, message: "actions must be a non-empty array" });
    return;
  }

  value.forEach((action, index) => {
    const actionPath = `${path}[${index}]`;
    if (!isRecord(action)) {
      issues.push({ path: actionPath, message: "action must be an object" });
      return;
    }

    requireOnlyKeys(action, ["type", "input", "description"], actionPath, issues);
    if (
      typeof action.type !== "string" ||
      !AUTOMATION_ACTION_TYPES.includes(action.type as AutomationActionType)
    ) {
      issues.push({
        path: `${actionPath}.type`,
        message: `type must be one of ${AUTOMATION_ACTION_TYPES.join(", ")}`,
      });
    }
    validateJsonRecord(action.input, `${actionPath}.input`, issues);
    requireOptionalString(action.description, `${actionPath}.description`, issues);
  });
}

function validateApprovalGate(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    issues.push({ path, message: "approval gate must be an object" });
    return;
  }

  requireOnlyKeys(
    value,
    ["required", "gateId", "reason", "approverActorIds", "minApprovals"],
    path,
    issues,
  );
  if (typeof value.required !== "boolean") {
    issues.push({ path: `${path}.required`, message: "required must be a boolean" });
  }
  if (
    value.gateId !== undefined &&
    (typeof value.gateId !== "string" || !GATE_ID_PATTERN.test(value.gateId))
  ) {
    issues.push({
      path: `${path}.gateId`,
      message: "gateId must use the gate_ id prefix",
    });
  }
  requireOptionalString(value.reason, `${path}.reason`, issues);
  if (value.approverActorIds !== undefined) {
    if (!Array.isArray(value.approverActorIds) || value.approverActorIds.length === 0) {
      issues.push({
        path: `${path}.approverActorIds`,
        message: "approverActorIds must be a non-empty array when provided",
      });
    } else {
      value.approverActorIds.forEach((actorId, index) => {
        if (typeof actorId !== "string" || actorId.trim().length === 0) {
          issues.push({
            path: `${path}.approverActorIds[${index}]`,
            message: "actor id must be a non-empty string",
          });
        }
      });
    }
  }
  if (
    value.minApprovals !== undefined &&
    (!Number.isSafeInteger(value.minApprovals) || value.minApprovals < 1)
  ) {
    issues.push({
      path: `${path}.minApprovals`,
      message: "minApprovals must be a positive safe integer",
    });
  }
}

function validateAuditOptions(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    issues.push({ path, message: "audit options must be an object" });
    return;
  }

  requireOnlyKeys(
    value,
    ["enabled", "emitSkipped", "includeEventPayload", "labels"],
    path,
    issues,
  );
  requireOptionalBoolean(value.enabled, `${path}.enabled`, issues);
  requireOptionalBoolean(value.emitSkipped, `${path}.emitSkipped`, issues);
  requireOptionalBoolean(value.includeEventPayload, `${path}.includeEventPayload`, issues);
  if (value.labels !== undefined) {
    if (!isRecord(value.labels)) {
      issues.push({ path: `${path}.labels`, message: "labels must be an object" });
      return;
    }
    for (const [key, labelValue] of Object.entries(value.labels)) {
      if (typeof labelValue !== "string") {
        issues.push({
          path: `${path}.labels.${key}`,
          message: "label values must be strings",
        });
      }
    }
  }
}

function evaluateApprovalGate(
  rule: AutomationRule,
  approvals: readonly AutomationApprovalDecision[],
): AutomationApprovalResult {
  const gate = rule.approval;
  if (!gate?.required) {
    return approvalNotRequired();
  }

  const requiredCount = gate.minApprovals ?? 1;
  const matching = approvals.filter((approval) =>
    approvalMatchesGate(approval, rule.id, gate),
  );
  const rejected = matching.find((approval) => approval.decision === "rejected");
  if (rejected) {
    return {
      status: "rejected",
      required: true,
      satisfied: false,
      gateId: gate.gateId,
      reason: "approval_rejected",
      approvedCount: countApprovedActors(matching),
      requiredCount,
    };
  }

  const approvedCount = countApprovedActors(matching);
  if (approvedCount >= requiredCount) {
    return {
      status: "approved",
      required: true,
      satisfied: true,
      gateId: gate.gateId,
      approvedCount,
      requiredCount,
    };
  }

  return {
    status: "required",
    required: true,
    satisfied: false,
    gateId: gate.gateId,
    reason: gate.reason ?? "approval_required",
    approvedCount,
    requiredCount,
  };
}

function approvalMatchesGate(
  approval: AutomationApprovalDecision,
  ruleId: string,
  gate: AutomationApprovalGate,
): boolean {
  if (approval.ruleId !== undefined && approval.ruleId !== ruleId) {
    return false;
  }
  if (gate.gateId !== undefined && approval.gateId !== gate.gateId) {
    return false;
  }
  if (
    gate.approverActorIds !== undefined &&
    !gate.approverActorIds.includes(approval.actorId)
  ) {
    return false;
  }
  return approval.decision === "approved" || approval.decision === "rejected";
}

function countApprovedActors(approvals: readonly AutomationApprovalDecision[]): number {
  const actors = new Set<string>();
  for (const approval of approvals) {
    if (approval.decision === "approved") {
      actors.add(approval.actorId);
    }
  }
  return actors.size;
}

function approvalNotRequired(): AutomationApprovalResult {
  return {
    status: "not_required",
    required: false,
    satisfied: true,
    approvedCount: 0,
    requiredCount: 0,
  };
}

function conditionMatches(
  condition: AutomationCondition,
  actual: { exists: boolean; value?: unknown },
): boolean {
  switch (condition.operator) {
    case "equals":
      return actual.exists && jsonEquals(actual.value as JsonValue, condition.value);
    case "not_equals":
      return !actual.exists || !jsonEquals(actual.value as JsonValue, condition.value);
    case "in":
      return (
        actual.exists &&
        Array.isArray(condition.value) &&
        condition.value.some((item) => jsonEquals(actual.value as JsonValue, item))
      );
    case "contains":
      return actual.exists && containsValue(actual.value, condition.value);
    case "exists": {
      const shouldExist = condition.value === undefined ? true : condition.value !== false;
      return shouldExist ? actual.exists : !actual.exists;
    }
  }
}

function containsValue(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(actual)) {
    return actual.some((item) => jsonEquals(item, expected as JsonValue));
  }
  if (typeof actual === "string" && typeof expected === "string") {
    return actual.includes(expected);
  }
  if (isRecord(actual) && typeof expected === "string") {
    return Object.hasOwn(actual, expected);
  }
  return false;
}

function withAuditMetadata(
  auditEvent: AutomationAuditEvent,
  rule: AutomationRule,
  event: LocalAutomationEvent,
): AutomationAuditEvent {
  const metadata: Record<string, JsonValue> = {
    ...(auditEvent.metadata ?? {}),
  };

  if (rule.audit?.labels) {
    metadata.labels = cloneJsonValue(rule.audit.labels as unknown as JsonObject);
  }
  if (rule.audit?.includeEventPayload && event.payload) {
    metadata.eventPayload = cloneJsonValue(event.payload);
  }

  return {
    ...auditEvent,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

function actionSummary(action: AutomationAction): string {
  const label =
    firstString(action.input, ["title", "summary", "message", "subject", "name"]) ??
    action.type;

  switch (action.type) {
    case "draft_doc":
      return `Draft document: ${label}`;
    case "create_task":
      return `Create task: ${label}`;
    case "notify":
      return `Notify: ${label}`;
    case "request_agent_review":
      return `Request agent review: ${label}`;
  }
}

function firstString(record: JsonObject, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function proposalId(
  ruleId: string,
  eventId: string | undefined,
  actionIndex: number,
  actionType: string,
): string {
  return [
    "proposal",
    sanitizeIdPart(ruleId),
    sanitizeIdPart(eventId ?? "local_event"),
    String(actionIndex + 1).padStart(2, "0"),
    sanitizeIdPart(actionType),
  ].join("_");
}

function sanitizeIdPart(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_-]/g, "_").replace(/_+/g, "_");
  return cleaned.length > 0 ? cleaned : "item";
}

function readPath(
  target: JsonObject,
  path: string,
): { exists: boolean; value?: unknown } {
  const normalized = path === "$" ? "" : path.replace(/^\$\./, "");
  if (normalized.length === 0) {
    return { exists: true, value: target };
  }

  let current: unknown = target;
  for (const segment of normalized.split(".")) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return { exists: false };
      }
      current = current[index];
      continue;
    }
    if (!isRecord(current) || !Object.hasOwn(current, segment)) {
      return { exists: false };
    }
    current = current[segment];
  }

  return { exists: true, value: current };
}

function requireRuleId(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || !RULE_ID_PATTERN.test(value)) {
    issues.push({ path, message: "id must use the rule_ id prefix" });
  }
}

function requireOptionalString(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value !== undefined && (typeof value !== "string" || value.trim().length === 0)) {
    issues.push({ path, message: "value must be a non-empty string when provided" });
  }
}

function requireOptionalBoolean(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value !== undefined && typeof value !== "boolean") {
    issues.push({ path, message: "value must be a boolean when provided" });
  }
}

function validateJsonRecord(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "value must be a JSON object" });
    return;
  }

  validateJsonValue(value, path, issues);
}

function validateJsonValue(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => validateJsonValue(item, `${path}[${index}]`, issues));
    return;
  }

  if (isRecord(value)) {
    for (const [key, nested] of Object.entries(value)) {
      if (nested === undefined) {
        issues.push({ path: `${path}.${key}`, message: "JSON values cannot be undefined" });
      } else {
        validateJsonValue(nested, `${path}.${key}`, issues);
      }
    }
    return;
  }

  issues.push({ path, message: "value must be JSON-compatible" });
}

function requireOnlyKeys(
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  path: string,
  issues: ValidationIssue[],
): void {
  for (const key of Object.keys(record)) {
    if (!allowedKeys.includes(key)) {
      issues.push({
        path: path === "$" ? key : `${path}.${key}`,
        message: "field is not supported",
      });
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneJsonValue<TValue extends JsonValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}

function cloneAuditEvent(event: AutomationAuditEvent): AutomationAuditEvent {
  return {
    ...event,
    metadata: event.metadata
      ? (cloneJsonValue(event.metadata as JsonObject) as Record<string, JsonValue>)
      : undefined,
  };
}

function cloneAuditRecord(record: AutomationAuditRecord): AutomationAuditRecord {
  return {
    ...cloneAuditEvent(record),
    id: record.id,
    timestamp: record.timestamp,
  };
}

function jsonEquals(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function canonicalJson(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return "undefined";
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return "undefined";
}

function toTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function formatValidationIssues(
  scope: string,
  issues: readonly ValidationIssue[],
): string {
  const details = issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
  return `${scope} validation failed: ${details}`;
}

const DEFAULT_TRIGGER_REGISTRY: AutomationTriggerRegistryLike = {
  match: matchAutomationTrigger,
};

const DEFAULT_ACTION_REGISTRY: AutomationActionRegistryLike = {
  propose: proposeAutomationAction,
};
