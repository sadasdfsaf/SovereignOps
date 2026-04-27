import assert from "node:assert/strict";
import test from "node:test";

import {
  RISK_LEVELS,
  validators,
  assertSovereignRecord,
  isRiskLevel,
  isSchemaKind,
  isSovereignId,
  isSovereignRecordId,
  isStatusForKind,
  schemaDefinitions,
  validateApproval,
  validateAttachment,
  validateComment,
  validateDoc,
  validateIncident,
  validateProject,
  validateSovereignRecord,
} from "../src/index.ts";

const timestamp = "2026-04-27T00:00:00.000Z";

const samples = {
  docs: {
    id: "doc_notes",
    workspaceId: "wsp_main",
    projectId: "prj_launch",
    title: "Launch notes",
    body: "Checklist for the local release.",
    status: "active",
    risk: "low",
    ownerActorId: "act_owner",
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  projects: {
    id: "prj_launch",
    workspaceId: "wsp_main",
    name: "Local release",
    status: "active",
    risk: "medium",
    ownerActorId: "act_owner",
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  incidents: {
    id: "inc_import_mismatch",
    workspaceId: "wsp_main",
    projectId: "prj_launch",
    title: "Import mismatch",
    summary: "A local import produced a count mismatch.",
    status: "triaged",
    risk: "high",
    reportedByActorId: "act_owner",
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  comments: {
    id: "cmt_review_note",
    workspaceId: "wsp_main",
    targetId: "doc_notes",
    body: "Ready for review.",
    status: "open",
    risk: "low",
    authorActorId: "act_owner",
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  attachments: {
    id: "att_release_notes",
    workspaceId: "wsp_main",
    targetId: "doc_notes",
    filename: "release-notes.txt",
    contentType: "text/plain",
    byteSize: 512,
    status: "ready",
    risk: "medium",
    uploadedByActorId: "act_owner",
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  approvals: {
    id: "apv_release_notes",
    workspaceId: "wsp_main",
    targetId: "doc_notes",
    summary: "Approve release notes for local sharing.",
    status: "requested",
    risk: "high",
    requestedByActorId: "act_owner",
    approverActorId: "act_reviewer",
    createdAt: timestamp,
    updatedAt: timestamp,
  },
};

test("keeps legacy id validation and exposes shared schema metadata", () => {
  assert.equal(isSovereignId("wsp_main", "wsp"), true);
  assert.equal(isSovereignId("wsp_main", "act"), false);
  assert.deepEqual(RISK_LEVELS, ["low", "medium", "high"]);
  assert.deepEqual(Object.keys(schemaDefinitions), [
    "docs",
    "projects",
    "incidents",
    "comments",
    "attachments",
    "approvals",
  ]);
});

test("validates supported schema kinds and references", () => {
  for (const [kind, record] of Object.entries(samples)) {
    const result = validateSovereignRecord(kind, record);
    assert.equal(result.ok, true, `${kind} should validate`);
    assert.deepEqual(result.issues, []);
    assert.equal(validators[kind](record).ok, true, `${kind} named validator should validate`);
    assert.doesNotThrow(() => assertSovereignRecord(kind, record));
    assert.equal(isSchemaKind(kind), true);
    assert.equal(isStatusForKind(kind, record.status), true);
    assert.equal(isRiskLevel(record.risk), true);
  }

  assert.equal(isSovereignRecordId("doc_notes"), true);
  assert.equal(isSovereignRecordId("key_secret"), false);
});

test("specific validators accept their matching records", () => {
  assert.equal(validateDoc(samples.docs).ok, true);
  assert.equal(validateProject(samples.projects).ok, true);
  assert.equal(validateIncident(samples.incidents).ok, true);
  assert.equal(validateComment(samples.comments).ok, true);
  assert.equal(validateAttachment(samples.attachments).ok, true);
  assert.equal(validateApproval(samples.approvals).ok, true);
});

test("rejects invalid risk values", () => {
  const result = validateSovereignRecord("docs", {
    ...samples.docs,
    risk: "critical",
  });

  assert.equal(result.ok, false);
  assert.equal(result.issues.some((issue) => issue.path === "risk"), true);
  assert.equal(isRiskLevel("critical"), false);
});

test("rejects invalid status values", () => {
  const result = validateSovereignRecord("projects", {
    ...samples.projects,
    status: "queued",
  });

  assert.equal(result.ok, false);
  assert.equal(result.issues.some((issue) => issue.path === "status"), true);
  assert.equal(isStatusForKind("projects", "queued"), false);
});

test("rejects records with the wrong entity id prefix", () => {
  const result = validateDoc({
    ...samples.docs,
    id: "cmt_notes",
  });

  assert.equal(result.ok, false);
  assert.equal(result.issues.some((issue) => issue.path === "id"), true);
});
