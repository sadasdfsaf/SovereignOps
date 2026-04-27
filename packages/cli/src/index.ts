#!/usr/bin/env node
import { pathToFileURL } from "node:url";

export * from "./commands.ts";
export * from "./lifecycle.ts";
export * from "./auditExport.ts";
export * from "./ingestEvidenceApiReplay.ts";
export * from "./ingestEvidence.ts";
export * from "./ingestApiReplay.ts";
export * from "./ingestApiVerify.ts";
export * from "./ingestSearch.ts";
export * from "./localEventExports.ts";
export * from "./localEventImports.ts";
export * from "./localEvents.ts";
export * from "./mcpClient.ts";
export * from "./mcpDemo.ts";
export * from "./mcpApprovalEvidenceRecordsReplay.ts";
export * from "./mcpApprovalEvidenceReplay.ts";
export * from "./mcpReplay.ts";
export * from "./pluginReviewArtifact.ts";
export * from "./pluginReviewArtifactApiReplay.ts";
export * from "./pluginReviewArtifactRecordsReplay.ts";
export * from "./workspaceSessionApiReplay.ts";
export * from "./workspaceSessionSnapshotReview.ts";
export * from "./workspaceSessionSnapshotStore.ts";

import { runAuditExportCli } from "./auditExport.ts";
import { runCli as runCoreCli } from "./commands.ts";
import { runIngestEvidenceApiReplayCli } from "./ingestEvidenceApiReplay.ts";
import { runIngestEvidenceCli } from "./ingestEvidence.ts";
import { runIngestApiReplayCli } from "./ingestApiReplay.ts";
import { runIngestApiVerifyCli } from "./ingestApiVerify.ts";
import { runIngestSearchCli } from "./ingestSearch.ts";
import { runLifecycleCli } from "./lifecycle.ts";
import { runLocalEventExportsCli } from "./localEventExports.ts";
import { runLocalEventImportsCli } from "./localEventImports.ts";
import { runLocalEventsCli } from "./localEvents.ts";
import { runMcpApiCli } from "./mcpClient.ts";
import { runMcpApprovalEvidenceRecordsReplayCli } from "./mcpApprovalEvidenceRecordsReplay.ts";
import { runMcpApprovalEvidenceReplayCli } from "./mcpApprovalEvidenceReplay.ts";
import { runMcpDemoCli } from "./mcpDemo.ts";
import { runMcpReplayCli } from "./mcpReplay.ts";
import { runPluginReviewArtifactApiReplayCli } from "./pluginReviewArtifactApiReplay.ts";
import { runPluginReviewArtifactRecordsReplayCli } from "./pluginReviewArtifactRecordsReplay.ts";
import { runPluginReviewArtifactCli } from "./pluginReviewArtifact.ts";
import { runWorkspaceSessionApiReplayCli } from "./workspaceSessionApiReplay.ts";
import { runWorkspaceSessionSnapshotReviewCli } from "./workspaceSessionSnapshotReview.ts";
import { runWorkspaceSessionSnapshotStoreCli } from "./workspaceSessionSnapshotStore.ts";

export async function runCli(
  argv: readonly string[] = [],
  options: Parameters<typeof runCoreCli>[1] &
    Parameters<typeof runLifecycleCli>[1] &
    Parameters<typeof runAuditExportCli>[1] &
    Parameters<typeof runIngestEvidenceApiReplayCli>[1] &
    Parameters<typeof runIngestEvidenceCli>[1] &
    Parameters<typeof runIngestApiReplayCli>[1] &
    Parameters<typeof runIngestApiVerifyCli>[1] &
    Parameters<typeof runIngestSearchCli>[1] &
    Parameters<typeof runLocalEventExportsCli>[1] &
    Parameters<typeof runLocalEventImportsCli>[1] &
    Parameters<typeof runLocalEventsCli>[1] &
    Parameters<typeof runMcpApprovalEvidenceRecordsReplayCli>[1] &
    Parameters<typeof runMcpApprovalEvidenceReplayCli>[1] &
    Parameters<typeof runMcpReplayCli>[1] &
    Parameters<typeof runMcpApiCli>[1] &
    Parameters<typeof runMcpDemoCli>[1] &
    Parameters<typeof runPluginReviewArtifactApiReplayCli>[1] &
    Parameters<typeof runPluginReviewArtifactRecordsReplayCli>[1] &
    Parameters<typeof runPluginReviewArtifactCli>[1] &
    Parameters<typeof runWorkspaceSessionApiReplayCli>[1] &
    Parameters<typeof runWorkspaceSessionSnapshotReviewCli>[1] &
    Parameters<typeof runWorkspaceSessionSnapshotStoreCli>[1] = {},
): ReturnType<typeof runCoreCli> {
  return (
    (await runAuditExportCli(argv, options)) ??
    (await runWorkspaceSessionSnapshotReviewCli(argv, options)) ??
    (await runWorkspaceSessionSnapshotStoreCli(argv, options)) ??
    (await runWorkspaceSessionApiReplayCli(argv, options)) ??
    (await runPluginReviewArtifactRecordsReplayCli(argv, options)) ??
    (await runPluginReviewArtifactApiReplayCli(argv, options)) ??
    (await runPluginReviewArtifactCli(argv, options)) ??
    (await runIngestEvidenceApiReplayCli(argv, options)) ??
    (await runIngestEvidenceCli(argv, options)) ??
    (await runIngestApiReplayCli(argv, options)) ??
    (await runIngestApiVerifyCli(argv, options)) ??
    (await runIngestSearchCli(argv, options)) ??
    (await runLocalEventExportsCli(argv, options)) ??
    (await runLocalEventImportsCli(argv, options)) ??
    (await runLocalEventsCli(argv, options)) ??
    (await runMcpApprovalEvidenceRecordsReplayCli(argv, options)) ??
    (await runMcpApprovalEvidenceReplayCli(argv, options)) ??
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
