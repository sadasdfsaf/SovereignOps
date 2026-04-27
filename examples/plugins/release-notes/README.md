# Local Release Notes Plugin Example

This example shows a manifest-driven plugin contract for drafting release-note metadata from local commit and change summaries. It is designed for offline execution: the host supplies JSON input, the plugin reads only that local payload, redacts sensitive strings, and returns a reviewable draft object.

## Files

- `plugin.json` declares the local read, redaction, and proposal capabilities.
- `sample-input.json` provides representative commit and change summaries, including fake secret-like values used to test redaction.
- `packages/plugin-sdk/tests/release-notes-plugin-example.test.mjs` validates the manifest and runs representative logic through the SDK sandbox harness.

## Contract

1. The host passes local JSON matching the `draft_release_note_metadata` tool schema.
2. The plugin requires `read_local_change_summaries`, `redact_sensitive_release_note_fields`, and `propose_release_note_draft`.
3. The plugin groups included changes by release-note category.
4. Secret-like strings are replaced with `[REDACTED]` before any draft metadata is returned.
5. The result is proposal-only metadata; it does not write files or mutate workspace records.

## Local-Only Constraints

- No network, shell, filesystem, clock, or random host APIs are required by the manifest.
- Resource URIs use the `local://` scheme.
- Output is deterministic for the same input.
- Audit events record counts and phases, not unredacted content.

Run the focused example test from the repository root:

```sh
node packages/plugin-sdk/tests/release-notes-plugin-example.test.mjs
```
