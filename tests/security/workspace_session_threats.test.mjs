import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_PATH_DENY_PATTERNS,
  PATH_SECURITY_ISSUE_CODES,
  joinWorkspaceRoot,
  redactPathForDisplay,
  validateLocalRelativePath,
} from "../../packages/path-security/src/index.ts";
import {
  STORAGE_ERROR_CODES,
  StorageAdapterError,
  planJsonStorageWrites,
  validateJsonStorageRelativePath,
} from "../../packages/sdk-js/src/storage.ts";
import {
  createInMemoryWorkspaceClient,
} from "../../packages/sdk-js/src/workspace.ts";
import {
  buildGatewayStartRequest,
  validateGatewayStartPayload,
} from "../../apps/desktop/src/commands.ts";
import {
  createInMemoryLocalStore,
} from "../../apps/web/src/localStore.ts";
import {
  createAuditEmitter,
} from "../../services/mcp-gateway/src/audit.ts";
import {
  PolicyDeniedError,
  createPolicyMiddleware,
  createStaticPolicy,
} from "../../services/mcp-gateway/src/policy.ts";
import {
  createToolAuditEmitter,
  redactSensitiveArguments,
} from "../../services/mcp-gateway/src/auditEmitter.ts";

const fixedNow = () => "2026-04-27T00:00:00.000Z";

const PRIVATE_PLAN_PACK_DENY_PATTERNS = Object.freeze([
  ...DEFAULT_PATH_DENY_PATTERNS,
  Object.freeze({
    id: "private_plan_pack",
    message: "private plan-pack paths are not allowed",
    segmentNames: Object.freeze([".codex-private"]),
    pathPatterns: Object.freeze([
      /(?:^|\/)\.codex-private(?:\/|$)/i,
      /(?:^|\/)private-plan-pack(?:\/|$)/i,
    ]),
  }),
]);

const threatFixture = Object.freeze({
  workspaceRoot: "E:\\SovereignOps\\workspaces\\Alpha",
  workspaceId: "wsp_alpha",
  otherWorkspaceId: "wsp_beta",
  deviceId: "dev_laptop",
  timestamp: "2026-04-27T00:00:00.000Z",
  safeRecordPath: "sessions/active/state.json",
  traversalPaths: Object.freeze([
    "../sessions/escape.json",
    "sessions/../../escape.json",
    "C:\\Users\\Public\\escape.json",
    "\\\\server\\share\\escape.json",
    "~/escape.json",
  ]),
  privatePlanPackPath: ".codex-private/private-plan-pack/session-notes.json",
  remoteGatewayHosts: Object.freeze([
    "0.0.0.0",
    "192.168.1.10",
    "gateway.example.invalid",
  ]),
});

describe("workspace/session isolation threat fixture", () => {
  it("rejects traversal vectors and private plan-pack paths before joining workspace roots", () => {
    const safeJoin = joinWorkspaceRoot(
      threatFixture.workspaceRoot,
      threatFixture.safeRecordPath,
      {
        platform: "windows",
        denyPatterns: PRIVATE_PLAN_PACK_DENY_PATTERNS,
      },
    );

    assert.equal(safeJoin.ok, true);
    assert.equal(safeJoin.value.workspaceRoot, "E:\\SovereignOps\\workspaces\\Alpha");
    assert.equal(safeJoin.value.relativePath, "sessions/active/state.json");
    assert.equal(
      safeJoin.value.absolutePath,
      "E:\\SovereignOps\\workspaces\\Alpha\\sessions\\active\\state.json",
    );

    for (const path of threatFixture.traversalPaths) {
      const result = joinWorkspaceRoot(threatFixture.workspaceRoot, path, {
        platform: "windows",
        denyPatterns: PRIVATE_PLAN_PACK_DENY_PATTERNS,
      });

      assert.equal(result.ok, false, `${path} should be rejected`);
      assert.ok(
        result.issues.some((issue) =>
          [
            PATH_SECURITY_ISSUE_CODES.ABSOLUTE_PATH,
            PATH_SECURITY_ISSUE_CODES.DRIVE_PATH,
            PATH_SECURITY_ISSUE_CODES.HOME_PATH,
            PATH_SECURITY_ISSUE_CODES.TRAVERSAL,
            PATH_SECURITY_ISSUE_CODES.UNC_PATH,
            PATH_SECURITY_ISSUE_CODES.UNSAFE_CHARACTER,
          ].includes(issue.code),
        ),
        `${path} should report a boundary issue`,
      );
    }

    const privatePlanPack = validateLocalRelativePath(
      threatFixture.privatePlanPackPath,
      {
        denyPatterns: PRIVATE_PLAN_PACK_DENY_PATTERNS,
      },
    );
    assert.equal(privatePlanPack.ok, false);
    assert.deepEqual(
      privatePlanPack.issues.map((issue) => [issue.code, issue.patternId]),
      [[PATH_SECURITY_ISSUE_CODES.DENY_PATTERN, "private_plan_pack"]],
    );

    assert.throws(
      () => validateJsonStorageRelativePath("../sessions/escape.json"),
      (error) => {
        assert.equal(error instanceof StorageAdapterError, true);
        assert.equal(error.code, STORAGE_ERROR_CODES.INVALID_PATH);
        return true;
      },
    );
  });

  it("redacts private plan-pack displays without leaking local path segments", () => {
    const display = redactPathForDisplay(
      "E:\\SovereignOps\\.codex-private\\private-plan-pack\\session-notes.json",
      {
        platform: "windows",
        denyPatterns: PRIVATE_PLAN_PACK_DENY_PATTERNS,
      },
    );

    assert.match(display, /^\[restricted-path path:[0-9a-f]{12}\]$/);
    assert.equal(display.includes(".codex-private"), false);
    assert.equal(display.includes("private-plan-pack"), false);
    assert.equal(display.includes("session-notes"), false);
  });

  it("rejects remote gateway hosts at the desktop command boundary", () => {
    for (const host of threatFixture.remoteGatewayHosts) {
      const rejected = validateGatewayStartPayload({
        workspaceId: threatFixture.workspaceId,
        workspacePath: threatFixture.workspaceRoot,
        transport: "http",
        host,
        port: 48231,
        logLevel: "info",
      });

      assert.equal(rejected.ok, false, `${host} should be rejected`);
      assert.ok(rejected.issues.some((issue) => issue.path === "host"));
    }

    const accepted = buildGatewayStartRequest({
      workspaceId: threatFixture.workspaceId,
      workspacePath: threatFixture.workspaceRoot,
      transport: "http",
      host: "127.0.0.1",
      port: 48231,
      logLevel: "debug",
      requestedAt: threatFixture.timestamp,
    });

    assert.equal(accepted.ok, true);
    assert.equal(accepted.value.healthCheck.url, "http://127.0.0.1:48231/health");
    assert.deepEqual(
      accepted.value.arguments.slice(-4),
      ["--host", "127.0.0.1", "--port", "48231"],
    );
    assert.equal(JSON.stringify(accepted.value).includes("0.0.0.0"), false);
    assert.equal(JSON.stringify(accepted.value).includes("192.168.1.10"), false);
  });

  it("prevents denied gateway operations from touching local session state", async () => {
    const audit = createAuditEmitter({ now: fixedNow, idPrefix: "iso_audit_" });
    const store = createInMemoryLocalStore();
    const middleware = createPolicyMiddleware(
      createStaticPolicy(
        [
          {
            id: "deny-session-write",
            path: `workspace://${threatFixture.workspaceId}/sessions`,
            capability: "write_object",
            decision: "deny",
            match: "prefix",
            reason: "session writes require an approved local boundary",
          },
        ],
        "deny",
      ),
      audit,
    );
    let attemptedWrites = 0;

    await assert.rejects(
      () =>
        middleware(
          {
            path: `workspace://${threatFixture.workspaceId}/sessions/active`,
            capability: "write_object",
            actor: { id: "usr_local_operator" },
            metadata: { operation: "session.update" },
          },
          async () => {
            attemptedWrites += 1;
            await store.put({
              workspaceId: threatFixture.workspaceId,
              collection: "records",
              id: "session-active",
              value: { status: "written" },
            });
            return { ok: true };
          },
        ),
      PolicyDeniedError,
    );

    assert.equal(attemptedWrites, 0);
    assert.deepEqual(
      await store.list({
        workspaceId: threatFixture.workspaceId,
        collection: "records",
      }),
      [],
    );
    assert.deepEqual(
      audit.entries().map((entry) => [entry.type, entry.path, entry.decision]),
      [
        [
          "policy_decision",
          `workspace://${threatFixture.workspaceId}/sessions/active`,
          "deny",
        ],
      ],
    );
  });

  it("keeps workspace and browser-local session state scoped by workspace", async () => {
    const client = createInMemoryWorkspaceClient();
    assert.equal(client.createWorkspace(workspaceDescriptor(threatFixture.workspaceId)).ok, true);
    assert.equal(
      client.createWorkspace(workspaceDescriptor(threatFixture.otherWorkspaceId)).ok,
      true,
    );

    assert.equal(
      client.appendEvent(threatFixture.workspaceId, {
        type: "session.note",
        payload: { recordId: "shared", body: "alpha session" },
        createdAt: "2026-04-27T00:00:01.000Z",
      }).ok,
      true,
    );
    assert.equal(
      client.appendEvent(threatFixture.otherWorkspaceId, {
        type: "session.note",
        payload: { recordId: "shared", body: "beta session" },
        createdAt: "2026-04-27T00:00:02.000Z",
      }).ok,
      true,
    );

    const alphaSnapshot = client.snapshot(threatFixture.workspaceId);
    const betaSnapshot = client.snapshot(threatFixture.otherWorkspaceId);
    assert.equal(alphaSnapshot.ok, true);
    assert.equal(betaSnapshot.ok, true);
    assert.deepEqual(
      alphaSnapshot.value.events.map((event) => event.payload.body),
      ["alpha session"],
    );
    assert.deepEqual(
      betaSnapshot.value.events.map((event) => event.payload.body),
      ["beta session"],
    );

    const localStore = createInMemoryLocalStore();
    await localStore.put({
      workspaceId: threatFixture.workspaceId,
      collection: "records",
      id: "shared",
      value: { body: "alpha local record", tags: ["alpha"] },
    });
    await localStore.put({
      workspaceId: threatFixture.otherWorkspaceId,
      collection: "records",
      id: "shared",
      value: { body: "beta local record", tags: ["beta"] },
    });

    const alphaRecord = await localStore.get({
      workspaceId: threatFixture.workspaceId,
      collection: "records",
      id: "shared",
    });
    assert.equal(alphaRecord.value.body, "alpha local record");
    alphaRecord.value.body = "tampered";
    alphaRecord.value.tags.push("tampered");

    assert.equal(
      (
        await localStore.get({
          workspaceId: threatFixture.workspaceId,
          collection: "records",
          id: "shared",
        })
      ).value.body,
      "alpha local record",
    );
    assert.equal(
      (
        await localStore.get({
          workspaceId: threatFixture.otherWorkspaceId,
          collection: "records",
          id: "shared",
        })
      ).value.body,
      "beta local record",
    );
  });

  it("redacts secret-shaped values from audit arguments and cloned snapshots", () => {
    const sensitiveArguments = {
      apiKey: "placeholder-value",
      nested: {
        sessionToken: "placeholder-value",
        note: "credential=placeholder-value",
      },
      list: ["safe text", "authorization=placeholder-value"],
    };

    const redacted = redactSensitiveArguments(sensitiveArguments);
    assert.equal(redacted.apiKey, "[REDACTED]");
    assert.equal(redacted.nested.sessionToken, "[REDACTED]");
    assert.equal(redacted.nested.note, "[REDACTED]");
    assert.equal(redacted.list[1], "[REDACTED]");
    assert.equal(JSON.stringify(redacted).includes("placeholder-value"), false);

    const audit = createToolAuditEmitter({ now: fixedNow, idPrefix: "iso_tool_" });
    const emitted = audit.emit({
      type: "tool_call_requested",
      toolName: "draft_document_patch",
      arguments: sensitiveArguments,
      actorId: "usr_local_operator",
    });
    emitted.arguments.list.push("mutated return value");

    const entries = audit.entries();
    assert.equal(entries[0].arguments.apiKey, "[REDACTED]");
    assert.deepEqual(entries[0].arguments.list, ["safe text", "[REDACTED]"]);
    assert.equal(JSON.stringify(entries).includes("placeholder-value"), false);
  });

  it("returns immutable SDK workspace and storage planning snapshots", () => {
    const client = createInMemoryWorkspaceClient();
    assert.equal(client.createWorkspace(workspaceDescriptor(threatFixture.workspaceId)).ok, true);
    assert.equal(
      client.appendEvent(threatFixture.workspaceId, {
        type: "session.snapshot",
        payload: { nested: { count: 1 }, tags: ["original"] },
        createdAt: "2026-04-27T00:00:03.000Z",
      }).ok,
      true,
    );

    const snapshot = client.snapshot(threatFixture.workspaceId);
    assert.equal(snapshot.ok, true);
    assert.equal(Object.isFrozen(snapshot.value), true);
    assert.equal(Object.isFrozen(snapshot.value.events), true);
    assert.equal(Object.isFrozen(snapshot.value.events[0].payload.nested), true);
    assert.throws(
      () => {
        snapshot.value.events[0].payload.nested.count = 2;
      },
      TypeError,
    );

    const storagePlan = planJsonStorageWrites([
      {
        path: "sessions/beta.json",
        kind: "workspaceEvents",
        records: [{ workspaceId: threatFixture.otherWorkspaceId, sequence: 1 }],
      },
      {
        path: "sessions/alpha.json",
        kind: "workspaceEvents",
        records: [{ workspaceId: threatFixture.workspaceId, sequence: 1 }],
      },
    ]);

    assert.equal(Object.isFrozen(storagePlan), true);
    assert.equal(Object.isFrozen(storagePlan[0]), true);
    assert.equal(Object.isFrozen(storagePlan[0].envelope.records), true);
    assert.deepEqual(
      storagePlan.map((entry) => entry.path),
      ["sessions/alpha.json", "sessions/beta.json"],
    );
    assert.throws(
      () => {
        storagePlan[0].envelope.records.push({ workspaceId: "wsp_mutated" });
      },
      TypeError,
    );
  });
});

function workspaceDescriptor(workspaceId) {
  return {
    workspaceId,
    deviceId: threatFixture.deviceId,
    rootKeyRef: `key_${workspaceId.slice("wsp_".length)}`,
    createdAt: threatFixture.timestamp,
    updatedAt: threatFixture.timestamp,
  };
}
