#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { errorResponseSchema, validationIssueSchema } from "../src/apiError.ts";
import { canonicalLocalEventCatalogSchema, canonicalLocalEventSchema } from "../src/eventCatalog.ts";
import { ingestConnectorApiManifestSchema } from "../src/ingestConnectorApiManifest.ts";
import {
  ingestConnectorManifestSchema,
  ingestConnectorProfileSchema,
} from "../src/ingestConnectorManifest.ts";
import {
  ingestConnectorMcpApiRequestsSchema,
  ingestConnectorMcpPreviewSchema,
  ingestConnectorMcpResourceSchema,
  ingestConnectorMcpResourcesSchema,
} from "../src/ingestConnectorMcpApi.ts";
import { jsonSchemaCatalog, jsonSchemas, schemaKinds } from "../src/jsonSchema.ts";
import { mcpApprovalEvidenceSchema } from "../src/mcpApprovalEvidence.ts";
import {
  mcpApprovalEvidenceRecordComparisonSchema,
  mcpApprovalEvidenceRecordCreateRequestSchema,
  mcpApprovalEvidenceRecordListSchema,
  mcpApprovalEvidenceRecordSchema,
} from "../src/mcpApprovalEvidenceRecord.ts";
import { pluginReviewArtifactPreviewSchema } from "../src/pluginReviewArtifact.ts";
import {
  pluginReviewArtifactRecordComparisonSchema,
  pluginReviewArtifactRecordCreateRequestSchema,
  pluginReviewArtifactRecordListSchema,
  pluginReviewArtifactRecordSchema,
} from "../src/pluginReviewArtifactRecord.ts";
import {
  workspaceSessionSnapshotRetentionCleanupRequestSchema,
  workspaceSessionSnapshotRetentionCleanupResponseSchema,
} from "../src/workspaceSessionSnapshotRetentionCleanup.ts";
import {
  workspaceSessionSnapshotRetentionCleanupInventoryPreviewRequestSchema,
} from "../src/workspaceSessionSnapshotRetentionCleanupInventory.ts";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const fixturesDir = join(packageDir, "fixtures");
const checkOnly = process.argv.includes("--check");

const outputs = [
  ["schema-catalog.json", jsonSchemaCatalog],
  ...schemaKinds.map((kind) => [`${kind}.schema.json`, jsonSchemas[kind]]),
  ["api-error-response.schema.json", errorResponseSchema],
  ["api-validation-issue.schema.json", validationIssueSchema],
  ["canonical-local-event.schema.json", canonicalLocalEventSchema],
  ["canonical-local-event-catalog.schema.json", canonicalLocalEventCatalogSchema],
  ["ingest-connector-api-manifest.schema.json", ingestConnectorApiManifestSchema],
  ["ingest-connector-profile.schema.json", ingestConnectorProfileSchema],
  ["ingest-connector-manifest.schema.json", ingestConnectorManifestSchema],
  ["ingest-connector-mcp-resources.schema.json", ingestConnectorMcpResourcesSchema],
  ["ingest-connector-mcp-resource.schema.json", ingestConnectorMcpResourceSchema],
  ["ingest-connector-mcp-preview.schema.json", ingestConnectorMcpPreviewSchema],
  ["ingest-connector-mcp-api-requests.schema.json", ingestConnectorMcpApiRequestsSchema],
  ["mcp-approval-evidence.schema.json", mcpApprovalEvidenceSchema],
  ["mcp-approval-evidence-record.schema.json", mcpApprovalEvidenceRecordSchema],
  ["mcp-approval-evidence-record-list.schema.json", mcpApprovalEvidenceRecordListSchema],
  ["mcp-approval-evidence-record-comparison.schema.json", mcpApprovalEvidenceRecordComparisonSchema],
  ["mcp-approval-evidence-record-create-request.schema.json", mcpApprovalEvidenceRecordCreateRequestSchema],
  ["plugin-review-artifact-preview.schema.json", pluginReviewArtifactPreviewSchema],
  ["plugin-review-artifact-record.schema.json", pluginReviewArtifactRecordSchema],
  ["plugin-review-artifact-record-list.schema.json", pluginReviewArtifactRecordListSchema],
  ["plugin-review-artifact-record-comparison.schema.json", pluginReviewArtifactRecordComparisonSchema],
  ["plugin-review-artifact-record-create-request.schema.json", pluginReviewArtifactRecordCreateRequestSchema],
  [
    "workspace-session-snapshot-retention-cleanup-request.schema.json",
    workspaceSessionSnapshotRetentionCleanupRequestSchema,
  ],
  [
    "workspace-session-snapshot-retention-cleanup-inventory-request.schema.json",
    workspaceSessionSnapshotRetentionCleanupInventoryPreviewRequestSchema,
  ],
  [
    "workspace-session-snapshot-retention-cleanup-response.schema.json",
    workspaceSessionSnapshotRetentionCleanupResponseSchema,
  ],
];

await mkdir(fixturesDir, { recursive: true });

let hasMismatch = false;

for (const [filename, value] of outputs) {
  const target = join(fixturesDir, filename);
  const serialized = `${JSON.stringify(value, null, 2)}\n`;

  if (checkOnly) {
    let current;
    try {
      current = await readFile(target, "utf8");
    } catch {
      hasMismatch = true;
      console.error(`${filename} is missing.`);
      continue;
    }

    if (current !== serialized) {
      hasMismatch = true;
      console.error(`${filename} is out of date.`);
    }
    continue;
  }

  await writeFile(target, serialized, "utf8");
  console.log(`wrote fixtures/${filename}`);
}

if (hasMismatch) {
  console.error("Run `node scripts/export-json-schema.mjs` from packages/schemas to refresh exports.");
  process.exit(1);
}

if (checkOnly) {
  console.log("JSON schema exports are up to date.");
}
