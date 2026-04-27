# Onboarding Tutorial

This tutorial walks a new private-team contributor through the local repository
and the first workspace concepts. It does not require a remote service.

## 1. Confirm Repository Health

Open a PowerShell prompt at the repository root:

```powershell
cd E:\SovereignOps
python scripts\repo_health.py --json
```

The JSON output should show `ok: true`. If optional commands are unavailable,
record that in your notes and continue with the checks that are present.

## 2. Preview A Sample Workspace

Generate a deterministic sample preview:

```powershell
python scripts\generate_example_workspace.py --workspace-id wsp_onboarding --preset tiny
```

The preview prints counts for docs, tasks, issues, approvals, and audit records.
It does not write files. Use this to learn the data shape before working with a
real workspace.

## 3. Read The Core Model

Start with these docs:

- `docs/core-model.md` for ids, events, reducers, sync, and audit primitives.
- `docs/local-workflows.md` for current web, sync, SDK, and plugin models.
- `docs/desktop-architecture.md` for local command and workspace layout rules.
- `docs/local-data-lifecycle.md` for creation, migration, backup, restore, sync,
  observability, and compaction expectations.

The most important idea is that durable state changes flow through events. Views
and summaries should be derived from those events.

## 4. Learn The Workspace Layout

A workspace folder contains a `.sovereignops` directory. The current layout
version includes:

- `workspace.json`
- `events`
- `objects`
- `index`
- `locks`
- `gateway.json`
- `migrations`

Desktop command contracts validate local paths and plan layout migrations. They
do not directly create folders or call platform APIs.

## 5. Practice The Approval Flow

Approvals are the handoff between an agent proposal and a durable write.

Read `apps/web/src/approvals.ts` and note the lifecycle:

- requested
- approved
- rejected
- expired
- cancelled

An agent or plugin should create a specific approval request and stop. The host
continues only after a reviewer approves the request.

## 6. Review Audit Expectations

Read `apps/web/src/auditTimeline.ts` and
`services/mcp-gateway/src/auditEmitter.ts`.

Audit records should explain:

- Actor.
- Target.
- Action.
- Decision.
- Redacted fields.
- Short summary.

Audit records should not contain secrets, raw sync payloads, private key
material, or full document bodies.

## 7. Review Plugin Boundaries

Read `docs/plugin-development.md`, then inspect:

- `packages/plugin-sdk/src/manifest.ts`
- `packages/plugin-sdk/src/sandbox.ts`

The manifest declares the plugin surface. The sandbox context enforces
capability checks, denied host APIs, audit capture, and deterministic work
limits in tests.

## 8. Understand Backup And Sync

Backups protect a local workspace. Sync moves encrypted event bundles between
trusted devices. Both flows should be planned and auditable.

Before backup:

- Check the workspace id and schema version.
- Confirm payload counts and integrity fingerprints.
- Keep content encrypted.

Before sync:

- Confirm device enrollment.
- Compare cursors.
- Verify checksums.
- Review conflicts before applying events.

## 9. Run Focused Checks

Use the checks that match your change. Examples:

```powershell
python -m unittest discover -s tests
npm.cmd --workspace @sovereignops/plugin-sdk run check
npm.cmd --workspace @sovereignops/sync run check
```

If a tool is unavailable on the machine, do not invent a passing result. Record
which command could not run and why.

## 10. First Contribution Checklist

Before sending work for review:

- Keep changes scoped to the files you own.
- Run `git diff --stat` and look for unexpected files.
- Run `python scripts\repo_health.py --json`.
- Check that examples use generic private-team content.
- Check that secrets and local paths were not committed.
- Summarize changed files and validation results.
