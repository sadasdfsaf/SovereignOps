import assert from "node:assert/strict";
import test from "node:test";

import {
  STORAGE_ERROR_CODES,
  StorageAdapterError,
  validateJsonStorageRelativePath,
} from "../src/storage.ts";

test("accepts normalized safe JSON storage paths", () => {
  for (const path of [
    "records/alpha.json",
    "records/alpha/data.json",
    "snapshots/2026-04-27/state_01.json",
    "items/item-01/meta.data.json",
  ]) {
    assert.equal(validateJsonStorageRelativePath(path), path);
  }
});

test("rejects restricted JSON storage path patterns", () => {
  for (const path of [
    ".env.json",
    "records/.env.local.json",
    "keys/data.json",
    "secrets/data.json",
    "cache/data.json",
    "node_modules/data.json",
  ]) {
    assertInvalidStoragePath(path);
  }
});

test("rejects traversal and non-normalized JSON storage paths", () => {
  for (const path of [
    "",
    "../data.json",
    "records/../data.json",
    "records/./data.json",
    "records//data.json",
    "records\\alpha\\data.json",
  ]) {
    assertInvalidStoragePath(path);
  }
});

test("rejects absolute, drive, UNC, and home JSON storage paths", () => {
  for (const path of [
    "/tmp/data.json",
    "C:/tmp/data.json",
    "C:\\tmp\\data.json",
    "//server/share/data.json",
    "\\\\server\\share\\data.json",
    "~/data.json",
  ]) {
    assertInvalidStoragePath(path);
  }
});

test("rejects reserved names, unsafe suffixes, unsafe characters, and non-JSON targets", () => {
  for (const path of [
    "records/con.json",
    "records/LPT1.json",
    "records/trailing./data.json",
    "records/trailing /data.json",
    "records/alpha:data.json",
    "records/name?.json",
    "records/alpha.txt",
    "records/alpha.JSON",
  ]) {
    assertInvalidStoragePath(path);
  }
});

function assertInvalidStoragePath(path) {
  assert.throws(
    () => validateJsonStorageRelativePath(path),
    (error) => {
      assert.equal(error instanceof StorageAdapterError, true);
      assert.equal(error.code, STORAGE_ERROR_CODES.INVALID_PATH);
      return true;
    },
  );
}
