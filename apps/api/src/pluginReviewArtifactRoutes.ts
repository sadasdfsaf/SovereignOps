import {
  PluginManifestValidationError,
  createPluginReviewArtifact,
} from "../../../packages/plugin-sdk/src/index.ts";
import type {
  PluginReviewArtifact,
  PluginReviewArtifactInput,
} from "../../../packages/plugin-sdk/src/index.ts";
import type {
  ApiResponse,
  ApiRoute,
  ApiRouter,
} from "./router.ts";
import { jsonError, jsonResponse } from "./router.ts";

export interface PluginReviewArtifactRoutesOptions {
  readonly basePath?: string;
}

export interface PluginReviewArtifactPreviewResponse {
  readonly kind: "plugin-review-artifact.preview";
  readonly localOnly: true;
  readonly redacted: true;
  readonly schemaVersion: PluginReviewArtifact["schemaVersion"];
  readonly reviewId: string;
  readonly fingerprint: string;
  readonly decision: PluginReviewArtifact["decision"];
  readonly artifact: PluginReviewArtifact;
}

type Parsed<TValue> = { ok: true; value: TValue } | { ok: false; error: ApiResponse };
type JsonRecord = Record<string, unknown>;

const REVIEW_ARTIFACT_REDACTION = "[REDACTED]";
const SENSITIVE_FIELD_PATTERN =
  /(?:authorization|api[-_]?key|apikey|auth|bearer|cookie|credential|jwt|password|passphrase|private[-_]?key|refresh[-_]?token|secret|session|signing[-_]?key|token)/i;
const SENSITIVE_TEXT_PATTERNS = [
  /\b((?:api[-_]?key|apikey|authorization|credential|password|passphrase|secret|session|token)\s*[:=]\s*)[^\s,;]+/gi,
  /\b(?:sk|rk|pk|tok|pat|npm)_[A-Za-z0-9_-]{8,}\b/g,
  /\b(?:sk|rk|pat|glpat|github_pat)-[A-Za-z0-9_-]{8,}\b/g,
];
const SANDBOX_FAILURE_CODES = new Set([
  "SANDBOX_ASYNC_DENIED",
  "SANDBOX_AUDIT_LIMIT",
  "SANDBOX_CAPABILITY_DENIED",
  "SANDBOX_HOST_API_DENIED",
  "SANDBOX_INVALID_AUDIT",
  "SANDBOX_INVALID_TICK",
  "SANDBOX_RESOURCE_LIMIT",
  "PLUGIN_ERROR",
]);

export function createPluginReviewArtifactRoutes(
  options: PluginReviewArtifactRoutesOptions = {},
): readonly ApiRoute[] {
  const basePath = normalizeBasePath(options.basePath ?? "/v1/plugins/review-artifacts");

  return Object.freeze([
    {
      method: "POST",
      path: joinPath(basePath, "/preview"),
      description: "Previews a local plugin review artifact.",
      handler: ({ request }) => {
        const parsed = parsePluginReviewArtifactPreviewRequest(request.body);
        if (!parsed.ok) {
          return parsed.error;
        }

        try {
          return jsonResponse(200, buildPreviewResponse(parsed.value));
        } catch (error) {
          return caughtPluginReviewArtifactError(error);
        }
      },
    },
  ]);
}

export function mountPluginReviewArtifactRoutes(
  router: ApiRouter,
  options: PluginReviewArtifactRoutesOptions = {},
): ApiRouter {
  for (const route of createPluginReviewArtifactRoutes(options)) {
    router.register(route);
  }

  return router;
}

function buildPreviewResponse(
  input: PluginReviewArtifactInput,
): PluginReviewArtifactPreviewResponse {
  const artifact = createPluginReviewArtifact(input);

  return deepFreeze({
    kind: "plugin-review-artifact.preview",
    localOnly: true,
    redacted: true,
    schemaVersion: artifact.schemaVersion,
    reviewId: artifact.reviewId,
    fingerprint: artifact.fingerprint,
    decision: artifact.decision,
    artifact,
  });
}

function parsePluginReviewArtifactPreviewRequest(
  body: unknown,
): Parsed<PluginReviewArtifactInput> {
  const redacted = redactJsonCompatibleValue(body, "body");
  if (!redacted.ok) {
    return redacted;
  }
  if (!isRecord(redacted.value)) {
    return validationFailure("Request body must be an object.", { path: "body" });
  }

  const keys = allowedKeys(redacted.value, [
    "manifest",
    "sandboxReview",
    "automationReferences",
    "auditReferences",
    "approvalGates",
    "evidence",
  ], "body");
  if (!keys.ok) {
    return keys;
  }

  const manifest = parseRequiredRecord(redacted.value.manifest, "body.manifest", "Plugin manifest");
  if (!manifest.ok) {
    return manifest;
  }

  const sandboxReview = parseSandboxReview(redacted.value.sandboxReview, "body.sandboxReview");
  if (!sandboxReview.ok) {
    return sandboxReview;
  }

  const automationReferences = parseOptionalReferenceArray(
    redacted.value.automationReferences,
    "body.automationReferences",
  );
  if (!automationReferences.ok) {
    return automationReferences;
  }

  const auditReferences = parseOptionalReferenceArray(
    redacted.value.auditReferences,
    "body.auditReferences",
  );
  if (!auditReferences.ok) {
    return auditReferences;
  }

  const approvalGates = parseOptionalApprovalGateArray(
    redacted.value.approvalGates,
    "body.approvalGates",
  );
  if (!approvalGates.ok) {
    return approvalGates;
  }

  const evidence = parseOptionalEvidenceArray(redacted.value.evidence, "body.evidence");
  if (!evidence.ok) {
    return evidence;
  }

  return {
    ok: true,
    value: optionalFields({
      manifest: manifest.value,
      sandboxReview: sandboxReview.value,
      automationReferences: automationReferences.value,
      auditReferences: auditReferences.value,
      approvalGates: approvalGates.value,
      evidence: evidence.value,
    }) as unknown as PluginReviewArtifactInput,
  };
}

function parseSandboxReview(value: unknown, path: string): Parsed<JsonRecord> {
  const record = parseRequiredRecord(value, path, "Sandbox review");
  if (!record.ok) {
    return record;
  }

  const keys = allowedKeys(record.value, [
    "pluginId",
    "runLabel",
    "boundary",
    "requiredCapabilities",
    "result",
  ], path);
  if (!keys.ok) {
    return keys;
  }

  const pluginId = parseOptionalString(record.value.pluginId, `${path}.pluginId`);
  if (!pluginId.ok) {
    return pluginId;
  }

  const runLabel = parseOptionalString(record.value.runLabel, `${path}.runLabel`);
  if (!runLabel.ok) {
    return runLabel;
  }

  const boundary = parseSandboxBoundary(record.value.boundary, `${path}.boundary`);
  if (!boundary.ok) {
    return boundary;
  }

  const requiredCapabilities = parseOptionalStringArray(
    record.value.requiredCapabilities,
    `${path}.requiredCapabilities`,
  );
  if (!requiredCapabilities.ok) {
    return requiredCapabilities;
  }

  const result = parseSandboxResult(record.value.result, `${path}.result`);
  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    value: optionalFields({
      pluginId: pluginId.value,
      runLabel: runLabel.value,
      boundary: boundary.value,
      requiredCapabilities: requiredCapabilities.value,
      result: result.value,
    }),
  };
}

function parseSandboxBoundary(value: unknown, path: string): Parsed<JsonRecord> {
  const record = parseRequiredRecord(value, path, "Sandbox boundary");
  if (!record.ok) {
    return record;
  }

  const keys = allowedKeys(record.value, ["capabilities", "deniedHostApis", "limits"], path);
  if (!keys.ok) {
    return keys;
  }

  const capabilities = parseOptionalStringArray(record.value.capabilities, `${path}.capabilities`);
  if (!capabilities.ok) {
    return capabilities;
  }

  const deniedHostApis = parseOptionalStringArray(record.value.deniedHostApis, `${path}.deniedHostApis`);
  if (!deniedHostApis.ok) {
    return deniedHostApis;
  }

  const limits = parseOptionalSandboxLimits(record.value.limits, `${path}.limits`);
  if (!limits.ok) {
    return limits;
  }

  return {
    ok: true,
    value: optionalFields({
      capabilities: capabilities.value,
      deniedHostApis: deniedHostApis.value,
      limits: limits.value,
    }),
  };
}

function parseOptionalSandboxLimits(value: unknown, path: string): Parsed<JsonRecord | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (!isRecord(value)) {
    return validationFailure("Sandbox limits must be an object.", { path });
  }

  const keys = allowedKeys(value, ["maxAuditEvents", "maxTicks"], path);
  if (!keys.ok) {
    return keys;
  }

  const maxAuditEvents = parseOptionalPositiveInteger(value.maxAuditEvents, `${path}.maxAuditEvents`);
  if (!maxAuditEvents.ok) {
    return maxAuditEvents;
  }

  const maxTicks = parseOptionalPositiveInteger(value.maxTicks, `${path}.maxTicks`);
  if (!maxTicks.ok) {
    return maxTicks;
  }

  return {
    ok: true,
    value: optionalFields({
      maxAuditEvents: maxAuditEvents.value,
      maxTicks: maxTicks.value,
    }),
  };
}

function parseSandboxResult(value: unknown, path: string): Parsed<JsonRecord> {
  const record = parseRequiredRecord(value, path, "Sandbox result");
  if (!record.ok) {
    return record;
  }

  const keys = allowedKeys(record.value, ["ok", "value", "error", "audit", "ticks"], path);
  if (!keys.ok) {
    return keys;
  }
  if (typeof record.value.ok !== "boolean") {
    return validationFailure("Sandbox result requires a boolean ok field.", {
      path: `${path}.ok`,
    });
  }

  const audit = parseSandboxAudit(record.value.audit, `${path}.audit`);
  if (!audit.ok) {
    return audit;
  }

  const ticks = parseRequiredNonNegativeInteger(record.value.ticks, `${path}.ticks`);
  if (!ticks.ok) {
    return ticks;
  }

  if (record.value.ok) {
    if (record.value.error !== undefined) {
      return validationFailure("Successful sandbox results must not include error.", {
        path: `${path}.error`,
      });
    }

    return {
      ok: true,
      value: optionalFields({
        ok: true,
        value: record.value.value,
        audit: audit.value,
        ticks: ticks.value,
      }),
    };
  }

  if (record.value.value !== undefined) {
    return validationFailure("Failed sandbox results must not include value.", {
      path: `${path}.value`,
    });
  }

  const error = parseSandboxFailure(record.value.error, `${path}.error`);
  if (!error.ok) {
    return error;
  }

  return {
    ok: true,
    value: {
      ok: false,
      error: error.value,
      audit: audit.value,
      ticks: ticks.value,
    },
  };
}

function parseSandboxFailure(value: unknown, path: string): Parsed<JsonRecord> {
  const record = parseRequiredRecord(value, path, "Sandbox failure");
  if (!record.ok) {
    return record;
  }

  const keys = allowedKeys(record.value, ["code", "message"], path);
  if (!keys.ok) {
    return keys;
  }

  const code = parseRequiredString(record.value.code, `${path}.code`);
  if (!code.ok) {
    return code;
  }
  if (!SANDBOX_FAILURE_CODES.has(code.value)) {
    return validationFailure("Sandbox failure code is unsupported.", {
      path: `${path}.code`,
    });
  }

  const message = parseRequiredString(record.value.message, `${path}.message`);
  if (!message.ok) {
    return message;
  }

  return {
    ok: true,
    value: {
      code: code.value,
      message: message.value,
    },
  };
}

function parseSandboxAudit(value: unknown, path: string): Parsed<readonly JsonRecord[]> {
  if (!Array.isArray(value)) {
    return validationFailure("Sandbox result audit must be an array.", { path });
  }

  const events: JsonRecord[] = [];
  for (const [index, item] of value.entries()) {
    const itemPath = `${path}.${index}`;
    const event = parseSandboxAuditEvent(item, itemPath);
    if (!event.ok) {
      return event;
    }
    events.push(event.value);
  }

  return { ok: true, value: Object.freeze(events) };
}

function parseSandboxAuditEvent(value: unknown, path: string): Parsed<JsonRecord> {
  const record = parseRequiredRecord(value, path, "Sandbox audit event");
  if (!record.ok) {
    return record;
  }

  const keys = allowedKeys(record.value, ["sequence", "tick", "type", "detail"], path);
  if (!keys.ok) {
    return keys;
  }

  const sequence = parseRequiredPositiveInteger(record.value.sequence, `${path}.sequence`);
  if (!sequence.ok) {
    return sequence;
  }

  const tick = parseRequiredNonNegativeInteger(record.value.tick, `${path}.tick`);
  if (!tick.ok) {
    return tick;
  }

  const type = parseRequiredString(record.value.type, `${path}.type`);
  if (!type.ok) {
    return type;
  }

  if (!isRecord(record.value.detail)) {
    return validationFailure("Sandbox audit event detail must be an object.", {
      path: `${path}.detail`,
    });
  }

  return {
    ok: true,
    value: {
      sequence: sequence.value,
      tick: tick.value,
      type: type.value,
      detail: record.value.detail,
    },
  };
}

function parseOptionalReferenceArray(
  value: unknown,
  path: string,
): Parsed<readonly JsonRecord[] | undefined> {
  return parseOptionalRecordArray(value, path, ["id", "kind", "label", "uri"], (record, itemPath) => {
    const id = parseRequiredString(record.id, `${itemPath}.id`);
    if (!id.ok) {
      return id;
    }

    const kind = parseRequiredString(record.kind, `${itemPath}.kind`);
    if (!kind.ok) {
      return kind;
    }

    const label = parseOptionalString(record.label, `${itemPath}.label`);
    if (!label.ok) {
      return label;
    }

    const uri = parseOptionalString(record.uri, `${itemPath}.uri`);
    if (!uri.ok) {
      return uri;
    }

    return {
      ok: true,
      value: optionalFields({
        id: id.value,
        kind: kind.value,
        label: label.value,
        uri: uri.value,
      }),
    };
  });
}

function parseOptionalApprovalGateArray(
  value: unknown,
  path: string,
): Parsed<readonly JsonRecord[] | undefined> {
  return parseOptionalRecordArray(value, path, ["id", "name", "required", "state", "reason"], (record, itemPath) => {
    const id = parseRequiredString(record.id, `${itemPath}.id`);
    if (!id.ok) {
      return id;
    }

    const name = parseRequiredString(record.name, `${itemPath}.name`);
    if (!name.ok) {
      return name;
    }

    const required = parseOptionalBoolean(record.required, `${itemPath}.required`);
    if (!required.ok) {
      return required;
    }

    const state = parseOptionalApprovalGateState(record.state, `${itemPath}.state`);
    if (!state.ok) {
      return state;
    }

    const reason = parseOptionalString(record.reason, `${itemPath}.reason`);
    if (!reason.ok) {
      return reason;
    }

    return {
      ok: true,
      value: optionalFields({
        id: id.value,
        name: name.value,
        required: required.value,
        state: state.value,
        reason: reason.value,
      }),
    };
  });
}

function parseOptionalEvidenceArray(
  value: unknown,
  path: string,
): Parsed<readonly JsonRecord[] | undefined> {
  return parseOptionalRecordArray(
    value,
    path,
    ["id", "kind", "summary", "localOnly", "path", "content", "metadata"],
    (record, itemPath) => {
      const id = parseRequiredString(record.id, `${itemPath}.id`);
      if (!id.ok) {
        return id;
      }

      const kind = parseRequiredString(record.kind, `${itemPath}.kind`);
      if (!kind.ok) {
        return kind;
      }

      const summary = parseOptionalString(record.summary, `${itemPath}.summary`);
      if (!summary.ok) {
        return summary;
      }

      const localOnly = parseOptionalBoolean(record.localOnly, `${itemPath}.localOnly`);
      if (!localOnly.ok) {
        return localOnly;
      }

      const evidencePath = parseOptionalString(record.path, `${itemPath}.path`);
      if (!evidencePath.ok) {
        return evidencePath;
      }

      const content = parseOptionalString(record.content, `${itemPath}.content`);
      if (!content.ok) {
        return content;
      }

      if (record.metadata !== undefined && !isRecord(record.metadata)) {
        return validationFailure("Evidence metadata must be an object.", {
          path: `${itemPath}.metadata`,
        });
      }

      return {
        ok: true,
        value: optionalFields({
          id: id.value,
          kind: kind.value,
          summary: summary.value,
          localOnly: localOnly.value,
          path: evidencePath.value,
          content: content.value,
          metadata: record.metadata,
        }),
      };
    },
  );
}

function parseOptionalRecordArray(
  value: unknown,
  path: string,
  keys: readonly string[],
  parseItem: (record: JsonRecord, itemPath: string) => Parsed<JsonRecord>,
): Parsed<readonly JsonRecord[] | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (!Array.isArray(value)) {
    return validationFailure("Value must be an array of objects.", { path });
  }

  const items: JsonRecord[] = [];
  for (const [index, item] of value.entries()) {
    const itemPath = `${path}.${index}`;
    if (!isRecord(item)) {
      return validationFailure("Value must be an array of objects.", { path: itemPath });
    }

    const allowed = allowedKeys(item, keys, itemPath);
    if (!allowed.ok) {
      return allowed;
    }

    const parsed = parseItem(item, itemPath);
    if (!parsed.ok) {
      return parsed;
    }
    items.push(parsed.value);
  }

  return { ok: true, value: Object.freeze(items) };
}

function parseRequiredRecord(value: unknown, path: string, label: string): Parsed<JsonRecord> {
  if (!isRecord(value)) {
    return validationFailure(`${label} must be an object.`, { path });
  }

  return { ok: true, value };
}

function parseRequiredString(value: unknown, path: string): Parsed<string> {
  const parsed = readTrimmedString(value);
  if (parsed === undefined) {
    return validationFailure("Value must be a non-empty string.", { path });
  }

  return { ok: true, value: parsed };
}

function parseOptionalString(value: unknown, path: string): Parsed<string | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  return parseRequiredString(value, path);
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

  return { ok: true, value: Object.freeze(values) };
}

function parseOptionalBoolean(value: unknown, path: string): Parsed<boolean | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (typeof value !== "boolean") {
    return validationFailure("Value must be a boolean.", { path });
  }

  return { ok: true, value };
}

function parseOptionalApprovalGateState(
  value: unknown,
  path: string,
): Parsed<"approved" | "denied" | "pending" | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (value === "approved" || value === "denied" || value === "pending") {
    return { ok: true, value };
  }

  return validationFailure("Approval gate state must be approved, denied, or pending.", {
    path,
  });
}

function parseOptionalPositiveInteger(value: unknown, path: string): Parsed<number | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  return parseInteger(value, path, 1);
}

function parseRequiredPositiveInteger(value: unknown, path: string): Parsed<number> {
  return parseInteger(value, path, 1);
}

function parseRequiredNonNegativeInteger(value: unknown, path: string): Parsed<number> {
  return parseInteger(value, path, 0);
}

function parseInteger(value: unknown, path: string, min: number): Parsed<number> {
  if (!Number.isSafeInteger(value) || Number(value) < min) {
    return validationFailure(`Value must be a safe integer greater than or equal to ${min}.`, {
      path,
    });
  }

  return { ok: true, value: Number(value) };
}

function allowedKeys(
  record: JsonRecord,
  keys: readonly string[],
  path: string,
): { ok: true } | { ok: false; error: ApiResponse } {
  const allowed = new Set(keys);
  const unknown = Object.keys(record).find((key) => !allowed.has(key));
  if (unknown) {
    return validationFailure("Request body contains an unknown field.", {
      path: `${path}.${unknown}`,
    });
  }

  return { ok: true };
}

function redactJsonCompatibleValue(
  value: unknown,
  path: string,
  key = "",
  seen: WeakSet<object> = new WeakSet<object>(),
): Parsed<unknown> {
  if (key.length > 0 && SENSITIVE_FIELD_PATTERN.test(key)) {
    return { ok: true, value: REVIEW_ARTIFACT_REDACTION };
  }

  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return {
      ok: true,
      value: typeof value === "string" ? redactStringValue(value) : value,
    };
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return validationFailure("Request body must be JSON-compatible.", { path });
    }

    return { ok: true, value };
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return validationFailure("Request body must not contain circular references.", { path });
    }

    seen.add(value);
    const values: unknown[] = [];
    for (const [index, item] of value.entries()) {
      const parsed = redactJsonCompatibleValue(item, `${path}.${index}`, "", seen);
      if (!parsed.ok) {
        return parsed;
      }
      values.push(parsed.value);
    }
    seen.delete(value);

    return { ok: true, value: Object.freeze(values) };
  }

  if (isRecord(value)) {
    if (seen.has(value)) {
      return validationFailure("Request body must not contain circular references.", { path });
    }

    seen.add(value);
    const output: JsonRecord = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      if (entryValue === undefined) {
        return validationFailure("Request body must be JSON-compatible.", {
          path: `${path}.${entryKey}`,
        });
      }

      const parsed = redactJsonCompatibleValue(
        entryValue,
        `${path}.${entryKey}`,
        entryKey,
        seen,
      );
      if (!parsed.ok) {
        return parsed;
      }
      output[entryKey] = parsed.value;
    }
    seen.delete(value);

    return { ok: true, value: deepFreeze(output) };
  }

  return validationFailure("Request body must be JSON-compatible.", { path });
}

function redactStringValue(value: string): string {
  if (isSecretShapedString(value)) {
    return REVIEW_ARTIFACT_REDACTION;
  }

  return SENSITIVE_TEXT_PATTERNS.reduce(
    (redacted, pattern) => redacted.replace(pattern, (match, prefix) =>
      typeof prefix === "string"
        ? `${prefix}${REVIEW_ARTIFACT_REDACTION}`
        : REVIEW_ARTIFACT_REDACTION,
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

function caughtPluginReviewArtifactError(error: unknown): ApiResponse {
  if (error instanceof PluginManifestValidationError) {
    return validationError("Plugin manifest failed validation.", {
      path: "body.manifest",
      issues: error.issues,
    });
  }

  if (error instanceof TypeError) {
    return validationError(error.message, { path: "body" });
  }

  return jsonError(
    500,
    "plugin_review_artifact_preview_failed",
    "Plugin review artifact preview failed.",
  );
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

function optionalFields<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T;
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

function readTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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
