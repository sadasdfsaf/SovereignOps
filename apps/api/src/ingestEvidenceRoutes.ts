import { createHash } from "node:crypto";

import type {
  ApiResponse,
  ApiRoute,
  ApiRouter,
} from "./router.ts";
import { jsonError, jsonResponse } from "./router.ts";

export const INGEST_EVIDENCE_EXPORT_VERSION = 1;
export const INGEST_EVIDENCE_REDACTION = "[REDACTED]";

export type IngestEvidenceExportFormat = "json" | "summary" | "manifest";
export type IngestEvidenceSection =
  | "evidenceFiles"
  | "sourceSnapshots"
  | "citationEvidence"
  | "quarantineDecisions"
  | "apiRequestTrace"
  | "clientSessionTrace";

export interface IngestEvidenceFilters {
  readonly sections?: readonly IngestEvidenceSection[];
  readonly evidenceFileIds?: readonly string[];
  readonly sourceUris?: readonly string[];
  readonly citationKinds?: readonly string[];
}

export interface IngestEvidenceRoutesOptions {
  readonly basePath?: string;
}

export interface IngestEvidenceContentDescriptor {
  readonly mediaType: "application/json";
  readonly bytes: number;
  readonly fingerprint: string;
}

export interface IngestEvidenceSectionDescriptor extends IngestEvidenceContentDescriptor {
  readonly section: IngestEvidenceSection;
  readonly itemCount: number;
}

export interface IngestEvidenceSummary {
  readonly sourceCount: number;
  readonly evidenceFileCount: number;
  readonly citationCount: number;
  readonly quarantineDecisionCount: number;
  readonly apiRequestTraceCount: number;
  readonly clientSessionTraceCount: number;
}

export interface NormalizedIngestEvidenceFilters {
  readonly sections: readonly IngestEvidenceSection[];
  readonly evidenceFileIds: readonly string[];
  readonly sourceUris: readonly string[];
  readonly citationKinds: readonly string[];
}

export interface IngestEvidenceManifest {
  readonly kind: "ingest-evidence.manifest";
  readonly version: number;
  readonly exportId: string;
  readonly createdAt: string;
  readonly schemaVersion: string | null;
  readonly workspaceId: string | null;
  readonly sessionId: string | null;
  readonly localOnly: boolean;
  readonly filters: NormalizedIngestEvidenceFilters;
  readonly evidenceSummary: IngestEvidenceSummary;
  readonly sections: readonly IngestEvidenceSectionDescriptor[];
  readonly content: IngestEvidenceContentDescriptor;
  readonly fingerprint: string;
}

export interface IngestEvidenceExportResponse {
  readonly kind: "ingest-evidence.export";
  readonly version: number;
  readonly format: IngestEvidenceExportFormat;
  readonly mediaType: "application/json";
  readonly content: string;
  readonly fingerprint: string;
  readonly exportId: string;
  readonly createdAt: string;
  readonly manifest: IngestEvidenceManifest;
}

export interface IngestEvidencePackageFile extends IngestEvidenceContentDescriptor {
  readonly path: "manifest.json" | "evidence.json";
  readonly content: string;
}

export interface IngestEvidencePackageResponse {
  readonly kind: "ingest-evidence.package";
  readonly version: number;
  readonly manifest: IngestEvidenceManifest;
  readonly files: readonly IngestEvidencePackageFile[];
  readonly fingerprint: string;
}

type IngestEvidenceRouteResponse =
  | IngestEvidenceExportResponse
  | IngestEvidencePackageResponse;

type Parsed<TValue> = { ok: true; value: TValue } | { ok: false; error: ApiResponse };

interface ParsedIngestEvidenceRequest {
  readonly evidence: JsonRecord;
  readonly format: IngestEvidenceExportFormat;
  readonly filters: NormalizedIngestEvidenceFilters;
  readonly createdAt?: string;
  readonly exportId?: string;
}

interface IngestEvidenceArtifact {
  readonly evidence: JsonRecord;
  readonly content: string;
  readonly manifest: IngestEvidenceManifest;
}

const DEFAULT_EXPORT_CREATED_AT = "1970-01-01T00:00:00.000Z";
const SECTION_ORDER: readonly IngestEvidenceSection[] = Object.freeze([
  "evidenceFiles",
  "sourceSnapshots",
  "citationEvidence",
  "quarantineDecisions",
  "apiRequestTrace",
  "clientSessionTrace",
]);
const SECTION_SET = new Set<string>(SECTION_ORDER);
const SENSITIVE_FIELD_PATTERN =
  /(?:authorization|api[-_]?key|apikey|auth|bearer|cookie|credential|jwt|password|passphrase|private[-_]?key|refresh[-_]?token|secret|session|signing[-_]?key|token)/i;
const SENSITIVE_TEXT_PATTERNS = [
  /\b((?:api[-_]?key|apikey|authorization|credential|password|passphrase|secret|session|token)\s*[:=]\s*)[^\s,;]+/gi,
  /\b(?:sk|rk|pk|tok|pat|npm)_[A-Za-z0-9_-]{8,}\b/g,
  /\b(?:sk|rk|pat|glpat|github_pat)-[A-Za-z0-9_-]{8,}\b/g,
];

export function createIngestEvidenceRoutes(
  options: IngestEvidenceRoutesOptions = {},
): readonly ApiRoute[] {
  const basePath = normalizeBasePath(options.basePath ?? "/v1/ingest/evidence");

  return Object.freeze([
    {
      method: "POST",
      path: joinPath(basePath, "/export"),
      description: "Previews a local ingest evidence export.",
      handler: ({ request }) => {
        const parsed = parseIngestEvidenceRequest(request.body);
        if (!parsed.ok) {
          return parsed.error;
        }

        try {
          return jsonResponse(200, buildExportResponse(parsed.value));
        } catch (error) {
          return caughtIngestEvidenceError(error);
        }
      },
    },
    {
      method: "POST",
      path: joinPath(basePath, "/package"),
      description: "Previews a local ingest evidence package.",
      handler: ({ request }) => {
        const parsed = parseIngestEvidenceRequest(request.body);
        if (!parsed.ok) {
          return parsed.error;
        }

        try {
          return jsonResponse(200, buildPackageResponse(parsed.value));
        } catch (error) {
          return caughtIngestEvidenceError(error);
        }
      },
    },
  ]);
}

export function mountIngestEvidenceRoutes(
  router: ApiRouter,
  options: IngestEvidenceRoutesOptions = {},
): ApiRouter {
  for (const route of createIngestEvidenceRoutes(options)) {
    router.register(route);
  }

  return router;
}

function buildExportResponse(request: ParsedIngestEvidenceRequest): IngestEvidenceExportResponse {
  const artifact = createIngestEvidenceArtifact(request);
  const content = selectExportContent(artifact, request.format);
  const descriptor = descriptorForContent(content);

  return deepFreeze({
    kind: "ingest-evidence.export",
    version: INGEST_EVIDENCE_EXPORT_VERSION,
    format: request.format,
    mediaType: descriptor.mediaType,
    content,
    fingerprint: descriptor.fingerprint,
    exportId: artifact.manifest.exportId,
    createdAt: artifact.manifest.createdAt,
    manifest: artifact.manifest,
  });
}

function buildPackageResponse(
  request: ParsedIngestEvidenceRequest,
): IngestEvidencePackageResponse {
  const artifact = createIngestEvidenceArtifact(request);
  const manifestContent = serializeDeterministicJson(artifact.manifest);
  const files: readonly IngestEvidencePackageFile[] = Object.freeze([
    Object.freeze({
      path: "manifest.json",
      content: manifestContent,
      ...descriptorForContent(manifestContent),
    }),
    Object.freeze({
      path: "evidence.json",
      content: artifact.content,
      ...artifact.manifest.content,
    }),
  ]);
  const packageWithoutFingerprint = {
    kind: "ingest-evidence.package",
    version: INGEST_EVIDENCE_EXPORT_VERSION,
    manifest: artifact.manifest,
    files,
  } satisfies Omit<IngestEvidencePackageResponse, "fingerprint">;

  return deepFreeze({
    ...packageWithoutFingerprint,
    fingerprint: fingerprintValue(packageWithoutFingerprint),
  });
}

function createIngestEvidenceArtifact(
  request: ParsedIngestEvidenceRequest,
): IngestEvidenceArtifact {
  const filteredEvidence = filterEvidence(request.evidence, request.filters);
  const redactedEvidence = redactJsonValue(filteredEvidence) as JsonRecord;
  const content = serializeDeterministicJson(redactedEvidence);
  const contentDescriptor = descriptorForContent(content);
  const createdAt = request.createdAt ?? readGeneratedAt(redactedEvidence) ?? DEFAULT_EXPORT_CREATED_AT;
  const exportId = request.exportId ?? createExportId({
    contentFingerprint: contentDescriptor.fingerprint,
    createdAt,
    filters: request.filters,
  });
  const sections = describeEvidenceSections(redactedEvidence);
  const manifestWithoutFingerprint = {
    kind: "ingest-evidence.manifest",
    version: INGEST_EVIDENCE_EXPORT_VERSION,
    exportId,
    createdAt,
    schemaVersion: readOptionalString(redactedEvidence.schemaVersion),
    workspaceId: readOptionalString(redactedEvidence.workspaceId),
    sessionId: readOptionalString(redactedEvidence.sessionId),
    localOnly: redactedEvidence.localOnly === true,
    filters: request.filters,
    evidenceSummary: summarizeEvidence(redactedEvidence),
    sections,
    content: contentDescriptor,
  } satisfies Omit<IngestEvidenceManifest, "fingerprint">;
  const manifest = deepFreeze({
    ...manifestWithoutFingerprint,
    fingerprint: fingerprintValue(manifestWithoutFingerprint),
  });

  return deepFreeze({
    evidence: redactedEvidence,
    content,
    manifest,
  });
}

function selectExportContent(
  artifact: IngestEvidenceArtifact,
  format: IngestEvidenceExportFormat,
): string {
  switch (format) {
    case "json":
      return artifact.content;
    case "summary":
      return serializeDeterministicJson(artifact.manifest.evidenceSummary);
    case "manifest":
      return serializeDeterministicJson(artifact.manifest);
  }
}

function filterEvidence(
  evidence: JsonRecord,
  filters: NormalizedIngestEvidenceFilters,
): JsonRecord {
  const selectedSections = new Set(
    filters.sections.length === 0 ? SECTION_ORDER : filters.sections,
  );
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(evidence)) {
    if (key === "evidenceSummary" || SECTION_SET.has(key)) {
      continue;
    }
    output[key] = cloneJsonCompatible(value);
  }

  for (const section of SECTION_ORDER) {
    if (!selectedSections.has(section)) {
      continue;
    }

    const value = evidence[section];
    if (!Array.isArray(value)) {
      continue;
    }

    output[section] = filterSection(section, value, filters).map(cloneJsonCompatible);
  }

  output.evidenceSummary = summarizeEvidence(output);

  return deepFreeze(output) as JsonRecord;
}

function filterSection(
  section: IngestEvidenceSection,
  values: readonly unknown[],
  filters: NormalizedIngestEvidenceFilters,
): readonly unknown[] {
  return values.filter((item) => {
    if (!isRecord(item)) {
      return true;
    }

    if (
      section === "evidenceFiles" &&
      filters.evidenceFileIds.length > 0 &&
      !matchesStringField(item.id, filters.evidenceFileIds)
    ) {
      return false;
    }

    if (
      section === "citationEvidence" &&
      filters.citationKinds.length > 0 &&
      !matchesStringField(item.kind, filters.citationKinds)
    ) {
      return false;
    }

    if (
      section !== "evidenceFiles" &&
      filters.sourceUris.length > 0 &&
      !recordIntersectsStrings(item, ["sourceUri", "sourceUris"], filters.sourceUris)
    ) {
      return false;
    }

    return true;
  });
}

function summarizeEvidence(evidence: JsonRecord): IngestEvidenceSummary {
  return Object.freeze({
    sourceCount: readArrayCount(evidence.sourceSnapshots),
    evidenceFileCount: readArrayCount(evidence.evidenceFiles),
    citationCount: readArrayCount(evidence.citationEvidence),
    quarantineDecisionCount: readArrayCount(evidence.quarantineDecisions),
    apiRequestTraceCount: readArrayCount(evidence.apiRequestTrace),
    clientSessionTraceCount: readArrayCount(evidence.clientSessionTrace),
  });
}

function describeEvidenceSections(
  evidence: JsonRecord,
): readonly IngestEvidenceSectionDescriptor[] {
  return Object.freeze(
    SECTION_ORDER
      .filter((section) => Array.isArray(evidence[section]))
      .map((section) => {
        const content = serializeDeterministicJson(evidence[section]);
        return Object.freeze({
          section,
          itemCount: readArrayCount(evidence[section]),
          ...descriptorForContent(content),
        });
      }),
  );
}

function parseIngestEvidenceRequest(body: unknown): Parsed<ParsedIngestEvidenceRequest> {
  if (!isRecord(body)) {
    return validationFailure("Request body must be an object.", { path: "body" });
  }

  const options = parseOptionsObject(body.options);
  if (!options.ok) {
    return options;
  }

  if (!isRecord(body.evidence)) {
    return validationFailure("Ingest evidence export requires an evidence object.", {
      path: "body.evidence",
    });
  }

  const format = parseFormat(body.format ?? options.value.format);
  if (!format.ok) {
    return format;
  }

  const filters = parseFilters(body.filters ?? options.value.filters);
  if (!filters.ok) {
    return filters;
  }

  const createdAt = parseOptionalTimestamp(body.createdAt ?? options.value.createdAt, "body.createdAt");
  if (!createdAt.ok) {
    return createdAt;
  }

  const exportId = parseOptionalCleanString(body.exportId ?? options.value.exportId, "body.exportId");
  if (!exportId.ok) {
    return exportId;
  }

  return {
    ok: true,
    value: {
      evidence: body.evidence,
      format: format.value,
      filters: filters.value,
      ...(createdAt.value === undefined ? {} : { createdAt: createdAt.value }),
      ...(exportId.value === undefined ? {} : { exportId: exportId.value }),
    },
  };
}

function parseOptionsObject(value: unknown): Parsed<JsonRecord> {
  if (value === undefined) {
    return { ok: true, value: Object.freeze({}) };
  }
  if (!isRecord(value)) {
    return validationFailure("Ingest evidence options must be an object.", {
      path: "body.options",
    });
  }

  return { ok: true, value };
}

function parseFormat(value: unknown): Parsed<IngestEvidenceExportFormat> {
  if (value === undefined) {
    return { ok: true, value: "json" };
  }
  if (value === "json" || value === "summary" || value === "manifest") {
    return { ok: true, value };
  }

  return validationFailure("Ingest evidence export format is unsupported.", {
    path: "body.format",
  });
}

function parseFilters(value: unknown): Parsed<NormalizedIngestEvidenceFilters> {
  if (value === undefined) {
    return {
      ok: true,
      value: Object.freeze({
        sections: Object.freeze([]),
        evidenceFileIds: Object.freeze([]),
        sourceUris: Object.freeze([]),
        citationKinds: Object.freeze([]),
      }),
    };
  }
  if (!isRecord(value)) {
    return validationFailure("Ingest evidence filters must be an object.", {
      path: "body.filters",
    });
  }

  const sections = parseOptionalSectionArray(value.sections, "body.filters.sections");
  if (!sections.ok) {
    return sections;
  }
  const evidenceFileIds = parseOptionalStringArray(
    value.evidenceFileIds,
    "body.filters.evidenceFileIds",
  );
  if (!evidenceFileIds.ok) {
    return evidenceFileIds;
  }
  const sourceUris = parseOptionalStringArray(value.sourceUris, "body.filters.sourceUris");
  if (!sourceUris.ok) {
    return sourceUris;
  }
  const citationKinds = parseOptionalStringArray(
    value.citationKinds,
    "body.filters.citationKinds",
  );
  if (!citationKinds.ok) {
    return citationKinds;
  }

  return {
    ok: true,
    value: Object.freeze({
      sections: sections.value ?? Object.freeze([]),
      evidenceFileIds: evidenceFileIds.value ?? Object.freeze([]),
      sourceUris: sourceUris.value ?? Object.freeze([]),
      citationKinds: citationKinds.value ?? Object.freeze([]),
    }),
  };
}

function parseOptionalSectionArray(
  value: unknown,
  path: string,
): Parsed<readonly IngestEvidenceSection[] | undefined> {
  const parsed = parseOptionalStringArray(value, path);
  if (!parsed.ok || parsed.value === undefined) {
    return parsed as Parsed<readonly IngestEvidenceSection[] | undefined>;
  }

  for (const [index, item] of parsed.value.entries()) {
    if (!SECTION_SET.has(item)) {
      return validationFailure("Ingest evidence section is unsupported.", {
        path: `${path}.${index}`,
      });
    }
  }

  return {
    ok: true,
    value: Object.freeze(parsed.value) as readonly IngestEvidenceSection[],
  };
}

function parseOptionalStringArray(
  value: unknown,
  path: string,
): Parsed<readonly string[] | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (!Array.isArray(value)) {
    return validationFailure("Value must be an array of non-empty strings.", { path });
  }

  const values: string[] = [];
  for (const [index, item] of value.entries()) {
    const parsed = readTrimmedString(item);
    if (parsed === undefined) {
      return validationFailure("Value must be an array of non-empty strings.", {
        path: `${path}.${index}`,
      });
    }
    values.push(parsed);
  }

  return {
    ok: true,
    value: Object.freeze(uniqueSorted(values)),
  };
}

function parseOptionalTimestamp(value: unknown, path: string): Parsed<string | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  const parsed = parseOptionalCleanString(value, path);
  if (!parsed.ok || parsed.value === undefined) {
    return parsed;
  }
  if (Number.isNaN(Date.parse(parsed.value))) {
    return validationFailure("Timestamp must be a valid ISO string.", {
      path,
      value: parsed.value,
    });
  }

  return { ok: true, value: new Date(Date.parse(parsed.value)).toISOString() };
}

function parseOptionalCleanString(value: unknown, path: string): Parsed<string | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  const parsed = readTrimmedString(value);
  if (parsed === undefined || parsed !== value) {
    return validationFailure("Value must be a non-empty string without surrounding whitespace.", {
      path,
      value,
    });
  }

  return { ok: true, value: parsed };
}

function validationFailure<TValue>(
  message: string,
  details: Readonly<Record<string, unknown>>,
): Parsed<TValue> {
  return { ok: false, error: validationError(message, details) };
}

function validationError(
  message: string,
  details: Readonly<Record<string, unknown>>,
): ApiResponse {
  return jsonError(400, "validation_failed", message, details);
}

function caughtIngestEvidenceError(error: unknown): ApiResponse {
  if (error instanceof IngestEvidenceRouteError) {
    return jsonError(error.status, error.code, error.message, error.details);
  }

  return jsonError(500, "ingest_evidence_export_failed", "Ingest evidence export failed.");
}

class IngestEvidenceRouteError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "IngestEvidenceRouteError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function descriptorForContent(content: string): IngestEvidenceContentDescriptor {
  return Object.freeze({
    mediaType: "application/json",
    bytes: countUtf8Bytes(content),
    fingerprint: fingerprintString(content),
  });
}

function createExportId(input: Readonly<Record<string, unknown>>): string {
  return `ingest_evidence_${fingerprintValue(input).slice("sha256:".length, "sha256:".length + 16)}`;
}

function fingerprintValue(value: unknown): string {
  return fingerprintString(serializeDeterministicJson(value));
}

function fingerprintString(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function serializeDeterministicJson(value: unknown): string {
  return stringifyStable(value, "", new WeakSet<object>());
}

function stringifyStable(value: unknown, path: string, seen: WeakSet<object>): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new IngestEvidenceRouteError(
        400,
        "validation_failed",
        "Numbers must be finite.",
        { path },
      );
    }
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new IngestEvidenceRouteError(
        400,
        "validation_failed",
        "Values must not contain circular references.",
        { path },
      );
    }
    seen.add(value);
    const serialized = `[${value
      .map((item, index) => stringifyStable(item, formatArrayPath(path, index), seen))
      .join(",")}]`;
    seen.delete(value);
    return serialized;
  }

  if (isRecord(value)) {
    if (seen.has(value)) {
      throw new IngestEvidenceRouteError(
        400,
        "validation_failed",
        "Values must not contain circular references.",
        { path },
      );
    }
    seen.add(value);
    const serialized = `{${Object.entries(value)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => {
        const nestedPath = path.length === 0 ? key : `${path}.${key}`;
        return `${JSON.stringify(key)}:${stringifyStable(nested, nestedPath, seen)}`;
      })
      .join(",")}}`;
    seen.delete(value);
    return serialized;
  }

  if (value === undefined) {
    return "null";
  }

  throw new IngestEvidenceRouteError(
    400,
    "validation_failed",
    "Value must be JSON-compatible.",
    { path },
  );
}

function cloneJsonCompatible(value: unknown): unknown {
  return JSON.parse(serializeDeterministicJson(value));
}

function redactJsonValue(
  value: unknown,
  key = "",
  seen: WeakSet<object> = new WeakSet<object>(),
): unknown {
  if (key.length > 0 && isSensitiveFieldKey(key)) {
    return INGEST_EVIDENCE_REDACTION;
  }

  if (typeof value === "string") {
    return redactStringValue(value);
  }

  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new IngestEvidenceRouteError(
        400,
        "validation_failed",
        "Values must not contain circular references.",
        { path: key },
      );
    }
    seen.add(value);
    const redacted = value.map((item) => redactJsonValue(item, "", seen));
    seen.delete(value);
    return redacted;
  }

  if (isRecord(value)) {
    if (seen.has(value)) {
      throw new IngestEvidenceRouteError(
        400,
        "validation_failed",
        "Values must not contain circular references.",
        { path: key },
      );
    }
    seen.add(value);
    const output: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      if (entryValue !== undefined) {
        output[entryKey] = redactJsonValue(entryValue, entryKey, seen);
      }
    }
    seen.delete(value);
    return output;
  }

  if (value === undefined) {
    return null;
  }

  throw new IngestEvidenceRouteError(
    400,
    "validation_failed",
    "Value must be JSON-compatible.",
    { path: key },
  );
}

function isSensitiveFieldKey(key: string): boolean {
  return !SECTION_SET.has(key) && SENSITIVE_FIELD_PATTERN.test(key);
}

function redactStringValue(value: string): string {
  if (isSecretShapedString(value)) {
    return INGEST_EVIDENCE_REDACTION;
  }

  return SENSITIVE_TEXT_PATTERNS.reduce(
    (redacted, pattern) => redacted.replace(pattern, (match, prefix) =>
      typeof prefix === "string" ? `${prefix}${INGEST_EVIDENCE_REDACTION}` : INGEST_EVIDENCE_REDACTION,
    ),
    value,
  );
}

function isSecretShapedString(value: string): boolean {
  const trimmed = value.trim();
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(trimmed)) {
    return true;
  }
  if (/^Bearer\s+[A-Za-z0-9._~+/=-]{8,}$/i.test(trimmed)) {
    return true;
  }
  if (/^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/.test(trimmed)) {
    return true;
  }
  if (/^(?:sk|rk|pat|npm)_[A-Za-z0-9_-]{12,}$/.test(trimmed)) {
    return true;
  }
  if (/^(?:sk|rk|pat|glpat|github_pat)-[A-Za-z0-9_-]{12,}$/.test(trimmed)) {
    return true;
  }
  if (/(?:api[_-]?key|authorization|password|secret|token)=\S{8,}/i.test(trimmed)) {
    return true;
  }
  return (
    trimmed.length >= 40 &&
    /^[A-Za-z0-9+/=_-]+$/.test(trimmed) &&
    /[a-z]/.test(trimmed) &&
    /[A-Z]/.test(trimmed) &&
    /[0-9]/.test(trimmed)
  );
}

function readArrayCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function readGeneratedAt(evidence: JsonRecord): string | undefined {
  const generatedAt = readOptionalString(evidence.generatedAt);
  if (generatedAt === null || Number.isNaN(Date.parse(generatedAt))) {
    return undefined;
  }

  return new Date(Date.parse(generatedAt)).toISOString();
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((left, right) => left.localeCompare(right)));
}

function countUtf8Bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function matchesStringField(value: unknown, expected: readonly string[]): boolean {
  return typeof value === "string" && expected.includes(value);
}

function recordIntersectsStrings(
  record: JsonRecord,
  keys: readonly string[],
  expected: readonly string[],
): boolean {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && expected.includes(value)) {
      return true;
    }
    if (
      Array.isArray(value) &&
      value.some((item) => typeof item === "string" && expected.includes(item))
    ) {
      return true;
    }
  }

  return false;
}

function formatArrayPath(path: string, index: number): string {
  return path.length === 0 ? String(index) : `${path}.${index}`;
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

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

type JsonRecord = Record<string, unknown>;
