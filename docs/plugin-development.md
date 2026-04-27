# Plugin Development

Plugins declare their surface area in a manifest and run against a narrow host-provided context. The plugin SDK keeps the early contract small: validate the manifest, check declared capabilities, run plugin logic in the deterministic sandbox harness, and inspect ordered audit events.

## Manifest Basics

`packages/plugin-sdk/src/manifest.ts` validates:

- plugin id, name, description, version, entrypoint, and minimum host version;
- supported permission names;
- capability ids and their permission mapping;
- tool, resource, and prompt ids;
- JSON-compatible tool input schemas.

Keep manifest capabilities specific to what the plugin needs. For example, a note helper can declare separate `read_note` and `write_note` capabilities instead of one broad capability.

## Sandbox Boundary

`packages/plugin-sdk/src/sandbox.ts` models the plugin runtime boundary used by tests and future host adapters.

Allowed surface:

- `context.hasCapability(id)` checks whether the current run was granted a capability.
- `context.requireCapability(id)` records an allow or deny decision and throws on deny.
- `context.audit(type, detail)` records plugin-supplied JSON audit detail.
- `context.tick(count, label)` spends deterministic work budget.
- `context.capabilities`, `context.deniedHostApis`, and `context.limits` expose frozen run metadata.

Denied host APIs:

- filesystem, process, environment, network, child process, timers, fetch, dynamic code execution, clock time, and random number APIs are listed as denied host APIs;
- `context.host.<api>` and `context.requestHostApi(api)` always fail with `SANDBOX_HOST_API_DENIED`;
- the test harness does not provide direct host objects to plugin functions.

Resource limits:

- `maxTicks` is a synchronous work budget. Plugin code or host wrappers call `tick()` at deterministic work boundaries.
- `maxAuditEvents` bounds captured audit output.
- the harness returns stable failure objects without stack traces or timestamps.

The harness is a contract and test tool. Production execution should still use an isolated runtime boundary; plugin functions should only depend on the context they receive.

## Running A Plugin In Tests

```js
import { runPluginInSandbox } from "../src/sandbox.ts";

const result = runPluginInSandbox((context) => {
  context.requireCapability("read_note");
  context.audit("note.checked", { id: "n1" });
  context.tick(1, "scan");
  return { ok: true };
}, {
  capabilities: ["read_note"],
  limits: {
    maxAuditEvents: 16,
    maxTicks: 20,
  },
});

if (!result.ok) {
  throw new Error(result.error.message);
}
```

Use `createPluginSandboxHarness()` when multiple plugin functions should run against the same normalized boundary in one test file.

## Testing Expectations

Plugin tests should cover:

- the manifest validates and normalizes successfully;
- required capabilities are granted or denied as expected;
- denied host API access returns `SANDBOX_HOST_API_DENIED`;
- the plugin does not mutate the frozen context;
- important plugin actions emit audit events;
- resource exhaustion returns the same failure result across repeated runs.

Run focused checks from the repository root:

```powershell
npm.cmd --workspace @sovereignops/plugin-sdk run check
```

## Package Export Note

The sandbox module is intentionally separate from manifest helpers. When the package-level SDK surface is ready, re-export sandbox helpers from `packages/plugin-sdk/src/index.ts` so consumers can import them from the package root.
