import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildIngestSessionQuarantineDecisionSummary,
  buildIngestSessionReview,
  buildIngestSessionReviewEmptyState,
  buildIngestSessionReviewErrorState,
  collectIngestSessionChecksumEvidence,
  collectIngestSessionRouteTimeline,
  collectIngestSessionSdkCalls,
} from "../src/ingestSessionReview.ts";

const clientSessionFixture = JSON.parse(
  readFileSync(
    new URL("../../../examples/ingest-search/client-session.json", import.meta.url),
    "utf8",
  ),
);

const ingestLogFixture = JSON.parse(
  readFileSync(
    new URL("../../../examples/ingest-search/ingest-log.json", import.meta.url),
    "utf8",
  ),
);

function testReviewStateFromFixtureShapedData() {
  const originalSession = structuredClone(clientSessionFixture);
  const originalAudit = structuredClone(ingestLogFixture);
  const state = buildIngestSessionReview(clientSessionFixture, {
    auditEvidence: ingestLogFixture,
  });

  assert.deepEqual(clientSessionFixture, originalSession);
  assert.deepEqual(ingestLogFixture, originalAudit);
  assert.equal(state.schemaVersion, "ingest-search-client-session.v1");
  assert.equal(state.workspaceId, "wsp_ingest_demo");
  assert.equal(state.generatedAt, "2026-04-27T08:10:00.000Z");
  assert.equal(state.localOnly, true);
  assert.equal(state.baseUrl, "http://127.0.0.1:7317");

  assert.deepEqual(
    state.routeTimeline.map((item) => [item.title, item.kind, item.status]),
    [
      ["GET /v1/ingest/sources", "sources", "ready"],
      ["POST /v1/ingest/search", "search", "ready"],
      ["GET /v1/ingest/quarantine", "quarantine", "attention"],
      [
        "POST /v1/ingest/quarantine/qrn_alpha/decision",
        "decision",
        "complete",
      ],
    ],
  );
  assert.equal(
    state.routeTimeline[1].requestSummary,
    'Query "alpha", 1 source filter, limit 5',
  );
  assert.equal(state.routeTimeline[3].requestSummary, "Decision Release");
  assert.match(state.routeTimeline[3].ariaLabel, /Decision route, Complete/);

  assert.deepEqual(
    state.sdkCalls.map((call) => [call.entryPoint, call.kind, call.status]),
    [
      ["normalizeLocalSourceSummaries", "source", "ready"],
      ["buildLocalSearchView", "search", "ready"],
      ["searchLocalText", "search", "ready"],
      ["groupLocalQuarantineRecords", "quarantine", "attention"],
      ["prepareLocalQuarantineDecisionPayload", "decision", "complete"],
    ],
  );
  assert.deepEqual(state.sdkCalls[0].sourceLabels, [
    "notes.md",
    "records.csv",
    "records.json",
  ]);
  assert.equal(state.sdkCalls[4].label, "Prepare Local Quarantine Decision Payload");

  assert.equal(state.quarantineDecisionSummary.totalCount, 2);
  assert.equal(state.quarantineDecisionSummary.pendingCount, 1);
  assert.equal(state.quarantineDecisionSummary.releaseCount, 1);
  assert.equal(state.quarantineDecisionSummary.status, "attention");
  assert.deepEqual(
    state.quarantineDecisionSummary.items.map((item) => [
      item.itemId,
      item.decision,
      item.status,
    ]),
    [
      ["qtn_csv_beta_status", "pending", "attention"],
      ["qrn_alpha", "release", "ready"],
    ],
  );
  assert.equal(
    state.quarantineDecisionSummary.items[1].decisionLabel.label,
    "Release to index",
  );
  assert.equal(state.quarantineDecisionSummary.items[1].actorId, "act_local");

  assert.deepEqual(
    state.checksumEvidence.map((item) => [
      item.sourceLabel,
      item.status,
      item.statusLabel,
    ]),
    [
      ["records.csv", "attention", "Checksum recorded with quarantined items"],
      ["notes.md", "ready", "Checksum recorded"],
      ["records.json", "ready", "Checksum recorded"],
    ],
  );
  assert.equal(state.checksumEvidence[0].algorithm, "sha256");
  assert.equal(
    state.checksumEvidence[0].checksumLabel,
    "42a535013f71...0db93e6a",
  );
}

function testFocusedBuildersSortingAndAuditDecisionInputs() {
  const session = {
    generatedAt: "2026-04-27T09:00:00.000Z",
    api: {
      routes: [
        {
          id: "third",
          sequence: 3,
          method: "POST",
          routePath: "/v1/ingest/source",
          request: { sourceUri: "fixture://ingest-search/zeta.txt" },
        },
        {
          id: "first",
          sequence: 1,
          method: "GET",
          routePath: "/v1/ingest/sources",
        },
        {
          id: "second",
          sequence: 2,
          method: "GET",
          routePath: "/v1/ingest/quarantine",
        },
      ],
    },
    sdk: {
      entryPoints: [
        "zetaHelper",
        "prepareLocalQuarantineDecisionPayload",
        "searchLocalText",
        "normalizeLocalSourceSummaries",
      ],
      sourceUris: ["fixture://ingest-search/zeta.txt"],
    },
    web: {
      quarantineQueue: {
        items: [
          {
            itemId: "q_retry",
            sourceUri: "fixture://ingest-search/zeta.txt",
            decision: "pending",
          },
        ],
      },
    },
  };
  const auditEvidence = {
    quarantineDecisions: [
      {
        item_id: "q_retry",
        source_uri: "fixture://ingest-search/zeta.txt",
        decision: "retry",
        actor_id: "act_retry",
        reason: "Try the local parser again.",
        timestamp: "2026-04-27T09:05:00.000Z",
      },
    ],
    checksumEvidence: [
      {
        id: "missing_checksum",
        source_uri: "fixture://ingest-search/beta.txt",
        action: "validated",
        at: "2026-04-27T09:01:00.000Z",
      },
      {
        id: "ok_checksum",
        sourceUri: "fixture://ingest-search/alpha.txt",
        checksum: "abc123",
        action: "validated",
        at: "2026-04-27T09:02:00.000Z",
        documents_indexed: 1,
      },
    ],
  };

  assert.deepEqual(
    collectIngestSessionRouteTimeline(session).map((item) => item.routeId),
    ["first", "second", "third"],
  );
  assert.deepEqual(
    collectIngestSessionSdkCalls(session).map((call) => call.entryPoint),
    [
      "normalizeLocalSourceSummaries",
      "searchLocalText",
      "prepareLocalQuarantineDecisionPayload",
      "zetaHelper",
    ],
  );

  const decisions = buildIngestSessionQuarantineDecisionSummary(session, {
    auditEvidence,
  });
  assert.equal(decisions.totalCount, 1);
  assert.equal(decisions.pendingCount, 0);
  assert.equal(decisions.retryCount, 1);
  assert.equal(decisions.status, "complete");
  assert.equal(decisions.items[0].decision, "retry");
  assert.equal(decisions.items[0].actorId, "act_retry");
  assert.equal(decisions.items[0].sourceLabel, "zeta.txt");

  const checksumEvidence = collectIngestSessionChecksumEvidence(auditEvidence);
  assert.deepEqual(
    checksumEvidence.map((item) => [item.evidenceId, item.status]),
    [
      ["missing_checksum", "error"],
      ["ok_checksum", "ready"],
    ],
  );
  assert.equal(checksumEvidence[0].checksumLabel, "Missing checksum");
  assert.equal(checksumEvidence[1].actionLabel, "Validated");
}

function testReturnedViewModelsAreDefensivelyCloned() {
  const state = buildIngestSessionReview(clientSessionFixture, {
    auditEvidence: ingestLogFixture,
  });

  state.routeTimeline[0].detailLabels.push("mutated");
  state.sdkCalls[0].sourceLabels[0] = "mutated";
  state.quarantineDecisionSummary.items[0].decisionLabel.label = "mutated";
  state.quarantineDecisionSummary.items[0].detailLabels.push("mutated");
  state.checksumEvidence[0].detailLabels.push("mutated");
  state.emptyStates.checksumEvidence.label = "mutated";

  const rebuilt = buildIngestSessionReview(clientSessionFixture, {
    auditEvidence: ingestLogFixture,
  });
  assert.equal(rebuilt.routeTimeline[0].detailLabels.includes("mutated"), false);
  assert.equal(rebuilt.sdkCalls[0].sourceLabels[0], "notes.md");
  assert.equal(
    rebuilt.quarantineDecisionSummary.items[0].decisionLabel.label,
    "Needs review",
  );
  assert.equal(
    rebuilt.quarantineDecisionSummary.items[0].detailLabels.includes("mutated"),
    false,
  );
  assert.equal(rebuilt.checksumEvidence[0].detailLabels.includes("mutated"), false);
  assert.equal(rebuilt.emptyStates.checksumEvidence.label, "No checksum evidence");
}

function testFallbackAndErrorStates() {
  const state = buildIngestSessionReview(
    "not a session",
    {
      auditEvidence: 42,
      defaultTimestamp: "2026-04-27T09:30:00.000Z",
    },
  );

  assert.equal(state.generatedAt, "2026-04-27T09:30:00.000Z");
  assert.equal(state.localOnly, false);
  assert.equal(state.routeTimeline.length, 0);
  assert.equal(state.sdkCalls.length, 0);
  assert.equal(state.quarantineDecisionSummary.status, "empty");
  assert.equal(state.checksumEvidence.length, 0);
  assert.deepEqual(
    state.errorStates.map((error) => [
      error.context,
      error.errorState.label,
      error.errorState.description,
    ]),
    [
      ["session", "Session could not load", "Session data must be an object."],
      [
        "checksum",
        "Checksum evidence could not load",
        "Checksum evidence must be an object or an array.",
      ],
    ],
  );
  assert.deepEqual(collectIngestSessionRouteTimeline(undefined), []);
  assert.deepEqual(collectIngestSessionSdkCalls(undefined), []);
  assert.deepEqual(collectIngestSessionChecksumEvidence(undefined), []);

  assert.deepEqual(buildIngestSessionReviewEmptyState("routes"), {
    id: "ingest_session_routes_empty",
    label: "No client routes captured",
    description: "Client route calls will appear after a session is captured.",
    ariaLabel: "No ingest client routes are available",
  });
  assert.deepEqual(
    buildIngestSessionReviewErrorState("sdk", new Error("SDK list failed")),
    {
      id: "ingest_session_sdk_error",
      context: "sdk",
      errorState: {
        id: "ingest_session_sdk_error",
        label: "SDK calls could not load",
        description: "SDK list failed",
        ariaLabel: "SDK calls could not load",
        retryLabel: "Retry SDK calls",
      },
    },
  );
}

testReviewStateFromFixtureShapedData();
testFocusedBuildersSortingAndAuditDecisionInputs();
testReturnedViewModelsAreDefensivelyCloned();
testFallbackAndErrorStates();

console.log("ingest session review tests passed");
