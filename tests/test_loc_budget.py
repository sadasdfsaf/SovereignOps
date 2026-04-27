from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from scripts.loc_budget import collect_counts, render_summary


class LocBudgetTests(unittest.TestCase):
    def test_counts_source_but_skips_generated_and_dependencies(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "scripts").mkdir()
            (root / "scripts" / "tool.py").write_text("print('ok')\n", encoding="utf-8")
            (root / "generated").mkdir()
            (root / "generated" / "schema.ts").write_text("export const x = 1;\n", encoding="utf-8")
            (root / "node_modules").mkdir()
            (root / "node_modules" / "ignored.js").write_text("console.log('x');\n", encoding="utf-8")

            counts = collect_counts(root)

        self.assertEqual(counts.files, 1)
        self.assertEqual(counts.totals, {"tooling": 1})
        self.assertIn("remaining", render_summary(counts))


if __name__ == "__main__":
    unittest.main()

