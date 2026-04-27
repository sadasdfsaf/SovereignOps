# Security Checklist

Use this checklist before a release, before merging changes that touch sensitive data handling,
or before enabling new agent, plugin, sync, import, or export behavior.

## Release Gate

- Run `python scripts/release_check.py --dry-run` and confirm the expected checks are discovered.
- Run `python scripts/release_check.py`; missing optional toolchains may be skipped, but missing local files must be fixed.
- Run `python scripts/repo_health.py --json` and review any content or required-path findings.
- Run `python scripts/env_guard.py` after every `.env.example` edit.
- Review `git diff --stat` for unexpected generated files, lockfile churn, or unrelated edits.
- Confirm release notes describe security-relevant changes and known limits.

## Review Checklist

- Inputs are parsed through typed or schema-backed boundaries before use.
- Untrusted payloads are size-limited before parsing, storage, logging, or display.
- Agent actions use explicit policy checks before execution and emit audit records after decisions.
- Denied actions fail closed and return structured errors without leaking secrets.
- File paths are normalized, constrained to the intended workspace, and never joined from unchecked strings.
- Secrets are loaded from runtime configuration only; examples stay blank or use obvious placeholders.
- Logs avoid tokens, credentials, raw sync payloads, and unnecessary user content.
- Plugin entry points validate manifest fields, requested permissions, and command boundaries.
- Sync code treats remote payloads as opaque until local validation succeeds.

## Dependency And Build Checks

- Apply `docs/dependency-review.md` before adding or updating third-party code.
- Verify lockfiles match manifest changes and do not include unrelated package movement.
- Build artifacts must come from a clean checkout with the same checks run locally or in CI.
- Release automation must not install missing tools as part of `scripts/release_check.py`.
- Generated files must include their source command in the review notes when they are committed.

## Sign-Off Notes

- Record skipped optional checks and the reason they were skipped.
- Record any accepted residual risk with an owner and a follow-up issue.
- Do not tag a release while required release checks, source guards, or review items are failing.
