import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  assertSovereignRecord,
  assertWorkspaceSessionSnapshotRetentionCleanupRequest,
  assertWorkspaceSessionSnapshotRetentionCleanupResponse,
  isRiskLevel,
  isSovereignId,
  isSovereignRecordId,
  isStatusForKind,
  schemaDefinitions,
  validateSovereignRecord,
  validateWorkspaceSessionSnapshotRetentionCleanupObject,
  validateWorkspaceSessionSnapshotRetentionCleanupRequest,
  validateWorkspaceSessionSnapshotRetentionCleanupResponse,
  validators,
  workspaceSessionSnapshotRetentionCleanupSourceKeys,
  workspaceSessionSnapshotRetentionCleanupValidators,
} from "../src/index.ts";

const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url));
const compatibilityFixture = "schema-compatibility.v1.json";
const retentionCleanupCompatibilityFixture = "schema-compatibility-retention-cleanup.json";
const schemaKinds = Object.keys(schemaDefinitions);
const retentionCleanupContractCases = [
  {
    kind: "workspaceSessionSnapshotRetentionCleanupRequest",
    contractKey: "request",
    fixture: "workspace-session-snapshot-retention-cleanup-request.valid.json",
    validator: validateWorkspaceSessionSnapshotRetentionCleanupRequest,
    asserter: assertWorkspaceSessionSnapshotRetentionCleanupRequest,
  },
  {
    kind: "workspaceSessionSnapshotRetentionCleanupResponse",
    contractKey: "response",
    fixture: "workspace-session-snapshot-retention-cleanup-response.valid.json",
    validator: validateWorkspaceSessionSnapshotRetentionCleanupResponse,
    asserter: assertWorkspaceSessionSnapshotRetentionCleanupResponse,
  },
];

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

test("retention cleanup compatibility bundle pins latest request and response fixtures", async () => {
  const bundle = await readFixtureJson(retentionCleanupCompatibilityFixture);

  assert.equal(bundle.schemaVersion, "schema-compatibility-retention-cleanup.v1");
  assert.deepEqual(Object.keys(bundle.contracts), ["request", "response"]);

  for (const { contractKey, fixture } of retentionCleanupContractCases) {
    assert.deepEqual(bundle.contracts[contractKey], await readFixtureJson(fixture));
  }
});

test("retention cleanup compatibility fixtures pass exported validators", async () => {
  const bundle = await readFixtureJson(retentionCleanupCompatibilityFixture);

  for (const { kind, contractKey, validator, asserter } of retentionCleanupContractCases) {
    const contract = bundle.contracts[contractKey];
    const result = validator(contract);
    const genericResult = validateWorkspaceSessionSnapshotRetentionCleanupObject(kind, contract);

    assert.equal(result.ok, true, `${kind}: ${formatIssues(result.issues)}`);
    assert.deepEqual(result.issues, []);
    assert.equal(genericResult.ok, true, `${kind}: ${formatIssues(genericResult.issues)}`);
    assert.equal(workspaceSessionSnapshotRetentionCleanupValidators[kind](contract).ok, true);
    assert.doesNotThrow(() => asserter(contract));
  }
});

test("retention cleanup accepts legacy single-section requests and redacted fields", async () => {
  const bundle = await readFixtureJson(retentionCleanupCompatibilityFixture);
  const originalBundle = cloneJson(bundle);
  const request = bundle.contracts.request;
  const response = bundle.contracts.response;
  const presentSourceKeys = workspaceSessionSnapshotRetentionCleanupSourceKeys.filter(
    (sourceKey) => request[sourceKey] !== undefined,
  );

  assert.deepEqual(presentSourceKeys, ["records"]);

  for (const sourceKey of workspaceSessionSnapshotRetentionCleanupSourceKeys) {
    const legacyRequest = {
      [sourceKey]: cloneJson(request.records),
      maxCount: request.maxCount,
      maxAgeMs: request.maxAgeMs,
      now: request.now,
    };

    legacyRequest[sourceKey][0].path = "[redacted:path:abcdef123456]";
    legacyRequest[sourceKey][0].workspaceId = "[redacted:workspace]";
    legacyRequest[sourceKey][0].deviceId = "[redacted:device]";
    legacyRequest[sourceKey][0].sessionId = "[redacted:session:legacy]";

    const result = validateWorkspaceSessionSnapshotRetentionCleanupRequest(legacyRequest);

    assert.equal(result.ok, true, `${sourceKey}: ${formatIssues(result.issues)}`);
  }

  const redactedResponse = cloneJson(response);
  for (const action of [redactedResponse.actions[0], redactedResponse.keepActions[0]]) {
    action.summary.workspaceId = "[redacted:workspace]";
    action.summary.deviceId = "[redacted:device]";
    action.summary.sessionId = "[redacted:session:latest]";
    action.summary.fileRef = "[redacted:path:abcdef123456]";
    action.summary.filePathKind = "absolute";
  }

  const responseResult = validateWorkspaceSessionSnapshotRetentionCleanupResponse(redactedResponse);

  assert.equal(responseResult.ok, true, formatIssues(responseResult.issues));
  assert.deepEqual(bundle, originalBundle);
});

test("retention cleanup rejects raw path token and secret metadata without mutating fixtures", async () => {
  const bundle = await readFixtureJson(retentionCleanupCompatibilityFixture);
  const originalBundle = cloneJson(bundle);
  const invalid = cloneJson(bundle.contracts.request);

  invalid.records[0].path = "C:/Users/DELL/snapshot-cleanup/raw.json";
  invalid.records[0].metadata.rawPath = "C:/Users/DELL/snapshot-cleanup/raw.json";
  invalid.records[0].metadata.lockValue = "lock_cleanupraw";
  invalid.records[0].metadata.apiToken = "sk-raw-cleanup-secret";
  invalid.records[0].metadata.secretLabel = "masked locally";

  const result = validateWorkspaceSessionSnapshotRetentionCleanupRequest(invalid);
  const paths = issuePaths(result.issues);

  assert.equal(result.ok, false);
  assert.ok(paths.includes("records[0].path"));
  assert.ok(paths.includes("records[0].metadata.rawPath"));
  assert.ok(paths.includes("records[0].metadata.lockValue"));
  assert.ok(paths.includes("records[0].metadata.apiToken"));
  assert.ok(paths.includes("records[0].metadata.secretLabel"));
  assert.deepEqual(bundle, originalBundle);
});

test("retention cleanup rejects wrong dry run durability constants without mutating fixtures", async () => {
  const bundle = await readFixtureJson(retentionCleanupCompatibilityFixture);
  const originalBundle = cloneJson(bundle);
  const invalid = cloneJson(bundle.contracts.response);

  invalid.dryRun = false;
  invalid.durableWrites = true;

  const result = validateWorkspaceSessionSnapshotRetentionCleanupResponse(invalid);
  const paths = issuePaths(result.issues);

  assert.equal(result.ok, false);
  assert.ok(paths.includes("dryRun"));
  assert.ok(paths.includes("durableWrites"));
  assert.equal(bundle.contracts.response.dryRun, true);
  assert.equal(bundle.contracts.response.durableWrites, false);
  assert.deepEqual(bundle, originalBundle);
});

test("retention cleanup rejects count mismatches without mutating fixtures", async () => {
  const bundle = await readFixtureJson(retentionCleanupCompatibilityFixture);
  const originalBundle = cloneJson(bundle);
  const invalid = cloneJson(bundle.contracts.response);

  invalid.keepCount = invalid.keepCount + 1;
  invalid.reviewActions = [];

  const result = validateWorkspaceSessionSnapshotRetentionCleanupResponse(invalid);
  const paths = issuePaths(result.issues);

  assert.equal(result.ok, false);
  assert.ok(paths.includes("keepCount"));
  assert.ok(paths.includes("reviewCount"));
  assert.ok(paths.includes("actions"));
  assert.deepEqual(bundle, originalBundle);
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
