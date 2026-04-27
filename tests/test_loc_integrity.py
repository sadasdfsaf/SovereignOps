from __future__ import annotations

import json
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

from scripts import loc_integrity


class LocIntegrityTests(unittest.TestCase):
    def test_evaluate_passes_when_minimums_and_generated_limits_match(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "scripts").mkdir()
            (root / "scripts" / "tool.py").write_text("print('ok')\n", encoding="utf-8")
            (root / "docs").mkdir()
            (root / "docs" / "note.md").write_text("line one\nline two\n", encoding="utf-8")
            (root / "generated").mkdir()
            (root / "generated" / "schema.ts").write_text("export const x = 1;\n", encoding="utf-8")

            report = loc_integrity.evaluate(
                root,
                minimums={"docs": 2, "tooling": 1, "total": 3},
                generated_max_files=1,
                generated_max_lines=1,
            )

        self.assertTrue(report.ok)
        self.assertEqual(report.counts.totals["docs"], 2)
        self.assertEqual(report.counts.totals["tooling"], 1)
        self.assertEqual(len(report.generated_files), 1)

    def test_evaluate_reports_minimum_and_generated_violations(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "scripts").mkdir()
            (root / "scripts" / "tool.py").write_text("print('ok')\n", encoding="utf-8")
            (root / "generated").mkdir()
            (root / "generated" / "large.ts").write_text("a\nb\n", encoding="utf-8")

            report = loc_integrity.evaluate(
                root,
                minimums={"tooling": 2, "total": 3},
                generated_max_files=0,
                generated_max_lines=1,
            )

        self.assertFalse(report.ok)
        self.assertEqual(
            [violation.code for violation in report.violations],
            ["minimum:tooling", "minimum:total", "generated:files", "generated:lines"],
        )

    def test_json_output_is_machine_readable(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "scripts").mkdir()
            (root / "scripts" / "tool.py").write_text("print('ok')\n", encoding="utf-8")

            output = StringIO()
            with redirect_stdout(output):
                exit_code = loc_integrity.main(
                    [
                        "--root",
                        str(root),
                        "--no-default-minimums",
                        "--minimum",
                        "tooling=1",
                        "--minimum",
                        "total=1",
                        "--json",
                    ]
                )

        payload = json.loads(output.getvalue())
        self.assertEqual(exit_code, 0)
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["totals"]["tooling"], 1)
        self.assertEqual(payload["generated"]["total_files"], 0)

    def test_private_directory_is_not_counted(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            private = root / ".codex-private"
            private.mkdir()
            (private / "notes.py").write_text("print('skip')\n", encoding="utf-8")
            (root / "scripts").mkdir()
            (root / "scripts" / "tool.py").write_text("print('ok')\n", encoding="utf-8")

            report = loc_integrity.evaluate(
                root,
                minimums={"tooling": 1, "total": 1},
            )

        self.assertTrue(report.ok)
        self.assertEqual(report.counts.files, 1)
        self.assertEqual(report.counts.total, 1)


if __name__ == "__main__":
    unittest.main()
