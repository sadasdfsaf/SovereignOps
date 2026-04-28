from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PACKAGE_JSON = ROOT / "package.json"
README = ROOT / "README.md"
CONTRIBUTING = ROOT / "CONTRIBUTING.md"


class FixtureDriftEntrypointTests(unittest.TestCase):
    def test_package_json_exposes_fixture_check_script(self) -> None:
        package = json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))

        self.assertEqual(
            package["scripts"]["fixtures:check"],
            "python scripts/fixture_drift.py --json",
        )

    def test_docs_mention_fixture_check_command(self) -> None:
        for path in (README, CONTRIBUTING):
            with self.subTest(path=path.name):
                self.assertIn(
                    "npm run fixtures:check",
                    path.read_text(encoding="utf-8"),
                )

        self.assertIn(
            "python scripts/fixture_drift.py --json",
            combined_public_docs(),
        )

    def test_public_docs_do_not_leak_private_plan_pack_paths(self) -> None:
        text = combined_public_docs().lower()

        blocked_terms = (
            "sovereignops-codex-pack",
            "e:\\sovereignops-codex-pack",
            "e:/sovereignops-codex-pack",
        )

        for term in blocked_terms:
            with self.subTest(term=term):
                self.assertNotIn(term, text)


def combined_public_docs() -> str:
    return "\n".join(
        path.read_text(encoding="utf-8")
        for path in (
            README,
            CONTRIBUTING,
        )
    )


if __name__ == "__main__":
    unittest.main()
