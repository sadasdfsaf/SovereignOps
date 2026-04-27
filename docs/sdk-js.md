# JavaScript SDK

The JavaScript SDK is the local-first client surface for workspace utilities,
API preview clients, and pure helpers. It is exported from
`packages/sdk-js/src/index.ts`; focused behavior lives in small modules so tests
can inject local data and fake fetch implementations without a live service.

## Local-First Usage

Use local identifiers, local URLs, and repository fixtures in examples. Do not
put machine paths, raw request bodies, or credential material into SDK samples.

```ts
import {
  WorkspaceClient,
  planLocalWorkspaceSessionSnapshotRetentionCleanup,
} from "@sovereignops/sdk-js";

const workspace = new WorkspaceClient({
  workspaceId: "wsp_notes_lab",
  endpoint: "local://workspace/wsp_notes_lab",
});

const plan = planLocalWorkspaceSessionSnapshotRetentionCleanup({
  records: [
    {
      snapshotId: "snap_notes_current",
      workspaceId: "wsp_notes_lab",
      deviceId: "dev_laptop_alpha",
      sessionId: "sess_notes_lab",
      label: "notes-current",
      createdAt: "2026-04-28T03:50:00.000Z",
      updatedAt: "2026-04-28T03:55:00.000Z",
      fingerprint:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      eventCount: 12,
    },
  ],
  maxCount: 2,
  now: "2026-04-28T04:00:00.000Z",
});

console.log(workspace.describe(), plan.dryRun);
```

## Public Entry Points

- SDK exports: `packages/sdk-js/src/index.ts`
- Shared client types and typed errors: `packages/sdk-js/src/client.ts`
- Workspace session retention cleanup API client:
  `packages/sdk-js/src/localWorkspaceSessionSnapshotRetentionCleanupApiClient.ts`
- Workspace session retention cleanup inventory API client:
  `packages/sdk-js/src/localWorkspaceSessionSnapshotRetentionCleanupInventoryApiClient.ts`
- Workspace session retention cleanup pure helpers:
  `packages/sdk-js/src/localWorkspaceSessionSnapshotRetention.ts`
- Retention cleanup API fixture:
  `examples/workspace-session/snapshot-retention-cleanup-api-requests.json`
- Retention cleanup inventory fixture:
  `examples/workspace-session/snapshot-retention-cleanup-inventory.json`
- Retention cleanup inventory API fixture:
  `examples/workspace-session/snapshot-retention-cleanup-inventory-api-requests.json`
- Retention cleanup dry-run guide:
  `docs/workspace-session-snapshot-retention-cleanup.md`
- Focused API client test:
  `packages/sdk-js/tests/local-workspace-session-snapshot-retention-cleanup-api-client.test.mjs`
- Focused inventory API client test:
  `packages/sdk-js/tests/local-workspace-session-snapshot-retention-cleanup-inventory-api-client.test.mjs`
- Focused pure helper test:
  `packages/sdk-js/tests/local-workspace-session-snapshot-retention.test.mjs`
- API client boundary test:
  `tests/security/workspace_session_snapshot_retention_cleanup_api_client_threats.test.mjs`
- Request schema fixtures:
  `packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-request.valid.json`,
  `packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-request.invalid.json`,
  and
  `packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-request.schema.json`
- Response schema fixtures:
  `packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-response.valid.json`,
  `packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-response.invalid.json`,
  and
  `packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-response.schema.json`
- Inventory request schema fixtures:
  `packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-inventory-request.valid.json`,
  `packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-inventory-request.invalid.json`,
  and
  `packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-inventory-request.schema.json`

## Workspace Session Snapshot Retention Cleanup API Preview

Use `createLocalWorkspaceSessionSnapshotRetentionCleanupApiClient` when
exercising the preview route through an injected fetch implementation. The
client posts to
`POST /v1/workspace-session/snapshot-retention-cleanup/preview` and validates
the same dry-run response shape as
`LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_SCHEMA_VERSION`.

```ts
import {
  ApiRequestValidationError,
  createLocalWorkspaceSessionSnapshotRetentionCleanupApiClient,
  previewLocalWorkspaceSessionSnapshotRetentionCleanupViaApi,
} from "@sovereignops/sdk-js";

const client = createLocalWorkspaceSessionSnapshotRetentionCleanupApiClient({
  baseUrl: "local://api/v1",
  apiKey: "[REDACTED]",
  headers: {
    "x-local-client": "retention-cleanup-docs",
  },
  fetch: fakeFetch([
    jsonResponse(200, {
      kind: "localWorkspaceSessionSnapshotRetentionCleanupPlan",
      schemaVersion: "local-workspace-session-snapshot-retention/v1",
      localOnly: true,
      dryRun: true,
      durableWrites: false,
      thresholds: {
        maxCount: 2,
        now: "2026-04-28T04:00:00.000Z",
      },
      entryCount: 1,
      keepCount: 1,
      deleteCount: 0,
      reviewCount: 0,
      actions: [
        {
          kind: "localWorkspaceSessionSnapshotRetentionCleanupAction",
          action: "keep",
          reasons: ["within-max-count"],
          sourceIndex: 0,
          rank: 1,
          summary: {
            kind: "localWorkspaceSessionSnapshotRetentionCleanupSummary",
            sourceKind: "snapshot-record-summary",
            auditSafe: true,
            redacted: true,
            snapshotId: "snap_notes_current",
            workspaceId: "wsp_notes_lab",
            deviceId: "dev_laptop_alpha",
            sessionId: "sess_notes_lab",
            createdAt: "2026-04-28T03:50:00.000Z",
            updatedAt: "2026-04-28T03:55:00.000Z",
            fingerprint:
              "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            operationCount: 12,
          },
          issues: [],
        },
      ],
      keepActions: [],
      deleteActions: [],
      reviewActions: [],
    }),
  ]),
});

try {
  const preview = await client.preview({
    records: [
      {
        snapshotId: "snap_notes_current",
        workspaceId: "wsp_notes_lab",
        deviceId: "dev_laptop_alpha",
        sessionId: "sess_notes_lab",
        label: "notes-current",
        createdAt: "2026-04-28T03:50:00.000Z",
        updatedAt: "2026-04-28T03:55:00.000Z",
        fingerprint:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        eventCount: 12,
      },
    ],
    maxCount: 2,
    now: "2026-04-28T04:00:00.000Z",
  });

  console.log(preview.kind, preview.localOnly, preview.durableWrites);
} catch (error) {
  if (error instanceof ApiRequestValidationError) {
    console.log(error.issues.map((issue) => issue.path));
  }
  throw error;
}

await previewLocalWorkspaceSessionSnapshotRetentionCleanupViaApi(
  {
    baseUrl: "local://api/v1",
    apiKey: "[REDACTED]",
    fetch: fakeFetch([jsonResponse(200, clientPreviewResponse)]),
  },
  {
    records: [
      {
        snapshotId: "snap_notes_previous",
        workspaceId: "wsp_notes_lab",
        createdAt: "2026-04-28T03:00:00.000Z",
      },
    ],
    maxCount: 1,
  },
);
```

The client normalizer `normalizeLocalWorkspaceSessionSnapshotRetentionCleanupPreviewRequest`
accepts exactly one of `entries`, `files`, or `records`; rejects circular values,
unknown top-level fields, non-finite numbers, raw local paths, raw lock tokens,
and credential-shaped strings; then returns a frozen JSON-compatible clone.

## Workspace Session Snapshot Retention Cleanup Inventory API Preview

Use `createLocalWorkspaceSessionSnapshotRetentionCleanupInventoryApiClient` for
the Round 46 inventory route. The client posts to
`POST /v1/workspace-session/snapshot-retention-cleanup/inventory/preview`,
normalizes
`WorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest`, and validates
the same local dry-run cleanup plan response as the parent cleanup preview.

```ts
import {
  createLocalWorkspaceSessionSnapshotRetentionCleanupInventoryApiClient,
  previewLocalWorkspaceSessionSnapshotRetentionCleanupInventoryViaApi,
} from "@sovereignops/sdk-js";

const inventoryClient =
  createLocalWorkspaceSessionSnapshotRetentionCleanupInventoryApiClient({
    baseUrl: "local://api/v1",
    apiKey: "[REDACTED]",
    fetch: fakeFetch([jsonResponse(200, inventoryPreviewResponse)]),
  });

const inventoryPreview = await inventoryClient.preview({
  inventory: [
    {
      path: "snapshots/snap-current.json",
      snapshotId: "snap_notes_current",
      workspaceId: "wsp_notes_lab",
      deviceId: "dev_laptop_alpha",
      createdAt: "2026-04-28T03:50:00.000Z",
      updatedAt: "2026-04-28T03:55:00.000Z",
      fingerprint:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      eventCount: 12,
    },
  ],
  policy: {
    maxCount: 2,
    now: "2026-04-28T04:00:00.000Z",
  },
});

console.log(inventoryPreview.localOnly, inventoryPreview.durableWrites);

await previewLocalWorkspaceSessionSnapshotRetentionCleanupInventoryViaApi(
  {
    baseUrl: "local://api/v1",
    apiKey: "[REDACTED]",
    fetch: fakeFetch([jsonResponse(200, inventoryPreviewResponse)]),
  },
  {
    files: [
      {
        path: "snapshots/snap-previous.json",
        snapshotId: "snap_notes_previous",
        workspaceId: "wsp_notes_lab",
        createdAt: "2026-04-28T03:00:00.000Z",
      },
    ],
  },
);
```

The inventory normalizer
`normalizeLocalWorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest`
accepts bounded `inventory`, `entries`, `files`, or `records` arrays plus
bounded policy fields. It rejects unknown fields, raw local paths, traversal,
raw lock material, credential-shaped values, request-body retention flags, and
durable-write or delete intent before fetch is called.

## Fake-Fetch Testing

API clients accept a `FetchLike`, so unit tests can keep all traffic in memory.
The fake fetch should record the URL and init object, return local JSON
responses, and throw queued errors for network-failure coverage.

```ts
function fakeFetch(items) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    const next = items.shift();
    if (next instanceof Error) {
      throw next;
    }
    if (next === undefined) {
      throw new Error("fake fetch response queue is empty");
    }
    return next;
  };
  fetch.calls = calls;
  return fetch;
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Bad Request",
    headers: {
      get(name) {
        return name.toLowerCase() === "content-type"
          ? "application/json"
          : null;
      },
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}
```

Expected test assertions:

- `fetch.calls[0].url` is
  `local://api/v1/workspace-session/snapshot-retention-cleanup/preview`.
- `fetch.calls[0].init.method` is `POST`.
- `fetch.calls[0].init.headers.authorization` is `Bearer [REDACTED]`.
- `JSON.parse(fetch.calls[0].init.body)` contains the sanitized request.
- The returned preview object and nested arrays are frozen.

## Typed Errors

`packages/sdk-js/src/client.ts` provides typed failures that callers can handle
without string matching:

- `ApiRequestValidationError`: invalid client options or invalid request body
  before fetch is called.
- `ApiNetworkError`: injected fetch throws before a response is returned.
- `ApiHttpError`: the response has a non-2xx status and a JSON error envelope.
- `ApiResponseParseError`: the response cannot be parsed as JSON.
- `ApiResponseValidationError`: JSON parses, but the response does not match the
  expected route shape.
- `toApiResult`: wraps a promise as `{ ok: true, value }` or
  `{ ok: false, error }`.

The pure retention helper raises `LocalWorkspaceSessionSnapshotRetentionError`
with `LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_ERROR_CODES` for invalid input
and invalid retention limits.

## Pure Helper Usage

Use the pure helpers when the caller already has local snapshot summaries or
file metadata and does not need an API adapter:

```ts
import {
  planFileBackedLocalWorkspaceSessionSnapshotRetentionCleanup,
  planSnapshotRetentionCleanupDryRun,
} from "@sovereignops/sdk-js";

const fileBackedPlan =
  planFileBackedLocalWorkspaceSessionSnapshotRetentionCleanup({
    files: [
      {
        path: "snapshots/snap-current.json",
        snapshotId: "snap_notes_current",
        workspaceId: "wsp_notes_lab",
        createdAt: "2026-04-28T03:50:00.000Z",
      },
      {
        path: "snapshots/snap-stale.json",
        snapshotId: "snap_notes_stale",
        workspaceId: "wsp_notes_lab",
        createdAt: "2026-04-26T02:00:00.000Z",
      },
    ],
    maxCount: 1,
    maxAgeMs: 86_400_000,
    now: "2026-04-28T04:00:00.000Z",
  });

const aliasPlan = planSnapshotRetentionCleanupDryRun({
  records: [
    {
      snapshotId: "snap_notes_current",
      workspaceId: "wsp_notes_lab",
      createdAt: "2026-04-28T03:50:00.000Z",
    },
  ],
});

console.log(fileBackedPlan.deleteCount, aliasPlan.keepCount);
```

Every retention cleanup plan must keep `localOnly: true`, `dryRun: true`, and
`durableWrites: false`. A `delete` action is an advisory preview label only; it
does not remove or mutate snapshots.

## Safe Example Values

Use these values when adding SDK docs or tests:

| Field | Safe value |
| --- | --- |
| Base URL | `local://api/v1` |
| Workspace ID | `wsp_notes_lab` |
| Device ID | `dev_laptop_alpha` |
| Session ID | `sess_notes_lab` |
| Snapshot ID | `snap_notes_current` |
| Relative path | `snapshots/snap-current.json` |
| API token placeholder | `[REDACTED]` |
| Fingerprint | `sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` |

Avoid absolute paths, home-directory shortcuts, hostnames outside localhost,
private workspace names, raw lock material, and credential-shaped strings.

## Validation Commands

Run focused docs and SDK checks from the repository root:

```powershell
python -m unittest tests.test_sdk_js_docs
node packages\sdk-js\tests\local-workspace-session-snapshot-retention-cleanup-api-client.test.mjs
node packages\sdk-js\tests\local-workspace-session-snapshot-retention-cleanup-inventory-api-client.test.mjs
node packages\sdk-js\tests\local-workspace-session-snapshot-retention.test.mjs
npm.cmd --workspace @sovereignops/sdk-js run check
python scripts\public_boundary_guard.py --json
```
