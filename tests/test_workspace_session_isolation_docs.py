from __future__ import annotations

import json
import re
import unittest
from pathlib import Path
from typing import Any

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
DOC_PATH = ROOT / "docs" / "workspace-session-isolation.md"
ACCEPTANCE_PATH = ROOT / "examples" / "workspace-session" / "acceptance-session.json"

EXPECTED_SECTIONS = (
    "# Workspace Session Isolation",
    "## Scope",
    "## Desktop Command Contract",
    "## SDK Helper Expectations",
    "## CLI Acceptance Checks",
    "## Web State Cards",
    "## Sync And Backup Readiness",
    "## Audit Redaction",
    "## Threat-Model Gates",
    "## Local-First Checks",
    "## Validation Commands",
)

EXPECTED_REFERENCES = (
    "docs/workspace-session-isolation.md",
    "examples/workspace-session/acceptance-session.json",
    "apps/desktop/src/commands.ts",
    "packages/sdk-js/src/workspace.ts",
    "packages/sdk-js/src/storage.ts",
    "packages/path-security/src/index.ts",
    "packages/cli/src/commands.ts",
    "apps/web/src/localStore.ts",
    "services/sync/src/bundles.ts",
    "packages/workspace-backup/src/index.ts",
    "packages/observability/src/index.ts",
)

EXPECTED_DESKTOP_COMMANDS = (
    "workspace.open",
    "workspace.lock",
    "workspace.unlock",
    "workspace.plan_file_layout_migration",
)

EXPECTED_TAURI_COMMANDS = (
    "workspace_open",
    "workspace_lock",
    "workspace_unlock",
    "workspace_plan_file_layout_migration",
)

EXPECTED_SDK_HELPERS = (
    "createInMemoryWorkspaceClient",
    "validateWorkspaceDescriptor",
    "appendEvent",
    "listEvents",
    "snapshot",
    "validateJsonStorageRelativePath",
    "validateLocalRelativePath",
)

EXPECTED_CLI_COMMANDS = (
    "sovereignops workspace create --workspace-id wsp_notes_lab --name NotesLab",
    "sovereignops workspace list",
    "sovereignops ingest event --workspace-id wsp_notes_lab --type note.created",
    "sovereignops audit preview --workspace-id wsp_notes_lab --limit 5",
    "sovereignops export bundle --workspace-id wsp_notes_lab",
)

EXPECTED_CARD_IDS = (
    "session_lock",
    "storage_scope",
    "path_guard",
    "backup_ready",
    "audit_redaction",
)

EXPECTED_GATE_IDS = (
    "desktop_command_contract",
    "sdk_session_helpers",
    "cli_acceptance_checks",
    "web_state_cards",
    "sync_backup_readiness",
    "audit_redaction",
    "path_escape_gate",
)

EXPECTED_VALIDATION_COMMANDS = (
    "python -m json.tool examples\\workspace-session\\acceptance-session.json",
    "python -m unittest tests.test_workspace_session_isolation_docs",
)

REQUIRED_LOCAL_PHRASES = (
    "local-first",
    "repository-relative",
    "workspace-relative",
    "normalized forward-slash relative paths",
    "remain inside the workspace root",
    "network mode stays `disabled`",
    "private plan pack is read-only",
    "never copied into examples",
    "raw payload bodies",
    "absolute paths",
)

REQUIRED_REDACTION_PHRASES = (
    "[REDACTED]",
    "[redacted-path]",
    "backupRef",
    "workspaceRef",
    "actorRef",
    "redacted display",
    "Sensitive keys",
)

LOCAL_URI_PREFIXES = ("local://", "workspace://", "fixture://workspace-session/")
TIMESTAMP_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$")
SHA256_PATTERN = re.compile(r"^sha256:[a-f0-9]{64}$")
CURSOR_PATTERN = re.compile(r"^cur_v1:[0-9]{16}:(origin|evt_[A-Za-z0-9_-]{1,88})$")
REDACTED_REF_PATTERN = re.compile(r"^(backup|workspace|actor):[a-f0-9]{12}$")

FORBIDDEN_TEXT_SNIPPETS = (
    "https://",
    "http://",
    "curl ",
    "npx ",
    "npm install -g",
    "AKIA",
    "-----BEGIN",
    "sk-",
    "ghp_",
)

SECRET_PATTERNS = (
    re.compile(r"sk-[A-Za-z0-9]{20,}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9_]{20,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"(?i)\bbearer\s+(?!\[REDACTED\])[A-Za-z0-9._~+/=-]+"),
    re.compile(
        r"(?i)(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*"
        r"(?!\[REDACTED\])\S{4,}"
    ),
)

PATH_KEYS = {
    "guide",
    "acceptanceSession",
    "desktopCommands",
    "sdkWorkspace",
    "sdkStorage",
    "pathSecurity",
    "cliCommands",
    "webLocalStore",
    "syncBundles",
    "workspaceBackup",
    "observability",
    "contractSource",
    "module",
    "syncModule",
    "backupModule",
}


class WorkspaceSessionIsolationDocsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.doc_text = DOC_PATH.read_text(encoding="utf-8")
        cls.lower_doc_text = cls.doc_text.lower()
        cls.acceptance = _load_json(ACCEPTANCE_PATH)

    def test_document_has_required_sections_references_and_commands(self) -> None:
        self.assertTrue(DOC_PATH.is_file())

        for section in EXPECTED_SECTIONS:
            with self.subTest(section=section):
                self.assertIn(section, self.doc_text)

        for reference in EXPECTED_REFERENCES:
            with self.subTest(reference=reference):
                self.assertIn(reference, self.doc_text)

        for command in EXPECTED_DESKTOP_COMMANDS + EXPECTED_TAURI_COMMANDS:
            with self.subTest(command=command):
                self.assertIn(command, self.doc_text)

        for helper in EXPECTED_SDK_HELPERS:
            with self.subTest(helper=helper):
                self.assertIn(helper, self.doc_text)

        for command in EXPECTED_CLI_COMMANDS:
            with self.subTest(command=command):
                self.assertIn(command, self.doc_text)

        for phrase in REQUIRED_LOCAL_PHRASES:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase.lower(), self.lower_doc_text)

        for phrase in REQUIRED_REDACTION_PHRASES:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase.lower(), self.lower_doc_text)

        for command in EXPECTED_VALIDATION_COMMANDS:
            with self.subTest(command=command):
                self.assertIn(command, self.doc_text)

    def test_acceptance_session_top_level_shape(self) -> None:
        acceptance = self.acceptance

        self.assertEqual(
            acceptance["schemaVersion"],
            "workspace-session-isolation-acceptance/v1",
        )
        self.assertRegex(acceptance["generatedAt"], TIMESTAMP_PATTERN)
        self.assertTrue(acceptance["acceptanceId"].startswith("acc_workspace_session_"))
        self.assertEqual(acceptance["workspaceId"], "wsp_notes_lab")
        self.assertEqual(acceptance["deviceId"], "dev_laptop_alpha")
        self.assertIs(acceptance["localOnly"], True)
        self.assertEqual(acceptance["network"]["mode"], "disabled")
        self.assertEqual(acceptance["network"]["allowedHttpPrefixes"], [])
        self.assertEqual(
            acceptance["network"]["allowedUriPrefixes"],
            list(LOCAL_URI_PREFIXES),
        )
        self.assertEqual(acceptance["validationCommands"], list(EXPECTED_VALIDATION_COMMANDS))

        for key, value in acceptance["fixtures"].items():
            with self.subTest(fixture=key):
                self.assertIn(value, EXPECTED_REFERENCES)
                _assert_safe_existing_relative_path(self, value)

    def test_desktop_sdk_cli_and_web_acceptance_shape(self) -> None:
        desktop = self.acceptance["desktop"]
        self.assertEqual(desktop["contractSource"], "apps/desktop/src/commands.ts")
        self.assertEqual(
            tuple(command["id"] for command in desktop["commands"]),
            EXPECTED_DESKTOP_COMMANDS,
        )
        self.assertEqual(
            tuple(command["tauriCommand"] for command in desktop["commands"]),
            EXPECTED_TAURI_COMMANDS,
        )
        for command in desktop["commands"]:
            with self.subTest(command=command["id"]):
                self.assertIn("payload", command)
                self.assertIn("result", command)
                self.assertIsInstance(command["hostEffects"], list)
                self.assertTrue(command["hostEffects"])
        self.assertEqual(desktop["lockFlow"]["initial"], "unlocked")
        self.assertEqual(desktop["lockFlow"]["afterLock"], "locked")
        self.assertEqual(desktop["lockFlow"]["afterUnlock"], "unlocked")
        self.assertIs(desktop["lockFlow"]["rawLockTokenStored"], False)
        self.assertTrue(desktop["lockFlow"]["tokenRef"].startswith("lock_ref:"))

        sdk = self.acceptance["sdk"]
        self.assertEqual(tuple(sdk["helpers"]), EXPECTED_SDK_HELPERS)
        self.assertEqual(sdk["sessionExpectations"]["client"], "in-memory")
        self.assertIs(sdk["sessionExpectations"]["readonlySnapshots"], True)
        self.assertEqual(sdk["sessionExpectations"]["workspaceCount"], 1)
        self.assertEqual(sdk["sessionExpectations"]["eventCount"], 2)
        self.assertEqual(
            set(sdk["sessionExpectations"]["storageKinds"]),
            {"workspaceDescriptors", "workspaceEvents", "auditRecords", "syncCursors"},
        )

        cli = self.acceptance["cli"]
        self.assertEqual(cli["module"], "packages/cli/src/commands.ts")
        self.assertEqual(cli["workingDirectory"], "repository-root")
        self.assertEqual(tuple(cli["commands"]), EXPECTED_CLI_COMMANDS)
        self.assertEqual(cli["checks"]["exitCodes"], [0, 0, 0, 0, 0])
        self.assertIs(cli["checks"]["stdoutJson"], True)
        self.assertIs(cli["checks"]["stderrEmpty"], True)
        self.assertIs(cli["checks"]["readsOutsideWorkspace"], False)

        web = self.acceptance["web"]
        self.assertEqual(web["module"], "apps/web/src/localStore.ts")
        self.assertEqual(tuple(card["id"] for card in web["stateCards"]), EXPECTED_CARD_IDS)
        for card in web["stateCards"]:
            with self.subTest(card=card["id"]):
                self.assertEqual(card["status"], "ready")
                self.assertIsInstance(card["count"], int)
                self.assertGreater(card["count"], 0)
                self.assertNotIn("C:/", card["redactedDisplay"])
                self.assertNotIn("\\", card["redactedDisplay"])

    def test_sync_backup_audit_and_gate_shape(self) -> None:
        sync_backup = self.acceptance["syncBackup"]
        upload = sync_backup["uploadBatch"]
        download = sync_backup["downloadWindow"]
        backup = sync_backup["backup"]

        self.assertEqual(sync_backup["syncModule"], "services/sync/src/bundles.ts")
        self.assertEqual(
            sync_backup["backupModule"],
            "packages/workspace-backup/src/index.ts",
        )
        self.assertEqual(upload["workspaceId"], self.acceptance["workspaceId"])
        self.assertEqual(upload["deviceId"], self.acceptance["deviceId"])
        self.assertRegex(upload["baseCursor"], CURSOR_PATTERN)
        self.assertRegex(upload["nextCursor"], CURSOR_PATTERN)
        self.assertRegex(upload["checksum"], SHA256_PATTERN)
        self.assertEqual(upload["eventIds"], ["evt_notes_001", "evt_notes_002"])
        self.assertEqual(download["afterCursor"], upload["baseCursor"])
        self.assertEqual(download["nextCursor"], upload["nextCursor"])
        self.assertIs(download["hasMore"], False)

        self.assertEqual(backup["manifestVersion"], "1.0.0")
        self.assertTrue(backup["backupId"].startswith("bkp_"))
        self.assertEqual(backup["workspaceId"], self.acceptance["workspaceId"])
        self.assertTrue(backup["createdByActorId"].startswith("act_"))
        self.assertTrue(all(payload_id.startswith("pay_") for payload_id in backup["payloadIds"]))
        self.assertEqual(backup["payloadStorage"], "encrypted-descriptors-only")
        self.assertEqual(backup["restoreMode"], "preview")
        self.assertIs(backup["unsafeRestoreBlocked"], True)

        audit = self.acceptance["audit"]
        self.assertEqual(audit["module"], "packages/observability/src/index.ts")
        self.assertEqual(audit["replacement"], "[REDACTED]")
        self.assertEqual(
            set(audit["redactedPaths"]),
            {
                "attributes.authorization",
                "attributes.apiKey",
                "attributes.accessToken",
                "attributes.password",
                "attributes.secret",
                "attributes.token",
                "attributes.email",
                "attributes.phone",
            },
        )
        for ref in audit["redactedRefs"].values():
            with self.subTest(ref=ref):
                self.assertRegex(ref, REDACTED_REF_PATTERN)
        self.assertIs(audit["rawPayloadBodiesStored"], False)
        self.assertIs(audit["rawIdentifiersStored"], False)
        self.assertIs(audit["absolutePathsStored"], False)

        self.assertEqual(tuple(gate["id"] for gate in self.acceptance["gates"]), EXPECTED_GATE_IDS)
        self.assertTrue(all(gate["status"] == "pass" for gate in self.acceptance["gates"]))
        self.assertTrue(all(gate["checks"] for gate in self.acceptance["gates"]))

    def test_local_only_and_path_safety_language(self) -> None:
        workspace = self.acceptance["workspace"]
        self.assertEqual(workspace["rootDisplay"], "workspace://wsp_notes_lab")
        self.assertEqual(workspace["layoutVersion"], 3)

        for value in workspace["safeRelativePaths"]:
            with self.subTest(path=value):
                self.assertFalse(Path(value).is_absolute(), value)
                self.assertNotIn("..", Path(value).parts, value)
                self.assertNotIn("\\", value)
                self.assertNotRegex(value, r"^[A-Za-z]:")

        blocked = set(workspace["blockedPathSamples"])
        for required in (
            "../outside.json",
            "C:/outside/workspace.json",
            "//server/share/workspace.json",
            "~/workspace.json",
            "cache/session.json",
            "keys/root.pem",
            ".codex-private/session.json",
        ):
            with self.subTest(blocked=required):
                self.assertIn(required, blocked)

        for key_path, value in _walk_key_values(self.acceptance):
            if not isinstance(value, str):
                continue
            with self.subTest(key_path=".".join(key_path)):
                lower_value = value.lower()
                for snippet in FORBIDDEN_TEXT_SNIPPETS:
                    self.assertNotIn(snippet.lower(), lower_value)
                if value.startswith(("local://", "workspace://", "fixture://")):
                    self.assertTrue(value.startswith(LOCAL_URI_PREFIXES), value)
                if key_path[-1] in PATH_KEYS:
                    _assert_safe_existing_relative_path(self, value)

    def test_absence_of_restricted_terms_and_secret_shapes(self) -> None:
        for path in (DOC_PATH, ACCEPTANCE_PATH, Path(__file__)):
            with self.subTest(path=path.name):
                _assert_no_guarded_terms(self, path)
                _assert_no_secret_shapes(self, path)


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _walk_key_values(value: Any, key_path: tuple[str, ...] = ()) -> list[tuple[tuple[str, ...], Any]]:
    pairs: list[tuple[tuple[str, ...], Any]] = []
    if isinstance(value, dict):
        for key, item in value.items():
            item_path = (*key_path, key)
            pairs.append((item_path, item))
            pairs.extend(_walk_key_values(item, item_path))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            pairs.extend(_walk_key_values(item, (*key_path, str(index))))
    return pairs


def _assert_safe_existing_relative_path(testcase: unittest.TestCase, value: str) -> None:
    normalized = value.replace("\\", "/")
    path = Path(normalized)
    testcase.assertFalse(path.is_absolute(), value)
    testcase.assertNotIn("..", path.parts, value)
    testcase.assertTrue((ROOT / path).is_file(), value)


def _assert_no_guarded_terms(testcase: unittest.TestCase, path: Path) -> None:
    text = path.read_text(encoding="utf-8").lower()
    guarded_terms = sorted({"".join(parts) for parts in RESTRICTED_PUBLIC_TERM_PARTS})
    for term in guarded_terms:
        if term.isascii():
            escaped = re.escape(term).replace(r"\ ", r"\s+")
            pattern = re.compile(rf"(?<![a-z0-9_]){escaped}(?![a-z0-9_])")
            testcase.assertIsNone(pattern.search(text), f"{path} contains guarded wording")
        else:
            testcase.assertNotIn(term, text, f"{path} contains guarded wording")


def _assert_no_secret_shapes(testcase: unittest.TestCase, path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    for pattern in SECRET_PATTERNS:
        testcase.assertIsNone(pattern.search(text), f"{path} contains secret-shaped text")


if __name__ == "__main__":
    unittest.main()
