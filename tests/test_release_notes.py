from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path

from scripts import release_notes


class ReleaseNotesTests(unittest.TestCase):
    def test_render_from_json_fixture_groups_conventional_commits(self) -> None:
        commits = [
            release_notes.Commit("aaaaaaaaaaaa1111", "feat(cli): add batch export"),
            release_notes.Commit("bbbbbbbbbbbb2222", "fix(sync): retry local queue"),
            release_notes.Commit("cccccccccccc3333", "docs: refresh setup notes"),
            release_notes.Commit("dddddddddddd4444", "refactor: simplify parser"),
            release_notes.Commit("eeeeeeeeeeee5555", "update dependency labels"),
        ]

        markdown = release_notes.render_release_notes(
            commits,
            version="0.2.0",
            release_date="2026-04-27",
            source="fixture",
        )

        self.assertEqual(
            markdown,
            "\n".join(
                [
                    "# Release Notes - 0.2.0",
                    "",
                    "Date: 2026-04-27",
                    "Source: `fixture`",
                    "",
                    "## Added",
                    "- cli: add batch export (`aaaaaaaaaaaa`)",
                    "",
                    "## Fixed",
                    "- sync: retry local queue (`bbbbbbbbbbbb`)",
                    "",
                    "## Changed",
                    "- simplify parser (`dddddddddddd`)",
                    "",
                    "## Documentation",
                    "- refresh setup notes (`cccccccccccc`)",
                    "",
                    "## Other",
                    "- update dependency labels (`eeeeeeeeeeee`)",
                    "",
                ]
            ),
        )

    def test_load_commits_from_json_accepts_message_field(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            fixture = Path(tmp) / "commits.json"
            fixture.write_text(
                """
{
  "commits": [
    {
      "hash": "abc123",
      "message": "feat(ui): add compact toolbar\\n\\nBody text"
    }
  ]
}
""".strip(),
                encoding="utf-8",
            )

            commits = release_notes.load_commits_from_json(fixture)

        self.assertEqual(len(commits), 1)
        self.assertEqual(commits[0].subject, "feat(ui): add compact toolbar")
        self.assertEqual(commits[0].body, "Body text")

    def test_git_log_input_is_chronological_and_deterministic(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            subprocess.run(["git", "init"], cwd=root, check=True, capture_output=True, text=True)
            subprocess.run(
                ["git", "config", "user.email", "dev@example.com"],
                cwd=root,
                check=True,
                capture_output=True,
                text=True,
            )
            subprocess.run(
                ["git", "config", "user.name", "Dev"],
                cwd=root,
                check=True,
                capture_output=True,
                text=True,
            )
            (root / "app.txt").write_text("one\n", encoding="utf-8")
            subprocess.run(["git", "add", "app.txt"], cwd=root, check=True, capture_output=True, text=True)
            subprocess.run(
                ["git", "commit", "-m", "feat(app): add first view"],
                cwd=root,
                check=True,
                capture_output=True,
                text=True,
            )
            (root / "app.txt").write_text("one\ntwo\n", encoding="utf-8")
            subprocess.run(["git", "add", "app.txt"], cwd=root, check=True, capture_output=True, text=True)
            subprocess.run(
                ["git", "commit", "-m", "fix(app): keep local cache stable"],
                cwd=root,
                check=True,
                capture_output=True,
                text=True,
            )

            commits = release_notes.load_commits_from_git(root)
            markdown = release_notes.render_release_notes(commits, version="test")

        self.assertEqual([commit.subject for commit in commits], [
            "feat(app): add first view",
            "fix(app): keep local cache stable",
        ])
        self.assertIn("## Added\n- app: add first view", markdown)
        self.assertIn("## Fixed\n- app: keep local cache stable", markdown)

    def test_breaking_marker_uses_breaking_changes_section(self) -> None:
        markdown = release_notes.render_release_notes(
            [release_notes.Commit("abc", "feat(api)!: rename workspace field")],
            version="test",
        )

        self.assertIn("## Breaking Changes", markdown)
        self.assertIn("- api: rename workspace field (`abc`)", markdown)


if __name__ == "__main__":
    unittest.main()
