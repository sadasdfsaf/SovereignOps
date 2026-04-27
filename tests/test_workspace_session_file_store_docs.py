from __future__ import annotations

import json
import re
import unittest
from pathlib import Path
from typing import Any

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
DOC_PATH = ROOT / "docs" / "workspace-session-file-store.md"
FIXTURE_PATH = ROOT / "examples" / "workspace-session" / "file-store-adapter.json"

EXPECTED_SECTIONS = (
    "# Workspace Session File Store",
    "## Scope",
    "## Root-Scoped Store",
    "## Atomic Writes",
    "## Lock Guard",
    "## API, SDK, CLI, And Web Names",
    "## Example Fixture",
    "## Validation Commands",
)

EXPECTED_REFERENCES = (
    "examples/workspace-session/file-store-adapter.json",
    "apps/api/src/workspaceSessionStoreFileAdapter.ts",
    "packages/sdk-js/src/localWorkspaceSessionFileStore.ts",
    "packages/sdk-js/src/localWorkspaceSessionSnapshotApiClient.ts",
    "packages/cli/src/workspaceSessionSnapshotStore.ts",
    "apps/web/src/workspaceSessionSnapshotState.ts",
    "apps/api/src/workspaceSessionStoreRoutes.ts",
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
    "runWorkspaceSessionSnapshotStoreCli",
    "loadWorkspaceSessionSnapshotStore",
    "isWorkspaceSessionSnapshotStoreCommand",
    "buildWorkspaceSessionSnapshotState",
    "buildWorkspaceSessionSnapshotSummaryCards",
    "redactWorkspaceSessionSnapshotDisplayValue",
)

EXPECTED_ROUTES = (
    ("workspace_session_snapshot_preview", "POST", "/v1/workspace-session/snapshots/preview"),
    ("workspace_session_snapshot_create", "POST", "/v1/workspace-session/snapshots"),
    ("workspace_session_snapshot_list", "GET", "/v1/workspace-session/snapshots"),
    ("workspace_session_snapshot_read", "GET", "/v1/workspace-session/snapshots/:snapshotId"),
)

EXPECTED_VALIDATION_COMMANDS = (
    r"python -m json.tool examples\workspace-session\file-store-adapter.json",
    "python -m unittest tests.test_workspace_session_file_store_docs tests.test_workspace_session_file_store_alignment",
    "node --test tests/security/workspace_session_file_store_threats.test.mjs",
)

TIMESTAMP_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$")
REDACTED_PATH_PATTERN = re.compile(r"^\[redacted:path:[a-z0-9]+\]$")
REDACTED_LOCK_PATTERN = re.compile(r"^\[redacted:lockToken:[a-z0-9]+\]$")
WINDOWS_ABSOLUTE_PATH_PATTERN = re.compile(r"(?i)(?<![A-Za-z0-9])[a-z]:[\\/]")
POSIX_ABSOLUTE_PATH_PATTERN = re.compile(
    r"(?<![A-Za-z0-9_])/(?:Users|home|root|tmp|var|etc|opt|private|mnt|Volumes)(?:/|\b)"
)
UNC_PATH_PATTERN = re.compile(r"\\\\[^\\\s]+\\[^\\\s]+")
SECRET_VALUE_PATTERNS = (
    re.compile(r"sk-[A-Za-z0-9_-]{12,}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9_]{12,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"(?i)\bbearer\s+(?!\[REDACTED\])[A-Za-z0-9._~+/=-]{12,}"),
    re.compile(
        r"(?i)(?<!\[redacted:lock)(?:password|passwd|secret|token|api[_-]?key)"
        r"\s*[:=]\s*(?!\[REDACTED\]|\[redacted:)\S{4,}"
    ),
)


class WorkspaceSessionFileStoreDocsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.doc_text = DOC_PATH.read_text(encoding="utf-8")
        cls.fixture_text = FIXTURE_PATH.read_text(encoding="utf-8")
        cls.fixture = _load_json(FIXTURE_PATH)
        cls.combined_text = f"{cls.doc_text}\n{cls.fixture_text}"
        cls.lower_combined_text = cls.combined_text.lower()

    def test_document_has_required_sections_references_routes_and_commands(self) -> None:
        self.assertTrue(DOC_PATH.is_file())
        self.assertTrue(FIXTURE_PATH.is_file())

        for section in EXPECTED_SECTIONS:
            with self.subTest(section=section):
                self.assertIn(section, self.doc_text)

        for reference in EXPECTED_REFERENCES:
            with self.subTest(reference=reference):
                self.assertIn(reference, self.doc_text)

        for _route_id, method, route_path in EXPECTED_ROUTES:
            with self.subTest(route=route_path):
                self.assertIn(f"`{method} {route_path}`", self.doc_text)

        for command in EXPECTED_VALIDATION_COMMANDS:
            with self.subTest(command=command):
                self.assertIn(command, self.doc_text)

    def test_fixture_top_level_shape_and_root_scope(self) -> None:
        fixture = self.fixture

        self.assertEqual(fixture["schemaVersion"], "workspace-session-file-store-adapter/v1")
        self.assertEqual(fixture["kind"], "workspace-session.file-store-adapter")
        self.assertRegex(fixture["generatedAt"], TIMESTAMP_PATTERN)
        self.assertIs(fixture["localOnly"], True)
        self.assertEqual(fixture["validationCommands"], list(EXPECTED_VALIDATION_COMMANDS))

        adapter = fixture["adapter"]
        self.assertEqual(adapter["name"], "root-scoped-file-store")
        self.assertEqual(adapter["module"], "packages/sdk-js/src/localWorkspaceSessionFileStore.ts")
        self.assertEqual(adapter["className"], "LocalWorkspaceSessionFileStore")
        self.assertEqual(adapter["factory"], "createLocalWorkspaceSessionFileStore")
        self.assertEqual(adapter["alias"], "FileBackedLocalWorkspaceSessionStore")
        self.assertEqual(adapter["aliasFactory"], "createFileBackedLocalWorkspaceSessionStore")
        self.assertEqual(adapter["rootScope"], "workspace")
        self.assertEqual(adapter["rootRef"], "workspace://wsp_session_alpha")
        self.assertEqual(adapter["baseDir"], "workspaces/wsp_session_alpha/sessions")
        self.assertIs(adapter["durableWrites"], True)
        self.assertIs(adapter["rawBodyRetained"], False)
        self.assertIs(adapter["rawPathsStored"], False)
        self.assertIs(adapter["rawLockMaterialStored"], False)

        path_rules = adapter["pathRules"]
        self.assertIs(path_rules["normalizedRelativePaths"], True)
        self.assertIs(path_rules["allowParentTraversal"], False)
        self.assertIs(path_rules["allowAbsolutePaths"], False)
        self.assertEqual(path_rules["allowedExtensions"], [".json"])

        api_file_adapter = fixture["apiFileAdapter"]
        self.assertEqual(api_file_adapter["module"], "apps/api/src/workspaceSessionStoreFileAdapter.ts")
        self.assertEqual(api_file_adapter["factory"], "createWorkspaceSessionStoreFileAdapter")
        self.assertEqual(
            api_file_adapter["aliases"],
            [
                "createFileBackedWorkspaceSessionSnapshotStore",
                "createWorkspaceSessionSnapshotFileStore",
            ],
        )
        self.assertEqual(
            api_file_adapter["defaultLockFile"],
            "DEFAULT_WORKSPACE_SESSION_SNAPSHOT_FILE_STORE_LOCK_FILE",
        )
        self.assertIs(api_file_adapter["useLockFile"], True)

    def test_atomic_write_and_lock_guard_are_declared(self) -> None:
        atomic_write = self.fixture["atomicWrite"]
        self.assertIs(atomic_write["enabled"], True)
        self.assertEqual(atomic_write["strategy"], "write-temp-fsync-rename")
        self.assertEqual(
            atomic_write["writer"],
            "writeLocalWorkspaceSessionStoreBundleFile",
        )
        self.assertEqual(
            atomic_write["targetPath"],
            "workspaces/wsp_session_alpha/sessions/sess_alpha_laptop_001.json",
        )
        self.assertEqual(atomic_write["commit"], "rename")
        self.assertIn("temp-file", atomic_write["flush"])
        self.assertIn("directory", atomic_write["flush"])
        self.assertIs(atomic_write["partialWritesVisible"], False)

        lock_guard = self.fixture["lockGuard"]
        self.assertIs(lock_guard["enabled"], True)
        self.assertEqual(lock_guard["guard"], "useLockFile")
        self.assertEqual(lock_guard["mode"], "advisory-file-lock")
        self.assertEqual(
            lock_guard["lockFile"],
            "workspaces/wsp_session_alpha/sessions/.session-store.lock",
        )
        self.assertEqual(lock_guard["ownerDeviceId"], "dev_laptop_alpha")
        self.assertEqual(lock_guard["ownerSessionId"], "sess_alpha_laptop_001")
        self.assertEqual(lock_guard["staleAfterMs"], 300000)
        self.assertRegex(lock_guard["lockTokenRef"], REDACTED_LOCK_PATTERN)
        self.assertIs(lock_guard["rawLockMaterialStored"], False)

    def test_fixture_declares_api_sdk_cli_and_web_names(self) -> None:
        api = self.fixture["api"]
        self.assertEqual(api["module"], "apps/api/src/workspaceSessionStoreRoutes.ts")
        self.assertEqual(api["basePath"], "/v1/workspace-session/snapshots")
        self.assertEqual(api["factory"], "createWorkspaceSessionStoreRoutes")
        self.assertEqual(api["mount"], "mountWorkspaceSessionStoreRoutes")
        self.assertEqual(api["defaultBasePath"], "DEFAULT_WORKSPACE_SESSION_STORE_ROUTE_BASE_PATH")

        routes = api["routes"]
        self.assertEqual(
            tuple((route["id"], route["method"], route["path"]) for route in routes),
            EXPECTED_ROUTES,
        )
        for route in routes:
            with self.subTest(route=route["id"]):
                self.assertIs(route["durableWrites"], False)
                self.assertTrue(route["responseKind"].startswith("workspace-session.snapshot-"))

        sdk = self.fixture["sdk"]
        self.assertEqual(sdk["clientClass"], "LocalWorkspaceSessionSnapshotApiClient")
        self.assertEqual(sdk["clientFactory"], "createLocalWorkspaceSessionSnapshotApiClient")
        self.assertEqual(
            sdk["methods"],
            ["previewSnapshot", "createSnapshot", "listSnapshots", "getSnapshot"],
        )
        self.assertEqual(sdk["fileStoreClass"], "LocalWorkspaceSessionFileStore")
        self.assertEqual(sdk["fileStoreFactory"], "createLocalWorkspaceSessionFileStore")
        self.assertEqual(sdk["fileStoreAlias"], "FileBackedLocalWorkspaceSessionStore")
        self.assertEqual(sdk["fileStoreAliasFactory"], "createFileBackedLocalWorkspaceSessionStore")

        cli = self.fixture["cli"]
        self.assertEqual(cli["command"], "workspace-session snapshot inspect")
        self.assertEqual(cli["runner"], "runWorkspaceSessionSnapshotStoreCli")
        self.assertEqual(cli["loader"], "loadWorkspaceSessionSnapshotStore")
        self.assertEqual(cli["detector"], "isWorkspaceSessionSnapshotStoreCommand")
        self.assertIs(cli["redactedOutput"], True)

        web = self.fixture["web"]
        self.assertEqual(web["stateId"], "workspace_session_snapshot")
        self.assertEqual(web["stateBuilder"], "buildWorkspaceSessionSnapshotState")
        self.assertEqual(web["summaryBuilder"], "buildWorkspaceSessionSnapshotSummaryCards")
        self.assertEqual(web["redactor"], "redactWorkspaceSessionSnapshotDisplayValue")
        self.assertIs(web["rawBodyRetained"], False)

    def test_sample_record_is_redacted_and_summary_only(self) -> None:
        record = self.fixture["sampleRecord"]
        self.assertEqual(record["kind"], "workspace-session.snapshot-record")
        self.assertEqual(record["schemaVersion"], "workspace-session-store/v1")
        self.assertIs(record["localOnly"], True)
        self.assertIs(record["durableWrites"], False)
        self.assertIs(record["redacted"], True)
        self.assertRegex(record["createdAt"], TIMESTAMP_PATTERN)
        self.assertRegex(record["updatedAt"], TIMESTAMP_PATTERN)
        self.assertRegex(record["fingerprint"], r"^sha256:[a-f0-9]{64}$")
        self.assertRegex(record["snapshotFingerprint"], r"^sha256:[a-f0-9]{64}$")
        self.assertRegex(record["storage"]["path"], REDACTED_PATH_PATTERN)
        self.assertIs(record["storage"]["pathRedacted"], True)
        self.assertEqual(record["summary"]["workspaceId"], "wsp_session_alpha")
        self.assertEqual(record["summary"]["deviceId"], "dev_laptop_alpha")
        self.assertEqual(record["summary"]["sessionId"], "sess_alpha_laptop_001")
        self.assertEqual(record["summary"]["operations"], ["open", "lock"])
        self.assertEqual(record["summary"]["eventCount"], 2)
        self.assertEqual(record["summary"]["auditRecordCount"], 2)
        self.assertIs(record["redaction"]["redacted"], True)
        self.assertIs(record["redaction"]["rawPathsStored"], False)
        self.assertIs(record["redaction"]["rawLockMaterialStored"], False)
        self.assertIs(record["redaction"]["rawBodyRetained"], False)

    def test_docs_and_fixture_avoid_private_paths_and_secret_shapes(self) -> None:
        forbidden_fragments = (
            "." + "codex-private",
            "." + "codex-run",
            "sovereignops-" + "codex-pack",
            "private-" + "plan",
            "plan-" + "pack",
            "file://",
            "http://",
            "https://",
            "localhost",
            "127.0.0.1",
            "~/",
            "curl ",
            "npx ",
            "npm install -g",
        )
        for fragment in forbidden_fragments:
            with self.subTest(fragment=fragment):
                self.assertNotIn(fragment, self.lower_combined_text)

        for pattern in (
            WINDOWS_ABSOLUTE_PATH_PATTERN,
            POSIX_ABSOLUTE_PATH_PATTERN,
            UNC_PATH_PATTERN,
            re.compile(r"(?<!\.)\.\.[/\\]"),
        ):
            with self.subTest(pattern=pattern.pattern):
                self.assertIsNone(pattern.search(self.combined_text))

        for pattern in SECRET_VALUE_PATTERNS:
            with self.subTest(pattern=pattern.pattern):
                self.assertIsNone(pattern.search(self.combined_text))

        restricted_terms = sorted({"".join(parts) for parts in RESTRICTED_PUBLIC_TERM_PARTS})
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
