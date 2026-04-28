import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runCli } from "../src/index.ts";
import {
  isFixtureDriftCommand,
  runFixtureDriftCli,
} from "../src/fixtureDrift.ts";

const workspaceRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const scriptPath = path.join(workspaceRoot, "scripts", "fixture_drift.py");

test("runs fixture drift checks through the injected runner", async () => {
  const calls = [];
  const result = await runFixtureDriftCli(
    [
      "fixture",
      "drift",
      "check",
      "--fixture",
      "examples/ingest-search/api-requests.json",
      "--openapi",
      "docs/openapi.yaml",
    ],
    {
      cwd: workspaceRoot,
      pythonExecutable: "python-test",
      fixtureDriftRunner: async (invocation) => {
        calls.push(invocation);
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            kind: "fixture-drift.check",
            ok: true,
            checked: 1,
          }),
          stderr: "",
        };
      },
    },
  );

  assert.ok(result);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), {
    kind: "fixture-drift.check",
    ok: true,
    checked: 1,
  });
  assert.deepEqual(calls, [
    {
      executable: "python-test",
      args: [
        scriptPath,
        "--json",
        "--fixture",
        "examples/ingest-search/api-requests.json",
        "--openapi",
        "docs/openapi.yaml",
      ],
      cwd: workspaceRoot,
    },
  ]);
});

test("propagates fixture drift failure JSON from the runner", async () => {
  const stderr = `${JSON.stringify({
    error: {
      code: "fixture_drift_failed",
      message: "Fixture drift detected.",
      details: {
        changed: ["examples/ingest-search/api-requests.json"],
      },
    },
  })}\n`;
  const result = await runFixtureDriftCli(
    ["fixture-drift", "check", "--fixture", "examples/ingest-search/api-requests.json"],
    {
      cwd: workspaceRoot,
      fixtureDriftRunner: async () => ({
        exitCode: 1,
        stdout: "",
        stderr,
      }),
    },
  );

  assert.ok(result);
  assert.equal(result.exitCode, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, stderr);
  assert.equal(JSON.parse(result.stderr).error.code, "fixture_drift_failed");
});

test("detects fixture drift command aliases", () => {
  assert.equal(isFixtureDriftCommand(["fixture", "drift", "check"]), true);
  assert.equal(isFixtureDriftCommand(["fixture", "drift", "verify"]), true);
  assert.equal(isFixtureDriftCommand(["fixture-drift", "check"]), true);
  assert.equal(isFixtureDriftCommand(["fixtures", "verify"]), true);
  assert.equal(isFixtureDriftCommand(["fixtures", "check"]), true);
  assert.equal(isFixtureDriftCommand(["fixture", "check"]), false);
  assert.equal(isFixtureDriftCommand(["ingest", "api", "verify"]), false);
});

test("package entrypoint routes fixtures verify to fixture drift", async () => {
  const calls = [];
  const result = await runCli(
    [
      "fixtures",
      "verify",
      "--fixture",
      "examples/ingest-search/api-requests.json",
      "--openapi",
      "docs/openapi.yaml",
    ],
    {
      cwd: workspaceRoot,
      fixtureDriftRunner: async (invocation) => {
        calls.push(invocation);
        return {
          exitCode: 0,
          stdout: `${JSON.stringify({
            kind: "fixture-drift.check",
            alias: "fixtures verify",
          })}\n`,
          stderr: "",
        };
      },
    },
  );

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), {
    kind: "fixture-drift.check",
    alias: "fixtures verify",
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, [
    scriptPath,
    "--json",
    "--fixture",
    "examples/ingest-search/api-requests.json",
    "--openapi",
    "docs/openapi.yaml",
  ]);
});
