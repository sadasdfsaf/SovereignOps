from __future__ import annotations

import json
import re
import unittest
from pathlib import Path
from typing import Any

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
DOC_PATH = ROOT / "docs" / "workspace-session-snapshot-retention-cleanup.md"
FIXTURE_PATH = ROOT / "examples" / "workspace-session" / "snapshot-retention-cleanup.json"

EXPECTED_SECTIONS = (
    "# Workspace Session Snapshot Retention Cleanup",
    "## Scope",
    "## Dry-Run Contract",
    "## SDK And Command Names",
    "## Round 44 Release Handoff",
    "## Inventory Preview",
    "## Round 46 Inventory Replay Handoff",
    "## Fixture",
    "## Validation Commands",
)

EXPECTED_REFERENCES = (
    "examples/workspace-session/snapshot-retention-cleanup.json",
    "apps/web/src/workspaceSessionSnapshotRetentionCleanupState.ts",
    "packages/sdk-js/src/localWorkspaceSessionSnapshotRetention.ts",
    "packages/sdk-js/src/localWorkspaceSessionSnapshotRetentionCleanupApiClient.ts",
    "packages/sdk-js/tests/local-workspace-session-snapshot-retention-cleanup-api-client.test.mjs",
    "tests/security/workspace_session_snapshot_retention_cleanup_api_client_threats.test.mjs",
    "examples/workspace-session/snapshot-retention-cleanup-api-requests.json",
    "packages/cli/src/workspaceSessionSnapshotRetentionCleanupApiReplay.ts",
    "packages/cli/tests/workspace-session-snapshot-retention-cleanup-api-replay.test.mjs",
    "packages/schemas/src/workspaceSessionSnapshotRetentionCleanup.ts",
    "packages/schemas/tests/workspace-session-snapshot-retention-cleanup.test.mjs",
    "packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-request.valid.json",
    "packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-request.invalid.json",
    "packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-request.schema.json",
    "packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-response.valid.json",
    "packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-response.invalid.json",
    "packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-response.schema.json",
    "tests/test_workspace_session_snapshot_retention_cleanup_e2e.py",
    "LOCAL_WORKSPACE_SESSION_SNAPSHOT_RETENTION_SCHEMA_VERSION",
    "LocalWorkspaceSessionSnapshotRetentionError",
    "LocalWorkspaceSessionSnapshotRetentionCleanupInput",
    "LocalWorkspaceSessionSnapshotRetentionCleanupPlan",
    "LocalWorkspaceSessionSnapshotRetentionCleanupAction",
    "LocalWorkspaceSessionSnapshotRetentionCleanupSummary",
    "LocalWorkspaceSessionSnapshotRetentionCleanupIssue",
    "planLocalWorkspaceSessionSnapshotRetentionCleanup",
    "planFileBackedLocalWorkspaceSessionSnapshotRetentionCleanup",
    "planSnapshotRetentionCleanupDryRun",
    "local-workspace-session-snapshot-retention/v1",
    "workspace-session.snapshot-retention-cleanup.dry-run",
    "POST /v1/workspace-session/snapshot-retention-cleanup/preview",
)

EXPECTED_INVENTORY_REFERENCES = (
    "examples/workspace-session/snapshot-retention-cleanup-inventory.json",
    "packages/sdk-js/src/localWorkspaceSessionSnapshotRetention.ts",
    "planFileBackedLocalWorkspaceSessionSnapshotRetentionCleanup",
    "POST /v1/workspace-session/snapshot-retention-cleanup/inventory/preview",
    "apps/api/src/workspaceSessionSnapshotRetentionCleanupInventoryRoutes.ts",
    "apps/api/tests/workspace-session-snapshot-retention-cleanup-inventory-routes.test.mjs",
    "createWorkspaceSessionSnapshotRetentionCleanupInventoryPreview",
    "createWorkspaceSessionSnapshotRetentionCleanupInventoryRoutes",
    "WorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest",
    "WorkspaceSessionSnapshotRetentionCleanupPreviewResponse",
    "packages/cli/src/workspaceSessionSnapshotRetentionCleanupInventory.ts",
    "packages/cli/tests/workspace-session-snapshot-retention-cleanup-inventory.test.mjs",
    "runWorkspaceSessionSnapshotRetentionCleanupInventoryCli",
    "loadWorkspaceSessionSnapshotRetentionCleanupInventoryInput",
    "isWorkspaceSessionSnapshotRetentionCleanupInventoryCommand",
    "apps/web/src/workspaceSessionSnapshotRetentionCleanupInventoryState.ts",
    "apps/web/tests/workspace-session-snapshot-retention-cleanup-inventory-state.test.mjs",
    "buildWorkspaceSessionSnapshotRetentionCleanupInventoryState",
    "tests/security/workspace_session_snapshot_retention_cleanup_inventory_threats.test.mjs",
)

EXPECTED_ROUND46_REFERENCES = (
    "packages/sdk-js/src/localWorkspaceSessionSnapshotRetentionCleanupInventoryApiClient.ts",
    "packages/sdk-js/tests/local-workspace-session-snapshot-retention-cleanup-inventory-api-client.test.mjs",
    "createLocalWorkspaceSessionSnapshotRetentionCleanupInventoryApiClient",
    "previewLocalWorkspaceSessionSnapshotRetentionCleanupInventoryViaApi",
    "normalizeLocalWorkspaceSessionSnapshotRetentionCleanupInventoryPreviewRequest",
    "examples/workspace-session/snapshot-retention-cleanup-inventory-api-requests.json",
    "packages/cli/src/workspaceSessionSnapshotRetentionCleanupInventoryApiReplay.ts",
    "packages/cli/tests/workspace-session-snapshot-retention-cleanup-inventory-api-replay.test.mjs",
    "runWorkspaceSessionSnapshotRetentionCleanupInventoryApiReplayCli",
    "loadWorkspaceSessionSnapshotRetentionCleanupInventoryApiRequests",
    "createWorkspaceSessionSnapshotRetentionCleanupInventoryApiDispatcher",
    "isWorkspaceSessionSnapshotRetentionCleanupInventoryApiReplayCommand",
    "packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-inventory-request.valid.json",
    "packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-inventory-request.invalid.json",
    "packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-inventory-request.schema.json",
    "tests/test_workspace_session_snapshot_retention_cleanup_inventory_e2e.py",
)

EXPECTED_VALIDATION_COMMANDS = (
    r"python -m json.tool examples\workspace-session\snapshot-retention-cleanup.json",
    "python -m unittest tests.test_workspace_session_snapshot_retention_cleanup_docs",
    "python -m unittest tests.test_workspace_session_snapshot_retention_cleanup_alignment",
)

EXPECTED_INVENTORY_VALIDATION_COMMANDS = (
    "python -m unittest tests.test_validate_openapi_workspace_session_snapshot_retention_cleanup",
    "node --test tests/security/workspace_session_snapshot_retention_cleanup_inventory_threats.test.mjs",
    r"node packages\sdk-js\tests\local-workspace-session-snapshot-retention-cleanup-inventory-api-client.test.mjs",
    r"node packages\cli\tests\workspace-session-snapshot-retention-cleanup-inventory-api-replay.test.mjs",
    r"node packages\schemas\tests\workspace-session-snapshot-retention-cleanup.test.mjs",
    "python -m unittest tests.test_workspace_session_snapshot_retention_cleanup_inventory_e2e",
    r"python scripts\release_check.py --dry-run",
    r"python scripts\validate_openapi.py docs\openapi.yaml",
)

EXPECTED_PLACEHOLDERS = (
    "sovereignops workspace-session snapshot retention-cleanup preview --fixture <path>",
    "sovereignops workspace-session-snapshot-retention-cleanup preview --fixture <path>",
    "planLocalWorkspaceSessionSnapshotRetentionCleanup(<input>)",
    "planFileBackedLocalWorkspaceSessionSnapshotRetentionCleanup(<input>)",
    "planSnapshotRetentionCleanupDryRun(<input>)",
)

TIMESTAMP_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$")
SHA256_PATTERN = re.compile(r"^sha256:[a-f0-9]{64}$")
REDACTED_PATTERN = re.compile(r"^\[redacted:[A-Za-z0-9]+:[A-Za-z0-9_-]+\]$")
WINDOWS_ABSOLUTE_PATH_PATTERN = re.compile(r"(?i)(?<![A-Za-z0-9])[a-z]:[\\/]")
POSIX_ABSOLUTE_PATH_PATTERN = re.compile(
    r"(?<![A-Za-z0-9_])/(?:Users|home|root|tmp|var|etc|opt|private|mnt|Volumes)(?:/|\b)"
)
UNC_PATH_PATTERN = re.compile(r"\\\\[^\\\s]+\\[^\\\s]+")
REMOTE_DOMAIN_PATTERN = re.compile(
    r"(?i)\b(?:www\.)?[a-z0-9-]+\.(?:com|net|org|edu|io|dev)\b"
)
SECRET_VALUE_PATTERNS = (
    re.compile(r"sk-[A-Za-z0-9_-]{12,}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9_]{12,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"(?i)\bbearer\s+(?!\[REDACTED\])[A-Za-z0-9._~+/=-]+"),
    re.compile(
        r"(?i)(?<!\[redacted:lock)(?:password|passwd|secret|token|api[_-]?key)"
        r"\s*[:=]\s*(?!\[REDACTED\]|\[redacted:)\S{4,}"
    ),
    re.compile(r"\bsess_[a-z0-9_]{6,}\b"),
    re.compile(r"\bkey_[a-z0-9_]{6,}\b"),
    re.compile(r"\block_[A-Za-z0-9_-]{4,}\b"),
)
PRIVATE_PATH_MARKERS = (
    "".join(("sovereignops", "-codex", "-pack")),
    "." + "codex-private",
    "." + "codex-run",
    "CODEX" + "_START" + "_HERE",
    "tasks" + "/backlog.jsonl",
    "tasks" + "\\backlog.jsonl",
)
ADDITIONAL_RESTRICTED_TERM_PARTS = (
    ("public", "-", "sector"),
    ("public", " ", "sector"),
)


class WorkspaceSessionSnapshotRetentionCleanupDocsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.doc_text = DOC_PATH.read_text(encoding="utf-8")
        cls.fixture_text = FIXTURE_PATH.read_text(encoding="utf-8")
        cls.fixture = _load_json(FIXTURE_PATH)
        cls.combined_text = f"{cls.doc_text}\n{cls.fixture_text}"
        cls.lower_combined_text = cls.combined_text.lower()

    def test_document_has_required_sections_names_and_commands(self) -> None:
        self.assertTrue(DOC_PATH.is_file())
        self.assertTrue(FIXTURE_PATH.is_file())

        for section in EXPECTED_SECTIONS:
            with self.subTest(section=section):
                self.assertIn(section, self.doc_text)

        for reference in EXPECTED_REFERENCES:
            with self.subTest(reference=reference):
                self.assertIn(reference, self.doc_text)

        for reference in EXPECTED_INVENTORY_REFERENCES:
            with self.subTest(inventory_reference=reference):
                self.assertIn(reference, self.doc_text)

        for reference in EXPECTED_ROUND46_REFERENCES:
            with self.subTest(round46_reference=reference):
                self.assertIn(reference, self.doc_text)

        for command in (
            EXPECTED_VALIDATION_COMMANDS
            + EXPECTED_INVENTORY_VALIDATION_COMMANDS
            + EXPECTED_PLACEHOLDERS
        ):
            with self.subTest(command=command):
                self.assertIn(command, self.doc_text)

        for command in (
            "sovereignops workspace-session snapshot retention-cleanup inventory --fixture <path>",
            "sovereignops workspace-session-snapshot-retention-cleanup inventory --fixture <path>",
        ):
            with self.subTest(inventory_command=command):
                self.assertIn(command, self.doc_text)

        for phrase in (
            "Cleanup planning is local-only and advisory.",
            "Every cleanup row keeps `dryRun: true`",
            "Plans must report `durableWrites: false`",
            "Raw request bodies, local paths, secrets, session ids, root keys, and lock",
            "The Round 44 release gate also tracks the parent SDK API client",
            "The API replay fixture is expected to",
            "expected to use the checked-in cleanup fixture across SDK, API",
            "The retention cleanup inventory preview is the Round 45 handoff",
            "The OpenAPI contract is body-only JSON.",
            "omit raw secret, token, request-body,",
            "The Round 46 release gate extends the inventory preview contract",
            "must keep the existing route path",
            "must dispatch only checked-in JSON requests through local",
            "must cover valid and invalid",
            "The inventory E2E replay must compare SDK",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.doc_text)

    def test_fixture_top_level_schema_and_integration_names(self) -> None:
        fixture = self.fixture

        self.assertEqual(fixture["schemaVersion"], "local-workspace-session-snapshot-retention/v1")
        self.assertEqual(fixture["kind"], "workspace-session.snapshot-retention-cleanup.dry-run")
        self.assertRegex(fixture["generatedAt"], TIMESTAMP_PATTERN)
        self.assertIs(fixture["localOnly"], True)
        self.assertIs(fixture["dryRun"], True)
        self.assertIs(fixture["durableWrites"], False)
        self.assertIs(fixture["rawRequestBodyRetained"], False)
        self.assertEqual(fixture["validationCommands"], list(EXPECTED_VALIDATION_COMMANDS))

        redaction = fixture["redaction"]
        self.assertIs(redaction["redacted"], True)
        self.assertIs(redaction["rawPathsStored"], False)
        self.assertIs(redaction["rawTokensStored"], False)
        self.assertIs(redaction["rawSessionIdsStored"], False)
        self.assertIs(redaction["rawRootKeysStored"], False)
        self.assertIs(redaction["rawRequestBodyRetained"], False)

        sdk = fixture["integration"]["sdk"]
        self.assertEqual(sdk["module"], "packages/sdk-js/src/localWorkspaceSessionSnapshotRetention.ts")
        self.assertEqual(
            sdk["helpers"],
            [
                "planLocalWorkspaceSessionSnapshotRetentionCleanup",
                "planFileBackedLocalWorkspaceSessionSnapshotRetentionCleanup",
                "planSnapshotRetentionCleanupDryRun",
            ],
        )

        commands = fixture["commandContracts"]
        self.assertEqual(commands["sdkHelperCalls"], list(EXPECTED_PLACEHOLDERS[2:]))
        self.assertEqual(commands["cliPreview"], list(EXPECTED_PLACEHOLDERS[:2]))
        self.assertEqual(
            commands["apiPreviewRoute"],
            "POST /v1/workspace-session/snapshot-retention-cleanup/preview",
        )
        self.assertEqual(
            commands["webStateModule"],
            "apps/web/src/workspaceSessionSnapshotRetentionCleanupState.ts",
        )
        self.assertEqual(
            commands["fixturePath"],
            r"examples\workspace-session\snapshot-retention-cleanup.json",
        )

    def test_fixture_input_records_are_redacted_refs(self) -> None:
        records = self.fixture["input"]["records"]
        self.assertEqual(len(records), 4)

        for index, record in enumerate(records):
            with self.subTest(index=index):
                self.assertEqual(record["sourceIndex"], index)
                self.assertEqual(record["sourceKind"], "snapshot-record-summary")
                self.assertIs(record["auditSafe"], True)
                self.assertIs(record["redacted"], True)
                self.assertRegex(record["snapshotRef"], REDACTED_PATTERN)
                self.assertRegex(record["workspaceRef"], REDACTED_PATTERN)
                self.assertRegex(record["deviceRef"], REDACTED_PATTERN)
                self.assertRegex(record["sessionRef"], REDACTED_PATTERN)
                self.assertRegex(record["rootKeyRef"], REDACTED_PATTERN)
                self.assertRegex(record["storagePathRef"], REDACTED_PATTERN)
                self.assertRegex(record["lockTokenRef"], REDACTED_PATTERN)
                self.assertRegex(record["fingerprint"], SHA256_PATTERN)
                if "createdAt" in record:
                    self.assertRegex(record["createdAt"], TIMESTAMP_PATTERN)
                if "updatedAt" in record:
                    self.assertRegex(record["updatedAt"], TIMESTAMP_PATTERN)

    def test_cleanup_plan_rows_are_advisory_dry_run_only(self) -> None:
        plan = self.fixture["cleanupPlan"]
        actions = plan["actions"]

        self.assertEqual(plan["kind"], "localWorkspaceSessionSnapshotRetentionCleanupPlan")
        self.assertEqual(plan["schemaVersion"], self.fixture["schemaVersion"])
        self.assertIs(plan["localOnly"], True)
        self.assertIs(plan["dryRun"], True)
        self.assertIs(plan["durableWrites"], False)
        self.assertEqual(plan["entryCount"], 4)
        self.assertEqual(plan["keepCount"], 2)
        self.assertEqual(plan["deleteCount"], 1)
        self.assertEqual(plan["reviewCount"], 1)
        self.assertEqual(plan["summary"]["appliedCount"], 0)
        self.assertEqual([action["action"] for action in actions], ["keep", "keep", "delete", "review"])

        for action in actions:
            with self.subTest(row=action["rowId"]):
                self.assertEqual(action["kind"], "localWorkspaceSessionSnapshotRetentionCleanupAction")
                self.assertIs(action["dryRun"], True)
                self.assertIs(action["advisoryOnly"], True)
                self.assertIs(action["applied"], False)
                self.assertGreaterEqual(len(action["reasons"]), 1)
                summary = action["summary"]
                self.assertEqual(
                    summary["kind"],
                    "localWorkspaceSessionSnapshotRetentionCleanupSummary",
                )
                self.assertIs(summary["auditSafe"], True)
                self.assertIs(summary["redacted"], True)
                self.assertRegex(summary["snapshotRef"], REDACTED_PATTERN)
                self.assertRegex(summary["sessionRef"], REDACTED_PATTERN)
                self.assertRegex(summary["rootKeyRef"], REDACTED_PATTERN)
                self.assertRegex(summary["storagePathRef"], REDACTED_PATTERN)
                self.assertRegex(summary["lockTokenRef"], REDACTED_PATTERN)
                self.assertRegex(summary["fingerprint"], SHA256_PATTERN)

        review = actions[-1]
        self.assertEqual(review["action"], "review")
        self.assertEqual(review["issues"][0]["issueKind"], "missing-created-at")
        self.assertEqual(review["issues"][0]["reason"], "missing-created-at")

    def test_docs_and_fixture_avoid_private_domains_restricted_content_and_raw_material(self) -> None:
        for marker in PRIVATE_PATH_MARKERS:
            with self.subTest(marker=marker):
                self.assertNotIn(marker.lower(), self.lower_combined_text)

        forbidden_fragments = (
            "file://",
            "http://",
            "https://",
            "localhost",
            "127.0.0.1",
            "~/",
            "curl ",
            "npx ",
            "npm install -g",
            "workspaces/",
        )
        for fragment in forbidden_fragments:
            with self.subTest(fragment=fragment):
                self.assertNotIn(fragment, self.lower_combined_text)

        for pattern in (
            WINDOWS_ABSOLUTE_PATH_PATTERN,
            POSIX_ABSOLUTE_PATH_PATTERN,
            UNC_PATH_PATTERN,
            REMOTE_DOMAIN_PATTERN,
            re.compile(r"(?<!\.)\.\.[/\\]"),
        ):
            with self.subTest(pattern=pattern.pattern):
                self.assertIsNone(pattern.search(self.combined_text))

        for pattern in SECRET_VALUE_PATTERNS:
            with self.subTest(pattern=pattern.pattern):
                self.assertIsNone(pattern.search(self.combined_text))

        restricted_terms = sorted(
            {"".join(parts) for parts in RESTRICTED_PUBLIC_TERM_PARTS + ADDITIONAL_RESTRICTED_TERM_PARTS}
        )
        for term in restricted_terms:
            with self.subTest(term=term):
                if term.isascii():
                    escaped = re.escape(term).replace(r"\ ", r"\s+")
                    pattern = re.compile(rf"(?<![a-z0-9_]){escaped}(?![a-z0-9_])")
                    self.assertIsNone(pattern.search(self.lower_combined_text))
                else:
                    self.assertNotIn(term, self.lower_combined_text)


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
