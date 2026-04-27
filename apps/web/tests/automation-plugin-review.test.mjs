import assert from "node:assert/strict";

import {
  addAutomationRule,
  createAutomationSettingsState,
  grantPluginPermission,
} from "../src/automationSettings.ts";
import {
  buildAutomationPluginReviewViewModel,
  buildAutomationReviewActions,
} from "../src/automationPluginReview.ts";

const timestamps = {
  first: "2026-04-27T05:00:00.000Z",
  second: "2026-04-27T05:05:00.000Z",
  third: "2026-04-27T05:10:00.000Z",
  fourth: "2026-04-27T05:15:00.000Z",
};

function testReadyState() {
  let state = createAutomationSettingsState();
  state = grantPluginPermission(state, {
    pluginId: "plugin_notes",
    label: "Notes plugin",
    capabilities: ["notes.read"],
    grantedAt: timestamps.first,
  });
  state = addAutomationRule(state, {
    id: "rule_ready",
    name: "Ready notes",
    trigger: "manual.test",
    operation: "notes.preview",
    pluginId: "plugin_notes",
    requiredCapabilities: ["notes.read"],
    now: timestamps.first,
  });

  const review = buildAutomationPluginReviewViewModel(state, {
    generatedAt: timestamps.second,
    auditSummaries: [
      {
        id: "aud_ready_done",
        status: "done",
        count: 2,
        ruleId: "rule_ready",
        pluginId: "plugin_notes",
        lastEventAt: timestamps.second,
      },
    ],
  });

  assert.equal(review.status, "ready");
  assert.equal(review.statusLabel, "Ready");
  assert.equal(review.summary.readyRules, 1);
  assert.equal(review.summary.blockedRules, 0);
  assert.deepEqual(
    review.rules.map((rule) => [rule.ruleId, rule.status]),
    [["rule_ready", "ready"]],
  );
  assert.deepEqual(
    review.permissionCards.map((card) => [card.pluginId, card.status]),
    [["plugin_notes", "granted"]],
  );
  assert.equal(
    review.reviewActions.find((action) => action.id === "run_ready_rules")
      .enabled,
    true,
  );
  assert.deepEqual(review.auditCounters[0], {
    id: "audit.done",
    status: "done",
    label: "Done events",
    count: 2,
    lastEventAt: timestamps.second,
    ruleIds: ["rule_ready"],
    pluginIds: ["plugin_notes"],
  });
}

function testMissingPermissionState() {
  const state = addAutomationRule(createAutomationSettingsState(), {
    id: "rule_missing",
    name: "Records summary",
    trigger: "manual.test",
    operation: "records.summarize",
    pluginId: "plugin_records",
    requiredCapabilities: ["records.write"],
    now: timestamps.first,
  });

  const review = buildAutomationPluginReviewViewModel(state, {
    generatedAt: timestamps.second,
  });

  assert.equal(review.status, "missing_permission");
  assert.equal(review.summary.missingPermissionRules, 1);
  assert.deepEqual(
    review.permissionCards.map((card) => [
      card.pluginId,
      card.status,
      card.requiredCapabilities,
      card.missingCapabilities,
      card.actionId,
    ]),
    [
      [
        "plugin_records",
        "missing_permission",
        ["records.write"],
        ["records.write"],
        "plugin.grant",
      ],
    ],
  );
  assert.equal(
    review.reviewActions.find(
      (action) => action.id === "grant_missing_permissions",
    ).enabled,
    true,
  );
  assert.match(
    review.reviewActions.find((action) => action.id === "run_ready_rules")
      .disabledReason,
    /missing plugin permissions/i,
  );
}

function testApprovalRequiredState() {
  let state = createAutomationSettingsState();
  state = grantPluginPermission(state, {
    pluginId: "plugin_notes",
    label: "Notes plugin",
    capabilities: ["notes.read"],
    grantedAt: timestamps.first,
  });
  state = addAutomationRule(state, {
    id: "rule_review",
    name: "Reviewed notes",
    trigger: "manual.test",
    operation: "notes.publish",
    pluginId: "plugin_notes",
    requiredCapabilities: ["notes.read"],
    approvalGateId: "rule_changes",
    now: timestamps.first,
  });

  const review = buildAutomationPluginReviewViewModel(state, {
    generatedAt: timestamps.second,
  });

  assert.equal(review.status, "approval_required");
  assert.equal(review.summary.approvalRequiredRules, 1);
  assert.deepEqual(
    review.approvalGates.map((gate) => [
      gate.gateId,
      gate.status,
      gate.affectedRuleCount,
      gate.ruleIds,
    ]),
    [
      ["rule_changes", "prompt", 1, ["rule_review"]],
      ["plugin_permissions", "unused", 0, []],
      ["preview_runs", "off", 0, []],
    ],
  );
  assert.equal(
    review.reviewActions.find((action) => action.id === "review_approval_gates")
      .enabled,
    true,
  );
}

function testSandboxFailureStateAndSorting() {
  const review = buildAutomationPluginReviewViewModel(buildMixedState(), {
    generatedAt: timestamps.fourth,
    sandboxReviews: mixedSandboxReviews,
    auditSummaries: mixedAuditSummaries,
  });

  assert.equal(review.status, "sandbox_failure");
  assert.deepEqual(review.summary.byState, {
    empty: 0,
    ready: 1,
    disabled: 0,
    missing_permission: 1,
    approval_required: 1,
    sandbox_failure: 1,
  });
  assert.deepEqual(
    review.rules.map((rule) => [rule.ruleId, rule.status, rule.keyActionId]),
    [
      ["rule_sandbox", "sandbox_failure", "sandbox.inspect"],
      ["rule_missing", "missing_permission", "plugin.grant"],
      ["rule_review", "approval_required", "approval.review"],
      ["rule_ready", "ready", "preview.run_rule"],
    ],
  );
  assert.deepEqual(
    review.permissionCards.map((card) => [card.pluginId, card.status]),
    [
      ["plugin_records", "missing_permission"],
      ["plugin_files", "granted"],
      ["plugin_notes", "granted"],
    ],
  );
  assert.deepEqual(
    review.sandboxFindings.map((finding) => [
      finding.reviewId,
      finding.severity,
      finding.ruleIds,
      finding.pluginIds,
    ]),
    [
      ["sb_fail_files", "blocking", ["rule_sandbox"], ["plugin_files"]],
      ["sb_warn_notes", "warning", ["rule_ready"], ["plugin_notes"]],
    ],
  );
  assert.deepEqual(
    review.auditCounters.map((counter) => [
      counter.status,
      counter.count,
      counter.ruleIds,
      counter.pluginIds,
      counter.lastEventAt,
    ]),
    [
      [
        "failed",
        1,
        ["rule_sandbox"],
        ["plugin_files"],
        timestamps.fourth,
      ],
      [
        "queued",
        1,
        ["rule_missing"],
        ["plugin_records"],
        timestamps.first,
      ],
      [
        "done",
        5,
        ["rule_ready", "rule_review"],
        ["plugin_notes"],
        timestamps.fourth,
      ],
    ],
  );
  assert.deepEqual(
    review.reviewActions.map((action) => [
      action.id,
      action.enabled,
      action.ruleIds,
      action.pluginIds,
    ]),
    [
      ["run_ready_rules", false, ["rule_ready"], ["plugin_notes"]],
      [
        "grant_missing_permissions",
        true,
        ["rule_missing"],
        ["plugin_records"],
      ],
      ["review_approval_gates", true, ["rule_review"], ["plugin_notes"]],
      [
        "inspect_sandbox_failures",
        true,
        ["rule_sandbox"],
        ["plugin_files"],
      ],
      [
        "open_audit",
        true,
        ["rule_missing", "rule_ready", "rule_review", "rule_sandbox"],
        ["plugin_files", "plugin_notes", "plugin_records"],
      ],
    ],
  );
}

function testEmptyState() {
  const review = buildAutomationPluginReviewViewModel(
    createAutomationSettingsState(),
    { generatedAt: timestamps.first },
  );

  assert.equal(review.status, "empty");
  assert.equal(review.isEmpty, true);
  assert.equal(review.summary.totalRules, 0);
  assert.deepEqual(review.permissionCards, []);
  assert.deepEqual(review.sandboxFindings, []);
  assert.deepEqual(review.auditCounters, []);
  assert.deepEqual(
    review.approvalGates.map((gate) => [gate.gateId, gate.status]),
    [
      ["plugin_permissions", "unused"],
      ["rule_changes", "unused"],
      ["preview_runs", "off"],
    ],
  );
  assert.equal(
    review.reviewActions.find((action) => action.id === "run_ready_rules")
      .enabled,
    false,
  );
  assert.match(
    review.reviewActions.find((action) => action.id === "run_ready_rules")
      .disabledReason,
    /no automation rules/i,
  );
}

function testReviewActionBuilderClonesInputs() {
  const actions = buildAutomationReviewActions(
    "missing_permission",
    [
      {
        ruleId: "rule_missing",
        name: "Records summary",
        status: "missing_permission",
        statusLabel: "Missing permissions",
        previewStatus: "missing_permission",
        pluginId: "plugin_records",
        missingCapabilities: ["records.write"],
        sandboxReviewIds: [],
        keyActionId: "plugin.grant",
      },
    ],
    [
      {
        id: "plugin_permission.plugin_records",
        pluginId: "plugin_records",
        label: "Records plugin",
        status: "missing_permission",
        statusLabel: "Missing permissions",
        grantedCapabilities: [],
        requiredCapabilities: ["records.write"],
        missingCapabilities: ["records.write"],
        ruleIds: ["rule_missing"],
        affectedRuleCount: 1,
        actionId: "plugin.grant",
        actionLabel: "Grant permission",
        ariaLabel: "Records plugin, Missing permissions, 1 rule",
      },
    ],
    [],
    [],
  );

  actions[1].ruleIds.push("mutated");
  const rebuilt = buildAutomationReviewActions(
    "missing_permission",
    [
      {
        ruleId: "rule_missing",
        name: "Records summary",
        status: "missing_permission",
        statusLabel: "Missing permissions",
        previewStatus: "missing_permission",
        pluginId: "plugin_records",
        missingCapabilities: ["records.write"],
        sandboxReviewIds: [],
        keyActionId: "plugin.grant",
      },
    ],
    [
      {
        id: "plugin_permission.plugin_records",
        pluginId: "plugin_records",
        label: "Records plugin",
        status: "missing_permission",
        statusLabel: "Missing permissions",
        grantedCapabilities: [],
        requiredCapabilities: ["records.write"],
        missingCapabilities: ["records.write"],
        ruleIds: ["rule_missing"],
        affectedRuleCount: 1,
        actionId: "plugin.grant",
        actionLabel: "Grant permission",
        ariaLabel: "Records plugin, Missing permissions, 1 rule",
      },
    ],
    [],
    [],
  );

  assert.deepEqual(rebuilt[1].ruleIds, ["rule_missing"]);
}

function testNoMutation() {
  const state = deepFreeze(buildMixedState());
  const sandboxReviews = deepFreeze(structuredClone(mixedSandboxReviews));
  const auditSummaries = deepFreeze(structuredClone(mixedAuditSummaries));
  const beforeState = structuredClone(state);
  const beforeSandbox = structuredClone(sandboxReviews);
  const beforeAudit = structuredClone(auditSummaries);

  const review = buildAutomationPluginReviewViewModel(state, {
    generatedAt: timestamps.fourth,
    sandboxReviews,
    auditSummaries,
  });

  review.rules[0].missingCapabilities.push("mutated");
  review.rules[0].sandboxReviewIds.push("mutated");
  review.permissionCards[0].missingCapabilities.push("mutated");
  review.permissionCards[0].ruleIds.push("mutated");
  review.approvalGates[0].reviewerRoles.push("mutated");
  review.sandboxFindings[0].ruleIds.push("mutated");
  review.auditCounters[0].pluginIds.push("mutated");
  review.reviewActions[1].pluginIds.push("mutated");

  assert.deepEqual(state, beforeState);
  assert.deepEqual(sandboxReviews, beforeSandbox);
  assert.deepEqual(auditSummaries, beforeAudit);

  const rebuilt = buildAutomationPluginReviewViewModel(state, {
    generatedAt: timestamps.fourth,
    sandboxReviews,
    auditSummaries,
  });
  assert.deepEqual(
    rebuilt.rules.find((rule) => rule.ruleId === "rule_sandbox")
      .sandboxReviewIds,
    ["sb_fail_files"],
  );
  assert.deepEqual(
    rebuilt.permissionCards.find((card) => card.pluginId === "plugin_records")
      .missingCapabilities,
    ["records.write"],
  );
  assert.deepEqual(
    rebuilt.sandboxFindings.find((finding) => finding.reviewId === "sb_fail_files")
      .ruleIds,
    ["rule_sandbox"],
  );
}

function buildMixedState() {
  let state = createAutomationSettingsState();
  state = grantPluginPermission(state, {
    pluginId: "plugin_notes",
    label: "Notes plugin",
    capabilities: ["notes.read"],
    grantedAt: timestamps.first,
  });
  state = grantPluginPermission(state, {
    pluginId: "plugin_files",
    label: "Files plugin",
    capabilities: ["files.read"],
    grantedAt: timestamps.first,
  });
  state = addAutomationRule(state, {
    id: "rule_ready",
    name: "Ready notes",
    trigger: "manual.test",
    operation: "notes.preview",
    pluginId: "plugin_notes",
    requiredCapabilities: ["notes.read"],
    now: timestamps.first,
  });
  state = addAutomationRule(state, {
    id: "rule_missing",
    name: "Records summary",
    trigger: "manual.test",
    operation: "records.summarize",
    pluginId: "plugin_records",
    requiredCapabilities: ["records.write"],
    now: timestamps.first,
  });
  state = addAutomationRule(state, {
    id: "rule_review",
    name: "Reviewed notes",
    trigger: "manual.test",
    operation: "notes.publish",
    pluginId: "plugin_notes",
    requiredCapabilities: ["notes.read"],
    approvalGateId: "rule_changes",
    now: timestamps.first,
  });
  state = addAutomationRule(state, {
    id: "rule_sandbox",
    name: "Sandboxed files",
    trigger: "manual.test",
    operation: "files.preview",
    pluginId: "plugin_files",
    requiredCapabilities: ["files.read"],
    now: timestamps.first,
  });
  return state;
}

const mixedSandboxReviews = [
  {
    id: "sb_warn_notes",
    outcome: "warning",
    title: "Notes sandbox warning",
    checkedAt: timestamps.fourth,
    ruleId: "rule_ready",
    pluginId: "plugin_notes",
    details: "Preview finished with non-blocking notes.",
    findingCount: 2,
  },
  {
    id: "sb_fail_files",
    outcome: "failed",
    title: "Files sandbox failed",
    checkedAt: timestamps.third,
    ruleId: "rule_sandbox",
    pluginId: "plugin_files",
    details: "Preview could not finish in the sandbox.",
    findingCount: 1,
  },
  {
    id: "sb_pass_review",
    outcome: "passed",
    title: "Review sandbox passed",
    checkedAt: timestamps.second,
    ruleId: "rule_review",
    pluginId: "plugin_notes",
  },
];

const mixedAuditSummaries = [
  {
    id: "aud_done_ready",
    status: "done",
    count: 2,
    ruleId: "rule_ready",
    pluginId: "plugin_notes",
    lastEventAt: timestamps.second,
  },
  {
    id: "aud_failed_files",
    status: "failed",
    count: 1,
    ruleId: "rule_sandbox",
    pluginId: "plugin_files",
    lastEventAt: timestamps.fourth,
  },
  {
    id: "aud_queued_records",
    status: "queued",
    ruleId: "rule_missing",
    pluginId: "plugin_records",
    lastEventAt: timestamps.first,
  },
  {
    id: "aud_done_review",
    status: "done",
    count: 3,
    ruleId: "rule_review",
    pluginId: "plugin_notes",
    lastEventAt: timestamps.fourth,
  },
];

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}

testReadyState();
testMissingPermissionState();
testApprovalRequiredState();
testSandboxFailureStateAndSorting();
testEmptyState();
testReviewActionBuilderClonesInputs();
testNoMutation();

console.log("automation plugin review tests passed");
