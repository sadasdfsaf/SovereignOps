import assert from "node:assert/strict";

import {
  buildPluginReviewArtifactApiActionButtons,
  buildPluginReviewArtifactApiEmptyState,
  buildPluginReviewArtifactApiErrorState,
  buildPluginReviewArtifactApiErrorStates,
  buildPluginReviewArtifactApiRedactionCounts,
  buildPluginReviewArtifactApiRedactionSummary,
  buildPluginReviewArtifactApiRequestCards,
  buildPluginReviewArtifactApiResponseStatus,
  buildPluginReviewArtifactApiSourceFileRows,
  buildPluginReviewArtifactApiState,
} from "../src/pluginReviewArtifactApiState.ts";

const timestamps = {
  preview: "2026-04-27T07:00:00.000Z",
  replay: "2026-04-27T07:05:00.000Z",
};

function buildPreview() {
  return {
    kind: "plugin-review-artifact.preview",
    schemaVersion: "plugin-review-artifact-preview.v1",
    generatedAt: timestamps.preview,
    artifactId: "plugin_review_artifact.review_helper.abcdef123456",
    fingerprint:
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    plugin: {
      id: "plugin.review-helper",
      name: "Review Helper",
      version: "0.1.0",
      manifestPath: "examples/plugins/review-helper/manifest.json",
      entrypoint: "examples/plugins/review-helper/index.mjs",
      fingerprint:
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    },
    sources: {
      manifest: {
        path: "examples/plugins/review-helper/manifest.json",
        sha256:
          "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        bytes: 1024,
      },
      sandboxReviews: [
        {
          path: "examples/plugins/review-helper/sandbox.json",
          sha256:
            "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
          bytes: 512,
          itemCount: 1,
        },
      ],
      automationGateSummaries: [
        {
          path: "examples/plugins/review-helper/gates.json",
          sha256:
            "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
          bytes: 256,
          itemCount: 1,
        },
      ],
      automationAuditSummaries: [
        {
          path: "examples/plugins/review-helper/audit.json",
          sha256:
            "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
          bytes: 384,
          itemCount: 1,
        },
      ],
    },
    summary: {
      capabilityCount: 2,
      toolCount: 1,
      resourceCount: 1,
      promptCount: 0,
      sandboxReviewCount: 1,
      sandboxFailureCount: 0,
      sandboxWarningCount: 1,
      sandboxFindingCount: 2,
      automationGateSummaryCount: 1,
      requiredGateCount: 1,
      automationAuditSummaryCount: 1,
      automationAuditEventCount: 3,
      redactionCount: 3,
    },
    sandboxReviews: [
      {
        id: "sandbox_warning",
        outcome: "warning",
        title: "Fixture coverage warning",
        checkedAt: timestamps.preview,
        pluginId: "plugin.review-helper",
        findingCount: 2,
        fingerprint:
          "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      },
    ],
    automationGateSummaries: [
      {
        id: "automation_gate.review_checklist",
        gateId: "review_checklist",
        label: "Review checklist",
        status: "required",
        pluginIds: ["plugin.review-helper"],
        ruleIds: ["rule_review_helper"],
        affectedRuleCount: 1,
      },
    ],
    automationAuditSummaries: [
      {
        id: "audit_review_helper",
        status: "warning",
        count: 3,
        pluginIds: ["plugin.review-helper"],
        ruleIds: ["rule_review_helper"],
        lastEventAt: timestamps.preview,
      },
    ],
    redactions: [
      {
        path: "$.sandboxReviews[0].details.apiToken",
        reason: "sensitive_key",
      },
      {
        path: "$.automationGateSummaries[0].details.authorization",
        reason: "sensitive_key",
      },
      {
        path: "$.automationAuditSummaries[0].details.sessionToken",
        reason: "sensitive_key",
      },
    ],
  };
}

function buildReplay() {
  return {
    schemaVersion: "plugin-review-artifact-api-requests.v1",
    generatedAt: timestamps.replay,
    apiBase: "http://127.0.0.1:7317",
    requests: [
      {
        id: "api_plugin_review_artifact_preview",
        title: "Build plugin review artifact preview",
        route: {
          method: "POST",
          path: "/v1/plugins/review-artifacts/preview",
        },
        request: {
          body: {
            manifestPath: "examples/plugins/review-helper/manifest.json",
          },
        },
        response: {
          status: 200,
          body: buildPreview(),
        },
      },
    ],
  };
}

function testReplayBuildsApiState() {
  const replay = buildReplay();
  const original = structuredClone(replay);
  const state = buildPluginReviewArtifactApiState(replay, {
    apiBase: "http://127.0.0.1:7317",
  });

  assert.deepEqual(replay, original);
  assert.equal(state.generatedAt, timestamps.replay);
  assert.equal(state.status, "attention");
  assert.equal(state.responseStatus.status, "complete");
  assert.equal(state.responseStatus.statusCode, 200);
  assert.deepEqual(
    state.requestCards.map((card) => [
      card.requestId,
      card.method,
      card.routePath,
      card.status,
      card.statusCode,
    ]),
    [
      [
        "api_plugin_review_artifact_preview",
        "POST",
        "/v1/plugins/review-artifacts/preview",
        "complete",
        200,
      ],
    ],
  );

  assert.equal(state.artifact.pluginName, "Review Helper");
  assert.equal(state.artifact.artifactId, "plugin_review_artifact.review_helper.abcdef123456");
  assert.equal(state.artifact.status, "attention");
  assert.deepEqual(
    state.artifact.gateRows.map((row) => [row.gateId, row.status]),
    [["review_checklist", "pending"]],
  );
  assert.deepEqual(
    state.artifact.sandboxFindingRows.map((row) => [
      row.findingId,
      row.severity,
      row.detailLabels.includes("2 findings"),
    ]),
    [["sandbox_warning.preview", "warning", true]],
  );
  assert.equal(state.artifactSummaryCards.length, 5);

  assert.deepEqual(
    state.redactionCounts.map((count) => [
      count.key,
      count.count,
      count.replacementCount,
      count.paths.length,
    ]),
    [["sensitive_key", 3, 3, 3]],
  );
  assert.equal(state.redactionSummary.totalCount, 3);
  assert.equal(state.redactionSummary.replacementCount, 3);

  assert.equal(state.sourceFileRows.length, 6);
  assert.equal(
    state.sourceFileRows.every((row) => row.status === "complete"),
    true,
  );
  assert.equal(
    state.sourceFileRows.some(
      (row) =>
        row.sourceKind === "sandboxReviews" &&
        row.path === "examples/plugins/review-helper/sandbox.json" &&
        row.itemCount === 1,
    ),
    true,
  );

  assert.equal(
    state.actionButtons.find((action) => action.id === "review_api_redactions")
      ?.enabled,
    true,
  );
  assert.equal(
    state.actionButtons.find((action) => action.id === "open_source_files")
      ?.enabled,
    true,
  );
}

function testFocusedBuilders() {
  const replay = buildReplay();

  assert.equal(buildPluginReviewArtifactApiRequestCards(replay).length, 1);
  assert.equal(
    buildPluginReviewArtifactApiResponseStatus(replay).detailLabels.includes(
      "1 successful response",
    ),
    true,
  );
  assert.equal(
    buildPluginReviewArtifactApiRedactionSummary(replay).status,
    "complete",
  );
  assert.deepEqual(
    buildPluginReviewArtifactApiRedactionCounts(replay).map((count) => count.label),
    ["Sensitive Key redactions"],
  );
  assert.equal(buildPluginReviewArtifactApiSourceFileRows(replay).length, 6);
  assert.equal(
    buildPluginReviewArtifactApiActionButtons(replay).some(
      (action) => action.id === "refresh_preview",
    ),
    true,
  );
}

function testDirectArtifactShape() {
  const directArtifact = {
    artifactVersion: "1.0.0",
    kind: "plugin_review_artifact",
    plugin: {
      id: "plugin.review-helper",
      name: "Review Helper",
      version: "0.1.0",
      manifestPath: "examples/plugins/review-helper/plugin.json",
      entrypoint: "examples/plugins/review-helper/index.mjs",
    },
    sandboxRun: {
      result: "ok",
      auditEvents: ["review.started", "review.completed"],
    },
    redactionReport: {
      redactions: [
        {
          path: "changes[1].summary",
          kind: "key_value_secret",
          replacements: 2,
        },
        {
          path: "changes[2].summary",
          kind: "bearer_token",
          replacements: 1,
        },
      ],
    },
    sourceFiles: [
      "examples/plugins/review-helper/plugin.json",
      "examples/plugins/review-helper/index.mjs",
    ],
    reviewChecklist: ["Manifest validates.", "Sandbox run completed."],
  };
  const state = buildPluginReviewArtifactApiState(directArtifact, {
    defaultTimestamp: timestamps.preview,
  });

  assert.equal(state.generatedAt, timestamps.preview);
  assert.equal(state.responseStatus.status, "ready");
  assert.equal(state.artifact.pluginName, "Review Helper");
  assert.deepEqual(
    state.redactionCounts.map((count) => [
      count.key,
      count.replacementCount,
    ]),
    [
      ["key_value_secret", 2],
      ["bearer_token", 1],
    ],
  );
  assert.equal(state.redactionSummary.replacementCount, 3);
  assert.equal(
    state.sourceFileRows.filter((row) => row.sourceKind === "source-file").length,
    2,
  );
  assert.equal(state.artifact.gateRows.length, 2);
}

function testRoutePreviewResponseWithNestedArtifact() {
  const reviewId = "plugin-review-plugin.review-helper-0123456789abcdef";
  const response = {
    kind: "plugin-review-artifact.preview",
    localOnly: true,
    redacted: true,
    schemaVersion: "plugin-review-artifact/v1",
    reviewId,
    fingerprint: "0123456789abcdef0123456789abcdef",
    decision: "approval_required",
    artifact: {
      schemaVersion: "plugin-review-artifact/v1",
      reviewId,
      fingerprint: "0123456789abcdef0123456789abcdef",
      decision: "approval_required",
      manifest: {
        id: "plugin.review-helper",
        name: "Review Helper",
        version: "0.1.0",
        description: "Builds local review previews.",
        entrypoint: "dist/index.js",
        minimumHostVersion: "0.3.0",
        permissions: ["read_object"],
        capabilities: [{ id: "read_items", permission: "read_object" }],
        tools: [{ id: "summarize_items", name: "Summarize items" }],
        resources: [],
        prompts: [],
      },
      sandboxReview: {
        reviewId: "sandbox_review_nested",
        pluginId: "plugin.review-helper",
        runLabel: "route-preview",
        ok: true,
        fingerprint: "fedcba9876543210fedcba9876543210",
        capabilities: {
          granted: ["read_items"],
          required: ["read_items"],
          observed: ["read_items"],
          missing: [],
        },
        hostApis: {
          denied: ["fs"],
          deniedObserved: [],
        },
        limits: {
          maxAuditEvents: 12,
          maxTicks: 10,
          ticksUsed: 2,
          ticksRemaining: 8,
          tickBudgetExhausted: false,
        },
        audit: {
          total: 2,
          byType: [{ type: "sandbox.run_completed", count: 1 }],
        },
        failureCategories: ["success"],
      },
      approvalGates: [
        {
          id: "owner-check",
          name: "Owner check",
          required: true,
          state: "pending",
        },
      ],
      auditReferences: [
        {
          id: "local-log",
          kind: "run-log",
        },
      ],
      evidence: [
        {
          id: "trace",
          kind: "local-trace",
          localOnly: true,
          redacted: true,
          fingerprint: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
    },
  };
  const state = buildPluginReviewArtifactApiState({
    id: "api_nested_artifact",
    route: {
      method: "POST",
      path: "/v1/plugins/review-artifacts/preview",
    },
    response: {
      status: 200,
      body: response,
    },
  }, {
    defaultTimestamp: timestamps.preview,
  });

  assert.equal(state.responseStatus.status, "complete");
  assert.equal(state.artifact.artifactId, reviewId);
  assert.equal(state.artifact.pluginName, "Review Helper");
  assert.deepEqual(
    state.artifact.gateRows.map((row) => [row.gateId, row.status]),
    [["owner-check", "pending"]],
  );
  assert.equal(state.artifact.auditCounters.length > 0, true);
  assert.equal(
    state.sourceFileRows.some(
      (row) => row.sourceKind === "entrypoint" && row.path === "dist/index.js",
    ),
    true,
  );
}

function testErrorAndEmptyStates() {
  const errorReplay = {
    generatedAt: timestamps.replay,
    requests: [
      {
        id: "api_plugin_review_artifact_error",
        route: {
          method: "POST",
          path: "/v1/plugins/review-artifacts/preview",
        },
        response: {
          status: 422,
          body: {
            error: {
              message: "Manifest path is required",
            },
          },
        },
      },
    ],
  };
  const state = buildPluginReviewArtifactApiState(errorReplay);

  assert.equal(state.status, "error");
  assert.equal(state.responseStatus.status, "error");
  assert.equal(state.responseStatus.errorState.description, "Manifest path is required");
  assert.deepEqual(
    buildPluginReviewArtifactApiErrorStates(errorReplay).map((error) => [
      error.context,
      error.routeId,
      error.status,
      error.errorState.description,
    ]),
    [
      [
        "response",
        "api_plugin_review_artifact_error",
        422,
        "Manifest path is required",
      ],
    ],
  );

  assert.deepEqual(buildPluginReviewArtifactApiEmptyState("sources"), {
    id: "plugin_review_artifact_api_sources_empty",
    label: "No source files",
    description: "Source files will appear when preview data includes local references.",
    ariaLabel: "No plugin review artifact source files are available",
  });
  assert.deepEqual(
    buildPluginReviewArtifactApiErrorState("redactions", new Error("Redaction summary failed")),
    {
      id: "plugin_review_artifact_api_redactions_error",
      context: "redactions",
      routeId: undefined,
      routePath: undefined,
      status: undefined,
      errorState: {
        id: "plugin_review_artifact_api_redactions_error",
        label: "Plugin review redactions could not load",
        description: "Redaction summary failed",
        ariaLabel: "Plugin review redactions could not load",
        retryLabel: "Retry redactions",
      },
    },
  );

  const empty = buildPluginReviewArtifactApiState(undefined, {
    defaultTimestamp: timestamps.preview,
  });
  assert.equal(empty.status, "empty");
  assert.deepEqual(empty.requestCards, []);
  assert.equal(empty.responseStatus.emptyState.label, "No preview response");
}

function testReturnedStateIsDefensivelyCloned() {
  const replay = buildReplay();
  const state = buildPluginReviewArtifactApiState(replay);

  state.requestCards[0].detailLabels.push("mutated");
  state.responseStatus.detailLabels.push("mutated");
  state.artifactSummaryCards[0].detailLabels.push("mutated");
  state.redactionCounts[0].paths.push("mutated");
  state.redactionSummary.detailLabels.push("mutated");
  state.sourceFileRows[0].detailLabels.push("mutated");
  state.actionButtons[0].label = "mutated";
  state.emptyStates.requests.label = "mutated";

  const rebuilt = buildPluginReviewArtifactApiState(replay);
  assert.equal(rebuilt.requestCards[0].detailLabels.includes("mutated"), false);
  assert.equal(rebuilt.responseStatus.detailLabels.includes("mutated"), false);
  assert.equal(rebuilt.artifactSummaryCards[0].detailLabels.includes("mutated"), false);
  assert.equal(rebuilt.redactionCounts[0].paths.includes("mutated"), false);
  assert.equal(rebuilt.redactionSummary.detailLabels.includes("mutated"), false);
  assert.equal(rebuilt.sourceFileRows[0].detailLabels.includes("mutated"), false);
  assert.notEqual(rebuilt.actionButtons[0].label, "mutated");
  assert.equal(rebuilt.emptyStates.requests.label, "No API requests");
}

testReplayBuildsApiState();
testFocusedBuilders();
testDirectArtifactShape();
testRoutePreviewResponseWithNestedArtifact();
testErrorAndEmptyStates();
testReturnedStateIsDefensivelyCloned();

console.log("plugin review artifact api state tests passed");
