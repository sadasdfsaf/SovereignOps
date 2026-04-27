const COMPLETED_STATES = new Set(["complete", "completed", "done", "released"]);

export function draftReleaseNotes(context, input = {}) {
  context.requireCapability("read_completed_tasks");
  context.requireCapability("propose_release_notes");

  const tasks = normalizeTasks(input.tasks);
  context.audit("release_notes.tasks_scanned", {
    taskCount: tasks.length,
  });
  context.tick(Math.max(1, tasks.length), "classify_tasks");

  const completedTasks = tasks.filter((task) => COMPLETED_STATES.has(task.status));
  const omittedTaskIds = tasks
    .filter((task) => !COMPLETED_STATES.has(task.status))
    .map((task) => task.id);

  context.audit("release_notes.completed_selected", {
    completedCount: completedTasks.length,
    omittedCount: omittedTaskIds.length,
  });
  context.tick(Math.max(1, completedTasks.length), "draft_release_notes");

  return {
    type: "release_notes_proposal",
    proposalOnly: true,
    releaseName: cleanString(input.releaseName) || "Next Release",
    summary: buildSummary(completedTasks),
    sections: buildSections(completedTasks),
    sourceTaskIds: completedTasks.map((task) => task.id),
    omittedTaskIds,
    nextStep: "Review the proposal before publication.",
  };
}

export default {
  draftReleaseNotes,
};

function normalizeTasks(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((task, index) => normalizeTask(task, index));
}

function normalizeTask(value, index) {
  const record = isRecord(value) ? value : {};
  const id = cleanString(record.id) || `task-${index + 1}`;
  const title = cleanString(record.title) || "Untitled task";
  const summary = cleanString(record.summary) || cleanString(record.description);
  const category = cleanString(record.category) || "Updates";
  const status = cleanString(record.status).toLowerCase() || "unknown";
  const labels = Array.isArray(record.labels)
    ? record.labels.map(cleanString).filter(Boolean)
    : [];

  return {
    id,
    title,
    summary,
    category,
    status,
    labels,
  };
}

function buildSummary(tasks) {
  if (tasks.length === 0) {
    return "No completed tasks were supplied for this draft.";
  }

  const categories = unique(tasks.map((task) => task.category));
  return `${tasks.length} completed task${tasks.length === 1 ? "" : "s"} across ${categories.length} section${categories.length === 1 ? "" : "s"} are ready for review.`;
}

function buildSections(tasks) {
  const sectionsByCategory = new Map();

  for (const task of tasks) {
    const section = sectionsByCategory.get(task.category) ?? {
      heading: task.category,
      items: [],
    };
    section.items.push(formatReleaseItem(task));
    sectionsByCategory.set(task.category, section);
  }

  return [...sectionsByCategory.values()];
}

function formatReleaseItem(task) {
  const labelSuffix = task.labels.length > 0 ? ` (${task.labels.join(", ")})` : "";
  const summarySuffix = task.summary ? `: ${task.summary}` : "";
  return `${task.title}${labelSuffix}${summarySuffix}`;
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
