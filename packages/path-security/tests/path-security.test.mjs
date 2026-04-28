import assert from "node:assert/strict";
import test from "node:test";

import {
  PathSecurityValidationError,
  assertLocalRelativePath,
  assertWorkspaceJoinedPath,
  findDeniedPathPatterns,
  joinWorkspaceRoot,
  redactPathForDisplay,
  stablePathFingerprint,
  toSafeLocalRelativePath,
  validateLocalRelativePath,
} from "../src/index.ts";

test("normalizes safe local relative POSIX paths", () => {
  const result = validateLocalRelativePath("./records//items/./note.json");

  assert.equal(result.ok, true);
  assert.equal(result.value.normalizedPath, "records/items/note.json");
  assert.deepEqual(result.value.segments, ["records", "items", "note.json"]);
  assert.equal(toSafeLocalRelativePath("records\\items\\note.json"), "records/items/note.json");
});

test("rejects POSIX and Windows absolute or traversal paths", () => {
  assertIssues("/var/tmp/item.txt", ["absolute_path"]);
  assertIssues("safe/../item.txt", ["path_traversal"]);
  assertIssues("C:\\Users\\local\\item.txt", ["absolute_path", "drive_path", "unsafe_character"]);
  assertIssues("C:relative\\item.txt", ["drive_path", "unsafe_character"]);
  assertIssues("\\\\server\\share\\item.txt", ["absolute_path", "unc_path"]);
  assertIssues("~/.config/item.json", ["home_path"]);
});

test("rejects Windows-unsafe segment names deterministically", () => {
  const first = validateLocalRelativePath("aux.txt");
  const second = validateLocalRelativePath("aux.txt");

  assert.equal(first.ok, false);
  assert.deepEqual(first.issues, second.issues);
  assert.deepEqual(first.issues.map((issue) => issue.code), ["windows_reserved_name"]);

  assertIssues("records/name.", ["windows_unsafe_suffix"]);
  assertIssues("records/item?.json", ["unsafe_character"]);
});

test("applies built-in deny patterns for env, key, and cache paths", () => {
  assertDeny(".env", "env_file");
  assertDeny(".env.local", "env_file");
  assertDeny("keys/service.pem", "key_material");
  assertDeny("secrets/signing.key", "key_material");
  assertDeny(".cache/build.json", "cache_path");
  assertDeny("cache/artifact.json", "cache_path");

  assert.deepEqual(
    findDeniedPathPatterns("records/item.json").map((match) => match.patternId),
    [],
  );
  assert.deepEqual(
    findDeniedPathPatterns("keys/service.pem").map((match) => match.patternId),
    ["key_material"],
  );
});

test("joins workspace roots without allowing traversal", () => {
  const posixJoin = joinWorkspaceRoot("/workspace/root", "records/item.json", {
    platform: "posix",
  });

  assert.equal(posixJoin.ok, true);
  assert.equal(posixJoin.value.workspaceRoot, "/workspace/root");
  assert.equal(posixJoin.value.relativePath, "records/item.json");
  assert.equal(posixJoin.value.absolutePath, "/workspace/root/records/item.json");

  const dotPrefixedPosixJoin = joinWorkspaceRoot("/workspace/root", "..vault/item.json", {
    platform: "posix",
  });

  assert.equal(dotPrefixedPosixJoin.ok, true);
  assert.equal(dotPrefixedPosixJoin.value.absolutePath, "/workspace/root/..vault/item.json");
  assert.equal(dotPrefixedPosixJoin.value.relativePath, "..vault/item.json");

  const windowsJoin = joinWorkspaceRoot("C:\\workspace\\root", "records\\item.json", {
    platform: "windows",
  });

  assert.equal(windowsJoin.ok, true);
  assert.equal(windowsJoin.value.workspaceRoot, "C:\\workspace\\root");
  assert.equal(windowsJoin.value.relativePath, "records/item.json");
  assert.equal(windowsJoin.value.absolutePath, "C:\\workspace\\root\\records\\item.json");

  const dotPrefixedWindowsJoin = joinWorkspaceRoot("C:\\workspace\\root", "...cache\\item.json", {
    platform: "windows",
  });

  assert.equal(dotPrefixedWindowsJoin.ok, true);
  assert.equal(dotPrefixedWindowsJoin.value.absolutePath, "C:\\workspace\\root\\...cache\\item.json");
  assert.equal(dotPrefixedWindowsJoin.value.relativePath, "...cache/item.json");

  const autoWindowsJoin = joinWorkspaceRoot("C:\\workspace\\root", "records\\item.json", {
    platform: "auto",
  });
  assert.equal(autoWindowsJoin.ok, true);
  assert.equal(autoWindowsJoin.value.platform, "windows");

  const traversal = joinWorkspaceRoot("/workspace/root", "../item.json", {
    platform: "posix",
  });
  assert.equal(traversal.ok, false);
  assert.deepEqual(traversal.issues.map((issue) => issue.code), ["path_traversal"]);

  const absoluteRelative = joinWorkspaceRoot("C:\\workspace\\root", "D:\\outside\\item.json", {
    platform: "windows",
  });
  assert.equal(absoluteRelative.ok, false);
  assert.deepEqual(
    absoluteRelative.issues.map((issue) => issue.code),
    ["absolute_path", "drive_path", "unsafe_character"],
  );

  const badRoot = joinWorkspaceRoot("workspace/root", "records/item.json", {
    platform: "posix",
  });
  assert.equal(badRoot.ok, false);
  assert.deepEqual(badRoot.issues.map((issue) => issue.code), ["root_not_absolute"]);
});

test("throws typed errors from assertion helpers", () => {
  assert.throws(
    () => assertLocalRelativePath("../item.json"),
    PathSecurityValidationError,
  );
  assert.throws(
    () => assertWorkspaceJoinedPath("/workspace/root", ".env"),
    PathSecurityValidationError,
  );

  const joined = assertWorkspaceJoinedPath("/workspace/root", "records/item.json", {
    platform: "posix",
  });
  assert.equal(joined.absolutePath, "/workspace/root/records/item.json");
});

test("redacts path display while preserving deterministic references", () => {
  const display = redactPathForDisplay("C:\\Users\\alex\\workspace\\records\\item.json", {
    platform: "windows",
  });

  assert.match(display, /^\.\.\.\/records\/item\.json \[path:[0-9a-f]{12}\]$/);
  assert.equal(display.includes("alex"), false);
  assert.equal(display.includes("workspace"), false);

  const restricted = redactPathForDisplay("C:\\Users\\alex\\workspace\\.env.local", {
    platform: "windows",
  });
  assert.match(restricted, /^\[restricted-path path:[0-9a-f]{12}\]$/);
  assert.equal(restricted.includes(".env"), false);

  assert.equal(stablePathFingerprint("records\\item.json"), stablePathFingerprint("records/item.json"));
});

function assertIssues(path, expectedCodes) {
  const result = validateLocalRelativePath(path);

  assert.equal(result.ok, false);
  assert.deepEqual(result.issues.map((issue) => issue.code), expectedCodes);
}

function assertDeny(path, patternId) {
  const result = validateLocalRelativePath(path);

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.issues.map((issue) => [issue.code, issue.patternId]),
    [["deny_pattern", patternId]],
  );
}
