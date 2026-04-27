export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type ObservableAttributes = Record<string, JsonValue | undefined>;

export const OBSERVATION_LEVELS = ["debug", "info", "warn", "error"] as const;
export type ObservationLevel = (typeof OBSERVATION_LEVELS)[number];

export const METRIC_KINDS = ["counter", "gauge", "histogram"] as const;
export type MetricKind = (typeof METRIC_KINDS)[number];

export const SPAN_STATUSES = ["ok", "error", "cancelled"] as const;
export type SpanStatus = (typeof SPAN_STATUSES)[number];

export const HEALTH_STATUSES = ["healthy", "degraded", "unhealthy", "unknown"] as const;
export type HealthStatus = (typeof HEALTH_STATUSES)[number];

export interface ResourceDescriptor {
  serviceName: string;
  serviceVersion?: string;
  instanceId?: string;
  workspaceId?: string;
  attributes?: ObservableAttributes;
}

export interface RedactionOptions {
  replacement?: string;
  sensitiveKeys?: readonly (string | RegExp)[];
  sensitivePaths?: readonly (string | RegExp)[];
}

export interface RedactionResult<TValue> {
  value: TValue;
  redactedPaths: string[];
}

export interface StructuredEventInput {
  name: string;
  level?: ObservationLevel;
  timestamp?: string;
  message?: string;
  resource?: ResourceDescriptor;
  traceId?: string;
  spanId?: string;
  attributes?: ObservableAttributes;
}

export interface StructuredEvent {
  kind: "event";
  sequence: number;
  name: string;
  level: ObservationLevel;
  timestamp: string;
  message?: string;
  resource?: ResourceDescriptor;
  traceId?: string;
  spanId?: string;
  attributes: Record<string, JsonValue>;
  redactedPaths: string[];
}

export interface MetricRecordOptions {
  timestamp?: string;
  unit?: string;
  description?: string;
  attributes?: ObservableAttributes;
  buckets?: readonly number[];
}

export interface BaseMetric {
  kind: MetricKind;
  name: string;
  unit?: string;
  description?: string;
  attributes: Record<string, JsonValue>;
  updatedAt: string;
  redactedPaths: string[];
}

export interface CounterMetric extends BaseMetric {
  kind: "counter";
  value: number;
}

export interface GaugeMetric extends BaseMetric {
  kind: "gauge";
  value: number;
}

export interface HistogramBucket {
  le: number;
  count: number;
}

export interface HistogramMetric extends BaseMetric {
  kind: "histogram";
  count: number;
  sum: number;
  min: number | null;
  max: number | null;
  buckets: HistogramBucket[];
  overflow: number;
}

export type MetricSnapshot = CounterMetric | GaugeMetric | HistogramMetric;

export interface SpanStartInput {
  name: string;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  startedAt?: string;
  attributes?: ObservableAttributes;
}

export interface SpanEventInput {
  name: string;
  timestamp?: string;
  attributes?: ObservableAttributes;
}

export interface SpanEvent {
  name: string;
  timestamp: string;
  attributes: Record<string, JsonValue>;
  redactedPaths: string[];
}

export interface SpanEndInput {
  status?: SpanStatus;
  endedAt?: string;
  attributes?: ObservableAttributes;
}

export interface SpanSummaryInput {
  name: string;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  startedAt: string;
  endedAt: string;
  status?: SpanStatus;
  attributes?: ObservableAttributes;
  events?: readonly SpanEvent[];
}

export interface SpanSummary {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  status: SpanStatus;
  attributes: Record<string, JsonValue>;
  events: SpanEvent[];
  redactedPaths: string[];
}

export interface HealthProbeInput {
  name: string;
  status: HealthStatus;
  checkedAt?: string;
  message?: string;
  latencyMs?: number;
  attributes?: ObservableAttributes;
}

export interface HealthProbeResult {
  name: string;
  status: HealthStatus;
  checkedAt: string;
  message?: string;
  latencyMs?: number;
  attributes: Record<string, JsonValue>;
  redactedPaths: string[];
}

export interface HealthAggregate {
  status: HealthStatus;
  checkedAt: string | null;
  counts: Record<HealthStatus, number>;
  probes: HealthProbeResult[];
}

export interface ObservabilitySnapshot {
  events: StructuredEvent[];
  metrics: MetricSnapshot[];
  spans: SpanSummary[];
  health: HealthAggregate;
}

export interface InMemoryObservabilityCollectorOptions {
  clock?: () => string;
  resource?: ResourceDescriptor;
  redaction?: RedactionOptions;
}

const DEFAULT_REDACTION_REPLACEMENT = "[REDACTED]";
const DEFAULT_SENSITIVE_KEYS = [
  "authorization",
  "apiKey",
  "api_key",
  "accessToken",
  "refreshToken",
  "password",
  "passphrase",
  "secret",
  "token",
  "email",
  "phone",
] as const;

const DEFAULT_HISTOGRAM_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 5000] as const;
const HEALTH_RANK: Record<HealthStatus, number> = {
  healthy: 0,
  unknown: 1,
  degraded: 2,
  unhealthy: 3,
};

export function createDeterministicClock(
  start = "1970-01-01T00:00:00.000Z",
  stepMs = 1,
): () => string {
  const startMs = Date.parse(start);
  assertFiniteNumber("start", startMs);
  assertFiniteNumber("stepMs", stepMs);
  if (stepMs < 0) {
    throw new Error("stepMs must be zero or greater");
  }
  let ticks = 0;
  return () => {
    const next = new Date(startMs + (ticks * stepMs)).toISOString();
    ticks += 1;
    return next;
  };
}

export function redactAttributes(
  attributes: ObservableAttributes = {},
  options: RedactionOptions = {},
): RedactionResult<Record<string, JsonValue>> {
  const state = createRedactionState(options);
  const value = redactRecord(attributes, [], state);
  return {
    value,
    redactedPaths: [...state.redactedPaths].sort(compareStrings),
  };
}

export function redactResource(
  resource: ResourceDescriptor,
  options: RedactionOptions = {},
): RedactionResult<ResourceDescriptor> {
  assertNonEmptyString("resource.serviceName", resource.serviceName);

  const redacted = redactAttributes(resource.attributes ?? {}, options);
  const value: ResourceDescriptor = {
    serviceName: resource.serviceName,
  };
  copyOptionalString(resource, value, "serviceVersion");
  copyOptionalString(resource, value, "instanceId");
  copyOptionalString(resource, value, "workspaceId");
  if (Object.keys(redacted.value).length > 0) {
    value.attributes = redacted.value;
  }
  return {
    value,
    redactedPaths: redacted.redactedPaths.map((path) => `resource.attributes.${path}`),
  };
}

export function aggregateHealthProbes(
  probes: readonly HealthProbeResult[],
): HealthAggregate {
  const sorted = probes.map(cloneHealthProbe).sort((left, right) => compareStrings(left.name, right.name));
  const counts: Record<HealthStatus, number> = {
    healthy: 0,
    degraded: 0,
    unhealthy: 0,
    unknown: 0,
  };

  let status: HealthStatus = sorted.length === 0 ? "unknown" : "healthy";
  let checkedAt: string | null = null;

  for (const probe of sorted) {
    counts[probe.status] += 1;
    if (HEALTH_RANK[probe.status] > HEALTH_RANK[status]) {
      status = probe.status;
    }
    if (checkedAt === null || Date.parse(probe.checkedAt) > Date.parse(checkedAt)) {
      checkedAt = probe.checkedAt;
    }
  }

  return {
    status,
    checkedAt,
    counts,
    probes: sorted,
  };
}

export function createObservabilityCollector(
  options: InMemoryObservabilityCollectorOptions = {},
): InMemoryObservabilityCollector {
  return new InMemoryObservabilityCollector(options);
}

export class InMemoryObservabilityCollector {
  readonly clock: () => string;
  readonly resource?: ResourceDescriptor;
  readonly redaction: RedactionOptions;

  private eventSequence = 0;
  private idSequence = 0;
  private readonly events: StructuredEvent[] = [];
  private readonly metrics = new Map<string, MetricSnapshot>();
  private readonly spans: SpanSummary[] = [];
  private readonly healthProbes = new Map<string, HealthProbeResult>();

  constructor(options: InMemoryObservabilityCollectorOptions = {}) {
    this.clock = options.clock ?? createDeterministicClock();
    this.redaction = options.redaction ?? {};
    this.resource = options.resource ? redactResource(options.resource, this.redaction).value : undefined;
  }

  recordEvent(input: StructuredEventInput): StructuredEvent {
    assertNonEmptyString("event.name", input.name);
    const level = input.level ?? "info";
    assertOneOf("event.level", level, OBSERVATION_LEVELS);
    const timestamp = input.timestamp ?? this.clock();
    assertTimestamp("event.timestamp", timestamp);

    const attributeResult = redactAttributes(input.attributes ?? {}, this.redaction);
    const resourceResult = input.resource
      ? redactResource(input.resource, this.redaction)
      : this.resource
        ? redactResource(this.resource, this.redaction)
        : undefined;

    const event: StructuredEvent = {
      kind: "event",
      sequence: this.nextEventSequence(),
      name: input.name,
      level,
      timestamp,
      attributes: attributeResult.value,
      redactedPaths: [
        ...attributeResult.redactedPaths.map((path) => `attributes.${path}`),
        ...(resourceResult?.redactedPaths ?? []),
      ].sort(compareStrings),
    };

    copyOptionalString(input, event, "message");
    copyOptionalString(input, event, "traceId");
    copyOptionalString(input, event, "spanId");
    if (resourceResult) {
      event.resource = resourceResult.value;
    }

    this.events.push(cloneEvent(event));
    return cloneEvent(event);
  }

  incrementCounter(name: string, value = 1, options: MetricRecordOptions = {}): CounterMetric {
    assertNonEmptyString("metric.name", name);
    assertFiniteNumber("counter.value", value);
    if (value < 0) {
      throw new Error("counter.value must be zero or greater");
    }

    const timestamp = options.timestamp ?? this.clock();
    assertTimestamp("metric.timestamp", timestamp);
    const attributes = redactAttributes(options.attributes ?? {}, this.redaction);
    const key = metricKey("counter", name, attributes.value);
    const existing = this.metrics.get(key);
    if (existing && existing.kind !== "counter") {
      throw new Error(`metric ${name} is already recorded as ${existing.kind}`);
    }

    const metric: CounterMetric = {
      kind: "counter",
      name,
      value: (existing as CounterMetric | undefined)?.value ?? 0,
      attributes: attributes.value,
      updatedAt: timestamp,
      redactedPaths: attributes.redactedPaths.map((path) => `attributes.${path}`),
    };
    copyOptionalString(options, metric, "unit");
    copyOptionalString(options, metric, "description");
    metric.value += value;

    this.metrics.set(key, cloneMetric(metric));
    return cloneMetric(metric) as CounterMetric;
  }

  setGauge(name: string, value: number, options: MetricRecordOptions = {}): GaugeMetric {
    assertNonEmptyString("metric.name", name);
    assertFiniteNumber("gauge.value", value);

    const timestamp = options.timestamp ?? this.clock();
    assertTimestamp("metric.timestamp", timestamp);
    const attributes = redactAttributes(options.attributes ?? {}, this.redaction);
    const metric: GaugeMetric = {
      kind: "gauge",
      name,
      value,
      attributes: attributes.value,
      updatedAt: timestamp,
      redactedPaths: attributes.redactedPaths.map((path) => `attributes.${path}`),
    };
    copyOptionalString(options, metric, "unit");
    copyOptionalString(options, metric, "description");

    this.metrics.set(metricKey("gauge", name, attributes.value), cloneMetric(metric));
    return cloneMetric(metric) as GaugeMetric;
  }

  recordHistogram(name: string, value: number, options: MetricRecordOptions = {}): HistogramMetric {
    assertNonEmptyString("metric.name", name);
    assertFiniteNumber("histogram.value", value);

    const timestamp = options.timestamp ?? this.clock();
    assertTimestamp("metric.timestamp", timestamp);
    const attributes = redactAttributes(options.attributes ?? {}, this.redaction);
    const bucketBounds = normalizeBuckets(options.buckets ?? DEFAULT_HISTOGRAM_BUCKETS);
    const key = metricKey("histogram", name, attributes.value);
    const existing = this.metrics.get(key);
    if (existing && existing.kind !== "histogram") {
      throw new Error(`metric ${name} is already recorded as ${existing.kind}`);
    }

    const metric = existing
      ? cloneMetric(existing) as HistogramMetric
      : createEmptyHistogram(name, attributes.value, bucketBounds, timestamp, options, attributes.redactedPaths);

    assertSameBuckets(name, metric.buckets.map((bucket) => bucket.le), bucketBounds);
    metric.updatedAt = timestamp;
    metric.count += 1;
    metric.sum += value;
    metric.min = metric.min === null ? value : Math.min(metric.min, value);
    metric.max = metric.max === null ? value : Math.max(metric.max, value);
    let matchedBucket = false;
    for (const bucket of metric.buckets) {
      if (value <= bucket.le) {
        bucket.count += 1;
        matchedBucket = true;
      }
    }
    if (!matchedBucket) {
      metric.overflow += 1;
    }

    this.metrics.set(key, cloneMetric(metric));
    return cloneMetric(metric) as HistogramMetric;
  }

  startSpan(input: SpanStartInput): SpanRecorder {
    assertNonEmptyString("span.name", input.name);
    const startedAt = input.startedAt ?? this.clock();
    assertTimestamp("span.startedAt", startedAt);

    const attributes = redactAttributes(input.attributes ?? {}, this.redaction);
    return new SpanRecorder(this, {
      traceId: input.traceId ?? this.nextTraceId(),
      spanId: input.spanId ?? this.nextSpanId(),
      parentSpanId: input.parentSpanId,
      name: input.name,
      startedAt,
      attributes: attributes.value,
      redactedPaths: attributes.redactedPaths.map((path) => `attributes.${path}`),
    });
  }

  recordSpanSummary(input: SpanSummaryInput): SpanSummary {
    assertNonEmptyString("span.name", input.name);
    const traceId = input.traceId ?? this.nextTraceId();
    const spanId = input.spanId ?? this.nextSpanId();
    assertNonEmptyString("span.traceId", traceId);
    assertNonEmptyString("span.spanId", spanId);
    assertTimestamp("span.startedAt", input.startedAt);
    assertTimestamp("span.endedAt", input.endedAt);
    const status = input.status ?? "ok";
    assertOneOf("span.status", status, SPAN_STATUSES);

    const attributes = redactAttributes(input.attributes ?? {}, this.redaction);
    const startedAt = input.startedAt;
    const durationMs = Date.parse(input.endedAt) - Date.parse(startedAt);
    if (durationMs < 0) {
      throw new Error("span.endedAt must be greater than or equal to span.startedAt");
    }

    const summary: SpanSummary = {
      traceId,
      spanId,
      name: input.name,
      startedAt,
      endedAt: input.endedAt,
      durationMs,
      status,
      attributes: attributes.value,
      events: (input.events ?? []).map(cloneSpanEvent),
      redactedPaths: attributes.redactedPaths.map((path) => `attributes.${path}`),
    };
    copyOptionalString(input, summary, "parentSpanId");
    this.spans.push(cloneSpanSummary(summary));
    return cloneSpanSummary(summary);
  }

  recordHealthProbe(input: HealthProbeInput): HealthProbeResult {
    assertNonEmptyString("health.name", input.name);
    assertOneOf("health.status", input.status, HEALTH_STATUSES);
    const checkedAt = input.checkedAt ?? this.clock();
    assertTimestamp("health.checkedAt", checkedAt);
    if (input.latencyMs !== undefined) {
      assertFiniteNumber("health.latencyMs", input.latencyMs);
      if (input.latencyMs < 0) {
        throw new Error("health.latencyMs must be zero or greater");
      }
    }

    const attributes = redactAttributes(input.attributes ?? {}, this.redaction);
    const result: HealthProbeResult = {
      name: input.name,
      status: input.status,
      checkedAt,
      attributes: attributes.value,
      redactedPaths: attributes.redactedPaths.map((path) => `attributes.${path}`),
    };
    copyOptionalString(input, result, "message");
    if (input.latencyMs !== undefined) {
      result.latencyMs = input.latencyMs;
    }

    this.healthProbes.set(input.name, cloneHealthProbe(result));
    return cloneHealthProbe(result);
  }

  eventSnapshots(): StructuredEvent[] {
    return this.events.map(cloneEvent);
  }

  metricSnapshots(): MetricSnapshot[] {
    return [...this.metrics.values()]
      .map(cloneMetric)
      .sort(compareMetrics);
  }

  spanSummaries(): SpanSummary[] {
    return this.spans.map(cloneSpanSummary);
  }

  healthSummary(): HealthAggregate {
    return aggregateHealthProbes([...this.healthProbes.values()]);
  }

  snapshot(): ObservabilitySnapshot {
    return {
      events: this.eventSnapshots(),
      metrics: this.metricSnapshots(),
      spans: this.spanSummaries(),
      health: this.healthSummary(),
    };
  }

  reset(): void {
    this.eventSequence = 0;
    this.idSequence = 0;
    this.events.length = 0;
    this.metrics.clear();
    this.spans.length = 0;
    this.healthProbes.clear();
  }

  completeSpan(input: InternalSpanEndInput): SpanSummary {
    const status = input.status ?? "ok";
    assertOneOf("span.status", status, SPAN_STATUSES);
    const endedAt = input.endedAt ?? this.clock();
    assertTimestamp("span.endedAt", endedAt);
    const endAttributes = redactAttributes(input.attributes ?? {}, this.redaction);
    const mergedAttributes = mergeAttributes(input.attributesAtStart, endAttributes.value);
    const startedAtMs = Date.parse(input.startedAt);
    const endedAtMs = Date.parse(endedAt);
    if (endedAtMs < startedAtMs) {
      throw new Error("span.endedAt must be greater than or equal to span.startedAt");
    }

    const summary: SpanSummary = {
      traceId: input.traceId,
      spanId: input.spanId,
      name: input.name,
      startedAt: input.startedAt,
      endedAt,
      durationMs: endedAtMs - startedAtMs,
      status,
      attributes: mergedAttributes,
      events: input.events.map(cloneSpanEvent),
      redactedPaths: [
        ...input.redactedPathsAtStart,
        ...endAttributes.redactedPaths.map((path) => `attributes.${path}`),
      ].sort(compareStrings),
    };
    if (input.parentSpanId) {
      summary.parentSpanId = input.parentSpanId;
    }
    this.spans.push(cloneSpanSummary(summary));
    return cloneSpanSummary(summary);
  }

  private nextEventSequence(): number {
    this.eventSequence += 1;
    return this.eventSequence;
  }

  private nextTraceId(): string {
    this.idSequence += 1;
    return `trc_${String(this.idSequence).padStart(6, "0")}`;
  }

  private nextSpanId(): string {
    this.idSequence += 1;
    return `spn_${String(this.idSequence).padStart(6, "0")}`;
  }
}

export class SpanRecorder {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly name: string;
  readonly startedAt: string;
  readonly attributes: Record<string, JsonValue>;
  readonly redactedPaths: string[];

  private ended = false;
  private readonly collector: InMemoryObservabilityCollector;
  private readonly events: SpanEvent[] = [];

  constructor(collector: InMemoryObservabilityCollector, input: InternalSpanStartInput) {
    this.collector = collector;
    this.traceId = input.traceId;
    this.spanId = input.spanId;
    this.parentSpanId = input.parentSpanId;
    this.name = input.name;
    this.startedAt = input.startedAt;
    this.attributes = cloneAttributes(input.attributes);
    this.redactedPaths = [...input.redactedPaths].sort(compareStrings);
  }

  addEvent(input: SpanEventInput): SpanEvent {
    if (this.ended) {
      throw new Error("cannot add an event to an ended span");
    }
    assertNonEmptyString("span.event.name", input.name);
    const timestamp = input.timestamp ?? this.collector.clock();
    assertTimestamp("span.event.timestamp", timestamp);
    const attributes = redactAttributes(input.attributes ?? {}, this.collector.redaction);
    const event: SpanEvent = {
      name: input.name,
      timestamp,
      attributes: attributes.value,
      redactedPaths: attributes.redactedPaths.map((path) => `attributes.${path}`),
    };
    this.events.push(cloneSpanEvent(event));
    return cloneSpanEvent(event);
  }

  end(input: SpanEndInput = {}): SpanSummary {
    if (this.ended) {
      throw new Error("span has already ended");
    }
    this.ended = true;
    return this.collector.completeSpan({
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
      name: this.name,
      startedAt: this.startedAt,
      attributesAtStart: this.attributes,
      redactedPathsAtStart: this.redactedPaths,
      events: this.events,
      ...input,
    });
  }
}

interface InternalSpanStartInput {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startedAt: string;
  attributes: Record<string, JsonValue>;
  redactedPaths: string[];
}

interface InternalSpanEndInput {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startedAt: string;
  attributesAtStart: Record<string, JsonValue>;
  redactedPathsAtStart: string[];
  events: readonly SpanEvent[];
  status?: SpanStatus;
  endedAt?: string;
  attributes?: ObservableAttributes;
}

interface RedactionState {
  replacement: string;
  sensitiveKeys: readonly (string | RegExp)[];
  sensitivePaths: readonly (string | RegExp)[];
  redactedPaths: Set<string>;
}

function createEmptyHistogram(
  name: string,
  attributes: Record<string, JsonValue>,
  bucketBounds: readonly number[],
  timestamp: string,
  options: MetricRecordOptions,
  redactedPaths: readonly string[],
): HistogramMetric {
  const metric: HistogramMetric = {
    kind: "histogram",
    name,
    count: 0,
    sum: 0,
    min: null,
    max: null,
    buckets: bucketBounds.map((le) => ({ le, count: 0 })),
    overflow: 0,
    attributes,
    updatedAt: timestamp,
    redactedPaths: redactedPaths.map((path) => `attributes.${path}`),
  };
  copyOptionalString(options, metric, "unit");
  copyOptionalString(options, metric, "description");
  return metric;
}

function createRedactionState(options: RedactionOptions): RedactionState {
  return {
    replacement: options.replacement ?? DEFAULT_REDACTION_REPLACEMENT,
    sensitiveKeys: options.sensitiveKeys ?? DEFAULT_SENSITIVE_KEYS,
    sensitivePaths: options.sensitivePaths ?? [],
    redactedPaths: new Set(),
  };
}

function redactRecord(
  record: ObservableAttributes,
  path: readonly string[],
  state: RedactionState,
): Record<string, JsonValue> {
  if (!isRecord(record)) {
    throw new Error("attributes must be an object");
  }

  const result: Record<string, JsonValue> = {};
  for (const key of Object.keys(record).sort(compareStrings)) {
    const value = record[key];
    if (value === undefined) {
      continue;
    }
    const nextPath = [...path, key];
    result[key] = shouldRedact(key, nextPath, state)
      ? redactAtPath(nextPath, state)
      : redactValue(value, nextPath, state);
  }
  return result;
}

function redactValue(value: JsonValue | undefined, path: readonly string[], state: RedactionState): JsonValue {
  if (value === undefined) {
    return null;
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    assertFiniteNumber(formatPath(path), value);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => redactValue(item, [...path, `[${index}]`], state));
  }
  if (!isRecord(value)) {
    throw new Error(`${formatPath(path)} must be JSON-compatible`);
  }

  const result: Record<string, JsonValue> = {};
  for (const key of Object.keys(value).sort(compareStrings)) {
    const item = value[key];
    const nextPath = [...path, key];
    result[key] = shouldRedact(key, nextPath, state)
      ? redactAtPath(nextPath, state)
      : redactValue(item, nextPath, state);
  }
  return result;
}

function redactAtPath(path: readonly string[], state: RedactionState): string {
  state.redactedPaths.add(formatPath(path));
  return state.replacement;
}

function shouldRedact(key: string, path: readonly string[], state: RedactionState): boolean {
  const formattedPath = formatPath(path);
  return matchesAny(key, state.sensitiveKeys) || matchesAny(formattedPath, state.sensitivePaths);
}

function matchesAny(value: string, matchers: readonly (string | RegExp)[]): boolean {
  return matchers.some((matcher) => {
    if (typeof matcher === "string") {
      return matcher.toLowerCase() === value.toLowerCase();
    }
    matcher.lastIndex = 0;
    return matcher.test(value);
  });
}

function normalizeBuckets(buckets: readonly number[]): number[] {
  if (buckets.length === 0) {
    throw new Error("histogram buckets must not be empty");
  }
  const unique = new Set<number>();
  for (const bucket of buckets) {
    assertFiniteNumber("histogram.bucket", bucket);
    unique.add(bucket);
  }
  return [...unique].sort((left, right) => left - right);
}

function assertSameBuckets(name: string, left: readonly number[], right: readonly number[]): void {
  if (left.length !== right.length || left.some((value, index) => value !== right[index])) {
    throw new Error(`histogram ${name} cannot change bucket boundaries`);
  }
}

function metricKey(kind: MetricKind, name: string, attributes: Record<string, JsonValue>): string {
  return `${kind}:${name}:${stableStringify(attributes)}`;
}

function stableStringify(value: JsonValue): string {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort(compareStrings)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

function mergeAttributes(
  first: Record<string, JsonValue>,
  second: Record<string, JsonValue>,
): Record<string, JsonValue> {
  return cloneAttributes({
    ...first,
    ...second,
  });
}

function cloneAttributes(attributes: Record<string, JsonValue>): Record<string, JsonValue> {
  return redactValue(attributes, [], createRedactionState({ sensitiveKeys: [], sensitivePaths: [] })) as Record<string, JsonValue>;
}

function cloneEvent(event: StructuredEvent): StructuredEvent {
  const clone: StructuredEvent = {
    kind: "event",
    sequence: event.sequence,
    name: event.name,
    level: event.level,
    timestamp: event.timestamp,
    attributes: cloneAttributes(event.attributes),
    redactedPaths: [...event.redactedPaths],
  };
  copyOptionalString(event, clone, "message");
  copyOptionalString(event, clone, "traceId");
  copyOptionalString(event, clone, "spanId");
  if (event.resource) {
    clone.resource = cloneResource(event.resource);
  }
  return clone;
}

function cloneResource(resource: ResourceDescriptor): ResourceDescriptor {
  const clone: ResourceDescriptor = {
    serviceName: resource.serviceName,
  };
  copyOptionalString(resource, clone, "serviceVersion");
  copyOptionalString(resource, clone, "instanceId");
  copyOptionalString(resource, clone, "workspaceId");
  if (resource.attributes) {
    clone.attributes = cloneAttributes(resource.attributes as Record<string, JsonValue>);
  }
  return clone;
}

function cloneMetric(metric: MetricSnapshot): MetricSnapshot {
  const base = {
    name: metric.name,
    attributes: cloneAttributes(metric.attributes),
    updatedAt: metric.updatedAt,
    redactedPaths: [...metric.redactedPaths],
  };
  copyOptionalString(metric, base, "unit");
  copyOptionalString(metric, base, "description");

  if (metric.kind === "counter") {
    return {
      kind: "counter",
      ...base,
      value: metric.value,
    };
  }
  if (metric.kind === "gauge") {
    return {
      kind: "gauge",
      ...base,
      value: metric.value,
    };
  }
  return {
    kind: "histogram",
    ...base,
    count: metric.count,
    sum: metric.sum,
    min: metric.min,
    max: metric.max,
    buckets: metric.buckets.map((bucket) => ({ ...bucket })),
    overflow: metric.overflow,
  };
}

function cloneSpanEvent(event: SpanEvent): SpanEvent {
  return {
    name: event.name,
    timestamp: event.timestamp,
    attributes: cloneAttributes(event.attributes),
    redactedPaths: [...event.redactedPaths],
  };
}

function cloneSpanSummary(span: SpanSummary): SpanSummary {
  const clone: SpanSummary = {
    traceId: span.traceId,
    spanId: span.spanId,
    name: span.name,
    startedAt: span.startedAt,
    endedAt: span.endedAt,
    durationMs: span.durationMs,
    status: span.status,
    attributes: cloneAttributes(span.attributes),
    events: span.events.map(cloneSpanEvent),
    redactedPaths: [...span.redactedPaths],
  };
  copyOptionalString(span, clone, "parentSpanId");
  return clone;
}

function cloneHealthProbe(probe: HealthProbeResult): HealthProbeResult {
  const clone: HealthProbeResult = {
    name: probe.name,
    status: probe.status,
    checkedAt: probe.checkedAt,
    attributes: cloneAttributes(probe.attributes),
    redactedPaths: [...probe.redactedPaths],
  };
  copyOptionalString(probe, clone, "message");
  if (probe.latencyMs !== undefined) {
    clone.latencyMs = probe.latencyMs;
  }
  return clone;
}

function compareMetrics(left: MetricSnapshot, right: MetricSnapshot): number {
  return (
    compareStrings(left.kind, right.kind) ||
    compareStrings(left.name, right.name) ||
    compareStrings(stableStringify(left.attributes), stableStringify(right.attributes))
  );
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function formatPath(path: readonly string[]): string {
  return path.reduce((current, part) => {
    if (part.startsWith("[")) {
      return `${current}${part}`;
    }
    return current.length === 0 ? part : `${current}.${part}`;
  }, "");
}

function copyOptionalString<TTarget extends Record<string, unknown>>(
  source: Record<string, unknown>,
  target: TTarget,
  key: string,
): void {
  const value = source[key];
  if (value !== undefined) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`${key} must be a non-empty string when provided`);
    }
    (target as Record<string, unknown>)[key] = value;
  }
}

function assertNonEmptyString(name: string, value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
}

function assertFiniteNumber(name: string, value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`);
  }
}

function assertTimestamp(name: string, value: string): void {
  assertNonEmptyString(name, value);
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`${name} must be an ISO-compatible timestamp`);
  }
}

function assertOneOf<TValue extends string>(
  name: string,
  value: unknown,
  allowed: readonly TValue[],
): asserts value is TValue {
  if (typeof value !== "string" || !allowed.includes(value as TValue)) {
    throw new Error(`${name} must be one of ${allowed.join(", ")}`);
  }
}

function isRecord(value: unknown): value is Record<string, JsonValue | undefined> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
