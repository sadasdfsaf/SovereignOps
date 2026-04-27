from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from scripts.repo_health import collect_report, discover_public_files, render_markdown, scan_public_terms


class RepoHealthTests(unittest.TestCase):
    def test_restricted_public_terms_are_reported(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "docs").mkdir()
            restricted = "elec" + "tion"
            (root / "docs" / "note.md").write_text(
                f"This contains {restricted} language.\n",
                encoding="utf-8",
            )

            warnings = scan_public_terms(root)

        self.assertEqual(len(warnings), 1)
        self.assertIn("restricted public-content term", warnings[0])
        self.assertIn("docs/note.md:1", warnings[0])

    def test_restricted_public_terms_include_localized_words(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "README.md").write_text(
                "This line contains " + "\u653f" + "\u5e9c" + " wording.\n",
                encoding="utf-8",
            )

            warnings = scan_public_terms(root)

        self.assertEqual(len(warnings), 1)

    def test_private_codex_log_is_not_scanned(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            private = root / ".codex-private"
            private.mkdir()
            (private / "RUNLOG.md").write_text("private " + "polit" + "ics\n", encoding="utf-8")
            (root / "README.md").write_text("clean public content\n", encoding="utf-8")

            warnings = scan_public_terms(root)
            files = discover_public_files(root)

        self.assertEqual(warnings, [])
        self.assertEqual([path.name for path in files], ["README.md"])

    def test_ascii_terms_require_word_boundaries(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "module.ts").write_text(
                "const selected = cloneSelection(selection);\n",
                encoding="utf-8",
            )

            warnings = scan_public_terms(root)

        self.assertEqual(warnings, [])

    def test_markdown_report_lists_missing_paths(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            report = collect_report(Path(tmp))

        markdown = render_markdown(report)
        self.assertIn("Required Paths", markdown)
        self.assertIn("README.md", markdown)


if __name__ == "__main__":
    unittest.main()
