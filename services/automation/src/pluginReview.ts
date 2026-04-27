import {
  AUTOMATION_AUDIT_REDACTED,
  sortAutomationAuditEvents,
  summarizeAutomationAuditEvents,
  type AutomationAuditEvent as AutomationDurableAuditEvent,
  type AutomationAuditJsonValue,
} from "./audit.ts";
import type {
  AutomationActionProposal,
  AutomationApprovalResult,
  AutomationApprovalStatus,
  AutomationAuditRecord,
  AutomationConditionResult,
  AutomationEvaluationResult,
  AutomationEvaluationStatus,
  AutomationTriggerMatch,
  JsonObject,
  JsonValue,
} from "./rules.ts";

export const AUTOMATION_PLUGIN_REVIEW_OUTCOMES = [
  "approved",
  "skipped",
  "blocked",
  "proposed",
] as const;

export type AutomationPluginReviewOutcome =
  (typeof AUTOMATION_PLUGIN_REVIEW_OUTCOMES)[number];

export type AutomationPluginReviewApprovalStatus =
  | AutomationApprovalStatus
  | "mixed";

export interface AutomationPluginReviewArtifactInput {
  generatedAt?: Date | string | number;
  pluginId?: string;
  reviewLabel?: string;
  evaluations?: readonly AutomationEvaluationResult[];
  auditEvents?: readonly AutomationDurableAuditEvent[];
  auditRecords?: readonly AutomationAuditRecord[];
}

export interface AutomationPluginReviewArtifact {
  readonly id: string;
  readonly fingerprint: string;
  readonly generatedAt: string;
  readonly pluginId?: string;
  readonly reviewLabel?: string;
  readonly status: AutomationPluginReviewOutcome;
  readonly approvalStatus: AutomationPluginReviewApprovalStatus;
  readonly summary: AutomationPluginReviewSummary;
  readonly gates: readonly AutomationPluginReviewGate[];
  readonly audit: AutomationPluginReviewAuditSummary;
}

export interface AutomationPluginReviewSummary {
  readonly totalGates: number;
  readonly approved: number;
  readonly skipped: number;
  readonly blocked: number;
  readonly proposed: number;
  readonly approvalRequired: number;
  readonly approvalRejected: number;
  readonly proposals: number;
  readonly auditEvents: number;
  readonly auditRecords: number;
}

export interface AutomationPluginReviewGate {
  readonly id: string;
  readonly fingerprint: string;
  readonly outcome: AutomationPluginReviewOutcome;
  readonly approvalStatus: AutomationApprovalStatus;
  readonly evaluationStatus: AutomationEvaluationStatus;
  readonly ruleId: string;
  readonly eventId?: string;
  readonly reason?: string;
  readonly trigger: AutomationPluginReviewTriggerSummary;
  readonly conditions: AutomationPluginReviewConditionSummary;
  readonly approval: AutomationPluginReviewApprovalSummary;
  readonly proposals: AutomationPluginReviewProposalSummary;
  readonly audit: AutomationPluginReviewRecordSummary;
}

export interface AutomationPluginReviewTriggerSummary {
  readonly matched: boolean;
  readonly triggerType: string;
  readonly eventType: string;
  readonly reason?: string;
}

export interface AutomationPluginReviewConditionSummary {
  readonly total: number;
  readonly matched: number;
  readonly skipped: number;
}

export interface AutomationPluginReviewApprovalSummary {
  readonly status: AutomationApprovalStatus;
  readonly required: boolean;
  readonly satisfied: boolean;
  readonly gateId?: string;
  readonly approvedCount: number;
  readonly requiredCount: number;
  readonly waitingCount: number;
  readonly reason?: string;
}

export interface AutomationPluginReviewProposalSummary {
  readonly total: number;
  readonly actionTypes: readonly string[];
  readonly proposalRefs: readonly string[];
}

export interface AutomationPluginReviewRecordSummary {
  readonly total: number;
  readonly byType: Readonly<Record<string, number>>;
  readonly byPhase: Readonly<Record<string, number>>;
  readonly byDecision: Readonly<Record<string, number>>;
  readonly lastRecordAt?: string;
}

export interface AutomationPluginReviewAuditSummary {
  readonly id: string;
  readonly fingerprint: string;
  readonly records: AutomationPluginReviewRecordSummary;
  readonly events: AutomationPluginReviewEventSummary;
  readonly actors: readonly AutomationPluginReviewActorMetadata[];
  readonly actions: readonly AutomationPluginReviewActionMetadata[];
}

export interface AutomationPluginReviewEventSummary {
  readonly total: number;
  readonly byType: Readonly<Record<string, number>>;
  readonly byOutcome: Readonly<Record<string, number>>;
  readonly byTypeAndOutcome: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly lastEventAt?: string;
}

export interface AutomationPluginReviewActorMetadata {
  readonly id: string;
  readonly actorId: typeof AUTOMATION_AUDIT_REDACTED;
  readonly actorFingerprint: string;
  readonly eventCount: number;
  readonly lastEventAt?: string;
}

export interface AutomationPluginReviewActionMetadata {
  readonly id: string;
  readonly actionType: string;
  readonly proposalId?: typeof AUTOMATION_AUDIT_REDACTED;
  readonly proposalFingerprint?: string;
  readonly eventCount: number;
  readonly recordCount: number;
}

interface AutomationPluginReviewArtifactBasis {
  readonly generatedAt: string;
  readonly pluginId?: string;
  readonly reviewLabel?: string;
  readonly status: AutomationPluginReviewOutcome;
  readonly approvalStatus: AutomationPluginReviewApprovalStatus;
  readonly summary: AutomationPluginReviewSummary;
  readonly gates: readonly AutomationPluginReviewGate[];
  readonly audit: AutomationPluginReviewAuditSummary;
}

interface AutomationPluginReviewGateBasis extends Omit<
  AutomationPluginReviewGate,
  "id" | "fingerprint"
> {}

interface AutomationPluginReviewAuditSummaryBasis extends Omit<
  AutomationPluginReviewAuditSummary,
  "id" | "fingerprint"
> {}

interface ActionDraft {
  actionType: string;
  proposalId?: string;
  eventCount: number;
  recordCount: number;
}

export function buildAutomationPluginReviewArtifact(
  input: AutomationPluginReviewArtifactInput = {},
): AutomationPluginReviewArtifact {
  const evaluations = (input.evaluations ?? []).map(cloneEvaluationResult);
  const gates = evaluations.map(summarizeClonedEvaluationGate);
  const auditRecords = [
    ...evaluations.flatMap((evaluation) => evaluation.auditRecords),
    ...(input.auditRecords ?? []),
  ].map(cloneRuleAuditRecord);
  const auditEvents = sortAutomationAuditEvents(input.auditEvents ?? []);
  const audit = summarizeAutomationPluginReviewAudit(auditEvents, auditRecords);
  const summary = summarizeReviewGates(gates, audit);
  const basis = optionalFields({
    generatedAt: resolveGeneratedAt(input.generatedAt, auditEvents, auditRecords),
    pluginId: normalizeOptionalString(input.pluginId, "pluginId"),
    reviewLabel: normalizeOptionalString(input.reviewLabel, "reviewLabel"),
    status: resolveArtifactOutcome(gates),
    approvalStatus: resolveArtifactApprovalStatus(gates),
    summary,
    gates,
    audit,
  });

  return materializeArtifact(basis);
}

export function summarizeAutomationEvaluationGate(
  result: AutomationEvaluationResult,
): AutomationPluginReviewGate {
  return summarizeClonedEvaluationGate(cloneEvaluationResult(result));
}

export function summarizeAutomationPluginReviewAudit(
  events: readonly AutomationDurableAuditEvent[] = [],
  records: readonly AutomationAuditRecord[] = [],
): AutomationPluginReviewAuditSummary {
  const sortedEvents = sortAutomationAuditEvents(events);
  const clonedRecords = records.map(cloneRuleAuditRecord).sort(compareRuleAuditRecords);
  const eventCounts = summarizeAutomationAuditEvents(sortedEvents);
  const recordSummary = summarizeRuleAuditRecords(clonedRecords);
  const basis: AutomationPluginReviewAuditSummaryBasis = {
    records: recordSummary,
    events: {
      total: eventCounts.total,
      byType: eventCounts.byType,
      byOutcome: eventCounts.byOutcome,
      byTypeAndOutcome: eventCounts.byTypeAndOutcome,
      ...optionalFields({ lastEventAt: lastAuditEventTimestamp(sortedEvents) }),
    },
    actors: summarizeActorMetadata(sortedEvents),
    actions: summarizeActionMetadata(sortedEvents, clonedRecords),
  };

  return materializeAuditSummary(basis);
}

export function cloneAutomationPluginReviewArtifact(
  artifact: AutomationPluginReviewArtifact,
): AutomationPluginReviewArtifact {
  const cloned = cloneJsonValue(artifact) as unknown as AutomationPluginReviewArtifact;
  const { id, fingerprint, ...basis } = cloned;
  const normalized = materializeArtifact(basis as AutomationPluginReviewArtifactBasis);
  if (id !== normalized.id) {
    throw new TypeError("review artifact id does not match its deterministic body");
  }
  if (fingerprint !== normalized.fingerprint) {
    throw new TypeError(
      "review artifact fingerprint does not match its deterministic body",
    );
  }
  return normalized;
}

export function serializeAutomationPluginReviewArtifact(
  artifact: AutomationPluginReviewArtifact,
): string {
  return canonicalJson(cloneAutomationPluginReviewArtifact(artifact));
}

export function fingerprintAutomationPluginReviewArtifact(
  artifact: AutomationPluginReviewArtifact,
): string {
  return cloneAutomationPluginReviewArtifact(artifact).fingerprint;
}

function summarizeClonedEvaluationGate(
  result: AutomationEvaluationResult,
): AutomationPluginReviewGate {
  const outcome = outcomeForEvaluation(result);
  const basis: AutomationPluginReviewGateBasis = optionalFields({
    outcome,
    approvalStatus: result.approval.status,
    evaluationStatus: result.status,
    ruleId: result.ruleId,
    eventId: result.eventId,
    reason: result.reason,
    trigger: summarizeTrigger(result.trigger),
    conditions: summarizeConditions(result.conditions),
    approval: summarizeApproval(result.approval),
    proposals: summarizeProposals(result.proposals),
    audit: summarizeRuleAuditRecords(result.auditRecords),
  });

  return materializeGate(basis);
}

function summarizeReviewGates(
  gates: readonly AutomationPluginReviewGate[],
  audit: AutomationPluginReviewAuditSummary,
): AutomationPluginReviewSummary {
  const counts = {
    totalGates: gates.length,
    approved: 0,
    skipped: 0,
    blocked: 0,
    proposed: 0,
    approvalRequired: 0,
    approvalRejected: 0,
    proposals: 0,
    auditEvents: audit.events.total,
    auditRecords: audit.records.total,
  };

  for (const gate of gates) {
    counts[gate.outcome] += 1;
    counts.proposals += gate.proposals.total;
    if (gate.approvalStatus === "required") {
      counts.approvalRequired += 1;
    }
    if (gate.approvalStatus === "rejected") {
      counts.approvalRejected += 1;
    }
  }

  return deepFreeze(counts);
}

function outcomeForEvaluation(
  result: AutomationEvaluationResult,
): AutomationPluginReviewOutcome {
  if (
    result.status === "approval_required" ||
    result.approval.status === "rejected" ||
    result.reason === "approval_rejected"
  ) {
    return "blocked";
  }
  if (result.status === "skipped") {
    return "skipped";
  }
  return result.proposals.length > 0 ? "proposed" : "approved";
}

function resolveArtifactOutcome(
  gates: readonly AutomationPluginReviewGate[],
): AutomationPluginReviewOutcome {
  if (gates.some((gate) => gate.outcome === "blocked")) {
    return "blocked";
  }
  if (gates.some((gate) => gate.outcome === "proposed")) {
    return "proposed";
  }
  if (gates.length > 0 && gates.every((gate) => gate.outcome === "skipped")) {
    return "skipped";
  }
  return "approved";
}

function resolveArtifactApprovalStatus(
  gates: readonly AutomationPluginReviewGate[],
): AutomationPluginReviewApprovalStatus {
  const statuses = new Set(gates.map((gate) => gate.approvalStatus));
  if (statuses.has("rejected")) {
    return "rejected";
  }
  if (statuses.has("required")) {
    return "required";
  }
  if (statuses.has("approved")) {
    return "approved";
  }
  if (statuses.size <= 1) {
    return "not_required";
  }
  return "mixed";
}

function summarizeTrigger(
  trigger: AutomationTriggerMatch,
): AutomationPluginReviewTriggerSummary {
  return deepFreeze(optionalFields({
    matched: requireBoolean(trigger.matched, "trigger.matched"),
    triggerType: normalizeRequiredString(trigger.triggerType, "trigger.triggerType"),
    eventType: normalizeRequiredString(trigger.eventType, "trigger.eventType"),
    reason: normalizeOptionalString(trigger.reason, "trigger.reason"),
  }));
}

function summarizeConditions(
  conditions: readonly AutomationConditionResult[],
): AutomationPluginReviewConditionSummary {
  let matched = 0;
  for (const condition of conditions) {
    if (condition.matched) {
      matched += 1;
    }
  }

  return deepFreeze({
    total: conditions.length,
    matched,
    skipped: conditions.length - matched,
  });
}

function summarizeApproval(
  approval: AutomationApprovalResult,
): AutomationPluginReviewApprovalSummary {
  const approvedCount = normalizeNonNegativeInteger(
    approval.approvedCount,
    "approval.approvedCount",
  );
  const requiredCount = normalizeNonNegativeInteger(
    approval.requiredCount,
    "approval.requiredCount",
  );

  return deepFreeze(optionalFields({
    status: requireApprovalStatus(approval.status, "approval.status"),
    required: requireBoolean(approval.required, "approval.required"),
    satisfied: requireBoolean(approval.satisfied, "approval.satisfied"),
    gateId: normalizeOptionalString(approval.gateId, "approval.gateId"),
    approvedCount,
    requiredCount,
    waitingCount: Math.max(requiredCount - approvedCount, 0),
    reason: normalizeOptionalString(approval.reason, "approval.reason"),
  }));
}

function summarizeProposals(
  proposals: readonly AutomationActionProposal[],
): AutomationPluginReviewProposalSummary {
  return deepFreeze({
    total: proposals.length,
    actionTypes: uniqueSorted(proposals.map((proposal) => proposal.actionType)),
    proposalRefs: uniqueSorted(proposals.map((proposal) => referenceFor("proposal", proposal.id))),
  });
}

function summarizeRuleAuditRecords(
  records: readonly AutomationAuditRecord[],
): AutomationPluginReviewRecordSummary {
  const byType: Record<string, number> = {};
  const byPhase: Record<string, number> = {};
  const byDecision: Record<string, number> = {};
  let lastRecordAt: string | undefined;

  for (const record of records) {
    byType[record.type] = (byType[record.type] ?? 0) + 1;
    byPhase[record.phase] = (byPhase[record.phase] ?? 0) + 1;
    byDecision[record.decision] = (byDecision[record.decision] ?? 0) + 1;
    if (lastRecordAt === undefined || compareTimestamps(record.timestamp, lastRecordAt) > 0) {
      lastRecordAt = record.timestamp;
    }
  }

  return deepFreeze(optionalFields({
    total: records.length,
    byType: sortNumberRecord(byType),
    byPhase: sortNumberRecord(byPhase),
    byDecision: sortNumberRecord(byDecision),
    lastRecordAt,
  }));
}

function summarizeActorMetadata(
  events: readonly AutomationDurableAuditEvent[],
): readonly AutomationPluginReviewActorMetadata[] {
  const drafts = new Map<string, { eventCount: number; lastEventAt?: string }>();

  for (const event of events) {
    const actorId = normalizeRequiredString(event.actorId, "event.actorId");
    const draft = drafts.get(actorId) ?? { eventCount: 0 };
    draft.eventCount += 1;
    if (
      draft.lastEventAt === undefined ||
      compareTimestamps(event.occurredAt, draft.lastEventAt) > 0
    ) {
      draft.lastEventAt = event.occurredAt;
    }
    drafts.set(actorId, draft);
  }

  return deepFreeze(
    [...drafts.entries()]
      .map(([actorId, draft]) => {
        const actorFingerprint = referenceFor("actor", actorId);
        return deepFreeze(optionalFields({
          id: `review_actor_${actorFingerprint.slice("actor:".length)}`,
          actorId: AUTOMATION_AUDIT_REDACTED,
          actorFingerprint,
          eventCount: draft.eventCount,
          lastEventAt: draft.lastEventAt,
        }));
      })
      .sort((left, right) => left.actorFingerprint.localeCompare(right.actorFingerprint)),
  );
}

function summarizeActionMetadata(
  events: readonly AutomationDurableAuditEvent[],
  records: readonly AutomationAuditRecord[],
): readonly AutomationPluginReviewActionMetadata[] {
  const drafts = new Map<string, ActionDraft>();

  for (const event of events) {
    const action = actionFromDurableAuditEvent(event);
    if (action) {
      const draft = getActionDraft(drafts, action.actionType, action.proposalId);
      draft.eventCount += 1;
    }
  }

  for (const record of records) {
    const action = actionFromRuleAuditRecord(record);
    if (action) {
      const draft = getActionDraft(drafts, action.actionType, action.proposalId);
      draft.recordCount += 1;
    }
  }

  return deepFreeze(
    [...drafts.values()]
      .map((draft) => {
        const key = actionKey(draft.actionType, draft.proposalId);
        return deepFreeze(optionalFields({
          id: `review_action_${stableHash(key)}`,
          actionType: draft.actionType,
          proposalId:
            draft.proposalId === undefined ? undefined : AUTOMATION_AUDIT_REDACTED,
          proposalFingerprint:
            draft.proposalId === undefined
              ? undefined
              : referenceFor("proposal", draft.proposalId),
          eventCount: draft.eventCount,
          recordCount: draft.recordCount,
        }));
      })
      .sort((left, right) =>
        left.actionType.localeCompare(right.actionType) ||
        (left.proposalFingerprint ?? "").localeCompare(right.proposalFingerprint ?? ""),
      ),
  );
}

function actionFromDurableAuditEvent(
  event: AutomationDurableAuditEvent,
): { actionType: string; proposalId?: string } | undefined {
  if (event.type !== "automation_execution_proposal") {
    return undefined;
  }

  const actionType = stringFromJson(event.details.actionType);
  if (actionType === undefined) {
    return undefined;
  }

  return {
    actionType,
    proposalId: stringFromJson(event.details.proposalId),
  };
}

function actionFromRuleAuditRecord(
  record: AutomationAuditRecord,
): { actionType: string; proposalId?: string } | undefined {
  if (record.phase !== "action") {
    return undefined;
  }

  const actionType = stringFromJson(record.metadata?.actionType);
  if (actionType === undefined) {
    return undefined;
  }

  return {
    actionType,
    proposalId: stringFromJson(record.metadata?.proposalId),
  };
}

function getActionDraft(
  drafts: Map<string, ActionDraft>,
  actionType: string,
  proposalId: string | undefined,
): ActionDraft {
  const key = actionKey(actionType, proposalId);
  const existing = drafts.get(key);
  if (existing) {
    return existing;
  }

  const draft: ActionDraft = {
    actionType,
    proposalId,
    eventCount: 0,
    recordCount: 0,
  };
  drafts.set(key, draft);
  return draft;
}

function actionKey(actionType: string, proposalId: string | undefined): string {
  return `${actionType}:${proposalId ?? ""}`;
}

function lastAuditEventTimestamp(
  events: readonly AutomationDurableAuditEvent[],
): string | undefined {
  return events.reduce<string | undefined>(
    (latest, event) =>
      latest === undefined || compareTimestamps(event.occurredAt, latest) > 0
        ? event.occurredAt
        : latest,
    undefined,
  );
}

function materializeArtifact(
  basis: AutomationPluginReviewArtifactBasis,
): AutomationPluginReviewArtifact {
  const normalized: AutomationPluginReviewArtifactBasis = deepFreeze({
    ...basis,
    gates: [...basis.gates].sort(compareGates),
  });
  const fingerprint = fingerprintBasis("automation-plugin-review-artifact", normalized);
  return deepFreeze({
    id: `automation_plugin_review_${fingerprint.slice("fnv1a64:".length)}`,
    fingerprint,
    ...normalized,
  });
}

function materializeGate(
  basis: AutomationPluginReviewGateBasis,
): AutomationPluginReviewGate {
  const normalized = deepFreeze({
    ...basis,
    proposals: deepFreeze({
      ...basis.proposals,
      actionTypes: [...basis.proposals.actionTypes].sort(),
      proposalRefs: [...basis.proposals.proposalRefs].sort(),
    }),
  });
  const fingerprint = fingerprintBasis("automation-plugin-review-gate", normalized);
  return deepFreeze({
    id: `review_gate_${fingerprint.slice("fnv1a64:".length)}`,
    fingerprint,
    ...normalized,
  });
}

function materializeAuditSummary(
  basis: AutomationPluginReviewAuditSummaryBasis,
): AutomationPluginReviewAuditSummary {
  const normalized = deepFreeze(basis);
  const fingerprint = fingerprintBasis("automation-plugin-review-audit", normalized);
  return deepFreeze({
    id: `review_audit_${fingerprint.slice("fnv1a64:".length)}`,
    fingerprint,
    ...normalized,
  });
}

function cloneEvaluationResult(
  result: AutomationEvaluationResult,
): AutomationEvaluationResult {
  return {
    status: requireEvaluationStatus(result.status, "status"),
    ruleId: normalizeRequiredString(result.ruleId, "ruleId"),
    eventId: normalizeOptionalString(result.eventId, "eventId"),
    reason: normalizeOptionalString(result.reason, "reason"),
    trigger: cloneTriggerMatch(result.trigger),
    conditions: result.conditions.map(cloneConditionResult),
    approval: cloneApprovalResult(result.approval),
    proposals: result.proposals.map(cloneActionProposal),
    auditRecords: result.auditRecords.map(cloneRuleAuditRecord),
  };
}

function cloneTriggerMatch(trigger: AutomationTriggerMatch): AutomationTriggerMatch {
  return optionalFields({
    matched: requireBoolean(trigger.matched, "trigger.matched"),
    triggerType: normalizeRequiredString(trigger.triggerType, "trigger.triggerType"),
    eventType: normalizeRequiredString(trigger.eventType, "trigger.eventType"),
    reason: normalizeOptionalString(trigger.reason, "trigger.reason"),
  });
}

function cloneConditionResult(
  condition: AutomationConditionResult,
): AutomationConditionResult {
  return optionalFields({
    matched: requireBoolean(condition.matched, "condition.matched"),
    path: normalizeRequiredString(condition.path, "condition.path"),
    operator: normalizeRequiredString(condition.operator, "condition.operator") as AutomationConditionResult["operator"],
    actual: condition.actual === undefined ? undefined : cloneJsonValue(condition.actual),
    expected:
      condition.expected === undefined ? undefined : cloneJsonValue(condition.expected),
    reason: normalizeOptionalString(condition.reason, "condition.reason"),
  });
}

function cloneApprovalResult(
  approval: AutomationApprovalResult,
): AutomationApprovalResult {
  return optionalFields({
    status: requireApprovalStatus(approval.status, "approval.status"),
    required: requireBoolean(approval.required, "approval.required"),
    satisfied: requireBoolean(approval.satisfied, "approval.satisfied"),
    gateId: normalizeOptionalString(approval.gateId, "approval.gateId"),
    reason: normalizeOptionalString(approval.reason, "approval.reason"),
    approvedCount: normalizeNonNegativeInteger(
      approval.approvedCount,
      "approval.approvedCount",
    ),
    requiredCount: normalizeNonNegativeInteger(
      approval.requiredCount,
      "approval.requiredCount",
    ),
  });
}

function cloneActionProposal(
  proposal: AutomationActionProposal,
): AutomationActionProposal {
  return optionalFields({
    id: normalizeRequiredString(proposal.id, "proposal.id"),
    ruleId: normalizeRequiredString(proposal.ruleId, "proposal.ruleId"),
    eventId: normalizeOptionalString(proposal.eventId, "proposal.eventId"),
    actionType: normalizeRequiredString(proposal.actionType, "proposal.actionType") as AutomationActionProposal["actionType"],
    actionIndex: normalizeNonNegativeInteger(proposal.actionIndex, "proposal.actionIndex"),
    mode: proposal.mode,
    summary: normalizeRequiredString(proposal.summary, "proposal.summary"),
    payload: cloneJsonObject(proposal.payload, "proposal.payload"),
    source: optionalFields({
      triggerType: normalizeRequiredString(
        proposal.source.triggerType,
        "proposal.source.triggerType",
      ),
      workspaceId: normalizeOptionalString(
        proposal.source.workspaceId,
        "proposal.source.workspaceId",
      ),
    }),
  });
}

function cloneRuleAuditRecord(record: AutomationAuditRecord): AutomationAuditRecord {
  return optionalFields({
    id: normalizeRequiredString(record.id, "auditRecord.id"),
    timestamp: normalizeTimestamp(record.timestamp, "auditRecord.timestamp"),
    type: normalizeRequiredString(record.type, "auditRecord.type") as AutomationAuditRecord["type"],
    phase: normalizeRequiredString(record.phase, "auditRecord.phase") as AutomationAuditRecord["phase"],
    ruleId: normalizeRequiredString(record.ruleId, "auditRecord.ruleId"),
    eventId: normalizeOptionalString(record.eventId, "auditRecord.eventId"),
    decision: normalizeRequiredString(record.decision, "auditRecord.decision") as AutomationAuditRecord["decision"],
    reason: normalizeOptionalString(record.reason, "auditRecord.reason"),
    metadata:
      record.metadata === undefined
        ? undefined
        : cloneJsonObject(record.metadata as JsonObject, "auditRecord.metadata"),
  });
}

function resolveGeneratedAt(
  input: Date | string | number | undefined,
  events: readonly AutomationDurableAuditEvent[],
  records: readonly AutomationAuditRecord[],
): string {
  if (input !== undefined) {
    return normalizeTimestamp(input, "generatedAt");
  }

  const timestamps = [
    ...events.map((event) => event.occurredAt),
    ...records.map((record) => record.timestamp),
  ];
  return timestamps.length === 0
    ? "1970-01-01T00:00:00.000Z"
    : timestamps.sort(compareTimestamps).at(-1) as string;
}

function compareGates(
  left: AutomationPluginReviewGate,
  right: AutomationPluginReviewGate,
): number {
  return (
    outcomeSortWeight(left.outcome) - outcomeSortWeight(right.outcome) ||
    left.ruleId.localeCompare(right.ruleId) ||
    (left.eventId ?? "").localeCompare(right.eventId ?? "") ||
    left.id.localeCompare(right.id)
  );
}

function compareRuleAuditRecords(
  left: AutomationAuditRecord,
  right: AutomationAuditRecord,
): number {
  return (
    left.timestamp.localeCompare(right.timestamp) ||
    left.type.localeCompare(right.type) ||
    left.phase.localeCompare(right.phase) ||
    left.id.localeCompare(right.id)
  );
}

function outcomeSortWeight(outcome: AutomationPluginReviewOutcome): number {
  return {
    blocked: 0,
    proposed: 1,
    skipped: 2,
    approved: 3,
  }[outcome];
}

function requireEvaluationStatus(
  value: unknown,
  path: string,
): AutomationEvaluationStatus {
  return requireOneOf(value, ["matched", "skipped", "approval_required"], path);
}

function requireApprovalStatus(
  value: unknown,
  path: string,
): AutomationApprovalStatus {
  return requireOneOf(value, ["not_required", "approved", "required", "rejected"], path);
}

function requireOneOf<TValue extends string>(
  value: unknown,
  allowed: readonly TValue[],
  path: string,
): TValue {
  if (typeof value !== "string" || !allowed.includes(value as TValue)) {
    throw new TypeError(`${path} must be one of ${allowed.join(", ")}`);
  }
  return value as TValue;
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(`${path} must be a boolean`);
  }
  return value;
}

function normalizeOptionalString(
  value: unknown,
  path: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return normalizeRequiredString(value, path);
}

function normalizeRequiredString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${path} must be a non-empty string`);
  }
  return value.trim();
}

function normalizeNonNegativeInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError(`${path} must be a non-negative safe integer`);
  }
  return value as number;
}

function normalizeTimestamp(value: Date | string | number, path: string): string {
  const date =
    value instanceof Date
      ? new Date(value.getTime())
      : typeof value === "number"
        ? new Date(value)
        : typeof value === "string"
          ? new Date(value)
          : undefined;

  if (!date || Number.isNaN(date.getTime())) {
    throw new TypeError(`${path} must be a valid timestamp`);
  }

  return date.toISOString();
}

function compareTimestamps(left: string, right: string): number {
  return normalizeTimestamp(left, "timestamp").localeCompare(
    normalizeTimestamp(right, "timestamp"),
  );
}

function stringFromJson(value: AutomationAuditJsonValue | JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function referenceFor(kind: string, value: string): string {
  return `${kind}:${stableHash(`${kind}:${value}`)}`;
}

function fingerprintBasis(kind: string, value: unknown): string {
  return `fnv1a64:${stableHash(`${kind}:${canonicalJson(value)}`)}`;
}

function stableHash(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }

  return hash.toString(16).padStart(16, "0");
}

function canonicalJson(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (!isPlainRecord(value)) {
    throw new TypeError("value must be JSON-compatible");
  }

  return `{${Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function cloneJsonObject(value: unknown, path: string): JsonObject {
  const cloned = cloneJsonValueAtPath(value, path, new WeakSet());
  if (!isPlainRecord(cloned)) {
    throw new TypeError(`${path} must be a JSON object`);
  }
  return cloned as JsonObject;
}

function cloneJsonValue(value: unknown): JsonValue {
  return cloneJsonValueAtPath(value, "value", new WeakSet());
}

function cloneJsonValueAtPath(
  value: unknown,
  path: string,
  seen: WeakSet<object>,
): JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${path} must contain only finite numbers`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new TypeError(`${path} must not contain circular references`);
    }
    seen.add(value);
    const cloned = value.map((item, index) =>
      cloneJsonValueAtPath(item, `${path}[${index}]`, seen),
    );
    seen.delete(value);
    return cloned;
  }
  if (isPlainRecord(value)) {
    if (seen.has(value)) {
      throw new TypeError(`${path} must not contain circular references`);
    }
    seen.add(value);
    const cloned: JsonObject = {};
    for (const key of Object.keys(value).sort()) {
      const nested = value[key];
      if (nested === undefined) {
        throw new TypeError(`${path}.${key} must be JSON-compatible`);
      }
      cloned[key] = cloneJsonValueAtPath(nested, `${path}.${key}`, seen);
    }
    seen.delete(value);
    return cloned;
  }

  throw new TypeError(`${path} must be JSON-compatible`);
}

function optionalFields<TValue extends Record<string, unknown>>(record: TValue): TValue {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as TValue;
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return deepFreeze([...new Set(values.map((value) => normalizeRequiredString(value, "value")))].sort());
}

function sortNumberRecord(record: Record<string, number>): Record<string, number> {
  const sorted: Record<string, number> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = record[key];
  }
  return sorted;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze<TValue>(value: TValue): TValue {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    return value;
  }
  if (Object.isFrozen(value)) {
    return value;
  }

  for (const key of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key]);
  }
  return Object.freeze(value);
}
