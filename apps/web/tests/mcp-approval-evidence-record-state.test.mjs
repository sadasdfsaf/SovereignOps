import assert from "node:assert/strict";

import {
  buildMcpApprovalEvidenceFingerprintDriftRows,
  buildMcpApprovalEvidenceHealthRows,
  buildMcpApprovalEvidenceRecordEmptyState,
  buildMcpApprovalEvidenceRecordErrorState,
  buildMcpApprovalEvidenceRecordErrorStates,
  buildMcpApprovalEvidenceRecordLoadingState,
  buildMcpApprovalEvidenceRecordRecommendedActions,
  buildMcpApprovalEvidenceRecordState,
  buildMcpApprovalEvidenceRecordSummaryCards,
  buildMcpApprovalEvidenceRedactionStatusRows,
  buildMcpApprovalEvidenceStoredRecordRows,
  redactMcpApprovalEvidenceRecordDisplayValue,
} from "../src/mcpApprovalEvidenceRecordState.ts";

const timestamps = {
  record: "2026-04-27T13:00:00.000Z",
  replay: "2026-04-27T13:05:00.000Z",
  current: "2026-04-27T14:00:00.000Z",
  staleCheck: "2026-04-28T14:00:00.000Z",
};

const fingerprints = {
  stored: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  current: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
};

function buildRecord(overrides = {}) {
  return {
    schemaVersion: "mcp-approval-evidence/v1",
    id: "mcpae_local_notes",
    generatedAt: timestamps.record,
    workspaceId: "wsp_local_review",
    localOnly: true,
    policyDecision: "require_approval",
    approvalStatus: "approved",
    fingerprint: fingerprints.stored,
    sessionRefs: [
      {
        sessionId: "approval_local_notes_primary",
        role: "subject",
        status: "approved",
      },
    ],
    auditEventRefs: [
      {
        eventId: "audit_local_notes_001",
        type: "operation_succeeded",
        occurredAt: timestamps.record,
        fingerprint: fingerprints.stored,
      },
    ],
    redactionSummary: {
      redacted: true,
      redactedFieldCount: 1,
      redactedPaths: ["request.arguments.previewText"],
      retainedMetadataKeys: ["clientLabel", "maskedValue"],
    },
    metadata: {
      clientLabel: "local-notes",
      maskedValue: "[REDACTED]",
      retryCount: 0,
    },
    ...overrides,
  };
}

function buildPublicFixtureBundle() {
  return {
    schemaVersion: "mcp-approval-evidence-records-requests.v1",
    generatedAt: timestamps.replay,
    apiBase: "local://mcp-approval-evidence-records-api",
    requests: [
      {
        id: "api_mcp_approval_evidence_records_public_create",
        title: "Create public approval evidence record",
        route: {
          method: "POST",
          path: "/v1/mcp/approval-evidence/records",
        },
        request: {
          body: {
            record: {
              id: "aer_public_record",
              status: "approved",
            },
          },
        },
        expect: {
          status: 201,
          contentType: "application/json",
          kind: "mcp-approval-evidence.record",
          schemaVersion: "mcp-approval-evidence-record/v1",
          recordId: "aer_public_record",
        },
      },
    ],
  };
}

function buildMalformedPublicFixtureBundle() {
  const fixture = buildPublicFixtureBundle();
  fixture.generatedAt = "not-a-date";
  fixture.apiBase = "https://example.test/api";
  fixture.requests[0].route.path = "records";
  fixture.requests[0].expect.status = 99;
  return fixture;
}

function testListSuccessBuildsPureRecordState() {
  const payload = {
    call: "list",
    generatedAt: timestamps.replay,
    records: [buildRecord()],
  };
  const original = structuredClone(payload);
  const state = buildMcpApprovalEvidenceRecordState(payload);

  assert.deepEqual(payload, original);
  assert.equal(state.phase, "success");
  assert.equal(state.status, "complete");
  assert.equal(state.call, "list");
  assert.equal(state.generatedAt, timestamps.replay);
  assert.equal(state.selectedRecordId, "mcpae_local_notes");
  assert.deepEqual(
    state.summaryCards.map((card) => [card.title, card.valueLabel, card.status]),
    [
      ["Stored records", "1 record", "complete"],
      ["Fingerprint drift", "0 drifts", "empty"],
      ["Evidence health", "0 issues", "complete"],
      ["Redaction status", "1 redacted record", "complete"],
    ],
  );
  assert.deepEqual(
    state.recordRows.map((row) => [
      row.recordId,
      row.approvalStatus,
      row.policyDecision,
      row.status,
      row.sessionCount,
      row.auditEventCount,
    ]),
    [["mcpae_local_notes", "approved", "require_approval", "complete", 1, 1]],
  );
  assert.deepEqual(
    state.redactionStatusRows.map((row) => [
      row.recordId,
      row.status,
      row.redacted,
      row.redactedFieldCount,
    ]),
    [["mcpae_local_notes", "complete", true, 1]],
  );
  assert.equal(
    state.recommendedActions.find((action) => action.id === "continue_with_record")
      ?.enabled,
    true,
  );

  assert.equal(buildMcpApprovalEvidenceStoredRecordRows(payload).length, 1);
  assert.equal(buildMcpApprovalEvidenceRecordSummaryCards(payload).length, 4);
  assert.equal(buildMcpApprovalEvidenceHealthRows(payload).length, 1);
  assert.equal(buildMcpApprovalEvidenceRedactionStatusRows(payload).length, 1);
  assert.equal(
    buildMcpApprovalEvidenceRecordRecommendedActions(payload).some(
      (action) => action.id === "open_records",
    ),
    true,
  );
}

function testPublicFixtureBundleSchemaFeedback() {
  const fixture = buildPublicFixtureBundle();
  const original = structuredClone(fixture);
  const state = buildMcpApprovalEvidenceRecordState(fixture);

  assert.deepEqual(fixture, original);
  assert.equal(state.generatedAt, timestamps.replay);
  assert.equal(state.phase, "empty");
  assert.deepEqual(state.errorStates, []);

  const malformed = buildMalformedPublicFixtureBundle();
  const errorStates = buildMcpApprovalEvidenceRecordErrorStates(malformed);
  assert.deepEqual(
    errorStates,
    buildMcpApprovalEvidenceRecordErrorStates(structuredClone(malformed)),
  );
  assert.equal(errorStates.length, 1);
  assert.equal(errorStates[0].context, "records");
  assert.equal(
    errorStates[0].errorState.description.startsWith(
      "MCP approval evidence records fixture bundle schema validation failed with 4 issues:",
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

  const malformedState = buildMcpApprovalEvidenceRecordState(malformed);
  assert.equal(malformedState.phase, "error");
  assert.equal(malformedState.status, "error");
  assert.equal(
    malformedState.errorStates[0].errorState.description,
    errorStates[0].errorState.description,
  );
}

function testDirectResponseShapeWithFixtureSchemaVersionRemainsTolerant() {
  const payload = {
    schemaVersion: "mcp-approval-evidence-records-requests.v1",
    generatedAt: timestamps.replay,
    records: [buildRecord({ id: "mcpae_direct_response" })],
  };
  const state = buildMcpApprovalEvidenceRecordState(payload);

  assert.equal(state.phase, "success");
  assert.equal(state.status, "complete");
  assert.deepEqual(state.errorStates, []);
  assert.deepEqual(
    state.recordRows.map((row) => [row.recordId, row.approvalStatus]),
    [["mcpae_direct_response", "approved"]],
  );
}

function testLoadingEmptyAndErrorStates() {
  const loading = buildMcpApprovalEvidenceRecordLoadingState({
    call: "get",
    defaultTimestamp: timestamps.record,
  });
  assert.equal(loading.phase, "loading");
  assert.equal(loading.status, "loading");
  assert.equal(loading.generatedAt, timestamps.record);
  assert.equal(loading.recommendedActions[0].enabled, false);

  const empty = buildMcpApprovalEvidenceRecordState({
    call: "list",
    generatedAt: timestamps.replay,
    records: [],
  });
  assert.equal(empty.phase, "empty");
  assert.equal(empty.status, "empty");
  assert.equal(empty.emptyStates.records.label, "No stored records");
  assert.deepEqual(buildMcpApprovalEvidenceRecordEmptyState("records"), {
    id: "mcp_approval_evidence_records_empty",
    label: "No stored records",
    description: "Persisted approval evidence records will appear after a create, list, or get call returns data.",
    ariaLabel: "No persisted MCP approval evidence records are available",
    actionLabel: "Refresh records",
  });

  const error = buildMcpApprovalEvidenceRecordState(
    { call: "list", error: { message: "Record store unavailable" } },
  );
  assert.equal(error.phase, "error");
  assert.equal(error.status, "error");
  assert.deepEqual(
    buildMcpApprovalEvidenceRecordErrorStates(
      { call: "list", error: "Record store unavailable" },
    ).map((entry) => [entry.context, entry.errorState.description]),
    [["list", "Record store unavailable"]],
  );
  assert.equal(
    error.recommendedActions.find((action) => action.id === "retry_records")
      ?.enabled,
    true,
  );
  assert.deepEqual(
    buildMcpApprovalEvidenceRecordErrorState("redactions", new Error("Redaction scan failed")),
    {
      id: "mcp_approval_evidence_record_redactions_error",
      context: "redactions",
      errorState: {
        id: "mcp_approval_evidence_record_redactions_error",
        label: "Approval evidence redaction status could not load",
        description: "Redaction scan failed",
        ariaLabel: "Approval evidence redaction status could not load",
        retryLabel: "Retry redactions",
      },
    },
  );
}

function testComparisonDriftAndEvidenceHealth() {
  const baseline = buildRecord();
  const current = buildRecord({
    id: "mcpae_local_notes_current",
    generatedAt: timestamps.current,
    fingerprint: fingerprints.current,
    auditEventRefs: [
      {
        eventId: "audit_local_notes_001",
        type: "operation_succeeded",
        occurredAt: timestamps.current,
        fingerprint: fingerprints.current,
      },
    ],
  });
  const state = buildMcpApprovalEvidenceRecordState(
    {
      call: "compare",
      generatedAt: timestamps.current,
      records: [baseline],
      comparison: { baseline, current },
    },
    {
      now: timestamps.staleCheck,
      staleAfterMs: 60 * 60 * 1000,
    },
  );

  assert.equal(state.phase, "success");
  assert.equal(state.status, "attention");
  assert.deepEqual(
    buildMcpApprovalEvidenceFingerprintDriftRows({
      comparison: { baseline, current },
    }).map((row) => [row.driftId, row.kind, row.status]),
    [
      ["audit_local_notes_001", "drifted", "attention"],
      ["record", "drifted", "attention"],
    ],
  );
  assert.equal(
    state.fingerprintDriftRows.some((row) => row.kind === "drifted"),
    true,
  );
  assert.equal(
    state.evidenceHealthRows.some(
      (row) => row.kind === "staleness" && row.status === "attention",
    ),
    true,
  );
  assert.equal(
    state.recommendedActions.find((action) => action.id === "compare_fingerprints")
      ?.intent,
    "danger",
  );

  const missing = buildMcpApprovalEvidenceRecordState({
    records: [
      buildRecord({
        id: "mcpae_missing_refs",
        sessionRefs: [],
        auditEventRefs: [],
      }),
    ],
  });
  assert.equal(missing.status, "error");
  assert.deepEqual(
    missing.evidenceHealthRows.map((row) => [row.kind, row.status]),
    [
      ["audit_event_refs", "error"],
      ["session_refs", "error"],
    ],
  );
}

function testSafeDisplayRedactionAndDefensiveClones() {
  const secret = "sk_local_approval_secret_123456";
  const payload = {
    records: [
      buildRecord({
        id: "mcpae_sensitive_display",
        redactionSummary: {
          redacted: true,
          redactedFieldCount: 2,
          redactedPaths: ["metadata.apiToken", "metadata.note"],
          retainedMetadataKeys: ["clientLabel", "apiToken"],
        },
        metadata: {
          clientLabel: "local-notes",
          apiToken: secret,
          note: `Bearer ${secret}`,
        },
      }),
    ],
  };
  const state = buildMcpApprovalEvidenceRecordState(payload);
  const serialized = JSON.stringify(state);

  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes("apiToken"), false);
  assert.equal(
    state.recordRows[0].metadataLabels.some((label) => label.includes("[REDACTED]")),
    true,
  );
  assert.equal(
    state.redactionStatusRows[0].unsafeMetadataKeys.includes("[REDACTED]"),
    true,
  );
  assert.equal(
    redactMcpApprovalEvidenceRecordDisplayValue(secret, "apiToken"),
    "[REDACTED]",
  );

  state.recordRows[0].detailLabels.push("mutated");
  state.recordRows[0].metadataLabels.push("mutated");
  state.redactionStatusRows[0].redactedPaths.push("mutated");
  state.summaryCards[0].detailLabels.push("mutated");

  const rebuilt = buildMcpApprovalEvidenceRecordState(payload);
  assert.equal(rebuilt.recordRows[0].detailLabels.includes("mutated"), false);
  assert.equal(rebuilt.recordRows[0].metadataLabels.includes("mutated"), false);
  assert.equal(rebuilt.redactionStatusRows[0].redactedPaths.includes("mutated"), false);
  assert.equal(rebuilt.summaryCards[0].detailLabels.includes("mutated"), false);
}

testListSuccessBuildsPureRecordState();
testPublicFixtureBundleSchemaFeedback();
testDirectResponseShapeWithFixtureSchemaVersionRemainsTolerant();
testLoadingEmptyAndErrorStates();
testComparisonDriftAndEvidenceHealth();
testSafeDisplayRedactionAndDefensiveClones();

console.log("mcp approval evidence record state tests passed");
