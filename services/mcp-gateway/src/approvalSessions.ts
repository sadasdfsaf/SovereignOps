export type ApprovalSessionStatus = "pending" | "approved" | "rejected" | "expired";

export interface ApprovalSessionActor {
  id: string;
  roles?: readonly string[];
  metadata?: Record<string, unknown>;
}

export interface CreateApprovalSessionInput {
  request?: Record<string, unknown>;
  operation?: Record<string, unknown>;
  toolName?: string;
  arguments?: Record<string, unknown>;
  path?: string;
  capability?: string;
  actor?: ApprovalSessionActor;
  reason?: string;
  ruleId?: string;
  metadata?: Record<string, unknown>;
  expiresAt?: Date | string;
  ttlMs?: number;
}

export interface ApprovalSessionTransitionInput {
  actor?: ApprovalSessionActor;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface ApprovalSessionDecision {
  status: Exclude<ApprovalSessionStatus, "pending">;
  at: string;
  actor?: ApprovalSessionActor;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface ApprovalSessionSnapshot {
  id: string;
  status: ApprovalSessionStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  request: Record<string, unknown>;
  actor?: ApprovalSessionActor;
  reason?: string;
  ruleId?: string;
  metadata?: Record<string, unknown>;
  decision?: ApprovalSessionDecision;
  approvedAt?: string;
  approvedBy?: ApprovalSessionActor;
  rejectedAt?: string;
  rejectedBy?: ApprovalSessionActor;
  expiredAt?: string;
  expiredBy?: ApprovalSessionActor;
}

export interface ListApprovalSessionsFilter {
  status?: ApprovalSessionStatus;
  actorId?: string;
}

export interface ApprovalSessionStoreOptions {
  now?: () => Date | string;
  idPrefix?: string;
}

export class ApprovalSessionNotFoundError extends Error {
  readonly sessionId: string;

  constructor(sessionId: string) {
    super(`Approval session not found: ${sessionId}`);
    this.name = "ApprovalSessionNotFoundError";
    this.sessionId = sessionId;
  }
}

export class ApprovalSessionStateError extends Error {
  readonly sessionId: string;
  readonly status: ApprovalSessionStatus;

  constructor(message: string, session: Pick<ApprovalSessionSnapshot, "id" | "status">) {
    super(message);
    this.name = "ApprovalSessionStateError";
    this.sessionId = session.id;
    this.status = session.status;
  }
}

type ApprovalSessionRecord = ApprovalSessionSnapshot;

const CREATE_RESERVED_KEYS = new Set([
  "actor",
  "expiresAt",
  "metadata",
  "reason",
  "ruleId",
  "ttlMs",
]);

export class ApprovalSessionStore {
  readonly #sessions = new Map<string, ApprovalSessionRecord>();
  readonly #now: () => Date | string;
  readonly #idPrefix: string;
  #sequence = 0;

  constructor(options: ApprovalSessionStoreOptions = {}) {
    this.#now = options.now ?? (() => new Date());
    this.#idPrefix = options.idPrefix ?? "approval_";
  }

  create(input: CreateApprovalSessionInput): ApprovalSessionSnapshot {
    assertPlainRecord(input, "Approval session input");

    const createdAt = this.#timestamp();
    const request = normalizeApprovalRequest(input);
    const ttlMs = normalizeTtlMs(input.ttlMs);
    const expiresAt =
      input.expiresAt !== undefined
        ? toTimestamp(input.expiresAt)
        : ttlMs !== undefined
          ? new Date(Date.parse(createdAt) + ttlMs).toISOString()
          : undefined;

    const record: ApprovalSessionRecord = {
      id: `${this.#idPrefix}${++this.#sequence}`,
      status: "pending",
      createdAt,
      updatedAt: createdAt,
      expiresAt,
      request,
      actor: normalizeActor(input.actor),
      reason: normalizeOptionalString(input.reason, "reason"),
      ruleId: normalizeOptionalString(input.ruleId, "ruleId"),
      metadata: normalizeOptionalRecord(input.metadata, "metadata"),
    };

    this.#sessions.set(record.id, record);
    return snapshot(record);
  }

  get(id: string): ApprovalSessionSnapshot | undefined {
    const record = this.#sessions.get(assertSessionId(id));
    if (!record) {
      return undefined;
    }

    this.#expireIfStale(record, this.#timestamp());
    return snapshot(record);
  }

  list(filter: ListApprovalSessionsFilter = {}): ApprovalSessionSnapshot[] {
    this.#expireStaleSessions(this.#timestamp());
    return [...this.#sessions.values()]
      .filter((session) => filter.status === undefined || session.status === filter.status)
      .filter((session) => filter.actorId === undefined || session.actor?.id === filter.actorId)
      .map(snapshot);
  }

  approve(
    id: string,
    input: ApprovalSessionTransitionInput | ApprovalSessionActor = {},
  ): ApprovalSessionSnapshot {
    const record = this.#requirePending(id, "approve");
    return snapshot(this.#transition(record, "approved", normalizeTransition(input)));
  }

  reject(
    id: string,
    input: ApprovalSessionTransitionInput | ApprovalSessionActor = {},
  ): ApprovalSessionSnapshot {
    const record = this.#requirePending(id, "reject");
    return snapshot(this.#transition(record, "rejected", normalizeTransition(input)));
  }

  expire(
    id: string,
    input: ApprovalSessionTransitionInput | ApprovalSessionActor = {},
  ): ApprovalSessionSnapshot {
    const record = this.#requireSession(id);
    if (record.status !== "pending") {
      throw new ApprovalSessionStateError(
        `Cannot expire terminal approval session ${record.id} with status ${record.status}.`,
        record,
      );
    }

    return snapshot(this.#transition(record, "expired", normalizeTransition(input)));
  }

  #requirePending(id: string, action: "approve" | "reject"): ApprovalSessionRecord {
    const record = this.#requireSession(id);
    if (record.status !== "pending") {
      throw new ApprovalSessionStateError(
        `Cannot ${action} terminal approval session ${record.id} with status ${record.status}.`,
        record,
      );
    }

    if (this.#isStale(record, this.#timestamp())) {
      this.#transition(record, "expired", {
        reason: "Approval session expired before transition.",
      });
      throw new ApprovalSessionStateError(
        `Cannot ${action} stale approval session ${record.id}; expired at ${record.expiresAt}.`,
        record,
      );
    }

    return record;
  }

  #requireSession(id: string): ApprovalSessionRecord {
    const record = this.#sessions.get(assertSessionId(id));
    if (!record) {
      throw new ApprovalSessionNotFoundError(id);
    }

    return record;
  }

  #transition(
    record: ApprovalSessionRecord,
    status: Exclude<ApprovalSessionStatus, "pending">,
    input: NormalizedApprovalSessionTransitionInput,
  ): ApprovalSessionRecord {
    const at = this.#timestamp();
    const actor = input.actor;
    const decision: ApprovalSessionDecision = {
      status,
      at,
      actor,
      reason: input.reason,
      metadata: input.metadata,
    };

    record.status = status;
    record.updatedAt = at;
    record.decision = decision;

    if (status === "approved") {
      record.approvedAt = at;
      record.approvedBy = actor;
    } else if (status === "rejected") {
      record.rejectedAt = at;
      record.rejectedBy = actor;
    } else {
      record.expiredAt = at;
      record.expiredBy = actor;
    }

    return record;
  }

  #expireStaleSessions(now: string): void {
    for (const record of this.#sessions.values()) {
      this.#expireIfStale(record, now);
    }
  }

  #expireIfStale(record: ApprovalSessionRecord, now: string): void {
    if (record.status === "pending" && this.#isStale(record, now)) {
      this.#transition(record, "expired", {
        reason: "Approval session expired.",
      });
    }
  }

  #isStale(record: ApprovalSessionRecord, now: string): boolean {
    return Boolean(record.expiresAt && Date.parse(record.expiresAt) <= Date.parse(now));
  }

  #timestamp(): string {
    return toTimestamp(this.#now());
  }
}

export function createApprovalSessionStore(
  options: ApprovalSessionStoreOptions = {},
): ApprovalSessionStore {
  return new ApprovalSessionStore(options);
}

interface NormalizedApprovalSessionTransitionInput {
  actor?: ApprovalSessionActor;
  reason?: string;
  metadata?: Record<string, unknown>;
}

function normalizeApprovalRequest(input: CreateApprovalSessionInput): Record<string, unknown> {
  if (input.request !== undefined) {
    return cloneNonEmptyRecord(input.request, "request");
  }

  if (input.operation !== undefined) {
    return cloneNonEmptyRecord(input.operation, "operation");
  }

  const request = Object.fromEntries(
    Object.entries(input)
      .filter(([key]) => !CREATE_RESERVED_KEYS.has(key))
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, clonePlain(value)]),
  );

  if (Object.keys(request).length === 0) {
    throw new TypeError("Approval session requires non-empty request details.");
  }

  return request;
}

function cloneNonEmptyRecord(value: unknown, name: string): Record<string, unknown> {
  assertPlainRecord(value, name);
  const record = clonePlain(value);
  if (Object.keys(record).length === 0) {
    throw new TypeError(`Approval session ${name} must not be empty.`);
  }

  return record;
}

function normalizeTransition(
  input: ApprovalSessionTransitionInput | ApprovalSessionActor,
): NormalizedApprovalSessionTransitionInput {
  assertPlainRecord(input, "Approval session transition");

  if ("actor" in input) {
    return {
      actor: normalizeActor(input.actor),
      reason: normalizeOptionalString(input.reason, "reason"),
      metadata: normalizeOptionalRecord(input.metadata, "metadata"),
    };
  }

  const actorCandidate = "id" in input ? (input as ApprovalSessionActor) : undefined;
  return {
    actor: normalizeActor(actorCandidate),
    reason: normalizeOptionalString(
      (input as ApprovalSessionTransitionInput).reason,
      "reason",
    ),
    metadata: normalizeOptionalRecord(
      (input as ApprovalSessionTransitionInput).metadata,
      "metadata",
    ),
  };
}

function normalizeActor(actor: ApprovalSessionActor | undefined): ApprovalSessionActor | undefined {
  if (actor === undefined) {
    return undefined;
  }

  assertPlainRecord(actor, "actor");
  if (typeof actor.id !== "string" || actor.id.trim().length === 0) {
    throw new TypeError("Approval session actor requires a non-empty id.");
  }

  const normalized: ApprovalSessionActor = {
    id: actor.id,
  };

  if (actor.roles !== undefined) {
    if (!Array.isArray(actor.roles) || actor.roles.some((role) => typeof role !== "string")) {
      throw new TypeError("Approval session actor roles must be an array of strings.");
    }

    normalized.roles = [...actor.roles];
  }

  if (actor.metadata !== undefined) {
    normalized.metadata = cloneNonEmptyOrEmptyRecord(actor.metadata, "actor metadata");
  }

  return normalized;
}

function normalizeOptionalRecord(
  value: Record<string, unknown> | undefined,
  name: string,
): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }

  return cloneNonEmptyOrEmptyRecord(value, name);
}

function cloneNonEmptyOrEmptyRecord(value: unknown, name: string): Record<string, unknown> {
  assertPlainRecord(value, name);
  return clonePlain(value);
}

function normalizeOptionalString(value: unknown, name: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new TypeError(`Approval session ${name} must be a string when provided.`);
  }

  return value;
}

function normalizeTtlMs(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TypeError("Approval session ttlMs must be a non-negative finite number.");
  }

  return value;
}

function assertSessionId(id: string): string {
  if (typeof id !== "string" || id.trim().length === 0) {
    throw new TypeError("Approval session id must be a non-empty string.");
  }

  return id;
}

function assertPlainRecord(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object.`);
  }
}

function snapshot(record: ApprovalSessionRecord): ApprovalSessionSnapshot {
  return deepFreeze(clonePlain(record));
}

function clonePlain<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString() as T;
  }

  const objectValue = value as object;
  const existing = seen.get(objectValue);
  if (existing) {
    return existing as T;
  }

  if (Array.isArray(value)) {
    const cloned: unknown[] = [];
    seen.set(objectValue, cloned);
    for (const item of value) {
      cloned.push(clonePlain(item, seen));
    }

    return cloned as T;
  }

  const cloned: Record<string, unknown> = {};
  seen.set(objectValue, cloned);
  for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
    cloned[key] = clonePlain(entryValue, seen);
  }

  return cloned as T;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  const objectValue = value as object;
  if (seen.has(objectValue)) {
    return value;
  }
  seen.add(objectValue);

  for (const entryValue of Object.values(value as Record<string, unknown>)) {
    deepFreeze(entryValue, seen);
  }

  return Object.freeze(value);
}

function toTimestamp(value: Date | string): string {
  const timestamp = value instanceof Date ? value.toISOString() : value;
  if (typeof timestamp !== "string" || Number.isNaN(Date.parse(timestamp))) {
    throw new TypeError("Approval session timestamp must be a valid date.");
  }

  return timestamp;
}
