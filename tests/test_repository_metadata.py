from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class RepositoryMetadataTests(unittest.TestCase):
    def test_cargo_workspace_repository_points_to_public_remote(self) -> None:
        cargo_toml = (ROOT / "Cargo.toml").read_text(encoding="utf-8")
        match = re.search(r'(?m)^repository\s*=\s*"([^"]+)"$', cargo_toml)

        self.assertIsNotNone(match)
        self.assertEqual(match.group(1), "https://github.com/sadasdfsaf/SovereignOps")


if __name__ == "__main__":
    unittest.main()
