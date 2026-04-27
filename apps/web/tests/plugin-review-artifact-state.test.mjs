import assert from "node:assert/strict";

import {
  buildPluginReviewActionButtons,
  buildPluginReviewArtifactEmptyState,
  buildPluginReviewArtifactErrorState,
  buildPluginReviewArtifactState,
  buildPluginReviewAuditCounters,
  buildPluginReviewGateRows,
  buildPluginReviewLocalEvidenceRows,
  buildPluginReviewSandboxFindingRows,
  buildPluginReviewSummaryCards,
} from "../src/pluginReviewArtifactState.ts";

const timestamps = {
  first: "2026-04-27T06:00:00.000Z",
  second: "2026-04-27T06:05:00.000Z",
  third: "2026-04-27T06:10:00.000Z",
};

const reviewArtifact = {
  artifactId: "plugin_review_release_notes_001",
  schemaVersion: "plugin-review-artifact.v1",
  generatedAt: timestamps.third,
  fingerprint: "fnv1a64:release-notes-review",
  plugin: {
    id: "plugin.release-notes",
    name: "Release Notes",
    version: "0.1.0",
  },
  gates: [
    {
      id: "manifest_shape",
      label: "Manifest shape",
      status: "passed",
      details: ["Entrypoint index.mjs is present."],
      evidenceIds: ["ev_manifest"],
    },
    {
      id: "capability_map",
      label: "Capability map",
      status: "warning",
      detail: "Capability notes need one more reviewer pass.",
      evidenceIds: ["ev_manifest"],
    },
    {
      id: "sandbox_run",
      label: "Sandbox run",
      status: "failed",
      details: ["Sandbox review reported a missing capability."],
      evidenceIds: ["ev_sandbox"],
    },
  ],
  sandboxReviews: [
    {
      reviewId: "sandbox-review-release-notes",
      fingerprint: "abc123abc123abc123abc123abc123ab",
      pluginId: "plugin.release-notes",
      runLabel: "draft-release",
      ok: false,
      capabilities: {
        granted: ["read_object"],
        required: ["propose_agent_action", "read_object"],
        observed: ["propose_agent_action"],
        missing: ["propose_agent_action"],
      },
      hostApis: {
        denied: ["fs", "process"],
        deniedObserved: [],
      },
      limits: {
        maxAuditEvents: 8,
        maxTicks: 10,
        ticksUsed: 2,
        ticksRemaining: 8,
        tickBudgetExhausted: false,
      },
      audit: {
        total: 4,
        remaining: 4,
        overflow: false,
        byType: [
          { type: "capability.denied", count: 1 },
          { type: "sandbox.run_started", count: 1 },
        ],
      },
      failureCategories: ["capability"],
      failure: {
        code: "SANDBOX_CAPABILITY_DENIED",
        category: "capability",
      },
    },
    {
      reviewId: "sandbox-review-manifest",
      fingerprint: "def456def456def456def456def456de",
      pluginId: "plugin.release-notes",
      runLabel: "manifest-check",
      ok: true,
      capabilities: {
        granted: ["read_object"],
        required: ["read_object"],
        observed: ["read_object"],
        missing: [],
      },
      hostApis: {
        denied: ["fs", "process"],
        deniedObserved: [],
      },
      limits: {
        maxAuditEvents: 8,
        maxTicks: 10,
        ticksUsed: 1,
        ticksRemaining: 9,
        tickBudgetExhausted: false,
      },
      audit: {
        total: 2,
        remaining: 6,
        overflow: false,
        byType: [{ type: "capability.allowed", count: 1 }],
      },
      failureCategories: ["success"],
    },
  ],
  audit: {
    counters: [
      {
        key: "manual.note",
        label: "Manual notes",
        count: 2,
        lastEventAt: timestamps.second,
        pluginId: "plugin.release-notes",
      },
    ],
    events: [
      {
        type: "artifact.loaded",
        at: timestamps.first,
        pluginId: "plugin.release-notes",
      },
      {
        type: "artifact.loaded",
        at: timestamps.third,
        pluginId: "plugin.release-notes",
      },
      {
        type: "sandbox.reviewed",
        status: "warning",
        at: timestamps.second,
        reviewId: "sandbox-review-release-notes",
      },
    ],
  },
  localEvidence: {
    files: [
      {
        id: "ev_manifest",
        kind: "manifest",
        path: "examples/plugins/release-notes/manifest.json",
        fingerprint: "fnv1a64:manifest",
        byteCount: 512,
      },
      {
        id: "ev_sandbox",
        kind: "sandbox-summary",
        uri: "fixture://plugins/release-notes/sandbox.json",
        fingerprint: "fnv1a64:sandbox",
        recordCount: 2,
      },
      {
        id: "ev_notes",
        kind: "notes",
        path: "examples/plugins/release-notes/README.md",
      },
    ],
  },
  actions: [
    {
      id: "open_manifest",
      label: "Open manifest",
      intent: "secondary",
      section: "evidence",
      targetId: "ev_manifest",
    },
  ],
};

function testBuildsArtifactViewModel() {
  const state = buildPluginReviewArtifactState(reviewArtifact);

  assert.equal(state.artifactId, "plugin_review_release_notes_001");
  assert.equal(state.schemaVersion, "plugin-review-artifact.v1");
  assert.equal(state.pluginId, "plugin.release-notes");
  assert.equal(state.pluginName, "Release Notes");
  assert.equal(state.pluginVersion, "0.1.0");
  assert.equal(state.status, "error");
  assert.equal(state.statusLabel, "Error");
  assert.match(state.headline, /Release Notes review has issues/);

  assert.deepEqual(
    state.summaryCards.map((card) => [card.id, card.status, card.valueLabel]),
    [
      ["plugin_review_summary.plugin", "error", "Error"],
      ["plugin_review_summary.gates", "error", "1/3 passed"],
      ["plugin_review_summary.sandbox", "error", "1 finding"],
      ["plugin_review_summary.audit", "complete", "8 events"],
      ["plugin_review_summary.evidence", "attention", "3 items"],
    ],
  );

  assert.deepEqual(
    state.gateRows.map((row) => [row.gateId, row.status, row.evidenceIds]),
    [
      ["sandbox_run", "failed", ["ev_sandbox"]],
      ["capability_map", "warning", ["ev_manifest"]],
      ["manifest_shape", "passed", ["ev_manifest"]],
    ],
  );

  assert.deepEqual(
    state.sandboxFindingRows.map((row) => [
      row.findingId,
      row.severity,
      row.category,
      row.detailLabels.includes("Missing capability: propose_agent_action"),
    ]),
    [
      [
        "sandbox-review-release-notes.capability",
        "blocking",
        "capability",
        true,
      ],
    ],
  );

  assert.deepEqual(
    state.localEvidenceRows.map((row) => [
      row.evidenceId,
      row.kind,
      row.status,
      row.fingerprint,
    ]),
    [
      ["ev_notes", "notes", "attention", undefined],
      ["ev_manifest", "manifest", "complete", "fnv1a64:manifest"],
      ["ev_sandbox", "sandbox-summary", "complete", "fnv1a64:sandbox"],
    ],
  );

  assert.equal(
    state.actionButtons.find((action) => action.id === "open_manifest")?.enabled,
    true,
  );
  assert.equal(
    state.actionButtons.find((action) => action.id === "continue_review")
      ?.enabled,
    false,
  );
  assert.equal(
    state.actionButtons.find((action) => action.id === "inspect_sandbox")
      ?.intent,
    "danger",
  );
}

function testFocusedBuilders() {
  const cards = buildPluginReviewSummaryCards(reviewArtifact);
  assert.equal(cards.length, 5);
  assert.equal(cards[1].title, "Review gates");

  const gates = buildPluginReviewGateRows(reviewArtifact);
  assert.deepEqual(
    gates.map((gate) => [gate.gateId, gate.statusLabel, gate.actionLabel]),
    [
      ["sandbox_run", "Failed", "Review gate"],
      ["capability_map", "Needs review", "Review gate"],
      ["manifest_shape", "Passed", "Open gate"],
    ],
  );

  const findings = buildPluginReviewSandboxFindingRows(reviewArtifact);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].title, "Capability check failed");

  const counters = buildPluginReviewAuditCounters(reviewArtifact);
  assert.equal(
    counters.find((counter) => counter.key === "artifact.loaded")?.count,
    2,
  );
  assert.equal(
    counters.find((counter) => counter.key === "sandbox.capability.denied")
      ?.count,
    1,
  );
  assert.equal(
    counters.find((counter) => counter.key === "manual.note")?.lastEventAt,
    timestamps.second,
  );

  const evidence = buildPluginReviewLocalEvidenceRows(reviewArtifact);
  assert.equal(evidence[0].statusLabel, "Needs review");

  const actions = buildPluginReviewActionButtons(reviewArtifact);
  assert.deepEqual(
    actions.map((action) => action.id),
    [
      "open_manifest",
      "continue_review",
      "review_gates",
      "inspect_sandbox",
      "open_audit",
      "open_local_evidence",
    ],
  );
}

function testReadyArtifactAndSnakeCase() {
  const state = buildPluginReviewArtifactState({
    artifact_id: "plugin_review_workspace_summary_001",
    schema_version: "plugin-review-artifact.v1",
    generated_at: timestamps.first,
    plugin_id: "plugin.workspace-summarizer",
    plugin_name: "Workspace Summarizer",
    gates: [{ gate_id: "manifest", label: "Manifest", passed: true }],
    sandbox_reviews: [
      {
        review_id: "sandbox-review-workspace-summary",
        fingerprint: "9876543210abcdef9876543210abcdef",
        plugin_id: "plugin.workspace-summarizer",
        ok: true,
        capabilities: {
          granted: ["read_object"],
          required: ["read_object"],
          observed: ["read_object"],
          missing: [],
        },
        audit: {
          total: 1,
          by_type: [{ type: "sandbox.run_completed", count: 1 }],
        },
      },
    ],
    local_evidence: [
      {
        evidence_id: "ev_manifest",
        kind: "manifest",
        uri: "workspace://plugins/workspace-summarizer/manifest.json",
        fingerprint: "fnv1a64:workspace-manifest",
      },
    ],
  });

  assert.equal(state.status, "complete");
  assert.equal(state.isEmpty, false);
  assert.equal(
    state.actionButtons.find((action) => action.id === "continue_review")
      ?.enabled,
    true,
  );
  assert.deepEqual(state.sandboxFindingRows, []);
}

function testFallbackAndErrorStates() {
  const state = buildPluginReviewArtifactState("not an artifact", {
    defaultTimestamp: timestamps.second,
  });

  assert.equal(state.generatedAt, timestamps.second);
  assert.equal(state.pluginName, "Plugin review");
  assert.equal(state.status, "error");
  assert.deepEqual(state.gateRows, []);
  assert.deepEqual(state.summaryCards, []);
  assert.deepEqual(
    state.errorStates.map((error) => [
      error.context,
      error.errorState.label,
      error.errorState.description,
    ]),
    [
      [
        "artifact",
        "Plugin review artifact could not load",
        "Plugin review artifact must be an object.",
      ],
    ],
  );

  assert.deepEqual(buildPluginReviewArtifactEmptyState("sandbox"), {
    id: "plugin_review_sandbox_empty",
    label: "No sandbox findings",
    description: "Sandbox findings will appear when a run needs attention.",
    ariaLabel: "No plugin sandbox findings are available",
  });
  assert.deepEqual(
    buildPluginReviewArtifactErrorState("evidence", new Error("Evidence failed")),
    {
      id: "plugin_review_evidence_error",
      context: "evidence",
      errorState: {
        id: "plugin_review_evidence_error",
        label: "Local evidence could not load",
        description: "Evidence failed",
        ariaLabel: "Local evidence could not load",
        retryLabel: "Retry evidence",
      },
    },
  );
}

function testNoMutation() {
  const frozenArtifact = deepFreeze(structuredClone(reviewArtifact));
  const before = structuredClone(frozenArtifact);

  const state = buildPluginReviewArtifactState(frozenArtifact);
  state.summaryCards[0].detailLabels.push("mutated");
  state.gateRows[0].detailLabels.push("mutated");
  state.gateRows[0].evidenceIds.push("mutated");
  state.sandboxFindingRows[0].detailLabels.push("mutated");
  state.auditCounters[0].pluginIds.push("mutated");
  state.localEvidenceRows[0].detailLabels.push("mutated");
  state.emptyStates.gates.label = "mutated";

  assert.deepEqual(frozenArtifact, before);

  const rebuilt = buildPluginReviewArtifactState(frozenArtifact);
  assert.equal(rebuilt.summaryCards[0].detailLabels.includes("mutated"), false);
  assert.equal(rebuilt.gateRows[0].detailLabels.includes("mutated"), false);
  assert.equal(rebuilt.gateRows[0].evidenceIds.includes("mutated"), false);
  assert.equal(
    rebuilt.sandboxFindingRows[0].detailLabels.includes("mutated"),
    false,
  );
  assert.equal(rebuilt.auditCounters[0].pluginIds.includes("mutated"), false);
  assert.equal(
    rebuilt.localEvidenceRows[0].detailLabels.includes("mutated"),
    false,
  );
  assert.equal(rebuilt.emptyStates.gates.label, "No review gates");
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}

testBuildsArtifactViewModel();
testFocusedBuilders();
testReadyArtifactAndSnakeCase();
testFallbackAndErrorStates();
testNoMutation();

console.log("plugin review artifact state tests passed");
