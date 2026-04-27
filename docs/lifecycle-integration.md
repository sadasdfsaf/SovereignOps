# Lifecycle Integration

This page maps the public lifecycle pieces that support local-first workspace
operations. The emphasis is on how existing routes, commands, SDK helpers,
exports, path checks, and review state fit together without requiring remote
services.

## Integration Map

API route contracts live in `docs/openapi.yaml` and are mounted by
`apps/api/src/lifecycleRoutes.ts`. The current lifecycle routes cover migration
planning and runs, backup manifest submission, restore planning, observability
events and metrics, and compaction planning:

- `POST /v1/workspaces/:workspaceId/migrations/plan`
- `POST /v1/workspaces/:workspaceId/migrations/run`
- `POST /v1/workspaces/:workspaceId/backups/manifests`
- `POST /v1/workspaces/:targetWorkspaceId/restores/plan`
- `POST /v1/observability/events`
- `POST /v1/observability/metrics`
- `POST /v1/workspaces/:workspaceId/compactions/plan`

CLI lifecycle previews are implemented in `packages/cli/src/lifecycle.ts`, with
the shared entrypoint in `packages/cli/src/index.ts` and the base local commands
in `packages/cli/src/commands.ts`. The lifecycle command families are
`migration plan`, `backup manifest validate`, `restore plan`, `compaction plan`,
`loc integrity`, and `release notes`. They return JSON or Markdown summaries
and do not apply durable workspace writes directly.

SDK helpers keep the same flow available to local callers. HTTP-facing typed
methods live in `packages/sdk-js/src/client.ts`; in-memory workspace behavior is
in `packages/sdk-js/src/workspace.ts`; local JSON storage planning and adapters
are in `packages/sdk-js/src/storage.ts`. Lower-level lifecycle logic is split
across `packages/workspace-store/src/index.ts`,
`packages/workspace-backup/src/index.ts`, and
`packages/event-compaction/src/index.ts`.

Audit export is handled by `packages/audit-export/src/index.ts`. It normalizes
events, filters them, redacts sensitive-shaped values, and renders deterministic
JSONL, CSV, manifest, and package fingerprints for offline review.

Path safety is centralized in `packages/path-security/src/index.ts`. It
normalizes local relative paths, rejects traversal and absolute paths, joins
workspace roots without escaping the root, applies deny patterns, and produces
redacted path displays for logs and review screens.

Web review state is modeled in `apps/web/src/lifecycleReview.ts`. It records
backup and restore reviews, migration plans, sync replay checks, compaction
plans, approval decisions, redaction markers, and summary counts for local
review surfaces.

## Local Command Examples

These examples use repository-local scripts or package checks. They do not
require credentials, network access, or an external service.

```powershell
python scripts\smoke.py
python scripts\validate_openapi.py
python scripts\loc_budget.py --summary
python -m unittest tests.test_lifecycle_integration_docs
npm.cmd --workspace @sovereignops/api run check
npm.cmd --workspace @sovereignops/cli run check
npm.cmd --workspace @sovereignops/sdk-js run check
npm.cmd --workspace @sovereignops/audit-export run check
npm.cmd --workspace @sovereignops/path-security run check
npm.cmd --workspace @sovereignops/web run check
```

## Safety Guarantees

- Dry-run planning precedes durable changes for migrations, restores, and compaction.
- Route path parameters must match body identifiers before handlers run.
- Restore replace and source overwrite require explicit approval flags.
- Backup payload paths stay relative; traversal and absolute paths are rejected.
- Audit export redacts sensitive-shaped values before JSONL or CSV output.
- Path display uses deterministic redacted references instead of exposing local roots.
- Web review state blocks approval while blockers or open blocking redactions remain.
- SDK storage and workspace helpers return cloned or frozen snapshots.
- Lifecycle checks remain local and do not require credentials, network access, or external services.
