import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
} from "node:path";

import {
  type LocalWorkspaceSessionStoreBundle,
  type LocalWorkspaceSessionStoreBundleInput,
  parseLocalWorkspaceSessionStoreBundle,
  serializeLocalWorkspaceSessionStoreBundle,
} from "./localWorkspaceSessionStore.ts";
import { validateJsonStorageRelativePath } from "./storage.ts";
import type { DeepReadonly } from "./workspace.ts";

export const DEFAULT_LOCAL_WORKSPACE_SESSION_FILE_STORE_PATH =
  ".sovereignops/sessions/local-workspace-session-store.json";

export const LOCAL_WORKSPACE_SESSION_FILE_STORE_ERROR_CODES = Object.freeze({
  DELETE_FAILED: "LOCAL_WORKSPACE_SESSION_FILE_STORE_DELETE_FAILED",
  INVALID_PATH: "LOCAL_WORKSPACE_SESSION_FILE_STORE_INVALID_PATH",
  INVALID_ROOT: "LOCAL_WORKSPACE_SESSION_FILE_STORE_INVALID_ROOT",
  LOCK_FAILED: "LOCAL_WORKSPACE_SESSION_FILE_STORE_LOCK_FAILED",
  LOCKED: "LOCAL_WORKSPACE_SESSION_FILE_STORE_LOCKED",
  READ_FAILED: "LOCAL_WORKSPACE_SESSION_FILE_STORE_READ_FAILED",
  WRITE_FAILED: "LOCAL_WORKSPACE_SESSION_FILE_STORE_WRITE_FAILED",
});

export type LocalWorkspaceSessionFileStoreErrorCode =
  (typeof LOCAL_WORKSPACE_SESSION_FILE_STORE_ERROR_CODES)[keyof typeof LOCAL_WORKSPACE_SESSION_FILE_STORE_ERROR_CODES];

export interface LocalWorkspaceSessionFileStoreErrorOptions {
  readonly cause?: unknown;
  readonly details?: Readonly<Record<string, unknown>>;
}

export class LocalWorkspaceSessionFileStoreError extends Error {
  readonly code: LocalWorkspaceSessionFileStoreErrorCode;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    code: LocalWorkspaceSessionFileStoreErrorCode,
    message: string,
    options: LocalWorkspaceSessionFileStoreErrorOptions = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "LocalWorkspaceSessionFileStoreError";
    this.code = code;
    this.details =
      options.details === undefined ? undefined : readOnlyClone(options.details);
  }
}

export interface LocalWorkspaceSessionFileStoreOptions {
  readonly rootDir: string;
  readonly path?: string;
  readonly useLockFile?: boolean;
}

export interface LocalWorkspaceSessionFileStorePath {
  readonly rootDir: string;
  readonly path: string;
  readonly absolutePath: string;
  readonly lockPath: string;
}

export interface LocalWorkspaceSessionFileStoreWriteOptions {
  readonly useLockFile?: boolean;
}

export type FileBackedLocalWorkspaceSessionStoreOptions =
  LocalWorkspaceSessionFileStoreOptions;
export type FileBackedLocalWorkspaceSessionStoreWriteOptions =
  LocalWorkspaceSessionFileStoreWriteOptions;

let tempFileCounter = 0;

export class LocalWorkspaceSessionFileStore {
  readonly #rootDir: string;
  readonly #path: string;
  readonly #absolutePath: string;
  readonly #lockPath: string;
  readonly #useLockFile: boolean;

  constructor(options: LocalWorkspaceSessionFileStoreOptions) {
    const plan = resolveLocalWorkspaceSessionFileStorePath({
      rootDir: options.rootDir,
      path: options.path,
    });

    this.#rootDir = plan.rootDir;
    this.#path = plan.path;
    this.#absolutePath = plan.absolutePath;
    this.#lockPath = plan.lockPath;
    this.#useLockFile = options.useLockFile === true;
  }

  get rootDir(): string {
    return this.#rootDir;
  }

  get path(): string {
    return this.#path;
  }

  get absolutePath(): string {
    return this.#absolutePath;
  }

  get lockPath(): string {
    return this.#lockPath;
  }

  async readBundle(): Promise<DeepReadonly<LocalWorkspaceSessionStoreBundle> | undefined> {
    let source: string;
    try {
      source = await readFile(this.#absolutePath, "utf8");
    } catch (cause) {
      if (isNodeError(cause) && cause.code === "ENOENT") {
        return undefined;
      }
      throw fileStoreError(
        LOCAL_WORKSPACE_SESSION_FILE_STORE_ERROR_CODES.READ_FAILED,
        "local workspace session store file could not be read",
        this.#details(),
        cause,
      );
    }

    return parseLocalWorkspaceSessionStoreBundle(source);
  }

  async loadBundle(): Promise<DeepReadonly<LocalWorkspaceSessionStoreBundle> | undefined> {
    return this.readBundle();
  }

  async load(): Promise<DeepReadonly<LocalWorkspaceSessionStoreBundle> | undefined> {
    return this.readBundle();
  }

  async writeBundle(
    input: LocalWorkspaceSessionStoreBundleInput | LocalWorkspaceSessionStoreBundle,
    options: LocalWorkspaceSessionFileStoreWriteOptions = {},
  ): Promise<DeepReadonly<LocalWorkspaceSessionStoreBundle>> {
    const contents = serializeLocalWorkspaceSessionStoreBundle(input);
    const write = async () => {
      await writeFileAtomic(this.#absolutePath, contents);
      return parseLocalWorkspaceSessionStoreBundle(contents);
    };

    return this.#shouldUseLock(options)
      ? withLockFile(this.#lockPath, this.#details(), write)
      : write();
  }

  async saveBundle(
    input: LocalWorkspaceSessionStoreBundleInput | LocalWorkspaceSessionStoreBundle,
    options: LocalWorkspaceSessionFileStoreWriteOptions = {},
  ): Promise<DeepReadonly<LocalWorkspaceSessionStoreBundle>> {
    return this.writeBundle(input, options);
  }

  async save(
    input: LocalWorkspaceSessionStoreBundleInput | LocalWorkspaceSessionStoreBundle,
    options: LocalWorkspaceSessionFileStoreWriteOptions = {},
  ): Promise<DeepReadonly<LocalWorkspaceSessionStoreBundle>> {
    return this.writeBundle(input, options);
  }

  async deleteBundle(
    options: LocalWorkspaceSessionFileStoreWriteOptions = {},
  ): Promise<void> {
    const remove = async () => {
      try {
        await rm(this.#absolutePath, { force: true });
      } catch (cause) {
        throw fileStoreError(
          LOCAL_WORKSPACE_SESSION_FILE_STORE_ERROR_CODES.DELETE_FAILED,
          "local workspace session store file could not be deleted",
          this.#details(),
          cause,
        );
      }
    };

    return this.#shouldUseLock(options)
      ? withLockFile(this.#lockPath, this.#details(), remove)
      : remove();
  }

  #shouldUseLock(options: LocalWorkspaceSessionFileStoreWriteOptions): boolean {
    return options.useLockFile ?? this.#useLockFile;
  }

  #details(): Readonly<Record<string, unknown>> {
    return {
      rootDir: this.#rootDir,
      path: this.#path,
      absolutePath: this.#absolutePath,
      lockPath: this.#lockPath,
    };
  }
}

export function createLocalWorkspaceSessionFileStore(
  options: LocalWorkspaceSessionFileStoreOptions,
): LocalWorkspaceSessionFileStore {
  return new LocalWorkspaceSessionFileStore(options);
}

export { LocalWorkspaceSessionFileStore as FileBackedLocalWorkspaceSessionStore };

export function createFileBackedLocalWorkspaceSessionStore(
  options: FileBackedLocalWorkspaceSessionStoreOptions,
): LocalWorkspaceSessionFileStore {
  return new LocalWorkspaceSessionFileStore(options);
}

export function resolveLocalWorkspaceSessionFileStorePath(
  options: Pick<LocalWorkspaceSessionFileStoreOptions, "rootDir" | "path">,
): DeepReadonly<LocalWorkspaceSessionFileStorePath> {
  const rootDir = normalizeRootDir(options.rootDir);
  const path = validateJsonStorageRelativePath(
    options.path ?? DEFAULT_LOCAL_WORKSPACE_SESSION_FILE_STORE_PATH,
  );
  const absolutePath = resolve(rootDir, ...path.split("/"));
  assertPathInsideRoot(rootDir, absolutePath, path);

  return readOnlyClone({
    rootDir,
    path,
    absolutePath,
    lockPath: `${absolutePath}.lock`,
  });
}

export async function readLocalWorkspaceSessionStoreBundleFile(
  options: Pick<LocalWorkspaceSessionFileStoreOptions, "rootDir" | "path">,
): Promise<DeepReadonly<LocalWorkspaceSessionStoreBundle> | undefined> {
  return new LocalWorkspaceSessionFileStore(options).readBundle();
}

export async function writeLocalWorkspaceSessionStoreBundleFile(
  options: LocalWorkspaceSessionFileStoreOptions,
  bundle: LocalWorkspaceSessionStoreBundleInput | LocalWorkspaceSessionStoreBundle,
): Promise<DeepReadonly<LocalWorkspaceSessionStoreBundle>> {
  return new LocalWorkspaceSessionFileStore(options).writeBundle(bundle);
}

async function writeFileAtomic(absolutePath: string, contents: string): Promise<void> {
  const directory = dirname(absolutePath);
  const tempPath = temporaryPathFor(absolutePath);
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(tempPath, contents, { encoding: "utf8", flag: "wx" });
    await rename(tempPath, absolutePath);
  } catch (cause) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw fileStoreError(
      LOCAL_WORKSPACE_SESSION_FILE_STORE_ERROR_CODES.WRITE_FAILED,
      "local workspace session store file could not be written atomically",
      { absolutePath, tempPath },
      cause,
    );
  }
}

async function withLockFile<T>(
  lockPath: string,
  details: Readonly<Record<string, unknown>>,
  fn: () => Promise<T>,
): Promise<T> {
  let lock: Awaited<ReturnType<typeof open>> | undefined;
  try {
    await mkdir(dirname(lockPath), { recursive: true });
    lock = await open(lockPath, "wx");
    await lock.writeFile(lockContents());
  } catch (cause) {
    if (isNodeError(cause) && cause.code === "EEXIST") {
      throw fileStoreError(
        LOCAL_WORKSPACE_SESSION_FILE_STORE_ERROR_CODES.LOCKED,
        "local workspace session store file is locked",
        details,
        cause,
      );
    }
    throw fileStoreError(
      LOCAL_WORKSPACE_SESSION_FILE_STORE_ERROR_CODES.LOCK_FAILED,
      "local workspace session store lock file could not be created",
      details,
      cause,
    );
  }

  try {
    return await fn();
  } finally {
    await lock.close().catch(() => undefined);
    await rm(lockPath, { force: true }).catch(() => undefined);
  }
}

function temporaryPathFor(absolutePath: string): string {
  tempFileCounter += 1;
  return resolve(
    dirname(absolutePath),
    `.${basename(absolutePath)}.${process.pid}.${Date.now()}.${tempFileCounter}.tmp`,
  );
}

function lockContents(): string {
  return `pid=${process.pid}\ncreatedAt=${new Date().toISOString()}\n`;
}

function normalizeRootDir(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw fileStoreError(
      LOCAL_WORKSPACE_SESSION_FILE_STORE_ERROR_CODES.INVALID_ROOT,
      "local workspace session store rootDir must be a non-empty absolute path",
      { path: "rootDir" },
    );
  }
  if (value !== value.trim() || !isAbsolute(value)) {
    throw fileStoreError(
      LOCAL_WORKSPACE_SESSION_FILE_STORE_ERROR_CODES.INVALID_ROOT,
      "local workspace session store rootDir must be a normalized absolute path",
      { rootDir: value },
    );
  }

  return resolve(value);
}

function assertPathInsideRoot(rootDir: string, absolutePath: string, path: string): void {
  const relation = relative(rootDir, absolutePath);
  if (relation.startsWith("..") || isAbsolute(relation)) {
    throw fileStoreError(
      LOCAL_WORKSPACE_SESSION_FILE_STORE_ERROR_CODES.INVALID_PATH,
      "local workspace session store path must remain inside rootDir",
      { rootDir, path, absolutePath },
    );
  }
}

function fileStoreError(
  code: LocalWorkspaceSessionFileStoreErrorCode,
  message: string,
  details: Readonly<Record<string, unknown>>,
  cause?: unknown,
): LocalWorkspaceSessionFileStoreError {
  return new LocalWorkspaceSessionFileStoreError(code, message, { cause, details });
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error && "code" in value;
}

function readOnlyClone<T>(value: T): DeepReadonly<T> {
  return deepFreeze(structuredClone(value)) as DeepReadonly<T>;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }
  return value;
}
