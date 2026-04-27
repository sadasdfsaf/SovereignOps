# Desktop Architecture

The desktop package defines the local command contract for a future Tauri shell without importing Tauri APIs. `apps/desktop/src/commands.ts` is dependency-free TypeScript: it validates command payloads, normalizes safe local paths, describes workspace file layout, plans layout migrations, and models workspace lock state transitions.

## Contract Boundary

The current desktop layer is pure logic. It does not open files, write locks, spawn sidecars, or call platform APIs. A Tauri adapter can wrap these exports later:

1. Receive an `invoke` call such as `workspace_open`.
2. Run the matching validator from `commands.ts`.
3. Apply the host effect described by command metadata.
4. Return the normalized result shape unchanged.

This keeps tests fast and lets the command contract stabilize before native packaging is introduced.

## Commands

| Contract id | Tauri command | Host effect | Payload | Result |
| --- | --- | --- | --- | --- |
| `workspace.open` | `workspace_open` | filesystem read, state transition | `WorkspaceOpenPayload` | `WorkspaceLayoutDescriptor` |
| `workspace.lock` | `workspace_lock` | state transition, filesystem write | `WorkspaceLockPayload` | `WorkspaceLockTransition` |
| `workspace.unlock` | `workspace_unlock` | state transition, filesystem write | `WorkspaceUnlockPayload` | `WorkspaceLockTransition` |
| `gateway.start` | `gateway_start` | process start | `GatewayStartPayload` | `GatewayStartRequest` |
| `workspace.plan_file_layout_migration` | `workspace_plan_file_layout_migration` | none | `WorkspaceLayoutMigrationInput` | `WorkspaceLayoutMigrationPlan` |

The metadata names are stable and intentionally separate the public contract id from the Tauri command string. Command payloads reject unsupported fields so adapters do not silently ignore caller mistakes.

## Workspace Paths

Workspace paths must be absolute local filesystem paths. The validator accepts Windows drive paths, UNC paths, and POSIX paths, then normalizes separators to `/` for stable command outputs. Paths with URI schemes, control characters, relative roots, `.` segments, or `..` segments are rejected.

The normalized `SafePathDescriptor` includes:

- `raw`: original caller input.
- `normalized`: stable path string for command results and sidecar arguments.
- `kind`: `windows-drive`, `unc`, or `posix`.
- `segments`: parsed path segments.

## File Layout

The current workspace layout version is `3`.

| Version | Entries |
| --- | --- |
| 1 | `.sovereignops`, `.sovereignops/workspace.json` |
| 2 | `.sovereignops/events`, `.sovereignops/objects`, `.sovereignops/index` |
| 3 | `.sovereignops/locks`, `.sovereignops/gateway.json`, `.sovereignops/migrations` |

`planWorkspaceFileLayoutMigration` returns ordered steps only. It never creates directories or files. The adapter is responsible for applying steps in ascending `order` and reporting host errors without reordering the plan.

## Lock State

Lock and unlock helpers return immutable transition records with the previous state and next state. A mismatched unlock token returns `unlock_rejected` and leaves state unchanged. Locking an already locked workspace returns `already_locked`; unlocking an already unlocked workspace returns `already_unlocked`.

## Gateway Start

`buildGatewayStartRequest` converts a validated gateway payload into a sidecar request for `mcp-gateway`. HTTP gateway starts are limited to `127.0.0.1` or `localhost`, with an explicit port and health check URL when a concrete port is provided. The adapter owns actual process creation and lifecycle management.

## Verification

Run the desktop contract tests directly:

```powershell
cd apps\desktop
npm.cmd test
```

The package can also run its baseline check once workspace wiring includes the desktop package:

```powershell
npm.cmd --workspace @sovereignops/desktop run check
```
