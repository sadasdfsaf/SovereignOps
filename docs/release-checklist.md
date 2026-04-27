# Release Checklist

Use this checklist before publishing a SovereignOps release artifact.

## Versioning

- Choose the next semantic version and record the reason in release notes.
- Confirm public package versions match the release tag.
- Verify migrations or compatibility notes are documented when interfaces changed.

## Verification

- Run `python scripts/smoke.py`.
- Run `python -m unittest discover -s tests`.
- Run `bash scripts/smoke.sh` when a bash shell is available.
- Run `cargo test --workspace` when Cargo is installed.
- Run `pnpm -r --if-present check` when pnpm is installed.
- Regenerate `docs/STATUS.md` with `python scripts/repo_health.py --markdown docs/STATUS.md`.

## Security And Privacy

- Confirm `.env.example` files contain no real credentials.
- Confirm agent-facing actions have policy checks and audit records.
- Confirm imported or external content is marked untrusted until reviewed.
- Confirm sync payloads remain opaque to relay code.

## Packaging

- Ensure `git status --short` is clean before tagging.
- Review `git diff --stat` for unexpected churn.
- Build release artifacts from a clean checkout.
- Publish release notes that describe user-visible changes and known limitations.

