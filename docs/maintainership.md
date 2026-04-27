# Maintainership

This guide covers local release preparation for maintainers working in the shared repository.

## Release Notes

- Generate notes from the current branch with `python scripts/release_notes.py --version <version> --range <base>..HEAD`.
- Generate notes from a fixture with `python scripts/release_notes.py --input-json path/to/commits.json --version <version>`.
- Keep source labels explicit when notes come from a curated fixture: add `--source-label fixture-name`.
- Review the generated Markdown before publishing and keep entries focused on user-visible behavior, compatibility notes, and known limits.

## LOC Integrity

- Run `python scripts/loc_integrity.py` before tagging a release.
- Use `python scripts/loc_integrity.py --json` when another script needs structured results.
- Override a floor only when the maintainership baseline intentionally changes, for example `--minimum total=30000`.
- Generated directories are expected to stay empty by default. Raise `--generated-max-files` and `--generated-max-lines` only for reviewed generated artifacts that must be checked in.

## Release Stewardship

Maintainership work should leave enough evidence for another maintainer to
repeat the release checks from the same commit.

## Local Release Flow

- Run `python scripts/release_check.py --dry-run` to confirm available checks.
- Run `python scripts/release_check.py` from a clean checkout.
- Run `python scripts/release_notes.py` and attach the reviewed output to the release record.
- Run `python scripts/loc_integrity.py --json` and keep the result with the release verification notes.
