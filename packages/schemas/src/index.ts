export type IdentifierPrefix =
  | "wsp"
  | "act"
  | "dev"
  | "obj"
  | "key"
  | "doc"
  | "prj"
  | "inc"
  | "cmt"
  | "att"
  | "apv";

export const RISK_LEVELS = ["low", "medium", "high"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const DOC_STATUSES = ["draft", "review", "active", "archived"] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

export const PROJECT_STATUSES = ["planned", "active", "paused", "completed", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const INCIDENT_STATUSES = ["open", "triaged", "resolved", "closed"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const COMMENT_STATUSES = ["open", "resolved", "deleted"] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];

export const ATTACHMENT_STATUSES = ["pending", "ready", "failed", "deleted"] as const;
export type AttachmentStatus = (typeof ATTACHMENT_STATUSES)[number];

export const APPROVAL_STATUSES = ["requested", "approved", "rejected", "cancelled"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export type SchemaKind = "docs" | "projects" | "incidents" | "comments" | "attachments" | "approvals";

export interface WorkspaceRef {
  id: `${"wsp"}_${string}`;
  displayName: string;
}

export interface AgentActionPreview {
  id: `${"obj"}_${string}`;
  workspaceId: WorkspaceRef["id"];
  actorId: `${"act"}_${string}`;
  capability: "read_object" | "write_object" | "propose_agent_action" | "manage_plugin" | "sync_bundle";
  risk: RiskLevel;
  summary: string;
}

export interface AuditEntry {
  workspaceId: WorkspaceRef["id"];
  actorId: `${"act"}_${string}`;
  action: string;
  decision: "allow" | "require_approval" | "deny";
  redactedPaths: string[];
  recordedAt: string;
}

export interface DocRecord {
  id: `${"doc"}_${string}`;
  workspaceId: WorkspaceRef["id"];
  projectId?: `${"prj"}_${string}`;
  title: string;
  body?: string;
  status: DocStatus;
  risk: RiskLevel;
  ownerActorId: `${"act"}_${string}`;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRecord {
  id: `${"prj"}_${string}`;
  workspaceId: WorkspaceRef["id"];
  name: string;
  status: ProjectStatus;
  risk: RiskLevel;
  ownerActorId: `${"act"}_${string}`;
  createdAt: string;
  updatedAt: string;
}

export interface IncidentRecord {
  id: `${"inc"}_${string}`;
  workspaceId: WorkspaceRef["id"];
  projectId?: `${"prj"}_${string}`;
  title: string;
  summary?: string;
  status: IncidentStatus;
  risk: RiskLevel;
  reportedByActorId: `${"act"}_${string}`;
  createdAt: string;
  updatedAt: string;
}

export type SovereignRecordId =
  | DocRecord["id"]
  | ProjectRecord["id"]
  | IncidentRecord["id"]
  | `${"cmt"}_${string}`
  | `${"att"}_${string}`
  | `${"apv"}_${string}`
  | AgentActionPreview["id"];

export interface CommentRecord {
  id: `${"cmt"}_${string}`;
  workspaceId: WorkspaceRef["id"];
  targetId: SovereignRecordId;
  body: string;
  status: CommentStatus;
  risk: RiskLevel;
  authorActorId: `${"act"}_${string}`;
  createdAt: string;
  updatedAt: string;
}

export interface AttachmentRecord {
  id: `${"att"}_${string}`;
  workspaceId: WorkspaceRef["id"];
  targetId: SovereignRecordId;
  filename: string;
  contentType: string;
  byteSize: number;
  status: AttachmentStatus;
  risk: RiskLevel;
  uploadedByActorId: `${"act"}_${string}`;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalRecord {
  id: `${"apv"}_${string}`;
  workspaceId: WorkspaceRef["id"];
  targetId: SovereignRecordId;
  summary: string;
  status: ApprovalStatus;
  risk: RiskLevel;
  requestedByActorId: `${"act"}_${string}`;
  approverActorId?: `${"act"}_${string}`;
  createdAt: string;
  updatedAt: string;
}

export interface SovereignRecordByKind {
  docs: DocRecord;
  projects: ProjectRecord;
  incidents: IncidentRecord;
  comments: CommentRecord;
  attachments: AttachmentRecord;
  approvals: ApprovalRecord;
}

export type SovereignRecord = SovereignRecordByKind[SchemaKind];

export interface SchemaDefinition<TStatus extends string = string> {
  kind: SchemaKind;
  idPrefix: IdentifierPrefix;
  statuses: readonly TStatus[];
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult<TRecord = unknown> {
  ok: boolean;
  issues: ValidationIssue[];
  value?: TRecord;
}

export const schemaDefinitions = {
  docs: {
    kind: "docs",
    idPrefix: "doc",
    statuses: DOC_STATUSES,
  },
  projects: {
    kind: "projects",
    idPrefix: "prj",
    statuses: PROJECT_STATUSES,
  },
  incidents: {
    kind: "incidents",
    idPrefix: "inc",
    statuses: INCIDENT_STATUSES,
  },
  comments: {
    kind: "comments",
    idPrefix: "cmt",
    statuses: COMMENT_STATUSES,
  },
  attachments: {
    kind: "attachments",
    idPrefix: "att",
    statuses: ATTACHMENT_STATUSES,
  },
  approvals: {
    kind: "approvals",
    idPrefix: "apv",
    statuses: APPROVAL_STATUSES,
  },
} as const satisfies Record<SchemaKind, SchemaDefinition>;

const TARGET_ID_PREFIXES: readonly IdentifierPrefix[] = ["doc", "prj", "inc", "cmt", "att", "apv", "obj"];

export function isSovereignId(value: string, prefix: IdentifierPrefix): boolean {
  return new RegExp(`^${prefix}_[A-Za-z0-9_-]{1,88}$`).test(value);
}

export function isRiskLevel(value: unknown): value is RiskLevel {
  return isOneOf(value, RISK_LEVELS);
}

export function isSchemaKind(value: unknown): value is SchemaKind {
  return typeof value === "string" && value in schemaDefinitions;
}

export function isStatusForKind<K extends SchemaKind>(
  kind: K,
  value: unknown,
): value is SovereignRecordByKind[K]["status"] {
  return isOneOf(value, schemaDefinitions[kind].statuses);
}

export function isSovereignRecordId(value: unknown): value is SovereignRecordId {
  return (
    typeof value === "string" &&
    TARGET_ID_PREFIXES.some((prefix) => isSovereignId(value, prefix))
  );
}

export function validateSovereignRecord<K extends SchemaKind>(
  kind: K,
  value: unknown,
): ValidationResult<SovereignRecordByKind[K]> {
  const schema = schemaDefinitions[kind];
  const issues: ValidationIssue[] = [];

  if (!schema) {
    return {
      ok: false,
      issues: [{ path: "kind", message: "schema kind is not supported" }],
    };
  }

  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [{ path: "$", message: "record must be an object" }],
    };
  }

  requireId(value, "id", schema.idPrefix, issues);
  requireId(value, "workspaceId", "wsp", issues);
  requireStatus(kind, value, issues);
  requireRisk(value, issues);
  requireNonEmptyString(value, "createdAt", issues);
  requireNonEmptyString(value, "updatedAt", issues);

  switch (kind) {
    case "docs":
      requireNonEmptyString(value, "title", issues);
      requireId(value, "ownerActorId", "act", issues);
      optionalId(value, "projectId", "prj", issues);
      optionalNonEmptyString(value, "body", issues);
      break;
    case "projects":
      requireNonEmptyString(value, "name", issues);
      requireId(value, "ownerActorId", "act", issues);
      break;
    case "incidents":
      requireNonEmptyString(value, "title", issues);
      requireId(value, "reportedByActorId", "act", issues);
      optionalId(value, "projectId", "prj", issues);
      optionalNonEmptyString(value, "summary", issues);
      break;
    case "comments":
      requireTargetId(value, "targetId", issues);
      requireNonEmptyString(value, "body", issues);
      requireId(value, "authorActorId", "act", issues);
      break;
    case "attachments":
      requireTargetId(value, "targetId", issues);
      requireNonEmptyString(value, "filename", issues);
      requireNonEmptyString(value, "contentType", issues);
      requireNonNegativeInteger(value, "byteSize", issues);
      requireId(value, "uploadedByActorId", "act", issues);
      break;
    case "approvals":
      requireTargetId(value, "targetId", issues);
      requireNonEmptyString(value, "summary", issues);
      requireId(value, "requestedByActorId", "act", issues);
      optionalId(value, "approverActorId", "act", issues);
      break;
  }

  return issues.length === 0
    ? { ok: true, issues, value: value as SovereignRecordByKind[K] }
    : { ok: false, issues };
}

export function assertSovereignRecord<K extends SchemaKind>(
  kind: K,
  value: unknown,
): asserts value is SovereignRecordByKind[K] {
  const result = validateSovereignRecord(kind, value);
  if (!result.ok) {
    throw new Error(formatValidationIssues(kind, result.issues));
  }
}

export function validateDoc(value: unknown): ValidationResult<DocRecord> {
  return validateSovereignRecord("docs", value);
}

export function validateProject(value: unknown): ValidationResult<ProjectRecord> {
  return validateSovereignRecord("projects", value);
}

export function validateIncident(value: unknown): ValidationResult<IncidentRecord> {
  return validateSovereignRecord("incidents", value);
}

export function validateComment(value: unknown): ValidationResult<CommentRecord> {
  return validateSovereignRecord("comments", value);
}

export function validateAttachment(value: unknown): ValidationResult<AttachmentRecord> {
  return validateSovereignRecord("attachments", value);
}

export function validateApproval(value: unknown): ValidationResult<ApprovalRecord> {
  return validateSovereignRecord("approvals", value);
}

export const validators = {
  docs: validateDoc,
  projects: validateProject,
  incidents: validateIncident,
  comments: validateComment,
  attachments: validateAttachment,
  approvals: validateApproval,
} as const;

export * from "./ingestEvidence.ts";
export * from "./ingestSearch.ts";
export * from "./mcpApprovalEvidence.ts";
export * from "./pluginReviewArtifact.ts";

function isOneOf<TValue extends string>(value: unknown, allowed: readonly TValue[]): value is TValue {
  return typeof value === "string" && allowed.includes(value as TValue);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireId(
  record: Record<string, unknown>,
  key: string,
  prefix: IdentifierPrefix,
  issues: ValidationIssue[],
): void {
  const value = record[key];
  if (typeof value !== "string" || !isSovereignId(value, prefix)) {
    issues.push({ path: key, message: `${key} must use the ${prefix}_ id prefix` });
  }
}

function optionalId(
  record: Record<string, unknown>,
  key: string,
  prefix: IdentifierPrefix,
  issues: ValidationIssue[],
): void {
  const value = record[key];
  if (value !== undefined && (typeof value !== "string" || !isSovereignId(value, prefix))) {
    issues.push({ path: key, message: `${key} must use the ${prefix}_ id prefix` });
  }
}

function requireTargetId(record: Record<string, unknown>, key: string, issues: ValidationIssue[]): void {
  if (!isSovereignRecordId(record[key])) {
    issues.push({ path: key, message: `${key} must reference a supported record id` });
  }
}

function requireStatus<K extends SchemaKind>(
  kind: K,
  record: Record<string, unknown>,
  issues: ValidationIssue[],
): void {
  if (!isStatusForKind(kind, record.status)) {
    issues.push({
      path: "status",
      message: `status must be one of ${schemaDefinitions[kind].statuses.join(", ")}`,
    });
  }
}

function requireRisk(record: Record<string, unknown>, issues: ValidationIssue[]): void {
  if (!isRiskLevel(record.risk)) {
    issues.push({ path: "risk", message: `risk must be one of ${RISK_LEVELS.join(", ")}` });
  }
}

function requireNonEmptyString(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
): void {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push({ path: key, message: `${key} must be a non-empty string` });
  }
}

function optionalNonEmptyString(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
): void {
  const value = record[key];
  if (value !== undefined && (typeof value !== "string" || value.trim().length === 0)) {
    issues.push({ path: key, message: `${key} must be a non-empty string when provided` });
  }
}

function requireNonNegativeInteger(
  record: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
): void {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    issues.push({ path: key, message: `${key} must be a non-negative integer` });
  }
}

function formatValidationIssues(kind: SchemaKind, issues: readonly ValidationIssue[]): string {
  const details = issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
  return `${kind} schema validation failed: ${details}`;
}
