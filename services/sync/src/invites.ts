import { createHash } from "node:crypto";

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult<TValue = unknown> {
  ok: boolean;
  issues: ValidationIssue[];
  value?: TValue;
}

export const INVITE_STATUSES = ["pending", "accepted", "expired"] as const;

export type InviteStatus = (typeof INVITE_STATUSES)[number];

export interface WorkspaceInviteToken {
  workspaceId: `wsp_${string}`;
  inviteId: `inv_${string}`;
  tokenHash: `sha256:${string}`;
  createdAt: string;
  expiresAt: string;
  status: InviteStatus;
  acceptedAt?: string;
  acceptedByDeviceId?: `dev_${string}`;
}

export interface CreateInviteInput {
  workspaceId: string;
  inviteId: string;
  token: string;
  createdAt: string;
  expiresAt: string;
}

export interface AcceptInviteInput {
  workspaceId: string;
  inviteId: string;
  token: string;
  acceptedAt: string;
  acceptedByDeviceId: string;
}

export interface InviteExpirationInput {
  createdAt: string;
  expiresAt: string;
}

export interface ValidatedCreateInviteInput {
  workspaceId: `wsp_${string}`;
  inviteId: `inv_${string}`;
  token: string;
  createdAt: string;
  expiresAt: string;
}

export interface ValidatedAcceptInviteInput {
  workspaceId: `wsp_${string}`;
  inviteId: `inv_${string}`;
  token: string;
  acceptedAt: string;
  acceptedByDeviceId: `dev_${string}`;
}

export interface ValidatedInviteExpiration {
  createdAt: string;
  expiresAt: string;
}

const WORKSPACE_ID_PATTERN = /^wsp_[A-Za-z0-9_-]{1,88}$/;
const DEVICE_ID_PATTERN = /^dev_[A-Za-z0-9_-]{1,88}$/;
const INVITE_ID_PATTERN = /^inv_[A-Za-z0-9_-]{1,88}$/;
const MIN_TOKEN_LENGTH = 16;

export function validateInviteExpiration(
  value: unknown,
): ValidationResult<ValidatedInviteExpiration> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [{ path: "$", message: "invite expiration input must be an object" }],
    };
  }

  requireOnlyKeys(value, ["createdAt", "expiresAt"], "$", issues);
  const createdAtMs = parseTimestamp(value.createdAt, "createdAt", issues);
  const expiresAtMs = parseTimestamp(value.expiresAt, "expiresAt", issues);
  if (
    createdAtMs !== undefined &&
    expiresAtMs !== undefined &&
    expiresAtMs <= createdAtMs
  ) {
    issues.push({ path: "expiresAt", message: "expiresAt must be later than createdAt" });
  }

  return issues.length === 0
    ? {
        ok: true,
        issues,
        value: {
          createdAt: value.createdAt as string,
          expiresAt: value.expiresAt as string,
        },
      }
    : { ok: false, issues };
}

export function validateInviteCreationInput(
  value: unknown,
): ValidationResult<ValidatedCreateInviteInput> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [{ path: "$", message: "invite creation input must be an object" }],
    };
  }

  requireOnlyKeys(value, ["workspaceId", "inviteId", "token", "createdAt", "expiresAt"], "$", issues);
  requireWorkspaceId(value.workspaceId, "workspaceId", issues);
  requireInviteId(value.inviteId, "inviteId", issues);
  requireToken(value.token, "token", issues);

  const expiration = validateInviteExpiration({
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
  });
  issues.push(...expiration.issues);

  return issues.length === 0
    ? {
        ok: true,
        issues,
        value: {
          workspaceId: value.workspaceId as `wsp_${string}`,
          inviteId: value.inviteId as `inv_${string}`,
          token: normalizeToken(value.token as string),
          createdAt: value.createdAt as string,
          expiresAt: value.expiresAt as string,
        },
      }
    : { ok: false, issues };
}

export function validateInviteAcceptanceInput(
  value: unknown,
): ValidationResult<ValidatedAcceptInviteInput> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [{ path: "$", message: "invite acceptance input must be an object" }],
    };
  }

  requireOnlyKeys(
    value,
    ["workspaceId", "inviteId", "token", "acceptedAt", "acceptedByDeviceId"],
    "$",
    issues,
  );
  requireWorkspaceId(value.workspaceId, "workspaceId", issues);
  requireInviteId(value.inviteId, "inviteId", issues);
  requireToken(value.token, "token", issues);
  requireDeviceId(value.acceptedByDeviceId, "acceptedByDeviceId", issues);
  parseTimestamp(value.acceptedAt, "acceptedAt", issues);

  return issues.length === 0
    ? {
        ok: true,
        issues,
        value: {
          workspaceId: value.workspaceId as `wsp_${string}`,
          inviteId: value.inviteId as `inv_${string}`,
          token: normalizeToken(value.token as string),
          acceptedAt: value.acceptedAt as string,
          acceptedByDeviceId: value.acceptedByDeviceId as `dev_${string}`,
        },
      }
    : { ok: false, issues };
}

export function createInvite(
  invites: readonly WorkspaceInviteToken[],
  input: unknown,
): WorkspaceInviteToken[] {
  const validation = validateInviteCreationInput(input);
  if (!validation.ok) {
    throw new Error(formatValidationIssues("invite creation input", validation.issues));
  }

  const invite = validation.value;
  if (hasInvite(invites, invite.workspaceId, invite.inviteId)) {
    throw new Error(`invite already exists in workspace: ${invite.workspaceId}/${invite.inviteId}`);
  }

  return [
    ...invites.map(cloneInvite),
    {
      workspaceId: invite.workspaceId,
      inviteId: invite.inviteId,
      tokenHash: hashInviteToken(invite.token),
      createdAt: invite.createdAt,
      expiresAt: invite.expiresAt,
      status: "pending",
    },
  ];
}

export function acceptInvite(
  invites: readonly WorkspaceInviteToken[],
  input: unknown,
): WorkspaceInviteToken[] {
  const validation = validateInviteAcceptanceInput(input);
  if (!validation.ok) {
    throw new Error(formatValidationIssues("invite acceptance input", validation.issues));
  }

  const acceptance = validation.value;
  const tokenHash = hashInviteToken(acceptance.token);
  let found = false;

  const updated = invites.map((invite) => {
    if (invite.workspaceId !== acceptance.workspaceId || invite.inviteId !== acceptance.inviteId) {
      return cloneInvite(invite);
    }

    found = true;
    if (invite.status === "accepted" || invite.acceptedAt !== undefined) {
      throw new Error("invite has already been accepted and is single-use");
    }
    if (invite.status === "expired" || isInviteExpired(invite, acceptance.acceptedAt)) {
      throw new Error("invite is expired");
    }
    if (invite.tokenHash !== tokenHash) {
      throw new Error("invite token does not match");
    }

    return {
      ...cloneInvite(invite),
      status: "accepted",
      acceptedAt: acceptance.acceptedAt,
      acceptedByDeviceId: acceptance.acceptedByDeviceId,
    };
  });

  if (!found) {
    throw new Error(`invite was not found in workspace: ${acceptance.workspaceId}/${acceptance.inviteId}`);
  }

  return updated;
}

export function expireInvites(
  invites: readonly WorkspaceInviteToken[],
  now: string,
): WorkspaceInviteToken[] {
  const nowMs = parseRequiredTimestamp(now, "now");
  return invites.map((invite) => {
    if (invite.status !== "pending" || parseRequiredTimestamp(invite.expiresAt, "expiresAt") > nowMs) {
      return cloneInvite(invite);
    }

    return {
      ...cloneInvite(invite),
      status: "expired",
    };
  });
}

export function isInviteExpired(invite: WorkspaceInviteToken, at: string): boolean {
  const atMs = parseRequiredTimestamp(at, "at");
  return parseRequiredTimestamp(invite.expiresAt, "expiresAt") <= atMs;
}

export function findInvite(
  invites: readonly WorkspaceInviteToken[],
  workspaceId: string,
  inviteId: string,
): WorkspaceInviteToken | undefined {
  const ids = validateInviteLocator(workspaceId, inviteId);
  const found = invites.find(
    (invite) => invite.workspaceId === ids.workspaceId && invite.inviteId === ids.inviteId,
  );
  return found ? cloneInvite(found) : undefined;
}

export function hashInviteToken(token: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(normalizeToken(token)).digest("hex")}`;
}

export function redactInviteToken(token: string): string {
  if (typeof token !== "string") {
    return "[redacted]";
  }

  const normalized = token.trim();
  if (normalized.length <= 8) {
    return "[redacted]";
  }

  return `${normalized.slice(0, 4)}...${normalized.slice(-4)}`;
}

export class InMemoryInviteRepository {
  private invites: WorkspaceInviteToken[];

  constructor(invites: readonly WorkspaceInviteToken[] = []) {
    this.invites = invites.map(cloneInvite);
  }

  list(workspaceId?: string): WorkspaceInviteToken[] {
    if (workspaceId === undefined) {
      return this.invites.map(cloneInvite);
    }

    const ids = validateWorkspaceLocator(workspaceId);
    return this.invites
      .filter((invite) => invite.workspaceId === ids.workspaceId)
      .map(cloneInvite);
  }

  create(input: unknown): WorkspaceInviteToken {
    this.invites = createInvite(this.invites, input);
    return cloneInvite(this.invites[this.invites.length - 1]);
  }

  accept(input: unknown): WorkspaceInviteToken {
    const validation = validateInviteAcceptanceInput(input);
    if (!validation.ok) {
      throw new Error(formatValidationIssues("invite acceptance input", validation.issues));
    }

    this.invites = acceptInvite(this.invites, validation.value);
    const accepted = findInvite(this.invites, validation.value.workspaceId, validation.value.inviteId);
    if (!accepted) {
      throw new Error(
        `invite was not found in workspace: ${validation.value.workspaceId}/${validation.value.inviteId}`,
      );
    }
    return accepted;
  }

  expire(now: string): WorkspaceInviteToken[] {
    this.invites = expireInvites(this.invites, now);
    return this.list();
  }
}

function hasInvite(
  invites: readonly WorkspaceInviteToken[],
  workspaceId: string,
  inviteId: string,
): boolean {
  return invites.some((invite) => invite.workspaceId === workspaceId && invite.inviteId === inviteId);
}

function cloneInvite(invite: WorkspaceInviteToken): WorkspaceInviteToken {
  return {
    workspaceId: invite.workspaceId,
    inviteId: invite.inviteId,
    tokenHash: invite.tokenHash,
    createdAt: invite.createdAt,
    expiresAt: invite.expiresAt,
    status: invite.status,
    ...(invite.acceptedAt !== undefined ? { acceptedAt: invite.acceptedAt } : {}),
    ...(invite.acceptedByDeviceId !== undefined
      ? { acceptedByDeviceId: invite.acceptedByDeviceId }
      : {}),
  };
}

function validateInviteLocator(
  workspaceId: string,
  inviteId: string,
): { workspaceId: `wsp_${string}`; inviteId: `inv_${string}` } {
  const issues: ValidationIssue[] = [];
  requireWorkspaceId(workspaceId, "workspaceId", issues);
  requireInviteId(inviteId, "inviteId", issues);
  if (issues.length > 0) {
    throw new Error(formatValidationIssues("invite locator", issues));
  }

  return {
    workspaceId: workspaceId as `wsp_${string}`,
    inviteId: inviteId as `inv_${string}`,
  };
}

function validateWorkspaceLocator(workspaceId: string): { workspaceId: `wsp_${string}` } {
  const issues: ValidationIssue[] = [];
  requireWorkspaceId(workspaceId, "workspaceId", issues);
  if (issues.length > 0) {
    throw new Error(formatValidationIssues("workspace locator", issues));
  }

  return {
    workspaceId: workspaceId as `wsp_${string}`,
  };
}

function requireWorkspaceId(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || !WORKSPACE_ID_PATTERN.test(value)) {
    issues.push({ path, message: "workspaceId must use the wsp_ id prefix" });
  }
}

function requireDeviceId(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || !DEVICE_ID_PATTERN.test(value)) {
    issues.push({ path, message: "deviceId must use the dev_ id prefix" });
  }
}

function requireInviteId(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || !INVITE_ID_PATTERN.test(value)) {
    issues.push({ path, message: "inviteId must use the inv_ id prefix" });
  }
}

function requireToken(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || value.trim().length < MIN_TOKEN_LENGTH) {
    issues.push({
      path,
      message: `token must be at least ${MIN_TOKEN_LENGTH} characters`,
    });
  }
}

function normalizeToken(token: string): string {
  const issues: ValidationIssue[] = [];
  requireToken(token, "token", issues);
  if (issues.length > 0) {
    throw new Error(formatValidationIssues("invite token", issues));
  }
  return token.trim();
}

function parseTimestamp(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): number | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push({ path, message: `${path} must be a non-empty timestamp string` });
    return undefined;
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    issues.push({ path, message: `${path} must be a valid timestamp` });
    return undefined;
  }

  return timestamp;
}

function parseRequiredTimestamp(value: string, path: string): number {
  const issues: ValidationIssue[] = [];
  const timestamp = parseTimestamp(value, path, issues);
  if (timestamp === undefined) {
    throw new Error(formatValidationIssues("timestamp", issues));
  }
  return timestamp;
}

function requireOnlyKeys(
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  path: string,
  issues: ValidationIssue[],
): void {
  for (const key of Object.keys(record)) {
    if (!allowedKeys.includes(key)) {
      issues.push({ path: path === "$" ? key : `${path}.${key}`, message: "field is not supported" });
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatValidationIssues(scope: string, issues: readonly ValidationIssue[]): string {
  const details = issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
  return `${scope} validation failed: ${details}`;
}
