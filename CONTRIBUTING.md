# Contributing

SovereignOps is early-stage. Keep changes small, reviewable, and aligned with the local-first encrypted agent workflow.

## Working Guidelines

- Inspect the current repository before editing; other contributors may be working in parallel.
- Preserve unrelated changes and avoid broad rewrites.
- Keep documentation concise and suitable for an open project page.
- Do not copy long excerpts, private planning notes, or internal task queues into this repository.
- Do not commit secrets, tokens, keys, local credentials, or machine-specific paths.

## Change Checklist

- The change supports local-first operation, end-to-end encryption, agent safety, auditability, plugins, sync, or SDK usability.
- New behavior has tests when there is code to exercise.
- Security-sensitive code includes clear failure behavior.
- Documentation matches the implemented behavior.
- Formatting changes are limited to files touched for the actual change.

## Quickstart

Install the baseline tools first:

- Python 3.9 or newer.
- Node.js 22 or newer for package metadata and workspace checks.
- Rust 1.76 or newer when changing Rust crates.
- pnpm when changing package workspaces.

PowerShell examples use backslashes:

```powershell
git clone <repo-url>
Set-Location SovereignOps
python scripts\smoke.py
python -m unittest discover -s tests
python scripts\env_guard.py
python scripts\rust_guard.py
```

Git Bash examples use forward slashes:

```bash
git clone <repo-url>
cd SovereignOps
python scripts/smoke.py
python -m unittest discover -s tests
python scripts/env_guard.py
python scripts/rust_guard.py
```

`scripts/smoke.py` is the preferred bootstrap check. It runs the source guards and Python checks, then runs Cargo, Node, and pnpm checks when those tools are installed. Run the optional toolchain checks directly when you touched those areas:

```powershell
node scripts/node-check.mjs
cargo check --workspace
cargo test --workspace
pnpm -r --if-present check
npm run fixtures:check
python scripts/status_dashboard.py --json
```

`npm run fixtures:check` runs `python scripts/fixture_drift.py --json` for fixture drift checks. These checks use local-only deterministic fixtures and cover route/status drift plus response schema coverage. Use `python scripts/status_dashboard.py --json` to report repo health, fixture drift totals, and skipped optional tooling.

If Cargo is unavailable, `python scripts\rust_guard.py` is the Rust-source guard fallback for unsafe panic-style calls. See `docs/development-quickstart.md` for the expanded setup and validation flow.

## Environment Examples

Use `.env.example` files to document local settings. Secret-like values must stay blank or use obvious example-only placeholders, and `python scripts\env_guard.py` enforces that rule.

```dotenv
SERVICE_TOKEN=
LOCAL_DATA_DIR=.sovereignops-data
```

Do not add real tokens, keys, credentials, private notes, local plan packs, run logs, workspace exports, or machine-specific paths to examples, tests, docs, or fixtures.

## Task Queue Helper

The public `scripts\task_queue.py` helper can inspect a JSONL queue supplied with `--queue`. It does not store or vendor private planning queues.

## Documentation Style

- Use direct, plain language.
- Prefer short sections and concrete examples.
- Avoid speculative claims and oversized roadmaps.
- Keep project positioning centered on secure local agent operations.

## Review Expectations

Reviewers should prioritize correctness, data safety, permission boundaries, audit clarity, and maintainability. For narrow changes, focused tests are enough; for shared behavior, broaden coverage around failure paths and cross-module contracts.
