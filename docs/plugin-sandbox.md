# Plugin Sandbox Contract

This document is the public contract for plugin code that runs through the SDK sandbox harness. It describes what the host supplies, what plugin code may call, which host APIs stay unavailable, and how reviewers approve capability use before a plugin is released.

## Scope

The sandbox is a deterministic harness and contract boundary. Plugin functions receive a frozen `context` object, run synchronously, return JSON-compatible proposal data, and record ordered audit events. The harness is used by tests and by future host adapters to keep plugin behavior narrow and reviewable.

Production hosts should still run plugins inside an isolated runtime boundary. Plugin code must depend only on the context fields and methods listed here.

## Source Files

The current source and fixtures live in these public repo-relative paths:

- `packages/plugin-sdk/src/sandbox.ts` defines the sandbox boundary, denied host API list, failure codes, resource limits, and context helpers.
- `packages/plugin-sdk/src/manifest.ts` validates plugin manifests, permissions, capabilities, tools, resources, prompts, and input schemas.
- `packages/plugin-sdk/src/index.ts` exports the SDK entry points available to package users.
- `packages/plugin-sdk/tests/sandbox.test.mjs` covers boundary normalization, capability checks, host API denial, frozen context behavior, audit capture, resource limits, and async rejection.
- `packages/plugin-sdk/tests/plugin-examples.test.mjs` validates the example plugins inside the sandbox harness.
- `packages/plugin-sdk/tests/release-notes-plugin-example.test.mjs` validates the local-draft release notes example with sandbox capabilities and redaction checks.
- `examples/plugins/release-notes/manifest.json` declares the local release-notes plugin.
- `examples/plugins/release-notes/plugin.json` declares the local-draft release notes metadata plugin.
- `examples/plugins/release-notes/index.mjs` implements the local release-notes proposal builder.
- `examples/plugins/release-notes/sample-input.json` provides local commit and change-summary fixture data for the metadata draft test.
- `docs/plugin-release-notes-example.md` explains the release-notes example contract.

Use repo-relative paths in docs, audit summaries, and release notes. Do not include drive-letter paths, home folders, temp folders, connector cache locations, or local machine names.

## Sandbox Boundary

Allowed context surface:

- `context.hasCapability(id)` checks whether a capability was granted for the current run and records the decision.
- `context.requireCapability(id)` records an allow or deny decision and throws `SANDBOX_CAPABILITY_DENIED` when the capability is absent.
- `context.audit(type, detail)` records plugin-supplied JSON detail under a `plugin.audit` event.
- `context.tick(count, label)` spends deterministic work budget and records resource use.
- `context.capabilities`, `context.deniedHostApis`, `context.limits`, and `context.boundary` expose frozen run metadata.

The context object and nested metadata are frozen before plugin code runs. A plugin must return synchronously; promise-like returns fail with `SANDBOX_ASYNC_DENIED`.

## Denied Host APIs

The default deny list is exported as `DENIED_PLUGIN_HOST_APIS` from `packages/plugin-sdk/src/sandbox.ts`:

- `child_process`
- `Date.now`
- `env`
- `eval`
- `fetch`
- `fs`
- `Function`
- `Math.random`
- `net`
- `process`
- `setInterval`
- `setTimeout`

`context.host.<api>` and `context.requestHostApi(api)` always fail with `SANDBOX_HOST_API_DENIED`. The failure includes the requested API name and records a `host_api.denied` audit event. The sandbox harness does not pass direct host objects to plugin functions.

## Capability Review Flow

Capability review is required before a plugin is released:

1. The author declares precise capability ids in the manifest and maps each id to a supported permission.
2. The author links each tool, resource, or prompt to the narrowest capability that can support it.
3. The reviewer checks that every capability is necessary, named for one action, and compatible with proposal-only behavior when the plugin drafts content.
4. The approved capability ids are passed into `createPluginSandboxHarness()` or `runPluginInSandbox()` for the run.
5. The plugin calls `context.requireCapability()` before reading supplied records or building proposals.
6. A denied capability stops the plugin with `SANDBOX_CAPABILITY_DENIED` and leaves no host-side change.
7. Any new capability requires a manifest update, sandbox test update, and reviewer approval before release.

## Resource Limits And Failures

The default limits come from `DEFAULT_PLUGIN_SANDBOX_LIMITS`:

- `maxAuditEvents: 256`
- `maxTicks: 1000`

Runs return stable result objects:

- `ok: true`, `value`, `audit`, and `ticks` for success.
- `ok: false`, `error`, `audit`, and `ticks` for failure.

Known failure codes are `SANDBOX_ASYNC_DENIED`, `SANDBOX_AUDIT_LIMIT`, `SANDBOX_CAPABILITY_DENIED`, `SANDBOX_HOST_API_DENIED`, `SANDBOX_INVALID_AUDIT`, `SANDBOX_INVALID_TICK`, `SANDBOX_RESOURCE_LIMIT`, and `PLUGIN_ERROR`.

Failure objects omit stack traces, timestamps, and host-specific paths. Audit events use deterministic sequence numbers and tick counts.

## Audit And Redaction

Audit details must be JSON-compatible and reviewable. Plugin code should record enough detail to explain the decision, but it must not expose secrets, personal cache paths, or raw local filesystem locations.

Before audit output, generated notes, or review summaries leave the sandbox workflow:

- Replace values from sensitive fields such as `token`, `secret`, `password`, `apiKey`, `authorization`, and `credential` with `[REDACTED]`.
- Replace bearer-style values, access keys, and private-key material with `[REDACTED]`.
- Preserve object shape, ids, categories, counts, and non-sensitive labels so reviewers can still understand the proposal.
- Prefer repo-relative references such as `examples/plugins/release-notes/index.mjs`.
- Drop machine-specific paths instead of shortening them.

## Validation Commands

Run these checks from the repository root:

```powershell
python -m unittest tests.test_plugin_sandbox_docs
npm.cmd --workspace @sovereignops/plugin-sdk run check
python scripts/release_notes.py --version plugin-docs --range HEAD..HEAD
```
