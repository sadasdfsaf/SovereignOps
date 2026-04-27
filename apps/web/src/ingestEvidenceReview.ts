import {
  type IngestSearchEmptyState,
  type IngestSearchErrorState,
  type IngestSearchViewStatus,
} from "./ingestSearch.ts";

export type IngestEvidenceReviewContext =
  | "session"
  | "formats"
  | "commands"
  | "routes"
  | "package"
  | "redaction"
  | "local";

export type IngestEvidenceCommandType = "session" | "validation";

export type IngestEvidenceRouteSurface =
  | "api"
  | "cli"
  | "package"
  | "sdk"
  | "schema"
  | "validation"
  | "local";

export interface BuildIngestEvidenceReviewOptions {
  defaultTimestamp?: string;
  error?: unknown;
}

export interface IngestEvidenceReviewState {
  id: "ingest_evidence_review";
  schemaVersion?: string;
  workspaceId?: string;
  sessionId?: string;
  generatedAt: string;
  localOnlyStatus: IngestEvidenceLocalOnlyStatus;
  formatCards: IngestEvidenceFormatCard[];
  commandRows: IngestEvidenceCommandRow[];
  routeRows: IngestEvidenceRouteRow[];
  packageDescriptors: IngestEvidencePackageDescriptor[];
  redactionSummary: IngestEvidenceRedactionSummary;
  emptyStates: IngestEvidenceReviewEmptyStates;
  errorStates: IngestEvidenceReviewErrorState[];
}

export interface IngestEvidenceFormatCard {
  id: string;
  format: string;
  title: string;
  mediaType?: string;
  surface: IngestEvidenceRouteSurface;
  surfaceLabel: string;
  route: string;
  manifestDescriptor?: string;
  commandId?: string;
  commandLabel?: string;
  status: IngestSearchViewStatus;
  statusLabel: string;
  detailLabels: string[];
  ariaLabel: string;
}

export interface IngestEvidenceCommandRow {
  id: string;
  commandId: string;
  commandType: IngestEvidenceCommandType;
  title: string;
  surface: IngestEvidenceRouteSurface;
  surfaceLabel: string;
  format: string;
  formatLabel: string;
  method?: string;
  url?: string;
  routePath?: string;
  command?: string;
  entryPoint?: string;
  packagePath?: string;
  status: IngestSearchViewStatus;
  statusLabel: string;
  detailLabels: string[];
  ariaLabel: string;
}

export interface IngestEvidenceRouteRow {
  id: string;
  routeId: string;
  title: string;
  method: string;
  routePath: string;
  surface: IngestEvidenceRouteSurface;
  surfaceLabel: string;
  formatLabels: string[];
  commandIds: string[];
  status: IngestSearchViewStatus;
  statusLabel: string;
  detailLabels: string[];
  ariaLabel: string;
}

export interface IngestEvidencePackageDescriptor {
  id: string;
  descriptorId: string;
  title: string;
  kind: string;
  status: IngestSearchViewStatus;
  statusLabel: string;
  fingerprint?: string;
  mediaType?: string;
  byteCount?: number;
  recordCount?: number;
  rowCount?: number;
  lineCount?: number;
  columnCount?: number;
  version?: number;
  detailLabels: string[];
  ariaLabel: string;
}

export interface IngestEvidenceRedactionSummary {
  id: "ingest_evidence_redaction_summary";
  label: string;
  status: IngestSearchViewStatus;
  statusLabel: string;
  marker?: string;
  markerLabel: string;
  scopeCount: number;
  applyCount: number;
  scopes: string[];
  scopeLabels: string[];
  appliesBefore: string[];
  appliesBeforeLabels: string[];
  detailLabels: string[];
  emptyState: IngestSearchEmptyState;
  ariaLabel: string;
}

export interface IngestEvidenceLocalOnlyStatus {
  id: "ingest_evidence_local_only";
  label: string;
  localOnly: boolean;
  status: IngestSearchViewStatus;
  statusLabel: string;
  mode?: string;
  allowedUrlPrefixes: string[];
  allowedUriPrefixes: string[];
  blockedUrlPrefixes: string[];
  notes?: string;
  detailLabels: string[];
  ariaLabel: string;
}

export interface IngestEvidenceReviewEmptyStates {
  formats: IngestSearchEmptyState;
  commands: IngestSearchEmptyState;
  routes: IngestSearchEmptyState;
  packageDescriptors: IngestSearchEmptyState;
  redaction: IngestSearchEmptyState;
}

export interface IngestEvidenceReviewErrorState {
  id: string;
  context: IngestEvidenceReviewContext;
  errorState: IngestSearchErrorState;
}

type AnyRecord = Record<string, unknown>;

interface NormalizedSession {
  root?: AnyRecord;
  schemaVersion?: string;
  workspaceId?: string;
  sessionId?: string;
  generatedAt: string;
  localOnly: boolean;
  error?: string;
}

interface NormalizedFormat {
  format: string;
  mediaType?: string;
  surface: IngestEvidenceRouteSurface;
  route: string;
  manifestDescriptor?: string;
  commandId?: string;
}

interface NormalizedCommand {
  id: string;
  index: number;
  commandType: IngestEvidenceCommandType;
  surface: IngestEvidenceRouteSurface;
  format: string;
  command?: string;
  method?: string;
  url?: string;
  routePath?: string;
  entryPoint?: string;
  packagePath?: string;
}

interface NormalizedRoute {
  routeId: string;
  index: number;
  surface: IngestEvidenceRouteSurface;
  method: string;
  routePath: string;
  formats: string[];
  commandIds: string[];
}

interface NormalizedDescriptor {
  descriptorId: string;
  rank: number;
  title: string;
  kind: string;
  fingerprint?: string;
  mediaType?: string;
  byteCount?: number;
  recordCount?: number;
  rowCount?: number;
  lineCount?: number;
  columnCount?: number;
  version?: number;
  detailLabels: string[];
}

const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";

export function buildIngestEvidenceReview(
  input: unknown,
  options: BuildIngestEvidenceReviewOptions = {},
): IngestEvidenceReviewState {
  const session = normalizeSession(input, options.defaultTimestamp);
  const root = session.root;
  const errorStates: IngestEvidenceReviewErrorState[] = [];

  if (session.error !== undefined) {
    errorStates.push(buildIngestEvidenceReviewErrorState("session", session.error));
  }
  if (options.error !== undefined) {
    errorStates.push(buildIngestEvidenceReviewErrorState("session", options.error));
  }

  const state: IngestEvidenceReviewState = {
    id: "ingest_evidence_review",
    generatedAt: session.generatedAt,
    localOnlyStatus: buildIngestEvidenceLocalOnlyStatus(root ?? input),
    formatCards: root ? buildIngestEvidenceFormatCards(root) : [],
    commandRows: root ? buildIngestEvidenceCommandRows(root) : [],
    routeRows: root ? buildIngestEvidenceRouteRows(root) : [],
    packageDescriptors: root ? buildIngestEvidencePackageDescriptors(root) : [],
    redactionSummary: root
      ? buildIngestEvidenceRedactionSummary(root)
      : buildIngestEvidenceRedactionSummary(undefined),
    emptyStates: {
      formats: buildIngestEvidenceReviewEmptyState("formats"),
      commands: buildIngestEvidenceReviewEmptyState("commands"),
      routes: buildIngestEvidenceReviewEmptyState("routes"),
      packageDescriptors: buildIngestEvidenceReviewEmptyState("package"),
      redaction: buildIngestEvidenceReviewEmptyState("redaction"),
    },
    errorStates: errorStates.map(cloneErrorState),
  };

  if (session.schemaVersion !== undefined) {
    state.schemaVersion = session.schemaVersion;
  }
  if (session.workspaceId !== undefined) {
    state.workspaceId = session.workspaceId;
  }
  if (session.sessionId !== undefined) {
    state.sessionId = session.sessionId;
  }

  return cloneReviewState(state);
}

export function buildIngestEvidenceFormatCards(
  input: unknown,
): IngestEvidenceFormatCard[] {
  const root = clonePlain(input);
  if (!isRecord(root)) {
    return [];
  }

  const commandsById = new Map(
    normalizeCommands(root).map((command) => [command.id, command]),
  );

  return normalizeFormats(root)
    .map((format, index) => buildFormatCard(format, index, commandsById))
    .sort(compareFormatCards)
    .map(cloneFormatCard);
}

export function buildIngestEvidenceCommandRows(
  input: unknown,
): IngestEvidenceCommandRow[] {
  const root = clonePlain(input);
  if (!isRecord(root)) {
    return [];
  }

  return normalizeCommands(root)
    .map(buildCommandRow)
    .sort(compareCommandRows)
    .map(cloneCommandRow);
}

export function buildIngestEvidenceRouteRows(
  input: unknown,
): IngestEvidenceRouteRow[] {
  const root = clonePlain(input);
  if (!isRecord(root)) {
    return [];
  }

  const routes = new Map<string, NormalizedRoute>();

  for (const format of normalizeFormats(root)) {
    mergeRoute(routes, {
      routeId: routeId(format.route),
      index: routes.size,
      surface: format.surface,
      method: methodFromRoute(format.route),
      routePath: routePathFromRoute(format.route),
      formats: [format.format],
      commandIds: format.commandId ? [format.commandId] : [],
    });
  }

  for (const command of normalizeCommands(root).filter(
    (entry) => entry.commandType === "session",
  )) {
    const routePath = routePathFromCommand(command);
    if (routePath === undefined) {
      continue;
    }

    mergeRoute(routes, {
      routeId: routeId(routePath),
      index: routes.size,
      surface: command.surface,
      method: command.method ?? methodFromRoute(routePath),
      routePath,
      formats: [command.format],
      commandIds: [command.id],
    });
  }

  return [...routes.values()]
    .map(buildRouteRow)
    .sort(compareRouteRows)
    .map(cloneRouteRow);
}

export function buildIngestEvidencePackageDescriptors(
  input: unknown,
): IngestEvidencePackageDescriptor[] {
  const root = clonePlain(input);
  if (!isRecord(root)) {
    return [];
  }

  return normalizePackageDescriptors(root)
    .map(buildPackageDescriptor)
    .sort(comparePackageDescriptors)
    .map(clonePackageDescriptor);
}

export function buildIngestEvidenceRedactionSummary(
  input: unknown,
): IngestEvidenceRedactionSummary {
  const root = clonePlain(input);
  const redaction = isRecord(root)
    ? recordField(root, "redaction") ?? root
    : undefined;
  const marker = redaction ? stringField(redaction, "marker") : undefined;
  const scopes = redaction
    ? uniqueStrings(stringArrayField(redaction, "scopes")).sort()
    : [];
  const appliesBefore = redaction
    ? uniqueStrings(stringArrayField(redaction, "appliesBefore", "applies_before")).sort()
    : [];
  const scopeLabels = scopes.map(redactionScopeLabel);
  const appliesBeforeLabels = appliesBefore.map(redactionApplyLabel);
  const status: IngestSearchViewStatus =
    scopes.length === 0 && appliesBefore.length === 0
      ? "empty"
      : marker === undefined
        ? "attention"
        : "complete";
  const detailLabels = [
    marker ? `Marker ${marker}` : "No marker configured",
    formatCount(scopes.length, "scope"),
    formatCount(appliesBefore.length, "render target"),
  ];

  return {
    id: "ingest_evidence_redaction_summary",
    label: "Redaction",
    status,
    statusLabel: statusLabel(status),
    marker,
    markerLabel: marker ?? "No redaction marker",
    scopeCount: scopes.length,
    applyCount: appliesBefore.length,
    scopes,
    scopeLabels,
    appliesBefore,
    appliesBeforeLabels,
    detailLabels,
    emptyState: buildIngestEvidenceReviewEmptyState("redaction"),
    ariaLabel: [
      "Redaction",
      statusLabel(status),
      marker ? `marker ${marker}` : "no marker",
      formatCount(scopes.length, "scope"),
      formatCount(appliesBefore.length, "render target"),
    ].join(", "),
  };
}

export function buildIngestEvidenceLocalOnlyStatus(
  input: unknown,
): IngestEvidenceLocalOnlyStatus {
  const root = clonePlain(input);
  const session = isRecord(root) ? root : undefined;
  const network = recordField(session, "network");
  const localOnly = session
    ? booleanField(session, "localOnly", "local_only") ?? false
    : false;
  const mode = network ? stringField(network, "mode") : undefined;
  const allowedUrlPrefixes = network
    ? stringArrayField(network, "allowedUrlPrefixes", "allowed_url_prefixes")
    : [];
  const allowedUriPrefixes = network
    ? stringArrayField(network, "allowedUriPrefixes", "allowed_uri_prefixes")
    : [];
  const blockedUrlPrefixes = allowedUrlPrefixes.filter(
    (prefix) => !isLocalUrlPrefix(prefix),
  );
  const notes = network ? stringField(network, "notes") : undefined;
  const status = localOnlyStatus(localOnly, mode, blockedUrlPrefixes);
  const detailLabels = [
    localOnly ? "Local-only session" : "Local-only not confirmed",
    mode !== undefined ? `Network mode ${mode}` : "No network mode",
    formatCount(allowedUrlPrefixes.length, "allowed URL prefix"),
    formatCount(allowedUriPrefixes.length, "allowed URI prefix"),
  ];

  if (blockedUrlPrefixes.length > 0) {
    detailLabels.push(formatCount(blockedUrlPrefixes.length, "non-local URL prefix"));
  }
  if (notes !== undefined) {
    detailLabels.push(notes);
  }

  return {
    id: "ingest_evidence_local_only",
    label: "Local-only export",
    localOnly,
    status,
    statusLabel: statusLabel(status),
    mode,
    allowedUrlPrefixes: [...allowedUrlPrefixes],
    allowedUriPrefixes: [...allowedUriPrefixes],
    blockedUrlPrefixes,
    notes,
    detailLabels,
    ariaLabel: [
      "Local-only export",
      statusLabel(status),
      localOnly ? "local-only" : "not local-only",
      mode !== undefined ? `network mode ${mode}` : "network mode unavailable",
      formatCount(blockedUrlPrefixes.length, "non-local URL prefix"),
    ].join(", "),
  };
}

export function buildIngestEvidenceReviewEmptyState(
  context: Exclude<IngestEvidenceReviewContext, "session" | "local">,
): IngestSearchEmptyState {
  switch (context) {
    case "formats":
      return {
        id: "ingest_evidence_formats_empty",
        label: "No export formats",
        description: "Expected export formats will appear after a session is loaded.",
        ariaLabel: "No ingest evidence export formats are available",
      };
    case "commands":
      return {
        id: "ingest_evidence_commands_empty",
        label: "No commands",
        description: "CLI, API, SDK, package, and validation commands will appear here.",
        ariaLabel: "No ingest evidence commands are available",
      };
    case "routes":
      return {
        id: "ingest_evidence_routes_empty",
        label: "No routes",
        description: "Export and package routes will appear after a session is loaded.",
        ariaLabel: "No ingest evidence routes are available",
      };
    case "package":
      return {
        id: "ingest_evidence_package_empty",
        label: "No package manifest",
        description: "Package descriptors will appear when manifest metadata is present.",
        ariaLabel: "No ingest evidence package descriptors are available",
      };
    case "redaction":
      return {
        id: "ingest_evidence_redaction_empty",
        label: "No redaction rules",
        description: "Redaction scopes will appear when export rules are present.",
        ariaLabel: "No ingest evidence redaction rules are available",
      };
  }
}

export function buildIngestEvidenceReviewErrorState(
  context: IngestEvidenceReviewContext,
  error: unknown,
): IngestEvidenceReviewErrorState {
  const description = errorMessage(error) ?? defaultErrorDescription(context);

  return {
    id: `ingest_evidence_${context}_error`,
    context,
    errorState: {
      id: `ingest_evidence_${context}_error`,
      label: errorLabel(context),
      description,
      ariaLabel: errorLabel(context),
      retryLabel: retryLabel(context),
    },
  };
}

function normalizeSession(
  input: unknown,
  defaultTimestamp: string | undefined,
): NormalizedSession {
  const root = clonePlain(input);
  const fallbackTimestamp = normalizeDefaultTimestamp(defaultTimestamp);

  if (!isRecord(root)) {
    return {
      generatedAt: fallbackTimestamp,
      localOnly: false,
      error: "Evidence export session must be an object.",
    };
  }

  return {
    root,
    schemaVersion: stringField(root, "schemaVersion", "schema_version"),
    workspaceId: stringField(root, "workspaceId", "workspace_id"),
    sessionId: stringField(root, "sessionId", "session_id"),
    generatedAt: normalizeDefaultTimestamp(
      timestampField(root, "generatedAt", "generated_at") ?? fallbackTimestamp,
    ),
    localOnly: booleanField(root, "localOnly", "local_only") ?? false,
  };
}

function normalizeFormats(root: AnyRecord): NormalizedFormat[] {
  return arrayField(root, "expectedFormats", "expected_formats")
    .map((value) => {
      if (!isRecord(value)) {
        return undefined;
      }

      const format = stringField(value, "format");
      const route = stringField(value, "route");
      if (format === undefined || route === undefined) {
        return undefined;
      }

      return {
        format,
        mediaType: stringField(value, "mediaType", "media_type"),
        surface: normalizeSurface(stringField(value, "surface")),
        route,
        manifestDescriptor: stringField(
          value,
          "manifestDescriptor",
          "manifest_descriptor",
        ),
        commandId: stringField(value, "commandId", "command_id"),
      };
    })
    .filter(isDefined);
}

function buildFormatCard(
  format: NormalizedFormat,
  index: number,
  commandsById: ReadonlyMap<string, NormalizedCommand>,
): IngestEvidenceFormatCard {
  const command = format.commandId ? commandsById.get(format.commandId) : undefined;
  const hasDescriptor = format.manifestDescriptor !== undefined;
  const status: IngestSearchViewStatus =
    format.commandId !== undefined && command === undefined
      ? "attention"
      : hasDescriptor
        ? "complete"
        : "ready";
  const detailLabels = [
    surfaceLabel(format.surface),
    format.mediaType ?? "Media type unavailable",
    `Route ${format.route}`,
  ];

  if (format.manifestDescriptor !== undefined) {
    detailLabels.push(`Manifest descriptor ${format.manifestDescriptor}`);
  }
  if (command !== undefined) {
    detailLabels.push(commandTitle(command));
  }

  return {
    id: `ingest_evidence_format.${sanitizeIdentifier(
      `${format.surface}_${format.format}_${index}`,
      `format_${index + 1}`,
    )}`,
    format: format.format,
    title: formatLabel(format.format),
    mediaType: format.mediaType,
    surface: format.surface,
    surfaceLabel: surfaceLabel(format.surface),
    route: format.route,
    manifestDescriptor: format.manifestDescriptor,
    commandId: format.commandId,
    commandLabel: command ? commandTitle(command) : undefined,
    status,
    statusLabel: statusLabel(status),
    detailLabels,
    ariaLabel: [
      formatLabel(format.format),
      surfaceLabel(format.surface),
      statusLabel(status),
      format.mediaType ?? "media type unavailable",
    ].join(", "),
  };
}

function normalizeCommands(root: AnyRecord): NormalizedCommand[] {
  const commands = arrayField(root, "commands")
    .map((value, index) => normalizeCommand(value, index))
    .filter(isDefined);
  const validationCommands = stringArrayField(
    root,
    "validationCommands",
    "validation_commands",
  ).map((command, index) => ({
    id: `validation_${index + 1}`,
    index: commands.length + index,
    commandType: "validation" as const,
    surface: "validation" as const,
    format: "validation",
    command,
  }));

  return [...commands, ...validationCommands];
}

function normalizeCommand(
  value: unknown,
  index: number,
): NormalizedCommand | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = stringField(value, "id") ?? `command_${index + 1}`;
  const surface = normalizeSurface(stringField(value, "surface"));
  const format = stringField(value, "format") ?? surface;
  const url = stringField(value, "url");
  const method = stringField(value, "method")?.toUpperCase();

  return {
    id,
    index,
    commandType: "session",
    surface,
    format,
    command: stringField(value, "command"),
    method,
    url,
    routePath: url ? pathFromUrl(url) : undefined,
    entryPoint: stringField(value, "entryPoint", "entry_point"),
    packagePath: stringField(value, "packagePath", "package_path"),
  };
}

function buildCommandRow(command: NormalizedCommand): IngestEvidenceCommandRow {
  const executable = command.command ?? command.entryPoint ?? command.url;
  const status: IngestSearchViewStatus =
    executable === undefined ? "attention" : command.commandType === "validation" ? "ready" : "complete";
  const detailLabels = [
    surfaceLabel(command.surface),
    formatLabel(command.format),
  ];

  if (command.method !== undefined && command.url !== undefined) {
    detailLabels.push(`${command.method} ${command.url}`);
  } else if (command.command !== undefined) {
    detailLabels.push(command.command);
  }
  if (command.entryPoint !== undefined) {
    detailLabels.push(`Entry point ${command.entryPoint}`);
  }
  if (command.packagePath !== undefined) {
    detailLabels.push(command.packagePath);
  }

  return {
    id: `ingest_evidence_command.${sanitizeIdentifier(
      command.id,
      `command_${command.index + 1}`,
    )}`,
    commandId: command.id,
    commandType: command.commandType,
    title: commandTitle(command),
    surface: command.surface,
    surfaceLabel: surfaceLabel(command.surface),
    format: command.format,
    formatLabel: formatLabel(command.format),
    method: command.method,
    url: command.url,
    routePath: command.routePath,
    command: command.command,
    entryPoint: command.entryPoint,
    packagePath: command.packagePath,
    status,
    statusLabel: statusLabel(status),
    detailLabels,
    ariaLabel: [
      commandTitle(command),
      surfaceLabel(command.surface),
      formatLabel(command.format),
      statusLabel(status),
    ].join(", "),
  };
}

function mergeRoute(
  routes: Map<string, NormalizedRoute>,
  next: NormalizedRoute,
): void {
  const existing = routes.get(next.routeId);

  if (existing === undefined) {
    routes.set(next.routeId, {
      ...next,
      formats: uniqueStrings(next.formats),
      commandIds: uniqueStrings(next.commandIds),
    });
    return;
  }

  routes.set(next.routeId, {
    ...existing,
    surface: strongerRouteSurface(existing.surface, next.surface),
    method: strongerMethod(existing.method, next.method),
    formats: uniqueStrings([...existing.formats, ...next.formats]),
    commandIds: uniqueStrings([...existing.commandIds, ...next.commandIds]),
  });
}

function buildRouteRow(route: NormalizedRoute): IngestEvidenceRouteRow {
  const formatLabels = route.formats.map(formatLabel).sort();
  const commandIds = route.commandIds.slice().sort();
  const status: IngestSearchViewStatus =
    commandIds.length > 0 ? "complete" : "ready";
  const detailLabels = [
    surfaceLabel(route.surface),
    formatCount(formatLabels.length, "format"),
    formatCount(commandIds.length, "command"),
  ];

  return {
    id: `ingest_evidence_route.${route.routeId}`,
    routeId: route.routeId,
    title: `${route.method} ${route.routePath}`,
    method: route.method,
    routePath: route.routePath,
    surface: route.surface,
    surfaceLabel: surfaceLabel(route.surface),
    formatLabels,
    commandIds,
    status,
    statusLabel: statusLabel(status),
    detailLabels,
    ariaLabel: [
      `${route.method} ${route.routePath}`,
      surfaceLabel(route.surface),
      statusLabel(status),
      formatCount(formatLabels.length, "format"),
      formatCount(commandIds.length, "command"),
    ].join(", "),
  };
}

function normalizePackageDescriptors(root: AnyRecord): NormalizedDescriptor[] {
  const packageMetadata = recordField(root, "packageMetadata", "package_metadata");
  const manifestRoot =
    recordField(packageMetadata, "manifest") ??
    (isManifestLike(root) ? root : undefined);

  if (packageMetadata === undefined && manifestRoot === undefined) {
    return [];
  }

  const descriptors: NormalizedDescriptor[] = [];

  if (packageMetadata !== undefined) {
    const kind = stringField(packageMetadata, "kind") ?? "ingest-evidence.package";
    descriptors.push({
      descriptorId: "package",
      rank: 0,
      title: "Package",
      kind,
      version: integerField(packageMetadata, "version"),
      fingerprint: stringField(packageMetadata, "fingerprint"),
      detailLabels: descriptorDetails(packageMetadata, kind),
    });
  }

  if (manifestRoot !== undefined) {
    const kind = stringField(manifestRoot, "kind") ?? "ingest-evidence.manifest";
    descriptors.push({
      descriptorId: "manifest",
      rank: 1,
      title: "Manifest",
      kind,
      version: integerField(manifestRoot, "version"),
      fingerprint: stringField(manifestRoot, "fingerprint"),
      recordCount: integerField(manifestRoot, "recordCount", "record_count"),
      detailLabels: descriptorDetails(manifestRoot, kind),
    });

    const evidence = recordField(manifestRoot, "evidence");
    if (evidence !== undefined) {
      const evidenceKind = stringField(evidence, "schemaVersion", "schema_version") ??
        "evidence";
      descriptors.push({
        descriptorId: "evidence",
        rank: 2,
        title: "Evidence",
        kind: evidenceKind,
        fingerprint: stringField(evidence, "fingerprint"),
        detailLabels: descriptorDetails(evidence, evidenceKind),
      });
    }

    const jsonl = recordField(manifestRoot, "jsonl");
    if (jsonl !== undefined) {
      descriptors.push({
        descriptorId: "jsonl",
        rank: 3,
        title: "JSONL",
        kind: "jsonl",
        fingerprint: stringField(jsonl, "fingerprint"),
        mediaType: stringField(jsonl, "mediaType", "media_type"),
        byteCount: integerField(jsonl, "bytes"),
        lineCount: integerField(jsonl, "lines"),
        detailLabels: descriptorDetails(jsonl, "jsonl"),
      });
    }

    const csv = recordField(manifestRoot, "csv");
    if (csv !== undefined) {
      descriptors.push({
        descriptorId: "csv",
        rank: 4,
        title: "CSV",
        kind: "csv",
        fingerprint: stringField(csv, "fingerprint"),
        mediaType: stringField(csv, "mediaType", "media_type"),
        byteCount: integerField(csv, "bytes"),
        rowCount: integerField(csv, "rows"),
        columnCount: arrayField(csv, "columns").length,
        detailLabels: descriptorDetails(csv, "csv"),
      });
    }
  }

  return descriptors;
}

function buildPackageDescriptor(
  descriptor: NormalizedDescriptor,
): IngestEvidencePackageDescriptor {
  const status: IngestSearchViewStatus =
    descriptor.fingerprint === undefined ? "attention" : "complete";
  const detailLabels = [...descriptor.detailLabels];

  if (descriptor.fingerprint !== undefined) {
    detailLabels.push(`Fingerprint ${descriptor.fingerprint}`);
  }

  return {
    id: `ingest_evidence_package.${descriptor.descriptorId}`,
    descriptorId: descriptor.descriptorId,
    title: descriptor.title,
    kind: descriptor.kind,
    status,
    statusLabel: statusLabel(status),
    fingerprint: descriptor.fingerprint,
    mediaType: descriptor.mediaType,
    byteCount: descriptor.byteCount,
    recordCount: descriptor.recordCount,
    rowCount: descriptor.rowCount,
    lineCount: descriptor.lineCount,
    columnCount: descriptor.columnCount,
    version: descriptor.version,
    detailLabels,
    ariaLabel: [
      descriptor.title,
      descriptor.kind,
      statusLabel(status),
      descriptor.fingerprint ?? "fingerprint unavailable",
    ].join(", "),
  };
}

function descriptorDetails(record: AnyRecord, kind: string): string[] {
  const details = [kind];
  const version = integerField(record, "version");
  const recordCount = integerField(record, "recordCount", "record_count");
  const bytes = integerField(record, "bytes");
  const lines = integerField(record, "lines");
  const rows = integerField(record, "rows");
  const columns = arrayField(record, "columns").length;
  const mediaType = stringField(record, "mediaType", "media_type");
  const createdAt = timestampField(record, "createdAt", "created_at");
  const workspaceId = stringField(record, "workspaceId", "workspace_id");

  if (version !== undefined) {
    details.push(`Version ${version}`);
  }
  if (recordCount !== undefined) {
    details.push(formatCount(recordCount, "record"));
  }
  if (bytes !== undefined) {
    details.push(formatBytes(bytes));
  }
  if (lines !== undefined) {
    details.push(formatCount(lines, "line"));
  }
  if (rows !== undefined) {
    details.push(formatCount(rows, "row"));
  }
  if (columns > 0) {
    details.push(formatCount(columns, "column"));
  }
  if (mediaType !== undefined) {
    details.push(mediaType);
  }
  if (createdAt !== undefined) {
    details.push(`Created at ${createdAt}`);
  }
  if (workspaceId !== undefined) {
    details.push(`Workspace ${workspaceId}`);
  }

  return details;
}

function commandTitle(command: NormalizedCommand): string {
  if (command.commandType === "validation") {
    return `Validation ${command.index + 1}`;
  }
  return `${surfaceLabel(command.surface)} ${formatLabel(command.format)}`;
}

function routePathFromCommand(
  command: NormalizedCommand,
): string | undefined {
  if (command.routePath !== undefined) {
    return command.routePath;
  }
  return undefined;
}

function routeId(routePath: string): string {
  const path = routePathFromRoute(routePath);
  return sanitizeIdentifier(path, "route");
}

function routePathFromRoute(route: string): string {
  return pathFromUrl(route) ?? route;
}

function methodFromRoute(route: string): string {
  if (route === "local-package-helper" || !route.startsWith("/")) {
    return "LOCAL";
  }
  return "POST";
}

function pathFromUrl(value: string): string | undefined {
  if (value.startsWith("/")) {
    return value;
  }

  try {
    return new URL(value).pathname;
  } catch {
    return undefined;
  }
}

function strongerRouteSurface(
  left: IngestEvidenceRouteSurface,
  right: IngestEvidenceRouteSurface,
): IngestEvidenceRouteSurface {
  return routeSurfaceRank(right) < routeSurfaceRank(left) ? right : left;
}

function strongerMethod(left: string, right: string): string {
  if (left === "LOCAL") {
    return right;
  }
  if (right === "LOCAL") {
    return left;
  }
  return left.localeCompare(right) <= 0 ? left : right;
}

function localOnlyStatus(
  localOnly: boolean,
  mode: string | undefined,
  blockedUrlPrefixes: readonly string[],
): IngestSearchViewStatus {
  if (blockedUrlPrefixes.length > 0) {
    return "error";
  }
  if (!localOnly) {
    return "attention";
  }
  if (normalizeToken(mode) === "disabled") {
    return "complete";
  }
  return "ready";
}

function isLocalUrlPrefix(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" ||
        url.hostname === "localhost" ||
        url.hostname === "::1")
    );
  } catch {
    return false;
  }
}

function isManifestLike(value: AnyRecord): boolean {
  return (
    stringField(value, "kind") === "ingest-evidence.manifest" ||
    recordField(value, "jsonl") !== undefined ||
    recordField(value, "csv") !== undefined
  );
}

function normalizeSurface(
  value: string | undefined,
): IngestEvidenceRouteSurface {
  const normalized = normalizeToken(value);
  if (normalized === "api") {
    return "api";
  }
  if (normalized === "cli") {
    return "cli";
  }
  if (normalized === "package") {
    return "package";
  }
  if (normalized === "sdk") {
    return "sdk";
  }
  if (normalized === "schema") {
    return "schema";
  }
  if (normalized === "validation") {
    return "validation";
  }
  return "local";
}

function surfaceLabel(surface: IngestEvidenceRouteSurface): string {
  switch (surface) {
    case "api":
      return "API";
    case "cli":
      return "CLI";
    case "package":
      return "Package";
    case "sdk":
      return "SDK";
    case "schema":
      return "Schema";
    case "validation":
      return "Validation";
    case "local":
      return "Local";
  }
}

function formatLabel(format: string): string {
  const normalized = normalizeToken(format);
  if (normalized === "jsonl") {
    return "JSONL";
  }
  if (normalized === "csv") {
    return "CSV";
  }
  if (normalized === "json") {
    return "JSON";
  }
  if (normalized === "sdk") {
    return "SDK";
  }
  return titleCaseToken(format);
}

function redactionScopeLabel(scope: string): string {
  switch (normalizeToken(scope)) {
    case "sessionid":
    case "session_id":
      return "Session ID";
    case "credentiallikekeys":
    case "credential_like_keys":
      return "Credential-like keys";
    case "credentiallikevalues":
    case "credential_like_values":
      return "Credential-like values";
    case "requesterrordetails":
    case "request_error_details":
      return "Request error details";
    default:
      return titleCaseToken(scope);
  }
}

function redactionApplyLabel(target: string): string {
  switch (normalizeToken(target)) {
    case "jsonl":
      return "JSONL";
    case "csv":
      return "CSV";
    case "manifest":
      return "Manifest";
    case "packagefingerprint":
    case "package_fingerprint":
      return "Package fingerprint";
    default:
      return titleCaseToken(target);
  }
}

function statusLabel(status: IngestSearchViewStatus): string {
  switch (status) {
    case "empty":
      return "Empty";
    case "ready":
      return "Ready";
    case "indexing":
      return "Indexing";
    case "attention":
      return "Needs attention";
    case "error":
      return "Error";
    case "complete":
      return "Complete";
  }
}

function errorLabel(context: IngestEvidenceReviewContext): string {
  switch (context) {
    case "session":
      return "Evidence session could not load";
    case "formats":
      return "Export formats could not load";
    case "commands":
      return "Commands could not load";
    case "routes":
      return "Routes could not load";
    case "package":
      return "Package manifest could not load";
    case "redaction":
      return "Redaction rules could not load";
    case "local":
      return "Local-only status could not load";
  }
}

function retryLabel(context: IngestEvidenceReviewContext): string {
  switch (context) {
    case "session":
      return "Retry session";
    case "formats":
      return "Retry formats";
    case "commands":
      return "Retry commands";
    case "routes":
      return "Retry routes";
    case "package":
      return "Retry package";
    case "redaction":
      return "Retry redaction";
    case "local":
      return "Retry local status";
  }
}

function defaultErrorDescription(context: IngestEvidenceReviewContext): string {
  switch (context) {
    case "session":
      return "Load an evidence export session JSON file and try again.";
    case "formats":
      return "Refresh export formats and try again.";
    case "commands":
      return "Refresh commands and try again.";
    case "routes":
      return "Refresh routes and try again.";
    case "package":
      return "Refresh package metadata and try again.";
    case "redaction":
      return "Refresh redaction rules and try again.";
    case "local":
      return "Refresh local-only details and try again.";
  }
}

function compareFormatCards(
  left: IngestEvidenceFormatCard,
  right: IngestEvidenceFormatCard,
): number {
  return (
    formatRank(left.format) - formatRank(right.format) ||
    surfaceRank(left.surface) - surfaceRank(right.surface) ||
    left.title.localeCompare(right.title) ||
    left.id.localeCompare(right.id)
  );
}

function compareCommandRows(
  left: IngestEvidenceCommandRow,
  right: IngestEvidenceCommandRow,
): number {
  return (
    commandTypeRank(left.commandType) - commandTypeRank(right.commandType) ||
    surfaceRank(left.surface) - surfaceRank(right.surface) ||
    formatRank(left.format) - formatRank(right.format) ||
    left.commandId.localeCompare(right.commandId)
  );
}

function compareRouteRows(
  left: IngestEvidenceRouteRow,
  right: IngestEvidenceRouteRow,
): number {
  return (
    surfaceRank(left.surface) - surfaceRank(right.surface) ||
    left.routePath.localeCompare(right.routePath) ||
    left.method.localeCompare(right.method) ||
    left.routeId.localeCompare(right.routeId)
  );
}

function comparePackageDescriptors(
  left: IngestEvidencePackageDescriptor,
  right: IngestEvidencePackageDescriptor,
): number {
  return descriptorRank(left.descriptorId) - descriptorRank(right.descriptorId);
}

function formatRank(format: string): number {
  switch (normalizeToken(format)) {
    case "summary":
      return 0;
    case "json":
      return 1;
    case "jsonl":
      return 2;
    case "csv":
      return 3;
    case "manifest":
      return 4;
    case "package":
      return 5;
    case "preview":
      return 6;
    case "validation":
      return 7;
    default:
      return 20;
  }
}

function surfaceRank(surface: IngestEvidenceRouteSurface): number {
  switch (surface) {
    case "cli":
      return 0;
    case "api":
      return 1;
    case "sdk":
      return 2;
    case "package":
      return 3;
    case "schema":
      return 4;
    case "validation":
      return 5;
    case "local":
      return 6;
  }
}

function routeSurfaceRank(surface: IngestEvidenceRouteSurface): number {
  switch (surface) {
    case "api":
      return 0;
    case "package":
      return 1;
    case "cli":
      return 2;
    case "sdk":
      return 3;
    case "schema":
      return 4;
    case "validation":
      return 5;
    case "local":
      return 6;
  }
}

function commandTypeRank(commandType: IngestEvidenceCommandType): number {
  switch (commandType) {
    case "session":
      return 0;
    case "validation":
      return 1;
  }
}

function descriptorRank(descriptorId: string): number {
  switch (descriptorId) {
    case "package":
      return 0;
    case "manifest":
      return 1;
    case "evidence":
      return 2;
    case "jsonl":
      return 3;
    case "csv":
      return 4;
    default:
      return 20;
  }
}

function stringField(
  record: AnyRecord | undefined,
  ...keys: string[]
): string | undefined {
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return undefined;
}

function booleanField(
  record: AnyRecord,
  ...keys: string[]
): boolean | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return undefined;
}

function integerField(
  record: AnyRecord | undefined,
  ...keys: string[]
): number | undefined {
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.trunc(value);
    }
  }
  return undefined;
}

function timestampField(
  record: AnyRecord,
  ...keys: string[]
): string | undefined {
  const value = stringField(record, ...keys);
  return value !== undefined && !Number.isNaN(Date.parse(value))
    ? value
    : undefined;
}

function arrayField(record: AnyRecord | undefined, ...keys: string[]): unknown[] {
  if (!record) {
    return [];
  }
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function stringArrayField(
  record: AnyRecord | undefined,
  ...keys: string[]
): string[] {
  return arrayField(record, ...keys)
    .filter((value): value is string => typeof value === "string" && value.trim() !== "")
    .map((value) => value.trim());
}

function recordField(
  record: AnyRecord | undefined,
  ...keys: string[]
): AnyRecord | undefined {
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (isRecord(value)) {
      return value;
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is AnyRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function normalizeDefaultTimestamp(value: string | undefined): string {
  return value !== undefined && !Number.isNaN(Date.parse(value))
    ? value
    : DEFAULT_TIMESTAMP;
}

function normalizeToken(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "_") ?? "";
}

function sanitizeIdentifier(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96);

  return normalized === "" ? fallback : normalized;
}

function titleCaseToken(value: string): string {
  const words = value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);

  if (words.length === 0) {
    return "Ingest item";
  }

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function formatCount(
  value: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function formatBytes(value: number): string {
  return `${value} bytes`;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value !== ""))];
}

function errorMessage(error: unknown): string | undefined {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }
  if (typeof error === "string" && error.trim() !== "") {
    return error.trim();
  }
  return undefined;
}

function cloneReviewState(
  state: IngestEvidenceReviewState,
): IngestEvidenceReviewState {
  return {
    ...state,
    localOnlyStatus: cloneLocalOnlyStatus(state.localOnlyStatus),
    formatCards: state.formatCards.map(cloneFormatCard),
    commandRows: state.commandRows.map(cloneCommandRow),
    routeRows: state.routeRows.map(cloneRouteRow),
    packageDescriptors: state.packageDescriptors.map(clonePackageDescriptor),
    redactionSummary: cloneRedactionSummary(state.redactionSummary),
    emptyStates: {
      formats: { ...state.emptyStates.formats },
      commands: { ...state.emptyStates.commands },
      routes: { ...state.emptyStates.routes },
      packageDescriptors: { ...state.emptyStates.packageDescriptors },
      redaction: { ...state.emptyStates.redaction },
    },
    errorStates: state.errorStates.map(cloneErrorState),
  };
}

function cloneFormatCard(card: IngestEvidenceFormatCard): IngestEvidenceFormatCard {
  return {
    ...card,
    detailLabels: [...card.detailLabels],
  };
}

function cloneCommandRow(row: IngestEvidenceCommandRow): IngestEvidenceCommandRow {
  return {
    ...row,
    detailLabels: [...row.detailLabels],
  };
}

function cloneRouteRow(row: IngestEvidenceRouteRow): IngestEvidenceRouteRow {
  return {
    ...row,
    formatLabels: [...row.formatLabels],
    commandIds: [...row.commandIds],
    detailLabels: [...row.detailLabels],
  };
}

function clonePackageDescriptor(
  descriptor: IngestEvidencePackageDescriptor,
): IngestEvidencePackageDescriptor {
  return {
    ...descriptor,
    detailLabels: [...descriptor.detailLabels],
  };
}

function cloneRedactionSummary(
  summary: IngestEvidenceRedactionSummary,
): IngestEvidenceRedactionSummary {
  return {
    ...summary,
    scopes: [...summary.scopes],
    scopeLabels: [...summary.scopeLabels],
    appliesBefore: [...summary.appliesBefore],
    appliesBeforeLabels: [...summary.appliesBeforeLabels],
    detailLabels: [...summary.detailLabels],
    emptyState: { ...summary.emptyState },
  };
}

function cloneLocalOnlyStatus(
  status: IngestEvidenceLocalOnlyStatus,
): IngestEvidenceLocalOnlyStatus {
  return {
    ...status,
    allowedUrlPrefixes: [...status.allowedUrlPrefixes],
    allowedUriPrefixes: [...status.allowedUriPrefixes],
    blockedUrlPrefixes: [...status.blockedUrlPrefixes],
    detailLabels: [...status.detailLabels],
  };
}

function cloneErrorState(
  error: IngestEvidenceReviewErrorState,
): IngestEvidenceReviewErrorState {
  return {
    ...error,
    errorState: { ...error.errorState },
  };
}

function clonePlain<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString() as T;
  }

  const objectValue = value as object;
  const existing = seen.get(objectValue);
  if (existing) {
    return existing as T;
  }

  if (Array.isArray(value)) {
    const cloned: unknown[] = [];
    seen.set(objectValue, cloned);
    for (const item of value) {
      cloned.push(clonePlain(item, seen));
    }
    return cloned as T;
  }

  const cloned: Record<string, unknown> = {};
  seen.set(objectValue, cloned);
  for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
    cloned[key] = clonePlain(entryValue, seen);
  }
  return cloned as T;
}
