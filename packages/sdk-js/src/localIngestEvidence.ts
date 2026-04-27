const DEFAULT_PREVIEW_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const EXPORT_PREVIEW_SCHEMA_VERSION = "ingest-search-audit-evidence-export-preview.v1";

export interface LocalIngestEvidenceValidationIssue {
  readonly path: string;
  readonly message: string;
}

export class LocalIngestEvidenceValidationError extends TypeError {
  readonly issues: readonly LocalIngestEvidenceValidationIssue[];

  constructor(message: string, issues: readonly LocalIngestEvidenceValidationIssue[]) {
    super(message);
    this.name = "LocalIngestEvidenceValidationError";
    this.issues = issues;
  }
}

export interface LocalIngestEvidenceCountSummary {
  readonly sourceCount: number;
  readonly evidenceFileCount: number;
  readonly citationCount: number;
  readonly quarantineDecisionCount: number;
  readonly apiRequestTraceCount: number;
  readonly clientSessionTraceCount: number;
}

export interface LocalIngestEvidenceFile {
  readonly id: string;
  readonly fixturePath: string;
  readonly sha256: string;
  readonly schemaVersion?: string;
}

export interface LocalIngestEvidenceSourceSnapshot {
  readonly sourceUri: string;
  readonly path: string;
  readonly mediaType: string;
  readonly checksum: string;
  readonly repositoryState: string;
  readonly logEntryIds: readonly string[];
  readonly indexDocumentIds: readonly string[];
  readonly quarantineItemIds: readonly string[];
}

export interface LocalIngestEvidenceRange {
  readonly startLine?: number;
  readonly endLine?: number;
  readonly row?: number;
  readonly column?: string | number;
  readonly path?: string;
}

export interface LocalIngestEvidenceCitation {
  readonly id: string;
  readonly kind: string;
  readonly sourceUri: string;
  readonly checksum: string;
  readonly trusted: boolean;
  readonly range: LocalIngestEvidenceRange;
  readonly documentId?: string;
  readonly quarantineItemId?: string;
}

export interface LocalIngestEvidenceQuarantineDecision {
  readonly decisionId: string;
  readonly requestId?: string;
  readonly itemId: string;
  readonly sourceUri: string;
  readonly checksum: string;
  readonly fromState: string;
  readonly toState: string;
  readonly actorId: string;
  readonly action: string;
  readonly reason: string;
  readonly decidedAt: string;
  readonly override: boolean;
}

export interface LocalIngestEvidenceApiRequestTrace {
  readonly requestId: string;
  readonly fixtureFileId: string;
  readonly method: string;
  readonly path: string;
  readonly responseStatus: number;
  readonly sourceUris: readonly string[];
  readonly checksums: readonly string[];
  readonly documentIds: readonly string[];
  readonly quarantineItemIds: readonly string[];
}

export interface LocalIngestEvidenceClientSessionTrace {
  readonly traceId: string;
  readonly fixtureFileId: string;
  readonly kind: string;
  readonly relatedRequestIds: readonly string[];
  readonly sourceUris: readonly string[];
  readonly documentIds: readonly string[];
  readonly quarantineItemIds: readonly string[];
  readonly method?: string;
  readonly routePath?: string;
  readonly command?: string;
}

export interface LocalIngestEvidence {
  readonly schemaVersion: string;
  readonly generatedAt?: string;
  readonly workspaceId?: string;
  readonly sessionId?: string;
  readonly localOnly: boolean;
  readonly declaredSummary: Partial<LocalIngestEvidenceCountSummary>;
  readonly evidenceFiles: readonly LocalIngestEvidenceFile[];
  readonly sourceSnapshots: readonly LocalIngestEvidenceSourceSnapshot[];
  readonly citationEvidence: readonly LocalIngestEvidenceCitation[];
  readonly quarantineDecisions: readonly LocalIngestEvidenceQuarantineDecision[];
  readonly apiRequestTrace: readonly LocalIngestEvidenceApiRequestTrace[];
  readonly clientSessionTrace: readonly LocalIngestEvidenceClientSessionTrace[];
}

export interface LocalIngestEvidenceSourceSummary {
  readonly sourceUri: string;
  readonly path: string;
  readonly mediaType: string;
  readonly checksum: string;
  readonly repositoryState: string;
  readonly logEntryCount: number;
  readonly indexDocumentCount: number;
  readonly quarantineItemCount: number;
  readonly citationCount: number;
  readonly decisionCount: number;
}

export interface LocalIngestEvidenceFileSummary {
  readonly id: string;
  readonly fixturePath: string;
  readonly sha256: string;
  readonly schemaVersion?: string;
  readonly referencedByTraceCount: number;
  readonly referencedBySourceCount: number;
}

export interface LocalIngestEvidenceCitationSummary {
  readonly total: number;
  readonly trustedCount: number;
  readonly untrustedCount: number;
  readonly byKind: Readonly<Record<string, number>>;
  readonly sourceUris: readonly string[];
  readonly documentIds: readonly string[];
  readonly quarantineItemIds: readonly string[];
}

export interface LocalIngestEvidenceDecisionSummary {
  readonly total: number;
  readonly byAction: Readonly<Record<string, number>>;
  readonly byTransition: Readonly<Record<string, number>>;
  readonly actors: readonly string[];
  readonly requestIds: readonly string[];
  readonly itemIds: readonly string[];
}

export interface LocalIngestEvidenceTraceSummary {
  readonly apiRequestCount: number;
  readonly clientSessionCount: number;
  readonly apiRequestIds: readonly string[];
  readonly clientTraceIds: readonly string[];
  readonly apiRoutes: readonly string[];
  readonly clientKinds: Readonly<Record<string, number>>;
}

export interface LocalIngestEvidenceSummary {
  readonly schemaVersion: string;
  readonly workspaceId?: string;
  readonly sessionId?: string;
  readonly generatedAt?: string;
  readonly localOnly: boolean;
  readonly declaredCounts: Partial<LocalIngestEvidenceCountSummary>;
  readonly computedCounts: LocalIngestEvidenceCountSummary;
  readonly evidenceFiles: readonly LocalIngestEvidenceFileSummary[];
  readonly sources: readonly LocalIngestEvidenceSourceSummary[];
  readonly citations: LocalIngestEvidenceCitationSummary;
  readonly quarantineDecisions: LocalIngestEvidenceDecisionSummary;
  readonly traces: LocalIngestEvidenceTraceSummary;
}

export type LocalIngestEvidenceDriftSeverity = "error" | "warning";

export interface LocalIngestEvidenceDriftIssue {
  readonly severity: LocalIngestEvidenceDriftSeverity;
  readonly code: string;
  readonly path: string;
  readonly message: string;
  readonly expected?: string | number | boolean;
  readonly actual?: string | number | boolean;
  readonly reference?: string;
}

export interface LocalIngestEvidenceDriftReport {
  readonly ok: boolean;
  readonly issueCount: number;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly issues: readonly LocalIngestEvidenceDriftIssue[];
}

export interface LocalIngestEvidenceRedactionOptions {
  readonly actorIds?: boolean;
  readonly checksums?: boolean;
  readonly commands?: boolean;
  readonly paths?: boolean;
  readonly reasons?: boolean;
  readonly sourceUris?: boolean;
}

export interface LocalIngestEvidenceExportPreviewOptions {
  readonly exportId?: string;
  readonly generatedAt?: string;
  readonly includeDrift?: boolean;
  readonly includeTraces?: boolean;
  readonly redact?: boolean | LocalIngestEvidenceRedactionOptions;
}

export interface LocalIngestEvidenceExportPreview {
  readonly kind: "ingest-evidence.export-preview";
  readonly schemaVersion: string;
  readonly exportId: string;
  readonly generatedAt: string;
  readonly workspaceId?: string;
  readonly sessionId?: string;
  readonly localOnly: boolean;
  readonly redaction: {
    readonly enabled: boolean;
    readonly fields: readonly string[];
  };
  readonly summary: LocalIngestEvidenceSummary;
  readonly files: readonly Record<string, unknown>[];
  readonly sources: readonly Record<string, unknown>[];
  readonly citations: readonly Record<string, unknown>[];
  readonly decisions: readonly Record<string, unknown>[];
  readonly traces?: {
    readonly apiRequests: readonly Record<string, unknown>[];
    readonly clientSessions: readonly Record<string, unknown>[];
  };
  readonly drift?: LocalIngestEvidenceDriftReport;
  readonly manifest: {
    readonly sourceSchemaVersion: string;
    readonly evidenceFingerprint: string;
    readonly previewFingerprint: string;
    readonly driftIssueCount: number;
    readonly counts: LocalIngestEvidenceCountSummary;
  };
}

type MutableValidationIssue = {
  path: string;
  message: string;
};

type NormalizedRedactionOptions = Required<LocalIngestEvidenceRedactionOptions>;

export function loadLocalIngestEvidence(input: string): LocalIngestEvidence;
export function loadLocalIngestEvidence(input: unknown): LocalIngestEvidence;
export function loadLocalIngestEvidence(input: unknown): LocalIngestEvidence {
  if (typeof input !== "string") {
    return normalizeLocalIngestEvidence(input);
  }

  try {
    return normalizeLocalIngestEvidence(JSON.parse(input) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new TypeError(`ingest evidence JSON could not be parsed: ${error.message}`);
    }
    throw error;
  }
}

export function normalizeLocalIngestEvidence(input: unknown): LocalIngestEvidence {
  const issues: MutableValidationIssue[] = [];

  if (!isRecord(input)) {
    throw new LocalIngestEvidenceValidationError("ingest evidence is invalid", [
      { path: "", message: "ingest evidence must be an object" },
    ]);
  }

  requireNonEmptyString(input, "schemaVersion", "schemaVersion", issues);
  optionalStringField(input, "generatedAt", "generatedAt", issues);
  optionalStringField(input, "workspaceId", "workspaceId", issues);
  optionalStringField(input, "sessionId", "sessionId", issues);
  if (input.localOnly !== undefined && typeof input.localOnly !== "boolean") {
    issues.push({ path: "localOnly", message: "localOnly must be a boolean" });
  }

  const declaredSummary = normalizeDeclaredSummary(
    input.evidenceSummary ?? input.declaredSummary,
    input.evidenceSummary === undefined && input.declaredSummary !== undefined
      ? "declaredSummary"
      : "evidenceSummary",
    issues,
  );
  const evidenceFiles = normalizeArray(input.evidenceFiles, "evidenceFiles", issues, normalizeEvidenceFile);
  const sourceSnapshots = normalizeArray(input.sourceSnapshots, "sourceSnapshots", issues, normalizeSourceSnapshot);
  const citationEvidence = normalizeArray(input.citationEvidence, "citationEvidence", issues, normalizeCitation);
  const quarantineDecisions = normalizeArray(
    input.quarantineDecisions,
    "quarantineDecisions",
    issues,
    normalizeQuarantineDecision,
  );
  const apiRequestTrace = normalizeArray(
    input.apiRequestTrace,
    "apiRequestTrace",
    issues,
    normalizeApiRequestTrace,
  );
  const clientSessionTrace = normalizeArray(
    input.clientSessionTrace,
    "clientSessionTrace",
    issues,
    normalizeClientSessionTrace,
  );

  throwValidationIssues("ingest evidence is invalid", issues);

  return deepFreezeClone({
    schemaVersion: trimString(input.schemaVersion) as string,
    generatedAt: optionalTrimmedString(input.generatedAt),
    workspaceId: optionalTrimmedString(input.workspaceId),
    sessionId: optionalTrimmedString(input.sessionId),
    localOnly: input.localOnly === undefined ? false : input.localOnly,
    declaredSummary,
    evidenceFiles: evidenceFiles.sort(compareByString((file) => file.id)),
    sourceSnapshots: sourceSnapshots.sort(compareByString((source) => source.sourceUri)),
    citationEvidence: citationEvidence.sort(compareByString((citation) => citation.id)),
    quarantineDecisions: quarantineDecisions.sort(compareByString((decision) => decision.decisionId)),
    apiRequestTrace: apiRequestTrace.sort(compareByString((request) => request.requestId)),
    clientSessionTrace: clientSessionTrace.sort(compareByString((trace) => trace.traceId)),
  });
}

export function summarizeLocalIngestEvidence(input: LocalIngestEvidence | unknown): LocalIngestEvidenceSummary {
  const evidence = normalizeLocalIngestEvidence(input);
  const traceFileIds = [
    ...evidence.apiRequestTrace.map((trace) => trace.fixtureFileId),
    ...evidence.clientSessionTrace.map((trace) => trace.fixtureFileId),
  ];
  const sourcePaths = evidence.sourceSnapshots.map((source) => source.path);
  const computedCounts = computedEvidenceCounts(evidence);
  const summary: LocalIngestEvidenceSummary = optionalFields({
    schemaVersion: evidence.schemaVersion,
    workspaceId: evidence.workspaceId,
    sessionId: evidence.sessionId,
    generatedAt: evidence.generatedAt,
    localOnly: evidence.localOnly,
    declaredCounts: evidence.declaredSummary,
    computedCounts,
    evidenceFiles: evidence.evidenceFiles.map((file) =>
      optionalFields({
        id: file.id,
        fixturePath: file.fixturePath,
        sha256: file.sha256,
        schemaVersion: file.schemaVersion,
        referencedByTraceCount: traceFileIds.filter((fixtureFileId) => fixtureFileId === file.id).length,
        referencedBySourceCount: sourcePaths.filter((path) => path === file.fixturePath).length,
      }),
    ),
    sources: evidence.sourceSnapshots.map((source) => {
      const sourceCitations = evidence.citationEvidence.filter(
        (citation) => citation.sourceUri === source.sourceUri,
      );
      const sourceDecisions = evidence.quarantineDecisions.filter(
        (decision) => decision.sourceUri === source.sourceUri,
      );

      return {
        sourceUri: source.sourceUri,
        path: source.path,
        mediaType: source.mediaType,
        checksum: source.checksum,
        repositoryState: source.repositoryState,
        logEntryCount: source.logEntryIds.length,
        indexDocumentCount: source.indexDocumentIds.length,
        quarantineItemCount: source.quarantineItemIds.length,
        citationCount: sourceCitations.length,
        decisionCount: sourceDecisions.length,
      };
    }),
    citations: {
      total: evidence.citationEvidence.length,
      trustedCount: evidence.citationEvidence.filter((citation) => citation.trusted).length,
      untrustedCount: evidence.citationEvidence.filter((citation) => !citation.trusted).length,
      byKind: countBy(evidence.citationEvidence.map((citation) => citation.kind)),
      sourceUris: sortedUnique(evidence.citationEvidence.map((citation) => citation.sourceUri)),
      documentIds: sortedUnique(evidence.citationEvidence.flatMap((citation) =>
        citation.documentId === undefined ? [] : [citation.documentId],
      )),
      quarantineItemIds: sortedUnique(evidence.citationEvidence.flatMap((citation) =>
        citation.quarantineItemId === undefined ? [] : [citation.quarantineItemId],
      )),
    },
    quarantineDecisions: {
      total: evidence.quarantineDecisions.length,
      byAction: countBy(evidence.quarantineDecisions.map((decision) => decision.action)),
      byTransition: countBy(evidence.quarantineDecisions.map((decision) =>
        `${decision.fromState}->${decision.toState}`,
      )),
      actors: sortedUnique(evidence.quarantineDecisions.map((decision) => decision.actorId)),
      requestIds: sortedUnique(evidence.quarantineDecisions.flatMap((decision) =>
        decision.requestId === undefined ? [] : [decision.requestId],
      )),
      itemIds: sortedUnique(evidence.quarantineDecisions.map((decision) => decision.itemId)),
    },
    traces: {
      apiRequestCount: evidence.apiRequestTrace.length,
      clientSessionCount: evidence.clientSessionTrace.length,
      apiRequestIds: evidence.apiRequestTrace.map((request) => request.requestId),
      clientTraceIds: evidence.clientSessionTrace.map((trace) => trace.traceId),
      apiRoutes: evidence.apiRequestTrace.map((request) => `${request.method} ${request.path}`),
      clientKinds: countBy(evidence.clientSessionTrace.map((trace) => trace.kind)),
    },
  });

  return deepFreezeClone(summary);
}

export function detectLocalIngestEvidenceDrift(input: LocalIngestEvidence | unknown): LocalIngestEvidenceDriftReport {
  const evidence = normalizeLocalIngestEvidence(input);
  const issues: LocalIngestEvidenceDriftIssue[] = [];
  const counts = computedEvidenceCounts(evidence);
  const sourcesByUri = new Map(evidence.sourceSnapshots.map((source) => [source.sourceUri, source]));
  const filesById = new Map(evidence.evidenceFiles.map((file) => [file.id, file]));
  const filesByPath = new Map(evidence.evidenceFiles.map((file) => [file.fixturePath, file]));
  const requestIds = new Set(evidence.apiRequestTrace.map((request) => request.requestId));
  const knownDocumentIds = new Set(evidence.sourceSnapshots.flatMap((source) => source.indexDocumentIds));
  const knownQuarantineItemIds = new Set(evidence.sourceSnapshots.flatMap((source) => source.quarantineItemIds));

  for (const [key, actual] of Object.entries(counts) as [keyof LocalIngestEvidenceCountSummary, number][]) {
    const expected = evidence.declaredSummary[key];
    if (expected !== undefined && expected !== actual) {
      issues.push({
        severity: "warning",
        code: "summary_count_mismatch",
        path: `evidenceSummary.${key}`,
        message: `declared ${key} does not match normalized evidence`,
        expected,
        actual,
      });
    }
  }

  collectDuplicateIssues(evidence.evidenceFiles.map((file) => file.id), "evidenceFiles", "id", issues);
  collectDuplicateIssues(evidence.sourceSnapshots.map((source) => source.sourceUri), "sourceSnapshots", "sourceUri", issues);
  collectDuplicateIssues(evidence.citationEvidence.map((citation) => citation.id), "citationEvidence", "id", issues);
  collectDuplicateIssues(
    evidence.quarantineDecisions.map((decision) => decision.decisionId),
    "quarantineDecisions",
    "decisionId",
    issues,
  );
  collectDuplicateIssues(evidence.apiRequestTrace.map((request) => request.requestId), "apiRequestTrace", "requestId", issues);
  collectDuplicateIssues(evidence.clientSessionTrace.map((trace) => trace.traceId), "clientSessionTrace", "traceId", issues);

  evidence.sourceSnapshots.forEach((source, index) => {
    const file = filesByPath.get(source.path);
    if (file === undefined) {
      issues.push({
        severity: "error",
        code: "missing_source_file_reference",
        path: `sourceSnapshots.${index}.path`,
        message: "source path is not present in evidenceFiles.fixturePath",
        reference: source.path,
      });
      return;
    }
    if (file.sha256 !== source.checksum) {
      issues.push({
        severity: "error",
        code: "source_file_checksum_mismatch",
        path: `sourceSnapshots.${index}.checksum`,
        message: "source checksum does not match its evidence file SHA-256",
        expected: file.sha256,
        actual: source.checksum,
        reference: source.sourceUri,
      });
    }
  });

  evidence.citationEvidence.forEach((citation, index) => {
    const source = sourcesByUri.get(citation.sourceUri);
    if (source === undefined) {
      issues.push({
        severity: "error",
        code: "missing_source_reference",
        path: `citationEvidence.${index}.sourceUri`,
        message: "citation sourceUri is not present in sourceSnapshots",
        reference: citation.sourceUri,
      });
    } else {
      collectChecksumDrift(citation.checksum, source.checksum, `citationEvidence.${index}.checksum`, citation.sourceUri, issues);
      if (citation.documentId !== undefined && !source.indexDocumentIds.includes(citation.documentId)) {
        issues.push({
          severity: "error",
          code: "missing_document_reference",
          path: `citationEvidence.${index}.documentId`,
          message: "citation documentId is not listed by the source snapshot",
          reference: citation.documentId,
        });
      }
      if (citation.quarantineItemId !== undefined && !source.quarantineItemIds.includes(citation.quarantineItemId)) {
        issues.push({
          severity: "error",
          code: "missing_quarantine_item_reference",
          path: `citationEvidence.${index}.quarantineItemId`,
          message: "citation quarantineItemId is not listed by the source snapshot",
          reference: citation.quarantineItemId,
        });
      }
    }

    if (citation.kind === "indexDocument" && citation.documentId === undefined) {
      issues.push({
        severity: "error",
        code: "missing_document_reference",
        path: `citationEvidence.${index}.documentId`,
        message: "indexDocument citation requires documentId",
        reference: citation.id,
      });
    }
    if (citation.kind === "quarantineItem" && citation.quarantineItemId === undefined) {
      issues.push({
        severity: "error",
        code: "missing_quarantine_item_reference",
        path: `citationEvidence.${index}.quarantineItemId`,
        message: "quarantineItem citation requires quarantineItemId",
        reference: citation.id,
      });
    }
  });

  evidence.quarantineDecisions.forEach((decision, index) => {
    const source = sourcesByUri.get(decision.sourceUri);
    if (source === undefined) {
      issues.push({
        severity: "error",
        code: "missing_source_reference",
        path: `quarantineDecisions.${index}.sourceUri`,
        message: "decision sourceUri is not present in sourceSnapshots",
        reference: decision.sourceUri,
      });
    } else {
      collectChecksumDrift(decision.checksum, source.checksum, `quarantineDecisions.${index}.checksum`, decision.sourceUri, issues);
      if (!source.quarantineItemIds.includes(decision.itemId)) {
        issues.push({
          severity: "error",
          code: "missing_quarantine_item_reference",
          path: `quarantineDecisions.${index}.itemId`,
          message: "decision itemId is not listed by the source snapshot",
          reference: decision.itemId,
        });
      }
    }
    if (decision.requestId !== undefined && !requestIds.has(decision.requestId)) {
      issues.push({
        severity: "error",
        code: "missing_api_request_reference",
        path: `quarantineDecisions.${index}.requestId`,
        message: "decision requestId is not present in apiRequestTrace",
        reference: decision.requestId,
      });
    }
  });

  evidence.apiRequestTrace.forEach((request, index) => {
    if (!filesById.has(request.fixtureFileId)) {
      issues.push({
        severity: "error",
        code: "missing_evidence_file_reference",
        path: `apiRequestTrace.${index}.fixtureFileId`,
        message: "api request fixtureFileId is not present in evidenceFiles",
        reference: request.fixtureFileId,
      });
    }
    request.sourceUris.forEach((sourceUri, sourceIndex) => {
      const source = sourcesByUri.get(sourceUri);
      if (source === undefined) {
        issues.push({
          severity: "error",
          code: "missing_source_reference",
          path: `apiRequestTrace.${index}.sourceUris.${sourceIndex}`,
          message: "api request sourceUri is not present in sourceSnapshots",
          reference: sourceUri,
        });
        return;
      }
      const checksum = request.checksums[sourceIndex];
      if (checksum !== undefined) {
        collectChecksumDrift(checksum, source.checksum, `apiRequestTrace.${index}.checksums.${sourceIndex}`, sourceUri, issues);
      }
    });
    request.documentIds.forEach((documentId, documentIndex) => {
      if (!knownDocumentIds.has(documentId)) {
        issues.push({
          severity: "error",
          code: "missing_document_reference",
          path: `apiRequestTrace.${index}.documentIds.${documentIndex}`,
          message: "api request documentId is not present in any source snapshot",
          reference: documentId,
        });
      }
    });
    request.quarantineItemIds.forEach((itemId, itemIndex) => {
      if (!knownQuarantineItemIds.has(itemId)) {
        issues.push({
          severity: "error",
          code: "missing_quarantine_item_reference",
          path: `apiRequestTrace.${index}.quarantineItemIds.${itemIndex}`,
          message: "api request quarantineItemId is not present in any source snapshot",
          reference: itemId,
        });
      }
    });
  });

  evidence.clientSessionTrace.forEach((trace, index) => {
    if (!filesById.has(trace.fixtureFileId)) {
      issues.push({
        severity: "error",
        code: "missing_evidence_file_reference",
        path: `clientSessionTrace.${index}.fixtureFileId`,
        message: "client trace fixtureFileId is not present in evidenceFiles",
        reference: trace.fixtureFileId,
      });
    }
    trace.relatedRequestIds.forEach((requestId, requestIndex) => {
      if (!requestIds.has(requestId)) {
        issues.push({
          severity: "error",
          code: "missing_api_request_reference",
          path: `clientSessionTrace.${index}.relatedRequestIds.${requestIndex}`,
          message: "client trace relatedRequestId is not present in apiRequestTrace",
          reference: requestId,
        });
      }
    });
    trace.sourceUris.forEach((sourceUri, sourceIndex) => {
      if (!sourcesByUri.has(sourceUri)) {
        issues.push({
          severity: "error",
          code: "missing_source_reference",
          path: `clientSessionTrace.${index}.sourceUris.${sourceIndex}`,
          message: "client trace sourceUri is not present in sourceSnapshots",
          reference: sourceUri,
        });
      }
    });
    trace.documentIds.forEach((documentId, documentIndex) => {
      if (!knownDocumentIds.has(documentId)) {
        issues.push({
          severity: "error",
          code: "missing_document_reference",
          path: `clientSessionTrace.${index}.documentIds.${documentIndex}`,
          message: "client trace documentId is not present in any source snapshot",
          reference: documentId,
        });
      }
    });
    trace.quarantineItemIds.forEach((itemId, itemIndex) => {
      if (!knownQuarantineItemIds.has(itemId)) {
        issues.push({
          severity: "error",
          code: "missing_quarantine_item_reference",
          path: `clientSessionTrace.${index}.quarantineItemIds.${itemIndex}`,
          message: "client trace quarantineItemId is not present in any source snapshot",
          reference: itemId,
        });
      }
    });
  });

  const sortedIssues = issues.sort(compareDriftIssues);
  const errorCount = sortedIssues.filter((issue) => issue.severity === "error").length;
  const warningCount = sortedIssues.length - errorCount;

  return deepFreezeClone({
    ok: sortedIssues.length === 0,
    issueCount: sortedIssues.length,
    errorCount,
    warningCount,
    issues: sortedIssues,
  });
}

export function buildLocalIngestEvidenceExportPreview(
  input: LocalIngestEvidence | unknown,
  options: LocalIngestEvidenceExportPreviewOptions = {},
): LocalIngestEvidenceExportPreview {
  const evidence = normalizeLocalIngestEvidence(input);
  const redaction = normalizeRedactionOptions(options.redact);
  const redactionFields = redactionFieldNames(redaction);
  const generatedAt = options.generatedAt === undefined
    ? evidence.generatedAt ?? DEFAULT_PREVIEW_TIMESTAMP
    : requireOptionString(options.generatedAt, "generatedAt");
  const summary = summarizeLocalIngestEvidence(evidence);
  const drift = detectLocalIngestEvidenceDrift(evidence);
  const includeTraces = options.includeTraces ?? true;
  const includeDrift = options.includeDrift ?? true;
  const evidenceFingerprint = fingerprint(evidence);
  const exportId = options.exportId === undefined
    ? `ingest_evidence_${hashText(stableStringify({
      evidenceFingerprint,
      generatedAt,
      redactionFields,
    }))}`
    : requireOptionString(options.exportId, "exportId");
  const redactor = createRedactor(redaction);
  const counts = computedEvidenceCounts(evidence);
  const previewCore = optionalFields({
    kind: "ingest-evidence.export-preview" as const,
    schemaVersion: EXPORT_PREVIEW_SCHEMA_VERSION,
    exportId,
    generatedAt,
    workspaceId: evidence.workspaceId,
    sessionId: evidence.sessionId,
    localOnly: evidence.localOnly,
    redaction: {
      enabled: redactionFields.length > 0,
      fields: redactionFields,
    },
    summary: redactSummary(summary, redactor),
    files: evidence.evidenceFiles.map((file) =>
      optionalFields({
        id: file.id,
        fixturePath: redactor.path(file.fixturePath),
        schemaVersion: file.schemaVersion,
        sha256: redactor.checksum(file.sha256),
      }),
    ),
    sources: evidence.sourceSnapshots.map((source) => ({
      sourceUri: redactor.sourceUri(source.sourceUri),
      path: redactor.path(source.path),
      mediaType: source.mediaType,
      checksum: redactor.checksum(source.checksum),
      repositoryState: source.repositoryState,
      logEntryIds: source.logEntryIds,
      indexDocumentIds: source.indexDocumentIds,
      quarantineItemIds: source.quarantineItemIds,
    })),
    citations: evidence.citationEvidence.map((citation) =>
      optionalFields({
        id: citation.id,
        kind: citation.kind,
        documentId: citation.documentId,
        quarantineItemId: citation.quarantineItemId,
        sourceUri: redactor.sourceUri(citation.sourceUri),
        checksum: redactor.checksum(citation.checksum),
        range: redactRange(citation.range, redactor),
        trusted: citation.trusted,
      }),
    ),
    decisions: evidence.quarantineDecisions.map((decision) =>
      optionalFields({
        decisionId: decision.decisionId,
        requestId: decision.requestId,
        itemId: decision.itemId,
        sourceUri: redactor.sourceUri(decision.sourceUri),
        checksum: redactor.checksum(decision.checksum),
        fromState: decision.fromState,
        toState: decision.toState,
        actorId: redactor.actorId(decision.actorId),
        action: decision.action,
        reason: redactor.reason(decision.reason),
        decidedAt: decision.decidedAt,
        override: decision.override,
      }),
    ),
    traces: includeTraces
      ? {
          apiRequests: evidence.apiRequestTrace.map((request) => ({
            requestId: request.requestId,
            fixtureFileId: request.fixtureFileId,
            method: request.method,
            path: request.path,
            responseStatus: request.responseStatus,
            sourceUris: request.sourceUris.map(redactor.sourceUri),
            checksums: request.checksums.map(redactor.checksum),
            documentIds: request.documentIds,
            quarantineItemIds: request.quarantineItemIds,
          })),
          clientSessions: evidence.clientSessionTrace.map((trace) =>
            optionalFields({
              traceId: trace.traceId,
              fixtureFileId: trace.fixtureFileId,
              kind: trace.kind,
              method: trace.method,
              routePath: trace.routePath,
              command: trace.command === undefined ? undefined : redactor.command(trace.command),
              relatedRequestIds: trace.relatedRequestIds,
              sourceUris: trace.sourceUris.map(redactor.sourceUri),
              documentIds: trace.documentIds,
              quarantineItemIds: trace.quarantineItemIds,
            }),
          ),
        }
      : undefined,
    drift: includeDrift ? redactDriftReport(drift, redactor) : undefined,
  });
  const manifestBase = {
    sourceSchemaVersion: evidence.schemaVersion,
    evidenceFingerprint,
    driftIssueCount: drift.issueCount,
    counts,
  };
  const previewFingerprint = fingerprint({
    ...previewCore,
    manifest: manifestBase,
  });

  return deepFreezeClone({
    ...previewCore,
    manifest: {
      ...manifestBase,
      previewFingerprint,
    },
  });
}

function normalizeEvidenceFile(
  value: unknown,
  path: string,
  issues: MutableValidationIssue[],
): LocalIngestEvidenceFile | undefined {
  if (!isRecord(value)) {
    issues.push({ path, message: "evidence file must be an object" });
    return undefined;
  }

  requireNonEmptyString(value, "id", joinPath(path, "id"), issues);
  requireNonEmptyString(value, "fixturePath", joinPath(path, "fixturePath"), issues);
  requireChecksum(value, "sha256", joinPath(path, "sha256"), issues);
  optionalStringField(value, "schemaVersion", joinPath(path, "schemaVersion"), issues);

  if (!hasRequiredStrings(value, ["id", "fixturePath", "sha256"])) {
    return undefined;
  }

  return optionalFields({
    id: trimString(value.id) as string,
    fixturePath: trimString(value.fixturePath) as string,
    schemaVersion: optionalTrimmedString(value.schemaVersion),
    sha256: trimString(value.sha256) as string,
  });
}

function normalizeSourceSnapshot(
  value: unknown,
  path: string,
  issues: MutableValidationIssue[],
): LocalIngestEvidenceSourceSnapshot | undefined {
  if (!isRecord(value)) {
    issues.push({ path, message: "source snapshot must be an object" });
    return undefined;
  }

  requireNonEmptyString(value, "sourceUri", joinPath(path, "sourceUri"), issues);
  requireNonEmptyString(value, "path", joinPath(path, "path"), issues);
  requireNonEmptyString(value, "mediaType", joinPath(path, "mediaType"), issues);
  requireChecksum(value, "checksum", joinPath(path, "checksum"), issues);
  requireNonEmptyString(value, "repositoryState", joinPath(path, "repositoryState"), issues);
  const logEntryIds = normalizeStringArray(value.logEntryIds, joinPath(path, "logEntryIds"), issues);
  const indexDocumentIds = normalizeStringArray(value.indexDocumentIds, joinPath(path, "indexDocumentIds"), issues);
  const quarantineItemIds = normalizeStringArray(value.quarantineItemIds, joinPath(path, "quarantineItemIds"), issues);

  if (!hasRequiredStrings(value, ["sourceUri", "path", "mediaType", "checksum", "repositoryState"])) {
    return undefined;
  }

  return {
    sourceUri: trimString(value.sourceUri) as string,
    path: trimString(value.path) as string,
    mediaType: trimString(value.mediaType) as string,
    checksum: trimString(value.checksum) as string,
    repositoryState: trimString(value.repositoryState) as string,
    logEntryIds,
    indexDocumentIds,
    quarantineItemIds,
  };
}

function normalizeCitation(
  value: unknown,
  path: string,
  issues: MutableValidationIssue[],
): LocalIngestEvidenceCitation | undefined {
  if (!isRecord(value)) {
    issues.push({ path, message: "citation evidence must be an object" });
    return undefined;
  }

  requireNonEmptyString(value, "id", joinPath(path, "id"), issues);
  requireNonEmptyString(value, "kind", joinPath(path, "kind"), issues);
  optionalStringField(value, "documentId", joinPath(path, "documentId"), issues);
  optionalStringField(value, "quarantineItemId", joinPath(path, "quarantineItemId"), issues);
  requireNonEmptyString(value, "sourceUri", joinPath(path, "sourceUri"), issues);
  requireChecksum(value, "checksum", joinPath(path, "checksum"), issues);
  requireBoolean(value, "trusted", joinPath(path, "trusted"), issues);
  const range = normalizeRange(value.range, joinPath(path, "range"), issues);

  if (!hasRequiredStrings(value, ["id", "kind", "sourceUri", "checksum"]) || typeof value.trusted !== "boolean") {
    return undefined;
  }

  return optionalFields({
    id: trimString(value.id) as string,
    kind: trimString(value.kind) as string,
    documentId: optionalTrimmedString(value.documentId),
    quarantineItemId: optionalTrimmedString(value.quarantineItemId),
    sourceUri: trimString(value.sourceUri) as string,
    checksum: trimString(value.checksum) as string,
    range,
    trusted: value.trusted,
  });
}

function normalizeQuarantineDecision(
  value: unknown,
  path: string,
  issues: MutableValidationIssue[],
): LocalIngestEvidenceQuarantineDecision | undefined {
  if (!isRecord(value)) {
    issues.push({ path, message: "quarantine decision must be an object" });
    return undefined;
  }

  requireNonEmptyString(value, "decisionId", joinPath(path, "decisionId"), issues);
  optionalStringField(value, "requestId", joinPath(path, "requestId"), issues);
  requireNonEmptyString(value, "itemId", joinPath(path, "itemId"), issues);
  requireNonEmptyString(value, "sourceUri", joinPath(path, "sourceUri"), issues);
  requireChecksum(value, "checksum", joinPath(path, "checksum"), issues);
  requireNonEmptyString(value, "fromState", joinPath(path, "fromState"), issues);
  requireNonEmptyString(value, "toState", joinPath(path, "toState"), issues);
  requireNonEmptyString(value, "actorId", joinPath(path, "actorId"), issues);
  requireNonEmptyString(value, "action", joinPath(path, "action"), issues);
  requireNonEmptyString(value, "reason", joinPath(path, "reason"), issues);
  requireNonEmptyString(value, "decidedAt", joinPath(path, "decidedAt"), issues);
  requireBoolean(value, "override", joinPath(path, "override"), issues);

  if (
    !hasRequiredStrings(value, [
      "decisionId",
      "itemId",
      "sourceUri",
      "checksum",
      "fromState",
      "toState",
      "actorId",
      "action",
      "reason",
      "decidedAt",
    ]) ||
    typeof value.override !== "boolean"
  ) {
    return undefined;
  }

  return optionalFields({
    decisionId: trimString(value.decisionId) as string,
    requestId: optionalTrimmedString(value.requestId),
    itemId: trimString(value.itemId) as string,
    sourceUri: trimString(value.sourceUri) as string,
    checksum: trimString(value.checksum) as string,
    fromState: trimString(value.fromState) as string,
    toState: trimString(value.toState) as string,
    actorId: trimString(value.actorId) as string,
    action: trimString(value.action) as string,
    reason: trimString(value.reason) as string,
    decidedAt: trimString(value.decidedAt) as string,
    override: value.override,
  });
}

function normalizeApiRequestTrace(
  value: unknown,
  path: string,
  issues: MutableValidationIssue[],
): LocalIngestEvidenceApiRequestTrace | undefined {
  if (!isRecord(value)) {
    issues.push({ path, message: "api request trace must be an object" });
    return undefined;
  }

  requireNonEmptyString(value, "requestId", joinPath(path, "requestId"), issues);
  requireNonEmptyString(value, "fixtureFileId", joinPath(path, "fixtureFileId"), issues);
  requireNonEmptyString(value, "method", joinPath(path, "method"), issues);
  requireNonEmptyString(value, "path", joinPath(path, "path"), issues);
  requireHttpStatus(value, "responseStatus", joinPath(path, "responseStatus"), issues);
  const sourceUris = normalizeStringArray(value.sourceUris, joinPath(path, "sourceUris"), issues, { required: false });
  const checksums = normalizeStringArray(value.checksums, joinPath(path, "checksums"), issues, { required: false });
  const documentIds = normalizeStringArray(value.documentIds, joinPath(path, "documentIds"), issues, { required: false });
  const quarantineItemIds = normalizeStringArray(
    value.quarantineItemIds,
    joinPath(path, "quarantineItemIds"),
    issues,
    { required: false },
  );

  checksums.forEach((checksum, index) => {
    if (!isSha256(checksum)) {
      issues.push({ path: `${joinPath(path, "checksums")}.${index}`, message: "checksum must be a lowercase SHA-256 checksum" });
    }
  });

  if (
    !hasRequiredStrings(value, ["requestId", "fixtureFileId", "method", "path"]) ||
    !isHttpStatus(value.responseStatus)
  ) {
    return undefined;
  }

  return {
    requestId: trimString(value.requestId) as string,
    fixtureFileId: trimString(value.fixtureFileId) as string,
    method: (trimString(value.method) as string).toUpperCase(),
    path: trimString(value.path) as string,
    responseStatus: value.responseStatus,
    sourceUris,
    checksums,
    documentIds,
    quarantineItemIds,
  };
}

function normalizeClientSessionTrace(
  value: unknown,
  path: string,
  issues: MutableValidationIssue[],
): LocalIngestEvidenceClientSessionTrace | undefined {
  if (!isRecord(value)) {
    issues.push({ path, message: "client session trace must be an object" });
    return undefined;
  }

  requireNonEmptyString(value, "traceId", joinPath(path, "traceId"), issues);
  requireNonEmptyString(value, "fixtureFileId", joinPath(path, "fixtureFileId"), issues);
  requireNonEmptyString(value, "kind", joinPath(path, "kind"), issues);
  optionalStringField(value, "method", joinPath(path, "method"), issues);
  optionalStringField(value, "routePath", joinPath(path, "routePath"), issues);
  optionalStringField(value, "command", joinPath(path, "command"), issues);
  const relatedRequestIds = normalizeStringArray(
    value.relatedRequestIds,
    joinPath(path, "relatedRequestIds"),
    issues,
    { required: false },
  );
  const sourceUris = normalizeStringArray(value.sourceUris, joinPath(path, "sourceUris"), issues, { required: false });
  const documentIds = normalizeStringArray(value.documentIds, joinPath(path, "documentIds"), issues, { required: false });
  const quarantineItemIds = normalizeStringArray(
    value.quarantineItemIds,
    joinPath(path, "quarantineItemIds"),
    issues,
    { required: false },
  );

  if (!hasRequiredStrings(value, ["traceId", "fixtureFileId", "kind"])) {
    return undefined;
  }

  return optionalFields({
    traceId: trimString(value.traceId) as string,
    fixtureFileId: trimString(value.fixtureFileId) as string,
    kind: trimString(value.kind) as string,
    method: optionalTrimmedString(value.method)?.toUpperCase(),
    routePath: optionalTrimmedString(value.routePath),
    command: optionalTrimmedString(value.command),
    relatedRequestIds,
    sourceUris,
    documentIds,
    quarantineItemIds,
  });
}

function normalizeDeclaredSummary(
  value: unknown,
  path: string,
  issues: MutableValidationIssue[],
): Partial<LocalIngestEvidenceCountSummary> {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    issues.push({ path, message: "evidenceSummary must be an object" });
    return {};
  }

  const summary: Partial<LocalIngestEvidenceCountSummary> = {};
  for (const key of countSummaryKeys()) {
    if (value[key] === undefined) {
      continue;
    }
    if (!Number.isInteger(value[key]) || (value[key] as number) < 0) {
      issues.push({ path: joinPath(path, key), message: `${key} must be a non-negative integer` });
      continue;
    }
    summary[key] = value[key] as number;
  }

  return summary;
}

function normalizeArray<T>(
  value: unknown,
  path: string,
  issues: MutableValidationIssue[],
  normalize: (entry: unknown, path: string, issues: MutableValidationIssue[]) => T | undefined,
): T[] {
  if (!Array.isArray(value)) {
    issues.push({ path, message: `${path} must be an array` });
    return [];
  }

  return value.flatMap((entry, index) => {
    const normalized = normalize(entry, `${path}.${index}`, issues);
    return normalized === undefined ? [] : [normalized];
  });
}

function normalizeRange(
  value: unknown,
  path: string,
  issues: MutableValidationIssue[],
): LocalIngestEvidenceRange {
  if (!isRecord(value)) {
    issues.push({ path, message: "range must be an object" });
    return {};
  }

  const range: Record<string, string | number> = {};
  const startLine = value.startLine ?? value.start_line;
  const endLine = value.endLine ?? value.end_line;

  if (startLine !== undefined) {
    requirePositiveInteger({ startLine }, "startLine", joinPath(path, "startLine"), issues);
    if (Number.isInteger(startLine)) {
      range.startLine = startLine as number;
    }
  }
  if (endLine !== undefined) {
    requirePositiveInteger({ endLine }, "endLine", joinPath(path, "endLine"), issues);
    if (Number.isInteger(endLine)) {
      range.endLine = endLine as number;
    }
  }
  if (value.row !== undefined) {
    requirePositiveInteger(value, "row", joinPath(path, "row"), issues);
    if (Number.isInteger(value.row)) {
      range.row = value.row as number;
    }
  }
  if (value.column !== undefined) {
    if (
      !(
        (Number.isInteger(value.column) && (value.column as number) > 0) ||
        (typeof value.column === "string" && trimString(value.column).length > 0)
      )
    ) {
      issues.push({ path: joinPath(path, "column"), message: "column must be a positive integer or non-empty string" });
    } else {
      range.column = typeof value.column === "string" ? trimString(value.column) : value.column as number;
    }
  }
  if (value.path !== undefined) {
    requireNonEmptyString(value, "path", joinPath(path, "path"), issues);
    if (typeof value.path === "string" && trimString(value.path).length > 0) {
      range.path = trimString(value.path);
    }
  }
  if (
    Number.isInteger(range.startLine) &&
    Number.isInteger(range.endLine) &&
    (range.endLine as number) < (range.startLine as number)
  ) {
    issues.push({ path: joinPath(path, "endLine"), message: "endLine must be greater than or equal to startLine" });
  }
  if (Object.keys(range).length === 0) {
    issues.push({ path, message: "range must include at least one locator" });
  }

  return range;
}

function computedEvidenceCounts(evidence: LocalIngestEvidence): LocalIngestEvidenceCountSummary {
  return {
    sourceCount: evidence.sourceSnapshots.length,
    evidenceFileCount: evidence.evidenceFiles.length,
    citationCount: evidence.citationEvidence.length,
    quarantineDecisionCount: evidence.quarantineDecisions.length,
    apiRequestTraceCount: evidence.apiRequestTrace.length,
    clientSessionTraceCount: evidence.clientSessionTrace.length,
  };
}

function countSummaryKeys(): (keyof LocalIngestEvidenceCountSummary)[] {
  return [
    "sourceCount",
    "evidenceFileCount",
    "citationCount",
    "quarantineDecisionCount",
    "apiRequestTraceCount",
    "clientSessionTraceCount",
  ];
}

function collectChecksumDrift(
  actual: string,
  expected: string,
  path: string,
  reference: string,
  issues: LocalIngestEvidenceDriftIssue[],
): void {
  if (actual === expected) {
    return;
  }

  issues.push({
    severity: "error",
    code: "checksum_mismatch",
    path,
    message: "checksum does not match the referenced source snapshot",
    expected,
    actual,
    reference,
  });
}

function collectDuplicateIssues(
  values: readonly string[],
  path: string,
  field: string,
  issues: LocalIngestEvidenceDriftIssue[],
): void {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  for (const [value, count] of Array.from(counts.entries()).sort(([left], [right]) => compareText(left, right))) {
    if (count > 1) {
      issues.push({
        severity: "error",
        code: "duplicate_id",
        path,
        message: `${field} is duplicated`,
        actual: count,
        reference: value,
      });
    }
  }
}

function normalizeRedactionOptions(
  value: boolean | LocalIngestEvidenceRedactionOptions | undefined,
): NormalizedRedactionOptions {
  if (value === true) {
    return {
      actorIds: true,
      checksums: true,
      commands: true,
      paths: true,
      reasons: true,
      sourceUris: true,
    };
  }
  if (value === false || value === undefined) {
    return {
      actorIds: false,
      checksums: false,
      commands: false,
      paths: false,
      reasons: false,
      sourceUris: false,
    };
  }
  if (!isRecord(value)) {
    throw new TypeError("redact must be a boolean or redaction options object");
  }

  return {
    actorIds: value.actorIds === true,
    checksums: value.checksums === true,
    commands: value.commands === true,
    paths: value.paths === true,
    reasons: value.reasons === true,
    sourceUris: value.sourceUris === true,
  };
}

function redactionFieldNames(redaction: NormalizedRedactionOptions): string[] {
  return Object.entries(redaction)
    .filter(([, enabled]) => enabled)
    .map(([field]) => field)
    .sort(compareText);
}

function createRedactor(redaction: NormalizedRedactionOptions): {
  actorId(value: string): string;
  checksum(value: string): string;
  command(value: string): string;
  path(value: string): string;
  reason(value: string): string;
  sourceUri(value: string): string;
} {
  return {
    actorId: (value) => redaction.actorIds ? redactValue("actorId", value) : value,
    checksum: (value) => redaction.checksums ? redactValue("checksum", value) : value,
    command: (value) => redaction.commands ? redactValue("command", value) : value,
    path: (value) => redaction.paths ? redactValue("path", value) : value,
    reason: (value) => redaction.reasons ? redactValue("reason", value) : value,
    sourceUri: (value) => redaction.sourceUris ? redactValue("sourceUri", value) : value,
  };
}

function redactValue(kind: string, value: string): string {
  return `[redacted:${kind}:${hashText(value)}]`;
}

function redactSummary(
  summary: LocalIngestEvidenceSummary,
  redactor: ReturnType<typeof createRedactor>,
): LocalIngestEvidenceSummary {
  return {
    ...summary,
    evidenceFiles: summary.evidenceFiles.map((file) =>
      optionalFields({
        ...file,
        fixturePath: redactor.path(file.fixturePath),
        sha256: redactor.checksum(file.sha256),
      }),
    ),
    sources: summary.sources.map((source) => ({
      ...source,
      sourceUri: redactor.sourceUri(source.sourceUri),
      path: redactor.path(source.path),
      checksum: redactor.checksum(source.checksum),
    })),
    citations: {
      ...summary.citations,
      sourceUris: summary.citations.sourceUris.map(redactor.sourceUri),
    },
    quarantineDecisions: {
      ...summary.quarantineDecisions,
      actors: summary.quarantineDecisions.actors.map(redactor.actorId),
    },
  };
}

function redactDriftReport(
  report: LocalIngestEvidenceDriftReport,
  redactor: ReturnType<typeof createRedactor>,
): LocalIngestEvidenceDriftReport {
  return {
    ...report,
    issues: report.issues.map((issue) =>
      optionalFields({
        ...issue,
        expected: typeof issue.expected === "string" ? redactor.checksum(issue.expected) : issue.expected,
        actual: typeof issue.actual === "string" ? redactor.checksum(issue.actual) : issue.actual,
        reference: issue.reference === undefined ? undefined : redactReference(issue.reference, redactor),
      }),
    ),
  };
}

function redactRange(
  range: LocalIngestEvidenceRange,
  redactor: ReturnType<typeof createRedactor>,
): LocalIngestEvidenceRange {
  return optionalFields({
    ...range,
    path: range.path === undefined ? undefined : redactor.path(range.path),
  });
}

function redactReference(
  value: string,
  redactor: ReturnType<typeof createRedactor>,
): string {
  if (isSha256(value)) {
    return redactor.checksum(value);
  }
  if (value.includes("://")) {
    return redactor.sourceUri(value);
  }
  if (value.includes("/") || value.includes("\\")) {
    return redactor.path(value);
  }
  return value;
}

function compareDriftIssues(
  left: LocalIngestEvidenceDriftIssue,
  right: LocalIngestEvidenceDriftIssue,
): number {
  return compareText(left.severity, right.severity) ||
    compareText(left.code, right.code) ||
    compareText(left.path, right.path) ||
    compareText(left.reference ?? "", right.reference ?? "");
}

function countBy(values: readonly string[]): Readonly<Record<string, number>> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Object.freeze(Object.fromEntries(
    Array.from(counts.entries()).sort(([left], [right]) => compareText(left, right)),
  ));
}

function normalizeStringArray(
  value: unknown,
  path: string,
  issues: MutableValidationIssue[],
  options: { readonly required?: boolean } = {},
): string[] {
  if (value === undefined && options.required === false) {
    return [];
  }
  if (!Array.isArray(value)) {
    issues.push({ path, message: `${lastPathSegment(path)} must be an array` });
    return [];
  }

  return value.flatMap((entry, index) => {
    if (typeof entry !== "string" || trimString(entry).length === 0) {
      issues.push({ path: `${path}.${index}`, message: "value must be a non-empty string" });
      return [];
    }
    return [trimString(entry)];
  });
}

function requireNonEmptyString(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: MutableValidationIssue[],
): void {
  if (typeof value[field] !== "string" || trimString(value[field]).length === 0) {
    issues.push({ path, message: `${field} must be a non-empty string` });
  }
}

function optionalStringField(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: MutableValidationIssue[],
): void {
  if (value[field] !== undefined && (typeof value[field] !== "string" || trimString(value[field]).length === 0)) {
    issues.push({ path, message: `${field} must be a non-empty string when provided` });
  }
}

function requireChecksum(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: MutableValidationIssue[],
): void {
  if (typeof value[field] !== "string" || !isSha256(value[field])) {
    issues.push({ path, message: `${field} must be a lowercase SHA-256 checksum` });
  }
}

function requireBoolean(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: MutableValidationIssue[],
): void {
  if (typeof value[field] !== "boolean") {
    issues.push({ path, message: `${field} must be a boolean` });
  }
}

function requireHttpStatus(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: MutableValidationIssue[],
): void {
  if (!isHttpStatus(value[field])) {
    issues.push({ path, message: `${field} must be an HTTP status code` });
  }
}

function requirePositiveInteger(
  value: Record<string, unknown>,
  field: string,
  path: string,
  issues: MutableValidationIssue[],
): void {
  if (!Number.isInteger(value[field]) || (value[field] as number) <= 0) {
    issues.push({ path, message: `${field} must be a positive integer` });
  }
}

function hasRequiredStrings(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return fields.every((field) => typeof value[field] === "string" && trimString(value[field]).length > 0);
}

function isHttpStatus(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 100 && (value as number) <= 599;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function optionalTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && trimString(value).length > 0
    ? trimString(value)
    : undefined;
}

function requireOptionString(value: unknown, field: string): string {
  if (typeof value !== "string" || trimString(value).length === 0) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return trimString(value);
}

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sortedUnique(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort(compareText);
}

function compareByString<T>(select: (value: T) => string): (left: T, right: T) => number {
  return (left, right) => compareText(select(left), select(right));
}

function compareText(left: string, right: string): number {
  return left.toLowerCase() < right.toLowerCase()
    ? -1
    : left.toLowerCase() > right.toLowerCase()
      ? 1
      : left < right
        ? -1
        : left > right
          ? 1
          : 0;
}

function fingerprint(value: unknown): string {
  return `fnv1a32:${hashText(stableStringify(value))}`;
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36).padStart(7, "0");
}

function stableStringify(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function optionalFields<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T;
}

function throwValidationIssues(message: string, issues: readonly MutableValidationIssue[]): void {
  if (issues.length > 0) {
    throw new LocalIngestEvidenceValidationError(message, issues);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function joinPath(prefix: string, field: string): string {
  return prefix.length === 0 ? field : `${prefix}.${field}`;
}

function lastPathSegment(path: string): string {
  const segments = path.split(".");
  return segments[segments.length - 1] ?? path;
}

function deepFreezeClone<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }
  return value;
}
