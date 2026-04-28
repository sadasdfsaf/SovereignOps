import {
  validatePluginReviewArtifactApiRequestBundle,
} from "../../../packages/schemas/src/pluginReviewArtifact.ts";
import type {
  IngestSearchEmptyState,
  IngestSearchErrorState,
} from "./ingestSearch.ts";
import {
  buildPluginReviewArtifactState,
  type PluginReviewActionButton,
  type PluginReviewActionIntent,
  type PluginReviewArtifactContext,
  type PluginReviewArtifactStatus,
  type PluginReviewArtifactViewModel,
  type PluginReviewSummaryCard,
} from "./pluginReviewArtifactState.ts";

export type PluginReviewArtifactApiContext =
  | "requests"
  | "response"
  | "artifact"
  | "redactions"
  | "sources"
  | "actions";

export interface BuildPluginReviewArtifactApiStateOptions {
  defaultTimestamp?: string;
  error?: unknown;
  apiBase?: string;
}

export interface PluginReviewArtifactApiState {
  id: "plugin_review_artifact_api";
  generatedAt: string;
  status: PluginReviewArtifactStatus;
  statusLabel: string;
  requestCards: PluginReviewArtifactApiRequestCard[];
  responseStatus: PluginReviewArtifactApiResponseStatus;
  artifact: PluginReviewArtifactViewModel;
  artifactSummaryCards: PluginReviewSummaryCard[];
  redactionSummary: PluginReviewArtifactApiRedactionSummary;
  redactionCounts: PluginReviewArtifactApiRedactionCount[];
  sourceFileRows: PluginReviewArtifactApiSourceFileRow[];
  actionButtons: PluginReviewArtifactApiActionButton[];
  emptyStates: PluginReviewArtifactApiEmptyStates;
  errorStates: PluginReviewArtifactApiErrorState[];
}

export interface PluginReviewArtifactApiRequestCard {
  id: string;
  requestId: string;
  title: string;
  method: string;
  routePath: string;
  url?: string;
  status: PluginReviewArtifactStatus;
  statusLabel: string;
  statusCode?: number;
  valueLabel: string;
  detailLabels: string[];
  actionId: string;
  ariaLabel: string;
}

export interface PluginReviewArtifactApiResponseStatus {
  id: "plugin_review_artifact_api_response_status";
  label: string;
  status: PluginReviewArtifactStatus;
  statusLabel: string;
  statusCode?: number;
  routePath?: string;
  method?: string;
  successCount: number;
  errorCount: number;
  totalCount: number;
  detailLabels: string[];
  emptyState: IngestSearchEmptyState;
  errorState?: IngestSearchErrorState;
  ariaLabel: string;
}

export interface PluginReviewArtifactApiRedactionSummary {
  id: "plugin_review_artifact_api_redaction_summary";
  label: string;
  status: PluginReviewArtifactStatus;
  statusLabel: string;
  totalCount: number;
  replacementCount: number;
  detailLabels: string[];
  emptyState: IngestSearchEmptyState;
  ariaLabel: string;
}

export interface PluginReviewArtifactApiRedactionCount {
  id: string;
  key: string;
  label: string;
  count: number;
  replacementCount: number;
  status: PluginReviewArtifactStatus;
  statusLabel: string;
  paths: string[];
  detailLabels: string[];
  ariaLabel: string;
}

export interface PluginReviewArtifactApiSourceFileRow {
  id: string;
  sourceId: string;
  sourceKind: string;
  label: string;
  status: PluginReviewArtifactStatus;
  statusLabel: string;
  path?: string;
  uri?: string;
  fingerprint?: string;
  byteCount?: number;
  itemCount?: number;
  detailLabels: string[];
  ariaLabel: string;
}

export interface PluginReviewArtifactApiActionButton {
  id: string;
  label: string;
  intent: PluginReviewActionIntent;
  enabled: boolean;
  section?: PluginReviewArtifactApiContext | PluginReviewArtifactContext;
  targetId?: string;
  disabledReason?: string;
  ariaLabel: string;
}

export interface PluginReviewArtifactApiEmptyStates {
  requests: IngestSearchEmptyState;
  response: IngestSearchEmptyState;
  artifact: IngestSearchEmptyState;
  redactions: IngestSearchEmptyState;
  sources: IngestSearchEmptyState;
  actions: IngestSearchEmptyState;
}

export interface PluginReviewArtifactApiErrorState {
  id: string;
  context: PluginReviewArtifactApiContext;
  routeId?: string;
  routePath?: string;
  status?: number;
  errorState: IngestSearchErrorState;
}

type AnyRecord = Record<string, unknown>;
type SchemaValidationIssue = { path: string; message: string };

interface ApiRecord {
  id: string;
  index: number;
  title?: string;
  method: string;
  routePath: string;
  url?: string;
  status?: number;
  requestBody?: AnyRecord;
  responseBody?: AnyRecord;
  generatedAt: string;
  error?: unknown;
}

interface NormalizedBridge {
  generatedAt: string;
  records: ApiRecord[];
  preview?: AnyRecord;
  artifactInput: AnyRecord;
  errorStates: PluginReviewArtifactApiErrorState[];
}

interface RedactionDraft {
  key: string;
  label?: string;
  count: number;
  replacementCount: number;
  paths: Set<string>;
}

interface SourceFileInput {
  sourceKind: string;
  value: unknown;
  index: number;
}

const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const DEFAULT_PREVIEW_ROUTE = "/v1/plugins/review-artifacts/preview";
const PUBLIC_API_REQUEST_BUNDLE_SCHEMA_VERSION =
  "plugin-review-artifact-api-requests.v1";

export function buildPluginReviewArtifactApiState(
  input: unknown,
  options: BuildPluginReviewArtifactApiStateOptions = {},
): PluginReviewArtifactApiState {
  const bridge = normalizeBridge(input, options);
  const artifact = buildPluginReviewArtifactState(bridge.artifactInput, {
    defaultTimestamp: bridge.generatedAt,
    error: options.error,
  });
  const requestCards = buildRequestCardsFromRecords(bridge.records);
  const responseStatus = buildResponseStatusFromRecords(
    bridge.records,
    bridge.errorStates,
  );
  const redactionCounts = buildRedactionCountsFromPreview(bridge.preview);
  const redactionSummary = buildRedactionSummary(redactionCounts);
  const sourceFileRows = buildSourceFileRowsFromPreview(bridge.preview);
  const actionButtons = buildApiActionButtons(
    artifact.actionButtons,
    requestCards,
    redactionCounts,
    sourceFileRows,
    artifact,
  );
  const status = resolveApiStatus({
    responseStatus: responseStatus.status,
    artifactStatus: artifact.status,
    redactionStatus: redactionSummary.status,
    sourceStatus: sourceRowsStatus(sourceFileRows),
    errorStates: bridge.errorStates,
  });

  return cloneApiState({
    id: "plugin_review_artifact_api",
    generatedAt: bridge.generatedAt,
    status,
    statusLabel: statusLabel(status),
    requestCards,
    responseStatus,
    artifact,
    artifactSummaryCards: artifact.summaryCards.map(cloneSummaryCard),
    redactionSummary,
    redactionCounts,
    sourceFileRows,
    actionButtons,
    emptyStates: buildPluginReviewArtifactApiEmptyStates(),
    errorStates: bridge.errorStates.map(cloneApiErrorState),
  });
}

export function buildPluginReviewArtifactApiRequestCards(
  input: unknown,
  options: BuildPluginReviewArtifactApiStateOptions = {},
): PluginReviewArtifactApiRequestCard[] {
  return buildRequestCardsFromRecords(
    normalizeBridge(input, options).records,
  ).map(cloneRequestCard);
}

export function buildPluginReviewArtifactApiResponseStatus(
  input: unknown,
  options: BuildPluginReviewArtifactApiStateOptions = {},
): PluginReviewArtifactApiResponseStatus {
  const bridge = normalizeBridge(input, options);
  return cloneResponseStatus(
    buildResponseStatusFromRecords(bridge.records, bridge.errorStates),
  );
}

export function buildPluginReviewArtifactApiRedactionCounts(
  input: unknown,
  options: BuildPluginReviewArtifactApiStateOptions = {},
): PluginReviewArtifactApiRedactionCount[] {
  return buildRedactionCountsFromPreview(
    normalizeBridge(input, options).preview,
  ).map(cloneRedactionCount);
}

export function buildPluginReviewArtifactApiRedactionSummary(
  input: unknown,
  options: BuildPluginReviewArtifactApiStateOptions = {},
): PluginReviewArtifactApiRedactionSummary {
  return cloneRedactionSummary(
    buildRedactionSummary(
      buildRedactionCountsFromPreview(normalizeBridge(input, options).preview),
    ),
  );
}

export function buildPluginReviewArtifactApiSourceFileRows(
  input: unknown,
  options: BuildPluginReviewArtifactApiStateOptions = {},
): PluginReviewArtifactApiSourceFileRow[] {
  return buildSourceFileRowsFromPreview(
    normalizeBridge(input, options).preview,
  ).map(cloneSourceFileRow);
}

export function buildPluginReviewArtifactApiActionButtons(
  input: unknown,
  options: BuildPluginReviewArtifactApiStateOptions = {},
): PluginReviewArtifactApiActionButton[] {
  const bridge = normalizeBridge(input, options);
  const artifact = buildPluginReviewArtifactState(bridge.artifactInput, {
    defaultTimestamp: bridge.generatedAt,
    error: options.error,
  });

  return buildApiActionButtons(
    artifact.actionButtons,
    buildRequestCardsFromRecords(bridge.records),
    buildRedactionCountsFromPreview(bridge.preview),
    buildSourceFileRowsFromPreview(bridge.preview),
    artifact,
  ).map(cloneActionButton);
}

export function buildPluginReviewArtifactApiEmptyStates(): PluginReviewArtifactApiEmptyStates {
  return {
    requests: buildPluginReviewArtifactApiEmptyState("requests"),
    response: buildPluginReviewArtifactApiEmptyState("response"),
    artifact: buildPluginReviewArtifactApiEmptyState("artifact"),
    redactions: buildPluginReviewArtifactApiEmptyState("redactions"),
    sources: buildPluginReviewArtifactApiEmptyState("sources"),
    actions: buildPluginReviewArtifactApiEmptyState("actions"),
  };
}

export function buildPluginReviewArtifactApiEmptyState(
  context: PluginReviewArtifactApiContext,
): IngestSearchEmptyState {
  switch (context) {
    case "requests":
      return {
        id: "plugin_review_artifact_api_requests_empty",
        label: "No API requests",
        description: "Captured preview requests will appear when a replay is loaded.",
        ariaLabel: "No plugin review artifact API requests are available",
      };
    case "response":
      return {
        id: "plugin_review_artifact_api_response_empty",
        label: "No preview response",
        description: "Load a plugin review artifact preview response to show status.",
        ariaLabel: "No plugin review artifact preview response is available",
      };
    case "artifact":
      return {
        id: "plugin_review_artifact_api_artifact_empty",
        label: "No artifact preview",
        description: "Preview artifact details will appear after a response is loaded.",
        ariaLabel: "No plugin review artifact preview is available",
      };
    case "redactions":
      return {
        id: "plugin_review_artifact_api_redactions_empty",
        label: "No redactions",
        description: "Redaction counts will appear when preview data includes them.",
        ariaLabel: "No plugin review artifact redactions are available",
      };
    case "sources":
      return {
        id: "plugin_review_artifact_api_sources_empty",
        label: "No source files",
        description: "Source files will appear when preview data includes local references.",
        ariaLabel: "No plugin review artifact source files are available",
      };
    case "actions":
      return {
        id: "plugin_review_artifact_api_actions_empty",
        label: "No API actions",
        description: "Preview actions will appear after a response is loaded.",
        ariaLabel: "No plugin review artifact API actions are available",
      };
  }
}

export function buildPluginReviewArtifactApiErrorStates(
  input: unknown,
  options: BuildPluginReviewArtifactApiStateOptions = {},
): PluginReviewArtifactApiErrorState[] {
  return normalizeBridge(input, options).errorStates.map(cloneApiErrorState);
}

export function buildPluginReviewArtifactApiErrorState(
  context: PluginReviewArtifactApiContext,
  error: unknown,
  metadata: {
    routeId?: string;
    routePath?: string;
    status?: number;
  } = {},
): PluginReviewArtifactApiErrorState {
  const description = errorMessage(error) ?? defaultErrorDescription(context);
  const id = `plugin_review_artifact_api_${context}_error`;

  return {
    id,
    context,
    routeId: metadata.routeId,
    routePath: metadata.routePath,
    status: metadata.status,
    errorState: {
      id,
      label: errorLabel(context),
      description,
      ariaLabel: errorLabel(context),
      retryLabel: retryLabel(context),
    },
  };
}

function normalizeBridge(
  input: unknown,
  options: BuildPluginReviewArtifactApiStateOptions,
): NormalizedBridge {
  const root = clonePlain(input);
  const rootRecord = isRecord(root) ? root : undefined;
  const generatedAt = normalizeTimestamp(
    timestampField(rootRecord, "generatedAt", "generated_at", "createdAt", "created_at"),
    options.defaultTimestamp,
  );
  const records = normalizeApiRecords(root, generatedAt, options.apiBase);
  const preview = selectPreview(records, rootRecord);
  const errorStates = [
    ...collectPublicFixtureSchemaErrorStates(rootRecord),
    ...collectErrorStates(records),
  ];

  if (options.error !== undefined) {
    errorStates.push(buildPluginReviewArtifactApiErrorState("response", options.error));
  }

  const artifactInput =
    preview === undefined
      ? buildEmptyArtifact(rootRecord, generatedAt)
      : buildArtifactInput(preview, generatedAt);

  return {
    generatedAt,
    records,
    preview,
    artifactInput,
    errorStates: dedupeErrorStates(errorStates),
  };
}

function normalizeApiRecords(
  root: unknown,
  fallbackTimestamp: string,
  apiBase: string | undefined,
): ApiRecord[] {
  if (isRecord(root) && Array.isArray(root.requests)) {
    return root.requests.map((entry, index) =>
      normalizeReplayRecord(entry, index, fallbackTimestamp, apiBase),
    );
  }

  if (
    isRecord(root) &&
    (isRecord(root.response) || isRecord(root.request) || isRecord(root.route))
  ) {
    return [normalizeReplayRecord(root, 0, fallbackTimestamp, apiBase)];
  }

  if (isRecord(root) && isRecord(root.body)) {
    return [
      {
        id: stringField(root, "id") ?? "plugin_review_artifact_response",
        index: 0,
        title: stringField(root, "title"),
        method: stringField(root, "method")?.toUpperCase() ?? "POST",
        routePath:
          stringField(root, "routePath", "route_path", "path") ??
          DEFAULT_PREVIEW_ROUTE,
        url: absoluteRouteUrl(
          stringField(root, "routePath", "route_path", "path") ??
            DEFAULT_PREVIEW_ROUTE,
          apiBase,
        ),
        status: integerField(root, "status"),
        responseBody: root.body,
        generatedAt: fallbackTimestamp,
        error: apiErrorMessage(root),
      },
    ];
  }

  if (isRecord(root)) {
    return [
      {
        id: "plugin_review_artifact_response",
        index: 0,
        title: "Plugin review artifact preview",
        method: "POST",
        routePath: DEFAULT_PREVIEW_ROUTE,
        url: absoluteRouteUrl(DEFAULT_PREVIEW_ROUTE, apiBase),
        status: undefined,
        responseBody: root,
        generatedAt: fallbackTimestamp,
        error: apiErrorMessage(root),
      },
    ];
  }

  return [];
}

function normalizeReplayRecord(
  entry: unknown,
  index: number,
  fallbackTimestamp: string,
  apiBase: string | undefined,
): ApiRecord {
  const record = isRecord(entry) ? entry : {};
  const route = recordField(record, "route");
  const request = recordField(record, "request");
  const actual = recordField(record, "actual");
  const response = recordField(record, "response") ?? actual;
  const expected = recordField(record, "expect", "expected");
  const responseBody =
    recordField(response, "body") ??
    recordField(record, "body") ??
    recordField(expected, "body");
  const routePath =
    stringField(route, "path") ??
    stringField(record, "routePath", "route_path", "path") ??
    DEFAULT_PREVIEW_ROUTE;

  return {
    id: stringField(record, "id", "requestId", "request_id") ??
      `plugin_review_artifact_request_${index + 1}`,
    index,
    title: stringField(record, "title", "label"),
    method:
      stringField(route, "method")?.toUpperCase() ??
      stringField(record, "method")?.toUpperCase() ??
      "POST",
    routePath,
    url: stringField(route, "url") ?? absoluteRouteUrl(routePath, apiBase),
    status:
      integerField(response, "status") ??
      integerField(record, "status") ??
      integerField(expected, "status"),
    requestBody: recordField(request, "body") ?? recordField(record, "requestBody", "request_body"),
    responseBody,
    generatedAt:
      timestampField(record, "generatedAt", "generated_at", "createdAt", "created_at") ??
      fallbackTimestamp,
    error: replayMismatchMessage(record) ?? apiErrorMessage(response ?? record),
  };
}

function selectPreview(
  records: readonly ApiRecord[],
  root: AnyRecord | undefined,
): AnyRecord | undefined {
  for (const record of records) {
    const preview = extractPreviewPayload(record.responseBody);
    if (preview !== undefined) {
      return preview;
    }
  }

  return extractPreviewPayload(root);
}

function extractPreviewPayload(value: unknown): AnyRecord | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (isPreviewPayload(value)) {
    return value;
  }

  for (const key of [
    "preview",
    "artifact",
    "reviewArtifact",
    "review_artifact",
    "pluginReviewArtifact",
    "plugin_review_artifact",
    "result",
  ]) {
    const nested = recordField(value, key);
    if (nested && isPreviewPayload(nested)) {
      return nested;
    }
  }

  return undefined;
}

function isPreviewPayload(value: AnyRecord): boolean {
  const kind = stringField(value, "kind");
  if (
    kind === "plugin-review-artifact.preview" ||
    kind === "plugin_review_artifact" ||
    kind === "plugin-review-artifact"
  ) {
    return true;
  }

  const hasPluginIdentity =
    recordField(value, "plugin") !== undefined ||
    recordField(value, "manifest") !== undefined;

  return (
    hasPluginIdentity &&
    (recordField(value, "summary") !== undefined ||
      recordField(value, "redactionReport", "redaction_report") !== undefined ||
      Array.isArray(value.sourceFiles) ||
      Array.isArray(value.source_files) ||
      Array.isArray(value.sandboxReviews) ||
      Array.isArray(value.sandbox_reviews) ||
      recordField(value, "sandboxReview", "sandbox_review") !== undefined ||
      Array.isArray(value.approvalGates) ||
      Array.isArray(value.approval_gates) ||
      Array.isArray(value.evidence))
  );
}

function buildEmptyArtifact(
  root: AnyRecord | undefined,
  generatedAt: string,
): AnyRecord {
  return {
    schemaVersion: stringField(root, "schemaVersion", "schema_version"),
    generatedAt,
    plugin: {
      name: "Plugin review",
    },
  };
}

function buildArtifactInput(preview: AnyRecord, generatedAt: string): AnyRecord {
  const nestedArtifact = recordField(preview, "artifact");
  const artifactSource =
    nestedArtifact !== undefined && isPreviewPayload(nestedArtifact)
      ? nestedArtifact
      : preview;
  const plugin =
    recordField(artifactSource, "plugin") ??
    recordField(artifactSource, "manifest") ??
    recordField(preview, "plugin") ??
    recordField(preview, "manifest");
  const summary = recordField(artifactSource, "summary") ?? recordField(preview, "summary");
  const redactionReport =
    recordField(artifactSource, "redactionReport", "redaction_report") ??
    recordField(preview, "redactionReport", "redaction_report");
  const previewFallbacks = artifactSource === preview ? undefined : preview;

  return {
    artifactId:
      stringField(preview, "artifactId", "artifact_id", "reviewId", "review_id") ??
      stringField(artifactSource, "artifactId", "artifact_id", "reviewId", "review_id"),
    schemaVersion:
      stringField(preview, "schemaVersion", "schema_version", "artifactVersion", "artifact_version") ??
      stringField(artifactSource, "schemaVersion", "schema_version", "artifactVersion", "artifact_version"),
    generatedAt:
      timestampField(artifactSource, "generatedAt", "generated_at", "createdAt", "created_at") ??
      timestampField(preview, "generatedAt", "generated_at", "createdAt", "created_at") ??
      generatedAt,
    fingerprint: stringField(preview, "fingerprint") ?? stringField(artifactSource, "fingerprint"),
    plugin,
    gates: [
      ...arrayField(artifactSource, "gates", "gateRows", "gate_rows"),
      ...arrayField(previewFallbacks, "gates", "gateRows", "gate_rows"),
      ...arrayField(artifactSource, "automationGateSummaries", "automation_gate_summaries"),
      ...arrayField(previewFallbacks, "automationGateSummaries", "automation_gate_summaries"),
      ...approvalGateRows(artifactSource),
      ...reviewChecklistRows(artifactSource),
      ...reviewChecklistRows(previewFallbacks),
    ],
    sandboxFindings: [
      ...arrayField(artifactSource, "sandboxFindings", "sandbox_findings"),
      ...arrayField(previewFallbacks, "sandboxFindings", "sandbox_findings"),
      ...sandboxFindingRowsFromPreview(artifactSource),
      ...sandboxFindingRowsFromPreview(previewFallbacks),
    ],
    sandboxReviews: [
      ...arrayField(artifactSource, "sandboxReviews", "sandbox_reviews").filter(
        isBaseSandboxReviewCandidate,
      ),
      ...arrayField(previewFallbacks, "sandboxReviews", "sandbox_reviews").filter(
        isBaseSandboxReviewCandidate,
      ),
      ...optionalRecordList(recordField(artifactSource, "sandboxReview", "sandbox_review")),
    ],
    audit: {
      counters: [
        ...arrayField(artifactSource, "auditCounters", "audit_counters"),
        ...arrayField(previewFallbacks, "auditCounters", "audit_counters"),
        ...arrayField(artifactSource, "automationAuditSummaries", "automation_audit_summaries"),
        ...arrayField(previewFallbacks, "automationAuditSummaries", "automation_audit_summaries"),
        ...auditReferenceCounters(artifactSource),
        ...auditCountersFromPreview(artifactSource),
        ...auditCountersFromPreview(previewFallbacks),
      ],
      events: [
        ...arrayField(artifactSource, "auditEvents", "audit_events"),
        ...arrayField(previewFallbacks, "auditEvents", "audit_events"),
      ],
    },
    localEvidence: {
      files: [
        ...arrayField(artifactSource, "localEvidence", "local_evidence", "evidence"),
        ...arrayField(previewFallbacks, "localEvidence", "local_evidence", "evidence"),
        ...localEvidenceFromSourceRows(buildSourceFileRowsFromPreview(preview)),
      ],
    },
    actions: [
      ...arrayField(artifactSource, "actions", "actionButtons", "action_buttons"),
      ...arrayField(previewFallbacks, "actions", "actionButtons", "action_buttons"),
      ...previewActionRows(summary, redactionReport),
    ],
  };
}

function approvalGateRows(preview: AnyRecord): AnyRecord[] {
  return arrayField(preview, "approvalGates", "approval_gates").map((gate, index) => {
    if (!isRecord(gate)) {
      return gate;
    }
    return {
      id: stringField(gate, "id") ?? `approval_gate_${index + 1}`,
      gateId: stringField(gate, "id") ?? `approval_gate_${index + 1}`,
      label: stringField(gate, "name", "label") ?? `Approval gate ${index + 1}`,
      status: approvalGateStatus(gate),
      required: booleanField(gate, "required") ?? true,
      detailLabels: optionalStringList(stringField(gate, "reason")),
    };
  }).filter(isRecord);
}

function reviewChecklistRows(preview: AnyRecord | undefined): AnyRecord[] {
  return arrayField(preview, "reviewChecklist", "review_checklist").map((item, index) => ({
    id: `review_checklist_${index + 1}`,
    gateId: `review_checklist_${index + 1}`,
    label: typeof item === "string" && item.trim() !== ""
      ? item.trim()
      : `Review checklist ${index + 1}`,
    status: "passed",
    required: true,
  }));
}

function sandboxFindingRowsFromPreview(preview: AnyRecord | undefined): AnyRecord[] {
  return arrayField(preview, "sandboxReviews", "sandbox_reviews")
    .map((review, index) => {
      if (!isRecord(review)) {
        return undefined;
      }
      const outcome = normalizeToken(stringField(review, "outcome", "status"));
      if (outcome === "passed" || outcome === "pass" || outcome === "success") {
        return undefined;
      }
      const reviewId = stringField(review, "id", "reviewId", "review_id") ??
        `sandbox_review_${index + 1}`;
      const findingCount = integerField(review, "findingCount", "finding_count");
      return {
        id: `${reviewId}.preview`,
        findingId: `${reviewId}.preview`,
        reviewId,
        pluginId: stringField(review, "pluginId", "plugin_id"),
        runLabel: stringField(review, "runLabel", "run_label"),
        category: "plugin",
        severity:
          outcome === "warning" || outcome === "warn" || outcome === "attention"
            ? "warning"
            : "blocking",
        title:
          stringField(review, "title", "label") ??
          (outcome === "warning" ? "Sandbox warning" : "Sandbox failed"),
        detailLabels: [
          stringField(review, "checkedAt", "checked_at")
            ? `Checked at ${stringField(review, "checkedAt", "checked_at")}`
            : undefined,
          findingCount !== undefined ? formatCount(findingCount, "finding") : undefined,
          stringField(review, "fingerprint")
            ? `Fingerprint ${stringField(review, "fingerprint")}`
            : undefined,
        ].filter(isDefined),
      };
    })
    .filter(isDefined);
}

function isBaseSandboxReviewCandidate(value: unknown): value is AnyRecord {
  if (!isRecord(value)) {
    return false;
  }

  return (
    booleanField(value, "ok", "passed", "success") !== undefined ||
    recordField(value, "capabilities") !== undefined ||
    recordField(value, "hostApis", "host_apis") !== undefined ||
    recordField(value, "limits") !== undefined ||
    recordField(value, "audit") !== undefined
  );
}

function auditCountersFromPreview(preview: AnyRecord | undefined): AnyRecord[] {
  const counters: AnyRecord[] = [];
  const sandboxRun = recordField(preview, "sandboxRun", "sandbox_run");
  const auditEvents = arrayField(sandboxRun, "auditEvents", "audit_events");
  if (auditEvents.length > 0) {
    counters.push({
      key: "sandbox.audit",
      label: "Sandbox audit events",
      count: auditEvents.length,
      status: "complete",
    });
  }

  const summary = recordField(preview, "summary");
  const eventCount = integerField(summary, "automationAuditEventCount", "automation_audit_event_count");
  if (eventCount !== undefined && eventCount > 0) {
    counters.push({
      key: "automation.audit",
      label: "Automation audit events",
      count: eventCount,
      status: "complete",
    });
  }

  return counters;
}

function auditReferenceCounters(preview: AnyRecord | undefined): AnyRecord[] {
  const auditReferences = arrayField(preview, "auditReferences", "audit_references");
  if (auditReferences.length === 0) {
    return [];
  }

  return [
    {
      key: "artifact.audit_references",
      label: "Audit references",
      count: auditReferences.length,
      status: "complete",
    },
  ];
}

function localEvidenceFromSourceRows(
  rows: readonly PluginReviewArtifactApiSourceFileRow[],
): AnyRecord[] {
  return rows.map((row) => ({
    id: row.sourceId,
    label: row.label,
    kind: row.sourceKind,
    path: row.path,
    uri: row.uri,
    fingerprint: row.fingerprint,
    byteCount: row.byteCount,
    recordCount: row.itemCount,
    status: row.status,
  }));
}

function previewActionRows(
  summary: AnyRecord | undefined,
  redactionReport: AnyRecord | undefined,
): AnyRecord[] {
  const redactionCount =
    integerField(summary, "redactionCount", "redaction_count") ??
    arrayField(redactionReport, "redactions").length;

  return [
    {
      id: "review_preview_redactions",
      label: "Review redactions",
      intent: "secondary",
      section: "evidence",
      enabled: redactionCount > 0,
      disabledReason: redactionCount > 0 ? undefined : "No redactions are available.",
    },
  ];
}

function buildRequestCardsFromRecords(
  records: readonly ApiRecord[],
): PluginReviewArtifactApiRequestCard[] {
  return records.map(buildRequestCard).sort(compareRequestCards).map(cloneRequestCard);
}

function buildRequestCard(record: ApiRecord): PluginReviewArtifactApiRequestCard {
  const status = requestStatus(record);
  const title = record.title ?? `${record.method} ${record.routePath}`;
  const detailLabels = [
    `${record.method} ${record.routePath}`,
    record.status === undefined ? "Status unavailable" : `Status ${record.status}`,
    `Captured at ${record.generatedAt}`,
    record.requestBody === undefined ? undefined : "Request body captured",
    record.responseBody === undefined ? undefined : "Response body captured",
    errorMessage(record.error) ? `Error: ${errorMessage(record.error)}` : undefined,
  ].filter(isDefined);

  return {
    id: `plugin_review_artifact_api_request.${sanitizeIdentifier(
      record.id,
      `request_${record.index + 1}`,
    )}`,
    requestId: record.id,
    title,
    method: record.method,
    routePath: record.routePath,
    url: record.url,
    status,
    statusLabel: statusLabel(status),
    statusCode: record.status,
    valueLabel: record.status === undefined ? statusLabel(status) : `${record.status}`,
    detailLabels,
    actionId: "open_api_request",
    ariaLabel: [title, statusLabel(status), record.status ?? "status unavailable"].join(", "),
  };
}

function buildResponseStatusFromRecords(
  records: readonly ApiRecord[],
  errors: readonly PluginReviewArtifactApiErrorState[],
): PluginReviewArtifactApiResponseStatus {
  const totalCount = records.length;
  const errorRecords = records.filter((record) => requestStatus(record) === "error");
  const completedCount = records.filter(
    (record) => requestStatus(record) === "complete",
  ).length;
  const successCount = records.filter((record) => {
    const status = requestStatus(record);
    return status === "complete" || status === "ready";
  }).length;
  const firstRecord = records[0];
  const firstError = errors[0];
  const status: PluginReviewArtifactStatus =
    totalCount === 0
      ? "empty"
      : errors.length > 0 || errorRecords.length > 0
        ? "error"
        : completedCount > 0
          ? "complete"
          : successCount > 0
            ? "ready"
            : "ready";
  const errorState = firstError?.errorState;

  const responseStatus: PluginReviewArtifactApiResponseStatus = {
    id: "plugin_review_artifact_api_response_status",
    label: "Preview response",
    status,
    statusLabel: statusLabel(status),
    statusCode: firstRecord?.status,
    routePath: firstRecord?.routePath,
    method: firstRecord?.method,
    successCount,
    errorCount: Math.max(errorRecords.length, errors.length),
    totalCount,
    detailLabels: [
      formatCount(totalCount, "response"),
      formatCount(successCount, "successful response"),
      formatCount(Math.max(errorRecords.length, errors.length), "failed response"),
      firstRecord === undefined ? undefined : `${firstRecord.method} ${firstRecord.routePath}`,
      firstRecord?.status === undefined ? undefined : `Latest status ${firstRecord.status}`,
    ].filter(isDefined),
    emptyState: buildPluginReviewArtifactApiEmptyState("response"),
    errorState,
    ariaLabel: [
      "Preview response",
      statusLabel(status),
      formatCount(totalCount, "response"),
      formatCount(Math.max(errorRecords.length, errors.length), "failed response"),
    ].join(", "),
  };

  return responseStatus;
}

function buildRedactionCountsFromPreview(
  preview: AnyRecord | undefined,
): PluginReviewArtifactApiRedactionCount[] {
  if (preview === undefined) {
    return [];
  }

  const drafts = new Map<string, RedactionDraft>();
  const summary = recordField(preview, "summary");
  const redactionReport = recordField(preview, "redactionReport", "redaction_report");

  for (const redaction of [
    ...arrayField(preview, "redactions"),
    ...arrayField(redactionReport, "redactions"),
  ]) {
    if (!isRecord(redaction)) {
      continue;
    }
    const key = normalizeCounterKey(
      stringField(redaction, "kind", "reason", "type") ?? "redaction",
    );
    mergeRedactionDraft(drafts, key, {
      count: 1,
      replacementCount: integerField(redaction, "replacements", "replacementCount", "replacement_count") ?? 1,
      path: stringField(redaction, "path", "fieldPath", "field_path"),
      label: stringField(redaction, "label", "title"),
    });
  }

  const summaryCount = integerField(summary, "redactionCount", "redaction_count");
  if (summaryCount !== undefined && summaryCount > 0 && drafts.size === 0) {
    mergeRedactionDraft(drafts, "redaction", {
      count: summaryCount,
      replacementCount: summaryCount,
      label: "Redactions",
    });
  }

  return [...drafts.values()]
    .map(toRedactionCount)
    .sort(compareRedactionCounts)
    .map(cloneRedactionCount);
}

function mergeRedactionDraft(
  drafts: Map<string, RedactionDraft>,
  key: string,
  patch: {
    count: number;
    replacementCount: number;
    path?: string;
    label?: string;
  },
): void {
  const draft =
    drafts.get(key) ??
    {
      key,
      count: 0,
      replacementCount: 0,
      paths: new Set<string>(),
    };

  draft.count += patch.count;
  draft.replacementCount += patch.replacementCount;
  if (patch.path !== undefined) {
    draft.paths.add(patch.path);
  }
  if (patch.label !== undefined) {
    draft.label = patch.label;
  }

  drafts.set(key, draft);
}

function toRedactionCount(draft: RedactionDraft): PluginReviewArtifactApiRedactionCount {
  const paths = [...draft.paths].sort();
  const label = draft.label ?? `${titleCaseToken(draft.key)} redactions`;
  const detailLabels = [
    formatCount(draft.count, "record"),
    formatCount(draft.replacementCount, "replacement"),
    paths.length === 0 ? "Paths unavailable" : formatCount(paths.length, "path"),
  ];

  return {
    id: `plugin_review_artifact_api_redaction.${sanitizeIdentifier(draft.key, "redaction")}`,
    key: draft.key,
    label,
    count: draft.count,
    replacementCount: draft.replacementCount,
    status: "complete",
    statusLabel: statusLabel("complete"),
    paths,
    detailLabels,
    ariaLabel: [
      label,
      formatCount(draft.count, "record"),
      formatCount(draft.replacementCount, "replacement"),
    ].join(", "),
  };
}

function buildRedactionSummary(
  counts: readonly PluginReviewArtifactApiRedactionCount[],
): PluginReviewArtifactApiRedactionSummary {
  const totalCount = counts.reduce((total, count) => total + count.count, 0);
  const replacementCount = counts.reduce(
    (total, count) => total + count.replacementCount,
    0,
  );
  const status: PluginReviewArtifactStatus = totalCount > 0 ? "complete" : "empty";

  return {
    id: "plugin_review_artifact_api_redaction_summary",
    label: "Redactions",
    status,
    statusLabel: statusLabel(status),
    totalCount,
    replacementCount,
    detailLabels: [
      formatCount(totalCount, "redaction record"),
      formatCount(replacementCount, "replacement"),
      formatCount(counts.length, "redaction kind"),
    ],
    emptyState: buildPluginReviewArtifactApiEmptyState("redactions"),
    ariaLabel: [
      "Redactions",
      statusLabel(status),
      formatCount(totalCount, "redaction record"),
      formatCount(replacementCount, "replacement"),
    ].join(", "),
  };
}

function buildSourceFileRowsFromPreview(
  preview: AnyRecord | undefined,
): PluginReviewArtifactApiSourceFileRow[] {
  if (preview === undefined) {
    return [];
  }

  return collectSourceFileInputs(preview)
    .map(buildSourceFileRow)
    .filter(isDefined)
    .sort(compareSourceFileRows)
    .map(cloneSourceFileRow);
}

function collectSourceFileInputs(preview: AnyRecord): SourceFileInput[] {
  const inputs: SourceFileInput[] = [];
  const nestedArtifact = recordField(preview, "artifact");
  const artifactSource =
    nestedArtifact !== undefined && isPreviewPayload(nestedArtifact)
      ? nestedArtifact
      : preview;
  const sourceRoots =
    artifactSource === preview ? [artifactSource] : [artifactSource, preview];

  for (const [index, value] of sourceRoots
    .flatMap((source) => arrayField(source, "sourceFiles", "source_files"))
    .entries()) {
    inputs.push({ sourceKind: "source-file", value, index });
  }

  for (const sources of sourceRoots
    .map((source) => recordField(source, "sources"))
    .filter(isDefined)) {
    for (const [kind, value] of Object.entries(sources)) {
      if (Array.isArray(value)) {
        for (const [index, item] of value.entries()) {
          inputs.push({ sourceKind: kind, value: item, index });
        }
      } else if (value !== undefined) {
        inputs.push({ sourceKind: kind, value, index: 0 });
      }
    }
  }

  const plugin =
    recordField(artifactSource, "plugin") ??
    recordField(artifactSource, "manifest") ??
    recordField(preview, "plugin") ??
    recordField(preview, "manifest");
  for (const key of ["manifestPath", "manifest_path", "entrypoint"]) {
    const path = stringField(plugin, key);
    if (path !== undefined) {
      inputs.push({
        sourceKind: key === "entrypoint" ? "entrypoint" : "manifest",
        value: { path },
        index: inputs.length,
      });
    }
  }

  return inputs;
}

function buildSourceFileRow(
  input: SourceFileInput,
): PluginReviewArtifactApiSourceFileRow | undefined {
  const record = normalizeSourceFileRecord(input.value);
  if (record === undefined) {
    return undefined;
  }

  const path = stringField(record, "path", "filePath", "file_path");
  const uri = stringField(record, "uri", "url", "sourceUri", "source_uri");
  const fingerprint = stringField(record, "fingerprint", "sha256", "checksum", "hash");
  const sourceId =
    stringField(record, "id", "sourceId", "source_id") ??
    path ??
    uri ??
    `${input.sourceKind}_${input.index + 1}`;
  const label =
    stringField(record, "label", "title", "name") ??
    path ??
    uri ??
    titleCaseToken(input.sourceKind);
  const byteCount = integerField(record, "bytes", "byteCount", "byte_count");
  const itemCount = integerField(record, "itemCount", "item_count", "count");
  const status = sourceFileStatus(path, uri);
  const detailLabels = [
    titleCaseToken(input.sourceKind),
    path ? `Path ${path}` : undefined,
    uri ? `URI ${uri}` : undefined,
    fingerprint ? `Fingerprint ${fingerprint}` : undefined,
    byteCount !== undefined ? `${byteCount} bytes` : undefined,
    itemCount !== undefined ? formatCount(itemCount, "item") : undefined,
  ].filter(isDefined);

  return {
    id: `plugin_review_artifact_api_source.${sanitizeIdentifier(
      `${input.sourceKind}.${sourceId}`,
      `source_${input.index + 1}`,
    )}`,
    sourceId,
    sourceKind: input.sourceKind,
    label,
    status,
    statusLabel: statusLabel(status),
    path,
    uri,
    fingerprint,
    byteCount,
    itemCount,
    detailLabels,
    ariaLabel: [label, titleCaseToken(input.sourceKind), statusLabel(status)].join(", "),
  };
}

function normalizeSourceFileRecord(value: unknown): AnyRecord | undefined {
  if (typeof value === "string" && value.trim() !== "") {
    return { path: value.trim() };
  }
  if (isRecord(value)) {
    return value;
  }
  return undefined;
}

function sourceFileStatus(
  path: string | undefined,
  uri: string | undefined,
): PluginReviewArtifactStatus {
  const reference = path ?? uri;
  if (reference === undefined) {
    return "attention";
  }
  if (isRepoRelativeReference(reference) || isLocalUri(reference)) {
    return "complete";
  }
  return "attention";
}

function isRepoRelativeReference(value: string): boolean {
  return (
    !/^[a-z]+:\/\//i.test(value) &&
    !/^[a-zA-Z]:[\\/]/.test(value) &&
    !value.startsWith("/") &&
    !value.startsWith("\\\\") &&
    !value.includes("..")
  );
}

function isLocalUri(value: string): boolean {
  return (
    value.startsWith("workspace://") ||
    value.startsWith("fixture://") ||
    value.startsWith("sovereignops://") ||
    value.startsWith("local://")
  );
}

function buildApiActionButtons(
  artifactActions: readonly PluginReviewActionButton[],
  requestCards: readonly PluginReviewArtifactApiRequestCard[],
  redactionCounts: readonly PluginReviewArtifactApiRedactionCount[],
  sourceFileRows: readonly PluginReviewArtifactApiSourceFileRow[],
  artifact: PluginReviewArtifactViewModel,
): PluginReviewArtifactApiActionButton[] {
  return dedupeActions([
    ...artifactActions.map(fromArtifactAction),
    {
      id: "refresh_preview",
      label: "Refresh preview",
      intent: "secondary",
      enabled: requestCards.length > 0,
      section: "requests",
      disabledReason: requestCards.length > 0 ? undefined : "No preview request is available.",
      ariaLabel: [
        "Refresh preview",
        requestCards.length > 0 ? "enabled" : "disabled",
      ].join(", "),
    },
    {
      id: "open_artifact_preview",
      label: "Open artifact preview",
      intent: "primary",
      enabled: artifact.status !== "empty" && artifact.status !== "error",
      section: "artifact",
      disabledReason:
        artifact.status !== "empty" && artifact.status !== "error"
          ? undefined
          : "No artifact preview is ready.",
      ariaLabel: [
        "Open artifact preview",
        artifact.status !== "empty" && artifact.status !== "error"
          ? "enabled"
          : "disabled",
      ].join(", "),
    },
    {
      id: "review_api_redactions",
      label: "Review API redactions",
      intent: "secondary",
      enabled: redactionCounts.length > 0,
      section: "redactions",
      disabledReason: redactionCounts.length > 0 ? undefined : "No redactions are available.",
      ariaLabel: [
        "Review API redactions",
        redactionCounts.length > 0 ? "enabled" : "disabled",
      ].join(", "),
    },
    {
      id: "open_source_files",
      label: "Open source files",
      intent: "secondary",
      enabled: sourceFileRows.length > 0,
      section: "sources",
      disabledReason: sourceFileRows.length > 0 ? undefined : "No source files are available.",
      ariaLabel: [
        "Open source files",
        sourceFileRows.length > 0 ? "enabled" : "disabled",
      ].join(", "),
    },
  ]).map(cloneActionButton);
}

function fromArtifactAction(
  action: PluginReviewActionButton,
): PluginReviewArtifactApiActionButton {
  return { ...action };
}

function collectErrorStates(
  records: readonly ApiRecord[],
): PluginReviewArtifactApiErrorState[] {
  const errors: PluginReviewArtifactApiErrorState[] = [];
  for (const record of records) {
    const error = record.error ?? responseStatusError(record);
    if (error === undefined) {
      continue;
    }
    errors.push(
      buildPluginReviewArtifactApiErrorState("response", error, {
        routeId: record.id,
        routePath: record.routePath,
        status: record.status,
      }),
    );
  }
  return errors;
}

function collectPublicFixtureSchemaErrorStates(
  root: AnyRecord | undefined,
): PluginReviewArtifactApiErrorState[] {
  if (!isPublicApiFixtureBundle(root)) {
    return [];
  }

  const result = validatePluginReviewArtifactApiRequestBundle(root);
  if (result.ok) {
    return [];
  }

  return [
    buildPluginReviewArtifactApiErrorState(
      "requests",
      schemaValidationErrorDescription(
        "Plugin review artifact API fixture bundle",
        result.issues,
      ),
    ),
  ];
}

function isPublicApiFixtureBundle(root: AnyRecord | undefined): boolean {
  if (
    stringField(root, "schemaVersion", "schema_version") !==
    PUBLIC_API_REQUEST_BUNDLE_SCHEMA_VERSION
  ) {
    return false;
  }

  return hasFixtureRefs(root) || hasFixtureExpectationsWithoutReplayResponses(root);
}

function hasFixtureRefs(root: AnyRecord | undefined): boolean {
  return root !== undefined && hasOwn(root, "fixtureRefs");
}

function hasFixtureExpectationsWithoutReplayResponses(
  root: AnyRecord | undefined,
): boolean {
  const requests = arrayField(root, "requests");
  if (requests.length === 0) {
    return root !== undefined && hasOwn(root, "requests");
  }

  return requests
    .filter(isRecord)
    .some((request) => hasOwn(request, "expect") || !hasOwn(request, "response"));
}

function schemaValidationErrorDescription(
  label: string,
  issues: readonly SchemaValidationIssue[],
): string {
  const sortedIssues = [...issues].sort(compareSchemaIssues);
  const details = sortedIssues
    .map((issue) => `${issue.path}: ${issue.message}`)
    .join("; ");
  return `${label} schema validation failed with ${formatCount(
    sortedIssues.length,
    "issue",
  )}: ${details}`;
}

function compareSchemaIssues(
  left: SchemaValidationIssue,
  right: SchemaValidationIssue,
): number {
  return (
    left.path.localeCompare(right.path) ||
    left.message.localeCompare(right.message)
  );
}

function responseStatusError(record: ApiRecord): string | undefined {
  if (record.status !== undefined && record.status >= 400) {
    return `Request failed with status ${record.status}.`;
  }
  return undefined;
}

function replayMismatchMessage(record: AnyRecord): string | undefined {
  const matches = recordField(record, "matches");
  if (!matches) {
    return undefined;
  }

  const failed = Object.entries(matches)
    .filter(([, value]) => value === false)
    .map(([key]) => key);

  return failed.length === 0
    ? undefined
    : `Replay mismatch: ${failed.join(", ")}.`;
}

function requestStatus(record: ApiRecord): PluginReviewArtifactStatus {
  if (record.error !== undefined || (record.status !== undefined && record.status >= 400)) {
    return "error";
  }
  if (record.status !== undefined && record.status >= 300) {
    return "attention";
  }
  if (record.status !== undefined && record.status >= 200) {
    return "complete";
  }
  if (record.responseBody !== undefined) {
    return "ready";
  }
  return "empty";
}

function resolveApiStatus(input: {
  responseStatus: PluginReviewArtifactStatus;
  artifactStatus: PluginReviewArtifactStatus;
  redactionStatus: PluginReviewArtifactStatus;
  sourceStatus: PluginReviewArtifactStatus;
  errorStates: readonly PluginReviewArtifactApiErrorState[];
}): PluginReviewArtifactStatus {
  if (input.errorStates.length > 0 || input.responseStatus === "error") {
    return "error";
  }
  return strongestStatus([
    input.artifactStatus,
    input.responseStatus,
    input.redactionStatus,
    input.sourceStatus,
  ]);
}

function sourceRowsStatus(
  rows: readonly PluginReviewArtifactApiSourceFileRow[],
): PluginReviewArtifactStatus {
  if (rows.length === 0) {
    return "empty";
  }
  if (rows.some((row) => row.status === "error")) {
    return "error";
  }
  if (rows.some((row) => row.status === "attention")) {
    return "attention";
  }
  return "complete";
}

function strongestStatus(
  statuses: readonly PluginReviewArtifactStatus[],
): PluginReviewArtifactStatus {
  return statuses.reduce((strongest, status) =>
    statusRank(status) < statusRank(strongest) ? status : strongest,
  );
}

function statusRank(status: PluginReviewArtifactStatus): number {
  switch (status) {
    case "error":
      return 0;
    case "attention":
      return 1;
    case "indexing":
      return 2;
    case "ready":
      return 3;
    case "complete":
      return 4;
    case "empty":
      return 5;
  }
}

function statusLabel(status: PluginReviewArtifactStatus): string {
  switch (status) {
    case "empty":
      return "Empty";
    case "ready":
      return "Ready";
    case "indexing":
      return "Running";
    case "attention":
      return "Needs review";
    case "error":
      return "Error";
    case "complete":
      return "Complete";
  }
}

function approvalGateStatus(gate: AnyRecord): string {
  const state = normalizeToken(stringField(gate, "state", "status"));
  if (state === "approved" || state === "passed") {
    return "passed";
  }
  if (state === "denied" || state === "failed") {
    return "failed";
  }
  return "pending";
}

function apiErrorMessage(record: AnyRecord | undefined): string | undefined {
  if (!record) {
    return undefined;
  }

  const body = recordField(record, "body") ?? record;
  const error = recordField(body, "error");
  const message =
    stringField(error, "message") ??
    stringField(error, "code") ??
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

function compareRequestCards(
  left: PluginReviewArtifactApiRequestCard,
  right: PluginReviewArtifactApiRequestCard,
): number {
  return (
    statusRank(left.status) - statusRank(right.status) ||
    left.routePath.localeCompare(right.routePath) ||
    left.requestId.localeCompare(right.requestId)
  );
}

function compareRedactionCounts(
  left: PluginReviewArtifactApiRedactionCount,
  right: PluginReviewArtifactApiRedactionCount,
): number {
  return (
    right.replacementCount - left.replacementCount ||
    left.label.localeCompare(right.label) ||
    left.key.localeCompare(right.key)
  );
}

function compareSourceFileRows(
  left: PluginReviewArtifactApiSourceFileRow,
  right: PluginReviewArtifactApiSourceFileRow,
): number {
  return (
    statusRank(left.status) - statusRank(right.status) ||
    left.sourceKind.localeCompare(right.sourceKind) ||
    left.label.localeCompare(right.label) ||
    left.sourceId.localeCompare(right.sourceId)
  );
}

function dedupeActions(
  actions: readonly PluginReviewArtifactApiActionButton[],
): PluginReviewArtifactApiActionButton[] {
  const seen = new Set<string>();
  const deduped: PluginReviewArtifactApiActionButton[] = [];
  for (const action of actions) {
    if (seen.has(action.id)) {
      continue;
    }
    seen.add(action.id);
    deduped.push(action);
  }
  return deduped;
}

function dedupeErrorStates(
  errors: readonly PluginReviewArtifactApiErrorState[],
): PluginReviewArtifactApiErrorState[] {
  const seen = new Set<string>();
  const deduped: PluginReviewArtifactApiErrorState[] = [];
  for (const error of errors) {
    const key = [
      error.context,
      error.routeId,
      error.routePath,
      error.status,
      error.errorState.description,
    ].join(":");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(error);
  }
  return deduped.sort(compareApiErrorStates);
}

function compareApiErrorStates(
  left: PluginReviewArtifactApiErrorState,
  right: PluginReviewArtifactApiErrorState,
): number {
  return (
    apiContextRank(left.context) - apiContextRank(right.context) ||
    (left.routePath ?? "").localeCompare(right.routePath ?? "") ||
    (left.routeId ?? "").localeCompare(right.routeId ?? "") ||
    left.errorState.description.localeCompare(right.errorState.description)
  );
}

function apiContextRank(context: PluginReviewArtifactApiContext): number {
  switch (context) {
    case "requests":
      return 0;
    case "response":
      return 1;
    case "artifact":
      return 2;
    case "redactions":
      return 3;
    case "sources":
      return 4;
    case "actions":
      return 5;
  }
}

function errorLabel(context: PluginReviewArtifactApiContext): string {
  switch (context) {
    case "requests":
      return "Plugin review artifact request could not load";
    case "response":
      return "Plugin review artifact response could not load";
    case "artifact":
      return "Plugin review artifact preview could not load";
    case "redactions":
      return "Plugin review redactions could not load";
    case "sources":
      return "Plugin review source files could not load";
    case "actions":
      return "Plugin review actions could not load";
  }
}

function retryLabel(context: PluginReviewArtifactApiContext): string {
  switch (context) {
    case "requests":
      return "Retry requests";
    case "response":
      return "Retry response";
    case "artifact":
      return "Retry artifact";
    case "redactions":
      return "Retry redactions";
    case "sources":
      return "Retry sources";
    case "actions":
      return "Retry actions";
  }
}

function defaultErrorDescription(context: PluginReviewArtifactApiContext): string {
  switch (context) {
    case "requests":
      return "Load a captured preview request replay and try again.";
    case "response":
      return "Refresh the plugin review artifact preview response and try again.";
    case "artifact":
      return "Refresh the artifact preview and try again.";
    case "redactions":
      return "Refresh redaction counts and try again.";
    case "sources":
      return "Refresh source file rows and try again.";
    case "actions":
      return "Refresh preview actions and try again.";
  }
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

function integerField(
  record: AnyRecord | undefined,
  ...keys: string[]
): number | undefined {
  if (!record) {
    return undefined;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return Math.trunc(value);
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

function optionalRecordList(record: AnyRecord | undefined): AnyRecord[] {
  return record === undefined ? [] : [record];
}

function optionalStringList(value: string | undefined): string[] {
  return value === undefined || value.trim() === "" ? [] : [value.trim()];
}

function isRecord(value: unknown): value is AnyRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(record: AnyRecord | undefined, key: string): boolean {
  return record !== undefined && Object.prototype.hasOwnProperty.call(record, key);
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function normalizeToken(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "_") ?? "";
}

function normalizeCounterKey(value: string): string {
  return value.trim().replace(/\s+/g, ".").replace(/^\.+|\.+$/g, "") || "redaction";
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
    return "Plugin review";
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

function errorMessage(error: unknown): string | undefined {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }
  if (typeof error === "string" && error.trim() !== "") {
    return error.trim();
  }
  return undefined;
}

function cloneApiState(
  state: PluginReviewArtifactApiState,
): PluginReviewArtifactApiState {
  return {
    ...state,
    requestCards: state.requestCards.map(cloneRequestCard),
    responseStatus: cloneResponseStatus(state.responseStatus),
    artifact: {
      ...state.artifact,
      summaryCards: state.artifact.summaryCards.map(cloneSummaryCard),
      gateRows: state.artifact.gateRows.map((row) => ({
        ...row,
        detailLabels: [...row.detailLabels],
        evidenceIds: [...row.evidenceIds],
      })),
      sandboxFindingRows: state.artifact.sandboxFindingRows.map((row) => ({
        ...row,
        detailLabels: [...row.detailLabels],
        evidenceIds: [...row.evidenceIds],
      })),
      auditCounters: state.artifact.auditCounters.map((counter) => ({
        ...counter,
        pluginIds: [...counter.pluginIds],
        reviewIds: [...counter.reviewIds],
        detailLabels: [...counter.detailLabels],
      })),
      localEvidenceRows: state.artifact.localEvidenceRows.map((row) => ({
        ...row,
        detailLabels: [...row.detailLabels],
      })),
      actionButtons: state.artifact.actionButtons.map((action) => ({ ...action })),
      emptyStates: {
        summary: { ...state.artifact.emptyStates.summary },
        gates: { ...state.artifact.emptyStates.gates },
        sandbox: { ...state.artifact.emptyStates.sandbox },
        audit: { ...state.artifact.emptyStates.audit },
        evidence: { ...state.artifact.emptyStates.evidence },
        actions: { ...state.artifact.emptyStates.actions },
      },
      errorStates: state.artifact.errorStates.map((error) => ({
        ...error,
        errorState: { ...error.errorState },
      })),
    },
    artifactSummaryCards: state.artifactSummaryCards.map(cloneSummaryCard),
    redactionSummary: cloneRedactionSummary(state.redactionSummary),
    redactionCounts: state.redactionCounts.map(cloneRedactionCount),
    sourceFileRows: state.sourceFileRows.map(cloneSourceFileRow),
    actionButtons: state.actionButtons.map(cloneActionButton),
    emptyStates: {
      requests: { ...state.emptyStates.requests },
      response: { ...state.emptyStates.response },
      artifact: { ...state.emptyStates.artifact },
      redactions: { ...state.emptyStates.redactions },
      sources: { ...state.emptyStates.sources },
      actions: { ...state.emptyStates.actions },
    },
    errorStates: state.errorStates.map(cloneApiErrorState),
  };
}

function cloneRequestCard(
  card: PluginReviewArtifactApiRequestCard,
): PluginReviewArtifactApiRequestCard {
  return {
    ...card,
    detailLabels: [...card.detailLabels],
  };
}

function cloneResponseStatus(
  responseStatus: PluginReviewArtifactApiResponseStatus,
): PluginReviewArtifactApiResponseStatus {
  return {
    ...responseStatus,
    detailLabels: [...responseStatus.detailLabels],
    emptyState: { ...responseStatus.emptyState },
    errorState:
      responseStatus.errorState === undefined
        ? undefined
        : { ...responseStatus.errorState },
  };
}

function cloneSummaryCard(card: PluginReviewSummaryCard): PluginReviewSummaryCard {
  return {
    ...card,
    detailLabels: [...card.detailLabels],
  };
}

function cloneRedactionSummary(
  summary: PluginReviewArtifactApiRedactionSummary,
): PluginReviewArtifactApiRedactionSummary {
  return {
    ...summary,
    detailLabels: [...summary.detailLabels],
    emptyState: { ...summary.emptyState },
  };
}

function cloneRedactionCount(
  count: PluginReviewArtifactApiRedactionCount,
): PluginReviewArtifactApiRedactionCount {
  return {
    ...count,
    paths: [...count.paths],
    detailLabels: [...count.detailLabels],
  };
}

function cloneSourceFileRow(
  row: PluginReviewArtifactApiSourceFileRow,
): PluginReviewArtifactApiSourceFileRow {
  return {
    ...row,
    detailLabels: [...row.detailLabels],
  };
}

function cloneActionButton(
  action: PluginReviewArtifactApiActionButton,
): PluginReviewArtifactApiActionButton {
  return { ...action };
}

function cloneApiErrorState(
  error: PluginReviewArtifactApiErrorState,
): PluginReviewArtifactApiErrorState {
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
