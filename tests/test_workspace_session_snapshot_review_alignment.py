from __future__ import annotations

import json
import re
import unittest
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]

DOC_PATH = "docs/workspace-session-snapshot-review.md"
FIXTURE_PATH = "examples/workspace-session/snapshot-review.json"
DOCS_TEST_PATH = "tests/test_workspace_session_snapshot_review_docs.py"
ALIGNMENT_TEST_PATH = "tests/test_workspace_session_snapshot_review_alignment.py"

EXPECTED_ROUTE_IDS = (
    "workspace_session_snapshot_review_compare",
    "workspace_session_snapshot_retention_preview",
)
EXPECTED_ROUTE_PATHS = (
    "/v1/workspace-session/snapshot-review/compare",
    "/v1/workspace-session/snapshot-review/retention-preview",
)
EXPECTED_API_NAMES = (
    "createWorkspaceSessionSnapshotReviewRoutes",
    "mountWorkspaceSessionSnapshotReviewRoutes",
    "DEFAULT_WORKSPACE_SESSION_SNAPSHOT_REVIEW_ROUTE_BASE_PATH",
)
EXPECTED_SDK_NAMES = (
    "packages/sdk-js/src/localWorkspaceSessionSnapshotReview.ts",
    "packages/sdk-js/src/localWorkspaceSessionSnapshotReviewApiClient.ts",
    "packages/sdk-js/src/localWorkspaceSessionSnapshotRetention.ts",
    "compareLocalWorkspaceSessionSnapshots",
    "previewLocalWorkspaceSessionSnapshotRetention",
    "compareSnapshots",
    "previewSnapshotRetention",
    "createLocalWorkspaceSessionSnapshotReviewApiClient",
    "compareLocalWorkspaceSessionSnapshotsViaApi",
    "previewLocalWorkspaceSessionSnapshotRetentionViaApi",
    "planLocalWorkspaceSessionSnapshotRetentionCleanup",
    "planFileBackedLocalWorkspaceSessionSnapshotRetentionCleanup",
    "planSnapshotRetentionCleanupDryRun",
)
EXPECTED_CLI_NAMES = (
    "workspace-session snapshot-review compare",
    "workspace-session snapshot-review retention-preview",
    "runWorkspaceSessionSnapshotReviewCli",
    "loadWorkspaceSessionSnapshotReviewFixture",
    "isWorkspaceSessionSnapshotReviewCommand",
)
EXPECTED_VALIDATION_COMMANDS = (
    r"python -m json.tool examples\workspace-session\snapshot-review.json",
    "python -m unittest tests.test_workspace_session_snapshot_review_docs",
    "python -m unittest tests.test_workspace_session_snapshot_review_alignment",
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
)
SENSITIVE_KEY_PARTS = ("storagepath", "displaypath", "locktoken", "sessionid", "rootkey")


class WorkspaceSessionSnapshotReviewAlignmentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.doc_text = read_text(DOC_PATH)
        cls.fixture = read_json(FIXTURE_PATH)
        cls.fixture_text = json.dumps(cls.fixture, indent=2, sort_keys=True)
        cls.combined_text = cls.doc_text + "\n" + cls.fixture_text

    def test_owned_snapshot_review_files_exist(self) -> None:
        for rel_path in (DOC_PATH, FIXTURE_PATH, DOCS_TEST_PATH, ALIGNMENT_TEST_PATH):
            with self.subTest(path=rel_path):
                self.assertTrue((ROOT / rel_path).is_file(), rel_path)

    def test_docs_and_fixture_declare_routes_api_sdk_and_cli_names(self) -> None:
        combined = self.combined_text

        for expected in EXPECTED_ROUTE_IDS + EXPECTED_ROUTE_PATHS + EXPECTED_API_NAMES + EXPECTED_SDK_NAMES + EXPECTED_CLI_NAMES:
            with self.subTest(expected=expected):
                self.assertIn(expected, combined)

        api_routes = self.fixture["api"]["routes"]
        self.assertEqual(tuple(route["id"] for route in api_routes), EXPECTED_ROUTE_IDS)
        self.assertEqual(tuple(route["path"] for route in api_routes), EXPECTED_ROUTE_PATHS)
        self.assertEqual(self.fixture["sdk"]["methods"], ["compareSnapshots", "previewSnapshotRetention"])
        self.assertEqual(self.fixture["cli"]["commands"], list(EXPECTED_CLI_NAMES[:2]))

    def test_fixture_schema_shape_supports_compare_and_retention_preview(self) -> None:
        fixture = self.fixture

        self.assertEqual(fixture["schemaVersion"], "workspace-session-snapshot-review/v1")
        self.assertEqual(fixture["kind"], "workspace-session.snapshot-review")
        self.assertRegex(fixture["generatedAt"], TIMESTAMP_PATTERN)
        self.assertIs(fixture["localOnly"], True)
        self.assertIs(fixture["rawRequestBodyRetained"], False)
        self.assertEqual(set(fixture["snapshots"]), {"baseline", "candidate"})
        self.assertEqual(fixture["compare"]["routeId"], "workspace_session_snapshot_review_compare")
        self.assertEqual(fixture["compare"]["mode"], "local-only")
        self.assertEqual(
            fixture["retentionPreview"]["routeId"],
            "workspace_session_snapshot_retention_preview",
        )
        self.assertEqual(fixture["retentionPreview"]["mode"], "dry-run")

        for route in fixture["api"]["routes"]:
            with self.subTest(route=route["id"]):
                self.assertEqual(route["method"], "POST")
                self.assertIs(route["durableWrites"], False)
                self.assertIs(route["requestBodyRetained"], False)

        self.assertIs(fixture["api"]["routes"][1]["dryRunOnly"], True)

    def test_compare_response_uses_redacted_snapshot_refs_without_raw_body_retention(self) -> None:
        compare = self.fixture["compare"]
        response = compare["response"]

        self.assertIs(compare["requestShape"]["rawRequestBodyRetained"], False)
        self.assertEqual(response["schemaVersion"], self.fixture["schemaVersion"])
        self.assertIs(response["localOnly"], True)
        self.assertIs(response["durableWrites"], False)
        self.assertIs(response["rawRequestBodyRetained"], False)
        self.assertEqual(response["baselineSnapshotRef"], self.fixture["snapshots"]["baseline"]["snapshotRef"])
        self.assertEqual(response["candidateSnapshotRef"], self.fixture["snapshots"]["candidate"]["snapshotRef"])
        self.assertGreaterEqual(len(response["result"]["changedFields"]), 1)
        self.assertIs(response["redaction"]["redacted"], True)
        self.assertIs(response["redaction"]["rawPathsStored"], False)
        self.assertIs(response["redaction"]["rawTokensStored"], False)
        self.assertIs(response["redaction"]["rawSessionIdsStored"], False)
        self.assertIs(response["redaction"]["rawRootKeysStored"], False)
        assert_no_body_retention_keys(self, response)

    def test_retention_records_are_dry_run_only_and_deterministic(self) -> None:
        preview = self.fixture["retentionPreview"]
        response = preview["response"]
        records = response["records"]

        self.assertIs(preview["requestShape"]["rawRequestBodyRetained"], False)
        self.assertEqual(response["schemaVersion"], self.fixture["schemaVersion"])
        self.assertIs(response["localOnly"], True)
        self.assertIs(response["durableWrites"], False)
        self.assertIs(response["dryRun"], True)
        self.assertIs(response["rawRequestBodyRetained"], False)
        self.assertEqual(response["summary"]["recordCount"], len(records))
        self.assertEqual(response["summary"]["applied"], 0)
        self.assertEqual([record["plannedAction"] for record in records], ["retain", "prune"])

        for record in records:
            with self.subTest(record=record["recordId"]):
                self.assertRegex(record["createdAt"], TIMESTAMP_PATTERN)
                self.assertRegex(record["observedAt"], TIMESTAMP_PATTERN)
                self.assertIs(record["dryRun"], True)
                self.assertIs(record["applied"], False)
                self.assertRegex(record["storagePathRef"], REDACTED_PATTERN)
                self.assertRegex(record["sessionIdRef"], REDACTED_PATTERN)
                self.assertRegex(record["rootKeyRef"], REDACTED_PATTERN)
                self.assertIs(record["redaction"]["redacted"], True)
        assert_no_body_retention_keys(self, response)

    def test_sensitive_snapshot_values_are_redacted(self) -> None:
        assert_sensitive_refs_redacted(self, self.fixture["snapshots"])
        assert_sensitive_refs_redacted(self, self.fixture["retentionPreview"]["response"]["records"])

    def test_validation_commands_are_repo_relative_and_named_in_docs(self) -> None:
        commands = self.fixture["validationCommands"]
        self.assertEqual(commands, list(EXPECTED_VALIDATION_COMMANDS))

        for command in commands:
            with self.subTest(command=command):
                self.assertIn(command, self.doc_text)
                self.assertNotRegex(command, r"(?i)(?:^|\s)[a-z]:[\\/]")
                self.assertNotIn("..", Path(command.replace("\\", "/")).parts)

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
        self.assertNotIn("workspaces/", lower_text)


def read_text(rel_path: str) -> str:
    return (ROOT / rel_path).read_text(encoding="utf-8")


def read_json(rel_path: str) -> Any:
    return json.loads(read_text(rel_path))


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
                if any(part in normalized_key for part in SENSITIVE_KEY_PARTS) and isinstance(nested, str):
                    testcase.assertRegex(nested, REDACTED_PATTERN, f"{key} must be redacted")
                stack.append(nested)
        elif isinstance(current, list):
            stack.extend(current)


if __name__ == "__main__":
    unittest.main()
