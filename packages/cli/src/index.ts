#!/usr/bin/env node
import { pathToFileURL } from "node:url";

export * from "./commands.ts";

import { runCli } from "./commands.ts";

if (isDirectRun()) {
  const result = await runCli(process.argv.slice(2), { stdin: await readStdin() });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}

function isDirectRun(): boolean {
  const entrypoint = process.argv[1];
  return entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href;
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return "";
  }

  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input;
}
