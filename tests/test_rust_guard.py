from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from scripts.rust_guard import check_file, iter_rust_files


class RustGuardTests(unittest.TestCase):
    def test_finds_forbidden_unwrap(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "lib.rs"
            path.write_text("fn demo() { value.unwrap(); }\n", encoding="utf-8")

            findings = check_file(path)

        self.assertEqual(len(findings), 1)
        self.assertEqual(findings[0].rule, "unwrap")

    def test_ignores_target_directory(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "target").mkdir()
            (root / "target" / "lib.rs").write_text("fn demo() {}\n", encoding="utf-8")
            (root / "src").mkdir()
            (root / "src" / "lib.rs").write_text("fn demo() {}\n", encoding="utf-8")

            files = iter_rust_files(root)

        self.assertEqual([file.name for file in files], ["lib.rs"])


if __name__ == "__main__":
    unittest.main()

