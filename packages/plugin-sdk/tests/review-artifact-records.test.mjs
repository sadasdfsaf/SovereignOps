import assert from "node:assert/strict";
import test from "node:test";

import {
  createPluginReviewArtifact,
} from "../src/reviewArtifact.ts";
import {
  comparePluginReviewArtifacts,
  createInMemoryPluginReviewArtifactRecordStore,
  createPluginReviewArtifactRecord,
  summarizePluginReviewArtifactRecord,
} from "../src/reviewArtifactRecords.ts";
import {
  runPluginInSandbox,
} from "../src/sandbox.ts";

test("creates, stores, lists, and gets plugin review artifact records", () => {
  const artifact = createApprovedArtifact({
    evidence: [
      {
        id: "trace",
        kind: "local-trace",
        summary: "Captured C:\\Users\\DELL\\workspace\\trace.json with token=secret-value",
        path: "C:\\Users\\DELL\\workspace\\trace.json",
        content: "token=secret-value\nprivate body",
      },
    ],
  });
  const record = createPluginReviewArtifactRecord(artifact);
  const duplicateRecord = createPluginReviewArtifactRecord(artifact);
  const inputRecord = createPluginReviewArtifactRecord(createApprovedArtifactInput());
  const store = createInMemoryPluginReviewArtifactRecordStore();
  const stored = store.append(artifact);

  assert.equal(record.schemaVersion, "plugin-review-artifact-record/v1");
  assert.match(record.recordId, /^plugin-review-record-plugin\.review-board-[a-f0-9]{16}$/);
  assert.match(record.fingerprint, /^[a-f0-9]{32}$/);
  assert.equal(record.recordId, duplicateRecord.recordId);
  assert.equal(record.fingerprint, duplicateRecord.fingerprint);
  assert.equal(inputRecord.artifact.schemaVersion, "plugin-review-artifact/v1");
  assert.equal(inputRecord.summary.decision, "approved");
  assert.deepEqual(record.summary, {
    schemaVersion: "plugin-review-artifact-record/v1",
    recordId: record.recordId,
    fingerprint: record.fingerprint,
    reviewId: artifact.reviewId,
    artifactFingerprint: artifact.fingerprint,
    artifactSchemaVersion: "plugin-review-artifact/v1",
    pluginId: "plugin.review-board",
    pluginName: "Review Board",
    pluginVersion: "1.2.3",
    decision: "approved",
    sandboxOk: true,
    sandboxFingerprint: artifact.sandboxReview.fingerprint,
    grantedCapabilities: ["read_items", "write_items"],
    missingCapabilities: [],
    deniedHostApisObserved: [],
    approvalGateStates: [],
    evidence: [
      {
        id: "trace",
        kind: "local-trace",
        localOnly: true,
        redacted: true,
        fingerprint: artifact.evidence[0].fingerprint,
      },
    ],
  });
  assert.equal(stored.recordId, record.recordId);
  assert.equal(store.get(record.recordId), stored);
  assert.equal(store.get("missing-record"), undefined);
  assert.deepEqual(store.list(), [stored]);
  assert.deepEqual(store.listSummaries(), [stored.summary]);

  const serialized = JSON.stringify(record);
  assert.equal(serialized.includes("C:\\Users\\DELL"), false);
  assert.equal(serialized.includes("secret-value"), false);
  assert.equal(serialized.includes("private body"), false);
});

test("rejects duplicate record ids in the append-only store", () => {
  const artifact = createApprovedArtifact();
  const record = createPluginReviewArtifactRecord(artifact);
  const store = createInMemoryPluginReviewArtifactRecordStore();

  store.append(artifact);

  assert.throws(() => {
    store.append(artifact);
  }, /already exists/);
  assert.throws(() => {
    store.append(record);
  }, /already exists/);
});

test("compares matching and mismatching artifacts and records", () => {
  const artifact = createApprovedArtifact();
  const record = createPluginReviewArtifactRecord(artifact);
  const recreatedRecord = createPluginReviewArtifactRecord(record);
  const matchingComparison = comparePluginReviewArtifacts(artifact, record);
  const recordComparison = comparePluginReviewArtifacts(record, recreatedRecord);
  const pendingArtifact = createApprovedArtifact({
    approvalGates: [
      { id: "owner-review", name: "Owner review", state: "pending" },
    ],
  });
  const mismatchComparison = comparePluginReviewArtifacts(record, pendingArtifact);

  assert.equal(matchingComparison.match, true);
  assert.equal(matchingComparison.artifactFingerprintMatch, true);
  assert.equal(matchingComparison.recordIdMatch, undefined);
  assert.deepEqual(matchingComparison.differences, []);
  assert.equal(recordComparison.match, true);
  assert.equal(recordComparison.recordIdMatch, true);
  assert.equal(recordComparison.recordFingerprintMatch, true);
  assert.equal(mismatchComparison.match, false);
  assert.equal(mismatchComparison.artifactFingerprintMatch, false);
  assert.equal(mismatchComparison.decisionMatch, false);
  assert.deepEqual(
    mismatchComparison.differences.map((difference) => difference.field),
    [
      "artifact.reviewId",
      "artifact.fingerprint",
      "artifact.decision",
    ],
  );
});

test("records and store snapshots are immutable and copy only redacted artifact fields", () => {
  const artifact = createApprovedArtifact({
    evidence: [
      {
        id: "trace",
        kind: "local-trace",
        summary: "Trace saved to C:\\Users\\DELL\\private\\trace.json",
        path: "C:\\Users\\DELL\\private\\trace.json",
        content: "private body",
      },
    ],
  });
  const unsafeArtifact = {
    ...artifact,
    rawLocalPath: "C:\\Users\\DELL\\private\\trace.json",
    evidence: artifact.evidence.map((item) => ({
      ...item,
      path: "C:\\Users\\DELL\\private\\trace.json",
      content: "private body",
    })),
  };
  const record = createPluginReviewArtifactRecord(unsafeArtifact);
  const summary = summarizePluginReviewArtifactRecord(record);
  const store = createInMemoryPluginReviewArtifactRecordStore([record]);
  const firstList = store.list();
  const secondList = store.list();
  const summaries = store.listSummaries();
  const serialized = JSON.stringify(record);

  assert.equal(Object.isFrozen(record), true);
  assert.equal(Object.isFrozen(record.artifact), true);
  assert.equal(Object.isFrozen(record.summary), true);
  assert.equal(Object.isFrozen(record.summary.evidence), true);
  assert.equal(Object.isFrozen(firstList), true);
  assert.equal(Object.isFrozen(summaries), true);
  assert.notEqual(firstList, secondList);
  assert.notEqual(summary, record.summary);
  assert.deepEqual(summary, record.summary);
  assert.equal(serialized.includes("rawLocalPath"), false);
  assert.equal(serialized.includes("C:\\Users\\DELL"), false);
  assert.equal(serialized.includes("private body"), false);
  assert.equal(Object.hasOwn(record.artifact.evidence[0], "path"), false);
  assert.equal(Object.hasOwn(record.artifact.evidence[0], "content"), false);
  assert.throws(() => {
    record.summary.grantedCapabilities.push("extra_items");
  }, TypeError);
  assert.throws(() => {
    firstList.push(record);
  }, TypeError);
  assert.throws(() => {
    summaries[0].evidence.push({});
  }, TypeError);
  assert.equal(store.list().length, 1);
});

function createApprovedArtifact(overrides = {}) {
  return createPluginReviewArtifact(createApprovedArtifactInput(overrides));
}

function createApprovedArtifactInput(overrides = {}) {
  const boundary = {
    capabilities: ["write_items", "read_items"],
    deniedHostApis: ["process", "fs"],
    limits: {
      maxAuditEvents: 12,
      maxTicks: 10,
    },
  };
  const result = runPluginInSandbox((context) => {
    context.requireCapability("read_items");
    context.requireCapability("write_items");
    return "ok";
  }, boundary);

  return {
    manifest: baseManifest(),
    sandboxReview: {
      runLabel: "stable",
      boundary,
      requiredCapabilities: ["write_items", "read_items"],
      result,
    },
    ...overrides,
  };
}

function baseManifest() {
  return {
    id: "plugin.review-board",
    name: "Review Board",
    version: "1.2.3",
    description: "Adds review helpers to a local workspace.",
    entrypoint: ".\\dist\\index.js",
    capabilities: [
      {
        id: "write_items",
        permission: "write_object",
        description: "Create and update review items",
      },
      {
        id: "read_items",
        permission: "read_object",
        description: "Read review item titles and metadata",
      },
    ],
    tools: [
      {
        id: "summarize_items",
        name: "Summarize items",
        description: "Summarizes selected items",
        capability: "read_items",
      },
    ],
    resources: [
      {
        id: "item_catalog",
        name: "Item catalog",
        description: "Lists available items",
        uri: "sovereignops://items/catalog",
        capability: "read_items",
      },
    ],
    prompts: [
      {
        id: "draft_note",
        name: "Draft note",
        description: "Builds a concise review note",
        capability: "read_items",
      },
    ],
    minimumHostVersion: "0.3.0",
  };
}
