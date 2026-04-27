import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const docPath = path.join(root, "docs", "workspace-session-file-store.md");
const fixturePath = path.join(root, "examples", "workspace-session", "file-store-adapter.json");

const privatePathMarkers = [
  ["sovereignops", "-codex", "-pack"].join(""),
  [".codex", "-private"].join(""),
  [".codex", "-run"].join(""),
  ["CODEX", "START", "HERE"].join("_"),
  ["tasks", "backlog.jsonl"].join("/"),
  ["tasks", "backlog.jsonl"].join("\\"),
];

const forbiddenFragments = [
  "file://",
  "http://",
  "https://",
  "localhost",
  "127.0.0.1",
  "~/",
  "curl ",
  "npx ",
  "npm install -g",
];

const machinePathPatterns = [
  /(?<![A-Za-z0-9])[A-Za-z]:[\\/]/,
  /\\\\[^\\\s]+\\[^\\\s]+/,
  /(?<![A-Za-z0-9_])\/(?:Users|home|root|tmp|var|etc|opt|private|mnt|Volumes)(?:\/|\b)/,
  /(?<!\.)\.\.[/\\]/,
];

const secretValuePatterns = [
  /sk-[A-Za-z0-9_-]{12,}/,
  /gh[pousr]_[A-Za-z0-9_]{12,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bBearer\s+(?!\[REDACTED\])[A-Za-z0-9._~+/=-]+/i,
  /(?<!\[redacted:lock)(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*(?!\[REDACTED\]|\[redacted:)\S{4,}/i,
];

describe("workspace session file-store docs and fixture threat controls", () => {
  it("keeps checked-in file-store docs and fixture free of private-pack markers", async () => {
    const { combinedText, lowerText } = await loadPublicTexts();

    for (const marker of privatePathMarkers) {
      assert.equal(lowerText.includes(marker.toLowerCase()), false, marker);
    }

    for (const fragment of forbiddenFragments) {
      assert.equal(lowerText.includes(fragment), false, fragment);
    }

    for (const pattern of machinePathPatterns) {
      assert.equal(pattern.test(combinedText), false, pattern.toString());
    }

    for (const pattern of secretValuePatterns) {
      assert.equal(pattern.test(combinedText), false, pattern.toString());
    }
  });

  it("declares root-scoped file-store paths without traversal or machine roots", async () => {
    const fixture = await loadFixture();
    const scopedPaths = [
      fixture.adapter.baseDir,
      fixture.atomicWrite.targetPath,
      fixture.atomicWrite.tempPathPattern,
      fixture.lockGuard.lockFile,
    ];

    for (const scopedPath of scopedPaths) {
      assert.equal(typeof scopedPath, "string");
      assert.equal(scopedPath.startsWith("workspaces/wsp_session_alpha/"), true, scopedPath);
      assert.equal(scopedPath.includes(".."), false, scopedPath);
      assert.equal(scopedPath.startsWith("/"), false, scopedPath);
      assert.equal(/^[A-Za-z]:[\\/]/.test(scopedPath), false, scopedPath);
      assert.equal(scopedPath.includes("\\"), false, scopedPath);
    }

    assert.equal(fixture.adapter.pathRules.normalizedRelativePaths, true);
    assert.equal(fixture.adapter.pathRules.allowParentTraversal, false);
    assert.equal(fixture.adapter.pathRules.allowAbsolutePaths, false);
    assert.deepEqual(fixture.adapter.pathRules.allowedExtensions, [".json"]);
  });

  it("requires atomic writes and a redacted lock guard in the fixture", async () => {
    const fixture = await loadFixture();

    assert.equal(fixture.atomicWrite.enabled, true);
    assert.equal(fixture.atomicWrite.strategy, "write-temp-fsync-rename");
    assert.equal(fixture.atomicWrite.commit, "rename");
    assert.equal(fixture.atomicWrite.partialWritesVisible, false);
    assert.equal(fixture.atomicWrite.recovery, "ignore-temp-and-read-last-committed");
    assert.equal(fixture.lockGuard.enabled, true);
    assert.equal(fixture.lockGuard.guard, "useLockFile");
    assert.match(fixture.lockGuard.lockTokenRef, /^\[redacted:lockToken:[a-z0-9]+\]$/);
    assert.equal(fixture.lockGuard.rawLockMaterialStored, false);
  });

  it("keeps route, client, CLI, and Web state names visible for alignment", async () => {
    const { combinedText } = await loadPublicTexts();
    const expectedNames = [
      "createWorkspaceSessionStoreRoutes",
      "mountWorkspaceSessionStoreRoutes",
      "createWorkspaceSessionStoreFileAdapter",
      "createFileBackedWorkspaceSessionSnapshotStore",
      "LocalWorkspaceSessionSnapshotApiClient",
      "createLocalWorkspaceSessionSnapshotApiClient",
      "LocalWorkspaceSessionFileStore",
      "createLocalWorkspaceSessionFileStore",
      "runWorkspaceSessionSnapshotStoreCli",
      "loadWorkspaceSessionSnapshotStore",
      "isWorkspaceSessionSnapshotStoreCommand",
      "buildWorkspaceSessionSnapshotState",
      "buildWorkspaceSessionSnapshotSummaryCards",
      "redactWorkspaceSessionSnapshotDisplayValue",
      "/v1/workspace-session/snapshots/preview",
      "/v1/workspace-session/snapshots/:snapshotId",
    ];

    for (const expectedName of expectedNames) {
      assert.equal(combinedText.includes(expectedName), true, expectedName);
    }
  });
});

async function loadPublicTexts() {
  const [docText, fixtureText] = await Promise.all([
    readFile(docPath, "utf8"),
    readFile(fixturePath, "utf8"),
  ]);
  const combinedText = `${docText}\n${fixtureText}`;
  return {
    combinedText,
    lowerText: combinedText.toLowerCase(),
  };
}

async function loadFixture() {
  return JSON.parse(await readFile(fixturePath, "utf8"));
}
