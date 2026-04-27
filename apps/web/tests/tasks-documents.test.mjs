import assert from "node:assert/strict";

import { createInMemoryLocalStore } from "../src/localStore.ts";
import {
  createTask,
  listTaskEvents,
  listTasks,
  setTaskStatus,
  updateTask,
} from "../src/tasks.ts";
import {
  createMarkdownDraft,
  deleteMarkdownDraft,
  emptyMarkdownDocumentEditorState,
  listDocumentEvents,
  listMarkdownDrafts,
  loadMarkdownDraft,
  markdownDocumentReducer,
  saveMarkdownDraft,
  saveMarkdownEditorDraft,
} from "../src/documents.ts";

async function testTaskListFilteringAndEvents() {
  const store = createInMemoryLocalStore();

  await createTask(store, {
    workspaceId: "wsp_alpha",
    id: "task_write",
    title: "Write release notes",
    notes: "Capture the latest changes",
    tags: ["writing", "release", "writing", " "],
    now: "2026-04-27T01:00:00.000Z",
  });
  await createTask(store, {
    workspaceId: "wsp_alpha",
    id: "task_import",
    title: "Review data import",
    notes: "Check field mappings",
    tags: ["data"],
    now: "2026-04-27T01:01:00.000Z",
  });
  await createTask(store, {
    workspaceId: "wsp_alpha",
    id: "task_old",
    title: "Archive sample",
    status: "archived",
    tags: ["sample"],
    now: "2026-04-27T01:02:00.000Z",
  });

  const active = await listTasks(store, "wsp_alpha");
  assert.deepEqual(
    active.map((task) => task.id),
    ["task_write", "task_import"],
  );
  assert.deepEqual(active[0].tags, ["writing", "release"]);

  const writing = await listTasks(store, "wsp_alpha", {
    query: "latest",
    tag: "writing",
  });
  assert.deepEqual(
    writing.map((task) => task.id),
    ["task_write"],
  );

  const archived = await listTasks(store, "wsp_alpha", { status: "archived" });
  assert.deepEqual(
    archived.map((task) => task.id),
    ["task_old"],
  );

  const events = await listTaskEvents(store, "wsp_alpha");
  assert.equal(events.length, 3);
  assert.deepEqual(
    events.map((event) => event.type),
    ["task.created", "task.created", "task.created"],
  );
}

async function testTaskStatusChangeAndUpdateEvents() {
  const store = createInMemoryLocalStore();
  await createTask(store, {
    workspaceId: "wsp_alpha",
    id: "task_status",
    title: "Prepare handoff",
    now: "2026-04-27T02:00:00.000Z",
  });

  const changed = await setTaskStatus(store, {
    workspaceId: "wsp_alpha",
    taskId: "task_status",
    status: "done",
    now: "2026-04-27T02:05:00.000Z",
  });
  assert.equal(changed.status, "done");
  assert.equal(changed.completedAt, "2026-04-27T02:05:00.000Z");

  await updateTask(store, {
    workspaceId: "wsp_alpha",
    taskId: "task_status",
    title: "Prepare clean handoff",
    tags: ["handoff"],
    now: "2026-04-27T02:06:00.000Z",
  });

  await setTaskStatus(store, {
    workspaceId: "wsp_alpha",
    taskId: "task_status",
    status: "done",
    now: "2026-04-27T02:07:00.000Z",
  });

  const events = await listTaskEvents(store, "wsp_alpha", "task_status");
  assert.deepEqual(
    events.map((event) => event.type),
    ["task.created", "task.status_changed", "task.updated"],
  );
  assert.equal(events[1].data.previousStatus, "todo");
  assert.equal(events[1].data.status, "done");
}

function testMarkdownDocumentReducer() {
  const draft = createMarkdownDraft({
    id: "doc_notes",
    title: "Working Notes",
    markdown: "# Start\n",
    now: "2026-04-27T03:00:00.000Z",
  });

  let state = markdownDocumentReducer(emptyMarkdownDocumentEditorState, {
    type: "draft.created",
    draft,
  });
  assert.equal(state.isDirty, true);
  assert.equal(state.draft?.revision, 1);

  const sameState = markdownDocumentReducer(state, {
    type: "markdown.changed",
    markdown: "# Start\n",
    now: "2026-04-27T03:01:00.000Z",
  });
  assert.equal(sameState, state);

  state = markdownDocumentReducer(state, {
    type: "markdown.changed",
    markdown: "# Start\n\n- Next item\n",
    now: "2026-04-27T03:02:00.000Z",
  });
  assert.equal(state.isDirty, true);
  assert.equal(state.draft?.revision, 2);
  assert.equal(state.draft?.updatedAt, "2026-04-27T03:02:00.000Z");

  state = markdownDocumentReducer(state, {
    type: "draft.saved",
    savedAt: "2026-04-27T03:03:00.000Z",
  });
  assert.equal(state.isDirty, false);
  assert.equal(state.draft?.lastSavedAt, "2026-04-27T03:03:00.000Z");
}

async function testMarkdownDraftPersistenceAndEvents() {
  const store = createInMemoryLocalStore();
  const draft = createMarkdownDraft({
    id: "doc_plan",
    title: "Project Notes",
    markdown: "## Goals\n\n- Keep changes scoped\n",
    now: "2026-04-27T04:00:00.000Z",
  });

  const saved = await saveMarkdownDraft(store, draft, {
    workspaceId: "wsp_alpha",
    now: "2026-04-27T04:01:00.000Z",
  });
  assert.equal(saved.lastSavedAt, "2026-04-27T04:01:00.000Z");

  const loaded = await loadMarkdownDraft(store, "wsp_alpha", "doc_plan");
  assert.equal(loaded?.markdown, "## Goals\n\n- Keep changes scoped\n");

  let state = markdownDocumentReducer(emptyMarkdownDocumentEditorState, {
    type: "draft.loaded",
    draft: loaded,
  });
  state = markdownDocumentReducer(state, {
    type: "title.changed",
    title: "Project Notes Updated",
    now: "2026-04-27T04:02:00.000Z",
  });

  const savedState = await saveMarkdownEditorDraft(store, state, {
    workspaceId: "wsp_alpha",
    now: "2026-04-27T04:03:00.000Z",
  });
  assert.equal(savedState.isDirty, false);
  assert.equal(savedState.draft?.revision, 2);

  const drafts = await listMarkdownDrafts(store, "wsp_alpha");
  assert.deepEqual(
    drafts.map((item) => item.id),
    ["doc_plan"],
  );
  assert.equal(drafts[0].title, "Project Notes Updated");

  assert.equal(
    await deleteMarkdownDraft(
      store,
      "wsp_alpha",
      "doc_plan",
      "2026-04-27T04:04:00.000Z",
    ),
    true,
  );
  assert.equal(await loadMarkdownDraft(store, "wsp_alpha", "doc_plan"), undefined);

  const events = await listDocumentEvents(store, "wsp_alpha", "doc_plan");
  assert.deepEqual(
    events.map((event) => event.type),
    [
      "document_draft.saved",
      "document_draft.saved",
      "document_draft.deleted",
    ],
  );
  assert.equal(events[1].data.revision, 2);
}

await testTaskListFilteringAndEvents();
await testTaskStatusChangeAndUpdateEvents();
testMarkdownDocumentReducer();
await testMarkdownDraftPersistenceAndEvents();

console.log("tasks and documents tests passed");
