export type ToolAuditEventType =
  | "tool_call_requested"
  | "tool_call_approved"
  | "tool_call_approval_required"
  | "tool_call_denied"
  | "tool_call_executed"
  | "tool_call_failed";

export interface ToolAuditEvent {
  type: ToolAuditEventType;
  toolName: string;
  arguments?: Record<string, unknown>;
  actorId?: string;
  decision?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  resultSummary?: string;
}

export interface ToolAuditRecord extends ToolAuditEvent {
  id: string;
  timestamp: string;
}

export interface ToolAuditEmitterOptions {
  now?: () => Date | string;
  idPrefix?: string;
  sensitiveNames?: readonly RegExp[];
  sensitiveValues?: readonly RegExp[];
}

export type ToolAuditListener = (record: ToolAuditRecord) => void;

export interface ToolAuditSink {
  emit(event: ToolAuditEvent): ToolAuditRecord;
}

const REDACTED = "[REDACTED]";

const DEFAULT_SENSITIVE_NAMES = [
  /password/i,
  /passphrase/i,
  /secret/i,
  /token/i,
  /api[-_]?key/i,
  /access[-_]?key/i,
  /credential/i,
  /authorization/i,
  /cookie/i,
  /session/i,
  /private[-_]?key/i,
];

const DEFAULT_SENSITIVE_VALUES = [
  /\b[A-Za-z0-9_-]*(?:password|passphrase|secret|token|api[-_]?key|access[-_]?key|credential|authorization|cookie|session|private[-_]?key)[A-Za-z0-9_-]*\s*[:=]\s*\S+/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}\b/i,
  /\bsk-[A-Za-z0-9_-]{8,}\b/i,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/i,
  /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  /\b[A-Fa-f0-9]{32,}\b/,
  /\b(?:\d[ -]*?){13,19}\b/,
];

export class ToolAuditEmitter implements ToolAuditSink {
  readonly #events: ToolAuditRecord[] = [];
  readonly #listeners = new Set<ToolAuditListener>();
  readonly #now: () => Date | string;
  readonly #idPrefix: string;
  readonly #sensitiveNames: readonly RegExp[];
  readonly #sensitiveValues: readonly RegExp[];
  #sequence = 0;

  constructor(options: ToolAuditEmitterOptions = {}) {
    this.#now = options.now ?? (() => new Date());
    this.#idPrefix = options.idPrefix ?? "tool_audit_";
    this.#sensitiveNames = options.sensitiveNames ?? DEFAULT_SENSITIVE_NAMES;
    this.#sensitiveValues = options.sensitiveValues ?? DEFAULT_SENSITIVE_VALUES;
  }

  emit(event: ToolAuditEvent): ToolAuditRecord {
    const record: ToolAuditRecord = {
      ...event,
      arguments: event.arguments
        ? redactSensitiveArguments(
            event.arguments,
            this.#sensitiveNames,
            this.#sensitiveValues,
          )
        : undefined,
      id: `${this.#idPrefix}${++this.#sequence}`,
      timestamp: toTimestamp(this.#now()),
    };

    this.#events.push(record);
    for (const listener of this.#listeners) {
      listener(cloneAuditRecord(record));
    }

    return cloneAuditRecord(record);
  }

  requested(event: Omit<ToolAuditEvent, "type">): ToolAuditRecord {
    return this.emit({ ...event, type: "tool_call_requested" });
  }

  approved(event: Omit<ToolAuditEvent, "type">): ToolAuditRecord {
    return this.emit({ ...event, type: "tool_call_approved" });
  }

  denied(event: Omit<ToolAuditEvent, "type">): ToolAuditRecord {
    return this.emit({ ...event, type: "tool_call_denied" });
  }

  executed(event: Omit<ToolAuditEvent, "type">): ToolAuditRecord {
    return this.emit({ ...event, type: "tool_call_executed" });
  }

  failed(event: Omit<ToolAuditEvent, "type">): ToolAuditRecord {
    return this.emit({ ...event, type: "tool_call_failed" });
  }

  entries(): ToolAuditRecord[] {
    return this.#events.map(cloneAuditRecord);
  }

  clear(): void {
    this.#events.length = 0;
  }

  subscribe(listener: ToolAuditListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
}

export function createToolAuditEmitter(
  options: ToolAuditEmitterOptions = {},
): ToolAuditEmitter {
  return new ToolAuditEmitter(options);
}

export function redactSensitiveArguments(
  value: Record<string, unknown>,
  sensitiveNames: readonly RegExp[] = DEFAULT_SENSITIVE_NAMES,
  sensitiveValues: readonly RegExp[] = DEFAULT_SENSITIVE_VALUES,
): Record<string, unknown> {
  return redactValue(value, sensitiveNames, sensitiveValues, new WeakSet(), undefined) as Record<
    string,
    unknown
  >;
}

function redactValue(
  value: unknown,
  sensitiveNames: readonly RegExp[],
  sensitiveValues: readonly RegExp[],
  seen: WeakSet<object>,
  key: string | undefined,
): unknown {
  if (key && sensitiveNames.some((pattern) => pattern.test(key))) {
    return REDACTED;
  }

  if (typeof value === "string") {
    return sensitiveValues.some((pattern) => pattern.test(value)) ? REDACTED : value;
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) =>
      redactValue(item, sensitiveNames, sensitiveValues, seen, undefined),
    );
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
      entryKey,
      redactValue(entryValue, sensitiveNames, sensitiveValues, seen, entryKey),
    ]),
  );
}

function cloneAuditRecord(record: ToolAuditRecord): ToolAuditRecord {
  return {
    ...record,
    arguments: record.arguments ? clonePlain(record.arguments) : undefined,
    metadata: record.metadata ? clonePlain(record.metadata) : undefined,
  };
}

function clonePlain<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => clonePlain(item)) as T;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
      key,
      clonePlain(entryValue),
    ]),
  ) as T;
}

function toTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
