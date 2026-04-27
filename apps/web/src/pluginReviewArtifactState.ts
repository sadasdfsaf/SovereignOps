import type {
  IngestSearchEmptyState,
  IngestSearchErrorState,
  IngestSearchViewStatus,
} from "./ingestSearch.ts";

export type PluginReviewArtifactContext =
  | "artifact"
  | "summary"
  | "gates"
  | "sandbox"
  | "audit"
  | "evidence"
  | "actions";

export type PluginReviewArtifactStatus = IngestSearchViewStatus;

export const PLUGIN_REVIEW_GATE_STATUSES = [
  "failed",
  "warning",
  "pending",
  "passed",
  "skipped",
] as const;

export type PluginReviewGateStatus =
  (typeof PLUGIN_REVIEW_GATE_STATUSES)[number];

export type PluginReviewSandboxFindingSeverity =
  | "blocking"
  | "warning"
  | "info";

export type PluginReviewActionIntent = "primary" | "secondary" | "danger";

export interface LocalPluginReviewArtifact {
  readonly id?: string;
  readonly artifactId?: string;
  readonly artifact_id?: string;
  readonly schemaVersion?: string;
  readonly schema_version?: string;
  readonly generatedAt?: string;
  readonly generated_at?: string;
  readonly pluginId?: string;
  readonly plugin_id?: string;
  readonly pluginName?: string;
  readonly plugin_name?: string;
  readonly pluginVersion?: string;
  readonly plugin_version?: string;
  readonly fingerprint?: string;
  readonly plugin?: Record<string, unknown>;
  readonly manifest?: Record<string, unknown>;
  readonly gates?: readonly unknown[];
  readonly sandbox?: unknown;
  readonly sandboxReviews?: readonly unknown[];
  readonly sandbox_reviews?: readonly unknown[];
  readonly audit?: unknown;
  readonly auditCounters?: readonly unknown[];
  readonly audit_counters?: readonly unknown[];
  readonly auditEvents?: readonly unknown[];
  readonly audit_events?: readonly unknown[];
  readonly localEvidence?: unknown;
  readonly local_evidence?: unknown;
  readonly evidence?: readonly unknown[];
  readonly actions?: readonly unknown[];
  readonly error?: unknown;
  readonly errors?: readonly unknown[];
}

export interface BuildPluginReviewArtifactStateOptions {
  defaultTimestamp?: string;
  error?: unknown;
  fallbackPluginName?: string;
}

export interface PluginReviewSummaryCard {
  id: string;
  title: string;
  valueLabel: string;
  status: PluginReviewArtifactStatus;
  statusLabel: string;
  detailLabels: string[];
  actionId?: string;
  ariaLabel: string;
}

export interface PluginReviewGateRow {
  id: string;
  gateId: string;
  label: string;
  status: PluginReviewGateStatus;
  statusLabel: string;
  required: boolean;
  detailLabels: string[];
  evidenceIds: string[];
  actionId: string;
  actionLabel: string;
  ariaLabel: string;
}

export interface PluginReviewSandboxFindingRow {
  id: string;
  findingId: string;
  reviewId?: string;
  pluginId?: string;
  runLabel?: string;
  category: string;
  title: string;
  severity: PluginReviewSandboxFindingSeverity;
  severityLabel: string;
  status: PluginReviewArtifactStatus;
  detailLabels: string[];
  evidenceIds: string[];
  actionId: "sandbox.inspect";
  actionLabel: string;
  ariaLabel: string;
}

export interface PluginReviewAuditCounter {
  id: string;
  key: string;
  label: string;
  count: number;
  status: PluginReviewArtifactStatus;
  statusLabel: string;
  lastEventAt?: string;
  pluginIds: string[];
  reviewIds: string[];
  detailLabels: string[];
  ariaLabel: string;
}

export interface PluginReviewLocalEvidenceRow {
  id: string;
  evidenceId: string;
  label: string;
  kind: string;
  status: PluginReviewArtifactStatus;
  statusLabel: string;
  path?: string;
  uri?: string;
  fingerprint?: string;
  byteCount?: number;
  recordCount?: number;
  detailLabels: string[];
  ariaLabel: string;
}

export interface PluginReviewActionButton {
  id: string;
  label: string;
  intent: PluginReviewActionIntent;
  enabled: boolean;
  section?: Exclude<PluginReviewArtifactContext, "artifact" | "summary">;
  targetId?: string;
  disabledReason?: string;
  ariaLabel: string;
}

export interface PluginReviewArtifactEmptyStates {
  summary: IngestSearchEmptyState;
  gates: IngestSearchEmptyState;
  sandbox: IngestSearchEmptyState;
  audit: IngestSearchEmptyState;
  evidence: IngestSearchEmptyState;
  actions: IngestSearchEmptyState;
}

export interface PluginReviewArtifactErrorState {
  id: string;
  context: PluginReviewArtifactContext;
  errorState: IngestSearchErrorState;
}

export interface PluginReviewArtifactViewModel {
  id: "plugin_review_artifact";
  artifactId?: string;
  schemaVersion?: string;
  pluginId?: string;
  pluginName: string;
  pluginVersion?: string;
  generatedAt: string;
  fingerprint?: string;
  status: PluginReviewArtifactStatus;
  statusLabel: string;
  headline: string;
  isEmpty: boolean;
  summaryCards: PluginReviewSummaryCard[];
  gateRows: PluginReviewGateRow[];
  sandboxFindingRows: PluginReviewSandboxFindingRow[];
  auditCounters: PluginReviewAuditCounter[];
  localEvidenceRows: PluginReviewLocalEvidenceRow[];
  actionButtons: PluginReviewActionButton[];
  emptyStates: PluginReviewArtifactEmptyStates;
  errorStates: PluginReviewArtifactErrorState[];
}

interface NormalizedArtifact {
  root?: AnyRecord;
  artifactId?: string;
  schemaVersion?: string;
  pluginId?: string;
  pluginName: string;
  pluginVersion?: string;
  generatedAt: string;
  fingerprint?: string;
  error?: string;
}

type AnyRecord = Record<string, unknown>;

interface AuditCounterDraft {
  key: string;
  label?: string;
  count: number;
  status: PluginReviewArtifactStatus;
  lastEventAt?: string;
  pluginIds: Set<string>;
  reviewIds: Set<string>;
}

const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";

export function buildPluginReviewArtifactState(
  input: LocalPluginReviewArtifact | unknown,
  options: BuildPluginReviewArtifactStateOptions = {},
): PluginReviewArtifactViewModel {
  const artifact = normalizeArtifact(
    input,
    options.defaultTimestamp,
    options.fallbackPluginName,
  );
  const root = artifact.root;
  const errorStates: PluginReviewArtifactErrorState[] = [];

  if (artifact.error !== undefined) {
    errorStates.push(buildPluginReviewArtifactErrorState("artifact", artifact.error));
  }
  for (const error of root ? arrayField(root, "errors") : []) {
    errorStates.push(buildPluginReviewArtifactErrorState("artifact", error));
  }
  if (options.error !== undefined) {
    errorStates.push(buildPluginReviewArtifactErrorState("artifact", options.error));
  }

  const gateRows = root ? buildPluginReviewGateRows(root) : [];
  const sandboxFindingRows = root ? buildPluginReviewSandboxFindingRows(root) : [];
  const auditCounters = root ? buildPluginReviewAuditCounters(root) : [];
  const localEvidenceRows = root ? buildPluginReviewLocalEvidenceRows(root) : [];
  const status = resolveArtifactStatus({
    hasRoot: root !== undefined,
    errorStates,
    gateRows,
    sandboxFindingRows,
    auditCounters,
    localEvidenceRows,
  });
  const actionButtons = root
    ? buildPluginReviewActionButtons(root, status)
    : [];
  const state: PluginReviewArtifactViewModel = {
    id: "plugin_review_artifact",
    generatedAt: artifact.generatedAt,
    pluginName: artifact.pluginName,
    status,
    statusLabel: statusLabel(status),
    headline: buildHeadline(artifact.pluginName, status),
    isEmpty: status === "empty",
    summaryCards: root
      ? buildSummaryCards(
          artifact,
          status,
          gateRows,
          sandboxFindingRows,
          auditCounters,
          localEvidenceRows,
        )
      : [],
    gateRows,
    sandboxFindingRows,
    auditCounters,
    localEvidenceRows,
    actionButtons,
    emptyStates: buildPluginReviewArtifactEmptyStates(),
    errorStates: errorStates.map(cloneErrorState),
  };

  if (artifact.artifactId !== undefined) {
    state.artifactId = artifact.artifactId;
  }
  if (artifact.schemaVersion !== undefined) {
    state.schemaVersion = artifact.schemaVersion;
  }
  if (artifact.pluginId !== undefined) {
    state.pluginId = artifact.pluginId;
  }
  if (artifact.pluginVersion !== undefined) {
    state.pluginVersion = artifact.pluginVersion;
  }
  if (artifact.fingerprint !== undefined) {
    state.fingerprint = artifact.fingerprint;
  }

  return cloneArtifactState(state);
}

export function buildPluginReviewSummaryCards(
  input: LocalPluginReviewArtifact | unknown,
): PluginReviewSummaryCard[] {
  const artifact = normalizeArtifact(input);
  if (!artifact.root) {
    return [];
  }

  const gateRows = buildPluginReviewGateRows(artifact.root);
  const sandboxFindingRows = buildPluginReviewSandboxFindingRows(artifact.root);
  const auditCounters = buildPluginReviewAuditCounters(artifact.root);
  const localEvidenceRows = buildPluginReviewLocalEvidenceRows(artifact.root);
  const status = resolveArtifactStatus({
    hasRoot: true,
    errorStates: artifact.error
      ? [buildPluginReviewArtifactErrorState("artifact", artifact.error)]
      : [],
    gateRows,
    sandboxFindingRows,
    auditCounters,
    localEvidenceRows,
  });

  return buildSummaryCards(
    artifact,
    status,
    gateRows,
    sandboxFindingRows,
    auditCounters,
    localEvidenceRows,
  ).map(cloneSummaryCard);
}

export function buildPluginReviewGateRows(
  input: LocalPluginReviewArtifact | unknown,
): PluginReviewGateRow[] {
  const root = clonePlain(input);
  if (!isRecord(root)) {
    return [];
  }

  return collectGateRecords(root)
    .map((gate, index) => buildGateRow(gate, index))
    .filter(isDefined)
    .sort(compareGateRows)
    .map(cloneGateRow);
}

export function buildPluginReviewSandboxFindingRows(
  input: LocalPluginReviewArtifact | unknown,
): PluginReviewSandboxFindingRow[] {
  const root = clonePlain(input);
  if (!isRecord(root)) {
    return [];
  }

  return [
    ...collectExplicitSandboxFindingRecords(root)
      .map((finding, index) => buildExplicitSandboxFindingRow(finding, index))
      .filter(isDefined),
    ...collectSandboxReviewRecords(root).flatMap((review, index) =>
      buildSandboxReviewFindingRows(review, index),
    ),
  ]
    .sort(compareSandboxFindingRows)
    .map(cloneSandboxFindingRow);
}

export function buildPluginReviewAuditCounters(
  input: LocalPluginReviewArtifact | unknown,
): PluginReviewAuditCounter[] {
  const root = clonePlain(input);
  if (!isRecord(root)) {
    return [];
  }

  const drafts = new Map<string, AuditCounterDraft>();

  for (const counter of collectAuditCounterRecords(root)) {
    mergeAuditCounter(drafts, counter);
  }
  for (const event of collectAuditEventRecords(root)) {
    mergeAuditEvent(drafts, event);
  }
  for (const review of collectSandboxReviewRecords(root)) {
    mergeSandboxReviewAudit(drafts, review);
  }

  return [...drafts.values()]
    .map(toAuditCounter)
    .sort(compareAuditCounters)
    .map(cloneAuditCounter);
}

export function buildPluginReviewLocalEvidenceRows(
  input: LocalPluginReviewArtifact | unknown,
): PluginReviewLocalEvidenceRow[] {
  const root = clonePlain(input);
  if (!isRecord(root)) {
    return [];
  }

  return collectLocalEvidenceRecords(root)
    .map((evidence, index) => buildLocalEvidenceRow(evidence, index))
    .filter(isDefined)
    .sort(compareLocalEvidenceRows)
    .map(cloneLocalEvidenceRow);
}

export function buildPluginReviewActionButtons(
  input: LocalPluginReviewArtifact | unknown,
  status?: PluginReviewArtifactStatus,
): PluginReviewActionButton[] {
  const root = clonePlain(input);
  if (!isRecord(root)) {
    return [];
  }

  const gateRows = buildPluginReviewGateRows(root);
  const sandboxFindingRows = buildPluginReviewSandboxFindingRows(root);
  const auditCounters = buildPluginReviewAuditCounters(root);
  const localEvidenceRows = buildPluginReviewLocalEvidenceRows(root);
  const resolvedStatus =
    status ??
    resolveArtifactStatus({
      hasRoot: true,
      errorStates: [],
      gateRows,
      sandboxFindingRows,
      auditCounters,
      localEvidenceRows,
    });

  return dedupeActions([
    ...collectActionRecords(root)
      .map((action, index) => buildExplicitActionButton(action, index))
      .filter(isDefined),
    ...buildDefaultActionButtons(
      resolvedStatus,
      gateRows,
      sandboxFindingRows,
      auditCounters,
      localEvidenceRows,
    ),
  ]).map(cloneActionButton);
}

export function buildPluginReviewArtifactEmptyState(
  context: Exclude<PluginReviewArtifactContext, "artifact">,
): IngestSearchEmptyState {
  switch (context) {
    case "summary":
      return {
        id: "plugin_review_summary_empty",
        label: "No review summary",
        description: "Load a local plugin review artifact to show summary cards.",
        ariaLabel: "No plugin review summary is available",
      };
    case "gates":
      return {
        id: "plugin_review_gates_empty",
        label: "No review gates",
        description: "Gate checks will appear when the artifact includes them.",
        ariaLabel: "No plugin review gates are available",
      };
    case "sandbox":
      return {
        id: "plugin_review_sandbox_empty",
        label: "No sandbox findings",
        description: "Sandbox findings will appear when a run needs attention.",
        ariaLabel: "No plugin sandbox findings are available",
      };
    case "audit":
      return {
        id: "plugin_review_audit_empty",
        label: "No audit counters",
        description: "Audit counts will appear when the artifact includes events.",
        ariaLabel: "No plugin review audit counters are available",
      };
    case "evidence":
      return {
        id: "plugin_review_evidence_empty",
        label: "No local evidence",
        description: "Local files and fingerprints will appear when provided.",
        ariaLabel: "No local plugin review evidence is available",
      };
    case "actions":
      return {
        id: "plugin_review_actions_empty",
        label: "No actions",
        description: "Review actions will appear after an artifact is loaded.",
        ariaLabel: "No plugin review actions are available",
      };
  }
}

export function buildPluginReviewArtifactErrorState(
  context: PluginReviewArtifactContext,
  error: unknown,
): PluginReviewArtifactErrorState {
  const description = errorMessage(error) ?? defaultErrorDescription(context);

  return {
    id: `plugin_review_${context}_error`,
    context,
    errorState: {
      id: `plugin_review_${context}_error`,
      label: errorLabel(context),
      description,
      ariaLabel: errorLabel(context),
      retryLabel: retryLabel(context),
    },
  };
}

function normalizeArtifact(
  input: unknown,
  defaultTimestamp?: string,
  fallbackPluginName?: string,
): NormalizedArtifact {
  const root = clonePlain(input);
  const fallbackTimestamp = normalizeTimestampOrDefault(defaultTimestamp);

  if (!isRecord(root)) {
    return {
      generatedAt: fallbackTimestamp,
      pluginName: fallbackPluginName ?? "Plugin review",
      error: "Plugin review artifact must be an object.",
    };
  }

  const plugin = recordField(root, "plugin") ?? recordField(root, "manifest");
  const pluginId =
    stringField(root, "pluginId", "plugin_id") ?? stringField(plugin, "id");
  const pluginName =
    stringField(root, "pluginName", "plugin_name") ??
    stringField(plugin, "name") ??
    pluginId ??
    fallbackPluginName ??
    "Plugin review";

  return {
    root,
    artifactId: stringField(root, "artifactId", "artifact_id", "id"),
    schemaVersion: stringField(root, "schemaVersion", "schema_version"),
    pluginId,
    pluginName,
    pluginVersion:
      stringField(root, "pluginVersion", "plugin_version") ??
      stringField(plugin, "version"),
    generatedAt: normalizeTimestampOrDefault(
      timestampField(root, "generatedAt", "generated_at", "createdAt", "created_at") ??
        fallbackTimestamp,
    ),
    fingerprint: stringField(root, "fingerprint", "artifactFingerprint", "artifact_fingerprint"),
    error: errorMessage(root.error),
  };
}

function buildSummaryCards(
  artifact: NormalizedArtifact,
  status: PluginReviewArtifactStatus,
  gateRows: readonly PluginReviewGateRow[],
  sandboxFindingRows: readonly PluginReviewSandboxFindingRow[],
  auditCounters: readonly PluginReviewAuditCounter[],
  localEvidenceRows: readonly PluginReviewLocalEvidenceRow[],
): PluginReviewSummaryCard[] {
  const failedGates = gateRows.filter((gate) => gate.status === "failed").length;
  const waitingGates = gateRows.filter(
    (gate) => gate.status === "warning" || gate.status === "pending",
  ).length;
  const blockingFindings = sandboxFindingRows.filter(
    (finding) => finding.severity === "blocking",
  ).length;
  const auditEventCount = auditCounters.reduce(
    (total, counter) => total + counter.count,
    0,
  );
  const evidenceAttentionCount = localEvidenceRows.filter(
    (row) => row.status === "attention" || row.status === "error",
  ).length;

  return [
    {
      id: "plugin_review_summary.plugin",
      title: artifact.pluginName,
      valueLabel: statusLabel(status),
      status,
      statusLabel: statusLabel(status),
      detailLabels: [
        artifact.pluginId ? `Plugin ${artifact.pluginId}` : "Plugin ID unavailable",
        artifact.pluginVersion
          ? `Version ${artifact.pluginVersion}`
          : "Version unavailable",
        `Generated at ${artifact.generatedAt}`,
        artifact.fingerprint
          ? `Fingerprint ${artifact.fingerprint}`
          : "Fingerprint unavailable",
      ],
      actionId: "continue_review",
      ariaLabel: [artifact.pluginName, statusLabel(status)].join(", "),
    },
    {
      id: "plugin_review_summary.gates",
      title: "Review gates",
      valueLabel: formatRatio(
        gateRows.filter((gate) => gate.status === "passed").length,
        gateRows.length,
        "passed",
      ),
      status: sectionStatus(
        gateRows.length,
        failedGates,
        waitingGates,
        gateRows.length > 0,
      ),
      statusLabel: statusLabel(
        sectionStatus(gateRows.length, failedGates, waitingGates, gateRows.length > 0),
      ),
      detailLabels: [
        formatCount(gateRows.length, "gate"),
        formatCount(failedGates, "failed gate"),
        formatCount(waitingGates, "gate needing review"),
      ],
      actionId: "review_gates",
      ariaLabel: [
        "Review gates",
        formatCount(gateRows.length, "gate"),
        formatCount(failedGates, "failed gate"),
      ].join(", "),
    },
    {
      id: "plugin_review_summary.sandbox",
      title: "Sandbox findings",
      valueLabel: formatCount(sandboxFindingRows.length, "finding"),
      status: sandboxSectionStatus(sandboxFindingRows),
      statusLabel: statusLabel(sandboxSectionStatus(sandboxFindingRows)),
      detailLabels: [
        formatCount(blockingFindings, "blocking finding"),
        formatCount(sandboxFindingRows.length - blockingFindings, "non-blocking finding"),
      ],
      actionId: "inspect_sandbox",
      ariaLabel: [
        "Sandbox findings",
        formatCount(sandboxFindingRows.length, "finding"),
        formatCount(blockingFindings, "blocking finding"),
      ].join(", "),
    },
    {
      id: "plugin_review_summary.audit",
      title: "Audit counters",
      valueLabel: formatCount(auditEventCount, "event"),
      status: auditCounters.length > 0 ? "complete" : "empty",
      statusLabel: statusLabel(auditCounters.length > 0 ? "complete" : "empty"),
      detailLabels: [
        formatCount(auditCounters.length, "counter"),
        formatCount(auditEventCount, "event"),
      ],
      actionId: "open_audit",
      ariaLabel: [
        "Audit counters",
        formatCount(auditCounters.length, "counter"),
        formatCount(auditEventCount, "event"),
      ].join(", "),
    },
    {
      id: "plugin_review_summary.evidence",
      title: "Local evidence",
      valueLabel: formatCount(localEvidenceRows.length, "item"),
      status: evidenceSectionStatus(localEvidenceRows),
      statusLabel: statusLabel(evidenceSectionStatus(localEvidenceRows)),
      detailLabels: [
        formatCount(localEvidenceRows.length, "item"),
        formatCount(evidenceAttentionCount, "item needing review"),
      ],
      actionId: "open_local_evidence",
      ariaLabel: [
        "Local evidence",
        formatCount(localEvidenceRows.length, "item"),
        formatCount(evidenceAttentionCount, "item needing review"),
      ].join(", "),
    },
  ].map(cloneSummaryCard);
}

function buildGateRow(
  gate: unknown,
  index: number,
): PluginReviewGateRow | undefined {
  if (!isRecord(gate)) {
    return undefined;
  }

  const gateId =
    stringField(gate, "gateId", "gate_id", "id", "key") ?? `gate_${index + 1}`;
  const label =
    stringField(gate, "label", "title", "name") ?? titleCaseToken(gateId);
  const status = normalizeGateStatus(gate);
  const detailLabels = uniqueStrings([
    ...stringArrayField(gate, "detailLabels", "detail_labels"),
    ...stringArrayField(gate, "details", "messages"),
    ...optionalStringList(
      stringField(gate, "description", "detail", "reason", "notes"),
    ),
  ]);
  const evidenceIds = uniqueStrings(
    stringArrayField(gate, "evidenceIds", "evidence_ids", "localEvidenceIds", "local_evidence_ids"),
  ).sort();
  const actionId = stringField(gate, "actionId", "action_id") ?? "gate.review";
  const actionLabel =
    stringField(gate, "actionLabel", "action_label") ?? gateActionLabel(status);
  const required = booleanField(gate, "required", "blocking") ?? status !== "skipped";

  return {
    id: `plugin_review_gate.${sanitizeIdentifier(gateId, `gate_${index + 1}`)}`,
    gateId,
    label,
    status,
    statusLabel: gateStatusLabel(status),
    required,
    detailLabels,
    evidenceIds,
    actionId,
    actionLabel,
    ariaLabel: [
      label,
      gateStatusLabel(status),
      required ? "required" : "optional",
      formatCount(evidenceIds.length, "evidence item"),
    ].join(", "),
  };
}

function buildExplicitSandboxFindingRow(
  finding: unknown,
  index: number,
): PluginReviewSandboxFindingRow | undefined {
  if (!isRecord(finding)) {
    return undefined;
  }

  const findingId =
    stringField(finding, "findingId", "finding_id", "id") ??
    `finding_${index + 1}`;
  const reviewId = stringField(finding, "reviewId", "review_id");
  const pluginId = stringField(finding, "pluginId", "plugin_id");
  const runLabel = stringField(finding, "runLabel", "run_label");
  const category = normalizeFailureCategory(
    stringField(finding, "category", "failureCategory", "failure_category"),
  );
  const severity = normalizeFindingSeverity(
    stringField(finding, "severity", "level", "status"),
    category,
  );
  const title =
    stringField(finding, "title", "label", "name") ?? findingTitle(category);
  const detailLabels = uniqueStrings([
    ...stringArrayField(finding, "detailLabels", "detail_labels"),
    ...stringArrayField(finding, "details", "messages"),
    ...optionalStringList(stringField(finding, "description", "detail", "reason")),
  ]);
  const evidenceIds = uniqueStrings(
    stringArrayField(finding, "evidenceIds", "evidence_ids", "localEvidenceIds", "local_evidence_ids"),
  ).sort();

  return {
    id: `plugin_review_sandbox_finding.${sanitizeIdentifier(
      findingId,
      `finding_${index + 1}`,
    )}`,
    findingId,
    reviewId,
    pluginId,
    runLabel,
    category,
    title,
    severity,
    severityLabel: findingSeverityLabel(severity),
    status: statusFromFindingSeverity(severity),
    detailLabels,
    evidenceIds,
    actionId: "sandbox.inspect",
    actionLabel: "Inspect sandbox",
    ariaLabel: [
      title,
      findingSeverityLabel(severity),
      reviewId ? `review ${reviewId}` : undefined,
    ]
      .filter(isDefined)
      .join(", "),
  };
}

function buildSandboxReviewFindingRows(
  review: unknown,
  index: number,
): PluginReviewSandboxFindingRow[] {
  if (!isRecord(review)) {
    return [];
  }

  const ok = booleanField(review, "ok", "passed", "success") ?? false;
  const reviewId =
    stringField(review, "reviewId", "review_id", "id") ??
    `sandbox_review_${index + 1}`;
  const pluginId = stringField(review, "pluginId", "plugin_id");
  const runLabel = stringField(review, "runLabel", "run_label");
  const fingerprint = stringField(review, "fingerprint");
  const failure = recordField(review, "failure");
  const failureCode = stringField(failure, "code");
  const categories = sandboxReviewCategories(review, ok);

  return categories
    .filter((category) => category !== "success")
    .map((category) => {
      const severity = ok ? "warning" : "blocking";
      const detailLabels = sandboxReviewDetails(review, category, {
        reviewId,
        runLabel,
        fingerprint,
        failureCode,
      });
      const findingId = `${reviewId}.${category}`;

      return {
        id: `plugin_review_sandbox_finding.${sanitizeIdentifier(
          findingId,
          `sandbox_${index + 1}`,
        )}`,
        findingId,
        reviewId,
        pluginId,
        runLabel,
        category,
        title: findingTitle(category),
        severity,
        severityLabel: findingSeverityLabel(severity),
        status: statusFromFindingSeverity(severity),
        detailLabels,
        evidenceIds: [],
        actionId: "sandbox.inspect" as const,
        actionLabel: "Inspect sandbox",
        ariaLabel: [
          findingTitle(category),
          findingSeverityLabel(severity),
          `review ${reviewId}`,
        ].join(", "),
      };
    });
}

function mergeAuditCounter(
  drafts: Map<string, AuditCounterDraft>,
  counter: unknown,
): void {
  if (!isRecord(counter)) {
    return;
  }

  const key = stringField(counter, "key", "type", "status", "id") ?? "events";
  const count = nonNegativeIntegerField(counter, "count", "total") ?? 1;
  const status = normalizeViewStatus(stringField(counter, "viewStatus", "view_status", "status"));
  mergeAuditDraft(drafts, key, {
    count,
    label: stringField(counter, "label", "title"),
    status,
    lastEventAt: timestampField(counter, "lastEventAt", "last_event_at", "at"),
    pluginId: stringField(counter, "pluginId", "plugin_id"),
    reviewId: stringField(counter, "reviewId", "review_id"),
  });
}

function mergeAuditEvent(
  drafts: Map<string, AuditCounterDraft>,
  event: unknown,
): void {
  if (!isRecord(event)) {
    return;
  }

  const key =
    stringField(event, "type", "eventType", "event_type", "status", "kind") ??
    "event";
  mergeAuditDraft(drafts, key, {
    count: 1,
    status: normalizeViewStatus(stringField(event, "viewStatus", "view_status", "status")),
    lastEventAt: timestampField(event, "at", "createdAt", "created_at", "timestamp"),
    pluginId: stringField(event, "pluginId", "plugin_id"),
    reviewId: stringField(event, "reviewId", "review_id"),
  });
}

function mergeSandboxReviewAudit(
  drafts: Map<string, AuditCounterDraft>,
  review: unknown,
): void {
  if (!isRecord(review)) {
    return;
  }

  const audit = recordField(review, "audit");
  if (!audit) {
    return;
  }

  const reviewId = stringField(review, "reviewId", "review_id", "id");
  const pluginId = stringField(review, "pluginId", "plugin_id");
  const ok = booleanField(review, "ok", "passed", "success") ?? false;
  const status: PluginReviewArtifactStatus = ok ? "complete" : "attention";
  const byType = arrayField(audit, "byType", "by_type");

  if (byType.length === 0) {
    const total = nonNegativeIntegerField(audit, "total");
    if (total !== undefined && total > 0) {
      mergeAuditDraft(drafts, "sandbox.audit", {
        count: total,
        status,
        pluginId,
        reviewId,
      });
    }
    return;
  }

  for (const counter of byType) {
    if (!isRecord(counter)) {
      continue;
    }
    const type = stringField(counter, "type", "key", "id") ?? "audit";
    mergeAuditDraft(drafts, `sandbox.${type}`, {
      count: nonNegativeIntegerField(counter, "count", "total") ?? 1,
      status,
      pluginId,
      reviewId,
    });
  }
}

function mergeAuditDraft(
  drafts: Map<string, AuditCounterDraft>,
  key: string,
  next: {
    count: number;
    label?: string;
    status: PluginReviewArtifactStatus;
    lastEventAt?: string;
    pluginId?: string;
    reviewId?: string;
  },
): void {
  const normalizedKey = normalizeCounterKey(key);
  const draft =
    drafts.get(normalizedKey) ??
    {
      key: normalizedKey,
      count: 0,
      status: next.status,
      pluginIds: new Set<string>(),
      reviewIds: new Set<string>(),
    };

  draft.count += next.count;
  draft.status = strongerViewStatus(draft.status, next.status);
  if (next.label !== undefined) {
    draft.label = next.label;
  }
  if (
    next.lastEventAt !== undefined &&
    (draft.lastEventAt === undefined ||
      compareTimestamps(next.lastEventAt, draft.lastEventAt) > 0)
  ) {
    draft.lastEventAt = next.lastEventAt;
  }
  if (next.pluginId !== undefined) {
    draft.pluginIds.add(next.pluginId);
  }
  if (next.reviewId !== undefined) {
    draft.reviewIds.add(next.reviewId);
  }

  drafts.set(normalizedKey, draft);
}

function toAuditCounter(draft: AuditCounterDraft): PluginReviewAuditCounter {
  const pluginIds = [...draft.pluginIds].sort();
  const reviewIds = [...draft.reviewIds].sort();
  const detailLabels = [
    formatCount(draft.count, "event"),
    ...optionalStringList(draft.lastEventAt ? `Last event at ${draft.lastEventAt}` : undefined),
    ...optionalStringList(pluginIds.length > 0 ? formatCount(pluginIds.length, "plugin") : undefined),
    ...optionalStringList(reviewIds.length > 0 ? formatCount(reviewIds.length, "sandbox review") : undefined),
  ];

  return {
    id: `plugin_review_audit.${sanitizeIdentifier(draft.key, "events")}`,
    key: draft.key,
    label: draft.label ?? `${titleCaseToken(draft.key)} events`,
    count: draft.count,
    status: draft.status,
    statusLabel: statusLabel(draft.status),
    lastEventAt: draft.lastEventAt,
    pluginIds,
    reviewIds,
    detailLabels,
    ariaLabel: [
      draft.label ?? `${titleCaseToken(draft.key)} events`,
      formatCount(draft.count, "event"),
      statusLabel(draft.status),
    ].join(", "),
  };
}

function buildLocalEvidenceRow(
  evidence: unknown,
  index: number,
): PluginReviewLocalEvidenceRow | undefined {
  if (!isRecord(evidence)) {
    return undefined;
  }

  const path = stringField(evidence, "path", "filePath", "file_path");
  const uri = stringField(evidence, "uri", "url", "sourceUri", "source_uri");
  const evidenceId =
    stringField(evidence, "evidenceId", "evidence_id", "id", "fileId", "file_id") ??
    path ??
    uri ??
    `evidence_${index + 1}`;
  const kind = stringField(evidence, "kind", "type", "format") ?? "file";
  const fingerprint = stringField(evidence, "fingerprint", "checksum", "hash");
  const status = localEvidenceStatus(evidence, path, uri, fingerprint);
  const byteCount = nonNegativeIntegerField(evidence, "byteCount", "byte_count", "bytes");
  const recordCount = nonNegativeIntegerField(
    evidence,
    "recordCount",
    "record_count",
    "records",
  );
  const detailLabels = uniqueStrings([
    kind,
    ...optionalStringList(path ? `Path ${path}` : undefined),
    ...optionalStringList(uri ? `URI ${uri}` : undefined),
    ...optionalStringList(fingerprint ? `Fingerprint ${fingerprint}` : undefined),
    ...optionalStringList(byteCount !== undefined ? formatBytes(byteCount) : undefined),
    ...optionalStringList(
      recordCount !== undefined ? formatCount(recordCount, "record") : undefined,
    ),
    ...stringArrayField(evidence, "detailLabels", "detail_labels", "details"),
  ]);

  return {
    id: `plugin_review_evidence.${sanitizeIdentifier(
      evidenceId,
      `evidence_${index + 1}`,
    )}`,
    evidenceId,
    label:
      stringField(evidence, "label", "title", "name") ??
      path ??
      uri ??
      titleCaseToken(kind),
    kind,
    status,
    statusLabel: statusLabel(status),
    path,
    uri,
    fingerprint,
    byteCount,
    recordCount,
    detailLabels,
    ariaLabel: [
      stringField(evidence, "label", "title", "name") ??
        path ??
        uri ??
        titleCaseToken(kind),
      titleCaseToken(kind),
      statusLabel(status),
    ].join(", "),
  };
}

function buildExplicitActionButton(
  action: unknown,
  index: number,
): PluginReviewActionButton | undefined {
  if (!isRecord(action)) {
    return undefined;
  }

  const id =
    stringField(action, "actionId", "action_id", "id") ?? `action_${index + 1}`;
  const label = stringField(action, "label", "title", "name") ?? titleCaseToken(id);
  const enabled = booleanField(action, "enabled") ?? true;
  const section = normalizeActionSection(stringField(action, "section", "context"));
  const disabledReason = stringField(action, "disabledReason", "disabled_reason");

  return {
    id,
    label,
    intent: normalizeActionIntent(stringField(action, "intent", "tone")),
    enabled,
    section,
    targetId: stringField(action, "targetId", "target_id"),
    disabledReason: enabled ? undefined : disabledReason,
    ariaLabel: [label, enabled ? "enabled" : "disabled"].join(", "),
  };
}

function buildDefaultActionButtons(
  status: PluginReviewArtifactStatus,
  gateRows: readonly PluginReviewGateRow[],
  sandboxFindingRows: readonly PluginReviewSandboxFindingRow[],
  auditCounters: readonly PluginReviewAuditCounter[],
  localEvidenceRows: readonly PluginReviewLocalEvidenceRow[],
): PluginReviewActionButton[] {
  const gateNeedsReview = gateRows.some(
    (gate) => gate.status === "failed" || gate.status === "warning" || gate.status === "pending",
  );
  const hasSandboxFindings = sandboxFindingRows.length > 0;
  const canContinue = status === "complete" || status === "ready";

  return [
    {
      id: "continue_review",
      label: "Continue review",
      intent: "primary",
      enabled: canContinue,
      disabledReason: canContinue
        ? undefined
        : continueDisabledReason(status, gateNeedsReview, hasSandboxFindings),
      ariaLabel: ["Continue review", canContinue ? "enabled" : "disabled"].join(", "),
    },
    {
      id: "review_gates",
      label: "Review gates",
      intent: "secondary",
      enabled: gateRows.length > 0,
      section: "gates",
      disabledReason:
        gateRows.length > 0 ? undefined : "No review gates are available.",
      ariaLabel: [
        "Review gates",
        gateRows.length > 0 ? "enabled" : "disabled",
      ].join(", "),
    },
    {
      id: "inspect_sandbox",
      label: "Inspect sandbox",
      intent: hasSandboxFindings ? "danger" : "secondary",
      enabled: hasSandboxFindings,
      section: "sandbox",
      disabledReason: hasSandboxFindings
        ? undefined
        : "No sandbox findings are available.",
      ariaLabel: [
        "Inspect sandbox",
        hasSandboxFindings ? "enabled" : "disabled",
      ].join(", "),
    },
    {
      id: "open_audit",
      label: "Open audit",
      intent: "secondary",
      enabled: auditCounters.length > 0,
      section: "audit",
      disabledReason:
        auditCounters.length > 0 ? undefined : "No audit counters are available.",
      ariaLabel: [
        "Open audit",
        auditCounters.length > 0 ? "enabled" : "disabled",
      ].join(", "),
    },
    {
      id: "open_local_evidence",
      label: "Open local evidence",
      intent: "secondary",
      enabled: localEvidenceRows.length > 0,
      section: "evidence",
      disabledReason:
        localEvidenceRows.length > 0
          ? undefined
          : "No local evidence is available.",
      ariaLabel: [
        "Open local evidence",
        localEvidenceRows.length > 0 ? "enabled" : "disabled",
      ].join(", "),
    },
  ];
}

function resolveArtifactStatus(input: {
  hasRoot: boolean;
  errorStates: readonly PluginReviewArtifactErrorState[];
  gateRows: readonly PluginReviewGateRow[];
  sandboxFindingRows: readonly PluginReviewSandboxFindingRow[];
  auditCounters: readonly PluginReviewAuditCounter[];
  localEvidenceRows: readonly PluginReviewLocalEvidenceRow[];
}): PluginReviewArtifactStatus {
  if (!input.hasRoot || input.errorStates.length > 0) {
    return "error";
  }
  if (
    input.gateRows.length === 0 &&
    input.sandboxFindingRows.length === 0 &&
    input.auditCounters.length === 0 &&
    input.localEvidenceRows.length === 0
  ) {
    return "empty";
  }
  if (
    input.gateRows.some((gate) => gate.status === "failed") ||
    input.sandboxFindingRows.some((finding) => finding.severity === "blocking") ||
    input.localEvidenceRows.some((row) => row.status === "error")
  ) {
    return "error";
  }
  if (
    input.gateRows.some(
      (gate) => gate.status === "warning" || gate.status === "pending",
    ) ||
    input.sandboxFindingRows.some((finding) => finding.severity === "warning") ||
    input.localEvidenceRows.some((row) => row.status === "attention")
  ) {
    return "attention";
  }
  return "complete";
}

function collectGateRecords(root: AnyRecord): unknown[] {
  const review = recordField(root, "review");
  return [
    ...arrayField(root, "gates", "gateRows", "gate_rows", "reviewGates", "review_gates"),
    ...arrayField(review, "gates", "gateRows", "gate_rows"),
  ];
}

function collectSandboxReviewRecords(root: AnyRecord): unknown[] {
  const sandbox = recordField(root, "sandbox", "sandboxReview", "sandbox_review");
  const reviews = [
    ...arrayField(root, "sandboxReviews", "sandbox_reviews"),
    ...arrayField(sandbox, "reviews", "summaries"),
  ];

  if (isSandboxReviewLike(root)) {
    reviews.push(root);
  }
  if (isSandboxReviewLike(sandbox)) {
    reviews.push(sandbox);
  }

  return reviews;
}

function collectExplicitSandboxFindingRecords(root: AnyRecord): unknown[] {
  const sandbox = recordField(root, "sandbox");
  return [
    ...arrayField(root, "sandboxFindings", "sandbox_findings"),
    ...arrayField(sandbox, "findings", "findingRows", "finding_rows"),
  ];
}

function collectAuditCounterRecords(root: AnyRecord): unknown[] {
  const audit = recordField(root, "audit", "auditSummary", "audit_summary");
  return [
    ...arrayField(root, "auditCounters", "audit_counters"),
    ...arrayField(audit, "counters", "summaries", "byType", "by_type"),
  ];
}

function collectAuditEventRecords(root: AnyRecord): unknown[] {
  const audit = recordField(root, "audit", "auditSummary", "audit_summary");
  return [
    ...arrayField(root, "auditEvents", "audit_events", "events"),
    ...arrayField(audit, "events"),
  ];
}

function collectLocalEvidenceRecords(root: AnyRecord): unknown[] {
  const localEvidence = recordField(root, "localEvidence", "local_evidence");
  return [
    ...arrayField(root, "localEvidence", "local_evidence", "evidence", "evidenceRows", "evidence_rows"),
    ...arrayField(localEvidence, "rows", "items", "files", "evidence"),
  ];
}

function collectActionRecords(root: AnyRecord): unknown[] {
  return arrayField(root, "actions", "actionButtons", "action_buttons");
}

function normalizeGateStatus(gate: AnyRecord): PluginReviewGateStatus {
  const value = normalizeToken(stringField(gate, "status", "outcome", "state"));
  if (
    value === "pass" ||
    value === "passed" ||
    value === "ok" ||
    value === "success" ||
    value === "complete" ||
    value === "ready"
  ) {
    return "passed";
  }
  if (
    value === "warn" ||
    value === "warning" ||
    value === "attention" ||
    value === "needs_review" ||
    value === "needs_attention"
  ) {
    return "warning";
  }
  if (
    value === "fail" ||
    value === "failed" ||
    value === "error" ||
    value === "blocked" ||
    value === "missing"
  ) {
    return "failed";
  }
  if (value === "skip" || value === "skipped" || value === "disabled") {
    return "skipped";
  }
  if (value === "pending" || value === "queued" || value === "waiting") {
    return "pending";
  }

  const passed = booleanField(gate, "passed", "ok", "success");
  if (passed === true) {
    return "passed";
  }
  if (passed === false) {
    return "failed";
  }

  return "pending";
}

function normalizeFailureCategory(value: string | undefined): string {
  const normalized = normalizeToken(value);
  if (normalized === "hostapi" || normalized === "host_api") {
    return "host_api";
  }
  if (
    normalized === "capability" ||
    normalized === "resource" ||
    normalized === "audit" ||
    normalized === "async" ||
    normalized === "invalid" ||
    normalized === "plugin" ||
    normalized === "success"
  ) {
    return normalized;
  }
  return normalized === "" ? "plugin" : normalized;
}

function normalizeFindingSeverity(
  value: string | undefined,
  category: string,
): PluginReviewSandboxFindingSeverity {
  const normalized = normalizeToken(value);
  if (normalized === "info" || normalized === "passed" || normalized === "success") {
    return "info";
  }
  if (
    normalized === "warning" ||
    normalized === "warn" ||
    normalized === "attention"
  ) {
    return "warning";
  }
  if (
    normalized === "blocking" ||
    normalized === "blocked" ||
    normalized === "failed" ||
    normalized === "error"
  ) {
    return "blocking";
  }
  return category === "success" ? "info" : "blocking";
}

function sandboxReviewCategories(
  review: AnyRecord,
  ok: boolean,
): string[] {
  const categories = uniqueStrings(
    stringArrayField(review, "failureCategories", "failure_categories").map(
      normalizeFailureCategory,
    ),
  );
  const failure = recordField(review, "failure");
  const failureCategory = normalizeFailureCategory(stringField(failure, "category"));
  if (failure && failureCategory !== "plugin") {
    categories.push(failureCategory);
  }
  if (categories.length === 0) {
    categories.push(ok ? "success" : failureCategory);
  }

  return uniqueStrings(categories).sort(compareFailureCategories);
}

function sandboxReviewDetails(
  review: AnyRecord,
  category: string,
  base: {
    reviewId: string;
    runLabel?: string;
    fingerprint?: string;
    failureCode?: string;
  },
): string[] {
  const capabilities = recordField(review, "capabilities");
  const hostApis = recordField(review, "hostApis", "host_apis");
  const limits = recordField(review, "limits");
  const audit = recordField(review, "audit");
  const details = [
    `Review ${base.reviewId}`,
    ...optionalStringList(base.runLabel ? `Run ${base.runLabel}` : undefined),
    ...optionalStringList(
      base.fingerprint ? `Fingerprint ${base.fingerprint}` : undefined,
    ),
    ...optionalStringList(base.failureCode ? `Failure ${base.failureCode}` : undefined),
  ];

  if (category === "capability") {
    details.push(
      formatList(
        stringArrayField(capabilities, "missing"),
        "Missing capability",
        "Missing capabilities",
      ),
    );
  }
  if (category === "host_api") {
    details.push(
      formatList(
        stringArrayField(hostApis, "deniedObserved", "denied_observed"),
        "Denied host API",
        "Denied host APIs",
      ),
    );
  }
  if (category === "resource") {
    const ticksUsed = nonNegativeIntegerField(limits, "ticksUsed", "ticks_used");
    const maxTicks = nonNegativeIntegerField(limits, "maxTicks", "max_ticks");
    if (ticksUsed !== undefined && maxTicks !== undefined) {
      details.push(`Ticks ${ticksUsed}/${maxTicks}`);
    }
  }
  if (category === "audit") {
    const total = nonNegativeIntegerField(audit, "total");
    const maxAuditEvents = nonNegativeIntegerField(limits, "maxAuditEvents", "max_audit_events");
    if (total !== undefined && maxAuditEvents !== undefined) {
      details.push(`Audit events ${total}/${maxAuditEvents}`);
    }
  }

  return uniqueStrings(details);
}

function localEvidenceStatus(
  evidence: AnyRecord,
  path: string | undefined,
  uri: string | undefined,
  fingerprint: string | undefined,
): PluginReviewArtifactStatus {
  const explicit = normalizeViewStatus(
    stringField(evidence, "viewStatus", "view_status", "status"),
  );
  if (explicit !== "ready") {
    return explicit;
  }
  if (uri !== undefined && !isLocalReference(uri)) {
    return "attention";
  }
  if (path === undefined && uri === undefined) {
    return "attention";
  }
  if (fingerprint === undefined) {
    return "attention";
  }
  return "complete";
}

function isSandboxReviewLike(value: unknown): value is AnyRecord {
  if (!isRecord(value)) {
    return false;
  }

  return (
    stringField(value, "reviewId", "review_id") !== undefined ||
    recordField(value, "capabilities") !== undefined ||
    recordField(value, "hostApis", "host_apis") !== undefined ||
    recordField(value, "limits") !== undefined ||
    (recordField(value, "audit") !== undefined &&
      booleanField(value, "ok", "passed", "success") !== undefined)
  );
}

function buildPluginReviewArtifactEmptyStates(): PluginReviewArtifactEmptyStates {
  return {
    summary: buildPluginReviewArtifactEmptyState("summary"),
    gates: buildPluginReviewArtifactEmptyState("gates"),
    sandbox: buildPluginReviewArtifactEmptyState("sandbox"),
    audit: buildPluginReviewArtifactEmptyState("audit"),
    evidence: buildPluginReviewArtifactEmptyState("evidence"),
    actions: buildPluginReviewArtifactEmptyState("actions"),
  };
}

function sectionStatus(
  total: number,
  failures: number,
  warnings: number,
  completeWhenPresent: boolean,
): PluginReviewArtifactStatus {
  if (total === 0) {
    return "empty";
  }
  if (failures > 0) {
    return "error";
  }
  if (warnings > 0) {
    return "attention";
  }
  return completeWhenPresent ? "complete" : "ready";
}

function sandboxSectionStatus(
  rows: readonly PluginReviewSandboxFindingRow[],
): PluginReviewArtifactStatus {
  if (rows.length === 0) {
    return "complete";
  }
  if (rows.some((row) => row.severity === "blocking")) {
    return "error";
  }
  if (rows.some((row) => row.severity === "warning")) {
    return "attention";
  }
  return "ready";
}

function evidenceSectionStatus(
  rows: readonly PluginReviewLocalEvidenceRow[],
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

function statusFromFindingSeverity(
  severity: PluginReviewSandboxFindingSeverity,
): PluginReviewArtifactStatus {
  if (severity === "blocking") {
    return "error";
  }
  if (severity === "warning") {
    return "attention";
  }
  return "ready";
}

function normalizeViewStatus(
  value: string | undefined,
): PluginReviewArtifactStatus {
  const normalized = normalizeToken(value);
  if (normalized === "empty") {
    return "empty";
  }
  if (normalized === "indexing" || normalized === "running") {
    return "indexing";
  }
  if (
    normalized === "attention" ||
    normalized === "warning" ||
    normalized === "warn" ||
    normalized === "needs_review"
  ) {
    return "attention";
  }
  if (
    normalized === "error" ||
    normalized === "failed" ||
    normalized === "failure" ||
    normalized === "blocked"
  ) {
    return "error";
  }
  if (
    normalized === "complete" ||
    normalized === "done" ||
    normalized === "passed" ||
    normalized === "success"
  ) {
    return "complete";
  }
  return "ready";
}

function strongerViewStatus(
  left: PluginReviewArtifactStatus,
  right: PluginReviewArtifactStatus,
): PluginReviewArtifactStatus {
  return viewStatusRank(right) < viewStatusRank(left) ? right : left;
}

function viewStatusRank(status: PluginReviewArtifactStatus): number {
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

function compareGateRows(
  left: PluginReviewGateRow,
  right: PluginReviewGateRow,
): number {
  return (
    gateStatusRank(left.status) - gateStatusRank(right.status) ||
    left.label.localeCompare(right.label) ||
    left.gateId.localeCompare(right.gateId)
  );
}

function compareSandboxFindingRows(
  left: PluginReviewSandboxFindingRow,
  right: PluginReviewSandboxFindingRow,
): number {
  return (
    findingSeverityRank(left.severity) - findingSeverityRank(right.severity) ||
    failureCategoryRank(left.category) - failureCategoryRank(right.category) ||
    left.title.localeCompare(right.title) ||
    left.findingId.localeCompare(right.findingId)
  );
}

function compareAuditCounters(
  left: PluginReviewAuditCounter,
  right: PluginReviewAuditCounter,
): number {
  return (
    viewStatusRank(left.status) - viewStatusRank(right.status) ||
    right.count - left.count ||
    left.label.localeCompare(right.label) ||
    left.key.localeCompare(right.key)
  );
}

function compareLocalEvidenceRows(
  left: PluginReviewLocalEvidenceRow,
  right: PluginReviewLocalEvidenceRow,
): number {
  return (
    viewStatusRank(left.status) - viewStatusRank(right.status) ||
    left.kind.localeCompare(right.kind) ||
    left.label.localeCompare(right.label) ||
    left.evidenceId.localeCompare(right.evidenceId)
  );
}

function compareFailureCategories(left: string, right: string): number {
  return failureCategoryRank(left) - failureCategoryRank(right) || left.localeCompare(right);
}

function gateStatusRank(status: PluginReviewGateStatus): number {
  switch (status) {
    case "failed":
      return 0;
    case "warning":
      return 1;
    case "pending":
      return 2;
    case "passed":
      return 3;
    case "skipped":
      return 4;
  }
}

function findingSeverityRank(
  severity: PluginReviewSandboxFindingSeverity,
): number {
  switch (severity) {
    case "blocking":
      return 0;
    case "warning":
      return 1;
    case "info":
      return 2;
  }
}

function failureCategoryRank(category: string): number {
  switch (category) {
    case "capability":
      return 0;
    case "host_api":
      return 1;
    case "resource":
      return 2;
    case "audit":
      return 3;
    case "async":
      return 4;
    case "invalid":
      return 5;
    case "plugin":
      return 6;
    case "success":
      return 7;
    default:
      return 20;
  }
}

function gateStatusLabel(status: PluginReviewGateStatus): string {
  switch (status) {
    case "failed":
      return "Failed";
    case "warning":
      return "Needs review";
    case "pending":
      return "Pending";
    case "passed":
      return "Passed";
    case "skipped":
      return "Skipped";
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

function findingSeverityLabel(
  severity: PluginReviewSandboxFindingSeverity,
): string {
  switch (severity) {
    case "blocking":
      return "Blocking";
    case "warning":
      return "Warning";
    case "info":
      return "Info";
  }
}

function findingTitle(category: string): string {
  switch (category) {
    case "capability":
      return "Capability check failed";
    case "host_api":
      return "Host API access denied";
    case "resource":
      return "Resource limit reached";
    case "audit":
      return "Audit limit reached";
    case "async":
      return "Async access denied";
    case "invalid":
      return "Invalid sandbox call";
    case "plugin":
      return "Plugin run failed";
    case "success":
      return "Sandbox passed";
    default:
      return titleCaseToken(category);
  }
}

function gateActionLabel(status: PluginReviewGateStatus): string {
  if (status === "failed" || status === "warning" || status === "pending") {
    return "Review gate";
  }
  return "Open gate";
}

function buildHeadline(
  pluginName: string,
  status: PluginReviewArtifactStatus,
): string {
  if (status === "complete" || status === "ready") {
    return `${pluginName} review is ready`;
  }
  if (status === "attention") {
    return `${pluginName} review needs attention`;
  }
  if (status === "error") {
    return `${pluginName} review has issues`;
  }
  return `${pluginName} review is empty`;
}

function continueDisabledReason(
  status: PluginReviewArtifactStatus,
  gateNeedsReview: boolean,
  hasSandboxFindings: boolean,
): string {
  if (status === "empty") {
    return "Load a plugin review artifact first.";
  }
  if (status === "error" && hasSandboxFindings) {
    return "Sandbox findings need review first.";
  }
  if (status === "error" && gateNeedsReview) {
    return "Review gates need attention first.";
  }
  if (status === "attention") {
    return "Items needing review must be checked first.";
  }
  return "Review cannot continue yet.";
}

function errorLabel(context: PluginReviewArtifactContext): string {
  switch (context) {
    case "artifact":
      return "Plugin review artifact could not load";
    case "summary":
      return "Plugin review summary could not load";
    case "gates":
      return "Review gates could not load";
    case "sandbox":
      return "Sandbox findings could not load";
    case "audit":
      return "Audit counters could not load";
    case "evidence":
      return "Local evidence could not load";
    case "actions":
      return "Review actions could not load";
  }
}

function retryLabel(context: PluginReviewArtifactContext): string {
  switch (context) {
    case "artifact":
      return "Retry artifact";
    case "summary":
      return "Retry summary";
    case "gates":
      return "Retry gates";
    case "sandbox":
      return "Retry sandbox";
    case "audit":
      return "Retry audit";
    case "evidence":
      return "Retry evidence";
    case "actions":
      return "Retry actions";
  }
}

function defaultErrorDescription(context: PluginReviewArtifactContext): string {
  switch (context) {
    case "artifact":
      return "Load a local plugin review artifact JSON file and try again.";
    case "summary":
      return "Refresh the summary cards and try again.";
    case "gates":
      return "Refresh review gates and try again.";
    case "sandbox":
      return "Refresh sandbox findings and try again.";
    case "audit":
      return "Refresh audit counters and try again.";
    case "evidence":
      return "Refresh local evidence and try again.";
    case "actions":
      return "Refresh review actions and try again.";
  }
}

function normalizeActionIntent(
  value: string | undefined,
): PluginReviewActionIntent {
  const normalized = normalizeToken(value);
  if (normalized === "danger" || normalized === "destructive") {
    return "danger";
  }
  if (normalized === "primary") {
    return "primary";
  }
  return "secondary";
}

function normalizeActionSection(
  value: string | undefined,
): PluginReviewActionButton["section"] {
  const normalized = normalizeToken(value);
  if (
    normalized === "gates" ||
    normalized === "sandbox" ||
    normalized === "audit" ||
    normalized === "evidence" ||
    normalized === "actions"
  ) {
    return normalized;
  }
  return undefined;
}

function dedupeActions(
  actions: readonly PluginReviewActionButton[],
): PluginReviewActionButton[] {
  const seen = new Set<string>();
  const deduped: PluginReviewActionButton[] = [];
  for (const action of actions) {
    if (seen.has(action.id)) {
      continue;
    }
    seen.add(action.id);
    deduped.push(action);
  }
  return deduped;
}

function isLocalReference(value: string): boolean {
  if (
    value.startsWith("file://") ||
    value.startsWith("fixture://") ||
    value.startsWith("workspace://") ||
    value.startsWith("sovereignops://") ||
    value.startsWith("/") ||
    /^[a-zA-Z]:[\\/]/.test(value)
  ) {
    return true;
  }

  return !/^[a-z]+:\/\//i.test(value);
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

function nonNegativeIntegerField(
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

function timestampField(
  record: AnyRecord | undefined,
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

function normalizeTimestampOrDefault(value: string | undefined): string {
  return value !== undefined && !Number.isNaN(Date.parse(value))
    ? value
    : DEFAULT_TIMESTAMP;
}

function normalizeToken(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "_") ?? "";
}

function normalizeCounterKey(value: string): string {
  return value.trim().replace(/\s+/g, ".").replace(/^\.+|\.+$/g, "") || "events";
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

function formatRatio(passed: number, total: number, label: string): string {
  return total === 0
    ? `0 ${label}`
    : `${passed}/${total} ${label}`;
}

function formatBytes(value: number): string {
  return `${value} bytes`;
}

function formatList(
  values: readonly string[],
  singular: string,
  plural: string,
): string {
  if (values.length === 0) {
    return `${plural} unavailable`;
  }
  return `${values.length === 1 ? singular : plural}: ${values.join(", ")}`;
}

function optionalStringList(value: string | undefined): string[] {
  return value === undefined || value.trim() === "" ? [] : [value.trim()];
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

function compareTimestamps(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
    throw new Error("timestamps must be valid");
  }

  return leftTime - rightTime || left.localeCompare(right);
}

function cloneArtifactState(
  state: PluginReviewArtifactViewModel,
): PluginReviewArtifactViewModel {
  return {
    ...state,
    summaryCards: state.summaryCards.map(cloneSummaryCard),
    gateRows: state.gateRows.map(cloneGateRow),
    sandboxFindingRows: state.sandboxFindingRows.map(cloneSandboxFindingRow),
    auditCounters: state.auditCounters.map(cloneAuditCounter),
    localEvidenceRows: state.localEvidenceRows.map(cloneLocalEvidenceRow),
    actionButtons: state.actionButtons.map(cloneActionButton),
    emptyStates: {
      summary: { ...state.emptyStates.summary },
      gates: { ...state.emptyStates.gates },
      sandbox: { ...state.emptyStates.sandbox },
      audit: { ...state.emptyStates.audit },
      evidence: { ...state.emptyStates.evidence },
      actions: { ...state.emptyStates.actions },
    },
    errorStates: state.errorStates.map(cloneErrorState),
  };
}

function cloneSummaryCard(card: PluginReviewSummaryCard): PluginReviewSummaryCard {
  return {
    ...card,
    detailLabels: [...card.detailLabels],
  };
}

function cloneGateRow(row: PluginReviewGateRow): PluginReviewGateRow {
  return {
    ...row,
    detailLabels: [...row.detailLabels],
    evidenceIds: [...row.evidenceIds],
  };
}

function cloneSandboxFindingRow(
  row: PluginReviewSandboxFindingRow,
): PluginReviewSandboxFindingRow {
  return {
    ...row,
    detailLabels: [...row.detailLabels],
    evidenceIds: [...row.evidenceIds],
  };
}

function cloneAuditCounter(
  counter: PluginReviewAuditCounter,
): PluginReviewAuditCounter {
  return {
    ...counter,
    pluginIds: [...counter.pluginIds],
    reviewIds: [...counter.reviewIds],
    detailLabels: [...counter.detailLabels],
  };
}

function cloneLocalEvidenceRow(
  row: PluginReviewLocalEvidenceRow,
): PluginReviewLocalEvidenceRow {
  return {
    ...row,
    detailLabels: [...row.detailLabels],
  };
}

function cloneActionButton(
  action: PluginReviewActionButton,
): PluginReviewActionButton {
  return { ...action };
}

function cloneErrorState(
  error: PluginReviewArtifactErrorState,
): PluginReviewArtifactErrorState {
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
