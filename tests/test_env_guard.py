from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from scripts.env_guard import check_env_file, discover_examples


class EnvGuardTests(unittest.TestCase):
    def test_accepts_blank_sensitive_examples(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / ".env.example"
            path.write_text("SERVICE_TOKEN=\nBIND_HOST=127.0.0.1\n", encoding="utf-8")

            findings = check_env_file(path)

        self.assertEqual(findings, [])

    def test_rejects_secret_like_example_values(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / ".env.example"
            path.write_text("SERVICE_SECRET=plain-value\n", encoding="utf-8")

            findings = check_env_file(path)

        self.assertEqual(len(findings), 1)
        self.assertIn("sensitive examples", findings[0].message)

    def test_discovers_nested_examples(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            nested = root / "services" / "sync"
            nested.mkdir(parents=True)
            (nested / ".env.example").write_text("SYNC_TOKEN=\n", encoding="utf-8")

            examples = discover_examples(root)

        self.assertEqual(len(examples), 1)


if __name__ == "__main__":
    unittest.main()

