import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  APPROVAL_EVIDENCE_REDACTED,
  ApprovalEvidenceRecordDuplicateError,
  buildApprovalEvidenceSummary,
  createApprovalEvidenceRecord,
  createApprovalEvidenceRecordFingerprint,
  createApprovalEvidenceRecordStore,
} from "../src/index.ts";

const SESSION_CREATED_AT = "2026-04-27T00:00:00.000Z";
const SESSION_UPDATED_AT = "2026-04-27T00:00:05.000Z";
const RECORD_CREATED_AT = "2026-04-27T00:01:00.000Z";

describe("approval evidence record store", () => {
  it("creates deterministic local descriptors and immutable record snapshots", () => {
    const evidence = approvalEvidence();
    const metadata = {
      batchId: "batch-a",
      labels: ["local", "reviewed"],
    };
    const store = createApprovalEvidenceRecordStore({
      now: () => RECORD_CREATED_AT,
    });

    const record = store.put({ evidence, metadata });
    const sameContentLater = createApprovalEvidenceRecord({
      evidence: approvalEvidence(),
      metadata: {
        labels: ["local", "reviewed"],
        batchId: "batch-a",
      },
      createdAt: "2026-04-27T00:02:00.000Z",
    });

    metadata.batchId = "changed";
    evidence.request.details.note = "changed";

    assert.equal(record.descriptor.scope, "local");
    assert.equal(record.descriptor.schemaVersion, 1);
    assert.equal(record.descriptor.evidence.sessionId, "approval-record-1");
    assert.equal(record.descriptor.evidence.toolName, "assemble_local_note");
    assert.equal(record.descriptor.evidence.auditEventCount, 1);
    assert.equal(record.descriptor.createdAt, RECORD_CREATED_AT);
    assert.equal(record.descriptor.id, sameContentLater.descriptor.id);
    assert.equal(record.descriptor.fingerprint, sameContentLater.descriptor.fingerprint);
    assert.match(record.descriptor.fingerprint, /^[a-f0-9]{64}$/);
    assert.equal(Object.isFrozen(record.descriptor), true);
    assert.equal(Object.isFrozen(record.evidence.request.details), true);
    assert.deepEqual(record.metadata, {
      batchId: "batch-a",
      labels: ["local", "reviewed"],
    });

    const expectedFingerprint = createApprovalEvidenceRecordFingerprint({
      evidenceFingerprint: record.descriptor.evidenceFingerprint,
      metadataFingerprint: record.descriptor.metadataFingerprint,
    });
    assert.equal(record.descriptor.fingerprint, expectedFingerprint);

    const descriptors = store.list({ toolName: "assemble_local_note" });
    assert.deepEqual(descriptors.map((descriptor) => descriptor.id), [
      record.descriptor.id,
    ]);
    assert.equal(Object.isFrozen(descriptors[0]), true);

    const fetched = store.get(record.descriptor.id);
    assert.notEqual(fetched, record);
    assert.deepEqual(fetched.evidence.request.details.note, "keep-visible");
    assert.throws(() => {
      fetched.metadata.labels.push("mutated");
    }, TypeError);
    assert.deepEqual(store.get(record.descriptor.id).metadata.labels, [
      "local",
      "reviewed",
    ]);
  });

  it("rejects duplicate deterministic ids and allows deletion before reinsert", () => {
    const store = createApprovalEvidenceRecordStore({
      now: () => RECORD_CREATED_AT,
    });
    const evidence = approvalEvidence();
    const first = store.put({ evidence, metadata: { batchId: "batch-a" } });

    assert.throws(
      () => store.put({ evidence: approvalEvidence(), metadata: { batchId: "batch-a" } }),
      (error) =>
        error instanceof ApprovalEvidenceRecordDuplicateError &&
        error.recordId === first.descriptor.id,
    );

    assert.equal(store.delete(first.descriptor.id), true);
    assert.equal(store.get(first.descriptor.id), undefined);
    assert.equal(store.delete(first.descriptor.id), false);

    const second = store.put({ evidence: approvalEvidence(), metadata: { batchId: "batch-a" } });
    assert.equal(second.descriptor.id, first.descriptor.id);
  });

  it("compares preview evidence against the stored baseline", () => {
    const store = createApprovalEvidenceRecordStore({
      now: () => RECORD_CREATED_AT,
    });
    const record = store.put({
      evidence: approvalEvidence(),
      metadata: { batchId: "batch-a" },
    });

    const same = store.compare(record.descriptor.id, approvalEvidence());
    assert.equal(same.matches, true);
    assert.equal(same.evidenceChanged, false);
    assert.equal(same.metadataChanged, false);
    assert.deepEqual(same.changedPaths, []);

    const drifted = approvalEvidence({
      request: approvalRequest({ toolName: "assemble_local_note_v2" }),
    });
    const evidenceDrift = store.compare(record.descriptor.id, drifted);
    assert.equal(evidenceDrift.matches, false);
    assert.equal(evidenceDrift.evidenceChanged, true);
    assert.equal(evidenceDrift.metadataChanged, false);
    assert.ok(evidenceDrift.changedPaths.includes("$.request.toolName"));
    assert.notEqual(
      evidenceDrift.previewEvidenceFingerprint,
      evidenceDrift.storedEvidenceFingerprint,
    );

    const metadataDrift = store.compare(record.descriptor.id, approvalEvidence(), {
      batchId: "batch-b",
    });
    assert.equal(metadataDrift.matches, false);
    assert.equal(metadataDrift.evidenceChanged, false);
    assert.equal(metadataDrift.metadataChanged, true);
    assert.ok(metadataDrift.changedPaths.includes("$.metadata.batchId"));
  });

  it("validates local-only scope, createdAt timestamps, and schema versions", () => {
    const store = createApprovalEvidenceRecordStore();

    assert.throws(
      () => store.put({ evidence: approvalEvidence(), scope: "shared" }),
      /local scope/,
    );
    assert.throws(
      () => store.put({ evidence: approvalEvidence(), createdAt: "not-a-date" }),
      /timestamp/,
    );

    const invalidSchema = clone(approvalEvidence());
    invalidSchema.schemaVersion = 2;
    assert.throws(
      () => store.put({ evidence: invalidSchema }),
      /schemaVersion/,
    );
  });

  it("stores only redacted evidence and keeps metadata redaction boundaries", () => {
    const store = createApprovalEvidenceRecordStore({
      now: () => RECORD_CREATED_AT,
    });
    const evidence = approvalEvidence({
      request: approvalRequest({ apiKey: "raw-local-key" }),
    });

    const record = store.put({
      evidence,
      metadata: {
        authToken: "raw-metadata-token",
        visible: "keep-visible",
      },
    });
    const serialized = JSON.stringify(record);

    assert.equal(record.evidence.request.details.apiKey, APPROVAL_EVIDENCE_REDACTED);
    assert.equal(record.metadata.authToken, APPROVAL_EVIDENCE_REDACTED);
    assert.equal(serialized.includes("raw-local-key"), false);
    assert.equal(serialized.includes("raw-metadata-token"), false);
    assert.equal(serialized.includes("keep-visible"), true);

    const unredactedKey = clone(evidence);
    unredactedKey.request.details.apiKey = "raw-local-key";
    assert.throws(
      () => store.put({ evidence: unredactedKey, metadata: { attempt: "key" } }),
      /unredacted secret/,
    );

    const unredactedValue = clone(evidence);
    unredactedValue.request.details.note = "Bearer raw-bearer-token";
    assert.throws(
      () => store.put({ evidence: unredactedValue, metadata: { attempt: "bearer" } }),
      /unredacted secret/,
    );
  });
});

function approvalEvidence(sessionOverrides = {}) {
  return buildApprovalEvidenceSummary({
    session: approvalSession(sessionOverrides),
    auditRecords: [
      {
        id: "audit-record-1",
        timestamp: SESSION_UPDATED_AT,
        type: "tool_call_approval_required",
        toolName: "assemble_local_note",
        decision: "require_approval",
        metadata: {
          approvalId: "approval-record-1",
          ruleId: "local-review",
        },
      },
    ],
    now: SESSION_UPDATED_AT,
  });
}

function approvalSession(overrides = {}) {
  return {
    id: "approval-record-1",
    status: "pending",
    createdAt: SESSION_CREATED_AT,
    updatedAt: SESSION_UPDATED_AT,
    request: approvalRequest(),
    actor: { id: "operator-a", roles: ["author"] },
    reason: "needs local review",
    ruleId: "local-review",
    ...overrides,
  };
}

function approvalRequest(overrides = {}) {
  return {
    type: "tool",
    operation: "tools.call",
    toolName: "assemble_local_note",
    note: "keep-visible",
    arguments: {
      targetPath: "notes/local.md",
      patch: "candidate patch",
    },
    ...overrides,
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
