import {
  closeSync,
  existsSync,
  linkSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import {
  basename,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
} from "node:path";

import type {
  WorkspaceSessionSnapshotRecord,
  WorkspaceSessionSnapshotStore,
} from "./workspaceSessionStoreRoutes.ts";
import { WORKSPACE_SESSION_STORE_SCHEMA_VERSION } from "./workspaceSessionStoreRoutes.ts";

export const DEFAULT_WORKSPACE_SESSION_SNAPSHOT_FILE_STORE_LOCK_FILE =
  ".workspace-session-snapshots.lock";

export interface WorkspaceSessionStoreFileAdapterOptions {
  readonly root?: string;
  readonly rootDir?: string;
  readonly lockFile?: boolean | string;
  readonly useLockFile?: boolean;
  readonly lockFileName?: string;
}

const SNAPSHOT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256_FINGERPRINT_PATTERN = /^sha256:[a-f0-9]{64}$/;
const RECORD_FILE_PATTERN = /^snapshot-[A-Za-z0-9_-]+\.json$/;

export function createWorkspaceSessionStoreFileAdapter(
  options: WorkspaceSessionStoreFileAdapterOptions,
): WorkspaceSessionSnapshotStore {
  const rootDir = normalizeRootDir(options);
  const useLockFile = options.useLockFile === true ||
    options.lockFile === true ||
    typeof options.lockFile === "string";
  const lockFileName = useLockFile
    ? normalizeLocalFileName(
      readLockFileName(options),
      "lockFileName",
    )
    : undefined;

  ensureDirectory(rootDir);
  const realRootDir = realpathSync(rootDir);

  return {
    create(record) {
      const stored = cloneRecord(record);
      const created = withOptionalLock(realRootDir, lockFileName, () =>
        writeRecordFile(realRootDir, stored)
      );
      if (!created) {
        return { ok: false, reason: "duplicate" };
      }

      return { ok: true, record: cloneRecord(stored) };
    },

    get(snapshotId) {
      assertSnapshotId(snapshotId, "snapshotId");
      const filePath = snapshotPath(realRootDir, snapshotId);
      if (!existsSync(filePath)) {
        return undefined;
      }

      return cloneRecord(readRecordFile(realRootDir, filePath));
    },

    list() {
      return Object.freeze(
        readdirSync(realRootDir, { withFileTypes: true })
          .filter((entry) => entry.isFile() && RECORD_FILE_PATTERN.test(entry.name))
          .sort((left, right) => left.name.localeCompare(right.name))
          .map((entry) => readRecordFile(realRootDir, join(realRootDir, entry.name), entry.name))
          .sort((left, right) =>
            left.createdAt.localeCompare(right.createdAt) ||
            left.snapshotId.localeCompare(right.snapshotId)
          )
          .map(cloneRecord),
      );
    },
  };
}

export const createFileBackedWorkspaceSessionSnapshotStore =
  createWorkspaceSessionStoreFileAdapter;

export const createWorkspaceSessionSnapshotFileStore =
  createWorkspaceSessionStoreFileAdapter;

function writeRecordFile(rootDir: string, record: WorkspaceSessionSnapshotRecord): boolean {
  const filePath = snapshotPath(rootDir, record.snapshotId);
  const tempPath = snapshotTempPath(rootDir, record.snapshotId);
  writeFileSync(tempPath, `${JSON.stringify(record, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });

  try {
    linkSync(tempPath, filePath);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "EEXIST") {
      return false;
    }
    throw error;
  } finally {
    rmSync(tempPath, { force: true });
  }
}

function readRecordFile(
  rootDir: string,
  filePath: string,
  fileName = basename(filePath),
): WorkspaceSessionSnapshotRecord {
  assertPathInside(filePath, rootDir);
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  const record = cloneRecord(parsed);
  const expectedFileName = snapshotFileName(record.snapshotId);
  if (fileName !== expectedFileName) {
    throw new TypeError("Workspace session snapshot file name does not match its record id.");
  }

  return record;
}

function withOptionalLock<T>(
  rootDir: string,
  lockFileName: string | undefined,
  callback: () => T,
): T {
  if (lockFileName === undefined) {
    return callback();
  }

  const lockPath = join(rootDir, lockFileName);
  assertPathInside(lockPath, rootDir);

  let fd: number | undefined;
  try {
    fd = openSync(lockPath, "wx", 0o600);
    writeFileSync(fd, `${JSON.stringify({
      kind: "workspace-session.snapshot-store-lock",
      createdAt: new Date().toISOString(),
    })}\n`);
  } catch (error) {
    if (fd !== undefined) {
      closeSync(fd);
    }
    if (isNodeError(error) && error.code === "EEXIST") {
      throw new Error("Workspace session snapshot file store is locked.");
    }
    throw error;
  }

  try {
    return callback();
  } finally {
    closeSync(fd);
    rmSync(lockPath, { force: true });
  }
}

function snapshotPath(rootDir: string, snapshotId: string): string {
  assertSnapshotId(snapshotId, "snapshotId");
  const filePath = join(rootDir, snapshotFileName(snapshotId));
  assertPathInside(filePath, rootDir);
  return filePath;
}

function snapshotTempPath(rootDir: string, snapshotId: string): string {
  assertSnapshotId(snapshotId, "snapshotId");
  const tempPath = join(
    rootDir,
    `.tmp-${snapshotFileName(snapshotId).slice(0, -".json".length)}-${randomUUID()}.json`,
  );
  assertPathInside(tempPath, rootDir);
  return tempPath;
}

function snapshotFileName(snapshotId: string): string {
  assertSnapshotId(snapshotId, "snapshotId");
  return `snapshot-${Buffer.from(snapshotId, "utf8").toString("base64url")}.json`;
}

function normalizeRootDir(options: WorkspaceSessionStoreFileAdapterOptions): string {
  const rootDir = options.rootDir ?? options.root;
  if (options.rootDir !== undefined && options.root !== undefined) {
    const left = normalizePathText(options.rootDir, "rootDir");
    const right = normalizePathText(options.root, "root");
    if (resolve(left) !== resolve(right)) {
      throw new TypeError("Workspace session snapshot file store received conflicting roots.");
    }
  }

  const value = normalizePathText(rootDir, "rootDir");
  if (hasTraversalSegment(value)) {
    throw new TypeError("Workspace session snapshot file store root must not contain traversal segments.");
  }
  if (!isAbsolute(value)) {
    throw new TypeError("Workspace session snapshot file store root must be absolute.");
  }

  const rootDirPath = resolve(value);
  if (rootDirPath === parse(rootDirPath).root) {
    throw new TypeError("Workspace session snapshot file store root must not be a filesystem root.");
  }

  return rootDirPath;
}

function readLockFileName(options: WorkspaceSessionStoreFileAdapterOptions): string {
  if (typeof options.lockFile === "string") {
    return options.lockFile;
  }

  return options.lockFileName ?? DEFAULT_WORKSPACE_SESSION_SNAPSHOT_FILE_STORE_LOCK_FILE;
}

function normalizePathText(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`Workspace session snapshot file store ${path} must be a path string.`);
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new TypeError(`Workspace session snapshot file store ${path} must be non-empty.`);
  }

  return trimmed;
}

function normalizeLocalFileName(value: string, path: string): string {
  const fileName = normalizePathText(value, path);
  if (
    fileName === "." ||
    fileName === ".." ||
    isAbsolute(fileName) ||
    basename(fileName) !== fileName
  ) {
    throw new TypeError(`Workspace session snapshot file store ${path} must be a local file name.`);
  }

  return fileName;
}

function ensureDirectory(rootDir: string): void {
  mkdirSync(rootDir, { recursive: true });
  const stats = statSync(rootDir);
  if (!stats.isDirectory()) {
    throw new TypeError("Workspace session snapshot file store root must be a directory.");
  }
}

function assertSnapshotId(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || !SNAPSHOT_ID_PATTERN.test(value)) {
    throw new TypeError(
      `Workspace session snapshot file store ${path} must be a safe snapshot id.`,
    );
  }
}

function assertPathInside(filePath: string, rootDir: string): void {
  const resolvedFilePath = resolve(filePath);
  const resolvedRootDir = resolve(rootDir);
  const relativePath = relative(resolvedRootDir, resolvedFilePath);
  if (relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new TypeError("Workspace session snapshot file path escaped the store root.");
  }
}

function hasTraversalSegment(value: string): boolean {
  return value.split(/[\\/]+/).includes("..");
}

function cloneRecord(value: unknown): WorkspaceSessionSnapshotRecord {
  assertSnapshotRecord(value);
  assertJsonCompatible(value, "record", new WeakSet<object>());
  return deepFreeze(structuredClone(value)) as WorkspaceSessionSnapshotRecord;
}

function assertSnapshotRecord(value: unknown): asserts value is WorkspaceSessionSnapshotRecord {
  if (!isRecord(value)) {
    throw new TypeError("Workspace session snapshot file store records must be objects.");
  }

  assertStringField(value, "kind", "workspace-session.snapshot-record");
  assertStringField(value, "schemaVersion", WORKSPACE_SESSION_STORE_SCHEMA_VERSION);
  assertBooleanField(value, "localOnly", true);
  assertBooleanField(value, "durableWrites", false);
  assertBooleanField(value, "redacted", true);
  assertSnapshotId(value.snapshotId, "record.snapshotId");
  assertTimestamp(value.createdAt, "record.createdAt");
  assertTimestamp(value.updatedAt, "record.updatedAt");
  assertFingerprint(value.fingerprint, "record.fingerprint");
  assertFingerprint(value.snapshotFingerprint, "record.snapshotFingerprint");

  if (!isRecord(value.snapshot)) {
    throw new TypeError("Workspace session snapshot file store records require a snapshot.");
  }

  assertStringField(value.snapshot, "kind", "workspace-session.snapshot-preview");
  assertStringField(value.snapshot, "schemaVersion", WORKSPACE_SESSION_STORE_SCHEMA_VERSION);
  assertBooleanField(value.snapshot, "localOnly", true);
  assertBooleanField(value.snapshot, "durableWrites", false);
  assertBooleanField(value.snapshot, "redacted", true);
  assertFingerprint(value.snapshot.fingerprint, "record.snapshot.fingerprint");
  if (!isRecord(value.snapshot.summary)) {
    throw new TypeError("Workspace session snapshot file store records require a summary.");
  }
  assertStringField(value.snapshot.summary, "kind", "workspace-session.snapshot-summary");
  assertBooleanField(value.snapshot.summary, "localOnly", true);
  assertBooleanField(value.snapshot.summary, "redacted", true);

  if (value.snapshotFingerprint !== value.snapshot.fingerprint) {
    throw new TypeError("Workspace session snapshot file store record fingerprint mismatch.");
  }
}

function assertStringField(
  record: Readonly<Record<string, unknown>>,
  key: string,
  expected: string,
): void {
  if (record[key] !== expected) {
    throw new TypeError(`Workspace session snapshot file store record ${key} is invalid.`);
  }
}

function assertBooleanField(
  record: Readonly<Record<string, unknown>>,
  key: string,
  expected: boolean,
): void {
  if (record[key] !== expected) {
    throw new TypeError(`Workspace session snapshot file store record ${key} is invalid.`);
  }
}

function assertTimestamp(value: unknown, path: string): void {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`Workspace session snapshot file store ${path} must be a timestamp.`);
  }
}

function assertFingerprint(value: unknown, path: string): void {
  if (typeof value !== "string" || !SHA256_FINGERPRINT_PATTERN.test(value)) {
    throw new TypeError(`Workspace session snapshot file store ${path} must be a sha256 fingerprint.`);
  }
}

function assertJsonCompatible(
  value: unknown,
  path: string,
  seen: WeakSet<object>,
): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Workspace session snapshot file store ${path} must be JSON-compatible.`);
    }
    return;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new TypeError("Workspace session snapshot file store records must not be circular.");
    }

    seen.add(value);
    for (const [index, item] of value.entries()) {
      assertJsonCompatible(item, `${path}.${index}`, seen);
    }
    seen.delete(value);
    return;
  }

  if (isRecord(value)) {
    if (seen.has(value)) {
      throw new TypeError("Workspace session snapshot file store records must not be circular.");
    }

    seen.add(value);
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) {
        throw new TypeError(`Workspace session snapshot file store ${path}.${key} must be JSON-compatible.`);
      }
      assertJsonCompatible(item, `${path}.${key}`, seen);
    }
    seen.delete(value);
    return;
  }

  throw new TypeError(`Workspace session snapshot file store ${path} must be JSON-compatible.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze<T>(value: T): T {
  if (!isRecord(value) && !Array.isArray(value)) {
    return value;
  }

  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }

  return Object.freeze(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
