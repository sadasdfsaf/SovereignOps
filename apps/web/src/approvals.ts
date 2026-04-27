import type { WorkspaceId } from "./localStore.ts";

export const APPROVAL_REQUEST_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "expired",
] as const;

export type ApprovalRequestStatus =
  (typeof APPROVAL_REQUEST_STATUSES)[number];

export type ApprovalDecisionStatus = Extract<
  ApprovalRequestStatus,
  "approved" | "rejected"
>;

export const APPROVAL_RISK_LEVELS = ["low", "medium", "high"] as const;

export type ApprovalRiskLevel = (typeof APPROVAL_RISK_LEVELS)[number];

export interface ApprovalRequest {
  id: string;
  workspaceId: WorkspaceId;
  actionId: string;
  title: string;
  requestedBy: string;
  createdAt: string;
  reason: string;
  status: ApprovalRequestStatus;
  decidedBy?: string;
  decidedAt?: string;
  decisionReason?: string;
  riskLevel: ApprovalRiskLevel;
  requiredCapabilities: string[];
}

export interface ApprovalDecision {
  id: string;
  status: ApprovalDecisionStatus;
  decidedBy: string;
  decidedAt: string;
  decisionReason?: string;
}

export interface PendingApprovalListOptions {
  workspaceId?: WorkspaceId;
  actionId?: string;
  requestedBy?: string;
  riskLevel?: ApprovalRiskLevel;
  requiredCapability?: string;
}

export interface ApprovalExpiryOptions {
  staleAtOrBefore: string;
  expiredAt?: string;
  decisionReason?: string;
}

export type ApprovalStatusCounts = Record<ApprovalRequestStatus, number>;
export type ApprovalRiskCounts = Record<ApprovalRiskLevel, number>;
export type ApprovalStatusRiskCounts = Record<
  ApprovalRequestStatus,
  ApprovalRiskCounts
>;

export interface ApprovalSummary {
  total: number;
  byStatus: ApprovalStatusCounts;
  byRiskLevel: ApprovalRiskCounts;
  byStatusAndRiskLevel: ApprovalStatusRiskCounts;
}

export function listPendingApprovals(
  approvals: readonly ApprovalRequest[],
  options: PendingApprovalListOptions = {},
): ApprovalRequest[] {
  return approvals
    .filter((approval) => approval.status === "pending")
    .filter((approval) => matchesPendingOptions(approval, options))
    .slice()
    .sort(compareApprovalsChronologically)
    .map(cloneApproval);
}

export function decideApproval(
  approvals: readonly ApprovalRequest[],
  decision: ApprovalDecision,
): ApprovalRequest[] {
  assertDecisionStatus(decision.status);
  assertNonEmpty(decision.id, "id");
  assertNonEmpty(decision.decidedBy, "decidedBy");
  assertTimestamp(decision.decidedAt, "decidedAt");

  let found = false;
  const next = approvals.map((approval) => {
    if (approval.id !== decision.id) {
      return cloneApproval(approval);
    }

    found = true;
    if (approval.status !== "pending") {
      throw new Error("only pending approvals can be decided");
    }

    const decided: ApprovalRequest = {
      ...cloneApproval(approval),
      status: decision.status,
      decidedBy: decision.decidedBy,
      decidedAt: decision.decidedAt,
    };

    if (decision.decisionReason !== undefined) {
      decided.decisionReason = decision.decisionReason;
    } else {
      delete decided.decisionReason;
    }

    return decided;
  });

  if (!found) {
    throw new Error(`approval not found: ${decision.id}`);
  }

  return next;
}

export function expireStaleApprovals(
  approvals: readonly ApprovalRequest[],
  options: ApprovalExpiryOptions,
): ApprovalRequest[] {
  assertTimestamp(options.staleAtOrBefore, "staleAtOrBefore");
  const expiredAt = options.expiredAt ?? options.staleAtOrBefore;
  assertTimestamp(expiredAt, "expiredAt");

  return approvals.map((approval) => {
    const copy = cloneApproval(approval);
    if (
      approval.status !== "pending" ||
      compareTimestamps(approval.createdAt, options.staleAtOrBefore) > 0
    ) {
      return copy;
    }

    const expired: ApprovalRequest = {
      ...copy,
      status: "expired",
      decidedAt: expiredAt,
    };

    if (options.decisionReason !== undefined) {
      expired.decisionReason = options.decisionReason;
    } else {
      delete expired.decisionReason;
    }

    delete expired.decidedBy;
    return expired;
  });
}

export function summarizeApprovals(
  approvals: readonly ApprovalRequest[],
): ApprovalSummary {
  const byStatus = createStatusCounts();
  const byRiskLevel = createRiskCounts();
  const byStatusAndRiskLevel = createStatusRiskCounts();

  for (const approval of approvals) {
    assertRequestStatus(approval.status);
    assertRiskLevel(approval.riskLevel);

    byStatus[approval.status] += 1;
    byRiskLevel[approval.riskLevel] += 1;
    byStatusAndRiskLevel[approval.status][approval.riskLevel] += 1;
  }

  return {
    total: approvals.length,
    byStatus,
    byRiskLevel,
    byStatusAndRiskLevel,
  };
}

export function isApprovalRequestStatus(
  value: unknown,
): value is ApprovalRequestStatus {
  return isOneOf(value, APPROVAL_REQUEST_STATUSES);
}

export function isApprovalRiskLevel(value: unknown): value is ApprovalRiskLevel {
  return isOneOf(value, APPROVAL_RISK_LEVELS);
}

function matchesPendingOptions(
  approval: ApprovalRequest,
  options: PendingApprovalListOptions,
): boolean {
  return (
    (options.workspaceId === undefined ||
      approval.workspaceId === options.workspaceId) &&
    (options.actionId === undefined || approval.actionId === options.actionId) &&
    (options.requestedBy === undefined ||
      approval.requestedBy === options.requestedBy) &&
    (options.riskLevel === undefined ||
      approval.riskLevel === options.riskLevel) &&
    (options.requiredCapability === undefined ||
      approval.requiredCapabilities.includes(options.requiredCapability))
  );
}

function compareApprovalsChronologically(
  left: ApprovalRequest,
  right: ApprovalRequest,
): number {
  return (
    compareTimestamps(left.createdAt, right.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

function createStatusCounts(): ApprovalStatusCounts {
  return {
    pending: 0,
    approved: 0,
    rejected: 0,
    expired: 0,
  };
}

function createRiskCounts(): ApprovalRiskCounts {
  return {
    low: 0,
    medium: 0,
    high: 0,
  };
}

function createStatusRiskCounts(): ApprovalStatusRiskCounts {
  return {
    pending: createRiskCounts(),
    approved: createRiskCounts(),
    rejected: createRiskCounts(),
    expired: createRiskCounts(),
  };
}

function cloneApproval(approval: ApprovalRequest): ApprovalRequest {
  return {
    ...approval,
    requiredCapabilities: [...approval.requiredCapabilities],
  };
}

function assertRequestStatus(
  status: ApprovalRequestStatus,
): asserts status is ApprovalRequestStatus {
  if (!isApprovalRequestStatus(status)) {
    throw new Error("approval status is not supported");
  }
}

function assertDecisionStatus(
  status: ApprovalDecisionStatus,
): asserts status is ApprovalDecisionStatus {
  if (status !== "approved" && status !== "rejected") {
    throw new Error("decision status must be approved or rejected");
  }
}

function assertRiskLevel(
  riskLevel: ApprovalRiskLevel,
): asserts riskLevel is ApprovalRiskLevel {
  if (!isApprovalRiskLevel(riskLevel)) {
    throw new Error("approval risk level is not supported");
  }
}

function assertNonEmpty(value: string, name: string): void {
  if (value.trim() === "") {
    throw new Error(`${name} is required`);
  }
}

function assertTimestamp(value: string, name: string): void {
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${name} must be a valid timestamp`);
  }
}

function compareTimestamps(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
    throw new Error("timestamps must be valid");
  }

  return leftTime - rightTime || left.localeCompare(right);
}

function isOneOf<TValue extends string>(
  value: unknown,
  allowed: readonly TValue[],
): value is TValue {
  return typeof value === "string" && allowed.includes(value as TValue);
}
