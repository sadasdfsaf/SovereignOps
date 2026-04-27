import type { JsonValue } from "./client.ts";
import type { DeepReadonly } from "./workspace.ts";

export const LOCAL_INGEST_CONNECTOR_MANIFEST_KIND = "ingest.connector_manifest";
export const LOCAL_INGEST_CONNECTOR_MANIFEST_SCHEMA_VERSION =
  "ingest-connector-manifest/v1";

export const LOCAL_INGEST_CONNECTOR_MANIFEST_ERROR_CODES = Object.freeze({
  INVALID_INPUT: "LOCAL_INGEST_CONNECTOR_MANIFEST_INVALID_INPUT",
  UNSAFE_INPUT: "LOCAL_INGEST_CONNECTOR_MANIFEST_UNSAFE_INPUT",
});

export type LocalIngestConnectorManifestErrorCode =
  (typeof LOCAL_INGEST_CONNECTOR_MANIFEST_ERROR_CODES)[keyof typeof LOCAL_INGEST_CONNECTOR_MANIFEST_ERROR_CODES];

export type LocalIngestConnectorKind =
  | "markdown"
  | "json"
  | "csv"
  | "log"
  | "repository";

export type LocalIngestConnectorReadinessStatus =
  | "ready"
  | "attention"
  | "blocked";

export interface LocalIngestConnectorManifestIssue {
  readonly path: string;
  readonly message: string;
  readonly reason?: string;
}

export interface LocalIngestConnectorSafety {
  readonly localOnly: boolean;
  readonly untrustedByDefault: boolean;
  readonly trustedByDefault: boolean;
  readonly networkAccess: boolean;
  readonly durableWrites: boolean;
  readonly rawContentRetained: boolean;
  readonly rawSecretsRetained: boolean;
  readonly privatePathsBlocked: boolean;
  readonly rawSecretsBlocked: boolean;
  readonly readsFiles: boolean;
  readonly requiresApproval: boolean;
}

export interface LocalIngestConnectorProfile {
  readonly profileId: string;
  readonly connector: LocalIngestConnectorKind;
  readonly label: string;
  readonly description?: string;
  readonly sourceKinds: readonly string[];
  readonly mediaTypes: readonly string[];
  readonly fileExtensions: readonly string[];
  readonly sourceUriSchemes: readonly string[];
  readonly citationKinds: readonly string[];
  readonly validationModes: readonly string[];
  readonly safetyFindingKinds: readonly string[];
  readonly capabilities: readonly string[];
  readonly defaultOptions: Readonly<Record<string, JsonValue>>;
  readonly safety: LocalIngestConnectorSafety;
}

export interface LocalIngestConnectorManifest {
  readonly kind: typeof LOCAL_INGEST_CONNECTOR_MANIFEST_KIND;
  readonly schemaVersion: typeof LOCAL_INGEST_CONNECTOR_MANIFEST_SCHEMA_VERSION;
  readonly localOnly: boolean;
  readonly profileCount: number;
  readonly profiles: readonly LocalIngestConnectorProfile[];
}

export interface LocalIngestConnectorProfileReadiness {
  readonly profileId: string;
  readonly connector: LocalIngestConnectorKind;
  readonly status: LocalIngestConnectorReadinessStatus;
  readonly ready: boolean;
  readonly issueCount: number;
  readonly issueCodes: readonly string[];
}

export interface LocalIngestConnectorReadinessSummary {
  readonly kind: "ingest.connector_readiness";
  readonly schemaVersion: typeof LOCAL_INGEST_CONNECTOR_MANIFEST_SCHEMA_VERSION;
  readonly localOnly: boolean;
  readonly profileCount: number;
  readonly readyCount: number;
  readonly attentionCount: number;
  readonly blockedCount: number;
  readonly byStatus: Readonly<Record<LocalIngestConnectorReadinessStatus, number>>;
  readonly profiles: readonly LocalIngestConnectorProfileReadiness[];
}

export class LocalIngestConnectorManifestError extends TypeError {
  readonly code: LocalIngestConnectorManifestErrorCode;
  readonly issues: readonly LocalIngestConnectorManifestIssue[];

  constructor(
    code: LocalIngestConnectorManifestErrorCode,
    message: string,
    issues: readonly LocalIngestConnectorManifestIssue[] = [],
  ) {
    super(message);
    this.name = "LocalIngestConnectorManifestError";
    this.code = code;
    this.issues = deepFreezeClone(issues);
  }
}

const CONNECTOR_ORDER = Object.freeze([
  "markdown",
  "json",
  "csv",
  "log",
  "repository",
] as const satisfies readonly LocalIngestConnectorKind[]);

const CONNECTOR_RANK = new Map(
  CONNECTOR_ORDER.map((connector, index) => [connector, index]),
);

const SOURCE_URI_SCHEMES = Object.freeze([
  "file",
  "fixture",
  "local",
  "stdin",
  "workspace",
]);

const SAFE_CONNECTOR_SAFETY = Object.freeze({
  localOnly: true,
  untrustedByDefault: true,
  trustedByDefault: false,
  networkAccess: false,
  durableWrites: false,
  rawContentRetained: false,
  rawSecretsRetained: false,
  privatePathsBlocked: true,
  rawSecretsBlocked: true,
  readsFiles: true,
  requiresApproval: false,
} satisfies LocalIngestConnectorSafety);

const DEFAULT_PROFILES = deepFreeze([
  {
    profileId: "markdown",
    connector: "markdown",
    label: "Markdown",
    description: "Sectioned Markdown ingest with heading hierarchy and line citations.",
    sourceKinds: ["file"],
    mediaTypes: ["text/markdown"],
    fileExtensions: [".markdown", ".md"],
    sourceUriSchemes: SOURCE_URI_SCHEMES,
    citationKinds: ["line-range"],
    validationModes: ["safety-scan", "size-limit", "utf8-decode"],
    safetyFindingKinds: [
      "embedded-instruction-override",
      "embedded-prompt-reference",
      "raw-secret",
    ],
    capabilities: [
      "heading-hierarchy",
      "line-citations",
      "local-data-safety-findings",
      "normalization",
    ],
    defaultOptions: {
      trusted: false,
    },
    safety: SAFE_CONNECTOR_SAFETY,
  },
  {
    profileId: "json",
    connector: "json",
    label: "JSON",
    description: "Deterministic JSON leaf ingest with JSON path citations.",
    sourceKinds: ["file", "record"],
    mediaTypes: ["application/json"],
    fileExtensions: [".json"],
    sourceUriSchemes: SOURCE_URI_SCHEMES,
    citationKinds: ["json-path"],
    validationModes: ["safety-scan", "size-limit", "syntax"],
    safetyFindingKinds: [
      "embedded-instruction-override",
      "embedded-prompt-reference",
      "raw-secret",
    ],
    capabilities: [
      "deterministic-key-order",
      "json-path-citations",
      "local-data-safety-findings",
      "normalization",
    ],
    defaultOptions: {
      trusted: false,
    },
    safety: SAFE_CONNECTOR_SAFETY,
  },
  {
    profileId: "csv",
    connector: "csv",
    label: "CSV",
    description: "CSV row ingest with column metadata, validation, and row citations.",
    sourceKinds: ["file"],
    mediaTypes: ["text/csv"],
    fileExtensions: [".csv"],
    sourceUriSchemes: SOURCE_URI_SCHEMES,
    citationKinds: ["row", "table-cell"],
    validationModes: [
      "required-columns",
      "safety-scan",
      "size-limit",
      "unique-columns",
      "utf8-decode",
    ],
    safetyFindingKinds: [
      "embedded-instruction-override",
      "embedded-prompt-reference",
      "raw-secret",
    ],
    capabilities: [
      "duplicate-row-detection",
      "required-column-validation",
      "row-citations",
      "unique-column-validation",
    ],
    defaultOptions: {
      requiredColumns: [],
      trusted: false,
      uniqueColumns: [],
    },
    safety: SAFE_CONNECTOR_SAFETY,
  },
  {
    profileId: "log",
    connector: "log",
    label: "Log",
    description: "JSONL and plain text log ingest with stable line citations.",
    sourceKinds: ["file", "stream"],
    mediaTypes: ["application/jsonl", "application/x-ndjson", "text/plain"],
    fileExtensions: [".jsonl", ".log", ".ndjson", ".txt"],
    sourceUriSchemes: SOURCE_URI_SCHEMES,
    citationKinds: ["line-range", "timestamp"],
    validationModes: ["safety-scan", "size-limit", "utf8-decode"],
    safetyFindingKinds: [
      "embedded-instruction-override",
      "embedded-prompt-reference",
      "raw-secret",
    ],
    capabilities: [
      "jsonl-events",
      "line-citations",
      "plain-text-events",
      "validation-errors",
    ],
    defaultOptions: {
      trusted: false,
    },
    safety: SAFE_CONNECTOR_SAFETY,
  },
  {
    profileId: "repository",
    connector: "repository",
    label: "Repository",
    description: "Repository scan ingest with checksums and deterministic relative path order.",
    sourceKinds: ["directory"],
    mediaTypes: [
      "application/json",
      "application/toml",
      "application/x-ndjson",
      "application/xml",
      "application/yaml",
      "image/svg+xml",
      "text/css",
      "text/csv",
      "text/html",
      "text/javascript",
      "text/markdown",
      "text/plain",
      "text/typescript",
      "text/x-python",
      "text/x-rst",
    ],
    fileExtensions: [
      ".cfg",
      ".css",
      ".csv",
      ".htm",
      ".html",
      ".ini",
      ".js",
      ".json",
      ".jsonl",
      ".jsx",
      ".log",
      ".markdown",
      ".md",
      ".py",
      ".rst",
      ".svg",
      ".toml",
      ".ts",
      ".tsx",
      ".txt",
      ".xml",
      ".yaml",
      ".yml",
    ],
    sourceUriSchemes: ["file", "workspace"],
    citationKinds: ["file-path", "line-range"],
    validationModes: ["media-type", "path-boundary", "safety-scan", "size-limit"],
    safetyFindingKinds: [
      "embedded-instruction-override",
      "embedded-prompt-reference",
      "path-traversal",
      "private-path",
      "raw-secret",
    ],
    capabilities: [
      "checksum",
      "deterministic-relative-path-scan",
      "media-type-detection",
      "text-preview",
    ],
    defaultOptions: {
      includePaths: [],
      maxTextBytes: 5242880,
      trusted: false,
    },
    safety: {
      ...SAFE_CONNECTOR_SAFETY,
      requiresApproval: true,
    },
  },
] satisfies readonly LocalIngestConnectorProfile[]);

const DEFAULT_MANIFEST = deepFreeze({
  kind: LOCAL_INGEST_CONNECTOR_MANIFEST_KIND,
  schemaVersion: LOCAL_INGEST_CONNECTOR_MANIFEST_SCHEMA_VERSION,
  localOnly: true,
  profileCount: DEFAULT_PROFILES.length,
  profiles: DEFAULT_PROFILES,
} satisfies LocalIngestConnectorManifest);

const PROFILE_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,96}$/;
const RAW_LOCAL_PATH_PATTERN =
  /(?:\b[A-Za-z]:[\\/][^\s"',;)}\]]+|\\\\[^\\\s"',;)}\]]+[\\][^\s"',;)}\]]+|\b(?:\/Users|\/home|\/var|\/tmp|\/private|\/mnt|\/Volumes)\/[^\s"',;)}\]]+)/;
const PRIVATE_LOCATION_PATTERN =
  /(?:^|[\\/])\.codex-private(?:[\\/]|$)|\bprivate[-_\s]?plan(?:[-_\s]?pack)?\b/i;
const SECRET_VALUE_PATTERN =
  /\b(?:Bearer\s+[A-Za-z0-9._~+/=-]{8,}|(?:sk|rk|pk|tok|pat|npm|ghp|gho)_[A-Za-z0-9_-]{8,}|(?:sk|rk|pat|glpat|github_pat)-[A-Za-z0-9_-]{8,})\b/i;
const SECRET_ASSIGNMENT_PATTERN =
  /\b(?:api[-_]?key|apikey|authorization|credential|password|passphrase|secret|session[-_]?token|token)\s*[:=]\s*([^\s,;]+)/i;
const SENSITIVE_FIELD_PATTERN =
  /(?:authorization|api[-_]?key|apikey|auth|bearer|cookie|credential|jwt|password|passphrase|private[-_]?key|refresh[-_]?token|secret|session[-_]?token|signing[-_]?key|token)$/i;
const PATH_FIELD_PATTERN =
  /(?:^|_)(?:absolute_path|file_path|include_paths?|path|paths|relative_path|root_path|storage_path)$/;
const REDACTED_TOKEN_PATTERN = /^\[redacted(?::[A-Za-z0-9_-]+)*\]$/i;

export function listLocalIngestConnectorProfiles(
  manifest?: unknown,
): DeepReadonly<readonly LocalIngestConnectorProfile[]> {
  const profiles =
    manifest === undefined
      ? DEFAULT_MANIFEST.profiles
      : normalizeLocalIngestConnectorManifest(manifest).profiles;

  return deepFreezeClone(profiles);
}

export function getLocalIngestConnectorProfile(
  profileId: string,
  manifest?: unknown,
): DeepReadonly<LocalIngestConnectorProfile> | undefined {
  const normalizedProfileId = normalizeProfileId(profileId, "profileId");
  const profiles =
    manifest === undefined
      ? DEFAULT_MANIFEST.profiles
      : normalizeLocalIngestConnectorManifest(manifest).profiles;
  const connector = connectorFromAlias(normalizedProfileId);
  const profile = profiles.find((candidate) =>
    candidate.profileId === normalizedProfileId ||
    candidate.connector === connector
  );

  return profile === undefined ? undefined : deepFreezeClone(profile);
}

export function normalizeLocalIngestConnectorManifest(
  manifest: unknown = DEFAULT_MANIFEST,
): DeepReadonly<LocalIngestConnectorManifest> {
  if (manifest === DEFAULT_MANIFEST) {
    return deepFreezeClone(DEFAULT_MANIFEST);
  }

  const unsafeIssues: LocalIngestConnectorManifestIssue[] = [];
  collectUnsafeManifestStringIssues(manifest, "$", unsafeIssues);
  if (unsafeIssues.length > 0) {
    throw new LocalIngestConnectorManifestError(
      LOCAL_INGEST_CONNECTOR_MANIFEST_ERROR_CODES.UNSAFE_INPUT,
      "ingest connector manifest input must not include private paths or raw secrets",
      sortedIssues(unsafeIssues),
    );
  }

  if (!isRecord(manifest)) {
    throw invalidInput("manifest must be an object", "$");
  }

  const root = manifestRoot(manifest);
  const rootPath = root === manifest ? "$" : "$.manifest";
  const localOnly = readOptionalBoolean(fieldValue(root, "localOnly", "local_only")) ?? true;
  const profilesValue = fieldValue(
    root,
    "profiles",
    "connectorProfiles",
    "connector_profiles",
    "connectors",
  );
  if (!Array.isArray(profilesValue)) {
    throw invalidInput("manifest connector profiles must be an array", `${rootPath}.connectors`);
  }

  const profiles = profilesValue.map((profile, index) =>
    normalizeProfile(profile, `${rootPath}.connectors.${index}`)
  );
  assertUniqueProfileIds(profiles);
  const sortedProfiles = profiles.sort(compareProfiles);

  return deepFreezeClone({
    kind: LOCAL_INGEST_CONNECTOR_MANIFEST_KIND,
    schemaVersion: LOCAL_INGEST_CONNECTOR_MANIFEST_SCHEMA_VERSION,
    localOnly,
    profileCount: sortedProfiles.length,
    profiles: sortedProfiles,
  });
}

export function buildLocalIngestConnectorReadinessSummary(
  manifest?: unknown,
): DeepReadonly<LocalIngestConnectorReadinessSummary> {
  const normalized = manifest === undefined
    ? DEFAULT_MANIFEST
    : normalizeLocalIngestConnectorManifest(manifest);
  const profiles = normalized.profiles.map(readinessForProfile).sort(compareReadinessProfiles);
  const byStatus = {
    ready: profiles.filter((profile) => profile.status === "ready").length,
    attention: profiles.filter((profile) => profile.status === "attention").length,
    blocked: profiles.filter((profile) => profile.status === "blocked").length,
  } satisfies Record<LocalIngestConnectorReadinessStatus, number>;

  return deepFreezeClone({
    kind: "ingest.connector_readiness",
    schemaVersion: LOCAL_INGEST_CONNECTOR_MANIFEST_SCHEMA_VERSION,
    localOnly: normalized.localOnly,
    profileCount: profiles.length,
    readyCount: byStatus.ready,
    attentionCount: byStatus.attention,
    blockedCount: byStatus.blocked,
    byStatus,
    profiles,
  });
}

function normalizeProfile(value: unknown, path: string): LocalIngestConnectorProfile {
  if (!isRecord(value)) {
    throw invalidInput("connector profile must be an object", path);
  }

  const connector = normalizeConnectorForProfile(value, `${path}.connector`);
  const defaults = defaultProfile(connector);
  const profileId = normalizeProfileId(
    fieldValue(value, "profileId", "profile_id", "id", "connector_id") ?? connector,
    `${path}.profileId`,
  );
  const sourceKinds = normalizeStringListOrDefault(
    fieldValue(value, "sourceKinds", "source_kinds"),
    defaults.sourceKinds,
    `${path}.sourceKinds`,
    normalizeCapability,
  );
  const citationKinds = normalizeStringListOrDefault(
    fieldValue(value, "citationKinds", "citation_kinds", "citationCapabilities", "citation_capabilities"),
    defaults.citationKinds,
    `${path}.citationKinds`,
    normalizeCapability,
  );
  const validationModes = normalizeStringListOrDefault(
    fieldValue(value, "validationModes", "validation_modes"),
    defaults.validationModes,
    `${path}.validationModes`,
    normalizeCapability,
  );
  const safetyFindingKinds = normalizeSafetyFindingKinds(
    value,
    defaults.safetyFindingKinds,
    `${path}.safetyFindingKinds`,
  );
  const safetySource = optionalRecord(fieldValue(value, "safety"), `${path}.safety`);
  const safety = normalizeSafety(value, safetySource, defaults.safety);
  const capabilities = normalizeCapabilities(
    value,
    [...citationKinds, ...validationModes, ...safetyFindingKinds],
    defaults.capabilities,
    `${path}.capabilities`,
  );

  return {
    profileId,
    connector,
    label: readOptionalString(
      fieldValue(value, "label", "displayLabel", "display_name", "name", "title"),
    ) ?? defaultLabel(connector),
    description: readOptionalString(fieldValue(value, "description")),
    sourceKinds,
    mediaTypes: normalizeStringListOrDefault(
      fieldValue(value, "mediaTypes", "media_types"),
      defaults.mediaTypes,
      `${path}.mediaTypes`,
      normalizeMediaType,
    ),
    fileExtensions: normalizeStringListOrDefault(
      fieldValue(value, "fileExtensions", "file_extensions", "extensions"),
      defaults.fileExtensions,
      `${path}.fileExtensions`,
      normalizeFileExtension,
    ),
    sourceUriSchemes: normalizeSourceUriSchemesForProfile(
      fieldValue(value, "sourceUriSchemes", "source_uri_schemes"),
      sourceKinds,
      defaults.sourceUriSchemes,
      `${path}.sourceUriSchemes`,
    ),
    citationKinds,
    validationModes,
    safetyFindingKinds,
    capabilities,
    defaultOptions: normalizeDefaultOptions(
      fieldValue(value, "defaultOptions", "default_options", "options"),
      `${path}.defaultOptions`,
    ),
    safety,
  };
}

function normalizeSafety(
  profile: Readonly<Record<string, unknown>>,
  safety: Readonly<Record<string, unknown>> | undefined,
  defaults: LocalIngestConnectorSafety,
): LocalIngestConnectorSafety {
  const untrustedByDefault = readOptionalBoolean(
    firstDefined(
      fieldValue(safety, "untrustedByDefault", "untrusted_by_default"),
      fieldValue(profile, "defaultUntrusted", "default_untrusted"),
      fieldValue(profile, "contentUntrustedByDefault", "content_untrusted_by_default"),
    ),
  ) ?? defaults.untrustedByDefault;
  return {
    localOnly: readOptionalBoolean(
      firstDefined(
        fieldValue(safety, "localOnly", "local_only"),
        fieldValue(profile, "localOnly", "local_only"),
      ),
    ) ?? defaults.localOnly,
    untrustedByDefault,
    trustedByDefault: readOptionalBoolean(
      firstDefined(
        fieldValue(safety, "trustedByDefault", "trusted_by_default"),
        fieldValue(profile, "trustedByDefault", "trusted_by_default"),
      ),
    ) ?? !untrustedByDefault,
    networkAccess: readOptionalBoolean(
      firstDefined(
        fieldValue(safety, "networkAccess", "network_access"),
        fieldValue(profile, "networkAccess", "network_access"),
      ),
    ) ?? defaults.networkAccess,
    durableWrites: readOptionalBoolean(
      firstDefined(
        fieldValue(safety, "durableWrites", "durable_writes"),
        fieldValue(profile, "durableWrites", "durable_writes"),
      ),
    ) ?? defaults.durableWrites,
    rawContentRetained: readOptionalBoolean(
      firstDefined(
        fieldValue(safety, "rawContentRetained", "raw_content_retained"),
        fieldValue(safety, "rawContentStored", "raw_content_stored"),
        fieldValue(profile, "rawContentRetained", "raw_content_retained"),
        fieldValue(profile, "storesRawContent", "stores_raw_content"),
      ),
    ) ?? defaults.rawContentRetained,
    rawSecretsRetained: readOptionalBoolean(
      firstDefined(
        fieldValue(safety, "rawSecretsRetained", "raw_secrets_retained"),
        fieldValue(safety, "rawSecretsStored", "raw_secrets_stored"),
        fieldValue(profile, "rawSecretsRetained", "raw_secrets_retained"),
        fieldValue(profile, "rawSecretsStored", "raw_secrets_stored"),
      ),
    ) ?? defaults.rawSecretsRetained,
    privatePathsBlocked: readOptionalBoolean(
      firstDefined(
        fieldValue(safety, "privatePathsBlocked", "private_paths_blocked"),
        fieldValue(profile, "privatePathsBlocked", "private_paths_blocked"),
      ),
    ) ?? defaults.privatePathsBlocked,
    rawSecretsBlocked: readOptionalBoolean(
      firstDefined(
        fieldValue(safety, "rawSecretsBlocked", "raw_secrets_blocked"),
        fieldValue(profile, "rawSecretsBlocked", "raw_secrets_blocked"),
      ),
    ) ?? defaults.rawSecretsBlocked,
    readsFiles: readOptionalBoolean(
      firstDefined(
        fieldValue(safety, "readsFiles", "reads_files"),
        fieldValue(profile, "readsFiles", "reads_files"),
      ),
    ) ?? defaults.readsFiles,
    requiresApproval: readOptionalBoolean(
      firstDefined(
        fieldValue(safety, "requiresApproval", "requires_approval"),
        fieldValue(profile, "requiresApproval", "requires_approval"),
      ),
    ) ?? defaults.requiresApproval,
  };
}

function readinessForProfile(
  profile: LocalIngestConnectorProfile,
): LocalIngestConnectorProfileReadiness {
  const issueCodes = profileReadinessIssueCodes(profile);
  const blocked = issueCodes.some((code) =>
    code === "non-local-connector" ||
    code === "trusted-by-default" ||
    code === "network-access-enabled" ||
    code === "durable-writes-enabled" ||
    code === "raw-content-retained" ||
    code === "raw-secrets-retained" ||
    code === "private-paths-not-blocked" ||
    code === "raw-secrets-not-blocked"
  );
  const status: LocalIngestConnectorReadinessStatus =
    blocked ? "blocked" : issueCodes.length > 0 ? "attention" : "ready";

  return {
    profileId: profile.profileId,
    connector: profile.connector,
    status,
    ready: status === "ready",
    issueCount: issueCodes.length,
    issueCodes,
  };
}

function profileReadinessIssueCodes(profile: LocalIngestConnectorProfile): string[] {
  const issues: string[] = [];
  if (!profile.safety.localOnly) {
    issues.push("non-local-connector");
  }
  if (profile.safety.trustedByDefault) {
    issues.push("trusted-by-default");
  }
  if (profile.safety.networkAccess) {
    issues.push("network-access-enabled");
  }
  if (profile.safety.durableWrites) {
    issues.push("durable-writes-enabled");
  }
  if (profile.safety.rawContentRetained) {
    issues.push("raw-content-retained");
  }
  if (profile.safety.rawSecretsRetained) {
    issues.push("raw-secrets-retained");
  }
  if (!profile.safety.privatePathsBlocked) {
    issues.push("private-paths-not-blocked");
  }
  if (!profile.safety.rawSecretsBlocked) {
    issues.push("raw-secrets-not-blocked");
  }
  if (profile.mediaTypes.length === 0) {
    issues.push("missing-media-types");
  }
  if (profile.sourceKinds.length === 0) {
    issues.push("missing-source-kinds");
  }
  if (profile.fileExtensions.length === 0) {
    issues.push("missing-file-extensions");
  }
  if (profile.sourceUriSchemes.length === 0) {
    issues.push("missing-source-uri-schemes");
  }
  if (profile.citationKinds.length === 0) {
    issues.push("missing-citation-kinds");
  }
  if (profile.validationModes.length === 0) {
    issues.push("missing-validation-modes");
  }
  if (profile.capabilities.length === 0) {
    issues.push("missing-capabilities");
  }
  return issues;
}

function collectUnsafeManifestStringIssues(
  value: unknown,
  path: string,
  issues: LocalIngestConnectorManifestIssue[],
  keyHint = "",
  seen: WeakSet<object> = new WeakSet<object>(),
): void {
  if (typeof value === "string") {
    const reason = unsafeStringReason(value, keyHint);
    if (reason !== undefined) {
      issues.push({
        path,
        message: "manifest string must be redacted and local-safe",
        reason,
      });
    }
    return;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
    value.forEach((item, index) =>
      collectUnsafeManifestStringIssues(item, `${path}.${index}`, issues, keyHint, seen)
    );
    seen.delete(value);
    return;
  }

  if (isRecord(value)) {
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
    for (const [key, nested] of Object.entries(value)) {
      collectUnsafeManifestStringIssues(nested, `${path}.${key}`, issues, key, seen);
    }
    seen.delete(value);
  }
}

function unsafeStringReason(value: string, keyHint: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0 || isRedactedToken(trimmed)) {
    return undefined;
  }

  const key = normalizeToken(keyHint);
  if (key.includes("checksum") || key.includes("fingerprint")) {
    return undefined;
  }
  if (PRIVATE_LOCATION_PATTERN.test(trimmed)) {
    return "private_path";
  }
  if (PATH_FIELD_PATTERN.test(key) && hasTraversalSegment(trimmed)) {
    return "path_traversal";
  }
  if (RAW_LOCAL_PATH_PATTERN.test(trimmed)) {
    return "raw_local_path";
  }
  if (SENSITIVE_FIELD_PATTERN.test(keyHint)) {
    return "raw_secret";
  }

  const assignedSecret = SECRET_ASSIGNMENT_PATTERN.exec(trimmed);
  if (assignedSecret !== null && !isRedactedToken(assignedSecret[1])) {
    return "raw_secret";
  }
  if (SECRET_VALUE_PATTERN.test(trimmed)) {
    return "raw_secret";
  }
  return undefined;
}

function normalizeDefaultOptions(
  value: unknown,
  path: string,
): Readonly<Record<string, JsonValue>> {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    throw invalidInput("defaultOptions must be an object", path);
  }
  return normalizeJsonRecord(value, path);
}

function normalizeJsonValue(
  value: unknown,
  path: string,
  seen: WeakSet<object>,
): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw invalidInput("value must be a finite number", path);
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw invalidInput("value must not contain circular references", path);
    }
    seen.add(value);
    const normalized = value.map((item, index) =>
      normalizeJsonValue(item, `${path}.${index}`, seen)
    );
    seen.delete(value);
    return normalized;
  }
  if (isRecord(value)) {
    if (seen.has(value)) {
      throw invalidInput("value must not contain circular references", path);
    }
    seen.add(value);
    const normalized = normalizeJsonRecord(value, path, seen);
    seen.delete(value);
    return normalized;
  }
  throw invalidInput("value must be JSON-compatible", path);
}

function normalizeJsonRecord(
  value: Readonly<Record<string, unknown>>,
  path: string,
  seen: WeakSet<object> = new WeakSet<object>(),
): Readonly<Record<string, JsonValue>> {
  const entries = Object.keys(value)
    .sort(compareStrings)
    .map((key) => [
      toCamelCase(key),
      normalizeJsonValue(value[key], `${path}.${key}`, seen),
    ] as const);
  return Object.fromEntries(entries);
}

function normalizeStringList(
  value: unknown,
  path: string,
  normalize: (value: string) => string,
): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw invalidInput("value must be an array", path);
  }
  return sortedUnique(value.map((item, index) => {
    if (typeof item !== "string") {
      throw invalidInput("array item must be a string", `${path}.${index}`);
    }
    const normalized = normalize(item);
    if (normalized.length === 0) {
      throw invalidInput("array item must be a non-empty string", `${path}.${index}`);
    }
    return normalized;
  }));
}

function normalizeStringListOrDefault(
  value: unknown,
  fallback: readonly string[],
  path: string,
  normalize: (value: string) => string,
): string[] {
  return value === undefined
    ? [...fallback]
    : normalizeStringList(value, path, normalize);
}

function normalizeSourceUriSchemesForProfile(
  value: unknown,
  sourceKinds: readonly string[],
  fallback: readonly string[],
  path: string,
): string[] {
  if (value !== undefined) {
    return normalizeStringList(value, path, normalizeSourceUriScheme);
  }

  const schemes = sourceKinds.flatMap((kind) => {
    switch (kind) {
      case "directory":
      case "file":
        return ["file"];
      case "record":
        return ["local"];
      case "stream":
        return ["stdin"];
      default:
        return [];
    }
  });
  return schemes.length > 0 ? sortedUnique(schemes) : [...fallback];
}

function normalizeSafetyFindingKinds(
  profile: Readonly<Record<string, unknown>>,
  fallback: readonly string[],
  path: string,
): string[] {
  const direct = fieldValue(profile, "safetyFindingKinds", "safety_finding_kinds");
  if (direct !== undefined) {
    return normalizeStringList(direct, path, normalizeCapability);
  }

  const findings = fieldValue(profile, "safetyFindings", "safety_findings");
  if (findings === undefined) {
    return [...fallback];
  }
  if (!Array.isArray(findings)) {
    throw invalidInput("safety findings must be an array", path);
  }

  return sortedUnique(findings.map((finding, index) => {
    if (typeof finding === "string") {
      return normalizeCapability(finding);
    }
    if (isRecord(finding) && typeof finding.code === "string") {
      return normalizeCapability(finding.code);
    }
    throw invalidInput("safety finding must be a string or object with code", `${path}.${index}`);
  }));
}

function normalizeCapabilities(
  profile: Readonly<Record<string, unknown>>,
  derived: readonly string[],
  fallback: readonly string[],
  path: string,
): string[] {
  const direct = fieldValue(profile, "capabilities");
  if (direct !== undefined) {
    return normalizeStringList(direct, path, normalizeCapability);
  }

  const normalized = sortedUnique(derived.map(normalizeCapability).filter((value) => value.length > 0));
  return normalized.length > 0 ? normalized : [...fallback];
}

function defaultProfile(connector: LocalIngestConnectorKind): LocalIngestConnectorProfile {
  const profile = DEFAULT_PROFILES.find((candidate) => candidate.connector === connector);
  if (profile === undefined) {
    throw invalidInput("connector defaults are unavailable", "$.connector");
  }
  return profile;
}

function normalizeConnector(value: unknown, path: string): LocalIngestConnectorKind {
  if (typeof value !== "string") {
    throw invalidInput("connector must be a string", path);
  }
  const connector = connectorFromAlias(value);
  if (connector === undefined) {
    throw invalidInput("connector must be markdown, json, csv, log, or repository", path);
  }
  return connector;
}

function normalizeConnectorForProfile(
  profile: Readonly<Record<string, unknown>>,
  path: string,
): LocalIngestConnectorKind {
  const explicit = fieldValue(profile, "connector", "connectorType", "connector_type");
  const id = fieldValue(profile, "id", "connector_id", "profileId", "profile_id");
  const candidate = explicit ?? id;
  if (typeof candidate === "string") {
    const connector = connectorFromAlias(candidate);
    if (connector !== undefined) {
      return connector;
    }
  }

  const inferred = inferConnectorFromProfile(profile);
  if (inferred !== undefined) {
    return inferred;
  }

  throw invalidInput("connector must be markdown, json, csv, log, or repository", path);
}

function connectorFromAlias(value: string): LocalIngestConnectorKind | undefined {
  const normalized = normalizeToken(value);
  switch (normalized) {
    case "markdown":
    case "md":
    case "markdown_structured":
      return "markdown";
    case "json":
    case "json_structured":
      return "json";
    case "csv":
    case "csv_structured":
      return "csv";
    case "log":
    case "logs":
    case "jsonl":
    case "jsonl_log":
    case "plain_text_log":
    case "text_log":
      return "log";
    case "repository":
    case "repo":
    case "repository_scan":
    case "search_index":
      return "repository";
    default:
      return undefined;
  }
}

function inferConnectorFromProfile(
  profile: Readonly<Record<string, unknown>>,
): LocalIngestConnectorKind | undefined {
  const id = normalizeToken(readOptionalString(fieldValue(profile, "id", "connector_id")));
  const capabilities = stringListField(profile, "capabilities").map(normalizeCapability);
  const mediaTypes = stringListField(profile, "mediaTypes", "media_types").map(normalizeMediaType);
  const sourceKinds = stringListField(profile, "sourceKinds", "source_kinds").map(normalizeCapability);

  if (
    id.includes("repository") ||
    id.includes("workspace_index") ||
    id.includes("search_index") ||
    sourceKinds.includes("directory") ||
    capabilities.includes("repository-scan")
  ) {
    return "repository";
  }
  if (
    id.includes("log") ||
    mediaTypes.includes("application/jsonl") ||
    mediaTypes.includes("application/x-ndjson")
  ) {
    return "log";
  }
  if (mediaTypes.includes("text/csv")) {
    return "csv";
  }
  if (mediaTypes.includes("application/json") && !mediaTypes.includes("text/markdown")) {
    return "json";
  }
  if (mediaTypes.includes("text/markdown") || mediaTypes.includes("text/plain")) {
    return "markdown";
  }
  return undefined;
}

function normalizeProfileId(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw invalidInput("profileId must be a string", path);
  }
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!PROFILE_ID_PATTERN.test(normalized)) {
    throw invalidInput("profileId must be a safe non-empty identifier", path);
  }
  return normalized;
}

function normalizeMediaType(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeFileExtension(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) {
    return "";
  }
  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}

function normalizeSourceUriScheme(value: string): string {
  return value.trim().toLowerCase().replace(/:\/{0,2}$/, "");
}

function normalizeCapability(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function assertUniqueProfileIds(profiles: readonly LocalIngestConnectorProfile[]): void {
  const seen = new Set<string>();
  for (const profile of profiles) {
    if (seen.has(profile.profileId)) {
      throw invalidInput(`duplicate connector profile id: ${profile.profileId}`, "$.profiles");
    }
    seen.add(profile.profileId);
  }
}

function sortedIssues(
  issues: readonly LocalIngestConnectorManifestIssue[],
): LocalIngestConnectorManifestIssue[] {
  return [...issues].sort((left, right) =>
    compareStrings(left.path, right.path) ||
    compareStrings(left.reason ?? "", right.reason ?? "")
  );
}

function sortedUnique(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort(compareStrings);
}

function compareProfiles(
  left: LocalIngestConnectorProfile,
  right: LocalIngestConnectorProfile,
): number {
  return (CONNECTOR_RANK.get(left.connector) ?? 99) -
    (CONNECTOR_RANK.get(right.connector) ?? 99) ||
    compareStrings(left.profileId, right.profileId);
}

function compareReadinessProfiles(
  left: LocalIngestConnectorProfileReadiness,
  right: LocalIngestConnectorProfileReadiness,
): number {
  return (CONNECTOR_RANK.get(left.connector) ?? 99) -
    (CONNECTOR_RANK.get(right.connector) ?? 99) ||
    compareStrings(left.profileId, right.profileId);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function defaultLabel(connector: LocalIngestConnectorKind): string {
  switch (connector) {
    case "csv":
      return "CSV";
    case "json":
      return "JSON";
    case "log":
      return "Log";
    case "markdown":
      return "Markdown";
    case "repository":
      return "Repository";
  }
}

function readOptionalString(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw invalidInput("value must be a string", "$");
  }
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw invalidInput("value must be a boolean", "$");
  }
  return value;
}

function optionalRecord(
  value: unknown,
  path: string,
): Readonly<Record<string, unknown>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw invalidInput("value must be an object", path);
  }
  return value;
}

function manifestRoot(record: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const nested = fieldValue(record, "manifest", "connectorManifest", "connector_manifest");
  if (nested === undefined) {
    return record;
  }
  if (!isRecord(nested)) {
    throw invalidInput("manifest must be an object", "$.manifest");
  }
  return nested;
}

function fieldValue(
  record: Readonly<Record<string, unknown>> | undefined,
  ...keys: readonly string[]
): unknown {
  if (record === undefined) {
    return undefined;
  }
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return record[key];
    }
  }
  return undefined;
}

function stringListField(
  record: Readonly<Record<string, unknown>>,
  ...keys: readonly string[]
): string[] {
  const value = fieldValue(record, ...keys);
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function firstDefined(...values: readonly unknown[]): unknown {
  return values.find((value) => value !== undefined);
}

function toCamelCase(value: string): string {
  return value.replace(/[_-]([a-z0-9])/g, (_match, char: string) => char.toUpperCase());
}

function normalizeToken(value: string | undefined): string {
  return value === undefined
    ? ""
    : value
      .trim()
      .replace(/([a-z])([A-Z])/g, "$1_$2")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
}

function hasTraversalSegment(value: string): boolean {
  return value
    .replace(/\\/g, "/")
    .split("/")
    .includes("..");
}

function isRedactedToken(value: string): boolean {
  return (
    value === "[REDACTED]" ||
    value === "[redacted-path]" ||
    value === "[redacted-secret]" ||
    REDACTED_TOKEN_PATTERN.test(value)
  );
}

function invalidInput(
  message: string,
  path: string,
): LocalIngestConnectorManifestError {
  return new LocalIngestConnectorManifestError(
    LOCAL_INGEST_CONNECTOR_MANIFEST_ERROR_CODES.INVALID_INPUT,
    message,
    [{ path, message }],
  );
}

function deepFreezeClone<T>(value: T): DeepReadonly<T> {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
