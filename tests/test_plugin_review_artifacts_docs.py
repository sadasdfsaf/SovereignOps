from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT / "docs" / "plugin-review-artifacts.md"
ARTIFACT = ROOT / "examples" / "plugins" / "release-notes" / "review-artifact.json"

REQUIRED_SECTIONS = (
    "# Plugin Review Artifacts",
    "## Purpose",
    "## Public Files",
    "## Artifact Contents",
    "## Release Notes Example",
    "## Redaction",
    "## Local-Only Constraints",
    "## Review Steps",
    "## Validation",
)

REFERENCED_PUBLIC_FILES = (
    "examples/plugins/release-notes/review-artifact.json",
    "examples/plugins/release-notes/plugin.json",
    "examples/plugins/release-notes/manifest.json",
    "examples/plugins/release-notes/index.mjs",
    "examples/plugins/release-notes/sample-input.json",
    "packages/plugin-sdk/src/sandbox.ts",
    "packages/plugin-sdk/src/manifest.ts",
    "packages/plugin-sdk/tests/release-notes-plugin-example.test.mjs",
    "docs/plugin-review-artifacts.md",
    "docs/plugin-release-notes-example.md",
    "docs/plugin-sandbox.md",
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
    "password=[REDACTED]",
    "apiKey=[REDACTED]",
    "Authorization: Bearer [REDACTED]",
)

LOCAL_ONLY_WORDING = (
    "local-only",
    "proposal-only",
    "`externalCalls: 0`",
    "`localOnly: true`",
    "repo-relative file references",
)

PRIVATE_PATH_SNIPPETS = (
    "".join((".codex", "-private")),
    "".join((".codex", "-run")),
    "".join(("sovereignops", "-codex", "-pack")),
    "C:" + "\\",
    "E:" + "\\",
    "/Users/",
    "/home/",
    "\\" + "Users" + "\\",
    "AppData",
)

SECRET_PATTERNS = (
    re.compile(r"sk-[A-Za-z0-9]{20,}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9_]{20,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"\bBearer\s+(?!\[REDACTED\])[A-Za-z0-9._~+/=-]+"),
)


class PluginReviewArtifactsDocsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.doc_text = DOC.read_text(encoding="utf-8")
        cls.artifact_text = ARTIFACT.read_text(encoding="utf-8")
        cls.artifact = json.loads(cls.artifact_text)
        cls.combined_text = cls.doc_text + "\n" + cls.artifact_text
        cls.lower_text = cls.combined_text.lower()

    def test_document_has_required_sections(self) -> None:
        self.assertTrue(DOC.is_file())
        for section in REQUIRED_SECTIONS:
            with self.subTest(section=section):
                self.assertIn(section, self.doc_text)

    def test_referenced_public_files_exist_and_are_repo_relative(self) -> None:
        for relative_path in REFERENCED_PUBLIC_FILES:
            with self.subTest(path=relative_path):
                self.assertIn(f"`{relative_path}`", self.doc_text)
                self.assertIn(relative_path, self.artifact_text)
                self.assertTrue((ROOT / relative_path).is_file(), relative_path)
                self.assertFalse(Path(relative_path).is_absolute(), relative_path)

    def test_artifact_shape_matches_release_notes_plugin_review(self) -> None:
        self.assertEqual(self.artifact["kind"], "plugin_review_artifact")
        self.assertEqual(self.artifact["plugin"]["id"], "plugin.release-notes.local-draft")
        self.assertEqual(self.artifact["plugin"]["manifestPath"], "examples/plugins/release-notes/plugin.json")
        self.assertEqual(self.artifact["plugin"]["entrypoint"], "examples/plugins/release-notes/index.mjs")
        self.assertEqual(self.artifact["scope"]["proposalOnly"], True)
        self.assertEqual(self.artifact["scope"]["localOnly"], True)
        self.assertEqual(self.artifact["scope"]["externalCalls"], 0)
        self.assertTrue(self.artifact["scope"]["resourceUri"].startswith("local://"))
        self.assertEqual(self.artifact["sandboxRun"]["result"], "ok")
        self.assertEqual(self.artifact["sandboxRun"]["ticks"], 16)
        self.assertEqual(self.artifact["proposal"]["type"], "release_note_draft_metadata")
        self.assertEqual(self.artifact["proposal"]["sourceCounts"]["includedChanges"], 3)
        self.assertEqual(self.artifact["proposal"]["omittedChangeIds"], ["chg-004"])

    def test_redaction_wording_and_artifact_values_are_present(self) -> None:
        for wording in REDACTION_WORDING:
            with self.subTest(wording=wording):
                self.assertIn(wording, self.combined_text)

        self.assertEqual(self.artifact["redactionReport"]["placeholder"], "[REDACTED]")
        self.assertEqual(
            [item["kind"] for item in self.artifact["redactionReport"]["redactions"]],
            [
                "bearer_token",
                "key_value_secret",
                "private_key_block",
                "key_value_secret",
            ],
        )
        self.assertGreaterEqual(
            sum(item["replacements"] for item in self.artifact["redactionReport"]["redactions"]),
            6,
        )

    def test_local_only_constraints_are_documented_and_encoded(self) -> None:
        for wording in LOCAL_ONLY_WORDING:
            with self.subTest(wording=wording):
                self.assertIn(wording, self.doc_text)

        self.assertEqual(self.artifact["scope"]["localOnly"], True)
        self.assertEqual(self.artifact["scope"]["externalCalls"], 0)
        self.assertEqual(self.artifact["proposal"]["proposalOnly"], True)
        self.assertEqual(self.artifact["proposal"]["localOnly"], True)
        self.assertEqual(self.artifact["proposal"]["externalCalls"], 0)
        self.assertEqual(self.artifact["sandboxRun"]["hostApiEvents"], [])

    def test_no_private_paths_or_remote_locations_are_exposed(self) -> None:
        for snippet in PRIVATE_PATH_SNIPPETS:
            with self.subTest(snippet=snippet):
                self.assertNotIn(snippet.lower(), self.lower_text)

        drive_letter_pattern = re.compile(r"(?<![A-Za-z0-9])[A-Za-z]:[\\/]")
        self.assertIsNone(drive_letter_pattern.search(self.combined_text))
        self.assertIsNone(re.search(r"\bhttps?://", self.combined_text, flags=re.IGNORECASE))

    def test_no_raw_secret_like_values_are_exposed(self) -> None:
        for pattern in SECRET_PATTERNS:
            with self.subTest(pattern=pattern.pattern):
                self.assertIsNone(pattern.search(self.combined_text))

    def test_no_restricted_domain_wording_is_exposed(self) -> None:
        restricted_terms = {"".join(parts) for parts in RESTRICTED_PUBLIC_TERM_PARTS}
        restricted_terms.update({
            "public" + "-sector",
            "public" + " " + "sector",
        })
        for term in sorted(restricted_terms):
            with self.subTest(term=term):
                if term.isascii():
                    escaped = re.escape(term).replace(r"\ ", r"\s+")
                    pattern = re.compile(rf"(?<![a-z0-9_]){escaped}(?![a-z0-9_])")
                    self.assertIsNone(pattern.search(self.lower_text))
                else:
                    self.assertNotIn(term, self.lower_text)


if __name__ == "__main__":
    unittest.main()
