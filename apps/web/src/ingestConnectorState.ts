export type IngestConnectorReadinessStatus =
  | "empty"
  | "ready"
  | "attention"
  | "error";

export type IngestConnectorSafetyState =
  | "safe"
  | "untrusted"
  | "unsafe"
  | "malformed";

export type IngestConnectorWarningCode =
  | "malformed_manifest"
  | "unsafe_input"
  | "raw_path_input"
  | "secret_input"
  | "private_path_input";

export type IngestConnectorWarningSeverity =
  | "info"
  | "warning"
  | "blocking";

export interface IngestConnectorState {
  id: "ingest_connector_state";
  label: string;
  ariaLabel: string;
  status: IngestConnectorReadinessStatus;
  totalCount: number;
  readyCount: number;
  attentionCount: number;
  errorCount: number;
  warningCount: number;
  cards: IngestConnectorCard[];
  rows: IngestConnectorRow[];
  warnings: IngestConnectorWarning[];
  emptyState: IngestConnectorEmptyState;
}

export interface IngestConnectorCard {
  id: string;
  connectorId: string;
  title: string;
  subtitle: string;
  status: IngestConnectorReadinessStatus;
  statusLabel: string;
  safetyState: IngestConnectorSafetyState;
  safetyStateLabel: string;
  mediaTypes: string[];
  mediaTypeLabels: string[];
  citationCapabilities: string[];
  citationCapabilityLabels: string[];
  valueLabel: string;
  warningLabels: string[];
  detailLabels: string[];
  ariaLabel: string;
}

export interface IngestConnectorRow {
  id: string;
  connectorId: string;
  mediaTypes: string[];
  mediaTypeLabels: string[];
  citationCapabilities: string[];
  citationCapabilityLabels: string[];
  safetyState: IngestConnectorSafetyState;
  safetyStateLabel: string;
  readinessStatus: IngestConnectorReadinessStatus;
  readinessStatusLabel: string;
  warningCount: number;
  warningLabels: string[];
  ariaLabel: string;
}

export interface IngestConnectorWarning {
  id: string;
  connectorId: string;
  code: IngestConnectorWarningCode;
  severity: IngestConnectorWarningSeverity;
  label: string;
  description: string;
  fieldPath?: string;
}

export interface IngestConnectorEmptyState {
  id: "ingest_connector_empty";
  label: string;
  description: string;
  ariaLabel: string;
}

interface ConnectorCandidate {
  value: unknown;
  path: string;
  sourceKind: ConnectorSourceKind;
  warnings: WarningDraft[];
}

interface NormalizedConnector {
  connectorId: string;
  sourceKind: ConnectorSourceKind;
  mediaTypes: string[];
  mediaTypeLabels: string[];
  citationCapabilities: string[];
  citationCapabilityLabels: string[];
  safetyState: IngestConnectorSafetyState;
  readinessStatus: IngestConnectorReadinessStatus;
  warnings: IngestConnectorWarning[];
}

interface WarningDraft {
  code: IngestConnectorWarningCode;
  severity: IngestConnectorWarningSeverity;
  path?: string;
}

type ConnectorSourceKind = "sdk" | "api" | "python_cli" | "unknown";
type AnyRecord = Record<string, unknown>;

const LOCAL_URI_SCHEMES = new Set([
  "file",
  "fixture",
  "local",
  "sovereignops",
  "stdin",
  "workspace",
]);

export function buildIngestConnectorState(input: unknown): IngestConnectorState {
  const connectors = normalizeConnectorCandidates(input);
  const rows = connectors.map(buildConnectorRow).sort(compareConnectorRows);
  const cards = connectors.map(buildConnectorCard).sort(compareConnectorCards);
  const warnings = connectors
    .flatMap((connector) => connector.warnings)
    .sort(compareWarnings);
  const status = resolveStateStatus(rows);
  const state: IngestConnectorState = {
    id: "ingest_connector_state",
    label: "Ingest connectors",
    ariaLabel: [
      "Ingest connectors",
      formatCount(rows.length, "connector"),
      formatCount(warnings.length, "warning"),
      `status ${getIngestConnectorReadinessStatusLabel(status)}`,
    ].join(", "),
    status,
    totalCount: rows.length,
    readyCount: rows.filter((row) => row.readinessStatus === "ready").length,
    attentionCount: rows.filter((row) => row.readinessStatus === "attention")
      .length,
    errorCount: rows.filter((row) => row.readinessStatus === "error").length,
    warningCount: warnings.length,
    cards,
    rows,
    warnings,
    emptyState: buildIngestConnectorEmptyState(),
  };

  return deepFreeze(state);
}

export function buildIngestConnectorCards(input: unknown): IngestConnectorCard[] {
  return buildIngestConnectorState(input).cards;
}

export function buildIngestConnectorRows(input: unknown): IngestConnectorRow[] {
  return buildIngestConnectorState(input).rows;
}

export function getIngestConnectorReadinessStatusLabel(
  status: IngestConnectorReadinessStatus,
): string {
  switch (status) {
    case "empty":
      return "No connectors";
    case "ready":
      return "Ready";
    case "attention":
      return "Needs review";
    case "error":
      return "Blocked";
  }
}

export function getIngestConnectorSafetyStateLabel(
  state: IngestConnectorSafetyState,
): string {
  switch (state) {
    case "safe":
      return "Local safe";
    case "untrusted":
      return "Untrusted by default";
    case "unsafe":
      return "Unsafe input";
    case "malformed":
      return "Malformed manifest";
  }
}

export function buildIngestConnectorEmptyState(): IngestConnectorEmptyState {
  return {
    id: "ingest_connector_empty",
    label: "No connector manifests",
    description: "Connector capability cards will appear after a manifest loads.",
    ariaLabel: "No ingest connector manifests are available",
  };
}

function normalizeConnectorCandidates(input: unknown): NormalizedConnector[] {
  return collectConnectorCandidates(input)
    .map((candidate, index) => normalizeConnectorCandidate(candidate, index))
    .sort(compareNormalizedConnectors);
}

function collectConnectorCandidates(input: unknown): ConnectorCandidate[] {
  if (input === undefined || input === null) {
    return [];
  }

  if (Array.isArray(input)) {
    return input.map((value, index) => ({
      value,
      path: `connectors.${index}`,
      sourceKind: "sdk",
      warnings: [],
    }));
  }

  if (!isRecord(input)) {
    return [
      {
        value: input,
        path: "input",
        sourceKind: "unknown",
        warnings: [
          {
            code: "malformed_manifest",
            severity: "blocking",
            path: "input",
          },
        ],
      },
    ];
  }

  const direct = candidateArrayFromRecord(input, "connectors", "api");
  if (direct !== undefined) {
    return direct;
  }

  const manifest = recordField(input, "manifest", "connectorManifest", "connector_manifest");
  if (manifest !== undefined) {
    const manifestConnectors = candidateArrayFromRecord(
      manifest,
      "connectors",
      "python_cli",
      "manifest.connectors",
    );
    if (manifestConnectors !== undefined) {
      return manifestConnectors;
    }
    if (looksLikeConnectorRecord(manifest)) {
      return [
        {
          value: manifest,
          path: "manifest",
          sourceKind: "python_cli",
          warnings: [],
        },
      ];
    }
  }

  for (const key of ["connectorManifests", "connector_manifests", "items"]) {
    const candidates = candidateArrayFromRecord(input, key, "api");
    if (candidates !== undefined) {
      return candidates;
    }
  }

  for (const key of ["profiles", "connectorProfiles", "connector_profiles"]) {
    const candidates = candidateArrayFromRecord(input, key, "sdk");
    if (candidates !== undefined) {
      return candidates;
    }
  }

  if (looksLikePythonCliManifest(input)) {
    return [
      {
        value: input,
        path: "input",
        sourceKind: "python_cli",
        warnings: [],
      },
    ];
  }

  if (looksLikeConnectorRecord(input)) {
    return [
      {
        value: input,
        path: "input",
        sourceKind: "sdk",
        warnings: [],
      },
    ];
  }

  return [];
}

function candidateArrayFromRecord(
  record: AnyRecord,
  key: string,
  sourceKind: ConnectorSourceKind,
  path = key,
): ConnectorCandidate[] | undefined {
  if (!Object.hasOwn(record, key)) {
    return undefined;
  }

  const value = record[key];
  if (!Array.isArray(value)) {
    return [
      {
        value: undefined,
        path,
        sourceKind,
        warnings: [
          {
            code: "malformed_manifest",
            severity: "blocking",
            path,
          },
        ],
      },
    ];
  }

  return value.map((item, index) => ({
    value: item,
    path: `${path}.${index}`,
    sourceKind,
    warnings: [],
  }));
}

function normalizeConnectorCandidate(
  candidate: ConnectorCandidate,
  index: number,
): NormalizedConnector {
  const warnings = [...candidate.warnings];
  const record = isRecord(candidate.value) ? candidate.value : undefined;

  if (record === undefined) {
    warnings.push({
      code: "malformed_manifest",
      severity: "blocking",
      path: candidate.path,
    });
  } else {
    collectSafetyWarnings(record, candidate.path, warnings);
  }

  const fallbackId = `connector_${index + 1}`;
  const connectorId = normalizeConnectorId(record, fallbackId, candidate.path, warnings);
  const mediaTypes = collectMediaTypes(record, candidate, warnings);
  const citationCapabilities = collectCitationCapabilities(
    record,
    candidate,
    warnings,
    mediaTypes,
  );

  if (mediaTypes.length === 0) {
    warnings.push({
      code: "malformed_manifest",
      severity: "blocking",
      path: `${candidate.path}.mediaTypes`,
    });
  }

  if (citationCapabilities.length === 0) {
    warnings.push({
      code: "malformed_manifest",
      severity: "blocking",
      path: `${candidate.path}.citationCapabilities`,
    });
  }

  const finalWarnings = materializeWarnings(
    dedupeWarningDrafts(warnings),
    connectorId,
  );
  return {
    connectorId,
    sourceKind: candidate.sourceKind,
    mediaTypes,
    mediaTypeLabels: mediaTypes.map(mediaTypeLabel),
    citationCapabilities,
    citationCapabilityLabels: citationCapabilities.map(citationCapabilityLabel),
    safetyState: resolveSafetyState(record, finalWarnings),
    readinessStatus: resolveReadinessStatus(record, finalWarnings),
    warnings: finalWarnings,
  };
}

function buildConnectorCard(connector: NormalizedConnector): IngestConnectorCard {
  const statusLabel = getIngestConnectorReadinessStatusLabel(
    connector.readinessStatus,
  );
  const safetyStateLabel = getIngestConnectorSafetyStateLabel(
    connector.safetyState,
  );
  const warningLabels = connector.warnings.map((warning) => warning.label);
  const detailLabels = [
    safetyStateLabel,
    formatList(connector.mediaTypeLabels, "Media type", "Media types"),
    formatList(
      connector.citationCapabilityLabels,
      "Citation",
      "Citations",
    ),
    ...warningLabels,
  ];

  return {
    id: `ingest_connector_card.${sanitizeIdentifier(connector.connectorId, "connector")}`,
    connectorId: connector.connectorId,
    title: connector.connectorId,
    subtitle: formatList(connector.mediaTypeLabels, "Media type", "Media types"),
    status: connector.readinessStatus,
    statusLabel,
    safetyState: connector.safetyState,
    safetyStateLabel,
    mediaTypes: [...connector.mediaTypes],
    mediaTypeLabels: [...connector.mediaTypeLabels],
    citationCapabilities: [...connector.citationCapabilities],
    citationCapabilityLabels: [...connector.citationCapabilityLabels],
    valueLabel: formatCount(connector.mediaTypes.length, "media type"),
    warningLabels,
    detailLabels,
    ariaLabel: [
      connector.connectorId,
      statusLabel,
      safetyStateLabel,
      formatCount(connector.warnings.length, "warning"),
    ].join(", "),
  };
}

function buildConnectorRow(connector: NormalizedConnector): IngestConnectorRow {
  const readinessStatusLabel = getIngestConnectorReadinessStatusLabel(
    connector.readinessStatus,
  );
  const safetyStateLabel = getIngestConnectorSafetyStateLabel(
    connector.safetyState,
  );
  const warningLabels = connector.warnings.map((warning) => warning.label);

  return {
    id: `ingest_connector_row.${sanitizeIdentifier(connector.connectorId, "connector")}`,
    connectorId: connector.connectorId,
    mediaTypes: [...connector.mediaTypes],
    mediaTypeLabels: [...connector.mediaTypeLabels],
    citationCapabilities: [...connector.citationCapabilities],
    citationCapabilityLabels: [...connector.citationCapabilityLabels],
    safetyState: connector.safetyState,
    safetyStateLabel,
    readinessStatus: connector.readinessStatus,
    readinessStatusLabel,
    warningCount: connector.warnings.length,
    warningLabels,
    ariaLabel: [
      connector.connectorId,
      readinessStatusLabel,
      safetyStateLabel,
      formatCount(connector.mediaTypes.length, "media type"),
      formatCount(
        connector.citationCapabilities.length,
        "citation capability",
        "citation capabilities",
      ),
      formatCount(connector.warnings.length, "warning"),
    ].join(", "),
  };
}

function normalizeConnectorId(
  record: AnyRecord | undefined,
  fallbackId: string,
  path: string,
  warnings: WarningDraft[],
): string {
  const rawId =
    stringField(record, "id", "connectorId", "connector_id", "name", "kind") ??
    stringField(record, "profileId", "profile_id", "connector") ??
    connectorIdFromPythonCommand(stringField(record, "command"));

  if (rawId === undefined) {
    warnings.push({
      code: "malformed_manifest",
      severity: "blocking",
      path: `${path}.id`,
    });
    return fallbackId;
  }

  if (isDangerousString(rawId, "id")) {
    collectStringSafetyWarning(rawId, "id", `${path}.id`, warnings);
    return fallbackId;
  }

  return sanitizeConnectorId(rawId, fallbackId);
}

function collectMediaTypes(
  record: AnyRecord | undefined,
  candidate: ConnectorCandidate,
  warnings: WarningDraft[],
): string[] {
  const values = [
    ...stringListField(
      record,
      candidate.path,
      warnings,
      "mediaTypes",
      "media_types",
      "supportedMediaTypes",
      "supported_media_types",
      "contentTypes",
      "content_types",
    ),
    ...stringListField(
      recordField(record, "capabilities", "supports"),
      `${candidate.path}.capabilities`,
      warnings,
      "mediaTypes",
      "media_types",
      "contentTypes",
      "content_types",
    ),
    ...optionalStringList(
      stringField(record, "mediaType", "media_type", "contentType", "content_type"),
    ),
    ...mediaTypesFromPythonCliRecord(record),
  ];

  const normalized: string[] = [];
  for (const value of values) {
    const mediaType = value.trim().toLocaleLowerCase();
    if (!isValidMediaType(mediaType)) {
      warnings.push({
        code: "malformed_manifest",
        severity: "blocking",
        path: `${candidate.path}.mediaTypes`,
      });
      continue;
    }
    normalized.push(mediaType);
  }

  return uniqueStrings(normalized).sort();
}

function collectCitationCapabilities(
  record: AnyRecord | undefined,
  candidate: ConnectorCandidate,
  warnings: WarningDraft[],
  mediaTypes: readonly string[],
): string[] {
  const values = [
    ...stringListField(
      record,
      candidate.path,
      warnings,
      "citationCapabilities",
      "citation_capabilities",
      "citationRanges",
      "citation_ranges",
      "citationTypes",
      "citation_types",
    ),
    ...citationCapabilitiesFromCapabilityField(record),
    ...stringListField(
      recordField(record, "capabilities", "supports"),
      `${candidate.path}.capabilities`,
      warnings,
      "citationCapabilities",
      "citation_capabilities",
      "citations",
    ),
    ...citationCapabilitiesFromUnknown(record?.citations),
    ...citationCapabilitiesFromUnknown(record?.citation),
    ...citationCapabilitiesFromPythonCliRecord(record),
    ...citationCapabilitiesFromPythonCommand(stringField(record, "command")),
    ...citationCapabilitiesFromMediaTypes(mediaTypes),
  ];

  const normalized: string[] = [];
  for (const value of values) {
    const capability = normalizeCitationCapability(value);
    if (capability === undefined) {
      warnings.push({
        code: "malformed_manifest",
        severity: "blocking",
        path: `${candidate.path}.citationCapabilities`,
      });
      continue;
    }
    normalized.push(capability);
  }

  return uniqueStrings(normalized).sort(compareCitationCapabilities);
}

function mediaTypesFromPythonCliRecord(record: AnyRecord | undefined): string[] {
  if (!record) {
    return [];
  }

  const values: string[] = [];
  for (const key of ["documents", "chunks", "document_summaries", "chunk_summaries"]) {
    for (const item of arrayField(record, key)) {
      const mediaType = stringField(
        isRecord(item) ? item : undefined,
        "mediaType",
        "media_type",
      );
      if (mediaType !== undefined) {
        values.push(mediaType);
      }
    }
  }

  const command = stringField(record, "command");
  if (command === "parse-markdown") {
    values.push("text/markdown");
  } else if (command === "parse-json") {
    values.push("application/json");
  } else if (command === "parse-csv") {
    values.push("text/csv");
  } else if (command === "normalize") {
    values.push(stringField(record, "media_type", "mediaType") ?? "text/plain");
  }

  return values;
}

function citationCapabilitiesFromPythonCliRecord(
  record: AnyRecord | undefined,
): string[] {
  if (!record) {
    return [];
  }

  const values: string[] = [];
  for (const key of ["documents", "chunks", "document_summaries", "chunk_summaries"]) {
    for (const item of arrayField(record, key)) {
      if (isRecord(item)) {
        values.push(...citationCapabilitiesFromUnknown(item.citation));
        values.push(...citationCapabilitiesFromUnknown(item.citations));
      }
    }
  }
  values.push(...citationCapabilitiesFromUnknown(record.citations));

  return values;
}

function citationCapabilitiesFromPythonCommand(
  command: string | undefined,
): string[] {
  switch (command) {
    case "parse-markdown":
      return ["line_range"];
    case "parse-json":
      return ["json_path"];
    case "parse-csv":
      return ["row", "table_cell"];
    default:
      return [];
  }
}

function citationCapabilitiesFromCapabilityField(
  record: AnyRecord | undefined,
): string[] {
  const values = arrayField(record, "capabilities");
  return values.flatMap((value) => {
    if (typeof value !== "string") {
      return [];
    }

    const normalized = normalizeToken(value);
    if (
      normalized.includes("citation") ||
      normalized.includes("checksum") ||
      normalized.includes("relative_path")
    ) {
      return [value];
    }

    return [];
  });
}

function citationCapabilitiesFromMediaTypes(
  mediaTypes: readonly string[],
): string[] {
  const capabilities: string[] = [];

  for (const mediaType of mediaTypes) {
    if (mediaType === "text/markdown") {
      capabilities.push("line_range");
    } else if (mediaType === "application/json") {
      capabilities.push("json_path");
    } else if (mediaType === "text/csv") {
      capabilities.push("row", "table_cell");
    } else if (
      mediaType === "application/jsonl" ||
      mediaType === "application/x-ndjson" ||
      mediaType === "text/plain"
    ) {
      capabilities.push("line_range");
    }
  }

  return capabilities;
}

function citationCapabilitiesFromUnknown(value: unknown): string[] {
  if (value === undefined) {
    return [];
  }

  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(citationCapabilitiesFromUnknown);
  }

  if (!isRecord(value)) {
    return [];
  }

  const range = recordField(value, "range") ?? value;
  const capabilities: string[] = [];
  if (
    integerField(range, "startLine", "start_line") !== undefined ||
    integerField(range, "endLine", "end_line") !== undefined
  ) {
    capabilities.push("line_range");
  }
  if (stringField(range, "path", "jsonPath", "json_path") !== undefined) {
    capabilities.push("json_path");
  }
  if (integerField(range, "row") !== undefined) {
    capabilities.push("row");
  }
  if (stringField(range, "column") !== undefined || integerField(range, "column") !== undefined) {
    capabilities.push("table_cell");
  }
  if (stringField(value, "checksum") !== undefined) {
    capabilities.push("checksum");
  }

  return capabilities;
}

function collectSafetyWarnings(
  value: unknown,
  path: string,
  warnings: WarningDraft[],
  seen = new WeakSet<object>(),
): void {
  if (value === null || value === undefined) {
    return;
  }

  if (typeof value === "string") {
    collectStringSafetyWarning(value, lastPathSegment(path), path, warnings);
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  if (seen.has(value)) {
    return;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectSafetyWarnings(item, `${path}.${index}`, warnings, seen),
    );
    return;
  }

  for (const [key, item] of Object.entries(value as AnyRecord)) {
    const fieldPath = `${path}.${key}`;
    if (
      isSensitiveKey(key) &&
      typeof item === "string" &&
      item.trim() !== ""
    ) {
      warnings.push({
        code: "secret_input",
        severity: "blocking",
        path: fieldPath,
      });
    }
    if (typeof item === "boolean" && item === true && isUnsafeBooleanKey(key)) {
      warnings.push({
        code: "unsafe_input",
        severity: "warning",
        path: fieldPath,
      });
    }
    if (typeof item === "boolean" && item === false && isLocalOnlyKey(key)) {
      warnings.push({
        code: "unsafe_input",
        severity: "warning",
        path: fieldPath,
      });
    }
    collectSafetyWarnings(item, fieldPath, warnings, seen);
  }
}

function collectStringSafetyWarning(
  value: string,
  key: string,
  path: string,
  warnings: WarningDraft[],
): void {
  if (isPrivatePath(value)) {
    warnings.push({
      code: "private_path_input",
      severity: "blocking",
      path,
    });
  }
  if (isSecretLikeValue(value, key)) {
    warnings.push({
      code: "secret_input",
      severity: "blocking",
      path,
    });
  }
  if (isRawLocalPath(value)) {
    warnings.push({
      code: "raw_path_input",
      severity: "warning",
      path,
    });
  }
  if (isUnsafeExternalReference(value)) {
    warnings.push({
      code: "unsafe_input",
      severity: "warning",
      path,
    });
  }
}

function resolveSafetyState(
  record: AnyRecord | undefined,
  warnings: readonly IngestConnectorWarning[],
): IngestConnectorSafetyState {
  if (warnings.some((warning) => warning.code === "malformed_manifest")) {
    return "malformed";
  }
  if (
    warnings.some((warning) =>
      warning.code === "unsafe_input" ||
      warning.code === "raw_path_input" ||
      warning.code === "secret_input" ||
      warning.code === "private_path_input"
    )
  ) {
    return "unsafe";
  }

  const explicit = normalizeToken(
    stringField(record, "safetyState", "safety_state", "safety"),
  );
  if (explicit === "safe" || explicit === "local_safe") {
    return "safe";
  }
  if (explicit === "unsafe" || explicit === "blocked") {
    return "unsafe";
  }
  if (explicit === "malformed" || explicit === "invalid") {
    return "malformed";
  }
  if (explicit === "untrusted" || explicit === "untrusted_by_default") {
    return "untrusted";
  }

  if (
    booleanField(
      record,
      "untrusted",
      "untrustedDefault",
      "untrusted_default",
      "untrustedByDefault",
      "untrusted_by_default",
      "contentUntrustedByDefault",
      "content_untrusted_by_default",
    ) === true ||
    booleanField(record, "trusted", "trustsInput", "trusts_input") === false ||
    booleanField(
      recordField(record, "safety"),
      "untrustedDefault",
      "untrustedByDefault",
      "trustedByDefault",
      "trusted_by_default",
    ) === false
  ) {
    return "untrusted";
  }
  if (
    booleanField(record, "safe", "localOnly", "local_only") === true ||
    booleanField(recordField(record, "safety"), "localOnly", "local_only") === true
  ) {
    return "safe";
  }

  return "untrusted";
}

function resolveReadinessStatus(
  record: AnyRecord | undefined,
  warnings: readonly IngestConnectorWarning[],
): IngestConnectorReadinessStatus {
  if (warnings.some((warning) => warning.severity === "blocking")) {
    return "error";
  }

  const explicit = normalizeToken(
    stringField(record, "readinessStatus", "readiness_status", "status", "state"),
  );
  if (
    explicit === "error" ||
    explicit === "failed" ||
    explicit === "blocked" ||
    explicit === "invalid"
  ) {
    return "error";
  }
  if (
    explicit === "attention" ||
    explicit === "warning" ||
    explicit === "needs_review" ||
    explicit === "disabled" ||
    explicit === "pending"
  ) {
    return "attention";
  }
  if (explicit === "ready" || explicit === "available" || explicit === "enabled") {
    return warnings.length > 0 ? "attention" : "ready";
  }

  const safety = normalizeToken(
    stringField(record, "safetyState", "safety_state", "safety"),
  );
  if (safety === "malformed" || safety === "invalid") {
    return "error";
  }
  if (safety === "unsafe" || safety === "blocked") {
    return "attention";
  }

  if (record?.ok === false) {
    return recordField(record, "error") !== undefined ? "error" : "attention";
  }
  if (
    booleanField(record, "ready", "enabled", "available") === false ||
    validationErrorCount(record) > 0
  ) {
    return "attention";
  }

  return warnings.length > 0 ? "attention" : "ready";
}

function validationErrorCount(record: AnyRecord | undefined): number {
  if (!record) {
    return 0;
  }

  const summary = recordField(record, "summary");
  return Math.max(
    integerField(summary, "validationErrorCount", "validation_error_count") ?? 0,
    arrayField(record, "validationErrors", "validation_errors").length,
  );
}

function materializeWarnings(
  drafts: readonly WarningDraft[],
  connectorId: string,
): IngestConnectorWarning[] {
  return drafts
    .map((draft) => {
      const metadata = warningMetadata(draft.code);
      const fieldPath = draft.path ? sanitizeFieldPath(draft.path) : undefined;
      const warning: IngestConnectorWarning = {
        id: `ingest_connector_warning.${sanitizeIdentifier(
          `${connectorId}.${draft.code}.${fieldPath ?? "root"}`,
          "warning",
        )}`,
        connectorId,
        code: draft.code,
        severity: draft.severity,
        label: metadata.label,
        description:
          fieldPath === undefined
            ? metadata.description
            : `${metadata.description} Field: ${fieldPath}.`,
      };

      if (fieldPath !== undefined) {
        warning.fieldPath = fieldPath;
      }
      return warning;
    })
    .sort(compareWarnings);
}

function warningMetadata(code: IngestConnectorWarningCode): {
  label: string;
  description: string;
} {
  switch (code) {
    case "malformed_manifest":
      return {
        label: "Malformed connector manifest",
        description: "The connector manifest shape needs review.",
      };
    case "unsafe_input":
      return {
        label: "Non-local connector input",
        description: "The connector manifest references non-local input.",
      };
    case "raw_path_input":
      return {
        label: "Raw local path omitted",
        description: "A raw local path was detected and is not shown.",
      };
    case "secret_input":
      return {
        label: "Secret-like input omitted",
        description: "A secret-like field or value was detected and is not shown.",
      };
    case "private_path_input":
      return {
        label: "Private path omitted",
        description: "A private workspace path was detected and is not shown.",
      };
  }
}

function buildIngestConnectorEmptyStatus(
  rows: readonly IngestConnectorRow[],
): IngestConnectorReadinessStatus {
  return rows.length === 0 ? "empty" : "ready";
}

function resolveStateStatus(
  rows: readonly IngestConnectorRow[],
): IngestConnectorReadinessStatus {
  if (rows.length === 0) {
    return buildIngestConnectorEmptyStatus(rows);
  }
  if (rows.some((row) => row.readinessStatus === "error")) {
    return "error";
  }
  if (rows.some((row) => row.readinessStatus === "attention")) {
    return "attention";
  }
  return "ready";
}

function looksLikeConnectorRecord(record: AnyRecord): boolean {
  return (
    stringField(record, "id", "connectorId", "connector_id", "name", "kind") !== undefined ||
    stringField(record, "profileId", "profile_id", "connector") !== undefined ||
    record.mediaTypes !== undefined ||
    record.media_types !== undefined ||
    record.supportedMediaTypes !== undefined ||
    record.supported_media_types !== undefined ||
    record.citationCapabilities !== undefined ||
    record.citation_capabilities !== undefined
  );
}

function looksLikePythonCliManifest(record: AnyRecord): boolean {
  const command = stringField(record, "command");
  return (
    command !== undefined &&
    (command.startsWith("parse-") ||
      command === "normalize" ||
      command.includes("manifest"))
  );
}

function connectorIdFromPythonCommand(command: string | undefined): string | undefined {
  switch (command) {
    case "parse-markdown":
      return "markdown";
    case "parse-json":
      return "json";
    case "parse-csv":
      return "csv";
    case "normalize":
      return "plain_text";
    default:
      return command?.includes("manifest") ? "python_cli_manifest" : undefined;
  }
}

function stringListField(
  record: AnyRecord | undefined,
  path: string,
  warnings: WarningDraft[],
  ...keys: string[]
): string[] {
  if (!record) {
    return [];
  }

  for (const key of keys) {
    if (!Object.hasOwn(record, key)) {
      continue;
    }

    const value = record[key];
    if (typeof value === "string" && value.trim() !== "") {
      return [value.trim()];
    }
    if (Array.isArray(value)) {
      return value.flatMap((item, index) => {
        if (typeof item === "string" && item.trim() !== "") {
          return [item.trim()];
        }
        warnings.push({
          code: "malformed_manifest",
          severity: "blocking",
          path: `${path}.${key}.${index}`,
        });
        return [];
      });
    }

    warnings.push({
      code: "malformed_manifest",
      severity: "blocking",
      path: `${path}.${key}`,
    });
    return [];
  }

  return [];
}

function normalizeCitationCapability(value: string): string | undefined {
  const normalized = normalizeToken(value);
  if (
    normalized === "line" ||
    normalized === "lines" ||
    normalized === "line_range" ||
    normalized === "line_ranges" ||
    normalized === "line_citation" ||
    normalized === "line_citations" ||
    normalized === "start_line"
  ) {
    return "line_range";
  }
  if (
    normalized === "path" ||
    normalized === "json" ||
    normalized === "json_path" ||
    normalized === "json_paths" ||
    normalized === "json_path_citation" ||
    normalized === "json_path_citations"
  ) {
    return "json_path";
  }
  if (
    normalized === "row" ||
    normalized === "rows" ||
    normalized === "table_row" ||
    normalized === "table_rows" ||
    normalized === "row_citation" ||
    normalized === "row_citations"
  ) {
    return "row";
  }
  if (
    normalized === "cell" ||
    normalized === "cells" ||
    normalized === "column" ||
    normalized === "table_cell" ||
    normalized === "table_cells" ||
    normalized === "cell_citation" ||
    normalized === "cell_citations"
  ) {
    return "table_cell";
  }
  if (normalized === "checksum" || normalized === "checksums") {
    return "checksum";
  }
  if (
    normalized === "relative_path" ||
    normalized === "relative_path_citation" ||
    normalized === "relative_path_citations"
  ) {
    return "relative_path";
  }
  if (
    normalized === "source_document_citation" ||
    normalized === "source_document_citations"
  ) {
    return "source_document_citation";
  }
  if (normalized === "range" || normalized === "source_range") {
    return "source_range";
  }
  if (/^[a-z][a-z0-9_]{1,63}$/.test(normalized)) {
    return normalized;
  }
  return undefined;
}

function mediaTypeLabel(mediaType: string): string {
  switch (mediaType) {
    case "application/json":
      return "JSON";
    case "application/jsonl":
    case "application/x-ndjson":
      return "JSONL";
    case "text/csv":
      return "CSV";
    case "text/markdown":
      return "Markdown";
    case "text/plain":
      return "Plain text";
    default:
      return mediaType;
  }
}

function citationCapabilityLabel(capability: string): string {
  switch (capability) {
    case "checksum":
      return "Checksum citations";
    case "json_path":
      return "JSON path citations";
    case "line_range":
      return "Line citations";
    case "row":
      return "Row citations";
    case "relative_path":
      return "Relative path citations";
    case "source_range":
      return "Source range citations";
    case "source_document_citation":
      return "Source document citations";
    case "table_cell":
      return "Cell citations";
    default:
      return `${titleCaseToken(capability)} citations`;
  }
}

function compareNormalizedConnectors(
  left: NormalizedConnector,
  right: NormalizedConnector,
): number {
  return (
    readinessRank(left.readinessStatus) - readinessRank(right.readinessStatus) ||
    left.connectorId.localeCompare(right.connectorId)
  );
}

function compareConnectorCards(
  left: IngestConnectorCard,
  right: IngestConnectorCard,
): number {
  return (
    readinessRank(left.status) - readinessRank(right.status) ||
    left.connectorId.localeCompare(right.connectorId)
  );
}

function compareConnectorRows(
  left: IngestConnectorRow,
  right: IngestConnectorRow,
): number {
  return (
    readinessRank(left.readinessStatus) - readinessRank(right.readinessStatus) ||
    left.connectorId.localeCompare(right.connectorId)
  );
}

function compareWarnings(
  left: IngestConnectorWarning,
  right: IngestConnectorWarning,
): number {
  return (
    warningSeverityRank(left.severity) - warningSeverityRank(right.severity) ||
    left.code.localeCompare(right.code) ||
    (left.fieldPath ?? "").localeCompare(right.fieldPath ?? "") ||
    left.id.localeCompare(right.id)
  );
}

function compareCitationCapabilities(left: string, right: string): number {
  return citationCapabilityRank(left) - citationCapabilityRank(right) || left.localeCompare(right);
}

function readinessRank(status: IngestConnectorReadinessStatus): number {
  switch (status) {
    case "error":
      return 0;
    case "attention":
      return 1;
    case "ready":
      return 2;
    case "empty":
      return 3;
  }
}

function warningSeverityRank(severity: IngestConnectorWarningSeverity): number {
  switch (severity) {
    case "blocking":
      return 0;
    case "warning":
      return 1;
    case "info":
      return 2;
  }
}

function citationCapabilityRank(capability: string): number {
  switch (capability) {
    case "line_range":
      return 0;
    case "json_path":
      return 1;
    case "row":
      return 2;
    case "table_cell":
      return 3;
    case "checksum":
      return 4;
    case "source_range":
      return 5;
    case "relative_path":
      return 6;
    case "source_document_citation":
      return 7;
    default:
      return 20;
  }
}

function dedupeWarningDrafts(drafts: readonly WarningDraft[]): WarningDraft[] {
  const seen = new Set<string>();
  const deduped: WarningDraft[] = [];

  for (const draft of drafts) {
    const key = `${draft.code}:${draft.severity}:${sanitizeFieldPath(draft.path ?? "")}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(draft);
  }

  return deduped;
}

function isValidMediaType(value: string): boolean {
  return /^[^\s/]+\/[^\s]+$/.test(value);
}

function isDangerousString(value: string, key: string): boolean {
  return (
    isPrivatePath(value) ||
    isSecretLikeValue(value, key) ||
    isRawLocalPath(value) ||
    isUnsafeExternalReference(value)
  );
}

function isPrivatePath(value: string): boolean {
  return /(\.codex-private|codex-private|private[ _-]?plan|plan[ _-]?pack|\.codex[\\/]private)/i.test(
    value,
  );
}

function isRawLocalPath(value: string): boolean {
  const normalized = value.trim().replace(/\\/g, "/");
  return (
    /^[a-zA-Z]:\//.test(normalized) ||
    /^\/(Users|home|tmp|var|etc|private|mnt|Volumes)\b/.test(normalized) ||
    /^~\//.test(normalized) ||
    /^file:\/\/\/[a-zA-Z]:\//.test(normalized) ||
    /^file:\/\/\/(Users|home|tmp|var|etc|private|mnt|Volumes)\b/.test(normalized) ||
    normalized.split("/").includes("..")
  );
}

function isUnsafeExternalReference(value: string): boolean {
  const trimmed = value.trim();
  const scheme = trimmed.match(/^([a-z][a-z0-9+.-]*):\/\//i)?.[1]?.toLocaleLowerCase();
  if (scheme === undefined) {
    return false;
  }
  return !LOCAL_URI_SCHEMES.has(scheme);
}

function isSecretLikeValue(value: string, key: string): boolean {
  if (isDigestKey(key)) {
    return false;
  }

  const trimmed = value.trim();
  return (
    /^(sk|ghp|pat|xox[baprs])-[A-Za-z0-9_-]{12,}$/.test(trimmed) ||
    /^bearer\s+\S{12,}$/i.test(trimmed) ||
    /(api[_-]?key|token|password|secret)=\S+/i.test(trimmed)
  );
}

function isSensitiveKey(key: string): boolean {
  if (isDigestKey(key)) {
    return false;
  }
  if (/raw.?secrets?.?(retained|blocked|stored)$/i.test(key)) {
    return false;
  }
  return /(api.?key|token|secret|password|credential|authorization|private.?key)/i.test(
    key,
  );
}

function isDigestKey(key: string): boolean {
  return /(checksum|fingerprint|sha256|hash|digest)/i.test(key);
}

function isUnsafeBooleanKey(key: string): boolean {
  if (/(^|[_-])untrusted.?by.?default|content.?untrusted.?by.?default/i.test(key)) {
    return false;
  }
  return /(network|remote|external|webhook|allow.?host|path.?inputs|durable.?writes|trusted.?by.?default|raw.?content.?(retained|stored)|raw.?secrets?.?(retained|stored))/i.test(
    key,
  );
}

function isLocalOnlyKey(key: string): boolean {
  return /^local_?only$/i.test(key) || /(private.?paths.?blocked|raw.?secrets?.?blocked|read.?only)/i.test(key);
}

function sanitizeConnectorId(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);

  return normalized === "" ? fallback : normalized;
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

function sanitizeFieldPath(value: string): string {
  return value
    .trim()
    .replace(/\[[^\]]*\]/g, "[]")
    .replace(/[^\w.[\]-]+/g, "_")
    .slice(0, 120);
}

function normalizeToken(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "_") ?? "";
}

function titleCaseToken(value: string): string {
  const words = value
    .replace(/[._-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);

  if (words.length === 0) {
    return "Source";
  }

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
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
  record: AnyRecord | undefined,
  ...keys: string[]
): boolean | undefined {
  if (!record) {
    return undefined;
  }

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
    if (Number.isInteger(value)) {
      return value as number;
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

function optionalStringList(value: string | undefined): string[] {
  return value === undefined ? [] : [value];
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function formatCount(
  value: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function formatList(
  values: readonly string[],
  singularLabel: string,
  pluralLabel: string,
): string {
  if (values.length === 0) {
    return `${pluralLabel} unavailable`;
  }
  return `${values.length === 1 ? singularLabel : pluralLabel}: ${values.join(", ")}`;
}

function lastPathSegment(path: string): string {
  return path.split(".").at(-1) ?? path;
}

function isRecord(value: unknown): value is AnyRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  const objectValue = value as object;
  if (seen.has(objectValue)) {
    return value;
  }
  seen.add(objectValue);

  for (const nested of Object.values(value as AnyRecord)) {
    deepFreeze(nested, seen);
  }

  return Object.freeze(value);
}
