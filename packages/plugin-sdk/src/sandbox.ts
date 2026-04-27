import type { JsonObject, JsonValue } from "./manifest.ts";

export const DEFAULT_PLUGIN_SANDBOX_LIMITS = Object.freeze({
  maxAuditEvents: 256,
  maxTicks: 1_000,
});

export const DENIED_PLUGIN_HOST_APIS = Object.freeze([
  "child_process",
  "Date.now",
  "env",
  "eval",
  "fetch",
  "fs",
  "Function",
  "Math.random",
  "net",
  "process",
  "setInterval",
  "setTimeout",
]);

export type PluginSandboxFailureCode =
  | "SANDBOX_ASYNC_DENIED"
  | "SANDBOX_AUDIT_LIMIT"
  | "SANDBOX_CAPABILITY_DENIED"
  | "SANDBOX_HOST_API_DENIED"
  | "SANDBOX_INVALID_AUDIT"
  | "SANDBOX_INVALID_TICK"
  | "SANDBOX_RESOURCE_LIMIT"
  | "PLUGIN_ERROR";

export interface PluginSandboxResourceLimits {
  readonly maxAuditEvents: number;
  readonly maxTicks: number;
}

export interface PluginSandboxBoundaryInput {
  readonly capabilities?: readonly string[];
  readonly deniedHostApis?: readonly string[];
  readonly limits?: Partial<PluginSandboxResourceLimits>;
}

export interface PluginSandboxBoundary {
  readonly capabilities: readonly string[];
  readonly deniedHostApis: readonly string[];
  readonly limits: PluginSandboxResourceLimits;
}

export interface PluginSandboxAuditEvent {
  readonly sequence: number;
  readonly tick: number;
  readonly type: string;
  readonly detail: JsonObject;
}

export interface PluginSandboxFailure {
  readonly code: PluginSandboxFailureCode;
  readonly message: string;
}

export interface PluginSandboxSuccess<TValue> {
  readonly ok: true;
  readonly value: TValue;
  readonly audit: readonly PluginSandboxAuditEvent[];
  readonly ticks: number;
}

export interface PluginSandboxFailureResult {
  readonly ok: false;
  readonly error: PluginSandboxFailure;
  readonly audit: readonly PluginSandboxAuditEvent[];
  readonly ticks: number;
}

export type PluginSandboxRunResult<TValue> =
  | PluginSandboxSuccess<TValue>
  | PluginSandboxFailureResult;

export interface PluginSandboxContext {
  readonly boundary: PluginSandboxBoundary;
  readonly capabilities: readonly string[];
  readonly deniedHostApis: readonly string[];
  readonly host: Record<string, never>;
  readonly limits: PluginSandboxResourceLimits;
  audit(type: string, detail?: JsonObject): void;
  hasCapability(capability: string): boolean;
  requireCapability(capability: string): void;
  requestHostApi(api: string): never;
  tick(count?: number, label?: string): number;
}

export type PluginSandboxFunction<TValue> = (
  context: PluginSandboxContext,
) => TValue;

export interface PluginSandboxHarness {
  readonly boundary: PluginSandboxBoundary;
  run<TValue>(plugin: PluginSandboxFunction<TValue>): PluginSandboxRunResult<TValue>;
}

export class PluginSandboxError extends Error {
  readonly code: PluginSandboxFailureCode;

  constructor(code: PluginSandboxFailureCode, message: string) {
    super(message);
    this.name = "PluginSandboxError";
    this.code = code;
  }
}

export function createPluginSandboxBoundary(
  input: PluginSandboxBoundaryInput = {},
): PluginSandboxBoundary {
  return deepFreeze({
    capabilities: normalizeStringSet(input.capabilities ?? []),
    deniedHostApis: normalizeStringSet(input.deniedHostApis ?? DENIED_PLUGIN_HOST_APIS),
    limits: normalizeLimits(input.limits),
  });
}

export function createPluginSandboxHarness(
  input: PluginSandboxBoundaryInput = {},
): PluginSandboxHarness {
  const boundary = createPluginSandboxBoundary(input);

  return deepFreeze({
    boundary,
    run<TValue>(plugin: PluginSandboxFunction<TValue>): PluginSandboxRunResult<TValue> {
      return runPluginWithBoundary(plugin, boundary);
    },
  });
}

export function runPluginInSandbox<TValue>(
  plugin: PluginSandboxFunction<TValue>,
  input: PluginSandboxBoundaryInput = {},
): PluginSandboxRunResult<TValue> {
  return createPluginSandboxHarness(input).run(plugin);
}

function runPluginWithBoundary<TValue>(
  plugin: PluginSandboxFunction<TValue>,
  boundary: PluginSandboxBoundary,
): PluginSandboxRunResult<TValue> {
  const audit: PluginSandboxAuditEvent[] = [];
  const capabilities = new Set(boundary.capabilities);
  let ticks = 0;

  const recordAudit = (type: string, detail: JsonObject = {}): void => {
    if (!isNonEmptyString(type)) {
      throw new PluginSandboxError("SANDBOX_INVALID_AUDIT", "Audit event type must be a non-empty string.");
    }
    if (audit.length >= boundary.limits.maxAuditEvents) {
      throw new PluginSandboxError(
        "SANDBOX_AUDIT_LIMIT",
        `Audit event limit exceeded: ${boundary.limits.maxAuditEvents}.`,
      );
    }

    audit.push(deepFreeze({
      sequence: audit.length + 1,
      tick: ticks,
      type: type.trim(),
      detail: normalizeJsonObject(detail),
    }));
  };

  const requestHostApi = (api: string): never => {
    const normalizedApi = normalizeRequiredString(api, "Host API name");
    recordAudit("host_api.denied", {
      api: normalizedApi,
      configured: boundary.deniedHostApis.includes(normalizedApi),
    });
    throw new PluginSandboxError(
      "SANDBOX_HOST_API_DENIED",
      `Host API denied: ${normalizedApi}.`,
    );
  };

  const context: PluginSandboxContext = deepFreeze({
    boundary,
    capabilities: boundary.capabilities,
    deniedHostApis: boundary.deniedHostApis,
    host: createDeniedHostApiProxy(requestHostApi),
    limits: boundary.limits,
    audit(type: string, detail?: JsonObject): void {
      recordAudit("plugin.audit", {
        type: normalizeRequiredString(type, "Audit event type"),
        detail: normalizeJsonObject(detail ?? {}),
      });
    },
    hasCapability(capability: string): boolean {
      const normalizedCapability = normalizeRequiredString(capability, "Capability");
      const allowed = capabilities.has(normalizedCapability);
      recordAudit("capability.checked", {
        capability: normalizedCapability,
        allowed,
      });
      return allowed;
    },
    requireCapability(capability: string): void {
      const normalizedCapability = normalizeRequiredString(capability, "Capability");
      const allowed = capabilities.has(normalizedCapability);
      recordAudit(allowed ? "capability.allowed" : "capability.denied", {
        capability: normalizedCapability,
      });
      if (!allowed) {
        throw new PluginSandboxError(
          "SANDBOX_CAPABILITY_DENIED",
          `Capability denied: ${normalizedCapability}.`,
        );
      }
    },
    requestHostApi,
    tick(count = 1, label?: string): number {
      const increment = normalizeTickCount(count);
      const nextTicks = ticks + increment;
      const detail = optionalFields({
        count: increment,
        label: label === undefined ? undefined : normalizeRequiredString(label, "Tick label"),
        limit: boundary.limits.maxTicks,
        total: nextTicks,
      });

      if (nextTicks > boundary.limits.maxTicks) {
        ticks = nextTicks;
        recordAudit("resource.exhausted", detail);
        throw new PluginSandboxError(
          "SANDBOX_RESOURCE_LIMIT",
          `Tick budget exceeded: ${nextTicks}/${boundary.limits.maxTicks}.`,
        );
      }

      ticks = nextTicks;
      recordAudit("resource.tick", detail);
      return ticks;
    },
  });

  try {
    recordAudit("sandbox.run_started");
    const value = plugin(context);
    if (isPromiseLike(value)) {
      throw new PluginSandboxError(
        "SANDBOX_ASYNC_DENIED",
        "Sandbox harness only supports synchronous plugin functions.",
      );
    }
    recordAudit("sandbox.run_completed");

    return deepFreeze({
      ok: true,
      value,
      audit: [...audit],
      ticks,
    });
  } catch (error) {
    const failure = normalizeFailure(error);
    try {
      recordAudit("sandbox.run_failed", {
        code: failure.code,
        message: failure.message,
      });
    } catch {
      // Keep the original failure stable even if the audit sink has reached its limit.
    }

    return deepFreeze({
      ok: false,
      error: failure,
      audit: [...audit],
      ticks,
    });
  }
}

function createDeniedHostApiProxy(
  requestHostApi: (api: string) => never,
): Record<string, never> {
  const target = Object.freeze(Object.create(null));
  return new Proxy(target, {
    get(_target, property): never | string {
      if (property === Symbol.toStringTag) {
        return "PluginSandboxHostBoundary";
      }
      return requestHostApi(String(property));
    },
    has(_target, property): never {
      return requestHostApi(String(property));
    },
    set(_target, property): never {
      return requestHostApi(String(property));
    },
  }) as Record<string, never>;
}

function normalizeLimits(
  input: Partial<PluginSandboxResourceLimits> = {},
): PluginSandboxResourceLimits {
  return deepFreeze({
    maxAuditEvents: normalizePositiveInteger(
      input.maxAuditEvents ?? DEFAULT_PLUGIN_SANDBOX_LIMITS.maxAuditEvents,
      "limits.maxAuditEvents",
    ),
    maxTicks: normalizePositiveInteger(
      input.maxTicks ?? DEFAULT_PLUGIN_SANDBOX_LIMITS.maxTicks,
      "limits.maxTicks",
    ),
  });
}

function normalizePositiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new TypeError(`${label} must be a positive safe integer.`);
  }

  return Number(value);
}

function normalizeStringSet(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => normalizeRequiredString(value, "Boundary value")))].sort());
}

function normalizeTickCount(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new PluginSandboxError("SANDBOX_INVALID_TICK", "Tick count must be a positive safe integer.");
  }

  return Number(value);
}

function normalizeRequiredString(value: unknown, label: string): string {
  if (!isNonEmptyString(value)) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function normalizeFailure(error: unknown): PluginSandboxFailure {
  if (error instanceof PluginSandboxError) {
    return deepFreeze({
      code: error.code,
      message: error.message,
    });
  }

  if (error instanceof Error) {
    return deepFreeze({
      code: "PLUGIN_ERROR",
      message: error.message,
    });
  }

  return deepFreeze({
    code: "PLUGIN_ERROR",
    message: `Plugin threw ${String(error)}.`,
  });
}

function normalizeJsonObject(value: JsonObject): JsonObject {
  if (!isJsonObject(value)) {
    throw new PluginSandboxError("SANDBOX_INVALID_AUDIT", "Audit event detail must be a JSON object.");
  }

  return sortJsonValue(value) as JsonObject;
}

function sortJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => sortJsonValue(item)));
  }

  if (isRecord(value)) {
    return Object.freeze(Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortJsonValue(value[key] as JsonValue)]),
    ));
  }

  return value;
}

function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return typeof value !== "number" || Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  return isJsonObject(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPromiseLike(value: unknown): boolean {
  return isRecord(value) && typeof value.then === "function";
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
