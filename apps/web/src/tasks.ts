import type {
  BrowserLocalStore,
  LocalStoreJson,
  WorkspaceId,
} from "./localStore.ts";

export type TaskStatus = "todo" | "in_progress" | "done" | "archived";

export type TaskRecord = {
  kind: "task";
  id: string;
  title: string;
  notes: string;
  status: TaskStatus;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  archivedAt: string | null;
} & { [key: string]: LocalStoreJson };

export type TaskEventType =
  | "task.created"
  | "task.updated"
  | "task.status_changed";

export type TaskLocalEvent = {
  kind: "local_event";
  domain: "tasks";
  type: TaskEventType;
  subjectId: string;
  occurredAt: string;
  data: { [key: string]: LocalStoreJson };
} & { [key: string]: LocalStoreJson };

export interface TaskListFilter {
  status?: TaskStatus | TaskStatus[] | "active" | "all";
  query?: string;
  tag?: string;
}

export interface CreateTaskInput {
  workspaceId: WorkspaceId;
  id?: string;
  title: string;
  notes?: string;
  status?: TaskStatus;
  tags?: string[];
  now?: string;
}

export interface UpdateTaskInput {
  workspaceId: WorkspaceId;
  taskId: string;
  title?: string;
  notes?: string;
  tags?: string[];
  now?: string;
}

export interface SetTaskStatusInput {
  workspaceId: WorkspaceId;
  taskId: string;
  status: TaskStatus;
  now?: string;
}

const TASK_RECORD_PREFIX = "task:";
const EVENT_RECORD_PREFIX = "event:";

export async function createTask(
  store: BrowserLocalStore,
  input: CreateTaskInput,
): Promise<TaskRecord> {
  const now = input.now ?? nowIso();
  const task: TaskRecord = {
    kind: "task",
    id: input.id ?? createId("task"),
    title: normalizeRequiredText(input.title, "title"),
    notes: input.notes ?? "",
    status: input.status ?? "todo",
    tags: normalizeTags(input.tags ?? []),
    createdAt: now,
    updatedAt: now,
    completedAt: input.status === "done" ? now : null,
    archivedAt: input.status === "archived" ? now : null,
  };

  await putTask(store, input.workspaceId, task);
  await emitTaskEvent(store, input.workspaceId, {
    type: "task.created",
    subjectId: task.id,
    occurredAt: now,
    data: {
      title: task.title,
      status: task.status,
      tags: task.tags,
    },
  });

  return cloneTask(task);
}

export async function getTask(
  store: BrowserLocalStore,
  workspaceId: WorkspaceId,
  taskId: string,
): Promise<TaskRecord | undefined> {
  const entry = await store.get<TaskRecord>({
    workspaceId,
    collection: "records",
    id: taskRecordId(taskId),
  });

  return entry && isTaskRecord(entry.value) ? cloneTask(entry.value) : undefined;
}

export async function listTasks(
  store: BrowserLocalStore,
  workspaceId: WorkspaceId,
  filter: TaskListFilter = {},
): Promise<TaskRecord[]> {
  const entries = await store.list<TaskRecord>({
    workspaceId,
    collection: "records",
  });

  return entries
    .filter((entry) => entry.id.startsWith(TASK_RECORD_PREFIX))
    .map((entry) => entry.value)
    .filter(isTaskRecord)
    .filter((task) => matchesTaskFilter(task, filter))
    .sort(compareTasks)
    .map(cloneTask);
}

export async function updateTask(
  store: BrowserLocalStore,
  input: UpdateTaskInput,
): Promise<TaskRecord> {
  const task = await requireTask(store, input.workspaceId, input.taskId);
  const now = input.now ?? nowIso();

  const next: TaskRecord = {
    ...task,
    title:
      input.title === undefined
        ? task.title
        : normalizeRequiredText(input.title, "title"),
    notes: input.notes === undefined ? task.notes : input.notes,
    tags: input.tags === undefined ? task.tags : normalizeTags(input.tags),
    updatedAt: now,
  };

  await putTask(store, input.workspaceId, next);
  await emitTaskEvent(store, input.workspaceId, {
    type: "task.updated",
    subjectId: next.id,
    occurredAt: now,
    data: {
      title: next.title,
      tags: next.tags,
    },
  });

  return cloneTask(next);
}

export async function setTaskStatus(
  store: BrowserLocalStore,
  input: SetTaskStatusInput,
): Promise<TaskRecord> {
  const task = await requireTask(store, input.workspaceId, input.taskId);

  if (task.status === input.status) {
    return cloneTask(task);
  }

  const now = input.now ?? nowIso();
  const previousStatus = task.status;
  const next: TaskRecord = {
    ...task,
    status: input.status,
    updatedAt: now,
    completedAt: input.status === "done" ? now : null,
    archivedAt: input.status === "archived" ? now : null,
  };

  await putTask(store, input.workspaceId, next);
  await emitTaskEvent(store, input.workspaceId, {
    type: "task.status_changed",
    subjectId: next.id,
    occurredAt: now,
    data: {
      previousStatus,
      status: next.status,
    },
  });

  return cloneTask(next);
}

export async function listTaskEvents(
  store: BrowserLocalStore,
  workspaceId: WorkspaceId,
  taskId?: string,
): Promise<TaskLocalEvent[]> {
  const entries = await store.list<TaskLocalEvent>({
    workspaceId,
    collection: "events",
  });

  return entries
    .filter((entry) => entry.id.startsWith(EVENT_RECORD_PREFIX))
    .map((entry) => entry.value)
    .filter(isTaskLocalEvent)
    .filter((event) => taskId === undefined || event.subjectId === taskId)
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
    .map((event) => structuredClone(event));
}

async function requireTask(
  store: BrowserLocalStore,
  workspaceId: WorkspaceId,
  taskId: string,
): Promise<TaskRecord> {
  const task = await getTask(store, workspaceId, taskId);
  if (!task) {
    throw new Error(`task not found: ${taskId}`);
  }
  return task;
}

async function putTask(
  store: BrowserLocalStore,
  workspaceId: WorkspaceId,
  task: TaskRecord,
): Promise<void> {
  await store.put<TaskRecord>({
    workspaceId,
    collection: "records",
    id: taskRecordId(task.id),
    value: task,
    updatedAt: task.updatedAt,
  });
}

async function emitTaskEvent(
  store: BrowserLocalStore,
  workspaceId: WorkspaceId,
  event: Omit<TaskLocalEvent, "kind" | "domain">,
): Promise<void> {
  const value: TaskLocalEvent = {
    kind: "local_event",
    domain: "tasks",
    ...event,
  };

  await store.put<TaskLocalEvent>({
    workspaceId,
    collection: "events",
    id: `${EVENT_RECORD_PREFIX}${createId("task_evt")}`,
    value,
    updatedAt: event.occurredAt,
  });
}

function taskRecordId(taskId: string): string {
  return `${TASK_RECORD_PREFIX}${taskId}`;
}

function matchesTaskFilter(task: TaskRecord, filter: TaskListFilter): boolean {
  if (!matchesStatus(task, filter.status ?? "active")) {
    return false;
  }
  if (filter.tag && !task.tags.includes(filter.tag)) {
    return false;
  }
  if (!filter.query) {
    return true;
  }

  const query = filter.query.trim().toLocaleLowerCase();
  if (query === "") {
    return true;
  }

  const searchable = [task.title, task.notes, ...task.tags]
    .join(" ")
    .toLocaleLowerCase();
  return searchable.includes(query);
}

function matchesStatus(
  task: TaskRecord,
  status: TaskListFilter["status"],
): boolean {
  if (status === "all") {
    return true;
  }
  if (status === "active") {
    return task.status !== "archived";
  }
  if (Array.isArray(status)) {
    return status.includes(task.status);
  }
  return task.status === status;
}

function compareTasks(left: TaskRecord, right: TaskRecord): number {
  const created = left.createdAt.localeCompare(right.createdAt);
  return created === 0 ? left.id.localeCompare(right.id) : created;
}

function normalizeRequiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized === "") {
    throw new Error(`${field} is required`);
  }
  return normalized;
}

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const tag of tags) {
    const value = tag.trim();
    if (value !== "" && !seen.has(value)) {
      seen.add(value);
      normalized.push(value);
    }
  }

  return normalized;
}

function isTaskRecord(value: LocalStoreJson): value is TaskRecord {
  return (
    isJsonObject(value) &&
    value.kind === "task" &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.notes === "string" &&
    isTaskStatus(value.status) &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => typeof tag === "string") &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    (typeof value.completedAt === "string" || value.completedAt === null) &&
    (typeof value.archivedAt === "string" || value.archivedAt === null)
  );
}

function isTaskLocalEvent(value: LocalStoreJson): value is TaskLocalEvent {
  return (
    isJsonObject(value) &&
    value.kind === "local_event" &&
    value.domain === "tasks" &&
    isTaskEventType(value.type) &&
    typeof value.subjectId === "string" &&
    typeof value.occurredAt === "string" &&
    isJsonObject(value.data)
  );
}

function isTaskStatus(value: LocalStoreJson): value is TaskStatus {
  return (
    value === "todo" ||
    value === "in_progress" ||
    value === "done" ||
    value === "archived"
  );
}

function isTaskEventType(value: LocalStoreJson): value is TaskEventType {
  return (
    value === "task.created" ||
    value === "task.updated" ||
    value === "task.status_changed"
  );
}

function isJsonObject(
  value: LocalStoreJson,
): value is { [key: string]: LocalStoreJson } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneTask(task: TaskRecord): TaskRecord {
  return structuredClone(task);
}

function createId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? fallbackRandomId();
  return `${prefix}_${random.replaceAll("-", "")}`;
}

function fallbackRandomId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}
