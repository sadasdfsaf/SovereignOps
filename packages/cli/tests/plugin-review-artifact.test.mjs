import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createPluginReviewArtifactPreview,
  isPluginReviewArtifactCommand,
  runPluginReviewArtifactCli,
} from "../src/pluginReviewArtifact.ts";

const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));
const tempDir = fileURLToPath(new URL("../.tmp-plugin-review-artifact/", import.meta.url));

test("renders plugin review artifact previews deterministically with redaction", async () => {
  const manifestPath = await writeJson("manifest.json", manifest());
  const sandboxPath = await writeJson("sandbox.json", {
    sandboxReviews: [
      {
        id: "sandbox_warning",
        outcome: "warning",
        title: "Fixture coverage warning",
        checkedAt: "2026-04-27T06:15:00.000Z",
        pluginId: "plugin.review-helper",
        findingCount: 2,
        details: {
          apiToken: "super-secret-token",
          note: "Add one more fixture before sharing the artifact.",
        },
      },
      {
        id: "sandbox_other",
        outcome: "failed",
        title: "Other plugin finding",
        checkedAt: "2026-04-27T06:20:00.000Z",
        pluginId: "plugin.other-helper",
      },
    ],
  });
  const gatePath = await writeJson("gates.json", [
    {
      gateId: "review_checklist",
      label: "Review checklist",
      status: "required",
      pluginIds: ["plugin.review-helper"],
      ruleIds: ["rule_release_notes"],
      affectedRuleCount: 1,
      details: {
        authorization: "Bearer abc123456789",
      },
    },
  ]);
  const auditPath = await writeJson("audit.json", {
    auditSummaries: [
      {
        status: "warning",
        count: 3,
        pluginId: "plugin.review-helper",
        ruleId: "rule_release_notes",
        lastEventAt: "2026-04-27T06:30:00.000Z",
        details: {
          sessionToken: "session-secret",
        },
      },
    ],
  });

  try {
    const argv = [
      "plugin-review-artifact",
      "preview",
      "--manifest",
      manifestPath,
      "--sandbox-review",
      sandboxPath,
      "--automation-gate-summary",
      gatePath,
      "--automation-audit-summary",
      auditPath,
      "--generated-at",
      "2026-04-27T06:45:00.000Z",
    ];
    const first = await runPluginReviewArtifactCli(argv);
    const second = await runPluginReviewArtifactCli([
      "plugin",
      "review",
      "artifact",
      "preview",
      ...argv.slice(2),
    ]);
    assert.ok(first);
    assert.ok(second);
    const payload = JSON.parse(first.stdout);

    assert.equal(first.exitCode, 0);
    assert.equal(first.stderr, "");
    assert.equal(first.stdout, second.stdout);
    assert.equal(payload.kind, "plugin-review-artifact.preview");
    assert.equal(payload.plugin.id, "plugin.review-helper");
    assert.equal(payload.generatedAt, "2026-04-27T06:45:00.000Z");
    assert.equal(payload.sources.manifest.path, "packages/cli/.tmp-plugin-review-artifact/manifest.json");
    assert.equal(payload.sources.sandboxReviews[0].itemCount, 2);
    assert.equal(payload.summary.sandboxReviewCount, 1);
    assert.equal(payload.summary.sandboxWarningCount, 1);
    assert.equal(payload.summary.requiredGateCount, 1);
    assert.equal(payload.summary.automationAuditEventCount, 3);
    assert.equal(payload.summary.redactionCount, 3);
    assert.match(payload.artifactId, /^plugin_review_artifact\.review_helper\.[0-9a-f]{12}$/);
    assert.match(payload.fingerprint, /^sha256:[0-9a-f]{64}$/);
    assert.match(payload.plugin.fingerprint, /^sha256:[0-9a-f]{64}$/);
    assert.equal(first.stdout.includes("super-secret-token"), false);
    assert.equal(first.stdout.includes("Bearer abc123456789"), false);
    assert.equal(first.stdout.includes("session-secret"), false);
    assert.deepEqual(
      payload.redactions.map((redaction) => redaction.path),
      [
        "$.automationAuditSummaries[0].details.sessionToken",
        "$.automationGateSummaries[0].details.authorization",
        "$.sandboxReviews[0].details.apiToken",
      ],
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("creates deterministic preview artifacts from the pure helper", () => {
  const first = createPluginReviewArtifactPreview({
    manifest: manifest(),
    sandboxReviews: [
      {
        outcome: "passed",
        title: "Sandbox completed",
      },
    ],
  });
  const second = createPluginReviewArtifactPreview({
    manifest: manifest(),
    sandboxReviews: [
      {
        outcome: "passed",
        title: "Sandbox completed",
      },
    ],
  });

  assert.deepEqual(first, second);
  assert.equal(first.generatedAt, "2026-04-27T00:00:00.000Z");
  assert.equal(first.sandboxReviews[0].pluginId, "plugin.review-helper");
  assert.match(first.sandboxReviews[0].id, /^sandbox_review\.[0-9a-f]{12}$/);
});

test("reports unsafe paths and invalid manifests as JSON errors", async () => {
  const unsafePath = path.resolve(workspaceRoot, "..", "outside.json");
  const unsafe = await runPluginReviewArtifactCli([
    "plugin-review-artifact",
    "preview",
    "--manifest",
    unsafePath,
  ]);
  const invalidManifestPath = await writeJson("invalid-manifest.json", {
    id: "plugin.review-helper",
  });

  try {
    const invalidManifest = await runPluginReviewArtifactCli([
      "plugin-review-artifact",
      "preview",
      "--manifest",
      invalidManifestPath,
    ]);
    assert.ok(unsafe);
    assert.ok(invalidManifest);
    const unsafePayload = JSON.parse(unsafe.stderr);
    const invalidPayload = JSON.parse(invalidManifest.stderr);

    assert.equal(unsafe.exitCode, 2);
    assert.equal(unsafe.stdout, "");
    assert.equal(unsafePayload.error.code, "usage_error");
    assert.match(unsafePayload.error.message, /must stay inside/);

    assert.equal(invalidManifest.exitCode, 2);
    assert.equal(invalidManifest.stdout, "");
    assert.equal(invalidPayload.error.code, "invalid_plugin_review_artifact");
    assert.match(invalidPayload.error.message, /manifest/i);
    assert.ok(invalidPayload.error.details.issues.length > 0);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("detects plugin review artifact commands", () => {
  assert.equal(isPluginReviewArtifactCommand(["plugin-review-artifact", "preview"]), true);
  assert.equal(isPluginReviewArtifactCommand(["plugin", "review-artifact", "preview"]), true);
  assert.equal(isPluginReviewArtifactCommand(["plugin", "review", "artifact", "preview"]), true);
  assert.equal(isPluginReviewArtifactCommand(["plugin", "review", "summary"]), false);
});

async function writeJson(name, value) {
  await mkdir(tempDir, { recursive: true });
  const outputPath = path.join(tempDir, name);
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`);
  return outputPath;
}

function manifest() {
  return {
    id: "plugin.review-helper",
    name: "Review Helper",
    version: "0.1.0",
    description: "Builds a local preview artifact from checklist records.",
    entrypoint: "index.mjs",
    permissions: ["propose_agent_action", "read_object"],
    capabilities: [
      {
        id: "draft_artifact",
        permission: "propose_agent_action",
        description: "Return a draft artifact without changing workspace records.",
      },
      {
        id: "read_checklist",
        permission: "read_object",
        description: "Read local checklist records supplied by the host.",
      },
    ],
    tools: [
      {
        id: "draft_review_artifact",
        name: "Draft review artifact",
        description: "Builds a local artifact preview from checklist input.",
        capability: "draft_artifact",
        inputSchema: {
          type: "object",
          properties: {
            checklistItems: {
              type: "array",
            },
          },
        },
      },
    ],
    resources: [
      {
        id: "checklist_feed",
        name: "Checklist feed",
        description: "Host-provided checklist records for artifact drafting.",
        uri: "sovereignops://workspace/checklists/review",
        capability: "read_checklist",
      },
    ],
    prompts: [
      {
        id: "artifact_review",
        name: "Artifact review",
        description: "Frames the artifact preview for local review.",
        capability: "draft_artifact",
      },
    ],
    minimumHostVersion: "0.3.0",
  };
}
