import assert from "node:assert/strict";
import test from "node:test";

import {
  MigrationPlanError,
  MigrationRunError,
  WORKSPACE_STORE_ERROR_CODES,
  fingerprintWorkspaceMetadata,
  planWorkspaceMetadataMigrations,
  runWorkspaceMetadataMigrations,
  serializeDeterministicJson,
} from "../src/index.ts";

const sourceMetadata = Object.freeze({
  schemaVersion: 1,
  workspaceId: "wsp_alpha",
  items: [
    {
      id: "itm_notes",
      title: "Local notes",
      updatedAt: "2026-04-27T00:00:00.000Z",
    },
    {
      id: "itm_tasks",
      title: "Task list",
      updatedAt: "2026-04-27T00:01:00.000Z",
    },
  ],
});

test("plans ordered migrations with deterministic summaries and rollback notes", () => {
  const plan = planWorkspaceMetadataMigrations(sourceMetadata, metadataMigrations(), {
    targetVersion: 3,
  });
  const repeatedPlan = planWorkspaceMetadataMigrations(sourceMetadata, metadataMigrations(), {
    targetVersion: 3,
  });

  assert.equal(plan.sourceVersion, 1);
  assert.equal(plan.targetVersion, 3);
  assert.equal(plan.dryRun, true);
  assert.equal(plan.alreadyCurrent, false);
  assert.deepEqual(
    plan.steps.map((step) => step.id),
    ["metadata.add-item-index", "metadata.add-local-state"],
  );
  assert.deepEqual(plan.rollbackNotes, [
    "Remove localState and restore schemaVersion 2 from a saved metadata snapshot.",
    "Remove itemIndex and restore schemaVersion 1 from a saved metadata snapshot.",
  ]);
  assert.equal(plan.summary.fingerprint, repeatedPlan.summary.fingerprint);
  assert.equal(plan.fingerprint, repeatedPlan.fingerprint);
  assert.match(plan.fingerprint, /^fnv1a64:[0-9a-f]{16}$/);
  assert.equal(sourceMetadata.schemaVersion, 1);
  assert.equal(sourceMetadata.itemIndex, undefined);

  assert.throws(() => {
    plan.steps.push({ id: "x" });
  }, TypeError);
});

test("runs migrations in memory without mutating the source metadata", () => {
  const result = runWorkspaceMetadataMigrations(sourceMetadata, metadataMigrations(), {
    targetVersion: 3,
  });

  assert.equal(result.metadata.schemaVersion, 3);
  assert.deepEqual(result.metadata.itemIndex, {
    itm_notes: "2026-04-27T00:00:00.000Z",
    itm_tasks: "2026-04-27T00:01:00.000Z",
  });
  assert.deepEqual(result.metadata.localState, {
    lastCursor: null,
    syncMode: "manual",
  });
  assert.deepEqual(
    result.appliedSteps.map((step) => step.status),
    ["applied", "applied"],
  );
  assert.equal(result.summary.plannedStepCount, 2);
  assert.equal(result.summary.appliedStepCount, 2);
  assert.equal(result.summary.skippedStepCount, 0);
  assert.notEqual(result.summary.sourceFingerprint, result.summary.targetFingerprint);
  assert.equal(sourceMetadata.schemaVersion, 1);
  assert.equal(sourceMetadata.itemIndex, undefined);

  assert.throws(() => {
    result.metadata.localState.syncMode = "auto";
  }, TypeError);
});

test("uses idempotency guards to skip already-applied changes", () => {
  const result = runWorkspaceMetadataMigrations(
    {
      ...sourceMetadata,
      itemIndex: {
        itm_notes: "2026-04-27T00:00:00.000Z",
        itm_tasks: "2026-04-27T00:01:00.000Z",
      },
    },
    metadataMigrations(),
    { targetVersion: 3 },
  );

  assert.deepEqual(
    result.appliedSteps.map((step) => [step.id, step.status]),
    [
      ["metadata.add-item-index", "skipped"],
      ["metadata.add-local-state", "applied"],
    ],
  );
  assert.equal(result.summary.appliedStepCount, 1);
  assert.equal(result.summary.skippedStepCount, 1);
  assert.equal(result.metadata.schemaVersion, 3);
});

test("supports runner dry runs without invoking migration functions", () => {
  const steps = metadataMigrations().map((step) => ({
    ...step,
    migrate() {
      throw new Error("dry run should not execute migration functions");
    },
  }));

  const result = runWorkspaceMetadataMigrations(sourceMetadata, steps, {
    dryRun: true,
    targetVersion: 3,
  });

  assert.equal(result.metadata.schemaVersion, 1);
  assert.equal(result.appliedSteps.length, 0);
  assert.equal(result.summary.dryRun, true);
  assert.equal(result.summary.plannedStepCount, 2);
  assert.equal(result.summary.sourceFingerprint, result.summary.targetFingerprint);
});

test("reports missing and ambiguous migration paths with explicit errors", () => {
  assert.throws(
    () => planWorkspaceMetadataMigrations(sourceMetadata, [metadataMigrations()[1]], {
      targetVersion: 3,
    }),
    (error) => {
      assert.equal(error instanceof MigrationPlanError, true);
      assert.equal(error.code, WORKSPACE_STORE_ERROR_CODES.MIGRATION_PATH_NOT_FOUND);
      assert.deepEqual(error.details, {
        fromVersion: 1,
        targetVersion: 3,
      });
      return true;
    },
  );

  assert.throws(
    () => planWorkspaceMetadataMigrations(
      sourceMetadata,
      [
        metadataMigrations()[0],
        {
          ...metadataMigrations()[0],
          id: "metadata.add-search-list",
          toVersion: 3,
        },
      ],
      { targetVersion: 3 },
    ),
    (error) => {
      assert.equal(error instanceof MigrationPlanError, true);
      assert.equal(error.code, WORKSPACE_STORE_ERROR_CODES.MIGRATION_PATH_AMBIGUOUS);
      assert.deepEqual(error.details.stepIds, [
        "metadata.add-item-index",
        "metadata.add-search-list",
      ]);
      return true;
    },
  );
});

test("reports invalid migration results and guard failures", () => {
  assert.throws(
    () => runWorkspaceMetadataMigrations(
      sourceMetadata,
      [
        {
          ...metadataMigrations()[0],
          migrate(metadata) {
            return {
              ...metadata,
              schemaVersion: 1,
            };
          },
        },
      ],
      { targetVersion: 2 },
    ),
    (error) => {
      assert.equal(error instanceof MigrationRunError, true);
      assert.equal(error.code, WORKSPACE_STORE_ERROR_CODES.MIGRATION_RESULT_INVALID);
      return true;
    },
  );

  assert.throws(
    () => runWorkspaceMetadataMigrations(
      sourceMetadata,
      [
        {
          ...metadataMigrations()[0],
          isApplied() {
            throw new Error("guard unavailable");
          },
        },
      ],
      { targetVersion: 2 },
    ),
    (error) => {
      assert.equal(error instanceof MigrationRunError, true);
      assert.equal(error.code, WORKSPACE_STORE_ERROR_CODES.IDEMPOTENCY_GUARD_FAILED);
      return true;
    },
  );
});

test("serializes and fingerprints metadata deterministically", () => {
  assert.equal(
    serializeDeterministicJson({ z: 1, a: { b: false, a: null } }),
    '{"a":{"a":null,"b":false},"z":1}',
  );
  assert.equal(
    fingerprintWorkspaceMetadata({
      workspaceId: "wsp_alpha",
      items: [{ title: "Local notes", id: "itm_notes" }],
      schemaVersion: 1,
    }),
    fingerprintWorkspaceMetadata({
      schemaVersion: 1,
      items: [{ id: "itm_notes", title: "Local notes" }],
      workspaceId: "wsp_alpha",
    }),
  );
});

function metadataMigrations() {
  return [
    {
      id: "metadata.add-item-index",
      fromVersion: 1,
      toVersion: 2,
      summary: "Add an item index for local lookup.",
      rollbackNote: "Remove itemIndex and restore schemaVersion 1 from a saved metadata snapshot.",
      isApplied(metadata) {
        return isRecord(metadata.itemIndex);
      },
      migrate(metadata) {
        return {
          ...metadata,
          schemaVersion: 2,
          itemIndex: Object.fromEntries(
            metadata.items.map((item) => [item.id, item.updatedAt]),
          ),
        };
      },
    },
    {
      id: "metadata.add-local-state",
      fromVersion: 2,
      toVersion: 3,
      summary: "Add local state defaults for workspace metadata.",
      rollbackNote: "Remove localState and restore schemaVersion 2 from a saved metadata snapshot.",
      isApplied(metadata) {
        return isRecord(metadata.localState) && metadata.localState.syncMode === "manual";
      },
      migrate(metadata) {
        return {
          ...metadata,
          schemaVersion: 3,
          localState: {
            lastCursor: null,
            syncMode: "manual",
          },
        };
      },
    },
  ];
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
