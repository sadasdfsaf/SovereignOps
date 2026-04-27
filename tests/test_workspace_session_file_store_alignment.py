from __future__ import annotations

import json
import re
import unittest
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]

DOC_PATH = "docs/workspace-session-file-store.md"
FIXTURE_PATH = "examples/workspace-session/file-store-adapter.json"
DOCS_TEST_PATH = "tests/test_workspace_session_file_store_docs.py"
ALIGNMENT_TEST_PATH = "tests/test_workspace_session_file_store_alignment.py"
SECURITY_TEST_PATH = "tests/security/workspace_session_file_store_threats.test.mjs"

API_ROUTE_FILE = "apps/api/src/workspaceSessionStoreRoutes.ts"
API_FILE_ADAPTER_FILE = "apps/api/src/workspaceSessionStoreFileAdapter.ts"
SDK_FILE_STORE_FILE = "packages/sdk-js/src/localWorkspaceSessionFileStore.ts"
SDK_SNAPSHOT_CLIENT_FILE = "packages/sdk-js/src/localWorkspaceSessionSnapshotApiClient.ts"
CLI_INSPECT_FILE = "packages/cli/src/workspaceSessionSnapshotStore.ts"
WEB_SNAPSHOT_STATE_FILE = "apps/web/src/workspaceSessionSnapshotState.ts"

EXPECTED_PARENT_FILES = (
    API_ROUTE_FILE,
    API_FILE_ADAPTER_FILE,
    SDK_FILE_STORE_FILE,
    SDK_SNAPSHOT_CLIENT_FILE,
    CLI_INSPECT_FILE,
    WEB_SNAPSHOT_STATE_FILE,
)

EXPECTED_DOC_AND_FIXTURE_FILES = (
    DOC_PATH,
    FIXTURE_PATH,
    DOCS_TEST_PATH,
    ALIGNMENT_TEST_PATH,
    SECURITY_TEST_PATH,
)

EXPECTED_ROUTE_PATHS = (
    "/v1/workspace-session/snapshots/preview",
    "/v1/workspace-session/snapshots",
    "/v1/workspace-session/snapshots/:snapshotId",
)

EXPECTED_NAMES = (
    "createWorkspaceSessionStoreRoutes",
    "mountWorkspaceSessionStoreRoutes",
    "DEFAULT_WORKSPACE_SESSION_STORE_ROUTE_BASE_PATH",
    "createWorkspaceSessionStoreFileAdapter",
    "createFileBackedWorkspaceSessionSnapshotStore",
    "createWorkspaceSessionSnapshotFileStore",
    "DEFAULT_WORKSPACE_SESSION_SNAPSHOT_FILE_STORE_LOCK_FILE",
    "LocalWorkspaceSessionFileStore",
    "createLocalWorkspaceSessionFileStore",
    "FileBackedLocalWorkspaceSessionStore",
    "createFileBackedLocalWorkspaceSessionStore",
    "writeLocalWorkspaceSessionStoreBundleFile",
    "useLockFile",
    "LocalWorkspaceSessionSnapshotApiClient",
    "createLocalWorkspaceSessionSnapshotApiClient",
    "previewSnapshot",
    "createSnapshot",
    "listSnapshots",
    "getSnapshot",
    "runWorkspaceSessionSnapshotStoreCli",
    "loadWorkspaceSessionSnapshotStore",
    "isWorkspaceSessionSnapshotStoreCommand",
    "buildWorkspaceSessionSnapshotState",
    "buildWorkspaceSessionSnapshotSummaryCards",
    "redactWorkspaceSessionSnapshotDisplayValue",
)

EXPECTED_EXPORTS = {
    API_ROUTE_FILE: (
        "createWorkspaceSessionStoreRoutes",
        "mountWorkspaceSessionStoreRoutes",
        "createInMemoryWorkspaceSessionSnapshotStore",
    ),
    API_FILE_ADAPTER_FILE: (
        "createWorkspaceSessionStoreFileAdapter",
        "createFileBackedWorkspaceSessionSnapshotStore",
        "createWorkspaceSessionSnapshotFileStore",
        "DEFAULT_WORKSPACE_SESSION_SNAPSHOT_FILE_STORE_LOCK_FILE",
    ),
    SDK_FILE_STORE_FILE: (
        "LocalWorkspaceSessionFileStore",
        "createLocalWorkspaceSessionFileStore",
        "FileBackedLocalWorkspaceSessionStore",
        "createFileBackedLocalWorkspaceSessionStore",
        "resolveLocalWorkspaceSessionFileStorePath",
        "readLocalWorkspaceSessionStoreBundleFile",
        "writeLocalWorkspaceSessionStoreBundleFile",
    ),
    SDK_SNAPSHOT_CLIENT_FILE: (
        "LocalWorkspaceSessionSnapshotApiClient",
        "createLocalWorkspaceSessionSnapshotApiClient",
    ),
    CLI_INSPECT_FILE: (
        "runWorkspaceSessionSnapshotStoreCli",
        "loadWorkspaceSessionSnapshotStore",
        "isWorkspaceSessionSnapshotStoreCommand",
    ),
    WEB_SNAPSHOT_STATE_FILE: (
        "buildWorkspaceSessionSnapshotState",
        "buildWorkspaceSessionSnapshotSummaryCards",
        "redactWorkspaceSessionSnapshotDisplayValue",
    ),
}

PRIVATE_PATH_MARKERS = (
    "".join(("sovereignops", "-codex", "-pack")),
    "".join((".codex", "-private")),
    "".join((".codex", "-run")),
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
)


class WorkspaceSessionFileStoreAlignmentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.doc_text = read_text(DOC_PATH)
        cls.fixture = read_json(FIXTURE_PATH)
        cls.fixture_text = json.dumps(cls.fixture, indent=2, sort_keys=True)

    def test_owned_round_40_scaffold_files_exist(self) -> None:
        for rel_path in EXPECTED_DOC_AND_FIXTURE_FILES:
            with self.subTest(path=rel_path):
                self.assertTrue((ROOT / rel_path).is_file(), rel_path)

    def test_docs_and_fixture_declare_route_client_cli_and_state_names(self) -> None:
        combined = self.doc_text + "\n" + self.fixture_text

        for route_path in EXPECTED_ROUTE_PATHS:
            with self.subTest(route_path=route_path):
                self.assertIn(route_path, combined)

        for expected_name in EXPECTED_NAMES:
            with self.subTest(name=expected_name):
                self.assertIn(expected_name, combined)

        self.assertEqual(
            self.fixture["api"]["basePath"],
            "/v1/workspace-session/snapshots",
        )
        self.assertEqual(
            self.fixture["sdk"]["clientClass"],
            "LocalWorkspaceSessionSnapshotApiClient",
        )
        self.assertEqual(
            self.fixture["cli"]["runner"],
            "runWorkspaceSessionSnapshotStoreCli",
        )
        self.assertEqual(
            self.fixture["web"]["stateBuilder"],
            "buildWorkspaceSessionSnapshotState",
        )

    def test_api_snapshot_routes_match_current_route_source_when_available(self) -> None:
        if not (ROOT / API_ROUTE_FILE).is_file():
            self.skipTest(f"{API_ROUTE_FILE} is not present yet")

        api_text = read_text(API_ROUTE_FILE)
        for expected in (
            '"/v1/workspace-session/snapshots"',
            'joinPath(basePath, "/preview")',
            "createWorkspaceSessionStoreRoutes",
            "mountWorkspaceSessionStoreRoutes",
            "WorkspaceSessionSnapshotStore",
            "createWorkspaceSessionSnapshotPreview",
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, api_text)

    def test_parent_owned_runtime_names_once_parent_slice_lands(self) -> None:
        missing = [rel_path for rel_path in EXPECTED_PARENT_FILES if not (ROOT / rel_path).is_file()]
        if missing:
            self.skipTest("workspace session file-store runtime files are not present yet: " + ", ".join(missing))

        for rel_path, expected_exports in EXPECTED_EXPORTS.items():
            source_text = read_text(rel_path)
            for expected_export in expected_exports:
                with self.subTest(path=rel_path, export=expected_export):
                    assert_ts_exported(self, source_text, expected_export)

        sdk_client_text = read_text(SDK_SNAPSHOT_CLIENT_FILE)
        self.assertIn('SNAPSHOTS_ENDPOINT = "workspace-session/snapshots"', sdk_client_text)
        self.assertIn("`${SNAPSHOTS_ENDPOINT}/preview`", sdk_client_text)

        cli_text = read_text(CLI_INSPECT_FILE)
        self.assertIn("workspace-session", cli_text)
        self.assertIn("snapshot", cli_text)
        self.assertIn("inspect", cli_text)

        web_text = read_text(WEB_SNAPSHOT_STATE_FILE)
        self.assertIn("workspace_session_snapshot", web_text)
        self.assertIn("rawBodyRetained: false", web_text)

    def test_fixture_paths_are_root_scoped_and_adapter_flags_align(self) -> None:
        adapter = self.fixture["adapter"]
        atomic_write = self.fixture["atomicWrite"]
        lock_guard = self.fixture["lockGuard"]

        for key in ("baseDir",):
            with self.subTest(key=key):
                assert_relative_workspace_path(self, adapter[key])

        for key in ("targetPath", "tempPathPattern"):
            with self.subTest(key=key):
                assert_relative_workspace_path(self, atomic_write[key])

        assert_relative_workspace_path(self, lock_guard["lockFile"])
        self.assertIs(adapter["pathRules"]["normalizedRelativePaths"], True)
        self.assertIs(adapter["pathRules"]["allowParentTraversal"], False)
        self.assertIs(adapter["pathRules"]["allowAbsolutePaths"], False)
        self.assertIs(adapter["durableWrites"], True)
        self.assertIs(atomic_write["enabled"], True)
        self.assertIs(atomic_write["partialWritesVisible"], False)
        self.assertIs(lock_guard["enabled"], True)
        self.assertRegex(lock_guard["lockTokenRef"], r"^\[redacted:lockToken:[a-z0-9]+\]$")
        self.assertEqual(
            self.fixture["apiFileAdapter"]["factory"],
            "createWorkspaceSessionStoreFileAdapter",
        )

    def test_validation_commands_are_repo_relative_and_named_in_docs(self) -> None:
        commands = self.fixture["validationCommands"]
        self.assertEqual(
            commands,
            [
                r"python -m json.tool examples\workspace-session\file-store-adapter.json",
                "python -m unittest tests.test_workspace_session_file_store_docs tests.test_workspace_session_file_store_alignment",
                "node --test tests/security/workspace_session_file_store_threats.test.mjs",
            ],
        )

        for command in commands:
            with self.subTest(command=command):
                self.assertIn(command, self.doc_text)
                self.assertNotRegex(command, r"(?i)(?:^|\s)[a-z]:[\\/]")
                self.assertNotIn("..", Path(command.replace("\\", "/")).parts)

    def test_checked_in_docs_and_fixture_avoid_private_paths_and_secret_shapes(self) -> None:
        combined_text = self.doc_text + "\n" + self.fixture_text
        lower_text = combined_text.lower()

        for marker in PRIVATE_PATH_MARKERS:
            with self.subTest(marker=marker):
                self.assertNotIn(marker.lower(), lower_text)

        for pattern in SECRET_VALUE_PATTERNS:
            with self.subTest(pattern=pattern.pattern):
                self.assertIsNone(pattern.search(combined_text))

        self.assertIsNone(re.search(r"(?<![A-Za-z0-9])[A-Za-z]:[\\/]", combined_text))
        self.assertIsNone(re.search(r"\\\\[^\\\s]+\\[^\\\s]+", combined_text))
        self.assertIsNone(re.search(r"(?<![A-Za-z0-9_])/(?:Users|home|root|tmp|var|etc|opt)(?:/|\b)", combined_text))


def read_text(rel_path: str) -> str:
    return (ROOT / rel_path).read_text(encoding="utf-8")


def read_json(rel_path: str) -> Any:
    return json.loads(read_text(rel_path))


def assert_ts_exported(testcase: unittest.TestCase, text: str, symbol: str) -> None:
    patterns = (
        rf"export\s+(?:async\s+)?(?:function|class|const|let|var|interface|type)\s+{re.escape(symbol)}\b",
        rf"export\s*\{{[^}}]*\b{re.escape(symbol)}\b[^}}]*\}}",
    )
    testcase.assertTrue(
        any(re.search(pattern, text, flags=re.DOTALL) for pattern in patterns),
        f"expected exported symbol {symbol}",
    )


def assert_relative_workspace_path(testcase: unittest.TestCase, value: str) -> None:
    testcase.assertIsInstance(value, str)
    normalized = value.replace("\\", "/")
    testcase.assertFalse(normalized.startswith("/"), value)
    testcase.assertFalse(re.match(r"(?i)^[a-z]:/", normalized), value)
    testcase.assertNotIn("..", Path(normalized).parts)
    testcase.assertTrue(normalized.startswith("workspaces/wsp_session_alpha/"), value)


if __name__ == "__main__":
    unittest.main()
