import assert from "node:assert/strict";
import test from "node:test";

import {
  createBackupManifest,
  createBackupPayloadDescriptor,
  validateBackupManifest,
} from "../src/index.ts";

const createdAt = "2026-04-27T00:00:00.000Z";

test("normalizes safe backup payload paths through shared path security", () => {
  const payload = createBackupPayloadDescriptor({
    id: "pay_workspace_snapshot",
    kind: "workspace_state",
    path: "./records//snapshots\\workspace.json.enc",
    plaintextByteSize: 512,
    createdAt,
    encryptionKeyId: "key_workspace_backup",
  });

  assert.equal(payload.path, "records/snapshots/workspace.json.enc");

  const manifest = createBackupManifest({
    backupId: "bkp_path_security",
    workspaceId: "wsp_main",
    createdAt,
    createdByActorId: "act_owner",
    encryptionKeyId: "key_workspace_backup",
    payloads: [payload],
  });
  const validation = validateBackupManifest(manifest);

  assert.equal(validation.ok, true);
  assert.deepEqual(validation.issues, []);
  assert.equal(validation.value.payloads[0].path, "records/snapshots/workspace.json.enc");
});

test("reports deterministic and useful issues for denied backup payload paths", () => {
  for (const { path, codes, patternId } of deniedPathCases()) {
    const first = validateBackupManifest(manifestWithPayloadPath(path));
    const second = validateBackupManifest(manifestWithPayloadPath(path));

    assert.equal(first.ok, false, path);
    assert.deepEqual(first.issues, second.issues, path);

    for (const code of codes) {
      assert.ok(
        first.issues.some((issue) => issue.path.startsWith("$.payloads[0].path") && issue.message.includes(code)),
        `${path} should report ${code}`,
      );
    }

    if (patternId !== undefined) {
      assert.ok(
        first.issues.some((issue) => issue.message.includes(`(${patternId})`)),
        `${path} should report ${patternId}`,
      );
    }
  }
});

test("rejects unsafe paths when creating payload descriptors", () => {
  assert.throws(
    () => createBackupPayloadDescriptor({
      id: "pay_workspace_snapshot",
      kind: "workspace_state",
      path: "cache/workspace.json.enc",
      plaintextByteSize: 512,
      createdAt,
      encryptionKeyId: "key_workspace_backup",
    }),
    { name: "PathSecurityValidationError" },
  );
});

function deniedPathCases() {
  return [
    { path: ".env", codes: ["deny_pattern"], patternId: "env_file" },
    { path: "keys/service.pem", codes: ["deny_pattern"], patternId: "key_material" },
    { path: "cache/artifact.json.enc", codes: ["deny_pattern"], patternId: "cache_path" },
    { path: "../artifact.json.enc", codes: ["path_traversal"] },
    { path: "/tmp/artifact.json.enc", codes: ["absolute_path"] },
    { path: "C:\\workspace\\artifact.json.enc", codes: ["absolute_path", "drive_path", "unsafe_character"] },
    { path: "\\\\server\\share\\artifact.json.enc", codes: ["absolute_path", "unc_path"] },
    { path: "~/.config/artifact.json.enc", codes: ["home_path"] },
    { path: "records/CON", codes: ["windows_reserved_name"] },
    { path: "records/name./artifact.json.enc", codes: ["windows_unsafe_suffix"] },
    { path: "records/name /artifact.json.enc", codes: ["windows_unsafe_suffix"] },
  ];
}

function manifestWithPayloadPath(path) {
  const payload = createBackupPayloadDescriptor({
    id: "pay_workspace_snapshot",
    kind: "workspace_state",
    path: "records/workspace.json.enc",
    plaintextByteSize: 512,
    createdAt,
    encryptionKeyId: "key_workspace_backup",
  });
  const manifest = createBackupManifest({
    backupId: "bkp_path_security",
    workspaceId: "wsp_main",
    createdAt,
    createdByActorId: "act_owner",
    encryptionKeyId: "key_workspace_backup",
    payloads: [payload],
  });

  return {
    ...manifest,
    payloads: [
      {
        ...manifest.payloads[0],
        path,
      },
    ],
  };
}
