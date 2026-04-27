# Dependency Review

This process governs project-local admission, updates, and removal of third-party dependencies.
It applies to Rust crates, Node packages, Python packages, and tool-only additions.

## Dependency Admission

- Start with a short need statement: what capability is missing, where it will be used, and who owns it.
- Prefer the standard library, existing dependencies, or small local code when the behavior is simple.
- Confirm the package source, release history, license, and maintenance status before adding it.
- Check whether the dependency runs code during install, build, test, or import.
- Review transitive dependencies for unexpected native code, network behavior, or broad permissions.
- Add the dependency only to the narrowest package or workspace that needs it.
- Update the relevant lockfile in the same change and keep unrelated lockfile movement out of scope.
- Document non-obvious risk, configuration, or sandbox assumptions in the review notes.

## Update Process

- State whether the update is for a security fix, compatibility fix, maintenance refresh, or feature need.
- Read the upstream changelog for breaking changes, removed APIs, and new runtime requirements.
- Compare lockfile changes against the intended package set.
- Run `python scripts/release_check.py --dry-run` to confirm available local checks.
- Run `python scripts/release_check.py` and any package-specific tests that cover the dependency path.
- If an optional toolchain is unavailable locally, record the skipped check and run it in CI or another prepared environment.

## Removal Process

- Remove unused imports, package entries, and lockfile references in the same change.
- Confirm no script, test, or generated file still assumes the dependency exists.
- Prefer removal over replacement when the capability is no longer needed.
- Keep compatibility shims temporary and add an owner when they cannot be removed immediately.

## Local Records

- Keep review notes with the pull request or change record, not in source comments.
- Include the package name, version change, reason, owner, checks run, and skipped checks.
- Revisit high-impact dependencies during release review even when their versions did not change.
