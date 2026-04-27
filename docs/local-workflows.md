# Local Workflows

This document describes the first local-first application workflows that are implemented in the public repository. The current modules are framework-free TypeScript so they can be tested quickly and reused by future UI, CLI, and service layers.

## Web Workspace Models

`apps/web/src/routes.ts` defines the route shell for the early dashboard, task list, document library, incident queue, approval inbox, search, and settings surfaces. Route matching is deterministic and normalizes aliases, query strings, fragments, case, and repeated slashes.

`apps/web/src/onboarding.ts` models local workspace creation and opening. It keeps workspace metadata local, validates `wsp_` identifiers, records the selected encryption mode, and returns cloned state so callers cannot mutate stored metadata by reference.

`apps/web/src/tasks.ts` stores task records and local task events in the browser store abstraction. It supports create, update, status transitions, tag cleanup, text filtering, active/default lists, event history, and immutable returned records.

`apps/web/src/documents.ts` implements a Markdown draft reducer and persistence helpers. Draft saves and deletes emit local events that can later feed audit, sync, and search indexing.

`apps/web/src/approvals.ts` keeps approval requests immutable while decisions and expiry updates are applied. It can list pending items, apply approve or reject decisions, expire stale requests, and summarize counts by status and risk.

`apps/web/src/auditTimeline.ts` filters, sorts, groups, and pages audit records by stable cursors. It is intentionally data-only so the same timeline behavior can be reused across the dashboard, CLI, and tests.

## Sync Service Models

`services/sync/src/cursors.ts` defines `cur_v1` cursors with a numeric position and final event id. Helpers parse, format, compare, and advance cursors after accepted event ids.

`services/sync/src/bundles.ts` builds deterministic upload batches from local event envelopes. The checksum is computed from canonical JSON, so field ordering does not change the batch digest. The module also validates upload requests, validates conflict summaries, and selects download windows by workspace and cursor.

## SDK Workspace Client

`packages/sdk-js/src/workspace.ts` provides a dependency-free in-memory client for local workspace prototypes. It validates workspace descriptors, returns `ok`/`err` results with stable error codes, appends ordered events, filters by type or cursor, and exposes frozen snapshots.

The client is not a durable store. It is a contract test bed for API shape, result semantics, cursor behavior, and future adapter implementations.

## Plugin Manifest Contract

`packages/plugin-sdk/src/manifest.ts` validates and normalizes plugin manifests. It checks plugin ids, semantic versions, entrypoints, duplicate tool/resource/prompt ids, permission allowlists, capability references, and JSON-compatible schemas.

The manifest diff helper reports added, removed, and changed capabilities so review screens and release tooling can explain what changed between plugin versions.

## Verification

Run the focused package checks from the repository root:

```powershell
npm.cmd --workspace @sovereignops/web run check
npm.cmd --workspace @sovereignops/sync run check
npm.cmd --workspace @sovereignops/sdk-js run check
npm.cmd --workspace @sovereignops/plugin-sdk run check
```

The cross-stack smoke command also covers these packages when `pnpm` is available through the local environment:

```powershell
python scripts\smoke.py
```
