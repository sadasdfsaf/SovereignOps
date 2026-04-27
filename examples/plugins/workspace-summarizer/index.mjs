const DONE_STATES = new Set(["complete", "completed", "done", "released"]);

export function summarizeWorkspace(context, input = {}) {
  context.requireCapability("read_workspace_metadata");
  context.requireCapability("propose_workspace_summary");

  const docs = normalizeItems(input.docs, normalizeDoc);
  const tasks = normalizeItems(input.tasks, normalizeTask);
  const auditEvents = normalizeItems(input.auditEvents, normalizeAuditEvent);
  const scannedCount = docs.length + tasks.length + auditEvents.length;

  context.audit("workspace_summary.metadata_scanned", {
    auditEventCount: auditEvents.length,
    docCount: docs.length,
    taskCount: tasks.length,
  });
  context.tick(Math.max(1, scannedCount), "scan_metadata");

  const statusCounts = countBy(tasks, (task) => task.status);
  const activeTasks = tasks.filter((task) => !DONE_STATES.has(task.status));

  context.audit("workspace_summary.proposal_built", {
    activeTaskCount: activeTasks.length,
    statusCount: Object.keys(statusCounts).length,
  });
  context.tick(Math.max(1, docs.length + activeTasks.length), "build_summary");

  return {
    type: "workspace_summary_proposal",
    proposalOnly: true,
    focus: cleanString(input.focus) || "Local workspace status",
    sourceCounts: {
      auditEvents: auditEvents.length,
      docs: docs.length,
      tasks: tasks.length,
    },
    sections: [
      {
        heading: "Documents",
        items: summarizeDocs(docs),
      },
      {
        heading: "Tasks",
        items: summarizeTasks(tasks, activeTasks, statusCounts),
      },
      {
        heading: "Audit Metadata",
        items: summarizeAuditEvents(auditEvents),
      },
    ],
    nextStep: "Review the proposal before sharing or storing it.",
  };
}

export default {
  summarizeWorkspace,
};

function normalizeItems(value, normalize) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item, index) => normalize(item, index));
}

function normalizeDoc(value, index) {
  const record = isRecord(value) ? value : {};
  return {
    id: cleanString(record.id) || `doc-${index + 1}`,
    title: cleanString(record.title) || "Untitled document",
    state: cleanString(record.state) || "available",
    tags: normalizeStringArray(record.tags),
  };
}

function normalizeTask(value, index) {
  const record = isRecord(value) ? value : {};
  return {
    id: cleanString(record.id) || `task-${index + 1}`,
    title: cleanString(record.title) || "Untitled task",
    status: cleanString(record.status).toLowerCase() || "unknown",
    assignee: cleanString(record.assignee),
  };
}

function normalizeAuditEvent(value, index) {
  const record = isRecord(value) ? value : {};
  return {
    id: cleanString(record.id) || `event-${index + 1}`,
    type: cleanString(record.type) || "event",
    objectId: cleanString(record.objectId),
  };
}

function summarizeDocs(docs) {
  if (docs.length === 0) {
    return ["No document metadata was supplied."];
  }

  return docs.map((doc) => {
    const tagSuffix = doc.tags.length > 0 ? ` [${doc.tags.join(", ")}]` : "";
    return `${doc.title} is ${doc.state}${tagSuffix}.`;
  });
}

function summarizeTasks(tasks, activeTasks, statusCounts) {
  if (tasks.length === 0) {
    return ["No task metadata was supplied."];
  }

  const statusLine = Object.entries(statusCounts)
    .map(([status, count]) => `${status}: ${count}`)
    .join(", ");
  const activeLine = activeTasks.length === 0
    ? "No active tasks were supplied."
    : `${activeTasks.length} active task${activeTasks.length === 1 ? "" : "s"} need review: ${activeTasks.map((task) => task.title).join("; ")}.`;

  return [
    `Task statuses: ${statusLine}.`,
    activeLine,
  ];
}

function summarizeAuditEvents(auditEvents) {
  if (auditEvents.length === 0) {
    return ["No audit metadata was supplied."];
  }

  return auditEvents.slice(-5).map((event) => {
    const objectSuffix = event.objectId ? ` for ${event.objectId}` : "";
    return `${event.type}${objectSuffix}.`;
  });
}

function countBy(items, keyFor) {
  const counts = {};
  for (const item of items) {
    const key = keyFor(item) || "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value.map(cleanString).filter(Boolean)
    : [];
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
