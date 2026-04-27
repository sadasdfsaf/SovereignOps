import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createPluginSandboxHarness,
  normalizePluginManifest,
  validatePluginManifest,
} from "../src/index.ts";

const releaseNotesManifestUrl = new URL(
  "../../../examples/plugins/release-notes/manifest.json",
  import.meta.url,
);
const releaseNotesModuleUrl = new URL(
  "../../../examples/plugins/release-notes/index.mjs",
  import.meta.url,
);
const workspaceSummarizerManifestUrl = new URL(
  "../../../examples/plugins/workspace-summarizer/manifest.json",
  import.meta.url,
);
const workspaceSummarizerModuleUrl = new URL(
  "../../../examples/plugins/workspace-summarizer/index.mjs",
  import.meta.url,
);

test("validates example plugin manifests with proposal-only permissions", () => {
  const releaseNotesManifest = readJson(releaseNotesManifestUrl);
  const workspaceSummarizerManifest = readJson(workspaceSummarizerManifestUrl);

  for (const manifest of [releaseNotesManifest, workspaceSummarizerManifest]) {
    const result = validatePluginManifest(manifest);

    assert.equal(result.ok, true, JSON.stringify(result.issues));
    assert.equal(result.value.entrypoint, "index.mjs");
    assert.deepEqual(result.value.permissions, [
      "propose_agent_action",
      "read_object",
    ]);
    assert.equal(result.value.permissions.includes("write_object"), false);
    assert.ok(result.value.capabilities.length >= 2);
    assert.ok(result.value.tools.length >= 1);
    assert.ok(result.value.resources.length >= 1);
  }
});

test("drafts release notes from completed tasks inside the sandbox harness", async () => {
  const manifest = normalizePluginManifest(readJson(releaseNotesManifestUrl));
  const { draftReleaseNotes } = await import(releaseNotesModuleUrl);
  const harness = harnessForManifest(manifest);

  const result = harness.run((context) => draftReleaseNotes(context, {
    releaseName: "Example 0.4.0",
    tasks: [
      {
        id: "task-export",
        title: "Add export checklist",
        summary: "Adds a repeatable package review step.",
        status: "done",
        category: "Exports",
        labels: ["docs"],
      },
      {
        id: "task-draft",
        title: "Draft onboarding notes",
        status: "in_progress",
        category: "Docs",
      },
      {
        id: "task-validation",
        title: "Tighten validation output",
        summary: "Makes failed checks easier to scan.",
        status: "completed",
        category: "Reliability",
      },
    ],
  }));

  assert.equal(result.ok, true);
  assert.equal(result.value.type, "release_notes_proposal");
  assert.equal(result.value.proposalOnly, true);
  assert.deepEqual(result.value.sourceTaskIds, ["task-export", "task-validation"]);
  assert.deepEqual(result.value.omittedTaskIds, ["task-draft"]);
  assert.deepEqual(
    result.value.sections.map((section) => section.heading),
    ["Exports", "Reliability"],
  );
  assert.ok(result.value.sections[0].items[0].includes("Add export checklist"));
  assert.ok(hasPluginAudit(result, "release_notes.completed_selected"));
  assert.equal(result.ticks, 5);
});

test("builds a workspace summary proposal inside the sandbox harness", async () => {
  const manifest = normalizePluginManifest(readJson(workspaceSummarizerManifestUrl));
  const { summarizeWorkspace } = await import(workspaceSummarizerModuleUrl);
  const harness = harnessForManifest(manifest);

  const result = harness.run((context) => summarizeWorkspace(context, {
    focus: "Package readiness",
    docs: [
      {
        id: "doc-sync",
        title: "Sync Design",
        state: "current",
        tags: ["architecture"],
      },
      {
        id: "doc-plugin",
        title: "Plugin Guide",
        state: "draft",
      },
    ],
    tasks: [
      {
        id: "task-sdk",
        title: "Finish SDK checks",
        status: "done",
      },
      {
        id: "task-smoke",
        title: "Run smoke checks",
        status: "queued",
        assignee: "AA",
      },
    ],
    auditEvents: [
      {
        id: "event-1",
        type: "object.created",
        objectId: "doc-sync",
      },
      {
        id: "event-2",
        type: "object.updated",
        objectId: "task-smoke",
      },
    ],
  }));

  assert.equal(result.ok, true);
  assert.equal(result.value.type, "workspace_summary_proposal");
  assert.equal(result.value.proposalOnly, true);
  assert.deepEqual(result.value.sourceCounts, {
    auditEvents: 2,
    docs: 2,
    tasks: 2,
  });
  assert.deepEqual(
    result.value.sections.map((section) => section.heading),
    ["Documents", "Tasks", "Audit Metadata"],
  );
  assert.ok(result.value.sections[1].items[0].includes("done: 1"));
  assert.ok(result.value.sections[1].items[0].includes("queued: 1"));
  assert.ok(result.value.sections[1].items[1].includes("Run smoke checks"));
  assert.ok(hasPluginAudit(result, "workspace_summary.proposal_built"));
  assert.equal(result.ticks, 9);
});

test("example plugins require proposal capabilities before returning drafts", async () => {
  const { draftReleaseNotes } = await import(releaseNotesModuleUrl);
  const { summarizeWorkspace } = await import(workspaceSummarizerModuleUrl);

  const releaseNotesResult = createPluginSandboxHarness({
    capabilities: ["read_completed_tasks"],
  }).run((context) => draftReleaseNotes(context, { tasks: [] }));
  assert.equal(releaseNotesResult.ok, false);
  assert.equal(releaseNotesResult.error.code, "SANDBOX_CAPABILITY_DENIED");

  const workspaceResult = createPluginSandboxHarness({
    capabilities: ["read_workspace_metadata"],
  }).run((context) => summarizeWorkspace(context, {}));
  assert.equal(workspaceResult.ok, false);
  assert.equal(workspaceResult.error.code, "SANDBOX_CAPABILITY_DENIED");
});

function harnessForManifest(manifest) {
  return createPluginSandboxHarness({
    capabilities: manifest.capabilities.map((capability) => capability.id),
    limits: {
      maxAuditEvents: 32,
      maxTicks: 64,
    },
  });
}

function readJson(url) {
  return JSON.parse(readFileSync(url, "utf8"));
}

function hasPluginAudit(result, type) {
  return result.audit.some((event) => (
    event.type === "plugin.audit" &&
    event.detail.type === type
  ));
}
