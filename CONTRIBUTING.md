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

```powershell
git clone <repo-url>
Set-Location SovereignOps
python scripts\smoke.py
python -m unittest discover -s tests
```

Optional checks run when their tools are installed:

```powershell
cargo test --workspace
pnpm -r --if-present check
```

## Documentation Style

- Use direct, plain language.
- Prefer short sections and concrete examples.
- Avoid speculative claims and oversized roadmaps.
- Keep project positioning centered on secure local agent operations.

## Review Expectations

Reviewers should prioritize correctness, data safety, permission boundaries, audit clarity, and maintainability. For narrow changes, focused tests are enough; for shared behavior, broaden coverage around failure paths and cross-module contracts.
