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

test("detects fixture drift report alias while keeping existing aliases", () => {
  assert.equal(isFixtureDriftCommand(["fixture", "drift", "report"]), true);
  assert.equal(isFixtureDriftCommand(["fixture", "drift", "check"]), true);
  assert.equal(isFixtureDriftCommand(["fixtures", "verify"]), true);
  assert.equal(isFixtureDriftCommand(["fixture", "drift", "summary"]), false);
});

test("prints JSON help that includes the fixture drift report alias", async () => {
  const result = await runFixtureDriftCli(["fixture", "drift", "report", "--help"]);

  assert.ok(result);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");

  const help = JSON.parse(result.stdout);
  assert.equal(help.kind, "fixture-drift.help");
  assert.ok(
    help.usage.includes(
      "sovereignops fixture drift report [--fixture <path>] [--openapi <path>]",
    ),
  );
});

test("routes fixture drift report through fixture_drift.py with pass-through paths", async () => {
  const calls = [];
  const result = await runCli(
    [
      "fixture",
      "drift",
      "report",
      "--fixture",
      "examples/ingest-search/api-requests.json",
      "--openapi",
      "docs/openapi.yaml",
    ],
    {
      cwd: workspaceRoot,
      pythonExecutable: "python-report-test",
      fixtureDriftRunner: async (invocation) => {
        calls.push(invocation);
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            kind: "fixture-drift.check",
            alias: "fixture drift report",
          }),
          stderr: "",
        };
      },
    },
  );

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), {
    kind: "fixture-drift.check",
    alias: "fixture drift report",
  });
  assert.deepEqual(calls, [
    {
      executable: "python-report-test",
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

test("returns JSON-only errors when the fixture drift runner writes non-JSON stderr", async () => {
  const result = await runFixtureDriftCli(["fixture", "drift", "report"], {
    cwd: workspaceRoot,
    fixtureDriftRunner: async () => ({
      exitCode: 1,
      stdout: "",
      stderr: "Traceback: fixture drift runner failed\n",
    }),
  });

  assert.ok(result);
  assert.equal(result.exitCode, 1);
  assert.equal(result.stdout, "");

  const failure = JSON.parse(result.stderr);
  assert.equal(failure.error.code, "fixture_drift_runner_error");
  assert.equal(failure.error.message, "Fixture drift check failed without JSON stderr.");
  assert.deepEqual(failure.error.details, {
    stderr: "Traceback: fixture drift runner failed",
  });
});
