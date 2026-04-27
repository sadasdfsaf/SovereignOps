#!/usr/bin/env node
import { pathToFileURL } from "node:url";

export * from "./commands.ts";
export * from "./lifecycle.ts";
export * from "./auditExport.ts";
export * from "./mcpClient.ts";
export * from "./mcpDemo.ts";
export * from "./mcpReplay.ts";

import { runAuditExportCli } from "./auditExport.ts";
import { runCli as runCoreCli } from "./commands.ts";
import { runLifecycleCli } from "./lifecycle.ts";
import { runMcpApiCli } from "./mcpClient.ts";
import { runMcpDemoCli } from "./mcpDemo.ts";
import { runMcpReplayCli } from "./mcpReplay.ts";

export async function runCli(
  argv: readonly string[] = [],
  options: Parameters<typeof runCoreCli>[1] &
    Parameters<typeof runLifecycleCli>[1] &
    Parameters<typeof runAuditExportCli>[1] &
    Parameters<typeof runMcpReplayCli>[1] &
    Parameters<typeof runMcpApiCli>[1] &
    Parameters<typeof runMcpDemoCli>[1] = {},
): ReturnType<typeof runCoreCli> {
  return (
    (await runAuditExportCli(argv, options)) ??
    (await runMcpReplayCli(argv, options)) ??
    (await runMcpApiCli(argv, options)) ??
    (await runMcpDemoCli(argv, options)) ??
    (await runLifecycleCli(argv, options)) ??
    runCoreCli(argv, options)
  );
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
