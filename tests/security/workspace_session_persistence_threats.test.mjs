import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { describe, it } from "node:test";
import path from "node:path";

import { ApiResponseValidationError } from "../../packages/sdk-js/src/client.ts";
import {
  planLocalWorkspaceSessionLockEvent,
  planLocalWorkspaceSessionOpenEvent,
} from "../../packages/sdk-js/src/localWorkspaceSession.ts";
import {
  InMemoryLocalWorkspaceSessionStore,
  createLocalWorkspaceSessionSnapshot,
  createLocalWorkspaceSessionStoreBundle,
  parseLocalWorkspaceSessionStoreBundle,
  serializeLocalWorkspaceSessionStoreBundle,
} from "../../packages/sdk-js/src/localWorkspaceSessionStore.ts";
import {
  createWorkspaceSessionAuditPreview,
  summarizeWorkspaceSessionApiInput,
} from "../../apps/api/src/workspaceSessionRoutes.ts";
import { LocalWorkspaceSessionApiClient } from "../../packages/sdk-js/src/localWorkspaceSessionApiClient.ts";
import { runWorkspaceSessionApiReplayCli } from "../../packages/cli/src/workspaceSessionApiReplay.ts";
import { buildWorkspaceSessionApiState } from "../../apps/web/src/workspaceSessionApiState.ts";

const timestamp = "2026-04-28T00:00:00.000Z";
const workspaceId = "wsp_persistence_alpha";
const deviceId = "dev_laptop_alpha";
const sessionId = "sess_persistence_alpha_001";
const lockToken = "lock_persistence_alpha_001";
const storagePath = "workspaces/wsp_persistence_alpha/session.json";
const rawLocalPath = "C:/Users/DELL/session/raw.json";
const rawSecret = "raw-local-secret-12345";
const rawBearer = `Bearer ${rawSecret}`;

describe("workspace session persistence threat controls", () => {
  it("sanitizes snapshot metadata and rejects unredacted lock refs before store persistence", () => {
    const events = sessionEvents();
    const snapshot = createLocalWorkspaceSessionSnapshot({
      descriptor: descriptor(),
      sessionId,
      events,
      metadata: {
        authorization: rawBearer,
        rawBody: `api_key=${rawSecret}`,
      },
      createdAt: timestamp,
      updatedAt: "2026-04-28T00:02:00.000Z",
    });

    assert.equal(snapshot.localOnly, true);
    assert.equal(snapshot.redaction.rawSecretsStored, false);
    assert.deepEqual(snapshot.redaction.redactedFields, [
      "metadata.authorization",
      "metadata.rawBody",
    ]);
    assertNoRawValues(snapshot, [rawSecret, rawBearer, lockToken]);

    const bundle = createLocalWorkspaceSessionStoreBundle({
      snapshot,
      events,
    });
    const serialized = serializeLocalWorkspaceSessionStoreBundle(bundle);
    const parsed = parseLocalWorkspaceSessionStoreBundle(serialized);
    const store = new InMemoryLocalWorkspaceSessionStore({
      snapshots: [snapshot],
      events,
    });

    assert.equal(parsed.localOnly, true);
    assert.equal(parsed.snapshot.eventCount, 2);
    assert.equal(store.getSnapshot(sessionId)?.eventCount, 2);
    assertNoRawValues(bundle, [rawSecret, rawBearer, lockToken]);
    assertNoRawValues(serialized, [rawSecret, rawBearer, lockToken]);
    assertNoRawValues(parsed, [rawSecret, rawBearer, lockToken]);
    assertNoRawValues(store.getSnapshot(sessionId), [rawSecret, rawBearer, lockToken]);

    const unsafeEvent = structuredClone(events[1]);
    unsafeEvent.payload.lock.lockTokenRef = lockToken;
    assert.throws(
      () =>
        createLocalWorkspaceSessionSnapshot({
          descriptor: descriptor(),
          sessionId,
          events: [unsafeEvent],
          createdAt: timestamp,
          updatedAt: "2026-04-28T00:02:00.000Z",
        }),
      /redacted/,
    );
  });

  it("keeps API persistence previews local-only, redacted, and body-free", () => {
    const summary = summarizeWorkspaceSessionApiInput({
      descriptor: descriptor(),
      sessionId,
      operations: ["open", "lock"],
    });

    assert.equal(summary.localOnly, true);
    assert.equal(summary.durableWrites, false);
    assert.equal(summary.storage.localOnly, true);
    assert.equal(summary.storage.storagePathRedacted, true);
    assert.match(summary.storage.storagePath, /^\[redacted:path:[a-z0-9]+\]$/);
    assertNoRawValues(summary, [storagePath, lockToken]);
    assertNoBodyRetentionKeys(summary);

    const preview = createWorkspaceSessionAuditPreview({
      descriptor: descriptor(),
      sessionId,
      actor: "sdk-worker-e",
      createdAt: "2026-04-28T00:05:00.000Z",
      events: [
        {
          operation: "open",
          sequence: 1,
          createdAt: "2026-04-28T00:01:00.000Z",
          reason: "manual open",
        },
        {
          operation: "lock",
          sequence: 2,
          createdAt: "2026-04-28T00:02:00.000Z",
          lockToken,
          reason: "idle timeout",
        },
      ],
    });

    assert.equal(preview.localOnly, true);
    assert.equal(preview.durableWrites, false);
    assert.equal(preview.audit.localOnly, true);
    assert.equal(preview.audit.redacted, true);
    assert.equal(preview.audit.recordCount, 2);
    assertNoRawValues(preview, [storagePath, lockToken]);
    assertNoBodyRetentionKeys(preview);

    for (const event of preview.events) {
      assert.equal(event.payload.localOnly, true);
      assert.equal(event.payload.storagePathRedacted, true);
      assert.match(event.payload.storagePath, /^\[redacted:path:[a-z0-9]+\]$/);
    }

    const lockRecord = preview.audit.records.find(
      (record) => record.action === "workspace.session.locked",
    );
    assert.ok(lockRecord);
    assert.deepEqual(lockRecord.details.redaction.fields, [
      "storagePath",
      "lockToken",
    ]);
    assert.match(lockRecord.details.lock.lockTokenRef, /^\[redacted:lockToken:[a-z0-9]+\]$/);
  });

  it("rejects SDK responses that try to persist unredacted storage or lock material", async () => {
    const unredactedSummaryClient = new LocalWorkspaceSessionApiClient({
      baseUrl: "http://127.0.0.1:48231/",
      fetch: jsonFetch({
        kind: "workspace-session.summary",
        schemaVersion: "workspace-session-api/v1",
        localOnly: true,
        durableWrites: false,
        workspaceId,
        deviceId,
        storage: {
          localOnly: true,
          storagePath,
          storagePathRedacted: true,
        },
        gateway: {
          transport: "stdio",
        },
        session: {
          sessionId,
          operations: ["open"],
        },
      }),
    });

    await assert.rejects(
      () => unredactedSummaryClient.getSummary({ descriptor: descriptor(), sessionId }),
      (error) => {
        assert.equal(error instanceof ApiResponseValidationError, true);
        assertHasIssue(error, "storage.storagePath", "storagePath must be redacted");
        return true;
      },
    );

    const unredactedAuditClient = new LocalWorkspaceSessionApiClient({
      baseUrl: "http://127.0.0.1:48231/",
      fetch: jsonFetch({
        kind: "workspace-session.audit-preview",
        schemaVersion: "workspace-session-api/v1",
        localOnly: true,
        durableWrites: false,
        summary: redactedSummary(),
        events: [
          {
            eventId: "evt_wsp_persistence_alpha_lock_00000001",
            workspaceId,
            type: "workspace.session.locked",
            payload: {
              kind: "localWorkspaceSession",
              schemaVersion: "local-workspace-session/v1",
              operation: "lock",
              sessionId,
              localOnly: true,
              storagePath: "[redacted:path:abc123]",
              storagePathRedacted: true,
              storagePathDisplay: "session.json [path:abc123]",
              gateway: {
                transport: "stdio",
              },
              lock: {
                lockTokenRef: lockToken,
              },
            },
            cursor: "1",
            sequence: 1,
            deviceId,
            createdAt: timestamp,
          },
        ],
        audit: {
          kind: "workspace-session.audit-preview.records",
          localOnly: true,
          redacted: true,
          recordCount: 0,
          records: [],
        },
      }),
    });

    await assert.rejects(
      () =>
        unredactedAuditClient.previewAudit({
          descriptor: descriptor(),
          sessionId,
          events: [
            {
              operation: "lock",
              sequence: 1,
              createdAt: timestamp,
              lockToken,
            },
          ],
        }),
      (error) => {
        assert.equal(error instanceof ApiResponseValidationError, true);
        assertHasIssue(
          error,
          "events.0.payload.lock.lockTokenRef",
          "lockTokenRef must be redacted",
        );
        return true;
      },
    );
  });

  it("redacts secret-shaped request and response bodies in CLI replay output", async () => {
    const tempRoot = await mkdtemp(path.join(process.cwd(), "tests/.tmp-workspace-session-persistence-"));
    const fixturePath = path.join(tempRoot, "api-requests.json");

    try {
      await writeFile(
        fixturePath,
        JSON.stringify({
          schemaVersion: "workspace-session-api-requests/v1",
          generatedAt: timestamp,
          requests: [
            {
              id: "workspace_session_summary_secret_body",
              route: {
                method: "POST",
                path: "/v1/workspace-session/summary",
              },
              request: {
                headers: {
                  authorization: rawBearer,
                },
                body: {
                  localOnly: true,
                  workspace: {
                    id: workspaceId,
                    open: true,
                  },
                  session: {
                    id: sessionId,
                    sessionToken: rawSecret,
                  },
                  message: `Read failed at ${rawLocalPath} with api_key=${rawSecret}`,
                },
              },
              response: {
                status: 200,
                checks: {
                  kind: "workspace-session.summary",
                },
              },
            },
          ],
        }),
        "utf8",
      );

      const result = await runWorkspaceSessionApiReplayCli(
        [
          "workspace-session-api",
          "replay",
          "--fixture",
          path.relative(process.cwd(), fixturePath),
        ],
        { cwd: process.cwd() },
      );

      assert.ok(result);
      assert.equal(result.exitCode, 0);
      assert.equal(result.stderr, "");
      assert.match(result.stdout, /\[REDACTED\]/);
      assert.match(result.stdout, /\[redacted-path\]/);
      assertNoRawValues(result.stdout, [rawLocalPath, rawSecret, rawBearer]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("does not expose raw body secrets when Web state summarizes replay failures", () => {
    const state = buildWorkspaceSessionApiState({
      generatedAt: timestamp,
      requests: [
        {
          id: "workspace_session_audit_preview_failure",
          route: {
            method: "POST",
            path: "/v1/workspace-session/audit-preview",
          },
          request: {
            body: {
              localOnly: true,
              storagePath: rawLocalPath,
              sessionToken: rawSecret,
            },
          },
          actual: {
            status: 200,
            body: {
              error: {
                code: "validation_failed",
                message: `Could not persist ${rawLocalPath}; token=${rawSecret}`,
              },
            },
          },
        },
      ],
    });

    assert.equal(state.phase, "error");
    assert.equal(state.localOnly, true);
    assert.equal(state.errorStates.length, 1);
    assert.match(state.errorStates[0].errorState.description, /\[redacted-path\]/);
    assert.match(state.errorStates[0].errorState.description, /\[redacted-secret\]/);
    assertNoRawValues(state, [rawLocalPath, rawSecret]);
  });
});

function descriptor() {
  return {
    workspaceId,
    deviceId,
    rootKeyRef: "key_persistence_alpha",
    createdAt: timestamp,
    updatedAt: timestamp,
    storagePath,
    gateway: {
      transport: "stdio",
    },
  };
}

function redactedSummary() {
  return {
    kind: "workspace-session.summary",
    schemaVersion: "workspace-session-api/v1",
    localOnly: true,
    durableWrites: false,
    workspaceId,
    deviceId,
    storage: {
      localOnly: true,
      storagePath: "[redacted:path:abc123]",
      storagePathRedacted: true,
    },
    gateway: {
      transport: "stdio",
    },
    session: {
      sessionId,
      operations: ["lock"],
    },
  };
}

function sessionEvents() {
  return [
    planLocalWorkspaceSessionOpenEvent({
      descriptor: descriptor(),
      sessionId,
      sequence: 1,
      createdAt: "2026-04-28T00:01:00.000Z",
      reason: "restore local snapshot",
    }),
    planLocalWorkspaceSessionLockEvent({
      descriptor: descriptor(),
      sessionId,
      sequence: 2,
      createdAt: "2026-04-28T00:02:00.000Z",
      lockToken,
      reason: "snapshot sealed",
    }),
  ];
}

function jsonFetch(body) {
  return async () => ({
    ok: true,
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
    text: async () => JSON.stringify(body),
  });
}

function assertHasIssue(error, pathValue, message) {
  assert.ok(
    error.issues.some(
      (issue) => issue.path === pathValue && issue.message === message,
    ),
    `expected issue ${pathValue}: ${message}`,
  );
}

function assertNoRawValues(value, rawValues) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  for (const raw of rawValues) {
    assert.equal(serialized.includes(raw), false, `leaked raw value: ${raw}`);
    assert.equal(
      serialized.includes(raw.replaceAll("\\", "\\\\")),
      false,
      `leaked escaped value: ${raw}`,
    );
  }
}

function assertNoBodyRetentionKeys(value) {
  const forbiddenKeys = new Set(["rawBody", "requestBody", "bodySnapshot"]);
  const stack = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === null || typeof current !== "object") {
      continue;
    }
    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }
    for (const [key, nested] of Object.entries(current)) {
      assert.equal(forbiddenKeys.has(key), false, `retained body key: ${key}`);
      stack.push(nested);
    }
  }
}
