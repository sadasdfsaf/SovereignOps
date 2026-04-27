import assert from "node:assert/strict";

import {
  AUTOMATION_SETTINGS_TABS,
  addAutomationRule,
  automationSettingsReducer,
  buildAutomationPreviewSummary,
  createAutomationSettingsState,
  disableAutomationRule,
  getAutomationSettingsTab,
  grantPluginPermission,
  listAutomationSettingsTabs,
  revokePluginPermission,
  updateApprovalGate,
  updateAutomationAuditOptions,
  updateAutomationRule,
} from "../src/automationSettings.ts";

const timestamps = {
  first: "2026-04-27T01:00:00.000Z",
  second: "2026-04-27T01:05:00.000Z",
  third: "2026-04-27T01:10:00.000Z",
  fourth: "2026-04-27T01:15:00.000Z",
};

function testTabMetadata() {
  assert.deepEqual(
    AUTOMATION_SETTINGS_TABS.map((tab) => tab.id),
    ["rules", "plugin_permissions", "audit_options", "test_run_preview"],
  );

  for (const tab of AUTOMATION_SETTINGS_TABS) {
    assert.notEqual(tab.label.trim(), "");
    assert.notEqual(tab.description.trim(), "");
    assert.notEqual(tab.ariaLabel.trim(), "");
    assert.ok(tab.keyActions.length > 0);
    for (const action of tab.keyActions) {
      assert.notEqual(action.label.trim(), "");
      assert.notEqual(action.description.trim(), "");
    }
  }

  const listed = listAutomationSettingsTabs();
  listed[0].keyActions[0].label = "Mutated";
  assert.equal(getAutomationSettingsTab("rules").keyActions[0].label, "Add rule");
}

function testRuleReducerBehavior() {
  const initial = createAutomationSettingsState();
  const added = automationSettingsReducer(initial, {
    type: "rule.add",
    rule: {
      id: "rule_notes",
      name: "Prepare notes",
      description: "Create a workspace note summary.",
      trigger: "daily.schedule",
      operation: "notes.prepare",
      pluginId: "plugin_notes",
      requiredCapabilities: ["notes.read", "notes.write", "notes.read"],
      approvalGateId: "preview_runs",
      now: timestamps.first,
    },
  });

  assert.equal(initial.rules.length, 0);
  assert.equal(added.rules.length, 1);
  assert.equal(added.rules[0].enabled, true);
  assert.deepEqual(added.rules[0].requiredCapabilities, [
    "notes.read",
    "notes.write",
  ]);

  const updated = automationSettingsReducer(added, {
    type: "rule.update",
    ruleId: "rule_notes",
    patch: {
      name: "Prepare local notes",
      requiredCapabilities: ["notes.read"],
      now: timestamps.second,
    },
  });

  assert.equal(updated.rules[0].name, "Prepare local notes");
  assert.deepEqual(updated.rules[0].requiredCapabilities, ["notes.read"]);
  assert.equal(updated.rules[0].updatedAt, timestamps.second);
  assert.equal(added.rules[0].name, "Prepare notes");
  assert.notEqual(updated.rules, added.rules);
  assert.notEqual(updated.rules[0], added.rules[0]);

  const disabled = automationSettingsReducer(updated, {
    type: "rule.disable",
    ruleId: "rule_notes",
    disabledAt: timestamps.third,
  });

  assert.equal(disabled.rules[0].enabled, false);
  assert.equal(disabled.rules[0].disabledAt, timestamps.third);
  assert.equal(updated.rules[0].enabled, true);
}

function testPluginPermissionState() {
  const initial = createAutomationSettingsState();
  const granted = grantPluginPermission(initial, {
    pluginId: "plugin_notes",
    label: "Notes plugin",
    capabilities: ["notes.read", "notes.write", "notes.read"],
    grantedAt: timestamps.first,
  });

  assert.equal(granted.pluginPermissions[0].status, "granted");
  assert.deepEqual(granted.pluginPermissions[0].grantedCapabilities, [
    "notes.read",
    "notes.write",
  ]);
  assert.equal(initial.pluginPermissions.length, 0);

  const merged = grantPluginPermission(granted, {
    pluginId: "plugin_notes",
    capabilities: ["notes.export"],
    grantedAt: timestamps.second,
  });

  assert.deepEqual(merged.pluginPermissions[0].grantedCapabilities, [
    "notes.read",
    "notes.write",
    "notes.export",
  ]);
  assert.equal(merged.pluginPermissions[0].updatedAt, timestamps.second);

  const partial = revokePluginPermission(merged, {
    pluginId: "plugin_notes",
    capabilities: ["notes.write"],
    revokedAt: timestamps.third,
  });

  assert.equal(partial.pluginPermissions[0].status, "granted");
  assert.deepEqual(partial.pluginPermissions[0].grantedCapabilities, [
    "notes.read",
    "notes.export",
  ]);
  assert.deepEqual(merged.pluginPermissions[0].grantedCapabilities, [
    "notes.read",
    "notes.write",
    "notes.export",
  ]);

  const revoked = revokePluginPermission(partial, {
    pluginId: "plugin_notes",
    revokedAt: timestamps.fourth,
  });

  assert.equal(revoked.pluginPermissions[0].status, "revoked");
  assert.deepEqual(revoked.pluginPermissions[0].grantedCapabilities, []);
  assert.equal(revoked.pluginPermissions[0].revokedAt, timestamps.fourth);
}

function testApprovalGateAndAuditUpdates() {
  const initial = createAutomationSettingsState();
  const gated = updateApprovalGate(initial, "preview_runs", {
    enabled: true,
    mode: "required",
    reviewerRoles: ["automation_reviewer", "automation_reviewer"],
    updatedAt: timestamps.first,
  });

  const gate = gated.approvalGates.find((item) => item.id === "preview_runs");
  assert.equal(gate.enabled, true);
  assert.equal(gate.mode, "required");
  assert.deepEqual(gate.reviewerRoles, ["automation_reviewer"]);
  assert.equal(gate.updatedAt, timestamps.first);

  const audited = updateAutomationAuditOptions(gated, {
    includeInputSnapshots: true,
    retainEventDays: 45,
    updatedAt: timestamps.second,
  });

  assert.equal(audited.auditOptions.includeInputSnapshots, true);
  assert.equal(audited.auditOptions.retainEventDays, 45);
  assert.equal(audited.auditOptions.updatedAt, timestamps.second);
  assert.equal(gated.auditOptions.includeInputSnapshots, false);
}

function testPreviewSummaries() {
  let state = createAutomationSettingsState();
  state = grantPluginPermission(state, {
    pluginId: "plugin_notes",
    label: "Notes plugin",
    capabilities: ["notes.read"],
    grantedAt: timestamps.first,
  });
  state = addAutomationRule(state, {
    id: "rule_ready",
    name: "Ready rule",
    trigger: "manual.test",
    operation: "notes.preview",
    pluginId: "plugin_notes",
    requiredCapabilities: ["notes.read"],
    approvalGateId: "preview_runs",
    now: timestamps.first,
  });
  state = addAutomationRule(state, {
    id: "rule_missing_permission",
    name: "Missing permission rule",
    trigger: "manual.test",
    operation: "records.preview",
    pluginId: "plugin_records",
    requiredCapabilities: ["records.write"],
    now: timestamps.first,
  });
  state = addAutomationRule(state, {
    id: "rule_requires_review",
    name: "Review-gated rule",
    trigger: "manual.test",
    operation: "notes.publish",
    pluginId: "plugin_notes",
    requiredCapabilities: ["notes.read"],
    approvalGateId: "rule_changes",
    now: timestamps.first,
  });
  state = disableAutomationRule(
    addAutomationRule(state, {
      id: "rule_disabled",
      name: "Disabled rule",
      trigger: "manual.test",
      operation: "notes.archive",
      now: timestamps.first,
    }),
    "rule_disabled",
    timestamps.second,
  );

  const summary = buildAutomationPreviewSummary(state, {
    generatedAt: timestamps.third,
  });

  assert.equal(summary.tabId, "test_run_preview");
  assert.equal(summary.totalRules, 4);
  assert.equal(summary.enabledRules, 3);
  assert.equal(summary.disabledRules, 1);
  assert.equal(summary.grantedPluginCount, 1);
  assert.deepEqual(summary.byStatus, {
    ready: 1,
    disabled: 1,
    missing_permission: 1,
    approval_required: 1,
  });
  assert.deepEqual(summary.readyRuleIds, ["rule_ready"]);
  assert.deepEqual(summary.blockedRuleIds, [
    "rule_missing_permission",
    "rule_requires_review",
    "rule_disabled",
  ]);
  assert.equal(
    summary.rules.find((rule) => rule.ruleId === "rule_missing_permission")
      .keyActionId,
    "plugin.grant",
  );
  assert.deepEqual(summary.audit, {
    capturePreviewRuns: true,
    includeInputSnapshots: false,
    retainEventDays: 30,
  });
}

function testImmutability() {
  const frozenState = deepFreeze(
    addAutomationRule(createAutomationSettingsState(), {
      id: "rule_frozen",
      name: "Frozen rule",
      trigger: "manual.test",
      operation: "notes.prepare",
      requiredCapabilities: ["notes.read"],
      now: timestamps.first,
    }),
  );

  const updated = updateAutomationRule(frozenState, "rule_frozen", {
    description: "Updated without mutating the source.",
    now: timestamps.second,
  });

  assert.equal(frozenState.rules[0].description, "");
  assert.equal(updated.rules[0].description, "Updated without mutating the source.");
  assert.notEqual(
    updated.rules[0].requiredCapabilities,
    frozenState.rules[0].requiredCapabilities,
  );

  const preview = buildAutomationPreviewSummary(updated, {
    generatedAt: timestamps.third,
  });
  preview.rules[0].missingCapabilities.push("mutated");
  const previewAgain = buildAutomationPreviewSummary(updated, {
    generatedAt: timestamps.third,
  });
  assert.deepEqual(previewAgain.rules[0].missingCapabilities, ["notes.read"]);

  updated.rules[0].requiredCapabilities.push("mutated");
  assert.deepEqual(frozenState.rules[0].requiredCapabilities, ["notes.read"]);
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

testTabMetadata();
testRuleReducerBehavior();
testPluginPermissionState();
testApprovalGateAndAuditUpdates();
testPreviewSummaries();
testImmutability();

console.log("automation settings tests passed");
