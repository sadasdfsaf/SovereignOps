# Agent Notes

This repository may be edited by multiple agents and humans at the same time. Work conservatively and avoid undoing changes you did not make.

## Boundaries

- Work only inside this repository unless the user gives a different path for the current task.
- Update `RUN_LOG.md` when completing an implementation task or when the active workflow asks for a validation record.
- Do not copy private planning bundles, long task lists, or internal notes into project documents.
- Keep open-facing documents concise and neutral.

## Editing Rules

- Read existing files before changing them.
- Preserve unrelated edits, even if they appear while you are working.
- Prefer small patches over broad rewrites.
- Do not run destructive git commands.
- Keep Markdown simple and easy to diff.

## Project Focus

SovereignOps is about local-first encrypted AI agent operations. Relevant themes include end-to-end encryption, scoped agent tools, audit trails, plugin isolation, encrypted sync, and SDKs.

## Validation

- Prefer `python scripts/smoke.py` for cross-platform bootstrap checks.
- Use `python -m unittest discover -s tests` for Python tests until the broader toolchain is installed.
- Rust and package-manager checks should run when their tools are available; record clear skips when they are not.

## Handoff Notes

When finishing a task, summarize the files changed and any verification performed. If something could not be checked, say so directly.
