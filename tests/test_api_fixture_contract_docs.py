from __future__ import annotations

import re
import unittest
from pathlib import Path

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
DOC_PATH = ROOT / "docs" / "api-fixture-contracts.md"

EXPECTED_SECTIONS = (
    "# API Fixture Contract Checks",
    "## Fixture Bundle Purpose",
    "## Local Execution Expectations",
    "## Route And OpenAPI Drift",
    "## Schema Fixture Alignment",
    "## Command Entrypoints",
    "## Review Checklist",
)

EXPECTED_COMMANDS = (
    "python scripts/fixture_drift.py --json",
    "npm run fixtures:check",
    (
        "node packages\\cli\\src\\index.ts ingest api verify --fixture "
        "examples\\ingest-search\\api-requests.json --openapi docs\\openapi.yaml"
    ),
)

EXPECTED_REFERENCES = (
    "`docs/openapi.yaml`",
    "`scripts/openapi_fixture_contract.py`",
    "`tests/test_openapi_fixture_contract.py`",
    "`packages/schemas/fixtures`",
    "`fixture://`",
    "`file://`",
    "`stdin://`",
    "`workspace://`",
    "`local://`",
)

EXPECTED_CONTRACT_PHRASES = (
    "checked-in local fixture bundles",
    "must not make live network calls",
    "must not write durable application records",
    "repository-relative",
    "loopback host only",
    "Every fixture route method and path must map",
    "Expected success statuses must appear",
    "Path parameters are compared by route template",
    "Generated JSON schema fixtures",
    "should not be hand-edited",
    "redaction placeholders",
)

PRIVATE_MARKERS = (
    "".join(("sovereignops", "-codex", "-pack")),
    "e:\\" + "".join(("sovereignops", "-codex", "-pack")),
    "e:/" + "".join(("sovereignops", "-codex", "-pack")),
    "." + "codex-private",
    "plan" + "-pack",
    "private " + "plan " + "pack",
)


class ApiFixtureContractDocsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.text = DOC_PATH.read_text(encoding="utf-8")
        cls.lower_text = cls.text.lower()

    def test_documents_required_sections_commands_and_references(self) -> None:
        self.assertTrue(DOC_PATH.is_file())

        for section in EXPECTED_SECTIONS:
            with self.subTest(section=section):
                self.assertIn(section, self.text)

        for command in EXPECTED_COMMANDS:
            with self.subTest(command=command):
                self.assertIn(command, self.text)

        for reference in EXPECTED_REFERENCES:
            with self.subTest(reference=reference):
                self.assertIn(reference, self.text)

    def test_documents_fixture_contract_scope(self) -> None:
        for phrase in EXPECTED_CONTRACT_PHRASES:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.text)

    def test_document_avoids_private_marker_leakage_and_restricted_terms(self) -> None:
        for marker in PRIVATE_MARKERS:
            with self.subTest(marker=marker):
                self.assertNotIn(marker, self.lower_text)

        restricted_terms = sorted({"".join(parts) for parts in RESTRICTED_PUBLIC_TERM_PARTS})
        for term in restricted_terms:
            with self.subTest(term=term):
                if term.isascii():
                    escaped = re.escape(term).replace(r"\ ", r"\s+")
                    pattern = re.compile(rf"(?<![a-z0-9_]){escaped}(?![a-z0-9_])")
                    self.assertIsNone(pattern.search(self.lower_text))
                else:
                    self.assertNotIn(term, self.lower_text)


if __name__ == "__main__":
    unittest.main()
