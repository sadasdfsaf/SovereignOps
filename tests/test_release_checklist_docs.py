from __future__ import annotations

import re
import unittest
from pathlib import Path

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
DOC_PATH = ROOT / "docs" / "release-checklist.md"

EXPECTED_HEADINGS = (
    "# Release Checklist",
    "## Versioning",
    "## Validation",
    "## Local-First, Privacy, And Security",
    "## Artifact Review",
    "## Rollback",
)

EXPECTED_COMMANDS = (
    "python scripts/release_check.py --dry-run",
    "python scripts/release_check.py",
    "python scripts/smoke.py",
    "python -m unittest discover -s tests",
    "python -m unittest discover -s services/ingest/tests",
    "python scripts/repo_health.py --json",
    "python scripts/status_dashboard.py --json",
    "python scripts/public_boundary_guard.py --json",
    "python scripts/env_guard.py",
    "python scripts/validate_openapi.py",
    "node scripts/export-json-schema.mjs --check",
    "npm run check --workspaces --if-present",
    "pnpm -r --if-present check",
    "cargo check --workspace",
    "git status --short",
    "git diff --stat",
)

EXPECTED_TOPICS = (
    "semantic version",
    "local paths",
    "placeholder values",
    "secret-shaped names",
    "artifact checksums",
    "patch release",
)


class ReleaseChecklistDocsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.doc_text = DOC_PATH.read_text(encoding="utf-8")
        cls.lower_doc_text = cls.doc_text.lower()

    def test_doc_has_required_sections_topics_and_commands(self) -> None:
        self.assertTrue(DOC_PATH.is_file())

        for heading in EXPECTED_HEADINGS:
            with self.subTest(heading=heading):
                self.assertIn(heading, self.doc_text)

        for command in EXPECTED_COMMANDS:
            with self.subTest(command=command):
                self.assertIn(f"`{command}`", self.doc_text)

        for topic in EXPECTED_TOPICS:
            with self.subTest(topic=topic):
                self.assertIn(topic, self.lower_doc_text)

    def test_doc_avoids_restricted_public_content_terms(self) -> None:
        restricted_terms = sorted({"".join(parts) for parts in RESTRICTED_PUBLIC_TERM_PARTS})
        for term in restricted_terms:
            with self.subTest(term=term):
                if term.isascii():
                    escaped = re.escape(term).replace(r"\ ", r"\s+")
                    pattern = re.compile(rf"(?<![a-z0-9_]){escaped}(?![a-z0-9_])")
                    self.assertIsNone(pattern.search(self.lower_doc_text))
                else:
                    self.assertNotIn(term, self.lower_doc_text)


if __name__ == "__main__":
    unittest.main()
