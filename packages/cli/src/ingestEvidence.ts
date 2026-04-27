import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

export interface IngestEvidenceCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface IngestEvidenceRunOptions {
  readonly cwd?: string;
}

type ParsedFlagValue = string | boolean;

interface ParsedArgv {
  readonly positionals: readonly string[];
  readonly flags: Readonly<Record<string, ParsedFlagValue>>;
  readonly errors: readonly string[];
}

interface ResolvedLocalPath {
  readonly absolutePath: string;
  readonly displayPath: string;
  readonly workspaceRoot: string;
}

interface EvidenceSummaryCounts {
  readonly sourceCount: number;
  readonly evidenceFileCount: number;
  readonly citationCount: number;
  readonly quarantineDecisionCount: number;
  readonly apiRequestTraceCount: number;
  readonly clientSessionTraceCount: number;
}

interface EvidenceFile {
  readonly id: string;
  readonly fixturePath: string;
  readonly schemaVersion?: string;
  readonly sha256: string;
}

interface SourceSnapshot {
  readonly sourceUri: string;
  readonly path: string;
  readonly mediaType: string;
  readonly checksum: string;
  readonly repositoryState: string;
  readonly logEntryIds: readonly string[];
  readonly indexDocumentIds: readonly string[];
  readonly quarantineItemIds: readonly string[];
}

interface CitationEvidence {
  readonly id: string;
  readonly kind: "indexDocument" | "quarantineItem";
  readonly documentId?: string;
  readonly quarantineItemId?: string;
  readonly sourceUri: string;
  readonly checksum: string;
  readonly range: Record<string, unknown>;
  readonly trusted: boolean;
}

interface QuarantineDecision {
  readonly decisionId: string;
  readonly requestId: string;
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

interface ApiRequestTrace {
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

interface ClientSessionTrace {
  readonly traceId: string;
  readonly fixtureFileId: string;
  readonly kind: string;
  readonly method?: string;
  readonly routePath?: string;
  readonly command?: string;
  readonly relatedRequestIds: readonly string[];
  readonly sourceUris: readonly string[];
  readonly documentIds: readonly string[];
  readonly quarantineItemIds: readonly string[];
}

interface IngestEvidenceBundle {
  readonly schemaVersion: "ingest-search-audit-evidence.v1";
  readonly generatedAt: string;
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly localOnly: boolean;
  readonly evidenceSummary: EvidenceSummaryCounts;
  readonly evidenceFiles: readonly EvidenceFile[];
  readonly sourceSnapshots: readonly SourceSnapshot[];
  readonly citationEvidence: readonly CitationEvidence[];
  readonly quarantineDecisions: readonly QuarantineDecision[];
  readonly apiRequestTrace: readonly ApiRequestTrace[];
  readonly clientSessionTrace: readonly ClientSessionTrace[];
}

interface EvidenceExportRecord {
  readonly category: string;
  readonly id: string;
  readonly checksum?: string;
  readonly fixtureFileId?: string;
  readonly fixturePath?: string;
  readonly mediaType?: string;
  readonly relatedIds: readonly string[];
  readonly schemaVersion?: string;
  readonly sourceUri?: string;
  readonly details: Record<string, unknown>;
}

const HELP_PAYLOAD = {
  kind: "ingest-evidence.help",
  usage: [
    "sovereignops ingest evidence summary --input <path>",
    "sovereignops ingest evidence export --input <path> --format <jsonl|csv>",
    "sovereignops ingest evidence package --input <path>",
    "sovereignops ingest-evidence summary --input <path>",
  ],
  options: {
    input: "Local JSON evidence path inside this workspace.",
    format: "Export content format: jsonl or csv.",
  },
};

const BOOLEAN_FLAGS = new Set(["help", "h"]);
const ALLOWED_FLAGS = new Set(["format", "help", "h", "input", "input-path"]);
const EXPORT_FORMATS = new Set(["jsonl", "csv"]);
const CHECKSUM_PATTERN = /^[0-9a-f]{64}$/;
const CSV_COLUMNS = Object.freeze([
  "category",
  "id",
  "sourceUri",
  "fixturePath",
  "checksum",
  "mediaType",
  "schemaVersion",
  "relatedIds",
  "details",
]);

export async function runIngestEvidenceCli(
  argv: readonly string[] = [],
  options: IngestEvidenceRunOptions = {},
): Promise<IngestEvidenceCliResult | undefined> {
  const parsed = parseArgv(argv);
  if (!isIngestEvidenceParsedCommand(parsed)) {
    return undefined;
  }

  if (parsed.errors.length > 0) {
    return jsonFailure(2, "usage_error", parsed.errors.join("\n"));
  }

  const unknownFlags = Object.keys(parsed.flags).filter((flag) => !ALLOWED_FLAGS.has(flag));
  if (unknownFlags.length > 0) {
    return jsonFailure(2, "usage_error", `Unsupported option: --${unknownFlags[0]}`);
  }

  if (hasHelp(parsed)) {
    return jsonSuccess(HELP_PAYLOAD);
  }

  const action = ingestEvidenceAction(parsed.positionals);
  if (action.length === 0) {
    return jsonSuccess(HELP_PAYLOAD);
  }
  if (action.length !== 1 || !["summary", "export", "package"].includes(action[0])) {
    return unknownIngestEvidenceCommand(parsed);
  }

  try {
    const input = await resolveLocalPath({
      flagName: "input",
      value: requireInputPath(parsed),
      cwd: options.cwd ?? process.cwd(),
    });
    const evidence = parseEvidenceBundle(await readEvidenceJson(input), input.workspaceRoot);

    if (action[0] === "summary") {
      return jsonSuccess(createEvidenceSummary(evidence, input.displayPath));
    }

    if (action[0] === "export") {
      const format = requireExportFormat(parsed);
      const records = createExportRecords(evidence);
      const content = format === "jsonl" ? renderJsonl(records) : renderCsv(records);
      return jsonSuccess({
        kind: "ingest-evidence.export",
        format,
        input: { path: input.displayPath },
        schemaVersion: evidence.schemaVersion,
        workspaceId: evidence.workspaceId,
        sessionId: evidence.sessionId,
        recordCount: records.length,
        content,
        contentSha256: sha256(content),
      });
    }

    if (action[0] === "package") {
      return jsonSuccess(createEvidencePackage(evidence, input.displayPath));
    }
  } catch (error) {
    if (error instanceof IngestEvidenceError) {
      return jsonFailure(error.exitCode, error.code, error.message, error.details);
    }

    return jsonFailure(
      1,
      "ingest_evidence_error",
      error instanceof Error ? error.message : String(error),
    );
  }

  return unknownIngestEvidenceCommand(parsed);
}

export function isIngestEvidenceCommand(argv: readonly string[]): boolean {
  return isIngestEvidenceParsedCommand(parseArgv(argv));
}

function createEvidenceSummary(
  evidence: IngestEvidenceBundle,
  inputPath: string,
): Record<string, unknown> {
  return {
    kind: "ingest-evidence.summary",
    input: { path: inputPath },
    schemaVersion: evidence.schemaVersion,
    generatedAt: evidence.generatedAt,
    workspaceId: evidence.workspaceId,
    sessionId: evidence.sessionId,
    localOnly: evidence.localOnly,
    summary: {
      ...evidence.evidenceSummary,
      mediaTypes: countBy(evidence.sourceSnapshots, (source) => source.mediaType),
      repositoryStates: countBy(evidence.sourceSnapshots, (source) => source.repositoryState),
      citationKinds: countBy(evidence.citationEvidence, (citation) => citation.kind),
      decisionActions: countBy(evidence.quarantineDecisions, (decision) => decision.action),
      apiResponseStatuses: countBy(evidence.apiRequestTrace, (trace) =>
        String(trace.responseStatus),
      ),
      clientTraceKinds: countBy(evidence.clientSessionTrace, (trace) => trace.kind),
      fixtureSchemaVersions: countBy(evidence.evidenceFiles, (file) => file.schemaVersion),
    },
    evidenceFiles: evidence.evidenceFiles.map((file) => optionalFields({
      id: file.id,
      fixturePath: file.fixturePath,
      schemaVersion: file.schemaVersion,
      sha256: file.sha256,
    })),
    sources: evidence.sourceSnapshots.map((source) => ({
      sourceUri: source.sourceUri,
      path: source.path,
      mediaType: source.mediaType,
      checksum: source.checksum,
      repositoryState: source.repositoryState,
      logEntryCount: source.logEntryIds.length,
      indexDocumentCount: source.indexDocumentIds.length,
      quarantineItemCount: source.quarantineItemIds.length,
    })),
  };
}

function createEvidencePackage(
  evidence: IngestEvidenceBundle,
  inputPath: string,
): Record<string, unknown> {
  const records = createExportRecords(evidence);
  const summary = createEvidenceSummary(evidence, inputPath);
  const jsonl = renderJsonl(records);
  const csv = renderCsv(records);
  const manifestSeed = {
    kind: "ingest-evidence.manifest",
    schemaVersion: "ingest-evidence-package-manifest.v1",
    createdAt: evidence.generatedAt,
    input: { path: inputPath },
    evidenceSchemaVersion: evidence.schemaVersion,
    workspaceId: evidence.workspaceId,
    sessionId: evidence.sessionId,
    recordCount: records.length,
    summarySha256: sha256(serializeCompactJson(summary)),
    jsonl: {
      mediaType: "application/jsonl",
      bytes: Buffer.byteLength(jsonl, "utf8"),
      lines: records.length,
      sha256: sha256(jsonl),
    },
    csv: {
      mediaType: "text/csv",
      bytes: Buffer.byteLength(csv, "utf8"),
      rows: records.length,
      columns: CSV_COLUMNS,
      sha256: sha256(csv),
    },
    evidenceFiles: evidence.evidenceFiles.map((file) => optionalFields({
      id: file.id,
      fixturePath: file.fixturePath,
      schemaVersion: file.schemaVersion,
      sha256: file.sha256,
    })),
  };
  const manifest = {
    ...manifestSeed,
    fingerprint: sha256(serializeCompactJson(manifestSeed)),
  };
  const packageSeed = {
    kind: "ingest-evidence.package",
    schemaVersion: "ingest-evidence-package.v1",
    manifest,
    summary,
    jsonl,
    csv,
  };

  return {
    ...packageSeed,
    fingerprint: sha256(serializeCompactJson({
      kind: packageSeed.kind,
      manifestFingerprint: manifest.fingerprint,
      jsonlSha256: manifest.jsonl.sha256,
      csvSha256: manifest.csv.sha256,
    })),
  };
}

function createExportRecords(evidence: IngestEvidenceBundle): readonly EvidenceExportRecord[] {
  const records: EvidenceExportRecord[] = [
    ...evidence.evidenceFiles.map((file) => optionalFields({
      category: "evidenceFile",
      id: file.id,
      checksum: file.sha256,
      fixturePath: file.fixturePath,
      schemaVersion: file.schemaVersion,
      relatedIds: [],
      details: optionalFields({
        schemaVersion: file.schemaVersion,
      }),
    })),
    ...evidence.sourceSnapshots.map((source) => ({
      category: "source",
      id: source.sourceUri,
      sourceUri: source.sourceUri,
      fixturePath: source.path,
      checksum: source.checksum,
      mediaType: source.mediaType,
      relatedIds: uniqueSorted([
        ...source.logEntryIds,
        ...source.indexDocumentIds,
        ...source.quarantineItemIds,
      ]),
      details: {
        repositoryState: source.repositoryState,
        logEntryIds: source.logEntryIds,
        indexDocumentIds: source.indexDocumentIds,
        quarantineItemIds: source.quarantineItemIds,
      },
    })),
    ...evidence.citationEvidence.map((citation) => optionalFields({
      category: "citation",
      id: citation.id,
      sourceUri: citation.sourceUri,
      checksum: citation.checksum,
      relatedIds: uniqueSorted([
        citation.documentId,
        citation.quarantineItemId,
      ].filter((value): value is string => value !== undefined)),
      details: optionalFields({
        kind: citation.kind,
        documentId: citation.documentId,
        quarantineItemId: citation.quarantineItemId,
        range: citation.range,
        trusted: citation.trusted,
      }),
    })),
    ...evidence.quarantineDecisions.map((decision) => ({
      category: "quarantineDecision",
      id: decision.decisionId,
      sourceUri: decision.sourceUri,
      checksum: decision.checksum,
      relatedIds: uniqueSorted([decision.requestId, decision.itemId]),
      details: {
        requestId: decision.requestId,
        itemId: decision.itemId,
        fromState: decision.fromState,
        toState: decision.toState,
        actorId: decision.actorId,
        action: decision.action,
        reason: decision.reason,
        decidedAt: decision.decidedAt,
        override: decision.override,
      },
    })),
    ...evidence.apiRequestTrace.map((trace) => ({
      category: "apiRequestTrace",
      id: trace.requestId,
      fixtureFileId: trace.fixtureFileId,
      relatedIds: uniqueSorted([
        ...trace.sourceUris,
        ...trace.documentIds,
        ...trace.quarantineItemIds,
      ]),
      details: {
        method: trace.method,
        path: trace.path,
        responseStatus: trace.responseStatus,
        sourceUris: trace.sourceUris,
        checksums: trace.checksums,
        documentIds: trace.documentIds,
        quarantineItemIds: trace.quarantineItemIds,
      },
    })),
    ...evidence.clientSessionTrace.map((trace) => optionalFields({
      category: "clientSessionTrace",
      id: trace.traceId,
      fixtureFileId: trace.fixtureFileId,
      relatedIds: uniqueSorted([
        ...trace.relatedRequestIds,
        ...trace.sourceUris,
        ...trace.documentIds,
        ...trace.quarantineItemIds,
      ]),
      details: optionalFields({
        kind: trace.kind,
        method: trace.method,
        routePath: trace.routePath,
        command: trace.command,
        relatedRequestIds: trace.relatedRequestIds,
        sourceUris: trace.sourceUris,
        documentIds: trace.documentIds,
        quarantineItemIds: trace.quarantineItemIds,
      }),
    })),
  ];

  return records.sort(compareExportRecords);
}

function renderJsonl(records: readonly EvidenceExportRecord[]): string {
  return records.map((record) => serializeCompactJson(record)).join("\n");
}

function renderCsv(records: readonly EvidenceExportRecord[]): string {
  return [
    CSV_COLUMNS.join(","),
    ...records.map((record) => CSV_COLUMNS.map((column) => formatCsvCell(
      readCsvColumn(record, column),
    )).join(",")),
  ].join("\n");
}

function readCsvColumn(record: EvidenceExportRecord, column: string): string {
  switch (column) {
    case "category":
      return record.category;
    case "id":
      return record.id;
    case "sourceUri":
      return record.sourceUri ?? "";
    case "fixturePath":
      return record.fixturePath ?? "";
    case "checksum":
      return record.checksum ?? "";
    case "mediaType":
      return record.mediaType ?? "";
    case "schemaVersion":
      return record.schemaVersion ?? "";
    case "relatedIds":
      return record.relatedIds.join("|");
    case "details":
      return serializeCompactJson(record.details);
    default:
      throw new Error(`Unknown CSV column: ${column}`);
  }
}

async function resolveLocalPath(options: {
  readonly flagName: string;
  readonly value: string;
  readonly cwd: string;
}): Promise<ResolvedLocalPath> {
  const input = options.value.trim();
  if (input.length === 0) {
    throw usageError(`Option --${options.flagName} requires a non-empty path.`);
  }
  if (input.includes("\0")) {
    throw usageError(`Option --${options.flagName} must not contain null bytes.`);
  }
  if (/^[A-Za-z][A-Za-z\d+.-]*:\/\//.test(input)) {
    throw usageError(`Option --${options.flagName} must be a local file path, not a URL.`);
  }

  const cwdPath = path.resolve(options.cwd);
  const requestedPath = path.resolve(cwdPath, input);
  const workspaceRoot =
    findWorkspaceRoot(cwdPath) ?? findWorkspaceRoot(path.dirname(requestedPath));
  if (workspaceRoot === undefined) {
    throw usageError(
      `Could not locate the SovereignOps workspace root for --${options.flagName}.`,
    );
  }

  assertPathInsideWorkspace(workspaceRoot, requestedPath, options.flagName);
  assertNotPrivatePath(workspaceRoot, requestedPath, options.flagName);
  if (path.extname(requestedPath) !== ".json") {
    throw usageError(`Option --${options.flagName} must point to a .json file.`);
  }

  let fileStat: Awaited<ReturnType<typeof stat>>;
  try {
    fileStat = await stat(requestedPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new IngestEvidenceError({
        exitCode: 2,
        code: "input_not_found",
        message: "Evidence input file was not found.",
        details: {
          path: displayPath(workspaceRoot, requestedPath),
        },
      });
    }

    throw new IngestEvidenceError({
      exitCode: 1,
      code: "input_stat_error",
      message: "Could not inspect evidence input file.",
      details: {
        path: displayPath(workspaceRoot, requestedPath),
        cause: error instanceof Error ? error.message : String(error),
      },
    });
  }

  if (!fileStat.isFile()) {
    throw new IngestEvidenceError({
      exitCode: 2,
      code: "input_not_file",
      message: "Option --input must point to a file.",
      details: {
        path: displayPath(workspaceRoot, requestedPath),
      },
    });
  }

  const actualPath = await realpath(requestedPath);
  assertPathInsideWorkspace(workspaceRoot, actualPath, options.flagName);
  assertNotPrivatePath(workspaceRoot, actualPath, options.flagName);

  return {
    absolutePath: actualPath,
    displayPath: displayPath(workspaceRoot, actualPath),
    workspaceRoot,
  };
}

async function readEvidenceJson(input: ResolvedLocalPath): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(input.absolutePath, "utf8");
  } catch (error) {
    throw new IngestEvidenceError({
      exitCode: 1,
      code: "input_read_error",
      message: "Could not read evidence input file.",
      details: {
        path: input.displayPath,
        cause: error instanceof Error ? error.message : String(error),
      },
    });
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new IngestEvidenceError({
      exitCode: 2,
      code: "invalid_evidence_json",
      message: "Evidence input file must contain valid JSON.",
      details: {
        path: input.displayPath,
      },
    });
  }
}

function parseEvidenceBundle(value: unknown, workspaceRoot: string): IngestEvidenceBundle {
  const record = requiredRecord(value, "evidence");
  if (record.schemaVersion !== "ingest-search-audit-evidence.v1") {
    throw invalidEvidence(
      'evidence.schemaVersion must be "ingest-search-audit-evidence.v1".',
    );
  }

  const evidence: IngestEvidenceBundle = {
    schemaVersion: "ingest-search-audit-evidence.v1",
    generatedAt: isoTimestamp(record.generatedAt, "evidence.generatedAt"),
    workspaceId: nonEmptyString(record.workspaceId, "evidence.workspaceId"),
    sessionId: nonEmptyString(record.sessionId, "evidence.sessionId"),
    localOnly: booleanValue(record.localOnly, "evidence.localOnly"),
    evidenceSummary: parseEvidenceSummary(record.evidenceSummary),
    evidenceFiles: requiredArray(record.evidenceFiles, "evidence.evidenceFiles")
      .map((item, index) => parseEvidenceFile(item, index, workspaceRoot))
      .sort(compareEvidenceFiles),
    sourceSnapshots: requiredArray(record.sourceSnapshots, "evidence.sourceSnapshots")
      .map((item, index) => parseSourceSnapshot(item, index, workspaceRoot))
      .sort(compareSourceSnapshots),
    citationEvidence: requiredArray(record.citationEvidence, "evidence.citationEvidence")
      .map(parseCitationEvidence)
      .sort(compareCitationEvidence),
    quarantineDecisions: requiredArray(
      record.quarantineDecisions,
      "evidence.quarantineDecisions",
    )
      .map(parseQuarantineDecision)
      .sort(compareQuarantineDecisions),
    apiRequestTrace: requiredArray(record.apiRequestTrace, "evidence.apiRequestTrace")
      .map(parseApiRequestTrace)
      .sort(compareApiRequestTrace),
    clientSessionTrace: requiredArray(
      record.clientSessionTrace,
      "evidence.clientSessionTrace",
    )
      .map(parseClientSessionTrace)
      .sort(compareClientSessionTrace),
  };

  assertUnique(evidence.evidenceFiles.map((item) => item.id), "evidence.evidenceFiles[].id");
  assertUnique(
    evidence.evidenceFiles.map((item) => item.fixturePath),
    "evidence.evidenceFiles[].fixturePath",
  );
  assertUnique(
    evidence.sourceSnapshots.map((item) => item.sourceUri),
    "evidence.sourceSnapshots[].sourceUri",
  );
  assertUnique(
    evidence.citationEvidence.map((item) => item.id),
    "evidence.citationEvidence[].id",
  );
  assertUnique(
    evidence.quarantineDecisions.map((item) => item.decisionId),
    "evidence.quarantineDecisions[].decisionId",
  );
  assertUnique(
    evidence.apiRequestTrace.map((item) => item.requestId),
    "evidence.apiRequestTrace[].requestId",
  );
  assertUnique(
    evidence.clientSessionTrace.map((item) => item.traceId),
    "evidence.clientSessionTrace[].traceId",
  );
  assertSummaryCounts(evidence);
  assertEvidenceReferences(evidence);

  return evidence;
}

function parseEvidenceSummary(value: unknown): EvidenceSummaryCounts {
  const record = requiredRecord(value, "evidence.evidenceSummary");
  return {
    sourceCount: nonNegativeInteger(record.sourceCount, "evidence.evidenceSummary.sourceCount"),
    evidenceFileCount: nonNegativeInteger(
      record.evidenceFileCount,
      "evidence.evidenceSummary.evidenceFileCount",
    ),
    citationCount: nonNegativeInteger(
      record.citationCount,
      "evidence.evidenceSummary.citationCount",
    ),
    quarantineDecisionCount: nonNegativeInteger(
      record.quarantineDecisionCount,
      "evidence.evidenceSummary.quarantineDecisionCount",
    ),
    apiRequestTraceCount: nonNegativeInteger(
      record.apiRequestTraceCount,
      "evidence.evidenceSummary.apiRequestTraceCount",
    ),
    clientSessionTraceCount: nonNegativeInteger(
      record.clientSessionTraceCount,
      "evidence.evidenceSummary.clientSessionTraceCount",
    ),
  };
}

function parseEvidenceFile(
  value: unknown,
  index: number,
  workspaceRoot: string,
): EvidenceFile {
  const label = `evidence.evidenceFiles[${index}]`;
  const record = requiredRecord(value, label);
  return optionalFields({
    id: nonEmptyString(record.id, `${label}.id`),
    fixturePath: safeFixturePath(record.fixturePath, `${label}.fixturePath`, workspaceRoot),
    schemaVersion: optionalNonEmptyString(record.schemaVersion, `${label}.schemaVersion`),
    sha256: checksum(record.sha256, `${label}.sha256`),
  });
}

function parseSourceSnapshot(
  value: unknown,
  index: number,
  workspaceRoot: string,
): SourceSnapshot {
  const label = `evidence.sourceSnapshots[${index}]`;
  const record = requiredRecord(value, label);
  return {
    sourceUri: sourceUri(record.sourceUri, `${label}.sourceUri`),
    path: safeFixturePath(record.path, `${label}.path`, workspaceRoot),
    mediaType: nonEmptyString(record.mediaType, `${label}.mediaType`),
    checksum: checksum(record.checksum, `${label}.checksum`),
    repositoryState: nonEmptyString(record.repositoryState, `${label}.repositoryState`),
    logEntryIds: stringArray(record.logEntryIds, `${label}.logEntryIds`),
    indexDocumentIds: stringArray(record.indexDocumentIds, `${label}.indexDocumentIds`),
    quarantineItemIds: stringArray(record.quarantineItemIds, `${label}.quarantineItemIds`),
  };
}

function parseCitationEvidence(value: unknown, index: number): CitationEvidence {
  const label = `evidence.citationEvidence[${index}]`;
  const record = requiredRecord(value, label);
  const kind = nonEmptyString(record.kind, `${label}.kind`);
  if (kind !== "indexDocument" && kind !== "quarantineItem") {
    throw invalidEvidence(`${label}.kind must be indexDocument or quarantineItem.`);
  }
  const documentId = optionalNonEmptyString(record.documentId, `${label}.documentId`);
  const quarantineItemId = optionalNonEmptyString(
    record.quarantineItemId,
    `${label}.quarantineItemId`,
  );
  if (kind === "indexDocument" && documentId === undefined) {
    throw invalidEvidence(`${label}.documentId is required for indexDocument citations.`);
  }
  if (kind === "quarantineItem" && quarantineItemId === undefined) {
    throw invalidEvidence(
      `${label}.quarantineItemId is required for quarantineItem citations.`,
    );
  }

  return optionalFields({
    id: nonEmptyString(record.id, `${label}.id`),
    kind,
    documentId,
    quarantineItemId,
    sourceUri: sourceUri(record.sourceUri, `${label}.sourceUri`),
    checksum: checksum(record.checksum, `${label}.checksum`),
    range: requiredRecord(record.range, `${label}.range`),
    trusted: booleanValue(record.trusted, `${label}.trusted`),
  });
}

function parseQuarantineDecision(value: unknown, index: number): QuarantineDecision {
  const label = `evidence.quarantineDecisions[${index}]`;
  const record = requiredRecord(value, label);
  return {
    decisionId: nonEmptyString(record.decisionId, `${label}.decisionId`),
    requestId: nonEmptyString(record.requestId, `${label}.requestId`),
    itemId: nonEmptyString(record.itemId, `${label}.itemId`),
    sourceUri: sourceUri(record.sourceUri, `${label}.sourceUri`),
    checksum: checksum(record.checksum, `${label}.checksum`),
    fromState: nonEmptyString(record.fromState, `${label}.fromState`),
    toState: nonEmptyString(record.toState, `${label}.toState`),
    actorId: nonEmptyString(record.actorId, `${label}.actorId`),
    action: nonEmptyString(record.action, `${label}.action`),
    reason: nonEmptyString(record.reason, `${label}.reason`),
    decidedAt: isoTimestamp(record.decidedAt, `${label}.decidedAt`),
    override: booleanValue(record.override, `${label}.override`),
  };
}

function parseApiRequestTrace(value: unknown, index: number): ApiRequestTrace {
  const label = `evidence.apiRequestTrace[${index}]`;
  const record = requiredRecord(value, label);
  return {
    requestId: nonEmptyString(record.requestId, `${label}.requestId`),
    fixtureFileId: nonEmptyString(record.fixtureFileId, `${label}.fixtureFileId`),
    method: methodToken(record.method, `${label}.method`),
    path: routePath(record.path, `${label}.path`),
    responseStatus: httpStatus(record.responseStatus, `${label}.responseStatus`),
    sourceUris: sourceUriArray(record.sourceUris, `${label}.sourceUris`),
    checksums: checksumArray(record.checksums, `${label}.checksums`),
    documentIds: optionalStringArray(record.documentIds, `${label}.documentIds`),
    quarantineItemIds: optionalStringArray(
      record.quarantineItemIds,
      `${label}.quarantineItemIds`,
    ),
  };
}

function parseClientSessionTrace(value: unknown, index: number): ClientSessionTrace {
  const label = `evidence.clientSessionTrace[${index}]`;
  const record = requiredRecord(value, label);
  const method = optionalMethodToken(record.method, `${label}.method`);
  const route = optionalRoutePath(record.routePath, `${label}.routePath`);
  const command = optionalNonEmptyString(record.command, `${label}.command`);

  return optionalFields({
    traceId: nonEmptyString(record.traceId, `${label}.traceId`),
    fixtureFileId: nonEmptyString(record.fixtureFileId, `${label}.fixtureFileId`),
    kind: nonEmptyString(record.kind, `${label}.kind`),
    method,
    routePath: route,
    command,
    relatedRequestIds: optionalStringArray(record.relatedRequestIds, `${label}.relatedRequestIds`),
    sourceUris: sourceUriArray(record.sourceUris, `${label}.sourceUris`),
    documentIds: optionalStringArray(record.documentIds, `${label}.documentIds`),
    quarantineItemIds: optionalStringArray(
      record.quarantineItemIds,
      `${label}.quarantineItemIds`,
    ),
  });
}

function assertSummaryCounts(evidence: IngestEvidenceBundle): void {
  const expected: EvidenceSummaryCounts = {
    sourceCount: evidence.sourceSnapshots.length,
    evidenceFileCount: evidence.evidenceFiles.length,
    citationCount: evidence.citationEvidence.length,
    quarantineDecisionCount: evidence.quarantineDecisions.length,
    apiRequestTraceCount: evidence.apiRequestTrace.length,
    clientSessionTraceCount: evidence.clientSessionTrace.length,
  };

  for (const [key, value] of Object.entries(expected)) {
    if (evidence.evidenceSummary[key as keyof EvidenceSummaryCounts] !== value) {
      throw invalidEvidence(`evidence.evidenceSummary.${key} must match ${value}.`);
    }
  }
}

function assertEvidenceReferences(evidence: IngestEvidenceBundle): void {
  const fileIds = new Set(evidence.evidenceFiles.map((item) => item.id));
  const sourceByUri = new Map(evidence.sourceSnapshots.map((item) => [item.sourceUri, item]));
  const apiRequestIds = new Set(evidence.apiRequestTrace.map((item) => item.requestId));

  for (const citation of evidence.citationEvidence) {
    assertSourceChecksum(sourceByUri, citation.sourceUri, citation.checksum, citation.id);
  }
  for (const decision of evidence.quarantineDecisions) {
    assertSourceChecksum(sourceByUri, decision.sourceUri, decision.checksum, decision.decisionId);
    if (!apiRequestIds.has(decision.requestId)) {
      throw invalidEvidence(`Unknown API request reference: ${decision.requestId}`);
    }
  }
  for (const trace of evidence.apiRequestTrace) {
    if (!fileIds.has(trace.fixtureFileId)) {
      throw invalidEvidence(`Unknown evidence file reference: ${trace.fixtureFileId}`);
    }
    for (const uri of trace.sourceUris) {
      if (!sourceByUri.has(uri)) {
        throw invalidEvidence(`Unknown source URI reference: ${uri}`);
      }
    }
  }
  for (const trace of evidence.clientSessionTrace) {
    if (!fileIds.has(trace.fixtureFileId)) {
      throw invalidEvidence(`Unknown evidence file reference: ${trace.fixtureFileId}`);
    }
    for (const requestId of trace.relatedRequestIds) {
      if (!apiRequestIds.has(requestId)) {
        throw invalidEvidence(`Unknown API request reference: ${requestId}`);
      }
    }
    for (const uri of trace.sourceUris) {
      if (!sourceByUri.has(uri)) {
        throw invalidEvidence(`Unknown source URI reference: ${uri}`);
      }
    }
  }
}

function assertSourceChecksum(
  sourceByUri: ReadonlyMap<string, SourceSnapshot>,
  uri: string,
  expectedChecksum: string,
  evidenceId: string,
): void {
  const source = sourceByUri.get(uri);
  if (source === undefined) {
    throw invalidEvidence(`Unknown source URI reference: ${uri}`);
  }
  if (source.checksum !== expectedChecksum) {
    throw invalidEvidence(`Checksum mismatch for ${evidenceId}.`);
  }
}

function requireInputPath(parsed: ParsedArgv): string {
  const input = optionalStringFlag(parsed, "input");
  const inputPath = optionalStringFlag(parsed, "input-path");
  if (input !== undefined && inputPath !== undefined) {
    throw usageError("Use either --input or --input-path, not both.");
  }
  if (input === undefined && inputPath === undefined) {
    throw usageError("Missing required option --input.");
  }
  return input ?? inputPath ?? "";
}

function requireExportFormat(parsed: ParsedArgv): "jsonl" | "csv" {
  const format = optionalStringFlag(parsed, "format");
  if (format === undefined || format.trim().length === 0) {
    throw usageError("Missing required option --format.");
  }
  if (!EXPORT_FORMATS.has(format)) {
    throw usageError("Option --format must be one of jsonl, csv.", { format });
  }
  return format as "jsonl" | "csv";
}

function parseArgv(argv: readonly string[]): ParsedArgv {
  const positionals: string[] = [];
  const flags: Record<string, ParsedFlagValue> = {};
  const errors: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }

    if (token.startsWith("--")) {
      const [name, inlineValue] = splitLongFlag(token);
      if (name.length === 0) {
        errors.push("Long flag names cannot be empty.");
        continue;
      }
      if (inlineValue !== undefined) {
        setFlag(flags, name, inlineValue, errors);
        continue;
      }
      if (BOOLEAN_FLAGS.has(name)) {
        setFlag(flags, name, true, errors);
        continue;
      }

      const next = argv[index + 1];
      if (next === undefined || next.startsWith("-")) {
        errors.push(`Flag --${name} requires a value.`);
        continue;
      }
      setFlag(flags, name, next, errors);
      index += 1;
      continue;
    }

    if (token.startsWith("-") && token.length > 1) {
      if (token === "-h") {
        setFlag(flags, "help", true, errors);
      } else {
        errors.push(`Unsupported short flag: ${token}`);
      }
      continue;
    }

    positionals.push(token);
  }

  return { positionals, flags, errors };
}

function splitLongFlag(token: string): [string, string | undefined] {
  const equalsIndex = token.indexOf("=");
  if (equalsIndex === -1) {
    return [token.slice(2), undefined];
  }

  return [token.slice(2, equalsIndex), token.slice(equalsIndex + 1)];
}

function setFlag(
  flags: Record<string, ParsedFlagValue>,
  name: string,
  value: ParsedFlagValue,
  errors: string[],
): void {
  if (Object.hasOwn(flags, name)) {
    errors.push(`Flag --${name} was provided more than once.`);
    return;
  }

  flags[name] = value;
}

function isIngestEvidenceParsedCommand(parsed: ParsedArgv): boolean {
  return ingestEvidenceCommandLength(parsed.positionals) > 0;
}

function ingestEvidenceCommandLength(positionals: readonly string[]): number {
  if (positionals[0] === "ingest" && positionals[1] === "evidence") {
    return 2;
  }
  if (positionals[0] === "ingest-evidence") {
    return 1;
  }
  return 0;
}

function ingestEvidenceAction(positionals: readonly string[]): readonly string[] {
  return positionals.slice(ingestEvidenceCommandLength(positionals));
}

function hasHelp(parsed: ParsedArgv): boolean {
  return parsed.flags.help === true || parsed.flags.h === true;
}

function optionalStringFlag(parsed: ParsedArgv, name: string): string | undefined {
  const value = parsed.flags[name];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw usageError(`Option --${name} requires a value.`);
  }
  return value;
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw invalidEvidence(`${label} must be an object.`);
  }
  return value;
}

function requiredArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw invalidEvidence(`${label} must be an array.`);
  }
  return value;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value !== value.trim()) {
    throw invalidEvidence(`${label} must be a non-empty string without surrounding whitespace.`);
  }
  return value;
}

function optionalNonEmptyString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return nonEmptyString(value, label);
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw invalidEvidence(`${label} must be a boolean.`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw invalidEvidence(`${label} must be a non-negative integer.`);
  }
  return value;
}

function checksum(value: unknown, label: string): string {
  const text = nonEmptyString(value, label);
  if (!CHECKSUM_PATTERN.test(text)) {
    throw invalidEvidence(`${label} must be a lowercase SHA-256 hex digest.`);
  }
  return text;
}

function checksumArray(value: unknown, label: string): readonly string[] {
  if (value === undefined) {
    return [];
  }
  return requiredArray(value, label)
    .map((item, index) => checksum(item, `${label}[${index}]`))
    .sort(compareStrings);
}

function stringArray(value: unknown, label: string): readonly string[] {
  return requiredArray(value, label)
    .map((item, index) => nonEmptyString(item, `${label}[${index}]`))
    .sort(compareStrings);
}

function optionalStringArray(value: unknown, label: string): readonly string[] {
  if (value === undefined) {
    return [];
  }
  return stringArray(value, label);
}

function sourceUriArray(value: unknown, label: string): readonly string[] {
  if (value === undefined) {
    return [];
  }
  return requiredArray(value, label)
    .map((item, index) => sourceUri(item, `${label}[${index}]`))
    .sort(compareStrings);
}

function sourceUri(value: unknown, label: string): string {
  const text = nonEmptyString(value, label);
  if (/^https?:\/\//i.test(text)) {
    throw invalidEvidence(`${label} must not reference a network URL.`);
  }
  return text;
}

function methodToken(value: unknown, label: string): string {
  const method = nonEmptyString(value, label).toUpperCase();
  if (!/^[A-Z]+$/.test(method)) {
    throw invalidEvidence(`${label} must be an HTTP method token.`);
  }
  return method;
}

function optionalMethodToken(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return methodToken(value, label);
}

function routePath(value: unknown, label: string): string {
  const text = nonEmptyString(value, label);
  if (!text.startsWith("/")) {
    throw invalidEvidence(`${label} must start with /.`);
  }
  return text;
}

function optionalRoutePath(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return routePath(value, label);
}

function httpStatus(value: unknown, label: string): number {
  if (!Number.isInteger(value) || value < 100 || value > 599) {
    throw invalidEvidence(`${label} must be an HTTP status code.`);
  }
  return value;
}

function isoTimestamp(value: unknown, label: string): string {
  const timestamp = nonEmptyString(value, label);
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== timestamp) {
    throw invalidEvidence(`${label} must be an ISO timestamp.`);
  }
  return timestamp;
}

function safeFixturePath(value: unknown, label: string, workspaceRoot: string): string {
  const fixturePath = nonEmptyString(value, label);
  if (fixturePath.includes("\0")) {
    throw invalidEvidence(`${label} must not contain null bytes.`);
  }
  if (/^[A-Za-z][A-Za-z\d+.-]*:\/\//.test(fixturePath)) {
    throw invalidEvidence(`${label} must be a local path, not a URL.`);
  }
  if (/^[A-Za-z]:[\\/]/.test(fixturePath) || fixturePath.startsWith("/") || fixturePath.startsWith("\\")) {
    throw invalidEvidence(`${label} must be a relative local path.`);
  }

  const normalizedSegments = fixturePath.split(/[\\/]+/).filter((segment) => segment.length > 0);
  if (normalizedSegments.some((segment) => segment === "..")) {
    throw invalidEvidence(`${label} must not contain parent directory segments.`);
  }

  const candidatePath = path.resolve(workspaceRoot, ...normalizedSegments);
  assertFixturePathInsideWorkspace(workspaceRoot, candidatePath, label);
  assertNotPrivateFixturePath(workspaceRoot, candidatePath, label);
  return normalizedSegments.join("/");
}

function findWorkspaceRoot(start: string): string | undefined {
  let current = path.resolve(start);

  while (true) {
    const packageJsonPath = path.join(current, "package.json");
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
          readonly name?: unknown;
          readonly workspaces?: unknown;
        };
        if (
          packageJson.name === "@sovereignops/root" &&
          Array.isArray(packageJson.workspaces)
        ) {
          return current;
        }
      } catch {
        return undefined;
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

function assertPathInsideWorkspace(
  workspaceRoot: string,
  candidatePath: string,
  flagName: string,
): void {
  const relativePath = path.relative(workspaceRoot, candidatePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw usageError(`Option --${flagName} must stay inside the SovereignOps workspace.`);
  }
}

function assertNotPrivatePath(
  workspaceRoot: string,
  candidatePath: string,
  flagName: string,
): void {
  const segments = path.relative(workspaceRoot, candidatePath).split(path.sep);
  if (segments.includes(".codex-private")) {
    throw usageError(`Option --${flagName} must not reference private workspace files.`);
  }
}

function assertFixturePathInsideWorkspace(
  workspaceRoot: string,
  candidatePath: string,
  label: string,
): void {
  const relativePath = path.relative(workspaceRoot, candidatePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw invalidEvidence(`${label} must stay inside the SovereignOps workspace.`);
  }
}

function assertNotPrivateFixturePath(
  workspaceRoot: string,
  candidatePath: string,
  label: string,
): void {
  const segments = path.relative(workspaceRoot, candidatePath).split(path.sep);
  if (segments.includes(".codex-private")) {
    throw invalidEvidence(`${label} must not reference private workspace files.`);
  }
}

function displayPath(workspaceRoot: string, candidatePath: string): string {
  return path.relative(workspaceRoot, candidatePath).split(path.sep).join("/");
}

function assertUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw invalidEvidence(`${label} must be unique: ${value}`);
    }
    seen.add(value);
  }
}

function countBy<TValue>(
  values: readonly TValue[],
  selector: (value: TValue) => string | undefined,
): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = selector(value);
    if (key === undefined || key.length === 0) {
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) =>
    compareStrings(left, right),
  ));
}

function formatCsvCell(value: string): string {
  if (!/[",\r\n]/.test(value)) {
    return value;
  }
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function jsonSuccess(value: unknown): IngestEvidenceCliResult {
  return {
    exitCode: 0,
    stdout: `${serializePrettyJson(value)}\n`,
    stderr: "",
  };
}

function jsonFailure(
  exitCode: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): IngestEvidenceCliResult {
  return {
    exitCode,
    stdout: "",
    stderr: `${serializePrettyJson({
      error: optionalFields({
        code,
        message,
        details: details && Object.keys(details).length > 0 ? details : undefined,
      }),
    })}\n`,
  };
}

function unknownIngestEvidenceCommand(parsed: ParsedArgv): IngestEvidenceCliResult {
  return jsonFailure(
    1,
    "unknown_command",
    `Unknown ingest evidence command: ${parsed.positionals.join(" ")}`,
  );
}

function usageError(message: string, details?: Record<string, unknown>): IngestEvidenceError {
  return new IngestEvidenceError({
    exitCode: 2,
    code: "usage_error",
    message,
    details,
  });
}

function invalidEvidence(message: string, details?: Record<string, unknown>): IngestEvidenceError {
  return new IngestEvidenceError({
    exitCode: 2,
    code: "invalid_evidence",
    message,
    details,
  });
}

function optionalFields<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T;
}

function serializePrettyJson(value: unknown): string {
  return JSON.stringify(sortJson(value), null, 2);
}

function serializeCompactJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => compareStrings(left, right))
        .map(([key, nested]) => [key, sortJson(nested)]),
    );
  }
  return value;
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort(compareStrings);
}

function compareEvidenceFiles(left: EvidenceFile, right: EvidenceFile): number {
  return compareStrings(left.id, right.id) || compareStrings(left.fixturePath, right.fixturePath);
}

function compareSourceSnapshots(left: SourceSnapshot, right: SourceSnapshot): number {
  return compareStrings(left.sourceUri, right.sourceUri) || compareStrings(left.path, right.path);
}

function compareCitationEvidence(left: CitationEvidence, right: CitationEvidence): number {
  return compareStrings(left.id, right.id);
}

function compareQuarantineDecisions(
  left: QuarantineDecision,
  right: QuarantineDecision,
): number {
  return compareStrings(left.decisionId, right.decisionId);
}

function compareApiRequestTrace(left: ApiRequestTrace, right: ApiRequestTrace): number {
  return compareStrings(left.requestId, right.requestId);
}

function compareClientSessionTrace(
  left: ClientSessionTrace,
  right: ClientSessionTrace,
): number {
  return compareStrings(left.traceId, right.traceId);
}

function compareExportRecords(left: EvidenceExportRecord, right: EvidenceExportRecord): number {
  return compareStrings(left.category, right.category) || compareStrings(left.id, right.id);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class IngestEvidenceError extends Error {
  readonly exitCode: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(options: {
    readonly exitCode: number;
    readonly code: string;
    readonly message: string;
    readonly details?: Record<string, unknown>;
  }) {
    super(options.message);
    this.name = "IngestEvidenceError";
    this.exitCode = options.exitCode;
    this.code = options.code;
    this.details = options.details;
  }
}
