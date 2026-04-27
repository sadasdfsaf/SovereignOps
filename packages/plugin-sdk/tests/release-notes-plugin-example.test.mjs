import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createPluginSandboxHarness,
  normalizePluginManifest,
  validatePluginManifest,
} from "../src/index.ts";

const manifestUrl = new URL(
  "../../../examples/plugins/release-notes/plugin.json",
  import.meta.url,
);
const sampleInputUrl = new URL(
  "../../../examples/plugins/release-notes/sample-input.json",
  import.meta.url,
);

const REQUIRED_CAPABILITIES = Object.freeze([
  "propose_release_note_draft",
  "read_local_change_summaries",
  "redact_sensitive_release_note_fields",
]);
const LOCAL_ONLY_RESOURCE_SCHEMES = Object.freeze(["local://"]);
const SENSITIVE_FRAGMENTS = Object.freeze([
  "hunter2",
  "sk_test_local_example",
  "Bearer local-development-token",
  "PRIVATE KEY",
  "local-fixture-key",
]);
const CATEGORY_ORDER = Object.freeze([
  "Added",
  "Changed",
  "Fixed",
  "Removed",
  "Internal",
]);
const REDACTION_PATTERNS = Object.freeze({
  bearerToken: {
    kind: "bearer_token",
    regex: /\bBearer\s+[A-Za-z0-9._~+/=-]+/g,
  },
  keyValueSecret: {
    kind: "key_value_secret",
    regex: /\b(?:apiKey|api[_-]?key|token|password|secret)\s*[:=]\s*["']?[^"',;\s]+["']?/gi,
  },
  privateKeyBlock: {
    kind: "private_key_block",
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
});

test("validates the local release-notes plugin manifest shape", () => {
  const manifestText = readFileSync(manifestUrl, "utf8");
  const result = validatePluginManifest(JSON.parse(manifestText));

  assert.equal(result.ok, true, JSON.stringify(result.issues));
  const manifest = result.value;

  assert.equal(manifest.id, "plugin.release-notes.local-draft");
  assert.equal(manifest.entrypoint, "index.mjs");
  assert.deepEqual(manifest.permissions, [
    "propose_agent_action",
    "read_object",
  ]);
  assert.equal(manifest.permissions.includes("write_object"), false);
  assert.equal(manifest.permissions.includes("manage_plugin"), false);
  assert.equal(manifest.permissions.includes("sync_bundle"), false);
  assert.deepEqual(
    manifest.capabilities.map((capability) => capability.id),
    REQUIRED_CAPABILITIES,
  );

  const tool = manifest.tools.find((candidate) => candidate.id === "draft_release_note_metadata");
  assert.ok(tool);
  assert.equal(tool.capability, "propose_release_note_draft");
  assert.deepEqual(tool.inputSchema.required, [
    "releaseName",
    "commits",
    "changes",
  ]);
  assert.equal(tool.inputSchema.additionalProperties, false);

  assert.equal(manifest.resources.length, 1);
  assert.ok(LOCAL_ONLY_RESOURCE_SCHEMES.some((scheme) => manifest.resources[0].uri.startsWith(scheme)));
  assert.doesNotMatch(manifestText, /\bhttps?:\/\//i);
});

test("drafts deterministic redacted release-note metadata inside the sandbox harness", () => {
  const manifest = normalizePluginManifest(readJson(manifestUrl));
  const input = readJson(sampleInputUrl);
  const harness = createPluginSandboxHarness({
    capabilities: manifest.capabilities.map((capability) => capability.id),
    limits: {
      maxAuditEvents: 64,
      maxTicks: 64,
    },
  });

  const first = harness.run((context) => draftReleaseNoteMetadata(context, input));
  const second = harness.run((context) => draftReleaseNoteMetadata(context, input));

  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(second.ok, true, JSON.stringify(second));
  assert.deepEqual(first, second);

  const draft = first.value;
  assert.equal(draft.type, "release_note_draft_metadata");
  assert.equal(draft.proposalOnly, true);
  assert.equal(draft.localOnly, true);
  assert.equal(draft.externalCalls, 0);
  assert.match(draft.draftKey, /^release-notes-[a-z0-9]+$/);
  assert.deepEqual(draft.requiredCapabilities, REQUIRED_CAPABILITIES);
  assert.deepEqual(draft.sourceCounts, {
    changes: 4,
    commits: 3,
    includedChanges: 3,
    omittedChanges: 1,
  });
  assert.deepEqual(draft.omittedChangeIds, ["chg-004"]);
  assert.deepEqual(
    draft.sourceCommits.map((commit) => commit.sha),
    ["a1b2c3d", "d4e5f6a", "f7e8d9c"],
  );
  assert.deepEqual(
    draft.sections.map((section) => section.heading),
    ["Added", "Changed", "Fixed"],
  );
  assert.deepEqual(draft.sections[1].items[0], {
    changeId: "chg-002",
    commits: ["d4e5f6a"],
    risk: "medium",
    summary: "Redacts [REDACTED], [REDACTED], and [REDACTED] before metadata is returned.",
    title: "Local input redaction",
  });
  assert.deepEqual(draft.redactions, [
    {
      kind: "bearer_token",
      path: "changes[1].summary",
      replacements: 1,
    },
    {
      kind: "key_value_secret",
      path: "changes[1].summary",
      replacements: 2,
    },
    {
      kind: "private_key_block",
      path: "changes[3].summary",
      replacements: 1,
    },
    {
      kind: "key_value_secret",
      path: "commits[1].summary",
      replacements: 2,
    },
  ]);
  assert.equal(first.ticks, 16);
  assert.deepEqual(pluginAuditTypes(first), [
    "release_notes.local_changes_scanned",
    "release_notes.secret_redactions_applied",
    "release_notes.draft_metadata_created",
  ]);
  assert.equal(first.audit.some((event) => event.type.startsWith("host_api.")), false);

  const serializedDraft = JSON.stringify(draft);
  const serializedAudit = JSON.stringify(first.audit);
  for (const fragment of SENSITIVE_FRAGMENTS) {
    assert.equal(serializedDraft.includes(fragment), false, `draft leaked ${fragment}`);
    assert.equal(serializedAudit.includes(fragment), false, `audit leaked ${fragment}`);
  }
});

test("requires declared capabilities and keeps host APIs outside the plugin path", () => {
  const input = readJson(sampleInputUrl);
  const missingCapability = createPluginSandboxHarness({
    capabilities: REQUIRED_CAPABILITIES.filter((capability) => (
      capability !== "redact_sensitive_release_note_fields"
    )),
  }).run((context) => draftReleaseNoteMetadata(context, input));

  assert.equal(missingCapability.ok, false);
  assert.equal(missingCapability.error.code, "SANDBOX_CAPABILITY_DENIED");
  assert.deepEqual(missingCapability.audit[2].detail, {
    capability: "redact_sensitive_release_note_fields",
  });

  const deniedHostApi = createPluginSandboxHarness({
    capabilities: REQUIRED_CAPABILITIES,
  }).run((context) => {
    context.requestHostApi("fetch");
    return "unreachable";
  });

  assert.equal(deniedHostApi.ok, false);
  assert.equal(deniedHostApi.error.code, "SANDBOX_HOST_API_DENIED");
});

function draftReleaseNoteMetadata(context, input = {}) {
  context.requireCapability("read_local_change_summaries");
  context.requireCapability("redact_sensitive_release_note_fields");
  context.requireCapability("propose_release_note_draft");

  const redactor = createRedactor(input.redaction);
  const releaseName = redactor.redact(cleanString(input.releaseName) || "Next Release", "releaseName");
  const source = normalizeSource(input.source, redactor.redact);
  const commits = normalizeCommits(input.commits, redactor.redact);
  const changes = normalizeChanges(input.changes, redactor.redact);

  context.audit("release_notes.local_changes_scanned", {
    changeCount: changes.length,
    commitCount: commits.length,
  });
  context.tick(Math.max(1, changes.length + commits.length), "scan_local_inputs");

  const includedChanges = changes.filter((change) => change.includeInDraft);
  const omittedChangeIds = changes
    .filter((change) => !change.includeInDraft)
    .map((change) => change.id)
    .sort();
  const redactions = redactor.redactions();
  const redactionCount = redactions.reduce((total, item) => total + item.replacements, 0);

  context.audit("release_notes.secret_redactions_applied", {
    redactedFieldCount: redactions.length,
    replacementCount: redactionCount,
  });
  context.tick(Math.max(1, redactionCount), "redact_sensitive_text");

  const sections = buildSections(includedChanges);
  const sourceCommitIds = unique(includedChanges.flatMap((change) => change.commits)).sort();

  context.audit("release_notes.draft_metadata_created", {
    includedChangeCount: includedChanges.length,
    omittedChangeCount: omittedChangeIds.length,
    sectionCount: sections.length,
  });
  context.tick(Math.max(1, sections.length), "build_metadata");

  return {
    type: "release_note_draft_metadata",
    proposalOnly: true,
    localOnly: true,
    externalCalls: 0,
    releaseName,
    draftKey: buildDraftKey(releaseName, includedChanges, sourceCommitIds),
    requiredCapabilities: REQUIRED_CAPABILITIES,
    source,
    sourceCounts: {
      changes: changes.length,
      commits: commits.length,
      includedChanges: includedChanges.length,
      omittedChanges: omittedChangeIds.length,
    },
    sourceCommits: commits
      .filter((commit) => sourceCommitIds.includes(commit.sha))
      .sort(compareBySha),
    sections,
    omittedChangeIds,
    redactions,
    nextStep: "Review the redacted draft metadata before sharing.",
  };
}

function normalizeSource(value, redact) {
  const record = isRecord(value) ? value : {};

  return optionalFields({
    kind: redact(cleanString(record.kind) || "local_change_summary", "source.kind"),
    workspacePath: redact(cleanString(record.workspacePath) || ".", "source.workspacePath"),
    generatedBy: redact(cleanString(record.generatedBy), "source.generatedBy") || undefined,
  });
}

function normalizeCommits(value, redact) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item, index) => {
    const record = isRecord(item) ? item : {};
    return {
      sha: shortCommit(cleanString(record.sha) || `commit-${index + 1}`),
      summary: redact(cleanString(record.summary) || "No summary supplied.", `commits[${index}].summary`),
      files: normalizeStringArray(record.files).sort(),
      refs: normalizeStringArray(record.refs).sort(),
    };
  }).sort(compareBySha);
}

function normalizeChanges(value, redact) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item, index) => {
    const record = isRecord(item) ? item : {};
    return {
      id: cleanString(record.id) || `change-${index + 1}`,
      category: normalizeCategory(record.category),
      title: redact(cleanString(record.title) || "Untitled change", `changes[${index}].title`),
      summary: redact(cleanString(record.summary) || "No summary supplied.", `changes[${index}].summary`),
      commits: normalizeStringArray(record.commits).map(shortCommit).sort(),
      risk: normalizeRisk(record.risk),
      includeInDraft: record.includeInDraft !== false,
    };
  }).sort(compareByCategoryThenId);
}

function buildSections(changes) {
  const byCategory = new Map();

  for (const change of changes) {
    const section = byCategory.get(change.category) ?? {
      heading: change.category,
      items: [],
    };
    section.items.push({
      changeId: change.id,
      commits: change.commits,
      risk: change.risk,
      summary: change.summary,
      title: change.title,
    });
    byCategory.set(change.category, section);
  }

  return [...byCategory.values()]
    .map((section) => ({
      ...section,
      items: section.items.sort((left, right) => left.changeId.localeCompare(right.changeId)),
    }))
    .sort((left, right) => compareCategories(left.heading, right.heading));
}

function createRedactor(config) {
  const record = isRecord(config) ? config : {};
  const placeholder = cleanString(record.placeholder) || "[REDACTED]";
  const patternIds = normalizeStringArray(record.patterns);
  const patterns = (patternIds.length > 0 ? patternIds : Object.keys(REDACTION_PATTERNS))
    .map((id) => REDACTION_PATTERNS[id])
    .filter(Boolean);
  const redactions = [];

  return {
    redact(value, path) {
      let redacted = cleanString(value);
      for (const pattern of patterns) {
        const matches = redacted.match(pattern.regex);
        if (!matches) {
          continue;
        }

        redacted = redacted.replace(pattern.regex, placeholder);
        redactions.push({
          path,
          kind: pattern.kind,
          replacements: matches.length,
        });
      }
      return redacted;
    },
    redactions() {
      return redactions.slice().sort((left, right) => (
        left.path.localeCompare(right.path) ||
        left.kind.localeCompare(right.kind)
      ));
    },
  };
}

function buildDraftKey(releaseName, changes, commitIds) {
  const stableInput = JSON.stringify({
    releaseName,
    changeIds: changes.map((change) => change.id).sort(),
    commitIds,
  });
  return `release-notes-${stableHash(stableInput)}`;
}

function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function pluginAuditTypes(result) {
  return result.audit
    .filter((event) => event.type === "plugin.audit")
    .map((event) => event.detail.type);
}

function readJson(url) {
  return JSON.parse(readFileSync(url, "utf8"));
}

function normalizeCategory(value) {
  const cleaned = cleanString(value);
  const match = CATEGORY_ORDER.find((category) => category.toLowerCase() === cleaned.toLowerCase());
  return match ?? "Changed";
}

function normalizeRisk(value) {
  const cleaned = cleanString(value).toLowerCase();
  return ["low", "medium", "high"].includes(cleaned) ? cleaned : "low";
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value.map(cleanString).filter(Boolean)
    : [];
}

function compareBySha(left, right) {
  return left.sha.localeCompare(right.sha);
}

function compareByCategoryThenId(left, right) {
  return compareCategories(left.category, right.category) || left.id.localeCompare(right.id);
}

function compareCategories(left, right) {
  const leftIndex = CATEGORY_ORDER.indexOf(left);
  const rightIndex = CATEGORY_ORDER.indexOf(right);
  if (leftIndex !== -1 || rightIndex !== -1) {
    return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) -
      (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
  }
  return left.localeCompare(right);
}

function shortCommit(value) {
  return cleanString(value).slice(0, 7);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function optionalFields(record) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
