import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { createToolAuditEmitter } from "../src/auditEmitter.ts";
import { executeToolCall } from "../src/tools.ts";

const FIXTURE_DIR = fileURLToPath(
  new URL("../fixtures/prompt-injection/", import.meta.url),
);
const MARKER_BEGIN = "<UNTRUSTED_CONTENT>";
const MARKER_END = "</UNTRUSTED_CONTENT>";
const REDACTED = "[REDACTED]";
const fixedClock = () => "2026-04-27T00:00:00.000Z";

const fixtures = loadFixtures();

describe("prompt injection fixtures", () => {
  it("keeps every fixture schema sane and explicitly untrusted", () => {
    assert.ok(fixtures.length >= 3, "expected multiple prompt injection fixtures");

    const ids = new Set();
    for (const fixture of fixtures) {
      assert.equal(`${fixture.id}.json`, basename(fixture.__file));
      assert.match(fixture.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      assert.equal(ids.has(fixture.id), false, `${fixture.id} is duplicated`);
      ids.add(fixture.id);

      assert.equal(fixture.source.trust, "untrusted");
      assert.equal(typeof fixture.source.kind, "string");
      assert.equal(typeof fixture.source.label, "string");
      assert.equal(fixture.markers.begin, MARKER_BEGIN);
      assert.equal(fixture.markers.end, MARKER_END);

      assert.equal(typeof fixture.attack.kind, "string");
      assertNonEmptyStringArray(
        fixture.attack.maliciousInstructions,
        `${fixture.id} attack.maliciousInstructions`,
      );
      for (const instruction of fixture.attack.maliciousInstructions) {
        assert.ok(
          fixture.content.includes(instruction),
          `${fixture.id} content is missing attack instruction: ${instruction}`,
        );
      }

      assertToolRequestShape(fixture);
      assertPolicyShape(fixture);
      assertNonEmptyStringArray(
        fixture.expected.audit.redactedValues,
        `${fixture.id} expected.audit.redactedValues`,
      );
      assertNonEmptyStringArray(
        fixture.expected.audit.retainedValues,
        `${fixture.id} expected.audit.retainedValues`,
      );
    }

    assert.ok(
      fixtures.some((fixture) => fixture.expected.policy.decision === "deny"),
      "fixture set must include a denied case",
    );
    assert.ok(
      fixtures.some((fixture) => fixture.expected.policy.decision === "require_approval"),
      "fixture set must include an approval-required case",
    );
  });

  it("keeps malicious text inside explicit untrusted markers", () => {
    for (const fixture of fixtures) {
      const trimmed = fixture.content.trim();

      assert.equal(trimmed.startsWith(MARKER_BEGIN), true, fixture.id);
      assert.equal(trimmed.endsWith(MARKER_END), true, fixture.id);
      assert.equal(countOccurrences(fixture.content, MARKER_BEGIN), 1, fixture.id);
      assert.equal(countOccurrences(fixture.content, MARKER_END), 1, fixture.id);
      assert.ok(extractUntrustedText(fixture).includes(fixture.expected.toolRequest.toolName));
    }
  });

  it("denies untrusted tool escalation without running the handler", async () => {
    const fixture = fixtureByAttackKind("tool_escalation");
    const audit = createToolAuditEmitter({ now: fixedClock });

    const { result, handlerCalls } = await executeFixtureToolCall(fixture, audit);

    assert.equal(result.status, "denied");
    assert.equal(result.policy.ruleId, fixture.expected.policy.ruleId);
    assert.equal(result.policy.reason, fixture.expected.policy.reason);
    assert.equal(handlerCalls, 0);
    assert.deepEqual(
      audit.entries().map((event) => [event.type, event.toolName, event.decision]),
      [
        ["tool_call_requested", fixture.expected.toolRequest.toolName, undefined],
        ["tool_call_denied", fixture.expected.toolRequest.toolName, "deny"],
      ],
    );
  });

  it("requires approval before an untrusted write request can run", async () => {
    const fixture = fixtureByAttackKind("write_without_review");
    const audit = createToolAuditEmitter({ now: fixedClock });

    const { result, handlerCalls } = await executeFixtureToolCall(fixture, audit);

    assert.equal(result.status, "approval_required");
    assert.equal(result.policy.ruleId, fixture.expected.policy.ruleId);
    assert.equal(result.policy.reason, fixture.expected.policy.reason);
    assert.equal(result.policy.approvalId, fixture.expected.policy.approvalId);
    assert.equal(handlerCalls, 0);
    assert.deepEqual(
      audit.entries().map((event) => [event.type, event.toolName, event.decision]),
      [
        ["tool_call_requested", fixture.expected.toolRequest.toolName, undefined],
        [
          "tool_call_approval_required",
          fixture.expected.toolRequest.toolName,
          "require_approval",
        ],
      ],
    );
  });

  it("redacts fixture secrets from requested and final audit records", async () => {
    for (const fixture of fixtures) {
      const audit = createToolAuditEmitter({ now: fixedClock });
      await executeFixtureToolCall(fixture, audit);

      const entries = audit.entries();
      const serializedEntries = JSON.stringify(entries);

      assert.ok(
        entries.some((event) => event.type === "tool_call_requested"),
        `${fixture.id} missing requested audit event`,
      );
      assert.ok(
        serializedEntries.includes(REDACTED),
        `${fixture.id} did not redact any audit argument values`,
      );
      for (const value of fixture.expected.audit.redactedValues) {
        assert.equal(
          serializedEntries.includes(value),
          false,
          `${fixture.id} leaked ${value} into audit records`,
        );
      }
      for (const value of fixture.expected.audit.retainedValues) {
        assert.ok(
          serializedEntries.includes(value),
          `${fixture.id} lost expected non-sensitive audit value ${value}`,
        );
      }
    }
  });
});

function loadFixtures() {
  return readdirSync(FIXTURE_DIR)
    .filter((name) => extname(name) === ".json")
    .sort()
    .map((name) => {
      const file = join(FIXTURE_DIR, name);
      return {
        ...JSON.parse(readFileSync(file, "utf8")),
        __file: file,
      };
    });
}

async function executeFixtureToolCall(fixture, audit) {
  let handlerCalls = 0;

  const result = await executeToolCall({
    toolName: fixture.expected.toolRequest.toolName,
    arguments: fixture.expected.toolRequest.arguments,
    metadata: fixture.expected.toolRequest.metadata,
    audit,
    handlers: {
      [fixture.expected.toolRequest.toolName]: () => {
        handlerCalls += 1;
        return {
          durableSideEffects: true,
          shouldNotRunForPromptInjectionFixture: true,
        };
      },
    },
    policy: promptInjectionFixturePolicy,
  });

  return { result, handlerCalls };
}

function promptInjectionFixturePolicy(request) {
  const metadata = request.metadata ?? {};
  const allowedTools = Array.isArray(metadata.allowedTools) ? metadata.allowedTools : [];
  const trust = metadata.trust;

  if (trust === "untrusted" && !allowedTools.includes(request.toolName)) {
    return {
      decision: "deny",
      ruleId: "deny-untrusted-tool-escalation",
      reason: "untrusted content cannot select tools outside its delegated allowlist",
    };
  }

  if (trust === "untrusted" && request.toolName === "draft_document_patch") {
    return {
      decision: "require_approval",
      ruleId: "require-review-for-untrusted-write",
      reason: "untrusted content can only produce a reviewed write proposal",
      approvalId: stringOrUndefined(metadata.approvalId),
    };
  }

  if (trust === "untrusted" && hasSensitiveArgumentName(request.arguments)) {
    return {
      decision: "deny",
      ruleId: "deny-untrusted-sensitive-link",
      reason: "untrusted content cannot request linking with sensitive pasted credentials",
    };
  }

  return {
    decision: "allow",
    ruleId: "allow-safe-local-proposal",
  };
}

function hasSensitiveArgumentName(value) {
  if (Array.isArray(value)) {
    return value.some(hasSensitiveArgumentName);
  }

  if (!value || typeof value !== "object") {
    return false;
  }

  return Object.entries(value).some(([key, entry]) => {
    return /password|passphrase|secret|token|api[-_]?key|access[-_]?key|credential|authorization|cookie|session/i.test(
      key,
    )
      ? true
      : hasSensitiveArgumentName(entry);
  });
}

function assertToolRequestShape(fixture) {
  const request = fixture.expected.toolRequest;

  assert.equal(typeof request.toolName, "string", `${fixture.id} toolName`);
  assert.ok(request.toolName.length > 0, `${fixture.id} toolName`);
  assertPlainObject(request.arguments, `${fixture.id} arguments`);
  assertPlainObject(request.metadata, `${fixture.id} metadata`);
  assert.equal(request.metadata.sourceId, fixture.id);
  assert.equal(request.metadata.trust, "untrusted");
  assert.ok(Array.isArray(request.metadata.allowedTools));
}

function assertPolicyShape(fixture) {
  const policy = fixture.expected.policy;

  assert.ok(
    policy.decision === "deny" || policy.decision === "require_approval",
    `${fixture.id} has unsupported expected policy decision`,
  );
  assert.equal(typeof policy.ruleId, "string");
  assert.equal(typeof policy.reason, "string");
  if (policy.decision === "require_approval") {
    assert.equal(typeof policy.approvalId, "string");
    assert.ok(policy.approvalId.length > 0);
  }
}

function assertPlainObject(value, label) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), label);
}

function assertNonEmptyStringArray(value, label) {
  assert.ok(Array.isArray(value), label);
  assert.ok(value.length > 0, label);
  for (const item of value) {
    assert.equal(typeof item, "string", label);
    assert.ok(item.length > 0, label);
  }
}

function fixtureByAttackKind(kind) {
  const fixture = fixtures.find((candidate) => candidate.attack.kind === kind);
  assert.ok(fixture, `missing ${kind} fixture`);
  return fixture;
}

function extractUntrustedText(fixture) {
  const begin = fixture.content.indexOf(MARKER_BEGIN);
  const end = fixture.content.indexOf(MARKER_END);

  assert.ok(begin >= 0, `${fixture.id} missing begin marker`);
  assert.ok(end > begin, `${fixture.id} missing end marker`);
  return fixture.content.slice(begin + MARKER_BEGIN.length, end);
}

function countOccurrences(value, needle) {
  return value.split(needle).length - 1;
}

function stringOrUndefined(value) {
  return typeof value === "string" ? value : undefined;
}
