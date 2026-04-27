export type LocalStoreCollection = "events" | "records";

export type LocalStorePrimitive = string | number | boolean | null;
export type LocalStoreJson =
  | LocalStorePrimitive
  | LocalStoreJson[]
  | { [key: string]: LocalStoreJson };

export type WorkspaceId = `wsp_${string}`;

export interface LocalStoreKey {
  workspaceId: WorkspaceId;
  collection: LocalStoreCollection;
  id: string;
}

export interface LocalStoreListQuery {
  workspaceId: WorkspaceId;
  collection: LocalStoreCollection;
}

export interface LocalStorePut<TValue extends LocalStoreJson = LocalStoreJson>
  extends LocalStoreKey {
  value: TValue;
  updatedAt?: string;
}

export interface LocalStoreEntry<TValue extends LocalStoreJson = LocalStoreJson>
  extends LocalStoreKey {
  value: TValue;
  updatedAt: string;
}

export interface BrowserLocalStore {
  put<TValue extends LocalStoreJson>(
    entry: LocalStorePut<TValue>,
  ): Promise<LocalStoreEntry<TValue>>;
  get<TValue extends LocalStoreJson = LocalStoreJson>(
    key: LocalStoreKey,
  ): Promise<LocalStoreEntry<TValue> | undefined>;
  list<TValue extends LocalStoreJson = LocalStoreJson>(
    query: LocalStoreListQuery,
  ): Promise<LocalStoreEntry<TValue>[]>;
  delete(key: LocalStoreKey): Promise<boolean>;
}

export class InMemoryLocalStore implements BrowserLocalStore {
  readonly #entries = new Map<string, LocalStoreEntry>();

  async put<TValue extends LocalStoreJson>(
    entry: LocalStorePut<TValue>,
  ): Promise<LocalStoreEntry<TValue>> {
    assertValidKey(entry);
    if (entry.value === undefined) {
      throw new Error("value must be JSON-compatible");
    }

    const stored: LocalStoreEntry<TValue> = {
      workspaceId: entry.workspaceId,
      collection: entry.collection,
      id: entry.id,
      value: clone(entry.value),
      updatedAt: entry.updatedAt ?? new Date().toISOString(),
    };

    this.#entries.set(toMapKey(entry), stored);
    return cloneEntry(stored);
  }

  async get<TValue extends LocalStoreJson = LocalStoreJson>(
    key: LocalStoreKey,
  ): Promise<LocalStoreEntry<TValue> | undefined> {
    assertValidKey(key);
    const entry = this.#entries.get(toMapKey(key));
    return entry ? cloneEntry(entry) : undefined;
  }

  async list<TValue extends LocalStoreJson = LocalStoreJson>(
    query: LocalStoreListQuery,
  ): Promise<LocalStoreEntry<TValue>[]> {
    assertValidScope(query);
    const entries: LocalStoreEntry<TValue>[] = [];

    for (const entry of this.#entries.values()) {
      if (
        entry.workspaceId === query.workspaceId &&
        entry.collection === query.collection
      ) {
        entries.push(cloneEntry(entry));
      }
    }

    return entries;
  }

  async delete(key: LocalStoreKey): Promise<boolean> {
    assertValidKey(key);
    return this.#entries.delete(toMapKey(key));
  }
}

export function createInMemoryLocalStore(): BrowserLocalStore {
  return new InMemoryLocalStore();
}

function toMapKey(key: LocalStoreKey): string {
  return `${key.workspaceId}\u0000${key.collection}\u0000${key.id}`;
}

function assertValidKey(key: LocalStoreKey): void {
  assertValidScope(key);
  if (key.id.trim() === "") {
    throw new Error("id is required");
  }
}

function assertValidScope(scope: LocalStoreListQuery): void {
  if (!scope.workspaceId.startsWith("wsp_")) {
    throw new Error("workspaceId must use the wsp_ prefix");
  }
  if (scope.collection !== "events" && scope.collection !== "records") {
    throw new Error("collection must be events or records");
  }
}

function cloneEntry<TValue extends LocalStoreJson>(
  entry: LocalStoreEntry,
): LocalStoreEntry<TValue> {
  return {
    workspaceId: entry.workspaceId,
    collection: entry.collection,
    id: entry.id,
    value: clone(entry.value) as TValue,
    updatedAt: entry.updatedAt,
  };
}

function clone<TValue extends LocalStoreJson>(value: TValue): TValue {
  return structuredClone(value);
}
