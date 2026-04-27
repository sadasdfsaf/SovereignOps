# Development Quickstart

This guide expands the contributor quickstart for a local checkout. Keep setup local, keep examples secret-free, and run the smallest validation set that covers the files you changed.

## Toolchain Setup

Install these tools before running the full validation flow:

- Python 3.9 or newer. The repository scripts use the standard library and are launched with `python`.
- Node.js 22 or newer. The root package metadata declares this in `package.json`.
- Rust 1.76 or newer when changing `crates/`.
- pnpm when changing package workspaces under `apps/`, `packages/`, or supported service workspaces.
- Git Bash or PowerShell on Windows. Use the same commands, but adjust path separators for the shell.

The repository does not require a checked-in virtual environment. If you create one locally, keep it outside versioned files or use the ignored `.venv/` path.

## Clone And Enter The Repository

PowerShell:

```powershell
git clone <repo-url>
Set-Location SovereignOps
python --version
node --version
```

Git Bash:

```bash
git clone <repo-url>
cd SovereignOps
python --version
node --version
```

Use backslashes in PowerShell examples such as `scripts\smoke.py`. Use forward slashes in Git Bash examples such as `scripts/smoke.py`.

## Baseline Validation

Run the cross-platform smoke check first:

```powershell
python scripts\smoke.py
```

The smoke check runs the repository health checks, local boundary checks, environment example checks, Rust-source guard fallback, OpenAPI validation, MCP fixture validation, and Python ingest tests. It also runs Cargo, Node, and pnpm checks when those tools are installed.

Run the focused Python test suite directly when you are iterating on Python code or docs tests:

```powershell
python -m unittest discover -s tests
```

Run guardrails directly when you changed docs, examples, root metadata, or setup files:

```powershell
python scripts\repo_health.py --json
python scripts\public_boundary_guard.py --json
python scripts\env_guard.py
python scripts\rust_guard.py
python scripts\validate_openapi.py
python scripts\validate_mcp_gateway_fixtures.py
```

## Optional Toolchain Checks

Run these checks when the related toolchain is installed or when you changed matching files:

```powershell
node scripts/node-check.mjs
cargo check --workspace
cargo test --workspace
pnpm -r --if-present check
```

If Cargo is not installed, keep running `python scripts\rust_guard.py`. It scans Rust source for panic-style calls that the workspace lints also reject.

If pnpm is not installed and you changed package metadata, run `node scripts/node-check.mjs` at minimum and record the skipped pnpm check in your handoff.

## Shell Notes

PowerShell command style:

```powershell
Set-Location E:\SovereignOps
python scripts\env_guard.py
```

Git Bash command style:

```bash
cd /e/SovereignOps
python scripts/env_guard.py
```

Do not mix shell-specific path forms inside scripts or committed docs unless the section names the shell.

## Local-Only Privacy Expectations

Keep the repository free of machine-local material:

- Do not commit `.env`, `.env.*`, `.venv/`, local data directories, run logs, workspace exports, or private planning material.
- Do not copy local plan packs or internal task queues into docs, tests, examples, or fixtures.
- Keep generated evidence and scratch data outside versioned paths unless a maintainer explicitly asks for a sanitized fixture.
- Review `git diff --stat` before handoff and remove accidental local artifacts from the change.

The local boundary check is:

```powershell
python scripts\public_boundary_guard.py --json
```

## No-Secret Examples

Example files should show names and safe defaults without real secret values:

```dotenv
SERVICE_TOKEN=
LOCAL_DATA_DIR=.sovereignops-data
LOG_LEVEL=info
```

Avoid realistic tokens, keys, passwords, customer names, machine-specific absolute paths, and copied local content. After editing any `.env.example`, run:

```powershell
python scripts\env_guard.py
```

## Suggested Handoff

Summarize the files changed, commands run, and any skipped optional checks. If an optional check was skipped because a tool is missing, name the tool and the command that still needs to run in a prepared environment.
