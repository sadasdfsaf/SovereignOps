from __future__ import annotations

import csv
import hashlib
import json
import re
import unittest
from pathlib import Path
from typing import Any

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
DOC_PATH = ROOT / "docs" / "ingest-search.md"
FIXTURE_ROOT = ROOT / "examples" / "ingest-search"

SOURCE_FILES = ("notes.md", "records.csv", "records.json")
JSON_FIXTURES = (
    "repository.json",
    "ingest-log.json",
    "records.json",
    "search-index.json",
    "quarantine.json",
)

REQUIRED_DOC_PHRASES = (
    "local-first",
    "untrusted input handling",
    "citations",
    "checksums",
    "quarantine",
    "local-only operation",
)

REQUIRED_DOC_SECTIONS = (
    "# Ingest And Search",
    "## Local-Only Operation",
    "## Repository Store",
    "## Log Workflow",
    "## Markdown, JSON, And CSV Sources",
    "## Search Index",
    "## Citations",
    "## Quarantine",
    "## CLI Workflows",
    "## Validation Rules",
)

REQUIRED_COMMANDS = (
    "python -m services.ingest.src.sovereignops_ingest.cli parse-markdown",
    "python -m services.ingest.src.sovereignops_ingest.cli parse-csv",
    "python -m services.ingest.src.sovereignops_ingest.cli checksum",
    "python -m unittest tests.test_ingest_search_docs",
    "python -m unittest discover -s services\\ingest\\tests",
    "python scripts\\repo_health.py --json",
)

CHECKSUM_PATTERN = re.compile(r"^[0-9a-f]{64}$")
LOCAL_URI_PATTERN = re.compile(r"^fixture://ingest-search/[A-Za-z0-9_.-]+$")
SENSITIVE_VALUE_PATTERNS = (
    re.compile(r"sk-[A-Za-z0-9]{20,}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9_]{20,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~-]{12,}"),
    re.compile(r"(?i)(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S{4,}"),
)


class IngestSearchDocsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.text = DOC_PATH.read_text(encoding="utf-8")
        cls.lower_text = cls.text.lower()
        cls.repository = _load_json("repository.json")
        cls.sources_by_uri = {
            source["sourceUri"]: source for source in cls.repository["sources"]
        }

    def test_documents_required_sections_language_and_commands(self) -> None:
        self.assertTrue(DOC_PATH.exists())
        for section in REQUIRED_DOC_SECTIONS:
            with self.subTest(section=section):
                self.assertIn(section, self.text)

        for phrase in REQUIRED_DOC_PHRASES:
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, self.lower_text)

        for command in REQUIRED_COMMANDS:
            with self.subTest(command=command):
                self.assertIn(command, self.text)

        for name in SOURCE_FILES + JSON_FIXTURES:
            with self.subTest(name=name):
                self.assertIn(f"`examples/ingest-search/{name}`", self.text)

        self.assertNotIn("curl ", self.lower_text)
        self.assertNotIn("https://", self.lower_text)
        self.assertNotIn("npx ", self.lower_text)

    def test_docs_and_fixtures_avoid_restricted_terms(self) -> None:
        paths = [DOC_PATH, *sorted(FIXTURE_ROOT.iterdir())]
        for path in paths:
            with self.subTest(path=path.name):
                _assert_no_restricted_terms(self, path)

    def test_fixture_files_are_parseable_and_safe(self) -> None:
        for name in SOURCE_FILES + JSON_FIXTURES:
            with self.subTest(name=name):
                self.assertTrue((FIXTURE_ROOT / name).is_file())

        for name in JSON_FIXTURES:
            with self.subTest(json_fixture=name):
                value = _load_json(name)
                _assert_no_sensitive_values(self, value, name)

        with (FIXTURE_ROOT / "records.csv").open(newline="", encoding="utf-8") as handle:
            rows = list(csv.reader(handle))
        self.assertEqual(rows[0], ["id", "title", "owner", "status"])
        self.assertEqual(len(rows), 4)

        markdown = (FIXTURE_ROOT / "notes.md").read_text(encoding="utf-8")
        self.assertIn("# Notebook Import", markdown)
        self.assertIn("## Batch A", markdown)
        self.assertIn("## Batch B", markdown)

    def test_repository_checksums_match_source_bytes(self) -> None:
        self.assertEqual(self.repository["schemaVersion"], "ingest-search-repository.v1")
        self.assertEqual(self.repository["workspaceId"], "wsp_ingest_demo")

        seen_uris: set[str] = set()
        for source in self.repository["sources"]:
            with self.subTest(source=source["sourceUri"]):
                source_uri = source["sourceUri"]
                source_path = source["path"]
                checksum = source["checksum"]

                self.assertRegex(source_uri, LOCAL_URI_PATTERN)
                self.assertNotIn(source_uri, seen_uris)
                seen_uris.add(source_uri)
                self.assertRegex(checksum, CHECKSUM_PATTERN)
                self.assertIn(source["mediaType"], {"text/markdown", "text/csv", "application/json"})
                self.assertIn(source["state"], {"indexed", "partly_quarantined"})

                path = _safe_fixture_path(source_path)
                self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), checksum)

    def test_log_index_and_quarantine_reference_repository_sources(self) -> None:
        log = _load_json("ingest-log.json")
        indexed = _load_json("search-index.json")
        quarantine = _load_json("quarantine.json")

        self.assertEqual(log["schemaVersion"], "ingest-search-log.v1")
        self.assertEqual(indexed["schemaVersion"], "ingest-search-index.v1")
        self.assertEqual(quarantine["schemaVersion"], "ingest-search-quarantine.v1")

        for entry in log["entries"]:
            with self.subTest(log_entry=entry["id"]):
                source = self.sources_by_uri[entry["sourceUri"]]
                self.assertEqual(entry["checksum"], source["checksum"])
                self.assertGreaterEqual(entry["documentsIndexed"], 0)
                self.assertGreaterEqual(entry["quarantinedItems"], 0)

        for document in indexed["documents"]:
            with self.subTest(index_document=document["id"]):
                source = self.sources_by_uri[document["sourceUri"]]
                self.assertEqual(document["checksum"], source["checksum"])
                self.assertTrue(document["untrusted"])
                self.assertEqual(document["quarantineState"], "clear")
                self.assertGreaterEqual(len(document["citations"]), 1)
                for citation in document["citations"]:
                    _assert_citation_targets_source(self, citation, self.sources_by_uri)

        for item in quarantine["items"]:
            with self.subTest(quarantine_item=item["id"]):
                source = self.sources_by_uri[item["sourceUri"]]
                self.assertEqual(item["checksum"], source["checksum"])
                self.assertTrue(item["untrusted"])
                self.assertEqual(item["reasonCode"], "needs_local_review")
                _assert_citation_targets_source(self, item["citation"], self.sources_by_uri)

    def test_sources_cover_markdown_json_and_csv_workflows(self) -> None:
        media_types = {source["mediaType"] for source in self.repository["sources"]}
        self.assertEqual(media_types, {"text/markdown", "text/csv", "application/json"})

        records = _load_json("records.json")
        self.assertEqual(records["collection"], "notes-lab")
        self.assertEqual([item["id"] for item in records["items"]], ["json_alpha", "json_beta"])


def _safe_fixture_path(relative_path: str) -> Path:
    path = ROOT / relative_path
    resolved = path.resolve()
    fixture_root = FIXTURE_ROOT.resolve()
    if fixture_root not in resolved.parents:
        raise AssertionError(f"path escapes fixture root: {relative_path}")
    return resolved


def _load_json(name: str) -> Any:
    return json.loads((FIXTURE_ROOT / name).read_text(encoding="utf-8"))


def _assert_no_restricted_terms(testcase: unittest.TestCase, path: Path) -> None:
    text = path.read_text(encoding="utf-8").lower()
    restricted_terms = sorted({"".join(parts) for parts in RESTRICTED_PUBLIC_TERM_PARTS})
    for term in restricted_terms:
        if term.isascii():
            escaped = re.escape(term).replace(r"\ ", r"\s+")
            pattern = re.compile(rf"(?<![a-z0-9_]){escaped}(?![a-z0-9_])")
            testcase.assertIsNone(pattern.search(text), f"{path} contains restricted wording")
        else:
            testcase.assertNotIn(term, text, f"{path} contains restricted wording")


def _assert_no_sensitive_values(testcase: unittest.TestCase, value: Any, path: str) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            _assert_no_sensitive_values(testcase, item, f"{path}.{key}")
        return
    if isinstance(value, list):
        for index, item in enumerate(value):
            _assert_no_sensitive_values(testcase, item, f"{path}[{index}]")
        return
    if isinstance(value, str):
        for pattern in SENSITIVE_VALUE_PATTERNS:
            testcase.assertIsNone(pattern.search(value), f"{path} contains a sensitive-shaped value")


def _assert_citation_targets_source(
    testcase: unittest.TestCase,
    citation: dict[str, Any],
    sources_by_uri: dict[str, dict[str, Any]],
) -> None:
    source = sources_by_uri[citation["sourceUri"]]
    source_path = _safe_fixture_path(source["path"])
    citation_range = citation["range"]
    testcase.assertFalse(citation["trusted"])

    if "start_line" in citation_range:
        lines = source_path.read_text(encoding="utf-8").splitlines()
        start = citation_range["start_line"]
        end = citation_range["end_line"]
        testcase.assertGreaterEqual(start, 1)
        testcase.assertGreaterEqual(end, start)
        testcase.assertLessEqual(end, len(lines))
        return

    if "row" in citation_range:
        with source_path.open(newline="", encoding="utf-8") as handle:
            rows = list(csv.reader(handle))
        row = citation_range["row"]
        testcase.assertGreaterEqual(row, 1)
        testcase.assertLessEqual(row, len(rows))
        column = citation_range.get("column")
        if isinstance(column, str):
            testcase.assertIn(column, rows[0])
        elif isinstance(column, int):
            testcase.assertGreaterEqual(column, 1)
            testcase.assertLessEqual(column, len(rows[0]))
        return

    if "path" in citation_range:
        value = json.loads(source_path.read_text(encoding="utf-8"))
        testcase.assertIsNotNone(_resolve_json_path(value, citation_range["path"]))
        return

    testcase.fail(f"citation range does not identify a source location: {citation_range}")


def _resolve_json_path(value: Any, path: str) -> Any:
    if not path.startswith("$"):
        raise AssertionError(f"invalid JSON path: {path}")
    index = 1
    current = value
    token_pattern = re.compile(r"\.([A-Za-z_][A-Za-z0-9_]*)|\[(\d+)\]")
    while index < len(path):
        match = token_pattern.match(path, index)
        if match is None:
            raise AssertionError(f"invalid JSON path: {path}")
        key, item_index = match.groups()
        if key is not None:
            current = current[key]
        else:
            current = current[int(item_index)]
        index = match.end()
    return current


if __name__ == "__main__":
    unittest.main()
