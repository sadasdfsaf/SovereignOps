import type {
  BrowserLocalStore,
  LocalStoreJson,
  WorkspaceId,
} from "./localStore.ts";

export type MarkdownDocumentDraft = {
  kind: "markdown_document_draft";
  id: string;
  title: string;
  markdown: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  lastSavedAt: string | null;
} & { [key: string]: LocalStoreJson };

export interface MarkdownDocumentEditorState {
  draft: MarkdownDocumentDraft | null;
  isDirty: boolean;
}

export type MarkdownDocumentAction =
  | { type: "draft.loaded"; draft: MarkdownDocumentDraft }
  | { type: "draft.created"; draft: MarkdownDocumentDraft }
  | { type: "title.changed"; title: string; now?: string }
  | { type: "markdown.changed"; markdown: string; now?: string }
  | { type: "draft.saved"; savedAt: string }
  | { type: "draft.reset" };

export type DocumentEventType =
  | "document_draft.saved"
  | "document_draft.deleted";

export type DocumentLocalEvent = {
  kind: "local_event";
  domain: "documents";
  type: DocumentEventType;
  subjectId: string;
  occurredAt: string;
  data: { [key: string]: LocalStoreJson };
} & { [key: string]: LocalStoreJson };

export interface CreateMarkdownDraftInput {
  id?: string;
  title: string;
  markdown?: string;
  now?: string;
}

export interface SaveMarkdownDraftOptions {
  workspaceId: WorkspaceId;
  now?: string;
}

export const emptyMarkdownDocumentEditorState: MarkdownDocumentEditorState = {
  draft: null,
  isDirty: false,
};

const DOCUMENT_RECORD_PREFIX = "document:";
const EVENT_RECORD_PREFIX = "event:";

export function createMarkdownDraft(
  input: CreateMarkdownDraftInput,
): MarkdownDocumentDraft {
  const now = input.now ?? nowIso();
  return {
    kind: "markdown_document_draft",
    id: input.id ?? createId("doc"),
    title: normalizeRequiredText(input.title, "title"),
    markdown: input.markdown ?? "",
    revision: 1,
    createdAt: now,
    updatedAt: now,
    lastSavedAt: null,
  };
}

export function markdownDocumentReducer(
  state: MarkdownDocumentEditorState,
  action: MarkdownDocumentAction,
): MarkdownDocumentEditorState {
  switch (action.type) {
    case "draft.loaded":
    case "draft.created":
      return {
        draft: cloneDraft(action.draft),
        isDirty: action.draft.lastSavedAt === null,
      };
    case "title.changed":
      return updateDraftText(state, "title", action.title, action.now);
    case "markdown.changed":
      return updateDraftText(state, "markdown", action.markdown, action.now);
    case "draft.saved":
      return state.draft
        ? {
            draft: {
              ...state.draft,
              updatedAt: action.savedAt,
              lastSavedAt: action.savedAt,
            },
            isDirty: false,
          }
        : state;
    case "draft.reset":
      return emptyMarkdownDocumentEditorState;
  }
}

export async function loadMarkdownDraft(
  store: BrowserLocalStore,
  workspaceId: WorkspaceId,
  documentId: string,
): Promise<MarkdownDocumentDraft | undefined> {
  const entry = await store.get<MarkdownDocumentDraft>({
    workspaceId,
    collection: "records",
    id: documentRecordId(documentId),
  });

  return entry && isMarkdownDocumentDraft(entry.value)
    ? cloneDraft(entry.value)
    : undefined;
}

export async function listMarkdownDrafts(
  store: BrowserLocalStore,
  workspaceId: WorkspaceId,
): Promise<MarkdownDocumentDraft[]> {
  const entries = await store.list<MarkdownDocumentDraft>({
    workspaceId,
    collection: "records",
  });

  return entries
    .filter((entry) => entry.id.startsWith(DOCUMENT_RECORD_PREFIX))
    .map((entry) => entry.value)
    .filter(isMarkdownDocumentDraft)
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
    .map(cloneDraft);
}

export async function saveMarkdownDraft(
  store: BrowserLocalStore,
  draft: MarkdownDocumentDraft,
  options: SaveMarkdownDraftOptions,
): Promise<MarkdownDocumentDraft> {
  const savedAt = options.now ?? nowIso();
  const saved: MarkdownDocumentDraft = {
    ...draft,
    updatedAt: savedAt,
    lastSavedAt: savedAt,
  };

  await store.put<MarkdownDocumentDraft>({
    workspaceId: options.workspaceId,
    collection: "records",
    id: documentRecordId(saved.id),
    value: saved,
    updatedAt: savedAt,
  });
  await emitDocumentEvent(store, options.workspaceId, {
    type: "document_draft.saved",
    subjectId: saved.id,
    occurredAt: savedAt,
    data: {
      title: saved.title,
      revision: saved.revision,
    },
  });

  return cloneDraft(saved);
}

export async function saveMarkdownEditorDraft(
  store: BrowserLocalStore,
  state: MarkdownDocumentEditorState,
  options: SaveMarkdownDraftOptions,
): Promise<MarkdownDocumentEditorState> {
  if (!state.draft) {
    throw new Error("draft is required");
  }

  const saved = await saveMarkdownDraft(store, state.draft, options);
  return {
    draft: saved,
    isDirty: false,
  };
}

export async function deleteMarkdownDraft(
  store: BrowserLocalStore,
  workspaceId: WorkspaceId,
  documentId: string,
  now = nowIso(),
): Promise<boolean> {
  const deleted = await store.delete({
    workspaceId,
    collection: "records",
    id: documentRecordId(documentId),
  });

  if (deleted) {
    await emitDocumentEvent(store, workspaceId, {
      type: "document_draft.deleted",
      subjectId: documentId,
      occurredAt: now,
      data: {},
    });
  }

  return deleted;
}

export async function listDocumentEvents(
  store: BrowserLocalStore,
  workspaceId: WorkspaceId,
  documentId?: string,
): Promise<DocumentLocalEvent[]> {
  const entries = await store.list<DocumentLocalEvent>({
    workspaceId,
    collection: "events",
  });

  return entries
    .filter((entry) => entry.id.startsWith(EVENT_RECORD_PREFIX))
    .map((entry) => entry.value)
    .filter(isDocumentLocalEvent)
    .filter((event) => documentId === undefined || event.subjectId === documentId)
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
    .map((event) => structuredClone(event));
}

function updateDraftText(
  state: MarkdownDocumentEditorState,
  field: "title" | "markdown",
  value: string,
  now = nowIso(),
): MarkdownDocumentEditorState {
  if (!state.draft || state.draft[field] === value) {
    return state;
  }

  return {
    draft: {
      ...state.draft,
      [field]: field === "title" ? normalizeRequiredText(value, "title") : value,
      revision: state.draft.revision + 1,
      updatedAt: now,
    },
    isDirty: true,
  };
}

async function emitDocumentEvent(
  store: BrowserLocalStore,
  workspaceId: WorkspaceId,
  event: Omit<DocumentLocalEvent, "kind" | "domain">,
): Promise<void> {
  const value: DocumentLocalEvent = {
    kind: "local_event",
    domain: "documents",
    ...event,
  };

  await store.put<DocumentLocalEvent>({
    workspaceId,
    collection: "events",
    id: `${EVENT_RECORD_PREFIX}${createId("doc_evt")}`,
    value,
    updatedAt: event.occurredAt,
  });
}

function documentRecordId(documentId: string): string {
  return `${DOCUMENT_RECORD_PREFIX}${documentId}`;
}

function isMarkdownDocumentDraft(
  value: LocalStoreJson,
): value is MarkdownDocumentDraft {
  return (
    isJsonObject(value) &&
    value.kind === "markdown_document_draft" &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.markdown === "string" &&
    typeof value.revision === "number" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    (typeof value.lastSavedAt === "string" || value.lastSavedAt === null)
  );
}

function isDocumentLocalEvent(value: LocalStoreJson): value is DocumentLocalEvent {
  return (
    isJsonObject(value) &&
    value.kind === "local_event" &&
    value.domain === "documents" &&
    isDocumentEventType(value.type) &&
    typeof value.subjectId === "string" &&
    typeof value.occurredAt === "string" &&
    isJsonObject(value.data)
  );
}

function isDocumentEventType(value: LocalStoreJson): value is DocumentEventType {
  return value === "document_draft.saved" || value === "document_draft.deleted";
}

function isJsonObject(
  value: LocalStoreJson,
): value is { [key: string]: LocalStoreJson } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRequiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized === "") {
    throw new Error(`${field} is required`);
  }
  return normalized;
}

function cloneDraft(draft: MarkdownDocumentDraft): MarkdownDocumentDraft {
  return structuredClone(draft);
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
