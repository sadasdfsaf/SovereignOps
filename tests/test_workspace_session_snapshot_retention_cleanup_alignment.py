from __future__ import annotations

import json
import re
import unittest
from pathlib import Path
from typing import Any

from scripts import release_check

ROOT = Path(__file__).resolve().parents[1]

DOC_PATH = "docs/workspace-session-snapshot-retention-cleanup.md"
FIXTURE_PATH = "examples/workspace-session/snapshot-retention-cleanup.json"
DOCS_TEST_PATH = "tests/test_workspace_session_snapshot_retention_cleanup_docs.py"
ALIGNMENT_TEST_PATH = "tests/test_workspace_session_snapshot_retention_cleanup_alignment.py"
E2E_TEST_PATH = "tests/test_workspace_session_snapshot_retention_cleanup_e2e.py"
SDK_SOURCE_PATH = "packages/sdk-js/src/localWorkspaceSessionSnapshotRetention.ts"
SDK_API_CLIENT_PATH = "packages/sdk-js/src/localWorkspaceSessionSnapshotRetentionCleanupApiClient.ts"
SDK_API_CLIENT_TEST_PATH = (
    "packages/sdk-js/tests/local-workspace-session-snapshot-retention-cleanup-api-client.test.mjs"
)
SDK_API_CLIENT_SECURITY_TEST_PATH = (
    "tests/security/workspace_session_snapshot_retention_cleanup_api_client_threats.test.mjs"
)
API_REPLAY_FIXTURE_PATH = "examples/workspace-session/snapshot-retention-cleanup-api-requests.json"
CLI_API_REPLAY_PATH = "packages/cli/src/workspaceSessionSnapshotRetentionCleanupApiReplay.ts"
CLI_API_REPLAY_TEST_PATH = (
    "packages/cli/tests/workspace-session-snapshot-retention-cleanup-api-replay.test.mjs"
)
API_ROUTE_PATH = "apps/api/src/workspaceSessionSnapshotRetentionCleanupRoutes.ts"
CLI_SOURCE_PATH = "packages/cli/src/workspaceSessionSnapshotRetentionCleanup.ts"
WEB_STATE_PATH = "apps/web/src/workspaceSessionSnapshotRetentionCleanupState.ts"
SCHEMA_SOURCE_PATH = "packages/schemas/src/workspaceSessionSnapshotRetentionCleanup.ts"
SCHEMA_TEST_PATH = "packages/schemas/tests/workspace-session-snapshot-retention-cleanup.test.mjs"
SCHEMA_FIXTURE_PATHS = (
    "packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-request.valid.json",
    "packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-request.invalid.json",
    "packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-request.schema.json",
    "packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-response.valid.json",
    "packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-response.invalid.json",
    "packages/schemas/fixtures/workspace-session-snapshot-retention-cleanup-response.schema.json",
)
ROUND44_REQUIRED_PATHS = (
    E2E_TEST_PATH,
    SDK_API_CLIENT_PATH,
    SDK_API_CLIENT_TEST_PATH,
    SDK_API_CLIENT_SECURITY_TEST_PATH,
    API_REPLAY_FIXTURE_PATH,
    CLI_API_REPLAY_PATH,
    CLI_API_REPLAY_TEST_PATH,
    SCHEMA_SOURCE_PATH,
    SCHEMA_TEST_PATH,
    *SCHEMA_FIXTURE_PATHS,
)

EXPECTED_SCHEMA_VERSION = "local-workspace-session-snapshot-retention/v1"
EXPECTED_FIXTURE_KIND = "workspace-session.snapshot-retention-cleanup.dry-run"
EXPECTED_PLAN_KIND = "localWorkspaceSessionSnapshotRetentionCleanupPlan"
EXPECTED_ACTION_KIND = "localWorkspaceSessionSnapshotRetentionCleanupAction"
EXPECTED_SUMMARY_KIND = "localWorkspaceSessionSnapshotRetentionCleanupSummary"
EXPECTED_ISSUE_KIND = "localWorkspaceSessionSnapshotRetentionCleanupIssue"
EXPECTED_HELPERS = (
    "planLocalWorkspaceSessionSnapshotRetentionCleanup",
    "planFileBackedLocalWorkspaceSessionSnapshotRetentionCleanup",
    "planSnapshotRetentionCleanupDryRun",
)
EXPECTED_TYPES = (
    "LocalWorkspaceSessionSnapshotRetentionCleanupInput",
    "LocalWorkspaceSessionSnapshotRetentionCleanupPlan",
    "LocalWorkspaceSessionSnapshotRetentionCleanupAction",
    "LocalWorkspaceSessionSnapshotRetentionCleanupSummary",
    "LocalWorkspaceSessionSnapshotRetentionCleanupIssue",
)
EXPECTED_PLACEHOLDERS = (
    "sovereignops workspace-session snapshot retention-cleanup preview --fixture <path>",
    "sovereignops workspace-session-snapshot-retention-cleanup preview --fixture <path>",
)
EXPECTED_VALIDATION_COMMANDS = (
    r"python -m json.tool examples\workspace-session\snapshot-retention-cleanup.json",
    "python -m unittest tests.test_workspace_session_snapshot_retention_cleanup_docs",
    "python -m unittest tests.test_workspace_session_snapshot_retention_cleanup_alignment",
)
TIMESTAMP_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$")
REDACTED_PATTERN = re.compile(r"^\[redacted:[A-Za-z0-9]+:[A-Za-z0-9_-]+\]$")
BODY_RETENTION_KEYS = {"rawBody", "requestBody", "bodySnapshot", "retainedRequestBody"}
PRIVATE_PATH_MARKERS = (
    "".join(("sovereignops", "-codex", "-pack")),
    "." + "codex-private",
    "." + "codex-run",
    "CODEX" + "_START" + "_HERE",
    "tasks" + "/backlog.jsonl",
    "tasks" + "\\backlog.jsonl",
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
SENSITIVE_REF_KEY_PARTS = (
    "sessionref",
    "rootkeyref",
    "storagepathref",
    "locktokenref",
    "snapshotref",
    "workspaceref",
    "deviceref",
)


class WorkspaceSessionSnapshotRetentionCleanupAlignmentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.doc_text = read_text(DOC_PATH)
        cls.fixture = read_json(FIXTURE_PATH)
        cls.fixture_text = json.dumps(cls.fixture, indent=2, sort_keys=True)
        cls.sdk_text = read_text(SDK_SOURCE_PATH)
        cls.api_text = read_text(API_ROUTE_PATH)
        cls.cli_text = read_text(CLI_SOURCE_PATH)
        cls.web_text = read_text(WEB_STATE_PATH)
        cls.release_check_text = read_text("scripts/release_check.py")
        cls.combined_text = cls.doc_text + "\n" + cls.fixture_text

    def test_owned_retention_cleanup_files_exist(self) -> None:
        for rel_path in (
            DOC_PATH,
            FIXTURE_PATH,
            DOCS_TEST_PATH,
            ALIGNMENT_TEST_PATH,
            API_ROUTE_PATH,
            CLI_SOURCE_PATH,
            WEB_STATE_PATH,
        ):
            with self.subTest(path=rel_path):
                self.assertTrue((ROOT / rel_path).is_file(), rel_path)

    def test_docs_fixture_and_sdk_source_share_public_names(self) -> None:
        for expected in (
            EXPECTED_SCHEMA_VERSION,
            EXPECTED_PLAN_KIND,
            EXPECTED_ACTION_KIND,
            EXPECTED_SUMMARY_KIND,
            EXPECTED_ISSUE_KIND,
            *EXPECTED_HELPERS,
            *EXPECTED_TYPES,
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, self.doc_text)
                self.assertIn(expected, self.fixture_text)

        for helper in EXPECTED_HELPERS:
            with self.subTest(helper=helper):
                self.assertRegex(self.sdk_text, rf"export function {helper}\(")

        for type_name in EXPECTED_TYPES:
            with self.subTest(type_name=type_name):
                self.assertIn(type_name, self.sdk_text)

        self.assertIn(
            "/v1/workspace-session/snapshot-retention-cleanup",
            self.api_text,
        )
        self.assertIn(
            "workspace-session-snapshot-retention-cleanup.preview",
            self.cli_text,
        )
        self.assertIn(
            "buildWorkspaceSessionSnapshotRetentionCleanupState",
            self.web_text,
        )

    def test_round44_api_client_schema_fixtures_and_e2e_are_release_gated(self) -> None:
        required_paths = set(
            release_check.WORKSPACE_SESSION_SNAPSHOT_RETENTION_CLEANUP_REQUIRED_PATHS
        )
        check_specs = {spec.name: spec for spec in release_check.CHECK_SPECS}
        alignment_check = check_specs["workspace-session-snapshot-retention-cleanup-alignment"]
        security_check = check_specs["workspace-session-snapshot-retention-cleanup-security"]

        for rel_path in ROUND44_REQUIRED_PATHS:
            with self.subTest(path=rel_path):
                self.assertIn(rel_path, self.doc_text)
                self.assertIn(rel_path, self.release_check_text)
                self.assertIn(rel_path, required_paths)

        self.assertIn(
            "tests.test_workspace_session_snapshot_retention_cleanup_e2e",
            alignment_check.command,
        )
        self.assertIn("SDK API client", alignment_check.description)
        self.assertIn("schema fixtures", alignment_check.description)
        self.assertIn("API replay", alignment_check.description)
        self.assertIn("E2E replay", alignment_check.description)
        self.assertIn(SDK_API_CLIENT_SECURITY_TEST_PATH, security_check.command)
        self.assertIn(SDK_API_CLIENT_TEST_PATH, security_check.command)
        self.assertIn(SCHEMA_TEST_PATH, security_check.command)
        self.assertIn(CLI_API_REPLAY_TEST_PATH, security_check.command)

    def test_fixture_schema_shape_matches_dry_run_cleanup_plan(self) -> None:
        fixture = self.fixture
        plan = fixture["cleanupPlan"]

        self.assertEqual(fixture["schemaVersion"], EXPECTED_SCHEMA_VERSION)
        self.assertEqual(fixture["kind"], EXPECTED_FIXTURE_KIND)
        self.assertRegex(fixture["generatedAt"], TIMESTAMP_PATTERN)
        self.assertIs(fixture["localOnly"], True)
        self.assertIs(fixture["dryRun"], True)
        self.assertIs(fixture["durableWrites"], False)
        self.assertIs(fixture["rawRequestBodyRetained"], False)
        self.assertEqual(plan["schemaVersion"], fixture["schemaVersion"])
        self.assertEqual(plan["kind"], EXPECTED_PLAN_KIND)
        self.assertIs(plan["localOnly"], True)
        self.assertIs(plan["dryRun"], True)
        self.assertIs(plan["durableWrites"], False)
        self.assertEqual(plan["thresholds"]["maxCount"], fixture["input"]["maxCount"])
        self.assertEqual(plan["thresholds"]["maxAgeMs"], fixture["input"]["maxAgeMs"])
        self.assertEqual(plan["thresholds"]["now"], fixture["input"]["now"])
        self.assertRegex(plan["thresholds"]["cutoffAt"], TIMESTAMP_PATTERN)

    def test_cleanup_actions_are_counted_and_advisory_only(self) -> None:
        plan = self.fixture["cleanupPlan"]
        actions = plan["actions"]

        self.assertEqual(plan["entryCount"], len(self.fixture["input"]["records"]))
        self.assertEqual(plan["summary"]["entryCount"], len(actions))
        self.assertEqual(plan["keepCount"], count_actions(actions, "keep"))
        self.assertEqual(plan["deleteCount"], count_actions(actions, "delete"))
        self.assertEqual(plan["reviewCount"], count_actions(actions, "review"))
        self.assertEqual(plan["summary"]["appliedCount"], 0)
        self.assertEqual([action["action"] for action in actions], ["keep", "keep", "delete", "review"])

        for action in actions:
            with self.subTest(row=action["rowId"]):
                self.assertEqual(action["kind"], EXPECTED_ACTION_KIND)
                self.assertIn(action["action"], {"keep", "delete", "review"})
                self.assertIs(action["dryRun"], True)
                self.assertIs(action["advisoryOnly"], True)
                self.assertIs(action["applied"], False)
                self.assertIsInstance(action["issues"], list)
                self.assertGreaterEqual(len(action["reasons"]), 1)

                summary = action["summary"]
                self.assertEqual(summary["kind"], EXPECTED_SUMMARY_KIND)
                self.assertEqual(summary["sourceKind"], "snapshot-record-summary")
                self.assertIs(summary["auditSafe"], True)
                self.assertIs(summary["redacted"], True)
                self.assertRegex(summary["snapshotRef"], REDACTED_PATTERN)
                self.assertRegex(summary["sessionRef"], REDACTED_PATTERN)
                self.assertRegex(summary["rootKeyRef"], REDACTED_PATTERN)
                self.assertRegex(summary["storagePathRef"], REDACTED_PATTERN)
                self.assertRegex(summary["lockTokenRef"], REDACTED_PATTERN)

        review_action = actions[-1]
        self.assertEqual(review_action["action"], "review")
        self.assertNotIn("rank", review_action)
        for issue in review_action["issues"]:
            with self.subTest(issue=issue["path"]):
                self.assertEqual(issue["kind"], EXPECTED_ISSUE_KIND)
                self.assertEqual(issue["issueKind"], "missing-created-at")
                self.assertEqual(issue["reason"], "missing-created-at")

    def test_command_placeholders_and_validation_commands_are_repo_relative(self) -> None:
        commands = self.fixture["validationCommands"]
        placeholders = self.fixture["commandContracts"]

        self.assertEqual(commands, list(EXPECTED_VALIDATION_COMMANDS))
        self.assertEqual(placeholders["cliPreview"], list(EXPECTED_PLACEHOLDERS))
        self.assertEqual(
            placeholders["apiPreviewRoute"],
            "POST /v1/workspace-session/snapshot-retention-cleanup/preview",
        )
        self.assertEqual(
            placeholders["webStateModule"],
            WEB_STATE_PATH,
        )
        self.assertEqual(
            placeholders["sdkHelperCalls"],
            [f"{helper}(<input>)" for helper in EXPECTED_HELPERS],
        )

        for command in commands:
            with self.subTest(command=command):
                self.assertIn(command, self.doc_text)
                self.assertNotRegex(command, r"(?i)(?:^|\s)[a-z]:[\\/]")
                self.assertNotIn("..", Path(command.replace("\\", "/")).parts)

        for command in placeholders["cliPreview"]:
            with self.subTest(command=command):
                self.assertIn(command, self.doc_text)
                self.assertIn("<path>", command)
                self.assertNotRegex(command, r"(?i)(?:^|\s)[a-z]:[\\/]")

    def test_refs_are_redacted_and_no_raw_body_keys_are_retained(self) -> None:
        assert_sensitive_refs_redacted(self, self.fixture)
        assert_no_body_retention_keys(self, self.fixture)

    def test_docs_and_fixture_avoid_private_paths_and_secret_shapes(self) -> None:
        lower_text = self.combined_text.lower()

        for marker in PRIVATE_PATH_MARKERS:
            with self.subTest(marker=marker):
                self.assertNotIn(marker.lower(), lower_text)

        for pattern in SECRET_VALUE_PATTERNS:
            with self.subTest(pattern=pattern.pattern):
                self.assertIsNone(pattern.search(self.combined_text))

        self.assertIsNone(re.search(r"(?<![A-Za-z0-9])[A-Za-z]:[\\/]", self.combined_text))
        self.assertIsNone(re.search(r"\\\\[^\\\s]+\\[^\\\s]+", self.combined_text))
        self.assertIsNone(
            re.search(
                r"(?<![A-Za-z0-9_])/(?:Users|home|root|tmp|var|etc|opt|private|mnt|Volumes)(?:/|\b)",
                self.combined_text,
            )
        )
        self.assertNotIn("file://", lower_text)
        self.assertNotIn("workspaces/", lower_text)


def read_text(rel_path: str) -> str:
    return (ROOT / rel_path).read_text(encoding="utf-8")


def read_json(rel_path: str) -> Any:
    return json.loads(read_text(rel_path))


def count_actions(actions: list[dict[str, Any]], action_name: str) -> int:
    return sum(1 for action in actions if action["action"] == action_name)


def assert_no_body_retention_keys(testcase: unittest.TestCase, value: Any) -> None:
    stack = [value]
    while stack:
        current = stack.pop()
        if isinstance(current, dict):
            for key, nested in current.items():
                testcase.assertNotIn(key, BODY_RETENTION_KEYS)
                stack.append(nested)
        elif isinstance(current, list):
            stack.extend(current)


def assert_sensitive_refs_redacted(testcase: unittest.TestCase, value: Any) -> None:
    stack = [value]
    while stack:
        current = stack.pop()
        if isinstance(current, dict):
            for key, nested in current.items():
                normalized_key = re.sub(r"[^a-z0-9]+", "", key.lower())
                if any(part in normalized_key for part in SENSITIVE_REF_KEY_PARTS) and isinstance(nested, str):
                    testcase.assertRegex(nested, REDACTED_PATTERN, f"{key} must be redacted")
                stack.append(nested)
        elif isinstance(current, list):
            stack.extend(current)


if __name__ == "__main__":
    unittest.main()
