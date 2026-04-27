import {
  buildIngestEvidenceCommandRows,
  buildIngestEvidenceFormatCards,
  buildIngestEvidenceLocalOnlyStatus,
  buildIngestEvidencePackageDescriptors,
  buildIngestEvidenceRedactionSummary,
  buildIngestEvidenceReview,
  buildIngestEvidenceReviewEmptyState,
  buildIngestEvidenceReviewErrorState,
  buildIngestEvidenceRouteRows,
  type IngestEvidenceCommandRow,
  type IngestEvidenceFormatCard,
  type IngestEvidenceLocalOnlyStatus,
  type IngestEvidencePackageDescriptor,
  type IngestEvidenceRedactionSummary,
  type IngestEvidenceReviewContext,
  type IngestEvidenceReviewEmptyStates,
  type IngestEvidenceReviewErrorState,
  type IngestEvidenceReviewState,
  type IngestEvidenceRouteRow,
} from "./ingestEvidenceReview.ts";

export type IngestEvidenceApiState = IngestEvidenceReviewState;

export interface BuildIngestEvidenceApiStateOptions {
  defaultTimestamp?: string;
  error?: unknown;
  apiBase?: string;
}

type AnyRecord = Record<string, unknown>;
type EvidenceResponseKind = "export" | "package";

interface EvidenceApiCandidate {
  response: AnyRecord;
  kind: EvidenceResponseKind;
  index: number;
  routeId?: string;
  routePath: string;
  method: string;
  url?: string;
  status?: number;
  error?: unknown;
}

interface EvidenceApiErrorCandidate {
  context: IngestEvidenceReviewContext;
  error: unknown;
}

interface NormalizedBridge {
  session: AnyRecord;
  errors: IngestEvidenceReviewErrorState[];
  descriptors: IngestEvidencePackageDescriptor[];
}

const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const EXPORT_ROUTE = "/v1/ingest/evidence/export";
const PACKAGE_ROUTE = "/v1/ingest/evidence/package";

export function buildIngestEvidenceApiState(
  input: unknown,
  options: BuildIngestEvidenceApiStateOptions = {},
): IngestEvidenceApiState {
  const root = clonePlain(input);

  if (!isRecord(root)) {
    const state = buildIngestEvidenceReview(root, {
      defaultTimestamp: options.defaultTimestamp,
      error: options.error,
    });
    return cloneReviewState(state);
  }

  const bridge = normalizeBridge(root, options);
  const state = buildIngestEvidenceReview(bridge.session, {
    defaultTimestamp: options.defaultTimestamp,
    error: options.error,
  });

  return cloneReviewState({
    ...state,
    packageDescriptors: mergePackageDescriptors(
      state.packageDescriptors,
      bridge.descriptors,
    ),
    errorStates: mergeErrorStates(state.errorStates, bridge.errors),
  });
}

export function buildIngestEvidenceApiFormatCards(
  input: unknown,
  options: BuildIngestEvidenceApiStateOptions = {},
): IngestEvidenceFormatCard[] {
  const bridge = normalizeBridgeInput(input, options);
  return buildIngestEvidenceFormatCards(bridge.session).map(cloneFormatCard);
}

export function buildIngestEvidenceApiCommandRows(
  input: unknown,
  options: BuildIngestEvidenceApiStateOptions = {},
): IngestEvidenceCommandRow[] {
  const bridge = normalizeBridgeInput(input, options);
  return buildIngestEvidenceCommandRows(bridge.session).map(cloneCommandRow);
}

export function buildIngestEvidenceApiRouteRows(
  input: unknown,
  options: BuildIngestEvidenceApiStateOptions = {},
): IngestEvidenceRouteRow[] {
  const bridge = normalizeBridgeInput(input, options);
  return buildIngestEvidenceRouteRows(bridge.session).map(cloneRouteRow);
}

export function buildIngestEvidenceApiPackageDescriptors(
  input: unknown,
  options: BuildIngestEvidenceApiStateOptions = {},
): IngestEvidencePackageDescriptor[] {
  return buildIngestEvidenceApiState(input, options).packageDescriptors.map(
    clonePackageDescriptor,
  );
}

export function buildIngestEvidenceApiLocalOnlyStatus(
  input: unknown,
  options: BuildIngestEvidenceApiStateOptions = {},
): IngestEvidenceLocalOnlyStatus {
  const bridge = normalizeBridgeInput(input, options);
  return cloneLocalOnlyStatus(buildIngestEvidenceLocalOnlyStatus(bridge.session));
}

export function buildIngestEvidenceApiRedactionSummary(
  input: unknown,
  options: BuildIngestEvidenceApiStateOptions = {},
): IngestEvidenceRedactionSummary {
  const bridge = normalizeBridgeInput(input, options);
  return cloneRedactionSummary(buildIngestEvidenceRedactionSummary(bridge.session));
}

export function buildIngestEvidenceApiEmptyStates(): IngestEvidenceReviewEmptyStates {
  return {
    formats: { ...buildIngestEvidenceReviewEmptyState("formats") },
    commands: { ...buildIngestEvidenceReviewEmptyState("commands") },
    routes: { ...buildIngestEvidenceReviewEmptyState("routes") },
    packageDescriptors: { ...buildIngestEvidenceReviewEmptyState("package") },
    redaction: { ...buildIngestEvidenceReviewEmptyState("redaction") },
  };
}

export function buildIngestEvidenceApiErrorStates(
  input: unknown,
  options: BuildIngestEvidenceApiStateOptions = {},
): IngestEvidenceReviewErrorState[] {
  const errors = normalizeBridgeInput(input, options).errors;
  const optionError =
    options.error === undefined
      ? []
      : [buildIngestEvidenceReviewErrorState("session", options.error)];

  return mergeErrorStates(optionError, errors).map(cloneErrorState);
}

function normalizeBridgeInput(
  input: unknown,
  options: BuildIngestEvidenceApiStateOptions,
): NormalizedBridge {
  const root = clonePlain(input);

  if (!isRecord(root)) {
    return {
      session: root as AnyRecord,
      errors: [],
      descriptors: [],
    };
  }

  return normalizeBridge(root, options);
}

function normalizeBridge(
  root: AnyRecord,
  options: BuildIngestEvidenceApiStateOptions,
): NormalizedBridge {
  if (isReviewSession(root)) {
    return {
      session: clonePlain(root),
      errors: collectApiErrors(root, options),
      descriptors: [],
    };
  }

  const apiBase = stringField(root, "apiBase", "api_base") ?? options.apiBase;
  const candidates = collectEvidenceCandidates(root, apiBase);
  const errors = collectApiErrors(root, options);

  if (candidates.length === 0) {
    return {
      session: buildEmptySession(root, options),
      errors,
      descriptors: [],
    };
  }

  const session = buildSessionFromCandidates(root, candidates, options, apiBase);
  const descriptors = candidates.flatMap((candidate) =>
    buildCandidatePackageDescriptors(candidate),
  );

  return {
    session,
    errors,
    descriptors,
  };
}

function isReviewSession(root: AnyRecord): boolean {
  return (
    Array.isArray(root.expectedFormats) ||
    Array.isArray(root.expected_formats) ||
    Array.isArray(root.commands) ||
    isRecord(root.packageMetadata) ||
    isRecord(root.package_metadata)
  );
}

function buildEmptySession(
  root: AnyRecord,
  options: BuildIngestEvidenceApiStateOptions,
): AnyRecord {
  return {
    schemaVersion: stringField(root, "schemaVersion", "schema_version"),
    generatedAt: normalizeTimestamp(
      timestampField(root, "generatedAt", "generated_at"),
      options.defaultTimestamp,
    ),
    workspaceId: stringField(root, "workspaceId", "workspace_id"),
    sessionId: stringField(root, "sessionId", "session_id"),
    localOnly: booleanField(root, "localOnly", "local_only") ?? false,
    network: buildNetworkSummary([], stringField(root, "apiBase", "api_base") ?? options.apiBase),
    expectedFormats: [],
    commands: [],
    validationCommands: [],
  };
}

function buildSessionFromCandidates(
  root: AnyRecord,
  candidates: readonly EvidenceApiCandidate[],
  options: BuildIngestEvidenceApiStateOptions,
  apiBase: string | undefined,
): AnyRecord {
  const manifests = candidates
    .map((candidate) => recordField(candidate.response, "manifest"))
    .filter(isDefined);
  const firstManifest = manifests[0];
  const evidence = firstManifest ? evidenceFromManifest(firstManifest) : undefined;
  const packageCandidate = candidates.find((candidate) => candidate.kind === "package");

  return {
    schemaVersion:
      stringField(root, "schemaVersion", "schema_version") ??
      stringField(firstManifest, "schemaVersion", "schema_version") ??
      "ingest-evidence-api-bridge.v1",
    generatedAt: normalizeTimestamp(
      timestampField(root, "generatedAt", "generated_at") ??
        timestampField(firstManifest, "createdAt", "created_at") ??
        timestampField(candidates[0].response, "createdAt", "created_at"),
      options.defaultTimestamp,
    ),
    workspaceId:
      stringField(root, "workspaceId", "workspace_id") ??
      stringField(firstManifest, "workspaceId", "workspace_id"),
    sessionId:
      stringField(root, "sessionId", "session_id") ??
      stringField(firstManifest, "sessionId", "session_id"),
    localOnly:
      booleanField(root, "localOnly", "local_only") ??
      booleanField(firstManifest ?? {}, "localOnly", "local_only") ??
      false,
    network: buildNetworkSummary(candidates, apiBase),
    evidence: evidence ?? evidenceFromResponse(candidates[0].response),
    exportInput: exportInputFromManifest(firstManifest),
    expectedFormats: candidates.map(buildExpectedFormat).filter(isDefined),
    commands: candidates.map(buildCommand).filter(isDefined),
    validationCommands: [],
    packageMetadata:
      packageCandidate === undefined
        ? undefined
        : packageMetadataFromPackageResponse(packageCandidate.response),
  };
}

function collectEvidenceCandidates(
  root: AnyRecord,
  apiBase: string | undefined,
): EvidenceApiCandidate[] {
  if (isEvidenceApiResponse(root)) {
    return [candidateFromResponse(root, 0, undefined, apiBase)];
  }

  const body = recordField(root, "body");
  if (body && isEvidenceApiResponse(body)) {
    return [candidateFromResponse(body, 0, root, apiBase)];
  }

  const response = recordField(root, "response");
  const responseBody = recordField(response, "body");
  if (responseBody && isEvidenceApiResponse(responseBody)) {
    return [candidateFromResponse(responseBody, 0, root, apiBase)];
  }

  return arrayField(root, "requests")
    .map((entry, index) => {
      if (!isRecord(entry)) {
        return undefined;
      }
      const entryResponse = recordField(entry, "response");
      const entryBody = recordField(entryResponse, "body");
      if (!entryBody || !isEvidenceApiResponse(entryBody)) {
        return undefined;
      }
      return candidateFromResponse(entryBody, index, entry, apiBase);
    })
    .filter(isDefined);
}

function candidateFromResponse(
  response: AnyRecord,
  index: number,
  envelope: AnyRecord | undefined,
  apiBase: string | undefined,
): EvidenceApiCandidate {
  const kind = evidenceKind(response) ?? "export";
  const route = recordField(envelope, "route");
  const envelopeResponse = recordField(envelope, "response");
  const routePath =
    stringField(route, "path") ??
    (kind === "package" ? PACKAGE_ROUTE : EXPORT_ROUTE);
  const method = stringField(route, "method")?.toUpperCase() ?? "POST";
  const url = absoluteRouteUrl(routePath, apiBase);

  return {
    response: clonePlain(response),
    kind,
    index,
    routeId: stringField(envelope, "id"),
    routePath,
    method,
    url,
    status: integerField(envelopeResponse, "status"),
    error: apiErrorMessage(envelopeResponse ?? response),
  };
}

function collectApiErrors(
  root: AnyRecord,
  options: BuildIngestEvidenceApiStateOptions,
): IngestEvidenceReviewErrorState[] {
  const errors: EvidenceApiErrorCandidate[] = [];

  collectRecordError(root, errors);
  for (const entry of arrayField(root, "requests")) {
    if (isRecord(entry)) {
      collectRecordError(entry, errors);
    }
  }
  if (options.error !== undefined) {
    errors.push({ context: "session", error: options.error });
  }

  return errors
    .map((error) => buildIngestEvidenceReviewErrorState(error.context, error.error))
    .map(cloneErrorState);
}

function collectRecordError(
  record: AnyRecord,
  errors: EvidenceApiErrorCandidate[],
): void {
  const response = recordField(record, "response") ?? record;
  const message = apiErrorMessage(response);
  if (message === undefined) {
    return;
  }

  errors.push({
    context: errorContextFromRoute(record),
    error: message,
  });
}

function errorContextFromRoute(record: AnyRecord): IngestEvidenceReviewContext {
  const route = recordField(record, "route");
  const routePath = stringField(route, "path") ?? stringField(record, "routePath", "route_path") ?? "";
  if (routePath.includes("/package")) {
    return "package";
  }
  if (routePath.includes("/export")) {
    return "session";
  }
  return "session";
}

function buildExpectedFormat(
  candidate: EvidenceApiCandidate,
): AnyRecord | undefined {
  const format = responseFormat(candidate.response, candidate.kind);
  if (format === undefined) {
    return undefined;
  }

  return {
    format,
    mediaType: stringField(candidate.response, "mediaType", "media_type") ?? "application/json",
    surface: "api",
    route: candidate.routePath,
    manifestDescriptor: manifestDescriptorForFormat(format),
    commandId: commandIdForCandidate(candidate),
  };
}

function buildCommand(candidate: EvidenceApiCandidate): AnyRecord | undefined {
  const format = responseFormat(candidate.response, candidate.kind);
  if (format === undefined) {
    return undefined;
  }

  return {
    id: commandIdForCandidate(candidate),
    surface: "api",
    format,
    method: candidate.method,
    url: candidate.url ?? candidate.routePath,
  };
}

function commandIdForCandidate(candidate: EvidenceApiCandidate): string {
  if (candidate.kind === "package") {
    return "api_package";
  }
  return `api_export_${responseFormat(candidate.response, candidate.kind) ?? "json"}`;
}

function responseFormat(
  response: AnyRecord,
  kind: EvidenceResponseKind,
): string | undefined {
  if (kind === "package") {
    return "package";
  }
  return stringField(response, "format") ?? "json";
}

function manifestDescriptorForFormat(format: string): string {
  switch (normalizeToken(format)) {
    case "summary":
      return "evidenceSummary";
    case "manifest":
      return "manifest";
    case "package":
      return "manifest";
    default:
      return "content";
  }
}

function packageMetadataFromPackageResponse(response: AnyRecord): AnyRecord {
  const manifest = recordField(response, "manifest");

  return {
    kind: stringField(response, "kind") ?? "ingest-evidence.package",
    version: integerField(response, "version"),
    fingerprint: stringField(response, "fingerprint"),
    manifest: manifest === undefined ? undefined : reviewManifestFromApiManifest(manifest),
  };
}

function reviewManifestFromApiManifest(manifest: AnyRecord): AnyRecord {
  const content = recordField(manifest, "content");

  return {
    ...clonePlain(manifest),
    recordCount: sectionItemCount(manifest),
    workspaceId: stringField(manifest, "workspaceId", "workspace_id"),
    evidence: {
      schemaVersion: stringField(manifest, "schemaVersion", "schema_version") ?? "evidence",
      generatedAt: timestampField(manifest, "createdAt", "created_at"),
      workspaceId: stringField(manifest, "workspaceId", "workspace_id"),
      sessionId: stringField(manifest, "sessionId", "session_id"),
      localOnly: booleanField(manifest, "localOnly", "local_only") ?? false,
      fingerprint: stringField(content, "fingerprint"),
      bytes: integerField(content, "bytes"),
      mediaType: stringField(content, "mediaType", "media_type"),
    },
  };
}

function buildCandidatePackageDescriptors(
  candidate: EvidenceApiCandidate,
): IngestEvidencePackageDescriptor[] {
  if (candidate.kind === "package") {
    return buildPackageResponseDescriptors(candidate.response);
  }
  return buildExportResponseDescriptors(candidate.response);
}

function buildExportResponseDescriptors(
  response: AnyRecord,
): IngestEvidencePackageDescriptor[] {
  const format = stringField(response, "format") ?? "json";
  const descriptors: IngestEvidencePackageDescriptor[] = [
    descriptorFromRecord({
      descriptorId: `export_${sanitizeIdentifier(format, "json")}`,
      title: `${formatLabel(format)} export`,
      kind: stringField(response, "kind") ?? "ingest-evidence.export",
      fingerprint: stringField(response, "fingerprint"),
      mediaType: stringField(response, "mediaType", "media_type"),
      byteCount: byteCountFromResponse(response),
      version: integerField(response, "version"),
      detailLabels: [
        formatLabel(format),
        stringField(response, "mediaType", "media_type") ?? "application/json",
      ],
    }),
  ];
  const manifest = recordField(response, "manifest");

  if (manifest !== undefined) {
    descriptors.push(
      descriptorFromRecord({
        descriptorId: "manifest",
        title: "Manifest",
        kind: stringField(manifest, "kind") ?? "ingest-evidence.manifest",
        fingerprint: stringField(manifest, "fingerprint"),
        version: integerField(manifest, "version"),
        recordCount: sectionItemCount(manifest),
        detailLabels: manifestDetailLabels(manifest),
      }),
    );

    const content = recordField(manifest, "content");
    if (content !== undefined) {
      descriptors.push(
        descriptorFromRecord({
          descriptorId: "content",
          title: "Evidence content",
          kind: "evidence-content",
          fingerprint: stringField(content, "fingerprint"),
          mediaType: stringField(content, "mediaType", "media_type"),
          byteCount: integerField(content, "bytes"),
          detailLabels: contentDetailLabels(content, "content"),
        }),
      );
    }
  }

  return descriptors;
}

function buildPackageResponseDescriptors(
  response: AnyRecord,
): IngestEvidencePackageDescriptor[] {
  return arrayField(response, "files").map((file, index) => {
    const record = isRecord(file) ? file : {};
    const path = stringField(record, "path") ?? `file-${index + 1}`;
    return descriptorFromRecord({
      descriptorId: `file_${sanitizeIdentifier(path, `file_${index + 1}`)}`,
      title: path,
      kind: "package-file",
      fingerprint: stringField(record, "fingerprint"),
      mediaType: stringField(record, "mediaType", "media_type"),
      byteCount: integerField(record, "bytes"),
      detailLabels: contentDetailLabels(record, path),
    });
  });
}

function descriptorFromRecord(input: {
  descriptorId: string;
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
}): IngestEvidencePackageDescriptor {
  const status = input.fingerprint === undefined ? "attention" : "complete";
  const detailLabels = [...input.detailLabels];

  if (input.version !== undefined) {
    detailLabels.push(`Version ${input.version}`);
  }
  if (input.recordCount !== undefined) {
    detailLabels.push(formatCount(input.recordCount, "record"));
  }
  if (input.byteCount !== undefined) {
    detailLabels.push(`${input.byteCount} bytes`);
  }
  if (input.fingerprint !== undefined) {
    detailLabels.push(`Fingerprint ${input.fingerprint}`);
  }

  return {
    id: `ingest_evidence_package.${input.descriptorId}`,
    descriptorId: input.descriptorId,
    title: input.title,
    kind: input.kind,
    status,
    statusLabel: status === "complete" ? "Complete" : "Needs attention",
    fingerprint: input.fingerprint,
    mediaType: input.mediaType,
    byteCount: input.byteCount,
    recordCount: input.recordCount,
    rowCount: input.rowCount,
    lineCount: input.lineCount,
    columnCount: input.columnCount,
    version: input.version,
    detailLabels: uniqueStrings(detailLabels),
    ariaLabel: [
      input.title,
      input.kind,
      status === "complete" ? "Complete" : "Needs attention",
      input.fingerprint ?? "fingerprint unavailable",
    ].join(", "),
  };
}

function mergePackageDescriptors(
  base: readonly IngestEvidencePackageDescriptor[],
  extra: readonly IngestEvidencePackageDescriptor[],
): IngestEvidencePackageDescriptor[] {
  const descriptors = new Map<string, IngestEvidencePackageDescriptor>();

  for (const descriptor of [...base, ...extra]) {
    descriptors.set(descriptor.descriptorId, clonePackageDescriptor(descriptor));
  }

  return [...descriptors.values()].sort(comparePackageDescriptors);
}

function mergeErrorStates(
  base: readonly IngestEvidenceReviewErrorState[],
  extra: readonly IngestEvidenceReviewErrorState[],
): IngestEvidenceReviewErrorState[] {
  const states = new Map<string, IngestEvidenceReviewErrorState>();

  for (const error of [...base, ...extra]) {
    states.set(`${error.context}:${error.errorState.description}`, cloneErrorState(error));
  }

  return [...states.values()].sort(compareErrorStates);
}

function buildNetworkSummary(
  candidates: readonly EvidenceApiCandidate[],
  apiBase: string | undefined,
): AnyRecord {
  const allowedUrlPrefixes = uniqueStrings(
    [
      apiBase,
      ...candidates.map((candidate) => urlPrefix(candidate.url)),
    ].filter(isDefined),
  );

  return {
    mode: "disabled",
    allowedUrlPrefixes,
    allowedUriPrefixes: [],
    notes:
      allowedUrlPrefixes.length === 0
        ? "No API route URL was supplied by the replay."
        : "Replay uses captured local API response bodies.",
  };
}

function exportInputFromManifest(manifest: AnyRecord | undefined): AnyRecord | undefined {
  const filters = recordField(manifest, "filters");
  if (filters === undefined) {
    return undefined;
  }

  return {
    filters: clonePlain(filters),
  };
}

function evidenceFromManifest(manifest: AnyRecord): AnyRecord | undefined {
  const summary = recordField(manifest, "evidenceSummary", "evidence_summary");
  if (summary === undefined) {
    return undefined;
  }

  return {
    schemaVersion: stringField(manifest, "schemaVersion", "schema_version"),
    workspaceId: stringField(manifest, "workspaceId", "workspace_id"),
    sessionId: stringField(manifest, "sessionId", "session_id"),
    localOnly: booleanField(manifest, "localOnly", "local_only") ?? false,
    summary: clonePlain(summary),
  };
}

function evidenceFromResponse(response: AnyRecord): AnyRecord | undefined {
  const content = stringField(response, "content");
  if (content === undefined) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function sectionItemCount(manifest: AnyRecord): number | undefined {
  const sections = arrayField(manifest, "sections");
  if (sections.length === 0) {
    return undefined;
  }

  return sections.reduce((total, section) => {
    if (!isRecord(section)) {
      return total;
    }
    return total + Math.max(integerField(section, "itemCount", "item_count") ?? 0, 0);
  }, 0);
}

function manifestDetailLabels(manifest: AnyRecord): string[] {
  const labels = [stringField(manifest, "kind") ?? "ingest-evidence.manifest"];
  const createdAt = timestampField(manifest, "createdAt", "created_at");
  const workspaceId = stringField(manifest, "workspaceId", "workspace_id");
  const recordCount = sectionItemCount(manifest);

  if (recordCount !== undefined) {
    labels.push(formatCount(recordCount, "record"));
  }
  if (createdAt !== undefined) {
    labels.push(`Created at ${createdAt}`);
  }
  if (workspaceId !== undefined) {
    labels.push(`Workspace ${workspaceId}`);
  }

  return labels;
}

function contentDetailLabels(record: AnyRecord, label: string): string[] {
  const mediaType = stringField(record, "mediaType", "media_type");
  return [label, mediaType].filter(isDefined);
}

function byteCountFromResponse(response: AnyRecord): number | undefined {
  const explicit = integerField(response, "bytes");
  if (explicit !== undefined) {
    return explicit;
  }

  const content = stringField(response, "content");
  return content === undefined ? undefined : content.length;
}

function isEvidenceApiResponse(value: AnyRecord): boolean {
  return evidenceKind(value) !== undefined;
}

function evidenceKind(value: AnyRecord): EvidenceResponseKind | undefined {
  const kind = stringField(value, "kind");
  if (kind === "ingest-evidence.export") {
    return "export";
  }
  if (kind === "ingest-evidence.package") {
    return "package";
  }
  return undefined;
}

function apiErrorMessage(record: AnyRecord): string | undefined {
  const body = recordField(record, "body") ?? record;
  const error = recordField(body, "error");
  const message =
    (error ? stringField(error, "message") : undefined) ??
    (error ? stringField(error, "code") : undefined) ??
    stringField(body, "message");
  const status = integerField(record, "status");

  if (message !== undefined) {
    return message;
  }
  if (status !== undefined && status >= 400) {
    return `Request failed with status ${status}.`;
  }
  if (body.ok === false) {
    return "Request failed.";
  }
  return undefined;
}

function absoluteRouteUrl(
  routePath: string,
  apiBase: string | undefined,
): string | undefined {
  if (apiBase === undefined) {
    return routePath;
  }

  try {
    return new URL(routePath.replace(/^\/+/, ""), ensureTrailingSlash(apiBase)).href;
  } catch {
    return routePath;
  }
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function urlPrefix(value: string | undefined): string | undefined {
  if (value === undefined || value.startsWith("/")) {
    return undefined;
  }

  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return undefined;
  }
}

function comparePackageDescriptors(
  left: IngestEvidencePackageDescriptor,
  right: IngestEvidencePackageDescriptor,
): number {
  return descriptorRank(left.descriptorId) - descriptorRank(right.descriptorId) ||
    left.title.localeCompare(right.title) ||
    left.descriptorId.localeCompare(right.descriptorId);
}

function descriptorRank(descriptorId: string): number {
  switch (descriptorId) {
    case "package":
      return 0;
    case "manifest":
      return 1;
    case "evidence":
      return 2;
    case "content":
      return 3;
    case "jsonl":
      return 4;
    case "csv":
      return 5;
    case "file_manifest_json":
      return 6;
    case "file_evidence_json":
      return 7;
    default:
      return descriptorId.startsWith("export_") ? 8 : 20;
  }
}

function compareErrorStates(
  left: IngestEvidenceReviewErrorState,
  right: IngestEvidenceReviewErrorState,
): number {
  return contextRank(left.context) - contextRank(right.context) ||
    left.errorState.description.localeCompare(right.errorState.description) ||
    left.id.localeCompare(right.id);
}

function contextRank(context: IngestEvidenceReviewContext): number {
  switch (context) {
    case "session":
      return 0;
    case "formats":
      return 1;
    case "commands":
      return 2;
    case "routes":
      return 3;
    case "package":
      return 4;
    case "redaction":
      return 5;
    case "local":
      return 6;
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
  return titleCaseToken(format);
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

function normalizeTimestamp(
  value: string | undefined,
  fallback: string | undefined,
): string {
  if (value !== undefined && !Number.isNaN(Date.parse(value))) {
    return value;
  }
  if (fallback !== undefined && !Number.isNaN(Date.parse(fallback))) {
    return fallback;
  }
  return DEFAULT_TIMESTAMP;
}

function timestampField(
  record: AnyRecord | undefined,
  ...keys: string[]
): string | undefined {
  const value = stringField(record, ...keys);
  return value !== undefined && !Number.isNaN(Date.parse(value))
    ? value
    : undefined;
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

function formatCount(
  value: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value !== ""))];
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
