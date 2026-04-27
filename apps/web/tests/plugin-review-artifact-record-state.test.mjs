import assert from "node:assert/strict";

import {
  buildPluginReviewArtifactRecordActionButtons,
  buildPluginReviewArtifactRecordCards,
  buildPluginReviewArtifactRecordComparisonStatus,
  buildPluginReviewArtifactRecordEmptyState,
  buildPluginReviewArtifactRecordErrorState,
  buildPluginReviewArtifactRecordErrorStates,
  buildPluginReviewArtifactRecordLocalOnlyIndicators,
  buildPluginReviewArtifactRecordRedactionIndicators,
  buildPluginReviewArtifactRecordState,
  buildPluginReviewArtifactRecordSummaryCards,
  redactPluginReviewArtifactRecordDisplayValue,
} from "../src/pluginReviewArtifactRecordState.ts";

const timestamps = {
  old: "2026-04-27T08:00:00.000Z",
  middle: "2026-04-27T08:30:00.000Z",
  new: "2026-04-27T09:00:00.000Z",
};

const fingerprints = {
  first: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  second: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
};

function buildArtifact(overrides = {}) {
  return {
    schemaVersion: "plugin-review-artifact/v1",
    reviewId: "review_local_notes_001",
    fingerprint: fingerprints.first,
    decision: "approved",
    manifest: {
      id: "plugin.local-notes",
      name: "Local Notes",
      version: "1.2.0",
      description: "Drafts local note summaries.",
      entrypoint: "dist/index.js",
      minimumHostVersion: "0.3.0",
      permissions: ["read_object"],
      capabilities: [{ id: "read_notes", permission: "read_object" }],
      tools: [{ id: "summarize_notes", name: "Summarize notes" }],
      resources: [],
      prompts: [],
    },
    evidence: [
      {
        id: "trace",
        kind: "local-trace",
        localOnly: true,
        redacted: true,
        fingerprint: fingerprints.second,
      },
    ],
    ...overrides,
  };
}

function buildRecord(overrides = {}) {
  return {
    schemaVersion: "plugin-review-artifact-record/v1",
    id: "prar_local_notes",
    createdAt: timestamps.middle,
    fingerprint: fingerprints.first,
    decision: "approved",
    redacted: true,
    localOnly: true,
    externalCalls: 0,
    localReferenceCount: 1,
    redactionSummary: {
      redacted: true,
      redactedFieldCount: 2,
      redactedPaths: [
        "artifact.evidence[0].summary",
        "artifact.approvalGates[0].reason",
      ],
    },
    artifact: buildArtifact(),
    ...overrides,
  };
}

function testEmptyAndErrorStates() {
  const empty = buildPluginReviewArtifactRecordState({
    call: "list",
    generatedAt: timestamps.middle,
    records: [],
  });

  assert.equal(empty.phase, "empty");
  assert.equal(empty.status, "empty");
  assert.deepEqual(empty.recordCards, []);
  assert.equal(empty.comparisonStatus.kind, "unavailable");
  assert.equal(empty.emptyStates.records.label, "No stored records");
  assert.equal(
    empty.actionButtons.find((action) => action.id === "open_records")?.enabled,
    false,
  );
  assert.deepEqual(buildPluginReviewArtifactRecordEmptyState("records"), {
    id: "plugin_review_artifact_records_empty",
    label: "No stored records",
    description: "Persisted plugin review artifact records will appear after a create, list, or get call returns data.",
    ariaLabel: "No persisted plugin review artifact records are available",
    actionLabel: "Refresh records",
  });

  const error = buildPluginReviewArtifactRecordState({
    call: "list",
    error: { message: "Record store unavailable" },
  });
  assert.equal(error.phase, "error");
  assert.equal(error.status, "error");
  assert.deepEqual(
    buildPluginReviewArtifactRecordErrorStates({
      call: "list",
      error: "Record store unavailable",
    }).map((entry) => [entry.context, entry.errorState.description]),
    [["list", "Record store unavailable"]],
  );
  assert.deepEqual(
    buildPluginReviewArtifactRecordErrorState("redactions", new Error("Redaction scan failed")),
    {
      id: "plugin_review_artifact_record_redactions_error",
      context: "redactions",
      errorState: {
        id: "plugin_review_artifact_record_redactions_error",
        label: "Plugin review artifact record redactions could not load",
        description: "Redaction scan failed",
        ariaLabel: "Plugin review artifact record redactions could not load",
        retryLabel: "Retry redactions",
      },
    },
  );
}

function testPopulatedListAndSorting() {
  const payload = {
    call: "list",
    generatedAt: timestamps.new,
    records: [
      buildRecord({
        id: "prar_alpha",
        createdAt: timestamps.old,
        artifact: buildArtifact({
          reviewId: "review_alpha",
          manifest: {
            ...buildArtifact().manifest,
            id: "plugin.alpha-tools",
            name: "Alpha Tools",
          },
        }),
      }),
      buildRecord({
        id: "prar_beta",
        createdAt: timestamps.new,
        fingerprint: fingerprints.second,
        artifact: buildArtifact({
          reviewId: "review_beta",
          fingerprint: fingerprints.second,
          manifest: {
            ...buildArtifact().manifest,
            id: "plugin.beta-tools",
            name: "Beta Tools",
          },
        }),
      }),
    ],
  };
  const original = structuredClone(payload);
  const state = buildPluginReviewArtifactRecordState(payload);

  assert.deepEqual(payload, original);
  assert.equal(state.phase, "success");
  assert.equal(state.status, "complete");
  assert.equal(state.selectedRecordId, undefined);
  assert.deepEqual(
    state.recordCards.map((card) => [card.recordId, card.pluginName, card.status]),
    [
      ["prar_beta", "Beta Tools", "complete"],
      ["prar_alpha", "Alpha Tools", "complete"],
    ],
  );
  assert.deepEqual(
    state.summaryCards.map((card) => [card.title, card.valueLabel, card.status]),
    [
      ["Stored records", "2 records", "complete"],
      ["Comparison", "Comparison unavailable", "empty"],
      ["Redaction and locality", "2/2 redacted", "complete"],
    ],
  );
  assert.equal(
    state.actionButtons.find((action) => action.id === "continue_with_record")
      ?.enabled,
    true,
  );

  assert.equal(buildPluginReviewArtifactRecordCards(payload).length, 2);
  assert.equal(buildPluginReviewArtifactRecordSummaryCards(payload).length, 3);
  assert.equal(buildPluginReviewArtifactRecordRedactionIndicators(payload).length, 2);
  assert.equal(buildPluginReviewArtifactRecordLocalOnlyIndicators(payload).length, 2);
  assert.equal(
    buildPluginReviewArtifactRecordActionButtons(payload).some(
      (action) => action.id === "open_records",
    ),
    true,
  );
}

function testCreateAndGetNormalization() {
  const createState = buildPluginReviewArtifactRecordState({
    operation: "create",
    generatedAt: timestamps.middle,
    createdRecord: buildRecord({
      id: "prar_created",
      artifact: buildArtifact({
        reviewId: "review_created",
        manifest: {
          ...buildArtifact().manifest,
          id: "plugin.created-notes",
          name: "Created Notes",
        },
      }),
    }),
  });

  assert.equal(createState.call, "create");
  assert.equal(createState.selectedRecordId, "prar_created");
  assert.equal(createState.recordCards[0].pluginLabel, "Created Notes (plugin.created-notes)");
  assert.equal(createState.recordCards[0].reviewLabel, "Review review_created");

  const getState = buildPluginReviewArtifactRecordState({
    record: buildRecord({
      id: "prar_get",
      artifact: buildArtifact({
        reviewId: "review_get",
      }),
    }),
  });

  assert.equal(getState.call, "get");
  assert.deepEqual(
    getState.recordCards.map((card) => [card.recordId, card.reviewId]),
    [["prar_get", "review_get"]],
  );
}

function testCompareMatchAndMismatch() {
  const baseline = buildRecord({
    id: "prar_stored",
    fingerprint: fingerprints.first,
    artifact: buildArtifact({ reviewId: "review_stored", fingerprint: fingerprints.first }),
  });
  const currentMatch = buildRecord({
    id: "prar_current",
    fingerprint: fingerprints.first,
    artifact: buildArtifact({ reviewId: "review_current", fingerprint: fingerprints.first }),
  });
  const currentMismatch = buildRecord({
    id: "prar_current",
    fingerprint: fingerprints.second,
    artifact: buildArtifact({ reviewId: "review_current", fingerprint: fingerprints.second }),
  });

  const match = buildPluginReviewArtifactRecordState({
    call: "compare",
    comparison: { baseline, current: currentMatch },
  });
  assert.equal(match.phase, "success");
  assert.equal(match.comparisonStatus.kind, "match");
  assert.equal(match.comparisonStatus.status, "complete");
  assert.equal(match.status, "complete");

  const mismatch = buildPluginReviewArtifactRecordState({
    call: "compare",
    comparison: { baseline, current: currentMismatch },
  });
  assert.equal(mismatch.comparisonStatus.kind, "mismatch");
  assert.equal(mismatch.comparisonStatus.kindLabel, "Record drift");
  assert.equal(mismatch.comparisonStatus.status, "attention");
  assert.equal(mismatch.status, "attention");
  assert.equal(
    mismatch.actionButtons.find((action) => action.id === "compare_records")?.intent,
    "danger",
  );
  assert.equal(
    buildPluginReviewArtifactRecordComparisonStatus({
      call: "compare",
      comparison: { baseline, current: currentMismatch },
    }).kind,
    "mismatch",
  );
}

function testRedactionAndLocalOnlyIndicators() {
  const secret = "sk_local_review_secret_123456789";
  const payload = {
    records: [
      buildRecord({
        id: "prar_indicator_issue",
        redacted: false,
        localOnly: false,
        externalCalls: 2,
        redactionSummary: {
          redacted: false,
          redactedFieldCount: 1,
          redactedPaths: ["metadata.apiToken"],
        },
        artifact: buildArtifact({
          manifest: {
            ...buildArtifact().manifest,
            name: "Indicator Notes",
          },
        }),
      }),
    ],
  };
  const state = buildPluginReviewArtifactRecordState(payload);
  const serialized = JSON.stringify(state);

  assert.equal(serialized.includes("apiToken"), false);
  assert.equal(serialized.includes(secret), false);
  assert.equal(state.status, "error");
  assert.deepEqual(
    state.redactionIndicators.map((indicator) => [
      indicator.recordId,
      indicator.status,
      indicator.redacted,
      indicator.redactedPaths,
    ]),
    [["prar_indicator_issue", "attention", false, ["[REDACTED]"]]],
  );
  assert.deepEqual(
    state.localOnlyIndicators.map((indicator) => [
      indicator.recordId,
      indicator.status,
      indicator.localOnly,
      indicator.externalCallCount,
    ]),
    [["prar_indicator_issue", "error", false, 2]],
  );
  assert.equal(
    redactPluginReviewArtifactRecordDisplayValue(secret, "apiToken"),
    "[REDACTED]",
  );
}

function testReturnedStateIsDefensivelyCloned() {
  const payload = {
    records: [buildRecord()],
    comparison: {
      baseline: buildRecord({ id: "prar_stored" }),
      current: buildRecord({ id: "prar_current" }),
    },
  };
  const frozenPayload = deepFreeze(structuredClone(payload));
  const before = structuredClone(frozenPayload);
  const state = buildPluginReviewArtifactRecordState(frozenPayload);

  state.summaryCards[0].detailLabels.push("mutated");
  state.recordCards[0].detailLabels.push("mutated");
  state.comparisonStatus.detailLabels.push("mutated");
  state.redactionIndicators[0].redactedPaths.push("mutated");
  state.redactionIndicators[0].detailLabels.push("mutated");
  state.localOnlyIndicators[0].detailLabels.push("mutated");
  state.actionButtons[0].label = "mutated";
  state.emptyStates.records.label = "mutated";

  assert.deepEqual(frozenPayload, before);

  const rebuilt = buildPluginReviewArtifactRecordState(frozenPayload);
  assert.equal(rebuilt.summaryCards[0].detailLabels.includes("mutated"), false);
  assert.equal(rebuilt.recordCards[0].detailLabels.includes("mutated"), false);
  assert.equal(rebuilt.comparisonStatus.detailLabels.includes("mutated"), false);
  assert.equal(rebuilt.redactionIndicators[0].redactedPaths.includes("mutated"), false);
  assert.equal(rebuilt.redactionIndicators[0].detailLabels.includes("mutated"), false);
  assert.equal(rebuilt.localOnlyIndicators[0].detailLabels.includes("mutated"), false);
  assert.notEqual(rebuilt.actionButtons[0].label, "mutated");
  assert.equal(rebuilt.emptyStates.records.label, "No stored records");
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

testEmptyAndErrorStates();
testPopulatedListAndSorting();
testCreateAndGetNormalization();
testCompareMatchAndMismatch();
testRedactionAndLocalOnlyIndicators();
testReturnedStateIsDefensivelyCloned();

console.log("plugin review artifact record state tests passed");
