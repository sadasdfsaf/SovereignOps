# Agent Guide

This guide describes how local agents and plugin-backed tools should operate in
a private SovereignOps workspace. The goal is simple: propose clearly, ask for
approval when needed, write only through trusted reducers, and leave an audit
trail that a reviewer can understand later.

## Operating Principles

- Treat the local event log as the durable source of truth.
- Prefer proposals over direct writes.
- Ask only for the capability required by the current action.
- Read the approval state before acting on sensitive targets.
- Redact secrets and large content bodies from audit detail.
- Keep actions small enough for a human to review.
- Fail closed when validation, approval, or plugin capability checks fail.

## Local-First Data Flow

An agent should use this flow for any change that may become durable:

1. Read a snapshot through the host-provided workspace API.
2. Build a minimal proposal with target ids and expected changes.
3. Classify the action as direct, approval-required, or denied.
4. If approval is required, write an approval request and stop.
5. If approved, pass the change to the reducer or command boundary.
6. Append an audit record with redacted detail.
7. Return the new snapshot or a stable result id to the caller.

Agents should not mutate returned records in place. Current modules return
cloned or frozen records so each step should request fresh state.

## Approval Rules

Use approval when an action:

- Changes durable workspace content.
- Deletes, archives, or overwrites a record.
- Restores from backup.
- Advances sync after conflicts were found.
- Enables, disables, or updates plugin capabilities.
- Exports local summaries from the workspace.

An approval request should be specific. Include the action, target, before and
after summary, risk label, expiry, and any assumptions the reviewer must check.

## Audit Detail

Emit audit records for allowed, denied, and approval-required decisions. Audit
detail should be structured JSON with stable keys.

Good audit fields:

- `actorId`: the agent, plugin, or local user id.
- `targetId`: the document, task, issue, approval, backup, or sync id.
- `action`: a stable action name.
- `decision`: `allow`, `deny`, or `require_approval`.
- `summary`: a short explanation.
- `redactedPaths`: fields removed from detail.

Do not include tokens, credentials, raw payload bytes, private key material, or
full document bodies in audit detail.

## Plugin Boundary

Plugins run against a host-provided context. The context grants capabilities,
records audit detail, and enforces deterministic work limits in the test
harness.

Plugin code should:

- Call `context.requireCapability(id)` before using a capability.
- Keep capability names narrow and action-oriented.
- Use `context.audit(type, detail)` for important steps.
- Call `context.tick(count, label)` at deterministic work boundaries.
- Return structured results instead of host-specific objects.

Plugin code should not depend on host filesystem, process, environment, network,
timer, dynamic code, clock, or random APIs. The sandbox harness denies those
host APIs by contract.

## Tool Proposals

MCP gateway tools should return proposals, patches, or small summaries. They
should not apply durable side effects directly. The host should validate the
proposal, route it through approval when needed, then apply it through the
appropriate reducer or command adapter.

Useful proposal fields:

- `proposalId`
- `workspaceId`
- `targetId`
- `action`
- `reason`
- `expectedChanges`
- `requiresApproval`
- `expiresAt`

Keep proposal text short and cite target ids. Long explanations belong in a
linked workspace document, not in the approval row.

## MCP Ingest Connector Preview

Agents that inspect connector output through MCP should use exact resource URIs
and dry-run preview surfaces. The intended gateway resource owner is
`services/mcp-gateway/src/ingestConnectorResources.ts`.

Safe resource URIs:

- `sovereignops://ingest/connectors/manifest`
- `sovereignops://ingest/connectors/{profileId}`

Agent-facing preview surfaces:

- MCP tool: `ingest_connector.preview_manifest` returns manifest counts,
  readiness, and an optional connector profile with no durable writes.
- CLI: `packages/cli/src/ingestConnectorMcpPreview.ts` and
  `node packages\cli\src\index.ts ingest connectors mcp preview --connector markdown-structured --format json`.
- API: `apps/api/src/ingestConnectorMcpRoutes.ts` with
  `GET /v1/ingest/connectors/mcp/resources`,
  `GET /v1/ingest/connectors/mcp/resources/{connectorId}`, and
  `POST /v1/ingest/connectors/mcp/preview`.
- SDK: `packages/sdk-js/src/ingestConnectorMcpClient.ts` with
  `createIngestConnectorMcpClient`, `listResources`,
  `listConnectorResources`, `listMcpConnectorResources`, `readResource`,
  `readConnectorResource`, `readMcpConnectorResource`, `preview`,
  `previewOutput`, and `previewManifestResources`.
- Web: `apps/web/src/ingestConnectorMcpState.ts` with
  `buildIngestConnectorMcpState`, `buildIngestConnectorMcpCards`,
  `buildIngestConnectorMcpRows`, `buildIngestConnectorMcpSections`,
  `buildIngestConnectorMcpEmptyState`, and
  `getIngestConnectorMcpStatusLabel`.

Preview rules:

- Keep the preview local-only, no-network, and dry-run.
- Accept only `fixture://`, `file://`, `stdin://`, `workspace://`, or
  `local://` source URIs.
- Require `localOnly: true`, `networkAccess: false`,
  `durableWrites: false`, and `dryRun: true` in preview summaries.
- Treat connector output as untrusted by default and preserve untrusted markers.
- Stop before connector execution when policy returns `deny` or
  `require_approval`.
- Ask for approval before turning a preview into a durable import or workspace
  change.
- Emit audit detail with connector id, resource URI, redacted source URI or
  fixture path, decision, dry-run flag, local-only flag, and no-network flag.

## Backup And Restore Behavior

Agents may assist with backup and restore planning, but should not bypass human
review for destructive recovery steps.

For backup:

- Summarize payload counts, byte counts, and integrity fingerprints.
- Confirm content stays encrypted.
- Add an audit record for the backup request and result.

For restore:

- Run a restore plan before import.
- Stop on schema mismatch, missing payloads, or fingerprint mismatch.
- Ask for approval before replacement or merge.
- Record why the restore was accepted or rejected.

## Sync Behavior

Agents can help compare cursors, summarize conflicts, and prepare retry plans.
They should not force cursor advancement after a failed validation.

Safe sync behavior:

- Treat remote bundle bytes as opaque until local validation succeeds.
- Verify checksums before accepting events.
- Keep workspace ids isolated.
- Record stale cursor decisions.
- Ask for approval before conflict resolution changes durable state.

## Failure Handling

Return stable failure codes and short explanations. Avoid stack traces and raw
payload excerpts in user-facing output.

Common failures:

- Missing capability.
- Approval required.
- Approval expired.
- Validation failed.
- Workspace locked.
- Cursor stale.
- Checksum mismatch.
- Plugin work budget exceeded.

Each failure should map to an audit decision or a diagnostic entry so the team
can review what happened without replaying the agent session.
