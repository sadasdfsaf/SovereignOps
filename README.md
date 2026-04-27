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
- `packages/sdk-js` and `packages/plugin-sdk`: early SDK surfaces for clients and plugins.
- `services/ingest`: Python normalization helpers for untrusted imported content.
- `scripts`: smoke, repository health, task queue, environment guard, package baseline, and LOC tools.
- `docs/STATUS.md`: generated repository health summary.

## Local Checks

```powershell
python scripts\smoke.py
python -m unittest discover -s tests
python scripts\loc_budget.py --summary
python scripts\env_guard.py
```

Rust and pnpm checks are wired into the smoke flow and run automatically when those tools are installed.
