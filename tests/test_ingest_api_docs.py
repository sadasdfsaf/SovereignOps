from __future__ import annotations

import json
import re
import unittest
from pathlib import Path
from typing import Any

from scripts.repo_health import RESTRICTED_PUBLIC_TERM_PARTS


ROOT = Path(__file__).resolve().parents[1]
DOC_PATH = ROOT / "docs" / "ingest-api.md"
EXAMPLE_PATH = ROOT / "examples" / "ingest-search" / "api-requests.json"

EXPECTED_HEADINGS = (
    "# Ingest/Search API",
    "## Scope",
    "## Routes",
    "## Request Envelope",
    "## Response Envelope",
    "## Allowed Local-First Workflows",
    "## Request And Response Examples",
    "## Quarantine Review",
    "## Validation Commands",
)

EXPECTED_ROUTES = (
    "POST /v1/ingest/normalize",
    "POST /v1/ingest/structured",
    "POST /v1/ingest/repository/scan",
    "POST /v1/search/query",
    "POST /v1/quarantine/cases",
    "POST /v1/quarantine/cases/:caseId/decision",
)

EXPECTED_COMMANDS = (
    "python -m json.tool examples\\ingest-search\\api-requests.json",
    "python -m unittest tests.test_ingest_api_docs",
    "python -m unittest tests.test_ingest_search_docs",
    "python -m unittest discover -s services\\ingest\\tests",
)

LOCAL_SOURCE_SCHEMES = ("fixture://", "file://", "stdin://", "workspace://", "local://")
LOCAL_HTTP_PREFIXES = ("http://127.0.0.1", "http://localhost", "http://[::1]")
CHECKSUM_PATTERN = re.compile(r"^[0-9a-f]{64}$")
SENSITIVE_VALUE_PATTERNS = (
    re.compile(r"sk-[A-Za-z0-9]{20,}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9_]{20,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~-]{12,}"),
    re.compile(r"(?i)(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S{4,}"),
)


class IngestApiDocsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.doc_text = DOC_PATH.read_text(encoding="utf-8")
        cls.lower_doc_text = cls.doc_text.lower()
        cls.examples = json.loads(EXAMPLE_PATH.read_text(encoding="utf-8"))
        cls.example_text = EXAMPLE_PATH.read_text(encoding="utf-8")

    def test_doc_has_required_headings_routes_commands_and_example_link(self) -> None:
        self.assertTrue(DOC_PATH.is_file())
        self.assertIn("`examples/ingest-search/api-requests.json`", self.doc_text)

        for heading in EXPECTED_HEADINGS:
            with self.subTest(heading=heading):
                self.assertIn(heading, self.doc_text)

        for route in EXPECTED_ROUTES:
            with self.subTest(route=route):
                self.assertIn(f"`{route}`", self.doc_text)

        for command in EXPECTED_COMMANDS:
            with self.subTest(command=command):
                self.assertIn(command, self.doc_text)

        self.assertNotIn("curl ", self.lower_doc_text)
        self.assertNotIn("npx ", self.lower_doc_text)
        self.assertNotIn("npm install -g", self.lower_doc_text)

    def test_example_json_has_expected_routes_and_envelopes(self) -> None:
        self.assertTrue(EXAMPLE_PATH.is_file())
        self.assertEqual(self.examples["schemaVersion"], "ingest-search-api-requests.v1")
        self.assertRegex(self.examples["generatedAt"], r"^2026-04-27T\d\d:\d\d:\d\d\.000Z$")
        self.assertTrue(self.examples["apiBase"].startswith(LOCAL_HTTP_PREFIXES))

        requests = self.examples["requests"]
        self.assertEqual(len(requests), 6)
        self.assertEqual(len({item["id"] for item in requests}), len(requests))

        route_keys = {f"{item['route']['method']} {item['route']['path']}" for item in requests}
        for route in EXPECTED_ROUTES[:-1]:
            with self.subTest(route=route):
                self.assertIn(route, route_keys)

        decision_route = next(
            item for item in requests if item["id"] == "api_quarantine_decision"
        )["route"]
        self.assertEqual(decision_route["method"], "POST")
        self.assertRegex(
            decision_route["path"],
            r"^/v1/quarantine/cases/[A-Za-z0-9_.-]+/decision$",
        )

        for item in requests:
            with self.subTest(item=item["id"]):
                self.assertEqual(item["route"]["method"], "POST")
                self.assertTrue(item["route"]["path"].startswith("/v1/"))
                self.assertIn("body", item["request"])
                self.assertIn("status", item["response"])
                self.assertIn("body", item["response"])
                self.assertEqual(item["response"]["status"], 200)
                self.assertTrue(item["response"]["body"]["ok"])

    def test_examples_are_local_first_and_reference_known_fixtures(self) -> None:
        for source_uri in _walk_values(self.examples, "sourceUri"):
            with self.subTest(source_uri=source_uri):
                self.assertTrue(source_uri.startswith(LOCAL_SOURCE_SCHEMES), source_uri)
                self.assertFalse(source_uri.startswith(("http://", "https://")), source_uri)

        for value in _walk_strings(self.examples):
            with self.subTest(value=value[:40]):
                if value.startswith("http://"):
                    self.assertTrue(value.startswith(LOCAL_HTTP_PREFIXES), value)
                self.assertNotIn("https://", value)

        repository = _request_by_id(self.examples, "api_ingest_repository_scan")
        include_paths = repository["request"]["body"]["options"]["includePaths"]
        self.assertEqual(include_paths, ["notes.md", "records.csv", "records.json"])
        for relative_path in include_paths:
            self.assertFalse(Path(relative_path).is_absolute())
            self.assertNotIn("..", Path(relative_path).parts)
            self.assertTrue((ROOT / "examples" / "ingest-search" / relative_path).is_file())

    def test_examples_preserve_search_citations_checksums_and_quarantine_flow(self) -> None:
        search = _request_by_id(self.examples, "api_search_query")
        result = search["response"]["body"]["results"][0]
        self.assertEqual(result["id"], "idx_json_beta")
        self.assertEqual(result["matchedTerms"], ["checksum"])
        self.assertRegex(result["checksum"], CHECKSUM_PATTERN)
        self.assertTrue(result["untrusted"])
        self.assertEqual(result["quarantineState"], "clear")
        self.assertEqual(result["citations"][0]["range"], {"path": "$.items[1].summary"})
        self.assertFalse(result["citations"][0]["trusted"])

        structured = _request_by_id(self.examples, "api_ingest_structured_csv")
        summary = structured["response"]["body"]["summary"]
        self.assertEqual(summary["documentCount"], 3)
        self.assertEqual(summary["indexedCount"], 2)
        self.assertEqual(summary["quarantineCount"], 1)
        held_item = structured["response"]["body"]["quarantine"]["items"][0]
        self.assertEqual(held_item["quarantineState"], "open")
        self.assertEqual(held_item["citation"]["range"], {"row": 3, "column": "status"})

        cases = _request_by_id(self.examples, "api_quarantine_cases")
        case = cases["response"]["body"]["cases"][0]
        self.assertEqual(case["state"], "open")
        self.assertEqual(case["allowedActions"], ["release", "reject"])
        self.assertEqual(case["reasonCodes"], ["needs_local_review"])

        decision = _request_by_id(self.examples, "api_quarantine_decision")
        case_response = decision["response"]["body"]["case"]
        self.assertEqual(case_response["fromState"], "open")
        self.assertEqual(case_response["state"], "released")
        self.assertEqual(case_response["decision"]["action"], "release")
        self.assertEqual(case_response["decision"]["actorId"], "local_reviewer")
        self.assertFalse(case_response["decision"]["override"])

    def test_docs_and_examples_avoid_restricted_or_sensitive_content(self) -> None:
        for path in (DOC_PATH, EXAMPLE_PATH):
            with self.subTest(path=path.name):
                _assert_no_restricted_terms(self, path)

        for value in _walk_strings(self.examples):
            with self.subTest(value=value[:40]):
                for pattern in SENSITIVE_VALUE_PATTERNS:
                    self.assertIsNone(pattern.search(value))


def _request_by_id(examples: dict[str, Any], request_id: str) -> dict[str, Any]:
    for item in examples["requests"]:
        if item["id"] == request_id:
            return item
    raise AssertionError(f"missing request id: {request_id}")


def _walk_values(value: Any, key: str) -> list[Any]:
    values: list[Any] = []
    if isinstance(value, dict):
        for item_key, item_value in value.items():
            if item_key == key:
                values.append(item_value)
            values.extend(_walk_values(item_value, key))
    elif isinstance(value, list):
        for item in value:
            values.extend(_walk_values(item, key))
    return values


def _walk_strings(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        strings: list[str] = []
        for item in value.values():
            strings.extend(_walk_strings(item))
        return strings
    if isinstance(value, list):
        strings = []
        for item in value:
            strings.extend(_walk_strings(item))
        return strings
    return []


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


if __name__ == "__main__":
    unittest.main()
