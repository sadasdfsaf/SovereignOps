import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateHealthProbes,
  createDeterministicClock,
  createObservabilityCollector,
  redactAttributes,
} from "../src/index.ts";

test("records structured events with deterministic timestamps and privacy redaction", () => {
  const collector = createObservabilityCollector({
    clock: createDeterministicClock("2026-04-27T00:00:00.000Z", 10),
    resource: {
      serviceName: "local-sync",
      workspaceId: "wsp_alpha",
      attributes: {
        region: "local",
        email: "person@example.test",
      },
    },
  });

  const event = collector.recordEvent({
    name: "sync.completed",
    message: "Local sync completed.",
    attributes: {
      records: 3,
      token: "raw-token",
      nested: {
        apiKey: "raw-key",
        visible: "kept",
      },
    },
  });

  assert.equal(event.sequence, 1);
  assert.equal(event.timestamp, "2026-04-27T00:00:00.000Z");
  assert.deepEqual(event.attributes, {
    nested: {
      apiKey: "[REDACTED]",
      visible: "kept",
    },
    records: 3,
    token: "[REDACTED]",
  });
  assert.deepEqual(event.redactedPaths, [
    "attributes.nested.apiKey",
    "attributes.token",
    "resource.attributes.email",
  ]);

  const snapshot = collector.snapshot();
  snapshot.events[0].attributes.records = 99;
  assert.equal(collector.snapshot().events[0].attributes.records, 3);
});

test("aggregates counters, gauges, and histograms without network exporters", () => {
  const collector = createObservabilityCollector({
    clock: createDeterministicClock("2026-04-27T01:00:00.000Z", 5),
  });

  collector.incrementCounter("jobs.completed", 2, {
    attributes: { queue: "import", secret: "hidden" },
  });
  const counter = collector.incrementCounter("jobs.completed", 3, {
    attributes: { secret: "hidden", queue: "import" },
  });
  const gauge = collector.setGauge("queue.depth", 7, {
    unit: "items",
    attributes: { queue: "import" },
  });
  collector.recordHistogram("job.duration", 4, {
    unit: "ms",
    buckets: [1, 5, 10],
    attributes: { queue: "import" },
  });
  const histogram = collector.recordHistogram("job.duration", 8, {
    unit: "ms",
    buckets: [10, 1, 5],
    attributes: { queue: "import" },
  });

  assert.equal(counter.value, 5);
  assert.deepEqual(counter.attributes, {
    queue: "import",
    secret: "[REDACTED]",
  });
  assert.deepEqual(counter.redactedPaths, ["attributes.secret"]);
  assert.equal(gauge.value, 7);
  assert.equal(histogram.count, 2);
  assert.equal(histogram.sum, 12);
  assert.equal(histogram.min, 4);
  assert.equal(histogram.max, 8);
  assert.deepEqual(histogram.buckets, [
    { le: 1, count: 0 },
    { le: 5, count: 1 },
    { le: 10, count: 2 },
  ]);
  assert.equal(histogram.overflow, 0);
  assert.deepEqual(
    collector.metricSnapshots().map((metric) => `${metric.kind}:${metric.name}`),
    ["counter:jobs.completed", "gauge:queue.depth", "histogram:job.duration"],
  );
  assert.throws(() => collector.incrementCounter("jobs.completed", -1));
  assert.throws(() => collector.recordHistogram("job.duration", 3, {
    buckets: [2, 4],
    attributes: { queue: "import" },
  }));
});

test("creates trace span summaries with deterministic ids, events, and duration", () => {
  const collector = createObservabilityCollector({
    clock: createDeterministicClock("2026-04-27T02:00:00.000Z", 25),
  });

  const span = collector.startSpan({
    name: "import.batch",
    attributes: {
      batchId: "batch_1",
      password: "hidden",
    },
  });
  span.addEvent({
    name: "import.batch.read",
    attributes: {
      rows: 4,
      accessToken: "hidden",
    },
  });
  const summary = span.end({
    status: "ok",
    attributes: {
      rowsWritten: 4,
    },
  });

  assert.equal(summary.traceId, "trc_000001");
  assert.equal(summary.spanId, "spn_000002");
  assert.equal(summary.startedAt, "2026-04-27T02:00:00.000Z");
  assert.equal(summary.endedAt, "2026-04-27T02:00:00.050Z");
  assert.equal(summary.durationMs, 50);
  assert.deepEqual(summary.attributes, {
    batchId: "batch_1",
    password: "[REDACTED]",
    rowsWritten: 4,
  });
  assert.deepEqual(summary.events, [
    {
      name: "import.batch.read",
      timestamp: "2026-04-27T02:00:00.025Z",
      attributes: {
        accessToken: "[REDACTED]",
        rows: 4,
      },
      redactedPaths: ["attributes.accessToken"],
    },
  ]);
  assert.throws(() => span.end());

  const historical = collector.recordSpanSummary({
    name: "import.cleanup",
    traceId: "trc_manual",
    spanId: "spn_manual",
    startedAt: "2026-04-27T02:05:00.000Z",
    endedAt: "2026-04-27T02:05:00.025Z",
    status: "cancelled",
    attributes: {
      phone: "hidden",
    },
  });

  assert.equal(historical.durationMs, 25);
  assert.deepEqual(historical.redactedPaths, ["attributes.phone"]);
  assert.equal(collector.spanSummaries().length, 2);
});

test("aggregates health probes by worst status with stable ordering", () => {
  const collector = createObservabilityCollector({
    clock: createDeterministicClock("2026-04-27T03:00:00.000Z", 1),
  });

  collector.recordHealthProbe({
    name: "storage",
    status: "healthy",
    latencyMs: 4,
  });
  collector.recordHealthProbe({
    name: "index",
    status: "degraded",
    message: "Rebuild is still running.",
    attributes: {
      passphrase: "hidden",
    },
  });

  const health = collector.healthSummary();
  assert.equal(health.status, "degraded");
  assert.equal(health.checkedAt, "2026-04-27T03:00:00.001Z");
  assert.deepEqual(health.counts, {
    healthy: 1,
    degraded: 1,
    unhealthy: 0,
    unknown: 0,
  });
  assert.deepEqual(
    health.probes.map((probe) => probe.name),
    ["index", "storage"],
  );
  assert.deepEqual(health.probes[0].attributes, {
    passphrase: "[REDACTED]",
  });
});

test("redacts custom paths and reports empty health as unknown", () => {
  const redacted = redactAttributes(
    {
      safe: "kept",
      nested: {
        keep: "visible",
        value: "hide-me",
      },
    },
    {
      sensitivePaths: ["nested.value"],
    },
  );

  assert.deepEqual(redacted, {
    value: {
      nested: {
        keep: "visible",
        value: "[REDACTED]",
      },
      safe: "kept",
    },
    redactedPaths: ["nested.value"],
  });

  assert.deepEqual(aggregateHealthProbes([]), {
    status: "unknown",
    checkedAt: null,
    counts: {
      healthy: 0,
      degraded: 0,
      unhealthy: 0,
      unknown: 0,
    },
    probes: [],
  });
});
