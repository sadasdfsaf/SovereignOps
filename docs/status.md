# Repository Status

This page is the concise public status view for the current repository. It is meant to help contributors understand what is present, what to run locally, and how to read tool output without treating optional tool gaps as product failures.

## Scope At A Glance

- The repository is in an early bootstrap stage with small, reviewable modules across Rust, TypeScript, and Python.
- The baseline emphasizes local-first workflows, explicit capability boundaries, redaction, deterministic fixtures, and repeatable validation.
- Status is based on checked-in files and local commands; it does not claim production readiness.

## Module Summary

- `crates/sovereign_core`: canonical identifiers, event ordering helpers, redaction helpers, and permission decision primitives.
- `packages/schemas`: shared TypeScript contracts and fixtures for workspace, ingest, approval, and review data.
- `apps/api`: dependency-light route contracts and replayable service handlers.
- `apps/web`: framework-free workflow state models for local review, ingest, approvals, and timelines.
- `apps/desktop`: desktop command contracts and workspace layout planning.
- `packages/cli`: command surfaces for workspace previews, ingest, replay, export, and local gateway checks.
- `packages/sdk-js` and `packages/plugin-sdk`: client surfaces, plugin manifests, sandbox contracts, and review artifacts.
- `services/ingest`: Python helpers for Markdown, JSON, CSV, logs, quarantine, and search index fixtures.
- `services/sync`: deterministic cursors, bundles, replay helpers, invite flows, and local sync handlers.
- `services/mcp-gateway`: local resource and tool adapters with approval evidence and replay coverage.
- `services/automation`: deterministic rule evaluation and proposal-only action records.
- `scripts`: smoke, repository health, content boundary, environment, release, and size checks.

## Validation Commands

Run the Python checks first because they cover the repository baseline and do not require Node, pnpm, or Cargo:

```powershell
python scripts\smoke.py
python -m unittest discover -s tests
python scripts\repo_health.py --json
python scripts\public_boundary_guard.py --json
python scripts\loc_budget.py --summary
python scripts\env_guard.py
npm run fixtures:check
python scripts/fixture_drift.py --json
python scripts/status_dashboard.py --json
```

When Node is installed, the smoke check also runs `node scripts/node-check.mjs`. When Cargo or pnpm are installed, the smoke check attempts the Rust and package checks as optional local checks.

## Fixture Drift And Status Dashboard

- `npm run fixtures:check` is the contributor shortcut for `python scripts/fixture_drift.py --json`.
- `python scripts/fixture_drift.py --json` checks checked-in, local-only deterministic fixtures against OpenAPI route coverage, expected statuses, request-body schema refs, and response schema coverage.
- `python scripts/status_dashboard.py --json` emits a deterministic repository status snapshot with package metadata, repo health, OpenAPI counts, fixture drift totals, and skipped optional tooling.

## Known Tool Gaps

- `cargo` may be absent in a shell that does not have the Rust toolchain on `PATH`; smoke output should show this as a skipped optional check.
- `pnpm` may be absent in a shell that has Node but not the package manager; smoke output should show this as a skipped optional check.
- Tool availability is shell-specific. A passing Python baseline with skipped optional checks means the checkout is usable for public documentation and Python validation, not that every language package has been checked.

## Local-First And Privacy Posture

- Local fixtures should be synthetic, deterministic, and safe to run from a checkout without remote services.
- Credentials, tokens, personal notes, and machine-specific paths do not belong in public files.
- Examples should prefer local identifiers, repo-relative paths, and redacted placeholders such as `[REDACTED]`.
- New workflows should leave reviewable records and boundary tests before data becomes durable.

## Interpreting Status

- Green status means required paths are present, Python validation passes, and the content boundary scan reports no blocked public-content wording.
- Yellow status means the Python baseline passes but optional language tools are missing or skipped in the current shell.
- Red status means a required path is missing, a validation command fails, or the boundary scan reports content that must be removed before release.
- Contributors should include the commands they ran, the shell used, and any skipped optional tools when reporting status.
