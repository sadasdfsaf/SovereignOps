from __future__ import annotations

import re
import unittest
from pathlib import Path
from typing import Optional

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
ADR_DIR = ROOT / "docs" / "adr"
TEMPLATE_PATH = ADR_DIR / "000-template.md"
INITIAL_ADR_PATH = ADR_DIR / "001-local-first-event-model.md"

REQUIRED_SECTIONS = (
    "## Status",
    "## Context",
    "## Decision",
    "## Consequences",
    "## Privacy and Security Rationale",
    "## Validation",
)

INITIAL_ADR_REQUIRED_TEXT = (
    "# ADR 001: Local-First Event Model",
    "append-only events",
    "monotonic per-workspace sequence number",
    "payload digest",
    "previous-event link",
    "Local storage owns the first durable write.",
    "opaque encrypted bundles",
    "Derived views",
    "deterministic replay",
    "concurrent branch classification",
)

INTERNAL_REFERENCE_PARTS = (
    (".co", "dex-", "private"),
    ("cod", "ex", "-", "pack"),
    ("run", "log"),
)


class AdrDocsTests(unittest.TestCase):
    def test_template_documents_required_sections(self) -> None:
        text = TEMPLATE_PATH.read_text(encoding="utf-8")

        self.assertIn("# ADR 000: Template", text)
        assert_sections_in_order(self, text)
        self.assertIn("privacy expectations", text)
        self.assertIn("auditability", text)

    def test_initial_adr_documents_local_first_event_model(self) -> None:
        text = INITIAL_ADR_PATH.read_text(encoding="utf-8")

        assert_sections_in_order(self, text)
        for expected in INITIAL_ADR_REQUIRED_TEXT:
            with self.subTest(expected=expected):
                self.assertIn(expected, text)

    def test_initial_adr_sections_have_content(self) -> None:
        text = INITIAL_ADR_PATH.read_text(encoding="utf-8")
        sections = split_sections(text)

        for section in REQUIRED_SECTIONS:
            with self.subTest(section=section):
                body = sections[section].strip()
                self.assertNotEqual(body, "")

    def test_adr_docs_avoid_forbidden_references(self) -> None:
        restricted_terms = sorted({"".join(parts) for parts in RESTRICTED_PUBLIC_TERM_PARTS})
        internal_terms = sorted({"".join(parts) for parts in INTERNAL_REFERENCE_PARTS})

        for path in (TEMPLATE_PATH, INITIAL_ADR_PATH):
            text = path.read_text(encoding="utf-8").lower()
            with self.subTest(path=path.name):
                for term in restricted_terms:
                    self.assertIsNone(match_term(term, text), term)
                for term in internal_terms:
                    self.assertNotIn(term, text)


def assert_sections_in_order(test_case: unittest.TestCase, text: str) -> None:
    positions = []
    for section in REQUIRED_SECTIONS:
        test_case.assertIn(section, text)
        positions.append(text.index(section))

    test_case.assertEqual(positions, sorted(positions))


def split_sections(text: str) -> dict[str, str]:
    sections: dict[str, str] = {}
    for index, section in enumerate(REQUIRED_SECTIONS):
        start = text.index(section) + len(section)
        if index + 1 < len(REQUIRED_SECTIONS):
            end = text.index(REQUIRED_SECTIONS[index + 1])
        else:
            end = len(text)
        sections[section] = text[start:end]
    return sections


def match_term(term: str, text: str) -> Optional[re.Match[str]]:
    if term.isascii():
        escaped = re.escape(term).replace(r"\ ", r"\s+")
        return re.compile(rf"(?<![a-z0-9_]){escaped}(?![a-z0-9_])").search(text)
    return re.search(re.escape(term), text)


if __name__ == "__main__":
    unittest.main()
