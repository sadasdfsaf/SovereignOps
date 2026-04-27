export type AutomationAuditJsonPrimitive = string | number | boolean | null;
export type AutomationAuditJsonValue =
  | AutomationAuditJsonPrimitive
  | AutomationAuditJsonValue[]
  | { [key: string]: AutomationAuditJsonValue };
export type AutomationAuditJsonObject = { [key: string]: AutomationAuditJsonValue };

export const AUTOMATION_AUDIT_REDACTED = "[REDACTED]";

export const AUTOMATION_AUDIT_EVENT_TYPES = [
  "automation_rule_change",
  "automation_permission_grant",
  "automation_permission_revoke",
  "automation_preview_run",
  "automation_execution_proposal",
] as const;

export type AutomationAuditEventType =
  (typeof AUTOMATION_AUDIT_EVENT_TYPES)[number];

export const AUTOMATION_RULE_CHANGE_OUTCOMES = [
  "created",
  "updated",
  "deleted",
  "enabled",
  "disabled",
] as const;

export type AutomationRuleChangeOutcome =
  (typeof AUTOMATION_RULE_CHANGE_OUTCOMES)[number];

export const AUTOMATION_PREVIEW_RUN_OUTCOMES = [
  "matched",
  "skipped",
  "failed",
] as const;

export type AutomationPreviewRunOutcome =
  (typeof AUTOMATION_PREVIEW_RUN_OUTCOMES)[number];

export const AUTOMATION_EXECUTION_PROPOSAL_OUTCOMES = [
  "proposed",
  "accepted",
  "rejected",
  "failed",
] as const;

export type AutomationExecutionProposalOutcome =
  (typeof AUTOMATION_EXECUTION_PROPOSAL_OUTCOMES)[number];

export type AutomationPermissionOutcome = "granted" | "revoked";

export type AutomationAuditOutcome =
  | AutomationRuleChangeOutcome
  | AutomationPermissionOutcome
  | AutomationPreviewRunOutcome
  | AutomationExecutionProposalOutcome;

export type AutomationAuditTimestampInput = Date | string | number;

export interface AutomationAuditTarget {
  type: "rule" | "permission" | "preview_run" | "execution_proposal";
  id: string;
}

export interface AutomationAuditEvent {
  id: string;
  fingerprint: string;
  type: AutomationAuditEventType;
  outcome: AutomationAuditOutcome;
  occurredAt: string;
  actorId: string;
  workspaceId?: string;
  correlationId?: string;
  target: AutomationAuditTarget;
  details: AutomationAuditJsonObject;
  metadata?: AutomationAuditJsonObject;
}

export interface AutomationAuditBaseInput {
  occurredAt: AutomationAuditTimestampInput;
  actorId: string;
  workspaceId?: string;
  correlationId?: string;
  metadata?: AutomationAuditJsonObject;
}

export interface RuleChangeAutomationAuditInput extends AutomationAuditBaseInput {
  ruleId: string;
  changeType: AutomationRuleChangeOutcome;
  before?: AutomationAuditJsonObject | null;
  after?: AutomationAuditJsonObject | null;
  reason?: string;
}

export interface PermissionAutomationAuditInput extends AutomationAuditBaseInput {
  subjectActorId: string;
  permission: string;
  scope?: AutomationAuditJsonObject;
  reason?: string;
}

export interface PreviewRunAutomationAuditInput extends AutomationAuditBaseInput {
  ruleId: string;
  previewRunId?: string;
  outcome: AutomationPreviewRunOutcome;
  input?: AutomationAuditJsonObject;
  result?: AutomationAuditJsonObject;
  reason?: string;
}

export interface ExecutionProposalAutomationAuditInput extends AutomationAuditBaseInput {
  proposalId: string;
  ruleId: string;
  actionType: string;
  outcome?: AutomationExecutionProposalOutcome;
  payload?: AutomationAuditJsonObject;
  reason?: string;
}

export interface AutomationAuditSummary {
  total: number;
  byType: Record<string, number>;
  byOutcome: Record<string, number>;
  byTypeAndOutcome: Record<string, Record<string, number>>;
}

interface AutomationAuditMaterial {
  type: AutomationAuditEventType;
  outcome: AutomationAuditOutcome;
  occurredAt: string;
  actorId: string;
  workspaceId?: string;
  correlationId?: string;
  target: AutomationAuditTarget;
  details: AutomationAuditJsonObject;
  metadata?: AutomationAuditJsonObject;
}

const SECRET_FIELD_PARTS = [
  "apikey",
  "authorization",
  "authtoken",
  "accesstoken",
  "refreshtoken",
  "password",
  "passwd",
  "secret",
  "privatekey",
  "clientsecret",
  "credential",
  "sessioncookie",
  "cookie",
  "token",
];

const SECRET_VALUE_PATTERNS = [
  /^bearer\s+[a-z0-9._~+/=-]+$/i,
  /^basic\s+[a-z0-9+/=-]+$/i,
  /^sk-[a-z0-9_-]{16,}$/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

export function createRuleChangeAuditEvent(
  input: RuleChangeAutomationAuditInput,
): AutomationAuditEvent {
  const value = requireRecord(input, "rule change audit input");
  const changeType = requireOneOf(
    value.changeType,
    AUTOMATION_RULE_CHANGE_OUTCOMES,
    "changeType",
  );
  const details = normalizeJsonObject(
    omitUndefined({
      changeType,
      before: value.before,
      after: value.after,
      reason: optionalString(value.reason, "reason"),
    }),
    "details",
  );

  return materializeAuditEvent({
    ...baseMaterial(value),
    type: "automation_rule_change",
    outcome: changeType,
    target: {
      type: "rule",
      id: requireNonEmptyString(value.ruleId, "ruleId"),
    },
    details,
  });
}

export function createPermissionGrantAuditEvent(
  input: PermissionAutomationAuditInput,
): AutomationAuditEvent {
  return createPermissionAuditEvent(input, "automation_permission_grant", "granted");
}

export function createPermissionRevokeAuditEvent(
  input: PermissionAutomationAuditInput,
): AutomationAuditEvent {
  return createPermissionAuditEvent(input, "automation_permission_revoke", "revoked");
}

export function createPreviewRunAuditEvent(
  input: PreviewRunAutomationAuditInput,
): AutomationAuditEvent {
  const value = requireRecord(input, "preview run audit input");
  const outcome = requireOneOf(
    value.outcome,
    AUTOMATION_PREVIEW_RUN_OUTCOMES,
    "outcome",
  );
  const ruleId = requireNonEmptyString(value.ruleId, "ruleId");
  const previewRunId = optionalString(value.previewRunId, "previewRunId");
  const details = normalizeJsonObject(
    omitUndefined({
      ruleId,
      input: value.input,
      result: value.result,
      reason: optionalString(value.reason, "reason"),
    }),
    "details",
  );

  return materializeAuditEvent({
    ...baseMaterial(value),
    type: "automation_preview_run",
    outcome,
    target: {
      type: "preview_run",
      id: previewRunId ?? `${ruleId}:preview`,
    },
    details,
  });
}

export function createExecutionProposalAuditEvent(
  input: ExecutionProposalAutomationAuditInput,
): AutomationAuditEvent {
  const value = requireRecord(input, "execution proposal audit input");
  const outcome =
    value.outcome === undefined
      ? "proposed"
      : requireOneOf(
          value.outcome,
          AUTOMATION_EXECUTION_PROPOSAL_OUTCOMES,
          "outcome",
        );
  const proposalId = requireNonEmptyString(value.proposalId, "proposalId");
  const ruleId = requireNonEmptyString(value.ruleId, "ruleId");
  const details = normalizeJsonObject(
    omitUndefined({
      proposalId,
      ruleId,
      actionType: requireNonEmptyString(value.actionType, "actionType"),
      payload: value.payload,
      reason: optionalString(value.reason, "reason"),
    }),
    "details",
  );

  return materializeAuditEvent({
    ...baseMaterial(value),
    type: "automation_execution_proposal",
    outcome,
    target: {
      type: "execution_proposal",
      id: proposalId,
    },
    details,
  });
}

export function normalizeAutomationAuditTimestamp(
  value: AutomationAuditTimestampInput,
): string {
  const date =
    value instanceof Date
      ? new Date(value.getTime())
      : typeof value === "number"
        ? new Date(value)
        : typeof value === "string"
          ? new Date(value)
          : undefined;

  if (!date || Number.isNaN(date.getTime())) {
    throw new TypeError("occurredAt must be a valid timestamp");
  }

  return date.toISOString();
}

export function redactAutomationAuditValue(
  value: unknown,
): AutomationAuditJsonValue {
  return normalizeJsonValue(value, "value", new WeakSet());
}

export function cloneAutomationAuditEvent(
  event: AutomationAuditEvent,
): AutomationAuditEvent {
  const value = requireRecord(event, "audit event");
  const type = requireOneOf(value.type, AUTOMATION_AUDIT_EVENT_TYPES, "type");
  const outcome = requireNonEmptyString(value.outcome, "outcome") as AutomationAuditOutcome;
  const target = normalizeTarget(value.target);
  const material: AutomationAuditMaterial = {
    type,
    outcome,
    occurredAt: normalizeAutomationAuditTimestamp(
      value.occurredAt as AutomationAuditTimestampInput,
    ),
    actorId: requireNonEmptyString(value.actorId, "actorId"),
    target,
    details: normalizeJsonObject(value.details ?? {}, "details"),
  };
  const workspaceId = optionalString(value.workspaceId, "workspaceId");
  const correlationId = optionalString(value.correlationId, "correlationId");
  const metadata =
    value.metadata === undefined
      ? undefined
      : normalizeJsonObject(value.metadata, "metadata");

  if (workspaceId !== undefined) {
    material.workspaceId = workspaceId;
  }
  if (correlationId !== undefined) {
    material.correlationId = correlationId;
  }
  if (metadata !== undefined) {
    material.metadata = metadata;
  }

  const normalized = materializeAuditEvent(material);
  if (value.id !== normalized.id) {
    throw new TypeError("audit event id does not match its deterministic body");
  }
  if (value.fingerprint !== normalized.fingerprint) {
    throw new TypeError(
      "audit event fingerprint does not match its deterministic body",
    );
  }

  return normalized;
}

export function serializeAutomationAuditEvent(event: AutomationAuditEvent): string {
  return canonicalJson(cloneAutomationAuditEvent(event));
}

export function fingerprintAutomationAuditEvent(
  event: AutomationAuditEvent,
): string {
  return cloneAutomationAuditEvent(event).fingerprint;
}

export function sortAutomationAuditEvents(
  events: readonly AutomationAuditEvent[],
): AutomationAuditEvent[] {
  if (!Array.isArray(events)) {
    throw new TypeError("events must be an array");
  }

  const sorted = events.map(cloneAutomationAuditEvent).sort(compareAuditEvents);
  return deepFreeze(sorted) as AutomationAuditEvent[];
}

export function summarizeAutomationAuditEvents(
  events: readonly AutomationAuditEvent[],
): AutomationAuditSummary {
  const sorted = sortAutomationAuditEvents(events);
  const byType: Record<string, number> = {};
  const byOutcome: Record<string, number> = {};
  const byTypeAndOutcome: Record<string, Record<string, number>> = {};

  for (const event of sorted) {
    byType[event.type] = (byType[event.type] ?? 0) + 1;
    byOutcome[event.outcome] = (byOutcome[event.outcome] ?? 0) + 1;
    byTypeAndOutcome[event.type] ??= {};
    byTypeAndOutcome[event.type][event.outcome] =
      (byTypeAndOutcome[event.type][event.outcome] ?? 0) + 1;
  }

  return deepFreeze({
    total: sorted.length,
    byType: sortNumberRecord(byType),
    byOutcome: sortNumberRecord(byOutcome),
    byTypeAndOutcome: sortNestedNumberRecord(byTypeAndOutcome),
  }) as AutomationAuditSummary;
}

function createPermissionAuditEvent(
  input: PermissionAutomationAuditInput,
  type: "automation_permission_grant" | "automation_permission_revoke",
  outcome: AutomationPermissionOutcome,
): AutomationAuditEvent {
  const value = requireRecord(input, "permission audit input");
  const subjectActorId = requireNonEmptyString(
    value.subjectActorId,
    "subjectActorId",
  );
  const permission = requireNonEmptyString(value.permission, "permission");
  const details = normalizeJsonObject(
    omitUndefined({
      subjectActorId,
      permission,
      scope: value.scope,
      reason: optionalString(value.reason, "reason"),
    }),
    "details",
  );

  return materializeAuditEvent({
    ...baseMaterial(value),
    type,
    outcome,
    target: {
      type: "permission",
      id: `${subjectActorId}:${permission}`,
    },
    details,
  });
}

function baseMaterial(value: Record<string, unknown>): Omit<
  AutomationAuditMaterial,
  "type" | "outcome" | "target" | "details"
> {
  const material: Omit<
    AutomationAuditMaterial,
    "type" | "outcome" | "target" | "details"
  > = {
    occurredAt: normalizeAutomationAuditTimestamp(
      value.occurredAt as AutomationAuditTimestampInput,
    ),
    actorId: requireNonEmptyString(value.actorId, "actorId"),
  };
  const workspaceId = optionalString(value.workspaceId, "workspaceId");
  const correlationId = optionalString(value.correlationId, "correlationId");
  const metadata =
    value.metadata === undefined
      ? undefined
      : normalizeJsonObject(value.metadata, "metadata");

  if (workspaceId !== undefined) {
    material.workspaceId = workspaceId;
  }
  if (correlationId !== undefined) {
    material.correlationId = correlationId;
  }
  if (metadata !== undefined) {
    material.metadata = metadata;
  }

  return material;
}

function materializeAuditEvent(material: AutomationAuditMaterial): AutomationAuditEvent {
  const normalized = normalizeMaterial(material);
  const fingerprint = `audit:${stableHash(canonicalJson(normalized))}`;
  const id = `audit_${sanitizeIdPart(normalized.type)}_${fingerprint.slice(6)}`;

  return deepFreeze({
    id,
    fingerprint,
    ...normalized,
  }) as AutomationAuditEvent;
}

function normalizeMaterial(material: AutomationAuditMaterial): AutomationAuditMaterial {
  const normalized: AutomationAuditMaterial = {
    type: requireOneOf(material.type, AUTOMATION_AUDIT_EVENT_TYPES, "type"),
    outcome: requireNonEmptyString(material.outcome, "outcome") as AutomationAuditOutcome,
    occurredAt: normalizeAutomationAuditTimestamp(material.occurredAt),
    actorId: requireNonEmptyString(material.actorId, "actorId"),
    target: normalizeTarget(material.target),
    details: normalizeJsonObject(material.details, "details"),
  };
  const workspaceId = optionalString(material.workspaceId, "workspaceId");
  const correlationId = optionalString(material.correlationId, "correlationId");
  const metadata =
    material.metadata === undefined
      ? undefined
      : normalizeJsonObject(material.metadata, "metadata");

  if (workspaceId !== undefined) {
    normalized.workspaceId = workspaceId;
  }
  if (correlationId !== undefined) {
    normalized.correlationId = correlationId;
  }
  if (metadata !== undefined) {
    normalized.metadata = metadata;
  }

  return normalized;
}

function normalizeTarget(value: unknown): AutomationAuditTarget {
  const target = requireRecord(value, "target");
  return {
    type: requireOneOf(
      target.type,
      ["rule", "permission", "preview_run", "execution_proposal"] as const,
      "target.type",
    ),
    id: requireNonEmptyString(target.id, "target.id"),
  };
}

function compareAuditEvents(
  left: AutomationAuditEvent,
  right: AutomationAuditEvent,
): number {
  return (
    left.occurredAt.localeCompare(right.occurredAt) ||
    left.type.localeCompare(right.type) ||
    left.outcome.localeCompare(right.outcome) ||
    left.id.localeCompare(right.id)
  );
}

function normalizeJsonObject(value: unknown, path: string): AutomationAuditJsonObject {
  const normalized = normalizeJsonValue(value, path, new WeakSet());
  if (!isPlainRecord(normalized)) {
    throw new TypeError(`${path} must be a JSON object`);
  }
  return normalized as AutomationAuditJsonObject;
}

function normalizeJsonValue(
  value: unknown,
  path: string,
  seen: WeakSet<object>,
  key?: string,
): AutomationAuditJsonValue {
  if (key !== undefined && isSecretFieldName(key)) {
    return AUTOMATION_AUDIT_REDACTED;
  }
  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return isSecretString(value) ? AUTOMATION_AUDIT_REDACTED : value;
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
    const normalized = value.map((item, index) =>
      normalizeJsonValue(item, `${path}[${index}]`, seen),
    );
    seen.delete(value);
    return normalized;
  }
  if (isPlainRecord(value)) {
    if (seen.has(value)) {
      throw new TypeError(`${path} must not contain circular references`);
    }
    seen.add(value);
    const normalized: AutomationAuditJsonObject = {};
    for (const entryKey of Object.keys(value).sort()) {
      const entryValue = value[entryKey];
      if (entryValue === undefined) {
        throw new TypeError(`${path}.${entryKey} must be JSON-compatible`);
      }
      normalized[entryKey] = normalizeJsonValue(
        entryValue,
        `${path}.${entryKey}`,
        seen,
        entryKey,
      );
    }
    seen.delete(value);
    return normalized;
  }

  throw new TypeError(`${path} must be JSON-compatible`);
}

function isSecretFieldName(key: string): boolean {
  const compact = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return SECRET_FIELD_PARTS.some(
    (part) =>
      compact === part ||
      compact.endsWith(part) ||
      (part.length > 6 && compact.includes(part)),
  );
}

function isSecretString(value: string): boolean {
  return SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value.trim()));
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requireNonEmptyString(value, path);
}

function requireNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${path} must be a non-empty string`);
  }
  return value.trim();
}

function requireOneOf<TValue extends string>(
  value: unknown,
  allowedValues: readonly TValue[],
  path: string,
): TValue {
  if (typeof value !== "string" || !allowedValues.includes(value as TValue)) {
    throw new TypeError(`${path} must be one of ${allowedValues.join(", ")}`);
  }
  return value as TValue;
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isPlainRecord(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function omitUndefined(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const compact: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) {
      compact[key] = value;
    }
  }
  return compact;
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
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
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

function sanitizeIdPart(value: string): string {
  const sanitized = value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return sanitized.length > 0 ? sanitized : "event";
}

function sortNumberRecord(record: Record<string, number>): Record<string, number> {
  const sorted: Record<string, number> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = record[key];
  }
  return sorted;
}

function sortNestedNumberRecord(
  record: Record<string, Record<string, number>>,
): Record<string, Record<string, number>> {
  const sorted: Record<string, Record<string, number>> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = sortNumberRecord(record[key]);
  }
  return sorted;
}

function deepFreeze<TValue>(value: TValue): TValue {
  if (typeof value !== "object" || value === null) {
    return value;
  }

  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }

  return value;
}
