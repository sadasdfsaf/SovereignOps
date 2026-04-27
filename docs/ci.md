# CI

The repository has five GitHub Actions workflows under `.github/workflows`:

- `smoke.yml` runs the cross-stack smoke script and the workflow contract tests.
- `python.yml` runs the Python unit test suite plus local guard scripts.
- `node.yml` runs the Node package baseline and optional workspace checks.
- `typescript.yml` runs the TypeScript workspace checks when pnpm is available.
- `rust.yml` runs the Rust source guard and optional Cargo checks.

Each workflow calls repository-local commands only. They do not need credentials, hosted services, or external data sources.

## Local Commands

Run these commands from the repository root before opening a pull request:

```powershell
python scripts\smoke.py
python -m unittest tests.test_ci_workflows
python -m unittest discover -s tests
node scripts\node-check.mjs
python scripts\rust_guard.py
```

Optional toolchain checks run when the matching tool is installed:

```powershell
pnpm -r --if-present check
cargo fmt --all -- --check
cargo check --workspace
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

Missing optional tools should produce a skip message in CI rather than requiring local setup for every contributor.
