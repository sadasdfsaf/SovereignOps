import {
  createPluginSandboxBoundary,
  type PluginSandboxAuditEvent,
  type PluginSandboxBoundary,
  type PluginSandboxBoundaryInput,
  type PluginSandboxFailureCode,
  type PluginSandboxResourceLimits,
  type PluginSandboxRunResult,
} from "./sandbox.ts";

export type PluginSandboxFailureCategory =
  | "async"
  | "audit"
  | "capability"
  | "host_api"
  | "invalid"
  | "plugin"
  | "resource"
  | "success";

export interface PluginSandboxReviewInput<TValue = unknown> {
  readonly pluginId?: string;
  readonly runLabel?: string;
  readonly boundary: PluginSandboxBoundaryInput | PluginSandboxBoundary;
  readonly requiredCapabilities?: readonly string[];
  readonly result: PluginSandboxRunResult<TValue>;
}

export interface PluginSandboxCapabilityReview {
  readonly granted: readonly string[];
  readonly required: readonly string[];
  readonly observed: readonly string[];
  readonly missing: readonly string[];
}

export interface PluginSandboxHostApiReview {
  readonly denied: readonly string[];
  readonly deniedObserved: readonly string[];
}

export interface PluginSandboxLimitReview {
  readonly maxAuditEvents: number;
  readonly maxTicks: number;
  readonly ticksUsed: number;
  readonly ticksRemaining: number;
  readonly tickBudgetExhausted: boolean;
}

export interface PluginSandboxAuditTypeCount {
  readonly type: string;
  readonly count: number;
}

export interface PluginSandboxAuditReview {
  readonly total: number;
  readonly remaining: number;
  readonly overflow: boolean;
  readonly byType: readonly PluginSandboxAuditTypeCount[];
}

export interface PluginSandboxFailureReview {
  readonly code: PluginSandboxFailureCode;
  readonly category: PluginSandboxFailureCategory;
}

export interface PluginSandboxReviewSummary {
  readonly reviewId: string;
  readonly fingerprint: string;
  readonly pluginId?: string;
  readonly runLabel?: string;
  readonly ok: boolean;
  readonly capabilities: PluginSandboxCapabilityReview;
  readonly hostApis: PluginSandboxHostApiReview;
  readonly limits: PluginSandboxLimitReview;
  readonly audit: PluginSandboxAuditReview;
  readonly failureCategories: readonly PluginSandboxFailureCategory[];
  readonly failure?: PluginSandboxFailureReview;
}

const FAILURE_CATEGORY_ORDER: readonly PluginSandboxFailureCategory[] = [
  "success",
  "capability",
  "host_api",
  "resource",
  "audit",
  "async",
  "invalid",
  "plugin",
];

export function summarizePluginSandboxRun<TValue>(
  input: PluginSandboxReviewInput<TValue>,
): PluginSandboxReviewSummary {
  const boundary = createPluginSandboxBoundary(input.boundary);
  const pluginId = normalizeOptionalString(input.pluginId, "pluginId");
  const runLabel = normalizeOptionalString(input.runLabel, "runLabel");
  const requiredCapabilities = normalizeStringSet(input.requiredCapabilities ?? []);
  const capabilityEvents = collectCapabilityEvents(input.result.audit);
  const hostApiEvents = collectDeniedHostApiEvents(input.result.audit);
  const grantedCapabilities = normalizeStringSet(boundary.capabilities);
  const requiredOrObservedCapabilities = normalizeStringSet([
    ...requiredCapabilities,
    ...capabilityEvents.observed,
  ]);
  const missingCapabilities = requiredOrObservedCapabilities.filter(
    (capability) => !grantedCapabilities.includes(capability),
  );
  const audit = summarizeAudit(
    input.result.audit,
    boundary.limits,
    !input.result.ok && input.result.error.code === "SANDBOX_AUDIT_LIMIT",
  );
  const limits = summarizeLimits(input.result.ticks, boundary.limits);
  const failure = input.result.ok ? undefined : deepFreeze({
    code: input.result.error.code,
    category: categoryForFailureCode(input.result.error.code),
  });
  const failureCategories = summarizeFailureCategories({
    auditOverflow: audit.overflow,
    failure,
    missingCapabilities,
    deniedHostApis: hostApiEvents.denied,
    tickBudgetExhausted: limits.tickBudgetExhausted,
  });

  const reviewBasis = optionalFields({
    pluginId,
    runLabel,
    ok: input.result.ok,
    capabilities: deepFreeze({
      granted: grantedCapabilities,
      required: requiredOrObservedCapabilities,
      observed: capabilityEvents.observed,
      missing: missingCapabilities,
    }),
    hostApis: deepFreeze({
      denied: normalizeStringSet(boundary.deniedHostApis),
      deniedObserved: hostApiEvents.denied,
    }),
    limits,
    audit,
    failureCategories,
    failure,
  });
  const fingerprint = fingerprintReviewBasis(reviewBasis);

  return deepFreeze({
    reviewId: `sandbox-review-${fingerprint.slice(0, 16)}`,
    fingerprint,
    ...reviewBasis,
  });
}

function collectCapabilityEvents(
  audit: readonly PluginSandboxAuditEvent[],
): { readonly observed: readonly string[] } {
  const capabilities = new Set<string>();

  for (const event of audit) {
    if (
      (
        event.type === "capability.allowed" ||
        event.type === "capability.checked" ||
        event.type === "capability.denied"
      ) &&
      typeof event.detail.capability === "string"
    ) {
      capabilities.add(event.detail.capability.trim());
    }
  }

  return deepFreeze({
    observed: normalizeStringSet([...capabilities]),
  });
}

function collectDeniedHostApiEvents(
  audit: readonly PluginSandboxAuditEvent[],
): { readonly denied: readonly string[] } {
  const apis = new Set<string>();

  for (const event of audit) {
    if (event.type === "host_api.denied" && typeof event.detail.api === "string") {
      apis.add(event.detail.api.trim());
    }
  }

  return deepFreeze({
    denied: normalizeStringSet([...apis]),
  });
}

function summarizeLimits(
  ticksUsed: number,
  limits: PluginSandboxResourceLimits,
): PluginSandboxLimitReview {
  return deepFreeze({
    maxAuditEvents: limits.maxAuditEvents,
    maxTicks: limits.maxTicks,
    ticksUsed,
    ticksRemaining: Math.max(limits.maxTicks - ticksUsed, 0),
    tickBudgetExhausted: ticksUsed > limits.maxTicks,
  });
}

function summarizeAudit(
  audit: readonly PluginSandboxAuditEvent[],
  limits: PluginSandboxResourceLimits,
  overflow: boolean,
): PluginSandboxAuditReview {
  const counts = new Map<string, number>();
  for (const event of audit) {
    counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
  }

  return deepFreeze({
    total: audit.length,
    remaining: Math.max(limits.maxAuditEvents - audit.length, 0),
    overflow,
    byType: [...counts.entries()]
      .sort(([left], [right]) => compareStrings(left, right))
      .map(([type, count]) => deepFreeze({ type, count })),
  });
}

function summarizeFailureCategories(input: {
  readonly auditOverflow: boolean;
  readonly failure?: PluginSandboxFailureReview;
  readonly missingCapabilities: readonly string[];
  readonly deniedHostApis: readonly string[];
  readonly tickBudgetExhausted: boolean;
}): readonly PluginSandboxFailureCategory[] {
  const categories = new Set<PluginSandboxFailureCategory>();

  if (input.failure) {
    categories.add(input.failure.category);
  }
  if (input.missingCapabilities.length > 0) {
    categories.add("capability");
  }
  if (input.deniedHostApis.length > 0) {
    categories.add("host_api");
  }
  if (input.tickBudgetExhausted) {
    categories.add("resource");
  }
  if (input.auditOverflow) {
    categories.add("audit");
  }
  if (categories.size === 0) {
    categories.add("success");
  }

  return deepFreeze(
    [...categories].sort(
      (left, right) => FAILURE_CATEGORY_ORDER.indexOf(left) - FAILURE_CATEGORY_ORDER.indexOf(right),
    ),
  );
}

function categoryForFailureCode(code: PluginSandboxFailureCode): PluginSandboxFailureCategory {
  switch (code) {
    case "SANDBOX_ASYNC_DENIED":
      return "async";
    case "SANDBOX_AUDIT_LIMIT":
    case "SANDBOX_INVALID_AUDIT":
      return "audit";
    case "SANDBOX_CAPABILITY_DENIED":
      return "capability";
    case "SANDBOX_HOST_API_DENIED":
      return "host_api";
    case "SANDBOX_INVALID_TICK":
      return "invalid";
    case "SANDBOX_RESOURCE_LIMIT":
      return "resource";
    case "PLUGIN_ERROR":
      return "plugin";
  }
}

function fingerprintReviewBasis(value: unknown): string {
  const canonical = canonicalJson(value);
  return `${fnv1a64(canonical)}${fnv1a64(`plugin-sandbox-review:${canonical}`)}`;
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * prime) & mask;
  }

  return hash.toString(16).padStart(16, "0");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function normalizeStringSet(values: readonly string[]): readonly string[] {
  return deepFreeze([...new Set(values.map((value) => normalizeRequiredString(value, "Review value")))].sort(compareStrings));
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function normalizeOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return normalizeRequiredString(value, label);
}

function normalizeRequiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function optionalFields<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T;
}

function deepFreeze<T>(value: T): T {
  if (!isFreezable(value) || Object.isFrozen(value)) {
    return value;
  }

  for (const key of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key]);
  }

  return Object.freeze(value);
}

function isFreezable(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}
