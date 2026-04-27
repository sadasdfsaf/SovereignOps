import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTOMATION_AUDIT_REDACTED,
  createExecutionProposalAuditEvent,
  createPermissionGrantAuditEvent,
  createPermissionRevokeAuditEvent,
  createPreviewRunAuditEvent,
  createRuleChangeAuditEvent,
  normalizeAutomationAuditTimestamp,
  redactAutomationAuditValue,
  serializeAutomationAuditEvent,
  sortAutomationAuditEvents,
  summarizeAutomationAuditEvents,
} from "../src/audit.ts";

const base = {
  occurredAt: "2026-04-27T08:15:30+08:00",
  actorId: "act_builder",
  workspaceId: "wsp_alpha",
};

test("creates every automation audit event type and summarizes counts by type and outcome", () => {
  const events = [
    createRuleChangeAuditEvent({
      ...base,
      ruleId: "rule_alpha",
      changeType: "updated",
      before: { enabled: false },
      after: { enabled: true },
    }),
    createPermissionGrantAuditEvent({
      ...base,
      subjectActorId: "act_runner",
      permission: "automation:run",
      scope: { workspaceId: "wsp_alpha" },
    }),
    createPermissionRevokeAuditEvent({
      ...base,
      subjectActorId: "act_runner",
      permission: "automation:edit",
      reason: "Rotated access",
    }),
    createPreviewRunAuditEvent({
      ...base,
      ruleId: "rule_alpha",
      previewRunId: "preview_001",
      outcome: "matched",
      input: { status: "ready" },
      result: { proposals: 1 },
    }),
    createExecutionProposalAuditEvent({
      ...base,
      proposalId: "proposal_001",
      ruleId: "rule_alpha",
      actionType: "notify",
      payload: { message: "Review ready" },
    }),
  ];

  assert.deepEqual(
    events.map((event) => [event.type, event.outcome, event.target.type]),
    [
      ["automation_rule_change", "updated", "rule"],
      ["automation_permission_grant", "granted", "permission"],
      ["automation_permission_revoke", "revoked", "permission"],
      ["automation_preview_run", "matched", "preview_run"],
      ["automation_execution_proposal", "proposed", "execution_proposal"],
    ],
  );
  assert.equal(events.every((event) => event.id.startsWith("audit_")), true);
  assert.equal(events.every((event) => event.fingerprint.startsWith("audit:")), true);

  const summary = summarizeAutomationAuditEvents(events);
  assert.equal(summary.total, 5);
  assert.deepEqual(summary.byType, {
    automation_execution_proposal: 1,
    automation_permission_grant: 1,
    automation_permission_revoke: 1,
    automation_preview_run: 1,
    automation_rule_change: 1,
  });
  assert.deepEqual(summary.byOutcome, {
    granted: 1,
    matched: 1,
    proposed: 1,
    revoked: 1,
    updated: 1,
  });
  assert.deepEqual(summary.byTypeAndOutcome.automation_permission_grant, {
    granted: 1,
  });
});

test("redacts secret-shaped fields and secret-shaped string values deterministically", () => {
  const first = createRuleChangeAuditEvent({
    ...base,
    ruleId: "rule_secret_safe",
    changeType: "updated",
    after: {
      title: "Visible title",
      apiKey: "key_live_one",
      nested: {
        accessToken: "tok_one",
        header: "Bearer abcdefghijklmnopqrstuvwxyz",
        retries: 2,
      },
      clientSecret: {
        value: "hidden",
      },
    },
    metadata: {
      safeLabel: "keep",
      sessionCookie: "cookie-one",
    },
  });
  const second = createRuleChangeAuditEvent({
    ...base,
    ruleId: "rule_secret_safe",
    changeType: "updated",
    after: {
      clientSecret: {
        value: "different",
      },
      nested: {
        retries: 2,
        header: "Bearer differentabcdefghijklmnopqrstuvwxyz",
        accessToken: "tok_two",
      },
      apiKey: "key_live_two",
      title: "Visible title",
    },
    metadata: {
      sessionCookie: "cookie-two",
      safeLabel: "keep",
    },
  });

  assert.equal(first.id, second.id);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(first.details.after.apiKey, AUTOMATION_AUDIT_REDACTED);
  assert.equal(first.details.after.nested.accessToken, AUTOMATION_AUDIT_REDACTED);
  assert.equal(first.details.after.nested.header, AUTOMATION_AUDIT_REDACTED);
  assert.equal(first.details.after.clientSecret, AUTOMATION_AUDIT_REDACTED);
  assert.equal(first.metadata.sessionCookie, AUTOMATION_AUDIT_REDACTED);
  assert.equal(first.details.after.title, "Visible title");

  const serialized = serializeAutomationAuditEvent(first);
  assert.equal(serialized.includes("key_live"), false);
  assert.equal(serialized.includes("tok_one"), false);
  assert.equal(serialized.includes("cookie-one"), false);
  assert.equal(serialized.includes("Visible title"), true);

  assert.deepEqual(redactAutomationAuditValue({ authToken: "abc", safe: "ok" }), {
    authToken: AUTOMATION_AUDIT_REDACTED,
    safe: "ok",
  });
});

test("sorts audit events by normalized timestamp without mutating the caller array", () => {
  const late = createPreviewRunAuditEvent({
    ...base,
    occurredAt: "2026-04-27T03:00:00.000Z",
    ruleId: "rule_late",
    outcome: "skipped",
  });
  const early = createPreviewRunAuditEvent({
    ...base,
    occurredAt: "2026-04-27T01:00:00.000Z",
    ruleId: "rule_early",
    outcome: "matched",
  });
  const middle = createPreviewRunAuditEvent({
    ...base,
    occurredAt: "2026-04-27T02:00:00.000Z",
    ruleId: "rule_middle",
    outcome: "failed",
  });
  const callerEvents = [late, early, middle];

  const sorted = sortAutomationAuditEvents(callerEvents);

  assert.deepEqual(
    sorted.map((event) => event.details.ruleId),
    ["rule_early", "rule_middle", "rule_late"],
  );
  assert.deepEqual(
    callerEvents.map((event) => event.details.ruleId),
    ["rule_late", "rule_early", "rule_middle"],
  );
  assert.notEqual(sorted[0], early);
  assert.equal(Object.isFrozen(sorted), true);
});

test("rejects invalid audit input and mismatched deterministic event identity", () => {
  assert.throws(
    () =>
      createRuleChangeAuditEvent({
        ...base,
        ruleId: "",
        changeType: "updated",
      }),
    /ruleId/,
  );
  assert.throws(
    () =>
      createPreviewRunAuditEvent({
        ...base,
        ruleId: "rule_alpha",
        outcome: "done",
      }),
    /outcome/,
  );
  assert.throws(
    () =>
      createExecutionProposalAuditEvent({
        ...base,
        proposalId: "proposal_bad",
        ruleId: "rule_alpha",
        actionType: "notify",
        payload: { value: undefined },
      }),
    /JSON-compatible/,
  );
  assert.throws(
    () => normalizeAutomationAuditTimestamp("not-a-date"),
    /valid timestamp/,
  );

  const event = createPermissionGrantAuditEvent({
    ...base,
    subjectActorId: "act_runner",
    permission: "automation:run",
  });
  assert.throws(
    () => serializeAutomationAuditEvent({ ...event, details: { ...event.details, extra: "x" } }),
    /deterministic body/,
  );
});

test("keeps clone boundaries across inputs, event results, and sorted clones", () => {
  const after = {
    config: {
      retries: 1,
    },
  };
  const metadata = {
    tags: ["alpha"],
  };
  const event = createRuleChangeAuditEvent({
    ...base,
    ruleId: "rule_clone",
    changeType: "created",
    after,
    metadata,
  });

  after.config.retries = 3;
  metadata.tags.push("changed");

  assert.equal(event.details.after.config.retries, 1);
  assert.deepEqual(event.metadata.tags, ["alpha"]);
  assert.notEqual(event.details.after, after);
  assert.equal(Object.isFrozen(event), true);
  assert.equal(Object.isFrozen(event.details.after), true);
  assert.throws(() => {
    event.details.after.config.retries = 5;
  }, TypeError);

  const sorted = sortAutomationAuditEvents([event]);
  assert.notEqual(sorted[0], event);
  assert.deepEqual(sorted[0], event);
});

test("serializes audit events deterministically after timestamp and object-key normalization", () => {
  const first = createRuleChangeAuditEvent({
    ...base,
    occurredAt: new Date("2026-04-27T01:00:00.000Z"),
    ruleId: "rule_deterministic",
    changeType: "updated",
    after: {
      z: true,
      a: {
        two: 2,
        one: 1,
      },
    },
    metadata: {
      beta: "b",
      alpha: "a",
    },
  });
  const second = createRuleChangeAuditEvent({
    ...base,
    occurredAt: "2026-04-27T09:00:00+08:00",
    ruleId: "rule_deterministic",
    changeType: "updated",
    after: {
      a: {
        one: 1,
        two: 2,
      },
      z: true,
    },
    metadata: {
      alpha: "a",
      beta: "b",
    },
  });

  assert.equal(normalizeAutomationAuditTimestamp("2026-04-27T09:00:00+08:00"), "2026-04-27T01:00:00.000Z");
  assert.equal(first.id, second.id);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(serializeAutomationAuditEvent(first), serializeAutomationAuditEvent(second));
});
