#!/usr/bin/env node
import { pathToFileURL } from "node:url";

export * from "./commands.ts";
export * from "./lifecycle.ts";

import { runCli as runCoreCli } from "./commands.ts";
import { runLifecycleCli } from "./lifecycle.ts";

export async function runCli(
  argv: readonly string[] = [],
  options: Parameters<typeof runCoreCli>[1] & Parameters<typeof runLifecycleCli>[1] = {},
): ReturnType<typeof runCoreCli> {
  return (await runLifecycleCli(argv, options)) ?? runCoreCli(argv, options);
}

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
