import type {
  GatewayResourceContent,
  GatewayResourceDefinition,
  GatewayResourceRegistryLike,
  GatewayResourceTrust,
  GatewayToolMetadata,
} from "./adapter.ts";
import {
  LOCAL_INGEST_CONNECTOR_MANIFEST_ERROR_CODES,
  LOCAL_INGEST_CONNECTOR_MANIFEST_KIND,
  type LocalIngestConnectorManifest,
  type LocalIngestConnectorManifestError,
  type LocalIngestConnectorProfile,
  buildLocalIngestConnectorReadinessSummary,
  getLocalIngestConnectorProfile,
  normalizeLocalIngestConnectorManifest,
} from "../../../packages/sdk-js/src/localIngestConnectorManifest.ts";

export const INGEST_CONNECTOR_RESOURCE_URIS = deepFreeze({
  manifest: "sovereignops://ingest/connectors/manifest",
  connectorPrefix: "sovereignops://ingest/connectors/",
});

export const INGEST_CONNECTOR_PREVIEW_TOOL_NAME =
  "ingest_connector.preview_manifest";

export const INGEST_CONNECTOR_RESOURCE_MIME_TYPE = "application/json";

export const INGEST_CONNECTOR_LOCAL_SAFETY_METADATA = deepFreeze({
  localOnly: true,
  networkAccess: false,
  durableWrites: false,
  untrustedByDefault: true,
  trustedByDefault: false,
  rawContentRetained: false,
  rawSecretsRetained: false,
  privatePathsBlocked: true,
  rawSecretsBlocked: true,
});

export interface IngestConnectorResourceOptions {
  readonly manifest?: unknown;
}

export interface IngestConnectorPreviewManifestInput
  extends IngestConnectorResourceOptions {
  readonly connectorId?: string;
  readonly includeManifest?: boolean;
  readonly includeReadiness?: boolean;
}

export interface IngestConnectorPreviewToolDescriptor
  extends GatewayToolMetadata {
  summary: string;
  annotations: typeof INGEST_CONNECTOR_LOCAL_SAFETY_METADATA;
}

export type IngestConnectorResourceErrorCode =
  | "connector_not_found"
  | "invalid_input"
  | "invalid_manifest"
  | "unsafe_manifest"
  | "unsafe_output";

export interface IngestConnectorResourceIssue {
  readonly path: string;
  readonly message: string;
  readonly reason?: string;
}

export class IngestConnectorResourceError extends Error {
  readonly code: IngestConnectorResourceErrorCode;
  readonly issues: readonly IngestConnectorResourceIssue[];

  constructor(
    code: IngestConnectorResourceErrorCode,
    message: string,
    issues: readonly IngestConnectorResourceIssue[] = [],
  ) {
    super(message);
    this.name = "IngestConnectorResourceError";
    this.code = code;
    this.issues = deepFreezeClone(issues);
  }
}

export const INGEST_CONNECTOR_PREVIEW_TOOL_DESCRIPTOR: IngestConnectorPreviewToolDescriptor =
  deepFreeze({
    name: INGEST_CONNECTOR_PREVIEW_TOOL_NAME,
    description:
      "Preview the local ingest connector manifest without network access or durable writes.",
    summary:
      "Returns local manifest counts, readiness, and an optional connector profile with no side effects.",
    annotations: INGEST_CONNECTOR_LOCAL_SAFETY_METADATA,
    inputSchema: {
      type: "object",
      properties: {
        connectorId: {
          type: "string",
          description: "Optional connector profile id or connector alias to preview.",
        },
        includeManifest: {
          type: "boolean",
          description: "Whether to include the normalized local manifest in the preview.",
        },
        includeReadiness: {
          type: "boolean",
          description: "Whether to include readiness counts and profile statuses.",
        },
        manifest: {
          type: "object",
          description:
            "Optional manifest-like object to normalize before previewing locally.",
        },
      },
      additionalProperties: false,
    },
  });

export const INGEST_CONNECTOR_MCP_TOOL_METADATA =
  INGEST_CONNECTOR_PREVIEW_TOOL_DESCRIPTOR;

export class IngestConnectorResourceRegistry
  implements GatewayResourceRegistryLike
{
  readonly #resources: Map<string, GatewayResourceDefinition>;

  constructor(options: IngestConnectorResourceOptions = {}) {
    this.#resources = new Map(
      createIngestConnectorResourceDefinitions(options).map((resource) => [
        resource.uri,
        resource,
      ]),
    );
  }

  list(): readonly GatewayResourceDefinition[] {
    return [...this.#resources.values()].map(cloneResourceDefinition);
  }

  get(uri: string): GatewayResourceDefinition | undefined {
    const resource = this.#resources.get(uri);
    return resource ? cloneResourceDefinition(resource) : undefined;
  }
}

export function createIngestConnectorResourceRegistry(
  options: IngestConnectorResourceOptions = {},
): IngestConnectorResourceRegistry {
  return new IngestConnectorResourceRegistry(options);
}

export function createIngestConnectorResourceDefinitions(
  options: IngestConnectorResourceOptions = {},
): readonly GatewayResourceDefinition[] {
  const manifest = normalizeManifestForGateway(options.manifest);
  const resources = [
    createManifestResource(manifest),
    ...manifest.profiles.map((profile) => createConnectorResource(manifest, profile)),
  ];

  return deepFreeze(resources);
}

export function ingestConnectorProfileResourceUri(profileId: string): string {
  const normalized = encodeURIComponent(safeProfileId(profileId));
  return `${INGEST_CONNECTOR_RESOURCE_URIS.connectorPrefix}${normalized}`;
}

export function previewIngestConnectorManifest(
  input: IngestConnectorPreviewManifestInput = {},
): unknown {
  const normalizedInput = normalizePreviewInput(input);
  const manifest = normalizeManifestForGateway(normalizedInput.manifest);
  const readiness = buildLocalIngestConnectorReadinessSummary(manifest);
  const profile = normalizedInput.connectorId
    ? getPreviewProfile(normalizedInput.connectorId, manifest)
    : undefined;
  const summary = {
    profileCount: manifest.profileCount,
    readyCount: readiness.readyCount,
    attentionCount: readiness.attentionCount,
    blockedCount: readiness.blockedCount,
    profileIds: manifest.profiles.map((candidate) => candidate.profileId),
    selectedProfileId: profile?.profileId,
  };
  const payload = pruneUndefined({
    kind: INGEST_CONNECTOR_PREVIEW_TOOL_NAME,
    schemaVersion: manifest.schemaVersion,
    localOnly: true,
    networkAccess: false,
    durableWrites: false,
    annotations: INGEST_CONNECTOR_LOCAL_SAFETY_METADATA,
    summary,
    profile,
    readiness: normalizedInput.includeReadiness ? readiness : undefined,
    manifest: normalizedInput.includeManifest ? manifest : undefined,
  });

  assertSafePayload(payload);
  return deepFreezeClone(payload);
}

export const createIngestConnectorPreviewManifest =
  previewIngestConnectorManifest;

function createManifestResource(
  manifest: LocalIngestConnectorManifest,
): GatewayResourceDefinition {
  return freezeResourceDefinition({
    uri: INGEST_CONNECTOR_RESOURCE_URIS.manifest,
    name: "Ingest Connector Manifest",
    description:
      "Normalized local ingest connector manifest and readiness metadata.",
    mimeType: INGEST_CONNECTOR_RESOURCE_MIME_TYPE,
    capability: "read_object",
    metadata: {
      category: "ingest-connectors",
      resourceKind: "ingest.connector_manifest",
      localOnly: true,
      networkAccess: false,
      durableWrites: false,
      untrustedByDefault: true,
    },
    read: () =>
      jsonResourceContent(
        INGEST_CONNECTOR_RESOURCE_URIS.manifest,
        "trusted",
        createManifestPayload(manifest),
      ),
  });
}

function createConnectorResource(
  manifest: LocalIngestConnectorManifest,
  profile: LocalIngestConnectorProfile,
): GatewayResourceDefinition {
  const uri = ingestConnectorProfileResourceUri(profile.profileId);
  return freezeResourceDefinition({
    uri,
    name: `Ingest Connector: ${profile.label}`,
    description: profile.description ?? `Local ${profile.connector} ingest connector profile.`,
    mimeType: INGEST_CONNECTOR_RESOURCE_MIME_TYPE,
    capability: "read_object",
    metadata: {
      category: "ingest-connectors",
      resourceKind: "ingest.connector_profile",
      profileId: profile.profileId,
      connector: profile.connector,
      localOnly: profile.safety.localOnly,
      networkAccess: profile.safety.networkAccess,
      durableWrites: profile.safety.durableWrites,
      untrustedByDefault: profile.safety.untrustedByDefault,
      requiresApproval: profile.safety.requiresApproval,
    },
    read: () =>
      jsonResourceContent(
        uri,
        "trusted",
        createConnectorPayload(manifest, profile, uri),
      ),
  });
}

function createManifestPayload(manifest: LocalIngestConnectorManifest): unknown {
  const readiness = buildLocalIngestConnectorReadinessSummary(manifest);

  return {
    kind: "mcp.resource",
    resourceKind: "ingest.connector_manifest",
    uri: INGEST_CONNECTOR_RESOURCE_URIS.manifest,
    name: "Ingest Connector Manifest",
    mimeType: INGEST_CONNECTOR_RESOURCE_MIME_TYPE,
    metadata: {
      schemaVersion: manifest.schemaVersion,
      manifestKind: LOCAL_INGEST_CONNECTOR_MANIFEST_KIND,
      profileCount: manifest.profileCount,
      source: "packages/sdk-js/localIngestConnectorManifest",
    },
    annotations: INGEST_CONNECTOR_LOCAL_SAFETY_METADATA,
    readiness,
    connectorResources: manifest.profiles.map((profile) => ({
      profileId: profile.profileId,
      connector: profile.connector,
      uri: ingestConnectorProfileResourceUri(profile.profileId),
    })),
    manifest,
  };
}

function createConnectorPayload(
  manifest: LocalIngestConnectorManifest,
  profile: LocalIngestConnectorProfile,
  uri: string,
): unknown {
  return {
    kind: "mcp.resource",
    resourceKind: "ingest.connector_profile",
    uri,
    name: `Ingest Connector: ${profile.label}`,
    mimeType: INGEST_CONNECTOR_RESOURCE_MIME_TYPE,
    metadata: {
      schemaVersion: manifest.schemaVersion,
      manifestUri: INGEST_CONNECTOR_RESOURCE_URIS.manifest,
      profileId: profile.profileId,
      connector: profile.connector,
    },
    annotations: {
      ...INGEST_CONNECTOR_LOCAL_SAFETY_METADATA,
      localOnly: profile.safety.localOnly,
      networkAccess: profile.safety.networkAccess,
      durableWrites: profile.safety.durableWrites,
      untrustedByDefault: profile.safety.untrustedByDefault,
      trustedByDefault: profile.safety.trustedByDefault,
      rawContentRetained: profile.safety.rawContentRetained,
      rawSecretsRetained: profile.safety.rawSecretsRetained,
      privatePathsBlocked: profile.safety.privatePathsBlocked,
      rawSecretsBlocked: profile.safety.rawSecretsBlocked,
      readsFiles: profile.safety.readsFiles,
      requiresApproval: profile.safety.requiresApproval,
    },
    profile,
  };
}

function jsonResourceContent(
  uri: string,
  trust: GatewayResourceTrust,
  payload: unknown,
): GatewayResourceContent {
  const text = serializeSafePayload(payload);

  return {
    uri,
    mimeType: INGEST_CONNECTOR_RESOURCE_MIME_TYPE,
    text,
    trust,
  };
}

function serializeSafePayload(payload: unknown): string {
  assertSafePayload(payload);
  const text = JSON.stringify(payload, null, 2);
  if (typeof text !== "string") {
    throw new IngestConnectorResourceError(
      "unsafe_output",
      "Ingest connector resource output could not be serialized safely.",
    );
  }
  assertSafeText(text);
  return text;
}

function normalizeManifestForGateway(manifest: unknown): LocalIngestConnectorManifest {
  try {
    return normalizeLocalIngestConnectorManifest(manifest);
  } catch (error) {
    throw safeManifestError(error);
  }
}

function getPreviewProfile(
  connectorId: string,
  manifest: LocalIngestConnectorManifest,
): LocalIngestConnectorProfile {
  let profile: LocalIngestConnectorProfile | undefined;
  try {
    profile = getLocalIngestConnectorProfile(connectorId, manifest);
  } catch {
    throw new IngestConnectorResourceError(
      "invalid_input",
      "Connector id must be a safe non-empty identifier.",
    );
  }

  if (!profile) {
    throw new IngestConnectorResourceError(
      "connector_not_found",
      "No ingest connector profile matched the requested connector id.",
    );
  }

  return profile;
}

function normalizePreviewInput(
  input: IngestConnectorPreviewManifestInput,
): Required<Pick<
  IngestConnectorPreviewManifestInput,
  "includeManifest" | "includeReadiness"
>> &
  Pick<IngestConnectorPreviewManifestInput, "connectorId" | "manifest"> {
  if (!isPlainRecord(input)) {
    throw new IngestConnectorResourceError(
      "invalid_input",
      "Ingest connector preview input must be an object.",
    );
  }

  const allowedKeys = new Set([
    "connectorId",
    "includeManifest",
    "includeReadiness",
    "manifest",
  ]);
  const unexpected = Object.keys(input).filter((key) => !allowedKeys.has(key));
  if (unexpected.length > 0) {
    throw new IngestConnectorResourceError(
      "invalid_input",
      "Ingest connector preview input contains unsupported fields.",
      unexpected.map((key) => ({
        path: `$.${key}`,
        message: "unsupported preview input field",
      })),
    );
  }

  if (
    input.connectorId !== undefined &&
    (typeof input.connectorId !== "string" || input.connectorId.trim().length === 0)
  ) {
    throw new IngestConnectorResourceError(
      "invalid_input",
      "Connector id must be a safe non-empty identifier.",
    );
  }
  if (
    input.includeManifest !== undefined &&
    typeof input.includeManifest !== "boolean"
  ) {
    throw new IngestConnectorResourceError(
      "invalid_input",
      "includeManifest must be a boolean when provided.",
    );
  }
  if (
    input.includeReadiness !== undefined &&
    typeof input.includeReadiness !== "boolean"
  ) {
    throw new IngestConnectorResourceError(
      "invalid_input",
      "includeReadiness must be a boolean when provided.",
    );
  }

  return {
    connectorId: input.connectorId,
    includeManifest: input.includeManifest ?? true,
    includeReadiness: input.includeReadiness ?? true,
    manifest: input.manifest,
  };
}

function safeProfileId(profileId: string): string {
  if (typeof profileId !== "string" || profileId.trim().length === 0) {
    throw new IngestConnectorResourceError(
      "invalid_input",
      "Connector profile id must be a safe non-empty identifier.",
    );
  }

  return profileId.trim();
}

function safeManifestError(error: unknown): IngestConnectorResourceError {
  if (isLocalIngestConnectorManifestError(error)) {
    const unsafe =
      error.code === LOCAL_INGEST_CONNECTOR_MANIFEST_ERROR_CODES.UNSAFE_INPUT;
    return new IngestConnectorResourceError(
      unsafe ? "unsafe_manifest" : "invalid_manifest",
      unsafe
        ? "Ingest connector manifest input contains unsafe local or sensitive markers."
        : "Ingest connector manifest input is invalid.",
      error.issues.map((issue) => ({
        path: issue.path,
        message: unsafe ? "manifest value must be redacted or removed" : "manifest value is invalid",
        reason: issue.reason,
      })),
    );
  }

  return new IngestConnectorResourceError(
    "invalid_manifest",
    "Ingest connector manifest input is invalid.",
  );
}

function assertSafePayload(payload: unknown): void {
  assertSafeText(JSON.stringify(payload));
}

function assertSafeText(text: string | undefined): void {
  if (text === undefined) {
    throw new IngestConnectorResourceError(
      "unsafe_output",
      "Ingest connector resource output could not be serialized safely.",
    );
  }
  if (UNSAFE_OUTPUT_PATTERN.test(text)) {
    throw new IngestConnectorResourceError(
      "unsafe_output",
      "Ingest connector resource output contains unsafe local or sensitive markers.",
    );
  }
}

const UNSAFE_OUTPUT_PATTERN =
  /(?:\b[A-Za-z]:[\\/][^\s"',;)}\]]+|\\\\[^\\\s"',;)}\]]+[\\][^\s"',;)}\]]+|\b(?:\/Users|\/home|\/var|\/tmp|\/private|\/mnt|\/Volumes)\/[^\s"',;)}\]]+|\bprivate[-_\s]?plan(?:[-_\s]?pack)?\b|\b(?:Bearer\s+[A-Za-z0-9._~+/=-]{8,}|(?:sk|rk|pk|tok|pat|npm|ghp|gho)_[A-Za-z0-9_-]{8,}|(?:sk|rk|pat|glpat|github_pat)-[A-Za-z0-9_-]{8,})\b|"(?:api[-_]?key|apikey|authorization|credential|password|passphrase|secret|session[-_]?token|token)"\s*:\s*"(?!\[redacted(?::[A-Za-z0-9_-]+)*\]")[^"]+")/i;

function cloneResourceDefinition(
  resource: GatewayResourceDefinition,
): GatewayResourceDefinition {
  return freezeResourceDefinition({
    uri: resource.uri,
    name: resource.name,
    description: resource.description,
    mimeType: resource.mimeType,
    capability: resource.capability,
    metadata: resource.metadata ? deepFreezeClone(resource.metadata) : undefined,
    read: resource.read,
  });
}

function freezeResourceDefinition(
  resource: GatewayResourceDefinition,
): GatewayResourceDefinition {
  return Object.freeze({
    ...resource,
    metadata: resource.metadata ? deepFreezeClone(resource.metadata) : undefined,
  });
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

function deepFreezeClone<T>(value: T): T {
  return deepFreeze(cloneJsonLike(value));
}

function cloneJsonLike<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => cloneJsonLike(entry)) as T;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      cloneJsonLike(entry),
    ]),
  ) as T;
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

function isLocalIngestConnectorManifestError(
  error: unknown,
): error is LocalIngestConnectorManifestError {
  return (
    error instanceof TypeError &&
    error.name === "LocalIngestConnectorManifestError" &&
    typeof (error as { code?: unknown }).code === "string" &&
    Array.isArray((error as { issues?: unknown }).issues)
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
