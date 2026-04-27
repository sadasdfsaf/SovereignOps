# Release Notes Plugin Example

The release-notes plugin is a local example that drafts reviewable notes from completed task records. It runs inside the plugin sandbox, asks for explicit capabilities, and returns a proposal instead of changing files.

## Purpose

Use this example when building a plugin that summarizes supplied workspace records into a draft. The plugin demonstrates proposal-only behavior, capability checks before work, deterministic tick use, and audit events that reviewers can inspect before publication.

The plugin does not publish notes, mutate task records, or request host APIs. Treat review before publication as the required gate.

## Source Files

The example lives in these public repo-relative paths:

- `examples/plugins/release-notes/manifest.json`
- `examples/plugins/release-notes/plugin.json`
- `examples/plugins/release-notes/index.mjs`
- `examples/plugins/release-notes/sample-input.json`
- `packages/plugin-sdk/tests/plugin-examples.test.mjs`
- `packages/plugin-sdk/tests/release-notes-plugin-example.test.mjs`
- `packages/plugin-sdk/src/sandbox.ts`
- `packages/plugin-sdk/src/manifest.ts`
- `docs/plugin-sandbox.md`

Keep references repo-relative. Do not include drive-letter paths, home folders, temp folders, connector cache locations, or local machine names in generated notes.

## Manifest Shape

`examples/plugins/release-notes/manifest.json` declares:

- plugin id `plugin.release-notes`
- entrypoint `index.mjs`
- permissions `propose_agent_action` and `read_object`
- capability `propose_release_notes`
- capability `read_completed_tasks`
- tool `draft_release_notes`
- resource `completed_task_feed`
- prompt `release_note_review`
- minimum host version `0.3.0`

The capability names are intentionally narrow. `read_completed_tasks` covers reading supplied completed task metadata, while `propose_release_notes` covers returning a reviewable draft.

`examples/plugins/release-notes/plugin.json` adds a metadata-focused variant with plugin id `plugin.release-notes.local-draft`. It declares `read_local_change_summaries`, `redact_sensitive_release_note_fields`, and `propose_release_note_draft` so tests can validate local commit summaries, redaction, and proposal metadata separately from the task-oriented example.

## Sandbox Run

`examples/plugins/release-notes/index.mjs` exports `draftReleaseNotes(context, input)`. A valid run:

1. Calls `context.requireCapability("read_completed_tasks")`.
2. Calls `context.requireCapability("propose_release_notes")`.
3. Normalizes the supplied `tasks` array.
4. Records `release_notes.tasks_scanned`.
5. Spends ticks for classification.
6. Selects tasks with status `complete`, `completed`, `done`, or `released`.
7. Records `release_notes.completed_selected`.
8. Spends ticks for drafting.
9. Returns a `release_notes_proposal`.

If either capability is missing, the sandbox returns `SANDBOX_CAPABILITY_DENIED`.

## Local Input Shape

The tool input is a local object with:

- `releaseName`: optional label for the proposal.
- `tasks`: array of task-like records.

The metadata variant reads `examples/plugins/release-notes/sample-input.json`, which includes:

- `releaseName`
- `source`
- `commits`
- `changes`
- `redaction`

Each task may include:

- `id`
- `title`
- `summary`
- `description`
- `category`
- `status`
- `labels`

Incomplete records are normalized with stable defaults such as `task-1`, `Untitled task`, `Updates`, and `unknown`.

## Proposal Output

The plugin returns:

- `type: "release_notes_proposal"`
- `proposalOnly: true`
- `releaseName`
- `summary`
- `sections`
- `sourceTaskIds`
- `omittedTaskIds`
- `nextStep: "Review the proposal before publication."`

Only completed task ids appear in `sourceTaskIds`. Non-completed task ids appear in `omittedTaskIds` so reviewers can see what was excluded.

## Review And Publication Flow

Use this review flow for the example and any plugin modeled after it:

1. Validate the manifest with the SDK check.
2. Run the plugin in `createPluginSandboxHarness()` with only approved capability ids.
3. Inspect audit events for capability checks, task counts, selected task counts, omitted task counts, and tick use.
4. Confirm the output is proposal-only and includes `proposalOnly: true`.
5. Apply redaction before release notes are shared outside the review workflow.
6. Publish only after reviewer approval.

## Redaction Expectations

Release notes should describe user-visible changes without leaking sensitive values or machine-specific locations.

- Replace sensitive fields such as `token`, `secret`, `password`, `apiKey`, `authorization`, and `credential` with `[REDACTED]`.
- Replace bearer-style values, access keys, and private-key material with `[REDACTED]`.
- Remove drive-letter paths, home folders, temp folders, connector cache locations, and local machine names.
- Keep task ids, categories, status counts, and labels when they are not sensitive.
- Keep paths repo-relative, for example `examples/plugins/release-notes/manifest.json`.

## Validation Commands

Run these checks from the repository root:

```powershell
python -m unittest tests.test_plugin_sandbox_docs
npm.cmd --workspace @sovereignops/plugin-sdk run check
python scripts/release_notes.py --version plugin-docs --range HEAD..HEAD
```
