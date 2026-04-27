import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  assertSovereignRecord,
  isRiskLevel,
  isSovereignId,
  isSovereignRecordId,
  isStatusForKind,
  schemaDefinitions,
  validateSovereignRecord,
  validators,
} from "../src/index.ts";

const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url));
const compatibilityFixture = "schema-compatibility.v1.json";
const schemaKinds = Object.keys(schemaDefinitions);

const actorFieldByKind = {
  docs: "ownerActorId",
  projects: "ownerActorId",
  incidents: "reportedByActorId",
  comments: "authorActorId",
  attachments: "uploadedByActorId",
  approvals: "requestedByActorId",
};

test("legacy fixture bundle covers the exported schema kinds", async () => {
  const bundle = await readFixtureJson(compatibilityFixture);
  const records = recordsByKind(bundle);

  assert.equal(bundle.schemaVersion, "schema-compatibility.v1");
  assert.deepEqual(bundle.records.map((entry) => entry.kind), schemaKinds);
  assert.deepEqual(Object.keys(records), schemaKinds);

  for (const kind of schemaKinds) {
    assert.deepEqual(records[kind], await readFixtureJson(`${kind}.valid.json`));
  }
});

test("old valid fixtures still pass exported validators", async () => {
  for (const kind of schemaKinds) {
    const record = await readFixtureJson(`${kind}.valid.json`);
    const result = validateSovereignRecord(kind, record);

    assert.equal(result.ok, true, `${kind}: ${formatIssues(result.issues)}`);
    assert.deepEqual(result.issues, []);
    assert.equal(validators[kind](record).ok, true, `${kind} named validator should pass`);
    assert.doesNotThrow(() => assertSovereignRecord(kind, record));
  }
});

test("compatibility bundle records pass exported validators", async () => {
  const records = recordsByKind(await readFixtureJson(compatibilityFixture));

  for (const kind of schemaKinds) {
    const result = validateSovereignRecord(kind, records[kind]);

    assert.equal(result.ok, true, `${kind}: ${formatIssues(result.issues)}`);
    assert.deepEqual(result.issues, []);
  }
});

test("invalid risk values are rejected without mutating compatibility fixtures", async () => {
  const records = recordsByKind(await readFixtureJson(compatibilityFixture));

  for (const kind of schemaKinds) {
    const invalid = cloneJson(records[kind]);
    invalid.risk = "critical";

    const result = validateSovereignRecord(kind, invalid);

    assert.equal(result.ok, false, `${kind} should reject risk`);
    assert.ok(issuePaths(result.issues).includes("risk"), `${kind} should report risk`);
    assert.equal(isRiskLevel(invalid.risk), false);
    assert.notEqual(invalid, records[kind]);
    assert.notEqual(records[kind].risk, "critical");
  }
});

test("invalid status values are rejected without mutating compatibility fixtures", async () => {
  const records = recordsByKind(await readFixtureJson(compatibilityFixture));

  for (const kind of schemaKinds) {
    const invalid = cloneJson(records[kind]);
    invalid.status = "queued";

    const result = validateSovereignRecord(kind, invalid);

    assert.equal(result.ok, false, `${kind} should reject status`);
    assert.ok(issuePaths(result.issues).includes("status"), `${kind} should report status`);
    assert.equal(isStatusForKind(kind, invalid.status), false);
    assert.notEqual(invalid, records[kind]);
    assert.notEqual(records[kind].status, "queued");
  }
});

test("invalid id prefixes are rejected without mutating compatibility fixtures", async () => {
  const records = recordsByKind(await readFixtureJson(compatibilityFixture));

  for (const kind of schemaKinds) {
    const invalidEntityId = cloneJson(records[kind]);
    invalidEntityId.id = "obj_legacy";

    const entityResult = validateSovereignRecord(kind, invalidEntityId);

    assert.equal(entityResult.ok, false, `${kind} should reject entity id prefix`);
    assert.ok(issuePaths(entityResult.issues).includes("id"), `${kind} should report id`);
    assert.equal(isSovereignId(invalidEntityId.id, schemaDefinitions[kind].idPrefix), false);
    assert.notEqual(records[kind].id, "obj_legacy");

    const invalidWorkspaceId = cloneJson(records[kind]);
    invalidWorkspaceId.workspaceId = "act_workspace";

    const workspaceResult = validateSovereignRecord(kind, invalidWorkspaceId);

    assert.equal(workspaceResult.ok, false, `${kind} should reject workspace id prefix`);
    assert.ok(issuePaths(workspaceResult.issues).includes("workspaceId"), `${kind} should report workspaceId`);
    assert.equal(isSovereignId(invalidWorkspaceId.workspaceId, "wsp"), false);
    assert.notEqual(records[kind].workspaceId, "act_workspace");

    const invalidActorId = cloneJson(records[kind]);
    const actorField = actorFieldByKind[kind];
    invalidActorId[actorField] = "wsp_actor";

    const actorResult = validateSovereignRecord(kind, invalidActorId);

    assert.equal(actorResult.ok, false, `${kind} should reject actor id prefix`);
    assert.ok(issuePaths(actorResult.issues).includes(actorField), `${kind} should report ${actorField}`);
    assert.equal(isSovereignId(invalidActorId[actorField], "act"), false);
    assert.notEqual(records[kind][actorField], "wsp_actor");
  }
});

test("invalid reference id prefixes are rejected for linked records", async () => {
  const records = recordsByKind(await readFixtureJson(compatibilityFixture));

  for (const kind of ["docs", "incidents"]) {
    const invalid = cloneJson(records[kind]);
    invalid.projectId = "doc_wrong_project";

    const result = validateSovereignRecord(kind, invalid);

    assert.equal(result.ok, false, `${kind} should reject project id prefix`);
    assert.ok(issuePaths(result.issues).includes("projectId"), `${kind} should report projectId`);
    assert.notEqual(records[kind].projectId, "doc_wrong_project");
  }

  for (const kind of ["comments", "attachments", "approvals"]) {
    const invalid = cloneJson(records[kind]);
    invalid.targetId = "act_owner";

    const result = validateSovereignRecord(kind, invalid);

    assert.equal(result.ok, false, `${kind} should reject target id prefix`);
    assert.ok(issuePaths(result.issues).includes("targetId"), `${kind} should report targetId`);
    assert.equal(isSovereignRecordId(invalid.targetId), false);
    assert.notEqual(records[kind].targetId, "act_owner");
  }
});

test("compatibility fixture clone boundaries stay isolated", async () => {
  const bundle = await readFixtureJson(compatibilityFixture);
  const clonedBundle = cloneJson(bundle);
  const records = recordsByKind(bundle);
  const clonedRecords = recordsByKind(clonedBundle);

  assert.notEqual(clonedBundle, bundle);
  assert.notEqual(clonedBundle.records, bundle.records);

  for (const kind of schemaKinds) {
    assert.notEqual(clonedRecords[kind], records[kind]);
  }

  clonedRecords.docs.title = "Changed locally";
  clonedRecords.comments.targetId = "act_owner";
  clonedRecords.attachments.byteSize = 2048;

  assert.equal(records.docs.title, "Launch notes");
  assert.equal(records.comments.targetId, "doc_notes");
  assert.equal(records.attachments.byteSize, 512);

  for (const kind of schemaKinds) {
    const result = validateSovereignRecord(kind, records[kind]);
    assert.equal(result.ok, true, `${kind}: ${formatIssues(result.issues)}`);
  }
});

async function readFixtureJson(file) {
  return JSON.parse(await readFile(join(fixturesDir, file), "utf8"));
}

function issuePaths(issues) {
  return issues.map((issue) => issue.path);
}

function recordsByKind(bundle) {
  return Object.fromEntries(bundle.records.map((entry) => [entry.kind, entry.record]));
}

function formatIssues(issues) {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
