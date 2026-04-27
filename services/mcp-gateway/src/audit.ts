export type AuditEventType =
  | "policy_decision"
  | "operation_succeeded"
  | "operation_failed";

export interface AuditEvent {
  type: AuditEventType;
  path?: string;
  capability?: string;
  decision?: string;
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditRecord extends AuditEvent {
  id: string;
  timestamp: string;
}

export interface AuditEmitterOptions {
  now?: () => Date | string;
  idPrefix?: string;
}

export type AuditListener = (record: AuditRecord) => void;

export interface AuditSink {
  emit(event: AuditEvent): AuditRecord;
}

export class AuditEmitter implements AuditSink {
  readonly #events: AuditRecord[] = [];
  readonly #listeners = new Set<AuditListener>();
  readonly #now: () => Date | string;
  readonly #idPrefix: string;
  #sequence = 0;

  constructor(options: AuditEmitterOptions = {}) {
    this.#now = options.now ?? (() => new Date());
    this.#idPrefix = options.idPrefix ?? "audit_";
  }

  emit(event: AuditEvent): AuditRecord {
    const record: AuditRecord = {
      ...event,
      id: `${this.#idPrefix}${++this.#sequence}`,
      timestamp: toTimestamp(this.#now()),
    };

    this.#events.push(record);
    for (const listener of this.#listeners) {
      listener(record);
    }

    return record;
  }

  entries(): AuditRecord[] {
    return this.#events.map((event) => ({ ...event }));
  }

  clear(): void {
    this.#events.length = 0;
  }

  subscribe(listener: AuditListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
}

export function createAuditEmitter(options: AuditEmitterOptions = {}): AuditEmitter {
  return new AuditEmitter(options);
}

function toTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
