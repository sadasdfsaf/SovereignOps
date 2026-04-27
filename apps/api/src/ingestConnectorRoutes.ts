import type {
  ApiRoute,
  ApiRouter,
} from "./router.ts";
import { jsonResponse } from "./router.ts";

export const DEFAULT_INGEST_CONNECTOR_ROUTE_BASE_PATH = "/v1/ingest";

export type IngestConnectorCapability =
  | "ingest.normalize"
  | "ingest.structured"
  | "repository.scan"
  | "search.query"
  | "quarantine.preview";

export type IngestConnectorMediaType =
  | "text/plain"
  | "text/markdown"
  | "text/csv"
  | "application/json";

export interface IngestConnectorAuthProfile {
  readonly mode: "none";
  readonly required: false;
}

export interface IngestConnectorPreviewProfile {
  readonly dryRun: true;
  readonly maxItems: number;
  readonly maxTextBytes: number;
}

export interface IngestConnectorSafetyProfile {
  readonly localOnly: true;
  readonly networkAccess: false;
  readonly durableWrites: false;
  readonly untrustedByDefault: boolean;
}

export interface IngestConnectorProfile {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly transport: "in-process";
  readonly capabilities: readonly IngestConnectorCapability[];
  readonly mediaTypes: readonly IngestConnectorMediaType[];
  readonly auth: IngestConnectorAuthProfile;
  readonly preview: IngestConnectorPreviewProfile;
  readonly safety: IngestConnectorSafetyProfile;
}

export interface IngestConnectorManifest {
  readonly schemaVersion: "ingest-connector-manifest/v1";
  readonly localOnly: true;
  readonly connectors: readonly IngestConnectorProfile[];
}

export interface IngestConnectorRouteState {
  listConnectorProfiles(): readonly IngestConnectorProfile[];
}

export interface IngestConnectorRouteStateSeed {
  readonly connectors?: readonly IngestConnectorProfile[];
}

export interface IngestConnectorRoutesOptions {
  readonly basePath?: string;
}

const DEFAULT_CONNECTOR_PROFILES: readonly IngestConnectorProfile[] = deepFreeze([
  {
    id: "local.files",
    label: "Local Files",
    description: "Previews caller-provided local file content for normalization, indexing, and search.",
    transport: "in-process",
    capabilities: [
      "ingest.normalize",
      "ingest.structured",
      "repository.scan",
      "search.query",
      "quarantine.preview",
    ],
    mediaTypes: [
      "text/plain",
      "text/markdown",
      "text/csv",
      "application/json",
    ],
    auth: {
      mode: "none",
      required: false,
    },
    preview: {
      dryRun: true,
      maxItems: 50,
      maxTextBytes: 65536,
    },
    safety: {
      localOnly: true,
      networkAccess: false,
      durableWrites: false,
      untrustedByDefault: true,
    },
  },
  {
    id: "local.manual",
    label: "Manual Text",
    description: "Accepts pasted or caller-supplied text for local normalization and preview search.",
    transport: "in-process",
    capabilities: [
      "ingest.normalize",
      "ingest.structured",
      "search.query",
    ],
    mediaTypes: [
      "text/plain",
      "text/markdown",
      "application/json",
    ],
    auth: {
      mode: "none",
      required: false,
    },
    preview: {
      dryRun: true,
      maxItems: 20,
      maxTextBytes: 32768,
    },
    safety: {
      localOnly: true,
      networkAccess: false,
      durableWrites: false,
      untrustedByDefault: true,
    },
  },
  {
    id: "local.workspace-index",
    label: "Workspace Index",
    description: "Queries the in-process local search index without contacting external services.",
    transport: "in-process",
    capabilities: [
      "search.query",
      "quarantine.preview",
    ],
    mediaTypes: [
      "text/plain",
      "text/markdown",
      "text/csv",
      "application/json",
    ],
    auth: {
      mode: "none",
      required: false,
    },
    preview: {
      dryRun: true,
      maxItems: 100,
      maxTextBytes: 16384,
    },
    safety: {
      localOnly: true,
      networkAccess: false,
      durableWrites: false,
      untrustedByDefault: false,
    },
  },
]);

export function createMemoryIngestConnectorRouteState(
  seed: IngestConnectorRouteStateSeed = {},
): IngestConnectorRouteState {
  const connectors = sortConnectorProfiles(
    (seed.connectors ?? DEFAULT_CONNECTOR_PROFILES).map(cloneConnectorProfile),
  );

  return {
    listConnectorProfiles() {
      return Object.freeze(connectors.map(cloneConnectorProfile));
    },
  };
}

export function createDefaultIngestConnectorManifest(): IngestConnectorManifest {
  return createIngestConnectorManifest(createMemoryIngestConnectorRouteState());
}

export function createIngestConnectorManifest(
  state: IngestConnectorRouteState,
): IngestConnectorManifest {
  return Object.freeze({
    schemaVersion: "ingest-connector-manifest/v1",
    localOnly: true,
    connectors: Object.freeze(state.listConnectorProfiles().map(cloneConnectorProfile)),
  });
}

export function createIngestConnectorRoutes(
  state: IngestConnectorRouteState = createMemoryIngestConnectorRouteState(),
  options: IngestConnectorRoutesOptions = {},
): readonly ApiRoute[] {
  const basePath = normalizeBasePath(
    options.basePath ?? DEFAULT_INGEST_CONNECTOR_ROUTE_BASE_PATH,
  );

  return Object.freeze([
    {
      method: "GET",
      path: joinPath(basePath, "/connectors"),
      description: "Returns local ingest connector profiles.",
      handler: () => jsonResponse(200, createIngestConnectorManifest(state)),
    },
  ]);
}

export function mountIngestConnectorRoutes(
  router: ApiRouter,
  state: IngestConnectorRouteState = createMemoryIngestConnectorRouteState(),
  options: IngestConnectorRoutesOptions = {},
): ApiRouter {
  for (const route of createIngestConnectorRoutes(state, options)) {
    router.register(route);
  }

  return router;
}

function sortConnectorProfiles(
  connectors: readonly IngestConnectorProfile[],
): readonly IngestConnectorProfile[] {
  return Object.freeze(
    [...connectors].sort((left, right) => left.id.localeCompare(right.id)),
  );
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
