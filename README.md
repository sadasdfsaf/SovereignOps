# SovereignOps

SovereignOps is a local-first platform for safe AI agent operations over sensitive workspaces. It is designed around user-controlled data, end-to-end encryption, auditable agent actions, plugin boundaries, encrypted sync, and SDK-first integration.

## Goals

- Keep the primary workspace local-first, with clear ownership of data and keys.
- Use end-to-end encryption for stored content and sync payloads.
- Run AI agents with explicit capability scopes and reviewable actions.
- Maintain audit trails for agent, plugin, sync, and SDK activity.
- Support a plugin model that favors least privilege and clear isolation.
- Provide SDKs that make secure automation practical for teams and builders.

## Current Scope

The repository now has the first public bootstrap: root toolchain metadata, cross-platform smoke checks, a small Rust core crate, TypeScript package surfaces, a Python ingest helper, and focused tests. Early work should continue to favor small reviewable slices around security boundaries, data formats, developer ergonomics, and local-first prototypes.

## Security Principles

- Do not commit credentials, keys, tokens, private notes, or local machine secrets.
- Prefer explicit permission boundaries over broad tool access.
- Make agent actions observable before they become durable.
- Keep sync designs encrypted by default.
- Design SDK interfaces so unsafe defaults are hard to use by accident.

## Repository Map

- `crates/sovereign_core`: canonical IDs, event ordering, policy decisions, and audit redaction helpers.
- `packages/schemas`: shared TypeScript contracts for workspace, agent action, and audit data.
- `apps/api`: dependency-free API route contracts for health checks and future local service handlers.
- `packages/cli`: dependency-free command runner for workspace, ingest, policy, audit, and bundle export previews.
- `apps/web`: framework-free local workflow models for routes, onboarding, tasks, Markdown drafts, approvals, and audit timelines.
- `packages/sdk-js` and `packages/plugin-sdk`: workspace client, API client, plugin manifest, and sandbox contracts.
- `services/automation`: deterministic automation rule evaluation and proposal-only action registry.
- `services/ingest`: Python normalization helpers plus structured Markdown, JSON, and CSV import connectors.
- `services/sync`: deterministic cursors, bundles, repositories, HTTP handler logic, device enrollment, invites, and rate limits.
- `services/mcp-gateway`: policy-gated resources, safe local tool proposals, and audit emitters.
- `apps/desktop`: desktop command contracts and local workspace layout planning.
- `scripts`: smoke, repository health, task queue, environment guard, package baseline, and LOC tools.
- `docs/core-model.md`: public overview of identifiers, events, reducers, sync, and audit primitives.
- `docs/local-workflows.md`: public overview of the current Web, sync, SDK, and plugin workflow modules.
- `docs/service-contracts.md`: public overview of API, sync, MCP gateway, and structured ingest service contracts.
- `docs/status.md`: public repository health summary.

## Local Checks

```powershell
python scripts\smoke.py
python -m unittest discover -s tests
python scripts\loc_budget.py --summary
python scripts\env_guard.py
npm run fixtures:check
```

Rust and pnpm checks are wired into the smoke flow and run automatically when those tools are installed.
