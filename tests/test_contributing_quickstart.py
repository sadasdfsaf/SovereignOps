from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTRIBUTING = ROOT / "CONTRIBUTING.md"
QUICKSTART = ROOT / "docs" / "development-quickstart.md"


class ContributingQuickstartDocsTests(unittest.TestCase):
    def test_required_commands_are_documented(self) -> None:
        text = combined_docs()

        required_commands = [
            "python scripts\\smoke.py",
            "python scripts/smoke.py",
            "python -m unittest discover -s tests",
            "python scripts\\env_guard.py",
            "python scripts\\rust_guard.py",
            "python scripts\\public_boundary_guard.py --json",
            "python scripts\\repo_health.py --json",
            "python scripts\\validate_openapi.py",
            "python scripts\\validate_mcp_gateway_fixtures.py",
            "node scripts/node-check.mjs",
            "cargo check --workspace",
            "cargo test --workspace",
            "pnpm -r --if-present check",
        ]

        for command in required_commands:
            with self.subTest(command=command):
                self.assertIn(command, text)

    def test_toolchain_and_shell_notes_are_documented(self) -> None:
        text = QUICKSTART.read_text(encoding="utf-8")

        required_phrases = [
            "Python 3.9 or newer",
            "Node.js 22 or newer",
            "Rust 1.76 or newer",
            "Git Bash",
            "PowerShell",
            "Use backslashes in PowerShell",
            "Use forward slashes in Git Bash",
            "Rust-source guard fallback",
        ]

        for phrase in required_phrases:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

    def test_guardrails_and_no_secret_examples_are_documented(self) -> None:
        text = combined_docs()

        required_phrases = [
            "local boundary check",
            "Do not commit `.env`, `.env.*`, `.venv/`",
            "Do not copy local plan packs",
            "SERVICE_TOKEN=",
            "LOCAL_DATA_DIR=.sovereignops-data",
            "Do not add real tokens, keys, credentials",
            "Avoid realistic tokens, keys, passwords",
        ]

        for phrase in required_phrases:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)


def combined_docs() -> str:
    return "\n".join(
        path.read_text(encoding="utf-8")
        for path in (
            CONTRIBUTING,
            QUICKSTART,
        )
    )


if __name__ == "__main__":
    unittest.main()
