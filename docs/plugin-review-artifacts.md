# Plugin Review Artifacts

Plugin review artifacts are small JSON records that capture what a plugin proposed, which capabilities were granted, which sandbox evidence was produced, and which sensitive inputs were redacted. They are meant to be checked into public examples only after the artifact uses repo-relative paths and contains no raw secret values.

## Purpose

Use a review artifact when a plugin returns a proposal that should be inspected before use. The artifact gives reviewers a stable local record of the sandbox run without changing workspace records.

Artifacts should show:

- the plugin id, version, manifest path, and entrypoint;
- the approved capabilities used for the run;
- the sandbox limits, tick count, and audit event names;
- the proposal summary and source counts;
- the redaction rules and replacement counts;
- the local files used to reproduce the example.

## Public Files

The release-notes example uses these public repo-relative files:

- `packages/plugin-sdk/src/reviewArtifact.ts`
- `packages/plugin-sdk/tests/review-artifact.test.mjs`
- `services/automation/src/pluginReview.ts`
- `services/automation/tests/plugin-review.test.mjs`
- `apps/web/src/pluginReviewArtifactState.ts`
- `apps/web/tests/plugin-review-artifact-state.test.mjs`
- `packages/cli/src/pluginReviewArtifact.ts`
- `packages/cli/tests/plugin-review-artifact.test.mjs`
- `examples/plugins/release-notes/review-artifact.json`
- `examples/plugins/release-notes/plugin.json`
- `examples/plugins/release-notes/manifest.json`
- `examples/plugins/release-notes/index.mjs`
- `examples/plugins/release-notes/sample-input.json`
- `packages/plugin-sdk/src/sandbox.ts`
- `packages/plugin-sdk/src/manifest.ts`
- `packages/plugin-sdk/tests/release-notes-plugin-example.test.mjs`
- `docs/plugin-review-artifacts.md`
- `docs/plugin-release-notes-example.md`
- `docs/plugin-sandbox.md`
- `tests/test_plugin_review_artifacts_docs.py`

Do not add drive-letter paths, home folders, temp folders, connector cache locations, machine names, or private planning paths to public artifacts.

## Artifact Contents

A review artifact should include:

- `artifactVersion`: version of the artifact shape.
- `kind`: `plugin_review_artifact`.
- `plugin`: plugin identity and repo-relative manifest details.
- `scope`: proposal-only and local-only flags, with `externalCalls: 0`.
- `capabilityGrant`: approved capability ids and the reason they were needed.
- `sandboxRun`: deterministic limits, tick count, and audit event names.
- `proposal`: the reviewable output summary.
- `redactionReport`: redacted field paths, kinds, and replacement counts.
- `sourceFiles`: repo-relative files needed to reproduce the example.
- `reviewChecklist`: short checks completed before sharing the artifact.

## Release Notes Example

`examples/plugins/release-notes/review-artifact.json` documents a local run for `plugin.release-notes.local-draft`. It points at `examples/plugins/release-notes/sample-input.json`, records `proposalOnly: true`, records `localOnly: true`, and keeps `externalCalls: 0`.

The artifact mirrors the release-notes draft metadata flow:

1. Grant `read_local_change_summaries`.
2. Grant `redact_sensitive_release_note_fields`.
3. Grant `propose_release_note_draft`.
4. Scan local commits and change summaries.
5. Apply redaction before draft metadata is returned.
6. Return reviewable sections, omitted change ids, source counts, and redaction counts.

## Redaction

Redaction must happen before artifact data is shared. Replace sensitive fields such as `token`, `secret`, `password`, `apiKey`, `authorization`, and `credential` with `[REDACTED]`.

Artifacts may keep labels such as `password=[REDACTED]`, `apiKey=[REDACTED]`, and `Authorization: Bearer [REDACTED]` to show that fake secret-like inputs were already redacted. Do not include real bearer values, access keys, private-key material, or raw local filesystem paths.

Preserve object shape, ids, categories, counts, and repo-relative file references so the proposal remains reviewable.

## Local-Only Constraints

Public review artifacts for example plugins must be local-only:

- use only repo-relative file references;
- keep `localOnly: true`;
- keep `externalCalls: 0`;
- keep proposal outputs as proposal-only records;
- avoid publishing steps, remote locations, or host-specific paths;
- omit raw input values that were identified as sensitive.

## Review Steps

Before adding a review artifact:

1. Validate the plugin manifest.
2. Run the plugin inside the sandbox harness with only approved capabilities.
3. Confirm the artifact is proposal-only and local-only.
4. Confirm redaction replaced sensitive values with `[REDACTED]`.
5. Confirm every referenced file is public and repo-relative.
6. Confirm the artifact contains no private paths or raw secret-like values.

## Validation

Run the focused docs check from the repository root:

```powershell
python -m unittest tests.test_plugin_review_artifacts_docs
```
