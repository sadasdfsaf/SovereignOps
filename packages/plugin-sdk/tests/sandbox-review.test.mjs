import assert from "node:assert/strict";
import test from "node:test";

import {
  runPluginInSandbox,
} from "../src/sandbox.ts";
import {
  summarizePluginSandboxRun,
} from "../src/sandboxReview.ts";

test("summarizes a successful sandbox run contract", () => {
  const boundary = {
    capabilities: ["write_note", "read_note"],
    deniedHostApis: ["process", "fs"],
    limits: {
      maxAuditEvents: 12,
      maxTicks: 10,
    },
  };
  const result = runPluginInSandbox((context) => {
    context.requireCapability("read_note");
    context.audit("note.reviewed", {
      id: "n1",
    });
    context.tick(3, "review");
    return { ok: true };
  }, boundary);

  const review = summarizePluginSandboxRun({
    pluginId: "plugin.notes",
    runLabel: "release-check",
    boundary,
    requiredCapabilities: ["read_note"],
    result,
  });

  assert.equal(review.ok, true);
  assert.match(review.reviewId, /^sandbox-review-[a-f0-9]{16}$/);
  assert.match(review.fingerprint, /^[a-f0-9]{32}$/);
  assert.deepEqual(review.capabilities, {
    granted: ["read_note", "write_note"],
    required: ["read_note"],
    observed: ["read_note"],
    missing: [],
  });
  assert.deepEqual(review.hostApis, {
    denied: ["fs", "process"],
    deniedObserved: [],
  });
  assert.deepEqual(review.limits, {
    maxAuditEvents: 12,
    maxTicks: 10,
    ticksUsed: 3,
    ticksRemaining: 7,
    tickBudgetExhausted: false,
  });
  assert.deepEqual(review.audit.byType, [
    { type: "capability.allowed", count: 1 },
    { type: "plugin.audit", count: 1 },
    { type: "resource.tick", count: 1 },
    { type: "sandbox.run_completed", count: 1 },
    { type: "sandbox.run_started", count: 1 },
  ]);
  assert.equal(review.audit.total, 5);
  assert.deepEqual(review.failureCategories, ["success"]);
  assert.equal(Object.hasOwn(review, "failure"), false);
});

test("summarizes missing capabilities without exposing failure messages", () => {
  const boundary = {
    capabilities: ["read_note"],
    limits: {
      maxAuditEvents: 8,
      maxTicks: 8,
    },
  };
  const result = runPluginInSandbox((context) => {
    context.requireCapability("write_note");
    return "unreachable";
  }, boundary);

  const review = summarizePluginSandboxRun({
    boundary,
    requiredCapabilities: ["read_note", "write_note"],
    result,
  });

  assert.equal(review.ok, false);
  assert.deepEqual(review.capabilities.granted, ["read_note"]);
  assert.deepEqual(review.capabilities.required, ["read_note", "write_note"]);
  assert.deepEqual(review.capabilities.observed, ["write_note"]);
  assert.deepEqual(review.capabilities.missing, ["write_note"]);
  assert.deepEqual(review.failure, {
    code: "SANDBOX_CAPABILITY_DENIED",
    category: "capability",
  });
  assert.deepEqual(review.failureCategories, ["capability"]);
  assert.equal(JSON.stringify(review).includes("Capability denied"), false);
});

test("summarizes denied host API access", () => {
  const boundary = {
    capabilities: ["read_note"],
    deniedHostApis: ["process", "fs"],
    limits: {
      maxAuditEvents: 8,
      maxTicks: 8,
    },
  };
  const result = runPluginInSandbox((context) => context.host.process, boundary);

  const review = summarizePluginSandboxRun({
    boundary,
    result,
  });

  assert.equal(review.ok, false);
  assert.deepEqual(review.hostApis.denied, ["fs", "process"]);
  assert.deepEqual(review.hostApis.deniedObserved, ["process"]);
  assert.deepEqual(review.failure, {
    code: "SANDBOX_HOST_API_DENIED",
    category: "host_api",
  });
  assert.deepEqual(review.failureCategories, ["host_api"]);
});

test("summarizes tick budget exhaustion", () => {
  const boundary = {
    limits: {
      maxAuditEvents: 8,
      maxTicks: 3,
    },
  };
  const result = runPluginInSandbox((context) => {
    context.tick(2, "first");
    context.tick(2, "second");
    return "unreachable";
  }, boundary);

  const review = summarizePluginSandboxRun({
    boundary,
    result,
  });

  assert.equal(review.ok, false);
  assert.deepEqual(review.limits, {
    maxAuditEvents: 8,
    maxTicks: 3,
    ticksUsed: 4,
    ticksRemaining: 0,
    tickBudgetExhausted: true,
  });
  assert.deepEqual(review.failure, {
    code: "SANDBOX_RESOURCE_LIMIT",
    category: "resource",
  });
  assert.deepEqual(review.failureCategories, ["resource"]);
});

test("summarizes audit overflow without requiring a terminal failure audit", () => {
  const boundary = {
    limits: {
      maxAuditEvents: 2,
      maxTicks: 8,
    },
  };
  const result = runPluginInSandbox((context) => {
    context.audit("first");
    context.audit("second");
    return "unreachable";
  }, boundary);

  const review = summarizePluginSandboxRun({
    boundary,
    result,
  });

  assert.equal(review.ok, false);
  assert.deepEqual(review.failure, {
    code: "SANDBOX_AUDIT_LIMIT",
    category: "audit",
  });
  assert.equal(review.audit.total, 2);
  assert.equal(review.audit.remaining, 0);
  assert.equal(review.audit.overflow, true);
  assert.deepEqual(review.audit.byType, [
    { type: "plugin.audit", count: 1 },
    { type: "sandbox.run_started", count: 1 },
  ]);
  assert.deepEqual(review.failureCategories, ["audit"]);
});

test("clones and freezes review boundaries", () => {
  const boundary = {
    capabilities: ["write_note", "read_note"],
    deniedHostApis: ["process"],
    limits: {
      maxAuditEvents: 8,
      maxTicks: 8,
    },
  };
  const result = runPluginInSandbox((context) => {
    context.requireCapability("read_note");
    return "ok";
  }, boundary);

  const review = summarizePluginSandboxRun({
    boundary,
    result,
  });
  boundary.capabilities.push("admin_note");
  boundary.deniedHostApis.push("fs");
  boundary.limits.maxTicks = 1;

  assert.deepEqual(review.capabilities.granted, ["read_note", "write_note"]);
  assert.deepEqual(review.hostApis.denied, ["process"]);
  assert.equal(review.limits.maxTicks, 8);
  assert.equal(Object.isFrozen(review), true);
  assert.equal(Object.isFrozen(review.capabilities), true);
  assert.equal(Object.isFrozen(review.capabilities.granted), true);
  assert.throws(() => {
    review.capabilities.granted.push("extra");
  }, TypeError);
});

test("keeps review ordering, ids, and fingerprints deterministic", () => {
  const firstBoundary = {
    capabilities: ["write_note", "read_note"],
    deniedHostApis: ["process", "fs"],
    limits: {
      maxAuditEvents: 8,
      maxTicks: 8,
    },
  };
  const secondBoundary = {
    capabilities: ["read_note", "write_note", "read_note"],
    deniedHostApis: ["fs", "process", "fs"],
    limits: {
      maxTicks: 8,
      maxAuditEvents: 8,
    },
  };
  const firstResult = runPluginInSandbox((context) => {
    context.requireCapability("write_note");
    context.requireCapability("read_note");
    return "ok";
  }, firstBoundary);
  const secondResult = runPluginInSandbox((context) => {
    context.requireCapability("write_note");
    context.requireCapability("read_note");
    return "ok";
  }, secondBoundary);

  const firstReview = summarizePluginSandboxRun({
    pluginId: "plugin.notes",
    runLabel: "stable",
    boundary: firstBoundary,
    requiredCapabilities: ["write_note", "read_note"],
    result: firstResult,
  });
  const secondReview = summarizePluginSandboxRun({
    pluginId: "plugin.notes",
    runLabel: "stable",
    boundary: secondBoundary,
    requiredCapabilities: ["read_note", "write_note", "read_note"],
    result: secondResult,
  });

  assert.deepEqual(firstReview.capabilities.granted, ["read_note", "write_note"]);
  assert.deepEqual(firstReview.hostApis.denied, ["fs", "process"]);
  assert.equal(firstReview.reviewId, secondReview.reviewId);
  assert.equal(firstReview.fingerprint, secondReview.fingerprint);
  assert.equal(JSON.stringify(firstReview), JSON.stringify(secondReview));
});

test("does not leak plugin stack or timestamp details into review summaries", () => {
  const boundary = {
    limits: {
      maxAuditEvents: 8,
      maxTicks: 8,
    },
  };
  const result = runPluginInSandbox((context) => {
    context.audit("diagnostic", {
      stack: "Error: private\n    at hidden.js:1:1",
      timestamp: "2026-04-27T00:00:00.000Z",
    });
    throw new Error("failed at 2026-04-27T00:00:00.000Z\n    at hidden.js:1:1");
  }, boundary);

  const review = summarizePluginSandboxRun({
    pluginId: "plugin.notes",
    boundary,
    result,
  });
  const serialized = JSON.stringify(review);

  assert.equal(review.ok, false);
  assert.deepEqual(review.failure, {
    code: "PLUGIN_ERROR",
    category: "plugin",
  });
  assert.equal(serialized.includes("2026-04-27T00:00:00.000Z"), false);
  assert.equal(serialized.includes("hidden.js"), false);
  assert.equal(serialized.includes("private"), false);
  assert.equal(serialized.includes("failed at"), false);
  assert.equal(serialized.includes("stack"), false);
  assert.equal(serialized.includes("timestamp"), false);
});
