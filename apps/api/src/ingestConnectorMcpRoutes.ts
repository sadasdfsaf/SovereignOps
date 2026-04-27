import type {
  ApiResponse,
  ApiRoute,
  ApiRouter,
} from "./router.ts";
import { jsonError, jsonResponse } from "./router.ts";
import type {
  IngestConnectorManifest,
  IngestConnectorProfile,
  IngestConnectorRouteState,
} from "./ingestConnectorRoutes.ts";
import {
  createIngestConnectorManifest,
  createMemoryIngestConnectorRouteState,
} from "./ingestConnectorRoutes.ts";

export const DEFAULT_INGEST_CONNECTOR_MCP_ROUTE_BASE_PATH = "/v1/ingest/connectors/mcp";
export const INGEST_CONNECTOR_MCP_RESOURCE_LIST_SCHEMA_VERSION =
  "ingest-connector-mcp-resources/v1";
export const INGEST_CONNECTOR_MCP_RESOURCE_SCHEMA_VERSION =
  "ingest-connector-mcp-resource/v1";
export const INGEST_CONNECTOR_MCP_RESOURCE_CONTENT_SCHEMA_VERSION =
  "ingest-connector-mcp-resource-content/v1";
export const INGEST_CONNECTOR_MCP_PREVIEW_SCHEMA_VERSION =
  "ingest-connector-mcp-preview/v1";

export interface IngestConnectorMcpMetadata {
  readonly localOnly: true;
  readonly noNetwork: true;
  readonly durableWrites: false;
}

export interface IngestConnectorMcpResourceDescriptor {
  readonly uri: string;
  readonly name: string;
  readonly description: string;
  readonly mimeType: "application/json";
}

export interface IngestConnectorMcpResourceContent {
  readonly uri: string;
  readonly mimeType: "application/json";
  readonly text: string;
}

export interface IngestConnectorMcpResourceManifest {
  readonly schemaVersion: typeof INGEST_CONNECTOR_MCP_RESOURCE_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly noNetwork: true;
  readonly durableWrites: false;
  readonly metadata: IngestConnectorMcpMetadata;
  readonly connectorId: string;
  readonly resource: IngestConnectorMcpResourceDescriptor;
  readonly connector: IngestConnectorProfile;
  readonly content: IngestConnectorMcpResourceContent;
}

export interface IngestConnectorMcpResourceListResponse {
  readonly schemaVersion: typeof INGEST_CONNECTOR_MCP_RESOURCE_LIST_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly noNetwork: true;
  readonly durableWrites: false;
  readonly metadata: IngestConnectorMcpMetadata;
  readonly resources: readonly IngestConnectorMcpResourceManifest[];
}

export interface IngestConnectorMcpResourceResponse {
  readonly schemaVersion: typeof INGEST_CONNECTOR_MCP_RESOURCE_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly noNetwork: true;
  readonly durableWrites: false;
  readonly metadata: IngestConnectorMcpMetadata;
  readonly resource: IngestConnectorMcpResourceManifest;
}

export interface IngestConnectorMcpPreviewRequest {
  readonly connectorId?: string;
  readonly resourceUri?: string;
  readonly includeContent?: boolean;
}

export interface IngestConnectorMcpPreviewResponse {
  readonly schemaVersion: typeof INGEST_CONNECTOR_MCP_PREVIEW_SCHEMA_VERSION;
  readonly localOnly: true;
  readonly noNetwork: true;
  readonly durableWrites: false;
  readonly dryRun: true;
  readonly metadata: IngestConnectorMcpMetadata;
  readonly connectorId: string;
  readonly resource: IngestConnectorMcpResourceManifest;
  readonly preview: {
    readonly accepted: true;
    readonly sideEffects: false;
    readonly durableWrites: false;
    readonly contentIncluded: boolean;
    readonly contentBytes: number;
  };
}

export interface IngestConnectorMcpRoutesOptions {
  readonly basePath?: string;
  readonly gatewayHelper?: IngestConnectorMcpGatewayHelper | null;
}

export type IngestConnectorMcpGatewayHelper = Record<string, unknown> | IngestConnectorMcpGatewayHelperFunction;

export type IngestConnectorMcpGatewayHelperFunction = (
  manifest: IngestConnectorManifest,
) => unknown | Promise<unknown>;

type MaybePromise<TValue> = TValue | Promise<TValue>;

const METADATA: IngestConnectorMcpMetadata = deepFreeze({
  localOnly: true,
  noNetwork: true,
  durableWrites: false,
});

const CONNECTOR_ID_PATTERN = /^local\.[A-Za-z0-9_.-]{1,96}$/;
const OPTIONAL_GATEWAY_HELPER_PATH =
  "../../../services/mcp-gateway/src/ingestConnectorResources.ts";
const HELPER_FUNCTION_NAMES = Object.freeze([
  "createIngestConnectorMcpResourceManifests",
  "buildIngestConnectorMcpResourceManifests",
  "createIngestConnectorMcpResources",
  "buildIngestConnectorMcpResources",
  "listIngestConnectorMcpResources",
  "createMcpIngestConnectorResources",
  "buildMcpIngestConnectorResources",
  "createMcpReadyIngestConnectorResources",
  "buildMcpReadyIngestConnectorResources",
  "createIngestConnectorResourceDefinitions",
]);
const PRIVATE_MARKERS = Object.freeze([
  ".codex-private",
  ".codex-run",
  "sovereignops-codex-pack",
  "plan-pack",
  "private plan pack",
  "codex_start_here",
]);
const RAW_PATH_PATTERNS = Object.freeze([
  /(?<![A-Za-z0-9])[A-Za-z]:[\\/]/,
  /\\\\[^\\\s]+\\[^\\\s]+/,
  /(?<![A-Za-z0-9_])\/(?:Users|home|root|tmp|var|etc|opt|private|mnt|Volumes)(?:\/|\b)/,
]);
const RAW_SECRET_PATTERNS = Object.freeze([
  /\bsk-[A-Za-z0-9_-]{12,}\b/,
  /\bgh[pousr]_[A-Za-z0-9_]{12,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bbearer\s+(?!\[REDACTED\])[A-Za-z0-9._~+/=-]{8,}/i,
  /\b(?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*(?!\[REDACTED\])\S{4,}/i,
]);

let cachedOptionalGatewayHelper: IngestConnectorMcpGatewayHelper | undefined | null;

export function createIngestConnectorMcpRoutes(
  state: IngestConnectorRouteState = createMemoryIngestConnectorRouteState(),
  options: IngestConnectorMcpRoutesOptions = {},
): readonly ApiRoute[] {
  const basePath = normalizeBasePath(
    options.basePath ?? DEFAULT_INGEST_CONNECTOR_MCP_ROUTE_BASE_PATH,
  );

  return Object.freeze([
    {
      method: "GET",
      path: joinPath(basePath, "/resources"),
      description: "Returns local MCP resource manifests for ingest connectors.",
      handler: async () => jsonResponse(
        200,
        await createIngestConnectorMcpResourceList(state, options.gatewayHelper),
      ),
    },
    {
      method: "GET",
      path: joinPath(basePath, "/resources/:connectorId"),
      description: "Returns one local MCP resource manifest for an ingest connector.",
      handler: async ({ params }) => getResourceByConnectorId(
        state,
        options.gatewayHelper,
        params.connectorId,
      ),
    },
    {
      method: "POST",
      path: joinPath(basePath, "/preview"),
      description: "Previews a local MCP ingest connector resource without side effects.",
      handler: async ({ request }) => previewResource(
        state,
        options.gatewayHelper,
        request.body,
      ),
    },
  ]);
}

export function mountIngestConnectorMcpRoutes(
  router: ApiRouter,
  state: IngestConnectorRouteState = createMemoryIngestConnectorRouteState(),
  options: IngestConnectorMcpRoutesOptions = {},
): ApiRouter {
  for (const route of createIngestConnectorMcpRoutes(state, options)) {
    router.register(route);
  }

  return router;
}

export async function createIngestConnectorMcpResourceList(
  state: IngestConnectorRouteState = createMemoryIngestConnectorRouteState(),
  gatewayHelper?: IngestConnectorMcpGatewayHelper | null,
): Promise<IngestConnectorMcpResourceListResponse> {
  const resources = await createResourceManifests(state, gatewayHelper);

  return deepFreeze({
    schemaVersion: INGEST_CONNECTOR_MCP_RESOURCE_LIST_SCHEMA_VERSION,
    localOnly: true,
    noNetwork: true,
    durableWrites: false,
    metadata: cloneMetadata(),
    resources,
  });
}

async function getResourceByConnectorId(
  state: IngestConnectorRouteState,
  gatewayHelper: IngestConnectorMcpGatewayHelper | null | undefined,
  connectorId: string | undefined,
): Promise<ApiResponse> {
  const validated = validateConnectorId(connectorId, "params.connectorId");
  if (!validated.ok) {
    return validated.error;
  }

  const resources = await createResourceManifests(state, gatewayHelper);
  const resource = resources.find((candidate) => candidate.connectorId === validated.value);
  if (!resource) {
    return connectorNotFound(validated.value);
  }

  return jsonResponse(200, deepFreeze({
    schemaVersion: INGEST_CONNECTOR_MCP_RESOURCE_SCHEMA_VERSION,
    localOnly: true,
    noNetwork: true,
    durableWrites: false,
    metadata: cloneMetadata(),
    resource,
  } satisfies IngestConnectorMcpResourceResponse));
}

async function previewResource(
  state: IngestConnectorRouteState,
  gatewayHelper: IngestConnectorMcpGatewayHelper | null | undefined,
  body: unknown,
): Promise<ApiResponse> {
  const request = toPreviewRequest(body);
  if (!request.ok) {
    return request.error;
  }

  const resources = await createResourceManifests(state, gatewayHelper);
  const resource = findPreviewResource(resources, request.value);
  if (!resource.ok) {
    return resource.error;
  }

  const contentIncluded = request.value.includeContent !== false;

  return jsonResponse(200, deepFreeze({
    schemaVersion: INGEST_CONNECTOR_MCP_PREVIEW_SCHEMA_VERSION,
    localOnly: true,
    noNetwork: true,
    durableWrites: false,
    dryRun: true,
    metadata: cloneMetadata(),
    connectorId: resource.value.connectorId,
    resource: contentIncluded ? resource.value : omitResourceContent(resource.value),
    preview: {
      accepted: true,
      sideEffects: false,
      durableWrites: false,
      contentIncluded,
      contentBytes: contentIncluded ? byteLength(resource.value.content.text) : 0,
    },
  } satisfies IngestConnectorMcpPreviewResponse));
}

async function createResourceManifests(
  state: IngestConnectorRouteState,
  gatewayHelper: IngestConnectorMcpGatewayHelper | null | undefined,
): Promise<readonly IngestConnectorMcpResourceManifest[]> {
  const manifest = createIngestConnectorManifest(state);
  const helper = gatewayHelper === null
    ? undefined
    : gatewayHelper ?? await loadOptionalGatewayHelper();
  const delegated = helper === undefined ? undefined : await tryCreateResourceManifests(helper, manifest);

  return delegated ?? createFallbackResourceManifests(manifest);
}

async function tryCreateResourceManifests(
  helper: IngestConnectorMcpGatewayHelper,
  manifest: IngestConnectorManifest,
): Promise<readonly IngestConnectorMcpResourceManifest[] | undefined> {
  const functions = typeof helper === "function"
    ? [helper]
    : HELPER_FUNCTION_NAMES
      .map((name) => helper[name])
      .filter((candidate): candidate is IngestConnectorMcpGatewayHelperFunction =>
        typeof candidate === "function",
      );

  for (const createResources of functions) {
    for (const result of await tryHelperInputs(createResources, manifest)) {
      const normalized = normalizeHelperResourceResult(result, manifest);
      if (normalized) {
        return normalized;
      }
    }
  }

  return undefined;
}

async function tryHelperInputs(
  createResources: IngestConnectorMcpGatewayHelperFunction,
  manifest: IngestConnectorManifest,
): Promise<readonly unknown[]> {
  const gatewayManifest = createGatewayCompatibleManifest(manifest);
  const inputs = [
    manifest,
    { manifest },
    { manifest: gatewayManifest },
    gatewayManifest,
    manifest.connectors,
  ];
  const results: unknown[] = [];

  for (const input of inputs) {
    try {
      results.push(await (createResources as (input: unknown) => MaybePromise<unknown>)(input));
    } catch {
      continue;
    }
  }

  return results;
}

function normalizeHelperResourceResult(
  result: unknown,
  manifest: IngestConnectorManifest,
): readonly IngestConnectorMcpResourceManifest[] | undefined {
  const candidates = extractResourceCandidates(result);
  if (!candidates) {
    return undefined;
  }

  const byId = new Map(manifest.connectors.map((connector) => [connector.id, connector]));
  const resources: IngestConnectorMcpResourceManifest[] = [];

  for (const candidate of candidates) {
    if (!isRecord(candidate)) {
      continue;
    }

    const connectorId = connectorIdFromCandidate(candidate);
    const connector = connectorId ? byId.get(connectorId) : undefined;
    if (!connector) {
      continue;
    }

    resources.push(createResourceManifest(connector, candidate));
  }

  return resources.length > 0 ? sortResourceManifests(resources) : undefined;
}

function extractResourceCandidates(result: unknown): readonly unknown[] | undefined {
  if (Array.isArray(result)) {
    return result;
  }

  if (!isRecord(result)) {
    return undefined;
  }

  if (Array.isArray(result.resources)) {
    return result.resources;
  }

  if (Array.isArray(result.manifests)) {
    return result.manifests;
  }

  return undefined;
}

function createFallbackResourceManifests(
  manifest: IngestConnectorManifest,
): readonly IngestConnectorMcpResourceManifest[] {
  return sortResourceManifests(
    manifest.connectors.map((connector) => createResourceManifest(connector)),
  );
}

function createResourceManifest(
  connector: IngestConnectorProfile,
  candidate: Record<string, unknown> = {},
): IngestConnectorMcpResourceManifest {
  const resource = createResourceDescriptor(connector, candidate);
  const content = createResourceContent(connector, resource);

  return deepFreeze({
    schemaVersion: INGEST_CONNECTOR_MCP_RESOURCE_SCHEMA_VERSION,
    localOnly: true,
    noNetwork: true,
    durableWrites: false,
    metadata: cloneMetadata(),
    connectorId: connector.id,
    resource,
    connector: cloneConnectorProfile(connector),
    content,
  });
}

function createResourceDescriptor(
  connector: IngestConnectorProfile,
  candidate: Record<string, unknown>,
): IngestConnectorMcpResourceDescriptor {
  const uri = safeString(candidate.uri)
    ?? safeString(recordValue(candidate.resource, "uri"))
    ?? defaultResourceUri(connector.id);
  const name = safeString(candidate.name)
    ?? safeString(recordValue(candidate.resource, "name"))
    ?? `${connector.label} MCP Resource`;
  const description = safeString(candidate.description)
    ?? safeString(recordValue(candidate.resource, "description"))
    ?? connector.description;

  return deepFreeze({
    uri,
    name,
    description,
    mimeType: "application/json",
  });
}

function createResourceContent(
  connector: IngestConnectorProfile,
  resource: IngestConnectorMcpResourceDescriptor,
): IngestConnectorMcpResourceContent {
  return deepFreeze({
    uri: resource.uri,
    mimeType: "application/json",
    text: JSON.stringify({
      schemaVersion: INGEST_CONNECTOR_MCP_RESOURCE_CONTENT_SCHEMA_VERSION,
      localOnly: true,
      noNetwork: true,
      durableWrites: false,
      connector: cloneConnectorProfile(connector),
      resource,
    }),
  });
}

function findPreviewResource(
  resources: readonly IngestConnectorMcpResourceManifest[],
  request: IngestConnectorMcpPreviewRequest,
): { ok: true; value: IngestConnectorMcpResourceManifest } | { ok: false; error: ApiResponse } {
  if (request.connectorId) {
    const byConnector = resources.find((resource) => resource.connectorId === request.connectorId);
    if (!byConnector) {
      return { ok: false, error: connectorNotFound(request.connectorId) };
    }

    if (request.resourceUri !== undefined && !resourceUriMatchesConnector(request.resourceUri, byConnector)) {
      return {
        ok: false,
        error: validationError("Preview resourceUri does not match connectorId.", {
          path: "body.resourceUri",
        }),
      };
    }

    return { ok: true, value: byConnector };
  }

  const byUri = resources.find((resource) =>
    request.resourceUri !== undefined && resourceUriMatchesConnector(request.resourceUri, resource)
  );
  if (!byUri) {
    return {
      ok: false,
      error: jsonError(404, "ingest_connector_mcp_resource_not_found", "Ingest connector MCP resource was not found."),
    };
  }

  return { ok: true, value: byUri };
}

function resourceUriMatchesConnector(
  resourceUri: string,
  resource: IngestConnectorMcpResourceManifest,
): boolean {
  if (resourceUri === resource.resource.uri) {
    return true;
  }

  return connectorIdFromCandidate({ uri: resourceUri }) === resource.connectorId;
}

function toPreviewRequest(
  body: unknown,
): { ok: true; value: IngestConnectorMcpPreviewRequest } | { ok: false; error: ApiResponse } {
  if (!isRecord(body)) {
    return {
      ok: false,
      error: validationError("Request body must be an object.", { path: "body" }),
    };
  }

  const keys = allowedKeys(body, ["connectorId", "resourceUri", "includeContent"]);
  if (!keys.ok) {
    return keys;
  }

  const connectorId = body.connectorId;
  if (connectorId !== undefined) {
    const validated = validateConnectorId(connectorId, "body.connectorId");
    if (!validated.ok) {
      return validated;
    }
  }

  const resourceUri = body.resourceUri;
  if (resourceUri !== undefined && !safeString(resourceUri)) {
    return {
      ok: false,
      error: validationError("Preview resourceUri must be a non-empty safe string.", {
        path: "body.resourceUri",
      }),
    };
  }

  if (connectorId === undefined && resourceUri === undefined) {
    return {
      ok: false,
      error: validationError("Preview requires connectorId or resourceUri.", { path: "body.connectorId" }),
    };
  }

  if (body.includeContent !== undefined && typeof body.includeContent !== "boolean") {
    return {
      ok: false,
      error: validationError("Preview includeContent must be a boolean.", {
        path: "body.includeContent",
      }),
    };
  }

  return {
    ok: true,
    value: {
      connectorId: typeof connectorId === "string" ? connectorId : undefined,
      resourceUri: typeof resourceUri === "string" ? resourceUri : undefined,
      includeContent: body.includeContent,
    },
  };
}

function validateConnectorId(
  value: unknown,
  path: string,
): { ok: true; value: string } | { ok: false; error: ApiResponse } {
  if (typeof value !== "string" || !CONNECTOR_ID_PATTERN.test(value)) {
    return {
      ok: false,
      error: validationError("Connector id must be a safe local connector id.", { path }),
    };
  }

  return { ok: true, value };
}

function allowedKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
): { ok: true } | { ok: false; error: ApiResponse } {
  const allowed = new Set(keys);
  const unknown = Object.keys(record).find((key) => !allowed.has(key));

  if (!unknown) {
    return { ok: true };
  }

  return {
    ok: false,
    error: validationError("Request body contains an unknown field.", { path: `body.${unknown}` }),
  };
}

function createGatewayCompatibleManifest(
  manifest: IngestConnectorManifest,
): Record<string, unknown> {
  return {
    kind: "ingest.connector_manifest",
    schemaVersion: manifest.schemaVersion,
    localOnly: manifest.localOnly,
    profileCount: manifest.connectors.length,
    profiles: manifest.connectors.map((connector) => ({
      profileId: connector.id,
      connector: gatewayConnectorKind(connector),
      label: connector.label,
      description: connector.description,
      sourceKinds: gatewaySourceKinds(connector),
      mediaTypes: [...connector.mediaTypes],
      fileExtensions: [],
      sourceUriSchemes: ["fixture", "local", "stdin", "workspace"],
      citationKinds: ["line-range"],
      validationModes: ["safety-scan", "size-limit"],
      safetyFindingKinds: ["raw-secret"],
      capabilities: [...connector.capabilities],
      defaultOptions: {
        trusted: !connector.safety.untrustedByDefault,
      },
      safety: {
        localOnly: connector.safety.localOnly,
        untrustedByDefault: connector.safety.untrustedByDefault,
        trustedByDefault: !connector.safety.untrustedByDefault,
        networkAccess: connector.safety.networkAccess,
        durableWrites: connector.safety.durableWrites,
        rawContentRetained: false,
        rawSecretsRetained: false,
        privatePathsBlocked: true,
        rawSecretsBlocked: true,
        readsFiles: connector.id === "local.files",
        requiresApproval: false,
      },
    })),
  };
}

function gatewayConnectorKind(connector: IngestConnectorProfile): string {
  if (connector.id === "local.manual") {
    return "markdown";
  }
  if (connector.mediaTypes.length === 1 && connector.mediaTypes[0] === "text/csv") {
    return "csv";
  }
  return "repository";
}

function gatewaySourceKinds(connector: IngestConnectorProfile): readonly string[] {
  if (connector.id === "local.manual") {
    return ["record"];
  }
  if (connector.id === "local.workspace-index") {
    return ["index"];
  }
  return ["file"];
}

async function loadOptionalGatewayHelper(): Promise<IngestConnectorMcpGatewayHelper | undefined> {
  if (cachedOptionalGatewayHelper !== undefined) {
    return cachedOptionalGatewayHelper ?? undefined;
  }

  try {
    cachedOptionalGatewayHelper = await import(OPTIONAL_GATEWAY_HELPER_PATH);
  } catch {
    cachedOptionalGatewayHelper = null;
  }

  return cachedOptionalGatewayHelper ?? undefined;
}

function connectorIdFromCandidate(candidate: Record<string, unknown>): string | undefined {
  const direct = safeConnectorId(candidate.connectorId)
    ?? safeConnectorId(candidate.profileId)
    ?? safeConnectorId(recordValue(candidate.resource, "connectorId"))
    ?? safeConnectorId(recordValue(candidate.metadata, "profileId"));
  if (direct) {
    return direct;
  }

  const uri = safeString(candidate.uri) ?? safeString(recordValue(candidate.resource, "uri"));
  if (!uri) {
    return undefined;
  }

  const match = /^sovereignops:\/\/ingest\/connectors\/([^/]+)(?:\/manifest)?$/.exec(uri)
    ?? /^sovereignops:\/\/ingest-connector\/([^/]+)\/manifest$/.exec(uri);
  if (!match) {
    return undefined;
  }

  try {
    return safeConnectorId(decodeURIComponent(match[1]));
  } catch {
    return undefined;
  }
}

function safeConnectorId(value: unknown): string | undefined {
  return typeof value === "string" && CONNECTOR_ID_PATTERN.test(value) ? value : undefined;
}

function safeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0 || !isSafeText(trimmed)) {
    return undefined;
  }

  return trimmed;
}

function isSafeText(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    PRIVATE_MARKERS.every((marker) => !lower.includes(marker)) &&
    RAW_PATH_PATTERNS.every((pattern) => !pattern.test(value)) &&
    RAW_SECRET_PATTERNS.every((pattern) => !pattern.test(value))
  );
}

function recordValue(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function defaultResourceUri(connectorId: string): string {
  return `sovereignops://ingest/connectors/${encodeURIComponent(connectorId)}/manifest`;
}

function connectorNotFound(connectorId: string): ApiResponse {
  return jsonError(
    404,
    "ingest_connector_mcp_resource_not_found",
    "Ingest connector MCP resource was not found.",
    { connectorId },
  );
}

function validationError(
  message: string,
  details: Readonly<Record<string, unknown>>,
): ApiResponse {
  return jsonError(400, "validation_failed", message, details);
}

function sortResourceManifests(
  resources: readonly IngestConnectorMcpResourceManifest[],
): readonly IngestConnectorMcpResourceManifest[] {
  return deepFreeze([...resources].sort((left, right) => left.connectorId.localeCompare(right.connectorId)));
}

function cloneMetadata(): IngestConnectorMcpMetadata {
  return deepFreeze({ ...METADATA });
}

function cloneConnectorProfile(profile: IngestConnectorProfile): IngestConnectorProfile {
  return deepFreeze({
    ...profile,
    capabilities: [...profile.capabilities],
    mediaTypes: [...profile.mediaTypes],
    auth: { ...profile.auth },
    preview: { ...profile.preview },
    safety: { ...profile.safety },
  });
}

function omitResourceContent(
  resource: IngestConnectorMcpResourceManifest,
): IngestConnectorMcpResourceManifest {
  return deepFreeze({
    ...resource,
    content: {
      uri: resource.content.uri,
      mimeType: resource.content.mimeType,
      text: "",
    },
  });
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function normalizeBasePath(path: string): string {
  const trimmed = path.trim();
  if (trimmed.length === 0 || trimmed === "/") {
    return "";
  }

  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const collapsed = withSlash.replace(/\/+/g, "/");

  return collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed;
}

function joinPath(basePath: string, suffix: string): string {
  const normalizedSuffix = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `${basePath}${normalizedSuffix}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze<TValue>(value: TValue): TValue {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }

  return value;
}
