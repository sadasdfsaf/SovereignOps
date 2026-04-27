import { posix, win32 } from "node:path";

export const PATH_SECURITY_ISSUE_CODES = Object.freeze({
  INVALID_TYPE: "invalid_type",
  EMPTY_PATH: "empty_path",
  SURROUNDING_WHITESPACE: "surrounding_whitespace",
  CONTROL_CHARACTER: "control_character",
  URL_PATH: "url_path",
  ABSOLUTE_PATH: "absolute_path",
  DRIVE_PATH: "drive_path",
  UNC_PATH: "unc_path",
  HOME_PATH: "home_path",
  TRAVERSAL: "path_traversal",
  UNSAFE_CHARACTER: "unsafe_character",
  WINDOWS_RESERVED_NAME: "windows_reserved_name",
  WINDOWS_UNSAFE_SUFFIX: "windows_unsafe_suffix",
  DENY_PATTERN: "deny_pattern",
  ROOT_NOT_ABSOLUTE: "root_not_absolute",
  JOIN_ESCAPES_ROOT: "join_escapes_root",
} as const);

export type PathSecurityIssueCode =
  (typeof PATH_SECURITY_ISSUE_CODES)[keyof typeof PATH_SECURITY_ISSUE_CODES];

export type PathPlatform = "posix" | "windows";

export interface PathSecurityIssue {
  readonly code: PathSecurityIssueCode;
  readonly path: string;
  readonly message: string;
  readonly patternId?: string;
}

export interface PathSecurityValidationSuccess<T> {
  readonly ok: true;
  readonly issues: readonly [];
  readonly value: T;
}

export interface PathSecurityValidationFailure {
  readonly ok: false;
  readonly issues: readonly PathSecurityIssue[];
}

export type PathSecurityValidationResult<T> =
  | PathSecurityValidationSuccess<T>
  | PathSecurityValidationFailure;

export interface PathDenyPattern {
  readonly id: string;
  readonly message: string;
  readonly segmentNames?: readonly string[];
  readonly basenamePatterns?: readonly RegExp[];
  readonly pathPatterns?: readonly RegExp[];
}

export interface PathDenyPatternMatch {
  readonly patternId: string;
  readonly message: string;
  readonly matched: string;
}

export interface LocalRelativePathOptions {
  readonly allowEmpty?: boolean;
  readonly allowDeniedPatterns?: boolean;
  readonly denyPatterns?: readonly PathDenyPattern[];
  readonly issuePath?: string;
}

export interface SafeLocalRelativePath {
  readonly normalizedPath: string;
  readonly segments: readonly string[];
  readonly redactedDisplay: string;
}

export interface WorkspaceJoinOptions extends LocalRelativePathOptions {
  readonly platform?: PathPlatform | "auto";
  readonly rootIssuePath?: string;
  readonly relativeIssuePath?: string;
}

export interface WorkspaceJoinedPath {
  readonly absolutePath: string;
  readonly platform: PathPlatform;
  readonly redactedDisplay: string;
  readonly relativePath: string;
  readonly workspaceRoot: string;
}

export interface RedactPathOptions {
  readonly denyPatterns?: readonly PathDenyPattern[];
  readonly keepSegments?: number;
  readonly platform?: PathPlatform | "auto";
}

export const DEFAULT_PATH_DENY_PATTERNS: readonly PathDenyPattern[] = Object.freeze([
  Object.freeze({
    id: "env_file",
    message: "environment files are not allowed",
    basenamePatterns: Object.freeze([/^\.env(?:\..*)?$/i]),
  }),
  Object.freeze({
    id: "key_material",
    message: "key material files are not allowed",
    segmentNames: Object.freeze(["keys", "key", "secrets", "secret"]),
    basenamePatterns: Object.freeze([
      /^(?:id_rsa|id_dsa|id_ecdsa|id_ed25519)(?:\.pub)?$/i,
      /\.(?:pem|key|p12|pfx|asc|gpg)$/i,
    ]),
  }),
  Object.freeze({
    id: "cache_path",
    message: "cache paths are not allowed",
    segmentNames: Object.freeze([".cache", "cache", "node_modules", ".npm", ".pnpm-store", ".yarn"]),
    basenamePatterns: Object.freeze([/\.cache$/i]),
  }),
]);

const DEFAULT_ISSUE_PATH = "$.path";
const ROOT_ISSUE_PATH = "$.workspaceRoot";
const RELATIVE_ISSUE_PATH = "$.relativePath";
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const URL_SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//;
const DRIVE_PATH_PATTERN = /^[A-Za-z]:/;
const DRIVE_ABSOLUTE_PATH_PATTERN = /^[A-Za-z]:[\\/]/;
const UNC_PATH_PATTERN = /^(?:\\\\|\/\/)[^/\\]+[\\/][^/\\]+/;
const WINDOWS_UNSAFE_CHARACTER_PATTERN = /[<>:"|?*]/;
const WINDOWS_RESERVED_BASENAME_PATTERN = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const DISPLAY_SEGMENT_PATTERN = /[^A-Za-z0-9._-]+/g;

export class PathSecurityValidationError extends TypeError {
  readonly issues: readonly PathSecurityIssue[];

  constructor(message: string, issues: readonly PathSecurityIssue[]) {
    super(`${message}: ${issues.map(formatIssue).join("; ")}`);
    this.name = "PathSecurityValidationError";
    this.issues = sortPathSecurityIssues(issues);
  }
}

export function validateLocalRelativePath(
  value: unknown,
  options: LocalRelativePathOptions = {},
): PathSecurityValidationResult<SafeLocalRelativePath> {
  const issuePath = options.issuePath ?? DEFAULT_ISSUE_PATH;
  const issues: PathSecurityIssue[] = [];

  if (typeof value !== "string") {
    issues.push(createIssue(issuePath, PATH_SECURITY_ISSUE_CODES.INVALID_TYPE, "must be a string"));
    return validationFailure(issues);
  }

  const raw = value;
  const trimmed = raw.trim();
  validatePathStringBasics(raw, trimmed, issuePath, issues, options.allowEmpty === true);
  validateUnsafePathPrefix(trimmed, issuePath, issues);

  const segments = collectRelativeSegments(trimmed, issuePath, issues);
  if (segments.length === 0 && options.allowEmpty !== true) {
    issues.push(createIssue(issuePath, PATH_SECURITY_ISSUE_CODES.EMPTY_PATH, "must contain at least one path segment"));
  }

  validateRelativeSegments(segments, issuePath, issues);

  if (options.allowDeniedPatterns !== true) {
    for (const match of findDeniedPathPatternsFromSegments(segments, getDenyPatterns(options))) {
      issues.push(createIssue(
        issuePath,
        PATH_SECURITY_ISSUE_CODES.DENY_PATTERN,
        match.message,
        match.patternId,
      ));
    }
  }

  if (issues.length > 0) {
    return validationFailure(issues);
  }

  const normalizedPath = segments.join("/");
  return {
    ok: true,
    issues: [],
    value: Object.freeze({
      normalizedPath,
      segments: Object.freeze([...segments]),
      redactedDisplay: redactPathForDisplay(normalizedPath, {
        denyPatterns: getDenyPatterns(options),
      }),
    }),
  };
}

export function assertLocalRelativePath(
  value: unknown,
  options: LocalRelativePathOptions = {},
): SafeLocalRelativePath {
  const result = validateLocalRelativePath(value, options);
  if (!result.ok) {
    throw new PathSecurityValidationError("Invalid local relative path", result.issues);
  }

  return result.value;
}

export function toSafeLocalRelativePath(
  value: unknown,
  options: LocalRelativePathOptions = {},
): string {
  return assertLocalRelativePath(value, options).normalizedPath;
}

export function joinWorkspaceRoot(
  workspaceRoot: unknown,
  relativePath: unknown,
  options: WorkspaceJoinOptions = {},
): PathSecurityValidationResult<WorkspaceJoinedPath> {
  const rootIssuePath = options.rootIssuePath ?? ROOT_ISSUE_PATH;
  const relativeIssuePath = options.relativeIssuePath ?? RELATIVE_ISSUE_PATH;
  const platform = options.platform === undefined || options.platform === "auto"
    ? inferPlatform(workspaceRoot)
    : options.platform;
  const issues: PathSecurityIssue[] = [];
  const root = validateWorkspaceRoot(workspaceRoot, platform, rootIssuePath, issues);
  const relative = validateLocalRelativePath(relativePath, {
    ...options,
    issuePath: relativeIssuePath,
  });

  if (!relative.ok) {
    issues.push(...relative.issues);
  }

  if (issues.length > 0 || root === undefined || !relative.ok) {
    return validationFailure(issues);
  }

  const pathApi = platform === "windows" ? win32 : posix;
  const relativeForPlatform = toPlatformSeparators(relative.value.normalizedPath, platform);
  const absolutePath = pathApi.resolve(root, relativeForPlatform);
  const relation = pathApi.relative(root, absolutePath);
  if (relation.startsWith("..") || pathApi.isAbsolute(relation)) {
    return validationFailure([
      createIssue(
        relativeIssuePath,
        PATH_SECURITY_ISSUE_CODES.JOIN_ESCAPES_ROOT,
        "joined path must remain inside the workspace root",
      ),
    ]);
  }

  return {
    ok: true,
    issues: [],
    value: Object.freeze({
      absolutePath,
      platform,
      redactedDisplay: redactPathForDisplay(absolutePath, {
        denyPatterns: getDenyPatterns(options),
        platform,
      }),
      relativePath: relative.value.normalizedPath,
      workspaceRoot: root,
    }),
  };
}

export function assertWorkspaceJoinedPath(
  workspaceRoot: unknown,
  relativePath: unknown,
  options: WorkspaceJoinOptions = {},
): WorkspaceJoinedPath {
  const result = joinWorkspaceRoot(workspaceRoot, relativePath, options);
  if (!result.ok) {
    throw new PathSecurityValidationError("Invalid workspace path", result.issues);
  }

  return result.value;
}

export function findDeniedPathPatterns(
  value: unknown,
  options: Pick<LocalRelativePathOptions, "denyPatterns"> = {},
): readonly PathDenyPatternMatch[] {
  if (typeof value !== "string") {
    return [];
  }

  return findDeniedPathPatternsFromSegments(
    collectDisplaySegments(value),
    getDenyPatterns(options),
  );
}

export function redactPathForDisplay(value: unknown, options: RedactPathOptions = {}): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "[path:invalid]";
  }

  const fingerprint = stablePathFingerprint(value);
  const fingerprintSuffix = fingerprint.slice("path_".length, "path_".length + 12);
  const segments = collectDisplaySegments(value);
  const denied = findDeniedPathPatternsFromSegments(segments, getDenyPatterns(options));
  if (denied.length > 0) {
    return `[restricted-path path:${fingerprintSuffix}]`;
  }

  if (segments.length === 0) {
    return `[path:${fingerprintSuffix}]`;
  }

  const keepSegments = clampInteger(options.keepSegments ?? 2, 1, 5);
  const kept = segments.slice(-keepSegments).map(sanitizeDisplaySegment);
  const hasHiddenPrefix = isAbsoluteLike(value.trim()) || segments.length > keepSegments;
  const prefix = hasHiddenPrefix ? ".../" : "";

  return `${prefix}${kept.join("/")} [path:${fingerprintSuffix}]`;
}

export function stablePathFingerprint(value: string): string {
  const normalized = normalizeSeparators(value.trim());
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;

  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= BigInt(normalized.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }

  return `path_${hash.toString(16).padStart(16, "0")}`;
}

export function sortPathSecurityIssues(
  issues: readonly PathSecurityIssue[],
): readonly PathSecurityIssue[] {
  return Object.freeze([...issues]
    .map((issue) => Object.freeze({ ...issue }))
    .sort(compareIssues));
}

function validateWorkspaceRoot(
  value: unknown,
  platform: PathPlatform,
  issuePath: string,
  issues: PathSecurityIssue[],
): string | undefined {
  if (typeof value !== "string") {
    issues.push(createIssue(issuePath, PATH_SECURITY_ISSUE_CODES.INVALID_TYPE, "must be a string"));
    return undefined;
  }

  const raw = value;
  const trimmed = raw.trim();
  validatePathStringBasics(raw, trimmed, issuePath, issues, false);
  if (URL_SCHEME_PATTERN.test(trimmed)) {
    issues.push(createIssue(issuePath, PATH_SECURITY_ISSUE_CODES.URL_PATH, "must be a local filesystem path"));
  }

  const pathApi = platform === "windows" ? win32 : posix;
  if (!pathApi.isAbsolute(trimmed)) {
    issues.push(createIssue(issuePath, PATH_SECURITY_ISSUE_CODES.ROOT_NOT_ABSOLUTE, "workspace root must be absolute"));
  }

  if (issues.some((issue) => issue.path === issuePath)) {
    return undefined;
  }

  return stripTrailingRootSeparator(pathApi.normalize(trimmed), platform);
}

function validatePathStringBasics(
  raw: string,
  trimmed: string,
  issuePath: string,
  issues: PathSecurityIssue[],
  allowEmpty: boolean,
): void {
  if (raw.length === 0 || (trimmed.length === 0 && !allowEmpty)) {
    issues.push(createIssue(issuePath, PATH_SECURITY_ISSUE_CODES.EMPTY_PATH, "must be non-empty"));
  }
  if (raw !== trimmed) {
    issues.push(createIssue(issuePath, PATH_SECURITY_ISSUE_CODES.SURROUNDING_WHITESPACE, "must not contain surrounding whitespace"));
  }
  if (CONTROL_CHARACTER_PATTERN.test(raw)) {
    issues.push(createIssue(issuePath, PATH_SECURITY_ISSUE_CODES.CONTROL_CHARACTER, "must not contain control characters"));
  }
}

function validateUnsafePathPrefix(
  trimmed: string,
  issuePath: string,
  issues: PathSecurityIssue[],
): void {
  if (URL_SCHEME_PATTERN.test(trimmed)) {
    issues.push(createIssue(issuePath, PATH_SECURITY_ISSUE_CODES.URL_PATH, "must not be a URL"));
  }
  if (UNC_PATH_PATTERN.test(trimmed)) {
    issues.push(createIssue(issuePath, PATH_SECURITY_ISSUE_CODES.UNC_PATH, "must not be a UNC path"));
  }
  if (DRIVE_PATH_PATTERN.test(trimmed)) {
    issues.push(createIssue(issuePath, PATH_SECURITY_ISSUE_CODES.DRIVE_PATH, "must not include a Windows drive prefix"));
  }
  if (DRIVE_ABSOLUTE_PATH_PATTERN.test(trimmed) || trimmed.startsWith("/") || trimmed.startsWith("\\")) {
    issues.push(createIssue(issuePath, PATH_SECURITY_ISSUE_CODES.ABSOLUTE_PATH, "must be relative"));
  }
  if (trimmed === "~" || trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    issues.push(createIssue(issuePath, PATH_SECURITY_ISSUE_CODES.HOME_PATH, "must not use a home-directory shortcut"));
  }
}

function collectRelativeSegments(
  value: string,
  issuePath: string,
  issues: PathSecurityIssue[],
): string[] {
  const segments: string[] = [];
  normalizeSeparators(value).split("/").forEach((segment, index) => {
    if (segment.length === 0 || segment === ".") {
      return;
    }

    if (segment === "..") {
      issues.push(createIssue(
        `${issuePath}.segments[${index}]`,
        PATH_SECURITY_ISSUE_CODES.TRAVERSAL,
        "must not contain parent-directory traversal",
      ));
      return;
    }

    segments.push(segment);
  });

  return segments;
}

function validateRelativeSegments(
  segments: readonly string[],
  issuePath: string,
  issues: PathSecurityIssue[],
): void {
  segments.forEach((segment, index) => {
    const segmentPath = `${issuePath}.segments[${index}]`;
    if (WINDOWS_UNSAFE_CHARACTER_PATTERN.test(segment)) {
      issues.push(createIssue(
        segmentPath,
        PATH_SECURITY_ISSUE_CODES.UNSAFE_CHARACTER,
        "must not contain characters unsafe on Windows filesystems",
      ));
    }
    if (WINDOWS_RESERVED_BASENAME_PATTERN.test(segment)) {
      issues.push(createIssue(
        segmentPath,
        PATH_SECURITY_ISSUE_CODES.WINDOWS_RESERVED_NAME,
        "must not use a reserved Windows device name",
      ));
    }
    if (segment.endsWith(".") || segment.endsWith(" ")) {
      issues.push(createIssue(
        segmentPath,
        PATH_SECURITY_ISSUE_CODES.WINDOWS_UNSAFE_SUFFIX,
        "must not end with a space or period",
      ));
    }
  });
}

function findDeniedPathPatternsFromSegments(
  segments: readonly string[],
  patterns: readonly PathDenyPattern[],
): readonly PathDenyPatternMatch[] {
  if (segments.length === 0) {
    return [];
  }

  const normalizedPath = segments.join("/");
  const lowerSegments = segments.map((segment) => segment.toLowerCase());
  const basename = segments.at(-1) ?? "";
  const matches: PathDenyPatternMatch[] = [];

  for (const pattern of patterns) {
    const segmentMatch = firstSegmentNameMatch(pattern.segmentNames, lowerSegments);
    const basenameMatch = firstRegexMatch(pattern.basenamePatterns, basename);
    const pathMatch = firstRegexMatch(pattern.pathPatterns, normalizedPath);
    const matched = segmentMatch ?? basenameMatch ?? pathMatch;
    if (matched !== undefined) {
      matches.push(Object.freeze({
        patternId: pattern.id,
        message: pattern.message,
        matched,
      }));
    }
  }

  return Object.freeze(matches.sort(compareDenyMatches));
}

function firstSegmentNameMatch(
  names: readonly string[] | undefined,
  lowerSegments: readonly string[],
): string | undefined {
  if (names === undefined) {
    return undefined;
  }

  const lowerNames = new Set(names.map((name) => name.toLowerCase()));
  return lowerSegments.find((segment) => lowerNames.has(segment));
}

function firstRegexMatch(patterns: readonly RegExp[] | undefined, value: string): string | undefined {
  if (patterns === undefined) {
    return undefined;
  }

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(value);
    if (match) {
      return match[0];
    }
  }

  return undefined;
}

function validationFailure(issues: readonly PathSecurityIssue[]): PathSecurityValidationFailure {
  return {
    ok: false,
    issues: sortPathSecurityIssues(issues),
  };
}

function createIssue(
  path: string,
  code: PathSecurityIssueCode,
  message: string,
  patternId?: string,
): PathSecurityIssue {
  return Object.freeze({
    code,
    path,
    message,
    ...(patternId === undefined ? {} : { patternId }),
  });
}

function formatIssue(issue: PathSecurityIssue): string {
  return `${issue.path} ${issue.code} ${issue.message}`;
}

function normalizeSeparators(value: string): string {
  return value.replace(/\\/g, "/");
}

function inferPlatform(value: unknown): PathPlatform {
  if (typeof value !== "string") {
    return "posix";
  }

  return DRIVE_PATH_PATTERN.test(value) || value.includes("\\") ? "windows" : "posix";
}

function getDenyPatterns(
  options: Pick<LocalRelativePathOptions, "denyPatterns">,
): readonly PathDenyPattern[] {
  return options.denyPatterns ?? DEFAULT_PATH_DENY_PATTERNS;
}

function toPlatformSeparators(value: string, platform: PathPlatform): string {
  return platform === "windows" ? value.replace(/\//g, "\\") : value;
}

function stripTrailingRootSeparator(value: string, platform: PathPlatform): string {
  const pathApi = platform === "windows" ? win32 : posix;
  const parsed = pathApi.parse(value);
  if (value === parsed.root) {
    return value;
  }

  return value.replace(/[\\/]+$/, "");
}

function collectDisplaySegments(value: string): string[] {
  let normalized = normalizeSeparators(value.trim());
  normalized = normalized.replace(/^[A-Za-z]:/, "");
  normalized = normalized.replace(/^\/\/[^/]+\/[^/]+/, "");

  return normalized
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".");
}

function sanitizeDisplaySegment(segment: string): string {
  const sanitized = segment.replace(DISPLAY_SEGMENT_PATTERN, "_").slice(0, 48);
  return sanitized.length === 0 ? "[segment]" : sanitized;
}

function isAbsoluteLike(value: string): boolean {
  return (
    value.startsWith("/") ||
    value.startsWith("\\") ||
    DRIVE_PATH_PATTERN.test(value) ||
    UNC_PATH_PATTERN.test(value)
  );
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isInteger(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function compareIssues(left: PathSecurityIssue, right: PathSecurityIssue): number {
  return (
    compareStrings(left.path, right.path) ||
    compareStrings(left.code, right.code) ||
    compareStrings(left.patternId ?? "", right.patternId ?? "") ||
    compareStrings(left.message, right.message)
  );
}

function compareDenyMatches(left: PathDenyPatternMatch, right: PathDenyPatternMatch): number {
  return (
    compareStrings(left.patternId, right.patternId) ||
    compareStrings(left.matched, right.matched) ||
    compareStrings(left.message, right.message)
  );
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
