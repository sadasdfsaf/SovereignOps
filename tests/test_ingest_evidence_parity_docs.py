from __future__ import annotations

import re
import unittest
from pathlib import Path

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
DOC_PATH = ROOT / "docs" / "ingest-evidence-parity.md"

REQUIRED_DOC_SECTIONS = (
    "# Ingest Evidence Parity",
    "## Parity Contract",
    "## Schema Validator",
    "## Package Helper",
    "## API Routes",
    "## SDK Client And Local Helper",
    "## CLI Commands",
    "## Web Review Model",
    "## Redaction And Local-Only Guardrails",
    "## Validation Commands",
)

REQUIRED_SURFACE_FILES = (
    "packages/schemas/src/ingestEvidence.ts",
    "packages/schemas/tests/ingest-evidence.test.mjs",
    "packages/ingest-evidence/src/index.ts",
    "packages/ingest-evidence/tests/ingest-evidence.test.mjs",
    "apps/api/src/ingestEvidenceRoutes.ts",
    "apps/api/tests/ingest-evidence-routes.test.mjs",
    "packages/sdk-js/src/localIngestEvidence.ts",
    "packages/sdk-js/src/index.ts",
    "packages/sdk-js/tests/local-ingest-evidence.test.mjs",
    "packages/cli/src/ingestEvidence.ts",
    "packages/cli/src/index.ts",
    "packages/cli/tests/ingest-evidence.test.mjs",
    "apps/web/src/ingestSessionReview.ts",
    "apps/web/tests/ingest-session-review.test.mjs",
    "docs/ingest-evidence-export.md",
    "examples/ingest-search/audit-evidence.json",
    "examples/ingest-search/evidence-export-session.json",
)

REQUIRED_COMMANDS = (
    r"node packages\cli\src\index.ts ingest evidence summary --input examples\ingest-search\audit-evidence.json",
    r"node packages\cli\src\index.ts ingest evidence export --input examples\ingest-search\audit-evidence.json --format jsonl",
    r"node packages\cli\src\index.ts ingest evidence export --input examples\ingest-search\audit-evidence.json --format csv",
    r"node packages\cli\src\index.ts ingest evidence package --input examples\ingest-search\audit-evidence.json",
    "python -m unittest tests.test_ingest_evidence_parity_docs",
    r"python -m json.tool examples\ingest-search\audit-evidence.json",
    r"python -m json.tool examples\ingest-search\evidence-export-session.json",
    "npm.cmd --workspace @sovereignops/schemas run check",
    "npm.cmd --workspace @sovereignops/ingest-evidence run check",
    "npm.cmd --workspace @sovereignops/api run check",
    "npm.cmd --workspace @sovereignops/sdk-js run check",
    "npm.cmd --workspace @sovereignops/cli run check",
    "npm.cmd --workspace @sovereignops/web run check",
)

REQUIRED_PHRASES = (
    "No live server is required",
    "do not read files",
    "does not fetch evidence",
    "workspace-local `.json` evidence files only",
    "fixture://ingest-search/",
    "examples/ingest-search/",
    "validateIngestEvidence",
    "createIngestEvidencePackage",
    "buildLocalIngestEvidenceExportPreview",
    "buildIngestSessionReview",
    "ingest-evidence.export",
    "ingest-evidence.package",
    "ingest-evidence.export-preview",
)

FORBIDDEN_DOC_WORDING = (
    "https://",
    "http://",
    "curl ",
    "npx ",
    "npm install -g",
    "global install",
    "localhost",
    "127.0.0.1",
    "invoke-restmethod",
    "start-process",
    "sovereignops-codex-pack",
    ".codex-private",
)

PATH_REF_PREFIXES = ("apps/", "docs/", "examples/", "packages/", "tests/")


class IngestEvidenceParityDocsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.doc_text = DOC_PATH.read_text(encoding="utf-8")
        cls.lower_doc_text = cls.doc_text.lower()

    def test_document_covers_required_sections_and_surfaces(self) -> None:
        self.assertTrue(DOC_PATH.exists())

        for section in REQUIRED_DOC_SECTIONS:
            with self.subTest(section=section):
                self.assertIn(section, self.doc_text)

        for phrase in REQUIRED_PHRASES:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase.lower(), self.lower_doc_text)

    def test_referenced_files_exist_and_are_named_in_doc(self) -> None:
        for relative_path in REQUIRED_SURFACE_FILES:
            with self.subTest(relative_path=relative_path):
                self.assertTrue((ROOT / relative_path).is_file(), relative_path)
                self.assertIn(f"`{relative_path}`", self.doc_text)

        for relative_path in _backticked_file_refs(self.doc_text):
            with self.subTest(backticked_ref=relative_path):
                path = (ROOT / relative_path).resolve()
                self.assertTrue(_is_inside_root(path), relative_path)
                self.assertTrue(path.exists(), relative_path)

    def test_validation_commands_are_exact_and_local(self) -> None:
        for command in REQUIRED_COMMANDS:
            with self.subTest(command=command):
                self.assertIn(command, self.doc_text)
                lowered = command.lower()
                for forbidden in FORBIDDEN_DOC_WORDING:
                    self.assertNotIn(forbidden, lowered)

    def test_doc_uses_local_only_guardrails(self) -> None:
        for forbidden in FORBIDDEN_DOC_WORDING:
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, self.lower_doc_text)

        self.assertIn("no live server is required", self.lower_doc_text)
        self.assertRegex(self.lower_doc_text, r"network\s+locations")
        self.assertIn("parent-directory traversal", self.lower_doc_text)
        self.assertIn("private workspace paths", self.lower_doc_text)
        self.assertIn("redacted", self.lower_doc_text)

    def test_doc_avoids_guarded_terms(self) -> None:
        _assert_no_guarded_terms(self, DOC_PATH)


def _backticked_file_refs(text: str) -> set[str]:
    refs: set[str] = set()
    for value in re.findall(r"`([^`]+)`", text):
        normalized = value.replace("\\", "/")
        if normalized.startswith(PATH_REF_PREFIXES):
            refs.add(normalized)
    return refs


def _is_inside_root(path: Path) -> bool:
    root = ROOT.resolve()
    return path == root or root in path.parents


def _assert_no_guarded_terms(testcase: unittest.TestCase, path: Path) -> None:
    text = path.read_text(encoding="utf-8").lower()
    guarded_terms = sorted({"".join(parts) for parts in RESTRICTED_PUBLIC_TERM_PARTS})
    for term in guarded_terms:
        if term.isascii():
            escaped = re.escape(term).replace(r"\ ", r"\s+")
            pattern = re.compile(rf"(?<![a-z0-9_]){escaped}(?![a-z0-9_])")
            testcase.assertIsNone(pattern.search(text), f"{path} contains guarded wording")
        else:
            testcase.assertNotIn(term, text, f"{path} contains guarded wording")


if __name__ == "__main__":
    unittest.main()
