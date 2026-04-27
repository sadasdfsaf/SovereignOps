from __future__ import annotations

import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

from scripts.public_boundary_guard import (
    REQUIRED_GITIGNORE_ENTRIES,
    collect_boundary_report,
    main,
)


class PublicBoundaryGuardTests(unittest.TestCase):
    def test_accepts_required_ignores_and_no_private_public_paths(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_gitignore(root)

            report = collect_boundary_report(root, tracked_paths=("README.md", "docs/status.md"))

        self.assertTrue(report.ok)
        self.assertEqual(report.issues, ())

    def test_rejects_missing_gitignore_entries(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / ".gitignore").write_text(".codex-private/\n", encoding="utf-8")

            report = collect_boundary_report(root, tracked_paths=())

        self.assertFalse(report.ok)
        self.assertIn("missing_gitignore_entry", {issue.code for issue in report.issues})
        self.assertIn("PLANS.md", "\n".join(issue.message for issue in report.issues))

    def test_rejects_private_paths_present_or_tracked(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_gitignore(root)
            (root / "tasks").mkdir()
            (root / "tasks" / "backlog.jsonl").write_text("private\n", encoding="utf-8")

            report = collect_boundary_report(
                root,
                tracked_paths=(".codex-private/RUNLOG.md", "CODEX_START_HERE.zh-CN.md"),
            )

        by_code = {issue.code for issue in report.issues}
        by_path = {issue.path for issue in report.issues}
        self.assertIn("forbidden_public_path", by_code)
        self.assertIn("forbidden_tracked_private_path", by_code)
        self.assertIn(".codex-private/RUNLOG.md", by_path)

    def test_cli_returns_nonzero_for_boundary_issues(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / ".gitignore").write_text("", encoding="utf-8")

            with redirect_stdout(StringIO()):
                exit_code = main(["--root", str(root), "--json"])

        self.assertEqual(exit_code, 1)


def write_gitignore(root: Path) -> None:
    root.mkdir(parents=True, exist_ok=True)
    (root / ".gitignore").write_text(
        "\n".join(REQUIRED_GITIGNORE_ENTRIES) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    unittest.main()
