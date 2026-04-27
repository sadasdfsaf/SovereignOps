import assert from "node:assert/strict";
import test from "node:test";

import {
  DENIED_PLUGIN_HOST_APIS,
  createPluginSandboxBoundary,
  createPluginSandboxHarness,
  runPluginInSandbox,
} from "../src/sandbox.ts";

test("normalizes the sandbox boundary model", () => {
  const boundary = createPluginSandboxBoundary({
    capabilities: ["write_note", "read_note", "read_note"],
    deniedHostApis: ["process", "fs", "process"],
    limits: {
      maxAuditEvents: 8,
      maxTicks: 12,
    },
  });

  assert.deepEqual(boundary.capabilities, ["read_note", "write_note"]);
  assert.deepEqual(boundary.deniedHostApis, ["fs", "process"]);
  assert.deepEqual(boundary.limits, {
    maxAuditEvents: 8,
    maxTicks: 12,
  });
  assert.equal(Object.isFrozen(boundary), true);
  assert.equal(Object.isFrozen(boundary.capabilities), true);
  assert.equal(Object.isFrozen(boundary.limits), true);
});

test("allows declared capability checks and denies undeclared capabilities", () => {
  const allowed = runPluginInSandbox((context) => {
    assert.equal(context.hasCapability("read_note"), true);
    context.requireCapability("read_note");
    return "ok";
  }, {
    capabilities: ["read_note"],
  });

  assert.equal(allowed.ok, true);
  assert.equal(allowed.value, "ok");
  assert.deepEqual(
    allowed.audit.map((event) => event.type),
    [
      "sandbox.run_started",
      "capability.checked",
      "capability.allowed",
      "sandbox.run_completed",
    ],
  );

  const denied = runPluginInSandbox((context) => {
    context.requireCapability("write_note");
    return "unreachable";
  }, {
    capabilities: ["read_note"],
  });

  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, "SANDBOX_CAPABILITY_DENIED");
  assert.deepEqual(
    denied.audit.map((event) => event.type),
    [
      "sandbox.run_started",
      "capability.denied",
      "sandbox.run_failed",
    ],
  );
});

test("denies host API access through the sandbox boundary", () => {
  const result = runPluginInSandbox((context) => context.host.process, {
    capabilities: ["read_note"],
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "SANDBOX_HOST_API_DENIED");
  assert.equal(result.error.message, "Host API denied: process.");
  assert.equal(result.audit[1].type, "host_api.denied");
  assert.deepEqual(result.audit[1].detail, {
    api: "process",
    configured: true,
  });
  assert.ok(DENIED_PLUGIN_HOST_APIS.includes("process"));
});

test("passes a deeply frozen context to plugin functions", () => {
  const result = runPluginInSandbox((context) => {
    assert.equal(Object.isFrozen(context), true);
    assert.equal(Object.isFrozen(context.boundary), true);
    assert.equal(Object.isFrozen(context.capabilities), true);
    assert.equal(Object.isFrozen(context.deniedHostApis), true);
    assert.equal(Object.isFrozen(context.limits), true);
    assert.throws(() => {
      context.extra = true;
    }, TypeError);
    assert.throws(() => {
      context.capabilities.push("write_note");
    }, TypeError);

    return context.capabilities;
  }, {
    capabilities: ["read_note"],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value, ["read_note"]);
});

test("captures plugin audit events and synchronous tick usage", () => {
  const harness = createPluginSandboxHarness({
    capabilities: ["read_note"],
    limits: {
      maxAuditEvents: 12,
      maxTicks: 5,
    },
  });

  const result = harness.run((context) => {
    context.audit("note.checked", {
      id: "n1",
      state: "ready",
    });
    assert.equal(context.tick(2, "scan"), 2);
    return { done: true };
  });

  assert.equal(result.ok, true);
  assert.equal(result.ticks, 2);
  assert.deepEqual(result.value, { done: true });
  assert.deepEqual(
    result.audit.map((event) => [event.sequence, event.tick, event.type]),
    [
      [1, 0, "sandbox.run_started"],
      [2, 0, "plugin.audit"],
      [3, 2, "resource.tick"],
      [4, 2, "sandbox.run_completed"],
    ],
  );
  assert.deepEqual(result.audit[1].detail, {
    detail: {
      id: "n1",
      state: "ready",
    },
    type: "note.checked",
  });
  assert.deepEqual(result.audit[2].detail, {
    count: 2,
    label: "scan",
    limit: 5,
    total: 2,
  });
});

test("returns deterministic failure results for resource exhaustion", () => {
  const run = () => runPluginInSandbox((context) => {
    context.tick(2, "first");
    context.tick(2, "second");
    return "unreachable";
  }, {
    limits: {
      maxAuditEvents: 10,
      maxTicks: 3,
    },
  });

  const first = run();
  const second = run();

  assert.deepEqual(first, second);
  assert.equal(first.ok, false);
  assert.deepEqual(first.error, {
    code: "SANDBOX_RESOURCE_LIMIT",
    message: "Tick budget exceeded: 4/3.",
  });
  assert.equal(first.ticks, 4);
  assert.deepEqual(
    first.audit.map((event) => [event.sequence, event.tick, event.type, event.detail]),
    [
      [1, 0, "sandbox.run_started", {}],
      [2, 2, "resource.tick", {
        count: 2,
        label: "first",
        limit: 3,
        total: 2,
      }],
      [3, 4, "resource.exhausted", {
        count: 2,
        label: "second",
        limit: 3,
        total: 4,
      }],
      [4, 4, "sandbox.run_failed", {
        code: "SANDBOX_RESOURCE_LIMIT",
        message: "Tick budget exceeded: 4/3.",
      }],
    ],
  );
});

test("rejects asynchronous plugin functions in the deterministic harness", () => {
  const result = runPluginInSandbox(async () => "later");

  assert.equal(result.ok, false);
  assert.deepEqual(result.error, {
    code: "SANDBOX_ASYNC_DENIED",
    message: "Sandbox harness only supports synchronous plugin functions.",
  });
});
