import {
  buildMcpSafeReview,
  type McpApprovalSessionActor,
  type McpApprovalSessionSnapshot,
  type McpSafeReviewViewModel,
} from "./mcpReview.ts";

export type McpApprovalEvidenceApiPhase = "loading" | "success" | "error";

export type McpApprovalEvidenceDecisionStatus =
  | "allowed"
  | "denied"
  | "approval_required"
  | "expired";

export type McpApprovalEvidenceApiStatus =
  | "loading"
  | McpApprovalEvidenceDecisionStatus
  | "empty"
  | "error";

export type McpApprovalEvidenceApiContext =
  | "request"
  | "response"
  | "preview"
  | "status"
  | "gates"
  | "audit"
  | "redactions"
  | "actions";

export type McpApprovalEvidenceAuditReferenceStatus =
  | "available"
  | "missing";

export type McpApprovalEvidenceRedactionSeverity =
  | "info"
  | "warning"
  | "blocked";

export type McpApprovalEvidenceActionIntent =
  | "primary"
  | "secondary"
  | "danger";

export interface BuildMcpApprovalEvidenceApiStateOptions {
  defaultTimestamp?: string;
  error?: unknown;
  apiBase?: string;
  loading?: boolean;
}

export interface McpApprovalEvidenceApiState {
  id: "mcp_approval_evidence_api";
  phase: McpApprovalEvidenceApiPhase;
  generatedAt: string;
  status: McpApprovalEvidenceApiStatus;
  statusLabel: string;
  previewId?: string;
  sessionId?: string;
  requestId?: string;
  decisionReason?: string;
  review?: McpSafeReviewViewModel;
  summaryCards: McpApprovalEvidenceSummaryCard[];
  statusRows: McpApprovalEvidenceStatusRow[];
  gateRows: McpApprovalEvidenceGateRow[];
  auditReferenceRows: McpApprovalEvidenceAuditReferenceRow[];
  redactionWarningRows: McpApprovalEvidenceRedactionWarningRow[];
  recommendedActions: McpApprovalEvidenceRecommendedAction[];
  emptyStates: McpApprovalEvidenceApiEmptyStates;
  errorStates: McpApprovalEvidenceApiErrorState[];
}

export interface McpApprovalEvidenceSummaryCard {
  id: string;
  label: string;
  value: string;
  status: McpApprovalEvidenceApiStatus;
  statusLabel: string;
  detailLabels: string[];
  ariaLabel: string;
}

export interface McpApprovalEvidenceStatusRow {
  id: string;
  rowId: string;
  label: string;
  value: string;
  status: McpApprovalEvidenceApiStatus;
  statusLabel: string;
  detailLabels: string[];
  ariaLabel: string;
}

export interface McpApprovalEvidenceGateRow {
  id: string;
  gateId: string;
  label: string;
  status: McpApprovalEvidenceDecisionStatus;
  statusLabel: string;
  required: boolean;
  ruleId?: string;
  reason?: string;
  detailLabels: string[];
  ariaLabel: string;
}

export interface McpApprovalEvidenceAuditReferenceRow {
  id: string;
  referenceId: string;
  label: string;
  kind?: string;
  status: McpApprovalEvidenceAuditReferenceStatus;
  statusLabel: string;
  timestamp?: string;
  routePath?: string;
  uri?: string;
  fingerprint?: string;
  detailLabels: string[];
  ariaLabel: string;
}

export interface McpApprovalEvidenceRedactionWarningRow {
  id: string;
  warningId: string;
  label: string;
  severity: McpApprovalEvidenceRedactionSeverity;
  severityLabel: string;
  path?: string;
  reason: string;
  replacementCount: number;
  detailLabels: string[];
  ariaLabel: string;
}

export interface McpApprovalEvidenceRecommendedAction {
  id: string;
  label: string;
  intent: McpApprovalEvidenceActionIntent;
  enabled: boolean;
  section?: McpApprovalEvidenceApiContext;
  targetId?: string;
  disabledReason?: string;
  ariaLabel: string;
}

export interface McpApprovalEvidenceApiEmptyStates {
  summary: McpApprovalEvidenceApiEmptyState;
  status: McpApprovalEvidenceApiEmptyState;
  gates: McpApprovalEvidenceApiEmptyState;
  auditReferences: McpApprovalEvidenceApiEmptyState;
  redactionWarnings: McpApprovalEvidenceApiEmptyState;
  actions: McpApprovalEvidenceApiEmptyState;
}

export interface McpApprovalEvidenceApiEmptyState {
  id: string;
  label: string;
  description: string;
  ariaLabel: string;
}

export interface McpApprovalEvidenceApiErrorState {
  id: string;
  context: McpApprovalEvidenceApiContext;
  routeId?: string;
  routePath?: string;
  status?: number;
  errorState: {
    id: string;
    label: string;
    description: string;
    ariaLabel: string;
    retryLabel: string;
  };
}

type AnyRecord = Record<string, unknown>;

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
  errorStates: McpApprovalEvidenceApiErrorState[];
}

const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const DEFAULT_PREVIEW_ROUTE = "/v1/mcp/approvals/evidence/preview";

export function buildMcpApprovalEvidenceApiState(
  input: unknown,
  options: BuildMcpApprovalEvidenceApiStateOptions = {},
): McpApprovalEvidenceApiState {
  if (options.loading === true) {
    return buildMcpApprovalEvidenceApiLoadingState(options);
  }

  const bridge = normalizeBridge(input, options);
  const preview = bridge.preview;
  const previewStatus =
    preview === undefined ? "empty" : normalizePreviewStatus(preview);
  const phase: McpApprovalEvidenceApiPhase =
    bridge.errorStates.length > 0 ? "error" : "success";
  const status: McpApprovalEvidenceApiStatus =
    phase === "error" ? "error" : previewStatus;
  const review = preview === undefined ? undefined : buildReviewFromPreview(preview);
  const gateRows = buildGateRowsFromPreview(preview);
  const auditReferenceRows = buildAuditReferenceRowsFromPreview(preview);
  const redactionWarningRows = buildRedactionWarningRowsFromPreview(preview);
  const statusRows = buildStatusRowsFromBridge({
    bridge,
    preview,
    status,
    review,
  });
  const summaryCards = buildSummaryCardsFromBridge({
    bridge,
    preview,
    status,
    review,
    gateRows,
    auditReferenceRows,
    redactionWarningRows,
  });
  const recommendedActions = buildRecommendedActions({
    status,
    phase,
    preview,
    gateRows,
    auditReferenceRows,
    redactionWarningRows,
    errorStates: bridge.errorStates,
  });

  return cloneApiState({
    id: "mcp_approval_evidence_api",
    phase,
    generatedAt: bridge.generatedAt,
    status,
    statusLabel: statusLabel(status),
    previewId: previewId(preview),
    sessionId: sessionIdFromPreview(preview),
    requestId: requestIdFromPreview(preview),
    decisionReason: decisionReasonFromPreview(preview),
    review,
    summaryCards,
    statusRows,
    gateRows,
    auditReferenceRows,
    redactionWarningRows,
    recommendedActions,
    emptyStates: buildMcpApprovalEvidenceApiEmptyStates(),
    errorStates: bridge.errorStates.map(cloneApiErrorState),
  });
}

export function buildMcpApprovalEvidenceApiLoadingState(
  options: Pick<BuildMcpApprovalEvidenceApiStateOptions, "defaultTimestamp"> = {},
): McpApprovalEvidenceApiState {
  const generatedAt = normalizeTimestamp(undefined, options.defaultTimestamp);
  const status: McpApprovalEvidenceApiStatus = "loading";
  const summaryCards = [
    {
      id: "mcp_approval_evidence_summary.loading",
      label: "Evidence preview",
      value: "Loading",
      status,
      statusLabel: statusLabel(status),
      detailLabels: ["Waiting for the approval evidence preview response."],
      ariaLabel: "Evidence preview, Loading",
    },
  ];
  const statusRows = [
    {
      id: "mcp_approval_evidence_status.loading",
      rowId: "loading",
      label: "Preview status",
      value: "Loading evidence preview",
      status,
      statusLabel: statusLabel(status),
      detailLabels: ["The review UI is waiting for preview data."],
      ariaLabel: "Preview status, Loading evidence preview",
    },
  ];

  return cloneApiState({
    id: "mcp_approval_evidence_api",
    phase: "loading",
    generatedAt,
    status,
    statusLabel: statusLabel(status),
    summaryCards,
    statusRows,
    gateRows: [],
    auditReferenceRows: [],
    redactionWarningRows: [],
    recommendedActions: buildRecommendedActions({
      status,
      phase: "loading",
      preview: undefined,
      gateRows: [],
      auditReferenceRows: [],
      redactionWarningRows: [],
      errorStates: [],
    }),
    emptyStates: buildMcpApprovalEvidenceApiEmptyStates(),
    errorStates: [],
  });
}

export function buildMcpApprovalEvidenceApiSummaryCards(
  input: unknown,
  options: BuildMcpApprovalEvidenceApiStateOptions = {},
): McpApprovalEvidenceSummaryCard[] {
  return buildMcpApprovalEvidenceApiState(input, options).summaryCards.map(
    cloneSummaryCard,
  );
}

export function buildMcpApprovalEvidenceApiStatusRows(
  input: unknown,
  options: BuildMcpApprovalEvidenceApiStateOptions = {},
): McpApprovalEvidenceStatusRow[] {
  return buildMcpApprovalEvidenceApiState(input, options).statusRows.map(
    cloneStatusRow,
  );
}

export function buildMcpApprovalEvidenceApiGateRows(
  input: unknown,
  options: BuildMcpApprovalEvidenceApiStateOptions = {},
): McpApprovalEvidenceGateRow[] {
  const bridge = normalizeBridge(input, options);
  return buildGateRowsFromPreview(bridge.preview).map(cloneGateRow);
}

export function buildMcpApprovalEvidenceApiAuditReferenceRows(
  input: unknown,
  options: BuildMcpApprovalEvidenceApiStateOptions = {},
): McpApprovalEvidenceAuditReferenceRow[] {
  const bridge = normalizeBridge(input, options);
  return buildAuditReferenceRowsFromPreview(bridge.preview).map(
    cloneAuditReferenceRow,
  );
}

export function buildMcpApprovalEvidenceApiRedactionWarningRows(
  input: unknown,
  options: BuildMcpApprovalEvidenceApiStateOptions = {},
): McpApprovalEvidenceRedactionWarningRow[] {
  const bridge = normalizeBridge(input, options);
  return buildRedactionWarningRowsFromPreview(bridge.preview).map(
    cloneRedactionWarningRow,
  );
}

export function buildMcpApprovalEvidenceApiRecommendedActions(
  input: unknown,
  options: BuildMcpApprovalEvidenceApiStateOptions = {},
): McpApprovalEvidenceRecommendedAction[] {
  return buildMcpApprovalEvidenceApiState(input, options).recommendedActions.map(
    cloneRecommendedAction,
  );
}

export function buildMcpApprovalEvidenceApiEmptyStates(): McpApprovalEvidenceApiEmptyStates {
  return {
    summary: buildMcpApprovalEvidenceApiEmptyState("preview"),
    status: buildMcpApprovalEvidenceApiEmptyState("status"),
    gates: buildMcpApprovalEvidenceApiEmptyState("gates"),
    auditReferences: buildMcpApprovalEvidenceApiEmptyState("audit"),
    redactionWarnings: buildMcpApprovalEvidenceApiEmptyState("redactions"),
    actions: buildMcpApprovalEvidenceApiEmptyState("actions"),
  };
}

export function buildMcpApprovalEvidenceApiEmptyState(
  context: McpApprovalEvidenceApiContext,
): McpApprovalEvidenceApiEmptyState {
  switch (context) {
    case "request":
      return {
        id: "mcp_approval_evidence_request_empty",
        label: "No approval request",
        description: "Approval request details will appear when preview data includes them.",
        ariaLabel: "No MCP approval request is available",
      };
    case "response":
      return {
        id: "mcp_approval_evidence_response_empty",
        label: "No preview response",
        description: "Load an approval evidence preview response to show API status.",
        ariaLabel: "No MCP approval evidence preview response is available",
      };
    case "preview":
      return {
        id: "mcp_approval_evidence_preview_empty",
        label: "No evidence preview",
        description: "Approval evidence preview data will appear after a response is loaded.",
        ariaLabel: "No MCP approval evidence preview is available",
      };
    case "status":
      return {
        id: "mcp_approval_evidence_status_empty",
        label: "No status rows",
        description: "Decision and response status rows will appear when preview data is loaded.",
        ariaLabel: "No MCP approval evidence status rows are available",
      };
    case "gates":
      return {
        id: "mcp_approval_evidence_gates_empty",
        label: "No approval gates",
        description: "Gate rows will appear when the preview includes approval checks.",
        ariaLabel: "No MCP approval evidence gates are available",
      };
    case "audit":
      return {
        id: "mcp_approval_evidence_audit_empty",
        label: "No audit references",
        description: "Audit references will appear when preview data links to local audit records.",
        ariaLabel: "No MCP approval evidence audit references are available",
      };
    case "redactions":
      return {
        id: "mcp_approval_evidence_redactions_empty",
        label: "No redaction warnings",
        description: "Redaction warnings will appear when sensitive preview fields were removed.",
        ariaLabel: "No MCP approval evidence redaction warnings are available",
      };
    case "actions":
      return {
        id: "mcp_approval_evidence_actions_empty",
        label: "No recommended actions",
        description: "Recommended review actions will appear when preview data is loaded.",
        ariaLabel: "No MCP approval evidence recommended actions are available",
      };
  }
}

export function buildMcpApprovalEvidenceApiErrorStates(
  input: unknown,
  options: BuildMcpApprovalEvidenceApiStateOptions = {},
): McpApprovalEvidenceApiErrorState[] {
  return normalizeBridge(input, options).errorStates.map(cloneApiErrorState);
}

export function buildMcpApprovalEvidenceApiErrorState(
  context: McpApprovalEvidenceApiContext,
  error: unknown,
  metadata: {
    routeId?: string;
    routePath?: string;
    status?: number;
  } = {},
): McpApprovalEvidenceApiErrorState {
  const description = errorMessage(error) ?? defaultErrorDescription(context);
  const id = `mcp_approval_evidence_${context}_error`;

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
  options: BuildMcpApprovalEvidenceApiStateOptions,
): NormalizedBridge {
  const root = clonePlain(input);
  const rootRecord = isRecord(root) ? root : undefined;
  const generatedAt = normalizeTimestamp(
    timestampField(rootRecord, "generatedAt", "generated_at", "createdAt", "created_at"),
    options.defaultTimestamp,
  );
  const records = normalizeApiRecords(root, generatedAt, options.apiBase);
  const preview = selectPreview(records, rootRecord);
  const errorStates = collectErrorStates(records);

  if (options.error !== undefined) {
    errorStates.push(
      buildMcpApprovalEvidenceApiErrorState("response", options.error),
    );
  }

  return {
    generatedAt,
    records,
    preview,
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
    const routePath =
      stringField(root, "routePath", "route_path", "path") ??
      DEFAULT_PREVIEW_ROUTE;
    return [
      {
        id: stringField(root, "id") ?? "mcp_approval_evidence_response",
        index: 0,
        title: stringField(root, "title", "label"),
        method: stringField(root, "method")?.toUpperCase() ?? "POST",
        routePath,
        url: absoluteRouteUrl(routePath, apiBase),
        status: integerField(root, "status"),
        responseBody: root.body,
        generatedAt: fallbackTimestamp,
        error: apiErrorMessage(root),
      },
    ];
  }

  if (isRecord(root) && isPreviewPayload(root)) {
    return [
      {
        id: "mcp_approval_evidence_preview",
        index: 0,
        title: "MCP approval evidence preview",
        method: "POST",
        routePath: DEFAULT_PREVIEW_ROUTE,
        url: absoluteRouteUrl(DEFAULT_PREVIEW_ROUTE, apiBase),
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
    id:
      stringField(record, "id", "requestId", "request_id") ??
      `mcp_approval_evidence_request_${index + 1}`,
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
    requestBody:
      recordField(request, "body") ??
      recordField(record, "requestBody", "request_body"),
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
    "evidencePreview",
    "evidence_preview",
    "approvalEvidence",
    "approval_evidence",
    "mcpApprovalEvidence",
    "mcp_approval_evidence",
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
    kind === "mcp-approval-evidence.preview" ||
    kind === "mcp_approval_evidence.preview" ||
    kind === "mcp.approval.evidence.preview"
  ) {
    return true;
  }

  const hasDecision =
    stringField(value, "decision", "status", "outcome", "result") !== undefined ||
    typeof value.allowed === "boolean";
  const hasEvidenceShape =
    recordField(value, "session", "approvalSession", "approval_session") !== undefined ||
    recordField(value, "request") !== undefined ||
    arrayField(value, "gates", "approvalGates", "approval_gates").length > 0 ||
    arrayField(value, "auditReferences", "audit_references", "auditRefs", "audit_refs").length > 0 ||
    arrayField(value, "redactionWarnings", "redaction_warnings", "redactions").length > 0 ||
    recordField(value, "summary") !== undefined;

  return hasDecision && hasEvidenceShape;
}

function normalizePreviewStatus(
  preview: AnyRecord,
): McpApprovalEvidenceDecisionStatus {
  const explicit =
    normalizeDecisionStatus(stringField(preview, "decision", "status", "outcome", "result")) ??
    normalizeBooleanDecision(preview);
  if (explicit !== undefined) {
    return explicit;
  }

  const session = recordField(preview, "session", "approvalSession", "approval_session");
  const sessionStatus = normalizeDecisionStatus(stringField(session, "status"));
  if (sessionStatus !== undefined) {
    return sessionStatus;
  }

  const gateStatuses = buildGateRowsFromPreview(preview).map((row) => row.status);
  if (gateStatuses.includes("expired")) {
    return "expired";
  }
  if (gateStatuses.includes("denied")) {
    return "denied";
  }
  if (gateStatuses.includes("approval_required")) {
    return "approval_required";
  }
  if (gateStatuses.length > 0) {
    return "allowed";
  }

  return "approval_required";
}

function normalizeBooleanDecision(
  record: AnyRecord,
): McpApprovalEvidenceDecisionStatus | undefined {
  if (record.allowed === true) {
    return "allowed";
  }
  if (record.allowed === false) {
    return "denied";
  }
  return undefined;
}

function normalizeDecisionStatus(
  value: string | undefined,
): McpApprovalEvidenceDecisionStatus | undefined {
  const token = normalizeToken(value);
  if (
    token === "allowed" ||
    token === "allow" ||
    token === "approved" ||
    token === "approve" ||
    token === "passed" ||
    token === "complete" ||
    token === "success"
  ) {
    return "allowed";
  }
  if (
    token === "denied" ||
    token === "deny" ||
    token === "rejected" ||
    token === "reject" ||
    token === "blocked" ||
    token === "failed" ||
    token === "failure"
  ) {
    return "denied";
  }
  if (
    token === "approval_required" ||
    token === "requires_approval" ||
    token === "required" ||
    token === "pending" ||
    token === "review_required" ||
    token === "needs_review"
  ) {
    return "approval_required";
  }
  if (token === "expired" || token === "timed_out" || token === "timeout") {
    return "expired";
  }
  return undefined;
}

function buildSummaryCardsFromBridge(input: {
  bridge: NormalizedBridge;
  preview?: AnyRecord;
  status: McpApprovalEvidenceApiStatus;
  review?: McpSafeReviewViewModel;
  gateRows: readonly McpApprovalEvidenceGateRow[];
  auditReferenceRows: readonly McpApprovalEvidenceAuditReferenceRow[];
  redactionWarningRows: readonly McpApprovalEvidenceRedactionWarningRow[];
}): McpApprovalEvidenceSummaryCard[] {
  const cards: McpApprovalEvidenceSummaryCard[] = [];
  const preview = input.preview;

  cards.push(
    summaryCard({
      id: "decision",
      label: "Decision",
      value: statusLabel(input.status),
      status: input.status,
      detailLabels: [
        previewId(preview) ? `Preview ${previewId(preview)}` : undefined,
        decisionReasonFromPreview(preview),
        input.bridge.errorStates.length > 0
          ? formatCount(input.bridge.errorStates.length, "API error")
          : undefined,
      ].filter(isDefined),
    }),
  );

  if (input.review !== undefined) {
    cards.push(
      summaryCard({
        id: "review",
        label: "Review",
        value: input.review.title,
        status: input.status === "error" ? "error" : "allowed",
        detailLabels: [
          input.review.riskLabel,
          input.review.subjectLabel,
          ...input.review.detailLabels,
        ],
      }),
    );
  }

  cards.push(
    summaryCard({
      id: "gates",
      label: "Approval gates",
      value:
        input.gateRows.length === 0
          ? "No gates"
          : formatCount(input.gateRows.length, "gate"),
      status: rowsSummaryStatus(input.gateRows.map((row) => row.status)),
      detailLabels: gateSummaryLabels(input.gateRows),
    }),
    summaryCard({
      id: "audit",
      label: "Audit references",
      value:
        input.auditReferenceRows.length === 0
          ? "No references"
          : formatCount(input.auditReferenceRows.length, "reference"),
      status: input.auditReferenceRows.length === 0 ? "empty" : "allowed",
      detailLabels: input.auditReferenceRows
        .slice(0, 3)
        .map((row) => row.label),
    }),
    summaryCard({
      id: "redactions",
      label: "Redaction warnings",
      value:
        input.redactionWarningRows.length === 0
          ? "No warnings"
          : formatCount(input.redactionWarningRows.length, "warning"),
      status: redactionSummaryStatus(input.redactionWarningRows),
      detailLabels: input.redactionWarningRows
        .slice(0, 3)
        .map((row) => row.label),
    }),
  );

  return cards.map(cloneSummaryCard);
}

function summaryCard(input: {
  id: string;
  label: string;
  value: string;
  status: McpApprovalEvidenceApiStatus;
  detailLabels: string[];
}): McpApprovalEvidenceSummaryCard {
  const status = input.status;
  return {
    id: `mcp_approval_evidence_summary.${input.id}`,
    label: input.label,
    value: input.value,
    status,
    statusLabel: statusLabel(status),
    detailLabels: uniqueStrings(input.detailLabels),
    ariaLabel: [input.label, input.value, statusLabel(status)].join(", "),
  };
}

function buildStatusRowsFromBridge(input: {
  bridge: NormalizedBridge;
  preview?: AnyRecord;
  status: McpApprovalEvidenceApiStatus;
  review?: McpSafeReviewViewModel;
}): McpApprovalEvidenceStatusRow[] {
  const rows: McpApprovalEvidenceStatusRow[] = [];
  const preview = input.preview;

  rows.push(
    statusRow({
      rowId: "decision",
      label: "Decision",
      value: statusLabel(input.status),
      status: input.status,
      detailLabels: [
        decisionReasonFromPreview(preview),
        sessionIdFromPreview(preview) ? `Session ${sessionIdFromPreview(preview)}` : undefined,
      ].filter(isDefined),
    }),
  );

  if (input.review !== undefined) {
    rows.push(
      statusRow({
        rowId: "review",
        label: "Review target",
        value: input.review.title,
        status: input.status === "error" ? "error" : "allowed",
        detailLabels: [
          input.review.riskLabel,
          input.review.actionLabel,
          input.review.scopeLabel,
        ],
      }),
    );
  }

  const responseRow = buildResponseStatusRow(input.bridge.records);
  if (responseRow !== undefined) {
    rows.push(responseRow);
  }

  const expiresAt = expiresAtFromPreview(preview);
  if (expiresAt !== undefined) {
    rows.push(
      statusRow({
        rowId: "expiration",
        label: "Expiration",
        value: expiresAt,
        status: input.status === "expired" ? "expired" : "approval_required",
        detailLabels: [
          input.status === "expired"
            ? "Approval window elapsed."
            : "Approval window is present.",
        ],
      }),
    );
  }

  const localOnly = booleanField(preview, "localOnly", "local_only");
  if (localOnly !== undefined) {
    rows.push(
      statusRow({
        rowId: "local_only",
        label: "Evidence location",
        value: localOnly ? "Local only" : "External reference",
        status: localOnly ? "allowed" : "approval_required",
        detailLabels: [
          localOnly
            ? "Preview evidence is marked local-only."
            : "Preview evidence includes an external reference marker.",
        ],
      }),
    );
  }

  return rows.map(cloneStatusRow);
}

function buildResponseStatusRow(
  records: readonly ApiRecord[],
): McpApprovalEvidenceStatusRow | undefined {
  if (records.length === 0) {
    return undefined;
  }

  const errorCount = records.filter((record) => requestStatus(record) === "error").length;
  const successCount = records.filter((record) => requestStatus(record) === "allowed").length;
  const first = records[0];
  const status: McpApprovalEvidenceApiStatus =
    errorCount > 0 ? "error" : successCount > 0 ? "allowed" : "empty";

  return statusRow({
    rowId: "api_response",
    label: "API response",
    value:
      records.length === 1
        ? `${first.method} ${first.routePath}`
        : formatCount(records.length, "response"),
    status,
    detailLabels: [
      first.status === undefined ? undefined : `HTTP ${first.status}`,
      successCount > 0 ? formatCount(successCount, "successful response") : undefined,
      errorCount > 0 ? formatCount(errorCount, "failed response") : undefined,
    ].filter(isDefined),
  });
}

function statusRow(input: {
  rowId: string;
  label: string;
  value: string;
  status: McpApprovalEvidenceApiStatus;
  detailLabels: string[];
}): McpApprovalEvidenceStatusRow {
  return {
    id: `mcp_approval_evidence_status.${input.rowId}`,
    rowId: input.rowId,
    label: input.label,
    value: input.value,
    status: input.status,
    statusLabel: statusLabel(input.status),
    detailLabels: uniqueStrings(input.detailLabels),
    ariaLabel: [input.label, input.value, statusLabel(input.status)].join(", "),
  };
}

function buildGateRowsFromPreview(
  preview: AnyRecord | undefined,
): McpApprovalEvidenceGateRow[] {
  return gateRecords(preview)
    .map((gate, index) => buildGateRow(gate, index))
    .sort(compareGateRows)
    .map(cloneGateRow);
}

function gateRecords(preview: AnyRecord | undefined): AnyRecord[] {
  return [
    ...arrayField(preview, "gates", "gateRows", "gate_rows"),
    ...arrayField(preview, "approvalGates", "approval_gates"),
    ...arrayField(preview, "policyGates", "policy_gates"),
  ].filter(isRecord);
}

function buildGateRow(
  gate: AnyRecord,
  index: number,
): McpApprovalEvidenceGateRow {
  const gateId =
    stringField(gate, "gateId", "gate_id", "id", "ruleId", "rule_id") ??
    `gate_${index + 1}`;
  const label =
    stringField(gate, "label", "title", "name") ??
    titleCaseToken(gateId);
  const status =
    normalizeDecisionStatus(stringField(gate, "decision", "status", "state", "outcome")) ??
    (booleanField(gate, "required") ? "approval_required" : "allowed");
  const required = booleanField(gate, "required") ?? status === "approval_required";
  const ruleId = stringField(gate, "ruleId", "rule_id");
  const reason = stringField(gate, "reason", "message", "description");
  const detailLabels = [
    required ? "Required" : "Optional",
    ruleId ? `Rule ${ruleId}` : undefined,
    reason,
    timestampField(gate, "checkedAt", "checked_at", "updatedAt", "updated_at"),
  ].filter(isDefined);

  return {
    id: `mcp_approval_evidence_gate.${sanitizeIdentifier(gateId, `gate_${index + 1}`)}`,
    gateId,
    label,
    status,
    statusLabel: statusLabel(status),
    required,
    ruleId,
    reason,
    detailLabels: uniqueStrings(detailLabels),
    ariaLabel: [label, statusLabel(status), required ? "Required" : "Optional"].join(", "),
  };
}

function buildAuditReferenceRowsFromPreview(
  preview: AnyRecord | undefined,
): McpApprovalEvidenceAuditReferenceRow[] {
  return auditReferenceRecords(preview)
    .map((reference, index) => buildAuditReferenceRow(reference, index))
    .sort(compareAuditReferenceRows)
    .map(cloneAuditReferenceRow);
}

function auditReferenceRecords(preview: AnyRecord | undefined): AnyRecord[] {
  const audit = recordField(preview, "audit");
  return [
    ...arrayField(preview, "auditReferences", "audit_references", "auditRefs", "audit_refs"),
    ...arrayField(audit, "references", "events", "records"),
  ].filter(isRecord);
}

function buildAuditReferenceRow(
  reference: AnyRecord,
  index: number,
): McpApprovalEvidenceAuditReferenceRow {
  const referenceId =
    stringField(reference, "referenceId", "reference_id", "auditId", "audit_id", "eventId", "event_id", "id") ??
    `audit_ref_${index + 1}`;
  const kind = stringField(reference, "kind", "type", "category");
  const label =
    stringField(reference, "label", "title", "name") ??
    (kind === undefined ? `Audit reference ${index + 1}` : titleCaseToken(kind));
  const timestamp = timestampField(
    reference,
    "timestamp",
    "createdAt",
    "created_at",
    "eventAt",
    "event_at",
    "recordedAt",
    "recorded_at",
  );
  const routePath = stringField(reference, "routePath", "route_path", "path");
  const uri = stringField(reference, "uri", "url");
  const fingerprint = stringField(reference, "fingerprint", "sha256", "hash");
  const status: McpApprovalEvidenceAuditReferenceStatus =
    referenceId.trim() === "" && fingerprint === undefined ? "missing" : "available";
  const detailLabels = [
    kind,
    timestamp,
    routePath,
    uri,
    fingerprint ? `Fingerprint ${fingerprint}` : undefined,
  ].filter(isDefined);

  return {
    id: `mcp_approval_evidence_audit.${sanitizeIdentifier(referenceId, `audit_${index + 1}`)}`,
    referenceId,
    label,
    kind,
    status,
    statusLabel: auditReferenceStatusLabel(status),
    timestamp,
    routePath,
    uri,
    fingerprint,
    detailLabels: uniqueStrings(detailLabels),
    ariaLabel: [label, auditReferenceStatusLabel(status)].join(", "),
  };
}

function buildRedactionWarningRowsFromPreview(
  preview: AnyRecord | undefined,
): McpApprovalEvidenceRedactionWarningRow[] {
  return redactionWarningRecords(preview)
    .map((warning, index) => buildRedactionWarningRow(warning, index))
    .sort(compareRedactionWarningRows)
    .map(cloneRedactionWarningRow);
}

function redactionWarningRecords(preview: AnyRecord | undefined): AnyRecord[] {
  const redactionReport = recordField(preview, "redactionReport", "redaction_report");
  return [
    ...arrayField(preview, "redactionWarnings", "redaction_warnings"),
    ...arrayField(preview, "redactions"),
    ...arrayField(redactionReport, "warnings", "redactions"),
  ].filter(isRecord);
}

function buildRedactionWarningRow(
  warning: AnyRecord,
  index: number,
): McpApprovalEvidenceRedactionWarningRow {
  const warningId =
    stringField(warning, "warningId", "warning_id", "id") ??
    stringField(warning, "path", "jsonPath", "json_path", "field") ??
    `redaction_${index + 1}`;
  const path = stringField(warning, "path", "jsonPath", "json_path", "field");
  const reason =
    stringField(warning, "reason", "kind", "type", "message") ??
    "redacted";
  const severity = normalizeRedactionSeverity(
    stringField(warning, "severity", "status", "level"),
  );
  const replacementCount =
    integerField(warning, "replacementCount", "replacement_count", "replacements", "count") ??
    1;
  const label =
    stringField(warning, "label", "title") ??
    `${titleCaseToken(reason)} redaction`;
  const detailLabels = [
    path,
    reason,
    replacementCount > 0
      ? formatCount(replacementCount, "replacement")
      : "No replacements",
  ].filter(isDefined);

  return {
    id: `mcp_approval_evidence_redaction.${sanitizeIdentifier(warningId, `redaction_${index + 1}`)}`,
    warningId,
    label,
    severity,
    severityLabel: redactionSeverityLabel(severity),
    path,
    reason,
    replacementCount,
    detailLabels: uniqueStrings(detailLabels),
    ariaLabel: [label, redactionSeverityLabel(severity)].join(", "),
  };
}

function buildRecommendedActions(input: {
  status: McpApprovalEvidenceApiStatus;
  phase: McpApprovalEvidenceApiPhase;
  preview?: AnyRecord;
  gateRows: readonly McpApprovalEvidenceGateRow[];
  auditReferenceRows: readonly McpApprovalEvidenceAuditReferenceRow[];
  redactionWarningRows: readonly McpApprovalEvidenceRedactionWarningRow[];
  errorStates: readonly McpApprovalEvidenceApiErrorState[];
}): McpApprovalEvidenceRecommendedAction[] {
  const actions: McpApprovalEvidenceRecommendedAction[] = [];
  const hasPreview = input.preview !== undefined;

  if (input.phase === "loading") {
    actions.push(
      actionButton({
        id: "refresh_preview",
        label: "Refresh preview",
        intent: "secondary",
        enabled: false,
        section: "response",
        disabledReason: "Preview is still loading.",
      }),
    );
    return actions.map(cloneRecommendedAction);
  }

  if (input.phase === "error") {
    actions.push(
      actionButton({
        id: "retry_preview",
        label: "Retry preview",
        intent: "primary",
        enabled: true,
        section: "response",
      }),
      actionButton({
        id: "inspect_error",
        label: "Inspect error",
        intent: "secondary",
        enabled: input.errorStates.length > 0,
        section: "response",
        disabledReason:
          input.errorStates.length > 0 ? undefined : "No API error is available.",
      }),
    );
  } else if (input.status === "approval_required") {
    actions.push(
      actionButton({
        id: "approve_request",
        label: "Approve request",
        intent: "primary",
        enabled: hasPreview,
        section: "actions",
        disabledReason: hasPreview ? undefined : "No preview is ready.",
      }),
      actionButton({
        id: "deny_request",
        label: "Deny request",
        intent: "danger",
        enabled: hasPreview,
        section: "actions",
        disabledReason: hasPreview ? undefined : "No preview is ready.",
      }),
    );
  } else if (input.status === "allowed") {
    actions.push(
      actionButton({
        id: "continue_request",
        label: "Continue request",
        intent: "primary",
        enabled: hasPreview,
        section: "actions",
        disabledReason: hasPreview ? undefined : "No preview is ready.",
      }),
    );
  } else if (input.status === "denied") {
    actions.push(
      actionButton({
        id: "review_denial",
        label: "Review denial",
        intent: "primary",
        enabled: hasPreview,
        section: "status",
        disabledReason: hasPreview ? undefined : "No denial preview is ready.",
      }),
    );
  } else if (input.status === "expired") {
    actions.push(
      actionButton({
        id: "request_new_approval",
        label: "Request new approval",
        intent: "primary",
        enabled: hasPreview,
        section: "actions",
        disabledReason: hasPreview ? undefined : "No expired preview is ready.",
      }),
    );
  } else {
    actions.push(
      actionButton({
        id: "refresh_preview",
        label: "Refresh preview",
        intent: "primary",
        enabled: true,
        section: "response",
      }),
    );
  }

  actions.push(
    actionButton({
      id: "inspect_evidence",
      label: "Inspect evidence",
      intent: "secondary",
      enabled: hasPreview,
      section: "preview",
      disabledReason: hasPreview ? undefined : "No evidence preview is ready.",
    }),
    actionButton({
      id: "open_audit_references",
      label: "Open audit references",
      intent: "secondary",
      enabled: input.auditReferenceRows.length > 0,
      section: "audit",
      disabledReason:
        input.auditReferenceRows.length > 0
          ? undefined
          : "No audit references are available.",
    }),
    actionButton({
      id: "review_redaction_warnings",
      label: "Review redaction warnings",
      intent: input.redactionWarningRows.some((row) => row.severity === "blocked")
        ? "danger"
        : "secondary",
      enabled: input.redactionWarningRows.length > 0,
      section: "redactions",
      disabledReason:
        input.redactionWarningRows.length > 0
          ? undefined
          : "No redaction warnings are available.",
    }),
  );

  if (input.gateRows.length > 0) {
    actions.push(
      actionButton({
        id: "review_gates",
        label: "Review gates",
        intent: "secondary",
        enabled: true,
        section: "gates",
      }),
    );
  }

  return dedupeActions(actions).map(cloneRecommendedAction);
}

function actionButton(input: {
  id: string;
  label: string;
  intent: McpApprovalEvidenceActionIntent;
  enabled: boolean;
  section?: McpApprovalEvidenceApiContext;
  targetId?: string;
  disabledReason?: string;
}): McpApprovalEvidenceRecommendedAction {
  return {
    id: input.id,
    label: input.label,
    intent: input.intent,
    enabled: input.enabled,
    section: input.section,
    targetId: input.targetId,
    disabledReason: input.disabledReason,
    ariaLabel: [input.label, input.enabled ? "enabled" : "disabled"].join(", "),
  };
}

function buildReviewFromPreview(
  preview: AnyRecord,
): McpSafeReviewViewModel | undefined {
  const session = sessionFromPreview(preview);
  if (session === undefined) {
    return undefined;
  }

  return cloneReview(buildMcpSafeReview(session));
}

function sessionFromPreview(
  preview: AnyRecord,
): McpApprovalSessionSnapshot | undefined {
  const source =
    recordField(preview, "session", "approvalSession", "approval_session") ??
    preview;
  const request =
    recordField(source, "request") ??
    recordField(preview, "request");
  if (request === undefined) {
    return undefined;
  }

  const decision = normalizePreviewStatus(preview);
  const id =
    stringField(source, "id", "sessionId", "session_id", "approvalId", "approval_id") ??
    stringField(preview, "sessionId", "session_id", "approvalId", "approval_id") ??
    "mcp_approval_preview";
  const createdAt =
    timestampField(source, "createdAt", "created_at") ??
    timestampField(preview, "createdAt", "created_at", "generatedAt", "generated_at") ??
    DEFAULT_TIMESTAMP;
  const updatedAt =
    timestampField(source, "updatedAt", "updated_at") ??
    timestampField(preview, "updatedAt", "updated_at", "generatedAt", "generated_at") ??
    createdAt;
  const status = normalizeMcpSessionStatus(stringField(source, "status")) ??
    decisionToMcpSessionStatus(decision);
  const session: McpApprovalSessionSnapshot = {
    id,
    status,
    createdAt,
    updatedAt,
    expiresAt: timestampField(source, "expiresAt", "expires_at"),
    request: clonePlain(request),
    actor: actorFromRecord(recordField(source, "actor")),
    reason: stringField(source, "reason"),
    ruleId: stringField(source, "ruleId", "rule_id"),
    metadata: cloneOptionalRecord(recordField(source, "metadata")),
  };

  const decisionRecord = recordField(source, "decision");
  if (decisionRecord !== undefined) {
    session.decision = {
      status: decisionToMcpDecisionStatus(status),
      at:
        timestampField(decisionRecord, "at", "decidedAt", "decided_at") ??
        updatedAt,
      actor: actorFromRecord(recordField(decisionRecord, "actor")),
      reason: stringField(decisionRecord, "reason"),
      metadata: cloneOptionalRecord(recordField(decisionRecord, "metadata")),
    };
  }

  session.approvedAt = timestampField(source, "approvedAt", "approved_at");
  session.approvedBy = actorFromRecord(recordField(source, "approvedBy", "approved_by"));
  session.rejectedAt = timestampField(source, "rejectedAt", "rejected_at");
  session.rejectedBy = actorFromRecord(recordField(source, "rejectedBy", "rejected_by"));
  session.expiredAt = timestampField(source, "expiredAt", "expired_at");
  session.expiredBy = actorFromRecord(recordField(source, "expiredBy", "expired_by"));

  return session;
}

function normalizeMcpSessionStatus(
  value: string | undefined,
): McpApprovalSessionSnapshot["status"] | undefined {
  const decision = normalizeDecisionStatus(value);
  if (decision !== undefined) {
    return decisionToMcpSessionStatus(decision);
  }
  return undefined;
}

function decisionToMcpSessionStatus(
  status: McpApprovalEvidenceDecisionStatus,
): McpApprovalSessionSnapshot["status"] {
  switch (status) {
    case "allowed":
      return "approved";
    case "denied":
      return "rejected";
    case "approval_required":
      return "pending";
    case "expired":
      return "expired";
  }
}

function decisionToMcpDecisionStatus(
  status: McpApprovalSessionSnapshot["status"],
): "approved" | "rejected" | "expired" {
  if (status === "approved") {
    return "approved";
  }
  if (status === "expired") {
    return "expired";
  }
  return "rejected";
}

function rowsSummaryStatus(
  statuses: readonly McpApprovalEvidenceDecisionStatus[],
): McpApprovalEvidenceApiStatus {
  if (statuses.length === 0) {
    return "empty";
  }
  if (statuses.includes("denied")) {
    return "denied";
  }
  if (statuses.includes("expired")) {
    return "expired";
  }
  if (statuses.includes("approval_required")) {
    return "approval_required";
  }
  return "allowed";
}

function redactionSummaryStatus(
  rows: readonly McpApprovalEvidenceRedactionWarningRow[],
): McpApprovalEvidenceApiStatus {
  if (rows.length === 0) {
    return "allowed";
  }
  if (rows.some((row) => row.severity === "blocked")) {
    return "denied";
  }
  return "approval_required";
}

function gateSummaryLabels(
  rows: readonly McpApprovalEvidenceGateRow[],
): string[] {
  const labels: string[] = [];
  const requiredCount = rows.filter((row) => row.required).length;
  const deniedCount = rows.filter((row) => row.status === "denied").length;
  const pendingCount = rows.filter((row) => row.status === "approval_required").length;

  if (requiredCount > 0) {
    labels.push(formatCount(requiredCount, "required gate"));
  }
  if (deniedCount > 0) {
    labels.push(formatCount(deniedCount, "denied gate"));
  }
  if (pendingCount > 0) {
    labels.push(formatCount(pendingCount, "pending gate"));
  }
  return labels;
}

function collectErrorStates(
  records: readonly ApiRecord[],
): McpApprovalEvidenceApiErrorState[] {
  const errors: McpApprovalEvidenceApiErrorState[] = [];
  for (const record of records) {
    const error = record.error ?? responseStatusError(record);
    if (error === undefined) {
      continue;
    }
    errors.push(
      buildMcpApprovalEvidenceApiErrorState("response", error, {
        routeId: record.id,
        routePath: record.routePath,
        status: record.status,
      }),
    );
  }
  return errors;
}

function requestStatus(record: ApiRecord): McpApprovalEvidenceApiStatus {
  if (record.error !== undefined || (record.status !== undefined && record.status >= 400)) {
    return "error";
  }
  if (record.status !== undefined && record.status >= 200 && record.status < 300) {
    return "allowed";
  }
  if (record.responseBody !== undefined) {
    return "allowed";
  }
  return "empty";
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

function previewId(preview: AnyRecord | undefined): string | undefined {
  return stringField(preview, "previewId", "preview_id", "id", "evidenceId", "evidence_id");
}

function sessionIdFromPreview(preview: AnyRecord | undefined): string | undefined {
  const session = recordField(preview, "session", "approvalSession", "approval_session");
  return (
    stringField(preview, "sessionId", "session_id", "approvalId", "approval_id") ??
    stringField(session, "id", "sessionId", "session_id", "approvalId", "approval_id")
  );
}

function requestIdFromPreview(preview: AnyRecord | undefined): string | undefined {
  const request = recordField(preview, "request");
  return stringField(preview, "requestId", "request_id") ?? stringField(request, "id");
}

function decisionReasonFromPreview(preview: AnyRecord | undefined): string | undefined {
  return stringField(preview, "reason", "decisionReason", "decision_reason", "message");
}

function expiresAtFromPreview(preview: AnyRecord | undefined): string | undefined {
  const session = recordField(preview, "session", "approvalSession", "approval_session");
  return (
    timestampField(preview, "expiresAt", "expires_at") ??
    timestampField(session, "expiresAt", "expires_at")
  );
}

function normalizeRedactionSeverity(
  value: string | undefined,
): McpApprovalEvidenceRedactionSeverity {
  const token = normalizeToken(value);
  if (token === "blocked" || token === "error" || token === "denied") {
    return "blocked";
  }
  if (token === "info" || token === "notice") {
    return "info";
  }
  return "warning";
}

function statusLabel(status: McpApprovalEvidenceApiStatus): string {
  switch (status) {
    case "loading":
      return "Loading";
    case "allowed":
      return "Allowed";
    case "denied":
      return "Denied";
    case "approval_required":
      return "Approval required";
    case "expired":
      return "Expired";
    case "empty":
      return "Empty";
    case "error":
      return "Error";
  }
}

function auditReferenceStatusLabel(
  status: McpApprovalEvidenceAuditReferenceStatus,
): string {
  return status === "available" ? "Available" : "Missing";
}

function redactionSeverityLabel(
  severity: McpApprovalEvidenceRedactionSeverity,
): string {
  switch (severity) {
    case "info":
      return "Info";
    case "warning":
      return "Warning";
    case "blocked":
      return "Blocked";
  }
}

function errorLabel(context: McpApprovalEvidenceApiContext): string {
  switch (context) {
    case "request":
      return "MCP approval evidence request could not load";
    case "response":
      return "MCP approval evidence response could not load";
    case "preview":
      return "MCP approval evidence preview could not load";
    case "status":
      return "MCP approval evidence status could not load";
    case "gates":
      return "MCP approval gates could not load";
    case "audit":
      return "MCP approval audit references could not load";
    case "redactions":
      return "MCP approval redaction warnings could not load";
    case "actions":
      return "MCP approval evidence actions could not load";
  }
}

function retryLabel(context: McpApprovalEvidenceApiContext): string {
  switch (context) {
    case "request":
      return "Retry request";
    case "response":
      return "Retry response";
    case "preview":
      return "Retry preview";
    case "status":
      return "Retry status";
    case "gates":
      return "Retry gates";
    case "audit":
      return "Retry audit references";
    case "redactions":
      return "Retry redactions";
    case "actions":
      return "Retry actions";
  }
}

function defaultErrorDescription(context: McpApprovalEvidenceApiContext): string {
  switch (context) {
    case "request":
      return "Load a captured approval evidence request and try again.";
    case "response":
      return "Refresh the approval evidence preview response and try again.";
    case "preview":
      return "Refresh the approval evidence preview and try again.";
    case "status":
      return "Refresh the approval evidence status and try again.";
    case "gates":
      return "Refresh approval gate rows and try again.";
    case "audit":
      return "Refresh audit references and try again.";
    case "redactions":
      return "Refresh redaction warnings and try again.";
    case "actions":
      return "Refresh recommended actions and try again.";
  }
}

function compareGateRows(
  left: McpApprovalEvidenceGateRow,
  right: McpApprovalEvidenceGateRow,
): number {
  return (
    decisionStatusRank(left.status) - decisionStatusRank(right.status) ||
    Number(right.required) - Number(left.required) ||
    left.label.localeCompare(right.label) ||
    left.gateId.localeCompare(right.gateId)
  );
}

function compareAuditReferenceRows(
  left: McpApprovalEvidenceAuditReferenceRow,
  right: McpApprovalEvidenceAuditReferenceRow,
): number {
  return (
    (left.timestamp ?? "").localeCompare(right.timestamp ?? "") ||
    left.label.localeCompare(right.label) ||
    left.referenceId.localeCompare(right.referenceId)
  );
}

function compareRedactionWarningRows(
  left: McpApprovalEvidenceRedactionWarningRow,
  right: McpApprovalEvidenceRedactionWarningRow,
): number {
  return (
    redactionSeverityRank(left.severity) - redactionSeverityRank(right.severity) ||
    right.replacementCount - left.replacementCount ||
    left.label.localeCompare(right.label) ||
    left.warningId.localeCompare(right.warningId)
  );
}

function decisionStatusRank(status: McpApprovalEvidenceDecisionStatus): number {
  switch (status) {
    case "denied":
      return 0;
    case "expired":
      return 1;
    case "approval_required":
      return 2;
    case "allowed":
      return 3;
  }
}

function redactionSeverityRank(
  severity: McpApprovalEvidenceRedactionSeverity,
): number {
  switch (severity) {
    case "blocked":
      return 0;
    case "warning":
      return 1;
    case "info":
      return 2;
  }
}

function dedupeActions(
  actions: readonly McpApprovalEvidenceRecommendedAction[],
): McpApprovalEvidenceRecommendedAction[] {
  const seen = new Set<string>();
  const deduped: McpApprovalEvidenceRecommendedAction[] = [];
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
  errors: readonly McpApprovalEvidenceApiErrorState[],
): McpApprovalEvidenceApiErrorState[] {
  const seen = new Set<string>();
  const deduped: McpApprovalEvidenceApiErrorState[] = [];
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
  left: McpApprovalEvidenceApiErrorState,
  right: McpApprovalEvidenceApiErrorState,
): number {
  return (
    apiContextRank(left.context) - apiContextRank(right.context) ||
    (left.routePath ?? "").localeCompare(right.routePath ?? "") ||
    (left.routeId ?? "").localeCompare(right.routeId ?? "") ||
    left.errorState.description.localeCompare(right.errorState.description)
  );
}

function apiContextRank(context: McpApprovalEvidenceApiContext): number {
  switch (context) {
    case "request":
      return 0;
    case "response":
      return 1;
    case "preview":
      return 2;
    case "status":
      return 3;
    case "gates":
      return 4;
    case "audit":
      return 5;
    case "redactions":
      return 6;
    case "actions":
      return 7;
  }
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

function titleCaseToken(value: string): string {
  const words = value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);

  if (words.length === 0) {
    return "MCP approval";
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

function cloneApiState(
  state: McpApprovalEvidenceApiState,
): McpApprovalEvidenceApiState {
  return {
    ...state,
    review: state.review === undefined ? undefined : cloneReview(state.review),
    summaryCards: state.summaryCards.map(cloneSummaryCard),
    statusRows: state.statusRows.map(cloneStatusRow),
    gateRows: state.gateRows.map(cloneGateRow),
    auditReferenceRows: state.auditReferenceRows.map(cloneAuditReferenceRow),
    redactionWarningRows: state.redactionWarningRows.map(cloneRedactionWarningRow),
    recommendedActions: state.recommendedActions.map(cloneRecommendedAction),
    emptyStates: {
      summary: { ...state.emptyStates.summary },
      status: { ...state.emptyStates.status },
      gates: { ...state.emptyStates.gates },
      auditReferences: { ...state.emptyStates.auditReferences },
      redactionWarnings: { ...state.emptyStates.redactionWarnings },
      actions: { ...state.emptyStates.actions },
    },
    errorStates: state.errorStates.map(cloneApiErrorState),
  };
}

function cloneSummaryCard(
  card: McpApprovalEvidenceSummaryCard,
): McpApprovalEvidenceSummaryCard {
  return {
    ...card,
    detailLabels: [...card.detailLabels],
  };
}

function cloneStatusRow(
  row: McpApprovalEvidenceStatusRow,
): McpApprovalEvidenceStatusRow {
  return {
    ...row,
    detailLabels: [...row.detailLabels],
  };
}

function cloneGateRow(
  row: McpApprovalEvidenceGateRow,
): McpApprovalEvidenceGateRow {
  return {
    ...row,
    detailLabels: [...row.detailLabels],
  };
}

function cloneAuditReferenceRow(
  row: McpApprovalEvidenceAuditReferenceRow,
): McpApprovalEvidenceAuditReferenceRow {
  return {
    ...row,
    detailLabels: [...row.detailLabels],
  };
}

function cloneRedactionWarningRow(
  row: McpApprovalEvidenceRedactionWarningRow,
): McpApprovalEvidenceRedactionWarningRow {
  return {
    ...row,
    detailLabels: [...row.detailLabels],
  };
}

function cloneRecommendedAction(
  action: McpApprovalEvidenceRecommendedAction,
): McpApprovalEvidenceRecommendedAction {
  return { ...action };
}

function cloneApiErrorState(
  error: McpApprovalEvidenceApiErrorState,
): McpApprovalEvidenceApiErrorState {
  return {
    ...error,
    errorState: { ...error.errorState },
  };
}

function cloneReview(review: McpSafeReviewViewModel): McpSafeReviewViewModel {
  return {
    ...review,
    detailLabels: [...review.detailLabels],
    request: clonePlain(review.request),
  };
}

function actorFromRecord(
  value: AnyRecord | undefined,
): McpApprovalSessionActor | undefined {
  const id = stringField(value, "id");
  if (id === undefined) {
    return undefined;
  }

  const roles = arrayField(value, "roles").filter(
    (role): role is string => typeof role === "string" && role.trim() !== "",
  );
  return {
    id,
    roles: roles.length === 0 ? undefined : roles,
    metadata: cloneOptionalRecord(recordField(value, "metadata")),
  };
}

function cloneOptionalRecord<T extends AnyRecord>(
  value: T | undefined,
): T | undefined {
  return value === undefined ? undefined : clonePlain(value);
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
