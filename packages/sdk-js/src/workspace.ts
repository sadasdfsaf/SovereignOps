export const WORKSPACE_ERROR_CODES = Object.freeze({
  ALREADY_EXISTS: "WORKSPACE_ALREADY_EXISTS",
  CURSOR_INVALID: "WORKSPACE_CURSOR_INVALID",
  EVENT_INVALID: "WORKSPACE_EVENT_INVALID",
  INVALID_DESCRIPTOR: "WORKSPACE_INVALID_DESCRIPTOR",
  NOT_FOUND: "WORKSPACE_NOT_FOUND",
});

export type WorkspaceErrorCode =
  (typeof WORKSPACE_ERROR_CODES)[keyof typeof WORKSPACE_ERROR_CODES];

export interface WorkspaceError {
  readonly code: WorkspaceErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface OkResult<T> {
  readonly ok: true;
  readonly value: T;
}

export interface ErrResult<E extends WorkspaceError = WorkspaceError> {
  readonly ok: false;
  readonly error: E;
}

export type Result<T, E extends WorkspaceError = WorkspaceError> =
  | OkResult<T>
  | ErrResult<E>;

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

export interface WorkspaceDescriptor {
  readonly workspaceId: string;
  readonly deviceId: string;
  readonly rootKeyRef: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface WorkspaceEventInput<Payload = unknown> {
  readonly type: string;
  readonly payload?: Payload;
  readonly createdAt?: string;
}

export interface WorkspaceEvent<Payload = unknown> {
  readonly eventId: string;
  readonly workspaceId: string;
  readonly type: string;
  readonly payload?: Payload;
  readonly cursor: string;
  readonly sequence: number;
  readonly deviceId: string;
  readonly createdAt: string;
}

export interface ListWorkspaceEventsQuery {
  readonly type?: string;
  readonly sinceCursor?: string;
}

export interface WorkspaceSnapshot {
  readonly descriptor: WorkspaceDescriptor;
  readonly events: readonly WorkspaceEvent[];
}

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? Readonly<{ [K in keyof T]: DeepReadonly<T[K]> }>
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

interface StoredWorkspace {
  descriptor: WorkspaceDescriptor;
  events: WorkspaceEvent[];
  nextSequence: number;
}

export function ok<T>(value: T): OkResult<T> {
  return Object.freeze({ ok: true, value });
}

export function err(
  code: WorkspaceErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ErrResult {
  const error =
    details === undefined
      ? { code, message }
      : { code, message, details: Object.freeze(structuredClone(details)) };
  return Object.freeze({ ok: false, error: Object.freeze(error) });
}

export function validateWorkspaceDescriptor(
  value: unknown,
): Result<WorkspaceDescriptor> {
  if (!isRecord(value)) {
    return invalidDescriptor([{ path: "", message: "descriptor must be an object" }]);
  }

  const issues: ValidationIssue[] = [];
  const descriptor = value as Record<string, unknown>;

  requirePrefixedString(descriptor, "workspaceId", "wsp_", issues);
  requirePrefixedString(descriptor, "deviceId", "dev_", issues);
  requirePrefixedString(descriptor, "rootKeyRef", "key_", issues);
  requireIsoTimestamp(descriptor, "createdAt", issues);
  requireIsoTimestamp(descriptor, "updatedAt", issues);

  if (
    issues.length === 0 &&
    Date.parse(descriptor.updatedAt as string) < Date.parse(descriptor.createdAt as string)
  ) {
    issues.push({
      path: "updatedAt",
      message: "updatedAt must be greater than or equal to createdAt",
    });
  }

  if (issues.length > 0) {
    return invalidDescriptor(issues);
  }

  return ok({
    workspaceId: descriptor.workspaceId as string,
    deviceId: descriptor.deviceId as string,
    rootKeyRef: descriptor.rootKeyRef as string,
    createdAt: descriptor.createdAt as string,
    updatedAt: descriptor.updatedAt as string,
  });
}

export class InMemoryWorkspaceClient {
  readonly #workspaces = new Map<string, StoredWorkspace>();

  createWorkspace(
    descriptor: unknown,
  ): Result<DeepReadonly<WorkspaceSnapshot>> {
    const validated = validateWorkspaceDescriptor(descriptor);
    if (!validated.ok) {
      return validated;
    }

    if (this.#workspaces.has(validated.value.workspaceId)) {
      return err(
        WORKSPACE_ERROR_CODES.ALREADY_EXISTS,
        "workspace already exists",
        { workspaceId: validated.value.workspaceId },
      );
    }

    const stored: StoredWorkspace = {
      descriptor: structuredClone(validated.value),
      events: [],
      nextSequence: 1,
    };
    this.#workspaces.set(stored.descriptor.workspaceId, stored);

    return ok(snapshotFor(stored));
  }

  openWorkspace(
    workspaceId: string,
  ): Result<DeepReadonly<WorkspaceSnapshot>> {
    const workspace = this.#getWorkspace(workspaceId);
    if (!workspace.ok) {
      return workspace;
    }

    return ok(snapshotFor(workspace.value));
  }

  snapshot(workspaceId: string): Result<DeepReadonly<WorkspaceSnapshot>> {
    return this.openWorkspace(workspaceId);
  }

  appendEvent<Payload = unknown>(
    workspaceId: string,
    input: WorkspaceEventInput<Payload>,
  ): Result<DeepReadonly<WorkspaceEvent<Payload>>> {
    const workspace = this.#getWorkspace(workspaceId);
    if (!workspace.ok) {
      return workspace;
    }

    const validated = validateEventInput(input);
    if (!validated.ok) {
      return validated;
    }

    let payload: Payload | undefined;
    try {
      payload =
        Object.hasOwn(validated.value, "payload")
          ? structuredClone(validated.value.payload)
          : undefined;
    } catch {
      return err(
        WORKSPACE_ERROR_CODES.EVENT_INVALID,
        "event payload must be structured-cloneable",
        { path: "payload" },
      );
    }

    const sequence = workspace.value.nextSequence;
    const event: WorkspaceEvent<Payload> = {
      eventId: `evt_${workspaceId}_${String(sequence).padStart(8, "0")}`,
      workspaceId,
      type: validated.value.type,
      cursor: String(sequence),
      sequence,
      deviceId: workspace.value.descriptor.deviceId,
      createdAt: validated.value.createdAt,
      ...(Object.hasOwn(validated.value, "payload") ? { payload } : {}),
    };

    workspace.value.events.push(structuredClone(event));
    workspace.value.nextSequence += 1;
    workspace.value.descriptor = {
      ...workspace.value.descriptor,
      updatedAt: laterTimestamp(workspace.value.descriptor.updatedAt, event.createdAt),
    };

    return ok(readOnlyClone(event));
  }

  listEvents(
    workspaceId: string,
    query: ListWorkspaceEventsQuery = {},
  ): Result<DeepReadonly<readonly WorkspaceEvent[]>> {
    const workspace = this.#getWorkspace(workspaceId);
    if (!workspace.ok) {
      return workspace;
    }

    const cursor = parseCursor(query.sinceCursor);
    if (!cursor.ok) {
      return cursor;
    }

    if (
      query.type !== undefined &&
      (typeof query.type !== "string" || query.type.trim().length === 0)
    ) {
      return err(
        WORKSPACE_ERROR_CODES.EVENT_INVALID,
        "event type filter must be a non-empty string",
        { path: "type" },
      );
    }

    const events = workspace.value.events
      .filter((event) => event.sequence > cursor.value)
      .filter((event) => query.type === undefined || event.type === query.type)
      .sort((left, right) => left.sequence - right.sequence);

    return ok(readOnlyClone(events));
  }

  #getWorkspace(workspaceId: string): Result<StoredWorkspace> {
    if (typeof workspaceId !== "string" || workspaceId.trim().length === 0) {
      return err(
        WORKSPACE_ERROR_CODES.INVALID_DESCRIPTOR,
        "workspaceId must be a non-empty string",
        { path: "workspaceId" },
      );
    }

    const workspace = this.#workspaces.get(workspaceId);
    if (workspace === undefined) {
      return err(WORKSPACE_ERROR_CODES.NOT_FOUND, "workspace not found", {
        workspaceId,
      });
    }

    return ok(workspace);
  }
}

export function createInMemoryWorkspaceClient(): InMemoryWorkspaceClient {
  return new InMemoryWorkspaceClient();
}

function validateEventInput<Payload>(
  input: WorkspaceEventInput<Payload>,
): Result<Required<Pick<WorkspaceEventInput<Payload>, "type" | "createdAt">> & {
  readonly payload?: Payload;
}> {
  if (!isRecord(input)) {
    return err(WORKSPACE_ERROR_CODES.EVENT_INVALID, "event must be an object", {
      path: "",
    });
  }

  if (typeof input.type !== "string" || input.type.trim().length === 0) {
    return err(
      WORKSPACE_ERROR_CODES.EVENT_INVALID,
      "event type must be a non-empty string",
      { path: "type" },
    );
  }

  const createdAt = input.createdAt ?? new Date().toISOString();
  if (!isIsoTimestamp(createdAt)) {
    return err(
      WORKSPACE_ERROR_CODES.EVENT_INVALID,
      "event createdAt must be an ISO timestamp",
      { path: "createdAt" },
    );
  }

  return ok({
    type: input.type,
    createdAt,
    ...(Object.hasOwn(input, "payload") ? { payload: input.payload } : {}),
  });
}

function parseCursor(cursor: string | undefined): Result<number> {
  if (cursor === undefined) {
    return ok(0);
  }

  if (!/^[1-9][0-9]*$/.test(cursor)) {
    return err(
      WORKSPACE_ERROR_CODES.CURSOR_INVALID,
      "sinceCursor must be a positive event cursor",
      { sinceCursor: cursor },
    );
  }

  return ok(Number(cursor));
}

function snapshotFor(workspace: StoredWorkspace): DeepReadonly<WorkspaceSnapshot> {
  return readOnlyClone({
    descriptor: workspace.descriptor,
    events: workspace.events.slice().sort((left, right) => left.sequence - right.sequence),
  });
}

function readOnlyClone<T>(value: T): DeepReadonly<T> {
  return deepFreeze(structuredClone(value)) as DeepReadonly<T>;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);

  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }

  return value;
}

function invalidDescriptor(issues: readonly ValidationIssue[]): ErrResult {
  return err(
    WORKSPACE_ERROR_CODES.INVALID_DESCRIPTOR,
    "workspace descriptor is invalid",
    { issues },
  );
}

function requirePrefixedString(
  value: Record<string, unknown>,
  field: string,
  prefix: string,
  issues: ValidationIssue[],
): void {
  if (typeof value[field] !== "string" || (value[field] as string).trim().length === 0) {
    issues.push({ path: field, message: `${field} must be a non-empty string` });
    return;
  }

  if (!(value[field] as string).startsWith(prefix)) {
    issues.push({ path: field, message: `${field} must use the ${prefix} prefix` });
  }
}

function requireIsoTimestamp(
  value: Record<string, unknown>,
  field: string,
  issues: ValidationIssue[],
): void {
  if (typeof value[field] !== "string" || !isIsoTimestamp(value[field] as string)) {
    issues.push({ path: field, message: `${field} must be an ISO timestamp` });
  }
}

function isIsoTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function laterTimestamp(left: string, right: string): string {
  return Date.parse(left) >= Date.parse(right) ? left : right;
}
