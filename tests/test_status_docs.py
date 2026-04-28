from __future__ import annotations

import re
import unittest
from pathlib import Path

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
DOC_PATH = ROOT / "docs" / "status.md"

REQUIRED_SECTIONS = (
    "# Repository Status",
    "## Scope At A Glance",
    "## Module Summary",
    "## Validation Commands",
    "## Fixture Drift And Status Dashboard",
    "## Known Tool Gaps",
    "## Local-First And Privacy Posture",
    "## Interpreting Status",
)

REQUIRED_MODULE_PATHS = (
    "crates/sovereign_core",
    "packages/schemas",
    "apps/api",
    "apps/web",
    "apps/desktop",
    "packages/cli",
    "packages/sdk-js",
    "packages/plugin-sdk",
    "services/ingest",
    "services/sync",
    "services/mcp-gateway",
    "services/automation",
    "scripts",
)

REQUIRED_COMMANDS = (
    "python scripts\\smoke.py",
    "python -m unittest discover -s tests",
    "python scripts\\repo_health.py --json",
    "python scripts\\public_boundary_guard.py --json",
    "python scripts\\loc_budget.py --summary",
    "python scripts\\env_guard.py",
    "npm run fixtures:check",
    "python scripts/fixture_drift.py --json",
    "python scripts/status_dashboard.py --json",
    "node scripts/node-check.mjs",
)

REQUIRED_PHRASES = (
    "local-first",
    "privacy posture",
    "shell-specific",
    "skipped optional check",
    "skipped optional tooling",
    "local-only deterministic fixtures",
    "response schema coverage",
    "blocked public-content wording",
    "commands they ran",
)

PRIVATE_REFERENCE_PARTS = (
    ("codex", "-private"),
    ("sovereignops", "-codex", "-pack"),
    ("run", "log"),
    ("app", "data"),
)

PRIVATE_PATH_SNIPPETS = (
    "/users/",
    "/home/",
    "\\users\\",
)


class StatusDocsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.text = DOC_PATH.read_text(encoding="utf-8")
        cls.lower_text = cls.text.lower()

    def test_documents_required_sections(self) -> None:
        self.assertTrue(DOC_PATH.is_file())
        for section in REQUIRED_SECTIONS:
            with self.subTest(section=section):
                self.assertIn(section, self.text)

    def test_documents_modules_commands_and_status_language(self) -> None:
        for module_path in REQUIRED_MODULE_PATHS:
            with self.subTest(module_path=module_path):
                self.assertIn(f"`{module_path}`", self.text)

        for command in REQUIRED_COMMANDS:
            with self.subTest(command=command):
                self.assertIn(command, self.text)

        for phrase in REQUIRED_PHRASES:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.lower_text)

    def test_document_stays_concise(self) -> None:
        content_lines = [line for line in self.text.splitlines() if line.strip()]
        self.assertLessEqual(len(content_lines), 80)

    def test_document_avoids_restricted_public_content_terms(self) -> None:
        restricted_terms = sorted({"".join(parts) for parts in RESTRICTED_PUBLIC_TERM_PARTS})
        for term in restricted_terms:
            with self.subTest(term=term):
                if term.isascii():
                    escaped = re.escape(term).replace(r"\ ", r"\s+")
                    pattern = re.compile(rf"(?<![a-z0-9_]){escaped}(?![a-z0-9_])")
                    self.assertIsNone(pattern.search(self.lower_text))
                else:
                    self.assertNotIn(term, self.lower_text)

    def test_document_avoids_private_references(self) -> None:
        for parts in PRIVATE_REFERENCE_PARTS:
            snippet = "".join(parts)
            with self.subTest(snippet=snippet):
                self.assertNotIn(snippet, self.lower_text)

        for snippet in PRIVATE_PATH_SNIPPETS:
            with self.subTest(snippet=snippet):
                self.assertNotIn(snippet, self.lower_text)

        drive_letter_pattern = re.compile(r"(?<![A-Za-z0-9])[A-Za-z]:[\\/]")
        self.assertIsNone(drive_letter_pattern.search(self.text))


if __name__ == "__main__":
    unittest.main()
