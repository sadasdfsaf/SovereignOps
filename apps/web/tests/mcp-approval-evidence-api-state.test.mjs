import assert from "node:assert/strict";

import {
  buildMcpApprovalEvidenceApiAuditReferenceRows,
  buildMcpApprovalEvidenceApiEmptyState,
  buildMcpApprovalEvidenceApiErrorState,
  buildMcpApprovalEvidenceApiErrorStates,
  buildMcpApprovalEvidenceApiGateRows,
  buildMcpApprovalEvidenceApiLoadingState,
  buildMcpApprovalEvidenceApiRecommendedActions,
  buildMcpApprovalEvidenceApiRedactionWarningRows,
  buildMcpApprovalEvidenceApiState,
  buildMcpApprovalEvidenceApiStatusRows,
  buildMcpApprovalEvidenceApiSummaryCards,
} from "../src/mcpApprovalEvidenceApiState.ts";

const timestamps = {
  preview: "2026-04-27T09:00:00.000Z",
  replay: "2026-04-27T09:05:00.000Z",
  expires: "2026-04-27T10:00:00.000Z",
};

function decisionToSessionStatus(decision) {
  return {
    allowed: "approved",
    denied: "rejected",
    approval_required: "pending",
    expired: "expired",
  }[decision];
}

function buildPreview(decision, overrides = {}) {
  return {
    kind: "mcp-approval-evidence.preview",
    schemaVersion: "mcp-approval-evidence-preview/v1",
    generatedAt: timestamps.preview,
    previewId: `preview_${decision}`,
    decision,
    reason:
      decision === "denied"
        ? "The requested write path is outside the approved workspace folder."
        : "Evidence preview is ready for review.",
    localOnly: true,
    session: {
      id: `mcp_${decision}_session`,
      status: decisionToSessionStatus(decision),
      createdAt: "2026-04-27T08:55:00.000Z",
      updatedAt: timestamps.preview,
      expiresAt: timestamps.expires,
      request: {
        toolName: "draft_document_patch",
        arguments: {
          targetPath: "notes/project-plan.md",
          patch: "- draft\n+ reviewed draft",
        },
      },
      actor: {
        id: "act_mira",
        roles: ["author"],
      },
      reason: "The patch edits a local planning note.",
      ruleId: "mcp.tool.patch",
    },
    gates: [
      {
        id: "workspace_scope",
        label: "Workspace scope",
        required: true,
        status:
          decision === "allowed"
            ? "passed"
            : decision === "denied"
              ? "denied"
              : decision === "expired"
                ? "expired"
                : "required",
        ruleId: "mcp.tool.patch",
        reason: "Local note patch requires review.",
      },
    ],
    auditReferences: [
      {
        id: "audit_patch_preview",
        kind: "approval.preview",
        label: "Patch preview audit record",
        timestamp: timestamps.preview,
        fingerprint:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    ],
    redactionWarnings: [],
    ...overrides,
  };
}

function buildReplay(preview) {
  return {
    schemaVersion: "mcp-approval-evidence-api-requests.v1",
    generatedAt: timestamps.replay,
    apiBase: "local://mcp-approval-evidence-preview",
    requests: [
      {
        id: "api_mcp_approval_evidence_preview",
        title: "Build MCP approval evidence preview",
        route: {
          method: "POST",
          path: "/v1/mcp/approval-evidence/preview",
        },
        request: {
          body: {
            sessionId: preview.session.id,
          },
        },
        response: {
          status: 200,
          body: {
            preview,
          },
        },
      },
    ],
  };
}

function buildPublicFixtureBundle() {
  return {
    schemaVersion: "mcp-approval-evidence-preview-requests.v1",
    generatedAt: timestamps.replay,
    apiBase: "local://mcp-approval-evidence-preview",
    requests: [
      {
        id: "api_mcp_approval_evidence_public_preview",
        title: "Preview public approval evidence",
        route: {
          method: "POST",
          path: "/v1/mcp/approval-evidence/preview",
        },
        request: {},
        expect: {
          status: 200,
          contentType: "application/json",
          kind: "mcp-approval-evidence.preview",
          schemaVersion: "mcp-approval-evidence-preview/v1",
          approvalSessionCount: 1,
          entryCount: 1,
          redactionCount: 0,
        },
      },
    ],
  };
}

function buildMalformedPublicFixtureBundle() {
  const fixture = buildPublicFixtureBundle();
  fixture.generatedAt = "not-a-date";
  fixture.apiBase = "https://example.test/api";
  fixture.requests[0].route.path = "preview";
  fixture.requests[0].expect.status = 99;
  return fixture;
}

function testAllowedStateBuildsReviewModels() {
  const replay = buildReplay(buildPreview("allowed"));
  const original = structuredClone(replay);
  const state = buildMcpApprovalEvidenceApiState(replay);

  assert.deepEqual(replay, original);
  assert.equal(state.phase, "success");
  assert.equal(state.status, "allowed");
  assert.deepEqual(state.errorStates, []);
  assert.equal(state.generatedAt, timestamps.replay);
  assert.equal(state.previewId, "preview_allowed");
  assert.equal(state.sessionId, "mcp_allowed_session");
  assert.equal(state.review.title, "Draft document patch on notes/project-plan.md");

  assert.deepEqual(
    state.summaryCards.map((card) => [card.label, card.value, card.status]),
    [
      ["Decision", "Allowed", "allowed"],
      ["Review", "Draft document patch on notes/project-plan.md", "allowed"],
      ["Approval gates", "1 gate", "allowed"],
      ["Audit references", "1 reference", "allowed"],
      ["Redaction warnings", "No warnings", "allowed"],
    ],
  );
  assert.deepEqual(
    state.statusRows.map((row) => [row.rowId, row.status]),
    [
      ["decision", "allowed"],
      ["review", "allowed"],
      ["api_response", "allowed"],
      ["expiration", "approval_required"],
      ["local_only", "allowed"],
    ],
  );
  assert.deepEqual(
    state.gateRows.map((row) => [row.gateId, row.status, row.required]),
    [["workspace_scope", "allowed", true]],
  );
  assert.deepEqual(
    state.auditReferenceRows.map((row) => [row.referenceId, row.status]),
    [["audit_patch_preview", "available"]],
  );
  assert.equal(
    state.recommendedActions.find((action) => action.id === "continue_request")
      .enabled,
    true,
  );
}

function testPublicFixtureBundleSchemaFeedback() {
  const fixture = buildPublicFixtureBundle();
  const original = structuredClone(fixture);
  const state = buildMcpApprovalEvidenceApiState(fixture);

  assert.deepEqual(fixture, original);
  assert.equal(state.phase, "success");
  assert.equal(state.status, "empty");
  assert.deepEqual(state.errorStates, []);
  assert.deepEqual(
    state.statusRows
      .filter((row) => row.rowId === "api_response")
      .map((row) => [row.value, row.status, row.detailLabels]),
    [
      [
        "POST /v1/mcp/approval-evidence/preview",
        "allowed",
        ["HTTP 200", "1 successful response"],
      ],
    ],
  );

  const malformed = buildMalformedPublicFixtureBundle();
  const errorStates = buildMcpApprovalEvidenceApiErrorStates(malformed);
  assert.deepEqual(
    errorStates,
    buildMcpApprovalEvidenceApiErrorStates(structuredClone(malformed)),
  );
  assert.equal(errorStates.length, 1);
  assert.equal(errorStates[0].context, "request");
  assert.equal(
    errorStates[0].errorState.description.startsWith(
      "MCP approval evidence preview fixture bundle schema validation failed with 4 issues:",
    ),
    true,
  );
  assert.equal(
    errorStates[0].errorState.description.includes(
      "apiBase: apiBase must be a local:// API base",
    ),
    true,
  );
  assert.equal(
    errorStates[0].errorState.description.includes(
      "requests[0].expect.status: status must be an HTTP status from 100 to 599",
    ),
    true,
  );

  const malformedState = buildMcpApprovalEvidenceApiState(malformed);
  assert.equal(malformedState.phase, "error");
  assert.equal(malformedState.status, "error");
  assert.equal(
    malformedState.errorStates[0].errorState.description,
    errorStates[0].errorState.description,
  );
}

function testDirectPreviewShapeRemainsTolerant() {
  const preview = buildPreview("allowed");
  const original = structuredClone(preview);
  const state = buildMcpApprovalEvidenceApiState(preview, {
    defaultTimestamp: timestamps.replay,
  });

  assert.deepEqual(preview, original);
  assert.equal(state.phase, "success");
  assert.equal(state.status, "allowed");
  assert.deepEqual(state.errorStates, []);
  assert.equal(state.generatedAt, timestamps.preview);
  assert.equal(state.previewId, "preview_allowed");
  assert.equal(state.review.title, "Draft document patch on notes/project-plan.md");
}

function testDeniedStateBuildsGateAndActionRows() {
  const state = buildMcpApprovalEvidenceApiState(
    buildReplay(buildPreview("denied")),
  );

  assert.equal(state.status, "denied");
  assert.equal(state.decisionReason, "The requested write path is outside the approved workspace folder.");
  assert.deepEqual(
    state.gateRows.map((row) => [row.label, row.status, row.reason]),
    [["Workspace scope", "denied", "Local note patch requires review."]],
  );
  assert.equal(
    state.recommendedActions.find((action) => action.id === "review_denial")
      .enabled,
    true,
  );
  assert.equal(
    state.summaryCards.find((card) => card.id === "mcp_approval_evidence_summary.decision")
      .statusLabel,
    "Denied",
  );
}

function testApprovalRequiredWithEmptyAuditRefsAndRedactions() {
  const replay = buildReplay(
    buildPreview("approval_required", {
      auditReferences: [],
      redactionWarnings: [
        {
          id: "request_token",
          path: "$.session.request.arguments.token",
          reason: "sensitive_key",
          severity: "warning",
          replacements: 1,
        },
        {
          id: "inline_secret",
          path: "$.session.request.arguments.patch",
          reason: "inline_secret",
          severity: "blocked",
          replacements: 2,
        },
      ],
    }),
  );
  const state = buildMcpApprovalEvidenceApiState(replay);

  assert.equal(state.status, "approval_required");
  assert.deepEqual(buildMcpApprovalEvidenceApiAuditReferenceRows(replay), []);
  assert.equal(state.emptyStates.auditReferences.label, "No audit references");
  assert.deepEqual(
    buildMcpApprovalEvidenceApiRedactionWarningRows(replay).map((row) => [
      row.warningId,
      row.severity,
      row.replacementCount,
    ]),
    [
      ["inline_secret", "blocked", 2],
      ["request_token", "warning", 1],
    ],
  );
  assert.equal(
    state.summaryCards.find((card) => card.label === "Redaction warnings").status,
    "denied",
  );
  assert.equal(
    state.recommendedActions.find((action) => action.id === "approve_request")
      .enabled,
    true,
  );
  assert.equal(
    state.recommendedActions.find((action) => action.id === "deny_request")
      .enabled,
    true,
  );
  assert.equal(
    state.recommendedActions.find(
      (action) => action.id === "review_redaction_warnings",
    ).intent,
    "danger",
  );
}

function testExpiredStateIncludesExpirationAction() {
  const replay = buildReplay(buildPreview("expired"));
  const state = buildMcpApprovalEvidenceApiState(replay);

  assert.equal(state.status, "expired");
  assert.deepEqual(
    buildMcpApprovalEvidenceApiStatusRows(replay)
      .filter((row) => row.rowId === "expiration")
      .map((row) => [row.value, row.status]),
    [[timestamps.expires, "expired"]],
  );
  assert.deepEqual(
    buildMcpApprovalEvidenceApiGateRows(replay).map((row) => row.status),
    ["expired"],
  );
  assert.equal(
    buildMcpApprovalEvidenceApiRecommendedActions(replay).find(
      (action) => action.id === "request_new_approval",
    ).enabled,
    true,
  );
}

function testFocusedBuildersAndLoadingState() {
  const replay = buildReplay(buildPreview("allowed"));

  assert.equal(buildMcpApprovalEvidenceApiSummaryCards(replay).length, 5);
  assert.equal(buildMcpApprovalEvidenceApiGateRows(replay).length, 1);
  assert.equal(buildMcpApprovalEvidenceApiAuditReferenceRows(replay).length, 1);
  assert.equal(buildMcpApprovalEvidenceApiRedactionWarningRows(replay).length, 0);
  assert.deepEqual(buildMcpApprovalEvidenceApiEmptyState("audit"), {
    id: "mcp_approval_evidence_audit_empty",
    label: "No audit references",
    description: "Audit references will appear when preview data links to local audit records.",
    ariaLabel: "No MCP approval evidence audit references are available",
  });

  const loading = buildMcpApprovalEvidenceApiLoadingState({
    defaultTimestamp: timestamps.preview,
  });
  assert.equal(loading.phase, "loading");
  assert.equal(loading.status, "loading");
  assert.equal(loading.generatedAt, timestamps.preview);
  assert.equal(loading.recommendedActions[0].enabled, false);
}

function testApiErrorStates() {
  const errorReplay = {
    generatedAt: timestamps.replay,
    requests: [
      {
        id: "api_mcp_approval_evidence_error",
        route: {
          method: "POST",
          path: "/v1/mcp/approval-evidence/preview",
        },
        response: {
          status: 503,
          body: {
            error: {
              message: "Evidence preview unavailable",
            },
          },
        },
      },
    ],
  };
  const state = buildMcpApprovalEvidenceApiState(errorReplay);

  assert.equal(state.phase, "error");
  assert.equal(state.status, "error");
  assert.deepEqual(
    buildMcpApprovalEvidenceApiErrorStates(errorReplay).map((error) => [
      error.context,
      error.routeId,
      error.status,
      error.errorState.description,
    ]),
    [
      [
        "response",
        "api_mcp_approval_evidence_error",
        503,
        "Evidence preview unavailable",
      ],
    ],
  );
  assert.equal(
    state.recommendedActions.find((action) => action.id === "retry_preview")
      .enabled,
    true,
  );
  assert.deepEqual(
    buildMcpApprovalEvidenceApiErrorState("redactions", new Error("Redaction scan failed")),
    {
      id: "mcp_approval_evidence_redactions_error",
      context: "redactions",
      routeId: undefined,
      routePath: undefined,
      status: undefined,
      errorState: {
        id: "mcp_approval_evidence_redactions_error",
        label: "MCP approval redaction warnings could not load",
        description: "Redaction scan failed",
        ariaLabel: "MCP approval redaction warnings could not load",
        retryLabel: "Retry redactions",
      },
    },
  );
}

function testReturnedStateIsDefensivelyCloned() {
  const replay = buildReplay(buildPreview("allowed"));
  const state = buildMcpApprovalEvidenceApiState(replay);

  state.review.detailLabels.push("mutated");
  state.summaryCards[0].detailLabels.push("mutated");
  state.statusRows[0].detailLabels.push("mutated");
  state.gateRows[0].detailLabels.push("mutated");
  state.auditReferenceRows[0].detailLabels.push("mutated");
  state.recommendedActions[0].label = "mutated";
  state.emptyStates.auditReferences.label = "mutated";

  const rebuilt = buildMcpApprovalEvidenceApiState(replay);
  assert.equal(rebuilt.review.detailLabels.includes("mutated"), false);
  assert.equal(rebuilt.summaryCards[0].detailLabels.includes("mutated"), false);
  assert.equal(rebuilt.statusRows[0].detailLabels.includes("mutated"), false);
  assert.equal(rebuilt.gateRows[0].detailLabels.includes("mutated"), false);
  assert.equal(
    rebuilt.auditReferenceRows[0].detailLabels.includes("mutated"),
    false,
  );
  assert.notEqual(rebuilt.recommendedActions[0].label, "mutated");
  assert.equal(rebuilt.emptyStates.auditReferences.label, "No audit references");
}

testAllowedStateBuildsReviewModels();
testPublicFixtureBundleSchemaFeedback();
testDirectPreviewShapeRemainsTolerant();
testDeniedStateBuildsGateAndActionRows();
testApprovalRequiredWithEmptyAuditRefsAndRedactions();
testExpiredStateIncludesExpirationAction();
testFocusedBuildersAndLoadingState();
testApiErrorStates();
testReturnedStateIsDefensivelyCloned();

console.log("mcp approval evidence api state tests passed");
