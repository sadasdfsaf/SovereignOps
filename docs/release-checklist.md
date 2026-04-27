# Release Checklist

Use this checklist before publishing an open-source SovereignOps release artifact.

## Versioning

- Choose the next semantic version and record why the change is major, minor, or patch.
- Confirm every changed package manifest uses the release version or a deliberate workspace range.
- Confirm release notes include user-visible changes, compatibility notes, and known limits.
- Confirm generated files were refreshed by their source command before the final diff review.

## Validation

- Run `python scripts/release_check.py --dry-run` and confirm the discovered checks match the release scope.
- Run `python scripts/release_check.py` from a clean checkout before tagging.
- Run `python scripts/smoke.py` for the cross-platform smoke pass.
- Run `python -m unittest discover -s tests`.
- Run `python -m unittest discover -s services/ingest/tests`.
- Run `python scripts/repo_health.py --json` and fix missing paths or content warnings.
- Run `python scripts/status_dashboard.py --json` when status output changed.
- Run `python scripts/public_boundary_guard.py --json`.
- Run `python scripts/env_guard.py`.
- Run `python scripts/validate_openapi.py`.
- From `packages/schemas`, run the schema export check: `node scripts/export-json-schema.mjs --check`.
- When the toolchain is installed, run `npm run check --workspaces --if-present`.
- When the toolchain is installed, run `pnpm -r --if-present check`.
- When the toolchain is installed, run `cargo check --workspace`.

## Local-First, Privacy, And Security

- Confirm examples, fixtures, and docs use local paths, local hostnames, or placeholder values only.
- Confirm `.env.example` files contain blanks or example-only values for secret-shaped names.
- Confirm imported content remains marked untrusted until a local review step accepts it.
- Confirm sync and relay paths do not log or inspect opaque payload contents.
- Confirm agent-facing actions require explicit authorization and emit audit records.
- Confirm release notes do not include credentials, host-specific paths, raw payloads, or private workspace notes.

## Artifact Review

- Run `git status --short` and confirm only intended release files are changed.
- Run `git diff --stat` and check for generated churn, lockfile movement, or unrelated edits.
- Build release archives and packages from the same clean checkout that passed validation.
- Inspect packaged files before upload so docs, schemas, examples, and manifests are present.
- Compare artifact checksums with the upload output and record the final values in release notes.

## Rollback

- Keep the previous release tag, artifact checksums, and notes available until the new release is verified.
- If validation fails after tagging, delete the local tag and remote tag before publishing artifacts.
- If an uploaded artifact is wrong, remove it, rebuild from a clean checkout, and rerun the full validation section.
- If a package was already published, prepare a patch release that reverts the broken change or restores the last known good artifact.
- Record the rollback reason, affected artifact names, and follow-up owner in release notes.
