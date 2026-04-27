from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path

from scripts.validate_lifecycle_fixtures import (
    DEFAULT_FIXTURE_ROOT,
    main,
    validate_lifecycle_fixtures,
)


class LifecycleFixtureTests(unittest.TestCase):
    def test_checked_in_fixtures_are_valid(self) -> None:
        report = validate_lifecycle_fixtures(DEFAULT_FIXTURE_ROOT)

        self.assertTrue(report.ok, "\n".join(report.issues))

    def test_cli_accepts_default_fixture_root(self) -> None:
        self.assertEqual(main([str(DEFAULT_FIXTURE_ROOT)]), 0)

    def test_rejects_unsafe_temp_manifest_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "lifecycle-fixtures"
            shutil.copytree(DEFAULT_FIXTURE_ROOT, root)
            manifest_path = root / "manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["payloads"][0]["path"] = "../settings.json.enc"
            manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

            report = validate_lifecycle_fixtures(root)

        self.assertFalse(report.ok)
        self.assertIn("parent traversal", "\n".join(report.issues))

    def test_rejects_restricted_temp_fixture_wording(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "lifecycle-fixtures"
            shutil.copytree(DEFAULT_FIXTURE_ROOT, root)
            reviews_path = root / "reviews.json"
            reviews = json.loads(reviews_path.read_text(encoding="utf-8"))
            reviews["migrationPlanReviews"][0]["title"] = "Review " + ("mil" + "itary") + " data"
            reviews_path.write_text(json.dumps(reviews, indent=2), encoding="utf-8")

            report = validate_lifecycle_fixtures(root)

        self.assertFalse(report.ok)
        self.assertIn("restricted wording", "\n".join(report.issues))


if __name__ == "__main__":
    unittest.main()
