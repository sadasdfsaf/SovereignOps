from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from scripts.repo_health import collect_report, render_markdown, scan_public_terms


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
        self.assertIn("restricted term", warnings[0])

    def test_markdown_report_lists_missing_paths(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            report = collect_report(Path(tmp))

        markdown = render_markdown(report)
        self.assertIn("Required Paths", markdown)
        self.assertIn("README.md", markdown)


if __name__ == "__main__":
    unittest.main()
