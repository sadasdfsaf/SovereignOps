from __future__ import annotations

import re
import unittest
from pathlib import Path

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
SANDBOX_DOC = ROOT / "docs" / "plugin-sandbox.md"
RELEASE_NOTES_DOC = ROOT / "docs" / "plugin-release-notes-example.md"

DOC_PATHS = (SANDBOX_DOC, RELEASE_NOTES_DOC)

SANDBOX_SECTIONS = (
    "# Plugin Sandbox Contract",
    "## Scope",
    "## Source Files",
    "## Sandbox Boundary",
    "## Denied Host APIs",
    "## Capability Review Flow",
    "## Resource Limits And Failures",
    "## Audit And Redaction",
    "## Validation Commands",
)

RELEASE_NOTES_SECTIONS = (
    "# Release Notes Plugin Example",
    "## Purpose",
    "## Source Files",
    "## Manifest Shape",
    "## Sandbox Run",
    "## Local Input Shape",
    "## Proposal Output",
    "## Review And Publication Flow",
    "## Redaction Expectations",
    "## Validation Commands",
)

REFERENCED_SOURCE_FILES = (
    "packages/plugin-sdk/src/sandbox.ts",
    "packages/plugin-sdk/src/manifest.ts",
    "packages/plugin-sdk/src/index.ts",
    "packages/plugin-sdk/tests/sandbox.test.mjs",
    "packages/plugin-sdk/tests/plugin-examples.test.mjs",
    "packages/plugin-sdk/tests/release-notes-plugin-example.test.mjs",
    "examples/plugins/release-notes/manifest.json",
    "examples/plugins/release-notes/plugin.json",
    "examples/plugins/release-notes/index.mjs",
    "examples/plugins/release-notes/sample-input.json",
    "docs/plugin-release-notes-example.md",
    "docs/plugin-sandbox.md",
)

DENIED_HOST_APIS = (
    "child_process",
    "Date.now",
    "env",
    "eval",
    "fetch",
    "fs",
    "Function",
    "Math.random",
    "net",
    "process",
    "setInterval",
    "setTimeout",
)

EXPECTED_COMMANDS = (
    "python -m unittest tests.test_plugin_sandbox_docs",
    "npm.cmd --workspace @sovereignops/plugin-sdk run check",
    "python scripts/release_notes.py --version plugin-docs --range HEAD..HEAD",
)

GUARDED_WORDING = (
    "proposal-only",
    "review before publication",
    "reviewer approval before release",
    "leaves no host-side change",
    "does not pass direct host objects",
    "Production hosts should still run plugins inside an isolated runtime boundary.",
)

REDACTION_WORDING = (
    "`[REDACTED]`",
    "`token`",
    "`secret`",
    "`password`",
    "`apiKey`",
    "`authorization`",
    "`credential`",
    "Preserve object shape",
    "repo-relative",
)

FORBIDDEN_PATH_SNIPPETS = (
    ".codex-private",
    ".codex-run",
    "sovereignops-codex-pack",
    "C:\\",
    "E:\\",
    "/Users/",
    "/home/",
    "\\Users\\",
    "AppData",
)

FORBIDDEN_TRANSPORT_WORDS = (
    "endpoint",
    "network",
    "base-url",
    "http://",
    "https://",
    "curl ",
)

OVERPROMISE_WORDS = (
    "guaranteed secure",
    "bulletproof",
    "impossible to bypass",
    "fully trusted",
)


class PluginSandboxDocsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.sandbox_text = SANDBOX_DOC.read_text(encoding="utf-8")
        cls.release_notes_text = RELEASE_NOTES_DOC.read_text(encoding="utf-8")
        cls.combined_text = cls.sandbox_text + "\n" + cls.release_notes_text
        cls.lower_text = cls.combined_text.lower()

    def test_documents_required_sections(self) -> None:
        self.assertTrue(SANDBOX_DOC.is_file())
        self.assertTrue(RELEASE_NOTES_DOC.is_file())

        for section in SANDBOX_SECTIONS:
            with self.subTest(section=section):
                self.assertIn(section, self.sandbox_text)

        for section in RELEASE_NOTES_SECTIONS:
            with self.subTest(section=section):
                self.assertIn(section, self.release_notes_text)

    def test_referenced_source_files_are_public_and_exist(self) -> None:
        for relative_path in REFERENCED_SOURCE_FILES:
            with self.subTest(path=relative_path):
                self.assertIn(f"`{relative_path}`", self.combined_text)
                self.assertTrue((ROOT / relative_path).is_file(), relative_path)

    def test_documents_sandbox_contract_and_denied_host_apis(self) -> None:
        for value in (
            "`context.hasCapability(id)`",
            "`context.requireCapability(id)`",
            "`context.audit(type, detail)`",
            "`context.tick(count, label)`",
            "`context.capabilities`",
            "`context.deniedHostApis`",
            "`context.limits`",
            "`context.boundary`",
            "`DENIED_PLUGIN_HOST_APIS`",
            "`DEFAULT_PLUGIN_SANDBOX_LIMITS`",
            "`SANDBOX_ASYNC_DENIED`",
            "`SANDBOX_CAPABILITY_DENIED`",
            "`SANDBOX_HOST_API_DENIED`",
            "`SANDBOX_RESOURCE_LIMIT`",
            "`PLUGIN_ERROR`",
        ):
            with self.subTest(value=value):
                self.assertIn(value, self.sandbox_text)

        for api in DENIED_HOST_APIS:
            with self.subTest(api=api):
                self.assertIn(f"`{api}`", self.sandbox_text)

    def test_documents_release_notes_example_contract(self) -> None:
        for value in (
            "`plugin.release-notes`",
            "`index.mjs`",
            "`propose_agent_action`",
            "`read_object`",
            "`propose_release_notes`",
            "`read_completed_tasks`",
            "`draft_release_notes`",
            "`completed_task_feed`",
            "`release_note_review`",
            "`0.3.0`",
            "`plugin.release-notes.local-draft`",
            "`read_local_change_summaries`",
            "`redact_sensitive_release_note_fields`",
            "`propose_release_note_draft`",
            "`examples/plugins/release-notes/sample-input.json`",
            "`draftReleaseNotes(context, input)`",
            "`release_notes.tasks_scanned`",
            "`release_notes.completed_selected`",
            "`release_notes_proposal`",
            "`proposalOnly: true`",
            "`sourceTaskIds`",
            "`omittedTaskIds`",
        ):
            with self.subTest(value=value):
                self.assertIn(value, self.release_notes_text)

    def test_documents_capability_review_and_guarded_wording(self) -> None:
        for wording in GUARDED_WORDING:
            with self.subTest(wording=wording):
                self.assertIn(wording, self.combined_text)

        for wording in OVERPROMISE_WORDS:
            with self.subTest(wording=wording):
                self.assertNotIn(wording, self.lower_text)

    def test_documents_redaction_expectations(self) -> None:
        for wording in REDACTION_WORDING:
            with self.subTest(wording=wording):
                self.assertIn(wording, self.combined_text)

        secret_like_patterns = (
            re.compile(r"sk-[A-Za-z0-9]{20,}"),
            re.compile(r"gh[pousr]_[A-Za-z0-9_]{20,}"),
            re.compile(r"AKIA[0-9A-Z]{16}"),
            re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
        )
        for pattern in secret_like_patterns:
            with self.subTest(pattern=pattern.pattern):
                self.assertIsNone(pattern.search(self.combined_text))

    def test_documents_validation_commands(self) -> None:
        for command in EXPECTED_COMMANDS:
            with self.subTest(command=command):
                self.assertIn(command, self.sandbox_text)
                self.assertIn(command, self.release_notes_text)

    def test_documents_avoid_private_paths_and_transport_wording(self) -> None:
        for snippet in FORBIDDEN_PATH_SNIPPETS:
            with self.subTest(snippet=snippet):
                self.assertNotIn(snippet.lower(), self.lower_text)

        drive_letter_pattern = re.compile(r"(?<![A-Za-z0-9])[A-Za-z]:[\\/]")
        self.assertIsNone(drive_letter_pattern.search(self.combined_text))

        for word in FORBIDDEN_TRANSPORT_WORDS:
            with self.subTest(word=word):
                self.assertNotIn(word, self.lower_text)

    def test_documents_avoid_restricted_public_content_terms(self) -> None:
        restricted_terms = sorted({"".join(parts) for parts in RESTRICTED_PUBLIC_TERM_PARTS})
        for term in restricted_terms:
            with self.subTest(term=term):
                if term.isascii():
                    escaped = re.escape(term).replace(r"\ ", r"\s+")
                    pattern = re.compile(rf"(?<![a-z0-9_]){escaped}(?![a-z0-9_])")
                    self.assertIsNone(pattern.search(self.lower_text))
                else:
                    self.assertNotIn(term, self.lower_text)


if __name__ == "__main__":
    unittest.main()
