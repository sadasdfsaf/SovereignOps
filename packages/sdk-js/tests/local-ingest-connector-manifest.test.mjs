import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_INGEST_CONNECTOR_MANIFEST_ERROR_CODES,
  LOCAL_INGEST_CONNECTOR_MANIFEST_KIND,
  LOCAL_INGEST_CONNECTOR_MANIFEST_SCHEMA_VERSION,
  LocalIngestConnectorManifestError,
  buildLocalIngestConnectorReadinessSummary,
  getLocalIngestConnectorProfile,
  listLocalIngestConnectorProfiles,
  normalizeLocalIngestConnectorManifest,
} from "../src/localIngestConnectorManifest.ts";

test("lists default connector profiles in stable order and returns frozen clones", () => {
  const profiles = listLocalIngestConnectorProfiles();

  assert.deepEqual(
    profiles.map((profile) => profile.profileId),
    ["markdown", "json", "csv", "log", "repository"],
  );
  assert.deepEqual(
    profiles.map((profile) => profile.connector),
    ["markdown", "json", "csv", "log", "repository"],
  );
  assert.equal(Object.isFrozen(profiles), true);
  assert.equal(Object.isFrozen(profiles[0].capabilities), true);
  assert.throws(() => {
    profiles[0].capabilities.push("mutated");
  }, TypeError);

  const repeated = listLocalIngestConnectorProfiles();
  assert.notEqual(repeated, profiles);
  assert.deepEqual(repeated[0].capabilities, profiles[0].capabilities);
});

test("looks up profiles by profile id or connector alias without sharing mutable state", () => {
  const csv = getLocalIngestConnectorProfile("CSV");
  const repository = getLocalIngestConnectorProfile("repository_scan");
  const missing = getLocalIngestConnectorProfile("unknown-profile");

  assert.equal(csv?.connector, "csv");
  assert.deepEqual(csv?.mediaTypes, ["text/csv"]);
  assert.equal(repository?.profileId, "repository");
  assert.equal(missing, undefined);
  assert.equal(Object.isFrozen(csv?.defaultOptions), true);
  assert.throws(() => {
    csv.defaultOptions.trusted = true;
  }, TypeError);
  assert.notEqual(getLocalIngestConnectorProfile("csv"), csv);
});

test("builds readiness counts with ready, attention, and blocked profiles", () => {
  const summary = buildLocalIngestConnectorReadinessSummary({
    profiles: [
      profile({
        profileId: "blocked-log",
        connector: "log",
        safety: {
          ...safeSafety(),
          localOnly: false,
          rawContentRetained: true,
          trustedByDefault: true,
        },
      }),
      profile({
        profileId: "ready-json",
        connector: "json",
      }),
      profile({
        profileId: "attention-csv",
        connector: "csv",
        mediaTypes: [],
      }),
    ],
  });

  assert.equal(summary.kind, "ingest.connector_readiness");
  assert.equal(summary.profileCount, 3);
  assert.equal(summary.readyCount, 1);
  assert.equal(summary.attentionCount, 1);
  assert.equal(summary.blockedCount, 1);
  assert.deepEqual(summary.byStatus, {
    ready: 1,
    attention: 1,
    blocked: 1,
  });
  assert.deepEqual(
    summary.profiles.map((item) => [item.profileId, item.status, item.issueCodes]),
    [
      ["ready-json", "ready", []],
      ["attention-csv", "attention", ["missing-media-types"]],
      [
        "blocked-log",
        "blocked",
        ["non-local-connector", "trusted-by-default", "raw-content-retained"],
      ],
    ],
  );
  assert.equal(Object.isFrozen(summary.profiles[0].issueCodes), true);
});

test("normalizes public Python/API manifest JSON into the SDK camelCase shape", () => {
  const normalized = normalizeLocalIngestConnectorManifest({
    schema_version: LOCAL_INGEST_CONNECTOR_MANIFEST_SCHEMA_VERSION,
    generated_by: "sovereignops-schemas",
    connectors: [
      {
        id: "repository",
        display_name: "Repository",
        description: "Scans local repository paths with safe relative path and file citations.",
        source_kinds: ["directory"],
        media_types: ["application/vnd.sovereignops.repository+json"],
        citation_kinds: ["file-path", "line-range"],
        validation_modes: ["path-boundary", "media-type", "size-limit", "safety-scan"],
        safety_finding_kinds: ["path-traversal", "private-path", "raw-secret"],
        default_untrusted: true,
        local_only: true,
        network_access: false,
        reads_files: true,
        requires_approval: true,
      },
      {
        id: "markdown",
        display_name: "Markdown",
        description: "Imports local Markdown and plain text notes with line citations.",
        source_kinds: ["file"],
        media_types: ["text/markdown", "text/plain"],
        citation_kinds: ["line-range"],
        validation_modes: ["utf8-decode", "size-limit", "safety-scan"],
        safety_finding_kinds: [
          "embedded-instruction-override",
          "embedded-prompt-reference",
          "raw-secret",
        ],
        default_untrusted: true,
        local_only: true,
        network_access: false,
        reads_files: true,
        requires_approval: false,
      },
    ],
  });

  assert.equal(normalized.kind, LOCAL_INGEST_CONNECTOR_MANIFEST_KIND);
  assert.equal(normalized.schemaVersion, LOCAL_INGEST_CONNECTOR_MANIFEST_SCHEMA_VERSION);
  assert.equal(normalized.localOnly, true);
  assert.equal(normalized.profileCount, 2);
  assert.deepEqual(
    normalized.profiles.map((profile) => profile.profileId),
    ["markdown", "repository"],
  );
  assert.deepEqual(normalized.profiles[0].capabilities, [
    "embedded-instruction-override",
    "embedded-prompt-reference",
    "line-range",
    "raw-secret",
    "safety-scan",
    "size-limit",
    "utf8-decode",
  ]);
  assert.deepEqual(normalized.profiles[0].fileExtensions, [".markdown", ".md"]);
  assert.deepEqual(normalized.profiles[0].sourceUriSchemes, ["file"]);
  assert.equal(normalized.profiles[1].safety.requiresApproval, true);
  assert.equal(
    buildLocalIngestConnectorReadinessSummary(normalized).readyCount,
    2,
  );
});

test("accepts API route and Python CLI connector manifest wrappers", () => {
  const apiManifest = normalizeLocalIngestConnectorManifest({
    schemaVersion: LOCAL_INGEST_CONNECTOR_MANIFEST_SCHEMA_VERSION,
    localOnly: true,
    connectors: [
      {
        id: "local.files",
        label: "Local Files",
        description: "Previews caller-provided local file content.",
        transport: "in-process",
        capabilities: ["ingest.normalize", "repository.scan", "search.query"],
        mediaTypes: ["text/plain", "text/markdown", "text/csv", "application/json"],
        auth: {
          mode: "none",
          required: false,
        },
        preview: {
          dryRun: true,
          maxItems: 50,
          maxTextBytes: 65536,
        },
        safety: {
          localOnly: true,
          networkAccess: false,
          durableWrites: false,
          untrustedByDefault: true,
        },
      },
      {
        id: "local.manual",
        label: "Manual Text",
        description: "Accepts caller-supplied text for local normalization.",
        transport: "in-process",
        capabilities: ["ingest.normalize", "ingest.structured", "search.query"],
        mediaTypes: ["text/plain", "text/markdown", "application/json"],
        auth: {
          mode: "none",
          required: false,
        },
        preview: {
          dryRun: true,
          maxItems: 20,
          maxTextBytes: 32768,
        },
        safety: {
          localOnly: true,
          networkAccess: false,
          durableWrites: false,
          untrustedByDefault: true,
        },
      },
    ],
  });
  const cliManifest = normalizeLocalIngestConnectorManifest({
    ok: true,
    command: "connectors manifest",
    manifest: {
      kind: "sovereignops.ingest.connector-manifest",
      version: 1,
      local_only: true,
      read_only: true,
      network_access: false,
      path_inputs: false,
      connectors: [
        {
          id: "json-structured",
          kind: "ingest",
          media_types: ["application/json"],
          citation_capabilities: ["json_path"],
          validation_modes: ["json_parse_exception", "json_sorted_object_paths"],
          safety_findings: [
            { code: "embedded_instruction_override", severity: "notice" },
          ],
          content_untrusted_by_default: true,
        },
      ],
    },
  });

  assert.deepEqual(
    apiManifest.profiles.map((profile) => [profile.profileId, profile.connector]),
    [
      ["local.manual", "markdown"],
      ["local.files", "repository"],
    ],
  );
  assert.deepEqual(cliManifest.profiles[0].citationKinds, ["json-path"]);
  assert.deepEqual(cliManifest.profiles[0].validationModes, [
    "json-parse-exception",
    "json-sorted-object-paths",
  ]);
  assert.deepEqual(cliManifest.profiles[0].safetyFindingKinds, [
    "embedded-instruction-override",
  ]);
});

test("rejects unsafe private paths and raw secrets without retaining the sensitive value", () => {
  assertManifestError(
    () =>
      normalizeLocalIngestConnectorManifest({
        profiles: [
          profile({
            default_options: {
              api_key: "sk-testsecret123",
            },
          }),
        ],
      }),
    "raw_secret",
    "sk-testsecret123",
  );

  assertManifestError(
    () =>
      normalizeLocalIngestConnectorManifest({
        profiles: [
          profile({
            description: "E:\\SovereignOps\\.codex-private\\round47\\plan.md",
          }),
        ],
      }),
    "private_path",
    ".codex-private",
  );

  assertManifestError(
    () =>
      normalizeLocalIngestConnectorManifest({
        profiles: [
          profile({
            default_options: {
              include_paths: ["../outside.txt"],
            },
          }),
        ],
      }),
    "path_traversal",
    "../outside.txt",
  );
});

test("allows redacted placeholders at sensitive fields", () => {
  const normalized = normalizeLocalIngestConnectorManifest({
    profiles: [
      profile({
        defaultOptions: {
          api_key: "[redacted:secret:abc123]",
          required_columns: [],
          trusted: false,
          unique_columns: [],
        },
      }),
    ],
  });

  assert.deepEqual(normalized.profiles[0].defaultOptions, {
    apiKey: "[redacted:secret:abc123]",
    requiredColumns: [],
    trusted: false,
    uniqueColumns: [],
  });
});

function assertManifestError(fn, reason, forbiddenText) {
  assert.throws(
    fn,
    (error) => {
      assert.equal(error instanceof LocalIngestConnectorManifestError, true);
      assert.equal(error.code, LOCAL_INGEST_CONNECTOR_MANIFEST_ERROR_CODES.UNSAFE_INPUT);
      assert.equal(error.issues.some((issue) => issue.reason === reason), true);
      assert.equal(JSON.stringify(error).includes(forbiddenText), false);
      return true;
    },
  );
}

function profile(overrides = {}) {
  const connector = overrides.connector ?? "csv";
  return {
    profileId: `${connector}-profile`,
    connector,
    label: String(connector).toUpperCase(),
    mediaTypes: connector === "json"
      ? ["application/json"]
      : connector === "log"
        ? ["text/plain"]
        : ["text/csv"],
    fileExtensions: connector === "json" ? [".json"] : connector === "log" ? [".log"] : [".csv"],
    sourceUriSchemes: ["fixture"],
    capabilities: ["line-citations"],
    defaultOptions: {
      requiredColumns: [],
      trusted: false,
      uniqueColumns: [],
    },
    safety: safeSafety(),
    ...overrides,
  };
}

function safeSafety() {
  return {
    localOnly: true,
    trustedByDefault: false,
    rawContentRetained: false,
    rawSecretsRetained: false,
    privatePathsBlocked: true,
    rawSecretsBlocked: true,
  };
}
